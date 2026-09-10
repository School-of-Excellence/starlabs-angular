// participants-analytics.engine.unit.spec.ts — unit tests for the Participants Analytics rules.
//
// WHY THESE COULD NOT BE TESTED BEFORE: the rules lived as methods on ParticipantsAnalyticsComponent, a
// 3,986-line component that injects a Firestore, an HttpClient, an Injector, a FormBuilder, a MatDialog,
// a Storage and eleven child dialogs. Standing that up in a spec to ask "how old is someone born on the
// 29th of February?" was never going to happen, so nothing here had a single test.
//
// WHAT THEY PROTECT: what an operator reads off the participants table and acts on. The Age column, the
// UP!/CPM computed columns, which journey a participant is shown against, which event counts as their
// last attended one, and — most consequentially — which participants survive the consumed/unconsumed
// product filters before someone bulk-emails, bulk-tags or bulk-exports exactly that set. A wrong
// comparison operator here does not crash; it silently sends the wrong campaign to the wrong people.
//
// DEFECTS ARE PINNED, NOT FIXED. Every `DEFECT (pinned)` case asserts what the code does TODAY, so the
// behaviour is documented and a later fix has to change a test on purpose rather than by accident.
// Numbering matches the DEFECT notes in participants-analytics.engine.ts.
//
// NOTE ON SCOPE: filterAtcModel() and anything ATC-shaped is deliberately absent — ATC is out of scope
// for this work and no ATC data is referenced anywhere in this file.
import {
  CPM_PRODUCT_IDS,
  FilterKeyGroups,
  UP_LIVE_PRODUCT_IDS,
  buildFilterText,
  calculateAge,
  checkboxLabel,
  countMatchingProducts,
  cpmCount,
  filterColumns,
  filterOptions,
  filterSavedFilters,
  filterTierOptions,
  isAllSelected,
  journeyForParticipant,
  lastAttendedEventId,
  matchesProductFilters,
  participantsMatchingProductFilters,
  productConsumedTotal,
  productFilterLabel,
  productSearchValidation,
  stripBlankFilters,
  tagsAdded,
  tagsRemoved,
  upLiveCount,
} from './participants-analytics.engine';

