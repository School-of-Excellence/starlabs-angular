# Cluster: Delivery Form & Plan Together

> Static code+config map. Repo: `breakthroughs-flutter` (branch `development`). Read-only pass — no build/run/Firestore.
> Files mapped:
> - `breakthroughs-flutter/lib/Delivery Form/FillForm.dart` (2496 lines) — **LIVE**, central reusable form-fill engine
> - `breakthroughs-flutter/lib/planTogether.dart` (209 lines) — widget compiles but is **DEAD** (no live entry; see Dead/clone section)

## Overview

This cluster is the participant-facing **form delivery engine**. `FillForm` renders a dynamic, server-defined form template (an array of typed fields) and lets the participant fill it in, auto-saving every keystroke/interaction to a per-user **draft**, preview a read-only summary, and submit. It is not a screen the user navigates to by name — it is a leaf widget pushed by ~7 different delivery contexts (queue stages, mode checklists, workshop challenges, big-activity assignments, app "action pending" forms, and read-only report viewing). On submit it writes the completed form to a named Firestore database (`firestore-forms`) and, depending on the calling context, either advances the participant's delivery/journey status or pops a result path back to the caller (queue/checklist/bigactivity). `Plantogether` is a separate "Let's Plan Together" collaborative-survey voting screen whose code still exists but whose entry point and data load are fully commented out — it is dead.

The form engine supports a rich field-type set: text / email / number / paragraph, dropdown, radio, checkbox, multiselect(+multicheckbox), date, time, slider, label, nested repeatable **array** sub-forms, **flipping** (per-selection slider follow-up), and read-only **audio** / **video** player fields.

## Screens

| Screen / widget | file:line | Purpose |
|---|---|---|
| `FillForm` (StatefulWidget) | `Delivery Form/FillForm.dart:22` | Dynamic form-fill engine: loads template, renders typed fields, autosaves draft, validates, previews, submits |
| `_FillForm` (State) | `Delivery Form/FillForm.dart:43` | All form logic: load/draft/autosave/clear, per-field widget builders, submit, journey update |
| `FormSubmissionPreview` (StatelessWidget) | `Delivery Form/FillForm.dart:2343` | Read-only review screen before final submit; per-field "edit" jumps back; "Confirm & Submit" button |
| `Plantogether` (StatefulWidget) — **DEAD** | `planTogether.dart:6` | "Let's Plan Together" survey: pick one date-set ("SET n"), submit vote. No live entry point. |

## Features

### F1 — Fill a dynamic delivery form
- **What the user does:** Opens a form pushed from a delivery context and fills typed fields (text/email/number/paragraph, dropdown, radio, checkbox, multiselect/multicheckbox, date, time, slider). Field title + optional description + optional "Hint" note are shown per field.
- **Nav/entry:** Pushed `FillForm(...)` from many callers — not a named route. Live entries: queue form stage (`Delivery Queue/queueStageDetail.dart:111`, `Delivery Queue/queueControl.dart:212,1209`), mode checklist (`Mode Widget/modeChecklist.dart:357`, `Mode Widget/formQueue.dart:141`), big activity (`Delivery Event/bigactivity.dart:1090`), app action-pending forms (`Widgets/actionPending.dart:535`), workshop challenges (`EIFlix Workshop/workshopChallenge.dart:273`, `EIFlix Workshop New/workshopchallenges.dart:4053,7796`, `EIFlix Workshop/workshopEnrolment.dart:699`), product delivery sequence (`Widgets/productDeliverySequence.dart:128`), Themes helper (`Widgets/Themes.dart:1130`), reports view (`reports/viewReportForm.dart:165`).
- **Reads:** Template load — branch A `firestoreDefault.doc(widget.formpath).get()` (default DB; `formpath` e.g. `/delivery forms/{docid}`), reads `formname`, `formdescription`, `formarray` (`FillForm.dart:233-242`). Branch B (view mode) `firestore-forms` `formsByClient/{submittedForm}` → `formarray` (`FillForm.dart:222-231`).
- **Writes:** none on render (autosave is F3).
- **Endpoints:** Firestore only. Two DB handles: default `FirebaseFirestore.instance` and named **`firestore-forms`** via `FirebaseFirestore.instanceFor(app, databaseId: "firestore-forms")` (`FillForm.dart:59-60`).
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** **Yes** — render driven by template doc + `deliverablepath`. Preview button has stable key `e2e-form-preview` (`FillForm.dart:2099`); confirm button key `e2e-form-confirm` (`FillForm.dart:2408`). No ATC.

