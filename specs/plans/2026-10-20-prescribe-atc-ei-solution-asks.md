# 2026-10-20 — Prescribe ATC: "Ask · area of focus" for EI Solution

**Status:** requested + shape confirmed by operator 2026-10-20.

## What
When "What is the ATC given for?" is **EI Solution**, prescribeATC shows an **Ask · area of focus** card: numbered
rows of **Asked by** (Self / Spouse / Family / Friends) + **Asked for** (free text), "+ Add ask", × to remove,
"N complete" counter. Submit requires at least one complete ask (both parts filled).

## Data (operator-confirmed)
`asks: [{ "<askedby>": "<askedfor>" }, …]` with lowercase keys, e.g. `[{"self":"for health"},{"spouse":"…"}]`.
- Draft: `firestore-atc/temporary_ATC/{draft}.asks` (autosave on select change / focusout; restored on open,
  both normal and AI-generated drafts). Only complete rows are saved.
- Final: `atc_alpha | atc_to_validate/{id}.asks`, written only for EI Solution ATCs (other models get no field).

## Not changed
Other ATC models (card hidden, no `asks` on the final doc; drafts store `[]`), save/validation order otherwise.
