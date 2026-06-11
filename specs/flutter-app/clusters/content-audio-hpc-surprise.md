# Cluster: Solar Voice (audio), HPC (3-minute), Surprise Content

> Repo: `breakthroughs-flutter` (branch `development`). Static code+config map only — no build/run/Firestore done.
> Evidence: every claim cites `file:line` inside `lib/Solar Voice/`, `lib/HPC/`, `lib/Surprise Content/`.

## Overview
For the participant this cluster bundles three otherwise-unrelated content surfaces:
1. **Solar Voice** — an outcome-based audio (hypnosis/transformation) library. The participant browses curated playlists, plays tracks with a background audio player (resume-from-last-position, next/prev/seek), bookmarks playlists, and downloads playlists for fully-offline listening. Listening is logged to `content analytics` for resume + "completed" tracking.
2. **HPC = "Success Multiplier" (a.k.a. 3-minute HPC / High-Performance Coaching)** — a daily reflective ritual. The participant records three short voice answers ("what is the achievement", "why is it an achievement", "why is it significant"), the app sends the audio to OpenAI (`gpt-4o-audio-preview`) which returns a 4–5 word title + three "contrast-frame" summary variations + a short summary; the participant edits text, picks accelerators + who to "tell to", chooses one contrast variation, and logs the achievement. A **Group** variant records the same flow for N named people in one session. A history screen ("Success Multiplier" / `ViewHPC`) shows logged achievements with a badge/award progression, a logged-dates calendar filter, and a local-notification daily reminder.
3. **Surprise Content** — a "content of the day" random video player with a star/favourites list. **This entire surface is currently dead/orphaned** (no live entry point; sibling screens are stubbed to empty/`Scaffold()`); it is mapped for completeness only.

## Screens

| Screen | file:line | Purpose |
| --- | --- | --- |
| `SolarVoiceHome` | `Solar Voice/solarvoiceHome.dart:18` | LIVE. Bottom-nav tab. Carousel of recent playlists + "Recommended for You" + explore list; entry to bookmarks, downloads, recommended-mix. |
| `SolarVoicePlaylist` | `Solar Voice/solarvoicePlaylist.dart:18` | LIVE. Playlist detail + full audio player (Play All, per-track, download-all, favourite, next/prev/seek). Also serves offline playlists (`offline:true`). |
| `SolarVoicePlaylistDownload` | `Solar Voice/solarvoicePlaylistDownload.dart:13` | LIVE. "Downloads" — lists locally-downloaded playlists (SQLite), delete one / delete all, open offline. |
| `vitality` | `Solar Voice/vitality.dart:12` | DEAD. Old dropdown-based Solar Voice player (`audioplayers` pkg). No references. |
| `SolarVoiceHomeOld` | `Solar Voice/solarvoiceHomeOld.dart` | DEAD. Old home (product-mode playlists). Not constructed anywhere. |
| `SolarVoicePlaylistDownloadold` | `Solar Voice/solarvoicePlaylistDownloadold.dart` | DEAD. Fully-commented old download screen; only an unused import. |
| `HPC` | `HPC/hpc.dart:19` | LIVE. The record→AI→edit→log "Success Multiplier" flow (individual + group). |
| `ViewHPC` | `HPC/ViewHPC.dart:12` | LIVE. "Success Multiplier" history: badges, calendar, filter/search/sort, reminder. |
| `ReminderDialog` | `HPC/HpcReminderDialog.dart:542` | LIVE. Add/list/delete daily local-notification reminders. |
| `AIGeneratingAnimation` | `HPC/AiGenerating.dart:7` | LIVE (presentational). Loading animation shown during AI generation. No data. |
| `SurpriseContent` | `Surprise Content/SurpriseContent.dart:11` | DEAD/orphaned. Random video-of-the-day + favourites (full logic, but no live entry). |
| `ContentExplore` | `Surprise Content/contentExplore.dart:5` | DEAD. `build()` body is `Text("")`; grid commented out. |
| `ContentPlayer` | `Surprise Content/contentPlayer.dart:3` | DEAD. `build()` returns bare `Scaffold()`; all logic commented. |
| `StarredContent` | `Surprise Content/starredContent.dart:10` | DEAD. `build()` returns bare `Scaffold()`; all logic commented. |

---

## Features

