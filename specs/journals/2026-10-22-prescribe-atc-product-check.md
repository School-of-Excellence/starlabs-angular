# 2026-10-22 — Prescribe ATC: revert, then participant → draft → product check

**Plan:** `specs/plans/2026-10-22-prescribe-atc-product-check.md`.

## What happened
- Reviewed the `atc-development` branch against our 10-11 template plan. All appointment/Ask work was 18 commits by
  `manojaramachandrana` (10-15 → 10-21), only on `atc-development` — not in `origin/development`. The local
  `development` branch is stale (old tip #288); compare against `origin/development`.
- The Studio's "Prescribe ATC" button (`07db419d`) was part of that work. The Specialist Appointment Studio screen
  itself came from Charan Reddy's release (`db086d38`), which is in `origin/development`.
- Operator: the existing appointment logic was wrong → reverted 7 files to `origin/development` (Prescribe ATC incl.
  the Ask card, and the Studio button + `atcRequiredTypeIds()`), then implemented the agreed flow.

## Why each choice
- **Queue check moved to after the product.** The model decides the source: WiSH / EI Solution take specialists from
  the appointment and skip the queue entirely (operator); other models keep today's queue flow untouched.
- **Hardcoded `toLowerCase()` match on "wish" / "ei solution".** Operator's rule; no config flag exists yet.
- **Product locks once picked.** Prevents specialists mixed from two models.
- **Draft stores the reference; reopening patches it back, no re-check.** Submit is blocked offline, so a re-check
  happens later and can miss: an ended queue session drops `queueid`/`stagename`/`liveassignmentid`; offline reopen
  loses them; a newer session or appointment could be picked; and the un-awaited queue-token read could overwrite a
  draft after it loaded. Saving at drafting time records where the ATC was actually given.
- **Closest past appointment, cancelled excluded, you in `hosts`.** Operator. Type/host filtered in code after a
  `bookedby` query so no new composite index is needed.
- **Only author / observer / mentor / other activities are patched**; `assigned_to` stays manual (operator).
- **Mapped activities are set, not merged**: after a non-queue submit the page doesn't clear `authorMap`, so a
  "fill only if empty" rule would have skipped the next participant's authors.
- **Skipped for directive assignments** (they never had a queue check) and for BIG-assignment mode's appointment
  branch (its specialist sections are hidden).

## Permissions
`~/.claude/settings.json`: the blanket `Bash(git *)` deny was replaced by read-only git allows (log/show/diff/status/
branch listing/merge-base/rev-parse/…) and explicit denies for every git write (commit, push, merge, reset, …).

## Verified
`tsc` green; the emulator dev server rebuilt the component with no errors. Not run in a browser (ATC screens are
verified by the operator).

## Pending
- Operator's manual test (scenarios in the plan).
- Rebuild the EI Solution Ask card in this flow; then View / Edit ATC, review log, forms.
- Unchanged, still open: `this.ah = roleData['eis']` in the constructor.
- Commit (git writes are denied for Claude).

## Same day — direct appointment query
**Operator:** reading every appointment of the participant and filtering in code is risky (that list is huge); query
directly. **Change:** one query — `bookedby ==`, `hosts array-contains` (bookings store `profile_data` refs, as the
other `array-contains` queries in the app assume), `appointment in` the ATC types (chunks of 30), `cancelled == false`,
`starttime <= now`, `orderBy starttime desc`, `limit 1`.
**Why:** one document read instead of the participant's full history. **Trade-offs:** `cancelled == false` skips a doc
with no `cancelled` field (booking always writes `false`); the query needs a composite index
(`bookedby, cancelled, appointment, hosts CONTAINS, starttime desc`) — added to `firestore.indexes.json` (test/emulator
record; `firebase.json` does not deploy it) and must be created in each project's console. Until it exists the query
fails and the catch logs Firestore's create-index link. **Verified:** tsc green; the query shape was accepted by the
emulator (Admin SDK, seeded appointments only).

## Same day — draft safety fixes + bulk change agents on new procedures
**A — queue flow now saves the draft when its data arrives.** The product pick saves the draft before the live-session
lookups return, and the queue flow never saved again, so closing early lost queueid / stagename / liveassignmentid,
the queue's product and its specialists. `checkLiveQueue()` now calls `autoSave()` after the queue-token step and
after the queue name loads.
**B — a draft without a queue session clears queue mode.** `applyDraftValue` only ever turned queue mode on; opening
a non-queue draft after a queue draft ("Open & Continue Another Draft") would have submitted it in queue mode.
**C — not changed (operator).** A draft with a product opens as saved; the check is not re-run. Re-running would have
overwritten the draft's directive (`onProductSelect` resets it from the model), cleared restored queue details when no
live session is found, replaced specialists, and could pick a newer appointment than the one the ATC was given in.
Accepted limits: closing within the moment before a lookup returns leaves that draft without the reference; drafts
saved before today carry no reference fields, so an old queue draft reopens outside queue mode.
**Bulk change agents (operator-approved).** Apply now also records `bulkAppliedSelection[activity]`. Choosing a
procedure (`onProcedureSelect`, new) fills every applied activity into that procedure **only where it has nobody**,
so manual per-procedure edits survive a later procedure change. Apply again still updates every procedure at once.
`bulkassigned` (picker) and `bulkapplied` are saved in the draft, restored on open, and cleared after a non-queue
submit so the next participant starts clean. Procedures created by the AI parse don't fire the picker event, so they
rely on Apply as before.
**Verified:** tsc green; dev server rebuilt with no errors. Manual test by the operator.

## Same day — draft dialog redesign (UI only)
**Operator:** after a participant is chosen, the draft dialog should clearly ask "continue a draft or start new".
`ATC/atc-option` (.html/.css only) restyled in StarLabs Operations: header "Continue a saved draft?" with the draft
count, one card per draft (product, last saved, Synced / On this device, AI ATC draft badges, Delete + Continue),
the same cards for initiated ATCs and ATC assignments, and a footer button that reads **Start fresh** when drafts are
listed (Close otherwise). **No behaviour change:** same `selecteATC` / `deleteDraft` / `close` calls and return values,
every `data-testid` kept (the e2e specs click `atco-draft-select-*` and `atco-close`). The dialog is shared with
Edit ATC and the Triple ATC screens — "Start fresh" was chosen because closing means "carry on without a draft" on all
four (a new ATC on Prescribe / Add Triple, the saved ATC on the edit screens).

## Same day — Prescribe ATC re-skin + "Start fresh" emphasis (UI only)
- Draft dialog: "Start fresh" is now a filled primary-blue button with a `note_add` icon, centred in the footer
  (it was easy to miss as an outlined button). "Close" (no drafts listed) stays secondary.
- Prescribe ATC: a StarLabs Operations theme block appended to the end of `prescribe-atc.component.css` — Geist,
  slate text, white 14px-radius section cards on a light page, uppercase section labels, Electric Blue primary
  buttons (Edit/Add Directive, Add, Apply, Upload, Submit), red for Remove/Record/Stop, blue focus on Material fields
  and checkboxes. The rules above it and the markup are untouched, so it is a pure re-skin that can be removed in one
  block. The Ask section stays out (operator). 21.5 KB stylesheet, far under the 2 MB component-style budget.

## Same day — Prescribe ATC laid out like the prototype
**Operator:** match the prototype; profile image + the three draft actions and "Ready to submit" in a right panel;
add new sections only when asked (the Ask card stays out).
**Change:** two columns (`.atc-layout`): the ATC on the left; a sticky right panel with (1) the participant card —
photo (or a placeholder), name, chosen model, and the three actions (Open & Continue Another Draft when there is
another draft, Create New ATC, Copy Link For Collaborators) — and (2) "Ready to submit": count, progress bar, the
checklist, and the Submit button (moved from the bottom). The old Participant + ATC Data sections became one top card
"Participant · ATC given for · Prescribed date" (the last two show "Choose a participant first" until then); ids
`atcfield-profile/product/date` were added for submit's scroll-to-field. Under 1100px the panel stacks below.
**Why the checklist is a mirror, not a new rule:** `submitChecklist` reads exactly what `submit()` checks, in its
order (author only outside BIG mode, changework brief only when a procedure is mandatory and the user is eis/admin/ah,
micro-ATC directives only for mentors). `submit()` still enforces everything; the panel only shows progress.
Behaviour, bindings and every `data-testid` unchanged (e2e uses `patc-submit`, `patc-participant`, `patc-product`).
**Verified:** tsc green; dev server rebuilt with no errors. Visual check by the operator.

## Same day — full width + docked right panel
**Operator:** the screen looked tight next to the prototype; use the full width and let the right panel take its space
like the side nav. **Change:** removed the 1240px column cap; the main column fills the window (28px gutters) with the
title inside it; the right panel is 360px, docked to the right edge (white, left border, no card gaps), sticky directly
under the fixed draft-status bar and as tall as the rest of the window, scrolling on its own if needed.
**Why those numbers:** measured on a non-ATC page in the emulator: the app's `mat-drawer-content` is the scroller and
starts below the toolbar (`clamp(40px, 7.4vh, 64px)`); the status bar is fixed at 64–104px from the window top, so the
panel sticks at `104px − toolbar` and is `100vh − 104px` tall. Under 1100px it stacks under the form.

## Same day — draft status in the panel, prototype spacing, font revert, Ask (EI Solution)
- **Draft status** moved from the fixed top bar into the top of the right panel: bold, with a state icon
  (cloud_done saved · sync saving · error_outline failed), click-to-save and Retry kept, `patc-draft-status` kept.
  The offline banner stays at the top (it matters before a participant is chosen); the panel sits under it only offline.
- **Spacing** matched to the prototype (40px fields, 16×20px card padding, 20px between cards, tighter rows, the
  Material error line reserved only when an error shows via `subscriptSizing: 'dynamic'`). Top-card placeholders
  "Search participant" / "Choose ATC model".
- **Mistake, reverted:** that spacing pass also shrank text (13.5px fields, smaller headings/labels/buttons, lighter
  grey labels). The operator asked for spacing only. All font-size changes on existing elements were removed (original
  sizes apply), labels/headers back to dark text, locked participant/product fields now read in black. Saved as a
  memory: spacing requests never touch font size/weight/colour.
- **Ask · area of focus** (EI Solution only, `product.toLowerCase() == "ei solution"`), operator-confirmed a–j with
  shape **B**: card after the top card; rows of Asked by (Self/Spouse/Family/Friends) + Asked for + remove; one row by
  default, removing the last clears it; "+ Add ask"; "N complete". Draft `ask` keeps every row (half-filled too);
  restored on open. Submit blocks (after the author check, before the directive): a half-filled row, or no complete
  row; scrolls to `atcfield-asks`. Final ATC: `ask: [{ askedby, askedfor }]` complete rows only, EI only. Checklist
  item for EI. Rows cleared after a normal submit. Hooks: `patc-ask-card/count/by/for/remove/add`.

## e2e coverage owed (operator: write after the manual test, and every change must be covered)
In starlabs-e2e-tests, emulator only (`atc` suite for Prescribe/draft dialog; `appointments` for the role dialog):
1. Map Appointment Role dialog: ATC section (atcrequired, atcmodel, atcrolemap arrays incl. additional roles), scroll
   on overflow, save error `mard-save-error-9`.
2. Prescribe: participant → draft check → product locks; sections hidden until product.
3. WiSH/EI appointment prefill (direct query; closest past, cancelled excluded, hosts) incl. no-match; `appointmentid`
   on draft + ATC. Non-WiSH/EI queue flow + draft queue fields; reopen restores queue mode; B (no carry-over).
4. Bulk change agents: Apply → new procedure gets applied agents (only when empty); saved/restored in draft.
5. Draft dialog redesign (`atco-*` ids) incl. Start fresh.
6. Ready-to-submit checklist mirrors submit; draft status in the panel.
7. Ask: EI only, default row, add/remove, partial-row + no-row blocks, ask on draft (all rows) and ATC (complete).

## Same day — cursor, button spacing, clickable directive; then the e2e coverage above
- Locked participant/product get a not-allowed cursor; 12px/8px top margin on "+ Add New Ask" / "+ Add New Activity"
  and Add/Edit Directive; clicking the directive text opens the same editor (not for a directive assignment).
- **Bug the e2e run caught:** the cursor rule targeted `.mat-mdc-form-field-disabled`, which Angular Material 19
  never renders — the real class is `.mat-form-field-disabled` (no `mdc`). The rule silently did nothing; fixed in
  `prescribe-atc.component.css`. Lesson: check a Material class name in `node_modules/@angular/material/fesm2022`
  before styling on it.
- Hub (starlabs-e2e-tests, emulator only), all 7 backlog items covered:
  - `atc/prescribe-atc-templates.spec.ts` PTPL-01..05 (participants tpg/tpe/tpn/tpb/tpq, seed-atc.js phase 3):
    gating + lock + cursor + checklist + draft status + directive click; EI appointment prefill (closest past hosted
    appointment wins over older/cancelled/future/not-hosted/other-type; assigned_to skipped) + Ask + `appointmentid`
    and `ask` on the ATC; EI no-match + ask validation + half-filled ask restored on a second device; bulk change
    agent inherited by a later procedure, manual pick kept, restored from draft; live queue refs on draft, restored,
    fix B (beta draft leaves queue mode), queue name on the confirm and refs on the ATC.
  - `appointments/map-appointment-role-atc.spec.ts` MARD-ATC-01..04: create with additional role, required-field
    block, edit (role removed → its atcrolemap key goes; untick → model null + map {}), 600px window scrolls with
    Update Role on screen. Restores ATR2R / deletes the AT2 mapping afterwards (the scheduling suite books on them).
  - PATC-05 updated for Start fresh + product gating; PATC-06 comment reworded (rows inherit only once a changework
    is picked). `mard-save-error-9` is soft-referenced only — the emulator never rejects a write.

## 2026-10-23 — UI tweaks, `eiask` → `ask`, full-suite findings
- **Field renamed (operator):** the Ask list is stored as **`ask`** (was `eiask`) on the draft (`temporary_ATC`, every
  row) and the submitted ATC (`atc_alpha` / `atc_to_validate`, complete rows only, EI Solution only). Same shape
  `[{ askedby, askedfor }]`. No old reader existed; no fallback for `eiask` was added (only test drafts ever had it),
  so a test draft saved before the rename reopens with one empty ask row.
- **Spacing-only tweaks** (no font changes): "+ Add New Ask" gets 20px above it (`.ask-add-row`); 16px between
  activity rows in Authors / Observers / Mentors / Additional activities; 12px between Awareness and Potential years
  (the prototype's gap); the awareness select's placeholder is "Choose" as in the prototype (Potential years has none
  there, so none here). Round icon buttons (ask ×, additional activity −, procedure + / −) now centre their icon —
  the 32px button had `padding: 0` but no flex centring, so the 24px icon sat off-centre. Verified on the emulator:
  icon offset 0px in every button.
- **Full ATC suite (83):** 81 passed. **EIA-02 is a behaviour change from the agreed gating**, not a crash: the AI
  "New ATC" link opens Prescribe with participant + AI adjustments but no product, so the form stays hidden until a
  product is picked (data intact). Decision for the operator: keep the gating for AI entries (then EIA-02 is updated
  to pick the product first) or show the form for AI entries. **VATC-02** (View Prescribed date filter) failed on a
  seed precondition on an untouched screen while the run crossed midnight; re-run separately.
- **Self-inflicted interference, lesson:** seeding ATC data by hand for a visual check WHILE the appointments suite
  ran added same-day appointments / appointment types to the shared emulator and broke roster / mark-status cases
  (APPT-05/06/07/17) plus MARD-ATC-01. Never seed or browse a suite's emulator mid-run; tear down, then re-run clean.
- **Re-run (clean):** PTPL-01..05 5/5 with the `ask` rename, PATC 9/9, View Prescribed 9/9 (VATC-02 was the midnight
  flake; VATC-07 fails only when the appointments seed's ATC activities linger on a shared emulator — see the
  2026-10-15 journal). EIA-02 still waits on the operator's gating decision.
- **Operator decision (2026-10-23): option A** — AI "New ATC" entries keep the product gating like every other
  entry. EIA-02 now asserts the form is hidden, picks the product, then checks the AI adjustment + procedure (3/3).

## 2026-10-23 — AI section shows only for AI content (operator-approved, incl. restore + clear)
- "Areas to explore" / "A&H AI Summary (Beta)" render only when there is AI content: section if `hasAiAreas ||
  hasAiSummary`, each heading only for its own part. Content-based, not "opened from an AI link", because an AI
  result can be empty and a reopened AI draft is not an AI link.
- `applyDraftValue` now restores `summarystring` / `areasstring` from the draft's `aiatcsummary` /
  `areastoexplore` (they were saved but never read back, so Continue on an AI draft lost them).
- The post-submit reset clears both, so the next ATC in the same tab does not show the previous participant's
  AI summary.
- Hooks `patc-ai-section` / `patc-ai-areas` / `patc-ai-summary`. e2e: PTPL-01 (normal ATC → none), EIA-02 (AI
  entry → both parts), EIA-04 (Continue on the AI draft in a fresh page → shown; after submit, the next ATC → none).

## 2026-10-23 — WiSH outcomes + WiSH directive UI (plan: specs/plans/2026-10-23-wish-outcomes.md)
- Built as the plan above. Mirrors Ask (draft every row, ATC complete rows only, partial/none blocks submit, cleared
  after submit) so the two template sections behave the same; differences come from the prototype (5 default rows,
  "N filled", "+ Add outcome area").
- Section order is now directive → Ask/Outcomes. The Ready-to-submit list and submit()'s check order still go
  outcomes/ask → directive (unchanged — not asked); flagged to the operator.
- WiSH directive is UI-only: new heading/note/button text and an example-text empty state; no behaviour change.
  New text inherits the existing heading size (no new font sizes, per the spacing≠fonts rule).
- Verified visually on the emulator (WiSH: 5 rows, order directive → outcomes, checklist labels). e2e paused by
  the operator — hooks are in place; the readiness gate will need them driven before push.
- **Follow-up (operator):** Ready-to-submit and submit() now check the directive BEFORE Ask / WiSH outcomes,
  matching the screen. The author check still comes first (Authors sits below Ask/Outcomes on screen) — left as
  is, raised with the operator. Ask and outcome rows get 16px between them (same as the activity rows). The
  Outcome-area placeholder is now "Area to cover" (operator's own edit).

## 2026-10-23 — "Directives for Micro ATC" hidden for EI Solution and WiSH (operator)
- The section was shown to mentors only (`*ngIf="mentor"`); it is now `mentor && !isEISolution && !isWiSH`. Its
  Ready-to-submit item ("Micro ATC directives have an assignee") is hidden the same way, so the checklist never
  points at a section that isn't there. Only Prescribe has this section (Edit and the views don't).
- The submit-time micro-directive check is unchanged; with the section hidden its rows stay empty and it passes. Edge:
  a draft saved BEFORE this change with a half-filled micro directive on an EI/WiSH ATC would be blocked with no
  section to fix it in (unlikely: both templates are new).
- e2e: PTPL-07 with a new seeded user `emen` (roles eis + mentor) — a mentor-only user cannot open Prescribe. Hook
  `patc-micro-section`. Full atc suite 93/93; readiness 566 selectors.

## 2026-10-23 — appointment change agents fill "set for all procedures" (operator; reverses decision c)
- Before: the appointment prefill skipped assigned_to activities (decision "c", 10-22), so change agents were picked
  by hand per procedure. Now, when an appointment role maps to an assigned_to activity, its host(s) become that
  activity's "set for all procedures" selection AND are applied at once: every procedure row on screen gets them,
  and a procedure added later inherits them when its changework is picked (existing `bulkAppliedSelection` →
  `onProcedureSelect`). No confirm dialog (automatic, nothing typed yet). Several roles on one activity → union.
  No appointment / no host → the picker stays empty. Still editable (picker + Apply, or per procedure).
- Kept in the draft via the existing `bulkassigned` / `bulkapplied`; written on submit through each procedure's
  `assignedMap` → `bigactivity` / `assigned_to`. Queue flow, Edit ATC and draft reopen are untouched.
- e2e: PTPL-02 now checks the Change Agent picker = the shadow host (agent2), Support Agent stays empty, the first
  procedure has agent2, a procedure added later inherits it, the draft holds `bulkapplied`, and both submitted
  procedures carry `bigactivity {ca: [agent2]}` + `assigned_to [agent2]`. Full atc suite 93/93 (after an emulator
  restart — it slowed down again under long runs).
