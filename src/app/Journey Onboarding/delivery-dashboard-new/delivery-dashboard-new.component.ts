import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OnInit } from '@angular/core';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { getDocs } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { MatTableModule } from '@angular/material/table';

type Panel = 'none' | 'compl' | 'weekly' | 'appt' | 'stuck' | 'nc' | 'rdy' | 'await' | 'ind' | 'live';

@Component({
  selector: 'app-delivery-dashboard-new',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule],
  templateUrl: './delivery-dashboard-new.component.html',
  styleUrl: './delivery-dashboard-new.component.css'
})
export class DeliveryDashboardNewComponent implements OnInit {
  readonly SPECIALIST_STUDIO_URL = '';
  readonly TODAY = new Date(2026, 9, 28);
  readonly EVENT = 'Business/Career Accelerator';
  readonly DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  readonly SYS = { inDelivery: 99, readyToStart: 206, stuck: 33, completed: 225, avgDays: 194, target: 30, systemTotal: 846, notConsuming: 5, awaiting: 808 };

  /** funnel = [yet to start, initiated, started, ongoing, done] */
  readonly PRODUCTS: any[] = [
    { id: 'ESP', name: 'EI Starter Pack', short: 'EI Starter', color: '#7c3aed', eligible: 180, ineligible: 31, total: 211, purch: 23, bonus: 157, funnel: [82, 0, 4, 4, 4], ended: 29, avgDone: '0d' },
    { id: 'WDA', name: 'WiSH Diagnostics & Implementation', short: 'WiSH', color: '#0891b2', eligible: 146, ineligible: 39, total: 185, purch: 56, bonus: 90, funnel: [36, 3, 20, 22, 17], ended: 34, avgDone: '0d' },
    { id: 'CTD', name: 'CTD Diagnostics & Implementation', short: 'CTD', color: '#15803d', eligible: 140, ineligible: 33, total: 173, purch: 33, bonus: 107, funnel: [34, 0, 1, 1, 145], ended: 71, avgDone: '0d' },
    { id: 'ECS', name: 'EI Custom Solutions', short: 'EI Custom', color: '#b45309', eligible: 63, ineligible: 10, total: 73, purch: 51, bonus: 12, funnel: [40, 0, 39, 50, 5], ended: 10, avgDone: '0d' },
    { id: 'SMP', name: 'SMP Diagnostics & Implementation', short: 'SMP', color: '#6d28d9', eligible: 24, ineligible: 3, total: 27, purch: 10, bonus: 14, funnel: [7, 0, 0, 0, 0], ended: 18, avgDone: 'none' },
    { id: 'CSD', name: 'Critical Support Diagnostics & Implementation', short: 'Critical Support', color: '#0e7490', eligible: 10, ineligible: 1, total: 11, purch: 9, bonus: 1, funnel: [4, 1, 11, 13, 3], ended: 2, avgDone: '194d' },
    { id: 'HED', name: 'Health Explorative Diagnostics & Implementation', short: 'Health Explorative', color: '#0d9488', eligible: 7, ineligible: 0, total: 7, purch: 5, bonus: 2, funnel: [2, 0, 0, 0, 6], ended: 4, avgDone: '0d' },
    { id: 'AHL', name: 'A&H Light Diagnostics & Implementation', short: 'A&H Light', color: '#047857', eligible: 2, ineligible: 2, total: 4, purch: 1, bonus: 1, funnel: [1, 0, 9, 9, 37], ended: 1, avgDone: '0d' },
    { id: 'EIH', name: 'EI Solutions for Health', short: 'EI Health', color: '#c2410c', eligible: 0, ineligible: 0, total: 0, purch: 0, bonus: 0, funnel: [0, 0, 0, 0, 0], ended: 0, avgDone: '—', hidden: true },
    { id: 'SA', name: 'Sales Accelerator', short: 'Sales Accelerator', color: '#9333ea', eligible: 0, ineligible: 0, total: 0, purch: 0, bonus: 0, funnel: [0, 0, 0, 0, 0], ended: 0, avgDone: '—', hidden: true }
  ];
  readonly PB: Record<string, any> = Object.fromEntries(this.PRODUCTS.map(p => [p.id, p]));
  readonly ACTIVE = this.PRODUCTS.filter(p => !p.hidden);

  readonly STAGE_BOARD: Record<string, any[]> = {
    ECS: [
      { name: 'Total eligible', badge: 85 },
      { name: 'Onboarding', badge: 8, completed: 0, cancelled: 0 },
      { name: 'Diagnostics', badge: 3, completed: 10, cancelled: 0, all: 2, sched: 2, wait: 0 },
      { name: 'Implementation', badge: 15, completed: 62, cancelled: 0, all: 17, sched: 16, wait: 1 },
      { name: 'Review', badge: 10, completed: 15, cancelled: 0, all: 15, sched: 2, wait: 13 },
      { name: 'Celebration call', badge: 5, completed: 9, cancelled: 0, all: 10, sched: 0, wait: 10 }
    ]
  };
  readonly STAGE_NAMES = ['Total eligible', 'Onboarding', 'Diagnostics', 'Implementation', 'Review', 'Celebration call'];
  readonly STAGE_COLORS = ['#8b93a7', '#f59e0b', '#0891b2', '#6d28d9', '#7c3aed', '#15803d'];
  readonly STAGE_TABS: [string, string][] = [['ESP', 'EI Starter Pack'], ['ECS', 'EI Solution'], ['CSD', 'Critical Support']];

