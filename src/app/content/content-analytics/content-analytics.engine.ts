/**
 * Content Analytics Engine (pure, dependency-free).
 *
 * The watch-time arithmetic and duration formatting behind the content analytics dashboard: hours watched,
 * completion percentage, average per active day, days since last seen, and the three duration formatters.
 *
 * Extracted from ContentAnalyticsComponent on 2026-09-10, mirroring priority.engine.ts. The logic is
 * UNCHANGED — same reducers, same divisors, same guards, same strings. Only its location moved.
 *
 * WHY IT LIVES HERE:
 * - NO Angular / Firestore imports, so these rules can be unit-tested against synthetic logs instead of
 *   standing up a 1,252-line component with a mocked Firestore.
 * - There is a second reason specific to this component: content-analytics.component.ts imports Node's
 *   `console` module (line 8), which does not resolve under tsconfig.spec — it is one of the files that
 *   breaks the repo-wide `ng test`. The component therefore cannot appear in a spec build at all, while
 *   this engine can. Extraction is the only way these numbers get covered until that import is fixed.
 * - These figures are what a content team reads to judge whether a series is working. A wrong divisor here
 *   does not crash anything; it just reports the wrong answer, quietly, forever.
 */

/** One watch-log row, as the dashboard reads it. Only the fields the maths touches are modelled. */
export interface WatchLog {
  totaltimespend?: number;   // seconds watched
  totalruntime?: number;     // seconds of content available
  /** Firestore Timestamp (has toDate()) or anything the Date constructor accepts. */
  logdate?: any;
}

/** Sentinel for "no logs at all" — deliberately large so such rows sort to the bottom of a last-seen list. */
export const NEVER_SEEN_DAYS = 999;

const secondsWatched = (logs: WatchLog[]): number =>
  logs.reduce((sum, l) => sum + (l.totaltimespend || 0), 0);

/** Normalise a Firestore Timestamp or a raw date value to a Date. */
function toDate(value: any): Date {
  return value?.toDate ? value.toDate() : new Date(value);
}

/** Total hours watched across the logs. Empty/absent input is 0, never NaN. */
export function watchHours(logs: WatchLog[] | null | undefined): number {
  if (!logs?.length) return 0;
  return secondsWatched(logs) / 3600;
}

/**
 * Completion as a PERCENTAGE of available runtime.
 *
 * Note it is NOT capped at 100: re-watching content legitimately pushes this above 100%, and the component
 * has always reported it that way.
 */
export function completionPercent(logs: WatchLog[] | null | undefined): number {
  if (!logs?.length) return 0;
  const totalSpend = secondsWatched(logs);
  const totalRuntime = logs.reduce((sum, l) => sum + (l.totalruntime || 0), 0);
  if (totalRuntime === 0) return 0;   // guards the divide, so an unrated series reports 0 rather than Infinity
  return (totalSpend / totalRuntime) * 100;
}

/**
 * Average hours per ACTIVE day — days with no activity are not counted in the divisor, because the
 * denominator is the set of distinct log dates rather than the elapsed calendar range.
 */
export function avgHoursPerActiveDay(logs: WatchLog[] | null | undefined): number {
  if (!logs?.length) return 0;
  const dateSet = new Set<string>();
  logs.forEach((l) => dateSet.add(toDate(l.logdate).toISOString().substring(0, 10)));
  return dateSet.size > 0 ? watchHours(logs) / dateSet.size : 0;
}

/**
 * Whole days since the most recent log. `now` is injectable so a test can freeze the clock; the default
 * preserves the component's original Date.now() behaviour exactly.
 */
export function daysSinceLastSeen(
  logs: WatchLog[] | null | undefined,
  now: number = Date.now(),
): number {
  if (!logs?.length) return NEVER_SEEN_DAYS;
  let latest = 0;
  logs.forEach((l) => {
    const t = toDate(l.logdate).getTime();
    if (t > latest) latest = t;
  });
  return Math.floor((now - latest) / (1000 * 60 * 60 * 24));
}

// ---- duration formatters ---------------------------------------------------------------------------
// All three take SECONDS and render a human string. Kept verbatim, including the trailing raw value on
// formatMinutesSeconds, which the dashboard shows so a reader can sanity-check the conversion.

export function formatMinutesSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const remainingSeconds = value % 60;
  return `${minutes} mins ${remainingSeconds} sec (${value})`;
}

export function formatDaysHoursMins(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const remainingSecondsAfterDays = seconds % (3600 * 24);
  const hours = Math.floor(remainingSecondsAfterDays / 3600);
  const remainingSecondsAfterHours = remainingSecondsAfterDays % 3600;
  const minutes = Math.floor(remainingSecondsAfterHours / 60);
  const remainingSeconds = remainingSecondsAfterHours % 60;
  return `${days} days ${hours} hours ${minutes} mins ${remainingSeconds} secs`;
}

export function formatHoursMins(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const remainingSecondsAfterHours = seconds % 3600;
  const minutes = Math.floor(remainingSecondsAfterHours / 60);
  const remainingSeconds = remainingSecondsAfterHours % 60;
  return `${hours} hours ${minutes} mins ${remainingSeconds} secs`;
}

// ---- journey profile filtering ----------------------------------------------------------------------

export type JourneyFilter = 'all' | 'watching' | 'notyet' | string;

export interface JourneyProfile {
  name?: string;
  watching?: boolean;
}

