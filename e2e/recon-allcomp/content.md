# Content & Engagement — e2e recon

> Generated 2026-06-10. Key: `content`. Covers upload, series, playlists, audio/video, ads, tier
> access, analytics, and learning materials. Read alongside `specs/CONTENT-ENGAGEMENT.md` (the
> primary spec) and `specs/CONTENT-ENGAGEMENT-evidence/evidence.json`.

---

## Routes (path -> component file:line, role/guard, ATC? note)

| Path | Component file | Guard | ATC? |
|---|---|---|---|
| `/content-upload-v2` | `src/app/content-upload-version2/content-upload-version2.component.ts:1` (shell nav) | `authGuard` (auth.guard.ts:10) | No — `atc taxonomy` tag list read-only (cosmetic, not core) |
| `/contentupload` | `src/app/content/content-upload/content-upload.component.ts:41` | `authGuard` | Reads `atc taxonomy` for tags (line 92-98); **non-ATC screen** — exclude taxonomy query from tested flows |
| `/audiodashboard` | `src/app/content/audio-dashboard/audio-dashboard.component.ts:36` | `authGuard` | Reads `atc taxonomy` for tag lookup (line 101-110); **non-ATC screen** |
| `/playlistdashboard` | `src/app/content/playlist-dashboard/playlist-dashboard.component.ts:39` | `authGuard` | Reads `atc taxonomy` for tags (line 70-78); **non-ATC screen** |
| `/playlistdashboard/add-playlist` | `src/app/content/playlist-dashboard/solar-playlist/solar-playlist.component.ts:41` | `authGuard` | Reads `atc taxonomy` (line 88); **non-ATC screen** |
| `/playlistdashboard/edit-playlist` | `src/app/content/playlist-dashboard/edit/edit.component.ts` | `authGuard` | No ATC reads in active code |
| `/videodashboard` | `src/app/content/episodes-dashboard/episodes-dashboard.component.ts:37` | `authGuard` | Reads `atc taxonomy` (line 73-80); **non-ATC screen** — taxonomy query is cosmetic tagging only |
| `/seriesdashboard` | `src/app/content/series-dashboard/series-dashboard.component.ts:36` | `authGuard` | No ATC reads |
| `/seriesdashboard/addseries` | `src/app/content/series-dashboard/add-series/add-series.component.ts:45` | `authGuard` | No ATC reads |
| `/seriesdashboard/editseries` | `src/app/content/series-dashboard/edit-series/edit-series.component.ts:40` | `authGuard` | No ATC reads |
| `/category-dashboard` | `src/app/content/category-dashboard/category-dashboard.component.ts:31` | `authGuard` | No ATC reads |
| `/assigncategory` | `src/app/content/series-dashboard/categoryassign/categoryassign.component.ts` | `authGuard` | No ATC reads |
| `/playlistads` | `src/app/content/playlist-ads/playlist-ads.component.ts:32` | `authGuard` | No ATC reads |
| `/healthstories` | `src/app/content/health-stories/health-stories.component.ts:31` | `authGuard` | No ATC reads |
| `/ads` | `src/app/content/click-ads/click-ads.component.ts` — **FULLY COMMENTED OUT** (entire class is `// …`) | `authGuard` (route still registered app.routes.ts:100) | No — route loads an empty shell |
| `/content-analytics-dashboard` | `src/app/content/content-analytics-dashboard/content-analytics-dashboard.component.ts` | `authGuard` | No ATC reads; reads `content analytics` (read-only) |
| `/contentanalytics` | `src/app/content/content-analytics/content-analytics.component.ts:44` | `authGuard` | No ATC reads |
| `/accessscreen` | `src/app/content/access-screen/access-screen.component.ts:43` | `authGuard` | No ATC reads |
| `/tieraccessconfig` | `src/app/content/tier-access-config/view-tier-access/view-tier-access.component.ts:29` | `authGuard` | No ATC reads; reads `tier access config`, `tier`, `journey`, `products`, `biglevel` |
| `/viewparticipantstieraccess` | `src/app/content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component.ts:25` | `authGuard` | No ATC reads; reads `participant metadata`, `tier` |
| `/learningmaterial` | `src/app/content/learning-material/learning-material.component.ts:27` | `authGuard` | No ATC reads |

**Guard mechanics (auth.guard.ts:10-91):** `authGuard` = Firebase authState → checks user logged in →
reads `dashboard` Firestore collection for `route.roles[]`/`route.profileid[]` → denies with dialog if
no match. Role keys used: `admin`, `ah`, `developer`, `eventcoordinator`, and others configured in
`dashboard` collection docs.

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

