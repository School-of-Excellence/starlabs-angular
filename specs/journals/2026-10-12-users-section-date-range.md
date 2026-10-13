# 2026-10-12 — EiFlix ops dashboard: date range on the Users cards

Operator ask: Today / 7D / 30D **and** a From–To range over the Users section, with **Total New Users**
filtered on the signup date and **New Users to Paid** on the move date.

Files: `eiflixoperationsdashboard.component.{ts,html}` · `eiflixoperationsdashboard.logs.spec.ts`
Hub: `workshops/eiflix-ops-dashboard.spec.ts` (WS-58) · `workshops/support/wshop.ts`

---

## 1. Why the default is "All", not "Today"

Every other range control on this dashboard defaults to Today. These cards must not.

They are **headline totals** — "Total New Users" has always meant every signup, and the operator reads
that number daily. Defaulting to a window would silently rewrite it (from thousands to single digits)
with no action from anyone. So `usersRange` starts at `'all'`, and `'all'` is also what Clear returns
to. Today / 7D / 30D / From–To narrow on request.

This also keeps **WS-30** honest: it asserts the card is ≥ the independently-counted seeded
population, whose rows are 1–3 days old. A Today default would have failed it — and the failure would
have looked like a regression rather than a deliberate redefinition.

## 2. The trap worth knowing: where the move date is read from

`rebuildPaidCard` renders each row from **participant metadata** when a twin exists
(`const src = pm || nud`) and falls back to the new-user document otherwise. That is deliberate and
predates this change — the paid card shows the person's full profile and journey.

The move date lives **only on the new-user document**. Reading it off `src` would therefore drop
*everybody who has a full profile* the moment a range was applied — the better-known customers would
vanish first, and the card would still look plausible. The filter reads `nud['movedon']` explicitly,
with a comment saying why, and a unit case (`paidWithPm`) seeds a metadata twin carrying no move date
so the row must survive Today on the strength of the new-user doc alone.

## 3. Other decisions

- **Zero Firestore reads per range change.** `new_user_data` is already a full realtime listener, so
  the raw docs are kept in `nudDocs` and every range change re-buckets in memory. Same principle as
  the EiFlix Report counting off `logAll`.
- **The window is computed once per rebuild**, not per row, and passed down to `inUsersWindow`.
- **Undated rows drop out while a range is active** and are kept when there is none — a row with no
  date cannot be placed in any window. Consequence: a profile flagged as moved but with no move date
  is invisible under every window and visible under All, so the two can differ by more than the
  window alone. Correct, but surprising if you have not read this.
- **B!G Participants is not filtered** — it comes from `participant metadata` and has no comparable
  date. Its caption says `· not date-filtered` while a range is active, because three numbers side by
  side under one range control otherwise look like they answer the same question.
- **A half-filled From–To reads as unfiltered** rather than filtering on one bound, and the existing
  "Pick both dates to apply the range" hint appears. Mirrors Engagement exactly — the markup reuses
  `.eod-seg` / `.eod-datefield` / `.eod-clear`, so there is **no new CSS**.
- **Reversed picks are tolerated** (earlier date wins as the start), again copying Engagement.

## 4. Coverage

- **Unit, 9 cases** (78/78 in the spec): the two fields filtering independently, the `paidWithPm`
  trap, undated rows, custom range incl. reversed and half-filled, caption transitions, and the range
  surviving a realtime emission.
- **WS-58** drives all seven new hooks against the real dashboard. The seed makes the two fields
  **disagree** — NU_C signed up 3 days ago and moved across today — so a card filtering on the wrong
  field shows a wrong number, not merely a smaller one. Every expected value is an Admin-SDK count
  over the whole collection (WS-54's lesson) and every read is polled (WS-30's lesson: the cards
  animate and the listeners settle after first paint).
- New oracles deliberately do **not** reuse `reportWindow()`: the Report's 7D starts at today−6 while
  this range (like Engagement) starts at today−7. Borrowing it would have made the oracle agree with
  a bug.

---

## 2026-10-13 — B!G Participants moved to its own section

Operator: remove Total B!G Participants from Users and give it a **B!G** section.

- **Only where it renders changed.** The `cards` array is untouched, so loading, the side panel and the
  live listener updates are all shared exactly as before. Two getters split it for the template:
  `userCards` (everything except B!G) and `bigCards`.
