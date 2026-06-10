import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  Firestore, collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp,
  orderBy, startAfter, limit, documentId, getCountFromServer, QueryDocumentSnapshot
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
import { ParticipantSlideoverComponent } from './participant-slideover.component';

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
  renewalWindow: boolean;
  lapsed: boolean;
  notStarted: boolean;
  priority: number;
  priorityBand: 'High' | 'Medium' | 'Low';
  reason: string;
  pjpIds: string[];              // journey-product doc ids for this participant (for assignment writes)
  recentEventRequest: { eventName: string; date: Date | null; status: string } | null;
  // Coach-set Health State (manual coach assessment, separate from customerstatus)
  coachHealthState: { state: HealthState; note: string; date: Date | null } | null;
  // Phase-2 (gated)
  healthState: HealthState | null;
  healthCoverage: number;
}

type Lever = 'all' | 'active' | 'goingQuiet' | 'renewalWindow' | 'lapsed' | 'notStarted' | 'inactive' | 'tickets';

type DashboardView = 'base' | 'scoreboard' | 'worklist';

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
  productType: ProductType;
  atcmodel: string | null;
  customerstatus: string | null;
  financialstatus: string | null;
  // base-wide (paged-mode) flags — computed in the lite index so renewal/tickets filter the WHOLE base
  renewalWindow: boolean;          // subscriptionend within RENEWAL_DAYS (same logic as computeRows)
  openTickets: number;             // open clientissue count for this profile (from the full-base read)
}

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
    CommonModule, FormsModule, RouterLink,
    MatTableModule, MatPaginatorModule, MatSortModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatChipsModule, MatIconModule, MatButtonModule, MatMenuModule,
    MatCardModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule, MatCheckboxModule,
    MatButtonToggleModule, MatDatepickerModule, MatNativeDateModule,
  ],
  providers: [DatePipe],
  templateUrl: './journey-coach-health-dashboard.component.html',
  styleUrls: ['./journey-coach-health-dashboard.component.scss'],
})
export class JourneyCoachHealthDashboardComponent implements OnInit {

  readonly QUIET_DAYS = 45;
  readonly RENEWAL_DAYS = 90;
  readonly LAPSED_DAYS = 90;       // show lapses up to this many days past end
  readonly ALL = '__all__';
  readonly UNASSIGNED = '__unassigned__';
  readonly SHOW_HEALTH = false;    // Phase-2: flip true only after calibration

  // ---- Phase C: Coach Scoreboard ----
  // Engagement score weights (provisional — rewards keeping the pipeline active).
  // These are NOT calibrated; they will be revisited once outcome instrumentation
  // (renewals / referrals / wins) lands and joins the composite. They sum to 100.
  readonly W_COVERAGE = 60;        // breadth of the base actually contacted in range
  readonly W_QUALITY = 25;         // share of logged calls that actually reached the participant
  readonly W_QUIET = 15;           // share of base NOT going quiet
  readonly COVERAGE_TARGET = 0.9;  // contact at least this share of the base each period

  view: DashboardView = 'base';
  // Worklist view: a focused triage queue over the already-priority-sorted dataSource.data.
  worklistLimit = 25;
  period: 'week' | 'month' | 'custom' = 'month';
  rangeFrom: Date = this.startOfMonth(new Date());
  rangeTo: Date = new Date();
  scoreboard: ScoreboardRow[] = [];
  scoreboardComputed = false;
  // True when the scoreboard's touchpoint / appointment reads were permission-denied. The reads
  // still return empty, so without this flag everyone would render at 0% coverage/quality as if
  // real. Drives an honest "data unavailable (permissions)" notice above the scoreboard.
  scoreboardDataBlocked = false;
  // all touchpoints kept raw so the scoreboard can re-filter by range without re-reading Firestore
  private allTouchpoints: { profileid: string; coachid: string; date: Date | null; outcome: string | null; contacted: boolean }[] = [];

  // Phase B: unassigned-assignment state
  selectedProfiles = new Set<string>();
  assignTargetCoachId = '';
  unassignedCount = 0;
  assigning = false;

  loading = true;
  loadError = '';
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
  private serverCounts = { total: 0, renewalsSoon: 0, notStarted: 0, inactive: 0, active: 0 };
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

