/**
 * Live Event Dashboard V3 Rules Engine (pure, dependency-free).
 *
 * The arithmetic and the decisions behind the Live Event Dashboard V3: who counts as a first timer,
 * how a participant's completion ratio is banded into the tiers on the ATC-completion bar, how the
 * journey matrix collapses grouped journeys into columns, the attendance-grid labels and percentages,
 * which day(s) a "today / overall / D3" chip actually scopes to, how a call outcome resolves between
 * the optimistic write and the live log, how a support ticket's status and resolution time are
 * derived, and every filter / sort / label rule the Participant Data table and the drill-down panel
 * run on.
 *
 * Extracted from LiveEventDashboardV3Component (1,941 lines) on 2026-09-10, following the pattern set
 * by delivery-dashboard.engine.ts and priority.engine.ts under ../../Journey Onboarding. The logic is
 * UNCHANGED — same comparison operators, same rounding, same strings, same quirks. Several oddities
 * (DEFECT notes below) were deliberately left intact and pinned by tests rather than fixed, because
 * this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs, NO DOM. Every function takes its inputs as arguments and
 *   returns a value, so the rules can be exercised offline instead of standing up a component that
 *   injects a Firestore, a Storage, an HttpClient, a MatDialog and a live-subscribing data service.
 * - As methods and getters on that component the rules were only reachable through a rendered
 *   template. An e2e case could assert that a tier chip read "75–99%" — it could not tell 0.75 from
 *   0.7499, so a shifted band boundary passed silently.
 * - These are product decisions, not implementation details. The five completion tiers, "Addressed
 *   replaces every tag column", "reviewed = submitted AND tagged", and the four call outcomes all
 *   change what an event operator does next. Changing one should turn a test red on purpose.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads Firestore, walks LiveEventDataService state, opens the drill-down panel,
 *   writes a call outcome, marks attendance, sends a communication or exports a file. Where a method
 *   mixed both, only the pure core moved and the component still does its own gathering — see
 *   computeTagGroups(), which still pulls the taxonomy and the day filter off the service and only
 *   asks the engine the question (which participant lands in which column?).
 * - ATC bucket derivation. getAtcBuckets()/bucketOf() partition participants by reading ATC state,
 *   which is out of bounds for this extraction, so those stayed on the component untouched. The
 *   engine only ever receives an already-computed bucket index or ratio as a plain number.
 *
 * Thresholds are exported as named constants, and `now` is an injectable parameter with a default
 * matching current behaviour, so a test can freeze the clock without rewriting a constant.
 */

// =================================================================================================
// Participants — first timer, completion ratio
// =================================================================================================

/**
 * First timer = has NOT consumed the event's excluded/hero product (lifted verbatim from
 * first-timers-dashboard). A participant with no `consumedproducts` at all is a first timer.
 */
export function isFirstTimer(consumedProducts: string[] | null | undefined, excludedProductId: string): boolean {
  const consumed: string[] = consumedProducts || [];
  return !consumed.includes(excludedProductId);
}

/**
 * Per-participant completion ratio = adjustments completed / total adjustments.
 *
 * null means "no adjustments on record" — those participants are EXCLUDED from every completion
 * tier (they belong to the ATC "none" bucket, not a tier) and render as "—" in the table.
 */
export function completionRatio(adjDone: number, adjTotal: number): number | null {
  if (!adjTotal) { return null; }
  return adjDone / adjTotal;
}

// =================================================================================================
// Completion tiers (the ATC-completion bar)
// =================================================================================================

export interface QuartileRow {
  cls: string;
  label: string;
  count: number;
  width: number;
  profileIds: string[];
}

/**
 * UNIQUE (non-cumulative) tiers — each measurable participant falls in exactly one band. `cls`
 * doubles as the band id the Participant Data table filters by, which is why the tiers are membership
 * sets rather than a single op+value: 25–49% is `0.25 <= r < 0.5`, and the table's own % column is
 * Math.round(ratio * 100), so a participant on 0.497 sits in the 25–49% tier but renders as "50%".
 */
