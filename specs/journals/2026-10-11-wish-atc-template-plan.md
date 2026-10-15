# 2026-10-11 — WiSH and EI Solution ATC templates: plan, decisions and prototypes

*Last updated 2026-10-12.*

## Context

The operator wants two new **ATC templates** built on one shared mechanism:

- **WiSH:** a specialist prescribes a WiSH ATC smoothly, then views it, edits it and completes its forms.
- **EI Solution:** the same concept with its own sections: an Ask list, an internal review log, and a
  participant Pre Form.

Every other model (uP!, B!G, LYL…) keeps today's **standard template**, unchanged.

**WiSH source:** the PDF *"A&H WiSH Accelerator Journey"* (Rebecca John sample; the participant name is a
pseudonym). Its parts, as they map to this work:

| PDF part | Used? |
|---|---|
| WiSH Outcomes table (S.No · Outcome Area · Outcomes Expected), p.3 | Yes → `wishoutcome` |
| ATC List per cycle: Date, Immediate Outcome Expected, Adjustment ↔ Procedure, p.4–6 / 11 | Yes → existing ATC structure |
| Breakthrough Achievement Report, p.7 / 12 | Not in scope (never asked for) |
| WiSH Life Report, 10 questions, p.9–10 / 13–14 | Yes → participant form |
| Clarity Call form | Not in the PDF; questions still to be supplied |

**EI Solution source:** the operator's requirements in chat. There is no PDF.

This journal records what was agreed across a long design session (2026-10-01 → 2026-10-12).
**No production code has been written yet.** The work so far is analysis, the agreed data model and
clickable prototypes. Next step: an implementation plan in `specs/plans/` for approval.

Hard constraints that shaped everything:
- **Keep the existing ATC data structure.** Only additive fields; the existing `uploadATC` write path
  is reused.
- **ATC is off-limits for automated testing, and Claude doesn't run, serve or test ATC screens.** The
  operator verifies by hand on `starlabs-test` or the emulator, never on production.
- **Appointments can happen outside StarLabs.** Nothing may depend on the appointment studio, which
  isn't planned. Specialists fill their forms from **View ATC**.

## Shared mechanism (both templates)

### How a template is chosen
- **Widgets on the `atc model` document decide the template.** This superseded the first idea of
  hard-coding `wish`. Why: the model declares what every ATC of that model carries, instead of code
  checks on every screen.
- The widget types are `outcomes | ask | review | form`:
  - **WiSH:** `outcomes` + two `form` widgets (WiSH Clarity Call, WiSH Life Report);
  - **EI Solution:** `ask` + `review` + one `form` widget (EI Solution Pre Form).
- The model's widgets are copied onto each ATC at submit (an assumption, see below).

### Prescribe order
- Participant → draft check only → product → template.
- The product select locks once chosen, the same way the participant select does.
- The **queue check stays where it is today**, at participant selection (option a). Why: non-WiSH and
  queue behaviour must not change.
- If a live queue session sets the product to WiSH, the **appointment mapping still fills the
  specialists**.

### Appointment lookup and role mapping
1. **Lookup** finds the appointment where:
   - `bookedby` is the participant;
   - `hosts` contains the logged-in specialist;
   - the appointment type has `atcrequired == true`;
   - it is not cancelled.

   Past or upcoming both count; the **start time closest to now** wins.
2. **No appointment:** alert "no recent appointment", then manual entry.
3. **Specialist not in the list:** alert "contact admin", then manual entry.
4. **`appointmentid`** is saved on the ATC.
5. **`AppointmentType-To-Roles`** gains:
   - `atcrequired` (is an ATC given in this appointment);
   - `atcrolemap { eisroleId: [bigactivityId, …] }`. **One role can map to several activities.**
   - `appointmentforms [{ formid, filledby: "specialist" | "participant" }]`.

   The ATC property comes from `bigactivity.atcproperty`, the bigactivity screen's existing field. It is
   resolved at read time, so that screen stays the single source.
