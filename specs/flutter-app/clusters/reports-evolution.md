# Cluster: Interim Report, Previous Cycle, Reports, Evolution Wishlist, Procedure Completed

> Key: `reports-evolution` · App: breakthroughs-flutter (native Flutter, branch `development`)
> Static code+config mapping pass — no build/run/Firestore queries performed.
> All `file:line` citations are relative to `breakthroughs-flutter/lib/`.

## Overview

This cluster is the participant's **progress-reflection & evolution-feedback** surface. It bundles five loosely-related journeys that all revolve around the participant looking back on their development and feeding signal forward to Antano & Harini (A&H) / their Excellence Installation Specialist:

1. **Interim Monthly Report** — a periodic (monthly) self-assessment wizard surfaced on the home feed and as a mandatory action. It walks the participant through 4 steps: (1) **Crossover Meter** (slider-rate progress toward an evolution goal, optionally "jump" to a higher level), (2) **Evolution Progress** (rate progress on each ATC adjustment + estimate hours saved → "years saved"), (3) **Love Letter** (free-text note to A&H), (4) **Interact with A&H / Ask A&H** (questions for A&H). Completion clears the `monthlyinterimreport` mandatory action.
2. **Interim / Previous Cycle (AEL)** — a one-off flow (triggered by the `previousael` mandatory action) where the participant watches an "Accelerator Evolution Cycle" (AEC) intro video and retro-rates where they were at their *previous* uP! cycle, writing a crossover metric back onto their participant-AEL record.
3. **Reports (read-only summaries)** — viewer screens for AI-generated summaries: **uP! Life Report** (evolution timeline + capabilities + summary), **B!G Interview Summary**, **Evolution Mapping Summary** (mindset-shift timeline), and **View Report Form** (timeline of submitted delivery forms, opens each in the shared FillForm viewer).
4. **Evolution Wishlist** — a home-feed card letting the participant invite friends/family (email or WhatsApp) to submit capability "wishlist" inputs that feed the next evolution cycle; supports send, cancel, and status display.
5. **Procedure Completed** (`procedurecompleted.dart`) — a standalone ATC procedure-completion form (answer a question template + authorisation code). **This specific file is a DEAD/CLONE** — the live procedure-completion screen is `arena Start CW/completeProcedure.dart` (different constructor); see Dead/clone section.

**Heavy ATC entanglement:** the Evolution Progress step (`evolutionProgress.dart`) and `procedurecompleted.dart` both read/write the ATC database (`atc_alpha` and its `corrections`/`procedures`/`QandA` subcollections). Those features are mapped here but flagged **ATC OFF-LIMITS — CI-excluded** per project constraints.

## Screens

