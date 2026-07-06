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

const f = (n) => Math.round(n * 10) / 10;

function _buildPerfSvg(type, curves, current, w = 360, h = 235) {
  const padL = 44, padR = 14, padT = 22, padB = 44;
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
  s += `<rect width="${w}" height="${h}" fill="#F8FAFC" rx="0"/>`;

  // Title bar
  s += `<rect width="${w}" height="18" fill="#0B1E35" rx="0"/>`;
  s += `<text x="${f(w / 2)}" y="12" font-size="8" fill="#94A3B8" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="bold" letter-spacing="1.5">${title}</text>`;

  // Plot background
  s += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#fff"/>`;

  // Horizontal DA grid lines
  for (const da of DA_TICKS) {
    const major = da % 4000 === 0;
    const y = f(sy(da));
    s += `<line x1="${padL}" y1="${y}" x2="${f(padL + plotW)}" y2="${y}" stroke="${major ? '#D1D5DB' : '#F1F5F9'}" stroke-dasharray="${major ? '4,3' : '2,5'}" stroke-width="${major ? 0.8 : 0.6}"/>`;
    if (major) {
      s += `<text x="${padL - 4}" y="${f(sy(da) + 3.5)}" font-size="8" fill="#64748B" text-anchor="end" font-family="Helvetica,Arial,sans-serif">${da === 0 ? '0' : `${da / 1000}k`}</text>`;
    }
  }

  // Vertical X grid lines + tick labels
  for (const v of xTicks) {
    const x = f(sx(v));
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${f(padT + plotH)}" stroke="#F1F5F9" stroke-dasharray="2,5" stroke-width="0.6"/>`;
    s += `<text x="${x}" y="${f(padT + plotH + 11)}" font-size="8" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">${v}</text>`;
  }

  // Axis borders
  s += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="#CBD5E1" stroke-width="1"/>`;

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
    s += `<path d="${d}" stroke="${CURVE_COLORS[idx % CURVE_COLORS.length]}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  });

  // Current operating point crosshairs + marker
  if (current && current.value > xMin && current.da <= CHART_DA_MAX) {
    const cx = f(sx(current.value));
    const cy = f(sy(current.da));
    s += `<line x1="${padL}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1" stroke-dasharray="4,3" opacity="0.8"/>`;
    s += `<line x1="${cx}" y1="${f(padT + plotH)}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1" stroke-dasharray="4,3" opacity="0.8"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="6.5" fill="#fff" stroke="${PRIMARY}" stroke-width="2"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="3" fill="${PRIMARY}"/>`;
    // Value label with background
    const lx = f(sx(current.value) + 9);
    const ly = f(sy(current.da) - 6);
    const label = `${current.value} ${type === 'vmax' ? 'kts' : 'fpm'}`;
    s += `<rect x="${lx - 2}" y="${ly - 9}" width="${label.length * 6.2 + 4}" height="13" fill="rgba(255,255,255,0.88)" rx="2"/>`;
    s += `<text x="${lx}" y="${ly}" font-size="9.5" fill="${PRIMARY}" font-weight="bold" font-family="Helvetica,Arial,sans-serif">${label}</text>`;
  }

  // Rotated Y-axis label
  const lcy = f(padT + plotH / 2);
  s += `<text x="9" y="${lcy}" font-size="7.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" transform="rotate(-90,9,${lcy})">Density Alt (ft)</text>`;

  // X-axis label
  s += `<text x="${f(padL + plotW / 2)}" y="${h - 26}" font-size="7.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">${xLabel}</text>`;

  // Legend
  let lx = padL;
  const legendY = h - 12;
  curves.forEach((curve, idx) => {
    const color = CURVE_COLORS[idx % CURVE_COLORS.length];
    s += `<line x1="${lx}" y1="${legendY}" x2="${lx + 12}" y2="${legendY}" stroke="${color}" stroke-width="2.2"/>`;
    s += `<text x="${lx + 15}" y="${legendY + 4}" font-size="7" fill="${color}" font-weight="600" font-family="Helvetica,Arial,sans-serif">${curve.auw}kg</text>`;
    lx += 48;
  });
  s += `<circle cx="${lx + 5}" cy="${legendY}" r="3.5" fill="${PRIMARY}"/>`;
  s += `<text x="${lx + 11}" y="${legendY + 4}" font-size="7" fill="${PRIMARY}" font-weight="600" font-family="Helvetica,Arial,sans-serif">Current</text>`;

  s += `</svg>`;
  return s;
}

