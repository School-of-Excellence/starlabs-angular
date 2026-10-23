# 2026-10-23 — Prescribe ATC: WiSH outcomes + WiSH directive UI (operator-approved)

Source: WiSH prototype https://claude.ai/artifact/Kw4Nz2NwXRjvpjyTwEKbxN (Prescribe step).

1. **Order:** ATC directive first, then Ask (EI Solution) or WiSH outcomes — for both models.
2. **WiSH outcomes card** (WiSH only, `product.toLowerCase() == "wish"`): "WiSH outcomes", note "One row per outcome
   area. At least one is required; empty rows are dropped.", "N filled". Rows: No. (01…) · Outcome area
   (placeholder "Area to cover" — operator edit; the prototype said "Wish Super Peace of Mind") · Outcomes expected ("What the participant expects, with dates") · ×.
   Five empty rows by default; "+ Add outcome area"; removing the last row clears it (one row stays, like Ask).
3. **Field `outcomes`**, rows `{ outcomearea, outcomeexpected }` (the 10-11 plan's names). Draft: every row; final
   ATC: complete rows only, WiSH only. Submit blocks a half-filled row or no complete row (checked right after the
   author check, like Ask). Checklist "Add at least one complete WiSH outcome". Rows cleared after a normal submit.
4. **WiSH directive — UI only:** heading "Immediate outcome expected from WiSH" + "Elaborate with the participant's
   life situation."; empty state shows the prototype's example text (opens the same editor); button
   "Add/Edit Immediate Outcome"; checklist "Write the immediate outcome". Same editor, same `directive` field,
   same pre-fill from the ATC model.
5. Not included (not asked): per-adjustment Outcome box, "Appointment found" banner.
6. e2e paused by the operator; hooks `patc-outcome-card/count/area/expected/remove/add`,
   `patc-directive-placeholder` are in place for when it resumes.
