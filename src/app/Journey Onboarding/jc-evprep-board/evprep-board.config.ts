// Ev. Preparation kanban boards (Journey Coach Health -> Ev. Preparation tab, operator 2026-11-11).
// Pure data + pure helpers so the board rules can be checked without Angular or Firestore.
// New Participants board is LIVE (operator 2026-11-11): it reads and writes the `evolution prep` /
// `evolution prep variation` collections (schema from the journey-pipeline component), see the
// "Live board" section below. The Returning board stays a DESIGN PREVIEW on EVPREP_SAMPLE until its
// "JC Done" entry rule is defined; its moves stay on the page.

export type EvPrepBoardKey = 'new' | 'returning';

export interface EvPrepStage { key: string; label: string; sub?: string; accent: string; }
export interface EvPrepBoard { key: EvPrepBoardKey; eyebrow: string; title: string; sub: string; stages: EvPrepStage[]; }

export const EVPREP_BOARDS: EvPrepBoard[] = [
  {
    key: 'new',
    eyebrow: 'Ev. Preparation · Pipeline 1',
    title: 'New Participants',
    sub: 'Onboarded participants preparing for their first Scope Enhancement.',
    stages: [
      { key: 'onboarded', label: 'Onboarded', sub: 'Yet to start', accent: '#475569' },
      { key: 'ael', label: 'AEL', accent: '#2563EB' },
      { key: 'upaspiration', label: 'uP! Aspiration', accent: '#7C3AED' },
      { key: 'atcunderstanding', label: 'ATC understanding', accent: '#D97706' },
      { key: 'readyforse', label: 'Ready for SE', accent: '#16A34A' },
    ],
  },
  // {
  //   key: 'returning',
  //   eyebrow: 'Ev. Preparation · Pipeline 2',
  //   title: 'Attended 1 uP! and above',
  //   sub: 'Returning participants preparing for their next Scope Enhancement.',
  //   stages: [
  //     { key: 'jcdone', label: 'JC Done', sub: 'Yet to start', accent: '#475569' },
  //     { key: 'ael', label: 'AEL', accent: '#2563EB' },
  //     { key: 'uplifereport', label: 'uP! life report', accent: '#7C3AED' },
  //     { key: 'readyforse', label: 'Ready for SE', accent: '#16A34A' },
  //   ],
  // },
];

export interface EvPrepNote { by: string; at: any; note: string; fromStage: string; toStage: string; }

/** One participant on a board: exactly one board, exactly one stage. */
export interface EvPrepDoc {
  profileid: string;
  board: EvPrepBoardKey;
  stage: string;
  stagesince?: any;
  updatedby?: string;
  updatedat?: any;
  notes?: EvPrepNote[];
}

export function boardFor(key: string): EvPrepBoard | undefined {
  return EVPREP_BOARDS.find(b => b.key === key);
}

export function stageOf(board: EvPrepBoard, key: string): EvPrepStage | undefined {
  return board.stages.find(s => s.key === key);
}

/** A move is valid only inside one board, between two different stages that both exist on it. */
export function canMove(boardKey: string, from: string, to: string): boolean {
  const b = boardFor(boardKey);
  return !!b && from !== to && !!stageOf(b, from) && !!stageOf(b, to);
}

/** Next / previous stage on the same board (null at the ends). */
export function neighbourStage(boardKey: string, from: string, dir: 1 | -1): EvPrepStage | null {
  const b = boardFor(boardKey);
  if (!b) return null;
  const i = b.stages.findIndex(s => s.key === from);
  return i < 0 ? null : (b.stages[i + dir] ?? null);
}

/** Bucket docs into the columns of one board. Docs for another board, or an unknown stage, are left out. */
export function groupByStage<T extends { board: string; stage: string }>(boardKey: string, docs: T[]): Record<string, T[]> {
  const b = boardFor(boardKey);
  const out: Record<string, T[]> = {};
  if (!b) return out;
  for (const s of b.stages) out[s.key] = [];
  for (const d of docs) if (d.board === boardKey && out[d.stage]) out[d.stage].push(d);
  return out;
}

/** Whole days since the card entered its current stage (0 when unknown). */
export function daysInStage(since: Date | null, now: number = Date.now()): number {
  if (!since) return 0;
  return Math.max(0, Math.floor((now - since.getTime()) / 86400000));
}