export const QUARTILE_DEFS: { cls: string; label: string; test: (r: number) => boolean }[] = [
  { cls: 'q100', label: '100%', test: r => r >= 1 },
  { cls: 'q75', label: '75–99%', test: r => r >= 0.75 && r < 1 },
  { cls: 'q50', label: '50–74%', test: r => r >= 0.5 && r < 0.75 },
  { cls: 'q25', label: '25–49%', test: r => r >= 0.25 && r < 0.5 },
  { cls: 'q0', label: 'Below 25%', test: r => r < 0.25 }
];

/**
 * Band every measurable participant into a tier.
 *
 * `total` is the WHOLE registered universe, including participants whose ratio is null — see the
 * DEFECT note in the spec: the widths therefore never sum to 100 when anyone has no ATC on record.
 */
export function completionQuartiles(
  entries: { profileId: string; ratio: number }[],
  total: number,
  defs = QUARTILE_DEFS
): QuartileRow[] {
  return defs.map(d => {
    const list = entries.filter(x => d.test(x.ratio));
    return {
      cls: d.cls,
      label: d.label,
      count: list.length,
      width: total ? Math.round((list.length / total) * 100) : 0,
      profileIds: list.map(x => x.profileId)
    };
  });
}

// =================================================================================================
// Journey matrix
// =================================================================================================

export interface JourneyColumn {
  key: string;
  label: string;
  journeyIds: string[];
  isGroup: boolean;
}

/**
 * Matrix columns: grouped journeys collapse into one aggregated column (label = the group name);
 * ungrouped journeys stay journey-wise. In edit mode every journey shows individually so it can be
 * ticked and grouped. Groups render before singles, then both are sorted by total headcount desc.
 */
export function journeyColumns(
  journeys: { journeyId: string; count: number }[],
  groupOf: { [journeyId: string]: string },
  labelFor: (journeyId: string) => string,
  editMode = false
): JourneyColumn[] {
  if (editMode) {
    return journeys.map(j => ({ key: j.journeyId, label: labelFor(j.journeyId), journeyIds: [j.journeyId], isGroup: false }));
  }
  const countById: { [id: string]: number } = {};
  journeys.forEach(j => { countById[j.journeyId] = j.count; });
  const groups = new Map<string, JourneyColumn>();
  const singles: JourneyColumn[] = [];
  journeys.forEach(j => {
    const g = (groupOf[j.journeyId] || '').trim();
    if (g) {
      const key = 'grp:' + g;
      const e = groups.get(key) || { key, label: g, journeyIds: [], isGroup: true };
      e.journeyIds.push(j.journeyId);
      groups.set(key, e);
    } else {
      singles.push({ key: j.journeyId, label: labelFor(j.journeyId), journeyIds: [j.journeyId], isGroup: false });
    }
  });
  const total = (col: { journeyIds: string[] }) => col.journeyIds.reduce((s, id) => s + (countById[id] || 0), 0);
  return [...groups.values(), ...singles].sort((a, b) => total(b) - total(a));
}

/** Number of journey badge colour classes in the prototype palette (jc0..jc5). */
export const JOURNEY_PALETTE_SIZE = 6;

/**
 * Colour class per journey, cycling the palette by the journey's position in the counts list.
 *
 * DEFECT (pinned): an unknown journey id yields findIndex === -1, which is coerced to 0 — so it takes
 * the SAME colour as the first real journey instead of a distinct or neutral one.
 */
export function journeyBadgeClass(
  journeyId: string,
  journeyIds: string[],
  paletteSize = JOURNEY_PALETTE_SIZE
): string {
  const idx = journeyIds.indexOf(journeyId);
  return 'jc' + ((idx >= 0 ? idx : 0) % paletteSize);
}

// =================================================================================================
// Attendance grid
// =================================================================================================

/** 'yyyy-mm-dd' → 'Mon'. Parsed as LOCAL midnight (not UTC) so the weekday never shifts a day. */
export function weekdayLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
}

/** 'yyyy-mm-dd' → 'May 18'. Same local-midnight parse as weekdayLabel. */
export function shortDateLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The card's own heading: 'Today' for the live day, otherwise 'Day N'. */
export function dayLabel(day: { day: number; isToday: boolean }): string {
  return day.isToday ? 'Today' : 'Day ' + day.day;
}

/**
 * '<first> – <last> · Day N of M', where N counts every non-future day (min 1).
 * `fmt` is injectable so a test can pin the "Day N of M" arithmetic without depending on a locale.
 */
