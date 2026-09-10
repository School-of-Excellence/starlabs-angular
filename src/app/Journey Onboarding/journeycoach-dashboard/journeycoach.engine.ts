/**
 * Journey Coach Dashboard Engine (pure, dependency-free).
 *
 * The calculations and decisions behind the Journey Coach dashboard: how long a participant has been
 * waiting, which recency band a date falls into, how an interim crossover is judged progressed or
 * regressed, how evolution-progress percentages are banded, how the health-key bars are weighted and
 * tagged, how table rows are counted / filtered / sorted / paginated, and the label and CSS-class strings
 * those rules produce.
 *
 * Extracted from JourneyCoachDashboardComponent (5,592 lines) on 2026-09-10, following the precedent set
 * by priority.engine.ts in ../journey-coach-health-dashboard. The logic is UNCHANGED — same arithmetic,
 * same thresholds, same strings, same rounding, same quirks. Only its location moved.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO DOM. Pure functions, so the rules can be unit-tested offline instead of
 *   standing up a 5,600-line component that injects Firestore, Router, MatDialog, DatePipe and a change
 *   detector just to check whether a 90-day-old date lands in band 2 or band 3.
 * - Most of these were public methods reachable only from the template. An e2e case could assert the
 *   RENDERED number, but not the boundary either side of it — an off-by-one in a `<=` would render a
 *   plausible number and pass silently.
 * - Every threshold, weight, colour and label below is a PRODUCT decision. They are asserted by value in
 *   the spec on purpose: changing one should turn a test red, not drift unnoticed.
 *
 * WHAT IS DELIBERATELY *NOT* HERE (left in the component, where it belongs):
 * - Anything that reads Firestore (loadCurrentSalesLeads, getAtcAlpha, fetchAELAndInterimData's queries,
 *   buildSubscriptionMatrix) — I/O, not a rule.
 * - Anything that formats via Angular's DatePipe (formatDate) or touches the DOM / Router / MatDialog.
 * - Anything that mutates `this` (the dialog openers, pagination navigation, filter-mode toggling).
 * - Mixed methods keep their I/O half in the component and call in here for the decision half:
 *   getDateDifferenceCategoryCode still normalises a Firestore Timestamp itself and passes a plain Date;
 *   processEvolutionProgressFromMap still assigns to `this` and calls markForCheck.
 *
 * TIME IS AN ARGUMENT. Where the original called `new Date()` inside the rule, the extracted function
 * takes `now` as a parameter defaulting to `new Date()`. Callers pass nothing, so behaviour is identical;
 * tests pass a fixed date so a boundary case cannot depend on the day the suite runs.
 */

const MS_PER_DAY = 1000 * 3600 * 24;

// =================================================================================================
// Date & duration maths
// =================================================================================================

/**
 * Whole days between two instants, floored.
 *
 * NOTE — PRESERVED QUIRK: a result of exactly -1 is reported as 0. This is the component's own
 * "same day, clock ran backwards by a few hours" guard (e.g. a record closed at 09:00 on the day it was
 * reported at 17:00 floors to -1). Any OTHER negative result is returned as-is, so -2 stays -2. That
 * asymmetry is almost certainly unintended, but it is the shipped behaviour and is pinned in the spec.
 */
export function flooredDayDiff(laterDate: Date | null | undefined, earlierDate: Date | null | undefined): number {
  const daysDiff = Math.floor((laterDate?.getTime() - earlierDate?.getTime()) / MS_PER_DAY);
  return daysDiff.toString() == '-1' ? 0 : daysDiff;
}

/** Days since `toDate`, as shown in the "days ago" columns. (component: calculateDaysAgo) */
export function calculateDaysAgo(fromDate: Date, toDate: Date): number {
  return flooredDayDiff(fromDate, toDate);
}

/** Days a support item stayed open, as a string for direct display. (component: calculateDaysClosed) */
export function calculateDaysClosed(reportedDate: Date, closedDate: Date): string {
  return flooredDayDiff(closedDate, reportedDate).toString();
}

