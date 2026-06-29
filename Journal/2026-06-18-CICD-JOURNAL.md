# StarLabs CI/CD — Working Journal & Handoff (self-contained)

> **START HERE.** This file is **self-contained** — a developer *or any LLM* can continue from it in any session,
> in either repo, without opening anything else. The same journal is kept in both repos:
> `starlabs-angular/Journal/2026-06-18-CICD-JOURNAL.md` and `starlabs-e2e-tests/docs/CICD-JOURNAL.md` (hub).
> Deeper design detail (optional) is in the hub's `docs/GOAL.md`, `docs/ARCHITECTURE.md`, `docs/CICD-ROLLOUT.md`.
> Times are **UTC**. Last updated 2026-06-18.

---

## 0. TL;DR — current state
- **What:** a CI/CD pipeline where code goes `feature branch → preview → PR → tests → merge → auto-deploy`.
- **Done:** the workflow is **built and PROVEN** on stand-in branches; a real test suite (`operator.spec`) is
  **green in CI (13 passed / 0 failed)**.
- **Next:** **Phase 1A — build the release console** (a web app so the team tracks previews + opens/approves PRs
  without the CLI).
- **Enforcement is OFF for now** (no push/merge restriction); it's an optional final layer.

## 1. The system (everything you need — no other doc required)

**Four repositories (GitHub org `School-of-Excellence`):**
| Repo | Role |
|---|---|
| `starlabs-angular` ("Starlabs 19") | the web app (Angular 19 + Firebase) — the **lead** repo |
| `starlabs-cloud-function` | the backend (Firebase Functions / Firestore triggers) |
| `breakthroughs-flutter` | the mobile app (Flutter) |
| `starlabs-e2e-tests` (**the HUB**) | shared Playwright test engine + **reusable GitHub Actions workflows** + history + the console |

The pipeline logic is defined **once in the hub** and each app repo calls it with a tiny "caller" workflow
(`uses: School-of-Excellence/starlabs-e2e-tests/.github/workflows/web-e2e.yml@main`).

**Firebase projects (environments):**
| Env | Project | Purpose |
|---|---|---|
| Emulator (in CI) | booted as `starlabs-cicd` | runs the hermetic test gate; fresh seed per run |
| Preview + History | `starlabs-cicd` (Blaze) | per-branch preview channels + `cicd-audit` history |
| Development / Test | `starlabs-test` | merge → `development` deploys here |
| Production / Live | `fir-sample-aae4a` | merge → `production` deploys here |

**The three lanes (Angular files):**
| Lane | File | Trigger | Does |
|---|---|---|---|
| Preview | `preview.yml` | push to a feature branch | build + publish a Firebase Hosting **preview channel** |
| Gate | `queue-e2e.yml` → hub `web-e2e.yml` | **PR** to a target branch | Playwright suite vs real CF triggers in the **emulator**; report archived to `cicd-audit` |
| Deploy | `deploy_19.yml` | **merge** (push) to target branch | `firebase deploy --only hosting` to the env |

**How the gate runs:** it clones 3 repos (app + hub engine + cloud-functions) into a Firebase **emulator** and runs
the suite against the **real** Cloud-Function triggers — hermetic, nothing touches the cloud.

## 2. Branch map (READ before any git)
| Repo | Branch | Role |
|---|---|---|
| angular | **`feature/cicd-rollout`** | **CANONICAL** rollout branch — all proven workflows + this journal |
| angular | `cicd-dev` / `cicd-prod` | sudo **TEST** stand-ins (both deploy to `starlabs-test`); decommission at cutover |
| angular | `development` / `production` / `main` | **REAL** — untouched by the pipeline so far |
| hub | **`main`** | reusable workflows, `scripts/`, `console/` scaffold, `docs/` |
> A duplicate `cicd-rollout` angular branch was created then **removed** — single flow on `feature/cicd-rollout`.