export function attendanceRangeLabel(
  days: { date: string; isFuture: boolean }[],
  fmt: (iso: string) => string = shortDateLabel
): string {
  if (!days.length) { return ''; }
  const currentDay = days.filter(d => !d.isFuture).length;
  return `${fmt(days[0].date)} – ${fmt(days[days.length - 1].date)} · Day ${Math.max(1, currentDay)} of ${days.length}`;
}

/**
 * The percentage drawn on a day card's bar.
 *
 * DEFECT (pinned): despite the name this is the VIDEO-ASK ratio (submissions / attendance), not an
 * attendance ratio, and it is not clamped — see the spec.
 */
export function todayBarPct(videoAskCount: number | null, dayCount: number): number {
  if (videoAskCount === null || !dayCount) { return 0; }
  return Math.round((videoAskCount / dayCount) * 100);
}

/** Video asks submitted on a day, narrowed to the registered universe. */
export function videoAskIdsForDay(submittedIds: string[], universe: ReadonlySet<string> | string[]): string[] {
  const uni = universe instanceof Set ? universe : new Set(universe);
  return submittedIds.filter(id => uni.has(id));
}

/** Present that day (and registered) but did NOT submit a video ask. */
export function missingRecordingIds(
  presentIds: string[],
  submittedIds: string[],
  universe: ReadonlySet<string> | string[]
): string[] {
  const uni = universe instanceof Set ? universe : new Set(universe);
  const submitted = new Set(submittedIds);
  return presentIds.filter(id => uni.has(id) && !submitted.has(id));
}

/** Distinct people who turned up on ANY day = registered universe minus the never-attended. */
export function attendedAtLeastOnceIds(universe: string[], neverAttendedIds: string[]): string[] {
  const never = new Set(neverAttendedIds);
  return universe.filter(id => !never.has(id));
}

// =================================================================================================
// Day-scope chips (shared by Video Ask Review and Arena Calling)
// =================================================================================================

/**
 * Which calendar days a chip selection covers.
 *   'all'   → every non-future day
 *   'today' → the single day flagged isToday
 *   else    → that literal date
 *
 * DEFECT (pinned): 'today' with no isToday day in the structure returns [] — the KPIs then read a
 * confident 0 rather than "no data for today".
 */
export function scopeDates(
  selection: string,
  days: { date: string; isToday: boolean; isFuture: boolean }[]
): string[] {
  if (selection === 'all') { return days.filter(d => !d.isFuture).map(d => d.date); }
  if (selection === 'today') { const t = days.find(d => d.isToday); return t ? [t.date] : []; }
  return [selection];
}

/**
 * Review coverage for the Video Ask card.
 *
 * DEFECT (pinned): reviewed and received are collected from two independent per-day maps, so this is
 * NOT clamped and can exceed 100% — see the spec.
 */
export function reviewPercentage(reviewedCount: number, receivedCount: number): number {
  return receivedCount ? Math.round((reviewedCount / receivedCount) * 100) : 0;
}

// =================================================================================================
// Arena Calling
// =================================================================================================

export type CallStatus = 'pending' | 'coming' | 'no-answer' | 'not-coming';

export interface CallSummary { pending: number; coming: number; noAnswer: number; notComing: number; }

/**
 * The status a call row shows: an in-flight optimistic write wins, then the live log, then 'pending'
 * (nobody has called this absentee yet).
 */
export function resolveCallStatus(
  optimistic: CallStatus | undefined,
  logged: CallStatus | undefined
): CallStatus {
  return optimistic || logged || 'pending';
}

/** Tally the four outcomes across the rows currently in scope. */
export function summariseCalls(rows: { status: string }[]): CallSummary {
  const s: CallSummary = { pending: 0, coming: 0, noAnswer: 0, notComing: 0 };
  rows.forEach(r => {
    if (r.status === 'pending') { s.pending++; }
    else if (r.status === 'coming') { s.coming++; }
    else if (r.status === 'no-answer') { s.noAnswer++; }
    else if (r.status === 'not-coming') { s.notComing++; }
  });
  return s;
}

