# Journal — Visual (imaging) audit of the 9-variation mobile e2e screenshots

> Date 2026-06-10. Operator goal: *"audit the screenshots to see — did the workflow actually
> complete for all 9 [variations]. Do 1 path first, then use a dynamic workflow for the rest.
> Use imaging, don't just [trust] the logs. If the testing workflow didn't complete properly,
> make the corrections and iterate till it's complete."*
>
> WHY this exists: the previous session reported `9 passed` + "37 clean PNGs". A green run and a byte
> count are NOT proof the app actually rendered each stage — the prior desktop suite had ~23 blank +
> ~15 circular screenshots (see memory `queue-e2e-evidence-audit`). This audit looks at the PIXELS.

## Method (no log-trust; pixels only)
1. Decoded the embedded Playwright report blob (`<template id="playwrightReportBase64">` → base64 zip →
   `60f5…json`) to map every content-hashed `data/<sha1>.png` back to its `(variation, stage)` label +
   byte size. (The scratch dir `breakthroughs-flutter/mobile-evidence/` is cleared each run, so the
   durable copies live only inside the report.)
2. **Path 1 (LYL – First Cycle) audited by hand** — viewed all 5 stage PNGs with the Read tool.
3. **Remaining 8 variations via a dynamic Workflow** (`mobile-screenshot-visual-audit`, 8 parallel
   agents, one per variation). Each agent had to **transcribe the on-screen stage heading, token, and
   button** off the pixels and decide `isGenuineAppRender` — a blank/white/error/desktop image yields
   no readable heading, so this design defeats rubber-stamping. Structured schema, adversarial prompt
   ("confirm OR REFUTE … be skeptical: if you cannot transcribe a real stage heading, it is NOT genuine").

## Findings — 8 of 9 variations: GENUINE and complete
35 real-app captures, each showing the breakthroughs queue card ("EXCELLENCE INSTALLATION" branding,
token `TEST 30-stage L3rqCr`, the **stage heading transcribed off the pixels matching the expected
stage**, the black "Click to Fill Form" button, Evolve/Legacy/Impact journey circles, bottom nav):

| Variation | shots genuine | notes |
|---|---|---|
| LYL – First Cycle  | 5/5 | hand-viewed; clock advanced 11:29→11:31→11:33 |
| LYL – Next Cycle   | 5/5 | 2 full clean + 3 cropped w/ Fill-Form drawer sliding in |
| B!G – Next Cycle   | 5/5 | incl. the 24-stage in-person/Triple-ATC flow stages |
| Prodigies – Next Cycle  | 3/3 | |
| Prodigies – First Cycle | 2/2 | |
| uP! – First Cycle  | 5/5 | |
| uP! – Next Cycle   | 5/5 | |
| uP! – 3rd Cycle    | 5/5 | |

- The stage headings the agents read off the pixels matched the expected stages exactly (or the
  obvious left/right-cropped substring, e.g. "elerated Evolution Leve" = Accelerated Evolution Level
  Form). Token `TEST 30-stage L3rqCr` consistent across all. No blanks, no errors, no duplicates,
  no desktop-board frames among the per-stage captures.
- A handful of frames had `hasFillFormButton=false` while still genuine — the simctl capture caught
  the Fill-Form drawer already sliding in (covering the button) or a pre-scroll frame. The self-move
  itself is independently proven by the real Firestore trail (token advanced + a `queue stage log`
  row), so this is capture-timing, not a gap.

## Two artifacts the imaging exposed (logs would never show these)
- The **47 KB `screenshot`** attached to 8 variations (identical sha across all) is the **operator
  desktop board** (Angular "STARLABS"), all columns "- 0" — a Playwright page-capture, NOT mobile
  evidence. Harmless noise; the real mobile proof is the `<label>-<idx>-<stage>.png` simctl captures.
- **`uP! – Prep Hold`'s only image was a 4 KB blank white page** → that variation had ZERO visual
  proof of the app. (See correction below.)

## Correction — Prep-Hold imaging gap (the one real finding)
`uP! – Prep Hold` (vid `PJQVQf9HU0PxSCIbH5re`, participant 49) is the 0-hop degenerate variation: its
entry **is** its terminal (`uP! Prep Process - Hold`), so there is no self-move to perform. The spec
asserted the parked terminal in Firestore and **returned before ever booting the app** (mobile-walk.spec
old lines 40-43) — hence no mobile capture, and the 4 KB blank was just Playwright's auto page-shot of
an unnavigated browser.

Fix (test harness only — NO app `lib/`/`src/` change; within discipline):
- `robot.dart` — new **`revealQueueCard()`**: scrolls the home until the queue card (`kStageStatusKey`
  / `kQueueActionKey`) is on screen WITHOUT tapping (non-fatal; for terminal stages with no action).
