// participant-intelligence.unit.spec.ts — unit tests for the Participant Intelligence filter engine,
// insights and Watson rules (round 4 plan: specs/plans/2026-09-29-participant-intelligence-round4.md;
// round 5: specs/plans/2026-10-01-participant-intelligence-round5.md, tests tagged R5-n).
//
// WHY UNIT: the filter engine, chips, count conditions, subscription relations and insight predicates
// are pure functions over already-loaded participants. They decide which rows an operator bulk-tags,
// messages or exports, and a wrong comparison doesn't crash, it silently picks the wrong people.
//
// NO DI: nothing here constructs a component or touches Firestore. The data service's record mappers
// (mapParticipant / mapSavedFilter) are pure too; they are called on an instance made without its
// constructor, so its inject() calls never run.
//
// NOT COVERED HERE: the table's blanks-last comparator (#16) lives in ParticipantTableComponent's `rows`
// computed and needs the store, so only its header tooltip (sortBasis) is checked. The queue_token split
// itself (#11) is a Firestore read; the FilterContext maps it produces are what is tested.
import {
  CountCondition,
  Dict,
  FilterContext,
  FilterModel,
  FinancialStatus,
  Participant,
  ParticipantDataService,
  ParticipantTableComponent,
  ReferenceData,
  SIGNALS,
  SignalContext,
  SubscriptionFilter,
  SubscriptionRelation,
  WATSON_RULES,
  ageRangeError,
  canonicalId,
  nameGroups,
  applyFilters,
  conditionActive,
  conditionError,
  deriveChips,
  emptyFilter,
  filterSignature,
  filterTouched,
  productRuleActive,
  subscriptionFilterError,
} from './participant-intelligence.component';

// ---- fixtures ----

function mk(over: Partial<Participant> = {}): Participant {
  return {
    profileid: 'p',
    name: 'Pat',
    email: '',
    phonenumber: '',
    countrycode: '',
    registered: true,
    participantmode: 'none',
    customerstatus: 'active',
    financialstatus: 'regular',
    activejourney: null,
    lastcompletedjourney: null,
    higherorderpurchase: null,
    activeproduct: [],
    consumedproducts: [],
    unconsumedproducts: [],
    addons: [],
    gifts: [],
    bonus: [],
    tier: [],
    profiletags: [],
    atccount: 0,
    customersupport: { status: 'none', category: null },
    remarks: [],
    subscriptionstart: null,
    subscriptionend: null,
    isLastSubscription: false,
    currentSubscriptionStart: null,
    currentSubscriptionEnd: null,
    lastSubscriptionStart: null,
    lastSubscriptionEnd: null,
    lastpaymentdate: null,
    purchasedate: null,
    dateofbirth: null,
    age: null,
    onboarded: true,
    journey: null,
    upcount: 0,
    cpmcount: 0,
    purchasevalue: null,
    paid: null,
    balance: null,
    paymentplan: null,
    emiStatus: 'none',
    productevent: {},
    queueevent: {},
    subscriptionPurchaseId: null,
    eiflix: [],
    solarvoice: [],
    generalcontent: [],
    raw: {},
    ...over,
  };
}

const withFilter = (patch: Partial<FilterModel>): FilterModel => ({ ...emptyFilter(), ...patch });
const ids = (list: Participant[]): string[] => list.map((p) => p.profileid);
const labels = (f: FilterModel): string[] => deriveChips(f, REF).map((c) => c.label);
const cond = (op: CountCondition['op'], a: number | null, b: number | null = null): CountCondition => ({ op, a, b });

// An instant at a LOCAL time, as ISO: its local calendar day is y-m-d in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0): string => new Date(y, m - 1, d, h, min).toISOString();

const dayOffset = (days: number, h = 12, min = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
};

const REF: ReferenceData = {
  journeys: [
    { id: 'j1', name: 'Breakthrough' },
    { id: 'j2', name: 'Legacy' },
  ],
  products: [
    { id: 'x', name: 'Accelerator', type: null },
    { id: 'y', name: 'Mastery', type: null },
  ],
  modes: [],
  tiers: [],
  tags: [
    { id: 't1', name: 'VIP', tagsfor: ['journey coach'], isActive: true },
    { id: 't2', name: 'Churn risk', tagsfor: ['journey coach'], isActive: true },
  ],
  events: [{ id: 'e1', name: 'B!G Accelerator', date: at(2026, 3, 12) }],
  queues: [{ id: 'q1', name: 'Morning Queue', date: at(2026, 3, 12) }],
  journeySegments: [{ id: 's1', name: 'Ready to renew', profileIds: ['a'], lastupdated: null }],
  queueProductIds: [],
};

const SIGNAL_CTX: SignalContext = {
  productIds: new Set(['p1', 'dfu1', 'dfu2']),
  journeyIds: new Set(['j1', 'j2']),
  dfuProductIds: new Set(['dfu1', 'dfu2']),
  queueProductIds: new Set(['qp1', 'qp2']),
};

const signal = (id: string) => {
  const s = SIGNALS.find((x) => x.id === id);
  if (!s) throw new Error(`no signal ${id}`);
  return s;
};

// The data service's pure record mappers, without constructing the service (see the header).
const mapper = Object.create(ParticipantDataService.prototype) as {
  mapParticipant(id: string, d: Dict): Participant;
  mapSavedFilter(d: Dict): FilterModel;
  queueProductIds(snap: unknown): string[];
};

