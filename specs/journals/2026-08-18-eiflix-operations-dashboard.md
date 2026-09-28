# 2026-08-18 — EiFlix Operations Dashboard (first section: New Users)

## What was built
`/eiflixoperationsdashboard` (src/app/New-Workshop/eiflixoperationsdashboard/) —
first section of a dashboard that will grow. Two stat cards over
`new_user_data`:
- **Total New Users** = docs with `movedtoexist !== true` (missing field
  counts as "new" — `!== true`, deliberately NOT `=== false`, because old
  docs never got the field; `movedtoexist: true` is stamped by
  create-watson-profile when a new user is converted).
- **New Users to Paid** = docs with `movedtoexist === true`.

Clicking a card opens a right slide-in panel (460px, full-width ≤640px)
listing that bucket's FULL docs (whole doc kept on each row for future
fields), displaying name / email / phonenumber / created, newest first.

## WHY the key decisions landed
- **Config-driven cards** (`cards: OpsCard[]` + `splitUsers()`): the operator
  said "this dashboard is going to be big … we are going with this format
  only". New cards = one array entry + one bucket rule; grid, counts, panel
  are generic. Future sections should reuse the `--eod-*` tokens in the
  component CSS ("operations ledger" aesthetic: porcelain bg, Geist ink
  type, Geist Mono tabular metrics, indigo=new / emerald=paid accents).
- **One realtime `collectionData` listener, client-side bucketing**: matches
  the operator's "take all → pass entire doc data" requirement and the
  newusersprofile idiom. KNOWN COST: downloads the whole collection per
  visit and re-delivers on every change. When the collection grows, switch
  counts to `getCountFromServer` + lazy per-bucket `getDocs` on panel open
  (careful: Firestore `!=` excludes docs missing the field — the "new"
  bucket cannot be expressed as `where('movedtoexist','!=',true)`).
- **Count-up rAF loops carry a per-card `rafId`** and are cancelled on every
  new emission + destroy — otherwise a realtime update mid-animation can
  freeze a stale count (adversarial review finding, confirmed).
- **Scroll lock is class-based** (`body.eod-scroll-lock` in src/styles.css):
  global `body { overflow: auto !important }` beats inline styles, so
  `document.body.style.overflow = 'hidden'` silently does nothing here.
- **Panel is a real dialog**: cdkTrapFocus + AutoCapture (focus restore to
  the triggering card), Esc + backdrop close, loading/error/empty states.
- Reduced-motion disables Angular animations (`[@.disabled]`), count-up and
  shimmer; muted grays darkened to #6a6f78 for WCAG AA.

