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

#1–#7 all live in the same component files; reverting one alone means hand-editing.

## Announcements — why it matches Flutter exactly
Flutter (`harish-development`, `lib/Messages/msgThread.dart` `_sendDraft`) writes `announcement: true` on the
message and `last_announcement_at: time` on the group, and decides "latest is an announcement" by comparing
`last_announcement_at` to `last_modification` within 1 ms (`MessagesService.latestIsAnnouncement`). The web
writes both group fields in ONE `updateDoc` with `serverTimestamp()`, so they resolve to the same instant and
both apps agree. Reactions were wired the same way in #7. Reverting one alone means hand-editing; they were made back-to-back.

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
