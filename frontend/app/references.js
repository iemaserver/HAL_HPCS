import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu, Mic } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import AppMenu from '../src/components/AppMenu';

const REFERENCES = [
  { title: 'Flight Manual SA 315B LAMA.', sub: 'Rev. RR-4A Dated 01-99' },
  { title: 'Flight Manual 316B', sub: 'Rev. RR-22B Dated 06-03' },
  { title: 'Flight Manual CHEETAL', sub: 'Rev. 02 Dated 01-15.' },
];

export default function References() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="references-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={styles.headerBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="open-menu-btn"
        >
          <Menu size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HAL HPS</Text>
        <TouchableOpacity
          onPress={() => {}}
          style={styles.micBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="mic-btn"
        >
          <Mic size={20} color={COLORS.error} />
        </TouchableOpacity>
      </View>
      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <Text style={styles.sectionTitle}>References</Text>
        <Text style={styles.sectionSub}>
          Reference the certified flight manuals for accurate performance data.
        </Text>

        <View style={styles.divider} />

        <View style={styles.list}>
          {REFERENCES.map((ref, i) => (
            <View key={i} style={styles.item} testID={`reference-${i + 1}`}>
              <Text style={styles.itemNumber}>{i + 1}.</Text>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>{ref.title}</Text>
                <Text style={styles.itemSub}>{ref.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl,
  },
  headerBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontWeight: '600', fontSize: 16 },
  micBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', ...SHADOW,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  sectionSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.lg },
  list: { gap: SPACING.xl },
  item: { flexDirection: 'row', gap: SPACING.sm },
  itemNumber: { fontSize: 16, color: COLORS.text, fontWeight: '400' },
  itemTextWrap: { flex: 1 },
  itemTitle: { fontSize: 16, color: COLORS.text, lineHeight: 22 },
  itemSub: { fontSize: 16, color: COLORS.text, lineHeight: 22 },
});