/**
 * Days elapsed between a purchase and a comparison instant. Absent either date means 0 — an unknown
 * waiting period must not read as a long one.
 *
 * (component: calculateGrossWaitingPeriod / calculateAssuredWaitingPeriod / calculateDelayedDays — three
 * copies of the same arithmetic, differing only in which end defaults to "now".)
 */
export function waitingPeriodDays(purchaseDate: Date | null | undefined, comparisonDate: Date | null | undefined): number {
  if (!purchaseDate || !comparisonDate) return 0;
  const timeDifference = comparisonDate.getTime() - purchaseDate.getTime();
  return Math.floor(timeDifference / MS_PER_DAY);
}

/** Recency bands used to colour the participant tables. */
export const RECENCY_BAND_1_MAX_DAYS = 30;   // 1 month or less
export const RECENCY_BAND_2_MAX_DAYS = 90;   // 2-3 months
export const RECENCY_BAND_3_MAX_DAYS = 180;  // 3-6 months

/**
 * Which recency band a date falls into: 1, 2, 3 or 4 (> 6 months).
 *
 * The bounds are INCLUSIVE — exactly 30 days is band 1, exactly 90 is band 2, exactly 180 is band 3.
 *
 * NOTE — PRESERVED QUIRK: the difference is `Math.abs(...)`, so a date 200 days in the FUTURE bands
 * identically to one 200 days in the past. Callers only ever pass past dates today, but the absolute
 * value is the shipped behaviour and is pinned in the spec.
 *
 * (component: getDateDifferenceCategoryCode — the Timestamp/string/Date normalisation stays there.)
 */
export function dateDifferenceCategoryCode(date: Date, now: Date = new Date()): number {
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / MS_PER_DAY);

  if (diffDays <= RECENCY_BAND_1_MAX_DAYS) return 1;
  if (diffDays <= RECENCY_BAND_2_MAX_DAYS) return 2;
  if (diffDays <= RECENCY_BAND_3_MAX_DAYS) return 3;
  return 4;
}

/**
 * Urgency class for a tentative journey start: already past is 'overdue' (red), within one calendar month
 * is 'approaching' (orange), further out is unstyled.
 *
 * (component: getColumnClass. The original built "one month from now" from a second `new Date()` call
 * milliseconds after the first; here both derive from the single `now` argument.)
 */
export function columnClassFor(tentativeStart: Date, now: Date = new Date()): string {
  const oneMonthFromNow = new Date(now.getTime());
  oneMonthFromNow.setMonth(now.getMonth() + 1);

  if (tentativeStart < now) {
    return 'overdue'; // red
  } else if (tentativeStart <= oneMonthFromNow) {
    return 'approaching'; // orange
  } else {
    return ''; // no color change
  }
}

// =================================================================================================
// Interim crossover comparison — the progressed / regressed rules
// =================================================================================================

/** The one metric cell the comparison reads for a category. */
export interface InterimMetricCell {
  startpoint?: number | string | null;
  endpoint?: number | string | null;
  sequence?: number | string | null;
}

export type InterimMetric = Record<string, InterimMetricCell | undefined>;

export interface InterimComparison {
  status: 'no change' | 'changed';
  progressedAreas: string[];
  regressedAreas: string[];
  changedCount: number | 'all';
}

/** The five life areas compared on every interim crossover. */
export const CATEGORIES = ['Business', 'Career', 'Family', 'Health', 'Personal Genius'];

/** Number of areas that counts as "all" of them. */
export const ALL_AREAS = 5;

/**
 * Bucket an area count for the breakdown bars: 5 of 5 collapses to the 'all' bucket, anything else keeps
 * its number. (component: mapRawResultToMonthSummary, applied to progressed and regressed independently.)
 */
export function areaBucket(count: number): number | 'all' {
  return count === ALL_AREAS ? 'all' : count;
}

