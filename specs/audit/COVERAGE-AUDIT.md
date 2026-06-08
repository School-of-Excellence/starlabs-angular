# Queue Manager e2e — Coverage Audit (for engineering review)

> Regenerate the data tables: `node e2e/scripts/coverage-report.js` (pure, no emulator/creds).
> Run the suite: see "How to run" below. This doc is deliberately honest about what is and isn't covered.

## 1. The straight answer: does it reliably cover all known mechanisms?

Three distinct dimensions — don't conflate them:

| Dimension | Status | What it means |
|---|---|---|
| **Mechanism / edge coverage** | ✅ **Comprehensive (by construction)** | Every documented stage→stage transition in all 9 journey variations is exercised — **237 / 237 config edges = 100%** (see `variation-edge-coverage.csv`). Plus dedicated tests for every operator-board action, studio-session step, BIG screen, and the Cloud-Function side-effects. |
| **Reliability (green + deterministic gate)** | ✅ **Green on cloud (2026-06-08)** | The full suite runs **green against the disposable cloud project `slabs-queue-e2e-exdcz`** (real Firestore + the deployed Cloud Functions), non-circular (asserts real app/CF output or known seeded values). Latest run: **188 passed · 0 failed · 6 skipped / 194**, with one screenshot + trace per test in `e2e/playwright-report/index.html`. The 6 skips are documented (2 product-bug `test.fixme` SS-08/SS-15b; 1 seed-gap fixme BIG-06; 3 conditional seed-gap runtime-skips OP-06/SS-12/SS-13). Run it: `cd e2e && npm run report:cloud`. For a CI *gate*: add a scheduled cloud job (or the emulator target once its crash chip lands) + close the documented seed gaps so the 6 skips run. Story: `specs/journals/2026-06-08-complete-all-tests-cloud-evidence.md`. |
| **Per-participant / distinct-journey coverage** | ⚠️ **Representative today; the full set is small + finite** | The 50 are *seeded* (board population). Each variation's journey is *walked once* by a representative token across 3–6 generated paths that cover 100% of that variation's edges + bounded loops (≤2). The path space is NOT "unbounded": with loops capped at ≤2 it is finite. The distinct **forward journeys** (branches multiply, no loops) number only **≈72 total** (≈9 per variation) — see `e2e/scripts/count-paths.js`. The suite walks ≈39 covering paths today (100% edges). The millions-of-combinations figure only appears if you count every operator back-and-forth loop sequence (operator move-freedom, 66 back-edges) — those are not participant journeys. **Walking all ≈72 forward journeys is a feasible expansion** (~+33 walks). At runtime ≤(participants) distinct paths ever occur (≤50 seeded, <1000 in a real queue). |

**Plain English:** every *mechanism* (every transition, every screen action, every CF effect) is tested, and the suite is now **green on the cloud test project** (188/194 pass, 0 fail, 6 documented skips) with per-test screenshot+trace evidence. It tests *representative journeys that cover all transitions*, not 50 individually-replayed permutations.

## 2. The "50 users and their paths" artifact