/** Sample cards for the design preview (fake participants, no real data). */
export const EVPREP_SAMPLE: (EvPrepDoc & { name: string; email: string; journey: string; coach: string; days: number })[] = [
  ['s1', 'new', 'onboarded', 'Participant A', 'uP!', 'Coach X', 2], ['s2', 'new', 'onboarded', 'Participant B', 'FTM', 'Coach Y', 9],
  ['s3', 'new', 'onboarded', 'Participant C', 'uP!', 'Coach X', 16], ['s4', 'new', 'ael', 'Participant D', 'B!G', 'Coach Z', 4],
  ['s5', 'new', 'ael', 'Participant E', 'uP!', 'Coach Y', 11], ['s6', 'new', 'upaspiration', 'Participant F', 'FTM', 'Coach X', 3],
  ['s7', 'new', 'upaspiration', 'Participant G', 'uP!', 'Coach Z', 7], ['s8', 'new', 'atcunderstanding', 'Participant H', 'CPM.', 'Coach Y', 5],
  ['s9', 'new', 'readyforse', 'Participant I', 'uP!', 'Coach X', 1],
  ['s10', 'returning', 'jcdone', 'Participant J', 'uP!', 'Coach Z', 6], ['s11', 'returning', 'jcdone', 'Participant K', 'FTM', 'Coach X', 13],
  ['s12', 'returning', 'ael', 'Participant L', 'uP!', 'Coach Y', 2], ['s13', 'returning', 'ael', 'Participant M', 'B!G', 'Coach X', 8],
  ['s14', 'returning', 'uplifereport', 'Participant N', 'uP!', 'Coach Z', 21], ['s15', 'returning', 'readyforse', 'Participant O', 'uP!', 'Coach Y', 3],
].map(([id, board, stage, name, journey, coach, days]) => ({
  profileid: id as string, board: board as EvPrepBoardKey, stage: stage as string, name: name as string,
  email: (name as string).toLowerCase().replace(' ', '.') + '@example.com', journey: journey as string, coach: coach as string, days: days as number,
}));

// ─── Live board (New Participants) ─────────────────────────────────────────────────────────────
// Data model (owned by the journey-pipeline component, shared here unchanged + 4 additive fields):
//   `evolution prep variation` {variationid, variationname, stage|stages: [{stagename}] | {k: {stagename}}}
//   `evolution prep` {docid, profileid, variationid, currentstage, completedstages[], status, createdon, createdby}
//     status: initiated (first stage) | ongoing | completed (= Ready for SE) | cancelled
//   Added by this board: notes[] (EvPrepNote, one per move), stagesince, updatedby, updatedon.

/** First and last columns of the live board; the stage columns between them come from the variations. */
export const LIVE_START = 'onboarded';
export const LIVE_DONE = 'readyforse';
/** Operator default (2026-11-11): only participants onboarded on/after this date appear in "Yet to start",
 *  and Ready for SE only shows preps started on/after it. Without it every past onboarding would appear. */
export const EVPREP_LIVE_FROM = new Date('2026-10-01T00:00:00+05:30');
export const ACTIVE_STATUSES = ['initiated', 'ongoing'];
const STAGE_ACCENTS = ['#2563EB', '#7C3AED', '#D97706', '#0891B2', '#DB2777', '#65A30D'];

export interface EvPrepVariation { variationid: string; variationname: string; stages: string[]; }
export interface PrepUpdate { currentstage: string; completedstages: string[]; status: 'initiated' | 'ongoing' | 'completed'; }

/** Variation doc -> ordered stage names. Accepts `stage` or `stages`, as an array or a map (journey-pipeline rule). */
export function normaliseVariation(id: string, v: any): EvPrepVariation {
  const raw = v?.stage ?? v?.stages ?? [];
  const list: any[] = Array.isArray(raw) ? raw : Object.values(raw || {});
  const stages = list.map(s => (typeof s === 'string' ? s : s?.stagename)).filter((s: any) => typeof s === 'string' && s.trim() !== '');
  return { variationid: v?.variationid || id, variationname: v?.variationname || v?.variationid || id, stages };
}

