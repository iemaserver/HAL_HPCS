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
 *
 * Recognition uses the device's on-device engine only when its language pack is ALREADY
 * installed; otherwise it uses the normal online engine. It never starts a model download by
 * itself (that used to re-trigger "downloading voice model" on every launch/screen).
 *
 * Reliability (client round 12-Oct-26):
 *   - only the screen that started listening reacts to speech (background screens ignore it),
 *   - listening stops when the screen loses focus and after IDLE_STOP_MS of silence, so the
 *     mic doesn't keep restarting (and beeping) forever,
 *   - field names are acted on from interim results so the cursor jumps place-to-place at once,
 *   - spoken units ("meters", "fahrenheit", "pounds"...) change the field's unit.
 */
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from 'expo-router';
import {
  matchEntry, findAllMatches, normalizeTranscript, pairFieldsWithNumbers,
} from '../utils/voiceParse';
import {
  ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, nativeSpeechAvailable,
} from '../utils/speech';

// Stop listening after this long with no speech at all, so the mic can't run (and beep on
// every internal restart) indefinitely.
const IDLE_STOP_MS = 30000;

const RECOGNIZE_OPTS = {
  lang: 'en-US',
  continuous: true,
  interimResults: true,
  // Longer silence windows mean the recogniser ends (and re-beeps) less often.
  androidIntentOptions: {
    EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
    EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
  },
};

