# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-07-07 (Events stage-data screen)_ · **New session? Read `specs/ORIENTATION.md` first**, then today's journal `specs/journals/2026-07-07-events-stage-data-screen.md`.

## Current state
- **New screen `events-stage-data` added** — a **3-step wizard** (Event ▸ Arena event ▸ Participants). Shows the chosen arena event's participants' **name, email, phone, customer status** — all from `participant metadata` (doc id = profileid).
  - Files: `src/app/Events/events-stage-data/events-stage-data.component.{ts,html,css}`
  - Route: `events-stage-data` (lazy, `authGuard`) in `src/app/app.routes.ts`. **URL: `/events-stage-data`**.
  - Flow: **Step 1** `event collection` (events only) → **Step 2** `arena events` where `eventref == event.ref` → **Step 3** map queue (`queue generation` where `arenaeventidlist array-contains arena.docid`) + `event participation request` where `arenaeventid == arena.docid` → distinct `profileid`s → `participant metadata` doc per id.
- Angular 19 SSR PWA on Firebase, auth-gated. Branch: `dynamic-studio-update`. **Uncommitted** — changes are local.

## Last session changes (2026-07-07) — why
- Built the screen. First cut bulk-loaded all events/queues joined to arenas; operator asked for **stepwise selection**, so rebuilt as the Event ▸ Arena ▸ Participants wizard (breadcrumb nav, per-step loads).
- Took **all four columns from metadata** per the request (note: sibling `product-funnel` sources email from `profile_data` instead — deliberately different here).
- Used per-doc `getDoc('participant metadata', profileid)` because the request specified "profileid is the docid of metadata"; confirmed via `authguard.getParticipantMetaMap()` which keys its map by `doc.id`. Rows with no metadata doc are flagged (amber) but still listed.
- Verified with `ng build --configuration development` — compiles clean; only pre-existing warnings in unrelated components.

## Pending / next
- **Not linked from any nav/menu** — reachable only by direct URL `/events-stage-data`. Add a menu entry if operators need discoverability.
- For very large events, per-doc metadata reads could be slow — switch to chunked `where('profileid','in',…)` (as `product-funnel.loadMeta` does) if needed.
- Commit + push are operator-gated. Branch is `dynamic-studio-update`; do not touch `main` without approval.