/** Outcome → CSS modifier. An unrecognised status renders unstyled rather than throwing. */
export function callStatusClass(s: string): string {
  return ({
    pending: 'pending', coming: 'coming', 'no-answer': 'noanswer', 'not-coming': 'notcoming'
  } as { [k: string]: string })[s] || '';
}

// =================================================================================================
// Customer Support
// =================================================================================================

/** The service's three-way ticket label → the feed's display status. */
export function ticketStatusLabel(label: string): string {
  if (label === 'resolved') { return 'Resolved'; }
  return label === 'open' ? 'Open' : 'In Progress';
}

/**
 * Open → close hours, to one decimal.
 *
 * DEFECT (pinned): not floored at zero — a ticket whose close timestamp precedes its reported date
 * (a backfill, or a clock-skewed device) contributes a NEGATIVE number to the resolution average.
 */
export function resolutionHours(openMs: number | null, closeMs: number | null): number | null {
  if (openMs === null || closeMs === null) { return null; }
  return Math.round(((closeMs - openMs) / 3600000) * 10) / 10;
}

/** Feed status → CSS modifier. 'In Progress' is the only two-word status, so it is special-cased. */
export function feedStatusClass(s: string): string {
  return s === 'In Progress' ? 'inprogress' : s.toLowerCase();
}

// =================================================================================================
// Participant Data table — filter, sort, export
// =================================================================================================

export interface PdRow {
  profileId: string;
  name: string;
  email: string;
  journeyId: string;
  ft: boolean;
  atcBucket: number;        // 0 full · 1 partial · 2 unvalidated · 3 none · -1 unknown
  atcPct: number | null;
  adjDone: number;
  adjPending: number;
  procDone: number;
  procPending: number;
  attd: number;
}

export interface PdFilter {
  q: string;
  journey: string;
  type: string;
  atc: string;
  pctOp: '>=' | '<=' | '<';
  pctVal: number;
  band: string;
}

/** The table's untouched state — every control at its "everything" position. */
export function defaultPdFilter(): PdFilter {
  return { q: '', journey: 'all', type: 'all', atc: 'all', pctOp: '>=', pctVal: 0, band: '' };
}

/**
 * Does one row survive the table's filters?
 *
 * `bandIds` is the membership set of the clicked completion tier (empty/undefined when no tier is
 * applied) — membership, not a threshold, for the reason given on QUARTILE_DEFS.
 *
 * DEFECT (pinned): the '<' operator with the default pctVal of 0 excludes every row that HAS a
 * percentage (nothing is < 0) while keeping every row whose percentage is unknown, because the
 * unknown branch only excludes once pctVal > 0. The table then shows exactly the participants it
 * has no data for.
 */
export function pdMatches(r: PdRow, f: PdFilter, bandIds?: ReadonlySet<string>): boolean {
  const q = f.q.toLowerCase().trim();
  if (q && !(r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))) { return false; }
  if (f.journey !== 'all' && r.journeyId !== f.journey) { return false; }
  if (f.type !== 'all' && r.ft !== (f.type === 'ft')) { return false; }
  if (f.atc !== 'all' && r.atcBucket !== +f.atc) { return false; }
  if (f.band && !(bandIds || new Set<string>()).has(r.profileId)) { return false; }
  if (r.atcPct !== null) {
    if (f.pctOp === '>=' && !(r.atcPct >= f.pctVal)) { return false; }
    if (f.pctOp === '<=' && !(r.atcPct <= f.pctVal)) { return false; }
    if (f.pctOp === '<' && !(r.atcPct < f.pctVal)) { return false; }
  } else if (f.pctVal > 0) { return false; }   // unknown % excluded once a threshold is set
  return true;
}

/**
 * Column comparator. Strings compare with localeCompare, everything else numerically.
 *
 * DEFECT (pinned): a null value is coerced to -1, so "unknown %" sorts BELOW a genuine 0% instead of
 * to the end of the list, and is indistinguishable from a real negative reading.
 */
export function comparePdRows(a: PdRow, b: PdRow, k: keyof PdRow, d: number): number {
  const va = a[k] as any, vb = b[k] as any;
  if (typeof va === 'string' || typeof vb === 'string') { return String(va).localeCompare(String(vb)) * d; }
  return (((va ?? -1) as number) - ((vb ?? -1) as number)) * d;
}

