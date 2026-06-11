# Cluster: Journey Dashboard, Mode Widget, Know-Your-Journey, Product Level

> Repo: `breakthroughs-flutter` (native Flutter, branch `development`).
> Static code+config map. Evidence cited as `file:line`. ATC surfaces flagged OFF-LIMITS.
> Firebase storage/video references point at `fir-sample-aae4a` (production) — see Endpoints.

## Overview
This cluster is the participant's **"where am I in my journey + what do I do next"** surface plus the three **Product-Level destinations** (Evolve / Legacy / Impact) that summarise long-term transformation. Three concerns:
1. **Journey Dashboard** — read-only views of the participant's purchased journey/products and the per-product delivery sequence. Hosted in a small tab shell (`JourneyDashboard`) that also embeds the Appointments and (ATC) timeline tabs from other clusters. `Know Your Journey` is a separate richer read-only journey overview (active / completed / all-products / add-ons).
2. **Mode Widget** — the active-product "mode checklist" of to-dos (`ModeChecklist`, embedded on the Home feed) and the action screens it launches: a Mode-Based Playlist hub (`ModePlaylist`) wrapping four content queues (General Content, Solar Voice, Ads Playlist, EiFlix), pending delivery Forms (`FillForm`), Do's & Don'ts, and two Evolution-Wishlist capture forms (Family/Peers, Self).
3. **Product Level** — `Evolve` (Accelerated Evolution cycles, AEL detail, uP! Life Report timeline), `Legacy` (Launch-Your-Legacy video, "Living Legacy" answer, before/after, request interview), `Impact` (BiG impact video, A&H Space touchpoints, BiG Interview Summary, BiG gamification, Humans-of-Excellence video-ask). `AELVersion` shows one Accelerated-Evolution-Level cycle with the EIS recommendation accept/decline action.

The participant reaches Journey/Know-Your-Journey from the profile dashboard; reaches Evolve/Legacy/Impact from the **"E / L / I" Product-Level box on the Home feed** (`homeContent.returnProductLevelBox()`, live at `Main Screen/homeContent.dart:8362`); and reaches Mode Widget action screens by tapping rows inside the embedded `ModeChecklist` (live at `Main Screen/homeContent.dart:8365`).

## Screens
| Screen | file:line | Purpose |
|---|---|---|
| JourneyDashboard (tab shell) | `Journey Dashboard/Journey Dashboard.dart:12` | 3-tab container: Journey / Appointments / **My ATC** (ATC tab = other cluster, off-limits). Admin/AH see a searchbar action. |
| ParticipantJourneySequence ("My Journey") | `Journey Dashboard/participantJourneySequence.dart:16` | Read-only expandable list of journeys→products→delivery steps; "Request Clarity Call" raises a ticket. Queue/event/form action helpers exist but their tap handlers are commented out (display-only). |
| ParticipantDeliverySequence ("Know Your Journey") | `Journey Dashboard/participantDeliverySequence.dart:11` | Read-only per-product delivery-sequence card list (status icons). All tap navigation commented out. |
| Knowyourjourney | `knowyourjourney.dart:9` | Read-only journey overview: Active Now, Journey + subscription dates, Recently Completed, All Products (consumed count), Add-on Purchase History. |
| ModeChecklist | `Mode Widget/modeChecklist.dart:15` | Embedded mode to-do list for active product(s): Mode-Based Playlist tile, pending Forms, todo widgets (evolutionwishlist / evolutionwishlistself / dodont). Mode pager when >1 checklist. |
| ModePlaylist | `Mode Widget/modePlaylist.dart:11` | Container hosting the 4 content queues for a mode checklist. |
| GeneralContentQueue | `Mode Widget/generalContentQueue.dart:8` | Horizontal "General Content" video thumbnails → PlayRelatedVideo. |
| SolarVoiceQueue | `Mode Widget/solarVoiceQueue.dart:10` | Horizontal Solar Voice playlists → SolarVoicePlaylist. |
| AdsPlaylistQueue | `Mode Widget/adsplaylistQueue.dart:12` | Horizontal Ads playlists → Adsplaylists. |
| EiFlixQueue | `Mode Widget/eiflixQueue.dart:10` | Horizontal EiFlix series → episode. |
| FormQueue | `Mode Widget/formQueue.dart:8` | Standalone list of mode forms → FillForm; updates checklist on submit. (Live entry only via `Widgets/Themes.dart` + `homeContent` dispatcher.) |
| DoDont | `Mode Widget/dodont.dart:7` | Do's & Don'ts read screen; marks checklist widget completed on open. |
| EvolutionWishlistFamily | `Mode Widget/evolutionWishlistFamily.dart:10` | Form: ask friends + peers (email/phone) for evolution capabilities; plays trailer; writes wishlist doc. |
| EvloutionWishlistSelf | `Mode Widget/evolutionWishlistSelf.dart:11` | Dynamic list of own capabilities; plays trailer; writes `participant AEL.mywishlist`. |
| LatestUpdates | `Mode Widget/latestupdates.dart:11` | Reusable image grid (passed images) with full-screen viewer. Used inside Evolve & Legacy. No own Firestore I/O. |
| ReviewATC (DEPRECATED, ATC) | `Mode Widget/reviewATC.dart.dart:17` | ATC review/adjustment screen. **OFF-LIMITS + dead** (`// Depreciated`, double `.dart.dart`). |
| Evolve | `productLevel/evolve.dart:18` | Accelerated-Evolution home: video, current cycle card → AELVersion, evolution-goal carousel, uP! Life Report Summary → UPLifeReportSummary, embedded ModeChecklist, ContinueWatch, Latest Updates. |
| AELVersion | `productLevel/aelVersion.dart:10` | One AEL cycle: current crossover metrics, metric history; **EIS recommendation Accept/Decline** writes participantresponse. |
| Legacy | `productLevel/legacy.dart:15` | Launch-Your-Legacy: video, "What's Your Living Legacy?" answer (writes), quiz link, before/after content, Request My Interview (ticket), Latest Updates. |
| Impact | `productLevel/impact.dart:22` | BiG Impact: video + learn-more link, embedded A&H Space, BiG Interview Summary → BigInterviewSummary, BiG Gamification embed, Humans of Excellence (post via ArenaVideoAsk / view via ViewSnippet). |
| AHSpace | `productLevel/ahSpace.dart:9` | A&H Space touchpoints: circular space selector + per-touchpoint summaries + disclaimer. `fullScreen:true` embedded in Impact; `fullScreen:false` standalone "View My All Touch Points". |
| StepperForm (uP! enrolment wizard) | `productLevel/stepper.dart:14` | 11-step uP! Accelerated-Evolution enrolment (D&I dates, AEC, goal, EIY, situation, worth, validation, congratulations). **DEAD — never navigated** anywhere in the app. |

