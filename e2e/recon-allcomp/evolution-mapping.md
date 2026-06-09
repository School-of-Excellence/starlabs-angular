# Evolution Mapping — e2e recon

> Group: video↔stage mapping (admin catalogue, live publishing, participant self-completion)
> KEY: evolution-mapping
> Routes: /evolutionmapping · /participant_videos_mapping · /participantevolution
> Source: src/app/EvolutionMapping/

---

## Routes (path → component file:line, role/guard, ATC? note)

| Path | Component file | Guard | ATC? |
|---|---|---|---|
| `/evolutionmapping` | `EvolutionMappingComponent` — `evolution-mapping/evolution-mapping.component.ts:40` | `authGuard` (any authenticated role admitted by route_config in Firestore) | No |
| `/participant_videos_mapping` | `EvolutionMappingNewComponent` — `evolution-mapping-new/evolution-mapping-new.component.ts:46` | `authGuard` | No |
| `/participantevolution` | `ParticipantEvolutionMappingComponent` — `evolution-mapping/participant-evolution-mapping/participant-evolution-mapping.component.ts:22` | `authGuard` | No |

**Auth guard mechanics** (`auth.guard.ts:10`): `authGuard` checks Firebase Auth state → calls `authguard.service.routeConfig(cleanUrl)` to fetch the allowed `roles[]` and `profileid[]` for this route from Firestore `route_config` → returns false (dialog) if the user lacks any matching role. No in-component role check beyond guard; all three routes are open to any role configured in `route_config`.

**Sub-components (dialog / child)**:
- `EvolutiomMappingAddComponent` — opened as a MatDialog from `/evolutionmapping` (add/edit): `evolutiom-mapping-add/evolutiom-mapping-add.component.ts:33`
- `LiveEvolutionMappingComponent` — opened as a MatDialog from `/evolutionmapping` (make-live): `live-evolution-mapping/live-evolution-mapping.component.ts:30`
- `VideoPlayerComponent` — inline video display: `video-player.component.ts:75`

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

| Collection | R/W | Purpose | Named-DB |
|---|---|---|---|
| `evolutionmappingvideo` | both | Catalogue: one doc per participant+video mapping (`docid`, `profileid`, `title`, `videourl`, `recordeddate`, `created`, `deleted`, `urllive`). Read by all three routes; written by `/evolutionmapping` (add/edit/delete) and by `LiveEvolutionMappingComponent` (sets `urllive:true/false`) | default |
| `liveevolutionmapping` | both | Published (live) state per participant: doc id = profileid; fields: `videolist[]` (ordered video URLs), `live` (boolean), `title`, `lastupdated`. Written by `LiveEvolutionMappingComponent.makeLive()`. Read by `/participantevolution` and the Live tab of `/evolutionmapping` | default |
| `participant videos` | both | Primary video store linked to events (`profileid`, `title`, `videourl`, `type`, `eventref`, `recordeddate`, `delete`, `uploadedon`, `uploadedby`, `remarks[]`). Written by `/participant_videos_mapping` (add/edit/delete via admin UI). Read by `EvolutiomMappingAddComponent` to select source videos. | default |
| `profile_data` | read+write | Profile photo lookup and update (profileimg field). Written by `/participant_videos_mapping` `confirmUploadImage()`. Also read for mapProfile | default |
| `participant metadata` | read+write | Participant name/journey lookup, photo update (profileimg). Primary table for `/participant_videos_mapping` list. Written on profile photo save | default |
| `queue_token` | read | Participant's active queue token; read by `/participantevolution` to find current stage/variationid, token status. **Written** by `/participantevolution` `movetonextStage()` — updates `currentstage`, `previousstage`, clears studio fields | default |
| `queue stage log` | write | Move audit: `movetonextStage()` in `/participantevolution` writes a new doc (`logdocid = uuid`, `movedby = profileid`, `movedthrough = 'evolution mapping'`, full token snapshot). The anti-circular assertion target. | default |
| `queue variation` | read | Stage list for the token's variationid; read by `movetonextStage()` to find nextStage. | default |
| `queue generation` | read | Queue doc (for `stages[]` fallback, `queuename`); read by `movetonextStage()` via `queueToken.queueref` | default |
| `event collection` | read | Event name/date lookup for `/participant_videos_mapping` log view and add-video form | default |
| `event participation request` | read | Attended-event count per participant; read by `/participant_videos_mapping` fetchEventCounts/loadEventLog | default |
| `journey` | read | Journey name for `/participant_videos_mapping` journey filter | default |
| `route_config` | read | Route role/profile allowlist (authGuard reads via authguard.service.routeConfig) | default |

