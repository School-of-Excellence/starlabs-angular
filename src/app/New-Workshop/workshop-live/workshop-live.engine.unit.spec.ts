import {
  CompletionRow, FALLBACK_TITLE, LiveDoc, NIL, UNKNOWN_PERSON, UNTITLED_WORKSHOP, ViewRowCache,
  challengeNameIndex, chunk, compareCompletions, completedParts, completionRows, completionStamps, completionsLabel,
  docCompletionRows, formatClock, formatCompletedAt, formatPhone, freshKeys, isLookupId, liveCompletions, liveViewRows,
  mainChallengeName, mergeCompletions, missingIds, personCells, sortCompletions, splitEmail, emailParts, subChallengeName, workshopTitle,
  PAGE_SIZE, SearchableRow, clampPage, filterRows, isPhoneTerm, matchesLabel, normaliseSearch, pageCountFor, pageLabel,
  pageSlice, phoneDigits, rangeLabel, rowMatchesSearch, searchAwaitingPeople,
  NEW_USER, PeopleDetails, customerStatusLabel, detailCells, isStillNewUser, journeyLabel, journeyNameIndex, shownPerson,
} from './workshop-live.engine';
import { formatDateTime } from '../workshop-dashboard/workshop-dashboard.engine';

/** A Firestore-Timestamp look-alike (the engine only calls toMillis/toDate). */
const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime(), toDate: () => new Date(iso) });
const ms = (iso: string) => new Date(iso).getTime();

const sub = (challengeid: string, status: string, extra: any = {}) => ({ challengeid, status, ...extra });
const main = (challengeid: string, heading: string, subheading: string, subs: any[]) =>
  ({ challengeid, heading, subheading, challenges: subs });

