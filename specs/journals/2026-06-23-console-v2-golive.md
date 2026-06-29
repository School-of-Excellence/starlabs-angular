# Journal — Console v2 integration go-live (starlabs-angular)

**Date:** 2026-06-23
**Repo:** starlabs-angular
**Companion:** starlabs-e2e-tests/specs/journals/2026-06-23-console-v2-golive.md
**Plan:** specs/plans/2026-06-22-console-v2-angular-integration.md

This repo is the first target wired into the live release console on `starlabs-cicd`.
The full `NO_ACTION → … → PROD_MERGED` flow was driven against `feature/cicd-rollout`.

## What changed / was set up here
- **Repo made PUBLIC** — the big unblock. Private-repo GitHub Actions were billing-blocked
  ("job not started — payments failed / spending limit"); public repos get **free unlimited
  Actions** (standard runners) **and free branch protection**. After this, `preview.yml`
  ran green: build → publish preview channel → the console flipped to `PREVIEW_LIVE`.
- **GitHub App** (org `School-of-Excellence`) created + installed on **this repo only**:
  - permissions: Actions RW, Contents RW, Pull requests RW, Metadata RO
  - events: push, pull_request, workflow_run
  - webhook → the deployed `webhookReceiver` URL + the shared webhook secret
  - Required two things people miss: granting **Actions: Write** *and re-approving* the
    install; and **enabling** the `preview` workflow (it was `disabled_manually`).
- **`functions`-side config** (in the hub repo, noted here for cross-ref): App ID +
  Installation ID are committed non-secret in `.env.starlabs-cicd`; key + webhook secret in
  Secret Manager.

## Confirmed working
- `preview.yml` via `workflow_dispatch` (the console "Deploy preview" button) → builds +
  publishes the per-branch channel on `starlabs-test` (site `breakthroughs-test`).
- The real channel URL is `https://breakthroughs-test--<channel>-<hash>.web.app` — **hashed,
  not predictable** (this broke the console's deterministic-URL assumption; see Pending).
- Merge of a PR → `development` triggers `deploy_19.yml` (already correct: development →
  starlabs-test, production → fir-sample-aae4a). `development`/`production` are treated by the
  console as **deploy environments** (status only, no feature actions).

## Pending (Angular-side)
- **`preview.yml` must record the real preview URL** (the durable fix for the 404 URL): a step
  that captures the channel URL from `hosting:channel:deploy --json` and writes it to the
  candidate doc on `starlabs-cicd` (reusing the `STARLABS_CICD_SA` it already has for history).
  This change must be **committed + pushed** to the branch GitHub runs — redeploying functions
  does NOT activate it. Until then the console URL is patched per-candidate by hand.
- **Settle the preview trigger:** manual `workflow_dispatch` (plan D5, drives the console
  button) vs. auto `on: push`. Confirm which — the console button needs `workflow_dispatch`
  present with a required `ref` input.
- **Gate cutover:** `queue-e2e.yml` still triggers on `cicd-dev/cicd-prod` (+ a `paths` filter)
  — switch to `development/production` so the e2e gate + its report run on real PRs.
- **Branch protection** on `development`/`production` (now free on the public repo): require
  the e2e gate status check + "dismiss stale approvals on new commits". This is the hard merge
  fence (D11) — it's the only thing that prevents an unreviewed/red direct merge, since the
  console deliberately does not merge (developers merge on GitHub).

## Note
No `src/app/**` application code was changed — all integration is workflow + GitHub settings.
