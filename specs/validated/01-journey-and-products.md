# 01 · Journey & Products — OPERATOR-VALIDATED

> ⚠️ **Branch note (2026-06-04):** validated against `main`-era code; repo since migrated to `production`. Facts here are **data-driven (production Firestore/Watson) → branch-independent and still valid**; re-verify any Angular `file:line` ref against `production` before relying (stream B; see `ORIENTATION.md` Open-threads #4).
> **Status: VALIDATED with operator, 2026-06-03.** This supersedes the auto-derived `specs/JOURNEY-LIFECYCLE.md` for this topic. Cross-project facts involve **Watson** (`watsonproduction-becde`), the separate finance/billing project added 2026-06-03.
> Evidence (in-repo, git-tracked): query scripts + captured live data in `specs/journals/2026-06-03-watson-finance-and-shifted-artifacts/` (`shifted_correlation2.js`, `watson_purchase_probe.js`, `watsonid_check.js`/`_check2.js`, `journey_taxonomy.js` + `DATA_OUTPUTS.txt`); the 10 windowed timelines in `specs/evidence/journey_evidence_final.json`. Journal: `specs/journals/2026-06-03-watson-finance-and-shifted.md`.

## 1. The concept model (validated)
- **Journey** = the **program a participant buys** (uP!, WiSH, B!G, CPM, CTD, SMP, FTM, EI Solutions, A&H Light, Launch Your Legacy L2, …). In Watson: a purchase with `purchasetype = "journey"`.
- **Product** = a **deliverable unit**. Sold as part of a journey, **standalone** (`purchasetype = "product"`), or as an **add-on** (`purchasetype = "addons"`).
- **Package** = `packagedesignid` = the **pricing / payment-plan design** applied to a purchase (fee, gross, GST, installment amount, EMI/payment-day). It is a **commercial wrapper, not a content bundle.**

## 2. The purchase record + `journeystatus` state machine
`participantjourneyproduct` (StarLabs, 5,144) is the **purchase record of truth** on the delivery side: `journeyref`, `profileid`, `subscriptionstart`(=t0)/`subscriptionend`, `onboarded`, `purchaseref`→`journeyproductpurchase`, `participantproducts[]`, and **`journeystatus`** (the live lifecycle state — *not* the dead `profile_data.currentjourney*` fields).

**`journeystatus` distribution (live, 5,144 purchases):**
| status | count | status | count |
|---|---|---|---|
| completed | 1,525 | initiated | 423 |
| upgraded | 1,124 | downgraded | 344 |
| ongoing | 828 | (none) | 344 |
| cancelled | 518 | **shifted** | **38** |

**Journey volumes & outcomes (top by purchases):**
| journey | purchases | completed | upgraded | cancelled |
|---|---|---|---|---|
| uP! | 1,696 | 424 | 394 | 295 (17%) |
| CTD | 709 | 452 | 177 | 67 (9%) |
| B!G | 618 | 87 | 191 | 43 (7%) |
| FTM with SLD CI | 258 | 89 | 102 | 22 (9%) |
| B!G Continuity | 233 | 1 | 13 | 9 |
| CPM | 176 | 35 | 45 | 9 |
| FTO | 147 | 45 | 14 | 5 |
| FTM | 127 | 11 | 43 | 10 |
| Health Explorative | 83 | 52 | 11 | 4 |
| uP! For Prodigies | 74 | 1 | 1 | **14 (19%)** |

```
 initiated ─▶ ongoing ─┬─▶ upgraded     (bought a higher journey; pay the difference)
                       ├─▶ downgraded
                       ├─▶ shifted       (moved to a DIFFERENT journey; prior payment CARRIED OVER)
                       ├─▶ cancelled     (churn)
                       └─▶ completed
```

### "shifted" (38) — VALIDATED meaning
**A journey shift = the participant moves from journey A to journey B, with the money already paid carried over to B** (distinct from *upgrade* = higher tier pay-the-difference, and *cancelled* = stop). Watson is the system of record and writes it literally as a new purchase whose `product` is the transition string:
- `"FTO to BiG"`, `"uP! to FTM"`, `"uP! to Launch Your Legacy L2"`, `"BiG to BiG Continuity"` — old purchase → `cancelled`, salenotes e.g. *"Sale reuploaded to change the journey"* / *"To change journey"*.
- StarLabs salenote (evidence): *"Onboarding upgrade from uP! to LYL. She has paid 10000 for uP! — move that towards her LYL journey."*
- `salesleads` carries the explicit `upgradefrom/to-` and `downgradefrom/to-watsonpurchaseid` references for these transitions.

## 3. Watson — the finance/billing backend (separate project)
`watsonproduction-becde` holds the money side: `ParticipantPurchases` (5,461), `ParticipantPurchases_history` (470; `carryover`, `amendnotes`), `ParticipantPayments` (24K), `Payment Schedule` (46K), `Invoice` (16K), NACH/ICICI/Axis e-mandates, `emi pause`, `addproduct` (104, with `originalpurchaseamount`).

**`ParticipantPurchases` field tallies (900-doc sample):**
| `purchasestatus` (commercial) | n | `purchasetype` | n | `status` (payment) | n |
|---|---|---|---|---|---|
| active | 232 | journey | 355 | due | 408 |
| upgrade | 82 | addons | 22 | Active PaymentPlan | 104 |
| cancelled | 70 | product | 20 | Fully Paid | 40 |
| addons | 36 | | | missed / overdue | 13 |
| downgrade | 19 | | | emi paid | 3 |

So **`packagedesignid`** = the package (pricing/installment design); `purchasetype` splits journey vs standalone-product vs add-on; `purchasestatus` mirrors the StarLabs `journeystatus` lifecycle; `status` is the separate payment state.

## 4. Cardinality (validated from 5 power-users)
One **journey purchase** → one `participantjourneyproduct` → **MANY** `participantproducts` (delivery units). The 5 power-users had **57–68** `participantproducts` in a single B!G/FTO journey, but only **1–4 actual Watson purchases**. So:
- `participantproducts[]` = **delivery/activity units, NOT purchases** (cohort journeys explode into dozens).
- Watson purchases = the few real commercial transactions (the journey + any add-ons).

## 5. Cross-project join (the watsonid finding)
**Not abandoned — explicit-id primary, email fallback:**
- `journeyproductpurchase` (purchaseref target): **100%** `watsonpurchaseid` + `watsonpurchaselabel`.
- `salesleads`: **2025 & 2026 = 100%** `watsonparticipantid` / `watsonpurchaseid` (+ upgrade/downgrade from/to ids).
- **0%** on `participantjourneyproduct` / `participantsproduct` / `profile_data` → screens starting from a profile fall back to **email** (`journeyplan.ts:557`). See TD-015.

## 6. Blank `journeyref` (395) — validated as mixed, not corruption
Cross-checked vs Watson by email: real participants. (a) `journeytype = addons` → legitimate **add-on/standalone purchases with no parent journey**; (b) `journeytype = (none)`, often `salesperson = Team` → **incomplete/placeholder rows** (journey link never populated). → **TD-014.** *Open: backfill where a journey exists + model "journey-less add-on" explicitly (operator decision).*

## 7. Terminology
The uP!→FTM→BiG→BiG Continuity multi-journey pattern (≈33% of participants) is **journey progression** (upgrade / shift / continuity within one relationship) — **not** "cross-sell" (that was the documenter's imprecise term, now retired). *Open: confirm the team's canonical label.*

**Real progression transitions (sequential purchases; 1,072 of 3,240 profiles buy ≥2 journeys):**
| transition | count | transition | count |
|---|---|---|---|
| uP! ⇒ B!G | 200 | uP! ⇒ FTM | 54 |
| B!G ⇒ B!G Continuity | 157 | uP! ⇒ FTM with SLD CI | 52 |
| CTD ⇒ uP! | 117 | FTM ⇒ B!G | 46 |
| FTM with SLD CI ⇒ B!G | 98 | CPM ⇒ B!G | 38 |
| uP! ⇒ CPM | 76 | EI Starter Pack ⇒ uP! | 26 |

## The diagram (validated)
```
  WATSON (finance — system of record)        ⇄ JOIN ⇄          STARLABS (delivery)
  ───────────────────────────────────                          ───────────────────
  Participant
     │ buys
     ▼
  ParticipantPurchases ── purchasetype:
     ├─ journey ─ packagedesignid = PACKAGE ───────────▶ participantjourneyproduct  (1 / journey)
     │            (pricing / EMI / installment)               │  journeystatus, subscriptionstart=t0
     │                                                         │  purchaseref ─▶ journeyproductpurchase
     │                                                         ▼     (watsonpurchaseid 100%)
     │                                                   participantproducts[]  (MANY deliverables;
     │                                                      57-68 for B!G / FTO cohorts)
     ├─ product (standalone) ──────────────────────────▶ participantsproduct  (→ blank journeyref)
     └─ addons ────────────────────────────────────────▶ extra products on the journey

  SHIFT  =  Watson new purchase product="<A> to <B>"  +  old → cancelled  +  payment carried over
            ("uP! to FTM")   ⇄   StarLabs journeystatus="shifted"   ⇄   salesleads upgrade/downgrade-from/to ids
  JOIN  =  explicit watsonpurchaseid (journeyproductpurchase 100%, salesleads 2025-26 100%)  +  EMAIL fallback
  MONEY =  Payments · EMI · NACH · Invoices · Payment Schedule  →  all Watson (46k schedules, 24k payments)
```

## Collections by ROLE × reliability
| ROLE | Collection | Count | Note |
|---|---|---|---|
| RUNTIME-STATE | `participantjourneyproduct` | 5,144 | purchase record of truth (`journeystatus`, t0=`subscriptionstart`) |
| RUNTIME-STATE | `participantsproduct` | 38,963 | product enrollments (delivery units) |
| RUNTIME-STATE | `journeyproductpurchase` | 5,138 | per-purchase; `watsonpurchaseid` 100% (the cross-project key) |
| RUNTIME-STATE | `salesleads` | 4,342 | pipeline; `watsonparticipantid`/`watsonpurchaseid` (+shift ids), recent 100% |
| CONFIG-catalog | `journey`(48) `products`(104) `package`(49) `journey-to-product`(41) | — | the catalog |
| WATSON (finance) | `ParticipantPurchases` `ParticipantPayments` `Payment Schedule` `Invoice` `nach`/`*enach` `emi pause` | — | separate project `watsonproduction-becde` |
| C — DEAD | `profile_data.currentjourney*` | — | 0% — never read (TD-003) |

## Open questions (carried to next session)
1. Canonical term for journey progression (replacing "cross-sell"). 
2. Blank-journeyref: backfill policy + explicit "journey-less add-on" model (TD-014).
3. Does a **Cloud Function** also write `participant metadata`? (functions source not in this repo; 8 client screens write it.)
4. Should `watsonparticipantid` be surfaced onto `profile_data` to retire the email fallback (TD-015)?

## Evidence log
| Claim | Evidence | Source |
|---|---|---|
| shifted = journey change + carryover | 6/6 email-matched; Watson `"<A> to <B>"` purchases + carryover | `shifted_correlation2.js` |
| package = pricing design | Watson `packagedesignid` + `purchasetype` journey/product/addons | `watson_purchase_probe.js` |
| 1 journey → many delivery products | 5 power-users 57-68 products vs 1-4 Watson purchases | `shifted_correlation2.js` |
| watson id maintained (not abandoned) | journeyproductpurchase 100%, salesleads 2025/26 100%; PJP/PSP/profile 0% | `watsonid_check.js`,`_check2.js` |
| join is email-fallback on profile screens | `journeyplan.component.ts:557` | code audit |
| blank journeyref real (add-ons + placeholders) | Watson purchases exist for all sampled blanks | `shifted_correlation2.js` |