/**
 * Compare a participant's current interim crossover against their previous one.
 *
 * The rules, unchanged:
 * - If EVERY category has the same startpoint AND endpoint, it is 'no change' with a changedCount of 0.
 *   This short-circuits before sequences are consulted at all.
 * - Otherwise each category is judged by its AEL `sequence`: a higher number progressed, a lower number
 *   regressed. A category with a null sequence on either side is skipped — unknown is not movement.
 * - changedCount is progressed + regressed, collapsing to 'all' at 5.
 * - A profile can be in BOTH the progressed and regressed lists; the two are independent.
 *
 * NOTE — PRESERVED QUIRK: a doc whose startpoints/endpoints differ but whose sequences are all null or
 * all equal falls through the `allSame` guard and lands in the else-branch with two empty area lists, so
 * `status` is recomputed as 'no change' with changedCount 0. Same outcome, longer road.
 *
 * (component: fetchAELAndInterimData's inner comparison — the Firestore reads and AEL lookup stay there.)
 */
export function compareInterimMetrics(
  currentMetric: InterimMetric,
  previousMetric: InterimMetric,
  categories: string[] = CATEGORIES,
): InterimComparison {
  const allSame = categories.every(cat => {
    const curr = currentMetric?.[cat];
    const prev = previousMetric?.[cat];
    return curr?.startpoint === prev?.startpoint && curr?.endpoint === prev?.endpoint;
  });

  if (allSame) {
    return { status: 'no change', progressedAreas: [], regressedAreas: [], changedCount: 0 };
  }

  const progressedAreas: string[] = [];
  const regressedAreas: string[] = [];

  categories.forEach(cat => {
    const currSeq = currentMetric?.[cat]?.sequence ?? null;
    const prevSeq = previousMetric?.[cat]?.sequence ?? null;
    if (currSeq != null && prevSeq != null) {
      if (Number(currSeq) > Number(prevSeq)) progressedAreas.push(cat);
      else if (Number(currSeq) < Number(prevSeq)) regressedAreas.push(cat);
    }
  });

  const totalChanged = progressedAreas.length + regressedAreas.length;
  const changedCount: number | 'all' = areaBucket(totalChanged);

  const isProgressed = progressedAreas.length > 0;
  const isRegressed = regressedAreas.length > 0;
  const isNoChange = !isProgressed && !isRegressed;

  return {
    status: isNoChange ? 'no change' : 'changed',
    progressedAreas,
    regressedAreas,
    changedCount,
  };
}

/** How one category moved for one profile. (component: getCategoryChangeType) */
export function categoryChangeType(
  profile: { progressedAreas: string[]; regressedAreas: string[] },
  category: string,
): 'up' | 'dn' | 'nc' {
  if (profile.progressedAreas.includes(category)) return 'up';
  if (profile.regressedAreas.includes(category)) return 'dn';
  return 'nc';
}

/** Glyph for a change type. (component: getCategoryArrow) */
export function categoryArrow(changeType: 'up' | 'dn' | 'nc'): string {
  return changeType === 'up' ? '↑' : changeType === 'dn' ? '↓' : '→';
}

/** Wording for a change type. (component: getCategoryStatusLabel) */
export function categoryStatusLabel(changeType: 'up' | 'dn' | 'nc'): string {
  return changeType === 'up' ? 'Progressed' : changeType === 'dn' ? 'Regressed' : 'No change';
}

/** Every area that moved, progressed first. (component: getAllChangedAreas) */
export function allChangedAreas(profile: { progressedAreas: string[]; regressedAreas: string[] }): string[] {
  return [...profile.progressedAreas, ...profile.regressedAreas];
}

/**
 * The count badge takes the 'all' style when every area moved, otherwise the direction's own style.
 * (component: getCountBadgeClass)
 */
export function countBadgeClass(changedCount: number | 'all', statusType: 'up' | 'dn' | 'nc'): string {
  return changedCount === 'all' ? 'all' : statusType;
}

// =================================================================================================
// Breakdown bars & labels
// =================================================================================================

/** The tallest bar in a breakdown, never below 1 so a bar can always be drawn. (component: getMaxValue) */
export function maxBreakdownValue(breakdownMap: Record<string | number, number>): number {
  return Math.max(...Object.values(breakdownMap), 1);
}

