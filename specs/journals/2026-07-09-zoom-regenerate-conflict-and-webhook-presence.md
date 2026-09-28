# 2026-07-09 — Zoom studio: "other meeting in progress" on regenerate + webhook-driven presence

**Session type:** investigation + one deployed mitigation. Discussion/analysis for the presence redesign (no code written for that part).
**Related:** [2026-07-08-zoom-clientview-full-flow.md](2026-07-08-zoom-clientview-full-flow.md) (full flow), [2026-07-09-zoom-signature-lifetime-fix.md](../plans/2026-07-09-zoom-signature-lifetime-fix.md) (token plan).

---

## Change shipped this session (⚠️ uncommitted working-tree edit)

**File:** `~/Projects/Functions/starlabs-cloud-function/functions/components/service.js`, `generateSignature`.
**Edit:** `const exp = iat + 60 * 60 * 2` → `60 * 60 * 12` (SDK join-token lifetime **2h → 12h**).
**Deployed to:** `starlabs-test` (display name "starlabs-test-19", project id `starlabs-test`) via
`firebase deploy --only functions:studioZoomLink,functions:studioZoomLinkRegenerate --project starlabs-test`.
**Why explicit `--project`:** the firebase CLI's *active* project was `fir-sample-aae4a` (**production**) — a bare deploy would have hit prod. Deploy log confirmed `Deploying to 'starlabs-test'`, `Production Mode: false`.
**Scope:** only the two studio functions were redeployed. The **appointment** and **big** Zoom flows share `generateSignature` but were NOT redeployed, so they still carry the old 2h token until their functions are deployed.
**Revert:** set the constant back to `60 * 60 * 2` and redeploy the same two functions. Not committed to git (operator: no auto-commit).

Purpose: immediate relief for the passive "meeting time over" mid-call boot (token expired mid-session). Doubles as a diagnostic for the reload-kill (see prior journal). Does NOT address the regenerate conflict below.

---

## The problem the operator reported — 3 scenarios

Entities: **one participant**, **one-or-many specialists**. Specialists join **as the host on the same shared Zoom account** (`host_email`); the participant joins as a non-host.

- **Scenario 1:** specialist joins (before participant) → meeting M1 is live on account X. Specialist **Leaves** or closes the tab (NOT "End for all") → M1 stays alive. Specialist clicks **regenerate** → new meeting **M2 on the same account X** → clicks Start → *"you have another meeting in progress."* Participant is orphaned on M1's old link.
- **Scenario 2:** two specialists + participant in M1. One specialist Leaves → regenerates → M2 on account X. M1 is still alive (other specialist + participant present) → account X busy → M2 can't start.
- Both are the **same bug**.

## Root cause (one rule)

> **A licensed Zoom account can host only ONE live meeting at a time.**

Regenerate **spawns a brand-new meeting on an account whose previous meeting was never ended** ([queuesystem.js:1466](../../../Functions/starlabs-cloud-function/functions/components/queuesystem.js) reuses the same `host_email` when the account's only live assignment is this studio). The old instant meeting (`type:1`, `join_before_host:true`) stays alive after a plain Leave, so account X is double-booked → conflict.

### Why Leave vs End-for-all vs host-reassignment is the trigger
- **Leave** (`leaveMeeting`) — only that person exits; **M1 keeps running**; account stays busy.
- **End for all** (`endMeeting`) — M1 terminates → `meeting.ended` webhook → account freed → regenerate would work.
- **Host reassignment on leave** — Zoom hands host to a remaining person (other specialist, or the participant). Keeps M1 alive AND moves the "host" identity, which confuses any presence/seat logic keyed on "who is host".

The current manual escape ("close studio → release license → reassign") works only because closing the studio flips status and lets the `meeting.ended`/`inuse` cleanup free the account.

---

## Fix direction for scenarios 1 & 2 (best first)

1. **Rejoin, don't regenerate.** The meeting is almost always fine; the person just needs back in. Send them into the **same meeting** with a **fresh token** (the mint-at-join fix). No new meeting → no one-host-one-meeting conflict. Eliminates ~all legitimate regenerate clicks.
2. **If a true regenerate is needed, end the old meeting first** — `PUT https://api.zoom.us/v2/meetings/{oldId}/status {action:"end"}` before creating M2, freeing account X. Also removes the manual "close studio to release license" step.
3. **Gate the Start button on webhook truth, not client stamps** — only enable Start once Zoom confirms the old meeting actually ended.

---

## The presence-fields problem + webhook solution

### Today (unreliable — browser-stamped)
`specialistJoinedAt`, `specialistLeftAt`, `participantInCallAt`, `participantReadyAt`, `participantLeftAt` are written by the **client** ([zoom-clientview.component.ts](../../queue system/zoom-clientview/zoom-clientview.component.ts)). Fails because the browser:
- can't stamp "left" on crash / sleep / network drop / force-close (pagehide doesn't fire),
- races the leaveUrl redirect (write often lost),
- can't distinguish "left for good" from "reloading" or "host reassigned",
- collapses many specialists into a single `specialistJoinedAt` (lossy when specialists can be many).

### Zoom webhook = server-side ground truth
`zoomActivitylog` ([queuesystem.js:2446](../../../Functions/starlabs-cloud-function/functions/components/queuesystem.js)) currently branches only on `meeting.created` / `meeting.ended` / `recording.completed` / `recording.transcript_completed`. It does **not** listen to participant join/leave. Zoom also fires:
- `meeting.participant_joined` (with `join_time`, identity),
- `meeting.participant_left` (with `leave_time`, `leave_reason`),
- `meeting.ended` (everyone gone).

These are correct across Leave / End-for-all / host-reassignment — exactly the cases that break the client stamps. Every payload is already logged to the `zoom activitylog` collection, so enabling the events also gives an audit trail / backfill source.

