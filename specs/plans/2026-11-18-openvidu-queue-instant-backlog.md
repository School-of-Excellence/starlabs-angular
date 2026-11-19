# Backlog — OpenVidu for queue sessions and instant meetings

**Status: BACKLOG, not an approved plan.** Nothing here is agreed or scheduled. Recorded at the
operator's request on 2026-11-18 so the gaps are not re-discovered. Do not implement any item
without explicit sign-off.

**Scope decision (operator, 2026-11-18):** the **appointment** flow is considered done and stays
as it is. The 2026-11-14 fixes closed its four causes and it runs smoothly. The one shared item
worth cracking for every flow is **media-node start time**. Queue and instant were built on the
appointment system's assumptions and were never designed for; this file is that debt.

Read first: `specs/journals/2026-11-17-openvidu-change-audit.md` (Appendix A = boot time,
Appendix C = scope + per-type stop behaviour) and `specs/plans/2026-11-14-openvidu-call-fixes.md`.

---

## Where the time actually goes (measured from the code, 2026-11-18)

| Flow | `START` issued | Floor to joinable | Why |
|---|---|---|---|
| Scheduled appointment | T-15…T-5 min, by the cron | usually 0 (pre-warmed) | step 2 pre-create window |
| **Instant (private)** | **~1 s after the click** — the app calls `startOciMaster` itself | **~8–10 min** | media-node readiness |
| **Queue (live assignment)** | **0–5 min after the click** — nothing calls `startOciMaster`; it waits for the next cron tick | **~8–15 min** | cron delay + media-node readiness |

So the honest numbers are **8–10 min for instant** and **8–15 min for queue**. The extra 0–5 min
on queue is pure dead time: `startOciMasterHTTP` already exists and already answers `400`
harmlessly when the master is up.

### The 8 minutes is a guess, not a measurement

`OCI_endpoint.js:68`

```js
const MEDIA_NODE_READY_AFTER_MS = 8 * 60 * 1000;
```

`isMediaNodeReady()` returns false until the pool instance has existed for 8 minutes, because
**OpenVidu 3 has no media-node readiness API**. The constant carries its own TODO: "TUNE after
measuring a few boots in Grafana; Option B (boot-script callback) if this is not enough."

Consequence: if cloud-init actually finishes in 5 minutes, **we still wait 8**. Part of today's
delay is the heuristic, not the boot. That makes this two separate pieces of work — make the boot
faster, and stop guessing when it finished — and they pay off independently.

---

## Q — Queue sessions

### Q1. Keep the master always running (operator's stated direction)

Intent: a queue call should find the master up, so the only remaining wait is the media node.

**Blocker found 2026-11-18 — the master and the pool are not independent.** `stopOciMaster()` does
`setPoolSize(0)` *then* `SOFTSTOP`, and step 7 of the controller is explicitly one-way:

> "Compared against a FRESH pool size and never lowered here … **Scale-down only happens via
> stop-to-zero.**"

So "never stop the master" as the code stands also means "never drain the pool" — master (2 OCPU)
plus every node that was ever ordered (3 OCPU each) stay billed forever. Against the 13-OCPU
tenancy limit with dev using 5, that leaves no headroom.

Getting "master on, nodes drained" needs a **new scale-down path** that lowers the pool on idle
without touching the master. That is the real work item here, not a config flag.

Open question for the operator: always-on, or on a schedule (e.g. up 08:00–22:00 IST)? A schedule
keeps the night savings the blueprint cites (~$2–3/night) and covers every working-hours call.

### Q2. Wake the server on the Start Meeting click

`joinOpenViduRoom()` ([dynamic-studio-v2.component.ts:5054](../../src/app/queue%20system/dynamic-studio-v2/dynamic-studio-v2.component.ts), and v1 `:2592`) creates the room and opens
`/joinroom` — it calls no start function. Today the server is started only by the cron noticing the
room (`findRoomsWaitingForServer`). Adding `infraService.startOciMaster()` after the room write, as
the instant path already does, removes the 0–5 min cron delay.

Worth doing **even if Q1 lands**, as the belt-and-braces path for a master that is down anyway.

### Q3. Queue sessions can never pre-warm

