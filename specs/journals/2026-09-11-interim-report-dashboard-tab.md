# 2026-09-11 — Interim Report Dashboard tab (interimreportlog)

## What changed
Route `/interimreportlog` → `InterimReportLogComponent` (`src/app/AppEngagement/interim-report-log/`).

| File | Change |
|---|---|
| `interim-report-log.component.html` | Removed the `Participant Form Tracker` header block; added 4th tab **Interim Report Dashboard** (lazy `<ng-template matTabContent>`) |
| `interim-report-log.component.css` | Removed now-unused `.header` / `.heading` rules |
| `interim-report-log.component.ts` | Imported `InterimReportDashboardComponent` |
| `interim-report-dashboard/` (new) | `.component.ts/.html/.css` + `interim-report-dashboard.script.ts` — extracted from the operator's design file `interim-report-dashboard (8).html` |

## Why it is built this way
- **`ViewEncapsulation.ShadowDom`** — the design's CSS is written for a whole page (`*{margin:0;padding:0}`, `body{…}`, short generic classes `.f .st .send .sec .ov .mo .pill`). With emulated encapsulation those collide with app/Material styles, and the script builds almost all DOM via `innerHTML`, which never gets `_ngcontent` attributes, so emulated styles would not apply to it at all. Shadow DOM fixes both. Consequence: `:root` → `:host`, `body` → `.stage`.
  - Note: Angular copies every other component's registered styles into each shadow root (≈30 `<style>` tags seen). Checked computed styles of `.stage .f .st .sec .cell .vswitch .mx` against the design — all match, no leakage today. If a future global/`::ng-deep` rule uses one of these class names, this is where to look.
- **Design's own top bar dropped** ("STARLABS | Interim Report Dashboard" + mock profile) — it duplicates the app's toolbar inside a tab.
- **Script ported verbatim (`// @ts-nocheck`)** — only `document.*` lookups/listeners re-scoped to the shadow root. It is seeded mock data (4 sends, generated members) — **not wired to Firestore**; tags/replies/logs live in memory only.
- **Lazy tab content + `afterNextRender`** — app prerenders `**` (`app.routes.server.ts`); the script must only run in the browser.
- **Tab index 3** is ignored by `onTabChange` (cases 0–2) and the `activeTab < 2` filter checks, so no Firestore fetch/filters trigger on it.

## What went wrong along the way
- First pass used the wrong design file (`interim-report (15).html`, the participant phone app). Replaced.
- Operator saw a **blank tab**: the dev server was serving a stale bundle that had the tab label but not the component (host element empty, no shadow root, 0px tall). Cause: the component `.ts` was written a moment before its `templateUrl` file existed, the rebuild failed, and the watcher never recovered. Touching the `.ts` files forced a clean rebuild. Same failure family as the known "silent build fail → stale dev bundle" gotcha.

## Verification
- `tsc -p tsconfig.app.json --noEmit`: no errors in these files; lazy chunk contains `InterimReportDashboardComponent` (encapsulation 3 = ShadowDom).
- Real app (logged-in Chrome, 4200): tab renders (KPI strip, 4 step sections, filters), no console errors, header gone; count → member modal opens/closes (Esc), "By participant" view renders.

## Revert guide (this screen)
- Title only: re-add `<div class="header"><h2 class="heading">Participant Form Tracker</h2></div>` under `.mainscreen` and the two CSS rules.
- Dashboard tab: delete the 4th `<mat-tab>`, the import + `imports[]` entry in the `.ts`, and the `interim-report-dashboard/` folder.
- 2026-09-15 tagging / notes / month default / wording (see section below): revert the dashboard folder to commit `6cbc736f`, drop `[profileId]="loggedInProfileId"` from the parent template, and delete the "Interim Report Dashboard date picker" block at the end of `src/styles.css`.