All use the **default** Firestore database.

| Collection | R/W | Used in |
|---|---|---|
| `solar voice audios` | both | AudioDashboardComponent (read stream), AddAudioComponent (setDoc/updateDoc/deleteDoc audio-dashboard/add-audio/add-audio.component.ts:209,237,269,279,390), SolarPlaylistComponent (read), PlaylistDashboardComponent (tag display) |
| `solar voice playlist` | both | PlaylistDashboardComponent (stream), SolarPlaylistComponent (setDoc :146), PlaylistConfigurationComponent (setDoc :265,284), EditComponent (setDoc :199), PlaylistDashboardComponent (deleteDoc :161) |
| `episodes` | both | EpisodesDashboardComponent (stream), AddEpisodeComponent (setDoc :220, updateDoc :286, deleteDoc :323), UploadEpisodeDialogComponent (setDoc :490) — also written by AddSeriesComponent via writeBatch.update for `series` arrayUnion |
| `series` | both | SeriesDashboardComponent (stream), AddSeriesComponent (writeBatch.set :255, writeBatch.update episodes :257), EditSeriesComponent (updateDoc), CategoryDashboardComponent (read for ordering updateDoc :106) |
| `category` | both | CategoryDashboardComponent (stream), AddCategoryComponent (setDoc :65, updateDoc :77, deleteDoc :85) |
| `tier` | read | AccessScreenComponent, ViewTierAccessComponent, ViewparticipantTierAccessComponent, AddSeriesComponent, LearningMaterialAddDialogComponent |
| `tier` | write | AddTierComponent (setDoc :86, updateDoc :98, deleteDoc :115) via access-screen/add-tier |
| `tier access config` | both | ViewTierAccessComponent (stream :45), ConfigNewTierComponent (setDoc :184) |
| `health stories` | both | HealthStoriesComponent (stream :43), UpdateHealthstoryComponent (setDoc :128 — coll `health stories`) |
| `adsplaylist` | both | PlaylistAdsComponent (stream :56), UpdatePlaylistadsComponent (setDoc :139) |
| `content_urls` | both | ContentUploadComponent (stream :77-90), ContentUploadDialogComponent (setDoc/updateDoc), PlaylistAdsComponent (read for mapGeneralContent :48) |
| `learning-materials` | both | LearningMaterialComponent (stream :42, deleteDoc :95), LearningMaterialAddDialogComponent (setDoc :261, updateDoc :242) |
| `content analytics` | read-only | ContentAnalyticsDashboardComponent (onSnapshot :797-803), ContentAnalyticsComponent (:810); **NEVER written by web** — written by mobile/backend |
| `recommended mix playlist` | read | ContentAnalyticsDashboardComponent (collectionData :1076 + fetch) — written ONLY by `buffermixToRecommendedPlaylist` CF |
| `participant metadata` | read | ContentAnalyticsDashboardComponent (:1023), ViewparticipantTierAccessComponent (:70) |
| `journey` | read | ContentAnalyticsComponent (:130), ViewTierAccessComponent, ConfigNewTierComponent |
| `biglevel` | read | ViewTierAccessComponent, ConfigNewTierComponent |
| `products` | read | ViewTierAccessComponent, ConfigNewTierComponent |
| `ads` | both (route commented out) | `click-ads.component.ts` class is fully commented — reads `ads` collection only in the commented block (line 41) |
| `user` | read | AccessScreenComponent (via AssignUserComponent) |
| `atc taxonomy` | read-only | AudioDashboardComponent (:101), SolarPlaylistComponent (:88), PlaylistDashboardComponent (:70), ContentUploadComponent (:92), EpisodesDashboardComponent (:73) — **reference-only config, safe to read per CLAUDE.md** |
| `arenavideoask` | both | ArenaVideoAskInputComponent (setDoc :163, updateDoc :198, deleteDoc :226) — not in the primary route list; not tested |
| `event collection` | read | ArenaVideoAskInputComponent (:66) |
| `dashboard` | read | `authGuard` → `authguard.service.ts:325` for route access-check |

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Config | Effect | Read at |
|---|---|---|
| `dashboard` collection `roles[]` / `profileid[]` per route | Admits/denies users to every content route | `authguard.service.ts:325-346` (via `authGuard` in `auth.guard.ts:36`) |
| `tier` collection docs | Tier names shown in series and learning-material forms | `add-series.component.ts:111-117`, `learning-material-add-dialog.component.ts:77-83`, `add-tier.component.ts:63` |
| `series[].tier[]` refs | Which tiers a series is available under — displayed in `ViewparticipantTierAccessComponent` | `viewparticipant-tier-access.component.ts:70-80` reads `participant metadata.tier[]` |
| `tier access config[].tieraccessby` (`biglevel`/`product`) | Determines which tier-entitlement rule runs in the `eiflix-tier.js` CF | `eiflix-tier.js:46-80` (CF only — web reads for display) |
| `category[].order` | Controls ordering in CategoryDashboard; drag-drop saves `order` | `category-dashboard.component.ts:85-110` |
| `series[].order` | Order of series in the category view | `category-dashboard.component.ts:95-98, 101-109` |
| `content analytics` date-range filter (UI date pickers) | Narrows the onSnapshot query by `logdate` | `content-analytics-dashboard.component.ts:785-795` |
| `content analytics`.`type` (`solarvoice`/`eiflixcontent`) | Buckets participants into platform cohorts | `content-analytics-dashboard.component.ts:829,939,1255,1260` |

