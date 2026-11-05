// cohort-randomize.logic.unit.spec.ts — unit tests for the Big Cohorts randomize split and specialist spread.
// Every input is synthetic and nothing here touches a database.
import {
  canFillCohorts,
  diffCohortMembers,
  eventDayKeys,
  fillShortageMessage,
  isRandomizeCategory,
  pickSpecialists,
  pullShortageMessage,
  shuffleIds,
  splitByAttendance,
  splitIntoCohorts,
  spreadSpecialists,
} from './cohort-randomize.logic';

const people = (count: number, prefix = 'p'): string[] => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
const sizes = (groups: string[][]): number[] => groups.map(group => group.length);

describe('cohort-randomize.logic', () => {
  describe('isRandomizeCategory', () => {
    it('allows educational and operational cohorts', () => {
      expect(isRandomizeCategory('educational')).toBeTrue();
      expect(isRandomizeCategory('operational')).toBeTrue();
    });

    it('refuses studio, readiness and cohorts with no category', () => {
      expect(isRandomizeCategory('studio')).toBeFalse();
      expect(isRandomizeCategory('readiness')).toBeFalse();
      expect(isRandomizeCategory(undefined)).toBeFalse();
    });
  });

  describe('shuffleIds', () => {
    it('keeps every person exactly once', () => {
      expect([...shuffleIds(people(47), 7)].sort()).toEqual([...people(47)].sort());
    });

    it('gives the same order for the same seed, whatever the input order', () => {
      expect(shuffleIds(['a', 'b', 'c', 'd', 'e'], 3)).toEqual(shuffleIds(['e', 'd', 'c', 'b', 'a'], 3));
    });

    it('gives a different order for a different seed', () => {
      expect(shuffleIds(people(47), 1)).not.toEqual(shuffleIds(people(47), 2));
    });
  });

  describe('canFillCohorts', () => {
    it('allows an exact fit and refuses one person short', () => {
      expect(canFillCohorts(30, 3, 10)).toBeTrue();
      expect(canFillCohorts(29, 3, 10)).toBeFalse();
    });

    it('refuses no cohorts or no size', () => {
      expect(canFillCohorts(30, 0, 10)).toBeFalse();
      expect(canFillCohorts(30, 3, 0)).toBeFalse();
    });
  });

  describe('splitIntoCohorts', () => {
    it('spreads 2 extras from the first cohort: 11, 11, 10', () => {
      expect(sizes(splitIntoCohorts(people(32), 3, 10))).toEqual([11, 11, 10]);
    });

    it('spreads 7 extras across 4 cohorts: 12, 12, 12, 11', () => {
      expect(sizes(splitIntoCohorts(people(47), 4, 10))).toEqual([12, 12, 12, 11]);
    });

    it('wraps round when extras outnumber the cohorts: 4, 3', () => {
      expect(sizes(splitIntoCohorts(people(7), 2, 1))).toEqual([4, 3]);
    });

    it('places nobody twice and leaves nobody out', () => {
      const placed = splitIntoCohorts(people(47), 4, 10).flat();
      expect(placed.length).toBe(47);
      expect(new Set(placed).size).toBe(47);
    });
  });

  describe('spreadSpecialists', () => {
    const totals = (groups: ReturnType<typeof spreadSpecialists>): number[] =>
      groups.map(group => group.participantIds.length + group.specialistIds.length);

    it('gives 6 specialists to 11, 11, 10 as 2 each: 13, 13, 12', () => {
      const groups = spreadSpecialists(splitIntoCohorts(people(32), 3, 10), people(6, 's'));
      expect(totals(groups)).toEqual([13, 13, 12]);
      expect(groups.map(group => group.specialistIds.length)).toEqual([2, 2, 2]);
    });

    it('gives the 7th specialist to the smallest cohort: 13, 13, 13', () => {
      const groups = spreadSpecialists(splitIntoCohorts(people(32), 3, 10), people(7, 's'));
      expect(totals(groups)).toEqual([13, 13, 13]);
      expect(groups[2].specialistIds.length).toBe(3);
    });

    it('gives every group the same number when specialists are a whole number per group', () => {
      [[32, 3, 10], [47, 4, 10], [156, 26, 5], [31, 3, 10], [30, 3, 10]].forEach(([peopleCount, groupCount, size]) => {
        const groups = spreadSpecialists(splitIntoCohorts(people(peopleCount), groupCount, size), people(groupCount * 2, 's'));
        groups.forEach(group => expect(group.specialistIds.length).toBe(2));
      });
    });

    it('leaves participants unchanged with no specialists', () => {
      const groups = spreadSpecialists([['a'], ['b']], []);
      expect(groups).toEqual([
        { participantIds: ['a'], specialistIds: [] },
        { participantIds: ['b'], specialistIds: [] },
      ]);
    });

    it('returns nothing when there are no cohorts', () => {
      expect(spreadSpecialists([], ['s'])).toEqual([]);
    });
  });

  describe('splitByAttendance', () => {
    it('separates people with attendance marked from those without', () => {
      expect(splitByAttendance(['a', 'b', 'c'], new Set(['b', 'z']))).toEqual({ attended: ['b'], unmarked: ['a', 'c'] });
    });

    it('treats everyone as unmarked when nobody checked in that day', () => {
      expect(splitByAttendance(['a', 'b'], undefined)).toEqual({ attended: [], unmarked: ['a', 'b'] });
    });
  });

  describe('pickSpecialists', () => {
    it('picks people who are not participants first', () => {
      for (let seed = 0; seed < 20; seed++) {
        expect(pickSpecialists(['a', 'b', 'c', 'd'], ['a', 'b'], 2, seed).sort()).toEqual(['c', 'd']);
      }
    });

    it('uses participants only when it has to, and always the same number of them', () => {
      for (let seed = 0; seed < 20; seed++) {
        const picked = pickSpecialists(['a', 'b', 'c', 'd'], ['a', 'b'], 3, seed);
        expect(picked.length).toBe(3);
        expect(picked.filter(id => id === 'a' || id === 'b').length).toBe(1);
      }
    });
  });

  describe('diffCohortMembers', () => {
    it('splits an overwrite into added, kept and removed', () => {
      expect(diffCohortMembers(['a', 'b', 'c'], ['b', 'd'])).toEqual({ added: ['d'], kept: ['b'], removed: ['a', 'c'] });
    });

    it('adds everyone to an empty cohort', () => {
      expect(diffCohortMembers([], ['a'])).toEqual({ added: ['a'], kept: [], removed: [] });
    });
  });

  describe('fillShortageMessage', () => {
    it('says how many are needed, how many are short, and both fixes', () => {
      expect(fillShortageMessage(32, 3, 20)).toBe(
        "3 groups × 20 people needs 60 people, but only 32 are available, so you're 28 short. To fix this, lower the number to 10 or select 1 group.");
    });

    it('leaves out a fix that would not work', () => {
      expect(fillShortageMessage(2, 3, 5)).toBe(
        "3 groups × 5 people needs 15 people, but only 2 are available, so you're 13 short. To fix this, select fewer groups or change the attendance filter.");
    });
  });

  describe('pullShortageMessage', () => {
    it('explains where the missing specialists went', () => {
      expect(pullShortageMessage(3, 26, 60, 8, 52, 'did not attend on 28 Oct 2026')).toBe(
        '26 groups × 3 specialists needs 78, but only 52 are available. The specialist cohort has 60 people: 8 did not attend on 28 Oct 2026. To fix this, lower the number to 2 or pick another cohort.');
    });

    it('leaves out lowering the number when that would not work', () => {
      expect(pullShortageMessage(1, 26, 10, 0, 10, '')).toBe(
        '26 groups × 1 specialists needs 26, but only 10 are available. The specialist cohort has 10 people. To fix this, pick another cohort, select fewer groups or change the attendance filter.');
    });
  });

  describe('eventDayKeys', () => {
    it('lists every day of a finished event', () => {
      const days = eventDayKeys(new Date(2026, 9, 26, 9), new Date(2026, 9, 29, 18), new Date(2026, 10, 1));
      expect(days).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
    });

    it('stops at today for an event still running', () => {
      const days = eventDayKeys(new Date(2026, 9, 26), new Date(2026, 9, 29), new Date(2026, 9, 27, 12));
      expect(days).toEqual(['2026-10-26', '2026-10-27']);
    });

    it('is empty for an event that has not started', () => {
      expect(eventDayKeys(new Date(2026, 11, 1), new Date(2026, 11, 3), new Date(2026, 10, 1))).toEqual([]);
    });
  });
});
