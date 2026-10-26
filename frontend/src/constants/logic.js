/**
 * HAL Helicopter Performance - Central Logic / Config Layer
 * --------------------------------------------------------
 * This module is the SINGLE SOURCE OF TRUTH for:
 *   - Default values (empty weights, fuel, crew, load, etc. per aircraft)
 *   - Unit definitions & conversion factors
 *   - Calculation formulas for the 8 output parameters
 *   - Fit-to-Fly threshold logic (0.01 precision)
 *
 * Anything here can be overridden live via the Settings screen
 * (persisted in SQLite, loaded at app boot).
 */

/**
 * AUW envelope thresholds (client PPTX slides 9–11):
 *   - Chetak:            lower 4630 Lb · upper (MAUW) 4850 Lb
 *   - Cheetah / Cheetal:  lower 4300 Lb · upper (MAUW) 5070 Lb
 * `mauw` continues to serve as the single upper/ceiling value used by the
 * existing Fit-to-Fly check. `auwLowerThresholdKg` is new — it is only used
 * to compute the "Possible Payload for <lower>" display on Hover Power Calc.
 *
 * DECISION (confirmed with the user): the PPTX explicitly gives Cheetah AND
 * Cheetal the SAME pair of AUW figures (4300 / 5070 Lb). Cheetal's old mauw
 * (2250 kg) didn't match 5070 Lb and has been corrected. Cheetah's old mauw
 * (1950 kg) actually matched the *lower* 4300 Lb figure, not the 5070 Lb
 * upper figure the PPTX assigns to it — so it has also been corrected here
 * to keep Cheetah/Cheetal's envelopes identical, matching the PPTX. Flagged
 * explicitly in the implementation report; the literal instruction text only
 * called out Cheetal, so double-check this Cheetah change is wanted.
 */
