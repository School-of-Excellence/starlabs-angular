import { Injectable } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs, Timestamp,
  doc, setDoc, updateDoc, deleteDoc,
} from '@angular/fire/firestore';
import {
  SaleLead, SalesTeam, SalesGroupMetric, SalespersonRef,
  MonthlyPoint, DashboardData,
} from './sales-numbers.models';

export interface SalesFilters {
  sources: string[];
  salespeople: string[];
  team: string; // '' = all teams
}

// journeys excluded from the metrics (mirrors journeycoach-dashboard)
const EXCLUDE_ONBOARDING_JOURNEY = 'InLXMl7OBAqlDTZcXwK0';
const EXCLUDE_TEST_JOURNEY = 'RXvsMYoK0g4SstvDDURZ';

// product-segment cards; a category maps 1:1 to a segment (FTO + Gift already merged in ensureJourneys)
const SEGMENT_ORDER = ['Ecosystem', 'DFU', 'FTO + Gift'];

const notEmpty = (v: any) => ![null, undefined, ''].includes(v);

@Injectable({ providedIn: 'root' })
export class SalesNumbersService {
  constructor(private firestore: Firestore) {}

  // ---- journey collection -> product category / name -------------------------
  private journeyCat = new Map<string, string>();
  private journeyName = new Map<string, string>();
  private journeysLoaded = false;

  async ensureJourneys(): Promise<void> {
    if (this.journeysLoaded) return;
    const snap = await getDocs(collection(this.firestore, 'journey'));
    for (const d of snap.docs) {
      const v = d.data() as any;
      const name = v['journey'] ?? v['name'] ?? d.id;
      const type = v['type'];
      const category = name === 'FTO' ? 'FTO + Gift'
        : type === 'Eco system' ? 'Ecosystem'
        : type === 'DFU' ? 'DFU'
        : 'Other';
      this.journeyName.set(d.id, name);
      this.journeyCat.set(d.id, category);
    }
    this.journeysLoaded = true;
  }

  // ---- Firestore reads -------------------------------------------------------

  async loadTeams(): Promise<SalesTeam[]> {
    const snap = await getDocs(collection(this.firestore, 'sales_teams'));
    return snap.docs.map((d) => {
      const v = d.data() as any;
      return { id: d.id, team: v['team'] ?? d.id, members: Array.isArray(v['members']) ? v['members'] : [] };
    });
  }

  // Flagged salespeople (users_roles where salesperson == true) -> name + profileid.
  async loadSalespersonRoster(): Promise<SalespersonRef[]> {
    const snap = await getDocs(query(collection(this.firestore, 'users_roles'), where('salesperson', '==', true)));
    return snap.docs.map((d) => {
      const v = d.data() as any;
      return { roleDocId: d.id, profileid: v['profile_ref']?.id ?? d.id, name: v['name'] ?? '' } as SalespersonRef;
    }).filter((r) => r.name);
  }

  // Find users_roles docs matching a display name (for the in-screen flag helper).
  async findRolesByName(name: string): Promise<{ roleDocId: string; profileid: string; name: string }[]> {
    const snap = await getDocs(query(collection(this.firestore, 'users_roles'), where('name', '==', name)));
    return snap.docs.map((d) => {
      const v = d.data() as any;
      return { roleDocId: d.id, profileid: v['profile_ref']?.id ?? d.id, name: v['name'] ?? name };
    });
  }

