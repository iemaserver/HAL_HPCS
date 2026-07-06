import React from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

const HAL_LOGO = require('../../assets/logos/hal-logo.png');

/**
 * HAL Logo spinner used as loader throughout the app.
 */
export default function HalLoader({ size = 60, label = 'Loading…' }) {
  return (
    <View style={styles.wrap} testID="hal-loader">
      <View style={[styles.logoWrap, { width: size * 1.4, height: size * 1.4 }]}>
        <Image
          source={HAL_LOGO}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </View>
      <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.sm }} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 6, color: COLORS.textMuted, fontSize: 13 },
});
