# 2026-07-06 — collaborator studio: block check-in on checked-in-elsewhere + auto-close assign dialog

Two operator requests on the dynamic-studio-v2 collaborator flow. Both compile clean; **behaviour needs
live 2-session verification** (prod Firestore off-limits, app auth-gated — a 2-specialist collaborator
scenario can't be reproduced locally).

## Request 1: "collaborator is busy" popup should also block when a co-specialist is merely CHECKED IN elsewhere
Before: `findCollaboratorConflicts()` blocked a check-in only when a co-specialist on this studio was in a
**live activity** (`live assignment` with `status === 'live'`) in a different studio. Operator: also block
when the co-specialist is simply **checked into another studio** (shared `checkin: true` flag), even with
no live activity.

Changes (`dynamic-studio-v2.component.ts`, `findCollaboratorConflicts`):
- Per collaborator, keep the existing live-activity check FIRST (it carries the stage name). If matched,
  `continue`.
- Otherwise, query `queue studio pairing` where `participants array-contains <collab>` AND
  `checkin == true`; if any doc is a DIFFERENT studio (`docid !== thisStudioId`), not deleted, and in one
  of the specialist's ongoing queues (`liveQueueIds`, mirrors `findActiveCheckins` scoping) → conflict.
- Each conflict now carries an `isLive` flag (`true` = live activity, `false` = checked-in only).

Template (`dynamic-studio-v2.component.html`, `#collaboratorBusyTpl`):
- Copy broadened: "already in an activity in another studio … once they finish there" →
  "already **busy** in another studio … once they're **free** there".
- Per-row fallback (no stage) now reads `{{ c.isLive ? 'In a live activity elsewhere' : 'Checked in to
  another studio' }}`.

Single-field indexes only (`pairing array-contains`, and `participants array-contains + checkin ==` — the
latter already used by `findActiveCheckins`, so no new composite index). Best-effort: still returns `[]`
on error so a lookup failure never blocks a legitimate check-in.

## Request 2: auto-close the "select activity & profiles" dialog for the other collaborator
Scenario: after a Bring-to-Studio invitation is accepted, `assignStudio()` opens the EnterStudioAssign
dialog (activity + profiles). In a collaborator studio both specialists can have it open (the invitation
`createdby` gets it automatically at L1974; anyone can reopen it via the waiting-list "Approved · Assign
studio" CTA, `assignStudio(self.invitation)` at html L227). When ONE submits, the shared live assignment
is created and BOTH enter the studio via the live-assignment listener — but the other's dialog stayed
open over the live studio.

Changes (`dynamic-studio-v2.component.ts`):
- New field `enterStudioAssignRef: MatDialogRef<any> = null`.
- `assignStudio()`: store `this.enterStudioAssignRef = assignStudio` after opening; null it at the top of
  its `afterClosed` handler (covers submit / cancel / auto-close). The existing
  `if(result != null && this.liveAssignment == null)` guard means a programmatic close (result
  `undefined`) is a no-op, so no double-processing.
- Live-assignment listener: at the top of the `mapStudioLiveAssignment[selectedStudio.docid] != null`
  block (the point where the specialist enters the live studio), if `enterStudioAssignRef` is open,
  `.close()` it and null the ref. `disableClose:true` doesn't block a programmatic `.close()`.

Per-client instances each hold their own ref, so the submitter's ref is already nulled (its `afterClosed`
ran on submit before the live assignment existed) — only the OTHER collaborator's lingering dialog gets
closed.

## Verify
`ng serve` rebuilt clean, `dynamic-studio-v2-component` chunk built, no studio-v2 errors. Operator to
confirm live: (1) two collaborators, one checks into studio B → the other is blocked from checking into
studio A with the popup even with no live activity; (2) both open the assign dialog, one submits → the
other's dialog closes as they enter the live studio.

## Revert
- Request 1: restore the old single-loop `findCollaboratorConflicts` (live-activity only, `seen` set),
  drop the `isLive` field, and revert the template copy + fallback string.
- Request 2: remove the `enterStudioAssignRef` field, the two lines in `assignStudio` (store + null), and
  the close block in the listener.
