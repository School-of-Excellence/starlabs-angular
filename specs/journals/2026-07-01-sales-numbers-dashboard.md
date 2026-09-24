# Journal: Sales Numbers Dashboard — new standalone GSV/ASV analytics screen

**Date:** 2026-07-01
**Repo:** `starlabs-angular`
**Branch / commit:** pushed to `joshua-development` as `a917323` (rebased onto remote tip `612664c`)
**Files added/changed:**
- `src/app/Journey Onboarding/sales-numbers/` (component .ts/.html/.css, `sales-numbers.service.ts`, `sales-numbers.models.ts`)
- `src/app/Journey Onboarding/sales-teams/` (component .ts/.html/.css)
- `benchmark/seed-sales.mjs`
- `src/app/app.routes.ts` (+2 routes), `src/app/auth.guard.ts` (test-only bypass)
- `SANITY_REVIEW.md` at repo root — **intentionally not committed** (diagnostic; not yet gitignored)

---

## What this is

A new, self-contained sales-measurement dashboard at `/sales-numbers` plus a `/sales-teams` grouping screen, seeded against the **`starlabs-test`** cloud project. It measures sales by GSV vs ASV, cancellations, and net contribution, filterable by time frame, product, type, source, original source, salesperson, and team — with breakdown tables by person/team, product, type, and source, and a sales-vs-cancellations trend chart.

---

## Load-bearing decisions and WHY

### 1. Built standalone, NOT by extending `sales-dashboard-clone`
The production `/sales-report` is `sales-dashboard-clone.component.ts` — ~4,865 lines, one giant `calculateDashboardMetrics()`. The operator explicitly chose a **new standalone component** over extending it. Why: the clone is dense and fragile (see §5), and this dashboard has a different, narrower spec. Keeping it separate means no risk to the live report and a clean, testable `aggregate()` pure function in the service. Trade-off accepted: the two screens' numbers do **not** yet reconcile (see §5, Pending).

### 2. Test-only synthetic data model, and WHY the filters are data-driven
Production `salesleads` has salespeople, `journeytype`, `paymentplanassureddate`, cancellations — but **no** `source`, `originalsource`, `product`, or team concept. Rather than block on production schema, we added synthetic fields to the seed on `starlabs-test`:
- `source` / `originalsource` (last-touch / first-touch channel; distinct value sets)
- `product` (category: Ecosystem / DFU / FTO / Gift) — the top filter
- `productName` (specific product: uP! / LYL / B!G / W!SH for Ecosystem; placeholders elsewhere) — the By-Product breakdown
- `saletype` (new/upgrade/addons) mirrored **onto cancellation docs** so cancellations can be typed and filtered by type
- a new `sales_teams` collection (`{ team, members[] }`)

**Key architectural choice:** every filter's option list is derived at runtime via `distinct(sales.map(l => l.<field>))` in `sales-numbers.service.ts` — **nothing is hardcoded in the UI**. Consequence, and the answer to the operator's "how do I add more sources later": in test, edit the arrays in `benchmark/seed-sales.mjs` and re-seed; in production, whatever value the app writes onto a sale simply appears. Adding a channel is a data change, never a code change.

