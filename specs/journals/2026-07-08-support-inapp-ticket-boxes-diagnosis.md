# 2026-07-08 — Customer Support: in-app ticket tab "loads in boxes" for some users (DIAGNOSIS ONLY, no code change)

## Symptom (operator report)
On the Customer Support dashboard, clicking a name in the table opens the ticket **as an
in-app tab**; Ctrl/Cmd-click opens it in a **new browser tab**. For **some users, not
everybody**, the in-app tab renders only skeleton "boxes" (never loads), yet the *same
ticket* opened in a new browser tab loads fine.

## Root cause
The two open-methods take **different init paths** in
`customer-chat-screen.component.ts`, and the in-app path is gated on the `admin` flag
while the new-tab path is not.

`ngOnInit` (customer-chat-screen.component.ts:201):
```
if (params['ticketid'])      -> loadDataForNewTab()   // NEW TAB: no admin check
else if (this.admin)         -> set ticket_id, editloading=false   // IN-APP: admin-gated
// else: NOTHING runs
```
- `this.admin` is bound from the dashboard as `[admin]="tab.admin"`
  (customer-support-dashboard.component.html:714), and `tab.admin` is set to
  `this.chatAdmin` in `messageIssue` (…dashboard.component.ts:862), which is
  `roles['chatxadmin'] ?? false` (…dashboard.component.ts:179).
- The three skeleton flags default to `true` (`editloading`, `chatloading`,
  `profileloading` — ts:127-129) and are cleared **only** inside the two branches above
  (or in `fetchTicket`, which needs a non-empty `ticket_id`).

So for a logged-in user **without `chatxadmin: true`** opening a ticket **in-app**:
neither `ngOnInit` branch runs → `ticket_id` stays `""` → `fetchTicket` is skipped
(guard at ts:454) → `editloading/chatloading/profileloading` never flip → **permanent
skeleton boxes**. The new-tab route (`/customersupportdashboard/ticket/:id/:no`) hits
`loadDataForNewTab()` (ts:259) which loads unconditionally, so the same ticket works.

The dashboard's own access guard is commented out
(…dashboard.component.ts:266-269), so non-chatxadmin users **can** reach the dashboard
and click tickets in the first place — which is why the mismatch is visible.

## E2E verification
Ran a faithful state-machine simulation of `ngOnInit` / `ngOnChanges` /
`loadDataForNewTab` / loading-flag defaults across role × open-method
(`/tmp/csd-e2e/repro.mjs`). Result — exactly one combination breaks:

| openedVia | chatxadmin | edit  | chat  | profile | result |
|-----------|-----------|-------|-------|---------|--------|
| in-app    | true      | false | false | false   | loads |
| **in-app**| **false** | true  | true  | true    | **STUCK IN BOXES** |
| new-tab   | true      | false | false | false   | loads |
| new-tab   | false     | false | false | false   | loads |

This matches the report term-for-term: "for somebody not everybody" = non-chatxadmin
users; "in-app boxes but new tab opens" = the admin-gated vs. ungated init paths.

(A live browser E2E across two real roles was not run: the app is Firebase-auth gated
and no dual-role test credentials were available in-session; production/ATC are
off-limits per CLAUDE.md.)

## Fix direction (NOT applied — diagnosis only)
The in-app `else if (this.admin)` branch should not gate on `admin`; it should
initialize whenever the component is embedded with an `@Input() ticketid` (mirror what
`loadDataForNewTab` already does). Confirm the intended access policy first: if
non-chatxadmin users are *supposed* to open tickets, remove/relax the gate; if not,
re-enable the dashboard access guard so they never reach the table.
