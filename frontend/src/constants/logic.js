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
  JPT: 'jpt_base + (power_req / rated_power) * jpt_range + ab_temp * 1.5 + density_alt / 2000',
  // Collective pitch required to hover at current AUW / conditions (°)
  COLLECTIVE_REQ: 'collective_min + (power_req / rated_power) * (collective_max - collective_min)',
  // Collective pitch available before engine power limit is reached (°)
  COLLECTIVE_AVAIL: 'collective_min + (power_avail / rated_power) * (collective_max - collective_min)',
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
  { key: 'JPT', label: 'Jet Pipe Temperature (°C)', vars: 'power_req, rated_power, jpt_base, jpt_range, ab_temp, density_alt' },
  { key: 'COLLECTIVE_REQ', label: 'Collective Pitch Required (°)', vars: 'power_req, rated_power, collective_min, collective_max' },
  { key: 'COLLECTIVE_AVAIL', label: 'Collective Pitch Available (°)', vars: 'power_avail, rated_power, collective_min, collective_max' },
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
  { key: 'qnh', label: 'QNH (Nautical Height)', unitKey: 'pressure', unitOptions: ['hPa', 'inHg'], min: 850, max: 1050 },
  { key: 'temperature', label: 'Temperature', unitKey: 'temperature', unitOptions: ['C', 'F'], min: -20, max: 50 },
  { key: 'acWeight', label: 'Aircraft Weight', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 500, max: 3000 },
  { key: 'crewWeight', label: 'Crew Weight', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 0, max: 500 },
  { key: 'fuel', label: 'Fuel Onboard', unitKey: 'fuel', unitOptions: ['L', 'kg', 'lb'], min: 0, max: 500 },
  { key: 'additionalLoad', label: 'Additional Load', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 0, max: 500 },
  { key: 'payload', label: 'Load', unitKey: 'weight', unitOptions: ['kg', 'lb'], min: 0, max: 800 },
];

