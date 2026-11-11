// Ev. Preparation kanban boards (Journey Coach Health -> Ev. Preparation tab, operator 2026-11-11).
// Pure data + pure helpers so the board rules can be checked without Angular or Firestore.
// DESIGN PREVIEW: stage entry rules ("variables") and storage are not defined yet; the board shows
// EVPREP_SAMPLE (fake participants) and moves stay on the page.

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
  {
    key: 'returning',
    eyebrow: 'Ev. Preparation · Pipeline 2',
    title: 'Attended 1 uP! and above',
    sub: 'Returning participants preparing for their next Scope Enhancement.',
    stages: [
      { key: 'jcdone', label: 'JC Done', sub: 'Yet to start', accent: '#475569' },
      { key: 'ael', label: 'AEL', accent: '#2563EB' },
      { key: 'uplifereport', label: 'uP! life report', accent: '#7C3AED' },
      { key: 'readyforse', label: 'Ready for SE', accent: '#16A34A' },
    ],
  },
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
