# CONTENT-ENGAGEMENT.md — Content catalog, consumption analytics & engagement

> Subsystem reference (data-first, config-aware, evidence-backed). Covers the **content participants consume** (SolarVoice audio + eiflix video + recommended playlists) and the **engagement signal** it produces. The catalog is config; the consumption log is the engagement backbone; access is gated by tier config.
>
> Evidence: `specs/CONTENT-ENGAGEMENT-evidence/evidence.json`; SolarVoice deep-dive `specs/journals/2026-06-02-solarvoice-usage-stats.md` (+ artifacts). Config model: `CONFIGURATION.md §4`. Graph community: [content](../graphify-out/wiki/content.md) (55 nodes). Reliability: `data-reliability.md` (DRAFT).

## 1. Purpose
Serve and track content: **SolarVoice** (audio playlists/audios) and **eiflix** (video series/episodes), surfaced via algorithm-driven **recommended playlists**, gated by **tier**, with every play recorded in `content analytics` and coaching interactions in `participant touchpoint`. This is the highest-volume data in the system (`content analytics` ≈ 279k rows, 47k writes/90d) and the engagement backbone for analytics.

## 2. Operator screens (from `operator-screens.md`)
- **Analytics:** `contentanalytics` · `content-analytics-dashboard` (`ContentAnalyticsDashboardComponent`) · `participants-analytics` · `participanttouchpoint`.
- **SolarVoice (audio):** `audiodashboard` · `playlistdashboard` · `add-playlist`/`edit-playlist` · `content-upload-v2`.
- **eiflix (video):** `videodashboard` · `seriesdashboard` · `addseries`/`editseries` · `assigncategory` · `category-dashboard` · `learningmaterial` · `healthstories`.
- **Recommendation / access:** `recommendedplaylist` (`ManageRecommendedPlaylistComponent`) · `tieraccessconfig`/`viewparticipantstieraccess` · `accessscreen` · `playlistads`.
- **Evolution media:** `evolutionmapping`/`evolutionmappingv2` · `participantevolution`.

## 3. Collections by ROLE × reliability tier (all Tier-A)
| ROLE | Collection | Count | Note |
|---|---|---|---|
| **TRANSACTIONAL** | `content analytics` | 278,752 | every content play (the engagement backbone). `type` distinguishes solarvoice/eiflix |
| **TRANSACTIONAL** | `participant touchpoint` | 89,243 | coach↔participant interaction log |
| **RUNTIME-STATE** | `recommended mix playlist` | 9,446 | per-participant algorithm-generated playlist |
| **RUNTIME-STATE** | `evolutionmappingvideo` (1,526), `liveevolutionmapping` (538) | — | participant evolution videos |
| **CONFIG-catalog** | `episodes` (502), `series` (53) | — | eiflix video catalog (`series.tier[]` ties to tiers) |
| **CONFIG-catalog** | `solar voice playlist` (56), `solar voice audios` (49) | — | SolarVoice audio catalog |
| **CONFIG** | `tier access config` (12), `tier` (13) | — | content gating (see §4 caveat) |

