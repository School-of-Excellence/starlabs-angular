# 2026-11-01 — Live video subtitles: the right speaker on multi-camera videos

## What was asked
Run the 15-minute multi-cam video (ANTANO WITH FIRST TIME PARTICIPANTS, a 2×2 split screen: two stage
cameras on top, two audience cameras below), check face detection finds the right speaker, make it
better, test end to end, show evidence.

## What we found (baseline, real app in Chrome, real models)
- **62.7%** of the presenter's lines named him; **33.8%** named an audience member (86 different
  names). Minutes 15–30: 71.1%.
- Cause 1 — detection: the worker kept the 4 largest faces in the WHOLE frame. In a split screen the
  audience cameras' close faces win; the presenter on the wide stage camera is too small, and the
  same person appears in two cameras at once.
- Cause 2 — choice: "whose lips moved most" across a crowd always finds someone (laughing, chewing).
  The presenter is often side-on (lips unreadable), so a listener wins. Measured: talking presenter
  median lip activity 0.117, the median listener 0.017, but the crowd's top outlier beats him.

## What changed and WHY each constraint
1. **Split screen recognised from the picture** (`face-analyser.ts`): edges down and across the middle
   are 8–21× a usual line on the multi-cam video, under 2.5× on a single camera (DAY-05). Threshold 5×,
   majority of 5 frames spread through the file. Only 2×2 — a one-axis rule would misfire on a
   static camera with a pillar in the middle. Single-camera videos take the old path unchanged
   (`mainTally` stays null; verified on DAY-05: 0/5 votes).
2. **Faces per camera** (`face.worker.ts`): detect inside each pane (native 640×360, sharper), 3 faces
   per pane, the 10%-height rule per pane. Face Mesh crops are kept inside their pane (it reads ONE
   face and could take the neighbour camera's).
3. **One person, several cameras** (`speakers.ts`): box tracking only within a pane; lip movement
   compared only between samples of the same pane (two cameras at different openness is not a moving
   mouth); recognised tracks joined by profile (`canonical`).
4. **Main speaker** (`MainSpeakerTally`): the person on camera most. Crews stay on the presenter
   while audience shots keep changing. 20 frames sampled across the whole file on load count for the
   whole video (they don't fade) — minutes 15–30 open with him at a board, back turned, while one
   audience member sits in shot for a minute; with fading-only presence that person became "main".
   Counted per track and joined at query time, because a face seen before it was recognised belongs to
   that person once it is. Sticky until someone else clearly leads (1.5×).
5. **Taking the floor**: the main speaker keeps the line unless someone else's lips clearly move
   (≥0.06, 2+ pairs) AND either his lips are seen still, or two cameras are on that person at once
   (crews follow whoever has the floor; cut-aways rarely land on one person twice). A line at the
   presenter's usual level needs BOTH; a line 8 dB+ under it (off his mic) needs one. The answer is
   the same for any gap from 6 to 10 dB.
6. **Speed**: the identity model ran on every frontal face every frame; recognised tracks now skip it
   (218 → 81–92 ms). Per frame ~420–530 ms against an 800 ms budget at 1×. At 1.3× playback (600 ms)
   faces fell behind and skipped stretches never got names — the margin matters on slower machines.

## Evidence (real app, Chrome, 1× playback, frozen code)
Label (not from the app): only the presenter's mic reaches this soundtrack, so a line is his when it
has 3+ words at on-mic level (peak ≥ −24 dBFS). Two lines hand-corrected after checking frames.
| Video | Before | After |
|---|---|---|
| min 0–15 (tuned on) | 62.7% | **99.1%** (223/225) |
| min 15–30 (exposed cause in step 4) | 71.1% | **92.6%** (187/202) |
| min 30–45 (never tuned on) | — | **95.3%** (222/233) |

Floor control (the "always the presenter" control would fail): 197–218 s, the man holding the floor
mic is picked in 5 of 6 windows (the 6th: the man beside him); 741–748 s of min 15–30, the participant
Antano just told to "speak in the mic" is picked.

Tests: `speakers.unit.spec.ts` (19, in the unit gate) incl. LVS-U-10 replaying the real run's lip
measurements (`speakers.multicam.fixture.ts`, numbers only — no names, faces or boxes). Mutation check:
"always main" fails 3, "ignore main" fails 6. End-to-end proof is the real-app runs above (file input →
playback → what the screen showed); no Playwright suite (operator decision 2026-11-02). All 11 misses on
min 30–45 are one exchange with a participant on a mic (649–692 s); some of those lines may be hers, so
the level-based label may be what's wrong there — not relabelled.

## What surprised us
- Participants' voices barely reach this recording (boosted 30×, Whisper still heard almost nothing),
  so transcribed lines are ~all the presenter. A label set without a floor control would reward
  "always him".
- A pre-existing TS quirk in channeltemplates (`string[] | never[]`) surfaced from unrelated changes
  shifting check order — fixed with `(m: string)`.
- ng serve keeps serving the last good bundle after a build error — a `const px` clash in the worker
  (not covered by `tsc -p tsconfig.app.json`) looked like "my change does nothing".

## Pending
- Fast back-and-forth with a participant on a mic is the weakest case.
- Faces skipped when playback outruns analysis are never filled in afterwards.
- Only 2×2 layouts; one event's footage, one presenter.