/** A Firestore Timestamp stand-in — only toDate() is ever called. */
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('participants-analytics.engine', () => {
  // ===============================================================================================
  // PAU-01 — Age
  // ===============================================================================================
  describe('PAU-01 calculateAge', () => {
    const NOW = new Date('2026-09-10T08:30:00Z').getTime();

    it('counts a birthday that has already passed this year', () => {
      expect(calculateAge(new Date(1990, 0, 15), NOW)).toBe(36);
    });

    it('does NOT count a birthday still to come this year', () => {
      expect(calculateAge(new Date(1990, 11, 31), NOW)).toBe(35);
    });

    it('counts the birthday itself as the new age', () => {
      // The boundary that matters: on the day, the participant is a year older.
      const now = new Date(2026, 8, 10, 9, 0, 0).getTime();
      expect(calculateAge(new Date(1990, 8, 10), now)).toBe(36);
    });

    it('accepts a Firestore Timestamp as readily as a raw Date', () => {
      expect(calculateAge(ts('1990-01-15T00:00:00Z'), NOW)).toBe(36);
    });

    it('returns the empty string for anything that is not a date', () => {
      // The table shows a blank cell rather than "NaN" for a profile with no date of birth.
      expect(calculateAge(null, NOW)).toBe('');
      expect(calculateAge(undefined, NOW)).toBe('');
      expect(calculateAge('not a date', NOW)).toBe('');
      expect(calculateAge(12345, NOW)).toBe('');
    });

    it('DEFECT 1 (pinned): mutates the caller\'s Date, so a second call returns a different age', () => {
      // `date.setFullYear(currentYear)` is applied to the object the caller owns. When the row holds a
      // plain Date (not a Timestamp), the birth year is overwritten in place. Real-world consequence:
      // Angular calls this getter on every change-detection pass, so the Age column reads correctly on
      // first paint and collapses to 0 the moment anything re-renders the row.
      const dob = new Date(1990, 0, 15);
      expect(calculateAge(dob, NOW)).toBe(36);
      expect(dob.getFullYear()).toBe(2026);      // the input was rewritten
      expect(calculateAge(dob, NOW)).toBe(0);    // and now reports 0
    });

    it('DEFECT 1b (pinned): a Firestore Timestamp is immune, because toDate() hands back a fresh Date', () => {
      const stamp = ts('1990-01-15T00:00:00Z');
      expect(calculateAge(stamp, NOW)).toBe(36);
      expect(calculateAge(stamp, NOW)).toBe(36);   // stable, unlike the raw-Date case above
    });
  });

  // ===============================================================================================
  // PAU-02 — computed product columns
  // ===============================================================================================
  describe('PAU-02 computed columns', () => {
    const upId = UP_LIVE_PRODUCT_IDS[0];
    const cpmId = CPM_PRODUCT_IDS[0];

    it('pins the product ids that roll into each column', () => {
      // These ids are the column definition. Changing one silently redefines what "UP! count" means.
      expect(UP_LIVE_PRODUCT_IDS.length).toBe(3);
      expect(CPM_PRODUCT_IDS.length).toBe(4);
      expect(UP_LIVE_PRODUCT_IDS.some((id) => CPM_PRODUCT_IDS.includes(id))).toBeFalse();
    });

    it('sums consumedCount across the listed products only', () => {
      const products = {
        [UP_LIVE_PRODUCT_IDS[0]]: { consumedCount: 2 },
        [UP_LIVE_PRODUCT_IDS[1]]: { consumedCount: 3 },
        'unrelated-product': { consumedCount: 99 },
      };
      expect(productConsumedTotal(products, UP_LIVE_PRODUCT_IDS)).toBe(5);
    });

    it('treats a missing product or a missing count as zero, never NaN', () => {
      expect(productConsumedTotal({ [upId]: {} }, UP_LIVE_PRODUCT_IDS)).toBe(0);
      expect(productConsumedTotal({}, UP_LIVE_PRODUCT_IDS)).toBe(0);
    });

    it('ignores unConsumedCount — the columns count what was CONSUMED', () => {
      expect(productConsumedTotal({ [upId]: { unConsumedCount: 7 } }, UP_LIVE_PRODUCT_IDS)).toBe(0);
    });

    it('returns 0 for an unknown or blank profile id', () => {
      const map = { 'p1': { [upId]: { consumedCount: 4 } } };
      expect(upLiveCount('p1', map)).toBe(4);
      expect(upLiveCount('nobody', map)).toBe(0);
      expect(upLiveCount('', map)).toBe(0);
      expect(upLiveCount(null, map)).toBe(0);
      expect(upLiveCount('p1', null)).toBe(0);
    });

    it('keeps the two columns independent', () => {
      const map = { 'p1': { [upId]: { consumedCount: 4 }, [cpmId]: { consumedCount: 9 } } };
      expect(upLiveCount('p1', map)).toBe(4);
      expect(cpmCount('p1', map)).toBe(9);
    });

    it('DEFECT 2 (pinned): declared `number | string` but no branch can return a string', () => {
      // The "not found" case returns the NUMBER 0, so any template branch written to catch a string
      // sentinel (an empty cell, a dash) is unreachable dead code.
      expect(typeof upLiveCount('nobody', {})).toBe('number');
      expect(typeof cpmCount('nobody', {})).toBe('number');
    });
  });

  // ===============================================================================================
  // PAU-03 — journey resolution
  // ===============================================================================================
  describe('PAU-03 journeyForParticipant', () => {
    const names = { j1: 'Foundation', j2: 'Mastery', j3: 'Legacy' };
    const meta = { activejourney: 'j1', lastcompletedjourney: 'j2', lastsubscribedjourney: 'j3' };

    it('reads the ACTIVE journey for an active participant', () => {
      expect(journeyForParticipant({ ...meta, customerstatus: 'active' }, names)).toBe('Foundation');
    });

    it('reads the LAST COMPLETED journey for a non-active participant', () => {
      expect(journeyForParticipant({ ...meta, customerstatus: 'non active' }, names)).toBe('Mastery');
    });

    it('reads the LAST SUBSCRIBED journey for a discontinued participant', () => {
      // Worth pinning: discontinued deliberately shows what they were paying for, not what they finished.
      expect(journeyForParticipant({ ...meta, customerstatus: 'discontinued' }, names)).toBe('Legacy');
    });

    it('DEFECT 4 (pinned): any unrecognised status shows a blank journey', () => {
      // Real-world consequence: a participant whose customerstatus has never been set — or was written
      // as "Active" with a capital A, or "inactive" instead of "non active" — appears on the table with
      // no journey at all, so a journey filter silently excludes them.
      expect(journeyForParticipant({ ...meta }, names)).toBe('');
      expect(journeyForParticipant({ ...meta, customerstatus: 'Active' }, names)).toBe('');
      expect(journeyForParticipant({ ...meta, customerstatus: 'inactive' }, names)).toBe('');
      expect(journeyForParticipant({ ...meta, customerstatus: null }, names)).toBe('');
    });

    it('DEFECT 4b (pinned): a recognised status with an unmapped id returns undefined, not \'\'', () => {
      // Two different "no journey" values reach the template, so `=== ''` checks miss half the cases.
      expect(journeyForParticipant({ customerstatus: 'active', activejourney: 'gone' }, names))
        .toBeUndefined();
    });
  });

  // ===============================================================================================
  // PAU-04 — last attended event
  // ===============================================================================================
  describe('PAU-04 lastAttendedEventId', () => {
    const events = {
      e1: { end_date: ts('2026-01-10T00:00:00Z') },
      e2: { end_date: ts('2026-05-20T00:00:00Z') },
      e3: { end_date: ts('2026-03-01T00:00:00Z') },
    };

    it('picks the event with the latest end date across all product buckets', () => {
      const metadata = { productevent: { productA: ['e1', 'e3'], productB: ['e2'] } };
      expect(lastAttendedEventId(metadata, events)).toBe('e2');
    });

    it('skips events with no resolvable end date rather than treating them as ancient', () => {
      const withHole = { ...events, e4: { end_date: null } };
      const metadata = { productevent: { p: ['e4', 'e1'] } };
      expect(lastAttendedEventId(metadata, withHole)).toBe('e1');
    });

    it('skips ids that are not in the event map at all', () => {
      expect(lastAttendedEventId({ productevent: { p: ['ghost', 'e1'] } }, events)).toBe('e1');
    });

    it('returns undefined when nothing usable is present', () => {
      expect(lastAttendedEventId({}, events)).toBeUndefined();
      expect(lastAttendedEventId(null, events)).toBeUndefined();
      expect(lastAttendedEventId({ productevent: { p: [] } }, events)).toBeUndefined();
      expect(lastAttendedEventId({ productevent: { p: ['ghost'] } }, events)).toBeUndefined();
    });

    it('DEFECT 5 (pinned): a tie on end date resolves to whichever id is iterated LAST', () => {
      // `<=` rather than `<`. Real-world consequence: two events finishing the same day resolve by
      // Firestore key order, so the "last attended event" column can flip between two equally valid
      // answers with no data change at all.
      const tied = {
        a: { end_date: ts('2026-05-20T00:00:00Z') },
        b: { end_date: ts('2026-05-20T00:00:00Z') },
      };
      expect(lastAttendedEventId({ productevent: { p: ['a', 'b'] } }, tied)).toBe('b');
      expect(lastAttendedEventId({ productevent: { p: ['b', 'a'] } }, tied)).toBe('a');
    });
  });

  // ===============================================================================================
  // PAU-05 — tag diffing
  // ===============================================================================================
  describe('PAU-05 tag history diff', () => {
    it('reports what appeared and what disappeared', () => {
      const prev = { profiletags: ['coach', 'alumni'] };
      const curr = { profiletags: ['coach', 'vip'] };
      expect(tagsAdded(curr, prev)).toEqual(['vip']);
      expect(tagsRemoved(curr, prev)).toEqual(['alumni']);
    });

    it('treats a missing tag array as empty on either side', () => {
      expect(tagsAdded({ profiletags: ['vip'] }, {})).toEqual(['vip']);
      expect(tagsRemoved({}, { profiletags: ['vip'] })).toEqual(['vip']);
      expect(tagsAdded({}, {})).toEqual([]);
    });

    it('reports nothing when nothing changed', () => {
      const both = { profiletags: ['coach'] };
      expect(tagsAdded(both, both)).toEqual([]);
      expect(tagsRemoved(both, both)).toEqual([]);
    });

    it('DEFECT 6 (pinned): duplicates are not collapsed', () => {
      // Real-world consequence: the tag-history panel shows "added: vip, vip" whenever a bulk tag
      // operation wrote the same tag twice, which makes an audit trail look like two separate actions.
      expect(tagsAdded({ profiletags: ['vip', 'vip'] }, {})).toEqual(['vip', 'vip']);
    });

    it('DEFECT 6b (pinned): a null version throws rather than reporting no change', () => {
      // `current.profiletags` is unguarded on `current` itself, so the very first version of a tag log
      // (which has no previous) takes the panel down instead of rendering an empty diff.
      expect(() => tagsAdded(null as any, {})).toThrow();
      expect(() => tagsRemoved({}, null as any)).toThrow();
    });
  });

  // ===============================================================================================
  // PAU-06 — product filters (the highest-consequence rules on the screen)
  // ===============================================================================================
  describe('PAU-06 matchesProductFilters', () => {
    const products = { pA: { consumedCount: 5, unConsumedCount: 2 } };

    it('passes everything when no criteria are set', () => {
      expect(matchesProductFilters(products, [], [])).toBeTrue();
      expect(matchesProductFilters(undefined, [], [])).toBeTrue();
    });

    it('applies equalto on consumed counts', () => {
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: 'equalto', count: 5 }], [])).toBeTrue();
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: 'equalto', count: 4 }], [])).toBeFalse();
    });

    it('applies groreqto and lsoreqto inclusively at the boundary', () => {
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: 'groreqto', count: 5 }], [])).toBeTrue();
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: 'groreqto', count: 6 }], [])).toBeFalse();
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: 'lsoreqto', count: 5 }], [])).toBeTrue();
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: 'lsoreqto', count: 4 }], [])).toBeFalse();
    });

    it('requires EVERY criterion to hold, not any', () => {
      const many = { pA: { consumedCount: 5 }, pB: { consumedCount: 1 } };
      const filters = [
        { productId: 'pA', comparison: 'groreqto', count: 5 },
        { productId: 'pB', comparison: 'groreqto', count: 5 },
      ];
      expect(matchesProductFilters(many, filters, [])).toBeFalse();
    });

    it('applies the unconsumed criteria against unConsumedCount, independently', () => {
      expect(matchesProductFilters(products, [], [{ productId: 'pA', comparison: 'equalto', count: 2 }])).toBeTrue();
      expect(matchesProductFilters(products, [], [{ productId: 'pA', comparison: 'equalto', count: 5 }])).toBeFalse();
    });

    it('DEFECT 3 (pinned): the label spells it gtoreqto, the matcher tests for groreqto', () => {
      // THE SPELLING SPLIT. productFilterLabel() renders 'gtoreqto' as "Greater than or Equal To";
      // matchesProductFilters() only recognises 'groreqto'. Whichever spelling the filter dialog writes,
      // one half of the feature is wrong. Real-world consequence: a "consumed >= 3" filter can quietly
      // degrade to "consumed == 3" — the chip above the table still reads "Greater than or Equal To"
      // while the export beneath it is a strict-equality set. Nobody sees the mismatch.
      const gto = [{ productId: 'pA', comparison: 'gtoreqto', count: 3 }];
      expect(matchesProductFilters(products, gto, [])).toBeFalse();     // 5 >= 3 SHOULD pass; it does not
      expect(productFilterLabel(gto[0], { pA: { product: 'UP!' } }))
        .toBe('UP! Greater than or Equal To 3');                        // but the chip claims it did
    });

    it('DEFECT 7 (pinned): an unknown comparison silently degrades to equality', () => {
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: 'nonsense', count: 5 }], [])).toBeTrue();
      expect(matchesProductFilters(products, [{ productId: 'pA', comparison: undefined, count: 5 }], [])).toBeTrue();
    });

    it('DEFECT 7b (pinned): a participant with no row for the product fails even a "<= n" criterion', () => {
      // Real-world consequence: "participants who consumed 0 or fewer of X" returns nobody, because the
      // people who consumed none of X have no product row at all.
      expect(matchesProductFilters({}, [{ productId: 'pA', comparison: 'lsoreqto', count: 0 }], [])).toBeFalse();
    });

    it('uses loose equality, so a count stored as a string still matches', () => {
      const stringy = { pA: { consumedCount: '5' as any } };
      expect(matchesProductFilters(stringy, [{ productId: 'pA', comparison: 'equalto', count: 5 }], [])).toBeTrue();
    });
  });

  describe('PAU-07 participantsMatchingProductFilters', () => {
    const rows = [
      { profileId: 'p1', products: { pA: { consumedCount: 5 } } },
      { profileId: 'p2', products: { pA: { consumedCount: 1 } } },
      { profileId: 'p3', products: {} },
    ];

    it('keys the survivors by profile id', () => {
      const out = participantsMatchingProductFilters(rows, [{ productId: 'pA', comparison: 'groreqto', count: 5 }], []);
      expect(Object.keys(out)).toEqual(['p1']);
      expect(out['p1'].products!['pA'].consumedCount).toBe(5);
    });

    it('keeps everyone when no criteria are set', () => {
      expect(Object.keys(participantsMatchingProductFilters(rows, [], []))).toEqual(['p1', 'p2', 'p3']);
    });

    it('returns an empty map rather than throwing before the data has loaded', () => {
      expect(participantsMatchingProductFilters(null, [], [])).toEqual({});
      expect(participantsMatchingProductFilters(undefined, [{ productId: 'pA' }], [])).toEqual({});
    });
  });

  describe('PAU-08 productFilterLabel', () => {
    const productMap = { pA: { product: 'UP! Live' } };

    it('renders the three known comparisons in words', () => {
      expect(productFilterLabel({ productId: 'pA', comparison: 'equalto', count: 2 }, productMap))
        .toBe('UP! Live Equal To 2');
      expect(productFilterLabel({ productId: 'pA', comparison: 'lsoreqto', count: 2 }, productMap))
        .toBe('UP! Live Less than or Equal To 2');
    });

    it('returns the empty string for a missing criterion', () => {
      expect(productFilterLabel(null, productMap)).toBe('');
      expect(productFilterLabel(undefined, productMap)).toBe('');
    });

    it('DEFECT 3b (pinned): an unknown product renders the literal text "undefined"', () => {
      // Real-world consequence: a deleted or renamed product leaves the chip reading
      // "undefined Equal To 2" on screen rather than being dropped or labelled by id.
      expect(productFilterLabel({ productId: 'gone', comparison: 'equalto', count: 2 }, productMap))
        .toBe('undefined Equal To 2');
    });

    it('DEFECT 3c (pinned): an unrecognised comparison is printed raw', () => {
      expect(productFilterLabel({ productId: 'pA', comparison: 'groreqto', count: 2 }, productMap))
        .toBe('UP! Live groreqto 2');
    });
  });

  // ===============================================================================================
  // PAU-09 — saved-filter cleanup and the filter-text banner
  // ===============================================================================================
  describe('PAU-09 stripBlankFilters + buildFilterText', () => {
    const groups: FilterKeyGroups = {
      range: ['purchasedate'],
      numberrange: ['age'],
      arraystring: ['customerstatus'],
      arrayarray: ['consumedproducts'],
      string: ['email'],
      number: ['totaladjustmentaware'],
      stringarray: ['tierlabel'],
    };
    const names = { p1: 'UP! Live', active: 'Active' };
    const fmt = (v: any) => (v == null ? null : `D:${v}`);

    it('drops null and undefined criteria', () => {
      expect(stripBlankFilters({ email: 'a@b.c', phone: null, other: undefined }, groups))
        .toEqual({ email: 'a@b.c' });
    });

    it('drops a range missing either end, and keeps a complete one', () => {
      expect(stripBlankFilters({ purchasedate: { start: '2026-01-01', end: null } }, groups)).toEqual({});
      expect(stripBlankFilters({ age: { start: 20, end: null } }, groups)).toEqual({});
      const full = { purchasedate: { start: '2026-01-01', end: '2026-02-01' } };
      expect(stripBlankFilters(full, groups)).toEqual(full);
    });

    it('drops an empty array criterion', () => {
      expect(stripBlankFilters({ consumedproducts: [], customerstatus: [] }, groups)).toEqual({});
      expect(stripBlankFilters({ consumedproducts: ['p1'] }, groups)).toEqual({ consumedproducts: ['p1'] });
    });

    it('does not mutate the input', () => {
      const input = { email: null, other: 'keep' };
      stripBlankFilters(input, groups);
      expect('email' in input).toBeTrue();
    });

    it('keeps a numeric-range end of 0 — 0 is a real bound, not a blank', () => {
      const zero = { age: { start: 0, end: 0 } };
      expect(stripBlankFilters(zero, groups)).toEqual(zero);
    });

    it('returns null when nothing is active, so the banner stays hidden', () => {
      expect(buildFilterText({}, groups, names, fmt)).toBeNull();
      expect(buildFilterText({ email: null }, groups, names, fmt)).toBeNull();
    });

    it('maps array values through the label map and joins them with (OR)', () => {
      expect(buildFilterText({ consumedproducts: ['p1', 'p9'] }, groups, names, fmt))
        .toBe('"consumedproducts" is equal to UP! Live (OR) p9');
    });

    it('joins several criteria with (AND) and a newline', () => {
      const text = buildFilterText({ customerstatus: ['active'], email: 'a@b.c' }, groups, names, fmt);
      expect(text).toBe('"customerstatus" is equal to Active (AND) \n"email" is equal to a@b.c');
    });

    it('renders a date range through the caller-supplied formatter', () => {
      expect(buildFilterText({ purchasedate: { start: 'S', end: 'E' } }, groups, names, fmt))
        .toBe('"purchasedate" From D:S To D:E');
    });

    it('renders a number range raw, without the formatter', () => {
      expect(buildFilterText({ age: { start: 20, end: 40 } }, groups, names, fmt))
        .toBe('"age" From 20 To 40');
    });

    it('falls back to the raw value when the label map has no entry', () => {
      expect(buildFilterText({ email: 'a@b.c' }, groups, names, fmt)).toBe('"email" is equal to a@b.c');
    });

    it('DEFECT 8 (pinned): a criterion in no group is applied but never described', () => {
      // `object`, `stringmaparray` and `numbermapnumber` keys are real filters that narrow the table,
      // but they belong to none of the seven buckets the banner knows about. Real-world consequence: an
      // operator reading the banner believes they are looking at an unfiltered-by-support-category
      // table when they are not, and exports the narrowed set thinking it is the whole one.
      expect(buildFilterText({ customersupportcategory: ['billing'] }, groups, names, fmt)).toBeNull();
    });

    it('DEFECT 8b (pinned): a value of 0 in the label map falls back to the raw value', () => {
      // The mapping uses a truthiness test, so a legitimately falsy label is discarded.
      expect(buildFilterText({ email: 'k' }, groups, { k: 0 } as any, fmt)).toBe('"email" is equal to k');
    });
  });

  // ===============================================================================================
  // PAU-10 — product search validation
  // ===============================================================================================
  describe('PAU-10 productSearchValidation', () => {
    it('flags two or more non-empty product criteria', () => {
      const out = productSearchValidation({
        productcount: { start: 1, end: 5 },
        consumedproducts: ['p1'],
        unconsumedproducts: ['p2'],
      });
      expect(out.tooManyProductFilters).toBeTrue();
      expect(out.removeKeys).toEqual([]);
    });

    it('allows exactly one', () => {
      const out = productSearchValidation({ productcount: { start: 1 }, consumedproducts: ['p1'] });
      expect(out.tooManyProductFilters).toBeFalse();
    });

    it('reports empty criteria for removal without counting them', () => {
      const out = productSearchValidation({
        productcount: 1, consumedproducts: [], unconsumedproducts: ['p2'],
      });
      expect(out.removeKeys).toEqual(['consumedproducts']);
      expect(out.tooManyProductFilters).toBeFalse();
    });

    it('DEFECT 9 (pinned): the entire check is skipped when productcount is unset', () => {
      // Real-world consequence: the guard that exists to stop an ambiguous multi-product query only
      // fires when a count range happens to be filled in. Two product criteria without one run anyway.
      const out = productSearchValidation({ consumedproducts: ['p1'], unconsumedproducts: ['p2'] });
      expect(out.tooManyProductFilters).toBeFalse();
      expect(out.removeKeys).toEqual([]);
    });
  });

  // ===============================================================================================
  // PAU-11 — dropdown typeaheads
  // ===============================================================================================
  describe('PAU-11 filterOptions', () => {
    const list = [{ name: ' Alpha Journey ' }, { name: 'Beta' }, { name: 'gamma' }];
    const byName = (e: any) => e.name;

    it('matches case-insensitively, anywhere in the label', () => {
      expect(filterOptions(list, 'ALPHA', byName).length).toBe(1);
      expect(filterOptions(list, 'journey', byName).length).toBe(1);
      expect(filterOptions(list, 'GAM', byName).length).toBe(1);
    });

    it('trims both the query and the label before comparing', () => {
      expect(filterOptions(list, '  alpha  ', byName).length).toBe(1);
    });

    it('returns everything for an empty, null or undefined query', () => {
      expect(filterOptions(list, '', byName).length).toBe(3);
      expect(filterOptions(list, null, byName).length).toBe(3);
      expect(filterOptions(list, undefined, byName).length).toBe(3);
    });

    it('returns [] rather than throwing before the list has loaded', () => {
      expect(filterOptions(null, 'x', byName)).toEqual([]);
      expect(filterOptions(undefined, 'x', byName)).toEqual([]);
    });

    it('supports the plain-string lists via an identity selector', () => {
      expect(filterOptions(['Billing', 'Tech'], 'bil', (e) => e)).toEqual(['Billing']);
    });

    it('DEFECT (pinned): an option whose label is missing throws, taking the dropdown down', () => {
      // The tag dropdown reads `this.mapfiltervalues[e]` as its label. A tag id with no entry in the
      // label map yields undefined, and `.trim()` on it throws. Real-world consequence: one orphaned
      // tag id makes the whole tag filter unusable, not just that one option invisible.
      expect(() => filterOptions([{ name: undefined }], 'a', byName)).toThrow();
    });
  });

  describe('PAU-12 filterTierOptions', () => {
    const tiers = [{ tier: 'Gold' }, { tier: 'Silver' }, { tier: 'Golden Circle' }];

    it('matches a prefix, case-insensitively', () => {
      expect(filterTierOptions(tiers, 'gol').length).toBe(2);
      expect(filterTierOptions(tiers, 'GOLD').length).toBe(2);
    });

    it('returns everything for a blank query', () => {
      expect(filterTierOptions(tiers, '').length).toBe(3);
      expect(filterTierOptions(null, 'g')).toEqual([]);
    });

    it('DEFECT 10 (pinned): tier is a PREFIX match while every sibling dropdown is a substring match', () => {
      // Real-world consequence: an operator who types "circle" — the habit every other dropdown on this
      // screen trains — sees an empty tier list and concludes the tier does not exist.
      expect(filterTierOptions(tiers, 'circle')).toEqual([]);
      expect(filterOptions(tiers, 'circle', (e) => e.tier!).length).toBe(1);
    });

    it('DEFECT 10b (pinned): the tier label is never trimmed, so a padded tier is unreachable', () => {
      expect(filterTierOptions([{ tier: ' Gold' }], 'gold')).toEqual([]);
    });
  });

  describe('PAU-13 filterSavedFilters + filterColumns + countMatchingProducts', () => {
    const saved = [{ label: 'Active VIPs' }, { label: 'Churn risk' }, {}];

    it('returns the whole saved list for a blank query, including the unlabelled row', () => {
      expect(filterSavedFilters(saved, '').length).toBe(3);
      expect(filterSavedFilters(saved, null).length).toBe(3);
    });

    it('matches a saved label case-insensitively and drops the unlabelled row once searching', () => {
      expect(filterSavedFilters(saved, 'vip')).toEqual([{ label: 'Active VIPs' }]);
      expect(filterSavedFilters(saved, 'z')).toEqual([]);
    });

    it('filters the column picker case-insensitively', () => {
      expect(filterColumns(['email', 'phonenumber', 'Age'], 'age')).toEqual(['Age']);
      expect(filterColumns(['email', 'phonenumber'], '').length).toBe(2);
    });

    it('DEFECT 11 (pinned): columnsDisplayed carries a hole, so length overstates the column count', () => {
      // The component builds it as `[...arrayarray, , ...range]` — a stray double comma (line 199).
      // That elision is a genuine array hole: `filter` and `map` both SKIP holes, so nothing throws
      // here — but `.length` counts it and indexing yields undefined. Real-world consequence: any
      // caller that copies the array first (a spread, Array.from, a plain for loop over .length) gets
      // an `undefined` column and an unguarded `.toLowerCase()` on it.
      const withHole = [...['a'], , ...['b']] as any[];
      expect(withHole.length).toBe(3);
      expect(withHole[1]).toBeUndefined();
      expect(filterColumns(withHole, '').length).toBe(2);
      expect(() => [...withHole].map((e) => e.toLowerCase())).toThrow();
    });

    it('counts how many times a product id appears', () => {
      expect(countMatchingProducts(['p1', 'p2', 'p1'], 'p1')).toBe(2);
      expect(countMatchingProducts([], 'p1')).toBe(0);
    });
  });

  // ===============================================================================================
  // PAU-14 — table selection
  // ===============================================================================================
  describe('PAU-14 selection', () => {
    it('reports all-selected only when the counts match', () => {
      expect(isAllSelected(3, 3)).toBeTrue();
      expect(isAllSelected(2, 3)).toBeFalse();
      expect(isAllSelected(0, 0)).toBeTrue();   // an empty table counts as "all selected"
    });

    it('labels the header checkbox by the current state', () => {
      expect(checkboxLabel(undefined, true, () => false)).toBe('deselect all');
      expect(checkboxLabel(undefined, false, () => false)).toBe('select all');
    });

    it('DEFECT 12 (pinned): every row announces itself as "row NaN"', () => {
      // Participant rows are Firestore profile docs; none of them carries a `position` field.
      // Real-world consequence: the table is unusable with a screen reader, because every checkbox
      // reads out the same meaningless label.
      expect(checkboxLabel({ profileid: 'p1' }, false, () => false)).toBe('select row NaN');
      expect(checkboxLabel({ profileid: 'p1' }, false, () => true)).toBe('deselect row NaN');
    });

    it('uses position when a row does happen to carry one', () => {
      expect(checkboxLabel({ position: 4 }, false, () => false)).toBe('select row 5');
    });
  });
});
