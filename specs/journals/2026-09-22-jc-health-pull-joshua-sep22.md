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