// Collective-pitch, Nr, and JPT/T4 figures below (2026-09-14) are sourced from the actual
// SA315B Lama flight manual (client's Cheetah is the license-built Lama; Chetak's Alouette
// III shares the same rotor system and Artouste IIIB engine — same collective-pitch
// indicator convention, same 353 rpm Nr, same T4 limit apply to both):
//   - Collective pitch is a dimensionless indicator (NOT degrees) reading roughly 0.15-0.20
//     at low pitch up to ~1.05-1.15 near the hover/rated-power limit. Manual-quoted points:
//     "decreasing rotor rpm by increasing collective pitch to more than 0.20" (ground/low
//     ref.), "economical cruising pitch above 1000m/3300ft is 0.85" (a cruise value, well
//     below max — the actual max is chart-determined against density altitude, not a fixed
//     number, matching how COLLECTIVE_REQ/COLLECTIVE_AVAIL already vary with conditions).
//   - Main rotor speed (Nr) is governed at a constant 353 rpm (100%) in powered flight;
//     autorotation keeps Nr within 270-420 rpm — a pilot-managed band, not something that
//     shifts with AUW/altitude, so `idealAutorotationRPM` is a flat per-aircraft constant.
//   - Tail-pipe temperature (T4/JPT) must not exceed 500°C (Artouste IIIB, Chetak/Cheetah).
export const DEFAULT_AIRCRAFT = {
  chetak: {
    id: 'chetak',
    name: 'Chetak',
    // Weight breakdown (client PPTX slide 7/9): Empty Weight = Basic + Equipment + Pilot + Copilot.
    // Values below are the client's corrected defaults (2026-09-14); all four remain
    // user-editable per-aircraft on Default Settings / Hover Power Calculation.
    emptyWeight: 1440, // = basicWeight + equipmentWeight + pilotWeight + copilotWeight below
    basicWeight: 1300,
    equipmentWeight: 0,
    pilotWeight: 70,
    copilotWeight: 70,
    // Ageing Coefficient / JPT Correction — captured only, not wired into any formula (see TODO below).
    ageingCoefficient: 0,
    jptCorrection: 0,
    // Default Settings page 2 reference table (slide 8): ZP0/T0 are user-entered;
    // ZP1-4/T1-4 are computed from them (see buildAltitudeTempTable below).
    zp0: 0,
    t0: 15,
    // Zσ1-4 / Dθ1-4 — read off a flight-manual chart per sortie; no formula given in the
    // PPTX, so these are captured-only fields (null = not yet entered). See TODO in
    // computePerformance().
    zSigma1: null, zSigma2: null, zSigma3: null, zSigma4: null,
    dTheta1: null, dTheta2: null, dTheta3: null, dTheta4: null,
    mauw: 2200,               // upper AUW threshold ≈ 4850 Lb
    auwLowerThresholdKg: 2100.13, // lower AUW threshold ≈ 4630 Lb (4630 × 0.453592)
    ratedPowerSHP: 550,
    baselinePowerReqSHP: 420,
    defaultCrew: 0,     // Passenger Weight
    defaultFuel: 460,   // = 575 L × 0.8 kg/L (client spec: 575 lt default)
    defaultAddLoad: 0,
    defaultPayload: 0,  // Load
    defaultElevation: 0,
    defaultQNH: 1013.25,
    defaultTemp: 15,
    jptBase: 220,   // °C — calibrated so default-condition JPT lands ~380-450°C (client spec)
    jptRange: 300,  // °C added from idle to rated power
    jptMax: 500,    // °C — real T4 limit (SA315B/SA316B flight manual: "T4 not to exceed 500°C")
    // Client correction 12-Oct-26: Max collective (power available) at sea level, rising
    // linearly by `collectiveStep` for every 3300 ft of density altitude.
    maxCollectiveSL: 0.75,
    collectiveStep: 0.05,
    // Hover collective required at MAUW, sea level — PLACEHOLDER pending the client's hover
    // power formula (to be confirmed on phone). Sits 0.05 below max collective available.
    hoverCollectiveSL: 0.70,
    collectiveMin: 0.15,  // dimensionless pitch indicator, low/autorotation-entry
    collectiveMax: 1.10,  // dimensionless pitch indicator, near hover/rated-power limit
    idealAutorotationRPM: 353,      // Nr, 100% — real flight-manual figure (both Chetak/Cheetah)
    autorotationRPMRange: [270, 420], // real autorotation Nr band (flight manual)
    // Performance chart config — ref: CHETAK GRAPH + COMMON GRAPHS (SA316B)
    vmaxFactor: 1222, // ~108 kts at 1450 kg, sea level
    rocBase: 2700,   // ~600 ft/min at MAUW, sea level (SA316B ROC chart)
    rocC: 0.22,
  },
  cheetah: {
    id: 'cheetah',
    name: 'Cheetah',
    emptyWeight: 1240,
    basicWeight: 1100,
    equipmentWeight: 0,
    pilotWeight: 70,
    copilotWeight: 70,
    ageingCoefficient: 0,
    jptCorrection: 0,
    zp0: 0,
    t0: 15,
    zSigma1: null, zSigma2: null, zSigma3: null, zSigma4: null,
    dTheta1: null, dTheta2: null, dTheta3: null, dTheta4: null,
    mauw: 2299.71,              // upper AUW threshold ≈ 5070 Lb (5070 × 0.453592) — see note above
    auwLowerThresholdKg: 1950.45, // lower AUW threshold ≈ 4300 Lb (4300 × 0.453592)
    ratedPowerSHP: 550,
    baselinePowerReqSHP: 410,
    defaultCrew: 0,
    defaultFuel: 460,   // = 575 L × 0.8 kg/L
    defaultAddLoad: 0,
    defaultPayload: 0,
    defaultElevation: 0,
    defaultQNH: 1013.25,
    defaultTemp: 15,
    jptBase: 220,
    jptRange: 300,
    jptMax: 500,   // same Artouste IIIB T4 limit as Chetak
    maxCollectiveSL: 0.80,
    collectiveStep: 0.05,
    hoverCollectiveSL: 0.75, // PLACEHOLDER — see Chetak note
    collectiveMin: 0.15,
    collectiveMax: 1.10,  // same rotor/pitch convention as SA316B (shared Lama/Alouette III system)
    idealAutorotationRPM: 353,      // same rotor system as Chetak — same real Nr
    autorotationRPMRange: [270, 420],
    // Performance chart config — ref: CHEETAH GRAPH (Lama)
    vmaxFactor: 1221, // same Lama calibration as CHETAK GRAPH left (~108 kts at 1450 kg)
    rocBase: 3500,
    rocC: 0.25,  // ~875 ft/min at MAUW, sea level
  },
  cheetal: {
    id: 'cheetal',
    name: 'Cheetal',
    emptyWeight: 1290,
    basicWeight: 1150,
    equipmentWeight: 0,
    pilotWeight: 70,
    copilotWeight: 70,
    ageingCoefficient: 0,
    jptCorrection: 0,
    zp0: 0,
    t0: 15,
    zSigma1: null, zSigma2: null, zSigma3: null, zSigma4: null,
    dTheta1: null, dTheta2: null, dTheta3: null, dTheta4: null,
    mauw: 2299.71,              // upper AUW threshold ≈ 5070 Lb (5070 × 0.453592) — was 2250
    auwLowerThresholdKg: 1950.45, // lower AUW threshold ≈ 4300 Lb (4300 × 0.453592)
    ratedPowerSHP: 847,
    baselinePowerReqSHP: 520,
    defaultCrew: 0,
    defaultFuel: 460,   // = 575 L × 0.8 kg/L
    defaultAddLoad: 0,
    defaultPayload: 0,
    defaultElevation: 0,
    defaultQNH: 1013.25,
    defaultTemp: 15,
    // JPT not required/shown for Cheetal (client spec) — kept for data-model consistency only.
    jptBase: 220,
    jptRange: 300,
    jptMax: 500,
    maxCollectiveSL: 0.80,
    collectiveStep: 0.05,
    hoverCollectiveSL: 0.75, // PLACEHOLDER — see Chetak note
    collectiveMin: 0.15,
    collectiveMax: 1.10,  // same Lama/Cheetah-derived rotor & pitch convention (re-engined only)
    idealAutorotationRPM: 353,      // same rotor system as Cheetah (re-engined, rotor unchanged)
    autorotationRPMRange: [270, 420],
    // Performance chart config — higher-power (847 shp vs 550 shp on Cheetah)
    vmaxFactor: 1265, // slightly higher speed envelope from more power
    rocBase: 5000,
    rocC: 0.20,
  },
};

// Autorotation RPM model constants (fitted to the Lama autorotation chart) — per-aircraft so the
// client can retune them from Calculation Setup without a code change.
Object.values(DEFAULT_AIRCRAFT).forEach((a) => {
  a.autoRpmBase = 320;       // rpm at 1300 kg, density altitude 0
  a.autoRpmPerKg = 0.088;    // rpm per extra kg of AUW
  a.autoRpmPer1000ft = 5;    // rpm per 1000 ft of density altitude
  a.autoRpmColdPerDeg = 2.5; // rpm lost per °C below -10°C OAT
});

/**
 * Per-aircraft numeric values the client can tune from the Calculation Setup screen.
 * min/max are sanity bounds: a value outside them (or not a number) is ignored at calculation
 * time and the factory default is used instead, so a typo can never break the app.
 */
