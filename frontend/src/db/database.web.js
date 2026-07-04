/**
 * Web implementation of the offline DB layer.
 * Uses the browser's built-in localStorage directly (no extra package) since
 * expo-sqlite's web variant requires WASM artifacts that the Metro preview
 * cannot resolve. The public API mirrors database.native.js exactly.
 */
import { DEFAULT_AIRCRAFT, DEFAULT_FORMULAS } from '../config/logic';

const WEB_REPORTS_KEY = 'hal_reports';
const CFG_AIRCRAFT = 'aircraft_defaults';
const CFG_FORMULAS = 'formulas';
const DEVICE_ID_KEY = 'hal_device_id';

const getItem = async (key) => localStorage.getItem(key);
const setItem = async (key, value) => localStorage.setItem(key, value);
const removeItem = async (key) => localStorage.removeItem(key);

export const insertReport = async (r) => {
  const raw = await getItem(WEB_REPORTS_KEY);
  const list = raw ? JSON.parse(raw) : [];
  const filtered = list.filter((x) => x.id !== r.id);
  filtered.unshift(r);
  await setItem(WEB_REPORTS_KEY, JSON.stringify(filtered));
};

export const listReports = async () => {
  const raw = await getItem(WEB_REPORTS_KEY);
  return raw ? JSON.parse(raw) : [];
};

export const deleteReport = async (id) => {
  const raw = await getItem(WEB_REPORTS_KEY);
  const list = raw ? JSON.parse(raw) : [];
  await setItem(WEB_REPORTS_KEY, JSON.stringify(list.filter((x) => x.id !== id)));
};

export const loadAircraftDefaults = async () => {
  const raw = await getItem(`hal_cfg_${CFG_AIRCRAFT}`);
  if (raw) { try { return JSON.parse(raw); } catch { /* ignore */ } }
  return DEFAULT_AIRCRAFT;
};

export const saveAircraftDefaults = async (d) => {
  await setItem(`hal_cfg_${CFG_AIRCRAFT}`, JSON.stringify(d));
};

export const loadFormulas = async () => {
  const raw = await getItem(`hal_cfg_${CFG_FORMULAS}`);
  if (raw) { try { return { ...DEFAULT_FORMULAS, ...JSON.parse(raw) }; } catch { /* ignore */ } }
  return DEFAULT_FORMULAS;
};

export const saveFormulas = async (f) => {
  await setItem(`hal_cfg_${CFG_FORMULAS}`, JSON.stringify(f));
};

export const resetConfig = async () => {
  await removeItem(`hal_cfg_${CFG_AIRCRAFT}`);
  await removeItem(`hal_cfg_${CFG_FORMULAS}`);
};

export const getDeviceId = async () => {
  let id = await getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `HAL${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await setItem(DEVICE_ID_KEY, id);
  }
  return id;
};
