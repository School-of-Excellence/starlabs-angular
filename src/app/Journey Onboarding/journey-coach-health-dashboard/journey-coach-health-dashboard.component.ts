import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  Firestore, collection, query, where, getDocs, doc, addDoc, serverTimestamp
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

import { AuthguardService } from '../../authguard.service';
import { computeHealth, normalizeTier, recencyScore, HealthState, ParticipantSignals } from './health-score.engine';

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
  // Phase-2 (gated)
  healthState: HealthState | null;
  healthCoverage: number;
}

type Lever = 'all' | 'goingQuiet' | 'renewalWindow' | 'lapsed' | 'notStarted';

@Component({
  selector: 'app-journey-coach-health-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatTableModule, MatPaginatorModule, MatSortModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatChipsModule, MatIconModule, MatButtonModule, MatMenuModule,
    MatCardModule, MatTooltipModule, MatProgressSpinnerModule,
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
  readonly SHOW_HEALTH = false;    // Phase-2: flip true only after calibration

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

  summary = { total: 0, active: 0, late: 0, discontinued: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0 };

  private pjpData: any[] = [];
  private profileMap: any = {};
  private metaMap: any = {};
  private journeyNameMap: any = {};
  private atcByJourney: Record<string, string> = {};
  private openTicketCounts: Record<string, number> = {};
  private touchpointByProfile: Record<string, number> = {};
  private contactEventByProfile: Record<string, number> = {}; // raw attended-session recency

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private datepipe: DatePipe,
    private router: Router,
    private auth: Auth,
  ) {}

  get displayedColumns(): string[] {
    const cols = ['priority', 'name', 'reason', 'journey', 'tier', 'status', 'finance',
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
    this.pjpData = pjpSnap.docs.map(d => d.data());
    this.scannedCount = this.pjpData.length;

    await this.loadOpenTicketCounts();
    await this.loadTouchpoints();
    await this.loadContactEvents();
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
    try {
      const snap = await getDocs(collection(this.firestore, 'healthtracker_touchpoint'));
      snap.forEach(d => {
        const data: any = d.data();
        const pid = data['profileid'];
        const dt = this.toDate(data['date']);
        if (pid && dt) map[pid] = Math.max(map[pid] ?? 0, dt.getTime());
      });
    } catch (e) {
      console.warn('touchpoint load failed (non-fatal)', e);
    }
    this.touchpointByProfile = map;
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

  computeRows(): void {
    const now = Date.now();
    const byProfile = new Map<string, PortfolioRow>();
    let matched = 0;
    const showAll = this.selectedCoachId === this.ALL;

    for (const d of this.pjpData) {
      if (!showAll && !this.isMine(d['onboardedby'], this.selectedCoachId)) continue;
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
          && (meta['customerstatus'] ?? '').toLowerCase() !== 'discontinued',
        notStarted: ['Initiated', 'initiated', null, undefined].includes(jstatus) && onboarded,
        priority: 0, priorityBand: 'Low', reason: '',
        healthState: null, healthCoverage: 0,
      };
      this.scoreRow(row);
      if (this.SHOW_HEALTH) this.scoreHealth(row);

      const existing = byProfile.get(profileid);
      if (!existing || row.priority > existing.priority) byProfile.set(profileid, row);
    }

    this.matchedCount = matched;
    this.allRows = Array.from(byProfile.values()).sort((a, b) => b.priority - a.priority);
    this.journeyOptions = Array.from(new Set(this.allRows.map(r => r.journeyname))).sort();
    this.computeSummary();
    this.applyFilters();
  }

  private scoreRow(r: PortfolioRow): void {
    let p = 0;
    const drivers: string[] = [];

    if (r.daysSinceCoach != null && r.daysSinceCoach > this.QUIET_DAYS) {
      p += Math.min(r.daysSinceCoach, 180) / 180 * 30;
      drivers.push(`quiet ${r.daysSinceCoach}d`);
    }
    if (r.notStarted) { p += 18; drivers.push('journey not started'); }
    if (r.lapsed) { p += 24; drivers.push(`lapsed ${Math.abs(r.daysToRenewal ?? 0)}d ago`); }
    if (r.renewalWindow) {
      p += (this.RENEWAL_DAYS - (r.daysToRenewal ?? this.RENEWAL_DAYS)) / this.RENEWAL_DAYS * 22;
      if (this.continuityOpen(r)) p += 6;
      drivers.push(`renewal ${r.daysToRenewal}d`);
    }
    const fin = (r.financialstatus ?? '').toLowerCase();
    if (fin === 'defaulted' || fin === 'locked') { p += 16; drivers.push(`${fin} payments`); }
    else if (fin === 'late') { p += 10; drivers.push('late payments'); }
    if ((r.customerstatus ?? '').toLowerCase() === 'late') p += 6;
    if (r.openTickets > 0) { p += Math.min(r.openTickets, 3) * 5; drivers.push(`${r.openTickets} open ticket${r.openTickets > 1 ? 's' : ''}`); }

    r.priority = Math.max(0, Math.min(100, Math.round(p)));
    r.priorityBand = r.priority >= 55 ? 'High' : r.priority >= 28 ? 'Medium' : 'Low';
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

  async logTouchpoint(row: PortfolioRow): Promise<void> {
    const writer = this.coachId || this.selectedCoachId || '';
    try {
      await addDoc(collection(this.firestore, 'healthtracker_touchpoint'), {
        profileid: row.profileid,
        coachid: this.selectedCoachId === this.ALL ? writer : this.selectedCoachId,
        loggedby: writer,
        date: serverTimestamp(),
        source: 'health-dashboard',
      });
      this.guard.openSnackBar(`Touchpoint logged for ${row.name}`, 'Close');
    } catch (e: any) {
      console.error('logTouchpoint write failed', e);
      this.guard.openSnackBar('Could not save touchpoint: ' + (e?.message ?? 'permission denied'), 'Close', 5000);
    }
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

  onCoachChange(id: string): void {
    this.selectedCoachId = id;
    this.activeLever = 'all';
    this.computeRows();
  }

  /** Clickable KPI cards -> set the relevant lever / status filter. */
  kpi(which: 'late' | 'discontinued' | 'renewalsSoon' | 'goingQuiet'): void {
    if (which === 'goingQuiet') { this.statusFilter = ''; this.setLever('goingQuiet'); }
    else if (which === 'renewalsSoon') { this.statusFilter = ''; this.setLever('renewalWindow'); }
    else { this.activeLever = 'all'; this.statusFilter = which === 'late' ? 'late' : 'discontinued'; this.applyFilters(); }
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

  private computeSummary(): void {
    const s = { total: 0, active: 0, late: 0, discontinued: 0, renewalsSoon: 0, lapsed: 0, withOpenTickets: 0, goingQuiet: 0, notStarted: 0 };
    for (const r of this.allRows) {
      s.total++;
      const cs = (r.customerstatus ?? '').toLowerCase();
      if (cs === 'active') s.active++;
      else if (cs === 'late') s.late++;
      else if (cs === 'discontinued' || cs === 'banned') s.discontinued++;
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
    this.dataSource.data = this.allRows.filter(r => {
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
