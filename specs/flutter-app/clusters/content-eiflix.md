# Cluster: EIFlix video, Eiflix TV, related/recommended playlists, saved content, ads

## Overview
For the participant, EIFlix is the app's "Netflix-style" educational video service: a dedicated bottom-nav tab (`EIFlixHome`, tab index 3, label "EiFlix") that lists **series** (each series = an ordered `sequence` of **episodes**) grouped into rails — promotional hero banners/workshops, Continue Watching, My List, Recommended Playlist, and category/tier-gated rows. Tapping a series opens a preview + episode list (`episode`), and an episode plays full-screen via BetterPlayer (`episodePlayer`), saving watch progress to `content analytics`. Access to each series is tier-gated: free series and "recommended" series are always unlocked; otherwise the participant's `tier` (in `participant metadata`) must overlap the series' `tier`, and locked series open a tier-eligibility explainer (`TierScreen`) that can raise a support ticket. The participant can search series/episodes (`searchbar`, with local SharedPreferences history), bookmark series into "My List" / saved content (`SavedContent`, `eiflixmylist`), and watch cross-type **Recommended Mix** playlists (`Recommenedmixplaylist`, mixing general content + Solar Voice + EIFlix). Two adjacent features round out the cluster: **Ads playlists** (`Adsplaylists`, a curated video playlist with a "Buy Now" external link) and a generic **related-video player** (`PlayRelatedVideo`, for general `content_urls`). Finally, **Eiflix TV** (`TVAuthHandler` in `Eiflix tv/tvauth.dart`) handles a QR/deep-link TV-login approval flow: the phone app approves a `tv_auth_sessions` request so a TV device can sign in.

## Screens

| Screen | file:line | Purpose |
|---|---|---|
| `EIFlixHome` | `lib/EIFlix/eiflixHome.dart:22` | Main EiFlix tab. Hero carousel (workshops + `eiflixbanner` banners), Continue Watching, My List, Recommended Playlist, category/tier rails, search entry, deep-link-to-series. |
| `episode` (series detail) | `lib/EIFlix/episode.dart:16` | Series preview (muted 30s trailer of first episode), description, Play/Resume button, My List toggle, scrollable episode list with FREE/UNLOCK badges; gates locked content to `TierScreen` dialog. |
| `episodePlayer` | `lib/EIFlix/episodePlayer.dart:14` | Full-screen landscape BetterPlayer for an EIFlix episode (`type:"eiflixcontent"`); writes watch analytics, updates playlist/participant-planning completion. |
| `searchbar` | `lib/EIFlix/search.dart:12` | EiFlix search over locally-cached series+episodes; recent-search history in SharedPreferences; access-gated results. |
| `TierScreen` | `lib/EIFlix/tier.dart:13` | Tier-eligibility explainer for a locked series: which series each higher tier unlocks + eligibility (journeys/products); "Help" raises a support ticket. |
| `SavedContent` | `lib/savedContent.dart:10` | Saved/bookmarked list for one content type (`eiflix` / `generalcontent` / `solarvoice`), read from the user's `*mylist` arrays. |
| `Recommenedmixplaylist` | `lib/recommenedmixplaylist.dart:14` | "For You, NOW" personalised curated playlist (general content + Solar Voice + EIFlix), with per-type completion progress; home-embed (`fullscreen:false`) + full page. |
| `Adsplaylists` | `lib/adsPlaylist.dart:17` | Curated ad/video playlist player with title/description, "Buy Now" external link, and sequential video list. |
| `PlayRelatedVideo` | `lib/playRelatedVideo.dart:15` | Generic related/recommended video player for `content_urls` (general content), with tag-based "similar videos" fetch and bookmark toggles. |
| `TVAuthHandler` / `DeepLinkHandler` | `lib/Eiflix tv/tvauth.dart:5` / `:304` | "Eiflix TV" login: handles `/tv-auth?session_id=` deep link, shows approve/deny dialog, writes approval (with user data) to `tv_auth_sessions`. |
| `series` (DEAD) | `lib/EIFlix/series.dart:8` | Legacy series grid reading the old `user` collection. Orphaned (no imports). |
| `myList` (DEAD) | `lib/EIFlix/myList.dart:10` | Legacy swipe-to-delete My List reading old `user.list`. Orphaned (no imports). |

## Features

