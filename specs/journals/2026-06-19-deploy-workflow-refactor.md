# Journal: Deploy Workflow Refactor — Add Real Branches, DRY Config Step
**Date:** 2026-06-19  
**Repo:** `starlabs-angular`  
**Files changed:** `.github/workflows/deploy_19.yml`, `firebase.json`

---

## What changed and why

### 1. Added `development` and `production` to workflow triggers

**Before:** Only `cicd-dev` and `cicd-prod` (sudo stand-in branches) triggered deploys.  
**After:** All four branches trigger:
```yaml
branches:
  - development
  - cicd-dev
  - production
  - cicd-prod
```

**Why:** The sudo branches (`cicd-dev`, `cicd-prod`) were temporary scaffolding for CI validation while the real `development` and `production` branches didn't have the gate proven yet. Angular's gate is now proven (13/0). Adding the real branches means merges to `development` and `production` now actually deploy — the pipeline is live for the Angular repo.

The sudo stand-ins are kept in the trigger list until CF and Flutter gates are also proven (see `Journal/2026-06-19-cf-flutter-workflow-test-plan.md`). Remove them at cutover.

---

### 2. Extracted `DEPLOY_ENV` environment variable

**Before:** Every step repeated the same `if [ "${{ github.ref }}" == "refs/heads/development" ] || [ ... cicd-dev ... ] || [ ... cicd-prod ... ]` condition — four times across the workflow.

**After:** A single `Set deploy environment` step at the top resolves the branch to `test` or `prod` once:
```bash
if [[ "${{ github.ref }}" == "refs/heads/development" || \
      "${{ github.ref }}" == "refs/heads/cicd-dev" ]]; then
  echo "DEPLOY_ENV=test" >> $GITHUB_ENV
else
  echo "DEPLOY_ENV=prod" >> $GITHUB_ENV
fi
```

All downstream steps use `$DEPLOY_ENV`. The `if` condition is written exactly once.

**Why:** Each time the branch list changed (e.g., adding `development` and `production`), four blocks needed updating. One missed block = wrong Firebase project gets deployed to. The DRY version makes that a single edit and makes the intent obvious.

---

### 3. DRY'd the environment file generation step

**Before:** Duplicated heredoc blocks — one set for test, one set for prod — each writing both `environment.development.ts` and `environment.ts`.

**After:** Variables (`FIREBASE_CONFIG`, `WATSON_CONFIG`, etc.) are set in an `if/else` block, then a single set of heredocs writes the files using those variables. `firebase-messaging-sw.js` is written once using the resolved `$FIREBASE_CONFIG`.

**Why:** Less drift risk. Previously adding a new config key (e.g. `salescrm`) required updating 4 heredocs. Now it's 2 variable assignments + 2 heredoc references.

---

### 4. Removed `firestore` block from `firebase.json`

**Before:** `firebase.json` had a `firestore` section pointing to `firestore.rules` and `firestore.indexes.json`.

**After:** Section removed.

**Why:** The Angular repo does not own the Firestore rules for `starlabs-cicd`. The hub repo (`starlabs-e2e-tests`) owns those files and deploys them via its own `firebase.json`. Having the rules section in the Angular repo was a latent risk — a `firebase deploy` from the Angular repo could overwrite rules managed by the hub. Removed to make the ownership boundary explicit.

---

## What to watch for

- `DEPLOY_ENV=prod` triggers `fir-sample-aae4a` (production). Adding a new branch to the trigger list and getting the `if` condition wrong would deploy to prod unexpectedly. The condition is now in exactly one place.
- When removing `cicd-dev`/`cicd-prod` at cutover, also update the CF and Flutter callers (see cutover checklist in `Journal/2026-06-19-cf-flutter-workflow-test-plan.md`).

---

## Pending

- CF and Flutter gates still need to be proven green before cutover (see test plan).
- Remove `cicd-dev` and `cicd-prod` from all three repo workflows after cutover.
