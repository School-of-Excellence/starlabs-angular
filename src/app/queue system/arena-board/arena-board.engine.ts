/**
 * Arena Board Rules Engine (pure, dependency-free).
 *
 * Everything the Arena board decides once the Firestore rows have landed: which tokens are Waiting
 * vs Queued and in what order, which checked-in studios actually serve THIS stage, which studios are
 * idle / inviting / joined / active, how webhook presence (`live assignment log`) overlays the
 * client-stamped one-shots on a live assignment, the four call-state predicates the ACTIVE cards
 * branch on, and every timer / clock / label string on a card.
 *
 * Extracted from ArenaBoardComponent on 2026-09-10, following the pattern set by
 * delivery-dashboard.engine.ts and priority.engine.ts in ../../Journey Onboarding. The logic is
 * UNCHANGED — same filters, same comparison operators, same fallbacks, same strings, same quirks.
 * Several known oddities (marked DEFECT below) were deliberately left intact and pinned by tests
 * rather than fixed, because this is a refactor.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs, NO DOM. Every function takes its inputs as arguments, so the
 *   rules can be exercised offline instead of standing up a component that injects a Firestore, a
 *   Storage, a Router, an ActivatedRoute, a DomSanitizer and an AuthguardService, and that opens six
 *   live collectionData streams in its constructor.
 * - As getters and methods on that component the rules were only reachable through a rendered
 *   template fed by live Firestore streams. An e2e case could assert that the ACTIVE column had two
 *   cards — it could not tell "the specialist joined" from "the webhook log said someone joined",
 *   which is exactly the distinction presenceOverlay() draws.
 * - These are coordination decisions, not implementation details. Whether a studio shows as IDLE
 *   decides who the coordinator sends the next participant to; whether a call reads as ended decides
 *   whether the session timer freezes. Changing one should turn a test red on purpose.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads or writes Firestore or Storage, subscribes, opens dialogs, uploads chat
 *   attachments, touches `window`/`Notification`, or sanitizes HTML. Where a method mixed both, only
 *   the pure core moved: processMessage() still owns the DomSanitizer call and asks the engine only
 *   for the linkified string; ensureProfileLoaded() still does its own getDoc and asks the engine
 *   only which field on the returned doc is the display name.
 * - `atcDoneCount` was NOT extracted — see the report; ATC is out of scope for this refactor.
 */

// =================================================================================================
// Shapes — the component's own interfaces, moved here so the engine owns the contract.
// A `TimestampLike` is whatever Firestore handed us: a Timestamp, a Date, or null. The engine only
// ever calls the optional `.toDate()` / `.toMillis()` on it, exactly as the component did.
// =================================================================================================

export type TimestampLike = any;

export interface ArenaToken {
  docid: string;
  tokennumber?: number;
  queueposition?: number;     // matches the dynamic queue manager's column
  profile_id: string;
  profile_name?: string;
  status?: string;       // 'ready' | 'queued' | 'invited' | null
  currentstage?: string;
  queueid: string;
  preassigned?: { [stage: string]: string[] };
}

export interface ArenaStudio {
  docid: string;
  participants: string[];      // specialist ids
  participantsactivity?: { [profileid: string]: string };
  queueid: string;
  currentstage?: string;
  checkin?: boolean;
  active?: boolean;
}

export interface ArenaInvitation {
  docid: string;
  studioid: string;
  tokenref: any;
  stage: string;
  status: string;             // 'pending' | 'success' | 'cancelled'
  expirydate?: TimestampLike;
  createddate?: TimestampLike;
  participantname?: string;
  attempts?: number;
}

