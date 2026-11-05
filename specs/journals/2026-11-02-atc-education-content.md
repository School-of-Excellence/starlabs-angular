# 2026-11-02 — ATC education content: decks, videos, manuals

## What was made
- **Decks** (private claude.ai pages, StarLabs Operations design system, screens-first; speaker notes = the video's
  voice line + one training tip):
  - The ATC update (all teams): https://claude.ai/artifact/RjSGyvgva9G83HyhkBsfHa — 17 slides incl. two submit-rule slides.
  - WiSH ATC Update: https://claude.ai/artifact/1zwCR5FBBSjktE217USUd8 — 14 slides.
  - EI Solution ATC Update: https://claude.ai/artifact/BvpoEMiBiqQ7DvFzc7BBKU — 14 slides (Ask, Review log).
- **Videos** (`~/Documents/atc-videos`, Remotion; animated recreations, no real people; Microsoft neural voice
  "Andrew" via edge-tts, +15% rate): `out/ATC-update.mp4` 1:55 · `out/WiSH-ATC-update.mp4` 1:33 ·
  `out/EI-Solution-ATC-update.mp4` 1:36. The first 7-min "All ATC" video was rejected (see below).
- **Manuals updated in place** (same links): WiSH https://claude.ai/artifact/2Z79mXkJJSL2imAuSvJXnW · EI
  https://claude.ai/artifact/Rw5tp9SQ5Zag8qUfNeqQWt — "New in this update", What Submit checks, three-part Forms card,
  optional sponsor forms, corrupted-chain message, troubleshooting; web screenshots re-captured from the emulator.

## Why it is shaped this way (operator)
- **No "what is ATC".** Teams and heads know it; explaining it reads as an insult. Screens first, under 2 minutes,
  energetic voice. Mac `say` voices were too flat; the operator picked Andrew from three neural samples.
- **"The ATC update", never "2 minutes"** in titles or narration.
- **Forms are examples; the sponsor form is optional** — said on every forms screen.
- **Submit rules come from the code** (`prescribe-atc.component.ts` `submitChecklist` / `submit()`): WiSH every
  procedure mandatory → brief always; EI ≥1 complete Ask; brief rule applies to EIS/admin/AH prescribers; validation is
  a choice, not a check.

## How the manual screenshots were re-made
- Kit: `2026-10-30-atc-user-manuals-artifacts/` + `seed-update.js` (Asha's purchase + 2 delivery answers, Rahul's
  queue + 1 queue answer, an optional "Sponsor Feedback" form on both models, sponsors Ravi Menon / Meera Iyer) and a
  `sponsor` capture step. `update_manuals.py` holds the text edits. Emulator only.
- Port 8080 was held by the iOS Simulator's Runner: emulator on 8181 with a scratch config; the gitignored
  `environment.emulator.ts` pointed there for the run and was restored (checksum bcd1a117…).
- Mobile screenshots were NOT re-taken (still the 30 Oct ones; still accurate). No sponsor card from the app — needs
  port 8080 free and the Flutter settings swap.

## Found
- **Sponsor dialog help text doesn't wrap** in the real app: "You can change the sponsor until the first sponsor
  form is sent." is clipped at the dialog edge (seen in `wish-sponsor-dialog.jpg`). Small CSS fix in
  `view-prescribed-atc.component.css` (`.sponsor-help`), not done yet.
- Remotion's downloaded headless shell crashes on this Mac (`icudtl.dat not found in bundle`); renders use the
  installed Google Chrome.

## Pending
- Operator: share the three decks, two manuals and three videos (all private).
- Sponsor dialog text wrap fix (app) — ask first.
- Optional: app screenshot of the sponsor card for the manuals.
