# 2026-08-24 — Group Chat screen (Events/Chat) ported from the web-chat reference design

## What was asked
Operator: create a new component under the Events chat folder as a "group chat screen", route `grup-chat-screen`,
then supplied `~/Downloads/web-chat (1).html` as **the design** — a 2,577-line standalone React reference build
("STARLABS — Web Chat") that runs against a *different* Firebase project (`prakash-starlabs`).
Follow-up mid-session: *"remove the outer thing, just take the card inside it for the overall design"*.

## What landed
New standalone component `src/app/Events/Chat/group-chat-screen/` (ts 1378 / html 1053 / css 592 lines)
+ one route line in `app.routes.ts`.

The React screen was ported to Angular structurally, not screenshot-copied:
- **Icons:** lucide-react → `mat-icon` (Material Icons font, already loaded in `index.html`).
- **Inline styles → CSS classes** in the component stylesheet; the reference `:root` palette is reproduced
  on `:host` as CSS custom properties so colour values stay 1:1 with the design.
- **Rich text** (`**bold**`, `- ` bullets, `1. ` numbers, `@mentions`, bare URLs, `[Label](url)` → CTA button
  at the foot of the bubble) is parsed into a `Seg[]`/`Block[]` token tree and rendered with `ng-template`
  recursion — deliberately **not** `innerHTML`, so no sanitiser bypass and no XSS surface on message text.
- **Parse cache:** `parsedOf(m)` memoises on the message keyed by `text + mention names`, because a template
  method returning a fresh array every CD cycle would thrash `*ngFor`.

Feature parity with the reference: Groups / Channels / Archived tabs, category filter, thread search by text
and sender, pinned strip, announcements, reply, reactions + quick picker, hover actions, 3-dot menu,
double-tap multi-select + bulk delete with audit log, edit, pin, attachments (image/video/audio/doc),
voice notes via MediaRecorder, formatting toolbar, @mention autocomplete, link-button composer,
group/channel info slide-over (category, provenance, team vs participants, media & docs, deleted log,
archive/delete), participant profile slide-over (journey rows, event attendance, tickets),
message info slide-over (Seen / Received / Sent), lightbox, create group/channel, add members,
raise-ticket modal, toasts.

## Why the deliberate departures
- **No Firestore wiring.** The reference talks to `prakash-starlabs` with hardcoded credentials and open
  dev rules. Wiring this screen to that project from inside StarLabs would cross projects and put chat
  writes on a foreign database; wiring it to *our* Firestore is a data-model decision the operator has not
  made yet (collections `webchatGroups` / `webchatChannels` / `tickets` do not exist here). The component
  therefore holds **in-memory demo data** seeded in `seedDemoData()` and every action (send, edit, delete,
  pin, react, archive, create, add members, raise ticket) mutates local state. The screen is fully
  interactive for design review and the mutation methods are shaped like the Firestore calls they replace,
  so swapping in `updateDoc`/`setDoc` later is a per-method substitution.
- **Route spelling `grup-chat-screen`** is verbatim as asked. It reads as a typo for `group-chat-screen`;
  flagged to the operator, not silently "fixed". Note `group-chat` is already taken by the older
  `chat-screen` component.
- **`window.innerWidth` breakpoint hook** from the reference (`useBreakpoint`) became plain CSS media
  queries — no resize listener needed for what it was used for (left-pane width, page padding).

## Surprises / gotchas
- **The app shell, not the viewport, bounds this screen.** The reference is a whole page at `height:100vh`.
  Dropped into StarLabs the component sits inside `.content-wrapper`, which starts below the app header
  and is *auto-height* — so `height:100%` collapses to content height (composer fell ~270px below the
  fold) while `100vh` overflows by exactly the header height. A `calc(100vh - 53px)` constant looked
  right at 1280px wide **and was wrong at 1280×600, where the same header measures 44px** — the header
  is not a fixed height. Final answer: the component **measures** its own top offset
  (`fitToViewport()`, re-run on window resize and via a `ResizeObserver` on the parent) and sets
  `[style.height.px]`; the CSS `calc(100vh - 53px)` survives only as the pre-measure fallback.
  Guard included: a backgrounded tab reports `innerHeight === 0`, which would otherwise collapse the
  screen to the 320px floor and never recover.
- **Two panes do not fit a phone.** The reference keeps the 230px list beside the thread at ≤640px, which
  on a 375px viewport means horizontal scroll and an unusable thread. Departed from the design here:
  below 760px the shell shows **one pane at a time** (list, or the open thread with a new back arrow in
  the thread header — `closeThread()`), the composer toolbar wraps, and the bubble max-width opens to 86%.
- Verifying this screen needs no login even though the route is guarded — see revert guide, step 2.

## Follow-up in the same session — "no scroll, full UI visible"
Operator reported the screen scrolling. Root cause was the hardcoded header offset above, not page
overflow at my test viewport; fixed by runtime measurement + the narrow single-pane layout.
Verified with zero page overflow (`scrollHeight - clientHeight === 0`, both axes) at 1280×720,
1280×600, 1100×420 (composer bottom lands exactly on the viewport bottom) and 375×812 mobile.
Only the message list scrolls internally, which is inherent to a thread.

## Per-screen revert guide
### Screen — Events/Chat · Group Chat screen · NEW 2026-08-24
1. `src/app/app.routes.ts:265`: added
   `{path: 'grup-chat-screen', loadComponent: () => import('./Events/Chat/group-chat-screen/group-chat-screen.component').then(m => m.GroupChatScreenComponent), canActivate:[authGuard]},`
   directly under the existing `group-chat` route. **Revert:** delete that one line.
2. `src/app/Events/Chat/group-chat-screen/` (4 new files, nothing else references them).
   **Revert:** delete the directory. No existing file was modified, so removing the route line + the
   directory restores the tree exactly.

### Verifying it without credentials (repeatable)
The route is behind `authGuard` and the in-app browser has no Firebase session, so `/grup-chat-screen`
bounces to `/login`. Because the component has **zero external data dependencies**, a temporary unguarded
twin route is enough to see it:
add `{path: 'tmp-preview-grup-chat', loadComponent: () => import('./Events/Chat/group-chat-screen/group-chat-screen.component').then(m => m.GroupChatScreenComponent)},`
next to the real route, hit it on the running `ng serve` (port 4200), screenshot, then **delete the temp
line** (it was deleted at the end of this session — confirm with `grep tmp-preview src/app/app.routes.ts`).

## Pending / follow-ups
- **Data layer is not wired** — decide the collections and whether groups/channels live in Firestore
  arrays (as the reference does, messages inside the parent doc) or a subcollection. The reference's
  array-of-messages model caps a thread at the 1 MB doc limit and re-writes the whole array per send;
  a subcollection is the better shape here but changes the read/pagination code.
- **Attachments are data URLs** in the reference (700 KB caps, Firestore-doc-bound). StarLabs already has
  Firebase Storage in use; if this ships, attachments should upload to Storage and store a URL. The size
  guards from the reference were intentionally *not* ported since nothing persists yet.
- **Identity is hardcoded** to `TEAM_NAME = 'A&H Team'` (as in the reference). Real usage needs the signed-in
  user from `AuthguardService`.
- **Read receipts / delivery are demo values.** The message-info panel renders whatever `readBy` /
  `deliveredTo` hold; nothing populates them.
- No unit tests beyond the CLI-stub spec.

---

# Part 2 — Groups wired to the chat-screen backend (same session, 2026-08-24)

## What was asked
*"in backend implementation, get the backend code from chat screen component for groups, integrate the ui
with backend code for whatever features were there already and remaining leave it static only"* — explicitly
part-by-part, so this pass covers **Groups only**.

## The backend that already exists (read out of `chat-screen.component.ts`)
```
supportchat                       type='group' · isdelete · members[uid] · group_name · group_profile
                                  last_message · last_sender_uid · last_modification · last_pending[uid]
                                  created_on · creator_uid · pinned · id
supportchat/{id}/messages         messageid · message · sender_uid · time · type('text'|'media')
                                  files[{filename,filetype,fileurl,mediatype}] · links · read_by[] ·
                                  pending[] · mentions[profileid] · pinned
profile_data                      name · profile (picture URL) · profileid · user_ref → uid
users_roles                       admin / chatxadmin, keyed by profile_ref
Storage                           chat-files/{chatId}/{ts}_{filename}
```
`members` holds **uids** (`user_ref.id`), and mentions are stored as `@{profileid}` — chat-screen's
`EnhancedMessagePipe` expands them back to `@Name` at render time.

