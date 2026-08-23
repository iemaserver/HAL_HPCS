import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Menu, Mic, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import AppMenu from '../src/components/AppMenu';
import { fromBaseUnit, toBaseUnit, buildAltitudeTempTable } from '../src/constants/logic';

// Display labels — PPTX slide 7 explicitly spells these as "mb" / "mmHg", not the generic
// hPa/inHg codes the rest of the app uses internally (numerically identical: 1 hPa = 1 mb).
const UNIT_LABELS = { ft: 'ft', m: 'm', C: '°c', F: '°F', kg: 'Kg', lb: 'Lb', hPa: 'mb', inHg: 'mmHg' };
const fmtUnit = (u) => UNIT_LABELS[u] ?? u;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Segmented unit pill — mirrors performance-data.js's UnitPill ──
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

// ── Editable field cell ──
function EditableCell({
  label, required, value, unit, unitOptions, onCommit, onUnitChange, maxLength, testID,
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
          maxLength={maxLength}
          selectTextOnFocus
        />
        {unitOptions ? <UnitPill options={unitOptions} active={unit} onSelect={selectUnit} /> : null}
      </View>
    </View>
  );
}

// ── Read-only computed cell (ZP1-4 / T1-4) ──
function ReadOnlyCell({ label, value, unit, unitOptions, onUnitChange, testID }) {
  const display = unit ? round2(fromBaseUnit(value, unit)) : round2(value);
  return (
    <View style={styles.cell} testID={testID}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View style={styles.cellInputRow}>
        <Text style={styles.cellInputStatic}>{display}</Text>
        {unitOptions ? <UnitPill options={unitOptions} active={unit} onSelect={onUnitChange || (() => {})} /> : null}
      </View>
    </View>
  );
}

