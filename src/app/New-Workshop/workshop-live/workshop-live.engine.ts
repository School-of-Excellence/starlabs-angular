/**
 * Workshop Live rules (pure, dependency-free): what the /workshoplive/:id feed lists and how it reads.
 *
 * The screen listens to every 'participant workshop' doc of one workshop and shows ONE ROW PER COMPLETED
 * SUB CHALLENGE, newest first (operator 2026-11-19; plan specs/plans/2026-11-19-workshop-live.md). Everything
 * that decides a row lives here so it can be unit-tested without a Firestore, a router or a template:
 *
 * - What counts: a sub challenge (`challenges[].challenges[]`) whose status is exactly 'completed' — the
 *   dashboard's rule (workshop-dashboard.engine.ts normalizeSubChallengeStatus). 'finished', 'inreview' and
 *   the rest are not completions. For assignments `completed` is the reviewer's approval time.
 * - Names come from the workshop config BY challengeid, falling back to the participant doc's own copy: the
 *   copy is only re-synced when the config is saved with its sync switch on, so it can drift (names AND order).
 * - Order: newest `completed` first; a completed step with no date goes last; ties break on the row key so a
 *   re-delivered snapshot never reshuffles equal rows.
 * - People: rows render before anyone is looked up. A person not looked up yet is "pending" (a quiet
 *   placeholder), a person found nowhere is "Unknown" with "—" for phone and email.
 * - Search and pages (end of file): the feed is searched by name, phone or email and shown 20 rows a page, in the
 *   browser; data loading does not change.
 * - Journey and customer status (end of file): the person's active journey by name and their customer status in
 *   title case; a person who is still a new user reads "New User" in both. Search does not look at either.
 *
 * NO Angular, NO Firestore here (the dashboard engine helpers imported below are pure as well).
 */
import { toMillis } from '../workshop-dashboard/workshop-dashboard.engine';
import { peopleSendPhone, toPeopleSendRow } from '../people-send-dialog/people-send-dialog.model';

/** What the screen shows for a missing value. */
export const NIL = '—';
/** A person found in neither people collection. */
export const UNKNOWN_PERSON = 'Unknown';
/** A workshop config with no title. */
export const UNTITLED_WORKSHOP = 'Untitled workshop';
/** The heading when the workshop could not be read (or does not exist). */
export const FALLBACK_TITLE = 'Workshop live';
/** Firestore's documentId() 'in' takes at most 30 values. */
export const LOOKUP_BATCH = 30;

/** One snapshot doc, as the component hands it over. */
export interface LiveDoc { id: string; data: any; }

/** One completed sub challenge. */
export interface CompletionRow {
  /** Stable across snapshots: doc id + main id + sub id (indexes only when an id is missing). */
  key: string;
  docId: string;
  profileid: string;
  mainIndex: number;
  subIndex: number;
  mainId: string;
  subId: string;
  mainName: string;
  subName: string;
  /** Epoch ms of the sub challenge's `completed` stamp, or null when it has none. */
  completedMs: number | null;
}

/** A row as the template shows it. */
export interface LiveViewRow extends CompletionRow {
  /** The person has not been looked up yet: name, phone and email show a placeholder. */
  personPending: boolean;
  name: string;
  phone: string;
  email: string;
  /** The email in the pieces a narrow column may break between (emailParts; joined they are `email`). */
  emailParts: string[];
  /** The person is still a new user: both cells below read "New User". */
  newUser: boolean;
  /** The journey cell: the active journey's name, "New User" or "—". Pending = a placeholder (see detailCells). */
  journey: string;
  journeyPending: boolean;
  /** The customer status cell: "Active", "Non Active"…, "New User" or "—". Pending = a placeholder. */
  status: string;
  statusPending: boolean;
  /** "19 Nov 2026, 4:05 pm", or "—". */
  completedText: string;
  /** Its two halves ("19 Nov 2026" / "4:05 pm"), so a narrow column wraps between them; '' without a date. */
  completedDay: string;
  completedTime: string;
  /** For the <time> element; null when there is no date. */
  completedIso: string | null;
}

