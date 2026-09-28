# 2026-07-05 — DFN-on choppiness: adversarial audit kills four hypotheses; two suspects remain

**Context:** Monitor-tab listening test (sender `/joinlivekit`, listener `/monitorliveassignment`,
same M1 Mac). Results: S1 DFN-off clean; S2 DFN-on choppy; S3 gate-off SAME as S2 (**gate
exonerated**); S4/S5 prod build slightly cleaner but still choppy (**dev build not the sole
cause**). Settings during test: atten 80, normalize **2.0×** (user-raised; default 1.2), gate −45.

## Method
4-hypothesis multi-agent audit, each investigated against the real code, then adversarially
refuted by independent verifiers (run wf_f32ec2a9-fac, ~366k tokens, 6 agents). Full structured
findings in the workflow output; key numbers below.

## Verdicts (all four REFUTED)
1. **Limiter pumping at 2.0× normalize — REFUTED.** dB math: limiter (−1 dBFS, knee 0, 20:1)
   engages only above −7 dBFS pre-gain peaks at 2.0×; post-DFN speech peaks ≈ −12…−6 dBFS →
   ≤ ~1 dB GR occasionally, at/below audibility. At 1.2× it never engages. Real effect of 2.0×:
   +4.4 dB loudness makes underlying artifacts more audible.
2. **Worklet output-ring zero-margin (my leading theory) — REFUTED by both verifiers.** The ring
   arithmetic is synchronous and deterministic: input write, frame inference, and drain all run in
   the SAME process() callback, so a GC/CPU stall delays them together — the ring cannot desync.
   Exact simulation: exactly 1 warm-up underrun (callback 7), zero forever after (1M callbacks).
   Post-warmup `underruns` cannot increment via this mechanism. The planned "output priming"
   patch was therefore NOT applied. (Surviving hardening note: the `!input` early-return path
   emits unlogged silence; no demonstrated trigger.)
3. **Monitor-tab listening path — REFUTED.** Bare `<audio autoplay>` + default NetEq; on this
   pristine transport (0% loss, ~3 ms jitter) a jitter buffer would change nothing. S1 clean
   through the same monitor is the falsifier. Receive path is DFN-agnostic (same track SID).
4. **Main-thread → audio-thread starvation — REFUTED.** Sender main-thread wake-ups ≈ 12/s
   (≤5% of a core even in dev); AudioWorklet runs on a dedicated RT thread. Prod removing dev CD
   cost yet staying choppy contradicts the mechanism.

## What survived — the two live suspects
- **A. Audio-thread GC pauses from per-frame wasm-bindgen allocations:** the glue allocates
  ~100×/s ON the audio rendering thread (`passArrayF32ToWasm0` → `__wbindgen_malloc` + fresh
  `Float32Array` per `df_process_frame` return, ~200 KB/s garbage in the worklet isolate).
  DFN-only, build/gate-independent → matches the symptom matrix. Fix if confirmed: eliminate
  per-frame allocs in the glue (pre-allocated buffers) or move inference off the audio thread.
- **B. The model's own documented gain modulation:** reference HANDOFF.md admits an UNRESOLVED
  "audio level drops every few seconds" open thread + "a residual ~3 dB model gain-modulation
  remains regardless (atten_lim does NOT tame it — verified)". I.e. **the reference itself ships
  this artifact** — "reference = clean" was never fully true on real hardware; 2.0× normalize
  raises its audibility.

## The decisive discriminator (built-in, zero code change)
Live worklet telemetry: `__lk.dfnProc.processor.lastStats` (`{calls, underruns, framesOut}`,
posted every 48 callbacks ≈128 ms). `__lk` attaches on any build with `?diag=1` on the URL
(component ~line 477; both env files ship production:true so the URL flag is the reliable path).
- Healthy: calls/s ≈ 375, underruns flat (expect exactly 1 warm-up count).
- calls/s sags or underruns climb while chop is audible → suspect A confirmed (audio-thread stalls).
- Counters healthy while chop audible → signal-borne → suspect B (model modulation, amplified by
  2.0×) → validate with Normalize OFF (1.0×) and atten 50 listening tests + second-device listener.

## Session state (uncommitted, per operator instruction)
firebase.json COEP credentialless for /joinlivekit; livekit-client 2.19.1 + v2 API migration
(join-livekit-call, join-openvidu-call, monitor-liveassignment, adaptive-quality); dtx:false/red:true
(from 2026-06-20). Vendored DFN untouched (byte-parity with reference preserved).

---

## ADDENDUM (same day, later): ROOT CAUSE PROVEN — the model itself squelches speech

Pre-network dual recordings (raw mic tap + DFN processedTrack tap, same clock) analyzed offline:

**Take 1 (16-bit):** 14.1% of active-speech time hard-suppressed >30 dB; events 10–443 ms
(frame-quantized); raw mic continuous at −22…−27 dB during every mute. 16-bit floor left
"model-at-limit (−105 dB)" vs "true silence" ambiguous.

**Take 2 (float32 — decisive):** inside every mute, **0.0% exact-zero samples** — all small
nonzero residuals (−56…−167 dB), i.e. the WASM model's own output, NOT inserted silence.
Only exact-zero run: one single 480-sample frame (warm-up). Relative suppression during
mutes ≈ −70…−80 dB = the attenuation limit (slider 80). Raw peaked 1.0 (clipped) in take 2
and sounded subjectively worse — clipping into the model aggravates misclassification.

**Conclusion:** DeepFilterNet3 (streaming wasm) misclassifies stretches of this voice/mic as
noise and applies (near-)full attenuation → syllables/words deleted → "choppy". All plumbing
exonerated (underruns 0, calls/s ≈375, no context stalls, gate/build/NS-cascade/normalize
independent). The byte-identical reference engine must behave the same — its HANDOFF's
unresolved "audio level drops every few seconds" is this artifact. Neither app's port is
"wrong"; the engine is the ceiling.

**Mitigations (product decision, pending operator ear-test):** attenuation cap ~25–35 so
errors duck instead of delete (T-test at 50 was still inaudible-drop; 25–30 is the survival
zone); keep normalize ≤1.2; prevent mic clipping into DFN; alternatives = Chrome-native
voiceIsolation path (current DFN-off branch) or Krisp-class NR (requires LiveKit Cloud).
Harness: float32 dual-record snippet + scratchpad/analyze_chop.py.
