# 2026-06-12 — Flutter e2e suite: all 11 buckets GREEN

## What this session did

Drove **Gate 3** of the standing goal to completion: a Flutter e2e suite covering all functionality of
`breakthroughs-flutter`, ≥9 users, both as a **journey-flow** (marquee end-to-end) and **individual
functionality checks**, iterated to GREEN with screenshot + stored-result evidence, **no scope cut**.

**Result: 11/11 buckets GREEN** — `journey-flow` (user 170) + 10 per-area buckets (auth 90, shell 91,
journey 92, queue 93, forms 94, appointments 95, events 96, content 97, workshops 150, social 151).
**171 real-UI screenshots** under `breakthroughs-flutter/mobile-evidence/<bucket>/`, ~30 anti-circular
app-writes. Gates 1 (265-feature catalog) and 2 (≥200-user cohort) were already satisfied coming in.

At session start only ~4 buckets were green (queue/forms/shell + the render-gate of journey-flow). This
session greened journey, appointments, auth, events, workshops, social, and content.

## How (the load-bearing techniques)

- **Per-bucket loop:** re-seed → `flutter analyze <test>` (a compile error silently re-runs the LAST build)
  → run on the booted iPhone-17-Pro sim → read the SAVED full log at `$TMPDIR/flutterdrive-<label>.log`
  (the runner only tails 30 lines; the full log is where the real cause lives) → fix → repeat.
- **Dynamic Opus workflows / sub-agents** (operator asked for them): a 5-agent `crash-prescan` workflow +
  two focused Explore prescans (journey-render, appointments-render) read each bucket's pushed screens vs its
  seed and returned the exact unguarded-read crash list BEFORE burning 5-minute sim runs. This front-loaded
  most seed fixes for events/social/workshops/appointments. Opus throughout; never Haiku.
- **Honest sim-blocked legs:** real-media players (BetterPlayer/just_audio), CallKit/push, camera/QR, OpenAI,
  external links cannot run in the headless sim. These are drive-to-screen + render-assert and recorded
  honestly (e.g. content's eiflix-episode/tier, social's Report-on-feed). NEVER faked green.

## WHY the hard parts landed the way they did

1. **Cross-run data pollution is the dominant failure mode.** Several screens query a collection GLOBALLY,
   not scoped to the user: Mastercalendar / MastercalendarClone over all `event collection`; homeContent's
   mode-checklist listener over all `participant mode checklist`; Social over all posts. So docs left by OLD
   test runs (`biz`/`evt`/`run1`/other users) flow into the current user's screen and crash it on a field the
   old doc lacks. Fix pattern: one-time admin **sweeps** of the polluted field (`event.atcmodel:''`,
   `event.delete:false`, `event.end_date`, `participant mode checklist.docid`,
   `journeyonboardingdetail.overviewvideo:null`) + **harden the seeds** so reseeds stay clean. A purely
   per-user seed fix is NOT enough when the query is global.

2. **The app has real, load-bearing bugs** the suite had to work around (documented, never faked):
   - `raiseTickets` double-removes its `OverlayEntry` → the 2nd ticket-raise in a session silently loses its
     clientissue write (F5 wrote, F6 didn't). Reset `AppService().ticketOverlayEntry=null` before the 2nd.
     See memory [[raisetickets-overlay-bug]].
   - `customer_eismapping.eisroles` is indexed by a role-path **String** but seeded as a **List** →
     "String is not int" (Book Appointment + ScheduleOnboarding). Fix: reshape to a Map / delete the doc.
   - `hexToColor("EEF2FF").substring(1,7)` RangeError — a 6-char hex with no leading `#`.
   - `Social.dispose()` does `personalVideoController!.dispose()` = null! when the media-heavy feed never
     loaded; popping the feed also corrupts the navigator Overlay (`_elements.contains`). Net: the Social
     community feed is sim-hostile → F-report is sim-blocked, write path mapped honestly.
   - `ViewHPC` List-as-Map cast; many `Text(List)` / `.id`-on-Map / `.toDate()`-on-null unguarded reads in
     render screens (the seed must match the exact shape the app reads, field-by-field).

3. **Auth login had to drive the REAL Login UI.** `robot.signIn` authenticates programmatically via
   FirebaseAuth and BYPASSES `login.dart`, so `last_login` is never written. Rewrote F1 to fill the Login
   form + tap "Log In" — but the post-login Home is CallKit/VoIP/push-heavy and HANGS `tester.pump()`, so
   `last_login` is polled via `tester.runAsync` (no UI pump) while the hang happens off-screen, then
   `popUntil` discards it.

4. **Re-run idempotency:** anti-circular pre-states assume the app-written doc does NOT exist yet. The
   app's writes persist across runs (published post, `accountdeleted`, blacklistrows), so seeds now RESET
   those app-written docs at `--seed` time, not only at teardown.

## Evidence

- `e2e/flutter-suite/RESULTS.md` — the 11×GREEN matrix + per-bucket app-writes + the sim-blocked legs.
- 171 screenshots: `breakthroughs-flutter/mobile-evidence/{journeyflow,auth,shell,journey,queue,forms,appointments,events,content,workshops,social}/`.
- Composite indexes in `firestore.indexes.json`, deployed via `firebase deploy --only firestore:indexes
  --config firebase.indexes.json --project slabs-queue-e2e-exdcz` (main `firebase.json` is hosting-only → PROD; ALWAYS pass `--project`).

## Pending / next

- `breakthroughs-flutter` is its OWN nested git repo — test-file commits go there
  (`git -C breakthroughs-flutter ...`); seeds/indexes/RESULTS commit to the parent.
- A clean full-suite pass via `e2e/flutter-suite/run-suite.cjs` (seeds cohort + all 11 buckets, runs serial,
  regenerates RESULTS) would consolidate evidence in one shot — the per-bucket seeds + indexes are all wired
  for it. Not run this session (buckets were greened individually for fast failure isolation).
- A few app bugs above are worth filing upstream (raiseTickets overlay, hexToColor, eisroles shape).