---

## Cloud Functions involved (name -> trigger -> side-effect a test can assert)

All from `starlabs-angular-queue-e2e/starlabs-cloud-function/functions/` (development branch).

| CF Name | Trigger | Assertable side-effect |
|---|---|---|
| `ConvertUrltoHLS` | `onDocumentWritten` `/episodes/{id}` (content.js:230) — fires when episode `videoUrl` or `imageUrl` changes | Writes `convertedtohls: true` + `hsl_*` fields onto the `episodes` doc (content.js:258-266) |
| `UnconvertedUrltoHLS` | `onSchedule` every-6-hours (content.js:279) | Batch-updates unconverted episodes — sets `convertedtohls: true` on all `episodes` where `convertedtohls==false && responsepublitio==undefined`. **Not directly testable by seeding a trigger.** |
| `generalContentUpdate` | `onDocumentWritten` `/content_urls/{id}` (content.js:313) — fires when `thumbnail` or `url` changes | Calls `uploadContentToPublitio` HTTP CF → sets `hlsstatus: "uploading"` then `"uploaded"` + `convertedtohls: true` on `content_urls` doc (content.js:343-375) |
| `uploadContentToPublitio` | HTTP GET request (content.js:323) — called by `generalContentUpdate` or directly by the web (`content-upload.component.ts:154`) | Sets `hlsstatus: "uploaded"` and `convertedtohls: true` on `content_urls` doc (content.js:372-375). **External dependency: Publitio API — must be stubbed in tests** |
| `buffermixToRecommendedPlaylist` | `onDocumentCreated` `buffermix archive/{docid}` (content.js:168) | Writes N × `recommended mix playlist` docs (one per profileid × content-type in the buffermix) with `status: "completed"` back on the buffermix doc (content.js:221-222) |
| `RecommendedPlaylistTrigger_to_pmd` | `onDocumentCreated` `recommended mix playlist/{docid}` (participantmetadata.js:101) | Merges playlist content ids into `participant metadata/{profileid}[type]` map (participantmetadata.js:112-114) |
| `communityPostHLS` | `onDocumentWritten` `/community post/{id}` (content.js:18) | Writes `hls.*` fields onto community-post docs. **Not in this group's routes.** |

**Note on `RecommendedPlaylistTrigger_to_pmd`:** The pipeline is
`buffermix archive` write → `buffermixToRecommendedPlaylist` (writes `recommended mix playlist`) →
`RecommendedPlaylistTrigger_to_pmd` (merges into `participant metadata`). A single `buffermix archive`
seed doc triggers both CFs; the final assertable state is the `participant metadata` merge.

---

## External services to stub (call sites file:line)

