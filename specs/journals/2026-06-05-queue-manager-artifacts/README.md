# Queue Manager (concept group #3) — probe artifacts (2026-06-05)

Read-only probes over production (`fir-sample-aae4a`) used to validate `specs/validated/03-queue-manager.md`.
Run from a harness with `firebase-admin` + the production service-account JSON. ⚠️ Outputs contain participant
names/ids (PII) — private repo only; scrub before any external share.

- `queue_probe.js` / `queue_probe2.js` — personalization-field population; variation×journey reverse-engineering.
- `queue_explore.js` — recently-used queues + the live-assignment→queue join + schemas.
- `queue_study.js` (+`_out.json`) — single-queue deep study: variations, provider roster, **peak specialists/studio**.
- `qconf.js` — dump a queue's `queue generation` config (top-level + stageproperty table). Arg = queue id.
- `qflow.js` / `qflow2.js` — the `nextstage` transition graph; per-variation back-and-forth.
- `qvj.js` — per-variation journey breakdown. `qvp.js` (+`_out.json`) — per-variation ordered stage paths.
- `qtrace.js` (+`_out.json`) — per-variation edges+journeys for the interactive tracer.
- `qexport.js` — export a real queue's config into the flow-visualizer prototype's `FlowConfig` shape.

Queues studied: `vuvS7eBgTxLKufnesLQT` (599 ppl, Evolution Mapping) · `L3rqCrqDBsshd7HM5YRn` (655 ppl, Diagnostics & Consultation, 9 variations).