| Screen | file:line | Purpose |
|---|---|---|
| OpenInterimReport | `Interim Report/openInterimReport.dart:11` | Home-feed teaser card for the interim report; shows "get ready" before due date, embeds InterimMonthlyReport once due. |
| InterimMonthlyReport | `Interim Report/interimMonthlyReport.dart:12` | "Track Your Evolution" intro/progress-stepper widget; CTA → CrossOver (Let's Begin / Resume). |
| CrossOver | `Interim Report/crossover.dart:9` | Step 01 "Crossover Meter" — slider-rate progress per crossover metric; optional "jump" to a higher evolution level. |
| EvolutionProgress | `Interim Report/evolutionProgress.dart:16` | Step 02 "Evolution Progress" — rate each ATC adjustment + hours-saved → years-saved. **ATC.** Also collects Date-of-Birth if missing. |
| LoveLetter | `Interim Report/loveLetter.dart:9` | Step 03 "Love Letter For A&H" — optional free-text note. |
| AskAH | `Interim Report/askAH.dart:9` | Step 04 "Interact with A&H" — "Ask A&H" + "Installation Ask A&H" free-text; finalises the report. |
| PreviousAEL | `Interim Previous Cycle/previousAEL.dart:12` | 2-screen flow: AEC intro video → retro-select evolution level per uP! category; writes crossover metric. |
| UPLifeReportSummary | `reports/upLifeReportSummary.dart:11` | Read-only viewer of uP! Life Report (Evolution Timeline, Summary, Capabilities, Timeline). |
| BigInterviewSummary | `reports/bigInterviewSummary.dart:9` | Read-only viewer of B!G Interview Summary (summary + capabilities). |
| EvolutionMappingSummary | `reports/evolutionMappingSummary.dart:10` | Read-only "My Journey" mindset-shift timeline. **No live entry point (commented-out caller).** |
| ViewReportForm | `reports/viewReportForm.dart:9` | Timeline list of a client's submitted forms; "View" opens each in FillForm. |
| SendEvolutionWishList | `evolution wishlist/sendEvolutionWishlist.dart:11` | Multi-contact form (name/relation + email or phone) to invite friends/family; AEC trailer video. |
| OpenEvolution | `evolution wishlist/openEvolution.dart:9` | Home-feed Evolution-Wishlist card (status text, Share / cancel / close). |
| CompleteProcedure (DEAD clone) | `procedurecompleted.dart:7` | ATC procedure completion form (QandA + authorisation code). **Superseded; no callers.** |

## Features

### Open / preview Interim Report on home feed
- **What the user does:** Sees a card on the home feed: before the due date a "Get ready to start preparing your Interim Report. Know More." teaser with the due date; "Know More" opens a related explainer video. Once `duedate` has passed, the card embeds the full InterimMonthlyReport intro inline.
- **Nav/entry:** Home feed (`Main Screen/homeContent.dart:7934` → `OpenInterimReport(interimLog: appService.interimReportLog)`); only shown when `appService.interimReportLog` is non-empty.
- **Reads:** `static meta data` doc `Interim Monthly Report` (`openInterimReport.dart:36`, fields incl. `docid`, used as `interimStaticData`/video content). `interimReportLog` is pre-loaded by home (`homeContent.dart:1323` query on `interimreport log` where `profileid==me` & `status==null`, order `lastupdate` desc, limit 1; only surfaced when `duedate`/`lockdate`/`remainderdate` set and now < `lockdate`).
- **Writes:** none directly (teaser only).
- **Endpoints:** "Know More" → `PlayRelatedVideo` (content/video player, outside this cluster).
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — gated purely on `interimreport log` data (duedate/remainderdate/lockdate/status); seed a log doc to surface the card. No ATC. The embedded InterimMonthlyReport CTA leads into the ATC step (see below).

### Start / resume the Interim Report wizard (intro stepper)
- **What the user does:** Reads "Track Your Evolution" intro, sees a 4-node progress stepper (Crossover Meter / ATC Progress / Love letter / Interact with A&H) reflecting how many `reports` steps are done, and taps **Let's Begin** (or **Resume Evolution Progress** if some steps exist) to enter CrossOver. A "Know More" video link shows only before starting.
- **Nav/entry:** Embedded by OpenInterimReport once due (`interimMonthlyReport.dart:55`); CTA → `CrossOver` (`interimMonthlyReport.dart:377`).
- **Reads:** uses `interimStaticData`/`reportData` from `static meta data/Interim Monthly Report`; reads `interimLog["reports"]` to compute stepper fill.
- **Writes:** none.
- **Endpoints:** "Know More" → PlayRelatedVideo.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes (navigation only).

### Interim Step 01 — Crossover Meter (rate progress / jump level)
- **What the user does:** For each crossover metric on their active participant-AEL, drags a 0–10 slider to show progress toward the goal ("startpoint to endpoint"). If progress > 7 and not already at the top level, a "Tip: Set a New Higher Goal" chip opens a dropdown to **jump** to the next evolution level (sets metric to 10, marks "Jumped"); the jump can be cancelled. Taps **Update & Continue**.
- **Nav/entry:** From InterimMonthlyReport CTA, or from the `monthlyinterimreport` mandatory action (`Widgets/actionPending.dart:323` → `CrossOver`). Skips itself (`moveNext`) if `reports` already contains `"crossover"`.
- **Reads:** `participant AEL` where `profileid==me` (`crossover.dart:89`); picks the `status=="ongoing"` doc, else the most recent with a non-empty `crossovermetric`. `accelerated evolution level` (all docs) for the ordered list of `endpoint`s used to compute jump targets (`crossover.dart:122`).
- **Writes:** `interim crossover` new doc (`crossover.dart:177`) with `aelid, profileid, metric{startpoint,endpoint,metric,jumpedfrom}, created, docid, interimlogid`. Updates `participant AEL/{aelid}.crossovermetric` (`crossover.dart:186`). Updates `interimreport log/{interimlogid}` arrayUnion `reports:["crossover"]` (`crossover.dart:191`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — needs a seeded `participant AEL` doc with a `crossovermetric` map and `accelerated evolution level` reference docs (both are non-ATC participant/config collections). No ATC.

### Interim Step 02 — Evolution Progress (per-adjustment rating + hours-saved) — ATC
- **What the user does:** For each non-completed ATC adjustment, picks a 5-point radio (No Change … Completely Changed). If "No Change", chooses a reason (Less Intensity / Less Frequency / No noticeable improvement). Otherwise enters hours saved per Day/Week (validated ≤24/≤168) → app computes "years saved". Inline validation auto-scrolls to the first incomplete field. Taps **Submit**. If date-of-birth is missing, an interstitial collects it first (needed for the years-saved math).
- **Nav/entry:** From CrossOver (`evolutionProgress.dart` via CrossOver.moveNext), or directly from the `evolutionprogress` mandatory action (`actionPending.dart:292`, `EvolutionProgress(interimLog:{}, reportData:{})`). Skips itself if `reports` contains `"evolutionprogress"`.
- **Reads (ATC db `firestore-atc`):** `atc_alpha` where `isdelete==false & profileid==me & product in [A&H, A&H ATC, Expanding Horizon, uP!, LYL, B!G] & prescription_date<=yesterday`, order `prescription_date` desc (`evolutionProgress.dart:235`); per-ATC subcollection `corrections` where `isdelete==false` (`:262`); per-correction subcollection `procedures` where `isdelete==false` (`:304`). **ATC OFF-LIMITS.**
- **Reads (default db):** `evolution progress draft/{interimlogid}` (autosave restore, `:128`); `bigactivity` all docs (`:216`); profile/procedure maps via `AppService().mapProfile()/mapProcedure()`; `profile_data` where `profileid==me` (`:546`, for DOB write).
- **Writes (ATC db):** batch updates each `corrections` doc with `totalhoursaved`, `savedyears`, `totalhoursavedtime` (`:446`); updates last `atc_alpha` doc `evolutionprogressdate` (`:487`). **ATC OFF-LIMITS.**
- **Writes (default db):** `evolution progress draft/{interimlogid}` autosave on every field change (`:108`) and `{delete:true}` on submit (`:499`); `interimreport log/{interimlogid}` arrayUnion `reports:["evolutionprogress"]` (`:492`); `profile_data/{id}.dateofbirth` if DOB collected (`:550`).
- **Endpoints:** none (Posthog imported `:12` and instantiated `:43` but never invoked — no capture calls).
- **Config flags:** none.
- **Journey stage:** progression (delivery/ATC-adjacent).
- **e2e-testability:** **No — ATC OFF-LIMITS, CI-excluded.** Reads/writes `atc_alpha` + `corrections`/`procedures` in the `firestore-atc` database. Map that it exists; never seed/test. (The DOB-collection and draft-autosave sub-behaviours are technically non-ATC but are reached only through the ATC-gated screen, so the whole step is excluded.)

### Interim Step 03 — Love Letter for A&H
- **What the user does:** Writes an optional free-text "love letter" to A&H ("how your life has changed"), taps **Share My Thoughts & Continue**. Auto-skips if already submitted.
- **Nav/entry:** From EvolutionProgress.moveNext (`evolutionProgress.dart:524` → LoveLetter). Skips if `reports` contains `"loveletter"` (`loveLetter.dart:33`).
- **Reads:** uses `reportData["loveletterquestion"]` from interim static meta (fallback default question).
- **Writes:** `love letter` new doc (`loveLetter.dart:56`) `{profileid, loveletter, interimlogid, created, docid}` (only if non-empty); `interimreport log/{interimlogid}` arrayUnion `reports:["loveletter"]` + `lastupdate` (`:64`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression / social (participant→A&H).
- **e2e-testability:** Yes — pure default-db writes; reachable standalone if seeded with an `interimreport log` whose `reports` already contains `crossover`+`evolutionprogress` (so the ATC step is skipped). **Caveat:** the canonical happy-path arrives here only *through* the ATC step, so a clean e2e likely seeds the `reports` array to jump past ATC.

### Interim Step 04 — Interact with A&H / Ask A&H (finalise report)
- **What the user does:** Fills "ASK A&H" (top question) and "INSTALLATION ASK A&H" (most-valuable question), taps **Finish and Submit My Report**. Shows success snackbar, marks the report `status:"completed"`, and removes the `monthlyinterimreport` mandatory action.
- **Nav/entry:** From LoveLetter.moveNext (`loveLetter.dart:44` → AskAH).
- **Reads:** uses `reportData["askahquestion"]` from interim static meta.
- **Writes:** `ask AH` new doc (`askAH.dart:35`) `{profileid, askah, installationaskah, interimlogid, created, docid}` (only if both non-empty); `interimreport log/{interimlogid}` arrayUnion `reports:["askah"]` + `status:"completed"` (`:44`); `appactionpending/{profileid}` arrayRemove `mandatoryaction:["monthlyinterimreport"]` (`:67`). Pops twice back to home.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression / social.
- **e2e-testability:** Yes — default-db writes only; completes the wizard and clears the mandatory action. Same reachability caveat as Step 03 (sits after the ATC step).

### Previous Cycle (AEL) — watch AEC intro
- **What the user does:** On the `previousael` mandatory action, sees a "What is AEC? / Accelerator Evolution Cycle" screen with a tappable intro video (BetterPlayer HLS), taps **Let's Begin** to advance to level-selection.
- **Nav/entry:** `previousael` mandatory action (`Widgets/actionPending.dart:279` → `PreviousAEL(previousCycle: previousAEL)`); `previousAEL` resolved from `participant AEL` where `profileid==me & status=="completed"`, picking the latest by tentative start/end with empty `crossovermetric` (`actionPending.dart:265`).
- **Reads:** `accelerated evolution level` all docs (`previousAEL.dart:46`); `atc model` where `atcmodel=="uP!"` (`:52`, reference-only config — the safe "atc model" collection, not ATC participant data); `static meta data` doc `Accelerator Evolution Cycle` (`:63`, AEC video).
- **Writes:** none on this screen.
- **Endpoints:** Publit.io HLS video (`https://media.publit.io/file/{id}.m3u8`) or `contentData['url']` (`previousAEL.dart:92`).
- **Config flags:** none.
- **Journey stage:** progression / content.
- **e2e-testability:** Yes — gated on a seeded `participant AEL` (status completed, empty crossovermetric) + `accelerated evolution level` + `atc model(uP!)` reference docs + AEC static-meta. Note: `atc model` is the **reference-only** "atc model" config collection (explicitly safe per CLAUDE.md), not ATC participant data.

### Previous Cycle (AEL) — retro-select evolution level & update
- **What the user does:** For each uP! model category (from `atc model`), picks "where you were in the previous uP! cycle" from a dropdown of evolution levels (startpoint→endpoint). Taps **Update My Level**; validates all categories chosen.
- **Nav/entry:** Second screen of PreviousAEL (`previousAEL.dart:262`).
- **Reads:** uses `upModelData` (from `atc model` uP!) + `evolutionLevel` (from `accelerated evolution level`).
- **Writes:** batch — `participant AEL/{aelid}.crossovermetric` set to the chosen per-category metrics (`previousAEL.dart:637`); `interim crossover` new doc `{docid, aelid, created, metric, profileid}` (`:638`). Pops with `true` so the action is removed.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — writes only default-db collections (`participant AEL`, `interim crossover`). No ATC participant data.

### View uP! Life Report summary
- **What the user does:** Opens a read-only "Evolution Timeline / Evolution Summary / Capabilities / Timeline" report (AI-generated). Can expand the summary (Read More) and tap **View Report** to open the underlying submitted forms.
- **Nav/entry:** From `productLevel/evolve.dart:1246` ("View My Evolution Timeline" button) → `UPLifeReportSummary(data: lifeReportSummary!)`. Data pre-fetched in evolve.dart from `uP Life Report Summary/{profileid}` where `delete==false` (`evolve.dart:230`).
- **Reads:** none in-screen (data passed in via constructor). Source collection: `uP Life Report Summary` (doc id = profileid).
- **Writes:** none.
- **Endpoints:** capability/timeline images via CachedNetworkImage (`imageurl`); "View Report" → ViewReportForm (`upLifeReportSummary.dart:192`).
- **Config flags:** none.
- **Journey stage:** progression / content (read-only report).
- **e2e-testability:** Yes — seed a `uP Life Report Summary/{profileid}` doc `{delete:false, summary, capabilities[], timeline[], startdate, enddate, selectedforms[]}`; reach via the uP! (evolve) product tab. Non-ATC.

### View B!G Interview summary
- **What the user does:** Opens a read-only "B!G Interview Summary" with title, period, summary (Read More), and a capability list.
- **Nav/entry:** From `productLevel/impact.dart:754` → `BigInterviewSummary(data: bigInterviewSummary)`. Data pre-fetched in impact.dart from `Big Interview Summary/{profileid}` where `delete==false` (`impact.dart:139`).
- **Reads:** none in-screen (constructor data; commented-out self-fetch at `bigInterviewSummary.dart:63`). Source collection: `Big Interview Summary` (doc id = profileid).
- **Writes:** none (a `.set(...)` seed block at `:28` is fully commented out — dev seeding only).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression / content (read-only report).
- **e2e-testability:** Yes — seed `Big Interview Summary/{profileid}` `{delete:false, title, startdate, summary, capabilities[]}`; reach via the B!G (impact) product tab. Non-ATC.

### View Evolution Mapping Summary ("My Journey")
- **What the user does:** Views a timeline of "Summary of Mindset Shifts" (title + month + description) and a "View My Evolution Summary" button (no-op onTap).
- **Nav/entry:** **None live.** The only navigator call is inside a `/* ... */` block-comment in `productLevel/evolve.dart:1300`. The screen is otherwise fully implemented.
- **Reads:** `Evolution Mapping Summary/{profileid}` (`evolutionMappingSummary.dart:53`, fields `summary[]{title,description,startdate}`).
- **Writes:** none live (a `.set(...)` seed block at `:27` is commented out).
- **Config flags:** none.
- **Journey stage:** progression / content.
- **e2e-testability:** No — **no reachable entry point** in the current build (commented-out caller). Map that it exists; not e2e-coverable without code change. Non-ATC.

### View submitted report forms (timeline)
- **What the user does:** Sees a vertical timeline of their submitted forms (by name); taps **View** to open each form read-only in the shared FillForm viewer.
- **Nav/entry:** From UPLifeReportSummary "View Report" (`upLifeReportSummary.dart:192` → `ViewReportForm(selectedForms: lifeReportSummary!['selectedforms'])`).
- **Reads:** `formsByClient` where `docid in <selectedForms>` (chunked by 10) (`viewReportForm.dart:46`).
- **Writes:** none (View → FillForm, outside this cluster).
- **Endpoints:** none in-screen.
- **Config flags:** none.
- **Journey stage:** progression / content.
- **e2e-testability:** Yes — requires `selectedforms` ids on the uP! Life Report plus matching `formsByClient` docs. Non-ATC. (Opening a form delegates to `Delivery Form/FillForm.dart`, mapped by the delivery-forms cluster.)

### Evolution Wishlist — home-feed card (status / share / cancel / close)
- **What the user does:** Sees an "Evolution Wishlist" card whose content depends on status: `initiated` → prompt + **Share Wishlist Request** button (opens the send form); `sent`/`sended` → "request sent" message (Read More); `completed` → congratulations message. A close (X) button cancels (if `initiated`, sets `status:'cancelled'` + `closedbeforeshare:true`) or dismisses (`closed:true`). Hidden entirely if `closed`/`closedbeforeshare`.
- **Nav/entry:** Home feed (`homeContent.dart:7931` → `OpenEvolution(evolutionLog: appService.evolutionWishlist)`); shown only when `appService.evolutionWishlist` non-empty. Source: `evolutionwishlistlog` where `profileid==me & status in [sent,sended,initiated,completed]`, order `created` desc, limit 1 (`homeContent.dart:1242`).
- **Reads:** on return from send form, re-reads `evolutionwishlistlog/{docid}` to refresh status (`openEvolution.dart:117`).
- **Writes:** `evolutionwishlistlog/{docid}` — cancel: `{closedbeforeshare:true, status:'cancelled'}` (`openEvolution.dart:226`); close: `{closed:true}` (`:250`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social / progression.
- **e2e-testability:** Yes — seed an `evolutionwishlistlog` doc per status to drive each branch. Non-ATC.

### Evolution Wishlist — send invites to friends/family
- **What the user does:** Watches an AEC trailer video, then adds one or more contacts (full name, relation, and either an email or a phone number with country code + per-country length validation). Can add/remove contacts, toggle email/WhatsApp per contact. Taps **Send** to dispatch invites; read-only ("Sent") if already sent/completed.
- **Nav/entry:** From OpenEvolution "Share Wishlist Request" (`openEvolution.dart:113` → `SendEvolutionWishList(evolutionLog: appService.evolutionWishlist)`).
- **Reads:** `static meta data` doc `wishlist` → `family` sub-map for the trailer video (`sendEvolutionWishlist.dart:259`).
- **Writes:** `evolutionwishlistlog/{docid}` update `{status:'sent', contacts:[{name,relation,contact,type}], sent:serverTimestamp}` (`sendEvolutionWishlist.dart:465`). (Email type `"gmail"`, phone type `"number"`, contact = `+CCdigits`.)
- **Endpoints:** AEC trailer via Publit.io HLS / `url` (`:275`). Actual email/WhatsApp delivery is server-side (a Cloud Function/back-office presumably reacts to the `sent` status — **not** invoked from the app).
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes (app side) — seed an `evolutionwishlistlog` (status `initiated`) + `static meta data/wishlist`, fill contacts, submit, assert the doc flips to `sent` with `contacts`. The downstream invite dispatch is out-of-app and not asserted. Non-ATC.

### Complete ATC procedure (QandA + authorisation code) — DEAD CLONE, ATC
- **What the user does:** (In the live twin) answers a procedure's question template, enters an authorisation key code, and submits to mark the ATC procedure `completed`, archiving prior answers as revisions.
- **Nav/entry:** **None for THIS file.** `procedurecompleted.dart`'s `CompleteProcedure(atcprocedureref, procedureref, adjustment, procedure, time)` constructor has zero callers. All live `CompleteProcedure(...)` usages import `arena Start CW/completeProcedure.dart` (signature `livechangeworkdata:`), e.g. `Services/AppServices.dart:3618`, `Widgets/Themes.dart:6795/6841`, `Main Screen/participantATC.dart:403/1163`.
- **Reads (ATC-adjacent):** `questiontemplate` where `procedure reference==procedureref` (`procedurecompleted.dart:222`); `authorisation_key_code` where `code==<entered>` (`:134`); the passed `atcprocedureref` `QandA` subcollection (`:61`).
- **Writes (ATC-adjacent):** `atcprocedureref.status:"completed"` (`:181`); `atcprocedureref/QandA/{docid}` (`:184`); `QandA/.../answer_revisions` (`:161`); `authorisation_key_code` doc `{used:true, used_by}` (`:195`); references `user_data/{uid}`.
- **Config flags:** none.
- **Journey stage:** delivery / ATC.
- **e2e-testability:** **No — DEAD/CLONE + ATC OFF-LIMITS.** The file is superseded (no callers) and it operates on ATC procedure references. Do not seed/test. (The live procedure-completion screen belongs to the arena/ATC cluster.)

## Firestore collections

### Read
- `static meta data` — docs `Interim Monthly Report` (interim wizard copy/video; `openInterimReport.dart:36`, `actionPending.dart:68`), `Accelerator Evolution Cycle` (`previousAEL.dart:63`), `wishlist`→`family` (`sendEvolutionWishlist.dart:259`). Reference/config.
- `participant AEL` — where `profileid==me` (+ `status` ongoing/completed, `crossovermetric` emptiness) — active/previous evolution record (`crossover.dart:89`, `previousAEL.dart` via actionPending, `actionPending.dart:265`).
- `accelerated evolution level` — all docs; ordered list of evolution-level start/endpoints (`crossover.dart:122`, `previousAEL.dart:46`).
- `atc model` — where `atcmodel=="uP!"` — uP! category model (`previousAEL.dart:52`). **Reference-only "atc model" config — safe per CLAUDE.md.**
- `interimreport log` — where `profileid==me & status==null` order `lastupdate` desc limit 1 (home, `homeContent.dart:1323`); and in `actionPending.dart:303`. Drives wizard step state (`reports[]`, `duedate/remainderdate/lockdate/status`).
- `evolution progress draft` — doc id = interimlogid; autosave restore (`evolutionProgress.dart:128`). **(reached only via ATC step)**
- `bigactivity` — all docs; activity-name map (`evolutionProgress.dart:216`). **(reached only via ATC step)**
- `profile_data` — where `profileid==me`; DOB write target (`evolutionProgress.dart:546`).
- `uP Life Report Summary` — doc id = profileid, where `delete==false` (fetched in `evolve.dart:230`; viewer `upLifeReportSummary.dart`).
- `Big Interview Summary` — doc id = profileid, where `delete==false` (fetched in `impact.dart:139`; viewer `bigInterviewSummary.dart`).
- `Evolution Mapping Summary` — doc id = profileid (`evolutionMappingSummary.dart:53`). **(viewer has no live entry point)**
- `formsByClient` — where `docid in <selectedForms>` (`viewReportForm.dart:46`).
- `evolutionwishlistlog` — where `profileid==me & status in [...]` (home, `homeContent.dart:1242`); per-doc refresh (`openEvolution.dart:117`).
- **ATC (firestore-atc db) — OFF-LIMITS:** `atc_alpha` (+ subcollections `corrections`, `procedures`) (`evolutionProgress.dart:235/262/304`).
- **ATC-adjacent (DEAD clone) — OFF-LIMITS:** `questiontemplate` (`procedurecompleted.dart:222`), `authorisation_key_code` (`:134`), `atcprocedureref`/`QandA` subcollection (`:61`), `user_data` (ref).

### Written
- `interim crossover` — new docs (Crossover step `crossover.dart:177`; PreviousAEL `previousAEL.dart:638`): `{aelid, profileid, metric{...}, created, docid, interimlogid}`.
- `participant AEL` — `{aelid}.crossovermetric` update (`crossover.dart:186`, `previousAEL.dart:637`).
- `interimreport log` — `{interimlogid}` merge: arrayUnion `reports:[...]`, `lastupdate`, and on finalise `status:"completed"` (`crossover.dart:191`, `loveLetter.dart:64`, `askAH.dart:44`, `evolutionProgress.dart:492`).
- `love letter` — new doc `{profileid, loveletter, interimlogid, created, docid}` (`loveLetter.dart:56`).
- `ask AH` — new doc `{profileid, askah, installationaskah, interimlogid, created, docid}` (`askAH.dart:35`).
- `appactionpending` — `{profileid}` merge arrayRemove `mandatoryaction:["monthlyinterimreport"]` (`askAH.dart:67`). (Also written *elsewhere* — `homeContent.dart:1346` arrayUnion to ADD `monthlyinterimreport` when locked; that producer is in the home cluster.)
- `evolution progress draft` — `{interimlogid}` autosave + `{delete:true}` on submit (`evolutionProgress.dart:108/499`). **(reached only via ATC step)**
- `profile_data` — `{id}.dateofbirth` (`evolutionProgress.dart:550`).
- `evolutionwishlistlog` — `{docid}` updates: send `{status:'sent', contacts[], sent}` (`sendEvolutionWishlist.dart:465`); cancel `{status:'cancelled', closedbeforeshare:true}` / close `{closed:true}` (`openEvolution.dart:226/250`).
- **ATC (firestore-atc db) — OFF-LIMITS:** `atc_alpha` `corrections` docs (`totalhoursaved/savedyears/totalhoursavedtime`), `atc_alpha` `evolutionprogressdate` (`evolutionProgress.dart:446/487`).
- **ATC-adjacent (DEAD clone) — OFF-LIMITS:** `atcprocedureref` status + `QandA` + `answer_revisions`, `authorisation_key_code` `{used,used_by}` (`procedurecompleted.dart:181/184/161/195`).

## Endpoints & external services
- **Publit.io HLS video** — `https://media.publit.io/file/{responsepublitio.id}.m3u8` (or content `url`) played via BetterPlayer: PreviousAEL AEC intro (`previousAEL.dart:92`), Evolution-Wishlist trailer (`sendEvolutionWishlist.dart:275`).
- **CachedNetworkImage** — capability/timeline thumbnails in uP! Life Report (`upLifeReportSummary.dart` `imageurl`).
- **PlayRelatedVideo** (in-app content player, outside cluster) — "Know More" links from OpenInterimReport / InterimMonthlyReport.
- **FillForm** (`Delivery Form/FillForm.dart`, outside cluster) — opens submitted forms from ViewReportForm.
- No Cloud Functions / `httpsCallable` / Dio / Storage `.ref()` calls are made from any file in this cluster. (Email/WhatsApp wishlist delivery is presumed server-side, reacting to the `evolutionwishlistlog.status='sent'` write — not invoked client-side.)
- **Firebase databases referenced:** default Firestore (all participant/report collections) and `firestore-atc` (`FirebaseFirestore.instanceFor(... databaseId: "firestore-atc")`, `evolutionProgress.dart:31`). No explicit reference to the 3 *projects* (`fir-sample-aae4a`/`starlabs-test`/staging) in these files.

## Config & feature flags
- **None.** No `RemoteConfig`/`remoteConfig` usage anywhere in the cluster (grep-confirmed). No SharedPreferences/local-storage. No FCM in-cluster.
- **Posthog:** imported and instantiated in `evolutionProgress.dart:12/43` (`Posthog posthog = Posthog();`) but **never called** — no analytics capture in this cluster. Effectively dead import.

## Dead / clone / Old code
- **`procedurecompleted.dart` (entire file) — DEAD/CLONE.** Its `CompleteProcedure(atcprocedureref, procedureref, adjustment, procedure, time)` has **zero callers** (grep `atcprocedureref:` → none). The live procedure-completion screen is `arena Start CW/completeProcedure.dart` (`CompleteProcedure(livechangeworkdata:)`), imported by AppServices/Themes/participantATC. Touches ATC → would be CI-excluded regardless.
- **`reports/evolutionMappingSummary.dart` — orphaned (no live entry).** The only navigator to it is inside a `/* ... */` block comment in `productLevel/evolve.dart:1300`. Screen fully implemented but unreachable in the current build. Its dev-seed `.set(...)` block (`:27`) is commented out.
- **`reports/bigInterviewSummary.dart`** — large `.set(...)` seed block (`:28`) and a self-fetch block (`:63`) are commented out; live data arrives via constructor from `impact.dart`. Screen itself is live.
- **`interimMonthlyReport.dart`** — two earlier stepper layouts (`:77`–`:235`) and an alternate `Scaffold/Timeline` build (`:416`–`:527`) are commented out; only the third ListView stepper renders.
- **`crossover.dart`** — large commented-out blocks: legacy `interim crossover` time-window query + `metrics/selectedValues` model (`:52`–`:159`), "My Evolution Goal" card (`:254`–`:292`), an earlier dropdown variant (`:488`–`:525`), and a temp nav button (`:704`–`:732`). Live path uses `participant AEL.crossovermetric`.
- **`evolutionProgress.dart`** — commented-out `UserData`/`RadioListTile`/`Slider` variants and an `autogeneralized` procedure-update block (`:451`–`:463`); `Posthog` import unused (see Config).
- **`previousAEL.dart`** — commented-out `advGoal` toggle UI (`:285`–`:311`) and "Comprehensive/Overall" switch; only the per-category (`advGoal==true`) branch is reachable since the toggle is removed.
- **`openEvolution.dart`** — commented-out `ElevatedButton` variant of the share button (`:149`–`:184`).
- **`askAH.dart`** — commented-out "installation ask" hint text and date-field writes (`:51`–`:53`, `:158`–`:165`).
- **`loveLetter.dart`** — commented-out "Temp btn (Ask AH)" (`:167`–`:196`).
- Note: files use URL-encoded imports (`Interim%20Report/...`, `evolution%20wishlist/...`) due to spaces in directory names — normal, not dead.

## Notes & open questions
- **Two `CompleteProcedure` classes** exist (`procedurecompleted.dart` vs `arena Start CW/completeProcedure.dart`). The assigned one is the dead clone; the live one (with `livechangeworkdata`) belongs to the arena/ATC cluster and should be mapped there. Both are ATC and CI-excluded.
- **ATC boundary inside the interim wizard:** the wizard is a 4-step chain (Crossover → EvolutionProgress[ATC] → LoveLetter → AskAH). Steps 1/3/4 + PreviousAEL touch only default-db participant collections and ARE e2e-testable; **Step 2 is ATC** and must be excluded. A realistic full-wizard e2e will need to seed the `interimreport log.reports` array to *skip* the ATC step, or test the non-ATC steps in isolation. Flag this for Phase-3 design.
- **Mandatory-action coupling:** these flows are driven by `appactionpending.mandatoryaction` values `monthlyinterimreport`, `evolutionprogress`, `previousael` (consumed in `Widgets/actionPending.dart`) and by home-feed subscriptions to `interimreport log` / `evolutionwishlistlog`. To surface any flow in e2e you seed the corresponding source doc; the producers of the mandatory actions live in the home/action-pending clusters.
- **`interim crossover` write fan-out:** both the Crossover step and PreviousAEL write `interim crossover` + mutate `participant AEL.crossovermetric` — they are alternative entry points to the same crossover-metric model (interim-monthly vs previous-cycle retro). Confirm with data whether both run for the same participant.
- **Wishlist delivery** (email/WhatsApp) is not performed in-app; assumed to be a back-office/Cloud-Function reaction to `status:'sent'`. Not assertable from the Flutter e2e beyond the Firestore write.
- **Report viewers are seed-only:** uP! Life Report, B!G Interview Summary, and (orphaned) Evolution Mapping Summary are AI-generated server-side; the app only reads them keyed by `profileid`. e2e coverage = seed the summary doc, navigate, assert render.
