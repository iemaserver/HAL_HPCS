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
    // SDK 55: the File/Directory/Paths API lives at the package root
    // ("expo-file-system/next" no longer exists, which silently disabled persistence).
    const { File, Directory, Paths } = await import('expo-file-system');
    const dir = new Directory(Paths.document, 'hal_data');
    if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
    _fsReady = true;
    return { File, dir };
  } catch (e) {
    console.warn('File storage unavailable, using memory only:', e?.message || e);
    _fsReady = false;
    return null;
  }
};

const readJson = async (filename, fallback) => {
  const fs = await getFS();
  if (!fs) return fallback;
  try {
    const file = new fs.File(fs.dir, filename);
    if (!file.exists) return fallback;
    return JSON.parse(file.textSync());
  } catch {
    return fallback;
  }
};

const writeJson = async (filename, data) => {
  const fs = await getFS();
  if (!fs) return;
  try {
    const file = new fs.File(fs.dir, filename);
    if (!file.exists) file.create();
    file.write(JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to persist', filename, e?.message || e);
  }
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
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      // Deep-merge per aircraft so fields added to DEFAULT_AIRCRAFT after a device's last
      // save (e.g. the new weight-breakdown / Zσ / Dθ fields) aren't silently missing.
      const merged = {};
      for (const id of Object.keys(DEFAULT_AIRCRAFT)) {
        merged[id] = { ...DEFAULT_AIRCRAFT[id], ...(saved[id] || {}) };
      }
      return merged;
    } catch { /* ignore */ }
  }
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

export const loadSession = async () => {
  const raw = await readConfig('session');
  if (raw) { try { return JSON.parse(raw); } catch { /* ignore */ } }
  return null;
};

export const saveSession = async (s) => {
  await writeConfig('session', JSON.stringify(s));
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
      const file = new fs.File(fs.dir, 'device_id.txt');
      if (file.exists) {
        const id = file.textSync();
        if (id && id.trim()) { _mem.deviceId = id.trim(); return _mem.deviceId; }
      }
    } catch { /* ignore */ }
  }
  const id = `HAL${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  _mem.deviceId = id;
  if (fs) {
    try {
      const f = new fs.File(fs.dir, 'device_id.txt');
      if (!f.exists) f.create();
      f.write(id);
    } catch { /* ignore */ }
  }
  return id;
};