## Features

### View My Journey (journeys → products → delivery steps)
- **What the user does:** Opens "My Journey" tab; expands each journey to see its products and ordered delivery steps with status icons (ready / completed / ongoing).
- **Nav/entry:** `JourneyDashboard` tab "Journey" (`Journey Dashboard/Journey Dashboard.dart:20`); the dashboard itself is pushed from profile/explore screens.
- **Reads:** `participantJourneySequence` where `profileid==pid` (snapshots, `participantJourneySequence.dart:120`); `deliverables` where `participantjourneyid==doc.id` (`:155`); maps `journey`,`products`,`appointmenttype`,`delivery forms`,`delivery report`,`delivery events`,`delivery queue` (`:220-298`); `profile_data/{pid}` for name (`:63`).
- **Writes:** none for the list view itself.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — seed `participantJourneySequence` + `deliverables` for a profile and assert the expandable list renders. Not ATC.

### Request Clarity Call (raise ticket)
- **What the user does:** Taps "Request Clarity Call" at the top of My Journey.
- **Nav/entry:** Button row item `i==0` (`participantJourneySequence.dart:966`).
- **Reads:** `chat config` (inside `appService.raiseTickets`, `Services/AppServices.dart:3653`).
- **Writes:** `clientissue` (new doc) + `clientissue/{id}/messages` subcollection, with `chatCategoryname:"Journey Related"`, message "I want to schedule a Journey Clarity Call." (`AppServices.dart:3671-3672`; `participantJourneySequence.dart:999`).
- **Endpoints:** none (Firestore batch).
- **Config flags:** none.
- **Journey stage:** support.
- **e2e-testability:** Yes — tap and assert a `clientissue` doc is created. Not ATC.

### Generate Queue Token / Request Event Participation / View Queue Stage (My Journey step actions)
- **What the user does:** (Designed) tap a delivery step to request a queue token, request event participation, view their queue stage position, or open a form.
- **Nav/entry:** Step `GestureDetector.onTap` in My Journey — **the entire onTap body is commented out** (`participantJourneySequence.dart:1090-1314`). Helper methods `generateQueueToken` (`:313`), `listUpcomingEvent` (`:766`), `viewStage` (`:473`), `displayQueueToken` (`:432`) are defined but currently unreachable from UI.
- **Reads:** `queue_token` (`:360`), `queue generation`/`queue variation` (`:497`), `event collection` where start_date>=now (`:778`).
- **Writes (when wired):** `queue_token` (new token, `:403`); `event participation request` (new, `:854`). NOTE: `AppService().updateDeliveryStatus(...)` calls are also commented out.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** No (currently) — actions are unreachable from the UI (dead tap handlers). Map as EXISTS; do not script until re-enabled. Not ATC.

