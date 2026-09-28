# 2026-07-08 — Zoom Client View screen: end-to-end flow (frontend + cloud functions)

**Session type:** investigation only (goal: *"checkout how zoom client view screen is working and look into my starlabs cloud function for the full flow. just journal not coding"*). No code changed.

**Scope:** the **queue / Dynamic Studio** Zoom flow (`collectiontype = 'queue'`). The same component also serves the `appointment` flow, which is noted where it diverges. The `big` assignment Zoom flow lives in a different component (`src/app/big/zoom-meeting/`) and is out of scope except where the shared webhook touches it.

---

## The two repos involved

1. **Angular app** — `/Users/macbook/Projects/AngularProjects/starlabs-angular`
   - Screen: [zoom-clientview.component.ts](src/app/queue system/zoom-clientview/zoom-clientview.component.ts) (1304 lines)
   - Route: `openmeeting/:id/:collectiontype` → `ZoomClientviewComponent`, `canActivate: [authGuard]` ([app.routes.ts:184](src/app/app.routes.ts:184))
   - Launched from: [dynamic-studio.component.ts:2280 `navigateMeeting()`](src/app/queue system/dynamic-studio/dynamic-studio.component.ts:2280) and the v2 studio ([dynamic-studio-v2.component.ts:4564](src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.ts:4564)).

2. **Cloud functions** — `/Users/macbook/Projects/Functions/starlabs-cloud-function/functions` (⚠️ **separate git repo, not under the Angular project**). Node/Firebase Functions v2.
   - `components/queuesystem.js` (3732 lines) — `studioZoomLink`, `studioZoomLinkRegenerate`, `zoomActivitylog` (webhook)
   - `components/service.js` (1142 lines) — `getUnusedZoomAccount`, `generateSignature`, `generateZoomMeeting` (shared helpers)
   - `index.js` wires exports; each component is `require()`d.

**Key architectural fact:** the Angular screen NEVER calls a cloud function directly for Zoom. There is **no `httpsCallable`** in the component. The whole handshake is **Firestore-document-driven**: the studio creates a `live assignment` doc → a Firestore `onDocumentCreated` trigger generates the Zoom meeting + SDK signatures and writes them back onto the same doc → the screen reads the doc and joins. Firestore is the message bus.

---

## Full lifecycle (queue flow)

### 1. Meeting provisioning — cloud function `studioZoomLink`
`queuesystem.js:825` — trigger: `onDocumentCreated("live assignment/{id}")`, secrets: `ZOOM_ACCOUNTID/CLIENTID/CLIENTSECRET` (Server-to-Server OAuth app) + `ZOOM_SDK_CLIENTID/CLIENTSECRET` (Meeting SDK app). **Two distinct Zoom apps**: S2S OAuth mints REST meetings; the SDK app signs client-join JWTs.

Steps:
1. Look up the `queue_token` for this assignment → its `currentstage` → the `queue generation` doc → `stageproperty[stageKey].enablezoom`. **Zoom is per-stage, opt-in** (`queuesystem.js:857`). If the stage doesn't enable zoom, nothing is provisioned.
2. Check `queue studio pairing/{studioid}.openvidu`. If OpenVidu is enabled for that studio, it writes a stub `zoomdata { host_email:"soe1@…", start_url:"Link Broken" }` and the flow goes to OpenVidu/`joinroom` instead — **Zoom and OpenVidu are mutually exclusive per studio** (`queuesystem.js:904`).
3. **Allocate a Zoom host account** via `getUnusedZoomAccount()` ([service.js:243](/Users/macbook/Projects/Functions/starlabs-cloud-function/functions/components/service.js)): queries `zoomaccount` where `accounttype=="licensed"` and `inuse==false`, cross-checks that no live `live assignment` or future `appointments` already hold that email, then claims it inside a **Firestore transaction** (recursive retry on race). This is a **finite pool of licensed Zoom seats** — running out returns `null` → doc gets the "Link Broken" stub.
4. Build a human-readable `topic` (`"<participant> with <specialists> (<bonus>) - <stagename> Studio - <time>"`).
5. Mint an S2S OAuth token (`POST https://zoom.us/oauth/token?grant_type=account_credentials`), then `POST https://api.zoom.us/v2/users/{email}/meetings` with `type:1` (instant), `join_before_host:true`, `waiting_room:true`, `approval_type:1`, `mute_upon_entry:false`. Auto-recording is **commented out** (`"auto_recording":"local"` disabled) — recording is started manually in-call (see the recording-prompt UI).
6. Generate **two** SDK signatures with `generateSignature(sdkKey, secret, meetingNumber, role)` ([service.js:319](/Users/macbook/Projects/Functions/starlabs-cloud-function/functions/components/service.js)) — a JWT (HS256 via `jsrsasign`/`KJUR`) with `role:1` for the **host** and `role:0` for the **participant**, 2-hour `exp`.
7. Mark the `zoomaccount` `inuse:true, hostid, useby: <doc path>`.
8. **Write back onto the live assignment doc** (`queuesystem.js:1016`):
   ```
   hostsignature:        <role-1 JWT>
   participantsignature: <role-0 JWT>
   zoomdata:             <full Zoom create-meeting response>  // id, password, host_email, join_url, start_url, host_id…
   ```
