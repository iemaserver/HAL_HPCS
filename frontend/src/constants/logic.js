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

export const DEFAULT_AIRCRAFT = {
  chetak: {
    id: 'chetak',
    name: 'Chetak',
    emptyWeight: 1165,
    mauw: 2200,
    ratedPowerSHP: 550,
    baselinePowerReqSHP: 420,
    defaultCrew: 180,
    defaultFuel: 250,
    defaultAddLoad: 0,
    defaultPayload: 400,
    defaultElevation: 0,
    defaultQNH: 1013.25,
    defaultTemp: 15,
    // Performance chart config — ref: CHETAK GRAPH + COMMON GRAPHS (SA316B)
    vmaxFactor: 1222, // ~108 kts at 1450 kg, sea level
    rocBase: 2700,   // ~600 ft/min at MAUW, sea level (SA316B ROC chart)
    rocC: 0.22,
  },
  cheetah: {
    id: 'cheetah',
    name: 'Cheetah',
    emptyWeight: 1120,
    mauw: 1950,
    ratedPowerSHP: 550,
    baselinePowerReqSHP: 410,
    defaultCrew: 180,
    defaultFuel: 230,
    defaultAddLoad: 0,
    defaultPayload: 350,
    defaultElevation: 0,
    defaultQNH: 1013.25,
    defaultTemp: 15,
    // Performance chart config — ref: CHEETAH GRAPH (Lama)
    vmaxFactor: 1221, // same Lama calibration as CHETAK GRAPH left (~108 kts at 1450 kg)
    rocBase: 3500,
    rocC: 0.25,  // ~875 ft/min at MAUW, sea level
  },
  cheetal: {
    id: 'cheetal',
    name: 'Cheetal',
    emptyWeight: 1250,
    mauw: 2250,
    ratedPowerSHP: 847,
    baselinePowerReqSHP: 520,
    defaultCrew: 180,
    defaultFuel: 260,
    defaultAddLoad: 0,
    defaultPayload: 420,
    defaultElevation: 0,
    defaultQNH: 1013.25,
    defaultTemp: 15,
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
  // All Up Weight (kg)
  AUW: 'ac_weight + crew + fuel + payload + add_load',
  // Power Available (shp) - derates with density altitude
  POWER_AVAIL: 'rated_power * Math.max(0.55, 1 - (density_alt / 30000))',
  // Power Required (shp) - scales with AUW & density altitude
  POWER_REQ: 'baseline_power_req * (auw / mauw) * (1 + (density_alt / 40000))',
};

export const FORMULA_META = [
  { key: 'PA', label: 'Pressure Altitude (ft)', vars: 'elevation, qnh' },
  { key: 'ISA_TEMP', label: 'ISA Temperature (°C)', vars: 'pa' },
  { key: 'DENSITY_ALT', label: 'Density Altitude (ft)', vars: 'pa, oat, isa' },
  { key: 'DENSITY', label: 'Air Density (kg/m³)', vars: 'pa, oat' },
  { key: 'AB_TEMP', label: 'AB Temperature (°C)', vars: 'oat, isa' },
  { key: 'AUW', label: 'All Up Weight (kg)', vars: 'ac_weight, crew, fuel, payload, add_load' },
  { key: 'POWER_AVAIL', label: 'Power Available (shp)', vars: 'rated_power, density_alt' },
  { key: 'POWER_REQ', label: 'Power Required (shp)', vars: 'baseline_power_req, auw, mauw, density_alt' },
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

export const computePerformance = (inputs, formulas = DEFAULT_FORMULAS) => {
  const { aircraft } = inputs;

  const baseCtx = {
    elevation: Number(inputs.elevation) || 0,
    qnh: Number(inputs.qnh) || 1013.25,
    oat: Number(inputs.temperature) || 15,
    ac_weight: Number(inputs.acWeight) || aircraft.emptyWeight,
    crew: Number(inputs.crewWeight) || 0,
    fuel: Number(inputs.fuel) || 0,
    payload: Number(inputs.payload) || 0,
    add_load: Number(inputs.additionalLoad) || 0,
    mauw: aircraft.mauw,
    rated_power: aircraft.ratedPowerSHP,
    baseline_power_req: aircraft.baselinePowerReqSHP,
  };

  const PA = safeEval(formulas.PA, baseCtx);
  const ISA_TEMP = safeEval(formulas.ISA_TEMP, { ...baseCtx, pa: PA });
  const DENSITY_ALT = safeEval(formulas.DENSITY_ALT, { ...baseCtx, pa: PA, isa: ISA_TEMP });
  const DENSITY = safeEval(formulas.DENSITY, { ...baseCtx, pa: PA });
  const AB_TEMP = safeEval(formulas.AB_TEMP, { ...baseCtx, isa: ISA_TEMP });
  const AUW = safeEval(formulas.AUW, baseCtx);
  const POWER_AVAIL = safeEval(formulas.POWER_AVAIL, {
    ...baseCtx, density_alt: DENSITY_ALT, auw: AUW,
  });
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

  return {
    PA: round(PA),
    ISA_TEMP: round(ISA_TEMP),
    DENSITY_ALT: round(DENSITY_ALT),
    DENSITY: round(DENSITY, 4),
    AB_TEMP: round(AB_TEMP),
    AUW: round(AUW),
    POWER_AVAIL: round(POWER_AVAIL),
    POWER_REQ: round(POWER_REQ),
    POWER_BALANCE_PCT,
    AUW_MARGIN: round(AUW_MARGIN),
    PAYLOAD_MARGIN,
    status: reasons.length === 0 ? 'FIT' : 'NOT_FIT',
    reasons,
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

// Build the five reference AUW curves for the performance chart.
// type: 'vmax' | 'roc' — pass explicitly so both charts can be built for any aircraft.
export const buildPerformanceCurves = (aircraft, type) => {
  const refAuws = getChartRefAuws(aircraft);
  const daSteps = Array.from({ length: 45 }, (_, i) => i * 500);
  return refAuws.map((auw) => ({
    auw,
    points: daSteps.map((da) => ({
      da,
      value: type === 'vmax'
        ? Math.round(computeVmaxKnots(aircraft, da, auw))
        : Math.round(computeROCFpm(aircraft, da, auw)),
    })).filter((p) => p.value > (type === 'vmax' ? 40 : 0)),
  }));
};

// Current operating point to plot on the performance chart.
export const computeCurrentPerfPoint = (aircraft, da_ft, auw_kg, type) => ({
  da: da_ft,
  value: type === 'vmax'
    ? Math.round(computeVmaxKnots(aircraft, da_ft, auw_kg))
    : Math.round(computeROCFpm(aircraft, da_ft, auw_kg)),
});

/* ---- PA vs Density Altitude ISA conversion chart (COMMON GRAPHS bottom-right) ---- */
// Formula: DA = PA × 1.23526 + 118.8 × (OAT − 15)
// Rearranged: PA = (DA − 118.8 × (OAT − 15)) / 1.23526
const _ISA_K = 1 + 118.8 * (1.98 / 1000); // ≈ 1.23526

export const CHART_OAT_MIN = -30;
export const CHART_OAT_MAX = 50;
export const CHART_PA_MAX = 20000;
export const CHART_PA_DA_CONTOURS = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000];

export const buildPADAContours = () =>
  CHART_PA_DA_CONTOURS.map((da) => {
    const points = [];
    for (let oat = CHART_OAT_MIN; oat <= CHART_OAT_MAX; oat += 1) {
      const pa = (da - 118.8 * (oat - 15)) / _ISA_K;
      if (pa >= 0 && pa <= CHART_PA_MAX) points.push({ oat, pa });
    }
    return { da, points };
  });
