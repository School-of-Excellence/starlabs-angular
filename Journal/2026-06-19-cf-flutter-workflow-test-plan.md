# CF & Flutter Workflow — Manual Test Plan

> Run these steps yourself to validate the CI/CD gate works in both repos before Phase 1B.
> Angular is already proven (13/0). This plan proves CF and Flutter follow the same pattern.
> Last updated: 2026-06-19.

---

## Prerequisites (do once)

- You have push access to `starlabs-cloud-function` and `breakthroughs-flutter` on GitHub.
- The hub repo (`starlabs-e2e-tests`) `main` branch is current (it is — no changes needed there).
- GitHub Actions is enabled on both repos.
- Repo secret `REPO_PAT` exists in both repos (same PAT used by the Angular gate).

---

## Part 1 — Cloud Functions gate

### Step 1 — Prepare the CF repo (one-time setup)

In your local `starlabs-cloud-function` clone:

```bash
# 1a. Create the sudo stand-in branches (mirrors what cicd-dev/cicd-prod are in starlabs-angular)
git checkout main          # or development — whichever is the base
git checkout -b cicd-dev
git push origin cicd-dev

git checkout main
git checkout -b cicd-prod
git push origin cicd-prod
```

### Step 2 — Update the CF caller

Edit `.github/workflows/cf-e2e.yml` in the CF repo:

```yaml
# Change this:
on:
  pull_request:
    branches: [development]

# To this:
on:
  pull_request:
    branches: [cicd-dev, cicd-prod]   # sudo branches. Switch to [development] at cutover.
```

```yaml
# Change this:
    with:
      app_branch: development

# To this:
    with:
      app_branch: feature/cicd-rollout  # TODO: change to development after Phase 1B cutover
```

Commit and push to `main` (or whichever branch the caller lives on).

### Step 3 — Open a test PR

```bash
git checkout main
git checkout -b test/cf-gate-smoke
# Make a trivial change — e.g. add a comment to functions/src/index.ts
echo "// gate smoke test $(date)" >> functions/src/index.ts
git add functions/src/index.ts
git commit -m "test: cf gate smoke"
git push origin test/cf-gate-smoke
```

Open PR: `test/cf-gate-smoke` → `cicd-dev` on GitHub.

### Step 4 — Verify

Watch GitHub Actions on the PR. Expected sequence:

| Step | What to see |
|---|---|
| Checkout angular harness | Clones `starlabs-angular @ feature/cicd-rollout` |
| Checkout CF PR head | Clones THIS PR's CF code → `./starlabs-cloud-function` |
| Boot emulator | `All emulators ready` in logs |
| Boot Angular app | `:4200` responds |
| Run Playwright suite | Queue e2e suite runs against the CF triggers |
| Gate result | Green (same 13/0 baseline as Angular) |
| History write | `cicd-audit` record written (if `STARLABS_CICD_SA` secret is set) |

### Step 5 — Merge and clean up

If green: merge the PR into `cicd-dev`. Verify no deploy fires (CF has no deploy workflow — correct).
Delete the `test/cf-gate-smoke` branch. Repeat with a PR → `cicd-prod` if you want to prove both targets.

---

## Part 2 — Flutter gate

### Step 1 — Prepare the Flutter repo (one-time setup)

In your local `breakthroughs-flutter` clone:

```bash
git checkout main          # or development
git checkout -b cicd-dev
git push origin cicd-dev

git checkout main
git checkout -b cicd-prod
git push origin cicd-prod
```

### Step 2 — Update the Flutter caller

Edit `.github/workflows/flutter-e2e.yml` in the Flutter repo:

```yaml
# Change this:
on:
  pull_request:
    branches: [development]

# To this:
on:
  pull_request:
    branches: [cicd-dev, cicd-prod]   # sudo branches. Switch to [development] at cutover.
```

```yaml
# Change this:
      flutter_version: '3.29.3'

# To this:
      flutter_version: '3.44.3'   # match the project's actual SDK version
```

Commit and push to `main`.

### Step 3 — Open a test PR

```bash
git checkout main
git checkout -b test/flutter-gate-smoke
# Make a trivial change — e.g. add a comment to lib/main.dart
echo "// gate smoke test" >> lib/main.dart
git add lib/main.dart
git commit -m "test: flutter gate smoke"
git push origin test/flutter-gate-smoke
```

Open PR: `test/flutter-gate-smoke` → `cicd-dev` on GitHub.

### Step 4 — Verify

Watch GitHub Actions on the PR. Expected sequence:

| Step | What to see |
|---|---|
| Flutter setup | Flutter 3.44.3 installed |
| Inject secrets | `android/local.properties` created (PostHog key) |
| `flutter pub get` | Dependencies resolved |
| Analyze (advisory) | May have findings — `continue-on-error: true`, does NOT fail the gate |
| `flutter test` (hard gate) | All unit/widget tests pass |
| `flutter build web` (hard gate) | Web build succeeds |
| Upload artifact | `flutter-web-build` artifact uploaded |
| History write | Skipped (no `STARLABS_CICD_SA` secret on Flutter repo — non-fatal) |

> `run_integration: false` so no emulator is booted. That's correct for now.
> The integration smoke is deferred until the SETUP §6.2 seed fix lands.

### Step 5 — Merge and clean up

If green: merge the PR into `cicd-dev`. Delete the test branch.

---

## Part 3 — Cutover checklist (after both gates are proven green)

When ready to point at real `development` instead of the sudo branches, do this in both CF and Flutter repos:

```yaml
# cf-e2e.yml
branches: [development]        # was [cicd-dev, cicd-prod]
app_branch: development        # was feature/cicd-rollout  (CF only)

# flutter-e2e.yml
branches: [development]        # was [cicd-dev, cicd-prod]
```

Then do the same for Phase 1B in `starlabs-angular`:
```yaml
# queue-e2e.yml
branches: [development]        # was [cicd-dev, cicd-prod]
```

All three gates then fire on real PRs to `development`. Pipeline is fully live.

---

## Quick dispatch option (no PR needed)

If you just want to verify the gate runs without creating branches or PRs, use `workflow_dispatch`:

```
GitHub → <repo> → Actions → cf-e2e (emulator gate) → Run workflow
GitHub → <repo> → Actions → flutter-e2e (gate) → Run workflow
```

Note: for CF dispatch, you still need `app_branch: feature/cicd-rollout` set in the caller first (Step 2 above) — otherwise it clones `development` which doesn't have the emulator scripts yet.
