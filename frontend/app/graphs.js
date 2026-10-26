/**
 * Aircraft Graphs (client #13) — the flight-manual graph sheets for the selected aircraft,
 * viewable in-app with zoom and pan.
 *
 * To add or replace a sheet, drop the image in assets/graphs/ and edit GRAPHS below.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react-native';
import AppMenu from '../src/components/AppMenu';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';

const SHEETS = {
  chetak: { title: 'Chetak graphs', src: require('../assets/graphs/chetak-graph.png') },
  cheetah: { title: 'Cheetah graphs', src: require('../assets/graphs/cheetah-graph.png') },
  common: { title: 'Common graphs', src: require('../assets/graphs/common-graphs.png') },
};

// Which sheets belong to which aircraft. Cheetal shares the Lama rotor system and uses the
// Cheetah sheets until its own manual graphs are supplied.
const GRAPHS = {
  chetak: [SHEETS.chetak, SHEETS.common],
  cheetah: [SHEETS.cheetah, SHEETS.common],
  cheetal: [SHEETS.cheetah, SHEETS.common],
};

const ZOOMS = [1, 1.5, 2, 3, 4];

export default function Graphs() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { aircraftDefaults, selectedAircraftId } = useAppState();
  const aircraft = aircraftDefaults[selectedAircraftId];
  const sheets = GRAPHS[selectedAircraftId] ?? GRAPHS.chetak;
  const [idx, setIdx] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const sheet = sheets[Math.min(idx, sheets.length - 1)];
  const baseW = Math.max(240, width - SPACING.lg * 2);
  const dims = useMemo(() => Image.resolveAssetSource(sheet.src) || { width: 4, height: 3 }, [sheet]);
  const zoom = ZOOMS[zoomIdx];
  const imgW = baseW * zoom;
  const imgH = imgW * (dims.height / dims.width);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="graphs-screen">
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

      <View style={styles.top}>
        <Text style={styles.title}>{aircraft.name} — Graphs</Text>
        {selectedAircraftId === 'cheetal' ? (
          <Text style={styles.note}>Cheetal uses the Lama (Cheetah) rotor-system charts.</Text>
        ) : null}
        <View style={styles.tabRow}>
          {sheets.map((s, i) => (
            <TouchableOpacity
              key={s.title}
              style={[styles.tab, i === idx && styles.tabActive]}
              onPress={() => { setIdx(i); setZoomIdx(0); }}
            >
              <Text style={[styles.tabText, i === idx && styles.tabTextActive]}>{s.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.zoomRow}>
          <TouchableOpacity
            style={[styles.zoomBtn, zoomIdx === 0 && { opacity: 0.4 }]}
            disabled={zoomIdx === 0} onPress={() => setZoomIdx((z) => Math.max(0, z - 1))}
          >
            <ZoomOut size={18} color={COLORS.primaryDark} />
          </TouchableOpacity>
          <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
          <TouchableOpacity
            style={[styles.zoomBtn, zoomIdx === ZOOMS.length - 1 && { opacity: 0.4 }]}
            disabled={zoomIdx === ZOOMS.length - 1} onPress={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
          >
            <ZoomIn size={18} color={COLORS.primaryDark} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoomIdx(0)}>
            <Maximize2 size={16} color={COLORS.primaryDark} />
          </TouchableOpacity>
          <Text style={styles.hint}>Zoom, then drag to pan</Text>
        </View>
      </View>

      <ScrollView
        style={styles.viewer}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        nestedScrollEnabled
      >
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <Image source={sheet.src} style={{ width: imgW, height: imgH }} resizeMode="contain" />
        </ScrollView>
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
  top: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  note: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  tabTextActive: { color: '#fff' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.sm },
  zoomBtn: {
    width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primaryLight, ...SHADOW,
  },
  zoomLabel: { minWidth: 44, textAlign: 'center', fontWeight: '800', color: COLORS.text },
  hint: { flex: 1, textAlign: 'right', fontSize: 11, color: COLORS.textMuted },
  viewer: { flex: 1, marginHorizontal: SPACING.lg, borderRadius: RADIUS.md, backgroundColor: '#fff' },
});