| Service | Call site | How to stub |
|---|---|---|
| **Publitio** (video/audio HLS CDN) | `ConvertUrltoHLS` CF (content.js:255), `uploadContentToPublitio` HTTP endpoint (content.js:349-368), `generalContentUpdate` CF (content.js:318) — these are **server-side** (CF) | Tests that assert `convertedtohls`/`hlsstatus` on `episodes` or `content_urls` docs must NOT trigger real Publitio uploads. Seed docs with `convertedtohls: true` already set as preconditions; stub by intercepting the HTTP GET to `cloudfunctions.net/uploadContentToPublitio` via `page.route()` if web drives it directly (content-upload.component.ts:154). CF-side calls go via Publitio SDK — no stub needed for the Angular e2e layer since no CF runs client-side. |
| **Firebase Storage** (file upload) | `add-audio.component.ts:*` uploadBytesResumable; `add-series.component.ts:221-235` uploadBytes; `edit-image.component.ts:64-67`; `learning-material-add-dialog.component.ts:*` uploadBytesResumable; `update-playlistads.component.ts:127-131` uploadBytes; `update-healthstory.component.ts` | Upload tests must use tiny placeholder files (≤1 KB) to avoid real CDN latency. Do NOT call real Storage in unit assertions — stub via `page.route('**/firebasestorage.googleapis.com/**', ...)` or use pre-seeded Storage URLs. |
| **Publitio (HTTP endpoint — web-initiated)** | `content-upload.component.ts:154` — `httpClient.get(cloudfunctions.net/uploadContentToPublitio?...)` | `page.route('**/uploadContentToPublitio**', route => route.fulfill({ status: 200, body: JSON.stringify({}) }))` |

No Zoom, OpenVidu/LiveKit, FCM, Wati/Twilio, Postmark, or Razorpay calls exist in this group's source files.
Firebase Storage is the only external with a direct web-layer call that needs stubbing during upload flows.

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Role key(s) | Can access | Gate |
|---|---|---|---|
| Content Admin / Operator | `admin` or `ah` | All content routes | `authGuard` + `dashboard` collection config (authguard.service.ts:325) |
| Developer | `developer` | All content routes | Same |
| Event Coordinator | `eventcoordinator` (or as configured in `dashboard`) | Subset — depends on `dashboard` config per route | Same |
| Unauthenticated user | — | None — bounced to `/login` | `auth.guard.ts:21-26` |

In practice, the `dashboard` Firestore docs hold the exact `roles[]` allowed per route. No hardcoded
role checks were found in the content component source (beyond the commented-out `developer||admin||ah`
in `health-stories.component.ts:42` which is now commented out — the live code calls `guard.getRoles()`
but then proceeds unconditionally). The authGuard is the single enforcement point.

**Operator test user:** reuse the `admin+<run>@example.com` actor from `seed-test-project.js`; it has
`roles: ['admin']` which passes all content route guards as long as the `dashboard` doc for the route
includes `admin` in `roles[]`.

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

### Flow 1 — Audio dashboard renders `solar voice audios` stream
1. Operator navigates to `/audiodashboard`.
2. Component subscribes to `solar voice audios` (collectionSnapshots, audio-dashboard.component.ts:92-99).
3. Table renders one row per audio doc with `name`, `duration`, `date`, `size`, `playlists`, `tags`.
4. **No Firestore write.** Anti-circular assertion: the table's row count equals `countWhere('solar voice audios', [])` from Admin SDK.

### Flow 2 — Add a new audio (creates `solar voice audios` doc)
1. Operator opens the AddAudio dialog from audiodashboard.
2. Selects file, enters name/description/tags, optionally HLS url.
3. Submits → `setDoc` writes a new doc to `solar voice audios` (add-audio.component.ts:209).
4. **Assertable write:** the `solar voice audios` collection count increases by 1; the new doc has `name`, `date`, `url` fields set.

### Flow 3 — Create playlist (`solar voice playlist`)
1. Operator navigates to `/playlistdashboard/add-playlist` (SolarPlaylistComponent route).
2. Selects audio rows from the table, enters name/description.
3. `onSubmit` → `setDoc` to `solar voice playlist` with `sequence: [ref(solar voice audios, id), ...]` (solar-playlist.component.ts:146-161).
4. **Assertable write:** new doc in `solar voice playlist` with `name` = submitted name, `sequence.length` = selected audio count.

### Flow 4 — Playlist dashboard renders list + delete
1. Operator opens `/playlistdashboard`.
2. Stream from `solar voice playlist` populates the table (playlist-dashboard.component.ts:65-68).
3. Delete action → `deleteDoc(solarvoiceplaylistRef)` (playlist-dashboard.component.ts:161).
4. **Assertable (delete):** the playlist doc no longer exists in Firestore after delete.

### Flow 5 — Create series (multi-step, batch write to `series` + `episodes`)
1. Operator navigates to `/seriesdashboard/addseries`.
2. Selects episodes from table, enters name/description/category/tier, uploads thumbnail.
3. `onUpload` → writeBatch: `batch.set(series/<id>, seriesData)` + `batch.update(episodes/<id>, {series: arrayUnion(...)})` for each selected episode (add-series.component.ts:255-262).
4. **Assertable writes:** new `series` doc exists with `seriesName` = input; each selected `episodes` doc has the new series ref in `series[]`.

