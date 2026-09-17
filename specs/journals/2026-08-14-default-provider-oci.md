# 2026-08-14 — Default media provider flipped to OCI; schedulers read strictly from DB

**Repos touched:** Angular (this repo, branch `videoconference`) + Cloud Functions
(`/Users/m1/Documents/Firebase Functions/Starlabs Functions - VideoConference`).
**Operator directive:** (1) Angular & CF fall back to **`oci`** as the default media
provider; (2) the scheduled controller functions determine the active provider **only from
the DB** (`openvidu server/mediaprovider`), no hardcoded fallback.

## Why (context that triggered this)

Operator observed: DB `activeprovider` = `oci`, but room docs created through the studio /
appointment paths carry **no `mediaProvider` field**. Investigation confirmed only 3 of 7
room-creation paths stamp the field (AWS pre-create, OCI pre-create, instant meeting); the
4 Angular paths through `createOpenViduRoom` (appointment-studio, list-openvidu-room,
dynamic-studio, dynamic-studio-v2) do not. Field-less rooms therefore live or die by the
*fallbacks*, which disagreed: Angular join fell back `oci` (code) while its comment said
`aws`, CF token/recording fell back `aws`, and schedulers fell back `aws`. Decision:
**absent field ⇒ OCI everywhere** on the live-call path; schedulers trust only the DB.

## What changed

### Cloud Functions
- `components/openVidu.js` — `createOpenViduToken`, `openViduStartRecording`,
  `openViduStopRecording`: `req.body.provider || "aws"` → `|| "oci"` (3 sites).
- `components/AWS_endpoint.js` + `components/OCI_endpoint.js` — `getActiveProvider()` now
  returns the DB value or **`null`** (was `|| 'aws'`, incl. on read error). With `null`,
  BOTH controllers idle (OCI still refreshes its status doc). **Consequence (deliberate):
  if the `openvidu server/mediaprovider` doc/field is missing or Firestore is unreadable,
  NO controller wakes servers or pre-creates rooms** — the doc is now load-bearing in both
  Firebase projects (dev AND prod). Seed it before/with the prod cutover.

### Angular
- `join-livekit-call.component.ts` — fallback chain documented and enforced as
  `?provider=` → `mediaProvider` → `'oci'`; the sanitizer's catch-all flipped so unknown
  values map to `'oci'` (explicit `"aws"`/`"do"` still respected).
- `openvidu-recording.component.ts` (instant meeting) — activeprovider read defaults
  `'oci'` (was `'aws'`), including on read failure.
- `monitor-liveassignment.component.ts` — monitor join-token fallback and the provider
  badge label: missing `mediaProvider` → `'oci'` (must match what participants resolve,
  or the monitor joins the wrong cluster).
- `authguard.service.ts` — comment only (omitted field = oci at join time).

### Deliberately NOT changed (don't "fix" these later without reading this)
- **Recording playback** (`openvidu-recording.component.ts:215`,
  `event.mediaProvider === 'oci' ? getSignedUrlOci : getSignedUrlAWS`): absent on an
  `"openvidu event"` doc genuinely means **legacy AWS recording** (webhook stamps every
  event since 2026-07-17). Flipping this would 404 all old recordings.
- **CF housekeeping guards** (`AWS_endpoint.js` `houseKeepRooms`/`getActiveRoomsCount`):
  still treat missing `mediaProvider` as aws-scoped. They only run when
  `activeprovider=aws`; under the new defaults a field-less room gets stamped `oci` at
  first token anyway. Open question, not a directive — revisit if AWS is re-activated.
- **The 4 unstamped `createOpenViduRoom` call sites**: still don't stamp `mediaProvider`.
  Operator chose fallback-based routing instead of stamping-at-creation for now.

## Verified
- CF: `node --check` ×3 clean; require-load OK (openVidu 9 / AWS 10 / OCI 12 exports —
  same counts as 2026-07-17).
