# 2026-11-25 — Pull from sashong-development: VideoAsk in the participant delivery sequence

**Operator ask:** "get from sashong-development" → "pull 4". Only
`Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component.ts` from
Sashong `12c423f3` (2026-11-25), taken whole (+14/−1). Our last change to the file (`3853e4a7`, profile switcher
off / no full-roster load) is in his history.

## What it does
The delivery picker also lists every `arenavideoask` doc (by `title`, type `videoask`) next to forms, fieldwork,
appointments, etc. Read-only addition (one more `getDocs` on open); the save path is unchanged — the picked
item's `path` / `type` are stored like every other delivery.

## Not taken (same commit / branch)
`evolution-prep-forms` screen + route, `formtemplate` epid → moves `evolution prep`, `jc-evprep-board`
`completedstages` object shape (items 1–3: a data-shape change, kept together, not picked). Also not:
journey-pipeline, evolutionprep-variation, queue-event-health Reinitiate, content-analytics-v2 spec, and his
`app.routes.ts` / `journeycoach-dashboard` (revert newer development work).

## Worth knowing
- One extra read of the whole `arenavideoask` collection each time the screen opens.
- No `data-testid` changes.

## Revert guide
Before commit: `git checkout HEAD -- "src/app/Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component.ts"`.
After commit: `git revert <that commit>`.
