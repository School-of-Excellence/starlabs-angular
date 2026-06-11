# Cluster: Chatx, Chat Ticket System, Raise Customer Support

> Static code+config map of the participant-facing chat & support surfaces in `breakthroughs-flutter` (branch `development`).
> Read-only pass. Evidence cited as `file:line`. No build/run/Firestore queries were performed.

## Overview
For the participant, this cluster is the **Help & Support / Chat** surface. Three sub-systems coexist:
1. **Chat Ticket System** (LIVE, `lib/ChatTicketSystem/`) — the current, in-use support channel. From the in-app "Chat" hub (`ChatHome`) the participant taps a floating button to **Raise a Ticket** (pick a category, describe the query, attach media) or view **My Tickets** (open/closed tabs). Each ticket opens a 1:1 threaded **ticket chat** with the A&H admin team (text, media, voice, links, reply, copy, delete-own, re-open within 7 days of closure). Tickets are also reachable as a **deep link from a push/in-app notification** (`type == "supportticket"`).
2. **Chatx group chat** (PARTIALLY LIVE, `lib/Chatx/`) — a group-messaging engine ("Support Chat"/"Support Desk"). The **group** chat list (`ChatList`) is embedded live in `ChatHome`; admins (`chatxadmin` role) can create groups, add/remove members, edit description, pin messages, and escalate selected messages into a customer-support ticket. The **personal (1:1)** and **supportdesk** ("Chat with us") variants of this engine are present in code but their entry points are commented out — see Dead/clone section.
3. **Raise Customer Support** (admin-facing, `lib/raiseCustomerSupport.dart`) — a structured "Raise Ticket" form reached only from the Chatx **support-admin** chat ("issue opened" action). It writes a fully-formed `clientissue` record (journey, product, assignee(s), status, notes). Not a participant journey screen, but it shares the `clientissue` collection with the participant ticket system.

The dominant participant journey stage is **support**; group chat touches **social/content**; the admin escalation form is **support (staff)**.

## Screens
| Screen | file:line | Purpose |
|---|---|---|
| ChatxMain (role router) | `lib/Chatx/chatxMain.dart:7` | Reads `profile_data`→`role_ref`, routes to `ChatxAdmin` if `chatxadmin` else `GeneralUser`. **No live external caller** (orphaned). |
| GeneralUser (supportdesk shell) | `lib/Chatx/generaluser.dart:5` | Wraps `ChatScreen(chatType:"supportdesk")` over `supportdesk/{uid}/messages`. Reached only via `ChatxMain`. |
| ChatxAdmin (support desk admin tabs) | `lib/Chatx/chatxadmin.dart:12` | "Support Desk" admin screen; "Create New Group" sheet + `SupportList`. Reached only via `ChatxMain`. |
| ChatList (group chat list) | `lib/Chatx/chatlist.dart:13` | **LIVE** (embedded in `ChatHome`). Lists `supportchat` groups the user is a member of; opens group `ChatScreen`. |
| SupportList (admin support-desk inbox) | `lib/Chatx/supportlist.dart:8` | Admin list of all `supportdesk` user threads; opens `ChatScreen(chatType:"supportadmin")`. Live entry commented out in `ChatHome`. |
| ChatScreen (universal chat engine) | `lib/Chatx/chatscreen.dart:42` | Core messaging UI: group / personal / supportadmin / supportdesk. Send text+media+voice+links, reply, pin, copy, delete, mentions, read receipts. |
| AboutGroup (group info) | `lib/Chatx/aboutgroup.dart:12` | Group profile/description, member list, add/remove members, leave group. |
| AddNewPeople (member picker) | `lib/Chatx/addnewpeople.dart:9` | Pick `profile_data` members to create a new group or add to an existing one. |
| Messageinfo (read receipts) | `lib/Chatx/chatscreen.dart:3862` | "Message info" — Read_By / Delivered-To lists for one group message. |
| Pinnedinfo (pinned drawer) | `lib/Chatx/chatscreen.dart:3560` | Bottom sheet of pinned group messages; admin can unpin one or all. |
| Betterplayerscreen (video) | `lib/Chatx/chatscreen.dart:~3475` | Fullscreen video player for a chat media item. |
| ChatHome (Chat / Help hub) | `lib/Main Screen/chathome.dart:17` | **LIVE hub.** Embeds `ChatList`; floating button → Raise a Ticket / My Tickets; admin → create group. Reached from a global app-bar icon (`Widgets/Themes.dart:464`). |
| TicketCategories (category picker) | `lib/ChatTicketSystem/ticketCategories.dart:11` | **LIVE.** "Help & Support" — lists support categories from `chat config` (where `show==true`); tap → `RaiseTicket`. |
| RaiseTicket (new-ticket form) | `lib/ChatTicketSystem/raiseTicket.dart:21` | **LIVE.** Describe query + attach media; submit calls `AppService.raiseTickets()`. Shows generating/success animation, then opens chat. |
| ClientTicket (my tickets) | `lib/ChatTicketSystem/clientTickets.dart:11` | **LIVE.** Tabbed Open/Closed list of own `clientissue` tickets with unread badges; tap → `TicketChat`. |
| TicketChat (ticket thread) | `lib/ChatTicketSystem/ticketChat.dart:32` | **LIVE.** 1:1 support thread for one `clientissue`; send/reply/copy/delete media+text+voice, re-open (≤7 days), offline banner. |
| BetterPlayerScreen (video, ticket) | `lib/ChatTicketSystem/ticketChat.dart:996` | Fullscreen video player for ticket media. |
| RaiseCustomerSupport (admin escalation form) | `lib/raiseCustomerSupport.dart:9` | Staff form to raise a structured `clientissue` (journey/product/assign/status/notes) from a support-admin chat. |
| Shared chat widgets | `lib/ChatTicketSystem/chatWidget.dart:20+` | `MediaPickerHelper`, media preview/import dialog, image/video/audio/document bubbles, upload progress, date separator, new-message indicator. |

