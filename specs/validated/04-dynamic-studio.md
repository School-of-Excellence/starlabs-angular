# 04 · Dynamic Studio — OPERATOR-VALIDATED

> **Status: VALIDATED with operator, 2026-06-10** (concept group #4). Code + read-only production data investigated 2026-06-05 against `production` (Angular) + the CF repo on `development`; reconciled against the e2e suite 2026-06-10; **operator-confirmed 2026-06-10.** The core model is canonical: the **data-widget vs action-widget** split, the **upstream provenance** of the read-only widgets, the **AEL/Triple-ATC hybrids**, and the **`live assignment`-creation boundary** with #3. The §10 items remain **acknowledged-open follow-ups** (not blockers): the 🔴 monitor authorization gap (§3a) was **fixed 2026-06-10** (`roleGuard(['developer','admin','ah'])` + component gate re-enabled; SS-15b flipped green — journal `2026-06-10-arenastudioactivity-role-gate-fix.md`); the video-stack/invitation questions are operational confirmations. Supersedes `specs/LIVE-STUDIOS.md` for studio-runtime mechanics.
> Evidence (in-repo): probes + outputs in `specs/journals/2026-06-05-dynamic-studio-artifacts/`. Supersedes `specs/LIVE-STUDIOS.md` for studio-runtime mechanics once validated.
> **Reconciled against the e2e suite (`e2e/queue/` SS-00…SS-16, `cicd`) on 2026-06-10** — see §3a (security finding), §11 (coverage + gaps), and the gap journal `2026-06-10-dynamic-studio-doc-vs-e2e-gaps.md`. The doc↔test reconciliation corrected 5 items (1 security, 4 enrichments) and logged 9 testable coverage gaps.
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
3. **Check-in** — availability toggle; the waiting list only shows once checked in. **Each flip writes exactly one `studio checkin log` row** (`checkinStudio` :825, ts:854-864) — a per-toggle audit trail (e2e SS-02).
4. **Waiting list** — stage-grouped `ready` tokens; "Preassigned to you" marker; **"Bring To Studio"** → `studioinvitation` (`sendStudioInvitation` :878).
5. **Invitation → acceptance** — the invite is created with **`clientresponse:null` and `expirydate ≈ now + 120s`** (a hard **2-minute window**, ts:987 — e2e SS-04); participant approves → **`live assignment` created** copying `pairing` + `participantsactivity`, token set `instudio`, `queue stage log` written `movedby:'studio'` (`assignStudio` :1050, write :1136). **← the #3/#4 seam.** *(The 120s expiry explains the data: most invites that get no explicit response simply time out — see §10-Q3.)*
6. **Video room opens** (§5). Multi-specialist via **"Invite More"** — an *"Update Additional Specialist"* dialog that writes **`bonusactivity` on the live assignment** (`inviteMore` :1569; cancel writes nothing, ts:1592 — e2e SS-10). Cross-studio join via **"Other studios you're invited to"**: that block is keyed off **`bonusactivityparticipant`** (the `outsideLiveAssignment` query, :412), *not* `pairing` — so a specialist sees only studios they were explicitly added to (no visibility leak — e2e SS-14).
7. **Delivery** — the §2 widgets.
8. **Close / advance** — "Completed [STAGE]?" → `moveStage` advances the token and **closes the studio** (`closeStudio` :1411): live assignment → `completed`, pairing released, ONE studio stage-log row, token detached (e2e SS-12, OP-06); can pull a review specialist via `inviteMore(true)` :1354. **Downstream CF triggers fire on the move:** `onQueueStageChange` (touchpoint write) and, at Activity stages, `queueParticipantPositionUpdate` (recomputes ready tokens 1..M) — both deployed-CF-only (e2e CF-01/CF-02). Ops can force-close from `arenastudioactivity` :134 — **but see the §3a authorization gap.**

### 3a. ✅ Authorization on the monitor — `arenastudioactivity` role gate (was a gap, now CLOSED)
**History (e2e SS-15b / PLAN P0 #4 finding):** the live-studio monitor was once **reachable by any authenticated user** — the route was `canActivate:[authGuard]` **only**, and the component's intended role gate was **commented out** (the old `if(developer)`/`admin||ah||integrator` guard around the data subscriptions). A plain specialist who opened `/arenastudioactivity` saw **every live studio across queues — participant identities + Zoom host emails included**. Only the **force-close button** was `*ngIf="developer"` (html :23, :112); the *data exposure* was not gated.

**FIX LANDED (2026-06-10):** the route now carries **`roleGuard(['developer','admin','ah'])`** alongside `authGuard` (`app.routes.ts:115`; new hardcoded guard `src/app/role.guard.ts`), and the component **re-gates its data subscriptions** behind `developer||admin||ah||integrator` (`arenastudioactivity.component.ts:58-79`) — defense in depth, so the `queue generation`/`zoomaccount`/`live assignment` reads never run for a non-privileged user even if they reach the component. A non-privileged (e.g. `changeagent`-only) user is bounced to `/EISDashboard`. The force-close button stays `*ngIf="developer"`. E2E SS-15b now runs as a real **negative** test (eis-only `changeagent` actor DENIED) + a **positive** test (admin admitted, cards render). See journal `2026-06-10-arenastudioactivity-role-gate-fix.md`.

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
| `studioinvitation` | 7,464 | the bring-to-studio handshake: `specialistpairing`, `profileid`, `studioid`, `clientresponse` (approved/denied/null), **`expirydate` = create + ~120s (hard 2-min window)** |
| `arena participant` | 1,239 | provider roster: `stagerole`, `pairingmode`, `liveassignmentstatus`, `tentativenextready` |
| `studio checkin log` | — | one audit row per check-in/out toggle flip (ts:854-864; e2e SS-02) |
| `queue_token` | 7,266 | participant runtime state; gets `liveassignmentid` + `status:'instudio'` on entry |
| `queue stage log` | 69,040 | per-move audit: `movedby`, `studioid`, `liveassignmentid`, `variationid` |
| `studio conversation` | — | in-studio chat threads (`getstudiochat` :2303) — **⚠ zero e2e coverage, see §11** |

There is **no separate studio/room collection** — the `live assignment` doc *is* the room (`studio`, `live studio`, `studio session`, `studioZoomLink`, `arena event` all return 0 docs).

## 7. In-studio messaging
Per-participant chat threads with unread counts, send-on-enter, support-recipient tracking — `getstudiochat` :2303, `sendMessage` :2400, backed by `studio conversation`. **⚠ Zero e2e coverage today (gap G1, §11)** — the entire chat feature is untested.

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
3. **34% of invitations never get an explicit `clientresponse`** — **likely the 120s auto-expiry** (§3.5/§6): the invite lapses before the participant acts. Confirm the operator's mental model: does the specialist just re-send, and is the token left untouched?
4. **Hybrid widgets** — confirm the operator agrees AEL + Triple-ATC are "read-then-confirm" (data widgets with a write), vs pure-action.
5. **`bonusactivity` / multi-specialist sessions (~16%)** — what delivery patterns need >1 specialist (review? mentoring? shadowing — cf. `queue_token.cwshadowing`/`diagnosticshadowing`)?
6. **ATC authoring internals** — the add/assign/mark actions write ATC collections (off-limits to read); validate the *workflow* with the operator without touching ATC data.
7. **✅ SECURITY (from e2e SS-15b) — RESOLVED 2026-06-10:** `/arenastudioactivity` no longer exposes live studios to any authed user — a `roleGuard(['developer','admin','ah'])` was added to the route and the component's data-subscription gate re-enabled (§3a). Operator follow-up: confirm `developer/admin/ah` (plus `integrator` at the component layer) is the right privileged set, and whether `eventcoordinator`/`changeagent` should ever monitor.

## 11. E2E coverage & known gaps (vs `e2e/queue/` SS-00…SS-16, `cicd`, 2026-06-10)
The studio suite covers the **spine** end-to-end: arena load (SS-00/16), studio render + select (SS-01), check-in + log (SS-02), waiting list (SS-03), invite (SS-04), accept/deny (SS-05), LA creation triangle (SS-06), Forms widget (SS-07), AEL validate-hybrid (SS-08), mark-procedures render (SS-09), invite-more cancel (SS-10), Zoom guard (SS-11a) + OpenVidu `/joinroom` (SS-11b), move-next + cancel (SS-12/13), other-studio visibility (SS-14), monitor render + the no-role-gate finding (SS-15/15b); plus board moves (OP-04/05/06) and stage-move CF triggers (CF-01/02).

**Known coverage boundary — ATC OFF-LIMITS.** ATC lives in a *separate named Firestore DB* (`firestore-atc`, read via `getFirestore("firestore-atc")`, dynamic-studio :1672) that is **not provisioned in the test project**; the seed harness has an active ATC deny-list (`seed-test-project.js:44`) and `atcmodel:null` is the designed off-ramp that makes the studio short-circuit ATC reads (`:727`). So each ATC widget must be split into what's testable now vs what belongs to the **ATC concept group**:

| ATC widget | Contract-testable NOW (no ATC data) | ATC-group owned (needs real ATC) |
|---|---|---|
| Prescribed-ATC list (`prescribedvalidatedatc`/`unvalidatedatc`) | **gating** (renders iff `studiowidgets` has the key); **empty-state** ("No ATC Found", SS-07/09); **render-shape smoke** of the list markup with a *synthetic* array (TestBed, no DB — **done, see below**) | content **fidelity** vs the real `atcdata/transcription/bigactivity/adjustments/procedures` schema |
| Add-ATC (`addvalidatedatc`/`addunvalidatedatc`) | **gating**; dialog **opens**; side-effect **writes to the live assignment/token** (not the ATC payload) | the ATC doc the action authors |
| Assign-changeagent (`assignprocedure`) | **gating**; dialog opens | the procedure→changeagent mapping content |
| Mark-procedures (`assignedatc`) | **gating**; mount-no-fatal at 0 procedures (SS-09) | procedure-completion against real ATC |
| Triple-ATC (`viewtripleatc`) | **gating**; mount-no-fatal | the triple-ATC content + validate sub-flow |

→ The **contract** column is studio-runtime behaviour we own and should cover; the **ATC-group** column is deferred to that concept group's effort (engineers who own the schema), in a namespace they control. Faking ATC to fill the right column = false-green (see the gap journal's rationale).

**Render-shape smoke (delivered):** `src/app/queue system/dynamic-studio/dynamic-studio.atc-list.render.smoke.spec.ts` — a TestBed/Karma test that renders the **prescribed-ATC list markup** (a faithful mirror of `dynamic-studio.component.html:351-406`) against a *synthetic* ATC array. Proves the render path (ngFor over ATC → adjustments → procedures, the date pipe, the `mapProcedure` lookups, the empty-state) does not break — with **no Firestore, no ATC collections, no `src/app/ATC/**` import**. It is a render-*contract* smoke, explicitly NOT a data-fetch or content-fidelity test.

**Testable gaps still open (tracked for closure — see journal `2026-06-10-dynamic-studio-doc-vs-e2e-gaps.md`):**
| # | Untested feature (`04` ref) | Why it's testable |
|---|---|---|
| G1 | **Studio chat / messaging** (§7) | `studio conversation` seedable; assert thread render + send + unread count. **Zero coverage today.** |
| G2 | **Love Letters** data-widget (§2a) | seed `love letter`, assert read-only render |
| G3 | **uP!-visit chip** (§2a) | seed journey/visit, assert first-time/returning label |
| G4 | **Triple-ATC widget render** (§2c) | mount/no-fatal is testable without reading ATC content |
| G5 | **Move-to-next-month-review** (§2b `movetonextqueue`) | action widget, no ATC dependency |
| G6 | **Regenerate Zoom link** (§5) | stub Zoom, assert new `zoomdata` |
| G7 | **Zoom embedded SDK path** (§5 `enablezoommeetingsdk`) | only auto-link + OpenVidu are covered |
| G8 | **Positive multi-specialist session** (§4) | SS-10 only tests invite-more *cancel*; assert a 2-specialist LA with `bonusactivity` written |
| G9 | **Monitor force-close action** (§3a) | `data-testid="arena-close-studio-btn"` exists; drive developer close → LA `completed`, pairing released |
