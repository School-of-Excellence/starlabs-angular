# 2026-11-24 — OpenVidu "Join" opens the call in the same tab

## What
The three live Join handlers now go to `/joinroom/<id>` with `router.navigate` (same tab) instead of
`window.open(..., '_blank')`.

| Screen (route) | File | Handler |
|---|---|---|
| Appointment studio (`/appointmentstudio`) | `src/app/Scheduling/appointment-studio/appointment-studio.component.ts` | `joinRoom_Appointment` (OpenVidu branch) |
| Participant studio (`/participantstudio`) | `src/app/OpenVidu/list-openvidu-room/list-openvidu-room.component.ts` | appointment join (OpenVidu branch) |
| Queue studio (`/dynamicstudio`) | `src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.ts` | live-assignment join |
| Call page (`/joinroom`) | `src/app/LiveKit/join-livekit-call/join-livekit-call.component.html` | host "ended" text: "Close and Join…" → "Go back and Join…" |

## Why
- Each handler awaits Firestore (`getDoc` → create room / `active:true`) before opening the tab.
  Safari only allows a new tab inside the click itself; after the awaits it treats `window.open`
  as an unwanted pop-up and blocks it (Safari's pop-up setting is "Block" by default). Chrome allows a
  few seconds of grace, so it mostly worked there.
- Operator chose same tab over "open a blank tab first, fill it after" (2026-11-24).
- Browser Back returns to the studio; in the same tab "Close" would close the app, hence the text change.

## Not changed (deliberately)
- Zoom branches and `joinRoom_Queue` (participant studio queue join) still `window.open` — they open
  straight from the click, so Safari allows them.
- `queue system/dynamic-studio` (v1) is not routed (`/dynamicstudio` loads v2) — left alone.
- The commented-out block in appointment-studio (old `bookingid` flow) — dead code.

## Trade-off to watch
The studio page is destroyed while the call runs. Back reloads it from Firestore (no local state
is lost that isn't in Firestore), but the coach no longer sees the studio side by side with the call.

## Revert guide
In each of the three handlers, replace
`this.router.navigate(['/joinroom', <id>]);` with
`window.open(this.router.serializeUrl(this.router.createUrlTree(['/joinroom', <id>])), "_blank");`
and restore "Close and Join Meeting to start again." in `join-livekit-call.component.html`.

## Verification
- `tsc -p tsconfig.app.json --noEmit` clean.
- Not clicked through in a browser (auth-gated flows need a real appointment / live assignment).

---

# Same day — in-call noise cancellation defaults to In-Built

## What
`join-livekit-call.component.ts`: `dfnEnabled` default `(hardwareConcurrency || 4) >= 4` → `false`.
Every participant now joins with the browser's built-in noise suppression + auto gain + echo
cancellation (`micCaptureOptions()`); the DeepFilterNet processor is not loaded unless the user picks
"Deep Filter Noise" in the mic menu. The menu, the switch (`setNcMode`) and the diag panel are unchanged.

## Why
Operator directive (2026-11-24). DFN costs CPU (an AudioWorklet per mic) and has been in the path of
the audio issues worked on 2026-11-15 (double worklet registration, mic recovery restarts); the
built-in path is the browser's own, tested pipeline. Echo cancellation stays ON in both modes (D8).

## Revert guide
In `join-livekit-call.component.ts` set
`dfnEnabled = (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4) >= 4;`

## Verification
- `tsc` clean. e2e `queue/livekit-controls-addressable.spec.ts` only checks the DFN hooks exist, not the default.
- Not tested in a live call: check that the mic menu shows the tick on "In-Built Noise Cancellation" and the
  console's mic-state log shows `dfnEnabled: false, noiseSuppression: true`.

## Also in this change: noise suppression default (operator, 2026-11-24)
`join-livekit-call.component.ts`: `dfnEnabled = false` — calls start on the browser's built-in noise
suppression; Deep Filter Noise is opt-in from the mic menu. Was on by default for 4+ core devices.
Revert: `dfnEnabled = (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4) >= 4;`