### Browse EiFlix home rails (series, categories, recently-added)
- **What the user does:** Opens the EiFlix tab and scrolls rails: hero carousel, Continue Watching, My List, Recommended Playlist, and category/tier-grouped series/episode rows (full-access, partial-access, no-access).
- **Nav/entry:** Bottom-nav tab index 3 "EiFlix" (`home.dart:2108` builds `EIFlixHome()`). Rails built in `eiflixHome.dart:1156-1909` via `localTheme.series/cateoryseries/catgoryepisodes/episodes` (Themes.dart widgets, outside cluster).
- **Reads:** `episodes` (`orderBy date asc`, all docs → `mapEpisodes`, `eiflixHome.dart:789`); `category` (all docs, `sequence` ref lists, `:826`); `series` (`orderBy date desc`, `:838`) — computes per-series `access` from `usermetadata['customerstatus']=="active"` + `usermetadata['tier']` overlap with `series.tier[].id` OR `series.type=='free'` OR recommended (`:843-858`); `content analytics` where `profileid==loggedinProfile.profileid` & `from=="eiflixcontent"` `orderBy logdate desc limit 10` for Continue Watching (`:1030`). In-memory `appService.recommendedEiflix` (recommended series) and `usermetadata['eiflixmylist']` (My List) drive the My List / Recommended rails (`:808,890`).
- **Writes:** None on load (display only).
- **Endpoints:** None (direct Firestore). `posthog.screen("EIFlix")` (`:1086`).
- **Config flags:** No RemoteConfig. `static meta data/Workshop Admin.showworkshopinapp` toggles the Workshop tab (`:194-198`); `eiflixbanner.enableapp` filters hero banners (`:244`); per-series `type` (`free`/`exclusive`/other) and `tier[]` gate access (`exclusive` series are skipped from rails, `:882`).
- **Journey stage:** content
- **e2e-testability:** Yes — seed `series`, `episodes`, `category`, and `participant metadata` (tier/customerstatus/eiflixmylist); assert rails + access tiering render. No ATC.

### Open a series (preview + episode list)
- **What the user does:** Taps a series; sees a muted auto-playing 30-second preview of episode 1, the series name/description, a Play/"Resume Episode N" button, a My List toggle, and the full ordered episode list (each with FREE or UNLOCK badge and a watched-progress thumbnail).
- **Nav/entry:** From any home rail/recommended/banner/deep-link tap → `episode(seriesid:, seriesName:, sequence:, seriesRef: series/{id}, allowAccess:)` (`eiflixHome.dart:155,1412`; recommended at `recommenedmixplaylist.dart:611`; search at `search.dart:319`).
- **Reads:** `series/{seriesid}` (full doc, `episode.dart:68`); `tier` (all docs → `tierMap`, `:74`); `episodes` where `documentId whereIn sequenceIds` (`:120`); `content analytics` where `profileid==…` & `playlistid==seriesid` `orderBy logdate desc` to mark resume position (`:150`). Recompute `access` from `recommendedEiflix` / `type=='free'` / `allowAccess` / tier overlap (`:103-109`).
- **Writes:** None on open (My List toggle is a separate feature below).
- **Endpoints:** None. `video_player` plays the trailer stream (`hsl_stream`/`videoUrl`) capped at 30s (`:166-176`).
- **Config flags:** Per-series `type=='free'` and `tier[]`; `customerstatus`.
- **Journey stage:** content
- **e2e-testability:** Yes — seed a series + its episodes; assert preview, episode list, badges, and locked vs unlocked button. (Trailer autoplay needs a reachable video URL.) No ATC.

