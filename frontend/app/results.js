import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import {
  ChevronLeft, CheckCircle2, AlertTriangle, Scale, Package, Zap, Dumbbell,
  RefreshCw, Save, Share2, FolderClock, BarChart3, TableProperties,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import { buildAUWvsAltitudeCurve } from '../src/constants/logic';
import AUWChart from '../src/components/AUWChart';
import { insertReport, getDeviceId } from '../src/services/database';
import { generateAndSharePdf } from '../src/utils/pdf';

export default function Results() {
  const router = useRouter();
  const { aircraftDefaults, selectedAircraftId, inputs, outputs, formulas, units, resetInputsToDefaults } = useAppState();
  const insets = useSafeAreaInsets();
  const aircraft = aircraftDefaults[selectedAircraftId];
  const { width } = useWindowDimensions();

  const [view, setView] = useState('graph');
  const [saveOpen, setSaveOpen] = useState(false);
  const [reportName, setReportName] = useState('');

  const isFit = outputs.status === 'FIT';

  const curve = useMemo(
    () => buildAUWvsAltitudeCurve(aircraft, formulas),
    [aircraft, formulas]
  );

  const currentPoint = useMemo(
    () => ({ x: Math.max(0, Math.min(20, outputs.PA / 1000)), y: outputs.AUW }),
    [outputs]
  );

  const openSave = async () => {
    try {
      const deviceId = await getDeviceId();
      const now = new Date();
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      setReportName(`${deviceId}_${stamp}`);
      setSaveOpen(true);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Could not open Save Report', text2: String(e?.message || e), position: 'top' });
    }
  };

  const buildReport = (name) => ({
    id: name,
    name,
    created_at: new Date().toISOString(),
    aircraft_id: aircraft.id,
    payload: { aircraft, inputs, outputs, units, formulas },
  });

  const doSave = async () => {
    if (!reportName.trim()) {
      Alert.alert('Name required', 'Please enter a name for the report');
      return;
    }
    const r = buildReport(reportName.trim());
    try {
      await insertReport(r);
      setSaveOpen(false);
      Toast.show({ type: 'success', text1: 'Report Saved', text2: reportName.trim(), position: 'top' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Save failed', text2: String(e?.message || e), position: 'top' });
    }
  };

  const doShare = async () => {
    try {
      const deviceId = await getDeviceId();
      const now = new Date();
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const name = reportName.trim() || `${deviceId}_${stamp}`;
      // Share does NOT auto-save — only generates & shares the PDF.
      await generateAndSharePdf({
        name,
        created_at: new Date().toISOString(),
        aircraft,
        inputs,
        outputs,
        units,
        formulas,
      });
      Toast.show({ type: 'success', text1: 'PDF ready', text2: 'Share sheet opened', position: 'top' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'PDF failed', text2: String(e?.message || e), position: 'top' });
    }
  };

  const chartWidth = Math.min(width - SPACING.xl * 2, 420);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="results-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="back-btn">
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Performance Results</Text>
        <TouchableOpacity onPress={() => router.push('/reports')} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="reports-btn">
          <FolderClock size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 + insets.bottom }}>
        {/* Summary strip */}
        <View style={styles.summaryStrip}>
          <SumCell label="Aircraft" value={aircraft.name} testID="sum-aircraft" />
          <View style={styles.sep} />
          <SumCell label="Temp" value={`${inputs.temperature}°C`} testID="sum-temp" />
          <View style={styles.sep} />
          <SumCell label="Altitude" value={`${outputs.PA.toLocaleString()} ft`} testID="sum-alt" />
        </View>

        {/* Status banner */}
        <View
          style={[styles.banner, isFit ? styles.bannerOk : styles.bannerBad]}
          testID={`status-banner-${isFit ? 'fit' : 'notfit'}`}
        >
          <View style={[styles.bannerIcon, { backgroundColor: isFit ? COLORS.success : COLORS.error }]}>
            {isFit ? <CheckCircle2 size={26} color="#fff" /> : <AlertTriangle size={26} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: isFit ? COLORS.success : COLORS.error }]}>
              {isFit ? 'Within Limits' : 'Limit Exceeded'}
            </Text>
            <Text style={styles.bannerSub}>
              {isFit ? 'Operational Status: Normal' : (outputs.reasons[0] || 'Aircraft exceeds allowable limits.')}
            </Text>
            {!isFit && outputs.reasons.slice(1).map((r, i) => (
              <Text key={i} style={styles.bannerSub}>• {r}</Text>
            ))}
          </View>
        </View>

        {/* Metric cards */}
        <View style={styles.metricGrid}>
          <Metric
            Icon={Scale} label="AUW Capability" value={aircraft.mauw.toLocaleString()} unit="kg"
            color={COLORS.text} testID="metric-auw-cap"
          />
          <Metric
            Icon={Package} label="Payload" value={`${Math.round((inputs.payload / outputs.AUW) * 1000) / 10}`} unit="%"
            color={COLORS.text} testID="metric-payload-pct"
          />
          <Metric
            Icon={Zap} label="Power Balance"
            value={`${outputs.POWER_BALANCE_PCT >= 0 ? '+' : ''}${outputs.POWER_BALANCE_PCT}`}
            unit="%"
            color={outputs.POWER_BALANCE_PCT >= 0 ? COLORS.success : COLORS.error}
            testID="metric-power-balance"
          />
          <Metric
            Icon={Dumbbell} label="Payload Margin" value={`${outputs.PAYLOAD_MARGIN}`} unit="kg"
            color={COLORS.text} testID="metric-payload-margin"
          />
        </View>

        {/* Graph / Table toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'graph' && styles.toggleBtnActive]}
            onPress={() => setView('graph')}
            testID="toggle-graph"
          >
            <BarChart3 size={16} color={view === 'graph' ? '#fff' : COLORS.text} />
            <Text style={[styles.toggleText, view === 'graph' && { color: '#fff' }]}>Graph</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'table' && styles.toggleBtnActive]}
            onPress={() => setView('table')}
            testID="toggle-table"
          >
            <TableProperties size={16} color={view === 'table' ? '#fff' : COLORS.text} />
            <Text style={[styles.toggleText, view === 'table' && { color: '#fff' }]}>Table</Text>
          </TouchableOpacity>
        </View>

        {/* Chart / Table */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>AUW VS ALTITUDE</Text>
          {view === 'graph' ? (
            <AUWChart width={chartWidth} height={220} points={curve} current={currentPoint} />
          ) : (
            <View style={{ marginTop: 8 }}>
              <View style={styles.tblHeader}>
                <Text style={styles.tblHeadCell}>Alt (kft)</Text>
                <Text style={styles.tblHeadCell}>Max AUW (kg)</Text>
              </View>
              {curve.filter((_, i) => i % 2 === 0).map((p) => (
                <View key={p.x} style={styles.tblRow}>
                  <Text style={styles.tblCell}>{p.x}</Text>
                  <Text style={styles.tblCell}>{p.y}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Detail grid — all 8 outputs */}
        <Text style={[styles.sectionTitle, { marginTop: SPACING.lg }]}>All Calculations</Text>
        <View style={styles.detailGrid}>
          <DetailCell k="Pressure Altitude" v={`${outputs.PA} ft`} />
          <DetailCell k="ISA Temperature" v={`${outputs.ISA_TEMP} °C`} />
          <DetailCell k="Density Altitude" v={`${outputs.DENSITY_ALT} ft`} />
          <DetailCell k="Air Density" v={`${outputs.DENSITY} kg/m³`} />
          <DetailCell k="AB Temperature" v={`${outputs.AB_TEMP} °C`} />
          <DetailCell k="All Up Weight" v={`${outputs.AUW} kg`} />
          <DetailCell k="Power Available" v={`${outputs.POWER_AVAIL} shp`} />
          <DetailCell k="Power Required" v={`${outputs.POWER_REQ} shp`} />
        </View>

        {/* Save / Share row */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionOutline]} onPress={openSave} testID="save-report-btn">
            <Save size={18} color={COLORS.primaryDark} />
            <Text style={styles.actionTextOutline}>Save Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionOutline]} onPress={doShare} testID="share-report-btn">
            <Share2 size={18} color={COLORS.primaryDark} />
            <Text style={styles.actionTextOutline}>Share PDF</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: SPACING.md + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.footBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border }]}
          onPress={() => { resetInputsToDefaults(); router.replace('/airframe'); }}
          testID="reset-btn"
        >
          <Text style={{ color: COLORS.text, fontWeight: '800' }}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footBtn, { backgroundColor: COLORS.primary }]}
          onPress={() => router.back()}
          testID="recompute-btn"
        >
          <RefreshCw size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '900' }}>Recompute</Text>
        </TouchableOpacity>
      </View>

      {/* Save modal */}
      <Modal visible={saveOpen} animationType="fade" transparent onRequestClose={() => setSaveOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="save-report-modal">
            <Text style={styles.modalTitle}>Save Report</Text>
            <Text style={styles.modalSub}>Name this report (you can edit it):</Text>
            <TextInput
              style={styles.modalInput}
              value={reportName}
              onChangeText={setReportName}
              autoFocus
              testID="save-report-name-input"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: SPACING.md }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.bg, flex: 1 }]}
                onPress={() => setSaveOpen(false)}
                testID="save-report-cancel"
              >
                <Text style={{ color: COLORS.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.primary, flex: 1 }]}
                onPress={doSave}
                testID="save-report-confirm"
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const pad = (n) => String(n).padStart(2, '0');

