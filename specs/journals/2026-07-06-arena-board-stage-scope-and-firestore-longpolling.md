# 2026-07-06 — Arena board: stage-scoped studios + default-DB long-polling

Operator report: opening the Arena screen from the Event Opportunity dashboard shows **wrong data
that isn't related to the card clicked**, and when **two Arena boards are open, the other one shows
no data**. "Look for loopholes."

## Investigation

The Arena opens in a new browser tab via `openStagePanel(queueId, stage)` →
`window.open('/arena/'+queueId+'/'+stage, '_blank')` (event-opportunity-dashboard.component.ts:1098).
`ArenaBoardComponent` reads `queueid`/`stage` from the route and queries Firestore. Verified:
- The single caller passes the loop's `queueid`/`stage` correctly; route params round-trip correctly.
- Token / invitation / live-assignment / completed queries are all **stage-scoped** and match the
  dashboard child's queries (same `queueref` + `tokenstatus==Active`; stage identity is the token's
  `currentstage`, which is exactly what the dashboard keys its `stageTokenMap` by). So per-stage
  numbers agree.

Two real loopholes found.

### Loophole 1 — studios were queue-scoped, not stage-scoped  (⇒ "data not related to the card")

`arena-board.component.ts` loads `queue studio pairing` filtered ONLY by `queueref` + checked-in
(no stage filter — this was a deliberate simplification, see the old comment at ~line 207). A studio
isn't bound to one stage (it can serve several), so `idleStudios`, the **Specialists** tab count and
the studio list showed **every checked-in studio in the queue**, regardless of which stage card was
opened. For a queue running multiple stages at once, stage A's board showed stage B's idle studios —
and two different-stage boards of the same queue looked identical. That is exactly "wrong data, not
related to the card."

`waitingTokens`/`queuedTokens` (token `currentstage` filter), `liveStudios` (driven by stage-scoped
`liveAssignments`) and `invitingStudios` (stage-scoped `invitations`) were already correct — only the
**idle / raw-studio** surfaces leaked.

### Loophole 2 — default Firestore DB streams over a WebChannel-hostile network  (⇒ "other board no data")

`main.ts:30` initialized the default DB with `initializeFirestore(app, {})` — plain WebChannel
streaming. The very next lines (31–36) document that **this network blocks Firestore WebChannel
streaming**, which is why the `firestore-atc` DB force-long-polls. A single tab usually establishes
its Listen stream, but a **second concurrent tab** on the same origin (two Arena boards) is much more
likely to have its stream stall — that tab's collections never emit and the board shows no data.

## What changed

`arena-board.component.ts`:
- New `get stageStudios()` + private helpers `stageActivityCombos()` / `studioActivitySignature()`.
  A studio serves the stage iff its sorted participant-activity signature matches one of the stage's
  `stageproperty[stage].compulsoryactivity` combinations — the **same derivation** dynamic-studio-v2
  (~line 2071) and the dashboard child use. **Safe fallback**: if the stage has no activity config,
  `stageStudios` returns all checked-in studios (never blanks the board).