## 4. Configuration model
- **Catalog (CONFIG):** `series` (`seriesName`, `sequence[]`, `tier[]`, `order`), `episodes` (`title`, `videoUrl`, `hsl_*` streams, `series[]`), `solar voice playlist` (`name`, `sequence[]`→`solar voice audios`), `solar voice audios` (`name`, `url`, `duration`). Authored in the content screens.
- **Gating (CONFIG):** `tier access config` (12) — `tieraccessby` (`product`|`biglevel`), `tierid`, `productaccess{<journeyid>: [{productid,count}]}`. **⚠️ verified enforcement caveat:** in this Angular client `tier access config` is read for **display/authoring only** ([view-tier-access.component.ts:44](../src/app/content/tier-access-config/view-tier-access/view-tier-access.component.ts#L44)); **no web code filters content by `productaccess`/`count` at view time** — runtime entitlement is enforced outside this repo (mobile app / Cloud Functions). (`CONFIGURATION.md §4`.)
- **Consumption (read-only in web):** `content analytics` is **never written by the Angular app** — no `addDoc`/`setDoc`/`updateDoc` to it anywhere in `src/`. It is produced by the mobile app / backend; the web app only **reads** it. The `type` field (`solarvoice` / `eiflixcontent`) is set by the producer and **filtered** in the dashboard: `contentType = content['type']` ([content-analytics-dashboard.component.ts:812](../src/app/content/content-analytics-dashboard/content-analytics-dashboard.component.ts#L812)), then `activePlatforms.has('solarvoice')` / `has('eiflixcontent')` ([:1193,:1198](../src/app/content/content-analytics-dashboard/content-analytics-dashboard.component.ts#L1193)).

## 5. Dynamic assembly / engagement signal
```
catalog (series/episodes, solar voice playlist/audios)   ── CONFIG ──┐
                                                                     ▼
participant plays content (mobile/web) ─writes─▶ content analytics (type, totaltimespend, logdate)  [producer = mobile/backend]
                                                                     │ read
                  ┌──────────────────────────────────────────────────┘
                  ▼
recommended mix playlist (per-participant, personalised)      content-analytics-dashboard: bucket by type → solarvoice / eiflix
participant touchpoint (coach interactions)                   participants-analytics: engagement per participant/journey
tier access config (tierid → productaccess{})  ── gates which catalog a tier may access (enforced outside web)
```

## 6. Data flow
Catalog authored (`series`/`episodes`/`solar voice *`) → access gated by `tier access config` (per tier/biglevel) → participant consumes → `content analytics` row per play (mobile/backend writes) → dashboards read + bucket by `type` → `recommended mix playlist` personalizes next content → `participant touchpoint` records coaching nudges. Engagement feeds journey analytics (`JOURNEY-LIFECYCLE.md`) and the SolarVoice/eiflix split.

## 7. Worked example — SolarVoice vs eiflix consumption (live)
From `content analytics` (278,752 rows total, 47,622 writes in the last 90d), by `type`:
- **`solarvoice` = 119,959 plays** — the audio backbone (matches the dedicated SolarVoice study: ~1,463 distinct listeners and ~26k listening-hours, `2026-06-02-solarvoice-usage-stats.md`; count grew from 119,909 → 119,959 between probes, confirming it is live).
- **`eiflixcontent` = 39,717 plays** — video.
- The remaining rows (`type` is 81% filled) are untyped/older plays or other content kinds.

**Per-participant cross-modal example** (from `journey_evidence_final.json`): participant `P-4F5BB` consumed **368 SolarVoice plays (≈122 hrs)** and **73 eiflix plays** across months 0.4→19.7 of their journey — content engagement spans the entire delivery lifecycle, not just onboarding. (Participants with `sv:0, ef:0`, e.g. `P-DE0F0`, are short Health-Explorative journeys with no content consumption — a real cohort difference.)

## 8. Known caveats
- `content analytics` is **read-only in this repo** — do not write it in tests/fixtures; seed it as pre-existing data if a screen needs to read it.
- `tier access config` gating is **not enforced by the web client** — don't assert content-gating behavior against this Angular app.
- `content analytics.type` is only 81% filled — untyped rows exist; bucket defensively (`type || 'Unknown'`).
- `solar voice audios.hlsurl` is 0% (legacy field); use `url`.

## 9. Evidence log
| Claim | Query / sample | Count | Source |
|---|---|---|---|
| Engagement backbone volume | `content analytics` total; 47,622 writes/90d by `logdate` | 278,752 | evidence.json `.schema['content analytics']` |
| SolarVoice vs eiflix split | `where type=='solarvoice'` / `=='eiflixcontent'` counts | 119,959 / 39,717 | evidence.json `.traces.contentTrace.byType` |
| content analytics is read-only in web | no write to 'content analytics' in src/ | — | code audit |
| type bucketed in dashboard | `content['type']` → activePlatforms solarvoice/eiflix | — | content-analytics-dashboard.ts:812,1193 |
| Gating is display-only in web | `tier access config` read for view; no productaccess filter | 12 | view-tier-access.ts:44 (code audit) |
| Cross-modal lifetime consumption | P-4F5BB: 368 SolarVoice + 73 eiflix, months 0.4→19.7 | — | journey_evidence_final.json |

## 10. Open questions (engineer validation)
1. Where exactly is `content analytics` written (mobile app? a Cloud Function)? Confirm the `type` vocabulary beyond solarvoice/eiflixcontent.
2. Is `recommended mix playlist` regenerated on a schedule (treat as derived) or curated?
3. Confirm runtime tier-gating is mobile/CF and the web client is display-only by design.
4. Should untyped `content analytics` rows (19%) be backfilled with a `type`?
