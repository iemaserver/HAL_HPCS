import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { ChevronLeft, Share2, Trash2, FileText, Inbox, Menu } from 'lucide-react-native';
import AppMenu from '../src/components/AppMenu';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { listReports, deleteReport } from '../src/services/database';
import { generateAndSharePdf } from '../src/utils/pdf';

export default function Reports() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listReports();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => { refresh(); }, [refresh]);

  const performDelete = async (id) => {
    await deleteReport(id);
    setConfirmId(null);
    Toast.show({ type: 'success', text1: 'Deleted', position: 'top' });
    refresh();
  };

  // Use custom modal on ALL platforms — Alert.alert callbacks are unreliable
  // on web and some Android WebView contexts.
  const doDelete = (id) => setConfirmId(id);

  const doShare = async (r) => {
    try {
      await generateAndSharePdf({ ...r, ...r.payload });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Share failed', text2: String(e?.message || e), position: 'top' });
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="reports-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="back-btn">
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Reports</Text>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="open-menu-btn">
          <Menu size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 32 }}>
        {items.length === 0 && !loading && (
          <View style={styles.empty} testID="reports-empty">
            <Inbox size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No reports yet</Text>
            <Text style={styles.emptySub}>Save a report from the Performance Results screen to see it here.</Text>
          </View>
        )}

        {items.map((r) => {
          const status = r.payload?.outputs?.status;
          return (
            <View key={r.id} style={styles.card} testID={`report-${r.id}`}>
              <View style={styles.cardTop}>
                <FileText size={22} color={COLORS.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.cardSub}>
                    {new Date(r.created_at).toLocaleString()} · {r.payload?.aircraft?.name || r.aircraft_id}
                  </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: status === 'FIT' ? COLORS.successBg : COLORS.errorBg }]}>
                  <Text style={{ color: status === 'FIT' ? COLORS.success : COLORS.error, fontWeight: '800', fontSize: 11 }}>
                    {status === 'FIT' ? 'FIT' : 'NOT FIT'}
                  </Text>
                </View>
              </View>

              <View style={styles.kv}>
                <KV k="AUW" v={`${r.payload?.outputs?.AUW} kg`} />
                <KV k="PA" v={`${r.payload?.outputs?.PA} ft`} />
                <KV k="Pwr Bal" v={`${r.payload?.outputs?.POWER_BALANCE_PCT}%`} />
              </View>

              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => doShare(r)} testID={`share-${r.id}`}>
                  <Share2 size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Share PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => doDelete(r.id)} testID={`delete-${r.id}`}>
                  <Trash2 size={16} color={COLORS.error} />
                  <Text style={styles.btnGhostText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={confirmId !== null} animationType="fade" transparent onRequestClose={() => setConfirmId(null)}>
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Report?</Text>
            <Text style={styles.modalSub}>This report will be permanently removed.</Text>
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg }}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setConfirmId(null)}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.error }]} onPress={() => performDelete(confirmId)}>
                <Text style={[styles.btnPrimaryText]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function KV({ k, v }) {
  return (
    <View style={styles.kvCell}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={styles.kvV}>{v}</Text>
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
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { marginTop: SPACING.md, color: COLORS.text, fontWeight: '800', fontSize: 18 },
  emptySub: { marginTop: 4, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: SPACING.xl },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.md, ...SHADOW,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  cardTitle: { color: COLORS.text, fontWeight: '900', fontSize: 15 },
  cardSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  kv: { flexDirection: 'row', marginTop: SPACING.md, gap: SPACING.sm },
  kvCell: { flex: 1, backgroundColor: COLORS.bg, padding: 10, borderRadius: RADIUS.sm },
  kvK: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  kvV: { color: COLORS.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  btn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, paddingVertical: 12, borderRadius: RADIUS.sm,
  },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.error, fontWeight: '800' },
  modalBack: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: SPACING.xl },
  modalCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg },
  modalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  modalSub: { color: COLORS.textMuted, marginTop: 4 },
});