/**
 * A bar's width as a whole percentage of the tallest bar. The denominator is clamped to at least 1, so an
 * all-zero breakdown yields 0% rather than NaN. (component: getBarWidthPercent)
 */
export function barWidthPercent(value: number, maxValue: number): number {
  return Math.round((value / Math.max(maxValue, 1)) * 100);
}

/** "3 Areas" / "1 Area" / "All Areas". (component: getAreaLabel) */
export function areaLabel(areaKey: number | 'all'): string {
  return areaKey === 'all' ? 'All Areas' : `${areaKey} Area${areaKey > 1 ? 's' : ''}`;
}

/**
 * Up to two initials from a name, uppercased. An empty name becomes '?'.
 * (component: getInitials)
 */
export function initialsFor(name: string): string {
  return (name || '?').split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Compress a "September 2026" month label into the tab's "Sep 26".
 * (component: getTabLabel)
 */
export function tabLabelFor(monthLabel: string): string {
  const parts = monthLabel.split(' ');
  return `${parts[0].slice(0, 3)} ${parts[1].slice(2)}`;
}

// =================================================================================================
// Evolution progress banding
// =================================================================================================

export interface EvolutionEntry {
  profileId: string;
  sum: number;
  docTotal: number;
}

export interface EvolutionProfile {
  profileId: string;
  profileName: string;
  total: number;
  pct: number;
}

export interface EvolutionBand {
  label: string;
  range: [number, number];
  profiles: Record<string, EvolutionProfile[]>;
}

export interface EvolutionProgressData {
  keys: string[];
  bands: EvolutionBand[];
  totals: Record<string, number>;
}

/**
 * The four completion bands. Lower bound INCLUSIVE, upper bound EXCLUSIVE — so 25% is the first entry of
 * the "25 – 50%" band, not the last of "< 25%". The top band ends at 101 so a clean 100% still lands
 * inside it; anything above 100 (which the arithmetic cannot produce today) would fall into no band at
 * all and be silently dropped.
 */
export function evolutionBands(): EvolutionBand[] {
  return [
    { label: '< 25%', range: [0, 25] as [number, number], profiles: {} as Record<string, EvolutionProfile[]> },
    { label: '25 – 50%', range: [25, 50] as [number, number], profiles: {} as Record<string, EvolutionProfile[]> },
    { label: '50 – 75%', range: [50, 75] as [number, number], profiles: {} as Record<string, EvolutionProfile[]> },
    { label: '75 – 100%', range: [75, 101] as [number, number], profiles: {} as Record<string, EvolutionProfile[]> },
  ];
}

/** A profile's completion percentage for one key. A zero (or absent) denominator is 0%, not NaN. */
export function evolutionPct(sum: number, docTotal: number): number {
  return docTotal > 0 ? Math.round((sum / docTotal) * 100) : 0;
}

/**
 * Band every profile against every adjustment key, and total each key.
 *
 * `profileNames` is the component's `mapprofile` lookup; an unknown profile falls back to displaying its
 * own id rather than a blank.
 *
 * (component: processEvolutionProgressFromMap — the assignment to `this` and markForCheck stay there.)
 */
export function buildEvolutionProgress(
  keyProfileMap: Record<string, EvolutionEntry[]>,
  profileNames: Record<string, string> = {},
): EvolutionProgressData {
  const keys = Object.keys(keyProfileMap);
  const bands = evolutionBands();
  const totals: Record<string, number> = {};

  keys.forEach(key => {
    const allEntries = keyProfileMap[key];
    totals[key] = allEntries.reduce((a, b) => a + b.sum, 0);

    allEntries.forEach(({ profileId, sum, docTotal }) => {
      const pct = evolutionPct(sum, docTotal);
      const profileName = profileNames[profileId] ?? profileId;
      const profile = { profileId, profileName, total: sum, pct };
      const band = bands.find(b => pct >= b.range[0] && pct < b.range[1]);
      if (band) {
        if (!band.profiles[key]) band.profiles[key] = [];
        band.profiles[key].push(profile);
      }
    });
  });

  return { keys, bands, totals };
}

/**
 * Every band a profile appears in, strongest completion first.
 * (component: getProfileAllKeyData)
 */
export function profileAllKeyData(
  data: EvolutionProgressData | null,
  profileId: string,
): { key: string; count: number; pct: number; bandIdx: number }[] {
  if (!data) return [];
  const result: { key: string; count: number; pct: number; bandIdx: number }[] = [];

  data.keys.forEach(key => {
    data.bands.forEach((band, bandIdx) => {
      const entry = band.profiles[key]?.find(p => p.profileId === profileId);
      if (entry) {
        result.push({ key, count: entry.total, pct: entry.pct, bandIdx });
      }
    });
  });

  return result.sort((a, b) => b.pct - a.pct);
}

// =================================================================================================
// Health overview
// =================================================================================================

export interface HealthKeyDatum {
  key: string;
  count: number;
  pct: number;
  barPct: number;
  profileCount: number;
  color: string;
  tag: string;
  tagBg: string;
  tagColor: string;
}

/** Rank colours, best-performing key first. Ranks past the fifth fall back to a neutral grey. */
export const HEALTH_COLORS = ['#639922', '#1D9E75', '#378ADD', '#EF9F27', '#E24B4A'];
export const HEALTH_FALLBACK_COLOR = '#888780';

/** Rank labels and their chip colours, best-performing key first. */
export const HEALTH_TAGS = [
  { t: 'Top key', bg: '#EAF3DE', c: '#27500A' },
  { t: 'Strong', bg: '#E1F5EE', c: '#085041' },
  { t: 'Moderate', bg: '#E6F1FB', c: '#0C447C' },
  { t: 'Watch', bg: '#FAEEDA', c: '#633806' },
  { t: 'At risk', bg: '#FCEBEB', c: '#791F1F' },
];
export const HEALTH_FALLBACK_TAG_BG = '#F1EFE8';
export const HEALTH_FALLBACK_TAG_COLOR = '#444441';

/**
 * A profile's "dominant key" is the adjustment key it has the highest total against; ties go to whichever
 * key Object.entries yields first. Each profile is counted once, against that key only.
 * (component: buildHealthOverview, inner loop.)
 */
export function dominantKeyCounts(data: EvolutionProgressData | null): Record<string, number> {
  const profileCountPerKey: Record<string, number> = {};
  if (!data) return profileCountPerKey;

  const profileAllAreas: Record<string, Record<string, number>> = {};
  data.keys.forEach(k => {
    data.bands.forEach(band => {
      (band.profiles[k] ?? []).forEach(p => {
        if (!profileAllAreas[p.profileId]) profileAllAreas[p.profileId] = {};
        profileAllAreas[p.profileId][k] = (profileAllAreas[p.profileId][k] ?? 0) + p.total;
      });
    });
  });
  Object.entries(profileAllAreas).forEach(([, areas]) => {
    const dominant = Object.entries(areas).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) profileCountPerKey[dominant] = (profileCountPerKey[dominant] ?? 0) + 1;
  });

  return profileCountPerKey;
}

