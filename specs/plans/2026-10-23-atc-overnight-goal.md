# 2026-10-23 — Overnight goal: ATC templates in Edit + View, full e2e (operator-approved)

Operator: "complete this ATC all by yourself … present me the Test report in a table". All decisions below were
agreed in chat on 2026-10-23 (prototypes: WiSH https://claude.ai/artifact/Kw4Nz2NwXRjvpjyTwEKbxN, EI Solution
https://claude.ai/artifact/AFHfhyBdxVgYjv1bsWkExc).

## 1. Prescribe ATC — finish e2e
Cover everything not yet driven: WiSH outcomes (5 rows, add/remove-last-clears, partial / none blocks, `outcomes`
on draft (all rows) + ATC (complete rows)), WiSH directive look (heading, placeholder, Add/Edit Immediate Outcome,
checklist "Write the immediate outcome"), section order directive → Ask/Outcomes, checklist + submit order
(author → directive → ask/outcomes). Author check stays first (prototype).

## 2. Edit ATC (`/editATC`) — same design + logic as Prescribe, laid out as the prototypes
- Header "← Prescribed ATC / Edit prescribed ATC"; read-only top card: avatar · Participant · Product · Prescribed date.
- Order: directive (WiSH: "Immediate outcome expected from WiSH", UI only — same editor) → Ask (EI) / WiSH outcomes →
  Specialists ("As saved on the ATC") → Update adjustments → New adjustments → Changework brief + Images → Notes.
- Ask / Outcomes: loaded from the ATC (`ask` / `outcomes`), kept in `temporary_edit_ATC` (all rows), saved on the new
  version (complete rows only). Required in Edit ("At least one complete ask is required" / "Keep at least one WiSH
  outcome"); half-filled rows block. Older EI/WiSH ATCs must add one before saving (operator: OK).
- Save checks order: author → directive → ask/outcomes → empty procedure rows (then the existing checks).
- Right panel (option A): draft status at the top (as Prescribe), then "Update changes in ATC": summary
  ("N edited, N deleted and N new adjustments. Change agents: …"), "Saving creates version N. The current version is
  kept and hidden from the participant." — N from the `editedfrom` chain as View Prescribed computes it, falling back
  to "Saving creates a new version." when it can't be read — errors inline, **Review and update**, Cancel.
- Change agent "set for all procedures": a new-adjustment procedure chosen after Apply inherits it; kept in the draft.
- AI section: content rule (show whichever part exists), restored from the edit draft.
- Spacing, centred icon buttons, not-allowed cursor where locked; NO font-size changes.
- Not in Edit: participant/product gating, appointment/queue prefill (keeps the original's refs via the spread).
- Not built: Forms, Review log (do not exist in the app).

## 3. View
- View Prescribed ATC (expanded row): "Ask · area of focus" card (No. · Asked by · Asked for) / "WiSH outcomes" card
  (No. · Outcome area · Outcomes expected), only when present; directive label "Immediate outcome" for WiSH.
- Also: View Full ATC (`/previewATC`) and the "Preview adjustments" dialog before saving (Prescribe + Edit).
- NOT the participant's own ATC view.

## 4. e2e + run
- Hub specs for every change above (literal `data-testid`, one prefix per component, emulator only).
- Run the full `atc` + `appointments` suites on the emulator (restart it if it slows); fix test bugs and clear app
  bugs and re-run until green. Anything needing a product decision → in the report, not guessed.
- Morning report: table — test case, scenario, result, cause if failed, fix.

## 5. Housekeeping
- Everything stays UNCOMMITTED (git writes are blocked for Claude). Never push.
- Update journals + PROGRESS.md.