## Wired (writes the same docs chat-screen does)
list groups (active + archived, `array-contains` members for non-admins, admins see all) · open thread with
a real-time `messages` subscription · mark read (`last_pending` arrayRemove) · unread flag · send text ·
send attachment (Storage upload → `files[]`) · voice note (MediaRecorder blob → same path) · delete message
(single + multi-select, `writeBatch`) · pin/unpin message · add members (arrayUnion) · remove member
(arrayRemove) · create group (`buildGroup`'s doc shape) · archive / restore / delete (all `isdelete`) ·
member names + avatars + the mention list from `profile_data` · Team vs Participants split from `users_roles`
· message-info Seen list from `read_by`.

## Left static, deliberately — no field exists behind them
Channels (the whole tab, including its demo rows) · reactions · replies · announcements · categories ·
followers · tickets and the journey/event profile panel · the deleted-content audit log · per-message
"Received" tier · read timestamps. These still work in the UI; on a live group they simply do not persist.
The delete-confirm copy switches for live groups, since chat-screen's delete is a **soft** delete.

## Decisions worth re-reading before changing
- **`group_emoji` is a new, additive field.** This UI picks an emoji; chat-screen renders `group_profile`
  as an `<img src>`, so writing an emoji there would show a broken image on the old screen. The emoji goes
  in `group_emoji`, which the old screen ignores. `group_description` is additive for the same reason.
- **Message edit writes only `message` + `mentions`.** chat-screen has no edit feature; rather than invent
  an `edited` flag, the existing field is updated. Consequence: the "(edited)" marker does not survive a
  reload on live groups.
- **Unread is a flag, not a count.** The backend only knows `last_pending` (who has unread), so the badge
  shows `1` on a live group with anything unread. A true count needs a per-message scan.
- **Archived live groups are not copied** in the `lists` getter (demo rows still are). The copy would break
  the open thread — the message subscription writes into the source object, and a spread copy never sees it.
- **Graceful degradation:** if `guard.getRoles()` / `profile_data` fails (e.g. signed out), the bootstrap
  catches, logs, and the screen stays on the static demo rows rather than rendering empty. Verified.

## ⚠️ Not verified against live data — and why
`src/environments/environment.ts` points `ng serve` at **`fir-sample-aae4a`, which is production**. Every
write above (send, delete, create group, archive) would land on the real `supportchat` collection, and the
in-app preview browser has no session anyway. What *was* verified: the app compiles, the screen renders, and
the unauthenticated path degrades to demo data with a single caught `FirebaseError` and no blank screen.
**To verify the live path safely:** point `environment.ts` at the commented-out `starlabs-test` config (or
sign in and use a throwaway group), then check send → the message appears in the old `group-chat` screen too,
since both read the same docs.

## Per-screen revert guide — Part 2
### Screen — Events/Chat · Group Chat screen · backend wiring · 2026-08-24
All of it is inside `group-chat-screen.component.ts` under the banner comment
`Firestore backend — GROUPS ONLY`, plus `isLive(...)` branches at the top of: `openItem`, `send`, `saveEdit`,
`handleFilePicked`, `finishRecording`, `deleteMessages`, `togglePin`, `removeMember`, `saveAddMembers`,
`saveCreate`, `setArchived`, `deleteGroup`.
**Revert to static:** delete the backend section and every `if (this.isLive(...)) { … return; }` block — the
demo-data path underneath each one is untouched and still complete. The template change (attachments loop,
delete-copy) is safe to keep either way. `app.routes.ts` is unchanged by Part 2.

---

# Part 3 — "messages are not loading" + group profile image (2026-08-24)

## The bug in Part 2's mention handling
`expandMentions()` built **one RegExp per profile in the entire `profile_data` directory, for every message,
on every snapshot**. On a real directory (thousands of profiles) opening a thread of a few hundred messages
meant hundreds of thousands of regex passes inside the Firestore callback — the thread renders late or
appears never to load, with nothing in the console to explain it.

The fix uses what the backend already stores: each message carries `mentions[]` (the profileids it mentions),
so expansion only touches those ids — O(mentions) instead of O(directory). `collapseMentions()` got the same
treatment on the way in, restricted to the members of the group being posted to. `.split().join()` replaces
the constructed RegExp entirely, so no escaping is involved either.

Not yet confirmed as *the* cause the operator hit — see below.

## Also landed
- **Per-message try/catch** in the messages subscription: one malformed doc used to take the whole thread
  down (the `next` handler threw, `messages` stayed empty, nothing rendered). Bad docs are now skipped and
  logged individually.
- **The thread says what is happening.** Three new states inside the message pane: a spinner while the
  subscription is warming up, an error line (with the Firestore code, and a plain-English line for
  `permission-denied`), and "No messages yet". An empty pane is no longer ambiguous — the next report of
  "not loading" will say which of the three it is.
- **Group picture instead of the emoji** (operator request). `group_profile` from the `supportchat` doc is
  mapped to `ChatItem.photoUrl` and rendered in the list row, thread header and info panel; the emoji stays
  as the fallback when a group has no picture. `imageUrl()` guards the field — older rows can hold junk, and
  only an `http(s):`/`data:` value is treated as an image.

## Still open
- **Root cause unconfirmed.** No Chrome is connected to the browser MCP, and the preview browser has no
  Firebase session, so the live path remains unverified (production project — see Part 2's warning).
  If the thread still does not load, the new state text plus the console line
  (`group messages …` / `group-chat: skipped a message …`) identifies it immediately.
- **No group-picture upload in this screen.** chat-screen sets `group_profile` through its create/edit
  dialog; this screen only reads it, and its create modal still writes `group_emoji`.

---

# Part 4 — archive removed · avatars everywhere · members under Participants · date+time (2026-08-24)

Operator asked for four changes and one question.

1. **Archive dropped — delete IS the archive.** There is only one flag (`isdelete`); chat-screen's delete
   sets it and its Inactive tab is where those groups live. Having both an "Archive" and a "Delete" button
   writing the same field was a fiction. The info panel now shows **Delete** on an active group and
   **Restore** on one already in Archived (chat-screen's `restoreGroup`). `setArchived()` is gone,
   replaced by `restoreGroup()`.
2. **Profile pictures wherever a name appears**: pinned-strip rows, the quoted message inside a reply
   bubble, the reply preview above the composer, the announcement sender line, and my own outgoing bubbles
   (previously only *other* people had an avatar). `.wc-msg.right` becomes `row-reverse` so my avatar sits
   on the right of my own bubble instead of stranded on the far left.
3. **Members list under Participants.** `supportchat` has no team/participant distinction — the earlier
   split was inferred from `users_roles`, which is not what the operator wants shown. On a **live** group
   the Team block is hidden and every member is listed under Participants; the demo rows keep the split.
4. **Message stamps carry the clock time.** New `msgTime()`: today → `13:27`, older → `23 Aug, 13:27`,
   another year → `23 Aug 2025, 13:27`. Applied to bubbles, announcements, pinned rows and message info.
   The chat *list* keeps the compact `timeLabel()`.

Fixed in passing: the info panel said "Channel info" for an archived **group** (title followed the tab, not
the item — now `isChannel(a)`), and "1 members".

## Answer to "any other new backend schema created?"
Four additive fields, nothing else — every other read and write uses chat-screen's existing shape:
| Field | Where | Why |
|---|---|---|
| `group_emoji` | `supportchat` doc, on create | this UI picks an emoji; `group_profile` is an image URL the old screen renders in an `<img>`, so an emoji there would break it |
| `group_description` | `supportchat` doc, on create | the create modal has a description field; no existing field held it |
| `filesize` | inside `files[]` entries | to show "412 KB" under an attachment |
| `duration` | inside `files[]` entries, voice notes only | to show the length in the voice player |
All four are ignored by chat-screen. No new collections, no new subcollections, no renamed fields; message
edit deliberately writes only the existing `message` + `mentions`. **Pending operator decision:** whether to
drop them and lose the emoji/description on new groups plus the size/duration labels.

---

# Part 5 — the four added fields removed (2026-08-24)

Operator: *"remove this four, until i approve the schema, ur keeping the design static for all which where
the data schema is not there"*.

`group_emoji`, `group_description`, `filesize` and `duration` are gone — **not written and not read**, so
the component now references nothing outside chat-screen's existing shape. `grep` for all four across
`group-chat-screen/` returns nothing.

Consequences, all intentional (design stays, persistence does not):
- The create modal keeps its emoji picker and description field; on a live group neither persists, and the
  group falls back to the default 💬 unless `group_profile` holds a picture.
- Attachment size labels no longer render on live messages (`*ngIf="att.size"` hides them).
- Voice-note length now comes from the `<audio>` element's own metadata — `voiceLabel()` already fell back
  to `audio.duration`, so the player still shows the real length once the file loads.
- `category`, `event name` and description on a live group are hard-coded empty in `mapGroupDoc` rather
  than read speculatively.

**Group creation now writes exactly:** `isdelete`, `type`, `members`, `group_name`, `last_message`,
`last_pending`, `last_modification`, `created_on`, `creator_uid`, `id` — every one of them a field
`buildGroup()` or `mapChatList()` in chat-screen already uses.

---

# Part 6 — message-list readability pass (2026-08-24)

Operator asked for five things across the thread view; all are presentation-only, no schema touched.

1. **Tap a profile picture to enlarge it.** `openAvatar()` puts the picture in the existing lightbox at
   portrait size (`min(70vw, 420px)`, capped so a small source image is not upscaled into mush);
   `openGroupPhoto()` does the same for the group picture in the thread header and the info panel, with
   `stopPropagation` so it does not also open group info. With **no** picture there is nothing to enlarge,
   so the click falls through to the person's profile panel — the previous behaviour. Attachment images
   keep the full-bleed lightbox: they now go through `openImage()`, which clears the portrait flag (without
   it, viewing a profile picture and then an attachment showed the attachment at portrait size).
2. **Sender shown once per run.** `_runStart` is computed in the `visibleMessages` pass: a run breaks on a
   new sender, a day boundary, or either side of an announcement. Only the first message of a run carries
   the avatar and the name; the rest get a 28px spacer so they stay aligned.
3. **Tighter runs.** Continuation messages get `margin-top: -10px`, collapsing the 12px thread gap to ~2px,
   and lose the pointed bubble corner so a run reads as one block.
4. **Timestamp inside the card, brighter.** Moved from a line under the bubble into a `.wc-bubble-foot`
   inside it, at `#6B7280` on white and `rgba(255,255,255,0.92)` on my own purple bubbles — up from the
   `--t3` grey it used to fade into. The read ticks moved in with it.
5. **Sticky day separators.** Each message carries `_dayLabel` on the first message of its date;
   the chip renders as a direct child of the scroll container with `position: sticky; top: 0`, so the
   current day stays pinned while scrolling. Labels are the full date — weekday, day, full month and
   year (`Monday, 24 August 2026`), per the operator. Note this **replaced** the relative
   Today / Yesterday labels rather than adding to them; a prefix can be restored if they are missed.
   Per-message stamps dropped back to clock-only (`clockTime()`), since the date is now carried by the
   separator. `msgTime()` (date + time) is still used where a message appears out of thread context —
   the pinned strip and the message-info panel.

**Perf note:** `visibleMessages` is now a cached getter keyed on the messages array reference plus the
search inputs. The template reads it per message for the run/day flags, so recomputing on every binding
would be O(n²) on a long thread. Every write path assigns a new array, so reference equality is a safe
cache key.

Demo data gained two extra consecutive messages from one sender (`m4b`, `m4c`) so the run behaviour is
visible in the static preview.

---

# Part 7 — hover strip right-aligned + Copy · chat pinning in the sidebar (2026-08-24)

1. **Hover action strip always hangs off the right edge** of the message — previously it flipped sides
   (left for incoming, right for my own). The 3-dot menu and the emoji picker follow it, so all three
   drop from the same corner.
2. **Copy** added, both as the first button in the hover strip and as an entry in the 3-dot menu. It copies
   `m.text` as typed, so links and `**bold**` markers survive.
   **Gotcha worth remembering:** `navigator.clipboard.writeText()` was *refused* in the embedded preview
   browser — the async Clipboard API needs document focus and permission, and some webview contexts deny it
   outright ("Could not copy message" on the first attempt). `copyMessage()` now falls back to a hidden
   textarea + `document.execCommand('copy')` before reporting failure, which succeeds where the modern API
   is blocked. Verified: the OS clipboard actually changed on the retry.
3. **Pin a chat from the list** — `togglePinChat()`, a straight port of chat-screen's method writing the
   **existing** `pinned` field on the `supportchat` doc (no new schema). `mapGroupDoc` reads it back, and
   `filtered` sorts pinned first then by recency, matching `mapChatList`'s ordering in the old screen.
   The pin button appears on row hover and stays visible once pinned; demo rows toggle locally.
   `canAct()` widened so the strip shows on any message with text, not only where react/reply exist.

Verified in the preview: strip right-aligned on both incoming and outgoing messages, copy succeeds via the
fallback, pinning re-sorts the list to the top with a persistent marker.

---

# Part 8 — search: normalised field, sidebar mode switch, jump-to-message (2026-08-24)

**Bug fixed first:** the sidebar showed **two** pin icons on a pinned row — Part 7 added both a static
`.wc-row-pinned` indicator *and* a `.wc-row-pin` button, and the button is `display:flex` whenever pinned,
so both rendered outside hover. The indicator is gone; the button alone carries the state (grey on hover,
purple and always visible once pinned).

## New field — `message_search` (operator-instructed)
*"store the message in the lowercase by trimming all the spaces"* → `normalizeForSearch()` =
`toLowerCase()` + every whitespace run removed. Written on **send** and on **edit**, beside `message`;
the same function normalises the query, so `"payment link"` matches `"Payment  Link"` and `"payment-link"`
does not have to match exactly. Additive — chat-screen ignores it. This is the **only** field added back
after Part 5 stripped the previous four, and it was explicitly asked for.

## Sidebar: what am I searching?
A two-button mode switch under the search box — **Group name** (previous behaviour, plus the category
chips) and **Messages** (searches every group's messages). Message hits render in place of the group list:
group name, sender avatar + name, snippet, date and time. Clicking one opens that group and jumps to the
exact message, reusing `scrollToMessage()`'s amber flash. Because a live thread streams in asynchronously,
`jumpToMessage()` retries for ~3s until the element exists rather than scrolling into nothing.

## ⚠️ The limitation to understand before trusting this
Firestore can only range over **one field**, so the server-side query is
`orderBy('message_search') + startAt(q) + endAt(q + '')` — it finds messages whose normalised text
**starts with** the query. Mid-message matches are found only for threads already streamed into the client
(that path runs too, and it does full substring matching). Practical effect:
- Open group, or short history → substring search works.
- Unopened group with long history → only prefix matches come back.

Fixing that properly needs one of: an n-gram/trigram array per message, a token array
(`array-contains`, whole words only), or an external engine (Typesense/Algolia). Not built — it is
new schema and needs approval.

**Also needs a backfill:** every message written before this change — including everything the old
chat-screen has ever written — has no `message_search`, so the server-side query cannot see it. A one-off
script over `supportchat/*/messages` setting `message_search` from `message` is required before this
search can be considered complete.

In-thread search (the magnifier in the thread header) now normalises both sides too, so it matches
regardless of spacing and case.

---

# Part 9 — hover strip beside the message, not over it (2026-08-24)

Part 7 put the action strip at `top: -14px` — anchored to the bubble's top edge, overlapping it. It now
sits **outside** the bubble, vertically centred on its right edge (`left: 100%; top: 50%;
translateY(-50%)`), so it never covers message text.

**One asymmetry, deliberate:** my own bubbles are right-aligned against the pane edge, with the avatar and
the 20px pane padding beyond them — roughly 55px, far less than the ~130px strip needs. Putting it on their
right would push it under the avatar and into a clipped overflow (the pane is `overflow-y: auto`, which
makes the cross axis non-visible too). So `.wc-msg.right .wc-hover` flips to `right: 100%` — the strip
appears on the **left** of my own messages. Both sides verified in the preview.

If the strip must be on the right for *every* message, the layout has to reserve a right gutter — cap the
bubble at ~60% and never let it reach the pane edge. That is a visible change to the message column, so it
was not done unilaterally.

---

# Part 10 — Flutter's `reply_to` schema adopted · in-thread search navigates instead of filtering

## `reply_to` — taken from the participant Flutter app, not invented
Source: `~/Projects/Flutter/breakthroughs-flutter/lib/Chatx/chatscreen.dart` (group send path, ~line 966).
The participant app writes, on the message doc:
```
reply_to: {
  message:    <quoted message's raw text>,
  sender_uid: <quoted message's sender>,
  messageid:  <quoted message's id>,
  files:      <quoted message's files array>,
}
```
Written here verbatim — same four keys, no extras — so a reply created on web renders in the Flutter app and
vice versa. Reading it back (`mapReplyTo`) resolves `sender_uid` through `profile_data`, expands
`@profileid` mentions to names, and takes the thumbnail from `files[0].filethumbnail` falling back to
`files[0].fileurl` — the same preference order the Flutter widget uses. Tapping the quote jumps to
`messageid`, which is what the Flutter `GestureDetector` does with `scrollToIndex`.

To write it faithfully the message model had to keep two things it previously discarded: `_rawMessage`
(the stored text, mentions still collapsed) and `_files` (the raw file records). Quoting now reuses those
rather than reconstructing them from the rendered text.

This is **not** a new schema — it is an existing one from the sibling app, previously unimplemented on web.
Replies on live groups now persist; before this they were UI-only.

## In-thread search: find & step, not filter
Operator: *"dont just crop the message for the search"*. The text query no longer filters the thread —
the sender dropdown still does, since that is a filter control. Instead:
- `searchHitIds` collects matches (oldest first) during the same `visibleMessages` pass.
- The bar shows **"4 of 5"**, or "No results".
- Up/down buttons (and Enter / Shift+Enter) step through matches with wraparound, scrolling each into
  view and flashing it **yellow** — `#FDE68A` plus a 3px ring, held 1.6s, the same treatment as a jump
  from the sidebar search. Typing lands on the most recent match first.

Both verified in the preview: "5 of 5" with the thread intact, stepping to "4 of 5" highlighted
"I paid on the 12th, from the app." in yellow.

---

# Part 11 — highlight one match at a time (bug fix)

Stepping through search results lit **every** message passed, not just the current one.

**Root cause (mine, from Part 10):** `scrollToMessage()` did `clearTimeout(this.flashTimer)` before setting
a new timer. A single shared timer handle meant each new jump *cancelled the previous element's own
un-highlight timer* — the class was added to element A, A's removal was cancelled when B was focused, so A
stayed yellow forever. The more matches stepped through, the more messages stayed lit.

**Fix:** clear the highlight from whatever currently has it (`document.querySelectorAll('.wc-msg.flash')`)
before applying it to the new target — so exactly one message is ever lit, by construction rather than by
timer bookkeeping. Added `scrollToMessage(id, persist)`: search stepping **persists** the highlight while
that match is focused (browser-find behaviour), while one-off jumps from the sidebar or a reply quote keep
the 1.6s fade. `clearHighlight()` also runs when the query changes and when the search bar closes.

Verified: two rapid steps → `document.querySelectorAll('.wc-msg.flash').length === 1`, counter "3 of 5".

---

# Part 12 — group admins + "A&H Team - Name" attribution (2026-08-24)

## Which identifier does `members` hold? — UIDs
Traced end to end before adding anything: chat-screen queries
`where('members','array-contains', currentuserData['user_ref'].id)` and `buildGroup()` pushes the same
value, and `profile_data.user_ref` points at `user_data/{authUid}`. So **`members` = uid = the `user_data`
doc id = the Firebase auth uid.** `profileid` is a *different* identifier — the `profile_data` doc id —
used only for mentions (`@profileid`) and for role lookups via `users_roles.profile_ref`. Confusing the two
would silently break membership filtering, so `group_admin` follows `members` and stores **uids**.

## ⚠️ NEW FIELD — `group_admin` (needs your sign-off)
```
supportchat/{groupId}
  group_admin: [uid, uid, …]      ← NEW; nothing else in either app writes it
```
Seeded with the creator on group creation. `mapGroupDoc` reads it into `adminUids`. The old chat-screen and
the Flutter app both ignore it. This is the second field added since Part 5 stripped the unapproved ones —
`message_search` was the first, and this one was requested in the same breath as the feature, but flagging
it explicitly since the standing rule is no schema without approval.

Permission to change admins (`canManageAdmins`): platform `chatxadmin`/`admin`, the group creator, or an
existing entry in `group_admin`. The creator cannot be demoted — `isGroupAdmin()` treats `creator_uid` as
an implicit admin so a group can never end up with nobody able to administer it.

**UI:** each Participants row gets a shield toggle plus an `ADMIN` pill; the section header shows
"N admins". Demo rows toggle locally.

## Admin attribution on messages
Messages from an admin now read **"A&H Team - Arjun Menon"** instead of just the name. `isAdminSender()`
counts someone as admin if their uid is in `group_admin`, if they are the creator, or if their
`users_roles` entry carries `admin`/`chatxadmin`. Applied to the bubble sender line, the pinned strip, the
quoted message in a reply, the composer's reply preview, cross-group search hits and announcements.
`selfName` alone is used when the sender *is* the demo `A&H Team` account, so it never renders
"A&H Team - A&H Team".

**Process note:** the first patch attempt asserted out mid-script, so the TS landed while the matching
HTML/CSS silently did not — the shield buttons were missing on the first check (`admin buttons: 0`) even
though the build was green. Worth remembering that a green build proves nothing about template edits that
never got written.

## Part 12a — `group_admin` is an overlay, not a bucket (+ leak fixed)
Operator asked whether promoting someone moves them out of `members`. It does not, by design:
`toggleGroupAdmin()` writes **only** `group_admin`, so an admin appears in *both* arrays —
`members` keeps them receiving messages, passing the `array-contains` filter and listed under
Participants; `group_admin` is a permission overlay on top.

The question surfaced a defect: `removeMember()` stripped `members` only, stranding the uid in
`group_admin`. Since `canManageAdmins` grants rights off that array, a removed member kept administrative
permission over the group. `removeMember()` now does `arrayRemove(uid)` on **both** fields in one
`updateDoc` (and the demo path mirrors it).

## Part 12b — `group_admin` is the single source of truth
Operator tightened Part 12 on three points:
1. **Only a group admin gets the "A&H Team - Name" prefix.** `isAdminSender()` previously also counted a
   platform `admin`/`chatxadmin` role and the creator. Both fallbacks removed — the prefix now requires
   membership of this group's `group_admin` array, nothing else.
2. **The creator is seeded into `group_admin` at creation** (was already the case) so they hold the badge
   through the array like anybody else, rather than by a special rule.
3. **Nothing is shown as admin implicitly.** `isGroupAdmin()` no longer treats `creator_uid` as an admin,
   so a group whose `group_admin` is empty — every group created before this field existed — shows **no**
   admins rather than silently presenting the creator as one.

The creator *does* remain in `canManageAdmins`, deliberately: it is a permission, not a badge, and without
it a legacy group with an empty `group_admin` would have nobody able to appoint the first admin. Replacing
the old "creator can't be demoted" rule is a **last-admin guard** — demoting the only remaining admin is
refused ("A group needs at least one admin"), which prevents the same lockout without inventing an
implicit admin.

Verified in the preview: before promotion → 0 ADMIN pills and senders read "Arjun Menon"; after promoting
one participant → 1 pill and that sender reads "A&H Team - Arjun Menon" while others stay unchanged;
demoting the last admin is refused with the toast.

---

# Part 13 — category removed · picture instead of icons · one people list · posting locked to admins

1. **Category gone from group info.** The block, plus `catEdit` / `newCategory` / `setCategory()` /
   `addCategory()`, are deleted — `supportchat` has no category field, so it was editing nothing. The
   sidebar category chips remain for the demo channel rows, which do carry one.
2. **Group picture replaces the emoji picker.** The create dialog now uploads an image to
   `Chat/{name}{lastModified}{size}` — the same Storage path shape `buildGroup()` uses in chat-screen —
   and stores the URL in the existing **`group_profile`** field, so both screens show one picture. No new
   field. The emoji constant survives only for the static demo rows.
3. **One people list in the create dialog.** The Team / Participants segmented control is gone; `createPool`
   merges both, de-duplicates by id and sorts by name. Each row carries a shield toggle to mark that person
   a **group admin**, and marking someone implies membership (auto-selects them); deselecting a member drops
   their admin mark. On create, `group_admin` = creator + everyone marked.
4. **Posting is limited to group admins.** `canMessage` hides the composer *and* the formatting toolbar,
   replacing them with "Contact the group admin or developer for access to message." Verified by forcing the
   state: composer `false`, toolbar `false`, notice rendered.
5. **Only admins assign admins, developers are the escape hatch.** `canManageAdmins` is now
   `isSelfGroupAdmin || developerRole` — the platform `chatxadmin`/`admin` and creator clauses are gone.
   `developer` is an existing flag on the roles doc (used elsewhere in the app, e.g. manual-assignments),
   read via `guard.getRoles()`.

## ⚠️ Decision I made that needs your confirmation
Every group created before `group_admin` existed has an **empty** admin array. Read strictly, rule 4 would
freeze messaging in *every* existing group for *everyone*, with only a developer able to unfreeze them one
by one. `canMessage` therefore falls back to **allowing** posts when `group_admin` is empty, and only
enforces the restriction once a group has at least one admin recorded. If you want the strict reading
instead — no admins means nobody posts — it is a one-line change, but it should be a deliberate choice,
not a side effect of a migration gap.

## Part 13a — posting requires membership AND admin; developer role grants neither
Operator: *"even if the logged uid has developer role, dont show the message, they should be a member and
admin to message in the group"*.

`canMessage` now checks **both** arrays and ignores `developerRole` entirely:
```
member of `members`?      no  → cannot post
group_admin empty?        yes → may post   (legacy groups, see the flag in Part 13)
in `group_admin`?         no  → cannot post
```
The membership check matters more than it first looks: platform `chatxadmin`/`admin` users get **every**
group from `loadGroups()` (the `array-contains` filter is skipped for them), so without it they would be
able to post into groups they were never part of.

`developerRole` now appears in exactly one place in the component — `canManageAdmins` — so a developer can
appoint the first admin of a group but cannot post in it unless they are themselves a member and an admin.

## Part 13b — bold is `*text*`, one star each side
Was `**text**` (the reference design's markdown-ish convention). Changed in four places so they cannot
drift apart: the inline token regex (`\*([^*\n]+)\*` — no newlines, so an unpaired star cannot swallow the
rest of a message), the Bold toolbar button (`*sel*`, or `**` with the caret between them on an empty
selection), `plainPreview()` (now unwraps `*x*` → `x` instead of blindly deleting star pairs), and the
toolbar hint. Demo strings updated to match.

Verified: the announcement renders `<strong>Saturday 10:00 AM</strong>`, the hint reads `*bold*`, and
selecting "world" in the composer produces `hello *world*`.

**Legacy note:** any message already stored with `**text**` now renders as `*<b>text</b>*` — the inner pair
makes the bold, the outer stars show as literal characters. Nothing was written with `**` outside the demo
data, so this only matters if double-star text was typed into a live group during earlier testing.
Supporting both syntaxes is a one-line alternation if you want it.

---

# Part 14 — sidebar chips, description, quote avatar, pin-scroll bug, flattened actions

1. **Category chips removed from the sidebar** (All / Broadcast / Cohorts). The `categories` getter stays
   only to feed the demo channel rows' pills.
2. **Description input removed from the create dialog.** `cDesc` is now a `readonly ''` so demo rows still
   have the field shape without an input driving it. Dialog fields are now: Group name, Group picture,
   Created under event, Members.
3. **No avatar in the quoted reply** — the quote is just sender + text again.
4. **Pinning while scrolled up no longer jumps to the newest message.** *Root cause:* every write to a
   message re-emits the whole thread through the live `collectionSnapshots` subscription, and the handler
   called `scrollToBottomSoon()` unconditionally — so pinning (or editing, or reacting) yanked the reader
   to the bottom. It now scrolls only when the thread **first loads**, or when the message **count grows**
   *and* the reader was already within 140px of the bottom (`isNearBottom()`). Editing and pinning change
   no count, so the viewport holds.
   *Verification caveat:* the demo path mutates local state and never called the scroll, so the preview
   check (scrollTop 0 → 0 after pinning) only proves no regression there; the fix itself lives in the live
   subscription handler and rests on the count comparison.
5. **The 3-dot overflow menu is gone.** It duplicated the strip beside it. `menuOptionsFor()` became
   `actionsFor()` and every action is now an inline icon in the hover strip — copy, react, reply, edit,
   pin, raise ticket, info, delete (delete in red) — filtered per message as before. `menuId` state and the
   `.wc-menu` markup are deleted. Confirmed in the preview: strip renders
   `content_copy, add_reaction, reply, push_pin, support, delete_outline` with no overflow menu present.

---

# Part 15 — raise-ticket now uses the Customer Support add-issue dialog

The bespoke ticket modal (category chips, priority buttons, title/notes) is **deleted** — markup, styles,
`TICKET_CATEGORIES` / `PRIORITIES`, `ticketDraft`/`tTitle`/`tNotes`/`tCategory`/`tPriority`,
`createTicket()`, `openTicket()`, `nextTicketNumber`, the ticket toast. It wrote to a `tickets` collection
that does not exist in this project; the real one is **`clientissue`**.

`raiseTicket(m)` now opens `AddIssueComponent` — the same dialog customer-support-dashboard opens — with
the same `data` contract it builds:
`{ type:'new', metadata, categories, status, journey, reportedBy, timestamp, mapprofileUid, recentticket }`.
Those inputs are loaded the same way the dashboard loads them: `chat config` (categories + status),
`guard.getProfileMap().docdata` (keyed by **profile_data doc id** — which is what `clientid` holds),
`guard.getJourneyMap()`, and the newest `clientissue` by `reporteddate` for the running ticket number.
`metadata` is prefilled with the message text as `issue` and the sender's **profileid** as `clientid`.

**One change outside this screen:** `add-issue.component.ts` closed with a bare `dialogRef.close()`, so the
caller could not know which ticket had been created. It now closes with `{ id, issueno }`. The dashboard
ignores `afterClosed()`'s value, so this is backwards compatible — but it is an edit to a shared component
and worth knowing about.

After a successful create, the ticket opens in a **new tab** at
`/customersupportdashboard/ticket/{id}/{issueno}` — the exact URL the dashboard uses for a ctrl/cmd-click
(`messageIssue()`).

**Verified:** hovering a message → the support icon opens the real ADD TICKET dialog, with the Issue field
prefilled from the message. **Not verified:** the create-and-open-new-tab path, because completing that
form writes a real ticket to production `clientissue` and increments `counters/ticketCounter`.

---

# Part 16 — add-issue dialog layout + prefill · single-list add members · Channels parked

## add-issue dialog (SHARED — also changes customer-support-dashboard)
- **Why it scrolled:** the three columns were fixed-width — 280 + 280 + 750 plus 20px margins *and* 20px
  inner padding each — roughly **1500px**, wider than the 95%-of-viewport dialog, so it scrolled sideways;
  and the third `mat-card` had a hardcoded `height: 500px`.
- **Why the empty space:** the dialog was opened at a fixed `height: 95%` regardless of content.
- **Fix:** columns are now `flex: 1 1 300px` (issue column `1.6 1 380px`) inside a wrapping flex row, all
  fields `width: 100%`, the issue card fluid; both callers open it at
  `width: min(1150px, 96vw); maxHeight: 92vh` with **no fixed height**, so it hugs the form and only
  scrolls when the content genuinely exceeds the viewport. On a narrow window the columns now wrap
  instead of forcing a horizontal scrollbar.

## Prefilled client did not populate email / phone / journey
`fetchProfileData()` runs only on `(selectionChange)` — a *user* action. A `clientid` patched in when the
dialog opens (exactly what raising a ticket from a chat message does) never triggered it, so those three
fields stayed blank. It now runs once `profile_data` has loaded — it could not run at patch time, since
`profileList` is still empty then — guarded by `if (!data.length) return;` so an unknown profileid leaves
the fields blank instead of throwing on `data[0]['number']`.

## Add-members dialog: one list
Same treatment as the create dialog — the Participants / Team segmented control is gone; `addPool` now
filters `createPool` (both merged, de-duplicated) minus existing members. Verified: team and participant
rows appear together, no tabs.

## Channels parked; Archived split
The **Channels** main tab is commented out (not deleted — the broadcast features and demo rows stay).
**Archived** now carries its own two sub-tabs, Groups and Channels: Groups lists `isdelete === true`
groups, Channels is deliberately empty for now. `setArchivedSub()` clears the open thread when switching.
Verified: main tabs are `Groups | Archived`, sub-tabs `Groups | Channels`, and the Channels sub-tab shows
"Nothing archived yet".

## Part 16a — one search box, results grouped
The Group name / Messages mode toggle is gone. A single box now does both at once: group names filter
instantly (client-side, as before) while message hits arrive debounced underneath, and the results render
as two labelled sections — **GROUPS · n** first, then **MESSAGES · n**. Either section is omitted when it
has no matches; when neither matches, one "No groups or messages match …" line. With the box empty the
list behaves exactly as before.

Verified in the preview: "session" → MESSAGES · 2 only (no group name matches); "bengaluru" → GROUPS · 1
only; "u" → GROUPS · 2 followed by MESSAGES · 5.

## Part 16b — channel tagging removed · tagging list trimmed · announcement parked
- **`@channel` / `@all` gone entirely**: the toolbar "channel" button, the `@channel` entry in the
  autocomplete, and — importantly — the tokens themselves in `mentionSource()`, so the parser no longer
  treats them as mentions at all. `mentionsMe()` now only fires on your own name. The dead `everyone`
  branch of the autocomplete row (and `MentionOption.everyone`, and `.wc-mention-all` CSS) went with it,
  and the demo announcement no longer opens with `@channel`.
- **Tag list shows names only**: the sub-line (role / journey) and the TEAM pill are gone — the row is
  avatar + name. The **signed-in user is filtered out**, since you cannot tag yourself.
- **Announcement composing parked**: the toolbar button is commented out alongside Channels. Existing
  `kind: 'announcement'` messages still render — only the way to compose a new one is hidden.

## How channel link buttons are stored (answer, not a change)
Channel CTA buttons are **not** the `[Label](url)` markdown this screen uses. They live in a
`buttons` **array field on the message document**:
```
buttons: [ { label: 'Join Zoom call', url: 'https://…' }, … ]   // max 5
```
Authored in `channeltemplates` (a `FormArray` of `{label, url}` groups, capped by `maxButtons = 5`),
carried onto the message by `channel-communication` (`buttons: this.selectedTemplate.buttons || []`)
alongside `htmlbody`, `textbody`, `headertype`, `headervalue`, `footer`, `files`, `links`. chat-screen
renders them through `parseChannelButtons()`, which tolerates three shapes — a real array, an object map
(`Object.values`), or a JSON string — which suggests older records were written inconsistently.

## Part 16c — group link buttons stored like channel buttons
Group messages previously carried CTAs as `[Label](url)` **inside the message text**. They now use the
**same field channel broadcasts use** — an array on the message doc:
```
supportchat/{groupId}/messages/{id}
  buttons: [ { label: 'Join Zoom call', url: 'https://…' }, … ]   // capped at 5, as channeltemplates does
```
So one shape serves both, and a group CTA is machine-readable instead of buried in prose.

- **Composing:** the link form no longer splices markdown into the draft. It attaches a **chip** above the
  composer (removable, max 5); on send the chips are written to `buttons` and cleared. The demo path
  mirrors it.
- **Reading:** `parseButtons()` accepts array / object-map / JSON-string, exactly like chat-screen's
  `parseChannelButtons()`, since older channel records were written inconsistently.
- **Backwards compatible:** `ctasOf(m)` renders stored `buttons` **plus** any legacy `[Label](url)` still
  embedded in older message text, so nothing already sent loses its button.
- Note this is a **new field on group messages** (`buttons`) — but not a new *schema*: it is the existing
  channel-message field, now also written on the group side.

Verified: adding a link produced a chip with the draft left untouched; sending produced a bubble with one
CTA at its foot and cleared the chips.

## Part 16d — attachment preview before sending · Media/Docs/Links in group info · real audio player

**Preview before sending.** Picking a file used to upload and post it immediately. It is now *staged*:
`pendingFiles` holds the File plus an object-URL preview (revoked on remove and on send, so no leaks),
rendered as thumbnails above the composer with a remove button and a size label. The draft becomes the
**caption**, and `send()` uploads then posts everything as one message. Up to 5 per message. The send
button now appears when attachments are staged even with an empty draft, and is disabled while uploading.
Switching threads discards anything staged.

**Group info gained Media / Docs / Links tabs**, WhatsApp-style. `threadLinks` collects every link in the
thread — stored `buttons`, legacy `[Label](url)` CTAs, and bare URLs in message text — de-duplicated per
message, newest first, each row showing label, host, sender and time, with a jump-to-message button.

**Audio: the hand-rolled player is gone.** It depended on `att.duration` (no longer stored) and on
`audio.duration` being available, which it frequently is not for webm/Storage URLs — so the bar sat at zero
and older audio looked broken. Replaced with the browser's own `<audio controls>` (seek, volume, rate for
free, and it decodes whatever the browser supports); `voiceKey`/`toggleVoice`/`onVoiceTime`/`voiceLabel`
and their state were deleted.

**Type detection rewritten** — this is what actually made old media unopenable. Records are inconsistent:
`filetype` is usually a MIME string, but `mediatype` is sometimes a bare word ("image"/"video") — which is
what the Flutter app checks — and either can be absent. `fileRecordToAttachment()` now tests MIME prefix,
bare word, **and** the filename extension (jpg/png/gif/webp/heic…, mp4/mov/webm/mkv…, mp3/wav/m4a/ogg/opus…),
with a special case for `.webm`, which can be either audio or video. Anything unrecognised still falls back
to a download link.

Verified: the info panel shows `Media · 0 / Docs · 0 / Links · 1`, and the Links tab renders
"Join Zoom call — zoom.us — A&H Team — 24 Aug, 22:30" with a jump control.

## Part 16e — real audio player component · viewable media previews

**`audio-player.component.ts` (new file, `app-chat-audio`).** The browser's native `<audio controls>` was
a stopgap and looked out of place; the hand-rolled one before it was worse. This is a proper player:
play/pause, a working seek slider, elapsed/total, and a 1× / 1.5× / 2× speed control, styled for both
light and dark bubbles.

Two reasons it is its **own component** rather than more markup in the screen:
1. Each clip owns its state. The previous version kept `playing`/`progress` maps keyed by a string derived
   from the URL — two clips from the same file collided.
2. The duration fix needs per-element lifecycle. **A MediaRecorder webm — exactly what the voice-note
   recorder produces — reports `duration === Infinity` until it is seeked**, which is the real reason the
   old player sat at 0:00 and looked broken. `resolveDuration()` applies the standard workaround: seek far
   past the end once, let the browser settle on a real duration, rewind, and never repeat it.

Used in three places now: message bubbles, the info panel's Docs tab, and the composer's staged preview
(where an attached clip can be auditioned before sending, with the download control hidden).

**Media previews are viewable.** Staged images and videos are buttons that open the lightbox, which now
renders `<video controls autoplay>` as well as images (`lightboxKind`); clicking the video itself does not
dismiss it. Videos in the info panel's Media grid open the same way. Staged audio gets an object URL too,
so it can be played before sending.

Verified with a generated 3-second WAV and a canvas PNG: both staged, the player reported
`duration: 3` and `0:01 / 0:03` while playing (`paused: false`), and clicking the image thumbnail opened it
full size in the lightbox.

## Part 16f — audio belongs to Media · attachments sorted newest first · sender shown
- **Audio moved out of Docs into Media.** `threadMedia` stays photos + videos (the thumbnail grid),
  `threadAudio` is a separate list rendered as players underneath it, and the tab count is
  `threadMediaCount` = both. **Docs is now files only.** Verified: a WAV and a PDF sent together produced
  `Media · 1 / Docs · 1`.
- **Sorted by date and time, newest first.** `threadAttachments` sorts on the message's ISO `at`, which
  sorts lexicographically — no Date parsing. Media, Docs and the audio list all inherit it; Links were
  already newest-first.
- **Sender shown on every attachment.** `threadAttachments` now carries `sender` (via `senderLabel()`, so
  an admin still reads "A&H Team - Name"). Media tiles gained a caption with sender + time, audio and doc
  rows a matching meta line.

Verified: two images uploaded in sequence render newest-first, each captioned "A&H Team · 02:45".

## Part 17 — profile panel: real tickets from `participant metadata`, profile page in a new tab

**Where the tickets come from.** Not `clientissue` directly — the `dashboardcustomersupport` cloud
function (`functions/components/clientissue.js`) maintains a rollup on the participant:
```
participant metadata/{profileid}
  customersupport: { <clientissueDocId>: { ticketno, category, issue, reporteddate, status } }
  customersupporttickets: <open count>
```
The map **key is the clientissue doc id**, which is exactly what the ticket page needs, so each row deep
links to `/customersupportdashboard/ticket/{docId}/{ticketno}` in a new tab — the same URL the support
dashboard opens on a ctrl/cmd-click. Rows show ticket number, status, category and date, sorted newest
first, and are fetched with a single `getDoc` when a profile is opened.

Worth knowing: the function only records tickets whose status is **open** (it filters
`status.status === 'open'` before building the map), so a closed ticket disappears from this panel. That is
the collection's behaviour, not a filter added here — if closed tickets should be listed, the rollup in the
cloud function is what needs changing.

The demo `profileTickets` / `profileOpenTickets` getters are deleted.

**Profile name opens the profile page** — `openProfileTab()` resolves the person's profileid through
`profile_data` and opens `/userprofile/{profileid}` in a new tab, matching how appointment-studio and
content-analytics link to it. The name renders as a button with an external-link icon.

Verified in the preview: the panel opens with the name as a button, and Ticket details reports
"TICKET DETAILS · 0 / No open tickets" for a demo person with no `participant metadata` doc.

## Part 17a — selection no longer restacks the thread
Double-tapping a message (multi-select) pulled **every** message to the left. That came straight from the
reference design: `[class.right]="!selectMode && alignRight(m)"` on both the row and its column, plus
`.wc-msg.selecting { justify-content: flex-start }` — i.e. alignment was deliberately suppressed while
selecting so the checkboxes formed a single column. In practice it makes the thread unreadable at the exact
moment you are trying to identify which messages to delete.

Alignment is now independent of selection: the `!selectMode &&` guards are gone and the CSS override is
removed, so a checkbox is simply added in place. Because `.wc-msg.right` is `row-reverse`, an outgoing
message's checkbox lands on its right — mirrored, which reads correctly. My own avatar also stays visible
while selecting now.

Verified: the side pattern is identical before and after entering select mode (`LRLLLR` → `LRLLLR`).

---

# Part 18 — restyled to the iOS console design (2026-08-31)

Operator supplied `web-chat-console-ios.html` with: *"leaving the functionalities same update the UI based
on the new html attached… only the UI change"*. **No behaviour was touched** — no new state, no new
Firestore calls, no changed handlers.

## Getting the design out of the file
It is not readable markup: it is a **bundled page** — the DOM and CSS live base64-encoded inside
`<script type="__bundler/manifest">` / `"__bundler/template"`, and the JS entries are gzipped. Decoded with
a short script (`json.loads` → `base64.b64decode` → `gzip.decompress`); the three JS blobs turned out to be
the runtime and React, so the design is entirely in the template: one `<style>` block of tokens plus
inline-styled markup with the computed styles in the component logic.

## The design system now in `:host`
Light and dark token sets (`--canvas / --panel / --field / --sunken / --raised / --chip`,
`--line…4`, `--ink…4`, `--blue*`, `--amber*` (a pink `#D1004A`), `--red*`, `--green*`), plus **aliases**
(`--bg`, `--border`, `--t1`…) so all 288 existing selectors re-theme instead of being rewritten — the
stylesheet was retinted, not replaced, which is why no rule was lost. A `:host-context(html[data-theme="dark"])`
block picks up the app's theme switch if one is ever set.

## What changed visually
- **Sidebar**: 336px, panel background, iOS **segmented tabs** in a raised tray (active = white card with a
  shadow), rounded 12px search field, conversation rows as 10px-radius cards with a 30×30 tinted icon,
  15.5px names, tabular times, and pill unread counts.
- **Thread**: canvas background with a panel header, 18px title, 30px bordered Find/Info buttons.
- **Bubbles**: 10px 14px padding, asymmetric radii (`2px 10px 10px 10px`, mirrored for own), 15.5px text,
  600px max width. **Own messages are now a tinted card (`--blue-tint2`) with ink text, not a solid purple
  fill** — that is what the console design does, and it keeps long messages readable.
- **Identity**: the per-sender rainbow is gone. Avatars are filled circles — **blue for team/admins,
  neutral for everyone else** — with white initials, and sender names are plain ink. `senderColor()` now
  returns `var(--ink)` and `avatarBg()` decides blue vs neutral, so every call site follows automatically.
- **Hover actions** became the design's floating **pill** (999px radius, soft shadow, press-scale).
- **Composer**: 44px controls, 14px-radius input, filled blue send button with a shadow; read-only and
  no-access bars became dashed rounded cards; the selection bar is now a solid blue action bar.
- **Panels/dialogs**: 340px info panel, 18px-radius dialogs, 12px fields, sentence-case section titles.

Verified across the thread, group info, and the create-group dialog. Build clean.

**Note on the repo:** during this pass the operator committed the whole feature and renamed the route to the
correctly-spelled **`group-chat-screen`**; only this restyle remained uncommitted.

## Part 18a — name and timestamp outside the card, tighter thread
Following the console design more closely: the message card now holds **content only**.
- **Sender name moved above the bubble** (12.5px, ink; blue-text and right-aligned on own messages),
  still only on the first message of a run.
- **Timestamp moved out of the bubble and beside it** (operator refined this from "below" to "next to"):
  a new `.wc-bubble-line` flex row holds the card and the stamp, and `.wc-msg-col.right` reverses it, so
  the time trails an incoming card and leads an outgoing one. "edited" and the read ticks travel with it.
  The hover pill and emoji picker moved inside that row so they still anchor to the card, not the stamp.
- **Card is compact**: padding 10px 14px → 7px 11px, text 15.5px → 14.5px, line-height 1.45 → 1.4, and the
  quote / attachment / CTA insets tightened to match.
- **Vertical rhythm**: thread gap 8px → 3px, and a run continuation is now `margin-top: -1px` (was -10px,
  which was compensating for the old larger gap) so a run reads as one block without overlapping.

Verified top and bottom of a thread: names sit above, stamps below, nothing overlaps, and the sticky day
chip still behaves.

## Part 18b — hover pill, composer card and sidebar rows matched to the design
Three places where my restyle had kept the old structure rather than the design's:

1. **Hover actions.** Mine floated to the side of the card (a placement the operator had asked for under
   the *previous* design). The console design puts it at the card's top corner: `top: -15px` with
   `right: 6px` incoming / `left: 6px` outgoing, plus a pop-in — `.msg-actions` in the design's own CSS.
   Copied verbatim, including the spring easing, as a keyframe since the pill is created on hover here
   rather than always present with `opacity: 0`.
2. **Composer.** The design wraps *everything* — notices, errors, mention list, pending attachments, the
   tool row and the input — in **one bordered card** (`margin: 0 24px 20px; border-radius: 14px;
   background: panel; overflow: hidden`), with each strip separated by a hairline. Mine had those as loose
   siblings sitting straight on the canvas. Added `.wc-composer-card` around them and moved the padding
   inside; the toolbar and input row now sit within the card.
3. **Sidebar rows.** The design's row is **three lines**: name + time, then kind pill + audience, then
   preview + unread. Mine folded the member count into the preview line. Split it out
   (`.wc-row-mid` / `.wc-row-audience`) so the row reads as designed.

## Part 18c — pinned strip rebuilt to the design
It was still the old amber-tinted band with pin icons, an avatar and an X. The console design is plainer
and lives on the panel:
- **Band**: `--panel` background with hairline borders; only the **"Pinned N"** label carries the accent
  (`--amber-text`), the collapsed preview is `--ink2`, and the toggle ("View all" / "Hide") is `--ink4`.
- **Expanded rows**: `--field` cards, 10px radius, 1px apart — **timestamp · excerpt · Jump**, with Jump in
  `--blue-text`. No pin glyphs, no avatars.
- The design has no unpin control there; kept one as a quiet text action (`Unpin`, red on hover) so the
  functionality is not lost — the operator's standing rule is UI-only changes.

## Part 18d — spacing between senders, stamps always right, tighter composer
- **The vertical gap moved from "between messages" to "between senders".** The flex `gap` on
  `.wc-messages` is now 0; instead a message gets `margin-top: 2px`, and one that **starts a run**
  (`:not(.continues)`) gets `14px`. So a sender's own messages stack flush and the breathing room falls
  where the speaker changes. First child and the row after a day chip are special-cased so the thread does
  not open with a stray gap.
- **Timestamp + ticks always sit to the right of the card**, outgoing included — the `row-reverse` on
  `.wc-msg-col.right .wc-bubble-line` is gone.
- **Less space under the composer**: card margin-bottom 20px → 12px and the input row's bottom padding
  12px → 8px.

## Part 18e — white-on-white content fixed · no avatar on own messages
**The invisible text had one root cause, not two.** `isLight(m)` returned true for own messages — a
leftover from the previous design, where an own bubble was a *solid purple fill* that needed white
content. The console design has no dark bubble (own messages are a pale tinted card), so everything keyed
off that flag rendered white on near-white: the audio player, inline links, `@mention` chips and CTA
buttons. `isLight()` now returns **false** unconditionally, which fixes all of them at once rather than
patching the player alone. Verified: the player's computed colour is `rgb(20,22,26)`, i.e. `--ink`.

**Own messages no longer show an avatar**, matching the design (it renders one only for incoming
messages). The sender name above the card already identifies incoming messages, and your own side needs
no marker.

## Part 18f — audio speeds, and two containment bugs the operator's screenshots exposed
1. **0.5× added** to the player's speed cycle (`0.5 → 1 → 1.5 → 2`) and the elapsed/total readout darkened
   from a 0.7-opacity inherit to `--ink2`, with the rate control matching. Verified the cycle and
   `rgba(60,60,67,0.62)`.
2. **The attach menu only showed one option.** Not a menu bug: Part 18b wrapped the composer in a card with
   `overflow: hidden`, and the menu opens *upward out of that card*, so it was being clipped to the sliver
   inside. The card is now `overflow: visible` (with an explicit radius on the first strip, which is what
   the clipping had been doing for the corners). All five options render.
3. **Hovering a message grew a horizontal scrollbar.** The action pill is ~230px wide with
   `white-space: nowrap`; anchored `left: 6px` on an outgoing card, a short message ("ok") sitting at the
   right edge pushed it past the pane. Outgoing cards now anchor it `right: 6px` — it hugs the same corner
   and grows *inward*. `.wc-messages` also got `overflow-x: clip` as a backstop. Verified: pane overflow
   stays 0 while hovering, and the pill's rect is inside the pane.

Note this contradicts the design's own `[data-side="out"] .msg-actions { left: 6px }` — that rule assumes
the wide lanes of the reference mock; at this screen's widths it overflows, so the anchor was flipped
deliberately.

## Part 18g — sidebar rows separated and compact; thread header slimmed
- **Separation between groups**: rows carried no divider, so entries ran together. Added an inset
  hairline via `.wc-row + .wc-row::before` (left/right 9px so it clears the rounded card), suppressed on
  the hovered/selected row and its neighbour so the card reads as one solid shape.
- **Compact rows**: padding 10px → 6px 9px, icon 30 → 26px, name 15.5 → 14.5px, preview 14.5 → 13px,
  kind pill and audience down a step, and the stacked line margins collapsed. **Row height 90px → 65px.**
- **Thread header**: padding 14/20 → 8/16, title 18 → 15px, sub 12.5 → 11.5px, icon 34 → 28px, buttons
  32 → 28px, and the pinned band's head padding trimmed with it. **Header height 76px → 54px.**

## Part 19 — light / dark theme toggle
The design ships both palettes; Part 18 already loaded the dark tokens but nothing could reach them. A
toggle now sits beside the + button in the sidebar (sun / moon icon).

**Scoped to this component on purpose.** The switch sets `data-theme` on **this screen's host element**,
not on `<html>`. Setting it globally would re-theme nothing else — no other StarLabs screen has dark
styling — but would leave the app shell light around a dark screen with no way for other screens to
follow. Scoping keeps the blast radius at one component. The CSS accepts both:
```
:host([data-theme="dark"]),                    /* this screen's own toggle   */
:host-context(html[data-theme="dark"]) { … }   /* a future app-wide setting  */
```
`color-scheme` is set too, so native controls (scrollbars, the audio element, date pickers) follow.

The choice persists in `localStorage['groupChatTheme']`, read on init. Both the read and the write are
wrapped in try/catch — this app is SSR, and `localStorage` is absent on the server and throws in some
private-browsing modes.

Verified: toggle → `data-theme="dark"`, canvas `rgb(6,6,8)`, ink `rgb(242,243,245)`; reload → still dark;
toggle back → light, canvas `rgb(234,237,243)`, and the stored value follows.

## Part 19a — dark theme readability (found by measuring, not looking)
Rather than eyeball it, a script walked every text node in the screen, resolved each element's effective
background, and computed WCAG contrast. **Six elements were below 2.2:1**, from two causes:

1. **16 literal `background: white` declarations** the Part 18 colour pass had missed — it mapped hex
   values, and the CSS keyword `white` slipped through. Those surfaces stayed white in dark mode while
   their text turned light: the in-thread search bar, hit-stepper, sender dropdown, channel card,
   announcement action buttons, selection checkbox, 3-dot menu, emoji picker, mention list, back button.
   All now use `--field` / `--panel`.
2. **Neutral avatars filled with `--ink2`.** That token is *dark* in light mode and *light* in dark mode —
   fine for text, wrong as a fill — so white initials sat on a near-white circle (ratio 1.18). They now use
   **`--chip-low`**, a mid grey the design defines identically in both palettes (`#6E6E73` / `#8E8E93`),
   which keeps white initials legible either way.

Also swapped: the checkbox tick and the "light" inline-link colour, which were literal white.

**Re-audited: 0 elements below 2.2:1.** Worth remembering for any future re-theme — a hex-only search and
replace leaves the CSS colour keywords behind, and a token that flips lightness between themes cannot be
used as a background for fixed-colour text.

## Part 19b — the audio player and the video backdrop had missed the retheme
Two things the Part 18 pass could not have caught, because it only ever touched
`group-chat-screen.component.css`:

1. **`audio-player.component.ts` carries its own styles**, and they were still the *pre-redesign* palette:
   `#F4F5F7` card, `#E5E7EB` border, `#7C3AED` purple play button, plus a `.light` variant with white
   text. In dark mode that rendered as a pale card with a purple button. Now on tokens
   (`--sunken`, `--line`, `--blue`, `--ink`, `--ink2`), each with a light-mode literal as fallback so the
   component still stands alone. Custom properties inherit through the DOM, so the child picks up the host
   screen's theme automatically — verified in dark: card `rgb(13,14,17)`, text `rgb(242,243,245)`, play
   button `rgb(10,132,255)`.
   The `.light` variant is gone (`isLight()` is permanently false); the `@Input()` remains a no-op so
   nothing breaks at the call sites.
2. **`.wc-media-video` backdrop.** The original `#0D0F12` was auto-mapped to `var(--ink)` — correct as a
   *text* colour, wrong here: `--ink` inverts, so in dark mode the video thumbnail sat on a white box with
   a white play icon on top. Pinned to `#000`, which is right in both themes.

The toast deliberately keeps `background: var(--ink); color: var(--panel)` — that pair is *meant* to
invert, giving a dark toast on light and a light toast on dark.

## Part 19c — scrollbars, hover pill (visibility + anchor + trigger), search box, group icon
- **Scrollbars styled.** The design's `--scroll` token was missed in the first pass; added to both palettes
  and applied to every scroll container in the screen (list, thread, info panel, dialog body, pickers) —
  10px wide, thumb inset by a transparent 3px border with `background-clip: content-box` so it reads as a
  floating pill, `--line4` on hover, plus `scrollbar-color` for Firefox.
- **Hover pill invisible in dark.** It was `--panel` on a `--canvas` background — nearly the same value in
  dark — with `--ink2` glyphs. Now `--raised` with a `--line3` border and full-strength `--ink` icons,
  a deeper shadow, and `--blue-text` on hover.
- **Pill appeared from anywhere in the row, detached from the message.** Two causes, both mine:
  the `mouseenter` was on `.wc-msg-col`, which is `flex: 1` and therefore spans the whole thread width;
  and `.wc-bubble-line` stretched to that same width, so `right: 6px` anchored the pill to the empty half
  of the row. The listener moved onto `.wc-bubble-line`, the line is now `width: fit-content`
  (`margin-left: auto` when outgoing), and the pill markup moved **inside `.wc-bubble`**. Verified:
  hovering the column does nothing, hovering the card opens it, and it sits within 12px of the card edge.
- **Search box**: fixed 36px to match the buttons beside it, font 15 → 14px, `min-width: 0` +
  `text-overflow: ellipsis`, and the placeholder shortened to "Search groups & messages" — with the theme
  and + buttons in the row the old string could not fit and was clipped mid-word.
- **Group with no picture** now falls back to a bell `mat-icon` instead of the 💬 emoji.
  *Note:* the reference design actually uses a house glyph `⌂` for groups (`⇥` channels, `⌸` archived) —
  there is no bell in it. Built as asked; swapping to the design's glyph is a one-line change.

## Part 20 — screen owns the full window; app nav moved into the chat
The chat now hides the app toolbar and carries the navigation trigger itself.

- **Toolbar hidden**: `app.component.html`'s toolbar `*ngIf` (which already excluded `/openmeeting`,
  `arenadesigninsights`, `/arena/`) gained `!router.url.includes('group-chat-screen')`. Note
  `shouldShowNavigation()` in the .ts is commented out and unused — the live rule is the template one.
- **New `nav-drawer.service.ts`** (root-provided, a `Subject`). The drawer is declared in AppComponent's
  template, so a routed child cannot reach it, and with the toolbar gone its hamburger no longer exists.
  AppComponent subscribes to `toggle$` and calls its existing `toggleLeftDrawer()`; the chat calls
  `navDrawer.toggle()`. No circular dependency, and nothing else in AppComponent changed.
- **Hamburger placed beside the tabs** in a new `.wc-tabsrow` (34px, matching the segmented control).
- **The screen resizes itself.** `fitToViewport()` measures the host's own top offset, so with the toolbar
  gone it fills the window with no constant to update — verified `hostTop: 0`, `wcH: 720`, `win: 720`.

Verified end to end on a preview route *named to contain* `group-chat-screen` (the substring is what the
toolbar rule keys on): toolbar absent, hamburger opens the app drawer (`mat-drawer-opened`, 280px).

## Part 20a — white strip and page scrollbar after hiding the toolbar
Hiding the toolbar exposed a shell assumption:
```
.mainscreen { height: calc(100vh - clamp(40px, 7.4vh, 64px)); }
```
It subtracts the toolbar's height **unconditionally**. With the toolbar gone the container stayed ~64px
short — that gap was the white strip under the screen — while the chat, which sizes itself to
`innerHeight - hostTop` (now 0), was a full 100vh **inside** that shorter container. Hence the page-level
scrollbar on the right: the routed screen was taller than its own parent.

Fix, in the shell rather than the screen (the shell is what is wrong):
- the toolbar's inline `*ngIf` chain moved into a **`showToolbar` getter** on AppComponent, so the rule
  lives in one place instead of being duplicated;
- `.mainscreen` takes `[class.no-toolbar]="!showToolbar"`, and `.mainscreen.no-toolbar { height: 100vh }`.

Any future full-window screen gets this for free by adding its route to `showToolbar`.

Verified: `scrollHeight - clientHeight` is **0 on both axes**, `.mainscreen` is 720 of a 720px viewport,
and the screen's bottom edge lands exactly on it.

## Part 20b — dark-mode placeholders
Reported as "the sidebar font is not visible in dark". Audited every text node in the sidebar first: all
of it passes (worst is 3.65:1, the white-on-blue unread badge). The culprit was **not a text node** — it
was the search box's **placeholder**, which no rule of mine covered, so it fell through to an app-wide
`#757575`. On the dark `--field` (`rgb(31,31,34)`) that is barely there.

Themed to `--ink4` for every input and textarea in the screen (the design does the same globally with
`::placeholder { color: var(--ink4) }`). `opacity: 1` is set alongside it because Firefox applies a default
placeholder opacity that would dim the token again.

Verified in dark: `rgba(235,235,245,0.32)` on `rgb(31,31,34)`.

**Worth remembering:** a contrast sweep over text nodes cannot see placeholders, `::before`/`::after`
content, or SVG fills — they need checking separately.

## Part 20c — sidebar rows simplified; dark-mode type eased
- **Dropped the kind badge ("Group"/"Archived") and the member count** from list rows. The row is back to
  two lines — name + time, preview + unread — which is what the middle line was crowding. `.wc-row-mid`
  and `.wc-row-audience` are gone; `.wc-row-cat` survives only for the demo channel rows that still carry
  a category. **Row height 65px → ~44px.**
- **Dark type eased.** Light text on a dark ground reads visually heavier than the same weight on white,
  which is what made it look clumsy. In dark only, the semibold labels (row name, thread title, bubble
  sender, active tab, panel headings) drop to weight 500 with slightly looser tracking, and
  `-moz-osx-font-smoothing: grayscale` joins the existing `-webkit-font-smoothing: antialiased`.
  Light mode is untouched.

## Part 20d — sidebar row rebuilt as one spec
"Clumsy" was the accumulation of four separate compaction passes fighting each other, not one bad value:
- a **26px avatar top-aligned** (`align-items: flex-start` + `margin-top: 1px`) against two lines of text,
  so it floated against the first line;
- **6px padding** with text nearly touching the divider;
- `.wc-row-bottom` on `align-items: flex-end`, so the unread pill sat off the preview's baseline;
- **three competing states**: a divider that vanished on hover *and* under the row after it, a `--sunken`
  hover, and an active row that was `--raised` **plus** an inset ring — a lot of movement for a list.

Replaced with a single spec: 9px 10px padding, 11px gap, **centred 36px avatar**, name 15px over preview
13.5px, time and unread aligned on their lines, the divider inset to start **at the text** (61px) and
staying put, and one flat active treatment — `--blue-tint` with the name in `--blue-text`. Row height
44px → 59px, which is what gives it air.

The placeholder went back to plain **"Search"**: with the theme and + buttons in the row, anything longer
was clipped, and the results are labelled GROUPS / MESSAGES anyway.

## Part 21 — no-access notice restored · long member lists · edit group name and picture
1. **The "contact the group admin" notice never appeared.** My own regression from Part 18b: wrapping the
   composer in `.wc-composer-card *ngIf="canMessage"` swept the notice — and the archived read-only bar —
   *inside* that card, so both were hidden by exactly the condition that should reveal them. Moved back
   out, above the card. Worth noting the pattern: a wrapper added for layout silently inherited its
   `*ngIf` to children that needed the opposite condition.
2. **Long member lists buried the rest of the panel.** The participant list is now capped
   (`max-height: 268px`) and scrolls inside itself with the themed scrollbar, so Media/links/docs, the
   deleted log and the footer stay reachable no matter the group size.
3. **Group name and picture are editable** from the info panel, gated on `canManageAdmins`:
   - a camera badge on the picture uploads to `Chat/{name}{lastModified}{size}` — the same Storage path
     `buildGroup()` uses — and writes **`group_profile`**;
   - a pencil beside the name swaps in an inline field (Enter saves, Escape cancels) writing **`group_name`**.
   Both are existing fields, so the old chat-screen picks the changes up; demo rows edit locally.

## Part 21a — participant search in group info
A filter box inside the Participants block, appearing **only once the list passes 5** so small groups are
not given a control they do not need. Case-insensitive substring on the name; the section header switches
to "Participants · 2 of 7" while filtering, and an empty result says so rather than showing a blank list.
It clears when the info panel is toggled or another group is opened, so a stale filter never hides members.

The demo group grew from 4 members to 8 so the static preview exercises both this and the scrolling member
list from Part 21.

Verified: "rao" → 2 of 7 (Divya Rao, Vikram Rao).

## Part 22 — composer is a textarea (Shift+Enter), 8 rows, and send scrolls to the bottom
1. **Shift+Enter sent instead of adding a line.** The composer was an `<input>`, which *cannot hold a
   newline* — so no key handling would have fixed it. It is now a `<textarea>` (as the design has it):
   plain Enter sends, Shift/Alt/Ctrl/Cmd+Enter insert a line break, and `preventDefault()` is called only
   on the sending path so the break is never swallowed.
2. **Grows to 8 rows.** `autoGrowComposer()` measures the computed line-height and padding rather than
   assuming pixel values, so the cap is genuinely 8 rows at any font size; past that it scrolls.
   Verified 46px → 198px.
3. **Sending did not scroll to the newest message.** Part 14 had made autoscroll conditional on the reader
   already being near the bottom — right for someone else's message, wrong for your own. A `justSent` flag
   set by all three send paths (text, attachments, voice note) forces the jump.
4. **…and the jump landed 60px short.** One `setTimeout(0)` fires while the new row is in the DOM but its
   stamp, ticks and reactions have not settled, so `scrollHeight` was still growing. `scrollToBottomSoon()`
   now scrolls across two animation frames plus 120ms/320ms follow-ups. Verified: distance from bottom
   **0px** on consecutive sends from a scrolled-up position.
5. Growing the composer shortens the thread pane, so `autoGrowComposer()` re-anchors the bottom when the
   reader was already there.

## Part 22a — composer did not shrink after sending (two stacked causes)
1. **The clear never triggered a resize.** `autoGrowComposer()` only ran from `(ngModelChange)`, and
   sending sets `draft = ''` in code, which does not fire it — so the textarea kept the inline height it
   had grown to. All four programmatic clears now go through `clearDraft()`, which also empties the DOM
   element directly (Angular has not pushed the new value into the textarea at that moment, so measuring
   there would still see the old text) and re-measures on the next frame.
2. **…and the measurement itself was wrong when empty.** With that fixed the box still stayed at 197.6px.
   Instrumenting it showed why: for an **empty** textarea, `scrollHeight` reported **543px** against a
   38px `clientHeight` — it is a `flex: 1` item measured with `height: auto`, so the browser hands back
   something close to the available column height rather than the content height. Every `Math.min(543, max)`
   therefore pinned it to the 8-row maximum. `autoGrowComposer()` now short-circuits when the value is
   empty: it clears the inline height and lets the CSS `min-height` define the resting size.

Verified: 46px idle → 152px at six lines → **46px after the send button**, and 87px → **46px after Enter**.

Worth remembering: `scrollHeight` on an empty flex-sized textarea is not a reliable content measure.

## Part 22b — message info reduced to Read and Sent
The panel had three tiers (Seen / Received / Sent) inherited from the reference design. `supportchat`
messages only carry `read_by` and `pending` — there is no delivery signal between them — so "Received"
was **empty by construction** and "Sent · not delivered" claimed something the data cannot know.

Now two tiers:
- **Read** — `read_by`, with the reader's timestamp where one exists;
- **Sent** — the group's members minus the readers (and minus the sender), i.e. the message's `pending`
  set, with no time shown since none is recorded.

`infoReceived` is deleted; `deliveredTo` stays on the model only as an empty demo field. Empty-state copy
follows the data: "Everyone has read this" rather than "Delivered to everyone".

Verified on an own message in an 8-member group: **READ · 2** (with times) and **SENT · 6**.

## Part 23 — web now records reads per message, like the Flutter app
**The gap:** per-message `read_by` was only ever seeded at send time with the sender. `markRead()` — and
`markMessagesAsRead()` in the old chat-screen — cleared only the **group-level** `last_pending`. So a read
on web was never recorded, and the Read tier of the message-info panel showed 0 for live messages unless a
participant had opened the thread in the app. The **Flutter app** is what maintains receipts today
(`chatscreen.dart`: on open it queries `messages where pending array-contains uid` and writes
`read_by: arrayUnion(uid)` + `pending: arrayRemove(uid)`; `updateRecipient()` does the same per message).

**Now matched on web.** Opening a group:
- group doc → `last_pending` drops me **and** `pendingcount.{uid}` is deleted (the app's per-user unread
  counter — leaving it would keep a stale badge in the app);
- every message whose `pending` contains me → `read_by: arrayUnion(me)`, `pending: arrayRemove(me)`,
  in `writeBatch`es of 400, looping up to 5 rounds so threads with more unread than one batch are covered.

Messages that arrive **while the thread is open** are receipted too, mirroring the app's listener. A
`markedRead` set guards it: without that, the write's own snapshot would look unread again and loop.
The set is cleared when the subscription switches threads.

**Not changed, deliberately:** sending from web does *not* `increment` `pendingcount` the way the app does
(`chatscreen.dart:983`). So the app's badge will not count web-sent messages. That is pre-existing — the
old screen never wrote it either — and it is a send-path change rather than the read behaviour asked for.
Flagged for a decision.

**Cost note:** with the thread unpaginated, opening a very unread group issues one query plus up to
`ceil(n/400)` batch commits. Fine at current volumes; it is the same shape as the app's behaviour.

## Part 24 — Channels brought into this screen

**Goal:** the Channels tab, parked since Part 12, now carries the real broadcast feature from
`chat-screen`, rendered in the console design rather than the old one.

### What a channel actually is
Same `supportchat` collection as a group, separated only by `type`. Two things differ, and both drove
the implementation:

1. **Channels are an archive, not a conversation.** `chat-screen` fetched them with `getDocs` in pages
   of 10 and never attached a listener; broadcasts only ever grow at one end and never change after
   they land. Kept that: `loadChannels()` and `loadBroadcasts()` are one-shot reads with cursors, and
   `openItem()` skips `subscribeMessages()` for a channel.
2. **Membership is a `profile_data` DOC ID, not a uid.** `ChannelCommunication.createChannel()` writes
   `members: adminIds` where those are profile ids, and `read_by` / `pending` on each broadcast are the
   same. The group filter is `members array-contains <uid>` — which matches **nothing** on a channel.

   **That is a live bug in the old screen:** a non-admin could never see a channel there. Fixed here by
   filtering channels on `currentProfileDocId`. Platform admins were unaffected (their filter is empty),
   which is presumably why it went unnoticed. Worth fixing in `chat-screen` too — not done, out of scope.

Because of (2) there is now a `profileByDocId` map alongside `profilesByUid`. They are **not**
interchangeable; `nameOfProfileDoc()` / `photoOfProfileDoc()` exist so the two identifiers never get
crossed.

### The broadcast card
A broadcast doc is a card, not a chat line: `htmlbody`, `headertype`/`headervalue`, `footer`, `files[]`,
`links[]`, `buttons[]`, plus the `members`/`read_by`/`pending` audiences. All of it lands on
`ChatMessage._broadcast`, so the bubble renderer is never handed raw HTML — the card is a separate
branch in the `*ngFor` (`#chatMessage` wraps the announcement/bubble pair as the else).

Rendered full width (max 720px) rather than in a bubble, because header media and CTAs read badly
squeezed into one. `[innerHTML]` is Angular-sanitised, which is what makes rendering stored markup safe;
`.wc-bc-body` additionally clamps `img/video/iframe/table` so a template's own styling cannot break the
thread layout.

### Sending
Two steps, exactly as `chat-screen` had them: pick the audience here, then hand the profile ids to
`ChannelCommunicationComponent`, which owns the template picker, variable filling and the write to
`channelarchive`. **That contract is untouched** — this screen only feeds it. "New channel" (the `+` on
the Channels tab) opens the same dialog, whose first step creates the channel; duplicating that form
would have meant duplicating its `admins` contract.

`canBroadcast` gates on the channel's own `admins`, falling back to platform `chatxadmin`/`admin` when
the array is empty (channels predating the field would otherwise be frozen) — the same legacy escape
hatch `canMessage` uses for `group_admin`.

### Deliberately left alone
- **No unread count on channels.** Nothing writes `last_pending` on a channel doc, so the badge would be
  invented. Per the standing schema rule, it stays 0.
- **Channel messages are excluded from search.** Broadcasts have no `message_search` field and their body
  is HTML; `runMessageSearch()` now filters channels out rather than returning silent misses.
- **No reactions, replies, edit, delete or bulk-select on a broadcast.** `actionsFor()` returns only Copy,
  Raise ticket and Delivery for one, and `onBubbleDblClick()` refuses to enter select mode. It is an
  archive written by a send job; nothing on this screen should rewrite it.
- **`followers` is gone from the UI.** It was a demo-only field with nothing behind it; the header, the
  intro card and the info panel all count `members` now.

### Also fixed this session
Long unbroken strings (a pasted URL, an unspaced keyboard-mash) pushed straight out of the message card —
one "word" that CSS refused to break. `.wc-bubble` now sets `overflow-wrap: anywhere; word-break:
break-word`. `anywhere`, not `break-all`, so normal text still breaks on spaces first. Verified: a
130-character unbroken string wraps at 583px inside the 640px cap, and `scrollWidth === clientWidth` on
the message pane (no horizontal overflow).

### Verified
Temporary unguarded route, demo data (a broadcast-shaped demo message was added so the static path
exercises the same card). Channels tab lists and opens; the card renders header/body/file/link/CTA/footer
and the delivery bar; the delivery slide-over switches Read / Pending / Sent; the audience picker opens
and gates Continue on a selection; the archived sub-tab shows deleted channels; all of it re-themes
correctly in dark mode. Route removed afterwards. **No live channel path has been exercised** — `ng serve`
still points at `fir-sample-aae4a`, which is production.

## Per-screen revert guide — Part 24 (channels)
1. **Channels tab** — re-comment `{ k: 'channels', label: 'Channels' }` in `TABS`. Everything else can
   stay; with no tab there is no way to reach it.
2. **Channel loading** — delete the `/* ── Channels ── */` block in the `.ts` (`loadChannels`,
   `mapChannelDoc`, `nameOfProfileDoc`, `photoOfProfileDoc`, `loadBroadcasts`, `mapBroadcastDoc`,
   `isBroadcast`, `reloadChannels`, `showChannelPaging`) and the two `loadChannels(...)` calls in
   `bootstrapLive()`.
3. **Broadcast card** — delete the `<div class="wc-bc" *ngIf="m._broadcast as b; else chatMessage">`
   block and unwrap the `<ng-template #chatMessage>` around the announcement/bubble pair.
4. **Broadcast bar + audience picker** — delete `.wc-broadcastbar` from the template, the
   `<ng-container *ngIf="audienceOpen">` dialog, and `openAudience`/`proceedBroadcast`/`openChannelCreate`
   and friends. Drop the `ChannelCommunicationComponent` import.
5. **Delivery panel** — delete the `*ngIf="broadcastInfo as bm"` slide-over and
   `openBroadcastInfo`/`broadcastAudience`/`broadcastCount`.
6. **CSS** — remove `.wc-loadmore`, `.wc-row-badge`, `.wc-bc*`, `.wc-broadcastbar*`, `.wc-audience-*` and
   the `.wc-channel-emoji` rewrite.
7. **Long-word wrap** (independent of channels — keep unless it is the thing being reverted) — remove
   `overflow-wrap: anywhere; word-break: break-word` from `.wc-bubble`.

## Part 24b — channel follow-ups: pink accent, no ticket on a broadcast, and why broadcasts were blank

**Pink accent.** Channels now run on the existing pink ramp instead of blue. Rather than restyle ~280
selectors, `.wc.channels` re-points the accent tokens (`--blue*`, `--accent*`) at the `--amber*` ramp,
which is already pink in both palettes — so one rule re-themes the whole Channels surface, sidebar
through dialogs, and dark mode comes free. `--amber-hover` was the only token missing; added to both
palettes. The class is driven by `channelTheme`, which also covers Archived → Channels. Groups stay blue.

**No "Raise ticket" on a broadcast.** A ticket is raised *against something a participant said*; a
broadcast is outbound, so there is no participant on the other end of it to open a ticket about. The
broadcast hover menu is now Copy and Delivery only.

### Broadcasts not rendering — what was actually verified
`supportchat/{channelId}/messages` **does** hold broadcast documents: `channel-record.component.ts` reads
and writes them (`messageid`, `buttons`, `button_clicks`, `read_by`, `follow_up`, `followup_medium`), and
confirms `read_by` holds **profile ids**, matching what this screen assumed. So the collection path is
right. What is *not* verifiable from this repo is the document's field spelling — the fan-out job that
writes them lives elsewhere; `ChannelCommunication.onSend()` only writes `channelarchive` and stamps
`members`/`last_modification` on the channel doc.

Three ways that can render nothing, all now handled rather than guessed at:

1. **`orderBy('time','desc')` silently drops every document that lacks a `time` field.** An unstamped or
   differently-named timestamp turns a full subcollection into an empty page — indistinguishable from an
   empty channel. If the first page comes back empty, the read is retried **unordered** (wider page, 60)
   and sorted client-side; when that rescues documents it logs the actual field names of the first one,
   so the real spelling is one console line away. Paging is disabled on that path — without an order
   there is no meaningful cursor.
2. **A card with an empty body.** `htmlbody` is now tried, then `html_body`, then `textbody`/`text_body`/
   `message`, with the plain fallback rendered as text rather than markup. The timestamp falls through
   `time` → `createdat` → `created_on` → `senton`. A plainly-rendered card beats a blank one.
3. **One document per recipient.** `channel-record` queries these by `messageid` and *iterates* the
   result, so a broadcast is not guaranteed to be a single document. The page is now collapsed by
   `messageid` — one card per send whether the job writes one doc or two hundred.

Empty-state copy for a channel is now "Nothing has been broadcast on this channel yet" rather than the
group's "say something", so a genuinely empty channel reads as empty rather than broken.

**Still open:** if a channel is still blank after this, the console line from (1) names the fields on the
real document and the mapper can be pointed at them directly. That needs one look at live data, which
cannot be done from here — `ng serve` points at `fir-sample-aae4a`, which is production.

### Revert guide — Part 24b
- **Pink accent:** delete the `.wc.channels` token block and the `--amber-hover` lines; remove
  `[class.channels]="channelTheme"` from the root `div.wc` and the `channelTheme` getter.
- **Ticket action:** re-add the `{ k: 'ticket', … }` row to the `_broadcast` branch of `actionsFor()`.
- **Read fallbacks:** in `loadBroadcasts()` drop the `if (!more && snap.empty)` retry and the
  `byId`/`page` de-duplication; in `mapBroadcastDoc()` drop the `html`/`plain` fall-throughs and the
  `??` chain on the timestamp.

## Part 24c — broadcast bodies were being rendered, then shrunk to nothing

Not a data problem. The broadcasts were loading correctly all along — right count, right senders, right
timestamps — but every card was collapsed to its 23px header and the body clipped away, with the odd
image or line of text bleeding out past the card edge.

**Cause:** `.wc-messages` is `display: flex; flex-direction: column`. A flex item is normally protected
from shrinking below its content by the automatic minimum size (`min-height: auto`) — **but that
protection is switched off for any box whose `overflow` is not `visible`.** `.wc-bc` sets
`overflow: hidden` so the header media can be clipped to the card's rounded corners, which silently
opted every card out of that protection. Once the thread grew taller than the pane, the column shrank
all of them proportionally, to almost nothing. Chat bubbles were unaffected because they keep
`overflow: visible`.

**Fix:** `flex-shrink: 0` on `.wc-bc` (and on `.wc-loadmore.inline`, same exposure).

**Measured, both ways, with twelve cards in an overflowing pane** (`scrollHeight` 4423 vs `clientHeight`
599): with the default `flex-shrink: 1` every card measured **23px** — exactly the header-only strips in
the report; with the fix, every card measured **341px**. That is the whole of it.

Worth remembering, because it will bite again: `overflow: hidden` on a flex item is not a purely visual
choice — it removes the item's automatic minimum size, so the item becomes freely shrinkable. Any future
full-width card in this thread needs `flex-shrink: 0` alongside its `overflow: hidden`.

The Part 24b fallbacks (unordered re-read, body/timestamp field fall-throughs, de-duplication by
`messageid`) were not what fixed this. They stay: each guards a real failure mode, they cost nothing on
the happy path, and the unordered retry only ever fires on an otherwise-empty page.

### Revert guide — Part 24c
Remove `flex-shrink: 0` from `.wc-bc` and `.wc-loadmore.inline`. Nothing else changed.

## Part 25 — editing a channel, and the info hero finally stacks

### Editing name, picture, description and admins
All four are fields the channel document already carries — nothing new is introduced, this is the same
doc ChannelCommunication writes at create time, edited later.

| What | Field | Notes |
|---|---|---|
| Name | `group_name` | Same field and edit path as a group |
| Picture | `group_profile` | Uploaded to `channel-images/{ts}_{name}` — where ChannelCommunication puts them — not the group's `Chat/` path, so both screens read the same image |
| Description | `description` | Channels only; groups have no such field, so no edit affordance appears for them |
| Admins | `admins` | Profile doc ids, picked from the same directory the audience picker uses |

Permission is `canManageChannel`: the channel's own `admins`, falling back to platform
`chatxadmin`/`admin` when that array is empty, and false once archived. `canBroadcast` now delegates to
it — broadcasting and editing are the same authority, "who runs this channel". `canEditChat` is the one
gate the template asks, resolving to `canManageAdmins` for a group and `canManageChannel` for a channel.

Two rules worth stating because they are enforced, not assumed:
- **A channel cannot be left with zero admins.** ChannelCommunication refuses to create one that way;
  the same has to hold on edit, or the channel becomes unrunnable by anyone but a platform admin.
- **Saving admins unions them into `members`.** The Recipients list — and therefore the ADMIN pill — is
  driven by `members`, so an admin who is not a recipient would be invisible in the panel.

Every channel write also updates the in-memory item. Channels have no listener (Part 24), so without
that the change would not appear until a reload.

### The info hero was never actually a column
Reported as "the editing options are not aligned and the name is on the right, it should be below".
`.wc-slide-hero` was `text-align: center` over **inline** boxes: `.wc-slide-photo` was `inline-block`
and `.wc-slide-name` `inline-flex`, so the 64px avatar and the name laid out on the same line, and each
edit pencil (`.wc-slide-editbtn`, itself `display: flex`) landed wherever the inline flow dropped it —
which is why the description's pencil sat alone on the line below.

Three fixes, and they apply to **groups as well as channels**, as asked:
- `.wc-slide-hero` is a real `flex column` with `align-items: center`.
- `.wc-slide-photo` is `display: block; width: 64px; margin: 0 auto`, so the camera button anchors to
  the circle rather than to a shrink-wrapped inline box.
- `.wc-slide-emoji` is always a 64px circle, picture or not. Previously only `:has(img)` sized it, so a
  chat with no picture collapsed to a bare icon and the camera button landed on top of the name.
- `.wc-slide-desc` is a centred flex row, so its pencil sits after the text.
- `.wc-slide-rename` needs `align-self: stretch`, or the column's `align-items: center` shrinks the
  rename input to its content width.

Verified by measurement, not eyeballing: `nameTop (145) >= photoBottom (137)` — genuinely stacked.

### Colour on the tab bar
The active tab was a neutral `--panel` pill. It now takes `--blue-tint` / `--blue-text` with a
`--blue-line` inset border — which, because `.wc.channels` re-points those tokens (Part 24b), renders
**blue on Groups and pink on Channels** from one rule, with Archived following whichever sub-tab is
selected. Verified in both palettes.

### Revert guide — Part 25
1. **Channel editing:** delete `canManageChannel`/`canEditChat` (restore `canBroadcast`'s original
   body), the description block (`editingDesc`, `descDraft`, `startEditDesc`, `cancelEditDesc`,
   `saveChannelDesc`) and the admin picker (`adminsOpen`…`saveChannelAdmins`); revert the `canEditChat`
   gates in the template back to `canManageAdmins`; delete the description row, the `Admins` button and
   the `*ngIf="adminsOpen"` dialog; drop `.wc-slide-adddesc` and `.wc-note-inline`.
2. **Picture path:** in `onGroupPhotoPicked` drop the `isChan` branch, leaving the `Chat/` path.
3. **Hero layout:** restore `.wc-slide-hero { text-align: center }`, `.wc-slide-photo { display:
   inline-block }`, `.wc-slide-emoji:has(img)`, the block `.wc-slide-desc`, and remove `align-self:
   stretch` from `.wc-slide-rename`. **Note this reverts the group panel too** — the bug was shared.
4. **Tab colour:** restore `.wc-tab.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px
   3px rgba(0,0,0,.10); }`.

## Part 26 — brand palette (#00AEEF / #EC008C) and a conditional cap on the member list

### The palette
Operator supplied the brand colours: **#00AEEF blue, #EC008C pink**. Both are now used *exactly as
given* for fills, borders, badges and tints. What could not be kept as-is was the **foreground on
them**, and that is worth recording because it is the whole design decision:

```
white on #00AEEF   2.53 : 1     unreadable
white on #EC008C   4.25 : 1     borderline (AA small text wants 4.5)
dark ink on #00AEEF 6.28 : 1    fine
```

So the accent stayed the brand hex and `--on-accent` became conditional instead: **dark ink
(`#0B2530`) under the blue theme, white under the pink one** — `.wc.channels` already re-points the
accent tokens, so it re-points the foreground with them. The alternative — darkening the accent to
`#007FAE` so white would work — was rejected: it moves the brand colour, which is the one thing that
was specified.

Neither brand hex is legible as *small text on white*, so the `-text` shades are derived, not brand:
`--blue-text: #0076A3` (5.10 on white, 4.53 on its own tint) and `--amber-text: #C90077` (5.60 / 4.56).
`--blue-text` was deepened once after the first audit measured 4.01 on `--blue-tint`.

`.wc-selectbar` had `border-color: rgba(255,255,255,.4)` hard-coded on three children — it assumed a
white foreground on the accent fill, which is no longer true under the blue theme. Those now use
`currentColor`, so they follow `--on-accent`.

**Audited, both palettes, after the change** — every pair ≥ 4.5:1 except two, stated plainly:
- `white on #EC008C = 4.25` — that is the brand hex as supplied. Deepening the *fill* alone to
  `#E00085` reaches 4.66 and is visually indistinguishable; not done unilaterally, since the operator
  named the colour. One token, one line, if wanted.
- `blue-text on blue-tint = 4.53` — passes, but with no headroom; if the tint is ever lightened, re-check.

### Member / recipient list: capped only when something sits below it
Asked for: limit the height of the Recipients (channels) and Members (groups) list, *but show it in
full when there is no media section*.

`.wc-memberlist` no longer caps unconditionally. The cap moved to `.wc-memberlist.capped`, applied via
`[class.capped]="hasMediaBlock"`, where `hasMediaBlock` is the **same condition the Media/links/docs
block's own `*ngIf` uses** (`threadAttachments.length || threadLinks.length`) — so the two can never
disagree. The channel recipients list, which had no wrapper at all, now uses the same one.

The reasoning: the cap exists to stop a long member list burying the section beneath it. With nothing
beneath it, a cap only adds a second scrollbar inside a panel that already scrolls.

Verified both ways on demo groups: one with a link CTA → Media block present → `capped: true`,
`max-height: 268px`; one with no attachments or links → no Media block → `capped: false`,
`max-height: none`.

### Revert guide — Part 26
1. **Palette:** restore the previous `--blue*` / `--amber*` lines in both the `:host` and dark blocks,
   set `--on-accent:#FFFFFF`, delete the `--on-accent` override in `.wc.channels`, and put the three
   `rgba(255,255,255,.4)` borders back on `.wc-selectbar`'s children.
2. **Member cap:** fold `.wc-memberlist.capped` back into `.wc-memberlist`, drop `[class.capped]` from
   both lists, unwrap the channel recipients list, and delete the `hasMediaBlock` getter.

## Part 27 — the 14-item review list (all but #2), plus five follow-ups

#2 (Created Under / marathon→event) is deliberately untouched: the events list is hardcoded demo
data, the group document has no event field at all, and persisting one needs schema approval and a
decision on the source collection. Everything else in the list is done.

| # | Fix | Where the bug actually was |
|---|---|---|
| 1 | Info panel shrinks the chat | `.wc-slide` was `position: absolute` inside `.wc-shell`; now a flex sibling |
| 3 | Close button + Esc on the preview | Backdrop-click only, and a video swallows its own clicks |
| 4 | Create-group people picker | Search matched name only; no import, no counts, no select-all |
| 5 | Import members from a spreadsheet | Ported from chat-screen's channel import |
| 6 | Lists continue on Enter | Nothing continued them — the marker was only written at insert time |
| 7 | Paragraph spacing preserved | `parse()` dropped blank lines outright |
| 8 | Hover pill clear of the text | Sat at `top: -15px`, i.e. over the first line |
| 9 | No duplicate sends during upload | The Send *button* was disabled; the **Enter path** was not |
| 10 | One audio at a time | Every player owned an `<audio>` with no coordination |
| 11–12 | Italic, Ctrl+B, Ctrl+I | Bold existed as syntax only, with no shortcut |
| 13 | Date separators stop overlapping | Every `.wc-day` stuck at `top: 0` in the same container |
| 14 | Member search | Existed but hid below 6 members, and never on Team |

### The three worth remembering

**#13 — sticky containment, not z-index.** Each `.wc-day` was a direct child of the scroller, so every
one of them stuck at `top: 0` and they piled up. Fixed structurally: messages are now grouped into a
`.wc-daygroup` per day (`visibleDays`), so each separator's sticky range is its own day and they hand
over as you scroll. Note the CSS moved from `.wc-messages > .wc-msg` to `.wc-daygroup > .wc-msg` — the
direct-child combinators would otherwise have silently stopped matching. Verified with two days
present and the pane scrolled to the bottom: no overlapping rectangles.

**#9 — the guard was on the wrong control.** `[disabled]="uploadingFiles"` on the Send button looks
like it covers sending, but `onComposerKeydown` calls `send()` directly. The guard now lives in
`send()` itself, where both paths go through it.

**#7 — blank lines were being discarded, not collapsed.** `parse()` had `if (line.trim())`, so an empty
line produced no block at all, and `splitCtas` squeezed `\n{3,}` to `\n\n` before that. A blank line
now emits a `gap` block. Runs longer than two are still capped so a scroll of newlines cannot stretch
a bubble indefinitely.

**#6** is authoring-only, worth being precise about: a *sent* message already numbered correctly, because
consecutive `N.` lines are parsed into one `<ol>` and HTML renumbers them. What was missing was the
composer continuing the list. Enter now continues `- ` / the next number, renumbers the run below the
insert (so an insert never leaves 1,2,2,3), and an empty marker ends the list.

### Follow-ups raised during the work

- **Link buttons render like WhatsApp.** Moved from inline chips inside the text to full-bubble-width
  rows attached at the bubble's foot. They stay *inside* `.wc-bubble` and cancel its padding with
  negative margins — the first attempt put them after the bubble, where `.wc-bubble-line`'s flex row
  laid them out *beside* it.
- **Image viewer.** Zoom (buttons + wheel, 25%–600%), rotate in 90° steps, reset, open-original, and
  drag-to-pan once zoomed. Aspect ratio is now always honoured: the `object-fit: cover` on the portrait
  variant was squaring off non-square profile pictures, which was the reported distortion. Zoom and
  rotation are a transform layered on top, so the source ratio is never altered.
- **Posting now requires being a group admin.** The `if (!(a.adminUids||[]).length) return true`
  exemption is gone. It existed so pre-`group_admin` groups would not freeze, but its effect was that
  *any member* could post in one — the opposite of the rule. **Consequence, stated plainly: every group
  with an empty `group_admin` is now read-only until someone is made an admin.** A `developer` can
  always appoint the first one (`canManageAdmins`), so no group is permanently stuck.
- **Member search is always visible** and matches name or email, on both Team and Participants.

### Italic marker — a cross-client note
Italic is `_text_`, chosen because bold is single-`*` (operator's earlier call). The **Flutter app
renders `message` as plain text** — link detection only, no markdown — so participants see `_word_`
and `*word*` literally. That is pre-existing for bold; italic widens it by one marker. Worth agreeing
the syntax with whoever owns the app.

### Verified
Temporary unguarded route, demo data. Measured rather than eyeballed where it mattered: list
continuation (1→2→3), renumbering on a mid-list insert (`1. one\n2. \n3. two\n4. three`), bullets,
empty-marker exit, `Ctrl+B → *bold*`, `Ctrl+I → _italic_`, two day pills with **no overlap** scrolled
to the bottom, hover pill intruding 6px against 8px of bubble padding with `scrollWidth === clientWidth`
(the old horizontal-scrollbar regression has not returned), and a 900×300 image opening at exactly
3.00 ratio then zooming to 150% and rotating 90°.

### Revert guide — Part 27
Each is independent:
1. **Info panel:** restore `.wc-slide { position: absolute; … }` and delete the `max-width: 1100px`
   block and the `.wc-slide.msginfo, .wc-slide.person` overlay rule.
2. **Preview:** delete `.wc-lightbox-close`, `.wc-viewer-bar`, the viewer state block
   (`lbScale`…`endPan`) and `onEscape`; restore `object-fit: cover` on `.wc-lightbox img.portrait`.
3. **Composer:** delete `continueListOnNewline`, `renumberFrom`, `setDraftAndCaret` and the Ctrl+B/I
   branch in `onComposerKeydown`; drop `'italic'` from `applyFormat` and the `Seg` union, the italic
   arm of `inlineTokenRe`/`renderInline`, and the `<em>` in the template.
4. **Spacing:** restore `if (line.trim())` alone and `\n{3,} → \n\n`; delete the `gap` block type.
5. **Send guard:** remove `if (this.uploadingFiles) return;` from `send()`.
6. **Audio:** delete the static `players` set, `stopOthers`, and the two lifecycle hooks.
7. **Dates:** unwrap `.wc-daygroup`, restore the `*ngIf="m._dayLabel"` separator inside the message
   loop, and put the `.wc-messages > .wc-msg` selectors back.
8. **Hover:** restore `top: -15px`.
9. **Link buttons:** restore the old inline `.wc-ctas` chip styles.
10. **Admin gate:** re-add `if (!(a.adminUids || []).length) return true;` to `canMessage`.
11. **Picker/import:** delete `onMembersImport`, `downloadImportSample`, `emailOf`,
    `selectAllCreateShown`, the `xlsx` import and the `.wc-pickbar` / `.wc-importnote` markup and CSS.

### Part 27b — admins first in every member list
One shared `adminsFirst()` helper orders admins to the top and everyone else after, each half
alphabetical. Applied to all three lists so they behave identically: group Participants
(`isGroupAdmin`), group Team, and channel Recipients (`isChannelAdmin` — profile doc ids, not uids).
Search filters first, then the ordering applies, so a search result is ordered the same way.

Verified: in a 7-member demo group the last name alphabetically (Vikram Rao) was made an admin and
moved to the head of the list, the remaining six staying alphabetical.

**Revert:** delete `adminsFirst()` and return the plain filtered lists from `filteredParticipants`,
`filteredTeam` and `channelRecipients`.

## Part 28 — the second review list (five items)

### The double box was a specificity tie
`.wc-field input, .wc-field select, .wc-field textarea` gave *every* input inside a `.wc-field` its
own border, radius, 40px height and background — including the `<input>` sitting inside `.wc-search`,
which already draws all of those. A bordered pill inside a bordered pill.

`.wc-search input { border: none; background: transparent }` existed and should have won, but both
selectors are `(0,1,1)` and `.wc-search input` is declared **earlier**, so source order handed it to
the `.wc-field` rule. Fixed by scoping the `.wc-field` rule to `> input` and
`:not(.wc-search) > input` rather than by piling on specificity. Only the create dialog was affected —
the admin and audience pickers put their search in `.wc-dialog-sub`, not `.wc-field`.

### Import now serves both pickers, and reports properly
`onMembersImport(event, target)` takes `'create' | 'add'`. The target decides which **pool** it matches
against as well as which selection it fills, and that distinction carries real information: in the
Add-members dialog the pool excludes existing members, so a row naming someone already in the group is
reported as **"Already in this group"** rather than the misleading "No matching profile".

The report used to keep a display string per skipped row (`row.name || row.email || '(blank row)'`),
which made a download worthless. It now keeps the original row — sheet row number, name, email and the
reason — so `downloadSkipped()` can write a real `members_not_found.xlsx` to hand back to whoever
produced the file. The list shows five rows and scrolls, with **Show all N** for the rest; a bad file
can produce hundreds and the panel must not become the dialog.

Row numbers are `i + 2` — one for the header, one for 1-based rows — so they match what the operator
sees in Excel.

### One piece of media at a time
The previous fix was a `static` Set on `ChatAudioComponent`, which could only ever see other audio
players. Videos are plain `<video>` elements in the thread template, so they were invisible to it.

Replaced with `MediaPlaybackService` (root-provided), which both kinds register with. Deliberately keyed
on the **element**, not the component: a `<video>` created and destroyed by `*ngIf` then needs no
lifecycle wiring at all, just `(play)="onMediaPlay($event)"`. Muted elements are ignored on both sides —
the composer preview and the info-panel media grid are silent thumbnails, so they neither interrupt
anything nor deserve interrupting. Switching threads and destroying the screen both `pauseAll()`.

### Ctrl+Z — a regression I introduced, now fixed at the cause
A textarea has native undo for free. `setDraftAndCaret` assigned `el.value` directly (list
continuation, bold/italic) and the mention helpers assigned `this.draft`; **any programmatic `value =`
wipes the browser's undo stack**, so undo had nothing to go back to after a formatting action.

Rather than hand-roll an undo stack — which then has to coalesce ordinary typing into sensible units,
and is where these start feeling wrong — programmatic edits now go through `replaceRange()`, which
selects the range and calls `document.execCommand('insertText')`. That is deprecated but is still the
only API that records an edit as *undoable*; `setRangeText` does not. Where it returns false we fall
back to a direct assignment and accept the lost undo step rather than lose the edit.

`pickMention` also got tighter: it now replaces only the half-typed `@na` token instead of rewriting
everything before the caret, which makes for a smaller, more sensible undo step.

### Verified
Temporary unguarded route, demo data.

- **Double box** — gone; the members field is a single pill with Import beside it.
- **Import (create)** — a CSV of 2 real names + 6 ghosts reported "2 matched and selected, 6 not
  found", listed 5 rows with the right Excel row numbers, and **Show all 6** expanded to 6.
- **Import (add members)** — 1 matched; "Arjun Menon" (already a member) correctly reported as
  *Already in this group*, distinct from the ghost's *No matching profile*.
- **Media** — recorded a real webm and generated two WAVs, then measured both directions:
  audio playing → start video ⇒ **audio paused, video playing**; video playing → start audio ⇒
  **video paused**. Only ever one element unpaused.
- **Ctrl+Z** — the *mechanism* is proven: `execCommand('insertText')` returns **true** (so
  `replaceRange` takes the undoable path, not the fallback), `queryCommandEnabled('undo')` is true
  after a programmatic edit, and `undo` rewinds `hello *world*` → `hello world` with `redo` restoring
  it. **The keystroke itself could not be exercised** — the automation's synthetic Ctrl+Z and Cmd+Z do
  not trigger native undo even for plain typing this code never touched, which is a harness limit, not
  a code one. Worth one human keypress to confirm end to end.

### Revert guide — Part 28
1. **Double box:** restore `.wc-field input, .wc-field select, .wc-field textarea` and the matching
   `:focus` rule.
2. **Import:** drop the `target` parameter from `onMembersImport`, revert `importReport` to
   `{matched, skipped: string[]}`, delete `downloadSkipped`, `skippedShown`, `showAllSkipped`, the
   `#importReportPanel` template and the `.wc-skiplist` styles; remove the pickbar from the
   add-members dialog.
3. **Media:** delete `media-playback.service.ts`, restore the static `players` set and `stopOthers` on
   `ChatAudioComponent`, and remove the three `(play)="onMediaPlay($event)"` bindings plus
   `onMediaPlay` and both `pauseAll()` calls.
4. **Undo:** replace `replaceRange` with the old `setDraftAndCaret` (direct `el.value = next`) and
   restore the three mention helpers to assigning `this.draft`. Note this reintroduces the Ctrl+Z
   breakage.

## Part 29 — bullets, voice-note review, and confirming the paragraph fix

Three of the ten review items. The rest were ruled out by the operator: #1 (admin gating is conditional
by design), #2 (Created Under, parked), #4 (notification from web — operator taking it), #5 (mobile
self-notification, on signal), #9 (link not shown in the app, app-side, on signal). #6 (`*bold*` /
`_italic_` arriving literal in the app) is the same class as #9 — the app renders `message` as plain
text — so it is deferred with it.

### #7 — a real bullet, not a hyphen
`applyFormat('ul')` now inserts `• ` instead of `- `. Small change, chosen for a specific reason: the
Flutter app renders `message` verbatim, so `- item` arrives as "- item" while `• item` reads as a
bullet with no app change at all. The parser already accepted `[-•]`, and `continueListOnNewline`
repeats whichever marker the line started with, so existing `-` lists keep working.

**Verified:** the toolbar button on a two-line selection produced `"• alpha\n• beta"`, and sending it
rendered a real `<ul>` with two `<li>`s.

### #8 — already fixed, evidence attached
The report predates Part 27, where `parse()` was discarding blank lines outright. Sending
`Para one.\n\nPara two…\n\n\nPara three…` now produces **one** `.wc-gap` after the first paragraph and
**two** after the second — spacing is proportional, not collapsed. Nothing further was changed.

The one residual, unchanged: runs of four or more newlines are still capped at three, so a scroll of
blank lines cannot stretch a bubble indefinitely.

### #10 — voice notes: pause, and review before sending
Previously one state and one irreversible action: press stop and it was sent, with no way to hear it
first. Now three states — **recording → (paused) → review**:

- `pauseRecording()` / `resumeRecording()` wrap `MediaRecorder.pause()`/`resume()` and stop the
  seconds counter while paused, so the timer reflects captured audio rather than wall clock.
- The stop button no longer sends. `stopForReview()` builds the blob and hands it to a review bar that
  replaces the text box: the existing `app-chat-audio` player for playback, plus **discard**,
  **record again**, and **send**.
- `finishRecording()` now sends the reviewed clip. It clears `recReview` and revokes the object URL
  *before* the upload, so the composer returns to normal at once and a second Send finds nothing left.
- Object URLs are revoked on discard, on send, on thread switch and in `ngOnDestroy` — an unrevoked one
  holds the whole clip in memory.
- Switching threads cancels a recording in progress and discards an unsent clip, rather than carrying
  audio recorded for one group into another.

**Not verified end to end:** the Browser pane blocks microphone access (`getUserMedia` →
`NotAllowedError`), so the record → pause → review → send loop could not be driven here. The code
type-checks and builds; the loop itself needs a human with a working mic. Also worth noting
`MediaRecorder.pause()` needs Safari 15+, which is well below the app's floor but is the one
compatibility edge in this change.

### Revert guide — Part 29
1. **Bullets:** change `• ${l}` back to `- ${l}` in `applyFormat`, and the toolbar hint.
2. **Voice notes:** delete `recPaused`, `recReview`, `sendingRecording`, `pauseRecording`,
   `resumeRecording`, `stopForReview`, `discardRecording`, `reRecord`; restore `finishRecording` to
   stopping the recorder and sending in one pass; restore the composer's recording block to the
   discard + send pair; drop `.wc-rec-btn`, `.wc-rec-preview` and the `.paused` rules; remove the
   `discardRecording()` calls from `openItem` and `ngOnDestroy`.
3. **#8** was not touched in this part.

## Part 30 — participant picker says what it shows

Operator decision on the "only 2366 participants" report: **keep the `user_ref` filter**. So the
picker was never truncating — it was silent about its own rule, and a bare "2366" reads as a cap.

The rule is not arbitrary. `members` on a `supportchat` document is an array of **uids**, so a profile
with no `user_ref` cannot be stored as a member at all. And it would be pointless if it could: that
person has never signed in, so they have no device and no FCM token — they could neither open the
chat nor be notified. Including them would mean selecting recipients who cannot receive.

Changed: the count now reads "N with an app account" rather than "N people", with a one-line note
below it in the create dialog explaining that a chat member is identified by their login. The
add-members dialog shows the same eligible count beside its selected count.

The alternative — moving membership to profile ids — was rejected for the reason above, and would
have touched the web, the old chat-screen, the Flutter app (`members`, `pending`, `read_by`,
`pendingcount` are all uid-keyed) and `ChatxNotification`, plus a backfill of every existing chat.

**Revert:** restore the `createPool.length + ' people'` text, delete the `.wc-picknote` block and its
styles, and remove the eligible-count span from the add-members dialog.

## Part 31 — drafts are per chat, and persisted

**The bug:** `draft` was a single field on the component and `openItem()` never touched it. Typing a
message, then opening another group, carried the text across — and the next Enter would have sent it
to the wrong people. That is the failure mode worth naming: not lost work, but a message delivered to
an audience it was never written for.

**Now:** each chat owns its draft, mirrored to `localStorage` so closing the tab does not lose it.

- **Scoped by uid** (`groupChatDrafts:<uid>`). A shared machine must not show one person's unsent
  message to the next. The key is read at access time rather than cached, because the uid is not
  known until the live bootstrap finishes — hence the second `loadDrafts()` there.
- **Every access wrapped.** `localStorage` throws outright in private mode and does not exist under
  SSR — the same reasoning as `restoreTheme()`.
- **Saved while typing, debounced 400ms.** Stashing only on a thread switch would still lose the
  message if the tab were closed mid-sentence. `clearDraft()` and `stashDraft()` both cancel the
  pending timer first, or a queued save would write the text back moments after it was sent.
- **An edit in progress is not a draft** — it belongs to one specific message, so switching chats
  cancels the edit rather than stashing its text as the chat's draft.
- **Capped at 8000 chars** so a runaway paste cannot fill the origin's storage quota.
- Also stashed in `ngOnDestroy`, so leaving the screen keeps what was typed.

**Sidebar hint.** Rows now show a red **Draft:** prefix with a preview instead of the last message,
for any chat other than the open one. Not asked for, but it serves the actual complaint directly: the
danger was an invisible draft in a group you were not looking at.

### Verified
Typed in group A → stored as `{"up-chennai-cohort":"draft for group A"}`; opened B → **composer
empty**, A's row showed *Draft: draft for group A*; typed in B, returned to A → A's text restored
intact. Sending from A removed **only** A's entry, leaving B's. After a full page reload B's draft was
still present in both the sidebar hint and the composer.

### Also fixed — link form invisible in the light theme
`.wc-linkform-row input` set a border and a text colour but **no `background`**, so it fell through to
the app-wide input style, which is dark: dark boxes with near-invisible text in light mode. This is
the third instance of the same defect in this component (after the hex-only dark-mode sweep and the
`#757575` placeholder fallthrough), so a scan for every `input`/`textarea`/`select` rule that sets a
colour without a background was run — it found one more, `.wc-cat-new input`, whose markup is
currently unused. Both fixed, with explicit placeholder colours.

**Worth remembering:** in this component an input must state its own `background` and `::placeholder`.
Inheriting either means inheriting the app's global dark-field styling.

### Revert guide — Part 31
1. **Drafts:** delete `drafts`, `draftsKey`, `loadDrafts`, `saveDrafts`, `stashDraft`, `restoreDraft`,
   `hasDraft`, `draftPreview`, `blankComposer`, `draftSaveTimer` and the `DRAFTS_KEY`/`DRAFT_MAX`
   constants; remove the calls from `openItem`, `closeThread`, `switchTab`, `onDraftChange`,
   `clearDraft`, `ngOnInit`, `ngOnDestroy` and `bootstrapLive`.
2. **Sidebar hint:** restore the plain `<span class="wc-row-preview">{{ c.lastMessage || '—' }}</span>`
   and drop `.wc-row-preview.draft` / `.wc-draft-tag`.
3. **Link form:** remove the added `background` and `::placeholder` from `.wc-linkform-row input` and
   `.wc-cat-new input`. (Reintroduces the light-theme bug.)

## Part 32 — the sidebar stops loading everything  *(REVERTED — see Part 33)*

**Before:** the moment the screen mounted it opened **two unbounded live subscriptions** — every
active group *and* every archived one — plus two more for channels, before the reader had looked at
any of them. On an account in many groups that is the whole collection, streamed, on every visit.

**Now:**

| List | When it loads | How |
|---|---|---|
| Active groups | On mount | Live, a page of 10 at a time |
| Archived groups | First time the Archived tab is opened | Live, paged |
| Channels | First time the Channels tab is opened | One-shot, paged (unchanged) |
| Archived channels | First time that sub-tab is opened | One-shot, paged |

### Why groups stayed live instead of switching to cursor paging
Channels page with `getDocs` + cursors because a broadcast archive never changes. A group sidebar
does: unread badges, last-message previews and ordering all move constantly. So active and archived
groups keep `collectionSnapshots` and grow a `limit` instead. Growing the window re-reads the whole
window, which at a page of 10 is far cheaper than the unbounded stream it replaces, and liveness is
preserved.

### Filling the viewport
A page of 10 can be shorter than a tall sidebar — leaving nothing to scroll, and therefore no way to
ask for more. `fillViewportSoon()` keeps pulling pages until the list overflows its container,
capped at six iterations so a wrong `hasMore` can never spin. Scrolling within 120px of the end pulls
the next page in ahead of the reader, and the **Load more** button (now generic, not channel-only) is
the explicit route.

### Search had to widen the window
This is the part worth remembering. The sidebar's group-name search filters **what is loaded**, so
paging would have quietly hidden groups the reader could reach no other way — Firestore cannot do a
"contains" query on a name, so there is no server-side equivalent. Typing in the sidebar search now
loads the whole tab once (`widenForSearch`, guarded by a flag so it does not re-subscribe per
keystroke). The cost is paid only when someone actually searches.

### Known behaviour change — pinned chats
Ordering is now `last_modification desc` server-side, with pinned-first applied client-side to the
loaded window. **A pinned but long-idle group can therefore sit outside the first pages** and will not
appear until the reader pages down or searches. Fixing it properly needs a second query
(`where pinned == true`) and another composite index. Flagged rather than done — in practice pinned
groups are also recent ones.

### Indexes
`firestore.indexes.json` declares only `(members, isdelete)` and `(isdelete, last_modification)`,
neither of which covers the new shape. But channels already run the identical field set — `type` +
`isdelete` + `orderBy last_modification`, with and without `members array-contains` — and they load in
production, so the composite indexes exist in the project even though this file does not list them.
Firestore indexes key on field paths, not values, so `type == 'group'` reuses the same index as
`type == 'channel'`. A `failed-precondition` error now surfaces in the sidebar with a pointer to the
console link rather than leaving an empty list.

### Verified / not verified
The demo path is unregressed: all three tabs render, no error banner, no stray Load more when there
is nothing more. **The live paging itself is unverified** — the Browser pane is a separate profile
from the operator's signed-in browser, so the screen falls back to demo data and `loadGroups()` never
runs. What to look for on a signed-in browser: ten groups initially, more on scroll or the button, a
tall window auto-filling, and Firestore reads no longer spiking on mount.

### Revert guide — Part 32
Restore the old `loadGroups()` (two unbounded `collectionSnapshots`, no `orderBy`/`limit`), put
`loadChannels(false)`/`loadChannels(true)` back in `bootstrapLive`, and delete `GROUP_PAGE`,
`groupLimit`, `archivedLimit`, `hasMoreGroups`, `hasMoreArchivedGroups`, `loadingMore`, `groupsSub`,
`archivedGroupsSub`, `loadedTabs`, `baseFilter`, `loadArchivedGroups`, `listError`, `indexHint`,
`ensureTabData`, `ensureArchivedData`, `hasMoreInList`, `loadMoreInList`, `onListScroll`,
`fillViewportSoon`, `widenForSearch`. In the template drop `#listPane`, the `(scroll)` binding, the
`.wc-listerror` block, and restore the channel-only Load more (with its `showChannelPaging` getter).

## Part 33 — Part 32 reverted

Operator asked for the sidebar paging / scroll-loading work to be taken back out. Reverted in full,
following Part 32's own revert guide. **Part 32 is dead — do not resurrect it from the journal
without asking; it was removed deliberately.**

The sidebar is back to what it was at `b84f935c`: two unbounded live `collectionSnapshots` for active
and archived groups opened on mount, channels fetched at bootstrap, and the channel-only **Load more
channels** control.

Everything else uncommitted was left alone, and checked afterwards rather than assumed: per-chat
drafts, the "with an app account" picker label, the `•` bullet marker, the voice-note review bar, and
the link-input background fix are all still in place.

### How the revert was checked
Paging and the other work were interleaved in the same uncommitted files, so `git checkout` was not
an option — it would have taken the rest with it. Instead every Part 32 symbol was grepped for and
came back clean (`hasMoreGroups`, `hasMoreInList`, `onListScroll`, `fillViewportSoon`,
`widenForSearch`, `ensureTabData`, `loadedTabs`, `listError`, `groupLimit`, `GROUP_PAGE`, `listPane`),
and the diff against `HEAD` was read line by line: the **only** deletions in the whole file are the
six lines of `showChannelPaging` at its old position, which was re-inserted a few lines up — a move,
not a loss. `loadGroups()` and `bootstrapLive()` produce no diff hunks at all, i.e. they are
byte-identical to the committed version.

Build clean.

### The problem Part 32 was solving still exists
Recorded so it is not lost: the screen still opens **two unbounded live subscriptions on mount** —
every active group and every archived one — plus two more for channels, before the reader has looked
at any of them. On an account in many groups that is the whole collection streamed on every visit.
If it is picked up again, the two things that made it awkward were:

1. **Search.** Sidebar name-search filters what is loaded, and Firestore cannot do a "contains" query
   on a name, so paging hides groups reachable no other way. Part 32 widened the window on search.
2. **Pinned chats.** Server-side ordering is `last_modification desc`, so a pinned but idle group can
   fall outside the first pages. Needs a second `where pinned == true` query and another index.

## Part 34 — 2026-09-18: CTA links saved without a scheme

**Found:** the link form stored the URL exactly as typed. `google.com` went out with no scheme, so
the browser treated `<a href="google.com">` as a relative path and the app's `launchUrl` could not
open it at all (reported as "the button doesn't take anywhere" on the app receiver).

**Change:** `static withScheme(url)` adds `https://` when no scheme is present. Applied in
`insertLink()` (new buttons are saved correctly) and in `parseButtons()` (old stored buttons are
fixed on read — no data migration). The app got the same guard (see breakthroughs-flutter journal
`2026-09-18-chat-bullets-and-link-buttons.md`).

**Revert:** remove `withScheme` and its two call sites (`insertLink` → `href: url.trim()`,
`parseButtons` → `href: b.url`).