/**
 * Rank adjustment keys by volume and dress each with a share, a bar width, a colour and a risk tag.
 *
 * - `pct` is the key's share of ALL adjustments; `barPct` is its share of the LARGEST key, so the top key
 *   always draws a full-width bar.
 * - Colour and tag come from RANK, not from the percentage: the fifth-busiest key reads "At risk"
 *   whatever its actual share.
 * - A total of zero returns an empty list — the component's own guard, which leaves the previous overview
 *   on screen rather than rendering a division by zero.
 *
 * (component: buildHealthOverview — the assignment to `this`, the now-unused healthInsights reset and
 * markForCheck stay there.)
 */
export function buildHealthKeyData(
  evolutionMap: Record<string, number>,
  data: EvolutionProgressData | null,
): HealthKeyDatum[] {
  const total = Object.values(evolutionMap).reduce((a: number, b: number) => a + b, 0);
  if (total === 0) return [];

  const sorted: [string, number][] = (Object.entries(evolutionMap) as [string, number][])
    .sort((a, b) => b[1] - a[1]);

  const maxCount: number = sorted[0]?.[1] ?? 1;
  const profileCountPerKey = dominantKeyCounts(data);

  return sorted.map(([key, count], i) => ({
    key,
    count,
    pct: Math.round((count / total) * 100),
    barPct: Math.round((count / maxCount) * 100),
    profileCount: profileCountPerKey[key] ?? 0,
    color: HEALTH_COLORS[i] ?? HEALTH_FALLBACK_COLOR,
    tag: HEALTH_TAGS[i]?.t ?? '',
    tagBg: HEALTH_TAGS[i]?.bg ?? HEALTH_FALLBACK_TAG_BG,
    tagColor: HEALTH_TAGS[i]?.c ?? HEALTH_FALLBACK_TAG_COLOR,
  }));
}

