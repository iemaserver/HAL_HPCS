/**
 * Safe wrapper around expo-speech-recognition.
 * The native module only exists in a custom dev build — not in Expo Go.
 * Wrapping in try/catch lets the app run in Expo Go (voice disabled)
 * and work fully in a proper dev/release build.
 */
import { useEffect } from 'react';

let _module = null;
let _useEvent = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('expo-speech-recognition');
  _module = pkg.ExpoSpeechRecognitionModule;
  _useEvent = pkg.useSpeechRecognitionEvent;
} catch (_) {
  // Native module not available (Expo Go) — voice will be disabled
}

export const nativeSpeechAvailable = _module !== null;

export const ExpoSpeechRecognitionModule = _module;

/**
 * Drop-in replacement for useSpeechRecognitionEvent.
 * On Expo Go (no native module) this is a stable no-op that satisfies
 * React's rules of hooks by always calling useEffect with the same arity.
 */
export function useSpeechRecognitionEvent(event, handler) {
  if (_useEvent) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    _useEvent(event, handler);
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {}, []);
  }
}