/**
 * liveViewRows' memo: a row is rebuilt only when its completion, its person, their new-user answer or the journey
 * names changed (key -> last build).
 */
export type ViewRowCache = Map<string, {
  src: CompletionRow;
  person: any;
  newUser: boolean | undefined;
  journeyNames: ReadonlyMap<string, string> | null;
  view: LiveViewRow;
}>;

/** Challenge names from the workshop config, by challengeid. */
export interface ChallengeNameIndex {
  main: Map<string, string>;
  sub: Map<string, string>;
}

const str = (v: any): string => (v === null || v === undefined ? '' : String(v)).trim();
const list = (v: any): any[] => (Array.isArray(v) ? v : []);
const isNode = (v: any): boolean => !!v && typeof v === 'object';

/** "heading: subheading", trimmed; with one part missing, the other alone; '' with both missing. */
export function mainChallengeName(node: any): string {
  const heading = str(node?.heading);
  const sub = str(node?.subheading);
  if (heading && sub) return `${heading}: ${sub}`;
  return heading || sub;
}

/** A sub challenge's `name`, else its `heading` (the hub seeds and some older docs carry only a heading). */
export function subChallengeName(node: any): string {
  return str(node?.name) || str(node?.heading);
}

/** The workshop config's challenge names by challengeid (blank names are left out, so the copy wins). */
export function challengeNameIndex(config: any): ChallengeNameIndex {
  const index: ChallengeNameIndex = { main: new Map(), sub: new Map() };
  for (const main of list(config?.challenges)) {
    if (!isNode(main)) continue;
    const mainId = str(main.challengeid);
    const mainName = mainChallengeName(main);
    if (mainId && mainName && !index.main.has(mainId)) index.main.set(mainId, mainName);
    for (const sub of list(main.challenges)) {
      if (!isNode(sub)) continue;
      const subId = str(sub.challengeid);
      const subName = subChallengeName(sub);
      if (subId && subName && !index.sub.has(subId)) index.sub.set(subId, subName);
    }
  }
  return index;
}

/** The workshop's title for the header. */
export function workshopTitle(config: any): string {
  return str(config?.detailpage?.title) || UNTITLED_WORKSHOP;
}

/**
 * Every completed sub challenge of every doc, names resolved, in doc order (not sorted).
 * `names` is null while the workshop config has not been read: the participant's copy is used meanwhile.
 */
export function completionRows(docs: readonly LiveDoc[] | null | undefined, names: ChallengeNameIndex | null = null): CompletionRow[] {
  const rows: CompletionRow[] = [];
  const seen = new Set<string>();
  for (const d of docs || []) {
    if (!d || !isNode(d.data)) continue;
    const docId = str(d.id);
    const profileid = str(d.data.profileid);
    list(d.data.challenges).forEach((main: any, mainIndex: number) => {
      if (!isNode(main)) return;
      const mainId = str(main.challengeid);
      const mainName = (mainId && names?.main.get(mainId)) || mainChallengeName(main);
      list(main.challenges).forEach((sub: any, subIndex: number) => {
        if (!isNode(sub) || sub.status !== 'completed') return;
        const subId = str(sub.challengeid);
        let key = `${docId}~${mainId || 'm' + mainIndex}~${subId || 's' + subIndex}`;
        // Two steps sharing an id in one doc (a copy-paste in the editor) must not share a key.
        if (seen.has(key)) key = `${key}~${mainIndex}.${subIndex}`;
        seen.add(key);
        rows.push({
          key, docId, profileid, mainIndex, subIndex, mainId, subId, mainName,
          subName: (subId && names?.sub.get(subId)) || subChallengeName(sub),
          completedMs: toMillis(sub.completed),
        });
      });
    });
  }
  return rows;
}

