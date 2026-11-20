import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions,
} from 'react-native';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../constants/theme';

const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * Zoomable, pannable reference graph. Zoom with the buttons, then drag to pan.
 * `source` is a require()d image; `height` is the visible viewport height.
 */
export default function GraphViewer({ source, height = 520, sidePadding = SPACING.lg * 2 }) {
  const { width } = useWindowDimensions();
  const [zoomIdx, setZoomIdx] = useState(0);
  const baseW = Math.max(240, width - sidePadding);
  const dims = useMemo(() => Image.resolveAssetSource(source) || { width: 3, height: 4 }, [source]);
  const zoom = ZOOMS[zoomIdx];
  const imgW = baseW * zoom;
  const imgH = imgW * (dims.height / dims.width);

  return (
    <View testID="graph-viewer">
      <View style={styles.zoomRow}>
        <TouchableOpacity
          style={[styles.zoomBtn, zoomIdx === 0 && { opacity: 0.4 }]}
          disabled={zoomIdx === 0} onPress={() => setZoomIdx((z) => Math.max(0, z - 1))}
        >
          <ZoomOut size={18} color={COLORS.primaryDark} />
        </TouchableOpacity>
        <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
        <TouchableOpacity
          style={[styles.zoomBtn, zoomIdx === ZOOMS.length - 1 && { opacity: 0.4 }]}
          disabled={zoomIdx === ZOOMS.length - 1}
          onPress={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
        >
          <ZoomIn size={18} color={COLORS.primaryDark} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoomIdx(0)}>
          <Maximize2 size={16} color={COLORS.primaryDark} />
        </TouchableOpacity>
        <Text style={styles.hint}>Zoom, then drag to pan</Text>
      </View>
      <View style={[styles.viewport, { height }]}>
        <ScrollView nestedScrollEnabled>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
            <Image source={source} style={{ width: imgW, height: imgH }} resizeMode="contain" />
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  zoomBtn: {
    width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primaryLight, ...SHADOW,
  },
  zoomLabel: { minWidth: 44, textAlign: 'center', fontWeight: '800', color: COLORS.text },
  hint: { flex: 1, textAlign: 'right', fontSize: 11, color: COLORS.textMuted },
  viewport: {
    borderRadius: RADIUS.md, backgroundColor: '#fff', overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
});