## Route / access — PENDING OPERATOR DECISION
`/eiflixoperationsdashboard` in app.routes.ts has **no `canActivate:[authGuard]`**
(a guard I added was reverted from the working tree mid-session — treated as
operator's call). The page lists PII (name/email/phone). BUT: authGuard
requires a roles/profiles entry for the route in the Firestore `dashboard`
(route-config) collection — with the guard but no entry, EVERYONE incl.
admins gets "Contact Admin". Before production: add the route-config entry,
then add the guard. Sibling `newusersprofile` (same PII) is also unguarded.

## State
`ng build --configuration production` green (only pre-existing warnings).
Committed on `nanda-development`, not pushed. Multi-agent review: 10
confirmed findings applied (rAF race, contrast, focus trap, scroll lock,
overflow, loading-vs-empty state, precomputed row labels); full-collection
listener cost accepted for now (above).

---

# Round 2 (same day) — Engagement · Total Watch Hours

## What was built
Engagement section under New Users: big-card grid (2 slots; slot 2 is a
reserved ghost card awaiting the operator's metric). Card 1 "Total Watch
Hours" over `content analytics`:
- Range filter Today | 7D | 30D (segmented, Today default) + manual From/To
  native date pickers in the footer (custom mode, Clear chip returns to
  Today). Bounds = local 00:00:00.000 → 23:59:59.999; operator-specified
  `>` / `<` operators kept.
- Server query = logdate range ONLY (automatic single-field index). The
  `type in ('eiflix','eiflixcontent')` filter runs client-side — a
  server-side `in` would demand a composite (type+logdate) index.
- Card shows Σ totaltimespend/3600 (1 decimal, "h") + unique profileid
  count; clicking the metric opens the shared panel listing each unique
  viewer's FULL profile doc (name/email/phone; no created).
- `engFetchToken` rejects out-of-order range responses.

## Round 2b — operator revisions (same day)
1. **Profile directory preloaded ONCE** (operator decision, aware of the
   ~7k-read cost): `participant metadata` fully loaded into `pmMap` at init;
   `new_user_data` is queried EXACTLY ONCE — the same realtime
   `collectionData` listener feeds both the New Users cards and `nudMap`.
   `resolveProfiles` awaits `pmReady`+`nudReady` then maps synchronously —
   NO Firestore queries on any card click, now or for future cards. The
   earlier chunked `documentId() in` lookup was REPLACED by this.
2. **Source tags**: rows resolved from new_user_data carry a "New User"
   pill next to the name (all panels, every future card too). When an id is
   in BOTH collections, participant metadata is PRIMARY (no tag).
3. **App-bar overlap fixed**: host `.toolbar` (app.component.css) is sticky
   z-index 10 and beats any z-index inside the route's stacking context, so
   the panel/backdrop now anchor BELOW it via
   `--eod-toolbar-h: clamp(40px, 7.4vh, 64px)` — keep IN SYNC with
   `.toolbar`'s height clamp (same pattern as dynamic-studio-v2).
4. **Operator directives**: NO auto-commits (operator commits manually —
   overrides the CLAUDE.md commit rule for this work); journal EVERY change.

## Review findings applied (multi-agent adversarial, rounds 2+2b)
- Viewers panel races: stale `resolveProfiles` could clobber a newer panel →
  identity guard (`this.activePanel !== panel`), not kind-check.
- Retry after clearing a custom date threw OUTSIDE try (formatDate on
  Invalid Date) → permanent skeleton; now falls back to Today + bounds
  computed inside try.
- Error state: metric shows "—" instead of stale numbers under a new range
  label; Retry preserves keyboard focus via #engCard tabindex="-1".
- a11y: aria-pressed on the segmented buttons; single-picked date shows a
  role="status" hint instead of a silent no-op; 16px date inputs ≤640px
  (iOS focus auto-zoom).

## Deliberately NOT done
- No per-range result cache for fetchEngagement (reviewer suggestion):
  preset clicks intentionally refetch = a live refresh on an ops dashboard.
- Composite-index server-side type filter — revisit only if range volumes
  make the client-side filter expensive.

## State
Build green. UNCOMMITTED by operator instruction (manual commits from now
on). Round-2b verification workflow findings: see next entry if any landed.

---

# Round 3 (same day) — shared filter, cohort split, Top Performing Content

## Operator asks
1. Row click in side panel -> console.log the profileid (dev aid, kept
   deliberately; rows made keyboard-activatable role="button").
2. ONE shared Today|7D|30D + From/To filter for the whole Engagement
   section, moved OUT of card 1 into the section header (right end).
3. Card 2 = "Top Performing Content": same range+type filter; per-videoid
   Σ totaltimespend; titles mapped from the `episodes` collection (now a
   THIRD one-time full preload, epMap via loadDirectory()); ranked desc;
   top 10 with Prev/Next paging (operator: "check next 10 like that").
4. Card 1 split by cohort: participant metadata = "Participants",
   new_user_data = "New Users" — hours + unique viewers per cohort, plus an
   "unattributed" note when profileids match neither directory.

## WHY the key decisions landed
- **One snapshot feeds everything**: total hours, cohort split, unique
  viewers AND the content ranking all derive from the single logdate-range
  getDocs — card 2 costs zero extra Firestore reads.
- fetchEngagement awaits pmReady/nudReady/epReady AFTER the getDocs (loads
  run concurrently; classification needs the maps). First paint waits for
  the ~6-7k-doc preloads once; later range switches are query-only.
- Reference mock showed "Long-form/Short" pills — episodes docs have NO
  such field (schema: title/reftitle/duration/date/tags/...), so the pill
  shows the episode `duration` string instead. Mock was dark-themed; kept
  our light ledger system deliberately (layout replicated, not the theme)
  — flip to dark only if the operator asks.
- App-bar findings from round-2b verification applied: rows are real
  keyboard controls; `body.eod-scroll-lock .toolbar { pointer-events:none }`
  keeps the hamburger from stacking the nav drawer over the aria-modal
  panel (toolbar always paints above route content — root stacking context).

## State
Build green. UNCOMMITTED (operator commits manually). Round-3 adversarial
review in flight; confirmed findings will be applied + journaled.

---

# Round 4 (same day) — cohort trend graph + round-3 review fixes

## Trend graph (card 1, mock parity)
Two-series smooth area chart at the bottom of Total Watch Hours — inline
SVG, ZERO packages (operator: no installs without asking). Derived from the
same single 'content analytics' snapshot: hourly buckets for Today, daily
otherwise. Catmull-rom -> cubic bezier paths, gradient area fills,
vector-effect non-scaling-stroke (viewBox is stretched), crosshair +
dark tooltip on hover (dataviz-skill line/area spec), labeled legend.
Colors = the cohort identities already on the tiles (indigo New Users,
emerald Participants) — pair VALIDATED with the dataviz palette script:
all checks pass (CVD ΔE 24.6; tritan 7.1 is in the legal-with-secondary-
encoding band; legend + labeled tiles are that encoding). Mock's pink/
purple not adopted: color follows entity across the dashboard.

## Round-3 review findings applied (4 confirmed)
- 'participant metadata' one-shot -> REALTIME listener (still one query):
  cohort attribution reclassifies live (conversion during an open session
  used to stay 'New Users' until reload); load failure now sets pmFailed →
  visible warning note, and the SDK listener self-heals. episodes stays
  one-shot (titles are low-stakes).
- .eod-tag-violet was dead CSS (base .eod-tag later in source wins the
  tie) → .eod-tag.eod-tag-violet. Duration pill now actually violet.
- Header's compact 12.5px datefield rule out-specified the ≤640px 16px
  guard → iOS zoom-on-focus regression; re-asserted inside the media block.
- Filter clicks jumped the section height: skeletons now mirror loaded
  geometry (10 content rows at real pitch, 2 cohort tiles + trend block).

## State
Build green. UNCOMMITTED (operator commits manually).

---

# Round 5 (same day) — pill removed, wrap instead of ellipsis

- Operator: duration pill on Top Performing Content rows NOT wanted →
  removed (template + ContentRow.tag + violet tag CSS). The pill had shown
  episodes.duration; mock's Long-form/Short doesn't exist in the schema.
- Operator: no "…" truncation → content titles and side-panel name/email
  now WRAP (overflow-wrap: anywhere) instead of ellipsizing. Panel phone
  column keeps its ellipsis (not requested; preserves the side column).
- Build green. Uncommitted.

---

# Round 6 (same day) — Users section rename + Total B!G Participants card

- Section header "New Users" -> "Users" (card titles unchanged).
- 3rd stat card "Total B!G Participants" (violet, groups icon): counts
  participant metadata docs whose `activejourney` (string) is one of
  Qedrk9QWQvlizWLWXemR / lv05Armcn9KpVzt3aWFa / ESgJg1EUYarVj9GAd2md
  (bigJourneyIds set). Fed from the SAME realtime pm listener as the
  profile directory — zero extra queries; count updates live; panel shows
  the full docs (name/email/phone, no tag — they're participants,
  sorted by name). Per-card skeletons now split: big card waits on the pm
  listener (pmLoading), the two new-user cards on the nud listener.
- OpsCard gained emptyText; openPanel uses per-card loading + emptyText.
- Build green. Uncommitted.

---

# Round 7 (same day) — journey names on the B!G Participants card

- The 3 B!G ids are doc ids of the `journey` collection; its `journey`
  field is the display name. loadJourneyNames(): ONE documentId-in query
  for exactly those 3 docs at init (journeyNames map; fallback label
  "Journey N" if a doc/name is missing), then refreshes the card so names
  land even if the pm listener emitted first.
- Card: `breakdown` (new optional OpsCard field, rendered generically) —
  per-journey counts under the caption alongside the overall count.
- Panel: each participant row gets a violet journey-name pill
  (.eod-tag.eod-tag-journey; namewrap now flex-wraps).
- Build green. Uncommitted.

---

# Round 8 (same day) — B!G breakdown restyled as chip stack

- Operator disliked the under-caption breakdown row → per-journey counts
  are now a vertical CHIP stack at the RIGHT END of the card, vertically
  centered against the big total (.eod-count-row flex space-between).
  Chips: violet-tinted pills (accent-aware), mono count + journey name.
  Generic: any future card with `breakdown` renders the same chip stack.
- Build green. Uncommitted.

# Round 8b — review fix
- Round-7 verify workflow (raced the round-8 restyle; its missing-CSS
  finding was already fixed by the chip stack) confirmed one real race:
  loadJourneyNames() rebuilding the B!G card BEFORE the first pm emission
  flipped an open panel to a false "No participants" empty state → now
  gated with if (!pmLoading). Build green. Uncommitted.

# Round 8c — patch-verification correction
- Rounds 7/8 chip CSS had NEVER landed: the python replace anchored on
  `.eod-card-caption { ... color: var(--eod-ink-3, #6a6f78); }` but the
  real block reads `color: var(--eod-ink-3);` → silent no-op ("css
  patched" was printed unconditionally). The verify workflow's
  missing-CSS finding was CORRECT, not stale. Re-inserted with an
  asserted anchor + grep verification (6 hits). LESSON for future
  rounds: every sed/python patch must be followed by a grep for the
  inserted selector — never trust the patch script's own echo.
- Verified present on disk: .eod-tag.eod-tag-journey (472),
  namewrap flex-wrap (782), template chips, pmLoading race guard (ts:309).
- Build green. Uncommitted.

---

# Round 9 (same day) — cohort panels, 🔥 Hot Leads Today, expandable rows

- Cohort tiles (New Users / Participants) in Total Watch Hours are now
  BUTTONS: each opens the shared panel scoped to that cohort's viewer ids
  (openViewersPanel('nud'|'pm'|'all'); open panel keeps its scope across
  range changes via cardKey). Rows show per-viewer watch hours
  (withStats/hoursLabel from the new engProfileStats map).
- 🔥 Hot Leads Today section (after Engagement): NO new query — when a
  Today fetch completes, its per-profile stats snapshot into hotStats/
  hotLeadIds (>3h totaltimespend, strict >). The snapshot is FROZEN while
  the operator explores 7D/30D/custom (operator: "same [today query]
  assign to a new variable"). Full-width rose banner (count, label,
  hover arrow, rose top border); disabled until first today fetch lands.
- Hot leads panel: rows sorted by watch hours desc, each row expandable
  (click/Enter/Space; aria-expanded; chevron rotates) to the videoid list
  that profile watched today — titles via epMap, per-video hours,
  sorted desc. Row template refactored: .eod-row-line (flex) inside
  block .eod-row + .eod-row-videos expansion.
- Patch discipline: all python patches now assert anchors + grep-verify
  (caught two silent misses this round before they shipped).
- Build green. Uncommitted.

---

# Round 10 (same day) — reusable dialog service + hot-leads settings

- NEW shared dialog infrastructure (operator: "dialog like a service, for
  other purposes also"): eod-dialog/ inside the dashboard folder —
  EodDialogService.open(config) -> Promise<values|undefined> wrapping
  MatDialog, and config-driven EodDialogComponent (typed fields:
  number/date/text, min/step/required validation, accent theming, ledger
  styling). Future dashboard dialogs = one service call, no new components.
  Global .eod-dialog-panel radius rules appended to styles.css.
- Hot Leads gained a Configure button (section head): dialog edits the
  threshold (default 3h, min 0.25) and From/To dates (default today).
  State machine: today + threshold-only change -> recompute from the
  existing hotStats, ZERO queries; range change -> dedicated
  fetchHotLeads() (own token, same logdate-range + client type filter);
  hotMode='custom' FREEZES the engagement Today snapshot path so the two
  writers never fight. Card title/sub, panel caption and empty text follow
  the settings; error state shows retry (retryHot picks the right fetch).
- Also fixed from stopped round-9 review's anticipated issue: a failed
  FIRST today fetch now surfaces on the hot card (error + retry) instead
  of an eternal skeleton.
- Round-9 review workflow was stopped (previous process exit) — its scope
  is folded into the round-10 review (running).
- Build green. Uncommitted.

# Round 10b — review fixes (7 confirmed, round-10 workflow)
- HIGH: first Today fetch superseded by a range switch left the hot card
  on a DISABLED skeleton forever → the surviving fetch now recovers via
  fetchHotLeads(), both success and catch paths (gated on hotFetchToken
  unchanged so a newer dedicated fetch is never duplicated/overwritten).
- hotStats had two uncoordinated writers in today mode → engagement's
  snapshot write now requires hotFetchToken === value at fetch start.
- todayStr was frozen at construction → getter (post-midnight Configure
  no longer misclassifies ranges; [max] on pickers follows the real day).
- retryHot (today/today path) now sets hotLoading immediately — no more
  clickable error card firing duplicate full fetches.
- Dialog: cross-field validate() hook in EodDialogConfig (+ inline error
  row, blocks submit) — hot settings uses it for From>To (and normalizes
  order on store); date fields accept string min/max (pickers capped at
  today); MatDialog maxHeight 90vh so short/landscape viewports scroll
  instead of clipping.
- Non-Active Users: design-only round delivered (register/rollup Phase 1
  + lastwatched Phase 2, diagram via widget). AWAITING operator answers:
  exclusive vs cumulative buckets; permission for 'eiflix ops rollups'
  collection. NOT coded yet.
- Build green. Uncommitted.

---

# Round 11 (2026-08-19) — Non-Active Users built (register from TODAY only)

- Operator decisions: collection named `eiflixdailywatchers` (rules added
  by operator); page shape {profileids: {id: seconds}, builtAt}; NO
  90-day backfill — register accumulates from first run; `participant
  metadata` has NO created/join field (age guard only for new_user_data
  via `created`; participants always age-eligible).
- Implementation: loadNaRegister() = ONE documentId-range query over the
  register window (only existing pages returned). Today's page is derived
  from the SAME Today engagement snapshot (writeTodayRegisterPage —
  zero extra reads, fire-and-forget setDoc + local map update).
  healRegisterGaps(): rebuilds missing/partial pages max 7 days back,
  never before naRegisterSince (respects no-backfill), one day-query
  each; a page is "final" when builtAt > that day's end.
- Buckets: exclusive bands 30–60 / 60–90 / 90+ days since last register
  appearance (never-seen counts as "since tracking began"); pm primary
  over nud; nud age guard (created < band.days → excluded as too new).
  Cards UNLOCK with coverage: locked state shows "Unlocks <date> · day N
  of 30" (dashed card, lock_clock); unlocked = standard stat card with
  New Users/Participants chip split (amber/orange/red severity ramp).
  Panel rows show "Last seen <date>" (or "Not seen since tracking
  began"), sorted most-recently-lapsed first.
- Capacity documented for operator: ~20k profiles/day-doc default
  (40k index-entry limit), ~30k with an index exemption; their worst
  case ~8k → safe.
- Build green. Uncommitted.

# Round 11b (2026-08-19) — backfill script + unlock UI removed
- Operator pivoted AGAIN on backfill: now wants history, but via a MANUAL
  Node script they run themselves (not the dashboard). Created
  /Users/nanda/Documents/Development/script/backfillEiflixDailyWatchers.js
  (follows migrateEiflixVideos.js conventions: firebase-admin +
  serviceAccountKeyProduction, doc-header run instructions, DRY_RUN flag).
  90 days -> yesterday, one register page per local day, idempotent
  (skips pages with builtAt > day end), writes ONLY eiflixdailywatchers.
  NOTE: CLAUDE.md says production service account read-only — operator
  explicitly requested this write script (new collection only, no PII).
- Dashboard: unlock/coverage UI removed (locked cards, "Tracking since",
  unlockDay/progressLabel fields + CSS) — cards always render; before the
  script runs they legitimately show ~0. computeNonActive gating dropped;
  healRegisterGaps + today-page write unchanged.
- Build green. Uncommitted. Verify workflow launched.

# Round 11c — backfill-round review fixes (2 confirmed)
- HIGH: post-backfill, never-watcher NEW USERS aged 30-89d fell through
  EVERY bucket (age gate rejected na-3m, band ranges rejected na-1m/2m)
  while a peer who watched once at signup counted in na-1m → never-seen
  daysSince is now capped at account age (Math.min(coverageDays, ageDays));
  pm profiles (no created field) unchanged.
- computeNonActive raced the directory listeners (buckets computed over
  EMPTY pmMap/nudMap → healthy-looking zero cards, corrected only by a
  successful Today fetch) → loadNaRegister now awaits pmReady+nudReady
  (token-guarded), and BOTH realtime listeners re-run computeNonActive
  when !naLoading so buckets/chips stay live on conversions.
- Build green. Uncommitted.

# Round 12 (2026-08-19) — Non-Active full-width bands + scoped clicks
- OPERATOR DIRECTIVE (permanent, in memory too): NEVER touch
  /Users/nanda/Documents/Development/script again. This round changed
  ONLY the dashboard component.
- Non-Active cards: 3-column grid -> full-width stacked BANDS (.eod-nacard,
  hotcard-style: accent top border, accent-colored big count left, title/
  caption, cohort chips right, hover arrow; skeleton bands while loading).
- THREE click targets per band: whole card (role=button + Enter/Space) ->
  full bucket panel; "New Users" chip button -> nud-only panel;
  "Participants" chip button -> pm-only panel (chips stopPropagation).
  openNonActivePanel(bucket, scope) filters bucket.ids (entries now carry
  isNud); panel title gets "· New Users"/"· Participants" suffix; cardKey
  = "<bucket>:<scope>" so recomputes reopen the SAME scope.
- Build green. Uncommitted.

# Round 12 (2026-08-19) — Non-Active full-width bands + cohort clicks
- Script directory: OPERATOR DIRECTIVE — hands-off (memory saved);
  the Device Breakdown script function is designed (explanation
  delivered: additive `platforms` map per register page, platform_name
  normalization Eiflixweb/EiflixMobile/missing->breakthroughsapp,
  v2 function in same file run as `node ... platforms`) but NOT written —
  awaiting operator "write the script" + layout pick (4-in-row vs bands)
  + metric pick (watch-time% vs viewer%).
- Non-Active Users: the 3 cards are now FULL-WIDTH stacked bands
  (.eod-na-list/.eod-nacard, hot-leads-style: accent top border, colored
  count left, title/caption, chips right, hover arrow). THREE click
  targets per band: whole card -> full bucket panel; "New Users" chip ->
  nud-only; "Participants" chip -> pm-only (chips are real buttons with
  stopPropagation; card is role=button with Enter/Space). Panel titles
  suffix "· New Users"/"· Participants"; cardKey carries bucket:scope so
  realtime recomputes reopen the SAME scope. bucket.ids entries now carry
  isNud (set at assign time).
- NOTE: bash heredoc patches executed twice this round (env quirk);
  first pass applied, second pass tracebacked on already-replaced
  anchors — verify greps confirmed final state; build green.
- Uncommitted (operator commits manually).

# Round 13 (2026-08-19) — v2 backfill script: exact-case platforms
- Operator authorized script work in backfillEiflixDailyWatchers.js
  (explicit exception to the hands-off rule; ONLY this file touched).
- v2 = DEFAULT mode (`node backfillEiflixDailyWatchers.js`); old
  profileids-only pass kept behind `v1` arg. v2 writes per day:
  { profileids, platforms: { '<platform_name EXACT, case-sensitive>':
  {pid: seconds} }, builtAt }. Rules: missing/empty platform_name ->
  'breakthroughsapp'; outer-whitespace trim ONLY (case preserved);
  '.'/'/' replaced with '_' (Firestore field-name limits) with a
  once-per-value console warning. Skips days already final WITH
  platforms; v1-built pages (no platforms) re-queried once and
  rewritten complete. Run summary prints a PLATFORM INVENTORY (exact
  names + hours + watcher counts) so the operator can pick display
  names for the dashboard round.
- Dashboard round still pending operator input: display-name mapping
  (after they see the inventory), layout (4-in-row vs bands+separate),
  metric (watch-time% vs viewer%). Dashboard today-write/heal will gain
  platforms in that round.

# Round 14 (2026-08-19) — Device Breakdown card
- Display mapping (operator): Eiflixweb -> "EiFlix Web",
  breakthroughsapp -> "Breakthroughs App", ANY other key shown EXACTLY
  as stored (platformLabel()). Script untouched this round.
- New "Device Breakdown" section (after Non-Active): SVG donut (circle
  pathLength=100 technique, rotate -90, pctExact dasharray + cumulative
  dashoffset) + center top-platform %, legend rows (dot, name, bar,
  hours, %) — mock layout in our light ledger. 1M|2M|3M segmented filter
  (30-day months) recomputes from naPages IN MEMORY — zero queries.
- Metric = share of WATCH TIME (recommended; operator never objected).
- Colors validated (dataviz script): Eiflixweb #4753e6 indigo,
  EiflixMobile #a35d04 amber, breakthroughsapp #0c8a5f emerald — all
  checks pass; unknown platforms hash onto 4 extras (legend rows are the
  secondary encoding).
- Dashboard now CAPTURES platforms itself: engagement Today fetch
  accumulates per-platform per-profile seconds -> writeTodayRegisterPage
  persists {profileids, platforms, builtAt}; heal's buildRegisterPage
  does the same. platformKey() mirrors the script's normalization
  (exact case, trim, missing->breakthroughsapp, ./ -> _).
- Empty state hints "run the platforms backfill script" when pages lack
  platform data. Build green. Uncommitted. Review workflow launched.

# Round 15 (2026-08-19) — Non-Active back to 3-in-a-row (full width)
- Operator: bands were a MISREAD of "full width" — they wanted the
  ORIGINAL 3 stat cards side-by-side in ONE row spanning the full
  container width (the old auto-fill grid left an empty 4th column).
  Now: .eod-na-grid = repeat(3, minmax(0,1fr)), 1 column ≤640px.
- Cards restored to the vertical stat-card anatomy (chip icon, label,
  count + cohort chips, caption) but keep ALL THREE click targets:
  whole card (article role=button, Enter/Space) -> full bucket;
  New Users / Participants chips (buttons, stopPropagation) -> scoped.
- IMPORTANT discovery: the band CSS on disk had been EDITED OUTSIDE the
  session (classes renamed, e.g. .eod-cohortbtn) — the operator/format
  tool hand-tweaks this file. Anchored patches MUST re-read the file
  immediately before patching; orphaned band styles + their mobile
  rules were removed with the swap.
- Build green. Uncommitted.

# Round 16 (2026-08-19) — Device Breakdown platform panels
- Legend rows are now buttons: click a platform -> shared side panel
  listing that platform's viewers over the selected 1M/2M/3M window
  (per-profile seconds summed from naPages.platforms in memory — zero
  queries), rows show per-viewer hours on that platform, sorted desc;
  full docs as always (pm primary, New User tags). Panel kind
  'platform', accents: Eiflixweb=indigo, EiflixMobile=amber,
  breakthroughsapp=emerald, unknown=violet. Range switch while open
  refreshes the panel in place (setDbRange hook).
- Build green. Uncommitted.

# Round 16b — device-breakdown review fixes (3 confirmed)
- Heal now upgrades final v1 pages LACKING platforms in its 7-day window
  (skip requires page && final && page.platforms — mirrors script v2);
  before, pre-platform pages silently biased the 1M/2M/3M shares (days
  dropped from numerator AND denominator, no UI hint).
- SECURITY: client-writable platform_name/profileid could be '__proto__'
  -> REPRODUCED Object.prototype pollution via
  platforms[key][pid]=seconds, plus silent platform drop and Firestore
  write rejection (__x__ field names forbidden). Fixed: platformKey
  prefixes reserved/dunder names with 'x_'; isValidProfileId() rejects
  dunder pids in BOTH accumulation loops; all record accumulators are
  Object.create(null). NOTE: the backfill script has the same exposure
  (platforms[safe][pid]) — script dir is hands-off; flagged to operator.
- Donut center label: 2-line clamp + title tooltip (long unknown
  platform names spilled out of the hole).
- Build green. Uncommitted.

# Round 17 (2026-08-19) — UI/UX refresh: DESIGN MOCK ONLY (no code)
- Operator: shimmer looks bad; wants a full UI/UX pass with side-panel
  search (name/email/phone) + cohort filter (new users vs existing) +
  sort; design-first, confirm, then implement.
- Delivered interactive HTML mock (scratchpad eod-redesign-mock.html,
  sent rendered): (1) Panel v2 — sticky glass toolbar: search with match
  HIGHLIGHTING + clear, All/New Users/Participants segmented filter,
  context-aware sort menu (Name/Newest/Hours), "N of M shown" meta,
  search empty-state; (2) shimmer system — skeletons mirror the exact
  real anatomy (ghost chip/label/number/caption, ghost donut ring +
  legend, ghost rows), ONE shared 1.5s light-sweep, reduced-motion off,
  no layout jump; (3) polish notes (one toolbar component reused across
  all 5 panel kinds, pre-selected cohort when panel opened scoped, sort
  options follow available fields).
- AWAITING operator confirmation/changes before any dashboard code.

# Round 17b — FULL-dashboard UI mock (operator: "entire UI, not only panel")
- Rebuilt the mock as the COMPLETE page (eod-full-ui-mock.html, sent
  rendered): header, Users (3 cards incl. B!G chips), Engagement (seg +
  date filters, watch-hours card w/ cohort tiles + trend SVG, top
  content + pager), Hot Leads banner, Non-Active 3-in-row w/ cohort
  chips, Device Breakdown donut+legend. Any card click opens the v2
  panel (live search w/ highlight, All/New Users/Participants filter,
  sort button). "Preview loading" toggle flips the ENTIRE page into the
  new mirrored-ghost shimmer so the operator judges it in context.
- Still design-only; awaiting confirm/changes.

# Round 18 (2026-08-19) — INCIDENT: component TS truncated; fully restored
- ROOT CAUSE: a python patch script assigned None to its content variable
  (a stray `if False else None`), then called open(path,'w').write(None) —
  open('w') TRUNCATES BEFORE write raises, leaving the file 0 bytes. The
  dev server rebuilt from the empty file (esbuild bundles without type
  checks), so the page went blank ("stucked") for the operator.
- Recovery: no VS Code local history for the file, no usable APFS
  snapshot, dev-server chunks already rebuilt → RECONSTRUCTED the full
  component (1,534 lines) from the session's complete patch history,
  validated against the intact template's bindings (extracted method/
  property checklist), plus the panel-v2 logic layer and the operator's
  new mapping eiflixapp -> 'EiFlix App'. Production build: 0 errors.
- NEW WRITE DISCIPLINE (binding for every future round): (1) never
  open(path,'w') directly — write to a temp file and os.replace/mv;
  (2) every patch script ends with an explicit content sanity check;
  (3) cp the target to scratchpad before multi-step patch batches.
- The approved UI/UX implementation (panel toolbar template + shimmer
  CSS) continues next — TS side is already in place (setPanelRows/
  updatePanelView/onPanelSearch/setPanelCohort/setPanelSort + viewRows).

# Round 18b (2026-08-19) — approved UI/UX implemented (operator confirmed)
- Operator confirmed the full-dashboard mock -> implemented for real:
- PANEL V2 (all five panel kinds): sticky glass toolbar under the header —
  search across name/email/phonenumber (precomputed highlight segments,
  <mark> on the matched part, clear button, search-aware empty state with
  its own Clear action), cohort filter All/New Users/Participants (shown
  only when rows are mixed — showCohort), sort menu Default/Name A–Z/
  Watch hours (hours offered only when rows carry hoursSeconds),
  "N of M shown" meta; rows render p.viewRows; header count follows the
  filter. All row writes routed through setPanelRows().
- SHIMMER V2: .eod-skeleton = light-sweep overlay (eod-sweep 1.5s,
  reduced-motion off) + eod-gh-* ghost anatomies that mirror the exact
  real layout (stat card chip/label/num/cap, hot banner bignum+lines,
  donut ring+legend, panel avatar rows) — replaces every blob skeleton;
  no layout jump on load.
- All writes used the new temp-file + os.replace discipline; build green
  (0 errors). Review workflow launched. Uncommitted.

# Round 18c — panel-v2 review fixes (9 confirmed)
- HIGH splitMatch crashed on numeric phonenumber (TypeError froze search
  mid-keystroke) -> String() coercion inside splitMatch.
- HIGH users-card ghost duplicated the real chip/label/caption during
  load -> loading branch now ghosts ONLY the count slot.
- Hot-lead row expansion made during a search was lost on the next view
  rebuild (viewRows are spread copies) -> onRowClick(panel, row) syncs
  expanded to the backing row in panel.rows.
- Realtime emissions / range switches re-CREATED open panels (search/
  cohort/sort wiped, ghost flash) -> all four refresh paths (viewers,
  hot leads, non-active, platform) now swap rows IN PLACE via extracted
  row builders + setPanelRows on the existing panel; captions update,
  toolbar state survives.
- Meta line no longer shows "0 of 0" during load (settled-only) and no
  longer announces every keystroke (role=status dropped).
- Escape now closes the sort menu first, panel second.
- Reduced-motion covers the hot banner entrance; @media (pointer:coarse)
  gives 16px inputs on all touch widths (iPad focus zoom).
- Build green. Uncommitted.

# Round 19 (2026-08-19) — Non-Active eligibility rule (operator)
- Counts were inflated (e.g. 2,864 in 3+ months) because EVERY participant
  metadata doc entered the bucket universe. Operator rule applied in
  computeNonActive's pm loop only: participants count ONLY when
  customerstatus == 'active' (trimmed, case-insensitive) AND
  firebaseuserref has a value (non-empty string, or any non-null object
  e.g. a document reference). isEligibleParticipant() — cancelled
  customers / profiles without app accounts are not "inactive", they
  were never expected to watch. new_user_data loop unchanged; engagement
  cohort splits deliberately untouched (rule scoped to Non-Active).
- Panels refresh in place via the realtime pm listener -> counts and
  open panels correct themselves live. Build green. Uncommitted.

# Round 20 (2026-08-19) — journeys everywhere + paid card re-sourced
- `journey` collection now loaded WHOLE at init (was: only the 3 B!G
  docs) — journeyTagFor(pmDoc) puts the journey-name pill on every
  participant row in EVERY panel (viewers, hot leads, non-active,
  platform) via resolveProfiles.
- Panel toolbar gained a JOURNEY FILTER (operator asked for mat select
  explicitly — MatSelectModule imported; outline appearance restyled to
  the ledger via .eod-pjourney ::ng-deep overrides): options = distinct
  journey names in the panel's rows, 'All journeys' default, applied
  between cohort and search in updatePanelView; hidden when no rows
  carry journeys (e.g. Total New Users panel).
- 'New Users to Paid' re-sourced (operator): ids still = new_user_data
  movedtoexist==true, but rows show the participant metadata twin doc
  (same doc id across collections for converted users) with journeyTag;
  nud fallback (with New User tag) only while pm missing.
  rebuildPaidCard() called from nud listener, pm listener, and journey
  load. Total New Users unchanged (nud-only, no journeys). B!G panel
  gets the filter via the same generic journeyOptions.
- Build green. Uncommitted. Review workflow launched.

# Round 21 (2026-08-19) — Excel export in every side panel
- Export button in the panel toolbar (next to Sort; disabled while
  loading/error/empty). Exports p.viewRows — i.e. WITH the active
  search/cohort/journey filters and sort applied (operator requirement).
- Columns: Name, Phone Number, Email, Journey, User Type (New User /
  Existing / Unknown) always; extras only when that panel displays them:
  Watch Hours (numeric, 2dp), Videos Watched (hot leads), Last Seen
  (non-active), Created (users panels); Profile ID last.
- Uses the codebase's existing SheetJS idiom (xlsx@0.18.5 already a
  dependency — sales-dashboard pattern: book_new/aoa_to_sheet/!cols
  autowidth/writeFile). No new packages. Filename: <panel-title-slug>-
  <yyyy-MM-dd>.xlsx; sheet name = sanitized panel title.
- Build green. Uncommitted.

# Round 22 (2026-08-19) — export tweak + journey-review fixes
- Export: Profile ID column REMOVED (operator). Columns now: Name, Phone
  Number, Email, Journey, User Type (+ Watch Hours / Videos Watched /
  Last Seen / Created when the panel shows them).
- Journey-round review fixes (3 unique confirmed): Escape while the
  journey mat-select dropdown was open closed the WHOLE panel (MatSelect
  preventDefaults but does not stopPropagation) -> onEscape now bails on
  event.defaultPrevented; paid-card rows sorted on pm `created` (often
  missing — some pm writers never set it) while the label fell back to
  nud.created -> row now materializes created: src.created ?? nud.created
  so sort, label and export agree; journey field outline corner radius
  now uses --mdc-outlined-text-field-container-shape: 12px.

═══════════════════════════════════════════════════════════════════
# CONSOLIDATED RECAP — the EiFlix Operations Dashboard as of 2026-08-19
═══════════════════════════════════════════════════════════════════

## What exists (route /eiflixoperationsdashboard, one standalone component)
1. USERS section — 3 stat cards, full-width row:
   · Total New Users: new_user_data, movedtoexist !== true. No journeys.
   · New Users to Paid: ids = new_user_data movedtoexist === true; rows
     show the participant-metadata twin (journey pill) w/ nud fallback.
   · Total B!G Participants: pm docs whose activejourney ∈ 3 B!G ids;
     per-journey chip stack on the card.
2. ENGAGEMENT — ONE shared filter (Today|7D|30D + From/To) in the
   section head drives BOTH cards from ONE range query:
   · Total Watch Hours: big metric + unique viewers (panel), cohort
     tiles New Users/Participants (clickable, scoped panels), 2-series
     smooth SVG trend (hourly Today, daily otherwise, hover tooltip).
   · Top Performing Content: per-videoid Σ seconds, titles from the
     episodes directory, top-10 with Prev/Next pager.
3. 🔥 HOT LEADS — default: today's fetch snapshot, frozen vs the filter;
   Configure dialog (shared EodDialogService) edits threshold (>3h
   default) + custom date range (dedicated fetch, token-coordinated);
   panel rows expandable to per-video watch lists.
4. NON-ACTIVE USERS — 3 cards (30-60/60-90/90+ days), cohort chip
   clicks + whole-card click; ELIGIBILITY: participants only when
   customerstatus=='active' AND firebaseuserref non-empty; nud age guard
   via created (inactivity capped at account age); last-seen from the
   eiflixdailywatchers register.
5. DEVICE BREAKDOWN — donut + legend from register `platforms` maps,
   1M|2M|3M, display names Eiflixweb->EiFlix Web, eiflixapp->EiFlix App,
   breakthroughsapp->Breakthroughs App, others exact; platform panels.

## Shared infrastructure
- Directories loaded once: new_user_data (realtime), participant
  metadata (realtime), episodes (one-shot), journey (one-shot, WHOLE
  collection). Panels resolve entirely in memory — zero per-click reads.
- eiflixdailywatchers register: one page/day {profileids, platforms,
  builtAt}; today written from the Today fetch, ≤7-day self-heal, no
  in-dashboard historical backfill (operator script, hands-off dir).
- ONE side panel serves 6 kinds; v2 toolbar: search (name/email/phone,
  highlight), cohort filter, journey mat-select filter, sort menu,
  "N of M shown", filtered Excel EXPORT (SheetJS, no Profile ID);
  in-place refreshes preserve toolbar state; cdkTrapFocus; Escape
  layering (dropdown -> sort menu -> panel).
- Ghost-anatomy shimmer (1.5s light sweep, reduced-motion aware).
- Shared EodDialogService + config-driven EodDialogComponent.
- Hardening: prototype-pollution guards (null-proto accumulators,
  reserved-name checks), token guards on every async writer, midnight-
  safe todayStr getter, WCAG AA muted grays, iOS zoom-proof inputs.

## Standing operator rules
- Manual commits ONLY; journal EVERY round; script dir hands-off
  (exception only when operator explicitly directs); no packages
  without asking; ATC data off-limits (CLAUDE.md).

## Pending / known
- Route unguarded (needs dashboard route-config entry BEFORE authGuard);
  PII on screen — pre-production requirement.
- Operator to run backfillEiflixDailyWatchers.js v2 for 90-day history
  (and to patch its __proto__ exposure or authorize the fix).
- Non-Active "never watched" vs ">90d lapsed" indistinguishable until
  the register ages past 90 days (or Phase-2 lastwatched lands).
