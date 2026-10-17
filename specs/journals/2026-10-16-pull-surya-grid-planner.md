# 2026-10-16 — pull from surya-development: Communication Grid Planner + participants-analytics listener fix

Operator: "get from surya-development" → "pull both". Taken file-by-file (`git checkout origin/surya-development -- <paths>`).
surya's big-ladder commit was already on charan-release.

| Component | Files | What it brings |
|---|---|---|
| Communication Grid Planner (`/communication-grid-planner`) | `communication-grid-planner.component.{ts,html,css}` | Redesign: event / search / participant filters, duplicate, per-day add, day side panel, new-communication popup; reads email / WATI archive + notification records |
| Participants Analytics | `participants-analytics.component.ts` (+3/−1) | Idle-timer `document` listeners are removed on destroy (`AbortController`). This also drops `capture: true`, so the listeners now fire in the bubble phase. |

## Our edits on top (e2e coverage)
- The rewrite had dropped every `cgp-*` hook. Hooks are restored using the old names where the control
  survived, and the new controls are hooked. `cgp-lib-send` and `cgp-email-recipients` are now literal.
- A commented-out duplicate "+ Add Communication" button was deleted. The gate scans comments, so it
  counted as a new unhooked element.
- Hub: `comms/communication-grid-planner.spec.ts` adds CGP-FLT-01 (search keeps Alpha, drops Bravo) and
  CGP-ADDR2. Why the seed looks that way: hub `specs/journals/2026-10-16-communication-grid-planner-redesign.md`.

## Revert
- Planner: `git checkout <commit-before> -- "src/app/Communication Center/communication-grid-planner"`
- Analytics listener: restore `}, true);` in `startIdleTimer`'s `addEventListener`, and remove `controller`
  plus its `abort()` from `ngOnDestroy`.
