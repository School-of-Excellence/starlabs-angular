# Journey lifecycle (validated from logs) + journeystatus state machine

See `JOURNEY-LIFECYCLE.md`, `SCHEDULING-DELIVERY.md`. 100% from production logs (`journey_evidence_final.json`).

```
   salesleads (pre-sale pipeline, 4,339)
        │  status → Approved, carries participantjourneyproductid   (saleslead.ts:551,627)
        ▼
   ┌─────────────────────────── participantjourneyproduct (5,141) — purchase record of truth ───────────────────┐
   │  profileid · journeyref→journey · productref[]→products · subscriptionstart(=t0) · journeystatus           │
   │                                                                                                            │
   │   journeystatus STATE MACHINE (observed values + writers):                                                 │
   │                                                                                                            │
   │     initiated ──▶ ongoing / currentjourney ──┬──▶ upgraded     (cross-sell to higher journey)              │
   │     (create-watson:2140)   (the live journey) ├──▶ downgraded   (create-watson:1571)                       │
   │                                               ├──▶ cancelled    (:2231 — churn)                            │
   │                                               └──▶ completed                                               │
   │   (writer of record: updatePurchase journey-product-purchase.ts:646,684)                                   │
   └──────────────────────────────────────────┬───────────────────────────────────────────────────────────────┘
                                               │ products (participantsproduct, deliverymode) → mode-specific delivery
                ┌──────────────────────────────┼───────────────────────────────┐
                ▼ Priority (1:1)                ▼ Big / Event                    ▼ Investment / Event
        SCHEDULING-DELIVERY                QUEUE-AND-BIG + LIVE-STUDIOS         Events
        appointments/availability          queue_token → studios               event participation

   ┌──────────────────────── ⚠ PURCHASED ≠ DELIVERED (TD-009) ────────────────────────┐
   │  P-4F5BB purchased: "FTM with SLD CI" (upgraded) → "B!G" (upgraded)               │
   │  P-4F5BB delivered (45 appts, by appointment TYPE, not package):                  │
   │    Welcome To WiSH → WiSH Diagnostics → WiSH Experience Call → WiSH Implementation │
   │      → … → WiSH Final Review → Critical Support Diagnostics/Implementation/Review  │
   │      → Journey Coaching → Critical Support Implementation (long, cancel-prone tail)│
   │  Content alongside: 368 SolarVoice + 73 eiflix plays over months 0.4 → 19.7        │
   └───────────────────────────────────────────────────────────────────────────────────┘

   CONTINUITY / CROSS-SELL (~33%): a new participantjourneyproduct for the next journey; prior one → upgraded.
     P-B54D2: A&H Light → uP! → B!G(downgraded) → B!G(ongoing)   (4 journeys on one participant)

   ⚠ DEAD (TD-003): profile_data.currentjourney/currentjourneystatus/currentproductstatus = 0% (never read).
       Use participantjourneyproduct.journeystatus.
```
