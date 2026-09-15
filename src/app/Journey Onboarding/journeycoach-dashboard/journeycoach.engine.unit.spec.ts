// journeycoach.engine.unit.spec.ts — unit tests for the Journey Coach dashboard's business rules.
//
// WHAT THIS PROTECTS: the arithmetic and decisions behind the coach's dashboard — how long a participant
// has been waiting, which recency band a date falls into, whether an interim crossover counts as
// progressed or regressed, how evolution-progress percentages are banded, how the health-key bars are
// weighted, ranked and tagged, and how the participant tables are counted, filtered, sorted and paged.
//
// WHY IT COULD NOT BE TESTED BEFORE: these were methods on a 5,592-line component that injects Firestore,
// Router, MatDialog, DatePipe and a ChangeDetectorRef. Standing that up to check a boundary was never
// worth it, so it was never done. e2e could assert the RENDERED number, but not the value either side of
// a `<=` — an off-by-one bands 90-day-old participants wrong and still renders a plausible figure.
// Extracted 2026-09-10 into journeycoach.engine.ts with the logic UNCHANGED, following the precedent of
// priority.engine.ts in ../journey-coach-health-dashboard.
//
// THRESHOLDS ARE ASSERTED BY VALUE ON PURPOSE. 30/90/180 days, the 25/50/75 completion bands, the five
// rank colours and their risk tags, and the five-area "all" collapse are product decisions. Changing one
// changes what a coach sees; it should turn these tests red rather than drift unnoticed.
//
// TIME IS PASSED IN. Every date rule takes `now` explicitly, so no case here depends on the day the suite
// runs. Cases marked PINNED BUG record shipped behaviour that looks unintended — they are pinned, NOT
// fixed, because this was a refactor. See the report in the task that created this file.
import {
  ALL_AREAS,
  CATEGORIES,
  HEALTH_COLORS,
  HEALTH_TAGS,
  MAX_PAGES_TO_SHOW,
  RECENCY_BAND_1_MAX_DAYS,
  RECENCY_BAND_2_MAX_DAYS,
  RECENCY_BAND_3_MAX_DAYS,
  allChangedAreas,
  areaBucket,
  areaLabel,
  barWidthPercent,
  buildEvolutionProgress,
  buildHealthKeyData,
  calculateDaysAgo,
  calculateDaysClosed,
  categoryArrow,
  categoryChangeType,
  categoryStatusLabel,
  clampPage,
  columnClassFor,
  compareCellValues,
  compareInterimMetrics,
  countActive,
  countAssured,
  countBadgeClass,
  countDiscontinued,
  countNonactive,
  countNotAssured,
  countPending,
  dateDifferenceCategoryCode,
  dominantKeyCounts,
  evolutionPct,
  filterAskAHProfiles,
  formatCurrency,
  formatNumber,
  initialsFor,
  isDateLike,
  journeyStatusClass,
  loadedCount,
  loadingProgressPercent,
  mapValue,
  maxBreakdownValue,
  nextSortState,
  pageNumbers,
  profileAllKeyData,
  sortIconFor,
  subStatusClass,
  tabLabelFor,
  totalPagesFor,
  waitingPeriodDays,
} from './journeycoach.engine';

/** A fixed "now" so no case depends on the day the suite runs. */
const NOW = new Date('2026-09-10T12:00:00Z');
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);
const daysAfter = (n: number) => new Date(NOW.getTime() + n * 24 * 3600 * 1000);

