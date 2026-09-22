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