### Play an EIFlix episode (watch + progress)
- **What the user does:** Taps Play/Resume or an unlocked episode; the episode plays full-screen in landscape; watch time and completion are saved so Continue Watching/Resume reflect progress.
- **Nav/entry:** `episode` Play button / episode row → `episodePlayer(type:"eiflixcontent", videoUrl: hsl_stream||videoUrl, episode:, seriesId:, seriesSequence:, seriesSequnceData:, playingFrom:)` (`episode.dart:516,610`).
- **Reads:** If `seriesSequnceData` empty, re-fetches `series/{seriesId}` + `episodes` (whereIn sequence) to build the playlist (`episodePlayer.dart:127-141`); `content analytics` where `playlistid==seriesId` & `status=="complete"` for completed episodes (`:156`). Playback via `appService.getContent(...)` which reads `content analytics` for last-watched resume (`AppServices.dart:2612`).
- **Writes:** Watch analytics buffered to **local SQLite** `contentanalytics` then synced to Firestore **`content analytics`/{docid}** (fields: `profileid, videoid, videoname, totalruntime, lastwatchedtime, totaltimespend, logdate, playlistid, contentfrom:"eiflixcontent", contenttype, status`) via `appService.getContent` + `syncAnalytics` batch (`AppServices.dart:2660-2714, 2343-2371`); also `participant content analytics/{profileid}` aggregate (`AppServices.dart:2427+`). On completion with `playingFrom=="participantplanning"` → `appService.updateparticipantplanning(type:"eiflix", …)` (`episodePlayer.dart:455`); `recommended mix playlist` completion is updated when played from recommended/mode contexts (via `updatedPlaylistCompletion`/`updateModePlaylistCompletion`).
- **Endpoints:** HLS source `https://media.publit.io/file/{responsepublitio.id}.m3u8` when `responsepublitio` present, else raw `url`/`hsl_stream` (`AppServices.dart:2600-2602`). PostHog "Watching … Content" capture is in commented-out legacy timer code (`episodePlayer.dart:559`) — not the live path. Cast (`screen_cast_devices`) is fully commented out.
- **Config flags:** None (RemoteConfig absent). `wakelock_plus` keeps screen awake.
- **Journey stage:** content
- **e2e-testability:** Partial — navigation + analytics-write are assertable (seed a series/episode, assert a `content analytics` doc with `contentfrom:"eiflixcontent"`), but actual BetterPlayer playback/landscape/completion is hard to drive in CI. No ATC.

### Add / remove a series from "My List"
- **What the user does:** Taps the My List (add/done) button on a series; the series is bookmarked (or removed). Bookmarked series appear in the home "My List" rail and in Saved EiFlix.
- **Nav/entry:** "My List" `ElevatedButton.icon` on `episode` (`episode.dart:559-590`); same pattern (`generalcontentmylist`) on `PlayRelatedVideo` (`playRelatedVideo.dart:582,680`).
- **Reads:** `usermetadata['eiflixmylist']` to show toggled state.
- **Writes:** `appService.contentMylist(metadataKey:"eiflixmylist", docId: series.id)` → `participant metadata/{profileid}.update({ eiflixmylist: arrayUnion/arrayRemove([docId]) })` (`AppServices.dart:3639-3641`); haptic vibrate.
- **Endpoints:** None.
- **Config flags:** None.
- **Journey stage:** content
- **e2e-testability:** Yes — tap toggle; assert `participant metadata.eiflixmylist` contains/omits the series id. No ATC.

### View saved EiFlix / general / Solar Voice content
- **What the user does:** Opens a "Saved {type}" screen listing previously bookmarked items for that content type.
- **Nav/entry:** `SavedContent(contentType: "eiflix"|"generalcontent"|"solarvoice")` — reached from My Profile dashboard (`myProfileDashboard.dart:3345`) and Solar Voice / Themes entry points (`solarvoiceHome.dart:457`, `Themes.dart:572`). (No direct EiFlix-tab button found for `eiflix` type — see open questions.)
- **Reads:** `usermetadata['eiflixmylist' | 'generalcontentmylist' | 'solarvoicemylist']` as the id list, then chunked `where documentId whereIn chunk` over the matching collection — **`series`** (eiflix), **`content_urls`** (generalcontent), **`solar voice playlist`** (solarvoice) (`savedContent.dart:32-69`).
- **Writes:** Un-bookmark from the general-content row → `appService.contentMylist(metadataKey:"generalcontentmylist", …)` → `participant metadata` update (`savedContent.dart:192`). EiFlix saved items render via `localTheme.eiflixui` (tap → series detail).
- **Endpoints:** None.
- **Config flags:** None.
- **Journey stage:** content
- **e2e-testability:** Yes — seed `eiflixmylist` + matching `series` docs; assert list renders; toggle removal for general content. No ATC.

### Search series & episodes
- **What the user does:** Taps the search icon on EiFlix, types a query; sees matching series and episodes (access-gated, with UNLOCK badges) and a recent-search history; can clear/remove history entries.
- **Nav/entry:** Search `IconButton` in EIFlixHome app bar → `searchbar(userTier: usertier)` (`eiflixHome.dart:1109-1119`).
- **Reads:** On open, caches **all** `series` + all `episodes` (`search.dart:65-66`); builds access per series (recommended / `type=='free'` / tier overlap, `:93-101`); local in-memory filtering by name/description/keywords (series) and title/description (episodes, only those mapped to a parent series). Recent searches from **SharedPreferences** key `eiflix_search_history` (`:140-143`).
- **Writes:** SharedPreferences `eiflix_search_history` on each accepted tap (`saveSearchHistory`, `:151-157`). No Firestore writes.
- **Endpoints:** None. Tapping a result → `episode(...)` (series) or `episodePlayer(...)` (episode); locked → dialog "Contact A&H support".
- **Config flags:** None.
- **Journey stage:** content
- **e2e-testability:** Yes — seed series/episodes; type a query; assert result cards + lock state; assert history persists. (SharedPreferences is local — clears between fresh installs.) No ATC.

