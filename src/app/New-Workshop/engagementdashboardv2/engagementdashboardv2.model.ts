/**
 * Engagement dashboard v2 — pure data shaping, unit-tested without Firestore (operator 2026-11-02).
 *
 * Population: `participant metadata` docs whose customerstatus is 'active' or 'non active'. The WHOLE
 * dashboard counts only these people.
 * Journey: activejourney when it is set, else lastcompletedjourney, else "No journey".
 * Content engagement: a person is ENGAGED in a month when their profileid appears in `content analytics`
 * with a logdate inside that month; everyone else in the population is NOT engaged.
 * Source filters (operator 2026-11-03): From (`from`) and Platform (`platform_name`). Both are free text
 * whose case varies ('EiflixWorkshop' and 'eiflixworkshop' both occur), so values are grouped
 * case-insensitively. Within one filter the picks are OR; across the two they are AND (a view must match
 * both). Picking nothing in a filter means every value. Every figure counts only the views that pass.
 */

/** The customerstatus values read from `participant metadata`. */
export const ED2_STATUSES = ['active', 'non active'] as const;
export type Ed2PaidStatus = typeof ED2_STATUSES[number];
/**
 * 'free' = a `new_user_data` person whose movedtoexist is not true (operator 2026-11-03). Free users have
 * no journey; they get their own "Free users" row, always last. Someone also in the paid population is
 * counted once, as paid.
 */
export type Ed2Status = Ed2PaidStatus | 'free';
export type Ed2StatusFilter = 'all' | Ed2Status;
/** The journey bucket every free user sits in. */
export const ED2_FREE_JOURNEY = '__free__';
/** Bucket for people with neither an active nor a last completed journey. */
export const ED2_NO_JOURNEY = '__none__';

/** Views (from one source, or in total): count, `totaltimespend` summed (seconds), latest logdate. */
export interface Ed2Stat { sessions: number; seconds: number; lastSeen: Date | null; }
/** The two source fields on a view. */
export type Ed2Dim = 'from' | 'platform';
export const ED2_DIM_FIELD: Record<Ed2Dim, string> = { from: 'from', platform: 'platform_name' };
/** Picked keys per filter; an empty list = every value. */
export interface Ed2Filter { from: string[]; platform: string[]; }
/** One (from, platform) pair of a person's views. */
export interface Ed2Pair { from: string; platform: string; stat: Ed2Stat; }
/**
 * One month of views: per profile, per (from, platform) pair — kept as pairs so both filters can apply to
 * the same view. `labels` maps each key to how it is written in the data.
 */
export interface Ed2Activity { byProfile: Map<string, Map<string, Ed2Pair>>; labels: Record<Ed2Dim, Map<string, string>>; }
/** One value in a person's breakdown. */
export interface Ed2SourceRow extends Ed2Stat { key: string; label: string; }

export interface Ed2Person {
  profileid: string;
  name: string;
  email: string;
  /** For display: "+91 98400…". */
  phone: string;
  /** The parts the senders need: dial code without the plus, and the number as stored. */
  countryCode: string;
  phonenumber: string;
  status: Ed2Status;
  journeyId: string;
  /** Which field placed them in the journey. */
  journeyFrom: 'active' | 'last' | 'none';
  engaged: boolean;
  sessions: number;
  seconds: number;
  lastSeen: Date | null;
  /** The counted views by From value and by platform, most watched first. */
  byFrom: Ed2SourceRow[];
  byPlatform: Ed2SourceRow[];
}

export interface Ed2Split { total: number; engaged: number; }
export interface Ed2Totals { total: number; engaged: number; notEngaged: number; rate: number; active: Ed2Split; nonActive: Ed2Split; free: Ed2Split; }
export interface Ed2JourneyRow extends Ed2Totals { id: string; name: string; }
export type Ed2SortKey = 'name' | 'total' | 'engaged' | 'notEngaged' | 'rate';

/** The calendar month in LOCAL time: the 1st at 00:00:00.000 to the last day at 23:59:59.999. */
export function ed2MonthRange(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(year, month, 1, 0, 0, 0, 0), end: new Date(year, month + 1, 0, 23, 59, 59, 999) };
}