6. **Specialists on Prescribe:**
   - Author, observer, mentor and additional activities are read-only, filled from the appointment.
   - An Edit button switches to the normal pickers.
   - The read view shows only filled roles; empty sections are hidden.

### Forms
7. **Forms reuse the existing form builder** (`delivery forms` → `firestore-forms/formsByClient`). There
   is no new form engine. Each form is filled either by the specialist or by the participant.
8. **The four fill scenarios:**
   - **S1 · Participant, during the call:** the app checks the ongoing appointment's
     `AppointmentType-To-Roles.appointmentforms` for participant forms. This needs a Flutter change.
   - **S2 · Participant, after the call:** "Send to participant" adds the form to the participant's
     **delivery sequence** (`deliverables`, with `atcid`).
   - **S3 · Specialist, during the call:** would need the appointment studio, which isn't planned.
     Folded into S4.
   - **S4 · Specialist, after the call:** the ATC's `form` widgets list the forms the ATC needs. **View
     ATC** shows the missing ones with a button; the specialist fills them there (or fills a participant
     form on their behalf).
9. **The ATC is given in the first appointment; forms are filled in later appointments.** That is why
   forms are not part of Prescribe.
10. **A submitted form is view only.** It can't be edited afterwards.

### Edit and drafts
11. **Edit** follows today's screen structure, in the redesigned look, for every template. Saving creates a
    new version (`editedfrom`), and the template's new fields are carried over.
12. **Drafts** (`temporary_ATC`, `temporary_edit_ATC`) must carry each template's new fields. The
    prototype's draft dialog was removed at the operator's request.

## WiSH template — decisions signed off (do not re-litigate)

1. **Directive:** relabelled *"Immediate outcome expected from WiSH"* and saved in `directive`. It is
   pre-filled from the model's directive only if the model has one.
2. **Not used for WiSH:** age, journey start date (prescription date only), awareness, potential years,
   recommended to, Directives for Micro ATC, "mentored in person", mentor notes.
3. **WiSH outcomes:**
   - New field `wishoutcome: [{ outcomearea, outcomeexpected }]` on the ATC doc.
   - Five empty rows by default; the specialist types both columns; rows can be added and removed.
   - At least one row is required.
   - The next-cycle carry-forward was dropped.
4. **Adjustment rows:** an adjustment, its optional outcome, and procedures. Every adjustment must have a
   procedure.
   - **No change agent field on each procedure.** One overall "Changework Solo" control, auto-filled from
     the appointment's CA role and editable (covers "not found" or someone missed). On save it is written
     to every procedure's `assigned_to`, so the data shape is unchanged. New procedure rows get it
     automatically.
   - **No mandatory checkbox:** every WiSH procedure is saved `mandatory: true`.
5. **Edit ATC:** Adjustment and Outcome are separate boxes.
6. **Role mapping, WiSH Diagnostics** (real names):
   - **WiSH Diagnostics Specialist → Diagnostics Solo (author).** Host: Chandrika.
   - **WiSH Diagnostics Collaborator → Diagnostics Shadow (observer) + Changework Solo (CA).** Hosts:
     Malvika and Dhivya D'Souza.
7. **Forms:** **WiSH Clarity Call**, filled by the specialist, and **WiSH Life Report** (10 questions from
   the PDF), filled by the participant.

## EI Solution template — decisions signed off (do not re-litigate)

1. **Appointment mapping is the same concept as WiSH**; the operator configures it.
   - Diagnostics Specialist role → **Diagnostics Solo (author)**. Host: **Disha Varma**.
   - Shadow role → **Diagnostics Shadow (observer)** + the implementation (change agent) activity. Host:
     **Ishara Ahmed**.
   - These are the same `bigactivity` entries WiSH uses. Because the Shadow role also fills the
     implementation activity, Ishara Ahmed is the change agent in the prototypes.
