# Measured results — 20k / 20 stress run

Seeded **214,843 docs** into the Firestore emulator (32,055 pjp · 20,000 healthstate ·
23,955 touchpoint · 34,907 tickets · 82,000 dense drawer for 2,000 exemplars).
Aggregation `count()` **is** supported by this emulator build, so the new-path counts
are measured, not modeled.

`modeled_real = emulator_wall + payload / bandwidth` (emulator runs over localhost,
so wire latency is added from measured payload bytes).

| Operation | docs/reads | payload | emu wall | ~real @8Mbps | ~real @25Mbps | ~real @80Mbps |
|---|--:|--:|--:|--:|--:|--:|
| **Current board (ALL)** | 110,917 | 18.85 MB | 10.34 s | 30.1 s | 16.7 s | 12.3 s |
| **Current refresh** (no cache) | 110,917 | 18.85 MB | 10.34 s | 30.1 s | 16.7 s | 12.3 s |
| **New board** (page + agg) | 109 | 7.4 KB | 1.30 s* | 1.31 s | 1.31 s | 1.30 s |
| **New refresh** (cache) | 109 | 0 B | ~instant | — | — | — |
| **Filter / coach switch** | 56 | 6.1 KB | 271 ms | 277 ms | 273 ms | 272 ms |
| **Dense drawer open** | 58 | 10.7 KB | 461 ms | 472 ms | 464 ms | 462 ms |

\* New-board wall is inflated by first-query connection warmup in the bench process
(the aggregation cards alone returned in ~223 ms, the warm coach query in 20 ms, and
the warm filter-switch in 271 ms). Steady-state new-board load is ~0.3–0.5 s; ~1.3 s
is a fair *cold* figure including connection setup.

## Reads & cost per board load
| | reads/load | $/load | 20 coaches × 10 refresh/day |
|---|--:|--:|--:|
| Current | 110,917 | $0.0666 | **~$399 / mo** |
| New | ~109 | $0.0001 | **~$0.39 / mo** |

## What the harness corrected in the earlier model
- Real avg doc payload is **~170 B**, not the 1 KB I assumed — so current cold load is
  **~12–30 s** (bandwidth-dependent), not the 35–50 s estimated.
- The **deserialize/compute floor is ~10 s** for the current whole-collection scans —
  i.e. even on infinite bandwidth, today's board can't load faster than ~10 s at this
  scale. That floor, not the network, is the real wall.
- Cost estimate (~$385/mo) was confirmed: **measured ~$399/mo**.

## Distribution sanity check (seeded)
`{HAPPY:3262, NEUTRAL:3396, UNHAPPY:3325, AT_RISK:3307, CRITICAL:3340, NOT_ASSESSED:3370}`
— open tickets 12,025 · flagged 1,606. Aggregation counts match the full 20k, which is
exactly the accuracy the current client-side-over-paged-subset approach cannot give.

_Re-run anytime: see README.md. Restart/clear the emulator between seeds._
