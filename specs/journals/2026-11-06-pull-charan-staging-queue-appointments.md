# 2026-11-06 — Pull charan-staging (Dharshan queue appointment slots) onto charan-release

**Operator ask:** "sorry discard all and pull from the charan-staging" → "pull all". The earlier
dharshan-development pull (DQM unattended groups, bulk-add-products close value, group chat) was fully
discarded first — none of it lands.

## What was taken
charan-staging's two own commits (`f477945d`, `64b09ab0`, 2026-11-03 — Dharshan's dharshan-working
appointment-slot work; context + known gaps in `specs/journals/2026-11-02-dharshan-working-queue-appointments.md`,
which comes over with this pull). charan-release had not touched any of the 18 files since the merge-base
(18d45a5e), so every file was taken whole (`git checkout origin/charan-staging -- <file>`) and verified
byte-identical. `npx tsc -p tsconfig.app.json --noEmit` → exit 0.

| Area | Files |
|---|---|
| queue-planning | css, html, ts (+1132/−442) |
| queue-planning-review | html, ts |
| queue-creation-v3 | html, ts |
| dynamic-studio-v2 | css, html, ts |
| participants-analytics | css, html, ts (participant flag dialog) |
| small | dynamic-queue-manager-clone.ts, queue-web-version1.ts, events-stage-data.ts, planning.engine.ts |

## Then: dharshan-working's 3 newer commits (operator: "check dharshan-working" → "pull all")
`854ad880` (bookedslot rename) was already in charan-staging. New since the 11-03 pull, all taken whole from
`origin/dharshan-working` (the 10 files differed from the staged tree only by these commits) and verified identical:

| Commit | Author | Change |
|---|---|---|
| `b2c46f03` | Dharshan | queue-planning slot delete: blocked while booked (`appointmentref` / `bookedby` / `usedslot` / participants) |
| `c5f0dadb` | Vignesh | 24 `qp-*` hooks on queue-planning.html + unit specs (queue-planning, queue-planning-review, planning.engine, slider-value, time-value, ATC/shared/atc-product) + draft plan `specs/plans/2026-11-05-storage-signed-urls-rollout.md` |
| `4233a195` | Vignesh | `qpr-revert-appointment` hook on queue-planning-review.html |

`ATC/shared/atc-product.unit.spec.ts` checked before taking it: pure-function tests of `productKey` /
`isEISolutionProduct` / `isWiSHProduct` — no Firestore, no ATC collection — so it is within the ATC constraint.

## Gate
Readiness against hub **main** (temp detached worktree — the local hub checkout is on another branch, which is
why an earlier run wrongly flagged the `pa-flag-*` hooks as untested): **MATCHED**, 2242 selectors present,
suites to run: queue · modes. Hub main already carries `queue/appointment-slots.spec.ts`,
`queue/slot-deletion.spec.ts`, `profiles/analytics-controls.spec.ts` waiting for these hooks.

## Fixes made on top of the pull (ours) — `queue-planning.component.ts`
| Fix | Why |
|---|---|
| Planner reads a token's booking from `bookedslot` (fallback `selectedstageslot`) via `tokenStageSlots()` — 4 reads | 854ad880 renamed the field everywhere except queue-planning, so `getParticipantsForSlot` never matched a booking → booked queue slots looked empty → `removeDateFromStage`'s booked-check passed → a booked slot could be deleted, orphaning the token's booking (hub QSD-02/03). Fallback keeps old tokens working. |
| Slot dialog `afterClosed` reset runs only while that dialog is still current (`activeDateDialogRef`) — 3 opens | `saveAppointmentSlots` → `dialog.closeAll()`; the old dialog's afterClosed fires after the close animation and nulled `editingStageName` of a dialog opened in the meantime → `fetchAppointmentAvailability(null)` threw on `stageProperty[null].actionresource` and the spinner stuck (hub QPA-07). |
| `fetchAppointmentAvailability` returns early (spinner off) when the stage has no `actionresource` | defensive; same symptom must never recur |

## Tests (local emulator lane, Firestore on 8085 — the iOS Simulator `Runner` holds 8080)
- modes: 80 passed. queue full run: 12 real failures (the first run's 58 included 48 login failures after
  `Runner` took :8080 at case 235). Baseline (charan-release without the pull) on the same 83 cases:
  **9 fail identically** → pre-existing, not from this pull (SS-00, SS-11b, SS-07, BIGNC-04, LYL-NC-WF-01,
  UP3-WF-01, LYL-FC-WF-03, UPFC-LOOP, uP!-NC walk). The other 3 (QPA-07, QSD-02, QSD-03) were the pulled
  feature's own gaps → fixed above.
- After the fixes, all 6 planner specs (appointment-slots, slot-deletion, planner-screens, queue-controls-planning,
  queue-controls-planning-review, queue-dialog-addressable-planning): **19 passed, 0 failed**, 8 skipped (fixme).

## Open
- Firestore composite indexes not in `firestore.indexes.json`: `queue availability` (slottype == + startdate
  range) and `appointmenttype` (or(queueappointment, groupappointment) + orderBy). Queries fail until deployed.
- **Cross-repo:** the app now reads `bookedslot`; cloud functions on `development` wrote `selectedstageslot`.
  Dharshan's CF functions (onQueueStageChange, startParticipantNextDeliverySequence, appointmentbooked,
  appointmentcancelled) were copied into the local CF checkout (uncommitted); `queueParticipantTransfer` still
  writes the old field. Deploy the CF side with this app change.
- The 9 pre-existing queue failures — separate investigation.

## Revert guide
Per-screen: `git checkout c3958b84 -- <file>` (c3958b84 = charan-release before this pull).
