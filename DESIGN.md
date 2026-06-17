# DESIGN.md — StarLabs (atctranscription)

> The WHY/architecture narrative. Companion to `DOCS.md` (the code reference, WHAT) and `specs/` subsystem docs. Scaffolded 2026-06-02 from discovery; deepen per the documentation rollout plan.

## What StarLabs is
A coaching / customer-journey platform ("Breakthroughs") for participants, coaches, and operators: people **purchase a journey/product**, get **onboarded**, move through **delivery** (1:1 appointments, live events, or cohort programs), consume **content** (SolarVoice audio + eiflix video), and progress toward outcomes — often **buying further journeys** (33% do).

## Core architecture
- **Angular 19 standalone + SSR on Firebase.** ~212 lazy-loaded routed screens; auth/role-gated.
- **Auth & authorization:** Firebase Auth → `profile_data.role_ref` → **`users_roles`** (boolean role flags) → per-route ACL in the `dashboard` collection. There are no Firebase custom claims; role logic is client-side via `AuthguardService`. *(Corrected 2026-06-02: `role_ref` → `users_roles`, verified live 60/60; `eisroles` is the specialist-role catalog, not the auth source — `specs/AUTH-ROLES.md`.)*
- **`AuthguardService` is the backbone** (the graph's #1 hub): it owns auth state, the cached Firestore access-maps (profiles, products, journeys, appointments…), delivery/appointment mutations, and FCM. Most screens depend on it. *Design tension:* it's a single ~1,800-line god-service — central by design, but a bottleneck and a refactor risk.

## The commercial/delivery model (the heart of the domain)
- **48 journeys, 104 products, 5 delivery modes:** Priority (1:1 appointment series), Event (group), Installation Event (live workshop), Big (cohort/marathon via the queue system), Investment.
- **Lifecycle:** purchase (`participantjourneyproduct`: subscriptionstart/end, journeystatus, onboarded, opportunities) → onboarding → mode-specific delivery → review/testimonial → continuity/cross-sell.
- **Load-bearing reality (proven from logs):** the **purchased journey ≠ the delivered journey** — delivery runs on a shared toolkit of appointment types (WiSH / A&H Light / Critical Support / EI Implementation) regardless of the package name. Journeys are iterative (many Implementation sessions) and cancellation-prone; Critical Support recurs as a mid-journey intervention. Document journeys by *delivered* sequence, not package name.

## Conferencing & audio
LiveKit is the primary live-video stack (the "OpenVidu" components); Zoom Meeting SDK is legacy/big-events; Amazon Chime Voice Focus is a fallback noise filter; Picovoice Koala does real-time mic noise suppression before publish. These depend on live external servers + Cloud Functions for tokens → **not deterministically testable**; CI treats them as mount-and-stub smoke only.

## Data trust stance (why it matters for everything downstream)
Not all collections are trustworthy. We classify by reliability (`specs/data-reliability.md`): purchases are reliable; the BIG aggregate-level rollups are broken; several derived fields are dead. **Documentation and CI fixtures must build only on the locked Tier-A set**, or they will silently encode broken data.

## Constraints
- **ATC data is off-limits** for CI/testing (sensitive). 14 mainstream operator screens integrate ATC and are therefore CI-excluded (see `specs/operator-screens.md`).
- Production (`fir-sample-aae4a`) must stay untouched by test infrastructure; test users live in `starlabs-test`/the emulator.
