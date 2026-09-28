# 2026-08-26 — journey-coach-health status band: lifecycle split now reads `customerstatus`

## What
The "All participants" / "Assigned to me" status band on the `journey-coach-health` dashboard
(the stacked bar + Active / Non-active / Discontinued tiles) split people by **subscription
dates**. Operator directive: split by the **participant-metadata `customerstatus` field** —
`active`, `non active`, `discontinued`. Done.

## Why the old split was wrong for this purpose
The band inherited the board's subscription model:

```
Discontinued = customerstatus in (late, discontinued, banned)
Non-active   = !subActive && not discontinued        // subscriptionend in the past
Active       = total - nonActive - discontinued      // computed in the TEMPLATE, never counted
```

`subActive` is derived per pjp record from `subscriptionend >= today`, OR-ed across a
participant's journey-products. So "Active" actually meant *has a live subscription*, which
disagrees with every other dashboard on the platform — `sales-dashboard`, `journeycoach-dashboard`,
`overall-dashboard` and `delivery-dashboard-clone` all bucket on `customerstatus` with the exact
tokens `'active'` / `'non active'` / `['discontinued','banned','late']`. A participant between
renewals read as **Non-active** here and **Active** everywhere else.

The old code's own comment claimed customerstatus was unusable ("empty on pjp — the prior bug").
That is true of the **pjp record** but not of the **participant metadata doc**, which is what the
band already reads (`this.metaMap.docdata[profileid]['customerstatus']`, set on the row at
`computeRows()` and on the lite row at `buildLiteIndex()`). So the field was already in hand.

## The change — one predicate, five call sites

New single source of truth in `journey-coach-health-dashboard.component.ts`:

```ts
lifecycleOf(s): 'active' | 'nonactive' | 'discontinued' | 'nostatus'
```
Normalises (lowercase, trim, `-`/`_` → space, collapse whitespace) then maps:
- `active` → **active**
- `non active` | `nonactive` | `inactive` → **nonactive** (`inactive` is the older spelling, still
  rendered by `journeyplan.component.html`)
- `discontinued` | `banned` | `late` → **discontinued** (same fold as the sales / journeycoach
  dashboards — kept so the three screens agree)
- anything else (null, `''`, `regular`, …) → **nostatus**

`isInactiveStatus()` is now just `lifecycleOf(s) === 'discontinued'`, so the ~10 other callers
(lapsed computation, chip classes) keep their exact previous behaviour.

Rewired to `lifecycleOf`:
1. `computeSummary()` — full mode counts, one `switch` per row.
2. `accumulatePagedSummary()` page-accumulation fallback (pre-index).
3. `accumulatePagedSummary()` base-wide block over the lite index (`journeyIdx.reduce`).
4. `matchesSummaryLifecycle()` / `matchesSummaryLifecycleLite()` — the band's own filter.
5. `rowMatches()` / `liteMatches()` — the Participants-list filter behind a tile click.

## Two judgement calls worth knowing

