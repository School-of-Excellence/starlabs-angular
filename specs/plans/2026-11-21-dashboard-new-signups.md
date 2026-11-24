# Workshop completed date + "New Sign-ups" on the workshop dashboard (2026-11-21)

The operator's request:
- "hereafter when we mark the workshopcompleted i want to save the date as workshopcompletedat";
- "take the registrationStartDate and workshopcompletedat .. is the workshopcompletedat is not here then only take the workshopEndDate";
- "from the new_user_data … created … who are all created in between these … dates i want that new users list also in the workshop dashboard and when click for that also i want a side panel… even though if they movedtoexist also".

The operator's answers:
- **Card:** "New Sign-ups" in the People group.
- **Which workshops:** every workshop that has a registration start date.
- **Switching Completed off:** clears the date.

## 1. /workshops: save the completion date

- **Completed switch on** (`onWorkshopCompletedChange`, after the existing confirm): write `{ workshopcompleted: true, workshopcompletedat: serverTimestamp() }`.
- **Completed switch off:** write `{ workshopcompleted: false, workshopcompletedat: deleteField() }`.
- **The local row** is updated to match.
- **Unchanged:** no UI change, and no other field is written. Only an editor (`canEdit`) can flip it, as today.
- **Existing completed workshops** get no date (there is nothing to recover). The dashboard then falls back to the planned end date.

## 2. Workshop dashboard: the sign-up window

- **Start:** `detailpage.registrationStartDate`.
- **End:** root `workshopcompletedat` if it is set; otherwise `detailpage.workshopEndDate`. Both are Timestamps and both bounds are inclusive.
- **Live:** the workshop doc already has a live listener, so marking the workshop completed moves the end straight away.
- **Pure helper:** `signupWindow(regStart, completedAt, plannedEnd)` returns:
  - `{ start, end, endKind: 'completed' | 'planned' }`;
  - or `{ missing: 'start' | 'end' }` when the start, or both ends, are absent;
  - or a not-set state when the start is after the end.

  It is unit-tested and accepts a Timestamp, Date, `{seconds}` or ISO string.

## 3. The "New Sign-ups" card (People group)

- **What it counts:** every `new_user_data` doc whose `created` falls inside the window, **including people moved to existing** (`movedtoexist: true`).
  - Enrolment in this workshop does not matter.
  - A doc with no `created`, or one that cannot be read, is left out.
- **No new read:** the dashboard already loads the whole `new_user_data` collection (`readNewUserData`), so this is a filter over data already in memory.
  - Someone who signs up while the page is open appears after a refresh, the same as the other People cards today.
- **What the card shows:**
  - the title "New Sign-ups", the number, and the window under it, e.g. "7 Nov 2026 – 6 Dec 2026";
  - the end is labelled "(completed)" when it comes from the completion date.
- **States:**
  - **Loading:** while `new_user_data` loads, the card shows the same quiet bar and is disabled, like its People siblings. If that read fails, it shows "—".
  - **Missing dates:** it shows "—", disabled, with a reason: "Registration start date is not set" or "Workshop end date is not set". If the start is after the end, it shows "Dates are not set correctly".
- **Look:** shown on every workshop type. It has its own colour token in the option A palette, and the side-panel header tone follows it.
- **Click:** opens the side panel.

## 4. Side panel: New Sign-ups

- **Who:** the people counted by the card, newest sign-up first.
- **Each card shows:**
  - the name, email and phone from `new_user_data`;
  - the sign-up date;
  - a "Moved to existing" chip when `movedtoexist === true`;
  - otherwise a "New" chip, matching the existing New badge rules.
- **Reused panel features:** search, export and the communication buttons.
- **Manage tag:** the existing rules apply. It is disabled for people not enrolled in this workshop.
- **The header** reads "New Sign-ups" with the window as its subtitle.

## Hooks (literal)

- **Card:**
  - `wdash-signups-card` (the button);
  - `wdash-signups-count`;
  - `wdash-signups-window` (the window or reason line);
  - `wdash-signups-loading`.
- **Panel:** existing `wd-side-*` / `wdash-*` hooks where they already exist. A new one for the chip: `wdash-signup-moved`.

## Hub (starlabs-e2e-tests)

- **New gated file:** `workshops/workshop-dashboard-signups.spec.ts` (WSU-xx).
- **Seeds:**
  - the window sits in the past (for example 2020), so only seeded docs fall inside it;
  - `new_user_data` docs before the start, at the start, inside (some moved to existing), at the end, and after the end;
  - a workshop with `workshopcompletedat` earlier than `workshopEndDate`, plus a doc between the two, which must be excluded;
  - a workshop without `workshopcompletedat`, which falls back to the end date;
  - a workshop with no registration start ("—" and its reason).
  - New workshopconfiguration seeds carry no `testrunid`.
- **Cases:**
  - the card count and window text;
  - the panel lists exactly the right people, newest first, with the Moved chip;
  - the /workshops Completed switch: on writes `workshopcompletedat` (a server time inside the test's own before/after bounds), and the dashboard's window end follows it live; off removes the field.

## Out of scope

- Sale Achieved keeps its own window: registration start to one month after the workshop end date.
- Backfilling `workshopcompletedat` for workshops completed before this change.
