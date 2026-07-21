import { Component, OnInit, ViewChild, ElementRef, HostListener, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  Firestore, collection, query, where, getDocs, doc, getDoc, addDoc, setDoc, serverTimestamp,
  orderBy, startAfter, limit, documentId, getCountFromServer, QueryDocumentSnapshot, writeBatch
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

import { AuthguardService } from '../../authguard.service';
import { computeHealth, normalizeTier, recencyScore, HealthState, ParticipantSignals } from './health-score.engine';
import { LogCallDialogComponent, LogCallResult } from './log-call-dialog.component';
import { SetHealthStateDialogComponent, SetHealthStateResult } from './set-health-state-dialog.component';
import { ParticipantSlideoverComponent, SlideoverData, SlideoverActivityItem, SlideoverLogPayload } from './participant-slideover.component';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import {
  CoachHealthState, ActivityType, COACH_HEALTH_OPTIONS,
  coachHealthLabel, coachHealthStateClass, normalizeCoachHealth,
} from './coach-health.types';

/**
 * Journey Coach - Health Dashboard (Phase 1.5 + Phase-2 wiring prepped).
 * Triage-and-act board: rows ranked by a transparent priority, with reason/next-action,
 * log-touchpoint write-back, planning levers, clickable KPIs and CSV export.
 *
 * Phase-2 Health Score (Sad/Neutral/Happy/Evangelist) is WIRED but GATED behind
 * SHOW_HEALTH=false — it computes from whatever signals are currently available (sparse
 * until instrumentation lands) and is NOT displayed until calibration. Flip SHOW_HEALTH
 * to true only after weights/bands are calibrated. No fake scores shown meanwhile.
 */
interface PortfolioRow {
  profileid: string;
  name: string;
  number: string | null;
  email: string | null;
  coachname: string;
  journeyname: string;
  atcmodel: string | null;
  productType: ProductType;        // ecosystem / dfu / gifts / other (derived from journey.type)
  journeystatus: string;
  subscriptionend: Date | null;
  purchasedate: Date | null;
  customerstatus: string | null;
  financialstatus: string | null;
  opportunities: string[];
  opportunitiesConsumed: string[];
  totalpurchasevalue: number | null;
  balance: number | null;
  emi: number | null;
  lastcoachdate: Date | null;
  daysSinceCoach: number | null;
  daysToRenewal: number | null;
  openTickets: number;
  onboarded: boolean;
  goingQuiet: boolean;
  // global participant flag (star) — mirrors the `flagged` set in healthtracker_flag
  flagged: boolean;
  renewalWindow: boolean;
  // subscription-based active flag: the participant has >=1 journey-product whose subscriptionend
  // is in the future (daysToRenewal >= 0). Active/Inactive counting + levers key off THIS, not
  // customerstatus (which is empty on pjp — the prior bug). customerstatus stays for the Status pill.
  subActive: boolean;
  lapsed: boolean;
  notStarted: boolean;
  priority: number;
  priorityBand: 'High' | 'Medium' | 'Low';
  reason: string;
  pjpIds: string[];              // journey-product doc ids for this participant (for assignment writes)
  recentEventRequest: { eventName: string; date: Date | null; status: string } | null;
  // Coach-set Health State (manual coach assessment, separate from customerstatus)
  coachHealthState: { state: CoachHealthState; note: string; date: Date | null } | null;
  // Phase-2 (gated)
  healthState: HealthState | null;
  healthCoverage: number;
}

type Lever = 'all' | 'active' | 'goingQuiet' | 'renewalWindow' | 'lapsed' | 'notStarted' | 'inactive' | 'tickets' | 'flagged' | 'needsAttention';

/** One coach's card in the Coaches view — every stat derived from real loaded data (no fabrication). */
interface CoachCard {
  coachId: string;
  coachName: string;
  caseload: number;     // distinct participants assigned to this coach (scoreboard baseSize)
  needToday: number;    // this coach's rows matching the needs-attention predicate
  goingQuiet: number;   // this coach's going-quiet rows
  flagged: number;      // this coach's flagged rows
  handled: number;      // touchpoints this coach logged TODAY (0 if not derivable)
  queue: PortfolioRow[]; // real top-of-queue people (topQueueForCoach)
}

type DashboardView = 'summary' | 'base' | 'scoreboard' | 'worklist';

/** Product-type classification, derived from the `journey` collection's `type` field
 *  (and the special-cased FTO journey for gifts) — the same signal the sales dashboards use. */
type ProductType = 'ecosystem' | 'dfu' | 'gifts' | 'other';

/** Lightweight full-base index row: just the fields needed to search + filter the WHOLE base
 *  (every coach's / the admin's participants) without loading the heavy dependent collections.
 *  Built once from participantjourneyproduct + the already-loaded profile/meta/journey maps. */
interface LiteIndexRow {
  profileid: string;
  name: string;
  number: string | null;
  coachedby: any;                  // raw coachedby value (for isMine / isUnassigned)
  journeyname: string;             // resolved journey name (for the journey / journey-group filter base-wide)
  productType: ProductType;
  atcmodel: string | null;
  customerstatus: string | null;
  financialstatus: string | null;
  // base-wide (paged-mode) flags — computed in the lite index so renewal/tickets filter the WHOLE base
  renewalWindow: boolean;          // subscriptionend within RENEWAL_DAYS (same logic as computeRows)
  // subscription-based active flag across ALL the participant's pjp records: true if ANY record's
  // subscriptionend is in the future. Drives base-wide Active/Inactive counts + levers in paged mode.
  subActive: boolean;
  openTickets: number;             // open clientissue count for this profile (from the full-base read)
  // base-wide lifecycle flags (for the Needs-Attention union, computed once in the lite index)
  lapsed: boolean;                 // subscription ended within LAPSED_DAYS and not an inactive status
  notStarted: boolean;             // onboarded but journey not started
  goingQuiet: boolean;             // no coach contact in QUIET_DAYS+ days (set once contact data loads)
}

/** A coach's personal journey group: a chosen name over a set of journey names (one journey per group). */
interface JourneyGroup { id: string; name: string; journeys: string[]; }

/** Phase C: one coach's gamified scoreboard row for the selected date range. */
interface ScoreboardRow {
  coachId: string;
  coachName: string;
  baseSize: number;       // distinct participants assigned to this coach (coachedby)
  touchpoints: number;    // healthtracker_touchpoint by this coach in range
  contacted: number;      // distinct participants reached (real contact) in range
  coverage: number;       // contacted / baseSize, 0..1
  reachedTouches: number; // touchpoints in range that actually reached the participant
  qualityRate: number;    // reachedTouches / touchpoints, 0..1 (share of calls that connected)
  goingQuiet: number;     // current participants with no coach contact in QUIET_DAYS+ days
  onTarget: boolean;      // coverage >= COVERAGE_TARGET with a real base
  engagementScore: number; // 0..100 weighted composite
  rank: number;
}

@Component({
  selector: 'app-journey-coach-health-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, ProfilePictureComponent,
    MatTableModule, MatPaginatorModule, MatSortModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatChipsModule, MatIconModule, MatButtonModule, MatMenuModule,
    MatCardModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule, MatCheckboxModule,
    MatButtonToggleModule, MatDatepickerModule, MatNativeDateModule,
  ],
  providers: [DatePipe],
  templateUrl: './journey-coach-health-dashboard.component.html',
  styleUrls: ['./journey-coach-health-dashboard.component.css'],
})
export class JourneyCoachHealthDashboardComponent implements OnInit {

  readonly QUIET_DAYS = 60;
  readonly RENEWAL_DAYS = 90;
  readonly LAPSED_DAYS = 90;       // show lapses up to this many days past end
  readonly HEALTH_TTL_DAYS = 60;   // a coach-set health tag is valid 60 days, then reverts to Not assessed
  readonly ALL = '__all__';
  readonly UNASSIGNED = '__unassigned__';
  // The participant's CURRENT journey product is the single pjp doc whose journeystatus is one of
  // these. Every PJP read is scoped to this set so we load exactly one current doc per participant
  // (no historical/superseded enrollments). Values are lowercase to match the stored data.
  readonly CURRENT_JOURNEY_STATUSES = ['initiated', 'ongoing', 'completed', 'cancelled'];
  readonly SHOW_HEALTH = false;    // Phase-2: flip true only after calibration

  // ---- Phase C: Coach Scoreboard ----
  // Engagement score weights (provisional — rewards keeping the pipeline active).
  // These are NOT calibrated; they will be revisited once outcome instrumentation
  // (renewals / referrals / wins) lands and joins the composite. They sum to 100.
  readonly W_COVERAGE = 60;        // breadth of the base actually contacted in range
  readonly W_QUALITY = 25;         // share of logged calls that actually reached the participant
  readonly W_QUIET = 15;           // share of base NOT going quiet
  readonly COVERAGE_TARGET = 0.9;  // contact at least this share of the base each period

  view: DashboardView = 'summary';
  // Worklist view: a focused triage queue over the already-priority-sorted dataSource.data.
  worklistLimit = 25;
  period: 'week' | 'month' | 'custom' = 'month';
  rangeFrom: Date = this.startOfMonth(new Date());
  rangeTo: Date = new Date();
  // Phase 1: signal so coachCards()/scoreboard derivations recompute only when it changes.
  scoreboard = signal<ScoreboardRow[]>([]);
  scoreboardComputed = false;
  // True when the scoreboard's touchpoint / appointment reads were permission-denied. The reads
  // still return empty, so without this flag everyone would render at 0% coverage/quality as if
  // real. Drives an honest "data unavailable (permissions)" notice above the scoreboard.
  scoreboardDataBlocked = false;
  // all touchpoints kept raw so the scoreboard can re-filter by range without re-reading Firestore
  private allTouchpoints: { profileid: string; coachid: string; date: Date | null; outcome: string | null; contacted: boolean }[] = [];

  // Phase B: unassigned-assignment state
  selectedProfiles = new Set<string>();
  // profileid -> display name for every SELECTED participant, so the selection tray can render chips
  // for people even when they're not on the current page (selection is persistent across search /
  // filter / paging). Kept in lockstep with selectedProfiles in toggleSelect / toggleSelectAll.
  selectedMeta = new Map<string, string>();
  assignTargetCoachId = '';
  unassignedCount = 0;
  assigning = false;

  loading = true;
  loadError = '';
  // ---- progressive load indicator (0–100) ----
  loadProgress = 0;
  loadProgressLabel = 'Starting…';
  coachId: string | null = null;
  coachName = '';

  coaches: { id: string; name: string }[] = [];
  selectedCoachId = '';

  // True when we could not match the logged-in coach to a base and fell back to ALL at init.
  // Drives a slim, dismissible info banner so the coach knows why they're seeing everyone.
  coachFallback = false;
  coachFallbackDismissed = false;

  scannedCount = 0;
  matchedCount = 0;

  // ---- server-side pagination (ALL / UNASSIGNED views only) ----
  // The per-coach view keeps the existing full-load + client paginator + global priority sort.
  // ALL / UNASSIGNED page through participantjourneyproduct by documentId() (so no doc is ever
  // skipped — important for UNASSIGNED, whose docs may lack the coachedby field entirely).
  pagedMode = false;
  pageSize = 50;
  currentPage = 0;
  pageLength = 0;                 // estimate for mat-paginator [length]
  loadedRowCount = 0;            // distinct participants materialised across loaded pages
  pageLoading = false;          // per-page spinner (distinct from the initial `loading`)
  reachedEnd = false;           // last server page returned < pageSize
  private lastDoc: QueryDocumentSnapshot | null = null;
  private pageCache = new Map<number, QueryDocumentSnapshot[]>();
  // full dataset cached so switching back to a specific coach doesn't re-read 10k each time
  private fullPjpData: any[] | null = null;
  // paged KPI: accurate server counts (countable cards) + accumulate-over-loaded (the rest)
  private countedProfiles = new Set<string>();
  private serverCounts = { total: 0, renewalsSoon: 0, notStarted: 0, inactive: 0, active: 0, openTickets: 0 };
  private serverCountsReady = false;
  // true only if BOTH the total and the inactive count queries resolved — guards active = total - inactive
  private serverActiveReady = false;
  // scoreboard runs over the full base; loaded on demand so the base view can page
  private sbPjp: any[] = [];
  private scoreboardLoaded = false;
  // true once the FULL touchpoint + contact-event collections have been read (scoreboard needs
  // all coaches' raw data). Full-mode table loads are now scoped, so this stays false until the
  // scoreboard explicitly pulls the full collections on demand.
  private fullTouchAndContactLoaded = false;
  // true once the FULL coach-health-state collection has been read (paged mode keys health by
  // profileid independent of paging, so it needs the global map). Full mode scopes it instead.
  private coachHealthFullLoaded = false;

  // Phase 1: the base rows are a signal so the ~10 derived list/count computeds below
  // recompute only when the rows actually change, not on every change-detection tick.
  allRows = signal<PortfolioRow[]>([]);
  dataSource = new MatTableDataSource<PortfolioRow>([]);

  search = '';
  journeyFilter = '';
  statusFilter = '';
  // "Assigned to me" status-band segment filter (separate from the customerstatus `statusFilter`).
  lifecycleFilter: '' | 'active' | 'nonactive' | 'discontinued' = '';
  activeLever: Lever = 'all';
  journeyOptions: string[] = [];

  // ---- Intelligent filter panel (client-side, applied over the FULL base) ----
  filtersExpanded = false;                         // collapsible panel state
  // No product-type default: the board opens showing all journeys (matches the summary, which counts
  // all product types). The Journey filter (journeyGroupFilter, multi) is the scoping axis instead.
  productTypeFilters: ProductType[] = [];
  tierFilters: string[] = [];                      // atcmodel: B!G / LYL / uP! / CPM (multi, hidden)
  bandFilters: Array<'High' | 'Medium' | 'Low'> = []; // priority band (multi)
  // 'UNASSESSED' = participant has no fresh coach-set health state (the "Not assessed" filter option).
  healthFilters: Array<CoachHealthState | 'UNASSESSED'> = [];
  financeFilters: string[] = [];                   // financialstatus values (multi)
  renewalWindowOnly = false;                        // renewal window (yes)
  goingQuietOnly = false;                           // going quiet (yes)
  noEventRequestOnly = false;                       // no recent event request (null)
  readonly tierOptions = ['B!G', 'LYL', 'uP!', 'CPM'];
  readonly healthOptions: CoachHealthState[] = COACH_HEALTH_OPTIONS;
  readonly healthFilterOptions: Array<CoachHealthState | 'UNASSESSED'> = [...COACH_HEALTH_OPTIONS, 'UNASSESSED'];
  financeOptions: string[] = [];                    // discovered from the loaded base

  // Set of profileids that pass the lightweight full-base filters (paged mode only). When non-null,
  // it gates which rows render — so search + filters + the ecosystem default cover EVERYONE, not
  // just the current page. null in full mode (allRows is already the full base there).
  private fullBaseMatchIds: Set<string> | null = null;
  private fullIndex: LiteIndexRow[] = [];           // lightweight full-base index (paged mode)
  private fullIndexBuilt = false;
  // base-wide open-ticket counts (profileid -> open count), read ONCE per index build (paged mode).
  // Powers both the lite-index openTickets flag and the base-wide Open-tickets KPI count.
  private fullBaseOpenTickets: Record<string, number> | null = null;
  // base-wide count of profiles with >0 open tickets (derived from the index after it builds)
  private fullBaseWithOpenTickets = 0;
  // base-wide Going-quiet / Needs-Attention — needs touchpoints + appointments, loaded in the
  // BACKGROUND after first paint (B-in-the-background); cards snap to these when ready.
  private fullBaseGoingQuiet = 0;
  private fullBaseNeedsAttention = signal(0);
  private contactDataLoaded = signal(false);
  // ---- indexed pagination (once the lite index is built): paginate over the MATCHED set so
  // filters page through ALL matches, and page-size just re-slices (no refetch / summary reset) ----
  private matchedIds: string[] = [];
  private suppressPagedRender = false;   // guards computeRows→applyFilters re-entry during a matched render

  summary = { total: 0, active: 0, inactive: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0, paymentsLocked: 0, discontinued: 0, nonActive: 0 };

  // Current Firebase Auth uid, resolved during resolveCoach() so the audit-trail writes
  // (logCall / setHealthState / toggleFlag) can stamp actorUid synchronously. Never reused from
  // another screen's field — actorUid is a NEW field on the healthtracker_* docs only.
  private actorUid: string | null = null;

  // Global participant flags (star). Loaded ONCE in loadPortfolio (both modes) from the
  // healthtracker_flag collection where flagged == true. Base-wide by construction, so the
  // Flagged count + filter are correct in paged mode too (no page-local caveat needed).
  flaggedIds = signal<Set<string>>(new Set());

  private pjpData: any[] = [];
  private profileMap: any = {};
  private metaMap: any = {};
  private journeyNameMap: any = {};
  private atcByJourney: Record<string, string> = {};
  // journey doc id -> product type ('ecosystem' | 'dfu' | 'gifts' | 'other'), from journey.type / FTO.
  private typeByJourney: Record<string, ProductType> = {};
  private openTicketCounts: Record<string, number> = {};
  private touchpointByProfile: Record<string, number> = {};
  private contactEventByProfile: Record<string, number> = {}; // raw attended-session recency
  // profileid -> most-recent event participation request {eventName, date, status}
  private recentEventByProfile: Record<string, { eventName: string; date: Date | null; status: string }> = {};
  // profileid -> latest coach-set Health State (manual coach assessment)
  private coachHealthByProfile: Record<string, { state: CoachHealthState; note: string; date: Date | null }> = {};
  // profileid -> latest 'addressed' snapshot (the Needs-Attention issues active when the coach marked
  // it addressed). Signal so needsAttentionRows() recomputes when a coach marks/unmarks addressed.
  addressedByProfile = signal<Record<string, { issues: string[]; date: Date | null }>>({});
  // eventref id -> {name, start} resolved on demand (paged mode), cached across pages
  private eventInfoCache: Record<string, { name: string; start: Date | null }> = {};

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  // Read-only keyboard navigation for the base table (power-user triage). -1 = no focused row.
  focusedRowIndex = -1;