### View tier-eligibility explainer for a locked series & raise access ticket
- **What the user does:** On a locked series, opens an explainer showing which series the current tier already unlocks and which higher ("locked") tiers unlock more, plus eligibility (be in a journey / complete products); taps "Help" → confirms → raises a support ticket requesting access.
- **Nav/entry:** `TierScreen(tiermap:, usertierorder:, seriesName:)` opened from `Themes.dart:5891` (the tier-eligibility dialog path used when a locked series/episode is tapped — `localTheme.tierEligibilitydialog` in `episode.dart:485,624`).
- **Reads:** `series` (all, to list series per tier, `tier.dart:43`); `journey` (all → journey names, `:49`); `tier access config` where `tierid whereIn [unlocked-or-higher tiers]` → per-tier `productaccess` keyed by `journeyid` (`:79-91`). Uses in-memory `appService.profileJourneyProduct`, `mappedProduct`, `usermetadata['activejourney']`.
- **Writes:** "Help" → `appService.raiseTickets(message:"Requesting access to the {series} playlist (Tier …)…", chatCategoryname:"Eiflix Workshop", …)` → reads `chat config` (categories) + writes **`clientissue`/{id}** and **`clientissue/{id}/messages`/{id}** (batch) and navigates to the ticket chat (`AppServices.dart:3647-3716`).
- **Endpoints:** None (direct Firestore).
- **Config flags:** None.
- **Journey stage:** support
- **e2e-testability:** Yes — seed `series`/`journey`/`tier access config` + a `chat config` with an "Eiflix Workshop" category; open the explainer and raise a ticket; assert `clientissue` doc created. No ATC.

### Watch a Recommended Mix ("For You, NOW") playlist
- **What the user does:** Sees a personalised curated card (mixing Educational Content, Solar Voice, EIFlix) with a circular completion %; taps to open the playlist or "View All"; inside, taps a general-content video, a Solar Voice playlist, or an EiFlix series to play it.
- **Nav/entry:** Home-embedded `Recommenedmixplaylist(fullscreen:false)` (`homeContent.dart:8403`, gated on any recommended list non-empty); "View All"/card → `Recommenedmixplaylist()` / `Recommenedmixplaylist(recommenedbufferid:)` (`recommenedmixplaylist.dart:695,729`). Deep link `…/recommendedmix/{bufferid}` (`home.dart:205`).
- **Reads:** Builds from in-memory `appService.recommendedGeneralContent + recommendedSolarVoice + recommendedEiflix` (sourced from `home.dart:523` snapshot on **`recommended mix playlist`** where `profileid==…` & `date>now-2months`, type-split, expiry-filtered, `delete!=true`). For each buffer, resolves each `list[]` `DocumentReference` via `ref.get()` (reads `content_urls` / `solar voice playlist` / `series`) and computes completion from `completedcontent`/`completedplaylist` (`recommenedmixplaylist.dart:46-147`).
- **Writes:** None directly (completion is written by the player flows when content is finished — see "Play an EIFlix episode" / `PlayRelatedVideo`, via `appService` playlist-completion helpers that update `recommended mix playlist`).
- **Endpoints:** None. Tap targets: `PlayRelatedVideo(from:"generalrecommendation")`, `SolarVoicePlaylist`, `episode`.
- **Config flags:** None (RemoteConfig absent).
- **Journey stage:** content
- **e2e-testability:** Yes — seed `recommended mix playlist` docs (one per type) with `list[]` refs and matching `content_urls`/`series`/`solar voice playlist`; assert card, %s, and per-type rails. No ATC.