**No ATC collections read or written by any component in this group.**

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Driver | Where read | Effect |
|---|---|---|
| `liveevolutionmapping/{profileid}.live` | `participant-evolution-mapping.component.ts:130` & HTML:30 | When `false`, the participant screen hides the video grid and "Mark as Completed" button; content is only shown when `live == true` |
| `liveevolutionmapping/{profileid}.videolist[]` | `participant-evolution-mapping.component.ts:158` | The ordered list of video URLs the participant watches; order is admin-controlled via drag-in `LiveEvolutionMappingComponent` |
| `queue_token.stagestatus == 'Approved'` | `participant-evolution-mapping.component.ts:113` | Token query filter — only tokens with `stagestatus == 'Approved'` are loaded; without this the completion button never renders |
| `queue_token.currentstage == incomingStageName` | `participant-evolution-mapping.component.ts:201` | Guard for `movetonextStage()` — button only fires if incoming `stagename` queryParam matches the token's live `currentstage` |
| `evolutionmappingvideo.deleted != true` | `evolution-mapping.component.ts:164` | The main table excludes soft-deleted records (Firestore where filter) |
| `evolutionmappingvideo.urllive` | `evolution-mapping.component.html:52` | When `urllive` is set, the row shows a red "Live" badge instead of a checkbox (no re-selection possible) |
| `participant videos.delete == false` | `evolutiom-mapping-add.component.ts:123` | Only non-deleted videos are offered in the add/edit dialog video selector |

---

## Cloud Functions involved (name → trigger → side-effect a test can assert)

**None found.** A search of `starlabs-cloud-function/functions/components/*.js` found no CF that listens to `evolutionmappingvideo`, `liveevolutionmapping`, or `participant videos`. The `queuesystem.js` CF handles `queue stage log` onCreate (touchpoint, position update) but is triggered by the **queue stage log** write, not by these evolution collections.

The only Firestore write a test can assert against a CF is the `queue stage log` write from `movetonextStage()` which may fire the existing `queueParticipantPositionUpdate` / `onQueueStageChange` CFs from the queue group — these are not evolution-specific and are out of scope here.

---

## External services to stub (call sites file:line)

| Service | Call site | What it does | Stub needed? |
|---|---|---|---|
| Firebase Storage (upload) | `evolution-mapping-new.component.ts:1128-1129` (`uploadBytes`/`getDownloadURL`) | Profile photo upload to Cloud Storage | Yes — stub `uploadBytes`/`getDownloadURL` on the Firebase Storage SDK to avoid real binary uploads in tests; return a fake URL |
| `window.open` (video playback) | `evolution-mapping.component.ts:471`, `video-player.component.ts:149`, `evolution-mapping-new.component.ts:1184` | Opens video in new tab or Dropbox player | Yes — `page.context().on('page', ...)` or `page.route()` to intercept new-tab navigations; assert the URL pattern without actually opening the media |
| Dropbox CDN URLs | `evolution-mapping-new.component.ts:1157` (`convertDropboxUrl`) | Rewrites Dropbox share URLs to direct streaming URLs served by dl.dropboxusercontent.com | Stub/block — `page.route('**/dl.dropboxusercontent.com/**', ...)` to prevent media fetch; test only needs to assert the URL is present, not playback |
| Google Drive embed iframes | `video-player.component.ts:94` | Renders Google Drive video previews | Stub — `page.route('**/drive.google.com/**', ...)` to return 204 |

**No Zoom, OpenVidu/LiveKit, FCM, Wati/Twilio, Postmark, or Razorpay calls in this group.**

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Role | Screens accessible | Gate |
|---|---|---|---|
| Admin / operator | `admin` or any role in `route_config` for `/evolutionmapping` | `/evolutionmapping` (full CRUD: add/edit/delete/make-live), `/participant_videos_mapping` (full CRUD) | `authGuard` → `routeConfig('/evolutionmapping')` at `auth.guard.ts:36` |
| Content admin | any role listed in `route_config` for `/participant_videos_mapping` | `/participant_videos_mapping` (participant video catalogue + log + photo upload) | Same guard |
| Participant (authenticated) | any authenticated user with `route_config` access | `/participantevolution?queueid=X&stagename=Y` (read videos, mark completed) | `authGuard`; completion gate: `queue_token.currentstage == stagename && stagestatus == 'Approved'` at `participant-evolution-mapping.component.ts:201` |

