/**
 * At a glance additions (2026-11-17): the pure rules behind the six cards added to the workshop
 * dashboard's At a glance sheet — the workshop timeline strip, Completed, Joined recently, Needs
 * attention (Started but stuck / Inactive for 3+ days) and Top tags.
 *
 * Same contract as workshop-dashboard.engine.ts: NO Angular, NO Firestore, NO DOM. Every function takes
 * its inputs, including the clock (`nowMs`), as arguments and returns plain values, so the windows and
 * the day arithmetic can be pinned in workshop-dashboard.glance.unit.spec.ts with a frozen "now".
 *
 * Everything here reads data the dashboard already holds (the enrolled docs, the participant workshop
 * docs, the progress list, the cached tag names). Nothing is written anywhere.
 *
 * Calendar days are the viewer's LOCAL days: both ends are flattened to local midnight and the gap is
 * rounded, so a DST change (a 23- or 25-hour day) never shifts a count by one — the rule
 * daysRemaining() in the engine already uses.
 */
import { toMillis } from './workshop-dashboard.engine';

export const GLANCE_DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// =================================================================================================
// Day helpers
// =================================================================================================

/** Local midnight of the day `ms` falls on. */
export function localDayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole local calendar days from `fromMs`'s day to `toMs`'s day (negative when `toMs` is earlier). */
export function calendarDaysBetween(fromMs: number, toMs: number): number {
  return Math.round((localDayStart(toMs) - localDayStart(fromMs)) / GLANCE_DAY_MS);
}

/** "05 Nov". */
export function shortDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

/** "Mon 20 Nov". */
export function weekdayDay(ms: number): string {
  return `${WEEKDAYS[new Date(ms).getDay()]} ${shortDay(ms)}`;
}

/** "1 day" / "24 days". */
export function daysWord(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** First doc per person, in snapshot order — the doc the side panel, the cards and the export read. */
export function firstDocPerPerson<T extends { profileid?: any }>(docs: T[] | null | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const d of docs || []) {
    const id = d?.profileid;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(d);
  }
  return out;
}

// =================================================================================================
// 1. Workshop timeline
// =================================================================================================

export type GlanceTimelineKind = 'live' | 'soon' | 'done' | 'ever';

export interface GlanceTimeline {
  kind: GlanceTimelineKind;
  /** "Day 12", "Starts in 3 days", "Ended 4 days ago", "8-day journey". */
  title: string;
  /** The small "of 24" after a running workshop's day; '' otherwise. */
  titleOf: string;
  sub: string;
  /** Running / Upcoming / Ended / Evergreen. */
  pill: string;
  /** How much of the track is filled, 0..100 (also where the Today marker sits on a running workshop). */
  pct: number;
  startLabel: string;
  endLabel: string;
}

export interface GlanceTimelineInput {
  evergreen: boolean;
  /** The journey length an evergreen workshop is configured with (0 = not configured). */
  evergreenDays: number;
  /** The workshop's start and end — the same two values the dashboard header prints. */
  start: any;
  end: any;
}

/**
 * The strip at the top of At a glance.
 *
 *  - Evergreen: "<N>-day journey" (everyone starts on their own day, so there is no shared track).
 *    Hidden (null) when N is 0.
 *  - Otherwise both dates must read as dates and the end day must not be before the start day, or the
 *    strip is hidden (null).
 *  - Upcoming until the start MOMENT has passed, so a workshop starting later today reads "Starts today".
 *    From then on, calendar days decide: running through the whole end day ("Ends today" on it), ended
 *    from the day after.
 *  - Lengths and day numbers count both the start and the end day: 05 Nov – 28 Nov is 24 days, and on
 *    16 Nov it is Day 12 of 24 with 12 days left after today.
 */
