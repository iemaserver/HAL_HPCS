/**
 * Reference graphs (client 20-Nov-26): flight-manual graph sheets supplied by the client as
 * PDFs, rendered to images. There are no dynamic/computed graphs for now — these are for
 * reference only and are shown where they belong (Performance Data tabs, JPT on Hover Power).
 *
 * File naming: assets/graphs/<aircraft>-<sheet>.png
 *   sheets: speed (Max Level Flight Speed), roc (Rate of Climb), rpm (RPM in Autorotation),
 *           jpt (JPT / hover tail-pipe temperature), maxpower (Max Power Available table)
 * To replace a graph, overwrite its PNG. To add one, add it to IMG below.
 */

// Metro needs static require() paths, so every file is listed explicitly.
const IMG = {
  chetak: {
    speed: require('../../assets/graphs/chetak-speed.png'),
    roc: require('../../assets/graphs/chetak-roc.png'),
    rpm: require('../../assets/graphs/chetak-rpm.png'),
    jpt: require('../../assets/graphs/chetak-jpt.png'),
    maxpower: require('../../assets/graphs/chetak-maxpower.png'),
  },
  cheetah: {
    speed: require('../../assets/graphs/cheetah-speed.png'),
    roc: require('../../assets/graphs/cheetah-roc.png'),
    rpm: require('../../assets/graphs/cheetah-rpm.png'),
    jpt: require('../../assets/graphs/cheetah-jpt.png'),
    maxpower: require('../../assets/graphs/cheetah-maxpower.png'),
  },
  cheetal: {
    speed: require('../../assets/graphs/cheetal-speed.png'),
    roc: require('../../assets/graphs/cheetal-roc.png'),
    rpm: require('../../assets/graphs/cheetal-rpm.png'),
    // No JPT sheet for Cheetal. Max power uses the shared Cheetah/Cheetal table.
    maxpower: require('../../assets/graphs/cheetah-maxpower.png'),
  },
};

// Metric ids are the ones the Performance Data screen and menu already use.
export const GRAPH_TITLES = {
  vmax: 'Max Level Flight Speed',
  roc: 'Rate of Climb',
  'autorotation-rpm': 'RPM in Autorotation',
  jpt: 'JPT Graph',
  maxpower: 'Max Power Available',
};

const SHEET_KEY = {
  vmax: 'speed', roc: 'roc', 'autorotation-rpm': 'rpm', jpt: 'jpt', maxpower: 'maxpower',
};

export const getGraphSource = (aircraftId, metric) => IMG[aircraftId]?.[SHEET_KEY[metric]] ?? null;

// Metrics that have a sheet for this aircraft (e.g. Cheetal has no JPT).
export const graphMetricsFor = (aircraftId) => Object.keys(GRAPH_TITLES)
  .filter((m) => getGraphSource(aircraftId, m));