function SumCell({ label, value, testID }) {
  return (
    <View style={styles.sumCell} testID={testID}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue}>{value}</Text>
    </View>
  );
}

function Metric({ Icon, label, value, unit, color, testID }) {
  return (
    <View style={styles.metricCard} testID={testID}>
      <View style={styles.metricHeader}>
        <Icon size={16} color={COLORS.textMuted} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function DetailCell({ k, v }) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailK}>{k}</Text>
      <Text style={styles.detailV}>{v}</Text>
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
  summaryStrip: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: SPACING.md, ...SHADOW,
  },
  sumCell: { flex: 1, alignItems: 'center' },
  sumLabel: { color: COLORS.textMuted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' },
  sumValue: { color: COLORS.text, fontWeight: '900', fontSize: 16, marginTop: 2 },
  sep: { width: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md,
  },
  bannerOk: { backgroundColor: COLORS.successBg, borderWidth: 1, borderColor: '#A7F3D0' },
  bannerBad: { backgroundColor: COLORS.errorBg, borderWidth: 1, borderColor: '#FCA5A5' },
  bannerIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 20, fontWeight: '900' },
  bannerSub: { color: COLORS.text, fontSize: 12, marginTop: 2 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  metricCard: {
    width: '48%', backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: SPACING.md, ...SHADOW,
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  metricValue: { fontSize: 26, fontWeight: '900' },
  metricUnit: { color: COLORS.textMuted, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: 4, marginTop: SPACING.md, ...SHADOW,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 10, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 6, borderRadius: RADIUS.sm,
  },
  toggleBtnActive: { backgroundColor: COLORS.dark },
  toggleText: { fontWeight: '800', color: COLORS.text },
  chartCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginTop: SPACING.sm, ...SHADOW,
  },
  chartTitle: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase', fontWeight: '800', marginBottom: SPACING.sm,
  },
  tblHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: COLORS.border },
  tblHeadCell: { flex: 1, fontWeight: '900', color: COLORS.text },
  tblRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.border },
  tblCell: { flex: 1, color: COLORS.text },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  detailCell: {
    width: '48%', backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: SPACING.md, ...SHADOW,
  },
  detailK: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  detailV: { marginTop: 4, fontSize: 16, fontWeight: '800', color: COLORS.text },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: RADIUS.md,
  },
  actionOutline: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.primary,
  },
  actionTextOutline: { color: COLORS.primaryDark, fontWeight: '800' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.md, backgroundColor: 'rgba(245,247,251,0.95)',
    flexDirection: 'row', gap: SPACING.sm,
  },
  footBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 8, paddingVertical: 16, borderRadius: RADIUS.md,
  },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: SPACING.xl,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg },
  modalTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  modalSub: { color: COLORS.textMuted, marginTop: 4 },
  modalInput: {
    marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.bg,
  },
});
