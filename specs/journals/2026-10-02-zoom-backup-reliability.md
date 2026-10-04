# 2026-10-02 — Zoom backup reliability: why each constraint landed

Plan: `specs/plans/2026-10-02-zoom-backup-reliability.md`. Server code: `zoom-dropbox-migration/`.

## What we found (read-only checks against production)
- 963 backup docs, 778 Dropbox folders, 710 Zoom recordings compared byte-for-byte.
  911/924 "completed" docs were truly complete.
- Median upload throughput **1.4 MB/s** per meeting → ~2.5 GB fits in Cloud Tasks'
  30-min dispatch deadline (a hard Google limit). Disha Varma 2026-09-02 (10.4 GB):
  5 runs started 31/31/32/35 min apart = deadline + queue backoff; all died.
- Duplicate docs 5 min apart = Zoom webhook retry (Zoom waits 3s; cold start took 4–5s).
- Captions saved as Zoom's "Passcode Required" HTML: `?access_token=` is refused for
  some file types; `Authorization: Bearer` returns the real file (verified on a live VTT).
- Two services: Zoom webhook → `fir-sample-aae4a`; dashboard (test + this machine) →
  `starlabs-test`. CI's prod `ZOOM_API_URL` was empty.

## Why the design is what it is
- **Claim + heartbeat instead of a longer timeout**: the 30-min deadline can't be
  raised. A re-sent task now answers 409 while the owner's heartbeat is < 5 min old,
  so Cloud Tasks keeps retrying (max-attempts 20 ≈ 2.5h) until the owner finishes
  (→ skip) or dies (→ take over).
- **Heartbeat rides on the progress write, every 10s** (operator choice): ~70% fewer
  dashboard reads than the old ~3s progress writes; dead runs show as "stalled" in
  5 min instead of 6h.
- **Takeover re-verifies previous files against Dropbox** before skipping them, and
  only deletes a previous copy whose size matches no file of the recording.
- **Task name = meeting uuid** for webhooks (Cloud Tasks rejects the duplicate);
  manual migrations get a unique suffix so re-migrate is never blocked.
- **"completed" requires exact byte size** — the only signal that caught the HTML captions.
- **Trash only after a fresh server-side verification**, one recording at a time,
  Zoom `action=trash` (restorable 30 days), Firebase ID token of any signed-in dashboard user (domain restriction removed 2026-10-04 at operator request).
  Gurpreet Kaur 2026-09-09 is already gone from Zoom with a bad caption backup —
  the reason trash must never run on an unverified backup.
- **Test dashboard gets no zoom API** once starlabs-test is retired: test must never
  call the production service (CLAUDE.md constraint).

## Surprises
- My first reliability-test run wrote 11 junk folders ("Reliability N_…", ~95 MB) to the
  real Dropbox: the `dropbox` SDK export is a non-writable getter, so the fake didn't
  install and `.env` credentials were used. Test now swaps the module via require.cache,
  forces fake credentials, and asserts the fake is active. Cleanup pending operator OK.
- Sep 2–3: 107 file failures with Dropbox 409; logs expired, cause unknown. Dropbox
  team space at 78.7 / 90 TB.

## Pending
- Deploy server to fir-sample; update queue; deploy dashboard via CI; switch off starlabs-test.
- Delete the 11 test folders; Phase 5 data repair; measure download-vs-upload timing logs.
