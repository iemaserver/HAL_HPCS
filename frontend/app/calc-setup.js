/**
 * Calculation Setup — lets the client tune every formula and calculation value themselves.
 *
 * Fault tolerance (see logic.js):
 *   - A formula is validated before it can be applied (compiles, only documented variables,
 *     finite result). Invalid input is never saved.
 *   - A value outside its sanity range is never saved.
 *   - If a saved formula/value still fails at calculation time, the factory one is used and a
 *     notice is shown on the calculation screen — the app never shows a broken result.
 *   - Every item can be reset to factory; "Reset all" restores the whole setup.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  Menu, RotateCcw, CheckCircle2, AlertTriangle, ShieldCheck,
} from 'lucide-react-native';
import AppMenu from '../src/components/AppMenu';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import {
  DEFAULT_AIRCRAFT, DEFAULT_FORMULAS, FORMULA_META, CALC_VALUE_FIELDS, validateFormula,
  computeAutorotationRPM,
} from '../src/constants/logic';

const fmt = (n) => (Number.isFinite(Number(n)) ? String(Math.round(Number(n) * 1e6) / 1e6) : '');

// ── One numeric value ──
function ValueRow({ field, value, factory, onCommit, onReset }) {
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  const n = parseFloat(text);
  const invalid = text.trim() === '' || !Number.isFinite(n) || n < field.min || n > field.max;
  const changed = Number(value) !== Number(factory);

  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    if (invalid) { setText(fmt(value)); return; }
    if (n !== Number(value)) onCommit(n);
  };

  return (
    <View style={styles.valueRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.valueLabel}>
          {field.label}
          {changed ? <Text style={styles.changedTag}>  edited</Text> : null}
        </Text>
        <Text style={styles.hint}>{field.hint}</Text>
        {focused && invalid ? (
          <Text style={styles.errText}>Allowed range {field.min} – {field.max}</Text>
        ) : null}
      </View>
      <TextInput
        style={[styles.valueInput, focused && invalid && styles.inputInvalid]}
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="numeric"
        returnKeyType="done"
        selectTextOnFocus
        testID={`cs-value-${field.key}`}
      />
      <TouchableOpacity
        onPress={onReset}
        disabled={!changed}
        style={[styles.resetIcon, !changed && { opacity: 0.25 }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <RotateCcw size={15} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ── One formula ──
function FormulaCard({ meta, applied, onApply }) {
  const [text, setText] = useState(applied);
  const factory = DEFAULT_FORMULAS[meta.key];
  const result = validateFormula(meta.key, text);
  const dirty = text !== applied;
  const isCustom = applied !== factory;

  useEffect(() => { setText(applied); }, [applied]);

  return (
    <View style={styles.formulaCard} testID={`cs-formula-${meta.key}`}>
      <View style={styles.formulaHead}>
        <Text style={styles.valueLabel}>
          {meta.label}
          {isCustom ? <Text style={styles.changedTag}>  custom</Text> : null}
        </Text>
      </View>
      <Text style={styles.hint}>Variables: {meta.vars}</Text>
      <TextInput
        style={[styles.formulaInput, !result.ok && styles.inputInvalid]}
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        testID={`cs-formula-input-${meta.key}`}
      />
      {result.ok ? (
        <View style={styles.statusRow}>
          <CheckCircle2 size={13} color={COLORS.success} />
          <Text style={styles.okText}>Valid · sample result {fmt(result.sample)}</Text>
        </View>
      ) : (
        <View style={styles.statusRow}>
          <AlertTriangle size={13} color={COLORS.error} />
          <Text style={[styles.errText, { flex: 1 }]}>{result.error}</Text>
        </View>
      )}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, (!dirty || !result.ok) && { opacity: 0.4 }]}
          disabled={!dirty || !result.ok}
          onPress={() => onApply(text)}
          testID={`cs-apply-${meta.key}`}
        >
          <Text style={styles.btnPrimaryText}>Apply</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost, text === factory && { opacity: 0.4 }]}
          disabled={text === factory}
          onPress={() => { setText(factory); if (applied !== factory) onApply(factory); }}
        >
          <Text style={styles.btnGhostText}>Reset to factory</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CalcSetup() {
  const insets = useSafeAreaInsets();
  const {
    aircraftDefaults, selectedAircraftId, updateAircraftDefaults, formulas, updateFormulas,
    outputs, inputs,
  } = useAppState();
  const aircraft = aircraftDefaults[selectedAircraftId];
  const factory = DEFAULT_AIRCRAFT[selectedAircraftId];
  const [menuOpen, setMenuOpen] = useState(false);

  const toast = (text1, type = 'success') => Toast.show({ type, text1, position: 'top' });

  const patchAircraft = (patch) => updateAircraftDefaults({
    ...aircraftDefaults, [selectedAircraftId]: { ...aircraft, ...patch },
  });

  const applyFormula = async (key, expr) => {
    await updateFormulas({ ...formulas, [key]: expr });
    toast(expr === DEFAULT_FORMULAS[key] ? 'Formula reset to factory' : 'Formula applied');
  };

  const confirm = (title, msg, onYes) => Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: onYes },
  ]);

  const resetValues = () => confirm(
    `Reset ${aircraft.name} values?`, 'All values on this screen for this aircraft return to factory.',
    async () => {
      const patch = {};
      CALC_VALUE_FIELDS.forEach(({ key }) => { if (factory[key] !== undefined) patch[key] = factory[key]; });
      await patchAircraft(patch);
      toast('Values reset to factory');
    },
  );

  const resetFormulas = () => confirm(
    'Reset all formulas?', 'Every formula returns to its factory version (applies to all aircraft).',
    async () => { await updateFormulas({ ...DEFAULT_FORMULAS }); toast('Formulas reset to factory'); },
  );

  const groups = [...new Set(CALC_VALUE_FIELDS.map((f) => f.group))];
  const autoRpm = computeAutorotationRPM(aircraft, outputs.DENSITY_ALT, outputs.AUW, inputs.temperature ?? 15);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="calc-setup-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)} style={styles.headerBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Menu size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HAL HPS</Text>
        <View style={styles.headerBtn} />
      </View>
      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Calculation Setup</Text>
        <Text style={styles.sub}>{aircraft.name} values · formulas apply to all aircraft</Text>

        <View style={styles.safeBanner}>
          <ShieldCheck size={16} color={COLORS.primaryDark} style={{ marginTop: 1 }} />
          <Text style={styles.safeText}>
            Changes apply instantly. Invalid formulas and out-of-range values are rejected, and if
            anything fails during a calculation the factory version is used automatically — the app
            never shows a broken result. Every item can be reset to factory.
          </Text>
        </View>

        {/* Live preview */}
        <View style={styles.preview} testID="cs-preview">
          <Text style={styles.previewTitle}>LIVE RESULT (current inputs)</Text>
          <View style={styles.previewGrid}>
            <Prev k="Max collective" v={outputs.COLLECTIVE_AVAIL} />
            <Prev k="Hover required" v={outputs.COLLECTIVE_REQ} />
            {selectedAircraftId !== 'cheetal' ? <Prev k="JPT °C" v={outputs.JPT} /> : null}
            <Prev k="Auto RPM" v={autoRpm} />
          </View>
          <Text style={[styles.statusText, { color: outputs.status === 'FIT' ? COLORS.success : COLORS.error }]}>
            {outputs.status === 'FIT' ? 'FIT' : 'NOT FIT'}
          </Text>
          {outputs.warnings?.map((w, i) => (
            <Text key={i} style={styles.warnText}>• {w}</Text>
          ))}
        </View>

        <Text style={styles.sectionLabel}>VALUES — {aircraft.name.toUpperCase()}</Text>
        {groups.map((g) => (
          <View key={g} style={styles.groupCard}>
            <Text style={styles.groupTitle}>{g}</Text>
            {CALC_VALUE_FIELDS.filter((f) => f.group === g).map((f) => (
              <ValueRow
                key={`${selectedAircraftId}-${f.key}`}
                field={f}
                value={aircraft[f.key]}
                factory={factory[f.key]}
                onCommit={(v) => patchAircraft({ [f.key]: v })}
                onReset={() => patchAircraft({ [f.key]: factory[f.key] })}
              />
            ))}
          </View>
        ))}
        <TouchableOpacity style={[styles.btn, styles.btnGhost, styles.wide]} onPress={resetValues}>
          <Text style={styles.btnGhostText}>Reset {aircraft.name} values to factory</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>FORMULAS</Text>
        {FORMULA_META.map((m) => (
          <FormulaCard
            key={m.key}
            meta={m}
            applied={formulas[m.key] ?? DEFAULT_FORMULAS[m.key]}
            onApply={(expr) => applyFormula(m.key, expr)}
          />
        ))}
        <TouchableOpacity style={[styles.btn, styles.btnGhost, styles.wide]} onPress={resetFormulas}>
          <Text style={styles.btnGhostText}>Reset all formulas to factory</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Prev({ k, v }) {
  return (
    <View style={styles.prevCell}>
      <Text style={styles.prevK}>{k}</Text>
      <Text style={styles.prevV}>{fmt(v)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: 15 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginTop: SPACING.md },
  sub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },

  safeBanner: {
    flexDirection: 'row', gap: SPACING.sm, backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg,
  },
  safeText: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.primaryDark, fontWeight: '600' },

  preview: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.lg,
    marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW,
  },
  previewTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, color: COLORS.textMuted },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.sm, gap: SPACING.md },
  prevCell: { minWidth: '40%', flexGrow: 1 },
  prevK: { fontSize: 11.5, color: COLORS.textMuted, fontWeight: '600' },
  prevV: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  statusText: { fontSize: 12, fontWeight: '800', marginTop: SPACING.sm },
  warnText: { fontSize: 11.5, color: COLORS.warning, fontWeight: '600', marginTop: 4, lineHeight: 16 },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 1,
    marginTop: SPACING.xl, marginBottom: SPACING.md,
  },
  groupCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  groupTitle: { fontSize: 12, fontWeight: '800', color: COLORS.primaryDark, marginBottom: SPACING.sm },
  valueRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  valueLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  changedTag: { fontSize: 10.5, fontWeight: '800', color: COLORS.warning },
  hint: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, lineHeight: 15 },
  valueInput: {
    width: 84, height: 38, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, fontSize: 14, fontWeight: '700', color: '#3F3F3F',
    backgroundColor: COLORS.bg, textAlign: 'right',
  },
  inputInvalid: { borderColor: COLORS.error, backgroundColor: COLORS.errorBg },
  resetIcon: { padding: 4 },

  formulaCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  formulaHead: { flexDirection: 'row', justifyContent: 'space-between' },
  formulaInput: {
    marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    padding: SPACING.sm, fontSize: 12.5, color: COLORS.text, backgroundColor: COLORS.bg,
    minHeight: 56, textAlignVertical: 'top', fontFamily: 'monospace',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  okText: { fontSize: 11.5, color: COLORS.success, fontWeight: '700' },
  errText: { fontSize: 11.5, color: COLORS.error, fontWeight: '700', lineHeight: 16 },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  btn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: RADIUS.md,
  },
  wide: { marginTop: SPACING.sm, flex: 0, alignSelf: 'stretch' },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnGhost: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  btnGhostText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },
});
