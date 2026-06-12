-- Phase 2 derived analytics for Event Participation Confirmations.
-- Source: firestore-bigquery-export changelog/_raw_latest views (one per streamed collection).
-- Replace __DATASET__ with your BigQuery dataset (e.g. `starlabs-test.firestore_export`).
-- Run in Dataform or as scheduled queries. The _raw_latest views expose the latest doc per id
-- with `data` as a JSON string; we parse the fields we need.

-- ── 1) Per-event funnel (the spine) ───────────────────────────────────────────
CREATE OR REPLACE VIEW `__DATASET__.event_funnel` AS
WITH stats AS (
  SELECT document_id AS arenaeventid, PARSE_JSON(data) AS d
  FROM `__DATASET__.event_stats_raw_latest`
  WHERE operation <> 'DELETE'
),
arenas AS (
  SELECT document_id AS arena_doc, PARSE_JSON(data) AS a
  FROM `__DATASET__.arena_events_raw_latest`
  WHERE operation <> 'DELETE'
),
events AS (   -- union the two event sources, normalise name + end date
  SELECT document_id AS eid, JSON_VALUE(PARSE_JSON(data),'$.name') AS name,
         TIMESTAMP_SECONDS(CAST(JSON_VALUE(PARSE_JSON(data),'$.end_date._seconds') AS INT64)) AS end_date
  FROM `__DATASET__.event_collection_raw_latest` WHERE operation <> 'DELETE'
  UNION ALL
  SELECT document_id, JSON_VALUE(PARSE_JSON(data),'$.queuename'),
         TIMESTAMP_SECONDS(CAST(JSON_VALUE(PARSE_JSON(data),'$.queueenddate._seconds') AS INT64))
  FROM `__DATASET__.queue_generation_raw_latest` WHERE operation <> 'DELETE'
)
SELECT
  s.arenaeventid,
  ev.name        AS event_name,
  ev.end_date    AS event_end,
  CAST(JSON_VALUE(s.d,'$.potential') AS INT64)    AS potential,
  CAST(JSON_VALUE(s.d,'$.requested') AS INT64)    AS requested,
  CAST(JSON_VALUE(s.d,'$.eligible')  AS INT64)    AS eligible,
  CAST(JSON_VALUE(s.d,'$.noProduct') AS INT64)    AS no_product,
  CAST(JSON_VALUE(s.d,'$.inQueue')   AS INT64)    AS in_queue,
  CAST(JSON_VALUE(s.d,'$.approved')  AS INT64)    AS approved,
  CAST(JSON_VALUE(s.d,'$.attended')  AS INT64)    AS attended,
  CAST(JSON_VALUE(s.d,'$.noShow')    AS INT64)    AS no_show,
  SAFE_DIVIDE(CAST(JSON_VALUE(s.d,'$.attended') AS INT64), CAST(JSON_VALUE(s.d,'$.approved') AS INT64))  AS showup_rate,      -- attended / approved (corrected metric)
  SAFE_DIVIDE(CAST(JSON_VALUE(s.d,'$.eligible') AS INT64), CAST(JSON_VALUE(s.d,'$.requested') AS INT64)) AS eligibility_rate,
  SAFE_DIVIDE(CAST(JSON_VALUE(s.d,'$.approved') AS INT64), CAST(JSON_VALUE(s.d,'$.eligible')  AS INT64)) AS approval_rate
FROM stats s
LEFT JOIN arenas a ON a.arena_doc = s.arenaeventid
LEFT JOIN events ev ON ev.eid = JSON_VALUE(a.a,'$.eventref.__ref__path__')  -- adjust to how the ref is serialised
;

-- ── 2) Show-up trend by month (the "is it improving?" series) ─────────────────
CREATE OR REPLACE VIEW `__DATASET__.showup_trend` AS
SELECT
  DATE_TRUNC(DATE(event_end), MONTH) AS month,
  SUM(attended) AS attended,
  SUM(approved) AS approved,
  SAFE_DIVIDE(SUM(attended), SUM(approved)) AS showup_rate
FROM `__DATASET__.event_funnel`
WHERE event_end IS NOT NULL
GROUP BY month
ORDER BY month;

-- ── 3) Revival gap (sales/JC signal: approved/eligible exceeding live potential) ──
CREATE OR REPLACE VIEW `__DATASET__.revival_gap` AS
SELECT arenaeventid, event_name, event_end,
       potential, eligible, approved,
       (approved - eligible) AS revived_into_approved   -- people approved beyond the eligible pool
FROM `__DATASET__.event_funnel`
WHERE approved > eligible
ORDER BY event_end DESC;