## Features

### F1 — Raise a support ticket (category + query + media)
- **What the user does:** From `ChatHome`, taps the floating "Raise a Ticket" → `TicketCategories`, picks a category, types a query in `RaiseTicket`, optionally attaches media (image/video/audio/doc), taps "Raise a Ticket".
- **Nav/entry:** `ChatHome` floating button `createNewTicket()` (`chathome.dart:206,484`) → `TicketCategories` → `RaiseTicket` (`ticketCategories.dart:220`). Also raised from Delivery Queue "Contact Support" (`Delivery Queue/queueControl.dart:654`) with a pre-filled slot message.
- **Reads:** `chat config` (categories where `show==true`, and `messages`/`assignto`) — `ticketCategories.dart:37`, `AppServices.dart:3653`; `counters/ticketCounter` (transaction) — `AppServices.dart:3732`.
- **Writes:** `clientissue/{auto}` (issue doc) + `clientissue/{id}/messages/{auto}` (first message) via batch — `AppServices.dart:3671,3672,3707-3709`; `counters/ticketCounter.currentNumber` incremented — `AppServices.dart:3740,3744`. Media rows → local SQLite `chatmedia` then Storage (see F12). Issue fields: `issueno, clientid(=profileid), reporteddate, journey(=usermetadata.activejourney), assign(=category.assignto), status{status:'Open'}, issue, category, subcategory, email, mobile, name, chatstatus:'New', review:{}, mandatereview:{}` — `AppServices.dart:3770-3798`.
- **Endpoints:** Firebase Storage for attachments (via `AppService.uploadMedia`). No HTTP/CF call in this path.
- **Config flags:** Categories & their `assignto` are driven by Firestore doc `chat config` (data-driven, not RemoteConfig).
- **Journey stage:** support.
- **e2e-testability:** Yes — pure Firestore writes against test project; seed a `chat config` doc + `counters/ticketCounter`. No ATC.

### F2 — View my tickets (open / closed tabs)
- **What the user does:** Opens "My Tickets", switches Open/Closed tabs, sees ticket no, issue text, date, status pill, and an unread-reply badge.
- **Nav/entry:** `ChatHome` floating button `viewExistingTickets()` (`chathome.dart:213,489`) → `ClientTicket`.
- **Reads:** `clientissue` where `clientid == loggedinProfile.profileid` orderBy `last_modification desc` (snapshots) — `clientTickets.dart:42-46`; per open ticket, `clientissue/{id}/messages` where `pending arrayContains 'user'` for unread badge — `clientTickets.dart:354-358`.
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** support.
- **e2e-testability:** Yes — seed `clientissue` docs for the test user across statuses.

