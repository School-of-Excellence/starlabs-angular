import { Injectable } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs, Timestamp,
  doc, setDoc, updateDoc, deleteDoc,
} from '@angular/fire/firestore';
import {
  SaleLead, SalesTeam, SalesGroupMetric,
  MonthlyPoint, DashboardData,
} from './sales-numbers.models';

export interface SalesFilters {
  sources: string[];
  originalSources: string[];
  salespeople: string[];
  team: string; // '' = all teams
}

// map a product category to its card segment (FTO + Gift are clubbed)
const SEGMENT_OF: Record<string, string> = { Ecosystem: 'Ecosystem', DFU: 'DFU', FTO: 'FTO + Gift', Gift: 'FTO + Gift' };
const SEGMENT_ORDER = ['Ecosystem', 'DFU', 'FTO + Gift'];

const DOWNGRADE_TYPES = ['downgradetoold', 'downgradetonew', 'downgrade'];

@Injectable({ providedIn: 'root' })
export class SalesNumbersService {
  constructor(private firestore: Firestore) {}

  // ---- Firestore reads -------------------------------------------------------

  async loadTeams(): Promise<SalesTeam[]> {
    const snap = await getDocs(collection(this.firestore, 'sales_teams'));
    return snap.docs.map((d) => {
      const v = d.data() as any;
      return { id: d.id, team: v['team'] ?? d.id, members: Array.isArray(v['members']) ? v['members'] : [] };
    });
  }

  // Sales whose SALE date OR cancellation date falls in [start, end]. Two single-field
  // range queries merged by docid (avoids a composite `or` index).
  async loadSalesInRange(start: Date, end: Date): Promise<SaleLead[]> {
    const s = Timestamp.fromDate(start);
    const e = Timestamp.fromDate(end);
    const col = collection(this.firestore, 'salesleads');

    const [byPurchase, byDate] = await Promise.all([
      getDocs(query(col, where('purchasedate', '>=', s), where('purchasedate', '<=', e))),
      getDocs(query(col, where('date', '>=', s), where('date', '<=', e))),
    ]);

    const merged = new Map<string, SaleLead>();
    for (const d of [...byPurchase.docs, ...byDate.docs]) {
      const lead = this.mapLead(d.id, d.data());
      merged.set(lead.docid, lead);
    }
    return [...merged.values()];
  }

  // Distinct salesperson names present in `salesleads` (test-scale read of the collection).
  async loadAllSalespeople(): Promise<string[]> {
    const snap = await getDocs(collection(this.firestore, 'salesleads'));
    const names = snap.docs.map((d) => (d.data() as any)['salespersonname']).filter(Boolean);
    return this.distinct(names);
  }

  // ---- team-management writes (sales_teams) ----
  async saveTeamMembers(teamId: string, members: string[]): Promise<void> {
    await updateDoc(doc(this.firestore, 'sales_teams', teamId), {
      members, lastupdate: Timestamp.fromDate(new Date()),
    });
  }

  async createTeam(name: string): Promise<string> {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `team_${Date.now()}`;
    await setDoc(doc(this.firestore, 'sales_teams', id), {
      team: name.trim(), members: [], seedTag: 'sales-numbers', lastupdate: Timestamp.fromDate(new Date()),
    });
    return id;
  }

