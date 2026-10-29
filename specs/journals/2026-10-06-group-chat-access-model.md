# 2026-10-06 — Group chat: `group_admin` dropped, A&H members are admins, My / Other groups, lazy loading

## CHANGE LOG & REVERT GUIDE

| # | State | Scope | Files | Revert |
|---|---|---|---|---|
| 1 | uncommitted | Access model: `members` only, `ahmember` = admin, My / Other groups split, view-only for non-members, admin toggles removed | `src/app/Events/Chat/group-chat-screen/group-chat-screen.component.ts`, `…/group-chat-screen.component.html` | `git checkout -- "src/app/Events/Chat/group-chat-screen/"` |
| 2 | uncommitted | Lazy group streams: each list's listener starts on first open; Other / Archived paged by 30 | same two files | reverts together with #1 (same files) |

| 3 | uncommitted (on `feature-test`) | Info panel lists **A&H members** in their own section above Participants (live groups sorted by `ahmember`); one shared search; note when a group has no A&H member; new hook `gcs-info-team-avatar` | same two files | reverts together with #1 |

| 4 | uncommitted (on `feature-test`) | Hover action strip + emoji picker flip to the card's left corner when they would start left of the thread pane (short incoming messages were clipped). `onBubbleEnter()` measures after render; `.from-left` class | `.ts`, `.html`, `.css` | reverts with the rest |
| 5 | uncommitted (on `feature-test`) | **Announcements on web**, matching Flutter's storage: "announcement" toolbar button next to "link" (A&H/`chatxadmin` only; text only, not a reply, not while editing). Message gets `announcement: true`; group doc gets `last_announcement_at` = same server time as `last_modification`. Reads the flag back, megaphone in the chat list, deleting the latest announcement clears `last_announcement_at`. Announcement card: Edit (own), Pin/Delete hidden for view-only. New hooks `gcs-composer-announce`, `gcs-ann-edit` | `.ts`, `.html`, `.css` | reverts with the rest |
| 6 | uncommitted (on `feature-test`) | A&H member rows (info panel) and the Add-members picker no longer show the `users_roles.name` pill — it is the person's own name, so it duplicated the row | `.html` | reverts with the rest |

| 7 | uncommitted (on `feature-test`) | **Reactions saved to Firestore**, same as Flutter: `reactions.<emoji>` = [uid…], toggled with arrayUnion/arrayRemove via `FieldPath`. Emoji set now Flutter's 👍 🙌 ❤️ 🔥 🙏. Chips show for everyone (count only when >1), tappable only where `features.react`. Announcement card gets the 5-emoji picker instead of a fixed 👍. New hook `gcs-ann-picker-emoji` | `.ts`, `.html`, `.css` | reverts with the rest |

| 8 | uncommitted in **breakthroughs-flutter** (`harish-development`) | Mobile Messages hub: **Channels tab commented out**, hub shows Chats · Support. `MsgHubTab` enum, TabController length 2, labels/counts/hints/children lists; channel unreads dropped from `MessagesService.total` (the chat-icon badge). `_channelsTab()` kept with `ignore: unused_element` | `lib/Messages/messagesHub.dart`, `lib/Messages/messagesService.dart` | `git -C ~/Projects/Flutter/breakthroughs-flutter checkout -- lib/Messages/messagesHub.dart lib/Messages/messagesService.dart` |