export interface ArenaAssignment {
  docid: string;
  studioid: string;
  stagename: string;
  status: 'live' | 'completed';
  participantid: string;
  pairing?: string[];
  participantsactivity?: { [profileid: string]: string };
  bonusactivity?: { [profileid: string]: string }; // additional-activity specialists keyed by profile id
  specialistJoinedAt?: TimestampLike;          // call START (preserved across rejoin)
  specialistLeftAt?: TimestampLike;            // stamped on host pagehide / ngOnDestroy
  participantReadyAt?: TimestampLike;
  participantInCallAt?: TimestampLike;
  participantLeftAt?: TimestampLike;           // stamped on participant pagehide / ngOnDestroy
  token?: any;
  zoomdata?: any;
  created?: TimestampLike;
}

/** A studio paired with the invitation that is currently ringing it (studio may not have loaded). */
export interface InvitingStudioRow { studio: ArenaStudio | null; invitation: ArenaInvitation; }

/** A named person on a card, with the activity they are running when one is recorded. */
export interface NamedSpecialist { id: string; name: string; activity: string; }

/** Name maps the component keeps: profile id → display name, activity id → activity name. */
export type NameMap = { [id: string]: string };

// =================================================================================================
// Constants — the component's own literals, kept as defaults so behaviour is identical.
// =================================================================================================

/** Token statuses that land in the Queued column (arena-board.component.ts:326). `null` also does. */
export const QUEUED_STATUSES: ReadonlySet<string> = new Set(['queued', 'invited']);

/** The single status that lands in the Waiting (next-up) column. */
export const WAITING_STATUS = 'ready';

/** Firestore caps a `documentId() in [...]` query at 30 ids (subscribeLiveAssignmentLogs, line 395). */
export const LOG_SUB_CHUNK_SIZE = 30;

/** Chat attachment size cap (onChatFileSelected, line 866). */
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Extensions rendered inline as images in chat (isImageFile, line 882). */
export const IMAGE_FILE_RE = /\.(jpg|jpeg|png|gif|webp)$/i;

/** Fallback shown wherever a profile id has no resolved name. */
export const NO_NAME = '—';

// =================================================================================================
// Tokens — Waiting / Queued columns
// =================================================================================================

/**
 * The token list for one stage, in the canonical queue order.
 *
 * Sort key is `queueposition` (the same field the dynamic queue manager orders by) falling back to
 * `tokennumber`, and finally to MAX_SAFE_INTEGER so position-less tokens sink to the bottom in their
 * original relative order.
 */
export function tokensForStage(rows: ArenaToken[], stage: string): ArenaToken[] {
  return (rows || [])
    .filter(t => t.currentstage === stage)
    .sort((a, b) => {
      const ap = a.queueposition ?? a.tokennumber ?? Number.MAX_SAFE_INTEGER;
      const bp = b.queueposition ?? b.tokennumber ?? Number.MAX_SAFE_INTEGER;
      return ap - bp;
    });
}

/** Waiting = next-up: the token has been marked ready. */
export function waitingTokens(tokens: ArenaToken[]): ArenaToken[] {
  return (tokens || []).filter(t => t.status === WAITING_STATUS);
}

/** Queued = everything still in line: no status at all, or queued / invited. */
export function queuedTokens(tokens: ArenaToken[]): ArenaToken[] {
  return (tokens || []).filter(t => t.status == null || QUEUED_STATUSES.has(t.status));
}

/**
 * Every profile id a token's row needs a NAME for: the participant plus this stage's preassigned
 * specialists. The component feeds these to its own lazy profile fetch.
 */
export function profileIdsToPreload(tokens: ArenaToken[], stage: string): string[] {
  const out: string[] = [];
  (tokens || []).forEach(t => {
    if (t.profile_id) out.push(t.profile_id);
    (t.preassigned?.[stage] || []).forEach(id => out.push(id));
  });
  return out;
}

/**
 * Displayed queue position, or null when the token has none.
 *
 * We deliberately do NOT fall back to `tokennumber` or array index here — unlike the sort above,
 * which does — because those are different concepts and would mislead the coordinator. The chip is
 * hidden via *ngIf when this is null.
 */
export function tokenPosition(token: ArenaToken | null | undefined): number | null {
  return token?.queueposition ?? null;
}

// =================================================================================================
// Studios — which ones serve this stage, and which column they belong in
// =================================================================================================

