import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import Svg, { Line, Path, Circle, Text as SvgText, G } from 'react-native-svg';
import {
  CheckCircle2, AlertTriangle, Save, Share2, RotateCcw, Menu, Mic, BarChart2,
} from 'lucide-react-native';
import AppMenu from '../src/components/AppMenu';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import {
  fromBaseUnit, toBaseUnit, CONVERSIONS, buildJPTvsDACurve,
} from '../src/constants/logic';
import { insertReport, getDeviceId } from '../src/services/database';
import { generateAndSharePdf } from '../src/utils/pdf';
import { useVoiceFieldControl } from '../src/hooks/useVoiceFieldControl';

const pad = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// PPTX slide 7/9 spells pressure units "mb" / "mmHg" — numerically identical to the app's
// internal hPa/inHg unit codes (1 hPa = 1 mb), only the label text differs.
const UNIT_LABELS = { ft: 'ft', m: 'm', C: '°C', F: '°F', kg: 'Kg', lb: 'Lb', hPa: 'mb', inHg: 'mmHg', L: 'Lt' };
const fmtUnit = (u) => UNIT_LABELS[u] ?? u;

// ── Segmented unit pill ──
function UnitPill({ options, active, onSelect }) {
  return (
    <View style={styles.unitPill}>
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onSelect(opt)}
            style={[styles.unitSeg, isActive && styles.unitSegActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.unitSegText, isActive && styles.unitSegTextActive]}>{fmtUnit(opt)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Editable field cell — "TO BE IN BLOCK/BIGGER FONT" (PPTX) via cellInput's weight/size ──
function EditableCell({
  label, required, value, unit, unitOptions, onCommit, onUnitChange, maxLength, highlight, testID,
}) {
  const derive = (v, u) => (v !== null && v !== undefined ? String(round2(unit ? fromBaseUnit(v, u) : v)) : '');
  const [local, setLocal] = useState(() => derive(value, unit));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(derive(value, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, unit]);

  const commit = () => {
    setFocused(false);
    const n = parseFloat(local);
    if (!isNaN(n)) onCommit(unit ? toBaseUnit(n, unit) : n);
  };

  const selectUnit = (u) => {
    const n = parseFloat(local);
    if (!isNaN(n)) onCommit(toBaseUnit(n, unit));
    onUnitChange(u);
  };

  return (
    <View style={styles.cell} testID={testID}>
      <Text style={styles.cellLabel}>
        {label}
        {required ? <Text style={{ color: COLORS.primary }}> *</Text> : null}
      </Text>
      <View style={[styles.cellInputRow, highlight && styles.cellInputRowHighlight]}>
        <TextInput
          style={styles.cellInput}
          value={local}
          onChangeText={setLocal}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numeric"
          returnKeyType="done"
          maxLength={maxLength}
          selectTextOnFocus
        />
        {unitOptions ? <UnitPill options={unitOptions} active={unit} onSelect={selectUnit} /> : null}
      </View>
    </View>
  );
}

// ── Read-only computed cell ──
function ReadOnlyCell({
  label, value, unit, unitOptions, onUnitChange, suffix, highlight, warn, testID,
}) {
  const display = unit ? round2(fromBaseUnit(value, unit)) : round2(value);
  return (
    <View style={styles.cell} testID={testID}>
      <Text style={[styles.cellLabel, highlight && styles.cellLabelHighlight]}>{label}</Text>
      <View style={[
        styles.cellInputRow,
        highlight && styles.cellInputRowHighlight,
        warn && styles.cellInputRowWarn,
      ]}
      >
        <Text style={[styles.cellInputStatic, warn && { color: COLORS.error }]}>
          {display}
          {suffix ? <Text style={styles.cellSuffix}> {suffix}</Text> : null}
        </Text>
        {unitOptions ? <UnitPill options={unitOptions} active={unit} onSelect={onUnitChange || (() => {})} /> : null}
      </View>
    </View>
  );
}

// ── JPT vs Density Altitude graph ("JPT Calculation on Graph", PPTX slides 9/10) ──
function JPTGraph({ aircraft, abTemp, auw, currentDA, currentJPT, width, height = 200 }) {
  const curve = buildJPTvsDACurve(aircraft, abTemp, auw);
  const padL = 42, padR = 12, padT = 12, padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const jptVals = curve.map((p) => p.jpt).concat([currentJPT ?? 0, aircraft.jptMax ?? 870]);
  const yMin = Math.floor(Math.min(...jptVals) / 50) * 50 - 25;
  const yMax = Math.ceil(Math.max(...jptVals) / 50) * 50 + 25;
  const xMax = 20000;

  const sx = (da) => padL + (da / xMax) * plotW;
  const sy = (jpt) => padT + (1 - (jpt - yMin) / (yMax - yMin)) * plotH;

  const d = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.da).toFixed(1)} ${sy(p.jpt).toFixed(1)}`).join(' ');

  return (
    <Svg width={width} height={height}>
      {[0, 5000, 10000, 15000, 20000].map((da) => (
        <G key={da}>
          <Line x1={sx(da)} y1={padT} x2={sx(da)} y2={padT + plotH} stroke="#E5E7EB" strokeWidth={0.7} />
          <SvgText x={sx(da)} y={padT + plotH + 14} fontSize={9} fill={COLORS.textMuted} textAnchor="middle">
            {da / 1000}
          </SvgText>
        </G>
      ))}
      <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1.2} />
      <Line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1.2} />
      <Path d={d} stroke={COLORS.error} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {currentDA != null && currentJPT != null && (
        <>
          <Line
            x1={padL} y1={sy(currentJPT)} x2={sx(currentDA)} y2={sy(currentJPT)}
            stroke={COLORS.primary} strokeWidth={1} strokeDasharray="4,3" opacity={0.8}
          />
          <Line
            x1={sx(currentDA)} y1={padT + plotH} x2={sx(currentDA)} y2={sy(currentJPT)}
            stroke={COLORS.primary} strokeWidth={1} strokeDasharray="4,3" opacity={0.8}
          />
          <Circle cx={sx(currentDA)} cy={sy(currentJPT)} r={5} fill="#fff" stroke={COLORS.primary} strokeWidth={2.5} />
          <SvgText x={sx(currentDA) + 8} y={sy(currentJPT) - 8} fontSize={10} fill={COLORS.primary} fontWeight="bold">
            {`${Math.round(auw)} kg`}
          </SvgText>
        </>
      )}
      <SvgText x={padL + plotW / 2} y={height - 2} fontSize={9} fill={COLORS.textMuted} textAnchor="middle">
        Density Altitude (k ft)
      </SvgText>
    </Svg>
  );
}

// ── Calculator ────────────────────────────────────────────────────────────────
export default function Calculator() {
  const router = useRouter();
  const {
    aircraftDefaults, selectedAircraftId, inputs, setInputs, units, setUnit, outputs,
    updateAircraftDefaults,
  } = useAppState();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const aircraft = aircraftDefaults[selectedAircraftId];
  const isFit = outputs.status === 'FIT';

  const [saveOpen, setSaveOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // Screen-local unit toggles for the weight-breakdown fields — PPTX slide 7 mandates mixed
  // Lb/Kg defaults (AC/Equipment/Copilot weight → Lb, Pilot weight → Kg). Shared with
  // Default Settings only through the underlying kg value (aircraftDefaults), not the toggle.
  const [basicWeightUnit, setBasicWeightUnit] = useState('lb');
  const [equipmentWeightUnit, setEquipmentWeightUnit] = useState('lb');
  const [pilotWeightUnit, setPilotWeightUnit] = useState('kg');
  const [copilotWeightUnit, setCopilotWeightUnit] = useState('lb');
  const [emptyWeightUnit, setEmptyWeightUnit] = useState('kg');
  const [fuelMassUnit, setFuelMassUnit] = useState('kg');

  const chartWidth = Math.max(200, Math.min(width - (SPACING.lg + SPACING.md) * 2, 380));

  // When aircraft changes: reset session-level inputs to the new aircraft's defaults.
  // Weight-breakdown fields (basic/equipment/pilot/copilot) live directly on aircraftDefaults
  // and need no reset here — they already belong to the newly-selected aircraft.
  useEffect(() => {
    setInputs({
      fuel: aircraft.defaultFuel,
      ...(inputs.elevation == null && { elevation: aircraft.defaultElevation }),
      ...(inputs.qnh == null && { qnh: aircraft.defaultQNH }),
      ...(inputs.temperature == null && { temperature: aircraft.defaultTemp }),
      ...(inputs.crewWeight == null && { crewWeight: aircraft.defaultCrew }),
      ...(inputs.payload == null && { payload: aircraft.defaultPayload }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAircraftId]);

  const patchAircraft = (patch) => {
    updateAircraftDefaults({
      ...aircraftDefaults,
      [selectedAircraftId]: { ...aircraft, ...patch },
    });
  };

  // Elevation is two-way synced with Default Settings (client PPTX): editing it here updates
  // both the live session input AND the shared per-aircraft default.
  const commitElevation = (v) => {
    setInputs({ elevation: v });
    patchAircraft({ defaultElevation: v });
  };

  const doReset = () => {
    setInputs({
      elevation: aircraft.defaultElevation,
      qnh: aircraft.defaultQNH,
      temperature: aircraft.defaultTemp,
      crewWeight: aircraft.defaultCrew,
      fuel: aircraft.defaultFuel,
      payload: aircraft.defaultPayload,
    });
  };

  const openSave = async () => {
    try {
      const deviceId = await getDeviceId();
      const now = new Date();
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      setReportName(`${deviceId}_${stamp}`);
      setSaveOpen(true);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Error', text2: String(e?.message || e), position: 'top' });
    }
  };

  const doSave = async () => {
    if (!reportName.trim()) { Alert.alert('Name required'); return; }
    try {
      await insertReport({
        id: reportName.trim(),
        name: reportName.trim(),
        created_at: new Date().toISOString(),
        aircraft_id: aircraft.id,
        payload: { aircraft, inputs, outputs, units },
      });
      setSaveOpen(false);
      Toast.show({ type: 'success', text1: 'Saved', text2: reportName.trim(), position: 'top' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Save failed', text2: String(e?.message || e), position: 'top' });
    }
  };

  const doShare = async () => {
    try {
      const deviceId = await getDeviceId();
      const now = new Date();
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      await generateAndSharePdf({
        name: `${deviceId}_${stamp}`,
        created_at: new Date().toISOString(),
        aircraft, inputs, outputs, units,
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'PDF failed', text2: String(e?.message || e), position: 'top' });
    }
  };

  // ── Voice control (header mic) — "say a field, then say a number" (PPTX slide 4) ──
  // Each field's unit mirrors what its EditableCell currently displays, so the number
  // the user speaks (read off the screen) is converted the same way EditableCell's own
  // commit() does before reaching the same setters used by the on-screen inputs.
  const voiceFields = [
    { key: 'elevation', label: 'Elevation', aliases: ['altitude'] },
    { key: 'qnh', label: 'QNH', aliases: ['q n h', 'pressure', 'qnh'] },
    { key: 'temperature', label: 'Temperature', aliases: ['temp'] },
    {
      key: 'aircraftWeight', label: 'Aircraft Weight', aliases: ['basic weight', 'aircraft'],
    },
    { key: 'equipmentWeight', label: 'Equipment Weight', aliases: ['equipment'] },
    { key: 'pilotWeight', label: 'Pilot Weight', aliases: ['pilot'] },
    {
      key: 'copilotWeight', label: 'Copilot Weight', aliases: ['co-pilot weight', 'co pilot weight', 'copilot'],
    },
    {
      key: 'passengerWeight', label: 'Passenger Weight', aliases: ['passenger', 'pax weight', 'crew weight'],
    },
    { key: 'fuel', label: 'Fuel', aliases: ['fuel liters', 'fuel litres'] },
    { key: 'load', label: 'Load', aliases: ['payload', 'load weight'] },
  ];

  const voiceOptions = [
    { key: 'save', label: 'Save', onSelect: openSave },
    { key: 'share', label: 'Share PDF', onSelect: doShare },
    { key: 'reset', label: 'Reset', onSelect: doReset },
  ];

  const onCommitValue = (key, n) => {
    switch (key) {
      case 'elevation':
        commitElevation(toBaseUnit(n, units.altitude));
        break;
      case 'qnh':
        setInputs({ qnh: toBaseUnit(n, units.pressure) });
        break;
      case 'temperature':
        setInputs({ temperature: toBaseUnit(n, units.temperature) });
        break;
      case 'aircraftWeight':
        patchAircraft({ basicWeight: toBaseUnit(n, basicWeightUnit) });
        break;
      case 'equipmentWeight':
        patchAircraft({ equipmentWeight: toBaseUnit(n, equipmentWeightUnit) });
        break;
      case 'pilotWeight':
        patchAircraft({ pilotWeight: toBaseUnit(n, pilotWeightUnit) });
        break;
      case 'copilotWeight':
        patchAircraft({ copilotWeight: toBaseUnit(n, copilotWeightUnit) });
        break;
      case 'passengerWeight':
        setInputs({ crewWeight: toBaseUnit(n, units.weight) });
        break;
      case 'fuel':
        // Fuel's EditableCell has unit="L" (truthy), so its own commit() already runs
        // toBaseUnit(n, 'L') before calling setInputs({ fuel: v }) — mirror that exactly.
        setInputs({ fuel: toBaseUnit(n, 'L') });
        break;
      case 'load':
        setInputs({ payload: toBaseUnit(n, units.weight) });
        break;
      default:
        break;
    }
  };

  const {
    listening, activeFieldKey, toggle: toggleVoice,
  } = useVoiceFieldControl({ fields: voiceFields, options: voiceOptions, onCommitValue });

  const lowerLb = Math.round((aircraft.auwLowerThresholdKg ?? aircraft.mauw) * CONVERSIONS.kg_to_lb);
  const upperLb = Math.round(aircraft.mauw * CONVERSIONS.kg_to_lb);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="calculator-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={styles.headerBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="open-menu-btn"
        >
          <Menu size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HAL HPS</Text>
        <TouchableOpacity
          onPress={toggleVoice}
          style={[styles.micBtn, listening && styles.micBtnActive]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="header-mic-btn"
        >
          <Mic size={18} color={listening ? '#fff' : COLORS.error} />
        </TouchableOpacity>
      </View>

      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>{aircraft.name} — Hover Power Calculation</Text>
          <View style={[styles.fitBadge, { backgroundColor: isFit ? COLORS.success : COLORS.error }]}>
            {isFit ? <CheckCircle2 size={13} color="#fff" /> : <AlertTriangle size={13} color="#fff" />}
            <Text style={styles.fitText}>{isFit ? 'FIT' : 'NOT FIT'}</Text>
          </View>
        </View>

        {!isFit && (
          <View style={styles.warnBanner}>
            <AlertTriangle size={14} color={COLORS.error} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              {outputs.reasons.map((r, i) => (
                <Text key={i} style={styles.warnText}>• {r}</Text>
              ))}
            </View>
          </View>
        )}

        <View style={styles.divider} />

        {/* ── INPUTS ── */}
        <View style={styles.grid}>
          <View style={styles.row}>
            <EditableCell
              required label="Elevation" value={inputs.elevation} unit={units.altitude}
              unitOptions={['ft', 'm']} onCommit={commitElevation}
              onUnitChange={(u) => setUnit('altitude', u)} maxLength={5} testID="calc-elevation"
              highlight={activeFieldKey === 'elevation'}
            />
            <EditableCell
              required label="QNH" value={inputs.qnh} unit={units.pressure}
              unitOptions={['hPa', 'inHg']} onCommit={(v) => setInputs({ qnh: v })}
              onUnitChange={(u) => setUnit('pressure', u)} maxLength={units.pressure === 'inHg' ? 3 : 4}
              testID="calc-qnh" highlight={activeFieldKey === 'qnh'}
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              required label="Temperature" value={inputs.temperature} unit={units.temperature}
              unitOptions={['C', 'F']} onCommit={(v) => setInputs({ temperature: v })}
              onUnitChange={(u) => setUnit('temperature', u)} maxLength={3} testID="calc-temperature"
              highlight={activeFieldKey === 'temperature'}
            />
            <ReadOnlyCell
              label="PA/Zp0" value={outputs.PA} unit={units.altitude} unitOptions={['ft', 'm']}
              onUnitChange={(u) => setUnit('altitude', u)} testID="calc-pa"
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              required label="Aircraft Weight" value={aircraft.basicWeight} unit={basicWeightUnit}
              unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ basicWeight: v })}
              onUnitChange={setBasicWeightUnit} testID="calc-aircraft-weight"
              highlight={activeFieldKey === 'aircraftWeight'}
            />
            <EditableCell
              required label="Equipment Weight" value={aircraft.equipmentWeight} unit={equipmentWeightUnit}
              unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ equipmentWeight: v })}
              onUnitChange={setEquipmentWeightUnit} testID="calc-equipment-weight"
              highlight={activeFieldKey === 'equipmentWeight'}
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              required label="Pilot Weight" value={aircraft.pilotWeight} unit={pilotWeightUnit}
              unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ pilotWeight: v })}
              onUnitChange={setPilotWeightUnit} testID="calc-pilot-weight"
              highlight={activeFieldKey === 'pilotWeight'}
            />
            <EditableCell
              required label="Copilot Weight" value={aircraft.copilotWeight} unit={copilotWeightUnit}
              unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ copilotWeight: v })}
              onUnitChange={setCopilotWeightUnit} testID="calc-copilot-weight"
              highlight={activeFieldKey === 'copilotWeight'}
            />
          </View>
          <View style={styles.row}>
            <ReadOnlyCell
              label="Empty Weight" value={outputs.EMPTY_WEIGHT} unit={emptyWeightUnit}
              unitOptions={['lb', 'kg']} onUnitChange={setEmptyWeightUnit} testID="calc-empty-weight"
            />
            <EditableCell
              required label="Passenger Weight" value={inputs.crewWeight} unit={units.weight}
              unitOptions={['kg', 'lb']} onCommit={(v) => setInputs({ crewWeight: v })}
              onUnitChange={(u) => setUnit('weight', u)} maxLength={3} testID="calc-passenger-weight"
              highlight={activeFieldKey === 'passengerWeight'}
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              label="Fuel" value={inputs.fuel} unit="L" unitOptions={['L']}
              onCommit={(v) => setInputs({ fuel: v })} onUnitChange={() => {}}
              maxLength={3} testID="calc-fuel-lt" highlight={activeFieldKey === 'fuel'}
            />
            <ReadOnlyCell
              label="Fuel" value={inputs.fuel} unit={fuelMassUnit} unitOptions={['kg', 'lb']}
              onUnitChange={setFuelMassUnit} testID="calc-fuel-mass"
            />
          </View>
          <View style={styles.row}>
            <ReadOnlyCell
              label="Max Power Available" value={outputs.POWER_AVAIL} suffix="shp" highlight
              testID="calc-max-power-avail"
            />
            <EditableCell
              required label="Load" value={inputs.payload} unit={units.weight}
              unitOptions={['kg', 'lb']} onCommit={(v) => setInputs({ payload: v })}
              onUnitChange={(u) => setUnit('weight', u)} maxLength={3} testID="calc-load"
              highlight={activeFieldKey === 'load'}
            />
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── COMPUTE / RESULTS ── */}
        <Text style={styles.sectionLabel}>COMPUTE / RESULTS</Text>
        <View style={styles.grid}>
          <View style={styles.row}>
            <ReadOnlyCell
              label="DA/Zd0" value={outputs.DENSITY_ALT} unit={units.altitude} unitOptions={['ft', 'm']}
              onUnitChange={(u) => setUnit('altitude', u)} warn={outputs.DENSITY_ALT > 18000} testID="calc-da"
            />
            <ReadOnlyCell
              label="All Up Weight" value={outputs.AUW} unit={units.weight} unitOptions={['kg', 'lb']}
              onUnitChange={(u) => setUnit('weight', u)} warn={outputs.AUW > aircraft.mauw} testID="calc-auw"
            />
          </View>
          <View style={styles.row}>
            <ReadOnlyCell
              label="Hover Power Required" value={outputs.POWER_REQ} suffix="shp" highlight
              warn={outputs.POWER_REQ > outputs.POWER_AVAIL} testID="calc-power-req"
            />
            <ReadOnlyCell
              label="JPT" value={outputs.JPT} unit={units.temperature} unitOptions={['C', 'F']}
              onUnitChange={(u) => setUnit('temperature', u)} warn={outputs.JPT > (aircraft.jptMax ?? 870)}
              testID="calc-jpt"
            />
          </View>
          <View style={styles.row}>
            <ReadOnlyCell
              label={`Possible Payload For ${lowerLb}Lb`} value={outputs.POSSIBLE_PAYLOAD_LOWER}
              unit={units.weight} unitOptions={['kg', 'lb']} onUnitChange={(u) => setUnit('weight', u)}
              warn={outputs.POSSIBLE_PAYLOAD_LOWER < 0} testID="calc-payload-lower"
            />
            <ReadOnlyCell
              label={`For ${upperLb}Lb`} value={outputs.POSSIBLE_PAYLOAD_UPPER}
              unit={units.weight} unitOptions={['kg', 'lb']} onUnitChange={(u) => setUnit('weight', u)}
              warn={outputs.POSSIBLE_PAYLOAD_UPPER < 0} testID="calc-payload-upper"
            />
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── JPT CALCULATION ON GRAPH ── */}
        <Text style={styles.sectionLabel}>JPT CALCULATION ON GRAPH</Text>
        <View style={styles.chartCard}>
          <JPTGraph
            aircraft={aircraft} abTemp={outputs.AB_TEMP} auw={outputs.AUW}
            currentDA={outputs.DENSITY_ALT} currentJPT={outputs.JPT} width={chartWidth}
          />
        </View>

        {/* ── ACTIONS ── */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.chartsBtn]}
          onPress={() => router.push('/results')}
        >
          <BarChart2 size={16} color={COLORS.primaryDark} />
          <Text style={styles.chartsBtnText}>View Performance Charts</Text>
        </TouchableOpacity>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={openSave}>
            <Save size={15} color="#fff" />
            <Text style={styles.primaryText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.outlineBtn]} onPress={doShare}>
            <Share2 size={15} color={COLORS.primaryDark} />
            <Text style={styles.outlineText}>Share PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.ghostBtn]} onPress={doReset}>
            <RotateCcw size={15} color={COLORS.textMuted} />
            <Text style={styles.ghostText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Save modal */}
      <Modal visible={saveOpen} animationType="fade" transparent onRequestClose={() => setSaveOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save Report</Text>
            <TextInput
              style={styles.modalInput}
              value={reportName}
              onChangeText={setReportName}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.ghostBtn, { flex: 1 }]}
                onPress={() => setSaveOpen(false)}
              >
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn, { flex: 1 }]}
                onPress={doSave}
              >
                <Text style={styles.primaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: 15 },
  micBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', ...SHADOW,
  },
  micBtnActive: { backgroundColor: COLORS.error },

  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: SPACING.sm, marginTop: SPACING.md,
  },
  screenTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  fitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5,
  },
  fitText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    letterSpacing: 1, marginBottom: SPACING.md,
  },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.lg },

  grid: { gap: SPACING.lg },
  row: { flexDirection: 'row', gap: SPACING.lg },
  cell: { flex: 1, gap: SPACING.sm },
  cellLabel: { fontSize: 12.5, fontWeight: '600', color: '#3F3F3F' },
  cellLabelHighlight: { color: COLORS.primaryDark, fontWeight: '700' },
  cellInputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, height: 40, paddingHorizontal: SPACING.md, ...SHADOW,
  },
  cellInputRowHighlight: { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: COLORS.primaryLight },
  cellInputRowWarn: { borderColor: COLORS.error, borderWidth: 1.5 },
  // "TO BE IN BLOCK/BIGGER FONT" (PPTX) — numeric values read as a bold "block" style.
  cellInput: { flex: 1, fontSize: 16, fontWeight: '800', color: '#525252', padding: 0 },
  cellInputStatic: { flex: 1, fontSize: 16, fontWeight: '800', color: '#525252' },
  cellSuffix: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },

  unitPill: { flexDirection: 'row', backgroundColor: COLORS.primaryLight, borderRadius: 4, padding: 2 },
  unitSeg: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3 },
  unitSegActive: { backgroundColor: COLORS.primaryDark },
  unitSegText: { fontSize: 10, fontWeight: '600', color: COLORS.primaryDark },
  unitSegTextActive: { color: '#fff' },

  // Warning banner
  warnBanner: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
    backgroundColor: COLORS.errorBg, borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.error, marginTop: SPACING.md,
  },
  warnText: { fontSize: 12, color: COLORS.error, fontWeight: '600', lineHeight: 18 },

  chartCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: 'rgba(13,144,184,0.25)', padding: SPACING.md, alignItems: 'center',
  },

  // Action buttons
  chartsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: 14, borderRadius: RADIUS.md, marginTop: SPACING.lg,
    backgroundColor: COLORS.primaryLight, borderWidth: 1.5, borderColor: COLORS.primary,
  },
  chartsBtnText: { textAlign: 'center', color: COLORS.primaryDark, fontWeight: '800', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 13, borderRadius: RADIUS.md,
  },
  primaryBtn: { backgroundColor: COLORS.primary, ...SHADOW },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  outlineBtn: { borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.card },
  outlineText: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 13 },
  ghostBtn: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  ghostText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },

  // Save modal
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: SPACING.xl,
  },
  modalCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.xl,
    padding: SPACING.xl, width: '100%', ...SHADOW,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.md },
  modalInput: {
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md,
    padding: SPACING.md, fontSize: 14, color: COLORS.text, fontWeight: '600',
  },
  modalBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
});