/**
 * Clicking a header: the same column flips direction, a new column starts ascending for the name
 * (A→Z reads naturally) and descending for every numeric column (biggest first).
 */
export function nextPdSort(
  current: { key: keyof PdRow; dir: number },
  k: keyof PdRow
): { key: keyof PdRow; dir: number } {
  if (current.key === k) { return { key: k, dir: current.dir * -1 }; }
  return { key: k, dir: k === 'name' ? 1 : -1 };
}

/** ATC bucket index → its short column label. -1 (unknown) renders as an em dash. */
export function pdAtcLabel(b: number, short: string[]): string {
  return b >= 0 ? short[b] : '—';
}

/** CSV cell quoting — always quoted, inner quotes doubled. */
export function csvCell(s: any): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

export const PD_CSV_HEADER = [
  'Name', 'Email', 'Journey', 'Type', 'ATC Status', 'ATC %',
  'Adj Done', 'Adj Pending', 'Proc Done', 'Proc Pending', 'Attended Days'
];

/** The export's lines, header first. Name/email/journey are quoted; the numbers are not. */
export function buildPdCsvLines(
  rows: PdRow[],
  ctx: { journeyLabel: (id: string) => string; atcLabel: (b: number) => string; totalDays: number }
): string[] {
  const lines = [PD_CSV_HEADER.join(',')];
  rows.forEach(r => {
    lines.push([
      csvCell(r.name), csvCell(r.email), csvCell(ctx.journeyLabel(r.journeyId)),
      r.ft ? 'First timer' : 'Repeat',
      ctx.atcLabel(r.atcBucket), r.atcPct === null ? '' : r.atcPct,
      r.adjDone, r.adjPending, r.procDone, r.procPending, `${r.attd}/${ctx.totalDays}`
    ].join(','));
  });
  return lines;
}