### Flow 6 — Series dashboard list + tier filter
1. Operator navigates to `/seriesdashboard`.
2. `collectionSnapshots('series')` stream populates table (series-dashboard.component.ts:53-59).
3. Tier filter `mat-select` changes `tierfilter` → `filterPredicate` narrows the visible rows.
4. **No write.** Anti-circular: rendered row count after selecting tier `free` == `countWhere('series', [['type','==','free']])`.

### Flow 7 — Episode upload (creates `episodes` doc → triggers `ConvertUrltoHLS` CF)
1. Operator opens `UploadEpisodeDialogComponent` from `/videodashboard`.
2. Enters title/description, uploads video file (Firebase Storage), submits.
3. `setDoc(doc(firestore, 'episodes', id), episodeData)` (upload-episode-dialog.component.ts:490).
4. `ConvertUrltoHLS` CF fires on the write: sets `convertedtohls: true` + `hsl_*` on the episodes doc.
5. **Assertable CF side-effect:** after seeding an episode with a real `videoUrl`, poll until `episodes/<id>.convertedtohls == true` (CF-SIDEEFFECT test). For the Angular UI test, assert the doc exists with `title` field (REAL-UI).

### Flow 8 — Content analytics dashboard loads and buckets by type
1. Operator navigates to `/content-analytics-dashboard`.
2. Component calls `onSnapshot(query('content analytics', orderBy('logdate','desc')))` (content-analytics-dashboard.component.ts:797-803).
3. Processes docs: buckets by `type` → `solarvoice` vs `eiflixcontent` → computes `totalUniqueUsers`, `totalWatchHours`, etc.
4. **No write.** Anti-circular: seed a known N `content analytics` docs with `type: 'solarvoice'`; assert the dashboard's "Unique Users" counter eventually reaches/includes those N profiles.

### Flow 9 — Category CRUD (add / edit / drag-reorder)
1. Operator opens `/category-dashboard` → table from `category` stream.
2. Add dialog → `setDoc(category/<id>, {category, date})` (add-category.component.ts:65).
3. Drag-drop reorder → `updateDoc(series/<id>, {order: index})` (category-dashboard.component.ts:106) for series ordering.
4. **Assertable write:** new `category` doc exists; `series` docs have updated `order` values.

### Flow 10 — Tier access config: add a tier-config row
1. Operator opens `/tieraccessconfig` → stream from `tier access config`.
2. Opens ConfigNewTierComponent dialog → fills form → `setDoc(tieraccessconfigRef, data, {merge:true})` (config-new-tier.component.ts:184).
3. **Assertable write:** new doc in `tier access config` with `tierid` = submitted tier.

### Flow 11 — Learning material add/edit/delete
1. Operator opens `/learningmaterial` → stream from `learning-materials`.
2. Add dialog → uploads file(s) to Storage → `setDoc(learning-materials/<id>, {...})` (learning-material-add-dialog.component.ts:261).
3. Edit → `updateDoc(learning-materials/<id>, {...})` (:242).
4. Delete → removes Storage file + `deleteDoc(learning-materials/<id>)` (learning-material.component.ts:95).
5. **Assertable writes:** doc exists with `name` field; update changes `name`; delete removes the doc.

### Flow 12 — Playlist ads CRUD (adsplaylist)
1. Operator opens `/playlistads` → stream from `adsplaylist`.
2. Opens UpdatePlaylistadsComponent → fills form → `setDoc(adsplaylist/<id>, playlistValue)` (update-playlistads.component.ts:139).
3. **Assertable write:** new `adsplaylist` doc with `adstitle` = input, `available = true`.

### Flow 13 — buffermix → recommended mix playlist pipeline (CF-chain)
1. Seed a `buffermix archive` doc with `profileid: [P1, P2]`, `solarvoice: [<content_ref>]`.
2. `buffermixToRecommendedPlaylist` CF fires → writes 2 × `recommended mix playlist` docs (one per profileid).
3. `RecommendedPlaylistTrigger_to_pmd` fires for each new `recommended mix playlist` doc → merges content ids into `participant metadata/{P1,P2}.solarvoice`.
4. **Assertable end state:** `countWhere('recommended mix playlist', [['bufferdocref','==',<buffermixRef>]])` == 2; `participant metadata/P1.solarvoice` contains the seeded content ref ids.

---

## Seed requirements (exact docs/users/refs to seed; reuse seed-test-project helpers where possible)