// =================================================================================================
// Loading progress
// =================================================================================================

/** How many of the parallel loads have finished. (component: getLoadedCount) */
export function loadedCount(loadingStates: Record<string, boolean>): number {
  return Object.values(loadingStates).filter(state => state === true).length;
}

/**
 * Loading progress as a percentage. NOT rounded and NOT clamped — the progress bar consumes the raw
 * fraction. (component: getLoadingProgress; the markForCheck it also fired stays there.)
 */
export function loadingProgressPercent(loadingStates: Record<string, boolean>): number {
  const loaded = loadedCount(loadingStates);
  const total = Object.keys(loadingStates).length;
  return (loaded / total) * 100;
}

// =================================================================================================
// Participant counts — the bucketing predicates behind the table headers
// =================================================================================================

/**
 * "Pending" is a deliberately wide net: null, undefined, empty and the literal 'pending' all count, so a
 * sale with no status yet is treated as awaiting approval rather than as an unknown.
 * (component: getPendingCount)
 */
export function countPending(rows: any[]): number {
  return rows.filter((e) => [null, undefined, "", "pending"].includes(e['status']?.toLowerCase())).length;
}

/** Assured means a payment plan exists. (component: getAssuredCount) */
export function countAssured(rows: any[]): number {
  return rows.filter((e) => ![null, undefined, ""].includes(e['paymentplan'])).length;
}

/**
 * Not-assured counts only APPROVED sales with no payment plan — a pending sale without a plan is not yet
 * a gap. (component: getNotAssuredCount)
 */
export function countNotAssured(rows: any[]): number {
  return rows.filter((e) => [null, undefined, ""].includes(e['paymentplan']) && e['status']?.toLowerCase() == 'approved').length;
}

/** (component: getActiveCount) */
export function countActive(rows: any[]): number {
  return rows.filter((e) => e['customerstatus']?.toLowerCase() === 'active').length;
}

/** (component: getNonactiveCount) */
export function countNonactive(rows: any[]): number {
  return rows.filter((e) => e['customerstatus']?.toLowerCase() === 'non active').length;
}

/**
 * Discontinued rolls up three terminal states — discontinued, banned and late — into one count.
 * ('late' here means the participant is gone, matching the note in priority.engine.ts.)
 * (component: getDiscontinuedCount)
 */
export function countDiscontinued(rows: any[]): number {
  return rows.filter((e) => ['discontinued', 'banned', 'late'].includes(e['customerstatus']?.toLowerCase())).length;
}

// =================================================================================================
// Status class derivation
// =================================================================================================

/** (component: getSubStatusClass) */
export function subStatusClass(status: string): string {
  if (status === 'completed') return 'status-completed';
  if (status === 'ongoing') return 'status-ongoing';
  return '';
}

/**
 * Journey status class. Anything unrecognised — including an absent status — falls to 'js-null', which is
 * how participants with no journey status are grouped in the matrix.
 * (component: getStatusClass)
 */
