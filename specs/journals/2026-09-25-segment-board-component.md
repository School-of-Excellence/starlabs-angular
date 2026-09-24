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
