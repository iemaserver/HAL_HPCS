import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { ChevronLeft, RotateCcw, Save as SaveIcon } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import { FORMULA_META, DEFAULT_AIRCRAFT, DEFAULT_FORMULAS, computePerformance } from '../src/constants/logic';
import { resetConfig } from '../src/services/database';

/**
 * Settings / Config Editor
 * ------------------------
 * This is the "central place" the user asked for — formulas and default values
 * are editable LIVE, persisted to SQLite, and take effect immediately (no
 * code changes or app restart required).
 */
export default function Settings() {
  const router = useRouter();
  const {
    aircraftDefaults, formulas, updateAircraftDefaults, updateFormulas,
  } = useAppState();
  const insets = useSafeAreaInsets();

  const [localAC, setLocalAC] = useState(aircraftDefaults);
  const [localF, setLocalF] = useState(formulas);

  useEffect(() => { setLocalAC(aircraftDefaults); }, [aircraftDefaults]);
  useEffect(() => { setLocalF(formulas); }, [formulas]);

  const save = async () => {
    // Validate formulas compile
    const invalid = [];
    for (const meta of FORMULA_META) {
      try {
        // eslint-disable-next-line no-new-func
        new Function('elevation', 'qnh', 'oat', 'ac_weight', 'crew', 'fuel', 'payload', 'add_load', 'mauw', 'rated_power', 'baseline_power_req', 'pa', 'isa', 'density_alt', 'auw', `return (${localF[meta.key]});`);
      } catch {
        invalid.push(meta.label);
      }
    }
    if (invalid.length) {
      Alert.alert('Invalid formula', invalid.join(', '));
      return;
    }
    // Quick sanity calc
    try {
      const ac = localAC.chetak;
      computePerformance({
        aircraft: ac, elevation: 0, qnh: 1013.25, temperature: 15,
        acWeight: ac.emptyWeight, crewWeight: 180, fuel: 200, additionalLoad: 0, payload: 300,
      }, localF);
    } catch (e) {
      Alert.alert('Formula error', String(e));
      return;
    }
    await updateAircraftDefaults(localAC);
    await updateFormulas(localF);
    Toast.show({ type: 'success', text1: 'Configuration saved', text2: 'Changes applied live', position: 'top' });
  };

  const reset = () => {
    Alert.alert('Reset to defaults?', 'All formula & default value overrides will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive', onPress: async () => {
          await resetConfig();
          await updateAircraftDefaults(DEFAULT_AIRCRAFT);
          await updateFormulas(DEFAULT_FORMULAS);
          Toast.show({ type: 'success', text1: 'Reset to defaults', position: 'top' });
        },
      },
    ]);
  };

  const setACField = (id, field, val) => {
    const num = parseFloat(val);
    setLocalAC((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: isNaN(num) ? val : num },
    }));
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="settings-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="back-btn">
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuration</Text>
        <TouchableOpacity onPress={reset} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="reset-config-btn">
          <RotateCcw size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionTitle}>Calculation Formulas</Text>
          <Text style={styles.sectionSub}>
            Edit any formula live — uses JavaScript expressions. Available variables shown below each field.
          </Text>

          {FORMULA_META.map((meta) => (
            <View key={meta.key} style={styles.card}>
              <Text style={styles.fLabel}>{meta.label}</Text>
              <Text style={styles.fKey}>{meta.key}</Text>
              <TextInput
                style={styles.fInput}
                value={localF[meta.key]}
                onChangeText={(v) => setLocalF((p) => ({ ...p, [meta.key]: v }))}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                testID={`formula-${meta.key}`}
              />
              <Text style={styles.fVars}>vars: {meta.vars}</Text>
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>Aircraft Default Values</Text>
          <Text style={styles.sectionSub}>
            Live-editable defaults per aircraft type (stored in SQLite).
          </Text>

          {Object.keys(localAC).map((id) => {
            const ac = localAC[id];
            return (
              <View key={id} style={styles.card}>
                <Text style={styles.acName}>{ac.name}</Text>
                <View style={styles.grid}>
                  <NumField label="Empty Weight (kg)" value={ac.emptyWeight} onChange={(v) => setACField(id, 'emptyWeight', v)} testID={`ac-${id}-empty`} />
                  <NumField label="MAUW (kg)" value={ac.mauw} onChange={(v) => setACField(id, 'mauw', v)} testID={`ac-${id}-mauw`} />
                  <NumField label="Rated Power (shp)" value={ac.ratedPowerSHP} onChange={(v) => setACField(id, 'ratedPowerSHP', v)} testID={`ac-${id}-rated`} />
                  <NumField label="Baseline Pwr Req (shp)" value={ac.baselinePowerReqSHP} onChange={(v) => setACField(id, 'baselinePowerReqSHP', v)} testID={`ac-${id}-basereq`} />
                  <NumField label="Default Crew (kg)" value={ac.defaultCrew} onChange={(v) => setACField(id, 'defaultCrew', v)} testID={`ac-${id}-crew`} />
                  <NumField label="Default Fuel (kg)" value={ac.defaultFuel} onChange={(v) => setACField(id, 'defaultFuel', v)} testID={`ac-${id}-fuel`} />
                  <NumField label="Default Payload (kg)" value={ac.defaultPayload} onChange={(v) => setACField(id, 'defaultPayload', v)} testID={`ac-${id}-payload`} />
                  <NumField label="Default Add Load (kg)" value={ac.defaultAddLoad} onChange={(v) => setACField(id, 'defaultAddLoad', v)} testID={`ac-${id}-addload`} />
                  <NumField label="Default Elevation (ft)" value={ac.defaultElevation} onChange={(v) => setACField(id, 'defaultElevation', v)} testID={`ac-${id}-elev`} />
                  <NumField label="Default QNH (hPa)" value={ac.defaultQNH} onChange={(v) => setACField(id, 'defaultQNH', v)} testID={`ac-${id}-qnh`} />
                  <NumField label="Default Temp (°C)" value={ac.defaultTemp} onChange={(v) => setACField(id, 'defaultTemp', v)} testID={`ac-${id}-temp`} />
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: SPACING.lg + insets.bottom }]}>
          <TouchableOpacity style={styles.saveBtn} onPress={save} testID="settings-save-btn">
            <SaveIcon size={18} color="#fff" />
            <Text style={styles.saveText}>Save Configuration</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NumField({ label, value, onChange, testID }) {
  return (
    <View style={styles.numWrap}>
      <Text style={styles.numLabel}>{label}</Text>
      <TextInput
        style={styles.numInput}
        value={String(value)}
        onChangeText={onChange}
        keyboardType="numeric"
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md, backgroundColor: COLORS.primary,
    gap: SPACING.sm, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontWeight: '900', fontSize: 17, flex: 1 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, letterSpacing: -0.3 },
  sectionSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.md, ...SHADOW,
  },
  fLabel: { fontWeight: '800', color: COLORS.text, fontSize: 14 },
  fKey: { fontSize: 11, fontWeight: '700', color: COLORS.primaryDark, marginTop: 2, letterSpacing: 1 },
  fInput: {
    marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, padding: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12, color: COLORS.text, backgroundColor: COLORS.bg, minHeight: 54,
  },
  fVars: { marginTop: 4, fontSize: 10, color: COLORS.textMuted },
  acName: { fontWeight: '900', color: COLORS.text, fontSize: 16, marginBottom: SPACING.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  numWrap: { width: '48%' },
  numLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  numInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    padding: 10, color: COLORS.text, backgroundColor: COLORS.bg, fontWeight: '700',
  },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.lg, backgroundColor: 'rgba(245,247,251,0.95)',
  },
  saveBtn: {
    backgroundColor: COLORS.primary, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 8, paddingVertical: 16, borderRadius: RADIUS.lg, ...SHADOW,
  },
  saveText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
