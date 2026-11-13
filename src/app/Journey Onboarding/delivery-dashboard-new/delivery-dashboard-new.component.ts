import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, doc } from '@angular/fire/firestore';
import { getDocs, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { ScheduleDialogComponent } from '../schedule-dialog/schedule-dialog.component';

type Panel = 'none' | 'compl' | 'weekly' | 'appt' | 'stuck' | 'nc' | 'rdy' | 'ind' | 'live';   // 'await' removed
type LiveKind = 'ind' | 'rdy' | 'stuck' | 'avg' | 'nc'; 
type FunnelMetric = 'total' | 'eligible' | 'notEligible' | 'yetToStart' | 'ongoing' | 'done' | 'purchased' | 'bonus' | 'subEnded';

interface ParticipantInfo {
  profileid: string;
  name: string;
  email: string;
  phone: string;
  customerstatus: string;      
  financialstatus: string;   
  activeproduct: string[];
  totalPaid: number;
  totalPurchaseValue: number;           
  bonus: string[];
  unconsumed: string[];
}

interface AppointmentItem {
  id: string;
  start: Date | null;
  end: Date | null;
  appointmenttypeId: string | null;
  attended: boolean;
  cancelled: boolean;
  cancelledOn: Date | null;
  cancelledreason?: string;
  deliveryRefId: string | null;
  hostIds: string[];
}

/** allAppointments[profileid][participantproductid] */
interface AppointmentBucket {
  product: string;
  attended: AppointmentItem[];
  cancelled: AppointmentItem[];
  scheduled: AppointmentItem[];   
}

interface FunnelRow {
  group: string;
  hidden: boolean;
  total: number;
  eligible: number;
  notEligible: number;
  yetToStart: number;
  ongoing: number;
  done: number;
  purchased: number;
  bonus: number;
  subEnded: number;
  donePct: number;
  purchasedPct: number;
  avgInitToStart: number | null;   
  avgStartToDone: number | null;   
}

interface DfuRow {
  profileid: string;
  participantproductid: string;
  name: string;
  email: string;
  phone: string;
  productId: string;
  product: string;            
  group: string;              
  hidden: boolean;
  status: string;
  customerstatus: string;
  financialstatus: string;
  parallelIds: string[];       
  initiatedDate: Date | null;
  ongoingDate: Date | null;
  completedDate: Date | null;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
  lastAppointmentDate: Date | null;  
  hasFutureAppointment: boolean;
  days: number;                 
  rangeDate: Date | null;       
  isBonus: boolean;
  cycle: number;
  tentativeStart: Date | null;
  totalPaid: number;
  minAmount: number;
  unconsumed: boolean;
  mode: string;
}

interface StageTab { label: string; product: string; months: boolean; }
/** one column of the stages board. Stages with the same name share one group. */
interface StageGroup { name: string; kind: string; indexes: number[]; }
interface StageColumn {
  name: string; first: boolean; canBook: boolean; items: StageCard[]; indexes: number[];
  completed: number; cancelled: number; scheduled: number; waiting: number; all: number;
}
interface StageCard { row: DfuRow; state: string; }
interface StageApptLine { stageName: string; appt: AppointmentItem; }
interface StageDialogRow { name: string; date: Date | null; appt: AppointmentItem; open: boolean; previous: StageApptLine[]; }

@Component({
  selector: 'app-delivery-dashboard-new',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './delivery-dashboard-new.component.html',
  styleUrl: './delivery-dashboard-new.component.css'
})
export class DeliveryDashboardNewComponent implements OnInit {

  // ================= STATIC REFERENCE DATA =================
  readonly SPECIALIST_STUDIO_URL = '';
  readonly EVENT = 'Business/Career Accelerator';
  readonly DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly TODAY = new Date();
  readonly SYS = { completed: 225, target: 30, systemTotal: 846 };

  // business rules
  readonly STUCK_AFTER_DAYS = 15;                     
  private readonly PRIORITY_MODE = 'priority mode';
  readonly REJECTED_STATUS = ['cancelled', 'shifted'];
  private readonly EXCLUDED_MODES = new Set(['installation event mode', 'event mode', 'integration mode','priority mode', 'big mode'])
  private readonly BLOCKED_FINANCE = new Set(['defaulted', 'locked']);

  // filters
  readonly BOTTLENECKS = [{ value: 'ready', label: 'Ready to start' }, { value: 'initiated', label: 'Initiated' }];
  readonly FINANCE_LIST = ['regular', 'fully paid', 'locked', 'defaulted'];
  readonly DATE_FIELDS = [{ value: 'any', label: 'Initiated or Started' }, { value: 'initiated', label: 'Initiated' }, { value: 'ongoing', label: 'Started' }, { value: 'completed', label: 'Done' }];

  // journey funnel
  readonly FUNNEL_METRICS: FunnelMetric[] = ['total', 'eligible', 'notEligible', 'yetToStart', 'ongoing', 'done', 'purchased', 'bonus', 'subEnded'];
  readonly FUNNEL_LABEL: Record<FunnelMetric, string> = {
    total: 'Total', eligible: 'Eligible', notEligible: 'Ineligible', yetToStart: 'Yet to start',
    ongoing: 'Ongoing', done: 'Done', purchased: 'Purchased', bonus: 'Bonus given', subEnded: 'Subscription ended'
  };
  readonly PRODUCT_COLORS = ['#7c3aed', '#0891b2', '#15803d', '#b45309', '#6d28d9', '#0e7490', '#0d9488', '#047857', '#c2410c', '#9333ea'];

  // product grouping
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

  // live table
  readonly LIVE_COLS: Record<string, { label: string; type?: 'date' }> = {
    name: { label: 'Name' },
    email: { label: 'Email' },
    phone: { label: 'Mobile' },
    product: { label: 'Product' },
    financialstatus: { label: 'Financial status' },
    ongoingDate: { label: 'Ongoing date', type: 'date' },
    completedDate: { label: 'Completed date', type: 'date' },
    lastAppointmentDate: { label: 'Last appointment', type: 'date' },
    subscriptionEnd: { label: 'Subscription end', type: 'date' },
    daysInDelivery: { label: 'Days in delivery' },
    daysStuck: { label: 'Days since last appointment' },
    daysToComplete: { label: 'Days to complete' },
    priority: { label: 'Priority' },
    journey: { label: 'Journey' },
    parallel: { label: 'Parallel product' },
    paymentStatus: { label: 'Payment status' },
    initiatedDate: { label: 'Initiated date', type: 'date' },
    productCycle: { label: 'Product cycle' },
    subscriptionStart: { label: 'Subscription start', type: 'date' },
    daysWaiting: { label: 'Days waiting' },
    bottleneck: { label: 'Bottleneck' },
  };
  readonly WAIT_COLS = ['priority', 'name', 'phone', 'journey', 'parallel', 'daysWaiting', 'paymentStatus', 'subscriptionStart', 'subscriptionEnd', 'bottleneck'];
  readonly LIVE_VIEWS: Record<string, { title: string; cols: string[]; journey?: string; bottleneck?: string }> = {
    ind:   { title: 'In delivery', cols: ['name', 'parallel', 'product', 'productCycle', 'daysInDelivery', 'initiatedDate', 'subscriptionStart', 'subscriptionEnd'] },
    rdy:   { title: 'Ready to start', cols: this.WAIT_COLS, journey: 'Payment', bottleneck: 'Ready for initiation' },
    nc:    { title: 'Delivery Not started', cols: ['priority', 'name', 'journey', 'parallel', 'product', 'phone', 'initiatedDate', 'daysWaiting', 'subscriptionStart', 'subscriptionEnd'], journey: 'Diagnostics' },
    stuck: { title: 'Stuck participants', cols: ['priority', 'name', 'parallel', 'product', 'lastAppointmentDate', 'daysStuck', 'subscriptionStart', 'subscriptionEnd'] },
    avg:   { title: 'Completed', cols: ['name', 'email', 'product', 'ongoingDate', 'completedDate', 'daysToComplete'] }
  };

  // stages board
  readonly STAGE_COLORS = ['#8b93a7', '#f59e0b', '#0891b2', '#6d28d9', '#7c3aed', '#15803d'];
  readonly OVERALL_TABS: StageTab[] = [
    { label: 'EI Starter Pack', product: 'EI Starter Pack', months: true },
    { label: 'EI Solution', product: 'EI Custom Solutions', months: true },
    { label: 'Critical Support', product: 'Critical Support Diagnostics and Implementation', months: false }
  ];
  readonly MONTH_COLS: [string, string][] = [['past', 'Past month'], ['this', 'This month'], ['next', 'Next month'], ['noDate', 'No tentative start']];
  readonly CARD_CLS: Record<string, string> = { completed: 'b-green', scheduled: 'b-blue', waiting: 'b-amber' };
  /** activity parent id (productToDeliverySequence) -> kind of stage. Anything else is an appointment.
   *  NOTE: 'arenadeliveryform' is a guess, change it to the real parent id of your forms. */
  private readonly DELIVERABLE_PARENTS: Record<string, string> = { arenavideoask: 'videoask', arenadeliveryform: 'form' };
  private readonly DELIVERABLE_TYPES = ['videoask', 'form'];

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

  readonly STAGES = ['Payment', 'Initiated', 'Diagnostics', 'Implementation', 'Report', 'Completed'];
  readonly STATUS: Record<string, string> = { 'awaiting-payment': 'Awaiting initiation', ready: 'Ready to start', 'not-consuming': 'Initiated, not consuming', 'in-delivery': 'In delivery', stuck: 'Stuck', completed: 'Completed' };
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

  // String declarations
  loadError = '';
  noteText = '';
  toastMsg = '';
  funnelQ = '';

  // Boolean declarations
  loading = true;
  superRole = false;
  overallLoading = false;
  funnelShowHidden = false;
  toastShow = false;

  // Array declarations
  dfuProducts: any[] = [];                       
  participantProducts: any[] = [];     
  ongoingParticipants: DfuRow[] = [];
  readyToStartParticipants: DfuRow[] = [];
  stuckParticipants: DfuRow[] = [];
  completedParticipants: DfuRow[] = [];
  notConsumingParticipants: DfuRow[] = [];
  ongoingByProduct: { name: string; count: number; hidden: boolean }[] = [];
  funnelRows: FunnelRow[] = [];
  funnelPopupList: DfuRow[] = [];
  liveColumns: string[] = [];
  liveSource: DfuRow[] = [];
  overallBoard: StageColumn[] = [];
  private dfuRows: DfuRow[] = [];                
  private latestRows: DfuRow[] = [];         
  private stageGroups: StageGroup[] = [];       
  private stageRows: DfuRow[] = [];           

  // Object declarations
  allParticipants: Record<string, ParticipantInfo> = {};
  allAppointments: Record<string, Record<string, AppointmentBucket>> = {};
  allShown: Record<string, boolean> = {};
  liveKind: LiveKind = 'ind';
  overallTab: StageTab | null = null;            
  funnelPopup: { groups: string[]; title: string; metric: FunnelMetric } | null = null;
  stageDialog: { title: string; kind: 'completed' | 'cancelled'; dateLabel: string; rows: StageDialogRow[] } | null = null;
  private productNameById: Record<string, string> = {};
  private minAmountById: Record<string, number> = {};
  private cycleCount: Record<string, number> = {};
  private stageGroupCache: Record<string, StageGroup[]> = {};   
  private stageDelivery: Record<string, any[]> = {};         
  private deliverySeqByProfile: Record<string, any> = {};
  private deliverableDone: Record<string, boolean> = {};      
  private appointmentTypeNames: Record<string, string> = {};
  private specialistNames: Record<string, string> = {};
  private profileNames: Record<string, string> = {};
  private journeyNames: Record<string, string> = {};
  private toastTimer: any;

  S: any = {
    prod: 'all', event: 'all', range: 'all', rFrom: '', rTo: '', showHidden: false,
    status: 'all', q: '', cust: 'all', fin: 'all', par: 'all', win: 'all', tagF: 'all',
    action: 'none', actN: null as number | null, showRep: false,
    panel: 'none' as Panel, tab: 'pipeline', specSel: null as string | null,
    wFrom: '', wTo: '', dFrom: '', dTo: '',
    tmpl: { SP1: [0, 8, 8, 8, 8, 8, 0], SP2: [0, 6, 6, 6, 6, 6, 0], SP3: [0, 4, 4, 4, 4, 4, 0], SP4: [0, 2, 2, 2, 2, 2, 0] } as Record<string, number[]>,
    tags: { 'P-1005': 'LOW', 'P-1012': 'MEDIUM', 'P-1019': 'HIGH', 'P-1027': 'LOW', 'P-1033': 'Blocked', 'P-1041': 'Waiting PO' } as Record<string, string>,
    tickets: { 'P-1005': 'T-2041', 'P-1012': 'T-2038', 'P-1019': 'T-2029', 'P-1027': 'T-2052', 'P-1033': 'T-2047', 'P-1041': 'T-2044' } as Record<string, string>,
    owner: {} as Record<string, string>,
    notes: {} as Record<string, string[]>,
    drawer: null as string | null,
    dateField: 'any'
  };

  constructor(private firestore: Firestore, private dialog: MatDialog, private guard: AuthguardService) {}

  async ngOnInit() {
    try {
      await this.getDfuProducts();
      await this.getParticipantProducts();
      await this.getParticipantMetadata();
      await this.getAppointments();
      this.buildRows();
      this.buildLatestRows();
      this.buildFunnel();
      this.buildOngoingParticipants();
      this.buildReadyToStart();
      this.buildStuckParticipants();
      this.buildCompletedParticipants();
      this.buildOngoingByProduct();
      this.getNotConsumingParticipants();
      this.getSuperRole();
    } finally {
      this.loading = false;
    }
  }

  // fetch the DFU products type from products.
  async getDfuProducts() {
    try {
      const q = query(collection(this.firestore, 'products'), where('type', '==', 'DFU'));
      const snap = await getDocs(q);
      this.dfuProducts = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
      this.productNameById = {};
      for (const p of this.dfuProducts) {
        this.productNameById[p.id] = p.product || '';
        this.minAmountById[p.id] = Number(p.minimumrequiredamount);
      }
      console.log('DFU products fetched:', this.dfuProducts.length);
    } catch (error) {
      console.error('Error fetching DFU products:', error);
      this.loadError = 'Could not load DFU products';
    }
  }

  // fetch the participantsproduct docs of every DFU product, cancelled and shifted are excluded in the query
  async getParticipantProducts() {
    try {
      const snaps = await Promise.all(
        this.dfuProducts.map(p =>
          getDocs(query(
            collection(this.firestore, 'participantsproduct'),
            where('productref', '==', p.ref),
          ))
        )
      );
      this.participantProducts = snaps
        .flatMap(s => s.docs)
        .map(d => ({ participantproductid: d.data()['docid'] || d.id, ...d.data() } as any));
      console.log('Participant products fetched:', this.participantProducts.length);
    } catch (error) {
      console.error('Error fetching participant products:', error);
      this.loadError = 'Could not load participant products';
    }
  }

  // fetch the participant details from participant metadata collection
  async getParticipantMetadata() {
    try {
      const profileIds = Array.from(new Set(this.participantProducts.map(p => p.profileid)));
      const snaps = await Promise.all(
        this.chunk(profileIds).map(c =>
          getDocs(query(collection(this.firestore, 'participant metadata'), where('profileid', 'in', c)))
        )
      );
      const map: Record<string, ParticipantInfo> = {};
      for (const d of snaps.flatMap(s => s.docs)) {
        const p = d.data();
        const customerstatus = (p['customerstatus'] || '').toString().toLowerCase().trim();
       const validCustomer = customerstatus === 'active' || customerstatus === 'non active';
        if (!p['profileid'] || !validCustomer) continue;
        map[p['profileid']] = {
          profileid: p['profileid'],
          name: p['name'] || '',
          email: p['email'] || '',
          phone: p['phonenumber'] || '',
          customerstatus,
          financialstatus: (p['financialstatus'] || '').toString().toLowerCase().trim(),
          activeproduct: Array.from(new Set<string>(p['activeproduct'] || [])),
          totalPaid: parseInt(p['pp_totalpaid'] ?? '0', 10) || 0,
          totalPurchaseValue: parseInt(p['pp_totalpurchasevalue'] ?? '0', 10) || 0,
          bonus: this.toIdList(p['bonus']),
          unconsumed: this.toIdList(p['unconsumedproducts'])
        };
      }
      this.allParticipants = map;
      console.log('Participant metadata fetched:', Object.keys(this.allParticipants).length);
    } catch (error) {
      console.error('Error fetching participant metadata:', error);
      this.loadError = 'Could not load participants';
    }
  }

  // fetch the appointments of every participant product and group them by attended / cancelled / scheduled
  async getAppointments() {
    try {
      const byId = new Map<string, any>(this.participantProducts.map(p => [p.participantproductid, p]));
      const store: Record<string, Record<string, AppointmentBucket>> = {};

      for (const pp of this.participantProducts) {
        store[pp.profileid] = store[pp.profileid] || {};
        store[pp.profileid][pp.participantproductid] = {
          product: this.productNameById[pp.productref?.id] || 'Unknown product',
          attended: [], cancelled: [], scheduled: []
        };
      }

      const snaps = await Promise.all(
        this.chunk(Array.from(byId.keys())).map(c =>
          getDocs(query(collection(this.firestore, 'appointments'), where('participantproductid', 'in', c)))
        )
      );

      for (const d of snaps.flatMap(s => s.docs)) {
        const a = d.data();
        const pp = byId.get(a['participantproductid']);
        if (!pp) continue;
        const start = this.toDate(a['starttime']) || this.toDate(a['appointmentstart']);
        const end = this.toDate(a['endtime']) || this.toDate(a['appointmentend']) || start;
        const item: AppointmentItem = {
          id: d.id, start, end,
          appointmenttypeId: a['appointment']?.id || null,
          attended: a['attended'] === true,
          cancelled: a['cancelled'] === true,
          cancelledOn: this.toDate(a['cancelledon']),
          cancelledreason: a['cancelledreason'],
          deliveryRefId: a['deliveryRef']?.id || null,
          hostIds: this.hostIdsOf(a['hostRole']),
        };
        const bucket = store[pp.profileid][pp.participantproductid];
        if (item.cancelled) bucket.cancelled.push(item);
        else if (item.attended) bucket.attended.push(item);
        else bucket.scheduled.push(item);
      }
      this.allAppointments = store;
      console.log('Appointments fetched for', this.participantProducts.length, 'participant products');
    } catch (error) {
      console.error('Error fetching appointments:', error);
      this.loadError = 'Could not load appointments';
    }
  }

  // check the logged in user's roles 
  async getSuperRole() {
    try {
      const roles = await this.guard.getRoles();
      this.superRole = (roles.admin || roles.scheduler || roles.ah);
    } catch (error) {
      console.error('Role lookup failed:', error);
    }
  }

  // one row per participant x DFU product, every card and table reads these rows
  buildRows() {
    const now = this.TODAY;
    this.dfuRows = this.participantProducts
      .map(pp => {
        const meta = this.allParticipants[pp.profileid];
        if (!meta) return null;
        const productId = pp.productref?.id;
        const product = this.productNameById[productId] || 'Unknown product';
        const sd = pp.statusdate || {};
        const bucket = this.allAppointments[pp.profileid]?.[pp.participantproductid];

        const attendedEnds = (bucket?.attended || []).map(a => a.end).filter((x): x is Date => x !== null);
        const lastAppt = attendedEnds.length ? new Date(Math.max(...attendedEnds.map(x => x.getTime()))) : null;
        const hasFuture = (bucket?.scheduled || []).some(a => a.start !== null && a.start > now);

        const row: DfuRow = {
          profileid: pp.profileid,
          participantproductid: pp.participantproductid,
          name: meta.name, email: meta.email, phone: meta.phone,
          productId, product,
          group: this.groupNameOf(product),
          hidden: this.hiddenProductNames.has(product),
          status: (pp.status || '').toString().toLowerCase(),
          customerstatus: meta.customerstatus,
          financialstatus: meta.financialstatus,
          parallelIds: meta.activeproduct.filter(id => id !== productId),
          initiatedDate: this.toDate(sd['initiated']),
          ongoingDate: this.toDate(sd['ongoing']),
          completedDate: this.toDate(sd['completed']),
          subscriptionStart: this.toDate(sd['subscriptionstart'] ?? pp.subscriptionstart),
          subscriptionEnd: this.toDate(sd['subscriptionend'] ?? pp.subscriptionend),
          lastAppointmentDate: lastAppt,
          hasFutureAppointment: hasFuture,
          days: 0,
          rangeDate: null,
          isBonus: meta.bonus.includes(productId),
          cycle: 1,
          tentativeStart: this.toDate(pp.tentativestart),
          totalPaid: meta.totalPaid,
          minAmount: this.minAmountById[productId],
          unconsumed: meta.unconsumed.includes(productId),
          mode: (pp.mode || '').toString().toLowerCase().trim(),
        };
        return row;
      })
      .filter((r): r is DfuRow => r !== null);
      console.log('rows:', this.dfuRows.length,'modes:', Array.from(new Set(this.participantProducts.map(p => p.mode))));
  }

  // product cycle count
  buildLatestRows() {
    const count: Record<string, number> = {};
    for (const r of this.dfuRows) {
      const key = this.cycleKey(r);
      count[key] = (count[key] || 0) + 1;
    }
    this.latestRows = this.latestCycleOnly(this.dfuRows)
      .map(r => ({ ...r, cycle: count[this.cycleKey(r)] }));
  }

  // In delivery card status initiated or ongoing
  buildOngoingParticipants() {
    this.ongoingParticipants = this.dfuRows
      .filter(r => {
        const inDelivery = r.status === 'ongoing';
        return inDelivery && r.mode === this.PRIORITY_MODE;
      })
      .map(r => ({ ...r, days: this.daysBetween(r.initiatedDate || r.ongoingDate, this.TODAY) }));
  }

  // Ready to start card participants
  buildReadyToStart() {
    this.readyToStartParticipants = this.latestRows
      .filter(r => this.isYetToStart(r))
      .map(r => ({
        ...r,
        days: r.subscriptionStart ? this.daysBetween(r.subscriptionStart, this.TODAY) : 0,
        rangeDate: r.subscriptionStart
      }));
  }

  // Stuck card participants
  buildStuckParticipants() {
    this.stuckParticipants = this.ongoingParticipants
      .map(r => {
        const lastActivity = r.lastAppointmentDate || r.ongoingDate;
        return { ...r, days: this.daysBetween(lastActivity, this.TODAY), rangeDate: r.ongoingDate };
      })
      .filter(r => r.status === 'ongoing' && r.days > this.STUCK_AFTER_DAYS && !r.hasFutureAppointment)
      .sort((a, b) => b.days - a.days);
  }

  // Average days to complete card
  buildCompletedParticipants() {
    this.completedParticipants = this.dfuRows
      .filter(r => r.status === 'completed')
      .map(r => ({ ...r, days: this.daysBetween(r.ongoingDate, r.completedDate), rangeDate: r.completedDate }));
  }

  // Ongoing by product bars
  buildOngoingByProduct() {
    const rows: Record<string, { name: string; count: number; hidden: boolean }> = {};
    for (const p of this.dfuProducts) {
      const name = this.groupNameOf(p.product);
      const isHidden = this.hiddenProductNames.has(p.product);
      const row = rows[name] || { name, count: 0, hidden: true };
      row.hidden = row.hidden && isHidden;
      rows[name] = row;
    }
    for (const r of this.ongoingParticipants) {
      if (rows[r.group]) rows[r.group].count++;
    }
    this.ongoingByProduct = Object.values(rows);
  }

  // Initiated, not consuming card
  getNotConsumingParticipants() {
    this.notConsumingParticipants = this.dfuRows
      .filter(r => r.status === 'initiated' && r.mode === this.PRIORITY_MODE)
      .map(r => ({ ...r, days: this.daysBetween(r.initiatedDate, this.TODAY) }));
  }

  private liveFilter(list: DfuRow[]): DfuRow[] {
    const p = this.curP();
    return list.filter(r =>
      (this.S.showHidden || !r.hidden) &&
      (!p || this.normName(r.group) === this.normName(p.name)) &&
      this.matchesFilters(r));
  }

  private matchesFilters(r: DfuRow): boolean {
    const f = this.S;

    const inDateRange = this.matchesDate(r);

    const matchesName = !f.q || r.name.toLowerCase().includes(f.q.trim().toLowerCase());

    const isReady = this.isYetToStart(r);
    const isInitiated = r.initiatedDate !== null && !r.ongoingDate;
    const matchesStatus = f.status === 'all' || (f.status === 'ready' && isReady) || (f.status === 'initiated' && isInitiated);

    const isActive = r.customerstatus === 'active';
    const matchesCustomer = f.cust === 'all' || (f.cust === 'active') === isActive;

    const matchesFinance = f.fin === 'all' || r.financialstatus === f.fin;

    const hasParallel = r.parallelIds.length > 0;
    const matchesParallel = f.par === 'all' || (f.par === 'yes') === hasParallel;

    const endsInWindow = r.subscriptionEnd !== null && r.subscriptionEnd >= this.TODAY && r.subscriptionEnd <= this.addDays(+f.win);
    const matchesSubscription = f.win === 'all' || endsInWindow;

    return inDateRange && matchesName && matchesStatus && matchesCustomer &&
           matchesFinance && matchesParallel && matchesSubscription;
  }

  private matchesDate(r: DfuRow): boolean {
    const initiatedInRange = this.inLiveRange(r.initiatedDate);
    const ongoingInRange = this.inLiveRange(r.ongoingDate);
    const completedInRange = this.inLiveRange(r.completedDate);

    if (this.S.dateField === 'initiated') return initiatedInRange;
    if (this.S.dateField === 'ongoing') return ongoingInRange;
    if (this.S.dateField === 'completed') return completedInRange;
    return initiatedInRange || ongoingInRange;
  }

  /** Date-range test used by every live card */
  inLiveRange(d: Date | null): boolean {
    const r = this.S.range;
    if (r === 'all') return true;
    if (!d) return false;
    const T = this.TODAY;
    if (r === '30') return d >= this.startOfDay(this.addDays(-30)) && d <= T;
    if (r === 'month') return d.getMonth() === T.getMonth() && d.getFullYear() === T.getFullYear();
    const f = this.parseISO(this.S.rFrom);
    const t = this.parseISO(this.S.rTo);
    const tEnd = t ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) : null;
    return (!f || d >= f) && (!tEnd || d < tEnd);
  }

  private avgOf(rows: DfuRow[]): number | null {
    return rows.length ? Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length) : null;
  }

  get kpis() {
    return {
      inDel: this.liveFilter(this.ongoingParticipants).length,
      ready: this.liveFilter(this.readyToStartParticipants).length,
      stuck: this.liveFilter(this.stuckParticipants).length,
      notC: this.liveFilter(this.notConsumingParticipants).length,
      avg: this.avgOf(this.liveFilter(this.completedParticipants))
    };
  }

  // Journey Funnel
  funnelMatch(r: DfuRow, metric: FunnelMetric): boolean {
    const eligible = this.isEligible(r);
    const ongoing = this.ongoingParticipants.includes(r);
    const done = eligible && r.status === 'completed';

    switch (metric) {
      case 'total':       return r.unconsumed;
      case 'eligible':    return eligible;
      case 'notEligible': return this.isNotEligible(r);
      case 'yetToStart':  return this.isYetToStart(r);
      case 'ongoing':     return ongoing;
      case 'done':        return done;
      case 'purchased':   return !r.isBonus;
      case 'bonus':       return r.isBonus;
      case 'subEnded':    return r.subscriptionEnd !== null && r.subscriptionEnd < this.TODAY;
    }
  }

  isEligible(r: DfuRow): boolean {
    const modeAllowed = !this.EXCLUDED_MODES.has(r.mode);
    const fullyPaid = r.financialstatus === 'fully paid';
    const regularPaidEnough = r.financialstatus === 'regular' && r.totalPaid > r.minAmount;
    return modeAllowed && (fullyPaid || regularPaidEnough);
  }

  isNotEligible(r: DfuRow): boolean {
    const blocked = this.BLOCKED_FINANCE.has(r.financialstatus);
    const regularShort = r.financialstatus === 'regular' && r.totalPaid < r.minAmount;
    return r.unconsumed && (blocked || regularShort);
  }

  isYetToStart(r: DfuRow): boolean {
    return r.unconsumed && r.status === "" && this.isEligible(r);
  }

  // build the funnel table
  buildFunnel() {
    this.cycleCount = {};
    for (const r of this.dfuRows) {
      const key = this.cycleKey(r);
      this.cycleCount[key] = (this.cycleCount[key] || 0) + 1;
    }
    const map = new Map<string, FunnelRow>();
    const spans: Record<string, { i2s: number[]; s2d: number[] }> = {};

    for (const p of this.dfuProducts) {
      const group = this.groupNameOf(p.product);
      const isHidden = this.hiddenProductNames.has(p.product);
      const row = map.get(group) || {
        group, hidden: true, total: 0, eligible: 0, notEligible: 0, yetToStart: 0,
        ongoing: 0, done: 0, purchased: 0, bonus: 0, subEnded: 0, donePct: 0, purchasedPct: 0,
        avgInitToStart: null, avgStartToDone: null
      } as FunnelRow;
      row.hidden = row.hidden && isHidden;
      map.set(group, row);
      spans[group] = spans[group] || { i2s: [], s2d: [] };
    }

    for (const r of this.latestRows) {
      const row = map.get(r.group);
      if (!row) continue;
      for (const m of this.FUNNEL_METRICS) if (this.funnelMatch(r, m)) row[m]++;

      if (r.initiatedDate && r.ongoingDate)
        spans[r.group].i2s.push(Math.max(0, this.daysBetween(r.initiatedDate, r.ongoingDate)));
      if (r.ongoingDate && r.completedDate)
        spans[r.group].s2d.push(Math.max(0, this.daysBetween(r.ongoingDate, r.completedDate)));
    }

    const avg = (a: number[]) => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null;
    for (const [group, row] of map) {
      row.donePct = this.pct(row.done, row.total);
      row.purchasedPct = this.pct(row.purchased, row.total);
      row.avgInitToStart = avg(spans[group].i2s);
      row.avgStartToDone = avg(spans[group].s2d);
    }
    this.funnelRows = Array.from(map.values());
  }

  // helpers for the funnel table
  funnelColor(group: string): string {
  const i = this.funnelRows.findIndex(r => r.group === group);
  return this.PRODUCT_COLORS[(i < 0 ? 0 : i) % this.PRODUCT_COLORS.length];
}

