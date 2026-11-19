# 2026-11-16 — Pull `feature/openvidu-call-fixes` onto charan-release (+ e2e)

**Operator ask:** "get from feature/openvidu-call-fixes and write e2e and push to charan-release".
Branch = the approved OpenVidu plan (`specs/plans/2026-11-14-openvidu-call-fixes.md`, comes over with this pull)
plus the round-1/round-2 test fixes. Its merge-base is charan-release `8bfa10d3`, so every file was taken whole
(`git checkout origin/feature/openvidu-call-fixes -- <file>`), verified byte-identical, nothing to merge.

## Taken (5 commits: 41cffa38, a6dd11e0, 739ccf2f, 7cfc5243, 94a12534)
| Area | Files |
|---|---|
| /joinroom call screen | `LiveKit/join-livekit-call` css/html/ts — waits for a READY media node ("Starting the video server…" + clock), retries 503 "Media node not ready", re-touches the room (`waitingForServerAt`) for wake-on-join, audio/device fixes |
| Noise filter | `LiveKit/dfn/vendor/deepfilternet3-noise-filter/index.esm.js` (echo cancellation ON with DFN) |
| OpenVidu | `openvidu-audio-element`, `openvidu-recording`, `list-openvidu-room` (comment) |
| Room creation | `authguard.service.ts` `createOpenViduRoom()` stamps `mediaProvider` from `openvidu server/mediaprovider` (D1) |
| OCI control calls | `instance-status.service.ts` — start/stop/scale send the Firebase ID token |
| Adaptive quality | `Service/AdaptiveQuality/adaptive-quality.service.ts` + unit spec |
| Appointment studio | comment only |
| Docs | plan + 3 journals (phase 1, phases 1b–4, parked items) |

## e2e
Hub `test/openvidu-call-fixes` (worktree `starlabs-e2e-tests-openvidu`): `queue/join-livekit-server-wait.spec.ts`
LKJ-01..03 (+ LKJ-ADDR1 fixme), seed `OCI_System/instance_status` baseline (`OCI_STATUS_BASELINE`), journal
`2026-11-15-joinroom-server-wait.md`. hook-diff aligned for LiveKit (44 hooks) and OpenVidu (42). Readiness: MATCHED.
`adaptive-quality.service.ts` is under `src/app/Service/**` → cross-cutting → CI runs every suite.

## Checks
- `tsc -p tsconfig.app.json` exit 0 · unit lane 2385/2385.
- Backend (`fix/oci-controller-memory` in starlabs-cloud-function) is NOT part of this push; operator deploys it by hand,
  Angular first.

## Revert guide
Per-screen: `git checkout 8bfa10d3 -- <file>` for any row above (8bfa10d3 = charan-release before this pull).
