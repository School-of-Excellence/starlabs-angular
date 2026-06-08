# 04 · Dynamic Studio — DRAFT (code+data investigated 2026-06-05)

> **Status: DRAFT, not yet fully operator-signed-off.** Code + read-only production data investigated 2026-06-05 against `production` (Angular) + the CF repo on `development`. Core concepts **validated in session** with the operator: the **data-widget vs action-widget** split and the **upstream provenance** of the read-only widgets. Remaining items (video-stack intent, invitation/transition edge cases) are flagged **open** in §10. Promote to VALIDATED after the operator walkthrough.
> Evidence (in-repo): probes + outputs in `specs/journals/2026-06-05-dynamic-studio-artifacts/`. Supersedes `specs/LIVE-STUDIOS.md` for studio-runtime mechanics once validated.
> **Branch note:** `production` advanced to `1ea4e49` during this session (workshop-dashboard change only — does **not** touch the studio runtime; this doc's `file:line` cites are stable).

## 1. What the Dynamic Studio is
The **studio runtime** — the specialist-facing **"My Arena"** screen where delivery actually happens. #3 Queue Manager routes a participant *to* a studio assignment; **#4 begins the moment a `live assignment` is created** and covers everything inside the live session: the video room, the consolidated participant context, the ATC-authoring actions, and the stage-completion move.

It is **not** a video tool with a chat bolted on. It is a **consolidation + delivery surface**: it *reads* the participant's entire upstream history (forms, AEL, ATC, engagement, journey) into one place beside the live call, and the only things it *writes* are a small set of delivery actions (ATC authoring, AEL validation, procedure completion, stage move).

Live component = **`src/app/queue system/dynamic-studio/dynamic-studio.component.ts`** (2,629 lines, route `/dynamicstudio`) + its template (532 lines). Companion ops screen = **`arenastudioactivity`** (route `/arenastudioactivity`) — a cross-queue live-studio monitor with a force-close. Studios are pre-built by **`big-planner`** (route `/queuebigplanner`) as `queue studio pairing` docs. Backend triggers = `starlabs-cloud-function/functions/components/queuesystem.js` (`development`) + `openVidu.js`.

## 2. The two widget classes — the load-bearing model
Everything the specialist sees in a live session is one of two kinds. **This is the core insight of #4.**

### 2a. DATA widgets — read-only projections of *upstream* processes (CQRS read-models)
The studio neither creates nor owns this data; it is collected by **other processes outside the queue and studio** and merely surfaced at point-of-delivery. Each is config-gated by the stage's `studiowidgets[]`.

| Widget (`studiowidgets` key) | Surfaces | Collected by (outside the studio) | Read site |
|---|---|---|---|
| Submitted forms (`participantForm`) | participant's self-guided form answers | the participant app's **self-guided form stages** (queue `participantform`) — done alone | `onStudioSelect` :632 |
| Participant AEL (`validateael`) † | crossover-metric levels | the **AEL assessment** (`accelerated evolution level` + participant `crossovermetric`) | `getCurrentAEL` :2141 |
| Triple ATC (`viewtripleatc`) † | participant-submitted triple ATC | the **ATC submission flow** (`triple atc`, secondary Firestore, `status=='atc given'`) | `getTripleATC` :2112 |
| Previous ATC (`previousatc`) | prior prescriptions | the **ATC system** (earlier sittings) | `<app-view-participant-atc>` |
| Prescribed ATC, validated/unvalidated (`prescribedvalidatedatc`/`prescribedunvalidatedatc`) | ATC prescribed to date | the **ATC system** | `previewATC` :1670 |
| Love Letters (`loveletters`) | participant appreciation notes | the **interim-report engagement system** (`love letter` — 1,094 docs; twin of `ask AH` — 857) | `getLoveLetters` :1840 |
| uP!-visit chip | first-time vs returning | **journey/visit data** | `getParticipantUPVisit` :1812 |

→ Footnote: **Love Letter / Ask AH** (engagement) and the **form / AEL / ATC submission** flows belong to *later* concept groups; #4 only **surfaces** them. `studioZoomLink` is likewise out-of-scope authoring (see §5).

### 2b. ACTION widgets — the studio actually authors/mutates here
- **Add ATC** — validated ("for Implementation/Event", `addvalidatedatc`) or unvalidated ("for Consultation/Review", `addunvalidatedatc`) — `addATC` :1658.
- **Assign changeagent to procedures** (`assignprocedure`) — `assignChangeagent` :1985.
- **Mark completed procedures** / changework, with audio changework-brief playback (`assignedatc`) — `markProcedure` :1970.
- **Move participant to next-month review** (`movetonextqueue`) — `movetoNextMonthReview` :2290.
- **Stage-completion transitions** ("Completed [STAGE]?") — the variation-scoped operator `nextstage` buttons from #3 — `moveStage` :1157.

### 2c. † HYBRID widgets — surfaced read-only, then validated/mutated in-studio
Two data widgets carry an authoring action: the specialist **confirms** upstream data live.
- **Participant AEL** — shown read-only, then editable + **"Mark as Validated"** writes back (`updateCurrentAEL` :2223).
- **Triple ATC** — shown "yet to validate", then validated via the triple-ATC sub-flow (`viewTripleATC` :2131).
So the clean rule is *data=read / action=write*, **with AEL and Triple-ATC as read-then-confirm hybrids.**

## 3. Session lifecycle (selection → close)
1. **Arena context** — scoped to the specialist's ongoing queue(s); multi-queue card switcher with per-queue studio counts (`loadQueueStudioCounts` :293).
2. **My Studios** — buttons per `queue studio pairing` the specialist is in, showing co-specialists + activity roles, `(You)`, and a `live_tv` marker when live (`getStudio` :451).
3. **Check-in** — availability toggle; the waiting list only shows once checked in (`checkinStudio` :825).
4. **Waiting list** — stage-grouped `ready` tokens; "Preassigned to you" marker; **"Bring To Studio"** → `studioinvitation` (`sendStudioInvitation` :878).
5. **Invitation → acceptance** — participant approves (`studioinvitation.clientresponse`); **`live assignment` created** copying `pairing` + `participantsactivity`, token set `instudio`, `queue stage log` written `movedby:'studio'` (`assignStudio` :1050, write :1136). **← the #3/#4 seam.**
6. **Video room opens** (§5). Multi-specialist via **"Invite More"** (`inviteMore` :1569); cross-studio join via **"Other studios you're invited to"** (`visitOtherStudio` :417).
7. **Delivery** — the §2 widgets.
8. **Close / advance** — "Completed [STAGE]?" → `moveStage` advances the token and **closes the studio** (`closeStudio` :1411); can pull a review specialist via `inviteMore(true)` :1354. Ops can force-close from `arenastudioactivity` :134.

## 4. Pairing & staffing (data-confirmed)
- **Solo delivery dominates.** Of 12,790 sessions: **84% one specialist**, 15% two, ~1% three+. Of 2,335 studios: 75% one participant, 23% two.
- **Staffing is live & manual.** `arena participant`: **1,238/1,239 `pairingmode:manual`** (1 unset), **100% carry a `stagerole`** (e.g. "In Diagnostics,In Implementation,In Review"). Confirms `03` §5 — specialists are assigned live, not in queue config.
- **`participantsactivity`** = `{specialistProfileId → activityName}`, authored on the `queue studio pairing` by `big-planner` and copied onto the `live assignment` at session creation (:1131). `bonusactivity` = extra activities for invited/secondary specialists.

## 5. The video stack — three-way in code, **~99% Zoom in production**
The room mode is chosen per queue/studio config (template :232–252):
- **Zoom auto-link** (default) — CF `studioZoomLink` (`queuesystem.js:730`, a **Cloud Function, NOT a collection**) fires on `live assignment` create, stores the meeting in `live assignment.zoomdata`; **"Start Meeting"** = `navigateMeeting` :2274, **"Generate New Link?"** = `regenerateZoomLink` :1622.
- **Zoom embedded SDK** — `enablezoommeetingsdk`; call runs inside `zoom-clientview` (`ZoomMtg`).
- **OpenVidu/LiveKit** — `selectedStudio.openvidu`; `joinOpenViduRoom` :2572, token from CF `createOpenViduToken` (`openVidu.js:70`), room = the `liveassignmentid`.

**Production reality (evidence):** `openvidu=true` on **1 of 2,335 studios**; `enablezoommeetingsdk` on **2 of 96 queues**; **83% of sessions have `zoomdata`**; **32 of 96 queues set `zoomlinkrequired:false`** (in-person / externally-managed call). → **Zoom auto-link is the real stack; the SDK and LiveKit paths are essentially experimental/unused.** Open question §10 on whether LiveKit is a planned migration.

## 6. Data model (studio-runtime collections)
| Collection | Docs (2026-06-05) | Role |
|---|---|---|
| `live assignment` | 12,790 | **the session** = the room: `pairing[]`, `participantsactivity{}`, `bonusactivity{}`, `zoomdata`, `studioid`, `queueid`, `stagename`, `status` (live→completed), `changeworkbrief`, `signature` |
| `queue studio pairing` | 2,335 | the studio config: `participants[]`, `participantsactivity{}`, `openvidu`, `status` (null↔live), check-in state |
| `studioinvitation` | 7,464 | the bring-to-studio handshake: `specialistpairing`, `profileid`, `studioid`, `clientresponse` (approved/denied/null), `expirydate` |
| `arena participant` | 1,239 | provider roster: `stagerole`, `pairingmode`, `liveassignmentstatus`, `tentativenextready` |
| `queue_token` | 7,266 | participant runtime state; gets `liveassignmentid` + `status:'instudio'` on entry |
| `queue stage log` | 69,040 | per-move audit: `movedby`, `studioid`, `liveassignmentid`, `variationid` |
| `studio conversation` | — | in-studio chat threads (`getstudiochat` :2303) |

There is **no separate studio/room collection** — the `live assignment` doc *is* the room (`studio`, `live studio`, `studio session`, `studioZoomLink`, `arena event` all return 0 docs).

## 7. In-studio messaging
Per-participant chat threads with unread counts, send-on-enter, support-recipient tracking — `getstudiochat` :2303, `sendMessage` :2400, backed by `studio conversation`.

## 8. The #3 / #4 boundary — CONFIRMED
`validated/03` §7 proposed the seam at **`live assignment` creation**; the code confirms it exactly — `dynamic-studio.component.ts:1136` is where the session doc is written, downstream of the invitation handshake. #3 = routing/personalizing *to* a studio assignment; #4 = the live session.

## 9. Evidence log
| Claim | Evidence | Source |
|---|---|---|
| data vs action widgets; upstream provenance | per-widget collection reads | `dynamic-studio.component.ts` :632/:1670/:1812/:1840/:2112/:2141 |
| Love Letter = engagement system, not studio | CF `slackLoveLetter` on `/love letter/{docid}` → Slack | `interimreport.js:60`; probe `loveletter_probe.js` |
| solo delivery 84%; multi ~16% | `live assignment.pairing` size dist | `studio_runtime_probe.js` |
| video ~99% Zoom; LiveKit 1 studio | `openvidu` flag (1/2335); `zoomdata` 83%; SDK 2/96 | `studio_runtime_probe.js` |
| invitations 57% approved / 9% denied / 34% no-response | `studioinvitation.clientresponse` (7,464) | `studio_runtime_probe.js` |
| 100% manual pairing, 100% stagerole | `arena participant` (1,239) | `studio_runtime_probe.js` |
| boundary = `live assignment` create | setDoc | `dynamic-studio.component.ts:1136` |
| studioZoomLink is a CF, not a collection | 0 docs | `studio_discover.js` |

## 10. Open questions (carry to operator walkthrough)
1. **LiveKit/OpenVidu** — dead experiment or planned Zoom migration? Only 1 studio uses it.
2. **32 queues with `zoomlinkrequired:false`** — in-person delivery? externally-managed calls? confirm the meaning.
3. **34% of invitations never get an explicit `clientresponse`** — auto-expire? specialist proceeds anyway? what happens to those tokens?
4. **Hybrid widgets** — confirm the operator agrees AEL + Triple-ATC are "read-then-confirm" (data widgets with a write), vs pure-action.
5. **`bonusactivity` / multi-specialist sessions (~16%)** — what delivery patterns need >1 specialist (review? mentoring? shadowing — cf. `queue_token.cwshadowing`/`diagnosticshadowing`)?
6. **ATC authoring internals** — the add/assign/mark actions write ATC collections (off-limits to read); validate the *workflow* with the operator without touching ATC data.
