/* The product editor's options and variants, as plain functions (unit-tested in variants.test.js). The server checks
   everything again (ProductService): at most 3 options, 30 values each, 100 variants, every combination once. */

export const MAX_OPTIONS = 3;
export const MAX_VALUES = 30;
export const MAX_VARIANTS = 100;
/** Names that suit gear, offered as suggestions (any name is allowed). */
export const OPTION_NAMES = ['Colour', 'Size', 'Dimensions', 'Model', 'Edition', 'Storage', 'Platform'];

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Options as they'll be saved: trimmed names and values, empty ones and repeats left out. */
export function cleanOptions(options) {
  return options
    .map((o) => {
      const seen = new Set();
      const values = o.values.map((v) => String(v).trim()).filter((v) => v && !seen.has(norm(v)) && seen.add(norm(v)));
      return { name: String(o.name).trim(), values };
    })
    .filter((o) => o.name && o.values.length);
}

/** One key per combination, whatever the case or spacing ("colour:black|size:m"). */
export const comboKey = (options) => Object.entries(options || {}).map(([k, v]) => `${norm(k)}:${norm(v)}`).sort().join('|');

/** Every combination of the options' values, in order (Black/S, Black/M, White/S…). */
export function combinations(options) {
  const clean = cleanOptions(options);
  if (!clean.length) return [];
  return clean.reduce((acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name]: v }))), [{}]);
}

/** The combinations not yet in the variant list (what "Add missing combinations" would add). */
export function missingCombinations(options, variants) {
  const have = new Set(variants.map((v) => comboKey(v.options)));
  return combinations(options).filter((c) => !have.has(comboKey(c)));
}

/** Row indexes that repeat an earlier row's combination (each combination can only be sold once). */
export function duplicateRows(variants) {
  const seen = new Map();
  const dup = new Set();
  variants.forEach((v, i) => { const k = comboKey(v.options); if (seen.has(k)) dup.add(i); else seen.set(k, i); });
  return dup;
}

/** A variant's options once an option was renamed or a value removed: renamed keys follow, removed values empty. */
export function remapOptions(options, before, after) {
  const out = {};
  after.forEach((o, i) => {
    const old = before[i]?.name;
    const value = old != null ? options[old] : options[o.name];
    out[o.name] = o.values.some((v) => norm(v) === norm(value)) ? o.values.find((v) => norm(v) === norm(value)) : '';
  });
  return out;
}

/** "Black / 140 cm" in the options' order. */
export const comboLabel = (options, combo) => options.map((o) => combo?.[o.name]).filter(Boolean).join(' / ');
