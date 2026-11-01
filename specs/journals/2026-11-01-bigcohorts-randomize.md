# 2026-11-01 — Big cohorts: randomize participants

**Screen:** Big cohorts, `/bigcohorts` → `CohortManagementComponent`. **New dialog:** `CohortRandomizeDialogComponent`.
**Plan:** `specs/plans/2026-11-01-bigcohorts-randomize.md`.

## CHANGE LOG & REVERT GUIDE

| # | Status | File | Change |
|---|---|---|---|
| 1 | committed 2026-11-01 | `src/app/big/cohort-randomize-dialog/` (new folder) | Dialog, pure logic, unit spec |
| 2 | committed 2026-11-01 | `src/app/big/cohort-management/cohort-management.component.html` | "Randomize into cohorts" button in the select bar |
| 3 | committed 2026-11-01 | `src/app/big/cohort-management/cohort-management.component.ts` | `getRandomizeSourceCohorts()`, `openRandomizeDialog()`, `applyRandomizePlan()` |

Revert: restore `src/app/big/cohort-management` from the commit before this one and delete the new folder. #2 and #3 must be reverted together, because the button calls the methods.

## To turn saving on
Uncomment the `crnd-confirm` button at the bottom of `cohort-randomize-dialog.component.html`. `confirm()` and `applyRandomizePlan()` are already written. The dev environment points at production (`fir-sample-aae4a`), so a click there writes real cohorts.

