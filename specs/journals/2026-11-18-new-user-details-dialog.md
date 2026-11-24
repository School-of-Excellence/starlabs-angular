# 2026-11-18 — New Users: person details dialog and "Delivery on hold"

Plan: `specs/plans/2026-11-18-new-user-details-dialog.md`. The operator approved it from a layout preview, choosing "Show who and when" and "Record every change".

## What landed

All of this is uncommitted in starlabs-angular; the operator commits it.

- **The dialog.** Clicking a row on `/newusersprofile` opens a dialog showing that person's `new_user_data` document:
  - name and email;
  - phone (code + number);
  - status, account (enabled), created, last login, converted, moved on;
  - tags.
- **The one editable control** is the **Delivery on hold** toggle.
- **What a flip writes.** Each flip makes exactly one `updateDoc`:
  ```
  { deliveryonhold, deliveryonholdby: { time: serverTimestamp(), user: <signed-in admin profileid> } }
  ```
  Turning it on and turning it off both overwrite the map.
- **The caption** under the toggle reads "Turned on/off by <name> · <date>". The name comes from a cached, read-only lookup of `profile_data`, then `participant metadata`.
- **Files:**
  - new folder `newusersprofile/new-user-details-dialog/`: the component (hook prefix `nud`), the pure helpers in `new-user-details.ts`, and `new-user-details.unit.spec.ts` (32 cases);
  - in the screen: the row click, a name button (`new-open-details`), and a hook on the row itself (`new-row`).
- **`workshop-access.service.ts`:** `currentProfileId()` is now cached per signed-in uid (see "Why" below).
- **Hub:** `workshops/new-users-details.spec.ts` (NUD-01..09) plus seeds appended to `support/wshop.ts`. It is committed locally as `f86b373` and **not pushed**.

## Why each constraint landed

- **The hold record names the signed-in admin's profile id, taken from `WorkshopAccessService.currentProfileId()`.** That is the same id that already opens this screen, so who may see the toggle and who is recorded as flipping it can never disagree. If the id cannot be resolved, the toggle stays disabled rather than writing a record with no name on it.
- **The id is cached per uid.**
  - The review found that the service kept a single promise for the life of the tab. Logout does not reload the page.
  - So when admin B signed in after admin A in the same tab, B's holds were recorded as A's.
  - The cache is now keyed to the signed-in uid. With a single sign-in it does exactly what it did before.
  - About ten screens use this service. The full workshops suite has not been run since this change, so it must run before the next hub push.
- **`updateDoc` is used, never `setDoc`.** A person who is deleted while the dialog is open must not be recreated by a toggle. The dialog listens to that one document, so in that case it shows "This person is no longer in New Users." and disables the toggle.
- **A row click is ignored when the click is a panel dismissal.** The filter panels close on a CDK outside click, and that same click event still reaches the `mat-row`. Without this check, closing the Tags panel by clicking a row would also open that person's details. The panel handlers now record the dismissing event, and `onRowClick` ignores it.
- **The dialog uses `disableClose: true` and closes itself.**
  - Once the dialog code is loaded, it opens within a microtask. The second click of a double-click then landed on the backdrop and closed it again.
  - Now Escape (with no modifier keys) closes it, and a backdrop click closes it only after 400 ms and only for a single click.
- **The `new-row` hook.** The readiness gate counts a `<tr>` with a click handler as an interactive element. It reported `newUnhooked: 1` until the row had a literal hook. The hub now finds rows by `getByTestId('new-row')`.
- **The tag names come from a getter, not a snapshot.** The screen swaps in a new `tagMap` object on every emission, so a dialog that opened before the tags loaded would have shown "—" for the whole session.
- **The phone shows "—" when there is a code but no number.** This follows the plan's rule, not the table's phone label, because a lone "+91" tells an admin nothing.

## Checks

- Production build: exit 0, both before and after the fix round.
- Unit tests:
  - `new-user-details.unit.spec.ts`: 32/32 (27 helper cases + 5 component cases, including a failed save putting the switch back and showing the error);
  - the screen's own specs: 44/44.
- E2E on the emulator, 4 New Users files: **43/0/0**:
  - new-users-details 9;
  - new-users-redesign 18;
  - new-users-profile 5;
  - new-users-screen 11.
- Readiness gate against `origin/development`: **MATCHED**. Hooks covered: dialog 17/17, screen 194/194, including `new-open-details` and `new-row`.
- The test servers are stopped, port 4200 was untouched, and the cloud-function repo is clean.

## Surprises

- **The emulator was reaped mid-run.** The emulator started by the run stage got SIGTERM after about 30 minutes, matching the long-run reaping that the `run-isolated.sh` header describes. That made fix run 2 invalid: logins hung and the table was empty. The emulator was restarted alone and run 3 was clean. For multi-round work, expect a restart after about 30 minutes.
- **`hook-diff.py` is missing.** CLAUDE.md names `.claude/skills/screen-e2e-coverage/scripts/hook-diff.py`, but the folder is not on this machine. `readiness.cjs` was used instead.
- **NUD-03's own first try failed.** On desktop the open Tags panel covers the Created cell. The step now clicks a visible cell outside the panel and checks with `elementFromPoint` that it is the topmost element.

## Pending

- Operator: commit the 4 changed files, the new `new-user-details-dialog/` folder, the plan, this journal and PROGRESS.
- Hub `f86b373`:
  - push it after the app hooks are on the branch;
  - run the full workshops suite first, because `workshop-access.service.ts` changed.
- Not done, out of scope:
  - nothing reads `deliveryonhold` yet (delivery behaviour is unchanged);
  - the table has no column for it.
- Known gap:
  - the e2e cannot force a failed save, because the emulator rules are open, so that path is covered by unit tests only;
  - whether the name button is excluded from the row click cannot be observed (the single-open guard hides it).