export function journeyStatusClass(status: string): string {
  if (status === 'active') return 'js-active';
  if (status === 'non active') return 'js-nonactive';
  if (status === 'discontinued') return 'js-discontinued';
  return 'js-null';
}

// =================================================================================================
// Ask AH / Love Letter filtering
// =================================================================================================

export type AskAHSourceFilter = 'all' | 'askAH' | 'loveLetter';
export type AskAHResolvedFilter = 'all' | 'resolved' | 'unresolved';

/**
 * The two Ask AH filters compose: source narrows first, then resolution.
 *
 * NOTE the asymmetry, preserved: 'askAH' matches source === 'ask AH' exactly, while 'loveLetter' is the
 * COMPLEMENT (anything not 'ask AH'), so a doc with a missing source is filed under Love Letter.
 * Likewise 'resolved' requires `resolved === true`, but 'unresolved' is any falsy value.
 *
 * (component: getFilteredAskAHProfiles)
 */
export function filterAskAHProfiles(
  profiles: any[],
  sourceFilter: AskAHSourceFilter,
  resolvedFilter: AskAHResolvedFilter,
): any[] {
  let list = [...profiles];

  if (sourceFilter === 'askAH') {
    list = list.filter(p => p['source'] === 'ask AH');
  } else if (sourceFilter === 'loveLetter') {
    list = list.filter(p => p['source'] !== 'ask AH');
  }

  if (resolvedFilter === 'resolved') {
    list = list.filter(p => p['resolved'] === true);
  } else if (resolvedFilter === 'unresolved') {
    list = list.filter(p => !p['resolved']);
  }

  return list;
}

// =================================================================================================
// Table sorting & pagination
// =================================================================================================

/** (component: isDate) */
export function isDateLike(value: any): boolean {
  return value instanceof Date ||
    (typeof value === 'string' && !isNaN(Date.parse(value)));
}

/**
 * How two cells compare, before the direction is applied.
 *
 * The type ladder, unchanged: numeric-looking values compare numerically, then date-looking values
 * compare chronologically, and everything else compares with localeCompare.
 *
 * NOTE — PRESERVED QUIRK: `!isNaN(value)` treats the empty string and whitespace as numeric zero, so a
 * blank cell sorts alongside 0 rather than at either end.
 *
 * (component: sortTable's comparator.)
 */
export function compareCellValues(valueA: any, valueB: any, direction: 'asc' | 'desc'): number {
  if (valueA == null && valueB == null) return 0;
  if (valueA == null) return direction === 'asc' ? 1 : -1;
  if (valueB == null) return direction === 'asc' ? -1 : 1;

  let comparison = 0;

  if (!isNaN(valueA) && !isNaN(valueB)) {
    comparison = Number(valueA) - Number(valueB);
  } else if (isDateLike(valueA) && isDateLike(valueB)) {
    comparison = new Date(valueA).getTime() - new Date(valueB).getTime();
  } else {
    comparison = valueA.toString().localeCompare(valueB.toString());
  }

  return direction === 'asc' ? comparison : -comparison;
}

/**
 * Clicking a column header cycles asc → desc → unsorted, and clicking a DIFFERENT column starts that
 * column at asc. Unsorted restores the unfiltered order rather than reversing again.
 * (component: sortTable's state machine.)
 */
export function nextSortState(
  currentColumn: string | null,
  currentDirection: 'asc' | 'desc' | null,
  clickedColumn: string,
): { sortColumn: string | null; sortDirection: 'asc' | 'desc' | null } {
  if (currentColumn === clickedColumn) {
    if (currentDirection === 'asc') return { sortColumn: clickedColumn, sortDirection: 'desc' };
    if (currentDirection === 'desc') return { sortColumn: null, sortDirection: null };
  }
  return { sortColumn: clickedColumn, sortDirection: 'asc' };
}

/** Total pages for a row count. (component: calculatePagination) */
export function totalPagesFor(rowCount: number, itemsPerPage: number): number {
  return Math.ceil(rowCount / itemsPerPage);
}

