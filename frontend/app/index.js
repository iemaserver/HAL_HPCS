import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

const HAL_LOGO = require('../assets/logos/hal-logo.png');
const SPLASH_DURATION = 2000;

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace('/airframe'), SPLASH_DURATION);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <LinearGradient
      colors={['#E0F4FD', '#B8E4F5', '#7EC9E9']}
      style={styles.root}
      testID="splash-screen"
    >
      <View style={styles.logoSection}>
        <Image source={HAL_LOGO} style={styles.logo} resizeMode="contain" />
        <View style={styles.maharatnaRow}>
          <View style={styles.dash} />
          <Text style={styles.maharatna}>A Maharatna CPSE</Text>
          <View style={styles.dash} />
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Chetak · Cheetah · Cheetal</Text>
        <Text style={styles.subtitle}>(Helicopter Performance System)</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 120,
    paddingBottom: 140,
    paddingHorizontal: 32,
  },
  logoSection: {
    alignItems: 'center',
  },
  logo: {
    width: 240,
    height: 120,
  },
  maharatnaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  dash: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#1A6FA8',
    opacity: 0.6,
  },
  maharatna: {
    color: '#1A6FA8',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  titleBlock: {
    alignItems: 'center',
  },
  title: {
    color: '#0D3D6B',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#1A6FA8',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
    opacity: 0.85,
  },
});