### Browse Solar Voice playlists (carousel + explore)
- **What the user does:** Opens the Solar Voice tab; sees a 3-item auto-playing carousel (first 3 non-private playlists), a "Recommended for You" block, and an "Explore" list of remaining playlists; taps a playlist to open it.
- **Nav/entry:** Bottom-nav tab — `SolarVoiceHome` mounted at `home.dart:2107` (`SolarVoiceHome(scrollToTop: bottomTabNotifier)`). Tap → `SolarVoicePlaylist` (`solarvoiceHome.dart:561`).
- **Reads:** `solar voice playlist` (orderBy `date` desc; split by `private==false/null`) `solarvoiceHome.dart:66`. `appService.recommendedSolarVoice` (in-memory, pre-loaded) `:86`.
- **Writes:** none on load.
- **Endpoints:** playlist cover via `CachedNetworkImage` (`imageurl`).
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes — seed `solar voice playlist` docs; assert carousel + explore render. (Recommended block needs `appService.recommendedSolarVoice` populated.)

### Favourite a playlist from the home card (likedby)
- **What the user does:** Taps the bookmark on a playlist card in the explore list/carousel to like/unlike.
- **Nav/entry:** `localTheme.solarvoiceplayer(... callback: favouriteCallBack)` `solarvoiceHome.dart:584,881`.
- **Reads:** the in-memory `explorePlaylist` item.
- **Writes:** `solar voice playlist/{playlistId}` field `likedby` (adds/removes `profileid`) `solarvoiceHome.dart:151` (`addToFavourite`).
- **Journey stage:** social/content.
- **e2e-testability:** Yes — tap bookmark, assert `likedby` array contains/omits the profileid.

### Open bookmarks / recommended-mix / downloads from the Solar Voice app bar
- **What the user does:** App-bar actions — bookmark icon → saved Solar Voice content; download icon → Downloads screen.
- **Nav/entry:** bookmark → `SavedContent(contentType: "solarvoice")` `solarvoiceHome.dart:457`; download icon → `SolarVoicePlaylistDownload()` `:472`; "View All" on recommended → `Recommenedmixplaylist()` `:227`. (`SavedContent` & `Recommenedmixplaylist` live outside this cluster.)
- **Reads/Writes:** delegated to those screens (out of cluster).
- **Journey stage:** content.
- **e2e-testability:** Yes (navigation only at this boundary).

### Play a Solar Voice playlist (background player, resume, complete)
- **What the user does:** Taps "Play All" or a track; full-screen player streams audio in a `ConcatenatingAudioSource` with lock-screen/background controls; auto-resumes from last position (>15s left); next/prev/seek; progress logged.
- **Nav/entry:** `SolarVoicePlaylist` from home/recommended/downloads. Play actions `solarvoicePlaylist.dart:661` (Play All), `:793` (per-track).
- **Reads:** `solar voice audios` by `whereIn` documentId (batched by 10) from playlist `sequence` `solarvoicePlaylist.dart:141`. `content analytics` where `profileid==me` AND `playlistid==this` orderBy `logdate` desc — for resume position + which audios are `status=="complete"` `:167`.
- **Writes:** Listening analytics to **local SQLite** `contentanalytics` table (`appService.updateAnalytics`, `appService.syncAnalytics`) `:254,128`; these sync to `content analytics` collection via `appService` (analytics fields: `profileid, videoid, videoname, totalruntime, lastwatchedtime, totaltimespend, logdate, playlistid, contentfrom/contenttype="solarvoice", status`). No direct Firestore write to `content analytics` in the live `playAudiofromURL` (the Firestore write is in a large commented block `:331-465`).
- **Endpoints:** audio streamed from `element["url"]` via `AudioSource.uri` `:223`; art from `imageUrl`.
- **Config flags:** none.
- **Journey stage:** content / progression (completion drives mode-playlist completion historically).
- **e2e-testability:** Partial — UI (play/pause/seek/next) testable on a sim with stub audio; "complete" status + resume depend on SQLite analytics + duration playback (hard to assert deterministically in e2e). Mark playback-state assertions as best-effort.