export const CALC_VALUE_FIELDS = [
  { group: 'Collective pitch', key: 'maxCollectiveSL', label: 'Max collective at sea level', hint: 'Power available. Chetak 0.75, Cheetah/Cheetal 0.80', min: 0.1, max: 3 },
  { group: 'Collective pitch', key: 'collectiveStep', label: 'Max collective rise per 3300 ft', hint: 'Linear law, 0.05 per 3300 ft', min: 0, max: 1 },
  { group: 'Collective pitch', key: 'hoverCollectiveSL', label: 'Hover collective required (MAUW, sea level)', hint: 'Used by the default hover-power formula', min: 0.05, max: 3 },
  { group: 'Collective pitch', key: 'collectiveMax', label: 'Collective reference maximum', hint: 'Scales hover collective into JPT', min: 0.1, max: 5 },
  { group: 'JPT', key: 'jptBase', label: 'JPT base (°C)', hint: 'JPT at idle', min: 0, max: 1500 },
  { group: 'JPT', key: 'jptRange', label: 'JPT range (°C)', hint: 'Added from idle to full collective', min: 0, max: 1500 },
  { group: 'JPT', key: 'jptMax', label: 'JPT limit (°C)', hint: 'Above this the aircraft is NOT FIT', min: 100, max: 1500 },
  { group: 'Weights', key: 'mauw', label: 'MAUW (kg)', hint: 'Upper AUW limit', min: 500, max: 10000 },
  { group: 'Weights', key: 'auwLowerThresholdKg', label: 'Lower AUW threshold (kg)', hint: 'Used for "Possible payload" (lower)', min: 500, max: 10000 },
  { group: 'Auto RPM', key: 'autoRpmBase', label: 'Auto RPM at 1300 kg, 0 ft', hint: 'rpm', min: 100, max: 600 },
  { group: 'Auto RPM', key: 'autoRpmPerKg', label: 'Auto RPM rise per kg AUW', hint: 'rpm per kg', min: 0, max: 2 },
  { group: 'Auto RPM', key: 'autoRpmPer1000ft', label: 'Auto RPM rise per 1000 ft', hint: 'rpm per 1000 ft density altitude', min: 0, max: 50 },
  { group: 'Auto RPM', key: 'autoRpmColdPerDeg', label: 'Auto RPM cold correction', hint: 'rpm lost per °C below -10°C', min: 0, max: 20 },
  { group: 'Legacy (SHP)', key: 'ratedPowerSHP', label: 'Rated power (shp)', hint: 'Only used by the legacy SHP formulas', min: 1, max: 5000 },
  { group: 'Legacy (SHP)', key: 'baselinePowerReqSHP', label: 'Baseline power required (shp)', hint: 'Only used by the legacy SHP formulas', min: 1, max: 5000 },
];

// Returns a copy of `aircraft` where every tunable value is a finite number inside its bounds;
// anything else is replaced by the factory default. `fixed` lists the keys that were replaced.
export const sanitizeAircraft = (aircraft) => {
  const factory = DEFAULT_AIRCRAFT[aircraft?.id] || {};
  const out = { ...aircraft };
  const fixed = [];
  CALC_VALUE_FIELDS.forEach(({ key, min, max }) => {
    const v = aircraft?.[key];
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      if (factory[key] !== undefined) { out[key] = factory[key]; fixed.push(key); }
    } else {
      out[key] = n;
    }
  });
  return { aircraft: out, fixed };
};

/* ---------------- UNIT CONVERSION ---------------- */
export const CONVERSIONS = {
  ft_to_m: 0.3048,
  m_to_ft: 3.28084,
  kg_to_lb: 2.20462,
  lb_to_kg: 0.453592,
  C_to_F: (c) => (c * 9) / 5 + 32,
  F_to_C: (f) => ((f - 32) * 5) / 9,
  hPa_to_inHg: 0.02953,
  inHg_to_hPa: 33.8639,
  // 1 mmHg = 1.33322 hPa (760 mmHg = 1013.25 hPa). The old 'inHg' code was mislabelled
  // 'mmHg' in the UI, so QNH 760 showed as ~29.
  mmHg_to_hPa: 1.33322,
  hPa_to_mmHg: 0.750062,
};

export const toBaseUnit = (value, unit) => {
  switch (unit) {
    case 'ft': return value;
    case 'm': return value * CONVERSIONS.m_to_ft;
    case 'C': return value;
    case 'F': return CONVERSIONS.F_to_C(value);
    case 'kg': return value;
    case 'lb': return value * CONVERSIONS.lb_to_kg;
    case 'L': return value * 0.8; // Avtur/Jet-A density ≈ 0.800 kg/L
    case 'hPa': return value;
    case 'inHg': return value * CONVERSIONS.inHg_to_hPa;
    case 'mmHg': return value * CONVERSIONS.mmHg_to_hPa;
    default: return value;
  }
};

export const fromBaseUnit = (value, unit) => {
  switch (unit) {
    case 'ft': return value;
    case 'm': return value * CONVERSIONS.ft_to_m;
    case 'C': return value;
    case 'F': return CONVERSIONS.C_to_F(value);
    case 'kg': return value;
    case 'lb': return value * CONVERSIONS.kg_to_lb;
    case 'L': return value / 0.8; // Avtur/Jet-A density ≈ 0.800 kg/L
    case 'hPa': return value;
    case 'inHg': return value * CONVERSIONS.hPa_to_inHg;
    case 'mmHg': return value * CONVERSIONS.hPa_to_mmHg;
    default: return value;
  }
};

/* ---------------- FORMULAS (Editable via Settings) ---------------- */
/**
 * All formulas below follow ICAO ISA standard atmosphere conventions.
 * They are TEXT strings so the user can edit them live on the Settings screen.
 * The logic engine uses a scoped Function constructor to evaluate them with inputs.
 */
