/**
 * Dynamic Studio V2 Rules Engine (pure, dependency-free).
 *
 * The derivations a specialist's studio screen depends on: how webhook presence
 * (`live assignment log`) collapses onto the live assignment, whether the participant is waiting /
 * in the call / gone, whether the call has ENDED and therefore whether the Zoom link may be reused
 * or must be regenerated, the top-bar status pill, the previous-stage and stage-note resolution
 * through the participant's queue variation, the AEL band model, the Evolution Wishlist labels, and
 * the queue-card studio counts.
 *
 * Extracted from DynamicStudioV2Component (5,523 lines) on 2026-09-10, following the pattern set by
 * delivery-dashboard.engine.ts and priority.engine.ts in ../../Journey Onboarding. The logic is
 * UNCHANGED — same guards, same fallbacks, same strings, same quirks. Several known oddities
 * (marked DEFECT below) were deliberately left intact and pinned by tests rather than fixed, because
 * this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs, NO DOM. Every function takes its inputs as arguments, so the
 *   rules can be exercised offline instead of standing up a 5,500-line component that injects a
 *   Firestore, a Storage, a Router, an ActivatedRoute, an NgZone, a MatDialog, a MatSnackBar, a
 *   DomSanitizer and a FormBuilder, and opens a dozen live subscriptions.
 * - As getters on that component the rules were only reachable through a rendered template driven by
 *   live streams and a 5-second presence ticker. An e2e case could assert that the pill said "Call
 *   ended" — it could not distinguish an ended call from a regenerate-and-rejoin, which is exactly
 *   the `endedMeetingId` check presenceView() makes.
 * - Getting these wrong strands a real participant: a call that reads as live when it ended sends
 *   the specialist to Zoom's link-timeout page with the participant waiting on the other side.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads or writes Firestore, subscribes, navigates, opens dialogs, scrolls, or
 *   sanitizes HTML. Where a method mixed both, only the pure core moved — processMessage() still
 *   owns the DomSanitizer call and asks the engine only for the linkified string.
 * - ATC IS OUT OF SCOPE for this refactor. Nothing here reads ATC data, an ATC collection, or
 *   anything under src/app/ATC. `visibleSteps`, `countSpecialists`, `countProcedures`,
 *   `atcInThisQueueCount`, the validated/unvalidated/assigned/triple ATC lists and the whole
 *   AI-ATC availability path were left on the component untouched — see the report.
 */

// =================================================================================================
// Shapes
// =================================================================================================

/** Whatever Firestore handed us — a Timestamp, a Date, a string. Only optional methods are called. */
export type TimestampLike = any;

/** The top-bar live-status pill. tones: primary | green | amber | slate; icons are Material names. */
export interface TopBarStatus { tone: string; icon: string; title: string; sub: string; }

/** An extra specialist invited into this studio, resolved for the sidebar roster. */
export interface AdditionalSpecialist { profileId: string; name: string; activity: string; }

/** A stage note configured under the current stage, keyed by the stage it is ABOUT. */
export interface StageNote { stage: string; note: string; }

/** One configurable AEL band. */
export interface AelLevel { startpoint: any; endpoint: any; [k: string]: any; }

export type NameMap = { [id: string]: string };

// =================================================================================================
// Constants — the component's own literals, kept as defaults so behaviour is identical.
// =================================================================================================

/** Studio invitation countdown default, overridden from classify/studiotimer.timerinseconds. */
export const DEFAULT_INVITATION_TIMER_SECONDS = 120;

/** The exact marker the cloud function writes into `zoomdata.start_url` when a link dies. */
export const BROKEN_LINK_MARKER = 'Link Broken';

/** The separator that joins an AEL band's endpoints into its stored value string. */
export const AEL_BAND_SEPARATOR = '---';

/** Placeholder shown wherever a name or a band cannot be resolved. */
export const NO_VALUE = '—';

/** Presence ticker period, ms (startPresenceTicker, dynamic-studio-v2.component.ts:1410). */
export const PRESENCE_TICK_MS = 5000;

// =================================================================================================
// Presence — webhook truth over client one-shots
// =================================================================================================

