import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Path, Circle, Text as SvgText, G } from 'react-native-svg';
import { COLORS } from '../constants/theme';
import { CHART_DA_MAX, CHART_VMAX_MIN, CHART_VMAX_MAX, CHART_ROC_MAX } from '../constants/logic';

// Gray shades from lightest AUW (top) to heaviest (bottom)
const CURVE_COLORS = ['#CBD5E1', '#94A3B8', '#64748B', '#475569', '#1E293B'];

const DA_TICKS = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000];

/**
 * PerformanceChart — aircraft-specific SVG chart
 *
 * Props:
 *   type        'vmax' | 'roc'
 *   curves      [{auw, points:[{da, value}]}]  — reference AUW lines
 *   current     {da, value}                    — current operating point
 *   width       number
 *   height      number
 */
export default function PerformanceChart({ type, curves = [], current, width = 340, height = 260 }) {
  const padL = 44, padR = 14, padT = 10, padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xMin = type === 'vmax' ? CHART_VMAX_MIN : 0;
  const xMax = type === 'vmax' ? CHART_VMAX_MAX : CHART_ROC_MAX;
  const xRange = xMax - xMin;

  const sx = (v) => padL + ((v - xMin) / xRange) * plotW;
  const sy = (da) => padT + (1 - da / CHART_DA_MAX) * plotH;

  const xTickStep = type === 'vmax' ? 10 : 250;
  const xTicks = [];
  for (let v = xMin; v <= xMax; v += xTickStep) xTicks.push(v);

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Horizontal grid lines — DA ticks */}
        {DA_TICKS.map((da) => {
          const isMajor = da % 4000 === 0;
          return (
            <G key={da}>
              <Line
                x1={padL} y1={sy(da)} x2={padL + plotW} y2={sy(da)}
                stroke={isMajor ? '#D1D5DB' : '#E5E7EB'}
                strokeDasharray={isMajor ? '4,4' : '2,6'}
                strokeWidth={isMajor ? 1 : 0.7}
              />
              {isMajor && (
                <SvgText x={padL - 4} y={sy(da) + 4} fontSize={9} fill={COLORS.textMuted} textAnchor="end">
                  {da === 0 ? '0' : `${da / 1000}k`}
                </SvgText>
              )}
            </G>
          );
        })}

        {/* Vertical grid lines — X ticks */}
        {xTicks.map((v) => (
          <G key={v}>
            <Line
              x1={sx(v)} y1={padT} x2={sx(v)} y2={padT + plotH}
              stroke="#E5E7EB" strokeDasharray="2,6" strokeWidth={0.7}
            />
            <SvgText x={sx(v)} y={padT + plotH + 14} fontSize={9} fill={COLORS.textMuted} textAnchor="middle">
              {v}
            </SvgText>
          </G>
        ))}

        {/* Axis border */}
        <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1.2} />
        <Line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1.2} />

        {/* Reference AUW curves */}
        {curves.map((curve, idx) => {
          const pts = curve.points.filter(
            (p) => p.value >= xMin && p.value <= xMax + xTickStep && p.da <= CHART_DA_MAX,
          );
          if (pts.length < 2) return null;
          const d = pts
            .map((p, i) => {
              const cx = Math.min(Math.max(sx(p.value), padL), padL + plotW);
              const cy = Math.min(Math.max(sy(p.da), padT), padT + plotH);
              return `${i === 0 ? 'M' : 'L'} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
            })
            .join(' ');
          return (
            <Path
              key={curve.auw}
              d={d}
              stroke={CURVE_COLORS[idx % CURVE_COLORS.length]}
              strokeWidth={1.8}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Current operating point */}
        {current && current.value > xMin && current.da <= CHART_DA_MAX && (
          <>
            <Line
              x1={padL} y1={sy(current.da)}
              x2={sx(current.value)} y2={sy(current.da)}
              stroke={COLORS.primary} strokeWidth={1.2} strokeDasharray="5,3" opacity={0.75}
            />
            <Line
              x1={sx(current.value)} y1={padT + plotH}
              x2={sx(current.value)} y2={sy(current.da)}
              stroke={COLORS.primary} strokeWidth={1.2} strokeDasharray="5,3" opacity={0.75}
            />
            <Circle
              cx={sx(current.value)} cy={sy(current.da)}
              r={7} fill="#fff" stroke={COLORS.primary} strokeWidth={2.5}
            />
            <Circle
              cx={sx(current.value)} cy={sy(current.da)}
              r={3.5} fill={COLORS.primary}
            />
            <SvgText
              x={sx(current.value) + 10}
              y={sy(current.da) - 8}
              fontSize={10.5} fill={COLORS.primary} fontWeight="bold"
            >
              {`${current.value} ${type === 'vmax' ? 'kts' : 'fpm'}`}
            </SvgText>
          </>
        )}

        {/* Y-axis label (rotated) */}
        <SvgText
          x={10} y={padT + plotH / 2}
          fontSize={9} fill={COLORS.textMuted} textAnchor="middle"
          rotation="-90" originX={10} originY={padT + plotH / 2}
        >
          Density Alt (ft)
        </SvgText>

        {/* X-axis label */}
        <SvgText
          x={padL + plotW / 2} y={height - 1}
          fontSize={9} fill={COLORS.textMuted} textAnchor="middle"
        >
          {type === 'vmax' ? 'Max Speed (knots)' : 'Rate of Climb (ft/min)'}
        </SvgText>
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {curves.map((c, idx) => (
          <View key={c.auw} style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: CURVE_COLORS[idx % CURVE_COLORS.length] }]} />
            <Text style={styles.legendLabel}>{c.auw} kg</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={[styles.legendLabel, { color: COLORS.primary }]}>Current</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 16, height: 2.5, borderRadius: 1.5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
});
