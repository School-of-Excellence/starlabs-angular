// speakers.unit.spec.ts — unit tests for who gets named on a multi-camera (split-screen) video.
//
// WHY UNIT: pickSpeaker and the tally are pure, and the real proof (a 15-minute video through the real face
// models in a real browser) is far too heavy for the gate. These pin the rules that proof established, so a
// threshold change can't quietly bring back what it found: audience mouths taking the presenter's lines.
//
// LVS-U-10 replays a REAL run: the per-frame lip measurements the face models produced on the multi-cam test
// video, with names replaced by numbers (speakers.multicam.fixture.ts). Its labels did not come from the app:
// a line is the presenter's when it has 3+ words at on-mic level, since only his mic reaches that soundtrack.
import { multicamFixture } from './speakers.multicam.fixture';
import { FaceSample, MainSpeakerTally, PeopleTracker, isQuietLine, peakLevel, pickSpeaker } from './speakers';

const seg = { startMs: 1000, endMs: 4000, text: 'a line' };
const PRESENTER = 1;
const LISTENER = 2;

/** One person's mouth readings on one camera, 800 ms apart (null = side-on, unreadable). */
function seen(personId: number, pane: number, mouths: (number | null)[], area = 5000): FaceSample[] {
  return mouths.map((mouth, i) => ({ timeMs: 1000 + i * 800, personId, area, mouth, pane }));
}
const TALKING = [0.05, 0.25, 0.05, 0.3];
const STILL = [0.05, 0.051, 0.05, 0.052];
const SIDE_ON = [null, null, null, null];

