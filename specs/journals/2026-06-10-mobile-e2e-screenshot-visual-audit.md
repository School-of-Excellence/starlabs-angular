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

## Bottom line
The previous session's "9 passed / 37 clean PNGs" is **substantively honest** for 8 of 9 variations —
verified by reading the actual pixels, not the logs. The lone gap (Prep-Hold had no app capture) is a
test-harness omission, now corrected. [[mobile-flutter-e2e-toolchain]]