### Download a Solar Voice playlist for offline (and cancel/delete)
- **What the user does:** On a playlist, taps download to fetch all tracks offline (Lottie progress %); can cancel+delete; downloaded check-mark when complete.
- **Nav/entry:** download button `solarvoicePlaylist.dart:704` → `downloadAllAudios()` `:499`; cancel/delete `:536`.
- **Reads:** `appService.loadOfflineAudio()` (SQLite `solarvoiceoffline`).
- **Writes:** local files + SQLite `solarvoiceoffline` via `appService.downloadAudio` / `appService.deleteOfflineAudioByPlaylist`. No Firestore.
- **Endpoints:** downloads the track `url` (HTTP GET inside `appService.downloadAudio`).
- **Journey stage:** content.
- **e2e-testability:** Partial — requires real network download to device storage; assert "download done" icon after wait. Best-effort on sim.

### Favourite a playlist from the player (solarvoicemylist)
- **What the user does:** Taps the bookmark on the player; shows "Added to your favorites" toast.
- **Nav/entry:** bookmark button `solarvoicePlaylist.dart:729` → `favorites()` `:481`.
- **Reads/Writes:** `appService.contentMylist(metadataKey:"solarvoicemylist", docId: playlistId)` — toggles the playlist id inside the user-metadata array `solarvoicemylist` (written by AppService to the user metadata doc, out-of-cluster). Reflected via `appService.usermetadata["solarvoicemylist"]` `:743`.
- **Journey stage:** social/content.
- **e2e-testability:** Yes — tap, assert metadata `solarvoicemylist` contains the playlist id.

### Manage downloaded Solar Voice playlists (Downloads screen)
- **What the user does:** Views all locally-downloaded playlists grouped by `playlistid`; opens one (offline player), deletes one playlist, or deletes all.
- **Nav/entry:** app-bar download icon on Solar Voice home → `SolarVoicePlaylistDownload`. Open → `SolarVoicePlaylist(offline:true)` `solarvoicePlaylistDownload.dart:332`.
- **Reads:** `appService.loadOfflineAudio()` (SQLite `solarvoiceoffline`) `:64`.
- **Writes:** deletes local files + SQLite rows (`solarvoiceoffline`) `:191`, `appService.deleteOfflineAudioByPlaylist` `:133`. No Firestore.
- **Journey stage:** content.
- **e2e-testability:** Partial — depends on prior real downloads existing on device; empty-state ("No Downloads Yet") IS deterministically testable.

### Log an individual HPC ("Success Multiplier") — record → AI → edit → log
- **What the user does:** From the home card taps "Log Achievement"/"Resume Achievement". Records 3 voice answers (what / why-achievement / why-significant) with a waveform recorder; app uploads + sends to OpenAI; reviews/edit AI title + summary; selects accelerators (+ custom), selects "tell to" people, picks one of 3 contrast-frame variations, taps "Log Achievement". On success a `FinalCompletionDialog` (award icon) shows.
- **Nav/entry:** `HPC(singleclick: …)` from `homeContent.dart:7194`; also from local-notification tap payload `"HPC"` → `HPC(singleclick:false)` `home.dart:1411`. Steps built in `hpc.dart:1028-1062` (`buildSteps`).
- **Reads:**
  - `classify/3minuteshpc` — OpenAI `apikey`, `titleprompt`, `summaryprompt`, `prompt` `hpc.dart:167`.
  - `static meta data/Accelerator` — `accelerators` list `hpc.dart:143`.
  - `3minuteshpc` where `profileid==me` AND `status=="started"` AND `multiple==false` orderBy `createdAt` desc limit 1 — resume an in-progress session `hpc.dart:1139`.
  - `3minuteshpc` where `profileid==me` AND `status=="completed"` orderBy `createdAt` desc limit 1 — prefill previous custom accelerators + tellto `hpc.dart:1097`.
- **Writes (`3minuteshpc`):**
  - create session `{profileid,status:"started",currentStep:0,multiple:false,recordings:{},choosedaccelerators:[],createdAt,updatedAt}` `hpc.dart:1508`.
  - incremental `updateHpcSession`: `currentStep`, `recordings.{whatyoudid|whyachievement|whysignificant}`, `choosedaccelerators`, `customaccelerators` (merged with previous), `tellto` `hpc.dart:1576`.
  - after AI: `finalrecording, chatgptgeneratedtitle, chatgptrawtitle, chatgptgeneratedV1/V2/V3, chatgptrawsummary, titleprompt, shortsummaryprompt, summaryprompt, summaryofthis` `hpc.dart:919`.
  - on log: `chatgptgeneratedtitleedited, chatgptgeneratededitedV1/V2/V3, selectedContrastFrame, selectedContrastFrameContent, loggeddate` `hpc.dart:4223`; then `status:"completed", completedAt` (`completeHpcSession` `hpc.dart:1595`).
  - restart deletes the session doc `hpc.dart:1682`.
