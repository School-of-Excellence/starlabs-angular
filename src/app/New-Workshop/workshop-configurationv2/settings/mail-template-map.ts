/**
 * Settings → Mail template → "Email template": which approved Postmark template a
 * workshop sends, and what fills each of its variables.
 *
 * Stored in `workshopsettings/{workshop id}` as
 *   mail: {
 *     templateid: <email templates document id>,
 *     emailData: { <variable>: { type: 'name' | 'workshopname' | 'workshopurl' }
 *                            | { type: 'static', value: <text> } }
 *   }
 * Keyed by variable, like Postmark's TemplateModel, so the sender can build the model
 * straight from it (operator's choice, 2026-11-17). Nothing reads it yet.
 *
 * For whoever writes the sender:
 *  - Keys are the names exactly as recorded in the template's variable list. A dotted name
 *    such as `person.name` is ONE literal key here; Postmark resolves it only if the sender
 *    nests it into `{ person: { name } }`.
 *  - Mustache section tags (`{{#items}}…{{/items}}`, `{{^flag}}`, `{{#each x}}`) get no entry,
 *    so data a section iterates over is not supplied from here. A field used only inside a
 *    section still gets a top-level entry.
 */

/** What fills one template variable when the email goes out. */
export type MailSource = 'name' | 'workshopname' | 'workshopurl' | 'static';

export interface MailVarValue { type: MailSource; value?: string; }
export type MailEmailData = Record<string, MailVarValue>;

export interface MailTemplateOption {
  id: string;
  name: string;
  variables: string[];
  /** False when the template has no variable list at all (some editors never record one). */
  variablesRecorded: boolean;
  active: boolean;
  approved: boolean;
}

export const MAIL_TEMPLATES_COLLECTION = 'email templates';
export const WORKSHOP_SETTINGS_COLLECTION = 'workshopsettings';

export const MAIL_SOURCES: { key: MailSource; label: string; hint: string }[] = [
  { key: 'name', label: 'Name', hint: "The person's name" },
  { key: 'workshopname', label: 'Workshop name', hint: "This workshop's name" },
  { key: 'workshopurl', label: 'Workshop URL', hint: 'The link to this workshop' },
  { key: 'static', label: 'Static value', hint: 'The text typed here, the same for everyone' },
];
const SOURCE_KEYS = new Set<string>(MAIL_SOURCES.map(s => s.key));

/**
 * The variables worth a row, in template order. Each name appears once, because the map is
 * keyed by variable. `{{{name}}}` and `{{& name}}` are the variable `name`. Mustache control
 * tags (`#each`, `/each`, `^x`, `>partial`, `!comment`) are not variables.
 */
/** Firestore refuses to store a key that begins and ends with `__`, so such a variable can never be saved. */
const RESERVED_KEY = /^__.*__$/;

export function templateVariables(model: unknown): string[] {
  if (!Array.isArray(model)) return [];
  const out: string[] = [];
  for (const raw of model) {
    if (typeof raw !== 'string') continue;
    const v = raw.trim().replace(/^[{&]+\s*/, '').replace(/\s*}+$/, '').trim();
    if (!v || /^[#/^>!]/.test(v) || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

export function templateFromDoc(id: string, d: any): MailTemplateOption {
  const name = (d?.templatename ?? '').toString().trim();
  return {
    id,
    name: name || 'Untitled template',
    variables: templateVariables(d?.templatemodel),
    variablesRecorded: Array.isArray(d?.templatemodel),
    active: d?.active === true,
    approved: d?.postmarkstatus === 'approved',
  };
}

/** The stored map, read back for the given variables; anything malformed is left unset. */
export function readEmailData(raw: unknown, variables: string[]): MailEmailData {
  const out: MailEmailData = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const v of variables) {
    const e = (raw as any)[v];
    if (!e || typeof e !== 'object' || !SOURCE_KEYS.has(e.type)) continue;
    out[v] = e.type === 'static' ? { type: 'static', value: (e.value ?? '').toString() } : { type: e.type };
  }
  return out;
}

/** The map to store: one entry per variable, `value` only on static ones. */
export function buildEmailData(variables: string[], data: MailEmailData): MailEmailData {
  const out: MailEmailData = {};
  for (const v of variables) {
    const e = data[v];
    if (!e) continue;
    out[v] = e.type === 'static' ? { type: 'static', value: e.value ?? '' } : { type: e.type };
  }
  return out;
}

/** Variables with no choice yet. */
export function unsetCount(variables: string[], data: MailEmailData): number {
  return variables.filter(v => !data[v]).length;
}

/** Static values with no text (spaces only counts as none). */
export function emptyStaticCount(variables: string[], data: MailEmailData): number {
  return variables.filter(v => data[v]?.type === 'static' && !(data[v].value ?? '').trim()).length;
}

/** Variables whose names cannot be stored as keys (they begin and end with `__`). */
export function reservedVariables(variables: string[]): string[] {
  return variables.filter(v => RESERVED_KEY.test(v));
}

function fingerprintOf(templateId: string, keys: string[], entry: (k: string) => [string, string | null]): string {
  if (!templateId) return '';
  return JSON.stringify([templateId, [...keys].sort().map(k => [k, ...entry(k)])]);
}

/** A stable fingerprint of what would be stored, for the unsaved-changes check. */
export function mailFingerprint(templateId: string, variables: string[], data: MailEmailData): string {
  const built = buildEmailData(variables, data);
  return fingerprintOf(templateId, Object.keys(built), k => [built[k].type, built[k].value ?? null]);
}

/**
 * The fingerprint of the map AS STORED, every key included: entries for variables the
 * template no longer has, and malformed ones (an older flat `variable: 'name'` shape), count
 * too. It equals mailFingerprint() only when saving now would store exactly the same map, so a
 * stored map that has drifted from its template reads as unsaved and can be saved clean.
 */
export function storedMailFingerprint(templateId: string, raw: unknown): string {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const keys = Object.keys(obj);
  const read = readEmailData(obj, keys);
  return fingerprintOf(templateId, keys, k => read[k] ? [read[k].type, read[k].value ?? null] : ['', null]);
}
