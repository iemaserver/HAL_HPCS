import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Animated, StyleSheet,
} from 'react-native';
import { useRouter, usePathname, useLocalSearchParams } from 'expo-router';
import {
  X, Calculator, PlaneTakeoff, FolderClock, Settings, ChevronRight, ChevronDown,
  Gauge, Radar, BookOpen, Sigma,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../constants/theme';

const MENU_WIDTH = 270;

// Matches Figma "HAL Design v.03 (Latest)" > Menu 1 (5213:2948) / Menu 2 (5213:3049, expanded state).
const NAV_ITEMS = [
  {
    key: 'airframe',
    label: 'Select Airframe',
    desc: 'Chetak · Cheetah · Cheetal',
    route: '/airframe',
    Icon: PlaneTakeoff,
  },
  {
    key: 'calculator',
    label: 'Hover Power Calculation',
    desc: 'Inputs & live performance outputs',
    route: '/calculator',
    Icon: Calculator,
  },
  {
    key: 'performance-data',
    label: 'Performance Data',
    desc: 'Speed, climb & autorotation metrics',
    Icon: Gauge,
    // No direct route — tapping expands this inline sublist (Figma "Menu 2" state).
    expandable: true,
    subItems: [
      {
        key: 'vmax',
        label: 'Max Level Flight Speed',
        route: '/performance-data',
        params: { metric: 'vmax' },
      },
      {
        key: 'roc',
        label: 'Rate of Climb',
        route: '/performance-data',
        params: { metric: 'roc' },
      },
      {
        key: 'autorotation-rpm',
        label: 'RPM in Autorotation',
        // No formula yet — explicitly deferred, waiting on flight-manual data from the user.
        disabled: true,
        comingSoon: true,
      },
    ],
  },
  {
    key: 'flight-testing',
    label: 'Flight Testing',
    desc: 'Not yet available',
    Icon: Radar,
    // No Figma frame or screen exists for this yet — menu placeholder only.
    disabled: true,
    comingSoon: true,
  },
  {
    key: 'default-settings',
    label: 'Default Settings',
    desc: 'Per-aircraft weights, ZP/T table & Zσ/Dθ',
    // Full v.03 Default Settings screen (client PPTX slides 7-8), per-aircraft.
    route: '/default-settings',
    Icon: Settings,
  },
  {
    key: 'references',
    label: 'References',
    desc: 'Manuals, formulas & source data',
    route: '/references',
    Icon: BookOpen,
  },
  {
    key: 'reports',
    label: 'Saved Reports',
    desc: 'View and share past calculations',
    // Not present in the v.03 Figma menu, but the screen still exists and works —
    // kept appended below References rather than deleting working functionality.
    // Revisit if the design intentionally drops this feature.
    route: '/reports',
    Icon: FolderClock,
  },
  {
    key: 'formulas',
    label: 'Formulas',
    desc: 'Edit calculation formulas & defaults',
    // Also not present in the v.03 Figma menu (same situation as Saved Reports
    // above) — this is the pre-redesign live formula/default-value editor
    // (app/settings.js). Working screen, just dropped from navigation when
    // AppMenu was rebuilt for v.03; restored here rather than left orphaned.
    route: '/settings',
    Icon: Sigma,
  },
];

export default function AppMenu({ visible, onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const { metric: activeMetric } = useLocalSearchParams();
  const slideAnim = useRef(new Animated.Value(MENU_WIDTH)).current;
  const [expandedKey, setExpandedKey] = useState(
    pathname === '/performance-data' ? 'performance-data' : null,
  );

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : MENU_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (route, params) => {
    onClose();
    setTimeout(() => router.push(params ? { pathname: route, params } : route), 180);
  };

  const toggleExpand = (key) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* tap outside to close */}
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          {/* Drawer header */}
          <View style={styles.drawerHead}>
            <View>
              <Text style={styles.appName}>HAL HPCS</Text>
              <Text style={styles.appSub}>Helicopter Performance System</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Nav list */}
          <View style={styles.navList}>
            {NAV_ITEMS.map(({
              key, label, desc, route, Icon, expandable, subItems, disabled, comingSoon,
            }) => {
              const expanded = expandedKey === key;
              const active = !expandable && !disabled && pathname === route;
              const headerActive = expandable && expanded;

              const onPressItem = () => {
                if (disabled) return;
                if (expandable) {
                  toggleExpand(key);
                  return;
                }
                navigate(route);
              };

              return (
                <View key={key}>
                  <TouchableOpacity
                    testID={`nav-item-${key}`}
                    style={[
                      styles.navItem,
                      (active || headerActive) && styles.navItemActive,
                      disabled && styles.navItemDisabled,
                    ]}
                    onPress={onPressItem}
                    activeOpacity={disabled ? 1 : 0.75}
                    disabled={disabled}
                  >
                    <View style={[styles.iconWrap, (active || headerActive) && styles.iconWrapActive]}>
                      <Icon size={17} color={(active || headerActive) ? '#fff' : (disabled ? COLORS.textMuted : COLORS.primary)} />
                    </View>
                    <View style={styles.navText}>
                      <View style={styles.navLabelRow}>
                        <Text
                          style={[
                            styles.navLabel,
                            (active || headerActive) && styles.navLabelActive,
                            disabled && styles.navLabelDisabled,
                          ]}
                        >
                          {label}
                        </Text>
                        {comingSoon && (
                          <View style={styles.comingSoonTag}>
                            <Text style={styles.comingSoonTagText}>Coming soon</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.navDesc, disabled && styles.navDescDisabled]} numberOfLines={1}>{desc}</Text>
                    </View>
                    {expandable ? (
                      <ChevronDown
                        size={16}
                        color={headerActive ? '#fff' : COLORS.border}
                        style={expanded ? styles.chevronExpanded : undefined}
                      />
                    ) : (
                      !active && !disabled && <ChevronRight size={14} color={COLORS.border} />
                    )}
                  </TouchableOpacity>

                  {expandable && expanded && (
                    <View style={styles.subList} testID={`nav-sublist-${key}`}>
                      {subItems.map((sub) => {
                        const subActive = !sub.disabled
                          && pathname === sub.route
                          && activeMetric === sub.params?.metric;
                        return (
                          <TouchableOpacity
                            key={sub.key}
                            testID={`nav-subitem-${sub.key}`}
                            style={styles.subItem}
                            onPress={() => (sub.disabled ? null : navigate(sub.route, sub.params))}
                            activeOpacity={sub.disabled ? 1 : 0.7}
                            disabled={sub.disabled}
                          >
                            <View style={[
                              styles.subDot,
                              subActive && styles.subDotActive,
                              sub.disabled && styles.subDotDisabled,
                            ]}
                            />
                            <Text
                              style={[
                                styles.subLabel,
                                subActive && styles.subLabelActive,
                                sub.disabled && styles.subLabelDisabled,
                              ]}
                            >
                              {sub.label}
                            </Text>
                            {sub.comingSoon && (
                              <View style={styles.comingSoonTag}>
                                <Text style={styles.comingSoonTagText}>Coming soon</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdrop: {
    flex: 1,
  },
  drawer: {
    width: MENU_WIDTH,
    backgroundColor: COLORS.card,
    paddingTop: 56,
    paddingBottom: 40,
    ...SHADOW,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },

  drawerHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  appName: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  appSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },

  navList: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 11,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  navItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  navItemDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: COLORS.primary,
  },
  navText: {
    flex: 1,
  },
  navLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  navLabelActive: {
    color: COLORS.primaryDark,
  },
  navLabelDisabled: {
    color: COLORS.textMuted,
  },
  navDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '400',
    marginTop: 1,
  },
  navDescDisabled: {
    color: COLORS.textMuted,
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },

  // Expandable submenu (Performance Data) — Figma Menu 2 (5213:3049) sub-item list.
  subList: {
    paddingLeft: SPACING.xl + SPACING.sm,
    paddingRight: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: 2,
  },
  subItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 9,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  subDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  subDotActive: {
    backgroundColor: COLORS.primary,
  },
  subDotDisabled: {
    backgroundColor: COLORS.border,
  },
  subLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: COLORS.text,
  },
  subLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  subLabelDisabled: {
    color: COLORS.textMuted,
  },

  comingSoonTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  comingSoonTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.2,
  },
});
