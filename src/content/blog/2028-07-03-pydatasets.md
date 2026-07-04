---
title: "PyDatasets for Icechunk and Keras on an HPC"
subtitle: "Speeding up model training while keeping metadata intact"
date: 2026-07-03
description: "A post detailing how to use PyDataset with Icechunk data, both populated and a virtual store."
tags: ["icechunk", "zarr", "keras", "machine learning", "geospatial", "tensors"]
---

</br>

I've been utilizing the University of Oklahoma supercomputer, soon-to-be called Sooner (previously called Schooner) to update [FrontFinder](https://doi.org/10.1175/AIES-D-24-0043.1) (Justin et al. 2025) for NOAA. The model is *really cool*, with the ability to probabilistically infer where cold, warm, stationary, and occluded fronts are along with drylines. 

![FrontFinder output for the 2023 Christmas winter storm in the eastern US](../../assets/blog/frontfinder_example.png 'FrontFinder output for the 2023 Christmas winter storm in the eastern US, Figure 14 in the paper')  

I stuck with TensorFlow/Keras as that was what this model was built with. Despite TF's less-than-stellar documentation (and Keras' as well, surprisingly), I was able to figure out a fairly quick pipeline to feed data from their native location in Icechunk stores to a `PyDataset`.

# Managing Data

The data left on storage was in both netCDFs and TFRecords. Training a new version of the model with this data was ridiculously quick with the TFRecords, but left a few serious issues on the table:

1. **Verification**: There was no way to verify the TFRecord data followed the generation and augmentation logic in the paper. The only way to estimate the method the data was created with was from the dates `ls` provided
2. **Reverse Engineering**: I would have to try to insert code for any new variables and likely rebuild both datasets from scratch
3. **No Versioning or Documentation in the Data**: There were undocumented changes in data and code between publication and when I started
4. **Implicity**: The data used to train the model would have been implicit for a model that NOAA is using to augment decision-making (and IMHO should be as explicit as possible)