| 9 | uncommitted (on `feature-test`) | **Web ↔ mobile parity for group messages.** Send: one client `Date` for `time` / `last_modification` / `last_announcement_at` (fixes the never-showing megaphone), `pendingcount.<uid>` +1, `sender_email`, YouTube `links`, `mentions: null` when none, `voice_seconds` + 64-bar `voice_wave` on voice notes, `last_message` = first file's kind. Files: the app's record (`filetype` ext, `mediatype` kind, `filethumbnail` ~480px JPEG / video first frame), contentDisposition. Edit: `edited`, `edited_at`, group `last_message` when newest. Delete: the app's SOFT delete (`deleted`, `deleted_at`, `deleted_by`, `deleted_content`, emptied content, `pending: []`, `pendingcount` down — clamped at 0 —, `last_message`/`last_sender_uid` from the previous standing message, `last_announcement_at` removed, quotes in replies blanked); deleted messages hidden except for the A&H team, who see them dimmed with "Deleted … today, 2:31 PM". Read: `edited` label (dropped the duplicate in-bubble one), "Uploading N files…" while a phone's files land, quotes of deleted messages, image/video previews, chat-list media labels ("📷 Photo"). Chat pin for groups is per person (`pinnedat.<uid>`); channels keep `pinned` | `.ts`, `.html`, `.css` | reverts with the rest |
| 10 | uncommitted in **breakthroughs-flutter** (`harish-development`) | `message_search` written on send/edit (new `msgSearchKey`, identical to web `normalizeForSearch`), removed on delete; opening a chat also removes me from `last_pending`, so the web stops showing it unread | `lib/Messages/msgFormat.dart`, `lib/Messages/msgThread.dart` | `git -C ~/Projects/Flutter/breakthroughs-flutter checkout -- lib/Messages/msgFormat.dart lib/Messages/msgThread.dart` |
| 11 | uncommitted in **starlabs-cloud-function** (`development`), **NOT deployed** | `ChatxNotification`: `last_message` = first file's `mediatype` when the message has files and no text (was `''`) | `functions/components/communication.js` | `git -C ~/Projects/Functions/starlabs-cloud-function checkout -- functions/components/communication.js` |

