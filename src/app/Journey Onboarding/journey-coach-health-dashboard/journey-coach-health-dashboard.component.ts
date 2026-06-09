import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  Firestore, collection, query, where, getDocs, doc, addDoc, updateDoc, serverTimestamp
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
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
  // Phase-2 (gated)
  healthState: HealthState | null;
  healthCoverage: number;
}

type Lever = 'all' | 'goingQuiet' | 'renewalWindow' | 'lapsed' | 'notStarted' | 'inactive';

type DashboardView = 'base' | 'scoreboard';

/** Phase C: one coach's gamified scoreboard row for the selected date range. */
interface ScoreboardRow {
  coachId: string;
  coachName: string;
  baseSize: number;       // distinct participants assigned to this coach (onboardedby)
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
  period: 'week' | 'month' | 'custom' = 'month';
  rangeFrom: Date = this.startOfMonth(new Date());
  rangeTo: Date = new Date();
  scoreboard: ScoreboardRow[] = [];
  scoreboardComputed = false;
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

  scannedCount = 0;
  matchedCount = 0;

  allRows: PortfolioRow[] = [];
  dataSource = new MatTableDataSource<PortfolioRow>([]);

  search = '';
  journeyFilter = '';
  statusFilter = '';
  activeLever: Lever = 'all';
  journeyOptions: string[] = [];

  summary = { total: 0, active: 0, inactive: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0 };

  private pjpData: any[] = [];
  private profileMap: any = {};
  private metaMap: any = {};
  private journeyNameMap: any = {};
  private atcByJourney: Record<string, string> = {};
  private openTicketCounts: Record<string, number> = {};
  private touchpointByProfile: Record<string, number> = {};
  private contactEventByProfile: Record<string, number> = {}; // raw attended-session recency
  // profileid -> most-recent event participation request {eventName, date, status}
  private recentEventByProfile: Record<string, { eventName: string; date: Date | null; status: string }> = {};

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

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
    const cols = ['priority', 'name', 'reason', 'journey', 'recentEvent', 'tier', 'status', 'finance',
      'renewal', 'lastcoach', 'tickets', 'actions'];
    if (this.SHOW_HEALTH) cols.splice(1, 0, 'health');
    if (this.selectedCoachId === this.ALL) cols.splice(this.SHOW_HEALTH ? 3 : 2, 0, 'coach');
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
    this.dataSource.paginator = this.paginator;
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

