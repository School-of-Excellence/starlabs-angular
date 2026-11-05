# 2026-10-30 — WiSH and EI Solution ATC user manuals

Two user manuals, published as private claude.ai pages (share them from each page's Share menu):
- **WiSH ATC:** https://claude.ai/artifact/2Z79mXkJJSL2imAuSvJXnW
- **EI Solution ATC:** https://claude.ai/artifact/Rw5tp9SQ5Zag8qUfNeqQWt

Each covers: how the ATC works, the one-time setup (Delivery Activities → BIG Activity → ATC Model → Map Appointment
Role), Prescribe, View Prescribed ATC, Forms, the Review log (EI only), Edit, the participant app, and
troubleshooting. Screenshots: 34 per manual, web and app. Written against `atc-development` at `1bb069e8`.

The build kit is in `2026-10-30-atc-user-manuals-artifacts/`. Re-run it when the screens change.

## Why it was done this way
- **Format: shareable web pages.** The operator picked this over PDF or Word.
- **Screenshots come from the emulator only, with a fictional demo world.** The operator said to check the emulator
  data first. The hub's atc seed works, but its names read like tests ("WiSH directive atc"). So
  `seed-manual-demo.js` writes a small demo world tagged `testrunid: manual`:
  - Kavya Rao is the specialist and admin; Rohan Das and Vikram Nair are the collaborators; Sanjay Kulkarni is the
    validator.
  - Asha Menon has a saved WiSH ATC and Rahul Verma a saved EI ATC. Neha Kapoor and Arjun Pillai are for the
    Prescribe walk-throughs.
  - It adds two appointment mappings, three forms, model images in the storage emulator, and a reviewlog.

  It has the same emulator-only guard as `seed-atc.js`. No real database was touched.
- **Mobile shots: the Flutter app ran on the iOS simulator against the emulator.** The operator approved swapping
  the two gitignored Firebase settings files for this.
  - Both files were backed up and restored. Their checksums match the originals.
  - A temporary integration test (copied here as `zz_manual_screens_test.dart`) printed `CAP marker:` lines.
    `run-mobile.sh` turned each line into an `xcrun simctl io screenshot`.
  - The test file was deleted from the Flutter repo afterwards. That repo shows no new changes.
- **The manuals describe the code as shipped, not the 2026-10-11 plan.** Checked against the code:
  - **No `widgets`:** a model is WiSH / EI Solution only by its name.
  - **Saved keys** are `outcomes` / `ask`.
  - **No alert** when the appointment lookup finds nothing.
  - **WiSH:** Awareness / Potential Years are still required. Only "Directives for Micro ATC" is hidden.
  - **"Asked by"** includes Sponsors.

## Findings worth knowing
- **Flutter debug overflow.** "Morning breathing practice (Mandatory)" overflows the procedure row by 2.2 px in the
  participant ATC screen. A debug build shows the yellow stripe. Real, but tiny and pre-existing. For the
  screenshots, the demo procedures were renamed shorter instead.
- **Dummy settings for the iOS simulator.**
  - The native Firebase SDK rejects a dummy API key unless it is 39 characters and starts with "A". With any other
    key the app crashes at launch (`com.firebase.installations`).
  - `AIzaSy` + 33 × `A` works.
  - Use this when rebuilding the Task 3 runner.
- **The app home crashes without `static meta data/HPC Config`.** `homeContent.dart:675` null-checks `hpcConfig`
  before it exists. The emulator seed needs `{awards: {}}`.
- **Notification prompt.** Each `flutter drive` run brings back the iOS "Allow notifications" alert, and it covers
  the screen. It was dismissed by hand ("Don't Allow") through the simulator tool after the test started.
  `simctl privacy` cannot grant notifications.
- **The Edit ATC route type is `alpha` / `validation`, not the collection name.**
- **Asha's Life Report was submitted end-to-end from the app.** The web Forms card then flipped to
  "Submitted · Filled by the participant", which confirms the app → web loop on the emulator.

## Pending
- The operator reviews both manuals, then shares them.
- The 2.2 px procedure-row overflow in the Flutter ATC screen: fix it if wanted.
- Re-run the kit when screens change. Steps: seed (`seed-manual-demo.js` + `seed-extra.js`), `capture-web.js`,
  `run-mobile.sh` with the settings swap, `process.py`, then `gen.py`. The paths inside point at the session
  scratchpad, so adjust them.