  async deleteTeam(teamId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'sales_teams', teamId));
  }

  private monthsAgoStart(months: number): Date {
    const start = new Date();
    start.setMonth(start.getMonth() - (months - 1), 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  // Cancellations over the last `months` months, for the per-month chart.
  async loadCancellations(months: number): Promise<SaleLead[]> {
    const snap = await getDocs(query(
      collection(this.firestore, 'salesleads'),
      where('date', '>=', Timestamp.fromDate(this.monthsAgoStart(months))),
    ));
    return snap.docs
      .map((d) => this.mapLead(d.id, d.data()))
      .filter((l) => l.journeytype === 'cancelled');
  }

  // Gross sales over the last `months` months, for the per-month chart.
  async loadSalesSince(months: number): Promise<SaleLead[]> {
    const snap = await getDocs(query(
      collection(this.firestore, 'salesleads'),
      where('purchasedate', '>=', Timestamp.fromDate(this.monthsAgoStart(months))),
    ));
    return snap.docs
      .map((d) => this.mapLead(d.id, d.data()))
      .filter((l) => this.isGross(l));
  }

  private mapLead(id: string, v: any): SaleLead {
    return {
      docid: v['docid'] ?? id,
      salespersonname: v['salespersonname'] ?? 'Unknown',
      presalespersonname: v['presalespersonname'] ?? 'Unknown',
      source: v['source'] ?? '',
      originalsource: v['originalsource'] ?? '',
      product: v['product'] ?? '',
      productName: v['productName'] ?? '',
      saleType: v['saletype'] ?? (['new', 'upgrade', 'addons'].includes(v['journeytype']) ? v['journeytype'] : ''),
      journeytype: v['journeytype'] ?? '',
      totalpurchasevalue: Number(v['totalpurchasevalue']) || 0,
      purchasedate: this.toDate(v['purchasedate']),
      date: this.toDate(v['date']),
      paymentplanassureddate: this.toDate(v['paymentplanassureddate']),
      canceldocid: v['canceldocid'] ?? undefined,
    };
  }

  private toDate(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'number') return new Date(v);
    return null;
  }

  // ---- classification helpers ------------------------------------------------

  private isCancelled = (l: SaleLead) => l.journeytype === 'cancelled';
  private isDowngrade = (l: SaleLead) => DOWNGRADE_TYPES.includes(l.journeytype);
  private isGross = (l: SaleLead) => !this.isCancelled(l) && !this.isDowngrade(l);
  // a record (sale OR cancellation) is "assured" if it carries an assured payment plan
  private hasAssured = (l: SaleLead) => !!l.paymentplanassureddate;
  private isAssured = (l: SaleLead) => this.isGross(l) && this.hasAssured(l);

  // ---- pure aggregation ------------------------------------------------------

  aggregate(
    sales: SaleLead[],
    teams: SalesTeam[],
    salesForChart: SaleLead[],
    cancellationsForChart: SaleLead[],
    filters: SalesFilters,
    view: 'person' | 'team',
    metric: 'gsv' | 'asv',
    start: Date,
    end: Date,
  ): DashboardData {
    const asv = metric === 'asv';
    const memberToTeam = new Map<string, string>();
    for (const t of teams) for (const m of t.members) memberToTeam.set(m, t.team);
    const teamOf = (person: string) => memberToTeam.get(person) ?? 'Unassigned';

    // composable per-field filter predicates (an empty filter passes everything).
    // NOTE: there is no product/type filter any more — product is shown as segment cards,
    // and sale type is folded into each card as the New/Upgrade/Add-on split.
    const fSource = (l: SaleLead) => !filters.sources.length || filters.sources.includes(l.source);
    const fOriginal = (l: SaleLead) => !filters.originalSources.length || filters.originalSources.includes(l.originalsource);
    const fPerson = (l: SaleLead) => !filters.salespeople.length || filters.salespeople.includes(l.salespersonname);
    const fTeam = (l: SaleLead) => !filters.team || teamOf(l.salespersonname) === filters.team;

    const passesFilters = (l: SaleLead) => fSource(l) && fOriginal(l) && fPerson(l) && fTeam(l);
    // the source breakdown ignores its own source filter (so all sources always show) but honours the rest
    const passesExceptSource = (l: SaleLead) => fOriginal(l) && fPerson(l) && fTeam(l);

    const filtered = sales.filter(passesFilters);
    const groupKey = (l: SaleLead) => (view === 'team' ? teamOf(l.salespersonname) : l.salespersonname);

    const aValue = (m: SalesGroupMetric) => (asv ? m.asv : m.gsv);
    const byActive = (a: SalesGroupMetric, b: SalesGroupMetric) => aValue(b) - aValue(a);

    // person/team breakdown table
    const groups = [...this.accumulate(filtered, groupKey, start, end).values()].sort(byActive);

    // source breakdown — ignores the source filter, honours the rest
    const bySource = [...this.accumulate(sales.filter(passesExceptSource), (l) => l.source || 'Unspecified', start, end).values()].sort(byActive);

    // product-segment cards (Ecosystem / DFU / FTO+Gift), plus the All rollup
    const segMap = this.accumulate(filtered, (l) => SEGMENT_OF[l.product] || 'Other', start, end);
    const segments = SEGMENT_ORDER.map((key) => segMap.get(key) ?? this.zeroMetric(key));
    const allSegment = [...this.accumulate(filtered, () => 'All', start, end).values()][0] ?? this.zeroMetric('All');
    const totals = allSegment; // the All card is also the table roll-up

    // ---- monthly sales vs cancellations (chart) — honours filters AND the active metric ----
    const chartSales = salesForChart
      .filter(passesFilters)
      .filter((s) => this.isGross(s) && (!asv || this.hasAssured(s)));
    const chartCancellations = cancellationsForChart
      .filter(passesFilters)
      .filter((c) => !asv || this.hasAssured(c));
    const monthly = this.buildMonthly(chartSales, chartCancellations, 6);

    // ---- filter option lists ----
    const sources = this.distinct(sales.map((l) => l.source));
    const originalSources = this.distinct(sales.map((l) => l.originalsource));
    const salespeople = this.distinct([...sales.map((l) => l.salespersonname), ...memberToTeam.keys()]);
    const teamNames = this.distinct(teams.map((t) => t.team));

    return { segments, allSegment, groups, bySource, totals, monthly, sources, originalSources, salespeople, teams: teamNames };
  }

  private zeroMetric(group: string): SalesGroupMetric {
    return {
      group, grossCount: 0, gsv: 0, assuredCount: 0, asv: 0, cancelledCount: 0, cancelledValue: 0,
      assuredCancelledCount: 0, assuredCancelledValue: 0,
      newGrossCount: 0, newAssuredCount: 0, upgradeGrossCount: 0, upgradeAssuredCount: 0, addonsGrossCount: 0, addonsAssuredCount: 0,
    };
  }

  // Build a per-group metric map: gross/assured sales (by purchasedate in range) and
  // gross/assured cancellations (by cancel date in range). Shared by the person/team
  // and the product breakdowns.
  private accumulate(list: SaleLead[], keyOf: (l: SaleLead) => string, start: Date, end: Date): Map<string, SalesGroupMetric> {
    const map = new Map<string, SalesGroupMetric>();
    const ensure = (g: string): SalesGroupMetric => {
      let m = map.get(g);
      if (!m) { m = this.zeroMetric(g); map.set(g, m); }
      return m;
    };
    const inRange = (d: Date | null) => !!d && d >= start && d <= end;
    for (const l of list) {
      const m = ensure(keyOf(l));
      if (this.isGross(l) && inRange(l.purchasedate)) {
        m.grossCount++;
        m.gsv += l.totalpurchasevalue;
        const assured = this.isAssured(l);
        if (assured) { m.assuredCount++; m.asv += l.totalpurchasevalue; }
        if (l.saleType === 'new') { m.newGrossCount++; if (assured) m.newAssuredCount++; }
        else if (l.saleType === 'upgrade') { m.upgradeGrossCount++; if (assured) m.upgradeAssuredCount++; }
        else if (l.saleType === 'addons') { m.addonsGrossCount++; if (assured) m.addonsAssuredCount++; }
      }
      if (this.isCancelled(l) && inRange(l.date)) {
        m.cancelledCount++;
        m.cancelledValue += l.totalpurchasevalue;
        if (this.hasAssured(l)) { m.assuredCancelledCount++; m.assuredCancelledValue += l.totalpurchasevalue; }
      }
    }
    return map;
  }

  // sales bucketed by purchasedate, cancellations bucketed by cancel date — both pre-filtered by caller.
  private buildMonthly(sales: SaleLead[], cancellations: SaleLead[], months: number): MonthlyPoint[] {
    const buckets = new Map<string, MonthlyPoint>();
    const labels: string[] = [];
    const base = new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(base); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      buckets.set(key, { month: label, salesCount: 0, salesValue: 0, cancelledCount: 0, cancelledValue: 0 });
      labels.push(key);
    }
    for (const s of sales) {
      if (!s.purchasedate) continue;
      const b = buckets.get(`${s.purchasedate.getFullYear()}-${s.purchasedate.getMonth()}`);
      if (b) { b.salesCount++; b.salesValue += s.totalpurchasevalue; }
    }
    for (const c of cancellations) {
      if (!c.date) continue;
      const b = buckets.get(`${c.date.getFullYear()}-${c.date.getMonth()}`);
      if (b) { b.cancelledCount++; b.cancelledValue += c.totalpurchasevalue; }
    }
    return labels.map((k) => buckets.get(k)!);
  }

  private distinct(arr: string[]): string[] {
    return [...new Set(arr.filter((x) => x && x.trim()))].sort();
  }
}
