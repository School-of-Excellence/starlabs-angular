# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-21 (dynamic-studio-v2 stageTokenList leak + name flicker fix)_ · **New session? Read `specs/ORIENTATION.md` first**, then this + today's journal `specs/journals/2026-06-21-dynamic-studio-v2-stagetokenlist-leak-flicker.md`.

## Current state
- Active work stream is **Dynamic Studio v2** (`src/app/queue system/dynamic-studio-v2/`), the in-studio "My Arena" specialist screen. Recent landed work on `production`: in-studio queue/studio navigator (legacy multi-queue parity), qnav activity names + invited-studio group, profile-picture avatars next to participant names.
- This is an Angular 19 SSR PWA on Firebase. App is auth-gated; the in-studio screen needs an authenticated specialist live in a studio with real `queue_token` data, so it is not reachable from the dev preview without a seeded account.
- Standing test infrastructure (separate from app feature work): the Flutter e2e suite (11/11 green) and the `starlabs-cicd` queue-e2e Firebase project remain available — see earlier journals if reviving that thread.

## Last session changes (2026-06-21) — why
- **Fixed `stageTokenList` console spam + flickering participant names** on the in-studio screen. Root cause: `onStudioSelect()` created its `studio conversation` and `queue_token` Firestore listeners **anonymously** — the already-declared `studioconversationSubscription` / `tokenSubscription` handles were never assigned, so `resetSubscription()`'s teardown was a no-op. Every `onStudioSelect` call (click, auto-enter, "Bring to Studio", re-enter; outer pairing sub re-fires on every check-in/out) stacked another live `queue_token` listener; all of them fired on each token change, each reassigning `this.stageTokenList` → repeated logs + N writes.
- The visible flicker came from the stage/token `*ngFor`s having **no `trackBy`**: each fresh array of fresh objects rebuilt every avatar/name. Added `trackByStageName` + `trackByTokenDocId`.
- Verified: preview HMR rebuilt the `dynamic-studio-v2-component` chunk clean. Full visual repro not reachable from preview (auth-gated). Same latent leak still exists in legacy `dynamic-studio.component.ts` (L811) — left untouched per scope.

## Pending / next
- Live QA on a real multi-token studio: confirm `stageTokenList` now logs once per selection (not in a repeating cycle) and names no longer flicker.
- Optional cleanup once verified: remove the leftover `console.log(token)` / `console.log(this.stageTokenList, 'stageTokenList')` debug lines.
- If legacy `dynamic-studio` is still reachable, port the same handle-storage fix to its `onStudioSelect`/token subscription.
- Commit + push are operator-gated (working line `cicd`; do not touch `main` without approval).