/**
 * The participant's profile id for the current live assignment.
 *
 * Prefers the queue_token's `profile_id` (set when the specialist invited them via Bring-To-Studio)
 * but falls back to the assignment's own `participantid`, so an auto-enter with no hydrated token
 * still shows the participant in the sidebar.
 */
export function participantProfileId(liveAssignment: any): string {
  const la: any = liveAssignment || {};
  return la['token']?.['profile_id'] || la['participantid'] || '';
}

/**
 * Overlay webhook presence onto the live assignment so the presence getters read reliable SERVER
 * truth. Only fields the log actually has override the client one-shots; everything else falls
 * through unchanged, so old calls with no log doc keep their existing behaviour.
 *
 * `participantReadyAt` is NEVER overridden — it is a pre-Zoom "arrived at the wait screen" state the
 * webhook cannot see, and stays client-stamped.
 *
 * The per-specialist map is collapsed into the single-field semantics the getters expect: joined =
 * anyone ever joined, left = everyone who joined has left. A meeting-ended event is honoured ONLY
 * when it belongs to the CURRENT meeting, so after a regenerate the OLD meeting's end cannot end the
 * new one.
 *
 * DEFECT (pinned): "anyone's join" is `specVals.find(s => s.joinedAt)` and "anyone's leave" is
 * `specVals.filter(s => s.leftAt).pop()` — the FIRST and LAST entries in JavaScript object-key
 * order, not the earliest join or the latest leave. With two specialists in one studio the reported
 * call start and end depend on the order Firestore happened to serialise the map in. (The Arena
 * board's copy of this same overlay does compare timestamps — the two screens can disagree about
 * when the same call started.)
 */
export function presenceView(liveAssignment: any, liveAssignmentLog: any): any {
  const la: any = liveAssignment || {};
  const log: any = liveAssignmentLog;
  if (!log) return la;
  const specialists: any = log['specialists'] || {};
  const specVals: any[] = Object.values(specialists);
  const specialistPresent = specVals.some(s => s && s.joinedAt && !s.leftAt);
  const specialistEverJoined = specVals.some(s => s && s.joinedAt);
  const anyJoinedAt = (specVals.find(s => s && s.joinedAt) || {})['joinedAt'];
  const anyLeftAt = (specVals.filter(s => s && s.leftAt).pop() || {})['leftAt'];
  const overlay: any = {};
  if (log['participantInCallAt']) overlay['participantInCallAt'] = log['participantInCallAt'];
  if (log['participantLeftAt']) overlay['participantLeftAt'] = log['participantLeftAt'];
  if (specialistEverJoined) {
    overlay['specialistJoinedAt'] = anyJoinedAt || true;
    overlay['specialistLeftAt'] = specialistPresent ? null : (anyLeftAt || log['meetingEndedAt'] || true);
  }
  // Only treat the session as ended if the ended event was for the CURRENT meeting.
  const currentMeetingId = la?.['zoomdata']?.['id'];
  if (log['meetingEndedAt'] && log['endedMeetingId'] != null &&
      String(log['endedMeetingId']) === String(currentMeetingId)) {
    overlay['meetingEndedAt'] = log['meetingEndedAt'];
  }
  return { ...la, ...overlay };
}

/**
 * The participant is at the wait screen right now — the moment the specialist might want to jump to
 * the meeting. Heartbeat removed: derived purely from the one-shots.
 */
export function participantInWaitingRoom(presence: any): boolean {
  const la: any = presence || {};
  return !!la['participantReadyAt'] && !la['participantInCallAt'] && !la['participantLeftAt'];
}

/** The participant is actually live in the Zoom call. */
export function participantHasJoinedCall(presence: any): boolean {
  const la: any = presence || {};
  if (!la['participantInCallAt']) return false;
  if (la['participantLeftAt']) return false;
  return true;
}

/**
 * The meeting has ENDED — the webhook said so for the current meeting, or (legacy signal) both
 * parties left after the call had started.
 *
 * Once ended the Zoom link is dead: reusing "Start Meeting" would drop the specialist on Zoom's
 * link-timeout page, so they MUST generate a fresh link.
 */
