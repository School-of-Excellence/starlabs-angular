# Recon: Cloud-Function triggers + observable side-effects (read-back proofs)

Source of truth for the **CF-side-effect specs** and the **emulator deploy script**. Maps every Cloud
Function the PLAN asserts (PLAN §2.5 + §6.3 gaps) to (a) its exact trigger condition — collection/path
and change type — and (b) the observable Firestore side-effect a spec can read back to PROVE the CF ran.

CF repo: `starlabs-cloud-function/functions` on branch **`test/queue-e2e-deploy`** (nested at
`<worktree>/starlabs-cloud-function`). Entry map: `functions/index.js`. Trigger bodies:
`functions/components/{queuesystem,big-assignment,participantmode,participantmetadata,openVidu,queue_atc_generation,communication,service}.js`.

Cross-refs: collection seed shapes → `recon/schemas.md`; board selectors → `recon/testids.md` (if present)
and `src/app/queue system/dynamic-queue-manager-clone/…`. PLAN gaps closed here: #6.3-#12 (position,
activity-log, biginvitation), §4 gap-1 (bulk fan-out), §4 gap-2 (totalaccepted counter), §4 gap-10
(updateDeliveryStatus args), §4 gap-11 (onQueueStageChange Firestore touchpoints).

> **Anti-circularity (the whole point).** Every CF read-back below asserts a value the **CF wrote**
> (a doc/field the test did NOT write), against either a KNOWN SEEDED number or a value the app/CF
> computed. Use `expect.poll` — these side-effects land on a live Firestore stream and arrive *after*
> the triggering write. NEVER assert "read == X" immediately after writing X.

> Type tokens (same as `recon/schemas.md`): `<string> <number> <boolean> <timestamp> <null>`
> `<ref:COL>` = DocumentReference · `<map>` `<array>`.

---

## 0. CF-wide facts (apply to every trigger below)

1. **Runtime = Node 22.** `functions/package.json` → `"engines": { "node": "22" }`, `firebase-functions ^7.1.1`
   (Firestore triggers are **v2** / Eventarc — `firebase-functions/v2/firestore`). The emulator host MUST
   run Node 22 or the functions emulator refuses the runtime. (Brief asserts "node version" — it is **22**.)

2. **One `initializeApp`, at module-eval, in `service.js`.** `index.js` requires `./components/service`
   first; `service.js:20` calls `admin.initializeApp({ storageBucket: production ? prod-bucket : starlabs-test-bucket })`
   and `service.js:24` creates `admin.storage().bucket()` **at load time**. `production` is computed from
   `process.env.GCLOUD_PROJECT === 'fir-sample-aae4a'` (`service.js:8,11,14`). In the emulator
   `GCLOUD_PROJECT` is the demo/test project → `production === false` → it picks the `starlabs-test`
   storage-bucket *string* (no network call at load; the bucket handle is lazy). **No prod credentials are
   touched at load.** The `production` flag also flips a participant URL in `studioZoomLink`
   (`breakthroughs.app` vs `breakthroughs-test.web.app`, `queuesystem.js:802-807`) — cosmetic only.

3. **Zoom secrets are REQUIRED to load the queue/big triggers.** `queuesystem.js:23-28` and
   `big-assignment.js:7-11` call `defineSecret(...)` at module-eval. A v2 function that lists `secrets:[...]`
   will not start in the emulator unless those secret *values* are resolvable. Provide the **6 dummy Zoom
   secrets** (see §6). They never need to be valid — the real Zoom API call is caught and the failure path
   still writes an observable side-effect (see `studioZoomLink`).

4. **Named database `firestore-atc` is an ATC dependency — EXCLUDE it.** `queue_atc_generation.js:4` calls
   `getFirestore("firestore-atc")` **at module-eval**, and `queuesystem.js:3420` / `participantmetadata.js:756`
   call it lazily. Per CLAUDE.md, **ATC is OFF-LIMITS**. The two `onQueueAtcGeneration*` triggers are NOT in
   the asserted set and write only to the `firestore-atc` named DB → **drop them from the emulator codebase**
   (filtered `index.js`, see §6) so the emulator never needs that DB. (The default DB and `firestore-forms`
   named DB are the only ones the queue specs need — see `recon/schemas.md` §0.6.)

5. **`onQueueStageChange` writes the SAME `queue_token` doc indirectly only via OTHER collections.** It does
   NOT write back to `queue_token`. So its read-back is always in `participant touchpoint` /
   `notificationrecord` / `participant metadata` — never the token the test/UI just moved (that would be
   circular). The token-field assertions (currentstage/previousstage/stagestatus) in OP-04 are the APP's
   write, not the CF's; keep them separate from the CF read-back.

6. **Comms are stubbed by seed config.** The seeder sets `queue generation.iscommunicationsdisabled = true`
   (`seed-test-project.js:230`). `onQueueStageChange` skips the WATI welcome/branch when this is true
   (`queuesystem.js:390`). WATI/Slack/FCM sends are commented out across the CF anyway
   (`sendToWhatsappViaWati` calls are `//`-disabled). **Do NOT assert any external send; assert the Firestore
   touchpoint/log/record the CF writes instead** (PLAN §5 FCM row).

---

## 1. `onQueueStageChange`  — queue_token write → touchpoints + metadata + notification

