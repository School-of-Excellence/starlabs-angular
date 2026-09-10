/**
 * Event Planning Rules Engine (pure, dependency-free).
 *
 * The arithmetic behind the Planning tab of the Event Opportunity Dashboard: who counts as "in the
 * queue", which of the seven headline cards each person lands in, the readiness matrix (Not
 * Completed / Slot Confirmed / Confirmation rate / Not Confirmed / Completed, split six ways by
 * confirmed × customer status), the on-track / at-risk / behind banding against a phase target, the
 * journey / DFU / cohort participant filters, the event countdown, and the drill-down search,
 * filtering, sorting and pagination underneath every number.
 *
 * Extracted from PlanningTabComponent on 2026-09-10, following the pattern set by
 * delivery-dashboard.engine.ts and priority.engine.ts in ../../../Journey Onboarding. The logic is
 * UNCHANGED — same set algebra, same comparison operators, same rounding, same strings, same quirks.
 * Several known oddities (marked DEFECT below) were deliberately left intact and pinned by tests
 * rather than fixed, because this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs. Every function takes its inputs as arguments, so the rules
 *   can be exercised offline instead of standing up a component that injects a Firestore, a
 *   FormBuilder, a MatSnackBar, an AuthguardService and a PlanningDataService, takes eleven @Inputs
 *   and debounces its own recompute behind a visibility gate.
 * - As private methods on that component the rules were unreachable from a spec, and e2e could only
 *   assert a RENDERED number — it could not tell "42 people are ready" from "42 people are ready
 *   because a confirmed slot with no end date was silently dropped".
 * - These are planning decisions with money and logistics behind them. The cards decide how many
 *   seats an event needs; the matrix decides which phase gets chased this week. Changing one should
 *   turn a test red on purpose.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads or writes Firestore, subscribes, emits @Outputs, opens a snackbar or a
 *   confirm(), schedules the debounce, or drives the reactive form. Where a method mixed both, only
 *   the pure core moved: the component still fetches segment membership, participant metadata and
 *   saved filters itself and hands the engine the resulting sets.
 * - The matrix builder takes its per-stage completion and slot-confirmation sets as CALLBACKS, so
 *   the engine never has to know that those come from `allCompletedStageCount` and `queue_token`.
 */

// =================================================================================================
// Shapes — the component's own interfaces, moved here so the engine owns the contract.
// =================================================================================================

export interface PhaseStageRow { queueid: string; stagename: string; }
export type Col = 'c_a' | 'c_na' | 'c_d' | 'n_a' | 'n_na' | 'n_d';
export interface Cells { c_a: number; c_na: number; c_d: number; n_a: number; n_na: number; n_d: number; total: number; }
export type RowKind = 'stage' | 'slot' | 'rate';
export interface RowDef { key: string; label: string; kind: RowKind; }
export interface MatrixLine { key: string; label: string; kind: RowKind; cells: Cells; stages: PhaseStageRow[]; }
export type PhaseStatus = 'ontrack' | 'risk' | 'behind' | 'none';
export interface MatrixRow { phase: any; pct: number; target: number | null; status: PhaseStatus; pop: number; lines: MatrixLine[]; }
export interface CardDef { key: string; label: string; value: number; desc?: string; }
export interface DrillRow { name: string; phone: string; status: string; confirmed: boolean; inQueue: boolean; }
export interface CellDrillRow { name: string; phone: string; queueName: string; stage: string; status: string; confirmed: boolean; slot: string; }
export interface CellRef { phaseDocid: string; lineKey: string; col: Col | 'total'; label: string; }
/** A phase as stored inside a saved filter (self-contained snapshot). */
export interface FilterPhase { phasename: string; targetPct: number | null; rows: { [key: string]: PhaseStageRow[] }; }
/** A saved filter = a named bundle of {queue selection, event selection, phases}. */
export interface PlanningFilter { docid: string; title: string; queueIds: string[]; eventIds: string[]; phases: FilterPhase[]; created?: any; updated?: any; }
/** 'all' = a participant must clear EVERY member stage of the row; 'any' = one is enough. */
export type PhaseRollupRule = 'all' | 'any';
/** 'only' = keep participants matching the active filters; 'remove' = drop them. */
export type FilterMode = 'only' | 'remove';
export type StatusBucket = 'a' | 'na' | 'd';

// =================================================================================================
// Constants — the component's own readonly values, kept as the defaults so behaviour is identical.
// =================================================================================================

/** Rows of the readiness matrix, in render order. 'rate' rows are derived and not drillable. */
export const ROW_DEFS: readonly RowDef[] = [
  { key: 'notComplete', label: 'Not Completed', kind: 'stage' },
  { key: 'slotConfirmed', label: 'Slot Confirmed', kind: 'slot' },
  { key: 'confRate', label: 'Confir. rate', kind: 'rate' },
  { key: 'slotNotConfirmed', label: 'Not Confirmed', kind: 'slot' },
  { key: 'complete', label: 'Completed', kind: 'stage' },
];

