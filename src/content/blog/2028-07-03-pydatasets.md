---
title: "PyDatasets for Icechunk and Keras"
date: 2026-07-03
description: "A post detailing how to use PyDataset with Icechunk data, both populated and a virtual store."
tags: ["icechunk", "zarr", "keras", "machine learning", "geospatial", "tensors"]
---

I've been utilizing the University of Oklahoma supercomputer, soon-to-be called Sooner (previously called Schooner) to update [FrontFinder](https://doi.org/10.1175/AIES-D-24-0043.1) (Justin et al. 2025) for NOAA. The model is *really cool*, with the ability to probabilistically infer where cold, warm, stationary, and occluded fronts are along with drylines. 

![FrontFinder output for the 2023 Christmas winter storm in the eastern US](/src/assets/blog/frontfinder_example.png "FrontFinder output for the 2023 Christmas winter storm in the eastern US, Figure 14 in the paper")  

The data left on storage was in both netCDFs and TFRecords. Training a new version of the model with this data was ridiculously quick with the TFRecords, but left a few serious issues on the table:

1. **Verification**: There was no way to verify the TFRecord data followed the generation and augmentation logic in the paper. The only way to estimate the method the data was created with was from the dates `ls` provided
2. **Reverse Engineering**: I would have to try to insert code for any new variables and likely rebuild both datasets from scratch
3. **No Versioning or Documentation in the Data**: There were undocumented changes in data and code between publication and when I started
4. **Implicity**: The data used to train the model would have been implicit for a model that NOAA is using to augment decision-making (and IMHO should be as explicit as possible)


