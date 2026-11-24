# 2026-11-21 — Completion date on /workshops + "New Sign-ups" on the workshop dashboard

Plan: `specs/plans/2026-11-21-dashboard-new-signups.md` (approved). Earlier dashboard decisions this builds on:
`2026-11-17-workshop-dashboard-redesign.md`, `2026-11-19-workshop-dashboard-colour.md`,
`2026-11-19-dashboard-late-enrollee-names.md`.

## The request

The operator asked for three things:
- save the date a workshop is marked completed (`workshopcompletedat`);
- on the workshop dashboard, a window from the registration start date to that completion date, falling back to the
  workshop end date when there is no completion date;
- the `new_user_data` people created inside that window, as a card with its own side panel, "even though if they
  movedtoexist also".

## What landed (app stage)

All uncommitted; the operator commits.

- **`/workshops` Completed switch** (`workshops.component.ts` `onWorkshopCompletedChange`):
  - ON writes `{ workshopcompleted: true, workshopcompletedat: serverTimestamp() }`;
  - OFF writes `{ workshopcompleted: false, workshopcompletedat: deleteField() }`;
  - the local row mirrors it (`Timestamp.now()` / `delete`), and the live `collectionData` stream replaces the row
    with the server's value moments later. Nothing else changed: same confirm, same snack bars, same `canEdit` gate.
- **Pure rules** in `workshop-dashboard.glance.ts`, pinned in `workshop-dashboard.glance.unit.spec.ts` (17 new specs):
  - `signupWindow(regStart, completedAt, plannedEnd)` → `{ start, end, endKind: 'completed' | 'planned' }`,
    `{ missing: 'start' | 'end' }` or `{ invalid: true }`; `isSignupWindowSet()` tells them apart;
  - `signupWindowLabel(w)` → `"07 Nov 2026 – 06 Dec 2026"`, `" (completed)"` appended when the end is the completion
    moment, otherwise the reason (`Registration start date is not set` / `Workshop end date is not set` /
    `Dates are not set correctly`);
  - `newSignups(newUserMap, w)` → `{ id, created, moved, doc }[]`, newest `created` first.