/**
 * The month cut into `parts` back-to-back slices, read in parallel. Each slice runs from its `from`
 * (inclusive) up to the next slice's `from` (exclusive), so inner cuts leave no gap or overlap even for
 * sub-millisecond timestamps. The last one runs to `end` inclusive; the reader takes that bound to the
 * last nanosecond of `end`'s second (see loadActivity).
 */
export function ed2Slices(start: Date, end: Date, parts: number): { from: Date; to: Date; last: boolean }[] {
  const n = Math.max(1, Math.floor(parts));
  const span = end.getTime() - start.getTime();
  const cuts = Array.from({ length: n }, (_, i) => new Date(start.getTime() + Math.floor((span * i) / n)));
  return cuts.map((from, i) => ({ from, to: i === n - 1 ? end : cuts[i + 1], last: i === n - 1 }));
}

/** A journey value may be a plain id or a document reference. */
function idOf(v: any): string {
  if (v && typeof v === 'object' && typeof v.id === 'string') return v.id.trim();
  return v === null || v === undefined ? '' : String(v).trim();
}

/** activejourney when set, else lastcompletedjourney, else no journey. */
export function ed2JourneyOf(meta: any): { id: string; from: 'active' | 'last' | 'none' } {
  const active = idOf(meta?.['activejourney']);
  if (active) return { id: active, from: 'active' };
  const last = idOf(meta?.['lastcompletedjourney']);
  if (last) return { id: last, from: 'last' };
  return { id: ED2_NO_JOURNEY, from: 'none' };
}