  /** Name of the keyboard-focused row, bound to a visually-hidden aria-live region so screen
   *  readers announce the participant as j/k moves the focus. Empty when no row is focused. */
  get focusedRowName(): string {
    const rows = this.dataSource.data;
    return this.focusedRowIndex >= 0 && this.focusedRowIndex < rows.length
      ? (rows[this.focusedRowIndex]?.name ?? '')
      : '';
  }

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private datepipe: DatePipe,
    private router: Router,
    private auth: Auth,
    private dialog: MatDialog,
  ) {}

  get displayedColumns(): string[] {
    if (this.selectedCoachId === this.UNASSIGNED) {
      // assignment mode: checkbox + identity + assign action (priority/levers don't apply here)
      return ['select', 'name', 'coach', 'journey', 'status', 'actions'];
    }
    // Participants table reproduces the mockup's #panel-participants columns IN ORDER:
    // Participant · Coach · Priority · Journey · Status · Finance · Renewal · Tickets · Last touch.
    // The dropped intel (health / reason / recent event / tier / inline actions) lives in the
    // slide-over, which opens on row tap. Coach is always shown (the mockup always has a Coach column).
    const cols = ['name', 'coach', 'priority', 'journey', 'status', 'finance', 'renewal', 'tickets', 'lastcoach'];
    // All-participants view also supports bulk select + assign/reassign (prepend the checkbox column).
    return this.selectedCoachId === this.ALL ? ['select', ...cols] : cols;
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.resolveCoach();
      await this.loadPortfolio();
    } catch (err: any) {
      console.error('Health dashboard load error', err);
      this.loadError = 'Failed to load the dashboard. Please make sure you are logged in. ' + (err?.message ?? '');
    } finally {
      this.loading = false;
    }
  }

  ngAfterViewInit(): void {
    this.applyPaginatorBinding();
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (row: PortfolioRow, id: string): string | number => {
      switch (id) {
        case 'name': return (row.name ?? '').toLowerCase();
        case 'priority': return row.priority;
        case 'renewal': return row.subscriptionend ? row.subscriptionend.getTime() : Number.MAX_SAFE_INTEGER;
        default: return (row as any)[id] ?? '';
      }
    };
  }

  private async resolveCoach(): Promise<void> {
    // Resolve the Firebase Auth uid up-front (independent of how the coach profile is resolved) so
    // the audit-trail writes can stamp actorUid synchronously. Non-fatal if it can't be read.
    try {
      const authUser = await firstValueFrom(authState(this.auth).pipe(take(1)));
      this.actorUid = authUser?.uid ?? null;
    } catch { /* leave actorUid null */ }

    const profile: any = this.guard.loggedinProfile;
    if (profile && profile['profileid']) {
      this.coachId = profile['profileid'];
      this.coachName = profile['name'] ?? '';
      return;
    }
    try {
      const user = await firstValueFrom(authState(this.auth).pipe(take(1)));
      const uid = user?.uid;
      if (!uid) return;
      const snap = await getDocs(query(
        collection(this.firestore, 'profile_data'),
        where('user_ref', '==', doc(this.firestore, 'user_data', uid)),
      ));
      if (!snap.empty) {
        const d: any = snap.docs[0].data();
        this.coachId = d['profileid'] ?? snap.docs[0].id;
        this.coachName = d['name'] ?? '';
      }
    } catch {
      /* leave null */
    }
  }

  /** ALL / UNASSIGNED page through the collection; a specific coach loads its full base. */
  isPagedView(id: string): boolean {
    return id === this.ALL || id === this.UNASSIGNED;
  }

  /** Client paginator drives slicing in full mode; in paged mode we drive mat-paginator manually. */
  private applyPaginatorBinding(): void {
    if (!this.paginator) return;
    this.dataSource.paginator = this.pagedMode ? null : this.paginator;
  }

  /** Progressive-load indicator. Monotonic (never goes backward) unless reset to 0 on a fresh load. */
  private setProgress(pct: number, label: string): void {
    this.loadProgress = Math.min(100, Math.max(this.loadProgress, Math.round(pct)));
    this.loadProgressLabel = label;
  }

  private async loadPortfolio(): Promise<void> {
    this.loadProgress = 0;
    this.setProgress(8, 'Loading profiles & coaches…');
    // ---- Phase 1: independent base reads run in PARALLEL (was a sequential await-chain) ----
    const profileP = this.guard.getProfileMap().then(m => { this.profileMap = m; });
    const metaP = this.guard.getParticipantMetaMap().then(m => { this.metaMap = m; });
    // single read of the 'journey' collection powers the name map + atc-model map + product type
    const journeyP = getDocs(collection(this.firestore, 'journey')).then(snap => {
      const nameMap: Record<string, any> = {};
      snap.forEach(d => {
        const data = d.data() as any;
        nameMap[d.id] = data['journey'];
        this.atcByJourney[d.id] = data['atcmodel'] ?? null;
        // product type: same signal the sales dashboards use — journey.type, with FTO as gifts.
        this.typeByJourney[d.id] = this.classifyJourneyType(data['type'], data['journey']);
      });
      this.journeyNameMap = nameMap;
    });
    // Global flags (star) — needed by computeRows so the Flagged KPI/lever are right from render.
    const flagsP = this.loadFlags();
    // Base-wide 'addressed' snapshots — needed so Needs Attention excludes addressed participants from render.
    const addressedP = this.loadAddressed();
    // Personal journey groups (owner == actorUid, resolved in resolveCoach before this runs).
    const groupsP = this.loadJourneyGroups();
    // coach names are resolved from profileMap, so loadCoaches chains after it (still parallel
    // with meta / journey / flags).
    const coachesP = profileP.then(() => this.loadCoaches());
    await Promise.all([profileP, metaP, journeyP, flagsP, addressedP, groupsP, coachesP]);
    this.setProgress(35, 'Resolving your base…');

    const matchedCoach = !!(this.coachId && this.coaches.some(c => c.id === this.coachId));
    this.selectedCoachId = matchedCoach ? this.coachId! : this.ALL;
    // Fell back to ALL because we couldn't match the logged-in coach to a base.
    this.coachFallback = !matchedCoach;
    this.pagedMode = this.isPagedView(this.selectedCoachId);
    this.applyPaginatorBinding();

    if (this.pagedMode) {
      // Paint page 1 ASAP. The heavy full-base index (full participantjourneyproduct + clientissue
      // scan) builds in the BACKGROUND and refreshes off-page filters + base-wide summary when it
      // lands — it no longer blocks first render. Server counts are cheap (2 parallel counts) so
      // they ride alongside the first page.
      const indexP = this.ensureFullIndex();
      await Promise.all([this.loadServerCounts(), this.loadFirstPage()]);
      this.setProgress(60, 'First page ready · finalizing base…');
      indexP.then(() => this.onFullIndexReady()).catch(() => {});
    } else {
      // full mode scopes coach-set health to the coach's base (inside loadFullPortfolio)
      await this.loadFullPortfolio();
    }
  }

  /** Background full-base index finished → refresh the off-page match set and base-wide summary,
   *  then re-apply filters. Guarded so a scope change mid-build doesn't clobber the new view. */
  private onFullIndexReady(): void {
    if (!this.pagedMode) return;
    this.indexReady.update(v => v + 1);   // trigger journeyMix + any base-wide computeds to recompute
    this.accumulatePagedSummary();   // now uses fullIndexBuilt for base-wide totals
    this.applyFilters();             // recomputes fullBaseMatchIds + dataSource
    this.setProgress(85, 'Indexed full base · loading activity…');
    void this.loadAttentionDataInBackground();   // Going-quiet / Needs-Attention base-wide
  }

  /** B-in-the-background: after first paint + index, load touchpoints + attended coach appointments
   *  base-wide, compute Going-quiet / Needs-Attention across the WHOLE base, then snap the cards. */
  private async loadAttentionDataInBackground(): Promise<void> {
    // already have the contact data (loaded on a prior view) — nothing to do, but finish the
    // progress bar so switching into a second paged view doesn't strand it at 85%.
    if (this.contactDataLoaded()) { this.setProgress(100, 'Up to date'); return; }
    // index not ready yet — onFullIndexReady() re-invokes this once it is, so bail quietly.
    if (!this.fullIndexBuilt) return;
    try {
      await Promise.all([this.loadTouchpoints(), this.loadContactEvents()]);
      this.contactDataLoaded.set(true);
      this.computeBaseWideAttention();
      if (this.pagedMode) {
        this.accumulatePagedSummary();   // snap Going-quiet on the cards
        // if a going-quiet / needs-attention view is open, re-scope its matched set now that the
        // per-row going-quiet flag exists (so it paginates the full base, not just the loaded page).
        if (this.activeLever === 'goingQuiet' || this.activeLever === 'needsAttention' || this.goingQuietOnly) {
          this.applyFilters();
        }
      }
    } catch (e) {
      console.warn('attention data (background) failed', e);
    } finally {
      this.setProgress(100, 'Up to date');
    }
  }

  /** Going-quiet / Needs-Attention over the full lite index, using the latest of the 3 contact
   *  signals (lastTouchMs) — same rule as computeRows, so base-wide matches per-row. */
  private computeBaseWideAttention(): void {
    const now = Date.now();
    let gq = 0, na = 0;
    for (const lite of this.fullIndex) {
      const last = this.lastTouchMs(lite.profileid);
      const daysSince = last != null ? Math.floor((now - last) / 86400000) : null;
      const goingQuiet = daysSince != null && daysSince > this.QUIET_DAYS;
      lite.goingQuiet = goingQuiet;   // so the Going-quiet / Needs-attention levers can scope the matched set
      if (goingQuiet) gq++;
      if (goingQuiet || lite.lapsed || lite.notStarted || lite.renewalWindow || lite.openTickets > 0) na++;
    }
    this.fullBaseGoingQuiet = gq;
    this.fullBaseNeedsAttention.set(na);
  }

  /** Per-coach path — used when a SPECIFIC coach is selected (and cached for re-use).
   *  The pjp collection is still read in full (it powers the Unassigned count and is cached for
   *  the scoreboard), but the dependent joins are now SCOPED to the coach's base via the same
   *  batched `where(... 'in', chunk30)` loaders the paged path uses — no full-collection scans. */
  private async loadFullPortfolio(): Promise<void> {
    const pjpSnap = await getDocs(query(
      collection(this.firestore, 'participantjourneyproduct'),
      where('journeystatus', 'in', this.CURRENT_JOURNEY_STATUSES),
    ));
    this.pjpData = this.stampCoachedBy(pjpSnap.docs.map(d => ({ ...d.data(), __id: d.id })));
    this.fullPjpData = this.pjpData;
    this.scannedCount = this.pjpData.length;
    this.setProgress(55, 'Loaded base…');
    // count distinct participants with no coach assigned (for the Unassigned view)
    const unassignedProfiles = new Set<string>();
    for (const d of this.pjpData) {
      if (d['profileid'] && this.isUnassigned(d['coachedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;

    await this.loadFullDependentsForBase();
    this.setProgress(88, 'Loaded details…');

    this.computeRows();
    this.setProgress(100, 'Ready');
  }

  /** Distinct profileids assigned to the currently-selected coach (full-mode base). */
  private currentBaseProfileIds(): string[] {
    return Array.from(new Set(
      this.pjpData
        .filter(d => d['profileid'] && this.isMine(d['coachedby'], this.selectedCoachId))
        .map(d => d['profileid']),
    ));
  }

  /** Load every dependent join for the selected coach's base, SCOPED via batched 'in' queries.
   *  Reuses the exact paged-mode loaders (chunk30 / where(... 'in', chunk)); replaces the old
   *  full-collection scans. Maps merge, so switching between coaches accumulates harmlessly —
   *  computeRows only reads entries for the currently-matched profiles. */
  private async loadFullDependentsForBase(): Promise<void> {
    const baseProfileIds = this.currentBaseProfileIds();
    await Promise.all([
      this.loadOpenTicketCountsFor(baseProfileIds),
      this.loadTouchpointsFor(baseProfileIds),
      this.loadContactEventsFor(baseProfileIds),
      this.loadRecentEventRequestsFor(baseProfileIds),
      this.loadCoachHealthStatesFor(baseProfileIds),
    ]);
  }

  // ===================== server-side pagination (ALL / UNASSIGNED) =====================

  /** Accurate KPI counts that can be derived purely from fields on the pjp doc.
   *  Each is best-effort: any that needs a missing composite index just stays 0 (the card
   *  then falls back to the accumulate-over-loaded value). */
  private async loadServerCounts(): Promise<void> {
    const pjp = collection(this.firestore, 'participantjourneyproduct');
    // NOTE: total / active / inactive / renewals are now derived PARTICIPANT-LEVEL from the lite
    // index (distinct profileid, subscription-based) in accumulatePagedSummary. The old pjp-RECORD
    // total and the customerstatus inactive query were both wrong (records != people; customerstatus
    // is empty on pjp) and have been removed. Only `notStarted` — a real pjp-field count — remains,
    // as the pre-index fallback.
    await Promise.all([
      getCountFromServer(query(pjp, where('journeystatus', 'in', ['Initiated', 'initiated']), where('onboarded', '==', true)))
        .then(s => { this.serverCounts.notStarted = s.data().count; }).catch(() => {}),
      // Base-wide Open-tickets count straight from the server (counts OPEN clientissue docs) — shown
      // immediately for the All view, independent of page loading / the lite-index full scan.
      getCountFromServer(query(collection(this.firestore, 'clientissue'), where('status.status', 'in', ['Open', 'open'])))
        .then(s => { this.serverCounts.openTickets = s.data().count; }).catch(() => {}),
    ]);
    this.serverActiveReady = false;
    this.serverCountsReady = true;
  }

  private buildPjpPageQuery(startAfterDoc?: QueryDocumentSnapshot) {
    const ref = collection(this.firestore, 'participantjourneyproduct');
    // scope to the participant's current journey product (one doc per participant), then order by
    // documentId() so paging is stable and NO matching doc is ever skipped.
    const constraints: any[] = [
      where('journeystatus', 'in', this.CURRENT_JOURNEY_STATUSES),
      orderBy(documentId()),
    ];
    if (startAfterDoc) constraints.push(startAfter(startAfterDoc));
    constraints.push(limit(this.pageSize));
    return query(ref, ...constraints);
  }

  private async fetchPjpPage(startAfterDoc?: QueryDocumentSnapshot): Promise<QueryDocumentSnapshot[]> {
    const snap = await getDocs(this.buildPjpPageQuery(startAfterDoc));
    const docs = snap.docs as QueryDocumentSnapshot[];
    if (docs.length) this.lastDoc = docs[docs.length - 1];
    this.reachedEnd = docs.length < this.pageSize;
    this.pageCache.set(this.currentPage, docs);
    // estimate paginator length (mirrors the house pattern in participant-form-tracker)
    if (this.currentPage === 0) {
      this.pageLength = this.reachedEnd ? docs.length : docs.length * 10;
    } else if (this.reachedEnd) {
      this.pageLength = this.currentPage * this.pageSize + docs.length;
    } else {
      this.pageLength = Math.max(this.pageLength, (this.currentPage + 2) * this.pageSize);
    }
    return docs;
  }

  private resetPagedAccumulators(): void {
    this.countedProfiles.clear();
    // Only zero the summary BEFORE the base-wide numbers exist. Once the lite index is built the
    // counts are base-wide (not page-accumulated), so a page reload must not flash them to 0.
    if (!this.fullIndexBuilt) {
      this.summary = { total: 0, active: 0, inactive: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0, paymentsLocked: 0, discontinued: 0, nonActive: 0 };
    }
    this.loadedRowCount = 0;
  }

  private async loadFirstPage(): Promise<void> {
    this.currentPage = 0;
    this.lastDoc = null;
    this.pageCache.clear();
    this.resetPagedAccumulators();
    if (this.paginator) this.paginator.firstPage();
    const docs = await this.fetchPjpPage();
    await this.renderPage(docs);
  }

  /** mat-paginator (page) handler — only active in paged mode (full mode lets the dataSource slice). */
  onPageEvent(event: PageEvent): void {
    // page changed — clear the keyboard highlight so it never points at a stale row
    this.focusedRowIndex = -1;
    if (this.pagedMode) void this.onPjpPageChange(event);
  }

  private async onPjpPageChange(event: PageEvent): Promise<void> {
    // Once the index is built we page over the matched set client-side: page-size just RE-SLICES
    // (no refetch, no summary reset), and any page index is a direct slice.
    const indexed = this.pagedMode && this.fullIndexBuilt;
    if (event.pageSize !== this.pageSize) {
      this.pageSize = event.pageSize;
      if (indexed) {
        this.currentPage = 0;
        if (this.paginator) this.paginator.firstPage();
        await this.renderMatchedPage();
      } else {
        await this.loadFirstPage();
      }
      return;
    }
    if (indexed) {
      this.currentPage = event.pageIndex;
      await this.renderMatchedPage();
      return;
    }
    // pre-index cursor mode (first paint, before the lite index lands)
    if (event.pageIndex > this.currentPage) {
      this.currentPage = event.pageIndex;
      const cached = this.pageCache.get(this.currentPage);
      await this.renderPage(cached ?? await this.fetchPjpPage(this.lastDoc ?? undefined));
    } else if (event.pageIndex < this.currentPage) {
      this.currentPage = event.pageIndex;
      const cached = this.pageCache.get(this.currentPage)!;
      this.lastDoc = cached.length ? cached[cached.length - 1] : null;
      await this.renderPage(cached);
    }
  }

  /** Build rows for ONE page: filter (UNASSIGNED), load page-scoped dependents, score, accumulate KPI. */
  private async renderPage(pageDocs: QueryDocumentSnapshot[]): Promise<void> {
    this.pageLoading = true;
    try {
      let pjpForPage = this.stampCoachedBy(pageDocs.map(d => ({ ...d.data(), __id: d.id })));
      if (this.selectedCoachId === this.UNASSIGNED) {
        pjpForPage = pjpForPage.filter(d => this.isUnassigned(d['coachedby']));
      }
      const profileIds = Array.from(new Set(pjpForPage.map(d => d['profileid']).filter(Boolean)));
      await Promise.all([
        this.loadOpenTicketCountsFor(profileIds),
        this.loadTouchpointsFor(profileIds),
        this.loadContactEventsFor(profileIds),
        this.loadRecentEventRequestsFor(profileIds),
        this.loadCoachHealthStatesFor(profileIds),
      ]);
      this.pjpData = pjpForPage;       // computeRows reads this.pjpData (page-local matching + scoring)
      this.computeRows();
      this.accumulatePagedSummary();
    } finally {
      this.pageLoading = false;
    }
  }

  /** KPI in paged mode: accurate server counts where available, else accumulate over loaded pages.
   *  Keyed by profileid so revisiting a cached page never double-counts. */
  private accumulatePagedSummary(): void {
    for (const r of this.allRows()) {
      if (this.countedProfiles.has(r.profileid)) continue;
      this.countedProfiles.add(r.profileid);
      // total / active / inactive / renewalsSoon are derived base-wide from the lite index once it
      // builds (see below); until then these page-accumulated values are the fallback.
      if (r.subActive) this.summary.active++; else this.summary.inactive++;
      if (r.renewalWindow) this.summary.renewalsSoon++;
      if (r.lapsed) this.summary.lapsed++;
      if (r.openTickets > 0) this.summary.withOpenTickets++;
      if (r.goingQuiet) this.summary.goingQuiet++;
      if (r.notStarted) this.summary.notStarted++;
      if ((r.financialstatus ?? '').toLowerCase() === 'locked') this.summary.paymentsLocked++;
    }
    this.loadedRowCount = this.countedProfiles.size;
    if (this.selectedCoachId === this.UNASSIGNED) this.unassignedCount = this.loadedRowCount;
    // Open-tickets count: base-wide via getCountFromServer (counts OPEN clientissue docs), shown for
    // the All view immediately — independent of page loading / the lite-index full scan. Other scopes
    // (Unassigned) keep the distinct-participant count from the lite index once it builds.
    if (this.selectedCoachId === this.ALL && this.serverCountsReady) {
      this.summary.withOpenTickets = this.serverCounts.openTickets;
    } else if (this.fullIndexBuilt) {
      this.summary.withOpenTickets = this.fullBaseWithOpenTickets;
    }
    // base-wide Going-quiet once the background touchpoint/appointment data has loaded (else it
    // stays the page-accumulated value, which is replaced the moment contact data lands).
    if (this.contactDataLoaded()) this.summary.goingQuiet = this.fullBaseGoingQuiet;
    // Base-wide participant-level counts come from the lite index (one entry per DISTINCT
    // participant). This replaces the pjp-RECORD total and the customerstatus inactive query
    // (both wrong: total counted records, inactive read an empty field). notStarted still uses the
    // server count (a pjp-field query) where available.
    if (this.fullIndexBuilt) {
      // Base-wide summary scoped by the global summary filter. The lite index carries every
      // per-participant flag, so All-view filtering is exact. Band counts (total / lifecycle split)
      // reflect the JOURNEY filter only — so the segments stay visible and switchable — while the
      // lever counts reflect BOTH filters. journeyIdx ⊇ filteredIdx.
      const journeyIdx = this.fullIndex.filter(l => this.matchesSummaryJourneyLite(l));
      const filteredIdx = journeyIdx.filter(l => this.matchesSummaryLifecycleLite(l));
      this.summary.total = journeyIdx.length;                                       // distinct participants
      this.summary.active = journeyIdx.reduce((n, l) => n + (l.subActive ? 1 : 0), 0);
      this.summary.inactive = journeyIdx.reduce((n, l) => n + (l.subActive ? 0 : 1), 0);
      this.summary.discontinued = journeyIdx.reduce((n, l) => n + (this.isInactiveStatus(l.customerstatus) ? 1 : 0), 0);
      this.summary.nonActive = journeyIdx.reduce((n, l) => n + (!l.subActive && !this.isInactiveStatus(l.customerstatus) ? 1 : 0), 0);
      this.summary.renewalsSoon = filteredIdx.reduce((n, l) => n + (l.renewalWindow ? 1 : 0), 0);
      this.summary.paymentsLocked = filteredIdx.reduce((n, l) => n + ((l.financialstatus ?? '').toLowerCase() === 'locked' ? 1 : 0), 0);
      this.summary.withOpenTickets = filteredIdx.reduce((n, l) => n + (l.openTickets > 0 ? 1 : 0), 0);
      this.summary.notStarted = filteredIdx.reduce((n, l) => n + (l.notStarted ? 1 : 0), 0);
      this.summary.lapsed = filteredIdx.reduce((n, l) => n + (l.lapsed ? 1 : 0), 0);
      // going-quiet flags land on the lite rows only once contact data loads (computeBaseWideAttention);
      // until then keep the earlier fallback rather than flash 0.
      if (this.contactDataLoaded()) this.summary.goingQuiet = filteredIdx.reduce((n, l) => n + (l.goingQuiet ? 1 : 0), 0);
      // base-wide needs-attention / flagged / shown-count / health — all scoped to the filtered set
      this.fullBaseNeedsAttention.set(filteredIdx.reduce((n, l) => n + ((l.goingQuiet || l.lapsed || l.notStarted || l.renewalWindow || l.openTickets > 0) ? 1 : 0), 0));
      this.pagedFilteredCount.set(filteredIdx.length);
      const flags = this.flaggedIds();
      this.pagedFlagged.set(filteredIdx.reduce((n, l) => n + (flags.has(l.profileid) ? 1 : 0), 0));
      const h = { happy: 0, neutral: 0, unhappy: 0, atRisk: 0, critical: 0, notAssessed: 0, total: 0 };
      for (const l of filteredIdx) {
        h.total++;
        switch (this.freshHealth(this.coachHealthByProfile[l.profileid])?.state) {
          case 'HAPPY': h.happy++; break;
          case 'NEUTRAL': h.neutral++; break;
          case 'UNHAPPY': h.unhappy++; break;
          case 'AT_RISK': h.atRisk++; break;
          case 'CRITICAL': h.critical++; break;
          default: h.notAssessed++; break;
        }
      }
      this.pagedHealth.set(h);
    } else if (this.serverCountsReady) {
      // index not built yet — only notStarted is a reliable pjp-field server count; total/active/
      // inactive/renewalsSoon stay on the page-accumulated values until the index lands.
      this.summary.notStarted = this.serverCounts.notStarted;
      this.summary.total = this.loadedRowCount;
    } else {
      this.summary.total = this.loadedRowCount;
    }
  }

  private chunk30<T>(arr: T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += 30) out.push(arr.slice(i, i + 30));
    return out;
  }

  // page-scoped variants of the full-collection dependent loaders — merge into the same maps
  private async loadOpenTicketCountsFor(profileIds: string[]): Promise<void> {
    if (!profileIds.length) return;
    try {
      for (const batch of this.chunk30(profileIds)) {
        const snap = await getDocs(query(collection(this.firestore, 'clientissue'), where('clientid', 'in', batch)));
        snap.forEach(d => {
          const data: any = d.data();
          if ((data['status']?.status ?? '').toLowerCase() !== 'open') return;
          const cid = data['clientid'];
          const key = typeof cid === 'string' ? cid : cid?.id;
          if (key) this.openTicketCounts[key] = (this.openTicketCounts[key] ?? 0) + 1;
        });
      }
    } catch (e) { console.warn('open tickets (paged) failed', e); }
  }

  private async loadTouchpointsFor(profileIds: string[]): Promise<void> {
    if (!profileIds.length) return;
    try {
      for (const batch of this.chunk30(profileIds)) {
        const snap = await getDocs(query(collection(this.firestore, 'healthtracker_touchpoint'), where('profileid', 'in', batch)));
        snap.forEach(d => {
          const data: any = d.data();
          const pid = data['profileid'];
          const dt = this.toDate(data['date']);
          if (pid && dt) this.touchpointByProfile[pid] = Math.max(this.touchpointByProfile[pid] ?? 0, dt.getTime());
        });
      }
    } catch (e) { console.warn('touchpoints (paged) failed', e); }
  }

  private async loadContactEventsFor(profileIds: string[]): Promise<void> {
    if (!profileIds.length) return;
    try {
      for (const batch of this.chunk30(profileIds)) {
        // single-field 'in' on bookedby (refs) — auto-indexed; filter journeycoach/attended client-side
        const refBatch = batch.map(pid => doc(this.firestore, 'profile_data', pid));
        const snap = await getDocs(query(collection(this.firestore, 'appointments'), where('bookedby', 'in', refBatch)));
        snap.forEach(d => {
          const data: any = d.data();
          if (data['journeycoach'] !== true || data['attended'] !== true) return;
          const pid = data['bookedby']?.id ?? (typeof data['profileid'] === 'string' ? data['profileid'] : null);
          const dt = this.toDate(data['starttime']) ?? this.toDate(data['date']);
          if (pid && dt) this.contactEventByProfile[pid] = Math.max(this.contactEventByProfile[pid] ?? 0, dt.getTime());
        });
      }
    } catch (e) { console.warn('contact events (paged) failed', e); }
  }

  private async loadRecentEventRequestsFor(profileIds: string[]): Promise<void> {
    if (!profileIds.length) return;
    try {
      const requests: any[] = [];
      for (const batch of this.chunk30(profileIds)) {
        const snap = await getDocs(query(collection(this.firestore, 'event participation request'), where('profileid', 'in', batch)));
        snap.forEach(d => requests.push(d.data()));
      }
      // resolve ONLY the referenced event/queue docs by id (cached across pages)
      const eventIds = Array.from(new Set(requests.map(r => r['eventref']?.id).filter(Boolean)));
      await Promise.all(eventIds.filter(id => !(id in this.eventInfoCache)).map(async (id) => {
        try {
          const ev = await getDoc(doc(this.firestore, 'event collection', id));
          if (ev.exists()) { const dd: any = ev.data(); this.eventInfoCache[id] = { name: dd['name'] ?? dd['eventname'] ?? id, start: this.toDate(dd['start_date']) }; return; }
        } catch { /* fall through */ }
        try {
          const qd = await getDoc(doc(this.firestore, 'queue generation', id));
          if (qd.exists()) { const dd: any = qd.data(); this.eventInfoCache[id] = { name: dd['queuename'] ?? id, start: this.toDate(dd['queuestartdate']) }; return; }
        } catch { /* leave unresolved */ }
        this.eventInfoCache[id] = { name: id, start: null };
      }));
      const recent: Record<string, { eventName: string; date: Date | null; status: string; sortMs: number }> = {};
      for (const data of requests) {
        const pid = data['profileid'];
        if (!pid) continue;
        const eventId = data['eventref']?.id ?? null;
        const info = eventId ? this.eventInfoCache[eventId] : null;
        const reqDate = this.toDate(data['doccreateddate']) ?? info?.start ?? null;
        const sortMs = reqDate ? reqDate.getTime() : 0;
        const status = typeof data['status'] === 'string' ? data['status'] : 'requested';
        const existing = recent[pid];
        if (!existing || sortMs > existing.sortMs) recent[pid] = { eventName: info?.name ?? (eventId ?? '—'), date: reqDate, status, sortMs };
      }
      for (const pid of Object.keys(recent)) {
        this.recentEventByProfile[pid] = { eventName: recent[pid].eventName, date: recent[pid].date, status: recent[pid].status };
      }
    } catch (e) { console.warn('recent event requests (paged) failed', e); }
  }

  /** Scoreboard spans the whole base (all coaches) regardless of the table's paging — load it
   *  once on demand. The full touchpoint + contact-event collections are required here because
   *  the scoreboard ranks every coach; the table's full-mode load is now SCOPED, so we pull the
   *  full collections lazily (guarded by fullTouchAndContactLoaded) only when the scoreboard opens. */
  private async ensureScoreboardData(): Promise<void> {
    if (this.scoreboardLoaded) return;
    if (this.fullPjpData) {
      this.sbPjp = this.fullPjpData;     // pjp already cached from a prior full load
    } else {
      const pjpSnap = await getDocs(query(
        collection(this.firestore, 'participantjourneyproduct'),
        where('journeystatus', 'in', this.CURRENT_JOURNEY_STATUSES),
      ));
      this.sbPjp = this.stampCoachedBy(pjpSnap.docs.map(d => ({ ...d.data(), __id: d.id })));
    }
    if (!this.fullTouchAndContactLoaded) {
      await this.loadTouchpoints();      // populates allTouchpoints + touchpointByProfile (full)
      await this.loadContactEvents();    // populates contactEventByProfile (full)
      this.fullTouchAndContactLoaded = true;
    }
    this.scoreboardLoaded = true;
  }

  // ===================================================================================

  private async loadCoaches(): Promise<void> {
    const list: { id: string; name: string }[] = [];
    try {
      const snap = await getDocs(query(collection(this.firestore, 'users_roles'), where('journeycoach', '==', true)));
      snap.forEach(d => {
        const data: any = d.data();
        // drop test/junk accounts: the role doc carries a `tester` boolean (e.g. "Admin Test").
        if (data['tester'] === true) return;
        const ref: any = data['profile_ref'];
        const id = ref?.id;
        if (id) list.push({ id, name: this.profileMap.map?.[id] ?? data['name'] ?? id });
      });
    } catch (e) {
      console.warn('could not load journey coaches', e);
    }
    if (this.coachId && !list.some(c => c.id === this.coachId)) {
      list.push({ id: this.coachId, name: this.coachName || this.coachId });
    }
    this.coaches = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  /** Load the global participant flags ONCE: every healthtracker_flag doc with flagged == true.
   *  Populates flaggedIds (keyed by profileid). Degrades gracefully on permission-denied — same
   *  pattern as the other loaders — leaving the set empty so the rest of the board still renders. */
  private async loadFlags(): Promise<void> {
    try {
      const snap = await getDocs(query(collection(this.firestore, 'healthtracker_flag'), where('flagged', '==', true)));
      const ids = new Set<string>();
      snap.forEach(d => {
        const pid = (d.data() as any)['profileid'];
        if (pid) ids.add(pid);
      });
      this.flaggedIds.set(ids);
    } catch (e) {
      console.warn('flags load failed (non-fatal)', e);
    }
  }

  /** Firestore permission-denied detector (code `permission-denied` or a /permission/i message). */
  private isPermissionDenied(e: any): boolean {
    const code = (e?.code ?? '').toString();
    return code.includes('permission-denied') || /permission/i.test(e?.message ?? '');
  }

  private async loadTouchpoints(): Promise<void> {
    const map: Record<string, number> = {};
    const raw: typeof this.allTouchpoints = [];
    try {
      const snap = await getDocs(collection(this.firestore, 'healthtracker_touchpoint'));
      snap.forEach(d => {
        const data: any = d.data();
        const pid = data['profileid'];
        const dt = this.toDate(data['date']);
        if (pid && dt) map[pid] = Math.max(map[pid] ?? 0, dt.getTime());
        // keep the raw row for the Phase-C scoreboard (re-filtered by date range client-side)
        if (pid) raw.push({
          profileid: pid,
          coachid: typeof data['coachid'] === 'string' ? data['coachid'] : (data['coachid']?.id ?? ''),
          date: dt,
          outcome: typeof data['outcome'] === 'string' ? data['outcome'] : null,
          contacted: data['contacted'] === true,
        });
      });
    } catch (e) {
      if (this.isPermissionDenied(e)) this.scoreboardDataBlocked = true;
      console.warn('touchpoint load failed (non-fatal)', e);
    }
    this.touchpointByProfile = map;
    this.allTouchpoints = raw;
  }

  /** Raw coach-contact events (attended journey-coach appointments) -> latest per participant.
   *  More reliable than the drift-prone lastjourneycoachdate field (per research/audit). */
  private async loadContactEvents(): Promise<void> {
    const map: Record<string, number> = {};
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'appointments'),
        where('journeycoach', '==', true),
        where('attended', '==', true),
      ));
      snap.forEach(d => {
        const data: any = d.data();
        const pid = data['bookedby']?.id ?? (typeof data['profileid'] === 'string' ? data['profileid'] : null);
        const dt = this.toDate(data['starttime']) ?? this.toDate(data['date']);
        if (pid && dt) map[pid] = Math.max(map[pid] ?? 0, dt.getTime());
      });
    } catch (e) {
      if (this.isPermissionDenied(e)) this.scoreboardDataBlocked = true;
      console.warn('contact events load failed (non-fatal)', e);
    }
    this.contactEventByProfile = map;
  }

  /** Coach-set Health State: read the 'healthtracker_healthstate' audit collection once and keep
   *  the MOST RECENT doc per participant (by date). Each save is a new doc (history preserved);
   *  the latest is the current state. Degrades to none on failure. */
  private async loadCoachHealthStates(): Promise<void> {
    const latest: Record<string, { state: CoachHealthState; note: string; date: Date | null; sortMs: number }> = {};
    try {
      const snap = await getDocs(collection(this.firestore, 'healthtracker_healthstate'));
      snap.forEach(d => {
        const data: any = d.data();
        const pid = data['profileid'];
        if (!pid) return;
        // map legacy values (SAD->UNHAPPY, EVANGELIST->HAPPY) to the coach-set scale on read.
        const state = normalizeCoachHealth(data['state']);
        if (!state) return;
        const dt = this.toDate(data['date']);
        const sortMs = dt ? dt.getTime() : 0;
        const existing = latest[pid];
        if (!existing || sortMs >= existing.sortMs) {
          latest[pid] = { state, note: typeof data['note'] === 'string' ? data['note'] : '', date: dt, sortMs };
        }
      });
    } catch (e) {
      console.warn('coach health state load failed (non-fatal)', e);
    }
    const out: Record<string, { state: CoachHealthState; note: string; date: Date | null }> = {};
    for (const pid of Object.keys(latest)) {
      out[pid] = { state: latest[pid].state, note: latest[pid].note, date: latest[pid].date };
    }
    this.coachHealthByProfile = out;
    this.coachHealthFullLoaded = true;
  }

  /** Scoped coach-set Health State — query healthtracker_healthstate by the
   *  current page's profileids (batched 'in' of 30) and merge the MOST RECENT per participant
   *  into coachHealthByProfile. Avoids the full-collection scan in paged (ALL / UNASSIGNED) views. */
  private async loadCoachHealthStatesFor(profileIds: string[]): Promise<void> {
    if (!profileIds.length) return;
    try {
      for (const batch of this.chunk30(profileIds)) {
        const snap = await getDocs(query(collection(this.firestore, 'healthtracker_healthstate'), where('profileid', 'in', batch)));
        snap.forEach(d => {
          const data: any = d.data();
          const pid = data['profileid'];
          // map legacy values (SAD->UNHAPPY, EVANGELIST->HAPPY) to the coach-set scale on read.
          const state = normalizeCoachHealth(data['state']);
          if (!pid || !state) return;
          const dt = this.toDate(data['date']);
          const ms = dt ? dt.getTime() : 0;
          const existing = this.coachHealthByProfile[pid];
          const existingMs = existing?.date ? existing.date.getTime() : -1;
          if (!existing || ms >= existingMs) {
            this.coachHealthByProfile[pid] = { state, note: typeof data['note'] === 'string' ? data['note'] : '', date: dt };
          }
        });
      }
    } catch (e) { console.warn('coach health states (paged) failed', e); }
  }

  computeRows(): void {
    const now = Date.now();
    const byProfile = new Map<string, PortfolioRow>();
    let matched = 0;
    const showAll = this.selectedCoachId === this.ALL;
    const showUnassigned = this.selectedCoachId === this.UNASSIGNED;
    // NOTE: selection is NOT cleared here. Clearing on every computeRows() (which runs on search /
    // filter / page) was what wiped the user's picks. Selection is persistent and survives
    // search/filter/paging; it is cleared only after a successful assignSelected() (or pruned there).

    for (const d of this.pjpData) {
      if (showUnassigned) { if (!this.isUnassigned(d['coachedby'])) continue; }
      else if (!showAll && !this.isMine(d['coachedby'], this.selectedCoachId)) continue;
      const profileid = d['profileid'];
      if (!profileid) continue;
      matched++;

      const meta: any = this.metaMap.docdata?.[profileid] ?? {};
      const journeyId = d['journeyref']?.id ?? null;
      // subscriptionend comes ONLY from the participant's current PJP doc (no metadata fallback).
      const subEnd = this.toDate(d['subscriptionend']);

      // last touch = latest of: derived field, raw attended sessions, logged touchpoints
      const lastCoach = this.maxDate(
        this.maxDate(
          this.toDate(this.profileMap.docdata?.[profileid]?.['lastjourneycoachdate']),
          this.contactEventByProfile[profileid] ? new Date(this.contactEventByProfile[profileid]) : null,
        ),
        this.touchpointByProfile[profileid] ? new Date(this.touchpointByProfile[profileid]) : null,
      );

      const daysSinceCoach = lastCoach ? Math.floor((now - lastCoach.getTime()) / 86400000) : null;
      const daysToRenewal = subEnd ? Math.floor((subEnd.getTime() - now) / 86400000) : null;
      const onboarded = !!d['onboarded'];
      const jstatus = d['journeystatus'];

      const row: PortfolioRow = {
        profileid,
        name: this.profileMap.map?.[profileid] ?? meta['name'] ?? profileid,
        number: this.profileMap.phonenumber?.[profileid] ?? null,
        email: this.profileMap.email?.[profileid] ?? meta['email'] ?? null,
        coachname: this.coachNameFor(d['coachedby']),
        journeyname: journeyId ? (this.journeyNameMap[journeyId] ?? journeyId) : (meta['activejourney'] ?? '-'),
        atcmodel: journeyId ? (this.atcByJourney[journeyId] ?? null) : null,
        productType: journeyId ? (this.typeByJourney[journeyId] ?? 'other') : 'other',
        journeystatus: jstatus ?? 'Initiated',
        subscriptionend: subEnd,
        purchasedate: this.toDate(d['purchasedate']),
        customerstatus: meta['customerstatus'] ?? null,
        financialstatus: meta['financialstatus'] ?? null,
        opportunities: Array.isArray(d['opportunities']) ? d['opportunities'] : [],
        opportunitiesConsumed: Array.isArray(d['opportunities_consumed']) ? d['opportunities_consumed'] : [],
        totalpurchasevalue: this.num(meta['pp_totalpurchasevalue']),
        balance: this.balanceFor(meta),
        emi: this.num(meta['emi']),
        lastcoachdate: lastCoach,
        daysSinceCoach,
        daysToRenewal,
        openTickets: this.openTicketCounts[profileid] ?? 0,
        onboarded,
        // going-quiet only counts ACTIVE participants (subActive); set after the row is built (below).
        goingQuiet: false,
        flagged: this.flaggedIds().has(profileid),
        renewalWindow: daysToRenewal != null && daysToRenewal >= 0 && daysToRenewal <= this.RENEWAL_DAYS,
        // subscription-based active: this product's subscriptionend is in the future. The
        // per-participant subActive is the OR across products, finalised at merge time below.
        subActive: daysToRenewal != null && daysToRenewal >= 0,
        lapsed: daysToRenewal != null && daysToRenewal < 0 && daysToRenewal >= -this.LAPSED_DAYS
          && !this.isInactiveStatus(meta['customerstatus']),
        notStarted: ['Initiated', 'initiated', null, undefined].includes(jstatus) && onboarded,
        priority: 0, priorityBand: 'Low', reason: '',
        pjpIds: [d['__id']],
        recentEventRequest: this.recentEventByProfile[profileid] ?? null,
        coachHealthState: this.freshHealth(this.coachHealthByProfile[profileid]),
        healthState: null, healthCoverage: 0,
      };
      // going-quiet = ACTIVE participant with no coach contact in QUIET_DAYS+ days.
      row.goingQuiet = row.subActive && daysSinceCoach != null && daysSinceCoach > this.QUIET_DAYS;
      this.scoreRow(row);
      if (this.SHOW_HEALTH) this.scoreHealth(row);

      const existing = byProfile.get(profileid);
      if (!existing) { byProfile.set(profileid, row); }
      else {
        const mergedIds = [...existing.pjpIds, d['__id']];
        // a participant is subActive if ANY of their journey-products has a future subscriptionend.
        const mergedSubActive = existing.subActive || row.subActive;
        if (row.priority > existing.priority) {
          row.pjpIds = mergedIds;
          row.subActive = mergedSubActive;
          // re-evaluate going-quiet against the merged active flag (a later product may flip it active)
          row.goingQuiet = row.subActive && row.daysSinceCoach != null && row.daysSinceCoach > this.QUIET_DAYS;
          byProfile.set(profileid, row);
        } else {
          existing.pjpIds = mergedIds;
          existing.subActive = mergedSubActive;
          existing.goingQuiet = existing.subActive && existing.daysSinceCoach != null && existing.daysSinceCoach > this.QUIET_DAYS;
        }
      }
    }

    this.matchedCount = matched;
    this.allRows.set(Array.from(byProfile.values()).sort((a, b) => b.priority - a.priority));
    this.journeyOptions = Array.from(new Set(this.allRows().map(r => r.journeyname))).sort();
    // full mode: derive finance filter options from the (full) base; paged mode sources them from
    // ensureFullIndex (the page-local allRows would otherwise miss off-page financial statuses).
    if (!this.pagedMode) {
      this.financeOptions = Array.from(
        new Set(this.allRows().map(r => r.financialstatus).filter((v): v is string => !!v)),
      ).sort();
    }
    // paged mode builds the summary via accumulatePagedSummary() (server counts + loaded-so-far)
    if (!this.pagedMode) this.computeSummary();
    this.applyFilters();
  }

  // Priority weights: revenue-at-risk first — lapsed/renewal/financial outrank going-quiet;
  // going-quiet capped at 20 so it can't outrank an imminent renewal; bands High>=40 / Medium>=22
  // (all provisional, tune on data).
  private scoreRow(r: PortfolioRow): void {
    let p = 0;
    const drivers: string[] = [];

    if (r.daysSinceCoach != null && r.daysSinceCoach > this.QUIET_DAYS) {
      p += Math.min(r.daysSinceCoach, 180) / 180 * 20;
      drivers.push(`quiet ${r.daysSinceCoach}d`);
    }
    if (r.notStarted) { p += 24; drivers.push('journey not started'); }
    if (r.lapsed) { p += 40; drivers.push(`lapsed ${Math.abs(r.daysToRenewal ?? 0)}d ago`); }
    if (r.renewalWindow) {
      p += (this.RENEWAL_DAYS - (r.daysToRenewal ?? this.RENEWAL_DAYS)) / this.RENEWAL_DAYS * 32;
      if (this.continuityOpen(r)) p += 8;
      drivers.push(`renewal ${r.daysToRenewal}d`);
    }
    const fin = (r.financialstatus ?? '').toLowerCase();
    if (fin === 'defaulted' || fin === 'locked') { p += 26; drivers.push(`${fin} payments`); }
    else if (fin === 'late') { p += 15; drivers.push('late payments'); }
    // NOTE: customerstatus 'late' means the participant is gone (unactionable) — it does NOT add
    // priority and such rows are excluded from the active board (see isInactiveStatus / applyFilters).
    if (r.openTickets > 0) { p += Math.min(r.openTickets, 3) * 4; drivers.push(`${r.openTickets} open ticket${r.openTickets > 1 ? 's' : ''}`); }

    r.priority = Math.max(0, Math.min(100, Math.round(p)));
    r.priorityBand = r.priority >= 40 ? 'High' : r.priority >= 22 ? 'Medium' : 'Low';
    r.reason = drivers.length ? `${drivers.slice(0, 2).join(' + ')} → ${this.actionFor(r)}` : 'On track';
  }

  /** Phase-2 (gated): compute the Health state from whatever signals exist today. Sparse until
   *  instrumentation lands; the engine reports coverage. Not displayed unless SHOW_HEALTH. */
  private scoreHealth(r: PortfolioRow): void {
    const signals: ParticipantSignals = {
      engagement: {
        coachTouchpointRecency: recencyScore(r.lastcoachdate, 30, 180),
        appActivityRecency: null,
        pendingActionsCleared: null,
        attendanceRate: null,
      },
      progress: { aelImprovement: null, evolutionStage: null, journeyPace: null, interimAdherence: null },
      wins: { confirmedWins: null },
      relationship: { cadenceKept: null, responsiveness: null, satisfaction: null },
      advocacy: {
        referralGiven: this.referralGiven(r),
        testimonial: null,
        wishlistShared: null,
      },
    };
    const res = computeHealth(signals, normalizeTier(r.atcmodel));
    r.healthState = res.state;
    r.healthCoverage = res.coverage;
  }

  private continuityOpen(r: PortfolioRow): boolean {
    return r.opportunities.some(o => /continuity/i.test(o)) && !r.opportunitiesConsumed.some(o => /continuity/i.test(o));
  }
  private referralGiven(r: PortfolioRow): boolean {
    return r.opportunitiesConsumed.some(o => /referral/i.test(o));
  }

  private actionFor(r: PortfolioRow): string {
    if (r.lapsed) return 'win-back';
    if (r.renewalWindow) return 'continuity call';
    if (r.notStarted) return 'kickstart journey';
    const fin = (r.financialstatus ?? '').toLowerCase();
    if (fin === 'defaulted' || fin === 'locked' || fin === 'late') return 'finance follow-up';
    if (r.openTickets > 0) return 'resolve support';
    if (r.goingQuiet) return 're-engage';
    return 'check in';
  }

  isInactiveStatus(s: string | null | undefined): boolean {
    return ['late', 'discontinued', 'banned'].includes((s ?? '').toLowerCase());
  }

  /** Map a journey's `type` field (and name) to a product type. Mirrors the sales/delivery
   *  dashboards: type 'Eco system' -> ecosystem, 'DFU' -> dfu, the FTO journey -> gifts. */
  private classifyJourneyType(type: any, journeyName: any): ProductType {
    if ((journeyName ?? '') === 'FTO') return 'gifts';
    const t = (typeof type === 'string' ? type : '').trim().toLowerCase();
    if (t === 'eco system' || t === 'ecosystem') return 'ecosystem';
    if (t === 'dfu') return 'dfu';
    return 'other';
  }

  /** Human label for a product type (used by the filter chips / option labels). */
  productTypeLabel(t: ProductType | ''): string {
    switch (t) {
      case 'ecosystem': return 'Ecosystem';
      case 'dfu': return 'DFU';
      case 'gifts': return 'Gifts';
      case 'other': return 'Other';
      default: return 'All';
    }
  }

  /** Open the participant slide-over (right-side overlay) instead of navigating to /userprofile.
   *  Hands the in-memory row to the panel, which runs its own scoped reads for the detail. */
  async openSlideover(row: PortfolioRow): Promise<void> {
    // ONE-SHOT load this participant's unified activity timeline (newest first, capped). No realtime
    // listener — getDocs only. Degrades gracefully to an empty timeline on permission-denied.
    const activity = await this.loadActivityTimeline(row.profileid);
    const data: SlideoverData = {
      row,
      coaches: this.coaches,
      activity,
      // the slide-over is presentational; these callbacks run the dashboard's real writes.
      onLog: (type, payload) => this.handleSlideoverLog(row, type, payload),
      onToggleFlag: (note: string) => this.toggleFlag(row, note),
      onAssignCoach: (coachIdOrNull: string | null) =>
        coachIdOrNull ? this.assignCoachToRow(row, coachIdOrNull) : this.unassignCoach(row),
      addressed: this.isAddressed(row),
      needsAttention: row.goingQuiet || row.lapsed || row.notStarted || row.renewalWindow || row.openTickets > 0,
      onMarkAddressed: (next: boolean) => this.markAddressed(row, next),
    };
    this.dialog.open(ParticipantSlideoverComponent, {
      data,
      width: 'min(520px, 100vw)',
      height: '100vh',
      position: { right: '0', top: '0' },
      panelClass: 'jchd-slideover-panel',
      // a11y: label the dialog by the participant-name heading and move focus into the panel
      // (the close button) on open, instead of leaving focus on the trigger outside the overlay.
      ariaLabelledBy: 'so-title',
      autoFocus: '.so-close',
    });
  }

  /** Route the slide-over's inline Log composer to the matching dashboard write. */
  private handleSlideoverLog(row: PortfolioRow, type: ActivityType, payload: SlideoverLogPayload): void {
    switch (type) {
      case 'call':
        void this.writeCall(row, payload.outcome ?? 'reached', (payload.note ?? '').trim(), payload.nextActionDate ?? null);
        break;
      case 'health':
        if (payload.state) void this.writeHealth(row, payload.state, (payload.note ?? '').trim());
        break;
      case 'schedule':
        void this.writeSchedule(row, payload.dueDate ?? null, (payload.note ?? '').trim());
        break;
      case 'note':
        void this.writeNote(row, (payload.note ?? '').trim());
        break;
    }
  }

  /** One-shot read of a participant's healthtracker_activity events, newest first (limit 50),
   *  mapped to the slide-over's display shape. NO onSnapshot listener. Degrades to [] on failure. */
  private async loadActivityTimeline(profileid: string): Promise<SlideoverActivityItem[]> {
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'healthtracker_activity'),
        where('profileid', '==', profileid),
        orderBy('timestamp', 'desc'),
        limit(50),
      ));
      const items: SlideoverActivityItem[] = [];
      snap.forEach(d => {
        const data: any = d.data();
        items.push({
          type: data['type'] as ActivityType,
          actorName: typeof data['actorName'] === 'string' ? data['actorName'] : '',
          date: this.toDate(data['timestamp']),
          note: typeof data['note'] === 'string' ? data['note'] : '',
          outcome: typeof data['outcome'] === 'string' ? data['outcome'] : null,
          state: data['state'] ? normalizeCoachHealth(data['state']) : null,
          flagged: data['flagged'] === true,
          dueDate: this.toDate(data['dueDate']),
          action: typeof data['action'] === 'string' ? data['action'] : null,
          fromCoachName: typeof data['fromCoachName'] === 'string' ? data['fromCoachName'] : null,
          toCoachName: typeof data['toCoachName'] === 'string' ? data['toCoachName'] : null,
        });
      });
      return items;
    } catch (e) {
      console.warn('activity timeline load failed (non-fatal)', e);
      return [];
    }
  }

  /** Read-only keyboard navigation for the base table — lets power users triage without a mouse.
   *  Strict no-op while typing in a field, when any dialog/overlay is open, when not on the base
   *  view, or with a modifier key held — so the slide-over and dialogs are never disrupted. */
  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (this.view !== 'base') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const target = (e.target as HTMLElement) ?? (document.activeElement as HTMLElement | null);
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
    }
    // a slide-over / MatDialog is open — leave its own focus handling alone
    if (document.querySelector('.cdk-overlay-container .mat-mdc-dialog-container')) return;

    const lastIndex = this.dataSource.data.length - 1;

    switch (e.key) {
      case '/':
        e.preventDefault();
        this.searchInput?.nativeElement.focus();
        break;
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        this.focusedRowIndex = Math.min(this.focusedRowIndex + 1, lastIndex);
        this.scrollFocusedIntoView();
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        this.focusedRowIndex = this.focusedRowIndex <= 0 ? 0 : this.focusedRowIndex - 1;
        this.scrollFocusedIntoView();
        break;
      case 'o':
      case 'Enter':
        if (this.focusedRowIndex >= 0 && this.focusedRowIndex <= lastIndex) {
          this.openSlideover(this.dataSource.data[this.focusedRowIndex]);
        }
        break;
      case 'Escape':
        this.focusedRowIndex = -1;
        break;
    }
  }

  /** Scroll the keyboard-focused base-table row into view after the class binding has applied. */
  private scrollFocusedIntoView(): void {
    setTimeout(() => {
      const el = document.querySelector('tr.jchd-row-focused');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  /** Append one event to the unified, append-only healthtracker_activity log. NEW collection — every
   *  write stamps actorUid/actorName + a server timestamp. Callers dual-write: they keep their
   *  EXISTING collection write AND call this IN PARALLEL (Promise.all). Returns the addDoc promise so
   *  callers can Promise.all it; never throws synchronously (the catch keeps the primary write honest). */
  private logActivity(profileid: string, type: ActivityType, payload: Record<string, any>): Promise<unknown> {
    return addDoc(collection(this.firestore, 'healthtracker_activity'), {
      profileid,
      type,
      actorUid: this.actorUid,
      actorName: this.coachName,
      timestamp: serverTimestamp(),
      ...payload,
    });
  }

  /** Open the Log-call dialog; on save, write the enriched touchpoint and close the loop. */
  logCall(row: PortfolioRow): void {
    const ref = this.dialog.open(LogCallDialogComponent, { data: { name: row.name }, autoFocus: false });
    ref.afterClosed().subscribe(async (res: LogCallResult | undefined) => {
      if (!res) return;
      await this.writeCall(row, res.outcome, res.note, res.nextActionDate ?? null);
    });
  }

  /** Core call write: dual-writes the EXISTING healthtracker_touchpoint AND the unified
   *  healthtracker_activity event IN PARALLEL (Promise.all), then runs the optimistic UI. Shared
   *  by the dialog flow (logCall) and the slide-over's inline Log composer. */
  async writeCall(row: PortfolioRow, outcome: LogCallResult['outcome'], note: string, nextActionDate: Date | null): Promise<void> {
    const writer = this.coachId || this.selectedCoachId || '';
    const contacted = outcome === 'reached' || outcome === 'scheduled';
    try {
      await Promise.all([
        addDoc(collection(this.firestore, 'healthtracker_touchpoint'), {
          profileid: row.profileid,
          coachid: this.selectedCoachId === this.ALL ? writer : this.selectedCoachId,
          loggedby: writer,
          date: serverTimestamp(),
          outcome,
          note,
          nextactiondate: nextActionDate ?? null,
          contacted,
          source: 'health-dashboard',
          // audit trail (new namespaced fields): who performed the action + when (server-stamped).
          actorName: this.coachName,
          actorUid: this.actorUid,
        }),
        this.logActivity(row.profileid, 'call', { outcome, note, contacted, nextactiondate: nextActionDate ?? null }),
      ]);
      this.guard.openSnackBar(`Call logged for ${row.name}`, 'Close');
      // Optimistic UI runs ONLY after the write succeeds — on permission-denied the row must
      // not visually clear its quiet flag. Only an actual contact (reached/scheduled) resets
      // the going-quiet clock; a no-answer is still logged but does not clear the quiet flag.
      if (contacted) {
        const now = Date.now();
        this.touchpointByProfile[row.profileid] = now;
        row.lastcoachdate = new Date(now);
        row.daysSinceCoach = 0;
        row.goingQuiet = false;
        this.scoreRow(row);
        // re-sort via an immutable set() so the derived computeds pick up the new order
        this.allRows.set([...this.allRows()].sort((a, b) => b.priority - a.priority));
        this.computeSummary();
        this.applyFilters();
      }
    } catch (e: any) {
      console.error('logCall write failed', e);
      this.guard.openSnackBar('Could not save call: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
    }
  }

  /** Open the Set-health-state dialog; on save, append a new audit doc and reflect immediately.
   *  This is the coach's MANUAL assessment — it never touches customerstatus / lifecycle. */
  setHealthState(row: PortfolioRow): void {
    const ref = this.dialog.open(SetHealthStateDialogComponent, {
      data: { name: row.name, current: row.coachHealthState?.state ?? null },
      autoFocus: false,
    });
    ref.afterClosed().subscribe(async (res: SetHealthStateResult | undefined) => {
      if (!res) return;
      await this.writeHealth(row, res.state, res.note);
    });
  }

  /** Core health write: dual-writes the EXISTING healthtracker_healthstate audit doc AND the unified
   *  healthtracker_activity event IN PARALLEL (Promise.all). Shared by the dialog flow and the
   *  slide-over's inline Log composer. Never touches customerstatus / lifecycle. */
  async writeHealth(row: PortfolioRow, state: CoachHealthState, note: string): Promise<void> {
    const writer = this.coachId || this.selectedCoachId || '';
    try {
      await Promise.all([
        addDoc(collection(this.firestore, 'healthtracker_healthstate'), {
          profileid: row.profileid,
          state,
          note,
          coachid: writer,
          date: serverTimestamp(),
          source: 'health-dashboard',
          // audit trail (new namespaced fields): who performed the action + when (server-stamped).
          actorName: this.coachName,
          actorUid: this.actorUid,
        }),
        this.logActivity(row.profileid, 'health', { state, note }),
      ]);
      this.guard.openSnackBar(`Health state set to ${this.healthLabel(state)} for ${row.name}`, 'Close');
    } catch (e: any) {
      console.error('setHealthState write failed', e);
      this.guard.openSnackBar('Could not save health state: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
      return;
    }
    // optimistic: reflect on the row + the in-memory map so the Health column updates without reload
    const entry = { state, note, date: new Date() };
    row.coachHealthState = entry;
    this.coachHealthByProfile[row.profileid] = entry;
  }

  /** Schedule-type log: there is no dedicated schedule collection today, so this writes ONLY the
   *  unified activity event (a 'schedule' due-date + note). When a schedule collection lands, add the
   *  parallel write here. Keeps the slide-over's Schedule tab honest (it records, it does not fabricate). */
  async writeSchedule(row: PortfolioRow, dueDate: Date | null, note: string): Promise<void> {
    try {
      await this.logActivity(row.profileid, 'schedule', { dueDate: dueDate ?? null, note });
      this.guard.openSnackBar(`Scheduled follow-up logged for ${row.name}`, 'Close');
    } catch (e: any) {
      console.error('writeSchedule failed', e);
      this.guard.openSnackBar('Could not save schedule: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
    }
  }

  /** Note-type log: writes ONLY the unified activity event (a free-text coach note). */
  async writeNote(row: PortfolioRow, note: string): Promise<void> {
    if (!note.trim()) return;
    try {
      await this.logActivity(row.profileid, 'note', { note: note.trim() });
      this.guard.openSnackBar(`Note added for ${row.name}`, 'Close');
    } catch (e: any) {
      console.error('writeNote failed', e);
      this.guard.openSnackBar('Could not save note: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
    }
  }

  /** Immutable add/remove on the flaggedIds signal so the Flagged count/filter computeds update. */
  private setFlagged(profileid: string, on: boolean): void {
    const next = new Set(this.flaggedIds());
    if (on) next.add(profileid); else next.delete(profileid);
    this.flaggedIds.set(next);
  }

  /** Toggle a participant's GLOBAL flag (star). Optimistic: flip row.flagged + flaggedIds, then
   *  await the merge-write to healthtracker_flag (docId = profileid). Un-flag NEVER deletes the
   *  doc — it sets flagged: false. On failure, REVERT the optimistic change and snackbar the
   *  permission message. Recompute filters so the Flagged count + filter update immediately. */
  async toggleFlag(row: PortfolioRow, note = ''): Promise<void> {
    const next = !row.flagged;
    // optimistic flip (row + the base-wide set the count/filter read from)
    row.flagged = next;
    this.setFlagged(row.profileid, next);
    this.applyFilters();
    try {
      // dual-write: the EXISTING healthtracker_flag on/off doc AND the unified activity event, in parallel.
      await Promise.all([
        setDoc(
          doc(this.firestore, 'healthtracker_flag', row.profileid),
          {
            profileid: row.profileid, flagged: next, flaggedby: this.coachId ?? null,
            note: note.trim(),
            date: serverTimestamp(),
            // audit trail (new namespaced fields): who performed the action + when (server-stamped).
            actorName: this.coachName,
            actorUid: this.actorUid,
          },
          { merge: true },
        ),
        this.logActivity(row.profileid, 'flag', { flagged: next, note: note.trim() }),
      ]);
    } catch (e: any) {
      console.error('toggleFlag write failed', e);
      // revert the optimistic change
      row.flagged = !next;
      this.setFlagged(row.profileid, !next);
      this.applyFilters();
      this.guard.openSnackBar('Could not update flag: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
    }
  }



  /** Title-case label for a coach-set Health State (Happy / Neutral / Unhappy / At-risk / Critical). */
  healthLabel(s: CoachHealthState | null | undefined): string {
    return coachHealthLabel(s);
  }
  /** Label for the Coach-health filter options, including the synthetic 'Not assessed' bucket. */
  healthFilterLabel(h: CoachHealthState | 'UNASSESSED'): string {
    return h === 'UNASSESSED' ? 'Not assessed' : this.healthLabel(h);
  }

  /** A coach-set health tag is valid for HEALTH_TTL_DAYS; a null/undated or older tag is expired. */
  private isHealthFresh(date: Date | null | undefined): boolean {
    if (!date) return false;
    return (Date.now() - date.getTime()) <= this.HEALTH_TTL_DAYS * 86400000;
  }
  /** Return the health entry only while it is still valid, else null (reverts to Not assessed).
   *  Single choke point so the chip, the summary distribution, and the health filter all agree. */
  private freshHealth(
    entry: { state: CoachHealthState; note: string; date: Date | null } | null | undefined,
  ): { state: CoachHealthState; note: string; date: Date | null } | null {
    return entry && this.isHealthFresh(entry.date) ? entry : null;
  }

  // ---- "Mark addressed": a coach-set acknowledgement that drops a participant out of Needs
  //      Attention until a NEW issue appears (stored as an 'addressed' healthtracker_activity event). ----
  /** The Needs-Attention issue keys currently active on a row. */
  private activeIssues(r: PortfolioRow): string[] {
    const out: string[] = [];
    if (r.goingQuiet) out.push('goingQuiet');
    if (r.lapsed) out.push('lapsed');
    if (r.notStarted) out.push('notStarted');
    if (r.renewalWindow) out.push('renewalWindow');
    if (r.openTickets > 0) out.push('tickets');
    return out;
  }
  /** True when the coach marked this participant addressed AND no NEW issue type has appeared since
   *  (current issues are a subset of the snapshot). A new issue re-surfaces them into Needs Attention. */
  isAddressed(r: PortfolioRow): boolean {
    const rec = this.addressedByProfile()[r.profileid];
    if (!rec || !rec.issues.length) return false;
    const cur = this.activeIssues(r);
    if (!cur.length) return false;                       // nothing active -> not in Needs Attention anyway
    return cur.every(i => rec.issues.includes(i));
  }

  /** Load the latest 'addressed' snapshot per participant from the unified activity log (base-wide;
   *  addressed events are rare, so one type-scoped read is cheaper than per-page batches). Degrades
   *  to none on permission-denied. */
  private async loadAddressed(): Promise<void> {
    try {
      const snap = await getDocs(query(collection(this.firestore, 'healthtracker_activity'), where('type', '==', 'addressed')));
      const latest: Record<string, { issues: string[]; date: Date | null; ms: number }> = {};
      snap.forEach(d => {
        const data: any = d.data();
        const pid = data['profileid'];
        if (!pid) return;
        const dt = this.toDate(data['timestamp']);
        const ms = dt ? dt.getTime() : 0;
        const cur = latest[pid];
        if (!cur || ms >= cur.ms) latest[pid] = { issues: Array.isArray(data['issues']) ? data['issues'] : [], date: dt, ms };
      });
      const out: Record<string, { issues: string[]; date: Date | null }> = {};
      for (const pid of Object.keys(latest)) out[pid] = { issues: latest[pid].issues, date: latest[pid].date };
      this.addressedByProfile.set(out);
    } catch (e) {
      console.warn('addressed load failed (non-fatal)', e);
    }
  }

  /** Mark (or re-open) a participant. Marking snapshots the currently-active issues; re-opening
   *  clears them. Optimistic — reverts + toasts on write failure (same pattern as flag/health). */
  async markAddressed(row: PortfolioRow, addressed = true): Promise<void> {
    const issues = addressed ? this.activeIssues(row) : [];
    if (addressed && !issues.length) {
      this.guard.openSnackBar(`${row.name} has no active issues to address`, 'Close');
      return;
    }
    const map = this.addressedByProfile();
    const prev = map[row.profileid] ?? null;
    this.addressedByProfile.set({ ...map, [row.profileid]: { issues, date: new Date() } });
    this.applyFilters();
    try {
      await this.logActivity(row.profileid, 'addressed', { issues });
      this.guard.openSnackBar(addressed ? `Marked addressed — ${row.name} leaves Needs Attention` : `Re-opened ${row.name}`, 'Close');
    } catch (e: any) {
      const rb = { ...this.addressedByProfile() };
      if (prev) rb[row.profileid] = prev; else delete rb[row.profileid];
      this.addressedByProfile.set(rb);
      this.applyFilters();
      this.guard.openSnackBar('Could not update: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
    }
  }

  /** Per-row assign / change coach — works for any participant (assign or reassign).
   *  Writes real coachedby for every pjp doc of the row (reusing the Phase-B write pattern),
   *  reflects locally (coachedby + coach name + unassignedCount), and snackbars the result. */
  async assignCoachToRow(row: PortfolioRow, coachId: string, note = ''): Promise<void> {
    if (!coachId) return;
    const coachRef = doc(this.firestore, 'profile_data', coachId);
    const coachName = this.coaches.find(c => c.id === coachId)?.name ?? coachId;
    // capture the previous coach BEFORE the write so the activity event records from->to + action.
    const fromCoachName = row.coachname && row.coachname !== '—' ? row.coachname : null;
    const fromCoachId = this.coaches.find(c => c.name === fromCoachName)?.id ?? null;
    const wasUnassigned = !fromCoachName;
    const action: 'assign' | 'reassign' = wasUnassigned ? 'assign' : 'reassign';
    const fail = await this.writeCoachForProfile(row.profileid, [coachRef]);
    if (fail > 0) {
      this.guard.openSnackBar(`Could not assign ${row.name}: ${fail} write(s) failed (permission denied?)`, 'Close', 5000);
      return;
    }
    // unified activity event (coachedby write is per-pjp above; the activity log carries the change once).
    void this.logActivity(row.profileid, 'coach_change', {
      action, fromCoachId, fromCoachName, toCoachId: coachId, toCoachName: coachName, note: note.trim(),
    });
    // reflect on the row + recompute the unassigned count from live data
    row.coachname = coachName;
    const unassignedProfiles = new Set<string>();
    for (const d of this.pjpData) {
      if (d['profileid'] && this.isUnassigned(d['coachedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;
    // if we're viewing a single coach or the unassigned bucket, this row may no longer belong here
    if (this.selectedCoachId !== this.ALL) this.computeRows();
    this.guard.openSnackBar(`Assigned ${row.name} to ${coachName}`, 'Close');
  }

  /** Remove the coach from a participant: write coachedby:[] for every pjp doc, log a 'coach_change'
   *  (action 'unassign'), reflect locally, and refresh the unassigned count. Mirrors assignCoachToRow. */
  async unassignCoach(row: PortfolioRow, note = ''): Promise<void> {
    const fromCoachName = row.coachname && row.coachname !== '—' ? row.coachname : null;
    const fromCoachId = this.coaches.find(c => c.name === fromCoachName)?.id ?? null;
    const fail = await this.writeCoachForProfile(row.profileid, []);
    if (fail > 0) {
      this.guard.openSnackBar(`Could not unassign ${row.name}: ${fail} write(s) failed (permission denied?)`, 'Close', 5000);
      return;
    }
    void this.logActivity(row.profileid, 'coach_change', {
      action: 'unassign', fromCoachId, fromCoachName, toCoachId: null, toCoachName: null, note: note.trim(),
    });
    row.coachname = '—';
    const unassignedProfiles = new Set<string>();
    for (const d of this.pjpData) {
      if (d['profileid'] && this.isUnassigned(d['coachedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;
    if (this.selectedCoachId !== this.ALL) this.computeRows();
    this.guard.openSnackBar(`Removed coach from ${row.name}`, 'Close');
  }

  // ---- Phase C: Coach Scoreboard ----

  async setView(v: DashboardView): Promise<void> {
    if (!v) return; // mat-button-toggle can emit null on deselect; ignore
    this.view = v;
    if (v === 'scoreboard' && !this.scoreboardComputed) {
      await this.ensureScoreboardData();   // scoreboard spans all coaches; loaded once on demand
      this.computeScoreboard();
    }
  }

  // ===================== iOS Summary view + compact strip helpers =====================

  /** Initials for a participant/coach name (max two letters), for the iOS avatar circles. */
  initials(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Deterministic iOS avatar-tint class for a person (rotates colours per name). */
  avatarClass(key: string | null | undefined): string {
    const palette = ['av-blue', 'av-green', 'av-orange', 'av-red', 'av-indigo', 'av-teal', 'av-pink'];
    const s = (key ?? '').toString();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  /** Distinct participants matching ANY active lever — the "Needs Attention" set. Reuses the
   *  existing per-row lever flags (no new scoring): goingQuiet ∪ lapsed ∪ notStarted ∪
   *  renewalWindow ∪ openTickets. Computed over the currently-loaded base rows (allRows). */
  /** Stable identity for *ngFor / mat-table rows so the DOM diffs by participant, not by index. */
  trackByProfileId = (_: number, r: { profileid: string }): string => r.profileid;
  trackByCoachId = (_: number, c: { coachId: string }): string => c.coachId;

  needsAttentionRows = computed<PortfolioRow[]>(() =>
    this.filteredRows()
      .filter(r => (r.goingQuiet || r.lapsed || r.notStarted || r.renewalWindow || r.openTickets > 0) && !this.isAddressed(r))
      .sort((a, b) => b.priority - a.priority));
  // backing computed for the parens-free `needsAttentionCount` getter (template binds the getter).
  private _needsAttentionCount = computed<number>(() => {
    // Always read the local (filtered) count first so this computed stays subscribed to
    // needsAttentionRows — otherwise, after taking the paged branch, it never recomputes when
    // allRows changes on a scope switch (it would show a stale base-wide number in a coach view).
    const local = this.needsAttentionRows().length;
    // paged: use the base-wide count once contact data has loaded (else page-local rows).
    if (this.pagedMode && this.contactDataLoaded()) return this.fullBaseNeedsAttention();
    return local;
  });
  get needsAttentionCount(): number { return this._needsAttentionCount(); }

  /** Real participant rows behind a given Summary card (from the loaded base). */
  goingQuietRows = computed<PortfolioRow[]>(() =>
    this.filteredRows().filter(r => r.goingQuiet).sort((a, b) => (b.daysSinceCoach ?? 0) - (a.daysSinceCoach ?? 0)));
  paymentsLockedRows = computed<PortfolioRow[]>(() =>
    this.filteredRows().filter(r => (r.financialstatus ?? '').toLowerCase() === 'locked').sort((a, b) => b.priority - a.priority));
  renewalRows = computed<PortfolioRow[]>(() =>
    this.filteredRows().filter(r => r.renewalWindow).sort((a, b) => (a.daysToRenewal ?? 0) - (b.daysToRenewal ?? 0)));
  openTicketRows = computed<PortfolioRow[]>(() =>
    this.filteredRows().filter(r => r.openTickets > 0).sort((a, b) => b.openTickets - a.openTickets));
  flaggedRows = computed<PortfolioRow[]>(() =>
    this.filteredRows().filter(r => r.flagged).sort((a, b) => b.priority - a.priority));
  /** Scope-aware flagged count: base-wide for the ALL view, but this coach's flagged participants
   *  for a specific coach (allRows is that coach's full base in non-paged mode). The global
   *  flaggedIds set is base-wide, so it must NOT be used as the count when a coach is selected.
   *  (selectedCoachId is read as a plain field — it co-changes with an allRows rebuild on scope
   *  switch, and flaggedIds is a signal, so the memoized count stays correct.) */
  flaggedCount = computed<number>(() =>
    this.pagedMode ? (this.fullIndexBuilt ? this.pagedFlagged() : this.flaggedIds().size) : this.flaggedRows().length);

  /** Coach-set health distribution across the CURRENT scope's loaded rows (allRows). Honest: it
   *  reflects only KNOWN/loaded states — every row without a coach assessment is Not assessed (no
   *  fabrication). Counts per state come from the row's coachHealthState (built from
   *  coachHealthByProfile in computeRows). */
  healthDistribution = computed<{ happy: number; neutral: number; unhappy: number; atRisk: number; critical: number; notAssessed: number; total: number }>(() => {
    // All view: base-wide + filtered from the lite index against the (base-wide) coach-health map.
    if (this.pagedMode && this.fullIndexBuilt) return this.pagedHealth();
    const d = { happy: 0, neutral: 0, unhappy: 0, atRisk: 0, critical: 0, notAssessed: 0, total: 0 };
    for (const r of this.filteredRows()) {
      d.total++;
      switch (r.coachHealthState?.state) {
        case 'HAPPY': d.happy++; break;
        case 'NEUTRAL': d.neutral++; break;
        case 'UNHAPPY': d.unhappy++; break;
        case 'AT_RISK': d.atRisk++; break;
        case 'CRITICAL': d.critical++; break;
        default: d.notAssessed++; break;   // no coach assessment yet
      }
    }
    return d;
  });

  /** Percentage width for a health-bar segment (0 when nothing loaded). */
  healthPct(count: number, total: number): number {
    return total > 0 ? (count / total) * 100 : 0;
  }

  /** Journey-wise split of the current scope's participants (actual journey names, desc by count).
   *  Exact in a coach's full view; page-local in the paged All view (the lite index carries no
   *  journey name yet). */
  journeyMix = computed<{ name: string; count: number }[]>(() => {
    const m = new Map<string, number>();
    this.indexReady();   // recompute when the lite index finishes building (paged mode)
    // Paged/All view: count the WHOLE base from the lite index (allRows is only the loaded page);
    // coach view: allRows is the full base. journeyname is carried on both.
    const src: { journeyname?: string }[] = (this.pagedMode && this.fullIndexBuilt) ? this.fullIndex : this.allRows();
    for (const r of src) {
      const j = (r.journeyname && r.journeyname !== '-') ? r.journeyname : 'Unknown';
      m.set(j, (m.get(j) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  });

  // ---- personal journey groups (a named roll-up over chosen journeys, one journey per group) ----
  journeyGroups = signal<JourneyGroup[]>([]);
  groupPanelOpen = false;
  editingGroupId: string | null = null;
  newGroupName = '';
  newGroupJourneys = new Set<string>();
  journeyGroupFilter: string[] = [];   // journeys of the tapped group (Participants filter)

  /** The "By journey" split with groups rolled up + ungrouped journeys individual, desc by count. */
  journeyView = computed<{ name: string; count: number; group: boolean; journeys: string[] }[]>(() => {
    const mix = this.journeyMix();
    const countOf = new Map(mix.map(j => [j.name, j.count] as const));
    const grouped = new Set<string>();
    const out: { name: string; count: number; group: boolean; journeys: string[] }[] = [];
    for (const g of this.journeyGroups()) {
      let c = 0;
      for (const j of g.journeys) { c += countOf.get(j) ?? 0; grouped.add(j); }
      out.push({ name: g.name, count: c, group: true, journeys: g.journeys });
    }
    for (const j of mix) if (!grouped.has(j.name)) out.push({ name: j.name, count: j.count, group: false, journeys: [j.name] });
    return out.sort((a, b) => b.count - a.count);
  });

  // ---- global summary filter: lifecycle + journey/group, scopes EVERY summary metric ----
  // Only active when the base is fully loaded (!pagedMode); in the paged/All view the numbers come
  // from base-wide server/index counts that can't be row-filtered accurately, so the bar is disabled.
  // Default view is ACTIVE participants; other segments (All / Non-active / Discontinued) are opt-in.
  // Switching between them only re-slices the already-loaded allRows — never a new fetch.
  sumLifecycle = signal<'all' | 'active' | 'nonactive' | 'discontinued'>('active');
  // Multi-select By-journey: a set of the selected journey NAMES (union). A group contributes all of
  // its journeys; individual chips contribute one. Empty = all journeys (the default).
  sumJourneys = signal<Set<string>>(new Set());
  journeyMenuOpen = false;

  private summaryJourneyName(r: { journeyname?: string }): string {
    return (r.journeyname && r.journeyname !== '-') ? r.journeyname : 'Unknown';
  }
  private matchesSummaryJourney(r: PortfolioRow): boolean {
    const s = this.sumJourneys();
    return s.size === 0 || s.has(this.summaryJourneyName(r));
  }
  private matchesSummaryLifecycle(r: PortfolioRow): boolean {
    switch (this.sumLifecycle()) {
      case 'active': return r.subActive && !this.isInactiveStatus(r.customerstatus);
      case 'nonactive': return !r.subActive && !this.isInactiveStatus(r.customerstatus);
      case 'discontinued': return this.isInactiveStatus(r.customerstatus);
      default: return true;
    }
  }
  /** allRows scoped by the JOURNEY filter only — the band shows the full lifecycle split for it. */
  journeyFilteredRows = computed<PortfolioRow[]>(() => this.allRows().filter(r => this.matchesSummaryJourney(r)));
  /** allRows scoped by BOTH filters — the source for every KPI / needs-attention / health count. */
  filteredRows = computed<PortfolioRow[]>(() => this.journeyFilteredRows().filter(r => this.matchesSummaryLifecycle(r)));

  // Paged/All-view: the summary is computed base-wide from the lite index (accumulatePagedSummary),
  // so the filtered needs-attention / flagged / health / shown-count live in these signals (set there)
  // and are read by the corresponding computeds — keeping the All view reactive to filter changes.
  private pagedHealth = signal<{ happy: number; neutral: number; unhappy: number; atRisk: number; critical: number; notAssessed: number; total: number }>(
    { happy: 0, neutral: 0, unhappy: 0, atRisk: 0, critical: 0, notAssessed: 0, total: 0 });
  private pagedFlagged = signal(0);
  private pagedFilteredCount = signal(0);
  // Bumped when the lite index finishes building, so journeyMix (which reads the plain fullIndex
  // array in paged mode) recomputes to the base-wide counts instead of the page-local ones.
  private indexReady = signal(0);
  /** Same journey predicate as matchesSummaryJourney, over a lite index row (base-wide). */
  private matchesSummaryJourneyLite(l: LiteIndexRow): boolean {
    const s = this.sumJourneys();
    if (s.size === 0) return true;
    const name = (l.journeyname && l.journeyname !== '-') ? l.journeyname : 'Unknown';
    return s.has(name);
  }
  /** Same lifecycle predicate as matchesSummaryLifecycle, over a lite index row (base-wide). */
  private matchesSummaryLifecycleLite(l: LiteIndexRow): boolean {
    switch (this.sumLifecycle()) {
      case 'active': return l.subActive && !this.isInactiveStatus(l.customerstatus);
      case 'nonactive': return !l.subActive && !this.isInactiveStatus(l.customerstatus);
      case 'discontinued': return this.isInactiveStatus(l.customerstatus);
      default: return true;
    }
  }
  /** Base-wide count matching the applied filter — paged from the lite index, else the loaded rows. */
  get summaryShownCount(): number { return this.pagedMode ? this.pagedFilteredCount() : this.filteredRows().length; }
  get summaryScopeTotal(): number { return this.pagedMode ? this.fullIndex.length : this.allRows().length; }

  /** Default is Active; a filter is "active" (Clear appears) only when it differs from that default. */
  get summaryFilterActive(): boolean { return this.sumLifecycle() !== 'active' || this.sumJourneys().size > 0; }
  /** Highlighted lifecycle segment — the filter now applies in both the coach and All views. */
  get shownLifecycle(): 'all' | 'active' | 'nonactive' | 'discontinued' { return this.sumLifecycle(); }
  /** Pill label: 'All journeys' → the single chip's name → 'N journeys' for a multi-select. */
  get summaryJourneyLabel(): string {
    const s = this.sumJourneys();
    if (s.size === 0) return 'All journeys';
    const on = this.journeyView().filter(j => this.isSummaryJourneyOn(j));
    return on.length === 1 ? on[0].name : `${s.size} journeys`;
  }
  /** A chip (journey or group) is on when every journey it represents is selected. */
  isSummaryJourneyOn(item: { name: string; group: boolean; journeys: string[] }): boolean {
    const s = this.sumJourneys();
    return item.journeys.length > 0 && item.journeys.every(j => s.has(j));
  }

  /** Status-band tile / segmented control → set the lifecycle filter in place. 'all' resets the
   *  lifecycle (keeps the journey); a repeated segment toggles back to 'all'. */
  /** The filter is usable once the data backing it is present: the coach view has full rows; the
   *  paged/All view needs the lite index built (that's when the base-wide counts become filterable). */
  get summaryFilterReady(): boolean { return !this.pagedMode || this.fullIndexBuilt; }
  /** Recompute the summary through the active filter — base-wide from the lite index when paged. */
  private recomputeSummary(): void { if (this.pagedMode) this.accumulatePagedSummary(); else this.computeSummary(); }

  setSumLifecycle(kind: 'all' | 'active' | 'nonactive' | 'discontinued'): void {
    if (!this.summaryFilterReady) return;
    this.sumLifecycle.set(kind);   // plain selector — pick one, no toggle back to 'all'
    this.journeyMenuOpen = false;
    this.recomputeSummary();
  }
  /** Journey chip / dropdown item → toggle its journey(s) in the multi-select set. `null` clears all.
   *  Multi-select: the dropdown stays open so several can be picked; the By-journey chips toggle too. */
  setSumJourney(item: { name: string; group: boolean; journeys: string[] } | null): void {
    if (!this.summaryFilterReady) return;
    const next = new Set(this.sumJourneys());
    if (!item) {
      next.clear();
    } else if (this.isSummaryJourneyOn(item)) {
      for (const j of item.journeys) next.delete(j);   // all present → turn the chip off
    } else {
      for (const j of item.journeys) next.add(j);       // turn the chip on (whole group at once)
    }
    this.sumJourneys.set(next);
    this.recomputeSummary();
  }
  toggleJourneyMenu(): void { if (this.summaryFilterReady) this.journeyMenuOpen = !this.journeyMenuOpen; }
  closeJourneyMenu(): void { this.journeyMenuOpen = false; }
  clearSummaryFilter(): void {
    this.sumLifecycle.set('active');   // reset to the default view, not to 'all'
    this.sumJourneys.set(new Set());
    this.journeyMenuOpen = false;
    this.recomputeSummary();
  }

  /** Personal groups for the logged-in coach — stored locally (per-coach, this browser only).
   *  Key is scoped by actorUid so coaches sharing a browser don't see each other's groups. */
  private journeyGroupKey(): string { return `jchd_journeygroups_${this.actorUid}`; }
  private newGroupId(): string {
    try { return crypto.randomUUID(); }
    catch { return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  }
  private persistJourneyGroups(groups: JourneyGroup[]): void {
    if (!this.actorUid) return;
    localStorage.setItem(this.journeyGroupKey(), JSON.stringify(groups));
  }
  private async loadJourneyGroups(): Promise<void> {
    if (!this.actorUid) return;
    try {
      const raw = localStorage.getItem(this.journeyGroupKey());
      const arr = raw ? JSON.parse(raw) : [];
      this.journeyGroups.set(Array.isArray(arr) ? arr.map((x: any) => ({
        id: (x?.id ?? '').toString(),
        name: (x?.name ?? '').toString(),
        journeys: Array.isArray(x?.journeys) ? x.journeys : [],
      })) : []);
    } catch (e) { console.warn('journey groups load failed (non-fatal)', e); }
  }

  /** Every journey in the base — what the group picker offers. */
  pickerJourneys(): string[] { return this.journeyMix().map(j => j.name); }
  /** Group a journey already belongs to (excluding the one being edited) — one-journey-per-group. */
  groupOfJourney(name: string): JourneyGroup | null {
    return this.journeyGroups().find(g => g.id !== this.editingGroupId && g.journeys.includes(name)) ?? null;
  }
  isJourneyPicked(name: string): boolean { return this.newGroupJourneys.has(name); }
  toggleGroupPanel(): void { this.groupPanelOpen = !this.groupPanelOpen; if (this.groupPanelOpen) this.startNewGroup(); }
  startNewGroup(): void { this.editingGroupId = null; this.newGroupName = ''; this.newGroupJourneys = new Set(); }
  editGroup(g: JourneyGroup): void { this.groupPanelOpen = true; this.editingGroupId = g.id; this.newGroupName = g.name; this.newGroupJourneys = new Set(g.journeys); }
  toggleJourneyInNewGroup(name: string): void {
    if (this.groupOfJourney(name)) return;                 // locked to another group
    if (this.newGroupJourneys.has(name)) this.newGroupJourneys.delete(name); else this.newGroupJourneys.add(name);
  }

  /** Create or update the group being edited (honest write; optimistic reload). */
  async saveGroup(): Promise<void> {
    const name = this.newGroupName.trim();
    const journeys = [...this.newGroupJourneys];
    if (!name) { this.guard.openSnackBar('Give the group a name', 'Close'); return; }
    if (!journeys.length) { this.guard.openSnackBar('Pick at least one journey', 'Close'); return; }
    try {
      const groups = [...this.journeyGroups()];
      if (this.editingGroupId) {
        const i = groups.findIndex(g => g.id === this.editingGroupId);
        if (i >= 0) groups[i] = { ...groups[i], name, journeys };
      } else {
        groups.push({ id: this.newGroupId(), name, journeys });
      }
      this.persistJourneyGroups(groups);
      await this.loadJourneyGroups();
      this.startNewGroup();
      this.guard.openSnackBar(`Group "${name}" saved`, 'Close');
    } catch (e: any) {
      this.guard.openSnackBar('Could not save group: ' + (e?.message ?? 'unknown error'), 'Close', 5000);
    }
  }
  async deleteGroup(g: JourneyGroup): Promise<void> {
    try {
      this.persistJourneyGroups(this.journeyGroups().filter(x => x.id !== g.id));
      await this.loadJourneyGroups();
      if (this.editingGroupId === g.id) this.startNewGroup();
      this.guard.openSnackBar(`Group "${g.name}" removed`, 'Close');
    } catch (e: any) {
      this.guard.openSnackBar('Could not delete: ' + (e?.message ?? 'unknown error'), 'Close', 5000);
    }
  }

  /** A By-journey row (single journey OR a group) → Participants filtered to its journey(s). */
  goToJourney(item: { name: string; group: boolean; journeys: string[] }): void {
    this.statusFilter = '';
    this.financeFilters = [];
    this.lifecycleFilter = '';
    this.activeLever = 'all';
    if (item.group) {
      const same = this.journeyGroupFilter.length === item.journeys.length && item.journeys.every(j => this.journeyGroupFilter.includes(j));
      this.journeyFilter = '';
      this.journeyGroupFilter = same ? [] : [...item.journeys];
    } else {
      this.journeyGroupFilter = [];
      this.journeyFilter = this.journeyFilter === item.name ? '' : item.name;
    }
    this.view = 'base';
    this.applyFilters();
  }

  /** Real top-of-queue participants for a coach (Coaches view), from the loaded base rows.
   *  Matches a row to the coach via the row's own coachname (resolved in computeRows), so it
   *  never fabricates — it only previews participants actually present in the loaded base. */
  topQueueForCoach(coachId: string): PortfolioRow[] {
    const coachName = this.coaches.find(c => c.id === coachId)?.name ?? '';
    if (!coachName) return [];
    return this.allRows()
      .filter(r => r.coachname === coachName)
      .filter(r => r.goingQuiet || r.lapsed || r.notStarted || r.renewalWindow || r.openTickets > 0)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  }

  /** Jump to the Summary view (used by the compact strip when no matching lever applies). */
  goToSummary(): void { this.view = 'summary'; }

  /** Summary-card click → switch to the Participants tab AND apply the matching lever (no drawer).
   *  Each Summary category maps to the lever that reproduces exactly that set on the Participants
   *  table. 'paymentsLocked' has no lever — it uses the existing finance filter instead. */
  /** Carry the summary filter (lifecycle + selected journeys) onto the Participants table so a KPI
   *  click lands on the already-scoped list — no re-filtering. Reuses the existing base-list filters
   *  (journeyGroupFilter already matches an arbitrary set of journey names). */
  private carrySummaryFilterToBase(): void {
    const lc = this.sumLifecycle();
    this.lifecycleFilter = lc === 'all' ? '' : lc;
    this.journeyFilter = '';
    this.journeyGroupFilter = [...this.sumJourneys()];
  }

  goToParticipantsWithLever(lever: Lever): void {
    this.statusFilter = '';
    this.financeFilters = [];
    this.carrySummaryFilterToBase();   // keep the current summary filter on the list
    this.view = 'base';
    this.setLever(lever);
  }

  /** Summary "Assigned to me" status band → Participants tab filtered to one lifecycle segment.
   *  Toggling the same segment clears it. Discontinued reveals the normally-gated inactive rows. */
  goToStatus(kind: 'active' | 'nonactive' | 'discontinued'): void {
    this.statusFilter = '';
    this.financeFilters = [];
    this.activeLever = 'all';
    this.lifecycleFilter = this.lifecycleFilter === kind ? '' : kind;
    this.view = 'base';
    this.applyFilters();
  }

  /** Summary "Unassigned" card → Participants tab scoped to the no-coach view, which renders the
   *  bulk select + assign-coach bar so a coach can be tagged onto them. */
  goToUnassigned(): void {
    this.view = 'base';
    void this.onCoachChange(this.UNASSIGNED);
  }

  /** Summary "Payments locked" card → Participants tab filtered to the existing 'locked' finance
   *  filter (there is no payments-locked lever; the finance filter is the real, existing path). */
  goToPaymentsLocked(): void {
    this.statusFilter = '';
    this.activeLever = 'all';
    this.carrySummaryFilterToBase();   // keep the current summary filter on the list
    this.view = 'base';
    this.financeFilters = ['locked'];
    this.applyFilters();
  }

  /** Build one coach card per coach, every stat traced to real loaded data (honest zeros otherwise).
   *  Caseload reuses the scoreboard's baseSize (distinct coachedby assignments); the action stats are
   *  grouped from the currently-loaded base rows by coach name; Handled today = touchpoints this coach
   *  logged today (from the already-loaded touchpoint data). Coaches with no assigned base are dropped
   *  so the view never invents coaches or numbers. */
  coachCards = computed<CoachCard[]>(() => {
    const todayStart = this.startOfDay(new Date()).getTime();
    const todayEnd = this.endOfDay(new Date()).getTime();
    // group the loaded base rows by coach name (computeRows resolves coachname from coachedby)
    const rowsByCoach = new Map<string, PortfolioRow[]>();
    for (const r of this.allRows()) {
      const list = rowsByCoach.get(r.coachname) ?? [];
      list.push(r);
      rowsByCoach.set(r.coachname, list);
    }
    // touchpoints logged TODAY, counted per coach from the already-loaded raw touchpoints
    const handledByCoach: Record<string, number> = {};
    for (const tp of this.allTouchpoints) {
      if (!tp.coachid || !tp.date) continue;
      const t = tp.date.getTime();
      if (t < todayStart || t > todayEnd) continue;
      handledByCoach[tp.coachid] = (handledByCoach[tp.coachid] ?? 0) + 1;
    }
    // scoreboard baseSize (distinct coachedby) when computed — the authoritative caseload
    const baseByScoreboard: Record<string, number> = {};
    for (const sb of this.scoreboard()) baseByScoreboard[sb.coachId] = sb.baseSize;

    const cards: CoachCard[] = [];
    for (const c of this.coaches) {
      const rows = rowsByCoach.get(c.name) ?? [];
      const caseload = baseByScoreboard[c.id] ?? rows.length;
      const needToday = rows.filter(r => r.goingQuiet || r.lapsed || r.notStarted || r.renewalWindow || r.openTickets > 0).length;
      const goingQuiet = rows.filter(r => r.goingQuiet).length;
      const flagged = rows.filter(r => r.flagged).length;
      const handled = handledByCoach[c.id] ?? 0;
      // only surface coaches with an actual base (assignments OR loaded rows) — never invent coaches
      if (caseload === 0 && rows.length === 0) continue;
      cards.push({
        coachId: c.id, coachName: c.name, caseload, needToday, goingQuiet, flagged, handled,
        queue: this.topQueueForCoach(c.id),
      });
    }
    return cards;
  });

  /** Progress-bar fill for a coach card: handled / needToday, clamped 0..100 (0 when nothing due). */
  handledPct(card: CoachCard): number {
    if (card.needToday <= 0) return card.handled > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round(card.handled / card.needToday * 100)));
  }

  /** Coaches view card expand/collapse (mirrors the mockup's tap-to-reveal top-of-queue). */
  expandedCoachIds = new Set<string>();
  toggleCoachCard(coachId: string): void {
    if (this.expandedCoachIds.has(coachId)) this.expandedCoachIds.delete(coachId);
    else this.expandedCoachIds.add(coachId);
  }

  onRangeChange(): void {
    if (this.view === 'scoreboard') this.computeScoreboard();
  }

  // ---- Today's Worklist (read-only triage queue over dataSource.data) ----
  // dataSource.data is already filtered and in priority order; the worklist is just a
  // capped, card-based presentation of the top of that same queue. No extra loading.
  worklistRows(): PortfolioRow[] {
    return this.dataSource.data.slice(0, this.worklistLimit);
  }
  worklistTotal(): number {
    return this.dataSource.data.length;
  }
  showMoreWorklist(): void {
    this.worklistLimit = Math.min(this.worklistLimit + 25, this.dataSource.data.length);
  }

  /** Period toggle: week / month set the range from a cadence preset; custom reveals the pickers. */
  setPeriod(p: 'week' | 'month' | 'custom'): void {
    if (!p) return; // mat-button-toggle can emit null on deselect; ignore
    this.period = p;
    if (p === 'week') {
      this.rangeFrom = this.startOfWeek(new Date());
      this.rangeTo = new Date();
    } else if (p === 'month') {
      this.rangeFrom = this.startOfMonth(new Date());
      this.rangeTo = new Date();
    }
    if (this.view === 'scoreboard') this.computeScoreboard();
  }

  /** True if a touchpoint counts as real contact (matches logCall's contact rule). */
  private isRealContact(tp: { outcome: string | null; contacted: boolean }): boolean {
    return tp.contacted === true || tp.outcome === 'reached' || tp.outcome === 'scheduled';
  }

  /** Latest coach-contact timestamp for a participant (same signals as computeRows). */
  private lastTouchMs(profileid: string): number | null {
    const derived = this.toDate(this.profileMap.docdata?.[profileid]?.['lastjourneycoachdate']);
    const candidates = [
      derived ? derived.getTime() : null,
      this.contactEventByProfile[profileid] ?? null,
      this.touchpointByProfile[profileid] ?? null,
    ].filter((v): v is number => v != null);
    return candidates.length ? Math.max(...candidates) : null;
  }

  /** Build the leaderboard across all coaches for the selected [rangeFrom, rangeTo]. */
  computeScoreboard(): void {
    const now = Date.now();
    // normalize range to whole-day bounds (inclusive of the 'to' day)
    const from = this.rangeFrom ? this.startOfDay(this.rangeFrom).getTime() : 0;
    const to = this.rangeTo ? this.endOfDay(this.rangeTo).getTime() : now;

    // base size + current going-quiet are computed from current assignments (coachedby)
    const baseByCoach: Record<string, Set<string>> = {};
    const quietByCoach: Record<string, number> = {};
    for (const c of this.coaches) { baseByCoach[c.id] = new Set(); quietByCoach[c.id] = 0; }

    // distinct participant -> coach (first matching assignment), so quiet is counted once per person
    const seen = new Set<string>();
    for (const d of this.sbPjp) {
      const pid = d['profileid'];
      if (!pid) continue;
      for (const c of this.coaches) {
        if (!this.isMine(d['coachedby'], c.id)) continue;
        baseByCoach[c.id].add(pid);
        const key = c.id + '|' + pid;
        if (!seen.has(key)) {
          seen.add(key);
          const lt = this.lastTouchMs(pid);
          const daysSince = lt != null ? Math.floor((now - lt) / 86400000) : null;
          if (daysSince == null || daysSince > this.QUIET_DAYS) quietByCoach[c.id]++;
        }
      }
    }

    // touchpoints + distinct real contacts + reached-call volume within range, per coach
    const touchByCoach: Record<string, number> = {};
    const reachedByCoach: Record<string, number> = {};
    const contactedByCoach: Record<string, Set<string>> = {};
    for (const c of this.coaches) { touchByCoach[c.id] = 0; reachedByCoach[c.id] = 0; contactedByCoach[c.id] = new Set(); }
    for (const tp of this.allTouchpoints) {
      if (!tp.coachid || !(tp.coachid in touchByCoach)) continue;
      if (!tp.date) continue;
      const t = tp.date.getTime();
      if (t < from || t > to) continue;
      touchByCoach[tp.coachid]++;
      if (this.isRealContact(tp)) {
        reachedByCoach[tp.coachid]++;
        contactedByCoach[tp.coachid].add(tp.profileid);
      }
    }

    const rows: ScoreboardRow[] = this.coaches.map(c => {
      const baseSize = baseByCoach[c.id].size;
      const touchpoints = touchByCoach[c.id];
      const reachedTouches = reachedByCoach[c.id];
      const contacted = contactedByCoach[c.id].size;
      const goingQuiet = quietByCoach[c.id];
      const coverage = baseSize > 0 ? contacted / baseSize : 0;
      const qualityRate = touchpoints > 0 ? reachedTouches / touchpoints : 0;
      const quietFree = 1 - goingQuiet / Math.max(baseSize, 1);
      const onTarget = baseSize > 0 && coverage >= this.COVERAGE_TARGET;
      const score =
        coverage * this.W_COVERAGE +
        qualityRate * this.W_QUALITY +
        quietFree * this.W_QUIET;
      const engagementScore = Math.max(0, Math.min(100, Math.round(score)));
      return { coachId: c.id, coachName: c.name, baseSize, touchpoints, contacted, coverage, reachedTouches, qualityRate, goingQuiet, onTarget, engagementScore, rank: 0 };
    });

    rows.sort((a, b) => b.engagementScore - a.engagementScore || b.coverage - a.coverage || a.coachName.localeCompare(b.coachName));
    rows.forEach((r, i) => r.rank = i + 1);
    this.scoreboard.set(rows);
    this.scoreboardComputed = true;
  }

  rankClass(rank: number): string {
    return rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-n';
  }

  private startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
  /** Monday 00:00 of the ISO week containing d (Sunday treated as end of the prior week). */
  private startOfWeek(d: Date): Date {
    const day = d.getDay();              // 0=Sun..6=Sat
    const diff = (day + 6) % 7;          // days since most recent Monday
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff, 0, 0, 0, 0);
  }
  private startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
  private endOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

  async onCoachChange(id: string): Promise<void> {
    this.selectedCoachId = id;
    this.activeLever = 'all';
    this.assignTargetCoachId = '';
    // scope changed → reset the summary filter to its default (Active, no journey).
    this.sumLifecycle.set('active');
    this.sumJourneys.set(new Set());
    this.journeyMenuOpen = false;
    this.pagedMode = this.isPagedView(id);
    this.applyPaginatorBinding();
    this.loadProgress = 0;
    this.setProgress(25, 'Switching view…');
    if (this.pagedMode) {
      // paged mode keys coach-set health by profileid globally — ensure the full map is present
      // (it may not be if the dashboard first opened on a specific coach, which scopes health)
      if (!this.coachHealthFullLoaded) await this.loadCoachHealthStates();
      // build the heavy full-base index in the BACKGROUND; paint page 1 (+ cheap counts) first
      const indexP = this.ensureFullIndex();
      const first: Promise<any>[] = [this.loadFirstPage()];
      if (!this.serverCountsReady) first.push(this.loadServerCounts());
      await Promise.all(first);
      this.setProgress(60, 'First page ready · finalizing base…');
      indexP.then(() => this.onFullIndexReady()).catch(() => {});
    } else {
      // a specific coach needs its full base (global priority sort + accurate KPIs); the pjp
      // collection is cached, but the dependent joins must be (re)loaded SCOPED to this coach.
      if (this.paginator) this.paginator.firstPage();
      if (this.fullPjpData) {
        this.pjpData = this.fullPjpData;
        this.setProgress(55, 'Loading details…');
        await this.loadFullDependentsForBase();
        this.computeRows();
        this.setProgress(100, 'Ready');
      } else {
        await this.loadFullPortfolio();
      }
    }
  }

  /** Map a KPI card key to its lever. 'total' resets the board to 'all'. */
  private kpiLever(which: 'total' | 'active' | 'inactive' | 'renewalsSoon' | 'goingQuiet' | 'tickets' | 'flagged'): Lever {
    switch (which) {
      case 'active': return 'active';
      case 'inactive': return 'inactive';
      case 'renewalsSoon': return 'renewalWindow';
      case 'goingQuiet': return 'goingQuiet';
      case 'tickets': return 'tickets';
      case 'flagged': return 'flagged';
      default: return 'all';
    }
  }

  /** Clickable KPI cards -> toggle the relevant lever (click again to clear back to 'all'). */
  kpi(which: 'total' | 'active' | 'inactive' | 'renewalsSoon' | 'goingQuiet' | 'tickets' | 'flagged'): void {
    this.statusFilter = '';
    this.financeFilters = [];   // KPI cards are ONE mutually-exclusive group — clear the finance
                                // (Payments-locked) filter so it can't stack with a lever card.
    const target = this.kpiLever(which);
    this.setLever(this.activeLever === target ? 'all' : target);
  }

  /** Whether a given KPI card's lever is the currently active one (drives the selected highlight). */
  kpiActive(which: 'total' | 'active' | 'inactive' | 'renewalsSoon' | 'goingQuiet' | 'tickets' | 'flagged'): boolean {
    return this.activeLever === this.kpiLever(which);
  }

  exportCsv(): void {
    const q = (v: any) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
    const headers = ['Priority', 'Band', 'Participant', 'Number', 'Coach', 'Reason', 'Journey', 'Tier',
      'Status', 'Financial', 'Renewal', 'DaysToRenewal', 'LastTouch', 'DaysSinceTouch', 'OpenTickets'];
    const lines = [headers.join(',')];
    for (const r of this.dataSource.data) {
      lines.push([
        r.priority, r.priorityBand, q(r.name), q(r.number), q(r.coachname), q(r.reason), q(r.journeyname),
        q(r.atcmodel), q(r.customerstatus), q(r.financialstatus), this.fmtDate(r.subscriptionend),
        r.daysToRenewal ?? '', this.fmtDate(r.lastcoachdate), r.daysSinceCoach ?? '', r.openTickets,
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `base-${(this.selectedCoachName || 'export').replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private coachNameFor(coachedby: any): string {
    let id: string | null = null;
    if (Array.isArray(coachedby)) {
      const first = coachedby[0];
      id = first ? (typeof first === 'string' ? first : first?.id) : null;
    } else if (typeof coachedby === 'string') {
      id = coachedby;
    } else {
      id = coachedby?.id ?? null;
    }
    return id ? (this.profileMap.map?.[id] ?? '—') : '—';
  }

  private isMine(coachedby: any, coachId: string): boolean {
    if (!coachId || coachedby == null) return false;
    if (typeof coachedby === 'string') return coachedby === coachId;
    if (Array.isArray(coachedby)) {
      return coachedby.some((x: any) => (typeof x === 'string' ? x : x?.id) === coachId);
    }
    return (coachedby?.id ?? null) === coachId;
  }

  private isUnassigned(coachedby: any): boolean {
    if (coachedby == null) return true;
    if (typeof coachedby === 'string') return coachedby.trim() === '';
    if (Array.isArray(coachedby)) return coachedby.length === 0 || coachedby.every((x: any) => x == null);
    return false; // a single ref object means assigned
  }

  // ---- Phase B: selection + bulk assign ----
  // Selection is PERSISTENT: it survives search / filter / paging (computeRows no longer clears it).
  // selectedMeta mirrors selectedProfiles with display names so the tray can show off-page picks.
  isSelected(id: string): boolean { return this.selectedProfiles.has(id); }
  toggleSelect(id: string, name?: string): void {
    if (this.selectedProfiles.has(id)) {
      this.selectedProfiles.delete(id);
      this.selectedMeta.delete(id);
    } else {
      this.selectedProfiles.add(id);
      this.selectedMeta.set(id, name ?? this.nameForProfile(id) ?? id);
    }
  }
  get allVisibleSelected(): boolean {
    const rows = this.dataSource.data;
    return rows.length > 0 && rows.every(r => this.selectedProfiles.has(r.profileid));
  }
  toggleSelectAll(): void {
    const rows = this.dataSource.data;
    if (this.allVisibleSelected) {
      rows.forEach(r => { this.selectedProfiles.delete(r.profileid); this.selectedMeta.delete(r.profileid); });
    } else {
      rows.forEach(r => { this.selectedProfiles.add(r.profileid); this.selectedMeta.set(r.profileid, r.name); });
    }
  }
  get selectedCount(): number { return this.selectedProfiles.size; }

  /** Selection tray rows (id + name) in name order — reads from selectedMeta so off-page picks show. */
  get selectedTray(): { id: string; name: string }[] {
    return Array.from(this.selectedMeta.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));
  }

  /** Remove one participant from the selection (tray chip ✕). */
  deselect(id: string): void {
    this.selectedProfiles.delete(id);
    this.selectedMeta.delete(id);
  }

  /** Clear the entire selection (tray "Clear all" + after a successful assign). */
  clearSelection(): void {
    this.selectedProfiles.clear();
    this.selectedMeta.clear();
  }

  /** Best-effort display name for a profileid from the loaded maps (for tray chips of off-page picks). */
  private nameForProfile(id: string): string | null {
    return this.profileMap.map?.[id] ?? this.metaMap.docdata?.[id]?.['name'] ?? null;
  }

  /** Bulk-assign the selected unassigned participants to a coach — writes real coachedby. */
  /** Coach assignment lives on the participant's SINGLE `participant metadata` doc (id == profileid),
   *  NOT on the per-journey-product docs. Stamp it onto each loaded pjp row from the meta map so every
   *  downstream read of d['coachedby'] (filters / computeRows / scoreboard) keeps working unchanged. */
  private stampCoachedBy(rows: any[]): any[] {
    for (const d of rows) {
      d['coachedby'] = this.metaMap?.docdata?.[d['profileid']]?.['coachedby'] ?? null;
    }
    return rows;
  }

  /** Write `value` (array) to coachedby on the participant's `participant metadata` doc (id ==
   *  profileid) — one write per participant, regardless of how many journey-products they have.
   *  Reflects locally on the meta map (the authoritative read source) + any loaded pjp rows so the
   *  board updates immediately. Returns 0 on success, 1 on failure (callers check `fail > 0`). */
  private async writeCoachForProfile(profileid: string, value: any[]): Promise<number> {
    if (!profileid) return 1;
    try {
      // merge so we never clobber the rest of the metadata doc (and create it if somehow absent).
      await setDoc(doc(this.firestore, 'participant metadata', profileid), { coachedby: value }, { merge: true });
    } catch (e) {
      console.error('assign: could not write coachedby for', profileid, e);
      return 1;
    }
    // reflect locally: meta map first (read source), then any loaded pjp rows stamped from it.
    if (this.metaMap?.docdata?.[profileid]) this.metaMap.docdata[profileid]['coachedby'] = value;
    for (const d of this.pjpData) { if (d['profileid'] === profileid) d['coachedby'] = value; }
    if (this.fullPjpData && this.fullPjpData !== this.pjpData) {
      for (const d of this.fullPjpData) { if (d['profileid'] === profileid) d['coachedby'] = value; }
    }
    return 0;
  }

  async assignSelected(): Promise<void> {
    if (!this.assignTargetCoachId || this.selectedProfiles.size === 0) return;
    this.assigning = true;
    const targetCoachId = this.assignTargetCoachId;
    const coachRef = doc(this.firestore, 'profile_data', targetCoachId);
    const targetCoachName = this.coaches.find(c => c.id === targetCoachId)?.name ?? targetCoachId;
    const rowsById = new Map(this.allRows().map(r => [r.profileid, r]));
    const ids = Array.from(this.selectedProfiles);
    const failed = new Set<string>();
    // Write coachedby to EVERY pjp doc of each participant (queried by profileid, not the loaded
    // page) so the assignment is complete and survives a refresh — including selections made on
    // earlier pages/searches that aren't in allRows. Run in small parallel chunks.
    for (let i = 0; i < ids.length; i += 8) {
      await Promise.all(ids.slice(i, i + 8).map(async pid => {
        const fail = await this.writeCoachForProfile(pid, [coachRef]);
        if (fail > 0) { failed.add(pid); return; }
        const row = rowsById.get(pid);
        const fromCoachName = row && row.coachname && row.coachname !== '—' ? row.coachname : null;
        const fromCoachId = this.coaches.find(c => c.name === fromCoachName)?.id ?? null;
        if (row) row.coachname = targetCoachName;
        void this.logActivity(pid, 'coach_change', {
          action: fromCoachName ? 'reassign' : 'assign',
          fromCoachId, fromCoachName, toCoachId: targetCoachId, toCoachName: targetCoachName, note: '',
        });
      }));
    }
    this.assigning = false;
    const okCount = ids.length - failed.size;
    this.guard.openSnackBar(
      `Assigned ${okCount} participant(s) to ${targetCoachName}${failed.size ? ` — ${failed.size} failed (permission denied?)` : ''}`,
      'Close', 5000);
    const unassignedProfiles = new Set<string>();
    for (const d of this.pjpData) {
      if (d['profileid'] && this.isUnassigned(d['coachedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;
    this.assignTargetCoachId = '';
    // clear ONLY the participants we actually assigned; any that failed stay selected for retry.
    for (const pid of ids) { if (!failed.has(pid)) this.deselect(pid); }
    this.computeRows();
  }

  private computeSummary(): void {
    // allRows is already per-distinct-participant. Active/Inactive are SUBSCRIPTION-based
    // (subActive), NOT customerstatus (empty on pjp — the prior bug). Total = distinct participants.
    const s = { total: 0, active: 0, inactive: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0, paymentsLocked: 0, discontinued: 0, nonActive: 0 };
    // Band (lifecycle split) reflects the JOURNEY filter only, so all three segments stay visible and
    // switchable even while one is selected as the active lifecycle filter.
    for (const r of this.journeyFilteredRows()) {
      s.total++;
      if (r.subActive) s.active++; else s.inactive++;
      // 3-way lifecycle split for the "Assigned to me" band (discontinued wins over active/non-active):
      // Discontinued = customerstatus late/discontinued/banned; Non-active = subscription ended, not discontinued.
      if (this.isInactiveStatus(r.customerstatus)) s.discontinued++;
      else if (!r.subActive) s.nonActive++;
    }
    // Lever counts reflect BOTH filters (lifecycle + journey) — the fully-scoped subset.
    for (const r of this.filteredRows()) {
      if (r.renewalWindow) s.renewalsSoon++;
      if (r.lapsed) s.lapsed++;
      if (r.openTickets > 0) s.withOpenTickets++;
      if (r.goingQuiet) s.goingQuiet++;
      if (r.notStarted) s.notStarted++;
      // Payments locked: rows whose financialstatus is the 'locked' token (same token the
      // priority/action logic keys off — see scoreRow / actionFor). New count for the Summary view.
      if ((r.financialstatus ?? '').toLowerCase() === 'locked') s.paymentsLocked++;
    }
    this.summary = s;
  }

  applyFilters(): void {
    // In paged mode, recompute the full-base match set so search + filters + the ecosystem default
    // cover EVERYONE (not just the loaded page). In full mode allRows is already the full base.
    if (this.pagedMode) this.recomputeFullBaseMatch();
    // Indexed pagination: once the lite index is built, paginate over the MATCHED set so a filter
    // pages through ALL matches (not just the loaded page). suppressPagedRender breaks the
    // computeRows→applyFilters re-entry while a matched page is being built.
    if (this.pagedMode && this.fullIndexBuilt && !this.suppressPagedRender) {
      this.matchedIds = this.sortedMatchedIds();
      this.pageLength = this.matchedIds.length;
      this.currentPage = 0;
      if (this.paginator) this.paginator.firstPage();
      void this.renderMatchedPage();
      return;
    }
    this.dataSource.data = this.allRows().filter(r => this.rowMatches(r));
    // the visible rows just changed — drop the keyboard highlight so it never points at a stale row
    this.focusedRowIndex = -1;
  }

  /** Matched profileids (full-base filter result) in a stable display order (by name). */
  private sortedMatchedIds(): string[] {
    const set = this.fullBaseMatchIds;
    if (!set) return [];
    return this.fullIndex
      .filter(l => set.has(l.profileid))
      .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()))
      .map(l => l.profileid);
  }

  /** Render one page of the matched set: slice the ids, load that page's joins, build the rows.
   *  Summary is NOT touched here — it stays base-wide from the index/server counts. */
  private async renderMatchedPage(): Promise<void> {
    this.pageLoading = true;
    try {
      const start = this.currentPage * this.pageSize;
      const slice = this.matchedIds.slice(start, start + this.pageSize);
      const sliceSet = new Set(slice);
      await Promise.all([
        this.loadOpenTicketCountsFor(slice),
        this.loadTouchpointsFor(slice),
        this.loadContactEventsFor(slice),
        this.loadRecentEventRequestsFor(slice),
        this.loadCoachHealthStatesFor(slice),
      ]);
      const pjpForPage = (this.fullPjpData ?? []).filter(d => sliceSet.has(d['profileid']));
      this.suppressPagedRender = true;
      this.pjpData = pjpForPage;
      this.computeRows();   // builds allRows for this page; applyFilters (suppressed) sets dataSource.data
      this.suppressPagedRender = false;
      this.pageLength = this.matchedIds.length;
      this.loadedRowCount = this.matchedIds.length;
    } finally {
      this.pageLoading = false;
    }
  }

  /** Full per-row predicate: levers + journey/status + search + the intelligent filter panel.
   *  In paged mode rows also have to be in the full-base match set (so off-page filtering counts). */
  private rowMatches(r: PortfolioRow): boolean {
    const term = this.search.trim().toLowerCase();
    const wantInactive = this.activeLever === 'inactive';
    // Active/Inactive are SUBSCRIPTION-based: by default the board shows only subActive participants
    // (those with a live subscription); the Inactive lever flips it to show only !subActive.
    // The Lapsed / Not-started levers target lifecycle segments that legitimately include
    // non-subActive people, so they bypass the default subActive gate.
    // needs-attention spans lifecycle segments (lapsed / not-started) that legitimately include
    // non-subActive people, so it bypasses the default subActive gate (same as lapsed / not-started).
    const bypassActiveGate = this.activeLever === 'lapsed' || this.activeLever === 'notStarted'
      || this.activeLever === 'flagged' || this.activeLever === 'needsAttention'
      // the status-band Non-active / Discontinued segments legitimately show non-subActive people
      || this.lifecycleFilter === 'nonactive' || this.lifecycleFilter === 'discontinued'
      // journey filter shows the WHOLE journey cohort (all lifecycle states), matching the split count
      || !!this.journeyFilter || this.journeyGroupFilter.length > 0;
    if (!bypassActiveGate && r.subActive === wantInactive) return false;
    // "Assigned to me" status band segments (discontinued wins over active/non-active)
    if (this.lifecycleFilter === 'discontinued' && !this.isInactiveStatus(r.customerstatus)) return false;
    if (this.lifecycleFilter === 'active' && !(r.subActive && !this.isInactiveStatus(r.customerstatus))) return false;
    if (this.lifecycleFilter === 'nonactive' && !(!r.subActive && !this.isInactiveStatus(r.customerstatus))) return false;
    // needsAttention: SAME predicate as needsAttentionRows() (goingQuiet | lapsed | notStarted |
    // renewalWindow | openTickets>0). No new scoring — reuses the existing per-row flags.
    if (this.activeLever === 'needsAttention'
      && (!(r.goingQuiet || r.lapsed || r.notStarted || r.renewalWindow || r.openTickets > 0) || this.isAddressed(r))) return false;
    if (this.activeLever === 'flagged' && !r.flagged) return false;
    if (this.activeLever === 'goingQuiet' && !r.goingQuiet) return false;
    if (this.activeLever === 'renewalWindow' && !r.renewalWindow) return false;
    if (this.activeLever === 'lapsed' && !r.lapsed) return false;
    if (this.activeLever === 'notStarted' && !r.notStarted) return false;
    if (this.activeLever === 'active' && !r.subActive) return false;
    if (this.activeLever === 'tickets' && !(r.openTickets > 0)) return false;
    if (this.journeyFilter && r.journeyname !== this.journeyFilter) return false;
    if (this.journeyGroupFilter.length && !this.journeyGroupFilter.includes(r.journeyname)) return false;
    if (this.statusFilter && (r.customerstatus ?? '') !== this.statusFilter) return false;
    if (term && !(`${r.name} ${r.number ?? ''}`.toLowerCase().includes(term))) return false;
    // --- intelligent filter panel ---
    if (this.productTypeFilters.length && !this.productTypeFilters.includes(r.productType)) return false;
    if (this.tierFilters.length && !this.tierFilters.includes(r.atcmodel ?? '')) return false;
    if (this.bandFilters.length && !this.bandFilters.includes(r.priorityBand)) return false;
    if (this.healthFilters.length) {
      const st = r.coachHealthState?.state;
      // a row matches if its state is selected, or 'Not assessed' is selected and it has no fresh state
      if (!(st ? this.healthFilters.includes(st) : this.healthFilters.includes('UNASSESSED'))) return false;
    }
    if (this.financeFilters.length && !this.financeFilters.includes(r.financialstatus ?? '')) return false;
    if (this.renewalWindowOnly && !r.renewalWindow) return false;
    if (this.goingQuietOnly && !r.goingQuiet) return false;
    if (this.noEventRequestOnly && r.recentEventRequest) return false;
    // paged mode: only rows whose lightweight full-base entry also matches the index-level filters
    if (this.pagedMode && this.fullBaseMatchIds && !this.fullBaseMatchIds.has(r.profileid)) return false;
    return true;
  }

  /** Lightweight predicate over the full-base index. Only covers the filters that can be evaluated
   *  WITHOUT the heavy dependent data: scope (coach/unassigned), search, product type, tier,
   *  customerstatus, financial status. Band / health / renewal-window / going-quiet need per-row
   *  dependent data and stay page-local refinements (see report tradeoff). */
  private liteMatches(lite: LiteIndexRow): boolean {
    const term = this.search.trim().toLowerCase();
    const wantInactive = this.activeLever === 'inactive';
    // scope to the current view (ALL = everyone; UNASSIGNED = no coach)
    if (this.selectedCoachId === this.UNASSIGNED) {
      if (!this.isUnassigned(lite.coachedby)) return false;
    }
    // subscription-based active/inactive (same as rowMatches): default board = subActive only.
    // Lapsed / Not-started levers are page-local lifecycle segments that legitimately include
    // non-subActive people, so they bypass the default subActive gate here too.
    const bypassActiveGate = this.activeLever === 'lapsed' || this.activeLever === 'notStarted'
      || this.activeLever === 'flagged' || this.activeLever === 'needsAttention'
      || this.lifecycleFilter === 'nonactive' || this.lifecycleFilter === 'discontinued'
      || !!this.journeyFilter;
    if (!bypassActiveGate && lite.subActive === wantInactive) return false;
    // "Assigned to me" status band segments (base-wide via the lite index)
    if (this.lifecycleFilter === 'discontinued' && !this.isInactiveStatus(lite.customerstatus)) return false;
    if (this.lifecycleFilter === 'active' && !(lite.subActive && !this.isInactiveStatus(lite.customerstatus))) return false;
    if (this.lifecycleFilter === 'nonactive' && !(!lite.subActive && !this.isInactiveStatus(lite.customerstatus))) return false;
    // flags are a base-wide global Set, so the flagged filter covers the WHOLE base in paged mode.
    if (this.activeLever === 'flagged' && !this.flaggedIds().has(lite.profileid)) return false;
    if (this.activeLever === 'active' && !lite.subActive) return false;
    if (this.journeyFilter && lite.journeyname !== this.journeyFilter) return false;
    if (this.journeyGroupFilter.length && !this.journeyGroupFilter.includes(lite.journeyname)) return false;
    if (this.statusFilter && (lite.customerstatus ?? '') !== this.statusFilter) return false;
    if (term && !(`${lite.name} ${lite.number ?? ''}`.toLowerCase().includes(term))) return false;
    if (this.productTypeFilters.length && !this.productTypeFilters.includes(lite.productType)) return false;
    if (this.tierFilters.length && !this.tierFilters.includes(lite.atcmodel ?? '')) return false;
    if (this.financeFilters.length && !this.financeFilters.includes(lite.financialstatus ?? '')) return false;
    // renewal window + open-tickets lever filter the FULL base (computed in the lite index)
    if (this.renewalWindowOnly && !lite.renewalWindow) return false;
    if (this.activeLever === 'tickets' && !(lite.openTickets > 0)) return false;
    if (this.activeLever === 'renewalWindow' && !lite.renewalWindow) return false;
    // lifecycle levers — lapsed / not-started come straight from the lite index.
    if (this.activeLever === 'lapsed' && !lite.lapsed) return false;
    if (this.activeLever === 'notStarted' && !lite.notStarted) return false;
    // going-quiet / needs-attention need touchpoint+appointment data. Once it has loaded (lite.goingQuiet
    // is populated), scope the matched set base-wide; before that, fall through (page-local refine).
    if (this.contactDataLoaded()) {
      if (this.activeLever === 'goingQuiet' && !lite.goingQuiet) return false;
      if (this.goingQuietOnly && !lite.goingQuiet) return false;
      if (this.activeLever === 'needsAttention'
        && !(lite.goingQuiet || lite.lapsed || lite.notStarted || lite.renewalWindow || lite.openTickets > 0)) return false;
    }
    return true;
  }

  /** Rebuild fullBaseMatchIds from the lightweight index (paged mode only). */
  private recomputeFullBaseMatch(): void {
    if (!this.fullIndexBuilt) { this.fullBaseMatchIds = null; return; }
    const ids = new Set<string>();
    for (const lite of this.fullIndex) {
      if (this.liteMatches(lite)) ids.add(lite.profileid);
    }
    this.fullBaseMatchIds = ids;
  }

  /** Build the lightweight full-base index once (paged mode), reducing the cached full pjp data to
   *  just the searchable/filterable fields via the already-loaded profile / meta / journey maps.
   *  Reuses fullPjpData when present (cached by a prior full load / scoreboard); otherwise reads the
   *  pjp collection ONCE. Does NOT touch the heavy collections (touchpoints / appointments / events).*/
  private async ensureFullIndex(): Promise<void> {
    if (this.fullIndexBuilt) return;
    let pjp = this.fullPjpData;
    if (!pjp) {
      const snap = await getDocs(query(
        collection(this.firestore, 'participantjourneyproduct'),
        where('journeystatus', 'in', this.CURRENT_JOURNEY_STATUSES),
      ));
      pjp = this.stampCoachedBy(snap.docs.map(d => ({ ...d.data(), __id: d.id })));
      this.fullPjpData = pjp;
    }
    // base-wide open-ticket counts: ONE clientissue read (cached), so renewal/tickets can be
    // evaluated across the whole base — not just the loaded page.
    const openByProfile = await this.ensureFullBaseOpenTickets();
    const now = Date.now();
    // one lite row per distinct participant (keep the highest-signal product type if a person has
    // several journey-products: ecosystem ranks above dfu above gifts above other).
    const rank: Record<ProductType, number> = { ecosystem: 3, dfu: 2, gifts: 1, other: 0 };
    const byProfile = new Map<string, LiteIndexRow>();
    const finance = new Set<string>();
    for (const d of pjp) {
      const profileid = d['profileid'];
      if (!profileid) continue;
      const meta: any = this.metaMap.docdata?.[profileid] ?? {};
      const journeyId = d['journeyref']?.id ?? null;
      const productType: ProductType = journeyId ? (this.typeByJourney[journeyId] ?? 'other') : 'other';
      const fin = meta['financialstatus'] ?? null;
      if (fin) finance.add(fin);
      // renewal window: SAME logic as computeRows — subscriptionend from the PJP doc ONLY (no meta fallback).
      const subEnd = this.toDate(d['subscriptionend']);
      const daysToRenewal = subEnd ? Math.floor((subEnd.getTime() - now) / 86400000) : null;
      const renewalWindow = daysToRenewal != null && daysToRenewal >= 0 && daysToRenewal <= this.RENEWAL_DAYS;
      // subscription-based active: this pjp record's subscriptionend is in the future.
      const subActive = daysToRenewal != null && daysToRenewal >= 0;
      // lifecycle flags — SAME logic as computeRows, so base-wide Needs-Attention matches per-row.
      const lapsed = daysToRenewal != null && daysToRenewal < 0 && daysToRenewal >= -this.LAPSED_DAYS
        && !this.isInactiveStatus(meta['customerstatus']);
      const jstatus = d['journeystatus'];
      const notStarted = ['Initiated', 'initiated', null, undefined].includes(jstatus) && !!d['onboarded'];
      const lite: LiteIndexRow = {
        profileid,
        name: this.profileMap.map?.[profileid] ?? meta['name'] ?? profileid,
        number: this.profileMap.phonenumber?.[profileid] ?? null,
        coachedby: d['coachedby'] ?? null,
        journeyname: journeyId ? (this.journeyNameMap[journeyId] ?? journeyId) : (meta['activejourney'] ?? '-'),
        productType,
        atcmodel: journeyId ? (this.atcByJourney[journeyId] ?? null) : null,
        customerstatus: meta['customerstatus'] ?? null,
        financialstatus: fin,
        renewalWindow,
        subActive,
        openTickets: openByProfile[profileid] ?? 0,
        lapsed,
        notStarted,
        goingQuiet: false,   // computed later, once touchpoints/appointments load (B-in-the-background)
      };
      const existing = byProfile.get(profileid);
      if (!existing) { byProfile.set(profileid, lite); }
      else {
        // keep the strongest product type; a coachedby on either doc means assigned
        if (rank[productType] > rank[existing.productType]) existing.productType = productType;
        if (this.isUnassigned(existing.coachedby) && !this.isUnassigned(lite.coachedby)) existing.coachedby = lite.coachedby;
        // a participant matches a flag if ANY of their journey-products does (union across records)
        if (renewalWindow) existing.renewalWindow = true;
        if (subActive) existing.subActive = true;
        if (lapsed) existing.lapsed = true;
        if (notStarted) existing.notStarted = true;
      }
    }
    this.fullIndex = Array.from(byProfile.values());
    this.financeOptions = Array.from(finance).sort();
    // base-wide Open-tickets KPI count: distinct profiles with at least one open ticket
    this.fullBaseWithOpenTickets = this.fullIndex.reduce((n, l) => n + (l.openTickets > 0 ? 1 : 0), 0);
    this.fullIndexBuilt = true;
  }

  /** Full-base open-ticket counts via ONE read of the `clientissue` collection (cached for the
   *  session). A single collection scan is far cheaper than ~N/30 batched `in`-queries over a
   *  multi-thousand base, and clientissue reads are not rules-blocked. Returns profileid -> open
   *  count, using the SAME "open" criterion as the per-page loader (status.status === 'open'),
   *  keyed by clientid (which is the participant's profileid). */
  private async ensureFullBaseOpenTickets(): Promise<Record<string, number>> {
    if (this.fullBaseOpenTickets) return this.fullBaseOpenTickets;
    const counts: Record<string, number> = {};
    try {
      const snap = await getDocs(collection(this.firestore, 'clientissue'));
      snap.forEach(d => {
        const data: any = d.data();
        if ((data['status']?.status ?? '').toLowerCase() !== 'open') return;
        const cid = data['clientid'];
        const key = typeof cid === 'string' ? cid : cid?.id;
        if (key) counts[key] = (counts[key] ?? 0) + 1;
      });
    } catch (e) { console.warn('full-base open tickets failed', e); }
    this.fullBaseOpenTickets = counts;
    return counts;
  }

  setLever(lever: Lever): void {
    this.activeLever = lever;
    this.applyFilters();
  }

  // ---- Panel "Journey" multi-select (chips): groups + individual journeys, toggled into
  //      journeyGroupFilter (the base-list multi-journey filter, honored in both views). ----
  /** A chip (journey or group) is on when every journey it represents is in the base-list filter. */
  baseJourneyOn(item: { journeys: string[] }): boolean {
    return item.journeys.length > 0 && item.journeys.every(j => this.journeyGroupFilter.includes(j));
  }
  /** Toggle a chip's journey(s) in the base-list journey filter. `null` clears them. Clears the
   *  search-bar single-select Journey so the two controls never intersect into an empty list. */
  toggleBaseJourney(item: { journeys: string[] } | null): void {
    let next = [...this.journeyGroupFilter];
    if (!item) next = [];
    else if (this.baseJourneyOn(item)) next = next.filter(j => !item.journeys.includes(j));
    else next = [...new Set([...next, ...item.journeys])];
    this.journeyGroupFilter = next;
    this.journeyFilter = '';   // guard: the panel multi-select wins over the search-bar single-select
    this.applyFilters();
  }
  /** Search-bar single-select Journey changed → clear the panel multi-select (guard the intersection). */
  onTopJourneyChange(): void {
    if (this.journeyFilter) this.journeyGroupFilter = [];
    this.applyFilters();
  }

  /** Clear every filter affordance (panel + journey/status/search + lever) and reset to defaults. */
  clearFilters(): void {
    this.search = '';
    this.journeyFilter = '';
    this.journeyGroupFilter = [];
    this.statusFilter = '';
    this.lifecycleFilter = '';
    this.activeLever = 'all';
    this.productTypeFilters = [];
    this.tierFilters = [];
    this.bandFilters = [];
    this.healthFilters = [];
    this.financeFilters = [];
    this.renewalWindowOnly = false;
    this.goingQuietOnly = false;
    this.noEventRequestOnly = false;
    this.applyFilters();
  }

  /** True when any filter differs from its default (drives the "Clear filters" affordance). */
  get hasActiveFilters(): boolean {
    return !!this.search || !!this.journeyFilter || this.journeyGroupFilter.length > 0 || !!this.statusFilter || !!this.lifecycleFilter || this.activeLever !== 'all'
      || this.productTypeFilters.length > 0 || this.tierFilters.length > 0 || this.bandFilters.length > 0
      || this.healthFilters.length > 0 || this.financeFilters.length > 0
      || this.renewalWindowOnly || this.goingQuietOnly || this.noEventRequestOnly;
  }

  /** True when a PAGE-LOCAL filter is active — priority band / coach-health / going-quiet.
   *  These need per-row dependent data (touchpoints not yet read base-wide) so they only refine the
   *  loaded pages (see liteMatches). Search / product type / tier / status / finance — and now
   *  renewal-window + open-tickets — cover the full base via the lite index, so they do NOT trigger
   *  the caveat. Drives the visible "filtering loaded pages only" caveat in paged (ALL/UNASSIGNED) mode. */
  get pageLocalFilterActive(): boolean {
    // band / health are never in the lite index → always page-local. Going-quiet / needs-attention
    // are page-local ONLY until the touchpoint+appointment data loads (then they're base-wide).
    return this.bandFilters.length > 0 || this.healthFilters.length > 0
      || (!this.contactDataLoaded() && (this.goingQuietOnly || this.activeLever === 'goingQuiet' || this.activeLever === 'needsAttention'));
  }

  /** One plain-English line describing who's in the list for the card you clicked. Shown next to
   *  the table. '' = nothing clicked, so no note. */
  get activeFilterNote(): string {
    if (this.financeFilters.includes('locked')) {
      return `Showing people whose payments are locked and need a finance follow-up.`;
    }
    switch (this.activeLever) {
      case 'tickets':
        return `Showing people who have an open support ticket. The card number counts every ticket, so someone with 3 tickets is counted 3 times — that's why it's higher than this list of people.`;
      case 'goingQuiet':
        return `Showing people you haven't been in contact with for ${this.QUIET_DAYS}+ days.`;
      case 'renewalWindow':
        return `Showing people whose plan is due to renew within the next 90 days.`;
      case 'needsAttention':
        return `Showing people who need a follow-up — going quiet, lapsed, not started, renewing soon, or with an open ticket.`;
      case 'flagged':
        return `Showing people that you or another coach starred.`;
      case 'lapsed':
        return `Showing people whose plan ended within the last ${this.LAPSED_DAYS} days.`;
      case 'notStarted':
        return `Showing people who signed up but haven't started their journey yet.`;
      case 'inactive':
        return `Showing people who don't have an active plan right now.`;
      case 'active':
        return `Showing people who have an active plan.`;
      default:
        return '';
    }
  }

  get selectedCoachName(): string {
    if (this.selectedCoachId === this.ALL) return 'All participants';
    if (this.selectedCoachId === this.UNASSIGNED) return 'Unassigned (no coach)';
    return this.coaches.find(c => c.id === this.selectedCoachId)?.name ?? this.coachName ?? '';
  }

  openProfile(row: PortfolioRow): void {
    this.router.navigate(['/userprofile', row.profileid]);
  }

  private toDate(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  private maxDate(a: Date | null, b: Date | null): Date | null {
    if (!a) return b;
    if (!b) return a;
    return a.getTime() >= b.getTime() ? a : b;
  }
  private num(v: any): number | null {
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  /** Outstanding balance = pp_totalpurchasevalue − pp_totalpaid (both from participant metadata).
   *  Null only when NEITHER field is present; otherwise the missing side counts as 0. */
  private balanceFor(meta: any): number | null {
    const total = this.num(meta?.['pp_totalpurchasevalue']);
    const paid = this.num(meta?.['pp_totalpaid']);
    if (total == null && paid == null) return null;
    return (total ?? 0) - (paid ?? 0);
  }
  fmtDate(v: Date | null): string {
    return v ? (this.datepipe.transform(v, 'dd-MMM-yyyy') ?? '-') : '-';
  }
  statusClass(s: string | null): string {
    const v = (s ?? '').toLowerCase();
    if (v === 'active') return 'chip-good';
    if (v === 'late') return 'chip-warn';
    if (v === 'discontinued' || v === 'banned') return 'chip-bad';
    return 'chip-neutral';
  }
  eventStatusClass(s: string | null): string {
    const v = (s ?? '').toLowerCase();
    if (v === 'approved' || v === 'attended') return 'chip-good';
    if (v === 'requested' || v === 'pending') return 'chip-warn';
    if (v === 'unattended' || v === 'rejected' || v === 'cancelled') return 'chip-bad';
    return 'chip-neutral';
  }
  bandClass(b: string): string {
    return b === 'High' ? 'pri-high' : b === 'Medium' ? 'pri-med' : 'pri-low';
  }

  // ===================== mockup Participants-table cell helpers =====================
  // Map the existing priority band to the mockup's label + dot/text colour class.
  // High → Urgent (red) · Medium → Watch (orange) · Low → Calm (gray). No invented values.

  /** Mockup priority label for a band: Urgent / Watch / Calm. */
  prioLabel(band: 'High' | 'Medium' | 'Low'): string {
    return band === 'High' ? 'Urgent' : band === 'Medium' ? 'Watch' : 'Calm';
  }
  /** Mockup priority class (drives dot colour + label tint): urgent / watch / calm. */
  prioClass(band: 'High' | 'Medium' | 'Low'): string {
    return band === 'High' ? 'urgent' : band === 'Medium' ? 'watch' : 'calm';
  }

  /** Mockup Status capsule label: subscription-active → Active, else Non-Active. */
  statusCapsuleLabel(r: PortfolioRow): string {
    return r.subActive ? 'Active' : 'Non-Active';
  }
  /** Mockup Status capsule colour class: Active green / Non-Active red. */
  statusCapsuleClass(r: PortfolioRow): string {
    return r.subActive ? 'cap-green' : 'cap-red';
  }

  /** Mockup Finance capsule label from financialstatus: Locked / Fully paid / Regular. */
  financeCapsuleLabel(r: PortfolioRow): string {
    const fin = (r.financialstatus ?? '').toLowerCase();
    if (fin === 'locked') return 'Locked';
    if (fin === 'fully paid' || fin === 'fullypaid' || fin === 'paid') return 'Fully paid';
    if (!fin) return '—';
    return r.financialstatus as string;
  }
  /** Mockup Finance capsule colour: Locked orange / Fully paid green / everything else gray. */
  financeCapsuleClass(r: PortfolioRow): string {
    const fin = (r.financialstatus ?? '').toLowerCase();
    if (fin === 'locked') return 'cap-orange';
    if (fin === 'fully paid' || fin === 'fullypaid' || fin === 'paid') return 'cap-green';
    return 'cap-gray';
  }

  /** Mockup renewal main date: "10 Jan 2027" style (em-dash when no subscription end). */
  renewalDate(r: PortfolioRow): string {
    return r.subscriptionend ? (this.datepipe.transform(r.subscriptionend, 'dd MMM yyyy') ?? '—') : '—';
  }
  /** Mockup renewal day-sub: "214d" (days to renewal), shown only when a future/known date exists. */
  renewalSub(r: PortfolioRow): string | null {
    return r.daysToRenewal != null ? `${r.daysToRenewal}d` : null;
  }

  /** Mockup last-touch text: "68d ago" — or a calm em-dash when never contacted. */
  lastTouchLabel(r: PortfolioRow): string {
    return r.daysSinceCoach != null ? `${r.daysSinceCoach}d ago` : '—';
  }
  stateClass(s: CoachHealthState | null): string {
    return coachHealthStateClass(s);
  }
}
