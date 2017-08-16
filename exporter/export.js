// This code is based on
// https://github.com/mozilla/cerberus/blob/master/exporter/export.js

var _ = require('lodash');
var Promise = require('promise');
var fs = require('fs');
var mkdirp = require('mkdirp');
var Telemetry = require('telemetry-next-node');
var semver = require('semver');

var measures_to_handle = ["UPTAKE_REMOTE_CONTENT_RESULT_1"];
var evolution_prefix = ["shield-recipe-client"];

// Create output directory
mkdirp.sync('data/histograms');

// Initialize telemetry
var telemetry_inited = new Promise(function(accept) {
    Telemetry.init(accept);
});

function convert_to_semver(version) {
    // Append .0.1 to make everything into valid semantic versions,
    // including release/0 -> 0.0.1. We map aurora -> beta and
    // beta -> rc to get them into the right sorting order.
    var version_array = version.split("/");
    var channel = version_array[0];
    var semversion = version_array[1] + ".0.1";
    if (channel === "nightly") {
        semversion = semversion + "-alpha.0"
    }
    if (channel === "aurora") {
        semversion = semversion + "-beta.0"
    }
    if (channel === "beta") {
        semversion = semversion + "-rc.0"
    }
    return semversion;
}

function version_compare(a, b) {
    return semver.compare(convert_to_semver(a), convert_to_semver(b));
}

// Find versions to play with
var versions = null;
var telemetry_versions_filtered = telemetry_inited.then(function() {
    // Get the last 6 versions from all channels
    versions = Telemetry.getVersions();
    versions.sort(version_compare);
    versions = _.last(versions, 6);
});

function dumpEvolution(name, version, evolution, result) {
    return evolution.map(function(hgram, i, date) {
        return {
            name:         name,
            version:      version,
            measure:      hgram.measure,
            kind:         hgram.kind,
            date:         date.toJSON(),
            submissions:  hgram.submissions,
            count:        hgram.count,
            buckets:      hgram.map(function(count, start) { return start }),
            values:       hgram.map(function(count) { return count }),
            mean:         hgram.mean(),
            median:       hgram.percentile(50),
            p25:          hgram.percentile(25),
            p75:          hgram.percentile(75),
        };
    });
};

function handle_one() {
    if (measures_to_handle.length === 0) {
        // No measures left to process
        return;
    }
    var measure = measures_to_handle.pop();
    console.log("Downloading: " + measure);

    var promises = []
    var result = [];
    versions.forEach(function(version, index) {
        // Retrieve the evolution for this version
        promises.push(new Promise(function(accept) {
            var parts = version.split("/");
            Telemetry.getEvolution(parts[0], parts[1], measure,
                                   {}, false, function(evolutionObj) {
                var evolutionMap = new Map(Object.entries(evolutionObj));
                evolutionMap.forEach(function(evolution, name) {
                    if (name.startsWith(evolution_prefix)) {
                        dumpEvolution(name, version, evolution).forEach(function(entry) {
                            result.push(entry);
                        });
                    }
                });
                accept();
            });
        }));
    });

    return Promise.all(promises).then(function() {
        // Write file async
        return new Promise(function(accept, reject) {
            // Results available, write them to disk
            if (result.length > 0) {
                fs.writeFile(
                    'data/histograms/' + measure + '.json',
                    JSON.stringify(result, null, 2),
                    function(err) {
                        return err ? reject(err) : accept();
                    }
                );
            } else {
                // No results available, skip writing to disk
                accept();
            }
        }).then(function() {
            // Process the next available measure
            handle_one();
        });
    }).catch(function(err) {
        console.log(err);
    });
};

// Load histograms
var load_histograms = telemetry_versions_filtered.then(function() {
    handle_one();
}).catch(function(err) {
    console.log(err);
});