/* ---------------- CALC ENGINE ---------------- */
const safeEval = (expr, ctx) => {
  try {
    const keys = Object.keys(ctx);
    const vals = Object.values(ctx);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return (${expr});`);
    const result = fn(...vals);
    if (typeof result !== 'number' || !isFinite(result)) return 0;
    return result;
  } catch {
    return 0;
  }
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
  const { aircraft } = inputs;

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

  const PA = safeEval(formulas.PA, baseCtx);
  const ISA_TEMP = safeEval(formulas.ISA_TEMP, { ...baseCtx, pa: PA });
  const DENSITY_ALT_RAW = safeEval(formulas.DENSITY_ALT, { ...baseCtx, pa: PA, isa: ISA_TEMP });
  // Placeholder chart correction (see interpolateChartValue above) — 0 unless Zσ1-4 entered.
  const ZSIGMA_CORRECTION = interpolateChartValue(aircraft, PA, 'zSigma');
  const DENSITY_ALT = DENSITY_ALT_RAW + ZSIGMA_CORRECTION;
  const DENSITY = safeEval(formulas.DENSITY, { ...baseCtx, pa: PA });
  const AB_TEMP = safeEval(formulas.AB_TEMP, { ...baseCtx, isa: ISA_TEMP });
  const EMPTY_WEIGHT = safeEval(formulas.EMPTY_WEIGHT, baseCtx);
  const AUW = safeEval(formulas.AUW, { ...baseCtx, empty_weight: EMPTY_WEIGHT });
  const POWER_AVAIL_RAW = safeEval(formulas.POWER_AVAIL, {
    ...baseCtx, density_alt: DENSITY_ALT, auw: AUW,
  });
  // Placeholder Ageing Coefficient derating (see block comment above) — treated as a percent
  // power derating; 0 unless the user has entered a non-zero Ageing Coefficient.
  const ageingFactor = Math.max(0, 1 - (Number(aircraft.ageingCoefficient) || 0) / 100);
  const POWER_AVAIL = POWER_AVAIL_RAW * ageingFactor;
  const POWER_REQ = safeEval(formulas.POWER_REQ, {
    ...baseCtx, density_alt: DENSITY_ALT, auw: AUW,
  });

  const POWER_BALANCE_PCT = POWER_AVAIL > 0
    ? Math.round(((POWER_AVAIL - POWER_REQ) / POWER_AVAIL) * 100)
    : 0;

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

  const JPT_RAW = safeEval(formulas.JPT, {
    ...baseCtx,
    power_req: POWER_REQ,
    ab_temp: AB_TEMP,
    density_alt: DENSITY_ALT,
    jpt_base: aircraft.jptBase ?? 600,
    jpt_range: aircraft.jptRange ?? 200,
  });
  // Placeholder JPT Correction (see block comment above) — treated as a direct additive
  // offset; 0 unless the user has entered a non-zero JPT Correction.
  const JPT = JPT_RAW + (Number(aircraft.jptCorrection) || 0);

  const collectiveCtx = {
    ...baseCtx,
    power_req: POWER_REQ,
    power_avail: POWER_AVAIL,
    collective_min: aircraft.collectiveMin ?? 2,
    collective_max: aircraft.collectiveMax ?? 13,
  };
  // Placeholder chart correction (see interpolateChartValue above) — 0 unless Dθ1-4 entered.
  const DTHETA_CORRECTION = interpolateChartValue(aircraft, PA, 'dTheta');
  const COLLECTIVE_REQ = safeEval(formulas.COLLECTIVE_REQ, collectiveCtx) + DTHETA_CORRECTION;
  const COLLECTIVE_AVAIL = safeEval(formulas.COLLECTIVE_AVAIL, collectiveCtx);
  const COLLECTIVE_BALANCE = safeEval(formulas.COLLECTIVE_BALANCE, {
    ...collectiveCtx,
    collective_req: COLLECTIVE_REQ,
    collective_avail: COLLECTIVE_AVAIL,
  });

  // Fit to Fly checks (0.01 precision)
  const reasons = [];
  if (AUW - aircraft.mauw > 0.01) {
    reasons.push(`AUW ${AUW.toFixed(2)}kg exceeds MAUW ${aircraft.mauw}kg`);
  }
  if (POWER_REQ - POWER_AVAIL > 0.01) {
    reasons.push(`Power Required ${POWER_REQ.toFixed(2)} > Power Available ${POWER_AVAIL.toFixed(2)} shp`);
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
  const points = [];
  for (let altK = 0; altK <= 20; altK += 1) {
    const pa = altK * 1000;
    const densityAlt = pa;
    const pAvail = safeEval(formulas.POWER_AVAIL, {
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

// RPM in Autorotation (client correction, 2026-09-14, sourced from the actual SA315B Lama
// flight manual — same rotor system as Chetak's Alouette III, and Cheetal is a re-engined
// Cheetah on the same unchanged rotor): main rotor speed (Nr) is GOVERNED at a constant
// 353 rpm (100%) in powered flight — it is not a function of AUW or density altitude the
// way vmax/roc are. In autorotation the pilot manages Nr within a 270-420 rpm band; there is
// no chart or equation giving a "required" Nr that varies with weight/altitude (unlike
// vmax/roc, which do have manual-sourced charts) — the correct, honest representation is the
// real governed target plus its real operating band, not an invented weight/altitude curve.
export const computeAutorotationRPM = (aircraft) => aircraft.idealAutorotationRPM ?? 353;

// Three flat reference lines (min / ideal / max of the real 270-353-420 rpm band) instead of
// the 5 AUW-weight curves used by vmax/roc — Nr doesn't vary by AUW, so those don't apply here.
export const buildAutorotationRPMLines = (aircraft) => {
  const [rpmMin, rpmMax] = aircraft.autorotationRPMRange ?? [270, 420];
  const ideal = computeAutorotationRPM(aircraft);
  const daSteps = Array.from({ length: 45 }, (_, i) => i * 500);
  const flatLine = (label, value) => ({
    auw: label,
    points: daSteps.map((da) => ({ da, value })),
  });
  return [
    flatLine(`Max (${rpmMax})`, rpmMax),
    flatLine(`Ideal (${ideal})`, ideal),
    flatLine(`Min (${rpmMin})`, rpmMin),
  ];
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
export const computeCurrentPerfPoint = (aircraft, da_ft, auw_kg, type) => {
  let value;
  if (type === 'vmax') value = Math.round(computeVmaxKnots(aircraft, da_ft, auw_kg));
  else if (type === 'autorotation-rpm') value = computeAutorotationRPM(aircraft);
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
  const points = [];
  for (let da = 0; da <= 20000; da += 1000) {
    const power_req = safeEval(formulas.POWER_REQ, {
      baseline_power_req: aircraft.baselinePowerReqSHP,
      auw: auwKg,
      mauw: aircraft.mauw,
      density_alt: da,
    });
    const jpt = safeEval(formulas.JPT, {
      power_req,
      rated_power: aircraft.ratedPowerSHP,
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