### F3 — Ticket chat: send message (text / links)
- **What the user does:** In `TicketChat`, types a message and sends; YouTube links auto-detected for preview.
- **Nav/entry:** `ClientTicket` card tap (`clientTickets.dart:242`); or notification deep link (F11); or auto after raising (F1, `AppServices.dart:3830`).
- **Reads:** `clientissue/{issueid}` doc (snapshots, for status/chatstatus) — `ticketChat.dart:199-203`; `clientissue/{issueid}/messages` orderBy `time desc` (snapshots) — `ticketChat.dart:213-216`; `clientissue/{issueid}/messages` where `pending arrayContains 'user'` (mark read) — `ticketChat.dart:186-190`.
- **Writes:** `clientissue/{issueid}/messages/{auto}` set with `{time, sender_uid, sender_email, sender_profileid, message, read_by:['user'], pending:['admin'], links, files:[], type:'chat', clientid, ticketid}` — `ticketChat.dart:269-283`; `clientissue/{issueid}` update `{last_modification, chatstatus: Responded→'Decision Making', review:{}, mandatereview:{}}` — `ticketChat.dart:285-290`; mark-read updates on incoming msgs `read_by += user / pending -= user` — `ticketChat.dart:236-239`; on open: `clientissue/{issueid}` `last_read_by += user / last_pending -= user` — `ticketChat.dart:159-163`.
- **Endpoints:** Storage for attached media (F12).
- **Config flags:** none.
- **Journey stage:** support.
- **e2e-testability:** Yes.

### F4 — Ticket chat: re-open a resolved ticket
- **What the user does:** On a closed ticket (within 7 days of closure), taps "Re-Open", confirms.
- **Nav/entry:** `TicketChat` reopen button, shown only if `status=='closed'` and `daysSinceClosed <= 7` — `ticketChat.dart:930-958`.
- **Reads:** `_issueData['status']['date']` (from the issue snapshot).
- **Writes:** `clientissue/{issueid}` update `{status:{status:'Open', date:serverTimestamp, editedBy:profileid}, chatstatus:'Pending', last_modification:serverTimestamp}` — `ticketChat.dart:437-445`.
- **Config flags:** 7-day window hard-coded (`ticketChat.dart:939`).
- **Journey stage:** support.
- **e2e-testability:** Yes — seed a closed ticket with `status.date` within 7 days.

### F5 — Ticket chat: attach & send media (image/video/audio/document/voice)
- **What the user does:** Taps "+", picks Document/Audio/Media, or records voice; previews then sends.
- **Nav/entry:** `TicketChat` input "+" → `ImportMediaDialog` (`ticketChat.dart:889`, `chatWidget.dart:181`); voice via record (engine present).
- **Reads:** none directly.
- **Writes:** local SQLite `chatmedia` (filename, ext, path, messagepath, senderprofileid, uploaded:0) — `chatWidget.dart:89-95`; then Storage upload + Firestore message `files[]` patched by `AppService.uploadMedia` (`AppServices.dart:~1610-1810`, `uploadProcessing` map). Message doc as in F3.
- **Endpoints:** Firebase Storage (download URLs written back into the message `files`).
- **Config flags:** Supported formats hard-coded in `SupportedFormats` (`chatWidget.dart:20-32`).
- **Journey stage:** support.
- **e2e-testability:** Partial — text path easy; media upload needs Storage + file fixtures and local SQLite; flaky in headless e2e. Recommend assert message doc/`files` rather than driving the native picker.

### F6 — Ticket chat: reply / copy / delete own message
- **What the user does:** Long-press a message to multi-select; copy, or delete (only if all selected are own). Reply via the per-message UI.
- **Nav/entry:** `TicketChat` select-mode app bar (`ticketChat.dart:_selectMode`, copy `:410`, delete `:370,381`, canDelete check `:488`).
- **Reads:** none.
- **Writes:** delete → `firestore.doc(messagepath).delete()` for each selected — `ticketChat.dart:372`.
- **Config flags:** none.
- **Journey stage:** support.
- **e2e-testability:** Yes (delete/copy are deterministic Firestore ops).

