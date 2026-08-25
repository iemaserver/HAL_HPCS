import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, TextInput, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Menu, Mic } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import AppMenu from '../src/components/AppMenu';
import PerformanceChart from '../src/components/PerformanceChart';
import {
  fromBaseUnit, toBaseUnit, CONVERSIONS,
  computeVmaxKnots, computeROCFpm, buildPerformanceCurves, computeCurrentPerfPoint,
} from '../src/constants/logic';
import { useVoiceFieldControl } from '../src/hooks/useVoiceFieldControl';

const HELI_IMG = {
  chetak: require('../assets/images/Chetak-1.png'),
  cheetah: require('../assets/images/Cheetah-1.png'),
  cheetal: require('../assets/images/Cheetal-1.png'),
};

// Display labels for unit codes — mirrors the pill labels used across calculator.js / airframe.js
const UNIT_LABELS = {
  ft: 'ft', m: 'm', C: '°C', F: '°F', kg: 'Kg', lb: 'Lb', hPa: 'hPa', inHg: 'inHg', L: 'Lt',
};
const fmtUnit = (u) => UNIT_LABELS[u] ?? u;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Segmented unit pill — visually matches the Figma "Input" unit chip ──
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

// ── Editable field cell — bound to a live AppState input (elevation, QNH, weights…) ──
function EditableCell({ label, required, value, unit, unitOptions, onCommit, onUnitChange, testID }) {
  const derive = (v, u) => (v !== null && v !== undefined ? String(round2(fromBaseUnit(v, u))) : '');
  const [local, setLocal] = useState(() => derive(value, unit));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(derive(value, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, unit]);

  const commit = () => {
    setFocused(false);
    const n = parseFloat(local);
    if (!isNaN(n)) onCommit(toBaseUnit(n, unit));
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
      <View style={styles.cellInputRow}>
        <TextInput
          style={styles.cellInput}
          value={local}
          onChangeText={setLocal}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numeric"
          returnKeyType="done"
          selectTextOnFocus
        />
        {unitOptions ? <UnitPill options={unitOptions} active={unit} onSelect={selectUnit} /> : null}
      </View>
    </View>
  );
}

// ── Read-only field cell — for computed/derived values (PA, DA, AUW, fuel-mass, power constants) ──
function ReadOnlyCell({ label, value, unit, unitOptions, onUnitChange, suffix, testID }) {
  const display = unitOptions ? round2(fromBaseUnit(value, unit)) : round2(value);
  return (
    <View style={styles.cell} testID={testID}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View style={styles.cellInputRow}>
        <Text style={styles.cellInputStatic}>
          {display}
          {suffix ? <Text style={styles.cellSuffix}> {suffix}</Text> : null}
        </Text>
        {unitOptions ? <UnitPill options={unitOptions} active={unit} onSelect={onUnitChange || (() => {})} /> : null}
      </View>
    </View>
  );
}