| 12 | uncommitted (on `feature-test`) | **Web unread badge now counted like the app**: per group in My groups, a listener on messages whose `pending` lists me (minus my own and deleted, limit 100); `pendingcount[me]` until it answers. `last_pending` no longer drives the badge. Found on "test 123" (starlabs-test): Charan read everything on the phone (in every message's `read_by`, no `pendingcount` entry) but `last_pending` still listed him, because the installed app never removes you from it — so web showed a badge, the app didn't | `.ts` | reverts with the rest |

| 13 | uncommitted (on `feature-test`) | Chat-list preview built like the app's `msgGroupPreview`: `@<profileid>` → `@Name` (at display time, so late-loading names apply), formatting marks dropped, first line only (`listPreview`). `buttons` written only when the message has some (the app never writes the field; it only displays buttons) | `.ts`, `.html` | reverts with the rest |

| 14 | uncommitted (on `feature-test`) | **Announcement card + chat wallpaper match the app.** Card = the app's `MsgAnnouncementCard` (msgBubble.dart): #155E89 blue, radius 24, 46px gold #F4B63F megaphone disc on the top edge ringed in the wall colour, "ANNOUNCEMENT" gold 11.5/2.2 tracking, 16px bold centred white words, sender · time in 75% white, reactions pulled up onto the bottom edge; deleted = slate #637280 + pale disc. Web actions (react/info/edit/pin/delete) moved into the normal hover strip on the card's corner. Wallpaper = the app's `MsgChatWallpaper` (msgMedia.dart): #EBEFF2 wall + 240px tile of the app's own line icons, generated by running the app's `_WallTile` layout in Dart (same `Random(11)` jitter, stroke 1.6) and inlined as a data-URI SVG; fixed while messages scroll; dark theme uses the same tile in faint white on #0B0C0F. Applies to every thread pane (groups and channels) | `.html`, `.css` | reverts with the rest |

| 15 | uncommitted (on `feature-test`) | **Group settings like the app** (msgChatInfo.dart): groups now read/show/edit `description` (multi-line, max 300; cleared → field removed) and `linked_event` (free text, max 60; shown in info as "Linked event" and under the name in the thread header). Group management (`canManageGroupOf`) now = (`ahmember` OR `chatxadmin`) AND member — the app's `isTeam`; this also gives chatxadmin add/remove members, rename, picture, archive/restore. `canEditChat` is false for archived groups (rename, picture, description, event hidden), as the app hides Group settings on inactive groups; restore unaffected. `saveChannelDesc` → `saveDescription` (both kinds). New hooks `gcs-info-event-edit/-add/-input/-save/-cancel` | `.ts`, `.html`, `.css` | reverts with the rest |

| 16 | uncommitted (on `feature-test`) | **Unique group names, case kept.** Create and rename (groups only) refuse a name another chat already uses — every `supportchat` doc, any type, active or archived, except the one being renamed — compared ignoring case and repeated spaces; "Another chat already has this name." shows under the field and the field stays open. Names are saved as typed (operator: NOT lowercased like the app). Case-insensitive because the app stores lowercase: "Test 123" must clash with the app's "test 123". starlabs-test already holds 7 clashing names (e.g. 8 groups called "test"); existing ones are left alone, only new creates/renames are checked | `.ts`, `.html`, `.css` | reverts with the rest |

| 17 | uncommitted (on `feature-test`) | Create-group dialog: the "Created under event" dropdown (fed by the screen's DEMO events and never saved for real groups) is replaced by a free-text **Linked event (optional)** box, max 60, saved on create as `linked_event` on the group doc only when filled. `cEventId` → `cEvent` | `.ts`, `.html` | reverts with the rest |

| 18 | uncommitted (on `feature-test`) | Archive / restore of a GROUP now writes the app's `inactive_at` (server time) + `inactive_by` (uid) with `isdelete: true`, and removes both on restore — the app's Make inactive / Reopen (`_setInactive`). Channels unchanged (`isdelete` only) | `.ts` | reverts with the rest |

| 19 | uncommitted (on `feature-test`) | **Linked event is now a REFERENCE** (operator, 2026-10-29: "ref only, don't store the name, use the linked_event_ref field"). Group field `linked_event_ref` = DocumentReference to `event collection/{id}` (the main events: `name`, `start_date`, `end_date`; 45 in test, 115 in prod). Picked from a list of every event, newest first ("name · 21 Aug – 24 Aug") in Info and in the create dialog; "— No linked event —" removes the field. The name is read LIVE per linked event (`docSnapshots`), never stored; a deleted event shows "Event not found". Saving also removes the old free-text `linked_event` (#15/#17), which no group used yet | `.ts`, `.html`, `.css` | reverts with the rest |
| 20 | uncommitted in **breakthroughs-flutter** (`harish-development`) | Same in the app: `msgLinkedEvent(chat)` reads `linked_event_ref`; `MsgLinkedEventName` streams the event's name for the info-header pill and the thread header; Group settings replaces the free-text field with an event picker sheet (search, newest first, "No linked event"); save writes `linked_event_ref` (or deletes it) and deletes `linked_event` | `lib/Messages/msgChatInfo.dart`, `lib/Messages/msgThread.dart` | `git -C ~/Projects/Flutter/breakthroughs-flutter checkout -- lib/Messages/msgChatInfo.dart lib/Messages/msgThread.dart` |

| 21 | uncommitted (on `feature-test`) | Web event picker: the two `<select>`s (Info, create dialog) are replaced by the app-style picker — search box (name or dates) over a scrolling list, "No linked event" row, tick on the chosen one; Info gets Cancel / Save under it. Hooks: `gcs-info-event-search(-clear)/-none/-option`, `gcs-create-event-search(-clear)/-none/-option`; `gcs-info-event-input` and `gcs-create-event` are gone | `.ts`, `.html`, `.css` | reverts with the rest |

#1–#7, #9, #12–#19 and #21 live in the same component files; #8, #10, #11, #20 are other repos; reverting one alone means hand-editing. #8, #10, #11 are other repos.

## Announcements — why it matches Flutter exactly
Flutter (`harish-development`, `lib/Messages/msgThread.dart` `_sendDraft`) writes `announcement: true` on the
message and `last_announcement_at: time` on the group, and decides "latest is an announcement" by comparing
`last_announcement_at` to `last_modification` within 1 ms (`MessagesService.latestIsAnnouncement`).

**CORRECTION 2026-10-26 — the web megaphone does not work.** The earlier claim here ("one `updateDoc`, same
instant, both apps agree") missed the `ChatxNotification` Cloud Function (starlabs-cloud-function,
`communication.js`). It runs on every new message and sets the group's `last_modification` to the MESSAGE's
`time`. Web writes the message `time` with one `serverTimestamp()` (setDoc) and `last_announcement_at` with
another (the later updateDoc), typically tens of ms apart, so the 1 ms check fails on both apps. Flutter works
because it uses one client `DateTime` for the message time, `last_modification` and `last_announcement_at`.
Fixed in #9: the web now uses one client time for all three. Full app-vs-web field audit was sent to the
operator as a scratchpad doc, not committed (docs-outside-project rule). Reactions were wired the same way in #7. Reverting one alone means hand-editing; they were made back-to-back.

## What was asked
1. "Before we were having the admins array, it's not needed. In user roles there is a role called
   ahmember, they are all admins." → `group_admin` is no longer read or written.
2. "There will be only members array. We are separating my groups and other groups. When their id is
   not in the members, they can only see the messages. The team member in that group can add another
   member to reply."
3. Mid-session: "are you fetching all groups at once, fetch based on the tab I clicked".

## The model now
- **`members` (uids)** is the only per-group access list. In it → read and post. Not in it → view-only.
- **`users_roles.ahmember == true`** is the only admin signal. Read via `guard.getRoles()` for the signed-in
  user, and via the `users_roles` listener (`profile_ref` → profile_data doc id → uid) for other members.
- **Who sees what:** A&H members, `chatxadmin` and `admin` see every group, split into *My groups* and
  *Other groups*. Everyone else sees only their own groups and gets no split.
- **Managing a group** (add/remove members, rename, picture, archive, restore) needs BOTH `ahmember` AND
  being in that group's `members`. This is the literal reading of "the team member in that group can add".
- **View-only threads** keep Copy and Raise ticket. Reply, react, edit, pin, delete, multi-select and the
  composer are gone. Banner: "You are not a member of this group… An A&H member in the group can add you."
  Header pill: VIEW ONLY. Opening one writes no read receipts — `pending` never contains a non-member.
- **Last A&H member guard:** removing the only A&H member from a group is refused, because nobody could
  ever add anyone again. Same reason the old code refused to remove the last `group_admin`.
- **"A&H Team - Name" sender label** and the ADMIN pill (now "A&H") key off `ahmember`.
- **New groups** no longer write `group_admin`; the create dialog lost its shield/admin buttons.

## Why lazy streams
Before, `loadGroups()` opened two listeners at load: every active group and every archived group. With
A&H members now seeing all groups, that is the whole `supportchat` group set on first paint.
- `mine` — `members array-contains me`, started at load. Needed for the default list and the unread badge.
- `others` — started on first *Other groups* click. All active groups, `orderBy last_modification desc`,
  `limit 30`, grows by 30 per "Load more groups". Firestore has no "not array-contains", so my own groups
  are dropped client-side; a page can therefore show fewer than 30.
- `archived` — started on first *Archived › Groups* view. Paged the same way for A&H/admins; unpaged
  (members filter) for everyone else.
- The paged queries use (type ==, isdelete ==, last_modification desc), the same shape the channel list
  already queries, so no new index should be needed. **Not verified against a live project.**
- Each row carries `_bucket`; a snapshot only replaces its own bucket's rows. A transient mine/others
  overlap during a membership change is de-duplicated, preferring `mine`.

## Surprise
- `applyDirectory()` looked roles up by the `profileid` FIELD, but `users_roles.profile_ref` points at the
  profile_data DOC id. Where the two differ, role lookups silently missed. The new `roleOfUid()` tries the
  doc id first, then the field.

## Not verified
- Build is green (`ng build --configuration development`). No live click-through: the preview lands on
  the login page and this session cannot sign in.
- Old docs still carry `group_admin`; it is ignored, not deleted.

## Pending
- **e2e (before push):** `events/events-chat-controls-addressable.spec.ts` still names
  `gcs-info-participant-admin` and `gcs-create-person-admin`, which no longer exist. New hooks
  `gcs-subtabs-groups` and `gcs-list-loadmore-groups` need registering. `comms/chat.spec.ts` comments and
  `seed-comms.js` still describe `group_admin`; CN-08/09/17 should still pass (chatadmin is a member).
  Worth adding: an ahmember sees a non-member group under Other groups with no composer.
- Group **creation** is still open to anyone who reaches the screen. A non-A&H creator makes a group no
  one can manage until an A&H member is in it. Decide whether create should be A&H-only.
- Whether `chatxadmin`/`admin` without `ahmember` should keep seeing every group — kept for now so they
  do not lose visibility.