export function callEnded(presence: any): boolean {
  const la: any = presence || {};
  if (la['meetingEndedAt']) return true; // webhook: definitively ended
  return !!(la['participantLeftAt'] && la['specialistLeftAt'] && la['specialistJoinedAt']);
}

/** The specialist is inside the meeting right now — used to relabel "Start Meeting" → "In Meeting". */
export function specialistInMeeting(presence: any): boolean {
  const la: any = presence || {};
  return !!la['specialistJoinedAt'] && !la['specialistLeftAt'] && !callEnded(la);
}

/** The Zoom link is missing, or the cloud function marked it broken. */
export function isZoomLinkBroken(liveAssignment: any): boolean {
  const url = liveAssignment?.['zoomdata']?.['start_url'];
  return !url || url === BROKEN_LINK_MARKER;
}

/**
 * The join token's lifetime (`linkExpiresAt`, written by studioZoomLink / regenerate) has passed.
 *
 * Accepts a Firestore Timestamp, a `{seconds}` shape, or anything Date can parse. An unparseable
 * value is deliberately NOT treated as expired — we would rather offer a live link than block a
 * specialist out of a working meeting on a bad field.
 */
export function linkExpired(liveAssignment: any, now: number = Date.now()): boolean {
  const exp: any = liveAssignment?.['linkExpiresAt'];
  if (!exp) return false;
  const ms = typeof exp?.toMillis === 'function' ? exp.toMillis()
           : typeof exp?.seconds === 'number' ? exp.seconds * 1000
           : new Date(exp).getTime();
  return Number.isFinite(ms) && ms < now;
}

/**
 * Offer "Regenerate" ONLY when the link is unusable — meeting ended, token expired, or link broken.
 * While the call is healthy the specialist uses "Start Meeting" (rejoin) instead.
 */
export function canRegenerate(ended: boolean, expired: boolean, broken: boolean): boolean {
  return ended || expired || broken;
}

/** Only mentors may edit previous-cycle records. */
export function isMentor(profileRoles: any): boolean {
  return !!profileRoles?.['mentor'];
}

/**
 * The top-bar live status pill — a pure derivation from the presence one-shots.
 *
 * Branch order matters: "call ended" is checked FIRST, otherwise an ended call reads as
 * "participant left · waiting for rejoin" and the specialist keeps waiting for a rejoin that will
 * never come.
 *
 * DEFECT (pinned): the "has joined" line names the participant from `la.token.profile_id` only,
 * while participantProfileId() falls back to `la.participantid`. On the auto-enter path (no token
 * hydrated yet) the pill says "Participant is now live in the meeting" even though the sidebar
 * beside it is already showing the person's real name.
 */
export function topBarStatus(presence: any, mapProfile: NameMap | null | undefined): TopBarStatus {
  const la: any = presence || {};
  const readyAt = la['participantReadyAt'];
  const inCallAt = la['participantInCallAt'];
  const leftAt = la['participantLeftAt'];
  const specialistJoinedAt = la['specialistJoinedAt'];
  const specialistLeftAt = la['specialistLeftAt'];

  if (callEnded(la) || (leftAt && specialistLeftAt && specialistJoinedAt)) {
    return { tone: 'slate', icon: 'check_circle', title: 'Call ended', sub: 'Complete the activity to finish this session.' };
  }
  // participant in call (joined live) — readyAt/leftAt are nulled on join
  if (inCallAt && !leftAt) {
    return {
      tone: 'primary',
      icon: 'login',
      title: 'Participant has joined',
      sub: (mapProfile?.[la?.['token']?.profile_id] || 'Participant') + ' is now live in the meeting',
    };
  }
  // participant ready (on meeting screen) — show review hint
  if (readyAt && !leftAt) {
    return { tone: 'green', icon: 'videocam', title: 'Participant is waiting', sub: 'Take a moment to review the forms and ATC before starting the call.' };
  }
  // participant left mid-call while the specialist is still in the meeting
  if (leftAt && specialistJoinedAt) {
    return { tone: 'amber', icon: 'logout', title: 'Participant left the meeting', sub: 'Connection dropped — waiting for them to rejoin' };
  }
  // default — silent (no scary "no signal" copy)
  return { tone: 'slate', icon: 'schedule', title: 'Awaiting participant', sub: 'Use this time to review the forms and ATC.' };
}