- **File / decl:** `queuesystem.js:31` `onDocumentWritten({ document: "queue_token/{id}", secrets:[ZOOM_ACCOUNTID,ZOOM_CLIENTID,ZOOM_CLIENTSECRET] })`.
- **Trigger condition:** ANY write (create / update / delete) to `queue_token/{id}`. Branches keyed on diffs:
  - `before !exists && after exists` → **token created** branch.
  - `before.currentstage != after.currentstage` → **stage-moved** branch (the OP-04 / WF case).
  - `before.stage != after.stage && after.stage == "completed"` → **queue-completed** branch.
  - added/removed keys in `selectedstageslot` → slot-confirmation WATI (disabled by `iscommunicationsdisabled`).
- **Observable side-effects (read-back proofs):**

  | Branch | Collection written | Doc / id | Fields proving the CF ran |
  |---|---|---|---|
  | created | `participant touchpoint` (new doc, `service.js:941-952`) | auto-id | `touchpoint == "Queue Token Created"`, `label` starts `"Token Created - "`, `profileid == token.profileid`, `parentreference == /queue_token/{id}` |
  | stage-moved | `participant touchpoint` (new doc) | auto-id | `touchpoint == "Queue Stage Moved"`, `label` == `"Moved to '<currentstage>' in <queuename>"`, `profileid`, `parentreference` |
  | stage-moved | `notificationrecord` (new doc, `service.js:73-88`) | auto-id | `notificationtype == "queue"`, `profileid ∋ token.profile_id`, `title == "Your queue has progressed"` |
  | completed (`after.stage=="completed"`) | `participant metadata/{profileid}` (`queuesystem.js:271`) | `= profile_id` | `queueevent` map recomputed (merge); + a `participant touchpoint` `touchpoint == "Queue Completed"` |
  | stage-moved | `classify/touchpoint` (`service.js:954`) | fixed `touchpoint` | `touchpointlist` arrayUnion of the touchpoint string (weak proof; prefer the per-doc touchpoint) |

- **CANONICAL read-back (PLAN §4 gap-11 / OP-04):** after a UI move S→D, `expect.poll` that a NEW
  `participant touchpoint` doc exists with `touchpoint == "Queue Stage Moved"` AND `parentreference.path ==
  "queue_token/{T}"` AND `metadata.queueref.path == <queueGenPath>`. This is the primary proof the CF fired
  (NOT a value the test wrote). Query: `collection('participant touchpoint').where('profileid','==',pid).where('touchpoint','==','Queue Stage Moved')` and assert a doc whose `parentreference` is token T.
- **GOTCHA — `profileid` vs `profile_id`.** The touchpoint/notification reads use `afterData["profileid"]`
  and `afterData["profile_id"]` *inconsistently* (`saveNotificationRecord` is fed `profileid` from a var set
  off `profile_id` at `:39`, but `updateParticipantTouchPoint` is fed `afterData["profileid"]` at `:298/343`).
  The seeded token (`seed-test-project.js:254`) writes `profile_id` but **not** `profileid`. → The touchpoint
  doc's `profileid` field will be **`undefined`** unless the token also carries `profileid`. **Seed-fix:** add
  `profileid: p.profileid` alongside `profile_id` on `queue_token`, OR query touchpoints by
  `parentreference == /queue_token/{T}` only (robust to the missing field). Recommend the latter for the spec.
- **GOTCHA — needs `profile_data/{profile_id}` + `queueref` reachable.** The CF immediately does
  `profile_data.doc(profileid).get()` (`:44`) and `doc(afterData.queueref.path).get()` (`:49`). The seed
  provides both, but if `profileid` is undefined this `.get()` reads `profile_data/undefined` and
  `profiledata` is undefined → `profiledata['countrycode']` throws inside the slot-try (caught) but the
  touchpoint branches still run. Keep the seed's `profile_data` + `queueref` ref intact.

---

## 2. `studioZoomLink`  — live-assignment created → zoomdata on the live-assignment

- **File / decl:** `queuesystem.js:730` `onDocumentCreated({ document:"live assignment/{id}", secrets:[ZOOM_ACCOUNTID,ZOOM_CLIENTID,ZOOM_CLIENTSECRET,ZOOM_SDK_CLIENTID,ZOOM_SDK_CLIENTSECRET] })`.
- **Trigger condition:** CREATE of a `live assignment/{id}` doc (the board writes this when a token is moved
  into an Activity stage — OP-05 / SS-06).
- **Gate:** resolves the participant's `queue_token` by `where("liveassignmentid","==",id)` (`:741`), reads
  `queue generation/{queueref.id}.stageproperty[currentstage].enablezoom` (`:762`). **Only acts if
  `enablezoom === true`** for the token's current stage.
- **Observable side-effect (read-back proof):** writes `zoomdata` onto the SAME `live assignment/{id}` doc.
  Three code paths, all `liveassignment.ref.update(...)`:

  | Path | Trigger | `live assignment/{id}` fields written |
  |---|---|---|
  | openVidu studio (`queue studio pairing/{studioid}.openvidu == true`) | `:810` | `zoomdata = { host_email:"soe1@soexcellence.com", start_url:"Link Broken" }` |
  | zoom success | `:921` | `zoomdata = <zoomresult.data>` (`{ id, join_url, start_url, password, host_email }`), `hostsignature`, `participantsignature`; also `zoomaccount.inuse=true` (`:906`) |
  | no free zoom account (`getUnusedZoomAccount()==null`) | `:935` | `zoomdata = { host_email:"soe1@soexcellence.com", start_url:"Link Broken" }` |