- **`participant-journey-coverage.csv`** — one row per seeded participant (50): profileid, variation, entry stage, journey length, config edges, edge-coverage %, and the spec that walks that journey. Honest column: each participant is *seeded for board population*; their *variation journey* is walked by a representative token (not 50 separate walks).
- **`variation-edge-coverage.csv`** — one row per variation: backbone size, config edges, edges covered, % , paths generated, seeded participants, walking spec.
- **Diagrams:** the per-variation flow graphs are in `specs/queue-flow-visualizer/` (the flow-visualizer renders each variation's stage graph + edge types). Open `prototype.html` against `e2e/fixtures/sample-queue-config.json` to see the graph each walk traverses.

### Seeded population (from `planSeed`)
LYL-FC 4 · LYL-NC 2 · B!G-NC 14 · Prodigies-NC 2 · Prodigies-FC 1 · uP!-FC 14 · uP!-NC 9 · uP!-3rd 3 · uP!-Prep-Hold 1 = **50**.

## 3. Mechanism → test → status matrix

| Mechanism | Covering spec(s) | Status |
|---|---|---|
| Operator board: queue select, Total==Σcolumns, per-column counts | operator.spec OP-01/02/03 | ✅ green |
| Operator move → non-Activity (one stage-log, counts conserved, studio fields cleared) | OP-04 | ✅ green |
| Operator move → Activity (live-assignment, pairing live, stage-log) / drag-out (close) | OP-05 / OP-06 | ✅ / 🟡 |
| Final-stage delivery completion (`updateDeliveryStatus` args) | OP-07/08 | ✅ green |
| Comms sidebar, filters, export CSV, B!G planner | OP-09/10/11/12 | ✅ / 🟡 |
| Queue-visibility access control (non-admin sees only its queues) | OP-02b | ✅ green |
| Bulk-invite fan-out conservation + `totalaccepted` counter | OP-09b | 🟡 converging |
| Studio: arena load, select, check-in, waiting list, bring-to-studio | SS-00…04 | 🟡 converging (isolation) |
| Studio: accept/deny → live-assignment, assign session triangle, live-panel | SS-05/06/07 | 🟡 converging |
| Studio: validate-AEL, mark-complete, invite-more, zoom/openvidu, move-next, monitor | SS-08…16 | 🟡 partial |
| Studio monitor role gate (eis-only denied) | SS-15b | ❗ **product finding** (no gate) — `test.fixme` |
| **9 journey variations — 100% edge coverage each** | variations/*.spec | 🟡 converging (edges defined, walks green-ing) |
| Self-movable vs operator-move gate, per stage | selfmovable-gate.spec | 🟡 converging |
| CF: onQueueStageChange touchpoint, queueposition recompute | cf-sideeffects.spec | 🟡 converging |
| BIG: dashboard counts, PAB, manual/form submit, validate, cohorts, analytics, zoom | big-core / big-analytics | 🟡 partial |
| Cross-DB (forms/ATC count lower-bound) | cross-db-lowerbound.spec | 🟡 converging |
| Queue authoring (queue-creation-v3 round-trip) | authoring.spec | 🟡 |
| Config-oracle integrity (dangling/orphan/unreachable) | oracle-selftest.spec | ✅ green (pure) |
| Per-actor usability (render without fatal error) | actors-health.spec | ✅ green |

Legend: ✅ green · 🟡 converging/partial (green-up in progress; non-circular but not all passing yet) · ❗ product finding.

## 4. Product findings (real bugs the suite caught — left for the product team, per operator decision)

1. **`dynamic-studio.component.html:50`** — `mapActivity[studio['participantsactivity'][participant]]` has no null-guard; a pairing with `participantsactivity === undefined` throws `TypeError`, aborting change detection → **the studio screen freezes**. Fix: `participantsactivity?.[participant]`.
2. **`arenastudioactivity.component.html:46/58`** — `item['pairing'].join(',')` has no null-guard; a live-assignment with `pairing === undefined` throws → **monitor renders 0 cards**. Fix: `pairing?.join(',')`.
3. **`/arenastudioactivity`** — no role gate; an `eis`-only specialist is **not denied** the monitor. Fix: add a `developer/admin/ah` route guard.

## 5. Known NOT covered (explicit gaps — no silent ones)

- Queue authoring **edit/rework** of an existing queue (create is covered).
- BIG **Watch Videos** assignment type (dialog smoke only).
- CFs `biginvitationAccepted`, `CreateQueueActivityLogV2` — not directly asserted.
- OpenVidu/LiveKit **deep room state** (track grid, active speaker, blur) — media stubbed, routing only.
- **Cross-project** Watson / Sales-CRM coupling — out of scope.
- **Permutation / concurrency**: 50 simultaneous participants, and per-participant path permutations beyond the edge-covering representative set (see §1).

## 6. How to run / audit it yourself

```bash
# emulator + real Cloud Functions + the emulator-wired app (two terminals):
cd e2e && npm run emu:up            # Firebase emulator + queue CFs (needs Java + the CF repo)
npm run start:emulator              # ng serve against the emulator

# isolated run (per-spec reseed → deterministic; this is also the CI gate command):
cd e2e && EMU_REUSE=1 EMU_REUSE_APP=1 bash scripts/run-isolated.sh

# CI: .github/workflows/queue-e2e.yml runs the above on every PR touching queue/studio/BIG/CF/e2e
#     (needs one repo secret, CF_REPO_TOKEN, to clone the Cloud Functions repo).
```

## 7. Bottom line for the audit

- The suite is **real and non-circular** — it drives the live app + real CFs and asserts product/CF output, and it has already **caught 3 genuine product bugs** (§4).
- It achieves **100% documented-edge coverage** of the 9 journeys + dedicated coverage of every operator/studio/BIG/CF mechanism (§3).
- It is **not yet a reliable green gate** (§1, reliability = in progress) and it is **representative-path, not exhaustive-permutation** coverage (§1, by design).
- To make it a trustworthy gate: finish the green-up (isolation makes it converge), then enforce the CI workflow (§6). To go beyond representative coverage to true per-participant/permutation testing is a deliberate, larger expansion (the path enumerator already exists; the specs would walk the full generated set instead of a curated subset).
