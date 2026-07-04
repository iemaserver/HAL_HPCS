import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, KeyboardAvoidingView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft, ChevronRight, Mountain, Thermometer, Fuel, Package, User, Gauge, Weight, Mic,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/theme/theme';
import { useAppState } from '../src/store/AppState';
import { fromBaseUnit, toBaseUnit, WIZARD_FIELDS } from '../src/config/logic';

const ICONS = {
  elevation: Mountain,
  qnh: Gauge,
  temperature: Thermometer,
  acWeight: Weight,
  crewWeight: User,
  fuel: Fuel,
  additionalLoad: Package,
  payload: Package,
};

const unitLabel = (u) => (u === 'C' ? '°C' : u === 'F' ? '°F' : u);

export default function Wizard() {
  const router = useRouter();
  const { step: stepParam } = useLocalSearchParams();
  const { inputs, setInputs, units, setUnit } = useAppState();
  const initialStep = (() => {
    const n = parseInt(stepParam, 10);
    return Number.isInteger(n) && n >= 0 && n < WIZARD_FIELDS.length ? n : 0;
  })();
  const editMode = stepParam !== undefined;
  const [step, setStep] = useState(initialStep);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);

  const field = WIZARD_FIELDS[step];
  const Icon = ICONS[field.key];
  const displayUnit = units[field.unitKey];
  const isLast = step === WIZARD_FIELDS.length - 1;

  useEffect(() => {
    const raw = inputs[field.key];
    const n = raw === null || raw === undefined ? '' : fromBaseUnit(raw, displayUnit);
    setValue(n === '' ? '' : String(Math.round(n * 100) / 100));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const press = (k) => {
    if (k === 'back') { setValue((v) => v.slice(0, -1)); return; }
    if (k === 'clear') { setValue(''); return; }
    if (k === '.' && value.includes('.')) return;
    setValue((v) => v + k);
  };

  const commitAndGo = (delta) => {
    const num = parseFloat(value);
    if (value.trim() === '' || isNaN(num)) {
      setError(`Please enter a value for ${field.label}.`);
      return;
    }
    const base = toBaseUnit(num, displayUnit);
    if (base < field.min || base > field.max) {
      const dispMin = Math.round(fromBaseUnit(field.min, displayUnit) * 100) / 100;
      const dispMax = Math.round(fromBaseUnit(field.max, displayUnit) * 100) / 100;
      setError(`Invalid ${field.label.toLowerCase()} value. Please enter value between ${dispMin} and ${dispMax}${unitLabel(displayUnit)}.`);
      return;
    }
    setInputs({ [field.key]: base });
    setError('');
    if (editMode) {
      router.back();
      return;
    }
    if (delta > 0 && isLast) {
      router.push('/review');
    } else {
      setStep((s) => s + delta);
    }
  };

  const onPrevious = () => {
    if (step === 0) { router.back(); return; }
    setStep((s) => s - 1);
  };

  const startVoice = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { setError('Voice recognition not available on this browser.'); return; }
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = (e) => { setListening(false); setError(e.error || 'Voice error'); };
      rec.onresult = (e) => {
        const result = e.results[0][0].transcript;
        const m = result.match(/-?\d+(\.\d+)?/);
        if (m) { setValue(m[0]); setError(''); }
      };
      try { rec.start(); } catch (err) { setError(String(err)); }
    } else {
      setError('Offline voice requires a dev build with expo-speech-recognition. Please use the keypad.');
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="wizard-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{editMode ? `Edit ${field.label}` : 'Operational Inputs'}</Text>
        {!editMode && <Text style={styles.headerStep}>{step + 1} / {WIZARD_FIELDS.length}</Text>}
      </View>
      {!editMode && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / WIZARD_FIELDS.length) * 100}%` }]} />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ padding: SPACING.lg, flex: 1 }}>
          <Text style={styles.sectionSub}>Enter operating conditions to calculate aircraft limits.</Text>

          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <View style={styles.unitToggle}>
              {field.unitOptions.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitPill, displayUnit === u && styles.unitPillActive]}
                  onPress={() => setUnit(field.unitKey, u)}
                  testID={`wizard-unit-${u}`}
                >
                  <Text style={[styles.unitPillText, displayUnit === u && { color: '#fff' }]}>{unitLabel(u)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.inputRow, error && styles.inputRowError]}>
            <Icon size={20} color={error ? COLORS.error : COLORS.primaryDark} />
            <TextInput
              style={styles.inputValue}
              value={value}
              onChangeText={(t) => { setValue(t); setError(''); }}
              placeholder={`Enter ${field.label.toLowerCase()}`}
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              showSoftInputOnFocus={false}
              testID={`wizard-input-${field.key}`}
            />
            <Text style={styles.inputUnit}>{unitLabel(displayUnit)}</Text>
          </View>
          {!!error && <Text style={styles.errorText} testID="wizard-error">{error}</Text>}

          <View style={styles.micWrap}>
            <TouchableOpacity
              style={[styles.micBtn, listening && styles.micBtnActive, error && styles.micBtnError]}
              onPress={startVoice}
              testID="wizard-mic-btn"
              activeOpacity={0.85}
            >
              <Mic size={36} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.micHint}>{listening ? 'Listening…' : 'Tap to dictate value'}</Text>
          </View>

          <Numpad value={value} onPress={press} />
        </View>

        <View style={styles.footer}>
          {editMode ? (
            <TouchableOpacity style={[styles.nextBtn, { flex: 1 }]} onPress={() => commitAndGo(1)} testID="wizard-save-btn">
              <Text style={styles.nextText}>Save</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.prevBtn} onPress={onPrevious} testID="wizard-prev-btn">
                <ChevronLeft size={18} color={COLORS.text} />
                <Text style={styles.prevText}>Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={() => commitAndGo(1)} testID="wizard-next-btn">
                <Text style={styles.nextText}>{isLast ? 'Review' : 'Next'}</Text>
                <ChevronRight size={18} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Numpad({ value, onPress }) {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'back'],
  ];
  return (
    <View style={styles.numpad}>
      {rows.map((row, i) => (
        <View key={i} style={styles.numpadRow}>
          {row.map((k) => (
            <TouchableOpacity
              key={k}
              style={styles.key}
              onPress={() => onPress(k)}
              testID={`wizard-numpad-${k}`}
            >
              <Text style={styles.keyText}>{k === 'back' ? '⌫' : k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, backgroundColor: COLORS.card,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, letterSpacing: -0.3 },
  headerStep: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },
  progressTrack: { height: 4, backgroundColor: COLORS.border, marginTop: SPACING.sm },
  progressFill: { height: 4, backgroundColor: COLORS.primary },
  sectionSub: { color: COLORS.textMuted, fontSize: 13, marginTop: SPACING.sm, marginBottom: SPACING.lg },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { fontWeight: '800', color: COLORS.text, fontSize: 15 },
  unitToggle: {
    flexDirection: 'row', backgroundColor: COLORS.bg, borderRadius: 999, padding: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  unitPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  unitPillActive: { backgroundColor: COLORS.primary },
  unitPillText: { color: COLORS.textMuted, fontWeight: '800', fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.md, ...SHADOW,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputRowError: { borderColor: COLORS.error, borderWidth: 1.5 },
  inputValue: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.text, padding: 0 },
  inputUnit: { color: COLORS.textMuted, fontWeight: '700' },
  errorText: { color: COLORS.error, fontSize: 12, fontWeight: '600', marginTop: 6 },
  micWrap: { alignItems: 'center', marginTop: SPACING.lg },
  micBtn: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', ...SHADOW,
  },
  micBtnActive: { backgroundColor: COLORS.primaryDark },
  micBtnError: { backgroundColor: COLORS.error },
  micHint: { marginTop: SPACING.sm, color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  numpad: { marginTop: SPACING.lg },
  numpadRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.sm },
  key: {
    flex: 1, maxWidth: 90, height: 50, marginHorizontal: 6, borderRadius: RADIUS.md,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  keyText: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  footer: {
    flexDirection: 'row', gap: SPACING.sm, padding: SPACING.lg,
    backgroundColor: 'rgba(245,247,251,0.95)',
  },
  prevBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    paddingVertical: 16, borderRadius: RADIUS.lg, backgroundColor: '#fff',
    borderWidth: 1, borderColor: COLORS.border,
  },
  prevText: { color: COLORS.text, fontWeight: '800' },
  nextBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    paddingVertical: 16, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, ...SHADOW,
  },
  nextText: { color: '#fff', fontWeight: '900' },
});
