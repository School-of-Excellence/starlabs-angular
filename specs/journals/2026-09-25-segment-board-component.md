# 2026-09-25 — Segment Board: prototype hosted as a standalone component

## What landed
- New `src/app/Participants Profile Management/segment-board/` (standalone component) + route `/segmentboard` (authGuard).
- UI only. It runs the prototype `Segment Board (standalone).html` verbatim with its sample data
  (3,300 generated participants, 52 master segments, 1 team). No Firestore reads or writes.

| File | What it is |
|---|---|
| `segment-board.component.html` | The prototype's `<body>` shell (main, drawer, 6 dialogs, selbar, toast) inside `.sb-root` |
| `segment-board.component.css` | The prototype's CSS, every selector scoped under `.sb-root` |
| `segment-board.engine.ts` | The prototype's script as `mountSegmentBoard(root)`, returns a cleanup |
| `segment-board.component.ts` | Loads SortableJS, mounts on view init (browser only), unmounts on destroy |

## Why it is built this way
- **Engine kept verbatim, `// @ts-nocheck`.** The operator wants to review the UI first and wire the table later.
  Rewriting ~1,400 lines of DOM code into typed Angular templates before the design is signed off would be
  wasted work. The engine is the throwaway part; the Stored-as document shape it shows is the contract.
- **`ViewEncapsulation.None` + manual `.sb-root` scoping.** The board renders with `innerHTML`, which never
  gets Angular's `_ngcontent` attributes, so emulated styles would not apply. The prototype CSS also targets
  `:root`, `html`, `body`, `*` and `dialog` — unscoped, it would restyle the whole app. `:root`/`html`/`body`
  map to `.sb-root`; body classes the script toggles (`dev`, `dragging-people`) now go on the root element.
- **Listeners on the root, removed on destroy.** The script registered on `document`; every listener now goes
  through `listen()` so navigating away leaves nothing behind (verified: after unmount, buttons do nothing).
