import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { collection, doc, Firestore, setDoc, Timestamp, updateDoc } from '@angular/fire/firestore';
import { getAuth } from '@angular/fire/auth';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
// Communication dialogs — reused VERBATIM from Participants Analytics, which owns
// them. Only the afterClosed() handling is duplicated here (this component decides
// what happens on close); the dialogs themselves are untouched shared components.
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import {
  AtcBuckets, DayAttendance, EventData, JourneyCount, LiveEventDataService, PanelParticipant, QueueData
} from './live-event-data.service';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

// First-timer definition — lifted verbatim from first-timers-dashboard:
// a participant is a first timer when their consumedproducts do NOT include the
// event's excluded/hero product id (environment-specific).
function getExcludedProductId(): string {
  if (environment.firebase.projectId === 'starlabs-test') { return 'BKqbQ5slQtuYhljMOkKk'; }
  if (environment.firebase.projectId === 'fir-sample-aae4a') { return '0ayiNALL1HDVvCXDHcZ4'; }
  return '0ayiNALL1HDVvCXDHcZ4';
}
const EXCLUDED_PRODUCT_ID = getExcludedProductId();

/** One row of the Participant Data table — one per registered profileId. */
interface PdRow {
  profileId: string; name: string; email: string; journeyId: string; ft: boolean;
  atcBucket: number;            // 0 full · 1 partial · 2 unvalidated · 3 none · -1 unknown
  atcPct: number | null;        // SEAM 5
  adjDone: number; adjPending: number; procDone: number; procPending: number;
  attd: number;                 // distinct days present
}
interface PdFilter {
  q: string; journey: string; type: string; atc: string;
  pctOp: '>=' | '<=' | '<'; pctVal: number;
  band: string;   // QuartileRow.cls of a clicked ATC-completion tier ('' = none)
}

// One column of the Video Ask Tags scroller. `isAddressed` marks the single synthetic
// column, which is not a taxonomy tag — see computeTagGroups().
interface TagGroup {
  id: string; label: string; color: string;
  profileIds: string[];
  isAddressed: boolean;
}

// ---- Arena Calling contract (C-9) — the call-outcome log exists in NO collection
// yet. When the source is known, implement getCallLog() to map its docs to this. ---
interface CallLogEntry {
  profileId: string;
  day: string;                                               // date-key matching dayWiseAttendance
  status: 'pending' | 'coming' | 'no-answer' | 'not-coming';
  calledAt?: Timestamp | null;
  callerId?: string | null;
}
interface CallRow extends CallLogEntry { name: string; journeyId: string; }

// ---- Customer Support feed contract (C-10) — in-progress/resolved/feed have no
// confirmed query yet (statuses, assignee, timestamps unknown). ------------------
interface TicketFeedEntry {
  profileId: string; name: string; category: string; status: string;
  time?: Timestamp | null; assigneeId?: string | null; resolutionHours?: number | null;
}

/**
 * live-event-dashboard-v3 — Phase 1 (shell + Frontend Row 1).
 *
 * Data comes from LiveEventDataService (subscriptions lifted verbatim from the
 * existing dashboards — see that file). This component owns only presentation
 * aggregation (matching the prototype markup) plus five USER-OWNED seams that
 * are stubbed to safe placeholders and MUST be filled by the operator.
 *
 * Prototype reference: live-event-dashboard.html (structure/CSS only).
 * Out of scope this phase: Attendance, Procedure Tracking, Participant Data,
 * Video Ask Tags, Arena Followup, Backend view, Zones view.
 */

interface QuartileRow { cls: string; label: string; count: number; width: number; profileIds: string[]; }

/** Option id for the journey filter's "No journey" entry. Not a real journey id —
 *  it stands for "in no journey bucket at all". */
const NO_JOURNEY = '__no_journey__';

@Component({
  selector: 'app-live-event-dashboard-v3',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSelectModule, MatSlideToggleModule, ProfilePictureComponent],
  providers: [LiveEventDataService],
  templateUrl: './live-event-dashboard-v3.component.html',
  styleUrl: './live-event-dashboard-v3.component.css',
  host: { '(document:keydown.escape)': 'onEscape()', '(document:click)': 'closeDropdowns()' }
})
export class LiveEventDashboardV3Component implements OnInit, OnDestroy {

  activeView: 'frontend' | 'backend' | 'zones' = 'frontend';

  // ATC legend labels/colors — presentation constants from the prototype (ATC_META).
  readonly atcMeta: { label: string; color: string }[] = [
    { label: 'Fully validated ATC', color: 'var(--ok)' },
    { label: 'Partially validated — some ATCs pending', color: 'var(--ok-2)' },
    { label: 'Unvalidated — awaiting review', color: 'var(--warn)' },
    { label: 'No ATC on record', color: 'var(--alert)' }
  ];

