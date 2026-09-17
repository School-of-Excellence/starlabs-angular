# Event Opportunity Dashboard — "Studio Watch" right-side panel (2026-07-03)

**Branch:** `dynamic-studio-update`
**Design reference:** operator mockup — a floating "Studio Watch" card (red accent `#c0453b`) on the top-right of the Board tab, collapsible to a `[count] Studio Watch` pill.
**Goal:** surface studios that have been occupied too long and are holding up the queue, aggregated across the selected Board queues. **UI + derived-getter only — no Firestore writes, no schema/data-flow changes.** Reuses data the Board already loads (`mapData[queueid].liveAssignmentList`).

## What it flags (operator-confirmed rules)
Only `status === 'live'` assignments count (a completed assignment already freed its studio). For each live assignment in a selected queue:
- **JOINED** (no `specialistJoinedAt` yet) → measure elapsed from `created` (studio entry). Flag if > 4h.
- **ACTIVE** (`specialistJoinedAt` present) → measure elapsed from `specialistJoinedAt` (call start). Flag if > 4h — **even if the call itself has ended** (the assignment is still `live`, so the studio is not freed).

These mirror the Arena board's JOINED / ACTIVE columns (`joinedAssignments` / `activeAssignments` in `arena-board.component.ts`). Operator decisions this session:
- **Grouping:** use joined+active *to decide what shows* — one combined "Over 4h — action needed" list, not two visible sections. Cards are labelled by the queue **stage name** (Consultation, Changework, …).
- **End-of-day section:** *skipped for now* (mockup showed it; deferred until an EOD trigger time is defined).

Respects the Board's `selectedStages` config filter and the active event `filteredProfileIds` filter so the watch agrees with what's on screen.

## Why "derived getter on the dashboard", not a new subscription
The dashboard already receives every queue's full `liveAssignmentList` via `app-event-opportunity`'s `eventData` emit (raw `live assignment` docs, incl. `specialistJoinedAt`, `created`, `pairing`, `participantid`, `studioid`, `status`). So Studio Watch is a pure computed view over `mapData` — no extra Firestore reads. A 30s `setInterval` (`studioWatchTick`) just nudges change-detection so the `Xh Ym` labels advance.

Studio label: there is **no numeric studio number** in this data model. `getStudioWatchStudioLabel()` uses the studio doc's `studioname`/`name` when meaningful, else the studio's specialist names (`studioMap[studioid].participants` → `mapProfile`), else falls back to the queue name.

---

## Per-screen revert guide

### Screen — Board tab · Studio Watch panel · DONE 2026-07-03
Three files touched, all under `src/app/queue system/event-opportunity-dashboard/`. Nothing else changed; a straight per-file `git checkout` restores prior state.

**TS** (`event-opportunity-dashboard.component.ts`):
| Change | Where | Revert |
|---|---|---|
| State + threshold | fields after `mapEvent = {}` (`STUDIO_WATCH_THRESHOLD_MS`, `studioWatchOpen`, `studioWatchTick`, `studioWatchTimer`) | delete the `// ===== Studio Watch =====` field block |
| Timer start | end of `constructor` (`this.studioWatchTimer = setInterval(... 30000)`) | delete that line |
| Timer cleanup | `ngOnDestroy` (`if (this.studioWatchTimer) clearInterval(...)`) | delete that line |
| Getters/helpers | inserted just before `formatActivityDate(...)`: `tsToMillis`, `studioWatchItems`, `studioWatchCount`, `getStudioWatchStudioLabel`, `formatWatchElapsed` | delete that `// ===== Studio Watch =====` method block |

**HTML** (`event-opportunity-dashboard.component.html`): the `<!-- ===== Studio Watch ... -->` block inserted between the Board `[hidden]` div close (`</div></div>`) and `<app-planning-tab>`. Revert = delete that block. Includes a per-card `.sw-card__type` badge printing **Joined** / **Active** (which Arena stage the studio is in) from `item.type`.

**CSS** (`event-opportunity-dashboard.component.css`): the `/* ===== Studio Watch ... */` block appended at end of file (`.studio-watch`, `.sw-pill*`, `.sw-panel*`, `.sw-section*`, `.sw-card*`, incl. `.sw-card__type` / `--active` / `--joined` badge styles). Revert = delete that block.

**Full revert of this screen:**
`git checkout <pre-branch> -- "src/app/queue system/event-opportunity-dashboard/event-opportunity-dashboard.component.ts" "src/app/queue system/event-opportunity-dashboard/event-opportunity-dashboard.component.html" "src/app/queue system/event-opportunity-dashboard/event-opportunity-dashboard.component.css"`

Build: `ng build --configuration development` → success (only pre-existing unrelated warnings).

## Pending / follow-ups
- **End-of-day section** (purple banner in mockup) — deferred; needs an EOD trigger rule (queue end time vs fixed evening cutoff).
- No numeric studio number exists — if the operator wants literal "Studio N" labels, a studio-index field would need to be added upstream.
- Not verified in a live browser (app is Firebase-auth gated and the panel needs a selected queue with a real >4h live assignment); verified via clean production build only.