## Later same day — real data: summary strip + Crossover Meter
Plan: `specs/plans/2026-09-11-interim-dashboard-crossover.md` (operator-approved).
- Component loads `interimreport log` (createdon in range, same as the Log tab) + latest `interim crossover` per log (`interimlogid in`, chunks of 30). Names come from the Log tab's `mapProfiles` via `[profiles]` — no second `profile_data` read.
- Operator rules: Ongoing = not completed and `reports.length > 0`; area **changed = metric ≥ 8**; band 0 = null or 0. Journey/Event dropdowns stay visible but do not filter real data (no source yet).
- Life areas are the real keys (Business, Career, Family, Health, Personal Genius), exported once as `CROSSOVER_AREAS`.
- "Moved to" shows level names only — `accelerated evolution level` has no order/number field, so L1–L11 cannot be derived.
- Studio-validation crossover docs (no `interimlogid`) are excluded by design.
- Members are **logs**, not people: a participant with several logs in the range appears several times (same as the Log tab counters). Seen in Sep 2026 data.
- Verified (logged-in Chrome, 1–30 Sep 2026): strip 55 / 47 / 4 / 4 = Log tab counters exactly; every matrix row sums to 55; buckets total 43 (47 submitted − 4 skipped/no AEL); drill-downs (cell, ongoing strip, areas-changed row, moved-to) open with names, goals and level names; no console errors.
- Revert: `git checkout` the three files, or revert the component to the no-Firestore version (mount without `api`) and drop `[profiles]`.

## Date filter → one Material date range picker
- Operator asked for a single range picker instead of the design's two `<input type="date">` boxes. Used the same Material `mat-date-range-input` + `mat-date-range-picker` as the Log tab, inside the design's DATE pill (kept at 34px).
- Why Material works inside the Shadow DOM: the prebuilt themes (`azure-blue`, `indigo-pink`) emit their tokens on `html`, and custom properties inherit into shadow roots; Material component styles are copied into the shadow root by Angular; the calendar popup renders in the body's cdk overlay container (global styles). DateAdapter comes from `provideNativeDateAdapter()` in `app.config.ts`.
- The component owns the range (`FormGroup` start/end, default last 12 months) and calls `refresh()` once both ends are set; the script reads it via `api.getRange()`; Clear calls `api.resetRange()`.
- Verified: default 11 Sep 2025 – 11 Sep 2026 → 661 / 605 / 14 / 42; Sep 2026 → 55 / 47 / 4 / 4 (= Log tab); popup opens with range highlight; no console errors.
- Gotcha while testing: after a fresh load the app's auth guard took ~40 s before the route rendered — an empty page right after load is not a build failure.

## Dialogs centred on screen (native `<dialog>` + showModal)
- Symptom (operator screenshot): the member-list dialog opened at the top of the dashboard with its title under the app toolbar.
- Root cause: `.mat-mdc-tab-body-content` carries a CSS `transform`, which makes it the containing block for `position:fixed` — the `.ov` overlay was fixed to the tab body, not the viewport, and scrolled with the dashboard (`:host` is the scroller).
- Fix: `#ov` (member lists) and `#lg` (new coach log) are native `<dialog>`s opened with `showModal()`. The top layer escapes the transform and every stacking context, so they centre on the whole screen above the toolbar. A MutationObserver keeps `dialog.open` in step with the script's existing `show` class toggling (no other script changes); the dialog `cancel` event is prevented so Esc stays with the script's keydown handler (which also resets the log form). UA dialog box reset in CSS; `.mo{ margin:auto }` so tall dialogs scroll instead of clipping.
- Verified: dashboard scrolled 600px → dialog `:modal`, 135px above / 135px below in a 959px viewport; Esc closes; reopens.
- **Jumped from** (operator ask): the crossover cell dialog gets a `Jumped from` column (`metric[area].jumpedfrom`, "—" if no jump; component keeps it as `member.jumped[area]`). Level-change dialogs' `Before / After` headers renamed `Jumped from / Jumped to` (same data). Verified on starlabs-test: Business 8–10 → Ragavendhiran Sankar, 10, goal Evolving Excellence → Greater Legendary, jumped from Taste of Legendary.
- **By participant** now reads the real pool (row per interim report: name + sent date, real crossover levels, real status). Evolution / Love letter / Asks columns and detail sections show only done / not done from `reports` — no mock detail next to real rows. Detail section 1 shows per-area score, goal and "↑ Jumped from", or why there is no crossover.
- **Not started members are left out of every section** (operator rule): `sectionPool()` = ongoing or submitted. Applies to the Crossover matrix / areas changed / level changes, all their drill-downs, and By participant. The summary strip still counts everyone, so Members sent and Not started stay visible.
- Data oddity found in starlabs-test: a log with `status: "completed"` but empty `reports` — it was counted in both Submitted and Not started (cards summed to 19 of 18). Not started is now `!opened && !submitted`, so the three cards partition Members sent; `whyBlank` labels that case "Submitted · no crossover record".
- Default range changed to **today only** (operator: "initially get only today's data"); Clear resets to today too. Was the design's last-12-months default. `defaultRange()` in the component.
- Environment note: on 2026-09-12 the dev server was connected to `starlabs-test` (18 interim report logs total). The earlier 661 / 55 figures were from a different project (production, going by the counts), so counts differ between sessions by environment. The `createdon` range filter itself is unchanged and correct.