1. **Admin operator user** — reuse `admin+<run>@example.com` from `seed-test-project.js` with `roles: {admin: true}`. Must exist in `user_data`, `profile_data`, `users_roles`. Ensure `dashboard` docs include `admin` in `roles[]` for all content routes.
2. **Pre-seeded `solar voice audios` docs (N=3)** — seed directly via Admin SDK before the suite. Use unique `testrunid`-scoped `name`s (e.g. `TEST_AUDIO_<run>_1`), `date: Timestamp.now()`, `url: 'https://example.com/test.mp3'`, `duration: 60`. No Storage upload needed for read-path tests.
3. **Pre-seeded `solar voice playlist` doc** — one playlist with `sequence` pointing to the 3 seeded audio refs. Name: `TEST_PLAYLIST_<run>`.
4. **Pre-seeded `episodes` docs (N=2)** — `title: 'TEST_EPISODE_<run>_1'`, `videoUrl: 'https://example.com/test.mp4'`, `convertedtohls: true` (bypass CF), `date: Timestamp.now()`.
5. **Pre-seeded `series` doc** — one series with `seriesName: 'TEST_SERIES_<run>'`, `sequence: [<episode refs>]`, `tier: []`, `order: 1`.
6. **Pre-seeded `category` doc** — `category: 'TEST_CAT_<run>'`, `date: Timestamp.now()`.
7. **Pre-seeded `content analytics` docs (N=5)** — 3 with `type: 'solarvoice'`, 2 with `type: 'eiflixcontent'`, all with `profileid: 'SEED_<run>_P<n>'`, `logdate: Timestamp.now()`, `totaltimespend: 1000`. These are preconditions for the analytics dashboard tests.
8. **Pre-seeded `tier` docs** — at least 2 tiers (`tier: 'Basic'`, `tier: 'Premium'`) with unique `id`s. Required for series/learning-material forms.
9. **Pre-seeded `tier access config` doc** — one doc with `tierid`, `tieraccessby: 'product'`, `productaccess: {}`. Required for ViewTierAccess render test.
10. **Pre-seeded `health stories` doc** — `subject: 'TEST_HEALTH_<run>'`, `description: 'test'`, `date: Timestamp.now()`.
11. **Pre-seeded `adsplaylist` doc** — `adstitle: 'TEST_AD_<run>'`, `available: true`, `startdate: Timestamp.now()`, `enddate: Timestamp.fromDate(new Date(Date.now()+86400000))`.
12. **Pre-seeded `learning-materials` doc** — `name: 'TEST_LM_<run>'`, `description: 'test'`, `files: []`, `date: Timestamp.now()`.
13. **For CF pipeline test (Flow 13):** pre-seeded `participant metadata` docs for `SEED_<run>_P1`, `SEED_<run>_P2` — needed so `RecommendedPlaylistTrigger_to_pmd` has a target doc to update.
14. **For `buffermixToRecommendedPlaylist` CF test:** seed a `buffermix archive` doc with `profileid: ['SEED_<run>_P1','SEED_<run>_P2']`, `solarvoice: [{id:'audio_ref_1'}]`, `eiflix: []`, `generalcontent: []`, `title: 'TEST_BUF_<run>'`, `date: Timestamp.now()`, `expiredate: Timestamp.fromDate(new Date(Date.now()+86400000))`, `personalised: false`.
15. All seeded docs MUST carry `testrunid: TESTRUNID` for teardown. Use `assertWritable(TEST_PROJECT)` guard before any write.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| CN-01 | Auth-gated route: admin login lands on `/audiodashboard` (no bounce, no console error) | REAL-UI | App navigates away from `/login`; URL contains `audiodashboard` — app computed the route transition, not the test | P0 |
| CN-02 | Audio dashboard renders the seeded `solar voice audios` docs: row count matches Firestore count | REAL-UI | App-rendered row count == `countWhere('solar voice audios', [])` (Admin SDK count vs stream-computed table rows) | P0 |
| CN-03 | Create playlist: `onSubmit` writes new `solar voice playlist` doc with correct `name` and `sequence.length` | REAL-UI | Assert `queryWhere('solar voice playlist', [['name','==','TEST_PLAYLIST_<run>']])` returns 1 doc with `sequence.length == seededAudioCount`; the doc was written by the app, the count is the known seeded-audio N | P0 |
| CN-04 | Create series: batch write to `series` and `episodes[].series` arrayUnion | REAL-UI | After form submit, `getDoc('series', newId).seriesName == inputName`; `getDoc('episodes', ep1Id).series` contains the new series ref — both written by the app's writeBatch, asserted against the known input name and seeded episode ids | P0 |
| CN-05 | Series dashboard renders stream, tier filter narrows rows to correct count | REAL-UI | After selecting `free` filter, rendered row count == `countWhere('series', [['type','==','free']])` — both values from independent sources | P1 |
| CN-06 | Episode upload creates `episodes` doc → `ConvertUrltoHLS` CF sets `convertedtohls: true` | CF-SIDEEFFECT | Seed or drive an episode write with `videoUrl` present; poll `getDoc('episodes', id).convertedtohls` until `true` — the CF computed that, not the test | P1 |
| CN-07 | `generalContentUpdate` CF: writing a `content_urls` doc with new `url` triggers `uploadContentToPublitio` → `hlsstatus` flips to `uploading` then `uploaded` | CF-SIDEEFFECT | Seed `content_urls` doc; poll `getDoc('content_urls', id).hlsstatus` until `'uploaded'` — CF-computed against known seeded doc | P1 |
| CN-08 | Content analytics dashboard buckets seeded `solarvoice` rows: rendered "Only SolarVoice" participant count >= seeded solarvoice-only profileids | REAL-UI | Dashboard's `getProfilesOnlyWatchSolarVoice().length` (app-computed from stream) >= 3 (the 3 seeded `solarvoice`-only profiles); seeded count is known | P0 |
| CN-09 | Category dashboard: add category → new doc in `category` collection | REAL-UI | `countWhere('category', [['category','==','NEW_CAT_<run>']])` == 1 after submit; app wrote the doc, test only reads the count back | P1 |
| CN-10 | Category drag-reorder: `series` docs have updated `order` values after drop | REAL-UI | After drag reorder, `getDoc('series', sid1).order != getDoc('series', sid2).order` and both match the new positions — app computed the updateDoc writes | P1 |
| CN-11 | Tier access config renders seeded `tier access config` docs and add-tier creates new doc | REAL-UI | `countWhere('tier access config', [['tierid','==','<seeded_tid>']])` == 1 after dialog submit — app wrote the doc | P1 |
| CN-12 | Learning material CRUD: add → doc exists; edit → `name` field updated; delete → doc absent | REAL-UI | `getDoc('learning-materials', id).name` after add equals the input; after update equals the new name; after delete returns null — all values app-computed | P1 |
| CN-13 | Health stories dashboard renders seeded docs and update writes to `health stories` | REAL-UI | Row count >= 1 (seeded doc rendered by stream); after update dialog submit, `getDoc('health stories', id).subject == newSubject` — app wrote the setDoc | P1 |
| CN-14 | Playlist ads dashboard renders `adsplaylist` stream; create new ad → `adsplaylist` doc written | REAL-UI | `countWhere('adsplaylist', [['adstitle','==','TEST_AD_NEW_<run>']])` == 1 — app wrote the doc | P1 |
| CN-15 | `buffermixToRecommendedPlaylist` CF: seeding a `buffermix archive` doc fans out N recommended-mix-playlist docs (one per profileid × content-type) | CF-SIDEEFFECT | `countWhere('recommended mix playlist', [['bufferdocref','==',<buffermixRef>]])` == seeded N profiles after poll — CF computed the writes, N was known at seed time | P0 |
| CN-16 | `RecommendedPlaylistTrigger_to_pmd` CF: after CN-15, `participant metadata/{P1}.solarvoice` merges in the buffermix content ids | CF-SIDEEFFECT | `getDoc('participant metadata', 'SEED_<run>_P1').solarvoice` contains the playlist id written by CF — CF-computed merge against known seeded profile | P1 |
| CN-17 | Viewparticipantstieraccess: renders `participant metadata` stream; participants with `tier[]` appear in the correct tier bucket on screen | REAL-UI | Seed 2 participant metadata docs with `tier: ['tier_id_1']`; rendered tier bucket for `tier_id_1` shows >= 2 names — app computed the grouping from stream | P2 |
| CN-18 | `/ads` route loads without error (even though click-ads class is commented out — component shell renders) | REAL-UI | Navigate to `/ads`; no fatal console error; URL remains `/ads` (authGuard admitted); empty component renders — app computed the route admission | P2 |