### Play a related / similar general-content video
- **What the user does:** Watches a general-content video full-width; below it, an auto-built list of "similar" videos (by shared tags) or a passed related list; can bookmark each into general-content My List.
- **Nav/entry:** `PlayRelatedVideo(contentID:, contentData:, relatedContent:, from:)` — from `SavedContent` general-content rows (`savedContent.dart:136`), recommended mix general rail (`recommenedmixplaylist.dart:279`), and other content surfaces.
- **Reads:** If `contentData==null`, `content_urls/{contentID}` (`playRelatedVideo.dart:50`) then `content_urls` where `available==true` (+ `arrayContainsAny tags`) `orderBy documentId startAt(randomId) limit 15` for similar videos (`:61-72`, with a top-up query, `:85-92`). Playback via `appService.getContent(videoFrom: from, videoType:"generalcontent")`.
- **Writes:** Bookmark → `contentMylist(metadataKey:"generalcontentmylist", …)` → `participant metadata` (`:582,680`). Watch analytics → `content analytics` + `participant content analytics` (via `getContent`). On completion: `from=="generalcontent"|"moderecommendation"` → `updateModePlaylistCompletion("generalcontent", …)`; `from=="participantplanning"` → `updateparticipantplanning`; `from` starting `bigactivityplaylist/…` → updates **`big participants assignments/{docId}`** (`pendingepisode` arrayUnion; `status:"completed"` when count hits target) (`playRelatedVideo.dart:291-308`).
- **Endpoints:** HLS `media.publit.io` (via `getContent`). Share string `https://breakthroughs.app/generalcontent/{docid}` is in a commented block (`:569`). Cast/QR (`screen_cast_devices`) fully commented out (`:408`).
- **Config flags:** None.
- **Journey stage:** content
- **e2e-testability:** Partial — similar-video fetch + bookmark + analytics are assertable; the `bigactivityplaylist` completion path touches `big participants assignments` (a `big …` collection — verify it is NOT ATC-restricted before seeding; it is a *big-assignment*, not `big assignment atc_alpha`). No ATC tokens in this file.

### Watch an Ads playlist & open "Buy Now" link
- **What the user does:** Opens a curated ads/video playlist (title, description, player, sequential video list) and can tap "Buy Now" to open an external product link.
- **Nav/entry:** `Adsplaylists(adsPlaylist:)` — from deep link (`deeplinkNavigation.dart:44`), mode widgets (`adsplaylistQueue.dart:105`), and Themes home surfaces (`Themes.dart:3360`).
- **Reads:** `content_urls` where `documentId whereIn` each chunk of `adsPlaylist['playlist'][].id` (`adsPlaylist.dart:64-67`). Playback via `appService.getContent(videoFrom:"adsplaylist", videoType:"generalcontent")`.
- **Writes:** Watch analytics → `content analytics` (`contentfrom:"adsplaylist"`) + `participant content analytics` via `getContent`. No other writes (PostHog capture + analytics timer are in commented legacy code).
- **Endpoints:** `url_launcher.launchUrl(adsPlaylist['adslink'], externalApplication)` on "Buy Now" (`:300-304`); HLS via `getContent`. `posthog.screen("Ads Playlist")` (`:196`). Share string commented out (`:344`).
- **Config flags:** None.
- **Journey stage:** content (commerce-adjacent — external purchase link)
- **e2e-testability:** Partial — seed an ads-playlist map + `content_urls`; assert title/list render and analytics write. The external "Buy Now" handoff leaves the app and is not assertable in-app. No ATC.

### Approve / deny an Eiflix TV login (QR / deep link)
- **What the user does:** Scans a TV's QR (or opens a `/tv-auth?session_id=` deep link); the phone shows "Sign in attempt from new device" with the device name and Allow/Close; tapping Allow signs the TV in to the participant's account.
- **Nav/entry:** Deep link handled in `home.dart:168` / `homeContent.dart:1277` via `TVAuthHandler.handleTVAuthDeepLink(context, sessionId)` (`tvauth.dart:9`). `DeepLinkHandler.handleIncomingLink` parses the URI (`:307-318`).
- **Reads:** `tv_auth_sessions/{sessionId}` (validates `status=="pending"`, `expires_at`, `device_info`) (`tvauth.dart:17-40`); on approve, `profile_data` where `profileid==loggedinProfile.profileid limit 1` for display name/phone/avatar (`:226-230`).
- **Writes:** On Allow → `tv_auth_sessions/{sessionId}.update({ status:"approved", approved_at, approved_by(uid), approved_by_email, approved_by_profileid, user_data:{…uid,email,profileid,display_name,phone,…} })` (`tvauth.dart:258-265`); on error → `status:"error"` (`:271-275`). `_denyTVAuth` writes `status:"denied"` but its caller is commented out (`:183`).
- **Endpoints:** None (direct Firestore). Firebase Auth (`auth.currentUser`) for identity.
- **Config flags:** None.
- **Journey stage:** infra (cross-device auth)
- **e2e-testability:** Partial — seed a `tv_auth_sessions` doc with `status:"pending"`; drive the deep link / dialog and assert `status` flips to `approved` with `user_data`. Reaching it requires a deep-link trigger and a logged-in user; the QR scan itself is out of app scope. No ATC.

