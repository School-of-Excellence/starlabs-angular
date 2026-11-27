# Plan — OpenVidu call: retry, poor-connection warning, reconnect, waiting room

Status: APPROVED (operator 2026-11-27 "build it"). Draft history in ~/.claude/plans.

## Operator decisions (2026-11-27)
| Topic | Decision |
|---|---|
| Waiting room scope | Every OpenVidu call (appointment, live assignment, private room) |
| Participant arrives first | Waits until a specialist joins and admits them |
| Cloud Function deploy | Claude deploys — starlabs-test first, production after operator OK |
| Admins | Skip the waiting room (like hosts, developer, tester) |
| Host list | Room `hosts` as saved today — no re-reading the appointment (reassigning isn't possible; only cancel + create) |
| Specialist alert | Sound + browser notification, also when the call tab is in the background; clicking the notification brings the call tab to the front |
| Leftover entries on auto-close | Leave them (cleared on reopen / End all) |
| Waiting clock change | **Dropped** — clock stays as it works today (no `openedat`) |
| e2e | Only when the operator says |
| Ghost monitor | Works as today — skips the waiting room, no role check |
| Ghost token | **Listen-only** (`canPublish:false`) for every id ending in ` - Ghost` |
| Verify sign-in in `createOpenViduToken` | **Now** |
| Deny | **Final** for the call; only the specialist's **Let in** undoes it |
| Lost contact | After **3 min** without a heartbeat |
| Rejoin | Keeps trying for **2 min** |

## Setup
| Repo | Worktree | Branch | Base |
|---|---|---|---|
| Angular | `starlabs-angular-resilience` | `feature/openvidu-call-resilience` | `feature/join-ready-check` |
| Cloud Functions | `starlabs-cloud-function-deploy` | `feature/waiting-room` | `origin/development` |

---

## Phase 1 — Retry 503 / 504 / network errors on the token call
- **Cloud Functions:** none. **Firestore fields:** none.
- **Example:** Charan clicks Join at the moment Google returns "504". Today: red error, refresh. After: "Getting your video server… 0:12", the page retries after 2, 4, 8, 15, 30 s; Google recovers at 0:25 → Charan is in. Error + Try again only after 3 min.

## Phase 2 — "Your connection is poor" banner
- **Cloud Functions:** none. **Firestore fields:** none.
- **Example:** Charan's internet weakens mid-call. After 5 s: "Your connection is weak — video lowered to keep the call going [Turn off my video]". Vignesh sees "Connection weak" on Charan's tile. Good for 10 s → banner gone.

## Phase 3 — Reconnect instead of "You left"
- **Cloud Functions:** none (a rejoin asks `createOpenViduToken` like a first join).
- **Firestore fields** (inside the existing Ready-check entry `precheck.<profileId>`, participants only):
| Field | Written by | Read by | Removed |
|---|---|---|---|
| `state = 'reconnecting'` + `reconnectingSince` | Participant's page while rejoining | Specialist's panel: "Charan — reconnecting (0:40)" | On reconnect |
| `state = 'disconnected'` | Participant's page when rejoining gives up (only if online) | Panel: "Charan — disconnected at 11:32" | Rejoins, End all, reopen |

**Timeline — drop that recovers**
| Time | Charan sees | Vignesh sees |
|---|---|---|
| 11:30:00 Wi-Fi drops | "Reconnecting…" over the call | "Charan — reconnecting" |
| 11:30:00–15 | LiveKit's own silent retry | |
| 11:30:15 | our rejoin takes over: new token → reconnect, every few seconds | "reconnecting (0:15)" |
| 11:30:20 Wi-Fi back | back in the call, same camera / mic / settings | entry disappears, Charan's tile back |

**Timeline — Wi-Fi never returns**
| Time | Charan sees | Vignesh sees |
|---|---|---|
| 11:30 drop | "Reconnecting…" | "Charan — reconnecting" |
| 11:32 (2 min) rejoin gives up | "You were disconnected [Rejoin]" | still "reconnecting" (Charan's page can't send anything) |
| 11:33 (3 min since the last heartbeat) | — | **"Charan — Lost contact, last seen 11:30"** |

Not a drop (no rejoin): Leave, removed by host, End all, same account joined in another tab.

### "Lost contact" rule (app only, no new field)
Every participant page re-saves its entry's `updatedAt` once a minute (the heartbeat, already built). The specialist's panel: if `updatedAt` is more than 3 min old → "Lost contact — last seen <time>", whatever `state` says. Covers: tab closed, browser crashed, laptop asleep, internet gone — in the Ready check, the waiting room, or while reconnecting. If the internet returns while the tab is open, the next heartbeat puts the entry back to normal.

## Phase 4 — Waiting room
### Cloud Functions
| Function | File | Change | Why |
|---|---|---|---|
| `createOpenViduToken` | `components/openVidu.js` | Before `prepareRoom()`: caller in room `hosts`, or role developer / tester / admin (`profile_data/<id>.role_ref`), or in `admitted`, or switch off → token. `denied` → `403 DENIED`. Else → `403 WAITING` | The wait must be on the server or it can be skipped; checking before `prepareRoom()` means a waiting participant never orders media nodes |
| `createOpenViduToken` (sign-in) | same | Verify the Firebase sign-in token sent by the page and check it belongs to `participantId` | Stops someone claiming a specialist's id (see "How a bypass can happen") |
| `openViduCloseRoom` (End all) | same | Also delete `waiting`, `admitted`, `denied`, `precheck` | Clean slate for the next call in that room |
| `createOpenViduToken` (Ghost) | same | Id ending in ` - Ghost` → skip the waiting room, token with `canPublish:false` | Keeps the monitor working; the suffix can't be used to appear in a call unadmitted |
| `kickParticipant` (Remove) | same | Also delete `admitted.<id>` | A removed person who refreshes lands in the waiting room |

### Firestore fields (room doc `openviduroom/<roomId>`)
| Field | Written by | Read by | Removed |
|---|---|---|---|
| `waiting.<profileId>` `{name, since}` | Participant's page on `WAITING` | Specialist's waiting panel + sound + notification | Joins, denied, leaves, End all, reopen |
| `admitted.<profileId>` `{by, at}` | Specialist: Admit / Admit all / Let in | `createOpenViduToken`; participant's page (joins by itself) | End all, Remove, reopen |
| `denied.<profileId>` `{by, at}` | Specialist: Deny | `createOpenViduToken`; participant's page | Let in, End all, reopen |
| `precheck.<id>.state = 'waiting'` | Participant's page | "Not joined yet" panel: "in the waiting room" | On connect |
| New doc `openvidu server/waitingroom` → `enabled`, `verifySignIn` | Claude, once per project | `createOpenViduToken` | — (on/off switches) |

### Specialist alert (operator 2026-11-27)
- The call tab listens to the room doc (already does). New `waiting` entry → plays a chime + shows a browser notification "Charan is waiting to join".
- Works while the call tab is in the background or the browser is minimised (the tab keeps its live connection). Not if the call tab is closed.
- Clicking the notification → brings the call tab to the front, waiting panel open.
- Needs notification permission once: asked when the specialist joins a call ("Allow notifications so you know when someone is waiting"). If blocked → sound + panel only.
- macOS Focus / Windows Do-not-disturb can hide the notification; the sound still plays.

### Deny by mistake
Denied people stay in a **Denied** list on the panel with **[Let in]** → same as Admit; the participant joins by themselves (or on reopening the link).

### Example
4:55 Charan clicks Join → "Waiting for the coach to let you in". 5:00 Vignesh joins (host → straight in), chime + notification "Charan is waiting". Vignesh clicks Admit → Charan's page joins by itself. Charan drops later → rejoins without waiting (already admitted).

### Rollout
Release app → deploy Functions with `enabled:false` → switch on in starlabs-test, test → production on operator OK.

---

## Sign-in check (decision: now)
| Step | Detail |
|---|---|
| Page | `join-livekit-call` and `monitor-liveassignment` send `Authorization: Bearer <Firebase ID token>` with the token request |
| `createOpenViduToken` | Verifies the ID token → `uid` → `profile_data` where `user_ref == user_data/<uid>` → that profile id must equal `participantId` (ignoring the monitor's ` - Ghost` suffix). Mismatch / missing → `401` |
| Rollout | Separate switch `openvidu server/waitingroom.verifySignIn` (boolean): on only after the new app is live, so a cached old page isn't locked out |
| Callers found | `join-livekit-call`, `monitor-liveassignment` (ghost monitor). `join-openvidu-call` is unrouted (deprecated). No Flutter caller |

## Ghost monitor (operator 2026-11-27: keep it working as today)
`/monitorliveassignment` auto-joins every live call as `<profileId> - Ghost` (no button; Listen only unmutes).
- `createOpenViduToken`: an id ending in ` - Ghost` **skips the waiting room** — no role check, never written to `waiting`, no sound / notification for the specialist.
- Sign-in check still applies to the part before ` - Ghost` (the monitor page sends its sign-in token too) — a legitimate monitor is unaffected.
- **Listen-only token** (operator 2026-11-27): every id ending in ` - Ghost` gets `canPublish:false` (can still subscribe — see + hear; `canPublishData` unchanged). The function can't tell a real monitor from someone faking the suffix, so it applies to all Ghosts.
  - Real monitor: no change — it never turns on camera/mic; Listen, speaking/mute/quality indicators and End Room (separate function) work as today.
  - Someone faking ` - Ghost` to skip the waiting room: gets in but the media server refuses their camera/mic → can only listen silently.
  - If the monitor ever needs to talk (supervisor steps in), this must be revisited.

## Order / landing
1 → 2 → 3 → 4, one commit per phase after operator OK; journal + revert guide per screen. e2e when the operator asks.

## Verification (starlabs-test)
1. DevTools request blocking on `createOpenViduToken` → retry message → joins when unblocked.
2. "Slow 3G" throttling → banner.
3. Wi-Fi off 20 s → "Reconnecting…" → back in; Wi-Fi off 4 min → "You were disconnected", specialist sees "Lost contact"; Leave / End all still end normally.
4. Participant first → waits; specialist joins → chime + notification (tab in background) → click → call tab in front → Admit → in; Deny → Let in → in; Remove → refresh → waiting; direct Function call without admission → 403; `enabled:false` → no waiting.
