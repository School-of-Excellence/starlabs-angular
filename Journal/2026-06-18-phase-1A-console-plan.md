# Phase 1A — Release Console: Proposed Plan (self-contained)

> **START-HERE plan for a NEW session.** Self-contained — any developer/LLM can execute from this file.
> Full pipeline context is in `Journal/2026-06-18-CICD-JOURNAL.md` (this repo) and the hub
> `starlabs-e2e-tests/docs/`. Times/decisions current as of 2026-06-18.

## Goal
Build the **release console** live: a small web app where the team **sees every preview channel**, its **status**
and **test report**, and clicks to **Create PR** / **Approve & Merge** — so developers never touch `gh` or the
GitHub UI. GitHub stays the **source of truth**; the console mirrors it (webhooks in) and acts on it (a GitHub
App out). It does NOT reimplement PR/merge/deploy tracking.

## Where the code already is (scaffold)
- Hub repo `starlabs-e2e-tests`: **`console/`** (Angular frontend scaffold) + **`console/functions/`** (Cloud
  Functions backend scaffold, `model.ts` with `ReleaseStatus` enum + `release-candidates/{...}`). Built earlier;
  needs the wiring + the 2 fixes below. Hosts on the **`starlabs-cicd`** Firebase project (Blaze).

## Architecture
```
 TEAM (browser)        GitHub (source of truth)              starlabs-cicd (console home)
 ─────────────         ────────────────────────              ────────────────────────────
  push branch ───────► push / pull_request /  ──webhook──►  CF: webhookReceiver (HMAC-verify)
  (preview builds)     deployment_status / workflow_run       → Firestore release-candidates/{repo__branch}
                                                                        │ (live)
  browser ◄──── Angular console (Hosting) ◄── board renders cards ◄─────┘  + linked e2e report (cicd-audit)
     │  [Mark OK to Release] [Create PR→dev/prod] [Approve & Merge]
     ▼
  CF actions → Firebase-Auth check → per-branch approver allowlist → GitHub REST (as the App) → create/merge PR
                                                          │ merge → deploy_19 → deployment_status webhook → status auto-updates
```

## Status lifecycle (board)
`NO_ACTION → OK_TO_RELEASE → PR_TO_DEV → DEV_MERGED → PR_TO_PROD → PROD_MERGED`
Only **OK_TO_RELEASE** is set by a human (team sign-off on the preview). Every other status is **derived from
webhooks**, so the board can't drift from GitHub reality.

## Data model — `release-candidates/{repo__branch}`
`{ repo, branch, previewUrl, status, reportRunId→cicd-audit, prDevNumber, prProdNumber, notes[],
okToReleaseBy, updatedAt }`

## Wireframe (target)
```
 BOARD                                                              CARD DETAIL (click a row)
 ┌──────────────────────────────────────────────────────┐         ┌─ feature/cart ───────────────── ✕ ┐
 │ Release Console      🔍 filter   repo▾  status▾  user▾ │        │ status: ◑ PR → dev (#42)          │
 │ BRANCH         STATUS        PREVIEW TESTS  ACTIONS    │        │ preview: …web.app        [open ↗]│
 │ feature/login  ○ No action   🔗     —      [OK to Rel]│        │ tests:  ✓ 13/0           [report]│
 │ feature/cart   ◑ PR→dev #42  🔗     ✓13/0  [Approve]  │        │ QA notes: … [add note] [save]    │
 │ feature/promo  ◆ Dev merged  🔗     ✓13/0  [PR→prod]  │        │ [Approve & Merge→dev] [PR→prod]  │
 └──────────────────────────────────────────────────────┘        └──────────────────────────────────┘
```

## Build order
**Step 1 — GitHub App (OPERATOR; only a human can register it).**
Register a GitHub App on org `School-of-Excellence`:
- Permissions: **Contents: RW · Pull requests: RW · Deployments: RO · Actions: RO**.
- Subscribe to events: **push · pull_request · deployment_status · workflow_run**.
- Webhook URL = the `webhookReceiver` Cloud Function URL (known after Step 2 deploy) + a **webhook secret**.
- Install on the org (all 4 repos). Capture **App ID · Installation ID · private key (PEM)**.

**Step 2 — Backend (`console/functions/`, deploy to starlabs-cicd).**
- Fix the **2 scaffold seams** (see below).
- Wire: `webhookReceiver` (verify → derive status → Firestore), `setOkToRelease`, `createPullRequest`,
  `approveAndMerge` (Firebase-Auth + per-branch approver allowlist → GitHub App merge).
- Secrets: `firebase functions:secrets:set GITHUB_WEBHOOK_SECRET` + `GITHUB_APP_PRIVATE_KEY`; `.env` with
  `GITHUB_ORG`, `APP_ID`, `INSTALLATION_ID`.
- `npm install` + `tsc`; deploy → grab the webhookReceiver URL → paste into the GitHub App (Step 1).
- Create Firestore `console-config/allowlists` (`okToRelease`, `approvers.development`, `approvers.production`).

**Step 3 — Frontend (`console/`, deploy to a starlabs-cicd Hosting site).**
- Build the **board** + **card detail** (wireframe above) from the scaffold.
- Firebase web config (`starlabs-cicd`); **Google sign-in restricted to the team**.
- Deploy to a Hosting site on `starlabs-cicd`.

**Step 4 — Prove it.**
Push a branch → **card appears** (NO_ACTION) → preview link shows → **Mark OK to Release** → **Create PR → dev**
→ gate runs, report links on the card → **Approve & Merge** (only an allowlisted approver succeeds) → card →
DEV_MERGED → deploy fires. Repeat **Create PR → prod** → Approve & Merge → PROD_MERGED.

## The 2 scaffold seams to fix (found in the earlier review)
1. **Frontend↔backend callable contract mismatch** — align the callable **names**
   (`setOkToRelease` / `createPullRequest` / `approveAndMerge`) and **payloads** (include `repo`, `base`/`head`,
   `prNumber`). Frontend currently calls `markOkToRelease` / `createPrToDev` with different args.
2. **Doc-id scheme** — unify to **`${repo}__${branch}`**; add `repo`, `prDevNumber`, `prProdNumber` to the
   frontend `ReleaseCandidate` model so payloads + board + Firestore all match.

## Prerequisites (operator / you)
- GitHub App (Step 1) + its secrets.
- `starlabs-cicd` Firebase **web config** for the console frontend.
- The **approver allowlist** members (dev list; prod list can be stricter).
- Decision: **GitHub App** (preferred) vs a fine-grained PAT for the backend's GitHub calls.

## Acceptance criteria (Phase 1A done when)
A teammate, using only the console (no `gh`/GitHub UI), can: see a pushed branch as a card → open its preview →
read its test report → Mark OK to Release → Create PR → see the gate result → (if allowlisted) Approve & Merge →
watch the card advance to DEV_MERGED then PROD_MERGED with deploys firing. Non-allowlisted users cannot merge.

## Open decisions to confirm at session start
- GitHub App vs PAT (recommend App).
- Hosting site name for the console on `starlabs-cicd`.
- Approver allowlist (dev list, prod list).
- Angular-only cards first, or also cloud-function / flutter cards now (recommend angular-only first).
