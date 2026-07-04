import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import {
  ChevronLeft, Mountain, Thermometer, Fuel, Package, User, Gauge, Weight, Zap,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/theme/theme';
import { useAppState } from '../src/store/AppState';
import { fromBaseUnit, WIZARD_FIELDS } from '../src/config/logic';

const HELI_IMG = {
  chetak: 'https://images.unsplash.com/photo-1758292581042-21a187fbbdd4?crop=entropy&cs=srgb&fm=jpg&w=400&q=80',
  cheetah: 'https://images.unsplash.com/photo-1759610314761-855c55114110?crop=entropy&cs=srgb&fm=jpg&w=400&q=80',
  cheetal: 'https://images.pexels.com/photos/5620366/pexels-photo-5620366.jpeg?auto=compress&cs=tinysrgb&w=400',
};

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

export default function Review() {
  const router = useRouter();
  const {
    aircraftDefaults, selectedAircraftId, setSelectedAircraftId, inputs, units, outputs,
  } = useAppState();

  const editField = (step) => router.push({ pathname: '/wizard', params: { step } });

  const compute = () => {
    if (outputs.status === 'NOT_FIT') {
      Toast.show({ type: 'error', text1: 'Limit Exceeded', text2: outputs.reasons[0] || 'Check parameters', position: 'top' });
    } else {
      Toast.show({ type: 'success', text1: 'Within Limits', text2: 'Operational Status: Normal', position: 'top' });
    }
    router.push('/results');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="review-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="back-btn">
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <View style={styles.airframeRow}>
          {Object.keys(aircraftDefaults).map((id) => {
            const active = id === selectedAircraftId;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setSelectedAircraftId(id)}
                style={[styles.airframeCard, active && styles.airframeCardActive]}
                testID={`review-airframe-${id}`}
                activeOpacity={0.85}
              >
                <Image source={{ uri: HELI_IMG[id] }} style={styles.airframeImg} resizeMode="cover" />
                <Text style={[styles.airframeName, active && { color: COLORS.primaryDark }]}>
                  {aircraftDefaults[id].name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>Operational Inputs</Text>
        <Text style={styles.sectionSub}>Enter operating conditions to calculate aircraft limits.</Text>

        <View style={styles.inputList}>
          {WIZARD_FIELDS.map((field, i) => {
            const Icon = ICONS[field.key];
            const unit = units[field.unitKey];
            const raw = inputs[field.key];
            const disp = raw === null || raw === undefined ? '—' : Math.round(fromBaseUnit(raw, unit) * 100) / 100;
            return (
              <TouchableOpacity
                key={field.key}
                style={styles.inputItem}
                onPress={() => editField(i)}
                testID={`review-field-${field.key}`}
              >
                <Icon size={18} color={COLORS.primaryDark} />
                <Text style={styles.inputItemLabel}>{field.label}</Text>
                <Text style={styles.inputItemValue}>{disp} {unitLabel(unit)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>Live Preview</Text>
        <View style={styles.previewTop}>
          <View style={styles.previewTopCell}>
            <Text style={styles.previewTopK}>Pressure Altitude</Text>
            <Text style={styles.previewTopV}>{outputs.PA} ft</Text>
          </View>
          <View style={styles.previewTopCell}>
            <Text style={styles.previewTopK}>Density Altitude</Text>
            <Text style={styles.previewTopV}>{outputs.DENSITY_ALT} ft</Text>
          </View>
        </View>
        <View style={styles.previewGrid}>
          <PreviewCell k="ISA Temp" v={`${outputs.ISA_TEMP} °C`} />
          <PreviewCell k="Air Density" v={`${outputs.DENSITY} kg/m³`} />
          <PreviewCell k="AB Temp" v={`${outputs.AB_TEMP} °C`} />
          <PreviewCell k="All Up Weight" v={`${outputs.AUW} kg`} />
        </View>
        <View style={styles.powerRatioCard}>
          <Zap size={16} color={COLORS.primaryDark} />
          <Text style={styles.powerRatioLabel}>Power Balance</Text>
          <Text style={styles.powerRatioValue}>
            {outputs.POWER_BALANCE_PCT >= 0 ? '+' : ''}{outputs.POWER_BALANCE_PCT}%
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.computeBtn} onPress={compute} testID="compute-performance-btn" activeOpacity={0.9}>
          <Text style={styles.computeText}>Compute Performance</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function PreviewCell({ k, v }) {
  return (
    <View style={styles.previewCell}>
      <Text style={styles.previewK}>{k}</Text>
      <Text style={styles.previewV}>{v}</Text>
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
  headerTitle: { color: '#fff', fontWeight: '900', fontSize: 17, flex: 1, textAlign: 'center' },
  airframeRow: { flexDirection: 'row', gap: SPACING.sm },
  airframeCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.sm,
    borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', ...SHADOW,
  },
  airframeCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  airframeImg: { width: '100%', height: 56, borderRadius: 8, backgroundColor: COLORS.bg },
  airframeName: { marginTop: 6, fontWeight: '800', color: COLORS.text, fontSize: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text, letterSpacing: -0.3 },
  sectionSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: SPACING.sm },
  inputList: { gap: SPACING.xs },
  inputItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.card,
    borderRadius: RADIUS.md, padding: SPACING.md, ...SHADOW,
  },
  inputItemLabel: { flex: 1, fontWeight: '700', color: COLORS.text, fontSize: 13 },
  inputItemValue: { fontWeight: '800', color: COLORS.primaryDark, fontSize: 14 },
  previewTop: { flexDirection: 'row', gap: SPACING.sm },
  previewTopCell: {
    flex: 1, backgroundColor: COLORS.primaryLight, padding: SPACING.md, borderRadius: RADIUS.md,
  },
  previewTopK: { color: COLORS.primaryDark, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewTopV: { marginTop: 4, fontSize: 18, fontWeight: '900', color: COLORS.primaryDark },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  previewCell: {
    width: '48%', backgroundColor: COLORS.card, padding: SPACING.md,
    borderRadius: RADIUS.md, ...SHADOW,
  },
  previewK: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  previewV: { marginTop: 4, fontSize: 16, fontWeight: '800', color: COLORS.text },
  powerRatioCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, ...SHADOW,
  },
  powerRatioLabel: { flex: 1, fontWeight: '700', color: COLORS.text, fontSize: 13 },
  powerRatioValue: { fontWeight: '900', color: COLORS.text, fontSize: 16 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.lg, backgroundColor: 'rgba(245,247,251,0.95)',
  },
  computeBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: RADIUS.lg,
    alignItems: 'center', ...SHADOW,
  },
  computeText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
});