## 2026-09-12 — Evolution Progress on real data
Plan: `specs/plans/2026-09-12-interim-dashboard-evolution.md` (operator-approved: `interim evolutionprogress` only).
- Source: latest `interim evolutionprogress` per log (`interimlogid in`, chunks of 30 — shared `latestByLog()` with crossover). No ATC database/collection is read: older evolution answers live only in `atc_alpha/…/corrections` (firestore-atc), not linked to a report, and CLAUDE.md keeps ATC out of automated testing.
- **Coverage gap (why):** the Flutter app only started writing `interim evolutionprogress` + `interimreport log.evolutionsummary` in commit `6acd161` (2026-09-11). Reports submitted with older builds show "No record" (By participant) and are not in the grid/totals.
- `sliderValue` strings (stored as-is by Flutter) map to the design's five outcomes via `EVO_RESULT_OF`. Years saved = the app's stored `summary.savedyears` (not recomputed — Flutter uses ×52 for weekly, not ÷7×365). Hours/day = Day h, Week h ÷ 7.
- Grid now counts ongoing members who answered too (section pool), not only submitted.
- Outcome labels (grid side headings, dialog titles, participant chips) use the app's exact option wording — No Change / Somewhat Change / Changed / Changed and Improving / Completely Changed (Flutter `EvolutionProgress.options`, shown as-is in the app) — instead of the design's "No change yet / Some changes / …".
- The `adjustment` text is part of the downloaded doc (Firestore client cannot project fields) but is never mapped or displayed. Worth noting: Flutter writes that confidential text into a default-DB collection.
- Verified on starlabs-test: 19 logs total, **0** with an evolution record → section shows "Nobody has answered an adjustment yet", By participant shows "No record" for the 6 who did the step on an older build. Populated path verified in-browser with synthetic in-memory answers (no Firestore writes): grid 1/1/1 in the expected cells, totals 11 / 3.6 / 7, drill-downs + participant detail correct; real loader restored afterwards.

## 2026-09-12 — Love Letter + Asks on real data
Plan: `specs/plans/2026-09-12-interim-dashboard-letters-asks.md` (operator-approved).
- Source: latest `love letter` / `ask AH` doc per log (`interimlogid in`, shared `latestByLog()`). **Read-only** — tags stay editable only in the Love Letter / Ask A&H tabs (operator choice).
- Tags = the tabs' booleans: Happy `liked`, Needs Attention `tagged`, Opportunity `opportunity`, Critical `critical`, Resolved `resolved` (+ `resolveddetails.user/time` → "Resolved by" name via profile map). A letter can count under several tags.
- **Sent to Journey Coaching = Needs Attention count + Critical count** (operator chose the sum: a letter with both counts twice). Open / Resolved split the same per-tag sum so Open + Resolved = total; In progress is a placeholder ("—"). The panel is always shown (0 included).
- Asks section: counts only (operator choice) — Installation Ask / Ask A&H = docs with that text; replied / waiting are placeholders; no reply box. Tags are visible inside the lists and By participant.
- Design's coach notes / status / move / reply controls are not rendered (no data behind them); their mock code is left unused.
- Verified on starlabs-test (1 Jan 2024 – 31 Dec 2026): 7 letters (all untagged), 6 Installation Asks, 6 Ask A&H = independent recount; lists show real text; By participant shows tags / Inst / A&H / "No letter" / "No questions".