The `AuthguardService.getProfileMap()` (`evolution-mapping.component.ts:77`) builds the participant name dropdown from `profile_data` — no role check beyond the route guard.

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

### Flow 1 — Admin creates a video mapping entry (`/evolutionmapping` Tab 1)
1. Admin navigates to `/evolutionmapping`. Component calls `getEvolutionMapping()` → reads `evolutionmappingvideo` (where deleted!=true).
2. Admin clicks "Add Evolution" (FAB, aria-label="add evolution") → `EvolutiomMappingAddComponent` dialog opens.
3. Admin selects a participant → `onSelect(profileid)` → reads `participant videos` (where profileid==X, delete==false).
4. Admin selects a video type, then a video from the list, then clicks Save.
5. **Firestore write**: `evolutionmappingvideo` — `batch.set(newDoc, { docid, profileid, title, videourl, recordeddate, created: serverTimestamp(), deleted: false })` (`evolutiom-mapping-add.component.ts:255-265`).
6. Dialog closes → `getEvolutionMapping()` re-runs → table renders the new row.
7. **Anti-circular assertion target**: count of `evolutionmappingvideo` docs for this profileid (app writes it; the test reads it back).

### Flow 2 — Admin edits an existing mapping entry
1. Admin clicks the "Edit" FAB on a table row → `EvolutiomMappingAddComponent` opens with `data` pre-populated.
2. Admin changes the video/title → clicks Save.
3. **Firestore write**: `setDoc('evolutionmappingvideo', docid, { recordeddate, title, videourl }, { merge: true })` (`evolutiom-mapping-add.component.ts:233-238`).
4. **Anti-circular assertion target**: the doc's `title` field updated by the app.

### Flow 3 — Admin soft-deletes a mapping entry
1. Admin clicks the "Delete" FAB → `window.confirm()` → on accept: `updateDoc('evolutionmappingvideo', docid, { deleted: true })` (`evolution-mapping.component.ts:494`).
2. `getEvolutionMapping()` re-runs → deleted row absent from table (where deleted!=true filter).
3. **Anti-circular assertion target**: `evolutionmappingvideo/{docid}.deleted == true` (app wrote it).

### Flow 4 — Admin publishes a live mapping to a participant (`/evolutionmapping` → "Make Live")
1. Admin checks 1+ rows for the same participant → selection grows → "Make Live" FAB appears (aria-label="make live").
2. Admin clicks "Make Live" → `LiveEvolutionMappingComponent` dialog opens with the selected set.
3. Admin sets a title, sets live status, optionally reorders videos via drag.
4. Admin clicks "makeLive()".
5. **Firestore writes**:
   a. `setDoc('liveevolutionmapping', profileid, { videolist: [...], live: true/false, title, lastupdated: serverTimestamp() }, {merge:true})` (`live-evolution-mapping.component.ts:326`).
   b. For each video URL in the updated list: `batch.update('evolutionmappingvideo' doc, { urllive: true })` (`live-evolution-mapping.component.ts:333-338`).
6. **Anti-circular assertion targets**: `liveevolutionmapping/{profileid}.live`, `liveevolutionmapping/{profileid}.videolist.length`, and `evolutionmappingvideo/{docid}.urllive`.

### Flow 5 — Admin removes a video from a live mapping
1. Admin opens `LiveEvolutionMappingComponent` for a participant who already has a live mapping.
2. Admin clicks the delete icon on a video row → `deleteVideo(videoUrl)`.
3. **Firestore writes**:
   a. `updateDoc('liveevolutionmapping', profileid, { videolist: arrayRemove(videoUrl) })` (`live-evolution-mapping.component.ts:165`).
   b. `updateDoc('evolutionmappingvideo' doc where videourl==url, { urllive: false })` (`live-evolution-mapping.component.ts:177`).
4. **Anti-circular targets**: `liveevolutionmapping/{profileid}.videolist` length decremented; `evolutionmappingvideo/{docid}.urllive == false`.

