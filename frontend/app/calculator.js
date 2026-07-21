import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import {
  ChevronLeft, CheckCircle2, AlertTriangle, Save, Share2, FolderClock, RotateCcw, Mic,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import { WIZARD_FIELDS, fromBaseUnit, toBaseUnit } from '../src/constants/logic';
import {
  ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, nativeSpeechAvailable,
} from '../src/utils/speech';
import { insertReport, getDeviceId } from '../src/services/database';
import { generateAndSharePdf } from '../src/utils/pdf';

const pad = (n) => String(n).padStart(2, '0');
const fmtUnit = (u) => (u === 'C' ? '°C' : u === 'F' ? '°F' : u);

// ── InputRow ─────────────────────────────────────────────────────────────────
function InputRow({ field, value, unit, onCommit, onUnitChange, isLast, onVoice, isListening, voiceValue }) {
  const derive = (v, u) =>
    v !== null && v !== undefined
      ? String(Math.round(fromBaseUnit(v, u) * 100) / 100)
      : '';

  const [local, setLocal] = useState(() => derive(value, unit));
  const [focused, setFocused] = useState(false);

  // Sync display when parent pushes a new value (reset, aircraft change)
  useEffect(() => {
    if (!focused) setLocal(derive(value, unit));
  }, [value, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Voice result: update display immediately and independently of AppState re-render
  useEffect(() => {
    if (voiceValue !== null && voiceValue !== undefined) {
      setLocal(String(Math.round(fromBaseUnit(voiceValue, unit) * 100) / 100));
    }
  }, [voiceValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setFocused(false);
    const n = parseFloat(local);
    if (!isNaN(n)) onCommit(toBaseUnit(n, unit));
  };

  const cycleUnit = () => {
    const n = parseFloat(local);
    if (!isNaN(n)) onCommit(toBaseUnit(n, unit));
    const idx = field.unitOptions.indexOf(unit);
    onUnitChange(field.unitOptions[(idx + 1) % field.unitOptions.length]);
  };

  return (
    <View style={[styles.inputRow, !isLast && styles.inputRowBorder]}>
      <Text style={styles.inputLabel}>{field.label}</Text>
      <TextInput
        style={styles.inputField}
        value={local}
        onChangeText={setLocal}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="numeric"
        returnKeyType="done"
        selectTextOnFocus
      />
      <TouchableOpacity onPress={cycleUnit} style={styles.unitBtn}>
        <Text style={styles.unitText}>{fmtUnit(unit)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onVoice}
        style={[styles.micBtn, isListening && styles.micBtnActive]}
      >
        <Mic size={15} color={isListening ? '#fff' : COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ── OutRow ────────────────────────────────────────────────────────────────────
function OutRow({ label, value, unit, warn, good, isLast }) {
  const valColor = warn ? COLORS.error : good ? COLORS.success : COLORS.text;
  return (
    <View style={[styles.outRow, isLast && styles.outRowLast]}>
      <Text style={styles.outLabel}>{label}</Text>
      <View style={styles.outValRow}>
        <Text style={[styles.outValue, { color: valColor }]}>{value}</Text>
        {unit ? <Text style={styles.outUnit}> {unit}</Text> : null}
      </View>
    </View>
  );
}

// ── Calculator ────────────────────────────────────────────────────────────────
export default function Calculator() {
  const router = useRouter();
  const { aircraftDefaults, selectedAircraftId, inputs, setInputs, units, setUnit, outputs } = useAppState();
  const insets = useSafeAreaInsets();
  const aircraft = aircraftDefaults[selectedAircraftId];
  const isFit = outputs.status === 'FIT';

  const [saveOpen, setSaveOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  // ref avoids stale closures in speech event handlers (state would capture the initial null)
  const activeVoiceFieldRef = useRef(null);
  const [listeningField, setListeningField] = useState(null);
  // voiceResult pushes the recognised value directly into the target InputRow's display
  const [voiceResult, setVoiceResult] = useState(null); // { fieldKey, baseValue }

  // Speech recognition events — must be called unconditionally (rules of hooks)
  useSpeechRecognitionEvent('start', () => {});
  useSpeechRecognitionEvent('end', () => {
    activeVoiceFieldRef.current = null;
    setListeningField(null);
  });
  useSpeechRecognitionEvent('error', (e) => {
    activeVoiceFieldRef.current = null;
    setListeningField(null);
    Toast.show({ type: 'error', text1: 'Voice error', text2: e.message || 'Recognition failed', position: 'top' });
  });
  useSpeechRecognitionEvent('result', (e) => {
    const transcript = e.results?.[0]?.transcript ?? '';
    const m = transcript.match(/-?\d+(\.\d+)?/);
    const fieldKey = activeVoiceFieldRef.current;
    if (m && fieldKey) {
      const f = WIZARD_FIELDS.find((x) => x.key === fieldKey);
      if (f) {
        const baseValue = toBaseUnit(parseFloat(m[0]), units[f.unitKey]);
        setInputs({ [fieldKey]: baseValue });           // update AppState (outputs)
        setVoiceResult({ fieldKey, baseValue });        // update InputRow display
      }
    }
  });

  const startVoice = async (fieldKey) => {
    if (!nativeSpeechAvailable) {
      Toast.show({ type: 'info', text1: 'Voice requires a dev build', text2: 'Use the keypad instead', position: 'top' });
      return;
    }
    const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Microphone permission denied', text2: 'Enable it in device Settings', position: 'top' });
      return;
    }
    activeVoiceFieldRef.current = fieldKey;
    setListeningField(fieldKey);
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', continuous: false, interimResults: false });
  };

  // Pre-fill any null inputs with aircraft defaults when aircraft changes or on mount
  useEffect(() => {
    const fill = {};
    if (inputs.elevation == null) fill.elevation = aircraft.defaultElevation;
    if (inputs.qnh == null) fill.qnh = aircraft.defaultQNH;
    if (inputs.temperature == null) fill.temperature = aircraft.defaultTemp;
    if (inputs.acWeight == null) fill.acWeight = aircraft.emptyWeight;
    if (inputs.crewWeight == null) fill.crewWeight = aircraft.defaultCrew;
    if (inputs.fuel == null) fill.fuel = aircraft.defaultFuel;
    if (inputs.additionalLoad == null) fill.additionalLoad = aircraft.defaultAddLoad;
    if (inputs.payload == null) fill.payload = aircraft.defaultPayload;
    if (Object.keys(fill).length > 0) setInputs(fill);
  }, [selectedAircraftId]); // eslint-disable-line react-hooks/exhaustive-deps

  const doReset = () => {
    setInputs({
      elevation: aircraft.defaultElevation,
      qnh: aircraft.defaultQNH,
      temperature: aircraft.defaultTemp,
      acWeight: aircraft.emptyWeight,
      crewWeight: aircraft.defaultCrew,
      fuel: aircraft.defaultFuel,
      additionalLoad: aircraft.defaultAddLoad,
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

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.hBtn}>
          <ChevronLeft size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.hTitle} numberOfLines={1}>{aircraft.name} — Hover Power</Text>
        <View style={[styles.fitBadge, { backgroundColor: isFit ? COLORS.success : COLORS.error }]}>
          {isFit
            ? <CheckCircle2 size={13} color="#fff" />
            : <AlertTriangle size={13} color="#fff" />}
          <Text style={styles.fitText}>{isFit ? 'FIT' : 'NOT FIT'}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/reports')} style={styles.hBtn}>
          <FolderClock size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* NOT FIT reasons */}
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

        {/* ── INPUTS ── */}
        <Text style={styles.sectionLabel}>INPUTS</Text>
        <View style={styles.card}>
          {WIZARD_FIELDS.map((field, i) => (
            <InputRow
              key={field.key}
              field={field}
              value={inputs[field.key]}
              unit={units[field.unitKey]}
              onCommit={(v) => setInputs({ [field.key]: v })}
              onUnitChange={(u) => setUnit(field.unitKey, u)}
              isLast={i === WIZARD_FIELDS.length - 1}
              onVoice={() => startVoice(field.key)}
              isListening={listeningField === field.key}
              voiceValue={voiceResult?.fieldKey === field.key ? voiceResult.baseValue : null}
            />
          ))}
        </View>

        {/* ── OUTPUTS ── */}
        <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>COMPUTED OUTPUTS</Text>
        <View style={styles.card}>
          <OutRow label="Pressure Altitude"  value={outputs.PA}           unit="ft"    />
          <OutRow label="ISA Temperature"    value={outputs.ISA_TEMP}      unit="°C"    />
          <OutRow label="Density Altitude"   value={outputs.DENSITY_ALT}   unit="ft"    warn={outputs.DENSITY_ALT > 18000} />
          <OutRow label="All Up Weight"      value={outputs.AUW}            unit="kg"    warn={outputs.AUW > aircraft.mauw} />
          <OutRow label="AUW Margin"         value={outputs.AUW_MARGIN}     unit="kg"    warn={outputs.AUW_MARGIN < 0} good={outputs.AUW_MARGIN >= 0} />
          <OutRow label="Collective Avail"   value={outputs.COLLECTIVE_AVAIL}    unit="°"  />
          <OutRow label="Collective Req"     value={outputs.COLLECTIVE_REQ}      unit="°"  />
          <OutRow
            label="Collective Headroom"
            value={outputs.COLLECTIVE_BALANCE !== undefined ? `${outputs.COLLECTIVE_BALANCE >= 0 ? '+' : ''}${outputs.COLLECTIVE_BALANCE}°` : '—'}
            warn={outputs.COLLECTIVE_BALANCE < 0}
            good={outputs.COLLECTIVE_BALANCE >= 0}
          />
          <OutRow label="Payload Margin"     value={outputs.PAYLOAD_MARGIN} unit="kg"    />
          <OutRow
            label="JPT"
            value={outputs.JPT ?? '—'}
            unit="°C"
            warn={outputs.JPT > (aircraft.jptMax ?? 870)}
          />
          <OutRow
            label="Above ISA"
            value={outputs.AB_TEMP}
            unit="°C"
            warn={outputs.AB_TEMP > 35}
            isLast
          />
        </View>

        {/* ── ACTIONS ── */}
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
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  hBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  hTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.text },
  fitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5,
  },
  fitText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    letterSpacing: 1, marginBottom: SPACING.sm,
  },

  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOW,
  },

  // Input rows
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, minHeight: 48,
  },
  inputRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  inputLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  inputField: {
    width: 80, textAlign: 'right', fontSize: 15, fontWeight: '700',
    color: COLORS.primaryDark, borderBottomWidth: 1.5, borderBottomColor: COLORS.primary,
    paddingVertical: 4, marginRight: SPACING.sm,
  },
  unitBtn: {
    minWidth: 46, paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  unitText: { fontSize: 12, fontWeight: '700', color: COLORS.primaryDark },
  micBtn: {
    width: 30, height: 30, borderRadius: 15, marginLeft: SPACING.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
  },
  micBtnActive: { backgroundColor: COLORS.error, borderColor: COLORS.error },

  // Output rows
  outRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  outRowLast: { borderBottomWidth: 0 },
  outLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.textMuted },
  outValRow: { flexDirection: 'row', alignItems: 'baseline' },
  outValue: { fontSize: 15, fontWeight: '800' },
  outUnit: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },

  // Warning banner
  warnBanner: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
    backgroundColor: COLORS.errorBg, borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.error, marginBottom: SPACING.md,
  },
  warnText: { fontSize: 12, color: COLORS.error, fontWeight: '600', lineHeight: 18 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
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
