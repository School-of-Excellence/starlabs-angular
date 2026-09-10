# 2026-07-16 (session 2) — OCI recording + OCI webhook (Pending #1 + #3): DONE & TESTED

**Repos touched:** Cloud Functions (`Starlabs Functions - VideoConference`) + Angular (this repo)
+ Terraform clone (`Oracle Cloud/openvidu-oracle/pro/elastic`).
**Final status: deployed to `starlabs-test`, tested end-to-end working** — `?provider=oci` call
connects, hands-free recording fires via `onEventOci`, MP4 lands in the OCI bucket, and the
whole thing survives the operator's stop-master/pool-0 → start/pool-1 daily cycle.

## What & why

### Recording is now provider-aware (Pending #1)
- `openViduStartRecording`: reads `provider` from the POST body (default `aws`), gets LiveKit
  creds via `getCredsFor(provider)`, and picks storage per provider — `oci` →
  `OCI_endpoint.recordingStorage()` (S3-compat), else the existing hardcoded AWS S3 block
  (byte-equivalent for AWS callers). Binds `OCI_endpoint.SECRETS + RECORDING_SECRETS`.
- `openViduStopRecording`: same `provider` + `getCredsFor()` treatment. **Why:** `stopEgress`
  must be issued to the cluster running the egress; the old handler always talked to AWS.
- Client (`join-livekit-call.component.ts`): both recording POSTs now send
  `provider: this.provider`. Typecheck clean.

### OCI recording storage decision (dev)
OCI Object Storage, bucket `openvidu-elastic-dev-appdata-d16985`, endpoint
`https://bmx7corpjbkz.compat.objectstorage.ap-mumbai-1.oraclecloud.com`, region `ap-mumbai-1`,
**`forcePathStyle: true`** (OCI S3-compat requires path-style; the stack's own
`EXTERNAL_S3_PATH_STYLE_ACCESS="true"` confirms it). Endpoint/bucket are hardcoded in
`OCI_endpoint.js` (same style as the AWS bucket), only the key pair is secret. Prod = R2 later.

### Load-bearing discovery: the S3 key pair lives in terraform.tfstate
- OCI **Customer Secret Keys are capped at 2 per user** and both slots are taken
  (`ov-object-storage`, `openvidu-elastic-dev-s3-key`) → could NOT mint a fresh key.
- The Terraform stack itself creates `openvidu-elastic-dev-s3-key`
  (`oci_identity_customer_secret_key.openvidu_s3_key`) and seeds it into the master's
  `openvidu.env` as `EXTERNAL_S3_ACCESS_KEY/SECRET_KEY`. **The full pair (access key = key id
  `203caea…`, plus the secret) is in
  `/Users/m1/Documents/Oracle Cloud/openvidu-oracle/pro/elastic/terraform.tfstate`.**
  We reuse this key — same bucket, same purpose as the cluster's own storage access.
- New Firebase secrets (in `starlabs-test`): **`OCI_S3_ACCESS_KEY` / `OCI_S3_SECRET`**.
  Claude was permission-blocked from writing them; operator set them from tfstate and deployed
  (`openViduStartRecording`, `openViduStopRecording`, `onEventOci`). **They must exist before
  any deploy that binds them.**

### OCI webhook `onEventOci` (Pending #3)
- `onEventOpenVidu`'s body was extracted into a shared `handleOpenViduEvent(req, res, provider)`;
  `onEventOpenVidu` (aws) and the new `onEventOci` (oci) are thin exports over it.
  **Why shared, not a copy:** the event logic is provider-agnostic (Design A); only the
  signature-verification key pair differs (AWS-keyed `WebhookReceiver` rejects OCI-signed posts)
  and `provider` is forwarded on the internal recording start/stop POSTs so hands-free
  recording on OCI lands in OCI storage. AWS behavior is unchanged (its internal recording
  calls now send `provider:"aws"` explicitly — the server default anyway).
  *Flagged to operator: if a literal standalone copy is preferred over the shared handler, swap it.*
- `index.js` exports `onEventOci`.
- **Cluster side (operator step):** on the OCI master, add the function URL to the `webhook:`
  section of `/opt/openvidu/config/cluster/media_node/livekit.yaml`, then
  `systemctl restart openvidu` (per OpenVidu 3.x docs; one master restart propagates).

## Verification done
- Static: `node --check` on `openVidu.js` / `OCI_endpoint.js` / `index.js`; require-load shows
  all 9 exports incl. `onEventOci`; Angular `tsc --noEmit` clean (twice, after each edit).