### Flow 6 — Participant marks Evolution Mapping complete (`/participantevolution`)
1. Participant navigates to `/participantevolution?queueid=X&stagename=Y`.
2. Component reads `queue_token` (where `profile_id==self`, `currentstage==Y`, `stagestatus==Approved`, `tokenstatus==Active`) → gets queueref → reads `queue generation` for stages.
3. Reads `evolutionmappingvideo` (where profileid==self) and `liveevolutionmapping/{profileid}`.
4. If `liveevolutionmapping.live == true`, video grid renders.
5. Participant checks the "I have watched both Pre and Post videos" checkbox → "Mark as Completed" button activates.
6. Participant clicks "Mark as Completed" → `movetonextStage()`.
7. **Firestore writes**:
   a. `updateDoc('queue_token', docid, { currentstage: nextStage, previousstage: Y, stagestatus:'Approved', liveassignmentid:null, ... })` (`participant-evolution-mapping.component.ts:247`).
   b. `setDoc('queue stage log', logdocid, { ...tokenData, logdocid, movedby:profileid, movedthrough:'evolution mapping', logdate:serverTimestamp() })` (`participant-evolution-mapping.component.ts:258`).
8. **Anti-circular assertion targets**: `queue stage log` doc with `movedthrough=='evolution mapping'` and `currentstage==nextStage`; `queue_token.currentstage==nextStage`.

### Flow 7 — Admin adds a video in `/participant_videos_mapping`
1. Admin clicks "Add Video" button (class `add-video-btn`) → `openAddVideo()` overlay.
2. Admin fills form (participant, title, type, eventId optional, videoUrl, remarks).
3. Clicks "Save" → `saveVideo()`.
4. **Firestore write**: `addDoc('participant videos', { profileid, title, recordeddate, type, eventref, videourl, uploadedon:serverTimestamp(), uploadedby, delete:false, remarks[] })` (`evolution-mapping-new.component.ts:1341`).
5. **Anti-circular target**: count of `participant videos` for this profileid where delete==false incremented by the app.

### Flow 8 — Admin deletes a video in `/participant_videos_mapping`
1. Admin opens participant log, clicks delete icon → `Delete()` → confirm → `updateDoc('participant videos', docid, { delete: true })` (`evolution-mapping-new.component.ts:1556`).
2. **Anti-circular target**: `participant videos/{docid}.delete == true`.

---

## Seed requirements (exact docs/users/refs to seed; reuse seed-test-project helpers where possible)

For these flows to be testable against the cloud test project (`slabs-queue-e2e-exdcz`):

1. **Admin user** — any existing seeded operator (`admin+<run>@example.com`) works for `/evolutionmapping` and `/participant_videos_mapping` if the `route_config` docs for those routes include the `admin` role. Verify the `route_config` entry covers these paths (read `route_config` in Firestore before seeding).

2. **Participant profile** — seed one `participant metadata` doc + matching `profile_data` doc with:
   - `profileid` (a stable, run-unique id e.g. `<TESTRUNID>_evomapping_profile`)
   - `name` (recognisable string)
   - `email` (run-scoped `@example.com`)
   This is the profileid all evolution mapping docs point to.

3. **`participant videos` records** — seed 3 docs in `participant videos` for the test profileid:
   - `profileid`, `title` (e.g. "Pre Video", "Post Video", "Interview 1")
   - `videourl` (a stable Dropbox or direct URL placeholder, e.g. `https://dl.dropboxusercontent.com/test/pre.mp4`)
   - `type` = "Event" | "Interview" | "Testimonial"
   - `delete = false`
   These are the source videos `EvolutiomMappingAddComponent.onSelect()` will find.

4. **`evolutionmappingvideo` records** — seed 2 docs mapped to the test profileid (title + videourl from the `participant videos` above), `deleted:false`, `urllive:false`. These are the rows the `/evolutionmapping` table renders and the "make live" flow promotes.

5. **`queue_token`** for participant self-completion (Flow 6):
   - Seed a `queue_token` doc with `profile_id = testProfileId`, `currentstage = 'Evolution Mapping Stage'` (or the stage name from the seed queue config), `stagestatus = 'Approved'`, `tokenstatus = 'Active'`, `queueref = /queue generation/<seededQueueId>`.
   - Reuse `seed-test-project.js` helpers: `queueGenDocId(TESTRUNID)` for the queue reference; `tokenDocId(TESTRUNID, profileId)` pattern.

6. **`liveevolutionmapping/{profileid}`** — seed one doc with `live: true`, `videolist: [url1, url2]`, `title: 'Test Evolution'` as a precondition for Flow 6 (participant view requires `live == true`).