  readonly STAGES = ['Payment', 'Initiated', 'Diagnostics', 'Implementation', 'Report', 'Completed'];
  readonly STATUS: Record<string, string> = { 'awaiting-payment': 'Awaiting initiation', ready: 'Ready to start', 'not-consuming': 'Initiated, not consuming', 'in-delivery': 'In delivery', stuck: 'Stuck', completed: 'Completed' };
  readonly STATUS_LIST = Object.entries(this.STATUS).map(([value, label]) => ({ value, label }));
  readonly STATUS_CLS: Record<string, string> = { 'awaiting-payment': 'b-amber', ready: 'b-blue', 'not-consuming': 'b-amber', 'in-delivery': 'b-green', stuck: 'b-red', completed: 'b-muted' };
  readonly NEXT: Record<string, string> = { 'awaiting-payment': 'Chase payment', ready: 'Start the product', 'not-consuming': 'Call to start usage', 'in-delivery': 'Confirm next session', stuck: 'Tag ticket and rebook', completed: 'Request feedback' };
  readonly OWNERS = ['Diagnostics team A', 'Diagnostics team B', 'Implementation team', 'Care desk'];
  readonly TAGS = ['LOW', 'MEDIUM', 'HIGH', 'Blocked', 'Waiting PO'];
  readonly TAG_CLS: Record<string, string> = { LOW: 'b-blue', MEDIUM: 'b-amber', HIGH: 'b-red', Blocked: 'b-muted', 'Waiting PO': 'b-amber' };
  private readonly DIAG = ['Diagnostics specialist A', 'Diagnostics specialist B'];
  private readonly IMPL = ['Implementation specialist', 'Report & celebration'];
  private readonly NOTES = ['Participant asked to reschedule diagnostics', 'Waiting on payment receipt confirmation', 'Participant reports a login issue', 'Consumption started, follow up in two weeks', 'Specialist slot requested for next week'];

  readonly ACTIONS: Record<string, { label: string; n: number | null }> = {
    none: { label: 'No action filter', n: null },
    stuckNoTicket: { label: 'Stuck with no ticket', n: null },
    afterJC: { label: 'After JC, need to start the product', n: null },
    stuckDays: { label: 'Stuck for at least (days)', n: 14 },
    ending: { label: 'Subscription ends within (days)', n: 30 },
    waitStart: { label: 'Paid, waiting to start for at least (days)', n: 7 },
    notUsing: { label: 'Started, not using for at least (days)', n: 14 },
    lowUse: { label: 'Low usage below (%) while still delivering', n: 30 }
  };
  readonly ACTION_LIST = Object.entries(this.ACTIONS).map(([value, a]) => ({ value, label: a.label }));

  readonly SPECIALISTS = [
    { id: 'SP1', name: 'Diagnostics specialist A', team: 'Diagnostics' },
    { id: 'SP2', name: 'Diagnostics specialist B', team: 'Diagnostics' },
    { id: 'SP3', name: 'Implementation specialist', team: 'Implementation' },
    { id: 'SP4', name: 'Report & celebration', team: 'Implementation' }
  ];
  readonly SPEC_PRODUCTS: Record<string, string[]> = {
    SP1: ['CTD Diagnostics & Implementation', 'A&H Light Diagnostics & Implementation'],
    SP2: ['WiSH Diagnostics & Implementation', 'Health Explorative Diagnostics & Implementation'],
    SP3: ['EI Starter Pack', 'EI Custom Solutions'],
    SP4: ['Critical Support Diagnostics & Implementation', 'SMP Diagnostics & Implementation']
  };

  readonly PEOPLE: any[] = this.buildPeople();
  readonly PBI: Record<string, any> = Object.fromEntries(this.PEOPLE.map(p => [p.id, p]));