- **Runtime (operator, after deploy + webhook config):** `?provider=oci` call connects with
  audio/video; recording started hands-free on join (webhook → `onEventOci` →
  `openViduStartRecording` provider=oci) and the **MP4 landed in
  `openvidu-elastic-dev-appdata-d16985/recordings/`**.
- **Daily-cycle test:** stop master + pool→0, then start master + pool→1. Fresh node takes
  ~5–8 min to bootstrap; during that window the token endpoint 503s and the client now prints
  the truthful `Token 503 (oci): Media node not ready. Please retry.` After boot completed the
  call connected and worked with no intervention. **Known UX gap:** the client auto-retries
  only 3×15s (~45s) — shorter than node boot, so early joiners must manually retry/refresh.
  Decision deferred to Phase 4 (the controller changes the whole node-readiness story).

## Surprises
- Permission classifier blocked writing Secret Manager values and (later) git commands —
  session ended with uncommitted work in both repos; operator to commit.
- Vault does NOT hold the S3 key (only LiveKit/Mongo/Grafana/etc.); tfstate does.
- Master was Stop/Start-ed by operator between sessions — on OCI, ephemeral public IPs
  survive stop/start (unlike AWS), so the earlier "never stop" caveat was over-cautious;
  LIVEKIT_URL_OCI in `starlabs-test` is already up to date per operator.

## Post-deploy incident: "System at capacity" on OCI join (SOLVED)
Fresh pool media node (pool 0→1 that morning) came up **bare** — its cloud-init user_data lost
the first-boot apt *lists*-lock race against Ubuntu 24.04's automatic apt jobs
(`DPkg::Lock::Timeout` does not cover that lock, and the `apt-get update && install` form is
exempt from `set -e`'s errexit, so the script staggered on and died at `pipx: not found`).
No docker/livekit → master Caddy had no upstream (twirp returned 503, not 401) → token
ensure-room 503-looped → client threw its hardcoded 'System at capacity'. **Webhook yaml edit
was innocent.** Fixes: (1) client now logs/throws the server's real 503 message
(`getTokenWithRetry`); (2) immediate: re-run `/var/lib/cloud/instance/scripts/part-001` on the
node; (3) permanent: `apt_retry` (bounded, 30×10s) wrapping apt in **both media-node scripts**
in the Terraform (`user_data_media` + `install_script_media`) — `terraform validate` clean,
apply pending. **Master scripts deliberately NOT patched**: changing the master's user_data
forces instance replacement (new ephemeral IP/cert → secret churn). Patch them in the Phase-6
prod template before first apply, where it's free. Scale-to-zero note: every pool scale-up
rolls this dice until the patched config is applied.

### Applying the Terraform patch: instance-configuration replacement needs CBD
First two applies 409'd: OCI instance configurations are immutable (user_data change =
replacement) and **cannot be deleted while the pool references them**; Terraform's default
destroy-then-create ordering deadlocks (delete refused → nothing created; `-target` on the
pool doesn't help since the deposed destroy rides along). Fix: `lifecycle {
create_before_destroy = true }` on `media_node_config` → create new → repoint pool → delete
old; applied clean. Verified end-to-end: bare node terminated, pool respawned `inst-wrdnk`
from the patched config, install completed, twirp probe = 401 (healthy). Note: an
unauthenticated twirp probe returning **404 means bad_route (missing Content-Type), i.e. the
server IS up** — only 503 means no upstream; 401 = healthy.

## Pending after this session
1. **Commit all three repos** (git was permission-blocked for Claude the whole session):
   Angular (provider on recording POSTs, 503-message fix, journals/handover), Functions
   (provider-aware recording, `onEventOci`, `OCI_endpoint` storage), Terraform clone
   (`apt_retry` in both media scripts + `create_before_destroy` on `media_node_config`).
2. **Pending #2 — recording playback**: CF `getSignedUrlOci` (presigned GET against the OCI
   S3-compat endpoint, reuse `OCI_S3_*` secrets, `forcePathStyle`), client playback path
   provider-aware (today it calls `getSignedUrlAWS` unconditionally). Then: #4 monitor box →
   #5 Phase-4 scale-to-zero controller (also revisit the 45s token-retry window + reserved IP)
   → #6 prod (patch the MASTER scripts' apt race in the template BEFORE first prod apply —
   free then, instance-replacing later). DO still parked (payment method).
