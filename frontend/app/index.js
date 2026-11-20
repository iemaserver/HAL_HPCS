import { useEffect } from 'react';
import {
  View, Text, Image, StyleSheet, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle } from 'lucide-react-native';

// Long enough to read the BETA disclaimer before moving on to Select Airframe.
const SPLASH_DURATION_MS = 3500;

// Client 20-Nov-26: the app is called "Chet Cal C"; this screen shows the logo, the name and the
// BETA disclaimer, then goes straight to helicopter selection. It follows the native Android
// splash (logo on light blue, app.json / expo-splash-screen), whose logo size is limited by
// Android 12+ — the client agreed to keep it as it is.
export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/airframe');
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.root} testID="splash-screen">
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#82DBF8', '#FFFFFF', '#C5EEFD', '#84DDF9']}
        locations={[0, 0.3, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <Image
          source={require('../assets/logos/hal-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.nameBlock}>
          <Text style={styles.fleet}>Chetak ▪ Cheetah ▪ Cheetal</Text>
          <Text style={styles.appName} testID="splash-app-name">Chet Cal C</Text>
        </View>
      </View>

      <View style={styles.disclaimer} testID="beta-disclaimer">
        <AlertTriangle size={22} color="#D97706" />
        <Text style={styles.disclaimerText}>BETA VERSION - ALL VALUES TO BE RECHECKED</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EAF6FF' },
  content: { flex: 1, alignItems: 'center', paddingTop: '26%' },
  logo: { width: 300, height: 186 },
  nameBlock: { alignItems: 'center', marginTop: 96, gap: 14 },
  fleet: { fontSize: 22, fontWeight: '500', color: '#0F2A43', letterSpacing: 0.2 },
  appName: { fontSize: 46, fontWeight: '800', color: '#0284C7', letterSpacing: 0.5 },
  disclaimer: {
    position: 'absolute', left: 20, right: 20, bottom: 64,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FEF3C7', borderWidth: 1.5, borderColor: '#D97706',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  disclaimerText: {
    flex: 1, fontSize: 13, fontWeight: '800', color: '#92400E', letterSpacing: 0.4,
  },
});