### F7 — Group chat: list & open group conversations
- **What the user does:** In the "Chat" hub sees their group chats with last message, unread count, timestamp; taps to open.
- **Nav/entry:** `ChatHome` embeds `ChatList` (`chathome.dart:255`); `ChatList` row → `ChatScreen(chatType:"group")` (`chatlist.dart:200-215`).
- **Reads:** `profile_data` where `user_ref != null` (name/profile map) — `chatlist.dart:41`; `supportchat` where `members arrayContains uid` and `isdelete == false` orderBy `last_modification desc` (snapshots) — `chatlist.dart:51`.
- **Writes:** none in the list (reads `pendingcount[uid]`, `last_message`, `group_name`, `group_profile`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes — seed `supportchat` group docs with the test user in `members`.

### F8 — Group chat: send message (text/media/voice/links/mentions/reply)
- **What the user does:** In a group `ChatScreen`, types (with `@name` mentions), attaches media, records voice, replies, sends.
- **Nav/entry:** Group `ChatScreen` send button → `messageGroup()` (`chatscreen.dart:923,3343`); mention dropdown (`chatscreen.dart:3241-3284`, `tag()/insertMention()` `:404,439`).
- **Reads:** `profile_data` where `user_ref != null` and `new_user_data` (name/profile maps) — `chatscreen.dart:213,226`; group messages orderBy `time desc` (snapshots) — `chatscreen.dart:300`.
- **Writes:** `supportchat/{group}/messages/{auto}` set `{time, sender_uid, sender_email, message(mentions→@profileid), messageid, read_by:[uid], pending:[otherMembers], links, files:[], mentions, reply_to?}` — `chatscreen.dart:952-974`; group doc update `{last_modification, last_message, pendingcount.{uid}+=1 per other member}` — `chatscreen.dart:977-985`; incoming-read updates `read_by/pending`, `pendingcount.{uid}` deleted — `chatscreen.dart:292-298,737-748`.
- **Endpoints:** Storage for media.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes (group seeded). Media as in F5.

### F9 — Group chat: pin / unpin messages & pinned drawer
- **What the user does:** Admin selects messages → pin toggle; opens pinned drawer; unpin one or all.
- **Nav/entry:** select-mode pin icon, admin+group only (`chatscreen.dart:1754-1771`); `Pinnedinfo` drawer (`chatscreen.dart:3560`); unpin one (`:3659`), unpin all (`:3803-3811`).
- **Reads:** group messages stream (pinned filtered client-side, `pinned[]`) — `chatscreen.dart:305`.
- **Writes:** batch update `messages/{id}.pinned = true/false` — `chatscreen.dart:1760-1764`; single set `pinned:false` — `chatscreen.dart:3659`; batch unpin-all — `chatscreen.dart:3806-3811`.
- **Config flags:** Admin-gated (`widget.admin && chatType=='group'`).
- **Journey stage:** social.
- **e2e-testability:** Yes (needs a `chatxadmin` test user).

### F10 — Group chat: message info (read receipts) & delete
- **What the user does:** Admin/sender opens "Message info" for read-by/delivered-to; deletes own messages (group).
- **Nav/entry:** info icon, group + single own message (`chatscreen.dart:1774-1793`) → `Messageinfo` (`:3862`); delete (`deleteMessages()` `:1096`) decrements `pendingcount` and fixes `last_message`.
- **Reads:** message `read_by` / `pending` arrays (in-memory).
- **Writes:** delete → `firestore.doc(messagepath).delete()` + group `pendingcount.{uid}-=n`, `last_message`, `last_modification` — `chatscreen.dart:1100-1112`.
- **Config flags:** none.
- **Journey stage:** social.
- **e2e-testability:** Yes.

### F11 — Group management: create group / add-remove members / description / leave
- **What the user does:** Admin creates a group (name validated, ≥2 members), adds/removes members, edits description, or any member leaves.
- **Nav/entry:** create-group sheet in `ChatxAdmin` (`chatxadmin.dart:84`) and duplicated in `ChatHome` (`chathome.dart:72,241`); member picker `AddNewPeople` (`addnewpeople.dart:9`); `AboutGroup` (`aboutgroup.dart:12`) → add (`:515`), remove/leave (`:213,229-245`).
- **Reads:** `supportchat` where `group_name == name` (uniqueness) — `chatxadmin.dart:153-159`; `profile_data` orderBy `name` (member picker) — `addnewpeople.dart:48`; group doc + `profile_data` orderBy `user_ref` (AboutGroup) — `aboutgroup.dart:42,56`.
- **Writes:** create → `supportchat/{auto}` set `{isdelete:false, type:'group', members:[...]+creator, last_modification, group_name, group_profile, created_on, creator_uid, id}` — `addnewpeople.dart:134-145`; add → group `members arrayUnion(new)` — `addnewpeople.dart:117`; remove/leave → group `members arrayRemove([uid])` — `aboutgroup.dart:231,266`; description → group `{description}` — `aboutgroup.dart:347-349`.
- **Endpoints:** default `group_profile` is a hard-coded Storage URL on **prod** project `fir-sample-aae4a` (`addnewpeople.dart:32`).
- **Config flags:** none.
- **Journey stage:** social (admin/staff).
- **e2e-testability:** Yes for a `chatxadmin` test user; note the hard-coded prod Storage URL is display-only.

### F12 — Open ticket via notification deep link
- **What the user does:** Taps a "supportticket" push or in-app/notification-log entry → lands directly in the ticket thread.
- **Nav/entry:** FCM `onMessageOpenedApp` / local-notification tap → `onOpenAppByNotification` routes `type=='supportticket'` → `TicketChat` (`home.dart:1635-1648`); notification log entry (`notificationlog.dart:430-438`).
- **Reads:** ticket id from `payload['issueid']` / `metadata.ticketid`; then F3 reads.
- **Writes:** `updateClicked(...)` marks the notification (outside this cluster); ticket mark-read writes as F3.
- **Endpoints:** FCM (`FirebaseMessaging`) handled in `home.dart`, not in cluster files.
- **Config flags:** none.
- **Journey stage:** support.
- **e2e-testability:** Partial — push delivery is out of scope for static e2e; the in-app `TicketChat(issueid:…)` navigation can be exercised directly.

### F13 — Admin: raise a structured customer-support ticket from a chat
- **What the user (admin) does:** In a support-admin chat, selects messages → "issue opened" → opens `RaiseCustomerSupport`, fills journey/product/assignees/status/notes, submits.
- **Nav/entry:** support-admin chat select-mode "issue opened" icon (`chatscreen.dart:1795-1822`) → `RaiseCustomerSupport`.
- **Reads:** `journey` orderBy `journey` — `raiseCustomerSupport.dart:61`; `products` orderBy `product` — `:70`; `users_roles` where `ahmember==true` orderBy `name` — `:82`; `issue status/dropdownoption` — `:98`; `clientissue` orderBy `issueno desc` (next no.) — `:113`; `participantJourneySequence` where `profileid==clientid` and `journeystatus in [ongoing,initiated]` limit 1 — `:118`.
- **Writes:** `clientissue/{auto}` set full record `{id, issueno, clientid, reporteddate, journey(ref), product(ref), reportedBy, assign[], status, issue, notes[]}` — `raiseCustomerSupport.dart:107,428`.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** support (staff).
- **e2e-testability:** No for the participant suite — admin/staff-only screen reached only from the (orphaned) support-admin chat; requires seeded `journey/products/users_roles/issue status` reference data and the `chatxadmin` escalation path. Map that it EXISTS; not a participant e2e target. (No ATC.)

### F14 — Support desk (participant "Chat with us") — present but DEAD entry
- **What the user would do:** Open a 1:1 thread with the A&H team (`ChatScreen(chatType:"supportdesk")`), send queries/media; admin answers from `SupportList`.
- **Nav/entry:** Intended entry in `ChatHome` "Chat with us" button is **inside a commented-out block** (`chathome.dart:380-468`); `ChatxMain`/`GeneralUser` are **never instantiated outside their own files** (verified). So no live participant entry.
- **Reads/Writes (if it were live):** `supportdesk/{uid}` doc + `supportdesk/{uid}/messages` (existence check `checkexistence` `chatscreen.dart:768-777`; send `submitToSupportDesk` `:780`; admin answer `answerUserQuery` `:850`; admin inbox `SupportList` reads `supportdesk` orderBy `last_modification` `supportlist.dart:81`).
- **Journey stage:** support.
- **e2e-testability:** No — engine exists but **no live entry point** in the current build; do not seed/test as a participant feature. Re-evaluate if a live entry is re-enabled. (No ATC.)

### F15 — Personal (1:1) Chatx chat — DEAD
- **What it would do:** 1:1 personal chat (`ChatScreen(chatType:"personal")`, `messagePersonal` `chatscreen.dart:1001`).
- **Nav/entry:** The only producer of `chatType:"personal"` is a fully **commented-out** block in `chatlist.dart:223-517`; no live caller (verified — zero non-comment `chatType:"personal"`).
- **e2e-testability:** No — dead code path.

## Firestore collections

### Read
- `chat config` — support categories (`categories[].{category,subcategory,show,assignto}`) and seed `messages`; via doc snapshot — `ticketCategories.dart:37`, `AppServices.dart:3653`.
- `clientissue` — own tickets `where clientid == profileid` orderBy `last_modification desc` — `clientTickets.dart:42`; unread count `where clientid==profileid` then per-doc `messages where pending arrayContains 'user'` — `chathome.dart:46-59`; next `issueno` `orderBy issueno desc` — `raiseCustomerSupport.dart:113`.
- `clientissue/{id}/messages` — thread `orderBy time desc`; pending `where pending arrayContains 'user'` — `ticketChat.dart:186,213`; per-card unread — `clientTickets.dart:354`.
- `counters/ticketCounter` — transactional ticket-number source — `AppServices.dart:3732-3744`.
- `profile_data` — name/profile maps `where user_ref != null` — `chatlist.dart:41`, `supportlist.dart:33`, `chatscreen.dart:213`; `orderBy name` (member picker) — `addnewpeople.dart:48`; `orderBy user_ref` (AboutGroup) — `aboutgroup.dart:42`; `doc(receiverId)` (notification fan-out) — `raiseTicket.dart:213`; role lookup `doc(profileid).role_ref` — `chatxMain.dart:26-29`.
- `new_user_data` — supplemental name/profile map (`get()`) — `chatscreen.dart:226`.
- `supportchat` — group list `where members arrayContains uid and isdelete==false orderBy last_modification desc` — `chatlist.dart:51`; name-uniqueness `where group_name == name` — `chatxadmin.dart:153`/`chathome.dart`; group doc by path — `aboutgroup.dart:56`.
- `supportchat/{group}/messages` — group thread `orderBy time desc`; `where pending arrayContains uid` — `chatscreen.dart:292,300`.
- `supportdesk` — admin inbox `orderBy last_modification desc` — `supportlist.dart:81` (admin); existence `doc(uid)` — `chatscreen.dart:769`. (Live entry commented — F14.)
- `supportdesk/{uid}/messages` — `where pending arrayContains 'user'`/`'admin'` — `generaluser.dart:30`, `supportlist.dart:183`, `chatscreen.dart:346,365`; participant unread badge — `chathome.dart:449` (in commented block).
- `participant metadata` — `where firebaseuserref != null` (profile map; method `_loadProfileData` defined but **not called** in `RaiseTicket`) — `raiseTicket.dart:104`.
- `journey` — `orderBy journey` (admin form dropdown) — `raiseCustomerSupport.dart:61`.
- `products` — `orderBy product` (admin form dropdown) — `raiseCustomerSupport.dart:70`.
- `users_roles` — `where ahmember == true orderBy name` (assignee dropdown) — `raiseCustomerSupport.dart:82`.
- `issue status/dropdownoption` — status options — `raiseCustomerSupport.dart:98`.
- `participantJourneySequence` — `where profileid==clientid and journeystatus in [ongoing,initiated] limit 1` (prefill journey/product) — `raiseCustomerSupport.dart:118`.

### Written
- `clientissue/{auto}` — created by participant (`AppServices.raiseTickets` batch, `:3707`) and by admin form (`raiseCustomerSupport.dart:428`). Updated: `last_modification/chatstatus/review/mandatereview` on send (`ticketChat.dart:285`), re-open `status/chatstatus` (`ticketChat.dart:437`), `last_read_by/last_pending` on open (`ticketChat.dart:159`).
- `clientissue/{id}/messages/{auto}` — first message (raiseTickets, `:3708`) and each chat message (`ticketChat.dart:269`); read-state updates (`ticketChat.dart:236`); deletes (`ticketChat.dart:372`).
- `counters/ticketCounter` — `currentNumber` set/incremented in transaction — `AppServices.dart:3740,3744`.
- `supportchat/{auto}` — group create (`addnewpeople.dart:134`); updates: `members` add/remove (`addnewpeople.dart:117`, `aboutgroup.dart:231,266`), `description` (`aboutgroup.dart:347`), `last_modification/last_message/pendingcount.*` on send (`chatscreen.dart:977`).
- `supportchat/{group}/messages/{auto}` — group message set (`chatscreen.dart:974`); `read_by/pending`, `pinned` toggles, deletes (`chatscreen.dart:294,1760,3659,3806,1100`).
- `supportdesk/{uid}` — existence set `{uid,email,last_modification}` (`chatscreen.dart:771`); `last_modification`, `last_read_by/last_pending` updates (`chatscreen.dart:837,356`). (Behind commented entry — F14.)
- `supportdesk/{uid}/messages/{auto}` — participant query (`submitToSupportDesk`, `chatscreen.dart:835`); admin reply (`answerUserQuery`, `:897`); read-state (`:755,762`).
- `notifications/{userRefId}/logs/{auto}` — "New Ticket is Generated" inapp notification (method `_createNotification` defined in `raiseTicket.dart:230-235` but **not called** from the live submit path → effectively dead unless invoked elsewhere).
- Local SQLite `chatmedia` (NOT Firestore) — staged media rows before Storage upload — `chatWidget.dart:89`, `chatscreen.dart:1059`.

## Endpoints & external services
- **Firebase Firestore** — all data ops above.
- **Firebase Storage** — chat/ticket media upload & download URLs via `AppService.uploadMedia` (`AppServices.dart:~1610-1810`); ad-hoc `uploads/{filename}` upload + `refFromURL().delete()` in the legacy `_uploadFiles/removeFile` path (`chatscreen.dart:1488,1516`); default group avatar is a hard-coded URL on prod bucket `fir-sample-aae4a` (`addnewpeople.dart:32`); legacy `databasehelper.dart` uploads to `Nandakumar M/media/...` (dead helper).
- **FirebaseMessaging (FCM)** — only the *consumer* of `type=='supportticket'` notifications lives in `home.dart` (outside cluster); no FCM send here.
- **flutter_local_notifications** — local download/progress + "new message" notifications inside both chat screens (`chatscreen.dart:489`, `ticketChat.dart:166`).
- **flutter_downloader** — file downloads from chat (`chatscreen.dart:640`, `ticketChat.dart:347`).
- **internet_connection_checker** — offline banner in `TicketChat` (`ticketChat.dart:106`).
- **just_audio / better_player_plus / record / image_picker / file_picker** — voice record, audio/video playback, media capture/pick.
- **any_link_preview, url_launcher, flutter_linkify** — link previews and opening URLs.
- **No HTTP/Dio/cloudfunctions/httpsCallable calls** found in any cluster file (grep-confirmed). No `RemoteConfig`/PostHog/`SharedPreferences` references in cluster files.

## Config & feature flags
- **No Firebase RemoteConfig** and **no PostHog** in this cluster (grep-confirmed in `Chatx/`, `ChatTicketSystem/`, `raiseCustomerSupport.dart`).
- **Data-driven config:** ticket categories/visibility (`show`), seed messages, and per-category `assignto` come from the Firestore doc **`chat config`** — `ticketCategories.dart:37`, `AppServices.dart:3653`. This is the closest thing to a feature flag (toggling `show` hides a category).
- **Role gate:** `chatxadmin` boolean on the user role doc (`profile_data.role_ref` → `chatxadmin`) controls admin powers — group create, member admin, pin, support-admin inbox (`chatxMain.dart:32`, `chathome.dart:44`, `chatscreen.dart:1754`). `ahmember` flags eligible assignees (`raiseCustomerSupport.dart:82`).
- **Hard-coded constants:** re-open window = 7 days (`ticketChat.dart:939`); supported media formats (`chatWidget.dart:20`, `chatscreen.dart:125-163`); ticket-number seed = 1001 (`AppServices.dart:3739`); default group avatar URL on **prod** bucket (`addnewpeople.dart:32`).
- **Firebase projects referenced in code:** only **`fir-sample-aae4a`** (production) appears — hard-coded in the default group-avatar Storage URL (`addnewpeople.dart:32`). No test/staging project ids in cluster files.

## Dead / clone / Old code
- **`lib/Chatx/chatxMain.dart` / `generaluser.dart` / `chatxadmin.dart`** — role-router + supportdesk shells. **Orphaned:** `ChatxMain` is never instantiated outside its own file (verified). The whole supportdesk participant flow is unreachable in the current build.
- **`ChatScreen(chatType:"supportdesk")` participant entry** — commented out in `ChatHome` ("Chat with us" block, `chathome.dart:380-468`); also commented in `profile.dart:784` and `ActionsToTake.dart:726`. Engine present, entry dead (F14).
- **`ChatScreen(chatType:"personal")` + `messagePersonal()`** — the entire personal-chat producer block in `chatlist.dart:223-517` is commented; no live caller (F15).
- **`lib/Chatx/databasehelper.dart`** — `DatabaseHelper` (sqflite `media` table + Storage upload to hard-coded `Nandakumar M/media/...`). Not referenced by any live cluster code; replaced by `chatmedia` table + `AppService.uploadMedia`. Dead (also has a duplicate `case 'mp4'` bug, `databasehelper.dart:104-107`).
- **`RaiseTicket._submitTicket` (old)** + **`_loadCurrentJourney` / `_loadProfileData` / `_createNotificationsBatch`** — large commented-out original implementations in `raiseTicket.dart:75-172`; live submit delegates to `AppService.raiseTickets`. `_loadProfileData` (`participant metadata`) and `_createNotification`/`_createNotificationsBatch` (`notifications/.../logs`) are **defined but never called** from the live path → effectively dead (notification fan-out for new tickets does not fire here).
- **`createNewGroup` duplicated** — same group-create sheet exists in both `chatxadmin.dart:84` and `chathome.dart:72` (clone).
- **`filebuttoncreater` / `_pickFile` / `_uploadFiles` / `removeFile` / commented `_showFileDetailsBottomSheet` / `_storeFileInDatabase`** in `chatscreen.dart` — legacy direct-Storage `uploads/` media path, largely superseded by the SQLite-staged `storeChatMedia`→`uploadMedia` flow; `_pickFile`/`_uploadFiles` retained but not on the main send path. Treat as legacy.
- Commented `User(...)` profile navigation in `aboutgroup.dart:104-185` (member "View" action disabled).
- Commented FCM `supportticket` block in `home.dart:1442-1456` is superseded by the live `onOpenAppByNotification` (`home.dart:1635`) — the live one is authoritative.

## Notes & open questions
- **ATC:** none of these files touch ATC collections or `*atc*` symbols (grep-confirmed). No `atcTouch` features in this cluster.
- **Live vs present:** the *participant* support experience today = **Chat Ticket System** (F1–F6, F12) + **group chat** (F7–F11). The **Chatx supportdesk/personal** surfaces are coded but entry-dead — important so the e2e suite does not waste effort seeding `supportdesk`/personal `supportchat` for participants.
- **New-ticket notification fan-out:** `raiseTickets` (live) does **not** call any `notifications/.../logs` writer (the `_createNotification*` methods are uncalled). Admin notification on a new participant ticket may be handled server-side (Cloud Function on `clientissue` create) — **out of cluster, unverified.** Open question for the data/backend pass.
- **`chatstatus` state machine:** values seen — `New` (create), `Responded`→`Decision Making` (on user reply), `Pending` (on re-open). Full set/owner (admin side) not visible in participant code; admin transitions likely live in the Angular admin app — unverified here.
- **`counters/ticketCounter`** must be seeded (>= some int) for `getNextTicketNumber` to produce sane `issueno`; first run seeds 1001. e2e seed should set this.
- **Prod Storage URL** hard-coded in `addnewpeople.dart:32` is display-only (default group avatar) but is a cross-project reference worth flagging for the e2e firewall (it points at `fir-sample-aae4a`).
- `ClientTicket` sorts by `status['status']` string compare (`clientTickets.dart:54`) before splitting open/closed — purely cosmetic ordering.
