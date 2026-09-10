# Multi-provider (AWS + OCI) — dev-environment acceptance test cases

> Run against `starlabs-test` after deploying the Phase-4/5 functions. Every scenario has a
> PASS condition; the system is "dev-complete" when all pass. Mark ✅/❌ inline.
> Cluster prep: OCI master may start stopped — several scenarios exercise exactly that.

## A — Provider routing & joining

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| A1 | AWS default join (regression) | Join `…/joinlivekit/<room>` with no param, room doc without `mediaProvider` | Call connects on AWS exactly as before | |
| A2 | OCI join via query param | OCI cluster running → join `…/joinlivekit/<room>?provider=oci` | Audio/video call works; room doc gets `mediaProvider: "oci"` | |
| A3 | OCI join via room assignment | Set `mediaProvider: "oci"` on the room doc, join without param | Routed to OCI | |
| A4 | Join while OCI stopped | Master stopped → join `?provider=oci` | Console shows `Token 503 (oci): Media node not ready. Please retry.` — clear message, no crash. (Join does NOT auto-start the master — use the monitor Start button first; by design.) | |

## B — Recording

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| B1 | OCI manual recording | In an OCI call press record, wait, stop | MP4 lands in `openvidu-elastic-dev-appdata-d16985/recordings/` | |
| B2 | OCI hands-free recording | Just join an OCI call (webhook → `onEventOci`) | `recordingstatus` goes starting→started with no clicks; MP4 lands after leaving | |
| B3 | AWS recording (regression) | Record in an AWS call | MP4 lands in `openvidu-meet-recordings-dev` (AWS S3) | |

## C — Playback

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| C1 | OCI playback | Recordings screen → Get Video on an OCI event (`mediaProvider: "oci"`) | Video opens & plays (presigned OCI URL, 10-min expiry) | |
| C2 | AWS playback (regression) | Get Video on an AWS event | Plays as before via `getSignedUrlAWS` | |
| C3 | Legacy events | Get Video on a pre-stamp event (no `mediaProvider`) | Routes to AWS (backfill the field manually if the recording is actually on OCI) | |

## D — Monitor screen (developer role)

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| D1 | Status truth | Compare OCI cards vs OCI console | Master state, IP, shape, pool size/healthy counts match | |
| D2 | Event push latency | Stop or start the master **in the OCI console** | Cards update within ~1 min (event → webhook), not the 5-min poll (requires subscription ACTIVE) | |
| D3 | Start button | OCI master stopped → ▶️ Start | Master starts, pool → 1, card flips to `starting` then `running`; button disabled while running | |
| D4 | Stop guard | With an active OCI room → ⏹️ Stop | Blocked with `Cannot stop: N active room(s)` | |
| D5 | Stop button | No active OCI rooms → ⏹️ Stop | Pool → 0 first, then master SOFTSTOPs; cards follow | |
| D6 | Scale bounds | ➕/➖ repeatedly | Never below 0 nor above 5; each click reflected in Pool Size within seconds | |
| D7 | AWS cards (regression) | Use the AWS Start/Stop/scale buttons | Behave exactly as before; OCI clicks never disable AWS buttons | |

## E — Controller (the Phase-4 brain)

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| E1 | Capacity gate / one-room-one-node | 1 media node busy with room A → start joining room B (`?provider=oci`) | B's join 503s (`SCALING_IN_PROGRESS`), pool grows to 2, retry succeeds once node boots (~5–8 min); room A undisturbed | |
| E2 | Idle stop-to-zero | Leave cluster running, no OCI rooms, no upcoming openvidu appointments; wait ≤5 min tick | Master SOFTSTOPped, pool 0, status doc updated (`closedReason` on any housekept rooms = `auto-inactive`) | |
| E3 | Appointment auto-start | Master stopped → create an `appointments` doc: `platform:"openvidu"`, `starttime` ~10 min out, `cancelled:false`, `attended:false` | Next tick starts master + pool→1. If the room doc has `mediaProvider:"oci"`, LiveKit room pre-created + `livekitRoomPreCreated:true` | |
| E4 | Housekeeping isolation | Leave an empty OCI room doc idle >15 min; have an AWS room also live | OCI controller inactivates only the OCI room; AWS controller never touches OCI rooms (and vice versa) | |
| E5 | AWS master isolation | Only OCI rooms active (no AWS ones) | AWS `CheckMasternodeStatus` still auto-stops the AWS master — OCI rooms don't hold it hostage | |
| E6 | Terraform no-fight | While pool is at controller-set size ≠ tfvars value → `terraform plan -var-file=dev.tfvars` | Plan shows **no changes** for the pool (ignore_changes) | |

