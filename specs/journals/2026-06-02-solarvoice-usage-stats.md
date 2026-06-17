# 2026-06-02 — SolarVoice production usage stats (urgent, cross-project)

**Headline:** Pulled exact SolarVoice consumption from production (read-only) for another project: **119,909 listens · 1,463 unique listeners · 26,153.6 listening-hours · Aug 2023 → Jun 2026.** The key lesson — *for "is X tracked?" questions, query the data, don't grep the code.*

## Context / why
Another project urgently needed SolarVoice usage. A code-only exploration agent had concluded "SolarVoice has NO usage tracking." That was wrong.

## What we did
Stood up a read-only `firebase-admin` harness (`~/Downloads/svstats/`) against the prod service account, with a hard ATC denylist baked in. Discovered usage IS tracked in the **`content analytics`** collection where **`type == "solarvoice"`** (and `from == "solarvoice"`), via fields `profileid`, `playlistid`, `videoid`, `totaltimespend` (seconds), `logdate`. Streamed all 119,909 matching events and aggregated.

## Findings
- Catalog: **49 audio tracks, 56 playlists** (39 audios / 55 playlists have plays).
- **119,909 listens** (≈43% of all 278,228 content-analytics events) · **1,463 listeners** · **26,153.6 hrs** · avg **785 s (~13 min)/listen** · **82 listens/listener** · range **2023-08-29 → 2026-06-02**.
- Growth: 2023 ~5.4k → 2024 ~21k → 2025 ~55k → 2026 (5 mo) ~38k events; MAU ~150 → 400–459.
- Top tracks: GONG Trance Induction (12,765), Crossover (12,627), Integrated Life Outcomes (10,545).
- Completion status sparsely recorded (~24%); time-spent recorded on ~100% → use time, not completion.

## Surprise / WHY it matters
The "no tracking" claim came from reading components only; SolarVoice consumption is logged centrally in `content analytics`, not in the SolarVoice components. This is why we now treat data questions as data queries. Saved to memory as `solarvoice-usage-location`.

## Artifacts
`./2026-06-02-solarvoice-usage-stats-artifacts/`: `solarvoice_usage_summary.json`, `solarvoice_monthly.csv` (full 35-month series), `solarvoice_top_audios.csv`. Harness scripts in `~/Downloads/svstats/` (`discover.js`, `probe.js`, `aggregate.js`).