### View Know-Your-Journey delivery sequence (read-only)
- **What the user does:** Sees each active/initiated product as a card with its delivery steps and status icons.
- **Nav/entry:** `ParticipantDeliverySequence()` pushed (route via `Widgets/Themes.dart:799`, `myjourney.dart:482/684`, `exploreSocial.dart:454`, `homeContent.dart:8656`, etc.).
- **Reads:** `participantdeliverysequence/{profileid}` (snapshots, `participantDeliverySequence.dart:60`); `participantsproduct` where `profileid==pid` orderBy sequenceorder (`:71`); `deliverables` where `profileid==pid` (`:81`); maps `products`,`appointmenttype`,`delivery forms`,`delivery report`,`delivery events`,`delivery queue` (`:97-164`).
- **Writes:** none (all onTap navigation commented out, `:291-353`).
- **Endpoints:** product images via `Image.network` (Firestore-stored URLs).
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes (display only) — seed `participantdeliverysequence` + `participantsproduct` and assert cards render. Not ATC.

### Know Your Journey overview (active / completed / all products / add-ons)
- **What the user does:** Reviews Active Now products, current Journey + subscription start/end, Recently Completed, All Products (consumed N/total), Add-on Purchase History.
- **Nav/entry:** `Knowyourjourney()` pushed from `Main Screen/myProfileDashboard.dart:1234` and `:1434`.
- **Reads:** `package` (`knowyourjourney.dart:54`); `journey` (`:61`); `products` (`:75`); `participantjourneyproduct` where `profileid==profileid` (`:79`). Also reads in-memory `appService.participantProductList`, `usermetadata`, `mappedProduct`, `profileJourneyProduct`.
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — depends on `appService.participantProductList` (loaded from participantsproduct elsewhere) + `participantjourneyproduct`/`journey`/`package`/`products`. Not ATC.

