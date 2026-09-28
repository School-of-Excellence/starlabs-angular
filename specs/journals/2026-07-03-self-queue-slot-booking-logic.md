# Journal — Self-service Queue Slot Booking ("Scope Enhancement") logic

**Date:** 2026-07-03
**Repo:** `breakthroughs-flutter` @ `development` (HEAD `d2a8659`)
**Purpose:** Document the end-to-end logic of the home-screen `checkScopeEnhancement()` flow — specifically **type #2** (participant *not* in `queue_token`) — so it can be re-implemented in another project (e.g. the Angular StarLabs app).

---

## TL;DR

On the home screen, `checkScopeEnhancement()` decides whether to show a participant a **"Book your slot"** card. There are two participant types against a given queue event:

1. **Already in `queue_token`** — a token doc already exists for `(queueref, profile_id)`. → **Do nothing.** They're already tracked/booked, so no card is shown.
2. **NOT in `queue_token`** (`token.docs.isEmpty`) — the participant is *eligible but unbooked*. → Resolve their **segment**, pull that segment's **slots**, show them the available slots. When they **select a slot and confirm**, their **product is initiated** (`status: "initiated"`) and the slot's `usedslot` counter is atomically incremented.

This journal is about **path #2**.

---

## Where it lives

| Concern | File |
|---|---|
| Eligibility + segment/slot resolution | `lib/Main Screen/homeContent.dart` → `checkScopeEnhancement()` (~line 764) |
| Failure logging | `homeContent.dart` → `saveQueuePlanningErrorLog()` (~line 1022) |
| Card UI + slot selection + product initiation | `lib/Widgets/requestScopeEnhancement.dart` → `RequestScopeEnhanment` |
| Card mount point | `homeContent.dart` ~line 7896 (`participantQueuePlanning.isEmpty ? SizedBox() : RequestScopeEnhanment(...)`) |

`checkScopeEnhancement()` is called on `initState`/load (line 303) and again after a booking resets state (line 7807).

---

## Firestore collections involved

- `products` — filter `checkforqueue == true`. The "self-bookable" product (Evolution Prep).
- `participantsproduct` — the participant's purchased instances of that product. Has `status` (`null` = unconsumed, `initiated`/`ongoing` = active, `completed`/`shifted` = done) and `statusdate.<status>` timestamps.
- `arena events` — upcoming events; filter `type == "queue"` and `enddate >= now`, matched to the product via `productref`.
- `queue_token` — **the gate.** A doc keyed by `(queueref, profile_id)` means "this participant is already in this queue".
- `participant list` — maps `profilelist` (array of profileids) → `segmentid` (array). Gives the participant's segments.
- `queue planning` — per-queue planning doc. Shape: `planning[] → { variationid, segments[] → { segmentid, slots[] } }`. Each slot: `{ startdate, enddate, stagename, maxslot, usedslot, title?, description? }`.
- `queue generation` — the queue doc referenced when initiating the product / participation request.
- `participantsproduct` (updated), `event participation request` (created) — the write side on booking.
- `appflowbreaks` — diagnostic log written when the flow fails to produce a bookable card.

---

## Type #2 logic — step by step (`checkScopeEnhancement()`)