- **SortableJS from the same CDN at runtime, not an npm dependency.** It only powers Arrange and the new-segment
  sequence list; adding a package for a UI-review build was not worth it. If the CDN fails, Arrange disables
  itself (the prototype's `sortableOk` check) and the drag handle in the sequence list is inert; the ↑/↓ buttons still work.
- Generated from the HTML by a one-off script (scratchpad `port_segboard.py`); re-run it if the HTML design changes again before wiring.

## Design decisions carried in the prototype (from this session's review)
Segment create/edit dialog: description (optional, 280 chars); status Active/Inactive (inactive = places no one);
Journey multi-select as a segment-level setting (`journeys: []` = all), not a condition; `priority` renamed
`sequence`, set on create by dragging the new segment in a list of all automated segments (all get renumbered);
`rule` stored as a plain condition list (ANDed), except the 3 Do Not Use `{any:[…]}` rules; no `nameKey`;
consumed/unconsumed = product-count list only; uP!/CPM attended take a `products[]` to count; ongoing product
= "any of these" (`hasAny`) or "equals" (exact set); onboarding = Onboarded / Yet to onboard; no match preview;
live "Stored as" JSON panel.

## Verified
- `tsc -p tsconfig.app.json --noEmit`: 0 errors. Dev server compiled the route into a lazy chunk.
- Route itself is behind login, so the component files were rendered in a harness page: stats 3,300 / 3,259 / 41 / 85 / 7,
  52 cards, dialog + sequence list + Stored-as, drawer, dev notes, create segment all work; host page stays unstyled.

## Pending / surprises
- Not yet seen inside the real app shell (needs login): check the sticky header against the app toolbar and the fixed drawer z-index.
- Dark mode follows the OS (`prefers-color-scheme`), unlike the rest of the app.
- Known prototype bugs still present: search result "undefined ›", team Arrange save crash, duplicate "Live Arena Events" name.
- Next: wire the table to real data (segment_sets / segment_membership), then e2e hooks per CLAUDE.md before any push.

## Revert
Delete `src/app/Participants Profile Management/segment-board/` and the `segmentboard` line in `src/app/app.routes.ts`.

---

## Later the same day: master tab only + configuration in `segmentboardconfig`

**Operator decisions:** work on the Master Segments tab only; store segment configuration in a new
`segmentboardconfig` collection; **start empty** (the 52 design segments are not seeded); **one doc per segment**.

| Change | Where |
|---|---|
| Team tabs / "+ New team" removed (`teamTabs()` returns nothing) | engine |
| Board starts with 0 segments, loads `segmentboardconfig` on mount; loading + error ("Try again") states | engine `load()` |
| Create / edit / archive / Arrange write through a `SegmentBoardStore` adapter passed in by the component | engine + component |
| AngularFire adapter: `getDocs`, `writeBatch`, `serverTimestamp`, `deleteField` | `segment-board.component.ts` |
| Sample pinned B!G moves + seeded audit entries removed (they referenced design segments) | engine |

**Doc shape** — `segmentboardconfig/{segmentId}`: `id, name, description?, mode, status, journeys[], sequence (auto),
rule: Condition[] (auto), eligibility (manual), displayIndex, createdAt/By, updatedAt/By, archived?/archivedAt/By`.

**Why:**
- **Write first, then update the board.** A refused write (rules, offline) leaves the dialog open with the Firestore message
  and nothing changes on screen, so the board never shows config that isn't stored.
- **Create is one batch** (new doc + `sequence` updates for every segment it shifts), so sequences never end up with gaps or duplicates.
- **Edit = `set(..., {merge:true})`** with `deleteField()` for a cleared description; `createdAt/By` are never rewritten.
- **Archive sets `archived: true`, never deletes**; archived ids stay reserved so a new segment can't reuse one (`WILL_FAIL` → `WILL_FAIL_2`).
- **Board order** (Arrange) = `displayIndex` on each doc; checking order = `sequence`. Kept separate on purpose.
- `createdBy`/`updatedBy` = signed-in user's email (uid fallback).

**Not stored (still in-memory / sample):** participants and their membership, manual moves, change history, communications/actions.

**Environments:** `ng serve` (development config) writes to **starlabs-test**; a production build writes to **fir-sample-aae4a**.
Firestore rules for `segmentboardconfig` in those projects are unknown from this repo (rules live in the console) — a denied write shows in the dialog.

**Verified** (tsc 0 errors; harness with an in-memory store, since the route needs login): empty start; 3 creates incl. one moved
to the top (sequences 1/2/3 correct, rule stored as `[]`); edit → description + inactive, then description removed via delete;
refused write keeps dialog open, stores nothing; retry works; archive hides + reserves id; Arrange order and inactive survive reload.

**Pending:** try it logged in against starlabs-test; confirm rules allow the collection; wire participants/membership next.
**Note:** the engine is now hand-edited — do not re-run the HTML→engine generator (it would drop this wiring).

**Revert (this part only):** restore `segment-board.engine.ts` / `.component.ts` from the first commit of the component; nothing else references the collection.

---

## Later: real participants, per-segment lists, `segmentboardlist`

**What changed**
- Participants = `participant metadata` docs (all of them, test users included); the 3,300 generated sample is gone.
- **Membership model changed:** each automated segment's list = everyone matching its journeys + conditions, built on
  **Refresh list** (per card) or **Refresh all lists** (toolbar). Lists are independent, so a participant can be in several.
  `sequence` no longer decides membership (still stored; kept for later).
- Lists stored in `segmentboardlist/{segmentId}` = `{ segmentname, segmentid, profilelist[], lastupdated }` (batched, ≤450/batch).
- Stats: Participants (metadata doc count) · In a segment · Not in a segment · **In more than one segment** (drawer lists each
  person with every segment they're in). "Placed by hand" / "No longer eligible" / "Placed elsewhere" removed — meaningless for lists.
- Manual moves (Add, Move to…, drag rows) switched off (`MEMBERSHIP_EDIT=false`): lists come from conditions only.
- Card chips: "Updated <time>", "List not refreshed", "Out of date: refresh" (after a conditions/journey/status edit — **session only**).
- Fixed on the way: search result showed "undefined › name"; it now lists the segments.

**Why**
- Operator asked for duplicates across segments, which only exists if segments are evaluated independently — first-match can't produce them.
- Condition → data mapping isolated in `segment-board.facts.ts` because the operator will give the source per condition next;
  only that file should change when they do.

**Provisional mapping** (`segment-board.facts.ts`, to be confirmed by the operator): journey = `activejourney` / `lastcompletedjourney` /
`lastsubscribedjourney` by status → `journey.journey` name → group; onboarding = `currentjourneyonboarded`; customer = `customerstatus`;
finance = `financialstatus` (`fully paid` has no option in the builder); uP!/CPM attended = repeats of known product ids in
`consumedproducts` (ids from participants-analytics.engine.ts); age = `dateofbirth`; ongoing = `activeproduct` (real product ids —
the builder's product pickers still list the design catalogue, so product conditions won't match real data until mapped).

**Verified** (tsc 0; harness with the real facts mapping over 200 fake metadata docs in the real shape): three segments →
lists 50 / 120 / 100, stats 200 / 180 / 20 / 90 exactly as computed by hand; stored docs have exactly the 4 fields; duplicates
drawer shows both segment names; lists + "Updated" survive reload.

**Scale note:** Refresh loads every metadata doc on page open (~3.3k in prod, as other screens already do) and evaluates in the browser.

---

## Later: journeys from `journey`, products from `products`

- Journey setting (dialog + filter bar) lists `journey` docs (name = `journey` field); segments store **journey doc ids** in `journeys[]`.
  Participant side: `f.journeyId` = `activejourney` / `lastcompletedjourney` / `lastsubscribedjourney` by status — same ids, so no name→group mapping.
  The six hard-coded journey groups (UP, CPM, FTM_LYL, BIG, DI, ARENA) are gone.
- Every product picker (ongoing, consumed/unconsumed counts, uP!/CPM "counting these products", Product filter) lists `products` docs
  (name = `product` field) and stores **product doc ids** — the ids `activeproduct` / `consumedproducts` / `unconsumedproducts` hold.
  Default "counting" products for uP!/CPM attended = the known uP!/CPM event product ids (facts file), filtered to those present in `products`.
- `journey` is read once and shared by the catalogue and the participant loader.
- Any segment saved earlier with a journey **group** id (`UP`, `CPM`, …) won't match anyone now; re-pick its journeys.
- Verified in the harness (fake journey/products/metadata): dialog lists names, stores ids; three segments → 50 / 20 / 100,
  stats 200 / 160 / 40 / 10, matching a hand count; conditions view shows names.

---

## Condition data sources — confirmed with the operator (2026-09-25)

All from `participant metadata/{profileid}`; mapping lives only in `segment-board.facts.ts` (each field marked ✅).

| # | Condition | Source | Missing / edge |
|---|---|---|---|
| 1 | Journey (segment setting) | active → `activejourney`, non active → `lastcompletedjourney`, discontinued → `lastsubscribedjourney` (`journey` doc ids) | any other status → no journey; main journey only |
| 2 | Onboarding status | `currentjourneyonboarded` true → Onboarded | false **or missing** → Yet to onboard |
| 3 | Customer status | `customerstatus` | `none` / missing → **No status** (new option) |
| 4 | Finance status | `financialstatus`, incl. new **Fully paid** option | missing → **No status** (new option) |
| 5 | uP! events attended | times the picked products appear in `consumedproducts` | products picked per condition; built-in id list removed |
| 6 | CPM events attended | same as uP! | same |
| 7 | Age | `dateofbirth` | missing → no age, matches no Age condition (not discussed further; default kept) |
| 8 | Ongoing product | `activeproduct` — any of these / equals / **none (nothing ongoing)** (option re-added) | empty/missing = nothing ongoing |
| 9 | Consumed product | `consumedproducts`, count list kept (all/any; at least/exactly/at most N) | absent id = 0 |
| 10 | Unconsumed product | `unconsumedproducts`, same count list | absent id = 0 |

Why these small choices: missing onboarding counts as Yet to onboard so every participant lands in exactly one of the two;
"No status" is an explicit option (not null) so those participants can be targeted; the uP!/CPM product lists are no longer
guessed in code because the operator configures them per segment.

Verified in the harness (fake metadata with missing statuses, fully paid, missing onboarding): No status 16, Fully paid 15,
Yet to onboard 23, Nothing ongoing 180 — all equal to a hand count; uP! attended with no product can't be saved. tsc 0 errors.

---

## Later: Add / Remove for manual segments

- Manual segments have no Refresh list (conditions don't apply). Their list is built by hand: **Add** on the card opens a picker
  (search by name or profile ID, shows each person's journey and current segments, hides people already in the segment);
  **Remove from segment** in the segment's side panel removes selected rows.
- Both write the whole list to `segmentboardlist/{segmentId}` (same 4 fields as automated lists) before the board updates;
  a refused write shows the error and changes nothing.
- Manual lists now count in the stats and duplicates (`_members` = active automated by sequence, then active manual).
  Inactive manual segments: Add disabled, list ignored.
- Dropped for manual adds: the design's required "reason" (it only fed the in-memory change history, which isn't stored).
- Verified (harness): add 3 → stored `profilelist` of 3; stats and duplicates move by the right amount; people already in the
  segment are hidden from the picker; remove 1 → stored list of 2; survives reload. `ng build` (development): no errors.

---

## Fix: card titles and card buttons invisible in the real app

**Symptom (operator, logged in):** segment card showed the icon and count but no title, and the footer row (View all /
Refresh list / Actions) was blank. **Cause:** Bootstrap is a global stylesheet here (`angular.json` styles) and defines
`.card { color: var(--bs-body-color) }` (#212529) plus `.card-title`, `.card-body`, `.btn`. The board reuses those class
names; the design never set a text colour on `.card`, so Bootstrap's dark body colour won inside cards — dark on the dark
surface. Toolbar buttons were fine because they sit outside `.card`. The standalone harness never loaded Bootstrap, so it
never showed this.
**Fix:** end of `segment-board.component.css` pins `color` and Bootstrap's `--bs-card-*` / `--bs-btn-*` variables under `.sb-root`.
**Harness now loads the app's global styles** (bootstrap, both Material themes, styles.css) so collisions like this show up there.
Verified: with global styles loaded, card title and all footer buttons compute to the board text colour; dev server bundle has the fix.

---

## View all = live condition matches; names sorted A–Z

- **View all on an automated segment** now evaluates the segment's journeys + conditions over every participant when it opens,
  instead of showing the saved list. Header: "N participants match now". A note compares with the saved list
  ("hasn't been saved yet" / "matches" / "X new matches not in it, Y in it that no longer match"), a **Saved list** column marks
  each row "In list" or "Not saved yet", and **Save as list** (same action as Refresh list) writes it to `segmentboardlist`.
  Why: the operator wants to see who the conditions select without refreshing first; the saved list stays the stored truth.
- Manual segments' View all still shows the hand-picked list.
- Cards, stats and duplicates still use the **saved** lists (unchanged).
- Participants are sorted by name (case-insensitive, natural number order), then profile id, once on load; every list
  (cards, View all, duplicates, Not in a segment, Add picker, stored profilelist) follows that order.
- Verified (harness): unsaved segment → View all 46 live rows "Not saved yet" → Save → "In list" and "matches"; widen journeys →
  92 rows, 46 "Not saved yet", note "46 new matches not in it"; order Person 4, 8, 12, 16…; manual View all 2 rows. tsc 0; ng build ok.
- **uP! / CPM column fix:** it showed 0 / 0 for everyone because the participant's built-in counts were zeroed when the
  products became per-condition. The column now counts `consumedproducts` over the products picked in *that segment's*
  uP! / CPM attended conditions; segments without such a condition, and the duplicates / not-in-a-segment lists, show "—".
  Verified against the fake data's known counts (Person 5 → 1 / 2, Person 6 → 2 / 0).

---

## Export CSV in the list side panel

- **Export CSV** button beside the side panel's search, on View all (any segment), In more than one segment, and Not in a segment.
- Exports exactly the rows shown (search applied), client-side, no Firestore write. Columns: Profile ID, Name, Journey,
  Customer status, Finance status, Onboarding, uP! events, CPM events, Age + one per list: **Saved list** (automated View all),
  **In segments** (duplicates, `;`-separated), **Why** (not in a segment). Manual View all has no extra column.
- UTF-8 with BOM so Excel shows names correctly; quotes/commas escaped; file `<list-name>-<local date>.csv`.
- Also fixed on the way: the "Yet to onboard" label read "Yet to Onboard (New)" (a design-only subtype) in tables and exports.
- Verified (harness, download intercepted): 84 rows for a searched View all + header; duplicates file has "In segments";
  not-in-a-segment file has "Why"; BOM bytes ef bb bf; local date in filename. tsc 0; ng build ok.

---

## Import & compare (View all)

- **Import & compare** button in a segment's View all (next to Export CSV) opens a dialog:
  match by **Email** or **Name**; upload CSV / .xlsx / .xls (read with the `xlsx` package the app already has, dynamic import)
  or paste one per line (paste wins over the file). Column auto-picked by header ("email" / "name") or by an `@` for email;
  column picker + "first row is a header" to override.
- Compared against the **View all list without the search box** (live matches for automated, saved list for manual).
  Email: trimmed, case-insensitive. Name: case-insensitive, whitespace collapsed; everyone sharing a name counts as matched.
  Repeated imported values counted once (reported).
- Three result tiles/tabs: **Matched**, **Only in current list**, **Only in imported list** (each "only imported" row says whether
  the person exists in participant metadata but outside this list, or isn't found at all). Tables show first 200.
- **Export this group** / **Export all three** → CSV: Result, Imported value, Profile ID, Name, Email, Journey, Customer status, Note.
- Participant now carries `email` (participant metadata `email`) for matching. CSV writing moved into a shared `downloadCsv()`.
- **Bug caught before it shipped:** new state `CMP` clashed with the existing `CMP` (comparison words). `tsc` didn't flag it because
  the engine is `// @ts-nocheck`; esbuild did. Old one renamed `CMP_WORDS`. Lesson: for engine edits, the bundler (or `ng build`)
  is the real check, not `tsc`.
- Verified (harness, real .xlsx via the xlsx package): 92 in View all; file with 6 emails (2 repeats, 1 upper-case) → 2 / 90 / 2,
  "2 repeated values ignored"; only-imported rows marked exists-elsewhere vs not found; both exports correct; name mode with
  messy spacing → 2 / 90 / 1. ng build ok.

---

## 2026-10-02 · Participant mode condition

- New condition **Participant mode** (multi-select, "is any of"): source `participant metadata.participantmode` (a mode **name**,
  not an id). Options = `modes` collection `mode` field in `sequence` order (same query other screens use), plus **No mode**
  (empty/missing, ~17% of participants per the validated spec).
- Stored as names: `{ "field": "participantMode", "op": "in", "value": ["Integration Mode", "NO_MODE"] }` — names because that is
  what participant data holds; no id join exists.
- Matching normalises case, spacing and a missing " Mode" suffix to the catalogue name (`canonModes()` on load), so
  "integration" counts as "Integration Mode". A value not in the catalogue is kept and added as its own option rather than dropped.
- Filter bar "Product + Mode" now uses the same real list (was the design's hard-coded 15 names that didn't match the data).
  Export CSV gains a **Participant mode** column.
- Verified (rebuilt harness — scratchpad had been cleared — fake `modes` + messy values): Exploration 37 · Integration 38 (incl.
  lower-case "integration") · No mode 49 · unknown "Weird Mode" 38 as its own option · Journey Planning 38 = 200; segment
  Integration + No mode → list of 87. tsc 0, esbuild ok, ng build ok.
- Revert: remove the `participantMode` FIELDS entry, `VAL.participantMode`, `canonModes()` + its call, the `modes` query in
  `loadCatalog`, and `participantMode` in `segment-board.facts.ts`.
- **Participant mode → single select** (operator, same day): the condition row is one dropdown ("Choose a mode…", the `modes`
  catalogue in sequence order, No mode). Stored `{ "field": "participantMode", "op": "eq", "value": "Integration Mode" }`;
  an empty pick blocks save ("Pick a participant mode."). A rule saved earlier with several modes (`op: in`) still evaluates
  as saved, but reopens showing only its first mode, and saving it then keeps just that one. The filter bar keeps multi-select.
  Verified: Integration Mode → list 38; tsc 0; ng build ok.
- **2026-10-05 · Participant mode back to multi-select** (operator): the single-select special cases were removed, so the row is
  the standard multi-select ("is any of"), stored `{ "op": "in", "value": ["Integration Mode", "NO_MODE"] }`. Rules saved as
  single select (`op: eq`, string value) still evaluate, reopen with that one mode ticked (the existing eq→in conversion for
  enum rows) and save unchanged. Verified: Integration + No mode → 87; a planted `eq` "Exploration Mode" rule → 37, reopens ticked,
  "No changes to save". tsc 0, ng build ok.

---

## 2026-10-12 · Testing feedback round 1 (plan: `specs/plans/2026-10-12-segment-board-feedback.md`)

| # | Change | Why |
|---|---|---|
| 1 | Saving a new / edited active automated segment rebuilds and stores its list at once | Testers expected the list to follow the conditions without Refresh |
| 2 | Participants loaded with `orderBy('name')` | Participants Analytics does the same; Firestore drops docs with no `name` field, which was the 29-profile gap. Operator chose to hide them |
| 3 | Profile ID no longer shown (cards, View all, duplicates, Add picker, compare, history); email shown under names instead; IDs kept in CSV exports | Operator: IDs are noise on screen but the join key in files |
| 4 | **Manual segments win:** anyone in an active manual segment is left out of every automated list and View all ("N more match but are in a manual segment"). A person is in one manual segment at most. **Move to manual segment…** in every list side panel's selection bar. Add / Move / Remove / Archive / turning a manual segment on or off rebuild the automated lists that changed (`syncAutoLists`, stores only changed lists) | Operator: manual placement must not be overridden by conditions |
| 5 | Board search filters as you type (name or email, 150 ms debounce): cards without a match hide, cards show only matching rows; no dropdown | Like B!G Cohort |
| 6 | **Archived (N)** toolbar view; **Unarchive** puts it at the end of the board (and the sequence, if automated) and rebuilds its list | — |
| 7 | **Delete** only in the Archived view: deletes the `segmentboardconfig` and `segmentboardlist` docs (confirm) | Archive first = a safety step |
| 8 | Events, Queue, Workshop, B!G Level filters removed | They ran on the design's made-up data |
| 9 | **uP! events** / **CPM events** filters: pick products, then at least / at most / exactly / between | Same product choice as the conditions |

**Verified** (harness rebuilt with a one-step builder `scratchpad/build_harness.sh` — the scratchpad keeps getting cleared;
fake store incl. 3 nameless docs): 200 participants (3 dropped) · list built on create 38 → after edit 87 · move 2 to VIP →
Integration 85, View all note "2 more … left out" · move one on to VIP Two → out of VIP · remove → Integration 86 · no ids on
screen, export starts with Profile ID · search "person 6" → only Integration (61, 62, 66…) and VIP (Person 6) cards ·
archive → Archived (1) → unarchive → back on board → archive → delete removes both docs · filters list without the four ·
uP! at least 2 → 100, between 1–2 → 100. tsc 0, esbuild ok, ng build ok.

**Revert (per change):** 1 — drop the `refreshLists`/`syncAutoLists` lines at the end of `saveSeg`. 2 — `loadParticipants` back to
`getDocs(collection(...))`. 3 — restore the pid spans (`prow`, `tableHtml`, compare, history, Add picker). 4 — remove
`_pinned` (refresh/assign), `autoList`/`syncAutoLists`/`placeInManual`, the Move dialog and the bulk-bar buttons; `doAdd` back to
`saveManualList`. 5 — the `#q` input handler back to the dropdown, drop `qMatch`/`S.q` from `filtersOn`/`refreshFilter`.
6/7 — remove `archivedHtml`/`unarchiveSeg`/`deleteSeg`, the toolbar button, `unarchiveSegment`/`deleteSegment` in the component.
8 — put the four `fdrop`s back in `filterBar`. 9 — remove `countDrop` and the `up*`/`cpm*` filter fields.

---

## 2026-10-12 · e2e hooks (prefix `sgb`, 57 literal `data-testid`s)

Toolbar, stats, cards, segment dialog, side panel, bulk bar, move/add dialogs, archived view, compare dialog and the uP!/CPM
count filters carry literal hooks. Generated markup uses a literal lookup where needed (status radios, count-filter inputs:
`${k==='up'?'data-testid="sgb-filter-up-op"':'data-testid="sgb-filter-cpm-op"'}`) because the readiness gate ignores any
id containing `${…}`. Spec + seed live in starlabs-e2e-tests `profiles/segment-board.spec.ts` / `seed-segment-board.js`
(hub journal `specs/journals/2026-10-12-segment-board-e2e.md`). hook-diff: aligned. Land order: these app hooks first, then the spec.
Revert: strip `data-testid="sgb-…"` attributes from the engine and `segment-board.component.html` (behaviour unaffected), and
drop the spec + seed module in the hub.

---

## 2026-10-12 · "Stored as" panel removed from the segment dialog

Operator: remove the "Stored as" JSON preview from the create/edit dialog. It was a design-time aid for agreeing the
`segmentboardconfig` shape; the shape is settled. `buildDoc()` stays (save still uses it); only the panel, `renderStore()`
and its calls (name, description, status, sequence drag/move, `updatePreview`) and the `.store` CSS went. Hook `sgb-dlg-stored`
dropped (56 hooks now); hub PR #9 spec's SGB-ADDR1 no longer lists it. hook-diff aligned, ng build ok.
Revert: restore the `<details class="store">…#sJson` line in the dialog markup, `renderStore()` + its calls, the 4 `.sb-root .store`
CSS rules, and the hook in SGB-ADDR1.

## 2026-10-12 · Header, filter note and summary row removed

Operator: the header shows the screen name only; drop the filter hint line and the "Not in a segment / In more than one segment"
tile row (the stats tiles already show and open both). Master view (`renderMain`) only: eyebrow, description, **Preview as** and
**Developer notes** gone (role stays `admin`, notes stay off; the `#roleSel` assignment after render went with them). The Archived
view used to cut the page at `<div class="attn">`; it now cuts at `boardAt` (markup length before the board). `.attn*` CSS removed.
No hooks affected. Revert: restore the header block, the `attn` row + `topReasons`, the `Filters narrow…` span in `filterBar`,
the `.attn` CSS, `$('#roleSel').value=S.role`, and the regex cut in the Archived branch.

## 2026-10-12 · Compact top area

Operator: make the space above the cards compact. One CSS block at the end of `segment-board.component.css`, scoped to `.freeze`:
smaller title, stats on one line (number + label side by side), 30px toolbar buttons, 28px filter chips, tighter padding.
The sticky top area is ~180px tall at 1400px wide. Revert: delete the "compact top area" block.

## 2026-10-12 · Loading state: spinner, no collection list

Operator: the loading box shows only "Loading segments…" with a loader; the "Reading segmentboardconfig, …" line is gone.
Spinner is `.sb-spinner` (CSS-only, `role="status"`). Revert: restore the `<p class="subtle">Reading …</p>` in `renderMain`'s loading
branch, drop the spinner div and the "loading state" CSS block.

## 2026-10-12 · Visual redesign (modern enterprise dark)

Operator brief: a modern, compact enterprise dashboard with every feature, data path and behaviour unchanged.
Plan: `specs/plans/2026-10-12-segment-board-redesign.md`.

**Why it is mostly CSS.** The board is a vanilla engine rendering HTML strings. There is no component library to reuse, and the
`sgb-*` hooks, the store and the event delegation all key off the existing markup. So the redesign is:
- refined palette tokens, in place in the three token blocks, plus new `--primary-fill`, `--primary-fill-ink` and `--icon-mix`;
- one "Redesign" block at the end of the CSS, which replaces the earlier "compact top area" block;
- small markup edits in the engine.

**Engine markup:**
- `IC` line-icon set (inline SVG, `currentColor`).
- Search icon.
- Toolbar actions in two `.tgroup` groups (Layout: Collapse all, Arrange; Records: Activity, Change history, Archived), each with a `title` tooltip.
- Icons on Refresh all lists and New segment.
- `.pct` badge on In a segment.
- Filter chips name the picked values (`sel()` with a label map), and the label reads "Filters" with an icon.
- `checkList` gives lists of more than 8 options a search box (reusing the existing `.ms-q` handler) and `data-name` labels. The change handler restores the search text after its re-render.
- Card header: a count span plus a separate Conditions/List toggle (same `data-cardtab`, now with `aria-pressed`), and SVG edit and chevron icons.
- Footer buttons get icons, and the Actions summary gets an aria-label.

**Layout decisions:**
- Cards sit in a CSS grid, `auto-fill, minmax(300px,1fr)`, with `align-items:start` so collapsed cards don't stretch their row.
- Header, description, tags and footer are `flex:none`. Without it, the description shrank into the tags once a card had a max-height.
- At 1280px and below, the grouped actions become icon-only. Their label stays visually hidden, so screen readers still read it.
- At 860px and below, search takes a full row.
- At 700px and below:
  - stats sit two by two;
  - filter chips wrap, and their panels open full width under the bar (a fixed-position panel inside a sideways-scrolling bar landed off-screen);
  - cards size to their content.

**Verified** on the harness with 5 segments (the harness now has a viewport meta and an 11-product catalogue):
- Customer status: Active filters to 110/200 with the chip reading "Active".
- The product search "live" leaves 2 options, and the text survives picking.
- Clear filters, the Conditions toggle, collapse (90px; the neighbour stays 460px), card select with the bulk bar, the Actions menu inside the card, the header opening the side panel, Archived, and Arrange/cancel all work.
- Search "person 8" leaves 2 cards and keeps focus.
- Checked at 1440, 1100, 820 (light) and 375 with no horizontal overflow; the dialog and side panel were checked as well.
- ng build ok; hook-diff aligned.

**Revert:**
- Restore `segment-board.component.css` and `segment-board.engine.ts` from the commit before this one (`git show <prev>:<path>`).
- Or, piecemeal: delete the "Redesign" block and put back the old token values (light `--bg:#f4f5fa…`, dark `--bg:#10121b…`).
- In the engine, undo:
  - `IC`;
  - `.tgroup`;
  - the `sel()` label map;
  - the `checkList` search;
  - the change-handler `fq` restore;
  - the card-meta split.

## 2026-10-12 · Card Actions removed; real B!G Cohorts dialogs; conditions panel closes

**Operator asks:**
- Remove the **Actions** button from the cards.
- Send communication and Recommend playlist must use the B!G Cohorts dashboard's real dialogs.
- The card's conditions view couldn't be closed: the toggle's label flipped to "List", which didn't read as "close".

**Changes:**
- **Card:** the Actions `<details>` menu is gone, and the footer is now View all + Refresh list / Add.
- **Where sending happens now:** select cards (checkbox) or participants. The selection bar's WhatsApp / Email / App / **Recommend playlist** call `sendReal()` → `store.communicate(channel, ids)` / `store.recommendPlaylist(ids)`.
- **The component opens the same dialogs, with the same options and send paths, as `cohort-management.component.ts`:**
  - `AhNotificationComponent`: image upload, then `authguard.saveNotificationRecord` to profile ids that have a `firebaseuserref`;
  - `EmailInputComponent`: `email archive` setDoc for queued/send, or a POST to `sendBatchEmail` once validated;
  - `WatiInputComponent`: the dialog sends and reports success/failed;
  - `MapRecommendedplaylistToparticipantComponentComponent` with `{participantlist}`: the dialog saves.
- **What the dialogs receive:** the full `participant metadata` docs, which the component keeps in `meta` while loading participants (the same shape as cohorts' `mapParticipantMetaData`).
- **App action pending:** "Assign app action" in the bar's ⋯ menu is still the prototype's own dialog. It records to the in-memory activity only.
- **Fix — `actionTargets`:** it still read the old single `m.segmentId`. It now uses `m.segs`, so a person in several selected segments is counted once.
- **Conditions panel:** a sticky header "Conditions" with a × close, and the header toggle reads "Hide conditions" while it is open.

**Verified on the harness:**
- No Actions menu.
- The × and the toggle both close the conditions panel.
- 2 selected cards → all 4 sends reach the store with 121 unique ids (85 + 36).
- ng build ok; hook-diff aligned.
- The dialogs themselves need the real app (auth, Firestore). Not exercised here.

**Revert:**
- Restore the card's Actions menu.
- Point the `comm`/`content` dispatch back to `openAction`.
- Drop `sendReal` / `CHANNEL`, plus the component's `communicate`, `recommendPlaylist`, `sendNotification`, `sendEmail`, `sendWhatsapp` and `meta`.
- Remove the `cond-view` header, and put the `List` label back.

## 2026-10-12 · Premium design system (second visual pass)

**Operator brief:** the first redesign was "compact, not better". The ask is a deliberate, premium design language (Linear / Stripe /
Vercel discipline), favouring quality over compactness, with no fake controls. The same session removed the card Actions, so that
stays out despite the brief listing it.

**Tokens** (top of `segment-board.component.css`, one block each for light and dark, plus aliases):
- **Surfaces:** canvas `--bg` → card `--surface-1` → control `--surface-2` → hover `--surface-3`, plus `--sunken` for the card list well.
- **Lines and text:** cool hairlines `--line-1/2/3`; text in three steps, `--text`, `--text-2`, `--text-3`.
- **Colour:** one violet accent (`--accent` for text, `--accent-strong` for fills, plus soft and ring variants) and muted ok / warn / danger / manual.
- **Effects:** `--shadow-card` and `--shadow-pop`.
- **Type scale:** title 22, metric 26, segment 14, body 13, meta 12, micro 11.
- **Space and size:** spacing 4–32, radii 6–14, control heights 32 and 28.
- **Font:** Geist (already imported globally in `styles.css`), with tabular numerals.
- **Aliases:** the older names (`--surface`, `--border`, `--muted`, `--primary`…) map onto the system, so the dialogs and side panel follow it without being rewritten.

**Markup:**
- **Header:** the title on the left. On the right, a segmented Records group (Activity · Change history · Archived), then Refresh all lists (secondary) and New segment (primary).
- **Summary:** one instrument with four readings: label, 26px tabular value, and a sub-line. Coverage gets a meter. The red and amber dots carry meaning. "View →" appears on hover for the two clickable stats.
- **Pinned toolbar:** only this stays pinned, with a translucent blurred background. Row 1 has the search and the Layout icon group; row 2 has the filters, each shown as a muted name plus a value. An active filter gets an accent dot and accent value.
- **Applied filters:** a "Showing X of Y" line with removable chips (`data-fclear` resets only that control's fields, via `FILTER_KEYS`) and "Clear all". This keeps the `sgb-clear-filters` hook.
- **Card:**
  - Header: identity tile, title (2-line clamp), count, and icon controls (Conditions · Edit · Collapse).
  - Status line: a dot plus "Automated · Updated …", with warnings as soft badges.
  - Content: a sunken list well with 28px two-letter avatars tinted per name.
  - Footer: View all (secondary, full width) and Refresh list / Add (tertiary). Refresh spins its icon while busy.
- **Conditions moved to an icon control.** As text it wrapped onto its own line whenever the "Updated" time was long.
- **Inputs:** custom checkboxes, and selects without browser chrome; popovers animate in over 140ms.
- **Stat separators are 1px grid gaps over a line-coloured background.** Box-shadow separators misaligned once a label wrapped on phones.

**Verified on the harness:**
- Widths 1440 (dark and light) and 375 (dark), with no overflow at 375.
- Filter open, apply and remove-one; Clear all.
- Conditions panel open and close.
- Card select plus the bulk bar.
- Refresh all (toast); Collapse all; a stat opening its list.
- Search (2 cards, "Showing 11 of 200"); the create dialog.
- ng build ok; hook-diff aligned (no hook renamed).

**Revert:** restore both files from the commit before this one, or from the scratch copies `engine.before-premium.ts` / `css.before-premium.css` taken at the start of the pass (session scratchpad).

## 2026-10-12 · Design review pass, compact summary, labelled layout controls, five columns

The review found five reasons the board still read as a generic admin page. Each fix is its own block at the end of the CSS.

| # | Problem | Fix |
|---|---|---|
| 1 | Random hues on the tiles and avatars carried no meaning | Tiles are tinted by mode: `--accent` for automated, `--manual` for manual. Avatars are monochrome, with two-letter initials. |
| 2 | Box inside box: every filter and footer button had its own border | Filters sit in one bar with a "Filter" label and hairline dividers, and the active one is tinted. The footer is text actions: "View all →" and "Refresh list". |
| 3 | Crowded card headers | The checkbox sits on the tile and shows on hover, focus or when picked. Conditions and Edit appear on hover over a fade, and stay visible on touch (`hover:none`). Status line and description use the full card width. |
| 4 | The summary was four tall boxes | Operator ask: one compact strip with number + label + sub-line. Dups drops its long sub-line. Two-by-two below 1100px. |
| 5 | Unclear layout controls | Operator ask: the icon-only Collapse/Arrange become "Collapse all" / "Arrange cards" with words. Arrange mode shows a grip icon, dashed cards and a lifted chosen card, with clearer banner and toast copy. |

- **Grid:** five columns (operator ask), `repeat(5,…)`. It steps down to 4 / 3 / 2 / 1 at 1180 / 940 / 720 / 520px. Cards are 440px tall.
- **Status line:** `.chip` is 11px with 6px separators. At five columns, "Automated · Updated …" overflowed a 225px row by 6px.
- **Empty state:** `.card-empty` is now `display:block`. Grid layout split the copy around its `<b>`.

**Verified on the harness (1366px, 8 segments):**
- 5 columns.
- Every status line on one row, except the inactive card that also carries a warning.
- Hover reveals the tools.
- Arrange: fold, banner, grips, cancel restores.
- Refresh all; filters.
- ng build ok; hook-diff aligned.

**Revert:** delete the "Design review pass" blocks at the end of the CSS, and undo the engine edits: tgroup labels, `flabel`, grip, `View all` arrow, `--icon` by mode, dups sub-line, arrange copy.

## 2026-10-12 · Sequence: overlaps stay, wording fixed

**Operator question:** "are you applying any logic for the sequence?"

**Finding:** no. Each automated list is everyone matching its conditions, minus anyone in an active manual segment (`autoList`). Sequence only
orders the create dialog's list and a participant's `m.segs`. Two texts claimed first-match-wins: the create dialog's Sequence hint and the
card conditions panel.

**Operator decision:** keep the overlaps and fix the text. The copy now says that overlaps are allowed, that the order moves no one, and that
manual placements are left out. The unused "+N placed elsewhere" tooltip now names only manual segments; `t.lost` is never filled, so the tag
does not show.

**Revert:** restore the two sentences and the tooltip.

## 2026-10-12 · Card columns follow the board width (side panel bug)

**Operator report:** with the side list (View all) open, segment names weren't shown.

**Cause:** the five columns were set by window-width media queries. Opening the side panel adds `padding-right:628px` to `main`, so the
board kept five ~146px cards and each title was squeezed to 54px. My first attempt, an `auto-fill` grid with `minmax(max(240px, calc(%)), 1fr)`,
was rejected by Chrome: the whole rule was dropped, which showed up as an unchanged computed `grid-template-columns`.

**Fix:** `.board-scroll` is a size container (`container-name: board`), and `@container` rules set the column count: 2 from 492px, 3 from 744px, 4 from 996px and
5 from 1248px. The board therefore reflows when the side panel or the app's side nav takes space. The summary strip wraps
(`flex: 1 1 240px`).

**Verified at 1440px:** 5 columns and 174px titles with the panel closed; 3 columns and 159px titles with it open.

**Revert:** drop the container block at the end of the CSS.

## 2026-10-12 · Side panel header under the app bar; "Save as list" → "Refresh list"

**Operator reports:**
- The segment name wasn't visible in the side panel.
- Rename "Save as list" to "Refresh list".

**Cause:** the app's `.toolbar` (STARLABS bar) is `position:sticky; z-index:10`, outside `.mat-drawer-container`, which is `z-index:1` and so forms a
stacking context. The board's `.drawer` is `position:fixed; top:0; z-index:20`, but its z-index only counts inside that context. The bar
therefore painted over the panel's first ~64px: the eyebrow and the segment name.

**Fix:**
- `.drawer` starts at `top: var(--host-bar)`, with `height: calc(100vh - var(--host-bar))`.
- `--host-bar` is `clamp(40px,7.4vh,64px)`, the expression `app.component.css` keeps in sync for `.toolbar` and `.mainscreen`. If that changes, change it here too.
- `.sb-root` gets `min-height: calc(100vh - var(--host-bar))`, so the dark board fills the shell. While loading, it stopped short over a white band.

**Rename:**
- The side panel button now reads "Refresh list" (refresh icon, spins while busy), the same action as the card's Refresh list. The hook `sgb-drawer-save-list` is kept, so the spec is unaffected.
- The copy now says "stored list".
- The table column and the CSV column are now "In list", with "Not in list yet".

**Revert:** remove the host-bar block at the end of the CSS, and restore the button label and the copy.

## 2026-10-12 · Live events and Queue filters (real data); centred loader

**Operator ask:** a Live events filter and a Queue event filter. The prototype's Events and Queue filters were removed in feedback round 1 because nothing real fed them.

**Sources (operator choices, 2026-10-12):**

*Live events*
- **List:** all of `event collection`, newest first, labelled "name · Mon YYYY" because names repeat. Lists over 8 get the search box.
- **Status:** Confirmed or attended (default) / Confirmed / Attended.
  - **Attended** = `participant metadata.productevent` (`{productId: [eventId…]}`, mapped in `segment-board.facts.ts` → `attendedEvents`). The operator chose this source.
  - **Confirmed** = `event participation request` with `status == 'approved'`.
  - That is the same split Participant Intelligence uses. The operator's two answers, "productevent" and "confirmed or attended", only fit together this way.
- **Loading:** confirmed requests load lazily, only for the picked events, in batches of 30 (`in` limit), and are cached in `CONFIRMED`. The panel says "Loading confirmed registrations…" meanwhile.

*Queue*
- **Membership:** `queue_token` where `stagestatus == 'Approved'` and `tokenstatus == 'Active'`, read once at load into `QTOK` (profile → [{queue, stage}]). This matches Participants Analytics.
- **Options:** queues from `queue generation` (`queuename`); stages from `stages[].stagename` plus any stage seen on a token.
- **Behaviour:**
  - The optional stage list appears once a queue is picked.
  - Unpicking a queue drops stages that no longer belong.
  - The chip reads e.g. "B!G Studio · Completed".

**Gotcha (again):** the prototype already has a `const QUEUE_STAGES`. `tsc` passed (`@ts-nocheck`) but esbuild refused the bundle, so the live map is named `QSTAGES`.

**Loader:** the loading state is centred in the area under the app bar (`.empty.is-loading`, flex centring, no box).

**Verified on the harness (3 events, 2 queues, tokens and approved requests with hand-computed counts):**

| Check | Result |
|---|---|
| ev1, any / attended / confirmed | 59 / 34 / 25 |
| Confirmed requests fetched | once, then cached |
| q1 | 50 |
| q1 + Completed | 17 |
| Unpick q1 | clears the stage |
| Panels | stay open while picking |

ng build ok; hook-diff aligned.

**Revert:**
- Remove the `events` / `queues` fdrops, `stageOptions`, `ensureConfirmed`, `reRender`, the `QTOK` / `CONFIRMED` / `EVENT_NAME` / `QUEUE_NAME` / `QSTAGES` setup and the `matchFilter` branches.
- Remove the store's `loadQueueTokens` / `loadConfirmed` and catalogue `events` / `queues`, and `attendedEventIds` in facts.
- Restore the old prototype `EVENT_NAME` and `queueStage` lines.

## 2026-10-12 · Selection bar on one row

**Operator report:** "Clear" dropped to a second line in the selection bar. The `.selbar` rule had `flex-wrap:wrap`, and the counts, the SEND group, Recommend playlist, ⋯ and Clear together overflowed.

**Fix:**
- `.selbar` is now `flex-wrap:nowrap; width:max-content`, with tighter gaps.
- Below 1100px the channel labels and the "SEND" label collapse, leaving icons with titles.
- The bar only wraps below 700px.

**Verified:** 1366px, one row (56px tall), Clear inline.

**Revert:** delete the "selection bar stays one row" block.

## 2026-10-12 · "App action pending" removed

**Operator ask:** remove it.

**Change:** the ⋯ menu in the selection bar (`actionsWidget`) held only "App action pending", which opened the prototype's own dialog and
wrote nothing to Firestore. The menu is gone, so the bar is WhatsApp / Email / App / Recommend playlist / Clear. `openAction('appaction')` stays
reachable only from the disabled team-groups view.

**Revert:** put the `<details class="fdrop">…App action pending…</details>` block back in `actionsWidget`.

## 2026-10-12 · Change history (subcollection), one order, no hard delete

Plan (approved): `specs/plans/2026-10-12-segment-history.md`.

**Storage:**
- **Where:** `segmentboardconfig/{id}/segmenthistory/{autoId}`, a subcollection of the segment's own config doc. There is no new collection; that was the operator's rule.
- **What each entry holds:** `action`, `segmentid`, `segmentname`, `changedfields`, `changes` (`{field: {from, to}}`, changed fields only; whole before/after `rule` / `eligibility`) and `summary`.
- **Who and when:** the store adds `at` (serverTimestamp) and `by` (`{email, uid, name}`).
- **Atomic with the change:** entries are written in the same `writeBatch` as the change (`writeHistory` / `writeOrder` in the component).

**Actions:**
- `create`: every starting value as `from: null`, plus position and sequence.
- `edit`: `diffFields` over name / description / status / journeys / rule / eligibility, with the dialog's change list as the summary.
- `archive`: `archived` false → true.
- `unarchive`: archived true → false, plus position.
- `reorder`: position, and sequence for automated segments.

**One order (operator: "make them one"):**
- An automated segment's `sequence` is its rank among the automated cards in board order (`applyOrder` on load and after every change).
- `orderPlan` turns a new board order into the minimal writes plus one `reorder` entry per segment whose position actually moved. Values that merely fix older stored numbers are written without an entry.
- **Create:** a new automated card goes right after the automated card it follows in the dialog's sequence list.
- **Arrange:** writes `displayIndex` and `sequence`.
- **Edit:** no longer writes the order.
- "Reset to default" is gone, because the stored order is the order.

**No hard delete:**
- The Archived view's Delete button, `deleteSeg` and `store.deleteSegment` are removed.
- Archived segments keep their config, list and history.

**Views:**
- A side panel **History** tab, per segment.
- **Change history** for all segments, via a collection-group query (`orderBy at desc`, limit 200). This replaces the in-session AUDIT list.
- Both are read on demand and cached, and forgotten after a write.

**Console steps (operator):**
- rules for `segmentboardconfig/{id}/segmenthistory` (read, create; no update or delete);
- a `/{path=**}/segmenthistory` read rule for the collection group;
- a collection-group index on `at` (descending). The first Change history query's error links to it.

**Verified on the harness:**
- An edit (name + status) writes one `edit` entry with only those two fields.
- A create placed mid-order lands at position 7 with sequence 6, and the two later cards get `reorder` entries.
- Arrange (one card to the front) writes `reorder` for each card that moved.
- Archive and unarchive write entries, and the card comes back last.
- There is no Delete button.
- The History tab and Change history render, with from → to tables.
- ng build ok; hook-diff aligned (57).

**e2e:** SGB-06 now asserts the history docs instead of deleting (hub `test/segment-board`).

**Revert:**
- Restore the engine and component from the commit before this one. A scratch copy is in `engine.before-history.ts`.
- History docs already written are inert; leave them, or delete the subcollections.

## 2026-10-13 · Random segment ids, profile ids for "who", one-time migration

Plan (approved): `specs/plans/2026-10-13-segment-ids-and-profileid.md`.

**New writes**
- A new segment gets `doc(collection('segmentboardconfig')).id`, a 20-character Firestore auto id. It's generated when the dialog opens (`B.newId`), so the create history entry and the list use the same id. `segIdFor` (the name slug) is gone. Name uniqueness is still checked by the dialog.
- `segmentboardlist` doc id and `segmentid` = the config id (no code change was needed).
- **Who:** `createdBy`, `updatedBy` and `archivedBy`, plus order updates, hold the editor's **profile id**. The source is `profile_data` where `user_ref == user_data/{uid}`, the same lookup as `authService.username()`, read once per board.
- **No email fallback:** a write without a profile id is refused with a message, so nothing is attributed to an email again.
- History `by: { profileid }` only (operator choice). The view resolves names from `profile_data/{id}`, once per person; older entries show their stored name or email.

**Migration** (admin banner "N segments still use the old id format" → "Migrate segment ids…")
- **Preview (reads only):**
  - Each segment whose id isn't an auto id, or whose who-fields hold an `@`.
  - Old id → new id, list size, history count.
  - Email → profile id, from `profile_data` by `email`, exact then lower-case. Unresolved emails are flagged and left as they are.
- **Run, per segment:**
  1. History is copied to the new parent under the **same doc ids**, with `segmentid` = new and `copiedfrom`. A re-run overwrites instead of duplicating.
  2. One batch then makes:
     - the new config (data, who fixed, `id` = new, `legacyid` = old);
     - the new list (`segmentid` = new);
     - the deletion of the old list (derived data);
     - a `migrate` history entry (doc id `migrate`);
     - the retired old config: `archived:true`, `migratedto`, `migratedAt`, `migratedBy`. Nothing is hard-deleted.
- Segments that keep their id only get their who-fields updated.
- **Saved Participant Intelligence filters** (`searchquery.pifilter.journeysegments` and `.exclude.journeysegments`) are remapped from old to new ids.
- **Re-running** skips any doc that already has `migratedto`. The board's load hides migrated docs and stops showing the banner once nothing needs migrating.
- Migration entries are labelled "New id" in the history views.

**Rules the run needs:**
- `segmentboardconfig` create and update;
- `segmentboardlist` create and delete;
- `segmenthistory` create, already granted;
- `searchquery` update.

**Verified on the harness (9 text-id segments, 2 with email who-fields):**
- The preview lists 9 rows with correct list and history counts.
- The run moves all 9 to auto ids with `legacyid`, retires 9 old docs, and leaves 0 old list docs. List sizes are identical, every list's doc id equals its `segmentid`, 15 history entries are copied plus 9 `migrate` entries, and emails become the profile id.
- The banner disappears and the board reloads on the new ids.
- A new segment gets an auto id with `id` = doc id, `createdBy` = profile id and the list under the same id.
- History shows "by Harness User" from the profile lookup.
- ng build ok; hook-diff aligned.

**e2e (hub):**
- SGB-02 finds the app-created segment by name. It asserts an auto id, `id` = doc id, `createdBy` without `@`, and list `segmentid` = id.
- SGB-06 checks `by.profileid`.
- SGB-ADDR3 registers the migration hooks and never drives them, because the run is a project-wide one-time write.

**Revert:**
- Code: restore from the previous commit (scratch copies in `engine.before-ids.ts` / `component.before-ids.ts`).
- Data: the old docs still exist (archived, with `migratedto`). Un-archive them, archive the new ones and recreate the old list docs, which a list refresh does on the old ids.
