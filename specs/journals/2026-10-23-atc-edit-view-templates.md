# 2026-10-23 (overnight) — Edit ATC + View screens take the template sections

Goal: `specs/plans/2026-10-23-atc-overnight-goal.md` (all decisions operator-approved in chat before the run).

## What landed
- **Edit ATC** (`src/app/ATC/edit-atc`):
  - **Layout:** Prescribe's design, laid out as the prototypes' Edit screen:
    - "← Prescribed ATC / Edit prescribed ATC" header;
    - read-only top card (avatar · Participant · Product · Prescribed date);
    - order: directive → Ask (EI Solution) / WiSH outcomes → specialists → adjustments;
    - Changework brief and Images side by side.
  - **Right panel:** draft status at the top (as Prescribe), then "Update changes in ATC" with:
    - the summary line ("N edited, N deleted and N new adjustments. Change agents: …");
    - "Saving creates version N";
    - inline errors, **Review and update**, Cancel.
  - **Ask / Outcomes:**
    - loaded from the ATC (`ask` / `outcomes`);
    - kept in `temporary_edit_ATC` (every row, as typed);
    - required on save (at least one complete row; a half-filled row blocks);
    - written on the new version (complete rows only, trimmed).
  - **Save checks:** now start author → directive → ask/outcomes (prototype order), then the existing adjustment / procedure / changework checks. Before tonight Edit had no author or directive check at all.
  - **New adjustments:** a procedure chosen after "Apply to all procedures" inherits the agents (only where empty); `bulkapplied` / `bulkassigned` are kept in the edit draft.
  - **AI section:** content rule (whichever part exists).
  - **CSS:** Prescribe's theme block copied verbatim, plus Edit-only rules. No font sizes added.
- **Preview dialog before saving** (`preview-atc-before-submission`): shows the Ask rows / WiSH outcome rows that will be saved, and labels the WiSH directive "Immediate outcome".
  - Only Edit opens this dialog. Prescribe's pre-submit dialog is the AEL confirm, which has no preview, so nothing was added there.
- **View Prescribed** (expanded "View Full ATC") and **/previewATC**:
  - "Ask · area of focus" / "WiSH outcomes" cards, only when the ATC has them;
  - the WiSH directive is labelled "Immediate outcome".
  - The participant's own view was not changed (operator).

## Why each constraint
- **Version number:** worked out by walking `editedfrom` exactly as View Prescribed does (oldest = Version 1), so both screens agree. Next = previous versions + 2. If the chain can't be read (offline), the line drops the number instead of guessing.
- **Required Ask/Outcomes in Edit:** this is the prototype ("At least one complete ask is required" / "Keep at least one WiSH outcome"). The operator accepted that an older EI/WiSH ATC must gain one before it can be saved.
- **Edit restores Ask/Outcomes from the draft only when the draft has those keys.** An edit draft saved before tonight therefore keeps what the ATC holds instead of wiping it.

## Bugs found on the way
- **View Prescribed froze the browser** when an ATC with asks or outcomes was expanded.
  - Cause: the row's data comes from `atc.data()`, which builds a NEW object on every change detection. Looping over `atc.data()['ask']` gave `*ngFor` a new array each pass, so it re-rendered without end; the click handler never returned.
  - Fix: one cached array per ATC (`templateRows(atc)`) plus `trackBy`.
  - Lesson: never `*ngFor` over a field of `atc.data()` in this screen.
- **Test harness:** the hub's emulator config only reuses an app on **:4200**. The local `ng serve` is on :4300 and answers on IPv6 `localhost` only, so a local pass-through (`scratchpad/proxy4200.js`, harness only) forwards :4200 → :4300.
- **Emulator slowdown:** the emulator slowed down twice under long runs (one-document reads went from ~5 ms to seconds, and the seed timed out). A restart script with `-Xmx4g` fixed it. The browser pane left open on the app with live listeners was a likely contributor; it was closed.

