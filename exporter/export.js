// This code is based on
// https://github.com/mozilla/cerberus/blob/master/exporter/export.js

var _ = require('lodash');
var Promise = require('promise');
var fs = require('fs');
var mkdirp = require('mkdirp');
var Telemetry = require('telemetry-next-node');
var semver = require('semver');

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

// Load measures
var measures = null;
var measures_per_version = null;

var histogram_definitions = JSON.parse(fs.readFileSync("data/Histograms.json", "utf8"));

function is_probe_allowed(measure) {
    return (histogram_definitions[measure] &&
            measure === "UPTAKE_REMOTE_CONTENT_RESULT_1")
}

var telemetry_measures_found = telemetry_versions_filtered.then(function() {
  return Promise.all(versions.map(function(version) {
    return new Promise(function(accept) {
      var parts = version.split("/");
      Telemetry.getFilterOptions(parts[0], parts[1], function(filters) {
        var measureMap = {};
        filters.metric.forEach(function(measure) {
          if (is_probe_allowed(measure)) {
            measureMap[measure] = true;
          }
        })
        accept(measureMap);
      });
    });
  })).then(function(values) {
    measures_per_version = values.map(function(measures) {
      return _.keys(measures);
    });
    measures = _.defaults.apply(_, values);
  });
});

function dumpEvolution(evolution, result) {
  return evolution.map(function(hgram, i, date) {
    return {
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

var measures_to_handle = null;
function handle_one() {
  if (measures_to_handle.length === 0) { return; } // No measures left to process
  var measure = measures_to_handle.pop();

  if (fs.existsSync('data/histograms/' + measure + '.json')) {
    console.log("Skipping: " + measure);
    handle_one();
    return;
  }

  console.log("Downloading: " + measure + " (" + measures_to_handle.length + " remaining)");

  var promises = [], result = [];
  versions.forEach(function(version, index) {
    if (measures_per_version[index].indexOf(measure) === -1) { // Version does not have this measure
      console.log('Skip ' + version + ' ' + measure)
      return;
    }

    promises.push(new Promise(function(accept) { // Retrieve the evolution for this version
      var parts = version.split("/");
      Telemetry.getEvolution(parts[0], parts[1], measure, {}, false, function(evolutionMap) {
        if (evolutionMap.hasOwnProperty("")) { // Non-keyed histogram
          dumpEvolution(evolutionMap[""]).forEach(function(entry) { result.push(entry); });
        }
        accept();
      });
    }));
  });

  return Promise.all(promises).then(function() {
    // Write file async
    return new Promise(function(accept, reject) {
      if (result.length > 0) { // Results available, write them to disk
        fs.writeFile(
          'data/histograms/' + measure + '.json',
          JSON.stringify(result, null, 2),
          function(err) { return err ? reject(err) : accept(); }
        );
      } else { // No results available, skip writing to disk
        accept();
      }
    }).then(function() { handle_one(); }); // Process the next available measure
  }).catch(function(err) { console.log(err); });
};

// Load histograms
var load_histograms = telemetry_measures_found.then(function() {
  measures_to_handle = _.keys(measures).sort();

  // Download 2 in parallel
  handle_one();
  handle_one();
}).catch(function(err) {console.log(err);});
