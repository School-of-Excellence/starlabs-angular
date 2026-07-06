/**
 * Procedure pseudonym glossary — the AI ATC generator (queue_atc_generation) emits procedure
 * references as pseudo-codes like "A&H Procedure24" / "procedure24" / "A&H_procedure24", where the
 * NUMBER is the stable key (`order`). This maps that number → the real procedure `name`, which
 * equals a Firestore `procedures.name` value (what the app loads as `procedurename`).
 *
 * SOURCE OF TRUTH: atc-finetunning/procedures-cf/src/seed.js (SEED[]). This is a verbatim mirror.
 * The glossary is frozen/curated — regenerate BOTH if the procedure set changes. Do NOT re-derive
 * the number from a live `orderBy("name")` query; the order can drift from this frozen list.
 */
export const PROCEDURE_REALNAME_BY_ORDER: Record<number, string> = {
  1: 'A&H Vitality Booster',
  2: 'Activity',
  3: 'Age Regression Pattern',
  4: 'Alphabet Game',
  5: 'Auditory Submodality Shift',
  6: 'Belief Imprint',
  7: 'Circle of Excellence',
  8: 'Collapse anchor',
  9: 'Directives',
  10: 'Ext Int validation Integration',
  11: 'Fast Phobia Cure',
  12: 'Filter Installation',
  13: 'Future Pacing',
  14: 'Healer Within',
  15: 'JG Pattern',
  16: 'Kinesthetic Submodality Shift',
  17: 'Mirror Validation',
  18: 'NASA Game',
  19: 'On The Field',
  20: 'Parts Integration',
  21: 'Path To Success',
  22: 'Perceptual Positions',
  23: 'Post Vaccination cleanup',
  24: 'Post-Covid cleanup',
  25: 'Propulsion System',
  26: 'Reframing',
  27: 'Reimprint',
  28: 'Reverse FPC',
  29: 'Rhythm of life',
  30: 'Sanctuary',
  31: 'Star Activity',
  32: 'Swish',
  33: 'Two Path Timeline',
  34: 'UnConscious arrangement',
};

/**
 * Resolve an AI procedure pseudo-code to its real procedure name.
 * Handles all spacing/casing variants ("A&H Procedure24", "procedure24", "A&H_procedure24") by
 * extracting the integer — the digits are the stable key, surrounding text is noise.
 * Returns null if the code has no number or the number isn't in the glossary.
 */
export function resolveProcedurePseudonym(code: string): string | null {
  if (!code) return null;
  const digits = String(code).replace(/\D/g, '');
  if (!digits) return null;
  const order = parseInt(digits, 10);
  return PROCEDURE_REALNAME_BY_ORDER[order] ?? null;
}
