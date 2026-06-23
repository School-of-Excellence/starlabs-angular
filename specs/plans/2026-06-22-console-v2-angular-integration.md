# Plan — Console v2 integration changes for `starlabs-angular`

> **Status:** LOCKED (2026-06-22). Companion to the hub plan
> `starlabs-e2e-tests/specs/plans/2026-06-22-console-v2-architecture.md`.
>
> **This SUPERSEDES** `Journal/2026-06-18-phase-1A-console-plan.md` for anything
> about how the console merges/deploys: the console no longer merges (developers
> merge on GitHub), preview is manual, and status is activity-log-derived. Read the
> hub plan for the full why.
>
> **Scope of changes in THIS repo: workflow YAML + GitHub settings ONLY. No
> `src/app/**` application code changes.**

---

## 1. What's already DONE here — reuse as-is (do NOT rebuild)

| Capability | File / evidence | Notes |
|---|---|---|
| Per-branch preview channel → `starlabs-test` (site `breakthroughs-test`) | `.github/workflows/preview.yml` | proven; 7-day expiry; deterministic channel id |
| Auto-deploy `development` → `starlabs-test` | `deploy_19.yml` (push: development) | proven |
| Auto-deploy `production` → `fir-sample-aae4a` | `deploy_19.yml` (push: production) | proven |
| e2e gate calling the hub | `queue-e2e.yml` → `School-of-Excellence/starlabs-e2e-tests/.github/workflows/web-e2e.yml@main` | 13/0 green 2026-06-18 |
| Deterministic preview URL | `preview.yml` channel-id slug | console computes `https://<slug>---breakthroughs-test.web.app` — no extra wiring |
| Secrets / service accounts | `REPO_PAT`, `GOOGLE_SERVICE_TEST/PROD` | present |

Branch→env mapping (correct, unchanged):
```
 feature/*   --preview-->  starlabs-test (channel)
 development --push------>  starlabs-test (dev live)
 production  --push------>  fir-sample-aae4a (prod live)
```

---

## 2. Changes REQUIRED in this repo

### C1 — `preview.yml`: DISABLE the push trigger (D5)
- Console v2 makes preview a **manual** action. The console "Deploy preview" button
  calls GitHub `createWorkflowDispatch` on this workflow.
- Action: **disable/comment out the `on: push` trigger** so pushes no longer auto-build
  a preview, and ensure **`workflow_dispatch`** is present (with a branch/ref input so
  the console can target a specific feature branch).
- Effect: pushing a feature branch creates the console candidate (via the GitHub App
  `push` webhook) in `NO_ACTION` with **no** preview until a developer clicks the button.

### C2 — `queue-e2e.yml`: branch cutover (go-live)
- Currently triggers on PRs to the placeholder branches `cicd-dev` / `cicd-prod`.
- Action at cutover: change PR target branches to **`development`, `production`**
  (the in-file comment already notes "Switch to [development] at cutover").
- Also remove the `cicd-dev` / `cicd-prod` push triggers from `deploy_19.yml` at cutover
  so the placeholder branches stop deploying.

---

## 3. Explicitly NOT changing

- **`deploy_19.yml` deployment_status** — SKIPPED (D10). The console reads `workflow_run`
  (automatic on the GitHub App subscription) for deploy health, and computes preview
  URLs deterministically. No github-script step needed.
- **Branch protection** — PAUSED (D11). On the free plan, branch protection on private
  repos needs a paid plan. Interim guard = the console's reconciliation engine + warnings
  + team policy. **When the org upgrades to a paid GitHub plan**, enable strict protection
  on `development` and `production`: require the e2e gate status check + "dismiss stale
  pull request approvals when new commits are pushed". This depends on C2 (the gate must
  have run on those branches before GitHub can mark it required).
- **`src/app/**` application code** — untouched.

---

## 4. How the console drives this repo (reference)

```
 dev pushes feature/x ──► GitHub App push webhook ──► console candidate NO_ACTION
 dev clicks [Deploy preview] ─► deployPreview callable ─► createWorkflowDispatch(preview.yml)
   ─► preview build ─► console reads workflow_run + computes URL ─► PREVIEW_LIVE
 tester signs off (console only) ─► OK_FOR_DEV
 dev clicks [Create PR → dev] ─► createPullRequest callable ─► PR opened
 dev MERGES ON GITHUB (not the console) ─► pull_request closed+merged webhook ─► DEV_MERGED
   ─► push to development ─► deploy_19.yml ─► starlabs-test ─► workflow_run ─► deploy health
 (repeat for prod gate → PR → prod → production → fir-sample-aae4a)
```

---

## 5. Interim-guard caveat (until paid plan)

Because branch protection is paused (D11) and the console does not merge (D3), nothing
**physically** prevents a developer from merging a red/unreviewed PR or pushing directly
to `development`/`production`. The console will surface every such event as a
`NEEDS_DECISION` or `ANOMALY` reconciliation item, but enforcement is by **team policy**
until protection is enabled. Document this for the team at go-live.