export const DEFAULT_FORMULAS = {
  // Pressure Altitude (ft) from elevation (ft) and QNH (hPa)
  PA: 'elevation + (1013.25 - qnh) * 27',
  // ISA Temperature (°C) at a given Pressure Altitude (ft)
  ISA_TEMP: '15 - (pa / 1000) * 1.98',
  // Density Altitude (ft)
  DENSITY_ALT: 'pa + 118.8 * (oat - isa)',
  // Air density (kg/m^3)
  DENSITY: '1.225 * Math.pow(1 - 0.0000068756 * pa, 4.2561) * (288.15 / (oat + 273.15))',
  // Above-ISA temperature deviation (°C)
  AB_TEMP: 'oat - isa',
  // Empty Weight (kg) — client PPTX: EMPTY WEIGHT = BASIC(AIRCRAFT) WEIGHT + EQUIPMENT WEIGHT + PILOT WEIGHT + COPILOT WEIGHT
  EMPTY_WEIGHT: 'basic_weight + equipment_weight + pilot_weight + copilot_weight',
  // All Up Weight (kg) — client PPTX: ALL UP WEIGHT = EMPTY WEIGHT + FUEL WEIGHT + PASSENGER WEIGHT + LOAD
  // (`crew` = Passenger Weight, `payload` = Load — existing field names kept for continuity)
  AUW: 'empty_weight + fuel + crew + payload',
  // Power Available (shp) - derates with density altitude
  POWER_AVAIL: 'rated_power * Math.max(0.55, 1 - (density_alt / 30000))',
  // Power Required (shp) - scales with AUW & density altitude
  POWER_REQ: 'baseline_power_req * (auw / mauw) * (1 + (density_alt / 40000))',
  // Jet Pipe Temperature (°C) - rises with power loading, OAT above ISA, and density altitude
  // Driven by hover collective required (client 12-Oct-26: JPT follows the corrected hover power).
  JPT: 'jpt_base + (collective_req / collective_max) * jpt_range + ab_temp * 1.5 + density_alt / 2000',
  // Collective pitch required to hover at current AUW / conditions (°)
  // Hover collective required — scales with AUW/MAUW, same 0.05 per 3300 ft density-altitude rise as the max collective.
  COLLECTIVE_REQ: '(hover_collective_sl + collective_step * (density_alt / 3300)) * (auw / mauw)',
  // Collective pitch available before engine power limit is reached (°)
  // Max collective (power available): sea-level value + 0.05 per 3300 ft of density altitude (linear).
  COLLECTIVE_AVAIL: 'max_collective_sl + collective_step * (density_alt / 3300)',
  // Headroom: how many additional degrees of collective remain before limit (°)
  COLLECTIVE_BALANCE: 'collective_avail - collective_req',
};

export const FORMULA_META = [
  { key: 'PA', label: 'Pressure Altitude (ft)', vars: 'elevation, qnh' },
  { key: 'ISA_TEMP', label: 'ISA Temperature (°C)', vars: 'pa' },
  { key: 'DENSITY_ALT', label: 'Density Altitude (ft)', vars: 'pa, oat, isa' },
  { key: 'DENSITY', label: 'Air Density (kg/m³)', vars: 'pa, oat' },
  { key: 'AB_TEMP', label: 'AB Temperature (°C)', vars: 'oat, isa' },
  { key: 'EMPTY_WEIGHT', label: 'Empty Weight (kg)', vars: 'basic_weight, equipment_weight, pilot_weight, copilot_weight' },
  { key: 'AUW', label: 'All Up Weight (kg)', vars: 'empty_weight, fuel, crew, payload' },
  { key: 'POWER_AVAIL', label: 'Power Available (shp)', vars: 'rated_power, density_alt' },
  { key: 'POWER_REQ', label: 'Power Required (shp)', vars: 'baseline_power_req, auw, mauw, density_alt' },
  { key: 'JPT', label: 'Jet Pipe Temperature (°C)', vars: 'collective_req, collective_max, jpt_base, jpt_range, ab_temp, density_alt' },
  { key: 'COLLECTIVE_REQ', label: 'Hover Collective Pitch Required', vars: 'hover_collective_sl, collective_step, density_alt, auw, mauw' },
  { key: 'COLLECTIVE_AVAIL', label: 'Max Collective Pitch Available', vars: 'max_collective_sl, collective_step, density_alt' },
  { key: 'COLLECTIVE_BALANCE', label: 'Collective Headroom (°)', vars: 'collective_req, collective_avail' },
];

/* ---------------- WIZARD FIELDS (Operational Inputs step order + limits) ---------------- */
/**
 * Limits are expressed in BASE units (ft, °C, kg, hPa) — the same units
 * `inputs` are stored in. The wizard converts to/from the display unit
 * for validation messages.
 */
export const WIZARD_FIELDS = [
  { key: 'elevation', label: 'Elevation', unitKey: 'altitude', unitOptions: ['ft', 'm'], min: 0, max: 20000 },
  { key: 'qnh', label: 'QNH (Nautical Height)', unitKey: 'pressure', unitOptions: ['hPa', 'mmHg'], min: 850, max: 1050 },
  { key: 'temperature', label: 'Temperature', unitKey: 'temperature', unitOptions: ['C', 'F'], min: -20, max: 50 },
  { key: 'acWeight', label: 'Aircraft Weight', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 500, max: 3000 },
  { key: 'crewWeight', label: 'Crew Weight', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 0, max: 500 },
  { key: 'fuel', label: 'Fuel Onboard', unitKey: 'fuel', unitOptions: ['L', 'kg', 'lb'], min: 0, max: 500 },
  { key: 'additionalLoad', label: 'Additional Load', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 0, max: 500 },
  { key: 'payload', label: 'Load', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 0, max: 800 },
];

/* ---------------- CALC ENGINE ---------------- */
// Evaluates one formula; reports failure instead of silently returning 0.
const tryEval = (expr, ctx) => {
  try {
    if (typeof expr !== 'string' || !expr.trim()) return { ok: false, error: 'Formula is empty' };
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(ctx), `"use strict"; return (${expr});`);
    const value = fn(...Object.values(ctx));
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: 'Result is not a finite number' };
    }
    return { ok: true, value };
  } catch (e) {
    return {
      ok: false,
      error: e?.name === 'SyntaxError'
        ? 'Syntax error — check brackets, operators and decimal points'
        : String(e?.message || e),
    };
  }
};

// Fault-tolerant evaluation: uses the client's formula; if it throws or gives a non-finite
// number, falls back to the factory formula (and records the key in `issues`).
const evalFormula = (key, formulas, ctx, issues) => {
  const custom = tryEval(formulas?.[key], ctx);
  if (custom.ok) return custom.value;
  if (issues && formulas?.[key] !== DEFAULT_FORMULAS[key]) issues.add(key);
  const factory = tryEval(DEFAULT_FORMULAS[key], ctx);
  return factory.ok ? factory.value : 0;
};