// =================================================================================================
// Stage resolution through the participant's queue variation
// =================================================================================================

/**
 * The stage list this participant actually walks.
 *
 * When the token carries a `variationid` we use that variation's stages; if the variation map has no
 * entry for it we are CONSERVATIVE and return null (meaning "we do not know"), rather than falling
 * back to the queue's full list and showing a stage this participant will never reach. With no
 * variationid at all we use the queue's own stage list.
 */
export function stageListFor(liveAssignment: any, queueVariation: any, ongoingQueue: any): string[] | null {
  const variationId = liveAssignment?.['token']?.['variationid'];
  if (variationId != null) {
    if (!(variationId in (queueVariation ?? {}))) return null; // conservative
    return queueVariation[variationId] ?? [];
  }
  return ongoingQueue?.['stages'] ?? [];
}

/**
 * The stage immediately before the current one in the participant's own stage list — the target of
 * the "Send Back" button.
 *
 * Returns null — hiding the button — at the first stage, when the variation is unknown, and when the
 * current stage is not in the resolved list at all. Hiding is the safe failure: offering a send-back
 * to the wrong stage would move a real participant backwards through a stage they never did.
 */
export function previousStageName(liveAssignment: any, queueVariation: any, ongoingQueue: any): string | null {
  if (!liveAssignment) return null;
  const variationId = liveAssignment['token']?.['variationid'];
  const stageList: string[] = variationId != null
    ? (queueVariation?.[variationId] ?? [])
    : (ongoingQueue?.['stages'] ?? []);
  if (!stageList.length) return null;
  const idx = stageList.findIndex(s => s === liveAssignment['stagename']);
  return idx > 0 ? stageList[idx - 1] : null;
}

/**
 * Stage notes for the topbar. Configured in queue-creation under the CURRENT stage as a map
 * { [targetStage]: note } — where targetStage need not be the current stage. Each note is shown ONLY
 * when the participant's own variation includes that target stage, so a note about a stage they will
 * never reach is not shown to them.
 *
 * Both storage shapes are accepted: the new ARRAY format [{stage, note}] and the legacy MAP format
 * { [stage]: note }. Blank notes are dropped.
 */
export function currentStageNotes(liveAssignment: any, ongoingQueue: any, queueVariation: any): StageNote[] {
  if (!liveAssignment || !ongoingQueue) return [];
  const stagename = liveAssignment['stagename'];
  if (!stagename) return [];
  const raw = ongoingQueue?.['stageproperty']?.[stagename]?.['stagenote'];
  if (raw == null) return [];

  const entries: { stage: string; note: any }[] = Array.isArray(raw)
    ? raw.map((r: any) => ({ stage: r?.['stage'], note: r?.['note'] }))
    : (typeof raw === 'object'
        ? Object.keys(raw).map(k => ({ stage: k, note: raw[k] }))
        : []);

  const stageList = stageListFor(liveAssignment, queueVariation, ongoingQueue);
  if (stageList == null) return []; // conservative — unknown variation shows nothing

  const out: StageNote[] = [];
  for (const e of entries) {
    if (!e.stage) continue;
    if (e.note == null || String(e.note).trim().length === 0) continue;
    if (stageList.includes(e.stage)) out.push({ stage: e.stage, note: String(e.note) });
  }
  return out;
}

// =================================================================================================
// Sidebar roster
// =================================================================================================

/**
 * Extra specialists invited into THIS studio via "Invite More Specialist(s)", stored on the live
 * assignment as bonusactivity = { profileId: activityId }, resolved to name + activity.
 *
 * DEFECT (pinned): the name fallback is `?? '—'`, which only fires on null/undefined. A profile map
 * entry holding an EMPTY STRING passes straight through, so the roster renders a nameless chip
 * instead of the placeholder — an invited specialist appears as a blank row.
 */