export default function PerformanceData() {
  const params = useLocalSearchParams();
  const { aircraftDefaults, selectedAircraftId, inputs, setInputs, units, setUnit, outputs } = useAppState();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [menuOpen, setMenuOpen] = useState(false);
  const [metric, setMetric] = useState(params.metric === 'roc' ? 'roc' : 'vmax');
  // Rate-of-climb output unit — screen-local, not part of global unit prefs (ft/min vs m/min)
  const [rocUnit, setRocUnit] = useState('ft');

  const aircraft = aircraftDefaults[selectedAircraftId];

  // ── Voice control (header mic) — "say a field, then say a number" (PPTX slide 4) ──
  // Each field's unit mirrors what its EditableCell currently displays, so the number
  // the user speaks (read off the screen) is converted the same way EditableCell's own
  // commit() does before reaching the same setters used by the on-screen inputs.
  // "Cruise Power" only exists while the vmax tab is active, so it's only offered then —
  // this array is rebuilt fresh every render, so the hook always sees the current tab.
  const voiceFields = [
    { key: 'elevation', label: 'Elevation', aliases: ['altitude'] },
    { key: 'qnh', label: 'QNH', aliases: ['q n h', 'pressure'] },
    { key: 'temperature', label: 'Temperature', aliases: ['temp'] },
    { key: 'load', label: 'Load', aliases: ['payload', 'load weight'] },
    {
      key: 'passengerWeight', label: 'Passenger Weight', aliases: ['passenger', 'pax weight', 'crew weight'],
    },
    { key: 'fuel', label: 'Fuel', aliases: ['fuel liters', 'fuel litres'] },
    ...(metric === 'vmax'
      ? [{ key: 'cruisePower', label: 'Cruise Power', aliases: ['cruise', 'cruising power'] }]
      : []),
  ];

  const voiceOptions = [
    { key: 'vmax', label: 'Max Level Flight Speed', aliases: ['level flight speed', 'max speed', 'vmax'], onSelect: () => setMetric('vmax') },
    { key: 'roc', label: 'Rate of Climb', aliases: ['climb rate', 'roc'], onSelect: () => setMetric('roc') },
  ];

  const onCommitValue = (key, n) => {
    switch (key) {
      case 'elevation':
        setInputs({ elevation: toBaseUnit(n, units.altitude) });
        break;
      case 'qnh':
        setInputs({ qnh: toBaseUnit(n, units.pressure) });
        break;
      case 'temperature':
        setInputs({ temperature: toBaseUnit(n, units.temperature) });
        break;
      case 'load':
        setInputs({ payload: toBaseUnit(n, units.weight) });
        break;
      case 'passengerWeight':
        setInputs({ crewWeight: toBaseUnit(n, units.weight) });
        break;
      case 'fuel':
        // Fuel's EditableCell has unit="L" (truthy), so its own commit() already runs
        // toBaseUnit(n, 'L') before calling setInputs({ fuel: v }) — mirror that exactly.
        setInputs({ fuel: toBaseUnit(n, 'L') });
        break;
      case 'cruisePower':
        // unit="shp" isn't in toBaseUnit's switch, so it falls through to the default
        // (identity) case — same as its EditableCell's own commit() would do.
        setInputs({ cruisePower: toBaseUnit(n, 'shp') });
        break;
      default:
        break;
    }
  };

  const { listening, toggle: toggleVoice } = useVoiceFieldControl({
    fields: voiceFields, options: voiceOptions, onCommitValue,
  });

  const curves = useMemo(() => buildPerformanceCurves(aircraft, metric), [aircraft, metric]);
  const currentPoint = useMemo(
    () => computeCurrentPerfPoint(aircraft, outputs.DENSITY_ALT, outputs.AUW, metric),
    [aircraft, outputs.DENSITY_ALT, outputs.AUW, metric],
  );

  const vmaxKt = Math.round(computeVmaxKnots(aircraft, outputs.DENSITY_ALT, outputs.AUW));
  const rocFpm = Math.round(computeROCFpm(aircraft, outputs.DENSITY_ALT, outputs.AUW));
  const rocDisplay = rocUnit === 'ft' ? rocFpm : Math.round(rocFpm * CONVERSIONS.ft_to_m);

  // useWindowDimensions() can briefly report width=0 on the initial RN-web hydration pass,
  // which would otherwise compute a negative <Svg> width — clamp to a sane minimum.
  const chartWidth = Math.max(200, Math.min(width - (SPACING.lg + SPACING.md) * 2, 380));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="performance-data-screen">
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

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 32 + insets.bottom }}>
        {/* Aircraft badge + title */}
        <View style={styles.titleRow}>
          <View style={styles.badge}>
            <Image source={HELI_IMG[selectedAircraftId]} style={styles.badgeImg} resizeMode="cover" />
            <Text style={styles.badgeLabel}>{aircraft.name}</Text>
          </View>
          <Text style={styles.screenTitle}>Performance Data</Text>
        </View>

        {/* Metric toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, metric === 'vmax' && styles.tabBtnActive]}
            onPress={() => setMetric('vmax')}
            testID="tab-vmax"
          >
            <Text style={[styles.tabText, metric === 'vmax' && styles.tabTextActive]}>Max Level Flight Speed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, metric === 'roc' && styles.tabBtnActive]}
            onPress={() => setMetric('roc')}
            testID="tab-roc"
          >
            <Text style={[styles.tabText, metric === 'roc' && styles.tabTextActive]}>Rate of Climb</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Input grid */}
        <View style={styles.grid}>
          <View style={styles.row}>
            <EditableCell
              label="Elevation" value={inputs.elevation} unit={units.altitude} unitOptions={['ft', 'm']}
              onCommit={(v) => setInputs({ elevation: v })} onUnitChange={(u) => setUnit('altitude', u)}
              testID="cell-elevation"
            />
            <EditableCell
              label="QNH" value={inputs.qnh} unit={units.pressure} unitOptions={['hPa', 'inHg']}
              onCommit={(v) => setInputs({ qnh: v })} onUnitChange={(u) => setUnit('pressure', u)}
              testID="cell-qnh"
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              label="Temperature" value={inputs.temperature} unit={units.temperature} unitOptions={['C', 'F']}
              onCommit={(v) => setInputs({ temperature: v })} onUnitChange={(u) => setUnit('temperature', u)}
              testID="cell-temperature"
            />
            <ReadOnlyCell
              label="PA/Zp1" value={outputs.PA} unit={units.altitude} unitOptions={['ft', 'm']}
              onUnitChange={(u) => setUnit('altitude', u)} testID="cell-pa"
            />
          </View>
          <View style={styles.row}>
            <ReadOnlyCell
              label="DA/Zσ1" value={outputs.DENSITY_ALT} unit={units.altitude} unitOptions={['ft', 'm']}
              onUnitChange={(u) => setUnit('altitude', u)} testID="cell-da"
            />
            <ReadOnlyCell
              label="All up Weight" value={outputs.AUW} unit={units.weight} unitOptions={['kg', 'lb']}
              onUnitChange={(u) => setUnit('weight', u)} testID="cell-auw"
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              label="Load" value={inputs.payload} unit={units.weight} unitOptions={['kg', 'lb']}
              onCommit={(v) => setInputs({ payload: v })} onUnitChange={(u) => setUnit('weight', u)}
              testID="cell-load"
            />
            <EditableCell
              label="Passenger Weight" required value={inputs.crewWeight} unit={units.weight} unitOptions={['kg', 'lb']}
              onCommit={(v) => setInputs({ crewWeight: v })} onUnitChange={(u) => setUnit('weight', u)}
              testID="cell-passenger-weight"
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              label="Fuel" value={inputs.fuel} unit="L" unitOptions={['L']}
              onCommit={(v) => setInputs({ fuel: v })} onUnitChange={() => {}}
              testID="cell-fuel-lt"
            />
            <ReadOnlyCell
              label="Fuel" value={inputs.fuel} unit={units.weight} unitOptions={['kg', 'lb']}
              onUnitChange={(u) => setUnit('weight', u)} testID="cell-fuel-mass"
            />
          </View>
          {metric === 'vmax' ? (
            <View style={styles.row}>
              <EditableCell
                label="Cruise Power" value={inputs.cruisePower ?? aircraft.baselinePowerReqSHP} unit="shp" unitOptions={null}
                onCommit={(v) => setInputs({ cruisePower: v })} onUnitChange={() => {}}
                testID="cell-cruise-power"
              />
              <ReadOnlyCell label="Max Power1" value={aircraft.ratedPowerSHP} suffix="shp" testID="cell-max-power" />
            </View>
          ) : (
            <View style={styles.row}>
              <ReadOnlyCell label="Max Power1" value={aircraft.ratedPowerSHP} suffix="shp" testID="cell-max-power" />
              <View style={styles.cell} />
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Output row */}
        {metric === 'vmax' ? (
          <View style={styles.outputRow} testID="output-vmax">
            <Text style={styles.outputLabel}>Max Speed in Level Flight</Text>
            <View style={styles.outputValueBox}>
              <Text style={styles.outputValueText}>{vmaxKt}</Text>
              <View style={styles.unitPill}>
                <View style={[styles.unitSeg, styles.unitSegActive]}>
                  <Text style={[styles.unitSegText, styles.unitSegTextActive]}>Kt</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.outputRow} testID="output-roc">
            <Text style={styles.outputLabel}>Rate of Climb</Text>
            <View style={styles.outputValueBox}>
              <Text style={styles.outputValueText}>{rocDisplay}</Text>
              <UnitPill options={['ft', 'm']} active={rocUnit} onSelect={setRocUnit} />
            </View>
          </View>
        )}

        {/* Chart */}
        <View style={styles.chartCard}>
          <PerformanceChart type={metric} curves={curves} current={currentPoint} width={chartWidth} height={260} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

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

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.md },
  badge: {
    width: 66, height: 66, borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryLight,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  badgeImg: { width: '100%', height: 32, borderRadius: RADIUS.sm - 2 },
  badgeLabel: { fontSize: 10, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  screenTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  tabRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, alignItems: 'center',
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
  },
  tabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textMuted },
  tabTextActive: { color: '#fff' },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.lg },

  grid: { gap: SPACING.lg },
  row: { flexDirection: 'row', gap: SPACING.lg },
  cell: { flex: 1, gap: SPACING.sm },
  cellLabel: { fontSize: 12.5, fontWeight: '600', color: '#3F3F3F' },
  cellInputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, height: 38, paddingHorizontal: SPACING.md, ...SHADOW,
  },
  cellInput: { flex: 1, fontSize: 14, fontWeight: '600', color: '#525252', padding: 0 },
  cellInputStatic: { flex: 1, fontSize: 14, fontWeight: '600', color: '#525252' },
  cellSuffix: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },

  unitPill: { flexDirection: 'row', backgroundColor: COLORS.primaryLight, borderRadius: 4, padding: 2 },
  unitSeg: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3 },
  unitSegActive: { backgroundColor: COLORS.primaryDark },
  unitSegText: { fontSize: 10, fontWeight: '600', color: COLORS.primaryDark },
  unitSegTextActive: { color: '#fff' },

  outputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  outputLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: '#333' },
  outputValueBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, height: 38, paddingHorizontal: SPACING.md, minWidth: 100, ...SHADOW,
  },
  outputValueText: { fontSize: 14, fontWeight: '700', color: '#525252' },

  chartCard: {
    marginTop: SPACING.lg, backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: 'rgba(13,144,184,0.25)', padding: SPACING.md, alignItems: 'center',
  },
});