const SAMPLE_VARS = {
  elevation: 1000, qnh: 1013.25, oat: 15, pa: 1000, isa: 13, density_alt: 1000, ab_temp: 2,
  basic_weight: 1300, equipment_weight: 0, pilot_weight: 70, copilot_weight: 70, empty_weight: 1440,
  fuel: 460, crew: 0, payload: 0, add_load: 0, auw: 1900, mauw: 2200,
  rated_power: 550, baseline_power_req: 420, power_avail: 500, power_req: 400,
  jpt_base: 220, jpt_range: 300, collective_min: 0.15, collective_max: 1.1,
  max_collective_sl: 0.75, hover_collective_sl: 0.7, collective_step: 0.05,
  collective_req: 0.6, collective_avail: 0.75,
};

// Checks a formula before it is saved: must compile, use only the documented variables, and
// return a finite number for typical sample values.
export const validateFormula = (key, expr) => {
  const meta = FORMULA_META.find((m) => m.key === key);
  if (!meta) return { ok: false, error: 'Unknown formula' };
  const ctx = {};
  meta.vars.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => { ctx[v] = SAMPLE_VARS[v] ?? 1; });
  const r = tryEval(expr, ctx);
  if (!r.ok) {
    const m = /(\w+) is not defined/.exec(r.error);
    return { ok: false, error: m ? `Unknown variable "${m[1]}". Allowed: ${meta.vars}` : r.error };
  }
  return { ok: true, sample: r.value };
};

// Keeps only saved formulas that still validate; everything else reverts to the factory formula.
export const sanitizeFormulas = (saved) => {
  const out = { ...DEFAULT_FORMULAS };
  Object.keys(DEFAULT_FORMULAS).forEach((k) => {
    const expr = saved?.[k];
    if (typeof expr === 'string' && expr !== DEFAULT_FORMULAS[k] && validateFormula(k, expr).ok) out[k] = expr;
  });
  return out;
};

// Only the formulas that differ from factory — this is what gets persisted, so a later
// change to a factory formula still reaches formulas the client never touched.
export const formulaOverrides = (formulas) => {
  const o = {};
  Object.keys(DEFAULT_FORMULAS).forEach((k) => {
    if (formulas?.[k] !== undefined && formulas[k] !== DEFAULT_FORMULAS[k]) o[k] = formulas[k];
  });
  return o;
};

const round = (n, p = 2) => Math.round(n * Math.pow(10, p)) / Math.pow(10, p);

// ⚠️ PLACEHOLDER — UNVERIFIED, PENDING CLIENT SIGN-OFF (TASK-100) ⚠️
// Zσ1-4/Dθ1-4 (Default Settings page 2) and Ageing Coefficient/JPT Correction (page 1) are
// read off a flight-manual chart per sortie, but the client's PPTX never states an
// interpolation method for Zσ/Dθ or a modifier formula for Ageing/JPT Correction — it only
// says Dθ is "max collective pitch/max power AS PER THE EQUATION" without giving the
// equation. This is safety-relevant aviation data, so the corrections below are a
// conventional-engineering default (linear interpolation / additive offset), NOT a client-
// confirmed formula. They are inert (produce a 0 correction) unless a user has actually
// entered chart readings, so existing behavior is unchanged for anyone who hasn't. Do not
// treat this as flight-certified until the client confirms or replaces it.
//
// Linearly interpolates a chart value (Zσn or Dθn) at pressure altitude `pa`, anchored at
// (ZP0, 0) since there is no chart reading below the aircraft's own ZP0 reference. Stops at
// the first missing/unentered point, so a partially-filled table still interpolates over
// whatever prefix of ZP1-4 the user has actually read off their chart.
const interpolateChartValue = (aircraft, pa, key) => {
  const zp0 = Number(aircraft.zp0) || 0;
  const points = [{ zp: zp0, v: 0 }];
  for (let n = 1; n <= 4; n += 1) {
    const raw = aircraft[`${key}${n}`];
    if (raw === null || raw === undefined || raw === '') break;
    points.push({ zp: zp0 + n * 2000, v: Number(raw) });
  }
  if (points.length < 2) return 0;
  if (pa <= points[0].zp) return points[0].v;
  const last = points[points.length - 1];
  if (pa >= last.zp) return last.v;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (pa >= a.zp && pa <= b.zp) {
      const t = (pa - a.zp) / (b.zp - a.zp);
      return a.v + t * (b.v - a.v);
    }
  }
  return 0;
};

