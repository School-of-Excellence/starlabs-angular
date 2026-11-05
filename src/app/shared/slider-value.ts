// A slider answer is a 0-BASED INDEX into that field's `options` (operator, 2026-11-03): 0 is the first
// option, `options.length - 1` the last. The same rule covers the plain `slider` field and the follow-up
// slider a `flippingquestion` adds to a multicheckbox / multiselect.
//
// WHY A HELPER: the number is stored, the LABEL is shown, and the two apps must agree on the mapping. Before
// this, the web ran a slider from 1 to a hardcoded 10 and printed the bare number, while the Flutter app read
// the same number as an index into `options` — so an answer of 7 against three options took the app down.
//
// THE GATE: a value outside the list resolves to the nearest option rather than nothing. Answers written
// before this rule exist with positions the list can no longer hold (the old 1–10 flipping slider) and with
// 1-based positions from the web, so every read is clamped. `null` reads as 0, the first option, which is
// what an untouched slider shows.

/** Whatever a slider field holds → a usable 0-based index into `options`. */
export function sliderPosition(options: any, value: any): number {
  const last = Array.isArray(options) ? options.length - 1 : 0;
  if (last < 0) return 0;
  const position = Math.round(Number(value));
  if (!Number.isFinite(position)) return 0;
  return Math.min(Math.max(position, 0), last);
}

/** The option that index names — what the participant actually reads. */
export function sliderLabel(options: any, value: any): string {
  if (!Array.isArray(options) || options.length === 0) return `${value ?? ''}`;
  return `${options[sliderPosition(options, value)]}`;
}
