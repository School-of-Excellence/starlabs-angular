# JC Health Tracker — promote Joshua's `5ad9bdf` to development + production (2026-07-03)

**Type:** cross-branch promotion (no new code authored this session).
**Source commit:** `5ad9bdf` (Joshua Samuel, on `joshua-development`) — "JC Health Tracker: 60-day health expiry, Mark addressed, Unassigned summary card".
**Result:** `origin/development` fast-forwarded `7ba23b4 → 9f76877` (cherry-pick); `origin/production` `a5f4599 → 1d84baa` (no-ff merge of development, carrying only `9f76877`).
**Screen affected:** `journey-coach-health-dashboard` (Journey Onboarding).

## What the change adds (behavioural)
- **60-day health expiry** (`HEALTH_TTL_DAYS = 60`): a coach-set health tag older than 60 days (or undated) reverts to "Not assessed". Applied at the single choke point (`freshHealth`) where rows get `coachHealthState`, so the chip, the distribution summary, and the health filter all agree.
- **Mark addressed**: per-participant control (row action + slide-over) that snapshots the currently-active Needs-Attention issues to an `'addressed'` event in the **existing** `healthtracker_activity` collection (`logActivity`). Participant leaves Needs Attention until a *new* issue type appears. Optimistic UI, rollback + toast on permission-denied.
- **Unassigned summary card**: shows the no-coach count; tap opens the Participants view scoped to Unassigned.

**Firestore:** only writes an `'addressed'` event to `healthtracker_activity` (already existed on development). **No new collection.** ATC untouched.

## Why cherry-pick, NOT folder-overlay (the load-bearing decision)
`joshua-development` and `origin/development` had **diverged inside this folder**:
- `joshua-development` has `5ad9bdf` (addressed/expiry) but **lacks** the profile-picture avatar rollout.
- `origin/development` has the **profile-picture avatars** (`<app-profile-picture>` from `ba69f7e`, part of [[profile-picture-rollout]]) but lacks Joshua's addressed/expiry work.

A blind `git checkout joshua-development -- <folder>` (the first thing tried, then discarded) would have **reverted the live profile-picture avatars** back to text initials — a regression. Operator chose **cherry-pick `5ad9bdf`**, which auto-merged cleanly: the avatar lives in the **person column** (`col-person`, ~line 496) and the markAddressed button in the **actions column** (`row-actions`, ~line 590) — different cells, no real overlap. Both features verified present post-merge; no conflict markers.

## Verification
- Post-merge greps confirmed: `app-profile-picture` (1), `markAddressed` (1), `goToUnassigned` (1) in HTML; `ProfilePictureComponent` (2) + addressed/expiry symbols (9) in TS.
- `ng build --configuration production`: **my 5 files compile clean (0 errors).** Build overall FAILS on **12 pre-existing broken files** unrelated to this change (LiveKit/OpenVidu/`adaptive-quality.service.ts` typings, etc.) — already broken on `origin/development`, not introduced here. CI is deploy-only (no build gate), so this does not block deploy but is a standing cleanup item.

---

## Per-screen revert guide

### Screen — Journey Coach Health Dashboard · JC Health Tracker promotion · DONE 2026-07-03
This landed as a **single self-contained commit** touching only 5 files, all under
`src/app/Journey Onboarding/journey-coach-health-dashboard/`:
`coach-health.types.ts`, `journey-coach-health-dashboard.component.{ts,html,css}`, `participant-slideover.component.ts`.

**Revert on a branch (development or production), preserving everything else:**
```
# undo just the JC-health promotion, keep profile-pictures + all other history
git revert 9f76877          # on development
git revert -m 1 1d84baa     # on production (revert the merge, first-parent)
```
Or restore the folder to its pre-promotion (development `7ba23b4`) state:
```
git checkout 7ba23b4 -- "src/app/Journey Onboarding/journey-coach-health-dashboard/"
```
⚠️ **Do NOT** revert by overlaying `joshua-development`'s folder — that re-introduces the
profile-picture regression described above. Revert must target `9f76877` / the merge only.

**Feature-symbol map (to confirm a revert is complete):**
| Feature | Symbol / marker | File |
|---|---|---|
| 60-day expiry | `HEALTH_TTL_DAYS`, `freshHealth`, `isHealthFresh` | `.component.ts` |
| Mark addressed | `markAddressed`, `isAddressed`, `activeIssues`, `loadAddressed`, `addressedByProfile` | `.component.ts` |
| Mark addressed (event type) | `'addressed'` in `ActivityType` | `coach-health.types.ts` |
| Mark addressed (button) | `(click)="markAddressed(r, ...)"` in `row-actions` | `.component.html` |
| Unassigned card | `goToUnassigned`, `unassignedCount` | `.component.{ts,html}` |
| **Must survive any revert** | `<app-profile-picture>` / `ProfilePictureComponent` | `.component.{ts,html}` |

## Pending / follow-ups
- **12 pre-existing production-build errors** on development (LiveKit/OpenVidu/adaptive-quality) — separate cleanup; blocks a clean `ng build --configuration production`.
- Not verified in a live browser (app is Firebase-auth gated); verified via merge inspection + scoped compile of the changed files only.
- Production push will deploy to the live Firebase (`fir-sample-aae4a`) via the Actions workflow.