2. **What EI Solution drops:** awareness, potential years and Directives for Micro ATC.
3. **Ask (area of focus):** a new list on the ATC, `eiask: [{ askedby, askedfor }]`.
   - `askedby` is a fixed option: self, spouse, family or friends.
   - `askedfor` is free text.
   - The list opens with one row, more can be added, and at least one complete row is required.
4. **Review log:** internal notes, stored as `reviewlog: [{ note, date, profileid, isdelete }]` on the ATC doc itself.
   - Any time after an appointment, the specialist logs a review from **View ATC**. It is shown when the
     full ATC is viewed.
   - There is no appointment link and **no new collection** (`atc_reviews` was rejected).
   - **Add only.** A delete is soft: `isdelete: true`. The review is hidden from the log, with a "show
     deleted" toggle.
   - `review` is a widget on the ATC model, so every EI Solution ATC gets the log.
   - Edit copies the whole log, deleted entries included, into the new version.
5. **Form:** **EI Solution Pre Form**, filled by the participant. Its questions are placeholders for
   now.
6. **No WiSH rules carry over** (operator: "all for now no needed"):
   - EI keeps the change agent on each procedure, the mandatory checkbox, Recommended To and the "ATC
     directive" label;
   - EI has no outcome per adjustment.

**Concern raised, accepted by the operator:** the participant's app can read the ATC doc, so keeping
internal reviews there relies on the app (and `view-participant-atc`, `live-prescription`) never showing
`reviewlog`. The operator chose this over a separate collection.

## Data model (additive)

```
default Firestore
  atc model/{id}                + widgets[]: {type:"outcomes"|"ask"|"review"} | {type:"form", formid, filledby}
  AppointmentType-To-Roles/{id} + atcrequired, atcrolemap{roleId:[activityId]}, appointmentforms[]
  delivery forms/{id}           + WiSH Clarity Call, WiSH Life Report, EI Solution Pre Form (new form docs, existing shape)
  deliverables/{id}             + atcid            (S2: a form sent to the app)
  bigactivity, eisroles, appointmenttype, appointments   (unchanged)
firestore-atc
  atc_alpha|atc_to_validate/{atcid}
    + appointmentid, widgets[] (copy at submit)           both templates
    + wishoutcome[{outcomearea, outcomeexpected}]         WiSH
    + eiask[{askedby, askedfor}]                          EI Solution
    + reviewlog[{note, date, profileid, isdelete}]        EI Solution
    corrections/{adjustment NN}     WiSH: name = adjustment + "\n\nOutcome - " + outcome
                                    awareness · awarenessdetail · potentialyears = null for WiSH and EI
    procedures/{adjustment NN - n}  WiSH: assigned_to = overall CA, mandatory true, recommended_to null
                                    EI: per-procedure assigned_to, mandatory and recommended_to, as today
  temporary_ATC / temporary_edit_ATC  + the template's fields (wishoutcome, eiask, appointmentid, outcome per row, …)
firestore-forms
  formsByClient/{id}            + atcid, appointmentid, filledby
```

**How the records link:**
- **ATC → appointment:** `atc.appointmentid`.
- **ATC → screen sections:** `atc.widgets[].type`. `outcomes` → Outcomes, `ask` → Ask, `review` → Review
  log, `form` → Forms checklist.
- **ATC → required forms:** `atc.widgets[].formid`.
- **Form answer → ATC:** `formsByClient.atcid`. Because edits create new ATC IDs, View ATC looks up every
  ID in the `editedfrom` chain.
- **Form sent to the app → ATC:** `deliverables.atcid`, with the answer in `fileref`.
- **Review → specialist:** `reviewlog[].profileid`.

## Prototype assumptions still awaiting operator confirmation

The prototypes show these, but they are **not** signed off.

**Both templates:**
- **Copy of widgets on the ATC:** the model's widgets are copied onto each ATC at submit, so old ATCs
  don't suddenly show "missing" buttons.
