/**
 * Reference Graphs — every flight-manual graph, grouped under its helicopter.
 * Tap a graph to open it full-size with zoom and pan. (Client 20-Nov-26: reference only.)
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, ChevronRight, ChevronLeft } from 'lucide-react-native';
import AppMenu from '../src/components/AppMenu';
import GraphViewer from '../src/components/GraphViewer';
import { GRAPH_TITLES, getGraphSource, graphMetricsFor } from '../src/constants/graphs';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';

const HELI_IMG = {
  chetak: require('../assets/images/Chetak-1.png'),
  cheetah: require('../assets/images/Cheetah-1.png'),
  cheetal: require('../assets/images/Cheetal-1.png'),
};
const AIRFRAMES = ['chetak', 'cheetah', 'cheetal'];

export default function Graphs() {
  const insets = useSafeAreaInsets();
  const { aircraftDefaults } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(null); // { aircraftId, metric } while a graph is open

  // Hardware back closes the open graph first, instead of leaving the page.
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);

  const name = (id) => aircraftDefaults[id]?.name ?? id;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="graphs-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)} style={styles.headerBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Menu size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chet Cal C</Text>
        <View style={styles.headerBtn} />
      </View>
      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      {open ? (
        <View style={styles.viewerWrap}>
          <TouchableOpacity style={styles.backRow} onPress={() => setOpen(null)} testID="graph-back">
            <ChevronLeft size={20} color={COLORS.primaryDark} />
            <Text style={styles.backText}>{name(open.aircraftId)} graphs</Text>
          </TouchableOpacity>
          <Text style={styles.viewerTitle} testID="graph-title">
            {name(open.aircraftId)} — {GRAPH_TITLES[open.metric]}
          </Text>
          <GraphViewer source={getGraphSource(open.aircraftId, open.metric)} height={560} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}>
          <Text style={styles.title}>Reference Graphs</Text>
          <Text style={styles.sub}>Flight-manual graphs, grouped by helicopter. Tap one to open it.</Text>

          {AIRFRAMES.map((id) => {
            const metrics = graphMetricsFor(id);
            return (
              <View key={id} style={styles.card} testID={`graphs-group-${id}`}>
                <View style={styles.cardHead}>
                  <View style={styles.thumbWrap}>
                    <Image source={HELI_IMG[id]} style={styles.thumb} resizeMode="cover" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{name(id)}</Text>
                    <Text style={styles.cardSub}>{metrics.length} graphs</Text>
                  </View>
                </View>
                {metrics.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.row}
                    onPress={() => setOpen({ aircraftId: id, metric: m })}
                    testID={`graph-${id}-${m}`}
                  >
                    <Text style={styles.rowText}>{GRAPH_TITLES[m]}</Text>
                    <ChevronRight size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
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
  scroll: { padding: SPACING.lg },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginTop: SPACING.md },
  sub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2, marginBottom: SPACING.lg },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  thumbWrap: {
    width: 84, height: 56, borderRadius: RADIUS.sm, backgroundColor: '#DFF7FF', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  thumb: { width: '100%', height: '100%' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  rowText: { fontSize: 14.5, fontWeight: '600', color: COLORS.text },
  viewerWrap: { flex: 1, padding: SPACING.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  backText: { fontSize: 14, fontWeight: '700', color: COLORS.primaryDark },
  viewerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.md },
});
