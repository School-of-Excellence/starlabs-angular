/**
 * Who is talking, and who they are — a port of the AH-CRM mobile app's live
 * subtitle rules (lib/face/video_subtitles.dart `pickSpeaker` and the
 * tracking/identity code in live_subtitle_player.dart). Pure TypeScript.
 */
import type { SpeechSegment } from './captions';

// ── Who is talking ───────────────────────────────────────────────────────

/** A face seen at one sampled time. `mouth` = inner-lip gap / mouth width. */
export interface FaceSample {
  timeMs: number;
  personId: number;
  area: number;
  mouth: number | null;
}

/** How the speaker for a line was decided, strongest first. */
export type SpeakerBasis =
  | 'lipMovement' // several faces on screen; this one's mouth moved most
  | 'onlyFace' // exactly one face on screen while the line was spoken
  | 'continuing' // weak/close lip signal; same speaker as the line before
  | 'mostVisible' // several faces, no clear lip signal — largest/most present
  | 'byElimination' // the others' lips are still; this side-on face is left
  | 'notTalking' // faces visible but their lips are still: speaker is unseen
  | 'offScreen' // no face on screen while the line was spoken
  | 'notAnalysed' // faces around the line weren't analysed in time
  | 'pending'; // still being worked out

export const BASIS_LABEL: Record<SpeakerBasis, string> = {
  lipMovement: 'lips',
  onlyFace: 'only face',
  continuing: 'same as before',
  mostVisible: 'guess',
  byElimination: 'others silent',
  notTalking: 'visible faces not talking',
  offScreen: 'off screen',
  notAnalysed: 'faces not analysed yet',
  pending: 'identifying…',
};

export interface SpeakerPick {
  personId: number | null;
  basis: SpeakerBasis;
  activity: Map<number, number>;
}

const pick = (personId: number | null, basis: SpeakerBasis, activity = new Map<number, number>()): SpeakerPick => ({
  personId,
  basis,
  activity,
});

// Faces are searched slightly beyond the line so a line that starts just
// before a sampled frame still sees the speaker.
const WINDOW_PAD_MS = 250;
// Mean frame-to-frame change in mouth openness that counts as "talking": a
// talking mouth swings ~0.05–0.3 between samples, a still one jitters ~0.01.
const MIN_LIP_ACTIVITY = 0.025;
// The top talker must beat the runner-up by this factor to be trusted.
const LIP_LEAD_RATIO = 1.35;
// Samples further apart than this aren't compared (a gap or a camera cut
// would otherwise look like a big mouth movement).
// (Live camera samples faces every 1.2 s while someone is speaking.)
const MAX_SAMPLE_GAP_MS = 1500;

/**
 * Pick who is saying `seg` from the face samples around it. A face counts as
 * talking only when its lips are measured moving; visible faces whose lips
 * are all still mean the speaker is unseen (no name rather than naming the
 * listener).
 */
export function pickSpeaker(seg: SpeechSegment, samples: Iterable<FaceSample>, previous: number | null): SpeakerPick {
  const lo = seg.startMs - WINDOW_PAD_MS;
  const hi = seg.endMs + WINDOW_PAD_MS;
  const byPerson = new Map<number, FaceSample[]>();
  for (const s of samples) {
    if (s.timeMs < lo || s.timeMs > hi) continue;
    let l = byPerson.get(s.personId);
    if (!l) byPerson.set(s.personId, (l = []));
    l.push(s);
  }
  if (byPerson.size === 0) return pick(null, 'offScreen');
  byPerson.forEach((l) => l.sort((a, b) => a.timeMs - b.timeMs));
  const activity = new Map<number, number>();
  byPerson.forEach((s, id) => {
    const a = lipActivity(s);
    if (a !== null) activity.set(id, a);
  });

  const talkers = [...activity.entries()].filter(([, a]) => a >= MIN_LIP_ACTIVITY).sort((a, b) => b[1] - a[1]);
  if (talkers.length) {
    const [topId, topA] = talkers[0];
    let rival = 0;
    activity.forEach((a, id) => {
      if (id !== topId) rival = Math.max(rival, a);
    });
    if (topA >= rival * LIP_LEAD_RATIO) return pick(topId, 'lipMovement', activity);
    if (previous !== null && talkers.some(([id]) => id === previous)) return pick(previous, 'continuing', activity);
    return pick(topId, 'mostVisible', activity);
  }
  if (activity.size === byPerson.size) return pick(null, 'notTalking', activity);
  const unmeasured = [...byPerson.keys()].filter((k) => !activity.has(k));
  if (activity.size > 0 && unmeasured.length === 1) {
    // Everyone we can lip-read is silent; the one face we can't (side-on)
    // is the speaker.
    return pick(unmeasured[0], 'byElimination', activity);
  }
  if (previous !== null && byPerson.has(previous)) return pick(previous, 'continuing', activity);
  if (byPerson.size === 1) return pick([...byPerson.keys()][0], 'onlyFace', activity);
  return pick(mostVisible(byPerson), 'mostVisible', activity);
}