export function workshopTimeline(w: GlanceTimelineInput, nowMs: number): GlanceTimeline | null {
  if (w.evergreen) {
    const n = Number(w.evergreenDays) || 0;
    if (n <= 0) return null;
    return {
      kind: 'ever', title: `${n}-day journey`, titleOf: '',
      sub: 'Evergreen · each participant starts on their own day', pill: 'Evergreen',
      pct: 0, startLabel: '', endLabel: '',
    };
  }

  const s = toMillis(w.start);
  const e = toMillis(w.end);
  if (s === null || e === null || !Number.isFinite(s) || !Number.isFinite(e)) return null;
  const total = calendarDaysBetween(s, e) + 1;
  if (total < 1) return null;   // ends before it starts: nothing sensible to draw

  if (nowMs < s) {
    const until = Math.max(0, calendarDaysBetween(nowMs, s));
    return {
      kind: 'soon',
      title: until === 0 ? 'Starts today' : until === 1 ? 'Starts tomorrow' : `Starts in ${until} days`,
      titleOf: '',
      sub: `${weekdayDay(s)} · ${daysWord(total)} long`,
      pill: 'Upcoming', pct: 0,
      startLabel: `Starts ${shortDay(s)}`, endLabel: `Ends ${shortDay(e)}`,
    };
  }

  const day = calendarDaysBetween(s, nowMs) + 1;
  if (day <= total) {
    const left = total - day;
    return {
      kind: 'live', title: `Day ${day}`, titleOf: `of ${total}`,
      sub: left === 0 ? 'Ends today' : `${daysWord(left)} left`,
      pill: 'Running', pct: Math.round((day / total) * 1000) / 10,
      startLabel: `Starts ${shortDay(s)}`, endLabel: `Ends ${shortDay(e)}`,
    };
  }

  const ago = calendarDaysBetween(e, nowMs);
  return {
    kind: 'done',
    title: ago === 1 ? 'Ended yesterday' : `Ended ${ago} days ago`,
    titleOf: '',
    sub: `Ran ${daysWord(total)} · ${shortDay(s)} – ${shortDay(e)}`,
    pill: 'Ended', pct: 100,
    startLabel: `Started ${shortDay(s)}`, endLabel: `Ended ${shortDay(e)}`,
  };
}

// =================================================================================================
// 3a. Joined recently
// =================================================================================================

export interface GlanceBar {
  /** People whose enrolment falls on this calendar day. */
  n: number;
  /** Bar height in % of the tallest day (at least 4 when n > 0, 0 when n is 0). */
  h: number;
  /** One of the last 7 calendar days (drawn darker). */
  wk: boolean;
  zero: boolean;
  /** Hover text, e.g. "12 Nov: 3 joined". */
  label: string;
}

export interface GlanceJoined {
  /** People who enrolled in the last 7×24h. */
  count: number;
  /** People who enrolled in the 7×24h before that. */
  prev: number;
  trend: 'up' | 'down' | 'flat';
  /** "▲ 9 vs the week before" / "▼ 2 vs the week before" / "• same as the week before". */
  delta: string;
  /** The `count` people, in snapshot order — what the card opens. */
  profileIds: string[];
  /** 14 calendar days, oldest first; the last one is today. */
  bars: GlanceBar[];
}

export function emptyGlanceJoined(): GlanceJoined {
  return { count: 0, prev: 0, trend: 'flat', delta: '• same as the week before', profileIds: [], bars: [] };
}

/**
 * Enrolled people (first enrolled doc per person) by their enrolment date.
 *
 *  - count: enrolment in (now − 7×24h, now]. A date a little in the future (a server clock ahead of
 *    this one) counts as now.
 *  - prev:  enrolment in (now − 14×24h, now − 7×24h].
 *  - bars:  14 LOCAL calendar days, oldest → today; a future date lands on today. The bars count
 *    calendar days while the figure counts 7×24h, so someone who joined 7 days ago later in the day
 *    than now is in the figure and in the lighter (older) half of the bars.
 *  - People without a readable enrolment date are left out of all three.
 */
export function joinedRecently(
  enrolled: { profileid?: any; enrollmentdate?: any }[] | null | undefined,
  nowMs: number,
): GlanceJoined {
  const weekAgo = nowMs - 7 * GLANCE_DAY_MS;
  const twoWeeksAgo = nowMs - 14 * GLANCE_DAY_MS;
  const counts = new Array<number>(14).fill(0);
  const profileIds: string[] = [];
  let prev = 0;

  for (const p of firstDocPerPerson(enrolled)) {
    const t = toMillis(p.enrollmentdate);
    if (t === null || !Number.isFinite(t)) continue;
    if (t > weekAgo) profileIds.push(p.profileid);
    else if (t > twoWeeksAgo) prev++;
    const back = Math.max(0, calendarDaysBetween(t, nowMs));
    if (back <= 13) counts[13 - back]++;
  }

  const count = profileIds.length;
  const diff = count - prev;
  const max = Math.max(...counts) || 1;
  const now = new Date(nowMs);
  const bars: GlanceBar[] = counts.map((n, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i)).getTime();
    return {
      n,
      h: n ? Math.max(4, Math.round((n / max) * 100)) : 0,
      wk: i >= 7,
      zero: n === 0,
      label: `${shortDay(day)}: ${n} joined`,
    };
  });

  return {
    count, prev, profileIds, bars,
    trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
    delta: diff > 0 ? `▲ ${diff} vs the week before`
      : diff < 0 ? `▼ ${-diff} vs the week before`
      : '• same as the week before',
  };
}

