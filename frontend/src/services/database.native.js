/**
 * Native (iOS/Android) offline DB layer backed by expo-sqlite.
 * Same public API as database.web.js.
 */
import * as SQLite from 'expo-sqlite';
import { DEFAULT_AIRCRAFT, DEFAULT_FORMULAS } from '../constants/logic';

// Cache the in-flight open+init PROMISE (not just the resolved db) so
// concurrent callers (e.g. Promise.all([loadAircraftDefaults(), loadFormulas()])
// on app boot) await the same connection instead of racing to open the
// database file twice, which crashes with a native NullPointerException.
let _dbPromise = null;
const getDB = () => {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('hal_performance.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          aircraft_id TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return _dbPromise;
};

const CFG_AIRCRAFT = 'aircraft_defaults';
const CFG_FORMULAS = 'formulas';
const DEVICE_ID_KEY = 'hal_device_id';

export const insertReport = async (r) => {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO reports (id, name, created_at, aircraft_id, payload_json) VALUES (?, ?, ?, ?, ?)`,
    [r.id, r.name, r.created_at, r.aircraft_id, JSON.stringify(r.payload)]
  );
};

export const listReports = async () => {
  const db = await getDB();
  const rows = await db.getAllAsync(
    `SELECT id, name, created_at, aircraft_id, payload_json FROM reports ORDER BY created_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    aircraft_id: r.aircraft_id,
    payload: JSON.parse(r.payload_json),
  }));
};

export const deleteReport = async (id) => {
  const db = await getDB();
  await db.runAsync(`DELETE FROM reports WHERE id = ?`, [id]);
};

const readConfig = async (key) => {
  const db = await getDB();
  const row = await db.getFirstAsync(`SELECT value FROM config WHERE key = ?`, [key]);
  return row && row.value ? row.value : null;
};

const writeConfig = async (key, value) => {
  const db = await getDB();
  await db.runAsync(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`, [key, value]);
};

export const loadAircraftDefaults = async () => {
  const raw = await readConfig(CFG_AIRCRAFT);
  if (raw) { try { return JSON.parse(raw); } catch { /* ignore */ } }
  return DEFAULT_AIRCRAFT;
};

export const saveAircraftDefaults = async (d) => {
  await writeConfig(CFG_AIRCRAFT, JSON.stringify(d));
};

export const loadFormulas = async () => {
  const raw = await readConfig(CFG_FORMULAS);
  if (raw) { try { return { ...DEFAULT_FORMULAS, ...JSON.parse(raw) }; } catch { /* ignore */ } }
  return DEFAULT_FORMULAS;
};

export const saveFormulas = async (f) => {
  await writeConfig(CFG_FORMULAS, JSON.stringify(f));
};

export const resetConfig = async () => {
  const db = await getDB();
  await db.runAsync(`DELETE FROM config WHERE key IN (?, ?)`, [CFG_AIRCRAFT, CFG_FORMULAS]);
};

export const getDeviceId = async () => {
  let id = await readConfig(DEVICE_ID_KEY);
  if (!id) {
    id = `HAL${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await writeConfig(DEVICE_ID_KEY, id);
  }
  return id;
};
