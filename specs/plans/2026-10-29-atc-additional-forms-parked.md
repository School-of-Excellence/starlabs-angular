# ATC additional forms (outside the ATC model config) — PARKED

**Status:** parked by the operator on 2026-10-29. Initial idea only — design the flow with the operator before any code.

## Why
Specialists sometimes need input from the participant or from sponsors beyond the forms configured on the
ATC model, so they want to send additional forms.

## Initial plan (operator, 2026-10-29)
1. View ATC (opened ATC) gets a simple **Add additional forms** button.
2. Clicked → the specialist picks the form and enters an **email or phone number**.
3. Look the person up in the system. If they exist, take their profile id and create a new doc in
   `firestore-atc · atc_form_requests`. That doc means "this form was requested outside the ATC model".
4. Who it's for:
   - request profile id == the ATC's profile id → **participant**
   - otherwise → **sponsor**
5. Later: people **outside our community** can also fill the form in the Breakthroughs app.

## Open (to design later)
- Request doc shape for non-model forms (the model-form request is `{atcid, formid, profileid, product, sentby, sentat, answerid?}`, doc id `{atcid}_{formid}`).
- What happens when the email/phone isn't in the system (outside users).
- Where the answer is recorded on the ATC, and how View ATC lists these rows next to the model forms.
- Flutter side: how a sponsor / outside user is notified and fills the form.

Related: step-1 ATC forms plan `specs/plans/2026-10-29-atc-forms-step1.md`.
