# Dynamic Studio — disable "Start Meeting" after a meeting ends (2026-07-04)

**Branch:** `dynamic-studio-update`
**Problem (operator):** After the specialist ends the meeting, the Zoom link is dead. Clicking **Start Meeting** again reopened that dead link and dropped them on Zoom's "link timeout" page — and the specialist didn't realise they had to **Generate new link** first.

**Fix:** once the meeting has ended, disable Start Meeting and steer them to Generate new link.

## What "ended" means
New getter `callEnded` in `dynamic-studio-v2.component.ts` — same signal the top-bar "Call ended" status already uses:
```ts
get callEnded(): boolean {
  void this.presenceTick // re-run on the 5s presence tick
  const la: any = this.liveAssignment || {}
  return !!(la['participantLeftAt'] && la['specialistLeftAt'] && la['specialistJoinedAt'])
}
```
i.e. both parties left after the call had started (e.g. "End meeting for all"). These one-shots are stamped by `zoom-clientview`'s meeting-end listener.

## Per-screen revert guide

### Screen — Dynamic Studio · Zoom Session step · Start Meeting guard · DONE 2026-07-04
`dynamic-studio-v2.component.ts`:
| Change | Where | Revert |
|---|---|---|
| `callEnded` getter | right after `isZoomLinkBroken` getter | delete the getter |
| `navigateMeeting` guard | `if(this.callEnded){ snackbar; return }` at top of `navigateMeeting` | delete that block |
| presence reset on regen | `updateDoc(... {specialistJoinedAt,specialistLeftAt,participantLeftAt,participantInCallAt,participantReadyAt: null})` before `generateLoading.close()` in `regenerateZoomLink` | delete that try/catch |

`dynamic-studio-v2.component.html` (Zoom Session card, ~line 635-661):
| Change | Where | Revert |
|---|---|---|
| Ended status message | new `.zoom-status--broken *ngIf="callEnded && liveAssignment['zoomdata']"` ("This meeting has ended — generate a new link…") | delete that div |
| Broken message guard | added `&& !callEnded` to the existing broken-status `*ngIf` | remove `&& !callEnded` |
| Start Meeting disabled | added `|| callEnded` to `[disabled]` | remove `|| callEnded` |
| Generate-link prominence | `[class.btn-ghost]`/`[class.btn-primary]`/`[disabled]` now also key off `callEnded`; choice-title shows "Meeting ended — start a new one" | restore the `isZoomLinkBroken`-only bindings + title |

**Why regenerate resets presence:** without it `callEnded` would stay true after generating a fresh link → Start Meeting stays disabled forever (stuck), and a stale `participantInCallAt` would show a wrong "participant in call" status. Clearing the five one-shots makes a regenerated link a clean, not-started session.

**Full revert:** `git checkout <pre> -- "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.ts" "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.html"`

Build: `npx tsc --noEmit -p tsconfig.app.json` → exit 0.

## Pending / follow-ups
- **Not verified in a live browser** — reproducing needs a live assignment in the ended state (all three timestamps set). Verified by typecheck + code trace. If the cloud function `studioZoomLinkRegenerate` ALSO clears these fields server-side, the client reset is harmless/redundant.