/** 'active' / 'non active' (any case / spacing), else null — outside the dashboard. */
export function ed2StatusOf(meta: any): Ed2PaidStatus | null {
  const s = String(meta?.['customerstatus'] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return (ED2_STATUSES as readonly string[]).includes(s) ? (s as Ed2PaidStatus) : null;
}

/**
 * A person's status in a PAST month, from their subscription dates (operator 2026-11-03). The current
 * month uses the live customerstatus instead.
 *
 * Why the dates are enough: the participant-metadata cloud function only sets 'active' when the person
 * has ONE live journey (its dates in subscriptionstart / subscriptionend) and 'non active' when they have
 * ONE completed journey (lastsubscriptionstart / lastsubscriptionend). So everyone on this dashboard has
 * a single subscription period, and it is their whole history.
 *   active      the period ran on at least one day of the month
 *   non active  the period ended before the month began
 *   notyet      the period began after the month ended — not a customer then, left out
 *   undated     no dates to place it — left out
 */
export type Ed2MonthStatus = Ed2PaidStatus | 'notyet' | 'undated';
export function ed2StatusInMonth(meta: any, month: { start: Date; end: Date }): Ed2MonthStatus {
  const s = ed2ToDate(meta?.['subscriptionstart']);
  const e = ed2ToDate(meta?.['subscriptionend']);
  const [from, to] = s || e ? [s, e] : [ed2ToDate(meta?.['lastsubscriptionstart']), ed2ToDate(meta?.['lastsubscriptionend'])];
  if (to && to < month.start) return 'non active';
  if (from && from > month.end) return 'notyet';
  if (from && to) return 'active';
  return 'undated';
}

/** A Firestore Timestamp, Date or date string -> Date, else null. */
export function ed2ToDate(v: any): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** The grouping key for a source value: trimmed, lower-case; '' when missing. */
export function ed2SourceKey(v: any): string {
  return v === null || v === undefined ? '' : String(v).trim().toLowerCase();
}

/**
 * How a source value reads on screen: as written in the data. A view with no value reads "Not set" for
 * From, and "Breakthroughs app" for Platform — views without platform_name come from the Breakthroughs app
 * (operator 2026-11-03).
 */
export function ed2SourceLabel(key: string, labels: Map<string, string>, dim: Ed2Dim = 'from'): string {
  if (key === '') return dim === 'platform' ? 'Breakthroughs app' : 'Not set';
  return labels.get(key) || key;
}

const blankStat = (): Ed2Stat => ({ sessions: 0, seconds: 0, lastSeen: null });
const addStat = (into: Ed2Stat, s: Ed2Stat) => {
  into.sessions += s.sessions;
  into.seconds += s.seconds;
  if (s.lastSeen && (!into.lastSeen || s.lastSeen > into.lastSeen)) into.lastSeen = s.lastSeen;
};

/** A value's label is its most common spelling in the month (ties: alphabetical), so it never flips with read order. */
function bestSpellings(spellings: Map<string, Map<string, number>>): Map<string, string> {
  const labels = new Map<string, string>();
  spellings.forEach((sp, key) => labels.set(key, [...sp.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]));
  return labels;
}

/** Fold one month of `content analytics` docs into per-profile activity, per (from, platform) pair. */
export function ed2Activity(logs: any[]): Ed2Activity {
  const byProfile = new Map<string, Map<string, Ed2Pair>>();
  const spellings: Record<Ed2Dim, Map<string, Map<string, number>>> = { from: new Map(), platform: new Map() };
  for (const log of logs) {
    const pid = String(log?.['profileid'] ?? '').trim();
    if (!pid) continue;
    const keys = {} as Record<Ed2Dim, string>;
    (['from', 'platform'] as Ed2Dim[]).forEach((dim) => {
      const raw = String(log?.[ED2_DIM_FIELD[dim]] ?? '').trim();
      const key = ed2SourceKey(raw);
      keys[dim] = key;
      if (!key) return;
      const sp = spellings[dim].get(key) ?? new Map<string, number>();
      sp.set(raw, (sp.get(raw) ?? 0) + 1);
      spellings[dim].set(key, sp);
    });
    const pairs = byProfile.get(pid) ?? new Map<string, Ed2Pair>();
    const pairKey = `${keys.from}\u0001${keys.platform}`;
    const pair = pairs.get(pairKey) ?? { from: keys.from, platform: keys.platform, stat: blankStat() };
    addStat(pair.stat, { sessions: 1, seconds: Number(log?.['totaltimespend']) || 0, lastSeen: ed2ToDate(log?.['logdate']) });
    pairs.set(pairKey, pair);
    byProfile.set(pid, pairs);
  }
  return { byProfile, labels: { from: bestSpellings(spellings.from), platform: bestSpellings(spellings.platform) } };
}

/** Filter options in menu order: alphabetical, with From's "Not set" last. Returns a new array. */
export function ed2SortOptions(opts: { key: string; label: string }[], dim: Ed2Dim = 'from'): { key: string; label: string }[] {
  const last = (o: { key: string }) => dim === 'from' && o.key === '';
  return [...opts].sort((a, b) => last(a) !== last(b) ? (last(a) ? 1 : -1) : a.label.localeCompare(b.label));
}

/** Every value of one source field seen in the month, as { key, label }, alphabetical with "Not set" last. */
export function ed2Options(activity: Ed2Activity, dim: Ed2Dim): { key: string; label: string }[] {
  const keys = new Set<string>();
  activity.byProfile.forEach((pairs) => pairs.forEach((p) => keys.add(p[dim])));
  return ed2SortOptions([...keys].map((key) => ({ key, label: ed2SourceLabel(key, activity.labels[dim], dim) })), dim);
}

/**
 * The population joined with the month's activity — one entry per profile (the first doc wins if a
 * profile appears twice). Docs outside active / non active are dropped here too, so a looser read can
 * never widen the dashboard. `filter` limits the views counted (see the header comment). With `month`
 * (a past month) the status comes from the subscription dates and people who cannot be placed in that
 * month are left out (see ed2StatusInMonth); without it, the live customerstatus is used.
 */
export function ed2People(metas: { id: string; data: any }[], activity: Ed2Activity, filter: Ed2Filter = { from: [], platform: [] },
  month?: { start: Date; end: Date }): Ed2Person[] {
  const build = personBuilder(activity, filter);
  const seen = new Set<string>();
  const out: Ed2Person[] = [];
  for (const { id, data } of metas) {
    const live = ed2StatusOf(data);
    if (!live) continue;
    const profileid = String(data?.['profileid'] ?? id ?? '').trim();
    if (!profileid || seen.has(profileid)) continue;
    seen.add(profileid);
    const placed = month ? ed2StatusInMonth(data, month) : live;
    if (placed !== 'active' && placed !== 'non active') continue;
    const journey = ed2JourneyOf(data);
    out.push(build(profileid, data, placed, journey.id, journey.from));
  }
  return out;
}

/** Every profileid in the paid population (active / non active today), whatever the month. */
export function ed2PaidIds(metas: { id: string; data: any }[]): Set<string> {
  const ids = new Set<string>();
  for (const { id, data } of metas) {
    if (!ed2StatusOf(data)) continue;
    const profileid = String(data?.['profileid'] ?? id ?? '').trim();
    if (profileid) ids.add(profileid);
  }
  return ids;
}

/**
 * Free users: `new_user_data` docs (keyed by profileid) whose movedtoexist is not true, minus anyone in the
 * paid population. In a PAST month only people who had signed up by then count — `created` after the
 * month's end means not a user yet (left out, in `notYet`); no `created` date still counts.
 */
export function ed2FreeUsers(nuds: { id: string; data: any }[], activity: Ed2Activity, paidIds: Set<string>,
  filter: Ed2Filter = { from: [], platform: [] }, month?: { start: Date; end: Date }): { people: Ed2Person[]; notYet: number } {
  const build = personBuilder(activity, filter);
  const seen = new Set<string>();
  const people: Ed2Person[] = [];
  let notYet = 0;
  for (const { id, data } of nuds) {
    if (data?.['movedtoexist'] === true) continue;
    const profileid = String(id || data?.['profileid'] || '').trim();
    if (!profileid || seen.has(profileid) || paidIds.has(profileid)) continue;
    seen.add(profileid);
    const created = ed2ToDate(data?.['created']);
    if (month && created && created > month.end) { notYet++; continue; }
    people.push(build(profileid, data, 'free', ED2_FREE_JOURNEY, 'none'));
  }
  return { people, notYet };
}

/** One person's row: their details plus the month's views that pass the filter, summed and broken down. */
function personBuilder(activity: Ed2Activity, filter: Ed2Filter) {
  const onlyFrom = filter.from.length ? new Set(filter.from) : null;
  const onlyPlatform = filter.platform.length ? new Set(filter.platform) : null;
  const rows = (m: Map<string, Ed2Stat>, dim: Ed2Dim): Ed2SourceRow[] =>
    [...m.entries()].map(([key, st]) => ({ key, label: ed2SourceLabel(key, activity.labels[dim], dim), ...st }))
      .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
  return (profileid: string, data: any, status: Ed2Status, journeyId: string, journeyFrom: Ed2Person['journeyFrom']): Ed2Person => {
    const act = blankStat();
    const fromStats = new Map<string, Ed2Stat>();
    const platformStats = new Map<string, Ed2Stat>();
    activity.byProfile.get(profileid)?.forEach((p) => {
      if (onlyFrom && !onlyFrom.has(p.from)) return;
      if (onlyPlatform && !onlyPlatform.has(p.platform)) return;
      addStat(act, p.stat);
      addStat(fromStats.get(p.from) ?? fromStats.set(p.from, blankStat()).get(p.from)!, p.stat);
      addStat(platformStats.get(p.platform) ?? platformStats.set(p.platform, blankStat()).get(p.platform)!, p.stat);
    });
    const cc = String(data?.['countrycode'] ?? data?.['countryCode'] ?? '').trim();
    const num = String(data?.['phonenumber'] ?? '').trim();
    return {
      profileid,
      name: String(data?.['name'] ?? '').trim(),
      email: String(data?.['email'] ?? '').trim(),
      phone: num ? (cc ? `${cc.startsWith('+') ? cc : '+' + cc} ${num}` : num) : '',
      countryCode: cc.replace(/^\+/, ''),
      phonenumber: num,
      status,
      journeyId,
      journeyFrom,
      engaged: act.sessions > 0,
      sessions: act.sessions,
      seconds: act.seconds,
      lastSeen: act.lastSeen,
      byFrom: rows(fromStats, 'from'),
      byPlatform: rows(platformStats, 'platform'),
    };
  };
}

/** For a past month: how many of the population ed2People leaves out, and why (once per profile). */
export function ed2LeftOut(metas: { id: string; data: any }[], month: { start: Date; end: Date }): { notYet: number; undated: number } {
  const seen = new Set<string>();
  const out = { notYet: 0, undated: 0 };
  for (const { id, data } of metas) {
    if (!ed2StatusOf(data)) continue;
    const profileid = String(data?.['profileid'] ?? id ?? '').trim();
    if (!profileid || seen.has(profileid)) continue;
    seen.add(profileid);
    const placed = ed2StatusInMonth(data, month);
    if (placed === 'notyet') out.notYet++;
    else if (placed === 'undated') out.undated++;
  }
  return out;
}

export function ed2ByStatus(people: Ed2Person[], filter: Ed2StatusFilter): Ed2Person[] {
  return filter === 'all' ? people : people.filter((p) => p.status === filter);
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function ed2Totals(people: Ed2Person[]): Ed2Totals {
  const t: Ed2Totals = {
    total: 0, engaged: 0, notEngaged: 0, rate: 0,
    active: { total: 0, engaged: 0 }, nonActive: { total: 0, engaged: 0 }, free: { total: 0, engaged: 0 },
  };
  for (const p of people) {
    t.total++;
    if (p.engaged) t.engaged++;
    const s = p.status === 'active' ? t.active : p.status === 'free' ? t.free : t.nonActive;
    s.total++;
    if (p.engaged) s.engaged++;
  }
  t.notEngaged = t.total - t.engaged;
  t.rate = pct(t.engaged, t.total);
  return t;
}

/** Journey name, or the stored id when the journey is not in the journey list. */
export function ed2JourneyName(id: string, names: Map<string, string>): string {
  if (id === ED2_NO_JOURNEY) return 'No journey';
  if (id === ED2_FREE_JOURNEY) return 'Free users';
  return names.get(id) || id;
}

/** One row per journey with at least one person; "No journey" then "Free users" always sort last. */
export function ed2Journeys(people: Ed2Person[], names: Map<string, string>, sort: Ed2SortKey = 'total', dir: 'asc' | 'desc' = 'desc'): Ed2JourneyRow[] {
  const groups = new Map<string, Ed2Person[]>();
  for (const p of people) {
    const list = groups.get(p.journeyId) ?? [];
    list.push(p);
    groups.set(p.journeyId, list);
  }
  const rows: Ed2JourneyRow[] = [...groups.entries()].map(([id, list]) => ({ id, name: ed2JourneyName(id, names), ...ed2Totals(list) }));
  const sign = dir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    const tail = (id: string) => (id === ED2_FREE_JOURNEY ? 2 : id === ED2_NO_JOURNEY ? 1 : 0);
    if (tail(a.id) !== tail(b.id)) return tail(a.id) - tail(b.id);
    const by = sort === 'name' ? a.name.localeCompare(b.name) : (a[sort] as number) - (b[sort] as number);
    return sign * by || a.name.localeCompare(b.name);
  });
}