### [DEAD] Legacy series grid & swipe-to-delete My List
- **What the user does:** (Historically) browsed a category series grid (`series`) and a swipe-to-delete My List (`myList`) backed by the old `user` collection.
- **Nav/entry:** **None** — `series` and `myList` classes have no imports/instantiations anywhere in `lib/` (grep confirmed). The only references are commented-out `EIFlixHome()` nav stubs inside these dead files.
- **Reads:** `user/{auth.uid}` (`tier`, `list`), `series`, `category`, `tier` (`series.dart:40-76`, `myList.dart:30-43`).
- **Writes:** `user/{uid}.update({ list: arrayRemove([seriesRef]) })` on dismiss (`myList.dart:183-191`).
- **Endpoints:** None.
- **Config flags:** None.
- **Journey stage:** content — but dead.
- **e2e-testability:** **No** — dead/orphaned; uses the legacy `user` collection that the live app replaced with `participant metadata` + `eiflixmylist`. Do not seed/test. No ATC.

## Firestore collections

### Read (with field / where notes)
- `series` — all docs (`orderBy date desc`); fields `seriesName`, `description`, `imageUrl`, `sequence[]` (refs → `episodes`), `tier[]` (refs → `tier`), `type` (`free`/`exclusive`/…), `id`, `date`, `keywords[]`. Per-doc `access` is computed client-side. Read in `eiflixHome.dart:838`, `episode.dart:68`, `search.dart:65`, `tier.dart:43`, `series.dart:66` (dead), `savedContent.dart` (eiflix), and via recommended `ref.get()`.
- `episodes` — `orderBy date asc` (home) / `where documentId whereIn sequenceIds` (series/player/search); fields `title`, `description`, `id`, `hsl_stream`, `videoUrl`, `hsl_thumbnail`, `screenshot`, `imageUrl`, `date`. (`eiflixHome.dart:789`, `episode.dart:120`, `episodePlayer.dart:133`, `search.dart:66`.)
- `category` — all docs; field `sequence[]` (refs → series), `id`, `category`. (`eiflixHome.dart:826`, `series.dart:72`.)
- `tier` — all docs → `tierMap`; fields `tier`, `order`. (`episode.dart:74`, `series.dart:53`.)
- `tier access config` — `where tierid whereIn [tier ids]`; field `productaccess` (map keyed by journeyid → `[{productid}]`). (`tier.dart:79`.)
- `journey` — all docs; field `journey` (name). (`tier.dart:49`.)
- `content analytics` — `where profileid==… & from=="eiflixcontent" orderBy logdate desc limit 10` (Continue Watching, `eiflixHome.dart:1030`); `where profileid==… & playlistid==seriesid orderBy logdate desc` (resume, `episode.dart:150`); `where playlistid==seriesId & status=="complete"` (completed episodes, `episodePlayer.dart:156`); also read inside `appService.getContent` for last-watched resume.
- `recommended mix playlist` — `where profileid==… & date>now-2months` (live snapshot, `home.dart:523`); also `where profileid==…` in `appService.updatedPlaylistCompletion` (`AppServices.dart:2262`). Fields `type` (`generalcontent`/`eiflix`/`solarvoice`), `list[]` (refs), `completedcontent[]`, `completedplaylist[]`, `status`, `expiredate`, `date`, `delete`, `bufferdocref`, `title`, `description`.
- `content_urls` — `where documentId whereIn` (saved general content, ads playlist); `/{contentID}` + `where available==true [+ arrayContainsAny tags] orderBy documentId startAt limit` (PlayRelatedVideo similar). Fields `title`, `thumbnail`, `tags[]`, `available`, `url`, `hsl_stream`, `responsepublitio`, `docid`. (`savedContent.dart:64`, `adsPlaylist.dart:64`, `playRelatedVideo.dart:50,61`.)
- `solar voice playlist` — `where documentId whereIn` (saved solarvoice, `savedContent.dart:38`); plus recommended `ref.get()`.
- `participant metadata/{profileid}` — `tier`, `customerstatus`, `eiflixmylist`, `generalcontentmylist`, `solarvoicemylist`, `activejourney` (consumed via `appService.usermetadata`, sourced upstream in `home.dart`).
- `tv_auth_sessions/{sessionId}` — `status`, `expires_at`, `device_info{device_brand,device_model}` (`tvauth.dart:17`).
- `profile_data` — `where profileid==… limit 1` (TV-auth user data, `tvauth.dart:226`); plus `profile_data/{pid}.update({referralcode})` write below.
- `chat config` — first doc `categories` (filtered by category name) for ticket raising (`AppServices.dart:3653`).
- **[DEAD]** `user/{uid}` — legacy `series.dart`/`myList.dart` only (`tier`, `list`).

