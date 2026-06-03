# 02 · Product Modes — OPERATOR-VALIDATED (INTERIM)

> **Status: INTERIM, 2026-06-03.** Everything *observable* (in code + production data) is validated below. **One part is PENDING: the engine that writes/advances participant mode (B) is not in any local repo** — see §7. Resume when we get the mode-engine source (a pointer in the current code, or a separate Cloud Functions deployment). Supersedes the auto `specs/CONFIGURATION.md` mode sections for this topic.
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

## 7. ⚠️ PENDING — the transition engine is OFF-DISK (TD-016)
**How participant mode is set & advanced is NOT in any local repo.** Exhaustively verified:
- StarLabs Angular: every `participantmode` occurrence is a **READ** (delivery screens group/count by it); `participant mode checklist` read once (`userprofile.component.ts:814`), written nowhere; `participant metadata` writes set only `generalnotes`/`remarks`.
- `firebasefunctions/index.js` (30 fns) **zero** mode refs; `watson-cloud-functions` empty; sibling repos none.
- The product day-knobs (`modeflow`, `integrationdays`="Immersive Integration Period", `performancedays`="Performance Period", `extendedperformancedays`="Extended Performance Period", `delaydays`="Maximum Delay Period", `diagnosticswithin4days`=rare boolean) are **authored in Product Designer but never consumed on-disk** — the pacing runs in the off-disk engine.
- On-disk, `participantsproduct.mode`/`nextmode`/`nextmodedate` are set **only manually** via `mode-dashboard` (operator dropdowns + datepicker); the `nextmodedate<now` "Participants Not Moved" list proves there's no automatic advance here.

**The engine is a backend not present locally** — tied to `aelid`/AEL/delivery, almost certainly a Cloud Function on `fir-sample-aae4a` deployed outside the `firebasefunctions` repo. (Earlier mis-traced to the Sales-CRM `breakthroughapprovedleads` CF; operator corrected — it's delivery-connected, not Sales-CRM.)

**To resume — the question for the developer:**
> *"Where is the code that creates `participant mode checklist` docs and sets `participant metadata.participantmode` (the AEL/delivery-driven mode engine)? It's not in starlabs-angular, firebasefunctions, or watson-cloud-functions — is there another Cloud Functions deployment on `fir-sample-aae4a`, or a pointer in the current code?"*

When answered, fill in: the trigger(s) (purchase / event date / AEL change), the day/month offsets per mode, and the time-based rules.

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
1. The mode-engine source (§7) — the blocking unknown.
2. Intent of the no-info modes (Snooze, Investment) + the widgets-only ones (Journey Priority Planning, Extended/Early/After Performance).
3. Confirm `participant metadata.participantmode` rollup = lowest-`sequence` (5/6 matched; 1 anomaly).
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
| engine off-disk | participantmode/checklist read-only; CF zero refs | 4-agent audit, grep |