/**
 * The shape the shared senders read (CommunicationSendersService — the workshop dashboard's Email /
 * WhatsApp / Notification paths): { profileid, name, metadata } with the contact details in metadata.
 * Same mapping as the workshop Communication dialog.
 */
export function ed2Recipients(people: Ed2Person[]): { profileid: string; name: string; metadata: any }[] {
  return people.map((p) => ({
    profileid: p.profileid,
    name: p.name,
    metadata: { name: p.name, email: p.email, phonenumber: p.phonenumber, countryCode: p.countryCode, countrycode: p.countryCode },
  }));
}

/** Name, email or phone contains the text (case-insensitive). */
export function ed2Matches(p: Ed2Person, text: string): boolean {
  const q = String(text ?? '').trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.email, p.phone].some((v) => v.toLowerCase().includes(q));
}

/** 5400 -> "1h 30m", 3600 -> "1h", 600 -> "10m", 20 -> "< 1m", 0 -> "—". */
export function ed2Duration(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h && !m) return '< 1m';
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export function ed2StatusLabel(s: Ed2Status): string {
  return s === 'active' ? 'Active' : s === 'free' ? 'Free user' : 'Non active';
}

/** CSV of the panel's list (header + CRLF rows, quoted where needed). */
export function ed2Csv(people: Ed2Person[], names: Map<string, string>, fmtDate: (d: Date) => string): string {
  const q = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Name', 'Email', 'Phone', 'Status', 'Journey', 'Engaged', 'Sessions', 'Watch time', 'Last watched', 'Watched from', 'Watched on'];
  const rows = people.map((p) => [
    p.name, p.email, p.phone, ed2StatusLabel(p.status), ed2JourneyName(p.journeyId, names),
    p.engaged ? 'Yes' : 'No', p.sessions, ed2Duration(p.seconds), p.lastSeen ? fmtDate(p.lastSeen) : '',
    p.byFrom.map((f) => `${f.label} ${ed2Duration(f.seconds)}`).join('; '),
    p.byPlatform.map((f) => `${f.label} ${ed2Duration(f.seconds)}`).join('; '),
  ]);
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
