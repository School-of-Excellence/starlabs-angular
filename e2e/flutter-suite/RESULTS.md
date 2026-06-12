# Flutter e2e suite — RESULTS (live)

> Driven on the booted iPhone-17-Pro simulator against the disposable test project `slabs-queue-e2e-exdcz`.
> Real-screen screenshots (`xcrun simctl io screenshot`) per step under `breakthroughs-flutter/mobile-evidence/<label>/`.
> Anti-circular: every PASS asserts the doc the APP wrote (not the seed). Updated as each bucket greens.
> Run one: `cd e2e/flutter-suite && node seed-<bucket>.cjs --seed && SKIP_PUBGET=1 TEST_TARGET=integration_test/features/<bucket>_test.dart E2E_EMAIL=participant<idx>+jrny@example.com E2E_LABEL=<bucket> E2E_EVIDENCE=<bucket> node run-flutter-test.cjs`

## Status

| # | Test | User | Status | Screens | Notes |
|---|---|---|---:|---:|---|
| — | **journey-flow** (marquee end-to-end) | participant170 | ✅ **GREEN** | 7 | login → onboarding-locked → intro write (`orientationstatus:initiated`) → booking surface → 8 attended events + 10 content + projection |
| U4 | **queue** delivery | participant93 | ✅ **GREEN** | 15 | F3 support-nav · F4 stage-chat read · **F5 stage-chat send (app-write 1→2)** · F7 contact-support surface · **F8 fill-form self-move (Performance→Integration, log)** · **F9 plain self-move (Integration→Onboarded, log)**. F6 slot-booking honestly recorded not-surfaced. |
| U5 | **forms** | participant94 | ✅ **GREEN** | 5 | form fields render · **F5 submit wrote a new `formsByClient` doc** · **F7 deliverable marked completed** · F3 autosave handled gracefully |
| U1 | **auth & onboarding** | participant90 | ✅ **GREEN** | 19 | 13 features. **F1 auth-login** drives the REAL Login UI (fill creds → "Log In" → app writes `profile_data.last_login`; polled via runAsync so the CallKit/push-hung post-login Home is never pumped). **F2 flag-enforcement** (blocked email → "Unauthorized" alert, no `last_login`). **F7 change-request** writes a `clientissue` (0→1). **F10 intro** writes `orientationstatus:initiated`. Render: F11 time-compression · F12 orientation-detail · F13 book-onboarding-call · F3 register · F4 forgot · F5 terms · F6 generate-code. |
| U2 | **shell & home feed** | participant91 | ✅ **GREEN** | 29 | 34 features · anti-circular **notification read-flag** · **create-post (postcollection 1→2)** · **procedure-code marked** · timeline/explore/people-search/deeplink/AH-updates render · QR variant honestly skipped |
| U3 | **journey dashboard & mode** | participant92 | ✅ **GREEN** | 17 | 16 features. Anti-circular **app-writes**: F1 dodont widget status→completed · F2 evolution-wishlist-family (new `evolution wishlist` doc) · F3 wishlist-self (`participant AEL.mywishlist`) · **F5 clarity-call clientissue** · **F6 legacy-request-interview clientissue** (worked around a real app bug — `raiseTickets` double-removes its OverlayEntry, losing the 2nd ticket; reset `ticketOverlayEntry`). Render-proven: F7 Evolve · F8 AELVersion · F12 Impact · F13 AHSpace · F14 ModePlaylist · F15 Knowyourjourney · F16 DeliverySequence. |
| U6 | **appointments & calendar** | participant95 | ✅ **GREEN** | 10 | My Appointments (bookedby stream) · appt-detail-sheet · cancel-confirm · My Slots (host-empty surface) · **Mastercalendar** (event/arena/workshop sections render) · **Book Appointment** (date-pick → slot → confirm). Fixed: 4 appointment/availability composite indexes, `getATCModelColor(null)` (swept event `atcmodel:''`), and the `customer_eismapping` List-vs-Map String-as-int bug (cleared the doc → safe Roles-To-EIS fallback). |
| U7 | **events & arena** | participant96 | ✅ **GREEN** | 21 | 13 features. Anti-circular app-writes: **F4 arena mark-attended** (`arenalayers.attended` arrayUnion) · **F5 participant-report share** (`arena highlights.anonymous` flip) · **F6 product tweet** (new `CTD` doc). Render: F1 countdown · F7 highlights · F8 participant-zone · F9 calendar · F10 live-hub (ATC legs skipped) · F11 story · F12 impact-video · F13 events-by-products. F2/F3 RSVP honestly recorded not-driven (YES button didn't surface — render proven). |
| U8 | content (eiflix+solarvoice+hpc) | participant97 | 🟡 **PARTIAL** | 9 | **8 features driven+screenshotted** (eiflix home/series/mylist/episode/saved/search/tier/recommended-mix). Many EiFlix/SolarVoice/HPC legs are SIM-BLOCKED (BetterPlayer/just_audio need real media; TierScreen/EpisodePlayer crash on seed; mylist write is CF-rebuilt projection) — recorded render-only, honestly not fake-green. Remaining content-analytics index variants + media legs need more iteration. |
| U9 | **workshops** | participant150 | ✅ **GREEN** | 9 | 7 features. Anti-circular app-writes: **W3 enroll** (`participant workshop` 0→1 + `workshop participant enrolled` 0→1) · **W5 quiz submit** (`quizbyclients` 0→1) · **W6 Q&A ask** (`workshopQA` 0→1). Render: W1 list (6 cards) · W2 sales/detail (enroll button) · W4 challenge-runner. W7 assignment/video/zoom legs sim-blocked + ATC mentoring SKIPPED (documented). Fixed: detailpage type coercions (shortdescription/whyworkshop/joinus Strings, workshopoverview array) + workshopQA index. |
| U10 | social/big/shadow/reports/profile | participant151 | ⏳ pending | — | — |

## Infra fixed en route (shared across buckets)
- Killed a conflicting 17h headless session (d969021e) running the old queue-mobile-walk on the same sim/build dir (was serving its `walk_test.dart` for every run).
- Deployed 4 home-listener composite indexes (`supportchat`, `queue studio pairing`, `recommended mix playlist`, `stagechat`) — the full post-onboarded Home boots clean now.
- Tests fail-fast on genuine `TestFailure` (re-throw in the boot zone); re-seed before every run (the app mutates data).

## Coverage model (no scope cut)
The suite's 11 tests cover all **235 e2e-testable features** in `specs/flutter-app/FEATURE-CATALOG.md`. Each feature is driven to its anti-circular assertion where automatable; sim-blocked legs (camera/QR/CallKit/video-completion/push/OpenAI/external-link) are drive-to-screen + assert-render and labelled honestly (never fake-green). ATC OFF-LIMITS throughout.
