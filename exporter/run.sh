#!/bin/bash
# rm -rf ./data/histograms/*

# update histogram metadata
# wget https://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/components/telemetry/Histograms.json -O data/Histograms.json

# export histogram evolutions using Telemetry.js to JSON, under `histograms/*.json`
nodejs export.js
