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
 * This is a hands-free/offline-first control surface (cockpit checklist use,
 * possibly with no signal), so recognition always requests the device's
 * on-device engine (`requiresOnDeviceRecognition`) rather than a cloud one —
 * see `start()` below for the one-time offline-model download this implies
 * on Android.
 */
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
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

// Finds every field whose label/alias literally occurs in the transcript,
// matching each entry at most once (its longest alias, at the first
// occurrence not already claimed by a longer match). This lets a single
// utterance like "fuel two hundred load fifty" address both fields instead
// of the longest/first match winning outright and swallowing the rest —
// and it keeps a short alias (e.g. "pilot") from matching text that's really
// just an embedded substring of a longer one already claimed (e.g.
// "copilot weight").
const findAllMatches = (transcript, entries) => {
  const candidates = entries
    .flatMap((e) => [
      { e, text: e.label },
      ...((e.aliases || []).map((a) => ({ e, text: a }))),
    ])
    .filter((c) => c.text && c.text.length > 0)
    .map((c) => ({ e: c.e, text: c.text.toLowerCase() }))
    .sort((a, b) => b.text.length - a.text.length);

  const claimed = []; // [start, end) ranges already attributed to an entry
  const overlapsClaimed = (start, end) => claimed.some((r) => start < r[1] && end > r[0]);
  const matchedEntries = new Set();
  const matches = [];
  for (const { e, text } of candidates) {
    if (matchedEntries.has(e)) continue; // entry already matched via a longer alias
    let idx = transcript.indexOf(text);
    while (idx !== -1 && overlapsClaimed(idx, idx + text.length)) {
      idx = transcript.indexOf(text, idx + 1);
    }
    if (idx !== -1) {
      claimed.push([idx, idx + text.length]);
      matchedEntries.add(e);
      matches.push({ e, index: idx });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
};

// ASR frequently drops or re-spaces the unstressed "co" in "co-pilot" (e.g.
// hearing it as plain "pilot"). Normalizing every spelling to one word keeps
// it matching "copilot"'s own aliases instead of silently falling back to
// the separate (and also valid) "pilot" alias.
const normalizeTranscript = (t) => t.replace(/\bco[\s-]+pilot\b/g, 'copilot');

// Reads every field mention and every number in the transcript, in the order
// they were spoken, and pairs each number with whichever field is its
// immediate neighbor — the field spoken right before it ("fuel two hundred")
// or, just as validly, the field spoken right after it ("two hundred fuel").
// A field already claimed by one number is skipped when looking at the next
// one, so a whole chain said in one breath resolves correctly regardless of
// which order each pair uses ("fuel 200 load 50" and "200 fuel 50 load" both
// commit fuel=200, load=50). A number with no adjacent field mention at all
// falls back to whichever field was named most recently in this utterance;
// if none was, its commit carries a null key and the caller falls back
// further, to whichever field was left active by a previous utterance — so
// "elevation" ... "1500" across two separate results still works.
const pairFieldsWithNumbers = (transcript, fields) => {
  const fieldMatches = findAllMatches(transcript, fields);
  const numberMatches = [...transcript.matchAll(/-?\d+(\.\d+)?/g)]
    .map((m) => ({ type: 'number', value: parseFloat(m[0]), index: m.index }));
  const tokens = [
    ...fieldMatches.map((f) => ({ type: 'field', entry: f.e, index: f.index })),
    ...numberMatches,
  ].sort((a, b) => a.index - b.index);

  const consumed = new Array(tokens.length).fill(false);
  const commits = []; // { key: string|null, value: number } — null key = use the fallback
  let lastFieldKey = null;
  tokens.forEach((t, i) => {
    if (t.type === 'field') { lastFieldKey = t.entry.key; return; }
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    let targetKey;
    if (prev?.type === 'field' && !consumed[i - 1]) {
      targetKey = prev.entry.key;
      consumed[i - 1] = true;
    } else if (next?.type === 'field' && !consumed[i + 1]) {
      targetKey = next.entry.key;
      consumed[i + 1] = true;
    } else {
      targetKey = lastFieldKey;
    }
    commits.push({ key: targetKey, value: t.value });
    if (targetKey) lastFieldKey = targetKey;
  });
  // A bare-number commit (key still null after the pairing above) is only
  // eligible to fall back to whichever field a *previous* utterance left
  // active when this utterance, once every number is stripped out, said
  // nothing else at all (a plain "1200"). If a field name was attempted but
  // didn't resolve, or there's other leftover speech ("90pa", "weight 120"),
  // this was a specific, failed attempt at something else — it must not
  // silently land on (and overwrite) whatever field was active before.
  const strippedOfNumbers = transcript.replace(/-?\d+(\.\d+)?/g, '').trim();
  const fallbackEligible = fieldMatches.length === 0 && strippedOfNumbers.length === 0;
  return { commits, lastFieldKey, fallbackEligible };
};

export function useVoiceFieldControl({ fields = [], options = [], onCommitValue } = {}) {
  const [listening, setListening] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState(null);
  const activeFieldRef = useRef(null); // avoids stale closures in event handlers
  const listeningRef = useRef(false); // ditto — 'end' handler needs the live value, not the render-time one
  const recognizeOptsRef = useRef(RECOGNIZE_OPTS); // last options start() resolved, for the 'end' auto-restart
  const offlineModelRequestedRef = useRef(false); // avoid re-triggering the download every restart

  const setActive = useCallback((key) => {
    activeFieldRef.current = key;
    setActiveFieldKey(key);
  }, []);

  const consecutiveErrorsRef = useRef(0);

  useSpeechRecognitionEvent('result', (event) => {
    consecutiveErrorsRef.current = 0; // a successful result proves the engine is currently healthy
    const raw = (event.results?.[0]?.transcript || '').toLowerCase().trim();
    if (!raw) return;
    const transcript = normalizeTranscript(raw);

    // Options (buttons / selectable items) take priority and fire immediately,
    // independent of whatever field currently has focus.
    const optionMatch = matchEntry(transcript, options);
    if (optionMatch) {
      optionMatch.onSelect();
      return;
    }

    // Pair every number in this utterance with its neighboring field — in
    // either spoken order — so both "fuel two hundred" and "two hundred
    // fuel" work, including several pairs chained in one breath.
    const { commits, lastFieldKey, fallbackEligible } = pairFieldsWithNumbers(transcript, fields);
    let dropped = false;
    commits.forEach(({ key, value }) => {
      // No field was adjacent to this number at all — fall back to whichever
      // field a previous utterance left active ("elevation" ... "1500"), but
      // only when this utterance was a bare number with nothing else said;
      // a failed, specific attempt ("90pa", "weight 120") must not silently
      // overwrite that old active field instead.
      const targetKey = key || (fallbackEligible ? activeFieldRef.current : null);
      if (targetKey && onCommitValue) {
        onCommitValue(targetKey, value);
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

      // This is meant to work hands-free with no signal (cockpit use), so
      // prefer the on-device engine over the cloud one whenever it's ready.
      const offlineReady = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.() ?? false;
      if (!offlineReady && Platform.OS === 'android' && !offlineModelRequestedRef.current) {
        // No offline model installed yet — kick off a one-time download so
        // future sessions don't need a network connection. This call itself
        // still needs one, and this session falls back to online in the
        // meantime rather than blocking the user.
        offlineModelRequestedRef.current = true;
        ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: RECOGNIZE_OPTS.lang }).catch(() => {});
        Toast.show({
          type: 'info', text1: 'Downloading offline voice model…', text2: 'Voice works online for now', position: 'top',
        });
      }

      recognizeOptsRef.current = { ...RECOGNIZE_OPTS, requiresOnDeviceRecognition: offlineReady };
      listeningRef.current = true;
      setListening(true);
      ExpoSpeechRecognitionModule.start(recognizeOptsRef.current);
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
