# 2026-11-19: Workshop dashboard, more (light) colour: options mockup

## Ask

The operator asked why the workshop dashboard can't have more colour, keeping everything in light colours.

## Why it looks the way it does

The 2026-11-17 "Heritage Ledger" redesign kept colour to the small icons, the progress bars and the money figure, on white cards. Several cards also share one colour: navy for Total Started, Existing Participants and Share Clicked, and grey for Not Started and New Users Not Enrolled.

That was a design choice, not a limit. Every card already carries its own `--tone`, so colour can be added in CSS alone, with no template or data change.

## Mockup (for sign-off, not ported)

`specs/journals/2026-11-19-workshop-dashboard-colour/workshop-dashboard-colour.html`, as plain HTML + CSS with no script. How it was built:

- It uses the **real** At a glance markup from the template, with sample numbers. Angular syntax was stripped by a scratch generator.
- It uses the real global sheets (Bootstrap 5 + `src/styles.css`) and the real dashboard CSS.
- A third style block holds the options.

The options:

- **Now:** today's screen, for comparison.
- **Shared by A, B and C:**
  - one distinct colour per card (blue, indigo, amber, green, slate, teal, sky, violet, rose, orange, red);
  - icon badges (the icon in a light tinted square);
  - a different colour for each Top tags row;
  - blue Joined recently bars.
- **A · Soft tiles:** each card washed in its own light colour, with a coloured top edge, and group headers tinted by group. The most colourful.
- **B · Colour bands:** white cards, light colour bands on the group headers, and numbers in the card colour.
- **C · Accent edges:** white cards with a coloured top edge. Closest to today.
- **D · All three (A + B + C):** added after the operator said "i like A, B and C". It has:
  - A's wash, a touch lighter (cards 5%, headline figures 9%→3%);
  - the full-colour top edge from A and C;
  - B's header bands and coloured numbers;
  - A's timeline gradient.
  It is shown second, right after Now.

## Checks

- Viewed at 1440px and 390px. At 390px nothing is wider than the screen.
- Light theme only. Every colour is a `color-mix` tint of the card's tone, with numbers dark (A, C) or a darkened tone (B, large text).

## Next

- The operator confirms D (or another option).
- Then the port: CSS in `workshop-dashboard.component.css`, plus a per-group class or `--grp` on the group sections, instead of the mockup's `nth-child` and `data-testid` selectors. The same treatment would then carry on to Journey, Challenges and the side panel.
- No hooks change, so the e2e tests should be unaffected. Re-run the dashboard e2e files after the port anyway.

## Decision and port (later on 2026-11-19)

- **The choice:** the operator said "go with D", and D was ported. Then, while it was being checked: "no no i dont want D i want A change this". **A · Soft tiles is what landed.** The D-only parts were removed: coloured numbers, header left edges, gradient bands. The plan file `specs/plans/2026-11-19-workshop-dashboard-colour-d.md` keeps its name but describes A.
- **What landed** (uncommitted; the operator commits). All of it is in `workshop-dashboard.component.css` section **8) Colour, option A**, plus `--tone` / colour classes in the template and a `panelTone` getter in the TS:
  - **Tokens:** `--gl-*` gives one colour per At a glance card, and `--hue-*` gives each band an ink and a background. Existing token values were not changed, because Journey, the pills and the panel use them.
  - **Cards:**
    - headline figures have an 11%→4% wash and a full-colour 3px top edge;
    - the other cards have a 7% wash and a softer (75%) top edge;
    - Joined recently and Top tags have a 6% wash and no edge;
    - icons sit in 28px badges;
    - numbers stay dark and zeros grey.
  - **Group and section headers:**
    - group headers (`wdx-grp--*`) and section headers (`wdx-sh--*`) get a flat tint;
    - group names are coloured, section titles stay dark.
  - **Side panel:** the header is tinted with the colour of the card that opened it. Top tags clicks give teal. The tone is kept while the panel slides shut.
  - **Narrow cells:** a cell narrower than 134px falls back to the plain icon (`wdxcell` container), because the badge split "Participants" mid-word.
- **Why the extra rules exist** (all from the review and the screenshots):
  - **Contrast:** on the washes, small grey `--t3` text fell under 4.5:1. That was "Open list", the group note, the timeline dates, the Joined axis labels and the Filter label. These now use `--t2`, at 5.07:1 or more.
  - **Focus ring:** it now sits 5px inside the card, because the 3px top edge hid its top side.
  - **Three-figure hero at 800px or narrower:** the last figure spans the row, because the empty grid slot showed as a white hole beside the washed tiles.
  - **Phone bottom sheet (390px):** the grab handle is absolutely positioned, so the header tint reaches the sheet's rounded top.
  - **Journey:** the day strip got 16px of top padding under its band.
  - **Disabled header tools:** these are a faded white on tinted headers, not a grey slab.
  - **Share Claimed:** its colour moved from khaki to gold.
- **Checks:**
  - production build exit 0, with the same 36 warnings, all from other files;
  - real-app screenshots on the emulator at 1880, 1440, 1150, 800 and 390, compared side by side with the mockup's A;
  - all 13 dashboard e2e files: 107/0/0;
  - readiness gate MATCHED (188/188 hooks);
  - no hook or text changes.
- **Left as is (pre-existing, not caused by A):**
  - the app toolbar overflows at 390px (PROGRESS item 8);
  - the "Running" pill is at 4.49:1, from the shared `--success` tokens;
  - the amber icon badges are under 3:1, but they are decorative and identical to the mockup.
- **Surprises:**
  - The first run was stopped mid-way, and the session ended during the second.
  - The scratchpad was wiped, so the server and runner scripts were rewritten.
  - The first rewrite of the up script saved the subshell pids instead of the process groups, so the stop script missed them. The finish stage stopped the right groups by hand. The script is now fixed (`( cd … && exec perl setsid … ) &`).
  - Killing the emulator left the cloud-function repo's `functions/package.json` pointing at `index.emulator.js`. It was restored with `git checkout` in that repo, which is now clean.