- **Fill on their behalf:** staff can fill a participant form (Life Report, Pre Form) for the participant.
- **Appointment link on forms:** form answers ask which appointment they belong to, including
  "No appointment".
- **Answers per form:** one answer per form per ATC.
- **Form submit:** all questions must be answered before submit.
- **Name not in list:** the matched specialists stay filled in; only the unmatched person is left out.
- **Setup warning:** if no role maps to an author activity, the setup dialog warns but still saves.

**WiSH:**
- **View ATC "Edit procedure":** hides the mandatory box and the per-procedure change agent. The standard
  and EI templates keep both.
- **Edit ATC change agents:** they apply to new procedures; an "Also apply to existing procedures"
  checkbox exists. Specialists stay editable in Edit, as today.
- **Outcome storage:** the outcome is kept inside `corrections.name` after the marker
  `"\n\nOutcome - "`, and split back out in Edit.
- **Partial outcome rows:** a half-filled outcome row blocks submit; fully empty rows are dropped.
- **Changework brief:** it becomes required on every WiSH ATC, because all procedures are mandatory and
  today's rule requires a brief for any mandatory procedure. Raised, not answered.

**EI Solution:**
- **Review delete:** any specialist can soft-delete any review, not only their own.
- **No restore:** a deleted review can't be restored.
- **Delete confirmation:** delete asks for confirmation inline.
- **Change agents on Prescribe:** a "set for all + Apply to all" control fills the per-procedure change
  agents from the appointment; each procedure stays editable.
- **Changework brief:** it is required only when a procedure is mandatory, as today.

## Open questions and missing real data

- **Missing real values, WiSH:**
  - Clarity Call questions;
  - WiSH Implementation and Review roles.
- **Missing real values, EI Solution:**
  - the EI appointment-type name and its two role names;
  - the implementation (change agent) activity name;
  - the EI Solution Pre Form questions.
- **Missing real values, both:**
  - names of the mentor, CA-for-other-types and "other" activities;
  - the awareness options and Recommended To options;
  - validator names;
  - appointment dates, and the queue name and stage.
- **App behaviour:** does the app already show delivery-sequence forms (S2)? Is the Flutter change for
  S1 acceptable, or should S1 start with the `appactionpending.formspending` fallback? Does any app
  screen render the whole ATC doc, which would expose `reviewlog`?
- **Duplicate model docs:** `atc model` may hold more than one "WiSH" doc (prescribe de-duplicates by
  name). Widgets must live on exactly one. Not checked against production; the same applies to EI
  Solution.
- **Where the remaining template rules live:** as more widgets or model flags, or in code? For WiSH:
  - the immediate-outcome label;
  - the outcome box;
  - all-mandatory;
  - one change-agent set;
  - hidden awareness.

  For EI: hidden awareness and micro ATC.

## Prototypes (private artifacts; share from each page's Share menu)

**Current:**
- **ATC Templates Prototype** (for understanding; supersedes v4): https://claude.ai/artifact/2dQVybb7n5iixSeZA9mMGR
  - Start screen; Configuration (ATC model widgets and appointment roles for WiSH and EI, with a live
    "Saved as" JSON panel).
  - Prescribe, View and Edit: pick WiSH, EI Solution or standard, then a scenario.
  - Database structure board.
- **WiSH ATC** (for the product owner): https://claude.ai/artifact/Kw4Nz2NwXRjvpjyTwEKbxN
  - Prescribe → Prescribed ATC (three ATCs in different form states, fill-form screen, view-only answers)
    → Edit (new version).
- **EI Solution ATC** (for the product owner): https://claude.ai/artifact/AFHfhyBdxVgYjv1bsWkExc
  - Prescribe → Prescribed ATC (three ATCs with different Pre Form and review states, add and soft-delete
    reviews, fill-form screen) → Edit (new version, review log carried over).

