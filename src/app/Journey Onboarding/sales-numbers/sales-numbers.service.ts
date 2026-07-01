import { Injectable } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs, Timestamp,
  doc, setDoc, updateDoc, deleteDoc,
} from '@angular/fire/firestore';
import {
  SaleLead, SalesTeam, SalesGroupMetric, NetContribution,
  MonthlyPoint, DashboardData,
} from './sales-numbers.models';

export interface SalesFilters {
  sources: string[];
  originalSources: string[];
  salespeople: string[];
  products: string[];
  types: string[];
  team: string; // '' = all teams
}

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

    // composable per-field filter predicates (an empty filter passes everything)
    const fSource = (l: SaleLead) => !filters.sources.length || filters.sources.includes(l.source);
    const fOriginal = (l: SaleLead) => !filters.originalSources.length || filters.originalSources.includes(l.originalsource);
    const fPerson = (l: SaleLead) => !filters.salespeople.length || filters.salespeople.includes(l.salespersonname);
    const fTeam = (l: SaleLead) => !filters.team || teamOf(l.salespersonname) === filters.team;
    const fProduct = (l: SaleLead) => !filters.products.length || filters.products.includes(l.product);
    const fType = (l: SaleLead) => !filters.types.length || filters.types.includes(l.saleType);

    const passesFilters = (l: SaleLead) => fSource(l) && fOriginal(l) && fPerson(l) && fTeam(l) && fProduct(l) && fType(l);
    // each dimension's own breakdown IGNORES its own filter (so all its values always show) but honours the rest
    const passesExceptSource = (l: SaleLead) => fOriginal(l) && fPerson(l) && fTeam(l) && fProduct(l) && fType(l);
    const passesExceptType = (l: SaleLead) => fSource(l) && fOriginal(l) && fPerson(l) && fTeam(l) && fProduct(l);

    const filtered = sales.filter(passesFilters);
    const groupKey = (l: SaleLead) => (view === 'team' ? teamOf(l.salespersonname) : l.salespersonname);

    // active-metric pickers (the global GSV/ASV filter)
    const aCount = (m: SalesGroupMetric) => (asv ? m.assuredCount : m.grossCount);
    const aValue = (m: SalesGroupMetric) => (asv ? m.asv : m.gsv);
    const aCancelCount = (m: SalesGroupMetric) => (asv ? m.assuredCancelledCount : m.cancelledCount);
    const aCancelValue = (m: SalesGroupMetric) => (asv ? m.assuredCancelledValue : m.cancelledValue);
    const byActive = (a: SalesGroupMetric, b: SalesGroupMetric) => aValue(b) - aValue(a);

    const map = this.accumulate(filtered, groupKey, start, end);
    const groups = [...map.values()].sort(byActive);

    // product breakdown — by SPECIFIC product (uP!, LYL, ...), honouring the category filter above
    const byProduct = [...this.accumulate(filtered, (l) => l.productName || 'Unspecified', start, end).values()].sort(byActive);

    // type breakdown — by sale type (new/upgrade/addons). Ignores the type filter, honours the rest.
    const byType = [...this.accumulate(sales.filter(passesExceptType), (l) => l.saleType || 'Other', start, end).values()].sort(byActive);

    // source breakdown — by lead source. Ignores the source filter, honours the rest.
    const bySource = [...this.accumulate(sales.filter(passesExceptSource), (l) => l.source || 'Unspecified', start, end).values()].sort(byActive);

    const totals: SalesGroupMetric = groups.reduce((acc, g) => ({
      group: 'All',
      grossCount: acc.grossCount + g.grossCount,
      gsv: acc.gsv + g.gsv,
      assuredCount: acc.assuredCount + g.assuredCount,
      asv: acc.asv + g.asv,
      cancelledCount: acc.cancelledCount + g.cancelledCount,
      cancelledValue: acc.cancelledValue + g.cancelledValue,
      assuredCancelledCount: acc.assuredCancelledCount + g.assuredCancelledCount,
      assuredCancelledValue: acc.assuredCancelledValue + g.assuredCancelledValue,
    }), { group: 'All', grossCount: 0, gsv: 0, assuredCount: 0, asv: 0, cancelledCount: 0, cancelledValue: 0, assuredCancelledCount: 0, assuredCancelledValue: 0 });

    // ---- Net Contribution panel (follows the active metric) ----
    const cmStart = new Date(); cmStart.setDate(1); cmStart.setHours(0, 0, 0, 0);
    const cmEnd = new Date(cmStart); cmEnd.setMonth(cmEnd.getMonth() + 1); cmEnd.setMilliseconds(-1);
    const inCurrentMonth = (d: Date | null) => !!d && d >= cmStart && d <= cmEnd;

    let cancelledFromCurrentMonth = 0, cancelledFromCurrentMonthCount = 0;
    for (const l of filtered) {
      if (this.isCancelled(l) && inCurrentMonth(l.purchasedate) && (!asv || this.hasAssured(l))) {
        cancelledFromCurrentMonth += l.totalpurchasevalue;
        cancelledFromCurrentMonthCount++;
      }
    }
    const totalCount = aCount(totals), totalValue = aValue(totals);
    const liveCancelCount = aCancelCount(totals), liveCancelValue = aCancelValue(totals);
    const net: NetContribution = {
      totalCount,
      cancelledFromCurrentMonthCount,
      salesAfterCancellationCount: totalCount - liveCancelCount,
      liveCancellationCount: liveCancelCount,
      total: totalValue,
      cancelledFromCurrentMonth,
      salesAfterCancellation: totalValue - liveCancelValue,
      liveCancellation: liveCancelValue,
    };

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
    const products = this.distinct(sales.map((l) => l.product));
    const types = this.distinct(sales.map((l) => l.saleType));

    return { groups, byProduct, bySource, byType, totals, net, monthly, sources, originalSources, salespeople, teams: teamNames, products, types };
  }

  // Build a per-group metric map: gross/assured sales (by purchasedate in range) and
  // gross/assured cancellations (by cancel date in range). Shared by the person/team
  // and the product breakdowns.
  private accumulate(list: SaleLead[], keyOf: (l: SaleLead) => string, start: Date, end: Date): Map<string, SalesGroupMetric> {
    const map = new Map<string, SalesGroupMetric>();
    const ensure = (g: string): SalesGroupMetric => {
      let m = map.get(g);
      if (!m) {
        m = { group: g, grossCount: 0, gsv: 0, assuredCount: 0, asv: 0, cancelledCount: 0, cancelledValue: 0, assuredCancelledCount: 0, assuredCancelledValue: 0 };
        map.set(g, m);
      }
      return m;
    };
    const inRange = (d: Date | null) => !!d && d >= start && d <= end;
    for (const l of list) {
      const m = ensure(keyOf(l));
      if (this.isGross(l) && inRange(l.purchasedate)) {
        m.grossCount++;
        m.gsv += l.totalpurchasevalue;
        if (this.isAssured(l)) { m.assuredCount++; m.asv += l.totalpurchasevalue; }
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