export const computePerformance = (inputs, formulas = DEFAULT_FORMULAS) => {
  // Fault tolerance: invalid client values fall back to factory defaults, and a formula that
  // fails falls back to the factory formula — the app always produces a result.
  const { aircraft, fixed: fixedValues } = sanitizeAircraft(inputs.aircraft);
  const issues = new Set();
  const ev = (key, ctx) => evalFormula(key, formulas, ctx, issues);

  const baseCtx = {
    elevation: Number(inputs.elevation) || 0,
    qnh: Number(inputs.qnh) || 1013.25,
    oat: Number(inputs.temperature) || 15,
    // Legacy single-figure aircraft weight — kept in ctx for custom/user-edited formulas
    // (Settings screen) that may still reference it, but the default AUW formula below no
    // longer uses it directly; empty weight is now the sum of the four fields below.
    ac_weight: Number(inputs.acWeight) || aircraft.emptyWeight,
    // Weight breakdown (client PPTX) — stored per-aircraft on `aircraft`, editable from both
    // Default Settings and Hover Power Calculation (single source of truth, so edits on either
    // screen are automatically visible on the other).
    basic_weight: Number(aircraft.basicWeight) || 0,
    equipment_weight: Number(aircraft.equipmentWeight) || 0,
    pilot_weight: Number(aircraft.pilotWeight) || 0,
    copilot_weight: Number(aircraft.copilotWeight) || 0,
    crew: Number(inputs.crewWeight) || 0, // "Passenger Weight" field
    fuel: Number(inputs.fuel) || 0,
    payload: Number(inputs.payload) || 0, // "Load" field
    // additionalLoad/add_load has no place in the client's explicit 4-term AUW formula
    // (EMPTY WEIGHT + FUEL + PASSENGER WEIGHT + LOAD) — kept in ctx harmlessly for any
    // custom formula that still references it, but unused by the default AUW below.
    add_load: Number(inputs.additionalLoad) || 0,
    mauw: aircraft.mauw,
    rated_power: aircraft.ratedPowerSHP,
    baseline_power_req: aircraft.baselinePowerReqSHP,
  };

  const PA = ev('PA', baseCtx);
  const ISA_TEMP = ev('ISA_TEMP', { ...baseCtx, pa: PA });
  const DENSITY_ALT_RAW = ev('DENSITY_ALT', { ...baseCtx, pa: PA, isa: ISA_TEMP });
  // Placeholder chart correction (see interpolateChartValue above) — 0 unless Zσ1-4 entered.
  const ZSIGMA_CORRECTION = interpolateChartValue(aircraft, PA, 'zSigma');
  const DENSITY_ALT = DENSITY_ALT_RAW + ZSIGMA_CORRECTION;
  const DENSITY = ev('DENSITY', { ...baseCtx, pa: PA });
  const AB_TEMP = ev('AB_TEMP', { ...baseCtx, isa: ISA_TEMP });
  const EMPTY_WEIGHT = ev('EMPTY_WEIGHT', baseCtx);
  const AUW = ev('AUW', { ...baseCtx, empty_weight: EMPTY_WEIGHT });
  const POWER_AVAIL_RAW = ev('POWER_AVAIL', {
    ...baseCtx, density_alt: DENSITY_ALT, auw: AUW,
  });
  // Placeholder Ageing Coefficient derating (see block comment above) — treated as a percent
  // power derating; 0 unless the user has entered a non-zero Ageing Coefficient.
  const ageingFactor = Math.max(0, 1 - (Number(aircraft.ageingCoefficient) || 0) / 100);
  const POWER_AVAIL = POWER_AVAIL_RAW * ageingFactor;
  const POWER_REQ = ev('POWER_REQ', {
    ...baseCtx, density_alt: DENSITY_ALT, auw: AUW,
  });

  const AUW_MARGIN = aircraft.mauw - AUW;
  const powerHeadroomFactor = POWER_REQ > 0
    ? Math.max(0, (POWER_AVAIL - POWER_REQ) / POWER_REQ)
    : 0;
  const PAYLOAD_MARGIN = Math.round(
    Math.min(Math.max(AUW_MARGIN, 0), AUW * powerHeadroomFactor)
  );

  // "Possible Payload for <threshold>" (client PPTX slides 9-11) — max Load still achievable
  // within each AUW threshold, i.e. threshold minus everything except Load itself. Not a new
  // physics formula, just a margin against the two stored thresholds (see DEFAULT_AIRCRAFT).
  const nonLoadWeight = EMPTY_WEIGHT + baseCtx.fuel + baseCtx.crew;
  const POSSIBLE_PAYLOAD_LOWER = round((aircraft.auwLowerThresholdKg ?? aircraft.mauw) - nonLoadWeight);
  const POSSIBLE_PAYLOAD_UPPER = round(aircraft.mauw - nonLoadWeight);

  const collectiveCtx = {
    ...baseCtx,
    power_req: POWER_REQ,
    power_avail: POWER_AVAIL,
    collective_min: aircraft.collectiveMin ?? 0.15,
    collective_max: aircraft.collectiveMax ?? 1.1,
    max_collective_sl: aircraft.maxCollectiveSL ?? 0.75,
    hover_collective_sl: aircraft.hoverCollectiveSL ?? 0.7,
    collective_step: aircraft.collectiveStep ?? 0.05,
    density_alt: DENSITY_ALT,
    auw: AUW,
  };
  // Placeholder chart correction (see interpolateChartValue above) — 0 unless Dθ1-4 entered.
  const DTHETA_CORRECTION = interpolateChartValue(aircraft, PA, 'dTheta');
  const COLLECTIVE_REQ = ev('COLLECTIVE_REQ', collectiveCtx) + DTHETA_CORRECTION;
  const COLLECTIVE_AVAIL = ev('COLLECTIVE_AVAIL', collectiveCtx);
  const COLLECTIVE_BALANCE = ev('COLLECTIVE_BALANCE', {
    ...collectiveCtx,
    collective_req: COLLECTIVE_REQ,
    collective_avail: COLLECTIVE_AVAIL,
  });

  const JPT_RAW = ev('JPT', {
    ...baseCtx,
    power_req: POWER_REQ,
    collective_req: COLLECTIVE_REQ,
    collective_max: aircraft.collectiveMax ?? 1.1,
    ab_temp: AB_TEMP,
    density_alt: DENSITY_ALT,
    jpt_base: aircraft.jptBase ?? 600,
    jpt_range: aircraft.jptRange ?? 200,
  });
  // Placeholder JPT Correction (see block comment above) — treated as a direct additive
  // offset; 0 unless the user has entered a non-zero JPT Correction.
  const JPT = JPT_RAW + (Number(aircraft.jptCorrection) || 0);

  // Margin of max collective over hover collective required (collective-based, not SHP).
  const POWER_BALANCE_PCT = COLLECTIVE_AVAIL > 0
    ? Math.round(((COLLECTIVE_AVAIL - COLLECTIVE_REQ) / COLLECTIVE_AVAIL) * 100)
    : 0;

  // Fit to Fly checks (0.01 precision)
  const reasons = [];
  if (AUW - aircraft.mauw > 0.01) {
    reasons.push(`AUW ${AUW.toFixed(2)}kg exceeds MAUW ${aircraft.mauw}kg`);
  }
  if (COLLECTIVE_REQ - COLLECTIVE_AVAIL > 0.01) {
    reasons.push('Power required is more than Power Available');
  }
  if (DENSITY_ALT > 18000) {
    reasons.push(`Density Altitude ${Math.round(DENSITY_ALT)}ft above service ceiling`);
  }
  if (AB_TEMP > 35) {
    reasons.push(`Temperature +${AB_TEMP.toFixed(1)}°C above ISA exceeds limit`);
  }
  if (JPT > (aircraft.jptMax ?? 870)) {
    reasons.push(`JPT ${JPT.toFixed(0)}°C exceeds limit ${aircraft.jptMax ?? 870}°C`);
  }

  // Non-blocking notices — only populated when an unverified placeholder correction
  // (TASK-100) actually altered a result, so callers/UI can surface it if desired.
  const warnings = [];
  if (ZSIGMA_CORRECTION !== 0 || DTHETA_CORRECTION !== 0) {
    warnings.push('Zσ/Dθ chart calibration correction applied — uses an unverified interpolation method, not yet confirmed by the client.');
  }
  if (aircraft.ageingCoefficient) {
    warnings.push('Ageing Coefficient correction applied — uses an unverified derating formula, not yet confirmed by the client.');
  }
  if (aircraft.jptCorrection) {
    warnings.push('JPT Correction applied — uses an unverified additive-offset formula, not yet confirmed by the client.');
  }

  issues.forEach((k) => {
    const label = FORMULA_META.find((m) => m.key === k)?.label ?? k;
    warnings.push(`Custom formula "${label}" failed — the factory formula was used instead.`);
  });
  fixedValues.forEach((k) => {
    const label = CALC_VALUE_FIELDS.find((f) => f.key === k)?.label ?? k;
    warnings.push(`Value "${label}" was invalid — the factory default was used instead.`);
  });

  return {
    PA: round(PA),
    ISA_TEMP: round(ISA_TEMP),
    DENSITY_ALT: round(DENSITY_ALT),
    DENSITY: round(DENSITY, 4),
    AB_TEMP: round(AB_TEMP),
    EMPTY_WEIGHT: round(EMPTY_WEIGHT),
    AUW: round(AUW),
    POWER_AVAIL: round(POWER_AVAIL),
    POWER_REQ: round(POWER_REQ),
    POWER_BALANCE_PCT,
    AUW_MARGIN: round(AUW_MARGIN),
    PAYLOAD_MARGIN,
    POSSIBLE_PAYLOAD_LOWER,
    POSSIBLE_PAYLOAD_UPPER,
    JPT: round(JPT),
    COLLECTIVE_REQ: round(COLLECTIVE_REQ, 2),
    COLLECTIVE_AVAIL: round(COLLECTIVE_AVAIL, 2),
    COLLECTIVE_BALANCE: round(COLLECTIVE_BALANCE, 2),
    status: reasons.length === 0 ? 'FIT' : 'NOT_FIT',
    reasons,
    warnings,
  };
};

