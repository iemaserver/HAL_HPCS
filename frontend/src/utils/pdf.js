import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import {
  buildPerformanceCurves,
  computeCurrentPerfPoint,
  CHART_DA_MAX,
  CHART_VMAX_MIN,
  CHART_VMAX_MAX,
  CHART_ROC_MAX,
  CHART_OAT_MIN,
  CHART_OAT_MAX,
  CHART_PA_MAX,
  CHART_PA_DA_CONTOURS,
} from '../constants/logic';

// ─── SVG chart renderers ────────────────────────────────────────────────────

const CURVE_COLORS = ['#CBD5E1', '#94A3B8', '#64748B', '#475569', '#1E293B'];
const CONTOUR_COLORS = ['#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B'];
const PRIMARY = '#1EA7E8';

// Rounds to 1 decimal for clean SVG path data
const f = (n) => Math.round(n * 10) / 10;

/**
 * Inline SVG string for the Vmax or ROC performance chart.
 * Mirrors PerformanceChart.js but uses HTML SVG attribute syntax.
 */
function _buildPerfSvg(type, curves, current, w = 360, h = 230) {
  const padL = 44, padR = 14, padT = 18, padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xMin = type === 'vmax' ? CHART_VMAX_MIN : 0;
  const xMax = type === 'vmax' ? CHART_VMAX_MAX : CHART_ROC_MAX;
  const xRange = xMax - xMin;

  const sx = (v) => padL + ((v - xMin) / xRange) * plotW;
  const sy = (da) => padT + (1 - da / CHART_DA_MAX) * plotH;

  const xTickStep = type === 'vmax' ? 10 : 250;
  const xTicks = [];
  for (let v = xMin; v <= xMax; v += xTickStep) xTicks.push(v);

  const DA_TICKS = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000];
  const title = type === 'vmax' ? 'MAX SPEED IN LEVEL FLIGHT' : 'RATE OF CLIMB';
  const xLabel = type === 'vmax' ? 'Max Speed (knots)' : 'Rate of Climb (ft/min)';

  let s = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect width="${w}" height="${h}" fill="#fff" rx="6"/>`;

  // Title
  s += `<text x="${f(padL + plotW / 2)}" y="13" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="bold" letter-spacing="1">${title}</text>`;

  // Horizontal DA grid lines
  for (const da of DA_TICKS) {
    const major = da % 4000 === 0;
    const y = f(sy(da));
    s += `<line x1="${padL}" y1="${y}" x2="${f(padL + plotW)}" y2="${y}" stroke="${major ? '#D1D5DB' : '#E5E7EB'}" stroke-dasharray="${major ? '4,4' : '2,6'}" stroke-width="${major ? 1 : 0.7}"/>`;
    if (major) {
      s += `<text x="${padL - 4}" y="${f(sy(da) + 4)}" font-size="8.5" fill="#64748B" text-anchor="end" font-family="Helvetica,Arial,sans-serif">${da === 0 ? '0' : `${da / 1000}k`}</text>`;
    }
  }

  // Vertical X grid lines + tick labels
  for (const v of xTicks) {
    const x = f(sx(v));
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${f(padT + plotH)}" stroke="#E5E7EB" stroke-dasharray="2,6" stroke-width="0.7"/>`;
    s += `<text x="${x}" y="${f(padT + plotH + 13)}" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">${v}</text>`;
  }

  // Axis borders
  s += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${f(padT + plotH)}" stroke="#CBD5E1" stroke-width="1.2"/>`;
  s += `<line x1="${padL}" y1="${f(padT + plotH)}" x2="${f(padL + plotW)}" y2="${f(padT + plotH)}" stroke="#CBD5E1" stroke-width="1.2"/>`;

  // Reference AUW curves
  curves.forEach((curve, idx) => {
    const pts = curve.points.filter(
      (p) => p.value >= xMin && p.value <= xMax + xTickStep && p.da <= CHART_DA_MAX,
    );
    if (pts.length < 2) return;
    const d = pts.map((p, i) => {
      const cx = f(Math.min(Math.max(sx(p.value), padL), padL + plotW));
      const cy = f(Math.min(Math.max(sy(p.da), padT), padT + plotH));
      return `${i === 0 ? 'M' : 'L'} ${cx} ${cy}`;
    }).join(' ');
    s += `<path d="${d}" stroke="${CURVE_COLORS[idx % CURVE_COLORS.length]}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  });

  // Current operating point
  if (current && current.value > xMin && current.da <= CHART_DA_MAX) {
    const cx = f(sx(current.value));
    const cy = f(sy(current.da));
    s += `<line x1="${padL}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1.2" stroke-dasharray="5,3" opacity="0.75"/>`;
    s += `<line x1="${cx}" y1="${f(padT + plotH)}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1.2" stroke-dasharray="5,3" opacity="0.75"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="7" fill="#fff" stroke="${PRIMARY}" stroke-width="2.5"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${PRIMARY}"/>`;
    s += `<text x="${f(sx(current.value) + 10)}" y="${f(sy(current.da) - 8)}" font-size="10" fill="${PRIMARY}" font-weight="bold" font-family="Helvetica,Arial,sans-serif">${current.value} ${type === 'vmax' ? 'kts' : 'fpm'}</text>`;
  }

  // Rotated Y-axis label
  const lcy = f(padT + plotH / 2);
  s += `<text x="10" y="${lcy}" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" transform="rotate(-90,10,${lcy})">Density Alt (ft)</text>`;

  // X-axis label
  s += `<text x="${f(padL + plotW / 2)}" y="${h - 4}" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">${xLabel}</text>`;

  // Legend
  let lx = padL;
  curves.forEach((curve, idx) => {
    const color = CURVE_COLORS[idx % CURVE_COLORS.length];
    s += `<line x1="${lx}" y1="${h - 20}" x2="${lx + 14}" y2="${h - 20}" stroke="${color}" stroke-width="2.5"/>`;
    s += `<text x="${lx + 17}" y="${h - 16}" font-size="7.5" fill="${color}" font-weight="600" font-family="Helvetica,Arial,sans-serif">${curve.auw}kg</text>`;
    lx += 50;
  });
  s += `<circle cx="${lx + 5}" cy="${h - 20}" r="4" fill="${PRIMARY}"/>`;
  s += `<text x="${lx + 12}" y="${h - 16}" font-size="7.5" fill="${PRIMARY}" font-weight="600" font-family="Helvetica,Arial,sans-serif">Current</text>`;

  s += `</svg>`;
  return s;
}