describe('journeycoach.engine', () => {

  // ===============================================================================================
  // JPU-60 — day-difference maths and its -1 quirk
  // ===============================================================================================
  describe('JPU-60 day differences', () => {
    it('counts whole elapsed days, floored', () => {
      expect(calculateDaysAgo(NOW, daysBefore(7))).toBe(7);
      expect(calculateDaysAgo(NOW, daysBefore(0))).toBe(0);
    });

    it('floors a partial day down rather than rounding it up', () => {
      // 6 days 23 hours is still 6 days, not 7 — the coach's "days since" must never overstate.
      const almostSeven = new Date(NOW.getTime() - (7 * 24 - 1) * 3600 * 1000);
      expect(calculateDaysAgo(NOW, almostSeven)).toBe(6);
    });

    it('reports days closed as a string', () => {
      expect(calculateDaysClosed(daysBefore(10), daysBefore(3))).toBe('7');
      expect(calculateDaysClosed(daysBefore(3), daysBefore(3))).toBe('0');
    });

    it('PINNED BUG: exactly -1 is reported as 0, but -2 is not', () => {
      // The -1 -> 0 guard covers a record closed earlier in the day it was reported. Any deeper
      // inversion escapes the guard and renders as a negative day count in the table. Shipped
      // behaviour, pinned rather than fixed.
      expect(calculateDaysAgo(daysBefore(1), NOW)).toBe(0);
      expect(calculateDaysAgo(daysBefore(2), NOW)).toBe(-2);
      expect(calculateDaysClosed(NOW, daysBefore(1))).toBe('0');
      expect(calculateDaysClosed(NOW, daysBefore(2))).toBe('-2');
    });
  });

  // ===============================================================================================
  // JPU-61 — waiting periods: absent dates must not read as long waits
  // ===============================================================================================
  describe('JPU-61 waiting periods', () => {
    it('counts elapsed days between purchase and comparison', () => {
      expect(waitingPeriodDays(daysBefore(45), NOW)).toBe(45);
    });

    it('is zero when either end is missing', () => {
      // An unknown waiting period must read as 0, never as "waiting since the epoch".
      expect(waitingPeriodDays(null, NOW)).toBe(0);
      expect(waitingPeriodDays(undefined, NOW)).toBe(0);
      expect(waitingPeriodDays(daysBefore(45), null)).toBe(0);
      expect(waitingPeriodDays(null, null)).toBe(0);
    });

    it('is zero on the day of purchase', () => {
      expect(waitingPeriodDays(NOW, NOW)).toBe(0);
    });

    it('goes negative for a future purchase date — no clamping', () => {
      expect(waitingPeriodDays(daysAfter(5), NOW)).toBe(-5);
    });
  });

  // ===============================================================================================
  // JPU-62 — recency bands: bounds are INCLUSIVE
  // ===============================================================================================
  describe('JPU-62 recency category code', () => {
    it('bands the documented ranges', () => {
      expect(dateDifferenceCategoryCode(daysBefore(0), NOW)).toBe(1);
      expect(dateDifferenceCategoryCode(daysBefore(60), NOW)).toBe(2);
      expect(dateDifferenceCategoryCode(daysBefore(120), NOW)).toBe(3);
      expect(dateDifferenceCategoryCode(daysBefore(365), NOW)).toBe(4);
    });

    it('treats every upper bound as inclusive', () => {
      expect(dateDifferenceCategoryCode(daysBefore(RECENCY_BAND_1_MAX_DAYS), NOW)).toBe(1);
      expect(dateDifferenceCategoryCode(daysBefore(RECENCY_BAND_2_MAX_DAYS), NOW)).toBe(2);
      expect(dateDifferenceCategoryCode(daysBefore(RECENCY_BAND_3_MAX_DAYS), NOW)).toBe(3);
    });

    it('moves to the next band one day past each bound', () => {
      expect(dateDifferenceCategoryCode(daysBefore(RECENCY_BAND_1_MAX_DAYS + 1), NOW)).toBe(2);
      expect(dateDifferenceCategoryCode(daysBefore(RECENCY_BAND_2_MAX_DAYS + 1), NOW)).toBe(3);
      expect(dateDifferenceCategoryCode(daysBefore(RECENCY_BAND_3_MAX_DAYS + 1), NOW)).toBe(4);
    });

    it('PINNED BUG: a future date bands as if it were equally far in the past', () => {
      // Math.abs() means a tentative date 200 days out reads "greater than 6 months" the same way a
      // contact 200 days stale does. Shipped behaviour, pinned rather than fixed.
      expect(dateDifferenceCategoryCode(daysAfter(200), NOW)).toBe(4);
      expect(dateDifferenceCategoryCode(daysAfter(10), NOW)).toBe(1);
    });
  });

  // ===============================================================================================
  // JPU-63 — schedule urgency class
  // ===============================================================================================
  describe('JPU-63 column urgency class', () => {
    it('marks a past start overdue', () => {
      expect(columnClassFor(daysBefore(1), NOW)).toBe('overdue');
    });

    it('marks a start within one calendar month approaching', () => {
      expect(columnClassFor(daysAfter(1), NOW)).toBe('approaching');
      expect(columnClassFor(daysAfter(25), NOW)).toBe('approaching');
    });

    it('leaves a start beyond one calendar month unstyled', () => {
      expect(columnClassFor(daysAfter(60), NOW)).toBe('');
    });

    it('treats the one-month boundary itself as approaching, not clear', () => {
      // The comparison is `<=`, so the last moment of the window is still orange.
      const oneMonthOut = new Date(NOW.getTime());
      oneMonthOut.setMonth(NOW.getMonth() + 1);
      expect(columnClassFor(oneMonthOut, NOW)).toBe('approaching');
      expect(columnClassFor(new Date(oneMonthOut.getTime() + 1), NOW)).toBe('');
    });

    it('a start exactly now is not yet overdue', () => {
      // `<` is strict, so the instant itself falls through to the approaching branch.
      expect(columnClassFor(new Date(NOW.getTime()), NOW)).toBe('approaching');
    });
  });

  // ===============================================================================================
  // JPU-64 — interim crossover: progressed vs regressed
  // ===============================================================================================
  describe('JPU-64 interim crossover comparison', () => {
    const cell = (startpoint: any, endpoint: any, sequence: any) => ({ startpoint, endpoint, sequence });

    /** Five categories all sitting still at the same point. */
    const flat = (seq = 1) => {
      const m: Record<string, any> = {};
      CATEGORIES.forEach(c => { m[c] = cell(1, 2, seq); });
      return m;
    };

    it('reports no change when every start and end point matches', () => {
      const r = compareInterimMetrics(flat(), flat());
      expect(r.status).toBe('no change');
      expect(r.changedCount).toBe(0);
      expect(r.progressedAreas).toEqual([]);
      expect(r.regressedAreas).toEqual([]);
    });

    it('counts a higher sequence as progressed and a lower one as regressed', () => {
      const prev = flat(3);
      const curr = flat(3);
      curr['Health'] = cell(1, 5, 6);
      curr['Career'] = cell(1, 0, 1);

      const r = compareInterimMetrics(curr, prev);
      expect(r.status).toBe('changed');
      expect(r.progressedAreas).toEqual(['Health']);
      expect(r.regressedAreas).toEqual(['Career']);
      expect(r.changedCount).toBe(2);
    });

    it('puts a profile in BOTH lists when it moved in both directions', () => {
      // The two lists are independent — this is the rule the dashboard depends on for its
      // progressed/regressed tabs, and a profile legitimately appears in each.
      const prev = flat(3);
      const curr = flat(3);
      curr['Health'] = cell(1, 5, 4);
      curr['Family'] = cell(1, 0, 2);
      const r = compareInterimMetrics(curr, prev);
      expect(r.progressedAreas.length).toBeGreaterThan(0);
      expect(r.regressedAreas.length).toBeGreaterThan(0);
    });

    it('skips a category whose sequence is unknown on either side', () => {
      // A null sequence means the AEL lookup found nothing. Unknown is not movement.
      const prev = flat(3);
      const curr = flat(3);
      curr['Health'] = cell(9, 9, null);
      const r = compareInterimMetrics(curr, prev);
      expect(r.progressedAreas).toEqual([]);
      expect(r.regressedAreas).toEqual([]);
    });

    it('collapses five moved areas to the "all" bucket', () => {
      const prev = flat(1);
      const curr: Record<string, any> = {};
      CATEGORIES.forEach(c => { curr[c] = cell(1, 9, 5); });
      const r = compareInterimMetrics(curr, prev);
      expect(r.progressedAreas.length).toBe(ALL_AREAS);
      expect(r.changedCount).toBe('all');
    });

    it('keeps four moved areas as the number four', () => {
      const prev = flat(1);
      const curr = flat(1);
      ['Business', 'Career', 'Family', 'Health'].forEach(c => { curr[c] = cell(1, 9, 5); });
      const r = compareInterimMetrics(curr, prev);
      expect(r.changedCount).toBe(4);
    });

    it('short-circuits on identical points BEFORE consulting sequences', () => {
      // Same start/end but a differing sequence (a re-mapped AEL row) must NOT read as movement.
      const prev = flat(1);
      const curr = flat(9);
      expect(compareInterimMetrics(curr, prev).status).toBe('no change');
    });

    it('PINNED ODDITY: changed points with equal sequences still resolve to no change', () => {
      // The allSame guard is false, so it takes the long branch — and comes out with two empty lists
      // and a recomputed 'no change'. Same answer, longer road; recorded so a refactor cannot alter it.
      const prev = flat(4);
      const curr = flat(4);
      curr['Health'] = cell(2, 7, 4);   // points differ, sequence identical
      const r = compareInterimMetrics(curr, prev);
      expect(r.status).toBe('no change');
      expect(r.changedCount).toBe(0);
    });

    it('honours a caller-supplied category list', () => {
      const prev = { Only: cell(1, 1, 1) };
      const curr = { Only: cell(1, 2, 5) };
      expect(compareInterimMetrics(curr, prev, ['Only']).progressedAreas).toEqual(['Only']);
    });
  });

  // ===============================================================================================
  // JPU-65 — area bucketing and its labels
  // ===============================================================================================
  describe('JPU-65 area buckets and labels', () => {
    it('collapses only the full five to "all"', () => {
      expect(areaBucket(4)).toBe(4);
      expect(areaBucket(5)).toBe('all');
      expect(areaBucket(0)).toBe(0);
    });

    it('singularises one area and pluralises the rest', () => {
      expect(areaLabel(1)).toBe('1 Area');
      expect(areaLabel(2)).toBe('2 Areas');
      expect(areaLabel('all')).toBe('All Areas');
    });

    it('gives the all-areas badge its own style, whatever the direction', () => {
      expect(countBadgeClass('all', 'up')).toBe('all');
      expect(countBadgeClass('all', 'dn')).toBe('all');
      expect(countBadgeClass(3, 'up')).toBe('up');
      expect(countBadgeClass(3, 'nc')).toBe('nc');
    });
  });

  // ===============================================================================================
  // JPU-66 — per-category change type and its wording
  // ===============================================================================================
  describe('JPU-66 category change type', () => {
    const profile = { progressedAreas: ['Health'], regressedAreas: ['Career'] };

    it('reads progressed, regressed and unchanged', () => {
      expect(categoryChangeType(profile, 'Health')).toBe('up');
      expect(categoryChangeType(profile, 'Career')).toBe('dn');
      expect(categoryChangeType(profile, 'Family')).toBe('nc');
    });

    it('resolves progressed FIRST when a category is somehow in both lists', () => {
      // Data should never produce this, but the order of the checks decides it, so it is pinned.
      const both = { progressedAreas: ['Health'], regressedAreas: ['Health'] };
      expect(categoryChangeType(both, 'Health')).toBe('up');
    });

    it('pairs each type with its glyph and its wording', () => {
      expect(categoryArrow('up')).toBe('↑');
      expect(categoryArrow('dn')).toBe('↓');
      expect(categoryArrow('nc')).toBe('→');
      expect(categoryStatusLabel('up')).toBe('Progressed');
      expect(categoryStatusLabel('dn')).toBe('Regressed');
      expect(categoryStatusLabel('nc')).toBe('No change');
    });

    it('lists changed areas progressed-first', () => {
      expect(allChangedAreas(profile)).toEqual(['Health', 'Career']);
      expect(allChangedAreas({ progressedAreas: [], regressedAreas: [] })).toEqual([]);
    });
  });

  // ===============================================================================================
  // JPU-67 — breakdown bars: no NaN, no divide-by-zero
  // ===============================================================================================
  describe('JPU-67 breakdown bars', () => {
    it('takes the tallest bar', () => {
      expect(maxBreakdownValue({ 1: 3, 2: 9, all: 4 })).toBe(9);
    });

    it('never drops below 1, so an all-zero breakdown still has a denominator', () => {
      expect(maxBreakdownValue({ 1: 0, 2: 0 })).toBe(1);
      expect(maxBreakdownValue({})).toBe(1);
    });

    it('scales a bar against the tallest and rounds', () => {
      expect(barWidthPercent(9, 9)).toBe(100);
      expect(barWidthPercent(3, 9)).toBe(33);   // 33.33 rounds down
      expect(barWidthPercent(5, 9)).toBe(56);   // 55.55 rounds up
      expect(barWidthPercent(0, 9)).toBe(0);
    });

    it('yields 0 rather than NaN when the max is zero or negative', () => {
      expect(barWidthPercent(0, 0)).toBe(0);
      expect(barWidthPercent(0, -5)).toBe(0);
    });
  });

  // ===============================================================================================
  // JPU-68 — small display rules
  // ===============================================================================================
  describe('JPU-68 initials and tab labels', () => {
    it('takes up to two initials, uppercased', () => {
      expect(initialsFor('meena kumari')).toBe('MK');
      expect(initialsFor('Ada')).toBe('A');
      expect(initialsFor('Ada Grace Byron King')).toBe('AG');
    });

    it('falls back to ? for an empty name', () => {
      expect(initialsFor('')).toBe('?');
      expect(initialsFor(null as any)).toBe('?');
    });

    it('compresses a month label into a tab label', () => {
      expect(tabLabelFor('September 2026')).toBe('Sep 26');
      expect(tabLabelFor('May 2025')).toBe('May 25');
    });
  });

  // ===============================================================================================
  // JPU-69 — evolution progress: percentages and band edges
  // ===============================================================================================
  describe('JPU-69 evolution progress banding', () => {
    it('rounds a completion percentage', () => {
      expect(evolutionPct(1, 3)).toBe(33);
      expect(evolutionPct(2, 3)).toBe(67);
      expect(evolutionPct(4, 4)).toBe(100);
    });

    it('treats a zero or negative denominator as 0%, never NaN', () => {
      expect(evolutionPct(5, 0)).toBe(0);
      expect(evolutionPct(5, -1)).toBe(0);
    });

    const bandIndexOf = (sum: number, docTotal: number): number => {
      const data = buildEvolutionProgress({ K: [{ profileId: 'p1', sum, docTotal }] });
      return data.bands.findIndex(b => (b.profiles['K'] ?? []).length > 0);
    };

    it('places a percentage on its band with the LOWER bound inclusive', () => {
      // 25% starts the second band; 24% ends the first.
      expect(bandIndexOf(24, 100)).toBe(0);
      expect(bandIndexOf(25, 100)).toBe(1);
      expect(bandIndexOf(49, 100)).toBe(1);
      expect(bandIndexOf(50, 100)).toBe(2);
      expect(bandIndexOf(74, 100)).toBe(2);
      expect(bandIndexOf(75, 100)).toBe(3);
      expect(bandIndexOf(100, 100)).toBe(3);   // the top band runs to 101 so a clean 100 lands inside
    });

    it('places 0% in the first band', () => {
      expect(bandIndexOf(0, 100)).toBe(0);
    });

    it('totals each key across every profile', () => {
      const data = buildEvolutionProgress({
        K: [
          { profileId: 'p1', sum: 3, docTotal: 10 },
          { profileId: 'p2', sum: 7, docTotal: 10 },
        ],
      });
      expect(data.totals['K']).toBe(10);
      expect(data.keys).toEqual(['K']);
    });

    it('names a profile from the lookup, falling back to its id', () => {
      const data = buildEvolutionProgress(
        { K: [{ profileId: 'p1', sum: 1, docTotal: 10 }, { profileId: 'p9', sum: 1, docTotal: 10 }] },
        { p1: 'Ada Lovelace' },
      );
      const names = data.bands[0].profiles['K'].map(p => p.profileName);
      expect(names).toEqual(['Ada Lovelace', 'p9']);
    });

    it('handles an empty map without throwing', () => {
      const data = buildEvolutionProgress({});
      expect(data.keys).toEqual([]);
      expect(data.bands.length).toBe(4);
    });

    it('PINNED BUG: a percentage above 100 falls into no band and is silently dropped', () => {
      // The top band ends at 101. Today's arithmetic cannot exceed 100, but if a sum ever outran its
      // docTotal the profile would vanish from the display rather than pile into the top band.
      const data = buildEvolutionProgress({ K: [{ profileId: 'p1', sum: 20, docTotal: 10 }] });
      expect(data.bands.every(b => (b.profiles['K'] ?? []).length === 0)).toBe(true);
      expect(data.totals['K']).toBe(20);   // it still counts toward the total, just not to a band
    });

    it('lists every band a profile appears in, strongest completion first', () => {
      const data = buildEvolutionProgress({
        Low: [{ profileId: 'p1', sum: 1, docTotal: 10 }],     // 10%
        High: [{ profileId: 'p1', sum: 8, docTotal: 10 }],    // 80%
      });
      const rows = profileAllKeyData(data, 'p1');
      expect(rows.map(r => r.key)).toEqual(['High', 'Low']);
      expect(rows[0].pct).toBe(80);
      expect(rows[0].bandIdx).toBe(3);
    });

    it('returns nothing for an unknown profile or absent data', () => {
      expect(profileAllKeyData(null, 'p1')).toEqual([]);
      const data = buildEvolutionProgress({ K: [{ profileId: 'p1', sum: 1, docTotal: 10 }] });
      expect(profileAllKeyData(data, 'nobody')).toEqual([]);
    });
  });

  // ===============================================================================================
  // JPU-70 — health overview: shares, bar widths, rank colours and tags
  // ===============================================================================================
  describe('JPU-70 health key data', () => {
    it('ranks keys by volume, busiest first', () => {
      const out = buildHealthKeyData({ a: 5, b: 20, c: 10 }, null);
      expect(out.map(k => k.key)).toEqual(['b', 'c', 'a']);
    });

    it('reports pct as a share of the total and barPct as a share of the largest', () => {
      // The distinction matters: the top key always draws a full bar even at a 57% share.
      const out = buildHealthKeyData({ b: 20, c: 10, a: 5 }, null);
      expect(out[0].pct).toBe(57);       // 20/35
      expect(out[0].barPct).toBe(100);   // 20/20
      expect(out[1].pct).toBe(29);       // 10/35
      expect(out[1].barPct).toBe(50);    // 10/20
    });

    it('assigns colour and risk tag by RANK, not by percentage', () => {
      const out = buildHealthKeyData({ a: 5, b: 4, c: 3, d: 2, e: 1 }, null);
      expect(out.map(k => k.color)).toEqual(HEALTH_COLORS);
      expect(out.map(k => k.tag)).toEqual(HEALTH_TAGS.map(t => t.t));
      expect(out[4].tag).toBe('At risk');
    });

    it('falls back to neutral styling past the fifth key', () => {
      const out = buildHealthKeyData({ a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 }, null);
      expect(out[5].color).toBe('#888780');
      expect(out[5].tag).toBe('');
      expect(out[5].tagBg).toBe('#F1EFE8');
      expect(out[5].tagColor).toBe('#444441');
    });

    it('returns nothing when the total is zero, so the previous overview is left alone', () => {
      expect(buildHealthKeyData({}, null)).toEqual([]);
      expect(buildHealthKeyData({ a: 0, b: 0 }, null)).toEqual([]);
    });

    it('counts each profile once, against its single dominant key', () => {
      const data = buildEvolutionProgress({
        alpha: [{ profileId: 'p1', sum: 9, docTotal: 10 }, { profileId: 'p2', sum: 1, docTotal: 10 }],
        beta: [{ profileId: 'p1', sum: 2, docTotal: 10 }, { profileId: 'p2', sum: 8, docTotal: 10 }],
      });
      // p1 leans alpha (9 vs 2), p2 leans beta (8 vs 1) — one profile each, not two.
      expect(dominantKeyCounts(data)).toEqual({ alpha: 1, beta: 1 });
    });

    it('reports no profile counts when there is no evolution data', () => {
      expect(dominantKeyCounts(null)).toEqual({});
      const out = buildHealthKeyData({ a: 5 }, null);
      expect(out[0].profileCount).toBe(0);
    });
  });

  // ===============================================================================================
  // JPU-71 — loading progress
  // ===============================================================================================
  describe('JPU-71 loading progress', () => {
    it('counts only the states that are strictly true', () => {
      expect(loadedCount({ a: true, b: false, c: true })).toBe(2);
      expect(loadedCount({} as any)).toBe(0);
    });

    it('reports an unrounded percentage', () => {
      // The progress bar consumes the raw fraction — a third of three loads is 33.33…, not 33.
      expect(loadingProgressPercent({ a: true, b: false, c: false })).toBeCloseTo(33.333, 3);
      expect(loadingProgressPercent({ a: true, b: true })).toBe(100);
      expect(loadingProgressPercent({ a: false })).toBe(0);
    });
  });

  // ===============================================================================================
  // JPU-72 — participant counts: the bucketing predicates
  // ===============================================================================================
  describe('JPU-72 participant counts', () => {
    it('treats an absent status as pending, not as unknown', () => {
      const rows = [{ status: 'Pending' }, { status: null }, { status: '' }, {}, { status: 'Approved' }];
      expect(countPending(rows)).toBe(4);
    });

    it('matches pending case-insensitively', () => {
      expect(countPending([{ status: 'PENDING' }, { status: 'pending' }])).toBe(2);
    });

    it('counts assured by the presence of a payment plan', () => {
      const rows = [{ paymentplan: 'EMI' }, { paymentplan: '' }, { paymentplan: null }, {}];
      // An absent key is undefined, which is in the exclusion list — only the real plan counts.
      expect(countAssured(rows)).toBe(1);
    });

    it('counts as not-assured only APPROVED sales with no plan', () => {
      const rows = [
        { paymentplan: null, status: 'Approved' },   // counts
        { paymentplan: '', status: 'approved' },     // counts, case-insensitive
        { paymentplan: null, status: 'Pending' },    // pending is not yet a gap
        { paymentplan: 'EMI', status: 'Approved' },  // already assured
      ];
      expect(countNotAssured(rows)).toBe(2);
    });

    it('counts customer statuses case-insensitively', () => {
      const rows = [
        { customerstatus: 'Active' }, { customerstatus: 'active' },
        { customerstatus: 'Non Active' }, { customerstatus: 'Discontinued' },
        { customerstatus: 'Banned' }, { customerstatus: 'Late' }, {},
      ];
      expect(countActive(rows)).toBe(2);
      expect(countNonactive(rows)).toBe(1);
      // Discontinued rolls up three terminal states.
      expect(countDiscontinued(rows)).toBe(3);
    });

    it('counts nothing in an empty table', () => {
      expect(countPending([])).toBe(0);
      expect(countActive([])).toBe(0);
      expect(countDiscontinued([])).toBe(0);
    });
  });

  // ===============================================================================================
  // JPU-73 — status classes
  // ===============================================================================================
  describe('JPU-73 status classes', () => {
    it('maps the two known subscription statuses and blanks the rest', () => {
      expect(subStatusClass('completed')).toBe('status-completed');
      expect(subStatusClass('ongoing')).toBe('status-ongoing');
      expect(subStatusClass('cancelled')).toBe('');
      expect(subStatusClass(null as any)).toBe('');
    });

    it('falls anything unrecognised into the js-null group', () => {
      expect(journeyStatusClass('active')).toBe('js-active');
      expect(journeyStatusClass('non active')).toBe('js-nonactive');
      expect(journeyStatusClass('discontinued')).toBe('js-discontinued');
      expect(journeyStatusClass('banned')).toBe('js-null');
      expect(journeyStatusClass(null as any)).toBe('js-null');
    });

    it('matches statuses case-SENSITIVELY — an uppercase status falls through', () => {
      // Unlike the count predicates, these do not lower-case. Callers pass already-normalised values;
      // pinned so a future caller change is caught here rather than by a mis-coloured cell.
      expect(journeyStatusClass('Active')).toBe('js-null');
      expect(subStatusClass('Completed')).toBe('');
    });
  });

  // ===============================================================================================
  // JPU-74 — Ask AH / Love Letter filtering
  // ===============================================================================================
  describe('JPU-74 Ask AH filtering', () => {
    const docs = [
      { source: 'ask AH', resolved: true },
      { source: 'ask AH', resolved: false },
      { source: 'love letter', resolved: true },
      { resolved: false },                        // no source at all
    ];

    it('returns everything when both filters are all', () => {
      expect(filterAskAHProfiles(docs, 'all', 'all').length).toBe(4);
    });

    it('matches Ask AH exactly but Love Letter by complement', () => {
      expect(filterAskAHProfiles(docs, 'askAH', 'all').length).toBe(2);
      // A doc with NO source is filed under Love Letter, because that branch is "not ask AH".
      expect(filterAskAHProfiles(docs, 'loveLetter', 'all').length).toBe(2);
    });

    it('requires resolved === true, but accepts any falsy value as unresolved', () => {
      expect(filterAskAHProfiles(docs, 'all', 'resolved').length).toBe(2);
      expect(filterAskAHProfiles(docs, 'all', 'unresolved').length).toBe(2);
      expect(filterAskAHProfiles([{ resolved: 'yes' }], 'all', 'resolved').length).toBe(0);
      expect(filterAskAHProfiles([{ resolved: undefined }], 'all', 'unresolved').length).toBe(1);
    });

    it('composes the two filters', () => {
      const out = filterAskAHProfiles(docs, 'askAH', 'unresolved');
      expect(out.length).toBe(1);
      expect(out[0].resolved).toBe(false);
    });

    it('never mutates the list it was given', () => {
      const input = [...docs];
      filterAskAHProfiles(input, 'askAH', 'resolved');
      expect(input.length).toBe(4);
    });
  });

  // ===============================================================================================
  // JPU-75 — cell comparison and the sort-direction cycle
  // ===============================================================================================
  describe('JPU-75 sorting', () => {
    it('sorts numeric-looking cells numerically, not as text', () => {
      // The whole point: '10' must come after '9', which localeCompare would get wrong.
      expect(compareCellValues('9', '10', 'asc')).toBeLessThan(0);
      expect(compareCellValues('9', '10', 'desc')).toBeGreaterThan(0);
    });

    it('sorts date-looking cells chronologically', () => {
      expect(compareCellValues('2026-01-01', '2026-06-01', 'asc')).toBeLessThan(0);
    });

    it('falls back to a text comparison', () => {
      expect(compareCellValues('apple', 'banana', 'asc')).toBeLessThan(0);
      expect(compareCellValues('apple', 'banana', 'desc')).toBeGreaterThan(0);
    });

    it('pushes nulls to the end ascending and to the front descending', () => {
      expect(compareCellValues(null, 'a', 'asc')).toBe(1);
      expect(compareCellValues('a', null, 'asc')).toBe(-1);
      expect(compareCellValues(null, 'a', 'desc')).toBe(-1);
      expect(compareCellValues(null, null, 'asc')).toBe(0);
      expect(compareCellValues(undefined, undefined, 'asc')).toBe(0);
    });

    it('PINNED BUG: a blank cell sorts as if it were the number zero', () => {
      // !isNaN('') is true, so '' becomes 0 and lands among the numbers rather than at either end.
      expect(compareCellValues('', '5', 'asc')).toBeLessThan(0);
      expect(compareCellValues('', '-5', 'asc')).toBeGreaterThan(0);
    });

    it('cycles asc -> desc -> unsorted on the same column', () => {
      expect(nextSortState(null, null, 'name')).toEqual({ sortColumn: 'name', sortDirection: 'asc' });
      expect(nextSortState('name', 'asc', 'name')).toEqual({ sortColumn: 'name', sortDirection: 'desc' });
      expect(nextSortState('name', 'desc', 'name')).toEqual({ sortColumn: null, sortDirection: null });
    });

    it('starts a different column fresh at ascending', () => {
      expect(nextSortState('name', 'desc', 'email')).toEqual({ sortColumn: 'email', sortDirection: 'asc' });
    });

    it('shows both arrows on an unsorted column', () => {
      expect(sortIconFor('name', 'asc', 'email')).toBe('⇅');
      expect(sortIconFor('name', 'asc', 'name')).toBe('↑');
      expect(sortIconFor('name', 'desc', 'name')).toBe('↓');
    });

    it('recognises dates and rejects plain words', () => {
      expect(isDateLike(new Date())).toBe(true);
      expect(isDateLike('2026-09-10')).toBe(true);
      expect(isDateLike('not a date')).toBe(false);
      expect(isDateLike(42)).toBe(false);
      expect(isDateLike(null)).toBe(false);
    });
  });

  // ===============================================================================================
  // JPU-76 — pagination
  // ===============================================================================================
  describe('JPU-76 pagination', () => {
    it('rounds a partial page up', () => {
      expect(totalPagesFor(0, 10)).toBe(0);
      expect(totalPagesFor(1, 10)).toBe(1);
      expect(totalPagesFor(10, 10)).toBe(1);
      expect(totalPagesFor(11, 10)).toBe(2);
    });

    it('snaps a page past the end back to the last page', () => {
      expect(clampPage(9, 3)).toBe(3);
      expect(clampPage(2, 3)).toBe(2);
    });

    it('leaves page 1 alone when the table is empty', () => {
      // The `totalPages > 0` guard exists so an empty table does not land on page 0.
      expect(clampPage(1, 0)).toBe(1);
      expect(clampPage(5, 0)).toBe(5);
    });

    it('shows every page when they fit', () => {
      expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
      expect(pageNumbers(1, MAX_PAGES_TO_SHOW)).toEqual([1, 2, 3, 4, 5]);
      expect(pageNumbers(1, 0)).toEqual([]);
    });

    it('centres a sliding window on the current page', () => {
      expect(pageNumbers(5, 20)).toEqual([3, 4, 5, 6, 7]);
    });

    it('pins the window at each end and keeps the button count constant', () => {
      expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5]);
      expect(pageNumbers(2, 20)).toEqual([1, 2, 3, 4, 5]);
      expect(pageNumbers(20, 20)).toEqual([16, 17, 18, 19, 20]);
      expect(pageNumbers(19, 20)).toEqual([16, 17, 18, 19, 20]);
    });
  });

  // ===============================================================================================
  // JPU-77 — cell formatting: zero must stay visible
  // ===============================================================================================
  describe('JPU-77 cell formatting', () => {
    it('formats currency with the Indian grouping and a default rupee symbol', () => {
      expect(formatCurrency(1234567)).toBe('₹12,34,567');
      expect(formatCurrency(1000, '$')).toBe('$1,000');
    });

    it('keeps a genuine zero visible instead of dashing it out', () => {
      // The `!value && value !== 0` guard exists precisely for this — ₹0 is information.
      expect(formatCurrency(0)).toBe('₹0');
      expect(formatNumber(0)).toBe('0');
    });

    it('dashes out an absent value', () => {
      expect(formatCurrency(null as any)).toBe('-');
      expect(formatCurrency(undefined as any)).toBe('-');
      expect(formatNumber(null as any)).toBe('-');
    });

    it('caps currency at two decimal places', () => {
      expect(formatCurrency(1234.5678)).toBe('₹1,234.57');
    });

    it('wraps a number in its affixes', () => {
      expect(formatNumber(50, '', '%')).toBe('50%');
      expect(formatNumber(50, '+', ' days')).toBe('+50 days');
      expect(formatNumber(100000)).toBe('1,00,000');
    });

    it('resolves a value through a lookup table', () => {
      expect(mapValue('j1', { j1: 'Ecosystem' })).toBe('Ecosystem');
      expect(mapValue('j1', { j1: { name: 'Ecosystem' } }, undefined, 'name')).toBe('Ecosystem');
    });

    it('digs a key out of the value first, including array access', () => {
      expect(mapValue({ id: 'j1' }, { j1: 'Ecosystem' }, 'id')).toBe('Ecosystem');
      expect(mapValue([{ id: 'j1' }], { j1: 'Ecosystem' }, '[0].id')).toBe('Ecosystem');
    });

    it('shows the raw value when the lookup misses, rather than a blank', () => {
      expect(mapValue('unknown', { j1: 'Ecosystem' })).toBe('unknown');
      expect(mapValue('j1', undefined)).toBe('j1');
    });

    it('PINNED BUG: a mapping that resolves to 0 or "" is discarded for the raw value', () => {
      // The final fallback is `||`, not `??`, so falsy MAPPED results are treated as misses.
      expect(mapValue('k', { k: 0 })).toBe('k');
      expect(mapValue('k', { k: '' })).toBe('k');
    });
  });
});
