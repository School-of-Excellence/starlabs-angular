# 2026-10-12 — EiFlix ops dashboard: date range on the Users cards

Operator ask: Today / 7D / 30D **and** a From–To range over the Users section, with **Total New Users**
filtered on the signup date and **New Users to Paid** on the move date.

Files: `eiflixoperationsdashboard.component.{ts,html}` · `eiflixoperationsdashboard.logs.spec.ts`
Hub: `workshops/eiflix-ops-dashboard.spec.ts` (WS-58) · `workshops/support/wshop.ts`

---

## 1. Why the default is "All", not "Today"

Every other range control on this dashboard defaults to Today. These cards must not.

They are **headline totals** — "Total New Users" has always meant every signup, and the operator reads
that number daily. Defaulting to a window would silently rewrite it (from thousands to single digits)
with no action from anyone. So `usersRange` starts at `'all'`, and `'all'` is also what Clear returns
to. Today / 7D / 30D / From–To narrow on request.

This also keeps **WS-30** honest: it asserts the card is ≥ the independently-counted seeded
population, whose rows are 1–3 days old. A Today default would have failed it — and the failure would
have looked like a regression rather than a deliberate redefinition.

## 2. The trap worth knowing: where the move date is read from

`rebuildPaidCard` renders each row from **participant metadata** when a twin exists
(`const src = pm || nud`) and falls back to the new-user document otherwise. That is deliberate and
predates this change — the paid card shows the person's full profile and journey.

The move date lives **only on the new-user document**. Reading it off `src` would therefore drop
*everybody who has a full profile* the moment a range was applied — the better-known customers would
vanish first, and the card would still look plausible. The filter reads `nud['movedon']` explicitly,
with a comment saying why, and a unit case (`paidWithPm`) seeds a metadata twin carrying no move date
so the row must survive Today on the strength of the new-user doc alone.

## 3. Other decisions

- **Zero Firestore reads per range change.** `new_user_data` is already a full realtime listener, so
  the raw docs are kept in `nudDocs` and every range change re-buckets in memory. Same principle as
  the EiFlix Report counting off `logAll`.
- **The window is computed once per rebuild**, not per row, and passed down to `inUsersWindow`.
- **Undated rows drop out while a range is active** and are kept when there is none — a row with no
  date cannot be placed in any window. Consequence: a profile flagged as moved but with no move date
  is invisible under every window and visible under All, so the two can differ by more than the
  window alone. Correct, but surprising if you have not read this.
- **B!G Participants is not filtered** — it comes from `participant metadata` and has no comparable
  date. Its caption says `· not date-filtered` while a range is active, because three numbers side by
  side under one range control otherwise look like they answer the same question.
- **A half-filled From–To reads as unfiltered** rather than filtering on one bound, and the existing
  "Pick both dates to apply the range" hint appears. Mirrors Engagement exactly — the markup reuses
  `.eod-seg` / `.eod-datefield` / `.eod-clear`, so there is **no new CSS**.
- **Reversed picks are tolerated** (earlier date wins as the start), again copying Engagement.

## 4. Coverage

- **Unit, 9 cases** (78/78 in the spec): the two fields filtering independently, the `paidWithPm`
  trap, undated rows, custom range incl. reversed and half-filled, caption transitions, and the range
  surviving a realtime emission.
- **WS-58** drives all seven new hooks against the real dashboard. The seed makes the two fields
  **disagree** — NU_C signed up 3 days ago and moved across today — so a card filtering on the wrong
  field shows a wrong number, not merely a smaller one. Every expected value is an Admin-SDK count
  over the whole collection (WS-54's lesson) and every read is polled (WS-30's lesson: the cards
  animate and the listeners settle after first paint).
- New oracles deliberately do **not** reuse `reportWindow()`: the Report's 7D starts at today−6 while
  this range (like Engagement) starts at today−7. Borrowing it would have made the oracle agree with
  a bug.
