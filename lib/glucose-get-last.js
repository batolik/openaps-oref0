function getDateFromEntry(entry) {
  return entry.date || Date.parse(entry.display_time) || Date.parse(entry.dateString);
}

var getLastGlucose = function (data) {
    data = data.filter(function(obj) {
      return obj.glucose || obj.sgv;
    }).map(function prepGlucose (obj) {
        //Support the NS sgv field to avoid having to convert in a custom way
        obj.glucose = obj.glucose || obj.sgv;
        if ( obj.glucose !== null ) {
            return obj;
        }
    });

    var now = data[0];
    var newest_date = getDateFromEntry(now);
    // now_date follows the average of the current cluster only. Later samples are
    // measured from that, matching 5-minute data with a near-duplicate reading.
    var now_date = newest_date;
    var change;
    var last_deltas = [];
    var short_deltas = [];
    var long_deltas = [];
    var last_cal = 0;

    //console.error(now.glucose);
    for (var i=1; i < data.length; i++) {
        // if we come across a cal record, don't process any older SGVs
        if (typeof data[i] !== 'undefined' && data[i].type === "cal") {
            last_cal = i;
            break;
        }
        // only use data from the same device as the most recent BG data point
        if (typeof data[i] !== 'undefined' && data[i].glucose > 38 && data[i].device === now.device) {
            var then = data[i];
            var then_date = getDateFromEntry(then);
            var avgdelta = 0;
            var minutesago;
            if (typeof then_date !== 'undefined' && typeof newest_date !== 'undefined') {
                // Cluster membership stays tied to the original newest timestamp.
                // Measuring it from the running average lets 1-minute CGM walk
                // now_date back through the whole stream until BG looks stale.
                var minutes_from_newest = Math.round( (newest_date - then_date) / (1000 * 60) );
                if (-2 < minutes_from_newest && minutes_from_newest < 2.5) {
                    now.glucose = ( now.glucose + then.glucose ) / 2;
                    now_date = ( now_date + then_date ) / 2;
                } else {
                    minutesago = Math.round( (now_date - then_date) / (1000 * 60) );
                    // A sample just outside the cluster can sit <2.5m from the averaged
                    // cluster time. Keep it, classified by its real age.
                    if (!(minutesago > 2.5)) minutesago = minutes_from_newest;
                    // multiply by 5 to get the same units as delta, i.e. mg/dL/5m
                    change = now.glucose - then.glucose;
                    avgdelta = change/minutesago * 5;
                    // short_deltas are calculated from everything ~5-15 minutes ago
                    if (2.5 < minutesago && minutesago < 17.5) {
                        short_deltas.push(avgdelta);
                        // last_deltas are calculated from everything ~5 minutes ago
                        if (2.5 < minutesago && minutesago < 7.5) {
                            last_deltas.push(avgdelta);
                        }
                    // long_deltas are calculated from everything ~20-40 minutes ago
                    } else if (17.5 < minutesago && minutesago < 42.5) {
                        long_deltas.push(avgdelta);
                    }
                }
            } else { console.error("Error: date field not found: cannot calculate avgdelta"); }
        }
    }
    var last_delta = 0;
    var short_avgdelta = 0;
    var long_avgdelta = 0;
    if (last_deltas.length > 0) {
        last_delta = last_deltas.reduce(function(a, b) { return a + b; }) / last_deltas.length;
    }
    if (short_deltas.length > 0) {
        short_avgdelta = short_deltas.reduce(function(a, b) { return a + b; }) / short_deltas.length;
    }
    if (long_deltas.length > 0) {
        long_avgdelta = long_deltas.reduce(function(a, b) { return a + b; }) / long_deltas.length;
    }

    return {
        delta: Math.round( last_delta * 100 ) / 100
        , glucose: Math.round( now.glucose * 100 ) / 100
        , noise: Math.round(now.noise)
        , short_avgdelta: Math.round( short_avgdelta * 100 ) / 100
        , long_avgdelta: Math.round( long_avgdelta * 100 ) / 100
        , date: newest_date
        , last_cal: last_cal
        , device: now.device
    };
};

module.exports = getLastGlucose;