**Earlier iterations:**
- WiSH ATC Prototype v4: https://claude.ai/artifact/VqouCXdRzGANzNnvpRgSkV
- architecture page: https://claude.ai/artifact/XdFs2BoquUnR2SiaaCkzSJ
- flow page: https://claude.ai/artifact/GbH4jYYNtd5HMPh3RaapfY
- prescribe v2, an exact copy of today's screen: https://claude.ai/artifact/Q8vyurJEq51C9ckkPWRdHB
- prescribe v3, the redesign: https://claude.ai/artifact/2z9EHHCbDJacDhtrEqXscZ

**Design system:** StarLabs Operations (Geist + Electric Blue, extracted from this codebase).

## Code touch points (for the implementation plan)

- `Scheduling/map-appointment-role-dialog/*` and `map-appointment-role/*`: the "ATC is given" toggle, role
  → activities, and forms. It already has e2e hooks (`mard-*`), so **extend e2e before push**.
- `Product Designer/product-atcmodel/*` (the atc model editor): the widgets list (`outcomes`, `ask`,
  `review`, `form`).
- `ATC/prescribe-atc/*`:
  - template detection from the model widgets, and the product lock;
  - appointment lookup and mapping (mirrors the queue mapping at `onProfileSelect` ~ts:1008–1073);
  - **WiSH:** outcomes, the overall CA, all-mandatory, and the hidden sections;
  - **EI:** the Ask list; hidden awareness and micro ATC;
  - the template branches of `submit()`; `uploadATC` additions;
  - draft fields (`runAutoSave`, `applyDraftValue`).
- `ATC/view-prescribed-atc/*`:
  - the widget-driven layout and the forms checklist;
  - the fill-form screen;
  - **EI:** the Ask table and the review log (add and soft delete).

  `view-participant-atc/*` and `live-prescription/*` need read-only template blocks, and must **never**
  show `reviewlog`.
- `ATC/edit-atc/*`:
  - **WiSH:** outcomes; split and join of the adjustment outcome; overall CA.
  - **EI:** an editable Ask list; copy `reviewlog` into the new version.
  - Skip the awareness check for WiSH and EI (`edit-atc.component.ts:1091`, `:1123`).
- **Known bugs** found on the way, not fixed:
  - `this.ah = roleData['eis']` at `prescribe-atc.component.ts:318`;
  - `uploadCompleted` resets `potentialyears` to 0 instead of null.

## Session log

- **2026-10-01 → 10-11 (WiSH):**
  - analysed the PDF against today's prescribe, view and edit screens;
  - agreed the decisions above in rounds;
  - built prototypes v1–v4, the WiSH product-owner app and this journal.
  - **Surprises:**
    - today's rule makes the changework brief required for every all-mandatory WiSH ATC;
    - `atc model` may hold duplicate WiSH docs;
    - two existing bugs, listed under Known bugs.
- **2026-10-11 → 10-12 (EI Solution):**
  - agreed the EI template, which reuses the WiSH mechanism with `ask` and `review` widgets;
  - built the ATC Templates Prototype (all three templates) and the EI Solution product-owner app;
  - set the EI specialists to Disha Varma and Ishara Ahmed, on the existing Diagnostics Solo and Shadow
    activities.
  - **Found while testing the prototype code outside the browser:** the Prescribe success screen dropped
    the EI fields. Fixed.
  - **Raised:** the privacy risk of keeping internal reviews on a doc the participant's app can read.
    Accepted by the operator.
- **Not done:** this journal is uncommitted (commits were blocked in the session), and `PROGRESS.md` has
  not been rewritten for this work.

## Next

1. The operator answers the open questions and confirms or changes the prototype assumptions, for both
   templates.
2. Write `specs/plans/2026-10-xx-atc-templates.md`, covering WiSH and EI Solution, and get approval.
   Proposed build order:
   1. role setup dialog;
   2. atc model widgets;
   3. prescribe (shared lookup, then WiSH, then EI);
   4. drafts;
   5. view (forms, then the EI review log);
   6. edit.
3. Build in small commits. The operator verifies every ATC screen by hand.
