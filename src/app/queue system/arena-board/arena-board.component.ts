import { Component, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {collection, collectionData, doc, docData, Firestore,query, where, orderBy, getDoc, getDocs, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, writeBatch, limit, startAfter, collectionGroup} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Subject, Subscription, takeUntil, catchError, of } from 'rxjs';
import { AuthguardService } from '../../authguard.service';

type ArenaTab = 'participants' | 'specialists';
type ArenaRightTab = 'done' | 'chat';

interface ArenaToken {
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

interface ArenaStudio {
  docid: string;
  participants: string[];      // specialist ids
  participantsactivity?: { [profileid: string]: string };
  queueid: string;
  currentstage?: string;
  checkin?: boolean;
  active?: boolean;
}

interface ArenaInvitation {
  docid: string;
  studioid: string;
  tokenref: any;
  stage: string;
  status: string;             // 'pending' | 'success' | 'cancelled'
  expirydate?: any;
  createddate?: any;
  participantname?: string;
  attempts?: number;
}

interface ArenaAssignment {
  docid: string;
  studioid: string;
  stagename: string;
  status: 'live' | 'completed';
  participantid: string;
  pairing?: string[];
  participantsactivity?: { [profileid: string]: string };
  bonusactivity?: { [profileid: string]: string }; // additional-activity specialists keyed by profile id
  specialistJoinedAt?: any;          // call START (preserved across rejoin)
  specialistLeftAt?: any;            // stamped on host pagehide / ngOnDestroy
  participantReadyAt?: any;
  participantInCallAt?: any;
  participantLeftAt?: any;           // stamped on participant pagehide / ngOnDestroy
  token?: any;
  zoomdata?: any;
  created?: any;
}

@Component({
  selector: 'app-arena-board',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, FormsModule],
  templateUrl: './arena-board.component.html',
  styleUrl: './arena-board.component.css'
})
export class ArenaBoardComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  private nowTick = 0;
  private nowTimer: any = null;

  queueid = '';
  stage = '';
  queueName = '';
  queueData: any = null;

  // Set when any board-data Firestore stream errors out (e.g. the WebChannel
  // Listen stream stalls on a hostile network, a missing composite index, or a
  // rules denial). Without this the stream dies silently and the board just
  // shows nothing with no explanation — the exact "board not showing data"
  // symptom. Surfaced as a retryable banner instead.
  loadError: string | null = null;
  private flagLoadError = (e: any) => {
    console.error('[arena-board] data load error', e);
    this.loadError = 'Some board data failed to load (connection or permissions). Tap Retry.';
    return of([] as any[]);
  };
  retryLoad(): void { this.loadError = null; window.location.reload(); }

  // Tabs
  leftTab: ArenaTab = 'participants';
  rightTab: ArenaRightTab = 'done';

  // Side-panel open/closed state — both sidenavs are collapsible so the
  // coordinator can give the kanban board the full width when needed.
  leftOpen = true;
  rightOpen = true;

  // Profile lookups
  mapProfile: { [id: string]: string } = {};
  mapActivity: { [id: string]: string } = {};

  // Data
  tokens: ArenaToken[] = [];
  studios: ArenaStudio[] = [];
  invitations: ArenaInvitation[] = [];
  liveAssignments: ArenaAssignment[] = [];
  completedAssignments: ArenaAssignment[] = [];
  //chat
  profileid = '';
  chatThreads: { [studioid: string]: any } = {};
  private chatNameCache: { [studioid: string]: string } = {};
  unreadStudioIds: Set<string> = new Set();
  studioUnreadCounts: { [studioid: string]: number } = {};
  selectedChatStudioId = '';
  chatMessages: any[] = [];
  chatText = '';
  chatAttachedFiles: any[] = [];
  chatUploading = false;
  chatHasMore = false;
  chatLoadingMore = false;
  private chatFirstDoc: any = null;
  private chatPageSize = 10;
  private chatThreadSub: Subscription = null;
  private chatUnreadSub: Subscription = null;
  private chatLiveSub: Subscription = null;
  @ViewChild('chatMessagesScroll') chatMessagesScroll: ElementRef;
  expandedImage: string | null = null;

  constructor(
      private route: ActivatedRoute,
      public router: Router,
      private firestore: Firestore,
      private guard: AuthguardService,
      private storage: Storage,
      private sanitizer: DomSanitizer
    ) {
    this.route.paramMap.subscribe(params => {
      this.queueid = params.get('queueid') || '';
      this.stage = params.get('stage') || '';
      if (this.queueid && this.stage) this.bootstrap();
    });

    this.guard.getRoles().then(roles => {
      this.profileid = roles?.['profile_ref']?.id || '';
      this.subscribeChatThreads();
      this.requestNotificationPermission();

    });

    // Tick every second so live timers refresh in the view
    this.nowTimer = setInterval(() => { this.nowTick++; }, 1000);
  }

  private async bootstrap() {
    // Load queue meta
    try {
      const qSnap = await getDoc(doc(this.firestore, 'queue generation', this.queueid));
      if (qSnap.exists()) {
        this.queueData = qSnap.data();
        this.queueName = this.queueData?.queuename || '';
      }
    } catch {}

    // Profile + activity maps from the auth guard (already cached project-wide)
    try {
      const profileMap = await this.guard.getProfileMap();
      this.mapProfile = profileMap?.map || {};
    } catch {}
    this.rebuildChatNameCache();
    try {
      collectionData(collection(this.firestore, 'bigactivity'), { idField: 'id' })
        .pipe(takeUntil(this.destroy$))
        .subscribe((list: any[]) => {
          list.forEach(a => { this.mapActivity[a['docid']] = a['activity']; });
        });
    } catch {}

    // Tokens at this queue (filter by stage client-side). The dashboard
    // queries by queueref (a DocumentReference) + tokenstatus=Active, not by
    // the string queueid — match its shape so we get the same rows.
    const queueRef = doc(this.firestore, 'queue generation', this.queueid);
    collectionData(
      query(
        collection(this.firestore, 'queue_token'),
        where('queueref', '==', queueRef),
        where('tokenstatus', '==', 'Active')
      ),
      { idField: 'docid' }
    ).pipe(takeUntil(this.destroy$), catchError(this.flagLoadError)).subscribe(rows => {
      // Sort by `queueposition` (same field the dynamic queue manager uses to
      // order the queue) so Waiting / Queued show the same canonical order.
      // Fall back to `tokennumber` if `queueposition` is missing.
      this.tokens = (rows as ArenaToken[])
        .filter(t => t.currentstage === this.stage)
        .sort((a, b) => {
          const ap = a.queueposition ?? a.tokennumber ?? Number.MAX_SAFE_INTEGER;
          const bp = b.queueposition ?? b.tokennumber ?? Number.MAX_SAFE_INTEGER;
          return ap - bp;
        });
      // Lazy-load tokens' participant + preassigned specialist names so the
      // sidebar doesn't render a leading "→ —" while the auth-guard cache
      // catches up.
      this.tokens.forEach(t => {
        if (t.profile_id) this.ensureProfileLoaded(t.profile_id);
        const pre = t.preassigned?.[this.stage] || [];
        pre.forEach(id => this.ensureProfileLoaded(id));
      });
    });

    // Studios in this queue (filter to "checked-in" client-side).
    // queue_studio_pairing is also keyed by queueref. Stage assignment is
    // derived from the studio's `participantsactivity` map vs queue stage
    // properties — for the Arena we accept all checked-in studios in this
    // queue and let the columns decide who is idle / inviting / joined /
    // active based on live-assignment + invitation state.
    collectionData(
      query(
        collection(this.firestore, 'queue studio pairing'),
        where('queueref', '==', queueRef)
      ),
      { idField: 'docid' }
    ).pipe(takeUntil(this.destroy$), catchError(this.flagLoadError)).subscribe(rows => {
      this.studios = (rows as ArenaStudio[]).filter((s: any) =>
        s['studioin'] === true && s['checkin'] === true
      );
      this.rebuildChatNameCache();
      this.sortStudiosAndAssignments();
    });

    // Pending invitations for this stage
    collectionData(
      query(
        collection(this.firestore, 'studioinvitation'),
        where('stage', '==', this.stage),
        where('queueref', '==', doc(this.firestore, 'queue generation', this.queueid))
      ),
      { idField: 'docid' }
    ).pipe(takeUntil(this.destroy$), catchError(this.flagLoadError)).subscribe(rows => {
      // Keep only pending (still alive)
      const now = new Date();
      this.invitations = (rows as ArenaInvitation[]).filter(inv => {
        if (inv.status && inv.status !== 'pending') return false;
        if (inv.expirydate && inv.expirydate.toDate && inv.expirydate.toDate() < now) return false;
        return true;
      });
    });

    // Live assignments for this stage (in-studio / joined / active)
    collectionData(
      query(
        collection(this.firestore, 'live assignment'),
        where('queueid', '==', this.queueid),
        where('stagename', '==', this.stage),
        where('status', '==', 'live')
      ),
      { idField: 'docid' }
    ).pipe(takeUntil(this.destroy$), catchError(this.flagLoadError)).subscribe(rows => {
      this.liveAssignments = rows as ArenaAssignment[];
      this.sortStudiosAndAssignments();
      // Lazy-load profiles for participants and pairing specialists so cards
      // show real names instead of "—" immediately after a participant lands.
      this.liveAssignments.forEach(a => {
        if (a.participantid) this.ensureProfileLoaded(a.participantid);
        (a.pairing || []).forEach(pid => this.ensureProfileLoaded(pid));
        // Bonus-activity (additional) specialists are keyed by profile id.
        Object.keys(a.bonusactivity || {}).forEach(pid => this.ensureProfileLoaded(pid));
      });
    });

    // Completed assignments for the Done feed.
    // The dashboard counts only completed + isactivitydone === true. Match it
    // so the Arena's count agrees with "Completed - All" on the dashboard.
    collectionData(
      query(
        collection(this.firestore, 'live assignment'),
        where('queueid', '==', this.queueid),
        where('stagename', '==', this.stage),
        where('status', '==', 'completed')
      ),
      { idField: 'docid' }
    ).pipe(takeUntil(this.destroy$), catchError(this.flagLoadError)).subscribe(rows => {
      const list = (rows as ArenaAssignment[]).filter((a: any) => a['isactivitydone'] === true);
      list.sort((a: any, b: any) => {
        const tb = b?.['created']?.toMillis ? b['created'].toMillis() : 0;
        const ta = a?.['created']?.toMillis ? a['created'].toMillis() : 0;
        return tb - ta;
      });
      this.completedAssignments = list;
    });
  }

  // ---- Derived data --------------------------------------------------------

  // Waiting = ready tokens (next-up). Queued = queued/invited/null.
  get waitingTokens(): ArenaToken[] {
    return this.tokens.filter(t => t.status === 'ready');
  }
  get queuedTokens(): ArenaToken[] {
    return this.tokens.filter(t => t.status == null || t.status === 'queued' || t.status === 'invited');
  }

  // Studios that actually serve THIS stage. `this.studios` holds every
  // checked-in studio in the queue (a studio isn't bound to one stage — it can
  // be eligible for several), so without this filter the IDLE column, the
  // Specialists tab count and the right-panel studio list bleed in studios from
  // OTHER stages of the same queue — i.e. data unrelated to the card that was
  // clicked, and identical across two different-stage boards of one queue.
  // Eligibility is derived the same way dynamic-studio-v2 + the dashboard do it:
  // the studio's sorted participant-activity signature must match one of the
  // stage's `compulsoryactivity` combinations. If the stage has no activity
  // config we deliberately DON'T filter (fall back to all checked-in studios)
  // so a missing/edge config can never blank the board.
  get stageStudios(): ArenaStudio[] {
    const combos = this.stageActivityCombos();
    if (combos.length === 0) return this.studios;
    return this.studios.filter(s => combos.includes(this.studioActivitySignature(s)));
  }

  private stageActivityCombos(): string[] {
    const sp = this.queueData?.['stageproperty']?.[this.stage];
    return Object.values(sp?.['compulsoryactivity'] ?? {}).map((c: any) =>
      (Array.isArray(c) ? c : [c]).map(String).sort((a, b) => a.localeCompare(b)).join(',')
    );
  }

  private studioActivitySignature(s: ArenaStudio): string {
    return Object.values(s.participantsactivity ?? {})
      .map(String).sort((a, b) => a.localeCompare(b)).join(',');
  }

  // Studios in each column
  get idleStudios(): ArenaStudio[] {
    // A studio is "idle" if it is checked in but has no live assignment AND no active invitation
    const liveStudioIds = new Set(this.liveAssignments.map(a => a.studioid));
    const invitingStudioIds = new Set(this.invitations.map(i => i.studioid));
    return this.stageStudios.filter(s => !liveStudioIds.has(s.docid) && !invitingStudioIds.has(s.docid));
  }

  // Studios with an active live session (joined or active)
  get liveStudios(): ArenaStudio[] {
    const liveStudioIds = new Set(this.liveAssignments.map(a => a.studioid));
    return this.studios.filter(s => liveStudioIds.has(s.docid));
  }
  get invitingStudios(): { studio: ArenaStudio | null, invitation: ArenaInvitation }[] {
    // Exclude invitations for studios that already have a live assignment —
    // once the participant has actually landed in the studio (live assignment
    // created), the INVITING card should disappear even if the invitation doc
    // is still pending in Firestore.
    const liveStudioIds = new Set(this.liveAssignments.map(a => a.studioid));
    return this.invitations
      .filter(inv => !liveStudioIds.has(inv.studioid))
      .map(inv => ({
        studio: this.studios.find(s => s.docid === inv.studioid) || null,
        invitation: inv,
      }));
  }
  // Joined = participant pulled into studio but Zoom not yet started
  get joinedAssignments(): ArenaAssignment[] {
    return this.liveAssignments.filter(a => !a.specialistJoinedAt);
  }
  // Active = the Zoom call has started OR is ending. We keep ended-but-not-
  // yet-completed sessions in this column so the coordinator can see that the
  // call has wrapped up (vs the card just disappearing). The timer freezes at
  // the last leave timestamp via sessionElapsed().
  get activeAssignments(): ArenaAssignment[] {
    return this.liveAssignments.filter(a => !!a.specialistJoinedAt);
  }

  // Header counters
  get activeCount(): number { return this.activeAssignments.length; }
  get seDoneCount(): number {
    return this.completedAssignments.length;
  }
  get atcDoneCount(): number {
    // Approximate via completed assignments — refine later if you store ATC count separately
    return this.completedAssignments.length;
  }
  get waitingCount(): number { return this.waitingTokens.length; }
  get queuedCount(): number { return this.queuedTokens.length; }

  // ---- Helpers -------------------------------------------------------------

  initials(name: string): string {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');
  }

  participantName(profileid: string): string {
    return this.mapProfile[profileid] || '—';
  }

  // Bonus-activity (additional) specialists for an assignment. Keyed by
  // profile id on the live assignment; we exclude the main pairing specialist
  // and the participant so the same person isn't listed twice.
  bonusSpecialists(a: ArenaAssignment): { id: string, name: string, activity: string }[] {
    const exclude = new Set<string>([a.participantid, ...(a.pairing || [])]);
    return Object.keys(a.bonusactivity || {})
      .filter(pid => !exclude.has(pid))
      .map(pid => ({
        id: pid,
        name: this.participantName(pid),
        activity: this.mapActivity[a.bonusactivity?.[pid] || ''] || ''
      }));
  }

  // True when we've resolved a real name for this id (i.e. the chip is worth
  // rendering — used to hide "→ —" rows in the Queued list when the
  // preassigned specialist hasn't loaded yet).
  hasName(profileid: string): boolean {
    return !!profileid && !!this.mapProfile[profileid];
  }

  // Lazy-load a profile that isn't in the auth-guard cache. Used when a new
  // participant lands in a studio or a preassigned specialist isn't in the
  // initial profile map. Idempotent — only fetches once per id.
  private profileFetchInflight = new Set<string>();
  async ensureProfileLoaded(profileid: string): Promise<void> {
    if (!profileid) return;
    if (this.mapProfile[profileid]) return;
    if (this.profileFetchInflight.has(profileid)) return;
    this.profileFetchInflight.add(profileid);
    try {
      const snap = await getDoc(doc(this.firestore, 'profile_data', profileid));
      if (snap.exists()) {
        const d: any = snap.data();
        const name = d?.['name'] || d?.['profilename'] || d?.['displayname'] || '';
        if (name) this.mapProfile[profileid] = name;
      }
    } catch (e) {
      console.warn('ensureProfileLoaded failed', profileid, e);
    } finally {
      this.profileFetchInflight.delete(profileid);
    }
  }

  specialistList(studio: ArenaStudio | null): { name: string, activity: string }[] {
    if (!studio) return [];
    return (studio.participants || []).map(pid => ({
      name: this.mapProfile[pid] || pid,
      activity: this.mapActivity[studio.participantsactivity?.[pid] || ''] || '',
    }));
  }

  // All paired specialists on an assignment (not just pairing[0]) so the
  // JOINED / ACTIVE cards list every specialist in the session, with their
  // activity when one is recorded.
  pairingSpecialists(a: ArenaAssignment): { id: string, name: string, activity: string }[] {
    return (a.pairing || []).map(pid => ({
      id: pid,
      name: this.participantName(pid),
      activity: this.mapActivity[a.participantsactivity?.[pid] || ''] || '',
    }));
  }

  // Returns the queue position to display, or null when the token has no
  // `queueposition` field. The chip is hidden via *ngIf when this is null —
  // we deliberately do NOT fall back to `tokennumber` or array index because
  // those are different concepts and would mislead the coordinator.
  positionInWaiting(token: ArenaToken): number | null {
    return token?.queueposition ?? null;
  }
  positionInQueued(token: ArenaToken): number | null {
    return token?.queueposition ?? null;
  }
  hasPosition(token: ArenaToken): boolean {
    return token?.queueposition != null;
  }

  // Returns the count of attempts for an invitation
  attemptsLabel(inv: ArenaInvitation): string {
    return `${inv.attempts ?? 1} attempt${(inv.attempts ?? 1) === 1 ? '' : 's'}`;
  }

  // Returns "MM:SS" time remaining until an invitation expires
  inviteCountdown(inv: ArenaInvitation): string {
    void this.nowTick;
    if (!inv?.expirydate?.toDate) return '—';
    const diffMs = inv.expirydate.toDate().getTime() - Date.now();
    if (diffMs <= 0) return '0:00';
    const total = Math.floor(diffMs / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Returns time elapsed since join in MM:SS — only meaningful when the
  // specialist has actually joined Zoom (i.e., for ACTIVE cards). For JOINED
  // cards (no specialistJoinedAt yet) use sinceStudioEntry().
  // The timer freezes ONLY when both parties have left (callEnded), so a
  // specialist who briefly drops while the participant is still in the meet
  // does not stop the timer.
  sessionElapsed(assignment: ArenaAssignment): string {
    void this.nowTick;
    const ts = assignment?.specialistJoinedAt?.toDate?.();
    if (!ts) return '—';
    let endMs = Date.now();
    if (this.callEnded(assignment)) {
      // End time = whichever party left LAST.
      const sLeft = assignment?.specialistLeftAt?.toMillis?.();
      const pLeft = assignment?.participantLeftAt?.toMillis?.();
      const candidates = [sLeft, pLeft].filter((n: any) => typeof n === 'number');
      if (candidates.length) endMs = Math.max(...candidates);
    }
    const diffMs = endMs - ts.getTime();
    if (diffMs <= 0) return '0:00';
    const total = Math.floor(diffMs / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Clock time the specialist joined the Zoom call (e.g. "14:32").
  callStartedClock(a: ArenaAssignment): string {
    const ts = a?.specialistJoinedAt?.toDate?.();
    if (!ts) return '—';
    return this.formatClock(ts);
  }

  // Clock time the call ended (latest of the two leave timestamps).
  callEndedClock(a: ArenaAssignment): string {
    const sLeft = a?.specialistLeftAt?.toMillis?.();
    const pLeft = a?.participantLeftAt?.toMillis?.();
    const cands = [sLeft, pLeft].filter((n: any) => typeof n === 'number');
    if (!cands.length) return '—';
    return this.formatClock(new Date(Math.max(...cands)));
  }

  // 12-hour clock with AM/PM (e.g. "9:42 AM", "2:05 PM") so coordinators read
  // the start/end time the same way they see it on a phone, not 24-hour.
  private formatClock(d: Date): string {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }

  // True when the participant is at the studio/wait screen. Heartbeat removed
  // (see plan) — derived from the one-shot `participantReadyAt` (nulled on
  // leave/in-call, so its presence means "on the wait screen now").
  participantPresent(assignment: ArenaAssignment): boolean {
    void this.nowTick;
    return !!assignment?.participantReadyAt && !assignment?.participantLeftAt;
  }

  // ---- ACTIVE-card presence helpers ----------------------------------------
  // Each person's "in call" state is determined SOLELY by their own
  // join/left one-shots (heartbeat removed — see plan). We deliberately do not
  // gate either party on the other party's leave — that would hide the case
  // where one person dropped while the other is still in the meeting.

  // Specialist is currently inside the Zoom call.
  specialistInCall(a: ArenaAssignment): boolean {
    void this.nowTick;
    if (!a?.specialistJoinedAt) return false;
    if (a?.specialistLeftAt) return false; // explicitly left
    return true;
  }

  // Participant is currently inside the Zoom call.
  participantInCall(a: ArenaAssignment): boolean {
    void this.nowTick;
    if (!a?.participantInCallAt) return false;
    if (a?.participantLeftAt) return false; // explicitly left
    return true;
  }

  // Derived call-state predicates (the only state ACTIVE cards branch on)
  bothInCall(a: ArenaAssignment): boolean {
    return this.specialistInCall(a) && this.participantInCall(a);
  }
  onlySpecialistLeft(a: ArenaAssignment): boolean {
    return !this.specialistInCall(a) && this.participantInCall(a);
  }
  onlyParticipantLeft(a: ArenaAssignment): boolean {
    return this.specialistInCall(a) && !this.participantInCall(a);
  }
  // Call ended = both parties gone AND at least one of them actually joined
  // at some point (so we're not flagging a still-loading session as ended).
  callEnded(a: ArenaAssignment): boolean {
    if (this.specialistInCall(a) || this.participantInCall(a)) return false;
    return !!(a?.specialistJoinedAt || a?.participantInCallAt);
  }

  // Time since the participant entered the studio (live assignment was created)
  sinceStudioEntry(assignment: ArenaAssignment): string {
    void this.nowTick;
    const ts = assignment?.['created']?.toDate?.();
    if (!ts) return '—';
    const diffMs = Date.now() - ts.getTime();
    if (diffMs <= 0) return '0:00';
    const total = Math.floor(diffMs / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/eventopportunitydashboard']);
    }
  }

  subscribeChatThreads() {
    this.chatThreadSub?.unsubscribe();
    this.chatUnreadSub?.unsubscribe();
    if (!this.queueid) return;
    this.chatThreadSub = collectionData(
      query(collection(this.firestore, 'studio_chat'), where('queueid', '==', this.queueid))).pipe(takeUntil(this.destroy$)).subscribe(threads => {
      const map: any = {};
      threads.forEach((t: any) => map[t.studioid] = t);
      this.chatThreads = map;
      this.sortStudiosAndAssignments();
    });

    if (this.profileid) {
    const seenMsgIds = new Set<string>()
    let initialLoadDone = false
    this.chatUnreadSub = collectionData(query(collectionGroup(this.firestore, 'messages'), where('pending', 'array-contains', this.profileid),where('queueid', '==', this.queueid))).pipe(takeUntil(this.destroy$)).subscribe(msgs =>
    {
      this.unreadStudioIds = new Set(msgs.map((m: any) => m['studioid']));
      const counts: { [studioid: string]: number } = {};
      msgs.forEach((m: any) => {
        const sid = m['studioid'];
        counts[sid] = (counts[sid] ?? 0) + 1;
      });
      this.studioUnreadCounts = counts;
      this.sortStudiosAndAssignments();
      msgs.forEach((m: any) => {
        const msgid = m['messageid']
        if (!msgid) return
        if (!seenMsgIds.has(msgid)) {
          if (initialLoadDone) {
            const studioName = this.getStudioChatName(m['studioid'])
            this.showChatNotification(m['message'] || 'Sent an attachment', studioName, m['studioid'])
          }
          seenMsgIds.add(msgid)
        }
      })
      initialLoadDone = true
    });
    }
  }

  private rebuildChatNameCache(): void {
    const cache: { [studioid: string]: string } = {};
    this.studios.forEach(s => {
      const list = this.specialistList(s);
      cache[s.docid] = list.length? list.map(p => `${p.name}${p.activity ? ' - ' + p.activity : ''}`).join(', '): 'Studio';
    });
    this.chatNameCache = cache;
  }

  backToChatList() {
    this.chatLiveSub?.unsubscribe();
    this.selectedChatStudioId = '';
    this.chatMessages = [];
  }

  async openStudioChat(studioid: string) {
    const alreadyLoaded = this.selectedChatStudioId === studioid && this.chatMessages.length > 0;
    
    const threadRef = doc(this.firestore, 'studio_chat', studioid);
    const snap = await getDoc(threadRef);
    const studio = this.studios.find(s => s.docid === studioid);
    const participants = studio?.participants ?? [];
    if (!snap.exists()) {
      await setDoc(threadRef, {
        studioid,
        queueid: this.queueid,
        liveassignmentid: [],
        currentliveassignmentid: null,
        lastmessage: null,
        lastmessageat: null,
        createdat: serverTimestamp(),
        profileid: [...participants, this.profileid]
      });
    } else if (!(snap.data()?.['profileid'] ?? []).includes(this.profileid)) {
      await updateDoc(threadRef, { profileid: arrayUnion(this.profileid) });
    }

    this.selectedChatStudioId = studioid;
    if (!alreadyLoaded) {
      this.chatMessages = [];
      this.chatFirstDoc = null;
      this.chatHasMore = false;
      const q = query(collection(this.firestore, 'studio_chat', studioid, 'messages'),orderBy('sentat', 'desc'),limit(this.chatPageSize));
      const snap = await getDocs(q);
      const reversed = [...snap.docs].reverse();
      this.chatFirstDoc = reversed[0] ?? null;
      this.chatHasMore = snap.docs.length === this.chatPageSize;
      this.chatMessages = reversed.map(d => d.data());
    }
    this.markChatRead(studioid);
    setTimeout(() => {
      if (this.chatMessagesScroll) this.chatMessagesScroll.nativeElement.scrollTop = this.chatMessagesScroll.nativeElement.scrollHeight;
    }, 50);
    // Live-watch for new messages sent after this page loaded.
    this.chatLiveSub?.unsubscribe();
    const sinceTime = this.chatMessages.length? this.chatMessages[this.chatMessages.length - 1]['sentat']: null;
    let liveQuery = query(collection(this.firestore, 'studio_chat', studioid, 'messages'),orderBy('sentat', 'asc'));
    if (sinceTime) {
      liveQuery = query(collection(this.firestore, 'studio_chat', studioid, 'messages'),orderBy('sentat', 'asc'),where('sentat', '>', sinceTime));
    }
    this.chatLiveSub = collectionData(liveQuery).pipe(takeUntil(this.destroy$)).subscribe(newMsgs => {
      newMsgs.forEach((m: any) => {
        if (!this.chatMessages.some(existing => existing['messageid'] === m['messageid'])) {
          this.chatMessages = [...this.chatMessages, m];
          this.markChatRead(studioid);
          if (m['sent_by'] !== this.profileid && this.selectedChatStudioId === studioid) {
            const studioName = this.getStudioChatName(studioid);
            this.showChatNotification(m['message'] || 'Sent an attachment', studioName, studioid);
          }
          setTimeout(() => {
            if (this.chatMessagesScroll) this.chatMessagesScroll.nativeElement.scrollTop = this.chatMessagesScroll.nativeElement.scrollHeight;
          }, 50);
        }
      });
    });
  }

  async loadMoreChatMessages() {
    if (!this.chatHasMore || this.chatLoadingMore || !this.chatFirstDoc || !this.selectedChatStudioId) return;
    this.chatLoadingMore = true;
    const q = query(
      collection(this.firestore, 'studio_chat', this.selectedChatStudioId, 'messages'),
      orderBy('sentat', 'desc'),
      startAfter(this.chatFirstDoc),
      limit(this.chatPageSize)
    );
    const snap = await getDocs(q);
    const reversed = [...snap.docs].reverse();
    this.chatFirstDoc = reversed[0] ?? this.chatFirstDoc;
    this.chatHasMore = snap.docs.length === this.chatPageSize;
    this.chatMessages = [...reversed.map(d => d.data()), ...this.chatMessages];
    this.chatLoadingMore = false;
  }

  private markChatRead(studioid: string) {
    const unread = this.chatMessages.filter(m =>
      m['sent_by'] !== this.profileid && (m['pending'] ?? []).includes(this.profileid)
    );
    if (!unread.length) return;
    const batch = writeBatch(this.firestore);
    unread.forEach(m => {
      batch.update(
        doc(this.firestore, 'studio_chat', studioid, 'messages', m['messageid']),
        { pending: arrayRemove(this.profileid), read_by: arrayUnion(this.profileid) }
      );
    });
    batch.commit().catch(() => {});
  }

  onChatFileSelected(event: any) {
    Array.from(event.target.files as FileList).forEach((file: File) => {
      if (file.size > 10 * 1024 * 1024) return;
      const entry: any = { file, filename: file.name, fileurl: '' };
      if (this.isImageFile(file.name)) {
        const reader = new FileReader();
        reader.onload = e => { entry.fileurl = e.target?.result as string; };
        reader.readAsDataURL(file);
      }
      this.chatAttachedFiles.push(entry);
    });
  }

  removeChatFile(index: number) {
    this.chatAttachedFiles.splice(index, 1);
  }

  isImageFile(filename: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename || '');
  }

  async sendChatMessage() {
      if (this.chatUploading) return
    if (!this.chatText.trim() && !this.chatAttachedFiles.length) return;
    if (!this.selectedChatStudioId) return;
    this.chatUploading = true;
    const studioid = this.selectedChatStudioId;
    const thread = this.chatThreads[studioid];
    const queueid = this.queueid;
    const text = this.chatText.trim();
    this.chatText = '';
    const profileids: string[] = thread?.profileid ?? [];
    const pending = profileids.filter(id => id !== this.profileid);

    let files: any[] = [];
    try {
      files = await Promise.all(
        this.chatAttachedFiles.map(async f => {
          const fileName = `${Date.now()}_${f.filename}`;
          const storageRef = ref(this.storage, `studio-chat/${queueid}/${studioid}/${fileName}`);
          const snap = await uploadBytes(storageRef, f.file);
          const url = await getDownloadURL(snap.ref);
          return { filename: f.filename, fileurl: url };
        })
      );
    } catch {
      this.chatUploading = false;
      return;
    }
    this.chatAttachedFiles = [];
    const msgid = doc(collection(this.firestore, 'studio_chat', studioid, 'messages')).id;
    const newMsg = {
      messageid: msgid,
      message: text || null,
      sent_by: this.profileid,
      sentat: serverTimestamp(),
      files,
      read_by: [this.profileid],
      pending,
      liveassignmentid: thread?.currentliveassignmentid ?? null,
      studioid,
      queueid
    };
    await Promise.all([
      setDoc(doc(this.firestore, 'studio_chat', studioid, 'messages', msgid), newMsg),
      updateDoc(doc(this.firestore, 'studio_chat', studioid), {
        lastmessage: text || 'media',
        lastmessageat: serverTimestamp(),
        profileid: arrayUnion(this.profileid)
      })
    ]);
    if (!this.chatMessages.some(m => m['messageid'] === msgid)) {
      this.chatMessages = [...this.chatMessages, { ...newMsg, sentat: new Date() }]
    }
    setTimeout(() => {
      if (this.chatMessagesScroll) this.chatMessagesScroll.nativeElement.scrollTop = this.chatMessagesScroll.nativeElement.scrollHeight;
    }, 50);
    this.chatUploading = false;
  }

  private sortStudiosAndAssignments(): void {
    const score = (id: string) => {
      const unread = this.unreadStudioIds.has(id) ? 1 : 0;
      const time = this.chatThreads[id]?.lastmessageat?.toMillis?.() ?? 0;
      return { unread, time };
    };
    this.studios = [...this.studios].sort((a, b) => {
      const as = score(a.docid), bs = score(b.docid);
      if (bs.unread !== as.unread) return bs.unread - as.unread;
      return bs.time - as.time;
    });
    this.liveAssignments = [...this.liveAssignments].sort((a, b) => {
      const as = score(a.studioid), bs = score(b.studioid);
      if (bs.unread !== as.unread) return bs.unread - as.unread;
      return bs.time - as.time;
    });
  }

  processMessage(message: string, linkColor: string = '#1a56db'): SafeHtml {
    if (!message) return '';
    let processed = message.replace(/\n/g, '<br>');
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    processed = processed.replace(urlRegex, `<a href="$1" target="_blank" rel="noopener" style="color:${linkColor};word-break:break-word;overflow-wrap:anywhere;">$1</a>`);
    return this.sanitizer.bypassSecurityTrustHtml(processed);
  }

  getStudioUnread(studioid: string): boolean {
    return this.unreadStudioIds.has(studioid);
  }

  getStudioUnreadCount(studioid: string): number {
    return this.studioUnreadCounts?.[studioid] ?? 0;
  }

  get unreadChatCount(): number {
    return this.unreadStudioIds.size;
  }

  getStudioChatName(studioid: string): string {
    return this.chatNameCache[studioid] || 'Studio';
  }

  onChatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      this.sendChatMessage()
    }
  }

  ngOnDestroy() {
    if (this.nowTimer) clearInterval(this.nowTimer);
    this.chatThreadSub?.unsubscribe();
    this.chatUnreadSub?.unsubscribe();
    this.chatLiveSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
  private requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  private showChatNotification(message: string, studioName: string, studioid?: string) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(`New message from ${studioName}`, {
      body: message || 'Sent an attachment',
      icon: '/assets/icons/icon-72x72.png'
    });

    notification.onclick = () => {
      window.focus();
      this.rightTab = 'chat';
      if (studioid) {
        this.openStudioChat(studioid);
      }
      notification.close();
    };

    setTimeout(() => notification.close(), 5000);
  }
}

