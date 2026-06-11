# specs/flutter-app/ — the breakthroughs-flutter participant-app map

## What this directory is

`specs/flutter-app/` is the **evidence-backed code + data + config map of the `breakthroughs-flutter` participant app** (native Flutter, branch `development`) — the map that drives a full **e2e test suite** for the participant journey. Every claim traces to a cluster doc, and every cluster doc carries `file:line` evidence from a static read-only mapping pass over `breakthroughs-flutter/lib/`.

**This is distinct from `specs/validated/`.** `specs/validated/` is the **operator-validated, Angular-side** truth (the StarLabs admin/delivery web app + the Cloud Functions backend), confirmed concept-group by concept-group with the operator. `specs/flutter-app/` is the **participant mobile app** surface — a different codebase (`breakthroughs-flutter`), mapped from code/config (not operator-validated). The two **overlap** on the shared data model (queue, appointments, events, modes, journey/products) because the mobile app reads/writes the same Firestore collections the validated docs describe — cross-reference them, but don't conflate the layers.

## Contents

### Top-level (consolidated)
- **`00-overview.md`** — the app shell & cross-cutting infra: `MaterialApp` root + 4 named routes + the dead go_router, the splash→Home/Login auth gate, the 5-tab bottom-nav shell, the onboarding gate, Home's global listeners, the Services layer (`AppService`/`UserData`/`BackgroundService`/CallKit), FCM/notifications, PostHog, the (absent) Remote Config, deep-link handling, the 3-Firebase-project topology, and the **Flutter-home render chain** + crash-guards. **Read this first.**
- **`FEATURE-CATALOG.md`** — the master coverage matrix: one row per feature across all 18 clusters (Feature ID · cluster · journey stage · what the user does · nav/entry · reads · **writes = anti-circular assertion target** · endpoints · config/flags · ATC? · e2e-testable? · why/e2e note), grouped by `##` cluster headers, with a per-cluster summary table at the top. **This is what the e2e suite is planned from.**

### The 18 evidence-backed cluster docs (`clusters/`)
Each has: Overview · Screens table (`file:line`) · Features (reads/writes/endpoints/config/journey-stage/e2e-testability) · Firestore collections · Endpoints · Dead/clone code · Notes & open questions.

| Cluster doc | Surface |
|---|---|
| `clusters/shell-nav-mainscreen.md` | App shell, 5-tab nav, Home feed, Explore, AppBar actions, notifications, posts |
| `clusters/auth-onboarding.md` | Login/register/forgot/terms/code, profile-change, JourneyOnboarding V2 |
| `clusters/profile.md` | My Profile, image/verify, request-change, password, delete, view-other-user |
| `clusters/journey-dashboard-mode.md` | Journey dashboard, Mode widget/checklist, Know-Your-Journey, Evolve/Legacy/Impact |
| `clusters/reports-evolution.md` | Interim monthly report, Previous Cycle, report viewers, Evolution Wishlist |
| `clusters/delivery-queue.md` | The in-app live-queue deliverable (QueueControl, stage timeline, chat, slot booking) |
| `clusters/delivery-forms.md` | The dynamic form-fill engine (`FillForm`) + Plan-Together (dead) |
| `clusters/delivery-appointments.md` | Book/view/cancel delivery appointments + the Master Calendar |
| `clusters/delivery-events-arena.md` | Event lifecycle, RSVP, Arena hub, video-ask, tweets, post-event achievements |
| `clusters/content-eiflix.md` | EiFlix video service, series/episodes, tier-gating, saved/recommended, ads, Eiflix TV |
| `clusters/content-workshops.md` | EiFlix Workshop (new) enrollment + challenge runner + Q&A; Mentoring (ATC, dead) |
| `clusters/content-audio-hpc-surprise.md` | Solar Voice audio, HPC ("Success Multiplier"), Surprise Content (dead) |
| `clusters/social-community.md` | Posts/comments/likes/drafts, achievements, Community Snippets/stories |
| `clusters/big.md` | B!G cohort gamification dashboard (read-only aggregates) + BIGVideo |
| `clusters/shadow-opportunity.md` | EIS shadow-request screen (request/cancel/status) |
| `clusters/services-infra-config.md` | `AppService`/`UserData`/`BackgroundService`/CallKit, shared widgets, FCM, config |
| `clusters/atc-offlimits.md` | **OFF-LIMITS** — ATC client/staff surfaces (mapped for existence only) |

### Cross-reference (do NOT rewrite these)
- `specs/journals/2026-06-11-flutter-full-map-and-e2e-artifacts/JOURNEY-DATA-BLUEPRINT.md` — the data model + join keys + the synthetic ≥200-user cohort blueprint (the seed side of the suite).
- `specs/validated/README.md` (+ `01`–`06`) — the operator-validated Angular-side docs that overlap on the shared data model.

## How the catalog drives the e2e suite

Each **e2e-testable** feature in `FEATURE-CATALOG.md` becomes one e2e check with two halves:

1. **Seed precondition** — the Firestore docs (+ in-memory app state computed at a **real login**) that make the feature reachable. The base precondition is the **Flutter-home render chain** from `00-overview.md` §9 (a logged-in `profile_data` with `participantmode`, the PJP/PSP purchase quartet, and the `participantdeliverysequence`→`deliverables`→`queue_token` chain), plus the per-feature reads listed in the catalog row, all seeded into the **test** project `slabs-queue-e2e-exdcz` via the blueprint's seeder (tagged `{testrunid, _testdata:true}`, `atcmodel:null`).
2. **Anti-circular assertion** — assert the **`Writes = assertion target`** doc, i.e. the Firestore doc the *app itself writes* as a side-effect of the user action (e.g. `event rsvp` for `events-rsvp-*`, `formsByClient` for `forms-confirm-submit`, `appointments` for `appt-book-delivery`) — **never** the seed doc we planted. Read-only features assert rendered widgets instead (prefer the existing `Key('e2e-…')` affordances; add stable keys where flagged in the catalog).

**Firewall + exclusions the suite must honor:** the test project must provision the **`firestore-forms`** named database; the **`firestore-atc`** database and all `atc_*` collections are **OFF-LIMITS** (every `atcTouch:true` feature is e2e=No); and the prod endpoints flagged in the catalog/overview (`requestScheduling`, `authorisation_key_code`, the Watson verify CF, `workshopAssignment` Slack CF, YouTube/OpenAI/publit.io, the `fir-sample-aae4a` Storage bucket) must be firewalled or stubbed under the test build.

**Coverage at a glance (from `FEATURE-CATALOG.md`):** **265 features · 235 e2e-testable (179 clean-Yes + 56 Partial) · 18 ATC-excluded · 30 non-testable** (the 30 = the 18 ATC + 12 dead/unreachable code, mapped so the suite knows the gaps are intentional).
