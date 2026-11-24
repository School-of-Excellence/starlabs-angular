/**
 * Q&A settings for one workshop, edited in Settings → Dashboard Access.
 *
 * Stored in `workshopsettings/{workshop id}` as one map, replaced whole on save:
 *
 *   q&a: { title: string, admintext: string, admin: string[] (profile ids),
 *          enablesplit: boolean, enablevideotime: boolean, samequestion: boolean,
 *          allowlike: boolean }
 *
 * The admin picker offers the participant directory only, so new users are never listed.
 */

/** The stored field name. It contains `&`, so writes name it with a FieldPath. */
export const QNA_FIELD = 'q&a';

export interface QnaSettings {
  title: string;
  admintext: string;
  admin: string[];
  enablesplit: boolean;
  enablevideotime: boolean;
  samequestion: boolean;
  allowlike: boolean;
}

export const EMPTY_QNA: QnaSettings = Object.freeze({
  title: '',
  admintext: '',
  admin: [] as string[],
  enablesplit: false,
  enablevideotime: false,
  samequestion: false,
  allowlike: false,
}) as QnaSettings;

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const id = typeof v === 'string' ? v.trim() : '';
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** What the screen shows, from the whole `workshopsettings` document (or null). Tolerates any shape. */
export function readQnaSettings(settingsDoc: any): QnaSettings {
  const raw = settingsDoc && typeof settingsDoc === 'object' ? settingsDoc[QNA_FIELD] : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_QNA, admin: [] };
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    admintext: typeof raw.admintext === 'string' ? raw.admintext : '',
    admin: cleanIds(raw.admin),
    enablesplit: raw.enablesplit === true,
    enablevideotime: raw.enablevideotime === true,
    samequestion: raw.samequestion === true,
    allowlike: raw.allowlike === true,
  };
}

/** The map written to Firestore: text trimmed, admins de-duplicated, booleans strict. */
export function buildQnaSettings(s: QnaSettings): QnaSettings {
  return {
    title: (s?.title ?? '').toString().trim(),
    admintext: (s?.admintext ?? '').toString().trim(),
    admin: cleanIds(s?.admin),
    enablesplit: s?.enablesplit === true,
    enablevideotime: s?.enablevideotime === true,
    samequestion: s?.samequestion === true,
    allowlike: s?.allowlike === true,
  };
}

/** Equal for two values that would be stored the same. Drives the unsaved state. */
export function qnaFingerprint(s: QnaSettings): string {
  const b = buildQnaSettings(s);
  return JSON.stringify([b.title, b.admintext, b.admin, b.enablesplit, b.enablevideotime, b.samequestion, b.allowlike]);
}