/** Column key for a stage name. Prefixed so it can never collide with the fixed first/last columns. */
export function stageKey(name: string): string {
  return 'st-' + String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Live columns: Onboarded (Yet to start) | every stage name across the variations, first-seen order | Ready for SE. */
export function liveStages(variations: EvPrepVariation[]): EvPrepStage[] {
  const out: EvPrepStage[] = [{ key: LIVE_START, label: 'Onboarded', sub: 'Yet to start', accent: '#475569' }];
  const seen = new Set<string>();
  for (const v of variations) {
    for (const name of v.stages) {
      const k = stageKey(name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, label: name, accent: STAGE_ACCENTS[(out.length - 1) % STAGE_ACCENTS.length] });
    }
  }
  out.push({ key: LIVE_DONE, label: 'Ready for SE', accent: '#16A34A' });
  return out;
}

/** Column of a prep doc: completed -> Ready for SE, active -> its current stage, anything else (cancelled) -> null. */
export function prepColumn(p: { status?: string; currentstage?: string }): string | null {
  if (p?.status === 'completed') return LIVE_DONE;
  if (ACTIVE_STATUSES.includes(p?.status ?? '') && p?.currentstage) return stageKey(p.currentstage);
  return null;
}

function toMillis(t: any): number {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t instanceof Date) return t.getTime();
  return typeof t === 'number' ? t : 0;
}

/** Onboarded new participants with no prep started since onboarding (journey-pipeline rule). A cancelled prep
 *  does not count, so cancelling returns the participant to Yet to start. */
export function yetToStart<T extends { profileid?: string; onboarded?: any; journeytype?: string; onboardedtime?: any }>(
  pjps: T[], preps: { profileid?: string; createdon?: any; status?: string }[], from: Date = EVPREP_LIVE_FROM): T[] {
  const seen = new Set<string>();
  return pjps.filter(r => {
    if (r?.onboarded !== true || r?.journeytype !== 'new' || !r.profileid) return false;
    const at = toMillis(r.onboardedtime);
    if (at < from.getTime() || seen.has(r.profileid)) return false;
    const started = preps.some(p => p.profileid === r.profileid && p.status !== 'cancelled' && toMillis(p.createdon) > at);
    if (started) return false;
    seen.add(r.profileid);
    return true;
  });
}

/** Sale excluded from the pipeline (journey-pipeline rule): rejected, one excluded journey, internal test leads on another. */
export function isRemovedSale(s: any): boolean {
  if (String(s?.status ?? '').toLowerCase() === 'rejected') return true;
  if (s?.journey === 'InLXMl7OBAqlDTZcXwK0') return true;
  if (s?.journey === 'RXvsMYoK0g4SstvDDURZ' && String(s?.email ?? '').toLowerCase().includes('soexcellence.com')) return true;
  return false;
}

/** Fields for a prep moved to column `toKey`, or a reason it cannot move there. Moves follow the card's own variation:
 *  a stage column sets that stage (completedstages = the stages before it), Ready for SE completes the prep. */
export function planPrepMove(variation: EvPrepVariation | undefined, toKey: string): { update?: PrepUpdate; block?: string } {
  if (!variation || variation.stages.length === 0) return { block: 'This participant\'s variation has no stages.' };
  const s = variation.stages;
  if (toKey === LIVE_START) return { block: 'A started preparation cannot go back to Yet to start.' };
  if (toKey === LIVE_DONE) return { update: { currentstage: s[s.length - 1], completedstages: [...s], status: 'completed' } };
  const i = s.findIndex(n => stageKey(n) === toKey);
  if (i < 0) return { block: `${variation.variationname} has no such stage.` };
  return { update: { currentstage: s[i], completedstages: s.slice(0, i), status: i === 0 ? 'initiated' : 'ongoing' } };
}

/** Next / back column for a prep, along its own variation (null at the ends; back never returns to Yet to start). */
export function prepNeighbour(variation: EvPrepVariation | undefined, p: { status?: string; currentstage?: string }, dir: 1 | -1): string | null {
  if (!variation || variation.stages.length === 0) return null;
  const s = variation.stages;
  if (p.status === 'completed') return dir === -1 ? stageKey(s[s.length - 1]) : null;
  const i = s.findIndex(n => n === p.currentstage);
  if (i < 0) return null;
  if (dir === 1) return i + 1 < s.length ? stageKey(s[i + 1]) : LIVE_DONE;
  return i > 0 ? stageKey(s[i - 1]) : null;
}

/** Split ids into Firestore 'in' batches (max 30 per query). */
export function chunk<T>(xs: T[], n = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