## Why (decisions)
- **Copy, not move.** Operator: nobody is removed from the source or specialist cohorts. The move rules (active studio, same event) therefore don't apply.
- **Selected cohorts are overwritten.** Operator chose "replace whole cohort" over re-placing only matching people, so a cohort keeps only who the shuffle placed in it. People already in a selected cohort go back into the shuffle instead of being left out, and rerunning leaves no leftover specialists. The dialog warns before anyone is removed, and existing cohort members don't count towards people per cohort.
- **No log structure change.** Operator: reuse the normal entries through `createLogsForParticipants`: `added` for new members, `removed` for those overwritten, nothing for those who stay. The log can't tell a randomize run from a manual change.
- **Logs are written right after the cohort save, not in the same batch**, because that helper writes them itself. A failed log write leaves people changed with no log.
- **Save re-reads each selected cohort** so the logs and chat changes match what is really being replaced, not the list loaded with the page.
- **Dialog redesign after operator testing ("very poor, not able to understand").** The first version only showed a preview once everything was valid, so an incomplete form gave no feedback. Now: numbered steps with a done state on the left, and a "What will happen" panel on the right that always says what the numbers mean and what is still needed. Saving being off is stated in the footer, because the missing Confirm otherwise looks like a bug.
- **Errors explain the scenario and the fix**, such as no check-ins at all that day versus check-ins but none from this cohort. The message builders are pure and unit-tested.
- **Names come through a function, not the map.** The operator saw every preview name as "Unknown" while the cohort cards behind showed real names with the same lookup. The likely cause is timing, not confirmed on live data: `this.mapProfile` is replaced when `getProfileMap()` resolves, so a dialog opened earlier keeps the old empty object forever. The dialog now calls `profileName(id)` on the parent, which also falls back to participant metadata and then the id, the same order as the unassigned list. A real id with no name now shows the id instead of "Unknown". Other dialogs on this screen pass `mapProfile` the same way and can hit the same problem.
- **Start screen: with or without specialists.** Operator: with specialists, put them in the groups first, then pick the participants cohorts and add them. So the step order follows the choice: with is event day → groups → specialists → participants; without is event day → participants → groups.
- **Several participants cohorts.** Operator said "participants cohorts", so the dialog takes any number, starting with what was ticked on the screen. Their people are combined without duplicates. The bar button now shows when every ticked cohort is educational or operational.
- **A specialist wins over a participant.** Because specialists are placed first, someone picked as a specialist leaves the participant shuffle (this reverses the earlier rule). People who aren't also participants are picked first, so the participant count stays the same on every Reshuffle.
- **One role per cohort.** Each list hides cohorts already used as a group, specialist source or participants cohort.
- **Participants per group doesn't count specialists**, as before; they're on top. Not changed by the new order.
- **All sections stay open.** Operator tried a Next stepper and asked for everything open instead, so there are no Next, Edit or locked steps. Each section shows its own problems and what's still missing. The side panel is just counts and the preview, replacing the paragraph of text.
- **Specialist step is a dropdown.** Operator: one cohort is enough, and it shouldn't reuse the same list UI. The participants step mirrors it, as a dropdown that still allows several cohorts.
- **Specialists are entered per group, not as a total.** Operator: we split group-wise. Each group gets exactly that number, so people left over in the specialist cohort aren't used, unlike participant extras, which are spread. This replaces the earlier total-pull assumption.
- **Selected options stay in the dropdown list.** A Material select drops its selection if the selected option is filtered out, so searching could silently unselect a cohort.
- **Groups step has Select all shown**, because the operator splits into 26 groups and ticking each is slow. The chips are hidden behind a count for the same reason.
- **Clicking outside no longer closes the dialog**, since that lost a multi-step form.
- **"Continue without attendance"** sets both attendance filters to All in one click when no event applies.
- **An inactive cohort you ticked stays usable as the source.** Operator saw a blank participants dropdown with "The selected cohort has no participants". The dialog hid inactive cohorts but still counted the ticked one as selected, so it had no name or people. A test with an inactive source gave the same screen, but the real cohort's status wasn't read because the production login had expired. It now appears labelled Inactive in the participants dropdown only, and other inactive cohorts stay hidden.
- **People with attendance not marked can be ticked in.** Operator: with Attended selected, show the cohort's people with no attendance that day so they can be picked and included in the shuffle. The list appears once a date is picked and only with Attended, since Not attended and All already cover them. Ticks reset when the event or date changes because they were made for one day. Only participants get this list; specialists still follow their attendance filter.
- **Cohort lists default to the source's marathon**, with an All marathons tick, because the full list spans every marathon. Selected cohorts stay visible as chips while searching.
- **Educational and operational only.** Source, targets and specialist sources; operational was added when the operator tried All CPI Participants. Studio and readiness stay out. Inactive cohorts are hidden too (my call). New cohorts are still created as educational.
- **Event comes from the dialog, not the cohort.** Operator: cohorts don't say which event they belong to.
- **Attendance = `arena e-ticket log`**, by `eventref` and the local day of `logdate`, the same source as the live event dashboard. Not attended means a cohort member with no entry that day, so the count can differ from the dashboard's absent list, which only counts e-ticket holders.
- **New cohorts need only a name.** The rest of the form is filled in: educational, general, active, no event; marathon and level copied from the source. Created only on save.
- **Category check lives in `isRandomizeCategory()`**, shared by the select bar button and the dialog lists, so the rule can't drift between them.
- **Group chats are updated without the per-person dialog**, which would be unusable for this many people.
- **Seeded shuffle.** Changing an input keeps a stable order; only Reshuffle changes it.

## Verification (2026-11-01)
- Unit: 29/29 pass with `tsconfig.unit.json`. App type-checks and templates compile with no errors in these files.
- Browser: the redesigned dialog ran on a temporary unguarded route with synthetic data (since removed). Split, spread, overwrite counts, the error scenarios and the two-column layout at 1280px all checked, with no overflow. The operator has opened the select bar button in their own session.
- **Not run by me:** the real `arena e-ticket log` read and `applyRandomizePlan()`. The built-in browser wasn't signed in, and saving is off.
- `graphify` isn't installed here, so the graph wasn't rebuilt.

## e2e
Hub `queue/big-cohorts-randomize.spec.ts` (`crnd` prefix; select bar hook `cman-randomize-cohort-87`). CRND-01 category gate; CRND-02 split, extras, removal warning, no write; CRND-03 attendance and ticking unmarked people; CRND-04 specialists, overlap, new cohort. The rest of the hooks are in CRND-ADDR1. Not covered while saving is off: `applyRandomizePlan()`. Turning saving on needs a case for it.

## Pending
- Check on real data with a signed-in session.
- Earlier this session, the two untracked zone-geofencing plans were discarded into `git stash` at the operator's request.
