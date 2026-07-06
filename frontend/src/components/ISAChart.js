import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Path, Circle, Text as SvgText, G } from 'react-native-svg';
import { COLORS } from '../constants/theme';
import {
  CHART_OAT_MIN, CHART_OAT_MAX, CHART_PA_MAX,
  CHART_PA_DA_CONTOURS,
} from '../constants/logic';

const CONTOUR_COLORS = ['#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B'];

const OAT_TICKS = [-30, -20, -10, 0, 10, 20, 30, 40, 50];
const PA_MAJOR_TICKS = [0, 4000, 8000, 12000, 16000, 20000];

/**
 * ISAChart — Pressure Altitude vs OAT with Density Altitude contour lines.
 * Ref: COMMON GRAPHS "Pressure altitude versus density altitude" (Lama manual).
 *
 * Props:
 *   current  { oat, pa, da }  — current operating point
 *   width, height
 */
export default function ISAChart({ current, width = 340, height = 240 }) {
  const padL = 44, padR = 20, padT = 10, padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const oatRange = CHART_OAT_MAX - CHART_OAT_MIN;
  const sx = (oat) => padL + ((oat - CHART_OAT_MIN) / oatRange) * plotW;
  const sy = (pa) => padT + (1 - pa / CHART_PA_MAX) * plotH;

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Horizontal PA grid lines */}
        {PA_MAJOR_TICKS.map((pa) => (
          <G key={pa}>
            <Line
              x1={padL} y1={sy(pa)} x2={padL + plotW} y2={sy(pa)}
              stroke="#D1D5DB" strokeDasharray="4,4" strokeWidth={1}
            />
            <SvgText x={padL - 4} y={sy(pa) + 4} fontSize={9} fill={COLORS.textMuted} textAnchor="end">
              {pa === 0 ? '0' : `${pa / 1000}k`}
            </SvgText>
          </G>
        ))}

        {/* Vertical OAT grid lines */}
        {OAT_TICKS.map((oat) => (
          <G key={oat}>
            <Line
              x1={sx(oat)} y1={padT} x2={sx(oat)} y2={padT + plotH}
              stroke="#E5E7EB" strokeDasharray="2,6" strokeWidth={0.7}
            />
            <SvgText x={sx(oat)} y={padT + plotH + 14} fontSize={9} fill={COLORS.textMuted} textAnchor="middle">
              {oat > 0 ? `+${oat}` : `${oat}`}
            </SvgText>
          </G>
        ))}

        {/* Axis border */}
        <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1.2} />
        <Line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1.2} />

        {/* DA contour lines */}
        {CHART_PA_DA_CONTOURS.map((da, idx) => {
          const color = CONTOUR_COLORS[Math.min(Math.floor(idx * CONTOUR_COLORS.length / CHART_PA_DA_CONTOURS.length), CONTOUR_COLORS.length - 1)];
          // build points inline (same formula as buildPADAContours but local)
          const pts = [];
          const K = 1 + 118.8 * 0.00198;
          for (let oat = CHART_OAT_MIN; oat <= CHART_OAT_MAX; oat += 1) {
            const pa = (da - 118.8 * (oat - 15)) / K;
            if (pa >= 0 && pa <= CHART_PA_MAX) pts.push({ oat, pa });
          }
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.oat).toFixed(1)} ${sy(p.pa).toFixed(1)}`).join(' ');
          const last = pts[pts.length - 1];
          return (
            <G key={da}>
              <Path d={d} stroke={color} strokeWidth={1.6} fill="none" />
              <SvgText
                x={sx(last.oat) + 3} y={sy(last.pa) + 4}
                fontSize={8.5} fill={color} fontWeight="bold"
              >
                {da === 0 ? '0' : `${da / 1000}k`}
              </SvgText>
            </G>
          );
        })}

        {/* Current operating point */}
        {current && current.pa >= 0 && current.pa <= CHART_PA_MAX &&
          current.oat >= CHART_OAT_MIN && current.oat <= CHART_OAT_MAX && (
          <>
            <Line
              x1={padL} y1={sy(current.pa)} x2={sx(current.oat)} y2={sy(current.pa)}
              stroke={COLORS.primary} strokeWidth={1.2} strokeDasharray="5,3" opacity={0.75}
            />
            <Line
              x1={sx(current.oat)} y1={padT + plotH} x2={sx(current.oat)} y2={sy(current.pa)}
              stroke={COLORS.primary} strokeWidth={1.2} strokeDasharray="5,3" opacity={0.75}
            />
            <Circle cx={sx(current.oat)} cy={sy(current.pa)} r={7} fill="#fff" stroke={COLORS.primary} strokeWidth={2.5} />
            <Circle cx={sx(current.oat)} cy={sy(current.pa)} r={3.5} fill={COLORS.primary} />
            <SvgText
              x={sx(current.oat) + 10} y={sy(current.pa) - 8}
              fontSize={10.5} fill={COLORS.primary} fontWeight="bold"
            >
              {`DA ${Math.round(current.da / 100) * 100} ft`}
            </SvgText>
          </>
        )}

        {/* Y-axis label */}
        <SvgText
          x={10} y={padT + plotH / 2}
          fontSize={9} fill={COLORS.textMuted} textAnchor="middle"
          rotation="-90" originX={10} originY={padT + plotH / 2}
        >
          Press. Alt (ft)
        </SvgText>

        {/* X-axis label */}
        <SvgText x={padL + plotW / 2} y={height - 1} fontSize={9} fill={COLORS.textMuted} textAnchor="middle">
          OAT (°C)
        </SvgText>
      </Svg>
    </View>
  );
}