/** Event name → a safe file stem. */
export function exportFileStem(eventName: string): string {
  return (eventName || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

// =================================================================================================
// Video Ask tags
// =================================================================================================

export interface VideoAskTagDoc { profileid: string; day: string; tags: string[]; addressed: boolean; }

export interface TagGrouping {
  byTag: { [tagId: string]: string[] };
  addressedIds: string[];
  unknownTagIds: string[];
}

/**
 * Bucket participants by the tags on their video-ask SUBMISSIONS, for one day scope.
 *
 * Three rules that are easy to get wrong, all carried over verbatim:
 *  - a participant appears in EVERY tag they carry, not one. Column sums therefore exceed headcount.
 *  - "Addressed" needs at least one TAGGED doc. Without that guard "all tagged docs are addressed" is
 *    vacuously true for someone never tagged, and they would land in Addressed by accident.
 *  - Addressed REPLACES every tag column — an addressed participant appears only under Addressed.
 *
 * A tag id with no column in the taxonomy is reported in `unknownTagIds` (the component logs it) and
 * its holders are dropped from that column.
 */
export function groupVideoAskTags(docs: VideoAskTagDoc[], taxonomyIds: string[]): TagGrouping {
  const tagsByParticipant: { [pid: string]: Set<string> } = {};
  const allAddressed: { [pid: string]: boolean } = {};
  docs.forEach(d => {
    if (!d.tags.length) { return; }   // an untagged submission buckets nowhere and gets no Addressed vote
    const set = tagsByParticipant[d.profileid] = tagsByParticipant[d.profileid] || new Set<string>();
    d.tags.forEach(t => set.add(t));
    allAddressed[d.profileid] = (allAddressed[d.profileid] !== false) && d.addressed;
  });

  const byTag: { [id: string]: string[] } = {};
  taxonomyIds.forEach(id => { byTag[id] = []; });
  const addressedIds: string[] = [];
  const unknown = new Set<string>();
  Object.keys(tagsByParticipant).forEach(pid => {
    if (allAddressed[pid]) { addressedIds.push(pid); return; }
    tagsByParticipant[pid].forEach(tagId => {
      if (byTag[tagId]) { byTag[tagId].push(pid); } else { unknown.add(tagId); }
    });
  });
  return { byTag, addressedIds, unknownTagIds: [...unknown] };
}

/** Filter the tag docs down to one day scope. Docs with no day are always dropped. */
export function tagDocsForDay(docs: VideoAskTagDoc[], day: string): VideoAskTagDoc[] {
  return docs.filter(d => !!d.day && (day === 'all' || d.day === day));
}

/**
 * A&H CRM flags: a participant appears under EVERY flag their metadata carries. Empty flags are
 * kept so the taxonomy always renders in full.
 */
export function groupCrmTags(
  taxonomyIds: string[],
  participants: { profileId: string; tags: string[] }[]
): { [tagId: string]: string[] } {
  const byTag: { [id: string]: string[] } = {};
  taxonomyIds.forEach(id => { byTag[id] = []; });
  participants.forEach(p => {
    taxonomyIds.forEach(id => { if ((p.tags || []).includes(id)) { byTag[id].push(p.profileId); } });
  });
  return byTag;
}

/** Cycle the tag palette by column index, so a dynamic taxonomy is always colour-coded. */
export function paletteColor(index: number, palette: string[]): string {
  return palette[index % palette.length];
}

// =================================================================================================
// Zones and cohorts
// =================================================================================================

/** Zone coverage = allocated / present today, as a whole percentage. */
export function coveragePct(allocated: number, present: number): number {
  return present ? Math.round((allocated / present) * 100) : 0;
}

/** Staff ids → a comma-joined name list, or an em dash when there are none. */
export function staffNamesLabel(ids: any, nameOf: (id: string) => string): string {
  const list = Array.isArray(ids) ? ids : [];
  const names = list.map((id: string) => nameOf(id) || id).filter(Boolean);
  return names.length ? names.join(', ') : '—';
}

/** Group ids by a derived name, largest group first. */
export function groupByName(
  ids: string[],
  nameOf: (id: string) => string
): { name: string; count: number; ids: string[] }[] {
  const by: { [name: string]: string[] } = {};
  ids.forEach(id => { const c = nameOf(id); (by[c] = by[c] || []).push(id); });
  return Object.keys(by)
    .map(name => ({ name, count: by[name].length, ids: by[name] }))
    .sort((a, b) => b.count - a.count);
}

/** Everyone in the universe who is in NO cohort membership list. */
export function idsWithoutCohort(universe: string[], cohortMembers: ReadonlySet<string>): string[] {
  return universe.filter(id => !cohortMembers.has(id));
}

// =================================================================================================
// Drill-down panel
// =================================================================================================

/**
 * Multi-select trigger text — one pick shows its name, several collapse to a count, because
 * Material's comma-joined default overflows a 440px panel.
 *
 * DEFECT (pinned): zero picks falls through to the plural branch and reads "0 products". The trigger
 * is normally hidden when nothing is picked, so this is latent rather than visible today.
 */
export function triggerLabel(picked: string[], opts: { id: string; name: string }[], noun: string): string {
  if (picked.length === 1) { return opts.find(o => o.id === picked[0])?.name || `1 ${noun}`; }
  return `${picked.length} ${noun}s`;
}

/** Up to two initials, upper-cased. An empty or whitespace-only name yields ''. */
export function initials(name: string): string {
  return (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/** Panel headcount wording: '1 participant' / 'N participants', thousands-separated. */
export function participantCountLabel(n: number): string {
  return `${n.toLocaleString()} participant${n === 1 ? '' : 's'}`;
}

/**
 * Grouped (changework) headcount wording: N rows of the LEAD role, plus the distinct people across
 * leads and counterparts — a grouped row is 1 lead + N counterparts, so the row count is not a
 * headcount.
 */
export function pairCountLabel(rowCount: number, peopleCount: number, role: string): string {
  const lead = role === 'beneficiary'
    ? `${rowCount} ${rowCount === 1 ? 'beneficiary' : 'beneficiaries'}`
    : `${rowCount} ${rowCount === 1 ? 'doer' : 'doers'}`;
  return `${lead} · ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`;
}

// =================================================================================================
// Misc
// =================================================================================================

/** Today as 'yyyy-mm-dd' in the operator's own timezone (en-CA renders ISO order). */
export function todayKey(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA');
}

/** 'h:mm AM' for a call/ticket time. */
export function timeLabel(d: Date | null): string {
  if (!d) { return ''; }
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