- **Endpoints:**
  - **Firebase Storage** upload merged recording → path `3minuteshpc/{profileId}/{fileName}` `hpc.dart:380`.
  - **OpenAI** `https://api.openai.com/v1/chat/completions`, model `gpt-4o-audio-preview`, audio sent as base64 (`input_audio`) — title `hpc.dart:513`, summaries `:599`, short summary `:668`; key-validity probe `:187`.
  - Local FFmpeg (`FFmpegKit`) to merge/convert audio (`mergeAudioFiles` `:396`, `convertToMp3` `:829`) — on-device, not a network endpoint.
- **Config flags:** no Remote Config. Gated by `classify/3minuteshpc.apikey` presence — if missing/invalid/quota, shows `buildApiErrorScreen` "Service Unavailable / Please contact admin." `hpc.dart:235,205`.
- **Journey stage:** progression / content.
- **e2e-testability:** Partial. The full path requires (a) a working OpenAI key in `classify/3minuteshpc` and (b) real microphone audio — both impractical/non-deterministic for CI, and (a) would spend real OpenAI quota. e2e CAN cover: navigation into HPC, the recording UI states, the "Service Unavailable" screen when no key is seeded, the resume-session dialog (seed a `status:"started"` doc), and the restart-session deletion. Do NOT drive a real OpenAI call in CI. Not ATC.

### Log a Group HPC (multiple named people in one session)
- **What the user does:** Same record→AI→edit flow but repeated for N people; can name each person, add another person, restart a person's recordings, remove incomplete people; final summary screen logs all; then `ViewHPC(hpctype:'group')` history.
- **Nav/entry:** `HPC(multiple:true, persons:N, achievementfrom:…)` from `homeContent.dart:7658`.
- **Reads:** as individual, but session query adds `multiple==true` `hpc.dart:1130`; reads `persons.personN.*` substructure on resume `:1279`.
- **Writes (`3minuteshpc`, all under `persons.personN.*`):** create with `multiple:true,totalPersons,currentPerson:0,persons:{person0:{recordings,choosedaccelerators,customaccelerators,tellto}}}` `hpc.dart:1493`; per-person `personName` `:3232,4734`; AI fields `:901,4589`; edited+contrast+`loggeddate` `:4176,5944`; add person (`totalPersons` increment, new `personN`) `:5317`; remove incomplete (`persons.personN` delete, `totalPersons` decrement) `:1993`; restart person (resets `persons.personN.*`, deletes AI fields) `:4834,6036`. Completes with `status:"completed"`.
- **Endpoints:** identical (Storage `3minuteshpc/{profileId}/...`, OpenAI, FFmpeg).
- **Journey stage:** progression / social.
- **e2e-testability:** Partial — same OpenAI/mic constraints as individual. Structural pieces (add/remove/rename person UI, resume of a seeded multi-person `started` doc) are testable; the AI leg is not CI-safe.

### View HPC history + badges ("Success Multiplier" history)
- **What the user does:** Opens "History"; sees a badge collection with progress to the next award, a month calendar dotting logged dates (tap a date to filter), All/Individual/Group filter chips, in-app-bar search, sort (Newest/Oldest), and cards rendering each logged achievement (title, contrast frame, accelerators, tell-to; group cards list per-person).
- **Nav/entry:** `ViewHPC(hpctype:'individual')` `homeContent.dart:7246`; `ViewHPC(hpctype:'group')` `:7712`.
- **Reads:** `3minuteshpc` where `status=="completed"` AND `profileid==me` `ViewHPC.dart:78` (then split by `multiple`). `static meta data/HPC Config` — `awards` map (badge thresholds/icons) `:55`.
- **Writes:** none.
- **Endpoints:** award/badge icons via `CachedNetworkImage` (`award['icon']`).
- **Config flags:** badges/calendar depend on `static meta data/HPC Config.awards`; absent → badges hidden `ViewHPC.dart:899`.
- **Journey stage:** progression.
- **e2e-testability:** Yes — seed completed `3minuteshpc` docs (+ `static meta data/HPC Config`) and assert list/badges/calendar/filter/search render. Pure read path. Not ATC.