/** Newest first; no date last; equal dates (and the undated ones) by key, so the order is stable. */
export function compareCompletions(a: CompletionRow, b: CompletionRow): number {
  const am = a.completedMs, bm = b.completedMs;
  if (am !== bm) {
    if (am === null) return 1;
    if (bm === null) return -1;
    return bm - am;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** A sorted copy. */
export function sortCompletions(rows: readonly CompletionRow[]): CompletionRow[] {
  return [...rows].sort(compareCompletions);
}

/** The feed: flattened, named and sorted. */
export function liveCompletions(docs: readonly LiveDoc[] | null | undefined, names: ChallengeNameIndex | null = null): CompletionRow[] {
  return sortCompletions(completionRows(docs, names));
}

/** One doc's completions (unsorted): the screen keeps them per doc and re-reads only the docs a snapshot changed. */
export function docCompletionRows(id: string, data: any, names: ChallengeNameIndex | null = null): CompletionRow[] {
  return completionRows([{ id, data }], names);
}

/** Every doc's completions merged into the feed order. */
export function mergeCompletions(groups: Iterable<readonly CompletionRow[]>): CompletionRow[] {
  const all: CompletionRow[] = [];
  for (const g of groups) for (const r of g) all.push(r);
  return all.sort(compareCompletions);
}

/** Each row's completion stamp, to tell a fresh completion on the next snapshot. */
export function completionStamps(rows: readonly CompletionRow[]): Map<string, number | null> {
  return new Map(rows.map(r => [r.key, r.completedMs] as [string, number | null]));
}

/** Rows that are new since `previous`, or completed again (a new stamp, e.g. after a rework). */
export function freshKeys(previous: ReadonlyMap<string, number | null> | null, rows: readonly CompletionRow[]): string[] {
  if (!previous) return [];
  return rows.filter(r => !previous.has(r.key) || previous.get(r.key) !== r.completedMs).map(r => r.key);
}

/** An id a documentId() 'in' query can take: non-empty, no '/' (one bad id fails its whole batch). */
export function isLookupId(id: any): boolean {
  const s = str(id);
  return !!s && !s.includes('/');
}

/** Unique, trimmed, look-up-able ids not asked for yet, in first-seen order. */
export function missingIds(ids: Iterable<any>, asked: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = str(raw);
    if (!isLookupId(id) || asked.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** `ids` in slices of `size` (the 30-value limit of an 'in' query). */
export function chunk<T>(ids: readonly T[], size: number = LOOKUP_BATCH): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, Math.floor(size));
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n));
  return out;
}

/**
 * "+91 9876543210", the bare number without a code, '' without a number. Reads both spellings of the country
 * code (one collection stores it camelCase, the other lowercase), so neither group loses it.
 */
export function formatPhone(person: any): string {
  return peopleSendPhone(toPeopleSendRow(person));
}

/**
 * The person cells: undefined = not looked up yet (pending); null = found nowhere ("Unknown", "—", "—").
 */
export function personCells(person: any | null | undefined): { personPending: boolean; name: string; phone: string; email: string } {
  if (person === undefined) return { personPending: true, name: '', phone: '', email: '' };
  if (person === null || !isNode(person)) return { personPending: false, name: UNKNOWN_PERSON, phone: NIL, email: NIL };
  return {
    personPending: false,
    name: str(person.name) || UNKNOWN_PERSON,
    phone: formatPhone(person) || NIL,
    email: str(person.email) || NIL,
  };
}

/**
 * The dashboard's date-time format (workshop-dashboard.engine.ts formatDateTime: en-IN, 2-digit day, short month,
 * numeric hour, lowercase am/pm) from two formatters built ONCE. toLocaleDateString/-TimeString with a locale and
 * options build a new ICU formatter on every call (~0.4 ms each), which a feed of thousands of rows cannot afford on
 * every snapshot; Intl.DateTimeFormat with the same options gives the same text (unit-tested against formatDateTime).
 * Built lazily, in the browser's time zone at first use.
 */
let dayFormat: Intl.DateTimeFormat | null = null;
let timeFormat: Intl.DateTimeFormat | null = null;

