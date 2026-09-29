# 2026-09-30 — Big cohorts: duplicate selected cohorts (same or another marathon)

**Screen:** Big cohorts, `/bigcohorts` → `CohortManagementComponent` (`src/app/big/cohort-management/`).
**Dialog reused:** create cohort dialog `ManageCohertsComponent` (`src/app/big/manage-coherts/`), new `type: 'duplicate'`.

> Route trap still applies: `/bigcohorts` now loads `cohort-management`, **not** `big-cohort-clone-2` (the 2026-07-11 journal predates that switch).

## CHANGE LOG & REVERT GUIDE

| # | Status | File | Change |
|---|---|---|---|
| 1 | uncommitted | `cohort-management.component.html` | "Duplicate" button in the select bar (`cman-duplicate-selected-cohorts-83`) + `#duplicateConfig` marathon-picker template at the end (`-84` select, `-85` cancel, `-86` continue) |
| 2 | uncommitted | `cohort-management.component.ts` | `duplicateSelectedCohorts()` + `openDuplicateCohortDialog()`; fields `duplicateConfig`, `duplicateModelRef`, `duplicateTargetMarathon`, `destroyed`; `destroyed = true` in `ngOnDestroy`; imports `MatDialogRef`, `firstValueFrom` |
| 3 | uncommitted | `cohort-management.component.css` | `.dup-marathon-field`, `.dup-actions` (appended at end) |
| 4 | uncommitted | `manage-coherts.component.ts` | `type == "duplicate"` constructor branch; logs for `'duplicate'` like `'new'`; `isDuplicateMode()`, `getTargetMarathonName()`; title/button text for duplicate; **`close(check ? formValue : null)`** |
| 5 | uncommitted | `manage-coherts.component.html` | Duplicate banner "Copy of X into Marathon Y" (`mcoh-duplicate-target-35`), reuses `.invitation-info` styles |

Revert all: `git checkout -- src/app/big/cohort-management src/app/big/manage-coherts` (only these edits are uncommitted in those folders as of this entry).
Revert #1–3 alone removes the entry point; #4–5 are then dead but harmless. Reverting #4 alone breaks the flow (dialog would open as a blank "new").

## How it works
1. Select mode → pick cohorts → **Duplicate** → picker dialog: target marathon (defaults to the current one, marked "(current)").
2. For each selected cohort, the create cohort dialog opens in `duplicate` mode, titled "Duplicate Cohort (i of n)", pre-filled from the source.
3. Form = source cohort with: **new `docid`**, **`marathonref` = target marathon**, **`eventref = null`**, `createddate/udpateddate = now`. Everything else (name, description, category, activity, type, level, status, temporary dates, participants, tags, mentors, team) is carried over.
4. Submit = same `onSubmit` as create: `setDoc` new doc, `'added'` logs for every participant, new support chat if group chat is on.
5. Close (X) on a dialog skips that cohort; the rest still open. At the end: reload list, snackbar "N cohort(s) duplicated into <marathon>", exit select mode.

## Why (decisions)
- **Reuse the create dialog** (operator directive) instead of a bulk write, so each copy is reviewed and all the create side-effects (logs, chat) run through one code path.
- **Event list = target marathon's events**, not the current screen's `filteredAcceleratorEventList` — otherwise an event-type copy into another marathon could only pick events of the wrong marathon.
- **Arrays copied** (`[...]`) — edit mode aliases `data.doc` arrays; in duplicate mode the source is the live row in `cohortsList`, so toggling a tag/mentor would have mutated the on-screen source cohort.
- **`enableGroupChat: source === true`** (edit mode uses `!== false`, i.e. undefined → on). For a copy, only create a new chat if the source really had one.
- **Name kept identical** ("remaining looks same"); operator can rename in the dialog.
- **`close(check ? formValue : null)`** — previously the dialog closed *with the form value* even when the "Are you sure" confirm was declined, so callers treated an unsaved form as created. Needed for an honest duplicated-count; also stops `big-dashboard`'s false "Cohorts Created" snackbar on decline. Dialog still closes on decline (unchanged UX).
- **`destroyed` flag** — the loop awaits dialogs; if the operator navigates away, `MatDialog` closes the open one and the loop would otherwise keep opening dialogs over the next page.
- Existing "creating a cohort without an event" confirm still fires on submit (event is null by design) — kept as the safety net for event-type copies.

## Verification
- `npx ngc -p tsconfig.app.json --noEmit` — exit 0, no errors in either component (full AOT + template type-check).
- **Not verified in the browser**: `/bigcohorts` is Firebase-auth gated and the local dev server talks to live Firestore; Claude can't log in.

## Pending
- In-browser smoke test (log in; select 2 cohorts → Duplicate → other marathon → check pre-fill, event empty, event list = target marathon; create one on **test** data only).
- e2e coverage before push (`screen-e2e-coverage` skill): hooks `cman-duplicate-selected-cohorts-83`, `cman-duplicate-target-marathon-84`, `cman-duplicate-cancel-85`, `cman-duplicate-continue-86`, `mcoh-duplicate-target-35`.
- Not committed (operator gates commits).