### F2 — Resume / select a saved draft
- **What the user does:** On opening a *new* (not submitted) form, if prior drafts exist for this `formid`+`profileid` (not deleted), a non-dismissible bottom sheet "Select Draft" lists each draft by timestamp; tapping one restores its `formarray` (date fields converted from Timestamp→DateTime) and sets draft status = success; "Close" starts fresh.
- **Nav/entry:** Auto-triggered in `loadForm()` → `loadDraftFromDB()` → `selectDraft()` (`FillForm.dart:243,248-266,267-367`). Only when `widget.submittedForm == null`.
- **Reads:** `firestore-forms` `temporary_forms` `where formid == doc(formpath).id AND profileid == loggedinProfile["profileid"] AND delete == false` (`FillForm.dart:251-253`); client-side sort by `date` desc (`:260`).
- **Writes:** none (selection mutates in-memory `formTemplate` + `draftID`).
- **Endpoints:** Firestore `firestore-forms`.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** **Yes** — seed a `temporary_forms` doc with matching `formid`/`profileid`/`delete:false` to force the sheet. Modal is `isDismissible:false` (must tap an item or Close). No ATC.

### F3 — Auto-save draft on every interaction
- **What the user does:** Nothing explicit — every field change (text focus-loss, dropdown/radio/checkbox/multiselect/date/time/slider change) calls `autosave()`, which upserts the current form state to a draft doc. AppBar shows a cloud icon reflecting status: loading (yellow `cloud_download`), success (green `cloud_done`), error (red `cloud_off`) with label "Draft Saved" (`FillForm.dart:83-88,1786-1801`).
- **Nav/entry:** Implicit; fired from each field builder's `onChanged`/`onFocusChange` (`textfield:906`, `dropdownField:1050`, `multiSelectCheckbox:1165`, `checkbox:1237`, `timeField:1346`, `radioField:1420`, `dateField:1458`, `sliderHolder:1548`, audio slider:471/485).
- **Reads:** none.
- **Writes:** `firestore-forms` `temporary_forms/{draftID}` via `.set({..}, merge:true)` with fields: `queueid` (only when `deliverablepath=="queueform"`, from `queueDeliveryData["tokendata"]["queueref"].id`), `date`=serverTimestamp, `docid`=draftID, `formid`=doc(formpath).id, `profileid`, `delete:false`, `formname`, `formdescription`, `formarray` (`FillForm.dart:369-410`, draftID generated at `:220`).
- **Endpoints:** Firestore `firestore-forms`. Errors → `appService.logException(...)`.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** **Yes** — assert a `temporary_forms` doc appears/updates after a field edit and the AppBar status icon turns green. No ATC.

### F4 — Preview submission (review screen)
- **What the user does:** Taps "Preview". Form is validated (custom `validationCheck()` scrolls to first invalid field; then `Form.validate()`); if valid, a `FormSubmissionPreview` screen opens listing every field name + formatted value ("Not filled" when empty; arrays show "N items"; audio/video show placeholders). Each row has an edit pencil that pops back and scrolls to that field.
- **Nav/entry:** "Preview" `ElevatedButton key('e2e-form-preview')` AND a wrapping `Listener.onPointerUp` (dual trigger to beat scroll-steal; idempotent via `_previewBusy`) → `_previewPressed()` → `Navigator.push(FormSubmissionPreview)` (`FillForm.dart:2087-2116,1717-1762`).
- **Reads:** none (uses in-memory `formTemplate`).
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** **Yes** — `e2e-form-preview` key + `_getFormattedFieldValue` deterministic. Note `IgnorePointer` disables the whole form when `loading || submittedForm != null` (`FillForm.dart:1860-1861`) — preview/edit are read-only in view mode. No ATC.

