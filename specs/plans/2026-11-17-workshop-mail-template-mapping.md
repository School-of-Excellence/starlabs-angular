# Plan: workshop config → Settings → Mail template → email template mapping (2026-11-17)

The operator asked for this on 2026-11-17 and chose the `emailData` shape in chat ("Map by variable").

## What
At the end of the **Mail template** section of `/workshopconfig/:id` → Settings:
1. **A template picker with search.**
   - It reads `email templates` with `where('active', '==', true)`, then keeps only `postmarkstatus === 'approved'` in
     code, as asked.
   - Each option shows `templatename`.
   - The list is read on the first opening of the picker, not at page load.
2. **One dropdown per variable** of the chosen template, from `templatemodel` (a string array).
   - The options are Name, Workshop name, Workshop URL and Static value.
   - Static value shows a textarea for the text.
3. **Saved to `workshopsettings/{workshop id}`**, with `setDoc` and `mergeFields: ['workshopid', 'mail']`. The whole
   `mail` map is replaced, so stale variables drop out:
   ```
   mail: {
     templateid: "<email templates doc id>",
     emailData: {
       name:          { type: "name" },
       workshop:      { type: "workshopname" },
       workshop_link: { type: "workshopurl" },
       signoff:       { type: "static", value: "Team A&H" }
     }
   }
   ```

## Decisions (and why)
- **Saves on its own**, with its own button, like Dashboard Access. It writes a different document from the rest of
  Settings, and the Save Settings bar writes only `workshopconfiguration`.
- **One row per distinct variable.** The map is keyed by variable, and a variable used twice in the body takes one
  value. Mustache control tags such as `#each`, `/each`, `^x` and `>partial` are not variables, so they get no row.
- **Save needs a complete mapping.** Every variable needs a choice, and every Static value needs text. Otherwise the
  email would go out with blanks. The footer says how many are missing.
- **Remove** clears the choice. Saving after Remove deletes `mail` (`deleteField`).
- **Blocked on a new workshop** until the Enrollment save creates it, the same rule the rest of Settings follows.
  This avoids leaving `workshopsettings` documents for workshops that never existed.
- **The saved state loads with the tab:** one read of `workshopsettings/{id}`, plus the saved template by id for its
  name and variables.
  - If that template is no longer active or approved, the screen warns but still shows the template.
  - If it was deleted, the screen says so.
- **Not part of the leave-page guard**, the same as Dashboard Access.
- **Nothing sends this email yet.** A consumer, such as a cloud function, will read this shape later.

## Coverage
- **Hub (`workshops` suite):** a new gated spec seeds `email templates` in the **emulator** with an active approved
  template and two negative controls: active but pending, and inactive but approved.
- **The spec drives:** search, a pick, each source type, static text, the incomplete-save block, Save, a read-back
  after reload, and Remove.
- **Firestore oracle:** `workshopsettings/{id}.mail`, plus a check that `workshopconfiguration/{id}` is untouched.
- **Hooks:** the `ws-` prefix, literal ids.
