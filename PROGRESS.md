# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-14 (session 6 — default provider → OCI, schedulers strictly DB-driven)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-08-14-default-provider-oci.md`.

## Current state
- Branch **`videoconference`**; working tree UNCOMMITTED (this session's provider-default
  changes + the 2026-07-18 audio-menu changes in `join-livekit-call/`; git permission-blocked).
- **Default media provider is now `oci` everywhere on the live-call path** (Angular join
  fallback + sanitizer catch-all, monitor join/badge, instant-meeting default, CF
  `createOpenViduToken`/recording start/stop `req.body.provider || "oci"`).
- **Schedulers (`CheckMasternodeStatus`, `CheckOciNodeStatus`) read `activeprovider`
  STRICTLY from `openvidu server/mediaprovider`** — missing doc/field or read error ⇒ null
  ⇒ NO lifecycle actions by either controller. The doc is load-bearing in dev AND prod.
- Recording playback fallback intentionally stays `aws` (legacy recordings; events are
  webhook-stamped since 2026-07-17). CF housekeeping guards still treat missing field as
  aws-scoped (only runs when activeprovider=aws) — open question, journaled.
- `ng build --configuration production` clean (exit 0, pre-existing warnings only);
  CF `node --check` ×3 + require-load OK (9/10/12 exports).

## Last session changes — why
- Operator found rooms created without `mediaProvider` while DB `activeprovider=oci`:
  only 3 of 7 creation paths stamp the field; the 4 studio/appointment Angular paths do
  not, and the fallbacks disagreed (Angular oci vs CF aws vs schedulers aws). Directive:
  absent ⇒ oci on the call path; schedulers trust only the DB. Stamping at the 4 creation
  sites was NOT requested — routing stays fallback-based.

## Pending / next
- ✅ DONE (dev): `flushOpenviduCallQuality` deleted from starlabs-test (archived in CF
  `components/depreciated.js`) and all 20 media functions deployed clean. Prod
  (`fir-sample-aae4a`) still needs the same delete+deploy at cutover.
- Angular rebuild/deploy for client-side fallbacks; verify `openvidu server/mediaprovider`
  exists in BOTH projects. Operator will also disable `CheckMasternodeStatus` (caveats
  in journal: no AWS auto-stop while disabled; re-enable before any switch back to aws).
- Runtime-verify: no-provider token → OCI creds; scheduler doc-present and doc-absent
  behavior; field-less room join lands on OCI and gets stamped at first token.
- Carry-over: operator runtime tests from session 5 (`[mic-check]`, speaker switching,
  NC mode flip); PiP decision; DO bring-up parked; Phase-6 OCI prod; AWS-migration
  cleanup (memory). **Commit both repos** once git is permitted; push stays operator-gated.
