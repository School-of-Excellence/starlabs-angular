# Live video subtitles (web) — plan

**Status:** draft for approval · **Date:** 2026-10-16

## Goal

Upload a video and play it with **subtitles (who said what) worked out in the
browser while it plays** — the same feature as the AH-CRM mobile app's
"Play video: live faces + subtitles", rebuilt for laptops/desktops where the
browser (WebGPU) can run larger, more accurate models. Nothing is uploaded to
a server and nothing is saved: the file and all results stay in the page.

**In scope now:** upload from the computer only (no Dropbox link).

## Where it lives

- Folder: `src/app/live-video-subtitles/`
- Standalone component: `LiveVideoSubtitlesComponent`
  (`live-video-subtitles.component.{ts,html,css}`)
- Route: `livevideosubtitles` (lazy `loadComponent`, `canActivate: [authGuard]`),
  same style as the other routes in `app.routes.ts`
- Workers: `speech.worker.ts` (Whisper). Web-worker build support is added to
  `angular.json` (`webWorkerTsConfig` + `tsconfig.worker.json`).

## How it works

### 1. Subtitles (phase 1 — accuracy first)

- **Audio:** the uploaded file is decoded once in the page (Web Audio
  `decodeAudioData` → 16 kHz mono). Whisper always hears the **original**
  soundtrack: on the mobile app, noise removal before Whisper raised word
  errors from 34.5% → 48% (and → 55% with an extra filter chain), measured on
  a real 15-min hall recording.
- **Model:** Whisper via `@huggingface/transformers` (ONNX Runtime Web) in a
  Web Worker, on **WebGPU** when available, WASM otherwise.
  - "High accuracy" (default with WebGPU): `whisper-large-v3-turbo` — best in
    the mobile-app evaluation (it was the reference transcript).
  - Standard / no-WebGPU fallback: `whisper-small` (≈30% word errors on the
    same audio; base was 34.5%).
  - Models download from Hugging Face on first use and are cached by the
    browser.
- **Live:** 30-second chunks are transcribed ahead of the playhead (Whisper
  encodes 30 s regardless, so 30 s chunks are the cheapest). If speech falls
  behind, the video waits ("Analysing ahead…") rather than showing lines with
  no caption. Language picker (English default; Auto + Indian languages).
- **Captions:** short phrases (long segments split at sentence/comma
  boundaries, ≤ ~4 s), timed to the voice; transcript list below the video.

### 2. Names (phase 2 — off by default, a switch like the app)

- **Faces/lips:** MediaPipe Tasks `FaceLandmarker` (GPU) on the playing
  video frames — 478 landmarks per face; lip opening from the inner-lip
  points; head turn from the landmarks (side-on faces > 45° are not
  lip-read or identified — they caused false names on mobile).
- **Identity:** ArcFace MobileFaceNet (same ONNX model as the app) on aligned
  112×112 crops, matched against the existing Firestore `face_detection`
  vectors (`profileimg_mbf` / `profile_mbf`), loaded in pages of 100.
  Match bar **0.42 + 0.04 lead over the runner-up** (0.35/0.38 produced a
  false "Mark" on the test video).
- **Who is talking:** port of the app's rules — the face whose lips move most
  (back-to-back samples only); a still visible face is a listener (no name);
  one side-on face left when everyone visible is silent = speaker; name fixed
  once per caption; turn continuity when evidence is weak. Only the speaker
  gets a box.

### 3. Later (not in this pass)

- "Remove background noise" for playback (RNNoise in an AudioWorklet; off by
  default — the viewer hears the original sound).
- "Analyse whole video" + voice matching (WeSpeaker) for people facing away.
- Dropbox links.

## Constraints

- Browser-only APIs (WebGPU, Workers, MediaPipe, Web Audio) are guarded with
  `isPlatformBrowser` (the app has server rendering).
- No ATC collections are read or written. Reads `face_detection` only
  (read-only).
- Cross-origin isolation is already on (COOP + `coi-serviceworker.js`), so
  multi-threaded WASM works as the fallback.
- `data-testid` hooks with one literal prefix (`lvs-…`); e2e coverage
  (starlabs-e2e-tests) is a separate step before any push.

## Verification

- `ng build` passes.
- Run the dev server, open `/livevideosubtitles`, upload the AH-CRM test clip,
  check: captions appear in time, model + speed shown in a diagnostics panel,
  and (phase 2) names on frontal speakers match the mobile results.

## New dependencies

`@huggingface/transformers`, `@mediapipe/tasks-vision` (ONNX Runtime Web comes
with transformers).