When production lands, `product`/`productName` should come from the `journey` collection (journey `type` → category; journey name → specific product, mirroring the clone's `loadJourneyNames`), not these seeded fields.

### 3. GSV/ASV is a single GLOBAL metric, not two columns
First iteration showed GSV and ASV side by side. Operator: "I don't want to see both numbers." So the GSV/ASV toggle became a **global filter** driving every surface (KPI card, tables, net, chart). Crucially this also splits cancellations: in ASV mode the numbers use **assured** cancellations only, in GSV mode all (gross) cancellations — matching the clone's `grosscancelled` vs `assuredcancelled` split. `ASV` was confirmed to mean **Assured** Sales Value (payment-plan confirmed), not "average".

### 4. Net Contribution merged into one 4-card row
There were originally two overlapping sections — a KPI strip and a Net Contribution panel — that restated the same three numbers. Operator caught the duplication. Merged into a single row of four larger cards: **Total · Cancelled from current-month sale · Sales after cancellation · Total Live cancellation.** No figure now appears twice.

### 5. Reverse-engineered the production `/sales-report` calc (5 parallel agents) — the reconciliation gap
Before trusting our numbers, we deployed 5 agents to map `calculateDashboardMetrics()` line-by-line. Canonical production semantics (source of truth):
- **ASV = a sale has a non-empty `paymentplan`** (line 3818) — NOT `paymentplanassureddate`. Our service currently keys ASV off `paymentplanassureddate`. **Divergence.**
- **Cancellation magnitude = `balanceamount`** (`original.totalpurchasevalue − cancelRecord.totalpurchasevalue`, resolved via `canceldocid`). Ours uses the cancellation doc's full `totalpurchasevalue`. **Divergence.**
- **"Actual" gross/assured = a clean re-count** excluding cancelled + downgrade, not `gross − cancelled` arithmetic. Ours does subtraction and ignores downgrades. **Divergence.**
- **Status:** clone drops `status==='rejected'` and separates pending; ours applies **no** status filter. **Divergence.**
- Test-data exclusions in the clone (`journey === 'InLXMl7OBAqlDTZcXwK0'`, internal `soexcellence.com` on one journey) — not replicated.
- **"Team" is NOT a real concept in the clone** — the only `!== 'Team'` references are defensive no-ops. Confirms our team feature is greenfield (nothing to reuse or collide with).

Surprises found in the clone worth recording: its headline `gross.totalValue` sums **all** statuses (pending money inflates it) while `gross.data` count is approved-only, so value and count have different populations; the incremental `removeSale`/`calculateDashboardMetricForSale` path is **dead code** and `removeSale`'s array splice is buggy; interpolated `metric[\`gross${journeytype}\`].totalValue` is unguarded and would throw on an unexpected `journeytype`.

### 6. Breakdown tables each ignore their OWN filter
`byProduct`, `byType`, `bySource` are computed with composable per-field predicates (`fSource`/`fType`/…) so each breakdown honours all filters **except its own dimension** — otherwise selecting one source would collapse the By-Source table to a single row. (By-Product groups by `productName` and does honour the category filter, since the filter is on `product`, a different field.)

---

## Seeding — the `--wipe` lesson

`benchmark/seed-sales.mjs` writes to the **live cloud `starlabs-test`** (its Firestore rules are open, so the client SDK writes without auth — probed and confirmed before building). Doc ids are deterministic (`sn_seed_NNNN`) so gross-sale rows overwrite in place. **But cancellation ids (`sn_seed_cancel_NNNN`) depend on which rows the RNG cancels, and that set changes between runs** — so re-running without wiping leaves **stale cancellation docs with old field values**. This bit us when changing the source value set: old `Direct`/`Paid Ads`/`Partner` values lingered. Fix and standing rule: **use `node benchmark/seed-sales.mjs --wipe` whenever value sets change** (it deletes `seedTag == 'sales-numbers'` docs first).

---

## Push saga (why it wasn't a clean one-shot)

Operator asked to push to `joshua-development`. Two real obstacles:
1. **Broken git credential helper.** Git was configured to auth via `/Users/joshua/Claude/Donna/bin/gh` — a path that doesn't exist — so pushes/fetches failed ("could not read Username"). Worked around by overriding for single commands with the real `gh` at `/opt/homebrew/bin/gh` (`-c credential.helper='!/opt/homebrew/bin/gh auth git-credential'`). No permanent config change made. **Pending:** fix the stored helper.
2. **Stale remote-tracking ref.** Because the earlier fetches auth-failed silently, `origin/joshua-development` stayed pinned at `e3791ab` while the real remote tip was `612664c`. Basing the commit on the stale ref produced a non-fast-forward rejection. `git fetch origin joshua-development` (no colon refspec) only updates `FETCH_HEAD`, not the tracking ref — had to fetch with an explicit `+refs/heads/...:refs/remotes/...` refspec to correct it. Then rebased the single feature commit onto the real tip and pushed a clean fast-forward (`612664c..a917323`). No force, no other commits touched. The stale local `joshua-development` branch (1 unrelated local Arena commit `301a8f1`, ~44 behind) was left untouched.

---

## Pending / follow-ups

- **Reconcile metrics with `/sales-report`** (the big one): ASV → `paymentplan`; cancellation → `balanceamount` via `canceldocid`; "Sales after cancellation" → Actual-Gross re-count incl. downgrades; add status filtering; replicate test-data exclusions.
- **Read-error handling:** `reload()` in the component has no try/catch — a failed Firestore read leaves the spinner stuck. Add error state.
- **Team delete has no confirm** (`sales-teams.component.ts` `deleteTeam`) — one misclick is irreversible.
- **Production scale / PII:** service does whole-collection client reads (`loadAllSalespeople`, 6-month chart loads). Move aggregation server-side and minimize PII before prod.
- **Real product names** for DFU / FTO / Gift (currently placeholders "DFU Core/Elite", "FTO Trial", "Gift Pack").
- **`SANITY_REVIEW.md`** is untracked and not gitignored — decide keep-local vs gitignore.
- Diagnostic detail lives in `SANITY_REVIEW.md`; canonical clone semantics captured above in §5.

---

## Addendum — 2026-07-02: product-segment redesign (for review by Charan → prod)

Operator reshaped the top of the dashboard from "one global view + Product/Type filters" into a **four product-segment card layout**, and removed the redundant sections. What changed vs the pushed `a917323`:

- **Cards replace filters + tables.** Four segment cards — **Ecosystem · DFU · FTO + Gift · All** (FTO and Gift clubbed; All is a true rollup) — each carrying the metric-aware total, an inline **New / Upgrade / Add-on** split, and Cancelled / Net. This **removed** the Product filter, the Type filter, the standalone Net Contribution card row, the By Product table, and the By Type table. Kept: GSV/ASV toggle, time frame, Source / Original Source / Sales Person / Team filters, By Sales Person/Team table, By Source table, trend chart.
- **Team scopes the cards.** The Team filter recomputes all four cards; an active-team chip appears when one is selected. Decision recorded: team is a *filter over the product cards*, not a separate card dimension.
- **Aggregation change** (`sales-numbers.service.ts`): `SalesGroupMetric` gained a per-type split (new/upgrade/addons × gross/assured); `accumulate()` tallies it; `segments` + `allSegment` are built by mapping product → segment; `byProduct` / `byType` / the `NetContribution` shape were dropped. `totals === allSegment`.
- **Styling** iterated to a bright iOS-system look: controls + filters merged into one toolbar card; segment cards use solid iOS-colour icon tiles (systemBlue/Green/Orange/Indigo) with white glyphs, a soft same-hue card wash, and vivid totals, over the refined "liquid-glass" material.

Reviewer notes: the **Pending / follow-ups** above still stand — especially the **metric reconciliation with `/sales-report`** (ASV=`paymentplan`, `balanceamount` cancellations, status filtering, downgrades, test-data exclusions) and **read-error handling** — these should be resolved before the numbers are trusted in production. Data remains seeded synthetic on `starlabs-test`; production `product`/`productName` must come from the `journey` collection mapping, not the seeded fields.

---

## Addendum — 2026-07-08: participant name, configurable sources, teams by name→profileid

Three follow-up fixes (commit `1fa7351`, on `joshua-development`). Validated read-only against `starlabs-test` (467 leads) before building; both open design forks were put to the operator.

- **Participant name in Assign Source.** The customer name lives in `salesleads.name` (present on all leads; `firstname`/`lastname` are the fallback). Mapped to `SaleLead.participantName` and shown as the first column of the Assign Source table.
- **Configurable sources — Firestore-only (operator choice).** `classify` already exists (29 config docs); the house shape for id+name lists is `classify/channelcategories = { categories: [{id,name}] }`. So sources now live in `classify/source_options = { sources: [{id,name}] }`, seeded once by `benchmark/seed-source-options.mjs` (ids are stable slugs). The screen reads it (`loadSourceOptions`), stores the **id** on `salesleads.source`, and maps id→name for the By-Source breakdown, the dashboard Source filter, and the Assign Source picker. Adding/renaming a source is a console edit — **no code change**. `salesleads.source` was empty on test (0/300), so the switch to id-storage was a clean slate. WHY id-not-name: renaming a source label must not re-tag existing leads; the id is the stable key. Changing/deleting an id orphans leads carrying it.
- **Teams by name→profileid — pick any salesperson (operator choice).** Members are stored as profileids; you assign by picking any salesperson seen in sales. **Key surprise:** `salesleads.salespersonname` holds *short* names ("Harish", "Manoja", "Abhinaya") while `users_roles.name` holds *full* names ("Harish R", "Manoja Ramachandran", "Abhinaya B"), so exact matching linked only **4/16**. Operator chose **exact + unique-prefix**: `loadProfileIdsForNames` runs a per-name prefix-range query (`name >= n && name <= n+`) and links only when **exactly one** profile matches (exact, or `n `-prefixed) — resolves **11/16**; short and full forms of one person collapse to the same profileid, so team credit is consistent. Genuinely ambiguous names (two real "Meena"/"Ragavendhiran" people) and junk ("Test", a raw uid) stay unassignable **by design**. Legacy text members (`team_dong_lee → "Abhinaya"`) **auto-heal** to their profileid on load. `aggregate()`'s `teamOf` uses the same broad map, so dashboard team-grouping works for anyone resolvable.

Compiles clean (AOT template check + `tsc`); the `EXIT=1` on `ng build` is entirely pre-existing LiveKit type errors, none in sales-numbers.

Still open / follow-ups: **production** needs `classify/source_options` created before this ships there, and if prod `salesleads.source` already holds text (test's was empty) those values won't map to names until migrated. Salesperson identity still hinges on `users_roles.name` — the 5 unresolved names need a real user record (or a name fix) to join a team. Name collisions resolve to "unassignable", not a guess. Prior addenda's metric-reconciliation and read-error-handling items still stand.