/** "19 Nov 2026" and "4:05 pm"; null without a usable date. */
export function completedParts(ms: number | null | undefined): { day: string; time: string } | null {
  if (ms === null || ms === undefined || !isFinite(ms)) return null;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  dayFormat ??= new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  timeFormat ??= new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { day: dayFormat.format(d), time: timeFormat.format(d) };
}

/** "19 Nov 2026, 4:05 pm" (the dashboard's format), or "—" without a date. */
export function formatCompletedAt(ms: number | null | undefined): string {
  const p = completedParts(ms);
  return p ? `${p.day}, ${p.time}` : NIL;
}

/** An email split before its '@': ['a.b', '@x.org']. */
export function splitEmail(email: string): [string, string] {
  const at = email.lastIndexOf('@');
  return at > 0 ? [email.slice(0, at), email.slice(at)] : [email, ''];
}

/**
 * The email in the pieces a narrow column may break between (a <wbr> between each): before the '@', and before each
 * '.', '_', '+' or '-' (the next line starts with the mark, so it reads as the same address going on). With the
 * Journey and Customer status columns the email column is narrower, and a long address such as
 * "first.middle.lastname@example.com" then wraps at its dots instead of mid-word. Joined, the pieces are the email
 * exactly (the cell's text does not change); "—" is one piece.
 */
export function emailParts(email: string): string[] {
  return splitEmail(email).filter(Boolean).flatMap(half => half.split(/(?=[._+-])/));
}

function viewRow(
  r: CompletionRow, person: any | null | undefined, newUser: boolean | undefined,
  journeyNames: ReadonlyMap<string, string> | null,
): LiveViewRow {
  const cells = personCells(person);
  const parts = completedParts(r.completedMs);
  return {
    ...r,
    ...cells,
    ...detailCells(person, newUser, journeyNames),
    emailParts: emailParts(cells.email),
    completedText: parts ? `${parts.day}, ${parts.time}` : NIL,
    completedDay: parts ? parts.day : '',
    completedTime: parts ? parts.time : '',
    completedIso: parts ? new Date(r.completedMs as number).toISOString() : null,
  };
}

/** What the journey and customer status cells need beyond the person (see detailCells). */
export interface PeopleDetails {
  /** profileid -> still a new user (isStillNewUser of their new_user_data answer). Absent = not read yet. */
  newUsers: ReadonlyMap<string, boolean>;
  /** Journey names by journey doc id; null while the journey list is still being read for the first time. */
  journeyNames: ReadonlyMap<string, string> | null;
}

/**
 * The rows as shown. A profileid that cannot be looked up reads as a person found nowhere (and not a new user).
 * Without `details` nobody's new-user answer is known yet, so the journey and status cells stay pending.
 * With a `cache`, a row whose completion object, person, new-user answer and journey names are the same as last time
 * is reused as is (the screen keeps unchanged docs' completion objects, so a snapshot that changed one doc rebuilds
 * only that doc's rows), and rows no longer listed are dropped from the cache.
 */
export function liveViewRows(
  rows: readonly CompletionRow[], people: ReadonlyMap<string, any | null>, cache?: ViewRowCache, details?: PeopleDetails,
): LiveViewRow[] {
  const journeyNames = details?.journeyNames ?? null;
  const out = rows.map(r => {
    const lookable = isLookupId(r.profileid);
    const person = lookable ? people.get(r.profileid) : null;
    const newUser = lookable ? details?.newUsers.get(r.profileid) : false;
    const hit = cache?.get(r.key);
    if (hit && hit.src === r && hit.person === person && hit.newUser === newUser && hit.journeyNames === journeyNames) {
      return hit.view;
    }
    const view = viewRow(r, person, newUser, journeyNames);
    cache?.set(r.key, { src: r, person, newUser, journeyNames, view });
    return view;
  });
  if (cache && cache.size > out.length) {
    const keep = new Set(rows.map(r => r.key));
    for (const k of Array.from(cache.keys())) if (!keep.has(k)) cache.delete(k);
  }
  return out;
}