- **EMULATOR REALITY — dummy secrets ⇒ assert the "Link Broken" path.** With dummy Zoom secrets the real
  `https://zoom.us/oauth/token` + `api.zoom.us` calls FAIL; the `try` at `:872-931` is caught (`:927`) and the
  **success branch never writes `zoomdata`**. Reliable read-backs in the emulator:
  - Seed `queue studio pairing/{studioid}.openvidu = true` → the CF takes the `:810` path and ALWAYS writes
    `zoomdata.start_url == "Link Broken"`. **This is the deterministic SS-06 read-back.**
  - OR seed an EMPTY/exhausted `zoomaccount` collection → `getUnusedZoomAccount()` returns null → `:935`
    writes the same `start_url == "Link Broken"`.
  - PLAN §5 already prescribes returning `'Link Broken'`/synthetic zoomdata — this matches the CF's own
    fallback, so assert `live assignment/{liveassignmentid}.zoomdata != null && zoomdata.start_url == "Link Broken"`.
- **Read-back query:** `expect.poll(() => liveAssignmentDoc(id).then(d => d.zoomdata?.start_url))` → `"Link Broken"`.
- **PRECONDITIONS the CF needs (else it throws/no-ops):** a `queue_token` with `liveassignmentid == id` and a
  resolvable `currentstage`; `queue generation/{queueref.id}.stageproperty[currentstage].enablezoom`. If no
  token matches `liveassignmentid`, `participantTokenData` is `{}` and `queueData['stageproperty'][undefined]`
  throws (caught at the outer scope; no `zoomdata` written). The OP-05 flow writes the token's
  `liveassignmentid` first, so the CF resolves it — order matters.

---

## 3. `studioZoomLinkDeactivate`  — live-assignment completed → free studio + metadata

- **File / decl:** `queuesystem.js:1204` `onDocumentUpdated("live assignment/{id}", …)`.
- **Trigger condition:** UPDATE of `live assignment/{id}` where `before.status != "completed" && after.status == "completed"`
  (`:1214`). Fires when the operator drags a token OUT of Activity (OP-06 / SS-12).
- **Observable side-effects (read-back proofs):**

  | Collection | Doc | Field proving the CF ran |
  |---|---|---|
  | `openviduroom/{liveassignment.docid}` (`:1217`) | `= live assignment.docid` | `active == false` (only if the openviduroom doc exists) |
  | `zoomaccount` where `email == zoomdata.host_email` (`:1233`) | matched | `inuse == false`, `hostid == null`, `useby == null` |
  | `participant metadata/{profileid}` (batch, `:1282-1286`) | per paired profile | `totalstudioopportunitiesused == <count>`, `studioevents == <array of queueids>` |
  | collectionGroup `logs` where `zoomdata.host_email == email` (`:1245`) | matched | `read == true` |

- **CANONICAL read-back (SS-12):** the cleanest is `zoomaccount` freeing IF you seeded a `zoomaccount` doc
  whose `email` matches the live-assignment's `zoomdata.host_email` and set `inuse:true` first → after the
  status→completed UPDATE, assert `zoomaccount.inuse == false`. With the "Link Broken" zoomdata from §2 the
  `host_email` is `"soe1@soexcellence.com"` — seed a `zoomaccount` with that email (lowercased; the query
  lowercases at `:1233`) to get a deterministic free-back proof.
- **Alternative read-back:** `participant metadata/{pairedProfileId}.totalstudioopportunitiesused` becomes a
  number — but this requires `participant metadata/{profileid}` to exist (auto-created by
  `profiledata_to_participantmetadata`, §B). Note it counts across ALL `live assignment` docs sharing the
  pairing, so the number is environment-dependent — assert `>= 1`, not an exact count, unless the run is isolated.

---

## 4. `inviteToStudio`  — studioinvitation created → notification record

- **File / decl:** `queuesystem.js:2003` `onDocumentCreated("studioinvitation/{docid}", …)`.
- **Trigger condition:** CREATE of `studioinvitation/{docid}` (the board / specialist writes this to invite a
  participant — SS-04). Reads `inviteData.tokenref.get()` and `inviteData.profileid`.
- **Observable side-effect (read-back proof):**

  | Collection | Doc | Field proving the CF ran |
  |---|---|---|
  | `notificationrecord` (new doc, `service.js:73`) | auto-id | `notificationtype == "studio invitation"`, `profileid ∋ inviteData.profileid`, `title == "<stage> invitation received."` |
  | `wati archive` (`createWatiArchiveDocument`) | auto-id | created but SEND disabled — weak proof; prefer `notificationrecord` |

- **CANONICAL read-back (SS-04):** after the `studioinvitation` create, `expect.poll` for a
  `notificationrecord` doc with `notificationtype == "studio invitation"` and `profileid` array containing the
  invited participant. Query: `collection('notificationrecord').where('notificationtype','==','studio invitation').where('profileid','array-contains',pid)`.
- **NOTE:** the invitation doc itself (`studioinvitation`) is what the SS-04 step CREATES — so asserting the
  invitation exists is circular. The CF read-back is the `notificationrecord` it spawns.
- **GOTCHA:** the WATI block does `profile_data.doc(inviteData.profileid).get()` then `.number` (`:2038-2042`).
  Needs a `profile_data/{profileid}` doc (seed provides it). If missing, the WATI promise rejects (unhandled,
  logged) but the `notificationrecord` is already written → read-back still holds.

---

## 5. `bulkReadyInvitation`  — bulk invitation created → N studioinvitation fan-out + tokens→invited

- **File / decl:** `queuesystem.js:2601` `onDocumentCreated("bulk invitation/{docid}", …)`.
- **Trigger condition:** CREATE of `bulk invitation/{docid}` (operator "Bulk Move"/bulk-invite — OP-09 / OP-09b).
  Doc fields read: `queueref` (ref), `stage` (string), `totalinvited` (number), `selectedparticipants`
  (array of profile ids, optional), `duration` (minutes).
