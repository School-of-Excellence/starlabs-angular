# Journals

This directory holds **narrative journals** that capture WHY decisions landed. They are the companion to `../plans/` — plans tell WHAT, journals tell WHY.

## Convention

- Filename: `YYYY-MM-DD-topic.md` (use the date the work was done)
- No fixed structure — write the story
- Include operator pushback, alternatives explored, empirical proofs
- Append-only — never rewrite history

## When to write one

- After landing a load-bearing architectural change
- After a multi-rev iteration (capture the WHY of each rev)
- After an incident that taught the team something
- Weekly synthesis (one journal summarizing the week's notable changes)
- **End of every session** — this project journals after every session (operator directive, 2026-06-02), even for non-architectural work

## Reading order

Always pair with the corresponding plan. Reading the plan alone is incomplete — the journal is where the *reasoning* lives, including dead-end paths and rejected approaches.

## What makes a good journal

- **Specific** — names, dates, file paths, commit SHAs
- **Honest** — what didn't work, what surprised us
- **Future-facing** — a contributor 6 months from now should understand the constraints
- **Linked** — references the plan, the relevant code, the relevant ADR

## What to avoid

- Marketing prose ("we delivered an amazing improvement")
- Summary-only journals (the WHY has to be there, not just the WHAT)
- Journals that duplicate the plan instead of complementing it