export const CONFIRMED_COLS: readonly { k: Col; label: string }[] = [
  { k: 'c_a', label: 'Active' }, { k: 'c_na', label: 'Non Active' }, { k: 'c_d', label: 'Discontinued' },
];
export const NOT_CONFIRMED_COLS: readonly { k: Col; label: string }[] = [
  { k: 'n_a', label: 'Active' }, { k: 'n_na', label: 'Non Active' }, { k: 'n_d', label: 'Discontinued' },
];
export const ALL_COLS: readonly { k: Col; label: string }[] = [...CONFIRMED_COLS, ...NOT_CONFIRMED_COLS];

/** Every cell key, including the row total. */
export const CELL_KEYS: readonly (Col | 'total')[] = ['c_a', 'c_na', 'c_d', 'n_a', 'n_na', 'n_d', 'total'];

/** Drill-table page size (component pageSize, planning-tab.component.ts:313). */
export const PAGE_SIZE = 15;

/** Hard cap on a card drill-down (component drillCap, line 306). */
export const DRILL_CAP = 300;

/** SVG progress-ring circumference (component ringCircumference, line 368). */
export const RING_CIRCUMFERENCE = 163;

/**
 * How far BELOW the target a phase may sit and still read "At risk" rather than "Behind"
 * (rebuildMatrix, line 743). Percentage points.
 */
export const RISK_BAND_PCT = 10;

/** The tokenstatus that counts as being in the queue. Compared case-insensitively. */
export const ACTIVE_TOKEN_STATUS = 'active';

/** `delete` field values that still count as NOT deleted (tokensForQueue, line 670). */
export const NOT_DELETED_VALUES: readonly any[] = [null, undefined, false];

/**
 * Customer-status → journey field, mirroring journeycoach-dashboard's mapCustomerStatusVariable
 * (journeyIdsFor, line 151).
 */
export const JOURNEY_FIELD_BY_STATUS: { readonly [status: string]: string } = {
  active: 'activejourney',
  discontinued: 'lastsubscribedjourney',
};
export const JOURNEY_FIELD_DEFAULT = 'lastcompletedjourney';

// =================================================================================================
// Customer status
// =================================================================================================

/** Drill-table filter bucket for a raw status string. Anything unrecognised is Non-Active. */
export function statusKey(status: string): StatusBucket {
  const s = (status || '').toLowerCase();
  return s === 'active' ? 'a' : s === 'discontinued' ? 'd' : 'na';
}

/**
 * Matrix column bucket for an ALREADY-LOWERCASED status (the component lowercases once, when it
 * builds statusMap). Kept separate from statusKey() because it does NOT lowercase again — that
 * asymmetry is the component's, and moving it here does not change it.
 */
export function statusBucket(rawLowercased: string): StatusBucket {
  const raw = rawLowercased || '';
  return raw === 'active' ? 'a' : raw === 'discontinued' ? 'd' : 'na';
}

/** The six-way column key: confirmed-or-not crossed with the status bucket. */
export function colKey(rawLowercased: string, confirmed: boolean): Col {
  return `${confirmed ? 'c' : 'n'}_${statusBucket(rawLowercased)}` as Col;
}

