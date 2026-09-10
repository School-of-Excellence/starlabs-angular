# HANDOVER — Multi-provider media backend (AWS + OCI + DO)

> For the next session. Read top-to-bottom. Companion journal:
> `specs/journals/2026-07-16-multiprovider-oci-elastic-bringup.md`.
> (This is a **separate** handover from the root `HANDOVER.md`, which is an unrelated Firestore-slowness issue.)

## TL;DR of where we are
Adding **OCI** and **DigitalOcean** as selectable OpenVidu-Elastic media backends alongside **AWS**,
each with **dev + prod** clusters (mirrors AWS `-dev`/`-prod`). **OCI dev cluster is up and a
`?provider=oci` call works end-to-end (audio/video).** Recording/monitoring not done yet. **DO is parked**
(payment-method issue on the DO account).

## Two repos (both have uncommitted work this session)
1. **Angular app** — this repo (`Starlabs - VideoConference`), branch `videoconference`.
   - `src/app/LiveKit/join-livekit-call/join-livekit-call.component.ts` — `provider` resolution
     (`?provider=` / `openviduroom.mediaProvider` / default `aws`), AWS-health-gate bypass for non-AWS,
     `provider` in the token POST.
2. **Cloud Functions** — `/Users/m1/Documents/Firebase Functions/Starlabs Functions - VideoConference`.
   - `functions/components/openVidu.js` — now the **shared** LiveKit dispatcher (provider-aware token).
   - `functions/components/AWS_endpoint.js` — all AWS infra moved here + `creds/SECRETS/CAPACITY_SECRETS/prepareRoom`.
   - `functions/components/DO_endpoint.js`, `OCI_endpoint.js` — new creds modules.
   - `functions/index.js` — re-exports AWS infra funcs from `AWS_endpoint`.
   - Backup of pre-refactor openVidu.js is in this session's scratchpad only (not committed) — the git
     history is the real backstop once committed.

## Secret naming (Google Secret Manager, per Firebase project)
| Provider | Secrets | Set in |
|---|---|---|
| AWS | `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | both projects (existing) |
| OCI | `LIVEKIT_URL_OCI` / `LIVEKIT_API_KEY_OCI` / `LIVEKIT_API_SECRET_OCI` | **`starlabs-test` set ✅**; prod pending |
| DO | `LIVEKIT_URL_DO` / `LIVEKIT_API_KEY_DO` / `LIVEKIT_API_SECRET_DO` | pending (DO parked) |

**Deploy prerequisite:** `createOpenViduToken` binds all of these. **Create the secrets before deploying**
it, or the deploy fails. AWS path never reads DO/OCI secrets, so placeholders are fine until a stack exists.

## How to route a call to a provider
- Testing: `…/joinlivekit/<roomid>?provider=oci` (or `do`).
- Assigned: set `mediaProvider: "oci"` on the `openviduroom/<id>` doc.
- Default (no param / no field) = `aws`. `provider` field stays `"openvidu"` (system), `mediaProvider` = cloud.

## OCI — current state & how to operate
- Terraform: official `openvidu-oracle` @ tag `3.8.0`, folder `pro/elastic`, cloned on the user's Mac.
- `dev.tfvars`: `region=ap-mumbai-1`, `stackName=openvidu-elastic-dev`, `fixedNumberOfMediaNodes=1`,
  `mediaNodeMemory=8`, **`masterNodeShape=mediaNodeShape=VM.Standard.E5.Flex`** (E4 was out of capacity).
- Auth via `~/.oci/config` (DEFAULT profile). Compartment `starlabs-videoconference`.
- **Bring up:** `export TF_VAR_openviduLicense=… TF_VAR_initialMeetAdminPassword=… ; terraform apply -var-file=dev.tfvars`
- **Get creds (no SSH):** OCI Vault → secrets `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
  (pick the **active** vault, not a pending-deletion one). CLI loop is in the journal/session log.
