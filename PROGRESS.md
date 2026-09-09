# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-09-09 (workshop configuration v2: hints, guide, new settings, editor fixes)_
· **New session? Read `specs/ORIENTATION.md` first**, then the journals below.
⚠️ `/specs` is gitignored (`.gitignore:8`) — the journals and HTML mockups exist only on this machine.

Journals for this work, newest first:
`specs/journals/2026-09-09-richtext-toolbar-and-headings.md` ·
`2026-09-04-workshop-config-hints-and-guide.md` (also carries the 09-09 entries) ·
`2026-09-04-eiflix-popup-banner.md` · `2026-09-04-workshop-enroll-diagnostics.md` ·
`2026-09-02-workshopconfig-v2-enrollment-design.md` (the full v2 story).

## Current state
- Branch `nanda-development`. **UNCOMMITTED**: 11 modified files (the three
  `workshop-configurationv2` tabs, `wc2-help.ts`, `wc2-shared.css`, the popup banner,
  `src/styles.css`) plus one new file, `workshop-configurationv2/wc2-editor.ts`.
  Earlier work in this line was committed by the operator mid-session. NOT pushed.
- `/workshopconfig/:id` (v2) is the live editor; the legacy screen stays at
  `/workshopconfigold/:id`. Enrollment, Challenges and Settings all carry per-field
  hints written from the EiFlix Flutter app.
- Settings now writes **55** root fields (was 53): `eiflixmobileactive` and
  `heroeiflixmobile` were added on request.
- Dev + production builds green. **Nothing in this line has been verified at runtime** —
  the screens are behind login.

## Last session changes (2026-09-09 and the days before it)
- **Field hints + configuration guide.** 160 fields traced read-only through
  `/Users/nanda/Documents/Development/workshop`, each hint checked by a verifier (132
  corrected). Headline finding: **29 settings are dead** — nothing in the user app reads
  them. The guide has a narrative half and an "Every setting" reference with a
  "does nothing today" filter. **The Guide button is currently commented out** at the
  operator's request; uncommenting one block in the configuration header restores it.
- **Two new settings**, both requested and both with the same caveat: *nothing in the
  Flutter app reads them yet*. `eiflixmobileactive` (workshop in the EiFlix mobile app)
  and `heroeiflixmobile` (hero banner in that app). The hero group now has three switches
  of which only the web one demonstrably works — worth settling with the app team.
- **Enrollment diagnostics** on `/workshop_dashboard/:id` — a Diagnose dialog that replays
  every enroll gate for one profile (by profileid **or** email) and explains the outcome.
- **EiFlix popup banner editor** on `/workshops`, editing `classify/eiflixpopupbanner`.
- **Bugs fixed, each with the cause recorded in the journals:** a global Bootstrap `.row`
  collision that stretched the header badge; an `*ngFor` identity churn that made the guide
  nav unclickable; rail clicks needing two tries (expand-then-scroll in one tick, fixed on
  all three rails); the Schedule row broken by my own hint rollout, plus a clipped time
  dropdown; and the rich-text editors — h1–h6 everywhere, a **Normal** button to undo a
  heading (the library had no way back), and the full toolbar.

## Pending
- **Operator runtime pass — nothing here has run.** Highest value first: save Settings and
  confirm the two new toggles round-trip; open the Diagnose dialog on a known-refused
  profile and one by email; save the popup banner and reopen it; apply a heading then press
  Normal; click through each rail once.
- **Decide the mobile flags** with the app team — three hero switches and two workshop-level
  ones, most unread today.
- **Decide whether to hide the 29 dead settings** from the screen instead of only labelling
  them, and whether to re-enable the Guide button.
- Carried: D1 (evergreen disabled-children quirk); retire `/workshopconfigold` after the
  pass; `/eiflixhomeconfig` + `/videodashboard` visual pass; eiflix consumers/backfills.