### F5 — Confirm & submit form
- **What the user does:** From the preview screen taps "Confirm & Submit". Form writes to `formsByClient`, the draft is soft-deleted, and the calling context is advanced (queue/journey).
- **Nav/entry:** `FormSubmissionPreview` "Confirm & Submit" `ElevatedButton key('e2e-form-confirm')` → `onSubmit` → `submitform()` (`FillForm.dart:2408-2425,1752-1755`).
- **Reads:** `firestoreForm.doc(widget.formpath).id` for `formid`; queue refs read from `appService.queueDeliveryData["tokendata"]` (in-memory).
- **Writes:** `firestore-forms` `formsByClient/{docID}` via `.set(submitForm)` with: `date`=serverTimestamp, `docid`, `formid`, `formarray`, `formname`, `loginid`=loggedinProfile["user_ref"].id, `profileid`, `submittedin:"breakthroughs"` (`FillForm.dart:2189-2208`). When `deliverablepath=="queueform"` and tokendata present, also adds `queueref` (DocumentReference), `queuetokenref` → `queue_token/{tokendata.docid}`, `stagename` (`:2209-2222`). `widget.metadata` (e.g. `bigparticipantassignmentref`, queue refs) is merged in (`:2223-2225`). Then `clearDraft()` soft-deletes the draft (F6).
- **Post-submit branch:** if `deliverablepath ∈ {queueform, workshop, modechecklist, appactionpending, bigactivity}` → `Navigator.pop(context, formsByClient/{docID}.path)` (caller handles status). Else → `updateJourney(...)` (F7) (`FillForm.dart:2226-2245`).
- **Endpoints:** Firestore `firestore-forms`. Errors → `logException`.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** **Yes** — `e2e-form-confirm` key; assert `formsByClient` doc written and (queue path) returned path on pop. Diagnostic prints `E2E-SUBMITFORM ...` (`:2235`). No ATC.

### F6 — Clear / soft-delete draft on submit
- **What the user does:** Implicit — after successful submit, the active draft is marked deleted so it won't reappear.
- **Nav/entry:** `clearDraft()` called inside `submitform()` after `formsByClient.set` (`FillForm.dart:412-423,2227`).
- **Reads:** none.
- **Writes:** `firestore-forms` `temporary_forms/{draftID}` `.set({"delete": true}, merge:true)` (`:416-418`).
- **Endpoints:** Firestore `firestore-forms`.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** **Yes** — assert draft doc `delete==true` after submit. No ATC.

### F7 — Advance participant journey on submit (non-queue path)
- **What the user does:** Implicit — for non-queue/non-checklist contexts, submitting marks the delivery step completed and recomputes product/journey status.
- **Nav/entry:** `updateJourney(formPath)` from `submitform()` else-branch (`FillForm.dart:2241-2243,2306-2319`).
- **Reads:** via `appService.updateDeliveryStatus(deliveryPath, profileid, status)` (3-arg overload, `Services/AppServices.dart:998`): reads `participantdeliverysequence/{profileid}` and `participantsproduct/{participantproductid}`.
- **Writes:** (a) default-DB `doc(widget.deliverablepath).update({fileref: arrayUnion([doc(formPath)]), status:"completed"})` (`FillForm.dart:2307-2310`) — `deliverablepath` here is a full sequence-ref path; (b) inside `updateDeliveryStatus`: updates `participantsproduct/{id}` (`status`,`statusdate`) and the `participantdeliverysequence/{profileid}` record (sets the matching `delivery.status="completed"`, next delivery → "ready", recomputes product status) (`AppServices.dart:1018-1088`).
- **Endpoints:** Firestore (default DB). Note cross-database write: form lives in `firestore-forms` but `fileref` is built with `firestoreDefault.doc(formPath)` (default DB ref) (`FillForm.dart:2308`) — possible mismatch, see open questions.
- **Config flags:** none.
- **Journey stage:** delivery / progression.
- **e2e-testability:** **Partial/Yes** — requires a seeded `participantdeliverysequence/{profileid}` + `participantsproduct` + a `deliverablepath` sequence doc; verify `status` flips to completed and next step to ready. Heavier fixture. No ATC.

### F8 — Repeatable array sub-form (add/remove rows)
- **What the user does:** For an `array`-type field, fills a group of sub-fields and taps `+` to add another row (bounded by optional `maxitems`) or `-` to remove a row (not the first). Each row supports text/email/number/paragraph, dropdown, multiselect, checkbox, time, radio, date sub-fields.
- **Nav/entry:** Rendered when `fieldType=="array"` → `arrayField(field)` (`FillForm.dart:1571-1711`; field dispatch at `:1963-1964`). `maxitems` gate at `:1693-1694`.
- **Reads/Writes:** none directly (mutates in-memory `field["value"]` list; persisted via F3 autosave). Array values validated in `validationCheck()` (`:152-185`).
- **Endpoints:** none.
- **Config flags:** field-level `maxitems` (data-driven, not remote config).
- **Journey stage:** delivery.
- **e2e-testability:** **Yes** — needs a template with an `array` field; assert add/remove and per-row required validation. No ATC.

