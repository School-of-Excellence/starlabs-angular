# specs/diagrams/ — StarLabs architecture & flow diagrams

ASCII diagrams (grounded in the 2026-06-02 evidence + verified `file:line` citations). Each links back to its subsystem doc.

| Diagram | Covers | Doc |
|---|---|---|
| [architecture.md](architecture.md) | The config-driven engine, `AuthguardService` hub, the 5 delivery modes | `DESIGN.md`, `CONFIGURATION.md` |
| [queue-stage-machine.md](queue-stage-machine.md) | Config → token → stage log; variation override; `moveQueueStage` | `QUEUE-AND-BIG.md` |
| [studio-assignment-flow.md](studio-assignment-flow.md) | Runtime studio assembly (live assignment ↔ token ↔ room) | `LIVE-STUDIOS.md` |
| [journey-lifecycle.md](journey-lifecycle.md) | Purchase → onboarding → delivery → continuity; `journeystatus` states; purchased≠delivered | `JOURNEY-LIFECYCLE.md`, `SCHEDULING-DELIVERY.md` |

> Diagrams are hand-maintained; when the cited `file:line` or config shape changes, update the diagram + its doc together.