### Set a daily HPC reminder (local notifications)
- **What the user does:** From history (shaking alarm-clock icon or reminder banner) opens the reminder dialog; picks a time + frequency (Once/Daily/Weekly/Weekdays), saves; sees "My Reminders" list; can delete. Fires a local push notification at the chosen time.
- **Nav/entry:** `ViewHPC.showReminderDialog()` → `ReminderDialog(reminderFor: 'HPC' | 'Group HPC')` `ViewHPC.dart:408`; clock icon `:1654`.
- **Reads:** `static meta data/HPC Config` → `notificationindividual` / `notificationgroup` (title + description) `HpcReminderDialog.dart:131`.
- **Writes:** **local only** — SharedPreferences key `reminders` (list of `{id,time,frequency,reminderFor,isEnabled}`) `HpcReminderDialog.dart:479,509` and `notification_config` cache `:168`. Schedules via `flutter_local_notifications` (channel `reminder_channel`) `:116`. No Firestore writes.
- **Endpoints:** none (device-local notifications). Reads `static meta data/HPC Config` for copy.
- **Journey stage:** support / progression.
- **e2e-testability:** Partial — dialog add/list/delete IS testable on a sim; the actual scheduled OS notification firing is not practical to assert in CI. Not ATC.

### Surprise Content — random video of the day + favourites (DEAD/ORPHANED)
- **What the user does (intended):** Opens a "Surprise Content" screen, taps the gift to play a random available video, stars/un-stars it, and replays favourites from a list. Sibling screens (`ContentExplore`, `ContentPlayer`, `StarredContent`) are YouTube/grid variants.
- **Nav/entry:** **NONE LIVE.** Only constructed in commented code (`Widgets/Themes.dart:399,560`). `ContentPlayer`/`StarredContent`/`ContentExplore` are stubbed (`build()` returns `Scaffold()` or `Text("")`).
- **Reads (in `SurpriseContent.dart`, were it mounted):** `content_urls` where `available==true` (shuffled) `SurpriseContent.dart:35`; `content_urls` where `starredby` arrayContains `profileID` (favourites stream) `:337`. Sibling stubs reference a different `Surprise Content` collection (`type=="video"`, youtube ids) `contentExplore.dart:25`, `contentPlayer.dart:46` (commented), `starredContent.dart:42` (commented).
- **Writes (in `SurpriseContent.dart`):** `content_urls/{id}.starredby` arrayUnion/arrayRemove `profileID` `:112`.
- **Endpoints:** video via `VideoPlayerController.network(url)` `:90`; youtube thumbnails `img.youtube.com` (in stubs).
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** **No — dead code, no live entry point.** Map only; do NOT plan an e2e for it unless/until a live route is added. Not ATC.

---

## Firestore collections

### Read
- `solar voice playlist` — `orderBy(date desc)`; fields used: `id, name, description, imageurl, private, likedby, sequence` (sequence = list of audio doc refs). `solarvoiceHome.dart:66`, `solarvoicePlaylist` via parent data, `vitality.dart:103` (dead).
- `solar voice audios` — by `whereIn(documentId, …)` (batched 10) from playlist `sequence`; fields: `id, name, description, url, imageUrl`. `solarvoicePlaylist.dart:141`; full-scan in `solarvoiceHome.dart:177` (cache) and `vitality.dart:94` (dead).
- `content analytics` — where `profileid==me` AND `playlistid==this` orderBy `logdate desc`; reads `status` ("complete") + `videoid` for resume/completion. `solarvoicePlaylist.dart:167`.
- `classify/3minuteshpc` — OpenAI `apikey`, `titleprompt`, `summaryprompt`, `prompt`. `hpc.dart:167`.
- `static meta data/Accelerator` — `accelerators` list (HPC accelerator chips). `hpc.dart:143`.
- `static meta data/HPC Config` — `awards` (badge thresholds/icons), `notificationindividual`, `notificationgroup`. `ViewHPC.dart:55`, `HpcReminderDialog.dart:131`.
- `3minuteshpc` — where `profileid==me` (+ `status` "started"/"completed", + `multiple` bool) orderBy `createdAt`. Fields: `profileid, status, multiple, currentStep, currentPerson, totalPersons, createdAt, updatedAt, completedAt, achievementfrom, recordings.{whatyoudid,whyachievement,whysignificant}, choosedaccelerators, customaccelerators, tellto, finalrecording, chatgptgeneratedtitle(+edited), chatgptraw{title,summary}, chatgptgeneratedV1/V2/V3 (+edited), summaryofthis, selectedContrastFrame(+Content), loggeddate, persons.personN.{...same…, personName}`. `hpc.dart:1097/1130`, `ViewHPC.dart:78`.
- `content_urls` — (Surprise Content, DEAD) where `available==true`; where `starredby` arrayContains profileID. Fields: `url, title, available, starredby`. `SurpriseContent.dart:35,337`.
- `Surprise Content` — (DEAD stubs) where `type=="video"` (+ `available`, + `starredby`); fields: `id, title, type, available, starredby` (youtube ids). `contentExplore.dart:25`, `contentPlayer.dart` & `starredContent.dart` (commented).

