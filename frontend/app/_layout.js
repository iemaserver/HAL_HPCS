import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import { AppStateProvider } from '../src/store/AppState';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <SafeAreaProvider>
        <AppStateProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="airframe" />
            <Stack.Screen name="wizard" />
            <Stack.Screen name="review" />
            <Stack.Screen name="results" />
            <Stack.Screen name="reports" />
            <Stack.Screen name="settings" />
          </Stack>
          <Toast />
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