9. Post a Slack card with participant/specialist/stage/links.

If the Zoom API throws, it logs but leaves the doc without signatures (the studio's `navigateMeeting` then blocks on the "Link Broken"/missing `start_url` guard, `dynamic-studio.component.ts:2284`). `studioZoomLinkRegenerate` (`queuesystem.js:1401`, an `onRequest`) exists to re-mint on demand.

### 2. Launch — Dynamic Studio
`navigateMeeting(doc)` guards on `zoomdata.start_url` (blocks if missing/"Link Broken"), then opens `/openmeeting/<docid>/queue` in a new tab via `window.open(..., "_blank")`. The specialist opens from the Studio tab (so the meeting tab's `window.opener` is the Studio — later used to return focus on end). The participant reaches the same route from the participant/queue-web screen.

### 3. In-screen — `ZoomClientviewComponent`
Constructor reads `:collectiontype` → maps to collection (`queue`→`live assignment`, `appointment`→`appointments`), `getDoc`s the doc:
- **Not found** → `meetingEnded=true, endedReason='notfound'`.
- Else stores `zoomdata` and calls `startmeeting()`.

`startmeeting()`:
1. **Validity gate**: queue docs must have `status==='live'`; `completed`/`cancelled`/other → "meeting ended" screen (`completed`/`cancelled`/`expired`). Status is flipped by the studio on stage completion/cancel (`dynamic-studio.component.ts:1433 status:"completed"`, `:968 status:"cancelled"`; created `live` at `:1132`).
2. **Role resolution**: `guard.getRoles()` → `profile_ref.id`; host if the profile id is in `zoomdata.pairing` (queue) / `zoomdata.hosts` (appointment). → `profileHost` boolean.
3. **Specialist-wait gate** (participant only, queue only): the participant must not enter an empty room. Participant stamps `participantReadyAt` (and clears `participantLeftAt`), starts a pagehide heartbeat, and if `isSpecialistPresent()` is false (`specialistJoinedAt && !specialistLeftAt`) shows the **waiting screen** and subscribes to the doc. When the host's join flips `specialistJoinedAt`, the gate releases, fires `alertParticipant()` (chime loop + system notification + title flash for backgrounded tabs), and re-enters `startmeeting()`.
4. **Zoom SDK bootstrap**: SDK lib is **self-hosted** — `setZoomJSLib(origin+"/zoom/lib")` because Zoom's CDN dropped the 4.x+ Client-View `/ui` bundle (dist `{lib,ui}` served from `/zoom` via angular.json). `preLoadWasm()`, `prepareWebSDK()`, `i18n.load('en-US')`, then `ZoomMtg.init({ leaveUrl, defaultView:'gallery', patchJsMedia:true })` inside `runOutsideAngular`.
   - `leaveUrl`: host → `/dynamicstudio`, participant → `/queue-web`.
   - On init success, `ZoomMtg.join(zoomConfig)` with `sdkKey:"rjad2eLZSIKlamaIwi09tw"`, the role-appropriate signature (`hostsignature`/`participantsignature`), `meetingNumber: zoomdata.id`, `passWord: zoomdata.password`, `userName: hostname`, and host uses `zak` / participant uses `customerKey: profileid`.

   **⚠️ Discrepancy worth flagging (not a bug today):** the host branch sets `zoomConfig["zak"] = this.zoomdata['zak']`, but **`studioZoomLink` never writes a top-level `zak`** onto the doc (grep for `zak` in the functions repo returns nothing). So `zak` is effectively `undefined`; host join works anyway because the meeting is `join_before_host:true` and the host presents a `role:1` signature. If Zoom ever tightens host-start to require a ZAK, this silently-missing field is where it will break.

### 4. Cross-origin isolation (gallery view)
Gallery view needs `SharedArrayBuffer` → needs COOP/COEP headers. `firebase.json` sets `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` **only** on `/openmeeting/**` (and a couple of other meeting routes). The component logs a diagnostic warning if `crossOriginIsolated` is false. This is why the meeting lives on its own `/openmeeting` route rather than inside the studio SPA shell.

### 5. Presence model (no heartbeat)
The 10s `*LastSeenAt` heartbeats were **removed** (`specs/plans/2026-06-24-presence-heartbeat-removal.md`). Presence is now derived purely from one-shot timestamps on the `live assignment` doc, written by the client:
- Participant: `participantReadyAt` (at wait screen) → `participantInCallAt` (joined) → `participantLeftAt` (pagehide / route change / meeting-end).
- Specialist: `specialistJoinedAt` (call start, preserved across rejoin) / `specialistLeftAt`.
- `wireMeetingEndListener()` uses `ZoomMtg.inMeetingServiceListener('onMeetingStatus')`, `status===3` = disconnected. Host end stamps **both** leaves ("end for all"); participant stamps only their own. The write is issued **before** the leaveUrl redirect so it enters Firestore's offline queue and syncs across the hard navigation (a bare pagehide write races the redirect and is lost).
- `returnToStudioTab()`: on host end, instead of leaveUrl spawning a fresh `/dynamicstudio`, it pings the opener Studio tab via `BroadcastChannel('starlabs-dynamic-studio')` and `window.close()`s the meeting tab (waits on the leave-write or a 700ms cap first).

### 6. In-call UX handled entirely client-side
- **Capture / clip**: Tab key or Capture button → `onClick()` → `html2canvas('#zmmtg-root')` screenshot chip (auto-removed after 10s) **and** appends `{timestamp, capturedby}` to `live assignment.cliptimings` via `arrayUnion`. These timings are what the recording webhook later slices the cloud recording on.
- **Safari custom control bar**: Zoom SDK 6.1.0's footer is present+clickable but **unpainted in Safari** (confirmed SDK bug, not CSS-fixable). On Safari the component renders its own Angular bar and proxies clicks to the invisible native buttons (`clickNativeControl`), mirroring state by polling the native buttons' labels. Device/More menus are read from Zoom's own (dislocated) popups and re-rendered anchored.
- **Recording prompt** (host only): `onRecordingChange` is the only real recording event in this SDK build (the older `onRecordingStatusChange`/`onRecordChange` names don't exist). Prompts the host to resume/start recording when ≥1 other participant is present AND an explicit `paused`/`stopped` event was seen (never on `unknown`, to avoid nagging while recording is actually on). "Resume" clicks the native record control (`ZoomMtg.record` is a no-op stub in 6.1.0).
- **Prescribe ATC**: opens `/dynamicstudio?step=prescribe-atc` in a stable-named tab (reuses/refocuses).

### 7. Post-call — cloud webhook `zoomActivitylog`
`queuesystem.js:2446` — `onRequest`, Zoom webhook endpoint (secret `ZOOM_WEBHOOK_SECRET_TOKEN`). Handles:
- `endpoint.url_validation` — HMAC challenge-response.
- Logs every event to `zoom activitylog`.
- `meeting.created` / `meeting.ended` — flips the `zoomaccount.inuse` flag by `host_id` (this is the **authoritative seat-release** — clears `hostid`/`useby` on end, returning the account to the pool). On `meeting.ended` it also marks `big assignment` attendance via the Zoom participants report.
- `recording.completed` — finds the `live assignment` by `zoomdata.id`, and if it has `cliptimings`, `fetchCloudRecording()` downloads the cloud recording and slices it at each captured clip timestamp (`queuesystem.js:2575+`). So the Tab-key "capture" in-call and the server-side clip extraction are **two halves of one feature** bridged by `cliptimings`.

---

## Mental model (one line)
`live assignment` doc = the shared state machine. **Studio writes it → `studioZoomLink` enriches it with Zoom creds → the `/openmeeting` screen joins & mutates presence/clip fields → `zoomActivitylog` webhook releases the seat and post-processes the recording.** No direct RPC between screen and functions; Firestore is the bus.

## Surprises / gotchas found
- **Cloud functions live in a sibling repo** (`~/Projects/Functions/starlabs-cloud-function`), not in the Angular project — easy to miss when tracing "the backend".
- **Two Zoom apps** (S2S OAuth for REST + Meeting SDK for join JWTs) with **five** secrets total.
- **Finite licensed-seat pool** with transactional allocation and webhook-based release — the fragile part of the whole system (seat leak if `meeting.ended` webhook is missed; the `getUnusedZoomAccount` pre-checks are the safety net).
- **`zak` is referenced by the host join config but never written by the backend** — currently harmless due to `join_before_host`, but a latent trap.
- **Zoom SDK is self-hosted** under `/zoom` because Zoom stopped shipping the Client-View bundle on their CDN.
- Recording is **not** auto-started (the `auto_recording:"local"` line is commented) — hence the whole host-side recording-prompt subsystem.

## Pending / not investigated
- The `appointment` branch (`appointmentZoomIntegraion.js`, 1761 lines) — only noted where it diverges; not traced end-to-end.
- `big` assignment Zoom flow (`src/app/big/zoom-meeting/`) — shares the `meeting.ended` webhook branch but otherwise separate.
- `studioZoomLinkRegenerate` internals (the on-demand re-mint path) — confirmed to exist, not read line-by-line.
