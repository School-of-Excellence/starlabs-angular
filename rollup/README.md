# Event Participation Confirmations — rollup (serving fast, accurate at scale)

Replaces the screen's read-time scan-and-join (which reads the **entire** owner list +
all requests/tokens per load — ~13,900 reads to open one popular event, ~36,522 to load
a page of parallel events, ~6–10 s) with a precomputed `event_stats/{arenaeventid}` doc
read in **one** request (~100 ms, flat regardless of scale).

## Pieces

| File | What | Who deploys |
|---|---|---|
| `functions.ts` | Cloud Functions: source-write triggers → debounced recompute → maintains `event_stats` + the `epc_bucket` flag | **you** (drop into your functions repo, deploy) |
| `backfill.mjs` | One-time: compute `event_stats` for all current/upcoming events | **you** (run once, with a service account) |
| *(Angular)* `computePageEligibility` | The overview now reads `event_stats` when present, **falls back** to the live scan when not | already in the app commit — safe to ship before the rest |

## Roll it out (each step is independent and safe)

1. **Ship the Angular change** (already done). No-op until stats docs exist, then the
   overview is instant. Nothing breaks in the meantime — it falls back to live compute.
2. **Add a read rule for `event_stats`** in `firestore.rules` (the screen reads it as the
   logged-in user). Without it the client read is *denied* and the screen silently falls
   back to live compute — so this is the gate for the actual speedup:
   ```
   match /event_stats/{id} { allow read: if request.auth != null; }
   ```
3. **Run the backfill** → `GOOGLE_APPLICATION_CREDENTIALS=./sa.json node rollup/backfill.mjs`.
   The screen immediately drops to ~100 ms. (Numbers are a point-in-time snapshot until step 4.)
4. **Deploy `functions.ts`** so the stats stay fresh as people request / get approved / attend.

## Data written (all additive — the shared `status` enum is untouched)

- `event_stats/{arenaeventid}` — the 8 funnel counts + `updatedAt`.
- `epc_bucket` on each *requested* `event participation request` — `eligible` | `noProduct` | `inQueue`,
  so the funnel list can filter server-side (`where arenaeventid == X and epc_bucket == 'eligible'`)
  instead of re-joining. (Wire this into `product-funnel`'s `loadData` as a follow-up — out of
  scope for this commit, which does the high-value overview path.)
- `rollup_dirty/{arenaeventid}` — transient work queue, deleted after each recompute.

## Watch-outs

- **`participantsproduct` fan-out:** a product owned by thousands × many events. The recompute
  is debounced (1-min sweep) and reads bounded per event, but for very hot products consider
  incremental `FieldValue.increment()` counters instead of a full rebuild.
- **Idempotent:** recompute is a full rebuild, so retries / re-runs are safe.
- **Freshness window:** the 1-min sweep means up to ~1 min lag. Swap to Cloud Tasks (per-event
  delayed dispatch) if you need near-real-time.
- The funnel still loads participant *rows* (names, journey, finance) live — `event_stats` only
  replaces the heavy **counts/eligibility** computation. `epc_bucket` removes the funnel's token
  scan when you adopt it.