- **The card** "New Sign-ups" (`wdash-signups-card`, `-count`, `-window`, `-loading`), one `<ng-template
  #wdxSignupsCard>` drawn with `ngTemplateOutlet` in the People group of the regular layout (after New Users Not
  Enrolled, before Users Not in Chat Group; the group's `--n` went from 3/4 to 4/5) and in a new one-card "People"
  group at the end of the category-based layout.
- **The side panel** (status key `newSignups`): heading "New Sign-ups", the window as the subtitle, the counted people
  in the card's order; each row adds the "Moved to existing" chip (`wdash-signup-moved`), a contact line
  (`wdash-signup-contact`: email · phone) and "Signed up <date, time>" (`wdash-signup-date`). Search, the All / New /
  Exist filter, export, the three communication buttons and the person menu are the shared panel's, unchanged.
- **Colour:** `--gl-signups: #4a8a14` (option A sheet, section 8) on the card and in `PANEL_TONES`.

## Why each constraint landed

- **The window is exact moments, both inclusive — not whole days.** Unlike Sale Achieved (which widens to start of
  day / end of day and a month past the end), both configuration screens merge each date with its time
  (`registrationStartDate` + `registrationStartTime`, `workshopEndDate` + `workshopEndTime`), and the completion date
  is a server moment. Widening to whole days would count people who signed up after the moment the operator marked
  the workshop completed. The label still prints days (the dashboard's `formatDate`), so a window that starts at
  09:00 reads as that day.
- **The completion date wins over the planned end, even when it is later.** That is the operator's rule ("if
  workshopcompletedat is not here then only take the workshopEndDate"). A completion moment earlier than the
  registration start is "Dates are not set correctly", like any start-after-end.
- **An unreadable value counts as not set.** A completion value that cannot be read falls back to the planned end;
  an unreadable start is "Registration start date is not set". The card never shows a window it cannot defend.
- **Switching Completed off deletes the field (not null).** The operator chose "clears the date"; `deleteField()`
  leaves the doc as it was before the workshop was ever completed, so the dashboard falls back exactly as for a
  never-completed workshop, and no reader has to treat `null` specially.
- **Server time, not the browser's clock.** The window end must not depend on the clock of whoever flipped the switch.
- **No new read, no new listener.** `readNewUserData` already loads the whole collection once (Firestore Lite, its
  own request — `2026-11-18`), so the card is a filter over that map. First paint never waits for it (the
  load-time rule); hub WNU-03/04 and the new WSU-05 hold exactly that one request. Someone who signs up while the page
  is open appears after a refresh, like every other People card.
- **Recomputed on change, never per change-detection pass.** `recomputeSignups()` runs on every workshop doc snapshot
  (so marking the workshop completed in another tab moves the end live) and whenever `onNewUserDataSettled` runs (the
  read landing, failing, landing late, or the late-enrollee lookup merging people). It rebuilds the list only when the
  map's identity, the window's ends or the ready state changed — `new_user_data` is large and growing.
- **An open New Sign-ups panel follows the window.** Its subtitle always; its list when the people change, keeping the
  search and the New / Exist pick (unlike Sale Achieved, which reopens its panel and so clears them).
- **Moved-to-existing people are counted and listed** — the operator asked for it explicitly. Their row shows the chip
  instead of the New badge, because the existing New rule (`isNewUserProfile`: in `new_user_data` and not
  `movedtoexist`) already says they are not new. The chip is scoped to this panel.
- **Name and contact details come from `new_user_data`, moved or not** (the plan). The entry's `metadata` is that doc,
  which is what the search, the export (`Email` / `Phone` = `email` / `phonenumber`) and the senders read. For a moved
  person this can be older than their participant metadata — accepted: it is the record of how they signed up.
  The contact line prefixes `countryCode` to the phone when both are present, as the New Users screen shows it; the
  export keeps the bare `phonenumber`, as every other panel's export does.
- **Disabled states mirror the siblings.** While `new_user_data` loads: the quiet bar (`wdash-signups-loading`),
  disabled, `aria-busy`. If that read failed: "—", disabled, and the line reads "Sign-ups are unavailable right now"
  (the window is fine; the people are what is missing). With no usable dates: "—", disabled, the reason on the line —
  and no loading bar even while the read is out, because there is nothing to wait for. `onMetricClick` guards both
  (`NEW_USER_DATA_PANELS` + a set window), so a forced click opens nothing.
- **On every workshop type.** The operator said "every workshop that has a registration start date". The People group
  exists only in the regular layout, so the category-based layout gets its own one-card People group. The card is a
  single `ng-template`, so its literal hooks live once in the file.
- **Its own colour.** A leaf green: the one hue none of its People siblings (sky, violet, raspberry, orange) or the
  neighbouring Participation cards use. Hub WSU-01 checks it differs from the siblings and that the panel header
  takes it.
- **Hooks.** The plan's four card hooks and `wdash-signup-moved`, plus `wdash-signup-contact` and `wdash-signup-date`
  on the row so a spec can check each person's details without reading text across the whole card. All literal.

## Checks

- Unit, the CI way (`--ts-config=tsconfig.unit.json`, glance + engine unit specs): 208 of 208 pass (17 new).
- `ng build --configuration production`: exit 0; 35 warnings, the baseline, none from a touched file.

## Pending

- Hub: `workshops/workshop-dashboard-signups.spec.ts` (WSU-01…06) and the seeded world, then a full isolated run.
- Workshops completed before this change have no completion date; the dashboard falls back to the planned end for
  them. No backfill (out of scope).

## Review round (fix stage)

What the review found, what changed, and why.

- **A planned end with no time now counts the whole end day** (medium). Both configuration screens make the end
  time optional (`workshopEndTime: [null]`, no validator), and `mergeDateTime` leaves a date picked alone at local
  00:00:00.000. Read as an exact moment, the window closed at the very start of the end day, so everyone who signed
  up on that day was left out while the card still printed that day. `signupWindow` now treats a **planned** end at
  exactly local midnight as "no time was set" and runs it to 23:59:59.999 of that day (`wholeDayIfNoTime`). Any other
  time stays exact (a real end time was picked), and the **completion** end always stays exact: it is a server
  moment, and widening it would count people who signed up after the workshop was marked completed. A planned end
  of 00:00 that someone picked on purpose is now read as the whole day; that is accepted, because the time picker
  cannot tell the two apart and the label names days.
- **A date-only string (`'yyyy-mm-dd'`) is that local day**, as Sale Achieved's `anyToDate` reads it.
  `new Date('yyyy-mm-dd')` is UTC midnight (05:30 in India), which shifted the start and the end. The reader is
  inlined in `glance.ts` (the same regex) rather than imported, so the pure module does not pull in
  `watson-purchases.ts` and its Firebase imports. `created` goes through the same reader, so a date-only sign-up date
  and the bounds agree.
- **Duplicating a workshop no longer copies its completion date.** `duplicateWorkshop` spreads the whole source
  doc; a copy of a completed workshop would have ended its window at the source's completion moment (and read
  "Dates are not set correctly" once its registration start moved forward). It now leaves `workshopcompletedat` out.
  `workshopcompleted: true` is still copied, as before this change; whether a copy should start pending is the
  operator's call.
- **The card's window line never splits a date.** In a ~140px cell the line wrapped as "10 Mar 2020 – 15 Apr" /
  "2020 (completed)". The card now prints the same words with no-break spaces inside each date and before the dash
  (`signupWindowLabel(w, true)`), so it can only break after the dash or before "(completed)". The panel subtitle
  keeps plain spaces (it has room). Hub text checks are unchanged: Playwright folds no-break spaces into spaces.
- **...and it is a size smaller in a narrow cell, so it stays on two lines.** Measured on the real sheet (resumed fix
  stage, 2026-11-23): with whole dates alone, the 1440 People card's 139px line went to THREE lines ("10 Mar 2020 –" /
  "15 Apr 2020" / "(completed)", because "15 Apr 2020 (completed)" is 145px at 12.5px), lifting the number 59px above
  its siblings' (worse than the 41px the review saw). A container query on the cell (`wdxcell`, max 160px content —
  four People cards at 1440, two across on a phone, the category layout's lone card) sets this one line
  (`.wdx-signups-win`) at 11.5px, where that piece is 133px. Now: 1440 two lines, number 38px up; 1280 one line, 22px
  up (the same as Completed's "of N enrolled"); 1024 two lines at the normal size; 390 two lines ("10 Mar 2020 – 15 Apr
  2020" / "(completed)"). Wider cells keep 12.5px, so it matches the other sub-lines wherever it fits.
  **Not fixed:** the number still sits one or two lines above its siblings' bottom-aligned numbers. That is the plan's
  shape (the number, then the window under it), as the Completed card already does with its sub-line; the only cures
  change what the plan specified (a shorter "10 Mar – 15 Apr 2020" format, or the window above the number), so that
  is left for the operator.
- **The phone in the contact line stays whole** ("+91 9820000006"): the country code and number are joined with a
  no-break space. The export keeps the bare `phonenumber`.
- **The category-based layout's one-card People group is capped at two cards' width** (`wdx-grp-solo`,
  `max-width:336px`), so on a row by itself it does not stretch one card across the dashboard. Phones keep the
  full-width rule. It stays violet, the regular layout's People hue, so "People" has one colour in both layouts.
- **Not changed:** the People group's `--n` going from 3/4 to 4/5 (it wraps below its old width, and five cards can
  leave one on a second row at 600–750px). That follows from adding a card to the People group, which the plan asked
  for. The pre-existing 390px header overflow and the shared panel's "N participants" wording are not part of this
  change.

