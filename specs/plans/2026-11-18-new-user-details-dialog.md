# New Users — person details dialog with "Delivery on hold" (2026-11-18)

Approved by the operator on 2026-11-18. They chose two options from a layout preview: "Show who and when" and "Record every change".

## What

On `/newusersprofile`, clicking a row opens a dialog. The dialog shows that person's `new_user_data` document. Only one control in it can change anything: **Delivery on hold**.

| Shown as | Field(s) | Format |
|---|---|---|
| Header: initials, name, email | `name`, `email` | "—" when missing |
| Phone | `countryCode` + `phonenumber` | "+91 98765 43210", "—" when no number |
| Status | `status` | first letter capitalised ("active" → "Active"), "—" when missing |
| Account | `enable` | Enabled / Disabled |
| Created | `created` | `d MMM y, h:mm a` (same as the table), "—" when missing |
| Last login | `last_login` | same format, "Never" when missing |
| Converted | `movedtoexist` | Yes / No (the screen's Conversion wording) |
| Moved on | `movedon` | same format, "—" when missing |
| Tags | `tags` (ids of `newusertags`) | pills with the tag names, "—" when none |
| Delivery on hold | `deliveryonhold` (missing means off) | slide toggle: the only editable control |
| Caption under the toggle | `deliveryonholdby` | "Turned on by Nanda · 18 Nov 2026, 2:10 PM" when it is on, "Turned off by …" when it is off. When the name cannot be found, the name is left out. There is no caption when nothing has been recorded yet. |

The labels use plain words and never show field names.

## Write rule

Each time the toggle is flipped, the app makes **one** `updateDoc` on `new_user_data/{id}`:

```
{ deliveryonhold: <new value>, deliveryonholdby: { time: serverTimestamp(), user: <signed-in admin profileid> } }
```

- Turning it on and turning it off both overwrite `deliveryonholdby`, so the map always records who made the last change and when (the operator chose "Record every change").
- The admin's profile id comes from `WorkshopAccessService.currentProfileId()`. This is the same id that already decides access to the screen.
- If the id cannot be resolved, the toggle is disabled.
- No other field is written.
- `updateDoc` is used and never `setDoc`, so a deleted document is never brought back.
- The toggle is disabled while a save is running. If the save fails, the toggle goes back to the stored value and an inline error appears.
- The dialog listens to that single document while it is open, so it always shows the stored value.

## Opening and closing

- **Mouse:** a click anywhere on a row opens the dialog. These clicks do **not** open it:
  - the selection checkbox;
  - the tag buttons (edit, add, "+N");
  - a click that ends a text selection.
- **Keyboard:** the name in the Name cell becomes a real button, so Tab then Enter opens the dialog. Escape and the ✕ button close it, and focus returns to where it was.
- **Phones:** tapping the card opens the dialog. The dialog fits a 390px screen without horizontal scrolling.
- **Theme:** white/light, using the New Users "Heritage Ledger" tokens.
- **Loading:** the dialog code loads only when it is first used, like the tags dialog.

## Files

- **App:**
  - `src/app/New-Workshop/newusersprofile/new-user-details-dialog/new-user-details-dialog.component.{ts,html,css}` (hook prefix `nud`)
  - `new-user-details.ts`: pure helpers (labels, caption, write payload). It is not a component.
  - a unit spec for the helpers
  - row click and name button in `newusersprofile.component.{ts,html,css}` (hook `new-open-details`)
- **Hub:**
  - `workshops/new-users-details.spec.ts`, a new file so that the hub-ahead guard skips only this file until the hooks land
  - seeds in `workshops/support/wshop.ts`

## Hooks (literal)

`new-open-details` · `nud-dialog` · `nud-name` · `nud-email` · `nud-phone` · `nud-status` · `nud-account` · `nud-created` · `nud-last-login` · `nud-converted` · `nud-moved-on` · `nud-tags` · `nud-tag` · `nud-hold-toggle` · `nud-hold-by` · `nud-hold-error` · `nud-close`

## Out of scope

- Nothing else reads `deliveryonhold` yet.
- The table does not show it.
- Delivery behaviour is unchanged.