/* ---------------- AUW vs ALTITUDE LIMIT CURVE (hover ceiling) ---------------- */
export const buildAUWvsAltitudeCurve = (aircraft, formulas = DEFAULT_FORMULAS) => {
  const ev = (key, ctx) => evalFormula(key, formulas, ctx);
  const points = [];
  for (let altK = 0; altK <= 20; altK += 1) {
    const pa = altK * 1000;
    const densityAlt = pa;
    const pAvail = ev('POWER_AVAIL', {
      rated_power: aircraft.ratedPowerSHP,
      density_alt: densityAlt,
    });
    const factor = 1 + densityAlt / 40000;
    const maxAUW = (pAvail * aircraft.mauw) / (aircraft.baselinePowerReqSHP * factor);
    points.push({ x: altK, y: Math.max(1200, Math.round(Math.min(maxAUW, aircraft.mauw * 1.05))) });
  }
  return points;
};

/* ---------------- PERFORMANCE CHARTS (aircraft-specific) ---------------- */
// Ref: CHETAK GRAPH "Maximum Speed in Level Flight" (vmax)
//      CHEETAH GRAPH "Rate of Climb" / Lama manual (roc)

export const CHART_DA_MAX = 22000;   // ft — Y-axis upper limit
export const CHART_VMAX_MIN = 50;    // knots
export const CHART_VMAX_MAX = 130;   // knots
export const CHART_ROC_MAX = 2000;   // ft/min
export const CHART_RPM_MIN = 250;    // rpm — a little below the real 270 rpm autorotation floor
export const CHART_RPM_MAX = 440;    // rpm — a little above the real 420 rpm autorotation ceiling

// Five evenly-spaced reference AUW values from 20 % above empty to MAUW
export const getChartRefAuws = (aircraft) => {
  const lo = aircraft.emptyWeight + Math.round((aircraft.mauw - aircraft.emptyWeight) * 0.2);
  const step = (aircraft.mauw - lo) / 4;
  return Array.from({ length: 5 }, (_, i) => Math.round(lo + i * step));
};

// Power-available fraction for level-flight speed (exponential with altitude)
const _pAvailVmax = (da) => Math.exp(-da / 20000);

// Power-available fraction for climb (linear, gentler — Lama operates to ~24 kft)
const _pAvailRoc = (da) => Math.max(0.2, 1 - da / 60000);

// Max speed (knots) at density altitude da_ft and AUW auw_kg
// Formula: Vmax ∝ P_avail^(1/3) / AUW^(1/3), calibrated to chart data
export const computeVmaxKnots = (aircraft, da_ft, auw_kg) =>
  Math.max(0, aircraft.vmaxFactor * Math.pow(_pAvailVmax(da_ft), 1 / 3) / Math.pow(auw_kg, 1 / 3));

// Rate of climb (ft/min) at density altitude da_ft and AUW auw_kg
// Linear excess-power model calibrated to Lama ROC chart
export const computeROCFpm = (aircraft, da_ft, auw_kg) =>
  Math.max(0, aircraft.rocBase * (_pAvailRoc(da_ft) - auw_kg / aircraft.mauw + aircraft.rocC));

