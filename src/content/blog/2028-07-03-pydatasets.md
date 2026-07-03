---
title: "PyDatasets for Icechunk and Keras"
date: 2026-07-03
description: "A post detailing how to use PyDataset with Icechunk data, both populated and a virtual store."
tags: ["icechunk", "zarr", "keras", "machine learning", "geospatial", "tensors"]
---

I've been utilizing the University of Oklahoma supercomputer, soon-to-be called Sooner (previously called Schooner) to update [FrontFinder](https://doi.org/10.1175/AIES-D-24-0043.1) (Justin et al. 2025) for NOAA. The model is *really cool*, with the ability to probabilistically infer where cold, warm, stationary, and occluded fronts are along with drylines. The data left on storage was in TFRecord format though. Training a new version of the model with this data was ridiculously quick, but left a few serious issues on the table:

1. There was no way to definitively verify the data followed the generation and augmentation logic in the paper
2. I would have to try to insert code for any new variables and likely rebuild the entire store from scratch
3. The only evidence of creation/modification was from the dates `ls` provided
4. The training trail was ultimately implicit for a model that NOAA is using to augment decision-making (and IMHO should be as explicit as possible).