export function additionalSpecialists(
  liveAssignment: any,
  mapProfile: NameMap,
  mapActivity: NameMap,
): AdditionalSpecialist[] {
  const bonus = liveAssignment?.['bonusactivity'] ?? {};
  return Object.keys(bonus).map(profileId => ({
    profileId,
    name: mapProfile?.[profileId] ?? NO_VALUE,
    activity: mapActivity?.[bonus[profileId]] ?? '',
  }));
}

// =================================================================================================
// AEL bands
// =================================================================================================

/** The stored value string for a band, e.g. "0---10". */
export function aelBandValue(level: AelLevel | null | undefined): string {
  return level ? level['startpoint'] + AEL_BAND_SEPARATOR + level['endpoint'] : '';
}

/**
 * Index of the current band within the configured level list.
 *
 * DEFECT (pinned): an unrecognised value returns 0 rather than -1, so a participant whose stored
 * band no longer matches any configured level silently displays — and, if the specialist then drags
 * the slider away and back, SAVES — the first band. A crossover metric can be quietly rewritten to
 * the lowest band by a config change nobody connected to it.
 */
export function aelBandIndex(aelLevelList: AelLevel[], value: any): number {
  const idx = (aelLevelList || []).findIndex(o => aelBandValue(o) === value);
  return idx < 0 ? 0 : idx;
}

/** Human label for the current band, e.g. "0 – 10". */
export function aelBandLabel(aelLevelList: AelLevel[], value: any): string {
  const o = (aelLevelList || [])[aelBandIndex(aelLevelList, value)];
  return o ? (o['startpoint'] + ' – ' + o['endpoint']) : NO_VALUE;
}

// =================================================================================================
// Evolution Wishlist labels
// =================================================================================================

/** Display name for a wishlist `type`. */
export function formatEvolutionWishlistType(type: string): string {
  if (type === 'familyandpeers') return 'Family & Peers';
  if (type === 'self') return 'Self';
  return type || '-';
}

/**
 * Display name for a wishlist `status`: 'sended' renders as 'Shared', and the 'Partially ' prefix is
 * applied when `mannualcompleted` is truthy on the entry.
 */
export function formatEvolutionWishlistStatus(entry: any): string {
  let status: string = entry?.['status'] || '-';
  if (status === 'sended') status = 'Shared';
  if (entry?.['mannualcompleted']) status = 'Partially ' + status;
  return status;
}

/**
 * "submitted/total" for an entry's contacts, or null to hide the chip.
 *
 * The submitted count is computed from the contacts array directly (matching the Evolution Wishlist
 * Log screen, which counts `contact.submitted === true`) so it is accurate even when the doc carries
 * no stored `submittedCount`.
 */
export function evolutionWishlistContactsLabel(entry: any): string | null {
  const contacts = entry?.['contacts'];
  if (!Array.isArray(contacts) || contacts.length === 0) return null;
  const submitted = contacts.filter((c: any) => c?.submitted === true).length;
  return `${submitted}/${contacts.length}`;
}

/**
 * English ordinal: 1st, 2nd, 3rd, 4th … 11th, 21st.
 *
 * DEFECT (pinned): the suffix table is indexed with `(v - 20) % 10`, which goes NEGATIVE for any
 * value below 20 and relies on the out-of-range lookup falling through to `s[v]`. It works for the
 * cases the UI produces, but a negative n produces nonsense like "-1th" rather than throwing or
 * being rejected, so a bad visit count renders as a plausible-looking label.
 */
export function formatOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// =================================================================================================
// Queue cards and misc
// =================================================================================================

/**
 * Merge the per-chunk studio counts into one queueid → count map. The `__seeded` bookkeeping key
 * used to force a first emission is dropped.
 */
export function mergeQueueStudioCounts(chunkResults: { [qid: string]: number }[]): { [qid: string]: number } {
  const merged: { [qid: string]: number } = {};
  (chunkResults || []).forEach(chunk => {
    Object.keys(chunk).forEach(qid => {
      if (qid === '__seeded') return;
      merged[qid] = (merged[qid] || 0) + chunk[qid];
    });
  });
  return merged;
}

