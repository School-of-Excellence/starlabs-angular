# Fix Plan — Zoom "meeting time has ended" (signature lifetime bug)

**Date:** 2026-07-09
**Status:** DRAFT — awaiting operator approval
**Related journal:** [2026-07-08-zoom-clientview-full-flow.md](../journals/2026-07-08-zoom-clientview-full-flow.md)

## Problem (recap)

The Zoom SDK join token (`hostsignature`/`participantsignature`) is minted **once, at link-generation time** by the `onDocumentCreated` trigger `studioZoomLink`, with a **fixed 2-hour** `exp`/`tokenExp`, and frozen onto the `live assignment` doc.

- **Booted mid-call** — token clock starts at link creation, not join, so a call that starts late (or runs long) hits `tokenExp` mid-session → Zoom "meeting time over".
- **Reload → "meeting time has ended"** — reload re-joins with the *stored* (possibly expired) token. Worse, the update snackbar fires `RELOAD_ALL_TABS`, reloading the live-call tab too.
- **Regenerate doesn't help** — it reuses the same busy Zoom account; the old `type:1` instant meeting is a zombie (kept alive by `join_before_host`). One host = one meeting, so recovery needs a manual studio-close to free the seat.

**Evidence:** [service.js:319](../../../Functions/starlabs-cloud-function/functions/components/service.js) (`exp = iat + 60*60*2`), [queuesystem.js:825/995/1016](../../../Functions/starlabs-cloud-function/functions/components/queuesystem.js), [zoom-clientview.component.ts:1099](../../queue system/zoom-clientview/zoom-clientview.component.ts), [app.component.ts:345](../../app.component.ts), regenerate reuse [queuesystem.js:1466](../../../Functions/starlabs-cloud-function/functions/components/queuesystem.js).

## Goal

Neither symptom occurs in a realistic session, and recovery (regenerate) works without manually closing the studio.

---

## Phased fix

Two repos change: **cloud functions** (`~/Projects/Functions/starlabs-cloud-function`) and **Angular app**. Ship in order; each phase stands alone.

### Phase 1 — Immediate mitigation (1 line, lowest risk) ⚡

Raise the token lifetime so it can't expire within a realistic call or same-day reload.

- **File:** `functions/components/service.js`, `generateSignature` ([service.js:319](../../../Functions/starlabs-cloud-function/functions/components/service.js)).
- **Change:** `exp = iat + 60*60*2` → `iat + 60*60*24` (24h). Zoom Meeting SDK allows `tokenExp` up to 48h, so 24h is safe.
- **Effect:** kills symptoms #1 and #2 for any call/reload within 24h of link generation — covers ~100% of real sessions.
- **Caveat:** still frozen-at-create; a link left open >24h before use would still fail. Phase 2 removes that entirely.
- **Deploy:** only `studioZoomLink` + `studioZoomLinkRegenerate` (both call `generateSignature`). No frontend change. **This is the "solve immediately" step.**

### Phase 2 — Proper fix: mint the token at JOIN time (not at doc-create)

Make the signature fresh every time someone actually joins/reloads, so its clock always starts at join.

1. **New callable cloud function** `getZoomJoinSignature` (add to `queuesystem.js`, export in `index.js`):
   - Input: `liveassignmentId`, and `collectiontype` (`queue`/`appointment`).
   - Auth-gated (`onCall`, verify `context.auth`). Resolve the caller's profile → decide host vs participant from `zoomdata.pairing`/`hosts` **server-side** (don't trust a client-sent role).
   - Read the doc's current `zoomdata.id`, mint a fresh signature (role from the check above), return `{ signature, sdkKey, meetingNumber, password }`.
   - Secrets: `ZOOM_SDK_CLIENTID/CLIENTSECRET` only (no OAuth needed — no meeting creation here).
2. **Frontend** ([zoom-clientview.component.ts](../../queue system/zoom-clientview/zoom-clientview.component.ts) `startmeeting`):
   - Replace reading `this.zoomdata['hostsignature']`/`participantsignature` ([:1099](../../queue system/zoom-clientview/zoom-clientview.component.ts)) with a call to `getZoomJoinSignature` right before `ZoomMtg.join`.
   - App already uses `httpsCallable` widely (e.g. `authguard.service.ts`), so infra + pattern exist.
3. **Cleanup:** `studioZoomLink`/regenerate can stop writing `hostsignature`/`participantsignature` (or keep as harmless fallback for one release, then drop). Keep Phase-1's longer exp as belt-and-braces.
- **Effect:** token clock always starts at join; reload re-mints; no stale-token rejoin. Both symptoms structurally impossible.

### Phase 3 — Recovery + reload robustness

1. **Regenerate should end the zombie, not reuse a busy seat.** In `studioZoomLinkRegenerate` ([queuesystem.js:1466](../../../Functions/starlabs-cloud-function/functions/components/queuesystem.js)), before creating the new meeting, **end the old Zoom meeting** via `PUT https://api.zoom.us/v2/meetings/{oldId}/status {action:"end"}` (S2S OAuth token already minted there). Then either reuse the now-freed account or grab a fresh one. Removes the manual "close studio to release license" step.
2. **Don't let the app-update reload nuke a live call.** In `handleUpdate()` ([app.component.ts:341](../../app.component.ts)) / the `RELOAD_ALL_TABS` handler ([:345](../../app.component.ts)): skip the auto-reload when the current route is `/openmeeting/**` (defer until the call ends). With Phase 2 a reload is survivable, but reloading mid-call is still disruptive (full rejoin) — better to suppress it during an active meeting.

---

## Out of scope (note, don't fix here)
- The empty `zak` host key (pre-existing; host join works via `join_before_host`). Fresh-signature rejoin in Phase 2 makes it moot for these symptoms.
- Appointment (`appointmentZoomIntegraion.js`) and `big` Zoom flows — same `generateSignature` helper, so Phase 1 benefits them for free, but their join paths aren't retrofitted here.

## Testing / verification
- **Phase 1:** decode the stored `hostsignature` at jwt.io → confirm `exp` ≈ create-time + 24h. Repro attempt: open a studio, wait past the old 2h mark, join/reload → no boot.
- **Phase 2:** join, note token `iat` = ~join time (not doc-create). Reload mid-call → rejoins cleanly. Simulate a >2h call (or temporarily short exp) → confirm no mid-call boot with re-mint.
- **Phase 3:** regenerate mid-zombie → new call works **without** closing the studio; confirm old meeting shows ended in `zoom activitylog`. Trigger an app update while on `/openmeeting` → call tab is NOT force-reloaded.
- Test on **`starlabs-test` only** — never production Zoom accounts/data (per CLAUDE.md).

## Rollout
Phase 1 today (instant relief) → Phase 2 next (real fix) → Phase 3 (polish). Each is independently deployable and revertible.

## Recommendation
Do **Phase 1 now** for immediate relief, then schedule Phase 2 as the durable fix. Phase 3 is quality-of-life but removes your current manual workaround.