The cron's pre-create and stop-to-zero gate query the `appointments` collection only
(`OCI_endpoint.js:712`). A queue session has no appointment doc, so it is invisible there: it can
never pre-warm, and it never counts as "something upcoming" in the stop decision. Only wake-on-join
covers it. Pre-warming from the live-queue doc (a specialist is paired, a participant is next up)
would make queue calls behave like appointments — needs a second query and a definition of
"imminent" for a queue.

### Q4. Gap M1 — the reactivate lines do not stamp `mediaProvider`

Four live `updateDoc(roomDoc, {active: true})` calls reactivate an existing room without stamping
the cloud: `appointment-studio:691`, `list-openvidu-room:164`, `dynamic-studio-v2:5095`,
`dynamic-studio:2627`. A room created before the stamp shipped, then reactivated, is still unmarked.
Mitigated twice over (wake-on-join treats a missing field as OCI and backfills it), so this is
tidiness, not an outage — but it is the last place the old bug can still originate.

---

## I — Instant meetings

### I1. The manual trigger works; the wait is the media node

Confirmed 2026-11-18: `createNewRoom()` reads the active provider, stamps the room, navigates, then
calls `startOciMaster()` in the background — deliberately after the navigation, because awaiting it
(10+ s cold start plus the Oracle call) looked like the click had done nothing (test 2026-11-15).
A `400` is treated as success ("already running").

Nothing is wrong with this path. It issues `START` within a second, and then waits for the same
media node as everyone else. **Instant meetings cannot be improved except by making the media node
faster** — which is why this item and Q1 both collapse into the shared item below.

### I2. It orders exactly one node

`startOciMaster(clients, 1)` from the app. Fine for one creator, but two people creating instant
rooms within 8 minutes of each other both land on the one-node pool; the second gets
`503 SCALING_IN_PROGRESS` and waits another full boot. Acceptable today at the 2-call ceiling.

---

## S — Shared: the media instance (the item the operator wants cracked)

### S1. Bake a custom OCI image for the media node — biggest win

Media nodes are **terminated** by `setPoolSize(0)` and **rebuilt from scratch** by `setPoolSize(n)`;
every new instance runs cloud-init from zero (apt update/install → docker pull → cluster join). That
is the 5–8 min. Baking a configured image and pointing the pool at it should bring it to **~1–2 min**
and removes the first-boot apt-lists lock race that produced a **bare** node on 2026-07-16.

This single item improves appointments, queue and instant at once.

### S2. Replace the 8-minute guess with a real readiness signal

Plan 3.1 Option B: a boot-script callback from the node to a function that marks it ready. Does not
make the boot faster — it stops us waiting past the point where it finished. Pairs with S1: after
S1 a node may be ready in 90 s while `isMediaNodeReady` still says no for 8 minutes.

### S3. ⚠️ `MAX_MEDIA_NODES = 5` exceeds the real quota

`scripts/oci/README.md`: tenancy limit **13 E5 OCPUs** in ap-mumbai-1; master 2, media 3 each; dev
running = 5. Prod master + 1 media = 10/13, a second media node lands exactly on 13, **a third
fails to launch**. Documented effective ceiling: **2 concurrent calls**. `mediaNodesNeeded()` will
order 3–5 nodes when meetings bunch up, and Oracle will refuse them. Flagged as a watch-out in the
2026-11-14 plan; shipped without the cap.

### S4. Host controls still cross three continents

`muteParticipant`, `kickParticipant`, `openViduCloseRoom` are deployed in **us-central1** while the
cluster is **ap-mumbai-1** and users are in India. The warm-up ping fixed the cold start, not the
geography. `CheckOciNodeStatus` already runs in `asia-south1`. Moving these three is a redeploy, and
it probably does more for perceived speed than the warm-up did.

---

## Suggested order, if this is ever picked up

1. **S1** (custom image) — the one that changes the user-visible number for all three flows.
2. **S2** (readiness callback) — unlocks S1's gain instead of sitting on it for 8 minutes.
3. **Q2** (wake on the queue click) — small, removes 0–5 min, no architecture change.
4. **S3** (cap the node count) — correctness against the quota.
5. **Q1** (master always on / scheduled) — needs the pool-drain work designed first.
6. **S4** (region move), **Q4** (M1 stamp), **Q3** (queue pre-warm) — cleanups.
