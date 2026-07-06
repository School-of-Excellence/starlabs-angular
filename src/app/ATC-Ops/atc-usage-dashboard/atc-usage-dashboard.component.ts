import {
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { AtcDashboardDataService } from './atc-dashboard.data';
import {
  AtcGenDoc,
  BacklogGauge,
  DailyRollup,
  DropoffsDoc,
  FAILURE_CATEGORIES,
  LifetimeRollup,
  PodWorker,
  StageDataEntry,
} from '../atc-ops.types';
import { toDate, toMillis } from '../ist-time.util';

/** Generic async-state envelope used by every panel. */
interface Panel<T> {
  loading: boolean;
  error: string | null;
  data: T;
}
function panel<T>(initial: T): Panel<T> {
  return { loading: true, error: null, data: initial };
}

export interface ChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis | ApexYAxis[];
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  grid: ApexGrid;
  tooltip: ApexTooltip;
  legend: ApexLegend;
  colors: string[];
  labels: string[];
}

const LIVE_REFRESH_MS = 20_000;
const TREND_DAYS = 14;
const BACKLOG_DAYS = 7;

@Component({
  selector: 'app-atc-usage-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
    NgApexchartsModule,
  ],
  templateUrl: './atc-usage-dashboard.component.html',
  styleUrls: ['./atc-usage-dashboard.component.css'],
})
export class AtcUsageDashboardComponent implements OnInit, OnDestroy {
  readonly failureCategories = FAILURE_CATEGORIES;

  // ---- panel state ----
  pod = panel<PodWorker | null>(null);
  dropoffs = panel<DropoffsDoc | null>(null);
  dataIncomplete = panel<number>(0);
  drillIn = panel<AtcGenDoc[]>([]);
  drillOpen = false;
  backlog = panel<{ pending: number; processing: number }>({ pending: 0, processing: 0 });
  oldestPendingMin = panel<number | null>(null);
  stuck = panel<number>(0);
  today = panel<{ done: number; errors: number }>({ done: 0, errors: 0 });
  backlogTrend = panel<BacklogGauge[]>([]);
  backlogLatest = panel<BacklogGauge | null>(null);
  daily = panel<DailyRollup[]>([]);
  lifetime = panel<LifetimeRollup | null>(null);
  errorBreakdown = panel<Array<{ category: string; count: number }>>([]);

  lastRefreshed: number | null = null;

  // ---- charts ----
  backlogChart: Partial<ChartOptions> | null = null;
  throughputChart: Partial<ChartOptions> | null = null;
  turnaroundChart: Partial<ChartOptions> | null = null;
  failureChart: Partial<ChartOptions> | null = null;

  private unsubs: Array<() => void> = [];
  private liveTimer: any = null;

  constructor(
    private data: AtcDashboardDataService,
    private snackBar: MatSnackBar,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    // Self-updating realtime listeners (Panels A, F).
    this.unsubs.push(
      this.data.subscribePodWorker(
        (pod) => this.zone.run(() => { this.pod = { loading: false, error: null, data: pod }; }),
        (err) => this.zone.run(() => { this.pod = { loading: false, error: this.readErr(err), data: null }; }),
      ),
    );
    this.unsubs.push(
      this.data.subscribeDropoffsToday(
        (d) => this.zone.run(() => { this.dropoffs = { loading: false, error: null, data: d }; }),
        (err) => this.zone.run(() => { this.dropoffs = { loading: false, error: this.readErr(err), data: null }; }),
      ),
    );

    // Live + one-time reads on mount.
    this.refreshLive();
    this.refreshTrends();

    // Shared live-tile refresh tick (do NOT poll hourly/nightly sources here).
    this.zone.runOutsideAngular(() => {
      this.liveTimer = setInterval(() => this.zone.run(() => this.refreshLive()), LIVE_REFRESH_MS);
    });
  }

  ngOnDestroy(): void {
    this.unsubs.forEach((u) => { try { u(); } catch {} });
    this.unsubs = [];
    if (this.liveTimer) clearInterval(this.liveTimer);
  }