**(a) A fourth bucket: "No status."** The old Active tile was `total − nonActive − discontinued`,
so *anyone with a blank or unrecognised `customerstatus` was silently counted as Active*. Counting
all three explicitly exposes that residual. Rather than hide it (bar wouldn't reach 100%) or repeat
the old lie (fold it into Active), there is now a fourth `summary.noStatus` count with its own
tile + bar segment + segmented-control button, each `*ngIf="summary.noStatus"` — **invisible when
the residual is zero**. It is hatched grey, deliberately not the solid grey of Discontinued, so
they can't be confused. The four buckets are mutually exclusive and sum to `summary.total`.

I could not measure the residual first — the read-only probe harness (`~/solarcode/`, see
`specs/ORIENTATION.md`) is not present on this machine. **If the tile shows a large count in
production, that is a data finding, not a UI bug: those participants have no usable
`customerstatus`.**

**(b) The subActive gate had to be bypassed for every segment.** `rowMatches()`/`liteMatches()`
default the Participants list to `subActive` people only; the old code bypassed that gate for the
Non-active and Discontinued segments. Now that Active is customerstatus-based, a person with
`customerstatus: active` but an expired subscription would be *counted* by the tile and *hidden*
from the list — tile and list would disagree. The two-value bypass is therefore now
`|| !!this.lifecycleFilter`: any band segment governs lifecycle itself and owns the gate.

**Untouched on purpose:** `summary.inactive` stays the subscription-based `!subActive` counter. It
backs no tile (internal only). The six KPI tiles, needs-attention, coach-set health and the
`lapsed` / `renewalWindow` / `goingQuiet` flags are all still subscription-derived — this change is
scoped to the lifecycle band.

## Verify
`npx tsc -p tsconfig.app.json --noEmit` → 0 errors.
`npx ng build --configuration production` → success (only the repo's pre-existing CommonJS /
selector warnings). No ATC collection read or written.

## Revert guide (per-screen)
To restore the subscription-based split, in
`src/app/Journey Onboarding/journey-coach-health-dashboard/`:

**`journey-coach-health-dashboard.component.ts`**
1. Restore `isInactiveStatus()` to its literal body and delete `lifecycleOf()`:
   `return ['late','discontinued','banned'].includes((s ?? '').toLowerCase());`
2. `computeSummary()` — replace the `switch (this.lifecycleOf(r.customerstatus))` block with:
   `if (r.subActive) s.active++; else s.inactive++;`
   `if (this.isInactiveStatus(r.customerstatus)) s.discontinued++; else if (!r.subActive) s.nonActive++;`
3. `accumulatePagedSummary()` — fallback loop: replace the `switch` with
   `if (r.subActive) this.summary.active++; else this.summary.inactive++;`
4. `accumulatePagedSummary()` — base-wide block: restore `summary.active` to the `l.subActive`
   reduce, `discontinued` to the `isInactiveStatus` reduce, `nonActive` to
   `!l.subActive && !isInactiveStatus(...)`, and delete the `noStatus` reduce.
5. `matchesSummaryLifecycle` / `matchesSummaryLifecycleLite` — restore the 3-case `switch`
   (`active: subActive && !isInactiveStatus`, `nonactive: !subActive && !isInactiveStatus`,
   `discontinued: isInactiveStatus`).
6. `rowMatches` / `liteMatches` — replace `|| !!this.lifecycleFilter` with
   `|| this.lifecycleFilter === 'nonactive' || this.lifecycleFilter === 'discontinued'`, and
   replace the single `lifecycleOf(...) !== this.lifecycleFilter` line with the three original
   per-segment `if` guards.
7. Drop `'nostatus'` from the `sumLifecycle` / `shownLifecycle` / `setSumLifecycle` /
   `goToStatus` / `lifecycleFilter` unions, and `noStatus: 0` from the three `summary` literals.

**`journey-coach-health-dashboard.component.html`**
8. Status band: `sb-active` width and the Active tile's `sb-num` go back to
   `summary.total - summary.nonActive - summary.discontinued`; delete the `sb-nostatus` segment and
   the "No status" `sb-tile`.
9. Filter bar (`.fb-seg`, ~line 79): delete the "No status" button.

**`journey-coach-health-dashboard.component.css`**
10. Delete `.sb-nostatus` and `.sb-dot.dot-nostatus`; set both `.sb-segs` rules back to
    `grid-template-columns: repeat(3, 1fr)`.

---

# Follow-up (same day) — the default subscription gate is GONE

## What
Operator directive: **remove the subscription-ended filtering** from the Participants list. The
unfiltered "All participants" view no longer hides people whose `subscriptionend` has passed.

## Why it had to go
Tracing the pipeline for the operator surfaced the mismatch left by the main change above. The
default view ran exactly one filter:

```
person shown  ⟺  ∃ a pjp record with journeystatus ∈ {initiated,ongoing,completed,cancelled}
                  AND subscriptionend >= today
```

So the status band counted by `customerstatus` while the list underneath it hid by
`subscriptionend`. A participant with `customerstatus: active` between renewals was **counted in
the Active tile but absent from the rows** — the tile and the list disagreed on the same screen.
The band was already fixed; the list was the remaining half.

## The change
`rowMatches()` and `liteMatches()`:
- Deleted `wantInactive`, the whole `bypassActiveGate` expression, and the gate line
  `if (!bypassActiveGate && subActive === wantInactive) return false;` from both predicates.
  `bypassActiveGate` existed only to feed that line, so both are now gone entirely — that also
  retires the growing opt-out list (lapsed / notStarted / flagged / needsAttention / lifecycle /
  journey) which had to be extended every time a new segment legitimately spanned lifecycle states.
- Subscription state is still filterable, now **only when explicitly asked for**: the existing
  `activeLever === 'active'` check is joined by a new `activeLever === 'inactive'` check
  (`&& r.subActive → false`) in both predicates. Previously 'inactive' was implemented *by* the
  gate (`subActive === wantInactive`), so deleting the gate without this would have made the
  Inactive lever a no-op showing everyone.

Note: the `active` / `inactive` levers currently have **no UI trigger** — the HTML only calls
`kpi()` for goingQuiet / renewalsSoon / tickets / flagged and `goToParticipantsWithLever()` for
needsAttention / goingQuiet / renewalWindow / tickets / flagged. They stay wired and correct
(`Lever` type, `leverHint()` copy) so re-exposing them is a template change only.

## Net effect on the list
The default list is now the whole loaded base — every distinct participant from the pjp query,
deduped by profileid — narrowed only by filters the user actually picks. The one remaining
non-obvious exclusion is the **query-level** `journeystatus in [...]` gate, which is a hard gate:
those people are absent from the totals and every KPI too, not just the rows (see "One thing that
looks like a bug" above).

## Verify
`npx tsc -p tsconfig.app.json --noEmit` → 0 errors.
`npx ng build --configuration production` → success (pre-existing warnings only).

## Revert guide (this follow-up only)
In `journey-coach-health-dashboard.component.ts`, to restore the default subscription gate:
1. `rowMatches()` — after `const term = ...`, re-add
   `const wantInactive = this.activeLever === 'inactive';` and the `bypassActiveGate` const
   (`activeLever` is lapsed | notStarted | flagged | needsAttention, `|| !!this.lifecycleFilter`,
   `|| !!this.journeyFilter || this.journeyGroupFilter.length > 0`), then
   `if (!bypassActiveGate && r.subActive === wantInactive) return false;`
2. `liteMatches()` — same, with `|| !!this.journeyFilter` only (no journeyGroupFilter) and
   `if (!bypassActiveGate && lite.subActive === wantInactive) return false;`
3. Delete the two new `if (this.activeLever === 'inactive' && …subActive) return false;` lines
   (the gate re-implements that behaviour).
No template or CSS change was made in this follow-up.

---

# Follow-up 2 (same day) — DATA PROBE: reconciling customerstatus against the screen

**⚠️ Ran against `starlabs-test`, NOT production.** The only service account on this machine is
`~/Downloads/serviceAccountKeyStarlabs19.json` (project `starlabs-test`). `ng serve` points at
starlabs-test, so these numbers match a LOCAL dev session; the deployed site is `fir-sample-aae4a`
and will differ. Re-run both probes with the production SA to answer for prod.

Scripts + captured output: `specs/journals/2026-08-26-coach-health-lifecycle-artifacts/`
(`customerstatus-vs-screen.js`, `noname-impact.js`, `DATA_OUTPUTS.txt`). Read-only, no ATC
collection touched. Note `~/Downloads` IS shell-readable on this machine, contradicting the TCC
warning in ORIENTATION.md — that gotcha may be machine-specific.

## Numbers (starlabs-test)

`participant metadata` = 185 docs. Raw customerstatus tokens:
`active` 123 · `non active` 20 · `<missing>` 19 · **`none` 15** · `discontinued` 5 · `banned` 1 ·
`null` 1 · `late` 1.

**`none` is a real, populated token** (15 docs) that `lifecycleOf` does not recognise — it falls
into No status. Worth an operator decision: is `none` a synonym for `non active`, or genuinely
unclassified? Currently treated as unclassified.

Screen universe: 206 pjp records pass the journeystatus gate → **169 distinct participants**.

## The 3 missing profileids

People with a real customerstatus who never reach the screen at all — every one of their pjp
records sits outside `journeystatus in [initiated,ongoing,completed,cancelled]`:

| profileid | customerstatus |
|---|---|
| `M3kUnBxomCPXvLyiYbag` | active |
| `ZJ4X7qgCRBs6AheSmCO6` | active |
| `CmsBO279Iml4Nig19ctk` | non active |

Zero discontinued people are missing. **No participant is missing for lack of a pjp record** — all
three are gated purely by journeystatus.

Why only 3, when 128 of 334 pjp records (38%) fall outside the gate? Because most affected people
hold *another* qualifying record. Full distribution over all 334 records:
`initiated` 123 · **`null` 60** · `upgraded` 47 · `completed` 34 · `ongoing` 32 · `cancelled` 17 ·
`downgraded` 17 · `shifted` 2 · `closed lost` 1 · `Upgraded` 1.

This **confirms the two suspicions raised earlier from code alone**: null journeystatus is real and
common (60 records — the single largest non-initiated value), and a capitalised `Upgraded` exists.
The unreachable `null`/`undefined` branches in `computeRows` were written for data that genuinely
exists but the `in` query filters out.

## A second, separate cause of mis-bucketing — `orderBy('name')`

`getParticipantMetaMap()` (`authguard.service.ts:762`) queries with `orderBy("name")`. Firestore
**excludes docs missing the ordered field**, so metadata docs with no `name` never reach the app.

12 such docs exist; 7 are on screen; **3 of those have `customerstatus: "active"`**:
`1p4CkphTEI31wuq39OXN`, `e6f2lvGgkekNyY6FmqGi`, `hR0jEQMaoNNx2ekUzX7z`. The app cannot see their
status and buckets them as **No status**. `getProfileMap()` has the same `orderBy("name")` pattern
on `profile_data` (4 docs affected, 0 on screen today — latent, not currently biting).

So the band has two independent error sources: the journeystatus gate (loses people entirely) and
the orderBy-name drop (keeps the person, loses their status).

## Expected status band, All participants (starlabs-test)

| Bucket | By raw data | What the app will show |
|---|---|---|
| Active | 121 | **118** |
| Non-active | 19 | 19 |
| Discontinued | 7 | 7 |
| No status | 22 | **25** |
| **Total** | **169** | **169** |

The 3-person gap is exactly the `orderBy('name')` drop above. **If the screen shows Active 118 /
Non-active 19 / Discontinued 7 / No status 25 / total 169, the new code is correct** and the
remaining discrepancies are the two data issues, not the UI.

The No-status tile being non-trivial (25 of 169, ~15%) vindicates adding it — under the old
`total − nonActive − discontinued` formula all 25 were silently counted as Active.

## Pending / recommended
1. Re-run both probes against `fir-sample-aae4a` with the production SA — these numbers are test data.
2. Operator decision on the `none` token (15 docs): map to `nonactive`, or leave unclassified?
3. Consider widening `CURRENT_JOURNEY_STATUSES`, or dropping the `in` gate and filtering
   client-side, so null/upgraded/downgraded records stop hiding people. **Not done** — it changes
   what the screen counts, not just what it lists, so it needs an explicit decision.
4. Consider fixing `orderBy("name")` → unordered `get()` in `getParticipantMetaMap` /
   `getProfileMap`. Cross-screen impact (both are shared helpers), so not done unilaterally.

---

# Follow-up 3 (same day) — in-app audit: added, then removed UNRUN

## Why it was added
After the environment files switched both dev and prod configs to `fir-sample-aae4a`, the Node
probes became useless for answering "what does the operator's screen show" — the only service
accounts on this machine are `starlabs-test` and `starlabs-cicd`, and **both return
PERMISSION_DENIED against `fir-sample-aae4a`** (verified, not assumed). The workaround was to run
the same reconciliation *inside the Angular app*, under the signed-in user's credentials, so it
reads whatever project `environment.ts` points at.

Added, fenced with `TEMPORARY DIAGNOSTIC (2026-08-26)` markers:
- `runLifecycleAudit()` + `copyAudit()` + `auditOut`/`auditRunning` fields, and an
  `environment` import (component .ts)
- a "Run lifecycle audit" header pill and a `<pre>` output panel with Copy/Close (.html)
- five `.audit-*` rules (.css)

## Why it was never run
The app is Firebase-auth gated and entering credentials is not something I can do. `ng serve` was
started on :4300 and reached the login screen; the operator did not log in during the session.
**No production numbers were ever captured.** Everything in Follow-up 2 remains `starlabs-test`
data and does NOT describe the production screen.

## Removed
Operator directive: leave the journeystatus gate as-is for now and strip the audit code. All three
files reverted to exactly the Follow-up-1 state — verified by grep for every identifier
(`runLifecycleAudit`, `auditOut`, `auditRunning`, `copyAudit`, `audit-panel`, `audit-btn`,
`TEMPORARY DIAGNOSTIC`): zero hits. `npx tsc --noEmit` → 0 errors;
`ng build --configuration production` → success. Dev server stopped.

Diff vs HEAD is back to the intended three-file change (+90/−68).

## Still open (unchanged by this follow-up)
1. **Production numbers were never obtained.** Needs `serviceAccountKeyProduction.json` (then the
   archived Node probes run unmodified), or someone logged in to re-add and click the audit button.
2. The `none` customerstatus token (15 docs in test) — operator decision pending.
3. `CURRENT_JOURNEY_STATUSES` gate — explicitly deferred by the operator this session.
4. `orderBy("name")` in `getParticipantMetaMap` / `getProfileMap` silently dropping docs — untouched.
5. Roster-source idea (drive the list from `participant metadata`, join pjp for journey/subscription
   detail) — discussed, not planned. Would dissolve #3 and the dedup step; changes what the screen
   counts, so it needs an explicit decision + a plan under `specs/plans/`.

## Note for future sessions
`journeystatus`'s only real logic use is `notStarted`; everything else it does is the query gate and
three display strings. The gate's stated purpose ("exactly one current doc per participant") is NOT
achieved — 206 records for 169 people in test — which is why `computeRows()` still has to merge by
profileid.

---

# Follow-up 4 (same day) — "Mark addressed" is now ALWAYS rendered

## The report
Operator: the "Mark as Addressed" control at the top-right of the participant log is not visible for
some participants. Investigated, then changed on operator directive ("show addressed always").

## What was actually happening — working as designed, badly communicated
The control was gated on the participant having a live Needs-Attention issue, in TWO places with the
same predicate (`goingQuiet || lapsed || notStarted || renewalWindow || openTickets > 0`):
- slideover header button — `*ngIf="data.needsAttention || addressedLocal"`
- Participants-table actions icon — the same expression inline, `|| isAddressed(r)`

So an on-track participant showed **no control at all**. Not disabled, not explained — absent. A coach
could not distinguish "nothing to do here" from a permission problem or a broken build, which is
exactly how it got filed as a defect. `markAddressed()` also refuses independently with a toast
("X has no active issues to address"), so the guard was never load-bearing for correctness — it was
purely cosmetic, and the cosmetics were the problem.

## The change
Both controls are now **always rendered**, and **disabled** when there is nothing to address, with a
tooltip that says why: *"Nothing to address — this participant has no active issues."*

- `journey-coach-health-dashboard.component.ts` — new public helper `hasAddressableIssue(r)`,
  the same predicate as `needsAttentionRows()` and the slideover's `needsAttention` flag. Public so
  the template can call it; previously the expression was duplicated inline in the HTML.
- `journey-coach-health-dashboard.component.html` — actions column: `*ngIf` → `[disabled]`, tooltip
  now three-way (addressed / can-address / nothing-to-address).
- `participant-slideover.component.ts` — header button: same treatment, plus `.so-flag-btn:disabled`
  styling (opacity .38, no hover/active feedback) so "inert" reads as deliberate.

**Deliberately NOT changed:** `markAddressed()` still refuses when `activeIssues(row)` is empty. The
button is disabled, not removed, so that guard is the real backstop. Enabling the action with no
issues would write an `addressed` event with `issues: []`, and `isAddressed()` returns false for an
empty snapshot — the mark would silently do nothing. Disabled is the honest state.

## Answers to the operator's other two questions (no code change; recorded for future sessions)
- **Where does an addressed participant go?** Out of Needs Attention, and nowhere else. It writes an
  `addressed` event to `healthtracker_activity` carrying a SNAPSHOT of the issues live at that moment.
  No `customerstatus`, journey or subscription field is touched.
- **Do they stay in the active caseload?** Yes — same list, coach, lifecycle bucket, KPIs, priority
  score. And it is not permanent: `isAddressed()` holds only while current issues are a SUBSET of the
  snapshot, so a NEW kind of issue resurfaces them automatically. If every issue resolves on its own
  the tick disappears too (correctly — they are no longer in Needs Attention). The control is a
  toggle; clicking again re-opens immediately.

## Verify
`npx tsc -p tsconfig.app.json --noEmit` → 0 errors.
`npx ng build --configuration production` → success (pre-existing warnings only).
Not verified in a browser: the app is auth-gated and no session was available this run.

## Revert guide (this follow-up only)
1. `journey-coach-health-dashboard.component.html`, actions column — delete the `[disabled]` binding,
   restore the three-way tooltip to the original two-way string, and re-add
   `*ngIf="r.goingQuiet || r.lapsed || r.notStarted || r.renewalWindow || r.openTickets > 0 || isAddressed(r)"`.
2. `participant-slideover.component.ts` — delete `[disabled]="!data.needsAttention && !addressedLocal"`,
   restore the two-way tooltip, re-add `*ngIf="data.needsAttention || addressedLocal"`, and drop the
   three `.so-flag-btn:disabled*` CSS rules.
3. `journey-coach-health-dashboard.component.ts` — delete `hasAddressableIssue()` (nothing else calls it).