- Operator: "tagged an Ask A&H but dashboard shows Untagged". Data was right (Vignesh S's ask AH doc: Needs Attention + Resolved, shown in both ask lists + expanded detail). The "Untagged" was the **Love letter** column in By participant (their letter is untagged) while the Asks column showed only Inst / A&H. Fix: the Asks column now also shows the ask doc's tags.
- Operator: "participant search filters only the summary". Verified it filters every section (wide range, "Sury": strip 18/12/0/6 → 1/1/0/0, crossover 12 → 1, letters 8 → 1, asks 7/7 → 0/0, By participant 12 → 1). In Sep 2026 only one member had started, so sections looked unchanged (not-started are excluded). Real gap found: every re-render reset the view to "By step", so searching while on By participant jumped away — the active view (`VIEW`) now survives re-renders.
- **Not live** (operator asked): data is read once per date range with `getDocs`. It reloads when the range changes, on Clear, and whenever the tab is re-opened — verified: leaving the Dashboard tab removes the component (mat-tab lazy content, `preserveContent` off) and coming back rebuilds it, which also resets the range to today and the view to By step. Changes made while the dashboard stays open (e.g. tagging from another browser) are not picked up until one of those.
- Testing note: the Chrome tab used for checks runs hidden → setTimeout is throttled (CDP 45 s timeouts). Wait on DOM changes with a MutationObserver instead of sleeps.

## 2026-09-16 — Journey / Event filters, Export, Crossover list rule
Plan: `specs/plans/2026-09-16-interim-dashboard-filters-export.md` (operator's request; operator chose .xlsx and the count on the filter).
- **JOURNEY** options come from the `journey` collection (`journey` field = name, doc id = the value stored on participants). A participant's journey is `participant metadata/<profileid>`: `activejourney` → `lastcompletedjourney` → `lastsubscribedjourney`, **first non-empty** — the operator's order, deliberately NOT the `customerstatus` branch in `participants-analytics.engine.ts`, which returns a different journey for a lapsed participant. Metadata is read with `documentId() in` chunks of 30 over the range's profileids only (12 participants = 1 query), so the whole collection is never pulled. This also fills the By participant "Journey" column, which was hard-coded `—`.
- **EVENT ATTENDED** options come from the `event collection` (newest first). Selecting one reads `event participation request` where `eventref == event collection/<id>` and `status == 'attended'` — the same pair `eco-system-new` uses, so the index exists — and keeps only those profileids. Cached per event for the life of the tab; the overview shows "Loading who attended …" until it lands.
- Both dropdowns are custom (search box + list) because the design's `<select>` cannot search; they live in the shadow root and close on an outside click. The selected pill carries the matching participant count (operator choice).
- **Export (.xlsx)** on every list: each drill-down dialog (⤓ Export in its header), By participant, and the parent's Love Letter / Ask A&H tabs. The dashboard exports what the list is showing; the tab export **re-runs the tab's query without the page limit** (the table pages 100 at a time) and then applies the tag chips, so it is not just the visible page.
- **Crossover Meter now counts only participants who have a crossover record** (`crossPool()`), including the matrix, the Areas-changed buckets, the level panel and every drill-down. Verified on the wide range: section pool 12, with a crossover 4 → every matrix row totals 4 (was 12, with 8 empty rows sitting in the "0 · Not progressed" column).
- Verified on starlabs-test, 17 checks: journey list + search + filter + count + clear; event list + search + three events (2 / 1 / 0 matches) + clear; crossover totals and drill-down; export payloads from a drill-down, By participant, Love Letters and Ask A&H (the component's writer stubbed, so no files were written); the tab Export button. No console errors.
- Removed: the mock `fJourney` / `fEvent` selects and their boot code; `sendsInRange()` no longer reads the event select.
- Event badge reads **"5 of 93 attended"** (matches in range / everyone with an attended record). Journey keeps the plain match count: a journey total would need three count queries (active / completed / subscribed) and would double count anyone holding the same journey in two fields.
- **A participant's name opens `/userprofile/<profileid>` in a new tab** — in the drill-down lists, By participant, the Love Letter and Ask A&H lists. The handler runs before the row-expand one and stops the event, so clicking the name does not also open the row; Enter / Space work too. Mock rows have no profileid and stay plain text. Verified with a **real mouse click** (not a scripted one, which the popup blocker would have stopped): a new tab opened, `window.open` returned a live window (not blocked), the dashboard tab stayed on `/interimreportlog` with its state intact, and the row did not expand.
- **Environment note:** the dev server was found pointing at **production** (`fir-sample-aae4a`) mid-session — `environment.development.ts` ships with the production block active and starlabs-test commented out. Reads for the filter test had already hit production before I noticed; no writes. Switched back to starlabs-test at the operator's request, so that file is now locally modified — **do not commit it**.
- Verified after the switch, 10 more checks: event badge "5 of 93"; date + event + journey; all four filters at once (name search included); a no-match name; Clear; the name link from all four places, that it does not expand the row, and that `/userprofile/<id>` really renders (Vignesh S). Test data gotcha: starlabs-test has two events called "B!G Accelerator" (production has 18) — the dropdown's date sub-label is the only way to tell them apart.

## Pending
- Tag counts and the Journey Coaching panel verified only with synthetic tags (no tagged letters in starlabs-test yet).
- Evolution: verify on production once the new Flutter build ships.

### Evolution — first real record (starlabs-test, later on 2026-09-12)
- Vignesh S (sent 11 Sep 2026, Ongoing), 18 adjustments. Dashboard vs hand calculation: lot 5 = some 5 → tie goes to the lower outcome (Somewhat Change), 5/18 = 28 % → 26–50 % cell ✓; hours/day 46 + 11.86 + 8 + 17 = 82.9 → "83" ✓; stored `summary.savedyears` 179.5 → total "180", avg "179.5" ✓.
- Operator asked why the grid showed 1 for 18 answers: the grid is per member (each member in exactly one cell, by strongest answer × share). Operator first chose an extra **Answers** column, then replaced the model: **a member now shows in every answer row they gave**, in the band of that answer's share of their adjustments (e.g. 2/18 No Change → 1–25 %, 5/18 Somewhat Change → 26–50 %). Answers column removed; row "Members" = members who gave that answer; footer keeps only the distinct-member total (band column sums would double count). Header "Filed under their strongest answer" → "Answer given"; `strongestOf` no longer drives the grid or its drill-down.
- Total years saved and Hours reclaimed now show 1 decimal (operator: "don't round off") — 179.5 / 82.9 instead of 180 / 83. Average per member was already 1 decimal.
- **Data-quality flag:** the app caps each adjustment at 24 h/day (168 h/week) but not the total, so one participant can report 83 h/day saved (one adjustment alone is 24 h/day → 52 years). Totals on the dashboard inherit that. Worth a product decision (cap the sum in the app, or cap/flag on the dashboard).
- Journey / Event filter sources.

## 2026-09-15 — tag / resolve / notes from the dashboard, month default, calendar dots, wording
Plan: `specs/plans/2026-09-15-interim-dashboard-tagging.md` (operator's 7-point request).
- **Writes now happen here** (operator reversed the 09-12 "read-only" choice). Same fields as the Love Letter / Ask A&H tabs (`liked/likedetails`, `tagged/tagdetails`, `opportunity/…`, `critical/…`, `resolved/resolveddetails`, `notes: arrayUnion({notes,user,time})`) so both screens stay interchangeable. The user is the parent's `loggedInProfileId`, passed in as `[profileId]`.
- Why the member's tag object became getters over the raw doc: the component mutates the doc first (instant repaint), writes second, and restores the old values if the write fails — no second copy of tag state to keep in sync.
- An open list keeps its rows after a tag change (a letter un-tagged from the Happy list stays in view); only the counts behind it move.
- **Bug found in E2E and fixed:** the same record renders in the list dialog *and* in the hidden By participant row, so `querySelector('[data-notetext=…]')` hit the empty hidden textarea and Save did nothing. Save / focus now use the textarea beside the clicked button.
- Date default = current month (1st → last day), also on Clear. Calendar dots: `dateClass` on the range picker; each month's `interimreport log` days are fetched once when the calendar shows that month, then the open calendar is repainted via the picker's `_componentRef.instance._calendar.updateTodaysDate()` (internal, guarded with `?.`; worst case the dots appear on the next open). Dot CSS is global (`src/styles.css`) because the calendar renders in the overlay, outside the shadow root.
- Wording: every visible "member(s)" → "participant(s)"; Evolution "All members" footer, Love Letter "In progress" card, and the four explanatory notes removed. Evolution cell dialog: 2nd column is now the number of adjustments behind the % (was answered/total).
- Verified on starlabs-test (Sep 2026, 5 reports, Vignesh S's letter + ask): 21 E2E checks pass — details and screenshots in the session evidence (`E2E-evidence-interim-dashboard.md`). Also fixed during the run: "reported by 1 participants" → singular.
- Follow-up (operator): **Resolved separated from the tags and confirmed before writing.** The TAG row is Happy / Needs Attention / Opportunity / Critical + Notes; a STATUS row below shows "✓ Resolved by X · date" or "Not resolved" with a Mark resolved / Reopen button that opens an inline "Mark this love letter as resolved? Cancel · Yes" prompt (no extra dialog on top of the list dialog). Tags still toggle in one click. `resolvedLine()` removed — the STATUS row replaces it.
- Follow-up (operator): calendar dots switched from `getDocs` (downloaded every doc of the month) to `getCountFromServer`. A count costs 1 read per 1,000 matches **and 1 read even at 0**, so counting 30 days blind would cost ~30 reads a month; instead the month is counted first (1 read) and the days only when it is non-zero (~31 reads). Empty months: 1 read (was 0 docs = 0 reads + a query). Busy months (prod Sep 2026 ≈ 55 docs): ~31 reads and a few bytes each instead of 55 full docs. Break-even ≈ 31 reports/month.
- Follow-up (operator): Evolution dialog now shows "N of M adjustments". M = the adjustments they **answered** (the % denominator), not all adjustments, so N / M always equals the % shown beside it. Verified on all 5 non-zero cells (2/18 = 11 %, 5/18 = 28 %, 3/18 = 17 %). Writes were cross-checked in the Love Letter and Ask A&H tabs (separate reads) and the original tags restored afterwards. Two "E2E test note …" notes remain on those starlabs-test docs (no delete-note feature anywhere).
- Gotcha: macOS has no `timeout`; `timeout 300 npx tsc … | grep` silently printed nothing — run tsc without it.
- Re-extract if the design file changes (transform: `:root`→`:host`, `body`→`.stage`, drop `.topbar`, `document.`→`root.`, and drop `.wrap`'s `max-width:1460px; margin:0 auto` — operator wants the dashboard full width).

## 2026-09-17 — operator data-validation round: per-model areas, rated-0, multi-select journey
- **Reported:** "Mehak Garg filled the Crossover Meter as 0 for all five aspects, but the dashboard shows
  Left Blank and a metric for only 2 of 5." **Root cause:** the five life areas were hard-coded here, but
  the Flutter app builds `participant AEL.crossovermetric` / `interim crossover.metric` from the
  participant's **ATC model `category` list** (`crossover.dart` `_updateMetrics`, `requestUPevent.dart`
  `crossoverdata["metric"][item]`), so the keys differ per model. Any area whose name did not match read
  as null → "Left blank", and only the coincidentally-matching names showed a metric. The component now
  reads the doc's own keys; `syncAreas()` derives the matrix rows from the loaded pool (canonical five
  first, then the rest alphabetically), and every area-derived table (buckets, columns, the area filter)
  became a function instead of a frozen const. Verified with an in-memory pool on a made-up model
  ('Wealth Creation' / 'Inner Peace'): rows, band counts and hooks all correct, 0 malformed attributes.
- **"Not progressed" now means a RATED 0.** The band was `v === null || v === 0`, so an area nobody rated
  sat beside a deliberate 0. It is `v === 0` now; unrated areas are simply not in the meter (participants
  with no crossover doc at all were already excluded on 09-16). Verified: a synthetic pair (one rated 0,
  one skipped) → the 0-band counts 1 and the drill-down lists only the rated participant.
- **Journey filter is multi-select** (`JOURNEY` is a Set; ticks in the list, "2 journeys" on the pill, ×
  clears all). Verified on starlabs-test: B!G 6 + uP! 11 → 17 together, an exact union because a
  participant resolves to exactly one journey.
- **Hook lesson:** the literal-id tables the readiness gate needs cannot name per-model areas, so unknown
  areas emit `ird-cross-other-b*` (and a >5-area model emits `ird-xbucket-other`). Without that fallback
  the attribute rendered as the string `undefined` — caught by the synthetic-model check, not by the
  seeded data, which only ever uses the canonical five.
- Hub: `modes/interim-report-dashboard.spec.ts` IRD-02 now asserts Health (rated 0) = 1 and Personal
  Genius (never rated) = 0; new IRD-12 covers multi-select. 152 hooks, aligned both ways.

## 2026-09-17 (2) — Resolved irrespective of tags; pick participants → WhatsApp / email / notification
- **Resolved counts every resolved letter** (operator). It used to be the Journey Coaching set
  (Needs Attention + Critical) split into Open / Resolved, so a Happy — or untagged — letter that a coach
  resolved was invisible. Now `done = every letter with tags.resolved`, `Open` stays the JC set that is
  not resolved, and the card says "marked resolved · any tag". The two no longer add up to the JC total
  by construction — that is the intent. The `esc:Resolved` list and the "Resolved by" chips follow the
  same rule, and that list is titled "Resolved letters".
- **Picking participants for a message.** `PICK` is a Map keyed by **profileid**, so a participant with
  several interim reports in the range is one recipient (operator choice). Two ways in, as asked:
  a tick on any Crossover / Evolution grid cell adds everyone behind that count, and a checkbox on each
  drill-down list row (plus select-all) adds or drops one person. A sticky bar shows "N participants
  selected" with WhatsApp / Email / App notification / Clear.
- **The three sends reuse the Log tab's composers** rather than re-implementing them: the dashboard emits
  `(send)={channel, profileids}`, and the parent's `onDashboardSend` maps profileids → `participant
  metadata` docs and calls the SAME `sendWatiMessage` / `sendEmailToSelectedParicipant` /
  `sendNotificationinBreakthrough` the Log tab uses (each now takes an optional profileid list; the
  default is still the table selection). One `profilesFor()` decides whose metadata the composers get.
- Verified in the app: bar hidden until a pick; a cell of 1 → "1 participant selected"; a second cell
  adds (deduplicated); re-ticking removes; Clear hides the bar; all three buttons emit the right channel
  with the picked profileid and open their composer, each dismissed without sending.
- **Gotcha that cost the most time:** my new `const pr` (pick row) collided with the existing `const pr`
  (person row) in the same click handler. The script is `@ts-nocheck`, so `tsc --noEmit` stayed green,
  esbuild refused the bundle, and `ng serve` kept serving the last good one — the send bar simply never
  appeared while the grid ticks (built one edit earlier) did. `ng build` named the collision in seconds.
  The skill now carries this.
- Hub: IRD-13 (Resolved ignores the JC tags, with a seeded resolved-but-untagged letter as the control)
  and IRD-14 (a grid cell picks its participants, all three channels offered, Email opens the composer,
  Clear empties). 161 hooks, aligned both ways.

### Same day — two fixes to the picking UI (operator feedback)
- **"When I click plus, select that cell only."** The tick was *inferred* (`allPicked(cellPeople)`), so
  picking one participant lit the checkbox on every other cell that held them — one click looked like
  several. Selection is now explicit state: `SELCELLS` holds the cells ticked by hand. Unticking a cell
  only releases the people no other ticked cell still covers, and unticking a person in a list unticks
  the cell that brought them in (the rest of that cell's people stay). Verified: one click → 1 cell
  ticked of 20, the other 14 filled crossover cells stay clear.
- **"By design it should be usable — the + is something I have to teach."** The affordance was a `+`
  that only appeared on hover. It is now a real checkbox, always visible in every non-empty cell, with a
  hover ring, a focus outline and a title that says how many participants it will take.
- **"Only after selecting participants show the communication row."** It was already `hidden` when the
  selection was empty — but `.sendbar{display:flex}` outranks the UA `[hidden]{display:none}`, so the row
  rendered anyway. Added `.sendbar[hidden]{display:none}`. **My verification had asserted `bar.hidden`
  (the property) rather than what rendered**, which is exactly why it passed while the operator could see
  the row; the e2e now uses `toBeHidden()`, which checks visibility, plus a case that exactly one cell
  reads as selected.
