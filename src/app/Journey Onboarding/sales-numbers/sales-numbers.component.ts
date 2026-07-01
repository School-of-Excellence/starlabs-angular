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
import { NgApexchartsModule } from 'ng-apexcharts';

import { SalesNumbersService, SalesFilters } from './sales-numbers.service';
import { DashboardData, SaleLead, SalesTeam, SalesGroupMetric, Timeframe } from './sales-numbers.models';

@Component({
  selector: 'app-sales-numbers',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatButtonToggleModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatButtonModule, MatIconModule, MatTableModule,
    MatDatepickerModule, MatNativeDateModule, MatProgressSpinnerModule, MatTooltipModule,
    NgApexchartsModule,
  ],
  templateUrl: './sales-numbers.component.html',
  styleUrl: './sales-numbers.component.css',
})
export class SalesNumbersComponent implements OnInit {
  loading = true;

  // controls — default view is ASV over the last 30 days; users can re-filter freely
  timeframe: Timeframe = 'last30';
  monthStart = this.firstOfThisMonth();
  monthEnd = new Date();
  view: 'person' | 'team' = 'person';
  metric: 'gsv' | 'asv' = 'asv'; // global metric filter; ASV by default

  filters: SalesFilters = { sources: [], originalSources: [], salespeople: [], products: ['Ecosystem'], types: [], team: '' };

  // data caches (sales refetched only when the range changes; filters/view re-aggregate locally)
  private teamsCache: SalesTeam[] = [];
  private salesCache: SaleLead[] = [];
  private cancellationsCache: SaleLead[] = [];
  private monthlySalesCache: SaleLead[] = [];

  data: DashboardData | null = null;
  groupColumns = ['group', 'sales', 'cancelled', 'net'];

  // chart inputs (ng-apexcharts) — Sales vs Cancellations per month
  chartSeries: any[] = [];
  chartDetails: any = { type: 'bar', height: 300, toolbar: { show: false }, fontFamily: 'inherit' };
  chartXaxis: any = { categories: [] };
  chartColors = ['#0A84FF', '#FF3B30']; // iOS blue (sales), iOS red (cancellations)
  chartPlotOptions: any = { bar: { borderRadius: 5, columnWidth: '55%' } };
  chartDataLabels: any = { enabled: false };
  chartGrid: any = { borderColor: '#eee', strokeDashArray: 4 };
  chartLegend: any = { position: 'top', horizontalAlign: 'right', markers: { radius: 4 } };

  constructor(private svc: SalesNumbersService) {}

  async ngOnInit(): Promise<void> {
    this.teamsCache = await this.svc.loadTeams();
    await this.reload();
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
    const days = this.timeframe === 'last7' ? 7 : 30;
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
      this.salesCache, this.teamsCache, this.monthlySalesCache, this.cancellationsCache,
      this.filters, this.view, this.metric, start, end,
    );
    this.buildChart();
  }

  onTimeframeChange(tf: Timeframe): void { this.timeframe = tf; this.reload(); }
  onMonthRangeChange(): void { if (this.timeframe === 'month') this.reload(); }
  onViewChange(v: 'person' | 'team'): void { this.view = v; this.recompute(); }
  onFilterChange(): void { this.recompute(); }

  clearFilters(): void {
    this.filters = { sources: [], originalSources: [], salespeople: [], products: [], types: [], team: '' };
    this.recompute();
  }

  // pretty label for a sale type value
  typeLabel(t: string): string {
    return t === 'new' ? 'New Sale' : t === 'upgrade' ? 'Upgrade' : t === 'addons' ? 'Add-on' : t;
  }

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
  activeCancelledCount(g: SalesGroupMetric): number {
    return this.metric === 'asv' ? g.assuredCancelledCount : g.cancelledCount;
  }
  activeCancelledValue(g: SalesGroupMetric): number {
    return this.metric === 'asv' ? g.assuredCancelledValue : g.cancelledValue;
  }
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
