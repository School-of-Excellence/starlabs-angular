import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NgApexchartsModule } from 'ng-apexcharts';

import { SalesNumbersService, SalesFilters } from './sales-numbers.service';
import { DashboardData, SaleLead, SalesTeam, SalesGroupMetric, SourceOption, Timeframe } from './sales-numbers.models';

interface FlagRow { name: string; flagged: boolean; roleDocId: string; matched: boolean; }

@Component({
  selector: 'app-sales-numbers',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatButtonToggleModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatButtonModule, MatIconModule, MatTableModule,
    MatDatepickerModule, MatNativeDateModule, MatProgressSpinnerModule, MatTooltipModule,
    MatChipsModule, MatSnackBarModule, NgApexchartsModule,
  ],
  templateUrl: './sales-numbers.component.html',
  styleUrl: './sales-numbers.component.css',
})
export class SalesNumbersComponent implements OnInit {
  loading = true;

  // controls — default GSV over the last 90 days (real data is sparse in 30d); users can re-filter freely
  timeframe: Timeframe = 'last90';
  monthStart = this.firstOfThisMonth();
  monthEnd = new Date();
  view: 'person' | 'team' = 'person';
  metric: 'gsv' | 'asv' = 'gsv'; // global metric filter

  filters: SalesFilters = { sources: [], salespeople: [], team: '' };

  // single merged screen with a top toggle
  screen: 'dashboard' | 'teams' | 'salespeople' | 'sources' = 'dashboard';

  // teams view state
  teams: SalesTeam[] = [];
  teamSalespeople: string[] = [];                       // all salespeople seen in sales (assignable)
  private nameToProfileId = new Map<string, string>();  // salespersonname -> profileid (users_roles)
  private profileIdToName = new Map<string, string>();  // reverse, for member-chip display
  newTeamName = '';
  saving = false;

  // salespeople flag helper
  flagRows: FlagRow[] = [];
  flagLoading = false;
  private flagsLoaded = false;
  savingFlag = '';

  // assign-source view state — sources are configurable via classify/source_options (Firestore-only)
  sourceOptions: SourceOption[] = [];
  private sourceIdToName = new Map<string, string>();
  sourceRows: SaleLead[] = [];
  sourceLoading = false;
  private sourcesLoaded = false;

  // data caches (sales refetched only when the range changes; filters/view re-aggregate locally)
  private salesCache: SaleLead[] = [];
  private cancellationsCache: SaleLead[] = [];
  private monthlySalesCache: SaleLead[] = [];

  data: DashboardData | null = null;
  groupColumns = ['group', 'sales', 'cancelled', 'net'];
  sourceColumns = ['participant', 'product', 'person', 'date', 'source'];

  // chart inputs (ng-apexcharts) — Sales vs Cancellations per month
  chartSeries: any[] = [];
  chartDetails: any = { type: 'bar', height: 300, toolbar: { show: false }, fontFamily: 'inherit' };
  chartXaxis: any = { categories: [] };
  chartColors = ['#0A84FF', '#FF3B30']; // iOS blue (sales), iOS red (cancellations)
  chartPlotOptions: any = { bar: { borderRadius: 5, columnWidth: '55%' } };
  chartDataLabels: any = { enabled: false };
  chartGrid: any = { borderColor: '#eee', strokeDashArray: 4 };
  chartLegend: any = { position: 'top', horizontalAlign: 'right', markers: { radius: 4 } };

  constructor(private svc: SalesNumbersService, private snack: MatSnackBar) {}

  async ngOnInit(): Promise<void> {
    this.sourceOptions = await this.svc.loadSourceOptions();
    this.sourceIdToName = new Map(this.sourceOptions.map((o) => [o.id, o.name]));
    await this.loadTeamsData();
    await this.reload();
  }

  // ---- screen toggle ----
  async onScreenChange(s: 'dashboard' | 'teams' | 'salespeople' | 'sources'): Promise<void> {
    this.screen = s;
    if (s === 'sources' && !this.sourcesLoaded) await this.loadSources();
    if (s === 'salespeople' && !this.flagsLoaded) await this.loadSalespeopleFlags();
  }