describe('Participant Intelligence', () => {
  // =============================================================================================
  // Include / exclude checkbox semantics (existing)
  // =============================================================================================
  describe('include / exclude groups', () => {
    const people = [
      mk({ profileid: 'a', customerstatus: 'active', profiletags: ['t1'] }),
      mk({ profileid: 'b', customerstatus: 'late', profiletags: ['t1', 't2'] }),
      mk({ profileid: 'c', customerstatus: 'banned', profiletags: [] }),
      mk({ profileid: 'd', customerstatus: 'active', profiletags: ['t2'] }),
    ];

    it('ORs included values within a group', () => {
      expect(ids(applyFilters(people, withFilter({ customerstatus: ['active', 'late'] })))).toEqual(['a', 'b', 'd']);
    });

    it('ANDs across groups', () => {
      expect(ids(applyFilters(people, withFilter({ customerstatus: ['active'], profiletags: ['t1'] })))).toEqual(['a']);
    });

    it('removes excluded values, alone or next to an include', () => {
      expect(ids(applyFilters(people, withFilter({ exclude: { customerstatus: ['banned'] } })))).toEqual(['a', 'b', 'd']);
      expect(ids(applyFilters(people, withFilter({ profiletags: ['t1'], exclude: { profiletags: ['t2'] } })))).toEqual(['a']);
    });

    it('chips an exclusion as "not <value>"', () => {
      const chips = deriveChips(withFilter({ profiletags: ['t1'], exclude: { profiletags: ['t2'] } }), REF);
      expect(chips.map((c) => [c.label, !!c.exclude])).toEqual([
        ['Tag: VIP', false],
        ['Tag: not Churn risk', true],
      ]);
    });

    it('treats the empty exclude list left by cycling an option off as untouched', () => {
      const cycledOff = withFilter({ exclude: { profiletags: [] } });
      expect(filterTouched(cycledOff)).toBeFalse();
      expect(filterSignature(cycledOff)).toBe(filterSignature(emptyFilter()));
      expect(deriveChips(cycledOff, REF)).toEqual([]);
      expect(filterTouched(withFilter({ exclude: { profiletags: ['t2'] } }))).toBeTrue();
    });

    it('filters journey segments by the saved member list (#7)', () => {
      const ctx: FilterContext = { segmentMembers: { s1: new Set(['a']) } };
      expect(ids(applyFilters(people, withFilter({ journeysegments: ['s1'] }), ctx))).toEqual(['a']);
      expect(ids(applyFilters(people, withFilter({ exclude: { journeysegments: ['s1'] } }), ctx))).toEqual(['b', 'c', 'd']);
      expect(labels(withFilter({ journeysegments: ['s1'] }))).toEqual(['Journey segment: Ready to renew']);
    });
  });

  // =============================================================================================
  // #11 — queue Completed / Live from queue_token, events Attended / Confirmed
  // =============================================================================================
  describe('#11 queue and event switches', () => {
    const people = [
      mk({ profileid: 'a' }),
      mk({ profileid: 'b' }),
      // queueevent names q1, but the filter no longer reads it
      mk({ profileid: 'c', queueevent: { prod: ['q1'] } }),
    ];
    const ctx: FilterContext = { completedByQueue: { q1: new Set(['a']) }, liveByQueue: { q1: new Set(['b']) } };

    it('Completed matches only tokens at the Completed stage', () => {
      expect(ids(applyFilters(people, withFilter({ queues: ['q1'], queueStatus: 'completed' }), ctx))).toEqual(['a']);
    });

    it('Live matches only tokens at any other stage, never completed ones', () => {
      expect(ids(applyFilters(people, withFilter({ queues: ['q1'], queueStatus: 'live' }), ctx))).toEqual(['b']);
    });

    it('excludes under the current switch', () => {
      expect(ids(applyFilters(people, withFilter({ exclude: { queues: ['q1'] }, queueStatus: 'completed' }), ctx))).toEqual(['b', 'c']);
      expect(ids(applyFilters(people, withFilter({ exclude: { queues: ['q1'] }, queueStatus: 'live' }), ctx))).toEqual(['a', 'c']);
    });

    it('does not use participant queueevent and matches nobody before the tokens load', () => {
      expect(ids(applyFilters(people, withFilter({ queues: ['q1'] }), {}))).toEqual([]);
    });

    it('R5-2 chips the queue with the switch and its name only (no date)', () => {
      expect(labels(withFilter({ queues: ['q1'], queueStatus: 'completed' }))).toEqual(['Completed queue: Morning Queue']);
      expect(labels(withFilter({ queues: ['q1'], queueStatus: 'live' }))).toEqual(['Live in queue: Morning Queue']);
    });

    it('Attended reads productevent (single id or list); Confirmed reads approved requests', () => {
      const evPeople = [
        mk({ profileid: 'a', productevent: { prod1: ['e1'] } }),
        mk({ profileid: 'b', productevent: { prod2: 'e1' } as unknown as Record<string, string[]> }),
        mk({ profileid: 'c' }),
      ];
      const evCtx: FilterContext = { confirmedByEvent: { e1: new Set(['c']) } };
      expect(ids(applyFilters(evPeople, withFilter({ events: ['e1'], eventStatus: 'attended' }), evCtx))).toEqual(['a', 'b']);
      expect(ids(applyFilters(evPeople, withFilter({ events: ['e1'], eventStatus: 'confirmed' }), evCtx))).toEqual(['c']);
      expect(labels(withFilter({ events: ['e1'], eventStatus: 'confirmed' }))).toEqual(['Confirmed for: B!G Accelerator']);
    });
  });

  // =============================================================================================
  // R5-2 — same-name events / queues are one option
  // =============================================================================================
  describe('R5-2 same-name events and queues', () => {
    // list order = name A–Z, then newest first, so e3 (newest B!G) is the option's value
    const events = [
      { id: 'e3', name: 'B!G Accelerator', date: at(2026, 6, 1) },
      { id: 'e1', name: 'B!G Accelerator ', date: at(2026, 3, 12) },
      { id: 'e2', name: 'CPM Live', date: at(2026, 4, 1) },
    ];
    const groups = nameGroups(events);

    it('groups ids by trimmed, case-insensitive name; the first id is the option', () => {
      expect(groups['e1']).toEqual(['e3', 'e1']);
      expect(groups['e3']).toEqual(['e3', 'e1']);
      expect(groups['e2']).toEqual(['e2']);
      expect(canonicalId(groups, 'e1')).toBe('e3');
      expect(canonicalId(groups, 'unknown')).toBe('unknown');
    });

    it('a ticked event matches every event with its name (attended and confirmed)', () => {
      const people = [
        mk({ profileid: 'a', productevent: { x: ['e1'] } }),
        mk({ profileid: 'b', productevent: { x: ['e3'] } }),
        mk({ profileid: 'c', productevent: { x: ['e2'] } }),
      ];
      const ctx: FilterContext = { eventGroups: groups, confirmedByEvent: { e1: new Set(['c']), e3: new Set(['a']) } };
      expect(ids(applyFilters(people, withFilter({ events: ['e3'], eventStatus: 'attended' }), ctx))).toEqual(['a', 'b']);
      // an older saved filter holding the other id matches the same people
      expect(ids(applyFilters(people, withFilter({ events: ['e1'], eventStatus: 'attended' }), ctx))).toEqual(['a', 'b']);
      expect(ids(applyFilters(people, withFilter({ events: ['e3'], eventStatus: 'confirmed' }), ctx))).toEqual(['a', 'c']);
      expect(ids(applyFilters(people, withFilter({ exclude: { events: ['e3'] }, eventStatus: 'attended' }), ctx))).toEqual(['c']);
    });

    it('a ticked queue matches every queue with its name', () => {
      const queues = [
        { id: 'q2', name: 'Morning Queue', date: null },
        { id: 'q1', name: 'Morning Queue', date: null },
      ];
      const people = [mk({ profileid: 'a' }), mk({ profileid: 'b' }), mk({ profileid: 'c' })];
      const ctx: FilterContext = { queueGroups: nameGroups(queues), completedByQueue: { q1: new Set(['a']), q2: new Set(['b']) } };
      expect(ids(applyFilters(people, withFilter({ queues: ['q2'], queueStatus: 'completed' }), ctx))).toEqual(['a', 'b']);
    });
  });

  // =============================================================================================
  // #12 — count conditions (uP! / CPM / ATC and product rules)
  // =============================================================================================
  describe('#12 count conditions', () => {
    const counts = [0, 1, 2, 3, 5];
    const up = counts.map((n) => mk({ profileid: `u${n}`, upcount: n }));
    const cpm = counts.map((n) => mk({ profileid: `c${n}`, cpmcount: n }));
    const atc = counts.map((n) => mk({ profileid: `a${n}`, atccount: n }));

    const cases: [CountCondition, number[]][] = [
      [cond('atLeast', 2), [2, 3, 5]],
      [cond('atMost', 2), [0, 1, 2]],
      [cond('exact', 2), [2]],
      [cond('between', 1, 3), [1, 2, 3]],
      [cond('between', 2, 2), [2]],
      [cond('atMost', 0), [0]],
      [cond('exact', 0), [0]],
      [cond('between', 0, 1), [0, 1]],
    ];

    for (const [c, expected] of cases) {
      const words = `${c.op} ${c.a}${c.op === 'between' ? `..${c.b}` : ''}`;
      it(`uP! count ${words} is inclusive at the boundaries`, () => {
        expect(ids(applyFilters(up, withFilter({ upCount: c })))).toEqual(expected.map((n) => `u${n}`));
      });
      it(`CPM count ${words}`, () => {
        expect(ids(applyFilters(cpm, withFilter({ cpmCount: c })))).toEqual(expected.map((n) => `c${n}`));
      });
      it(`ATC count ${words}`, () => {
        expect(ids(applyFilters(atc, withFilter({ atcCount: c })))).toEqual(expected.map((n) => `a${n}`));
      });
    }

    it('ANDs the three counts together', () => {
      const people = [mk({ profileid: 'hit', upcount: 2, cpmcount: 1, atccount: 4 }), mk({ profileid: 'miss', upcount: 2, cpmcount: 0, atccount: 4 })];
      const f = withFilter({ upCount: cond('atLeast', 2), cpmCount: cond('exact', 1), atcCount: cond('between', 3, 5) });
      expect(ids(applyFilters(people, f))).toEqual(['hit']);
    });

    it('chips each count in words', () => {
      const f = withFilter({ atcCount: cond('between', 1, 3), upCount: cond('atLeast', 2), cpmCount: cond('atMost', 0) });
      expect(labels(f)).toEqual(['ATC count: between 1 and 3', 'uP! count: at least 2', 'CPM count: at most 0']);
      expect(labels(withFilter({ atcCount: cond('exact', 0) }))).toEqual(['ATC count: exactly 0']);
    });

    describe('product rules', () => {
      // x held twice, y once
      const people = [
        mk({ profileid: 'two', consumedproducts: ['x', 'x', 'y'], unconsumedproducts: ['y'] }),
        mk({ profileid: 'one', consumedproducts: ['x'], unconsumedproducts: [] }),
        mk({ profileid: 'none', consumedproducts: ['y'], unconsumedproducts: ['x', 'x', 'x'] }),
      ];
      const consumed = (comparison: CountCondition['op'], count: number | null, count2: number | null = null) =>
        withFilter({ consumed: [{ productId: 'x', comparison, count, count2 }] });

      it('counts every occurrence of the product', () => {
        expect(ids(applyFilters(people, consumed('atLeast', 2)))).toEqual(['two']);
        expect(ids(applyFilters(people, consumed('atMost', 1)))).toEqual(['one', 'none']);
        expect(ids(applyFilters(people, consumed('exact', 0)))).toEqual(['none']);
      });

      it('supports "Is between", inclusive', () => {
        expect(ids(applyFilters(people, consumed('between', 1, 2)))).toEqual(['two', 'one']);
        expect(ids(applyFilters(people, consumed('between', 2, 2)))).toEqual(['two']);
        expect(ids(applyFilters(people, consumed('between', 3, 4)))).toEqual([]);
      });

      it('applies unconsumed rules to the unconsumed list and ANDs every rule', () => {
        const f = withFilter({
          consumed: [{ productId: 'y', comparison: 'atLeast', count: 1 }],
          unconsumed: [{ productId: 'x', comparison: 'between', count: 2, count2: 3 }],
        });
        expect(ids(applyFilters(people, f))).toEqual(['none']);
      });

      it('chips each rule with the product name in words', () => {
        const f = withFilter({
          consumed: [{ productId: 'x', comparison: 'between', count: 1, count2: 2 }],
          unconsumed: [{ productId: 'y', comparison: 'atLeast', count: 1 }],
        });
        expect(labels(f)).toEqual(['Consumed Accelerator: between 1 and 2', 'Unconsumed Mastery: at least 1']);
      });

      it("reads legacy saved comparisons 'gte' / 'lte' / 'eq' as at least / at most / exact", () => {
        const f = mapper.mapSavedFilter({
          pifilter: {
            consumed: [
              { productId: 'x', comparison: 'gte', count: 2 },
              { productId: 'x', comparison: 'lte', count: 1 },
              { productId: 'y', comparison: 'eq', count: 0 },
              { productId: 'y', comparison: 'between', count: 1, count2: 3 },
              { productId: 'y', comparison: 'bogus', count: 1 },
              { comparison: 'gte', count: 1 },
            ],
          },
        });
        expect(f.consumed).toEqual([
          { productId: 'x', comparison: 'atLeast', count: 2, count2: null },
          { productId: 'x', comparison: 'atMost', count: 1, count2: null },
          { productId: 'y', comparison: 'exact', count: 0, count2: null },
          { productId: 'y', comparison: 'between', count: 1, count2: 3 },
          { productId: 'y', comparison: 'atLeast', count: 1, count2: null },
        ]);
        expect(ids(applyFilters(people, withFilter({ consumed: [f.consumed[0]] })))).toEqual(['two']);
      });
    });

    describe('saved count conditions', () => {
      it('reads pifilter conditions back as saved', () => {
        const f = mapper.mapSavedFilter({ pifilter: { atcCount: { op: 'between', a: 1, b: 3 }, upCount: { op: 'atMost', a: 0, b: null } } });
        expect(f.atcCount).toEqual(cond('between', 1, 3));
        expect(f.upCount).toEqual(cond('atMost', 0));
        expect(f.cpmCount).toEqual(cond('atLeast', null));
      });

      it('reads older docs: analytics atccount = exact, this screen = minimum, *CountMin = minimum', () => {
        expect(mapper.mapSavedFilter({ atccount: 4 }).atcCount).toEqual(cond('exact', 4));
        const own = mapper.mapSavedFilter({ atccount: 4, pifilter: { upCountMin: 2, cpmCountMin: 1 } });
        expect(own.atcCount).toEqual(cond('atLeast', 4));
        expect(own.upCount).toEqual(cond('atLeast', 2));
        expect(own.cpmCount).toEqual(cond('atLeast', 1));
      });
    });
  });

  // =============================================================================================
  // #13 — ATC count is null when missing, never 0
  // =============================================================================================
  describe('#13 missing ATC count', () => {
    it('maps a missing or blank atccount to null and keeps a real 0', () => {
      expect(mapper.mapParticipant('a', {}).atccount).toBeNull();
      expect(mapper.mapParticipant('a', { atccount: '' }).atccount).toBeNull();
      expect(mapper.mapParticipant('a', { atccount: 0 }).atccount).toBe(0);
      expect(mapper.mapParticipant('a', { atccount: '4' }).atccount).toBe(4);
    });

    it('never lets a missing count match a condition, not even "at most" or "exactly 0"', () => {
      const people = [mk({ profileid: 'none', atccount: null }), mk({ profileid: 'zero', atccount: 0 }), mk({ profileid: 'five', atccount: 5 })];
      expect(ids(applyFilters(people, withFilter({ atcCount: cond('atMost', 3) })))).toEqual(['zero']);
      expect(ids(applyFilters(people, withFilter({ atcCount: cond('exact', 0) })))).toEqual(['zero']);
      expect(ids(applyFilters(people, withFilter({ atcCount: cond('atLeast', 1) })))).toEqual(['five']);
    });

    it('keeps a missing count out of the power-user insight', () => {
      const s = signal('power-user-no-upgrade');
      expect(s.predicate(mk({ atccount: null }), SIGNAL_CTX)).toBeFalse();
      expect(s.predicate(mk({ atccount: 8 }), SIGNAL_CTX)).toBeTrue();
    });
  });

  // =============================================================================================
  // #14 — subscription relations
  // =============================================================================================
  describe('#14 subscription relations', () => {
    const sub = (profileid: string, start: string | null, end: string | null) => mk({ profileid, subscriptionstart: start, subscriptionend: end });
    // range 1–31 Mar 2026
    const people = [
      sub('A', at(2026, 3, 10), at(2026, 6, 10)), // starts in, ends after
      sub('B', at(2026, 1, 10), at(2026, 3, 20)), // starts before, ends in
      sub('C', at(2026, 3, 5), at(2026, 3, 25)), // inside
      sub('D', at(2026, 1, 1), at(2026, 12, 31)), // spans it
      sub('E', at(2025, 1, 1), at(2025, 12, 31)), // ends before
      sub('F', at(2026, 4, 1), at(2026, 5, 1)), // starts the day after
      sub('G', null, null), // no dates
      sub('H', at(2026, 3, 10), null), // no end
    ];
    const run = (relation: SubscriptionRelation, from: string | null = '2026-03-01', to: string | null = '2026-03-31') =>
      ids(applyFilters(people, withFilter({ subscription: { relation, from, to } })));

    const expected: [SubscriptionRelation, string[]][] = [
      ['startBetween', ['A', 'C', 'H']],
      ['endBetween', ['B', 'C']],
      ['within', ['C']],
      ['startInEndAfter', ['A']],
      ['startBeforeEndIn', ['B']],
      ['throughout', ['D']],
      ['anyTime', ['A', 'B', 'C', 'D']],
      ['notActive', ['E', 'F']],
    ];
    for (const [relation, want] of expected) {
      it(`${relation} matches ${want.join(', ')}`, () => {
        expect(run(relation)).toEqual(want);
      });
    }

    it('never matches a missing date the relation needs', () => {
      for (const [relation] of expected) expect(run(relation)).not.toContain('G');
      // H has a start only: it counts for "Start between" and nothing that reads the end
      for (const [relation] of expected.slice(1)) expect(run(relation)).not.toContain('H');
    });

    it('compares by day, inclusive at both ends', () => {
      const edge = [
        sub('first', at(2026, 3, 1, 0, 0), at(2026, 3, 31, 23, 59)),
        sub('before', at(2026, 2, 28, 23, 59), at(2026, 4, 1, 0, 0)),
      ];
      const f = (relation: SubscriptionRelation) => ids(applyFilters(edge, withFilter({ subscription: { relation, from: '2026-03-01', to: '2026-03-31' } })));
      expect(f('startBetween')).toEqual(['first']);
      expect(f('endBetween')).toEqual(['first']);
      expect(f('within')).toEqual(['first']);
      // S = From and E = To is "throughout" (≤ / ≥), but not "before" / "after" the range (< / >)
      expect(f('throughout')).toEqual(['first', 'before']);
      expect(f('startBeforeEndIn')).toEqual([]);
      expect(f('startInEndAfter')).toEqual([]);
    });

    it('treats a range that touches the subscription as active, and only strictly outside as not active', () => {
      const touching = [sub('endsOnFrom', at(2026, 2, 1), at(2026, 3, 1)), sub('startsOnTo', at(2026, 3, 31), at(2026, 5, 1)), sub('dayBefore', at(2026, 2, 1), at(2026, 2, 28))];
      const f = (relation: SubscriptionRelation) =>
        ids(applyFilters(touching, withFilter({ subscription: { relation, from: '2026-03-01', to: '2026-03-31' } })));
      expect(f('anyTime')).toEqual(['endsOnFrom', 'startsOnTo']);
      expect(f('notActive')).toEqual(['dayBefore']);
    });

    it('keeps a bare yyyy-mm-dd date as that day', () => {
      const bare = [sub('bare', '2026-03-01', '2026-03-31')];
      expect(ids(applyFilters(bare, withFilter({ subscription: { relation: 'within', from: '2026-03-01', to: '2026-03-31' } })))).toEqual(['bare']);
    });

    it('treats an open side of the range as unbounded', () => {
      expect(run('startBetween', '2026-03-01', null)).toEqual(['A', 'C', 'F', 'H']);
      expect(run('startBetween', null, '2026-03-31')).toEqual(['A', 'B', 'C', 'D', 'E', 'H']);
      expect(run('anyTime', '2026-03-01', null)).toEqual(['A', 'B', 'C', 'D', 'F']);
      expect(run('notActive', '2026-03-01', null)).toEqual(['E']);
      // nothing ends after, or starts before, an unbounded side
      expect(run('startInEndAfter', '2026-03-01', null)).toEqual([]);
      expect(run('startBeforeEndIn', null, '2026-03-31')).toEqual([]);
    });

    it('is off with no dates, and ignores a reversed range', () => {
      expect(run('anyTime', null, null).length).toBe(people.length);
      expect(run('anyTime', '2026-03-31', '2026-03-01').length).toBe(people.length);
    });

    it('chips the relation and range in words', () => {
      const chip = (s: SubscriptionFilter) => labels(withFilter({ subscription: s }));
      expect(chip({ relation: 'throughout', from: '2026-03-01', to: '2026-03-31' })).toEqual(['Subscription · Active throughout: 01 Mar 2026 – 31 Mar 2026']);
      expect(chip({ relation: 'startBetween', from: '2026-03-01', to: null })).toEqual(['Subscription · Start between: from 01 Mar 2026']);
      expect(chip({ relation: 'notActive', from: null, to: '2026-03-31' })).toEqual(['Subscription · Not active in the range: until 31 Mar 2026']);
    });

    describe('status decides current vs last subscription', () => {
      const doc = (customerstatus: string): Dict => ({
        customerstatus,
        subscriptionstart: new Date(2026, 0, 1, 12),
        subscriptionend: new Date(2026, 11, 31, 12),
        lastsubscriptionstart: new Date(2025, 0, 1, 12),
        lastsubscriptionend: new Date(2025, 11, 31, 12),
      });

      for (const status of ['non active', 'discontinued']) {
        it(`${status} uses lastsubscriptionstart / lastsubscriptionend`, () => {
          const p = mapper.mapParticipant('a', doc(status));
          expect(p.isLastSubscription).toBeTrue();
          expect(p.subscriptionstart).toBe(p.lastSubscriptionStart);
          expect(p.subscriptionend).toBe(p.lastSubscriptionEnd);
          expect(p.currentSubscriptionStart).toBe(new Date(2026, 0, 1, 12).toISOString());
        });
      }

      for (const status of ['active', 'late', 'banned', 'none']) {
        it(`${status} uses subscriptionstart / subscriptionend`, () => {
          const p = mapper.mapParticipant('a', doc(status));
          expect(p.isLastSubscription).toBeFalse();
          expect(p.subscriptionstart).toBe(p.currentSubscriptionStart);
          expect(p.subscriptionend).toBe(p.currentSubscriptionEnd);
          expect(p.lastSubscriptionStart).toBe(new Date(2025, 0, 1, 12).toISOString());
        });
      }

      it('filters on the field the status picks', () => {
        const people = [mapper.mapParticipant('last', doc('non active')), mapper.mapParticipant('current', doc('active'))];
        const f = (from: string, to: string) => ids(applyFilters(people, withFilter({ subscription: { relation: 'startBetween', from, to } })));
        expect(f('2025-01-01', '2025-01-01')).toEqual(['last']);
        expect(f('2026-01-01', '2026-01-01')).toEqual(['current']);
      });
    });

    describe('saved filters', () => {
      it('reads the relation from pifilter, falling back to "Start between" for an unknown one', () => {
        const saved = (relation: string) => mapper.mapSavedFilter({ pifilter: { subscription: { relation, from: '2026-03-01', to: '2026-03-31' } } }).subscription;
        expect(saved('throughout')).toEqual({ relation: 'throughout', from: '2026-03-01', to: '2026-03-31' });
        expect(saved('sideways').relation).toBe('startBetween');
      });

      it('reads older analytics start / end ranges as Start between / End between', () => {
        const start = mapper.mapSavedFilter({ subscriptionstart: { start: new Date(2026, 2, 1, 12), end: '2026-03-31' } }).subscription;
        expect(start).toEqual({ relation: 'startBetween', from: '2026-03-01', to: '2026-03-31' });
        const end = mapper.mapSavedFilter({ subscriptionstart: { start: null, end: null }, subscriptionend: { start: '2026-03-01', end: null } }).subscription;
        expect(end).toEqual({ relation: 'endBetween', from: '2026-03-01', to: null });
      });
    });
  });

  // =============================================================================================
  // #15 — invalid and no-op conditions are ignored and get no chip
  // =============================================================================================
  describe('#15 validation', () => {
    const people = [0, 1, 2, 3].map((n) => mk({ profileid: `u${n}`, upcount: n, age: n ? 20 + n * 10 : null }));

    it('explains why a count condition cannot apply', () => {
      expect(conditionError(cond('atLeast', -1))).toBe('Use whole numbers, 0 or more.');
      expect(conditionError(cond('exact', 1.5))).toBe('Use whole numbers, 0 or more.');
      expect(conditionError(cond('between', 1, -2))).toBe('Use whole numbers, 0 or more.');
      expect(conditionError(cond('between', 2, null))).toBe('Enter both numbers.');
      expect(conditionError(cond('between', null, 2))).toBe('Enter both numbers.');
      expect(conditionError(cond('between', 3, 1))).toBe('The first number is larger than the second.');
      expect(conditionError(cond('between', 2, 2))).toBeNull();
      expect(conditionError(cond('atLeast', null))).toBeNull();
    });

    it('treats blank and "at least 0" as off, and 0 as valid for the other conditions', () => {
      expect(conditionActive(cond('atLeast', null))).toBeFalse();
      expect(conditionActive(cond('atLeast', 0))).toBeFalse();
      expect(conditionActive(cond('atMost', 0))).toBeTrue();
      expect(conditionActive(cond('exact', 0))).toBeTrue();
      expect(conditionActive(cond('between', 0, 0))).toBeTrue();
      expect(conditionActive(cond('between', 3, 1))).toBeFalse();
      expect(conditionActive(cond('between', 2, null))).toBeFalse();
      expect(conditionActive(cond('atMost', -1))).toBeFalse();
    });

    it('applies no invalid or no-op count and chips none of them', () => {
      for (const c of [cond('between', 3, 1), cond('between', 2, null), cond('atLeast', 0), cond('atLeast', null), cond('atLeast', -1)]) {
        const f = withFilter({ upCount: c });
        expect(applyFilters(people, f).length).withContext(JSON.stringify(c)).toBe(people.length);
        expect(labels(f)).withContext(JSON.stringify(c)).toEqual([]);
      }
    });

    it('still marks invalid input as touched so Reset can clear it', () => {
      expect(filterTouched(withFilter({ upCount: cond('between', 3, 1) }))).toBeTrue();
      expect(filterTouched(withFilter({ upCount: cond('between', null, null) }))).toBeTrue();
      expect(filterTouched(withFilter({ ageMin: 40, ageMax: 30 }))).toBeTrue();
      expect(filterTouched(emptyFilter())).toBeFalse();
    });

    it('ignores a product rule without a product, a number or its upper bound', () => {
      const rules = [
        { productId: 'x', comparison: 'atLeast' as const, count: null },
        { productId: '', comparison: 'atLeast' as const, count: 1 },
        { productId: 'x', comparison: 'between' as const, count: 1, count2: null },
        { productId: 'x', comparison: 'between' as const, count: 3, count2: 1 },
        { productId: 'x', comparison: 'atLeast' as const, count: 0 },
      ];
      for (const r of rules) {
        expect(productRuleActive(r)).withContext(JSON.stringify(r)).toBeFalse();
        const f = withFilter({ consumed: [r], unconsumed: [r] });
        expect(applyFilters(people, f).length).toBe(people.length);
        expect(labels(f)).toEqual([]);
      }
    });

    it('ignores a reversed or negative age range and chips a valid one', () => {
      expect(ageRangeError(40, 30)).toBe('Min is larger than max.');
      expect(ageRangeError(-1, null)).toBe('Use whole numbers, 0 or more.');
      expect(ageRangeError(30, 30)).toBeNull();
      const reversed = withFilter({ ageMin: 40, ageMax: 30 });
      expect(applyFilters(people, reversed).length).toBe(people.length);
      expect(labels(reversed)).toEqual([]);
      // a valid range drops the participant with no date of birth
      expect(ids(applyFilters(people, withFilter({ ageMin: 40 })))).toEqual(['u2', 'u3']);
      expect(labels(withFilter({ ageMin: 40 }))).toEqual(['Age: 40 or older']);
      expect(labels(withFilter({ ageMin: 30, ageMax: 40 }))).toEqual(['Age: 30–40']);
    });

    it('flags a reversed subscription range and does not chip it', () => {
      const s: SubscriptionFilter = { relation: 'anyTime', from: '2026-03-31', to: '2026-03-01' };
      expect(subscriptionFilterError(s)).toBe('The start date is after the end date.');
      expect(subscriptionFilterError({ ...s, from: '2026-03-01', to: '2026-03-01' })).toBeNull();
      expect(labels(withFilter({ subscription: s }))).toEqual([]);
    });

    it('an empty filter matches everyone with no chips', () => {
      expect(applyFilters(people, emptyFilter()).length).toBe(people.length);
      expect(deriveChips(emptyFilter(), REF)).toEqual([]);
    });
  });

  // =============================================================================================
  // #16 — sort header tooltip
  // =============================================================================================
  describe('#16 sort basis tooltip', () => {
    const basis = (key: string, type: 'number' | 'money' | 'date' | 'remarks' | 'array' | 'text' | 'status', dir: 'asc' | 'desc', resolve?: 'product' | 'tag') =>
      ParticipantTableComponent.prototype.sortBasis({ key, label: key, type, resolve }, dir);

    it('names the basis and says blanks go last in both directions', () => {
      expect(basis('upcount', 'number', 'asc')).toBe('Sorted by value, lowest first; blanks last');
      expect(basis('balance', 'money', 'desc')).toBe('Sorted by value, highest first; blanks last');
      expect(basis('purchasedate', 'date', 'asc')).toBe('Sorted by date, oldest first; blanks last');
      expect(basis('purchasedate', 'date', 'desc')).toBe('Sorted by date, newest first; blanks last');
      expect(basis('remarks', 'remarks', 'desc')).toBe('Sorted by number of remarks, most first; blanks last');
      expect(basis('activeproduct', 'array', 'asc', 'product')).toBe('Sorted by the first product (most held first) shown, A–Z; blanks last');
      expect(basis('email', 'text', 'desc')).toBe('Sorted Z–A; blanks last');
      expect(basis('customerstatus', 'status', 'asc')).toBe('Sorted A–Z; blanks last');
    });
  });

  // =============================================================================================
  // #23 — insight fixes
  // =============================================================================================
  describe('#23 insights', () => {
    describe('a) higher-order-mismatch', () => {
      const s = signal('higher-order-mismatch');

      // R5-9: compares with the Journey column (status-based), not the active journey
      it('R5-9 flags a higher-order purchase that differs from the status-based journey', () => {
        expect(s.predicate(mk({ customerstatus: 'active', higherorderpurchase: 'j2', journey: 'j1' }), SIGNAL_CTX)).toBeTrue();
        expect(s.predicate(mk({ customerstatus: 'non active', higherorderpurchase: 'j2', journey: 'j1' }), SIGNAL_CTX)).toBeTrue();
      });

      it('R5-9 does not flag a non active / discontinued participant whose journey matches (active journey blank)', () => {
        for (const customerstatus of ['non active', 'discontinued'] as const) {
          expect(s.predicate(mk({ customerstatus, higherorderpurchase: 'j1', journey: 'j1', activejourney: null }), SIGNAL_CTX))
            .withContext(customerstatus)
            .toBeFalse();
        }
      });

      it('R5-9 skips rows with no journey and rows with no higher-order purchase', () => {
        for (const customerstatus of ['none', 'late', 'banned'] as const) {
          expect(s.predicate(mk({ customerstatus, higherorderpurchase: 'j2', journey: null }), SIGNAL_CTX)).withContext(customerstatus).toBeFalse();
        }
        expect(s.predicate(mk({ higherorderpurchase: null, journey: 'j1' }), SIGNAL_CTX)).toBeFalse();
        expect(s.predicate(mk({ higherorderpurchase: '', journey: 'j1' }), SIGNAL_CTX)).toBeFalse();
      });
    });

    describe('b) active-sub-expired', () => {
      const s = signal('active-sub-expired');
      const active = (end: string | null) => mk({ customerstatus: 'active', subscriptionend: end });

      it('flags an end day before today', () => {
        expect(s.predicate(active(dayOffset(-1, 23, 59)), SIGNAL_CTX)).toBeTrue();
      });

      it('keeps today as the last active day, whatever the time', () => {
        expect(s.predicate(active(dayOffset(0, 0, 0)), SIGNAL_CTX)).toBeFalse();
        expect(s.predicate(active(dayOffset(0, 23, 59)), SIGNAL_CTX)).toBeFalse();
        expect(s.predicate(active(dayOffset(1)), SIGNAL_CTX)).toBeFalse();
      });

      it('needs an end date and an active customer', () => {
        expect(s.predicate(active(null), SIGNAL_CTX)).toBeFalse();
        expect(s.predicate(mk({ customerstatus: 'non active', subscriptionend: dayOffset(-1) }), SIGNAL_CTX)).toBeFalse();
      });
    });

    describe('c) status-none-engaged', () => {
      const s = signal('status-none-engaged');
      const none = (over: Partial<Participant>) => mk({ customerstatus: 'none', ...over });

      it('counts a known active or consumed product, or an active journey that exists', () => {
        expect(s.predicate(none({ activeproduct: ['p1'] }), SIGNAL_CTX)).toBeTrue();
        expect(s.predicate(none({ consumedproducts: ['p1'] }), SIGNAL_CTX)).toBeTrue();
        expect(s.predicate(none({ activejourney: 'j1' }), SIGNAL_CTX)).toBeTrue();
      });

      it('ignores unknown products and journeys', () => {
        expect(s.predicate(none({ activeproduct: ['ghost'], consumedproducts: ['ghost'], activejourney: 'jX' }), SIGNAL_CTX)).toBeFalse();
        expect(s.predicate(none({}), SIGNAL_CTX)).toBeFalse();
      });

      it('only applies with no customer status', () => {
        expect(s.predicate(mk({ customerstatus: 'active', activeproduct: ['p1'] }), SIGNAL_CTX)).toBeFalse();
      });

      it('drops blank and non-string ids when mapping, so they never count as engagement', () => {
        const p = mapper.mapParticipant('a', { customerstatus: 'none', activeproduct: ['', '  ', null, 7, 'p1'], consumedproducts: [' '], profiletags: ['', 't1'] });
        expect(p.activeproduct).toEqual(['p1']);
        expect(p.consumedproducts).toEqual([]);
        expect(p.profiletags).toEqual(['t1']);
        const blankOnly = mapper.mapParticipant('b', { customerstatus: 'none', activeproduct: ['', ' '], consumedproducts: [''] });
        expect(s.predicate(blankOnly, SIGNAL_CTX)).toBeFalse();
      });
    });

    it('d) renames active-never-contacted', () => {
      expect(signal('active-never-contacted').label).toBe('Active, no remarks yet');
    });
  });

  // =============================================================================================
  // #24 — Finance status insights
  // =============================================================================================
  describe('#24 finance status', () => {
    const statuses: FinancialStatus[] = ['regular', 'fully paid', 'defaulted', 'locked', 'late', 'banned', 'discontinued', 'none'];
    const breakdown = SIGNALS.filter((s) => s.category === 'finance' && s.breakdown);

    it('has one breakdown card per Watson finance status, in order', () => {
      expect(breakdown.map((s) => s.id)).toEqual([
        'finance-regular',
        'finance-fully-paid',
        'finance-defaulted',
        'finance-locked',
        'finance-late',
        'finance-banned',
        'finance-discontinued',
        'finance-none',
      ]);
      expect(signal('finance-none').chipLabel).toBe('Finance: None');
    });

    it('each card matches its own status only', () => {
      for (const status of statuses) {
        const p = mk({ financialstatus: status });
        expect(breakdown.filter((s) => s.predicate(p, SIGNAL_CTX)).map((s) => s.id)).withContext(status).toEqual([`finance-${status.replace(' ', '-')}`]);
      }
    });

    it('flags an active customer whose finance is defaulted, locked, banned, late or discontinued', () => {
      const s = signal('active-customer-finance-inactive');
      expect(s.category).toBe('finance');
      expect(s.breakdown).toBeFalsy();
      for (const status of statuses) {
        const flagged = ['defaulted', 'locked', 'banned', 'late', 'discontinued'].includes(status);
        expect(s.predicate(mk({ customerstatus: 'active', financialstatus: status }), SIGNAL_CTX)).withContext(status).toBe(flagged);
      }
      expect(s.predicate(mk({ customerstatus: 'non active', financialstatus: 'defaulted' }), SIGNAL_CTX)).toBeFalse();
    });

    it('R5-4 the old integrity card (defaulted / banned only) is gone', () => {
      expect(SIGNALS.some((x) => x.id === 'defaulted-but-active')).toBeFalse();
    });

    it('R5-5 flags an active or non active customer with no finance status', () => {
      const s = signal('customer-no-finance-status');
      expect(s.category).toBe('finance');
      expect(s.predicate(mk({ customerstatus: 'active', financialstatus: 'none' }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ customerstatus: 'non active', financialstatus: 'none' }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ customerstatus: 'discontinued', financialstatus: 'none' }), SIGNAL_CTX)).toBeFalse();
      expect(s.predicate(mk({ customerstatus: 'active', financialstatus: 'regular' }), SIGNAL_CTX)).toBeFalse();
    });

    it('R5-5 a blank or unknown stored finance status maps to none', () => {
      expect(mapper.mapParticipant('a', { financialstatus: '' }).financialstatus).toBe('none');
      expect(mapper.mapParticipant('a', { financialstatus: 'Regulr' }).financialstatus).toBe('none');
      expect(mapper.mapParticipant('a', {}).financialstatus).toBe('none');
    });
  });

  // =============================================================================================
  // R5-6 / R5-7 / R5-8 — new integrity cards
  // =============================================================================================
  describe('R5 integrity cards', () => {
    it('R5-6 onboarding not updated: active / non active with currentjourneyonboarded never set', () => {
      const s = signal('onboarding-not-updated');
      expect(s.category).toBe('integrity');
      expect(s.predicate(mk({ customerstatus: 'active', onboarded: null }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ customerstatus: 'non active', onboarded: null }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ customerstatus: 'active', onboarded: false }), SIGNAL_CTX)).toBeFalse();
      expect(s.predicate(mk({ customerstatus: 'active', onboarded: true }), SIGNAL_CTX)).toBeFalse();
      expect(s.predicate(mk({ customerstatus: 'discontinued', onboarded: null }), SIGNAL_CTX)).toBeFalse();
    });

    it('R5-6 maps currentjourneyonboarded: booleans kept, anything else is not set', () => {
      expect(mapper.mapParticipant('a', { currentjourneyonboarded: true }).onboarded).toBeTrue();
      expect(mapper.mapParticipant('a', { currentjourneyonboarded: false }).onboarded).toBeFalse();
      expect(mapper.mapParticipant('a', {}).onboarded).toBeNull();
      expect(mapper.mapParticipant('a', { currentjourneyonboarded: '' }).onboarded).toBeNull();
    });

    it('R5-7 age not updated: active / non active with no age', () => {
      const s = signal('age-not-updated');
      expect(s.category).toBe('integrity');
      expect(s.predicate(mk({ customerstatus: 'active', age: null }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ customerstatus: 'non active', age: null }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ customerstatus: 'active', age: 30 }), SIGNAL_CTX)).toBeFalse();
      expect(s.predicate(mk({ customerstatus: 'late', age: null }), SIGNAL_CTX)).toBeFalse();
    });

    it('R5-8 queue products: arena events of type queue, not deleted, ending today or later', () => {
      const ts = (iso: string) => ({ toDate: () => new Date(iso) });
      const row = (data: Dict) => ({ data: () => data });
      const snap = {
        docs: [
          row({ productref: { id: 'past' }, startdate: ts(dayOffset(-30)), enddate: ts(dayOffset(-1)) }),
          row({ productref: { id: 'today' }, startdate: ts(dayOffset(-30)), enddate: ts(dayOffset(0, 0, 1)) }),
          row({ productref: { id: 'future' }, startdate: ts(dayOffset(10)), enddate: ts(dayOffset(20)) }),
          row({ productref: { id: 'deleted' }, enddate: ts(dayOffset(20)), delete: true }),
          row({ productref: { id: 'noend' } }),
          row({ enddate: ts(dayOffset(20)) }),
        ],
      };
      expect(mapper.queueProductIds(snap).sort()).toEqual(['future', 'today']);
      expect(mapper.queueProductIds(null)).toEqual([]);
    });

    it('R5-8 DFU and queue product ongoing together, any status', () => {
      const s = signal('dfu-and-queue-product');
      expect(s.category).toBe('integrity');
      expect(s.predicate(mk({ activeproduct: ['dfu1', 'qp1'] }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ customerstatus: 'none', activeproduct: ['qp2', 'p1', 'dfu2'] }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ activeproduct: ['dfu1', 'dfu2'] }), SIGNAL_CTX)).toBeFalse();
      expect(s.predicate(mk({ activeproduct: ['qp1', 'qp2'] }), SIGNAL_CTX)).toBeFalse();
      expect(s.predicate(mk({ activeproduct: [] }), SIGNAL_CTX)).toBeFalse();
    });
  });

  // =============================================================================================
  // #27 — multiple DFU products
  // =============================================================================================
  describe('#27 multiple DFU products active', () => {
    const s = signal('multiple-dfu-active');
    const has = (activeproduct: string[]) => s.predicate(mk({ activeproduct }), SIGNAL_CTX);

    it('flags two or more DFU entries, counting a repeated product each time', () => {
      expect(s.category).toBe('integrity');
      expect(has(['dfu1', 'dfu2'])).toBeTrue();
      expect(has(['dfu1', 'dfu1'])).toBeTrue();
      expect(has(['p1', 'dfu1', 'dfu2'])).toBeTrue();
    });

    it('does not flag one DFU product or none', () => {
      expect(has(['dfu1', 'p1'])).toBeFalse();
      expect(has(['p1', 'p1'])).toBeFalse();
      expect(has([])).toBeFalse();
    });
  });

  // =============================================================================================
  // Watson R1–R5 (unchanged by round 4)
  // =============================================================================================
  describe('Watson rules R1–R5', () => {
    const rule = (id: string) => {
      const r = WATSON_RULES.find((x) => x.id === id);
      if (!r) throw new Error(`no rule ${id}`);
      return r;
    };
    const violates = (id: string, over: Partial<Participant>) => rule(id).violates(mk(over));

    it('has exactly R1–R5', () => {
      expect(WATSON_RULES.map((r) => r.id)).toEqual(['watson-r1', 'watson-r2', 'watson-r3', 'watson-r4', 'watson-r5']);
    });

    it('R1: regular / defaulted / locked / fully paid need an active or non active subscription', () => {
      for (const financialstatus of ['regular', 'defaulted', 'locked', 'fully paid'] as const) {
        expect(violates('watson-r1', { financialstatus, customerstatus: 'active' })).toBeFalse();
        expect(violates('watson-r1', { financialstatus, customerstatus: 'non active' })).toBeFalse();
        expect(violates('watson-r1', { financialstatus, customerstatus: 'discontinued' })).toBeTrue();
        expect(violates('watson-r1', { financialstatus, customerstatus: 'none' })).toBeTrue();
      }
      expect(violates('watson-r1', { financialstatus: 'late', customerstatus: 'none' })).toBeFalse();
    });

    it('R2–R4: discontinued / banned / late must match the subscription status', () => {
      expect(violates('watson-r2', { financialstatus: 'discontinued', customerstatus: 'non active' })).toBeTrue();
      expect(violates('watson-r2', { financialstatus: 'discontinued', customerstatus: 'discontinued' })).toBeFalse();
      expect(violates('watson-r3', { financialstatus: 'banned', customerstatus: 'active' })).toBeTrue();
      expect(violates('watson-r3', { financialstatus: 'banned', customerstatus: 'banned' })).toBeFalse();
      expect(violates('watson-r4', { financialstatus: 'late', customerstatus: 'active' })).toBeTrue();
      expect(violates('watson-r4', { financialstatus: 'late', customerstatus: 'late' })).toBeFalse();
      expect(violates('watson-r2', { financialstatus: 'regular', customerstatus: 'active' })).toBeFalse();
    });

    it('R5: balance ≤ 1000 ⇔ fully paid, skipping discontinued / banned / late and no purchase value', () => {
      expect(violates('watson-r5', { financialstatus: 'regular', balance: 500 })).toBeTrue();
      expect(violates('watson-r5', { financialstatus: 'fully paid', balance: 1000 })).toBeFalse();
      expect(violates('watson-r5', { financialstatus: 'fully paid', balance: 1001 })).toBeTrue();
      expect(violates('watson-r5', { financialstatus: 'regular', balance: 5000 })).toBeFalse();
      expect(violates('watson-r5', { financialstatus: 'fully paid', balance: null })).toBeFalse();
      for (const financialstatus of ['discontinued', 'banned', 'late'] as const) expect(violates('watson-r5', { financialstatus, balance: 0 })).toBeFalse();
    });

    it('the Watson mismatch insight fires when any rule does', () => {
      const s = signal('watson-mismatch');
      expect(s.predicate(mk({ financialstatus: 'banned', customerstatus: 'active' }), SIGNAL_CTX)).toBeTrue();
      expect(s.predicate(mk({ financialstatus: 'regular', customerstatus: 'active', balance: 5000 }), SIGNAL_CTX)).toBeFalse();
    });
  });

  // =============================================================================================
  // #18 — "modified" detection for a loaded saved filter
  // =============================================================================================
  describe('#18 filter signature', () => {
    const base = withFilter({ customerstatus: ['active', 'late'], upCount: cond('atLeast', 2) });

    it('ignores value order, the search box and switched-off conditions', () => {
      expect(filterSignature(withFilter({ customerstatus: ['late', 'active'], upCount: cond('atLeast', 2) }))).toBe(filterSignature(base));
      expect(filterSignature({ ...base, search: 'pat' })).toBe(filterSignature(base));
      expect(filterSignature({ ...base, cpmCount: cond('atLeast', 0) })).toBe(filterSignature(base));
      expect(filterSignature({ ...base, consumed: [{ productId: 'x', comparison: 'atLeast', count: null }] })).toBe(filterSignature(base));
    });

    it('ignores the event / queue switch while nothing is ticked', () => {
      expect(filterSignature({ ...base, eventStatus: 'confirmed', queueStatus: 'live' })).toBe(filterSignature(base));
      expect(filterSignature({ ...base, events: ['e1'], eventStatus: 'confirmed' })).not.toBe(filterSignature({ ...base, events: ['e1'] }));
    });

    it('changes when what the filter applies changes', () => {
      expect(filterSignature({ ...base, upCount: cond('atLeast', 3) })).not.toBe(filterSignature(base));
      expect(filterSignature({ ...base, exclude: { tier: ['gold'] } })).not.toBe(filterSignature(base));
      expect(filterSignature({ ...base, subscription: { relation: 'anyTime', from: '2026-03-01', to: null } })).not.toBe(filterSignature(base));
    });
  });
});