- **One card template, two grids.** The card button became `<ng-template #opsCardTpl>` rendered by both
  sections via `ngTemplateOutlet`, so the markup is not duplicated. `.eod-grid` is `auto-fill`, so the
  lone B!G card keeps normal width rather than stretching — no CSS change.
- **The "· not date-filtered" caption note is gone.** It existed only because B!G sat under the Users
  date range; in its own section there is nothing to disclaim. The unit case now pins the opposite:
  changing the Users range must leave the B!G caption untouched.
- **WS-59** asserts both halves — gone from Users (exactly two cards left) *and* present in B!G (exactly
  one card) — because checking only the new home would pass on a page rendering the card twice. It
  also opens the moved card's panel. WS-58 re-run alongside it to prove the template refactor did not
  break the range.

Verified: `ng build` EXIT=0 · unit 78/78 · WS-58 + WS-59 on the emulator — 2 passed.

---

## 2026-10-13 — Master Class Purchase card (Users section)

Operator: captured `workshoppaymentlog` rows; tag New User when the payer is in `new_user_data`;
show `amountRupees`, `datetime`, and the workshop's `detailpage.title` (via `workshopref`); filter on
`datetime` with Today / 7D / 30D.

- **One equality query** — `where('status', '==', 'captured')` exactly as asked, so no composite index —
  plus **one read of `workshopconfiguration`** into an id → title map. The Users range then narrows on
  `datetime` in memory, so range changes cost no reads. (Note the contrast with the EiFlix Report's
  masterclass figure, which queries a `datetime` range and checks status in an `if` — that was the
  operator's instruction for that query; this one is theirs for this one.)
- **New User tag follows the operator's literal rule**: the payer's id is present in `new_user_data`.
  That includes people who later moved to paid — deliberately, as asked. It is *not* the
  `movedtoexist !== true` definition the Total New Users card uses.
- `workshopref` is a DocumentReference; `refId()` also accepts a path string, so either shape resolves.
  A ref whose workshop is missing shows "Unknown workshop" rather than nothing; a row with no ref
  shows no tag. A non-numeric `amountRupees` counts as ₹0 rather than NaN-poisoning the total.
- The card rebuilds at the same four moments as the paid card (participant data, new-user data, range
  change, its own load), so names and New User tags stay current as the listeners settle.
- Card: count of purchases, `N new users` chip, caption `₹X collected [today / in the last 7 days…]`.
  Panel rows: name, New User tag, amber workshop tag, amount, purchase date/time.
- WS-59 updated: Users now holds exactly **three** cards (still no B!G).

**WS-60**: four seeded payments on the existing W_DASH workshop (no new workshop doc, so no other
suite's counts move). The FAILED payment's payer pays for nothing else, so seeing that person anywhere
means the status filter leaked — asserted first. Counts match an Admin-SDK oracle over the whole
collection under All and Today; the new user's row carries the New User tag, the workshop title and
`₹499`; the participant's row carries no New User tag.

Verified: `ng build` EXIT=0 · unit 83/83 (5 new) · WS-30, WS-58, WS-59, WS-60 on the emulator — 4 passed.

### 2026-10-13 (later) — Master Class card polish + journey in the panel

- **Panel overlap fixed.** The workshop tag sat inline with the name and `.eod-tag` is `flex: none` +
  uppercase, so a long title ("SUP!R METABOLISM PROGRAM FOR IMPACT CREATORS") could neither shrink nor
  wrap and ran under the phone/date column. It now has its own line under the name, wraps within the
  column (`max-width: 100%`, `overflow-wrap: anywhere`), and uses a 7px radius — a 999px pill becomes a
  stadium once it wraps. Verified by rendering the row with the real CSS at the panel's 460px width.
- **"collected" removed; the ₹ total is highlighted** as its own amber figure under the count
  (`OpsCard.highlight`, a generic optional field — only this card sets it). Caption is now
  `Captured payments` / `Captured payments · <range>`.
- **Journey on participant rows.** `journeyTagFor(pm)` — the same helper the paid card uses — so it is
  only ever present for participant-metadata payers. Journey names load asynchronously; the existing
  rebuild hook after `loadJourneyNames` fills the tags in once they arrive.
- **Seed gotcha worth knowing:** the seeded journey doc names itself in `journeyname`, but this dashboard
  reads `journey`. WS-60's seeder adds `journey` to JRN_BIG for the case and deletes it afterwards.
  If production journey docs also use `journeyname`, the paid-card and masterclass journey tags would
  be blank there too — worth a glance at a real journey doc.

Verified: build EXIT=0 · unit 84/84 · WS-59 + WS-60 on the emulator — 2 passed (WS-60 now also checks
the highlighted total against an Admin-SDK sum, the absence of "collected", and the journey tag).

---

## 2026-10-13 — Device Breakdown: From–To alongside 1M / 2M / 3M

- **No new reads.** The breakdown is summed from `eiflixdailywatchers` register pages already in memory;
  a From–To only changes which pages are summed. Page ids and `<input type="date">` values are both
  `yyyy-MM-dd`, so the window is a plain string comparison on the key — no date parsing, no timezone
  edge.
- **One window for chart and panel.** `computeDeviceBreakdown` and `platformPerProfile` each had their
  own copy of the `months * 30` cutoff; both now call `dbKeyBounds()`, so the donut and the viewers
  panel can never disagree about the range. Bounds are inclusive on both ends; a reversed pick is
  tolerated; a half-filled pair is ignored with the usual hint; a 1M/2M/3M click clears the dates.
- **From is floored at `naRegisterSince`** (the earliest register page held). The section cannot show
  anything before the register begins, so the picker does not offer those days.
- Markup reuses the Engagement/Users controls (`.eod-eng-controls`, `.eod-datefield`, `.eod-clear`) —
  no new CSS. New hooks: `eif-db-range-from`, `eif-db-range-to`, `eif-db-range-clear`.
- Unit harness note: `computeDeviceBreakdown` reads the `platformColors` / `platformExtraColors` class
  fields, which `Object.create(prototype)` skips — the fixture sets them.

**WS-61** seeds register pages at -20d and -50d — outside the 7-day window the dashboard heals and
rewrites on load, inside the 90 days it reads — under platform names nothing real writes, merged so an
existing page for those days keeps everything else, and never touching `profileids` (Non-Active reads
that). 1M shows only -20d; 2M adds -50d; From–To `-50d..-45d` shows only -50d at `1h`; Clear returns to 1M.

Verified: build EXIT=0 · unit 89/89 (5 new) · WS-61 on the emulator — 1 passed.

---

## 2026-10-13 — New Users to Paid: Watson "TOTAL AMOUNT" per person and on the card

Operator: show Journey Support's TOTAL AMOUNT for each person in New Users to Paid (panel) and on the
card. Only `eiflixoperationsdashboard` changed — Journey Support is untouched (operator directive).

**The rule is copied, not reinvented** — `watsonPlanTotal()`: Σ Payment Schedule `amount / 1.18`,
skipping `schedulemodified != true` rows (kept deliberately loose, exactly as Journey Support filters).
Pinned by a unit case using the first four rows of the operator's Journey Support screenshot
(16,520 / 10,000 / 65,000 / 36,800 → ₹108,746). Formatted with `formatCurrency(..,'en-US','₹','INR','1.0-0')`
— byte-for-byte what Journey Support's currency pipe renders (₹2,724,000).

**The lookup is the same chain, batched:**
- Journey Support: per person, 3 reads — `profile_data/{id}` → Watson `Participants` where email == →
  Watson `Payment Schedule` where participantid == (+ orderBy date).
- Here: email taken from memory (participant metadata first, then new_user_data) instead of reading
  `profile_data` — the CF `profiledata_to_participantmetadata` keeps them in step; **if they ever
  diverge for someone, that person's total could differ from Journey Support.** Then `email in [≤30]`
  and `participantid in [≤30]` — 2 queries per 30 people. No `orderBy` (a sum does not care about
  order), so no composite index is needed on the Watson side.
- Participant choice matches: Journey Support takes the first doc of an email-equality query (doc-id
  order); a batched `in` returns many emails, so `firstWatsonParticipantId()` takes the lowest doc id
  per email.

**Cost and caching:** fetched once per person per visit, after both directories load; range changes
and panel opens re-read nothing. Read cost lands on the Watson project: roughly one Participants doc
plus every schedule row for each paid person — e.g. 300 people × ~40 rows ≈ 12,000 Watson reads per
dashboard open.

**Display:** panel rows show the person's total (`—` = not found in Watson / no schedule, `…` = still
loading); the card shows the sum over people currently in the card, so it follows the Users range,
labelled "TOTAL AMOUNT". A build with no Watson config (the emulator build, `watson: null` by design)
shows neither — never a misleading ₹0 — and logs nothing.

**Watson initialisation** copies `AuthguardService.initializeWatson` (5 lines) rather than injecting the
service: this route is unguarded by design and injecting AuthguardService could start its constructor
work here.

**Coverage:** unit 96/96 (7 new: the rule, reschedule filter, participant choice, panel labels, card
sum, range, loading and no-Watson states). **WS-62** checks the only path CI can reach — no Watson:
card and panel keep working, no total shown, no console error. WS-58 and WS-60 re-run alongside.
The live Watson value cannot be e2e-tested without reaching the finance project, which tests must not do.

### 2026-10-13 (correction) — the Watson lookup is now Journey Support's EXACT logic

The entry above described a batched lookup (email from memory, `in` queries of 30). **The operator
rejected that: "the exact same logic" as Journey Support.** It is replaced:

- `journeySupportParticipantId()` and `journeySupportTotal()` are line-for-line copies of the matching
  loop and running total in `journeyplan.component.ts watsonParticipantSchedule()`.
- Per person, the same three reads in the same order: `profile_data/{profileid}` → Watson
  `Participants where email ==` → `Payment Schedule where participantid == orderBy date asc`.
  Only two things differ, neither touching the logic: each person is cached for the visit, and six
  people run at a time.
- **"Not found" is never ₹0 now.** A person not in Watson shows `—`; the card sums only people Watson
  found and says `total amount · N of M found` when some are missing, or `— not found in Watson`
  when none are. The first version summed `null` as 0 and showed **₹0 for 51 people** — which is
  what the operator saw.

**Why the operator saw ₹0 on localhost — the real cause, not the code:** `ng serve` uses
`environment.development.ts`, which points StarLabs at **production** (`fir-sample-aae4a`) but Watson
at the **test** project (`watson-test-19`). Production people do not exist in test Watson, so nobody
was found. Journey Support on localhost has the same behaviour. The operator fixed the database side
and confirmed it works.

**Unit-test hygiene:** the older Users-range fixture never set `loading`/`pmLoading`, so once the paid
card started triggering the lookup, a unit test called it — `initializeApp` with the Karma build's
Watson config, failing only because the harness has no StarLabs Firestore. Fixtures now mark loading
in progress; the run logs **0** lookup attempts.

Verified: build EXIT=0 · unit 97/97 · WS-58 + WS-62 on the emulator — 2 passed. No hub change needed.

### 2026-10-13 (later) — New Users to Paid: caption, Amount sort, total in words

- **Caption** "Moved to existing / paid profiles" → **"Purchased Journey"** (`· <range>` when a range
  is active).
- **No label inside the amount pill** — the "TOTAL AMOUNT · N OF M FOUND" text is gone at the
  operator's request; the pill shows the amount only.
- **Total in words, Indian system**, under the pill — `indianNumberWords()`: crore / lakh / thousand /
  hundred, rounded to the rupee, crore recursing past 99 (`1000000000` → "One hundred crore").
  `10486474` → "One crore four lakh eighty-six thousand four hundred seventy-four". Hidden for ₹0,
  "…" and "—".
- **Amount sort** in the panel ("Amount high–low"; people not found in Watson last). Offered by
  `setPanelRows` when rows carry a numeric `planValue` — the same data-driven pattern that offers
  "Watch hours" only when rows have hours. A first attempt set it in `openPanel`, but `setPanelRows`
  rebuilds `sortOptions` from the rows and silently dropped it; the unit test caught that.

Verified: build EXIT=0 · unit 100/100 (3 new) · rendered the card with the real CSS. No hub change: no
new hooks, and nothing in the hub depended on the removed text. Amount sort and the words appear only
with Watson data, which the emulator build deliberately lacks — covered by unit tests.