  // ---- range derivation ----
  private firstOfThisMonth(): Date {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }

  private computeRange(): { start: Date; end: Date } {
    if (this.timeframe === 'month') {
      const start = new Date(this.monthStart); start.setHours(0, 0, 0, 0);
      const end = new Date(this.monthEnd); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    const days = this.timeframe === 'last7' ? 7 : this.timeframe === 'last90' ? 90 : 30;
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setDate(start.getDate() - (days - 1)); start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  // ---- data flow ----
  // Refetch sales (range changed) then re-aggregate.
  async reload(): Promise<void> {
    this.loading = true;
    const { start, end } = this.computeRange();
    [this.salesCache, this.cancellationsCache, this.monthlySalesCache] = await Promise.all([
      this.svc.loadSalesInRange(start, end),
      this.svc.loadCancellations(6),
      this.svc.loadSalesSince(6),
    ]);
    this.recompute();
    this.loading = false;
  }

  // Re-aggregate from caches only (filters / view / metric changed — no refetch needed).
  recompute(): void {
    const { start, end } = this.computeRange();
    this.data = this.svc.aggregate(
      this.salesCache, this.teams, this.monthlySalesCache, this.cancellationsCache,
      this.filters, this.view, this.metric, start, end, this.nameToProfileId, this.sourceIdToName,
    );
    this.buildChart();
  }

  onTimeframeChange(tf: Timeframe): void { this.timeframe = tf; this.reload(); }
  onMonthRangeChange(): void { if (this.timeframe === 'month') this.reload(); }
  onViewChange(v: 'person' | 'team'): void { this.view = v; this.recompute(); }
  onFilterChange(): void { this.recompute(); }

  // ---- teams (profileid-keyed; assign any salesperson by name -> profileid) ----
  private async loadTeamsData(): Promise<void> {
    const [teams, salespeople] = await Promise.all([
      this.svc.loadTeams(),
      this.svc.loadAllSalespeople(), // distinct names seen in real sales (12 mo)
    ]);
    // resolve every salesperson name -> profileid via users_roles (bounded chunked read)
    this.nameToProfileId = await this.svc.loadProfileIdsForNames(salespeople);
    this.profileIdToName = new Map([...this.nameToProfileId].map(([name, pid]) => [pid, name]));
    this.teamSalespeople = salespeople.sort((a, b) => a.localeCompare(b));

    // auto-heal legacy text members -> profileids (one-time; only persists what it can resolve)
    const heals: Promise<void>[] = [];
    for (const t of teams) {
      const healed = t.members.map((m) => this.nameToProfileId.get(m) ?? m);
      if (healed.some((v, i) => v !== t.members[i])) {
        t.members = healed;
        heals.push(this.svc.saveTeamMembers(t.id, healed));
      }
    }
    await Promise.all(heals);

    this.teams = teams.sort((a, b) => a.team.localeCompare(b.team));
  }

  nameForId(profileid: string): string { return this.profileIdToName.get(profileid) ?? profileid; }
  resolvable(name: string): boolean { return this.nameToProfileId.has(name); }

  // team id a profileid currently belongs to ('' = unassigned)
  teamIdOf(profileid: string): string {
    return this.teams.find((t) => t.members.includes(profileid))?.id ?? '';
  }

  // team a salesperson (by name) currently belongs to; '' when unresolved or unassigned
  teamIdOfName(name: string): string {
    const pid = this.nameToProfileId.get(name);
    return pid ? this.teamIdOf(pid) : '';
  }

  async assignTeamByName(name: string, newTeamId: string): Promise<void> {
    const pid = this.nameToProfileId.get(name);
    if (!pid) {
      this.snack.open(`No user record for "${name}" — can't store a profile id.`, 'OK', { duration: 3500 });
      return;
    }
    await this.assignTeam(pid, newTeamId);
  }

  async assignTeam(profileid: string, newTeamId: string): Promise<void> {
    const oldTeamId = this.teamIdOf(profileid);
    if (oldTeamId === newTeamId) return;
    this.saving = true;
    try {
      const writes: Promise<void>[] = [];
      if (oldTeamId) {
        const old = this.teams.find((t) => t.id === oldTeamId)!;
        old.members = old.members.filter((m) => m !== profileid);
        writes.push(this.svc.saveTeamMembers(old.id, old.members));
      }
      if (newTeamId) {
        const next = this.teams.find((t) => t.id === newTeamId)!;
        if (!next.members.includes(profileid)) next.members = [...next.members, profileid];
        writes.push(this.svc.saveTeamMembers(next.id, next.members));
      }
      await Promise.all(writes);
      this.recompute();
    } finally {
      this.saving = false;
    }
  }

  async createTeam(): Promise<void> {
    const name = this.newTeamName.trim();
    if (!name) return;
    if (this.teams.some((t) => t.team.toLowerCase() === name.toLowerCase())) {
      this.snack.open('A team with that name already exists.', 'OK', { duration: 2500 });
      return;
    }
    this.saving = true;
    try {
      await this.svc.createTeam(name);
      this.newTeamName = '';
      await this.loadTeamsData(); // #1: refresh so the new team appears in cards, roster and the dashboard filter
      this.recompute();
    } finally {
      this.saving = false;
    }
  }

  async removeMember(profileid: string): Promise<void> {
    await this.assignTeam(profileid, '');
  }

  async deleteTeam(team: SalesTeam): Promise<void> {
    this.saving = true;
    try {
      await this.svc.deleteTeam(team.id);
      this.teams = this.teams.filter((t) => t.id !== team.id);
      this.snack.open(`Deleted ${team.team}`, 'OK', { duration: 2000 });
      this.recompute();
    } finally {
      this.saving = false;
    }
  }

  // ---- salespeople flag helper (#2 — mark salespeople in users_roles) ----
  private async loadSalespeopleFlags(): Promise<void> {
    this.flagLoading = true;
    try {
      const [names, roster] = await Promise.all([
        this.svc.loadAllSalespeople(),   // distinct names appearing in real sales
        this.svc.loadSalespersonRoster(), // already-flagged salespeople
      ]);
      const flaggedByName = new Map(roster.map((r) => [r.name, r]));
      this.flagRows = names.map((name) => {
        const hit = flaggedByName.get(name);
        return { name, flagged: !!hit, roleDocId: hit?.roleDocId ?? '', matched: !!hit } as FlagRow;
      });
      this.flagsLoaded = true;
    } finally {
      this.flagLoading = false;
    }
  }

  async toggleFlag(row: FlagRow): Promise<void> {
    this.savingFlag = row.name;
    try {
      if (!row.flagged) {
        const matches = await this.svc.findRolesByName(row.name);
        if (!matches.length) {
          this.snack.open(`No profile matches "${row.name}" — flag it from that person's profile.`, 'OK', { duration: 3500 });
          return;
        }
        await this.svc.setSalespersonFlag(matches[0].roleDocId, true);
        row.roleDocId = matches[0].roleDocId; row.flagged = true; row.matched = true;
      } else if (row.roleDocId) {
        await this.svc.setSalespersonFlag(row.roleDocId, false);
        row.flagged = false;
      }
      await this.loadTeamsData(); // refresh roster + name→profileid maps
      this.recompute();
    } finally {
      this.savingFlag = '';
    }
  }

  // ---- assign source (#8) ----
  private async loadSources(): Promise<void> {
    this.sourceLoading = true;
    try {
      const sales = await this.svc.loadSalesSince(12);
      this.sourceRows = sales
        .filter((s) => ['new', 'upgrade', 'addons'].includes(s.journeytype))
        .sort((a, b) => (b.purchasedate?.getTime() ?? 0) - (a.purchasedate?.getTime() ?? 0));
      this.sourcesLoaded = true;
    } finally {
      this.sourceLoading = false;
    }
  }

  async setSource(row: SaleLead, value: string): Promise<void> {
    const prev = row.source;
    row.source = value;
    try {
      await this.svc.updateSaleSource(row.docid, value);
    } catch {
      row.source = prev;
      this.snack.open('Could not save source', 'OK', { duration: 2500 });
    }
  }

  clearFilters(): void {
    this.filters = { sources: [], salespeople: [], team: '' };
    this.recompute();
  }

  // active-team chip: empty when no team is selected
  get activeTeam(): string { return this.filters.team; }

  // vivid iOS system colours (solid icon tile + total)
  segColor(name: string): string {
    switch (name) {
      case 'Ecosystem': return '#007AFF';  // systemBlue
      case 'DFU': return '#34C759';         // systemGreen
      case 'FTO + Gift': return '#FF9500';  // systemOrange
      case 'All': return '#5856D6';         // systemIndigo
      default: return '#8E8E93';
    }
  }
  // soft same-hue card wash
  segWash(name: string): string {
    switch (name) {
      case 'Ecosystem': return 'rgba(0,122,255,0.10)';
      case 'DFU': return 'rgba(52,199,89,0.11)';
      case 'FTO + Gift': return 'rgba(255,149,0,0.11)';
      case 'All': return 'rgba(88,86,214,0.10)';
      default: return 'transparent';
    }
  }
  segIcon(name: string): string {
    switch (name) {
      case 'Ecosystem': return 'hub';
      case 'DFU': return 'trending_up';
      case 'FTO + Gift': return 'card_giftcard';
      case 'All': return 'functions';
      default: return 'sell';
    }
  }

  // sale-type split counts, metric-aware (used by the segment cards)
  newCount(g: SalesGroupMetric): number { return this.metric === 'asv' ? g.newAssuredCount : g.newGrossCount; }
  upgradeCount(g: SalesGroupMetric): number { return this.metric === 'asv' ? g.upgradeAssuredCount : g.upgradeGrossCount; }
  addonsCount(g: SalesGroupMetric): number { return this.metric === 'asv' ? g.addonsAssuredCount : g.addonsGrossCount; }

  private buildChart(): void {
    if (!this.data) return;
    const label = this.metric === 'asv' ? 'Assured Sales' : 'Sales';
    this.chartSeries = [
      { name: label, data: this.data.monthly.map((m) => m.salesCount) },
      { name: 'Cancellations', data: this.data.monthly.map((m) => m.cancelledCount) },
    ];
    this.chartXaxis = { categories: this.data.monthly.map((m) => m.month) };
  }

  // ---- active-metric helpers (the global GSV / ASV filter) ----
  activeCount(g: SalesGroupMetric): number {
    return this.metric === 'asv' ? g.assuredCount : g.grossCount;
  }
  activeValue(g: SalesGroupMetric): number {
    return this.metric === 'asv' ? g.asv : g.gsv;
  }
  // cancellations are not metric-split (journey-coach tracks them independently)
  activeCancelledCount(g: SalesGroupMetric): number { return g.cancelledCount; }
  activeCancelledValue(g: SalesGroupMetric): number { return g.cancelledValue; }
  activeNetCount(g: SalesGroupMetric): number {
    return this.activeCount(g) - this.activeCancelledCount(g);
  }
  activeNet(g: SalesGroupMetric): number {
    return this.activeValue(g) - this.activeCancelledValue(g);
  }
  get metricLabel(): string {
    return this.metric === 'asv' ? 'Assured Sales (ASV)' : 'Gross Sales (GSV)';
  }
  get metricHeader(): string {
    return this.metric === 'asv' ? 'Assured (ASV)' : 'Gross (GSV)';
  }

  // ---- formatting ----
  inr(n: number): string {
    return '₹' + Math.round(n || 0).toLocaleString('en-IN');
  }
  pct(part: number, whole: number): string {
    if (!whole) return '0%';
    return Math.round((part / whole) * 100) + '%';
  }
}