/** Mean |Δ mouth| between back-to-back samples; null if none (unmeasurable). */
function lipActivity(s: FaceSample[]): number | null {
  let sum = 0;
  let pairs = 0;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1].mouth;
    const b = s[i].mouth;
    if (a === null || b === null) continue;
    if (s[i].timeMs - s[i - 1].timeMs > MAX_SAMPLE_GAP_MS) continue;
    sum += Math.abs(b - a);
    pairs++;
  }
  return pairs === 0 ? null : sum / pairs;
}

function mostVisible(byPerson: Map<number, FaceSample[]>): number {
  let best = -1;
  let bestScore = -1;
  byPerson.forEach((s, id) => {
    const meanArea = s.reduce((a, e) => a + e.area, 0) / s.length;
    const score = s.length * 1e9 + meanArea;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  });
  return best;
}

// ── Who they are ─────────────────────────────────────────────────────────

/** A profile's stored MobileFaceNet vectors (`profileimg_mbf`, `profile_mbf`). */
export interface Profile {
  id: string;
  name: string;
  imageUrl: string | null;
  vectors: Float32Array[];
}

export interface Person {
  id: number;
  profileId: string | null;
  name: string;
  imageUrl: string | null;
  embedding: Float32Array;
  bestScore: number;
  /** Frontal frames whose top profile cleared the weak bar, per profile. */
  votes: Map<string, number>;
  /** Closest profile seen so far (diagnostics): name, score, runner-up. */
  closest: { name: string; score: number; second: number } | null;
}

/** A face in one analysed frame, after tracking. */
export interface TrackedFace {
  box: [number, number, number, number];
  personId: number;
  mouth: number | null;
}

/** A face found by face.worker.ts (frame pixels). */
export interface WorkerFace {
  /** Box: x, y, width, height. */
  box: [number, number, number, number];
  /** 5 points (x,y): image-left eye, image-right eye, nose, left/right mouth. */
  kps: number[];
  score: number;
}

/** Face as measured in a frame, before tracking (no identity vector yet). */
export interface MeasuredFace {
  box: [number, number, number, number];
  /** Turned ≤ 45°: lips can be read. */
  frontal: boolean;
  /** Turned ≤ 60°: good enough to match against profiles. */
  identifiable: boolean;
  mouth: number | null;
}

/** Identity vectors for the given faces of the frame being tracked. */
export type EmbedFn = (indices: number[]) => Promise<Float32Array[]>;

// A person is named after ONE frame that matches strongly (bar + lead over
// the runner-up)…
const STRONG_MATCH = 0.42;
const STRONG_LEAD = 0.04;
// …or after several frames agreeing on the same profile at the bar the
// mobile Face Check video scan uses (0.35). A single lucky 0.35 frame —
// the false "Mark" on the test video — is not enough on its own.
const WEAK_MATCH = 0.35;
const WEAK_LEAD = 0.02;
const WEAK_VOTES = 3;
const SAME_PERSON_SIM = 0.46; // unknown-face clustering
const MIN_TRACK_IOU = 0.4;

interface Ranked {
  profile: Profile | null;
  score: number;
  second: number;
}

function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function boxIou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  if (x2 <= x1 || y2 <= y1) return 0;
  const i = (x2 - x1) * (y2 - y1);
  return i / (a[2] * a[3] + b[2] * b[3] - i);
}

/**
 * People seen in the video: tracked between consecutive frames by box
 * overlap, identified against profiles from every frontal frame (like the
 * mobile Face Check video scan). An identity can only get better — an
 * "Unknown" becomes recognised from a strong match or agreeing weak ones; a
 * recognised person never drops back because a side-on frame scored low.
 */
export class PeopleTracker {
  readonly people: Person[] = [];
  private prevFaces: TrackedFace[] = [];
  private prevT = -1e12;

  constructor(
    private profiles: Profile[],
    private readonly stepMs: number,
  ) {}

  /** Profiles arrived (or changed): later frames are matched against them. */
  setProfiles(profiles: Profile[]): void {
    this.profiles = profiles;
  }

  isRecognised(id: number): boolean {
    return this.people[id]?.profileId != null;
  }