## F — Daily cycle (the real-life workflow)

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| F1 | Full day loop | Evening: everything idle → auto-stop. Morning: press Start (or create an appointment) → join → record → play → leave → idle auto-stop | Whole loop hands-free except the morning trigger; fresh media node bootstraps despite apt-lock race (patched script) | |

## Known caveats (by design, agreed)

- Manual Start with no join and no appointment: the next 5-min tick stops the cluster again (AWS-parity idle rule). Join within the tick or create an appointment.
- ~~Client auto-retries the 503 for only ~45s~~ **Superseded in V2:** the join screen now gates on the provider's status doc ("server starting…") for both AWS and OCI, so the retry window no longer bites.
- ~~Any upcoming appointment wakes both masters~~ **Superseded in V2:** the `activeprovider` gate means only the active cloud's controller acts.
- Status via events is near-instant; the 5-min poll remains as backstop, so worst-case staleness without events is 5 min.

---

# V2 — Real-flow product acceptance (2026-07-17, activeprovider + instant meeting)

> Prereq: `openvidu server/mediaprovider { activeprovider }` doc exists; V2 functions deployed
> (`CheckMasternodeStatus`, `CheckOciNodeStatus`); Angular rebuilt; `/joinroom` now = LiveKit component.

## S — Provider switch & monitor

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| S1 | Selector + single-provider view | As developer open monitor; switch AWS↔OCI | Only active provider's 2 cards render; other side is a slim "(inactive)" strip; Firestore field updates on confirm | |
| S2 | Controllers obey the flag | Set `activeprovider:"oci"`; watch both schedulers' next tick in logs | AWS logs `activeprovider=oci — AWS controller idle` and does nothing; OCI runs the full controller | |
| S3 | Danger strip | With OCI active, start the AWS master from the AWS console | Red strip "⚠ AWS server is running while OCI is the active provider" appears (via EventBridge push); its Stop button zeroes media + stops master; strip returns to silent | |
| S4 | Reverse danger | With AWS active, start OCI master from OCI console | Same behavior via `ociEventWebhook`; Stop OCI works from the strip | |

## R — Real booking flow (journey coaching / onboarding)

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| R1 | AWS appointment E2E (`activeprovider:"aws"`) | Book platform-OpenVidu appointment 10–15 min out → wait tick → studio Launch at LIVE → call → leave → idle | Room doc created with `mediaProvider:"aws"` + title; `/joinroom` lands on the NEW LiveKit component and connects on AWS; hands-free record; 15-min room end; master auto-stop | |
| R2 | OCI appointment E2E (`activeprovider:"oci"`) | Same booking, OCI active | OCI controller wakes OCI master + pool 1, creates room doc `mediaProvider:"oci"` with proper title; studio Launch → `/joinroom` → "server starting…" if still booting → call on OCI; record → OCI bucket; playback; room end; OCI stop-to-zero. AWS never wakes | |
| R3 | Reactivation restamp | Room doc from an OCI period goes inactive; switch to AWS; same appointment re-fires | Doc reactivated with `mediaProvider` flipped to `"aws"`; join lands on AWS | |
| R4 | Cancelled appointment | Book then set `cancelled:true` before start | No server wake; if awake and idle, next tick stops it | |
| R5 | Back-to-back appointments | Two appointments 20 min apart | Server up through both, stops only after both done | |
| R6 | Zoom isolation | Book platform-Zoom | No server wake at all | |

## I — Instant meeting

| # | Scenario | Steps | PASS when | Status |
|---|----------|-------|-----------|--------|
| I1 | Instant meeting, server off | `activeprovider:"oci"`, OCI stopped → `/openvidurecordings` → New Room → title | Room doc `mediaProvider:"oci"`; OCI master starts; creator auto-navigates to `/joinroom/<id>` showing "server starting…"; connects when ready (~5–8 min) | |
| I2 | Instant meeting, server on | Same with OCI already running + healthy | Start returns "already running" (silent); creator lands in the call within seconds | |
| I3 | Instant meeting on AWS | `activeprovider:"aws"` → New Room | Same flow against AWS (`startMasterNodeHTTP` + AWS gate screen) | |
| I4 | Second participant | Share `/joinroom/<id>` while server still booting | They also get "server starting…", then connect — no hardcoded-capacity error | |

## Operational notes
- **Switch procedure:** ensure the outgoing provider has no active rooms → flip the selector → if the outgoing server is still up, the danger strip's Stop finishes the job. Room housekeeping for the *inactive* provider is dormant — lingering rooms of that provider wait until you switch back (or close them manually).
- Deprecated: `join-openvidu-call` (route commented in `app.routes.ts`; component kept for rollback).