## 3. Timeline
| When (UTC) | Event |
|---|---|
| 2026-06-17 | Plan locked; reusable pipelines + thin caller authored; local smoke green (operator 13/0). |
| 2026-06-17 14:05–15:31 | CI gate brought to life: `timeout-minutes` expr → static · org-reuse Access enabled · secret unified to `REPO_PAT` · CI symlinks · `environment.development.ts` overlay. |
| 2026-06-18 06:35 | Full-suite CI run hit 75-min timeout → surfaced **project-id mismatch** (the root cause of CI login failures). |
| 2026-06-18 08:54 | Smoke gate **green on a PR** — pipeline proven end-to-end in CI. |
| 2026-06-18 10:55–11:13 | **Phase B** on sudo branches: PR#3→cicd-dev gate 8/0 → deploy; deploy **403 → `--only hosting`**; PR#4→cicd-prod → deploy. Full cycle green. |
| 2026-06-18 12:36 | **`operator.spec` green in CI 13/0** — project-id fix confirmed; gate widened to run operator on PRs. |
| 2026-06-18 (later) | branch-guard dropped; consolidated to single branch `feature/cicd-rollout`; journals written. |

## 4. Planned / Implemented / Next
**Implemented ✅** — preview lane, gate (caller → hub `web-e2e`), deploy (auto-on-merge, `--only hosting`),
append-only history (`cicd-audit`); full cycle proven on sudo branches; `operator` 13/0 in CI; gate runs
operator + self-tests on PRs.

**Next ▶**
- **Phase 1A:** release console live — GitHub App + webhook receiver + board + Create-PR / Approve-Merge.
- **Phase 1B:** migrate the proven workflow to real `development`/`production` (cutover) — fix prod-deploy perms first.
- **Phase 2:** grow the queue suite green (operator → all specs), then cloud-function + flutter.
- **Phase 3 (optional):** enforcement — GitHub Team branch protection + CODEOWNERS, or console-as-merge-authority.

**Dropped** — `branch-guard` (enforcement deferred to the optional final layer).

## 5. Hard-won gotchas (don't re-learn these)
- **project-id must be `starlabs-cicd` everywhere** (emulator + app + seed) or **auth silently fails** → the
  Angular gate caller passes `firebase_project: starlabs-cicd`.
- **Deploy = `firebase deploy --only hosting`** — the deploy service account can't deploy Firestore rules (a full
  `firebase deploy` → 403).
- **Secrets per app repo:** one fine-grained **`REPO_PAT`** (read on the 3 private repos) + **`STARLABS_CICD_SA`**
  (history, optional).
- **Hub Settings → Actions → Access = organization** so callers can resolve the `@main` reusable workflows.
- CI must recreate `e2e/app` + `e2e/starlabs-cloud-function` **symlinks** (the hub scripts are hub-rooted); the
  overlay (`ci/setup-emulator-config.sh`) creates the **gitignored** `environment.development.ts`.
- Reusable-workflow numeric fields can't use `${{ }}` expressions (keep `timeout-minutes` static).
- Tooling notes: when the auto-approval safety classifier model is down, `Bash`/`Write`/`Edit` are blocked
  (read-only still works). In this setup Claude can't run `git` directly → **edit files locally, the human commits/pushes**.

## 6. How to operate (developer commands)
```bash
gh pr list   -R School-of-Excellence/starlabs-angular            # open PRs
gh pr view  <n> -R School-of-Excellence/starlabs-angular --web   # details in browser
gh pr checks <n> -R School-of-Excellence/starlabs-angular        # gate / preview results
gh pr merge <n> -R School-of-Excellence/starlabs-angular --squash# merge → deploy
gh pr close <n> -R School-of-Excellence/starlabs-angular         # close without merge
# debug a specific spec with traces:
gh workflow run queue-e2e.yml -R School-of-Excellence/starlabs-angular --ref cicd-dev -f only='queue/operator.spec.ts' -f evidence=1
```
**One PR per branch** (a head→base pair has a single open PR; new commits update it & re-run the gate). Different
branches = one PR each. A PR closes when **merged** (→ deploy), **closed** (discarded), or its head branch is deleted.

## 7. Next session: start here
1. Read this file (it's self-contained).
2. Confirm branches: angular = `feature/cicd-rollout`, hub = `main`.
3. Continue **Phase 1A (release console)** — the console scaffold lives in the hub at `console/` + `console/functions/`.
   The full Phase 1A plan (goal, architecture, wireframe, build order, GitHub App checklist, the 2 seams to fix,
   acceptance criteria) is in `Journal/2026-06-18-phase-1A-console-plan.md`.
