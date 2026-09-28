# 2026-07-06 — DFN-on choppy voice: SOLVED (Chrome NS/AGC pre-gating) + fix + validation

> **Supersedes the 2026-07-05 journal's conclusion.** That entry concluded "the DFN engine is the
> ceiling / the model deletes speech." **That was WRONG.** The real cause and the fix are below.
> Status: **fix applied, validated by ear, UNCOMMITTED** (operator will decide when to commit).

## The problem
In the LiveKit call (`join-livekit-call.component.ts`), turning the DeepFilterNet3 (DFN) noise
filter ON made the speaker's voice **choppy / intermittent** — words and syllables dropping out.
DFN OFF was always clean. Operator insisted the React reference app was clean while the Angular app
was choppy, with the byte-identical engine.

## The real root cause (PROVEN)
**The app fed DFN audio that Chrome had already noise-suppressed + AGC'd. That double
noise-processing is what broke it.**

- The mic was captured with Chrome's `noiseSuppression` + `echoCancellation` + `autoGainControl`
  **ON** (`setMicrophoneEnabled(true, {ns:true, ec:true, agc:true})`), and the DFN-on path only set
  `voiceIsolation:false` — it left NS/AGC/EC on. So DFN never saw raw audio; it saw Chrome's
  **pre-gated** output.
- Chrome's NS aggressively **gates** the signal (measured on the live DFN input: **12% of frames
  gated to near-silence, 196 dB quiet-spread**, plus AGC boost). DFN, a streaming model expecting a
  raw mic, chokes on that pre-gated/boosted signal and deletes speech → "choppy."
- The code comment even *claimed* it kept the input raw ("so we don't double-process") — but the
  constraints didn't actually do it. That mismatch was the bug.

## How we proved it (the method that finally worked)
1. **Oracle by ear, not by metric.** Recorded a clean RAW mic file (`recorder.html`, NS/EC/AGC off,
   peak 0.18) and ran it through the offline DFN engine → **clean, no choppiness** (operator
   confirmed by ear). So DFN on raw input is fine. *Lesson: the earlier "% speech deleted" metric
   over-counted — on noisy raw input it scores DFN's correct noise-suppression as "deleted speech."
   Always ear-test the DFN output WAV; don't trust the deletion %.*
2. **Byte-parity of the engine.** md5: reference & Angular DFN **wasm + model + worklet-DSP are
   byte-identical**; only a non-audio model-loader (`ensureGzippedModel`) differs. So the app/engine
   code is NOT the differentiator. See [[dfn-package-parity-proven]].
3. **Live capture (`_v1`).** Tapped the live Angular DFN `originalTrack` (input) + `processedTrack`
   (output): **clean input, choppy output**. Then ran that *exact live input* through the offline
   engine → the live worklet output and offline output diverge only **0.3%**. So the **live
   path/worklet is faithful** — the chop is entirely determined by the input.
4. **Input profiling.** Raw oracle input: steady floor, 0% frames <−50 dB, 26 dB spread. Live
   input: **12% frames <−50 dB, 196 dB spread, AGC-boosted** = the Chrome NS/AGC fingerprint. That
   is the only difference between the clean case and the choppy case.

## The fix (applied, uncommitted)
`join-livekit-call.component.ts`:
- **`setMicrophoneEnabled`** (~L463): capture with `noiseSuppression / echoCancellation /
  autoGainControl = !dfnEnabled` → **raw when DFN is ON**, Chrome processing only on the DFN-OFF
  bare-mic path. Must be set at CAPTURE — Chrome ignores these via `applyConstraints` on a live track.
- **`applyDfnProcessor`** constraint branch (~L664): DFN-on now `{ec:false, ns:false, agc:false,
  voiceIsolation:false}` (was `{voiceIsolation:false}` only) to keep the toggle coherent.
- Deviates from the reference in exactly one place (reference leaves NS/AGC on) — deliberate, because
  our measurements proved that's the defect. Raw input can only be cleaner. Compiles clean.

## Validation (by ear)
- **`_v2`**: DFN input now raw (no gating), DFN output — **choppiness GONE**, voice clear, noise still
  well-suppressed. Live output == offline output (same file, model-deterministic).
- **`_v3` (30 s real-usage)**: silent 3 s then speak → **no choppiness, no noticeable wobble.**
  Operator accepted: "good for now, no noticeable incident." **LOCKED.**

## Residual: DFN warm-up wobble (characterized, ACCEPTED, not fixed)
A subtle "wobble" in the first ~1.5 s of DFN output that settles by ~3 s. **Content-controlled loop
test** (same 1.5 s speech looped 5×, so any per-loop difference = pure model warm-up):

| loop (identical input) | mean gain | wobble(std) |
|---|---|---|
| 1 (cold) | −10.6 dB (over-suppress) | 25.2 dB |
| 2 | −3.6 dB | 12.6 dB |
| 4–5 (warmed) | −3.0 dB | 10.6 dB |

Loop-1 vs loop-5 gain on identical samples differs **7.8 dB avg / 71 dB peak** → definitive warm-up.
**Inherent to DFN3's streaming design** (neural state + noise estimate converging), not our code.
Silence pre-warms but SLOWLY (3 s silence → −4.9 dB / 14.4 dB, still not fully converged; speech
warms faster). In practice the natural join→greet gap hides it. **Accepted for now.** If it ever
surfaces in production → **Option A**: run DFN on the incoming mic for ~1.5–2 s with the published
track muted at attach, then unmute (pre-warm before going live).

## Session state (uncommitted)
This fix + prior session work all uncommitted per operator: the raw-capture DFN fix (this journal);
`firebase.json` COEP credentialless for `/joinlivekit`; `livekit-client` 2.19.1 + v2 API migration;
`dtx:false`/`red:true`. Vendored DFN untouched (byte-parity preserved).

## Test harness (for future sessions)
- `recorder.html` (served on 127.0.0.1:8765) — captures RAW mic (NS/EC/AGC off) → the oracle input.
- Live dual-track console snippet — taps `__lk.dfnProc.originalTrack` + `.processedTrack` (needs
  `?diag=1` on the URL to expose `__lk` on prod builds).
- Offline reproduction: decode the worklet's `df_process_frame` glue (`worklet-node.cjs`), run the
  raw WAV frame-by-frame — reproduces the live output within 0.3%.
- All WAVs in `test-audio/` (git-ignored); this campaign in `test-audio/DFN Testing/`.

## Methodology lessons (don't repeat the detours)
- **Ear-test DFN output WAVs. The deletion-% metric lies on noisy input.** This one flipped the whole
  conclusion.
- **Isolate with identical input.** The oracle (fixed raw file) + offline reproduction removed the
  "different voice each test" confound that produced weeks of contradictory results.
- **Byte-parity first** to rule the app in/out before chasing the network/server/build.