## e2e
Specs, hub `atc/`:
- `prescribe-atc-templates.spec.ts`:
  - PTPL-02 now also checks the directive → Ask order on screen and in the checklist;
  - new PTPL-06 covers WiSH: look, order, rows, checks, `outcomes`.
- New `edit-atc-templates.spec.ts`, EATT-01..05: EI asks, an older EI ATC (check order + required ask), WiSH (version 3 from the chain, AI areas only), new-adjustment inheritance + reopen, back/cancel.
- New `view-atc-templates.spec.ts`, VATT-01..02: View Prescribed and /previewATC.

Seed: `seed-atc.js` phase 4 adds the tpw/tea/tel/tew/teb/tvv participants and eight ATCs.
- They are dated 400+ days back so they sort to the END of View Prescribed (25 per page). The first version, dated today, pushed VUA-01's ATC onto page 2.
- The view specs (VATT-01, VUA-01) now filter by participant instead of relying on page 1.

**Other test fixes:**
- PFM-03 read the ATC's `mentoringid` before the app's second write landed. It now waits for it (a race, not an app bug).
- EIA-02: option A (pick the product first).
- PATC-06 comment reworded.

**Final clean run (fresh emulator, 2026-10-23 night):** both suites fully green.
- **atc:** 92/92 passed.
- **appointments:** 63 passed, 0 failed, 6 skipped. The skips are APPT-03 and five Specialist Appointment Studio cases (`test.skip` / `fixme` in those specs, untouched tonight).
- **Readiness gate:** 565 selectors, all present and driven.
- **Production build:** `ng build --configuration production` exit 0.

## View Prescribed ATC — prototype UI (plan: specs/plans/2026-10-23-view-prescribed-ui.md)
- **Why it wasn't done overnight:** the overnight goal only added the Ask/Outcomes cards to View. The operator then asked for the full prototype look, with the constraint "don't remove anything, just incorporate the new UI".
- **Header:** title + subtitle, with Export to Excel moved to the right.
- **Filters and summary:**
  - all filters sit in one white card;
  - "Showing N ATCs | Filtered by …" is kept as plain text;
  - all summary figures sit in one strip card.
- **Each ATC is a card, as in the prototype:**
  - title line: No. (still the print click), participant (profile click + open icon), model tag (EI violet, WiSH blue, others grey; the developer/tester product edit sits on the tag), date, status pill. The three status sentences are kept word for word, along with "(Last Edit …)".
  - the version buttons sit under the title line;
  - key–value grid: activities → names, then "ATC Directive:" / "Immediate outcome:";
  - the photo is 72px, with initials when there is none (the prototype's avatar);
  - outline buttons.
- **Expanded area:** a soft panel holding cards:
  - Ask / WiSH outcomes;
  - the bulk change-agent box;
  - a new "Adjustments and procedures" card wrapping the existing adjustment / awareness / procedure markup and its edit controls (unchanged);
  - the notes block, now a card titled "Notes".
- **What changed versus what didn't:**
  - only labels "Participant Name:" and "Product:" were dropped, because the name and the product now sit in the title line;
  - every value, action, testid (35) and edit control is still there;
  - no font sizes were set; the CSS is appended under `.vp-screen`.
- **Verified:**
  - Playwright screenshots of the list and of an expanded EI ATC;
  - full atc suite 93/93;
  - readiness 566 selectors;
  - production build exit 0.

## After the push — readiness gate "missing test cases"
- The branch-wide gate (`--base origin/development`) counts clickable elements without a `data-testid` per component.
  Prescribe and Edit each had ONE more than development: the clickable directive text (the div that opens the
  editor). The side-panel draft-status button only replaced the old clickable status span, so it nets out. The
  per-file checks I ran before (`--files`) didn't surface it.
- Fix: hooks `patc-directive-open` / `eatc-directive-open`; PTPL-01 opens the editor through it, EATT-01 opens Edit's
  editor through it and cancels. Gate now: 8348 selectors, all present. (The same diff also carries auth guard files
  from the development merge, which makes every suite apply.)
- Lesson: run the gate exactly as CI does — `--base origin/development --head HEAD` — not just over the changed files.