---

## ATC exclusions within this group

The following ATC touchpoints were found in this group's source files. Each is excluded from all tests per CLAUDE.md.

1. **`atc taxonomy` reads** — present as read-only cosmetic tag lookups in:
   - `audio-dashboard.component.ts:101` (`getDocs(collection(firestore, 'atc taxonomy'))`)
   - `solar-playlist.component.ts:88` (`collectionSnapshots(atctaxonomyRef)`)
   - `playlist-dashboard.component.ts:70` (`collectionSnapshots(atctaxonomyRef)`)
   - `content-upload.component.ts:92` (`collectionSnapshots(atctaxonomyRef)`)
   - `episodes-dashboard.component.ts:73` (`collectionSnapshots(atctaxonomyRef)`)
   **Decision:** `atc taxonomy` is classified as "reference-only config" in CLAUDE.md — safe to read. However, **no test should seed, assert counts against, or write to `atc taxonomy`**. Tests that exercise these screens must not depend on `atc taxonomy` being present; tag display simply shows blanks if absent.

2. **No other ATC collection reads/writes** were found in `src/app/content/**` or `src/app/content-upload-version2/**`. Specifically: `atc_alpha`, `atc_initiated`, `atc_notes`, `atc_to_validate`, `ai_generated_atc_summary`, `triple atc`, `temporary_tripleatc`, `assignment_*atc*`, `big assignment atc_alpha`, `big temporary_ATC`, `0 atcinvolved issue` — not referenced anywhere in this group's source.

