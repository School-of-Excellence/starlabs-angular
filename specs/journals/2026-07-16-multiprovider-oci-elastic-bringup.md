# 2026-07-16 — Multi-provider media backend (AWS + OCI + DO) & OCI Elastic bring-up

**Two repos touched this session:**
- Angular app: `Starlabs - VideoConference` (this repo), branch `videoconference`.
- Cloud Functions: `/Users/m1/Documents/Firebase Functions/Starlabs Functions - VideoConference` (separate repo).

## What & why

### Decision: add OCI + DigitalOcean as media-backend options alongside AWS
The self-hosted OpenVidu Elastic media stack (currently AWS `ap-south-1`) is the only piece with real
cloud lock-in and cost. We evaluated AWS vs OCI vs DO for it. **Egress dominates video cost**, and
compute is cheaper off AWS. Chosen direction: keep AWS, **add OCI and DO as selectable providers**,
each with its own **dev + prod** cluster mirroring the AWS `-dev`/`-prod` convention. Firebase project
separates env (`starlabs-test`=dev, `fir-sample-aae4a`=prod); a provider **suffix** on secrets
(`_DO`, `_OCI`) separates provider. AWS stays unsuffixed (no regression).

### Architecture: Design A — one function, `provider` param (NOT separate functions)
AWS/DO/OCI all run OpenVidu Elastic and speak the **LiveKit protocol** — only credentials differ. So
the token/recording/room handlers are **shared**; only the *cloud-specific infrastructure* (capacity/
scaling, node lifecycle, state webhooks) is per-provider. This is unlike LiveKit Cloud, which is a
genuinely different system with its own functions. (User initially thought "separate functions like
livekitcloud" — we chose shared-dispatch because the systems are identical; confirmed with them.)

### CF refactor (functions repo)
- Split `components/openVidu.js` (was 1813 lines, AWS+shared mixed) → **`openVidu.js` is now the shared
  LiveKit dispatcher** (569 lines): `createOpenViduToken`, recording ×2, `onEventOpenVidu`, close, mute,
  kick, flush. Added `getCredsFor(provider)`; `createOpenViduToken` is provider-aware — `aws` →
  `AWS_endpoint.prepareRoom()` (ASG capacity gate, unchanged behavior), `do`/`oci` → ensure-room +
  503-retry.
- **`AWS_endpoint.js`** (1323 lines) now holds all AWS infra moved *verbatim* from openVidu.js
  (EC2/ASG/EventBridge: `CheckMasternodeStatus`, `awsEventWebhook`, `start/stopMasterNodeHTTP`,
  `scaleMediaNodes`, all helpers, `checkCapacity`/`scaleUp`, `getEC2`/`getAutoScaling`) plus new
  `creds()`, `SECRETS`, `CAPACITY_SECRETS`, `prepareRoom()`, and the existing `getSignedUrlAWS`.
- **`DO_endpoint.js` / `OCI_endpoint.js`** — creds modules (`creds()` + `SECRETS`) reading suffixed
  secrets. `index.js` re-exports the 5 AWS infra functions from `AWS_endpoint` now.
- **Why the extraction is safe:** AWS path is byte-identical (prepareRoom is a verbatim lift of the old
  inline logic). Verified with `node --check` + a require-load of both modules (all exports present).
  Could not runtime-test (no deploy access at refactor time) → recommended dev-deploy-first.

### Angular (this repo)
`src/app/LiveKit/join-livekit-call/join-livekit-call.component.ts`:
- Added `provider` field; resolves from `?provider=` query param → Firestore `openviduroom.mediaProvider`
  → `'aws'`. Passes `provider` in the `createOpenViduToken` POST.
- **Bypasses the AWS-only `checkServer()` health gate** for non-AWS providers (it reads
  `AWS_System/instance_status`, which only applies to AWS).
- Typecheck clean.

### Surprise / gotcha found: provider-field collision
`createOpenViduToken` **stamps `provider: "openvidu"`** on the room doc every call (used by
`monitor-liveassignment` to classify openvidu vs livekit-cloud). Overloading `provider` with aws/do/oci
would be clobbered. **Fix:** the cloud selector uses a separate **`mediaProvider`** field; the token
function now stamps `{ provider: "openvidu", mediaProvider }`.

## OCI Elastic bring-up (official `openvidu-oracle` Terraform 3.8.0, `pro/elastic`)
- **Phase 1:** OCI account (home region **Mumbai**, permanent), dedicated compartment
  `starlabs-videoconference`, API signing key via `oci setup config`, Customer Secret Keys, tools.
- **Phase 2:** `dev.tfvars` — `region=ap-mumbai-1`, `stackName=openvidu-elastic-dev`,
  **`fixedNumberOfMediaNodes=1`**, `mediaNodeMemory=8`. Auth reads `~/.oci/config` (no key vars needed).
- **Phase 3:** pulled `LIVEKIT_URL/API_KEY/API_SECRET` from **OCI Vault secrets** → set as
  `LIVEKIT_URL_OCI` / `LIVEKIT_API_KEY_OCI` / `LIVEKIT_API_SECRET_OCI` in `starlabs-test` → deployed
  `createOpenViduToken` → **`?provider=oci` call works** (first attempt failed on wrong secret values;
  fixed).

### Load-bearing OCI findings (the WHY, verified against the Terraform)
- **Fixed mode skips OCIR + the scale-in Docker function.** `variables.tf` validation:
  `fixedNumberOfMediaNodes > 0 || scale_in_function_image != ""`. OpenVidu's own autoscaler is
  CPU-based/min≥1 — it can't do one-room-one-node or scale-to-zero, so we disable it and will drive
  scaling ourselves (same as we bypass the AWS ASG autoscaler in `CheckMasternodeStatus`).
- **Media nodes are a resizable OCI Instance Pool** (`oci_core_instance_pool.media_node_pool`,
  `size = fixed>0 ? fixed : initial`). This is the OCI twin of the AWS ASG desired-capacity. The Phase-4
  controller will `UpdateInstancePool(size = active room count)` (0 when idle) — a near-copy of
  `AWS_endpoint.reconcileMediaUp`. **Add `lifecycle { ignore_changes = [size] }`** so Terraform doesn't
  fight the controller's runtime resizes.
- **Master uses an ephemeral public IP** (`assign_public_ip=true`, no reserved IP); the URL + Let's
  Encrypt cert are derived from it. **Never Stop/Start the instances** — a stop releases the IP and
  breaks the cert/URL (cloud-init won't re-run). Pause = leave running (~$2–3/night) or `destroy`.
- **`vault_type = "DEFAULT"`** (free). Vaults/keys/secrets have a **mandatory 7-day-min deletion delay**,
  so `terraform destroy` only *schedules* them — harmless, ~free.
- **E4.Flex was "Out of host capacity" in Mumbai** → switched master+media to **E5.Flex**. Capacity is
  per-shape-per-region; E5 (newer) had it.
- **Credentials live in Vault secrets** → retrievable in Console/CLI, **no SSH needed**.

## Pending
See `HANDOVER-MULTIPROVIDER.md` (root). Short list: OCI recording (provider-aware
`openViduStartRecording` → OCI Object Storage/R2) → playback link (`getSignedUrlOci`) → webhook
(`onEventOci` + cluster config) → monitor OCI instance box (`OCI_System/instance_status` poller + UI) →
Phase 4 pool-resize controller → Phase 6 prod. **DO is parked** (payment-method issue) — resume with the
same pattern via `openvidu-digitalocean` Terraform.