  /** Refresh-on-focus for the live tiles (cheap; trends stay on manual/mount). */
  @HostListener('window:focus')
  onWindowFocus(): void {
    this.refreshLive();
  }

  /** Manual "Refresh" button — refreshes everything. */
  refreshAll(): void {
    this.refreshLive();
    this.refreshTrends();
  }

  get armed(): boolean {
    return this.pod.data?.enabled === true;
  }

  // =========================================================================
  // Live tiles (B–E) — aggregation/one-time, driven by the shared tick.
  // =========================================================================
  private async refreshLive(): Promise<void> {
    this.lastRefreshed = Date.now();

    this.load(this.dataIncomplete, () => this.data.getDataIncompleteCount());
    this.load(this.backlog, () => this.data.getBacklogCounts());
    this.load(this.oldestPendingMin, () => this.data.getOldestPendingAgeMin());
    this.load(this.stuck, () => this.data.getStuckCount());
    this.load(this.today, () => this.data.getTodayDoneErrorCounts());

    if (this.drillOpen) this.loadDrillIn();
  }

  // =========================================================================
  // Trends (G,H,I,J) — hourly/nightly sources; mount + manual only.
  // =========================================================================
  private async refreshTrends(): Promise<void> {
    this.load(this.backlogTrend, () => this.data.getBacklogTrend(BACKLOG_DAYS), (t) => this.buildBacklogChart(t));
    this.load(this.backlogLatest, () => this.data.getBacklogLatest());
    this.load(this.daily, () => this.data.getDailyRollups(TREND_DAYS), (rows) => {
      this.buildThroughputChart(rows);
      this.buildTurnaroundChart(rows);
      this.buildFailureChart(rows);
    });
    this.load(this.lifetime, () => this.data.getLifetime());
  }

  toggleDrillIn(): void {
    this.drillOpen = !this.drillOpen;
    if (this.drillOpen) this.loadDrillIn();
  }

  private loadDrillIn(): void {
    this.load(this.drillIn, () => this.data.listDataIncomplete(50));
  }

  /** Placeholder hook — wire to the existing regenerate action / Screen 1. */
  onRegenerate(docId: string): void {
    this.snackBar.open(
      `Regenerate hook for ${docId} — use the ATC Generation Ops screen to action this.`,
      'Close',
      { duration: 4000, panelClass: ['warning-snackbar'] },
    );
  }

  // ---- drill-in helpers ----
  missingStages(d: AtcGenDoc): Array<{ stage: string; entry: StageDataEntry }> {
    const sd = d.stagedata ?? {};
    return Object.entries(sd)
      .filter(([, e]) => e.status === 'missing')
      .map(([stage, entry]) => ({ stage, entry }));
  }

  // =========================================================================
  // Chart builders
  // =========================================================================
  private baseChart(type: ApexChart['type'], height = 260): ApexChart {
    return { type, height, toolbar: { show: false }, fontFamily: 'inherit', animations: { enabled: false } };
  }

  private buildBacklogChart(trend: BacklogGauge[]): void {
    if (!trend.length) { this.backlogChart = null; return; }
    const labels = trend.map((t) => t.collectionName ?? '');
    this.backlogChart = {
      series: [
        { name: 'Pending', data: trend.map((t) => t.pendingCount ?? 0) },
        { name: 'Processing', data: trend.map((t) => t.processingCount ?? 0) },
        { name: 'Stuck', data: trend.map((t) => t.stuckCount ?? 0) },
        { name: 'Data-incomplete', data: trend.map((t) => t.dataincompleteCount ?? 0) },
      ],
      chart: this.baseChart('area'),
      colors: ['#3b82f6', '#8b5cf6', '#dc2626', '#d97706'],
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      xaxis: { categories: labels },
      legend: { position: 'top' },
      grid: { borderColor: '#e2e8f0' },
    };
  }