describe('multi-camera speaker', () => {
  it('LVS-U-01 a listener whose mouth moves does not take a side-on presenter\'s line', () => {
    const p = pickSpeaker(seg, [...seen(PRESENTER, 1, SIDE_ON), ...seen(LISTENER, 2, TALKING)], null, PRESENTER);
    expect(p.personId).toBe(PRESENTER);
    expect(p.basis).toBe('mainSpeaker');
  });

  it('LVS-U-02 the presenter talking is read as lips, whoever else moves', () => {
    const p = pickSpeaker(seg, [...seen(PRESENTER, 1, TALKING), ...seen(LISTENER, 2, [0.05, 0.4, 0.05, 0.4])], null, PRESENTER);
    expect(p.personId).toBe(PRESENTER);
    expect(p.basis).toBe('lipMovement');
  });

  it('LVS-U-03 a quiet line goes to the person two cameras are on, lips moving (the floor mic)', () => {
    const asker = [...seen(LISTENER, 2, TALKING), ...seen(LISTENER, 3, TALKING)];
    const p = pickSpeaker(seg, [...seen(PRESENTER, 1, SIDE_ON), ...asker], null, PRESENTER, true);
    expect(p.personId).toBe(LISTENER);
  });

  it('LVS-U-04 a line at the presenter\'s level stays his, even with two cameras on a moving mouth', () => {
    const asker = [...seen(LISTENER, 2, TALKING), ...seen(LISTENER, 3, TALKING)];
    const p = pickSpeaker(seg, [...seen(PRESENTER, 1, SIDE_ON), ...asker], null, PRESENTER, false);
    expect(p.personId).toBe(PRESENTER);
  });

  it('LVS-U-05 at that level the floor still changes if his lips are seen still', () => {
    const asker = [...seen(LISTENER, 2, TALKING), ...seen(LISTENER, 3, TALKING)];
    const p = pickSpeaker(seg, [...seen(PRESENTER, 1, STILL), ...asker], null, PRESENTER, false);
    expect(p.personId).toBe(LISTENER);
  });

  it('LVS-U-06 a quiet line needs more than one camera while his lips are unreadable', () => {
    const p = pickSpeaker(seg, [...seen(PRESENTER, 1, SIDE_ON), ...seen(LISTENER, 2, TALKING)], null, PRESENTER, true);
    expect(p.personId).toBe(PRESENTER);
  });

  it('LVS-U-07 one person in two cameras at different openness is not a moving mouth', () => {
    const a = seen(LISTENER, 2, [0.05, 0.05, 0.05, 0.05]);
    const b = seen(LISTENER, 3, [0.3, 0.3, 0.3, 0.3]);
    const p = pickSpeaker(seg, [...a, ...b], null);
    expect(p.activity.get(LISTENER)!).toBeLessThan(0.01);
  });

  it('LVS-U-08 between cameras the turn goes on', () => {
    const p = pickSpeaker(seg, seen(LISTENER, 2, TALKING), PRESENTER, PRESENTER);
    expect(p.personId).toBe(PRESENTER);
    expect(p.basis).toBe('continuing');
  });

  it('LVS-U-09 with no main speaker (one camera) the lips rule is unchanged', () => {
    const p = pickSpeaker(seg, [...seen(PRESENTER, 0, STILL), ...seen(LISTENER, 0, TALKING)], null);
    expect(p.personId).toBe(LISTENER);
    expect(p.basis).toBe('lipMovement');
    // ...and visible faces with still lips still name nobody, rather than a listener.
    expect(pickSpeaker(seg, seen(LISTENER, 0, STILL), null).personId).toBeNull();
  });

  it('LVS-U-10 replay of the real multi-cam run names the presenter and finds the floor', () => {
    const { frames, lines, probes, presenter, floor } = multicamFixture;
    const samplesFor = (s: number, e: number): FaceSample[] =>
      frames
        .filter((f) => f.t >= s - 500 && f.t <= e + 500)
        .flatMap((f) => f.faces.map((x) => ({ timeMs: f.t, personId: x.p, area: x.a, mouth: x.m, pane: x.n })));
    const seedTally = (): MainSpeakerTally => {
      const t = new MainSpeakerTally();
      for (let i = 0; i < 20; i++) t.seed(frames[Math.floor((frames.length * (i + 0.5)) / 20)].faces.map((x) => x.p), 45000);
      return t;
    };
    const tally = seedTally();
    const levels: number[] = [];
    let fi = 0;
    let prev: number | null = null;
    let prevEnd = -1e9;
    let scored = 0;
    let right = 0;
    for (const l of lines) {
      while (fi < frames.length && frames[fi].t <= l.e + 500) tally.see(frames[fi++].faces.map((x) => x.p), 800);
      levels.push(l.db);
      const p = pickSpeaker(
        { startMs: l.s, endMs: l.e, text: '' },
        samplesFor(l.s, l.e),
        l.s - prevEnd < 3000 ? prev : null,
        tally.main(),
        isQuietLine(l.db, levels),
      );
      if (l.scored) {
        scored++;
        if (p.personId === presenter) right++;
      }
      prev = p.personId;
      prevEnd = l.e;
    }
    expect(scored).toBeGreaterThan(200); // the labels are all there
    expect(right / scored).toBeGreaterThan(0.97);
    // The control "always the presenter" would fail: he is quiet here and someone else has the floor.
    let floorRight = 0;
    for (const [s, e] of probes) {
      const t = seedTally();
      for (const f of frames) if (f.t <= e) t.see(f.faces.map((x) => x.p), 800);
      if (pickSpeaker({ startMs: s, endMs: e, text: '' }, samplesFor(s, e), null, t.main(), true).personId === floor) floorRight++;
    }
    expect(floorRight).toBeGreaterThanOrEqual(probes.length - 1);
  });
});

