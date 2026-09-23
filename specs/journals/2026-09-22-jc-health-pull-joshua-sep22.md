# 2026-09-22 — JC Health: pull Joshua's Sep-22 features into dynamic-studio-update

## What
Brought the JC Health code from `origin/joshua-development` (commits `991970f9` re-apply approved
JC-health features, `279801c5` Needs-attention spec) into the working tree — uncommitted, no merge commit.
Only the JC Health folder + `tsconfig.audit-spec.json`; nothing else from Joshua's branch.

## How / why
- **Base = `782d76df`, not the git merge-base.** This branch took Joshua's earlier JC work by copying
  (`eb0e42c0`, Jul 16), which is byte-identical to `782d76df`. Using the real merge-base produced 55
  conflict hunks; using `782d76df` isolates the two new commits (24 hunks).
- **Charan's refactor kept everywhere** (metadata roster / `buildRow`, `loadJoinsFor`, `priority.engine.ts`,
  JC pipeline card, coach JC stats, No-status band, data-testids). Joshua's features layered on top:
  - A&H love-letter / ask-A&H tags → added to `loadJoinsFor`, `buildRow`, and to `scorePriority` as
    optional inputs + weights (30 / 18, defaults in `priority.engine.ts`; existing tests unaffected).
  - Needs-attention = Joshua's single predicate (`isNeedsAttention`, operator-signed): drops going-quiet +
    renewals, adds locked/defaulted + A&H. Also routed Charan's coach-card `queue` + `topQueueForCoach`
    through it for consistency.
  - Defaulted / Missed KPI tiles alongside Charan's layout (Unassigned tile stays removed).
  - **Both cards kept**: Charan's "JC pipeline" (done) and Joshua's "Schedule" (upcoming, JC vs Onboarding).
    One appointments read feeds both; pending events now carry `onboarding`.
  - `coachNameFor` restricted to the coach list (non-coach → "—", Joshua item 2) + `rowHasCoachRef` for Unassign.
  - Dark/light CSS tokens; kept Charan's `.sb-nostatus` hatch (hex — not tokenised yet).
- Joshua's duplicate helpers (`rosterIds`, `nameOf`, `jcCoachName`, `openJcParticipant`, `schedFallbackRow`)
  dropped in favour of the existing ones.

## Verified
`tsc` + `ngc` (templates) clean; unit specs 75/75; Needs-attention spec 18/18.
Not yet: browser check, e2e hooks for new tiles/Schedule (Defaulted/Missed/Schedule have no `data-testid`).

