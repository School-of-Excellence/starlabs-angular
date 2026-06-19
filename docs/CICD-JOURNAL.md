# CI/CD Flow — Journal & Team Guide

> A plain-language record of how the StarLabs CI/CD flow was built, proven, and how to use it.
> Companion to [`GOAL.md`](GOAL.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CICD-ROLLOUT.md`](CICD-ROLLOUT.md).
> Lives in both `starlabs-e2e-tests` (the hub) and `starlabs-angular` (the lead app).

## What this is
A pipeline so code travels **feature branch → preview → PR → tests → merge → auto-deploy**, with the test/CI
logic defined **once** in the hub (`starlabs-e2e-tests`) and each app repo calling it with a thin workflow.

## The flow (verified green on the `cicd-*` sudo branches)
```
 push feature branch ─────────────► preview.yml          → preview channel (a test website URL)
 open PR to cicd-dev/cicd-prod ───► queue-e2e.yml → hub web-e2e.yml  → Playwright suite in the emulator
 merge PR ────────────────────────► deploy_19.yml        → auto-deploy hosting (starlabs-test)
```
- **Push** → `preview` (every push to a feature branch). **PR** → the `queue-e2e` gate. **Merge** → `deploy_19`.
- The gate clones 3 repos (app + hub engine + cloud-functions) into a **Firebase emulator** and runs the suite
  against the **real** CF triggers, hermetically.
- Every gate run is archived to **`cicd-audit`** in `starlabs-cicd` (report + seed snapshot), never overwritten.

## The journey — issues hit and fixed (each moved the gate deeper in CI)
1. `timeout-minutes: ${{ inputs.x }}` (expression in a numeric field) → workflow wouldn't compile. Fixed: static.
2. Reusable-workflow **org access** not enabled → caller couldn't resolve `@main`. Fixed: hub Settings → Actions → Access.
3. Wrong secret name (`CICD_PAT`) → the repo had `E2E_REPO_TOKEN`/`CF_REPO_TOKEN`; unified to a single **`REPO_PAT`** (fine-grained PAT).
4. `REPO_PAT` lacked repo read → 403 on clone. Fixed: PAT with Contents:Read on the 3 private repos.
5. CI layout: scripts expect `e2e/app` + `e2e/starlabs-cloud-function` symlinks → recreated them in CI.
6. App build: `environment.development.ts` is gitignored → overlay now creates it.
7. **Root cause of the CI test failures:** project-id mismatch (`demo-slabs-queue` emulator vs `starlabs-cicd`
   app) → auth users not found → login `waitForURL` timeout. Fixed: caller passes `firebase_project: starlabs-cicd`.
8. Deploy 403: `firebase deploy` tried to deploy Firestore **rules** (SA lacks permission). Fixed: **`--only hosting`**.

## What's proven
- Pipeline runs end-to-end in CI; the full sudo cycle (preview → PR → gate → merge → deploy → promote) is **green**.
- A **real suite** — `operator.spec` — passes **13/0** in CI (not just smoke). The gate now runs it on PRs.

## Decisions
- **Enforcement = none for now.** `branch-guard` dropped; PR-only is policy. A real wall (GitHub Team branch
  protection) is the **final, optional** layer, added later.
- **Test data:** the GATE owns isolation (emulator + per-spec reseed + seed snapshot in history). The PREVIEW
  uses shared seeded `starlabs-cicd` sample data. (No per-branch DBs — CF triggers bind to one DB.)
- **Validation on `cicd-dev`/`cicd-prod` stand-ins** before touching real `development`/`production`.

## Where we are (phases)
- **Foundation — build + prove the workflow:** ✅ done.
- **Phase 1 — workflow live for the team:** ◀ next → (1A) build the **release console** so the team tracks
  previews + creates PRs without `gh`; (1B) migrate to real `development`/`production`.
- **Phase 2 — test coverage:** grow the queue suite green, then cloud-function + flutter.
- **Phase 3 — enforcement (optional):** GitHub Team + branch protection.

## How a developer uses it (today, via `gh`; soon via the console)
```bash
# see / merge / close PRs (no commits needed)
gh pr list   -R School-of-Excellence/starlabs-angular
gh pr view  <n> -R School-of-Excellence/starlabs-angular --web
gh pr checks <n> -R School-of-Excellence/starlabs-angular     # gate/preview results
gh pr merge <n> -R School-of-Excellence/starlabs-angular --squash
gh pr close <n> -R School-of-Excellence/starlabs-angular
```
**One PR per branch** (a head→base pair has a single open PR; new commits update it). Different branches = one
PR each. A PR closes when **merged** (→ deploy) or **closed** (discarded) or its head branch is deleted.