1. **Find the self-bookable product.** Query `products where checkforqueue == true`. Take the first. Bail (log "No product…") if none.
2. **Load the participant's instances.** Query `participantsproduct where profileid == me AND productref == product`.
3. **Skip if already active.** If any instance has `status ∈ {initiated, ongoing}` → stop (they're mid-cycle). Log and return.
4. **Require an unconsumed instance.** Filter `status == null` → `pendingProduct`. If empty → not eligible, log and return. (There's a commented-out 6-month "last completed" cooldown check that is currently disabled — worth noting if you port it.)
5. **Find an upcoming queue event.** Query `arena events where enddate >= now`, then in-memory filter `type == "queue"` and `productref.id == product.id`. Loop over the matches; `queueRef = event["eventref"]`.
6. **THE GATE — check `queue_token`.** For each candidate event:
   ```
   queue_token where queueref == queueRef AND profile_id == me
   ```
   - If a token **exists** → type #1, do nothing for this event.
   - If **empty** (`token.docs.isEmpty`) → **type #2**, proceed. ← this is the branch we care about.
7. **Subscribe to the queue's planning** (`queue planning where queueid == queueRef.id`, `.snapshots()` live listener; the previous subscription is always cancelled first to avoid leaks).
8. **Resolve the participant's segments.** Query `participant list where profilelist arrayContains me`, collect all `segmentid`s → `participantSegment`.
9. **Match segment → slots.** Walk `planning[].segments[]`; when `participantSegment.contains(segmentID)`:
   - Take `segmentData["slots"]`.
   - Sort by `startdate`.
   - Stamp each slot with `variationid`, `segmentid`, `queueplanid` (needed later for the write).
   - `firstStage = slots.first["stagename"]` — only the **first stage** is bookable at entry.
   - Compute `upcomingAvailableSlots` = slots where:
     - `startdate` is in the future, **and**
     - `stagename == firstStage`, **and**
     - `maxslot == 0` (unlimited) **or** `usedslot < maxslot` (capacity left).
   - Fetch the queue doc (`queueRef`) for display data.
   - Build `participantQueuePlanning = { arenaeventid, queueid, variationid, segmentid, slots, availableslots, productdata, participantproductdata (= pendingProduct.first), queuedata, queueplanningdata }` and `setState`.
   - Break out of the loops (first matching segment wins).
10. **On any failure to build a card**, `saveQueuePlanningErrorLog()` writes a diagnostic doc to `appflowbreaks/requestscopeenhancement - <profileid>` with the full `activityStatus` breadcrumb list. Very useful for debugging why a participant didn't see a card.

If `participantQueuePlanning` ends up non-empty, the home screen renders the `RequestScopeEnhanment` card.

---

## The card + booking (`RequestScopeEnhanment`)

Three visual states, driven by `appService.slotbooking` flags:

1. **Intro / welcome** (default): shows queue welcome message (`queuedata.queuewelcomemessage`).
   - If `availableslots` is **empty** → button reads **"Notify Me →"**; tapping writes the profileid into `queue planning/<docid>.slotinterest` (arrayUnion) and hides the card (`slotbooking.slothide = true`). This is the waitlist path.
   - If slots exist → button **"Book Now →"** sets `slotbooking.accpectedintro = true` → moves to state 2.
2. **Slot selection**: renders `availableslots` as `RadioListTile`s (or a single fixed row if only one). User picks `selectedIndex`, taps **"Confirm →"** → `onSlotSelect()`.
3. **Booked**: success message ("You're All Set…").

### `onSlotSelect()` — how "product gets initiated"

This is the payoff of type #2. On confirm:

1. `selectedSlot = availableslots[selectedIndex]`.
2. **Atomic slot capacity update** via `firestore.runTransaction` on `queue planning/<queueplanningdata.docid>`:
   - Re-read the planning doc inside the txn (avoid races).
   - Navigate to the matching `variationid` → `segmentid` → the exact slot (matched by `startdate` + `enddate` + `stagename`).
   - If `maxslot == 0` OR `usedslot < maxslot` → `usedslot += 1`, `updated = true`.
   - Else throw `"Slot Full"` (`updated = false`).
   - `transaction.update(docRef, {"planning": planningList})`.
3. **Only if `updated`**, commit a batch:
   - **Update** `participantsproduct/<participantproductdata.docid>` with:
     ```
     { eventref: queue generation/<queueid>,
       arenaeventid, status: "initiated",
       eventparticipationid,
       "statusdate.initiated": serverTimestamp(),
       queuevariationid: variationid,
       requestedslot: selectedSlot }
     ```
     ← **this is the product initiation.** The participant's pending product flips `null → "initiated"`.
   - **Create** `event participation request/<newId>`:
     ```
     { docid, doccreateddate, eventref: queue generation/<queueid>,
       productref, status: "approved", profileid,
       participantproductid, arenaeventid, initiatedfrom: "app" }
     ```
4. On commit success → `booked = true`, call `requestSent()`.
5. Home screen's `requestSent` callback (line 7898): after a 15s delay, clears `participantQueuePlanning` and cancels the planning subscription, then `widget.onRefresh()`.

**Race safety:** capacity is enforced *inside* the transaction, and the product/participation writes only happen if the slot increment succeeded. So two participants racing for the last seat can't both book.

---

## Notes / gotchas for porting to another project

- **The gate is a doc-existence check**, not a boolean field: "in queue_token" = a `queue_token` doc exists for `(queueref, profile_id)`. Type #2 is purely `token.docs.isEmpty`.
- **Segment resolution is indirect**: participant → `participant list` (via `profilelist` arrayContains) → `segmentid[]` → matched against `queue planning.planning[].segments[].segmentid`. First match wins.
- **Only first-stage, future, non-full slots are offered.** Replicate all three filters or you'll show unbookable slots.
- **Eligibility = has a `participantsproduct` with `status == null` and none `initiated`/`ongoing`.** The 6-month cooldown is written but commented out.
- **`maxslot == 0` means unlimited**, not zero capacity.
- **Slot identity has no ID** — slots are matched by the `(startdate, enddate, stagename)` tuple. If you redesign, give slots a stable id to make the transaction match robust.
- **Capacity + initiation must be one atomic unit.** Increment `usedslot` in a transaction; only write the "initiated" product + participation request if the increment succeeded.
- **Waitlist path** (`slotinterest` arrayUnion) is the graceful fallback when a matched segment has zero available slots.
- **`appflowbreaks` breadcrumb logging** is worth keeping — it's the only way to diagnose "why didn't this user see a card".