## e2e hooks (added same day)
21 literal `data-testid`s for the new UI, driven by hub `journey/coach-health.spec.ts` (JCH-01..07):
`jchd-kpi-defaulted|missed`, `jchd-theme-toggle`, `jchd-ah-critical|attention|opportunity`,
`jchd-sched-card`, `jchd-sched-{jc,ob}-{today,week,overdue,row}`; slide-over gets prefix `jcso`
(`jcso-{ll,ah}-{toggle,row,showall}`). Attribute-only — reverting them changes no behaviour.
Found while writing JCH-07: in a coach's own scope the Schedule + JC-pipeline cards never load
(`loadContactEvents()` isn't called in full mode) — recorded as `test.fail()`, not fixed.

## Revert guide
Uncommitted: `git diff -- "src/app/Journey Onboarding/journey-coach-health-dashboard"` shows the whole change.
Once committed, revert that single commit. Files: component .ts/.html/.css, `participant-slideover.component.ts`,
`priority.engine.ts`, new `journey-coach-health-dashboard.needs-attention.spec.ts`, new `tsconfig.audit-spec.json`.

## Second pull — Joshua's 16 follow-up commits (279801c5..93c9633e), evening 2026-09-22
Uncommitted. 3-way merge with base `279801c5` (already merged in 64302575): 11 hunks, all resolved.
- Kept Charan's coach-card drill buttons (jchd-btn-073..077, Active stat, is-drill) over Joshua's parallel
  `drillCoachStat` version — same feature; Joshua's method is now unused.
- Joshua's Schedule tiles are now filter **buttons** — our `jchd-sched-*` hooks moved onto them; A&H chips took
  Joshua's labels (Critical / Needs Attention / Opportunity) and kept `jchd-ah-*`. All 113 hooks survive.
- Going quiet now excludes Needs attention (Joshua); also routed Charan's coach drill list through
  `isGoingQuietBucket` so the list matches the card stat. `priority.engine` reason labels renamed to match.
- `styles.css`: line merge produced an unclosed block; rebuilt as HEAD + Joshua's appended dark-overlay block.
- `tsconfig.audit-spec.json`: registered Joshua's going-quiet spec (his branch never did).
- `firestore.indexes.json`: +2 composite indexes (love letter / ask AH: profileid + created desc).
Verified: tsc + ngc clean, `ng build` (development) complete, specs 18/18 + 16/16, unit 75/75.
Open: 21 new unhooked controls in the dashboard + 2 in `ah-flag-list-dialog` → gate will flag; slide-over
now shows only the latest 1 entry (show-all buttons unreachable). Coach-scope Schedule bug still present.
Revert: `git diff` over the JC folder + `src/styles.css` + `firestore.indexes.json` + `tsconfig.audit-spec.json`.

## e2e hooks for the second pull (same day)
23 further literal hooks so the gate's "new elements no spec references" clears: A&H analytics card
(`jchd-ahsrc-{ask,love}`, `jchd-ahcell-{liked,tagged,opportunity,critical}-{ask,love,both,res}`,
`jchd-ahmini-{unflagged,positive,critattn}`), NA reason chips (`jchd-na-reason`), and the new
drill-down dialog under its own prefix `afl` (`afl-row`, `afl-close`, `afl-count`). 138 hooks total,
hook-diff aligned. Driven by hub JCH-08/09/10 (`journey/coach-health.spec.ts`). Attribute-only.

## Third pull — Joshua's 3 fixes (7023d94f, bbe2e3bd) + our JC-pipeline fix, 2026-09-23
Uncommitted. 3-way merge, base 93c9633e: 6 conflicts (4 html, 2 ts), all resolved.
- **His fixes:** coach "Viewing" select switched to one-way `[ngModel]` (two-way pre-wrote
  `selectedCoachId`, so `onCoachChange`'s guard no-op'd and the table never re-scoped); `isOnboardingAppt()`
  now also recognises an appointment by its appointment-TYPE ref (`onboardingcall`), catching legacy docs;
  the A&H drill-down became a native in-component overlay and `AhFlagListDialogComponent` was DELETED.
  Also brought: `qa/` (contract doc + hook map + `qa/checks/jc-health-contract.mjs` structural guard),
  a Karma contract spec, and `tsconfig.spec.jc.json`.
- **Hook reconciliation:** kept our gate-aligned names (`jchd-sel-002` stays; his `viewing-coach-select`,
  `ahd-overlay`, `ahd-row`, `participants-table`, `sched-*-col` renamed under the `jchd` prefix, plus new
  `jchd-ahd-close` / `-count`). His QA script + `qa/hooks.md` updated to the merged names. The `afl`
  prefix is retired with the deleted dialog; hub JCH-09 now drives the overlay. 142 hooks, aligned.
- **JC pipeline fixed (ours):** `JcDoneEvent` now carries `onboarding` (stamped from the SAME
  `isOnboardingAppt()` the Schedule uses), and all four "JC done" surfaces — the Summary tiles, the list
  under them, the Coaches-tab Done counts and their drill lists — filter through `isCoachingDone()`.
  Contact recency is untouched: an onboarding call still keeps a participant out of Going quiet.
  New revert-guard spec `journey-coach-health-dashboard.jc-pipeline.spec.ts` (9 cases), registered in
  `tsconfig.audit-spec.json`; verified RED when the predicate is reverted.
Verified: tsc + ngc clean, `ng build` (development) complete, needs-attention 18/18, going-quiet 16/16,
jc-pipeline 9/9, Joshua's contract spec 11/11, `qa/checks/jc-health-contract.mjs` 5/5.
Still open: the Schedule + JC-pipeline cards STILL never load in a coach's own scope (JCH-07 stays
test.fail); the A&H analytics card remains base-wide, not coach-scoped.
Revert: `git diff` over the JC folder + `qa/` + `tsconfig.spec.jc.json` + `tsconfig.audit-spec.json`.

## Two fixes on top (2026-09-23, after merging origin/development)
`origin/development` merged first (`2873e1df`) — it carried only merges of THIS branch (PRs #298/#301),
so no file changed; the branch is simply not behind any more.

**Fix A — Schedule + JC pipeline never loaded in a coach's own scope.** `loadContactEvents()` ran only
from the All/Unassigned background load and from the Coaches tab, so for a coach both cards sat on
"loading…" with zeros. `loadFullPortfolio()` now kicks the same `loadAttentionDataInBackground()` after
first paint: guarded by `contactDataLoaded` / `fullIndexBuilt`, its paged-only branch skipped, so it is
idempotent and non-blocking. COST, stated: a coach view now pays the same full `appointments` +
touchpoints read the All view already paid — that read is the only source for these cards.
Hub JCH-07 loses its `test.fail()`, and JCH-12 moves from the admin to the coach's own scope.

**Fix B — the A&H analytics card ignored the Viewing scope.** `loadAHSummary` read both collections
base-wide and the card counted everything, so a coach saw ecosystem numbers and could drill into other
coaches' participants. The single base-wide read STAYS (one read, cached in `ahDocs`); the counts and
the drill list now go through `ahDocsInScope()`:
  ALL -> no filter (the ecosystem view the admin/Coaches tab is for)
  one coach / Unassigned -> only docs whose profileid is in that roster (an orphan doc with no
  profileid can't be attributed, so it counts only in ALL).
`computeAhSummary()` re-runs from the cache on every scope change (no re-read) and after the roster
lands. New revert-guard spec `journey-coach-health-dashboard.ah-scope.spec.ts` (9 cases).
Joshua's contract spec needed its minimal `this` contexts widened (openAhDrill now calls
ahDocsInScope, onCoachChange calls computeAhSummary) — his assertions are untouched, still 11/11.

Verified: tsc (app + spec.jc) clean, ngc clean, `ng build` (development) complete, needs-attention
18/18, going-quiet 16/16, jc-pipeline 9/9, ah-scope 9/9, contract 11/11, qa guard 5/5. 142 hooks aligned.
Hub: JCH-07 un-failed, JCH-08/09 re-expected at the SCOPED numbers (2, not 3), JCH-12 now runs as the coach.
