/**
 * EiFlix popup banner — the shape stored in `classify/eiflixpopupbanner`.
 *
 * The document used to hold ONE banner as flat fields (`header`, `title`, …). It now holds a
 * `popupbanner` field: an ARRAY OF MAPS, one map per banner, so several banners can exist.
 *
 * Pure functions only — no Angular, no Firestore — so the rules are unit-testable on their own.
 */

/** One banner. Exactly the keys the flat document used to carry, now per entry. */
export interface PopupBanner {
  header: string;
  title: string;
  description: string;
  button1text: string;
  button2text: string;
  button1link: string;
  footer: string;
  desktop: string;
  tablet: string;
  mobile: string;
  enable: boolean;
}

/** The field this screen owns on the document. */
export const POPUP_BANNER_FIELD = 'popupbanner';

/** The legacy flat keys, in the order the editor shows them. */
export const BANNER_KEYS: (keyof PopupBanner)[] = [
  'header', 'title', 'description', 'button1text', 'button2text', 'button1link',
  'footer', 'desktop', 'tablet', 'mobile', 'enable',
];

const str = (v: any): string => typeof v === 'string' ? v : '';

/** A new, empty banner. Nothing is required, and a new one starts switched off. */
export function blankBanner(): PopupBanner {
  return {
    header: '', title: '', description: '', button1text: '', button2text: '',
    button1link: '', footer: '', desktop: '', tablet: '', mobile: '', enable: false,
  };
}

/**
 * Coerce whatever is stored in one array entry into a complete banner.
 *
 * Entries are written by this editor, but a map that predates a field — or was written by hand —
 * must not leave an `undefined` on a form control, so every key is filled in.
 */
export function toBanner(raw: any): PopupBanner {
  const d = (raw && typeof raw === 'object') ? raw : {};
  return {
    header: str(d['header']),
    title: str(d['title']),
    description: str(d['description']),
    button1text: str(d['button1text']),
    button2text: str(d['button2text']),
    button1link: str(d['button1link']),
    footer: str(d['footer']),
    desktop: str(d['desktop']),
    tablet: str(d['tablet']),
    mobile: str(d['mobile']),
    enable: d['enable'] === true,
  };
}

/** Whether a banner carries anything a person actually typed or uploaded. */
export function bannerHasContent(b: PopupBanner): boolean {
  return BANNER_KEYS.some(k => k !== 'enable' && str(b[k]).trim() !== '');
}

/**
 * The banners to edit, read from a document.
 *
 * MIGRATION, and the reason this function exists: the live document still holds the original banner
 * as FLAT fields. If `popupbanner` is missing or empty but those flat fields carry content, the one
 * banner already in production is adopted as the first entry. Without this the operator would open
 * the dialog, see nothing, and the first save would write an array that silently replaced the live
 * banner with an empty list.
 *
 * A document with neither returns [] — the caller decides whether to start the operator off with one
 * blank banner, which is a UI choice rather than a data one.
 */
export function bannersFromDoc(data: any): PopupBanner[] {
  const d = (data && typeof data === 'object') ? data : {};
  const stored = d[POPUP_BANNER_FIELD];
  if (Array.isArray(stored)) {
    const list = stored.map(toBanner);
    if (list.length > 0) return list;
  }
  const legacy = toBanner(d);
  return bannerHasContent(legacy) ? [legacy] : [];
}

/** True when the document has no `popupbanner` array but does carry a legacy flat banner. */
export function isLegacyOnly(data: any): boolean {
  const d = (data && typeof data === 'object') ? data : {};
  const stored = d[POPUP_BANNER_FIELD];
  const hasArray = Array.isArray(stored) && stored.length > 0;
  return !hasArray && bannerHasContent(toBanner(d));
}

/**
 * The value written to the document: `{ popupbanner: [...] }`.
 *
 * Only this one field. The write is a merge, so the legacy flat fields stay where they are —
 * deleting them would take the production popup down the moment this saved, because the app that
 * renders it still reads them until it is updated to read the array.
 */
export function bannersToPayload(banners: PopupBanner[]): { [k: string]: PopupBanner[] } {
  return { [POPUP_BANNER_FIELD]: (banners || []).map(toBanner) };
}

/**
 * A label for a banner in the list.
 *
 * `title` is rich text, so its markup is stripped before it is shown as a plain label; a banner with
 * no title falls back to its position, which is the only thing that is always true of it.
 */
export function bannerLabel(b: PopupBanner, index: number): string {
  const plain = str(b?.title)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain !== '' ? plain : `Banner ${index + 1}`;
}