### Written
- `solar voice playlist/{id}` — `likedby` (arrayUnion/Remove profileid) via `solarvoiceHome.dart:151`.
- `content analytics` — listening logs (`profileid, videoid, videoname, totalruntime, lastwatchedtime, totaltimespend, logdate, playlistid, contentfrom/contenttype="solarvoice", status`). Live path writes to **local SQLite `contentanalytics`** then syncs through `appService` (`solarvoicePlaylist.dart:254,128`). Direct `.set(...merge)` exists only in dead `vitality.dart:187` and commented blocks.
- `3minuteshpc` (+ `/{sessionId}`) — full session lifecycle (create/update/complete/delete; individual fields and `persons.personN.*`). See HPC features. `hpc.dart:1508,1576,1595,1682,901,919,4176,4223,4589,4834,5317,1993,3232,4734,5944,6036`.
- `content_urls/{id}.starredby` — arrayUnion/Remove profileID (Surprise Content, DEAD) `SurpriseContent.dart:112`.
- `Surprise Content` `starredby` — arrayUnion/Remove (DEAD stubs, commented) `contentPlayer.dart:134`, `starredContent.dart:129`.

> No ATC collections are touched anywhere in this cluster. `atcTouch=false` for all features.

## Endpoints & external services
- **OpenAI Chat Completions** — `https://api.openai.com/v1/chat/completions`, model `gpt-4o-audio-preview`, `Authorization: Bearer <classify/3minuteshpc.apikey>`. Sends 3 audio clips as base64 `input_audio`. Three calls per log (title, 3-variation summary, short summary) + a 1-token key-validity probe. `hpc.dart:187,513,599,668,4329+`.
- **Firebase Storage (default app bucket)** — uploads merged HPC recording to `3minuteshpc/{profileId}/{fileName}` and reads back a download URL. `hpc.dart:382,386`.
- **Firebase Storage (separate `solar-voice` bucket)** — hardcoded demo audio URLs `firebasestorage.googleapis.com/v0/b/solar-voice.appspot.com/...` in DEAD `vitality.dart:27-30` only. (Live Solar Voice audio uses whatever `url` is stored on `solar voice audios` docs.)
- **Audio streaming** — `just_audio` `AudioSource.uri(audio.url)` with `just_audio_background` for lock-screen controls. `solarvoicePlaylist.dart:223`.
- **YouTube thumbnails** — `https://img.youtube.com/vi/{id}/0.jpg` in DEAD Surprise Content stubs. `contentExplore.dart:64`, `contentPlayer.dart:226`, `starredContent.dart:212`.
- **FFmpegKit (on-device)** — concat/merge + m4a→mp3 conversion for HPC audio. `hpc.dart:422,835`.
- **flutter_local_notifications + timezone** — local daily reminder scheduling (channel `reminder_channel`). `HpcReminderDialog.dart:17,116`.
- **PostHog** — analytics events from Solar Voice: `Solar Voice Playlist Selected`, screen `"Solar Voice"`, (`Listening to Solar Voice` only in dead `vitality.dart`). `solarvoicePlaylist.dart:157,577`.

