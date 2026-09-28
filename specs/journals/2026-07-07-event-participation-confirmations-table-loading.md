# 2026-07-07 — Event Participation Confirmations: how the main table loads

**Why this journal exists:** captures the *loading/processing model* of the main
overview table on the Event Participation Confirmations screen, so future sessions
(and other projects) can reuse the two-phase + three-tier pattern without re-tracing
the code.

Source: `src/app/Events/event-participation-confirmations/event-participation-confirmations.component.ts`
(template lines ~35–82; logic lines ~79–270).

---

## The shape in one sentence

> Build the table **rows first** from arena events (fast, render immediately), then
> fill each row's **count columns lazily, per visible page**, picking the cheapest
> available data source per row (frozen snapshot → precomputed rollup → live scan).

Two phases, and within phase 2 a three-tier fallback. That's the whole design.

---

## Phase 1 — build the row skeletons (`loadOverview()`, called from constructor)

1. **Two queries in parallel**: `event collection` (order `end_date desc`) and
   `queue generation` (order `queueenddate desc`). Both are folded into ONE
   `mapEvent` lookup (`eventref.id → {name, start, end}`). **Events and queues are
   treated as the same kind of "event"** for this table — that unification is the
   first key move.
   - **Where the row's name comes from:** event docs contribute
     `name: data['name']`; queue docs contribute `name: data['queuename']`
     (`start/end` from `queuestartdate`/`queueenddate`). So for queue-backed rows
     the **`queuename` becomes `mapEvent[...].name`**, which is read out at row-build
     as `eventName` (`ev?.name ?? 'Event'`) and rendered in the `.ov-prod` line of
     the template. The bold primary line is the *product* name (from
     `mapProduct`); the queuename/eventname is the secondary line beneath it.
2. **Fetch `arena events` in batches of 10** via `where('eventref', 'in', chunk)`
   (Firestore `in` caps at 10). Drop docs with `delete == true`. **The arena event
   is the spine/identity of each row.**
3. **Map each arena → `OverviewRow`**: join event name/dates from `mapEvent` and
   product name from `guard.getProductMap()`. Rows with no matching event are
   filtered out. Count columns start `null`, `eligibleLoaded: false`.
4. **Frozen shortcut**: if the arena doc carries an `epc_snapshot`, read counts
   straight off it, mark `frozen: true` + `eligibleLoaded: true`. That row is done
   (the lock icon in the UI). This is tier 1 of the count strategy, resolved here.
5. Sort by end date desc → assign `overviewRows` → kick off `computePageEligibility()`.

`mode` (`'past'` vs current) only filters which rows survive, by their end-date
window (`inWindow(end)`).

---

## Phase 2 — fill count columns (`computePageEligibility()`)

Runs **only on `pagedRows`** (current paginated page), in **chunks of 4**, skipping
rows already `eligibleLoaded`. Per row, in order:

- **Tier 2 — precomputed rollup (1 read):** `getDoc('event_stats/{arena.docid}')`.
  If present, copy `potential/requested/approved/eligible`; `notEligible = noProduct
  + inQueue`. Done.
- **Tier 3 — live scan + join (3 parallel reads):** only if no rollup exists.
  - `event participation request` where `arenaeventid == arena.docid`, status in
    `[requested, approved]`
  - `getOwners(productref)` → profile IDs owning the product
    (`participantsproduct` where `status == null`) — **cached** in `ownersCache`
  - `getActive(eventref)` → active `queue_token` profile IDs — **cached** in
    `activeCache`

  Then compute in memory: dedupe requested vs approved (**approved wins**), and
  **`eligible` = requested who own the product AND are not already active in the
  queue**; `notEligible` = remaining requested. `potential = owners.size`.

On any throw → `row.error = true` (UI shows a failed state), still marked loaded so
it isn't retried in a loop.

---

## The reusable ideas

1. **Row identity first, expensive metrics later.** Render the table from a cheap
   spine (arena events + already-loaded maps); defer the costly per-row counts.
2. **Three-tier cost ladder for the numbers:** frozen snapshot on the doc →
   precomputed `event_stats` rollup → live multi-collection scan. Cheapest source
   that exists wins. Rollup/snapshot exist so the common case is 0–1 reads per row.
3. **Compute only the visible page**, in small concurrent batches, so cost scales
   with what's on screen, not the whole dataset.
4. **Cache the shared joins** (owners-per-product, active-per-event) across rows so
   two rows on the same product/event don't re-scan.
5. **Eligibility is a set intersection, done client-side:** `requested ∩ owners −
   active`. The joins pull sets; the arithmetic is in memory.

## Final row shape (`OverviewRow`)

`arena` (raw doc), `eventName`, `productName`, `initial`, `avatarColor`,
`dateLabel`, `startValue`/`endValue` (ms), `isToday`, then the lazy counts
`potential/requested/approved/eligible/notEligible`, plus flags `frozen`,
`eligibleLoaded`, `error`.

## Collections touched

Phase 1: `event collection`, `queue generation`, `arena events`.
Phase 2: `event_stats`, `event participation request`, `participantsproduct`,
`queue_token`.