- **Selection logic (`:2611-2621`):** loads `queue_token` where `queueref == data.queueref && currentstage == data.stage`,
  `orderBy("logdate")`, keeps tokens with `status` ∈ {null, undefined, "queued", "invited"}, slices to
  `data.totalinvited`; if `selectedparticipants` set, intersects by `token.profile_id`. Skips any token that
  already has a non-expired pending invitation (`:2624`).
- **Observable side-effects (read-back proofs) — batched (`:2649`):**

  | Collection | Per selected token | Fields proving the CF ran |
  |---|---|---|
  | `studioinvitation` (new doc, `:2633`) | one each | `bulkref == /bulk invitation/{docid}`, `tokenref == /queue_token/{token.docid}`, `profileid == token.profile_id`, `stage == data.stage`, `type == "queued"`, `clientresponse == null`, `expirydate` ≈ now + duration |
  | `queue_token/{token.docid}` (`:2629`) | one each (only if `status != "invited"`) | `status == "invited"` |

- **CANONICAL read-back (PLAN §4 gap-1 / OP-09b — the silent fan-out check):** seed K eligible tokens at
  `data.stage`, create ONE `bulk invitation` with `totalinvited == K` (or `selectedparticipants` of size K).
  Then assert **conservation**:
  - `count(studioinvitation where bulkref == /bulk invitation/{docid}) == K`, AND
  - `count(queue_token where queueref==Q && currentstage==stage && status=="invited") == K`, AND
  - **no eligible token left un-invited:** every seeded eligible token flips to `"invited"`.
  A regression that writes M<K invitations but flips K tokens (or vice-versa) FAILS this. The seeded K is the
  KNOWN number; the CF-produced counts are the read-back → non-circular.
- **GOTCHA — `profile_id` vs `profileid`.** Selection filters by `token["profile_id"]` BUT the
  `selectedparticipants` includes-check is `data['selectedparticipants'].includes(e['profile_id'])` (`:2618`)
  while pending-dedup compares `invitation.profileid === token['profileid']` (`:2624`, note `profileid`, which
  is undefined on the seeded token). So dedup never matches (always treats as not-pending) — fine for a clean
  run. The new invitation stores `profileid: token["profile_id"]` (`:2639`). **Seed tokens with `profile_id`**;
  `selectedparticipants` must contain those `profile_id` values.
- **GOTCHA — `expirydate` required on pre-existing invitations.** `:2607` does `doc.data()['expirydate'].toDate()`
  on EVERY existing `studioinvitation` for that queue+stage; a pre-existing invitation without `expirydate`
  throws. Keep the stage's invitation set clean before the bulk create, or always seed `expirydate`.

---

## 6. `invitationAccepted`  — studioinvitation approved → token→ready + bulk totalaccepted++

- **File / decl:** `queuesystem.js:2654` `onDocumentUpdated("studioinvitation/{docid}", …)`.
- **Trigger condition:** UPDATE of `studioinvitation/{docid}` where `before.clientresponse == null &&
  after.clientresponse == "approved" && after.type == "queued"` (`:2658`). The participant overlay
  (SS-05) sets `clientresponse = "approved"` (NOT `status`).
- **Observable side-effects (read-back proofs):**

  | Collection | Doc | Field proving the CF ran |
  |---|---|---|
  | `queue_token` (via `after.tokenref`, `:2659`) | the invited token | `status == "ready"` |
  | `bulk invitation` (via `after.bulkref`, `:2665`) | the parent bulk doc | `totalaccepted` incremented by exactly **1** |

- **CANONICAL read-back (PLAN §4 gap-2 — the counter check):** seed/create a `bulk invitation` (totalaccepted
  absent or 0) and a child `studioinvitation` (`type:"queued"`, `clientresponse:null`, `bulkref`/`tokenref` set
  — these are produced by §5). Drive accept by setting the invitation's `clientresponse = "approved"` (the
  participant self-move, allowed via `participant-sim.js`-style precondition OR the real participant overlay).
  Then assert:
  - `queue_token/{T}.status == "ready"` (the value the CF computed), AND
  - `bulk invitation/{B}.totalaccepted == prior + 1` — and crucially, that it does **NOT** increment on a
    deny/expiry (set `clientresponse` to something other than `"approved"` → counter unchanged).
- **NON-CIRCULAR NOTE:** the test sets `clientresponse`; it does NOT set `status` or `totalaccepted`. The CF
  computes both → valid read-back. Do NOT assert `status=="ready"` if the test wrote `status` itself.
- **GOTCHA:** `after.bulkref` and `after.tokenref` must be real DocumentReferences. Invitations created by §5
  carry both. A hand-seeded invitation must set `bulkref`/`tokenref` as `doc(...)` refs (see `schemas.md` ref rule).

---

## 7. `biginvitationAccepted`  — biginvitation accepted → participantsproduct initiated

- **File / decl:** `queuesystem.js:707` `onDocumentUpdated("biginvitation/{id}", …)`.
- **Trigger condition:** UPDATE of `biginvitation/{id}` where `before.status != "accepted" && after.status == "accepted"` (`:711`).
- **Observable side-effect (read-back proof):** finds a `participantsproduct` for `after.profileid` with
  `deliverymode == "Big Mode"` and no `status`, and **updates it** (`:718`):

  | Collection | Doc | Fields proving the CF ran |
  |---|---|---|
  | `participantsproduct` (matched, `:718`) | the un-statused Big-Mode product | `status == "initiated"`, `eventref == after.eventref`, `biginvitationref == /biginvitation/{id}` |

