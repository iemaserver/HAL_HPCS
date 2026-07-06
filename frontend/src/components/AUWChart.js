import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Path, Circle, Text as SvgText, G } from 'react-native-svg';
import { COLORS } from '../constants/theme';

/**
 * AUWChart — Simple line chart of limit curve (red) vs current point (blue dot)
 * Props:
 *   width, height
 *   points: [{x,y}] altitude(kft) -> maxAUW(kg)
 *   current: {x,y} current altitude -> current AUW
 */
export default function AUWChart({ width = 340, height = 220, points, current }) {
  const padL = 38, padR = 16, padT = 12, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys, current?.y ?? ys[0]);
  const yMax = Math.max(...ys, current?.y ?? ys[ys.length - 1]);
  const yRange = yMax - yMin || 1;

  const sx = (x) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => padT + (1 - (y - yMin) / yRange) * plotH;

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
    .join(' ');

  // Y axis labels (4 ticks)
  const yTicks = [0, 0.33, 0.66, 1].map((t) => Math.round(yMin + t * yRange));

  return (
    <View style={styles.wrap}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.legendText}>Current</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dash, { backgroundColor: COLORS.error }]} />
          <Text style={styles.legendText}>Limit</Text>
        </View>
      </View>
      <Svg width={width} height={height}>
        {/* Grid */}
        {yTicks.map((t, i) => (
          <G key={i}>
            <Line
              x1={padL}
              y1={sy(t)}
              x2={width - padR}
              y2={sy(t)}
              stroke="#E5E7EB"
              strokeDasharray="3,4"
            />
            <SvgText x={padL - 6} y={sy(t) + 4} fontSize={10} fill={COLORS.textMuted} textAnchor="end">
              {t}
            </SvgText>
          </G>
        ))}
        {/* X axis labels */}
        {[0, 5, 10, 15, 20].map((x) => (
          <SvgText key={x} x={sx(x)} y={height - 8} fontSize={10} fill={COLORS.textMuted} textAnchor="middle">
            {x}
          </SvgText>
        ))}
        {/* Limit curve */}
        <Path d={d} stroke={COLORS.error} strokeWidth={2.5} fill="none" />
        {/* Current dashed line to point */}
        {current && (
          <>
            <Line
              x1={padL}
              y1={sy(current.y)}
              x2={sx(current.x)}
              y2={sy(current.y)}
              stroke={COLORS.primary}
              strokeWidth={1.5}
              strokeDasharray="4,4"
            />
            <Circle cx={sx(current.x)} cy={sy(current.y)} r={6} fill="#fff" stroke={COLORS.primary} strokeWidth={3} />
            <SvgText
              x={sx(current.x) + 10}
              y={sy(current.y) - 10}
              fontSize={11}
              fill={COLORS.primary}
              fontWeight="bold"
            >
              {`${Math.round(current.y)} kg`}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start' },
  legendRow: { flexDirection: 'row', gap: 18, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { color: COLORS.textMuted, fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dash: { width: 18, height: 3 },
});
