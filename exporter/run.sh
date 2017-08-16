#!/bin/bash
rm -rf ./data/histograms/*

# export histogram evolutions using Telemetry.js to JSON,
# under `histograms/*.json`
nodejs export.js