export function useVoiceFieldControl({
  fields = [], options = [], onCommitValue, onUnitChange, micEnabled = true,
  fireOptionsOnInterim = false,
} = {}) {
  const [listening, setListening] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState(null);
  const activeFieldRef = useRef(null); // avoids stale closures in event handlers
  const listeningRef = useRef(false); // ditto — 'end' handler needs the live value, not the render-time one
  const recognizeOptsRef = useRef(RECOGNIZE_OPTS); // last options start() resolved, for the 'end' auto-restart
  const idleTimerRef = useRef(null);
  const lastFiredRef = useRef({ key: null, at: 0 }); // de-dupes an option heard in interim AND final

  const setActive = useCallback((key) => {
    activeFieldRef.current = key;
    setActiveFieldKey(key);
  }, []);

  const consecutiveErrorsRef = useRef(0);

  const stopRef = useRef(() => {});

  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!listeningRef.current) return;
      stopRef.current();
      Toast.show({
        type: 'info', text1: 'Microphone stopped', text2: 'No speech heard — tap the mic to resume', position: 'top',
      });
    }, IDLE_STOP_MS);
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    // Speech events are global: every mounted screen's hook receives them. Only the screen that
    // actually started listening may act, otherwise values land on hidden screens.
    if (!listeningRef.current) return;
    consecutiveErrorsRef.current = 0; // a successful result proves the engine is currently healthy
    const raw = (event.results?.[0]?.transcript || '').toLowerCase().trim();
    if (!raw) return;
    armIdleTimer();
    const transcript = normalizeTranscript(raw);

    // Interim (partial) result: only move the cursor to a named field, instantly. Values and
    // button actions wait for the final result so nothing fires twice.
    if (event.isFinal === false) {
      const matches = findAllMatches(transcript, fields);
      if (matches.length > 0) setActive(matches[matches.length - 1].e.key);
      if (fireOptionsOnInterim) {
        const hit = matchEntry(transcript, options);
        if (hit) {
          lastFiredRef.current = { key: hit.key, at: Date.now() };
          hit.onSelect();
        }
      }
      return;
    }

    // Options (buttons / selectable items) take priority and fire immediately,
    // independent of whatever field currently has focus.
    const optionMatch = matchEntry(transcript, options);
    if (optionMatch) {
      const last = lastFiredRef.current;
      const dup = last.key === optionMatch.key && Date.now() - last.at < 3000;
      if (!dup) {
        lastFiredRef.current = { key: optionMatch.key, at: Date.now() };
        optionMatch.onSelect();
      }
      return;
    }

    // Pair every number in this utterance with its neighboring field — in
    // either spoken order — so both "fuel two hundred" and "two hundred
    // fuel" work, including several pairs chained in one breath.
    const { commits, lastFieldKey, fallbackEligible } = pairFieldsWithNumbers(transcript, fields);
    let dropped = false;
    commits.forEach(({ key, value, unit }) => {
      // No field was adjacent to this number at all — fall back to whichever
      // field a previous utterance left active ("elevation" ... "1500"), but
      // only when this utterance was a bare number with nothing else said;
      // a failed, specific attempt ("90pa", "weight 120") must not silently
      // overwrite that old active field instead.
      const targetKey = key || (fallbackEligible ? activeFieldRef.current : null);
      if (targetKey && unit && onUnitChange) onUnitChange(targetKey, unit);
      if (targetKey && value === null) {
        // unit-only utterance ("elevation meters") — nothing to commit
        if (!unit) dropped = true;
      } else if (targetKey && onCommitValue) {
        onCommitValue(targetKey, value, unit || undefined);
      } else {
        dropped = true; // heard a number but had nowhere to put it — was silent before
      }
    });
    if (dropped) {
      Toast.show({
        type: 'info', text1: 'Didn’t catch the field', text2: 'Say the field name with the number', position: 'top',
      });
    }

    // Whatever field was named last stays active, so a later bare number
    // in a follow-up utterance still lands somewhere sensible.
    if (lastFieldKey) setActive(lastFieldKey);
  });

  useSpeechRecognitionEvent('end', () => {
    // Some Android implementations end the recognition session after a short
    // silence even with continuous:true, and Android also emits 'end' right
    // after an 'error' — auto-restart while the user hasn't explicitly
    // pressed stop, so listening genuinely feels continuous. This is the
    // ONLY place that calls start() to restart — the 'error' handler below
    // never does, since both firing back-to-back raced two start() calls
    // against each other and crashed the native recognizer with "Bad file
    // descriptor". A short cooldown before restarting gives the previous
    // session time to actually tear down first.
    if (!listeningRef.current) return;
    setTimeout(() => {
      if (!listeningRef.current) return; // stopped during the cooldown
      try {
        ExpoSpeechRecognitionModule.start(recognizeOptsRef.current);
      } catch (_) {
        listeningRef.current = false;
        setListening(false);
        Toast.show({ type: 'error', text1: 'Voice unavailable', text2: 'Recognition failed to restart', position: 'top' });
      }
    }, 300);
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!listeningRef.current) return; // a stale event from a session the user already stopped

    // Only a real, unrecoverable problem (no mic permission, no working mic)
    // should stop listening and alarm the user. Everything else — including
    // Android's on-device engine occasionally dropping its own connection
    // ("server disconnected") — is treated as recoverable: retry, silently
    // falling back from on-device to online after repeated failures rather
    // than leaving a hands-free session dead without the user touching it.
    if (e?.error === 'not-allowed' || e?.error === 'audio-capture') {
      listeningRef.current = false;
      setListening(false);
      Toast.show({
        type: 'error',
        text1: e.error === 'not-allowed' ? 'Microphone permission denied' : 'Microphone unavailable',
        text2: e?.message || 'Recognition failed',
        position: 'top',
      });
      return;
    }

    consecutiveErrorsRef.current += 1;

    if (recognizeOptsRef.current.requiresOnDeviceRecognition && consecutiveErrorsRef.current >= 2) {
      // On-device recognition is unreliable on this device/build — drop to
      // the online engine for the rest of this session instead of retrying
      // the same failure forever.
      recognizeOptsRef.current = { ...RECOGNIZE_OPTS, requiresOnDeviceRecognition: false };
      consecutiveErrorsRef.current = 0;
      Toast.show({
        type: 'info', text1: 'Offline voice unstable here', text2: 'Switched to online for this session', position: 'top',
      });
    } else if (consecutiveErrorsRef.current > 5) {
      // Even online it keeps failing — stop rather than retry forever.
      listeningRef.current = false;
      setListening(false);
      Toast.show({
        type: 'error', text1: 'Voice error', text2: e?.message || 'Recognition kept failing', position: 'top',
      });
      return;
    }

    // Don't restart here — leave listeningRef.current true and let the
    // 'end' event (which Android fires right after 'error' too) do the one
    // actual restart, with its cooldown. See the 'end' handler's comment.
  });

  const start = useCallback(async () => {
    consecutiveErrorsRef.current = 0;
    // App-wide mic kill switch (client spec) — independent of the OS mic permission, and
    // checked fresh on every press so flipping it off mid-session takes effect immediately.
    if (!micEnabled) {
      Toast.show({
        type: 'info', text1: 'Microphone is off', text2: 'Turn it back on from the menu', position: 'top',
      });
      return;
    }
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

      // Use the on-device engine only if its language pack is already installed; otherwise
      // fall back to the online engine. We deliberately never trigger a model download here.
      const offlineReady = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.() ?? false;

      recognizeOptsRef.current = { ...RECOGNIZE_OPTS, requiresOnDeviceRecognition: offlineReady };
      listeningRef.current = true;
      setListening(true);
      armIdleTimer();
      ExpoSpeechRecognitionModule.start(recognizeOptsRef.current);
    } catch (e) {
      listeningRef.current = false;
      setListening(false);
      Toast.show({ type: 'error', text1: 'Voice unavailable', text2: String(e?.message || e), position: 'top' });
    }
  }, [micEnabled, armIdleTimer]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    try { ExpoSpeechRecognitionModule.stop(); } catch (_) { /* ignore */ }
  }, []);

  stopRef.current = stop;

  // Leaving the screen (or the app going to background navigation) stops the mic, so it can't
  // keep listening/beeping behind another page.
  useFocusEffect(useCallback(() => () => { if (listeningRef.current) stop(); }, [stop]));

  const toggle = useCallback(() => {
    if (listeningRef.current) stop(); else start();
  }, [start, stop]);

  // If the mic kill switch is flipped off mid-session, stop listening immediately rather
  // than waiting for the next press.
  useEffect(() => {
    if (!micEnabled && listeningRef.current) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micEnabled]);

  return {
    listening, activeFieldKey, start, stop, toggle, setActiveField: setActive,
  };
}
