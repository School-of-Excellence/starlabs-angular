# 2026-07-22 — CHANGEWORK BRIEF audio/image fixes (Prescribe & Edit ATC)

## What was reported
- **Prescribe ATC**: recorded audio uploads but won't play; uploading an audio file throws
  `createObjectURL … Overload resolution failed` (stack → `processRecording` ← `audioUpload`).
- **Edit ATC**: both recorded and uploaded audio won't play; uploaded image preview is broken.

## Root causes (four distinct, all template/wiring — not the Storage/service-worker issue in HANDOVER.md)
1. **Upload-audio crash (Prescribe).** `(change)="audioUpload(input.value)"` passed the file-path
   **string** instead of the FileList. `audioUpload` looped its characters → `URL.createObjectURL('C')`.
   Edit already used `.files`.
2. **Audio not playing / player disabled (both).** The player bound `[src]="sanitize(audio)"`, i.e. a
   `SafeUrl` object from `bypassSecurityTrustUrl`. In Angular 19's security schema **`audio|src` and
   `source|src` are NOT registered URL-sanitization contexts** (only `img|src` and `video|src` are), so
   Angular does **not** unwrap the `SafeUrl` — the element's `src` becomes the object's toString
   (`"SafeValue must use [property]=binding…"`), a broken URL → disabled player. This was true on the
   old child `<source>` too. Fix: bind the **raw** URL (`[src]="audio"`), exactly like the working
   read-only view screens; `audio|src` isn't sanitized, so the raw `blob:`/`https:` string is set as-is
   and plays. (First attempt moved the binding onto `<audio>` but kept `sanitize()`, which still handed
   it a `SafeUrl` → still disabled; corrected by dropping `sanitize()`.)
3. **Edit image preview broken.** Three inputs (audio, note-images, ATC-images) shared the **same
   template ref `#fileInput`**; each `(change)` read `fileInput.files`, which resolved to the wrong
   (empty) input → no data URL → broken preview. Prescribe dodged this by passing `$event`.

## Fixes (4 edits, templates + 1 handler arg; no service/shared code, no signatures changed)
- `prescribe-atc.component.html:468` — `audioUpload(input.value)` → `audioUpload(input.files)`.
- `prescribe-atc.component.html:454` & `edit-atc.component.html:415` — bound the raw URL directly on the
  `<audio>` element (`[src]="audio"`); removed the child `<source type="audio/wav">` and the `sanitize()`
  wrapper. The `sanitize()` method is left in place (unused by these bindings) in case other code needs it.
- `edit-atc.component.html` — unique refs: audio input now uses existing `#file` (`audioUpload(file.files)`);
  note-images `#noteFileInput`; ATC-images `#atcFileInput`.

## Out of scope (untouched)
Media loaded **from Storage URLs** needing a hot-reload to appear — the separate service-worker /
offline-persistence lead in `HANDOVER.md`. Not addressed here.

## Verification: handed to the user (Claude does not run/build/test ATC).
