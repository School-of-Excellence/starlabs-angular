# 2026-06-02 — System map (6 agents) + recommended CI/CD test stack

**Headline:** First-pass map of the whole StarLabs app via 6 parallel agents, to design a CI/CD pipeline that 100%-tests existing features without ever touching ATC data. Recommended a non-LLM deterministic test stack with LLM verification as a final gate, evolving toward an AI self-healing "zero-bug" loop.

## Context / why
Operator goal: any coder pushes to git → the system proves existing features still work + old functionality isn't broken. Hard constraints: ATC data is OFF-LIMITS (the prod service account can't see it and test users must never touch it); features that integrate ATC are out of CI scope; a production service account (`~/Downloads/serviceAccountKeyProduction.json`, project `fir-sample-aae4a`) is available read-only.

## What we did
6 parallel Explore agents over the ~40 feature folders: app-shell/auth, coaching/journey, conferencing, content/dashboards, service+data layer, SolarVoice. Produced a ~11-domain map + a ~130-collection Firestore inventory.

## Findings
- Angular 19 standalone + SSR on Firebase (Auth/Firestore/Storage/Functions/FCM). Auth = Firebase Auth → `profile_data.role_ref` → `eisroles` (boolean role flags) → route ACL via the `dashboard` collection.
- Heavy external deps that can't run deterministically in CI: Zoom, LiveKit (OpenVidu), Amazon Chime, WATI (WhatsApp), Watson, Picovoice, AWS instance-status, recordrtc.
- **398 of 399 `.spec.ts` are empty CLI stubs** → real coverage ≈ 0 despite the file count.
- CI today (`.github/workflows/deploy_19.yml`) **deploys on push to `development`/`production` with NO test or build gate.**

## Decision (recommended stack)
Deterministic core, LLM last:
- **Tier 0** static gates: `ng build --configuration production`, angular-eslint (replace dead tslint), `tsc --noEmit`, gitleaks (would catch the hardcoded FCM keys).
- **Tier 1** unit: migrate Karma/Jasmine → **Jest** + ng-mocks + @testing-library/angular.
- **Tier 2 (centerpiece)** integration vs the **Firebase Local Emulator Suite** with seeded fixtures — **ATC is fenced by construction** (its collections simply aren't seeded; test users incl. admin live in the emulator/`starlabs-test`, never prod).
- **Tier 3** browser E2E: **Playwright**, with external SDKs stubbed via route interception; live-media flows = mount-and-stub smoke only.
- **Tier 4** contract tests for external seams.
- **Tier 6** LLM verification: a Claude headless job (semantic diff review, test-gap mining), non-blocking at first.
- **Endgame:** self-healing loop — on failure, an AI routine writes a regression test, fixes, re-runs the pyramid, opens a PR for human approval.
- Gate the existing deploy job behind all of the above.

## Cross-references
- Inventory ground truth → `2026-06-02-inventory-validation.md`
- Trust set → `2026-06-02-data-reliability-classification.md` + `specs/data-reliability.md`
- CI-exclusion boundary → `2026-06-02-operator-screen-collection-map.md` + `specs/operator-screens.md`
- Security task spawned: hardcoded FCM legacy server keys (`authguard.service.ts:186,188`) + Zoom SDK key in client source.
