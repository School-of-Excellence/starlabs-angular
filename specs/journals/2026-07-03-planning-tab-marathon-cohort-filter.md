# 2026-07-03 · Planning tab — current-marathon Cohort filter

## Goal
Understand the "big cohorts" screen (how the current marathon is picked, how cohorts map to a marathon, how participants are stored), then add the current marathon's cohort names as a filter in the Planning tab.

## What I found (big cohorts data model)
Screen: `src/app/big/big-cohorts/big-cohorts.component.ts` (route `bigcohorts`, currently commented out in app.routes).

- **Marathon** — collection **`big marathon`**. Docs have `docid`, `title`, `startdate`. **Current marathon = latest by `startdate`**: the component loads `orderBy('startdate','asc')` and takes `marathonList[length-1]` (`big-cohorts.component.ts:79,88`).
- **Cohorts ↔ marathon** — collection **`big cohorts`**. Each cohort has `name` (display), `marathonref` (DocumentReference → big marathon), `participantidlist` (array of profileids), plus status/eventref/etc. A cohort belongs to a marathon when `cohort.marathonref.id === currentMarathon.docid` (`big-cohorts.component.ts:133`).
- **Participants** — stored directly on the cohort doc as **`participantidlist`** (array of profileid strings) (`:140`, html `:44`). No separate mapping collection.

## Implementation (planning-tab)
- **`loadCohorts()`** (ngOnInit): `big marathon` orderBy startdate asc → last = current (`currentMarathonTitle`); `big cohorts` filtered to `marathonref.id === currentMarathonId` → `cohortList: {id, name, members:Set<profileid>}`. `orderBy` added to firestore imports.
- **State:** `selectedCohorts: string[]`, `selectedCohortMembers: Set` (union of selected cohorts' `participantidlist`, rebuilt in `onCohortsChange`).
- **Filter integration:** a participant "cohort-matches" if `selectedCohortMembers.has(id)`. Wired into `passesParticipantFilters` alongside journey + DFU under the shared `filterMode` (only = AND across active filters; remove = OR). Active-checks in `queueHolderIds` + `computeCards` include `selectedCohorts.length`. `newFilter` resets it.
- **UI:** a "Cohort" mat-select in the Filters box (`.pl-frow`), label = `<marathon title> cohort`, shown when `cohortList.length > 0`, multi-select → `onCohortsChange`. Runtime-only (not saved to `planning_phases`, like journey/DFU).

## Verified live (:4200)
Current marathon resolved as **"Marathon 10"** (label "Marathon 10 cohort"). Dropdown lists its real cohort names ("B!G opportunities at A&H Expanding Horizon Have queries", "I received it, but unable to access…", etc.). uP!/Legacy queue (311) + Show only + cohort "…Have queries" → **Total 1** (only that cohort's in-queue member). Works.

## Layout tidy-up
Filter box was clumsy. Final layout: mode toggle (centered) → `.pl-frow` (align-items:center) containing Journey + Cohort as equal-width `.pl-ffield` (250px, subscript collapsed via `margin-bottom:-1.34375em`) AND the DFU-ongoing chip INLINE with them (`align-self:center`) — not underneath. `.pl-filterbox` padding/gap eased. (Live re-verify blocked by dev-server HMR reloading mid-interaction; build-verified.)

## Notes
- Cohort membership is a static snapshot (`participantidlist` at load); cached in `cohortList[].members`. No live subscription.
- Compares `marathonref.id` to the marathon's `docid` field, mirroring the big-cohorts component (docid field == Firestore doc id for big marathon).