  allRows: PortfolioRow[] = [];
  dataSource = new MatTableDataSource<PortfolioRow>([]);

  search = '';
  journeyFilter = '';
  statusFilter = '';
  activeLever: Lever = 'all';
  journeyOptions: string[] = [];

  // ---- Intelligent filter panel (client-side, applied over the FULL base) ----
  filtersExpanded = false;                         // collapsible panel state
  // Product type defaults to ECOSYSTEM so the board opens scoped to ecosystem participants.
  productTypeFilters: ProductType[] = ['ecosystem'];
  tierFilters: string[] = [];                      // atcmodel: B!G / LYL / uP! / CPM (multi)
  bandFilters: Array<'High' | 'Medium' | 'Low'> = []; // priority band (multi)
  healthFilters: HealthState[] = [];               // coach-set health state (multi)
  financeFilters: string[] = [];                   // financialstatus values (multi)
  renewalWindowOnly = false;                        // renewal window (yes)
  goingQuietOnly = false;                           // going quiet (yes)
  noEventRequestOnly = false;                       // no recent event request (null)
  readonly tierOptions = ['B!G', 'LYL', 'uP!', 'CPM'];
  readonly healthOptions: HealthState[] = ['HAPPY', 'NEUTRAL', 'SAD', 'EVANGELIST'];
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