export default function DefaultSettings() {
  const router = useRouter();
  const {
    aircraftDefaults, selectedAircraftId, updateAircraftDefaults, units, setUnit, setInputs,
  } = useAppState();
  const insets = useSafeAreaInsets();
  const aircraft = aircraftDefaults[selectedAircraftId];

  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Screen-local unit toggles for fields that aren't part of the shared global `units` prefs
  // (ZP0/T0/Zσ default to the same ft/°C pattern as elevation/temperature but are logically
  // separate per-aircraft reference values, not live session inputs).
  const [zp0Unit, setZp0Unit] = useState('ft');
  const [t0Unit, setT0Unit] = useState('C');
  const [zSigmaUnit, setZSigmaUnit] = useState('ft');
  const [ageingUnit, setAgeingUnit] = useState('C');
  const [jptCorrUnit, setJptCorrUnit] = useState('C');
  // Weight-field units default per PPTX slide 7: "DEFAULT UNITS ... AC WEIGHT: Lb, PILOT WT: KG"
  // — deliberately mixed defaults, kept exactly as specified (not "fixed" to be consistent).
  const [basicWeightUnit, setBasicWeightUnit] = useState('lb');
  const [equipmentWeightUnit, setEquipmentWeightUnit] = useState('lb');
  const [pilotWeightUnit, setPilotWeightUnit] = useState('kg');
  const [copilotWeightUnit, setCopilotWeightUnit] = useState('lb');
  const [emptyWeightUnit, setEmptyWeightUnit] = useState('lb');

  const patchAircraft = (patch) => {
    updateAircraftDefaults({
      ...aircraftDefaults,
      [selectedAircraftId]: { ...aircraft, ...patch },
    });
  };

  // Elevation is two-way synced with Hover Power Calculation (client PPTX): editing it here
  // updates both the shared per-aircraft default AND the live session input.
  const commitElevation = (v) => {
    patchAircraft({ defaultElevation: v });
    setInputs({ elevation: v });
  };

  const emptyWeight = (Number(aircraft.basicWeight) || 0)
    + (Number(aircraft.equipmentWeight) || 0)
    + (Number(aircraft.pilotWeight) || 0)
    + (Number(aircraft.copilotWeight) || 0);

  const altTable = buildAltitudeTempTable(aircraft);

  const goAC = () => router.push('/airframe');
  const goCalc = () => router.push('/calculator');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="default-settings-screen">
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
          onPress={() => {}}
          style={styles.micBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="header-mic-btn"
        >
          <Mic size={18} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 32 + insets.bottom }}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.screenTitle}>Default Settings</Text>
            <Text style={styles.screenSub}>{aircraft.name}</Text>
          </View>
          <View style={styles.pager}>
            <TouchableOpacity
              onPress={() => setPage(1)}
              disabled={page === 1}
              style={[styles.pagerBtn, page === 1 ? styles.pagerBtnDisabled : styles.pagerBtnActive]}
              testID="page-prev-btn"
            >
              <ChevronLeft size={16} color={page === 1 ? COLORS.textMuted : '#fff'} />
            </TouchableOpacity>
            <Text style={styles.pagerText}>{`Page ${page}/2`}</Text>
            <TouchableOpacity
              onPress={() => setPage(2)}
              disabled={page === 2}
              style={[styles.pagerBtn, page === 2 ? styles.pagerBtnDisabled : styles.pagerBtnActive]}
              testID="page-next-btn"
            >
              <ChevronRight size={16} color={page === 2 ? COLORS.textMuted : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        {page === 1 ? (
          <View style={styles.grid}>
            <View style={styles.row}>
              <EditableCell
                required label="Elevation" value={aircraft.defaultElevation} unit={units.altitude}
                unitOptions={['ft', 'm']} onCommit={commitElevation}
                onUnitChange={(u) => setUnit('altitude', u)} maxLength={5} testID="ds-elevation"
              />
              <EditableCell
                required label="Basic Weight" value={aircraft.basicWeight} unit={basicWeightUnit}
                unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ basicWeight: v })}
                onUnitChange={setBasicWeightUnit} testID="ds-basic-weight"
              />
            </View>
            <View style={styles.row}>
              <EditableCell
                required label="Pilot Weight" value={aircraft.pilotWeight} unit={pilotWeightUnit}
                unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ pilotWeight: v })}
                onUnitChange={setPilotWeightUnit} testID="ds-pilot-weight"
              />
              <EditableCell
                required label="Copilot Weight" value={aircraft.copilotWeight} unit={copilotWeightUnit}
                unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ copilotWeight: v })}
                onUnitChange={setCopilotWeightUnit} testID="ds-copilot-weight"
              />
            </View>
            <View style={styles.row}>
              <EditableCell
                required label="Equipment Weight" value={aircraft.equipmentWeight} unit={equipmentWeightUnit}
                unitOptions={['lb', 'kg']} onCommit={(v) => patchAircraft({ equipmentWeight: v })}
                onUnitChange={setEquipmentWeightUnit} testID="ds-equipment-weight"
              />
              <ReadOnlyCell
                label="Empty Weight" value={emptyWeight} unit={emptyWeightUnit}
                unitOptions={['lb', 'kg']} onUnitChange={setEmptyWeightUnit} testID="ds-empty-weight"
              />
            </View>
            <View style={styles.row}>
              <EditableCell
                label="Ageing Coefficient" value={aircraft.ageingCoefficient} unit={ageingUnit}
                unitOptions={['C', 'F']} onCommit={(v) => patchAircraft({ ageingCoefficient: v })}
                onUnitChange={setAgeingUnit} testID="ds-ageing-coefficient"
              />
              <EditableCell
                label="JPT Correction" value={aircraft.jptCorrection} unit={jptCorrUnit}
                unitOptions={['C', 'F']} onCommit={(v) => patchAircraft({ jptCorrection: v })}
                onUnitChange={setJptCorrUnit} testID="ds-jpt-correction"
              />
            </View>
            <View style={styles.row}>
              <EditableCell
                required label="QNH" value={aircraft.defaultQNH} unit={units.pressure}
                unitOptions={['hPa', 'inHg']} onCommit={(v) => patchAircraft({ defaultQNH: v })}
                onUnitChange={(u) => setUnit('pressure', u)} maxLength={units.pressure === 'inHg' ? 3 : 4}
                testID="ds-qnh"
              />
              <EditableCell
                required label="Temperature" value={aircraft.defaultTemp} unit={units.temperature}
                unitOptions={['C', 'F']} onCommit={(v) => patchAircraft({ defaultTemp: v })}
                onUnitChange={(u) => setUnit('temperature', u)} maxLength={3} testID="ds-temperature"
              />
            </View>
            <View style={styles.row}>
              <EditableCell
                label="ZP0 (PA)" value={aircraft.zp0} unit={zp0Unit} unitOptions={['ft', 'm']}
                onCommit={(v) => patchAircraft({ zp0: v })} onUnitChange={setZp0Unit} testID="ds-zp0-preview"
              />
              <EditableCell
                label="T0 (Temp/OAT)" value={aircraft.t0} unit={t0Unit} unitOptions={['C', 'F']}
                onCommit={(v) => patchAircraft({ t0: v })} onUnitChange={setT0Unit} testID="ds-t0-preview"
              />
            </View>
            <View style={styles.row}>
              <ReadOnlyCell
                label={`ZP1 = ZP0 + 2000'`} value={altTable[0].zp} unit={zp0Unit}
                unitOptions={['ft', 'm']} onUnitChange={setZp0Unit} testID="ds-zp1-preview"
              />
              <ReadOnlyCell
                label="T1 = T0 - (2×1.98)" value={altTable[0].t} unit={t0Unit}
                unitOptions={['C', 'F']} onUnitChange={setT0Unit} testID="ds-t1-preview"
              />
            </View>
          </View>
        ) : (
          <View style={styles.grid}>
            <View style={styles.row}>
              <EditableCell
                label="ZP0 (PA)" value={aircraft.zp0} unit={zp0Unit} unitOptions={['ft', 'm']}
                onCommit={(v) => patchAircraft({ zp0: v })} onUnitChange={setZp0Unit} testID="ds-zp0"
              />
              <EditableCell
                label="T0 (Temp/OAT)" value={aircraft.t0} unit={t0Unit} unitOptions={['C', 'F']}
                onCommit={(v) => patchAircraft({ t0: v })} onUnitChange={setT0Unit} testID="ds-t0"
              />
            </View>
            {altTable.map((row) => (
              <View style={styles.row} key={row.n}>
                <ReadOnlyCell
                  label={`ZP${row.n} = ZP0 + ${row.n * 2000}'`} value={row.zp} unit={zp0Unit}
                  unitOptions={['ft', 'm']} onUnitChange={setZp0Unit} testID={`ds-zp${row.n}`}
                />
                <ReadOnlyCell
                  label={`T${row.n} = T0 - (${row.n * 2}×1.98)`} value={row.t} unit={t0Unit}
                  unitOptions={['C', 'F']} onUnitChange={setT0Unit} testID={`ds-t${row.n}`}
                />
              </View>
            ))}
            {[1, 2, 3, 4].map((n) => (
              <View style={styles.row} key={`zd-${n}`}>
                <EditableCell
                  label={`Zσ${n}`} value={aircraft[`zSigma${n}`]} unit={zSigmaUnit}
                  unitOptions={['ft', 'm']} onCommit={(v) => patchAircraft({ [`zSigma${n}`]: v })}
                  onUnitChange={setZSigmaUnit} testID={`ds-zsigma${n}`}
                />
                <EditableCell
                  label={`Dθ${n}`} value={aircraft[`dTheta${n}`]} unit={null} unitOptions={null}
                  onCommit={(v) => patchAircraft({ [`dTheta${n}`]: v })}
                  onUnitChange={() => {}} testID={`ds-dtheta${n}`}
                />
              </View>
            ))}
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={goAC} testID="ds-select-ac-btn">
            <Text style={styles.navBtnText}>Select AC</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={goCalc} testID="ds-hover-power-btn">
            <Text style={styles.navBtnText}>Hover Power Calculation</Text>
          </TouchableOpacity>
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

  titleRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  screenTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  screenSub: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },

  pager: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pagerBtn: {
    width: 26, height: 26, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
  },
  pagerBtnActive: { backgroundColor: COLORS.primary },
  pagerBtnDisabled: { backgroundColor: COLORS.border },
  pagerText: { fontSize: 12.5, color: COLORS.textMuted, fontWeight: '600' },

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

  unitPill: { flexDirection: 'row', backgroundColor: COLORS.primaryLight, borderRadius: 4, padding: 2 },
  unitSeg: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3 },
  unitSegActive: { backgroundColor: COLORS.primaryDark },
  unitSegText: { fontSize: 10, fontWeight: '600', color: COLORS.primaryDark },
  unitSegTextActive: { color: '#fff' },

  navRow: { flexDirection: 'row', gap: SPACING.md },
  navBtn: {
    flex: 1, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', ...SHADOW,
  },
  navBtnText: { color: '#fff', fontWeight: '600', fontSize: 14, textAlign: 'center', paddingHorizontal: 6 },
});