/** "1 completion", "1,234 completions". */
export function completionsLabel(n: number): string {
  const count = Math.max(0, Math.floor(n || 0));
  return `${count.toLocaleString('en-IN')} ${count === 1 ? 'completion' : 'completions'}`;
}

/** The "Updated" clock: "04:05:09 pm", in local time. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = d.getHours();
  return `${pad(h % 12 || 12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${h < 12 ? 'am' : 'pm'}`;
}

/* ---------- search and pages (plan "Addition: pagination and search", 2026-11-19) ----------
 * Browser-side only: the screen still holds the whole feed from its one listener (no paged reads, no new
 * collection, no Cloud Function). These helpers decide which rows a search keeps and which slice a page shows.
 */

/** Rows per page. */
export const PAGE_SIZE = 20;

/** What a search reads of a row: the person cells as the row shows them. */
export type SearchableRow = Pick<LiveViewRow, 'personPending' | 'name' | 'phone' | 'email'>;

/** One page of rows, plus what the pager shows. `from`/`to` are 1-based and inclusive; 0 and 0 when `total` is 0. */
export interface PageSlice<T> {
  pageRows: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

const collapse = (v: string): string => v.replace(/\s+/g, ' ').trim();
/**
 * One Unicode form for both sides of a search (NFKC): a name saved composed on one device and typed decomposed on
 * another reads the same, and full-width digits from some keyboards become 0-9.
 */
const unicodeForm = (v: string): string => v.normalize('NFKC');

/** A search term as matched: one Unicode form, lower case, trimmed, inner runs of spaces as one. '' for nothing. */
export function normaliseSearch(term: any): string {
  return collapse(unicodeForm(str(term)).toLowerCase());
}

/** The digits of a value, nothing else ("+91 99999-00000" -> "919999900000"; full-width digits count). */
export function phoneDigits(v: any): string {
  return unicodeForm(str(v)).replace(/\D+/g, '');
}

/** A number saved without its country code is matched by its last digits only when it has at least this many. */
const NATIONAL_MIN_DIGITS = 7;

/**
 * The digits a phone-shaped term is matched by: its leading zeros dropped (a trunk "0" or an international "00"),
 * unless it is all zeros. '' for a term that does not read as a phone number.
 */
function termDigits(t: string): string {
  if (!isPhoneTerm(t)) return '';
  const all = phoneDigits(t);
  return all.replace(/^0+/, '') || all;
}

/** A term that reads as (part of) a phone number: digits, with only spaces, '+', '-' or brackets between them. */
export function isPhoneTerm(term: string): boolean {
  return /\d/.test(term) && /^[\d\s+()-]+$/.test(term);
}

/** What a row is matched against, built once per row object (the screen reuses unchanged rows across snapshots). */
/** `national` is the number's digits without leading zeros, kept only when long enough to stand for a whole number. */
interface SearchKey { text: string; digits: string; national: string; }
const searchKeys = new WeakMap<object, SearchKey>();

function searchKey(row: SearchableRow): SearchKey {
  let key = searchKeys.get(row);
  if (key) return key;
  // The placeholders ("Unknown", "—") are not a person's details: "no" must not match every "Unknown".
  const name = row.name === UNKNOWN_PERSON ? '' : collapse(unicodeForm(str(row.name)).toLowerCase());
  const email = row.email === NIL ? '' : unicodeForm(str(row.email)).toLowerCase();
  const digits = row.phone === NIL ? '' : phoneDigits(row.phone);
  const national = digits.replace(/^0+/, '');
  // A newline between the two, so a term can never match across the end of one and the start of the other.
  key = { text: `${name}\n${email}`, digits, national: national.length >= NATIONAL_MIN_DIGITS ? national : '' };
  searchKeys.set(row, key);
  return key;
}

/**
 * Does the row's person match? `term` is normalised here, so the raw box text is fine. An empty term matches every
 * row; a person still being looked up matches nothing else (the row matches once their details land).
 * Name and email: case-insensitive, any part. Phone: the term's digits anywhere in the number's digits, ignoring
 * spaces, '+', '-' and brackets on both sides ("99999" and "+91 99999" both match "+91 9999900000"); a leading "0"
 * or "00" on the term is dropped, and a full number typed with its country code finds the same number saved without
 * one ("+91 98765 43210" and "098765 43210" both match "9876543210").
 */
export function rowMatchesSearch(row: SearchableRow, term: any): boolean {
  const t = normaliseSearch(term);
  return !t || matches(row, t, termDigits(t));
}

/** `t` normalised and non-empty; `digits` from termDigits (the term's digits when it reads as a phone number, else ''). */
function matches(row: SearchableRow, t: string, digits: string): boolean {
  if (!row || row.personPending) return false;
  const key = searchKey(row);
  if (key.text.includes(t)) return true;
  if (!digits || !key.digits) return false;
  return key.digits.includes(digits) || (!!key.national && digits.endsWith(key.national));
}

/** The rows that match, in their order. An empty term gives the same array back. */
export function filterRows<T extends SearchableRow>(rows: readonly T[], term: any): readonly T[] {
  const t = normaliseSearch(term);
  if (!t) return rows;
  const digits = termDigits(t);
  return rows.filter(r => matches(r, t, digits));
}

/**
 * A search whose result is not final yet: there is a term, and some row's person is still being looked up (that row
 * matches nothing until their details land). The screen then says it is still loading instead of "no match".
 */
export function searchAwaitingPeople(rows: readonly SearchableRow[], term: any): boolean {
  return !!normaliseSearch(term) && rows.some(r => !!r?.personPending);
}

/** How many pages `total` rows take: at least 1, so an empty list is "page 1 of 1". */
export function pageCountFor(total: number, size: number = PAGE_SIZE): number {
  const n = Math.max(1, Math.floor(size) || PAGE_SIZE);
  const count = Math.max(0, Math.floor(total) || 0);
  return Math.max(1, Math.ceil(count / n));
}

/** A page number that exists: below 1 (or not a number) is 1, past the end is the last page. */
export function clampPage(page: any, total: number, size: number = PAGE_SIZE): number {
  const p = Math.floor(Number(page));
  if (!isFinite(p) || p < 1) return 1;
  return Math.min(p, pageCountFor(total, size));
}

/** One page of `rows` (the page clamped first, so a list that shrank shows its last page). */
export function pageSlice<T>(rows: readonly T[], page: any, size: number = PAGE_SIZE): PageSlice<T> {
  const n = Math.max(1, Math.floor(size) || PAGE_SIZE);
  const total = rows.length;
  const p = clampPage(page, total, n);
  const start = (p - 1) * n;
  const pageRows = rows.slice(start, start + n);
  return {
    pageRows,
    page: p,
    pageCount: pageCountFor(total, n),
    from: pageRows.length ? start + 1 : 0,
    to: start + pageRows.length,
    total,
  };
}

const fmtCount = (n: number): string => Math.max(0, Math.floor(n || 0)).toLocaleString('en-IN');

/** "Page 2 of 5". */
export function pageLabel(page: number, pageCount: number): string {
  return `Page ${fmtCount(page)} of ${fmtCount(pageCount)}`;
}

/** "Showing 21–40 of 57" (an en dash; N is the searched total). */
export function rangeLabel(from: number, to: number, total: number): string {
  return `Showing ${fmtCount(from)}–${fmtCount(to)} of ${fmtCount(total)}`;
}

/** The screen-reader line for a search: '' without one, else "1 match", "12 matches" or "No matches". */
export function matchesLabel(n: number, term: any): string {
  if (!normaliseSearch(term)) return '';
  const c = Math.max(0, Math.floor(n || 0));
  if (!c) return 'No matches';
  return `${fmtCount(c)} ${c === 1 ? 'match' : 'matches'}`;
}

/* ---------- journey and customer status (plan "Addition: Journey and Customer status columns", 2026-11-19) ----------
 * Two more cells per row, after Email. An existing participant shows their active journey by name and their customer
 * status; a person who is still a new user shows "New User" in both (the dashboard's isNewUserProfile rule). The
 * search does not look at either cell (it stays name, phone and email).
 */

/** Both cells for a person who is still a new user. */
export const NEW_USER = 'New User';

/** Journey names by journey doc id (the 'journey' collection: journey/{id}.journey); blank names are left out. */
export function journeyNameIndex(docs: Iterable<{ id: any; data: any }> | null | undefined): Map<string, string> {
  const index = new Map<string, string>();
  for (const d of docs || []) {
    const id = str(d?.id);
    const name = str(d?.data?.journey);
    if (id && name && !index.has(id)) index.set(id, name);
  }
  return index;
}

/**
 * The person's active journey by name. "—" without an active journey, and "—" when the id has no name (an unknown
 * journey, or the names could not be read): never the raw id. The dashboard's Existing Users journey filter reads the
 * same field and the same collection.
 */
export function journeyLabel(meta: any, journeyNames: ReadonlyMap<string, string> | null | undefined): string {
  const id = str(meta?.activejourney);
  if (!id) return NIL;
  return str(journeyNames?.get(id)) || NIL;
}

/** The customer status in title case, word by word ("non active" -> "Non Active", "BANNED" -> "Banned"); "—" when empty. */
export function customerStatusLabel(meta: any): string {
  const status = collapse(str(meta?.customerstatus)).toLowerCase();
  if (!status) return NIL;
  return status.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * The dashboard's isNewUserProfile (workshop-dashboard.component.ts): the person has a new_user_data doc and it has not
 * been moved to existing (`movedtoexist !== true`). `newUserDoc` is that doc's data, or null / undefined without one.
 */
export function isStillNewUser(newUserDoc: any): boolean {
  return isNode(newUserDoc) && newUserDoc.movedtoexist !== true;
}

/**
 * Whose details the name, phone and email cells show: participant metadata first, else new_user_data (the order the
 * screen always used). `meta` and `newUser` are each lookup's answer: the doc, null when that collection has none,
 * undefined while it has not answered. Returns undefined (pending) until the answers that decide it are in, null when
 * neither collection has the person.
 */
export function shownPerson(meta: any | null | undefined, newUser: any | null | undefined): any | null | undefined {
  if (meta === undefined) return undefined;
  if (meta !== null) return meta;
  if (newUser === undefined) return undefined;
  return newUser ?? null;
}

/**
 * The journey and customer status cells.
 * - Pending (the quiet placeholder) while the person, or whether they are still a new user, is not known yet.
 * - Still a new user: "New User" in both.
 * - Found nowhere: "—" in both.
 * - Otherwise the person's journey and status. The journey alone also waits while the journey names are being read
 *   for the first time (`journeyNames` null) and the person has one; once a read has failed the screen hands an empty
 *   map, so it reads "—" rather than the raw id.
 */
export function detailCells(
  person: any | null | undefined, newUser: boolean | undefined, journeyNames: ReadonlyMap<string, string> | null,
): { newUser: boolean; journey: string; journeyPending: boolean; status: string; statusPending: boolean } {
  if (person === undefined || newUser === undefined) {
    return { newUser: false, journey: '', journeyPending: true, status: '', statusPending: true };
  }
  if (newUser) return { newUser: true, journey: NEW_USER, journeyPending: false, status: NEW_USER, statusPending: false };
  if (person === null || !isNode(person)) {
    return { newUser: false, journey: NIL, journeyPending: false, status: NIL, statusPending: false };
  }
  const status = customerStatusLabel(person);
  if (journeyNames === null && str(person.activejourney)) {
    return { newUser: false, journey: '', journeyPending: true, status, statusPending: false };
  }
  return { newUser: false, journey: journeyLabel(person, journeyNames), journeyPending: false, status, statusPending: false };
}