mixSegments(r: FunnelRow) {
  return [
    { label: 'Yet to start', value: r.yetToStart, color: '#9aa3b5' },
    { label: 'Ongoing',      value: r.ongoing,    color: '#f59e0b' },
    { label: 'Done',         value: r.done,       color: '#4f46e5' }
  ].filter(s => s.value > 0);
}
  funnelVisible(): FunnelRow[] { return this.funnelRows.filter(r => !r.hidden); }
  funnelHidden(): FunnelRow[]  { return this.funnelRows.filter(r => r.hidden); }
  funnelShown(): FunnelRow[]   { return this.funnelShowHidden ? this.funnelRows : this.funnelVisible(); }

  funnelSum(metric: FunnelMetric): number {
    return this.funnelShown().reduce((s, r) => s + r[metric], 0);
  }
  funnelSumPct(metric: 'done' | 'purchased'): number {
    return this.pct(this.funnelSum(metric), this.funnelSum('total'));
  }

  openFunnel(groups: string[] | null, metric: FunnelMetric, title?: string) {
    const g = groups || this.funnelShown().map(r => r.group);
    this.funnelPopup = { groups: g, metric, title: title || 'All products' };
    this.funnelQ = '';
    this.refreshFunnelPopup();
  }

  refreshFunnelPopup() {
    const pop = this.funnelPopup;
    if (!pop) { this.funnelPopupList = []; return; }
    const q = this.funnelQ.trim().toLowerCase();
    const matched = this.latestRows
      .filter(r => pop.groups.includes(r.group) && this.funnelMatch(r, pop.metric))
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.phone.includes(q));
    this.funnelPopupList = matched.sort((a, b) => a.name.localeCompare(b.name));
  }

  closeFunnel() { this.funnelPopup = null; this.funnelPopupList = []; this.funnelQ = ''; }

  exportFunnelPopup() {
    const pop = this.funnelPopup;
    if (!pop || this.funnelPopupList.length === 0) return this.toast('Nothing to export');
    const rows = this.funnelPopupList.map(r => ({
      Name: r.name, Product: r.group,
      Initiated: this.fd(r.initiatedDate), Ongoing: this.fd(r.ongoingDate), Completed: this.fd(r.completedDate),
      'Product cycle': r.cycle
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Participants');
    XLSX.writeFile(book, `${pop.title}_${this.FUNNEL_LABEL[pop.metric]}_${this.iso(this.TODAY)}.xlsx`);
  }

  async openOverallTab(tab: StageTab) {
    this.overallTab = tab;
    this.overallBoard = [];
    this.allShown = {};
    this.overallLoading = true;
    try {
      this.stageGroups = await this.getStageColumns(tab);

      const productRows = this.latestRows.filter(r => this.normName(r.group) === this.normName(tab.product));
      this.stageRows = productRows.filter(r => r.status === 'initiated' || r.status === 'ongoing');

      await this.fetchStageData(this.stageRows);
      this.buildStageBoard(tab, productRows);
    } catch (error: any) {
      console.error('Error loading stages:', error);
      this.loadError = error?.message || 'Could not load stages';
    } finally {
      this.overallLoading = false;
    }
  }

  async getStageColumns(tab: StageTab): Promise<StageGroup[]> {
    const cached = this.stageGroupCache[tab.product];
    if (cached) return cached;

    const productDoc = this.dfuProducts.find(p => this.normName(p.product) === this.normName(tab.product));
    if (!productDoc) return [];

    const snap = await getDocs(query(collection(this.firestore, 'productToDeliverySequence'), where('product', '==', productDoc.ref)));
    const sequence = snap.docs[0]?.data()['deliveryoptions']?.[0]?.deliverysequence || [];
    const typeNames = await this.getAppointmentTypeNames();

    const groups: StageGroup[] = [];
    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      const name = step.description || typeNames[step.activity.id] || step.label || 'Stage';
      const kind = this.DELIVERABLE_PARENTS[step.activity.parent.id] || 'appointment';
      const existing = groups.find(g => g.name === name);

      if (existing) {
        existing.indexes.push(i);
      } else {
        groups.push({ name, kind, indexes: [i] });
      }
    }

    this.stageGroupCache[tab.product] = groups;
    return groups;
  }

  // fetch participantdeliverysequence and the videoask
  async fetchStageData(rows: DfuRow[]) {
    const profileIds = Array.from(new Set(rows.map(r => r.profileid)));
    const productIds = rows.map(r => r.participantproductid);

    const sequenceQueries = this.chunk(profileIds).map(c =>
      getDocs(query(collection(this.firestore, 'participantdeliverysequence'), where('profileid', 'in', c)))
    );

    const deliverableQueries: Promise<any>[] = [];
    for (const type of this.DELIVERABLE_TYPES) {
      for (const c of this.chunk(productIds)) {
        deliverableQueries.push(
          getDocs(query(collection(this.firestore, 'deliverables'), where('participantproductid', 'in', c), where('type', '==', type)))
        );
      }
    }

    const [sequenceSnaps, deliverableSnaps] = await Promise.all([Promise.all(sequenceQueries), Promise.all(deliverableQueries)]);

    for (const d of sequenceSnaps.flatMap(s => s.docs)) {
      this.deliverySeqByProfile[d.data()['profileid']] = d.data();
    }

    for (const d of deliverableSnaps.flatMap(s => s.docs)) {
      const data = d.data();
      const hasFile = (data['fileref'] || []).length > 0;
      const isCompleted = data['status'] === 'completed';
      this.deliverableDone[d.id] = hasFile || isCompleted;
    }
  }

  buildStageBoard(tab: StageTab, productRows: DfuRow[]) {
    const board: StageColumn[] = [];

    const waiting = productRows.filter(r => this.funnelMatch(r, 'eligible') && !r.status);
    const preStart: [string, DfuRow[]][] = [['Total eligible', waiting]];

    if (tab.months) {
      for (const [key, name] of this.MONTH_COLS) {
        preStart.push([name, waiting.filter(r => this.monthKeyOf(r.tentativeStart) === key)]);
      }
    }

    for (const [name, list] of preStart) {
      const items = list.map(r => ({ row: r, state: 'waiting' }));
      board.push({ name, first: true, canBook: tab.months, items, indexes: [], completed: 0, cancelled: 0, scheduled: 0, waiting: items.length, all: items.length });
    }

    this.stageDelivery = {};
    const currentStage: Record<string, number> = {};
    for (const r of this.stageRows) {
      const sequence = this.deliverySeqByProfile[r.profileid];
      const entry = sequence?.products?.find((p: any) => p.participantproductid === r.participantproductid);
      const delivery = entry?.delivery || [];
      const firstOpen = delivery.findIndex((d: any) => d.status !== 'completed');

      let current = firstOpen;
      if (firstOpen === -1) current = delivery.length - 1;

      this.stageDelivery[r.participantproductid] = delivery;
      currentStage[r.participantproductid] = current;
    }

    for (const group of this.stageGroups) {
      const col: StageColumn = { name: group.name, first: false, canBook: false, items: [], indexes: group.indexes, completed: 0, cancelled: 0, scheduled: 0, waiting: 0, all: 0 };

      for (const index of group.indexes) {
        for (const r of this.stageRows) {
          const deliverableId = this.stageDelivery[r.participantproductid][index]?.sequenceref?.id;
          if (!deliverableId) continue;

          const bucket = this.allAppointments[r.profileid][r.participantproductid];
          const forThisStage = (a: AppointmentItem) => a.deliveryRefId === deliverableId;

          let state = 'waiting';
          if (group.kind !== 'appointment') {
            if (this.deliverableDone[deliverableId]) state = 'completed';
          } else {
            const isCompleted = bucket.attended.some(forThisStage);
            const isScheduled = bucket.scheduled.some(forThisStage);
            if (isScheduled) state = 'scheduled';
            if (isCompleted) state = 'completed';
          }

          col.cancelled += bucket.cancelled.filter(forThisStage).length;
          if (state === 'completed') col.completed++;

          const isCurrent = currentStage[r.participantproductid] === index;
          if (!isCurrent) continue;

          if (state === 'scheduled') col.scheduled++;
          if (state === 'waiting') col.waiting++;
          col.items.push({ row: r, state });
        }
      }

      col.all = col.scheduled + col.waiting;
      board.push(col);
    }

    this.overallBoard = board;
  }

  async getAppointmentTypeNames(): Promise<Record<string, string>> {
    if (Object.keys(this.appointmentTypeNames).length) return this.appointmentTypeNames;
    const snap = await getDocs(collection(this.firestore, 'appointmenttype'));
    for (const d of snap.docs) this.appointmentTypeNames[d.id] = d.data()['appointmenttype'];
    return this.appointmentTypeNames;
  }

  toggleAll(c: StageColumn) { this.allShown[c.name] = !this.allShown[c.name]; }

  visibleItems(c: StageColumn): StageCard[] {
    if (!this.allShown[c.name]) return c.items;
    return c.items.filter(i => i.state === 'scheduled' || i.state === 'waiting');
  }

  trackByRow = (_: number, c: StageCard) => c.row.participantproductid;

  async openStageDialog(c: StageColumn, kind: 'completed' | 'cancelled') {
    const completedAll: { row: DfuRow; appt: AppointmentItem }[] = [];
    const cancelledAll: { row: DfuRow; appt: AppointmentItem }[] = [];

    for (const index of c.indexes) {
      for (const r of this.stageRows) {
        const deliverableId = this.stageDelivery[r.participantproductid][index]?.sequenceref?.id;
        if (!deliverableId) continue;

        const bucket = this.allAppointments[r.profileid][r.participantproductid];
        for (const appt of bucket.attended) {
          if (appt.deliveryRefId === deliverableId) completedAll.push({ row: r, appt });
        }
        for (const appt of bucket.cancelled) {
          if (appt.deliveryRefId === deliverableId) cancelledAll.push({ row: r, appt });
        }
      }
    }

    let items = cancelledAll;
    if (kind === 'completed') items = completedAll;

    await this.getSpecialistNames([...completedAll, ...cancelledAll].map(i => i.appt));

    const rows: StageDialogRow[] = [];
    for (const item of items) {
      const previous: StageApptLine[] = [];
      for (const other of completedAll) {
        const sameParticipant = other.row.participantproductid === item.row.participantproductid;
        const endedBefore = other.appt.end !== null && item.appt.end !== null && other.appt.end < item.appt.end;
        if (sameParticipant && endedBefore) previous.push({ stageName: c.name, appt: other.appt });
      }
      previous.sort((a, b) => (a.appt.end as Date).getTime() - (b.appt.end as Date).getTime());

      let date = item.appt.cancelledOn;
      if (kind === 'completed') date = item.appt.end;
      rows.push({ name: item.row.name, date, appt: item.appt, open: false, previous });
    }

    const dateLabel = kind === 'completed' ? 'Completed on' : 'Cancelled on';
    this.stageDialog = { title: c.name, kind, dateLabel, rows };
  }

  closeStageDialog() { this.stageDialog = null; }

  async getSpecialistNames(appts: AppointmentItem[]) {
    const ids = Array.from(new Set(appts.flatMap(a => a.hostIds)));
    const missing = ids.filter(id => !this.specialistNames[id]);
    const snaps = await Promise.all(missing.map(id => getDoc(doc(this.firestore, 'profile_data', id))));
    for (const s of snaps) this.specialistNames[s.id] = s.data()?.['name'] || '';
  }

  specialistOf(a: AppointmentItem): string {
    const names = a.hostIds.map(id => this.specialistNames[id]).filter(n => n !== undefined && n !== '');
    return names.join(', ') || '—';
  }

  async getDialogMaps() {
    if (Object.keys(this.profileNames).length) return;
    const [meta, journeys] = await Promise.all([
      getDocs(collection(this.firestore, 'participant metadata')),
      getDocs(collection(this.firestore, 'journey'))
    ]);
    for (const d of meta.docs) this.profileNames[d.data()['profileid']] = d.data()['name'];
    for (const d of journeys.docs) this.journeyNames[d.data()['id']] = d.data()['journey'];
  }

  // participant onboarding 
  async openOnboardingDialog(r: DfuRow) {
    const typeNames = await this.getAppointmentTypeNames();
    const typeId = Object.keys(typeNames).find(id => typeNames[id] === 'DFU Onboarding');
    if (!typeId) return this.toast('"DFU Onboarding" appointment type is not configured');

    await this.getDialogMaps();
    const pp = this.participantProducts.find(p => p.participantproductid === r.participantproductid);
    const card = {
      ...pp,
      isReschedule: !!pp.onboardingscheduled,
      appointmentid: pp.onboardingappointmentid ?? null,
      mapProfile: this.profileNames,
      mapJourney: this.journeyNames,
      calltype: 'productonboarding',
      appointmentTypeId: typeId,
      appointmentTypeName: 'DFU Onboarding',
      productid: pp.productref?.id ?? null,
      participantsproductid: pp.docid
    };

    this.dialog.open(ScheduleDialogComponent, { data: card, autoFocus: false, disableClose: true, panelClass: 'custom-dialog-container', maxHeight: '90vh' });
  }

  // ================= LIVE TABLE =================
  liveColDefs = (): { key: string; label: string }[] =>
    this.liveColumns.map(k => ({ key: k, label: this.LIVE_COLS[k].label }));

  get liveRows(): DfuRow[] { return this.liveFilter(this.liveSource); }

  // click on a KPI card: show its list in the live table
  openLive(kind: LiveKind) {
    const source = {
      ind: this.ongoingParticipants, rdy: this.readyToStartParticipants, stuck: this.stuckParticipants,
      avg: this.completedParticipants, nc: this.notConsumingParticipants
    }[kind];
    this.liveKind = kind;
    this.liveColumns = this.LIVE_VIEWS[kind].cols;
    this.liveSource = source;
    this.openPanel('live');
  }

  /** value shown in a live-table cell */
  liveCell(r: DfuRow, key: string): string | number {
    const def = this.LIVE_COLS[key];
    if (key.startsWith('days')) return r.days;
    if (key === 'productCycle') return this.productCycle(r);
    if (key === 'parallel') return this.parallelNames(r) || '—';
    if (key === 'journey' || key === 'bottleneck') return (this.LIVE_VIEWS[this.liveKind] as any)[key];

    const v = (r as any)[key];
    if (def.type === 'date') return v ? this.fmt(v) : '—';
    return v || '—';
  }

  // export the open live table to excel
  exportTable() {
    const isLivePanel = this.S.panel === 'live';
    if (!isLivePanel) return this.toast('Open a card to export its list');

    const columns = this.liveColDefs();
    const rows = this.liveRows.map(r => this.exportRow(r, columns));
    if (rows.length === 0) return this.toast('Nothing to export');

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Participants');
    XLSX.writeFile(book, `${this.LIVE_VIEWS[this.liveKind].title}_${this.iso(this.TODAY)}.xlsx`);
  }

  private exportRow(r: DfuRow, columns: { key: string; label: string }[]) {
    const out: Record<string, string | number> = {};
    for (const c of columns) out[c.label] = this.exportCell(r, c.key);
    return out;
  }

  private exportCell(r: DfuRow, key: string): string | number {
    if (key === 'priority') return this.prio(r.days)[0];
    if (key === 'paymentStatus') return this.paymentBadge(r)[0];
    return this.liveCell(r, key);
  }

  productCycle(r: DfuRow): number { return this.cycleCount[this.cycleKey(r)] || 1; }

  paymentBadge(r: DfuRow): [string, string] {
    if (this.isEligible(r)) return ['Eligible', 'b-green'];
    return ['Pending', 'b-amber'];
  }

  get panelTitle(): string {
    const t: Record<string, string> = {
      weekly: 'Weekly report', compl: 'Completion history', appt: 'Appointment dashboard',
      stuck: 'Stuck participants', nc: 'Delivery not started',
      rdy: 'Ready to start', ind: 'In delivery',
      live: this.LIVE_VIEWS[this.liveKind]?.title || 'Participants'
    };
    return t[this.S.panel] || 'Participants';
  }

  // ================= ONGOING BY PRODUCT =================
  /** click on a row in "Ongoing by product": select the matching pipeline product */
  setProdByName(name: string) {
    const match = this.PRODUCTS.find(p => this.normName(p.name) === this.normName(name));
    this.S.prod = match ? match.id : 'all';
  }

  visibleOngoing() {
    return this.ongoingByProduct.filter(p => this.S.showHidden || !p.hidden);
  }

  ongoingParticipant(): number {
    return this.visibleOngoing().reduce((sum, p) => sum + p.count, 0);
  }

  maxOngoing(): number { return Math.max(...this.visibleOngoing().map(p => p.count), 1); }

  // ================= SAMPLE DATA: PARTICIPANTS TABLE =================
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

  curP(): any { return this.S.prod === 'all' ? null : this.PB[this.S.prod]; }
  visibleProducts(): any[] { return this.PRODUCTS.filter(p => this.S.showHidden || !p.hidden); }
  tagOf(p: any): string { return this.S.tags[p.id] || ''; }
  ownerOf(p: any): string { return this.S.owner[p.id] || p.owner; }
  stageDone(p: any): number { return p.status === 'completed' ? 6 : p.stage; }
  isLowUse(p: any): boolean { return p.usage < 30 && ['in-delivery', 'not-consuming'].includes(p.status); }
  sumProducts(fn: (p: any) => number): number { return this.visibleProducts().reduce((a, p) => a + fn(p), 0); }
  prio(d: number): [string, string] { return d >= 14 ? ['HIGH', 'b-red'] : d >= 7 ? ['MEDIUM', 'b-amber'] : ['LOW', 'b-green']; }

  inRangeInit(p: any): boolean {
    if (this.S.range === 'all') return true;
    const d = this.addDays(-(p.initAgo !== null ? p.initAgo : p.days));
    if (this.S.range === '30') return d >= this.addDays(-30) && d <= this.TODAY;
    if (this.S.range === 'month') return d.getMonth() === this.TODAY.getMonth() && d.getFullYear() === this.TODAY.getFullYear();
    const f = this.parseISO(this.S.rFrom), t = this.parseISO(this.S.rTo);
    return (!f || d >= f) && (!t || d <= t);
  }
  inProd(p: any): boolean { return (this.S.prod === 'all' || p.product === this.S.prod) && this.inRangeInit(p); }

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

  panelRows(...statuses: string[]): any[] {
    return this.PEOPLE.filter(p => statuses.includes(p.status) && this.inProd(p)).sort((a, b) => b.days - a.days);
  }
  countStatus(status: string): number { return this.PEOPLE.filter(p => p.status === status && this.inProd(p)).length; }
  get countAllInScope(): number { return this.PEOPLE.filter(p => this.inProd(p)).length; }
  stuckParallel(p: any): string {
    return p.parallel !== '—' ? p.parallel : this.PRODUCTS[(parseInt(p.id.slice(2), 10) + 2) % 8].name;
  }
  get activeTab(): string { return this.S.panel !== 'none' ? 'participants' : this.S.tab; }

  // ================= SAMPLE DATA: COMPLETION + APPOINTMENT DASHBOARD =================
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

  // ================= SAMPLE DATA: WEEKLY REPORT =================
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
      { t: 'Diagnostics specialist recorded wherever a diagnostics date exists', ok: all.every(p => p.diagAgo === null || p.diagSpec) },
      { t: 'Completed total reconciles with the system (' + this.SYS.completed + ')', ok: 'info' }
    ];
  }

  // ================= SAMPLE DATA: PROFILE DRAWER =================
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

  // ================= PAGE ACTIONS =================
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
    Object.assign(this.S, { status: 'all', q: '', cust: 'all', fin: 'all', par: 'all', win: 'all', tagF: 'all', range: 'all', dateField: 'any', rFrom: '', rTo: '', event: 'all' });
  }
  refresh() {
    Object.assign(this.S, {
      prod: 'all', range: 'all', rFrom: '', rTo: '', showHidden: false, status: 'all', q: '', cust: 'all', fin: 'all', par: 'all', win: 'all',
      tagF: 'all', action: 'none', actN: null, showRep: false, panel: 'none', specSel: null, drawer: null, wFrom: '', wTo: '', dFrom: '', dTo: ''
    });
    this.toast('Back to the standard view');
  }

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

  // ================= HELPERS =================
  private chunk<T>(arr: T[], size = 30): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  private cycleKey(r: DfuRow): string { return `${r.profileid}|${r.group}`; }

  private latestCycleOnly(rows: DfuRow[]): DfuRow[] {
    const latest = new Map<string, DfuRow>();
    for (const r of rows) {
      const key = this.cycleKey(r);
      const current = latest.get(key);
      const rowTime = (r.initiatedDate ?? r.subscriptionStart)?.getTime() ?? 0;
      const currentTime = (current?.initiatedDate ?? current?.subscriptionStart)?.getTime() ?? 0;
      if (!current || rowTime > currentTime) latest.set(key, r);
    }
    return Array.from(latest.values());
  }

  private groupNameOf(productName: string): string {
    const groupName = Object.keys(this.mergedGroups).find(g => this.mergedGroups[g].includes(productName));
    return groupName || productName;
  }

  private monthKeyOf(d: Date | null): string {
    if (!d) return 'noDate';
    const thisMonthStart = new Date(this.TODAY.getFullYear(), this.TODAY.getMonth(), 1);
    const nextMonthStart = new Date(this.TODAY.getFullYear(), this.TODAY.getMonth() + 1, 1);
    if (d < thisMonthStart) return 'past';
    if (d < nextMonthStart) return 'this';
    return 'next';
  }

  private parallelNames(r: DfuRow): string {
    return r.parallelIds.map(id => this.productNameById[id]).filter(name => name !== undefined && name !== '').join(', ');
  }

  private toIdList(v: any): string[] {
    if (!Array.isArray(v)) return [];
    return Array.from(new Set(v
      .map((x: any) => typeof x === 'string' ? x : (x?.id ?? x?.productid ?? x?.productref?.id ?? ''))
      .filter((x: string) => x !== '')));
  }

  private hostIdsOf(hostRole: any): string[] {
    const refs = Object.values(hostRole || {}).flat() as any[];
    return refs.map(ref => ref.id);
  }

  private toDate(v: any): Date | null {
    return v?.toDate ? v.toDate() : v instanceof Date ? v : null;
  }

  private normName(n: string): string {
    return (n || '').toLowerCase().replace(/ and /g, ' & ').trim();
  }

  private daysBetween(from: Date | null, to: Date | null): number {
    if (!from || !to) return 0;
    return Math.floor((to.getTime() - from.getTime()) / 86400000);
  }

  private hash01(str: string): number {
    let x = 2166136261;
    for (const c of str) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); }
    return (x >>> 0) / 4294967295;
  }

  // date helpers
  private startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  addDays(n: number): Date { const d = new Date(this.TODAY); d.setDate(d.getDate() + n); return d; }
  ago(n: number): Date { return this.addDays(-n); }
  fmt(d: Date): string { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  fd(d: Date | null): string { return d ? this.fmt(d) : '—'; }
  iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  parseISO(s: string): Date | null { return s ? new Date(s + 'T00:00') : null; }
  pct(a: number, b: number): number { return b ? Math.round(a / b * 100) : 0; }
}