### Written (with field / when notes)
- `participant metadata/{profileid}` — `update({ eiflixmylist|generalcontentmylist|solarvoicemylist: arrayUnion/arrayRemove([docId]) })` on My List toggle (`AppServices.dart:3639`, called from `episode.dart`, `playRelatedVideo.dart`, `savedContent.dart`).
- `content analytics/{docid}` — `set` watch-progress (buffered via SQLite `contentanalytics`, synced) with `contentfrom` = `eiflixcontent`/`generalcontent`/`adsplaylist` (`AppServices.dart:2343,2371` `syncAnalytics`; `2660-2714` getContent).
- `participant content analytics/{profileid}` — aggregate analytics doc updated by `getContent`/sync (`AppServices.dart:2427,2462,2495`).
- `recommended mix playlist/{doc}` — `update({ completedcontent, completedplaylist?, status? })` when content/playlist completed (`AppServices.dart:2294-2333`, via player onComplete).
- `big participants assignments/{docId}` — `update({ pendingepisode: arrayUnion([episodeRef]) })` then `update({ status:"completed" })` when count==target, only when `PlayRelatedVideo.from` starts `bigactivityplaylist/…` (`playRelatedVideo.dart:297-305`). (A *big-assignment*, not an ATC `big assignment …` collection — confirm before seeding.)
- `tv_auth_sessions/{sessionId}` — `update({ status:"approved"|"error"|"denied", approved_at/error_at/denied_at, approved_by, approved_by_email, approved_by_profileid, user_data })` (`tvauth.dart:258,271,284`).
- `profile_data/{profileid}` — `update({ referralcode })` lazily when sharing a workshop/EiFlix referral from the hero carousel (`eiflixHome.dart:1334-1337`).
- `clientissue/{id}` + `clientissue/{id}/messages/{id}` — `batch.set` on tier-access support ticket (`AppServices.dart:3707-3709`).
- **[DEAD]** `user/{uid}` — `update({ list: arrayRemove })` in `myList.dart:183`.

## Endpoints & external services
- **No Cloud Functions / `httpsCallable` / Dio / Storage `.ref()`** anywhere in the cluster (grep-verified). All data access is direct Firestore.
- **Video streaming:** BetterPlayer (`better_player_plus`) for episodes/ads/related; `video_player` for the 30s series trailer. HLS URLs built as `https://media.publit.io/file/{responsepublitio.id}.m3u8` when `responsepublitio` is present, else raw `url`/`hsl_stream` (`AppServices.dart:2600-2602`).
- **`url_launcher`** (external app/browser): ads "Buy Now" `adslink` (`adsPlaylist.dart:303`); hero workshop/banner external links (`eiflixHome.dart:1402`).
- **`share_plus`:** referral share message (workshop/EiFlix URLs vary by Firebase project — see below) (`eiflixHome.dart:1373`).
- **PostHog:** `posthog.screen("EIFlix")` (`eiflixHome.dart:1086`), `posthog.screen("Ads Playlist")` (`adsPlaylist.dart:196`). `posthog.capture("Watching … Content")` calls exist only inside commented-out legacy timers (episodePlayer/playRelatedVideo/adsPlaylist) — not live.
- **SharedPreferences:** EiFlix search history under key `eiflix_search_history` (`search.dart`) — the only persistent-prefs use in the cluster.
- **Local SQLite (`sqflite`):** `contentanalytics` table buffers watch progress before Firestore sync (episodePlayer/playRelatedVideo/adsPlaylist via `appService.initAnalyticsSQLite`/`syncAnalytics`).
- **Firebase Auth:** `auth.currentUser` for TV-auth identity and (dead) legacy `user/{uid}` reads.
- **3 Firebase projects (referenced):** referral/workshop share URLs branch on `Firebase.app().options.projectId` — `fir-sample-aae4a` → `https://eiflix.com/...` (production), `starlabs-test` → `https://eiflix-workshop.web.app/...` (`eiflixHome.dart:1342-1359`). No other project literals.