## Config & feature flags
- **No Firebase Remote Config** in this cluster (no `RemoteConfig`/`remoteConfig` references).
- **Firestore-config-as-flags:**
  - `classify/3minuteshpc.apikey` — gates the entire HPC AI generation; empty/invalid → "Service Unavailable" screen. `hpc.dart:171,235`.
  - `classify/3minuteshpc.{titleprompt,summaryprompt,prompt}` — the OpenAI prompts. `hpc.dart:486-488`.
  - `static meta data/HPC Config.awards` — badge/award tiers (drives `ViewHPC` badge collection + completion-dialog icon). `ViewHPC.dart:903`.
  - `static meta data/HPC Config.notificationindividual|notificationgroup` — reminder notification copy. `HpcReminderDialog.dart:138,147`.
  - `static meta data/Accelerator.accelerators` — HPC accelerator chip list. `hpc.dart:145`.
- **SharedPreferences keys:** `reminders` (reminder list), `notification_config` (cached notification copy). `HpcReminderDialog.dart:479,168`.
- **Local SQLite:** `contentanalytics` (Solar Voice listening logs, synced via AppService), `solarvoiceoffline` (downloaded audio metadata). `solarvoicePlaylist.dart:61`, `solarvoicePlaylistDownload.dart:184`.

## Dead / clone / Old code
- `Solar Voice/vitality.dart` — DEAD. Old dropdown player; zero references; hardcoded demo URLs (`solar-voice.appspot.com`); much commented code.
- `Solar Voice/solarvoiceHomeOld.dart` — DEAD. Old Solar Voice home (`participantsproduct`, `product mode playlist`, `recommended mix playlist`); not constructed anywhere.
- `Solar Voice/solarvoicePlaylistDownloadold.dart` — DEAD. Entire file effectively commented; only an unused import remains in `solarvoiceHome.dart:4` (live screen uses `SolarVoicePlaylistDownload`, not the `old` one).
- `Surprise Content/SurpriseContent.dart` — ORPHANED (logic intact but only referenced from commented code in `Widgets/Themes.dart:399,560`). Not reachable in the live app.
- `Surprise Content/contentExplore.dart` — DEAD body (`Text("")`; grid commented).
- `Surprise Content/contentPlayer.dart` — DEAD (`build()` → `Scaffold()`; all logic in `/* */`).
- `Surprise Content/starredContent.dart` — DEAD (`build()` → `Scaffold()`; all logic in `/* */`).
- Large commented blocks remain in live files: `solarvoiceHome.dart` (carousel detail + mode/recommended widgets), `solarvoicePlaylist.dart:260-467` (old timer-based analytics writing directly to `content analytics`).

## Notes & open questions
- **Two distinct Surprise Content collections** appear: live-but-orphaned `SurpriseContent.dart` uses `content_urls`; the stubbed YouTube variants use `Surprise Content`. Neither is wired into navigation today — confirm with the operator whether Surprise Content is being retired or relaunched before investing any e2e.
- **Solar Voice "recommended" pipeline** depends on `appService.recommendedSolarVoice` (populated elsewhere, likely from `recommended mix playlist`); the in-file Firestore read of `recommended mix playlist` is commented out (`solarvoiceHome.dart:91`). To exercise the recommended block in e2e you must populate that AppService field, not just seed a collection.
- **HPC analytics for Solar Voice** are written through `appService.updateAnalytics`/`syncAnalytics` to SQLite first; the `content analytics` Firestore docs are an AppService responsibility (out-of-cluster). The exact server field set is inferred from the commented legacy block — verify against AppService before asserting Firestore shape.
- **HPC AI is real-money / non-deterministic** (`gpt-4o-audio-preview` over real audio). Strong recommendation: e2e should stub at the boundary — seed a `status:"started"` session to test resume, and seed completed docs to test `ViewHPC` — and explicitly assert the "Service Unavailable" path when `classify/3minuteshpc.apikey` is absent, rather than driving a live OpenAI call in CI.
- **Storage bucket caveat:** HPC recordings go to the default app bucket under `3minuteshpc/{profileId}/…`; ensure the test project's Storage rules allow this path for the test user.
- No `FirebaseMessaging` (FCM) usage in this cluster; the only push surface is **local** notifications (HPC reminders).