7. **Authenticated participant Firebase Auth user** — create via Admin SDK with email `participant-evo+<TESTRUNID>@example.com` for Flow 6. The `participantEmail(i)` helper from `e2e/queue/support/auth.ts` covers this pattern.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| EM-01 | Admin logs in, navigates to `/evolutionmapping`, table renders seeded rows (no bounce, no console error) | REAL-UI | Table row count >= seeded `evolutionmappingvideo` docs (where deleted!=true) for the test profileid — app computed from its Firestore query, compared to admin Firestore count via `countWhere` | P0 |
| EM-02 | Admin creates a new video mapping via dialog → seeded `participant videos` appears in selector → save → new row appears in table | REAL-UI | `countWhere('evolutionmappingvideo', [['profileid','==',testProfileId],['deleted','!=',true]])` increments by exactly the number of videos selected (app batch-wrote them; test reads back the count, not the written value) | P0 |
| EM-03 | Admin edits an existing mapping entry → changes title → save → table reflects updated title | REAL-UI | `getDoc('evolutionmappingvideo', docid).title` == the new title the app wrote (component setDoc merge — not the value the test injected as the form input, but the stored result) | P1 |
| EM-04 | Admin soft-deletes a row → row disappears from table → `evolutionmappingvideo.deleted == true` in Firestore | REAL-UI | `getDoc('evolutionmappingvideo', docid).deleted == true` — app wrote it; test asserts the app output. Table row count also decrements (app requeried with where deleted!=true) | P1 |
| EM-05 | Admin selects seeded rows for the same participant → "Make Live" publishes → `liveevolutionmapping/{profileid}.live == true` and `videolist.length` matches selection count | REAL-UI | `getDoc('liveevolutionmapping', profileid)` returns `{ live:true, videolist.length == N }` — N is the KNOWN seeded selection count; the app computed and wrote these fields | P0 |
| EM-06 | "Make Live" also flips each selected `evolutionmappingvideo.urllive = true` for exactly the videos in the new `videolist` | CF-SIDEEFFECT | `queryWhere('evolutionmappingvideo',[['videourl','in',[url1,url2]]])` — every doc has `urllive==true` after makeLive; count == N (the seeded selection size) | P1 |
| EM-07 | Admin removes a video from an existing live mapping (deleteVideo) → `liveevolutionmapping.videolist` length decrements by 1, `evolutionmappingvideo.urllive` flips to false for that URL | REAL-UI | `getDoc('liveevolutionmapping', profileid).videolist.length == seededLength - 1` (app-computed array; seededLength is KNOWN from seed); `getDoc('evolutionmappingvideo', deletedDocId).urllive == false` | P1 |
| EM-08 | `/participantevolution?queueid=X&stagename=Y` renders the video grid only when `liveevolutionmapping.live == true` (gate check) | REAL-UI | Component renders `.video-grid` elements only when live==true; negative: seed a doc with `live:false` and assert `.video-grid` is absent (app-rendered, not test-injected) | P0 |
| EM-09 | Participant checks "I have watched both Pre and Post videos" → "Mark as Completed" activates → click → `queue stage log` row written with `movedthrough=='evolution mapping'` | REAL-UI | `queryWhere('queue stage log',[['docid','==',tokenId],['movedthrough','==','evolution mapping']])` returns exactly 1 new row after click; the token's `currentstage` advanced (app wrote it — not the precondition the seed set) | P0 |
| EM-10 | Participant completion writes `queue_token.currentstage = nextStage` as the app computes it from variation/queue stages (not the value the test supplied as stagename) | REAL-UI | `getDoc('queue_token', tokenId).currentstage` == `expectedNextStage` (computed from the seeded `queue variation` stages by the app, then compared to the seeder's known stage sequence) | P0 |
| EM-11 | "Mark as Completed" button is disabled/absent when `liveevolutionmapping.live == false` OR `queue_token.currentstage != stagename` (double-gate) | REAL-UI | Button locator does not exist when either condition is false — app-gated via `*ngIf` — no Firestore assertion needed (UI-only) | P1 |
| EM-12 | `/participant_videos_mapping` loads, table renders >= seeded `participant metadata` count, summary stats show correct total (app-computed `summaryStats.totalParticipants` vs `countWhere('participant metadata')`) | REAL-UI | `summaryStats.totalParticipants` is computed by the app (`participantOptions.length`); compare to live Firestore count from admin — anti-circular because app derives it independently | P1 |
| EM-13 | Admin adds a video via `/participant_videos_mapping` form → `participant videos` doc created with correct `type`, `profileid`, `delete:false` → participant log shows the new entry | REAL-UI | `countWhere('participant videos',[['profileid','==',pid],['delete','==',false]])` increments by 1 after save (app addDoc'd it) | P1 |
| EM-14 | Admin deletes a video in `/participant_videos_mapping` → `participant videos/{docid}.delete == true` | REAL-UI | `getDoc('participant videos', docid).delete == true` — app wrote it via updateDoc | P2 |
| EM-15 | "Make Live" with `live:false` toggle publishes `liveevolutionmapping.live == false` (not-live path) | REAL-UI | `getDoc('liveevolutionmapping', profileid).live == false` after saving with toggle off; participant screen should then hide the video grid (EM-08 negative precondition) | P2 |

---

## ATC exclusions within this group

No ATC collections are referenced anywhere in `src/app/EvolutionMapping/`. No ATC components, directives, or services are imported. No queue-atc routes are linked from these components.

The only adjacent ATC risk is the `queuesystem.js` CF which fires on `queue stage log` creates (EM-09/EM-10 assert this collection) — but the CF effect is a non-ATC touchpoint write, and the assertion is on the stage log itself, not on any ATC collection.

**Explicitly excluded**: `src/app/ATC/**`; `atc_*`, `triple atc`, `ai_generated_atc_summary`, `assignment_*atc*`, `big *atc*` collections.

---

## Risks / unknowns

1. **`route_config` role mapping not verified** — the authGuard reads `route_config/{path}.roles[]` from Firestore to decide access for `/evolutionmapping`, `/participant_videos_mapping`, and `/participantevolution`. The actual roles permitted are unknown without querying the cloud test project's `route_config` collection. If the seeded operator does not have a matching role, EM-01/EM-02/EM-12 will fail with a "Contact Admin" dialog rather than a test failure. **Mitigation**: query `route_config` for these paths before finalising seed; alternatively seed a `route_config` override doc on the test project.

2. **No `data-testid` attributes on any element** — zero `data-testid` found in the EvolutionMapping templates. All selectors must fall back to `aria-label`, `class`, or text:
   - Add button: `[aria-label="add evolution"]` (mat-fab, evolution-mapping.component.html:41)
   - Edit button: `[aria-label="edit icon"]` (html:86)
   - Delete button: `[aria-label="delete icon"]` (html:94)
   - Make Live button: `[aria-label="make live"]` (html:35)
   - Add Video button: `.add-video-btn` (evolution-mapping-new html:77)
   - View Log button: `.view-log-btn` (html:213)
   - Save (add video form): `.save-video-btn` (html:906)
   These are stable enough for the test suite but should be documented.

3. **`evolutionmappingvideo` has no `testrunid` field** — unlike queue_token, these docs carry only `profileid` and no run-scope tag. Tests must use a run-unique `profileid` (seeded specifically for the run) to avoid cross-run interference on the persistent cloud test project.

4. **Soft-delete vs hard-delete inconsistency** — the main table uses `where('deleted', '!=', true)` (Flow 1 step 1). Firestore's `!=` inequality filter requires an index; if the index does not exist on the cloud test project, `getEvolutionMapping()` will throw FAILED_PRECONDITION. Verify the `evolutionmappingvideo` collection has a `deleted` index before running EM-01.

5. **`participant videos` uses `delete` (not `deleted`)** — the field name is `delete` (boolean), not `deleted`. The query is `where('delete', '==', false)`. Tests reading this collection must use `delete`, not `deleted`.

6. **`movetonextStage()` assumes `queue_token.variationid` is a doc id in `queue variation`** — if the seeded token has a `variationid` that does not exist as a `queue variation` doc, `getDoc('queue variation', variationid)` returns undefined and `nextStage` will be null, silently failing without an error. Seed the variation doc or use a token with `variationid == null` (which falls back to `queueGenerationDoc.stages[]`).

7. **Participant completion has no guard against double-submit** — `movetonextStage()` does not set a Firestore lock; a double-click would write two `queue stage log` rows. EM-09 should assert `logRowCount == logsBefore + 1` (exactly one new row), which would catch a double-write.

8. **Firebase Storage in `/participant_videos_mapping`** — photo upload calls real `uploadBytes` and `getDownloadURL`; these must be stubbed via `page.route` or the Angular Fire Storage mock to avoid hitting production storage buckets.

9. **`window.open` for video playback** — both `/evolutionmapping` and `/participant_videos_mapping` open videos in new tabs. Tests must intercept or suppress the new page via `page.context().on('page', pg => pg.close())` to prevent the test from hanging on a new tab.

10. **No Cloud Functions in this group** — all Firestore writes are client-side (Angular app), meaning all assertions can be immediate Firestore reads with polling rather than waiting for CF async. This simplifies the suite but also means there is no CF-side-effect test type available for these flows.
