import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Animated, StyleSheet,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  X, Calculator, PlaneTakeoff, FolderClock, Settings, ChevronRight,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../constants/theme';

const MENU_WIDTH = 270;

const NAV_ITEMS = [
  {
    label: 'Hover Calculator',
    desc: 'Inputs & live performance outputs',
    route: '/calculator',
    Icon: Calculator,
  },
  {
    label: 'Select Aircraft',
    desc: 'Chetak · Cheetah · Cheetal',
    route: '/airframe',
    Icon: PlaneTakeoff,
  },
  {
    label: 'Saved Reports',
    desc: 'View and share past calculations',
    route: '/reports',
    Icon: FolderClock,
  },
  {
    label: 'Settings',
    desc: 'Edit formulas and aircraft defaults',
    route: '/settings',
    Icon: Settings,
  },
];

export default function AppMenu({ visible, onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const slideAnim = useRef(new Animated.Value(MENU_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : MENU_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (route) => {
    onClose();
    setTimeout(() => router.push(route), 180);
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
            {NAV_ITEMS.map(({ label, desc, route, Icon }) => {
              const active = pathname === route;
              return (
                <TouchableOpacity
                  key={route}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => navigate(route)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                    <Icon size={17} color={active ? '#fff' : COLORS.primary} />
                  </View>
                  <View style={styles.navText}>
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
                    <Text style={styles.navDesc} numberOfLines={1}>{desc}</Text>
                  </View>
                  {!active && <ChevronRight size={14} color={COLORS.border} />}
                </TouchableOpacity>
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
  navLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  navLabelActive: {
    color: COLORS.primaryDark,
  },
  navDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '400',
    marginTop: 1,
  },
});