/**
 * The stage's configured activity combinations, each collapsed to a sorted comma-joined signature.
 *
 * Eligibility is derived the same way dynamic-studio-v2 and the dashboard do it: a studio serves the
 * stage when its own sorted participant-activity signature matches one of these.
 */
export function stageActivityCombos(queueData: any, stage: string): string[] {
  const sp = queueData?.['stageproperty']?.[stage];
  return Object.values(sp?.['compulsoryactivity'] ?? {}).map((c: any) =>
    (Array.isArray(c) ? c : [c]).map(String).sort((a, b) => a.localeCompare(b)).join(',')
  );
}

/** A studio's own activity signature, in the same shape stageActivityCombos() produces. */
export function studioActivitySignature(s: ArenaStudio): string {
  return Object.values(s.participantsactivity ?? {})
    .map(String).sort((a, b) => a.localeCompare(b)).join(',');
}

/**
 * The checked-in studios that actually serve THIS stage.
 *
 * A studio isn't bound to one stage — it can be eligible for several — so without this filter the
 * IDLE column and the Specialists tab bleed in studios from OTHER stages of the same queue. When the
 * stage has NO activity config we deliberately do not filter at all, so a missing or edge config can
 * never blank the board.
 */
export function stageStudios(studios: ArenaStudio[], combos: string[]): ArenaStudio[] {
  if (!combos.length) return studios || [];
  return (studios || []).filter(s => combos.includes(studioActivitySignature(s)));
}

/** Checked-in and doing nothing: no live assignment AND no invitation ringing. */
export function idleStudios(
  stageStudioList: ArenaStudio[],
  liveAssignments: ArenaAssignment[],
  invitations: ArenaInvitation[],
): ArenaStudio[] {
  const liveStudioIds = new Set((liveAssignments || []).map(a => a.studioid));
  const invitingStudioIds = new Set((invitations || []).map(i => i.studioid));
  return (stageStudioList || []).filter(s => !liveStudioIds.has(s.docid) && !invitingStudioIds.has(s.docid));
}

/**
 * Studios with an active live session (joined or active).
 *
 * DEFECT (pinned): this reads the FULL checked-in studio list, not the stage-filtered one that
 * idleStudios() takes — so the LIVE column can show a studio the IDLE column would have excluded as
 * belonging to another stage. It happens to be masked today because the live-assignment stream is
 * already filtered by stagename, but the asymmetry is real and one change to that query exposes it.
 */
export function liveStudios(studios: ArenaStudio[], liveAssignments: ArenaAssignment[]): ArenaStudio[] {
  const liveStudioIds = new Set((liveAssignments || []).map(a => a.studioid));
  return (studios || []).filter(s => liveStudioIds.has(s.docid));
}

/**
 * The INVITING cards: a pending invitation plus the studio it is ringing.
 *
 * Invitations for a studio that already has a live assignment are dropped — once the participant has
 * actually landed, the INVITING card should disappear even if the invitation doc is still pending.
 */
export function invitingStudios(
  invitations: ArenaInvitation[],
  studios: ArenaStudio[],
  liveAssignments: ArenaAssignment[],
): InvitingStudioRow[] {
  const liveStudioIds = new Set((liveAssignments || []).map(a => a.studioid));
  return (invitations || [])
    .filter(inv => !liveStudioIds.has(inv.studioid))
    .map(inv => ({
      studio: (studios || []).find(s => s.docid === inv.studioid) || null,
      invitation: inv,
    }));
}

/**
 * Invitations still alive: not resolved, and not past their expiry.
 *
 * DEFECT (pinned): the status guard is `if (inv.status && inv.status !== 'pending') return false`, so
 * an invitation doc with a MISSING or empty status is treated as pending and keeps ringing on the
 * board forever. A write that forgets the field produces a phantom INVITING card that the
 * coordinator cannot clear.
 */