3. **`src/app/ATC/**` components** are entirely separate from this group's routes and are excluded entirely from the test pipeline.

---

## Risks / unknowns

1. **`/ads` route loads a fully-commented-out component class** — `click-ads.component.ts` has its entire `@Component` class commented out (lines 1-150 are `//`). The route is still registered (`app.routes.ts:100`). Angular may throw a compile/load error or load an empty shell. Verify before asserting anything about this route (CN-18 is P2 and low-risk). The `UpdateAdsComponent` inner class at line 257 IS active and writes to `ads` via `setDoc`/`updateDoc`. Whether the `ads` route resolves to `ClickAdsComponent` (the commented stub) or a different component needs verification.

2. **`content analytics` is read-only in Angular** — no web-layer write exists (`CONTENT-ENGAGEMENT.md §8`). Tests that need seeded analytics data MUST seed via Admin SDK directly. Do NOT attempt to seed via any Angular route.

3. **Storage upload flows** — `ConvertUrltoHLS`, `generalContentUpdate`, and `uploadContentToPublitio` all depend on the Publitio third-party API. On the cloud test project these CFs are deployed but Publitio secrets may not be configured for the test project. CN-06 and CN-07 should skip gracefully if the CF does not flip `convertedtohls` within the poll window, with a `test.skip` condition checking if the field is already `true` from a prior run.

4. **Duplicate route registrations** — `content-upload-v2`, `audiodashboard`, `videodashboard`, `healthstories`, `contentupload`, `learningmaterial` appear both inside a child-routes block (lines 38-87) AND as top-level routes (lines 91-128) in `app.routes.ts`. The effective route (last match wins in Angular) is the top-level registration. Tests should navigate to the top-level paths; the child-block registrations appear to be a legacy artifact.

5. **`authGuard` requires a `dashboard` Firestore doc for each route** — if the cloud test project's `dashboard` collection does not have entries for content routes, the guard returns `hasAccess = false` even for `admin` users (`authguard.service.ts:325-346`). Seed at minimum one `dashboard` doc covering `roles: ['admin']` for `/audiodashboard` as a precondition before CN-01 / CN-02.

6. **`content analytics` has 81% type-fill** — untyped rows exist. CN-08 uses a lower bound (`>=`) assertion; do not assert an exact count unless using run-scoped seeded rows.

7. **`tier access config` gating is display-only in the Angular web client** — `CONTENT-ENGAGEMENT.md §4 caveat`. Do not assert that tier config prevents content access in the Angular app; assert only the Firestore read and display behavior.

8. **`RecommendedPlaylistTrigger_to_pmd` creates a `set({merge:true})`** — if `participant metadata/{P1}` does not yet exist, the CF will still write. If it does exist, it merges. Both cases are valid; seed the `participant metadata` doc for predictable assertions (seed requirement #13).

9. **`buffermixToRecommendedPlaylist` CF uses `batch.commit` in chunks of 400** — for small N (2 profiles × 1 type = 2 docs), a single batch commit suffices. The `status: 'completed'` written back to the `buffermix archive` doc (content.js:222) is an additional assertable side-effect for CN-15.

10. **`adsseries` route does not appear in the active route table** — the routes for this concept group do not include a standalone `/addseries` child path; it exists only as `seriesdashboard/addseries` (app.routes.ts:109). Navigate as `/seriesdashboard/addseries` in tests for CN-04.