/**
 * Inline SVG string for the Pressure Altitude vs OAT / DA chart.
 * Mirrors ISAChart.js but uses HTML SVG attribute syntax.
 */
function _buildIsaSvg(current, w = 730, h = 245) {
  const padL = 46, padR = 28, padT = 18, padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const oatRange = CHART_OAT_MAX - CHART_OAT_MIN;
  const sx = (oat) => padL + ((oat - CHART_OAT_MIN) / oatRange) * plotW;
  const sy = (pa) => padT + (1 - pa / CHART_PA_MAX) * plotH;
  const K = 1 + 118.8 * 0.00198; // ISA DA → PA conversion constant

  const OAT_TICKS = [-30, -20, -10, 0, 10, 20, 30, 40, 50];
  const PA_TICKS = [0, 4000, 8000, 12000, 16000, 20000];

  let s = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect width="${w}" height="${h}" fill="#fff" rx="6"/>`;

  // Title
  s += `<text x="${f(padL + plotW / 2)}" y="13" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="bold" letter-spacing="1">PRESSURE ALT vs DENSITY ALT</text>`;

  // Horizontal PA grid lines
  for (const pa of PA_TICKS) {
    const y = f(sy(pa));
    s += `<line x1="${padL}" y1="${y}" x2="${f(padL + plotW)}" y2="${y}" stroke="#D1D5DB" stroke-dasharray="4,4" stroke-width="1"/>`;
    s += `<text x="${padL - 4}" y="${f(sy(pa) + 4)}" font-size="8.5" fill="#64748B" text-anchor="end" font-family="Helvetica,Arial,sans-serif">${pa === 0 ? '0' : `${pa / 1000}k`}</text>`;
  }

  // Vertical OAT grid lines + tick labels
  for (const oat of OAT_TICKS) {
    const x = f(sx(oat));
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${f(padT + plotH)}" stroke="#E5E7EB" stroke-dasharray="2,6" stroke-width="0.7"/>`;
    s += `<text x="${x}" y="${f(padT + plotH + 13)}" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">${oat > 0 ? `+${oat}` : `${oat}`}</text>`;
  }

  // Axis borders
  s += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${f(padT + plotH)}" stroke="#CBD5E1" stroke-width="1.2"/>`;
  s += `<line x1="${padL}" y1="${f(padT + plotH)}" x2="${f(padL + plotW)}" y2="${f(padT + plotH)}" stroke="#CBD5E1" stroke-width="1.2"/>`;

  // DA contour lines
  CHART_PA_DA_CONTOURS.forEach((da, idx) => {
    const color = CONTOUR_COLORS[Math.min(
      Math.floor(idx * CONTOUR_COLORS.length / CHART_PA_DA_CONTOURS.length),
      CONTOUR_COLORS.length - 1,
    )];
    const pts = [];
    for (let oat = CHART_OAT_MIN; oat <= CHART_OAT_MAX; oat++) {
      const pa = (da - 118.8 * (oat - 15)) / K;
      if (pa >= 0 && pa <= CHART_PA_MAX) pts.push({ oat, pa });
    }
    if (pts.length < 2) return;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${f(sx(p.oat))} ${f(sy(p.pa))}`).join(' ');
    const last = pts[pts.length - 1];
    s += `<path d="${d}" stroke="${color}" stroke-width="1.6" fill="none"/>`;
    s += `<text x="${f(sx(last.oat) + 3)}" y="${f(sy(last.pa) + 4)}" font-size="8" fill="${color}" font-weight="bold" font-family="Helvetica,Arial,sans-serif">${da === 0 ? '0' : `${da / 1000}k`}</text>`;
  });

  // Current operating point
  if (
    current &&
    current.pa >= 0 && current.pa <= CHART_PA_MAX &&
    current.oat >= CHART_OAT_MIN && current.oat <= CHART_OAT_MAX
  ) {
    const cx = f(sx(current.oat));
    const cy = f(sy(current.pa));
    s += `<line x1="${padL}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1.2" stroke-dasharray="5,3" opacity="0.75"/>`;
    s += `<line x1="${cx}" y1="${f(padT + plotH)}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1.2" stroke-dasharray="5,3" opacity="0.75"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="7" fill="#fff" stroke="${PRIMARY}" stroke-width="2.5"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${PRIMARY}"/>`;
    s += `<text x="${f(sx(current.oat) + 10)}" y="${f(sy(current.pa) - 8)}" font-size="10" fill="${PRIMARY}" font-weight="bold" font-family="Helvetica,Arial,sans-serif">DA ${Math.round(current.da / 100) * 100} ft</text>`;
  }

  // Rotated Y-axis label
  const lcy = f(padT + plotH / 2);
  s += `<text x="10" y="${lcy}" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" transform="rotate(-90,10,${lcy})">Press. Alt (ft)</text>`;

  // X-axis label
  s += `<text x="${f(padL + plotW / 2)}" y="${h - 4}" font-size="8.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">OAT (°C)</text>`;

  s += `</svg>`;
  return s;
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Generates a professional HAL Report PDF from the calculation payload.
 * - Native (iOS/Android): uses expo-print → expo-sharing share sheet.
 * - Web: opens a new tab with the report and triggers the browser print dialog
 *   (the user can "Save as PDF" from there). expo-print is not reliable on web.
 */
export const generateAndSharePdf = async (report) => {
  const name = report?.name || 'HAL_Report';
  const createdAt = report?.created_at || new Date().toISOString();
  const aircraft = report?.aircraft || {};
  const inputs = report?.inputs || {};
  const outputs = report?.outputs || {};
  const units = report?.units || { altitude: 'ft', temperature: 'C', weight: 'kg', pressure: 'hPa' };

  // Build inline SVG charts
  const vmaxCurves = buildPerformanceCurves(aircraft, 'vmax');
  const rocCurves  = buildPerformanceCurves(aircraft, 'roc');
  const vmaxPoint  = computeCurrentPerfPoint(aircraft, outputs.DENSITY_ALT, outputs.AUW, 'vmax');
  const rocPoint   = computeCurrentPerfPoint(aircraft, outputs.DENSITY_ALT, outputs.AUW, 'roc');
  const isaPoint   = { oat: Number(inputs.temperature), pa: outputs.PA, da: outputs.DENSITY_ALT };

  const vmaxSvg = _buildPerfSvg('vmax', vmaxCurves, vmaxPoint);
  const rocSvg  = _buildPerfSvg('roc',  rocCurves,  rocPoint);
  const isaSvg  = _buildIsaSvg(isaPoint);

  const statusColor = outputs.status === 'FIT' ? '#22C55E' : '#EF4444';
  const statusText = outputs.status === 'FIT'
    ? 'WITHIN LIMITS / FIT TO FLY'
    : 'LIMIT EXCEEDED / NOT FIT TO FLY';
  const reasonsList = (outputs.reasons || [])
    .map((r) => `<li>${r}</li>`)
    .join('') || '<li>All parameters within safe envelope.</li>';

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>${name}</title>
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color:#0F172A; padding:32px; }
      .header { border-bottom: 4px solid #1EA7E8; padding-bottom: 12px; margin-bottom: 18px; }
      h1 { margin:0; font-size: 28px; color:#0F172A; letter-spacing:-0.5px; }
      .sub { color:#64748B; font-size:12px; margin-top:4px; }
      .chip { display:inline-block; padding:8px 16px; border-radius:24px; color:#fff; font-weight:700; font-size:14px; background:${statusColor}; }
      h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; color:#64748B; margin:24px 0 10px; }
      table { width:100%; border-collapse: collapse; font-size:13px; }
      td, th { padding:8px 10px; border-bottom: 1px solid #E2E8F0; text-align:left; }
      th { background:#F1F5F9; font-weight:700; }
      .grid { display:flex; flex-wrap: wrap; gap: 10px; }
      .card { flex:1 1 45%; border:1px solid #E2E8F0; border-radius:10px; padding:12px; box-sizing: border-box; }
      .card .k { font-size: 11px; color:#64748B; text-transform:uppercase; letter-spacing:1px; }
      .card .v { font-size: 22px; font-weight:800; color:#0F172A; }
      .chart-row { display:flex; gap:10px; margin-top:8px; flex-wrap:wrap; }
      .chart-box { flex:1 1 340px; border:1px solid #E2E8F0; border-radius:8px; padding:8px; box-sizing:border-box; overflow:hidden; }
      .chart-full { border:1px solid #E2E8F0; border-radius:8px; padding:8px; margin-top:10px; overflow:hidden; }
      .foot { margin-top: 36px; font-size: 10px; color:#94A3B8; border-top:1px solid #E2E8F0; padding-top:8px; }
      ul { margin: 4px 0 0 18px; }
      @media print { body { padding: 18px; } }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>HAL Report</h1>
      <div class="sub">Hindustan Aeronautics Limited &middot; Helicopter Performance System</div>
      <div class="sub">Report: <b>${name}</b> &middot; Generated: ${new Date(createdAt).toLocaleString()}</div>
    </div>
    <div class="chip">${statusText}</div>

    <h2>Aircraft &amp; Environment</h2>
    <table>
      <tr><th>Aircraft Type</th><td>${aircraft.name || '-'}</td><th>MAUW</th><td>${aircraft.mauw || '-'} kg</td></tr>
      <tr><th>Elevation</th><td>${inputs.elevation ?? '-'} ft</td><th>QNH</th><td>${inputs.qnh ?? '-'} hPa</td></tr>
      <tr><th>Temperature (OAT)</th><td>${inputs.temperature ?? '-'} °C</td><th>Rated Power</th><td>${aircraft.ratedPowerSHP || '-'} shp</td></tr>
    </table>

    <h2>Weights (kg)</h2>
    <table>
      <tr><th>AC Empty</th><td>${inputs.acWeight ?? '-'}</td><th>Crew</th><td>${inputs.crewWeight ?? '-'}</td></tr>
      <tr><th>Fuel</th><td>${inputs.fuel ?? '-'}</td><th>Load</th><td>${inputs.payload ?? '-'}</td></tr>
      <tr><th>Additional Load</th><td>${inputs.additionalLoad ?? '-'}</td><th>All Up Weight</th><td><b>${outputs.AUW ?? '-'}</b></td></tr>
    </table>

    <h2>Computed Performance</h2>
    <div class="grid">
      <div class="card"><div class="k">Pressure Altitude</div><div class="v">${outputs.PA ?? '-'} ft</div></div>
      <div class="card"><div class="k">ISA Temperature</div><div class="v">${outputs.ISA_TEMP ?? '-'} °C</div></div>
      <div class="card"><div class="k">Density Altitude</div><div class="v">${outputs.DENSITY_ALT ?? '-'} ft</div></div>
      <div class="card"><div class="k">Air Density</div><div class="v">${outputs.DENSITY ?? '-'} kg/m³</div></div>
      <div class="card"><div class="k">AB Temperature</div><div class="v">${outputs.AB_TEMP ?? '-'} °C</div></div>
      <div class="card"><div class="k">All Up Weight</div><div class="v">${outputs.AUW ?? '-'} kg</div></div>
      <div class="card"><div class="k">Power Available</div><div class="v">${outputs.POWER_AVAIL ?? '-'} shp</div></div>
      <div class="card"><div class="k">Power Required</div><div class="v">${outputs.POWER_REQ ?? '-'} shp</div></div>
    </div>

    <h2>Performance Charts</h2>
    <div class="chart-row">
      <div class="chart-box">${vmaxSvg}</div>
      <div class="chart-box">${rocSvg}</div>
    </div>
    <div class="chart-full">${isaSvg}</div>

    <h2>Fit-to-Fly Evaluation</h2>
    <ul>${reasonsList}</ul>

    <div class="foot">Units: alt=${units.altitude}, temp=${units.temperature}, weight=${units.weight}, pressure=${units.pressure}. Computed locally on device, fully offline.</div>
  </body>
  </html>`;

  /* -------- WEB: open new tab + browser print dialog (reliable fallback) -------- */
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return null;
    const win = window.open('', '_blank');
    if (!win) {
      // Popup blocked — download as HTML file instead
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return url;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Allow layout to render, then trigger print so user can "Save as PDF"
    setTimeout(() => {
      try { win.focus(); win.print(); } catch { /* ignore */ }
    }, 500);
    return 'web-print';
  }

  /* -------- NATIVE: expo-print + expo-sharing -------- */
  try {
    const printed = await Print.printToFileAsync({ html, base64: false });
    const uri = printed && printed.uri ? printed.uri : null;
    if (!uri) throw new Error('Print returned no file URI');

    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share HAL Report',
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (e) {
      // Share cancel / unavailable — PDF file is still saved
      console.warn('Sharing cancelled or unavailable:', e);
    }
    return uri;
  } catch (e) {
    throw new Error(`PDF generation failed: ${String(e?.message || e)}`);
  }
};