describe('workshop live engine', () => {
  describe('names', () => {
    it('main challenge: "heading: subheading", trimmed, one part alone when the other is missing', () => {
      expect(mainChallengeName({ heading: ' Module One ', subheading: ' Basics ' })).toBe('Module One: Basics');
      expect(mainChallengeName({ heading: 'Module One', subheading: '  ' })).toBe('Module One');
      expect(mainChallengeName({ heading: '', subheading: 'Basics' })).toBe('Basics');
      expect(mainChallengeName({})).toBe('');
      expect(mainChallengeName(null)).toBe('');
    });

    it('sub challenge: name, else heading', () => {
      expect(subChallengeName({ name: ' Watch intro ', heading: 'Intro' })).toBe('Watch intro');
      expect(subChallengeName({ name: '', heading: ' Intro ' })).toBe('Intro');
      expect(subChallengeName({})).toBe('');
    });

    it('indexes the config by challengeid, skipping blank names and bad nodes', () => {
      const idx = challengeNameIndex({
        challenges: [
          main('m1', 'Module One', 'Basics', [{ challengeid: 's1', name: 'Watch' }, { challengeid: 's2', name: '', heading: '' }, null]),
          null,
          { challengeid: 'm2', heading: '', subheading: '', challenges: 'not a list' },
          { challengeid: 'z1', type: 'zoomcall', heading: 'Live call' },
        ],
      });
      expect(idx.main.get('m1')).toBe('Module One: Basics');
      expect(idx.main.has('m2')).toBeFalse();
      expect(idx.main.get('z1')).toBe('Live call');
      expect(idx.sub.get('s1')).toBe('Watch');
      expect(idx.sub.has('s2')).toBeFalse();
      expect(challengeNameIndex(null).main.size).toBe(0);
      expect(challengeNameIndex({ challenges: null }).sub.size).toBe(0);
    });

    it('workshop title, with a fallback for a config without one', () => {
      expect(workshopTitle({ detailpage: { title: ' Spring Batch ' } })).toBe('Spring Batch');
      expect(workshopTitle({ detailpage: {} })).toBe(UNTITLED_WORKSHOP);
      expect(workshopTitle(null)).toBe(UNTITLED_WORKSHOP);
      expect(FALLBACK_TITLE).toBe('Workshop live');
    });
  });

  describe('completionRows', () => {
    const docs: LiveDoc[] = [
      {
        id: 'pwA', data: {
          profileid: ' p0 ',
          challenges: [
            main('m1', 'Old heading', 'Old sub', [
              sub('s1', 'completed', { completed: ts('2026-11-19T10:00:00Z'), name: 'Copy name' }),
              sub('s2', 'finished', { finished: ts('2026-11-19T11:00:00Z') }),
              sub('s3', 'inreview'),
              sub('s4', 'completed', { heading: 'Heading only' }),
              null,
            ]),
            { challengeid: 'z1', type: 'zoomcall', status: 'completed', completed: ts('2026-11-19T12:00:00Z') },
          ],
        },
      },
      { id: 'pwNull', data: { profileid: 'p1', challenges: null } },
      { id: 'pwBad', data: { profileid: 'p2', challenges: 'nope' } },
      { id: 'pwNoData', data: null },
    ];

    it('one row per completed sub challenge only (not finished / in review / zoom mains), null-safe', () => {
      const rows = completionRows(docs);
      expect(rows.map(r => r.subId)).toEqual(['s1', 's4']);
      expect(rows[0].profileid).toBe('p0');
      expect(rows[0].docId).toBe('pwA');
      expect(rows[0].completedMs).toBe(ms('2026-11-19T10:00:00Z'));
      expect(rows[1].completedMs).toBeNull();
      expect(completionRows(null)).toEqual([]);
    });

    it('uses the participant copy without a config, and the config by challengeid with one', () => {
      expect(completionRows(docs).map(r => [r.mainName, r.subName])).toEqual([
        ['Old heading: Old sub', 'Copy name'],
        ['Old heading: Old sub', 'Heading only'],
      ]);
      // The config lists the steps in another order and renamed: matched by id, not by position.
      const names = challengeNameIndex({
        challenges: [
          main('m0', 'Intro', '', [{ challengeid: 'sX', name: 'Intro video' }]),
          main('m1', 'Module One', 'Basics', [{ challengeid: 's4', name: 'Reflect' }, { challengeid: 's1', name: 'Watch intro' }]),
        ],
      });
      expect(completionRows(docs, names).map(r => [r.mainName, r.subName])).toEqual([
        ['Module One: Basics', 'Watch intro'],
        ['Module One: Basics', 'Reflect'],
      ]);
    });

    it('falls back to the copy for a step the config does not know', () => {
      const names = challengeNameIndex({ challenges: [main('other', 'Other', '', [])] });
      expect(completionRows(docs, names)[0].subName).toBe('Copy name');
    });

    it('keys are stable ids, with indexes only when an id is missing or repeated', () => {
      const rows = completionRows([{
        id: 'd', data: {
          profileid: 'p', challenges: [
            { heading: 'No id', challenges: [sub('', 'completed'), sub('x', 'completed'), sub('x', 'completed')] },
          ],
        },
      }]);
      expect(rows.map(r => r.key)).toEqual(['d~m0~s0', 'd~m0~x', 'd~m0~x~0.2']);
      expect(new Set(rows.map(r => r.key)).size).toBe(3);
    });
  });

  describe('order', () => {
    const row = (key: string, completedMs: number | null): CompletionRow => ({
      key, docId: key, profileid: 'p', mainIndex: 0, subIndex: 0, mainId: 'm', subId: key,
      mainName: '', subName: '', completedMs,
    });

    it('newest first, no date last, equal dates by key', () => {
      const sorted = sortCompletions([row('b', null), row('c', 100), row('a', null), row('e', 300), row('d', 100)]);
      expect(sorted.map(r => r.key)).toEqual(['e', 'c', 'd', 'a', 'b']);
    });

    it('does not mutate its input and is stable under re-delivery', () => {
      const input = [row('x', 1), row('y', 2)];
      const once = sortCompletions(input);
      expect(input.map(r => r.key)).toEqual(['x', 'y']);
      expect(sortCompletions([...once].reverse()).map(r => r.key)).toEqual(once.map(r => r.key));
      expect(compareCompletions(row('a', 5), row('a', 5))).toBe(0);
    });

    it('liveCompletions flattens, names and sorts', () => {
      const rows = liveCompletions([
        { id: 'pw1', data: { profileid: 'p1', challenges: [main('m', 'M', '', [
          sub('old', 'completed', { completed: ts('2026-11-18T09:00:00Z') }),
          sub('none', 'completed'),
        ])] } },
        { id: 'pw2', data: { profileid: 'p2', challenges: [main('m', 'M', '', [
          sub('new', 'completed', { completed: ts('2026-11-19T09:00:00Z') }),
        ])] } },
      ]);
      expect(rows.map(r => r.subId)).toEqual(['new', 'old', 'none']);
    });

    it('per-doc rows merged give exactly the whole-feed result (the screen redoes only changed docs)', () => {
      const docs: LiveDoc[] = [
        { id: 'pw1', data: { profileid: 'p1', challenges: [main('m', 'M', '', [
          sub('a', 'completed', { completed: ts('2026-11-18T09:00:00Z') }), sub('b', 'completed')])] } },
        { id: 'pw2', data: { profileid: 'p2', challenges: [main('m', 'M', '', [
          sub('c', 'completed', { completed: ts('2026-11-19T09:00:00Z') }), sub('a', 'completed', { completed: ts('2026-11-18T09:00:00Z') })])] } },
      ];
      const names = challengeNameIndex({ challenges: [main('m', 'Module', 'One', [{ challengeid: 'a', name: 'Alpha' }])] });
      const perDoc = new Map(docs.map(d => [d.id, docCompletionRows(d.id, d.data, names)] as [string, CompletionRow[]]));
      expect(mergeCompletions(perDoc.values())).toEqual(liveCompletions([...docs].reverse(), names));
      expect(mergeCompletions([])).toEqual([]);
    });
  });

  describe('fresh rows', () => {
    const r = (key: string, completedMs: number | null) => ({ key, completedMs } as CompletionRow);

    it('nothing is fresh on the first snapshot', () => {
      expect(freshKeys(null, [r('a', 1)])).toEqual([]);
    });

    it('a new key, or a new stamp on a known key, is fresh', () => {
      const prev = completionStamps([r('a', 1), r('b', null)]);
      expect(freshKeys(prev, [r('a', 1), r('b', null)])).toEqual([]);
      expect(freshKeys(prev, [r('c', 5), r('a', 2), r('b', null)])).toEqual(['c', 'a']);
      expect(freshKeys(prev, [r('b', 9)])).toEqual(['b']);
    });
  });

  describe('people', () => {
    it('lookup ids: non-empty, no slash', () => {
      expect(isLookupId('abc')).toBeTrue();
      expect(isLookupId('  ')).toBeFalse();
      expect(isLookupId(null)).toBeFalse();
      expect(isLookupId('a/b')).toBeFalse();
    });

    it('missing ids: unique, trimmed, valid, not asked yet, in first-seen order', () => {
      const asked = new Set(['p1']);
      expect(missingIds(['p2', ' p1 ', 'p3', 'p2', '', 'x/y', null, ' p3'], asked)).toEqual(['p2', 'p3']);
      expect(missingIds([], asked)).toEqual([]);
    });

    it('chunks into 30s', () => {
      const ids = Array.from({ length: 61 }, (_, i) => 'p' + i);
      expect(chunk(ids).map(c => c.length)).toEqual([30, 30, 1]);
      expect(chunk([], 30)).toEqual([]);
    });

    it('phone: both spellings of the country code, a missing "+" added, "" without a number', () => {
      expect(formatPhone({ countrycode: '+91', phonenumber: '9999900000' })).toBe('+91 9999900000');
      expect(formatPhone({ countryCode: '91', phonenumber: 9876543210 })).toBe('+91 9876543210');
      expect(formatPhone({ phonenumber: ' 12345 ' })).toBe('12345');
      expect(formatPhone({ countrycode: '+91', phonenumber: '' })).toBe('');
      expect(formatPhone(null)).toBe('');
    });

    it('cells: pending, unknown, found (with "Unknown" / "—" for blanks)', () => {
      expect(personCells(undefined)).toEqual({ personPending: true, name: '', phone: '', email: '' });
      expect(personCells(null)).toEqual({ personPending: false, name: UNKNOWN_PERSON, phone: NIL, email: NIL });
      expect(personCells({ name: ' Asha ', email: ' a@x.in ', countrycode: '+91', phonenumber: '99' }))
        .toEqual({ personPending: false, name: 'Asha', phone: '+91 99', email: 'a@x.in' });
      expect(personCells({ name: '', email: '' })).toEqual({ personPending: false, name: UNKNOWN_PERSON, phone: NIL, email: NIL });
    });

    it('view rows join people by profileid; an id that cannot be looked up reads as unknown', () => {
      const rows = [
        { key: 'k1', profileid: 'p1', completedMs: ms('2026-11-19T10:35:00Z') },
        { key: 'k2', profileid: 'p2', completedMs: null },
        { key: 'k3', profileid: '', completedMs: null },
        { key: 'k4', profileid: 'p4', completedMs: null },
      ] as CompletionRow[];
      const people = new Map<string, any>([['p1', { name: 'Asha' }], ['p4', null]]);
      const view = liveViewRows(rows, people);
      expect(view.map(v => [v.personPending, v.name])).toEqual([
        [false, 'Asha'], [true, ''], [false, UNKNOWN_PERSON], [false, UNKNOWN_PERSON],
      ]);
      expect(view[0].completedIso).toBe('2026-11-19T10:35:00.000Z');
      expect(view[0].completedText).toBe(formatCompletedAt(ms('2026-11-19T10:35:00Z')));
      expect(view[1].completedText).toBe(NIL);
      expect(view[1].completedIso).toBeNull();
      expect([view[1].completedDay, view[1].completedTime]).toEqual(['', '']);
      expect(view[0].completedText).toBe(`${view[0].completedDay}, ${view[0].completedTime}`);
      expect(view[0].emailParts).toEqual([NIL]);
    });

    it('email split before the @ (the shown text is the two parts joined)', () => {
      expect(splitEmail('asha.k+ws@example.co.in')).toEqual(['asha.k+ws', '@example.co.in']);
      expect(splitEmail('no-at-sign')).toEqual(['no-at-sign', '']);
      expect(splitEmail('@odd')).toEqual(['@odd', '']);
      expect(splitEmail(NIL)).toEqual([NIL, '']);
    });

    it('email break pieces: before the @ and before each . _ + -, joined they are the email exactly', () => {
      expect(emailParts('asha.k+ws@example.co.in')).toEqual(['asha', '.k', '+ws', '@example', '.co', '.in']);
      expect(emailParts('first_last-1@my-school.org')).toEqual(['first', '_last', '-1', '@my', '-school', '.org']);
      // A mark first (or twice in a row) never makes an empty piece; no '@' and '—' are one piece.
      expect(emailParts('.a..b@x')).toEqual(['.a', '.', '.b', '@x']);
      expect(emailParts('plainaddress')).toEqual(['plainaddress']);
      expect(emailParts(NIL)).toEqual([NIL]);
      expect(emailParts('')).toEqual([]);
      for (const e of ['wlvk.divya.blank.wshop@example.com', 'a+b_c-d.e@f-g.h.i', '@odd', 'x@']) {
        expect(emailParts(e).join('')).toBe(e);
        expect(emailParts(e).every(part => part.length > 0)).toBeTrue();
      }
      const v = liveViewRows([{ key: 'k', profileid: 'p', completedMs: null } as CompletionRow],
        new Map([['p', { name: 'A', email: ' a.b@x.org ' }]]))[0];
      expect(v.emailParts.join('')).toBe(v.email);
      expect(v.emailParts).toEqual(['a', '.b', '@x', '.org']);
    });

    it('the view cache reuses a row while its completion and person are the same, and forgets dropped rows', () => {
      const a = { key: 'a', profileid: 'p1', completedMs: ms('2026-11-19T10:00:00Z') } as CompletionRow;
      const b = { key: 'b', profileid: 'p2', completedMs: null } as CompletionRow;
      const asha = { name: 'Asha' };
      const people = new Map<string, any>([['p1', asha]]);
      const cache: ViewRowCache = new Map();
      const one = liveViewRows([a, b], people, cache);
      const two = liveViewRows([a, b], people, cache);
      expect(two[0]).toBe(one[0]);
      expect(two[1]).toBe(one[1]);
      expect(two[1].personPending).toBeTrue();
      // b's person lands: only b is rebuilt
      people.set('p2', null);
      const three = liveViewRows([a, b], people, cache);
      expect(three[0]).toBe(one[0]);
      expect(three[1]).not.toBe(one[1]);
      expect(three[1].name).toBe(UNKNOWN_PERSON);
      // a's doc changed (a new completion object with the same key): rebuilt
      const a2 = { ...a, completedMs: ms('2026-11-19T11:00:00Z') };
      const four = liveViewRows([a2, b], people, cache);
      expect(four[0]).not.toBe(one[0]);
      expect(four[0].completedIso).toBe('2026-11-19T11:00:00.000Z');
      // b dropped from the feed: dropped from the cache
      liveViewRows([a2], people, cache);
      expect([...cache.keys()]).toEqual(['a']);
    });
  });

  describe('labels', () => {
    it('completed at: the dashboard date-time format, "—" without a date', () => {
      const t = new Date(2026, 10, 19, 16, 5).getTime();
      expect(formatCompletedAt(t)).toMatch(/^19 Nov 2026, 4:05\s?pm$/i);
      expect(formatCompletedAt(null)).toBe(NIL);
      expect(formatCompletedAt(NaN)).toBe(NIL);
      expect(completedParts(undefined)).toBeNull();
      expect(completedParts(Infinity)).toBeNull();
    });

    it('completed at: the same text as the dashboard formatDateTime (built once instead of per call)', () => {
      const instants = [
        new Date(2026, 10, 19, 16, 5), new Date(2026, 10, 5, 9, 2), new Date(2026, 8, 28, 22, 45),
        new Date(2026, 0, 1, 0, 0), new Date(2026, 5, 30, 12, 0), new Date(2025, 11, 31, 23, 59, 59),
        new Date(2026, 2, 9, 7, 7),
      ].map(d => d.getTime());
      for (const t of instants) expect(formatCompletedAt(t)).withContext(new Date(t).toString()).toBe(formatDateTime(new Date(t)));
      const p = completedParts(new Date(2026, 10, 5, 9, 2).getTime())!;
      expect(p.day).toBe(new Date(2026, 10, 5, 9, 2).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
      expect(p.time).toMatch(/^9:02\s?am$/i);
    });

    it('count', () => {
      expect(completionsLabel(0)).toBe('0 completions');
      expect(completionsLabel(1)).toBe('1 completion');
      expect(completionsLabel(1234)).toBe('1,234 completions');
    });

    it('clock: hh:mm:ss am/pm, local time', () => {
      expect(formatClock(new Date(2026, 10, 19, 16, 5, 9).getTime())).toBe('04:05:09 pm');
      expect(formatClock(new Date(2026, 10, 19, 0, 0, 0).getTime())).toBe('12:00:00 am');
      expect(formatClock(new Date(2026, 10, 19, 12, 30, 1).getTime())).toBe('12:30:01 pm');
      expect(formatClock(NaN)).toBe('');
    });
  });

  describe('search', () => {
    const person = (name: string, phone: string, email: string): SearchableRow => ({ personPending: false, name, phone, email });
    const asha = person('Asha  Rao', '+91 9999900000', 'Asha.Rao@Example.org');
    const ben = person('Ben Okafor', '+44 7700-900123', 'ben@okafor.dev');
    const pending: SearchableRow = { personPending: true, name: '', phone: '', email: '' };
    const unknown = person(UNKNOWN_PERSON, NIL, NIL);

    it('normalises a term: trimmed, lower case, inner spaces as one', () => {
      expect(normaliseSearch('  Asha   RAO ')).toBe('asha rao');
      expect(normaliseSearch('\tBen\n')).toBe('ben');
      expect(normaliseSearch('   ')).toBe('');
      expect(normaliseSearch(null)).toBe('');
      expect(normaliseSearch(undefined)).toBe('');
      expect(normaliseSearch(42)).toBe('42');
    });

    it('phone digits and phone-shaped terms', () => {
      expect(phoneDigits('+91 99999-00000')).toBe('919999900000');
      expect(phoneDigits(NIL)).toBe('');
      expect(phoneDigits(null)).toBe('');
      expect(isPhoneTerm('99999')).toBeTrue();
      expect(isPhoneTerm('+91 99999')).toBeTrue();
      expect(isPhoneTerm('(044) 7700-900')).toBeTrue();
      expect(isPhoneTerm('+ -')).toBeFalse();
      expect(isPhoneTerm('ben2')).toBeFalse();
      expect(isPhoneTerm('')).toBeFalse();
    });

    it('an empty term matches every row, a pending one included', () => {
      for (const r of [asha, ben, pending, unknown]) {
        expect(rowMatchesSearch(r, '')).toBeTrue();
        expect(rowMatchesSearch(r, '   ')).toBeTrue();
      }
    });

    it('name: case-insensitive, any part, spaces collapsed on both sides', () => {
      expect(rowMatchesSearch(asha, 'asha')).toBeTrue();
      expect(rowMatchesSearch(asha, 'RAO')).toBeTrue();
      expect(rowMatchesSearch(asha, 'ha r')).toBeTrue();
      expect(rowMatchesSearch(asha, '  asha   rao ')).toBeTrue();
      expect(rowMatchesSearch(asha, 'okafor')).toBeFalse();
      expect(rowMatchesSearch(ben, 'okafor')).toBeTrue();
    });

    it('email: case-insensitive, any part', () => {
      expect(rowMatchesSearch(asha, 'asha.rao@example')).toBeTrue();
      expect(rowMatchesSearch(asha, 'EXAMPLE.ORG')).toBeTrue();
      expect(rowMatchesSearch(ben, '@okafor.dev')).toBeTrue();
      expect(rowMatchesSearch(ben, 'example')).toBeFalse();
    });

    it('a term never matches across the end of the name and the start of the email', () => {
      expect(rowMatchesSearch(person('Kim', NIL, 'lee@x.org'), 'kimlee')).toBeFalse();
      expect(rowMatchesSearch(person('Kim', NIL, 'lee@x.org'), 'kim lee')).toBeFalse();
    });

    it('phone: digits anywhere, ignoring spaces, "+", "-" and brackets on either side', () => {
      expect(rowMatchesSearch(asha, '99999')).toBeTrue();
      expect(rowMatchesSearch(asha, '+91 99999')).toBeTrue();
      expect(rowMatchesSearch(asha, '919999900000')).toBeTrue();
      expect(rowMatchesSearch(asha, '99999-00000')).toBeTrue();
      expect(rowMatchesSearch(asha, '+91 9999900000')).toBeTrue();
      expect(rowMatchesSearch(ben, '7700900123')).toBeTrue();
      expect(rowMatchesSearch(ben, '(7700) 900')).toBeTrue();
      expect(rowMatchesSearch(ben, '+44-7700')).toBeTrue();
      expect(rowMatchesSearch(asha, '7700')).toBeFalse();
      expect(rowMatchesSearch(asha, '99998')).toBeFalse();
    });

    it('phone: a full number typed with its country code or a leading 0 finds the number saved without one', () => {
      const bare = person('Ravi', '9876543210', NIL);
      expect(rowMatchesSearch(bare, '+91 98765 43210')).toBeTrue();
      expect(rowMatchesSearch(bare, '098765 43210')).toBeTrue();
      expect(rowMatchesSearch(bare, '0091 98765 43210')).toBeTrue();
      expect(rowMatchesSearch(bare, '98765')).toBeTrue();
      // a number saved with its trunk "0" is the same number
      expect(rowMatchesSearch(person('Ravi', '09876543210', NIL), '+91 98765 43210')).toBeTrue();
      // a leading 0 on a part of a saved international number
      expect(rowMatchesSearch(asha, '099999')).toBeTrue();
      // negative controls: one digit off, and a short saved number never stands for a whole one
      expect(rowMatchesSearch(bare, '+91 98765 43211')).toBeFalse();
      expect(rowMatchesSearch(bare, '+91 8765 43210 1')).toBeFalse();
      expect(rowMatchesSearch(person('Short', '43210', NIL), '+91 98765 43210')).toBeFalse();
      expect(rowMatchesSearch(ben, '+91 98765 43210')).toBeFalse();
      // a term of zeros only keeps its zeros (typing "0" still narrows by phone)
      expect(rowMatchesSearch(person('Zed', '+91 9000000001', NIL), '0')).toBeTrue();
      expect(rowMatchesSearch(person('Zed', '+91 9111111111', NIL), '0')).toBeFalse();
      expect(filterRows([bare, asha, ben], '+91 98765 43210')).toEqual([bare]);
    });

    it('one Unicode form on both sides: composed and decomposed names, full-width digits', () => {
      const jose = person('Jos\u00e9 Silva', NIL, 'jos\u00e9@x.org');
      expect(rowMatchesSearch(jose, 'Jose\u0301')).toBeTrue();
      expect(rowMatchesSearch(person('Jose\u0301 Silva', NIL, NIL), 'jos\u00e9')).toBeTrue();
      // Devanagari with a nukta: the precomposed letter and the letter + nukta typed on another keyboard
      expect(rowMatchesSearch(person('\u0958\u0930\u0940\u092e', NIL, NIL), '\u0915\u093c\u0930\u0940\u092e')).toBeTrue();
      expect(rowMatchesSearch(person('\u0915\u093c\u0930\u0940\u092e', NIL, NIL), '\u0958\u0930\u0940\u092e')).toBeTrue();
      // full-width digits read as a phone number
      expect(normaliseSearch('\uff19\uff19\uff19\uff19\uff19')).toBe('99999');
      expect(isPhoneTerm(normaliseSearch('\uff0b\uff19\uff11 \uff19\uff19'))).toBeTrue();
      expect(rowMatchesSearch(asha, '\uff0b\uff19\uff11 \uff19\uff19\uff19\uff19\uff19')).toBeTrue();
      expect(rowMatchesSearch(asha, '\uff17\uff17\uff10\uff10')).toBeFalse();
      expect(normaliseSearch('\uff2a\uff4f\uff53\uff45')).toBe('jose');
    });

    it('a term with letters is not read as a phone number', () => {
      // "ben2" holds the digit 2, which Ben's phone has: no match, it is not a phone term and not in his name/email.
      expect(rowMatchesSearch(ben, 'ben2')).toBeFalse();
      // digits inside an email still match as text
      expect(rowMatchesSearch(person('Cara', NIL, 'cara2026@x.org'), '2026')).toBeTrue();
    });

    it('a person still being looked up matches no non-empty term', () => {
      expect(rowMatchesSearch(pending, 'a')).toBeFalse();
      expect(rowMatchesSearch(pending, '9')).toBeFalse();
    });

    it('the placeholders of a person found nowhere ("Unknown", "—") are not matched', () => {
      expect(rowMatchesSearch(unknown, 'no')).toBeFalse();
      expect(rowMatchesSearch(unknown, 'unknown')).toBeFalse();
      expect(rowMatchesSearch(unknown, NIL)).toBeFalse();
      expect(rowMatchesSearch(person('Dev', NIL, NIL), 'dev')).toBeTrue();
      expect(rowMatchesSearch(person('Dev', NIL, NIL), '9')).toBeFalse();
    });

    it('filters in order; an empty term gives the same array back', () => {
      const rows = [asha, pending, ben, unknown];
      expect(filterRows(rows, '')).toBe(rows);
      expect(filterRows(rows, ' ')).toBe(rows);
      expect(filterRows(rows, 'a')).toEqual([asha, ben]);
      expect(filterRows(rows, '9')).toEqual([asha, ben]);
      expect(filterRows(rows, '+91')).toEqual([asha]);
      expect(filterRows(rows, 'zzz')).toEqual([]);
      expect(filterRows([], 'a')).toEqual([]);
    });

    it('a row matches again once its person lands (a new row object, so no stale match is kept)', () => {
      expect(filterRows([pending], 'asha')).toEqual([]);
      const landed = { ...pending, ...asha };
      expect(filterRows([landed], 'asha')).toEqual([landed]);
    });

    it('a search is not final while someone is still being looked up (pending + no match says "still loading")', () => {
      // the pending + no-match combination: nothing matches yet, and the result can still change
      expect(filterRows([pending, asha], 'okafor')).toEqual([]);
      expect(searchAwaitingPeople([pending, asha], 'okafor')).toBeTrue();
      // matches exist, but more may come
      expect(searchAwaitingPeople([pending, asha], 'asha')).toBeTrue();
      // everyone loaded: final, a no-match is a real no-match
      expect(filterRows([asha, ben, unknown], 'zzz')).toEqual([]);
      expect(searchAwaitingPeople([asha, ben, unknown], 'zzz')).toBeFalse();
      // no search: never waiting, pending rows or not
      expect(searchAwaitingPeople([pending, asha], '')).toBeFalse();
      expect(searchAwaitingPeople([pending], '   ')).toBeFalse();
      expect(searchAwaitingPeople([], 'a')).toBeFalse();
    });

    it('works on the rows the screen builds', () => {
      const people = new Map<string, any>([['p1', { name: 'Asha Rao', countrycode: '+91', phonenumber: '9999900000', email: 'asha@x.org' }]]);
      const rows = liveViewRows([
        { key: 'k1', docId: 'd1', profileid: 'p1', mainIndex: 0, subIndex: 0, mainId: 'm', subId: 's1', mainName: 'M', subName: 'S1', completedMs: 2 },
        { key: 'k2', docId: 'd2', profileid: 'p2', mainIndex: 0, subIndex: 0, mainId: 'm', subId: 's1', mainName: 'M', subName: 'S1', completedMs: 1 },
      ], people);
      expect(rows[0].phone).toBe('+91 9999900000');
      expect(filterRows(rows, '+91 99999').map(r => r.key)).toEqual(['k1']);
      expect(filterRows(rows, 'ASHA@').map(r => r.key)).toEqual(['k1']);
      expect(rows[1].personPending).toBeTrue();
      expect(filterRows(rows, '').map(r => r.key)).toEqual(['k1', 'k2']);
    });
  });

  describe('pages', () => {
    const n = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

    it('20 rows a page', () => {
      expect(PAGE_SIZE).toBe(20);
    });

    it('page count: at least 1', () => {
      expect(pageCountFor(0)).toBe(1);
      expect(pageCountFor(1)).toBe(1);
      expect(pageCountFor(20)).toBe(1);
      expect(pageCountFor(21)).toBe(2);
      expect(pageCountFor(25)).toBe(2);
      expect(pageCountFor(41)).toBe(3);
      expect(pageCountFor(-3)).toBe(1);
      expect(pageCountFor(NaN)).toBe(1);
      expect(pageCountFor(5, 2)).toBe(3);
    });

    it('clamps a page into range', () => {
      expect(clampPage(1, 25)).toBe(1);
      expect(clampPage(2, 25)).toBe(2);
      expect(clampPage(3, 25)).toBe(2);
      expect(clampPage(99, 0)).toBe(1);
      expect(clampPage(0, 25)).toBe(1);
      expect(clampPage(-4, 25)).toBe(1);
      expect(clampPage(NaN, 25)).toBe(1);
      expect(clampPage('2', 25)).toBe(2);
      expect(clampPage(1.9, 25)).toBe(1);
    });

    it('25 rows: 20 then 5', () => {
      const rows = n(25);
      const one = pageSlice(rows, 1);
      expect(one.pageRows).toEqual(n(20));
      expect(one).toEqual(jasmine.objectContaining({ page: 1, pageCount: 2, from: 1, to: 20, total: 25 }));
      const two = pageSlice(rows, 2);
      expect(two.pageRows).toEqual([21, 22, 23, 24, 25]);
      expect(two).toEqual(jasmine.objectContaining({ page: 2, pageCount: 2, from: 21, to: 25, total: 25 }));
    });

    it('a page past the end shows the last page (the list shrank)', () => {
      const s = pageSlice(n(41), 7);
      expect(s.page).toBe(3);
      expect(s.pageRows).toEqual([41]);
      expect(s.from).toBe(41);
      expect(s.to).toBe(41);
      const shrunk = pageSlice(n(20), 2);
      expect(shrunk.page).toBe(1);
      expect(shrunk.pageRows.length).toBe(20);
    });

    it('exactly one full page, and an empty list', () => {
      expect(pageSlice(n(20), 1)).toEqual(jasmine.objectContaining({ page: 1, pageCount: 1, from: 1, to: 20, total: 20 }));
      expect(pageSlice([], 1)).toEqual({ pageRows: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
      expect(pageSlice([], 4).page).toBe(1);
    });

    it('a page never shares the source array', () => {
      const rows = n(3);
      const s = pageSlice(rows, 1);
      expect(s.pageRows).toEqual(rows);
      expect(s.pageRows).not.toBe(rows);
    });

    it('labels', () => {
      expect(pageLabel(1, 2)).toBe('Page 1 of 2');
      expect(pageLabel(12, 1234)).toBe('Page 12 of 1,234');
      expect(rangeLabel(1, 20, 25)).toBe('Showing 1\u201320 of 25');
      expect(rangeLabel(21, 25, 25)).toBe('Showing 21\u201325 of 25');
      expect(rangeLabel(1981, 2000, 2345)).toBe('Showing 1,981\u20132,000 of 2,345');
      expect(matchesLabel(3, '')).toBe('');
      expect(matchesLabel(0, 'zz')).toBe('No matches');
      expect(matchesLabel(1, 'a')).toBe('1 match');
      expect(matchesLabel(1234, 'a')).toBe('1,234 matches');
    });
  });

  describe('journey and customer status', () => {
    const names = new Map([['jA', 'Breakthrough'], ['jB', 'Launch Your Legacy']]);
    const done = (key: string, profileid: string) =>
      ({ key, docId: 'd-' + key, profileid, mainIndex: 0, subIndex: 0, mainId: 'm', subId: 's', mainName: 'M', subName: 'S', completedMs: null }) as CompletionRow;

    it('journey names by doc id, blanks left out, the first doc wins', () => {
      const idx = journeyNameIndex([
        { id: 'jA', data: { journey: ' Breakthrough ' } },
        { id: 'jB', data: { journey: '' } },
        { id: 'jC', data: { journeyname: 'Only journeyname' } },
        { id: ' ', data: { journey: 'No id' } },
        { id: 'jA', data: { journey: 'Second copy' } },
        { id: 'jD', data: null },
      ]);
      expect([...idx.entries()]).toEqual([['jA', 'Breakthrough']]);
      expect(journeyNameIndex(null).size).toBe(0);
    });

    it('journey: the active journey by name; "—" without one, or for an id with no name (never the raw id)', () => {
      expect(journeyLabel({ activejourney: 'jA' }, names)).toBe('Breakthrough');
      expect(journeyLabel({ activejourney: ' jB ' }, names)).toBe('Launch Your Legacy');
      expect(journeyLabel({ activejourney: 'jZ' }, names)).toBe(NIL);
      expect(journeyLabel({ activejourney: '' }, names)).toBe(NIL);
      expect(journeyLabel({}, names)).toBe(NIL);
      expect(journeyLabel(null, names)).toBe(NIL);
      // names not read (or the read failed): still never the id
      expect(journeyLabel({ activejourney: 'jA' }, null)).toBe(NIL);
      expect(journeyLabel({ activejourney: 'jA' }, new Map())).toBe(NIL);
    });

    it('customer status: title case word by word, spaces collapsed; "—" when empty', () => {
      expect(customerStatusLabel({ customerstatus: 'active' })).toBe('Active');
      expect(customerStatusLabel({ customerstatus: 'non active' })).toBe('Non Active');
      expect(customerStatusLabel({ customerstatus: ' Non  Active ' })).toBe('Non Active');
      expect(customerStatusLabel({ customerstatus: 'discontinued' })).toBe('Discontinued');
      expect(customerStatusLabel({ customerstatus: 'BANNED' })).toBe('Banned');
      expect(customerStatusLabel({ customerstatus: 'late' })).toBe('Late');
      expect(customerStatusLabel({ customerstatus: '' })).toBe(NIL);
      expect(customerStatusLabel({ customerstatus: '   ' })).toBe(NIL);
      expect(customerStatusLabel({})).toBe(NIL);
      expect(customerStatusLabel(null)).toBe(NIL);
    });

    it('still a new user: a new_user_data doc not moved to existing (the dashboard rule, strict true)', () => {
      expect(isStillNewUser({ name: 'N' })).toBeTrue();
      expect(isStillNewUser({ movedtoexist: false })).toBeTrue();
      expect(isStillNewUser({ movedtoexist: 'true' })).toBeTrue();
      expect(isStillNewUser({ movedtoexist: true })).toBeFalse();
      expect(isStillNewUser(null)).toBeFalse();
      expect(isStillNewUser(undefined)).toBeFalse();
    });

    it('the person shown: metadata first, else new_user_data; pending until the deciding answers are in', () => {
      const meta = { name: 'From metadata' };
      const nu = { name: 'From new_user_data' };
      expect(shownPerson(meta, nu)).toBe(meta);
      expect(shownPerson(meta, undefined)).toBe(meta);
      expect(shownPerson(meta, null)).toBe(meta);
      expect(shownPerson(null, nu)).toBe(nu);
      expect(shownPerson(null, null)).toBeNull();
      expect(shownPerson(null, undefined)).toBeUndefined();
      expect(shownPerson(undefined, nu)).toBeUndefined();
      expect(shownPerson(undefined, undefined)).toBeUndefined();
    });

    it('cells: pending, "New User", found nowhere, an existing participant', () => {
      const meta = { activejourney: 'jA', customerstatus: 'non active' };
      const pending = { newUser: false, journey: '', journeyPending: true, status: '', statusPending: true };
      expect(detailCells(undefined, false, names)).toEqual(pending);
      expect(detailCells(meta, undefined, names)).toEqual(pending);
      expect(detailCells(undefined, undefined, null)).toEqual(pending);
      expect(detailCells(meta, true, names))
        .toEqual({ newUser: true, journey: NEW_USER, journeyPending: false, status: NEW_USER, statusPending: false });
      expect(detailCells({ name: 'Only new_user_data' }, true, null)).toEqual(jasmine.objectContaining({ journey: 'New User', status: 'New User' }));
      expect(detailCells(null, false, names))
        .toEqual({ newUser: false, journey: NIL, journeyPending: false, status: NIL, statusPending: false });
      expect(detailCells(meta, false, names))
        .toEqual({ newUser: false, journey: 'Breakthrough', journeyPending: false, status: 'Non Active', statusPending: false });
      expect(detailCells({ customerstatus: 'active' }, false, names))
        .toEqual({ newUser: false, journey: NIL, journeyPending: false, status: 'Active', statusPending: false });
    });

    it('cells: the journey alone waits for the first journey read; a failed read (empty map) reads "—"', () => {
      const meta = { activejourney: 'jA', customerstatus: 'active' };
      expect(detailCells(meta, false, null))
        .toEqual({ newUser: false, journey: '', journeyPending: true, status: 'Active', statusPending: false });
      // no journey to name: nothing to wait for
      expect(detailCells({ customerstatus: 'active' }, false, null)).toEqual(jasmine.objectContaining({ journey: NIL, journeyPending: false }));
      expect(detailCells(meta, false, new Map())).toEqual(jasmine.objectContaining({ journey: NIL, journeyPending: false }));
      // a new user never waits for the names
      expect(detailCells(meta, true, null)).toEqual(jasmine.objectContaining({ journey: NEW_USER, journeyPending: false }));
    });

    it('view rows carry both cells; an id that cannot be looked up reads "—" (not pending); no details = pending', () => {
      const people = new Map<string, any>([
        ['still', { name: 'Still New', activejourney: 'jA', customerstatus: 'active' }],
        ['moved', { name: 'Moved', activejourney: 'jB', customerstatus: 'late' }],
        ['nowhere', null],
        ['waiting', { name: 'Waiting' }],
      ]);
      const details: PeopleDetails = {
        newUsers: new Map([['still', true], ['moved', false], ['nowhere', false]]),
        journeyNames: names,
      };
      const rows = [done('k1', 'still'), done('k2', 'moved'), done('k3', 'nowhere'), done('k4', 'waiting'), done('k5', 'x/y'), done('k6', 'unseen')];
      const view = liveViewRows(rows, people, undefined, details);
      expect(view.map(v => [v.journeyPending, v.journey, v.statusPending, v.status, v.newUser])).toEqual([
        [false, NEW_USER, false, NEW_USER, true],
        [false, 'Launch Your Legacy', false, 'Late', false],
        [false, NIL, false, NIL, false],
        [true, '', true, '', false],
        [false, NIL, false, NIL, false],
        [true, '', true, '', false],
      ]);
      // the name, phone and email are the person's as before (a still-new user keeps the metadata name)
      expect(view[0].name).toBe('Still New');
      expect(liveViewRows([done('k2', 'moved')], people).map(v => [v.journeyPending, v.statusPending])).toEqual([[true, true]]);
    });

    it('the view cache rebuilds a row when its new-user answer or the journey names change, and only then', () => {
      const r = done('k', 'p');
      const people = new Map<string, any>([['p', { name: 'P', activejourney: 'jA', customerstatus: 'active' }]]);
      const newUsers = new Map<string, boolean>();
      const cache: ViewRowCache = new Map();
      const one = liveViewRows([r], people, cache, { newUsers, journeyNames: null });
      expect([one[0].statusPending, one[0].journeyPending]).toEqual([true, true]);
      expect(liveViewRows([r], people, cache, { newUsers, journeyNames: null })[0]).toBe(one[0]);
      newUsers.set('p', false);
      const two = liveViewRows([r], people, cache, { newUsers, journeyNames: null });
      expect(two[0]).not.toBe(one[0]);
      expect([two[0].status, two[0].journeyPending]).toEqual(['Active', true]);
      const three = liveViewRows([r], people, cache, { newUsers, journeyNames: names });
      expect(three[0]).not.toBe(two[0]);
      expect(three[0].journey).toBe('Breakthrough');
      expect(liveViewRows([r], people, cache, { newUsers, journeyNames: names })[0]).toBe(three[0]);
      newUsers.set('p', true);
      expect(liveViewRows([r], people, cache, { newUsers, journeyNames: names })[0].journey).toBe(NEW_USER);
    });

    it('the search still reads name, phone and email only (not the journey or the status)', () => {
      const people = new Map<string, any>([['p', { name: 'Asha', email: 'a@x.org', activejourney: 'jA', customerstatus: 'banned' }]]);
      const view = liveViewRows([done('k', 'p')], people, undefined, { newUsers: new Map([['p', false]]), journeyNames: names });
      expect([view[0].journey, view[0].status]).toEqual(['Breakthrough', 'Banned']);
      expect(filterRows(view, 'breakthrough')).toEqual([]);
      expect(filterRows(view, 'banned')).toEqual([]);
      expect(filterRows(view, 'asha').length).toBe(1);
      const fresh = liveViewRows([done('k', 'p')], people, undefined, { newUsers: new Map([['p', true]]), journeyNames: names });
      expect(filterRows(fresh, 'new user')).toEqual([]);
    });
  });
});
