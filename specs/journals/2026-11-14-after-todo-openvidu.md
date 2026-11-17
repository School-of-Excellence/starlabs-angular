# 2026-11-14 — OpenVidu: after-todo (parked follow-ups)

**Status:** PARKED by operator — to pick up later. Nothing below is implemented.
**Context:** prod "Server Failed to start" diagnosis (2026-11-13). The 5-minute OCI controller
(`CheckOciNodeStatus`, starlabs-cloud-function `functions/components/OCI_endpoint.js`) stopped the
OCI server at the exact minute meetings were due (Tue 10 11:00, Thu 12 15:00 and 17:30 IST).

**Done now (separate change, branch `fix/oci-controller-memory` in starlabs-cloud-function):**
1. `createOciRoomForMeeting` reads only the participant + host profiles (`getAll`) instead of the
   whole `profile_data` collection.
2. `CheckOciNodeStatus` memory 256 → 512 MiB.
Those stop the crash. The two items below stop *any future* failure from shutting the server down.

---

## TODO 3 — Keep the server on for the whole meeting window (= decision D3)

> **Operator, 2026-11-14:** leave the server schedule as it works today. Do NOT bring this into
> the decisions or the build plan until the operator says so.

**Problem.** The controller keeps the server up only for meetings with `starttime > now`
(next 15 min). At 15:00:03 a 15:00 meeting no longer qualifies. If the pre-created room was not
counted (crash, missing `mediaProvider`), the tick sees "0 rooms, 0 upcoming" and stops the server
at meeting start.

**Example.** Meeting 15:00 → server started 14:45 → pre-create failed 14:55 → 15:00 tick: not
"upcoming", 0 rooms → SOFTSTOP. User opened the call 15:04 → "Server Failed to start".

**Fix.** In `CheckOciNodeStatus`, the meetings query covers a window instead of "upcoming":
`starttime` from **now − 60 min** to **now + 25 min** (cancelled == false, attended == false,
platform == openvidu). Any meeting in that window keeps the server running. The +25 also starts
the server earlier (boot ≈ 10 min; 15 min was too tight — pre-create at :50 always hit
"LiveKit not ready").

**Why −60.** Covers a full onboarding/coach call even if nobody has joined yet or the room record
was lost. Tune to the longest appointment type if needed (or use `endtime` + grace instead).

**Where.** `OCI_endpoint.js` → `CheckOciNodeStatus` step 2 (meetings query) — the same query feeds
"start master" and "pre-create"; pre-create should still only target meetings not yet started
(or not yet `livekitRoomPreCreated`). Mirror in `AWS_endpoint.js` `CheckMasternodeStatus` if AWS is
re-activated.

**Test.** `starlabs-test`: book a test appointment 30 min out with nobody joining → server starts
~25 min before, stays up past start time, stops ~60 min after start.

---

## TODO 4 — Write the room record first, then create the LiveKit room

**Problem.** `createOciRoomForMeeting` creates the LiveKit room (STEP 2) and only then writes
`openviduroom/{meetingId}` with `mediaProvider: 'oci'` (STEP 3). A crash between the two leaves a
live room the controller cannot see (it counts only `active == true && mediaProvider == 'oci'`).

**Fix.** Swap the order: write/reactivate the `openviduroom` doc (active, `mediaProvider: 'oci'`,
title) first, then create the LiveKit room, then mark `appointments/{id}.livekitRoomPreCreated`.
A crash after step 1 leaves a counted room → the server stays up; the LiveKit room is recreated on
the first token call anyway (`createOpenViduToken` → `prepareRoom`).

**Where.** `OCI_endpoint.js` → `createOciRoomForMeeting` (STEP 2 ↔ STEP 3). Same in
`AWS_endpoint.js` if AWS is re-activated.

**Test.** Force an error after the doc write (dev only) → next tick still counts 1 room, no stop.

---

## TODO D4 — Raise the media-server limit (5 → e.g. 10)

**Today.** `MAX_MEDIA_NODES = 5` (`OCI_endpoint.js`), one call per server → at most **5 calls at
once** on OCI. Fri 06 Nov reached 5 at 17:05; 36 capacity rejections that day.

**What raising it does.** More calls at once. **No extra cost when idle**: servers are added only as
calls start and all stop when idle, so the limit is just a ceiling. Each new server still needs
~10 min to boot, so it does not remove the wait for the next call.

**Before changing.** ⚠️ `scripts/oci/README.md` (2026-08-17) records a limit of **13 E5 OCPUs** (master 2 + 3 per media server): effective prod ceiling **2 calls** with dev running, 3 without, so today's real limit is below 5. Check the Oracle tenancy quota for `VM.Standard.E5.Flex` cores in
`ap-mumbai-1` (OCI console → Limits, Quotas and Usage). Raising past the quota means scale-ups
silently fail.

**Where.** `OCI_endpoint.js` `MAX_MEDIA_NODES`; the Terraform pool `maxSize` if it caps it too.

---

## TODO D5 — Keep one spare media server on during working hours

**Problem.** Every new call that needs a fresh server waits ~10 min for it to boot.

**Idea.** During working hours (e.g. 10:00–19:00 IST) keep **one more server than active calls**
running, so the next call starts at once. Outside those hours keep today's scale-to-zero.

**Cost.** One media server (3 OCPU, 8 GB, E5) ≈ **₹10.13/hour** (Oracle India list price, 2026-11-14: ₹2.86635 per OCPU-hour, ₹0.19109 per GB-hour) → 9 h × 22 days ≈ **₹2,000/month**.

**Where.** `CheckOciNodeStatus` step 5 (pool right-sizing): `target = activeRooms + 1` inside the
working-hours window, plus "don't stop the master" inside that window. Interacts with TODO 3 (D3).

---

## Related open items (not parked here — see the fix plan)
- Rooms created by the join screens without `mediaProvider` (`createOpenViduRoom`) + wake-on-join.
- "Server Failed to start" message → "Starting the video server…".
- mute / kick / end-room on OCI.
- Capacity gate counts ordered nodes, not ready nodes.
Plan draft: `~/.claude/plans/2026-11-13-openvidu-call-fixes.md`.