### F9 — Flipping follow-up (per-selection slider)
- **What the user does:** For a field with `"flipping": true` and a List value, each selected option renders a follow-up `flippingquestion` (slider) underneath, captured per selected option.
- **Nav/entry:** Rendered after the field when `(field["flipping"] ?? false) && field["value"] is List` (`FillForm.dart:1995-2072`); slider via `flippingSliderHolder(field, selectedOption)` (`:2255-2304`).
- **Reads/Writes:** none directly (mutates `field["flippingquestion"]["value"][selectedOption]`; persisted via F3). NOTE: the flipping slider's `onChanged` does **not** call `autosave()` (unlike the main slider) — value persists only on next other-field autosave (`:2274-2280`).
- **Endpoints:** none.
- **Config flags:** field-level `flipping` / `flippingquestion` (data-driven).
- **Journey stage:** delivery.
- **e2e-testability:** **Yes (conditional)** — needs a template field with `flipping:true`; verify follow-up slider renders per selection. No ATC.

### F10 — Play form-embedded audio
- **What the user does:** For an `audio` field, plays/pauses a streamed audio clip (`just_audio` + background), with play/pause icon, scrubber slider, and elapsed/total time. Auto-stops at end.
- **Nav/entry:** `audioHolder(field)` when `fieldType=="audio"` (`FillForm.dart:491-593`; dispatch `:1967-1968`). URL = `field["options"][0]`.
- **Reads:** streams remote audio from `field["options"][0]` (Storage/CDN URL embedded in template; not a `.ref()` call).
- **Writes:** scrubbing the slider calls `autosave()` (writes draft) (`:471,485`).
- **Endpoints:** remote media URL (`just_audio` `AudioSource.uri`); MediaItem metadata artist "Antano & Harini" (`:561`).
- **Config flags:** none.
- **Journey stage:** delivery / content.
- **e2e-testability:** **Partial** — playback needs a real media URL + device audio; map existence, but treat playback as smoke-level. No ATC.

### F11 — Play form-embedded video
- **What the user does:** For a `video` field, plays a streamed video (`video_player`) with play/pause/replay, ±10s seek, buffering spinner, full progress bar, tap-to-toggle controls.
- **Nav/entry:** `videoHolder(field)` when `fieldType=="video"` (`FillForm.dart:595-881`; dispatch `:1965-1966`). URL = `field["options"][0]` via `playVideoFromURL` (`:425-437`).
- **Reads:** streams remote video from `field["options"][0]` (`VideoPlayerController.network`).
- **Writes:** none.
- **Endpoints:** remote media URL.
- **Config flags:** none.
- **Journey stage:** delivery / content.
- **e2e-testability:** **Partial** — needs real media URL; map existence, smoke-level playback. No ATC.

### F12 — View a previously submitted form (read-only)
- **What the user does:** From reports, taps "View" to open a submitted form read-only (no preview/submit button; all fields `IgnorePointer`-disabled).
- **Nav/entry:** `FillForm(deliverablepath:'', submittedForm:"{docid}", formpath:'')` from `reports/viewReportForm.dart:165`. Submit/preview suppressed because `widget.submittedForm != null` (`FillForm.dart:1861,2082`).
- **Reads:** `firestore-forms` `formsByClient/{submittedForm}` → `formarray` (`FillForm.dart:222-231`).
- **Writes:** none.
- **Endpoints:** Firestore `firestore-forms`.
- **Config flags:** none.
- **Journey stage:** content / support (review of past submissions).
- **e2e-testability:** **Yes** — seed a `formsByClient` doc and assert read-only render. No ATC.

### F13 — "Let's Plan Together" survey vote — **DEAD CODE**
- **What the user does (intended):** Reads intro copy, sees N candidate plan "SETs" (each a list of events with start/end dates), taps to select one set, taps "SUBMIT" to record their vote.
- **Nav/entry:** `Plantogether(planTogetherDates: ...)` is only pushed from `homeContent.dart:6576` inside `planTogetherBox()`, which is wholly inside a `/* ... */` comment block (`homeContent.dart:6513-6593`); the only call to `planTogetherBox()` is also commented (`homeContent.dart:8408`). `planTogetherDates` is initialized to `{}` (`homeContent.dart:132`) and its data load (`plantogether` query) is commented out (`homeContent.dart:4641-4712`). **No live path reaches this widget.**
- **Reads (intended):** would consume `planTogetherDates` map (`planlist`, `response.{profileid}`, `docid`).
- **Writes (intended):** `plantogether/{docid}.update({"response.{profileid}": selectedSetIndex})` (`planTogether.dart:182-188`).
- **Endpoints:** Firestore `plantogether` (default DB).
- **Config flags:** none.
- **Journey stage:** social / content (collaborative scheduling survey).
- **e2e-testability:** **No** — dead/unreachable; would need uncommenting + seeding `plantogether`. Map existence only; do not seed or test. Not ATC.

