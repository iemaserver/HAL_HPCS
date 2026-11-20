import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Renders text with subscripts. Write a subscript as _{...}, e.g. "P_{mb}" shows P with a small
 * "mb" below the baseline. React Native can't shift a nested Text off the baseline, so the pieces
 * are laid out in a row and the subscript piece is smaller and nudged down.
 */
export default function SubText({ children, style, subScale = 0.68 }) {
  const str = String(children ?? '');
  const parts = str.split(/(_\{[^}]*\})/g).filter((p) => p !== '');
  const flat = StyleSheet.flatten(style) || {};
  const size = flat.fontSize || 14;
  return (
    <View style={styles.row}>
      {parts.map((p, i) => {
        const m = /^_\{([^}]*)\}$/.exec(p);
        if (!m) return <Text key={i} style={style}>{p}</Text>;
        return (
          <Text
            key={i}
            style={[style, { fontSize: size * subScale, transform: [{ translateY: size * 0.22 }] }]}
          >
            {m[1]}
          </Text>
        );
      })}
    </View>
  );
}

// Plain-text version (warnings, logs): "P_{mb}" → "Pmb".
export const plainLabel = (label) => String(label ?? '').replace(/_\{([^}]*)\}/g, '$1');

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
});
