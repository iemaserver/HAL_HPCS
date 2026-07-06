import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { GRADIENTS } from '../src/constants/theme';
import { useAppState } from '../src/store/AppState';

const HAL_LOGO = require('../assets/logos/hal-logo.png');
const MIN_SPLASH_MS = 1600;

/**
 * Splash screen — shown on cold start while the SQLite-backed app state
 * hydrates. Always waits MIN_SPLASH_MS even if state is ready sooner, so the
 * animation doesn't flash for a single frame on fast devices.
 */
export default function Splash() {
  const router = useRouter();
  const { ready } = useAppState();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    Animated.loop(
      Animated.sequence([
        Animated.timing(barAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(barAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
    return () => clearTimeout(t);
  }, [barAnim]);

  useEffect(() => {
    if (ready && minTimeElapsed) {
      router.replace('/airframe');
    }
  }, [ready, minTimeElapsed, router]);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['10%', '90%'] });

  return (
    <LinearGradient colors={GRADIENTS.splash} style={styles.root} testID="splash-screen">
      <View style={styles.center}>
        <View style={styles.logoCard}>
          <Image source={HAL_LOGO} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.maharatna}>A Maharatna CPSE</Text>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Chetak · Cheetah · Cheetal</Text>
        <Text style={styles.subtitle}>(Helicopter Performance System)</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 80 },
  center: { alignItems: 'center', marginTop: 60 },
  logoCard: {
    width: 220, alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: 220, height: 110 },
  maharatna: { marginTop: 4, color: '#0F172A', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  titleBlock: { alignItems: 'center', paddingHorizontal: 24 },
  title: { color: '#0F172A', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#0F172A', fontSize: 13, fontWeight: '600', marginTop: 4, opacity: 0.75, textAlign: 'center' },
  footer: { alignItems: 'center', width: '60%' },
  barTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)', overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: '#fff' },
  loadingText: { marginTop: 10, color: '#0F172A', fontSize: 12, fontWeight: '700' },
});
