# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-20 (LiveKit call audio debug + fix)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-06-20-livekit-audio-breakup-debug.md` (WHY + live test data).

## Current state
- **LiveKit call audio is fixed and verified live.** The DeepFilterNet3 (DFN) noise filter is correctly integrated into `src/app/LiveKit/join-livekit-call/` — processor attached, AudioContext 48 kHz, oracle-validated config (atten 80 / makeup 1.2 / gate −45 dBFS). DFN is the right NR per the videoconference oracle (`Results.md`: PESQ 2.81, STOI 0.97 — beats all alternatives). PicoVoice Koala + AI Coustics services exist but are **inactive dead code** in the call path; DFN stays the single active NR.
- **AWS (ap-south-1, acct 968234051275):** OpenVidu Elastic, master `i-05b2c332ec7c9e4ca` + media ASG, both **c6a.xlarge** (fixed-perf, correct). Fleet was brought up for the test; LE TLS cert valid.

## Last session changes (2026-06-20) — why
- **Root cause of "audio breaks up / unintelligible": DTX.** `AdaptiveQuality.getRoomConfig()` set only video publish defaults, so audio DTX defaulted ON; combined with the DFN −45 dBFS gate, the Opus encoder cut transmission during every silence → choppy speech onsets. **Fix:** added `dtx: false` + explicit `red: true` (RED redundancy) to `publishDefaults` in `src/app/Service/AdaptiveQuality/adaptive-quality.service.ts`, matching the videoconference reference. Verified live (continuous ~50 pps, `dtx active: no`).
- **Composite recording ruled OUT empirically.** Joined the live call (`ng.getComponent → audioDiag()`) and ran a record-ON vs record-OFF A/B: uplink identical and pristine both ways (0% loss, 30 ms RTT, ~3 ms jitter, 0 nacks, **direct** `prflx↔host` candidate pair — no TURN relay). So recording is not the cause; instance class and relay also ruled out.
- Added a read-only dev diagnostic `audioDiag()` to the call component (DFN status + uplink/downlink WebRTC health). `__lk` window handle is `!environment.production`-gated.

## Pending / next
- **Working tree is uncommitted** (entangled with the prior-session DFN integration under the untracked `src/app/LiveKit/` tree + modified `adaptive-quality.service.ts`). Commit the audio fix when ready (branch `videoconference`; push is operator-gated).
- **Downlink not measured live** — only 1 participant could join (single Chrome profile = single LiveKit identity). Uplink/transport are clean and the DTX fix is verified, but a true 2-person "A hears B" test is still worth doing.
- **Optional:** per-speaker recording (better for ATC transcription) — switch `startRoomCompositeEgress` → per-participant `startTrackCompositeEgress` in `Starlabs Functions - VideoConference/functions/components/openVidu.js:331` (ffmpeg, no headless Chrome). Not needed for audio quality; needs a functions deploy.

_Last updated: 2026-06-26 (Offline ATC: local-first draft cache shipped)_ · **New session? Read `specs/ORIENTATION.md` first**, then this + today's journal `specs/journals/2026-06-26-atc-draft-local-first-cache.md` and ADR `specs/plans/2026-06-26-atc-draft-local-first-cache.md`.

## Current state
- **Offline ATC draft saving was reworked.** Firestore's persistence cache (the b815 root cause + prime suspect for app-wide slowness) is removed from `src/main.ts`; durability now lives in a new local-first cache `ATCDraftService` (`src/app/shared/atc-draft.service.ts`, pure logic in `atc-draft.logic.ts`). `FirestoreRecoveryService` is deleted. Both ATC flows (`prescribe-atc`, `edit-atc`) are wired to it. A conflict picker dialog (`src/app/ATC/shared/draft-conflict-dialog.component.ts`) handles the two-device case; the rejected version is archived to `…/{docId}/conflicts/{rev}` — never lost.
- **Not yet built/run as the real app** (per project rule: Claude never builds/runs ATC). During development the reconciliation logic was verified by a throwaway non-ATC Node harness (**43/43** checks: decision tables, dirty lifecycle, rev create/update, took-remote, two-device conflict both branches + archive, submit self-heal, two-offline-devices, race-mid-transaction) plus a clean type-check of the 3 new Angular-facing files against the project tsconfig. The harness has been **removed** — those test cases are to be recreated in the separate Playwright e2e project (see journal + test plan for the case list).
- Angular 19 SSR PWA on Firebase, auth-gated. Branch: `offline-ATC`. **Uncommitted** — all changes are local.

