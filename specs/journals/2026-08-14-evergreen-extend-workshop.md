# 2026-08-14 — Workshop dashboard: evergreen extensions + Extended timeline

## What was asked
On `/workshop_dashboard/:id` (evergreen workshops), the Participant
Journey's **Completed** side panel must stop navigating to `/userprofile`;
instead, clicking a participant offers a date choice that appends
`{extenduntill: <chosen date ts>, created: <now ts>}` as a **new index**
in `evergreenaccessto.extendworkshop` (array of maps) on the participant
workshop doc. A new **Extended** stage after Completed holds all extended
users (exclusively — not in Completed), and clicking it opens a new,
premium, responsive **timeline dialog** built on `created`/`extenduntill`.
Commit `1c3c434a`.

## How it works (and WHY)
- **Write path**: `updateDoc(participantworkshopref, {
  'evergreenaccessto.extendworkshop': arrayUnion({extenduntill, created}) })`.
  - `participantworkshopref` comes off the enrolled snapshot rows — the
    same DocumentReference the dashboard already `updateDoc`s for
    challenges, so it's proven live.
  - `arrayUnion` (not read-modify-write) → concurrent admins can't clobber
    each other's entries; `created: Timestamp.now()` (serverTimestamp is
    illegal inside arrayUnion) also makes every map unique, so no dedup
    loss.
  - `extenduntill` pinned to **11:59 pm of the chosen day** — the same
    "until means end of day" convention as the ads schedule enddate.
  - Dot-path update creates the `evergreenaccessto` map if a doc lacks it.
- **Bucketing**: `computeEvergreenDayDistribution` routes past-days
  participants with ≥1 extension entry to `evergreenExtendedBucket`
  (with `activeCount` = latest `extenduntill` still in the future) instead
  of Completed. Because `recomputeDerivedState → updateMetrics →
  computeEvergreenDayDistribution` runs on the live 'participant workshop'
  snapshot, an extension re-buckets automatically; the open panel row is
  also removed optimistically. **Extended is history-based** — a lapsed
  extension keeps the user in Extended (returning them to Completed would
  strand their timeline); the node's tooltip shows "N active · M lapsed".
- **Panel UI**: rows in the Completed panel only (flagged via
  `selectedStatusInfo.evergreenCompleted`, set exclusively in `onDayClick`;
  the review's regression lens verified every other panel opener keeps its
  `/userprofile` anchors) render as keyboard-accessible buttons that expand
  an amber extend-box (datepicker min = today via a **getter** — a field
  would go stale past midnight).
- **Extended dialog** (`extended-timeline/`): data resolved by the
  dashboard (names from mapProfile, entries as millis) so the dialog is
  presentational + one write action. Per-user card: initials avatar,
  extension count, live Active-until/Expired pill, vertical timeline
  (created → extenduntill, Current/Lapsed on the latest), search shown
  when >3 users. **Extend again** lives here because once a user leaves
  Completed there is no other reachable path to append further indices —
  required by "each time i want in a new index". Its datepicker min is
  the **day after the current extenduntill** while active, so a new
  extension can extend but never silently shorten.
- DateAdapter: provided app-wide (provideNativeDateAdapter in app.config),
  verified by the review — pickers work on this route and in the lazy
  dialog.

## Accepted nits (documented, not fixed)
- An open Completed panel doesn't live-remove a participant extended by
  ANOTHER admin (matches all pre-existing panels' snapshot behavior; a
  double extension is benign — two entries, latest governs).
- The Completed node can vanish under an open (now empty) panel when the
  last completed user is extended.
- Transient flicker: extended users sit in Completed for an instant if the
  enrolled snapshot lands before the pw snapshot (pre-existing two-snapshot
  ordering).

## Pending
- Operator Chrome pass. The consumer that actually grants app access from
  `extendworkshop` is outside this repo — the dashboard only writes the
  bookkeeping.