  private buildThroughputChart(rows: DailyRollup[]): void {
    if (!rows.length) { this.throughputChart = null; return; }
    this.throughputChart = {
      series: [
        { name: 'Completed', data: rows.map((r) => r.completed ?? 0) },
        { name: 'Failed', data: rows.map((r) => r.failed ?? 0) },
        { name: 'Total', data: rows.map((r) => r.total ?? 0) },
      ],
      chart: this.baseChart('bar'),
      colors: ['#059669', '#dc2626', '#3b82f6'],
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 3 } },
      dataLabels: { enabled: false },
      xaxis: { categories: rows.map((r) => r.date ?? '') },
      legend: { position: 'top' },
      grid: { borderColor: '#e2e8f0' },
    };
  }

  private buildTurnaroundChart(rows: DailyRollup[]): void {
    if (!rows.length) { this.turnaroundChart = null; return; }
    this.turnaroundChart = {
      series: [{ name: 'Avg turnaround (min)', data: rows.map((r) => this.avgTurnaroundMin(r) ?? 0) }],
      chart: this.baseChart('line', 220),
      colors: ['#0ea5e9'],
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      xaxis: { categories: rows.map((r) => r.date ?? '') },
      grid: { borderColor: '#e2e8f0' },
    };
  }

  private buildFailureChart(rows: DailyRollup[]): void {
    const agg = this.data.aggregateFailure(rows);
    const breakdown = this.failureCategories.map((c) => ({ category: c, count: agg[c] ?? 0 }));
    this.errorBreakdown = { loading: false, error: null, data: breakdown };
    const hasAny = breakdown.some((b) => b.count > 0);
    if (!hasAny) { this.failureChart = null; return; }
    this.failureChart = {
      series: [{ name: 'Failures', data: breakdown.map((b) => b.count) }],
      chart: this.baseChart('bar', 300),
      colors: ['#dc2626'],
      plotOptions: { bar: { horizontal: true, borderRadius: 3 } },
      dataLabels: { enabled: true },
      xaxis: { categories: breakdown.map((b) => b.category) },
      grid: { borderColor: '#e2e8f0' },
    };
  }

  // =========================================================================
  // Derived getters
  // =========================================================================
  avgTurnaroundMin(r: RollupLike | null): number | null {
    if (!r || !r.turnaroundCount) return null; // guard divide-by-zero
    return Math.round(((r.turnaroundMsSum ?? 0) / r.turnaroundCount) / 60000);
  }

  /** "—" when turnaround can't be computed. */
  turnaroundLabel(r: RollupLike | null): string {
    const v = this.avgTurnaroundMin(r);
    return v == null ? '—' : `${v} min`;
  }

  dropoffReasons(): Array<{ reason: string; count: number }> {
    const by = this.dropoffs.data?.byReason ?? {};
    return Object.entries(by)
      .map(([reason, count]) => ({ reason, count: count ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }

  tsToDate(v: any): Date | null {
    return toDate(v);
  }
  tsToMillis(v: any): number | null {
    return toMillis(v);
  }

  podGpuLabel(pod: PodWorker | null): string {
    if (!pod?.gpu) return '—';
    return `${pod.gpu.count}× ${pod.gpu.gpu}`;
  }

  // =========================================================================
  // Generic loader — flips loading/error/data + optional post-hook.
  // =========================================================================
  private async load<T>(
    target: Panel<T>,
    fetch: () => Promise<T>,
    after?: (data: T) => void,
  ): Promise<void> {
    target.loading = true;
    target.error = null;
    try {
      const result = await fetch();
      target.data = result;
      target.loading = false;
      if (after) after(result);
    } catch (err) {
      target.loading = false;
      target.error = this.readErr(err);
      console.error('[ATC dashboard] read failed:', err);
    }
  }

  private readErr(err: unknown): string {
    const code = (err as any)?.code as string | undefined;
    const msg = (err as any)?.message as string | undefined;
    if (code === 'permission-denied' || code === 'functions/permission-denied') {
      return 'Permission denied reading this collection.';
    }
    if (msg && /index/i.test(msg)) {
      return 'A Firestore composite index is required for this query — check the console for the creation link.';
    }
    return msg || 'Read failed. Retry.';
  }
}

interface RollupLike {
  turnaroundMsSum?: number;
  turnaroundCount?: number;
}