  async setSalespersonFlag(roleDocId: string, value: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'users_roles', roleDocId), { salesperson: value });
  }

  // Sales whose sale date OR cancel/downgrade date falls in [start, end].
  // Two single-field range queries merged by docid (no composite index needed).
  async loadSalesInRange(start: Date, end: Date): Promise<SaleLead[]> {
    await this.ensureJourneys();
    const s = Timestamp.fromDate(start), e = Timestamp.fromDate(end);
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

  private monthsAgoStart(months: number): Date {
    const start = new Date();
    start.setMonth(start.getMonth() - (months - 1), 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  // Sales (by purchasedate) over the last `months` months, for the trend chart.
  async loadSalesSince(months: number): Promise<SaleLead[]> {
    await this.ensureJourneys();
    const snap = await getDocs(query(
      collection(this.firestore, 'salesleads'),
      where('purchasedate', '>=', Timestamp.fromDate(this.monthsAgoStart(months))),
    ));
    return snap.docs.map((d) => this.mapLead(d.id, d.data()));
  }

  // Cancellations (by cancel date) over the last `months` months, for the chart.
  async loadCancellations(months: number): Promise<SaleLead[]> {
    await this.ensureJourneys();
    const snap = await getDocs(query(
      collection(this.firestore, 'salesleads'),
      where('date', '>=', Timestamp.fromDate(this.monthsAgoStart(months))),
    ));
    return snap.docs.map((d) => this.mapLead(d.id, d.data())).filter((l) => l.journeytype === 'cancelled');
  }

  // Distinct salespeople over the last 12 months (bounded read; used by the teams roster
  // until the screens merge). Avoids the old whole-collection scan.
  async loadAllSalespeople(): Promise<string[]> {
    const snap = await getDocs(query(
      collection(this.firestore, 'salesleads'),
      where('purchasedate', '>=', Timestamp.fromDate(this.monthsAgoStart(12))),
    ));
    return this.distinct(snap.docs.map((d) => (d.data() as any)['salespersonname']).filter(Boolean));
  }

  // ---- writes ----
  async saveTeamMembers(teamId: string, members: string[]): Promise<void> {
    await updateDoc(doc(this.firestore, 'sales_teams', teamId), { members, lastupdate: Timestamp.fromDate(new Date()) });
  }
  async createTeam(name: string): Promise<string> {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `team_${Date.now()}`;
    await setDoc(doc(this.firestore, 'sales_teams', id), { team: name.trim(), members: [], lastupdate: Timestamp.fromDate(new Date()) });
    return id;
  }
  async deleteTeam(teamId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'sales_teams', teamId));
  }
  // #8 — set/update the lead source on a sale
  async updateSaleSource(docid: string, source: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'salesleads', docid), { source });
  }

  private mapLead(id: string, v: any): SaleLead {
    const journey = v['journey'] ?? '';
    return {
      docid: v['docid'] ?? id,
      salespersonname: v['salespersonname'] ?? 'Unknown',
      presalespersonname: v['presalespersonname'] ?? 'Unknown',
      journey,
      journeytype: v['journeytype'] ?? '',
      status: v['status'] ?? '',
      email: v['email'] ?? '',
      paymentplan: v['paymentplan'] ?? '',
      source: v['source'] ?? '',
      category: this.journeyCat.get(journey) ?? 'Other',
      productName: this.journeyName.get(journey) ?? '(unknown)',
      totalpurchasevalue: Number(v['totalpurchasevalue']) || 0,
      installmentamount: Number(v['installmentamount']) || 0,
      purchasedate: this.toDate(v['purchasedate']),
      date: this.toDate(v['date']),
      paymentplanassureddate: this.toDate(v['paymentplanassureddate']),
    };
  }

  private toDate(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'number') return new Date(v);
    return null;
  }

  // ---- classification (journey-coach dashboard rules) ------------------------
  private isExcluded = (l: SaleLead) =>
    (l.journey === EXCLUDE_TEST_JOURNEY && l.email.toLowerCase().includes('soexcellence.com')) ||
    l.journey === EXCLUDE_ONBOARDING_JOURNEY ||
    l.status.toLowerCase() === 'rejected';
  private isApproved = (l: SaleLead) => l.status.toLowerCase() === 'approved';
  private hasPlan = (l: SaleLead) => notEmpty(l.paymentplan);
  isGrossInRange(l: SaleLead, start: Date, end: Date): boolean {
    return !this.isExcluded(l) && !!l.purchasedate && l.purchasedate >= start && l.purchasedate <= end;
  }

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
    nameToProfileId: Map<string, string>,
  ): DashboardData {
    const asv = metric === 'asv';
    // teams store profileids; resolve a sale's salespersonname -> profileid -> team
    const profileIdToTeam = new Map<string, string>();
    for (const t of teams) for (const pid of t.members) profileIdToTeam.set(pid, t.team);
    const teamOf = (person: string) => {
      const pid = nameToProfileId.get(person);
      return (pid && profileIdToTeam.get(pid)) ?? 'Unassigned';
    };

    const fSource = (l: SaleLead) => !filters.sources.length || filters.sources.includes(l.source);
    const fPerson = (l: SaleLead) => !filters.salespeople.length || filters.salespeople.includes(l.salespersonname);
    const fTeam = (l: SaleLead) => !filters.team || teamOf(l.salespersonname) === filters.team;

    const passesFilters = (l: SaleLead) => fSource(l) && fPerson(l) && fTeam(l);
    const passesExceptSource = (l: SaleLead) => fPerson(l) && fTeam(l);

    const filtered = sales.filter(passesFilters);
    const groupKey = (l: SaleLead) => (view === 'team' ? teamOf(l.salespersonname) : l.salespersonname);
    const aValue = (m: SalesGroupMetric) => (asv ? m.asv : m.gsv);
    const byActive = (a: SalesGroupMetric, b: SalesGroupMetric) => aValue(b) - aValue(a);

    const groups = [...this.accumulate(filtered, groupKey, start, end).values()].sort(byActive);
    const bySource = [...this.accumulate(sales.filter(passesExceptSource), (l) => l.source || 'Unspecified', start, end).values()].sort(byActive);

    const segMap = this.accumulate(filtered, (l) => (SEGMENT_ORDER.includes(l.category) ? l.category : 'Other'), start, end);
    const segments = SEGMENT_ORDER.map((key) => segMap.get(key) ?? this.zeroMetric(key));
    const allSegment = [...this.accumulate(filtered, () => 'All', start, end).values()][0] ?? this.zeroMetric('All');
    const totals = allSegment;

    // chart (6-month) — honours filters + active metric
    const chartSales = salesForChart.filter(passesFilters)
      .filter((s) => !this.isExcluded(s) && !!s.purchasedate && (!asv || this.hasPlan(s)));
    const chartCancellations = cancellationsForChart.filter(passesFilters)
      .filter((c) => !this.isExcluded(c) && c.journeytype === 'cancelled' && this.isApproved(c));
    const monthly = this.buildMonthly(chartSales, chartCancellations, 6);

    // filter option lists (derived from loaded data — no whole-collection read)
    const sources = this.distinct(sales.map((l) => l.source));
    const salespeople = this.distinct([
      ...sales.map((l) => l.salespersonname),
      ...salesForChart.map((l) => l.salespersonname),
    ]);
    const teamNames = this.distinct(teams.map((t) => t.team));

    return { segments, allSegment, groups, bySource, totals, monthly, sources, salespeople, teams: teamNames };
  }

  private zeroMetric(group: string): SalesGroupMetric {
    return {
      group, grossCount: 0, gsv: 0, assuredCount: 0, asv: 0, cancelledCount: 0, cancelledValue: 0,
      newGrossCount: 0, newAssuredCount: 0, upgradeGrossCount: 0, upgradeAssuredCount: 0, addonsGrossCount: 0, addonsAssuredCount: 0,
    };
  }

  private accumulate(list: SaleLead[], keyOf: (l: SaleLead) => string, start: Date, end: Date): Map<string, SalesGroupMetric> {
    const map = new Map<string, SalesGroupMetric>();
    const ensure = (g: string): SalesGroupMetric => {
      let m = map.get(g);
      if (!m) { m = this.zeroMetric(g); map.set(g, m); }
      return m;
    };
    const inRange = (d: Date | null) => !!d && d >= start && d <= end;
    for (const l of list) {
      if (this.isExcluded(l)) continue;
      const m = ensure(keyOf(l));
      const v = l.totalpurchasevalue;
      // gross = purchasedate in window (any journeytype)
      if (inRange(l.purchasedate)) {
        m.grossCount++; m.gsv += v;
        const plan = this.hasPlan(l);
        if (plan) { m.assuredCount++; m.asv += v; }
        // gross type split is approved-only
        if (this.isApproved(l)) {
          if (l.journeytype === 'new') m.newGrossCount++;
          else if (l.journeytype === 'upgrade') m.upgradeGrossCount++;
          else if (l.journeytype === 'addons') m.addonsGrossCount++;
        }
        // assured type split (within plan)
        if (plan) {
          if (l.journeytype === 'new') m.newAssuredCount++;
          else if (l.journeytype === 'upgrade') m.upgradeAssuredCount++;
          else if (l.journeytype === 'addons') m.addonsAssuredCount++;
        }
      }
      // cancellation = journeytype cancelled, cancel date in window, approved
      if (l.journeytype === 'cancelled' && inRange(l.date) && this.isApproved(l)) {
        m.cancelledCount++; m.cancelledValue += v;
      }
    }
    return map;
  }

  private buildMonthly(sales: SaleLead[], cancellations: SaleLead[], months: number): MonthlyPoint[] {
    const buckets = new Map<string, MonthlyPoint>();
    const labels: string[] = [];
    const base = new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(base); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      buckets.set(key, { month: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }), salesCount: 0, salesValue: 0, cancelledCount: 0, cancelledValue: 0 });
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