## Config & feature flags
- **No RemoteConfig / Remote Config** in any cluster file (grep-verified).
- **No FirebaseMessaging** in any cluster file.
- **Data-driven gates (Firestore, not a flag service):**
  - Series access — `participant metadata.customerstatus=="active"` + `participant metadata.tier[]` overlap with `series.tier[].id`, OR `series.type=='free'`, OR series is in `recommendedEiflix` (`eiflixHome.dart:843-858`, `episode.dart:103-109`, `search.dart:93-101`).
  - Workshop tab — `static meta data/Workshop Admin.showworkshopinapp` (`eiflixHome.dart:197`); workshop visibility — `workshopconfiguration.active` / `testmode`+`testusers` (`:202-210`); hero — `heromobile` (`:1224`).
  - Hero banners — `eiflixbanner.enableapp` + `order` (`eiflixHome.dart:244`); banner action `path` (`External Link` vs series) (`:1384`).
  - `series.type=='exclusive'` series are excluded from rails (`eiflixHome.dart:882`).
- **e2e hooks present:** none found (no widget `Key('e2e-…')` in cluster files). Screens are reached by bottom-nav/route/deep-link, not test keys.

## Dead / clone / Old code
- **`lib/EIFlix/series.dart` (`series`)** — orphaned (no imports/instantiations in `lib/`); reads the legacy `user` collection (`auth.uid`) replaced by `participant metadata`. Map only; never seed/test.
- **`lib/EIFlix/myList.dart` (`myList`)** — orphaned (no imports); legacy `user.list` swipe-to-delete. Dead.
- **Large commented blocks (live files):** `eiflixHome.dart` legacy `buildCarouselItem` (`:589-782`), old workshop/`heroTrailer`/`recommended mix playlist` loops (`:84-140, 800-807, 1918-1976`), old share-button positions. `episodePlayer.dart` is dominated by commented legacy BetterPlayer/timer/`user/watchedVideos` analytics + an entire alternate `build` (`:966-1032`). `playRelatedVideo.dart` legacy timer + QR-cast (`screen_cast_devices`) block (`:323-424`). `adsPlaylist.dart` legacy timer + thumbnail block (`:128-191, 443-479`). All dead.
- **`_denyTVAuth`** (`tvauth.dart:281`) — implemented but its only call site (in the dialog "Close") is commented out (`:183`); deny path is currently unreachable from the UI.
- **`series.dart`/`myList.dart` notification/search IconButtons** — onPressed empty or commented (dead UI even within the dead files).

## Notes & open questions
- **My List vs Saved EiFlix entry:** `episode` writes `eiflixmylist` and the EiFlix home renders a "My List" rail from it, but I found **no EiFlix-tab button that opens `SavedContent(contentType:"eiflix")`** — only `generalcontent`/`solarvoice` entries were found (Profile dashboard / Solar Voice / Themes). The EiFlix saved-list screen builds and is reachable generically (`myProfileDashboard.dart:3345` passes a dynamic `contenttype`); confirm whether EiFlix saved content is surfaced to users or only via the home rail.
- **Completion write-back coupling:** EIFlix/related players don't write `recommended mix playlist`/`participant planning`/`big participants assignments` directly except through `appService` helpers (`updateModePlaylistCompletion`, `updatedPlaylistCompletion`, `updateparticipantplanning`) and the inline `big participants assignments` update in `PlayRelatedVideo`. e2e seeding for "playlist completion" must account for those helper writes living in `AppServices.dart`, not the screen files.
- **`big participants assignments`:** `PlayRelatedVideo.updateBigactivityPlaylist` updates this `big …` collection. It is a *big-assignment* (group/assignment), distinct from the ATC-restricted `big assignment atc_alpha` / `big assignment_*`. Treat as non-ATC but verify against the ATC off-limits list before seeding. Also note the likely typo `contents_urls` (vs `content_urls`) at `playRelatedVideo.dart:295` building `episodeRef` — a latent bug.
- **Trailer/playback in CI:** `episode` autoplay (`video_player`) and `episodePlayer`/`Adsplaylists`/`PlayRelatedVideo` (BetterPlayer, forced landscape, `media.publit.io` HLS) need reachable media to fully exercise; assert navigation + the `content analytics` write rather than pixel playback.
- **Project-specific share URLs:** referral sharing branches on `projectId` (`fir-sample-aae4a` = production `eiflix.com`; `starlabs-test` = `eiflix-workshop.web.app`). Tests run under `starlabs-test`.
- **ATC boundary:** **No ATC** anywhere in this cluster (no `atc_*` collections, no `*ATC*` widgets). The whole cluster is ATC-free and e2e-testable (subject to media/deep-link/SharedPreferences caveats above).