## Firestore collections

### Read
- **`delivery forms`** (default DB) — form template doc at `widget.formpath` (e.g. `/delivery forms/{docid}`); fields `formname`, `formdescription`, `formarray` (`FillForm.dart:233-242`). [`formpath` is caller-supplied; usually this collection.]
- **`formsByClient`** (`firestore-forms`) — submitted form by id `{submittedForm}`; field `formarray` (view/read-only mode) (`FillForm.dart:222`).
- **`temporary_forms`** (`firestore-forms`) — draft lookup `where formid== AND profileid== AND delete==false`, sort by `date` desc (`FillForm.dart:251-253`).
- **`participantdeliverysequence`** (default DB, doc id = `profileid`) — read in `appService.updateDeliveryStatus` (`AppServices.dart:1003-1007`).
- **`participantsproduct`** (default DB, doc id = `participantproductid`) — read for product status (`AppServices.dart:1019-1023`).
- **`plantogether`** (default DB) — **DEAD**, read commented out (`homeContent.dart:4641`).

### Written
- **`temporary_forms`** (`firestore-forms`, doc `{draftID}`) — autosave upsert (`queueid?, date, docid, formid, profileid, delete:false, formname, formdescription, formarray`) merge (`FillForm.dart:384-392`); soft-delete `{delete:true}` on submit (`:416-418`).
- **`formsByClient`** (`firestore-forms`, doc `{docID}`) — submitted form (`date, docid, formid, formarray, formname, loginid, profileid, submittedin:"breakthroughs"` + queue fields `queueref/queuetokenref/stagename` when queueform + merged `metadata`) (`FillForm.dart:2191-2226`).
- **`<deliverablepath>` sequence doc** (default DB) — `.update({fileref: arrayUnion([doc(formPath)]), status:"completed"})` non-queue submit (`FillForm.dart:2307-2310`).
- **`participantsproduct`** (default DB, doc `{participantproductid}`) — `{status, statusdate}` (`AppServices.dart:1070-1076`).
- **`participantdeliverysequence`** (default DB, doc `{profileid}`) — full record update setting delivery/product statuses (`AppServices.dart:1083`).
- **`plantogether`** (default DB) — **DEAD**, `response.{profileid}` vote write would occur at `planTogether.dart:182-188`.
- **Referenced (not written by this cluster) collections:** `queue_token` (`firestore-forms`, doc ref built for `queuetokenref`), `big participants assignments` (`firestore-forms`, ref passed in `metadata` by bigactivity caller). These are reference-only here.

## Endpoints & external services

- **Firestore — default database** (`FirebaseFirestore.instance`): template read (`delivery forms`), journey update (`participantdeliverysequence`, `participantsproduct`, sequence doc), `plantogether` (dead). (`FillForm.dart:59`)
- **Firestore — named database `firestore-forms`** (`FirebaseFirestore.instanceFor(app, databaseId:"firestore-forms")`): all draft + submitted-form reads/writes (`temporary_forms`, `formsByClient`, `queue_token`). (`FillForm.dart:60`) — **This named DB is load-bearing for the whole forms feature and must exist in the test project.**
- **No HTTP / Dio / Cloud Functions / `httpsCallable`** in either file (grep clean).
- **No `FirebaseStorage.ref()`** in this cluster; media is streamed from absolute URLs already embedded in the template (`field["options"][0]`) via `just_audio` (audio) and `video_player` (video).
- **Error telemetry:** `appService.logException(exception, stack)` on draft/submit failures (`FillForm.dart:398,405,421,2248,2317`). (Implementation writes to an exceptions collection per `AppServices.dart`; out of cluster scope.)

## Config & feature flags

