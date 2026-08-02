# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-01 (dashboard rounds 1-5: profile-tile merge · header search · ATC slowness diagnosed EMPIRICALLY · duplicate-stream + ladder + transport fixes)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-08-01-live-event-dashboard-v3-continued.md` (today: 5 rounds with WHYs + live measurements) and `specs/2026-07-30-perf-audit-live-event-dashboard-v3.md`.

## Current state
- Branch `nanda-development`; `ng build --configuration production` green
  (only pre-existing canvg/leaflet + Bootstrap warnings).
- HEAD holds the 07-30 arc through ~round 13-14; **UNCOMMITTED** (operator
  commits manually after Chrome testing): 07-30 rounds ~14-24 delta PLUS all
  of today: profile-card % tiles with done·pending sub-lines; header search
  over the Total approved universe (opens the rich profile dialog); round-4
  perf fixes (livechangework 3 listeners → 1 with in-memory day views,
  atc_alpha single-pass, changed$ debounce, temporary_ATC bounded by
  `lastupdated >= queueRangeStartDate` — the earliest selected queue start —
  plus atc-draft `toServer()` timestamp normalization); round-5 ladder fixes
  (metadata scan un-gated with re-kick incl. calculateJourneyCounts, ATC
  pipeline attaches before the default-DB heavies and without awaiting the
  legacy queue-variation read) and **main.ts: firestore-atc switched from
  FORCED long-polling to auto-detect** (one-word revert if ATC screens ever
  blank at a venue; firestore-forms left forced).
- Composite index (temporary_ATC: delete ASC + lastupdated ASC) already
  exists in prod — verified live (draft count 96-97 works).

## Last session changes (2026-08-01, why)
- ATC card took 40-60s. Measured ON the operator's Mac (their ng serve,
  production data, in-app pane + `ng.getComponent` state reads): app boots
  in <1s; firestore-atc's FIRST request was held to 15.5s by a serial init
  ladder (3,376-doc metadata full scan gating selectEvent, then serial
  participants + queue-variation hops), and the ATC backfill then crawled
  ~50s on FORCED long-polling (19-29 sequential polls, singles 14-74s).
  Ladder fixes cut attach to ~11-12s; numbers verified byte-identical
  (buckets 451/10/1/82 · 506 atc docs · journeys 544). Every round was
  adversarially verified by agent workflows; verifiers caught real defects
  (journey counts stuck at zero; event-switch stale-changework blend;
  zero-queue day-chip parity; ESC double-close; backdrop fall-through) —
  all fixed. Videoask double-stream deliberately NOT merged (operator
  comment 2026-07-29 in code).

## Pending
- **CONFIRMED measured result: dashboard data 40-60s → ~7s** (metadata
  1.5s; atc/buckets/changework all at 7.0s; numbers identical; transport
  streaming). Remaining: operator's own Chrome pass + manual commit of
  the day.
- If a venue ever blanks ATC screens again: revert the one word in main.ts.
- Phase-2 perf (H2 proper): scope/cache the `participant metadata` scan;
  bound event-wide changework (3.4k) / videoask-tag (2.2k) streams.
- Offered-not-built (07-30): DONE-pill tooltips with doc counts; cleanup
  chip items; dropped debug of /livechangework/blkWuqSNB2XNco10GSDI.
