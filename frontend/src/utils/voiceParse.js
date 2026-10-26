/**
 * Pure speech-transcript parsing for useVoiceFieldControl (no React / native imports, so it can
 * be unit-tested in plain Node).
 *
 * Handles: field-name matching (label + aliases), pairing every spoken number with its
 * neighbouring field in either order, and spoken unit words ("elevation 500 meters",
 * "temperature fahrenheit 59") so units can be changed by voice.
 */

// Longest label/alias first, so e.g. "copilot weight" isn't shadowed by "pilot weight".
export const matchEntry = (transcript, entries) => {
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

// Finds every field whose label/alias occurs in the transcript, matching each entry at most once
// (its longest alias, at the first occurrence not already claimed by a longer match).
export const findAllMatches = (transcript, entries) => {
  const candidates = entries
    .flatMap((e) => [
      { e, text: e.label },
      ...((e.aliases || []).map((a) => ({ e, text: a }))),
    ])
    .filter((c) => c.text && c.text.length > 0)
    .map((c) => ({ e: c.e, text: c.text.toLowerCase() }))
    .sort((a, b) => b.text.length - a.text.length);

  const claimed = [];
  const overlapsClaimed = (start, end) => claimed.some((r) => start < r[1] && end > r[0]);
  const matchedEntries = new Set();
  const matches = [];
  for (const { e, text } of candidates) {
    if (matchedEntries.has(e)) continue;
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

// ASR often drops or re-spaces the "co" in "co-pilot"; normalise every spelling to one word.
export const normalizeTranscript = (t) => t.replace(/\bco[\s-]+pilot\b/g, 'copilot');

// Spoken words for each unit code used in the app.
export const UNIT_WORDS = {
  ft: ['feet', 'foot', 'ft'],
  m: ['meters', 'meter', 'metres', 'metre'],
  C: ['celsius', 'centigrade', 'degrees c'],
  F: ['fahrenheit', 'degrees f'],
  kg: ['kilograms', 'kilogram', 'kilos', 'kilo', 'kg'],
  lb: ['pounds', 'pound', 'lbs', 'lb'],
  hPa: ['hectopascals', 'hectopascal', 'millibars', 'millibar', 'hpa'],
  mmHg: ['millimeters of mercury', 'millimetres of mercury', 'mm of mercury', 'mmhg', 'mercury'],
  L: ['litres', 'litre', 'liters', 'liter'],
};

// Finds unit words in the transcript → [{ unit, index }] (longest phrase first, no overlaps).
export const findUnits = (transcript) => {
  const cands = Object.entries(UNIT_WORDS)
    .flatMap(([unit, words]) => words.map((w) => ({ unit, w })))
    .sort((a, b) => b.w.length - a.w.length);
  const claimed = [];
  const found = [];
  for (const { unit, w } of cands) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    let m = re.exec(transcript);
    while (m) {
      const s = m.index;
      const e = s + w.length;
      if (!claimed.some((r) => s < r[1] && e > r[0])) {
        claimed.push([s, e]);
        found.push({ unit, index: s });
      }
      m = re.exec(transcript);
    }
  }
  return found.sort((a, b) => a.index - b.index);
};

/**
 * Reads every field mention, number and unit word in the transcript, in spoken order.
 * Returns { commits, lastFieldKey, fallbackEligible } where each commit is
 *   { key: string|null, value: number|null, unit: string|null }
 * - value null = a unit-only change ("elevation meters"), no number spoken.
 * - A unit word is only honoured for a field that lists it in `field.units` (when declared).
 */
export const pairFieldsWithNumbers = (transcript, fields) => {
  const fieldMatches = findAllMatches(transcript, fields);
  const numberMatches = [...transcript.matchAll(/-?\d+(\.\d+)?/g)]
    .map((m) => ({ type: 'number', value: parseFloat(m[0]), index: m.index }));
  const unitMatches = findUnits(transcript).map((u) => ({ type: 'unit', unit: u.unit, index: u.index }));

  const tokens = [
    ...fieldMatches.map((f) => ({ type: 'field', entry: f.e, index: f.index })),
    ...numberMatches,
  ].sort((a, b) => a.index - b.index);

  const consumed = new Array(tokens.length).fill(false);
  const commits = [];
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
    commits.push({ key: targetKey, value: t.value, unit: null, index: t.index });
    if (targetKey) lastFieldKey = targetKey;
  });

  const fieldByKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const allows = (key, unit) => {
    const f = fieldByKey[key];
    return !!f && Array.isArray(f.units) && f.units.includes(unit);
  };

  // Attach each unit word to the nearest commit whose field accepts it.
  const loneUnits = [];
  unitMatches.forEach((u) => {
    let best = null;
    commits.forEach((c) => {
      if (c.unit || !c.key || !allows(c.key, u.unit)) return;
      const d = Math.abs(c.index - u.index);
      if (!best || d < best.d) best = { c, d };
    });
    if (best) { best.c.unit = u.unit; return; }
    // No number to carry it: attach to the nearest field mentioned (or the last named one).
    let nearest = null;
    fieldMatches.forEach((f) => {
      if (!allows(f.e.key, u.unit)) return;
      const d = Math.abs(f.index - u.index);
      if (!nearest || d < nearest.d) nearest = { key: f.e.key, d };
    });
    if (nearest) loneUnits.push({ key: nearest.key, value: null, unit: u.unit });
    else loneUnits.push({ key: null, value: null, unit: u.unit });
  });

  const strippedOfNumbers = transcript.replace(/-?\d+(\.\d+)?/g, '').trim();
  const fallbackEligible = fieldMatches.length === 0 && strippedOfNumbers.length === 0;
  return {
    commits: [...commits.map(({ key, value, unit }) => ({ key, value, unit })), ...loneUnits],
    lastFieldKey,
    fallbackEligible,
    fieldMatches,
  };
};
