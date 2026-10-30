# ATC forms — step 1 (web): View ATC forms, specialist fill, participant send

**Status:** approved by the operator 2026-10-29 (decisions below are the operator's answers, in order).

## Data
- `atc model.forms: [{ formid, filledby: 'specialist' | 'participant' }]` — locked config, no default, ordered by form name.
- `firestore-atc · atc_alpha/{atcid}.formsubmitted: { [deliveryFormId]: formsByClientId }`.
- `firestore-atc · atc_form_requests/{atcid}_{formid}`: `{ atcid, formid, profileid, product, sentby, sentat, answerid? }`.
- Soft-deleted delivery form: `delivery forms/{id}.delete == true`.

## ATC model screen
- Table **Forms** column shows the configured **form names**; only the configured `delivery forms` docs are read
  (document-id `in` queries, 30 ids each, several queries when there are more).
- The config dialog's "Add a form" search is unchanged for now.

## View ATC
**List load:** ATC docs + all `atc model` docs (in parallel).
**Collapsed ATC (validated, model has forms):** metadata tag "X of N forms submitted" — `formsubmitted` vs the
model config. No soft-delete check (forms aren't loaded until an ATC is opened). Not validated → only the existing
unvalidated tag. Model without forms → no UI change.

**Opened ATC:** corrections + procedures, ATC notes, mentoring notes (as before), then:
- `delivery forms` docs of that model only, not already in the map (document-id `in`, 30 per query) → `mapForm`.
  Re-opening this or another ATC reuses the map.
- Live listener on `atc_form_requests` where `profileid == ATC profileid` and `atcid in [ATC id + earlier version ids]`
  (versions are under 30). Killed when the ATC is collapsed, the screen is left, or a new set of ATCs is loaded.

**Rows** — superseded wording: the card was redesigned (groups, summary, status pill + explanation, renamed buttons —
see the journal §4b). Logic below unchanged. **Rows (form-name order):**
| Form | State | Status | Buttons |
|---|---|---|---|
| specialist | no answer | Not filled | Fill form |
| specialist | answer | Submitted | View, Edit (not for a soft-deleted form) |
| participant | no answer, no request | Not sent | Send |
| participant | no answer, request | Sent | Revoke |
| participant | answer, no request | Submitted | View, Resend |
| participant | answer, request with answerid | Resent | View, Revoke |

- Delivery form doc gone → row hidden. Soft-deleted and not submitted → buttons disabled + "This form was deleted and
  is no longer required." Soft-deleted but submitted → View still works.
- **Send / Resend** write the form's request doc (Resend adds `answerid`), with `formstatus: 'sent'`. **One doc per ATC +
  form for the ATC's whole life:** created as `{atcid}_{formid}`; after an ATC edit the same doc is rewritten and keeps
  its original `atcid`. **Revoke** deletes it. The participant app sets `formstatus: 'submitted'` and the doc is kept.
- A row is "waiting" only while `formstatus == 'sent'`; a soft-deleted form that is still waiting keeps Revoke and doesn't
  show "no longer required".
- **View** = the participant forms screen's read-only overlay (`FormOverlayViewComponent`), reused unchanged.

## Specialist fill (form screen, `/formtemplate?…&atcid=`)
- Opens in a new tab. On submit: follow `upgradedto` to the ATC's **latest version**; if it's deleted, stop.
- Save the answer, then one transaction on the latest version sets `formsubmitted.{formid}` = answer id; the tab closes.

## Specialist resubmit (operator, 2026-10-29)
- **Edit** opens `/formtemplate?id&type=form&patchdata=formsByClient/{answerid}&profileid&atcid` — the saved answer
  prefilled and editable. **Preview & Update** follows the B!G edit logic (`onUpdate`): the previous answer is copied to
  `formsByClient log`, the **same** answer doc is updated, then the ATC check + transaction keep
  `formsubmitted.{formid}` on the latest version; the tab closes. The participant app's Resent flow uses the same logic.

## Edit ATC — WiSH procedures mandatory (operator, 2026-10-29)
- Same rule as Prescribe ATC: a procedure **newly picked** in Edit ATC on a WiSH ATC is set mandatory (→ Changework brief
  required). Saved procedures keep their setting; other models unchanged.

## Not in step 1
- Flutter participant side (home-screen widget, fill) — next step.
- Additional forms outside the model — parked: `specs/plans/2026-10-29-atc-additional-forms-parked.md`.
