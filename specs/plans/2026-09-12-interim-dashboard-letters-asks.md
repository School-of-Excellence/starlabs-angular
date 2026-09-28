# Plan — Interim Report Dashboard: real data for Love Letter + Asks
Approved by operator 2026-09-12. Follows `2026-09-12-interim-dashboard-evolution.md`.

## Data (read-only — the dashboard writes nothing)
| Collection | Query | Used for |
|---|---|---|
| `love letter` | `interimlogid in [...]` chunks of 30, latest per log | `loveletter` text + tags |
| `ask AH` | same | `askah`, `installationaskah` text + tags |

Tags are the same booleans the Love Letter / Ask A&H tabs toggle: Happy `liked`, Needs Attention `tagged`, Opportunity `opportunity`, Critical `critical`, Resolved `resolved` (+ `resolveddetails.user` / `.time`).

## Rules
| Part | Rule |
|---|---|
| Wrote a love letter | members with a `love letter` doc that has text (section pool: ongoing or submitted) |
| Untagged / Happy / Needs Attention / Opportunity / Critical | letters with none of the four / each tag (a letter can count under several) |
| Sent to Journey Coaching | **Needs Attention count + Critical count** (a letter with both counts twice — operator choice) |
| Open / Resolved | same per-tag sum, split by `resolved` → Open + Resolved = Sent to JC |
| In progress | placeholder ("—") |
| Resolved by | `resolveddetails.user` → profile name, over the JC letters |
| Installation Ask / Ask A&H | docs with `installationaskah` / `askah` text — counts only (operator choice) |
| Replied / waiting | placeholder, no reply writing |
| Lists | member, text, tags (read-only), resolved by / when |
| By participant | Love letter column = real tags; Asks column = Inst / A&H; detail = letter + asks text with tags |
| Design's coach notes / status / move / reply controls | not rendered (no data behind them) |
