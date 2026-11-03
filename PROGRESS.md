# PROGRESS

## Current state
- **starlabs-angular `atc-development`**: last pushed `12821f0b`. Today's work (15 files + 2 new in
  `src/app/shared/`) is **local and uncommitted**. NOT merged into `development` / `production`.
- **starlabs-e2e-tests `main`**: pushed through `54f2701`; today's 2 spec edits are **local**.
- **Flutter (`breakthroughs-flutter` → `Flutter_Projects/Version_3.44.3/Breakthroughs-Achievement`)**:
  4 files + a journal, **local**.
- `ng build` green, `flutter test` 48/48, `flutter analyze` adds no new issues. Operator verified the web and
  the app end to end: slider index saved and labels shown correctly in both.
- The local emulator may still be running (`npm run emu:up` in the hub).

## Last session changes (2026-11-03) — journal `specs/journals/2026-11-03-participant-view-and-slider-contract.md`
- **`participantview` on ATC model forms** — a "Participant can view" checkbox per form row; the participant
  app shows a form only when it is true. Absent reads false (old models expose nothing); a row added in the
  dialog starts true. Covered by hub `journey/atcmodel-forms.spec.ts` AMF-06.
- **ATC model dialog** — the forms list became a labelled grid with a stacked fallback under 760px, and the
  dialog went from a fixed 540px to 920px capped at 95vw. The checkbox had squeezed the form-name column to
  one character per line.
- **Flipping answers now render in both previews** (`form-overlay-view`, `form-template-preview`). They had
  never been rendered at all — zero flipping code in either.
- **Slider contract: a 0-based index into `options`**, both apps, both slider kinds. Web moved to
  `[min]="0"` / `[max]="options.length - 1"` and now shows the option label instead of the number; the
  hardcoded `[max]="10"` on the flipping slider is gone. `sliderPosition` clamps every read in both repos.
  This fixed a `RangeError` that took the app down on the flipping slider and, more quietly, on the last
  option of every plain slider.
- **Time contract: `"HH:mm"`**, 24-hour, zero-padded, converted at each UI boundary (`time-value.ts`;
  `FillForm.dart`). The web had been storing a Timestamp that the app could not read. No migration needed —
  reads accept all four shapes.
- **Failure mid-session**: the fill screens were switched to labels while the previews still showed raw
  indices, so every slider read one apart between a form and its preview. Fixed. A reported app-side `+1`
  turned out to be a stale build.

## Pending
1. **Operator: commit the three repos** (nothing is committed; pushing is a separate, gated step).
2. **Migration — slider answers written before today are 1-based** and display one option high. Needs
   `value - 1` over `formsByClient` + `temporary_forms`, floored at 0, for `slider` fields and each
   `flippingquestion.value` entry. Not idempotent: needs a marker or a one-shot against a snapshot.
3. **`form-based-submission` (B!G) is still 1-based AND stores the option label, not the index** — its
   `onSliderValueChange` writes `options[event.value - 1]`. Deferred (operator, 2026-11-03): the route
   `/formbasedsubmission` is registered but **nothing navigates to it** — in-app links, Cloud Functions and
   the Flutter app all have none, and the B!G board now opens `/formtemplate` instead
   (`participant-assignment-board.component.ts:593,595`). So the live B!G flow is already on the fixed screen.
   Fixing it needs three changes, not two (min, max, and both handler bodies). Revisit with B!G work.
   Related trap: `form-assignment.component.ts:478-480` still has the same label-writing
   `onSliderValueChange`, harmless only because its template call is commented out at `:236` — delete it.
4. ~~Hub slider assertions~~ **done** — `expectAllAnswers` now returns the label and resolves the saved index
   through the answer's own `options`; the two flipping assertions (`> 1`, written for the old 1-10 scale) were
   also wrong against a 2-option seed and now check the index names a real option. Compiles, 17 tests listed.
5. **The ATC suite still has not run locally.** The overlay (`ci/setup-emulator-config.sh`, which overwrites the
   untracked `environment.ts` / `environment.development.ts` — back them up) fixed the wiring: traffic reached
   `localhost:8080` / `starlabs-cicd`, no real-DB hits. It then failed on CORS because **a running Flutter app
   (process `Runner`, GCDWebServer) binds `[::1]:8080` while the Firestore emulator binds only `127.0.0.1:8080`,
   and `localhost` resolves to `::1` first** — so the browser talked to the app, not the emulator. Stop the
   simulator app before running, or point the emulator host at `127.0.0.1`. Env files were restored (checksums
   verified).
6. **Required sliders** — Flutter auto-answers on render; the web's flipping slider never evaluates
   `required`; neither can select the first option without moving away and back.
7. Carried over: `atc-development` is not on a deploy branch, so the appointment prefill is still unreleased.