/**
 * Does this profile survive the current filter + search box?
 *
 * The component held `journeyFilter` and `journeySearchQuery` on `this`; they are parameters here so the
 * rule can be exercised without the component. Search is a case-insensitive substring on the name.
 */
export function journeyProfileVisible(
  profile: JourneyProfile | null | undefined,
  filter: JourneyFilter,
  search: string,
): boolean {
  const matchesFilter =
    filter === 'all' ||
    (filter === 'watching' && !!profile?.watching) ||
    (filter === 'notyet' && !profile?.watching);
  const matchesSearch = !search || !!profile?.name?.toLowerCase().includes(search.toLowerCase());
  return matchesFilter && matchesSearch;
}

/** How many profiles survive the filter — the count shown beside the list. */
export function visibleProfileCount(
  profiles: JourneyProfile[] | null | undefined,
  filter: JourneyFilter,
  search: string,
): number {
  return (profiles || []).filter((p) => journeyProfileVisible(p, filter, search)).length;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// New users — who still counts as one, and CSV safety for the export.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `new_user_data` KEEPS a person's record after they are migrated to a full profile, and marks it
 * `movedtoexist: true`. From that moment their live details are in `participant metadata`, and the
 * stale new_user_data row must not stand in for them — so only a record that has NOT been moved
 * counts as a new user.
 *
 * Deliberately the same rule as the workshop dashboard (`isNewUserProfile`) and the EiFlix ops
 * dashboard's user-type filter, so "new user" means one thing across every screen.
 */
export function isStillNewUser(doc: any): boolean {
  return !!doc && doc['movedtoexist'] !== true;
}

/**
 * Narrow an id→value map built from new_user_data down to the people who are still new.
 *
 * An id whose document is missing is KEPT, not dropped. The two come from the same read so it
 * should not happen; if it ever does, keeping means the filter quietly does nothing, while
 * dropping would blank out every name on the screen. Only people we can positively see have moved
 * are removed.
 */
export function stillNewUserMap<T>(
  map: { [id: string]: T } | null | undefined,
  docdata: { [id: string]: any } | null | undefined,
): { [id: string]: T } {
  const out: { [id: string]: T } = {};
  const docs = docdata || {};
  for (const id of Object.keys(map || {})) {
    const doc = docs[id];
    if (doc !== undefined && doc !== null && !isStillNewUser(doc)) continue;
    out[id] = (map as any)[id];
  }
  return out;
}

/**
 * One CSV cell.
 *
 * ConvertToCSV joins values with bare commas and quotes nothing, so a value containing a comma or a
 * newline shifts every column after it on that row — which is why the export already strips commas
 * out of `videoname` by hand. Any field added to the export needs the same treatment.
 */
export function csvCell(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n]+/g, ' ').replace(/,/g, ' ').trim();
}

/**
 * The options the Video Name dropdown should render for a given search term.
 *
 * Same matching rule as the dropdowns on /participants-analytics (`filterOptions` in
 * participants-analytics.engine.ts): trimmed, lower-cased, CONTAINS. Reimplemented rather than
 * imported so this screen's bundle does not pull in that 500-line engine for five lines.
 *
 * ALREADY-SELECTED OPTIONS ARE ALWAYS KEPT, and that is not a nicety — it is required for a
 * `multiple` select. On every options change MatSelect runs _initializeSelection() →
 * _setSelectionByValue(), which clears the selection model and re-selects only the options
 * CURRENTLY RENDERED; _propagateChanges() then writes back `selected.map(o => o.value)`. So a
 * selected video hidden behind a search term leaves the selection model, and the user's next click
 * on any option silently emits a value array without it. Rendering selected options regardless of
 * the term is what stops that.
 *
 * Order is the source list's order — selected items are not hoisted, so MatSelect's _sortValues()
 * (which sorts by options.indexOf) keeps a stable ordering.
 */
export function filterVideoNameOptions(
  options: string[] | null | undefined,
  query: string | null | undefined,
  selected: string[] | null | undefined,
): string[] {
  const all = options || [];
  const term = (query != null && query !== '') ? query.trim().toLowerCase() : '';
  const keep = new Set(selected || []);
  if (!term) return all.slice();
  return all.filter(o => keep.has(o) || String(o ?? '').trim().toLowerCase().includes(term));
}

/**
 * A person's phone for the export, as every other screen in this app presents one: the country code
 * then the number, e.g. "+91 9999900000".
 *
 * FIELD NAMES, which are not obvious and are easy to get silently wrong:
 *   • the number is `phonenumber` on BOTH `participant metadata` and `new_user_data` — this is what
 *     /newusersprofile renders from each of them (newusersprofile.component.html:224).
 *   • the country code is `countryCode` on new_user_data and `countrycode` on participant metadata
 *     (the CF profiledata_to_participantmetadata writes the lower-cased one), so both are accepted.
 *
 * Note that AuthguardService's `phonenumber` map is NOT the source here: it reads `doc.data()
 * ['number']`, which is the `profile_data` shape, and would come back empty for these documents.
 *
 * Returns '' when there is no number, so a caller can fall through to its other source — a document
 * that exists but carries no phone should not win over one that does.
 */
export function profilePhone(doc: any): string {
  if (!doc) return '';
  const raw = doc['phonenumber'];
  if (raw === null || raw === undefined) return '';
  const num = String(raw).trim();
  if (num === '') return '';
  const code = String(doc['countryCode'] ?? doc['countrycode'] ?? '').trim();
  return code ? `${code} ${num}` : num;
}
