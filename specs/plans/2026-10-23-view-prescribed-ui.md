# 2026-10-23 — View Prescribed ATC: prototype UI (operator-approved: "all recommended … don't remove anything")

UI only. Nothing on the current screen is removed; no function changes; every data-testid kept.

1. Header: "Prescribed ATC" title + one-line subtitle; Export to Excel on the right (existing button).
2. Filter card: one white card, 40px fields; ALL current filters stay (Author, ATC model, Participant, Queue, Mentor,
   Prescribed date, ATC count operator + count, Clear).
3. Summary strip: one card, groups split by thin dividers; ALL current figures stay.
4. ATC card: No. · Participant · model tag · date · status tag · version buttons + last edit; key–value grid
   (activities → names, "ATC directive" / "Immediate outcome" for WiSH); participant photo on the right; buttons
   View/Close full ATC, Edit ATC, Mark as Validated. Product edit (developer/tester) and print stay.
5. Expanded: cards — Ask / WiSH outcomes, bulk change agent box, "Adjustments and procedures" (existing view + edit
   controls, restyled), notes.
6. Every model gets the look; template sections only where present. Text sizes unchanged (spacing / layout / colour
   only). Not built: Forms card/filter, Review log, Forms missing / Reviews figures. Procedure editing: the existing
   controls restyled in place (no new segmented control).
