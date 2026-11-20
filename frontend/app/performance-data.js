import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Menu, Mic } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import AppMenu from '../src/components/AppMenu';
import GraphViewer from '../src/components/GraphViewer';
import { GRAPH_TITLES, getGraphSource, graphMetricsFor } from '../src/constants/graphs';
import { fromBaseUnit, toBaseUnit } from '../src/constants/logic';
import { useVoiceFieldControl } from '../src/hooks/useVoiceFieldControl';

const HELI_IMG = {
  chetak: require('../assets/images/Chetak-1.png'),
  cheetah: require('../assets/images/Cheetah-1.png'),
  cheetal: require('../assets/images/Cheetal-1.png'),
};

// Display labels for unit codes — mirrors the pill labels used across calculator.js / airframe.js
const UNIT_LABELS = {
  ft: 'ft', m: 'm', C: '°C', F: '°F', kg: 'Kg', lb: 'Lb', hPa: 'mb', mmHg: 'mmHg', L: 'Lt',
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

// Units a field accepts when spoken ("elevation 500 meters"). Used by the voice hook.
const VOICE_UNITS = {
  elevation: ['ft', 'm'],
  qnh: ['hPa', 'mmHg'],
  temperature: ['C', 'F'],
  load: ['kg', 'lb'],
  passengerWeight: ['kg', 'lb'],
  fuel: ['L'],
};
const withUnits = (fields) => fields.map((f) => ({ ...f, units: VOICE_UNITS[f.key] }));

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
  const {
    aircraftDefaults, selectedAircraftId, inputs, setInputs, outputs, micEnabled,
  } = useAppState();
  const insets = useSafeAreaInsets();

  const [menuOpen, setMenuOpen] = useState(false);
  const [metric, setMetric] = useState(GRAPH_TITLES[params.metric] ? params.metric : 'vmax');
  // The menu / other screens can deep-link to a specific graph (e.g. JPT from Hover Power).
  useEffect(() => {
    if (GRAPH_TITLES[params.metric]) setMetric(params.metric);
  }, [params.metric]);
  // Screen-local unit toggles (client correction 2026-09-14: changing one field's unit must
  // not change any other field's unit, including on other screens that used to share these
  // via the global `units` prefs).
  const [elevationUnit, setElevationUnit] = useState('ft');
  const [qnhUnit, setQnhUnit] = useState('hPa');
  const [temperatureUnit, setTemperatureUnit] = useState('C');
  const [paUnit, setPaUnit] = useState('ft');
  const [daUnit, setDaUnit] = useState('ft');
  const [auwUnit, setAuwUnit] = useState('lb'); // client 20-Nov-26: AUW defaults to pounds
  const [loadUnit, setLoadUnit] = useState('kg');
  const [passengerWeightUnit, setPassengerWeightUnit] = useState('kg');
  const [fuelMassUnit, setFuelMassUnit] = useState('kg');

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
      ? [{ key: 'cruisePower', label: 'Cruise Collective Pitch', aliases: ['cruise collective', 'cruise pitch', 'cruise power', 'cruise'] }]
      : []),
  ];

  const VOICE_ALIASES = {
    vmax: ['level flight speed', 'max speed', 'vmax', 'speed'],
    roc: ['climb rate', 'roc', 'climb'],
    'autorotation-rpm': ['autorotation', 'rpm', 'autorotation rpm'],
    jpt: ['jpt', 'j p t', 'jpt graph', 'tail pipe temperature'],
    maxpower: ['max power', 'maximum power', 'power available'],
  };
  const voiceOptions = Object.keys(GRAPH_TITLES).map((m) => ({
    key: m, label: GRAPH_TITLES[m], aliases: VOICE_ALIASES[m], onSelect: () => setMetric(m),
  }));

  const onUnitChange = (key, unit) => {
    const setters = {
      elevation: setElevationUnit,
      qnh: setQnhUnit,
      temperature: setTemperatureUnit,
      load: setLoadUnit,
      passengerWeight: setPassengerWeightUnit,
    };
    setters[key]?.(unit);
  };

  const onCommitValue = (key, n, unit) => {
    switch (key) {
      case 'elevation':
        setInputs({ elevation: toBaseUnit(n, unit ?? elevationUnit) });
        break;
      case 'qnh':
        setInputs({ qnh: toBaseUnit(n, unit ?? qnhUnit) });
        break;
      case 'temperature':
        setInputs({ temperature: toBaseUnit(n, unit ?? temperatureUnit) });
        break;
      case 'load':
        setInputs({ payload: toBaseUnit(n, unit ?? loadUnit) });
        break;
      case 'passengerWeight':
        setInputs({ crewWeight: toBaseUnit(n, unit ?? passengerWeightUnit) });
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
    fields: withUnits(voiceFields), options: voiceOptions, onCommitValue, onUnitChange, micEnabled,
  });

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
        <Text style={styles.headerTitle}>Chet Cal C</Text>
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

        {/* Reference graph selector — only the graphs that exist for this aircraft */}
        <View style={styles.tabRow}>
          {graphMetricsFor(selectedAircraftId).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.tabBtn, metric === m && styles.tabBtnActive]}
              onPress={() => setMetric(m)}
              testID={`tab-${m}`}
            >
              <Text style={[styles.tabText, metric === m && styles.tabTextActive]} numberOfLines={2}>
                {GRAPH_TITLES[m]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Input grid */}
        <View style={styles.grid}>
          <View style={styles.row}>
            <EditableCell
              label="Elevation" value={inputs.elevation} unit={elevationUnit} unitOptions={['ft', 'm']}
              onCommit={(v) => setInputs({ elevation: v })} onUnitChange={setElevationUnit}
              testID="cell-elevation"
            />
            <EditableCell
              label="QNH" value={inputs.qnh} unit={qnhUnit} unitOptions={['hPa', 'mmHg']}
              onCommit={(v) => setInputs({ qnh: v })} onUnitChange={setQnhUnit}
              testID="cell-qnh"
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              label="Temperature" value={inputs.temperature} unit={temperatureUnit} unitOptions={['C', 'F']}
              onCommit={(v) => setInputs({ temperature: v })} onUnitChange={setTemperatureUnit}
              testID="cell-temperature"
            />
            <ReadOnlyCell
              label="PA/Zp1" value={outputs.PA} unit={paUnit} unitOptions={['ft', 'm']}
              onUnitChange={setPaUnit} testID="cell-pa"
            />
          </View>
          <View style={styles.row}>
            <ReadOnlyCell
              label="DA/Zσ1" value={outputs.DENSITY_ALT} unit={daUnit} unitOptions={['ft', 'm']}
              onUnitChange={setDaUnit} testID="cell-da"
            />
            <ReadOnlyCell
              label="All up Weight" value={outputs.AUW} unit={auwUnit} unitOptions={['lb', 'kg']}
              onUnitChange={setAuwUnit} testID="cell-auw"
            />
          </View>
          <View style={styles.row}>
            <EditableCell
              label="Load" value={inputs.payload} unit={loadUnit} unitOptions={['kg', 'lb']}
              onCommit={(v) => setInputs({ payload: v })} onUnitChange={setLoadUnit}
              testID="cell-load"
            />
            <EditableCell
              label="Passenger Weight" required value={inputs.crewWeight} unit={passengerWeightUnit} unitOptions={['kg', 'lb']}
              onCommit={(v) => setInputs({ crewWeight: v })} onUnitChange={setPassengerWeightUnit}
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
              label="Fuel Weight" value={inputs.fuel} unit={fuelMassUnit} unitOptions={['kg', 'lb']}
              onUnitChange={setFuelMassUnit} testID="cell-fuel-mass"
            />
          </View>
          {metric === 'vmax' ? (
            <View style={styles.row}>
              <EditableCell
                label="Cruise Collective Pitch" value={inputs.cruisePower ?? outputs.COLLECTIVE_REQ} unit={null} unitOptions={null}
                onCommit={(v) => setInputs({ cruisePower: v })} onUnitChange={() => {}}
                testID="cell-cruise-power"
              />
              <ReadOnlyCell label="Max Collective Pitch" value={outputs.COLLECTIVE_AVAIL} testID="cell-max-power" />
            </View>
          ) : (
            <View style={styles.row}>
              <ReadOnlyCell label="Max Collective Pitch" value={outputs.COLLECTIVE_AVAIL} testID="cell-max-power" />
              <View style={styles.cell} />
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Reference graph (client 20-Nov-26: no dynamic graphs — flight-manual sheets only) */}
        <Text style={styles.graphTitle} testID="graph-title">
          {aircraft.name} — {GRAPH_TITLES[metric]} (reference)
        </Text>
        {getGraphSource(selectedAircraftId, metric) ? (
          <GraphViewer source={getGraphSource(selectedAircraftId, metric)} height={560} />
        ) : (
          <Text style={styles.noGraph}>No {GRAPH_TITLES[metric]} sheet for {aircraft.name}.</Text>
        )}
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
  micBtnActive: { backgroundColor: COLORS.success },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.md },
  badge: {
    width: 66, height: 66, borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryLight,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  badgeImg: { width: '100%', height: 32, borderRadius: RADIUS.sm - 2 },
  badgeLabel: { fontSize: 10, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  screenTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg },
  graphTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.md },
  noGraph: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  tabBtn: {
    flexGrow: 1, minWidth: '30%', paddingVertical: 10, paddingHorizontal: 6, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
  },
  tabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  tabTextActive: { color: '#fff' },

  infoBanner: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.primary, marginTop: SPACING.md,
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.primaryDark, fontWeight: '600', lineHeight: 18 },

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
  cellInput: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: '#525252', padding: 0 },
  cellInputStatic: { flex: 1, fontSize: 14, fontWeight: '600', color: '#525252' },
  cellSuffix: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },

  unitPill: { flexDirection: 'row', backgroundColor: COLORS.primaryLight, borderRadius: 4, padding: 2 },
  unitSeg: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 3 },
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