// RPM in Autorotation — client correction 12-Oct-26: Auto RPM changes with AUW and altitude.
// Fitted to the Lama "4 - AUTOROTATION" chart (HAL-graphs/CHETAK GRAPH): the weight lines are
// near-straight, ~parallel lines of Nr vs density altitude:
//   Nr(DA=0)  ≈ 320 rpm at 1300 kg, rising ≈ 0.088 rpm per extra kg (≈ 381 rpm at 1990 kg)
//   slope     ≈ 5 rpm per 1000 ft of density altitude
// Check against the chart's worked example (1500 kg, Hd 9500 ft, OAT -10°C → 385 rpm): 386.
// Chart note: below -10°C reduce by 5 rpm per 2°C decrement. Clamped to the 270-420 band.
export const computeAutorotationRPM = (aircraft, da_ft = 0, auw_kg = 1300, oat_c = 15) => {
  const [rpmMin, rpmMax] = aircraft.autorotationRPMRange ?? [270, 420];
  const { aircraft: ac } = sanitizeAircraft(aircraft);
  let rpm = ac.autoRpmBase
    + ac.autoRpmPerKg * (auw_kg - 1300)
    + ac.autoRpmPer1000ft * (da_ft / 1000);
  if (oat_c < -10) rpm -= ac.autoRpmColdPerDeg * (-10 - oat_c);
  return Math.round(Math.min(rpmMax, Math.max(rpmMin, rpm)));
};

// Autorotation RPM vs density altitude, one line per reference AUW (same shape as vmax/roc).
export const buildAutorotationRPMLines = (aircraft) => {
  const daSteps = Array.from({ length: 45 }, (_, i) => i * 500);
  return getChartRefAuws(aircraft).map((auw) => ({
    auw,
    points: daSteps.map((da) => ({ da, value: computeAutorotationRPM(aircraft, da, auw) }))
      .filter((p) => p.value < (aircraft.autorotationRPMRange?.[1] ?? 420)),
  }));
};

// Build the five reference AUW curves for the performance chart.
// type: 'vmax' | 'roc' — pass explicitly so either chart can be built for any aircraft.
// 'autorotation-rpm' uses buildAutorotationRPMLines() instead (flat lines, not AUW curves).
export const buildPerformanceCurves = (aircraft, type) => {
  const refAuws = getChartRefAuws(aircraft);
  const daSteps = Array.from({ length: 45 }, (_, i) => i * 500);
  const valueAt = (da, auw) => (type === 'vmax'
    ? Math.round(computeVmaxKnots(aircraft, da, auw))
    : Math.round(computeROCFpm(aircraft, da, auw)));
  return refAuws.map((auw) => ({
    auw,
    points: daSteps.map((da) => ({ da, value: valueAt(da, auw) }))
      .filter((p) => p.value > (type === 'vmax' ? 40 : 0)),
  }));
};

// Current operating point to plot on the performance chart.
export const computeCurrentPerfPoint = (aircraft, da_ft, auw_kg, type, oat_c = 15) => {
  let value;
  if (type === 'vmax') value = Math.round(computeVmaxKnots(aircraft, da_ft, auw_kg));
  else if (type === 'autorotation-rpm') value = computeAutorotationRPM(aircraft, da_ft, auw_kg, oat_c);
  else value = Math.round(computeROCFpm(aircraft, da_ft, auw_kg));
  return { da: da_ft, value };
};

/* ---- PA vs Density Altitude ISA conversion chart (COMMON GRAPHS bottom-right) ---- */
// Formula: DA = PA × 1.23526 + 118.8 × (OAT − 15)
// Rearranged: PA = (DA − 118.8 × (OAT − 15)) / 1.23526
const _ISA_K = 1 + 118.8 * (1.98 / 1000); // ≈ 1.23526

export const CHART_OAT_MIN = -30;
export const CHART_OAT_MAX = 50;
export const CHART_PA_MAX = 20000;
export const CHART_PA_DA_CONTOURS = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000];

/* ---------------- DEFAULT SETTINGS — ZPn/Tn REFERENCE TABLE (page 2/2) ---------------- */
// Client PPTX slide 8: ZPn = ZP0 + 2000n ft (computed), Tn = T0 - (2n × 1.98) °C (computed) —
// same 1.98 lapse-rate constant already used by ISA_TEMP above. ZP0/T0 themselves are plain
// user-entered fields on `aircraft` (see DEFAULT_AIRCRAFT) — no formula given for them.
export const buildAltitudeTempTable = (aircraft) => {
  const zp0 = Number(aircraft.zp0) || 0;
  const t0 = Number(aircraft.t0) || 0;
  return Array.from({ length: 4 }, (_, i) => {
    const n = i + 1;
    return {
      n,
      zp: zp0 + 2000 * n,
      t: round(t0 - n * 2 * 1.98),
    };
  });
};

/* ---------------- HOVER POWER CALCULATION — JPT vs DENSITY ALTITUDE ---------------- */
// "JPT Calculation on Graph" (client PPTX slides 9/10) — sweeps the EXISTING JPT/POWER_REQ
// formulas across a density-altitude range at the current AUW, holding the current
// above-ISA deviation constant. Reuses the already-computed formulas verbatim; no new
// physics is introduced.
export const buildJPTvsDACurve = (aircraft, abTemp, auwKg, formulas = DEFAULT_FORMULAS) => {
  const ev = (key, ctx) => evalFormula(key, formulas, ctx);
  const points = [];
  for (let da = 0; da <= 20000; da += 1000) {
    const collective_req = ev('COLLECTIVE_REQ', {
      hover_collective_sl: aircraft.hoverCollectiveSL ?? 0.7,
      collective_step: aircraft.collectiveStep ?? 0.05,
      auw: auwKg,
      mauw: aircraft.mauw,
      density_alt: da,
    });
    const jpt = ev('JPT', {
      collective_req,
      collective_max: aircraft.collectiveMax ?? 1.1,
      jpt_base: aircraft.jptBase ?? 600,
      jpt_range: aircraft.jptRange ?? 200,
      ab_temp: abTemp,
      density_alt: da,
    });
    points.push({ da, jpt: round(jpt) });
  }
  return points;
};

export const buildPADAContours = () =>
  CHART_PA_DA_CONTOURS.map((da) => {
    const points = [];
    for (let oat = CHART_OAT_MIN; oat <= CHART_OAT_MAX; oat += 1) {
      const pa = (da - 118.8 * (oat - 15)) / _ISA_K;
      if (pa >= 0 && pa <= CHART_PA_MAX) points.push({ oat, pa });
    }
    return { da, points };
  });
