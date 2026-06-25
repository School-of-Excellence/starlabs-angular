# Architecture — config-driven engine + AuthguardService hub + 5 delivery modes

See `DESIGN.md`, `CONFIGURATION.md`. The core idea: **generic components + Firestore CONFIG documents = behavior assembled at runtime.**

```
                              ┌───────────────────────────────────────────────┐
                              │            Firebase (fir-sample-aae4a)          │
                              │  Auth · Firestore · Storage · Functions · FCM   │
                              └───────────────────────┬───────────────────────┘
                                                      │
   ┌──────────────────────────────────────────────────────────────────────────────────────┐
   │  AuthguardService  (src/app/authguard.service.ts, ~1,800 lines — the #1 graph hub)     │
   │  • auth state + getRoles() (role_ref → users_roles)        [:307-318]                   │
   │  • route ACL routeConfig() (reads `dashboard` config)      [:325-345]                   │
   │  • cached access maps: profiles, products, journeys, appointmenttypes, eisroles         │
   │  • delivery/appointment mutations · moveQueueStage()       [:1171-1213]                 │
   │  • createOpenViduRoom()                                    [:1792]  · FCM · IndexedDB    │
   └───────┬───────────────┬───────────────┬───────────────┬───────────────┬───────────────┘
           │ most screens depend on the hub                                                  
   ┌───────▼──────┐ ┌──────▼───────┐ ┌─────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────┐
   │ ~212 routed  │ │ Queue board  │ │ Dynamic    │ │ Scheduling  │ │ Content / nav    │
   │ screens      │ │ (config-     │ │ studio     │ │ (config-    │ │ (dashboard ACL,  │
   │ (auth-gated) │ │  driven)     │ │ (runtime)  │ │  driven)    │ │  tier config)    │
   └──────────────┘ └──────────────┘ └────────────┘ └─────────────┘ └─────────────────┘

   CONFIG documents (the knobs — CONFIGURATION.md):
   ┌───────────────────────────────────────────────────────────────────────────────────────┐
   │ queue generation/variation · arenaspace · productToDeliverySequence · modes ·           │
   │ appointmenttype · AppointmentType-To-Roles → Roles-To-EIS · tier access config ·        │
   │ dashboard (nav+ACL) · journey/products/package/journey-to-product · classify · eisroles  │
   └───────────────────────────────────────────────────────────────────────────────────────┘

   Authorization (100% client-side — NO Firebase custom claims):
     Firebase Auth ─▶ user_data/{uid} ─▶ profile_data(by user_ref) ─▶ role_ref ─▶ users_roles{flags}
                                                                              └─▶ dashboard ACL (roles[]/profileid[])

   The 5 delivery modes (products.mode / modeflow[]):
     Priority (1:1 appointments)  Event (group)  Installation Event (live workshop)  Big (cohort/marathon)  Investment
        │                            │              │                                  │
        ▼ SCHEDULING-DELIVERY        ▼ Events        ▼ New-Workshop                     ▼ QUEUE-AND-BIG + LIVE-STUDIOS
     appointments/availability    event collection  workshopconfiguration            queue_token → live assignment

   Conferencing (not deterministically testable — external servers + Cloud Functions):
     LiveKit (primary, "OpenVidu" components) · Zoom Meeting SDK (legacy/big) · Chime Voice Focus · Picovoice Koala
```