describe('main speaker tally', () => {
  it('LVS-U-11 needs a clear lead, then holds through a long audience shot', () => {
    const t = new MainSpeakerTally();
    expect(t.main()).toBeNull();
    t.see([1, 2], 2000);
    t.see([1, 2], 2000);
    expect(t.main()).toBeNull(); // tied, as on a panel: no main speaker
    for (let i = 0; i < 10; i++) t.see([1], 2000);
    expect(t.main()).toBe(1);
    for (let i = 0; i < 5; i++) t.see([1, 3], 800); // the lead narrows
    expect(t.main()).toBe(1);
  });

  it('LVS-U-18 samples across the whole video outweigh a long audience shot', () => {
    const t = new MainSpeakerTally();
    for (let i = 0; i < 16; i++) t.seed([1], 45000);
    for (let i = 0; i < 4; i++) t.seed([2], 45000);
    expect(t.main()).toBe(1);
    for (let i = 0; i < 300; i++) t.see([2], 800); // 4 minutes of him at a board, back turned
    expect(t.main()).toBe(1);
  });

  it('LVS-U-19 a face seen before it was recognised counts for that person', () => {
    const t = new MainSpeakerTally();
    t.see([5], 3000);
    t.see([6], 3000);
    t.see([7], 2000);
    expect(t.main()).toBeNull();
    // 5 and 6 turn out to be one recognised person.
    expect(t.main((id) => (id === 6 ? 5 : id))).toBe(5);
  });

  it('LVS-U-12 a new presenter takes over as old frames fade', () => {
    const t = new MainSpeakerTally();
    for (let i = 0; i < 100; i++) t.see([1], 800);
    expect(t.main()).toBe(1);
    for (let i = 0; i < 500; i++) t.see([2], 800);
    expect(t.main()).toBe(2);
  });

  it('LVS-U-13 one person in two cameras counts once per frame', () => {
    const t = new MainSpeakerTally();
    for (let i = 0; i < 10; i++) t.see([1, 1, 2], 800);
    expect(t.main()).toBeNull();
  });
});

describe('line level', () => {
  it('LVS-U-14 quiet is well under the usual level, once there are enough lines', () => {
    const usual = [-15, -16, -14, -15, -17];
    expect(isQuietLine(-30, usual)).toBeTrue();
    expect(isQuietLine(-18, usual)).toBeFalse();
    expect(isQuietLine(-30, [-15, -16])).toBeFalse(); // too few lines to know
  });

  it('LVS-U-15 level is the loudest moment, not the average', () => {
    const pcm = new Float32Array(16000 * 3);
    for (let i = 16000; i < 16000 + 3200; i++) pcm[i] = i % 2 ? 0.5 : -0.5;
    expect(peakLevel(pcm, 0, 3000)).toBeCloseTo(-6, 0);
    expect(peakLevel(pcm, 2000, 3000)).toBeLessThan(-80);
  });
});

describe('tracking across cameras', () => {
  const vec = (x: number): Float32Array => {
    const v = new Float32Array(4);
    v[0] = x;
    v[1] = Math.sqrt(1 - x * x);
    return v;
  };
  const profile = { id: 'P1', name: 'Presenter', imageUrl: null, vectors: [vec(1)] };
  const face = (x: number, pane: number) => ({
    box: [x, 10, 50, 50] as [number, number, number, number],
    frontal: true,
    identifiable: true,
    mouth: 0.1,
    pane,
  });

  it('LVS-U-16 one recognised person in two cameras at once is one person', async () => {
    const t = new PeopleTracker([profile], 800);
    const got = await t.track(0, [face(10, 0), face(700, 1)], async (idx) => idx.map(() => vec(1)));
    expect(got.length).toBe(2);
    expect(got.map((f) => t.canonical(f.personId))).toEqual([got[0].personId, got[0].personId]);
    expect(t.people[got[0].personId].name).toBe('Presenter');
  });

  it('LVS-U-17 boxes only track within their own camera', async () => {
    const t = new PeopleTracker([], 800);
    const first = await t.track(0, [face(10, 0)], async () => [vec(1)]);
    // Same pixels, another camera, a different face: a new person, not a continued track.
    const next = await t.track(800, [face(10, 1)], async () => [vec(0)]);
    expect(next[0].personId).not.toBe(first[0].personId);
  });
});
