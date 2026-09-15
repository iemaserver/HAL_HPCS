import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import WebView from 'react-native-webview';
import {
  ChevronLeft, Share2, Trash2, FileText, Inbox, Menu, Eye, X,
} from 'lucide-react-native';
import AppMenu from '../src/components/AppMenu';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { listReports, deleteReport } from '../src/services/database';
import { generateAndSharePdf, buildReportHtml } from '../src/utils/pdf';

export default function Reports() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState(null); // the report object currently shown in the in-app viewer
  const [viewerContentHeight, setViewerContentHeight] = useState(null); // measured HTML content height, so the WebView doesn't leave a big blank gap for short reports

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

  const doView = (r) => {
    setViewerContentHeight(null);
    setViewingReport(r);
  };
  const closeView = () => setViewingReport(null);
  const viewingHtml = viewingReport
    ? buildReportHtml({ ...viewingReport, ...viewingReport.payload })
    : null;
  // Measures the report's actual rendered height so the WebView can be sized to its content
  // instead of always filling the screen (which left a large blank gap below short reports).
  const measureHeightJs = `
    (function() {
      var send = function() {
        window.ReactNativeWebView.postMessage(String(document.body.scrollHeight));
      };
      send();
      window.addEventListener('load', send);
      setTimeout(send, 300);
    })();
    true;
  `;
  const onViewerMessage = (event) => {
    const h = parseInt(event.nativeEvent.data, 10);
    if (!isNaN(h) && h > 0) setViewerContentHeight(h);
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
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => doView(r)} testID={`view-${r.id}`}>
                  <Eye size={16} color={COLORS.primaryDark} />
                  <Text style={styles.btnOutlineText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => doShare(r)} testID={`share-${r.id}`}>
                  <Share2 size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Share</Text>
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

      {/* In-app report viewer — same HTML content used for the shared PDF (client spec
          2026-09-15: saved reports should be viewable in-app, not just shareable). */}
      <Modal visible={viewingReport !== null} animationType="slide" onRequestClose={closeView}>
        <SafeAreaView style={styles.viewerRoot} edges={['top', 'bottom']} testID="report-viewer">
          <View style={[styles.viewerHeader, { paddingTop: insets.top ? 0 : SPACING.sm }]}>
            <Text style={styles.viewerTitle} numberOfLines={1}>{viewingReport?.name || 'Report'}</Text>
            <TouchableOpacity onPress={closeView} style={styles.headerBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} testID="close-viewer-btn">
              <X size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {viewingHtml && (
            Platform.OS === 'web' ? (
              // react-native-webview has no web implementation (renders "does not support
              // this platform") — the app's real target is native, but a plain iframe keeps
              // the dev-preview usable for a quick visual check.
              <iframe
                srcDoc={viewingHtml}
                style={{ flex: 1, border: 'none', width: '100%' }}
                title={viewingReport?.name || 'Report'}
                data-testid="report-webview"
                onLoad={(e) => {
                  try {
                    const h = e.target.contentWindow.document.body.scrollHeight;
                    if (h > 0) setViewerContentHeight(h);
                  } catch { /* ignore */ }
                }}
              />
            ) : (
              // Sized to the report's OWN measured content height (via injectedJavaScript
              // below) instead of flex:1 — flex:1 always filled the whole screen regardless
              // of content length, leaving a large blank gap below shorter reports.
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
                <WebView
                  source={{ html: viewingHtml }}
                  style={{ height: viewerContentHeight || 800, opacity: viewerContentHeight ? 1 : 0 }}
                  scrollEnabled={false}
                  injectedJavaScript={measureHeightJs}
                  onMessage={onViewerMessage}
                  originWhitelist={['*']}
                  testID="report-webview"
                />
              </ScrollView>
            )
          )}
          <View style={[styles.viewerFooter, { paddingBottom: SPACING.md + insets.bottom }]}>
            <TouchableOpacity
              style={styles.viewerShareBtn}
              onPress={() => viewingReport && doShare(viewingReport)}
              testID="viewer-share-btn"
            >
              <Share2 size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Share PDF</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
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
  btnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.primary },
  btnOutlineText: { color: COLORS.primaryDark, fontWeight: '800' },
  modalBack: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: SPACING.xl },
  modalCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg },
  modalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  modalSub: { color: COLORS.textMuted, marginTop: 4 },

  viewerRoot: { flex: 1, backgroundColor: COLORS.bg },
  viewerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, backgroundColor: COLORS.primary,
  },
  viewerTitle: { flex: 1, color: '#fff', fontWeight: '900', fontSize: 15, marginRight: SPACING.sm },
  viewerFooter: {
    padding: SPACING.md, backgroundColor: COLORS.card,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  // Deliberately NOT reusing `btn` here: `btn`'s flex:1 is designed for siblings inside a
  // flexDirection:'row' container (like the card's View/Share/Delete row), where it means
  // "share the available width". As the lone child of viewerFooter (a plain, unbounded-height
  // column View), flex:1 instead means "grow to fill height" — Yoga then resolves the Text
  // child's available width to 0 on native (the icon still renders since it's fixed-size),
  // so the label silently disappeared while the icon stayed visible.
  viewerShareBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, paddingVertical: 14, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary,
  },
});
