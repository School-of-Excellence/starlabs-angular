# Cluster: Social posts, comments, likes, drafts, achievements, snippets, list grids, Community Snippets

> Static code+config map of the `social-community` cluster of **breakthroughs-flutter** (branch `development`).
> Repo root: `/Users/antano/solarcode/ah/starlabs-angular`. App lib root: `breakthroughs-flutter/lib`.
> Evidence cited as `file:line`. No app was built/run; no Firestore was queried.

## Overview

This cluster is the participant-facing **social / achievements / stories** surface of Breakthroughs. A participant publishes "Achievements" (a post: a message + optional Significance + Consequence + image list + category, with a Private toggle), which are stored as a draft first (`drafts`) and promoted into the shared achievement feed (`Achievements/posts/postcollection`). Other participants and the participant themselves browse these posts in vertical timeline-style "list grids" (`ListGridSocial` = global "Breakthroughs" feed, `ListGridPersonal` = one person's posts), where each post card (`PostItemWidget`) shows the author, category chip, body, images, expandable significance/consequence, and like + comment counts. Tapping comment/like opens a `LikeAndCommentTab` bottom screen with a **Likes** tab (who liked) and a **Comments** tab (threaded comments, each comment itself likeable). Posts can be **reported** (writes a blacklist row) or **deleted** (owner only). Separately, the cluster renders **Community Snippets**: a horizontal rail of Instagram-story-style vertical-video "snippets" (`SnippetList`) sourced from `community post` documents for the currently active snippet event, played full-screen with auto-advance and watched-tracking (`ViewSnippet`). The participant's own recorded "Video Ask" appears as the lead tile in that rail.

## Screens

| Screen | file:line | Purpose |
|---|---|---|
| `ListGridSocial` | `listGridSocial.dart:14` | Global achievement feed ("Breakthroughs"), paginated (15 at a time) from a pre-resolved list of post doc-IDs; each item = `PostItemWidget`. |
| `ListGridPersonal` | `listGridPersonal.dart:13` | A single query's worth of achievement posts (one user / one collection), auto-scrolled to a target index; each item = `PostItemWidget`. Hosts Report/Delete/About-App menu. |
| `PostItemWidget` | `Widgets/postItemWidget.dart:14` | The post card used by both grids: author header, category chip, body (ReadMore), image gallery, expandable Significance/Consequence, live like+comment counts, like toggle. (Shared widget, not in assigned list but load-bearing for this cluster.) |
| `LikeAndCommentTab` | `likesandcomments.dart:9` | 2-tab container (Likes / Comments) shown for a post; resolves current user's name/uid/pid then mounts `Likes` + `Comments`. |
| `Comments` | `comments.dart:16` | Comment thread for a post: live list of comments + author avatars, add-comment field, per-comment like toggle, long-press delete (own comment or post-owner). |
| `Likes` | `likes.dart:7` | List of profiles who liked a post (resolves `likes` subcollection → `profile_data`). |
| `CommentLikes` | `commentlikes.dart:7` | List of profiles who liked a single comment (renders a `commentlikes` collection ref). Reachable widget; no current navigator entry found (see Dead/clone). |
| `DraftPost` | `draftposts.dart:16` | "Drafts" screen: today's unpublished drafts for the user; publish / unpublish / edit-draft menu; renders each via `PostItemWidget(draftPost:true)`. |
| `EditAchievement` | `editachievement.dart:11` | Edit screen for a post/draft: edit message/significance/consequence, Private + Publish switches, with the "one achievement per day / replace?" publish workflow. |
| `SnippetList` | `Community Snippets/snippetList.dart:13` | Horizontal rail of community-snippet story tiles + the user's own "My Video Ask" tile, for the active snippet event. |
| `ViewSnippet` | `Community Snippets/viewSnippet.dart:13` | Full-screen story player (carousel of stories × videos), tap-left/right to navigate, auto-advance, progress bars, writes "watched". LIVE player used by `SnippetList`. |
| `SnippetStory` | `snippetStory.dart:7` | Alternate full-screen story player (PageView of video lists). Present but **no live caller found** (see Dead/clone). |
| `PlaySnippet` | `Community Snippets/playSnippet.dart:9` | Alternate full-screen snippet player (PageView, flattens all videos). Present but **no live caller found** (see Dead/clone). |
| `OpenVideo` | `Community Snippets/openVideo.dart:5` | Helper widget: loads+plays an HLS file via `story_view`'s `VideoLoader`. Only referenced from commented-out code → effectively dead. |
| `OpenImage` | `Community Snippets/openImage.dart:6` | Helper widget: loads an image frame via `story_view`'s `ImageLoader`. Only referenced from commented-out code → effectively dead. |
| `InstagramLikeUI` / `PostWidget` (demo) | `post.dart:3`, `post.dart:36` | **Hardcoded Instagram-clone demo** (fake usernames/captions, no Firestore). DEAD demo file — see Dead/clone. |

## Features

### Publish a draft achievement to the feed ("Publish Now")
- **What the user does:** From the Drafts screen, opens a draft's "..." menu and taps "Publish Now" to promote it into the shared achievement feed.
- **Nav/entry:** Drafts screen (`DraftPost`) → per-draft `more_vert` → `postmenu` → "Publish Now" (`draftposts.dart:339`, action `publishnow` `draftposts.dart:74` → `writeSocial` `draftposts.dart:39`).
- **Reads:** `drafts/{postid}` (`draftposts.dart:40`).
- **Writes:** `Achievements/posts/postcollection/{postid}` set with postcategory/postmessage/significance/consequence/created/postid/private/uid/profileid/name/postimagelist (`draftposts.dart:42-58`); updates `drafts/{postid}` `{publish:true, version: arrayUnion(...)}` (`draftposts.dart:60-65`). Then pops to route `/home`.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** content / social.
- **e2e-testability:** Yes — seed a `drafts` doc for the test user, open Drafts, publish, assert a new `postcollection` doc and `drafts.publish==true`. Not ATC.

### Unpublish a published draft ("Unpublish Now")
- **What the user does:** From the Drafts "..." menu on a published draft, taps "Unpublish Now" to remove it from the feed.
- **Nav/entry:** `DraftPost` → `postmenu` → "Unpublish Now" (`draftposts.dart:323`, action `unpublishnow` `draftposts.dart:281`).
- **Reads:** none directly (operates on the draft `DocumentReference`).
- **Writes:** updates `drafts/{id}` `{publish:false, version: arrayUnion(...)}` (`draftposts.dart:283-288`); then `AppService().deletePost(ref.id)` deletes `Achievements/posts/postcollection/{id}` + its `likes`/`comments` subcollections and re-flips the draft (`AppServices.dart:679-708`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** content / social.
- **e2e-testability:** Yes. Not ATC.

### Edit a draft / achievement (message, significance, consequence, privacy)
- **What the user does:** Opens an edit form, changes the body / Significance / Consequence text, toggles Private and Publish, taps "Update".
- **Nav/entry:** From Drafts "..." → "Edit Draft" pushes `EditAchievement(title:"Draft", ...)` route `/editpost` (`draftposts.dart:361-372`, `draftposts.dart:408-419`). Edit-Achievement entry from elsewhere uses `title:"Achievement"`.
- **Reads:** `widget.reference` (the draft/post doc) `.get()` to prefill (`editachievement.dart:41`); during publish workflow reads `drafts` (where publish==true, uid, date) `editachievement.dart:182-193`, and `Achievements/posts/postcollection` (where uid, orderBy created desc, limit 1) `editachievement.dart:197-204`.
- **Writes:** updates the post/draft ref `{postmessage,significance,consequence,private}` (`editachievement.dart:101-108`); on unpublish path also updates `drafts/{id}` (`editachievement.dart:115-137`); publish path sets `Achievements/posts/postcollection/{id}` (`editachievement.dart:209-233`, `:286-310`, `:495-513`) and `drafts/{id}` publish flags + `version` arrayUnion; `replacepost` deletes the existing post via `AppService().deletePost` then republishes (`editachievement.dart:467-533`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** content / social.
- **e2e-testability:** Yes — edit text + toggle Private, assert field changes; publish path needs the daily-achievement state seeded to exercise the "replace?" branch. Not ATC.

### "One achievement per day" / Replace-previous workflow
- **What the user does:** When publishing while an achievement already exists for today, a dialog asks "You Have Already Posted An Achievement Today — Replace?" with Nope / Yes,Replace.
- **Nav/entry:** Triggered inside `publishnow` (`editachievement.dart:342-462`; also the disabled mirror in `draftposts.dart:74-232`, mostly commented).
- **Reads:** `Achievements/posts/postcollection` where uid == user, orderBy created desc limit 1 (`editachievement.dart:197-204`) to find today's post; `drafts` where publish==true (`editachievement.dart:182-193`).
- **Writes:** on "Yes,Replace" → `replacepost` deletes existing (`AppService().deletePost`) and republishes the new draft (`editachievement.dart:467-533`).
- **Endpoints:** none.
- **Config flags:** none — the "one per day" limit is hardcoded date logic, no remote flag.
- **Journey stage:** content / social.
- **e2e-testability:** Yes (seed a post dated today for the user, then publish another and assert dialog + replace). Not ATC.

### Browse the global achievement feed (Breakthroughs)
- **What the user does:** Scrolls the vertical "Breakthroughs" feed of everyone's achievements; infinite scroll loads more on reaching the end.
- **Nav/entry:** `ListGridSocial` (`listGridSocial.dart`), pushed from `PostEvent - Achievements/social.dart:886,1222` and `achievements.dart:695,749`. AppBar title "Breakthroughs" (`listGridSocial.dart:258`).
- **Reads:** current user `profile_data/{pid}` for name (`listGridSocial.dart:43-51`); paginated `Achievements/posts/postcollection/{docId}` `.get()` per id from `postDocumentID` (`listGridSocial.dart:86-94`). The list of post doc-IDs is computed by the caller (not here). Per-card live reads come from `PostItemWidget`.
- **Writes:** none directly (writes happen via card actions / menu).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes — must be reached through its caller (`social.dart`/`achievements.dart`) which resolves the post-id list. Not ATC.

### Browse a personal post grid (one user's achievements)
- **What the user does:** Views one person's achievement posts (their profile feed / "My Celebration"), auto-scrolled to a chosen post.
- **Nav/entry:** `ListGridPersonal(snapshotRef: <Query>, postIndex, appBar, availableusers)` from `user.dart:422,543` and `PostEvent - Achievements/mycelebration.dart:966`.
- **Reads:** current user `profile_data/{pid}` (`listGridPersonal.dart:53-61`); streams the caller-supplied `Query<Map>` of posts (`listGridPersonal.dart:333`). Per-card reads via `PostItemWidget`.
- **Writes:** none directly.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social / progression.
- **e2e-testability:** Yes (via `user.dart`/`mycelebration.dart`). Not ATC.

### Like / unlike a post
- **What the user does:** Taps the heart on a post card to like; tapping again unlikes.
- **Nav/entry:** Heart `IconButton` in `PostItemWidget` (`Widgets/postItemWidget.dart:735-757`); like state via `checkIfPostLiked()` reading the `likes` subcollection (`postItemWidget.dart:81-96`).
- **Reads:** `<postRef>/likes` where uid == current user (`postItemWidget.dart:83-87`); live `<postRef>/likes` count stream (`postItemWidget.dart:705-709`).
- **Writes:** `AppService().likePost` — if not already liked: increments post `likecount` and adds `<postRef>/likes` doc `{liked_by, uid, profileid, time: serverTimestamp, postid}` (`AppServices.dart:639-648`); if liked: deletes the like doc + decrements `likecount` (`AppServices.dart:650-657`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes — tap heart, assert `likes` subcollection doc + `likecount` increment, then untap and assert removal. Not ATC.

### View who liked a post (Likes tab)
- **What the user does:** Opens a post's like/comment screen and views the **Likes** tab listing profiles who liked.
- **Nav/entry:** `LikeAndCommentTab(index:0)` (Likes tab) → `Likes(value: postref)` (`likesandcomments.dart:82`). Pushed as full route from `exploreSocial.dart:778,804`, `timeline.dart:988`, `homeContent.dart:9904,10788`, `breakthroughsnewPost.dart:481`.
- **Reads:** `<postRef>/likes` (`likes.dart:28`), then `profile_data` where documentId whereIn [profileids] (`likes.dart:34`) to resolve names/avatars.
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes (seed likes, open tab, assert profile names render). Not ATC.

### Comment on a post
- **What the user does:** Types a comment in "Comment as <name>" and sends it; appears in the live thread.
- **Nav/entry:** Comments tab inside `LikeAndCommentTab(index:1)` → `Comments(...)` (`likesandcomments.dart:83-89`); send button `comments.dart:304-321`.
- **Reads:** live `<postRef>/comments` stream (`comments.dart:45`); `profile_data` where profileid whereIn [batch of 10] for commenter profiles (`comments.dart:53`).
- **Writes:** `AppService().commentOnPost` adds `<postRef>/comments` doc `{postid, comment, commented_at: serverTimestamp, name, uid, profileid}` (`AppServices.dart:669-676`, called `comments.dart:308`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes — send comment, assert `comments` subcollection doc + it renders. Not ATC.

### Like / unlike a comment
- **What the user does:** Taps the small heart next to a comment to like it; tap again to unlike.
- **Nav/entry:** Per-comment heart `IconButton` (`comments.dart:236-247`), action `likecomment` (`comments.dart:69`).
- **Reads:** `<commentRef>/commentlikes` where uid == user (`comments.dart:70`); live per-comment like state stream (`comments.dart:226-230`).
- **Writes:** adds `<commentRef>/commentlikes` doc `{liked, uid, profileid, comment_id, time: serverTimestamp}` (`comments.dart:73-79`) or deletes existing (`comments.dart:82-87`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes. Not ATC.

### Delete a comment (own comment or post owner)
- **What the user does:** Long-presses a comment they authored (or any comment if they own the post) → "Delete Comment?" confirm → deletes.
- **Nav/entry:** `onLongPress` guard `commentData["uid"]==useruid || postOwnerUID==useruid` (`comments.dart:170-204`).
- **Reads:** none (operates on comment doc).
- **Writes:** deletes `<postRef>/comments/{commentId}` (`comments.dart:184`) and every doc in its `commentlikes` subcollection (`comments.dart:185-189`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social / support.
- **e2e-testability:** Yes. Not ATC.

### View who liked a comment (CommentLikes)
- **What the user does:** Views the list of profiles who liked a specific comment.
- **Nav/entry:** `CommentLikes(value: <commentlikes CollectionReference>)` (`commentlikes.dart:7`). **No live navigator push found** in non-commented code; the only references are this class + a commented-out User-navigation block (`commentlikes.dart:87-104`). Treat as latent/likely-dead UI (see Dead/clone).
- **Reads:** streams the passed `commentlikes` collection (`commentlikes.dart:48`); per row `profile_data/{profileid}` (`commentlikes.dart:67-69`).
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** No (unreachable via UI today; would only be testable if a caller is added). Not ATC.

### Report a post
- **What the user does:** Opens a post's "..." menu and taps "Report Post"; sees a "Reported" confirmation.
- **Nav/entry:** `postmenu` → "Report Post" in both grids (`listGridPersonal.dart:230-241`, `listGridSocial.dart:119-130`), action `reportpost`.
- **Reads:** none.
- **Writes:** adds `Achievements/blacklist/blacklistrows` doc `{postid: <ref to postcollection/{postid}>, owner: <user_data/{uid}>, reportedby: <user_data/{currentUid}>, dateofreporting: serverTimestamp}` (`listGridPersonal.dart:71-86`, `listGridSocial.dart:188-203`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** support / social.
- **e2e-testability:** Yes — report, assert a `blacklistrows` doc. Not ATC.

### Delete a post (owner only)
- **What the user does:** On their own post, "..." menu → "Delete Post" → "Post Deleted".
- **Nav/entry:** `postmenu` shows "Delete Post" only when `userPreference['uid']==uid` (`listGridPersonal.dart:242-255`, `listGridSocial.dart:131-144`), action `deletepost`.
- **Reads:** `Achievements/posts/postcollection/{postID}` (`AppServices.dart:680-685`).
- **Writes:** deletes the post doc + all `likes` + all `comments` subcollection docs; flips matching `drafts/{postID}` `{publish:false, version: arrayUnion}` if present (`AppServices.dart:686-708`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** content / social.
- **e2e-testability:** Yes. Not ATC.

### View post category chip
- **What the user does:** Sees a coloured category label on each post card (e.g. the achievement category/type).
- **Nav/entry:** Category chip in `PostItemWidget` (`postItemWidget.dart:219-242`).
- **Reads:** `firestore.doc(widget.postCategory)` — `postCategory` is a stored document *path* (`postcategory.path`), resolved to read its `type` field (`postItemWidget.dart:222`, path derived in grids at `listGridSocial.dart:275-277`, `listGridPersonal.dart:367-369`, `draftposts.dart:634-637`).
- **Writes:** none.
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes (seed a category doc referenced by `postcategory`). Not ATC.

### Expand post Significance / Consequence
- **What the user does:** Taps the significance/consequence icons under a post to slide open the full Significance and Consequence text.
- **Nav/entry:** Toggle in `PostItemWidget` (`postItemWidget.dart:495-531`), expanded body `postItemWidget.dart:539-640`.
- **Reads:** none extra (uses fields already on the post).
- **Writes:** none.
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Yes (UI-only; seed a post with significance+consequence). Not ATC.

### View post image gallery (full-screen pager)
- **What the user does:** Taps a post image to open a swipeable, zoomable full-screen image viewer.
- **Nav/entry:** `Image.network` tap → `showImageViewerPager` (easy_image_viewer) in `PostItemWidget` (`postItemWidget.dart:414-440`, thumbnails strip `:442-489`).
- **Reads:** none (images are `postimagelist` URLs on the post; `Image.network` fetches from their CDN/Storage URLs).
- **Writes:** none.
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Partial — image rendering needs real image URLs; the open-viewer interaction is UI-only. Not ATC.

### Open author profile from a post
- **What the user does:** Taps a post author's avatar to open that user's profile.
- **Nav/entry:** Avatar `GestureDetector` → `Navigator.push(User(...))` (`postItemWidget.dart:140-158`).
- **Reads:** `profile_data/{postownerPID}` (already streamed for the header, `postItemWidget.dart:119`).
- **Writes:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes (navigation assert; `User` screen belongs to the profile cluster). Not ATC.

### View "About App" info
- **What the user does:** From a post "..." menu, taps "About App" to see app name / version / build number.
- **Nav/entry:** `postmenu` → "About App" → `aboutapp()` (`listGridPersonal.dart:256-266`, dialog `:139-207`). (Present in `ListGridPersonal` only; `ListGridSocial` menu omits it.)
- **Reads:** `PackageInfo.fromPlatform()` (device/package, not Firestore) (`listGridPersonal.dart:140`).
- **Writes:** none.
- **Config flags:** none.
- **Journey stage:** infra / support.
- **e2e-testability:** Yes (assert dialog text). Not ATC.

### Browse the Community Snippets rail (stories)
- **What the user does:** Scrolls a horizontal rail of vertical-video "story" tiles for the active snippet event; watched stories de-emphasise; the participant's own "My Video Ask" leads the rail.
- **Nav/entry:** `SnippetList(showTitle:...)` embedded in `Main Screen/exploreSocial.dart:545` (showTitle:true) and `Arena Elements/arenaHighlights.dart:281` (showTitle:false).
- **Reads:** `activesnippet/0` to get active event refs + videoask event refs (`snippetList.dart:88-94`); `community post` where `type=="story"` and `eventref` whereIn eventRef, orderBy created desc (`snippetList.dart:97-103`); `participantvideoask` where arenaevent whereIn [...eventRef,...videoAskeventRef] and profileid==me and convertedtohls==true (`snippetList.dart:150-159`). Uses `appService.loggedinProfile["profileid"]` (`snippetList.dart:40`).
- **Writes:** none (rail is read-only; watched is written by the player).
- **Endpoints:** thumbnails from `media.publit.io` (`snippetList.dart:475`, `:232`).
- **Config flags:** none — gating is data-driven via the `available`/`showsnippet`/`activesnippet` documents, not remote config.
- **Journey stage:** content / social.
- **e2e-testability:** Yes — seed `activesnippet/0` + `community post` story docs (+ optional `participantvideoask`); assert rail tiles. Not ATC. Note: real thumbnails require publit.io reachability.

### Play a community snippet story (full-screen, auto-advance, watched-tracking)
- **What the user does:** Taps a snippet tile to open the full-screen story player; auto-advances through each video, tap-left/right to go back/forward, X to close; images auto-advance after 15s.
- **Nav/entry:** Tile tap in `SnippetList` → `Navigator.push(ViewSnippet(index, snippetList))` (`snippetList.dart:452-463`).
- **Reads:** uses the passed-in snippet list (already fetched). Video/thumbnail from `media.publit.io` (`viewSnippet.dart:235,256,330,345,384,399`).
- **Writes:** `updateWatched` adds the user's `profileid` to the current video's `watched` array and updates `community post/{docid}` `{videos: <list>}` (`viewSnippet.dart:458-474`).
- **Endpoints:** **publit.io** HLS mp4 (`h_480`) + jpg thumbnails (`q_50`).
- **Config flags:** none.
- **Journey stage:** content.
- **e2e-testability:** Partial — Firestore "watched" write is testable; actual video playback depends on publit.io media (external). Not ATC.

### Open "My Video Ask" from the snippet rail
- **What the user does:** Taps the "My Video Ask" lead tile to view their own recorded video-ask answers.
- **Nav/entry:** `myVideoAsk()` tile tap → `Navigator.push(ParticipantVideoAsk(videoAskList:...))` (`snippetList.dart:250-264`). (`ParticipantVideoAsk` lives in the Arena cluster.)
- **Reads:** `participantvideoask` (loaded in `SnippetList.loadSnippet`, `snippetList.dart:150-159`).
- **Writes:** none here.
- **Endpoints:** thumbnail `media.publit.io` (`snippetList.dart:232`).
- **Config flags:** none.
- **Journey stage:** content / progression.
- **e2e-testability:** Partial — tile presence + nav testable; playback is external. Not ATC.

## Firestore collections

### Read
- `Achievements/posts/postcollection/{postId}` — the achievement feed posts (read in both grids; per-post `likecount`, `postcategory` path, `postmessage`, `significance`, `consequence`, `postimagelist`, `created`, `uid`, `profileid`, `name`, `private`). Subcollections: `likes` (where `uid`==me; count stream), `comments` (count + thread stream).
- `Achievements/posts/postcollection/{postId}/likes` — like docs (fields `uid`, `profileid`, `liked_by`, `time`, `postid`).
- `Achievements/posts/postcollection/{postId}/comments` — comment docs (fields `comment`, `name`, `uid`, `profileid`, `commented_at`, `postid`).
- `Achievements/posts/postcollection/{postId}/comments/{cid}/commentlikes` — comment-like docs (fields `uid`, `profileid`, `liked`, `comment_id`, `time`).
- `drafts/{postId}` — user drafts; queried `where uid==me & created >= today` (`draftposts.dart:598-600`); also `where publish==true & uid==me & date==<ddmmyyyy>` in publish workflow (`editachievement.dart:182-193`).
- `profile_data/{profileId}` — author/commenter/liker names + avatars (read in `PostItemWidget`, `Comments`, `Likes`, `CommentLikes`, both grids, `LikeAndCommentTab`); queried by doc id and by `where profileid whereIn [...]` / `where documentId whereIn [...]`.
- `<postcategory path>` — a referenced category doc (read for its `type`), path stored on the post as `postcategory` (`postItemWidget.dart:222`).
- `activesnippet/0` — active snippet event config (`event`, `videoaskevent`, `title`, `highlight`) (`snippetList.dart:88`).
- `community post` — snippet "story" docs; `where type=="story" & eventref whereIn [...] orderBy created desc` (`snippetList.dart:97-103`); fields used: `available`, `videos` (list of `{video,hls,thumbnail,thumbnailhls,watched[]}`), `docid`, `categoryname`.
- `participantvideoask` — user's video-ask answers; `where arenaevent whereIn [...] & profileid==me & convertedtohls==true` (`snippetList.dart:150-159`).
- `user_data/{uid}` — read indirectly as a reference target when building report rows (the doc itself is referenced, not field-read) (`listGridSocial.dart:198-201`, `listGridPersonal.dart:81-84`).

### Written
- `Achievements/posts/postcollection/{postId}` — **set** on publish (from draft) (`draftposts.dart:42-58`, `editachievement.dart:209-233`,`:286-310`,`:495-513`); **update** `private/postmessage/...` on edit; **delete** (with subcollections) on delete/unpublish (`AppServices.dart:686-697`).
- `Achievements/posts/postcollection/{postId}/likes` — **add** on like / **delete** on unlike (`AppServices.dart:642-657`); bulk-deleted on post delete.
- `Achievements/posts/postcollection/{postId}` field `likecount` — **increment(+1/-1)** on like/unlike (`AppServices.dart:639-657`).
- `Achievements/posts/postcollection/{postId}/comments` — **add** on comment (`AppServices.dart:669-676`); **delete** on comment delete (`comments.dart:184`); bulk-deleted on post delete.
- `Achievements/posts/postcollection/{postId}/comments/{cid}/commentlikes` — **add/delete** on comment like/unlike (`comments.dart:73-87`); bulk-deleted on comment delete (`comments.dart:185-189`).
- `drafts/{postId}` — **update** `publish` + `version` arrayUnion on publish/unpublish/edit/replace (`draftposts.dart:60-65`,`:264-272`,`:283-288`; `editachievement.dart` multiple; `AppServices.dart:700-705`).
- `Achievements/blacklist/blacklistrows` — **add** on Report Post (`listGridSocial.dart:188-203`, `listGridPersonal.dart:71-86`).
- `community post/{docid}` — **update** `videos` (with appended `watched` profileid) on snippet view (`viewSnippet.dart:469-472`, `playSnippet.dart:285-288`).

> Note: post *creation* (the first write of a `drafts` doc, image upload) is **not** in this cluster's files — it originates from a compose screen (e.g. `breakthroughsnewPost.dart`, outside this assignment). This cluster only publishes/edits/deletes existing drafts/posts and renders feeds.

## Endpoints & external services
- **publit.io** (video CDN): HLS mp4 `https://media.publit.io/file/h_480/<id>.mp4` and jpg thumbnails `https://media.publit.io/file/q_50/<id>.jpg` — used across `snippetList.dart`, `viewSnippet.dart`, `playSnippet.dart`. IDs come from `videos[*].hls.responsepublitio.id` / `thumbnailhls.responsepublitio.id`. External media host; not Firebase.
- **Firebase Storage (hardcoded placeholder):** `snippetStory.dart:53` references a blank-9-second mp4 at bucket `test-environment-841c3.appspot.com`. Hardcoded fallback URL (note: points at a `test-environment` bucket, not one of the three named projects). `snippetStory.dart` itself appears uncalled (see Dead/clone).
- **No** Cloud Functions / httpsCallable / Dio / explicit `FirebaseStorage.ref()` calls inside the assigned cluster files. (`AppService` social methods touch only Firestore.)
- `Image.network` / `CachedNetworkImage` fetch profile + post images from whatever URLs are stored on the docs (origin not pinned in these files).

## Config & feature flags
- **None.** No `remoteConfig`/`RemoteConfig`, no PostHog, no FCM/`FirebaseMessaging`, no `SharedPreferences`/localstorage usage in any assigned cluster file (verified by grep). Snippet visibility is **data-driven** (`activesnippet/0`, per-video `available`/`watched`), not flag-driven. The "one achievement per day" rule is hardcoded date logic.
- Current-user identity comes from `UserData().getUserData()` (returns `{uid,pid}`) and `AppService().loggedinProfile["profileid"]` (in-memory), not from a config service.

## Dead / clone / Old code
- `post.dart` (`InstagramLikeUI`/`PostWidget`/`AnimatedLoveIcon`/`LikesCounter`) — **hardcoded Instagram-clone demo**: fake usernames `['john_doe','travel_girl','photo_lover']`, static "1234 likes", no Firestore, no real nav. Not part of the live social flow. **Dead/demo.**
- `snippetStory.dart` (`SnippetStory`) — full-screen story player; **no live caller found** (search for `SnippetStory(` returns only its own definition). Contains a hardcoded `test-environment-841c3` blank-video URL. Superseded by `ViewSnippet`. **Likely dead.**
- `Community Snippets/playSnippet.dart` (`PlaySnippet`) — alternate snippet player; **no live caller found**; large commented-out `CarouselSlider` body; `viewStory`/`swipeNext` commented out. Superseded by `ViewSnippet`. **Likely dead.**
- `Community Snippets/openVideo.dart` (`OpenVideo`) & `Community Snippets/openImage.dart` (`OpenImage`) — only referenced from **commented-out** code in `viewSnippet.dart`/`playSnippet.dart`. **Effectively dead** helpers.
- `commentlikes.dart` (`CommentLikes`) — class exists but **no live navigator push** found (only its definition + a commented-out `User(...)` block). Latent/unreachable today.
- Large commented-out blocks inside live files (do not represent live behaviour): `listGridPersonal.dart:398-671` (an entire old inline like/comment/profile UI), `comments.dart:261-288` (old comment field), `likesandcomments.dart:96-143` (old scaffold), `likes.dart:64-82` & `commentlikes.dart:87-104` (commented `User` navigation). `Main Screen/exploreSocialOld.dart` is referenced by entry-point grep but is itself an `*Old` file (out of cluster, dead).
- `post.dart`'s `LikeAndCommentTab` callers in `postGridWidget.dart:693`, `postItemWidget.dart:683`, `myprofiledashboardold.dart:1083`, `timeline.dart:962`, `myjourney.dart:1470`, `social.dart:951`, `mycelebration.dart:718` are **commented out** — the live pushes are the non-commented ones listed under features.

## Notes & open questions
- **Post creation lives outside this cluster.** The first `drafts` write (compose + image upload, `postimagelist`, `postcategory` selection) is in a compose screen not in the assigned set (`Widgets/breakthroughsnewPost.dart` is a likely owner). For e2e, drafts must be **seeded** or created via that screen before this cluster's publish/edit/delete paths can run.
- **`ListGridSocial` requires a pre-resolved `postDocumentID` list** from its caller (`social.dart`/`achievements.dart`); it cannot be opened standalone. `ListGridPersonal` requires a caller-supplied `Query`. Plan e2e through their real callers.
- **`likecount` can drift:** `likePost` increments/decrements `likecount` but the UI counts `likes.docs.length` directly; deletes via `deletePost` remove like docs but do not reset `likecount`. Behavioural quirk, not a test blocker.
- **publit.io & the `test-environment-841c3` bucket** are external to the three named Firebase projects (`fir-sample-aae4a` prod / `starlabs-test` / `launch-your-legacy-development`); snippet video playback in e2e will hit external media unless stubbed.
- **ATC:** none of the cluster files write or read ATC collections. The only `atc` token is a **commented-out** legacy title string in `commentlikes.dart:38` ("Comment Likes" replaced an old ATC-list title) — informational only, no ATC touch.
- `Comments` profile-batch loop (`comments.dart:49-51`) only keeps the **last** 10-id sublist (loop overwrites `subList`), so threads with >10 distinct commenters may not resolve all avatars/names. Possible bug; noted for completeness, not a test gate.