### The enabler: `customer_key`
The webhook participant object echoes back `customer_key` — a value we set at join. **Currently only the participant sets it** (`customerKey = profileid`, [zoom-clientview.component.ts:1241](../../queue system/zoom-clientview/zoom-clientview.component.ts)); **specialists set none** (they set an empty `zak` instead, [:1239](../../queue system/zoom-clientview/zoom-clientview.component.ts)) and all share `host_email`, distinguishable only by display name (fragile).

**Unlock:** set `customerKey = profileid` for **everyone** (specialists too). Then every join/leave event carries the person's profile id → exact server-side mapping.

### Field → webhook mapping (keyed by `customer_key = profileid`)
| Field today (client) | Derive from webhook |
|---|---|
| `participantInCallAt` | `participant_joined`, customer_key = participant's profileid |
| `participantLeftAt` | `participant_left` for that profileid (or `meeting.ended`) |
| `specialistJoinedAt` | `participant_joined`, customer_key ∈ pairing (specialist ids) |
| `specialistLeftAt` | `participant_left` for that specialist id |
| `participantReadyAt` | **keep client-side** — pre-Zoom "arrived at wait screen" state Zoom can't see |

Because specialists can be many, model specialist presence as a **map keyed by profileid** (`{ [profileid]: { joinedAt, leftAt } }`) instead of one flat timestamp — also fixes the multi-specialist loss.

### Caveats
1. **Enable the events** in the Zoom Marketplace app's webhook subscription (code alone isn't enough).
2. **Latency** — events land a few seconds late. Fine for Start-gating; for the participant "specialist joined, release gate" moment keep a fast optimistic client signal and let the webhook be the authoritative correction.
3. **Reload blips** — a reload = `left` then `joined` seconds apart; **debounce** so it doesn't flash "left".
4. **`participantReadyAt` stays client-side.**
5. **Match event → studio** via `payload.object.id` → `live assignment` where `zoomdata.id ==` that id (same lookup recording.completed already uses).

---

## Bottom line
- Scenarios 1 & 2 = one bug: regenerate spawns a new meeting on a host account whose old meeting is still alive → "one host, one meeting" conflict. Fix: **rejoin instead of regenerate**; if regenerating, **end the old meeting first**.
- The 5 presence fields are unreliable because the **browser** stamps them. Move 4 to **webhook-driven server-side truth**; keep `participantReadyAt` client-side.
- The enabler is **`customer_key = profileid` for every joiner**, turning `meeting.participant_joined/left` into an exact, crash-proof presence source and letting the Start button gate on reality.

## Implementation shipped this session (webhook-presence phase 1)

### A. Cloud function — `zoomActivitylog` (deployed to `starlabs-test`)
File: `~/Projects/Functions/starlabs-cloud-function/functions/components/queuesystem.js`.
- New collection **`live assignment log`** — one doc per call, id = `liveassignmentid`, written in place with `.set(..., {merge:true})` (created lazily on the first webhook write; does NOT exist until events fire).
- Added handlers: `meeting.started` → `meetingStartedAt`; `meeting.ended` (augmented) → `meetingEndedAt` + `durationSeconds` (`end_time − start_time`); `meeting.participant_joined`/`participant_left` → presence.
- Presence keyed by `customer_key` (= profile id) via helper `classifyZoomAttendee`: participant → `participantInCallAt`/`participantLeftAt`; specialist → `specialists.{profileid}.{joinedAt,leftAt,name}` (a map, so many specialists tracked). Unidentified hosts fall back to `specialists.uid_<zoomUserId>` with `role:'unknown'` until the screen change below lands.
- Helper `getLiveAssignmentByMeeting(meetingId)` maps meeting → live assignment via `zoomdata.id` (same lookup recording.completed uses; no new index).
- Raw events still appended to `zoom activitylog` (audit untouched).
- **Deployed:** `firebase deploy --only functions:zoomActivitylog --project starlabs-test` → Successful update, us-central1. Not committed.
- **Revert:** remove the three new `if` blocks + the two helper functions from `zoomActivitylog`, redeploy the function.

### B. Screen — `zoom-clientview.component.ts` (edited, NOT yet deployed)
- [zoom-clientview.component.ts:1241](../../queue system/zoom-clientview/zoom-clientview.component.ts) — now sets `zoomConfig["customerKey"] = this.profileid` for **every** joiner (was participant-only); `zak` still added for hosts.
- Effect: specialists now carry `customer_key` in the webhook, so they map to `role:'specialist'` instead of the `uid_` fallback.
- **Takes effect only after the Angular app is rebuilt + deployed to test** (client-side change).
- **Revert (per-screen):** restore the original `if (this.profileHost) { zak } else { customerKey }` block:
  ```ts
  if (this.profileHost) {
    zoomConfig["zak"] = this.zoomdata['zak'];
  } else {
    zoomConfig["customerKey"] = this.profileid;
  }
  ```

### Operator to-do to light up the loop
1. Enable in the Zoom app (webhook owner): `meeting.participant_joined`, `meeting.participant_left`, `meeting.started` (+ `meeting.ended` if not already).
2. Deploy the Angular change to test.
3. Run a test call → verify `live assignment log/{liveassignmentid}` populates with specialists keyed by profile id.

## Pending / next
- Decide whether to implement webhook presence (needs: enable Zoom events, set customerKey for all, add participant_joined/left handling to `zoomActivitylog`, presence map on the doc, debounce, Start-button gating).
- Regenerate should end the old meeting before creating a new one.
- Roll the 12h token (or mint-at-join) to appointment + big Zoom flows if desired.
- Watch a reload on test now that 12h is live — tells us if the reload-kill was token-expiry or re-join mechanics.