function _buildIsaSvg(current, w = 720, h = 252) {
  const padL = 46, padR = 32, padT = 22, padB = 44;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const oatRange = CHART_OAT_MAX - CHART_OAT_MIN;
  const sx = (oat) => padL + ((oat - CHART_OAT_MIN) / oatRange) * plotW;
  const sy = (pa) => padT + (1 - pa / CHART_PA_MAX) * plotH;
  const K = 1 + 118.8 * 0.00198;

  const OAT_TICKS = [-30, -20, -10, 0, 10, 20, 30, 40, 50];
  const PA_TICKS = [0, 4000, 8000, 12000, 16000, 20000];

  let s = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect width="${w}" height="${h}" fill="#F8FAFC" rx="0"/>`;

  // Title bar
  s += `<rect width="${w}" height="18" fill="#0B1E35" rx="0"/>`;
  s += `<text x="${f(w / 2)}" y="12" font-size="8" fill="#94A3B8" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="bold" letter-spacing="1.5">PRESSURE ALTITUDE vs DENSITY ALTITUDE</text>`;

  // Plot background
  s += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#fff"/>`;

  // PA grid lines
  for (const pa of PA_TICKS) {
    const y = f(sy(pa));
    s += `<line x1="${padL}" y1="${y}" x2="${f(padL + plotW)}" y2="${y}" stroke="#D1D5DB" stroke-dasharray="4,3" stroke-width="0.8"/>`;
    s += `<text x="${padL - 4}" y="${f(sy(pa) + 3.5)}" font-size="8" fill="#64748B" text-anchor="end" font-family="Helvetica,Arial,sans-serif">${pa === 0 ? '0' : `${pa / 1000}k`}</text>`;
  }

  // OAT grid lines + tick labels
  for (const oat of OAT_TICKS) {
    const x = f(sx(oat));
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${f(padT + plotH)}" stroke="#F1F5F9" stroke-dasharray="2,5" stroke-width="0.6"/>`;
    s += `<text x="${x}" y="${f(padT + plotH + 11)}" font-size="8" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">${oat > 0 ? `+${oat}` : `${oat}`}</text>`;
  }

  // Axis borders
  s += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="#CBD5E1" stroke-width="1"/>`;

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
    s += `<path d="${d}" stroke="${color}" stroke-width="1.5" fill="none"/>`;
    s += `<text x="${f(sx(last.oat) + 3)}" y="${f(sy(last.pa) + 3.5)}" font-size="7.5" fill="${color}" font-weight="bold" font-family="Helvetica,Arial,sans-serif">${da === 0 ? '0' : `${da / 1000}k`}</text>`;
  });

  // Current operating point
  if (
    current &&
    current.pa >= 0 && current.pa <= CHART_PA_MAX &&
    current.oat >= CHART_OAT_MIN && current.oat <= CHART_OAT_MAX
  ) {
    const cx = f(sx(current.oat));
    const cy = f(sy(current.pa));
    s += `<line x1="${padL}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1" stroke-dasharray="4,3" opacity="0.8"/>`;
    s += `<line x1="${cx}" y1="${f(padT + plotH)}" x2="${cx}" y2="${cy}" stroke="${PRIMARY}" stroke-width="1" stroke-dasharray="4,3" opacity="0.8"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="6.5" fill="#fff" stroke="${PRIMARY}" stroke-width="2"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="3" fill="${PRIMARY}"/>`;
    const lx = f(sx(current.oat) + 9);
    const ly = f(sy(current.pa) - 6);
    const label = `DA ${Math.round(current.da / 100) * 100} ft`;
    s += `<rect x="${lx - 2}" y="${ly - 9}" width="${label.length * 6 + 4}" height="13" fill="rgba(255,255,255,0.88)" rx="2"/>`;
    s += `<text x="${lx}" y="${ly}" font-size="9.5" fill="${PRIMARY}" font-weight="bold" font-family="Helvetica,Arial,sans-serif">${label}</text>`;
  }

  // Rotated Y-axis label
  const lcy = f(padT + plotH / 2);
  s += `<text x="9" y="${lcy}" font-size="7.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" transform="rotate(-90,9,${lcy})">Press. Alt (ft)</text>`;

  // X-axis label
  s += `<text x="${f(padL + plotW / 2)}" y="${h - 26}" font-size="7.5" fill="#64748B" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">OAT (°C)</text>`;

  // ISA note
  s += `<text x="${f(padL + plotW / 2)}" y="${h - 10}" font-size="7" fill="#94A3B8" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">DA = PA × 1.235 + 118.8 × (OAT − 15°C)</text>`;

  s += `</svg>`;
  return s;
}

