import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export const buildReportHtml = (report) => {
  const name = report?.name || 'HAL_Report';
  const createdAt = report?.created_at || new Date().toISOString();
  const aircraft = report?.aircraft || {};
  const inputs = report?.inputs || {};
  const outputs = report?.outputs || {};
  const units = report?.units || { altitude: 'ft', temperature: 'C', weight: 'kg', pressure: 'hPa' };

  // No dynamic charts in the report for now (client 20-Nov-26) — graphs are reference-only
  // sheets inside the app.
  // AUW is reported in pounds by default (client 20-Nov-26).
  const auwLb = outputs.AUW != null ? Math.round(outputs.AUW * 2.20462 * 100) / 100 : '-';

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
    <div class="status-sub">Aircraft: ${aircraft.name || '-'} &nbsp;|&nbsp; AUW: ${auwLb} lb &nbsp;|&nbsp; DA: ${outputs.DENSITY_ALT ?? '-'} ft</div>
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
          <tr><td class="lbl">Max Collective (SL)</td><td class="sep"></td><td class="val">${aircraft.maxCollectiveSL ?? '-'}</td></tr>
          <tr><td class="lbl">Elevation (QFE)</td><td class="sep"></td><td class="val">${inputs.elevation ?? '-'} ft</td></tr>
          <tr><td class="lbl">QNH</td><td class="sep"></td><td class="val">${inputs.qnh ?? '-'} mb</td></tr>
          <tr><td class="lbl">OAT</td><td class="sep"></td><td class="val">${inputs.temperature ?? '-'} °C</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h2>Weight Breakdown</h2>
      <table>
        <thead><tr><th colspan="3">Component</th></tr></thead>
        <tbody>
          <tr><td class="lbl">Aircraft Basic Weight</td><td class="sep"></td><td class="val">${aircraft.basicWeight ?? '-'} kg</td></tr>
          <tr><td class="lbl">Equipment Weight</td><td class="sep"></td><td class="val">${aircraft.equipmentWeight ?? '-'} kg</td></tr>
          <tr><td class="lbl">Pilot + Copilot Weight</td><td class="sep"></td><td class="val">${((Number(aircraft.pilotWeight) || 0) + (Number(aircraft.copilotWeight) || 0))} kg</td></tr>
          <tr><td class="lbl">Operational Empty Weight</td><td class="sep"></td><td class="val">${outputs.EMPTY_WEIGHT ?? '-'} kg</td></tr>
          <tr><td class="lbl">Passenger Weight</td><td class="sep"></td><td class="val">${inputs.crewWeight ?? '-'} kg</td></tr>
          <tr><td class="lbl">Fuel Weight</td><td class="sep"></td><td class="val">${inputs.fuel ?? '-'} kg</td></tr>
          <tr><td class="lbl">Load</td><td class="sep"></td><td class="val">${inputs.payload ?? '-'} kg</td></tr>
          <tr><td class="lbl" style="font-weight:800;color:#0F172A;">All Up Weight</td><td class="sep"></td><td class="val" style="font-weight:800;font-size:13px;color:#0F172A;">${auwLb} lb (${outputs.AUW ?? '-'} kg)</td></tr>
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
      <div class="k">All Up Weight</div>
      <div class="v">${auwLb}<span class="u">lb</span></div>
    </div>
    <div class="perf-card hl">
      <div class="k">Max Collective Pitch</div>
      <div class="v">${outputs.COLLECTIVE_AVAIL ?? '-'}</div>
    </div>
    <div class="perf-card ${isFit ? '' : 'warn'}">
      <div class="k">Hover Power Required</div>
      <div class="v">${outputs.COLLECTIVE_REQ ?? '-'}</div>
    </div>
  </div>

</div><!-- end .body -->

<!-- ═══════════════════ PAGE 2 ═══════════════════ -->
<div class="charts-section">
  <div class="charts-header">
    <div class="ch-title">Fit-to-Fly Evaluation</div>
    <div class="ch-sub">${aircraft.name || '-'} &nbsp;·&nbsp; AUW ${auwLb} lb &nbsp;·&nbsp; DA ${outputs.DENSITY_ALT ?? '-'} ft &nbsp;·&nbsp; OAT ${inputs.temperature ?? '-'}°C</div>
  </div>
  <div class="accent-bar"></div>

  <div class="charts-body">
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

  return html;
};

// ─── Main export ────────────────────────────────────────────────────────────

export const generateAndSharePdf = async (report) => {
  const name = report?.name || 'HAL_Report';
  const html = buildReportHtml(report);

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