- **⚠️ Between sessions:** if you `destroy` to stop billing, the master's **ephemeral IP changes** on
  re-apply → **`LIVEKIT_URL_OCI` must be re-fetched from Vault and re-set** in `starlabs-test` each time.
  Alternative: leave it running (~$2–3/day of the $300 credits). **Never Stop/Start instances** (breaks
  the cert/URL). Prod later should use a **reserved public IP** to avoid this churn.

## Pending work — recommended order
1. **Recording (OCI).** CF: make `openViduStartRecording`/`Stop` provider-aware — OCI branch writes to
   OCI Object Storage S3 endpoint (`https://<namespace>.compat.objectstorage.ap-mumbai-1.oraclecloud.com`,
   the `…-appdata` bucket, Customer Secret Keys) instead of the hardcoded AWS S3. Client: add
   `provider: this.provider` to the recording POSTs (`join-livekit-call` ~:901/:919). Add OCI S3 secrets.
   Test by triggering record manually → confirm MP4 in bucket. (Storage decision: OCI Object Storage for
   dev; **Cloudflare R2** for prod — cheaper + free egress.)
2. **Recording playback link.** CF `getSignedUrlOci` (presigned GET, OCI S3 endpoint). Client playback path
   provider-aware. Test viewing a finished recording.