- **No `remoteConfig` / `RemoteConfig`** references in either file.
- **No `FirebaseMessaging` / `posthog` / `SharedPreferences` / `localstorage`** references in either file.
- **In-code (commented) flags** in `_FillForm.initState`: `draftCollectionName="temporary_forms"`, `collectionName="formsByClient"` — commented alternatives `big_temporary_forms` / `bigformassignment` for `deliverablepath=="bigactivity"` are **disabled** (always uses the non-big collections regardless of `bigactivity`) (`FillForm.dart:97-98,250,415`). Behavior gating is by `widget.deliverablepath` string value, not a remote flag: values observed — `queueform`, `modechecklist`, `workshop`, `appactionpending`, `bigactivity`, `''` (view mode), and full sequence-ref paths (journey path).
- **Data-driven field config** (per form-template field, not remote): `required`, `mincount`/`maxcount` (multiselect), `maxitems` (array), `flipping`/`flippingquestion`, `fielddescription`, `fieldnotes`, `options`.

## Dead / clone / Old code

- **`planTogether.dart` (entire `Plantogether` widget)** — compiles but **unreachable**: only constructed inside the commented-out `planTogetherBox()` in `homeContent.dart` (`6513-6593`), itself only called from a commented line (`homeContent.dart:8408`); its data source (`plantogether` query) is commented (`homeContent.dart:4641-4712`) and `planTogetherDates` stays `{}`. Treat as DEAD (F13).
- **`FillForm.dart:947-993`** — commented-out duplicate `textfield(...)` builder (old version).
- **`FillForm.dart:1107-1122`** — commented-out old multiselect validator block.
- **`FillForm.dart:2118-2182`** — commented-out old inline "Submit" button (`Column`/`TextButton`) that wrote directly to default-DB `formsByClient` using the **old** widget API (`widget.form["path"]`, `widget.form["name"]`). Superseded by the Preview→`submitform()` flow.
- **`FillForm.dart:2320-2339`** — commented-out old `updateJourney` body (wrote `participantJourneySequence/{journeyID}` + default-DB sequence `status:"ongoing"`). Superseded by 3-arg `appService.updateDeliveryStatus`.
- **`FillForm.dart:572-586`** — commented-out old audio play/pause block.
- **Dead call-site (caller, not this cluster):** `Journey Dashboard/participantDeliverySequence.dart:336` constructs `FillForm` with the **old** signature (`form:`, `clientid:`, `journeyData:`) and is inside a `/* ... */` block (closes `:354`) — does not compile against current `FillForm` and is unreachable. `Journey Dashboard/participantJourneySequence.dart:1112,1212,1278` and `Widgets/Themes.dart:1194` also contain FillForm references (some commented) — verify per-caller before treating as live.

## Notes & open questions

- **Cross-database `fileref` mismatch (potential bug):** F7 writes `fileref = arrayUnion([firestoreDefault.doc(formPath)])` where `formPath` is a `formsByClient` path that lives in the **`firestore-forms`** named DB, but the ref is created with the **default** DB handle (`FillForm.dart:2308`). The stored DocumentReference may therefore point at a non-existent doc in the default DB. Flagged for review — not in scope to fix here.
- **`updateJourney` non-queue path is partially legacy:** it calls `firestoreDefault.doc(widget.deliverablepath).update(...)` expecting `deliverablepath` to be a full sequence-ref path, then `appService.updateDeliveryStatus(deliverablepath, profileid, "completed")`. The live string deliverablepaths (`queueform`, `modechecklist`, etc.) all take the *pop-with-path* branch instead, so this journey branch is exercised mainly by the journey-dashboard/product-sequence callers that pass a real sequence path. Confirm which callers actually hit it.
- **Flipping slider has no autosave** (F9) — value can be lost if it's the last interaction before leaving; behavior nuance, not confirmed as intended.
- **`big_*` collections are dead-disabled** — even when `deliverablepath=="bigactivity"`, drafts/submissions go to `temporary_forms`/`formsByClient` (the big alternatives are commented out). `metadata.bigparticipantassignmentref` (a `big participants assignments` ref) is still merged into the submitted doc.
- **Named DB requirement for e2e:** the test Firebase project must provision the **`firestore-forms`** database, else all draft/submit/view features fail. This is the single biggest setup dependency for this cluster.
- **No ATC** anywhere in this cluster (grep matches for "atc" were substrings of `catchError`/`matching`). Nothing CI-excluded.
- **3 Firebase projects:** not referenced by name in these files (DB selection is by `databaseId`, not projectId).
