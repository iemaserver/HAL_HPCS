/**
 * Shared "press mic, say a field name, say a value" voice control hook.
 *
 * Matches the client's original spec (PPT slide 4):
 *   "BY CLICKING MIKE BUTTON USER SHOULD BE ABLE TO SELECT A BUTTON OR ENTER
 *    NUMERIC VALUE IN SUBSEQUENT PAGES... IF USER SAYS ELEVATION CURSOR SHOULD
 *    GO TO ELEVATION PLACE, IF HE SAYS QNH IT SHOULD GO TO QNH PLACE."
 *
 * Flow: press mic once -> continuous listening starts -> saying a field's
 * label (or one of its aliases) moves the "active field" there -> saying a
 * number commits it into whichever field is currently active -> saying an
 * "option" label (e.g. an aircraft name, or a button like "compute") fires
 * that option's action directly, independent of field focus.
 *
 * This hook is deliberately UI-agnostic: it does NOT know about unit
 * conversion, AppState, or navigation. Each screen supplies its own `fields`/
 * `options` lists and an `onCommitValue(fieldKey, number)` callback that
 * knows how to convert/store the value for that specific field.
 *
 * Speech recognition is inherently probabilistic — matching is a best-effort
 * substring match against label + aliases, not a guarantee. Screens should
 * supply generous `aliases` for fields whose labels are unusual to say aloud
 * (e.g. "QNH", "JPT", "PA/Zp0").
 */
import { useCallback, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, nativeSpeechAvailable,
} from '../utils/speech';

const RECOGNIZE_OPTS = { lang: 'en-US', continuous: true, interimResults: false };

// Longest label/alias first, so e.g. "copilot weight" isn't shadowed by "pilot weight".
const matchEntry = (transcript, entries) => {
  const candidates = entries
    .flatMap((e) => [
      { e, text: e.label },
      ...((e.aliases || []).map((a) => ({ e, text: a }))),
    ])
    .filter((c) => c.text && c.text.length > 0)
    .sort((a, b) => b.text.length - a.text.length);
  for (const { e, text } of candidates) {
    if (transcript.includes(text.toLowerCase())) return e;
  }
  return null;
};

export function useVoiceFieldControl({ fields = [], options = [], onCommitValue } = {}) {
  const [listening, setListening] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState(null);
  const activeFieldRef = useRef(null); // avoids stale closures in event handlers
  const listeningRef = useRef(false); // ditto — 'end' handler needs the live value, not the render-time one

  const setActive = useCallback((key) => {
    activeFieldRef.current = key;
    setActiveFieldKey(key);
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = (event.results?.[0]?.transcript || '').toLowerCase().trim();
    if (!transcript) return;

    // Options (buttons / selectable items) take priority and fire immediately,
    // independent of whatever field currently has focus.
    const optionMatch = matchEntry(transcript, options);
    if (optionMatch) {
      optionMatch.onSelect();
      return;
    }

    // A field name in the transcript moves focus there.
    const fieldMatch = matchEntry(transcript, fields);
    if (fieldMatch) setActive(fieldMatch.key);

    // A number in the same (or a later) utterance commits into whichever
    // field is now active — handles both "elevation fifteen hundred" in one
    // breath and "elevation" ... "fifteen hundred" across two.
    const numMatch = transcript.match(/-?\d+(\.\d+)?/);
    const targetKey = fieldMatch ? fieldMatch.key : activeFieldRef.current;
    if (numMatch && targetKey && onCommitValue) {
      onCommitValue(targetKey, parseFloat(numMatch[0]));
    }
  });

  useSpeechRecognitionEvent('end', () => {
    // Some Android implementations end the recognition session after a short
    // silence even with continuous:true — auto-restart while the user hasn't
    // explicitly pressed stop, so listening genuinely feels continuous.
    if (listeningRef.current) {
      try { ExpoSpeechRecognitionModule.start(RECOGNIZE_OPTS); } catch (_) { /* ignore */ }
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    listeningRef.current = false;
    setListening(false);
    Toast.show({
      type: 'error', text1: 'Voice error', text2: e?.message || 'Recognition failed', position: 'top',
    });
  });

  const start = useCallback(async () => {
    if (!nativeSpeechAvailable) {
      Toast.show({
        type: 'info', text1: 'Voice requires a dev build', text2: 'Use the keypad instead', position: 'top',
      });
      return;
    }
    try {
      const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error', text1: 'Microphone permission denied', text2: 'Enable it in device Settings', position: 'top',
        });
        return;
      }
      listeningRef.current = true;
      setListening(true);
      ExpoSpeechRecognitionModule.start(RECOGNIZE_OPTS);
    } catch (e) {
      listeningRef.current = false;
      setListening(false);
      Toast.show({ type: 'error', text1: 'Voice unavailable', text2: String(e?.message || e), position: 'top' });
    }
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    try { ExpoSpeechRecognitionModule.stop(); } catch (_) { /* ignore */ }
  }, []);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop(); else start();
  }, [start, stop]);

  return {
    listening, activeFieldKey, start, stop, toggle, setActiveField: setActive,
  };
}
