# 2026-06-11 — Mobile real-forms e2e: 6/9 green + the uP! Life Report blocker

## Goal
Drive each of the 9 queue variations through its participant journey on the REAL Flutter app using the
REAL end-user delivery forms (verbatim prod templates), with imaging proof. Audit screenshots, fix, iterate.

## Outcome this session
- **6/9 variations green end-to-end with the REAL forms** (render → validate → submit → token advances):
  LYL-First Cycle, Prodigies-Next, Prodigies-First, uP!-First, uP!-3rd, uP!-Prep-Hold.
- **3/9 blocked** (LYL-Next, B!G-Next, uP!-Next) — all route through the **uP! Life Report** form.
- Resilient per-variation loop (`/tmp/rfpass-*` markers) survives laptop-sleep kills; relaunch resumes.

## The uP! Life Report saga — WHY each fix landed
uP! Life Report is the hardest real form: 28 fields, 2 audio podcast-players, 4 arrays, **47 nested
Scrollables**, a required "Date of birth". Each layer was a real, distinct bug:

1. **12-min SIGKILL (`exit null`)** — `completeForm`'s date branch `continue`d without scrolling, looping
   in place. → always-scroll; cap date attempts. Turned the hang into a fast clean failure.
2. **Scroll swallowed** — a point-drag (`dragFrom`) is consumed by a nested array/audio Scrollable, so the
   main `CustomScrollView` never moved (Preview never built). → `_jumpScrollablesDown` jumps the
   ScrollPosition programmatically (no gesture to swallow); also avoids touching the audio widgets.
3. **Date never filled → invalid form** — the `DateTimeField` picker does NOT open under `tester.tap`
   (`dialogs=0`). → **pre-seed the date as a Firestore `Timestamp`** (like every other required field).
   This required a **real product bug fix**: `FillForm.dart:1496` crashed formatting a `Timestamp` in the
   field hint (didn't convert to DateTime, unlike the draft-load (307) + submission-preview (2449) paths).
   Reloading ANY saved form with a date would crash for a real user. Now fixed. → `Form valid: true`.
4. **Preview button not activatable (UNRESOLVED)** — the button is **enabled** (screenshot shows "Preview",
   not "Preview…") and **on-screen** (`rect 20,746→382,794` in a 402×874 viewport) and **in the hit-test
   path** (its own `RenderPhysicalShape`/`_RenderInkFeatures`), yet **60 real taps (centre + edges) never
   fired `onPressed`** (no `PREVIEW CLICK START`). A gesture-arena issue specific to this 47-scrollable form
   (hop 0's short form taps fine). A direct `onPressed` **invoke** DOES fire it (form submits, formsByClient
   written) but **skips the queue advance**: the advance is `formaction.then((path) => moveQueueStage())`
   in `queueControl.dart:222`, triggered by `submitform`'s `Navigator.pop(context, path)` — the invoke
   disrupts that pop chain, so the token never advances.

## Key product/architecture facts learned
- Form submit does NOT advance the token directly. `submitform` (FillForm.dart:2180) writes the submission
  then `Navigator.pop(context, path)`; the queue caller (`queueControl.dart:207 case "form"`) does
  `formaction.then((path){ if (selfmovable) appService.moveQueueStage(formref: doc(path)); })`.
- `moveQueueStage` (AppServices.dart:1261) advances by `queuestages[indexOf(currentstage)+1]` from in-memory
  `queueDeliveryData` — NOT the Firestore token.
- uP! Life Report stageproperty is `selfmovable:true, actiontype:"form"` — identical to the working
  Accelerated Evolution Level Form. So the stage SHOULD self-advance; the blocker is purely UI activation.
- `prefill()` seeds enforced-required (text/paragraph/radio/dropdown/array-row) so the real form validates;
  audio/video/array/label are unenforced (FillForm fieldValidationCheck).

## Pending decision (operator)
How to complete the 3 uP!-Life-Report variations:
- **(A) Board-advance fallback** — real form submit (via invoke; real formsByClient write) + advance the
  token via the REAL operator board (anti-circular). Completes 9/9; keeps the form fully tested; the advance
  becomes operator-driven for this one stage.
- **(B) Keep digging the self-advance** — more sim runs to crack the gesture-arena issue (uncertain).
- **(C) Accept 6/9 + document** — ship the 6 fully-real variations; revisit uP! Life Report later.

## Committed
- flutter: `robot.dart` (programmatic scroll, `_scrollUntilHittable`, enabled-retry `_activateButton`),
  `FillForm.dart` (Timestamp date-hint fix).
- angular: `seed-real-forms.cjs` (pre-seed dates as Timestamp).