- `walk_test.dart` — new **`selfHops == 0` branch**: boot → reveal the parked card → print the
  `WALK[...] hop 0: at "<stage>"` marker (so the Node poller fires a simctl capture) → hold 6 s →
  assert the token reports a stage. The `selfHops > 0` loop is unchanged (guarded), so the 8 green
  paths are byte-for-byte unaffected.
- `mobile-walk.spec.ts` — the degenerate branch now also `driveFlutterSelfRun(t, 0, …)` +
  `attachMobileScreenshots(…)` after the terminal assertion.

**Result (verified by eye):** the targeted run (`VARIATIONS="uP! - Prep Hold"`) booted the real app for
participant 49 and captured a 628 KB real-app frame — the queue card reading "TEST 30-stage L3rqCr" /
**"uP! Prep Process - Hold"** / "Please wait until your turn is requested…", with a **"View All Stages"**
button (NOT "Click to Fill Form" — correct, a Hold terminal has no form action) and the Evolve/Legacy/
Impact circles + bottom nav. So all 9 variations now have genuine real-app imaging proof.

## Follow-up audit (operator, reviewing the report) — two imaging-coverage gaps
The operator opened a test in the report and asked two pointed questions that the pixels (not the logs)
exposed:

**Q1 — "the shots show 'Click to Fill Form' but I don't see the form after."** Correct, by design: the
harness captured ONE frame per self-move, at the instant *before* the tap (the queue card). The simctl
capture fired only on the `WALK[...] hop N: at "<stage>"` marker; the FillForm screen, the fill, and the
result were never imaged (the in-app `screenshot()` was a no-op; the "after" log line didn't match the
trigger). The form-fill + advance WAS proven — but by the Firestore trail (token `currentstage` change +
`queue stage log` row + the guards), NOT by an image.

**Q2 — "what is the attached `screenshot` verifying?"** Essentially nothing. That attachment is Playwright's
automatic page-shot (`screenshot: 'on'`) of the operator-desktop browser at test teardown — an empty board
(all columns "- 0", byte-identical across variations because an empty board renders the same). It did NOT
prove the operator/auto hops (those are proven by the count-drift assertion + the `movedby` log rows).

### Correction — image the FULL flow (test harness only; no app lib/src change)
- **Mobile, 3 frames per self-move** (`robot.screenshot()` now emits a `CAP marker` the orchestrator
  shoots on, and holds the screen): **(a)** the queue card pre-tap, **(b)** the REAL FillForm screen
  ("TEST Queue Form run1" / Notes field / Preview), **(c)** the card on the advanced stage. The
  `driveFlutterSelfRun` poller keys on `CAP marker:` (was the single before-tap `WALK` marker).
- **Board, per operator hop:** `driveBoardHop` now captures the participant's REAL card on the REAL
  board at the hop's source stage (`queue-board.page.captureTokenCardShot` reveals the card past the
  15-row "Load More" cap, scrolls it in, viewport-shoots). Verified frame shows the card in
  **"uP! Readiness Changework (Queued) - 1"** — Token 23 / participant22+run1 / Prodigies - First Cycle.
- **Config:** `screenshot: 'on' → 'only-on-failure'` (drops the misleading empty-board auto-shot).
- **Verified** on Prodigies - First Cycle (1 passed, 8.7m): b-form shows the real form; the 7 board
  frames (60-64 KB vs the 47 KB empty board) each show the card in its column (e.g. the participant's
  card in "uP! Readiness Changework (Queued) - 1"). Commits: parent `2b7f9cf`, flutter `5288689`.
- **Unified all-9 regen — NOT completed (operator chose to skip).** The first full re-run was killed by
  a battery-to-zero power loss mid-suite (it still proved the enhancement at full-variation scale:
  **LYL - First Cycle produced all 25 frames** = 5 card + 5 form + 5 after + 10 board, and the
  entry-stage board card — previously missed — was captured by the robustness fix). The relaunch then
  collided with a **competing `evomap` Playwright run in the same `e2e/` dir** (the parallel
  all-components-e2e session) and died. Since the corrections were already verified on two full
  variations and the change is committed, the operator accepted the verified proof and skipped
  regenerating the single unified report. It can be produced anytime in a contention-free slot with
  `cd e2e && SKIP_SEED=1 FLUTTER_BIN=/opt/homebrew/bin/flutter caffeinate -ims npx playwright test --config=playwright.mobile.config.ts`.
  (The coherent original all-9 report was restored to `e2e/playwright-report-mobile/`.)

## Bottom line
The previous session's "9 passed / 37 clean PNGs" is **substantively honest** for 8 of 9 variations —
verified by reading the actual pixels, not the logs. The lone completion gap (Prep-Hold had no app
capture) was a test-harness omission, now corrected. The imaging itself was thinner than the claim
(card-only, plus a meaningless empty-board auto-shot); it now shows the full flow — queue card → real
FillForm → advanced card on mobile, and the participant's card on the operator board for every hop.
[[mobile-flutter-e2e-toolchain]]
