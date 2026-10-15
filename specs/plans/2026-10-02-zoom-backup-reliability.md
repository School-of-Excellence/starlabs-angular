# Zoom → Dropbox backup reliability (approved 2026-10-02)

Server code lives in `zoom-dropbox-migration/`; dashboard in
`src/app/Communication Center/zoom-recording-dashboard/`.

## Problems (measured on production data, Aug 20 – Oct 2)
1. Recordings over ~2.5 GB never finish: median throughput 1.4 MB/s vs the 30-min
   Cloud Tasks deadline → the task is re-sent while the first run is still
   uploading → 5+ parallel runs, docs frozen at `processing`.
2. "completed" without a real backup: 6 meetings' captions were Zoom's HTML
   "Passcode Required" page; 1 folder missing. Status never checked sizes.
3. Duplicate docs (136 meetings) from Zoom re-sending webhooks (>3s cold start).
4. Two zoom-to-dropbox services: webhook → `fir-sample-aae4a`, dashboard →
   `starlabs-test` (prod dashboard URL was empty in CI).

## Plan
- **Phase 0** — one server: prod dashboard → fir-sample service; switch off starlabs-test.
- **Phase 1** — one run per meeting: Firestore claim + `heartbeatAt` every 10s;
  a re-sent task answers 409 while the owner is alive and takes over (skipping
  verified files) when it is dead; Cloud Tasks names = meeting uuid; queue max-attempts 20.
- **Phase 2** — speed/robustness: no per-piece `Buffer.concat`, real request
  aborts, continue on `incorrect_offset` / lost finish, timing logs (download vs upload).
- **Phase 3** — "completed" = every file in Dropbox at Zoom's exact size; Bearer
  token for downloads (fixes the HTML captions); HTML responses rejected.
- **Phase 4** — dashboard: Verify, Move to Zoom trash (one recording, only after a
  passing verification, any signed-in dashboard user), Re-migrate for
  `verify_failed`, 5-min stalled detection, best doc among duplicates.
- **Phase 5** — repair existing data (re-migrate unfinished / bad-caption meetings,
  clean duplicates) — each step confirmed with the operator.