- Angular: `ng build --configuration production` — see PROGRESS.md for result.
- NOT runtime-tested (needs deploy): token issue with no `provider` in body → OCI creds;
  scheduler behavior with doc present (=oci: OCI acts, AWS idles) and doc absent (both idle).

## Deploy list (all multiprovider functions, to bring everything current)

Changed this session (must deploy):
`createOpenViduToken`, `openViduStartRecording`, `openViduStopRecording`,
`CheckMasternodeStatus`, `CheckOciNodeStatus`.

Same changed files / shared modules (deploy to keep bundles consistent):
`onEventOpenVidu`, `onEventOci`, `openViduCloseRoom`, `muteParticipant`,
`kickParticipant`, `getSignedUrlAWS`, `awsEventWebhook`,
`startMasterNodeHTTP`, `stopMasterNodeHTTP`, `scaleMediaNodes`, `getSignedUrlOci`,
`startOciMasterHTTP`, `stopOciMasterHTTP`, `scaleOciMediaNodes`, `ociEventWebhook`.

(`flushOpenviduCallQuality` is NOT in the list — deleted this session, archived in
`depreciated.js`.)

Delete first, then deploy (dev):

```
firebase functions:delete flushOpenviduCallQuality --project starlabs-test
firebase deploy --project starlabs-test --only functions:createOpenViduToken,functions:openViduStartRecording,functions:openViduStopRecording,functions:onEventOpenVidu,functions:onEventOci,functions:openViduCloseRoom,functions:muteParticipant,functions:kickParticipant,functions:CheckMasternodeStatus,functions:awsEventWebhook,functions:startMasterNodeHTTP,functions:stopMasterNodeHTTP,functions:scaleMediaNodes,functions:getSignedUrlAWS,functions:CheckOciNodeStatus,functions:startOciMasterHTTP,functions:stopOciMasterHTTP,functions:scaleOciMediaNodes,functions:getSignedUrlOci,functions:ociEventWebhook
```

Plus the Angular rebuild/redeploy for the client-side fallbacks.

## Addendum (same session) — flushOpenviduCallQuality removed; AWS scheduler disable

- **Function audit** (media stack, 28 exported fns): only `flushOpenviduCallQuality` had
  zero callers (no web references, no beacon path; operator confirmed mobile never used
  it). Moved verbatim to `components/depreciated.js` (repo convention: working code, not
  wired into index.js), removed from `openVidu.js` + `index.js` (openVidu 9→8 exports).
  Operator will `firebase functions:delete flushOpenviduCallQuality` then deploy fresh.
- **Everything else stays**: LiveKit Cloud set is live; DO has no deployed fns;
  AWS set kept while the AWS cluster exists — `getSignedUrlAWS` stays until legacy
  recordings migrate, `awsEventWebhook` keeps `AWS_System/instance_status` truthful
  (danger banner), start/stop/scale are the monitor's manual controls, `onEventOpenVidu`
  is the AWS cluster webhook.
- **Operator will disable `CheckMasternodeStatus`** (idles under activeprovider=oci
  anyway). Caveats journaled: no AWS auto-stop while disabled (a manually started AWS
  master runs until manually stopped), and it MUST be re-enabled before flipping
  activeprovider back to aws (auto-wake/pre-create/housekeeping live there).

## Deployed (dev, 2026-08-14)
`flushOpenviduCallQuality` deleted from **starlabs-test** and all 20 functions deployed
successfully (schedulers in asia-south1, rest in us-central1). Prod (`fir-sample-aae4a`)
NOT touched — repeat delete+deploy there at cutover.

## Pending
- Angular rebuild/deploy for the client-side fallbacks; verify `openvidu
  server/mediaprovider` doc exists in BOTH projects (it is now the only thing that lets a
  controller act). Prod delete+deploy at cutover.
- Commit both repos (git remained permission-blocked for Claude this session too).
- Prior threads unchanged: DO bring-up parked; Phase-6 OCI prod; AWS-migration cleanup
  (memory); decide whether to stamp `mediaProvider` at the 4 remaining creation sites.
