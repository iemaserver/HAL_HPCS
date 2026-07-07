/**
 * Native (iOS/Android) offline storage — expo-file-system/next class API.
 * Directory is instantiated lazily (never at module scope) so an import-time
 * constructor mismatch cannot crash the router on startup.
 * Falls back to in-memory storage transparently if the native layer fails.
 */
import { DEFAULT_AIRCRAFT, DEFAULT_FORMULAS } from '../constants/logic';

// ── in-memory fallback (used when file-system is unavailable) ─────────────
let _mem = { reports: [], config: {}, deviceId: null };

// ── lazy file-system helpers ──────────────────────────────────────────────
let _fsReady = null; // null = untested, true/false = result

const getFS = async () => {
  if (_fsReady === false) return null;
  try {
    const { File, Directory } = await import('expo-file-system/next');
    const { documentDirectory } = await import('expo-file-system');
    const DATA_URI = documentDirectory + 'hal_data/';
    const dir = new Directory(DATA_URI);
    if (!dir.exists) dir.create();
    _fsReady = true;
    return { File, DATA_URI };
  } catch {
    _fsReady = false;
    return null;
  }
};

const readJson = async (filename, fallback) => {
  const fs = await getFS();
  if (!fs) return fallback;
  try {
    const file = new fs.File(fs.DATA_URI + filename);
    if (!file.exists) return fallback;
    return JSON.parse(file.text());
  } catch {
    return fallback;
  }
};

const writeJson = async (filename, data) => {
  const fs = await getFS();
  if (!fs) return;
  try {
    new fs.File(fs.DATA_URI + filename).write(JSON.stringify(data));
  } catch { /* ignore */ }
};

// ── public API ────────────────────────────────────────────────────────────
export const insertReport = async (r) => {
  const reports = await readJson('reports.json', _mem.reports);
  const idx = reports.findIndex((x) => x.id === r.id);
  if (idx >= 0) reports[idx] = r; else reports.unshift(r);
  _mem.reports = reports;
  await writeJson('reports.json', reports);
};

export const listReports = async () => {
  const reports = await readJson('reports.json', _mem.reports);
  _mem.reports = reports;
  return [...reports].sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const deleteReport = async (id) => {
  const reports = (await readJson('reports.json', _mem.reports)).filter((r) => r.id !== id);
  _mem.reports = reports;
  await writeJson('reports.json', reports);
};

const readConfig = async (key) => {
  const config = await readJson('config.json', _mem.config);
  _mem.config = config;
  return config[key] ?? null;
};

const writeConfig = async (key, value) => {
  const config = await readJson('config.json', _mem.config);
  config[key] = value;
  _mem.config = config;
  await writeJson('config.json', config);
};

export const loadAircraftDefaults = async () => {
  const raw = await readConfig('aircraft_defaults');
  if (raw) { try { return JSON.parse(raw); } catch { /* ignore */ } }
  return DEFAULT_AIRCRAFT;
};

export const saveAircraftDefaults = async (d) => {
  await writeConfig('aircraft_defaults', JSON.stringify(d));
};

export const loadFormulas = async () => {
  const raw = await readConfig('formulas');
  if (raw) { try { return { ...DEFAULT_FORMULAS, ...JSON.parse(raw) }; } catch { /* ignore */ } }
  return DEFAULT_FORMULAS;
};

export const saveFormulas = async (f) => {
  await writeConfig('formulas', JSON.stringify(f));
};

export const resetConfig = async () => {
  _mem.config = {};
  await writeJson('config.json', {});
};

export const getDeviceId = async () => {
  if (_mem.deviceId) return _mem.deviceId;
  const fs = await getFS();
  if (fs) {
    try {
      const file = new fs.File(fs.DATA_URI + 'device_id.txt');
      if (file.exists) {
        const id = file.text();
        if (id && id.trim()) { _mem.deviceId = id.trim(); return _mem.deviceId; }
      }
    } catch { /* ignore */ }
  }
  const id = `HAL${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  _mem.deviceId = id;
  if (fs) { try { new fs.File(fs.DATA_URI + 'device_id.txt').write(id); } catch { /* ignore */ } }
  return id;
};
