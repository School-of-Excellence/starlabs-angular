# 2026-09-22 — Content Analytics v2 (design build, mock data)

## CHANGE LOG & REVERT GUIDE

| # | Commit | Scope | Files | Revert |
|---|---|---|---|---|
| CL-1 | uncommitted | New standalone screen `ContentAnalyticsV2Component` (design only, seeded mock data) | `src/app/content/content-analytics-v2/` (6 files, all new) | `rm -rf "src/app/content/content-analytics-v2"` |
| CL-2 | uncommitted | Routing (**operator edit**): `/contentanalytics` now loads `ContentAnalyticsV2Component`; the old `ContentAnalyticsComponent` route is commented out. There is no separate `/content-analytics-v2` path | `src/app/app.routes.ts` lines 118 (commented) + 120 (new) | uncomment line 118 and delete line 120. **Revert together with CL-1** — the route imports the folder |
| CL-3 | uncommitted | Header: removed the subtitle ("What people watched…"), tightened spacing (`.wrap` top padding 22→12px, `.phead` bottom margin 16→10px, items centred) | `…component.html` (`.phead`), `…component.css` (`.wrap`, `.phead`; dropped `.phead p`) | restore the `<p>` under `<h1>` and the three CSS values |
| CL-4 | uncommitted | Header title "Content Analytics" font 20px → 26px (line-height 1.2) | `…component.css` (`.phead h1`) | set `.phead h1` back to `font-size:20px` and drop `line-height:1.2` |
| CL-5 | uncommitted | **Live wiring — Activity log / By content / By participant** (+ tiles, all-time strip, insights, CSV). Mode / Recommendation / Tier untouched (still mock, re-anchored to the mock's own period) | new `…live.ts` (Firestore loader); `…engine.ts` (id-keyed grouping, stored-complete, zero-runtime guard); `…model.ts` (live row fields, Ads/Other sources); `…component.ts/.html` | `rm …live.ts` and restore the other four from the CL-4 state (no commit yet — keep a copy before reverting) |
| CL-6 | uncommitted | **Period picker → Angular Material date range picker** + two loader fixes found while testing it: (a) cached-range hang — listener now uses `includeMetadataChanges`; (b) partial-cache flash — cache snapshots ignored until the server answers, first server answer rendered unthrottled. Click-only range strategy (Material's drag-to-move-range ignored `[max]` → produced Sep 12 → Oct 1); ranges clamped to today; calendar picks apply once on close, typed dates on blur; abandoned pick restores the period | `…component.ts` (`range` FormGroup, `commitRange`, `onPickerClosed`, `ClickOnlyRangeStrategy`), `…component.html` (`.range` block), `…component.css` (`.range*`), `…live.ts` (`listen`) | restore the native-input `.range` block + `onRange()`; the loader fixes should NOT be reverted (without them cached ranges hang on "Loading…") |
| CL-7 | uncommitted | ↻ rewatch badge: only when spend exceeds runtime by more than one 15s heartbeat (`REWATCH_SLACK_S`). Watch time accrues in heartbeat steps and a whole step counts even if the item ends mid-step, so short clips were flagged at 6s vs 5s | `…live.ts` (`REWATCH_SLACK_S`, `rewatch:`), `…component.html` (badge title) | set `rewatch: rt > 0 && spent > rt` back |
| CL-8 | uncommitted | "Watching now" gets its own listener, independent of the selected period: last 10 min window (a listener's bound is fixed at creation, so it re-subscribes every 5 min), rows kept while the heartbeat is < 45s old, re-checked every 15s | `…live.ts` (`nowPlaying`, `watchNow`, `emitNow`), `…component.ts` (`liveEvents`) | point `liveEvents` back at `live.events().filter(e => e.live)` and drop the now-listener |
| CL-9 | uncommitted | Period load split (operator request): finished days = one-shot `getDocs`, **only today** keeps a live listener; legacy string logdates also one-shot (they arrive from an offline queue). Split redone after midnight; `loading` clears when all parts answer | `…live.ts` (`watch`, `fetchOnce`, `listenToday`, `settle`, `rebuild`, `Part`) | restore the single `listen()` over the whole window for both queries |
| CL-10 | uncommitted | `durLong` shows seconds under a minute (was "0m" — the prototype only ever had hour-scale totals). Affects Total watch time, content/participant watch-time columns and the all-time strip | `…engine.ts` (`durLong`) | restore the `${m}m` fallback |
| CL-11 | uncommitted | **Decisions #1–#5**: completion = stored flag (ignored under 60s) or 90%, out of every play; bounce removed everywhere; text-date query dropped; Platform column/filter only when the data has it; periods over 5,000 plays load the most recent 5,000 with a banner | `…model.ts`, `…engine.ts` (`SHORT_ITEM_S`, `isComplete`, `statusOf`, `statsFor`), `…live.ts` (`PERIOD_CAP`, `capped`, Part), `…component.ts/.html` | per-item; each is a small isolated edit |
| CL-12 | uncommitted (superseded by CL-14) | Extracted the workshop dashboard's send flows into `shared/communication/*` — **reverted**, see CL-14 | — | already reverted |
| CL-14 | uncommitted | **Sending inlined, nothing shared** (operator: call the dialogs directly). Content Analytics opens the app's own dialogs itself: WhatsApp = `WatiInputComponent` (WATI — sends and archives itself), Email = `EmailInputComponent` + the `email archive` / `sendBatchEmail` follow-up, Notification = `AhNotificationComponent` + `saveNotificationRecord` (guarded so a dismissed dialog cannot save an empty record). `workshop-dashboard.component.ts` restored byte-identical to HEAD; `shared/communication/` deleted | `content-analytics-v2.component.ts` (`send`, `sendWhatsapp`, `sendEmail`, `sendNotification`), `…component.html` (action bar) | delete the three private send methods, their injects and the action-bar buttons |
| CL-15 | uncommitted | **Journey column** on By participant (and in the people drill): `participant metadata.activejourney` → `journey/{id}.journey`; column hidden until that lookup returns | `…live.ts` (`journeys`, `journeyName`), `…model.ts`, `…engine.ts` (rollups carry it), `…component.ts` (`hasJourney`), `…component.html` | drop the `journeyName` field and the column |
| CL-16 | uncommitted | **Mode tab wired to live data** (phase 1). Reads `products` (modeflow), `modes` (by sequence), `product mode config` (shelf), `participantsproduct` (mode / nextmode / nextmodedate / eventref), `event collection`, `queue generation` — one-shot, cached on first visit to the tab, mirroring AppEngagement's mode dashboard. Forecast is READ from `nextmodedate`, not computed. Mock mode logic removed from the view | `…live.ts` (`ModeData`, `loadModeData`), `…component.ts` (`modeVM`, `modeContent`, `modeColor`, scope handlers), `…component.html` (mode case, movers drill, scope panel) | restore the previous mock `modeVM`/`modeContent` block and the `tScope` template from git history |
| CL-17 | uncommitted | **`participantsproduct` is no longer read whole** (operator: "fetching all the participant product breaks down the browser"). It holds ~38.5k docs. The catalogues still load once; the people are fetched **per scope** — `eventref ==` for an Event/Queue, `productref ==` for a product — counted first, cached per scope, and above `SCOPE_CAP` (3,000) narrowed to `nextmodedate` inside the forecast window with a banner. Cascade is now rendered outside the VM so it stays usable while a scope loads or comes back empty | `…live.ts` (`ModeScope`, `SCOPE_CAP`, `loadScope`, `toParticipantProduct`; `loadModeData` minus `participantsproduct`), `…component.ts` (`scopeKey`, `prodOpts`, `selProduct`, `ladderOpts`, scope effect, `modeVM` reads `modeScope`), `…component.html` (mode case restructured, partial/empty/error states) | put `getDocs(collection(fs,'participantsproduct'))` back in `loadModeData`, point `modeVM` at `md.rows`, drop `loadScope` — **do not**: it is what froze the browser |
| CL-19 | uncommitted | **Recommendation tab wired to live data.** Source is `recommended mix playlist` (9,446 docs, 1,803/90d) — the same collection the black-theme `content-analytics-dashboard` reads; the legacy `content-analytics` screen has no recommendation logic at all. One query per period on `date` (single-field range). Per-type documents are merged back into one push per (buffer group, participant); a pushed series / playlist is expanded into its `sequence`. Completion is derived from plays, NOT from `completedcontent`/`completedplaylist`. Mode chip replaced with the document's own `type` | `…live.ts` (`RecPush`, `RecItem`, `REC_CAP`, `loadRecs`, `loadItemNames`, `itemLabel`, `containerLabel`, `journeyName`, `seq` capture in `loadLookups`), `…model.ts` (`REC_TYPE`, rewritten TIPS), `…component.ts` (`recRows`, `recVM`, `recContent`, `openRecHist`, `closingSoon`/`completedOf`/`missedOf`/`closingOf`, `recTypeColor`, `recPeopleCols` computed, push drills), `…component.html` (rec case, `tRecType`, `tRecPill`, push drill renderers) | restore the mock `recVM`/`recContent` + `eng.push*` helpers from git history and drop `loadRecs` |
| CL-20 | uncommitted | **EiFLIX tier tab wired to live data — the last mock tab.** Access is read from `series.tier[]` (which tiers may see each series), tiers from the 13-doc `tier` catalogue, and a participant's tiers from `participant metadata.tier[]` (an ARRAY — anyone holding two is listed under both). The prototype's "tier N opens base + (N-1)×step series" rule is deleted. Roster follows the legacy `contentanalytics` screen: every `participant metadata` doc with a `firebaseuserref`. Tables measure the SELECTED PERIOD; true all-time progress is a per-participant drill reading one `participant content analytics` document. Mock `tierseries` drill removed; tab badges for Recommendation and Tier are now live counts | `…live.ts` (`TierDef`/`SeriesDef`/`TierPerson`/`TierData`, `loadTierData`, `allTimeSeries`, `seriesName`, `seriesTier` capture in `loadLookups`), `…model.ts` (`DrillKind` minus `tierseries`, tier TIPS), `…component.ts` (`tierVM`, `TierRowLive`, `TIERLESS`, `tierLabel`, `openAllTime`/`closeAllTime`, `tier` signal retyped to a tier id, columns), `…component.html` (tier case, all-time panel, `tierpeople` drill) | restore the mock `tierAll`/`tierVM`, `tierNums`, `dTierSeries` and the `tierseries` drill from git history |
| CL-21 | uncommitted | **Four files collapsed into one** (operator request). `…engine.ts`, `…model.ts`, `…live.ts` and `…mock.ts` are **deleted**; what was still reachable moved into `…component.ts` (2,157 lines): types, reference config, TIPS, the pure derivations, and the `ContentAnalyticsV2Live` service. The split existed because the design was built against a mock dataset — with every tab live there is no second implementation to keep them apart for. Dead mock scaffolding was dropped rather than carried over (see below) | `…component.ts` (now the only .ts), `…component.html` (`tMode`/`tJy`/`tMoveIn`/`tPushPill` templates, the Mode drill column, the "How people arrived" panel) | `git checkout` the four deleted files and the component from the CL-20 state — they are uncommitted, so keep a copy first |
| CL-18 | uncommitted | **No scope is auto-selected** (operator, 2026-09-23). Opening the Mode tab now reads **zero** participant products: the cascade opens on "Choose an event…" / "Choose a product…" and the first query fires on the pick. Switching what we scope BY clears the selection (an event id means nothing to a queue; on Others the product IS the query key). Also fixed: a cache hit left `scopeLoading` stuck true, because bumping `scopeGen` orphans the in-flight load whose `finally` checks the generation | `…component.ts` (scope effect, `setScopeBy`, `hasScopeSel`), `…component.html` (placeholder options, "Choose a scope" card, panel copy), `…live.ts` (cache-hit path clears `scopeLoading`) | restore the `opts[0]` default in the effect and drop `hasScopeSel` |

The old `ContentAnalyticsComponent` files are untouched, but its route is disabled: `/contentanalytics` now serves v2, which still shows **mock data**. Keep that in mind before any push or deploy.

## What was built
The operator's HTML prototype (`content-analytics (1).html`, 2,232 lines of vanilla JS) ported to an Angular 19
standalone component (signals + `computed`, OnPush, `@for`/`@if`, no Material). Six tabs (Activity log, By content,
By participant, Mode based, Recommendation based, EiFLIX tier based), three modals (drill-down behind every number,
content insights with retention and daily charts, send-communication composer), selection action bar, CSV export,
column-glossary tooltips.

| File | Role |
|---|---|
| `…model.ts` | Types, the `CaDataset` contract, reference config (sources, via, modes, status, tips) |
| `…engine.ts` | Pure derivations (status, reach, rollups, mode clock, playlist windows, tiers). No Angular, no Firestore |
| `…mock.ts` | `buildMockDataset()`: the prototype's seeded generator, same RNG order, so the numbers match the design exactly |
| `…component.ts/.html/.css` | View state + view models; template; design CSS scoped to `:host` |

## Why it's built this way
- **One data seam.** Everything reads a `CaDataset` through `ContentAnalyticsEngine`. Wiring means writing a loader
  that returns `CaDataset` from Firestore and replacing the one `buildMockDataset()` call. The view code shouldn't need to change.
- **Same RNG order as the prototype.** This allowed a 1:1 check against the design: every tab's headline numbers,
  notes, footers and first rows were compared in the browser and matched exactly.
- **Status is derived, never stored** (prototype rule). Completed ≥ 90% reach · Bounced < 30s spent or < 5% reach · live = still open.
- **Timestamps are epoch ms** in the engine (the prototype used `Date`), so the maths is plain arithmetic. Firestore Timestamps get converted at the loader.

## Surprises
- **Bootstrap is loaded globally.** Its `.card` (`display:flex; flex-direction:column`) stacked the period bar and all-time
  strip vertically, and its `body{line-height:1.5}` loosened every row. The component CSS now resets `.card`, `.btn` and
  `line-height`. A scan of every global rule against every class the component uses found only `.card` and `.btn`.
- **Angular strips whitespace-only text between inline elements**, so "▶ Name" rendered as "▶Name". Fixed with `&ngsp;` in 5 places.
- The prototype's TIPS object has duplicate keys (Completed, Standing, Content, Finished). JS keeps the last one, and so does the port (TS rejects duplicates).

## Verification
Checked on the operator's `ng serve` :4200 through a temporary unguarded route. That route was **removed** afterwards.
DOM sizes matched the design within 6px (the app scrollbar). All 6 tabs, sorting, filters and chips, the date presets,
row expansion, the scope cascade (event/queue/other), tier chips, every drill kind, the retention hover and the
compose→send flow were exercised. Zero console errors.

## Live wiring (CL-5) — decisions (operator, 2026-09-22)
| Topic | Decision | Implementation |
|---|---|---|
| Fetch (superseded by CL-9) | reuse the legacy screen's query | `content analytics` where logdate in [start 00:00, end 23:59:59.999], `onSnapshot`, skip cache snapshots; heartbeats coalesced (800ms) |
| String `logdate` (Q8) | "whatever is feasible" | 2nd listener: string range `>= 'YYYY-MM-DD'` & `< next day` — only matches string-typed logdates |
| Source (Q1) | Ads counted | `from` when it is a library value, else `type` (`eiflix` → EiFLIX Content), else **Other**. Found in data: `from` is sometimes the **screen** (`moderecommendation`, `Interim Report`) while `type` stays the library |
| Via (Q2) | not from playlistid | column + filter hidden; insights "How people arrived" hidden when no route data |
| Completed (Q3) | stored OR derived | `status === 'complete'` OR reach ≥ 90% (`isComplete`) |
| Watching now (Q4) | heartbeat | `now − logdate < 45s`, re-evaluated every 15s |
| Catalogue (Q5) | leave for now | By content seeds nothing → "Not watched" band = 0 |
| All-time (Q6) | count/sum | `getAggregateFromServer(count, sum(totaltimespend))` + count(status=='complete') + earliest logdate (limit 1). Participants/items-touched dropped (distinct can't be aggregated) |
| Duplicates (Q7) | keep | counted as-is; clean-up stays on the legacy screen |
| vs prev | — | aggregate count over the prior window; shown only with no filter active |
| Grouping | — | people by `profileid`, items by `videoid` (names/titles aren't unique); selection keyed by profileid |
| Names | legacy maps | `participant metadata` → else new-user profile map + "New user" tag |
| Playlist / Series | — | `downloadsplaylist`, `series.seriesName`, `solar voice playlist.name`; anything else shows "—" |

Verified on `starlabs-test` (dev env) via a temporary unguarded route (removed): 818 plays all-time, 15 in 90 days; all tabs, filters, drills, insights, compose, CSV — 0 console errors.
Signed out, the name / playlist / series lookups are **permission-denied** (so rows show raw profile ids) — expected to resolve signed in; not yet seen signed in.
Observation: signed out, `content analytics` and the new-user profile map **were readable** on starlabs-test — Firestore rules allow unauthenticated reads there.

## "Watching now" (settled 2026-09-22)
Its own listener over the last 10 minutes, re-subscribed every 5 minutes, keeping rows whose heartbeat is under 45s old (re-checked every 15s) — so it means "now" whatever period is selected, and the count behind the number opens those plays.
Verified by injecting a fake heartbeat into the loader in the browser (no Firestore writes): 5s old → 1; aged to 2 min → 0; with the period set to Aug 1–10 it still read 1.
**Residual:** it compares a server timestamp against the browser clock, so a badly wrong local clock skews it. Offline-queued Solar Voice rows (text dates) are not in this listener.

## Read pattern (CL-9)
| Part of the period | How | Why |
|---|---|---|
| Days before today | `getDocs` once | finished days can't change; a 90-day live listener would hold every doc open |
| Today | `onSnapshot` (live) | the only plays that can still move; heartbeats coalesced to ≤ 1 render / 800ms |
| Legacy string logdates | `getDocs` once | offline-queue uploads, never live |
| Watching now | own listener, last 10 min, re-subscribed every 5 min | independent of the selected period |
| All-time / vs-prev | aggregates, once | no documents downloaded |

Verified on starlabs-test: 7d → 1 listener, 90d → 1 listener, a fully-past range (Aug 1–10) → **0 listeners**, same row counts as the all-live version, no hang on cached ranges.
**Not yet seen:** a play starting while the screen is open (nobody was watching in test) — the live path itself is the same code as before.

## Note on the journey WhatsApp caller (found 2026-09-23)
`ParticipantsAnalyticsComponent.sendWatiMessage()` checks `result == 'success'` while the dialog closes with `{status, archiveid}` — an object never equals that string, so its snackbar and its `sendWhatsAppBroadcast` POST are unreachable. The dialog already sends and archives, so nothing is lost; not copied into the service. Worth a separate clean-up on that screen.

## No smoke test needed on the workshop dashboard
CL-12's extraction was reverted (CL-14): `workshop-dashboard.component.ts` is byte-identical to HEAD again — verified with `diff` against `git show HEAD:…`. Nothing outside Content Analytics changed.
**Not exercised here:** the three composers can only be opened signed in, and a real send is not something to test with. The dialogs themselves are unchanged app components; what is new is only the opening and the follow-up.
Workshop WhatsApp (the chunked workshop-template broadcast) is deliberately **not** offered on this screen — these are journey participants, so WhatsApp goes through WATI.

## Mode tab (CL-16) — what it does and does not claim
| Prototype idea | Real source |
|---|---|
| Product + its mode ladder | `products.product` + `products.modeflow` (falls back to the `modes` catalogue) |
| Current mode / moves in | `participantsproduct.mode`, `.nextmode`, `.nextmodedate` — written by the mode engine (delivery triggers + the daily 00:05 IST cron), so nothing is forecast here |
| Configured content ("shelf") | `product mode config.widgets[].reference` → series / playlists / content docs; a play matches by `videoid` or `playlistid` |
| Event / Queue scope | `participantsproduct.eventref` → `event collection` or `queue generation` |
| Mode at play time | **approximated** by the participant's mode today (operator decision) — the screen says so. Historically correct attribution needs `participant mode checklist` |

### How the Mode tab reads (CL-17)
| Collection | Docs | Read |
|---|---|---|
| `products`, `modes`, `product mode config`, `event collection`, `queue generation` | 104 / 15 / ~500 / 97 / 96 | once, on first visit to the tab, cached |
| `participantsproduct` | **~38,500** | **never whole** — one query per scope: `eventref == <event|queue doc>`, or `productref == <product doc>` |

Why per-scope and not one read: every panel on the tab is about one product (or one event/queue) — `modeVM` filters to a single product immediately — so the whole collection was being downloaded to draw a ladder over a few hundred rows. It froze the browser (operator, 2026-09-23).

Why these two queries: both are single-field equalities, which Firestore indexes automatically. `firestore.indexes.json` has no composite on `participantsproduct`, so combining a scope equality with a `nextmodedate` range would need a new index — deliberately avoided. The over-cap fallback is therefore the range **alone**, filtered to the scope client-side.

Nothing is auto-selected: opening the tab costs zero participant-product reads (CL-18). The operator chose this over defaulting to a first/most-recent event.

The forecast window (7/10/14/30) is normally a client-side filter over the loaded scope; it only becomes a query bound when a scope is over the cap. A cached partial scope is refetched when the window grows past what it covered.

**Not carried over from the prototype:** all-time shelf completion per participant ("Mode content 2/3", "Consumed"), because plays are only loaded for the selected period. The participant table shows plays and watch time in the period instead.
**Verified** with a synthetic dataset injected in the browser (the mode collections are permission-denied signed out): forecast grouping and counts, ladder per modeflow, on-mode share, participant rows, configured-content table with never-played rows highlighted, movers drill. **Not yet seen against real mode data.**

## Recommendation tab (CL-19) — what the data actually supports

Source: **`recommended mix playlist`**. One document per *participant × buffer group × content type*, so a single
push can be three documents sharing a `bufferdocref`; they are merged back together on read.

| Prototype idea | Real source |
|---|---|
| Playlist identity | `bufferdocref.id` (the `buffermix archive` group) |
| Label | `title` |
| Pushed on / closes | `date` / `expiredate` |
| Items | `list[]`, expanded through `series.sequence` and `solar voice playlist.sequence` |
| Items done | **derived from `content analytics` plays**, same `isComplete` rule as the rest of the screen |
| Opened / watch / reach | `content analytics` joined on `videoid` |
| Type chip | the document's `type` (`eiflix` / `solarvoice` / `generalcontent`) |
| Mode, product, cycle | **do not exist** — prototype inventions, dropped |

**Why completion is not read from the documents.** The June audit sampled 100 docs
([specs/evidence/schema_samples.json](../evidence/schema_samples.json)):

| Field | Fill |
|---|---|
| `profileid`, `title`, `bufferdocref`, `date`, `type`, `list[]`, `personalised` | 100% |
| `expiredate` | 20% |
| `completedcontent` | 9% |
| `status` | 4% |
| `completedplaylist` | 3% |

Trusting `completedcontent` would report ~90% of pushes as untouched. The black dashboard's
`status === 'completed'` branch runs on 4% of documents, which is worth knowing before comparing the two
screens. Operator decision 2026-09-23: derive from plays.

**Consequences that are stated on screen, not hidden:**
1. Only 20% of pushes carry an `expiredate`. "Closing soon" and "Closed unfinished" count only those; the note
   prints how many pushes have no close date, and a `nodate` push is never "missed".
2. "Finished" means a play reached the completion bar in the **selected period**. A push completed before the
   period started reads as unfinished — the plays simply aren't loaded.
3. An item pushed under two types shows the first type seen in the content table.

**Verified** with a synthetic push set injected in the browser (the collection is permission-denied signed out):
all four push states (open / closing / closed-unfinished / no-close-date), per-item done/opened/reach, the
playlist ladder, the participant table with its expansion, the content table, and the push drills. **Not yet
seen against real `recommended mix playlist` data.**

## EiFLIX tier tab (CL-20) — what the data actually supports

| Prototype idea | Real source |
|---|---|
| Tiers 1…10, numbered | `tier` — 13 **named** tiers with an `order`. No numbering |
| "Tier 1 opens 4 series, each tier adds 2" | **Invented.** `series.tier[]` lists the tiers allowed to see each series, explicitly (100% filled) |
| A participant's tier | `participant metadata.tier[]` — an **array**, 63% filled |
| Videos in a series | `series.sequence[]` → `episodes` |
| Videos completed, consumed | `content analytics` plays on those episode ids |
| All-time series completed | `participant content analytics.eiflixseries[]` — a rollup keyed by profileid |

**Who is listed** follows the legacy `contentanalytics` screen exactly
([content-analytics.component.ts:379](../../src/app/content/content-analytics/content-analytics.component.ts#L379)):
every `participant metadata` document with a `firebaseuserref`, placed under each tier it holds. Tier counts
therefore sum to more than the headcount, and participants with no tier get their own **Tierless** bucket
(37% of documents have no `tier`).

**Why the tables are period-scoped.** The prototype's note claimed all-time. `content analytics` holds 278,752
documents with `status` filled on 30% ≈ 83,600 completions — not something a browser tab can scan. Operator
decision 2026-09-23: measure the selected period, and make all-time a **drill**. The drill reads exactly one
document (`participant content analytics/{profileid}`), which is the same source the legacy screen batches.

**Three honest states in the all-time panel**, because they are genuinely different:
no rollup document at all (≠ nothing finished) · a rollup listing no series · the list of finished series.

**Cost:** 13 documents (`tier`) on first visit, plus one document per all-time drill. `participant metadata`,
`series` and `episodes` were already loaded for other tabs.

**Verified** with synthetic tier data injected in the browser: a two-tier participant listed under both with the
union of their series, a Gold participant with everything available and nothing watched, a tierless participant
in their own bucket, the overview and series-wise tables, and both all-time panel states. **Not yet seen against
real tier data.**

**Unknown worth checking signed in:** `participant content analytics` is read by exactly one screen, has no
writer in this Angular app, and was not in the June audit — its size, freshness and coverage are unverified.

## One file (CL-21)

`src/app/content/content-analytics-v2/` is now three files: `.ts`, `.html`, `.css`. The old split was a
design-time artefact — `…engine.ts` derived everything from a `CaDataset` so the mock and the real data could
share one view layer. Every tab reads Firestore now, so the seam had nothing on the other side of it.

**What moved in:** the types, the reference maps (`SOURCES`, `REC_TYPE`, `PLATFORM`, `STATUS`, `PUSH_FLAG`,
`BANDS`, `SCOPE_BY`, `KIND_NOUN`, `TIPS`), the pure helpers (`dur`/`durLong`/`pct`/`reachOf`/`isComplete`/
`statusOf`/`dayStart`…), the rollups (`statsFor`, `rollupVideos`, `rollupPeople`, `toPeople`, `pContent`)
and the whole `ContentAnalyticsV2Live` service.

**What was dropped, because nothing filled it.** The live loader never wrote these, so every path that read
them was already dead:

| Dropped | Why |
|---|---|
| `PlayEvent.journey` / `product` / `mode` / `onMode` / `via` / `cycle` / `plLabel` | the loader set them to `''` / `0` / `false` on every row |
| `VIA` + the Via filter + the "How people arrived" insights panel | nothing in `content analytics` records the app surface a play started from |
| `MODES` / `JOURNEY` / `FLAG` + the `tMode` / `tJy` drill branches | prototype key maps; live rows carry a resolved `journeyName`, not a key |
| `ContentAnalyticsEngine` and its mock-only half | mode ladders, push windows and tier maths all came from the seeded dataset |
| `vidsDone` / `vidsMean`, `tMoveIn`, `tPushPill` | orphaned when the mock Mode / Recommendation / tier drills were replaced |

**Verified after the merge** on a fresh tab: all six tabs render, the Playlist / Series column resolves, the
insights modal and the people drill open, and the tier tab renders against injected data. Full `ng build`
clean, zero console errors. One real bug surfaced and was fixed in the process: the template still called
`eng.container(e)`, which `strictTemplates:false` hid — it threw at runtime and blanked the Playlist / Series
column until it was repointed at the resolved `e.cont`.

## Pending
1. **Signed-in check** of `/contentanalytics` (names, playlist/series labels, platform values on real traffic).
2. **Route grant: not needed.** Since the operator repointed `/contentanalytics`, the existing grant applies. But until wiring lands, anyone who opens that screen sees mock data.
3. **e2e coverage before push.** The folder is owned by the `content` suite (`src/app/content/**`). Hooks use the `cav-` prefix and are already literal.
5. **Scope sizes on production.** `SCOPE_CAP` is 3,000; average is ~370 per product (38.5k / 104), but the distribution is skewed — check the biggest products before trusting the un-capped path.
6. **All six tabs are live and the mock is gone** (CL-21).
7. Re-check the June fill rates signed in — `expiredate` / `completedcontent` may have improved since 2026-06-02.