  private async loadPortfolio(): Promise<void> {
    this.profileMap = await this.guard.getProfileMap();
    this.journeyNameMap = await this.guard.getJourneyMap();
    this.metaMap = await this.guard.getParticipantMetaMap();

    const journeyDocs = await getDocs(collection(this.firestore, 'journey'));
    journeyDocs.forEach(d => { this.atcByJourney[d.id] = (d.data() as any)['atcmodel'] ?? null; });

    const pjpSnap = await getDocs(collection(this.firestore, 'participantjourneyproduct'));
    this.pjpData = pjpSnap.docs.map(d => ({ ...d.data(), __id: d.id }));
    this.scannedCount = this.pjpData.length;
    // count distinct participants with no coach assigned (for the Unassigned view)
    const unassignedProfiles = new Set<string>();
    for (const d of this.pjpData) {
      if (d['profileid'] && this.isUnassigned(d['onboardedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;

    await this.loadOpenTicketCounts();
    await this.loadTouchpoints();
    await this.loadContactEvents();
    await this.loadRecentEventRequests();
    await this.loadCoaches();

    this.selectedCoachId =
      (this.coachId && this.coaches.some(c => c.id === this.coachId)) ? this.coachId : this.ALL;

    this.computeRows();
  }

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

  private async loadOpenTicketCounts(): Promise<void> {
    const counts: Record<string, number> = {};
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'clientissue'),
        where('status.status', 'in', ['Open', 'open']),
      ));
      snap.forEach(d => {
        const cid = (d.data() as any)['clientid'];
        const key = typeof cid === 'string' ? cid : cid?.id;
        if (key) counts[key] = (counts[key] ?? 0) + 1;
      });
    } catch (e) {
      console.warn('open ticket count failed (non-fatal)', e);
    }
    this.openTicketCounts = counts;
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
      console.warn('contact events load failed (non-fatal)', e);
    }
    this.contactEventByProfile = map;
  }

  /** Most-recent event participation/confirmation request per participant.
   *  Source: 'event participation request' (fields: profileid, eventref [DocumentReference to
   *  'event collection' or 'queue generation'], status, doccreateddate). Event name is resolved
   *  from 'event collection' (field 'name') / 'queue generation' (field 'queuename'); the request's
   *  own doccreateddate is the request date, falling back to the event's start_date/queuestartdate. */
  private async loadRecentEventRequests(): Promise<void> {
    const recent: Record<string, { eventName: string; date: Date | null; status: string; sortMs: number }> = {};
    try {
      // event id -> { name, startDate } for both events and queues (same as userprofile mapping)
      const eventInfo: Record<string, { name: string; start: Date | null }> = {};
      const [eventSnap, queueSnap] = await Promise.all([
        getDocs(collection(this.firestore, 'event collection')),
        getDocs(collection(this.firestore, 'queue generation')),
      ]);
      eventSnap.forEach(d => {
        const data: any = d.data();
        eventInfo[d.id] = { name: data['name'] ?? data['eventname'] ?? d.id, start: this.toDate(data['start_date']) };
      });
      queueSnap.forEach(d => {
        const data: any = d.data();
        eventInfo[d.id] = { name: data['queuename'] ?? d.id, start: this.toDate(data['queuestartdate']) };
      });

      const reqSnap = await getDocs(collection(this.firestore, 'event participation request'));
      reqSnap.forEach(d => {
        const data: any = d.data();
        const pid = data['profileid'];
        if (!pid) return;
        const eventId = data['eventref']?.id ?? null;
        const info = eventId ? eventInfo[eventId] : null;
        const reqDate = this.toDate(data['doccreateddate']) ?? info?.start ?? null;
        const sortMs = reqDate ? reqDate.getTime() : 0;
        const status = typeof data['status'] === 'string' ? data['status'] : 'requested';
        const existing = recent[pid];
        if (!existing || sortMs > existing.sortMs) {
          recent[pid] = { eventName: info?.name ?? (eventId ?? '—'), date: reqDate, status, sortMs };
        }
      });
    } catch (e) {
      console.warn('recent event request load failed (non-fatal)', e);
    }
    const out: Record<string, { eventName: string; date: Date | null; status: string }> = {};
    for (const pid of Object.keys(recent)) {
      out[pid] = { eventName: recent[pid].eventName, date: recent[pid].date, status: recent[pid].status };
    }
    this.recentEventByProfile = out;
  }

  computeRows(): void {
    const now = Date.now();
    const byProfile = new Map<string, PortfolioRow>();
    let matched = 0;
    const showAll = this.selectedCoachId === this.ALL;
    const showUnassigned = this.selectedCoachId === this.UNASSIGNED;
    this.selectedProfiles.clear();

    for (const d of this.pjpData) {
      if (showUnassigned) { if (!this.isUnassigned(d['onboardedby'])) continue; }
      else if (!showAll && !this.isMine(d['onboardedby'], this.selectedCoachId)) continue;
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
        coachname: this.coachNameFor(d['onboardedby']),
        journeyname: journeyId ? (this.journeyNameMap[journeyId] ?? journeyId) : (meta['activejourney'] ?? '-'),
        atcmodel: journeyId ? (this.atcByJourney[journeyId] ?? null) : null,
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
    this.computeSummary();
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
      } catch (e: any) {
        console.error('logCall write failed', e);
        this.guard.openSnackBar('Could not save call: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
      }
      // only an actual contact (reached/scheduled) resets the going-quiet clock; a no-answer
      // is still logged (counts as activity) but does not clear the quiet flag.
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
    });
  }

  /** Per-row assign / change coach — works for any participant (assign or reassign).
   *  Writes real onboardedby for every pjp doc of the row (reusing the Phase-B write pattern),
   *  reflects locally (onboardedby + coach name + unassignedCount), and snackbars the result. */
  async assignCoachToRow(row: PortfolioRow, coachId: string): Promise<void> {
    if (!coachId) return;
    const coachRef = doc(this.firestore, 'profile_data', coachId);
    const coachName = this.coaches.find(c => c.id === coachId)?.name ?? coachId;
    let fail = 0;
    for (const pjpId of row.pjpIds) {
      try {
        await updateDoc(doc(this.firestore, 'participantjourneyproduct', pjpId), { onboardedby: [coachRef] });
        const d = this.pjpData.find(x => x['__id'] === pjpId);
        if (d) d['onboardedby'] = [coachRef]; // reflect locally
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
      if (d['profileid'] && this.isUnassigned(d['onboardedby'])) unassignedProfiles.add(d['profileid']);
    }
    this.unassignedCount = unassignedProfiles.size;
    // if we're viewing a single coach or the unassigned bucket, this row may no longer belong here
    if (this.selectedCoachId !== this.ALL) this.computeRows();
    this.guard.openSnackBar(`Assigned ${row.name} to ${coachName}`, 'Close');
  }

  // ---- Phase C: Coach Scoreboard ----

  setView(v: DashboardView): void {
    if (!v) return; // mat-button-toggle can emit null on deselect; ignore
    this.view = v;
    if (v === 'scoreboard' && !this.scoreboardComputed) this.computeScoreboard();
  }

  onRangeChange(): void {
    if (this.view === 'scoreboard') this.computeScoreboard();
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

    // base size + current going-quiet are computed from current assignments (onboardedby)
    const baseByCoach: Record<string, Set<string>> = {};
    const quietByCoach: Record<string, number> = {};
    for (const c of this.coaches) { baseByCoach[c.id] = new Set(); quietByCoach[c.id] = 0; }

    // distinct participant -> coach (first matching assignment), so quiet is counted once per person
    const seen = new Set<string>();
    for (const d of this.pjpData) {
      const pid = d['profileid'];
      if (!pid) continue;
      for (const c of this.coaches) {
        if (!this.isMine(d['onboardedby'], c.id)) continue;
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

  onCoachChange(id: string): void {
    this.selectedCoachId = id;
    this.activeLever = 'all';
    this.assignTargetCoachId = '';
    this.computeRows();
  }

  /** Clickable KPI cards -> set the relevant lever. */
  kpi(which: 'inactive' | 'renewalsSoon' | 'goingQuiet'): void {
    this.statusFilter = '';
    if (which === 'goingQuiet') this.setLever('goingQuiet');
    else if (which === 'renewalsSoon') this.setLever('renewalWindow');
    else this.setLever('inactive');
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

  private coachNameFor(onboardedby: any): string {
    let id: string | null = null;
    if (Array.isArray(onboardedby)) {
      const first = onboardedby[0];
      id = first ? (typeof first === 'string' ? first : first?.id) : null;
    } else if (typeof onboardedby === 'string') {
      id = onboardedby;
    } else {
      id = onboardedby?.id ?? null;
    }
    return id ? (this.profileMap.map?.[id] ?? '—') : '—';
  }

  private isMine(onboardedby: any, coachId: string): boolean {
    if (!coachId || onboardedby == null) return false;
    if (typeof onboardedby === 'string') return onboardedby === coachId;
    if (Array.isArray(onboardedby)) {
      return onboardedby.some((x: any) => (typeof x === 'string' ? x : x?.id) === coachId);
    }
    return (onboardedby?.id ?? null) === coachId;
  }

  private isUnassigned(onboardedby: any): boolean {
    if (onboardedby == null) return true;
    if (typeof onboardedby === 'string') return onboardedby.trim() === '';
    if (Array.isArray(onboardedby)) return onboardedby.length === 0 || onboardedby.every((x: any) => x == null);
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

  /** Bulk-assign the selected unassigned participants to a coach — writes real onboardedby. */
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
          await updateDoc(doc(this.firestore, 'participantjourneyproduct', pjpId), { onboardedby: [coachRef] });
          const d = this.pjpData.find(x => x['__id'] === pjpId);
          if (d) d['onboardedby'] = [coachRef]; // reflect locally so they leave the unassigned view
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
      if (d['profileid'] && this.isUnassigned(d['onboardedby'])) unassignedProfiles.add(d['profileid']);
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
    const term = this.search.trim().toLowerCase();
    const wantInactive = this.activeLever === 'inactive';
    this.dataSource.data = this.allRows.filter(r => {
      // inactive (gone) participants are hidden from the active board unless explicitly viewing them
      if (this.isInactiveStatus(r.customerstatus) !== wantInactive) return false;
      if (this.activeLever === 'goingQuiet' && !r.goingQuiet) return false;
      if (this.activeLever === 'renewalWindow' && !r.renewalWindow) return false;
      if (this.activeLever === 'lapsed' && !r.lapsed) return false;
      if (this.activeLever === 'notStarted' && !r.notStarted) return false;
      if (this.journeyFilter && r.journeyname !== this.journeyFilter) return false;
      if (this.statusFilter && (r.customerstatus ?? '') !== this.statusFilter) return false;
      if (term && !(`${r.name} ${r.number ?? ''}`.toLowerCase().includes(term))) return false;
      return true;
    });
  }

  setLever(lever: Lever): void {
    this.activeLever = lever;
    this.applyFilters();
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
