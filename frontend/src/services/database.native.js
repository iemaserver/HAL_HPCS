/**
 * Native (iOS/Android) offline storage using expo-file-system JSON files.
 * Same public API as database.web.js.
 */
import * as FileSystem from 'expo-file-system';
import { DEFAULT_AIRCRAFT, DEFAULT_FORMULAS } from '../constants/logic';

const DATA_DIR = FileSystem.documentDirectory + 'hal_data/';
const REPORTS_FILE = DATA_DIR + 'reports.json';
const CONFIG_FILE = DATA_DIR + 'config.json';
const DEVICE_FILE = DATA_DIR + 'device_id.txt';

// intermediates:true makes this a no-op if the directory already exists.
const ensureDir = () =>
  FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true }).catch(() => {});

const readJson = async (path, fallback) => {
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = async (path, data) => {
  await ensureDir();
  await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
};

export const insertReport = async (r) => {
  const reports = await readJson(REPORTS_FILE, []);
  const idx = reports.findIndex((x) => x.id === r.id);
  if (idx >= 0) reports[idx] = r; else reports.unshift(r);
  await writeJson(REPORTS_FILE, reports);
};

export const listReports = async () => {
  const reports = await readJson(REPORTS_FILE, []);
  return [...reports].sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const deleteReport = async (id) => {
  const reports = await readJson(REPORTS_FILE, []);
  await writeJson(REPORTS_FILE, reports.filter((r) => r.id !== id));
};

const readConfig = async (key) => {
  const config = await readJson(CONFIG_FILE, {});
  return config[key] ?? null;
};

const writeConfig = async (key, value) => {
  const config = await readJson(CONFIG_FILE, {});
  config[key] = value;
  await writeJson(CONFIG_FILE, config);
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
  await writeJson(CONFIG_FILE, {});
};

export const getDeviceId = async () => {
  try {
    const id = await FileSystem.readAsStringAsync(DEVICE_FILE);
    if (id && id.trim()) return id.trim();
  } catch { /* file doesn't exist yet */ }
  const id = `HAL${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await ensureDir();
  await FileSystem.writeAsStringAsync(DEVICE_FILE, id);
  return id;
};