/**
 * Clamp the current page after the row count or page size changed. A page past the end snaps back to the
 * last page — but only when there IS one, so an empty table keeps page 1 rather than snapping to 0.
 * (component: calculatePagination.)
 */
export function clampPage(currentPage: number, totalPages: number): number {
  if (currentPage > totalPages && totalPages > 0) return totalPages;
  return currentPage;
}

/** How many page buttons the pager shows at once. */
export const MAX_PAGES_TO_SHOW = 5;

/**
 * The window of page numbers to render. Up to MAX_PAGES_TO_SHOW pages show in full; beyond that a sliding
 * window centres on the current page and is pinned when it reaches either end, so the count of buttons
 * stays constant.
 * (component: getPageNumbers)
 */
export function pageNumbers(currentPage: number, totalPages: number, maxPagesToShow: number = MAX_PAGES_TO_SHOW): number[] {
  const pages: number[] = [];

  if (totalPages <= maxPagesToShow) {
    // Show all pages if total is less than max
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Show limited pages with ellipsis
    const halfRange = Math.floor(maxPagesToShow / 2);
    let start = Math.max(1, currentPage - halfRange);
    let end = Math.min(totalPages, start + maxPagesToShow - 1);

    // Adjust start if we're near the end
    if (end === totalPages) {
      start = Math.max(1, end - maxPagesToShow + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
  }

  return pages;
}

/** The sort glyph for a header: both arrows when the column is not the sorted one. (component: getSortIcon) */
export function sortIconFor(sortColumn: string, sortDirection: 'asc' | 'desc', columnKey: string): string {
  if (sortColumn !== columnKey) {
    return '⇅'; // Both arrows
  }
  return sortDirection === 'asc' ? '↑' : '↓';
}

// =================================================================================================
// Cell formatting rules (the non-Angular half — formatDate stays in the component, it needs DatePipe)
// =================================================================================================

/**
 * Indian-format currency with a symbol. Absent means '-', but a genuine 0 formats as ₹0 — the
 * `!value && value !== 0` guard exists precisely to keep zero visible.
 * (component: formatCurrency)
 */
export function formatCurrency(value: number, prefix?: string, mapValue?: string): string {
  if (!value && value !== 0) return '-';

  if (mapValue) {
    value = value[mapValue];
  }

  const symbol = prefix || '₹';
  const formatted = value.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  return `${symbol}${formatted}`;
}

/** Indian-format number with optional affixes; zero stays visible, absent is '-'. (component: formatNumber) */
export function formatNumber(value: number, prefix?: string, suffix?: string): string {
  if (!value && value !== 0) return '-';

  const formatted = value.toLocaleString('en-IN');
  return `${prefix || ''}${formatted}${suffix || ''}`;
}

/**
 * Resolve a value through a lookup table, optionally digging a key out of the value first — including
 * array access written as "[0].id".
 *
 * A miss anywhere falls back to the raw value's own string, so an unmapped id is displayed rather than
 * blanked. NOTE — PRESERVED QUIRK: the fallback is `||`, so a mapping that legitimately resolves to 0 or
 * to the empty string is discarded in favour of the raw value.
 *
 * (component: mapValue)
 */
export function mapValue(value: any, mapData?: { [key: string]: any }, mapKey?: string, mapValueProp?: string): string {
  if (!mapData) return value.toString();
  let tempMap = '';

  if (mapKey) {
    // Check if it's array access like "[0].id"
    if (mapKey.startsWith('[')) {
      const match = mapKey.match(/\[(\d+)\]\.?(.*)$/);
      if (match) {
        const index = parseInt(match[1]);
        const property = match[2];

        tempMap = value?.[index];
        if (property) {
          tempMap = tempMap?.[property];
        }
      }
    } else {
      tempMap = value?.[mapKey];
    }
  } else {
    tempMap = value;
  }

  tempMap = mapValueProp ? mapData[tempMap]?.[mapValueProp] : mapData[tempMap];
  return tempMap || value.toString();
}