## Last session changes (2026-06-26) — why
- Removed `persistentLocalCache`/`persistentMultipleTabManager` (kills b815 + the slowness/media regression). Durability moved to our own IndexedDB (`atc_draft_cache`), so offline draft list/load are now served by the cache (replacing the removed `getDocsFromCache`).
- Conflict detection = server `rev` counter compared in a `runTransaction` (clocks can't order two offline devices). Policy = whole-draft user pick + archive-the-loser (operator: "data loss is never an option, minimal easy UX"). Reconciliation runs at draft-open so the components' existing field-hydration is untouched; autosave refuses to clobber on divergence and surfaces it on next open.
- The harness caught a real `ng build` blocker (closure-narrowed `outcome` literal → TS2367) before any build; fixed via a holder object. Learned `LocalDraftService` is non-ATC (left untouched) and the default DB was already memory-cache (low blast radius).

## Pending / next
- **Operator manual matrix** (`specs/plans/2026-06-26-atc-draft-local-first-cache-TESTPLAN.md`): two-tab b815 check, two-device conflict + archive, crash/refresh durability, offline list/load, submit self-heal, media path, **migration off old `atc_draft_outbox`**, and the app-wide perf/media-regression re-check.
- **Recreate the reconciliation test cases in the separate Playwright e2e project** (the 43 checks are listed in the journal + test plan; the dev harness was removed).
- No in-app read UI for the `conflicts/{rev}` archive yet (Firestore console only).
- Commit + push are operator-gated. Branch is `offline-ATC`; do not touch `main` without approval.

_Last updated: 2026-06-26 (Offline ATC: local-first draft cache shipped)_ · **New session? Read `specs/ORIENTATION.md` first**, then this + today's journal `specs/journals/2026-06-26-atc-draft-local-first-cache.md` and ADR `specs/plans/2026-06-26-atc-draft-local-first-cache.md`.

## Current state
- **Offline ATC draft saving was reworked.** Firestore's persistence cache (the b815 root cause + prime suspect for app-wide slowness) is removed from `src/main.ts`; durability now lives in a new local-first cache `ATCDraftService` (`src/app/shared/atc-draft.service.ts`, pure logic in `atc-draft.logic.ts`). `FirestoreRecoveryService` is deleted. Both ATC flows (`prescribe-atc`, `edit-atc`) are wired to it. A conflict picker dialog (`src/app/ATC/shared/draft-conflict-dialog.component.ts`) handles the two-device case; the rejected version is archived to `…/{docId}/conflicts/{rev}` — never lost.
- **Not yet built/run as the real app** (per project rule: Claude never builds/runs ATC). During development the reconciliation logic was verified by a throwaway non-ATC Node harness (**43/43** checks: decision tables, dirty lifecycle, rev create/update, took-remote, two-device conflict both branches + archive, submit self-heal, two-offline-devices, race-mid-transaction) plus a clean type-check of the 3 new Angular-facing files against the project tsconfig. The harness has been **removed** — those test cases are to be recreated in the separate Playwright e2e project (see journal + test plan for the case list).
- Angular 19 SSR PWA on Firebase, auth-gated. Branch: `offline-ATC`. **Uncommitted** — all changes are local.

## Last session changes (2026-06-26) — why
- Removed `persistentLocalCache`/`persistentMultipleTabManager` (kills b815 + the slowness/media regression). Durability moved to our own IndexedDB (`atc_draft_cache`), so offline draft list/load are now served by the cache (replacing the removed `getDocsFromCache`).
- Conflict detection = server `rev` counter compared in a `runTransaction` (clocks can't order two offline devices). Policy = whole-draft user pick + archive-the-loser (operator: "data loss is never an option, minimal easy UX"). Reconciliation runs at draft-open so the components' existing field-hydration is untouched; autosave refuses to clobber on divergence and surfaces it on next open.
- The harness caught a real `ng build` blocker (closure-narrowed `outcome` literal → TS2367) before any build; fixed via a holder object. Learned `LocalDraftService` is non-ATC (left untouched) and the default DB was already memory-cache (low blast radius).

## Pending / next
- **Operator manual matrix** (`specs/plans/2026-06-26-atc-draft-local-first-cache-TESTPLAN.md`): two-tab b815 check, two-device conflict + archive, crash/refresh durability, offline list/load, submit self-heal, media path, **migration off old `atc_draft_outbox`**, and the app-wide perf/media-regression re-check.
- **Recreate the reconciliation test cases in the separate Playwright e2e project** (the 43 checks are listed in the journal + test plan; the dev harness was removed).
- No in-app read UI for the `conflicts/{rev}` archive yet (Firestore console only).
- Commit + push are operator-gated. Branch is `offline-ATC`; do not touch `main` without approval.