/** Human status for a drill row. Unknown statuses are Capitalised as-is; a blank one reads "—". */
export function statusLabel(rawLowercased: string): string {
  const raw = rawLowercased || '';
  if (raw === 'active') return 'Active';
  if (raw === 'discontinued') return 'Discontinued';
  if (!raw) return '—';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Column heading for a matrix cell, e.g. "Confirmed · Non Active". */
export function colLabel(col: Col | 'total'): string {
  if (col === 'total') return 'Total';
  const c = ALL_COLS.find(x => x.k === col);
  return `${col.startsWith('c_') ? 'Confirmed' : 'Not confirmed'} · ${c?.label || col}`;
}

// =================================================================================================
// Participant filters (journey / DFU-ongoing / cohort)
// =================================================================================================

/** DFU ongoing = the participant holds a Priority-Mode product (mirrors dynamic-queue-manager-clone). */
export function isDfuOngoing(meta: any, priorityProductIds: Set<string>): boolean {
  const active = meta?.['activeproduct'] || [];
  return Array.isArray(active) && active.some((pid: string) => priorityProductIds.has(pid));
}

/**
 * The participant's journey id(s), chosen by customer status: active → activejourney,
 * discontinued → lastsubscribedjourney, anything else → lastcompletedjourney. The fields hold
 * journey IDs and may be scalar or (nested) array.
 */
export function journeyIdsFor(meta: any, statusLowercased: string): string[] {
  if (!meta) return [];
  const field = JOURNEY_FIELD_BY_STATUS[(statusLowercased || '').toLowerCase()] ?? JOURNEY_FIELD_DEFAULT;
  const v = meta[field];
  if (v == null) return [];
  return Array.isArray(v) ? v.flat().filter(Boolean).map(String) : [String(v)];
}

export interface ParticipantFilterState {
  selectedJourneys: string[];
  dfuOn: boolean;
  selectedCohorts: string[];
  selectedCohortMembers: Set<string>;
  filterMode: FilterMode;
}

/**
 * Does a participant survive the active filters?
 *
 * With NO filter active everyone passes. In 'only' mode a participant must match EVERY active
 * filter; in 'remove' mode matching ANY active filter drops them.
 */
export function passesParticipantFilters(
  id: string,
  state: ParticipantFilterState,
  journeyIds: string[],
  dfuOngoing: boolean,
): boolean {
  const journeyActive = state.selectedJourneys.length > 0;
  const cohortActive = state.selectedCohorts.length > 0;
  if (!journeyActive && !state.dfuOn && !cohortActive) return true;
  const journeyMatch = journeyActive && journeyIds.some(j => state.selectedJourneys.includes(j));
  const dfuMatch = state.dfuOn && dfuOngoing;
  const cohortMatch = cohortActive && state.selectedCohortMembers.has(id);
  if (state.filterMode === 'only') {
    // keep only participants who match EVERY active filter
    if (journeyActive && !journeyMatch) return false;
    if (state.dfuOn && !dfuMatch) return false;
    if (cohortActive && !cohortMatch) return false;
    return true;
  }
  // 'remove': drop participants who match ANY active filter
  if (journeyMatch || dfuMatch || cohortMatch) return false;
  return true;
}

/** Union of the selected cohorts' member profileids. */
export function cohortMembersUnion(
  cohortList: { id: string; members: Set<string> }[],
  selectedCohorts: string[],
): Set<string> {
  const out = new Set<string>();
  for (const c of cohortList || []) {
    if (selectedCohorts.includes(c.id)) c.members.forEach(m => out.add(m));
  }
  return out;
}

// =================================================================================================
// Tokens — the single "in queue" definition every planning number uses
// =================================================================================================

/**
 * Is this token a live seat in the given queue?
 *
 * Active + not deleted + sitting on a real configured stage. When the queue's stage list has not
 * loaded yet we do NOT filter by stage, so the number is right immediately rather than settling
 * after `mapData` lands.
 *
 * DEFECT (pinned): "not deleted" is `[null, undefined, false].includes(t.delete)`, an identity check
 * against three literals. A token whose `delete` field is any other falsy value — 0, '', NaN — is
 * treated as DELETED and silently drops out of every planning count, even though nothing ever
 * soft-deleted it.
 */
export function isTokenInQueue(t: any, queueId: string, stages: string[]): boolean {
  return t?.['queueref']?.id === queueId &&
    NOT_DELETED_VALUES.includes(t?.['delete']) &&
    String(t?.['tokenstatus'] ?? '').toLowerCase() === ACTIVE_TOKEN_STATUS &&
    (!stages.length || stages.includes(t?.['currentstage']));
}

/** Every live token of one queue. */
export function tokensForQueue(tokens: any[], queueId: string, stages: string[]): any[] {
  return (tokens || []).filter(t => isTokenInQueue(t, queueId, stages));
}

/** The queue's configured stages — mapQueue (loaded early) wins over mapData (arrives late). */
export function queueStages(mapQueue: any, mapData: any, queueId: string): string[] {
  return (mapQueue?.[queueId]?.['stages'] || mapData?.[queueId]?.['stages'] || []) as string[];
}

/** Distinct profileids holding a live token across the queue scope. */
export function holderIdsFrom(tokensByQueue: any[][]): Set<string> {
  const s = new Set<string>();
  for (const list of tokensByQueue || []) {
    (list || []).forEach(t => { if (t['profile_id']) s.add(t['profile_id']); });
  }
  return s;
}

/**
 * Participants with a CONFIRMED slot for a stage whose end time is still in the future.
 *
 * DEFECT (pinned): the guard is `if (end && end.getTime() > now)`, so a confirmed slot with a
 * MISSING or unparseable `enddate` is not counted at all. The participant has confirmed, the
 * organiser sees them under "Not Confirmed", and gets chased for a confirmation they already gave.
 */
export function confirmedSlotSetForStage(queueTokens: any[], stageName: string, now: number = Date.now()): Set<string> {
  const out = new Set<string>();
  (queueTokens || []).forEach(t => {
    const pid = t['profile_id'];
    if (!pid) return;
    const slot = (t['selectedstageslot'] || {})[stageName];
    if (!slot || !slot['slotconfirmation']) return;
    // Only count a confirmed slot whose end time is still in the future (upcoming, not past).
    const end = toDate(slot['enddate']);
    if (end && end.getTime() > now) out.add(pid);
  });
  return out;
}

/** Participants who completed a stage, read out of the dashboard's completion map. */
export function completedSetForStage(allCompletedStageCount: any, queueId: string, stageName: string): Set<string> {
  const out = new Set<string>();
  const map = allCompletedStageCount?.[queueId]?.[stageName];
  if (!map) return out;
  Object.keys(map).forEach(k => {
    (map[k] || []).forEach((d: any) => {
      const pid = d['participantid'] || d['profile_id'];
      if (pid) out.add(pid);
    });
  });
  return out;
}

// =================================================================================================
// The seven headline cards
// =================================================================================================

export interface CardInput {
  /** Distinct in-queue people, AFTER the journey / DFU / cohort filters. */
  holders: Set<string>;
  /** Event-approved people (the "Confirmed for the event" set). */
  approved: Set<string>;
  /** Potential total, as counted by the event data service. */
  potentialTotal: number;
  /** Size of the Type #2 set (eligible, in a queue segment, not in the queue). */
  type2Count: number;
}

/**
 * The seven cards, in render order.
 *
 * Every "in queue" card counts DISTINCT PEOPLE, so the cards reconcile with each other and with
 * their own drill-downs. Token-based counting double-counted anyone sitting in more than one
 * selected queue, which is why "Confirmed + in queue" plus "Confirmed + not in queue" used to
 * overshoot "Confirmed for the event".
 *
 * DEFECT (pinned): `confNotInQueue` is computed against the FILTERED holder set. Turn on a journey
 * or cohort filter and everyone it excludes is re-counted as "Confirmed + not in queue" — the card
 * claims people are missing from the queue when they are sitting in it, just filtered out of view.
 * The identity confInQueue + confNotInQueue = confEvent still holds, which is exactly why the error
 * is invisible on the dashboard.
 */
export function computeCards(input: CardInput): CardDef[] {
  const ap = input.approved;
  const holders = input.holders;
  const confInQueue = [...holders].filter(id => ap.has(id)).length;
  const notConfInQueue = holders.size - confInQueue;
  const confNotInQueue = [...ap].filter(id => !holders.has(id)).length;
  return [
    { key: 'confEvent', label: 'Confirmed for the event', value: ap.size, desc: 'Approved/attended event requests' },
    { key: 'inQueue', label: 'Total in the queue', value: holders.size, desc: 'Distinct people in the selected queue' },
    { key: 'confInQueue', label: 'Confirmed + in queue', value: confInQueue, desc: 'Event-confirmed AND in the queue' },
    { key: 'confNotInQueue', label: 'Confirmed + not in queue', value: confNotInQueue, desc: 'Event-confirmed but not in the queue' },
    { key: 'notConfInQueue', label: 'Not confirmed + in queue', value: notConfInQueue, desc: 'In queue but not event-confirmed' },
    { key: 'potential', label: 'Potential', value: input.potentialTotal, desc: 'Own the product, not yet in the event' },
    { key: 'type2', label: 'Eligible · not in queue', value: input.type2Count, desc: 'Potential in a queue segment, not in queue' },
  ];
}

/** Potential = product owners not already approved or requested for the event. */
export function potentialIds(owner: Set<string>, approved: Set<string>, requested: Set<string>): string[] {
  return [...owner].filter(o => !approved.has(o) && !requested.has(o));
}

/**
 * Type #2 = Potential ∩ (in a queue-planning segment) ∩ (NOT holding a token).
 *
 * Note `rawHolders` — the UNFILTERED holder set. Type #2 asks "are they in the queue at all", which
 * is the right question here even though every other card uses the filtered set.
 */
export function type2Ids(potential: string[], segmentMembers: Set<string>, rawHolders: Set<string>): string[] {
  if (!segmentMembers.size) return [];
  return potential.filter(id => segmentMembers.has(id) && !rawHolders.has(id));
}

export interface DrillIdInput {
  holders: Set<string>;
  approved: Set<string>;
  potential: string[];
  type2: string[];
}

/**
 * The id list behind a clicked card.
 *
 * DEFECT (pinned): the 'potential' card DISPLAYS `potentialTotal`, a number the event data service
 * computed, but drills into `potentialIds()`, a list this engine derives from the owner/approved/
 * requested sets. Nothing keeps the two in step, so the card can read 120 and open a list of 118
 * with no indication that anything was dropped.
 */
export function drillIds(cardKey: string | null, input: DrillIdInput): string[] {
  const { holders, approved: ap } = input;
  switch (cardKey) {
    case 'confEvent': return [...ap];
    case 'inQueue': return [...holders];
    case 'confInQueue': return [...holders].filter(id => ap.has(id));
    case 'confNotInQueue': return [...ap].filter(id => !holders.has(id));
    case 'notConfInQueue': return [...holders].filter(id => !ap.has(id));
    case 'potential': return input.potential;
    case 'type2': return input.type2;
    default: return [];
  }
}

/** Card drill rows, name-sorted. `statusOf` returns the ALREADY-LOWERCASED customer status. */
export function buildDrillRows(
  ids: string[],
  mapProfile: any,
  mapNumber: any,
  approved: Set<string>,
  holders: Set<string>,
  statusOf: (id: string) => string,
): DrillRow[] {
  return ids.map(id => ({
    name: mapProfile?.[id] || id,
    phone: mapNumber?.[id] || '',
    status: statusLabel(statusOf(id)),
    confirmed: approved.has(id),
    inQueue: holders.has(id),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// =================================================================================================
// The readiness matrix
// =================================================================================================

/** A zeroed cell set. */
export function emptyCells(): Cells {
  return { c_a: 0, c_na: 0, c_d: 0, n_a: 0, n_na: 0, n_d: 0, total: 0 };
}

/** A phase's configured stages for one row key. */
export function getRowStages(phase: any, key: string): PhaseStageRow[] {
  return (phase?.['rows']?.[key] || []) as PhaseStageRow[];
}

/** Roll a per-stage set membership up to the row, honouring the 'all' / 'any' rule. */
export function rollup(sets: Set<string>[], id: string, rule: PhaseRollupRule): boolean {
  return rule === 'any' ? sets.some(s => s.has(id)) : sets.every(s => s.has(id));
}

export interface MatrixContext {
  /** Distinct in-queue people, filtered — the matrix population. */
  holders: string[];
  /** The queue ids currently in scope; stages outside it are ignored. */
  scope: string[];
  approved: Set<string>;
  /** ALREADY-LOWERCASED customer status for a participant. */
  statusOf: (id: string) => string;
  completedSetFor: (queueid: string, stagename: string) => Set<string>;
  confirmedSlotSetFor: (queueid: string, stagename: string) => Set<string>;
  rollupRule: PhaseRollupRule;
  rowDefs?: readonly RowDef[];
}

/**
 * Does a participant match a readiness row's predicate over that row's configured stages?
 *
 * DEFECT (pinned): a row with NO stages configured returns false for EVERYONE, so "Not Completed"
 * reads 0 — indistinguishable from "everybody has finished". An unconfigured phase looks complete
 * rather than looking unconfigured, and a planner reads a green row as good news.
 */
export function rowMatches(rd: RowDef, stages: PhaseStageRow[], id: string, ctx: MatrixContext): boolean {
  if (!stages.length) return false;
  if (rd.kind === 'stage') {
    const done = rollup(stages.map(s => ctx.completedSetFor(s.queueid, s.stagename)), id, ctx.rollupRule);
    return rd.key === 'complete' ? done : !done;
  }
  const conf = rollup(stages.map(s => ctx.confirmedSlotSetFor(s.queueid, s.stagename)), id, ctx.rollupRule);
  return rd.key === 'slotConfirmed' ? conf : !conf;
}

/**
 * Confirmation rate per column = Slot Confirmed ÷ Not Completed, as a whole percent, 0 when the
 * denominator is 0.
 *
 * DEFECT (pinned): the two rows are counted independently, so the rate is NOT bounded at 100. A
 * participant who confirmed a slot and has already completed the stage counts in the numerator but
 * not the denominator, producing rates like 150% on the planning table.
 */
export function confirmationRateCells(notCompCells: Cells, slotConfCells: Cells): Cells {
  const out = emptyCells();
  CELL_KEYS.forEach(k => {
    out[k] = notCompCells[k] > 0 ? Math.round((slotConfCells[k] / notCompCells[k]) * 100) : 0;
  });
  return out;
}

/** Normalise a stored target: null / undefined / '' mean "no target"; everything else is numeric. */
export function normalizeTarget(rawTarget: any): number | null {
  return (rawTarget === null || rawTarget === undefined || rawTarget === '') ? null : Number(rawTarget);
}

/** Clamp a user-entered target into 0..100 (submitPhase, line 1191). */
export function clampTargetPct(t: any): number | null {
  return (t === null || t === undefined || t === '') ? null : Math.max(0, Math.min(100, Number(t)));
}

/**
 * Band a phase's completion against its target.
 *
 * DEFECT (pinned): "at risk" is `pct >= target - RISK_BAND_PCT` with no floor, so any target of 10
 * or less makes the risk floor zero or negative and the phase can NEVER read "Behind" — 0% complete
 * against a 5% target reports "At risk". A phase nobody has started looks merely wobbly.
 */
export function phaseStatus(pct: number, target: number | null, riskBand: number = RISK_BAND_PCT): PhaseStatus {
  return target == null ? 'none' : pct >= target ? 'ontrack' : pct >= target - riskBand ? 'risk' : 'behind';
}

export function phaseStatusLabel(s: string): string {
  return s === 'ontrack' ? 'On track' : s === 'risk' ? 'At risk' : s === 'behind' ? 'Behind' : '';
}

/** Phase completion as a whole percent of the matrix population. */
export function phasePct(completedTotal: number, population: number): number {
  return population > 0 ? Math.round((completedTotal / population) * 100) : 0;
}

/** Build one phase's matrix row: every line's cells, the derived rate line, the pct and the band. */
export function buildMatrixRow(phase: any, ctx: MatrixContext): MatrixRow {
  const rowDefs = ctx.rowDefs ?? ROW_DEFS;
  const lines: MatrixLine[] = rowDefs.map(rd => {
    const cells = emptyCells();
    if (rd.kind !== 'rate') {
      const stages = getRowStages(phase, rd.key).filter(s => ctx.scope.includes(s.queueid));
      for (const id of ctx.holders) {
        if (!rowMatches(rd, stages, id, ctx)) continue;
        const col = colKey(ctx.statusOf(id), ctx.approved.has(id));
        cells[col]++; cells.total++;
      }
    }
    return { key: rd.key, label: rd.label, kind: rd.kind, cells, stages: getRowStages(phase, rd.key) };
  });
  const rateLine = lines.find(l => l.kind === 'rate');
  const notCompCells = lines.find(l => l.key === 'notComplete')?.cells;
  const slotConfCells = lines.find(l => l.key === 'slotConfirmed')?.cells;
  if (rateLine && notCompCells && slotConfCells) {
    rateLine.cells = confirmationRateCells(notCompCells, slotConfCells);
  }
  const completeLine = lines.find(l => l.key === 'complete');
  const pct = completeLine ? phasePct(completeLine.cells.total, ctx.holders.length) : 0;
  const target = normalizeTarget(phase['targetPct']);
  return { phase, pct, target, status: phaseStatus(pct, target), pop: ctx.holders.length, lines };
}

/** The whole matrix, one row per configured phase. */
export function buildMatrix(phases: any[], ctx: MatrixContext): MatrixRow[] {
  return (phases || []).map(phase => buildMatrixRow(phase, ctx));
}

/** The ids behind one matrix cell (a row × column intersection). */
export function cellIds(phase: any, lineKey: string, col: Col | 'total', ctx: MatrixContext): string[] {
  const rd = (ctx.rowDefs ?? ROW_DEFS).find(r => r.key === lineKey);
  if (!rd) return [];
  const stages = getRowStages(phase, lineKey).filter(s => ctx.scope.includes(s.queueid));
  return ctx.holders.filter(id => {
    if (!rowMatches(rd, stages, id, ctx)) return false;
    return col === 'total' || colKey(ctx.statusOf(id), ctx.approved.has(id)) === col;
  });
}

/** Progress-ring stroke-dasharray for a percentage. */
export function ringDash(pct: number, circumference: number = RING_CIRCUMFERENCE): string {
  return `${Math.round(circumference * pct / 100)} ${circumference}`;
}

// =================================================================================================
// Dates, slots and the event countdown
// =================================================================================================

/** Coerce a Firestore Timestamp / Date / parseable value to a Date, or null. */
export function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Which of the selected events the header counts down to: the earliest one still in the future,
 * falling back to the latest past one when they have all been and gone.
 */
export function pickEventDate(eventList: any[], selectedEventIds: string[], now: number = Date.now()): Date | null {
  const dates = (eventList || [])
    .filter(e => selectedEventIds.includes(e['id']))
    .map(e => toDate(e['start_date']))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dates.length) return null;
  return dates.find(d => d.getTime() >= now) || dates[dates.length - 1];
}

/**
 * The header's event name: the single selection's name, or — with several selected — the one whose
 * start date matches the counted-down date, falling back to the first, then to "N events".
 */
export function eventNameFor(eventList: any[], selectedEventIds: string[], now: number = Date.now()): string {
  const sel = (eventList || []).filter(e => selectedEventIds.includes(e['id']));
  if (!sel.length) return '';
  if (sel.length === 1) return sel[0]['name'] || '';
  const d = pickEventDate(eventList, selectedEventIds, now);
  const match = d ? sel.find(e => { const ed = toDate(e['start_date']); return !!ed && ed.getTime() === d.getTime(); }) : null;
  return (match || sel[0])['name'] || (sel.length + ' events');
}

/** Whole days from today to the event, both ends floored to midnight LOCAL time. */
export function daysToEvent(eventDate: Date | null, now: Date = new Date()): number | null {
  if (!eventDate) return null;
  const a = new Date(eventDate); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** "in 5 days" / "tomorrow" / "today" / "yesterday" / "3 days ago". */
export function countdownLabel(days: number | null): string {
  const n = days;
  if (n == null) return '';
  if (n > 1) return 'in ' + n + ' days';
  if (n === 1) return 'tomorrow';
  if (n === 0) return 'today';
  if (n === -1) return 'yesterday';
  return Math.abs(n) + ' days ago';
}

/** A picked slot as "10 Sep, 2:00 PM–3:00 PM"; '' when the slot has no start. */
export function formatSlot(slot: any): string {
  const start = toDate(slot?.['startdate']);
  if (!start) return '';
  const date = start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const end = toDate(slot?.['enddate']);
  const endTime = end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  return endTime ? `${date}, ${startTime}–${endTime}` : `${date}, ${startTime}`;
}

/** The first of this row's stages for which the participant actually picked a dated slot. */
export function participantSlot(
  id: string,
  stages: PhaseStageRow[],
  tokensFor: (queueid: string) => any[],
): string {
  for (const s of stages) {
    const tok = tokensFor(s.queueid).find(t => t['profile_id'] === id);
    const slot = tok?.['selectedstageslot']?.[s.stagename];
    const label = formatSlot(slot);
    if (label) return label;
  }
  return '—';
}

/**
 * The participant's queue name + current stage, from their token in the selected queue(s).
 *
 * When someone sits in several selected queues we prefer the queue this row's configured stages
 * belong to, so the drill agrees with WHY the cell matched.
 */
export function participantQueueStage(
  id: string,
  scope: string[],
  tokensFor: (queueid: string) => any[],
  queueNameOf: (queueid: string) => string,
  preferQueueIds?: Set<string>,
): { queueName: string; stage: string } {
  const lookup = (queues: string[]) => {
    for (const q of queues) {
      const tok = tokensFor(q).find(t => t['profile_id'] === id);
      if (tok) return { queueName: queueNameOf(q), stage: tok['currentstage'] || '—' };
    }
    return null;
  };
  if (preferQueueIds && preferQueueIds.size) {
    const preferred = lookup(scope.filter(q => preferQueueIds.has(q)));
    if (preferred) return preferred;
  }
  return lookup(scope) || { queueName: '—', stage: '—' };
}

// =================================================================================================
// Drill tables — search, filter, pagination
// =================================================================================================

/**
 * Active filter tokens are "dim:value". Within a dimension the tokens OR together; across dimensions
 * they AND. No tokens at all = everything passes.
 */
export function passesFilters(active: Set<string>, dims: Record<string, string>): boolean {
  if (!active.size) return true;
  const byDim: Record<string, string[]> = {};
  active.forEach(t => { const d = t.split(':')[0]; (byDim[d] = byDim[d] || []).push(t); });
  return Object.keys(byDim).every(d => byDim[d].includes(d + ':' + dims[d]));
}

/** Free-text match over name and phone (both lowercased; an empty query matches everything). */
export function matchesSearch(row: { name?: any; phone?: any }, lowercasedQuery: string): boolean {
  const q = lowercasedQuery;
  return !q
    || String(row.name ?? '').toLowerCase().includes(q)
    || String(row.phone ?? '').toLowerCase().includes(q);
}

/** The card drill table after its search box and chips. */
export function filterDrillRows(rows: DrillRow[], search: string, active: Set<string>): DrillRow[] {
  const q = (search || '').trim().toLowerCase();
  return (rows || []).filter(r =>
    matchesSearch(r, q) &&
    passesFilters(active, { conf: r.confirmed ? 'yes' : 'no', st: statusKey(r.status), inq: r.inQueue ? 'in' : 'out' }));
}

/** The matrix-cell drill table after its search box and chips. */
export function filterCellDrillRows(rows: CellDrillRow[], search: string, active: Set<string>): CellDrillRow[] {
  const q = (search || '').trim().toLowerCase();
  return (rows || []).filter(r =>
    matchesSearch(r, q) &&
    passesFilters(active, { conf: r.confirmed ? 'yes' : 'no', st: statusKey(r.status), slot: (r.slot && r.slot !== '—') ? 'has' : 'none' }));
}

/** Toggle one filter chip, returning the new set (the caller also resets the page). */
export function toggleFilterToken(active: Set<string>, token: string): Set<string> {
  const out = new Set(active);
  out.has(token) ? out.delete(token) : out.add(token);
  return out;
}

/** Page count, never below 1 — an empty table still shows "1 of 1". */
export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageSlice<T>(rows: T[], page: number, pageSize: number = PAGE_SIZE): T[] {
  const s = page * pageSize;
  return (rows || []).slice(s, s + pageSize);
}

/** 1-based index of the first row on this page; 0 when the table is empty. */
export function rangeStart(total: number, page: number, pageSize: number = PAGE_SIZE): number {
  return total ? page * pageSize + 1 : 0;
}

/** 1-based index of the last row on this page. */
export function rangeEnd(total: number, page: number, pageSize: number = PAGE_SIZE): number {
  return Math.min(total, (page + 1) * pageSize);
}

/** Keep the current page inside the (possibly shrunken) table. */
export function clampPage(page: number, total: number, pageSize: number = PAGE_SIZE): number {
  return Math.min(page, pageCount(total, pageSize) - 1);
}

export function prevPage(page: number): number { return Math.max(0, page - 1); }
export function nextPage(page: number, total: number, pageSize: number = PAGE_SIZE): number {
  return Math.min(pageCount(total, pageSize) - 1, page + 1);
}

// =================================================================================================
// Saved filters — signature, clone, diff
// =================================================================================================

/** Deep-ish copy of a phase's row config, dropping anything but queueid + stagename. */
export function cloneRows(rows: { [key: string]: PhaseStageRow[] } | undefined): { [key: string]: PhaseStageRow[] } {
  const out: { [key: string]: PhaseStageRow[] } = {};
  Object.keys(rows || {}).forEach(k => out[k] = (rows![k] || []).map(s => ({ queueid: s.queueid, stagename: s.stagename })));
  return out;
}

/**
 * A stable signature of a selection + phase set, used to decide whether the working draft is dirty.
 * Queue ids, event ids and each row's stages are sorted, so pure reordering is not "a change".
 */
export function signature(
  queueIds: string[],
  eventIds: string[],
  phases: FilterPhase[],
  rowDefs: readonly RowDef[] = ROW_DEFS,
): string {
  const stageRowKeys = rowDefs.filter(rd => rd.kind !== 'rate').map(rd => rd.key);
  return JSON.stringify({
    q: [...queueIds].sort(),
    e: [...eventIds].sort(),
    p: phases.map(p => ({
      n: p.phasename, t: p.targetPct ?? null,
      r: stageRowKeys.map(k => (p.rows?.[k] || []).map(s => `${s.queueid}|${s.stagename}`).sort()),
    })),
  });
}

/** Two phase-stage picks are the same option when queue + stage match (mat-select comparison). */
export function comparePhaseStage(a: any, b: any): boolean {
  return a && b ? `${a.queueid}${a.stagename}` === `${b.queueid}${b.stagename}` : a === b;
}

/** Label for a row key. */
export function rowLabel(k: string, rowDefs: readonly RowDef[] = ROW_DEFS): string {
  return rowDefs.find(rd => rd.key === k)?.label || k;
}

/** Every configured line of a phase, e.g. `Not Completed: StageA, StageB`. */
export function phaseDetailLines(
  name: string,
  targetPct: any,
  rows: any,
  prefix = '',
  rowDefs: readonly RowDef[] = ROW_DEFS,
): string[] {
  const out: string[] = [];
  const t = targetPct ?? null;
  out.push(`${prefix}Phase "${name}"${t != null ? ` · target ${t}%` : ''}`);
  for (const rd of rowDefs) {
    if (rd.kind === 'rate') continue;
    const stages = ((rows || {})[rd.key] || []).map((s: PhaseStageRow) => s.stagename);
    if (stages.length) out.push(`${prefix}   ${rowLabel(rd.key, rowDefs)}: ${stages.join(', ')}`);
  }
  return out;
}

export interface ChangeInput {
  saveTitle: string;
  queueIds: string[];
  eventIds: string[];
  phases: any[];
  queueNameOf: (id: string) => string;
  eventNameOf: (id: string) => string;
  rowDefs?: readonly RowDef[];
}

/**
 * The FULL list of what is being saved (new filter) or what changed against the applied one.
 *
 * DEFECT (pinned): phases are matched between old and new BY NAME, through a Map. Two phases sharing
 * a name collapse to one entry, so edits to the shadowed duplicate are reported as "No changes" —
 * and the save panel tells the planner nothing is different when their work is about to be written.
 */
export function computeChanges(active: PlanningFilter | null, input: ChangeInput): string[] {
  const rowDefs = input.rowDefs ?? ROW_DEFS;
  const title = (input.saveTitle || '').trim();
  // NEW filter — list everything that will be saved, in full.
  if (!active) {
    const out: string[] = [];
    out.push(`Queues: ${input.queueIds.length ? input.queueIds.map(q => input.queueNameOf(q)).join(', ') : '—'}`);
    out.push(`Events: ${input.eventIds.length ? input.eventIds.map(e => input.eventNameOf(e)).join(', ') : '—'}`);
    out.push(`Phases: ${input.phases.length}`);
    for (const p of input.phases) out.push(...phaseDetailLines(p['phasename'], p['targetPct'], p['rows'], '  ', rowDefs));
    return out;
  }
  // UPDATE — every difference, spelled out.
  const lines: string[] = [];
  if (active.title !== title && title) {
    lines.push(`Title: "${active.title}" → "${title}"`);
  }
  const diffSet = (oldArr: string[], curArr: string[], label: string, name: (x: string) => string) => {
    const oldS = new Set(oldArr), curS = new Set(curArr);
    const added = curArr.filter(x => !oldS.has(x)).map(name);
    const removed = oldArr.filter(x => !curS.has(x)).map(name);
    if (added.length) lines.push(`${label} added: ${added.join(', ')}`);
    if (removed.length) lines.push(`${label} removed: ${removed.join(', ')}`);
  };
  diffSet(active.queueIds || [], input.queueIds, 'Queue', q => input.queueNameOf(q));
  diffSet(active.eventIds || [], input.eventIds, 'Event', e => input.eventNameOf(e));
  const oldByName = new Map((active.phases || []).map(p => [p.phasename, p]));
  const curByName = new Map(input.phases.map(p => [p['phasename'], p]));
  for (const [name, cur] of curByName) {
    const old = oldByName.get(name);
    if (!old) { lines.push(...phaseDetailLines(name, cur['targetPct'], cur['rows'], 'Added ', rowDefs)); continue; }
    const oldT = old.targetPct ?? null, newT = cur['targetPct'] ?? null;
    if (oldT !== newT) lines.push(`"${name}" target: ${oldT ?? '—'}% → ${newT ?? '—'}%`);
    for (const rd of rowDefs) {
      if (rd.kind === 'rate') continue;
      const oldStages = (old.rows?.[rd.key] || []).map(s => s.stagename);
      const curStages = ((cur['rows'] || {})[rd.key] || []).map((s: PhaseStageRow) => s.stagename);
      const oldS = new Set(oldStages), curS = new Set(curStages);
      const added = curStages.filter((s: string) => !oldS.has(s));
      const removed = oldStages.filter((s: string) => !curS.has(s));
      if (added.length) lines.push(`"${name}" · ${rowLabel(rd.key, rowDefs)} +${added.join(', ')}`);
      if (removed.length) lines.push(`"${name}" · ${rowLabel(rd.key, rowDefs)} −${removed.join(', ')}`);
    }
  }
  for (const name of oldByName.keys()) if (!curByName.has(name)) lines.push(`Phase removed: "${name}"`);
  if (!lines.length) lines.push('No changes');
  return lines;
}