  summary = { total: 0, active: 0, inactive: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0 };

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
  private coachHealthByProfile: Record<string, { state: HealthState; note: string; date: Date | null }> = {};
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
      // assignment mode: checkbox + identity only (priority/levers don't apply to unassigned)
      return ['select', 'name', 'journey', 'tier', 'status', 'actions'];
    }
    // 'health' now shows the real COACH-SET state, so it is always displayed (no longer gated).
    const cols = ['priority', 'health', 'name', 'reason', 'journey', 'recentEvent', 'tier', 'status', 'finance',
      'renewal', 'lastcoach', 'tickets', 'actions'];
    if (this.selectedCoachId === this.ALL) cols.splice(3, 0, 'coach');
    return cols;
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

  private async loadPortfolio(): Promise<void> {
    this.profileMap = await this.guard.getProfileMap();
    this.metaMap = await this.guard.getParticipantMetaMap();

    // single read of the 'journey' collection powers BOTH the name map and the atc-model map
    // (previously getJourneyMap() and a separate getDocs('journey') each scanned it once).
    const journeyDocs = await getDocs(collection(this.firestore, 'journey'));
    const nameMap: Record<string, any> = {};
    journeyDocs.forEach(d => {
      const data = d.data() as any;
      nameMap[d.id] = data['journey'];
      this.atcByJourney[d.id] = data['atcmodel'] ?? null;
      // product type: same signal the sales dashboards use — journey.type, with FTO as gifts.
      this.typeByJourney[d.id] = this.classifyJourneyType(data['type'], data['journey']);
    });
    this.journeyNameMap = nameMap;

    await this.loadCoaches();

    const matchedCoach = !!(this.coachId && this.coaches.some(c => c.id === this.coachId));
    this.selectedCoachId = matchedCoach ? this.coachId! : this.ALL;
    // Fell back to ALL because we couldn't match the logged-in coach to a base.
    this.coachFallback = !matchedCoach;
    this.pagedMode = this.isPagedView(this.selectedCoachId);
    this.applyPaginatorBinding();

    // Coach-set health states (keyed by profileid) load scoped to the rows actually shown:
    // per-page in paged mode (renderPage) and with the coach's base in full mode (loadFullPortfolio).
    if (this.pagedMode) {
      await this.loadServerCounts();
      await this.ensureFullIndex();   // lightweight full-base index drives search + filters off-page
      await this.loadFirstPage();
    } else {
      // full mode scopes coach-set health to the coach's base (inside loadFullPortfolio)
      await this.loadFullPortfolio();
    }
  }

  /** Per-coach path — used when a SPECIFIC coach is selected (and cached for re-use).
   *  The pjp collection is still read in full (it powers the Unassigned count and is cached for
   *  the scoreboard), but the dependent joins are now SCOPED to the coach's base via the same
   *  batched `where(... 'in', chunk30)` loaders the paged path uses — no full-collection scans. */
  private async loadFullPortfolio(): Promise<void> {
    const pjpSnap = await getDocs(collection(this.firestore, 'participantjourneyproduct'));
    this.pjpData = pjpSnap.docs.map(d => ({ ...d.data(), __id: d.id }));
    this.fullPjpData = this.pjpData;
    this.scannedCount = this.pjpData.length;
    // count distinct participants with no coach assigned (for the Unassigned view)
    const unassignedProfiles = new Set<string>();
    for (const d of this.pjpData) {
      if (d['profileid'] && this.isUnassigned(d['coachedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;

    await this.loadFullDependentsForBase();

    this.computeRows();
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
    const now = new Date();
    const in90 = new Date(now.getTime() + this.RENEWAL_DAYS * 86400000);
    let totalOk = false, inactiveOk = false;
    await Promise.all([
      getCountFromServer(pjp)
        .then(s => { this.serverCounts.total = s.data().count; totalOk = true; }).catch(() => {}),
      getCountFromServer(query(pjp, where('subscriptionend', '>=', now), where('subscriptionend', '<=', in90)))
        .then(s => { this.serverCounts.renewalsSoon = s.data().count; }).catch(() => {}),
      getCountFromServer(query(pjp, where('journeystatus', 'in', ['Initiated', 'initiated']), where('onboarded', '==', true)))
        .then(s => { this.serverCounts.notStarted = s.data().count; }).catch(() => {}),
      // inactive = customerstatus in the gone-set (matches isInactiveStatus). Field lives on the
      // pjp doc; <=10 values so a single Firestore `in` covers it. active is then total - inactive.
      getCountFromServer(query(pjp, where('customerstatus', 'in', ['late', 'discontinued', 'banned'])))
        .then(s => { this.serverCounts.inactive = s.data().count; inactiveOk = true; }).catch(() => {}),
    ]);
    this.serverActiveReady = totalOk && inactiveOk;
    this.serverCounts.active = Math.max(0, this.serverCounts.total - this.serverCounts.inactive);
    this.serverCountsReady = true;
  }

  private buildPjpPageQuery(startAfterDoc?: QueryDocumentSnapshot) {
    const ref = collection(this.firestore, 'participantjourneyproduct');
    // order by documentId() so NO doc is skipped (UNASSIGNED docs may lack coachedby / ordering fields)
    const constraints: any[] = [orderBy(documentId())];
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
    this.summary = { total: 0, active: 0, inactive: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0 };
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
    if (event.pageSize !== this.pageSize) {
      this.pageSize = event.pageSize;
      await this.loadFirstPage();
      return;
    }
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
      let pjpForPage = pageDocs.map(d => ({ ...d.data(), __id: d.id }));
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
    for (const r of this.allRows) {
      if (this.countedProfiles.has(r.profileid)) continue;
      this.countedProfiles.add(r.profileid);
      if (this.isInactiveStatus(r.customerstatus)) { this.summary.inactive++; continue; }
      if ((r.customerstatus ?? '').toLowerCase() === 'active') this.summary.active++;
      if (r.renewalWindow) this.summary.renewalsSoon++;
      if (r.lapsed) this.summary.lapsed++;
      if (r.openTickets > 0) this.summary.withOpenTickets++;
      if (r.goingQuiet) this.summary.goingQuiet++;
      if (r.notStarted) this.summary.notStarted++;
    }
    this.loadedRowCount = this.countedProfiles.size;
    if (this.selectedCoachId === this.UNASSIGNED) this.unassignedCount = this.loadedRowCount;
    // base-wide Open-tickets count: distinct profiles with an open ticket across the WHOLE base
    // (from the cached full-base clientissue read, once the lite index has built). Falls back to the
    // page-accumulated value until then.
    if (this.fullIndexBuilt) this.summary.withOpenTickets = this.fullBaseWithOpenTickets;
    // accurate server counts take precedence for the cards they can power
    if (this.serverCountsReady) {
      this.summary.total = this.serverCounts.total;
      this.summary.renewalsSoon = this.serverCounts.renewalsSoon;
      this.summary.notStarted = this.serverCounts.notStarted;
      // active/inactive are base-wide via the customerstatus count query (not page-scoped) — only
      // when BOTH total and inactive counts resolved; otherwise leave the page-accumulated values.
      if (this.serverActiveReady) {
        this.summary.inactive = this.serverCounts.inactive;
        this.summary.active = this.serverCounts.active;
      }
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
      const pjpSnap = await getDocs(collection(this.firestore, 'participantjourneyproduct'));
      this.sbPjp = pjpSnap.docs.map(d => ({ ...d.data(), __id: d.id }));
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
        const ref: any = (d.data() as any)['profile_ref'];
        const id = ref?.id;
        if (id) list.push({ id, name: this.profileMap.map?.[id] ?? (d.data() as any)['name'] ?? id });
      });
    } catch (e) {
      console.warn('could not load journey coaches', e);
    }
    if (this.coachId && !list.some(c => c.id === this.coachId)) {
      list.push({ id: this.coachId, name: this.coachName || this.coachId });
    }
    this.coaches = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
    const latest: Record<string, { state: HealthState; note: string; date: Date | null; sortMs: number }> = {};
    try {
      const snap = await getDocs(collection(this.firestore, 'healthtracker_healthstate'));
      snap.forEach(d => {
        const data: any = d.data();
        const pid = data['profileid'];
        if (!pid) return;
        const state = data['state'] as HealthState;
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
    const out: Record<string, { state: HealthState; note: string; date: Date | null }> = {};
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
          const state = data['state'] as HealthState;
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
    this.selectedProfiles.clear();

    for (const d of this.pjpData) {
      if (showUnassigned) { if (!this.isUnassigned(d['coachedby'])) continue; }
      else if (!showAll && !this.isMine(d['coachedby'], this.selectedCoachId)) continue;
      const profileid = d['profileid'];
      if (!profileid) continue;
      matched++;

      const meta: any = this.metaMap.docdata?.[profileid] ?? {};
      const journeyId = d['journeyref']?.id ?? null;
      const subEnd = this.toDate(d['subscriptionend']) ?? this.toDate(meta['subscriptionend']);

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
        totalpurchasevalue: this.num(meta['totalpurchasevalue']),
        balance: this.num(meta['balance']),
        emi: this.num(meta['emi']),
        lastcoachdate: lastCoach,
        daysSinceCoach,
        daysToRenewal,
        openTickets: this.openTicketCounts[profileid] ?? 0,
        onboarded,
        goingQuiet: daysSinceCoach != null && daysSinceCoach > this.QUIET_DAYS,
        renewalWindow: daysToRenewal != null && daysToRenewal >= 0 && daysToRenewal <= this.RENEWAL_DAYS,
        lapsed: daysToRenewal != null && daysToRenewal < 0 && daysToRenewal >= -this.LAPSED_DAYS
          && !this.isInactiveStatus(meta['customerstatus']),
        notStarted: ['Initiated', 'initiated', null, undefined].includes(jstatus) && onboarded,
        priority: 0, priorityBand: 'Low', reason: '',
        pjpIds: [d['__id']],
        recentEventRequest: this.recentEventByProfile[profileid] ?? null,
        coachHealthState: this.coachHealthByProfile[profileid] ?? null,
        healthState: null, healthCoverage: 0,
      };
      this.scoreRow(row);
      if (this.SHOW_HEALTH) this.scoreHealth(row);

      const existing = byProfile.get(profileid);
      if (!existing) { byProfile.set(profileid, row); }
      else {
        const mergedIds = [...existing.pjpIds, d['__id']];
        if (row.priority > existing.priority) { row.pjpIds = mergedIds; byProfile.set(profileid, row); }
        else { existing.pjpIds = mergedIds; }
      }
    }

    this.matchedCount = matched;
    this.allRows = Array.from(byProfile.values()).sort((a, b) => b.priority - a.priority);
    this.journeyOptions = Array.from(new Set(this.allRows.map(r => r.journeyname))).sort();
    // full mode: derive finance filter options from the (full) base; paged mode sources them from
    // ensureFullIndex (the page-local allRows would otherwise miss off-page financial statuses).
    if (!this.pagedMode) {
      this.financeOptions = Array.from(
        new Set(this.allRows.map(r => r.financialstatus).filter((v): v is string => !!v)),
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
  openSlideover(row: PortfolioRow): void {
    this.dialog.open(ParticipantSlideoverComponent, {
      // Reuse the dashboard's full Log-call / Set-health flow (write + snackbar + table update);
      // the slide-over's footer buttons invoke these so it never performs its own (no-op) writes.
      data: { row, onLogCall: () => this.logCall(row), onSetHealth: () => this.setHealthState(row) },
      position: { right: '0', top: '0' },
      height: '100vh',
      width: 'min(520px, 100vw)',
      panelClass: 'jchd-slideover-panel',
      // a11y: label the dialog by the participant-name heading and move focus into the panel
      // (the close button) on open, instead of leaving focus on the trigger outside the overlay.
      ariaLabelledBy: 'so-title',
      autoFocus: '.so-close',
    });
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

  /** Open the Log-call dialog; on save, write the enriched touchpoint and close the loop. */
  logCall(row: PortfolioRow): void {
    const ref = this.dialog.open(LogCallDialogComponent, { data: { name: row.name }, autoFocus: false });
    ref.afterClosed().subscribe(async (res: LogCallResult | undefined) => {
      if (!res) return;
      const writer = this.coachId || this.selectedCoachId || '';
      try {
        await addDoc(collection(this.firestore, 'healthtracker_touchpoint'), {
          profileid: row.profileid,
          coachid: this.selectedCoachId === this.ALL ? writer : this.selectedCoachId,
          loggedby: writer,
          date: serverTimestamp(),
          outcome: res.outcome,
          note: res.note,
          nextactiondate: res.nextActionDate ?? null,
          contacted: res.outcome === 'reached' || res.outcome === 'scheduled',
          source: 'health-dashboard',
        });
        this.guard.openSnackBar(`Call logged for ${row.name}`, 'Close');
        // Optimistic UI runs ONLY after the write succeeds — on permission-denied the row must
        // not visually clear its quiet flag. Only an actual contact (reached/scheduled) resets
        // the going-quiet clock; a no-answer is still logged but does not clear the quiet flag.
        if (res.outcome === 'reached' || res.outcome === 'scheduled') {
          const now = Date.now();
          this.touchpointByProfile[row.profileid] = now;
          row.lastcoachdate = new Date(now);
          row.daysSinceCoach = 0;
          row.goingQuiet = false;
          this.scoreRow(row);
          this.allRows.sort((a, b) => b.priority - a.priority);
          this.computeSummary();
          this.applyFilters();
        }
      } catch (e: any) {
        console.error('logCall write failed', e);
        this.guard.openSnackBar('Could not save call: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
      }
    });
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
      const writer = this.coachId || this.selectedCoachId || '';
      try {
        await addDoc(collection(this.firestore, 'healthtracker_healthstate'), {
          profileid: row.profileid,
          state: res.state,
          note: res.note,
          coachid: writer,
          date: serverTimestamp(),
          source: 'health-dashboard',
        });
        this.guard.openSnackBar(`Health state set to ${this.healthLabel(res.state)} for ${row.name}`, 'Close');
      } catch (e: any) {
        console.error('setHealthState write failed', e);
        this.guard.openSnackBar('Could not save health state: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
        return;
      }
      // optimistic: reflect on the row + the in-memory map so the Health column updates without reload
      const entry = { state: res.state, note: res.note, date: new Date() };
      row.coachHealthState = entry;
      this.coachHealthByProfile[row.profileid] = entry;
    });
  }

  /** Title-case label for a coach-set Health State (Happy / Neutral / Sad / Evangelist). */
  healthLabel(s: HealthState | null | undefined): string {
    switch (s) {
      case 'HAPPY': return 'Happy';
      case 'NEUTRAL': return 'Neutral';
      case 'SAD': return 'Sad';
      case 'EVANGELIST': return 'Evangelist';
      default: return '—';
    }
  }

  /** Per-row assign / change coach — works for any participant (assign or reassign).
   *  Writes real coachedby for every pjp doc of the row (reusing the Phase-B write pattern),
   *  reflects locally (coachedby + coach name + unassignedCount), and snackbars the result. */
  async assignCoachToRow(row: PortfolioRow, coachId: string): Promise<void> {
    if (!coachId) return;
    const coachRef = doc(this.firestore, 'profile_data', coachId);
    const coachName = this.coaches.find(c => c.id === coachId)?.name ?? coachId;
    let fail = 0;
    for (const pjpId of row.pjpIds) {
      try {
        await updateDoc(doc(this.firestore, 'participantjourneyproduct', pjpId), { coachedby: [coachRef] });
        const d = this.pjpData.find(x => x['__id'] === pjpId);
        if (d) d['coachedby'] = [coachRef]; // reflect locally
      } catch (e: any) {
        console.error('assignCoachToRow write failed', pjpId, e);
        fail++;
      }
    }
    if (fail > 0) {
      this.guard.openSnackBar(`Could not assign ${row.name}: ${fail} write(s) failed (permission denied?)`, 'Close', 5000);
      return;
    }
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

  // ---- Phase C: Coach Scoreboard ----

  async setView(v: DashboardView): Promise<void> {
    if (!v) return; // mat-button-toggle can emit null on deselect; ignore
    this.view = v;
    if (v === 'scoreboard' && !this.scoreboardComputed) {
      await this.ensureScoreboardData();   // scoreboard spans all coaches; loaded once on demand
      this.computeScoreboard();
    }
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
    this.scoreboard = rows;
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
    this.pagedMode = this.isPagedView(id);
    this.applyPaginatorBinding();
    if (this.pagedMode) {
      // paged mode keys coach-set health by profileid globally — ensure the full map is present
      // (it may not be if the dashboard first opened on a specific coach, which scopes health)
      if (!this.coachHealthFullLoaded) await this.loadCoachHealthStates();
      if (!this.serverCountsReady) await this.loadServerCounts();
      await this.ensureFullIndex();   // lightweight full-base index drives search + filters off-page
      await this.loadFirstPage();
    } else {
      // a specific coach needs its full base (global priority sort + accurate KPIs); the pjp
      // collection is cached, but the dependent joins must be (re)loaded SCOPED to this coach.
      if (this.paginator) this.paginator.firstPage();
      if (this.fullPjpData) {
        this.pjpData = this.fullPjpData;
        await this.loadFullDependentsForBase();
        this.computeRows();
      } else {
        await this.loadFullPortfolio();
      }
    }
  }

  /** Map a KPI card key to its lever. 'total' resets the board to 'all'. */
  private kpiLever(which: 'total' | 'active' | 'inactive' | 'renewalsSoon' | 'goingQuiet' | 'tickets'): Lever {
    switch (which) {
      case 'active': return 'active';
      case 'inactive': return 'inactive';
      case 'renewalsSoon': return 'renewalWindow';
      case 'goingQuiet': return 'goingQuiet';
      case 'tickets': return 'tickets';
      default: return 'all';
    }
  }

  /** Clickable KPI cards -> toggle the relevant lever (click again to clear back to 'all'). */
  kpi(which: 'total' | 'active' | 'inactive' | 'renewalsSoon' | 'goingQuiet' | 'tickets'): void {
    this.statusFilter = '';
    const target = this.kpiLever(which);
    this.setLever(this.activeLever === target ? 'all' : target);
  }

  /** Whether a given KPI card's lever is the currently active one (drives the selected highlight). */
  kpiActive(which: 'total' | 'active' | 'inactive' | 'renewalsSoon' | 'goingQuiet' | 'tickets'): boolean {
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
  isSelected(id: string): boolean { return this.selectedProfiles.has(id); }
  toggleSelect(id: string): void {
    if (this.selectedProfiles.has(id)) this.selectedProfiles.delete(id);
    else this.selectedProfiles.add(id);
  }
  get allVisibleSelected(): boolean {
    const rows = this.dataSource.data;
    return rows.length > 0 && rows.every(r => this.selectedProfiles.has(r.profileid));
  }
  toggleSelectAll(): void {
    const rows = this.dataSource.data;
    if (this.allVisibleSelected) rows.forEach(r => this.selectedProfiles.delete(r.profileid));
    else rows.forEach(r => this.selectedProfiles.add(r.profileid));
  }
  get selectedCount(): number { return this.selectedProfiles.size; }

  /** Bulk-assign the selected unassigned participants to a coach — writes real coachedby. */
  async assignSelected(): Promise<void> {
    if (!this.assignTargetCoachId || this.selectedProfiles.size === 0) return;
    this.assigning = true;
    const coachRef = doc(this.firestore, 'profile_data', this.assignTargetCoachId);
    const rowsById = new Map(this.allRows.map(r => [r.profileid, r]));
    const ids = Array.from(this.selectedProfiles);
    let fail = 0;
    for (const pid of ids) {
      const row = rowsById.get(pid);
      if (!row) continue;
      for (const pjpId of row.pjpIds) {
        try {
          await updateDoc(doc(this.firestore, 'participantjourneyproduct', pjpId), { coachedby: [coachRef] });
          const d = this.pjpData.find(x => x['__id'] === pjpId);
          if (d) d['coachedby'] = [coachRef]; // reflect locally so they leave the unassigned view
        } catch (e: any) {
          console.error('assign write failed', pjpId, e);
          fail++;
        }
      }
    }
    this.assigning = false;
    const coachName = this.coaches.find(c => c.id === this.assignTargetCoachId)?.name ?? 'coach';
    this.guard.openSnackBar(
      `Assigned ${ids.length} participant(s) to ${coachName}${fail ? ` — ${fail} write(s) failed` : ''}`,
      'Close', 5000);
    const unassignedProfiles = new Set<string>();
    for (const d of this.pjpData) {
      if (d['profileid'] && this.isUnassigned(d['coachedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;
    this.assignTargetCoachId = '';
    this.computeRows();
  }

  private computeSummary(): void {
    const s = { total: 0, active: 0, inactive: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0 };
    for (const r of this.allRows) {
      s.total++;
      const cs = (r.customerstatus ?? '').toLowerCase();
      if (this.isInactiveStatus(cs)) { s.inactive++; continue; } // gone — excluded from active counts
      if (cs === 'active') s.active++;
      if (r.renewalWindow) s.renewalsSoon++;
      if (r.lapsed) s.lapsed++;
      if (r.openTickets > 0) s.withOpenTickets++;
      if (r.goingQuiet) s.goingQuiet++;
      if (r.notStarted) s.notStarted++;
    }
    this.summary = s;
  }

  applyFilters(): void {
    // In paged mode, recompute the full-base match set so search + filters + the ecosystem default
    // cover EVERYONE (not just the loaded page). In full mode allRows is already the full base.
    if (this.pagedMode) this.recomputeFullBaseMatch();
    this.dataSource.data = this.allRows.filter(r => this.rowMatches(r));
    // the visible rows just changed — drop the keyboard highlight so it never points at a stale row
    this.focusedRowIndex = -1;
  }

  /** Full per-row predicate: levers + journey/status + search + the intelligent filter panel.
   *  In paged mode rows also have to be in the full-base match set (so off-page filtering counts). */
  private rowMatches(r: PortfolioRow): boolean {
    const term = this.search.trim().toLowerCase();
    const wantInactive = this.activeLever === 'inactive';
    // inactive (gone) participants are hidden from the active board unless explicitly viewing them
    if (this.isInactiveStatus(r.customerstatus) !== wantInactive) return false;
    if (this.activeLever === 'goingQuiet' && !r.goingQuiet) return false;
    if (this.activeLever === 'renewalWindow' && !r.renewalWindow) return false;
    if (this.activeLever === 'lapsed' && !r.lapsed) return false;
    if (this.activeLever === 'notStarted' && !r.notStarted) return false;
    if (this.activeLever === 'active' && (r.customerstatus ?? '').toLowerCase() !== 'active') return false;
    if (this.activeLever === 'tickets' && !(r.openTickets > 0)) return false;
    if (this.journeyFilter && r.journeyname !== this.journeyFilter) return false;
    if (this.statusFilter && (r.customerstatus ?? '') !== this.statusFilter) return false;
    if (term && !(`${r.name} ${r.number ?? ''}`.toLowerCase().includes(term))) return false;
    // --- intelligent filter panel ---
    if (this.productTypeFilters.length && !this.productTypeFilters.includes(r.productType)) return false;
    if (this.tierFilters.length && !this.tierFilters.includes(r.atcmodel ?? '')) return false;
    if (this.bandFilters.length && !this.bandFilters.includes(r.priorityBand)) return false;
    if (this.healthFilters.length && !this.healthFilters.includes(r.coachHealthState?.state as HealthState)) return false;
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
    if (this.isInactiveStatus(lite.customerstatus) !== wantInactive) return false;
    if (this.activeLever === 'active' && (lite.customerstatus ?? '').toLowerCase() !== 'active') return false;
    if (this.statusFilter && (lite.customerstatus ?? '') !== this.statusFilter) return false;
    if (term && !(`${lite.name} ${lite.number ?? ''}`.toLowerCase().includes(term))) return false;
    if (this.productTypeFilters.length && !this.productTypeFilters.includes(lite.productType)) return false;
    if (this.tierFilters.length && !this.tierFilters.includes(lite.atcmodel ?? '')) return false;
    if (this.financeFilters.length && !this.financeFilters.includes(lite.financialstatus ?? '')) return false;
    // renewal window + open-tickets lever now filter the FULL base (computed in the lite index)
    if (this.renewalWindowOnly && !lite.renewalWindow) return false;
    if (this.activeLever === 'tickets' && !(lite.openTickets > 0)) return false;
    if (this.activeLever === 'renewalWindow' && !lite.renewalWindow) return false;
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
      const snap = await getDocs(collection(this.firestore, 'participantjourneyproduct'));
      pjp = snap.docs.map(d => ({ ...d.data(), __id: d.id }));
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
      // renewal window: SAME logic as computeRows (subscriptionend from pjp doc, falling back to meta).
      const subEnd = this.toDate(d['subscriptionend']) ?? this.toDate(meta['subscriptionend']);
      const daysToRenewal = subEnd ? Math.floor((subEnd.getTime() - now) / 86400000) : null;
      const renewalWindow = daysToRenewal != null && daysToRenewal >= 0 && daysToRenewal <= this.RENEWAL_DAYS;
      const lite: LiteIndexRow = {
        profileid,
        name: this.profileMap.map?.[profileid] ?? meta['name'] ?? profileid,
        number: this.profileMap.phonenumber?.[profileid] ?? null,
        coachedby: d['coachedby'] ?? null,
        productType,
        atcmodel: journeyId ? (this.atcByJourney[journeyId] ?? null) : null,
        customerstatus: meta['customerstatus'] ?? null,
        financialstatus: fin,
        renewalWindow,
        openTickets: openByProfile[profileid] ?? 0,
      };
      const existing = byProfile.get(profileid);
      if (!existing) { byProfile.set(profileid, lite); }
      else {
        // keep the strongest product type; a coachedby on either doc means assigned
        if (rank[productType] > rank[existing.productType]) existing.productType = productType;
        if (this.isUnassigned(existing.coachedby) && !this.isUnassigned(lite.coachedby)) existing.coachedby = lite.coachedby;
        // a participant is in the renewal window if ANY of their journey-products is
        if (renewalWindow) existing.renewalWindow = true;
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

  /** Clear every filter affordance (panel + journey/status/search + lever) and reset to defaults.
   *  Product type returns to its ECOSYSTEM default — the intended opening scope of the board. */
  clearFilters(): void {
    this.search = '';
    this.journeyFilter = '';
    this.statusFilter = '';
    this.activeLever = 'all';
    this.productTypeFilters = ['ecosystem'];
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
    return !!this.search || !!this.journeyFilter || !!this.statusFilter || this.activeLever !== 'all'
      || !(this.productTypeFilters.length === 1 && this.productTypeFilters[0] === 'ecosystem') || this.tierFilters.length > 0 || this.bandFilters.length > 0
      || this.healthFilters.length > 0 || this.financeFilters.length > 0
      || this.renewalWindowOnly || this.goingQuietOnly || this.noEventRequestOnly;
  }

  /** True when a PAGE-LOCAL filter is active — priority band / coach-health / going-quiet.
   *  These need per-row dependent data (touchpoints not yet read base-wide) so they only refine the
   *  loaded pages (see liteMatches). Search / product type / tier / status / finance — and now
   *  renewal-window + open-tickets — cover the full base via the lite index, so they do NOT trigger
   *  the caveat. Drives the visible "filtering loaded pages only" caveat in paged (ALL/UNASSIGNED) mode. */
  get pageLocalFilterActive(): boolean {
    return this.bandFilters.length > 0 || this.healthFilters.length > 0
      || this.goingQuietOnly;
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
  stateClass(s: HealthState | null): string {
    switch (s) {
      case 'EVANGELIST': return 'state-evangelist';
      case 'HAPPY': return 'state-happy';
      case 'NEUTRAL': return 'state-neutral';
      case 'SAD': return 'state-sad';
      default: return 'state-neutral';
    }
  }
}