- **CANONICAL read-back (PLAN §2.6 #3 / gap #12):** seed a `biginvitation/{id}` (status `"pending"`) for a
  profile that also has a `participantsproduct` with `deliverymode:"Big Mode"`, `status:null`. Drive accept by
  setting `biginvitation.status = "accepted"`. Then assert the matched `participantsproduct.status == "initiated"`
  and `biginvitationref.path == "biginvitation/{id}"`.
- **GUARD against double-fire:** the CF skips if any Big-Mode product already references this invitation
  (`existingInvitation.length != 0`, `:714`) — so a second accept write is idempotent. A spec can assert
  re-firing does NOT create a second initiated product.
- **NOT seeded today:** `biginvitation` and the Big-Mode `participantsproduct` shape are absent from the
  current seeder — BIG-04/05 must add them (see §B / `schemas.md`).

---

## 8. `createBigParticipantAssignment`  — big assignment created → per-participant assignment docs

- **File / decl:** `big-assignment.js:19` `onDocumentCreated({ document:"big assignment/{docid}", secrets:[5 Zoom secrets] })`.
- **Trigger condition:** CREATE of `big assignment/{docid}` (BIG-04/05). Doc fields read: `participantidlist`
  (array), `participantidbycohorts` (map profileid→cohortref), `enddate` (timestamp), `regeneratemeeting`
  (bool), `marathonref`, `title`, `selectedAdmin`, `editedprofileref`.
- **Observable side-effects (read-back proofs):**

  | Collection | Doc | Fields proving the CF ran | Source |
  |---|---|---|---|
  | `big participants assignments` (new doc per participant **that has a cohort ref**) | auto-id | `profileid`, `assignmentref == /big assignment/{docid}`, `status == "initiated"`, `cohortsref`, `marathonref`, `createddate` | `:114-124` |
  | `bigchat/{docid}` (only if `enddate > today`) | `= big assignment.docid` | `participants == participantidlist`, `admins`, `startdate`, `enddate` | `:50` |
  | `supportchat` (new doc, only if `enddate > today`) | auto-id | `type=="group"`, `members == <participant uids>`, `group_name == title` | `:88` |
  | `big assignment/{docid}` (write-back) | same | `groupchatid == <supportchat id>` | `:100` |

- **CANONICAL read-back (PLAN §2.5 `createBigParticipantAssignment` ⚠️partial → close):** seed `participantidlist`
  of N profiles WITH a `participantidbycohorts[profileid]` ref for each (cohort ref is REQUIRED — participants
  without it are **skipped**, `:113`). Create the `big assignment`. Then assert
  `count(big participants assignments where assignmentref == /big assignment/{docid}) == N` and each
  `status == "initiated"`. Conservation: a regression that drops some participants (e.g. missing cohort ref)
  yields M<N — caught by the count==N assertion against the KNOWN seeded N.
- **GOTCHA — cohort ref gate.** If `participantidbycohorts` is empty/missing, ZERO `big participants assignments`
  are written (every iteration `continue`s at `:113`) and the spec sees 0. Seed the cohort map.
- **GOTCHA — `enddate` required.** `:28` does `data.enddate.toDate()`; a missing `enddate` throws before the
  assignment docs are written. Seed `enddate` as a Timestamp (future, to also exercise the chat branch).
- **Zoom:** `regeneratemeeting` defaults falsy → the zoom-meeting call is skipped (`:23`). Keep it falsy in the
  emulator to avoid the (caught) dummy-secret Zoom failure; the assignment-doc fan-out is independent of zoom.

---

## 9. `updateDeliveryStatus`  — APP-SIDE callable (NOT a CF) → deliverables/event-request status

- **DEFINED IN THE ANGULAR APP, not the CF repo.** `src/app/authguard.service.ts:889`
  `async updateDeliveryStatus(apptPath, status, { eventRequestRef })`. PLAN calls it `guard.updateDeliveryStatus(...)`.
  It is invoked from the board on a final-stage move (`dynamic-queue-manager-clone…ts`) and elsewhere.
- **What it writes (a Firestore batch, `:891-917`):**

  | Collection | Selector | Field written |
  |---|---|---|
  | `deliverables` | `where("fileref","array-contains", doc(apptPath))` (`:894`) | `status = <status>` (e.g. `"completed"`) for every matched deliverable |
  | `event participation request` | `eventRequestRef` query, only when `status == "completed"` (`:905-915`) | `status = "attended"` |

- **Read-back (PLAN OP-07 + §4 gap-10):** Two layers:
  1. **Call fired + ARGS correct** (gap-10): intercept via `page.on('console')`/`page.exposeFunction` or a
     network/route spy — assert it was called with `apptPath == "/queue_token/{T}"` and `status == "completed"`
     (and `eventRequestRef` present). Argument correctness matters: a wrong `apptPath` completes the wrong record.
  2. **Firestore effect:** assert the `deliverables` doc whose `fileref` array-contains `/queue_token/{T}` now
     has `status == "completed"`; and if `eventRequestRef` given, the `event participation request.status == "attended"`.
- **SEED REQUIREMENT (else silent no-op):** the current seeder writes **NO `deliverables`** docs (see
  `seed-test-project.js:264-265`). With no matching deliverable the batch is empty and the write is a silent
  no-op — the call "fires" but proves nothing. **To get a Firestore read-back, OP-07 must seed a `deliverables`
  doc with `fileref` array-containing `doc('queue_token', T)` and an initial `status != "completed"`**, plus an
  `event participation request` (approved) reachable by `eventRequestRef`. Without that, assert only the call+args.
- **NON-CIRCULAR NOTE:** the read-back value (`deliverables.status == "completed"`) is computed by the APP method
  from the seeded `fileref` linkage, not written by the test — valid. Asserting "the call fired" alone is weaker
  (does not prove the right record changed); prefer the deliverables read-back when seeded.

---

## 10. `queueParticipantPositionUpdate`  — queue-stage-log created → queue_token.queueposition

- **File / decl:** `queuesystem.js:1663` `onDocumentCreated("queue stage log/{queueStageLogId}", …)`.
- **Trigger condition:** CREATE of a `queue stage log/{id}` doc. Every stage move appends one (the board and
  `participant-sim.advance()` both write `queue stage log` — `participant-sim.js:50-55`).
- **Gate (LOAD-BEARING):** reads `queue generation/{queueref}.stageproperty` and acts ONLY when
  `stageProperty[currentstage].compulsoryactivity.length != 0` (`:1675`) — i.e. an **Activity / studio stage**.
  It re-runs the same logic for `previousstage` if it too is an Activity stage (`:1714`).
- **Observable side-effect (read-back proof):** rebuilds `queue_token.queueposition` for ALL Active tokens at
  that stage (`queueref` + `currentstage`, `orderBy("logdate","asc")`), in one batch (`:1708`):

  | Token bucket | `queue_token.queueposition` written |
  |---|---|
  | `status == "ready"` (waiting list) | sequential `1, 2, 3, …` in `logdate` order (`:1703-1706`) |
  | preassigned at this stage (`preassigned[stage].length != 0`) | `null` (`:1691`) |
  | everything else | `null` (`:1699`) |

- **CANONICAL read-back (PLAN §4 gap #12 — position aggregation):** at an Activity stage, seed M tokens with
  `status:"ready"` and a couple with `status:"queued"`. Trigger a `queue stage log` create at that stage (a UI
  move, or `participant-sim.advance(T, activityStage)`). Then assert the ready tokens recompute to
  `queueposition` 1..M in `logdate` order, and the non-ready tokens get `queueposition == null`. The KNOWN seeded
  ready-count is the oracle; the CF-written positions are the read-back → non-circular.
- **GOTCHA — `compulsoryactivity` MUST be a non-empty ARRAY, not `{}`.** The seed config
  (`sample-queue-config.json`) stores `compulsoryactivity` as an empty **object** `{}` on every stage (30/30).
  `{}.length` is `undefined`; `undefined != 0` is `true`, so the gate *passes* on EVERY stage — then the batch
  runs everywhere AND the `previousstage` branch does `stageProperty[previousstage]["compulsoryactivity"].length`
  on the FIRST stage's predecessor (`null`/missing) → **TypeError, CF crashes** for normal moves. The real prod
  shape for Activity stages is an **array** of activity refs (empty array `[]` for non-activity). **Seed-fix
  for position specs:** set the target Activity stage's `compulsoryactivity` to a non-empty array (e.g.
  `["<activityref>"]`) and ALL other stages to `[]` (empty array, `.length === 0` → gate correctly false). Do
  this in `seed-test-project.js`/`stageproperty` before driving OP-position cases.
- **GOTCHA — `queueref` on the log doc.** The CF reads `docData['queueref']` (`:1666`). `participant-sim.advance()`
  copies the whole token (`...tok`) into the log including `queueref` — good. A hand-written log must carry
  `queueref` (ref), `currentstage`, `previousstage`, `tokenstatus`.

---

## 11. `CreateQueueActivityLogV2`  — live-assignment activity done → queue activity log rows

- **File / decl:** `queuesystem.js:2923` `onDocumentUpdated("live assignment/{docid}", …)`.
- **Trigger condition:** UPDATE of `live assignment/{docid}` where `before.isactivitydone != after.isactivitydone
  && after.isactivitydone == true && after.status == "completed"` (`:2932`). (Early-returns if before==after, `:2928`.)
- **Resolution gate (LOAD-BEARING):** finds the matching `queue stage log` (`where liveassignmentid ==
  afterData.docid && profile_id == afterData.participantid`, `:2934`), then resolves `atcmodel` from
  `queue variation/{variationid}.atcmodel` (`:2939`) OR `productref.atcmodel` (`:2945`). **Acts ONLY if
  `getAtcModel != null`** (`:2954`).
- **Observable side-effect (read-back proof):** one `queue activity log` doc per profileid in
  `participantsactivity` (+ `bonusactivity`), batched (`:2974`):

  | Collection | Doc | Fields proving the CF ran |
  |---|---|---|
  | `queue activity log` (new doc per activity profile) | auto-id | `atcmodel == <resolved>`, `stagename == liveAssignment.stagename`, `profileid`, `queueid == liveAssignment.queueid`, `participantid`, `source == "live assignment"`, `sourceref == /live assignment/{docid}` |

- **CANONICAL read-back:** seed a `live assignment` (`isactivitydone:false`, `status` not completed) with a
  `participantsactivity` map of P profiles, a matching `queue stage log` (carrying `liveassignmentid` +
  `profile_id` + a `variationid`), and set the `queue variation/{variationid}.atcmodel` to a **non-null** value.
  Then update the live assignment to `isactivitydone:true, status:"completed"`. Assert
  `count(queue activity log where sourceref == /live assignment/{docid}) == P` with `atcmodel == <seeded>`.
- **GOTCHA — `atcmodel` is `null` in the seed → ZERO activity logs.** The seeder writes
  `queue variation … atcmodel: null` (`seed-test-project.js:218`). With null atcmodel the CF logs
  "couldn't able to get atcmodel" and writes nothing. **For this spec only, set the variation's `atcmodel` to a
  harmless non-null string** (it is reference-only metadata, NOT an ATC Firestore collection — safe per CLAUDE.md;
  `atc model` reference config is explicitly allowed). Without it, this trigger is unprovable.
- **GOTCHA — needs a `queue stage log` with `liveassignmentid`.** The board's Activity move writes a stage log;
  ensure it carries `liveassignmentid` and `profile_id == participantid` so `:2934` resolves. PLAN §2.6 #3 lists
  this trigger as a direct-assertion GAP — this section closes it.

---

## B. Upstream / coupled CFs (NOT asserted, but they SHAPE the seed & must be understood)

These fire as side-effects of seeding and either enable the read-backs above or rewrite seeded fields.

| CF | Trigger | Why it matters to the specs |
|---|---|---|
| `profiledata_to_participantmetadata` (`participantmetadata.js:12`, `onDocumentWritten profile_data/{id}`) | any `profile_data` write | **Auto-creates `participant metadata/{profileid}`** (`:39`). This is the prerequisite doc that §3 (`totalstudioopportunitiesused`) and §1 completed-branch (`queueevent`) merge into. Seeding `profile_data` is enough to get the metadata doc. |
| `calculateParticipantMode` (`participantmode.js:7`, `onDocumentWritten participantsproduct/{id}`) | any `participantsproduct` write | **Rewrites the same `participantsproduct.mode/nextmode/nextmodedate/deliverymode`** (`:32-41,:89-94`). The seed writes `mode:null`; this CF will overwrite it on create. Don't assert seeded `mode` survives. Coupled to §7 (which sets `participantsproduct.status`). |
| `productsdata_to_pmd` (`participantmetadata.js:471`, `onDocumentWritten participantsproduct/{id}`) | any `participantsproduct` write | mirrors product data into `participant metadata` — extra writes on the metadata doc; ignore unless asserting metadata. |
| `journey_to_pmd` (`participantmetadata.js:245`) | `participantjourneyproduct/{id}` write | seeded by `seed-test-project.js:245`; writes `participant metadata`. Benign. |
| `onQueueTokenCreateUpdateProductMode` (`queuesystem.js:2083`, `onDocumentCreated queue_token/{docid}`) | token create | reads `queueref` start/end dates and calls `updateParticipantDocument` (writes `participantsproduct` mode). Fires on every seeded token; needs `queue generation.queuestartdate/enddate` (seed provides). Not asserted. |
| `particpantFormSubmit_SlackIntegration` (`queuesystem.js:1754`, `onDocumentCreated formsByClient/{id}`, **db `firestore-forms`**) | form submit in named DB | writes a `participant touchpoint` `touchpoint == "Form Submitted"` (`:1760`). Relevant if a WF self-movable form case wants a form-submit CF read-back; requires the `firestore-forms` named DB (see `schemas.md` §0.6). |

---

## C. EXCLUDED from the emulator codebase / not assertable

| CF / module | Reason |
|---|---|
| `onQueueAtcGenerationCreate` / `onQueueAtcGenerationUpdate` (`queue_atc_generation.js`) | **ATC** — writes only to `firestore-atc` named DB; calls `getFirestore("firestore-atc")` at module-eval. OFF-LIMITS per CLAUDE.md. Filter out of `index.js` for the emulator so the ATC DB is never needed. |
| `atcdata_to_pmd` (`participantmetadata.js:753`, db `firestore-atc`) | ATC named-DB trigger. Exclude. |
| All `openVidu.js` exports (`createOpenViduToken`, `onEventOpenVidu`, `openViduStart/StopRecording`, `openViduCloseRoom`, `muteParticipant`, `kickParticipant`, `awsEventWebhook`, `CheckMasternodeStatus`, …) | **All `onRequest`/`onSchedule`, NOT Firestore triggers** — media/LiveKit routing only (PLAN §2.6 #4). Not in the asserted set; need LiveKit/AWS secrets. Stub media per PLAN §5; do not deploy to the emulator unless a routing spec needs the HTTP endpoint. |
| `studioZoomLinkRegenerate` (`queuesystem.js:1306`, `onRequest`) | HTTP, real-Zoom; PLAN §5 stubs it. Not a Firestore-trigger read-back. |
| `communication.js` queue-relevant exports (`notifyMobileApp` on `notificationrecord/{id}`, `ChatxNotification`, etc.) | FCM/Slack senders. `notifyMobileApp` fires on the `notificationrecord` docs that §1/§4 produce, but only SENDS a push (no further Firestore read-back). Assert the `notificationrecord` doc (§1/§4), not the push. |

---

## 6 (runtime). EMULATOR DEPLOY REQUIREMENTS — checklist for the deploy script

1. **Node 22** on the emulator host (`functions/package.json` engines). Use `nvm use 22` / a Node-22 CI image.

2. **The 6 dummy Zoom secrets** (the queue + big triggers `defineSecret` these; values may be any non-empty
   placeholder — the real Zoom calls fail and the CFs take their observable fallback paths):
   `ZOOM_ACCOUNTID`, `ZOOM_CLIENTID`, `ZOOM_CLIENTSECRET`, `ZOOM_SDK_CLIENTID`, `ZOOM_SDK_CLIENTSECRET`,
   `ZOOM_WEBHOOK_SECRET_TOKEN`.
   For the **functions emulator**, secrets are read from a local `.secret.local` file in `functions/`
   (firebase-tools convention) OR from process env. Minimal `functions/.secret.local`:
   ```
   ZOOM_ACCOUNTID=dummy
   ZOOM_CLIENTID=dummy
   ZOOM_CLIENTSECRET=dummy
   ZOOM_SDK_CLIENTID=dummy
   ZOOM_SDK_CLIENTSECRET=dummy
   ZOOM_WEBHOOK_SECRET_TOKEN=dummy
   ```
   (Only the 5 Zoom secrets listed on the queue/big triggers are strictly needed to LOAD them; include the
   webhook token too so the Zoom-webhook handler — if not excluded — also loads. If you ALSO load
   communication/openVidu/runpod for routing specs, add their secrets — see the full inventory below.)

3. **Exclude the ATC functions** so the `firestore-atc` named DB is never required at load: ship a filtered
   `index.js` for the emulator codebase that does NOT export `onQueueAtcGenerationCreate/Update` and
   `atcdata_to_pmd` (those reference `getFirestore("firestore-atc")` — at module-eval for `queue_atc_generation.js:4`).
   Easiest: a thin `functions/index.emulator.js` that requires the queue/big/participant components and
   re-exports ONLY the asserted triggers (§1-§11) + the §B upstream CFs, then point an emulator-only
   `firebase.emulator.json` `functions.source`/codebase at it. Do NOT run the default `firebase.json`
   `predeploy` loopDetector against the full `index.js` for the emulator (it imports the ATC module).

4. **`GCLOUD_PROJECT` / project id** must be a non-production demo/test id (e.g. `demo-slabs-queue` for the
   emulator, or `slabs-queue-e2e-exdcz` for the cloud target). `service.js` computes `production` from it;
   anything other than `fir-sample-aae4a` → `production=false` → `starlabs-test` storage-bucket string (no prod
   access). The harness allowlist (`e2e/lib/test-project.js`) already hard-aborts on protected ids.

5. **Firestore databases the emulator must serve:** the **default** DB (all queue triggers) and the named
   **`firestore-forms`** DB (only if you deploy `particpantFormSubmit_SlackIntegration` / drive form-submit
   cases — `schemas.md` §0.6). The named **`firestore-atc`** DB is NOT needed once ATC functions are excluded (#3).

6. **firebase-admin ≥ 13** (package has `^13.4.0`) — supports v2 triggers + named DBs. The functions emulator
   wires `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` automatically for admin-SDK calls inside the
   CFs, so the CF reads/writes hit the emulator, not the cloud. Confirm the emulator config enables `functions`,
   `firestore`, and `auth`.

7. **Cloud target parity (`slabs-queue-e2e-exdcz`):** triggers are reported DEPLOYED on this branch (per the
   task brief). The same secret names must exist in the cloud project's Secret Manager (dummy values OK). Specs
   read `baseURL`/target from the playwright config/env — never hardcode the project id (anti-circularity +
   safety). The read-backs in §1-§11 are identical against emulator or cloud; the ONLY difference is `studioZoomLink`
   may produce REAL zoomdata on the cloud if real Zoom secrets are present — so assert the openVidu "Link Broken"
   path (§2) for determinism across BOTH targets.

### Full `defineSecret` inventory (across ALL components — only deploy the subset your codebase loads)
`ZOOM_ACCOUNTID, ZOOM_CLIENTID, ZOOM_CLIENTSECRET, ZOOM_SDK_CLIENTID, ZOOM_SDK_CLIENTSECRET,
ZOOM_WEBHOOK_SECRET_TOKEN` (queue/big — REQUIRED) · `LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL,
AWS_ACCESS_KEY, AWS_SECRET, MASTER_INSTANCE_ID, MEDIA_ASG_NAME` (openVidu — only if loaded) ·
`POSTMARK_STARLABS_TEST/_V1/_V2, MYOPERATOR_TOKEN, APPLE_APN_KEYID/_TEAMID/_AUTHKEY_P8` (communication —
only if loaded) · `PUBLITIO_KEY/_SECRET` (content) · `RAZORPAY_KEY_ID/_KEY_SECRET` (workshop) ·
`RUNPOD_API_KEY` (runpod) · `FUNCTIONS_SHARED_SECRET` (queue_atc_generation — EXCLUDED with ATC).

---

## RECON_SCHEMA (the contract this file fulfils — for the spec-writer)

Each asserted trigger above is documented as a record of this shape; the CF-side-effect specs consume it:

```
trigger:            <exported function name>            # e.g. onQueueStageChange
file:               <component>.js:<line>               # decl site for re-verification
kind:               onDocumentWritten | onDocumentCreated | onDocumentUpdated | app-callable
path:               <collection/{param}>                # Firestore trigger path (or "src/...service.ts" for app-side)
changeType:         create | update | write | delete    # which transition fires it
condition:          <before/after predicate>            # the exact gate (e.g. status null->approved)
sideEffect[]:                                            # one or more observable writes
  - collection:     <collection written by the CF>
    doc:            <doc id rule>                        # auto-id | = <field> | via <ref>
    fields:         { <field>: <expected>, ... }         # the value the CF computed -> read-back proof
readBack:           <the canonical, NON-circular assertion a spec makes>   # poll a CF-computed value vs a KNOWN seeded number
seedRequirements[]: <docs/fields that must pre-exist or the CF no-ops/throws>
gotchas[]:          <profile_id vs profileid, compulsoryactivity-array, atcmodel-null, dummy-zoom path, ...>
```

PLAN→trigger coverage map (PLAN §2.5): `onQueueStageChange`→§1 · `studioZoomLink`→§2 ·
`studioZoomLinkDeactivate`→§3 · `inviteToStudio`→§4 · `bulkReadyInvitation`→§5 (gap-1) ·
`invitationAccepted`→§6 (gap-2) · `biginvitationAccepted`→§7 (gap-12) · `createBigParticipantAssignment`→§8 ·
`updateDeliveryStatus`→§9 (app-side, gap-10) · `queueParticipantPositionUpdate`→§10 (gap-12) ·
`CreateQueueActivityLogV2`→§11.