// ─── Main export ────────────────────────────────────────────────────────────

export const generateAndSharePdf = async (report) => {
  const name = report?.name || 'HAL_Report';
  const createdAt = report?.created_at || new Date().toISOString();
  const aircraft = report?.aircraft || {};
  const inputs = report?.inputs || {};
  const outputs = report?.outputs || {};
  const units = report?.units || { altitude: 'ft', temperature: 'C', weight: 'kg', pressure: 'hPa' };

  // Build chart data
  const vmaxCurves = buildPerformanceCurves(aircraft, 'vmax');
  const rocCurves  = buildPerformanceCurves(aircraft, 'roc');
  const vmaxPoint  = computeCurrentPerfPoint(aircraft, outputs.DENSITY_ALT, outputs.AUW, 'vmax');
  const rocPoint   = computeCurrentPerfPoint(aircraft, outputs.DENSITY_ALT, outputs.AUW, 'roc');
  const isaPoint   = { oat: Number(inputs.temperature), pa: outputs.PA, da: outputs.DENSITY_ALT };

  const vmaxSvg = _buildPerfSvg('vmax', vmaxCurves, vmaxPoint);
  const rocSvg  = _buildPerfSvg('roc',  rocCurves,  rocPoint);
  const isaSvg  = _buildIsaSvg(isaPoint);

  const isFit = outputs.status === 'FIT';
  const statusBg   = isFit ? '#F0FDF4' : '#FEF2F2';
  const statusBdr  = isFit ? '#22C55E' : '#EF4444';
  const statusDot  = isFit ? '#22C55E' : '#EF4444';
  const statusRing = isFit ? '#BBF7D0' : '#FECACA';
  const statusTxt  = isFit ? '#15803D'  : '#B91C1C';
  const statusMsg  = isFit ? 'WITHIN LIMITS — FIT TO FLY' : 'LIMIT EXCEEDED — NOT FIT TO FLY';

  const reasonsList = (outputs.reasons || [])
    .map((r) => `<li>${r}</li>`)
    .join('') || '<li>All parameters within safe operating envelope.</li>';

  const dateStr = new Date(createdAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  // Derived margin = power available - power required
  const pMargin = (outputs.POWER_AVAIL != null && outputs.POWER_REQ != null)
    ? (outputs.POWER_AVAIL - outputs.POWER_REQ).toFixed(2)
    : '-';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1A2332;background:#fff;font-size:12px;line-height:1.5;}

    /* ── Header ── */
    .doc-header{background:#0B1E35;padding:16px 28px 14px;display:flex;justify-content:space-between;align-items:flex-start;}
    .brand-block h1{font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.3px;margin-bottom:2px;}
    .brand-block .tagline{font-size:9px;color:#64748B;letter-spacing:1.5px;text-transform:uppercase;}
    .meta-block{text-align:right;}
    .meta-block .report-id{font-size:9.5px;color:#94A3B8;font-weight:600;letter-spacing:0.3px;}
    .meta-block .report-date{font-size:9px;color:#475569;margin-top:3px;}
    .accent-bar{height:3px;background:linear-gradient(90deg,#1EA7E8 0%,#0B5E8A 60%,#0B1E35 100%);}

    /* ── Body ── */
    .body{padding:18px 28px 0;}

    /* ── Status ── */
    .status-banner{display:flex;align-items:center;gap:12px;border-radius:6px;padding:11px 18px;margin-bottom:18px;border-left:4px solid ${statusBdr};background:${statusBg};}
    .status-dot{width:11px;height:11px;border-radius:50%;background:${statusDot};box-shadow:0 0 0 3px ${statusRing};flex-shrink:0;}
    .status-text{font-size:13px;font-weight:800;letter-spacing:0.8px;color:${statusTxt};}
    .status-sub{font-size:10px;color:#64748B;margin-left:auto;}

    /* ── Section headings ── */
    h2{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#64748B;
       margin:16px 0 8px;padding:4px 0 4px 10px;border-left:3px solid #1EA7E8;}

    /* ── Two-panel layout ── */
    .two-col{display:flex;gap:14px;margin-bottom:2px;}
    .two-col .panel{flex:1;}

    /* ── Data tables ── */
    table{width:100%;border-collapse:collapse;font-size:11.5px;border-radius:6px;overflow:hidden;border:1px solid #E2E8F0;}
    thead tr{background:#0B1E35;}
    thead th{padding:7px 10px;text-align:left;font-size:8.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94A3B8;}
    tbody tr:nth-child(even){background:#F8FAFC;}
    tbody tr:nth-child(odd){background:#fff;}
    td{padding:7px 10px;border-bottom:1px solid #F1F5F9;}
    td.lbl{font-weight:600;color:#374151;width:44%;}
    td.val{color:#0F172A;font-weight:500;}
    td.sep{width:6px;background:#F1F5F9;padding:0;}

    /* ── Performance grid ── */
    .perf-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:2px;}
    .perf-card{border:1px solid #E2E8F0;border-radius:6px;padding:9px 11px;background:#F8FAFC;}
    .perf-card.hl{background:#EFF6FF;border-color:#BFDBFE;}
    .perf-card.warn{background:#FFF7ED;border-color:#FED7AA;}
    .perf-card .k{font-size:7.5px;color:#94A3B8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:3px;}
    .perf-card .v{font-size:17px;font-weight:800;color:#0F172A;line-height:1.2;}
    .perf-card.hl .v{color:#1D4ED8;}
    .perf-card.warn .v{color:#C2410C;}
    .perf-card .u{font-size:10px;font-weight:500;color:#94A3B8;margin-left:2px;}

    /* ── Page 2: Charts ── */
    .charts-section{page-break-before:always;padding:0;}
    .charts-header{background:#0B1E35;padding:12px 28px;display:flex;justify-content:space-between;align-items:center;}
    .charts-header .ch-title{font-size:11px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;}
    .charts-header .ch-sub{font-size:9px;color:#475569;}
    .charts-body{padding:14px 28px 0;}
    .chart-row{display:flex;gap:10px;margin-bottom:10px;}
    .chart-box{flex:1;border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;}
    .chart-full{border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;margin-bottom:14px;}

    /* ── Fit-to-Fly box ── */
    .fitfly{border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px;background:#F8FAFC;margin-bottom:18px;}
    .fitfly ul{margin:6px 0 0 18px;}
    .fitfly li{font-size:11.5px;color:#374151;line-height:1.9;}

    /* ── Footer ── */
    .doc-footer{border-top:1px solid #E2E8F0;padding:10px 0 4px;display:flex;justify-content:space-between;align-items:center;}
    .doc-footer .fl{font-size:8.5px;color:#94A3B8;}
    .doc-footer .fr{font-size:8.5px;color:#94A3B8;text-align:right;}

    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .charts-section{page-break-before:always;}
    }
  </style>
</head>
<body>

<!-- ═══════════════════ PAGE 1 ═══════════════════ -->
<div class="doc-header">
  <div class="brand-block">
    <h1>HAL Performance Report</h1>
    <div class="tagline">Hindustan Aeronautics Limited &nbsp;·&nbsp; Helicopter Performance Computation System</div>
  </div>
  <div class="meta-block">
    <div class="report-id">${name}</div>
    <div class="report-date">${dateStr}</div>
  </div>
</div>
<div class="accent-bar"></div>

<div class="body">

  <div class="status-banner" style="margin-top:16px;">
    <div class="status-dot"></div>
    <div class="status-text">${statusMsg}</div>
    <div class="status-sub">Aircraft: ${aircraft.name || '-'} &nbsp;|&nbsp; AUW: ${outputs.AUW ?? '-'} kg &nbsp;|&nbsp; DA: ${outputs.DENSITY_ALT ?? '-'} ft</div>
  </div>

  <!-- Aircraft & Weights side-by-side -->
  <div class="two-col">
    <div class="panel">
      <h2>Aircraft &amp; Environment</h2>
      <table>
        <thead><tr><th colspan="3">Parameter</th></tr></thead>
        <tbody>
          <tr><td class="lbl">Aircraft Type</td><td class="sep"></td><td class="val">${aircraft.name || '-'}</td></tr>
          <tr><td class="lbl">MAUW</td><td class="sep"></td><td class="val">${aircraft.mauw || '-'} kg</td></tr>
          <tr><td class="lbl">Rated Power</td><td class="sep"></td><td class="val">${aircraft.ratedPowerSHP || '-'} shp</td></tr>
          <tr><td class="lbl">Elevation (QFE)</td><td class="sep"></td><td class="val">${inputs.elevation ?? '-'} ft</td></tr>
          <tr><td class="lbl">QNH</td><td class="sep"></td><td class="val">${inputs.qnh ?? '-'} hPa</td></tr>
          <tr><td class="lbl">OAT</td><td class="sep"></td><td class="val">${inputs.temperature ?? '-'} °C</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h2>Weight Breakdown</h2>
      <table>
        <thead><tr><th colspan="3">Component</th></tr></thead>
        <tbody>
          <tr><td class="lbl">AC Empty Weight</td><td class="sep"></td><td class="val">${inputs.acWeight ?? '-'} kg</td></tr>
          <tr><td class="lbl">Crew Weight</td><td class="sep"></td><td class="val">${inputs.crewWeight ?? '-'} kg</td></tr>
          <tr><td class="lbl">Fuel</td><td class="sep"></td><td class="val">${inputs.fuel ?? '-'} kg</td></tr>
          <tr><td class="lbl">Payload / Load</td><td class="sep"></td><td class="val">${inputs.payload ?? '-'} kg</td></tr>
          <tr><td class="lbl">Additional Load</td><td class="sep"></td><td class="val">${inputs.additionalLoad ?? '-'} kg</td></tr>
          <tr><td class="lbl" style="font-weight:800;color:#0F172A;">All Up Weight</td><td class="sep"></td><td class="val" style="font-weight:800;font-size:13px;color:#0F172A;">${outputs.AUW ?? '-'} kg</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <h2>Computed Performance</h2>
  <div class="perf-grid">
    <div class="perf-card hl">
      <div class="k">Pressure Altitude</div>
      <div class="v">${outputs.PA ?? '-'}<span class="u">ft</span></div>
    </div>
    <div class="perf-card hl">
      <div class="k">Density Altitude</div>
      <div class="v">${outputs.DENSITY_ALT ?? '-'}<span class="u">ft</span></div>
    </div>
    <div class="perf-card">
      <div class="k">ISA Temperature</div>
      <div class="v">${outputs.ISA_TEMP ?? '-'}<span class="u">°C</span></div>
    </div>
    <div class="perf-card">
      <div class="k">AB Temperature</div>
      <div class="v">${outputs.AB_TEMP ?? '-'}<span class="u">°C</span></div>
    </div>
    <div class="perf-card">
      <div class="k">Air Density</div>
      <div class="v">${outputs.DENSITY ?? '-'}<span class="u">kg/m³</span></div>
    </div>
    <div class="perf-card">
      <div class="k">All Up Weight</div>
      <div class="v">${outputs.AUW ?? '-'}<span class="u">kg</span></div>
    </div>
    <div class="perf-card hl">
      <div class="k">Power Available</div>
      <div class="v">${outputs.POWER_AVAIL ?? '-'}<span class="u">shp</span></div>
    </div>
    <div class="perf-card ${isFit ? '' : 'warn'}">
      <div class="k">Power Required</div>
      <div class="v">${outputs.POWER_REQ ?? '-'}<span class="u">shp</span></div>
    </div>
  </div>

</div><!-- end .body -->

<!-- ═══════════════════ PAGE 2 ═══════════════════ -->
<div class="charts-section">
  <div class="charts-header">
    <div class="ch-title">Performance Charts</div>
    <div class="ch-sub">${aircraft.name || '-'} &nbsp;·&nbsp; AUW ${outputs.AUW ?? '-'} kg &nbsp;·&nbsp; DA ${outputs.DENSITY_ALT ?? '-'} ft &nbsp;·&nbsp; OAT ${inputs.temperature ?? '-'}°C</div>
  </div>
  <div class="accent-bar"></div>

  <div class="charts-body">
    <div class="chart-row">
      <div class="chart-box">${vmaxSvg}</div>
      <div class="chart-box">${rocSvg}</div>
    </div>
    <div class="chart-full">${isaSvg}</div>

    <h2>Fit-to-Fly Evaluation</h2>
    <div class="fitfly">
      <ul>${reasonsList}</ul>
    </div>

    <div class="doc-footer">
      <div class="fl">
        HAL Helicopter Performance Computation System &nbsp;·&nbsp; ${name}<br/>
        Units: alt=${units.altitude} &nbsp; temp=${units.temperature} &nbsp; weight=${units.weight} &nbsp; pressure=${units.pressure}
      </div>
      <div class="fr">
        Computed locally on device — fully offline<br/>
        Generated: ${dateStr}
      </div>
    </div>
  </div>
</div>

</body>
</html>`;

  /* ── WEB ── */
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return null;
    const win = window.open('', '_blank');
    if (!win) {
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
    setTimeout(() => {
      try { win.focus(); win.print(); } catch { /* ignore */ }
    }, 500);
    return 'web-print';
  }

  /* ── NATIVE ── */
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
      console.warn('Sharing cancelled or unavailable:', e);
    }
    return uri;
  } catch (e) {
    throw new Error(`PDF generation failed: ${String(e?.message || e)}`);
  }
};