/** The queues that currently have at least one checked-in studio — the only ones worth a card. */
export function queuesWithStudios(ongoingQueueList: any[], counts: { [qid: string]: number }): any[] {
  return (ongoingQueueList || []).filter(q => (counts[q['docid']] || 0) > 0);
}

/** mat-select comparison by document id. */
export function compareByDocId(c1: any, c2: any): boolean {
  return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
}

/** Index of a step in the stepper, or -1. */
export function stepIndex(steps: { id: string }[], id: string): number {
  return (steps || []).findIndex(s => s.id === id);
}

/** A step is "completed" when it sits strictly before the active one. */
export function isStepCompleted(steps: { id: string }[], id: string, activeStepId: string): boolean {
  const activeIdx = stepIndex(steps, activeStepId);
  const idx = stepIndex(steps, id);
  return idx >= 0 && idx < activeIdx;
}

/**
 * Identity of the assignment+stage+token combination whose widget data has been loaded, so the same
 * combination is never re-fetched and a freshly-hydrated token triggers exactly one refresh.
 */
export function widgetFetchSignature(liveAssignment: any): string | null {
  const la: any = liveAssignment;
  if (!la?.['docid'] || !la?.['stagename']) return null;
  return la['docid'] + '|' + la['stagename'] + '|' + (la['token']?.['docid'] ?? 'pending');
}

/**
 * Turn a chat message into display HTML: newlines become <br>, bare URLs become links. The caller
 * still owns the DomSanitizer call — this returns a plain string.
 *
 * DEFECT (pinned): newlines become `<br>` BEFORE the URL regex runs, and the regex matches
 * `[^\s]+`. A URL at the end of a line swallows the following `<br>` into its own href and link
 * text, so the link 404s and the sender's line break disappears. (The same bug is pinned in
 * arena-board.engine.ts — the two screens carry copies of this function.)
 */
export function linkifyMessage(message: string, linkColor: string = '#1a56db'): string {
  if (!message) return '';
  let processed = message.replace(/\n/g, '<br>');
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  processed = processed.replace(urlRegex, `<a href="$1" target="_blank" rel="noopener" style="color:${linkColor};word-break:break-word;overflow-wrap:anywhere;">$1</a>`);
  return processed;
}

/**
 * Render one submitted-form field value for the read-only overlay.
 *
 * Ported wholesale from the original form viewer; the shapes it handles (Firestore date, checkbox,
 * multi-select, slider with a range hint, repeating array groups) are the shapes the form builder
 * actually produces.
 */
export function formatFieldValueForOverlay(field: any, value: any): string {
  if (!value && value !== 0) return 'Not answered';

  switch (field.type) {
    case 'date':
      if (value?.toDate) return value.toDate().toLocaleDateString();
      try { return new Date(value).toLocaleDateString(); } catch { return String(value); }
    case 'Checkbox':
      return value ? 'Yes' : 'No';
    case 'MultiSelect':
    case 'multicheckbox':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'slider': {
      let result = String(value);
      if (field.options?.length > 0) result += ` (Range: ${field.options[0]}-${field.options[field.options.length - 1]})`;
      return result;
    }
    case 'array':
      if (Array.isArray(value) && value.length > 0) {
        return value.map((item: any) => {
          if (typeof item === 'object' && item !== null) {
            if (field.array && Array.isArray(field.array)) {
              const parts = field.array.map((af: any) => {
                const v = item[af.fieldname];
                return v != null && v !== '' ? `${af.fieldname}: ${v}` : null;
              }).filter(Boolean);
              return parts.join('\n');
            }
            const parts = Object.entries(item)
              .filter(([, v]) => v != null && v !== '')
              .map(([k, v]) => `${k}: ${v}`);
            return parts.join('\n');
          }
          return String(item);
        }).join('\n');
      }
      return 'No items';
    default:
      if (Array.isArray(value)) return value.join(', ');
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (typeof value === 'object') {
        try {
          return Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ');
        } catch { return JSON.stringify(value); }
      }
      return String(value);
  }
}
