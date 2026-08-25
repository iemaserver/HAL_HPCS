import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Menu, Mic, Settings, CheckSquare } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';
import AppMenu from '../src/components/AppMenu';
import { useVoiceFieldControl } from '../src/hooks/useVoiceFieldControl';

const HELI_IMG = {
  chetak:  require('../assets/images/Chetak-1.png'),
  cheetah: require('../assets/images/Cheetah-1.png'),
  cheetal: require('../assets/images/Cheetal-1.png'),
};

// Display order per Figma "HAL Design v.03 (Latest)" — Cheetah, Cheetal, Chetak.
const AIRFRAMES = ['cheetah', 'cheetal', 'chetak'];

// Figma-specific brand colors used only on this screen (not part of the shared theme palette).
const FIGMA = {
  headerBlue: '#00B9F2',
  mic: '#F04438',
  thumbBg: '#DFF7FF',
  cardBg: '#EAFBFF',
  cardBorder: '#D4D4D4',
  nameMuted: '#636363',
  subMuted: '#667085',
};

export default function Airframe() {
  const router = useRouter();
  const { aircraftDefaults, selectedAircraftId, setSelectedAircraftId } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const tapTimeoutRef = useRef(null);
  // Guards against BOTH timers below ever firing a navigation: Expo Router's native
  // stack keeps a pushed-from screen mounted in the background (it isn't unmounted
  // just because you navigated away), so its timers keep running. Without this guard,
  // a tap could fire its 350ms push while the 2s idle timer — started earlier and
  // still alive underneath — later fires too, stacking a second (or third, across
  // repeated selection changes) copy of /calculator on the nav stack. Every
  // navigation path below checks-and-sets this ref first, so only the first one to
  // fire actually navigates.
  const navigatedRef = useRef(false);

  const goToCalculator = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // replace (not push): this screen shouldn't remain on the stack under the
    // calculator, and replace can't accumulate duplicate instances even if this
    // somehow ran more than once.
    router.replace('/calculator');
  };

  // Client spec (slide 5): "PREVIOUSLY SELECTED AC OR CHETAK SHOULD BE AUTO
  // SELECTED" + "IF NO CHANGE WITHIN 2 SEC THE PAGE SHOULD GO TO HOVER CALCULATION
  // PAGE" — a 2-second inactivity timer for whichever aircraft is currently
  // selected (the session-persisted `selectedAircraftId`, which already defaults
  // to 'chetak' in AppState). The timer (re)starts on mount and every time the
  // selection changes, so idling on a newly-selected card still gets its own full
  // 2 seconds. It is a separate, longer mechanism from the tap-driven fast path
  // below — `navigatedRef` above ensures only one of the two ever actually navigates.
  useEffect(() => {
    const idleTimeout = setTimeout(goToCalculator, 2000);
    return () => clearTimeout(idleTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAircraftId]);

  // Belt-and-suspenders cleanup for the tap-driven timer (below): on unmount,
  // clear any pending navigation so navigating away (e.g. to Default Settings and
  // back) never leaves a stale setTimeout that fires after the user has left.
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  // Figma has no separate "Next" button on this screen in either the default or the
  // selected state — selecting a card is the only affordance shown. Client spec
  // (slide 5): "IF AC IS SELECTED SCREEN SHOULD GO TO THAT AC's HOVER POWER
  // CALCULATION" — any tap on a card (whether it changes the selection or just
  // re-taps the already-selected one) commits the choice and advances after a
  // brief delay (long enough to see the "Selected" styling), mirroring the same
  // select-then-navigate delay pattern already used by AppMenu's own navigate().
  // This fast path fires well before the 2-second idle timer above would, so it
  // effectively supersedes it whenever the user actually interacts.
  const selectAndAdvance = (id) => {
    setSelectedAircraftId(id);
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = setTimeout(goToCalculator, 350);
  };

  // Client spec (slide 4): pressing the mic starts continuous listening; saying a
  // button's label selects/triggers it directly. This screen has no numeric fields —
  // it's pure button-selection — so only `options` (no `fields`) is needed.
  const { listening, toggle } = useVoiceFieldControl({
    fields: [],
    options: [
      { key: 'chetak', label: 'chetak', onSelect: () => selectAndAdvance('chetak') },
      { key: 'cheetah', label: 'cheetah', onSelect: () => selectAndAdvance('cheetah') },
      { key: 'cheetal', label: 'cheetal', onSelect: () => selectAndAdvance('cheetal') },
      {
        key: 'default-settings',
        label: 'default settings',
        aliases: ['settings', 'defaults'],
        onSelect: () => router.push('/default-settings'),
      },
    ],
  });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="airframe-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={styles.headerIconBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="open-menu-btn"
        >
          <Menu size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>HAL HPS</Text>

        <TouchableOpacity
          style={[styles.micBtn, listening && styles.micBtnActive]}
          // Wired to useVoiceFieldControl: press to toggle continuous listening;
          // saying an airframe name or "default settings" selects/triggers it.
          onPress={toggle}
          testID="airframe-mic-btn"
        >
          <Mic size={20} color="#fff" />
          {listening && <View style={styles.micPulseDot} />}
        </TouchableOpacity>
      </View>
      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Select Airframe</Text>
        <Text style={styles.sectionSub}>Choose the helicopter type to check performance profile.</Text>

        <View style={styles.list}>
          {AIRFRAMES.map((id) => {
            const active = id === selectedAircraftId;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => selectAndAdvance(id)}
                style={[styles.card, active && styles.cardActive]}
                activeOpacity={0.85}
                testID={`airframe-${id}`}
              >
                <View style={styles.thumbWrap}>
                  <Image source={HELI_IMG[id]} style={styles.img} resizeMode="contain" />
                </View>
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                  {aircraftDefaults[id].name}
                </Text>
                {active && (
                  <View style={styles.selectedPill}>
                    <Text style={styles.selectedPillText}>Selected</Text>
                    <CheckSquare size={14} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.divider} />

        <Text style={styles.configTitle}>Default Configuration</Text>
        <Text style={styles.configSub}>Apply recommended performance parameters for aircraft.</Text>

        <TouchableOpacity
          style={styles.defaultSettingsBtn}
          onPress={() => router.push('/default-settings')}
          activeOpacity={0.9}
          testID="airframe-default-settings-btn"
        >
          <Settings size={22} color="#fff" />
          <Text style={styles.defaultSettingsText}>Default Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.card },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    backgroundColor: FIGMA.headerBlue,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    ...SHADOW,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: FIGMA.mic,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: FIGMA.headerBlue,
    borderWidth: 2,
    borderColor: '#fff',
  },
  micPulseDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: FIGMA.mic,
    borderWidth: 1,
    borderColor: '#fff',
  },

  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  sectionSub: { color: FIGMA.subMuted, fontSize: 13, marginTop: 2, marginBottom: SPACING.lg },

  list: { gap: SPACING.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: FIGMA.cardBorder,
    padding: 7,
    overflow: 'hidden',
    position: 'relative',
  },
  cardActive: {
    borderWidth: 2,
    borderColor: FIGMA.headerBlue,
    backgroundColor: FIGMA.cardBg,
  },
  thumbWrap: {
    width: 150,
    height: 90,
    borderRadius: 10,
    backgroundColor: FIGMA.thumbBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: { width: '85%', height: '75%' },
  name: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '500',
    color: FIGMA.nameMuted,
  },
  nameActive: { color: COLORS.text, fontWeight: '700' },
  selectedPill: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: FIGMA.headerBlue,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedPillText: { color: '#fff', fontWeight: '600', fontSize: 12 },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xl,
  },

  configTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  configSub: { color: FIGMA.subMuted, fontSize: 13, marginTop: 2, marginBottom: SPACING.lg },

  defaultSettingsBtn: {
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: FIGMA.headerBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    ...SHADOW,
  },
  defaultSettingsText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
