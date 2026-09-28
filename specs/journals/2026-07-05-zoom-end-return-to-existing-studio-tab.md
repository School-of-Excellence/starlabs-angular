# Zoom meeting end → return to existing Studio tab (2026-07-05)

**Goal:** When the host ends the meeting, don't open a NEW Dynamic Studio screen — go back to the
already-open Studio page.

## Flow before

- Host launches the meeting from `dynamic-studio-v2` via `window.open('/openmeeting/:id/queue', '_blank')`
  (`dynamic-studio-v2.component.ts:4354`). The Studio tab stays open and is the Zoom tab's `window.opener`.
- On leave, the Zoom SDK's `leaveUrl` (`zoom-clientview.component.ts` ~804) loads a **fresh**
  `${origin}/dynamicstudio` in the Zoom tab → the original Studio is still open AND a duplicate appears.

## Change

`zoom-clientview.component.ts`
- New `returnToStudioTab()`, called from the HOST branch of the existing `onMeetingStatus` status-3
  (disconnected) handler in `wireMeetingEndListener` — this fires BEFORE Zoom's leaveUrl redirect.
- It: (a) bails if there's no live `window.opener` (deep-linked directly → keep the leaveUrl fallback);
  (b) posts `{type:'focus-studio'}` on the `starlabs-dynamic-studio` BroadcastChannel (same channel
  Prescribe ATC uses); (c) `opener.focus()`; (d) after ~300ms `window.close()`. Closing an
  opener-spawned tab returns the browser to the opener, so the host lands on their EXISTING Studio.
  The 300ms delay lets the leave-stamp `updateDoc` reach Firestore's multi-tab IndexedDB queue (shared
  with the Studio tab, so it still syncs even though this tab closes) and lets the ping deliver.

`dynamic-studio-v2.component.ts`
- `wireStudioChannel` now handles `{type:'focus-studio'}`: ACK `studio-here` + best-effort `window.focus()`.

leaveUrl left unchanged as the fallback (no opener / `window.close()` blocked → current behavior).

## Verify

Type-checks clean. NOT runtime-verified — host-only, needs a live Zoom meeting + the Studio tab open
(auth/SDK gated; Chromium preview can't reach it). Test live: host opens meeting from Studio → ends
call → Zoom tab should close and focus return to the original Studio tab (no second /dynamicstudio).
Check the leave stamp still lands (arena flips to "Call ended") since the tab now closes rather than
redirects.

## Verification done (2026-07-05)

- BroadcastChannel `focus-studio ↔ studio-here` contract proven in a real browser (preview eval): the
  Studio side receives the ping, ACKs, and `window.focus()` is callable. The novel wiring is correct.
- Launch mechanism confirmed to set `window.opener` (`dynamic-studio-v2.component.ts:4354` uses
  `window.open(url,'_blank')`, no `noopener`).
- Both files type-check clean.
- Could NOT drive the full two-tab open→close→return in headless preview (automated `window.open` is
  popup-blocked; `preview_click` didn't fire handlers on raw static pages). And the live Zoom
  end-call trigger (`onMeetingStatus` status-3) needs an authenticated live meeting — inherently a
  user-side check. **Still PENDING live verification.**

## Hardening + commit

- Hardened `returnToStudioTab(leaveWrite?)`: instead of a blind 300ms delay, it now closes on
  `Promise.race([leaveWrite, 700ms cap])` — closes right after the leave-stamp write settles
  (server-ack when online → stamp durable), else caps at 700ms (multi-tab IndexedDB backstop). The
  host branch passes its `updateDoc(...)` promise in.
- Committed the core (`zoom-clientview.component.ts`) as **aefe6ab** on `dynamic-studio-update`.
  The Studio-side `focus-studio` handler is left UNCOMMITTED because `dynamic-studio-v2.component.ts`
  is entangled with the operator's pre-existing WIP — do not bundle. Feature still works without it
  (window.close returns to opener regardless); commit the handler alongside the operator's own split.

### Screen — Zoom ClientView · end-call returns to Studio tab · PENDING LIVE VERIFY 2026-07-05
- **Files:** `zoom-clientview.component.ts` (`returnToStudioTab()` + its call in the status-3 host
  branch); `dynamic-studio-v2.component.ts` (`focus-studio` handler in `wireStudioChannel`).
- **Revert:** delete `returnToStudioTab()` + its call, and the `focus-studio` branch. leaveUrl untouched.
- **Risk:** low-moderate. Main risk = leave stamp dropped if `window.close()` beats the IndexedDB
  flush; mitigated by the 300ms delay + shared multi-tab persistence. If stamps go missing, increase
  the delay or move the close into the updateDoc `.then()`.