// =================================================================================================
// 3b. Needs attention
// =================================================================================================

/**
 * The latest moment this person finished a step: the newest `completed` timestamp among the steps
 * (sub-challenges) on their participant workshop doc — the time Participant Data prints beside each
 * finished step. null when the doc has none.
 */
export function latestStepFinishedMs(participantWorkshopDoc: any): number | null {
  let best: number | null = null;
  const challenges = Array.isArray(participantWorkshopDoc?.challenges) ? participantWorkshopDoc.challenges : [];
  for (const ch of challenges) {
    const steps = Array.isArray(ch?.challenges) ? ch.challenges : [];
    for (const step of steps) {
      const t = toMillis(step?.completed);
      if (t !== null && Number.isFinite(t) && (best === null || t > best)) best = t;
    }
  }
  return best;
}

export interface GlanceAttention {
  /** Started, still at 0%. */
  stuck: string[];
  /** Started, 0 < progress < 100, and no step finished in the last 3×24h. */
  inactive: string[];
}

/**
 * Started but stuck and Inactive for 3+ days. The two lists never overlap.
 *
 *  - Started = the people Total Started counts: an enrolled doc with status 'enrolled' (once per person,
 *    their first such doc).
 *  - progress = the participant's progress as the progress table shows it (`progressByPerson`); someone
 *    started with no progress row yet reads 0%.
 *  - stuck:    progress is 0.
 *  - inactive: 0 < progress < 100 and the latest step finish (latestStepFinishedMs) is at least 3×24h
 *    ago. With no step finish on record, the time they started the workshop (`workshopStartedAt` on the
 *    enrolled doc) is used instead; with neither, they are left out.
 */
export function needsAttention(
  enrolled: { profileid?: any; status?: any; workshopStartedAt?: any }[] | null | undefined,
  progressByPerson: Map<string, number>,
  participantWorkshopDocs: Map<string, any>,
  nowMs: number,
): GlanceAttention {
  const stuck: string[] = [];
  const inactive: string[] = [];
  const started = firstDocPerPerson((enrolled || []).filter(e => e?.status === 'enrolled'));
  for (const e of started) {
    const id: string = e.profileid;
    const progress = Number(progressByPerson.get(id)) || 0;
    if (progress <= 0) { stuck.push(id); continue; }
    if (progress >= 100) continue;
    const last = latestStepFinishedMs(participantWorkshopDocs.get(id)) ?? toMillis(e.workshopStartedAt);
    if (last === null || !Number.isFinite(last)) continue;
    if (nowMs - last >= 3 * GLANCE_DAY_MS) inactive.push(id);
  }
  return { stuck, inactive };
}

// =================================================================================================
// 3c. Top tags
// =================================================================================================

export interface GlanceTopTag {
  name: string;
  /** People carrying the tag. */
  n: number;
  /** n over Total Enrolled, rounded to a whole percent. */
  pct: number;
  /** Bar width in % of the most-carried tag. */
  w: number;
}

/**
 * The most-carried tag names among enrolled people. `tagNamesPerPerson` holds one entry per person (their
 * first enrolled doc's tag names), so a person counts once per tag even if two tag ids share a name.
 * Ordered by people desc, then name A→Z. `pct` is against `totalEnrolled` (the Total Enrolled figure).
 */
export function topTags(tagNamesPerPerson: (string[] | null | undefined)[], totalEnrolled: number, limit = 5): GlanceTopTag[] {
  const counts = new Map<string, number>();
  for (const names of tagNamesPerPerson || []) {
    const mine = new Set((names || []).map(n => (n ?? '').toString().trim()).filter(Boolean));
    for (const n of mine) counts.set(n, (counts.get(n) || 0) + 1);
  }
  const rows = [...counts].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).slice(0, Math.max(0, limit));
  const max = rows.length ? rows[0][1] : 1;
  return rows.map(([name, n]) => ({
    name, n,
    pct: totalEnrolled > 0 ? Math.round((n / totalEnrolled) * 100) : 0,
    w: Math.round((n / max) * 100),
  }));
}

/** A stable key for a set of tag ids, so the names are read again only when the set changes. */
export function tagIdSetKey(docs: { tags?: any }[] | null | undefined): { ids: string[]; key: string } {
  const ids = [...new Set((docs || []).flatMap(d => (Array.isArray(d?.tags) ? d.tags : [])))]
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();
  return { ids, key: ids.join('\u0001') };
}
