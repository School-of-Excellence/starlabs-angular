// cohort-randomize.logic.ts — pure rules for the Big Cohorts "Randomize participants" dialog.
//
// No Angular or Firestore here, so the split and the specialist spread can be unit-tested on their own.
// The shuffle is seeded: the same seed and inputs give the same preview, and Reshuffle just changes the seed.

export interface RandomizeGroup {
  participantIds: string[];
  specialistIds: string[];
}

/** Only these cohort categories can be used as a source, a target or a specialist source. */
export function isRandomizeCategory(category: string | undefined): boolean {
  return category === 'educational' || category === 'operational';
}

/** Small seeded generator (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a sorted copy, so the result depends only on the seed and not on input order. */
export function shuffleIds(ids: string[], seed: number): string[] {
  const list = [...ids].sort();
  const random = seededRandom(seed);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** True when every cohort can get its full size from the people available. */
export function canFillCohorts(peopleCount: number, cohortCount: number, sizePerCohort: number): boolean {
  return cohortCount > 0 && sizePerCohort > 0 && cohortCount * sizePerCohort <= peopleCount;
}

/**
 * Fills each cohort to sizePerCohort, then spreads the extras one at a time from the first cohort.
 * 32 people, 3 cohorts of 10 gives 11, 11, 10. Callers check canFillCohorts first.
 */
export function splitIntoCohorts(ids: string[], cohortCount: number, sizePerCohort: number): string[][] {
  const groups: string[][] = Array.from({ length: cohortCount }, () => []);
  ids.forEach((id, index) => {
    const fullRounds = cohortCount * sizePerCohort;
    const groupIndex = index < fullRounds ? Math.floor(index / sizePerCohort) : (index - fullRounds) % cohortCount;
    groups[groupIndex].push(id);
  });
  return groups;
}

/**
 * Gives each specialist to the group with the fewest people so far (first group wins a tie).
 * 11, 11, 10 plus 6 specialists gives 13, 13, 12; plus 7 gives 13, 13, 13.
 */
export function spreadSpecialists(groupsOfIds: string[][], specialistIds: string[]): RandomizeGroup[] {
  const groups: RandomizeGroup[] = groupsOfIds.map(ids => ({ participantIds: [...ids], specialistIds: [] }));
  if (groups.length === 0) return groups;
  specialistIds.forEach(id => {
    let smallest = groups[0];
    groups.forEach(group => {
      const size = group.participantIds.length + group.specialistIds.length;
      if (size < smallest.participantIds.length + smallest.specialistIds.length) smallest = group;
    });
    smallest.specialistIds.push(id);
  });
  return groups;
}

/** Splits a cohort into people with attendance marked that day and people without. */
export function splitByAttendance(ids: string[], presentIds: Set<string> | undefined): { attended: string[]; unmarked: string[] } {
  return {
    attended: ids.filter(id => presentIds?.has(id)),
    unmarked: ids.filter(id => !presentIds?.has(id)),
  };
}

/** What overwriting a cohort does: who joins, who stays and who is removed. */
export function diffCohortMembers(currentIds: string[], nextIds: string[]): { added: string[]; kept: string[]; removed: string[] } {
  const current = new Set(currentIds);
  const next = new Set(nextIds);
  return {
    added: nextIds.filter(id => !current.has(id)),
    kept: nextIds.filter(id => current.has(id)),
    removed: currentIds.filter(id => !next.has(id)),
  };
}

const groupWord = (count: number): string => (count === 1 ? 'group' : 'groups');

/** Explains why the people available can't fill the selected groups, and how to fix it. */
export function fillShortageMessage(people: number, cohortCount: number, sizePerCohort: number): string {
  const needed = cohortCount * sizePerCohort;
  const fixes: string[] = [];
  const smallerSize = Math.floor(people / cohortCount);
  const fewerCohorts = Math.floor(people / sizePerCohort);
  if (smallerSize >= 1) fixes.push(`lower the number to ${smallerSize}`);
  if (fewerCohorts >= 1) fixes.push(`select ${fewerCohorts} ${groupWord(fewerCohorts)}`);
  const fix = fixes.length ? ` To fix this, ${fixes.join(' or ')}.` : ' To fix this, select fewer groups or change the attendance filter.';
  return `${cohortCount} ${groupWord(cohortCount)} × ${sizePerCohort} people needs ${needed} people, but only ${people} ${people === 1 ? 'is' : 'are'} available, so you're ${needed - people} short.${fix}`;
}

/**
 * Specialists are placed first, so anyone picked here leaves the participant shuffle. People who aren't also
 * participants are picked before those who are, so the participant count doesn't change on each Reshuffle.
 */
export function pickSpecialists(availableIds: string[], participantIds: string[], count: number, seed: number): string[] {
  const participants = new Set(participantIds);
  const shuffled = shuffleIds(availableIds, seed);
  return [...shuffled.filter(id => !participants.has(id)), ...shuffled.filter(id => participants.has(id))].slice(0, count);
}

/** Explains where the specialists went when fewer are available than were asked for. */
export function pullShortageMessage(
  perGroup: number,
  groupCount: number,
  poolCount: number,
  outsideFilter: number,
  available: number,
  outsideFilterText: string,
): string {
  const needed = perGroup * groupCount;
  const why = outsideFilter > 0 ? `: ${outsideFilter} ${outsideFilterText}` : '';
  const lowerTo = Math.floor(available / groupCount);
  const fix = lowerTo >= 1 ? `lower the number to ${lowerTo} or pick another cohort` : 'pick another cohort, select fewer groups or change the attendance filter';
  return `${groupCount} ${groupWord(groupCount)} × ${perGroup} specialists needs ${needed}, but only ${available} are available. The specialist cohort has ${poolCount} people${why}. To fix this, ${fix}.`;
}

/** Local yyyy-mm-dd key, the same day key the live event dashboard uses for attendance. */
export function toDayKey(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

/** Each day of an event from start to end, stopping at today. */
export function eventDayKeys(start: Date, end: Date, today: Date = new Date()): string[] {
  const days: string[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const lastDay = new Date(Math.min(end.getTime(), today.getTime()));
  while (current <= lastDay) {
    days.push(toDayKey(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}
