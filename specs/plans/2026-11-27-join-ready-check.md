# Plan — Join "Ready check" (OpenVidu / LiveKit)

Status: APPROVED 2026-11-27 (operator).

## Context
From "Join now" to "Join Call" there are several checkpoints (new tab, sign-in, server wait,
camera/mic permission, mic/speaker working, network, computer power). On some browsers/devices
these fail and today a person has to guide the participant by phone. Goal: the software checks
everything itself, explains each blocker in plain words, and offers the fix — and the specialist
can see why a participant hasn't joined yet.

## Setup — new branch + worktree (as for the OpenVidu call fixes)
| Repo | Worktree | Branch | Base |
|---|---|---|---|
| Angular | `/Users/macbook/Projects/AngularProjects/starlabs-angular-readycheck` | `feature/join-ready-check` | `charan-release` |
| e2e hub | `/Users/macbook/Projects/Functions/starlabs-e2e-tests-readycheck` | `test/join-ready-check` | hub `main` |

The main checkout (charan-release) still has uncommitted edits: same-tab Join (3 handlers + "Go back" text),
Deep Filter default off, journal `2026-11-24-join-call-same-tab.md`. In the worktree: **bring over the Deep Filter
default + journal**, **not** the same-tab edits (Phase 1 replaces them). What to do with the same-tab edits left in
the main checkout is the operator's call (I won't discard them unasked).

## What a web page can and cannot do (sets the limits of this plan)
| Want | Possible? | How |
|---|---|---|
| Change the browser's pop-up setting | **No** — browsers forbid pages from changing their own settings | Avoid the block instead (1a), detect + one-click retry (1b), show steps (1c) |
| Change the browser's camera/mic setting | Only re-ask **if not yet blocked**. Once blocked, no page can unblock itself | Re-ask when allowed; otherwise show steps for that browser. Chrome's experimental in-page "Allow camera" button can re-ask after a block — check status before using |
| Change Mac / Windows privacy settings | **No** | Button that **opens the right settings page** (Windows `ms-settings:privacy-webcam`, Mac System Settings → Privacy → Camera); browser asks "Open Settings?", user flips the toggle |
| Open the browser's own settings page (`chrome://…`) | No — pages can't link to it | Show the steps as text + picture |

## Phase 1 — Join opens a new tab, reliably (replaces the uncommitted same-tab change)
| # | Change | Where |
|---|---|---|
| 1a | Open the tab **inside the click** (blank, "Preparing your meeting…"), do the room work, then point it at `/joinroom/<id>`. Close it + show the error if room setup fails | `appointment-studio.component.ts` `joinRoom_Appointment`, `list-openvidu-room.component.ts` (appointment join), `dynamic-studio-v2.component.ts` (live-assignment join) |
| 1b | If the tab is still blocked (`window.open` returns nothing): dialog "Your browser blocked the meeting window" + **[Open meeting]** button (a fresh click is always allowed) | same 3 handlers, one shared helper |
| 1c | Same dialog: "Always allow" steps for the detected browser (Safari → Settings → Websites → Pop-up Windows → Allow; Chrome/Edge → address-bar icon → Always allow) | shared helper |
| 1d | Same-tab edits are not carried into the worktree, so the handlers start from `window.open`; "Close and Join Meeting" text stays | — |

## Phase 2 — Camera / mic: say exactly what's wrong and offer the fix
Screen: `src/app/LiveKit/join-livekit-call/` pre-join (`prepareParticipant()` today maps every error to "Not enabled"/"Blocked").
| Browser error | Message | Fix button |
|---|---|---|
| Not asked yet / pop-up dismissed | "Allow camera and microphone" | **[Allow]** → browser prompt |
| Blocked by the site setting | "You blocked camera/mic for this site" | Steps for that browser (+ Chrome in-page button if available) → **[Try again]** |
| Blocked by Mac / Windows | "Your computer is blocking the browser from the camera" | **[Open camera settings]** (OS deep link) → **[Try again]** |
| Device busy | "Camera is in use by another app (Zoom, Teams…)" | "Close it" → **[Try again]** |
| No camera | "No camera found — a camera is needed to join this call" (camera stays mandatory, operator 2026-11-27) | Steps: plug in / enable a camera → **[Try again]** |
| Mic silent | Live level meter: "We can't hear you — check mute switch / pick another mic" | Mic picker |
| Speaker | **[Play test sound]** → "Heard it?" No → speaker picker | Speaker picker |

## Phase 3 — Run the checks while the server starts
Device checks run during the server wait (up to ~15 min), not after it (today `checkServer()` only calls
`prepareParticipant()` once the server is ready). Browser check up front: in-app browser (WhatsApp/Instagram)
→ "Open in Chrome/Safari" + copy link; phone → "join from a computer" (D9). Weak laptop → blur + Deep Filter off automatically.

## Phase 4 — Network test + live "why not joined yet" for the specialist
Network: test connection to the real media server (LiveKit connection checker — verify it's in our version).

Recording rules (operator, 2026-11-27):
| Rule | Detail |
|---|---|
| Who is checked | **Everyone** — participants and specialists/hosts run the same checks and see the same fixes |
| Who is stored | **Participants only.** Hosts (`roomDetail.hosts`) are never written |
| When stored | **Only before the call** — written/updated as each check changes, from page open until they connect |
| When deleted | **The moment they connect** to the call (also when the host ends the meeting). Rejoin after a drop → written again until connected |
| What is stored | Current step + each check's state, e.g. "camera: busy (Zoom?) — retried 2×", "server: starting", last-updated time |
| Where | One doc per participant: `openviduroom/<roomId>/precheck/<profileId>` (Firestore rules: participant writes own doc, hosts read) |
| Who sees it | The specialist, **on their own call screen only** (operator 2026-11-27) — "Not joined yet" panel: "Prithi — stuck at camera: in use by another app (2 min ago)". Not in appointment studio |
| Closed tab | Doc stays with "left the page at 11:12" so the specialist knows they gave up, not stuck |

Trade-off: deleting on join means **no history** — we won't learn which problems are most common.

## Dropped for now
- "Test my setup" page in reminder email / WhatsApp (operator, 2026-11-27: not required now).

## Decisions (operator, 2026-11-27)
- Camera stays mandatory — no mic-only join.
- "Not joined yet" shows on the specialist's own call screen only.
- Join keeps opening a new tab.

## Verification (per phase)
- `npx tsc -p tsconfig.app.json --noEmit` clean.
- Phase 1: Safari (pop-ups on default Block) — Join from appointment studio opens the call tab; with a forced block, the "Open meeting" dialog appears and works.
- Phase 2: on starlabs-test, reproduce each error (block site permission, block in macOS privacy, camera held by Zoom, no camera) and check the message + fix button.
- Phase 4: participant stuck on camera → specialist panel shows it; participant connects → `precheck` doc deleted; host's own checks never written.
- e2e: new `data-testid` hooks + queue-suite spec via the `screen-e2e-coverage` skill before push; journal + revert guide per screen.