3. **Webhook `onEventOci`.** CF: mirror `onEventOpenVidu` but verify with `LIVEKIT_*_OCI` (AWS onEvent
   can't validate OCI-signed webhooks) and fire recording with `provider=oci`. Cluster: set the OpenVidu
   webhook URL on the master to the `onEventOci` function. Enables hands-free record on join/leave.
4. **Monitor "OCI instance box"** (parity with AWS). Needs **OCI API creds as Firebase secrets** (OCI has
   no EventBridge). CF: scheduled `checkOciNodeStatus` polling master state + Instance Pool → writes
   `OCI_System/instance_status`. Angular: extend `instance-status.service` + `monitor-liveassignment` to
   render an OCI box (twin of `AWS_System/instance_status`).
5. **Phase 4 — scale-to-zero controller** (the one-room-one-node piece). `UpdateInstancePool(size = active
   rooms)`, 0 when idle; master stays up (or stop-to-zero — OCI pauses OCPU billing on stop, but see the
   ephemeral-IP caveat → use reserved IP first). Near-copy of `AWS_endpoint.js` reconcile/prepareRoom.
   Add `lifecycle { ignore_changes = [size] }` to the pool in Terraform so it doesn't fight the controller.
6. **Phase 6 — OCI prod** — same as dev with `stackName=openvidu-elastic-prod`, creds → `fir-sample-aae4a`.

## DO — parked, resume later
Payment method issue on the DO account. When fixed: same pattern via the official `openvidu-digitalocean`
Terraform (`pro/elastic`, tag 3.8.0). Region `blr1`, dedicated node `c-4` (avoid shared `s-4vcpu-8gb` for
recording), `fixedNumberOfMediaNodes=1`. DO differs from OCI/AWS: **no native pool desired-capacity and a
stopped droplet still bills** → controller does per-droplet create/destroy, and the **master stays
always-on** (don't stop it). `DO_endpoint.js` creds module already exists.

## Do NOT forget
- Create `LIVEKIT_*_{OCI,DO}` secrets **before** deploying `createOpenViduToken`.
- `PROGRESS.md` was **not** rewritten (it tracks the unrelated `dynamic-studio-update` events work) — this
  handover is the source of truth for the multi-provider stream.
- OCI dev cluster may be **running and billing** right now — decide leave-running vs destroy at session end.

---

## End-of-session addendum (housekeeping done after the journal was written)
- **CF repo — `livekitCloud.js` casing FIXED.** Git had a case-duplicate: an empty `liveKitCloud.js`
  (capital K) ghost alongside the real lowercase `livekitCloud.js`. Removed the empty one. **Keep it
  lowercase** — `index.js` requires `./components/livekitCloud` and Firebase's Linux runtime is
  case-sensitive (capital-K would crash `createLivekitCloudToken` on deploy). Also stopped tracking `.DS_Store`.
- **This repo — journals now tracked.** `.gitignore` was un-ignoring nothing under `specs/`; changed to
  un-ignore only `specs/journals/` + `specs/plans/`. Journals consolidated there; the root `Journal/` folder
  was removed. Companion journal: `specs/journals/2026-07-16-multiprovider-oci-elastic-bringup.md`.
- Both repos pushed. Provider code verified after the `development` merge: all 6 CF files syntax-OK, no
  conflict markers, modules load, refactor intact.

## Session-2 addendum (2026-07-16, later) — Pending #1 + #3 ✅ DEPLOYED & TESTED WORKING
**Tested 2026-07-16 evening:** `?provider=oci` call works, hands-free recording via `onEventOci`
fires, MP4 lands in the OCI bucket. Also survived the stop-master/pool-0 → start/pool-1 cycle
(fresh node takes ~5–8 min to boot; client now shows the real "Media node not ready" message —
its ~45s auto-retry window is shorter than node boot, revisit in Phase 4). Media-node
Terraform now has apt-lock-race retry + `create_before_destroy` (see journal). Remaining
pendings: #2 playback (`getSignedUrlOci`), #4 monitor box, #5 scale-to-zero controller,
#6 prod (patch master scripts' apt race in the template BEFORE first prod apply).

## (original session-2 notes below — development record)
Recording is provider-aware (`openViduStartRecording`/`Stop` take `provider`; OCI → Object
Storage S3-compat, `forcePathStyle: true`), client sends `provider` on both recording POSTs,
and **`onEventOci`** exists (shared `handleOpenViduEvent` + thin aws/oci exports; verified with
`LIVEKIT_*_OCI`, fires recording with `provider=oci`). Details + WHY:
`specs/journals/2026-07-16-oci-recording-and-webhook.md`.

**Before deploy:** create `OCI_S3_ACCESS_KEY` / `OCI_S3_SECRET` in `starlabs-test` — the values
are the Terraform-created Customer Secret Key (`openvidu-elastic-dev-s3-key`) sitting in
`…/openvidu-oracle/pro/elastic/terraform.tfstate` (Customer Secret Keys are capped at 2/user —
do NOT try to mint a new one). Then deploy `openViduStartRecording`, `openViduStopRecording`,
`onEventOci`. **Cluster side:** add the `onEventOci` URL to the `webhook:` block of
`/opt/openvidu/config/cluster/media_node/livekit.yaml` on the OCI master +
`systemctl restart openvidu`. Both repos have uncommitted work (git was permission-blocked).

### How the session-1 handover said to start (recording — Pending #1)
1. **Check the OCI dev cluster is up.** If it was destroyed to save billing, re-apply first
   (`terraform apply -var-file=dev.tfvars` with `TF_VAR_openviduLicense`/`TF_VAR_initialMeetAdminPassword`
   set) and **re-fetch `LIVEKIT_URL_OCI` from the OCI Vault → re-set it in `starlabs-test`** (the ephemeral
   IP changes on every re-create, so the old URL is stale).
2. **Pick recording storage:** OCI Object Storage (dev, simplest — the `…-appdata` bucket already exists) or
   Cloudflare R2 (prod-grade). Recommended: OCI Object Storage for dev.
3. Implement **#1 Recording**: provider-aware `openViduStartRecording`/`Stop` (OCI branch → OCI S3 endpoint
   `https://<namespace>.compat.objectstorage.ap-mumbai-1.oraclecloud.com`, bucket, Customer Secret Keys) +
   client `provider` on the recording POSTs (`join-livekit-call` ~:901/:919) + OCI S3 Firebase secrets.
   Test by triggering a manual recording → confirm the MP4 lands in the bucket.