### Hub, after review

- **WSU-07:** a workshop whose planned end is local midnight. A sign-up at noon on the end day is counted, one at the
  next midnight is not, and the window names the end day.
- **WSU-08:** a category-based workshop (`categorybased: true`, DONE's dates). Exactly one card, inside a "People"
  group, with the same count, window and panel. This is the only check that the `ngTemplateOutlet` in that layout
  works, since the readiness gate sees the template's hooks once whichever layout draws them.
- **The oracle reads every date shape the app reads:** epoch-ms numbers, and `'yyyy-mm-dd'` as a local day. It also
  applies the whole-day rule. WSU-04's oracle spans every `new_user_data` doc since 2020, so a format difference
  there would have looked like an app bug.
- The temporary screenshot harness `workshops/zz-su-shots.spec.ts` was moved out of the suite folder (into the
  session scratchpad) after the final re-shoot, so a full run or a `git add workshops/` cannot pick it up. The hub's
  working tree is back to the two real files: `workshops/support/wshop.ts` and
  `workshops/workshop-dashboard-signups.spec.ts`.

### Checks (fix round, resumed 2026-11-23)

The code fixes above were already in the working tree when the stage resumed (written 2026-11-21, before the login
expired); this round checked each one against the code, added the narrow-cell font size, and ran everything.

- `ng build --configuration production`: exit 0, 35 warnings — the baseline; none from a touched file.
- Unit, the CI way (glance + engine unit specs): 212 of 212 pass (the 208 before, plus the whole-day, exact-end,
  date-only and keep-dates-together specs).
- Readiness gate on the 6 code files + the plan + this journal: MATCHED, suite `workshops`, nothing uncovered, no
  drift, nothing not landed, no new component, 1733 selectors.
- Emulator, the verify stage's 16 files through `run-isolated.sh`: 138 passed, 0 failed, 2 skipped (WS-65 and WS-04,
  written as `test.skip`); `workshop-dashboard-signups.spec.ts` 8 of 8 (WSU-01…08). No emulator restart, no retry.
- `workshops-deep.spec.ts` on its own (WS-13 drives the Duplicate button, whose copy now leaves out the completion
  date): 11 passed, 0 failed.
- Re-shot at 1440 / 1280 / 1024 / 390, regular and category-based layouts: dates never split; the card's window is
  two lines at most (one at 1280); the category layout's lone People group is 176px at 1440 and 330px at 1024; the
  390 contact line keeps "+91 9820000006" whole.

## Pending (after the fix round)

- The operator commits the app files; the hub's Finish stage commits `wshop.ts` and the signups spec locally.
- Left for the operator: the New Sign-ups number sits one or two lines above its siblings' numbers (the plan's
  "window under the number" shape); whether a duplicated completed workshop should start pending.
- A separate request (Sale Achieved opening a full-screen dialog instead of the side panel) has its own plan,
  `specs/plans/2026-11-23-sale-achieved-dialog.md`; it is not part of this change, and it touches the same dashboard
  files.
