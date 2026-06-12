# Phase 2 — BigQuery analyzes (funnel + show-up trends over time)

Firestore can't do GROUP BY / joins / time-series, so analytics ("is show-up improving?",
funnel conversion across events, cohort views) belong in BigQuery. This is a **deploy kit** —
you stand it up with your Firebase/GCP access; there's no app code involved.

## 1. Stream Firestore → BigQuery

Install the official extension **once per collection** you want to analyze (Firebase console →
Extensions → *Stream Firestore to BigQuery* / `firebase/firestore-bigquery-export`):

| Collection | Why |
|---|---|
| `event_stats` | the funnel counts per event — the spine of every dashboard |
| `event participation request` | granular per-person funnel (requested → approved → attended/no-show) |
| `arena e-ticket log` | scan-based attendance |
| `arena events`, `event collection`, `queue generation` | event names + dates to slice by |

Each install creates `{dataset}.{collection}_raw_changelog` (every write, timestamped — this
**is** your audit history; "the numbers at finalize" is just a point-in-time query, no freezing).
Run the extension's `gen-schema-views` once, or use the `_raw_latest` view it maintains.

## 2. Build the derived tables

Put `derived_tables.sql` into **Dataform** (recommended — version-controlled, scheduled) or as
**scheduled queries**. Replace `__DATASET__` with your dataset. It produces:

- `event_funnel` — one row per event: potential → requested → eligible → approved → attended →
  no-show, plus `showup_rate` (attended ÷ approved — the metric we corrected), `eligibility_rate`,
  `approval_rate`, with the event date.
- `showup_trend` — show-up rate per month, the "is it improving?" series for the JE team.
- `revival_gap` — approved-vs-eligible drift per event (the sales/JC revival signal you described).

## 3. Dashboard

Point **Looker Studio** (free, native to BigQuery) at `event_funnel` / `showup_trend`. A line chart
of `showup_trend.showup_rate` by month is the JE team's headline. Schedule the Dataform tables and
the dashboards refresh on their own — **zero load on Firestore**.

## Notes

- The streaming extension has a small per-write cost; for high-write collections it's still far
  cheaper than the read-amplification it removes from the app.
- Keep the `showup_rate` definition (attended ÷ approved) identical here and in the app/rollup so
  the dashboard and the screen never disagree.
