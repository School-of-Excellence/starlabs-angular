# Workshop dashboard: light colour, option A "Soft tiles" (2026-11-19)

**Switched to A.** The operator first chose **D** ("go with D"), then during the port said "no no i dont want D i want A change this". So the dashboard follows **A · Soft tiles**. Everything below is A; the D-only parts (coloured numbers, header left edges, gradient bands) were removed. Mockup: `specs/journals/2026-11-19-workshop-dashboard-colour/workshop-dashboard-colour.html`. The journal is `specs/journals/2026-11-19-workshop-dashboard-colour.md`.

## At a glance (exactly as the mockup's A)

- **One colour per card.** New tokens are added on `.wdx-root`. Existing token values do **not** change, because Journey, the pills and the panel use them. The At a glance cards' inline `--tone` switches to the new tokens:

  | Card | Colour | Card | Colour |
  |---|---|---|---|
  | Total Enrolled | blue `#2456a6` | Existing Participants | sky `#0b78b8` |
  | Average Progress | indigo `#5b4bd6` | New Users | violet `#6d45dc` |
  | Completion Rate | amber `#c97a08` | New Users Not Enrolled | rose `#c93d6e` |
  | Sale Achieved | green `#0c8a5f` | Not in Chat Group | orange `#d0620f` |
  | Total Started | blue `#1f6fd1` | Started but stuck | amber `#c27c06` |
  | Not Started | slate `#6b7891` | Inactive for 3+ days | red `#cf3f3f` |
  | Active | teal `#0e8a80` | Joined recently | blue `#2f6fe0` |
  | Completed | green `#2a9457` | Top tags | teal `#0e8a80` |

  The category-based and evergreen cards get matching distinct colours too.
- **Cards:**
  - a light wash of their own colour (cards 7%, headline figures 11%→4%, Joined recently and Top tags 6%);
  - a 3px top edge (full colour on the headline figures, a softer 75% mix on the cells, none on Joined recently and Top tags);
  - hover a little stronger;
  - the gold mark on Total Enrolled goes, because the edge replaces it.
- **Icons** sit in a 28px badge tinted with the card colour.
- **Numbers stay dark**, as today. The zero states stay grey, and the loading and "—" states are unchanged.
- **Group headers** are tinted flat in the group colour, with the group name in that colour:
  - Participation: blue;
  - People: violet;
  - Needs attention: amber;
  - category-based layout and Referral: their own colours.
  - Set by a `wdx-grp--*` class, not by position.
- **Timeline:** a light blue→violet→green wash, and a blue→violet fill for a running workshop. A finished workshop's fill stays grey.
- **Joined recently** bars are blue.
- **Top tags:** each row has its own colour (blue, violet, teal, amber, rose, repeating).

## The rest of the dashboard (the same language, lighter)

- **Section headers.** Each section's header is tinted flat in its own colour. The title stays dark:

  | Section | Colour | Section | Colour |
  |---|---|---|---|
  | Participant Journey | violet | All Assignments | amber |
  | Challenge Progress Overview | teal | All Forms | rose |
  | Participant Progress Details | blue | All VideoAsk | indigo |
  | Participant Data | sky | Platform Usage | green |

- **Side panel:** its header is tinted with the colour of the card that opened it; otherwise blue.
- **Unchanged:** existing coloured pills, bars, tags and states.

## Rules

- **CSS-only in spirit.** Template changes are limited to `--tone` values and `wdx-grp--*` / section colour classes.
- **No hook changes:** no new `data-testid` and no removed one. No TS logic change, unless the side panel needs a tone value.
- **Scoped and safe:** every selector has a `wdx-` prefix, there are no Bootstrap class names, and the theme stays white/light.
- **Contrast:** small coloured text is at least 4.5:1 on its band; large numbers at least 3:1.
- **Responsive:** nothing is wider than the screen at 390px.

## Verify

- Production build.
- Screenshots from the real app on the emulator, with seeded data, at 1880, 1440, 1150 and 390px: At a glance, every section, and the side panel.
- All 13 `workshop-dashboard*` e2e files, and the readiness gate.