I decided that it was the right move to utilize Icechunk for storing the data locally on the HPC and make as much of an attempt to train the data on that store as possible. [Noah Brenowitz's article on loading netCDFs](https://www.noahbrenowitz.com/post/loading_netcdfs/) in TensorFlow was a great starting point to work on this. I pretty quickly ran into OOM memory issues on top of managing competing processes between Dask, Icechunk's rust backend, and the TensorFlow data API backend. I was left wondering:

* Should I drop Icechunk and generate TFRecord data that's governed somewhere upstream?
* How do I manage these competing backends?
* Why are smaller batches eventually causing OOM issues later on in the epochs?

I had run into [a documented issue](https://github.com/tensorflow/tensorflow/issues/72014) using tf.data that was causing the OOM issues. I started looking through the TF documentation to find a utility called a [PyDataset](https://www.tensorflow.org/api_docs/python/tf/keras/utils/PyDataset) in the Keras API. Turns out, it was the key and what I am now using in my pipeline. 

It was also fundamental to use the Icechunk backend to manage the flow, avoiding dask entirely. For some reason, even using [`dask-jobqueue`](https://jobqueue.dask.org/en/latest/) with SLURM was *incredibly* slow. Watching the xarray backend fetching datasets at a snail's pace, despite 32, 64, even 96 workers/CPUs available and in use, was not good. This issue was unique to the HPC, having used GCP VMs before without the same problem.
# PyDataset vs tf.data

What differentiates a `PyDataset` from a `tf.data.Dataset` is that the data preprocessing can (should) occur inside the `PyDataset` instance. Both have poor documentation.

See the [Keras documentation](https://keras.io/api/utils/preprocessing_utils/#pydataset-class) versus the [TensorFlow documentation](https://www.tensorflow.org/api_docs/python/tf/keras/utils/PyDataset). The TF documentation is clearly better, but you'd also miss out on some important notes if you didn't look through the Keras documentation, such as the ability to use `on_epoch_begin` as well as `on_epoch_end`, or:

> keras.utils.PyDataset is a utility that you can subclass to obtain > a Python generator with two important properties:
> * It works well with multiprocessing.
> * It can be shuffled (e.g. when passing shuffle=True in fit()).

From [another page](https://keras.io/guides/training_with_built_in_methods/#training-amp-evaluation-using-pydataset-instances) in the Keras documentation. Which... is misleading, according to [this Github thread](https://github.com/keras-team/keras/issues/20142) with François Chollet; apparently `PyDataset` instances *by default* will be shuffled.

Other implementations [*in Keras' documentation*](https://keras.io/examples/vision/masked_image_modeling/#pydataset-implementation) show an `on_epoch_end()` call that explicitly shuffles data which will be called on initialization; it makes no sense if `shuffle=True` is a default in the call to `Model.fit()`.

I found that my loss and metric was much worse without that `on_epoch_end()` call, which hints that there's an issue with the shuffle implementation if it's supposed to be True by default. Anyways, point being:

1. `PyDatasets` do not seem to be shuffled by default.
2. The documentation is very unclear on whether or not they're supposed to be shuffled by default.
3. There's clearly missing methods if `on_epoch_begin` is an option, despite it not being documented.

# The `FrontsPyDataset` Class


The code in its entirety is:
<details>

<summary>Click me to expand the code</summary>

```python
import dataclasses
import logging
import math
import time

import numpy as np
import tensorflow as tf
import xarray as xr

from fronts import utils
from fronts.data import inputs, targets

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class DatasetConfig:
    """Configuration for loading and splitting input and fronts data.

    Attributes:
        inputs_icechunk_config: Icechunk store config for ERA5 input data.
        targets_icechunk_config: Icechunk store config for fronts data.
        variables: ERA5 variable names to load as input channels.
        test_years: Calendar years to hold out as the sequestered test set (never seen
            during training or validation).
        val_years: Calendar years to hold out for validation. Must not overlap test_years.
            All years not in test_years or val_years are used for training.
        batch_size: Number of timesteps per training batch.
        class_weights: Per-class loss weights. None means equal weighting.
        time_resolution: Optional pandas offset string (e.g. ``"6h"``) used to subsample
            the loaded timesteps. Only timestamps whose hour is already aligned to this
            interval are kept (e.g. ``"6h"`` retains 00, 06, 12, 18 UTC). ``None`` keeps
            all available timesteps.
        norm_stats_cache_dir: Optional directory for caching normalization
            statistics, keyed by store snapshot, channels, and train indices.
            None recomputes the statistics on every run.
        max_queue_size: Maximum number of prefetched batches kept in RAM ahead of the
            training loop (passed to ``tf.keras.utils.PyDataset(max_queue_size=...)``).
        max_pydataset_workers: Maximum number of threads used by ``tf.keras.utils.PyDataset`` to
            load batches in parallel. None uses the number of CPUs allocated to the job.
    """

    inputs_icechunk_config: utils.IcechunkStorageConfig
    targets_icechunk_config: utils.IcechunkStorageConfig
    variables: list[str]
    test_years: list[int]
    val_years: list[int]
    batch_size: int = 4
    class_weights: list[float] | None = None
    time_resolution: str = "6h"
    norm_stats_cache_dir: str | None = None
    max_queue_size: int = 4
    max_pydataset_workers: int = 16


class FrontsPyDataset(tf.keras.utils.PyDataset):
    """Batches a split's ERA5/fronts DataArrays for training or evaluation via the PyDataset interface.

    Each ``__getitem__`` call gathers exactly one batch's timesteps with a single
    ``isel(time=idxs)`` take. ``input_ds``/``target_da`` must already be sliced
    to this split (e.g. ``input_ds.isel(time=train_indices)``) and backed by non-dask
    (``chunks=None``) arrays so each take reads directly through the zarr store rather
    than building a dask graph; concurrency across batches comes entirely from
    ``tf.keras.utils.PyDataset``'s own thread pool (``workers``/``max_queue_size``
    passed through ``**kwargs``).

    Yields a single (unreplicated) target per batch — the model's
    ``SharedTargetModel`` (see ``fronts.model``) is responsible for broadcasting it
    across any deep-supervision outputs, not the dataset.

    Attributes:
        input_ds: This split's input Dataset, shape (time, latitude, longitude) per variable.
        target_da: This split's raw integer front-code DataArray, shape (time, latitude, longitude).
        batch_size: Number of timesteps per batch.
        shuffle: If True, reshuffles the sample order at the end of every epoch.
    """

    def __init__(
        self,
        input_ds: xr.Dataset,
        target_da: xr.DataArray,
        data_config: DatasetConfig,
        batch_size: int,
        shuffle: bool = False,
        seed: int = 0,
        workers: int = 1,
        max_queue_size: int = 10,
    ):
        super().__init__(workers=workers, max_queue_size=max_queue_size)
        if input_ds.sizes["time"] != target_da.sizes["time"]:
            raise ValueError(
                f"Input and target time lengths differ: {input_ds.sizes['time']} vs {target_da.sizes['time']}"
            )
        self.input_ds = input_ds.copy()
        self.target_da = target_da.copy()
        self.data_config = data_config
        self.batch_size = batch_size
        self.shuffle = shuffle
        self._rng = np.random.default_rng(seed)
        self._order = self._rng.permutation(self._total) if shuffle else np.arange(self._total)

    @property
    def _total(self) -> int:
        return self.input_ds.sizes["time"]

    @property
    def n_samples(self) -> int:
        """Number of individual timesteps (samples) in this split."""
        return self._total

    def __len__(self) -> int:
        """Returns the number of batches per epoch."""
        return math.ceil(self._total / self.batch_size)

    def on_epoch_end(self) -> None:
        """Reshuffles the sample order for the next epoch, if shuffling is enabled."""
        if self.shuffle:
            self._order = self._rng.permutation(self._total)

    def get_at_indices(self, idxs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Returns the (input, target) arrays at arbitrary global time indices.

        Unlike ``__getitem__``, ``idxs`` need not be batch-sized or in ``_order``'s
        epoch sequence — used by callers that need specific timesteps directly (e.g. a
        test-set visualization callback selecting one active day or a random subsample).
        """
        x_xarray = self.input_ds.isel(time=idxs)
        y_da = self.target_da.isel(time=idxs)

        # Convert inputs to a DataArray of shape (time, latitude, longitude, channel) and load into memory as float32.
        x = inputs.inputs_ds_to_dataarray(x_xarray, self.data_config.variables).values

        # One-hot encode targets, remap front classes to the configured set, and load into memory as float32.
        y_da = targets.one_hot_encode_to_dataarray(targets.remap_fronts(y_da))

        # Convert to numpy arrays in memory. The model's SharedTargetModel is responsible for broadcasting the single
        # target across any deep-supervision outputs, not the dataset.
        y = y_da.values
        return x, y

    def __getitem__(self, idx: int) -> tuple[np.ndarray, np.ndarray]:
        """Returns the (input, target) batch at ``idx``."""
        local_idxs = self._order[idx * self.batch_size : (idx + 1) * self.batch_size]
        t0 = time.time()
        result = self.get_at_indices(local_idxs)
        elapsed = time.time() - t0
        if elapsed > 30:
            logger.warning(f"Slow batch {idx}: {elapsed:.1f}s")
        return result
```

</details></br>


I needed to access my inputs and target data from two Icechunk stores. Inputs are raw and derived ERA5 variables, including potential vorticity, vertical velocity, equivalent potential temperature, and more. Targets are fronts, labeled by front type, in a virtual store that references existing data on the HPC.

## Breakdown

```python
super().__init__(workers=workers, max_queue_size=max_queue_size)
```

Is the first important piece; passing through `workers` and `max_queue_size` and making them configurable in the configuration allowed me to fine tune both the multithreading that's working in tandem withh the Icechunk async engine and also the amount of data loaded into memory. I intentionally did not include `use_multiprocessing` as compute is not the bottleneck.

```python
self._order = self._rng.permutation(self._total) if shuffle else np.arange(self._total)
```

Is a ternary operator that will shuffle the data if shuffle is set to True when creating the `PyDataset` on initialization, which will cascade to each new epoch using `on_epoch_end()`:

```python
def on_epoch_end(self) -> None:
    """Reshuffles the sample order for the next epoch, if shuffling is enabled."""
    if self.shuffle:
        self._order = self._rng.permutation(self._total)
```

`get_at_indices()` is the function that actually does the subsetting and conversion from an xarray Dataset to a flattened (time, latitude, longitude, channel) DataArray:

```python

def get_at_indices(self, idxs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Returns the (input, target) arrays at arbitrary global time indices.

    Unlike ``__getitem__``, ``idxs`` need not be batch-sized or in ``_order``'s
    epoch sequence — used by callers that need specific timesteps directly (e.g. a
    test-set visualization callback selecting one active day or a random subsample).
    """
    x_xarray = self.input_ds.isel(time=idxs)
    y_da = self.target_da.isel(time=idxs)

    # Convert inputs to a DataArray of shape (time, latitude, longitude, channel) and load into memory as float32.
    x = inputs.inputs_ds_to_dataarray(x_xarray, self.data_config.variables).values

    # One-hot encode targets, remap front classes to the configured set, and load into memory as float32.
    y_da = targets.one_hot_encode_to_dataarray(targets.remap_fronts(y_da))

    # Convert to numpy arrays in memory. The model's SharedTargetModel is responsible for broadcasting the single
    # target across any deep-supervision outputs, not the dataset.
    y = y_da.values
    return x, y
```

Note that this is a point where the data is eagerly computed. This method is called in `__getitem__()`, a required dunder method for a subclass of `PyDataset`:

```python
def __getitem__(self, idx: int) -> tuple[np.ndarray, np.ndarray]:
    """Returns the (input, target) batch at ``idx``."""
    local_idxs = self._order[idx * self.batch_size : (idx + 1) * self.batch_size]
    t0 = time.time()
    result = self.get_at_indices(local_idxs)
    elapsed = time.time() - t0
    if elapsed > 30:
        logger.warning(f"Slow batch {idx}: {elapsed:.1f}s")
    return result
```

Where the actual indices, using `batch_size`, are computed using the TensorFlow internals. I added a warning logger if the subsetting takes more than 30 seconds (it normally does).

I use this child class downstream in `train.py` using `load_data_into_dataloader()`, a function I call once each for train and validation datasets:

<details>
<summary>Click me to expand the code</summary>

```python

def load_data_into_dataloader(
    data_config: datasets.DatasetConfig,
    split: Literal["train", "val", "test"],
    seed: int = 0,
    shuffle: bool = False,
) -> datasets.FrontsPyDataset:
    """Load, align, and encode ERA5 input and fronts data for training.

    Opens the ERA5 and fronts icechunk stores once each with ``chunks=None`` so
    TrainingDataset's per-batch ``isel(...).values`` reads go straight through the
    zarr store with no dask graph, deduplicates time indexes, aligns both to the
    intersection of available timestamps, and returns lazy DataArrays ready for
    batching. The dask-backed arrays needed for the full-training-set
    normalization-stats reduction (which needs dask to chunk that reduction
    instead of materializing everything in RAM at once) are derived from the same
    arrays via a cheap, metadata-only ``.chunk("auto")`` rather than a second
    store open.

    Args:
        data_config: DatasetConfig specifying store paths, branch names, and splits.
        split: Type of dataset to load ("train", "val", "test").
        seed: Integer seed for the RNG used when subsampling timesteps.
        shuffle: If True, reshuffles the sample order at the end of every epoch.
        workers: Number of ``PyDataset`` prefetch threads. 1 (the ``PyDataset``
            default) fetches each batch synchronously on the main thread, serializing
            every batch's icechunk read with the GPU training step.

    Returns:
        FrontsPyDataset yielding batches of (input, target) pairs for training.
    """

    def _open(icechunk_config: utils.IcechunkStorageConfig) -> xr.Dataset:
        ds = utils.open_readonly_icechunk_store(
            store_path=icechunk_config.store_path,
            branch=icechunk_config.branch_name,
            group=icechunk_config.group_name,
            zarr_format=icechunk_config.zarr_format,
            virtual_chunk_local_path=icechunk_config.virtual_chunk_local_path,
            chunks=None,
        )
        # A wrap-crossing bounding box (lon_max > 360) leaves longitude non-monotonic
        # on disk (e.g. [130, ..., 359.75, 0, ..., 9.75]); downstream plotting
        # (TestVisualizationCallback) and region masking assume it's monotonic.
        return utils.unwrap_longitude(ds)

    logger.info("Loading %s inputs...", split)
    inputs_ds = _open(data_config.inputs_icechunk_config)

    logger.info("Loading %s targets...", split)
    targets_da = _open(data_config.targets_icechunk_config)["identifier"]

    # The time indexes aren't identical between the two datasets
    common_times = np.intersect1d(targets_da.time.values, inputs_ds.time.values)

    # Subset to the time resolution; defaults to 6 hourly to match full USAD domain fronts data frequency
    common_times = apply_time_resolution(common_times, data_config.time_resolution)
    logger.info("After time_resolution=%s filter: %d steps", data_config.time_resolution, len(common_times))

    # Class-balancing subsample (drop ~50% of cases without all fronts in the domain) applies
    # to train/val, which both feed model selection; test must stay untouched for honest,
    # unbiased evaluation (see _build_test_visualization_callback).
    if split != "test":
        rng = np.random.default_rng(seed)
        keep = targets.filter_timesteps(targets_da.sel(time=common_times), rng)
        common_times = common_times[keep]
    logger.info(f"Matched time steps: {len(common_times)}")
    inputs_ds_matched = inputs_ds.sel(time=common_times)
    targets_da_matched = targets_da.sel(time=common_times)

    # Get years for splitting data
    train_mask, val_mask, test_mask = utils.split_by_year(
        times=inputs_ds_matched.time.values, test_years=data_config.test_years, val_years=data_config.val_years
    )
    split_mask = {"train": train_mask, "val": val_mask, "test": test_mask}[split]
    split_indices = sorted(np.where(split_mask)[0].tolist())
    logger.info("Split indices: %d timesteps for %s", len(split_indices), split)
    inputs_ds = inputs_ds_matched.isel(time=split_indices)
    targets_da = targets_da_matched.isel(time=split_indices)
    logger.info(
        "%s split: %d timesteps, %d inputs, %d targets",
        split,
        len(split_indices),
        len(inputs_ds.time),
        len(targets_da.time),
    )
    # Get the number of threads to use for PyDataset prefetching from max_pydataset_workers in the DatasetConfig,
    # which is set to 16 by default. This allows for parallel loading of batches without overwhelming ourdisk I/O.
    data_workers = utils.limit_workers_for_slurm(max_workers=data_config.max_pydataset_workers)
    return datasets.FrontsPyDataset(
        input_ds=inputs_ds,
        target_da=targets_da,
        data_config=data_config,
        seed=seed,
        batch_size=data_config.batch_size,
        shuffle=shuffle,
        workers=data_workers,
        max_queue_size=data_config.max_queue_size,
    )
```
</details>
</br>

# Results/Discussion

The outcome of this resulted in training that took right under 28 hours using a `MirroredStrategy` on 4 A100's on ~4TB of training data for a UNet3+.

![Heidke Skill Score (HSS) metric for shuffled and likely unshuffled dataset](../../assets/blog/hss_shuffle_vs_not.png 'Heidke Skill Score by step for the shuffled dataset (green) and the "shuffled" dataset without shuffle=True explicitly declared in the PyDataset. Dashed lines are validation HSS')  

There was a clear enough difference with the `shuffle` conundrum that I opted to keep `shuffle=True` in the `FrontsPyDataset` call.

There's still significant room for improvement, as the TFRecord method took ~2 seconds per step compared to the `PyDataset` method at ~5 seconds per step. The key benefit to this approach is the datasets and code are all version controlled. The data is stored with ACID transactions (so long as I don't delete the store itself). 

I set the maximum workers to 16, any more seemed to hammer the disk a bit too hard with concurrent requests combining multithreading via Icechunk and Tensorflow simultaneously. 

Moving forward, I'm going to address one likely slowdown immediately: dilating the front labels by one pixel in each direction in the current model version. Dilating the fronts both accounts for label errors and also improves the model training. An experiment I'm working on applies an indirect dilation in the loss function instead of requiring a call to a `scipy` function over and over again. 

Another possible speedup is swapping stores. The store the data lies on is a *slow* Ceph-based filesystem. There's a possible speedup in storing the data temporarily in the HPC's `scratch/` store, but would require one large transfer prior to training.