  /**
   * Assign each measured face to a person; returns the tracked faces. A face
   * overlapping last frame's face keeps its person. Identity vectors
   * (`embed`) are fetched for every frontal face (each one is another chance
   * to recognise them) and for new side-on faces (to group them); side-on
   * vectors are never matched to profiles.
   */
  async track(t: number, faces: MeasuredFace[], embed: EmbedFn): Promise<TrackedFace[]> {
    const consecutive = t - this.prevT <= this.stepMs * 2 && t > this.prevT;
    // Pass 1: box tracking, and which faces need an identity vector.
    const used = new Set<number>();
    const matched: (number | null)[] = [];
    const need: number[] = [];
    faces.forEach((f, i) => {
      let personId: number | null = null;
      if (consecutive) {
        let best = MIN_TRACK_IOU;
        for (const p of this.prevFaces) {
          if (used.has(p.personId)) continue;
          const o = boxIou(p.box, f.box);
          if (o > best) {
            best = o;
            personId = p.personId;
          }
        }
      }
      if (personId !== null) used.add(personId);
      if (personId === null || f.identifiable) need.push(i);
      matched.push(personId);
    });
    const vectors = new Map<number, Float32Array>();
    if (need.length) {
      const got = await embed(need);
      need.forEach((i, k) => vectors.set(i, got[k]));
    }
    // Pass 2: identities.
    const out: TrackedFace[] = [];
    faces.forEach((f, i) => {
      let personId = matched[i];
      const q = vectors.get(i);
      if (personId !== null) {
        if (q) this.consider(this.people[personId], q, f.identifiable, used);
      } else if (q) {
        const person = this.personFor(q, f.identifiable, used);
        this.consider(person, q, f.identifiable, used);
        personId = person.id;
        used.add(personId);
      }
      if (personId === null) return;
      // Side-on: lip landmarks jitter and read as "talking" — leave the
      // mouth unmeasured instead.
      out.push({ box: f.box, personId, mouth: f.frontal ? f.mouth : null });
    });
    this.prevFaces = out;
    this.prevT = t;
    return out;
  }

  /** Forget frame-to-frame continuity (after a seek). */
  breakTrack(): void {
    this.prevFaces = [];
    this.prevT = -1e12;
  }

  /** Best and runner-up profile for a vector. */
  private rank(q: Float32Array): Ranked {
    let profile: Profile | null = null;
    let score = -2;
    let second = -2;
    for (const p of this.profiles) {
      let s = -2;
      for (const v of p.vectors) s = Math.max(s, dot(q, v));
      if (s > score) {
        second = score;
        score = s;
        profile = p;
      } else if (s > second) {
        second = s;
      }
    }
    return { profile, score, second };
  }

  private static strong(r: Ranked): boolean {
    return !!r.profile && r.score >= STRONG_MATCH && r.score - r.second >= STRONG_LEAD;
  }

  private static weak(r: Ranked): boolean {
    return !!r.profile && r.score >= WEAK_MATCH && r.score - r.second >= WEAK_LEAD;
  }

  /**
   * Weigh one more frame of `person` towards (or confirming) a profile.
   * `onScreen` = people in this same frame: a profile already given to one
   * of them isn't given to a second face; one given to someone NOT on screen
   * is (the same person back after a camera cut gets a new track).
   */
  private consider(person: Person, q: Float32Array, identifiable: boolean, onScreen: Set<number>): void {
    if (!identifiable) return; // side-on vectors mis-match
    const r = this.rank(q);
    if (!r.profile) return;
    if (!person.closest || r.score > person.closest.score) {
      person.closest = { name: r.profile.name || r.profile.id, score: r.score, second: r.second };
    }
    if (person.profileId !== null) {
      if (person.profileId === r.profile.id && r.score > person.bestScore) {
        person.embedding = q;
        person.bestScore = r.score;
      }
      return;
    }
    if (this.people.some((p) => p !== person && p.profileId === r.profile!.id && onScreen.has(p.id))) return;
    let votes = 0;
    if (PeopleTracker.weak(r)) {
      votes = (person.votes.get(r.profile.id) ?? 0) + 1;
      person.votes.set(r.profile.id, votes);
    }
    let rival = 0;
    person.votes.forEach((v, id) => {
      if (id !== r.profile!.id) rival = Math.max(rival, v);
    });
    if (PeopleTracker.strong(r) || (votes >= WEAK_VOTES && votes >= rival * 2)) {
      person.profileId = r.profile.id;
      person.name = r.profile.name || r.profile.id;
      person.imageUrl = r.profile.imageUrl;
      person.embedding = q;
      person.bestScore = r.score;
    }
  }

  /**
   * Person for a newly seen face: someone already recognised as its best
   * profile (back after a cut), else the closest unknown, else a new
   * "Unknown" (still tracked separately so lip matching can tell two
   * strangers apart).
   */
  private personFor(q: Float32Array, identifiable: boolean, onScreen: Set<number>): Person {
    if (identifiable) {
      const r = this.rank(q);
      if (PeopleTracker.weak(r)) {
        const known = this.people.find((p) => p.profileId === r.profile!.id && !onScreen.has(p.id));
        if (known) return known;
      }
    }
    let near: Person | null = null;
    let nearSim = 0;
    for (const p of this.people) {
      if (p.profileId !== null) continue;
      const s = dot(q, p.embedding);
      if (s > nearSim) {
        nearSim = s;
        near = p;
      }
    }
    if (near && nearSim >= SAME_PERSON_SIM) return near;
    const p: Person = {
      id: this.people.length,
      profileId: null,
      name: 'Unknown',
      imageUrl: null,
      embedding: q,
      bestScore: -2,
      votes: new Map(),
      closest: null,
    };
    this.people.push(p);
    return p;
  }
}
