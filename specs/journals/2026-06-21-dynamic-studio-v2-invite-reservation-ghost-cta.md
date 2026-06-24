# 2026-06-21 — Dynamic Studio v2: "ghost" Bring-To-Studio CTA (invite reservation desync)

## Symptoms (operator report)
- 15 participants in the **Queue Waiting** stage, only 2 visible in the Studio.
- Clicking **Bring To Studio** alerts *"Another specialist is already bringing
  this participant. Please try another participant."* — yet the participant is
  still shown, clickable, in Queue Waiting. (The literal in-code string was
  *"The selected participant is about to respond invitation from other studio…"*
  — operator paraphrased it.)

## Root cause
Two pieces of logic disagreed about whether a token was "reserved", and the
waiting-list CTA followed the wrong one:

1. **The reservation guard** — `inviteParticipant()` (~L2175) queries
   `studioinvitation where tokenref == token && expirydate >= now`, then blocks
   if any has `clientresponse == null || "approved"`. **No `studioid` filter,
   no `status` filter.**
2. **The CTA-hiding logic** — `subscribeOtherStudioInvitations()` (~L1142)
   populated `tokenInvitedByOther` only from invites with `status == 'pending'`
   **and only from OTHER studios** (it `continue`d on self).

The invite that `inviteParticipant()` *creates* set `clientresponse: null` but
**never wrote a `status` field at all**. So:
- The CTA-hiding query (`status == 'pending'`) never matched it → the row kept
  showing a clickable **Bring To Studio**.
- The guard (`clientresponse == null`) *did* match it → the click was rejected.

Net: a participant with this studio's own un-answered (or approved-but-not-yet-
moved) invite appeared free but was blocked — and the message blamed "another
studio" even when it was the specialist's own pending invite. This is inherited
from legacy `dynamic-studio` (identical guard, no `status`); v2 added the
`tokenInvitedByOther` hide-logic but wired it to a `status` field the writer
never set, so the half-fix never engaged.

## Fix (v2 only — legacy left untouched)
**Design decision (operator directive):** the invitation document and the guard
in `inviteParticipant()` are left **exactly as legacy `dynamic-studio` writes
them** — no new `status` field, no reworked guard, no changed alert text. The
*only* deviation from legacy in `inviteParticipant` is `invitationTimerSeconds`
(v2's configurable timer) instead of legacy's hardcoded `2*60000`. The fix is
therefore purely UI-side: surface the reservation that *already exists* so the
specialist never clicks a blocked CTA. The stored invite shape is unchanged, so
no other consumer (cloud functions, participant app) is affected.

`dynamic-studio-v2.component.{ts,html,css}`:
1. **Track this studio's own pending invites:** new `tokenInvitedBySelf` map,
   populated in `subscribeOtherStudioInvitations()`. That subscription pulls all
   non-expired invites for the queue and classifies **in code** by
   `clientresponse` + `studioid` (skip `denied`; self vs other by studio). It
   does **not** filter on a `status` field — participant invites don't have one
   (legacy shape), and filtering on status is exactly what hid the stuck invite
   and produced the clickable-but-blocked CTA.
2. **CTA reflects reservation:** template hides **Bring To Studio** when either
   `tokenInvitedByOther` *or* `tokenInvitedBySelf` holds the token. Self case
   shows a blue *"Invitation sent · awaiting response"* chip with a **Cancel**
   (×) button.
3. **Recovery without waiting for expiry:** new `cancelOwnInvitation(token)`
   deletes this studio's un-answered (`clientresponse == null`) invites for the
   token, returning the CTA so it can be re-invited.

The reservation guard in `inviteParticipant()` stays as a legacy backstop —
under normal use the UI now prevents the click that would trigger its alert.

## Verification
- `npx tsc -p tsconfig.app.json --noEmit` → **0 errors**.
- Full runtime repro not reachable from preview: the screen is Firebase-auth
  gated and needs an authenticated specialist live in a studio with real
  `queue_token` + `studioinvitation` data (and a second studio to exercise the
  other-studio path) — and per project constraints we don't seed real/ATC data.
  Logic is isolated and compiles green.

## Revert guide (per-screen)
Fully contained in three `dynamic-studio-v2` files; legacy `dynamic-studio` is
untouched.
Note: `inviteParticipant()` and `assignStudio()` were **not** modified by this
fix (invitation stays legacy), so there is nothing to revert there.
1. `dynamic-studio-v2.component.ts` —
   - Delete the `tokenInvitedBySelf` property declaration (just below
     `tokenInvitedByOther`, ~L105).
   - Remove the two `this.tokenInvitedBySelf = {}` resets (in the
     reset/teardown method ~L1136 and at the top of
     `subscribeOtherStudioInvitations` ~L1150).
   - In `subscribeOtherStudioInvitations`, restore the original query (re-add
     `where('status','==','pending')`), restore `if (!invStudio || invStudio
     === selfStudio) continue`, and drop the `nextSelf` map, its self-branch,
     and its assignment.
   - Delete the `cancelOwnInvitation` method (right after `inviteParticipant`).
2. `dynamic-studio-v2.component.html` — remove the `wait-token__chip--self`
   span (and its Cancel button) and restore the button's `*ngIf` to
   `!tokenInvitedByOther[token.docid]` (~L197).
3. `dynamic-studio-v2.component.css` — delete the `.wait-token__chip--self`,
   `.wait-token__chip-cancel`, and `.wait-token__chip-cancel:hover/.ic` rules.

## Pending / follow-ups
- Live QA on a real multi-token, multi-studio queue: confirm a participant with
  a pending invite shows the awaiting-response chip (not a clickable CTA), that
  **Cancel** frees them, and that the other-studio path still shows the amber
  chip.
- Pre-existing latent quirk (not addressed): the `expirydate >= new Date()`
  bound in `subscribeOtherStudioInvitations` is captured once at subscription
  time, so an invite that expires while the listener is open won't drop out
  until some doc write re-triggers the snapshot. The fresh-on-click guard in
  `inviteParticipant` is unaffected. Consider a periodic refresh if it bites.
- Same root bug exists in legacy `dynamic-studio` (guard at ~L973, no `status`)
  — fix there too if it's still reachable.