export function filterPendingInvitations(rows: ArenaInvitation[], now: Date = new Date()): ArenaInvitation[] {
  return (rows || []).filter(inv => {
    if (inv.status && inv.status !== 'pending') return false;
    if (inv.expirydate && inv.expirydate.toDate && inv.expirydate.toDate() < now) return false;
    return true;
  });
}

/**
 * The Done feed: completed assignments whose activity was actually finished, newest first.
 *
 * The `isactivitydone === true` filter matches how the dashboard counts "Completed - All", so the
 * Arena's number agrees with the dashboard's.
 */
export function completedFeed(rows: ArenaAssignment[]): ArenaAssignment[] {
  const list = (rows || []).filter((a: any) => a['isactivitydone'] === true);
  list.sort((a: any, b: any) => {
    const tb = b?.['created']?.toMillis ? b['created'].toMillis() : 0;
    const ta = a?.['created']?.toMillis ? a['created'].toMillis() : 0;
    return tb - ta;
  });
  return list;
}

/** The `documentId() in [...]` chunks for the live-assignment-log subscription (Firestore caps at 30). */
export function logSubscriptionChunks(
  liveAssignments: ArenaAssignment[],
  size: number = LOG_SUB_CHUNK_SIZE,
): string[][] {
  const ids = Array.from(new Set((liveAssignments || []).map(a => a?.docid).filter(Boolean)));
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Stable key for a chunk set — re-subscribe only when the id SET changes, not on every emission. */
export function logSubscriptionKey(liveAssignments: ArenaAssignment[]): string {
  const ids = Array.from(new Set((liveAssignments || []).map(a => a?.docid).filter(Boolean)));
  return ids.slice().sort().join(',');
}

// =================================================================================================
// Presence — overlaying webhook truth (`live assignment log`) onto a live assignment
// =================================================================================================

const ms = (t: any): number => (typeof t?.toMillis === 'function' ? t.toMillis() : 0);

/**
 * Overlay webhook presence onto a live-assignment row so the presence predicates read reliable
 * SERVER truth rather than the client-stamped one-shots.
 *
 * Only fields the log actually has override the row. `participantReadyAt` is NEVER overridden — it
 * is a pre-Zoom wait-screen state the webhook cannot see. Timestamps are passed through untouched so
 * `.toDate()` / `.toMillis()` keep working downstream.
 *
 * DEFECT (pinned): "earliest join" and "latest leave" are picked with a comparator whose `ms()`
 * returns 0 for anything that is not a Firestore Timestamp. A `joinedAt` written as a plain Date or
 * an ISO string therefore scores 0 and ALWAYS wins the earliest-join reduce — the card's timer then
 * counts from that bogus value, and the same coercion makes such a value always LOSE the latest-leave
 * reduce. Presence quietly depends on the writer's data type.
 */
export function presenceOverlay(a: any, log: any): any {
  if (!log) return a;
  const specialists: any = log['specialists'] || {};
  const specVals: any[] = Object.values(specialists);
  const present = specVals.some(s => s && s.joinedAt && !s.leftAt);
  const joinedTs = specVals.map(s => s?.joinedAt).filter(Boolean);
  const leftTs = specVals.map(s => s?.leftAt).filter(Boolean);
  const overlay: any = {};
  if (log['participantInCallAt']) overlay['participantInCallAt'] = log['participantInCallAt'];
  if (log['participantLeftAt']) overlay['participantLeftAt'] = log['participantLeftAt'];
  if (joinedTs.length) {
    overlay['specialistJoinedAt'] = joinedTs.reduce((x, y) => ms(x) <= ms(y) ? x : y); // earliest join
    overlay['specialistLeftAt'] = present ? null
      : (leftTs.length ? leftTs.reduce((x, y) => ms(x) >= ms(y) ? x : y) : (log['meetingEndedAt'] || null)); // latest leave
  }
  return { ...a, ...overlay };
}

/** Is THIS specialist currently inside the call (joined and not left), per the webhook log? */
export function specialistPresentById(log: any, profileid: string): boolean {
  const s = log?.['specialists']?.[profileid];
  return !!(s && s.joinedAt && !s.leftAt);
}

/** Has THIS specialist joined at some point (they may have since left), per the webhook log? */
export function specialistJoinedById(log: any, profileid: string): boolean {
  const s = log?.['specialists']?.[profileid];
  return !!(s && s.joinedAt);
}

/** Anyone joined at all — splits JOINED (participant pulled in, Zoom not started) from ACTIVE. */
export function specialistJoined(presence: any): boolean {
  return !!presence?.specialistJoinedAt;
}

// =================================================================================================
// Call-state predicates — the only state ACTIVE cards branch on
// =================================================================================================
// Each person's "in call" state is determined SOLELY by their own join/left one-shots. We
// deliberately do not gate either party on the other party's leave — that would hide the case where
// one person dropped while the other is still in the meeting.

/** Specialist is currently inside the Zoom call. */
export function specialistInCall(presence: any): boolean {
  if (!presence?.specialistJoinedAt) return false;
  if (presence?.specialistLeftAt) return false; // explicitly left
  return true;
}

/** Participant is currently inside the Zoom call. */
export function participantInCall(presence: any): boolean {
  if (!presence?.participantInCallAt) return false;
  if (presence?.participantLeftAt) return false; // explicitly left
  return true;
}

export function bothInCall(presence: any): boolean {
  return specialistInCall(presence) && participantInCall(presence);
}

export function onlySpecialistLeft(presence: any): boolean {
  return !specialistInCall(presence) && participantInCall(presence);
}

export function onlyParticipantLeft(presence: any): boolean {
  return specialistInCall(presence) && !participantInCall(presence);
}

/**
 * Call ended = both parties gone AND at least one of them actually joined at some point, so a
 * still-loading session is never flagged as ended.
 */
export function callEnded(presence: any): boolean {
  if (specialistInCall(presence) || participantInCall(presence)) return false;
  return !!(presence?.specialistJoinedAt || presence?.participantInCallAt);
}

/**
 * Participant is at the studio / wait screen.
 *
 * Heartbeat removed — derived from the one-shot `participantReadyAt`, which is nulled on leave and
 * on joining the call, so its presence means "on the wait screen now".
 */
export function participantPresent(presence: any): boolean {
  return !!presence?.participantReadyAt && !presence?.participantLeftAt;
}

// =================================================================================================
// Timers and clocks
// =================================================================================================

/**
 * "M:SS" for a positive millisecond span; "0:00" for zero or negative.
 *
 * DEFECT (pinned): minutes are NOT wrapped into hours, so a 75-minute session reads "75:04" rather
 * than "1:15:04". A coordinator glancing at the board sees a number that looks like a clock but
 * isn't one, and long sessions get read as short ones.
 */
export function mmss(diffMs: number): string {
  if (diffMs <= 0) return '0:00';
  const total = Math.floor(diffMs / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "MM:SS" left before an invitation expires; "—" when the invitation carries no expiry. */
export function inviteCountdown(inv: ArenaInvitation | null | undefined, now: number = Date.now()): string {
  if (!inv?.expirydate?.toDate) return NO_NAME;
  return mmss(inv.expirydate.toDate().getTime() - now);
}

/** The later of the two leave stamps in millis, or null when neither party has a numeric leave time. */
export function latestLeaveMs(presence: any): number | null {
  const sLeft = presence?.specialistLeftAt?.toMillis?.();
  const pLeft = presence?.participantLeftAt?.toMillis?.();
  const cands = [sLeft, pLeft].filter((n: any) => typeof n === 'number');
  return cands.length ? Math.max(...cands) : null;
}

/**
 * Time since the specialist joined Zoom, as "M:SS". Only meaningful once they actually joined — for
 * JOINED cards (no specialistJoinedAt yet) use sinceStudioEntry().
 *
 * The timer freezes ONLY when both parties have left (callEnded), so a specialist who briefly drops
 * while the participant is still in the meeting does not stop the clock.
 */
export function sessionElapsed(presence: any, now: number = Date.now()): string {
  const ts = presence?.specialistJoinedAt?.toDate?.();
  if (!ts) return NO_NAME;
  let endMs = now;
  if (callEnded(presence)) {
    const last = latestLeaveMs(presence); // end time = whichever party left LAST
    if (last != null) endMs = last;
  }
  return mmss(endMs - ts.getTime());
}

/** Time since the participant entered the studio (the live assignment was created), as "M:SS". */
export function sinceStudioEntry(assignment: any, now: number = Date.now()): string {
  const ts = assignment?.['created']?.toDate?.();
  if (!ts) return NO_NAME;
  return mmss(now - ts.getTime());
}

/**
 * 12-hour clock with AM/PM, e.g. "9:42 AM" / "2:05 PM", so coordinators read start and end times the
 * way they see them on a phone rather than in 24-hour form.
 */
export function formatClock(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/** Clock time the specialist joined the call, or "—". */
export function callStartedClock(presence: any): string {
  const ts = presence?.specialistJoinedAt?.toDate?.();
  if (!ts) return NO_NAME;
  return formatClock(ts);
}

/** Clock time the call ended (the later of the two leave stamps), or "—". */
export function callEndedClock(presence: any): string {
  const last = latestLeaveMs(presence);
  if (last == null) return NO_NAME;
  return formatClock(new Date(last));
}

// =================================================================================================
// Card labels and rosters
// =================================================================================================

/** Up to two uppercase initials, or "?" for an empty name. */
export function initials(name: string): string {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');
}

/** Resolved display name for a profile id, or the em-dash placeholder. */
export function participantName(mapProfile: NameMap, profileid: string): string {
  return mapProfile[profileid] || NO_NAME;
}

/** True once a REAL name is resolved — used to hide "→ —" chips while a profile is still loading. */
export function hasName(mapProfile: NameMap, profileid: string): boolean {
  return !!profileid && !!mapProfile[profileid];
}

/** "1 attempt" / "3 attempts". A missing count reads as 1. */
export function attemptsLabel(inv: ArenaInvitation): string {
  return `${inv.attempts ?? 1} attempt${(inv.attempts ?? 1) === 1 ? '' : 's'}`;
}

/**
 * The studio's specialists for the sidebar.
 *
 * Note the fallback differs from participantName(): an unresolved specialist shows their raw ID here,
 * not "—", because the sidebar is a debugging surface for the coordinator.
 */
export function specialistList(
  studio: ArenaStudio | null,
  mapProfile: NameMap,
  mapActivity: NameMap,
): { name: string; activity: string }[] {
  if (!studio) return [];
  return (studio.participants || []).map(pid => ({
    name: mapProfile[pid] || pid,
    activity: mapActivity[studio.participantsactivity?.[pid] || ''] || '',
  }));
}

/** ALL paired specialists on an assignment, so JOINED / ACTIVE cards list everyone in the session. */
export function pairingSpecialists(
  a: ArenaAssignment,
  mapProfile: NameMap,
  mapActivity: NameMap,
): NamedSpecialist[] {
  return (a.pairing || []).map(pid => ({
    id: pid,
    name: participantName(mapProfile, pid),
    activity: mapActivity[a.participantsactivity?.[pid] || ''] || '',
  }));
}

/**
 * Bonus-activity ("additional") specialists on an assignment, keyed by profile id.
 * The main pairing specialists and the participant are excluded so nobody is listed twice.
 */
export function bonusSpecialists(
  a: ArenaAssignment,
  mapProfile: NameMap,
  mapActivity: NameMap,
): NamedSpecialist[] {
  const exclude = new Set<string>([a.participantid, ...(a.pairing || [])]);
  return Object.keys(a.bonusactivity || {})
    .filter(pid => !exclude.has(pid))
    .map(pid => ({
      id: pid,
      name: participantName(mapProfile, pid),
      activity: mapActivity[a.bonusactivity?.[pid] || ''] || '',
    }));
}

/** Which field on a fetched `profile_data` doc counts as the display name. '' when none of them do. */
export function displayNameFromProfileDoc(d: any): string {
  return d?.['name'] || d?.['profilename'] || d?.['displayname'] || '';
}

// =================================================================================================
// Chat
// =================================================================================================

/** Chat-list label for a studio: "Name - Activity, Name - Activity", or "Studio" when empty. */
export function studioChatName(
  studio: ArenaStudio,
  mapProfile: NameMap,
  mapActivity: NameMap,
): string {
  const list = specialistList(studio, mapProfile, mapActivity);
  return list.length
    ? list.map(p => `${p.name}${p.activity ? ' - ' + p.activity : ''}`).join(', ')
    : 'Studio';
}

/** The whole studioid → chat-label cache, rebuilt whenever the studio list or name maps change. */
export function buildChatNameCache(
  studios: ArenaStudio[],
  mapProfile: NameMap,
  mapActivity: NameMap,
): { [studioid: string]: string } {
  const cache: { [studioid: string]: string } = {};
  (studios || []).forEach(s => { cache[s.docid] = studioChatName(s, mapProfile, mapActivity); });
  return cache;
}

/** Per-studio unread message counts from the pending-messages collection-group rows. */
export function unreadCountsByStudio(msgs: any[]): { [studioid: string]: number } {
  const counts: { [studioid: string]: number } = {};
  (msgs || []).forEach((m: any) => {
    const sid = m['studioid'];
    counts[sid] = (counts[sid] ?? 0) + 1;
  });
  return counts;
}

/**
 * Chat-activity ordering: unread studios first, then most-recent message first.
 *
 * `keyOf` says which id on the row identifies the studio, so the same comparator orders both the
 * studio list (`docid`) and the live-assignment list (`studioid`).
 */
export function sortByChatActivity<T>(
  rows: T[],
  keyOf: (row: T) => string,
  unreadStudioIds: Set<string>,
  chatThreads: { [studioid: string]: any },
): T[] {
  const score = (id: string) => ({
    unread: unreadStudioIds.has(id) ? 1 : 0,
    time: chatThreads[id]?.lastmessageat?.toMillis?.() ?? 0,
  });
  return [...(rows || [])].sort((a, b) => {
    const as = score(keyOf(a)), bs = score(keyOf(b));
    if (bs.unread !== as.unread) return bs.unread - as.unread;
    return bs.time - as.time;
  });
}

/** Which chat messages this user still owes a read receipt for. */
export function unreadMessagesFor(messages: any[], profileid: string): any[] {
  return (messages || []).filter(m =>
    m['sent_by'] !== profileid && (m['pending'] ?? []).includes(profileid)
  );
}

/** Attachment preview / rendering decision. */
export function isImageFile(filename: string): boolean {
  return IMAGE_FILE_RE.test(filename || '');
}

/** A chat attachment is accepted only under the size cap. */
export function isAcceptableChatFile(size: number, max: number = CHAT_FILE_MAX_BYTES): boolean {
  return size <= max;
}

/**
 * Turn a chat message into display HTML: newlines become <br>, bare URLs become links.
 *
 * The caller still owns the DomSanitizer call — this returns a plain string.
 *
 * DEFECT (pinned): newlines are converted to `<br>` BEFORE the URL regex runs, and the regex matches
 * `[^\s]+`. A URL at the end of a line therefore swallows the following `<br>` into its own href and
 * link text — the link points at "https://example.com<br>" and 404s, and the line break disappears.
 */
export function linkifyMessage(message: string, linkColor: string = '#1a56db'): string {
  if (!message) return '';
  let processed = message.replace(/\n/g, '<br>');
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  processed = processed.replace(urlRegex, `<a href="$1" target="_blank" rel="noopener" style="color:${linkColor};word-break:break-word;overflow-wrap:anywhere;">$1</a>`);
  return processed;
}