- `idleStudios` now filters `stageStudios` instead of `studios`.
- `liveStudios` / `invitingStudios` / chat list / name lookups still use the full `studios` list
  (they're already stage-correct via assignments/invitations, and chat is queue-wide by design).

`arena-board.component.html`:
- Specialists-tab count `{{ studios.length }}` → `{{ stageStudios.length }}`.
- Chat thread list left on the full `studios` (queue-wide communication, not board data).
- Added a `*ngIf="loadError"` banner (cloud-off icon + message + Retry) under the header.

`arena-board.component.ts` (silent-blank guard):
- The 5 board-data `collectionData` streams (tokens / studios / invitations / live / completed) had NO
  error handler — a stalled Listen stream, missing index or rules denial killed the stream silently and
  the board just showed nothing (the "not showing data" symptom, with no clue why). Added
  `catchError(this.flagLoadError)` to each: on error it sets `loadError` (renders the retry banner) and
  returns `of([])` so the section shows empty instead of the whole board dying. `retryLoad()` reloads.
  Chat / bigactivity streams intentionally untouched.

`main.ts`:
- Default DB init `initializeFirestore(app, {})` → `{ experimentalForceLongPolling: true }`.
  **Correction during review:** the first attempt used `experimentalAutoDetectLongPolling: true`, but
  inspecting the firebase-js-sdk v11.10.0 source shows auto-detect is ALREADY the default when neither
  long-polling flag is passed (`autoDetect === undefined ? = true`). So `{}` already auto-detected —
  that change was a no-op. And auto-detect is evidently NOT enough on this network, which is exactly
  why the `firestore-atc` DB *force*-long-polls. So the real, behaviour-changing fix is to FORCE it on
  the default DB too, matching the ATC remedy. Trade-off: app-wide long-polling is slightly chattier
  than streaming, but robust on a network that stalls WebChannel.

## Verification

- **LIVE DOM render — the real component in a real browser (strongest).**
  `arena-board.component.spec.ts` renders the actual `ArenaBoardComponent` in headless Chrome (data
  injected directly into the component fields; Firestore not hit) and asserts the rendered DOM — **6/6**:
  the Diagnostics board renders only its own stage's studio ("Alice"/S1) and NOT the other stage's
  ("Bob"/S2); the Consultation board the reverse; two different-stage boards render DIFFERENT studios;
  the no-config fallback isn't over-filtered; the loader spinner renders while loading; and the
  load-error banner renders (not a silent blank) and hides the spinner. This is observable proof of the
  stage-scoping fix + loader + error banner without production auth. Run via `tsconfig.spec.arena.json`
  (scoped) because the default `ng test` build is broken by PRE-EXISTING unrelated TS errors in other
  files (`import ... from 'os'`/`'console'`, missing `amazon-chime-sdk-js`) — the project test suite was
  already non-functional; this is the first real spec.
- **Loophole 1 (stage-scoping) — also deterministically verified (pure logic).** `.preview-demo/arena-stage-scope.test.mjs`
  runs the exact component functions against a 3-stage mock queue: 8/8 assertions pass — each stage's
  board returns only its own studios, two boards return different non-empty sets (old code returned all
  studios to both), the no-config fallback is not over-filtered, and the idle column stays stage-scoped.
- **Ruled out a rival "empty board" cause.** Pulled the LIVE Angular Router from the running app and
  round-tripped 8 stage names (spaces, `/`, `&`, `#`, `%`, `:`); all serialize→parse back to 3 segments
  with the stage intact. A real browser navigation to `/arena/QUEUE1/A%2FB%20Split` kept the full arena
  path (`returnUrl=/arena/QUEUE1/A%2FB%20Split`) and matched the route. URL encoding does not blank a board.
- **Loophole 2 (force long-polling) — confirmed live in the served `main.js` bundle** (contains
  `experimentalForceLongPolling`, no `experimentalAutoDetectLongPolling`), app boots clean, no init errors.
  Its **real-world two-tab effect is NOT verifiable headlessly**: it requires the production network
  (which stalls WebChannel) AND an authenticated session to reach the Arena. The app is auth-gated and
  entering a password is off-limits; the emulator can't stand in (its `main.ts` branch skips this code
  entirely and runs on localhost where WebChannel isn't blocked). No Firestore traffic fires pre-auth, so
  the transport can't even be observed on the login page. **Operator must confirm live:** open two
  different-stage Arena boards and check both load.

## Revert

Three files, all self-contained:
1. `main.ts`: change `{ experimentalForceLongPolling: true }` back to `{}` (and drop the added comment
   block) to restore the default (auto-detect) transport on the default DB.
2. `arena-board.component.ts`: delete the `stageStudios` getter + `stageActivityCombos()` +
   `studioActivitySignature()` helpers, and change `idleStudios` back to `this.studios.filter(...)`.
   For the error banner: remove `loadError` / `flagLoadError` / `retryLoad`, drop `catchError`/`of` from
   the rxjs import, and revert the 5 streams' `.pipe(takeUntil(this.destroy$), catchError(this.flagLoadError))`
   back to `.pipe(takeUntil(this.destroy$))`.
3. `arena-board.component.html`: change `stageStudios.length` back to `studios.length`; delete the
   `.arena__load-error` banner block.
4. `arena-board.component.css`: delete the appended `.arena__load-error` / `.arena__load-retry` block.

The load-error banner + `catchError` wiring was verified deterministically with the project's real rxjs
(`.preview-demo/arena-load-error.test.mjs`, 4/4): a stream error sets the banner and still yields `[]`
(empty, not a dead board); a healthy stream leaves the banner clear and delivers its rows.
Reverting all three restores the prior queue-scoped, streaming behavior exactly. No backend/schema
changes were made.

---

## 2026-07-08 — REVERSAL: default-DB force-long-polling removed (operator decision)

Operator was diagnosing "top navbar/name shows instantly but every screen's DATA is slow to arrive
('html loads but data won't come')". Root causes found this session (see diagnosis below), then operator
elected to remove the app-wide default-DB `experimentalForceLongPolling` added in `185e8412`.

**Important framing corrected for future sessions:** the long-polling flag is per-DB-INSTANCE, not
per-screen. It was *motivated* by the two-tab Arena stall but *applied app-wide* to every default-DB read.
It is NOT "just for Arena" and cannot be scoped to Arena without moving Arena's collections to a separate
DB instance.

**Change:** `src/main.ts` default DB `initializeFirestore(app, { experimentalForceLongPolling: true })`
→ `initializeFirestore(app, {})` (auto-detect). Comment block rewritten to document the removal + a WATCH
note. `firestore-atc` force-long-polling left intact (separate instance).

**Risk re-introduced:** the exact bug `185e8412` fixed — two concurrent Arena boards on the WebChannel-
hostile production network can blank out. MUST be confirmed live (open two different-stage Arena tabs,
reload each a few times). If either blanks → restore the flag.

**Note:** removing long-polling is NOT expected to fix the "data won't come" slowness. The real levers
identified this session are (1) NO `persistentLocalCache` is configured in main.ts despite the comment
claiming durable offline persistence (history shows commit `cfd5be7 persistentLocalCache` was later
dropped) → every screen re-fetches cold each load; (2) `authguard.getProfileMap()` and siblings fetch
ENTIRE collections (profile_data ordered by name, no limit) and are called in ~99 screens; (3) the
`authGuard` blocks each navigation on ~4 serial uncached Firestore reads incl. a full `dashboard`
collection fetch and a duplicate profile query (`getRoles` + `username`).

**Revert this reversal:** in `src/main.ts` change the default DB back to
`initializeFirestore(app, { experimentalForceLongPolling: true })`.