  // drill-down panel state
  panelOpen = false;
  panelEyebrow = 'Participants';
  panelTitle = '';
  panelSub = '';
  panelSearch = '';
  private panelRows: PanelParticipant[] = [];
  // manual attendance marking (only enabled for the per-day Unattended list)
  panelMarkable = false;
  /** 'yyyy-mm-dd' the mark is credited to — '' = today. Set from the day card the
   *  list was opened from, so marking off a PAST day backdates the log. */
  panelMarkDate = '';
  markedIds = new Set<string>();
  markingId: string | null = null;
  // Row click → participant detail popup: one card with the photo AND the row's
  // data, replacing the old camera-badge avatar and clickable-name affordances —
  // the whole row is the click target now. The popup mounts ONE
  // <app-profile-picture>, so exactly one image downloads per open (the lazy
  // behaviour the list rows had, moved to the popup); clicking that picture
  // still opens the full-size enlarge overlay it owns.
  detailP: any = null;
  // the popup's picture — the only mounted instance — so ESC can peel its
  // enlarge overlay off FIRST instead of collapsing both layers at once
  @ViewChild(ProfilePictureComponent) private detailPhoto?: ProfilePictureComponent;
  openDetail(p: any): void {
    if (p && p.profileid) {
      this.cwP = null;                        // one popup at a time
      this.detailP = p;
      // operator debugging aid: which livechangework doc(s) this row stands on
      const cwIds: string[] = (p['_cwIds'] || []).filter(Boolean);
      if (cwIds.length) { console.log('[v3][popup] livechangework doc id(s) —', p.name + ':', cwIds); }
    }
  }
  closeDetail(): void { this.detailP = null; }
  /** Changework popup — the ROW's click target on changework rows (the camera
   *  icon keeps the profile popup). Shows the pair's livechangework doc(s):
   *  procedure, notes, adjustment, time saved, created on, last update. */
  cwP: any = null;
  openCw(p: any): void {
    if (!p?.['_cw']?.length) { this.openDetail(p); return; }
    this.detailP = null;                      // one popup at a time
    this.cwP = p;
    const ids: string[] = (p['_cwIds'] || []).filter(Boolean);
    if (ids.length) {
      console.log('[v3][popup] livechangework doc id(s) —', p.name + ':', ids);
      this.fetchCwUpdateTimes(ids);           // fire-and-forget; cards fill in as it lands
    }
  }
  closeCw(): void { this.cwP = null; }
  /** Camera-icon activation → profile popup. Shares the mouse guards with row
   *  clicks: a text-selection drag and the backdrop double-click fall-through
   *  window must not reopen a popup through the camera either (verifier
   *  finding — the guards lived only on rows). Keyboard twin skips the mouse
   *  guards, same policy as rowKey. */
  cameraClick(ev: MouseEvent, p: any): void {
    ev.stopPropagation();
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) { return; }
    if (Date.now() - this.detailClosedAt < 400) { return; }
    this.openDetail(p);
  }
  cameraKey(ev: Event, p: any): void {
    ev.stopPropagation(); ev.preventDefault();
    this.openDetail(p);
  }
  // Firestore keeps a hidden system-level updateTime on every document, but the
  // client SDK strictly hides it — the REST endpoint is the only client-side way
  // to read it. Fetched lazily for exactly the doc(s) the open popup shows,
  // cached per doc id for the session, authorised with the user's own ID token
  // (the same security rules as the live listeners apply).
  private cwUpdateTimes: { [docId: string]: string } = {};
  cwUpdateTime(docId: string | null | undefined): string { return docId ? (this.cwUpdateTimes[docId] || '') : ''; }
  private async fetchCwUpdateTimes(docIds: string[]): Promise<void> {
    const ids = docIds.filter(id => id && !this.cwUpdateTimes[id]);
    if (!ids.length) { return; }
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const projectId = environment.firebase.projectId;
      if (!token || !projectId) { return; }
      await Promise.all(ids.map(async id => {
        try {
          const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/livechangework/${id}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) { return; }
          const body: any = await res.json();
          if (body?.updateTime) { this.cwUpdateTimes[id] = body.updateTime; }
        } catch (err) { console.error('[v3][popup] updateTime fetch failed for', id, err); }
      }));
      this.cdr.markForCheck();
    } catch (err) { console.error('[v3][popup] updateTime fetch failed:', err); }
  }
  onCwBackdrop(ev: MouseEvent): void {
    const sel = window.getSelection?.();
    if (ev.detail > 1 || (sel && !sel.isCollapsed)) { return; }
    this.detailClosedAt = Date.now();
    this.closeCw();
  }
  // Set when a backdrop click closes the popup: the backdrop unmounts
  // synchronously, so the SECOND click of a double-click falls through to
  // whatever is beneath (the scrim would close the whole panel; a row would
  // reopen the popup for someone else). Row/scrim clicks inside this window
  // are the tail of that double-click and must be ignored.
  private detailClosedAt = 0;
  /** Mouse path into rowActivate — carries the guards that only make sense for
   *  clicks: a live text selection (drag-to-copy an email must not open the
   *  popup), the fall-through window above, and in comm mode the second click
   *  of a double-click (which would silently untick the row just ticked). */
  rowClick(ev: MouseEvent, p: any, selectable: boolean): void {
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) { return; }
    if (Date.now() - this.detailClosedAt < 400) { return; }
    if (this.commOn && ev.detail > 1) { return; }
    this.rowActivate(p, selectable);
  }
  /** Row activation. In selection (comm) mode a SELECTABLE row toggles its
   *  checkbox — a misclick during bulk ticking must not cost a popup dismissal.
   *  Outside comm mode: changework rows (carrying _cw) open the CHANGEWORK
   *  popup; everything else opens the profile popup. The camera icon always
   *  opens the profile popup (its own stopPropagation click). */
  rowActivate(p: any, selectable: boolean): void {
    if (this.commOn && selectable) { if (p?.profileid) { this.toggleCommOne(p.profileid); } return; }
    if (p?.['_cw']?.length) { this.openCw(p); return; }
    this.openDetail(p);
  }
  /** Keyboard twin — rows are tabbable. Only fires when the ROW itself is
   *  focused (a focusable child handles its own keys), and deliberately skips
   *  the mouse-only guards: a stale text selection must not eat Enter/Space. */
  rowKey(ev: KeyboardEvent, p: any, selectable: boolean): void {
    if (ev.target !== ev.currentTarget) { return; }
    ev.preventDefault();                    // Space must not scroll the panel
    this.rowActivate(p, selectable);
  }
  // floating back-to-top for the panel list — appears once the list has been
  // scrolled a screenful, jumps back smoothly
  panelScrolled = false;
  @ViewChild('panelList') private panelListRef?: ElementRef<HTMLDivElement>;
  onPanelScroll(ev: Event): void {
    const scrolled = (ev.target as HTMLElement).scrollTop > 300;
    if (scrolled !== this.panelScrolled) { this.panelScrolled = scrolled; }
  }
  scrollPanelTop(): void { this.panelListRef?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' }); }

  /** Backdrop click closes the popup — except the second click of a double-click
   *  that STARTED on a row (detail > 1: the popup opened under the cursor midway)
   *  and a text-selection drag that ends over the backdrop. */
  onDetailBackdrop(ev: MouseEvent): void {
    const sel = window.getSelection?.();
    if (ev.detail > 1 || (sel && !sel.isCollapsed)) { return; }
    this.detailClosedAt = Date.now();
    this.closeDetail();
  }
  /** Scrim shares the fall-through guard: a double-click starting on the popup
   *  backdrop must not blow away the whole panel with its second click. */
  onScrimClick(): void {
    if (Date.now() - this.detailClosedAt < 400) { return; }
    this.closePanel();
  }

  // Live elapsed timers (LIVE lists): each live changework doc's createdon rides
  // onto its counterpart entry as _since (epoch ms); the bindings below read one
  // shared clock that ticks only while a panel with timer rows is open — a
  // permanent 1s interval would cost a change-detection pass per second forever.
  nowTick = Date.now();
  private liveTicker: ReturnType<typeof setInterval> | null = null;
  private syncLiveTicker(): void {
    const need = this.panelOpen && this.panelRows.some((r: any) =>
      r['_pair'] && (r['_since'] || (r['others'] || []).some((o: any) => o['_since'])));
    if (need && this.liveTicker === null) {
      this.nowTick = Date.now();
      this.liveTicker = setInterval(() => { this.nowTick = Date.now(); }, 1000);
    } else if (!need && this.liveTicker !== null) {
      clearInterval(this.liveTicker); this.liveTicker = null;
    }
  }
  liveElapsed(since: number): string {
    let s = Math.max(0, Math.floor((this.nowTick - since) / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${h}:${pad(m)}:${pad(s - m * 60)}`;
  }
  /** 2 hours is the operator's attention threshold: green under it, red from it. */
  liveOver(since: number): boolean { return (this.nowTick - since) >= 2 * 60 * 60 * 1000; }
  private tsToMillis(v: any): number {
    if (!v) { return 0; }
    if (typeof v.toMillis === 'function') { return v.toMillis(); }
    if (typeof v.seconds === 'number') { return v.seconds * 1000; }
    if (typeof v === 'number') { return v; }
    const p = Date.parse(v); return isNaN(p) ? 0 : p;
  }
  get detailAtc(): any { return this.detailP ? (this.data.participantAtc[this.detailP.profileid] || null) : null; }
  get detailAttd(): number { return this.detailP ? ((this.data.mapAttendence[this.detailP.profileid]?.length) || 0) : 0; }
  // notes/hours getters are gone — the changework popup owns per-doc data now
  hoursSaved(c: any): string { return this.hoursSavedText(c.hours, c.hourType); }
  /** Eyebrow total: changeworks across the group (Σ ×N) — "5 beneficiaries ·
   *  6 changeworks" makes the x2 pairs legible at the group level. */
  groupCwCount(p: any): number {
    return ((p?.['others'] || []) as any[]).reduce((t, o) => t + (Number(o['_n']) || 1), 0);
  }
  /** D/B chip state: green only when the side's status is exactly 'completed'
   *  (case-insensitive); null/empty/anything else = red. */
  stDone(v: any): boolean { return String(v || '').trim().toLowerCase() === 'completed'; }
  private hoursSavedText(hours: any, hourType: string): string {
    const n = Number(hours);
    const amount = isNaN(n) ? String(hours).trim() : String(n);
    const unit = (!isNaN(n) && n === 1) ? 'hour' : 'hours';
    return `Saved ${amount} ${unit} per ${String(hourType).trim().toLowerCase()}`;
  }
  noteDate(v: any): string {
    const ms = this.tsToMillis(v);
    return ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  }
  // inline product picker: which row is expanded, that participant's active
  // e-ticket, its eligible products and the operator's multi-selection.
  markPickerId: string | null = null;
  markTicketId: string | null = null;
  markOptions: { id: string; name: string }[] = [];
  markSelected = new Set<string>();

  private sub: Subscription | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    public data: LiveEventDataService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private firestore: Firestore,
    private http: HttpClient,
    private storage: Storage,
    private authguard: AuthguardService,
    private snackBar: MatSnackBar,
  ) {}

  // Perf: memoize data-only derived collections so heavy getters (completionQuartiles,
  // ptEntries, tagGroups, crmGroups) recompute once per data change instead of on every
  // change-detection pass. viewVersion bumps on each service changed$ emission.
  private viewVersion = 0;
  private memoStore: { [key: string]: { v: number; val: any } } = {};
  private memo<T>(key: string, fn: () => T): T {
    const c = this.memoStore[key];
    if (c && c.v === this.viewVersion) { return c.val; }
    const val = fn();
    this.memoStore[key] = { v: this.viewVersion, val };
    return val;
  }

  ngOnInit(): void {
    this.sub = this.data.changed$.subscribe(() => {
      this.viewVersion++;   // invalidate memoized derived data (data changed)
      // Keep the service's first-timer set (used by procedure scope filter) in sync
      // with seam 3 so "First timers" resolves against the same registered universe.
      this.data.setFirstTimerIds(this.data.eventParticipantProfileIds.filter(id => this.isFirstTimer(id)));
      // reload per-event journey grouping when the event changes
      this.loadJourneyGroupsIfEventChanged();
      // Drop optimistic call statuses that the live log has now confirmed, and
      // refresh the cached call rows — only while the backend view is showing.
      this.reconcileCallOptimistic();
      if (this.activeView === 'backend') { this.rebuildCalls(); }
      // "big cohorts" / e-tickets stream in, so a panel opened moments after the
      // event was picked can compute its filter options before the data lands.
      // Refresh them once per data version — but never while a dropdown is open,
      // which would shuffle the options under the operator's cursor.
      if (this.panelOpen && !this.panelSelectOpen && this.panelOptionsVersion !== this.viewVersion) {
        this.refreshPanelOptions();
      }
      this.cdr.detectChanges();
    });
    this.data.init();
  }

  ngOnDestroy(): void {
    // The service is a component-level provider, so Angular calls its own
    // ngOnDestroy (which tears down the Firestore subscriptions). We only
    // release our view subscription here.
    if (this.sub) { this.sub.unsubscribe(); this.sub = null; }
    this.destroy$.next(); this.destroy$.complete();   // drops any open dialog's afterClosed()
    if (this.liveTicker !== null) { clearInterval(this.liveTicker); this.liveTicker = null; }
  }

  // ==========================================================================
  // USER-OWNED SEAMS — stubbed. Do NOT fill these in code review; the operator
  // owns the logic. Each lists the inputs already wired in.
  // ==========================================================================

  /**
   * SEAM 1 (C-3) — hero "Approved & attended participants" = the registered
   * universe from `event participation request` (status in ['approved','attended']),
   * i.e. `registeredCount` / `eventParticipantProfileIds` (team-confirmed).
   * Still per selected event — no cross-event/queue aggregation.
   */
  getHeroApprovedAttended(): number | null {
    if (!this.data.selectedEvent) { return null; }
    return this.data.registeredCount;
  }

  /** Hero click → the approved/attended (registered) participants list. */
  openHero(): void {
    this.openPanel('Approved & attended', this.data.selectedEvent?.['name'] || '', this.data.eventParticipantProfileIds);
  }

  /**
   * SEAM 2 (C-1) — ATC buckets for the ATC card.
   * Inputs available: V1 `mapvalidatedATC`/`mapunvalidatedATC` + the 3-way rules
   * (validated / unvalidated / none), OR V2 arenaOverview.atcCompleted/
   * atcToValidate/atcNotCompleted. "Partial" has no existing definition.
   * Return zero buckets → the bar/legend render empty until filled.
   */
  getAtcBuckets(): AtcBuckets {
    // CONFIRMED (C-1): V2 basis. full = validated atc_alpha only ·
    // partial = has both validated + atc_to_validate · unvalidated = to-validate
    // only · none = neither. Partitioned in LiveEventDataService.recomputeAtcBuckets.
    return this.data.atcBuckets;
  }

  /**
   * SEAM 3 (C-4) — first-timer flag for the Participants split.
   * Inputs available: FT `firstTimerProfileIds` (hardcoded EXCLUDED_PRODUCT_ID
   * in consumedproducts) vs V2 `firstTimeProfileIds` (dynamic hero-event
   * products). Return false → everyone counts as "Repeat" until filled.
   */
  isFirstTimer(profileId: string): boolean {
    // CONFIRMED (C-4): first-timers-dashboard logic — first timer = has NOT
    // consumed the excluded/hero product (participant metadata `consumedproducts`).
    const meta = this.data.participantMetadataMap[profileId];
    const consumed: string[] = (meta && meta['consumedproducts']) || [];
    return !consumed.includes(EXCLUDED_PRODUCT_ID);
  }

  /**
   * SEAM 4 (C-5) — journey id → column label + ordering.
   * `data.journeyCounts` already supplies dynamic ids/counts/names. Default here
   * returns the journey doc's own name (existing data, not invented); the
   * operator owns any short-code mapping (uP!/LYL/…) and column ordering.
   */
  journeyLabel(journeyId: string): string {
    // USER-OWNED (C-5): map to short labels / fixed order if desired.
    const j = this.data.mapJourneyData[journeyId];
    return (j && (j['journey'] || j['name'])) || journeyId;
  }

  /**
   * SEAM 5 (C-6) — per-participant completion ratio feeding the quartile rows.
   * Prototype intent: (adjDone + doerProcDone) / (adjTot + cwOpps), execution-
   * based. Real per-participant fields are the operator's to decide.
   * Return null → quartile rows render structure with zero counts.
   */
  participantCompletionRatio(p: PanelParticipant): number | null {
    // CONFIRMED (C-6, Option A) — ATC completion per participant = adjustments
    // completed / total adjustments (V1 atccompletionpercentage). The 100% tier =
    // participants who fully completed their ATC. Participants with no adjustments
    // (no ATC, adjTotal===0) are EXCLUDED (null) — they belong to the ATC "none"
    // bucket, not a completion tier — and show "—" in the ATC % column.
    const agg = this.data.participantAtc[p.profileid];
    if (!agg || agg.adjTotal === 0) { return null; }
    return agg.adjDone / agg.adjTotal;
  }

  // ==========================================================================
  // SHELL — chips / hero / tabs
  // ==========================================================================
  get ongoingCount(): number { return this.data.ongoingEvents.length + this.data.ongoingQueues.length; }

  selectEventChip(event: EventData): void { this.data.selectEvent(event); }
  toggleQueueChip(queue: QueueData): void { this.data.toggleQueue(queue); }

  isActiveEvent(event: EventData): boolean {
    return !!this.data.selectedEvent && this.pathOf(this.data.selectedEvent.docref) === this.pathOf(event.docref);
  }
  isActiveQueue(queue: QueueData): boolean { return this.data.isQueueSelected(queue); }

  setView(view: 'frontend' | 'backend' | 'zones'): void { this.activeView = view; if (view === 'backend') { this.rebuildCalls(); } }

  // ---- Event + Queue selectors (FT-style searchable dropdowns, v3-styled) -----
  eventDropdownOpen = false;
  eventSearch = '';
  queueDropdownOpen = false;
  queueSearch = '';

  closeDropdowns(): void { this.eventDropdownOpen = false; this.queueDropdownOpen = false; }
  // The product multi-select renders in a CDK overlay ABOVE the drill-down panel;
  // its own ESC handler closes it, so swallow this one or the panel would go too.
  // The panel's multi-selects render in a CDK overlay ABOVE the drill-down panel;
  // their own ESC handler closes them, so swallow this one or the panel would go too.
  // A communication dialog also renders above the panel and opens with
  // disableClose, so ESC must not yank the panel out from under it.
  onEscape(): void {
    if (this.panelSelectOpen || this.dialog.openDialogs.length) { return; }
    // layered peel: the enlarge overlay sits above the detail popup, which sits
    // above the panel — ESC takes exactly one layer per press, top first
    if (this.detailPhoto?.previewOpen) { this.detailPhoto.closePreview(); return; }
    if (this.detailP) { this.closeDetail(); return; }
    if (this.cwP) { this.closeCw(); return; }
    this.closePanel(); this.closeDropdowns();
  }

  // Event (single-select)
  toggleEventDropdown(): void { this.queueDropdownOpen = false; this.eventDropdownOpen = !this.eventDropdownOpen; if (this.eventDropdownOpen) { this.eventSearch = ''; } }
  pickEvent(e: EventData): void { this.data.selectEvent(e); this.eventDropdownOpen = false; }
  get filteredEvents(): EventData[] {
    const t = this.eventSearch.toLowerCase().trim();
    return t ? this.data.eventsList.filter(e => (e.name || '').toLowerCase().includes(t)) : this.data.eventsList;
  }
  isOngoingEvent(e: EventData): boolean { return this.data.ongoingEvents.some(o => this.pathOf(o.docref) === this.pathOf(e.docref)); }

  // Queue (multi-select — stays open while toggling, mirrors FT)
  toggleQueueDropdown(): void { this.eventDropdownOpen = false; this.queueDropdownOpen = !this.queueDropdownOpen; if (this.queueDropdownOpen) { this.queueSearch = ''; } }
  pickQueue(q: QueueData): void { this.data.toggleQueue(q); }
  queueName(q: QueueData): string { return q.name || q['queuename'] || 'Queue'; }
  isOngoingQueue(q: QueueData): boolean { return this.data.ongoingQueues.some(o => this.pathOf(o.docref) === this.pathOf(q.docref)); }
  get filteredQueues(): QueueData[] {
    const t = this.queueSearch.toLowerCase().trim();
    return t ? this.data.queuesList.filter(q => this.queueName(q).toLowerCase().includes(t)) : this.data.queuesList;
  }
  get selectedQueueLabel(): string {
    const n = this.data.selectedQueues.length;
    if (!n) { return 'Select queues…'; }
    if (n === 1) { return this.queueName(this.data.selectedQueues[0]); }
    return n + ' queues selected';
  }

  // ==========================================================================
  // ATC card (fed by SEAM 2)
  // ==========================================================================
  get atcBuckets(): AtcBuckets { return this.getAtcBuckets(); }
  get atcTotal(): number { const b = this.atcBuckets; return b.full + b.partial + b.unvalidated + b.none; }
  atcBucketValue(i: number): number {
    const b = this.atcBuckets; return [b.full, b.partial, b.unvalidated, b.none][i];
  }
  private atcBucketIds(i: number): string[] {
    const b = this.atcBuckets; return [b.fullIds, b.partialIds, b.unvalidatedIds, b.noneIds][i];
  }
  openAtcBucket(i: number): void {
    this.openPanel(this.atcMeta[i].label, this.data.selectedEvent?.['name'] || '', this.atcBucketIds(i));
  }

  // ATC in draft (V2 subscribeToDraftAtc) — unique participants with a temporary_ATC
  // draft in scope. Not part of the 4-bucket partition; shown as a separate row.
  get atcDraftCount(): number { return this.data.draftAtcProfileIds.length; }
  openAtcDraft(): void { this.openPanel('ATC in draft', this.data.selectedEvent?.['name'] || '', this.data.draftAtcProfileIds); }

  // ==========================================================================
  // Adjustments & Procedures (apBody)
  // ==========================================================================
  get adjTotal(): number { return this.data.totalAdjustmentCount; }
  get adjDone(): number { return this.data.totalAdjustmentCompletedCount; }
  get adjPending(): number { return this.data.totalAdjustmentPendingCount; }
  get adjPct(): number { return this.adjTotal ? Math.round((this.adjDone / this.adjTotal) * 100) : 0; }

  get procTotal(): number { return this.data.procTotals.total; }
  get procDone(): number { return this.data.procTotals.done; }
  get procPending(): number { return this.data.procTotals.pending; }
  get procPct(): number { return this.data.overallProgressPct; }

  get liveCount(): number { return this.data.liveChangeworkTotal; }
  openLive(): void {
    // Every procedure's live changework, grouped by doer WITHIN each procedure — so a
    // doer running two procedures gets a group per procedure, each labelled with it.
    const rows: PanelParticipant[] = [];
    for (const id of this.data.sortedProcedureIds) {
      const s = this.data.mapProcedureData[id];
      rows.push(...this.procGroupRows(s?.liveChangework?.data || [], this.procName(id), true, 'doer'));
    }
    this.openPanelRows('LIVE in the Arena', "Running right now · who's doing what · doer & beneficiary", rows, true);
  }

  // Quartile distribution (fed by SEAM 5). null ratios are excluded → zero counts.
  get completionQuartiles(): QuartileRow[] { return this.memo('completionQuartiles', () => this.computeCompletionQuartiles()); }
  private computeCompletionQuartiles(): QuartileRow[] {
    const parts = this.data.eventParticipantProfileIds.map(id => this.data.buildParticipantFromProfileId(id, false));
    const ratios = parts.map(p => ({ p, r: this.participantCompletionRatio(p) })).filter(x => x.r !== null) as { p: PanelParticipant; r: number }[];
    const total = this.data.eventParticipantProfileIds.length;
    // UNIQUE (non-cumulative) tiers — each participant falls in exactly one band.
    // `cls` doubles as the band id the Participant Data table filters by; see
    // applyPctFilter for why the band is not expressed as a % threshold.
    const defs: { cls: string; label: string; test: (r: number) => boolean }[] = [
      { cls: 'q100', label: '100%', test: r => r >= 1 },
      { cls: 'q75', label: '75–99%', test: r => r >= 0.75 && r < 1 },
      { cls: 'q50', label: '50–74%', test: r => r >= 0.5 && r < 0.75 },
      { cls: 'q25', label: '25–49%', test: r => r >= 0.25 && r < 0.5 },
      { cls: 'q0', label: 'Below 25%', test: r => r < 0.25 }
    ];
    return defs.map(d => {
      const list = ratios.filter(x => d.test(x.r));
      return { cls: d.cls, label: d.label, count: list.length, width: total ? Math.round((list.length / total) * 100) : 0, profileIds: list.map(x => x.p.profileid) };
    });
  }

  /** Task 1 — click an ATC-completion tier → apply it to the Participant Data
   *  table, expand that table, and scroll it into view.
   *
   *  The tiers are BANDS (25–49% is 0.25 <= r < 0.5), so they cannot be expressed
   *  as the single op+value the "ATC %" control carries — that filtered from 25%
   *  upwards with no ceiling. Nor can they be expressed as a numeric range over the
   *  table's ATC % column: that column is Math.round(ratio * 100) while the tiers
   *  band on the raw ratio, so a participant on 0.497 sits in the 25–49% tier but
   *  renders as "50%". Filtering by the tier's own membership is exact by
   *  construction, and storing the tier id (not its ids) keeps it live as the
   *  underlying data changes. */
  applyPctFilter(qt: QuartileRow): void {
    this.pdFilter.band = qt.cls;
    this.pdFilter.pctOp = '>=';           // clear the manual % control so the two
    this.pdFilter.pctVal = 0;             // do not silently stack
    this.pdShown = 15;
    this.pdOpen = true;
    setTimeout(() => document.getElementById('pdCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  get pdBandLabel(): string { return this.completionQuartiles.find(q => q.cls === this.pdFilter.band)?.label || ''; }
  clearPdBand(): void { this.pdFilter.band = ''; this.pdShown = 15; }

  // ==========================================================================
  // Participants split (ptTable) — journeys dynamic (C-5), ft via SEAM 3
  // ==========================================================================
  get participantJourneys(): JourneyCount[] { return this.data.journeyCounts.filter(j => j.count > 0); }
  get participantTotal(): number { return this.data.eventParticipantProfileIds.length; }

  /** flat [{profileId, journeyId}] over registered participants that have a journey */
  private ptEntries(): { profileId: string; journeyId: string }[] { return this.memo('ptEntries', () => this.computePtEntries()); }
  private computePtEntries(): { profileId: string; journeyId: string }[] {
    const out: { profileId: string; journeyId: string }[] = [];
    this.participantJourneys.forEach(j => j.profileIds.forEach(pid => out.push({ profileId: pid, journeyId: j.journeyId })));
    return out;
  }

  private ptFilter(journeyId: string | 'all', ft: boolean | null): { profileId: string; journeyId: string }[] {
    return this.ptEntries().filter(e =>
      (journeyId === 'all' || e.journeyId === journeyId) &&
      (ft === null || this.isFirstTimer(e.profileId) === ft));
  }

  ptCount(journeyId: string | 'all', ft: boolean | null): number { return this.ptFilter(journeyId, ft).length; }

  openPt(journeyId: string | 'all', ft: boolean | null): void {
    const ids = this.ptFilter(journeyId, ft).map(e => e.profileId);
    const jLabel = journeyId === 'all' ? '' : ' · ' + this.journeyLabel(journeyId);
    const t = (ft === true ? 'First timers' : ft === false ? 'Repeat participants' : 'All participants') + jLabel;
    this.openPanel(t, this.data.selectedEvent?.['name'] || '', ids);
  }

  // Registered participants with NO recognized journey (no activejourney, or one
  // absent from the journey collection) — so they never appear in a journey column.
  // Surfaced as a "No journey" row so the matrix reconciles to participantTotal.
  get noJourneyProfileIds(): string[] {
    const inJourney = new Set<string>();
    this.data.journeyCounts.forEach(j => j.profileIds.forEach(id => inJourney.add(id)));
    return this.data.eventParticipantProfileIds.filter(id => !inJourney.has(id));
  }
  get noJourneyCount(): number { return this.noJourneyProfileIds.length; }
  get hasNoJourney(): boolean { return this.noJourneyProfileIds.length > 0; }
  openPtNoJourney(): void { this.openPanel('No journey', this.data.selectedEvent?.['name'] || '', this.noJourneyProfileIds); }
  /** Grand-total cell → the full registered universe (journeyed + no-journey). */
  openPtAll(): void { this.openPanel('All participants', this.data.selectedEvent?.['name'] || '', this.data.eventParticipantProfileIds); }

  // ==========================================================================
  // Journey grouping (mirrors product-funnel in event-participation-confirmations)
  // Per-event, journeyId→group name in localStorage; same-named journeys collapse
  // into one aggregated column. Edit mode lets the operator tick + name groups.
  // ==========================================================================
  journeyGroups: { [journeyId: string]: string } = {};
  groupEditMode = false;
  journeySel = new Set<string>();
  groupNameInput = '';
  private loadedGroupsFor: string | null = null;

  private groupsKey(): string { return 'v3_journey_groups_' + (this.data.selectedEvent?.docref?.id || 'unknown'); }
  /** Reload the per-event grouping when the selected event changes (cheap-guarded). */
  loadJourneyGroupsIfEventChanged(): void {
    const id = this.data.selectedEvent?.docref?.id || null;
    if (id === this.loadedGroupsFor) { return; }
    this.loadedGroupsFor = id;
    this.journeyGroups = {};
    if (typeof localStorage === 'undefined') { return; }
    try { const raw = localStorage.getItem(this.groupsKey()); this.journeyGroups = raw ? (JSON.parse(raw) || {}) : {}; } catch { this.journeyGroups = {}; }
  }
  private saveJourneyGroups(): void {
    if (typeof localStorage === 'undefined') { return; }
    try { localStorage.setItem(this.groupsKey(), JSON.stringify(this.journeyGroups)); } catch { /* storage unavailable — grouping just won't persist */ }
  }
  toggleGroupEdit(): void { this.groupEditMode = !this.groupEditMode; this.journeySel.clear(); this.groupNameInput = ''; }
  toggleJourneySel(journeyId: string): void { if (this.journeySel.has(journeyId)) { this.journeySel.delete(journeyId); } else { this.journeySel.add(journeyId); } }
  isJourneySel(journeyId: string): boolean { return this.journeySel.has(journeyId); }
  journeyGroupOf(journeyId: string): string { return this.journeyGroups[journeyId] || ''; }
  get existingGroupNames(): string[] { return [...new Set(Object.values(this.journeyGroups).map(g => (g || '').trim()).filter(Boolean))].sort(); }
  /** Live participant total of the journeys currently ticked (edit mode). */
  get selectedJourneyTotal(): number {
    return this.participantJourneys.filter(j => this.journeySel.has(j.journeyId)).reduce((s, j) => s + j.count, 0);
  }
  /** Each defined group + its combined participant total — shown as header chips. */
  get journeyGroupSummaries(): { name: string; count: number; journeyIds: string[] }[] {
    const byName: { [name: string]: string[] } = {};
    this.participantJourneys.forEach(j => {
      const g = (this.journeyGroups[j.journeyId] || '').trim();
      if (g) { (byName[g] = byName[g] || []).push(j.journeyId); }
    });
    return Object.keys(byName).sort().map(name => ({ name, count: this.colCount({ journeyIds: byName[name] }, null), journeyIds: byName[name] }));
  }
  setGroupName(n: string): void { this.groupNameInput = n; }
  /** Group the ticked journeys under the typed name (create or add-to-existing). */
  groupSelected(): void {
    const name = (this.groupNameInput || '').trim();
    if (!name || !this.journeySel.size) { return; }
    this.journeySel.forEach(id => { this.journeyGroups[id] = name; });
    this.saveJourneyGroups();
    this.journeySel.clear(); this.groupNameInput = '';
  }
  /** Remove the ticked journeys from whatever group they're in. */
  ungroupSelected(): void {
    if (!this.journeySel.size) { return; }
    this.journeySel.forEach(id => { delete this.journeyGroups[id]; });
    this.saveJourneyGroups();
    this.journeySel.clear();
  }

  /** Matrix columns: grouped journeys collapse into one aggregated column (total on
   *  its header); ungrouped journeys stay journey-wise. In edit mode every journey
   *  shows individually so it can be ticked and grouped. */
  get journeyColumns(): { key: string; label: string; journeyIds: string[]; isGroup: boolean }[] {
    if (this.groupEditMode) {
      return this.participantJourneys.map(j => ({ key: j.journeyId, label: this.journeyLabel(j.journeyId), journeyIds: [j.journeyId], isGroup: false }));
    }
    const countById: { [id: string]: number } = {};
    this.participantJourneys.forEach(j => { countById[j.journeyId] = j.count; });
    const groups = new Map<string, { key: string; label: string; journeyIds: string[]; isGroup: boolean }>();
    const singles: { key: string; label: string; journeyIds: string[]; isGroup: boolean }[] = [];
    this.participantJourneys.forEach(j => {
      const g = (this.journeyGroups[j.journeyId] || '').trim();
      if (g) {
        const key = 'grp:' + g;
        const e = groups.get(key) || { key, label: g, journeyIds: [], isGroup: true };
        e.journeyIds.push(j.journeyId);
        groups.set(key, e);
      } else {
        singles.push({ key: j.journeyId, label: this.journeyLabel(j.journeyId), journeyIds: [j.journeyId], isGroup: false });
      }
    });
    const total = (col: { journeyIds: string[] }) => col.journeyIds.reduce((s, id) => s + (countById[id] || 0), 0);
    return [...groups.values(), ...singles].sort((a, b) => total(b) - total(a));
  }
  private ptFilterIds(journeyIds: string[], ft: boolean | null): { profileId: string; journeyId: string }[] {
    return this.ptEntries().filter(e => journeyIds.includes(e.journeyId) && (ft === null || this.isFirstTimer(e.profileId) === ft));
  }
  colCount(col: { journeyIds: string[] }, ft: boolean | null): number { return this.ptFilterIds(col.journeyIds, ft).length; }
  openPtCol(col: { label: string; journeyIds: string[] }, ft: boolean | null): void {
    const ids = this.ptFilterIds(col.journeyIds, ft).map(e => e.profileId);
    const t = (ft === true ? 'First timers' : ft === false ? 'Repeat participants' : 'All participants') + ' · ' + col.label;
    this.openPanel(t, this.data.selectedEvent?.['name'] || '', ids);
  }

  // ==========================================================================
  // PHASE 2 SEAMS (USER-OWNED — stubbed)
  // ==========================================================================
  /** CONFIRMED — per-day video-ask count = participantvideoask uploaded on that
   *  day (service subscribeToVideoAsk), scoped to the universe. null while the
   *  video-ask data hasn't loaded yet → cell shows "—". */
  getVideoAskByDay(day: DayAttendance): number | null {
    if (!this.data.videoAskLoaded) { return null; }
    return this.getVideoAskIdsByDay(day).length;
  }
  getVideoAskIdsByDay(day: DayAttendance): string[] {
    const ids = this.data.videoAskByDay[day.date] || [];
    return ids.filter(id => this.data.eventParticipantProfileIds.includes(id));
  }

  /** SEAM — day-over-day attendance change. null → delta chip hidden. */
  attendanceDelta(day: DayAttendance): number | null { return null; }

  /** Present that day but did NOT submit a videoask (missing recording).
   *  present (registered, scoped to universe) − submitted that day. */
  getMissingRecordingByDay(day: DayAttendance): string[] {
    const submitted = new Set(this.data.videoAskByDay[day.date] || []);
    return day.presentProfileIds.filter(id => this.uni(id) && !submitted.has(id));
  }

  // ==========================================================================
  // Daily Attendance (#attGrid) — V2 dayWiseAttendance / subscribeToAttendance
  // ==========================================================================
  get attDays(): DayAttendance[] { return this.data.dayWiseAttendance; }
  get attHasDays(): boolean { return this.data.dayWiseAttendance.length > 0; }
  get attRange(): string {
    const days = this.data.dayWiseAttendance;
    if (!days.length) { return ''; }
    const fmt = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    const currentDay = days.filter(d => !d.isFuture).length;
    return `${fmt(days[0].date)} – ${fmt(days[days.length - 1].date)} · Day ${Math.max(1, currentDay)} of ${days.length}`;
  }
  // Universe = arena e-ticket set (FT), so the grid's totals/absent all reconcile.
  get attTotalApproved(): number { return this.data.eventParticipantProfileIds.length; }
  get attAbsentToday(): number { const t = this.data.dayWiseAttendance.find(d => d.isToday); return t ? t.absentProfileIds.length : 0; }
  get attNeverAttended(): number { return this.data.allDayAbsentProfileIds.length; }
  /** Distinct people who have turned up on ANY day so far = Total approved − Never
   *  attended. Sound as a subtraction because allDayAbsentProfileIds is filtered out
   *  of eventParticipantProfileIds, so the two partition the universe. */
  get attUniqueParticipants(): number { return this.attTotalApproved - this.attNeverAttended; }
  private get attUniqueProfileIds(): string[] {
    const never = new Set(this.data.allDayAbsentProfileIds);
    return this.data.eventParticipantProfileIds.filter(id => !never.has(id));
  }
  openAttUnique(): void { this.openPanel('Unique participants', 'Attended on at least one day', this.attUniqueProfileIds); }

  attWeekday(day: DayAttendance): string {
    const [y, m, d] = day.date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
  }
  attDayLabel(day: DayAttendance): string { return day.isToday ? 'Today' : 'Day ' + day.day; }
  attTodayBarPct(day: DayAttendance): number {
    const va = this.getVideoAskByDay(day);
    if (va === null || !day.count) { return 0; }
    return Math.round((va / day.count) * 100);
  }

  // Shared day filter (CHANGED, operator 2026-07-29): Daily Attendance and Procedure
  // Tracking read/write the SAME service field, so the two stay in sync structurally —
  // there is no propagation code and they cannot drift. Clicking a day card selects;
  // clicking the card's count still opens the attendance panel.
  isDaySelected(day: DayAttendance): boolean { return this.data.procDayFilter === day.date; }
  selectDay(day: DayAttendance): void {
    if (day.isFuture) { return; }
    this.data.setProcedureDay(day.date);   // owns the livechangework re-query
  }
  // 'all' used to select no card at all, which read as "nothing is selected" rather than
  // "every day is selected". Total approved carries that state — it is already the
  // all-days card by meaning, so it becomes the All Days control (CHANGED, operator).
  get isAllDaysSelected(): boolean { return this.data.procDayFilter === 'all'; }
  selectAllDays(): void { this.data.setProcedureDay('all'); }

  openAttDay(day: DayAttendance): void {
    if (day.isFuture) { return; }
    this.openPanel(`Attendance · ${this.attDayLabel(day)} · ${this.attWeekday(day)}`, this.data.selectedEvent?.['name'] || '', day.presentProfileIds);
  }
  openAttTotal(): void { this.openPanel('Total approved', this.data.selectedEvent?.['name'] || '', this.data.eventParticipantProfileIds); }
  openAttAbsentToday(): void { const t = this.data.dayWiseAttendance.find(d => d.isToday); this.openPanel('Absent today', this.data.selectedEvent?.['name'] || '', t ? t.absentProfileIds : []); }
  openAttNever(): void { this.openPanel('Never attended', 'Approved but no scan on any day · critical', this.data.allDayAbsentProfileIds); }
  openAttVideo(day: DayAttendance): void { this.openPanel(`Video Ask · ${this.attDayLabel(day)}`, this.data.selectedEvent?.['name'] || '', this.getVideoAskIdsByDay(day)); }
  // Per-day: unattended (absent) + Video Ask submitted / unsubmitted (missing), with lists.
  attAbsentCount(day: DayAttendance): number { return day.absentProfileIds.length; }
  openAttAbsent(day: DayAttendance): void {
    this.openPanel(`Unattended · ${this.attDayLabel(day)}`, this.data.selectedEvent?.['name'] || '', day.absentProfileIds);
    this.panelMarkable = true;   // allow manual attendance marking from this list
    // Credit the mark to the day the operator is looking at. Today stays undated so
    // the log keeps the real click time; a past day must be backdated or the mark
    // lands on today and that day's Unattended count never moves.
    this.panelMarkDate = day.isToday ? '' : day.date;
  }
  attMissingVACount(day: DayAttendance): number { return this.getMissingRecordingByDay(day).length; }
  openAttMissingVA(day: DayAttendance): void { this.openPanel(`Video Ask not submitted · ${this.attDayLabel(day)}`, this.data.selectedEvent?.['name'] || '', this.getMissingRecordingByDay(day)); }

  // ==========================================================================
  // Procedure Tracking (#procRows) — FT calculateProcedureData (registered universe)
  // ==========================================================================
  procOpen = true;
  toggleProc(): void { this.procOpen = !this.procOpen; }

  get procIds(): string[] { return this.data.sortedProcedureIds; }
  procName(id: string): string { return this.data.mapProcedureNames[id] || id; }
  private procStat(id: string) { return this.data.mapProcedureData[id]; }
  procOpp(id: string): number { return this.procStat(id)?.totalOpportunities.count || 0; }
  procCompleted(id: string): number { return this.procStat(id)?.totalCompleted.count || 0; }
  procDoerNotStarted(id: string): number { return this.procStat(id)?.doerNotStarted.count || 0; }
  procDoerCompleted(id: string): number { return this.procStat(id)?.doerCompleted.count || 0; }
  procBenNotStarted(id: string): number { return this.procStat(id)?.beneficierNotStarted.count || 0; }
  procBenCompleted(id: string): number { return this.procStat(id)?.beneficierCompleted.count || 0; }
  procLive(id: string): number { return this.procStat(id)?.liveChangework.count || 0; }
  procCompletionPct(id: string): number { return this.data.completionPct(id); }

  get procCount(): number { return this.data.sortedProcedureIds.length; }
  get procLiveTotal(): number { return this.data.liveChangeworkTotal; }
  // Header totals beside the LIVE pill: distinct completed leads summed across
  // all procedures (a doer counts once per procedure, same as the cells the sum
  // is made of — and same as the groups in the pill's panel).
  get procDoerCompletedTotal(): number {
    return this.data.sortedProcedureIds.reduce((t, id) => t + (this.procStat(id)?.doerCompleted.count || 0), 0);
  }
  get procBenCompletedTotal(): number {
    return this.data.sortedProcedureIds.reduce((t, id) => t + (this.procStat(id)?.beneficierCompleted.count || 0), 0);
  }
  get procMeta(): string { return `${this.procCount} procedures · opportunities, doer & beneficiary progress, live now`; }
  get procDayFilter(): string { return this.data.procDayFilter; }

  get procDayChips(): { value: string; label: string; active: boolean }[] {
    const chips = [{ value: 'all', label: 'All Days', active: this.data.procDayFilter === 'all' }];
    this.data.dayWiseAttendance.filter(d => !d.isFuture).forEach(d => {
      chips.push({ value: d.date, label: d.isToday ? `D${d.day} · Today` : `D${d.day} · ${this.attWeekday(d)}`, active: this.data.procDayFilter === d.date });
    });
    return chips;
  }
  setProcDay(value: string): void { this.data.setProcedureDay(value); }
  get procScope(): 'all' | 'firstTimers' { return this.data.participantFilter; }
  setProcScope(scope: 'all' | 'firstTimers'): void {
    this.data.setProcedureScope(scope);
    // Task 2 — mirror the procedure scope onto the Participant Data "Type" filter.
    this.pdFilter.type = scope === 'firstTimers' ? 'ft' : 'all';
    this.pdShown = 15;
  }
  get procScopeAllCount(): number { return this.data.eventParticipantProfileIds.length; }
  get procScopeFtCount(): number { return this.data.eventParticipantProfileIds.filter(id => this.isFirstTimer(id)).length; }

  openProcCell(id: string, kind: 'dns' | 'dc' | 'bns' | 'bc' | 'live'): void {
    const s = this.procStat(id); if (!s) { return; }
    const scopeL = this.procScope === 'firstTimers' ? 'First Timers' : 'Overall';
    const dayL = this.procDayFilter === 'all' ? 'All Days' : this.procDayFilter;
    const sub = `${scopeL} · ${dayL}`;
    // Completed & Live: group by the side the cell is ABOUT, with every counterpart
    // listed under it — one doer typically works with several beneficiaries.
    if (kind === 'dc' || kind === 'bc' || kind === 'live') {
      const data = kind === 'dc' ? s.doerCompleted.data : kind === 'bc' ? s.beneficierCompleted.data : s.liveChangework.data;
      const label = kind === 'dc' ? 'As Doer · Completed' : kind === 'bc' ? 'As Beneficiary · Completed' : 'Live now';
      const groupBy: 'doer' | 'beneficiary' = kind === 'bc' ? 'beneficiary' : 'doer';
      this.openPanelRows(`${this.procName(id)} · ${label}`, sub, this.procGroupRows(data as any[], this.procName(id), false, groupBy, kind !== 'live'), true);
      return;
    }
    // Not-started: a plain list (no counterpart yet).
    const ids = kind === 'dns' ? (s.doerNotStarted.data as string[]) : (s.beneficierNotStarted.data as string[]);
    const label = kind === 'dns' ? 'As Doer · Not started' : 'As Beneficiary · Not started';
    this.openPanel(`${this.procName(id)} · ${label}`, sub, ids.filter(Boolean));
  }
  /** The two proc-sub lines. The tile counts OPPORTUNITIES — one participant can
   *  hold several for the same procedure — so the panel lists the unique
   *  participants behind the number with each one's share as a count badge (and
   *  in the CSV Detail column via _meta), and the sub repeats the tile's total so
   *  the two figures reconcile on sight. Both lists come straight from atc_alpha
   *  (pending/completed lists): scope applies, the day chips do NOT — so the sub
   *  deliberately carries no day label, unlike the livechangework-backed cells. */
  openProcTotals(id: string, kind: 'opp' | 'comp'): void {
    const s = this.procStat(id); if (!s) { return; }
    const scopeL = this.procScope === 'firstTimers' ? 'First Timers' : 'Overall';
    const stat = kind === 'opp' ? s.totalOpportunities : s.totalCompleted;
    const label = kind === 'opp' ? 'Total opportunities' : 'Completed';
    const unit = (n: number) => kind === 'opp' ? (n === 1 ? 'opportunity' : 'opportunities') : 'completed';
    const rows = (stat.data as { profileId: string; count: number }[])
      .filter(d => !!d?.profileId)
      .map(d => ({
        ...this.data.buildParticipantFromProfileId(d.profileId, false),
        _count: d.count, _countKind: kind, _meta: `${d.count} ${unit(d.count)}`
      } as any));
    this.openPanelRows(`${this.procName(id)} · ${label}`, `${scopeL} · ${stat.count.toLocaleString()} ${unit(stat.count)} total`, rows);
  }
  openProcLive(): void { this.openLive(); }
  /** The two header DONE pills — every procedure's completed changework in one
   *  list, grouped within each procedure exactly like the LIVE pill's panel, so
   *  the group count reconciles with the pill's sum. Same scope/day behaviour
   *  as the per-procedure Completed cells (livechangework-derived → day applies). */
  private openProcCompletedAll(side: 'doer' | 'beneficiary'): void {
    const rows: PanelParticipant[] = [];
    for (const id of this.data.sortedProcedureIds) {
      const s = this.data.mapProcedureData[id];
      const data = side === 'doer' ? s?.doerCompleted?.data : s?.beneficierCompleted?.data;
      rows.push(...this.procGroupRows((data as any[]) || [], this.procName(id), true, side, true));
    }
    const scopeL = this.procScope === 'firstTimers' ? 'First Timers' : 'Overall';
    const dayL = this.procDayFilter === 'all' ? 'All Days' : this.procDayFilter;
    const label = side === 'doer' ? 'As Doer' : 'As Beneficiary';
    this.openPanelRows(`Completed · ${label} · all procedures`, `${scopeL} · ${dayL}`, rows, true);
  }
  openProcDoerCompletedAll(): void { this.openProcCompletedAll('doer'); }
  openProcBenCompletedAll(): void { this.openProcCompletedAll('beneficiary'); }

  // ==========================================================================
  // Participant Data table (#pdTable) — V1 aggregateData + customfilter + CSV
  // ==========================================================================
  pdOpen = false;
  pdShown = 15;
  pdSortK: keyof PdRow = 'name';
  pdSortD = 1;
  pdFilter: PdFilter = this.defaultPdFilter();
  readonly atcShort = ['Full', 'Partial', 'Unval', 'None'];
  readonly pdCols: { k: keyof PdRow; label: string }[] = [
    { k: 'name', label: 'Name' }, { k: 'atcBucket', label: 'ATC' }, { k: 'atcPct', label: 'ATC %' },
    { k: 'adjDone', label: 'Adj. Done' }, { k: 'adjPending', label: 'Adj. Pending' },
    { k: 'procDone', label: 'Proc. Done' }, { k: 'procPending', label: 'Proc. Pending' }, { k: 'attd', label: 'Attd' }
  ];
  private defaultPdFilter(): PdFilter { return { q: '', journey: 'all', type: 'all', atc: 'all', pctOp: '>=', pctVal: 0, band: '' }; }
  togglePd(): void { this.pdOpen = !this.pdOpen; }
  pdClear(): void { this.pdFilter = this.defaultPdFilter(); this.pdShown = 15; }
  pdMore(): void { this.pdShown += 25; }
  pdOnFilterChange(): void { this.pdShown = 15; }

  private bucketOf(profileId: string): number {
    const b = this.data.atcBuckets;
    if (b.fullIds.includes(profileId)) { return 0; }
    if (b.partialIds.includes(profileId)) { return 1; }
    if (b.unvalidatedIds.includes(profileId)) { return 2; }
    if (b.noneIds.includes(profileId)) { return 3; }
    return -1;
  }
  private buildPdRow(profileId: string): PdRow {
    const meta = this.data.participantMetadataMap[profileId] || {};
    const agg = this.data.participantAtc[profileId] || { adjDone: 0, adjPending: 0, procDone: 0, procPending: 0 } as any;
    const ratio = this.participantCompletionRatio(this.data.buildParticipantFromProfileId(profileId, false));
    return {
      profileId, name: meta['name'] || 'Unknown', email: meta['email'] || '',
      journeyId: meta['activejourney'] || '', ft: this.isFirstTimer(profileId),
      atcBucket: this.bucketOf(profileId), atcPct: ratio === null ? null : Math.round(ratio * 100),
      adjDone: agg.adjDone, adjPending: agg.adjPending, procDone: agg.procDone, procPending: agg.procPending,
      attd: (this.data.mapAttendence[profileId]?.length) || 0
    };
  }
  get pdAllRows(): PdRow[] { return this.data.eventParticipantProfileIds.map(id => this.buildPdRow(id)); }
  /** Members of one ATC-completion tier as a Set — memoised per data version so the
   *  per-row test stays a hash lookup. */
  private pdBandIds(cls: string): Set<string> {
    return this.memo('pdBandIds:' + cls, () =>
      new Set(this.completionQuartiles.find(q => q.cls === cls)?.profileIds || []));
  }

  private pdMatch(r: PdRow): boolean {
    const f = this.pdFilter;
    const q = f.q.toLowerCase().trim();
    if (q && !(r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))) { return false; }
    if (f.journey !== 'all' && r.journeyId !== f.journey) { return false; }
    if (f.type !== 'all' && r.ft !== (f.type === 'ft')) { return false; }
    if (f.atc !== 'all' && r.atcBucket !== +f.atc) { return false; }
    // a clicked ATC-completion tier — membership in that exact band, see applyPctFilter
    if (f.band && !this.pdBandIds(f.band).has(r.profileId)) { return false; }
    if (r.atcPct !== null) {
      if (f.pctOp === '>=' && !(r.atcPct >= f.pctVal)) { return false; }
      if (f.pctOp === '<=' && !(r.atcPct <= f.pctVal)) { return false; }
      if (f.pctOp === '<' && !(r.atcPct < f.pctVal)) { return false; }
    } else if (f.pctVal > 0) { return false; } // unknown % excluded once a threshold is set
    return true;
  }
  get pdFilteredRows(): PdRow[] {
    const rows = this.pdAllRows.filter(r => this.pdMatch(r));
    const k = this.pdSortK, d = this.pdSortD;
    return rows.sort((a, b) => {
      const va = a[k] as any, vb = b[k] as any;
      if (typeof va === 'string' || typeof vb === 'string') { return String(va).localeCompare(String(vb)) * d; }
      return (((va ?? -1) as number) - ((vb ?? -1) as number)) * d;
    });
  }
  get pdVisibleRows(): PdRow[] { return this.pdFilteredRows.slice(0, this.pdShown); }
  get pdTotalDays(): number { return this.data.dayWiseAttendance.length; }
  pdSort(k: keyof PdRow): void { if (this.pdSortK === k) { this.pdSortD *= -1; } else { this.pdSortK = k; this.pdSortD = k === 'name' ? 1 : -1; } }
  pdAtcLabel(b: number): string { return b >= 0 ? this.atcShort[b] : '—'; }
  /** A row click opens the WHOLE table in the panel, not just that participant —
   *  in the table's current sort order (preserveOrder), and narrowed by whatever
   *  filters the table has applied. */
  openPdRow(): void {
    const rows = this.pdFilteredRows.map(r => this.data.buildParticipantFromProfileId(r.profileId, false));
    const narrowed = rows.length !== this.data.eventParticipantProfileIds.length;
    const sub = (this.data.selectedEvent?.['name'] || '') + (narrowed ? ' · as filtered in the table' : '');
    this.openPanelRows('Participant Data', sub, rows, true);
  }

  pdExport(): void {
    const esc = (s: any) => `"${String(s).replace(/"/g, '""')}"`;
    const header = ['Name', 'Email', 'Journey', 'Type', 'ATC Status', 'ATC %', 'Adj Done', 'Adj Pending', 'Proc Done', 'Proc Pending', 'Attended Days'];
    const lines = [header.join(',')];
    this.pdFilteredRows.forEach(r => {
      lines.push([esc(r.name), esc(r.email), esc(this.journeyLabel(r.journeyId)), r.ft ? 'First timer' : 'Repeat',
        this.pdAtcLabel(r.atcBucket), r.atcPct === null ? '' : r.atcPct, r.adjDone, r.adjPending, r.procDone, r.procPending, `${r.attd}/${this.pdTotalDays}`].join(','));
    });
    const name = (this.data.selectedEvent?.['name'] || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = name + '-participants.csv';
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ==========================================================================
  // Video Ask Tags (#tagScroll) — WHOLE SECTION is USER-OWNED (C-7)
  // ==========================================================================
  private readonly tagPalette = ['var(--alert)', 'var(--warn)', 'var(--ok)', 'var(--accent)', 'var(--z-500)', '#c7366f', 'var(--ok-2)'];

  /** CHANGED (operator) — taxonomy = V2 "participant tags" collection (docid→name),
   *  loaded in the service. Colors cycle a fixed palette. */
  getTagTaxonomy(): { id: string; label: string; color: string }[] {
    return this.data.participantTags.map((t, i) => ({ id: t['docid'], label: t['name'] || t['docid'], color: this.tagPalette[i % this.tagPalette.length] }));
  }

  /** Synthetic column id — not a taxonomy tag, so it can never collide with a docid. */
  static readonly ADDRESSED = '__addressed';

  get tagGroups(): TagGroup[] { return this.memo('tagGroups', () => this.computeTagGroups()); }

  /**
   * REWRITTEN (operator 2026-07-29). Buckets by the tags on each participantvideoask
   * SUBMISSION, scoped to the shared day filter — replacing the old read of
   * `participant metadata.profiletags`, which accumulates across every event and every
   * day and so could not answer "tagged what, on which day".
   *
   * Three rules that are easy to get wrong:
   *  - a participant appears in EVERY tag they carry, not one. Column sums therefore
   *    exceed headcount; that is correct now, where before it was a bug signal.
   *  - "Addressed" needs at least one TAGGED doc. Without that guard "all tagged docs
   *    are addressed" is vacuously true for someone who was never tagged, and they
   *    would land in Addressed by accident.
   *  - Addressed is judged on the selected day alone, so the same participant can be
   *    Addressed on one day and sitting under a tag on the next.
   */
  private computeTagGroups(): TagGroup[] {
    const tax = this.getTagTaxonomy();
    if (!tax.length) { return []; }
    const day = this.data.procDayFilter;
    const docs = this.data.videoAskTagDocs.filter(d => d.day && (day === 'all' || d.day === day));

    const tagsByParticipant: { [pid: string]: Set<string> } = {};
    const allAddressed: { [pid: string]: boolean } = {};
    docs.forEach(d => {
      if (!d.tags.length) { return; }   // an untagged submission buckets nowhere and gets no Addressed vote
      const set = tagsByParticipant[d.profileid] = tagsByParticipant[d.profileid] || new Set<string>();
      d.tags.forEach(t => set.add(t));   // Set = one entry per participant per column, across their submissions
      allAddressed[d.profileid] = (allAddressed[d.profileid] !== false) && d.addressed;
    });

    const byTag: { [id: string]: string[] } = {};
    tax.forEach(t => { byTag[t.id] = []; });
    const addressedIds: string[] = [];
    const unknown = new Set<string>();
    Object.keys(tagsByParticipant).forEach(pid => {
      if (allAddressed[pid]) { addressedIds.push(pid); return; }   // Addressed replaces every tag column
      tagsByParticipant[pid].forEach(tagId => {
        if (byTag[tagId]) { byTag[tagId].push(pid); } else { unknown.add(tagId); }
      });
    });
    if (unknown.size) {
      // A tag written onto a submission whose taxonomy doc was later deactivated (or is
      // not tagsfor 'video ask') has no column to live in — those people vanish silently.
      console.warn('[v3][videoask-tags]', unknown.size, 'tag id(s) on submissions are not in the active video-ask taxonomy — not rendered:', [...unknown]);
    }

    // Every active tag renders, empty ones included (operator). Addressed sits last.
    return [
      ...tax.map(t => ({ ...t, profileIds: byTag[t.id], isAddressed: false })),
      { id: LiveEventDashboardV3Component.ADDRESSED, label: 'Addressed', color: 'var(--ok)', profileIds: addressedIds, isAddressed: true }
    ];
  }
  openTag(g: TagGroup): void {
    const scope = `${this.data.selectedEvent?.['name'] || ''} · ${this.tagDayLabel}`;
    if (g.isAddressed) { this.openPanel('Addressed · all tagged submissions resolved', scope, g.profileIds); return; }
    this.openPanel(`Tag · ${g.label}`, scope, g.profileIds);
  }
  /** Day the section is showing, for panel subtitles. */
  get tagDayLabel(): string {
    const day = this.data.procDayFilter;
    if (day === 'all') { return 'all days'; }
    const match = this.attDays.find(d => d.date === day);
    return match ? this.attDayLabel(match) : day;
  }

  // ==========================================================================
  // A&H CRM — flag status (first-timers-dashboard "A&H CRM — flag status")
  // participant tags (tagsfor 'live event') grouped by metadata `profiletags`.
  // A participant appears under EVERY flag they carry (multi-tag, per first-timers).
  // ==========================================================================
  getCrmTaxonomy(): { id: string; label: string; color: string }[] {
    return this.data.crmTags.map((t, i) => ({ id: t['docid'], label: t['name'] || t['docid'], color: this.tagPalette[i % this.tagPalette.length] }));
  }
  get crmGroups(): { id: string; label: string; color: string; profileIds: string[] }[] { return this.memo('crmGroups', () => this.computeCrmGroups()); }
  private computeCrmGroups(): { id: string; label: string; color: string; profileIds: string[] }[] {
    const tax = this.getCrmTaxonomy();
    if (!tax.length) { return []; }
    const byTag: { [id: string]: string[] } = {};
    tax.forEach(t => { byTag[t.id] = []; });
    this.data.eventParticipantProfileIds.forEach(pid => {
      const meta = this.data.participantMetadataMap[pid];
      const tags: string[] = (meta && meta['profiletags']) || [];
      tax.forEach(t => { if (tags.includes(t.id)) { byTag[t.id].push(pid); } });
    });
    return tax.map(t => ({ ...t, profileIds: byTag[t.id] }));   // include empty flags
  }
  openCrm(g: { label: string; profileIds: string[] }): void {
    this.openPanel(`Flag · ${g.label}`, `${this.data.selectedEvent?.['name'] || ''} · A&H CRM`, g.profileIds);
  }
  participantName(profileId: string): string { return this.data.participantMetadataMap[profileId]?.['name'] || this.data.registeredNames[profileId] || 'Unknown'; }
  /** All eligible products (from the participant's event participation request
   *  docs), resolved to names. */
  productNames(profileId: string): string[] {
    return (this.data.registeredProductIds[profileId] || []).map(id => this.data.productMap[id] || id).filter(Boolean);
  }
  /** Colour class per journey (cycles the prototype palette) so journey badges are
   *  colour-coded even though journeys are dynamic. */
  journeyBadgeClass(journeyId: string): string {
    const idx = this.data.journeyCounts.findIndex(j => j.journeyId === journeyId);
    return 'jc' + ((idx >= 0 ? idx : 0) % 6);
  }

  // ==========================================================================
  // Arena Followup (#fuGrid) — 3 cards: Irregular, Not Doing CW, CW Not Received
  // ==========================================================================
  fuDay = '';        // '' = today; otherwise a 'yyyy-mm-dd' event day
  fuTime = '09:00';  // cutoff (V2 arenaFollowupTimeFilter)

  /** Target day for Irregular — the picked day, else today. */
  get fuTargetDate(): string {
    if (this.fuDay) { return this.fuDay; }
    const today = this.data.dayWiseAttendance.find(d => d.isToday);
    return today ? today.date : new Date().toLocaleDateString('en-CA');
  }
  /** V2 calculateIrregularParticipants — late scan-in after the cutoff. */
  getIrregularParticipants(): string[] { return this.data.irregularParticipantIds(this.fuTargetDate, this.fuTime); }
  get fuPastDays(): DayAttendance[] { return this.data.dayWiseAttendance.filter(d => d.isPast); }

  get fuNotDoingCW(): string[] { return this.data.notDoingCWIds; }
  get fuCWNotReceived(): string[] { return this.data.cwNotReceivedIds; }
  get fuIrregular(): string[] { return this.getIrregularParticipants(); }

  // The 2 non-Irregular cards (Irregular is rendered first — it has controls).
  get fuCards(): { label: string; title: string; color: string; eyebrow: string; ids: string[] }[] {
    return [
      // RENAMED (operator 2026-07-29) — the old names read as "isn't participating";
      // these say which DIRECTION is missing. notDoingCW = gave none to others,
      // cwNotReceived = received none for themself. Underlying ids are unchanged.
      { label: 'No CW to Others', title: 'Not doing changework', color: 'var(--warn)', eyebrow: 'Throughout event', ids: this.fuNotDoingCW },
      { label: 'No CW to themself', title: 'Changework not received', color: 'var(--warn)', eyebrow: 'Throughout event', ids: this.fuCWNotReceived },
      { label: 'No cohort', title: 'No cohort assigned', color: 'var(--alert)', eyebrow: 'Not in any cohort', ids: this.noCohortProfileIds }
    ];
  }
  openFu(title: string, ids: string[]): void { this.openPanel(title, this.data.selectedEvent?.['name'] || '', ids); }

  // ==========================================================================
  // BACKEND VIEW
  // ==========================================================================
  get hasEventDays(): boolean { return this.data.dayWiseAttendance.length > 0; }
  private uni(id: string): boolean { return this.data.eventParticipantProfileIds.includes(id); }

  // ---- Video Ask Review (#vaKpis / #vaTrays) — V2 review state -----------------
  vaDay = 'today';   // 'today' | 'all' | date
  get vaDayChips(): { value: string; label: string; active: boolean }[] {
    const chips = [{ value: 'all', label: 'Overall', active: this.vaDay === 'all' }];
    this.data.dayWiseAttendance.filter(d => !d.isFuture).forEach(d => chips.push({ value: d.date, label: d.isToday ? 'Today' : 'D' + d.day, active: this.vaDay === d.date || (this.vaDay === 'today' && d.isToday) }));
    return chips;
  }
  setVaDay(v: string): void { this.vaDay = v; }
  private vaScopeDates(): string[] {
    if (this.vaDay === 'all') { return this.data.dayWiseAttendance.filter(d => !d.isFuture).map(d => d.date); }
    if (this.vaDay === 'today') { const t = this.data.dayWiseAttendance.find(d => d.isToday); return t ? [t.date] : []; }
    return [this.vaDay];
  }
  get vaReceivedIds(): string[] {
    const s = new Set<string>();
    this.vaScopeDates().forEach(dt => (this.data.videoAskByDay[dt] || []).forEach(id => { if (this.uni(id)) { s.add(id); } }));
    return [...s];
  }
  // Reviewed = submitted AND tagged that day.
  get vaReviewedIds(): string[] {
    const s = new Set<string>();
    this.vaScopeDates().forEach(dt => (this.data.videoAskTaggedByDay[dt] || []).forEach(id => { if (this.uni(id)) { s.add(id); } }));
    return [...s];
  }
  // To review = submitted but NOT tagged.
  get vaToReviewIds(): string[] { const r = new Set(this.vaReviewedIds); return this.vaReceivedIds.filter(id => !r.has(id)); }
  // Missing = present that day but did NOT submit.
  get vaMissingIds(): string[] {
    const s = new Set<string>();
    this.vaScopeDates().forEach(dt => { const day = this.data.dayWiseAttendance.find(d => d.date === dt); if (day) { this.getMissingRecordingByDay(day).forEach(id => s.add(id)); } });
    return [...s];
  }
  get vaPercentage(): number { const r = this.vaReceivedIds.length; return r ? Math.round((this.vaReviewedIds.length / r) * 100) : 0; }
  openVa(title: string, ids: string[]): void { this.openPanel(title, this.data.selectedEvent?.['name'] || '', ids); }

  // ---- Arena Calling (#callDayChips + rows) — outcomes via getCallLog stub ------
  callDay = 'today';
  get callDayChips(): { value: string; label: string; active: boolean }[] {
    const chips = [{ value: 'all', label: 'Overall', active: this.callDay === 'all' }];
    this.data.dayWiseAttendance.filter(d => !d.isFuture).forEach(d => chips.push({ value: d.date, label: d.isToday ? 'Today' : 'D' + d.day, active: this.callDay === d.date || (this.callDay === 'today' && d.isToday) }));
    return chips;
  }
  setCallDay(v: string): void { this.callDay = v; this.callShown = 20; this.rebuildCalls(); }
  private callScopeDates(): string[] {
    if (this.callDay === 'all') { return this.data.dayWiseAttendance.filter(d => !d.isFuture).map(d => d.date); }
    if (this.callDay === 'today') { const t = this.data.dayWiseAttendance.find(d => d.isToday); return t ? [t.date] : []; }
    return [this.callDay];
  }

  callShown = 20;
  readonly callOptions: { value: CallLogEntry['status']; label: string }[] = [
    { value: 'pending', label: 'To call' }, { value: 'coming', label: 'Coming' },
    { value: 'no-answer', label: 'No answer' }, { value: 'not-coming', label: 'Not coming' }
  ];
  // optimistic overrides: `${profileId}|${dayKey}` → status, cleared once the
  // live doc reflects it (reconciled in ngOnInit's changed$ handler).
  private callOptimistic: { [key: string]: CallLogEntry['status'] } = {};

  /** C-9 — reads the live event_caller_log state (service callLogMap). */
  getCallLog(day: string): CallLogEntry[] {
    return Object.values(this.data.callLogMap)
      .filter(e => e.dayKey === day)
      .map(e => ({ profileId: e.profileId, day: e.dayKey, status: e.status as CallLogEntry['status'], calledAt: e.calledAt, callerId: e.callerId }));
  }

  callRowsCache: CallRow[] = [];
  callSummaryCache = { pending: 0, coming: 0, noAnswer: 0, notComing: 0 };

  /** Rebuild the CACHED call rows + status summary. Called only when the backend
   *  view is active or relevant state changes — so it never runs per-CD or while
   *  another tab is showing (the getter version ran ~6× every cycle). */
  rebuildCalls(): void {
    const rows: CallRow[] = [];
    this.callScopeDates().forEach(dt => {
      const day = this.data.dayWiseAttendance.find(d => d.date === dt);
      if (!day) { return; }
      const logByProfile = new Map<string, CallLogEntry>();
      this.getCallLog(dt).forEach(e => logByProfile.set(e.profileId, e));
      day.absentProfileIds.forEach(pid => {
        const e = logByProfile.get(pid);
        const optimistic = this.callOptimistic[pid + '|' + dt];
        const meta = this.data.participantMetadataMap[pid];
        rows.push({
          profileId: pid, day: dt, name: this.participantName(pid), journeyId: meta?.['activejourney'] || '',
          status: optimistic || e?.status || 'pending', calledAt: e?.calledAt || null, callerId: e?.callerId || null
        });
      });
    });
    this.callRowsCache = rows;
    const s = { pending: 0, coming: 0, noAnswer: 0, notComing: 0 };
    rows.forEach(r => { if (r.status === 'pending') { s.pending++; } else if (r.status === 'coming') { s.coming++; } else if (r.status === 'no-answer') { s.noAnswer++; } else if (r.status === 'not-coming') { s.notComing++; } });
    this.callSummaryCache = s;
  }
  get callRows(): CallRow[] { return this.callRowsCache; }
  get callVisibleRows(): CallRow[] { return this.callRowsCache.slice(0, this.callShown); }
  callMore(): void { this.callShown += 20; }
  get callPending(): number { return this.callSummaryCache.pending; }
  get callComing(): number { return this.callSummaryCache.coming; }
  get callNoAnswer(): number { return this.callSummaryCache.noAnswer; }
  get callNotComing(): number { return this.callSummaryCache.notComing; }
  callStatusClass(s: string): string { return ({ pending: 'pending', coming: 'coming', 'no-answer': 'noanswer', 'not-coming': 'notcoming' } as { [k: string]: string })[s] || ''; }
  callerName(id: string | null | undefined): string { if (!id) { return ''; } return this.data.participantMetadataMap[id]?.['name'] || id; }
  fmtTime(t: Timestamp | null | undefined): string {
    if (!t) { return ''; }
    const d = (t as any).toDate ? (t as any).toDate() : new Date(t as any);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // Row detail helpers (real data, no new seam)
  attendedDays(profileId: string): number { return this.data.dayWiseAttendance.filter(d => !d.isFuture && d.presentProfileIds.includes(profileId)).length; }
  elapsedDays(): number { return this.data.eventDatesUntilToday.length; }
  isNever(profileId: string): boolean { return this.data.allDayAbsentProfileIds.includes(profileId); }

  /** Write outcome with optimistic update; revert on error. */
  setCallOutcome(row: CallRow, status: CallLogEntry['status']): void {
    const key = row.profileId + '|' + row.day;
    const prev = this.callOptimistic[key];
    this.callOptimistic[key] = status;
    this.rebuildCalls();
    this.data.setCallOutcome(row.profileId, row.day, status).catch(err => {
      console.error('[v3][calls] write failed:', err);
      if (prev === undefined) { delete this.callOptimistic[key]; } else { this.callOptimistic[key] = prev; }
      this.rebuildCalls();
      this.cdr.detectChanges();
    });
  }
  /** Clear optimistic entries once the live log agrees (called from changed$). */
  reconcileCallOptimistic(): void {
    Object.keys(this.callOptimistic).forEach(k => {
      if (this.data.callLogMap[k]?.status === this.callOptimistic[k]) { delete this.callOptimistic[k]; }
    });
  }

  openCallStatus(status: string, title: string): void { this.openPanel(title, this.data.selectedEvent?.['name'] || '', this.callRows.filter(r => r.status === status).map(r => r.profileId)); }
  openCallAll(): void { this.openPanel('Not in the Arena', this.data.selectedEvent?.['name'] || '', this.callRows.map(r => r.profileId)); }

  // ---- Customer Support (#csKpis / #csCats / #tkList) — real (C-10) -------------
  // open = status.status==='Open' && chatstatus==='New';
  // inProgress = Open && chatstatus==='Responded'; resolved = closed today.
  getSupportStatusCounts(): { open: number; inProgress: number; resolved: number } {
    return this.data.supportCounts;
  }
  /** Mean open→close hours across closed-in-scope tickets. NOTE: the tile label
   *  reads "Median resolution" but this is the MEAN (per the spec) — pending the
   *  operator's call to keep the mean, use a true median, or relabel to "Avg". */
  getSupportResolutionHours(): number { return this.data.supportResolutionHours; }

  getTicketFeed(): TicketFeedEntry[] {
    return this.data.clientIssues.map((t: any) => {
      const label = this.data.ticketLabel(t);
      const isClosed = label === 'resolved';
      const status = isClosed ? 'Resolved' : (label === 'open' ? 'Open' : 'In Progress');
      let resolutionHours: number | null = null;
      if (isClosed) {
        const cd = t['status']?.['date']; const closeDate = cd?.toDate ? cd.toDate() : (cd ? new Date(cd) : null);
        const rd = t['reporteddate']; const openDate = rd?.toDate ? rd.toDate() : (rd ? new Date(rd) : null);
        if (closeDate && openDate) { resolutionHours = Math.round(((closeDate.getTime() - openDate.getTime()) / 3600000) * 10) / 10; }
      }
      const assign = t['assign'];
      const assigneeId = Array.isArray(assign) ? (assign[0] || null) : (assign || null);
      return { profileId: t['clientid'], name: this.participantName(t['clientid']), category: t['category'] || '', status, time: t['reporteddate'] || null, assigneeId, resolutionHours };
    });
  }
  feedStatusClass(s: string): string { return s === 'In Progress' ? 'inprogress' : s.toLowerCase(); }
  assigneeName(id: string | null | undefined): string { if (!id) { return ''; } return this.data.participantMetadataMap[id]?.['name'] || ''; }
  assigneeInitials(id: string | null | undefined): string { return this.initials(this.assigneeName(id)); }

  get csCats(): { category: string; count: number; open: number; inProgress: number; resolved: number; profileIds: string[] }[] { return this.data.categoryCounts; }
  get csHasTickets(): boolean { return this.data.clientIssues.length > 0; }
  get csOpenProfileIds(): string[] {
    return [...new Set(this.data.clientIssues.filter((t: any) => this.data.ticketLabel(t) === 'open').map((t: any) => t['clientid']).filter((id: string) => id))];
  }
  openCsOpen(): void { this.openPanel('Open tickets', 'Customer support', this.csOpenProfileIds); }
  openCsCat(cat: { category: string; profileIds: string[] }): void { this.openPanel(`Support · ${cat.category}`, 'Customer support', cat.profileIds); }

  // ==========================================================================
  // ZONES VIEW (Phase 5) — live occupancy (READ-ONLY). Zone defs + cohorts +
  // staff names reused from event-zone-management; allocations + no-zone from V2,
  // all via LiveEventDataService. This view WRITES NOTHING (no toggle/allocation).
  // ==========================================================================
  /** Show the zones view whenever zones are configured for the event — NOT gated
   *  on "today" being inside the event range (a live/open zone must still render
   *  even when the event's day structure has no calendar-today). */
  get zonesLive(): boolean { return this.data.eventZoneList.length > 0; }
  get zones(): any[] { return this.data.eventZoneList; }
  get zonesLiveCount(): number { return this.data.eventZoneList.filter(z => z['status'] === 'open').length; }

  // present TODAY = participants with a scan today (from mapAttendence), scoped to
  // the registered universe. Derived straight from the scan log so it works even
  // when dayWiseAttendance has no calendar-today entry. 0 if nobody scanned today.
  private get zonePresentIds(): string[] {
    const uni = new Set(this.data.eventParticipantProfileIds);
    const todayStr = new Date().toLocaleDateString('en-CA');
    return Object.keys(this.data.mapAttendence).filter(id => {
      if (!uni.has(id)) { return false; }
      return (this.data.mapAttendence[id] || []).some(r => {
        const ld = r['logdate']?.toDate ? r['logdate'].toDate() : new Date(r['logdate']);
        return ld.toLocaleDateString('en-CA') === todayStr;
      });
    });
  }
  get zonePresentCount(): number { return this.zonePresentIds.length; }
  private get zoneAllocatedIds(): string[] { return this.zonePresentIds.filter(id => this.data.zoneParticipantIds.has(id)); }
  private get zoneUnassignedIds(): string[] { return this.zonePresentIds.filter(id => !this.data.zoneParticipantIds.has(id)); }
  get zoneAllocatedCount(): number { return this.zoneAllocatedIds.length; }
  get zoneUnassignedCount(): number { return this.zoneUnassignedIds.length; }
  get zoneCoveragePct(): number { const p = this.zonePresentIds.length; return p ? Math.round((this.zoneAllocatedIds.length / p) * 100) : 0; }

  // No cohort (Zone Configuration basis) — registered participants who are in NO
  // "big cohorts" participantidlist. Scoped to the whole event universe (a roster
  // attribute, independent of today's attendance), not present-today.
  private get cohortMemberSet(): Set<string> {
    const s = new Set<string>();
    Object.keys(this.data.mapCohortParticipants).forEach(cid =>
      (this.data.mapCohortParticipants[cid] || []).forEach(id => s.add(id)));
    return s;
  }
  /** Registered participants in NO "big cohorts" participantidlist (Zone Config
   *  basis). Reused by the Zones "No cohort" tile and the Arena Followup column. */
  get noCohortProfileIds(): string[] {
    const members = this.cohortMemberSet;
    return this.data.eventParticipantProfileIds.filter(id => !members.has(id));
  }
  get zoneNoCohortCount(): number { return this.noCohortProfileIds.length; }
  openZoneNoCohort(): void { this.openZoneList('No cohort', this.data.selectedEvent?.['name'] || '', this.noCohortProfileIds, id => this.zoneNameOf(id) || 'no zone'); }

  zoneIsLive(zone: any): boolean { return zone['status'] === 'open'; }
  zoneCoordinators(zone: any): string { return this.staffNames(zone['coordinators']); }
  zoneMentors(zone: any): string { return this.staffNames(zone['mentors']); }
  private staffNames(ids: any): string {
    const list = Array.isArray(ids) ? ids : [];
    // participant metadata is the name source (staff are participants too);
    // falls back to the raw id like the old profile_data map did
    const names = list.map((id: string) => this.data.participantMetadataMap[id]?.['name'] || id).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  }

  // occupants of a zone = present-today whose allocation selectedzone == this zone.
  private zoneOccupantIds(zone: any): string[] {
    const zid = zone['docid'];
    return this.zonePresentIds.filter(id => this.data.zoneAllocationMap[id]?.selectedzone === zid);
  }
  zoneOccupantCount(zone: any): number { return this.zoneOccupantIds(zone).length; }

  // Cohort-when-multiple (FLAGGED): a participant's `eligiliblecohorts` may list
  // several; we group under the FIRST (documented default). Resolve cohort id →
  // name via ZM's big-cohorts map. No eligiliblecohorts → "No cohort".
  cohortNameOf(profileId: string): string {
    const cohortId = this.data.zoneAllocationMap[profileId]?.eligiliblecohorts?.[0];
    if (!cohortId) { return 'No cohort'; }
    return this.data.mapCohortsData[cohortId]?.['name'] || cohortId;
  }
  private groupByCohort(ids: string[]): { name: string; count: number; ids: string[] }[] {
    const by: { [name: string]: string[] } = {};
    ids.forEach(id => { const c = this.cohortNameOf(id); (by[c] = by[c] || []).push(id); });
    return Object.keys(by).map(name => ({ name, count: by[name].length, ids: by[name] })).sort((a, b) => b.count - a.count);
  }
  zoneCohorts(zone: any): { name: string; count: number; ids: string[] }[] { return this.groupByCohort(this.zoneOccupantIds(zone)); }

  checkinTime(profileId: string): string { return this.data.firstScanTimeToday(profileId); }
  private zoneNameOf(profileId: string): string {
    const zid = this.data.zoneAllocationMap[profileId]?.selectedzone;
    return zid ? (this.data.mapEventZoneData[zid]?.['zonename'] || zid) : '';
  }

  // drill-downs (READ-ONLY panels; occupant flag = "cohort · in since HH:MM").
  private openZoneList(title: string, sub: string, ids: string[], flag: (id: string) => string): void {
    const rows = ids.map(id => ({ ...this.data.buildParticipantFromProfileId(id, true), _meta: flag(id) }));
    this.openPanelRows(title, sub, rows);
  }
  openZonePresent(): void { this.openZoneList('In the Arena today', this.data.selectedEvent?.['name'] || '', this.zonePresentIds, id => this.zoneNameOf(id) || 'no zone yet'); }
  openZoneAllocated(): void { this.openZoneList('Allocated to zones', this.data.selectedEvent?.['name'] || '', this.zoneAllocatedIds, id => this.zoneNameOf(id) || 'no zone yet'); }
  openZoneUnassigned(): void { this.openZoneList('No zone yet', this.data.selectedEvent?.['name'] || '', this.zoneUnassignedIds, () => 'no zone yet'); }
  openZone(zone: any): void { this.openZoneList(zone['zonename'], this.data.selectedEvent?.['name'] || '', this.zoneOccupantIds(zone), id => `${this.cohortNameOf(id)} · in since ${this.checkinTime(id)}`); }
  openZoneCohort(zone: any, c: { name: string; ids: string[] }): void { this.openZoneList(`${zone['zonename']} · ${c.name}`, this.data.selectedEvent?.['name'] || '', c.ids, id => `${c.name} · in since ${this.checkinTime(id)}`); }

  // ==========================================================================
  // Drill-down panel
  // ==========================================================================
  openPanel(title: string, sub: string, profileIds: string[]): void {
    this.openPanelRows(title, sub, profileIds.map(id => this.data.buildParticipantFromProfileId(id, false)));
  }
  private openPanelRows(title: string, sub: string, rows: PanelParticipant[], preserveOrder = false): void {
    this.panelTitle = title;
    this.panelSub = sub;
    this.panelSearch = '';
    this.panelCountSort = '';                   // every list opens in its own order
    this.panelTimeSort = '';
    this.panelScrolled = false;
    this.panelListRef?.nativeElement.scrollTo({ top: 0 });   // a new list starts at its top
    this.panelFilter = {
      type: 'all', attendance: 'all', products: [], cohorts: [], journeys: [],
      productInc: true, cohortInc: true, journeyInc: true   // every list opens on include
    };
    this.panelProductSet.clear();
    this.panelCohortMemberSet.clear();
    this.panelJourneyMemberSet.clear();
    this.panelJourneyNone = false;
    this.panelRowIds = this.panelRowProfileIds(rows);
    this.refreshPanelOptions();
    this.panelMarkable = false;                 // re-enabled per-list (openAttAbsent)
    this.panelMarkDate = '';                    // '' = credit the mark to today
    this.markedIds = new Set<string>();
    this.closeDetail();                         // a popup belongs to ONE list
    this.closeCw();
    this.exitCommMode();                        // a selection is only ever about ONE list
    this.closeMarkPicker();                     // never carry a picker across lists
    // preserveOrder keeps doer↔beneficiary pairs adjacent (as a set); otherwise sort by name.
    this.panelRows = preserveOrder ? rows.slice() : rows.slice().sort((a, b) => a.name.localeCompare(b.name));
    this.panelOpen = true;
    this.syncLiveTicker();                      // tick only while timer rows are on screen
  }

  /** ONE row per lead participant, carrying every counterpart they worked with.
   *
   *  Changework is one-to-many in practice — a doer runs the same procedure for
   *  several beneficiaries — and a row per changework doc repeated that doer once
   *  per counterpart with nothing to say the other rows were the same person. Rows
   *  are grouped instead: the lead once, their counterparts listed under them.
   *
   *  `groupBy` follows the cell that was clicked, so the lead is always the side the
   *  operator asked about: an "As Doer" list groups by doer, "As Beneficiary" by
   *  beneficiary. Counterparts are de-duplicated by profileid — repeat docs for the
   *  same pair are noise in a "who did this for whom" list.
   *
   *  `name`/`email` concatenate the whole group so the panel search still matches
   *  any member of it. */
  private procGroupRows(
    data: any[], procName: string, showProc: boolean, groupBy: 'doer' | 'beneficiary',
    // leadSearch: the panel search matches the LEAD side only (operator: doer
    // panels search doers, beneficiary panels search beneficiaries). LIVE lists
    // keep whole-group search — looking up a beneficiary still finds their doer.
    leadSearch = false
  ): PanelParticipant[] {
    const groups = new Map<string, {
      lead: PanelParticipant | null; others: PanelParticipant[]; seen: Set<string>; proc: string; since: number;
    }>();
    (data || []).forEach((cw: any, idx: number) => {
      if (!cw.doerId && !cw.beneficiaryId) { return; }
      const leadId = groupBy === 'doer' ? cw.doerId : cw.beneficiaryId;
      // Completed entries already carry every counterpart (calculateProcedureData
      // accumulates them per lead); live changework is a flat list of pairs, so fall
      // back to the single opposite id and let the grouping below merge them.
      const otherIds: string[] = cw.counterpartIds?.length
        ? cw.counterpartIds
        : [groupBy === 'doer' ? cw.beneficiaryId : cw.doerId].filter(Boolean);
      // A doc can arrive with the lead side blank (live changework is kept when
      // EITHER side is in scope). Those must not share a key, or unrelated docs merge
      // into one "—" group that asserts a doer relationship the data never had.
      const key = leadId || `__nolead__${idx}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          lead: leadId ? this.data.buildParticipantFromProfileId(leadId, true) : null,
          others: [], seen: new Set<string>(),
          proc: showProc ? (cw.procedureName || procName || '') : '',
          since: 0
        };
        groups.set(key, g);
      }
      // only live docs carry createdon; the earliest of a group's docs wins so
      // the timer shows the LONGEST-running changework
      const docSince = this.tsToMillis(cw.createdon);
      if (docSince && (!g.since || docSince < g.since)) { g.since = docSince; }
      otherIds.forEach((oid, i) => {
        if (!oid) { return; }
        // `_n` = how many changeworks the pair share. The completed lists arrive
        // pre-tallied; live docs are one apiece, so repeats accumulate here.
        const inc = Number(cw.counterpartCounts?.[i]) || 1;
        if (g!.seen.has(oid)) {
          const prev: any = g!.others.find(o => o.profileid === oid);
          if (prev) {
            prev._n = (prev._n || 1) + inc;
            if (docSince && (!prev._since || docSince < prev._since)) { prev._since = docSince; }
            const moreCw: any[] = cw.counterpartCw?.[i] || [];
            if (moreCw.length) { prev._cw = [...(prev._cw || []), ...moreCw]; }
            // a NEWER doc for the same live pair updates the status chips
            if ((cw.doerStatus !== undefined || cw.beneficiaryStatus !== undefined) && docSince >= (prev._stAt || 0)) {
              prev._ds = cw.doerStatus ?? null; prev._bs = cw.beneficiaryStatus ?? null;
              prev._stOk = true; prev._stAt = docSince;
            }
            if (cw.docId) { prev._cwIds = [...(prev._cwIds || []), cw.docId]; }
            // a repeat LIVE doc for the same pair is another changework record
            if (!cw.counterpartCw) {
              prev._cw = [...(prev._cw || []), { note: cw.note || '', createdon: cw.createdon ?? null,
                procedure: cw.procedureName || procName || '', hours: cw.hours || '',
                hourType: cw.hourType || '', adjustment: cw.adjustment ?? '',
                doerStatus: cw.doerStatus ?? null, beneficiaryStatus: cw.beneficiaryStatus ?? null,
                lastUpdated: cw.lastUpdated ?? null, docId: cw.docId ?? null }];
            }
          }
          return;
        }
        g!.seen.add(oid);
        const p: any = this.data.buildParticipantFromProfileId(oid, true);
        // A counterpart need not be a registered event participant, in which case the
        // builder only has 'Unknown'. The changework doc carries a real name — prefer it.
        const hinted = cw.counterpartNames?.[i] || (groupBy === 'doer' ? cw.beneficiaryName : cw.doerName);
        if (hinted && (!p.name || p.name === 'Unknown')) { p.name = hinted; }
        p._n = inc;
        if (docSince) { p._since = docSince; }
        // _cw = one record per changework of this pair — the changework popup
        // (row click) renders them; the profile popup carries no note/hours.
        const cwItems: any[] = cw.counterpartCw?.[i] || [];
        // the changework popup names both sides of the pair regardless of which
        // side leads the list
        const pairNames = groupBy === 'doer'
          ? { doerName: cw.doerName || g!.lead?.name || '—', beneficiaryName: p.name }
          : { doerName: p.name, beneficiaryName: cw.beneficiaryName || g!.lead?.name || '—' };
        if (cwItems.length) {
          p._cw = cwItems;
          p._cwPair = pairNames;
          // D/B status chips: the LATEST changework of the pair speaks for it
          const latest = cwItems.reduce((a: any, b: any) =>
            this.tsToMillis(b?.createdon) >= this.tsToMillis(a?.createdon) ? b : a, cwItems[0]);
          p._ds = latest?.doerStatus ?? null; p._bs = latest?.beneficiaryStatus ?? null;
          p._stOk = true; p._stAt = this.tsToMillis(latest?.createdon);
          const recIds = cwItems.map((x: any) => x.docId).filter(Boolean);
          if (recIds.length) { p._cwIds = recIds; }
        } else if (cw.doerStatus !== undefined || cw.beneficiaryStatus !== undefined) {
          // live flat docs carry the statuses directly — and ARE the changework
          // record the popup shows
          p._ds = cw.doerStatus ?? null; p._bs = cw.beneficiaryStatus ?? null;
          p._stOk = true; p._stAt = docSince;
          if (cw.docId) { p._cwIds = [cw.docId]; }
          p._cw = [{ note: cw.note || '', createdon: cw.createdon ?? null,
                     procedure: cw.procedureName || procName || '', hours: cw.hours || '',
                     hourType: cw.hourType || '', adjustment: cw.adjustment ?? '',
                     doerStatus: cw.doerStatus ?? null, beneficiaryStatus: cw.beneficiaryStatus ?? null,
                     lastUpdated: cw.lastUpdated ?? null, docId: cw.docId ?? null }];
          p._cwPair = pairNames;
        }
        g!.others.push(p);
      });
    });
    return [...groups.values()]
      .map(g => ({
        _pair: true,
        lead: g.lead,
        leadRole: groupBy,
        others: g.others,
        proc: g.proc,
        _since: g.since || 0,
        profileid: g.lead?.profileid || g.others[0]?.profileid || '',
        // name/email are the group's SEARCH INDEX (nothing renders them)
        name: leadSearch ? (g.lead?.name || '') : [g.lead?.name, ...g.others.map(o => o.name)].filter(Boolean).join(' '),
        email: leadSearch ? (g.lead?.email || '') : [g.lead?.email, ...g.others.map(o => o.email)].filter(Boolean).join(' '),
      } as any))
      .sort((a, b) => (a.lead?.name || '').localeCompare(b.lead?.name || ''));
  }
  // list filters: first-timer / repeat (mutually exclusive) + attendance-log
  // presence ('none' = no scan on any day · 'has' = at least one scan) + products
  // + cohorts (both multi-select, OR semantics). The two attendance chips are
  // mutually exclusive — together they would match nobody.
  //
  // productInc/cohortInc/journeyInc are the include↔exclude switches over each
  // multi-select: ON (the default) keeps the rows that match the picks, OFF drops
  // them and keeps everyone else. The picks themselves mean the same thing either
  // way — only the sense of the test flips — so toggling never disturbs a selection.
  // With nothing picked a dimension is inert in BOTH senses (excluding nothing
  // excludes nobody), which is why panelFilterActive still keys off the picks alone.
  panelFilter: {
    type: 'all' | 'ft' | 'rp'; attendance: 'all' | 'none' | 'has';
    products: string[]; cohorts: string[]; journeys: string[];
    productInc: boolean; cohortInc: boolean; journeyInc: boolean;
  } = {
    type: 'all', attendance: 'all', products: [], cohorts: [], journeys: [],
    productInc: true, cohortInc: true, journeyInc: true
  };
  /** Products actually present in the OPEN list (not the whole catalogue), so the
   *  dropdown only ever offers options that can match something. `count` = how many
   *  distinct participants in this list hold that product. */
  panelProductOptions: { id: string; name: string; count: number }[] = [];
  private panelProductSet = new Set<string>();
  /** "big cohorts" for this event that have at least one member in the OPEN list. */
  panelCohortOptions: { id: string; name: string; count: number }[] = [];
  /** Active journeys represented in the OPEN list, plus a "No journey" entry when
   *  anyone in it falls outside every journey bucket. */
  panelJourneyOptions: { id: string; name: string; count: number }[] = [];
  private panelJourneyMemberSet = new Set<string>();
  private panelJourneyNone = false;          // is the "No journey" option picked?
  /** What the cohort dropdown actually renders — panelCohortOptions narrowed by the
   *  in-dropdown search. Held as a field, not a getter, so the *ngFor is not handed a
   *  fresh array (and MatSelect a churning option list) on every change detection. */
  panelCohortView: { id: string; name: string; count: number }[] = [];
  cohortSearch = '';
  @ViewChild('cohortSearchBox') private cohortSearchBox?: ElementRef<HTMLInputElement>;
  /** Union of the picked cohorts' participantidlist — membership is then an O(1)
   *  lookup per row instead of re-scanning every cohort's array. */
  private panelCohortMemberSet = new Set<string>();
  /** True while a dropdown overlay is open — ESC must close the dropdown only, not
   *  the whole drill-down panel underneath it. */
  panelSelectOpen = false;
  // Segmented controls, so these are explicit picks — 'all' IS the off position and
  // there is nothing to toggle back to.
  setPanelType(t: 'all' | 'ft' | 'rp'): void { this.panelFilter.type = t; }
  setPanelAttendance(a: 'all' | 'none' | 'has'): void { this.panelFilter.attendance = a; }
  onPanelProductChange(): void { this.panelProductSet = new Set(this.panelFilter.products); }
  clearPanelProducts(): void { this.panelFilter.products = []; this.panelProductSet.clear(); }
  onPanelCohortChange(): void {
    this.panelCohortMemberSet = new Set<string>();
    this.panelFilter.cohorts.forEach(cid =>
      (this.data.mapCohortParticipants[cid] || []).forEach(pid => this.panelCohortMemberSet.add(pid)));
  }
  clearPanelCohorts(): void { this.panelFilter.cohorts = []; this.panelCohortMemberSet.clear(); }
  onPanelJourneyChange(): void {
    this.panelJourneyMemberSet = new Set<string>();
    this.panelJourneyNone = false;
    this.panelFilter.journeys.forEach(jid => {
      if (jid === NO_JOURNEY) { this.panelJourneyNone = true; return; }
      const j = this.data.journeyCounts.find(x => x.journeyId === jid);
      (j?.profileIds || []).forEach(pid => this.panelJourneyMemberSet.add(pid));
    });
  }
  clearPanelJourneys(): void {
    this.panelFilter.journeys = []; this.panelJourneyMemberSet.clear(); this.panelJourneyNone = false;
  }
  trackOptId(_: number, o: { id: string }): string { return o.id; }
  /** Everyone who sits in SOME journey bucket — the complement is "No journey", the
   *  same definition noJourneyProfileIds uses (missing activejourney OR one absent
   *  from the journey collection, so it never formed a bucket). */
  private get journeyedIds(): Set<string> {
    return this.memo('journeyedIds', () => {
      const s = new Set<string>();
      this.data.journeyCounts.forEach(j => j.profileIds.forEach(pid => s.add(pid)));
      return s;
    });
  }

  // ---- cohort dropdown search ---------------------------------------------------
  /** Narrow the rendered cohorts. ALREADY-PICKED cohorts always stay rendered even
   *  when they do not match: MatSelect rebuilds its selection from the options in the
   *  DOM, so a selected option that is filtered away is dropped from the value the
   *  next time anything is toggled. Keeping them also lets you undo a pick without
   *  clearing the search first. */
  onCohortSearch(): void {
    const q = this.cohortSearch.toLowerCase().trim();
    if (!q) { this.panelCohortView = this.panelCohortOptions; return; }
    const picked = new Set(this.panelFilter.cohorts);
    this.panelCohortView = this.panelCohortOptions.filter(o =>
      picked.has(o.id) || o.name.toLowerCase().includes(q));
  }
  /** MatSelect's own typeahead would hijack the letters and space would toggle the
   *  active option, so those keys stop here; navigation and close keys pass through
   *  to the panel as usual. */
  onCohortSearchKeydown(e: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', 'Tab'].includes(e.key)) { return; }
    e.stopPropagation();
  }
  onCohortSelectOpened(open: boolean): void {
    this.panelSelectOpen = open;
    this.cohortSearch = '';                     // every open starts from the full list
    this.panelCohortView = this.panelCohortOptions;
    if (open) { setTimeout(() => this.cohortSearchBox?.nativeElement?.focus()); }
  }
  /** Trigger text — one pick shows its name, several collapse to a count, because
   *  Material's default comma-joined list overflows a 440px panel. */
  private triggerLabel(picked: string[], opts: { id: string; name: string }[], noun: string): string {
    if (picked.length === 1) { return opts.find(o => o.id === picked[0])?.name || `1 ${noun}`; }
    return `${picked.length} ${noun}s`;
  }
  get panelProductTriggerLabel(): string { return this.triggerLabel(this.panelFilter.products, this.panelProductOptions, 'product'); }
  get panelCohortTriggerLabel(): string { return this.triggerLabel(this.panelFilter.cohorts, this.panelCohortOptions, 'cohort'); }
  get panelJourneyTriggerLabel(): string { return this.triggerLabel(this.panelFilter.journeys, this.panelJourneyOptions, 'journey'); }
  /** panelClass per dropdown. The overlay renders outside :host so the exclude sense
   *  cannot be inherited through the DOM — it is carried in as a class, which repaints
   *  the option ticks red so a tick in exclude mode never reads as "keep this one". */
  private selectPanelClass(include: boolean, extra = ''): string {
    return `pf-select-panel${extra}${include ? '' : ' pf-select-ex'}`;
  }
  get productPanelClass(): string { return this.selectPanelClass(this.panelFilter.productInc); }
  get cohortPanelClass(): string { return this.selectPanelClass(this.panelFilter.cohortInc, ' pf-select-searchable'); }
  get journeyPanelClass(): string { return this.selectPanelClass(this.panelFilter.journeyInc); }
  get panelFilterActive(): boolean {
    return this.panelFilter.type !== 'all' || this.panelFilter.attendance !== 'all'
      || this.panelProductSet.size > 0 || this.panelFilter.cohorts.length > 0
      || this.panelFilter.journeys.length > 0;
  }
  private hasAttendanceLog(profileid: string): boolean { const r = this.data.mapAttendence[profileid]; return !!r && r.length > 0; }
  private matchesPanelFilter(profileid: string): boolean {
    if (this.panelFilter.type === 'ft' && !this.isFirstTimer(profileid)) { return false; }
    if (this.panelFilter.type === 'rp' && this.isFirstTimer(profileid)) { return false; }
    if (this.panelFilter.attendance === 'none' && this.hasAttendanceLog(profileid)) { return false; }
    if (this.panelFilter.attendance === 'has' && !this.hasAttendanceLog(profileid)) { return false; }
    // Each of the three multi-selects tests membership once and then compares the
    // answer to its include switch: include keeps the hits, exclude keeps the misses.
    if (this.panelProductSet.size) {
      // holds at least one of the picked products
      const ids = this.data.registeredProductIds[profileid] || [];
      const hit = ids.some(id => this.panelProductSet.has(id));
      if (hit !== this.panelFilter.productInc) { return false; }
    }
    // cohort membership is the participantidlist on the "big cohorts" doc — NOT the
    // per-participant `eligiliblecohorts` that cohortNameOf()/the Zones view read.
    if (this.panelFilter.cohorts.length) {
      const hit = this.panelCohortMemberSet.has(profileid);
      if (hit !== this.panelFilter.cohortInc) { return false; }
    }
    if (this.panelFilter.journeys.length) {
      const inPicked = this.panelJourneyMemberSet.has(profileid);
      const isNone = this.panelJourneyNone && !this.journeyedIds.has(profileid);
      if ((inPicked || isNone) !== this.panelFilter.journeyInc) { return false; }
    }
    return true;
  }
  /** Distinct profile ids of the open list, and the data version its option lists
   *  were built from (so late-arriving snapshots can refresh them — see ngOnInit). */
  private panelRowIds = new Set<string>();
  private panelOptionsVersion = -1;
  private refreshPanelOptions(): void {
    this.panelProductOptions = this.computePanelProductOptions(this.panelRowIds);
    this.panelCohortOptions = this.computePanelCohortOptions(this.panelRowIds);
    this.panelJourneyOptions = this.computePanelJourneyOptions(this.panelRowIds);
    this.onCohortSearch();                      // re-apply any live search term
    this.panelOptionsVersion = this.viewVersion;
  }
  /** Distinct profile ids across the rows of the open list (a profile on several pair
   *  rows counts once) — the basis for both option lists' counts. */
  private panelRowProfileIds(rows: PanelParticipant[]): Set<string> {
    const ids = new Set<string>();
    const add = (pid: string) => { if (pid) { ids.add(pid); } };
    rows.forEach((r: any) => {
      // Leads only for grouped rows, so the Products/Cohorts/Journeys dropdowns offer
      // exactly what the lead-only filter can actually match — a counterpart-only
      // value would sit in the list promising rows and then return none.
      if (r['_pair']) { add(r['lead']?.profileid); }
      else { add(r.profileid); }
    });
    return ids;
  }
  /** Eligible products held by anyone in the open list, name-sorted with counts. */
  private computePanelProductOptions(ids: Set<string>): { id: string; name: string; count: number }[] {
    const counts: { [id: string]: number } = {};
    ids.forEach(pid => (this.data.registeredProductIds[pid] || [])
      .forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
    return Object.keys(counts)
      .map(id => ({ id, name: this.data.productMap[id] || id, count: counts[id] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  /** "big cohorts" of this event, kept only where participantidlist overlaps the open
   *  list; count = distinct members of that cohort present in the list. */
  private computePanelCohortOptions(ids: Set<string>): { id: string; name: string; count: number }[] {
    return Object.keys(this.data.mapCohortParticipants)
      .map(cid => {
        const members = new Set((this.data.mapCohortParticipants[cid] || []).filter(pid => ids.has(pid)));
        return { id: cid, name: this.data.mapCohortsData[cid]?.['name'] || cid, count: members.size };
      })
      .filter(o => o.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Journeys represented in the open list, name-sorted, with "No journey" appended
   *  last when anyone in the list sits outside every bucket. */
  private computePanelJourneyOptions(ids: Set<string>): { id: string; name: string; count: number }[] {
    const opts = this.data.journeyCounts
      .map(j => {
        const members = new Set(j.profileIds.filter(pid => ids.has(pid)));
        return { id: j.journeyId, name: this.journeyLabel(j.journeyId), count: members.size };
      })
      .filter(o => o.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const journeyed = this.journeyedIds;
    let none = 0;
    ids.forEach(pid => { if (!journeyed.has(pid)) { none++; } });
    if (none) { opts.push({ id: NO_JOURNEY, name: 'No journey', count: none }); }
    return opts;
  }
  /** Count sort (the ⇅ button in the count bar). Two list shapes carry a
   *  sortable count: the proc totals lists (rows with a _count badge) and the
   *  grouped changework lists (_pair rows, where the count is DISTINCT
   *  counterparts — beneficiaries for an "As Doer" list, doers for an
   *  "As Beneficiary" one). '' = the order the list opened with; first
   *  click = highest first. */
  panelCountSort: '' | 'asc' | 'desc' = '';
  // LIVE lists carry a second, mutually exclusive sort: elapsed live time (◷)
  panelTimeSort: '' | 'asc' | 'desc' = '';
  get panelSortable(): boolean {
    const r: any = this.panelRows[0];
    return !!r && (r['_count'] != null || !!r['_pair']);
  }
  get panelHasTimes(): boolean { return this.panelRows.some((r: any) => r['_since']); }
  get panelSortNoun(): string {
    const r: any = this.panelRows[0];
    if (r?.['_pair']) { return r['leadRole'] === 'beneficiary' ? 'doer count' : 'beneficiary count'; }
    return 'count';
  }
  // three states so the opening order stays reachable: ⇅ → ↓ highest → ↑ lowest → ⇅;
  // engaging either sort clears the other — one order at a time
  toggleCountSort(): void {
    this.panelTimeSort = '';
    this.panelCountSort = this.panelCountSort === '' ? 'desc' : this.panelCountSort === 'desc' ? 'asc' : '';
  }
  toggleTimeSort(): void {
    this.panelCountSort = '';
    this.panelTimeSort = this.panelTimeSort === '' ? 'desc' : this.panelTimeSort === 'desc' ? 'asc' : '';
  }

  get panelParticipants(): PanelParticipant[] {
    const q = this.panelSearch.toLowerCase().trim();
    const active = this.panelFilterActive;
    const rows = (!q && !active) ? this.panelRows : this.panelRows.filter((p: any) => {
      if (q && !((p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))) { return false; }
      if (!active) { return true; }
      if (p['_pair']) {
        // Changework groups filter on the LEAD ONLY — the side the clicked cell was
        // about. "As Doer · Completed" filtered by First timers means first-timer
        // DOERS; matching on counterparts too kept groups whose lead fails the filter
        // and made the list mostly non-matching people. Counterparts are still
        // rendered in full, as context for the lead that did match.
        return !!(p['lead'] && this.matchesPanelFilter(p['lead'].profileid));
      }
      return this.matchesPanelFilter(p.profileid);
    });
    // Sorting works on a COPY: the no-filter branch hands out panelRows itself, and
    // sorting that in place would overwrite the order the list opened with — there
    // would be nothing to come back to when the sort is toggled off.
    if ((this.panelCountSort || this.panelTimeSort) && rows.length) {
      const first: any = rows[0];
      // live-time sort (the ◷ button, LIVE lists only): 'highest first' means
      // longest-running changework first. Elapsed differences are constant, so
      // the ticking clock can never reorder the list mid-view.
      if (this.panelTimeSort && first['_pair']) {
        const dir = this.panelTimeSort === 'desc' ? -1 : 1;
        const e = (r: any) => r['_since'] ? (this.nowTick - r['_since']) : -1;
        return rows.slice().sort((a: any, b: any) =>
          (dir * (e(a) - e(b))) || (a['lead']?.name || '').localeCompare(b['lead']?.name || ''));
      }
      if (this.panelCountSort) {
        const dir = this.panelCountSort === 'desc' ? -1 : 1;
        if (first['_count'] != null) {
          return rows.slice().sort((a: any, b: any) =>
            (dir * ((a['_count'] || 0) - (b['_count'] || 0))) || a.name.localeCompare(b.name));
        }
        if (first['_pair']) {
          // grouped lists sort by DISTINCT counterparts (the eyebrow's number,
          // not changework depth); ties fall back to the lead's name.
          const n = (r: any) => r['others']?.length || 0;
          return rows.slice().sort((a: any, b: any) =>
            (dir * (n(a) - n(b))) || (a['lead']?.name || '').localeCompare(b['lead']?.name || ''));
        }
      }
    }
    return rows;
  }
  get panelCount(): number { return this.panelParticipants.length; }
  /** A grouped row is 1 lead + N counterparts, so the row count is NOT a headcount —
   *  calling it "N participants" under-reported the people on screen and contradicted
   *  the filter dropdowns, whose counts are per person. Grouped lists state both. */
  get panelCountLabel(): string {
    const rows: any[] = this.panelParticipants as any[];
    if (!rows.length || !rows[0]['_pair']) {
      return `${rows.length.toLocaleString()} participant${rows.length === 1 ? '' : 's'}`;
    }
    const ids = new Set<string>();
    let role = 'doer';
    rows.forEach(p => {
      if (p['lead']) { ids.add(p['lead'].profileid); role = p['leadRole'] || role; }
      (p['others'] || []).forEach((o: any) => ids.add(o.profileid));
    });
    const n = rows.length;
    const lead = role === 'beneficiary'
      ? `${n} ${n === 1 ? 'beneficiary' : 'beneficiaries'}`
      : `${n} ${n === 1 ? 'doer' : 'doers'}`;
    return `${lead} · ${ids.size} ${ids.size === 1 ? 'person' : 'people'}`;
  }
  closePanel(): void { this.panelOpen = false; this.closeDetail(); this.closeCw(); this.syncLiveTicker(); }

  /** Manual attendance marking (Unattended list) — two steps.
   *  Step 1 `openMarkPicker`: fetch the participant's ACTIVE arena e-ticket. No
   *  ticket (or no eligible products on it) → alert and write nothing, so
   *  `eticketref`/`product` can never be null. Otherwise the row expands inline
   *  into a product multi-select.
   *  Step 2 `confirmMark`: confirm, then write one log doc per selected product. */
  openMarkPicker(p: PanelParticipant): void {
    if (!p?.profileid || this.markingId || this.markedIds.has(p.profileid)) { return; }
    this.markingId = p.profileid;                 // single-flight lock during the fetch
    this.data.fetchActiveETicket(p.profileid)
      .then(ticket => {
        this.markingId = null;
        if (!ticket) {
          window.alert(`${p.name} has no active e-ticket for this event, so attendance cannot be marked. Approve an e-ticket first.`);
          this.cdr.detectChanges();
          return;
        }
        const products: string[] = ticket.data['producteligible'] || [];
        if (!products.length) {
          window.alert(`${p.name}'s e-ticket has no eligible products, so there is nothing to mark attendance against.`);
          this.cdr.detectChanges();
          return;
        }
        this.markPickerId = p.profileid;
        this.markTicketId = ticket.id;
        this.markOptions = products.map(id => ({ id, name: this.data.productMap[id] || id }));
        this.markSelected = new Set<string>();
        this.cdr.detectChanges();
      })
      .catch((err: any) => {
        this.markingId = null;
        console.error('[v3][attendance] e-ticket lookup failed:', err);
        window.alert('Could not load the e-ticket. Please try again.');
        this.cdr.detectChanges();
      });
  }

  toggleMarkProduct(productId: string): void {
    if (this.markSelected.has(productId)) { this.markSelected.delete(productId); } else { this.markSelected.add(productId); }
  }

  closeMarkPicker(): void {
    this.markPickerId = null; this.markTicketId = null; this.markOptions = []; this.markSelected = new Set<string>();
  }

  /** The day a mark will be credited to, spelled out for the confirm dialog — the
   *  operator has to be able to see they are backdating. */
  get markDateLabel(): string {
    if (!this.panelMarkDate) { return 'today'; }
    const [y, m, d] = this.panelMarkDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  confirmMark(p: PanelParticipant): void {
    if (this.markingId || !this.markTicketId || !this.markSelected.size) { return; }
    if (!window.confirm(`Mark ${p.name} present for ${this.markDateLabel}?`)) { return; }
    const ticketId = this.markTicketId;
    const productIds = [...this.markSelected];
    this.markingId = p.profileid;
    this.data.markAttendanceForProducts(p.profileid, ticketId, productIds, this.panelMarkDate || undefined)
      .then(() => {
        this.markedIds.add(p.profileid); this.markingId = null; this.closeMarkPicker(); this.cdr.detectChanges();
      })
      .catch((err: any) => {
        this.markingId = null;
        console.error('[v3][attendance] mark failed:', err);
        window.alert('Could not mark attendance. Please try again.');
        this.cdr.detectChanges();
      });
  }

  /** Export the currently-open list to a CSV (opens in Excel). Handles both
   *  normal participant rows and doer↔beneficiary pair rows. */
  panelExport(): void {
    const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const row = (p: any, detail: string) => [
      esc(p.name), esc(p.email || ''),
      esc(this.journeyLabel(p.activejourney) || ''),
      esc(this.isFirstTimer(p.profileid) ? 'First timer' : 'Repeat'),
      esc(this.productNames(p.profileid).join(' | ')),
      esc(detail)
    ].join(',');
    const lines = [['Name', 'Email', 'Journey', 'Type', 'Products', 'Detail'].join(',')];
    this.panelParticipants.forEach((p: any) => {
      if (p['_pair']) {
        // one line per person; the lead's line names every counterpart, and each
        // counterpart's line names the lead back
        const proc = p['proc'] ? `${p['proc']} · ` : '';
        const leadRole = p['leadRole'] === 'beneficiary' ? 'Beneficiary' : 'Doer';
        const otherRole = p['leadRole'] === 'beneficiary' ? 'Doer' : 'Beneficiary';
        const others: any[] = p['others'] || [];
        const withCount = (o: any) => o.name + (o._n > 1 ? ` x${o._n}` : '');
        if (p['lead']) {
          lines.push(row(p['lead'], `${proc}${leadRole} · with ${others.map(withCount).join(' | ') || '—'}`));
        }
        others.forEach((o: any) => lines.push(
          row(o, `${proc}${otherRole} · with ${p['lead']?.name || '—'}${o._n > 1 ? ` x${o._n}` : ''}`)));
      } else {
        lines.push(row(p, p['_meta'] || ''));
      }
    });
    const fname = ((this.panelTitle || 'list') + ' ' + (this.data.selectedEvent?.['name'] || '')).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    a.download = (fname || 'list') + '.csv';
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ==========================================================================
  // Communication from the drill-down panel (notification · WhatsApp · email)
  //
  // The three dialogs are Participants Analytics' own components, opened here with
  // the same options and the same afterClosed() handling — deliberately duplicated
  // rather than extracted, because that component is the owner and a shared service
  // would make its behaviour this panel's problem to keep in step. What differs is
  // only WHERE the recipients come from: the panel's checkbox selection instead of
  // that table's SelectionModel.
  // ==========================================================================

  /** Channel currently chosen — null while the operator is picking one. */
  commMode: 'notification' | 'wati' | 'email' | null = null;
  /** Selection mode: checkboxes are on the rows. Held separately from commMode so the
   *  channel can be re-picked without losing a selection that took work to build. */
  commOn = false;
  commSelected = new Set<string>();

  /** Enter selection mode on the chosen channel (or just switch channel). */
  setCommMode(mode: 'notification' | 'wati' | 'email'): void {
    this.commMode = mode; this.commOn = true;
  }
  /** Back to the three icons WITHOUT dropping the selection — the same people often
   *  need the message on more than one channel. */
  pickCommChannel(): void { this.commMode = null; }
  /** Leave selection mode entirely. Clearing here is what keeps the selection from
   *  becoming invisible state: no checkboxes on screen, nothing selected. */
  exitCommMode(): void { this.commOn = false; this.commMode = null; this.commSelected.clear(); }

  get commModeLabel(): string {
    return this.commMode === 'notification' ? 'Notification'
      : this.commMode === 'wati' ? 'WhatsApp' : 'Email';
  }

  /** Profile ids of the rows a checkbox is actually offered on, in list order.
   *
   *  Grouped Procedure Tracking rows offer the LEAD ONLY — the side the clicked cell
   *  was about. "As Doer · Completed" is a list of doers, so only doers can be picked;
   *  "As Beneficiary · Completed" groups by beneficiary, so only beneficiaries can.
   *  Counterparts are context for the lead, not recipients: selecting them would send
   *  to whoever happened to appear under someone who matched the filters. */
  get commSelectableIds(): string[] {
    const out: string[] = [];
    (this.panelParticipants as any[]).forEach(p => {
      const id = p['_pair'] ? p['lead']?.profileid : p.profileid;
      if (id) { out.push(id); }
    });
    return out;
  }
  /** "doers only" / "beneficiaries only" — says why the counterparts have no checkbox. */
  get commRoleNote(): string {
    const rows: any[] = this.panelParticipants as any[];
    if (!rows.length || !rows[0]['_pair']) { return ''; }
    return rows[0]['leadRole'] === 'beneficiary' ? 'beneficiaries only' : 'doers only';
  }
  get commSubLabel(): string {
    const n = this.commSelected.size;
    const note = this.commRoleNote;
    return `${n} selected${note ? ' · ' + note : ''}`;
  }
  isCommSelected(profileid: string): boolean { return this.commSelected.has(profileid); }
  toggleCommOne(profileid: string): void {
    if (!profileid) { return; }
    if (this.commSelected.has(profileid)) { this.commSelected.delete(profileid); }
    else { this.commSelected.add(profileid); }
  }
  /** Select-all is over the VISIBLE rows, so it composes with the search and filters
   *  above it rather than quietly reaching past them. */
  get commAllChecked(): boolean {
    const ids = this.commSelectableIds;
    return ids.length > 0 && ids.every(id => this.commSelected.has(id));
  }
  get commSomeChecked(): boolean {
    return !this.commAllChecked && this.commSelectableIds.some(id => this.commSelected.has(id));
  }
  toggleCommAll(): void {
    const ids = this.commSelectableIds;
    if (this.commAllChecked) { ids.forEach(id => this.commSelected.delete(id)); }
    else { ids.forEach(id => this.commSelected.add(id)); }
  }

  /** One recipient in the shape the dialogs expect — the raw `participant metadata`
   *  doc, which is exactly what Participants Analytics passes them (email uses
   *  `email`, WhatsApp `number`/`phonenumber`, notification `firebaseuserref`). A
   *  participant with no metadata doc still gets the normalized fields so they are
   *  not silently dropped from the recipient list. */
  private commRecipient(profileid: string): any {
    const meta = this.data.participantMetadataMap[profileid];
    // Copied, and profileid forced back to the key it was looked up by: the map spreads
    // the raw doc last, so a doc carrying its own `profileid` field would otherwise
    // decide who this recipient is. Copying also keeps a dialog from writing through
    // to the service's cached metadata.
    if (meta) { return { ...meta, profileid }; }
    const p = this.data.buildParticipantFromProfileId(profileid, false);
    return { profileid, name: p.name, email: p.email, phone: p.phone, number: p.phone };
  }
  private get commRecipients(): any[] { return [...this.commSelected].map(id => this.commRecipient(id)); }

  sendComm(): void {
    if (!this.commMode || !this.commSelected.size) { return; }
    const selected = this.commRecipients;
    if (this.commMode === 'notification') { this.sendNotificationinBreakthrough(selected); }
    else if (this.commMode === 'email') { this.sendEmailToSelectedParicipant(selected); }
    else { this.sendWatiMessage(selected); }
  }

  private openSnackBar(message: string, action: string): void { this.snackBar.open(message, action); }

  /** Verbatim from ParticipantsAnalyticsComponent.sendEmailToSelectedParicipant. */
  private sendEmailToSelectedParicipant(selected: any[]): void {
    let dialogRef = this.dialog.open(EmailInputComponent, {
      data: selected,
      minWidth: "600px",
      disableClose: true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        console.log(result);

        const docRef = doc(collection(this.firestore, "email archive"), result['docid']);
        if (result['status'] == 'queued' || result['status'] == 'send') {
          await setDoc(docRef, result, { merge: true }).then(() => {
            this.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK");
          }).catch(err => {
            console.log(err);
            this.openSnackBar("Error Sending Email", "OK");
          });
        } else if (result['status'] == 'validated') {
          let url: string;
          if (environment.firebase.projectId == 'starlabs-test') {
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data), {
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log(err);
              console.log("Error: " + err);
            }
          });
        }

      }
    })
  }

  /** Verbatim from ParticipantsAnalyticsComponent.sendWatiMessage. */
  private sendWatiMessage(selected: any[]): void {
    let dialogRef = this.dialog.open(WatiInputComponent, {
      data: selected,
      width: "70vw",
      height: "80vh",
      disableClose: true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        if (result == 'success') {
          this.openSnackBar("Wati Message Sent Successfully", "OK");
          if (result['status'] == 'sendtoparticipants') {
            let url: string;

            if (environment.firebase.projectId == 'starlabs-test') {
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
              url = ""
            }

            const docRef = doc(collection(this.firestore, 'wati archive'), result['archiveid']);
            await updateDoc(docRef, {
              templatestatus: "created",
              templatevalidated: true,
            }).then(() => {
              console.log("Wati Archive Document Created");
            }).catch((error) => {
              console.log("Error Creating Wati Archive");
            });

            const response = await this.http.post(url, { archiveid: result['archiveid'] }).toPromise();
            console.log("Response : ", response)

          }
        } else if (result == 'failed') {
          this.openSnackBar("Sending Wati Message Failed", "OK");
        }
      }
    });
  }

  /** Verbatim from ParticipantsAnalyticsComponent.sendNotificationinBreakthrough. */
  private sendNotificationinBreakthrough(selected: any[]): void {
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      data: selected,
      width: "80vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result, 'send app notificationssss');
      if (result != null && result != undefined) {
        var profileID = [];
        for (let i = 0; i < selected.length; i++) {
          const s = selected[i];
          if (s["firebaseuserref"] != null) {
            profileID.push(s["profileid"])
          }
        }

        var notificationimage = null
        if (result["notificationimage"] != null) {
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(this.storage, filepath)
            const uploadResult = await uploadBytes(storageRef, result["notificationimage"])
            notificationimage = await getDownloadURL(uploadResult.ref)
          } catch (error) {
            console.log("file upload error", error);
          }
        }
        this.authguard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: profileID,
          receivingapp: result["receivingapp"] ?? "breakthroughsapp",
        }).then(() => {
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  }

  initials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  private pathOf(ref: any): string { return ref && ref.path ? ref.path : String(ref); }
}