  /** UI state (prototype only: nothing is saved or sent). */
  S: any = {
    prod: 'all', event: 'all', range: 'all', rFrom: '', rTo: '', showHidden: false,
    status: 'all', q: '', cust: 'all', fin: 'all', par: 'all', win: 'all', tagF: 'all',
    action: 'none', actN: null as number | null, showRep: false,
    panel: 'none' as Panel, tab: 'pipeline', specSel: null as string | null,
    wFrom: '', wTo: '', dFrom: '', dTo: '',
    stageProd: 'ECS', weekStart: this.iso(this.TODAY),
    tmpl: { SP1: [0, 8, 8, 8, 8, 8, 0], SP2: [0, 6, 6, 6, 6, 6, 0], SP3: [0, 4, 4, 4, 4, 4, 0], SP4: [0, 2, 2, 2, 2, 2, 0] } as Record<string, number[]>,
    tags: { 'P-1005': 'LOW', 'P-1012': 'MEDIUM', 'P-1019': 'HIGH', 'P-1027': 'LOW', 'P-1033': 'Blocked', 'P-1041': 'Waiting PO' } as Record<string, string>,
    tickets: { 'P-1005': 'T-2041', 'P-1012': 'T-2038', 'P-1019': 'T-2029', 'P-1027': 'T-2052', 'P-1033': 'T-2047', 'P-1041': 'T-2044' } as Record<string, string>,
    owner: {} as Record<string, string>,
    notes: {} as Record<string, string[]>,
    drawer: null as string | null
  };

  noteText = '';
  toastMsg = '';
  toastShow = false;
  private toastTimer: any;

  // grouping
  private readonly hiddenProductNames = new Set([
    'CTD Review', 'CTD Live Event', 'SMP Live', 'SMP Master Class', 'CTD Master Class',
    'B!G Accelerator March 2025', 'CPM Modules', 'Post uP! Review', 'High Performance Delivered',
    'HPC Implementation', 'Pattern Interrupt Diagnostics And Implementation', 'A&H Vitality Booster',
    'Complimentary Review', 'Covid Support', 'Test-Glimpse',
    'Breakthrough Extreme Diagnostics & Implementation', 'Evolution Prep',
    'A&H Custom Motherhood Excellence Solution for Wife', 'Test new'
  ]);

  private readonly mergedGroups: Record<string, string[]> = {
    'CTD Diagnostics & Implementation': ['CTD Diagnostics (Appointment)', 'CTD Diagnostics & Implementation (Appointment)', 'CTD Platinum', 'CTD Diagnostics And Implementation'],
    'EI Custom Solutions': ['EI Solution', 'EI Custom Solutions', 'EI Solution for Wife', 'EI Solution for Husband', 'EI for Entrepreneurs', 'EI for Academy Growth'],
    'Critical Support Diagnostics and Implementation': ['Critical Support Diagnostics And Implementation', 'Critical Support Implementation'],
    'SMP Diagnostics & Implementation': ['SMP Diagnostics & Implementation', 'SMP Diagnostic & Implementation (Appointment)']
  };

  // array variable declaration
  dfuProducts: any[] = [];
  participantMetadata: any[] = [];
  participantProducts: any[] = [];
  ongoingByProduct: { name: string; count: number; hidden: boolean }[] = [];  
  ongoingTotal = 0;
  liveLists: Record<string, any[]> = { ind: [], rdy: [], stuck: [], avg: [] };
  liveRows: any[] = [];
  liveColumns = ['name', 'email', 'product', 'startDate', 'days'];
  avgDays: number | null = null;
  lastAppointmentByProfile: Record<string, Date> = {};

  constructor(private firestore: Firestore) {}

  async ngOnInit() {
    await this.getDfuProducts();
    await this.getParticipantMetadata();
    await this.getParticipantProducts();
    await this.getLastAppointments();
    this.buildOngoingByProduct();
    this.buildLiveLists();
  }

  async getLastAppointments() {
    const profileIds = this.participantMetadata.map(p => p.profileid);
    const chunkSize = 30;
    const requests: Promise<any>[] = [];

    for (let i = 0; i < profileIds.length; i += chunkSize) {
      const chunk = profileIds.slice(i, i + chunkSize);
      const q = query(collection(this.firestore, 'appointments'), where('profileid', 'in', chunk));
      requests.push(getDocs(q));
    }

    const snapshots = await Promise.all(requests);
    for (const docSnap of snapshots.flatMap(s => s.docs)) {
      const data = docSnap.data();
      const date = data['startdate'].toDate();
      const last = this.lastAppointmentByProfile[data['profileid']];
      const isLater = !last || date > last;
      if (isLater) { this.lastAppointmentByProfile[data['profileid']] = date; }
    }
  }