### Mode Checklist — view active-product to-dos
- **What the user does:** On the Home feed, sees the active product's mode + to-do tiles; pages between checklists if more than one.
- **Nav/entry:** Embedded live in Home feed (`Main Screen/homeContent.dart:8365`, guarded by `appService.participantModeChecklist.isNotEmpty`); also embedded in Evolve (`productLevel/evolve.dart:1334`).
- **Reads:** in-memory `appService.participantModeChecklist` / `mappedProduct`; `delivery forms` where documentId whereIn pending form ids (`modeChecklist.dart:81`).
- **Writes:** `participant mode checklist/{docid}` `widget` array on form submit (`modeChecklist.dart:108`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed `participant mode checklist` for the profile (loaded into appService) and assert tiles + navigation. Not ATC.

### Mode-Based Playlist (open + consume content)
- **What the user does:** Taps "Mode Based Playlist" tile → opens the playlist hub with General Content / Solar Voice / Ads / EiFlix rows; taps any item to play.
- **Nav/entry:** `ModeChecklist` "Mode Based Playlist" tile → `ModePlaylist(activeModeChecklist:)` (`modeChecklist.dart:254`).
- **Reads:** per-queue: `content_urls` whereIn ids (`generalContentQueue.dart:37`, capped at 30); `solar voice playlist` where id whereIn (`solarVoiceQueue.dart:30`); `adsplaylist` where docid whereIn (`adsplaylistQueue.dart:36`); `series` where id whereIn (`eiflixQueue.dart:30`).
- **Writes:** none (consumption/progress writes happen in the downstream player screens — other clusters).
- **Endpoints:** publit.io HLS for some content (via player); thumbnails over Firebase Storage / CDN.
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes — seed checklist `widget` with `reference` ids in `content_urls`/`solar voice playlist`/`adsplaylist`/`series`; assert rows populate and tap navigates. Not ATC.

### Complete a mode Form
- **What the user does:** Taps a pending form tile → fills `FillForm` → on submit the checklist marks the form completed.
- **Nav/entry:** `ModeChecklist` form tile (`modeChecklist.dart:352`) or `FormQueue` row (`formQueue.dart:135`).
- **Reads:** `delivery forms` where documentId/docid whereIn pending ids (`modeChecklist.dart:81`, `formQueue.dart:52`).
- **Writes:** `participant mode checklist/{docid}` `widget` (sets `result`,`completed`, and `status:"completed"` when all done) (`modeChecklist.dart:108`, `formQueue.dart:118`).
- **Endpoints:** none (form persistence handled by FillForm — other cluster).
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed a checklist with a `form` widget referencing a `delivery forms` doc; submit and assert `completed` grows. Not ATC.

### Read Do's & Don'ts
- **What the user does:** Taps a "dodont" tile → reads Do's and Don'ts lists; opening marks it completed.
- **Nav/entry:** `ModeChecklist` dodont tile → `DoDont(doDontContentData:, docid:)` (`modeChecklist.dart:550`); also reachable via `Widgets/Themes.dart:5251`, `myProfileDashboard.dart:3035`, `homeContent.dart:4087`.
- **Reads:** `participant mode checklist` where `profileid==profileid` & `docid==widget.docid` (`dodont.dart:27`).
- **Writes:** `participant mode checklist/{id}` `widget` → matching widget `status:"completed"` on open (`dodont.dart:34`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** delivery.
- **e2e-testability:** Yes — seed a `dodont` widget with `dos`/`donts`; open and assert status flips to completed. Not ATC.

### Evolution Wishlist — Family & Friends
- **What the user does:** Watches a trailer, enters a friend and a peer contact (email or phone w/ country code), submits.
- **Nav/entry:** `ModeChecklist` evolutionwishlist tile → `EvolutionWishlistFamily(activeChecklist:)` (`modeChecklist.dart:520`); also `myProfileDashboard.dart:3012`, `homeContent.dart:4073`.
- **Reads:** `static meta data/wishlist` → `family` trailer (`evolutionWishlistFamily.dart:32`).
- **Writes:** `evolution wishlist/{docid}` (new doc: aelid, mode, participantproductid, participantmodechecklistid, profileid, contact[], created) (`evolutionWishlistFamily.dart:110`); `participant mode checklist/{docid}` `widget` status:"completed" (`:119`).
- **Endpoints:** publit.io HLS trailer `https://media.publit.io/file/{id}.m3u8` (`evolutionWishlistFamily.dart:48`).
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — needs a checklist with `evolutionwishlist` widget + `static meta data/wishlist`; fill 2 valid contacts, submit, assert `evolution wishlist` doc + status. Not ATC.

### Evolution Wishlist — Self
- **What the user does:** Watches a trailer, adds/removes any number of "capabilities I want", submits.
- **Nav/entry:** `ModeChecklist` evolutionwishlistself tile → `EvloutionWishlistSelf(activeChecklist:)` (`modeChecklist.dart:539`); also `myProfileDashboard.dart:3023`, `homeContent.dart:4080`.
- **Reads:** `static meta data/wishlist` → `self` trailer (snapshots, `evolutionWishlistSelf.dart:33`); `participant AEL/{aelid}` → existing `mywishlist` (`:43`).
- **Writes:** `participant AEL/{aelid}` `mywishlist` (`evolutionWishlistSelf.dart:71`); `participant mode checklist/{docid}` `widget` status:"completed" (`:79`).
- **Endpoints:** publit.io HLS trailer (`evolutionWishlistSelf.dart:99`).
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — needs checklist `evolutionwishlistself` widget + a `participant AEL` doc; add items, submit, assert `mywishlist` written. Not ATC.

### Evolve — Accelerated Evolution home
- **What the user does:** Plays the Accelerated-Evolution video; sees the current cycle card ("Nth Cycle of Evolution", model, date) and "My Evolution Goal" carousel; opens ModeChecklist, ContinueWatch, Latest Updates.
- **Nav/entry:** Home "E" button → `Evolve(generalContentData:, modeplaylist:)` (`homeContent.dart:3878`).
- **Reads:** `static meta data/evolve` (video + latestupdates, `evolve.dart:166`); `participant AEL` where `profileid==profileid` & `flag=="validated"` (snapshots, `:180`); `Achievements/posts/postcollection` where profileid orderBy created limit 9 (`:197`); `uP Life Report Summary/{profileid}` (`:230`).
- **Writes:** none directly (embedded ModeChecklist writes; see its feature).
- **Endpoints:** publit.io HLS (via `appService.getContent`, videoFrom:"evolve").
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — seed `static meta data/evolve` + a validated `participant AEL`; assert sections render. Not ATC.

### Evolve — open AEL cycle details
- **What the user does:** Taps "View Details" on the current cycle card.
- **Nav/entry:** `Evolve` → `AELVersion(aelId:, aelData:)` (`evolve.dart:625`). AELVersion is also reachable from `home.dart:1681`, `notificationlog.dart:459`, `Services/AppServices.dart:3505`, `myProfileDashboard.dart:1906`.
- **Reads:** `interim crossover` where `aelid==aelId` (`aelVersion.dart:135`); `participant AEL/{aelId}` if no data passed (`:149`); `participant AEL` where `profileid==..` & `flag=="validated"` for timeline ordering (`:201`).
- **Writes:** see EIS recommendation feature.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — seed `participant AEL` + `interim crossover` for the aelid; assert metric current + history render. Not ATC.

### AEL — Accept/Decline EIS recommendation
- **What the user does:** When EIS recommends an AEL assessment ("Action Required"), taps "Accept & Confirm" or declines.
- **Nav/entry:** `AELVersion.eisRecommand()` buttons (shown when `changedMetrics` non-empty) (`aelVersion.dart:657` accept / `:684` decline).
- **Reads:** as AEL details above (drives the changed-vs-unchanged metric comparison from `interim crossover`).
- **Writes:** `participant AEL/{aelId}` `participantresponse` = `"accepted"` / `"notaccepted"` (merge) via `reponseUpdated` (`aelVersion.dart:229`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes — requires an AEL with all crossovermetric null + null participantresponse + ≥2 interim crossover docs (first validatedby null, a later one validated) to trigger the recommendation branch; tap and assert participantresponse written. Setup is intricate.

### Evolve — view uP! Life Report timeline
- **What the user does:** Reads the uP! Life Report summary card; taps "View My Evolution Timeline".
- **Nav/entry:** `Evolve` → `UPLifeReportSummary(data: lifeReportSummary)` (`evolve.dart:1246`).
- **Reads:** `uP Life Report Summary/{profileid}` (`evolve.dart:230`, only shown when `delete==false`).
- **Writes:** none here (downstream screen = other cluster).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** progression.
- **e2e-testability:** Yes (render gate) — seed `uP Life Report Summary/{profileid}` with `delete:false`. Downstream timeline is another cluster.

### Legacy — Launch Your Legacy
- **What the user does:** Plays the Legacy video; reads/edits "What's Your Living Legacy?" answer; opens the legacy quiz; views before/after content; requests an interview; views Latest Updates.
- **Nav/entry:** Home "L" button → `Legacy()` (`homeContent.dart:3923`).
- **Reads:** `static meta data/Launch Your Legacy` (video, before&after refs, latestupdates, quizurl — `legacy.dart:39`); `content_urls` whereIn before&after ids (`:58`); in-memory `usermetadata["livinglegacy"]` for the text field default.
- **Writes:** `participantdashboard/{profileid}` `livinglegacy` on text-field submit (`legacy.dart:383`).
- **Endpoints:** publit.io HLS (`appService.getContent`, videoFrom:"legacy"); external `launchUrl` to `legacyData["quizurl"]` (`:400`) and a before/after external link (`:832`).
- **Config flags:** none.
- **Journey stage:** content / progression.
- **e2e-testability:** Yes — seed `static meta data/Launch Your Legacy` (+ `content_urls`); type a Living Legacy answer, submit, assert `participantdashboard` write. External quiz link not e2e-asserted. Not ATC.

### Legacy — Request My Interview (raise ticket)
- **What the user does:** Taps "Request My Interview".
- **Nav/entry:** `Legacy` GestureDetector → `appService.raiseTickets(message:"Requesting My Interview", chatCategoryname:"Journey Related")` (`legacy.dart:605`).
- **Reads:** `chat config` (in raiseTickets).
- **Writes:** `clientissue` (+ `messages` subcollection) (`AppServices.dart:3671`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** support.
- **e2e-testability:** Yes — tap, assert a `clientissue` doc. Not ATC.

### Impact — BiG Impact home
- **What the user does:** Plays the BiG Impact video (+ optional Learn More link); views A&H Space, BiG Interview Summary, BiG Gamification, Humans of Excellence.
- **Nav/entry:** Home "I" button → `ImpactScreen()` (`homeContent.dart:3963`).
- **Reads:** `static meta data/[big impact, big program]` (snapshots, `impact.dart:59`); `community post` where docid whereIn (Humans of Excellence, `:72`); `arenavideoask` where docid==videoquestion (`:92`); `queue generation` (count, `:111`); `Big Interview Summary/{profileid}` (`:139`).
- **Writes:** none directly (sub-actions write in their own clusters).
- **Endpoints:** publit.io HLS (videoFrom:"impact"); external `launchUrl` to `impactVideo["learnmore"]` (`:411`).
- **Config flags:** none.
- **Journey stage:** content / social.
- **e2e-testability:** Yes — seed `static meta data/big impact`+`big program`, `community post`, `arenavideoask`, `Big Interview Summary/{profileid}`. Not ATC.

### Impact — BiG Interview Summary / Humans-of-Excellence actions
- **What the user does:** Taps "View Full Report" (BiG Interview Summary); taps "Post Yours Here" to record a video-ask; taps a Human-of-Excellence tile to view a snippet.
- **Nav/entry:** `BigInterviewSummary(data:)` (`impact.dart:754`); `ArenaVideoAsk(askQuestion:, eventPath:"bigimpact")` (`:877`); `ViewSnippet(index:, snippetList:)` (`:946`); item video → `PlayRelatedVideo` (`:1176`).
- **Reads:** as Impact home above.
- **Writes:** none in this file (recording/snippet writes are ArenaVideoAsk / ViewSnippet clusters).
- **Endpoints:** publit.io HLS thumbnails/playback.
- **Config flags:** none.
- **Journey stage:** social / content.
- **e2e-testability:** Yes for navigation (targets are other clusters). Not ATC.

### A&H Space — view touchpoints
- **What the user does:** Browses their A&H spaces (circular selector), reads per-touchpoint auto-summaries, reads the disclaimer; from Impact taps "View My All Touch Points".
- **Nav/entry:** Embedded `AHSpace(fullScreen:true)` in Impact (`impact.dart:627`); standalone `AHSpace(fullScreen:false)` pushed from `ahSpace.dart:231`.
- **Reads:** `arenaspace` where `delete==false` & `participantslist arrayContains profileid` orderBy createddate desc (`ahSpace.dart:31`); `A&H_Space_Name` (`:57`); `A&H_Space_Type` (`:68`); `event collection` (`:79`).
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** delivery / support.
- **e2e-testability:** Yes — seed `arenaspace` (with profile in participantslist) + `A&H_Space_Name`/`A&H_Space_Type`/`event collection`; assert spaces + summaries render. Not ATC.

### View / play content queues individually (General / Solar Voice / Ads / EiFlix)
- See "Mode-Based Playlist" — each queue is its own widget (`generalContentQueue.dart`, `solarVoiceQueue.dart`, `adsplaylistQueue.dart`, `eiflixQueue.dart`). Downstream players (`PlayRelatedVideo`, `SolarVoicePlaylist`, `Adsplaylists`, `episode`) belong to other clusters; here they are navigation targets only.
- **e2e-testability:** Yes for the queue rows themselves. Not ATC.

### Review ATC (DEPRECATED — OFF-LIMITS)
- **What the user does (existed):** Step through ATC entries for an AEL, set hours-saved/type per adjustment, mark profile fields.
- **Nav/entry:** `homeContent.dart:4066` dispatcher → `ReviewATC(aelid:)` (queue-type "reviewatc"). `ModeChecklist` reviewatc nav is commented out.
- **Reads:** `bigactivity` (`reviewATC.dart.dart:89`), `atc_alpha` (`:104`), `corrections` (`:137`), `procedures` (`:168`), `profile_data` (`:240`).
- **Writes:** `profile_data/{profileId}` (`:245`), adjustment refs (`:342`).
- **ATC:** **OFF-LIMITS — CI-excluded.** File is `// Depreciated` and named `reviewATC.dart.dart`.
- **e2e-testability:** **No** — ATC OFF-LIMITS; also deprecated/dead. Map that it exists; never seed/test.

### uP! Accelerated-Evolution enrolment wizard (DEAD)
- **What the user does (designed):** 11-step wizard to enrol in a uP! evolution cycle: choose D&I dates/location, learn AEC, set evolution goal, learn EIY, pick real-life situation, state worth, validate, congratulations.
- **Nav/entry:** **NONE** — `StepperForm()` is never instantiated anywhere in `lib/` (only its own class). Orphaned/dead screen.
- **Reads:** `atc model` where atcmodel=="uP!" (safe reference config, `stepper.dart:88`); `content_urls` (`:101`); `products` where atcmodel whereIn [B!G,LYL,uP!] (`:117`); `arena events` (`:148`,`:367`); `event rsvp` (`:241`); `accelerated evolution level` (`:262`); `static meta data` (`:271`).
- **Writes (designed):** `participant AEL/{aelid}` (`stepper.dart:404`); `interim crossover/{crossoverid}` (`:413`); `event rsvp/{id}` (`:464`).
- **Endpoints:** publit.io HLS trailer (`:481`).
- **Config flags:** none.
- **Journey stage:** purchase / onboarding.
- **e2e-testability:** No — unreachable dead code. Map as EXISTS only. (Reads `atc model` which is SAFE reference config, not ATC participant data.)

## Firestore collections

### Read
- `participantJourneySequence` — where `profileid==pid`, snapshots (My Journey).
- `deliverables` — where `participantjourneyid==doc.id` (My Journey) / where `profileid==pid` (Delivery Sequence).
- `participantdeliverysequence` — doc `{profileid}`, snapshots.
- `participantsproduct` — where `profileid==pid` orderBy sequenceorder, snapshots.
- `participantjourneyproduct` — where `profileid==profileid` (Know Your Journey add-ons).
- `journey`, `products`, `package` — mapping/reference reads.
- `appointmenttype`, `delivery forms`, `delivery report`, `delivery events`, `delivery queue` — delivery-type name maps.
- `profile_data/{pid}` — participant name (also written by ReviewATC — ATC).
- `queue_token`, `queue generation`, `queue variation`, `event collection` — queue/event helpers (My Journey, currently unreachable; Impact reads `queue generation` count).
- `participant mode checklist` — where profileid (+docid / participantproductid) (DoDont, Evolve commented path).
- `delivery forms` — whereIn pending ids (ModeChecklist/FormQueue).
- `content_urls` — whereIn ids (General Content, Legacy before/after, Stepper).
- `solar voice playlist` (id whereIn), `adsplaylist` (docid whereIn), `series` (id whereIn) — content queues.
- `static meta data` — docs `wishlist`, `evolve`, `Launch Your Legacy`, `big impact`, `big program` (+ Stepper generic).
- `participant AEL` — where profileid & flag=="validated" (Evolve/AELVersion); doc `{aelid}` (wishlist-self, AELVersion).
- `interim crossover` — where `aelid==..`.
- `Achievements/posts/postcollection` — where profileid orderBy created limit 9 (Evolve).
- `uP Life Report Summary/{profileid}` (Evolve).
- `Big Interview Summary/{profileid}` (Impact).
- `community post` — where docid whereIn (Impact Humans of Excellence).
- `arenavideoask` — where docid== (Impact video question).
- `arenaspace` — where delete==false & participantslist arrayContains profileid orderBy createddate desc (AHSpace).
- `A&H_Space_Name`, `A&H_Space_Type` — AHSpace maps.
- `arena events`, `event rsvp`, `accelerated evolution level` — Stepper (dead).
- `atc model` — Stepper reference read (SAFE config, not ATC participant data).
- `chat config` — read inside `raiseTickets`.
- **ATC (off-limits):** `bigactivity`, `atc_alpha`, `corrections`, `procedures` — ReviewATC only.

### Written
- `clientissue` (+ `clientissue/{id}/messages`) — Request Clarity Call (My Journey), Request My Interview (Legacy), via `appService.raiseTickets`.
- `participant mode checklist/{docid}` — `widget` array updates: form completion (ModeChecklist `:108`, FormQueue `:118`), dodont open (DoDont `:34`), wishlist completion (Family `:119`, Self `:79`).
- `evolution wishlist/{docid}` — new doc (EvolutionWishlistFamily `:110`).
- `participant AEL/{aelid}` — `mywishlist` (WishlistSelf `:71`); `participantresponse` merge (AELVersion `:229`); full doc (Stepper, dead `:404`).
- `participantdashboard/{profileid}` — `livinglegacy` (Legacy `:383`).
- `interim crossover/{id}` — new doc (Stepper, dead `:413`).
- `event rsvp/{id}` — new doc (Stepper, dead `:464`).
- `queue_token/{id}`, `event participation request/{id}` — My Journey helpers (currently unreachable, tap handlers commented out).
- **ATC (off-limits):** `profile_data/{profileId}` + adjustment refs — ReviewATC only.

## Endpoints & external services
- **No** Cloud Functions / httpsCallable / Dio / REST calls in this cluster (all data via Firestore SDK).
- **Video (publit.io HLS):** `https://media.publit.io/file/{responsepublitio.id}.m3u8` — EvolutionWishlistFamily `:48`, EvloutionWishlistSelf `:99`, Legacy `:107`, Impact `:181`, Stepper `:481`, Evolve `:299` (also via `appService.getContent`, the shared player path with `videoFrom` tags evolve/legacy/impact).
- **Firebase Storage image (hardcoded, production project):** `EiFlixQueue.solarCover` = `https://firebasestorage.googleapis.com/v0/b/fir-sample-aae4a.appspot.com/...` (`eiflixQueue.dart:19`). Confirms prod-project Storage references.
- **External links (`url_launcher`):** Impact learn-more (`impact.dart:411`), Legacy quiz (`legacy.dart:400`), Legacy before/after (`legacy.dart:832`), Impact item (`impact.dart:1195`) — all open `legacyData/impactVideo` URLs in external browser.
- **Image viewer:** `easy_image_viewer` full-screen pager (LatestUpdates).

## Config & feature flags
- **None.** No `RemoteConfig`, no feature-flag gating anywhere in this cluster.
- **Role gating (not a flag):** JourneyDashboard shows a searchbar action only when `roles["admin"]` or `roles["ah"]` (`Journey Dashboard.dart:45`).
- **Identity:** `profileid`/`pid` from `UserData.getUserData()` → SharedPreferences (`userpid`/`useruid`/`useremail`), fallback lookup in `profile_data` by email+user_ref (`Services/UserData.dart:29-45`). `appService.loggedinProfile`, `usermetadata`, `participantProductList`, `participantModeChecklist`, `mappedProduct`, `profileJourneyProduct` are in-memory app state loaded elsewhere.
- **Analytics:** PostHog only in deprecated ReviewATC (`posthog.screen("ATC List")`).

## Dead / clone / Old code
- `Mode Widget/reviewATC.dart.dart` — `// Depreciated` (line 1), double `.dart.dart` extension (clone-named), ATC. Still referenced by the `homeContent.dart:4066` queue dispatcher. **OFF-LIMITS + dead.**
- `productLevel/stepper.dart` (`StepperForm`) — **orphaned**: never instantiated anywhere in `lib/`. Full uP! enrolment wizard, but unreachable.
- `Journey Dashboard/participantJourneySequence.dart` — the per-step `onTap` action body (`:1090-1314`) and `AppService().updateDeliveryStatus(...)` calls are commented out; helper methods (`generateQueueToken`, `listUpcomingEvent`, `viewStage`, `displayQueueToken`) remain but are UI-unreachable.
- `Journey Dashboard/participantDeliverySequence.dart` — all step `onTap` navigation commented out (`:291-353`); display-only.
- `Mode Widget/modeChecklist.dart` — most `widgetPlaceholder` nav branches commented out (generalcontent/cycleofevolution/adsplaylist/solarvoice/eiflix/form/reviewatc); only evolutionwishlist / evolutionwishlistself / dodont are live (`:520-562`).
- `Mode Widget/formQueue.dart` `updateStatus()` (`:63-95`) commented out.
- `productLevel/evolve.dart` — `EvolutionMappingSummary()` nav (`:1296`), legacy "Excellence Installation/Enroll Now" block (`:2379`), and large commented initState query duplicates.
- `productLevel/impact.dart` — `BigGamefication(fullScreen:true)` "View More" nav commented (`:806`); `big aggregate level` pie-chart subscription commented (`:116`).
- Adjacent **Old** files (outside this cluster but the external nav references them): `Main Screen/exploreSocialOld.dart`, `Main Screen/myprofiledashboardold.dart`, `Widgets/notificationlogold.dart` — not part of this cluster; live screens are `exploreSocial.dart`, `myProfileDashboard.dart`.

## Notes & open questions
- `JourneyDashboard` "My ATC" tab embeds `AtcTimeLine()` (`Journey Dashboard.dart:22`) — ATC, a different cluster; off-limits for seeding/testing.
- The richest journey read surface is `Knowyourjourney` (profile dashboard), NOT `ParticipantDeliverySequence` (whose AppBar title also says "Know Your Journey" — naming collision; the two are distinct screens reached from different places).
- The My-Journey step actions (queue token, event request, form open) are coded but disabled. If Phase-3 e2e needs them, they must be re-enabled first; do not script them against the current build.
- `participant mode checklist.widget[]` is the central state object the Mode Widget cluster mutates; e2e seeding must construct realistic `widget` entries (`widgetid` ∈ generalcontent/solarvoice/adsplaylist/eiflix/form/dodont/evolutionwishlist/evolutionwishlistself, plus `reference`/`completed`/`result`/`status`).
- Storage/video URLs hardcode the **production** project (`fir-sample-aae4a`); test-project runs will 404 on `EiFlixQueue.solarCover` and publit.io playback unless content is reseeded — relevant to the prod-endpoint firewall concern.
- `appService.getContent` is the shared video player entry (tags `videoFrom: evolve|legacy|impact`); actual playback/progress writes live in that service + downstream player screens, outside this cluster.
