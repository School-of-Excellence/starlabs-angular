# 02 · Product Modes — OPERATOR-VALIDATED (end-to-end)

> ⚠️ **Branch note (2026-06-04):** the mode-engine citations (§7, `participantmode.js`/`participantmetadata.js`) live in the **CF repo on `development`** and the §7g audit is **data-driven** — both **branch-independent and current**. Only the few Angular-side refs need re-verification against `production` (stream B; `ORIENTATION.md` Open-threads #4).
> **Status: 2026-06-04 — mode engine FOUND & mapped (§7 RESOLVED).** Source located: `starlabs-cloud-function/functions/components/participantmode.js` (the StarLabs Cloud Functions repo, `development` branch). Everything is now validated from code + production data; the `participant metadata.participantmode` denorm path is also resolved (§7d — it's a CQRS projection rebuilt by `participantmetadata.js`). **Line-cited transition tables (§7e), code-anomaly flags (§7f), and a precision audit against production logs (§7g — Table B arc 102/102 correct vs knobs-in-effect, Table D rollup 11/12, flag F3 confirmed live) added 2026-06-04.** Supersedes the auto `specs/CONFIGURATION.md` mode sections for this topic.
> Evidence (in-repo, git-tracked): the read-only query scripts **and their captured live outputs** are in `specs/journals/2026-06-03-product-modes-investigation-artifacts/` — `*.js` (the queries) + **`DATA_OUTPUTS.txt`** (the actual explored data: modes catalog/intent, day-knobs, modeflow templates, delivery-by-mode counts, the `participant mode checklist` shape) — plus a 4-agent code audit. Journal: `specs/journals/2026-06-03-product-modes-investigation.md`.

## 1. There are TWO different "modes" — don't conflate them
- **(A) Delivery mode** — on the **product** (`products.mode`, 5 values), copied to `participantsproduct.deliverymode`. Routes *how a product is delivered*.
- **(B) Participant mode** — the participant's *current engagement state* (`participant metadata.participantmode`), one of **15** states in the `modes` catalog. *Where the participant is in their lifecycle.*

## 2. (A) Delivery mode → the delivery rail (validated; names are counter-intuitive)
| `products.mode` | #products | Mechanism (your terms) | Evidence | Rail |
|---|---|---|---|---|
| **Priority Mode** | 33 | **Appointment** (1:1, scheduled) | 1,505 appointments; `deliveryplanning=priority` | Appointment System |
| **Event Mode** | 20 | **Queue-during-event** (show up → queue for your slot) | **7,125 queue_tokens (98.6%)** | Queue + Dynamic Studio (in an arena event) |
| **Installation Event Mode** | 26 | **Full event** (attend start→end) | ~0 queue, ~0 appts | Live workshop / events |
| **Big Mode** | 24 | **Cohort / marathon** (BIG program) | `big cohorts`/`big assignment`/arena; 93 queue tokens | BIG subsystem |
| **Investment Mode** | 1 | trial ("Test-Glimpse") | 1 enrollment | — |
`deliveryplanning` corroborates: **priority 34 ≈ Priority Mode; normal 70 = the rest.** The free-text `deliverytype` ("Set 1", "Arena", "Queue Based", "Mum May '23"…) is operator version-labels, not a reliable classifier.

**Delivery distribution — the hard numbers (live):**
| mode | #products | deliveryplanning | queue_tokens | appointments (2k sample) | enrollments `deliverymode` (3k recent) |
|---|---|---|---|---|---|
| Priority Mode | 33 | priority | 5 | **1,505** | 241 |
| Event Mode | 20 | normal | **7,125** | 7 | 1,580 |
| Installation Event Mode | 26 | normal | 1 | 5 | 887 |
| Big Mode | 24 | normal | 93 | — | 265 |
| Investment Mode | 1 | normal | — | — | 1 |
| **totals** | **104** | priority 34 / normal 70 | **7,224** | (Priority dominates) | (Event dominates) |

## 3. (B) Participant mode — the 15-state engagement machine
The `modes` catalog (15 docs, each with `sequence` + participant-facing `info`).

**Live `participantmode` distribution (2,500-profile sample):**
| participantmode | count | participantmode | count |
|---|---|---|---|
| Exploration | **1,095** | Journey Priority Planning | 145 |
| (none) | 435 | Priority | 104 |
| Event | 266 | Extended Performance | 62 |
| Journey Planning | 187 | Integration | 24 |
| Performance | 161 | After Extended Performance | 20 |
| | | Big | 1 |

Exploration (≈44%) is the default/idle state; "Big" almost never appears as a *participant* mode (it's a delivery mode, not a lifecycle state).

**Intent — only where evidenced** (✓ = stated in `modes.info`; ◐ = inferred from its `product mode config` widgets; ✗ = no evidence):
| Mode (by `sequence`) | Intent | Source |
|---|---|---|
| Big (0) | ✓ "developing the superior capabilities of world leaders… starting with your own family" (practitioner/field track) | info |
| Installation Event (1) | ✓ "a vibe, an arena for heightened unconscious assimilation" | info |
| Event (2) | ✓ "shown event updates real-time, your **queue position, your stages**, action steps" | info |
| Integration (3) | ✓ "you've experienced installations, now integrate the changes into all aspects of life" | info |
| Priority (4) | ✓ "a priority product has been initiated… book your slots" | info |
| Preparation (5) | ✓ "confirmed participation in an upcoming event… immerse in resources" | info |
| Performance (6) | ✓ "time to perform and revert your directives… integrated life outcomes" | info |
| Journey Priority Planning (7) | ◐ Priority-template planning phase (widgets: generalcontent) | widgets only |
| Extended Performance (8) | ◐ continued performance window (widgets: content/solarvoice/form/eiflix) | widgets only |
| Early Preparation (9) | ◐ pre-event ramp (widgets: content/solarvoice/form) | widgets only |
| Journey Planning (10) | ✓ "a product in your journey is ready… get in touch with your journey coach" | info |
| Exploration (11) | ✓ "freedom to explore the range of services and choose" — default/idle (44%) | info |
| After Extended Performance (12) | ◐ wind-down (widgets: generalcontent) | widgets only |
| Snooze (13) | ✗ no info, no widgets — *not yet personalized in the mobile app* (per operator) | — |
| Investment (14) | ✗ no info, no widgets; trial tier | — |
> Operator note: **lack of widgets ≠ no purpose** — it means that mode hasn't had focused mobile-app personalization yet.

**Rollup rule (validated 5/6):** `participant metadata.participantmode` = the mode with the **lowest `modes.sequence`** among the participant's products (i.e. the most-significant active mode). So `sequence` is **headline-mode precedence**, not display order.

## 4. The mode RECORD — `participant mode checklist` (the mechanism)
**`participant mode checklist`** (27,496 docs) is the per-(participant × product × mode) log:
`{ mode, profileid, participantproductid, productref, aelid, createddate, widget[] }` — one doc each time a participant enters a mode (with entry date + the mode's widgets snapshot + `aelid` = Accelerated Evolution Level). **Current mode = the latest entry; `participant metadata.participantmode` = its rollup.** This is the "mode is connected to delivery" link (`aelid` ↔ AEL/delivery).

## 5. Per-mode UI/content — `product mode config` (74) + `product mode playlist` (15)
Each (product × mode) configures what the participant sees. **Widgets per mode (from `product mode config`):**
| Mode | Widgets shown |
|---|---|
| Performance | `cycleofevolution` · `form` · `solarvoice` · `eiflix` · `generalcontent` · `adsplaylist` |
| Installation Event | `cycleofevolution` · `form` · `dodont` · `solarvoice` · `eiflix` · `generalcontent` |
| Extended Performance | `generalcontent` · `solarvoice` · `form` · `adsplaylist` · `eiflix` |
| Journey Planning | `generalcontent` · `solarvoice` · `eiflix` · `evolutionwishlist` |
| Preparation | `generalcontent` · `solarvoice` · `eiflix` |
| Early Preparation | `generalcontent` · `solarvoice` · `form` |
| Integration | `solarvoice` · `generalcontent` |
| Event | `generalcontent` · `solarvoice` |
| Priority · Journey Priority Planning · After Extended Performance | `generalcontent` |
| **Big · Snooze · Investment** | — (no config → not yet personalized in the mobile app) |

`cycleofevolution` = the core work widget; `evolutionwishlist` = planning; `dodont` = event etiquette. Performance & Installation Event are the richest.

## 6. A→B coupling — `modeflow` (validated): two templates, not one
Each product carries `modeflow[]` (99/104) — the ordered participant-mode path. It collapses to **2 templates** (distinguished by *Journey **Priority** Planning* vs *Journey Planning*):
```
PRIORITY products → Integration → Priority → Preparation → Performance → ★Journey Priority Planning
                    → Extended Performance → Early Preparation → After Extended Performance
EVENT / INSTALLATION / BIG → <DeliveryMode> → Integration → Preparation → Performance
                    → Extended Performance → Early Preparation → ★Journey Planning → After Extended Performance
   (+ optional per-product suffix: … → Exploration → Snooze → Investment  = dormant/upsell tail)
```
`modeflow[0]==products.mode` only 64/99 (Priority leads with Integration). The {Installation Event, Big, Event} trio **share one engagement template**; Priority is the distinct one.

## 7. ✅ The mode engine — RESOLVED (StarLabs Cloud Functions)
Found at **`starlabs-cloud-function/functions/components/participantmode.js`** (the StarLabs Cloud Functions repo — a separate git repo nested in the angular folder; **`development` branch**, latest `d264bac`). It is exactly the mix the operator described — **event triggers + relative day/month offsets + a daily time-based cron.** Three functions; the product day-knobs ARE consumed here (which is why they looked "authored-but-unused" in the client). *(A `/Atestdate/date` doc acts as a test-clock override — useful for CI: `participantmode.js:12-17`.)*

### 7a · `calculateParticipantMode` — Firestore trigger `onDocumentWritten('/participantsproduct/{id}')` (`:7`)
Fires on every `participantsproduct` write (the delivery-event trigger). Branches:
- **Seed** (new product, `:29-42`): sets `deliverymode = product.mode`; initial `mode = "Journey Planning Mode"` (if `deliveryplanning=="normal"`) or `"Journey Priority Planning Mode"` (if `"priority"`). ← *the seeding I couldn't find on-disk before.*
- **Initiated/ongoing** (`:45-77`): Priority-mode → `mode="Priority Mode", nextmode="Integration Mode"`; writes a touchpoint.
- **Completed → the post-event arc, paced by day-knobs from `statusdate.completed`** (`:80-159`): by days-since-completion — `<integrationdays` → **Integration** · `<integ+perf` → **Performance** · `<integ+perf+extperf` → **Extended Performance** · else → **After Extended Performance**; each sets `nextmodedate = completionDate + cumulative days`, `nextmode` = the successor.
- **Cancelled / Shifted** (`:162-185`): `mode/nextmode/nextmodedate → null` + touchpoint.
- **Pre-event ramp from `participanttentativedate`** (`:292-330`): ≥30 days out → **Early Preparation** (`nextmodedate = tentative − 30`) · ≥15 → **Preparation** (`− 15`) · else → **Priority Mode**.
- **Mode-changed → the ROLLUP + checklist** (`:188-289`): sorts the participant's product modes by `modes.sequence` → writes `participant metadata.productmode = [sorted]` (`:201-205`); computes the headline by **`customerstatus`**: `active` → `sort[0]` (lowest sequence, else Journey Planning) · `non active` → **Exploration Mode** · null/discontinued → null → writes **`profile_data.participantmode`** (`:226-228`). **Creates the `participant mode checklist` doc** (+ an `evolution log` doc) snapshotting the `product mode config` widgets (`:237-266`).

### 7b · `productNextModeUpdate` — `onSchedule("05 00 * * *", Asia/Kolkata)` (`:358`) — DAILY 00:05 IST cron (the time-based advance)
Queries `participantsproduct where nextmodedate ∈ [today 00:00 … 23:59]` and advances each to its `nextmode`, recomputing the new `nextmodedate` from the product day-knobs (Performance→`+performancedays`, Extended→`+extendedperformancedays`, Integration→`+integrationdays`) — or, for **Event / Installation / Big / Preparation** modes, from the **event dates** (`event_collection` / `queue generation` start/end): Preparation → `nextmodedate = event start`; else Integration at `event end + 1` (`:414-475`).

### 7c · `onEventApprovalProductMode` — trigger `onDocumentWritten("event participation request/{docid}")` (`:498`) — ⚠️ **DEAD CODE (flag F1)**
*Intended* behaviour: on approval/attendance, set **Early Preparation / Preparation / Integration** by days-to-event-start (≥30 / 1–30 / day-of), resolving the participantsproduct via `deliverables → participantproductid` (`updateParticipantDocument`, `:536`). **But its guard `:503` is `(!X && X)` — always false**, so it never executes (see §7f F1). Event-mode entry actually happens in `queuesystem.js` (#3).

**So: how mode is set & advanced —** `participantsproduct` writes (delivery events) → `calculateParticipantMode` (seed + completion-arc + pre-event ramp + rollup + checklist); event approvals → `onEventApprovalProductMode`; and the daily IST cron `productNextModeUpdate` time-advances anyone whose `nextmodedate` is due. **The rollup rule I'd inferred (lowest `modes.sequence`) is confirmed in code** (`:201, :216`). **NB:** the headline is written to **`profile_data.participantmode`**; `participant metadata` gets `productmode` (the sorted array). The `participant metadata.participantmode` we read in data is a **denormalized mirror** — fully traced in §7d. The on-disk client `mode-dashboard` is a **manual override** on top of this engine.

### 7d · The denorm / projection layer — `participantmetadata.js` (RESOLVED 2026-06-04)
`participant metadata/{profileid}` is **not hand-written** — it's a **CQRS-style projection** rebuilt by ~11 `onWrite` triggers in `starlabs-cloud-function/functions/components/participantmetadata.js` (`*_to_pmd`). That's *why it looked read-only on the Angular side* — every write lives in this off-disk Cloud Function. Two triggers carry `participantmode`:
- **`profiledata_to_participantmetadata`** — `onDocumentWritten('profile_data/{id}')` (`:12`): when the mode engine changes `profile_data.participantmode`, this **mirrors it verbatim** into `participant metadata.participantmode` (change-guard `:31`, write `:46`) alongside name/email/number/testuser/dob, then webhooks Watson (`updateParticipantProfile`, `:60–66`). ← **this is the denorm path.**
- **`journey_to_pmd`** — `onDocumentWritten('participantjourneyproduct/{docid}')` (`:245`): recomputes **`customerstatus`** from the journey portfolio and, in the non-active cases, **overrides** `participantmode` directly — 1 completed-only → `customerstatus="non active"`, **`participantmode="Exploration Mode"`** (`:362–364`); 1 cancelled-only → `discontinued`, null (`:372–377`); no-live-subscription / closed-lost → `none`, null. This is the **same headline rule as the §7a rollup** (active→top product mode · non-active→Exploration · discontinued/null→null), enforced from the customerstatus side.

So `participant metadata.participantmode` = `profile_data.participantmode` (mode engine) **mirrored**, with `customerstatus`-driven overrides. A single `participantsproduct` write fans out to **both** `participantmode.js::calculateParticipantMode` (computes mode) **and** `participantmetadata.js::productsdata_to_pmd` (`:471`, updates the projection). **Residual fully closed — the mode model is end-to-end mapped.**

### 7e · Transition tables — exactly when modes shift (line-cited from `participantmode.js`)
Let `I = integrationdays`, `P = performancedays`, `E = extendedperformancedays` (per-product knobs on `products`). **NB — event-delivery modes (Event / Installation Event / Big) are NOT set here**; they are assigned in **`queuesystem.js:2192–2333`** on queue placement (concept group #3). `participantmode.js` only *consumes* them in its cron.

**The four shift mechanisms:**
| # | Mechanism | Code | Fires when |
|---|---|---|---|
| 1 | Event-driven (delivery writes) | `calculateParticipantMode` — onWrite `participantsproduct/{id}` `:7` | any write to a participant's product row |
| 2 | Time-driven (cron) | `productNextModeUpdate` — `onSchedule "05 00 * * *" Asia/Kolkata` `:358` | daily 00:05 IST, rows whose `nextmodedate` = today |
| 3 | Event-approval | `onEventApprovalProductMode` — onWrite `event participation request` `:498` | ⚠️ **dead code** — see flag F1 |
| 4 | Queue placement | `queuesystem.js:2192–2333` | participant placed in event/installation/big queue → Event/Installation/Big Mode |

**Table A — mode ENTRY (every transition *into* a mode, mechanism 1):**
| → Mode set | Condition | When | `nextmode` → | `nextmodedate` | Line |
|---|---|---|---|---|---|
| Journey Planning Mode | new row, `status==null`, `product.deliveryplanning=="normal"` | at creation | null | null | `:34–40` |
| Journey Priority Planning Mode | new row, `status==null`, `deliveryplanning=="priority"` | at creation | null | null | `:35` |
| Priority Mode | `status`→initiated/ongoing **and** row `deliverymode=="Priority Mode"` | product goes live | Integration Mode | null | `:69–76` |
| Early Preparation Mode | `participanttentativedate` changes **and** `(tentative − now) ≥ 30d` | tentative date ≥30d out set | Preparation Mode | `tentative − 30d` | `:301–309` |
| Preparation Mode | tentative changes **and** `15d ≤ (tentative − now) < 30d` | tentative 15–30d out | Priority Mode | `tentative − 15d` | `:311–319` |
| Priority Mode (late ramp) | tentative changes **and** `(tentative − now) < 15d` | tentative <15d out | Integration Mode | null (`status→ongoing`) | `:321–327` |
| Integration Mode | `status`→completed | at completion (arc day 0) | Performance Mode | `completionDate + I` | `:80–114` |
| null (cleared) | `status`→`cancelled` or `shifted` | immediately | null | null | `:162–185` |

**Table B — the post-completion time-arc (mechanisms 1 + 2):** once completed, mode walks this ladder by **days since `statusdate.completed`**. On completion the onWrite computes the *current* rung directly (back-dated completions jump to the right place, `:105–133`); thereafter the daily cron promotes `mode := nextmode` when `nextmodedate` arrives.
| Mode | Active during (days since completion) | Auto-advances on | → next | Set by |
|---|---|---|---|---|
| Integration Mode | `[0, I)` | `completionDate + I` | Performance Mode | onWrite `:108–114` |
| Performance Mode | `[I, I+P)` | `completionDate + I+P` | Extended Performance Mode | onWrite `:115–121` · cron `:405–413` |
| Extended Performance Mode | `[I+P, I+P+E)` | `completionDate + I+P+E` | After Extended Performance Mode | onWrite `:122–128` · cron `:396–404` |
| After Extended Performance Mode | `[I+P+E, ∞)` | — (terminal) | null | onWrite `:129–133` · cron `:387–395` |

⚠️ Requires **all three** of `I, P, E` non-null or the completion handler does nothing (`:105`; logs "Integration period not updated" `:143`). No-timestamp fallback (`:82–96`): Integration immediately, `nextmodedate = today + I`.

**Table C — daily cron promotions (mechanism 2, keyed on the current `nextmode`):**
| If `nextmode` is… | New `mode` | New `nextmode` | New `nextmodedate` | Line |
|---|---|---|---|---|
| Performance Mode | Performance | Extended Performance | `today + P` | `:405` |
| Extended Performance Mode | Extended Performance | After Extended Performance | `today + E` | `:396` |
| After Extended Performance Mode | After Ext. Perf. | null | null (terminal) | `:387` |
| Integration Mode *(and current mode ∉ Event/Install/Big)* | Integration | Performance | `today + I` | `:414` |
| Preparation Mode | Preparation | `product.mode` (if eventref) | event **start** | `:422–459` |
| Event / Installation / Big Mode | that mode | Integration Mode | event **end** + 1 | `:422–463` |
| Priority Mode | Priority | Integration Mode | null | `:476` |

**Table D — the headline rollup** (`profile_data.participantmode`, fires on any per-product mode change `:188`): sort the participant's product modes by `modes.sequence`, then pick by `customerstatus`:
| `customerstatus` | headline `participantmode` | Line |
|---|---|---|
| `active` | `sort[0]` = lowest-sequence active product mode (else "Journey Planning Mode") | `:215–216` |
| `non active` | Exploration Mode | `:217–218` |
| `discontinued` / null / `""` (and `none`/`banned`/`late` by fall-through) | null | `:219–220` |

### 7f · ⚠️ Code anomalies found during verification (flags — confirm before relying)
- **F1 — `onEventApprovalProductMode` is dead code (high confidence).** Guard `:503` is `(!X && X)` where `X = ["approved","attended"].includes(beforeData.status)` — **always false** (2nd clause should read `afterData`). The whole event-approval path never runs; event-mode entry comes from `queuesystem.js` instead.
- **F2 — `eventEnd` reads `start_date` (high confidence).** `:506` `eventEnd = eventData["start_date"]` (should be `end_date`). Moot while F1 holds.
- **F3 — post-event Integration promotion has no live path here — ✅ CONFIRMED LIVE.** A row with `mode ∈ {Event, Installation Event, Big}` and `nextmode=="Integration Mode"` matches neither cron branch (`:414` excludes those modes; `:422` only matches when *nextmode* is the event mode). The 12-user audit found a **real stuck row** (Antano Solar's `Evolution Prep`: `mode=Event Mode`, `nextmode=Integration`, `nextmodedate` in the past). So such rows are genuinely not advanced by this cron — confirm whether `queuesystem.js` (#3) recovers them.

### 7g · Precision audit vs production logs (2026-06-04) — Tables B & D validated
**Method (read-only):** replayed the engine over **12 recent users** with ≥5 consumed products (5–22 each; **38,967** `participantsproduct` rows scanned). For every completed row: recompute the arc rung from `days-since statusdate.completed` + the product knobs, compare to the live `mode`; per user recompute the headline from `customerstatus`; scan for F3-stuck rows. Honors the engine's `/Atestdate/date` clock. Probe + raw output in `specs/journals/2026-06-04-mode-engine-found-artifacts/` (`mode_audit.js`, `mode_audit_drill.js`, `mode_audit_FULL_OUTPUT.txt`, `mode_audit_output.json`).

| Check | Result |
|---|---|
| **Table B — completion arc** | **102/102 correct against knobs-in-effect.** 87 matched *current* knobs exactly; the other 15 are **config drift, not engine error** — the per-mode `statusdate` timeline (completed→integration 0d, →performance +30, →extended +60, →after-extended +30) proves the engine paced to the day under the *historical* `integrationdays=30`; the product knob was later edited to `45` (sum 120→135), so a recompute from *current* knobs falsely "expects" Extended. Drill proof: `mode_audit_drill_OUTPUT.txt`. |
| **Table D — headline rollup** | **11/12 exact.** The 1 exception (Antano Solar, `customerstatus=non active`): `participant metadata.participantmode=Exploration Mode` (correct per rule) but `profile_data.participantmode=Event Mode` (**stale**). |
| **Flag F3 — stuck event-mode** | **Confirmed live** — 1 in-sample (above). |

**Two caveats the audit surfaced (→ TD-017, TD-018):**
- **Day-knobs are not versioned (TD-017).** Editing a product's `integration/performance/extendedperformancedays` does **not** re-pace already-paced participants (terminal After-Extended has `nextmodedate=null`, never recomputed). Analytics that recompute expected mode from *current* knobs mis-predict historical participants — **use the `statusdate.*mode` timestamps for ground truth**, not the live knobs.
- **The headline has two writers that can diverge (TD-018).** `profile_data.participantmode` (§7a rollup) only updates on a **per-product mode change**; `participant metadata.participantmode` (§7d `journey_to_pmd`) updates on **customerstatus/journey change**. When customerstatus flips (→ non active) with no concurrent mode event, `participant metadata` becomes "Exploration Mode" while `profile_data` keeps the **stale** prior headline. Treat `participant metadata` as the fresher source for customerstatus-driven headlines.

## 8. Field opportunities (validated) — BIG participants deliver for others
A BIG participant is simultaneously a *recipient* in their own journey and a *provider* in others' stages — **mode/role is contextual.**

**Provider-role evidence (queue_token fields, all 7,224 tokens):**
| Provider field (delivering for someone else) | populated |
|---|---|
| `cwperson` / `cwmentoring` / `cwshadowing` (change-work) | 108 each |
| `diagnosticperson` / `diagnosticmentoring` / `diagnosticshadowing` | 2 each |
| tokens with `people_involved[]` | 221 |
| **distinct providers** | **68 — of which 66 (97%) hold a Big Mode product** |
| `arena participant.pairingmode` | **manual** (1,238) |

**What stage providers work in (`arena participant.stagerole`):** In Implementation 735 · In Review 559 · In Diagnostics 429 · In Change Work 70 · In video log 56 · In Consultation 35 … → BIG field work is mostly Implementation/Review/Diagnostics delivered *for others*.

## 9. System topology (relevant context)
3 Firebase projects, email-joined: `fir-sample-aae4a` (StarLabs delivery — mode lives here), `watsonproduction-becde` (finance), `salesleadcrm` (lead/purchase approval). The mode engine is on **StarLabs** (delivery), not Watson/Sales-CRM.

## 10. Open questions (carry forward)
1. ~~The mode-engine source~~ — **RESOLVED** (§7: `starlabs-cloud-function/.../participantmode.js`, `development`).
2. ~~The `participant metadata.participantmode` denorm path~~ — **RESOLVED** (§7d): mirrored from `profile_data.participantmode` by `participantmetadata.js::profiledata_to_participantmetadata` (`:12`), with `customerstatus` overrides from `journey_to_pmd` (`:245`). `participant metadata` is a CQRS projection (~11 `*_to_pmd` triggers).
3. Intent of the no-info modes (Snooze, Investment) + the widgets-only ones (Journey Priority Planning, Extended/Early/After Performance).
4. Are the Big-Mode field-opportunity assignments governed by config, or purely manual?

## 11. Evidence log
| Claim | Evidence | Source |
|---|---|---|
| 5 delivery modes / counts | products.mode tally | modes_probe.js |
| Event=queue, Priority=appts | 7,125 queue tokens Event; 1,505 appts Priority | queue_mode_probe.js |
| 15 participant modes + info | modes catalog full dump | modes_intent_probe.js |
| rollup = lowest sequence | 5/6 profiles | evidence_modes.js |
| participant mode checklist mechanism | 27,496 docs, per participant×product×mode | checklist_probe.js |
| 2 modeflow templates | 99 products, modeflow[0]==mode 64/99 | modes_probe3.js |
| field opportunities = BIG | 66/68 providers Big-mode | field_opp_probe.js |
| **engine = 3 Cloud Functions** | `calculateParticipantMode` (participantsproduct trigger) · `productNextModeUpdate` (daily 00:05 IST cron) · `onEventApprovalProductMode` (event trigger) | `starlabs-cloud-function/functions/components/participantmode.js` (`development`, `d264bac`) |
| completion-arc day-math | days-since-`statusdate.completed` vs integration/performance/extendedperformance days | `participantmode.js:80-159` |
| rollup = lowest `modes.sequence` (confirmed) | sort by sequence; active→sort[0], non-active→Exploration | `participantmode.js:201,216,227` |
| checklist writer | created on mode-change with `product mode config` widgets | `participantmode.js:237-262` |
| `participant metadata` = CQRS projection (~11 `*_to_pmd` onWrite triggers) | denorm layer; not hand-written | `participantmetadata.js` (`development`) |
| `participantmode` denorm = mirror of `profile_data.participantmode` | change-guarded mirror + Watson webhook | `participantmetadata.js:12,31,46,60` |
| `customerstatus` override → Exploration Mode / null | non-active→Exploration, cancelled→discontinued/null | `participantmetadata.js:245,362,372` |
| **Table B arc validated on real logs** | 12 users, 102 completed rows → **102/102 correct vs knobs-in-effect** (87 exact + 15 reconciled to config drift) | `mode_audit.js` |
| config-drift proof (not engine error) | `statusdate` gaps = historical **30/60/30**; product knob now **45/60/30** | `mode_audit_drill_OUTPUT.txt` |
| **Table D rollup validated** | **11/12** users exact; 1 = `profile_data` stale vs `participant metadata` fresh | `mode_audit_output.json` |
| **F3 confirmed live** | 1 stuck Event-Mode row (Antano Solar, `Evolution Prep`) | `mode_audit_FULL_OUTPUT.txt` |