  private daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / 86400000);
  }

  buildLiveLists() {
    const metaByProfile = new Map(this.participantMetadata.map(m => [m.profileid, m]));
    const stuckLimit = this.addDays(-14);
    const lists: Record<string, any[]> = { ind: [], rdy: [], stuck: [], avg: [] };

    for (const pp of this.participantProducts) {
      const meta = metaByProfile.get(pp.profileid);
      if (!meta) { continue; }

      const startDate = (pp.statusdate?.ongoing || pp.statusdate?.initiated)?.toDate();
      const completedDate = pp.statusdate?.completed?.toDate();
      const product = this.dfuProducts.find(d => d.id === pp.productref?.id)?.product;
      const row = { name: meta.name, email: meta.email, product, startDate, days: 0 };

      const isInDelivery = pp.ongoing && !completedDate;
      const lastActivity = this.lastAppointmentByProfile[pp.profileid] || startDate;
      const isStuck = isInDelivery && lastActivity < stuckLimit;

      const customerStatus = (meta.customerstatus || '').toLowerCase();
      const financialStatus = (meta.financialstatus || '').toLowerCase();
      const isCustomerActive = customerStatus === 'active';
      const isPaid = ['regular', 'fully paid'].includes(financialStatus);
      const hasNoParallel = meta.activeproduct.length === 1;
      const isPaymentCleared = Number(pp.minimumpayment) === 0;
      const isReady = !pp.ongoing && isCustomerActive && isPaid && hasNoParallel && isPaymentCleared;

      const isCompleted = !!completedDate && !!pp.statusdate?.ongoing;

      if (isInDelivery) { lists['ind'].push({ ...row, days: this.daysBetween(startDate, this.TODAY) }); }
      if (isStuck) { lists['stuck'].push({ ...row, days: this.daysBetween(lastActivity, this.TODAY) }); }
      if (isReady) { lists['rdy'].push(row); }
      if (isCompleted) { lists['avg'].push({ ...row, days: this.daysBetween(pp.statusdate.ongoing.toDate(), completedDate) }); }
    }

    const totalDays = lists['avg'].reduce((sum, r) => sum + r.days, 0);
    this.avgDays = lists['avg'].length ? Math.round(totalDays / lists['avg'].length) : null;
    this.liveLists = lists;
  }

  openLive(kind: string) {
    this.liveRows = this.liveLists[kind];
    this.openPanel('live');
  }

  async getDfuProducts() {
    const q = query(collection(this.firestore, 'products'), where('type', '==', 'DFU'));
    const snapshot = await getDocs(q);
    this.dfuProducts = snapshot.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
    console.log('DFU Products:', this.dfuProducts);
  }

  async getParticipantMetadata() {
    const dfuRefs = this.dfuProducts.map(p => p.id);
    const chunkSize = 30;
    const requests: Promise<any>[] = [];

    for (let i = 0; i < dfuRefs.length; i += chunkSize) {
      const chunk = dfuRefs.slice(i, i + chunkSize);
      const q = query(collection(this.firestore, 'participant metadata'), where('activeproduct', 'array-contains-any', chunk));
      requests.push(getDocs(q));
    }

    const snapshots = await Promise.all(requests);
    const docs = snapshots.flatMap(s => s.docs);

    const metadataById = new Map<string, any>();
    for (const docSnap of docs) {
      const p = docSnap.data();
      metadataById.set(docSnap.id, {
        id: docSnap.id,
        profileid: p['profileid'],
        name: p['name'],
        email: p['email'],
        activeproduct: p['activeproduct'],
        activeproduct: p['activeproduct'],
        customerstatus: p['customerstatus'],
        financialstatus: p['financialstatus']
      });
    }
    this.participantMetadata = Array.from(metadataById.values());
  }

  async getParticipantProducts() {
    const profileIds = this.participantMetadata.map(p => p.profileid);
    const dfuIds = this.dfuProducts.map(p => p.id);
    const chunkSize = 30;
    const requests: Promise<any>[] = [];

    for (let i = 0; i < profileIds.length; i += chunkSize) {
      const chunk = profileIds.slice(i, i + chunkSize);
      const q = query(collection(this.firestore, 'participantsproduct'), where('profileid', 'in', chunk));
      requests.push(getDocs(q));
    }

    const snapshots = await Promise.all(requests);
    const docs = snapshots.flatMap(s => s.docs);
    const list: any[] = [];

    for (const docSnap of docs) {
      const data = docSnap.data();
      const isDfu = dfuIds.includes(data['productref']?.id);
      const hasInitiated = !!data['statusdate']?.initiated;
      const hasOngoing = !!data['statusdate']?.ongoing;
      if (!isDfu) { continue; }
      list.push({ participantproductid: docSnap.id, ...data, ongoing: hasInitiated || hasOngoing });
    }
    this.participantProducts = list;
  }

  private groupNameOf(productName: string): string {
    const groupName = Object.keys(this.mergedGroups).find(g => this.mergedGroups[g].includes(productName));
    return groupName || productName;
  }

  buildOngoingByProduct() {
    const countByProductId: Record<string, number> = {};
    for (const p of this.participantProducts) {
      if (!p.ongoing) continue;
      const productId = p.productref?.id;
      countByProductId[productId] = (countByProductId[productId] || 0) + 1;
    }

    const rowsByName: Record<string, { name: string; count: number; hidden: boolean }> = {};
    for (const p of this.dfuProducts) {
      const name = this.groupNameOf(p.product);
      const isHidden = this.hiddenProductNames.has(p.product);
      const row = rowsByName[name] || { name, count: 0, hidden: isHidden };
      row.count += countByProductId[p.id] || 0;
      rowsByName[name] = row;
    }
    this.ongoingByProduct = Object.values(rowsByName);
  }

  visibleOngoing() {
    return this.ongoingByProduct.filter(p => this.S.showHidden || !p.hidden);
  }

  ongoingParticipant(): number {
    return this.visibleOngoing().reduce((sum, p) => sum + p.count, 0);
  }

  maxOngoing(): number { return Math.max(...this.visibleOngoing().map(p => p.count), 1); }

  // ---------- sample data ----------
  private buildPeople(): any[] {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const active = this.PRODUCTS.filter(p => !p.hidden);
    return Array.from({ length: 60 }, (_, i) => {
      const n = i + 1, prod = active[n % active.length], r = rnd();
      let status: string, stage: number, days: number;
      if (r < 0.22) { status = 'awaiting-payment'; stage = 0; days = Math.floor(rnd() * 30); }
      else if (r < 0.45) { status = 'ready'; stage = 0; days = Math.floor(rnd() * 20); }
      else if (r < 0.52) { status = 'not-consuming'; stage = 1; days = 1 + Math.floor(rnd() * 12); }
      else if (r < 0.70) { status = 'stuck'; stage = 2 + Math.floor(rnd() * 3); days = 14 + Math.floor(rnd() * 25); }
      else if (r < 0.90) { status = 'in-delivery'; stage = 2 + Math.floor(rnd() * 3); days = Math.floor(rnd() * 13); }
      else { status = 'completed'; stage = 5; days = Math.floor(rnd() * 60); }
      let initAgo: number | null = null, diagAgo: number | null = null;
      if (stage === 1) initAgo = days;
      if (stage === 2) { diagAgo = days; initAgo = days + 1 + Math.floor(rnd() * 5); }
      if (stage >= 3) { diagAgo = days + 1 + Math.floor(rnd() * 10); initAgo = diagAgo + 1 + Math.floor(rnd() * 5); }
      const subEnd = Math.floor(rnd() * 200) - 20;
      return {
        id: 'P-' + (1000 + n), name: 'Sample participant ' + String(n).padStart(2, '0'),
        product: prod.id, status, stage, days, initAgo, diagAgo,
        diagSpec: diagAgo !== null ? this.DIAG[n % 2] : null,
        implSpec: stage >= 3 ? this.IMPL[n % 2] : null,
        owner: this.OWNERS[n % this.OWNERS.length],
        subEnd, usage: status === 'completed' ? 100 : Math.floor(rnd() * 100),
        customer: subEnd >= 0 ? 'Active' : 'Ended',
        financial: status === 'awaiting-payment' ? 'Pending' : 'Paid',
        parallel: n % 6 === 0 ? this.PRODUCTS[(n + 3) % 8].short : '—',
        notes: [this.NOTES[n % this.NOTES.length]]
      };
    });
  }

  // ---------- date helpers ----------
  addDays(n: number): Date { const d = new Date(this.TODAY); d.setDate(d.getDate() + n); return d; }
  ago(n: number): Date { return this.addDays(-n); }
  fmt(d: Date): string { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  parseISO(s: string): Date | null { return s ? new Date(s + 'T00:00') : null; }
  pct(a: number, b: number): number { return b ? Math.round(a / b * 100) : 0; }
  private hash01(str: string): number {
    let x = 2166136261;
    for (const c of str) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); }
    return (x >>> 0) / 4294967295;
  }

  // ---------- small helpers used by the template ----------
  curP(): any { return this.S.prod === 'all' ? null : this.PB[this.S.prod]; }
  visibleProducts(): any[] { return this.PRODUCTS.filter(p => this.S.showHidden || !p.hidden); }
  tagOf(p: any): string { return this.S.tags[p.id] || ''; }
  ownerOf(p: any): string { return this.S.owner[p.id] || p.owner; }
  stageDone(p: any): number { return p.status === 'completed' ? 6 : p.stage; }
  isLowUse(p: any): boolean { return p.usage < 30 && ['in-delivery', 'not-consuming'].includes(p.status); }
  stageTotal(p: any): number { return p.funnel.reduce((a: number, b: number) => a + b, 0); }
  sumProducts(fn: (p: any) => number): number { return this.visibleProducts().reduce((a, p) => a + fn(p), 0); }
  sumKey(k: string): number { return this.sumProducts(p => p[k]); }
  sumFunnel(i: number): number { return this.sumProducts(p => p.funnel[i]); }
  sumStageTotal(): number { return this.sumProducts(p => this.stageTotal(p)); }
  prio(d: number): [string, string] { return d >= 14 ? ['HIGH', 'b-red'] : d >= 7 ? ['MEDIUM', 'b-amber'] : ['LOW', 'b-green']; }
  maxOf(n: number): number { return Math.max(n, 1); }

  inRangeInit(p: any): boolean {
    if (this.S.range === 'all') return true;
    const d = this.addDays(-(p.initAgo !== null ? p.initAgo : p.days));
    if (this.S.range === '30') return d >= this.addDays(-30) && d <= this.TODAY;
    if (this.S.range === 'month') return d.getMonth() === this.TODAY.getMonth() && d.getFullYear() === this.TODAY.getFullYear();
    const f = this.parseISO(this.S.rFrom), t = this.parseISO(this.S.rTo);
    return (!f || d >= f) && (!t || d <= t);
  }
  inProd(p: any): boolean { return (this.S.prod === 'all' || p.product === this.S.prod) && this.inRangeInit(p); }

  // ---------- key metrics ----------
  private countStatusForProduct(status: string): number {
    const p = this.curP();
    return this.PEOPLE.filter(x => this.inRangeInit(x) && x.product === p.id && x.status === status).length;
  }
  get kpis() {
    const p = this.curP(), SYS = this.SYS;
    const avg = p ? (['0d', 'none', '—'].includes(p.avgDone) ? null : parseInt(p.avgDone, 10)) : this.avgDays;
    return {
      inDel: p ? p.funnel[3] : this.liveLists['ind'].length,
      ready: p ? p.funnel[0] : this.liveLists['rdy'].length,
      stuck: p ? this.countStatusForProduct('stuck') : this.liveLists['stuck'].length,
      awaiting: p ? this.countStatusForProduct('awaiting-payment') : SYS.awaiting,
      notC: p ? this.countStatusForProduct('not-consuming') : SYS.notConsuming,
      avg
    };
  }

  // ---------- completion + appointments cards ----------
  get completedTotal(): number { return this.sumProducts(p => p.funnel[4]); }
  get productsWithCompletions(): number { return this.visibleProducts().filter(p => p.funnel[4] > 0).length; }

  apptRows(): { sp: any; av: number; co: number; un: number; cx: number }[] {
    const start = this.parseISO(this.S.weekStart) || this.TODAY;
    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    return this.SPECIALISTS.map(sp => {
      let av = 0, co = 0, un = 0, cx = 0;
      days.forEach(d => {
        const base = this.S.tmpl[sp.id][d.getDay()] || 0;
        const onLeave = base > 0 && this.hash01(sp.id + this.iso(d) + 'leave') < 0.06;
        const a = onLeave ? 0 : base;
        const booked = a ? Math.min(a, Math.floor(this.hash01(sp.id + this.iso(d) + 'book') * (a + 1))) : 0;
        const cxl = booked ? Math.min(booked, Math.floor(this.hash01(sp.id + this.iso(d) + 'cxl') * (booked + 1))) : 0;
        av += a; cx += cxl; co += booked - cxl; un += a - (booked - cxl);
      });
      return { sp, av, co, un, cx };
    });
  }
  apptTotal(k: 'av' | 'co' | 'un' | 'cx'): number { return this.apptRows().reduce((a, r) => a + r[k], 0); }
  get weekStartDate(): Date { return this.parseISO(this.S.weekStart) || this.TODAY; }

  specDetail(id: string) {
    const sp = this.SPECIALISTS.find(s => s.id === id)!;
    const start = this.weekStartDate;
    const hr = (h: number) => `${((h + 11) % 12) + 1}:00 ${h >= 12 ? 'PM' : 'AM'}`;
    const sum = { av: 0, booked: 0, open: 0 };
    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)).map(d => {
      const base = this.S.tmpl[sp.id][d.getDay()] || 0;
      const onLeave = base > 0 && this.hash01(sp.id + this.iso(d) + 'leave') < 0.06;
      const cap = onLeave ? 0 : base;
      const booked = cap ? Math.min(cap, Math.floor(this.hash01(sp.id + this.iso(d) + 'book') * (cap + 1))) : 0;
      const open = cap - booked;
      sum.av += cap; sum.booked += booked; sum.open += open;
      const slots = Array.from({ length: cap }, (_, i) => ({ label: `${hr(9 + i)} – ${hr(10 + i)}`, booked: i >= cap - booked }));
      return { date: d, cap, booked, open, onLeave, slots };
    });
    return { sp, sum, days, products: this.SPEC_PRODUCTS[sp.id] };
  }

  // ---------- product pipeline ----------
  stageMix(p: any): { name: string; count: number; color: string }[] {
    return ([[0, 'Yet to start', '#9aa3b5'], [2, 'Started', '#6b7388'], [3, 'Ongoing', '#f59e0b'], [4, 'Done', '#4f46e5']] as [number, string, string][])
      .filter(([i]) => p.funnel[i] > 0)
      .map(([i, name, color]) => ({ name, count: p.funnel[i], color }));
  }

  // ---------- stage board ----------
  private colOf(p: any): number {
    return p.status === 'awaiting-payment' ? 0 : p.status === 'ready' ? 1 : p.status === 'not-consuming' ? 2 : p.status === 'completed' ? 5 : p.stage;
  }
  get captured(): any[] | undefined { return this.STAGE_BOARD[this.S.stageProd]; }
  stageCols() {
    const people = this.PEOPLE.filter(p => p.product === this.S.stageProd && this.inRangeInit(p));
    const cap = this.captured;
    return this.STAGE_NAMES.map((name, i) => {
      const items = people.filter(p => this.colOf(p) === i);
      const c = cap ? cap[i] : null;
      const dash = (v: any) => (v === undefined ? '—' : v);
      return {
        name, color: this.STAGE_COLORS[i], items, first: i === 0,
        badge: c ? c.badge : items.length,
        completed: c ? dash(c.completed) : items.filter(p => p.status === 'completed').length,
        cancelled: c ? dash(c.cancelled) : 0,
        all: c ? dash(c.all) : items.length,
        sched: c ? dash(c.sched) : '—',
        wait: c ? dash(c.wait) : '—'
      };
    });
  }

  // ---------- participants ----------
  actionMatch(p: any): boolean {
    const n = this.S.actN as number;
    switch (this.S.action) {
      case 'stuckNoTicket': return p.status === 'stuck' && !this.S.tickets[p.id];
      case 'afterJC': return p.status === 'ready';
      case 'stuckDays': return p.status === 'stuck' && p.days >= n;
      case 'ending': return p.status !== 'completed' && p.subEnd <= n;
      case 'waitStart': return p.status === 'ready' && p.days >= n;
      case 'notUsing': return p.status === 'not-consuming' && p.days >= n;
      case 'lowUse': return ['in-delivery', 'not-consuming'].includes(p.status) && p.usage < n;
      default: return true;
    }
  }
  participantRows(): any[] {
    const S = this.S;
    return this.PEOPLE.filter(p => {
      if (S.prod !== 'all' && p.product !== S.prod) return false;
      if (S.status !== 'all' && p.status !== S.status) return false;
      if (!this.inRangeInit(p)) return false;
      if (S.cust !== 'all' && p.customer !== S.cust) return false;
      if (S.fin !== 'all' && p.financial !== S.fin) return false;
      if (S.par !== 'all' && p.parallel !== S.par) return false;
      if (S.win !== 'all' && !(p.status !== 'completed' && p.subEnd <= +S.win)) return false;
      if (!this.actionMatch(p)) return false;
      if (S.tagF !== 'all' && (S.tagF === 'none' ? this.tagOf(p) : this.tagOf(p) !== S.tagF)) return false;
      if (S.q && !(p.name + p.id).toLowerCase().includes(S.q.toLowerCase())) return false;
      return true;
    });
  }

  // ---------- list panels ----------
  panelRows(...statuses: string[]): any[] {
    return this.PEOPLE.filter(p => statuses.includes(p.status) && this.inProd(p)).sort((a, b) => b.days - a.days);
  }
  countStatus(status: string): number { return this.PEOPLE.filter(p => p.status === status && this.inProd(p)).length; }
  get countAllInScope(): number { return this.PEOPLE.filter(p => this.inProd(p)).length; }
  stuckParallel(p: any): string {
    return p.parallel !== '—' ? p.parallel : this.PRODUCTS[(parseInt(p.id.slice(2), 10) + 2) % 8].name;
  }
  get panelTitle(): string {
    const t: Record<string, string> = { weekly: 'Weekly report', compl: 'Completion history', appt: 'Appointment dashboard', stuck: 'Stuck participants', nc: 'Initiated, not consuming', await: 'Awaiting initiation', rdy: 'Ready to start', ind: 'In delivery' };
    return t[this.S.panel] || 'Participants';
  }
  get activeTab(): string { return this.S.panel !== 'none' ? 'participants' : this.S.tab; }

  // ---------- weekly report ----------
  private inBox(dAgo: number | null, from: string, to: string): boolean {
    if (!from && !to) return true;
    if (dAgo === null) return false;
    const d = this.addDays(-dAgo), f = this.parseISO(from), t = this.parseISO(to);
    return (!f || d >= f) && (!t || d <= t);
  }
  weeklyRows(): any[] {
    const S = this.S;
    return this.participantRows().filter(p => p.initAgo !== null && this.inBox(p.initAgo, S.wFrom, S.wTo) && this.inBox(p.diagAgo, S.dFrom, S.dTo));
  }
  weeklyAllCount(): number { return this.weeklyAll().length; }
  private weeklyAll(): any[] { return this.PEOPLE.filter(p => p.initAgo !== null && (this.S.prod === 'all' || p.product === this.S.prod)); }
  weeklyTests(): { t: string; ok: boolean | 'info' }[] {
    const all = this.weeklyAll();
    return [
      { t: 'No duplicate participant IDs', ok: new Set(all.map(p => p.id)).size === all.length },
      { t: 'Diagnostics date is on or after initiation', ok: all.every(p => p.diagAgo === null || p.diagAgo <= p.initAgo) },
      { t: 'Diagnostics specialist recorded wherever a diagnostics date exists', ok: all.every(p => p.diagAgo === null || !!p.diagSpec) },
      { t: 'Completed total reconciles with the system (' + this.SYS.completed + ')', ok: 'info' }
    ];
  }

  // ---------- profile drawer ----------
  get drawerP(): any { return this.S.drawer ? this.PBI[this.S.drawer] : null; }
  drawerItems(p: any) {
    const cur = this.stageDone(p);
    const dates: (string | null)[] = [null, p.initAgo !== null ? this.fmt(this.ago(p.initAgo)) : null, p.diagAgo !== null ? this.fmt(this.ago(p.diagAgo)) : null, null, null, null];
    return this.STAGES.map((name, i) => {
      const state = i < cur ? 'done' : (i === cur && p.status !== 'completed' ? 'cur' : '');
      let label = 'Pending';
      if (state === 'done') label = dates[i] || 'Done';
      if (state === 'cur') label = p.status === 'awaiting-payment' ? 'Payment pending' : `${this.fmt(this.ago(p.days))} · ${p.days} days here`;
      return { name, state, label };
    });
  }
  careList(p: any): string[] {
    const care: string[] = [];
    if (p.status !== 'completed' && p.subEnd <= 30) care.push(`Subscription ends within 30 days (${this.fmt(this.addDays(p.subEnd))})`);
    if (p.status !== 'completed' && p.subEnd > 30 && p.subEnd <= 60) care.push('Subscription ends within 60 days');
    if (p.status !== 'completed' && p.subEnd > 60 && p.subEnd <= 90) care.push('Subscription ends within 90 days');
    if (this.isLowUse(p)) care.push(`Low usage (${p.usage}%) while still delivering`);
    return care;
  }
  allNotes(p: any): string[] { return [...p.notes, ...(this.S.notes[p.id] || [])]; }

  // ---------- actions ----------
  setProd(v: string) { this.S.prod = v; }
  setTab(v: string) { this.S.tab = v; this.S.panel = 'none'; this.S.drawer = null; }
  backToParticipants() { this.S.tab = 'participants'; this.S.panel = 'none'; }
  openPanel(panel: Panel) {
    this.S.panel = panel; this.S.drawer = null;
    if (panel !== 'appt') this.S.specSel = null;
    if (panel === 'compl') this.S.prod = 'all';
    setTimeout(() => document.getElementById('sec-participants')?.scrollIntoView());
  }
  toggleWeekly() { this.S.panel = this.S.panel === 'weekly' ? 'none' : 'weekly'; }
  clearWeekly() { Object.assign(this.S, { wFrom: '', wTo: '', dFrom: '', dTo: '' }); }
  openDrawer(id: string) { this.S.drawer = id; this.noteText = ''; }
  closeDrawer() { this.S.drawer = null; }
  onAction(v: string) { this.S.action = v; this.S.actN = this.ACTIONS[v].n; }
  clearParticipantFilters() {
    Object.assign(this.S, { status: 'all', q: '', cust: 'all', fin: 'all', par: 'all', win: 'all', tagF: 'all', range: 'all', rFrom: '', rTo: '', event: 'all' });
  }
  refresh() {
    Object.assign(this.S, {
      prod: 'all', range: 'all', rFrom: '', rTo: '', showHidden: false, status: 'all', q: '', cust: 'all', fin: 'all', par: 'all', win: 'all',
      tagF: 'all', action: 'none', actN: null, showRep: false, panel: 'none', specSel: null, drawer: null, wFrom: '', wTo: '', dFrom: '', dTo: ''
    });
    this.toast('Back to the standard view');
  }
  exportTable() { this.toast('Export is not enabled in this prototype'); }
  setTag(id: string, v: string) { if (v) this.S.tags[id] = v; else delete this.S.tags[id]; this.toast('Tag updated'); }
  setOwner(id: string, v: string) { this.S.owner[id] = v; this.toast('Owner updated'); }
  raiseTicket(id: string) {
    if (!this.S.tickets[id]) this.S.tickets[id] = `T-${2100 + Object.keys(this.S.tickets).length}`;
    this.toast(`Ticket ${this.S.tickets[id]} raised for ${id}`);
  }
  addNote(id: string) {
    const txt = this.noteText.trim();
    if (!txt) return this.toast('Write a note first');
    this.S.notes[id] = [...(this.S.notes[id] || []), txt];
    this.noteText = '';
    this.toast('Note added');
  }
  sendReminder() { this.toast('Reminder shown as sent (prototype: nothing is sent)'); }
  bookCall() { this.toast('Call request shown as booked (prototype only)'); }
  toast(msg: string) {
    this.toastMsg = msg; this.toastShow = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastShow = false), 2400);
  }
  trackById = (_: number, x: any) => x.id;
}