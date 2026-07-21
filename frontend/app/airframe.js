import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, FolderClock, Settings as SettingsIcon } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';

const HELI_IMG = {
  chetak: 'https://images.unsplash.com/photo-1528474078150-7324b0375b1c?crop=entropy&cs=srgb&fm=jpg&w=400&q=80',
  cheetah: 'https://images.unsplash.com/photo-1759610314761-855c55114110?crop=entropy&cs=srgb&fm=jpg&w=400&q=80',
  cheetal: 'https://images.pexels.com/photos/5620366/pexels-photo-5620366.jpeg?auto=compress&cs=tinysrgb&w=400',
};

const AIRFRAMES = ['chetak', 'cheetah', 'cheetal'];

export default function Airframe() {
  const router = useRouter();
  const { aircraftDefaults, selectedAircraftId, setSelectedAircraftId } = useAppState();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="airframe-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Helicopter Performance System</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/reports')} style={styles.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="open-reports-btn">
            <FolderClock size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="open-settings-btn">
            <SettingsIcon size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <Text style={styles.sectionTitle}>Select Airframe</Text>
        <Text style={styles.sectionSub}>Choose the helicopter type to check performance profile.</Text>

        <View style={styles.list}>
          {AIRFRAMES.map((id) => {
            const active = id === selectedAircraftId;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setSelectedAircraftId(id)}
                style={[styles.card, active && styles.cardActive]}
                activeOpacity={0.85}
                testID={`airframe-${id}`}
              >
                <Image source={{ uri: HELI_IMG[id] }} style={styles.img} resizeMode="cover" />
                <Text style={[styles.name, active && { color: COLORS.primaryDark }]}>
                  {aircraftDefaults[id].name}
                </Text>
                {active && (
                  <View style={styles.selectedPill}>
                    <Text style={styles.selectedPillText}>Selected</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: SPACING.lg + insets.bottom }]}>
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() => router.push('/calculator')}
          testID="airframe-next-btn"
          activeOpacity={0.9}
        >
          <Text style={styles.nextText}>Next</Text>
          <ChevronRight size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.card,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.text, fontWeight: '900', fontSize: 15, flex: 1 },
  headerActions: { flexDirection: 'row', gap: SPACING.sm },
  headerBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, letterSpacing: -0.3 },
  sectionSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2, marginBottom: SPACING.lg },
  list: { gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.md,
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW,
  },
  cardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  img: { width: '100%', height: 140, borderRadius: RADIUS.md, backgroundColor: COLORS.bg },
  name: { marginTop: SPACING.sm, fontWeight: '900', fontSize: 17, color: COLORS.text },
  selectedPill: {
    position: 'absolute', top: SPACING.md, right: SPACING.md,
    backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  selectedPillText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.lg, backgroundColor: 'rgba(245,247,251,0.95)',
  },
  nextBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: RADIUS.lg,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm, ...SHADOW,
  },
  nextText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
