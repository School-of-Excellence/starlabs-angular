import { Component, ElementRef, Input, OnDestroy, OnInit, Query, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule, DatePipe, formatDate } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators, ValueChangeEvent } from '@angular/forms';

// ===================== Firebase =====================
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
  updateDoc,
  setDoc,
  collectionData,
  Timestamp,
  arrayUnion,
  arrayRemove,
  orderBy,
  DocumentReference,
  DocumentData,
  QueryConstraint,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

// ===================== Angular material / cdk =====================
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule, MAT_SELECT_CONFIG, MatSelectChange } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { SelectionModel } from '@angular/cdk/collections';
import { OverlayModule } from '@angular/cdk/overlay';
import { ScrollingModule } from '@angular/cdk/scrolling';

// ===================== Third party =====================
import * as XLSX from 'xlsx';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { combineLatest, count, Subject, Subscription, switchMap, takeUntil } from 'rxjs';

// ===================== Project =====================
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import { BulkAddProductsComponent } from '../../Participants Profile Management/participants-analytics/bulk-add-products/bulk-add-products.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { UpdateEventDetailComponent } from '../event-list/update-event-detail/update-event-detail.component';
import { EventCtaConfigComponent } from '../event-list/event-cta-config/event-cta-config.component';

// ===================== Types & Interfaces =====================

type SegmentKey =
  | 'potential'
  | 'requested'
  | 'notRequested'
  | 'eligible'
  | 'upgrade'
  | 'addon'
  | 'continuity'
  | 'noteligible'
  | 'noProduct'
  | 'inQueue'
  | 'approved'
  | 'attended'
  | 'noShow'
  | 'unattended'
  | 'revoked'
  | 'overallRequested';

type ColumnType = 'text' | 'enum' | 'number' | 'date' | 'relation' | 'none';

type OperatorType = 'text' | 'enum' | 'number' | 'date' | 'relation';

interface ImportPreviewRow {
  name: string;
  email: string;
}

interface Split {
  key: string;
  label: string;
  count: number;
}

interface JourneyRow {
  key: string;
  label: string;
  total: number;
  first: number;
  repeat: number;
  members?: string[];
  isGroup?: boolean;
}

interface PRow {
  profileid: string;
  name: string;
  email: string;
  photo: string;
  participantproductid: string | null;
  approvedRequestId: string | null;
  requestData: any | null;
  isOwner: boolean;
  isRequested: boolean;
  isApproved: boolean;
  isEligible: boolean;
  isUpgrade: boolean;
  isAddon: boolean;
  isContinuity: boolean;
  notEligible: boolean;
  isNoProduct: boolean;
  isInQueueReq: boolean;
  isNotRequested: boolean;
  isUnattended: boolean;
  isRevoked: boolean;
  inQueue: boolean;
  attended: boolean;
  scanned: boolean;
  attendanceState: string;
  revokedBy: string; // resolved display name (or raw profile id) of who revoked
  revokedDate: number; // millis
  reason: string;
  requestedDate: number;
  journey: string;
  subscriptionend: number;
  subActive: boolean;
  finance: string;
  phone: string;
  checklist: Array<string>;
  purchaseValue: number | null;
  paid: number | null;
  customerStatus: string;
  completedProduct?: boolean; // this product's id is in the participant's consumedproducts → "repeat"
  metaLoaded: boolean;
  subLoaded: boolean;
  metaError: boolean;
  recentEventParticipationReq: any;
}

interface Ticket {
  ticketno: number | string;
  issue: string;
  status: string;
  category: string | null;
  reporteddate: any;
  ticketid: string;
  isEp: boolean;
}

interface FilterChip {
  key?: string;
  label: string;
  value: string;
  type: 'column' | 'search';
}

interface ColumnConfig {
  label: string;
  type: ColumnType;
  defaultHtml: string;
  defaultColumn: boolean;
  visible: () => boolean;
  showFilter: boolean;
  avaibaleOptions?: Array<string>;
  checklist?: boolean;
}

interface Condition {
  field: string;
  op: string;
  value?: any;
  where?: { productid: string };
  compare?: { op: 'eq' | 'gte' | 'lte' | 'gt' | 'lt'; value: number };
}

interface OperatorConfig {
  label: string;
  test: (cell: any, cond: Condition) => boolean;
  isComplete: (cond: Condition) => boolean;
}

// ===================== Component =====================

@Component({
  selector: 'app-product-funnel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatDialogModule,
    MatMenuModule,
    ProfilePictureComponent,
    MatDatepickerModule,
    OverlayModule,
    ScrollingModule,
    MatNativeDateModule,
    NgxMatSelectSearchModule,
    ReactiveFormsModule,
    MatButtonModule,
  ],
  providers: [
    {
      provide: MAT_SELECT_CONFIG,
      useValue: { overlayPanelClass: 'sx-select-pane' },
    },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: { duration: 4000, panelClass: 'sx-snack' },
    },
    MatSnackBar,
  ],
  templateUrl: './product-funnel.component.html',
  styleUrl: './product-funnel.component.css',
})
export class ProductFunnelComponent implements OnInit, OnDestroy {
  // ================================== Inputs & View Children =========================

  // @Input() arena: any;
  @Input() arenaId = null;
  @Input() eventName = '';
  @Input() eventEnd = 0;
  @Input() eventId = null;

  @ViewChild('confirmTpl') confirmTpl!: TemplateRef<any>;
  @ViewChild('progressTpl') progressTpl!: TemplateRef<any>;
  @ViewChild('failuresTpl') failuresTpl!: TemplateRef<any>;
  @ViewChild('ticketdetail') ticketdetail!: TemplateRef<any>;
  @ViewChild('checklistpopup') checklistpopup!: TemplateRef<any>;
  @ViewChild('importTpl') importTpl!: TemplateRef<any>;
  @ViewChild('inputFile') inputFile: ElementRef;

  // ================================== Constants & Config =========================

  // approve / initiate
  readonly INITIATE_CHUNK_SIZE = 20;
  readonly INITIATE_CHUNK_DELAY_MS = 5000;
  readonly EVENT_CHECKLIST = 'event_checklist';

  readonly financeOptions = [
    { value: 'all', label: 'All finance' },
    { value: 'locked', label: 'Locked' },
    { value: 'defaulted', label: 'Defaulted' },
    { value: 'regular', label: 'Regular' },
    { value: 'fully paid', label: 'Fully paid' },
  ];

  readonly customerFilterOptions = [
    { key: 'active', label: 'Active' },
    { key: 'non active', label: 'Non active' },
    { key: 'discontinued', label: 'Discontinued' },
  ];

  // product ids
  private UP_LIVE_PRODUCT_IDS: readonly string[] = ['0ayiNALL1HDVvCXDHcZ4', 'N0MhGQnxP9S8TdavuRJR', 'Rq9cu2Z3FSuILXdwYtca'];

  private CPM_PRODUCT_IDS: readonly string[] = ['AED3TRIhKpyCtIWQvQMc', 'TnlqL6gUvDSx105YIPC5', 'TxnrP4kevFZCPHFtxj7Z', 'ZvANGjeQnKeIbGXiY0un'];

  // funnel cards
  readonly cards: {
    key: SegmentKey;
    label: string;
    cls: string;
    desc: string;
    tip?: string;
  }[] = [
    {
      key: 'potential',
      label: 'Potential',
      cls: '',
      desc: 'hold the product',
      tip: 'Everyone in the system who holds this product, across all events',
    },
    { key: 'requested', label: 'Requested', cls: '', desc: 'said yes' },
    {
      key: 'notRequested',
      label: 'Not requested',
      cls: '',
      desc: 'owners, no request',
      tip: 'Hold the product but have not requested',
    },
    {
      key: 'eligible',
      label: 'Eligible',
      cls: 'elig',
      desc: 'ready to approve',
    },
    { key: 'upgrade', label: 'Upgrade', cls: 'ne', desc: 'Upgrade needed' },
    {
      key: 'addon',
      label: 'Addon',
      cls: 'ne',
      desc: 'requested, needs product',
      tip: 'Requested but does not hold the product — assign it to revive them',
    },
    {
      key: 'continuity',
      label: 'Continuity',
      cls: 'ne',
      desc: 'Non active participant',
      tip: '',
    },
    {
      key: 'noteligible',
      label: 'Not Eligible',
      cls: 'ne',
      desc: 'not eligible for the event',
    },
    {
      key: 'noProduct',
      label: 'No product',
      cls: 'ne',
      desc: 'requested, needs product',
      tip: 'Requested but does not hold the product — assign it to revive them',
    },
    {
      key: 'inQueue',
      label: 'In queue',
      cls: 'inq',
      desc: 'already in a queue',
      tip: 'Requested but already in an active queue — already being served, no action needed',
    },
    { key: 'approved', label: 'Approved', cls: 'app', desc: 'initiated' },
    {
      key: 'attended',
      label: 'Attended',
      cls: 'att',
      desc: 'marked attended',
      tip: 'Of the approved, how many have request status “attended”',
    },
    {
      key: 'noShow',
      label: 'No-show',
      cls: 'ns',
      desc: 'did not attend',
      tip: 'Approved but did not attend — set when you finalize attendance after the event. Product is kept.',
    },
    {
      key: 'unattended',
      label: 'Unattended',
      cls: 'un',
      desc: 'cancelled — product pulled',
      tip: 'Manually marked not attended during the event — the product is cancelled (status “unattended”).',
    },
    {
      key: 'revoked',
      label: 'Revoked',
      cls: 'rv',
      desc: 'cancelled — product pulled',
      tip: 'Manually revoked — the product is cancelled and the event profile removed (status “revoked”).',
    },
  ];

  // Card lookup + a grouped breakdown tree (depth = indentation; bar = share of the group total).
  readonly cardMap = this.cards.reduce((m, c) => ((m[c.key] = c), m), {} as Record<SegmentKey, (typeof this.cards)[number]>);

  readonly funnelTree: {
    about: string;
    total: SegmentKey;
    rows: { key: SegmentKey; depth: number }[];
  }[] = [
    {
      about: 'Owners not yet initiated — your approval pool',
      total: 'potential',
      rows: [
        { key: 'potential', depth: 0 },
        { key: 'requested', depth: 1 },
        { key: 'eligible', depth: 2 },
        { key: 'upgrade', depth: 2 },
        { key: 'addon', depth: 2 },
        { key: 'continuity', depth: 2 },
        { key: 'noteligible', depth: 2 },
        // { key: 'noProduct', depth: 2 },
        { key: 'inQueue', depth: 2 },
        { key: 'notRequested', depth: 1 },
      ],
    },
    {
      about: 'Attendance outcome of the approved',
      total: 'approved',
      rows: [
        { key: 'approved', depth: 0 },
        { key: 'attended', depth: 1 },
        { key: 'noShow', depth: 1 },
        { key: 'unattended', depth: 1 },
        { key: 'revoked', depth: 1 },
      ],
    },
  ];

  // colors
  private readonly statusColors: Record<string, string> = {
    active: '#1f8a3b',
    'non active': '#c25e00',
    discontinued: '#d70015',
    notset: '#8e8e93',
  };

  private readonly statusPalette = ['#534ab7', '#1d9e75', '#d4537e', '#854f0b', '#185fa5', '#993556'];

  private readonly journeyPalette = ['#1f8a3b', '#0060df', '#534ab7', '#c25e00', '#0f6e56', '#d4537e', '#185fa5'];

  // column groups
  string = ['current journey', 'customerstatus', 'financialstatus', 'status', 'venuefee', 'email', 'emi status', 'participantmode', 'paymentplan', 'phonenumber'];

  numberange = ['paid', 'up! count', 'cpm! count', 'atccount', 'totalpurchasevalue'];

  daterange = ['requestedDate', 'subscriptionend', 'subscriptionstart'];

  noFilter = ['select', 'name', 'tickets'];

  dynamicColumns = [
    'up! count',
    'cpm! count',
    'addons',
    'atccount',
    'consumedproducts',
    'unconsumedproducts',
    'email',
    'emi status',
    'participantmode',
    'paymentplan',
    'phonenumber',
    'subscriptionstart',
    'totalpurchasevalue',
  ];

  computeProduct = ['addons', 'consumedproducts', 'unconsumedproducts'];

  // filter operators
  comparisons = ['==', '>=', '<='];

  reverseCompareMap = { eq: '==', gte: '>=', lte: '<=' };

  readonly legacyCompareMap = { '==': 'eq', '>=': 'gte', '<=': 'lte' };

  private isEmpty = (v: any) => v === null || v === undefined || v === '';

  private readonly CMP = {
    eq: (a: number, b: number) => a === b,
    gte: (a: number, b: number) => a >= b,
    lte: (a: number, b: number) => a <= b,
    gt: (a: number, b: number) => a > b,
    lt: (a: number, b: number) => a < b,
  };

  // Shared by every type
  private readonly emptyOps: Record<string, OperatorConfig> = {
    is_empty: {
      label: 'Is empty',
      test: (cell) => this.isEmpty(cell),
      isComplete: () => true,
    },
    is_not_empty: {
      label: 'Is not empty',
      test: (cell) => !this.isEmpty(cell),
      isComplete: () => true,
    },
  };

  readonly operatorRegistry: Record<OperatorType, Record<string, OperatorConfig>> = {
    text: {
      contains: {
        label: 'Contains',
        test: (cell, c) => !this.isEmpty(cell) && String(cell).toLowerCase().includes(String(c.value).toLowerCase()),
        isComplete: (c) => !this.isEmpty(c.value),
      },
      equals: {
        label: 'Equals',
        test: (cell, c) => !this.isEmpty(cell) && String(cell).trim().toLowerCase() === String(c.value).trim().toLowerCase(),
        isComplete: (c) => !this.isEmpty(c.value),
      },
      ...this.emptyOps,
    },

    enum: {
      in: {
        label: 'Is any of',
        test: (cell, c) => (c.value as any[]).includes(cell),
        isComplete: (c) => Array.isArray(c.value) && c.value.length > 0,
      },
      not_in: {
        label: 'Is none of',
        test: (cell, c) => !(c.value as any[]).includes(cell),
        isComplete: (c) => Array.isArray(c.value) && c.value.length > 0,
      },
      ...this.emptyOps,
    },

    number: {
      between: {
        label: 'Between',
        test: (cell, c) => {
          if (this.isEmpty(cell)) return false;
          const n = Number(cell);
          if (isNaN(n)) return false;
          const { min, max } = c.value ?? {};
          return (this.isEmpty(min) || n >= Number(min)) && (this.isEmpty(max) || n <= Number(max));
        },
        isComplete: (c) => !this.isEmpty(c.value?.min) || !this.isEmpty(c.value?.max),
      },
      ...this.emptyOps,
    },

    date: {
      between: {
        label: 'Between',
        test: (cell, c) => {
          const t = this.toMillis(cell);
          if (!t) return false;
          const { start, end } = c.value ?? {};
          const s = this.isEmpty(start) ? -Infinity : this.toDate(start).setHours(0, 0, 0, 0);
          const e = this.isEmpty(end) ? Infinity : this.toDate(end).setHours(23, 59, 59, 999);
          return s <= t && t <= e;
        },
        isComplete: (c) => !this.isEmpty(c.value?.start) || !this.isEmpty(c.value?.end),
      },
      ...this.emptyOps,
    },

    relation: {
      count: {
        label: 'Product count',
        test: (cell, c) => this.CMP[c.compare.op](cell?.[c.where.productid] ?? 0, c.compare.value),
        isComplete: (c) => !!c.where?.productid && !!c.compare && c.compare.op in this.CMP && !this.isEmpty(c.compare.value) && !isNaN(Number(c.compare.value)),
      },
    },
  };

  readonly columnRegistry: Record<string, ColumnConfig> = {
    select: {
      label: '',
      type: 'none',
      defaultHtml: '',
      defaultColumn: true,
      visible: () => this.showSelect,
      showFilter: false,
    },
    name: {
      label: 'Name',
      type: 'text',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => true,
      showFilter: false,
    },
    requestedDate: {
      label: 'Requested date',
      type: 'date',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => true,
      showFilter: true,
    },
    'current journey': {
      label: 'Current journey',
      type: 'enum',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => true,
      showFilter: true,
    },
    subscriptionend: {
      label: 'Subscription end',
      type: 'date',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => true,
      showFilter: true,
    },
    customerstatus: {
      label: 'Customer status',
      type: 'enum',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => true,
      showFilter: true,
    },
    financialstatus: {
      label: 'Finance',
      type: 'enum',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => true,
      showFilter: true,
    },
    paid: {
      label: 'Paid',
      type: 'number',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => true,
      showFilter: true,
    },
    venuefee: {
      label: 'Venue Fee',
      type: 'enum',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => this.showAfterApprovalChecks,
      showFilter: true,
    },
    tickets: {
      label: 'Tickets',
      type: 'none',
      defaultHtml: '0',
      defaultColumn: true,
      visible: () => true,
      showFilter: false,
    },
    queuestage: {
      label: 'Queue stage',
      type: 'none',
      defaultHtml: '—',
      defaultColumn: true,
      visible: () => this.showApprovalChecks,
      showFilter: false,
    },
    status: {
      label: 'Status',
      type: 'none',
      defaultHtml: '',
      defaultColumn: true,
      visible: () => true,
      showFilter: false,
    },
    scanned: {
      label: 'Scanned',
      type: 'enum',
      defaultHtml: '',
      defaultColumn: true,
      visible: () => this.segment === 'approved' || this.segment === 'attended',
      showFilter: true,
    },

    'up! count': {
      label: 'UP! count',
      type: 'number',
      defaultHtml: '0',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    'cpm! count': {
      label: 'CPM! count',
      type: 'number',
      defaultHtml: '0',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    atccount: {
      label: 'ATC count',
      type: 'number',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    totalpurchasevalue: {
      label: 'Total purchase value',
      type: 'number',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    subscriptionstart: {
      label: 'Subscription start',
      type: 'date',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    addons: {
      label: 'Addons',
      type: 'relation',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    consumedproducts: {
      label: 'Consumed products',
      type: 'relation',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    unconsumedproducts: {
      label: 'Unconsumed products',
      type: 'relation',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    'emi status': {
      label: 'EMI status',
      type: 'enum',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    participantmode: {
      label: 'Participant mode',
      type: 'enum',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    paymentplan: {
      label: 'Payment plan',
      type: 'enum',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    email: {
      label: 'Email',
      type: 'text',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
    phonenumber: {
      label: 'Phone number',
      type: 'text',
      defaultHtml: '—',
      defaultColumn: false,
      visible: () => true,
      showFilter: true,
    },
  };

  // ================================== State =========================

  // arena / event
  selectedEvent = null;
  subEvents = [];
  arena = null;
  loggedInProfile;

  // lookup maps
  mapProfile: Record<string, any> = {};
  mapEmailData: Record<string, any> = {};
  mapProduct: Record<string, string> = {};
  mapJourney: Record<string, string> = {};

  // delivery sets & queue variations
  deliverySetList: any[] = [];
  selectedDeliverySet: string | null = null;
  queueVariationList: any[] = [];
  mapQueueVariation: Record<string, string> = {};
  selectedQueueVariation: string | null = null;

  // participant data points ( live subscriptions )
  participantMetadata = {};
  participantProductMap = {};
  participantRequestMap = {};
  participantSalesMap = {};
  eticketLogMap = {};
  tokenMap = {};
  cohortParticipants = [];
  communicationMap = {};
  communicationEmailLog = {};
  communicationwatilLog = {};
  communicationAppNotificationLog = {}
  revokedByMap = {};
  // approvedMap = {};
  // requestedMap = {};

  mapEligibility = {};
  subscribtions: { [key: string]: Subscription } = {};
  eticketEligibilitySubscription: Subscription | null = null;

  // rows, segments & counts
  rows: PRow[] = [];
  segment: SegmentKey = 'eligible';
  searchText = '';
  financeFilter = 'all';
  customerFilter = 'all'; // 'all' or a key from customerFilterOptions
  selection = new SelectionModel<string>(true, []);

  counts: Record<SegmentKey, number> = {
    potential: 0,
    requested: 0,
    notRequested: 0,
    eligible: 0,
    upgrade: 0,
    addon: 0,
    continuity: 0,
    noteligible: 0,
    noProduct: 0,
    inQueue: 0,
    approved: 0,
    attended: 0,
    noShow: 0,
    unattended: 0,
    revoked: 0,
    overallRequested: 0,
  };

  segmentList: Record<SegmentKey, Array<string>> = {
    potential: [],
    requested: [],
    notRequested: [],
    eligible: [],
    upgrade: [],
    addon: [],
    continuity: [],
    noteligible: [],
    noProduct: [],
    inQueue: [],
    approved: [],
    attended: [],
    noShow: [],
    unattended: [],
    revoked: [],
    overallRequested: [],
  };

  // funnel splits
  statusSplits: Record<SegmentKey, Split[]> = {} as Record<SegmentKey, Split[]>;
  customerStatusList: { key: string; label: string }[] = []; // distinct statuses, for the filter
  splitsReady = false;

  // journey grouping
  approvedByJourney: JourneyRow[] = [];
  displayedJourneys: JourneyRow[] = [];
  journeyFilter = 'all';
  journeyFilterMembers = new Set<string>();
  frFilter = 'all'; // 'all' | 'first' | 'repeat'
  journeyGroups: Record<string, string> = {};
  groupEditMode = false;
  journeySel = new Set<string>(); // journeys ticked in edit mode, waiting to be grouped
  groupNameInput = ''; // name to apply when grouping the current selection

  // queue stage
  queueStageByPid = new Map<string, string>(); // queue_token.currentstage per participant (queue events)
  queueStagesLoaded = false;
  private queueStagesLoading = false;

  // bulk import
  // owner email → row, and active-queue profile ids — used by bulk import categorisation
  private ownerByEmail = new Map<string, PRow>();
  private activeProfileIds = new Set<string>();
  importPreview: {
    total: number;
    willAdd: ImportPreviewRow[];
    inQueue: ImportPreviewRow[];
    noProduct: ImportPreviewRow[];
  } | null = null;
  importExpand = { willAdd: false, inQueue: false, noProduct: false };
  private pendingImportRows: PRow[] = [];
  private importDialogRef: any = null;
  isExcelFile: boolean;

  // pagination & loading
  pageSize = 10;
  pageIndex = 0;
  loading = true;
  loadError = false;

  // progress dialog state
  progress = { msg: '', value: 0, total: 0, eta: '' };

  // sales & tickets
  last30daysSale = 0;
  isSalesSelected = false;
  openTickets = {
    eventProcessTickets: 0,
    others: 0,
  };
  selectedTicketCategory: 'all' | 'ep' | 'others' = 'all';
  selectedParticipantsTicket = null;

  // table columns, filters & sorting
  // displayColumns = ['select' , 'name' , 'requested date' , 'current journey' , 'subscriptionend' , 'customerstatus' , 'financialstatus' , 'paid' , 'status' , 'tickets']
  displayColumns = [];
  cachedColumns = [];
  columSearch = '';
  // filterMap = {};
  filterPopup = null;
  filterOrigin: HTMLElement | null = null;
  sortColumn: { column: string; type: 'asc' | 'desc' } = null;
  filterMap: Record<string, Condition[]> = {};

  // checklist
  checkListMap = {};
  appliedCheckList: ColumnConfig[] = [];
  overAllEventCheckList = [];
  checkListForm: FormGroup;
  selectedChecklist = null;

  // streams
  private destroy$ = new Subject<void>();
  eventParticipationRequest$ = new Subject<any>();
  participantProduct$ = new Subject<any>();

  showJourneyCard = false; 

  // ================================== Constructor & Lifecycle =========================

  constructor(
    public firestore: Firestore,
    public guard: AuthguardService,
    public dialog: MatDialog,
    public snackbar: MatSnackBar,
    public storage: Storage,
    public http: HttpClient,
    private router: Router,
    private datePipe: DatePipe,
    private form: FormBuilder,
    private authService: AuthguardService,
  ) {
    this.authService.getRoles().then((data) => (this.loggedInProfile = data));
    this.guard.getProfileMap().then((profile) => {
      this.mapProfile = profile.docdata;
      this.mapEmailData = profile.mapEmailData;
    });
    this.guard.getProductMap().then((mapProduct) => (this.mapProduct = mapProduct));
    this.guard.getJourneyMap().then((mapJourney) => (this.mapJourney = mapJourney));
  }

  async ngOnInit() {
    this.loadETicketEligibilty();
    this.loadSalesLeads();
    this.initAppliedCheckList();
    this.loadEventCommunication();
    this.loadArenaETicket();
    this.journeyGroupsKey();
    this.loadDasbordData();
    await this.fetchSubEvent();
    if (this.subEvents.length > 0) {
      let arenaEvent = null;
      if (this.arenaId) {
        arenaEvent = this.subEvents.find((arena) => {
          const docid = arena['docid'] ?? null;
          return this.arenaId === docid;
        });
      } else {
        arenaEvent = this.subEvents[0];
      }

      if (arenaEvent) {
        await this.toggleArena(arenaEvent);
      }
    };
    this.loading = false;
  }

  ngOnDestroy(): void {
    if (this.eticketEligibilitySubscription) {
      this.eticketEligibilitySubscription.unsubscribe();
    }
    Object.values(this.subscribtions).forEach((sub)=>{
      sub.unsubscribe();
    })
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================== Data Loading =========================

  // function to fetch sub events ( arenas ) of the event
  async fetchSubEvent() {
    const subEvents = [];
    if (this.eventId) {
      const collName = this.eventId?.isQueueEvent ? 'queue generation' : 'event collection';
      const eventDocRef = doc(this.firestore, `${collName}/${this.eventId?.docid}`);
      const q = query(collection(this.firestore, 'arena events'), where('eventref', '==', eventDocRef));
      const arenaSnap = await getDocs(q);
      arenaSnap.docs.forEach((arenaRef) => {
        const arena = arenaRef.data();
        if(arena['delete'] !== true) subEvents.push(arena);
      });
    }

    subEvents.sort((a, b) => {
      if (a.heroevent && !b.heroevent) return -1;
      if (!a.heroevent && b.heroevent) return 1;

      return this.toMillis(a?.startdate) - this.toMillis(b.startdate);
    });

    this.subEvents = subEvents;
  }

  // function to select an arena and push its queries to the live streams
  async toggleArena(arena) {
    this.loading = true;
    this.arena = arena;
    const arenaId = this.arena['docid'] ?? null;
    const productref = this.arena['productref'] ?? null;

    await this.loadEligibleCohorts();
    this.loadQueueToken();
    if (productref) {
      const q = query(collection(this.firestore, 'participantsproduct'), where('productref', '==', productref), where('status', '==', null));
      this.participantProduct$.next(q);
    }
    if (arenaId) {
      const q = query(
        collection(this.firestore, 'event participation request'),
        where('arenaeventid', '==', arenaId),
        where('status', 'in', ['requested', 'approved', 'attended', 'unattended', 'revoked']),
        orderBy('doccreateddate', 'asc'),
      );
      this.eventParticipationRequest$.next(q);
    }

    this.deliverySetList = await this.loadDeliverySets(arena);
    await this.loadVariations(arena);
  }

  // function to load dashboard data ( metadata + product + request live streams )
  loadDasbordData() {
    const participantMetadata$ = collectionData(collection(this.firestore, 'participant metadata'));
    const productData$ = this.participantProduct$.pipe(switchMap((q) => collectionData(q)));
    const reqData$ = this.eventParticipationRequest$.pipe(switchMap((q) => collectionData(q)));
    combineLatest(participantMetadata$, productData$, reqData$)
      .pipe(takeUntil(this.destroy$))
      .subscribe(([participantMetadataSnap, participantProductSnap, requestSnap]) => {
        const participantMetadata = {};
        const participantProductMap = {};
        const participantRequestMap: { [key: string]: any } = {};
        // const revokedData: { [key: string]: any } = {};

        for (const participant of participantMetadataSnap) {
          const profileId = participant['profileid'] ?? null;

          if (profileId) {
            if (Object.hasOwn(participantMetadata, profileId)) {
              Object.assign(participantMetadata[profileId], participant);
            }
            participantMetadata[profileId] = participant;
          }
        }

        for (const product of participantProductSnap) {
          const profileId = product['profileid'] ?? null;
          if (product) {
            participantProductMap[profileId] = product;
          }
        }

        for (const req of requestSnap) {
          const profileId = req['profileid'] ?? null;
          if (profileId) {
            participantRequestMap[profileId] = participantRequestMap[profileId] ?? [];
            participantRequestMap[profileId]?.push(req);
            // if (Object.hasOwn(participantRequestMap , profileId)) {
            //   const existReq = participantRequestMap[profileId];
            //   if (req['status'] === 'revoked' && existReq['status'] !== 'revoked') {
            //     if (existReq['requestData']) {
            //       const oldRevoke = this.toDate(existReq['requestData']['doccreateddate']) ?? null;
            //       const currentRevoke = this.toDate(req['doccreateddate']) ?? null;
            //       if (currentRevoke && currentRevoke > oldRevoke) {
            //         participantRequestMap[profileId]['requestData'] = req;
            //       }
            //     } else {
            //       participantRequestMap[profileId]['requestData'] = req;
            //     }
            //   }
            //   const oldRequestDate = this.toDate(req['doccreateddate']) ?? null;
            //   const currentReqDate = this.toDate(participantRequestMap[profileId]['doccreateddate']) ?? null;
            //   if (currentReqDate && currentReqDate > oldRequestDate) {

            //   }
            //   if () {

            //   }
            // }
          }
        }

        this.participantMetadata = participantMetadata;
        this.participantProductMap = participantProductMap;
        this.participantRequestMap = participantRequestMap;

        this.processEventRequest();
        this.calculateSales(Object.keys(participantRequestMap));
        this.calculateCustomerTickets(Object.keys(participantRequestMap));
        const overAll = new Set([...Object.keys(participantRequestMap), ...Object.keys(participantProductMap)]);
        this.computeSplits([...overAll]);
        this.defaultSelection();
        this.loading = false;
        this.splitsReady = true;
      });
  }

  // function to load arena e-ticket logs ( live )
  async loadArenaETicket() {
    if (this.subscribtions['arenaticket']) {
      this.subscribtions['arenaticket'].unsubscribe();
    }
    const eventRef = doc(this.firestore, 'event collection', this.eventId?.['docid']);
    const q = query(collection(this.firestore, 'arena e-ticket log'), where('eventref', '==', eventRef));
    try {
      this.subscribtions['arenaticket'] = collectionData(q).subscribe((logSnap) => {
        const eticketLogMap: { [key: string]: any } = {};
        for (const log of logSnap) {
          const productId = log['product']?.id;
          const profileid = log['profileid'];
          if (productId && profileid) {
            eticketLogMap[productId] = eticketLogMap[productId] ?? {};
            eticketLogMap[productId][profileid] = eticketLogMap[productId][productId] ?? [];
            eticketLogMap[productId][profileid].push(log);
          }
        }

        this.eticketLogMap = eticketLogMap;
      });
    } catch (error) {
      console.log('Error from loading arena e-tickets log : ', error);
    }
  }

  // function to load queue tokens ( live )
  async loadQueueToken() {
    const arenaEventref = this.arena['eventref'] as DocumentReference;
    if (!arenaEventref || arenaEventref?.parent.id !== 'queue generation') return;
    if (this.subscribtions['queue_token']) {
      this.subscribtions['queue_token'].unsubscribe();
    }
    try {
      const tokenMap: { [key: string]: Array<any> } = {};
      const q = query(collection(this.firestore, 'queue_token'), where('queueref', '==', arenaEventref));
      this.subscribtions['queue_token'] = collectionData(q).subscribe((tokenSnap) => {
        for (const token of tokenSnap) {
          const profileId = token['profile_id'] ?? null;
          if (profileId) {
            tokenMap[profileId] = tokenMap[profileId] ?? [];
            tokenMap[profileId].push(token);
          }
        }
        this.tokenMap = tokenMap;
        this.processEventRequest();
      });
    } catch (error) {
      console.log('Error fetching queue tokens : ', error);
    }
  }

  // function to load event communications ( live )
  async loadEventCommunication() {
    if (this.eventId['docid']) {
      const collectionName = this.eventId?.isQueueEvent ? 'queue generation' : 'event collection';
      const eventRef = doc(this.firestore, collectionName, this.eventId['docid']);
      if (this.subscribtions['eventcommunications']) {
        this.subscribtions['eventcommunications'].unsubscribe();
      }
      const q = query(collection(this.firestore, 'communication planner'), where('eventref', '==', eventRef));
      this.subscribtions['eventcommunications'] = collectionData(q, { idField: 'docid' }).subscribe((communicationPlannerSnap) => {
        const communicationMap = {};
        for (const comm of communicationPlannerSnap) {
          const docid = comm['docid'];
          communicationMap[docid] = comm;
        }
        const communicationChunks = [];
        const keys = Object.keys(communicationMap);
        for (let i = 0; i < keys.length; i+=30) communicationChunks.push(keys.slice(i , i + 30));
        this.fetchEmailArchieve(communicationChunks);
        this.fetchWatiArchieve(communicationChunks);
        this.fetchAppNotification(communicationChunks);
        this.communicationMap = communicationMap;
      });
    }
  }

  // fetch email archive data
  async fetchEmailArchieve(communicationChunks : string[]) {
    const communicationEmailLog = {};

    for (const chunk of communicationChunks) {
      const emailQuery = query(collection(this.firestore, 'email archive') , where('communicationplannerid' , 'in' , chunk));
      const emailSnap = await getDocs(emailQuery);
      for (const emailRef of emailSnap.docs) {
        const email = emailRef.data();
        const communicationId = email['communicationplannerid'];
        communicationEmailLog[communicationId] = communicationEmailLog[communicationId] ?? [];
        communicationEmailLog[communicationId]?.push(email);
      }
    }
    
    this.communicationEmailLog = communicationEmailLog;
  }

   // fetch wati archive data
  async fetchWatiArchieve(communicationChunks : string[]) {
    const communicationwatilLog = {};

    for (const chunk of communicationChunks) {
      const watiQuery = query(collection(this.firestore, 'wati archive') , where('communicationplannerid' , 'in' , chunk));
      const watiSnap = await getDocs(watiQuery);
      for (const watiRef of watiSnap.docs) {
        const wati = watiRef.data();
        const communicationId = wati['communicationplannerid'];
        communicationwatilLog[communicationId] = communicationwatilLog[communicationId] ?? [];
        communicationwatilLog[communicationId]?.push(wati);
      }
    }
    this.communicationwatilLog = communicationwatilLog;
  }

  // fetch email archive data
  async fetchAppNotification(communicationChunks : string[]) {
    const communicationAppNotificationLog = {};

    for (const chunk of communicationChunks) {
      const appNotificationQuery = query(collection(this.firestore, 'notificationrecord') , where('communicationplannerid' , 'in' , chunk));
      const appNotificationSnap = await getDocs(appNotificationQuery);
      for (const notifyRef of appNotificationSnap.docs) {
        const notify = notifyRef.data();
        const communicationId = notify['communicationplannerid'];
        communicationAppNotificationLog[communicationId] = communicationAppNotificationLog[communicationId] ?? [];
        communicationAppNotificationLog[communicationId]?.push(notify);
      }
    }
    
    this.communicationAppNotificationLog = communicationAppNotificationLog;
  }


  getEmailStats(communicationId : string){
    let total = 0;
    let send = 0;

    const emailArchieve = this.communicationEmailLog[communicationId] ?? [];
    for (const archieve of emailArchieve) {
      const emails = archieve['emailid']?.length ?? 0;
      const sent = archieve['sent']?.length ?? 0;
      total+= emails;
      send += sent; 
    }

    return {
      total,
      sent : send
    }
  }

  getWatiStats(communicationId : string){
    let total = 0;
    let send = 0;

    const watiArchieve = this.communicationwatilLog[communicationId] ?? [];
    for (const archieve of watiArchieve) {
      const wati = archieve['numbers']?.length ?? 0;
      const sent = archieve['sent']?.length ?? 0;
      total+= wati;
      send += sent; 
    }

    return {
      total,
      sent : send
    }
  }


  getAppNotificationStats(communicationId : string){
    let total = 0;
    let send = 0;

    const appNotificationArchieve = this.communicationAppNotificationLog[communicationId] ?? [];
    for (const archieve of appNotificationArchieve) {
      const appNotification = archieve['profileid']?.length ?? 0;
      const sent = archieve['profilesuccess']?.length ?? 0;
      total+= appNotification;
      send += sent; 
    }

    return {
      total,
      sent : send
    }
  }

  // function to load participants products ( live )
  async loadParticipantsPrducts() {
    if (this.subscribtions['participantproducts']) {
      this.subscribtions['participantproducts'].unsubscribe();
    }
    const productref = this.arena['productref'] ?? null;

    if (productref) {
      try {
        const participantProductMap = {};
        const q = query(collection(this.firestore, 'participantsproduct'), where('productref', '==', productref), where('status', '==', null));
        this.subscribtions['participantproducts'] = collectionData(q).subscribe((participantProductSnap) => {
          for (const product of participantProductSnap) {
            const profileId = product['profileid'] ?? null;
            if (product) {
              participantProductMap[profileId] = product;
            }
          }
          this.participantProductMap = participantProductMap;
        });
      } catch (error) {
        console.log(error);
      }
    }
  }

  // function to load participants of eligible cohorts
  async loadEligibleCohorts() {
    try {
      const cohorts = (this.arena['eligibility']?.['cohortid'] ?? []) as Array<string>;
      if (cohorts?.length > 0) {
        const cohortParticipants = [];
        const q = query(collection(this.firestore, 'big cohorts'), where('docid', 'in', cohorts));
        const cohortSnap = await getDocs(q);
        for (const cohortRef of cohortSnap.docs) {
          const cohort = cohortRef.data();
          const participant = cohort['participantidlist'] ?? [];
          for (const pid of participant) {
            if (!cohortParticipants.includes(pid)) {
              cohortParticipants.push(pid);
            }
          }
        }
        this.cohortParticipants = cohortParticipants;
      }
    } catch (error) {
      console.log('Error in loading eligible cohorts : ', error);
    }
  }

  // function to load event checklists
  async loadEventCheckList() {
    const checkListMap = {};
    const eventId = this.eventId?.docid ?? null;
    if (!eventId) {
      return;
    }
    const evenref = doc(this.firestore, `event collection/${eventId}`);
    try {
      const collRef = collection(this.firestore, 'event checklist');
      const q = query(collRef, where('delete', '==', false), where('eventref', '==', evenref));
      const checkListSnap = await getDocs(q);
      checkListSnap.docs.forEach((docref) => {
        const checkDoc = docref.data();
        checkListMap[docref.id] = checkDoc;
      });
      this.checkListMap = checkListMap;
    } catch (err) {
      console.log(err);
    }
  }

  // function to load delivery sets of the product
  private async loadDeliverySets(arena: any): Promise<any[]> {
    const snap = await getDocs(query(collection(this.firestore, 'productToDeliverySequence'), where('product', '==', arena['productref'])));
    return snap.docs.length ? (snap.docs[0].data()['deliveryoptions'] ?? []) : [];
  }

  // function to load queue variations
  private async loadVariations(arena: any) {
    this.queueVariationList = [];
    this.mapQueueVariation = {};
    if (arena['type'] != 'queue') return;
    const snap = await getDocs(query(collection(this.firestore, 'queue variation'), where('queueref', '==', arena['eventref'])));
    snap.docs.forEach((d) => {
      this.mapQueueVariation[d.id] = d.data()['variationname'];
      this.queueVariationList.push({ id: d.id, data: d.data() });
    });
  }

  // function to load participant meta for rows
  private async loadMeta(rows: PRow[]) {
    const pending = rows.filter((r) => !r.metaLoaded);
    if (pending.length === 0) return;
    const productId = this.arena?.['productref']?.id; // for the consumedproducts "repeat" check
    const byId = new Map<string, PRow>();
    pending.forEach((r) => byId.set(r.profileid, r));
    const ids = [...byId.keys()];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          chunk.forEach((pid) => {
            const row = byId.get(pid);
            if (!row) return;
            const m = this.participantMetadata[pid] ?? {};
            const cs = (m['customerstatus'] ?? '').toString().trim().toLowerCase();
            const journeyId = cs === 'active' ? m['activejourney'] : cs === 'non active' ? m['lastcompletedjourney'] : m['lastsubscribedjourney'];
            row.journey = this.mapJourney[journeyId] ?? '';
            row.finance = m['financialstatus'] ?? '';
            row.purchaseValue = m['pp_totalpurchasevalue'] ?? null;
            row.paid = m['pp_totalpaid'] ?? null;
            row.customerStatus = m['customerstatus'] ?? '';
            // "Repeat" = this product is already in the participant's consumedproducts (product ids).
            row.completedProduct = !!productId && Array.isArray(m['consumedproducts']) && m['consumedproducts'].some((p: any) => String(p) === String(productId));
            // Name + number come from participant metadata (profile_data value stays only as fallback).
            if (m['name']) row.name = m['name'];
            const metaNum = m['phonenumber'] ?? m['number'];
            if (metaNum !== undefined && metaNum !== null && metaNum !== '') row.phone = metaNum.toString();
            row.metaLoaded = true;
          });
        } catch (e) {
          console.log('meta load failed', e);
          chunk.forEach((pid) => {
            const row = byId.get(pid);
            if (row) {
              row.metaError = true;
              row.metaLoaded = true;
            }
          });
        }
      }),
    );
  }

  // subscriptionend from the PJP collection — loaded lazily (only for the rows on screen / being exported).
  private async loadSubscriptions(rows: PRow[]) {
    const pending = rows.filter((r) => !r.subLoaded);
    if (pending.length === 0) return;
    const byId = new Map<string, PRow>();
    pending.forEach((r) => byId.set(r.profileid, r));
    const ids = [...byId.keys()];
    const now = Date.now();
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const snap = await getDocs(query(collection(this.firestore, 'participantjourneyproduct'), where('profileid', 'in', chunk)));
          const subByPid: Record<string, number> = {};
          snap.docs.forEach((d) => {
            const x = d.data();
            const pid = x['profileid'];
            if (!pid) return;
            const ms = this.toMillis(x['subscriptionend']);
            if (ms && (!subByPid[pid] || ms > subByPid[pid])) subByPid[pid] = ms;
          });
          chunk.forEach((pid) => {
            const row = byId.get(pid);
            if (!row) return;
            row.subscriptionend = subByPid[pid] ?? 0;
            row.subActive = row.subscriptionend ? row.subscriptionend >= now : false;
            row.subLoaded = true;
          });
        } catch (e) {
          console.log('subscription load failed', e);
          chunk.forEach((pid) => {
            const row = byId.get(pid);
            if (row) row.subLoaded = true;
          });
        }
      }),
    );
  }

  // function to load e-tickes eligibility
  async loadETicketEligibilty() {
    const eventid = this.eventId['docid'];
    if (!eventid) return;
    if (this.eticketEligibilitySubscription) {
      this.eticketEligibilitySubscription.unsubscribe();
    }
    const eligibilityCollRef = collection(this.firestore, 'e-ticket eligibility');
    const eligibilityQuery = query(eligibilityCollRef, where('eventid', '==', eventid));
    this.eticketEligibilitySubscription = collectionData(eligibilityQuery).subscribe((eligibilitysnap) => {
      this.mapEligibility = {};
      for (let i = 0; i < eligibilitysnap.length; i++) {
        const element = eligibilitysnap[i];
        this.mapEligibility[element['eventparticipationid']] = element;
      }
    });
  }

  // function to load sales leads of last 30 days
  async loadSalesLeads() {
    const arenaEndDate = new Date(this.eventEnd) ?? new Date();
    const start = new Date(arenaEndDate);
    const end = new Date(arenaEndDate);
    const participantSalesMap = {};

    start.setDate(start.getDate() - 30);
    end.setHours(23, 59, 59, 999);

    const salesQuery = query(collection(this.firestore, 'salesleads'), where('purchasedate', '>=', start), where('purchasedate', '<=', end));

    const salesLeadsSnap = await getDocs(salesQuery);

    for (const saleRef of salesLeadsSnap.docs) {
      const sale = saleRef.data();
      const participantId = sale['profileid'] ?? null;

      if (participantId && ['new', 'addon', 'upgrade'].includes(sale['journeytype'])) {
        participantSalesMap[participantId] = participantSalesMap[participantId] ?? [];
        participantSalesMap[participantId]?.push(sale);
      }
    }

    this.participantSalesMap = participantSalesMap;
  }

  // function to load applied checklists from localstorage
  async initAppliedCheckList() {
    await this.loadEventCheckList();
    const storage = JSON.parse(localStorage.getItem(this.EVENT_CHECKLIST) ?? '{}');
    const checklist = storage[this.eventId?.docid] ?? [];
    for (const checkListId of checklist) {
      this.columnRegistry[checkListId] = {
        label: this.checkListMap[checkListId]?.title,
        type: 'enum',
        defaultHtml: '—',
        defaultColumn: false,
        visible: () => !['potential', 'notRequested'].includes(this.segment),
        showFilter: true,
        checklist: true,
      };
    }
  }

  // Lazily load queue_token.currentstage for the whole event once (queue events only).
  async ensureQueueStages() {
    if (this.queueStagesLoaded || this.queueStagesLoading || this.arena?.['type'] !== 'queue') return;
    this.queueStagesLoading = true;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'queue_token'), where('queueref', '==', this.arena['eventref'])));
      snap.docs.forEach((d) => {
        const x = d.data();
        if (x['profile_id'] && x['currentstage']) this.queueStageByPid.set(x['profile_id'], x['currentstage']);
      });
      this.queueStagesLoaded = true;
    } catch (e) {
      console.log('queue stage load failed', e);
    } finally {
      this.queueStagesLoading = false;
    }
  }

  // ================================== Segment Processing =========================

  // function to get potential participants ( product owners )
  getPotentialParticipants() {
    const participants = Object.keys(this.participantProductMap);
    return participants;
  }

  // function to process event requests into segment lists
  async processEventRequest() {
    const eventRequestedParticipants = Object.keys(this.participantRequestMap);
    const arena = this.arena;
    const eligibility = arena['eligibility'] ?? {};
    const productConsumption = eligibility['productconsumption'] ?? [];
    const customerStatus = eligibility['customerstatus'] ?? [];
    const eligibilityJourney = eligibility['journeyid'] ?? [];
    const eligibleCohort = eligibility['cohortid'] ?? [];
    const cohortParticipants = [...this.cohortParticipants];
    const counts: Record<SegmentKey, Array<string>> = {
      potential: [],
      requested: [],
      notRequested: [],
      eligible: [],
      upgrade: [],
      addon: [],
      continuity: [],
      noteligible: [],
      noProduct: [],
      inQueue: [],
      approved: [],
      attended: [],
      noShow: [],
      unattended: [],
      revoked: [],
      overallRequested: [],
    };
    const potential = this.getPotentialParticipants();
    const queueParticipants = Object.keys(this.tokenMap).filter((pid: string) => {
      const active = (this.tokenMap[pid] ?? []).some((token: any) => token['tokenstatus']?.trim()?.toLocaleLowerCase() === 'active');
      return active;
    });

    const revokedByMap = {};

    for (const pid of eventRequestedParticipants) {
      const participantsRequest = this.participantRequestMap[pid] ?? [];
      if (queueParticipants.includes(pid)) counts['inQueue'].push(pid);
      for (const req of participantsRequest) {
        const status = req['status'] ?? null;
        switch (status) {
          case 'attended':
            counts['attended'].push(pid);
            break;
          case 'unattended':
            counts['unattended'].push(pid);
            break;
          case 'approved':
            counts['approved'].push(pid);
            break;
          case 'revoked':
            counts['revoked'].push(pid);
            revokedByMap[pid] = req;
            break;
          default:
            counts['requested'].push(pid);
            const bucket = this.participantBucket(pid, potential.includes(pid), customerStatus, productConsumption, eligibilityJourney, eligibleCohort, cohortParticipants);
            counts[bucket].push(pid);
            break;
        }
        if (req['attendance_state'] === 'no_show') {
          counts['noShow'].push(pid)
        }
      }
    }

    counts['potential'] = potential;
    for (const pid of potential) {
      if (!eventRequestedParticipants.includes(pid)) {
        counts['notRequested'].push(pid);
      }
    }

    const unique = [...counts['requested'], ...counts['approved'], ...counts['attended'], ...counts['unattended'], ...counts['revoked']];
    counts['overallRequested'] = [...unique];
    this.segmentList = counts;
    this.revokedByMap = revokedByMap;
  }

  // function to find the eligibility bucket of a participant
  participantBucket(
    pid: string,
    isOwner: boolean,
    customerStatus: Array<string>,
    productConsumption: Array<any>,
    eligibilityJourney: Array<string>,
    eligibleCohorts: Array<string>,
    cohortParticipants: Array<string>,
  ): SegmentKey {
    const metadata = this.participantMetadata[pid] ?? null;
    if (metadata) {
      const journey = metadata['activejourney'] ?? metadata['lastcompletedjourney'] ?? null;
      const status = metadata['customerstatus'] ?? null;
      const consumedproducts = {};

      for (const product of metadata['consumedproducts'] ?? []) {
        consumedproducts[product] = consumedproducts[product] ?? 0;
        consumedproducts[product] = consumedproducts[product] + 1;
      }

      const journeyMatch = eligibilityJourney.length === 0 || eligibilityJourney.includes(journey);
      const cohortMatch = eligibleCohorts.length === 0 || cohortParticipants.includes(pid);
      const consumptionMatch = productConsumption.every((product) => {
        const productId = product?.productid;
        if (product['operator'] === '==') {
          return (consumedproducts[productId] ?? 0) === product?.count;
        } else if (product['operator'] === '>=') {
          return (consumedproducts[productId] ?? 0) >= product?.count;
        } else if (product['operator'] === '<=') {
          return (consumedproducts[productId] ?? 0) <= product?.count;
        } else {
          return false;
        }
      });

      if (status == 'active') {
        if (!consumptionMatch || !cohortMatch) return 'noteligible';
        if (!journeyMatch) return 'upgrade';
        if (!isOwner) return 'addon';
        return 'eligible';
      }

      if (status == 'non active') {
        // if (!consumptionMatch || !cohortMatch) return 'not eligibile';
        if (customerStatus.includes('non active') && isOwner) return 'eligible';
        if (journeyMatch) return 'continuity';
        return 'upgrade';
      }
    }
    return 'noteligible';
  }

  // function to check participant is attended
  isAttended(pid: string) {
    return this.segmentList['attended'].includes(pid);
  }

  // function to check a row belongs to the given segment
  private matchesSegment(r: PRow, key: SegmentKey): boolean {
    switch (key) {
      case 'potential':
        return r.isOwner;
      case 'requested':
        return r.isRequested;
      case 'notRequested':
        return r.isNotRequested;
      case 'eligible':
        return r.isEligible;
      case 'upgrade':
        return r.isUpgrade;
      case 'addon':
        return r.isAddon;
      case 'continuity':
        return r.isContinuity;
      case 'noteligible':
        return r.notEligible;
      case 'noProduct':
        return r.isNoProduct;
      case 'inQueue':
        return r.isInQueueReq;
      case 'approved':
        return r.isApproved;
      case 'attended':
        return r.attended;
      case 'noShow':
        return r.attendanceState === 'no_show';
      case 'unattended':
        return r.isUnattended;
      case 'revoked':
        return r.isRevoked;
      case 'overallRequested':
        return r.isRequested || r.isApproved || r.isUnattended || r.isRevoked;
    }
    return false;
  }

  // function to check the current segment
  private inSegment(pid): boolean {
    return this.matchesSegment(pid, this.segment);
  }

  // function to change the segment
  setSegment(s: SegmentKey) {
    this.segment = s;
    this.journeyFilter = 'all'; // the journey filter is scoped to the Approved-by-journey card; clear it on navigation
    this.journeyFilterMembers = new Set();
    this.frFilter = 'all'; // same for the first-timer/repeat filter
    this.customerFilter = 'all';
    this.pageIndex = 0;
    this.defaultSelection();
    // this.refreshMeta();
    // if (this.showApprovalChecks) this.ensureQueueStages();
  }

  // ---- Post-approval checks (Queue stage) ----
  get showApprovalChecks(): boolean {
    return this.segment === 'approved' || this.segment === 'attended' || this.segment === 'noShow';
  }

  // ---- Post-approval checks ----
  get showAfterApprovalChecks(): boolean {
    return this.segment === 'approved' || this.segment === 'attended' || this.segment === 'noShow' || this.segment === 'unattended' || this.segment === 'revoked' || this.segment === 'overallRequested';
  }

  // get colSpan(): number {
  //   return (this.showSelect ? 1 : 0) + 8 + (this.showApprovalChecks ? 1 : 0);
  // }

  // ================================== Funnel Splits & Journeys =========================

  // function to get status key
  statusKey(s: string): string {
    return (
      (s || '')
        .trim()
        .toLowerCase() || 'notset'
    );
  }

  // function to get status label
  private statusLabel(s: string): string {
    return (s || '').trim() || 'Not set';
  }

  // function to get status splits of a segment
  statusSplit(key: SegmentKey): Split[] {
    return this.statusSplits[key] ?? [];
  }

  // function to get status color
  statusColor(key: string): string {
    if (this.statusColors[key]) return this.statusColors[key];
    const idx = this.customerStatusList.findIndex((s) => s.key === key);
    return this.statusPalette[(idx >= 0 ? idx : 0) % this.statusPalette.length];
  }

  // function to compute status splits and approved by journey
  private computeSplits(plist: Array<string>): void {
    const keys: SegmentKey[] = ['potential', 'requested', 'notRequested', 'eligible', 'noProduct', 'inQueue', 'approved', 'attended', 'noShow', 'unattended', 'revoked'];
    const out = {} as Record<SegmentKey, Split[]>;
    const allStatuses = new Map<string, string>();
    for (const k of keys) {
      const inSeg = this.segmentList[k];
      const m = new Map<string, Split>();
      for (const pid of inSeg) {
        const customerStatus = this.participantMetadata['customerstatus'] ?? 'none';
        const gk = this.statusKey(customerStatus);
        const label = this.statusLabel(customerStatus);
        allStatuses.set(gk, label);
        const e = m.get(gk) ?? { key: gk, label, count: 0 };
        e.count++;
        m.set(gk, e);
      }
      out[k] = [...m.values()].filter((e) => e.count > 0).sort((a, b) => b.count - a.count);
    }
    this.statusSplits = out;
    this.customerStatusList = [...allStatuses.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));

    const jm = new Map<string, JourneyRow>();
    for (const pid of plist) {
      if (!this.segmentList['approved'].includes(pid)) continue;
      const journey = this.getColumnValue('current journey', pid);
      const completedProduct = (this.participantMetadata[pid]?.['consumedproducts'] ?? [])?.includes(this.arena['productref']?.id);
      const label = (this.mapJourney[journey] || '').trim() || 'Not set';
      const e = jm.get(label) ?? {
        key: label,
        label,
        total: 0,
        first: 0,
        repeat: 0,
      };
      e.total++;
      if (completedProduct) e.repeat++;
      else e.first++;
      jm.set(label, e);
    }
    this.approvedByJourney = [...jm.values()].sort((a, b) => b.total - a.total);
    this.rebuildDisplayedJourneys();
  }

  // get overallRequested(): number {
  //   return (
  //     this.counts.requested +
  //     this.counts.approved +
  //     this.counts.unattended +
  //     this.counts.revoked
  //   );
  // }

  // function to count potential participants of a customer status
  potentialStatusCount(key: string): number {
    return (this.segmentList['potential'] ?? []).filter((pid) => this.participantMetadata[pid]?.['customerstatus'] === key)?.length;
  }

  // function to handle customer status chip click
  setCustomerChip(key: string): void {
    this.segment = 'potential';
    this.customerFilter = this.customerFilter === key ? 'all' : key;
    this.pageIndex = 0;
    this.defaultSelection();
  }

  // function to get journey color
  journeyColor(key: string): string {
    const i = this.displayedJourneys.findIndex((j) => j.key === key);
    return this.journeyPalette[(i < 0 ? 0 : i) % this.journeyPalette.length];
  }

  // function to get localstorage key of journey groups
  private journeyGroupsKey(): string {
    return 'epc_journey_groups_' + (this.arena?.['docid'] ?? 'unknown');
  }

  // function to load journey groups from localstorage
  private loadJourneyGroups(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(this.journeyGroupsKey());
      this.journeyGroups = raw ? JSON.parse(raw) || {} : {};
    } catch {
      this.journeyGroups = {};
    }
    this.rebuildDisplayedJourneys();
  }

  // function to save journey groups in localstorage
  private saveJourneyGroups(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(this.journeyGroupsKey(), JSON.stringify(this.journeyGroups));
    } catch {
      /* storage unavailable — grouping just won't persist */
    }
    this.rebuildDisplayedJourneys();
  }

  // function to toggle journey group edit mode
  toggleGroupEdit(): void {
    this.groupEditMode = !this.groupEditMode;
    this.journeySel = new Set(); // clear any pending selection when entering/leaving edit mode
    this.groupNameInput = '';
  }

  // Distinct group names already in use, for the datalist / add-to-existing.
  get existingGroupNames(): string[] {
    return [
      ...new Set(
        Object.values(this.journeyGroups)
          .map((g) => (g || '').trim())
          .filter(Boolean),
      ),
    ].sort();
  }

  // function to check journey is selected for grouping
  isJourneySel(label: string): boolean {
    return this.journeySel.has(label);
  }

  // function to toggle journey selection for grouping
  toggleJourneySel(label: string): void {
    if (this.journeySel.has(label)) this.journeySel.delete(label);
    else this.journeySel.add(label);
  }

  // Group the ticked journeys under the typed name (creates the group or adds to an existing one). Persists.
  groupSelected(): void {
    const name = (this.groupNameInput || '').trim();
    if (!name || !this.journeySel.size) return;
    this.journeySel.forEach((label) => {
      this.journeyGroups[label] = name;
    });
    this.saveJourneyGroups();
    this.journeySel = new Set();
    this.groupNameInput = '';
  }

  // Remove the ticked journeys from whatever group they're in. Persists.
  ungroupSelected(): void {
    if (!this.journeySel.size) return;
    this.journeySel.forEach((label) => {
      delete this.journeyGroups[label];
    });
    this.saveJourneyGroups();
    this.journeySel = new Set();
  }

  // Disband a whole group (all its journeys become ungrouped). Persists.
  ungroupGroup(groupName: string): void {
    Object.keys(this.journeyGroups).forEach((label) => {
      if (this.journeyGroups[label] === groupName) delete this.journeyGroups[label];
    });
    this.saveJourneyGroups();
  }

  // function to rebuild journeys shown in the card ( groups + singles )
  private rebuildDisplayedJourneys(): void {
    const groups = new Map<string, JourneyRow>();
    const singles: JourneyRow[] = [];
    for (const j of this.approvedByJourney) {
      const g = (this.journeyGroups[j.label] || '').trim();
      if (!g) {
        singles.push({ ...j, members: [j.label] });
        continue;
      }
      const key = 'grp:' + g;
      const e = groups.get(key) ?? {
        key,
        label: g,
        total: 0,
        first: 0,
        repeat: 0,
        members: [],
        isGroup: true,
      };
      e.total += j.total;
      e.first += j.first;
      e.repeat += j.repeat;
      e.members!.push(j.label);
      groups.set(key, e);
    }
    this.displayedJourneys = [...groups.values(), ...singles].sort((a, b) => b.total - a.total);
  }

  // function to get journey label of a row
  private journeyLabelOf(r: PRow): string {
    return (r.journey || '').trim() || 'Not set';
  }

  // The approved participants whose journey falls inside this group, sorted by name.
  groupParticipants(row: JourneyRow): PRow[] {
    const members = new Set(row.members ?? [row.label]);
    return this.rows.filter((r) => r.isApproved && members.has(this.journeyLabelOf(r))).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Which journeys are inside this group, and who is approved under each — powers the overlay panels.
  // Every member journey is listed even if it currently has no matching participants.
  // `fr` narrows to first-timers ('first') or repeats ('repeat'); 'all' is the whole approved cohort.
  groupJourneyBreakdown(row: JourneyRow, fr: 'all' | 'first' | 'repeat' = 'all'): { journey: string; participants: PRow[] }[] {
    const members = row.members ?? [row.label];
    const byJourney = new Map<string, PRow[]>();
    members.forEach((m) => byJourney.set(m, []));
    for (const r of this.rows) {
      if (!r.isApproved) continue;
      const isRepeat = !!r.completedProduct;
      if (fr === 'first' && isRepeat) continue;
      if (fr === 'repeat' && !isRepeat) continue;
      const lbl = this.journeyLabelOf(r);
      if (byJourney.has(lbl)) byJourney.get(lbl)!.push(r);
    }
    return [...members]
      .sort((a, b) => a.localeCompare(b))
      .map((m) => ({
        journey: m,
        participants: (byJourney.get(m) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }

  // Click a journey/group row → filter the table to the union of its journeys (clears the first/repeat sub-filter).
  // The participant list lives in the overlay opened by the people icon, not here.
  setJourneyChip(row: JourneyRow): void {
    this.segment = 'approved';
    const same = this.journeyFilter === row.key && this.frFilter === 'all';
    this.journeyFilter = same ? 'all' : row.key;
    this.journeyFilterMembers = same ? new Set() : new Set(row.members ?? [row.label]);
    this.frFilter = 'all';
    this.pageIndex = 0;
    this.defaultSelection();
    // this.refreshMeta();
  }

  // Click a first-timer/repeat pill under a journey/group → filter to that union ∩ that group (toggles off if repeated).
  setJourneyFr(row: JourneyRow, frKey: string): void {
    this.segment = 'approved';
    const same = this.journeyFilter === row.key && this.frFilter === frKey;
    this.journeyFilter = same ? 'all' : row.key;
    this.journeyFilterMembers = same ? new Set() : new Set(row.members ?? [row.label]);
    this.frFilter = same ? 'all' : frKey;
    this.pageIndex = 0;
    this.defaultSelection();
    // this.refreshMeta();
  }

  // function to check a row matches the journey filter
  private journeyMatches(r: PRow): boolean {
    if (this.journeyFilter === 'all') return true;
    return this.journeyFilterMembers.has((r.journey || '').trim() || 'Not set');
  }

  // function to check a participant matches first / repeat filter
  private frMatches(pid: string): boolean {
    if (this.frFilter === 'all') return true;
    const consumedProducts = this.participantMetadata[pid]?.['consumedproducts'] ?? [];
    const isRepeat = consumedProducts?.includes(this.arena['productref']?.id);
    return this.frFilter === 'repeat' ? isRepeat : !isRepeat;
  }

  // ================================== Table Rows =========================

  // function to check finance filter
  private financeMatches(pid: string): boolean {
    if (this.financeFilter === 'all') return true;
    const norm = (this.participantMetadata[pid]?.financialstatus || '').toLowerCase().replace('fullypaid', 'fully paid').replace(/\s+/g, ' ').trim();
    return norm === this.financeFilter;
  }

  // function to check customer status filter
  private customerMatches(pid : string) :  boolean {
    if (this.customerFilter === 'all') return true;
    const metadata = this.participantMetadata[pid];
    console.log(this.statusKey(metadata?.customerstatus))
    return this.statusKey(metadata?.customerstatus) === this.customerFilter;
  }

  // function to check sales filter
  private salesType(pid): boolean {
    if (!this.isSalesSelected) return true;
    // const pid = r?.profileid;
    return this.isnewParticipant(pid);
  }

  // function to check ticket category filter
  private ticketCategory(pid): boolean {
    if (this.selectedTicketCategory === 'all') return true;
    // const pid = r?.profileid;
    const metadata = this.participantMetadata[pid] ?? null;
    if (metadata) {
      const customersupport = metadata['customersupport'] ?? {};
      const ticketsList = Object.values(customersupport) as Array<any>;
      if (ticketsList.length > 0 && this.selectedTicketCategory !== 'ep') {
        return true;
      }
      for (const ticket of ticketsList) {
        const cat = ticket?.category;
        const isEp = cat === 'Events & Process';
        if (isEp) {
          return true;
        }
      }
    }
    return false;
  }

  // function to get participants of the current segment
  tableRows() {
    const eventRequestedParticipants = Object.keys(this.participantRequestMap);
    // return [...this.segmentList['potential'] , ...eventRequestedParticipants];
    return this.segment ? this.segmentList[this.segment] : [];
  }

  // function to get segment members after search
  segmentMembers() {
    const s = this.searchText.trim().toLowerCase();
    return this.tableRows().filter((pid) => {
      const participant = this.participantMetadata[pid] ?? null;
      if (!participant) return false
      const name = participant['name']?.trim()?.toLocaleLowerCase() ?? '';
      const email = participant['email']?.trim()?.toLocaleLowerCase() ?? '';
      return name.toLowerCase().includes(s) || email.toLowerCase().includes(s);
    });
  }

  get segmentRows() {
    return this.segmentMembers()
      .filter((pid) => this.frMatches(pid) && this.customerMatches(pid) && this.salesType(pid) && this.ticketCategory(pid) && this.filterByCheckList(pid) && this.filterRows(pid))
      .sort((a, b) => this.sortRow(a, b));
  }

  get pagedRows(): string[] {
    const start = this.pageIndex * this.pageSize;
    return this.segmentRows.slice(start, start + this.pageSize);
  }

  get isFiltered(): boolean {
    return this.financeFilter !== 'all' || this.customerFilter !== 'all' || this.journeyFilter !== 'all' || this.frFilter !== 'all' || this.searchText.trim().length > 0 || Object.keys(this.filterMap).length > 0;
  }

  // function to handle page change
  onPage(e: PageEvent) {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    // this.refreshMeta();
  }

  // function to handle search
  onSearch() {
    this.pageIndex = 0;
    // this.refreshMeta();
  }

  // function to handle finance filter change
  onFinance() {
    this.pageIndex = 0;
    // this.refreshMeta();
  }

  // function to handle customer filter change
  onCustomer() {
    this.pageIndex = 0;
    // this.refreshMeta();
  }

  // ================================== Selection =========================

  // ---- Selection: approve on Eligible + Not requested, attendance on Approved/Attended/No-show ----
  get selectionMode(): 'approve' | 'attend' | 'checklist' |'none' {
    if (this.segment === 'eligible' || this.segment === 'notRequested') return 'approve';
    if (this.segment === 'approved' || this.segment === 'noShow' || this.segment === 'attended') return 'attend';
    if (this.segment === 'overallRequested' || this.segment === 'revoked') return 'checklist' 
    return 'none';
  }

  get showSelect() {
    return this.selectionMode !== 'none';
  }

  // An owner is approvable whether or not they requested (matches initiate-event-product).
  private isApprovable(pid: string) {
    return (this.segmentList['eligible'].includes(pid) || this.segmentList['notRequested'].includes(pid)) && this.participantProductMap[pid];
  }

  // function to clear selection on segment change
  private defaultSelection() {
    // Start every segment with nothing checked — the user opts in.
    this.selection.clear();
    this.selection;
  }

  // function to check a participant can be selected
  isSelectable(pid: string) {
    if (this.selectionMode === 'approve') return this.isApprovable(pid);
    if (this.selectionMode === 'attend') return this.segmentList['approved'].includes(pid); // approved rows; attended ones can still be marked unattended
    if (this.selectionMode === 'checklist') return true; 
    return false;
  }

  // function to toggle a row selection
  toggleRow(pid: string) {
    if (this.isSelectable(pid)) this.selection.toggle(pid);
  }

  private get selectableInView() {
    return this.segmentRows.filter((r) => this.isSelectable(r));
  }

  // function to check all rows in view are selected
  isAllSelected() {
    const v = this.selectableInView;
    return v.length > 0 && v.every((r) => this.selection.isSelected(r));
  }

  // function to check any row in view is selected
  hasSelectionInView() {
    return this.selectableInView.some((r) => this.selection.isSelected(r));
  }

  // function to toggle select all rows in view
  masterToggle() {
    const v = this.selectableInView;
    if (this.isAllSelected()) v.forEach((r) => this.selection.deselect(r));
    else v.forEach((r) => this.selection.select(r));
  }

  get readyCount() {
    return this.selection.selected.filter((r) => this.isApprovable(r)).length;
  }

  get selectedToMark() {
    return this.selection.selected.filter((pid: string) => this.segmentList['approved'].includes(pid) && !this.segmentList['attended'].includes(pid));
  }

  get selectedToUnattend() {
    return this.selection.selected.filter((pid: string) => this.segmentList['approved'].includes(pid));
  }

  // Requested (not yet approved) rows that have an actual request doc to revoke.
  get selectedToRevokeRequested() {
    return this.selection.selected.filter((pid: string) => this.segmentList['requested'].includes(pid) && !this.segmentList['approved'].includes(pid));
  }

  // ================================== Approve =========================

  // function to get the reason approve is disabled
  approveDisabledReason(): string {
    if (this.readyCount === 0) return 'Select at least one eligible participant';
    if (!this.selectedDeliverySet) return 'Pick a delivery sequence to enable approve';
    if (this.arena?.['type'] === 'queue' && this.queueVariationList.length > 0 && !this.selectedQueueVariation) return 'Pick a queue variation';
    return '';
  }

  // function to check approve is enabled
  canApprove(): boolean {
    return this.approveDisabledReason() === '';
  }

  // function to approve selected participants
  async approveSelected() {
    if (!this.canApprove()) return;
    const selected = this.selection.selected.filter((r) => this.isApprovable(r));
    if (!selected.length) return;
    const canApp = await this.checkForParentEventApproval(selected);
    if (canApp?.length > 0) {
      const msg = `Participants not approved for hero event : ${canApp.join(',')}`;
      alert(msg);
      return;
    }

    // await this.loadMeta(selected);
    const risky = selected.filter((pid: string) => {
      const finance = this.participantMetadata[pid]?.financialstatus;
      return ['locked', 'defaulted'].includes((finance || '').toLowerCase().replace(/\s+/g, ' ').trim());
    });

    const ref = this.dialog.open(this.confirmTpl, {
      width: '420px',
      autoFocus: false,
      panelClass: 'sx-dialog',
      data: {
        title: 'Approve participants',
        body: `Approve ${selected.length} eligible participant(s) with delivery sequence “${this.selectedDeliverySet}”.`,
        warn: risky.length ? `${risky.length} have Locked or Defaulted finance.` : '',
        confirm: `Approve ${selected.length}`,
      },
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;
    await this.runApprove(selected);
  }

  // function to check participants are approved for the hero event
  private async checkForParentEventApproval(selected: string[]) {
    const hereEvent = this.subEvents.find((arena) => arena?.heroevent);
    if (hereEvent && !this.arena?.heroevent) {
      const total = selected.length;
      const chunks: string[][] = [];
      for (let i = 0; i < total; i += 30) chunks.push(selected.slice(i, i + 30));
      const noApprovedForHeroEvent = [];

      for (const chunk of chunks) {
        const profileIds = chunk;
        const q = query(collection(this.firestore, 'event participation request'), where('arenaeventid', '==', hereEvent?.docid), where('profileid', 'in', profileIds));
        const snap = await getDocs(q);
        snap.docs.forEach((docref) => {
          const data = docref.data();
          const name = this.participantMetadata[data['profileid']]?.name;
          if (!['approved', 'attended', 'unattended'].includes(data['status'])) {
            noApprovedForHeroEvent.push(name);
          }
        });
      }

      return noApprovedForHeroEvent;
    }
    return [];
  }

  // function to run approve in chunks
  private async runApprove(selected: string[]) {
    const total = selected.length;
    const chunks: string[][] = [];
    for (let i = 0; i < total; i += this.INITIATE_CHUNK_SIZE) chunks.push(selected.slice(i, i + this.INITIATE_CHUNK_SIZE));

    this.progress = {
      msg: 'Approving...',
      value: 0,
      total,
      eta: this.etaText(chunks.length - 1),
    };
    const pref = this.dialog.open(this.progressTpl, {
      width: '380px',
      disableClose: true,
      autoFocus: false,
      panelClass: 'sx-dialog',
    });
    let success = 0;
    const failed: string[] = [];

    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      try {
        const batch = writeBatch(this.firestore);
        for (const row of chunk) {
          const participantproductid = this.participantProductMap[row]?.['docid'] ?? null;
          const requestData = this.getRecentRequestData(this.participantRequestMap[row]);
          if (!participantproductid) continue;
          let participationId: string;
          let participationData: any;
          if (requestData) {
            if (requestData['status'] !== 'requested') continue;
            participationId = requestData['docid'];
            participationData = {
              eventref: this.arena['eventref'],
              productref: this.arena['productref'],
              status: 'approved',
              profileid: row,
              participantproductid: participantproductid,
              arenaeventid: this.arena['docid'],
              initiatedfrom: 'web',
            };
          } else {
            participationId = doc(collection(this.firestore, 'event participation request')).id;
            participationData = {
              docid: participationId,
              doccreateddate: serverTimestamp(),
              eventref: this.arena['eventref'],
              productref: this.arena['productref'],
              status: 'approved',
              profileid: row,
              participantproductid: participantproductid,
              arenaeventid: this.arena['docid'],
              initiatedfrom: 'web',
            };
          }
          const participationRef = doc(this.firestore, 'event participation request', participationId);
          batch.set(participationRef, participationData, { merge: true });
          const productData: any = {
            eventref: this.arena['eventref'],
            arenaeventid: this.arena['docid'],
            status: 'initiated',
            eventparticipationid: participationRef.id,
            deliverytype: this.selectedDeliverySet,
            'statusdate.initiated': serverTimestamp(),
          };
          if (this.arena['type'] == 'queue') productData['queuevariationid'] = this.selectedQueueVariation;
          batch.update(doc(this.firestore, 'participantsproduct', participantproductid!), productData);
        }
        await batch.commit();
        success += chunk.length;
      } catch (err) {
        failed.push(...chunk);
      }
      this.progress.value = Math.round(((success + failed.length) / total) * 100);
      this.progress.eta = this.etaText(chunks.length - 1 - c);
      if (c < chunks.length - 1) {
        this.progress.msg = `Waiting before next batch — ${success} / ${total} done`;
        await new Promise((res) => setTimeout(res, this.INITIATE_CHUNK_DELAY_MS));
        this.progress.msg = 'Approving...';
      }
    }
    pref.close();

    if (failed.length) {
      this.selection.clear();
      failed.forEach((r) => this.selection.select(r));
      this.dialog
        .open(this.failuresTpl, {
          width: '420px',
          autoFocus: false,
          panelClass: 'sx-dialog',
          data: { success, total, failed: failed },
        })
        .afterClosed()
        .subscribe((res) => {
          if (res === 'retry') this.runApprove(failed);
        });
    } else {
      this.snackbar.open(`Approved ${success} of ${total}`, 'OK', {
        duration: 4000,
      });
      // await this.loadData();
    }
  }

  // function to get remaining time text
  private etaText(remainingChunks: number): string {
    const secs = Math.max(0, remainingChunks) * (this.INITIATE_CHUNK_DELAY_MS / 1000);
    if (secs <= 0) return '';
    if (secs < 60) return `~${Math.round(secs)}s remaining`;
    return `~${Math.ceil(secs / 60)} min remaining`;
  }

  // ================================== Attendance & Revoke =========================

  // ---- Attendance ----
  async markAttended(plist: string[]) {
    const targets = plist
      .map((pid) => {
        const reqDoc = this.getRecentRequestData(this.participantRequestMap[pid] ?? []);
        return reqDoc ? { profileid: pid, approvedRequestId: reqDoc['docid'], attended: this.segmentList['attended'].includes(pid) } : {};
      })
      .filter((r) => r.approvedRequestId && !r.attended);
    if (!targets.length) return;
    // const wasNoShow = targets.filter(
    //   (r) => r.attendanceState === 'no_show',
    // ).length;
    this.progress = {
      msg: 'Marking attended...',
      value: 0,
      total: targets.length,
      eta: '',
    };
    const pref = this.dialog.open(this.progressTpl, {
      width: '380px',
      disableClose: true,
      autoFocus: false,
      panelClass: 'sx-dialog',
    });
    try {
      const refList = targets.map((r) => doc(this.firestore, 'event participation request', r.approvedRequestId!));
      const batch = writeBatch(this.firestore);
      targets.forEach((r, i) => {
        batch.update(refList[i], {
          status: 'attended',
        });
        batch.set(doc(collection(this.firestore, 'events_profiles')), {
          event_ref: this.arena['eventref'],
          profile_ref: doc(this.firestore, 'profile_data', r.profileid),
          pseudo_name: null,
          token: null,
          eventrequest: refList[i],
        });
      });
      for (let i = 0; i < refList.length; i += 10) {
        const sub = refList.slice(i, i + 10);
        const delSnap = await getDocs(query(collection(this.firestore, 'deliverables'), where('fileref', 'array-contains-any', sub)));
        delSnap.docs.forEach((d) => batch.update(d.ref, { status: 'completed' }));
      }
      await batch.commit();
      // targets.forEach((r) => {
      //   r.attended = true;
      //   r.attendanceState = 'attended';
      // });
      // this.counts.attended += targets.length;
      // this.counts.noShow = Math.max(0, this.counts.noShow - wasNoShow);
      this.selection.clear();
      this.snackbar.open(`Marked ${targets.length} attended`, 'OK', {
        duration: 4000,
      });
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not mark attended', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
  }

  // ---- Mark not attended (destructive): status -> 'unattended' AND cancel the product ----
  // Mirrors the legacy "Mark as Not Attended": cancels participantsproduct, deletes the events_profiles
  // record, and nulls the deliverables. Use this DURING the event; no-show (product-preserving) is at finalize.
  async markUnattended(plist: string[]) {
    const targets = plist
      .map((pid) => {
        const reqDoc = this.getRecentRequestData(this.participantRequestMap[pid] ?? []);
        return reqDoc ? { profileid: pid, approvedRequestId: reqDoc['docid'] } : {};
      })
      .filter((r) => r.approvedRequestId);
    if (!targets.length) return;
    const ref = this.dialog.open(this.confirmTpl, {
      width: '440px',
      autoFocus: false,
      panelClass: 'sx-dialog',
      data: {
        title: 'Mark not attended',
        body: `Mark ${targets.length} participant(s) as not attended. Their product will be cancelled.`,
        warn: 'This cancels the product, removes their event profile, and clears deliverables. It cannot be undone.',
        confirm: `Mark ${targets.length} unattended`,
      },
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.progress = {
      msg: 'Cancelling…',
      value: 0,
      total: targets.length,
      eta: '',
    };
    const pref = this.dialog.open(this.progressTpl, {
      width: '380px',
      disableClose: true,
      autoFocus: false,
      panelClass: 'sx-dialog',
    });
    try {
      const batch = writeBatch(this.firestore);
      const reqRefs = targets.map((r) => doc(this.firestore, 'event participation request', r.approvedRequestId!));
      targets.forEach((r, i) => {
        batch.update(reqRefs[i], { status: 'unattended' });
      });
      // Delete the events_profiles record for each (profile + event).
      for (const r of targets) {
        const epSnap = await getDocs(query(collection(this.firestore, 'events_profiles'), where('profile_ref', '==', doc(this.firestore, 'profile_data', r.profileid)), where('event_ref', '==', this.arena['eventref'])));
        epSnap.docs.forEach((d) => batch.delete(d.ref));
      }
      // Cancel the product from the deliverable (matches event-participation-approve), then null the deliverables.
      for (let i = 0; i < reqRefs.length; i += 10) {
        const sub = reqRefs.slice(i, i + 10);
        const delSnap = await getDocs(query(collection(this.firestore, 'deliverables'), where('fileref', 'array-contains-any', sub)));
        delSnap.docs.forEach((d) => {
          const dd = d.data();
          if (dd['participantproductid']) {
            batch.update(doc(this.firestore, 'participantsproduct', dd['participantproductid']), { status: 'cancelled' });
          }
          batch.update(d.ref, { status: null });
        });
      }
      await batch.commit();
      this.snackbar.open(`Marked ${targets.length} not attended`, 'OK', {
        duration: 4000,
      });
      this.selection.clear();
      // await this.loadData();
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not mark not attended', 'OK', {
        duration: 4000,
      });
    } finally {
      pref.close();
    }
  }

  // ---- Revoke (destructive): status -> 'revoked' AND cancel the product, then re-assign a product ----
  // Same writes as markUnattended EXCEPT the request status is 'revoked' (not 'unattended'). On success we
  // auto-open the shared bulk-add-products dialog, pre-loaded with the revoked profiles + this event's product,
  // so an admin can create a fresh product for them in one flow.
  get selectedToRevoke() {
    return this.selection.selected.filter((r) => this.segmentList['approved'].includes(r));
  }

  async markRevoked(pids: string[]) {
    const targets = pids
      .map((pid) => {
        const reqDoc = this.getRecentRequestData(this.participantRequestMap[pid] ?? []);
        return reqDoc;
      })
      .filter((reqDoc) => reqDoc && reqDoc['docid'] && reqDoc['profileid']);

    if (!targets.length) return;
    const ref = this.dialog.open(this.confirmTpl, {
      width: '440px',
      autoFocus: false,
      panelClass: 'sx-dialog',
      data: {
        title: 'Revoke participation',
        body: `Revoke ${targets.length} participant(s). Their current product will be cancelled, then you can assign a new one.`,
        warn: 'This cancels the product, removes their event profile, and clears deliverables. It cannot be undone.',
        confirm: `Revoke ${targets.length}`,
      },
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.progress = {
      msg: 'Revoking…',
      value: 0,
      total: targets.length,
      eta: '',
    };
    const pref = this.dialog.open(this.progressTpl, {
      width: '380px',
      disableClose: true,
      autoFocus: false,
      panelClass: 'sx-dialog',
    });
    let committed = false;
    try {
      const batch = writeBatch(this.firestore);
      const reqRefs = targets.map((reqData: any) => doc(this.firestore, 'event participation request', reqData['docid']));
      const revokedBy = (this.guard.loggedinProfile as any)?.['profileid'] ?? null;
      targets.forEach((r, i) => {
        batch.update(reqRefs[i], {
          status: 'revoked',
          revoked_by: revokedBy,
          revoked_date: serverTimestamp(),
        });
      });
      // Delete the events_profiles record for each (profile + event).
      for (const reqData of targets) {
        const epSnap = await getDocs(
          query(collection(this.firestore, 'events_profiles'), where('profile_ref', '==', doc(this.firestore, 'profile_data', reqData['profileid'])), where('event_ref', '==', this.arena['eventref'])),
        );
        epSnap.docs.forEach((d) => batch.delete(d.ref));
      }
      // Cancel the product from the deliverable, then null the deliverables.
      for (let i = 0; i < reqRefs.length; i += 10) {
        const sub = reqRefs.slice(i, i + 10);
        const delSnap = await getDocs(query(collection(this.firestore, 'deliverables'), where('fileref', 'array-contains-any', sub)));
        delSnap.docs.forEach((d) => {
          const dd = d.data();
          if (dd['participantproductid']) {
            batch.update(doc(this.firestore, 'participantsproduct', dd['participantproductid']), { status: 'cancelled' });
          }
          batch.update(d.ref, { status: null });
        });
      }
      await batch.commit();
      committed = true;
      this.snackbar.open(`Revoked ${targets.length}`, 'OK', { duration: 4000 });
      this.selection.clear();
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not revoke', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
    if (!committed) return;

    // Auto-open the bulk-add dialog with the revoked profiles + this event's product to create a new product.
    const participants = targets.map((r) => {
      const metadata = this.participantMetadata[r['profileid']];

      return {
        profileid: metadata?.profileid,
        name: metadata?.name,
        email: metadata?.email,
      };
    });
    console.log('REVOKE→bulk-add', {
      productrefId: this.arena?.['productref']?.id,
      productrefResolvesToName: this.mapProduct[this.arena?.['productref']?.id],
      participants,
    });
    this.dialog
      .open(BulkAddProductsComponent, {
        data: { participants, productrefId: this.arena?.['productref']?.id },
        width: '70vw',
        disableClose: true,
        panelClass: 'sx-dialog-surface',
      })
      .afterClosed()
      .subscribe(async () => {
        const seq = this.selectedDeliverySet,
          variation = this.selectedQueueVariation;
        // await this.loadData();
        this.selectedDeliverySet = seq;
        this.selectedQueueVariation = variation;
      });
  }

  // Single per-row entry point: approved rows take the heavy path (cancel product etc.),
  // requested rows take the lightweight status-only path.
  revoke(pid: string) {
    if (this.segmentList['approved'].includes(pid)) this.markRevoked([pid]);
    else this.markRevokedRequested([pid]);
  }

  // ---- Revoke a still-REQUESTED participant (lightweight): status -> 'revoked' only. ----
  // Requested people have no initiated product / event profile / deliverables yet, so unlike
  // markRevoked() this ONLY flips the request status and records who/when — nothing else is touched.
  async markRevokedRequested(pids: string[]) {
    const targets = pids
      .map((pid) => {
        const reqDoc = this.getRecentRequestData(this.participantRequestMap[pid] ?? []);
        return reqDoc;
      })
      .filter((reqDoc) => reqDoc && reqDoc['docid'] && reqDoc['profileid'] && reqDoc['status'] !== 'approved');

    if (!targets.length) return;
    const ref = this.dialog.open(this.confirmTpl, {
      width: '440px',
      autoFocus: false,
      panelClass: 'sx-dialog',
      data: {
        title: 'Revoke requested participation',
        body: `Revoke ${targets.length} requested participant(s). Their request will be cancelled.`,
        warn: 'This cancels the participation request. It cannot be undone.',
        confirm: `Revoke ${targets.length}`,
      },
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.progress = {
      msg: 'Revoking…',
      value: 0,
      total: targets.length,
      eta: '',
    };
    const pref = this.dialog.open(this.progressTpl, {
      width: '380px',
      disableClose: true,
      autoFocus: false,
      panelClass: 'sx-dialog',
    });
    try {
      const batch = writeBatch(this.firestore);
      const revokedBy = (this.guard.loggedinProfile as any)?.['profileid'] ?? null;
      for (const reqData of targets) {
        batch.update(doc(this.firestore, 'event participation request', reqData['docid']), {
          status: 'revoked',
          revoked_by: revokedBy,
          revoked_date: serverTimestamp(),
        });
      }
      await batch.commit();
      this.snackbar.open(`Revoked ${targets.length}`, 'OK', { duration: 4000 });
      this.selection.clear();
      // await this.loadData();
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not revoke', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
  }

  // function to get revoked data of a participant
  getRevokedData(pid: string) {
    const revokeData = this.getRecentRevokedDoc(pid);
    return revokeData;
  }

  // function to get the recent revoked request of a participant
  getRecentRevokedDoc(pid: string) {
    const request = this.participantRequestMap[pid] ?? [];
    if (!request || request.length === 0) return null;
    let result = null;
    for (let i = 0; i < request.length; i++) {
      if (request['status'] === 'revoked') {
        const r = request[i];
        if (result) {
          const oldRequestDate = this.toDate(result['doccreateddate']) ?? null;
          const currentReqDate = this.toDate(r['doccreateddate']) ?? null;
          if (currentReqDate && currentReqDate > oldRequestDate) {
            result = r;
          }
        } else {
          result = r;
        }
      }
    }

    return result;
  }

  // function to get the name of the profile who revoked the participant
  revokedByName(pid: string) {
    return this.participantMetadata[this.revokedByMap[pid]?.revoked_by || '']?.name ?? '';
  }

  // ---- Assign product (no-product rows) ----
  assignProduct(pid: string) {
    const metadata = this.participantMetadata[pid] ?? null;
    if (!metadata) return;
    const participants = [{ profileid: pid, name: metadata?.name, email: metadata?.email }];
    this.dialog
      .open(BulkAddProductsComponent, {
        data: { participants, productrefId: this.arena?.['productref']?.id },
        width: '70vw',
        disableClose: true,
        panelClass: 'sx-dialog-surface',
      })
      .afterClosed()
      .subscribe(async () => {
        const seq = this.selectedDeliverySet,
          variation = this.selectedQueueVariation;
        // await this.loadData();
        this.selectedDeliverySet = seq;
        this.selectedQueueVariation = variation;
      });
  }

  // ================================== Finalize Attendance =========================

  // ---- Finalize attendance (after the event): mark no-show + lock the frozen snapshot ----
  // Product-preserving: writes only namespaced fields (attendance on the request, snapshot on the arena doc).
  get eventEnded(): boolean {
    return !!this.eventEnd && Date.now() > this.eventEnd;
  }

  get alreadyFinalized(): boolean {
    return !!this.arena?.['epc_snapshot'];
  }

  get pendingNoShow(): string[] {
    return this.segmentList['approved'].filter((pid : string) => !this.segmentList['attended'].includes(pid));
  }

  get canFinalize(): boolean {
    return this.eventEnded && !this.alreadyFinalized;
  }

  get frozenStats() {
    const s = this.arena?.['epc_snapshot'];
    const att = s ? s['attended'] || 0 : this.segmentList['attended'].length;
    const app = s ? s['approved'] || 0 : this.segmentList['approved'].length;
    const pot = s ? s['potential'] || 0 : this.segmentList['potential'].length;
    return {
      attended: att,
      approved: app,
      potential: pot,
      ofApproved: app ? Math.round((att / app) * 100) : 0,
      ofPotential: pot ? Math.round((att / pot) * 100) : 0,
    };
  }

  // function to finalize attendance
  async finalizeAttendance() {
    if (!this.canFinalize) return;
    const targets = this.pendingNoShow
      .map((pid) => {
        const reqDoc = this.getRecentRequestData(this.participantRequestMap[pid] ?? []);
        return reqDoc?.['docid'] ? { approvedRequestId : reqDoc['docid'] } : null;
      })
      .filter((reqDoc) => reqDoc);
    const ref = this.dialog.open(this.confirmTpl, {
      width: '420px',
      autoFocus: false,
      panelClass: 'sx-dialog',
      data: {
        title: 'Finalize attendance',
        body: targets.length
          ? `Mark ${targets.length} approved participant(s) who did not attend as no-show, and lock this event's final numbers. Their product is not changed.`
          : `Lock this event's final numbers. Everyone approved has attended.`,
        warn: 'This cannot be undone.',
        confirm: 'Finalize',
      },
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.progress = {
      msg: 'Finalizing...',
      value: 0,
      total: Math.max(1, targets.length),
      eta: '',
    };
    const pref = this.dialog.open(this.progressTpl, {
      width: '380px',
      disableClose: true,
      autoFocus: false,
      panelClass: 'sx-dialog',
    });
    try {
      for (let i = 0; i < targets.length; i += 400) {
        const chunk = targets.slice(i, i + 400);
        const batch = writeBatch(this.firestore);
        chunk.forEach((r) => {
          batch.update(doc(this.firestore, 'event participation request', r.approvedRequestId!), {
            attendance_state: 'no_show',
            attendance_source: 'manual',
            attendance_marked_at: serverTimestamp(),
          });
        });
        await batch.commit();
        this.progress.value = Math.round((Math.min(i + chunk.length, targets.length) / targets.length) * 100);
      }
      // targets.forEach((r) => {
      //   r.attendanceState = 'no_show';
      // });
      // this.counts.noShow += targets.length;

      const snapshot = {
        potential: this.segmentList['potential'].length,
        requested: this.segmentList['requested'].length,
        notRequested: this.segmentList['notRequested'].length,
        eligible: this.segmentList['eligible'].length,
        upgrade: this.segmentList['upgrade'].length,
        addon: this.segmentList['addon'].length,
        continuity: this.segmentList['continuity'].length,
        inQueue: this.segmentList['inQueue'].length,
        approved: this.segmentList['approved'].length,
        attended: this.segmentList['attended'].length,
        noShow: this.segmentList['noShow'].length,
      };
      await updateDoc(doc(this.firestore, 'arena events', this.arena['docid']), {
        epc_snapshot: snapshot,
        epc_snapshot_at: serverTimestamp(),
      });
      this.arena['epc_snapshot'] = snapshot;
      this.snackbar.open(targets.length ? `Finalized — ${targets.length} marked no-show` : 'Event finalized', 'OK', { duration: 4000 });
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not finalize', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
  }

  // ================================== Bulk Import =========================

  // ---- Bulk import (Excel) — mirrors initiate-event-product, incl. non-requesters ----
  downloadSampleExcel() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'email'],
      ['Jane Doe', 'jane@example.com'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    XLSX.writeFile(wb, 'participants_sample.xlsx');
  }

  // function to import participants from excel and preview them
  importParticipants() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xls,.xlsx';
    input.addEventListener('change', (ev: any) => {
      const file: File = ev.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        this.snackbar.open('File too large (max 10MB)', 'OK', {
          duration: 4000,
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
          }) as any[][];
          const parsed: ImportPreviewRow[] = [];
          const seen = new Set<string>();
          json.forEach((row, idx) => {
            if (idx === 0 || !row[0] || !row[1]) return;
            const name = row[0].toString().trim();
            const email = row[1].toString().trim().toLowerCase();
            if (name && email && !seen.has(email)) {
              seen.add(email);
              parsed.push({ name, email });
            }
          });
          const willAdd: ImportPreviewRow[] = [],
            inQueue: ImportPreviewRow[] = [],
            noProduct: ImportPreviewRow[] = [];
          this.pendingImportRows = [];
          parsed.forEach((p) => {
            const owner = this.ownerByEmail.get(p.email);
            if (owner && (owner.inQueue || this.activeProfileIds.has(owner.profileid))) inQueue.push(p);
            else if (owner) {
              willAdd.push(p);
              this.pendingImportRows.push(owner);
            } else noProduct.push(p);
          });
          this.importPreview = {
            total: parsed.length,
            willAdd,
            inQueue,
            noProduct,
          };
          this.importExpand = {
            willAdd: false,
            inQueue: false,
            noProduct: false,
          };
          this.importDialogRef = this.dialog.open(this.importTpl, {
            width: '560px',
            maxHeight: '90vh',
            autoFocus: false,
            panelClass: 'sx-dialog',
          });
        } catch (err) {
          console.log(err);
          this.snackbar.open('Could not read file', 'OK', { duration: 4000 });
        }
      };
      reader.onerror = () => this.snackbar.open('Could not read file', 'OK', { duration: 4000 });
      reader.readAsArrayBuffer(file);
    });
    input.click();
  }

  // Confirm import → initiate the owner rows (eligible OR not-requested) with the chosen sequence.
  async confirmImport() {
    this.importDialogRef?.close();
    const rows = this.pendingImportRows.slice();
    this.pendingImportRows = [];
    if (!rows.length) {
      this.snackbar.open('No participants to add', 'OK', { duration: 4000 });
      return;
    }
    if (!this.selectedDeliverySet) {
      this.snackbar.open('Pick a delivery sequence first, then import', 'OK', {
        duration: 5000,
      });
      return;
    }
    if (this.arena?.['type'] === 'queue' && this.queueVariationList.length > 0 && !this.selectedQueueVariation) {
      this.snackbar.open('Pick a queue variation first, then import', 'OK', {
        duration: 5000,
      });
      return;
    }
    await this.runApprove([]);
  }

  // Assign the product to the imported "no product" people via the shared bulk-add dialog.
  assignImportNoProduct() {
    const noProduct = this.importPreview?.noProduct ?? [];
    const participants = noProduct
      .map((p) => ({
        profileid: this.mapEmailData[p.email]?.['profileid'],
        name: p.name,
        email: p.email,
      }))
      .filter((p) => p.profileid);
    this.importDialogRef?.close();
    if (!participants.length) {
      this.snackbar.open('No matching profiles to assign', 'OK', {
        duration: 4000,
      });
      return;
    }
    this.dialog
      .open(BulkAddProductsComponent, {
        data: { participants, productrefId: this.arena?.['productref']?.id },
        width: '70vw',
        disableClose: true,
        panelClass: 'sx-dialog-surface',
      })
      .afterClosed()
      .subscribe(async () => {
        const seq = this.selectedDeliverySet,
          variation = this.selectedQueueVariation;
        // await this.loadData();
        this.selectedDeliverySet = seq;
        this.selectedQueueVariation = variation;
      });
  }

  // function to export the imported no product list
  exportImportNoProduct() {
    const ws = XLSX.utils.json_to_sheet(this.importPreview?.noProduct ?? []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'No product');
    XLSX.writeFile(wb, 'import_no_product.xlsx');
  }

  // function to ask for the sample excel or open the file picker
  handleImportClick() {
    const sampleDownload = confirm('Do you want to download sample Import Excel');
    if (sampleDownload) {
      const data = [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' },
        { name: 'surya', email: 'surya.thiruvengadam@soexcellence.com' },
      ];

      const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);

      const workbook: XLSX.WorkBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample');

      XLSX.writeFile(workbook, 'sample_format.xlsx');
      return;
    }
    this.inputFile.nativeElement.click();
  }

  // function to select the table rows matching the uploaded excel emails
  onChange(evt: Event) {
    const target = evt.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    this.isExcelFile = /\.(xls|xlsx)$/i.test(file.name);

    if (!this.isExcelFile) {
      this.inputFile.nativeElement.value = '';
      console.log('Invalid file type. Please upload an Excel file.');
      return;
    }

    if (target.files.length > 1) {
      this.inputFile.nativeElement.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;

      try {
        const wb: XLSX.WorkBook = XLSX.read(arrayBuffer, {
          type: 'array',
          cellDates: true,
        });

        const wsname: string = wb.SheetNames[0];
        const ws: XLSX.WorkSheet = wb.Sheets[wsname];

        const data = XLSX.utils.sheet_to_json(ws);

        console.log('Imported List', data.length);

        data
          // .filter((e: any) => this.emailList.includes(e.email))
          .forEach((g: any) => {
            const matched = this.segmentRows.find((pid: string) => {
              const email = this.participantMetadata[pid]?.['email'];
              return email === g['email'];
            });
            console.log(matched, 'matchd');

            if (matched) {
              this.selection.toggle(matched);
            } else {
              console.log('Unmatched', g['email']);
            }
          });
      } catch (error) {
        console.error('Error processing file:', error);
      }
    };

    this.inputFile.nativeElement.value = '';
    reader.readAsArrayBuffer(file);
  }

  // ================================== Communications =========================

  // ---- Communications (sends to the current segment's participants) ----
  get commsRecipients(): string[] {
    return this.selection.selected;
  }

  get communications() {
    return Object.values(this.communicationMap);
  }

  // function to send whatsapp message
  sendWhatsApp() {
    const recipients = this.commsRecipients.map((pid) => this.participantMetadata[pid]);
    if (!recipients.length) {
      this.snackbar.open('No participants to message', 'OK', {
        duration: 3000,
      });
      return;
    }
    const data = recipients.map((r) => ({
      profileid: r.profileid,
      name: r.name,
      email: r.email,
    }));
    this.dialog
      .open(WatiInputComponent, {
        data,
        width: '70vw',
        height: '80vh',
        disableClose: true,
        panelClass: 'sx-dialog-surface',
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        const failed = result === 'failed' || result?.status === 'failed';
        this.snackbar.open(failed ? 'WhatsApp send failed' : 'WhatsApp message sent', 'OK', { duration: 4000 });
      });
  }

  // function to send app notification
  sendNotification() {
    const recipients = this.commsRecipients.map((pid) => this.participantMetadata[pid]);
    if (!recipients.length) {
      this.snackbar.open('No participants to notify', 'OK', { duration: 3000 });
      return;
    }
    const profileids = recipients.map((r) => r.profileid);
    this.dialog
      .open(AhNotificationComponent, {
        width: '60vw',
        maxHeight: '90vh',
        disableClose: true,
        autoFocus: false,
        panelClass: 'sx-dialog-surface',
      })
      .afterClosed()
      .subscribe(async (result) => {
        if (!result) return;
        try {
          let image: string | null = null;
          if (result['notificationimage']) {
            const path = 'Notification Images/' + new Date().toISOString() + result['notificationimage'].name;
            const up = await uploadBytes(ref(this.storage, path), result['notificationimage']);
            image = await getDownloadURL(up.ref);
          }
          await this.guard.saveNotificationRecord({
            title: result['title'],
            message: result['message'],
            subtitle: result['subtitle'] ?? null,
            notificationtype: 'ahupdate',
            notificationimage: image,
            sticky: result['sticky'],
            logged: true,
            landingpage: result['landingpage'],
            profileid: profileids,
            receivingapp: result['receivingapp'] ?? 'breakthroughsapp',
          });
          this.snackbar.open(`Notification sent to ${profileids.length}`, 'OK', { duration: 4000 });
        } catch (e) {
          console.log(e);
          this.snackbar.open('Could not send notification', 'OK', {
            duration: 4000,
          });
        }
      });
  }

  // function to send email
  sendEmail() {
    const recipients = this.commsRecipients.map((pid) => this.participantMetadata[pid]);
    if (!recipients.length) {
      this.snackbar.open('No participants to email', 'OK', { duration: 3000 });
      return;
    }
    const data = recipients.map((r) => ({
      profileid: r.profileid,
      name: r.name,
      email: r.email,
    }));
    this.dialog
      .open(EmailInputComponent, {
        data,
        minWidth: '600px',
        disableClose: true,
        panelClass: 'sx-dialog-surface',
      })
      .afterClosed()
      .subscribe(async (result: any) => {
        if (!result) return;
        try {
          if (result['status'] === 'queued' || result['status'] === 'send') {
            await setDoc(doc(collection(this.firestore, 'email archive'), result['docid']), result, { merge: true });
            this.snackbar.open('Email queued', 'OK', { duration: 4000 });
          } else if (result['status'] === 'validated') {
            const url =
              environment.firebase.projectId === 'starlabs-test' ? 'https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail' : 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail';
            const payload: any = { ...result, archiveid: result['docid'] };
            this.http
              .post(url, JSON.stringify(payload), {
                responseType: 'text',
                headers: new HttpHeaders().set('Content-Type', 'application/json'),
              })
              .subscribe({
                next: () => this.snackbar.open('Email sent', 'OK', { duration: 4000 }),
                error: (e) => {
                  console.log(e);
                  this.snackbar.open('Error sending email', 'OK', {
                    duration: 4000,
                  });
                },
              });
          }
        } catch (e) {
          console.log(e);
          this.snackbar.open('Could not send email', 'OK', { duration: 4000 });
        }
      });
  }

  // ================================== Export =========================

  // Funnel-bucket label for a row (used in export "Eligibility" column).
  eligibilityLabel(r: PRow): string {
    if (r.isUnattended) return 'Unattended';
    if (r.attended) return 'Attended';
    if (r.attendanceState === 'no_show') return 'No-show';
    if (r.isApproved) return 'Approved';
    if (r.isEligible) return 'Eligible';
    if (r.isNoProduct) return 'No product';
    if (r.isInQueueReq) return 'In queue';
    if (r.isNotRequested) return 'Not requested';
    return '';
  }

  // function to export the current segment list to excel
  exportList() {
    const rows = this.segmentRows;
    if (!rows.length) {
      this.snackbar.open('Nothing to export', 'OK', { duration: 3000 });
      return;
    }

    try {
      // name , email and phone are always exported , then the columns shown in the table
      const columns = ['name', 'email', 'phonenumber'];
      for (const column of this.tableColumns) {
        if (column === 'select' || columns.includes(column)) continue;
        columns.push(column);
      }

      const data: any[] = [];
      for (const row of rows) {
        const item: any = {};

        for (const column of columns) {
          const config = this.columnRegistry[column];
          if (!config) continue;

          const label = config.label;
          const value = this.getColumnValue(column, row);

          if (config.type === 'date') {
            let date = this.toDate(value);
            if (date && isNaN(date.getTime())) date = null;

            // real Excel date (date only) so it sorts and filters as a date
            item[label] = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : '';

            // if (column === 'requestedDate') item['Requested time'] = date ? formatDate(date, 'h:mm:ss a', 'en-US') : '';
            // if (column === 'subscriptionend') item['Subscription status'] = date ? (row.subActive ? 'Active' : 'Expired') : '';
          } else if (column === 'current journey') {
            item[label] = this.mapJourney[value];
          } else if (config.type === 'relation') {
            const products = [];
            for (const [id, count] of Object.entries(value ?? {})) {
              products.push(`${this.mapProduct[id] ?? id} - ${count}`);
            }
            item[label] = products.join('; ');
          } else if (config.checklist) {
            item[label] = value === 'clear' ? 'Clear' : 'Not clear';
          } else {
            item[label] = value ?? '';
          }
        }

        data.push(item);
      }

      const ws = XLSX.utils.json_to_sheet(data, { cellDates: true, dateNF: 'yyyy-mm-dd' });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Participants');
      XLSX.writeFile(wb, `${this.productName}_${this.segment}.xlsx`);

      this.snackbar.open(`Exported ${rows.length} rows`, 'OK', { duration: 3000 });
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not export', 'OK', { duration: 4000 });
    }
  }

  // ================================== Sales & Tickets =========================

  // function to calculate last 30 days sales
  calculateSales(overAllRequestedParticipants: Array<string>) {
    let last30daysSale = 0;
    for (const pid of overAllRequestedParticipants) {
      if (this.isnewParticipant(pid)) {
        last30daysSale++;
      }
    }
    this.last30daysSale = last30daysSale;
  }

  // function to check participant is a new sale
  isnewParticipant(pid: string) {
    const sales = this.participantSalesMap[pid];
    const product = this.arena['productref']?.id;
    const journey = this.arena?.['eligibility']?.journeyid ?? [];
    if (sales) {
      for (const sale of sales) {
        if ((['new', 'upgrade'].includes(sale?.journeytype) && journey.includes(sale?.journey)) || sale?.addon?.includes(product)) {
          return true;
        }
      }
    }
    return false;
  }

  // function to calculate open customer tickets
  calculateCustomerTickets(overAllRequestedParticipants: Array<string>) {
    const openTickets = {
      eventProcessTickets: 0,
      others: 0,
    };
    for (const pid of overAllRequestedParticipants) {
      const metadata = this.participantMetadata[pid] ?? null;
      if (metadata) {
        const customersupport = metadata['customersupport'] ?? {};
        for (const [ticketId, ticket] of Object.entries(customersupport) as any) {
          if (ticket?.category === 'Events & Process') {
            openTickets.eventProcessTickets++;
          } else {
            openTickets.others++;
          }
        }
      }
    }
    this.openTickets = openTickets;
  }

  // Venue fee column — exempted / paid / not paid, from the e-ticket eligibility mirror
  getVenueFeeStatus(eventParticipationId: any): string {
    // const eventParticipationId = row['approvedRequestId'];
    const eligibility = this.mapEligibility[eventParticipationId];
    if ([null, undefined].includes(eligibility)) {
      return 'Not paid';
    }
    if (eligibility['exempted'] === true) {
      return 'Exempted';
    }
    return eligibility['venue_fee_paid'] === true ? 'Paid' : 'Not paid';
  }

  // function to toggle sales filter
  toggleSaleClick() {
    this.isSalesSelected = !this.isSalesSelected;
    this.segment = 'overallRequested';
    this.pageIndex = 0;
    this.defaultSelection();
  }

  // function to toggle tickets filter
  toggleTickets(category: 'all' | 'ep' | 'others') {
    if (this.selectedTicketCategory === category) {
      this.selectedTicketCategory = 'all';
    } else {
      this.selectedTicketCategory = category;
      this.segment = 'overallRequested';
    }
    this.pageIndex = 0;
    this.defaultSelection();
  }

  // function to open ticket detail popup
  openTicketDetail(pid: string) {
    const metadata = this.participantMetadata[pid] ?? null;
    if (metadata) {
      const epTickets = [];
      const otherTickets = [];

      for (const [ticketId, t] of Object.entries(metadata?.customersupport ?? {}) as any) {
        const cat = t?.category ?? 'Unknown';
        const isEp = cat === 'Events & Process';
        const ticket = { ...t, category: cat, isEp, ticketid: ticketId };
        if (isEp) {
          epTickets.push(ticket);
        } else {
          otherTickets.push(ticket);
        }
      }

      epTickets.sort((a, b) => this.toMillis(b.reporteddate) - this.toMillis(a.reporteddate));
      otherTickets.sort((a, b) => this.toMillis(b.reporteddate) - this.toMillis(a.reporteddate));

      const selectedParticipantsTicket = {
        profileid: pid,
        name: metadata?.name ?? '',
        customersupporttickets: metadata?.customersupporttickets ?? 0,
        customersupport: metadata?.customersupport ?? {},
        selectedCategory: this.selectedTicketCategory,
        epTickets: epTickets,
        otherTickets: otherTickets,
      };
      this.selectedParticipantsTicket = selectedParticipantsTicket;
      this.dialog.open(this.ticketdetail);
    }
  }

  // function to close ticket detail popup
  closeTicketDetail() {
    this.selectedParticipantsTicket = null;
    this.dialog.closeAll();
  }

  // function to get tickets of the selected category
  getTickets() {
    if (this.selectedParticipantsTicket) {
      const selectedCategory = this.selectedParticipantsTicket?.selectedCategory;
      if (selectedCategory === 'ep') {
        return this.selectedParticipantsTicket?.epTickets;
      } else if (selectedCategory === 'others') {
        return this.selectedParticipantsTicket?.otherTickets;
      } else {
        return [...this.selectedParticipantsTicket?.epTickets, ...this.selectedParticipantsTicket?.otherTickets];
      }
    }
    return [];
  }

  // function to get reported date of a ticket
  reportedDate(t: Ticket): Date | null {
    const d = t.reporteddate;
    if (!d) return null;
    return typeof d.toDate === 'function' ? d.toDate() : new Date(d);
  }

  // function to handle ticket click
  onTicketClick(t: Ticket) {
    this.closeTicketDetail();
    this.router.navigateByUrl(`/customersupportdashboard/ticket/${t?.ticketid}/${t.ticketno}`);
  }

  // ================================== Table Columns =========================

  get tableColumns() {
    const columns = [];
    for (const [key, config] of Object.entries(this.columnRegistry)) {
      if ((config.defaultColumn || config?.checklist) && config.visible()) columns.push(key);
    }
    return [...columns, ...this.displayColumns, ...this.appliedCheckList];
  }

  get colSpan(): number {
    return this.tableColumns.length;
  }

  columnChange(columns : MatSelectChange){
    const currentColumns = [...columns.value];
    const columnsRemoved = this.cachedColumns.filter((c)=> !currentColumns.includes(c));
    for (const c of columnsRemoved) {
      if (this.filterMap[c]) delete this.filterMap[c];
    }
    this.displayColumns = currentColumns;
    this.cachedColumns = [...this.displayColumns];
  }

  // function to get optional columns ( with search )
  getColumn() {
    const search = this.columSearch?.trim()?.toLocaleLowerCase() ?? '';
    const columns = [];
    for (const [key, config] of Object.entries(this.columnRegistry)) {
      if (config.defaultColumn || config.type === 'none') continue;
      if (search.length > 0 && !config.label.toLocaleLowerCase().includes(search)) continue;
      columns.push({ key: key, label: config.label });
    }
    return columns;
  }

  // function to remove an optional column
  removeColumnChip(c: string) {
    if (this.filterMap[c]) delete this.filterMap[c];
    this.displayColumns = this.displayColumns.filter((column) => column !== c);
    this.cachedColumns = [...this.displayColumns];
  }

  // function to remove all optional columns
  clearAllColumns() {
    const columns = [...this.displayColumns];
    for (const c of columns) {
      if (this.filterMap[c]) delete this.filterMap[c];
    }
    this.displayColumns = [];
    this.cachedColumns = [];
  }

  // function to get the recent request of a participant
  getRecentRequestData(req: Array<any>) {
    if (!req || req.length === 0) return null;
    let result = req[0];
    for (let i = 1; i < req.length; i++) {
      const r = req[i];
      const oldRequestDate = this.toDate(result['doccreateddate']) ?? null;
      const currentReqDate = this.toDate(r['doccreateddate']) ?? null;
      if (currentReqDate && currentReqDate > oldRequestDate) {
        result = r;
      }
    }

    return result;
  }

  // function to get the value of a column for a participant
  getColumnValue(column: string, pid: string) {
    const config = this.columnRegistry[column];
    if (!config) throw new Error(`Unknown column "${column}"`);

    const meta = this.participantMetadata[pid] ?? {};
    const req = this.participantRequestMap[pid] ?? [];
    const eventParticipationDoc = this.getRecentRequestData(req);
    const requestedDate = this.toDate(eventParticipationDoc?.['doccreateddate']);
    let value = null;
    const productId = this.arena['productref']?.id;

    if (column === 'name') {
      value = meta.name;
    } else if (column === 'requestedDate') {
      value = requestedDate || null;
    } else if (column === 'current journey') {
      const status = (meta['customerstatus'] ?? '').toString().trim().toLowerCase();
      if (status === 'active') value = meta['activejourney'];
      else if (status === 'non active') value = meta['lastcompletedjourney'];
      else value = meta['lastsubscribedjourney'];
    } else if (column === 'subscriptionend') {
      value = this.toMillis(meta['subscriptionend']) || null;
    } else if (column === 'subscriptionstart') {
      value = this.toMillis(meta['subscriptionstart']) || null;
    } else if (column === 'paid') {
      value = meta['pp_totalpaid'];
    } else if (column === 'totalpurchasevalue') {
      value = meta['pp_totalpurchasevalue'];
    } else if (column === 'venuefee') {
      value = eventParticipationDoc?.['docid'] ? this.getVenueFeeStatus(eventParticipationDoc['docid']) : '';
    } else if (column === 'up! count') {
      value = this.getUpCount(pid);
    } else if (column === 'cpm! count') {
      value = this.getCpmCount(pid);
    } else if (this.columnRegistry[column].type === 'relation') {
      value = this.getProductCountMap(meta[column]);
    } else if (column === 'emi status') {
      value = meta['financedata']?.paymentstatus;
    } else if (column === 'email') {
      value = meta['email'] ?? '';
    } else if (column === 'phonenumber') {
      value = meta['phonenumber'] ?? '';
    } else if (column === 'scanned') {
      value = this.eticketLogMap?.[productId]?.[pid] ? 'scanned' : 'not scanned';
    } else if (column === 'tickets') {
      value = Object.keys(meta['customersupport'] ?? {}).length;
    } else if (config.checklist) {
      value = this.isClear(this.checkListMap[column], pid, eventParticipationDoc?.['checklist'] ?? []) ? 'clear' : 'not clear';
    } else if (column === 'status') {
      if (this.segment === 'eligible') {
        return 'ready to approve';
      } else if (this.segment === 'notRequested') {
        return 'not requested';
      }
    } else {
      value = meta[column]; // customerstatus, financialstatus, atccount, participantmode, paymentplan
    }

    return value ?? null;
  }

  // function to get up! product count of a participant
  getUpCount(pid: string) {
    const metadata = this.participantMetadata[pid];
    let count = 0;
    if (metadata) {
      const consumedProducts = metadata['consumedproducts'] ?? [];
      for (const productId of consumedProducts) {
        if (this.UP_LIVE_PRODUCT_IDS.includes(productId)) {
          count++;
        }
      }
    }
    return count;
  }

  // function to get cpm! product count of a participant
  getCpmCount(pid: string) {
    const metadata = this.participantMetadata[pid];
    let count = 0;
    if (metadata) {
      const consumedProducts = metadata['consumedproducts'] ?? [];
      for (const productId of consumedProducts) {
        if (this.CPM_PRODUCT_IDS.includes(productId)) {
          count++;
        }
      }
    }
    return count;
  }

  // function to get product id wise count
  getProductCountMap(productArray: Array<any>) {
    const productMap = {};
    if (!Array.isArray(productArray)) return productMap;
    for (const productId of productArray) {
      productMap[productId] = productMap[productId] ?? 0;
      productMap[productId]++;
    }
    return productMap;
  }

  // ================================== Table Filters =========================

  // function to open column filter popup
  openFilterCard(column: string, event: Event) {
    if (this.filterPopup?.column === column) {
      this.closeFilterPopup();
      return;
    }

    const config = this.columnRegistry[column];
    if (!config?.showFilter) return;

    const saved = this.filterMap[column] ?? null;
    let filterOption: any = {};
    let width = 300;

    if (config.type === 'enum') {
      const options = new Map();
      for (const row of this.segmentMembers()) {
        const value = this.getColumnValue(column, row);
        if (this.isEmpty(value)) continue;
        const label = column === 'current journey' ? (this.mapJourney[value] ?? String(value)) : String(value);
        const option = options.get(value) ?? {
          key: value,
          value: label,
          count: 0,
        };
        option.count++;
        options.set(value, option);
      }
      const availableOptions = [...options.values()];
      filterOption = {
        availableOptions: availableOptions,
        selectedOption: saved ? [...saved[0].value] : availableOptions.map((option) => option.key),
      };
    } else if (config.type === 'text') {
      filterOption = { text: saved?.[0]?.value ?? '' };
    } else if (config.type === 'number') {
      filterOption = saved ? { ...saved[0].value } : { min: null, max: null };
    } else if (config.type === 'date') {
      filterOption = saved ? { ...saved[0].value } : { start: null, end: null };
    } else if (config.type === 'relation') {
      filterOption = saved
        ? saved.map((c) => ({
            productid: c.where.productid,
            operator: c.compare.op,
            count: c.compare.value,
          }))
        : [{ productid: null, operator: null, count: null }];
      width = 500;
    }

    this.filterOrigin = event.currentTarget as HTMLElement;
    this.filterPopup = {
      search: '',
      column,
      width: width,
      filterOption: filterOption,
    };
  }

  // function to close column filter popup
  closeFilterPopup() {
    this.filterPopup = null;
    this.filterOrigin = null;
  }

  // function to build filter conditions from the popup
  buildConditions(column: string, filterOption: any) {
    const type = this.columnRegistry[column].type;
    let conditions: Condition[] = [];

    if (type === 'enum') {
      const selected = filterOption?.selectedOption ?? [];
      const total = filterOption?.availableOptions?.length ?? 0;
      if (selected.length === total) return { conditions: [], error: null };
      if (selected.length === 0) return { conditions: [], error: 'Select at least one option' };
      conditions = [{ field: column, op: 'in', value: [...selected] }];
    } else if (type === 'text') {
      const text = (filterOption?.text ?? '').trim();
      if (!text) return { conditions: [], error: null };
      conditions = [{ field: column, op: 'contains', value: text }];
    } else if (type === 'number') {
      if (this.isEmpty(filterOption?.min) && this.isEmpty(filterOption?.max)) return { conditions: [], error: null };
      conditions = [
        {
          field: column,
          op: 'between',
          value: { min: filterOption.min, max: filterOption.max },
        },
      ];
    } else if (type === 'date') {
      if (this.isEmpty(filterOption?.start) && this.isEmpty(filterOption?.end)) return { conditions: [], error: null };
      conditions = [
        {
          field: column,
          op: 'between',
          value: { start: filterOption.start, end: filterOption.end },
        },
      ];
    } else if (type === 'relation') {
      const touched = (filterOption as Array<any>).filter((p) => p?.productid || p?.operator || !this.isEmpty(p?.count));
      conditions = touched.map((p) => ({
        field: column,
        op: 'count',
        where: { productid: p.productid },
        compare: {
          op: p.operator,
          value: this.isEmpty(p.count) ? null : Number(p.count),
        },
      })) as Condition[];
    }

    const operators = this.operatorRegistry[type as OperatorType];
    const hasIncomplete = conditions.some((condition) => !operators[condition.op].isComplete(condition));
    if (hasIncomplete) return { conditions: [], error: 'Please fill all conditions' };

    return { conditions: conditions, error: null };
  }

  // function to save the column filter
  saveFilterPopup() {
    if (!this.filterPopup) return;

    const column = this.filterPopup.column;
    const { conditions, error } = this.buildConditions(column, this.filterPopup.filterOption);
    if (error) {
      alert(error);
      return;
    }

    if (conditions.length > 0) {
      this.filterMap[column] = conditions;
    } else {
      delete this.filterMap[column];
    }

    this.pageIndex = 0;
    this.closeFilterPopup();
  }

  // function to toggle an option in the filter popup
  filterPopupToggleOptions(key) {
    if (this.filterPopup?.filterOption?.selectedOption?.includes(key)) {
      this.filterPopup.filterOption.selectedOption = this.filterPopup?.filterOption?.selectedOption?.filter((k) => k !== key);
    } else {
      this.filterPopup?.filterOption?.selectedOption?.push(key);
    }
  }

  // function to get filter popup options ( with search )
  getFilterPopOptions() {
    if (this.filterPopup) {
      const search = this.filterPopup?.search?.trim()?.toLowerCase() ?? '';
      return this.filterPopup?.filterOption?.availableOptions?.filter((option) => {
        const value = option?.value?.toLowerCase()?.trim() ?? '';
        return search.length == 0 || value?.includes(search);
      });
    }
    return [];
  }

  // function to select all options in the filter popup
  filterPopSelectAll() {
    if (this.filterPopup && this.filterPopup.filterOption) {
      this.filterPopup.filterOption.selectedOption = (this.filterPopup?.filterOption?.availableOptions ?? [])?.map((option) => option?.key);
    }
  }

  // function to clear the filter popup
  filterPopClearAll() {
    const column = this.filterPopup?.column;
    if (column && this.filterPopup?.filterOption) {
      const type = this.columnRegistry[column].type;
      if (type === 'enum') {
        this.filterPopup.filterOption.selectedOption = [];
      } else if (type === 'text') {
        this.filterPopup.filterOption = { text: '' };
      } else if (type === 'date') {
        this.filterPopup.filterOption = { start: null, end: null };
      } else if (type === 'number') {
        this.filterPopup.filterOption = { min: null, max: null };
      } else if (type === 'relation') {
        this.filterPopup.filterOption = [{ productid: null, operator: null, count: null }];
      }
    }
  }

  // function to add a product rule in the filter popup
  addProductFilterPopup() {
    if (this.filterPopup) {
      this.filterPopup?.filterOption?.push({
        productid: null,
        operator: null,
        count: null,
      });
    }
  }

  // function to remove a product rule from the filter popup
  removeProductFromPopup(index: number) {
    if (this.filterPopup) {
      (this.filterPopup?.filterOption as Array<any>).splice(index, 1);
    }
  }

  // function to evaluate a condition for a participant
  evalCondition(condition: Condition, pid: string) {
    const column = this.columnRegistry[condition.field];
    if (!column) throw new Error(`Unknown field "${condition.field}"`);
    const operator = this.operatorRegistry[column.type as OperatorType]?.[condition.op];
    if (!operator) throw new Error(`Operator "${condition.op}" is not valid for ${column.type}`);
    return operator.test(this.getColumnValue(condition.field, pid), condition);
  }

  // function to check a participant passes all column filters
  filterRows(pid: string) {
    const filters = Object.values(this.filterMap);
    if (filters.length === 0) return true;

    for (const conditions of filters) {
      for (const condition of conditions) {
        if (!this.evalCondition(condition, pid)) return false;
      }
    }
    return true;
  }

  // function to describe the conditions of a column filter
  describeConditions(column: string, conditions: Condition[]) {
    const type = this.columnRegistry[column].type;
    const format = (d: any) => this.datePipe.transform(d, 'dd/MM/yyyy') ?? '';

    if (type === 'enum') {
      return (conditions[0].value as Array<any>).map((v) => (column === 'current journey' ? (this.mapJourney[v] ?? v) : v)).join(' , ');
    } else if (type === 'text') {
      return `contains "${conditions[0].value}"`;
    } else if (type === 'number') {
      const { min, max } = conditions[0].value;
      if (!this.isEmpty(min) && !this.isEmpty(max)) return `${min} - ${max}`;
      if (!this.isEmpty(min)) return `>= ${min}`;
      return `<= ${max}`;
    } else if (type === 'date') {
      const { start, end } = conditions[0].value;
      if (start && end) return `${format(start)} - ${format(end)}`;
      if (start) return `from ${format(start)}`;
      return `until ${format(end)}`;
    } else if (type === 'relation') {
      return conditions.map((c) => `${this.mapProduct[c.where.productid] ?? c.where.productid} ${this.reverseCompareMap[c.compare.op]} ${c.compare.value}`).join(' ; ');
    }
    return '';
  }

  // function to show filter chips above table
  getFilterChips(): FilterChip[] {
    const chips: FilterChip[] = [];
    const search = this.searchText?.trim().toLocaleLowerCase();
    if (search.length > 0) {
      chips.push({
        label: 'Search',
        value: search,
        type: 'search',
      });
    }

    for (const [column, conditions] of Object.entries(this.filterMap)) {
      chips.push({
        key: column,
        label: this.columnRegistry[column]?.label ?? column,
        value: this.describeConditions(column, conditions),
        type: 'column',
      });
    }

    return chips;
  }

  // function to remove filter via chips
  removeFilterChip(chip: FilterChip) {
    if (chip.type == 'search') {
      this.searchText = '';
    } else if (chip.type === 'column') {
      delete this.filterMap[chip.key];
    }
    this.pageIndex = 0;
  }

  // function to clear all table filters
  clearAllFilters() {
    this.searchText = '';
    this.filterMap = {};
    this.pageIndex = 0;
  }

  // ================================== Table Sorting =========================

  // function to toggle column sort
  toggleSort(column: string, type: 'asc' | 'desc') {
    if (this.sortColumn && this.sortColumn.column === column && this.sortColumn.type == type) {
      this.sortColumn = null;
    } else {
      this.sortColumn = { column, type: type };
    }
  }

  isColumnSort() {}

  // function to compare two participants for the sorted column
  sortRow(a: string, b: string): number {
    if (!this.sortColumn) return 0;

    const column = this.sortColumn.column;
    const config = this.columnRegistry[column];
    if (!config || ['none', 'relation'].includes(config.type)) return 0;

    const direction = this.sortColumn.type === 'desc' ? -1 : 1;

    let valA = this.getColumnValue(column, a);
    let valB = this.getColumnValue(column, b);

    if (column === 'current journey') {
      valA = this.mapJourney[valA] ?? valA;
      valB = this.mapJourney[valB] ?? valB;
    }

    const emptyA = this.isEmpty(valA);
    const emptyB = this.isEmpty(valB);
    if (emptyA && emptyB) return 0;
    if (emptyA) return 1;
    if (emptyB) return -1;

    let result = 0;

    if (['text', 'enum'].includes(config.type)) {
      result = String(valA).localeCompare(String(valB), undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    } else if (config.type === 'date') {
      result = this.toMillis(valA) - this.toMillis(valB);
    } else if (config.type === 'number') {
      const numA = Number(valA);
      const numB = Number(valB);
      if (isNaN(numA) && isNaN(numB)) return 0;
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      result = numA - numB;
    }

    return result * direction;
  }

  // ================================== Checklist =========================

  // function to check a participant clears a checklist
  isClear(checklist, pid: string, participantChecklist: Array<string>) {
    if (checklist?.type === 'automated') {
      const groups = checklist?.checklist ?? [];
      return groups.some((group) =>
        group.conditions.every((condition) => {
          return this.evalCondition(condition, pid);
        }),
      );
    } else {
      return participantChecklist?.includes(checklist?.docid);
    }
  }

  // function to toggle a checklist column
  toggleChecklist(checkListId) {
    const storage = JSON.parse(localStorage.getItem(this.EVENT_CHECKLIST) ?? '{}');
    const eventId = this.eventId?.docid;
    let checklistStorage = storage[this.eventId?.docid] ?? [];

    if (Object.hasOwn(this.columnRegistry, checkListId)) {
      delete this.columnRegistry[checkListId];
      checklistStorage = checklistStorage?.filter((id) => checkListId !== id);
      if (this.filterMap[checkListId]) delete this.filterMap[checkListId];
    } else {
      this.columnRegistry[checkListId] = {
        label: this.checkListMap[checkListId]?.title,
        type: 'enum',
        defaultHtml: '—',
        defaultColumn: false,
        visible: () => !['potential', 'notRequested'].includes(this.segment),
        showFilter: true,
        checklist: true,
      };
      checklistStorage?.push(checkListId);
    }

    localStorage.setItem(this.EVENT_CHECKLIST, JSON.stringify({ [eventId]: checklistStorage }));
  }

  // function to count participants who cleared a checklist
  getClearCountForCheckList(checklist) {
    const conditions = checklist?.checklist;
    let count = 0;
    const plist = new Set([...Object.keys(this.participantRequestMap)]);
    for (const pid of [...plist]) {
      const reqData = this.getRecentRequestData(this.participantRequestMap[pid]);
      if (this.isClear(checklist, pid, reqData?.['checklist'] ?? [])) count++;
    }
    return count;
  }

  // function to count participants who did not clear a checklist
  getNonClearCountForCheckList(checklist) {
    const conditions = checklist?.checklist;
    let count = 0;
    const plist = new Set([...Object.keys(this.participantRequestMap)]);
    for (const pid of [...plist]) {
      const reqData = this.getRecentRequestData(this.participantRequestMap[pid]);
      if (!this.isClear(checklist, pid, reqData?.['checklist'] ?? [])) count++;
    }
    return count;
  }

  // function to open add checklist popup
  addCheckList() {
    const checklistform = this.form.group({
      title: ['', [Validators.required]],
      checklist: this.form.array([]),
      type: 'add',
      eventref: doc(this.firestore, `event collection/${this.eventId?.docid}`),
      delete: false,
      docid: doc(collection(this.firestore, 'event checklist')).id,
    });
    this.checkListForm = checklistform;
    this.dialog.open(this.checklistpopup);
    // this.addChecklistConditionGroup();
  }

  // function to open edit checklist popup
  editCheckList(checkListId: string) {
    const checkList = this.checkListMap[checkListId];
    if (!checkList) return;
    const checklistform = this.form.group({
      title: [checkList?.title, [Validators.required]],
      checklist: this.form.array(this.buildCheckListForEdit(checkList?.checklist ?? [])),
      type: 'edit',
      delete: checkList?.delete ?? false,
      eventref: checkList?.eventref,
      docid: checkListId,
    });
    this.checkListForm = checklistform;
    this.dialog.open(this.checklistpopup);
  }

  // function to build checklist form groups for edit
  buildCheckListForEdit(checkList: Array<any>) {
    const list = [];

    for (const group of checkList ?? []) {
      const conditions: FormGroup[] = [];
      const relations = new Map<string, FormArray>(); // one card per relation column

      for (const check of group?.conditions ?? []) {
        if (!check?.field) continue;
        const type = this.columnRegistry[check.field]?.type;

        if (type === 'relation') {
          if (!relations.has(check.field)) relations.set(check.field, this.form.array([]));

          relations.get(check.field)!.push(
            this.form.group({
              productid: [check?.where?.productid, [Validators.required]], // was: productid
              operator: [check?.compare?.op, [Validators.required]],
              count: [check?.compare?.value, [Validators.required]],
            }),
          );
          continue;
        }

        let value: AbstractControl;

        switch (type) {
          case 'date':
            value = this.form.group({
              start: [check?.value?.start ? this.toDate(check.value.start) : null, [Validators.required]],
              end: [check?.value?.end ? this.toDate(check.value.end) : null, [Validators.required]],
            });
            break;

          case 'number':
            value = this.form.group({
              min: [check?.value?.min ?? null, [Validators.required]],
              max: [check?.value?.max ?? null, [Validators.required]],
            });
            break;

          case 'enum':
            value = this.form.control<string[]>(check?.value ?? [], [Validators.required]);
            break;

          default:
            value = this.form.control(check?.value ?? '', [Validators.required]);
        }

        conditions.push(
          this.form.group({
            field: [check.field, [Validators.required]],
            op: [check.op, [Validators.required]],
            value,
            search: '',
            type,
          }),
        );
      }

      relations.forEach((rules, column) => {
        conditions.push(
          this.form.group({
            field: [column, [Validators.required]],
            op: ['count', [Validators.required]],
            value: rules,
            search: '',
            type: 'relation',
          }),
        );
      });

      list.push(
        this.form.group({
          conditions: this.form.array(conditions),
        }),
      );
    }

    return list;
  }

  // function to add a condition group in the checklist form
  addChecklistConditionGroup() {
    const group = this.checkListForm.get('checklist') as FormArray;
    group.push(
      this.form.group({
        conditions: this.form.array([]),
      }),
    );
    this.addCheckListCondition(group.length - 1);
  }

  get checklistForm() {
    return this.checkListForm.get('checklist') as FormArray;
  }

  // function to add a condition in a checklist group
  addCheckListCondition(groupIndex: number) {
    const conditiongroup = this.checklistForm.at(groupIndex) as FormGroup;
    (conditiongroup.get('conditions') as FormArray).push(this.getCondition());
  }

  // function to get an empty condition form group
  getCondition() {
    return this.form.group({
      field: [null, [Validators.required]],
      op: [null, [Validators.required]],
      value: [null, [Validators.required]],
      search: [null],
      type: '',
    });
  }

  // function to remove a checklist group
  removeChecklistGroup(groupIndex) {
    this.checklistForm.removeAt(groupIndex);
  }

  // function to remove a condition from a checklist group
  removeChecklistGroupCondition(groupIndex, ConditionIndex) {
    const group = this.checklistForm.at(groupIndex) as FormGroup;
    const cond = group?.get('conditions') as FormArray;
    cond.removeAt(ConditionIndex);
  }

  // function to close checklist popup
  closeChecklistPopup() {
    this.dialog.closeAll();
    // this.checkListForm = null;
  }

  // function to get attribute options for checklist ( with search )
  getOptionsForChecklist(search: string) {
    const skip = ['participantmode', 'emi status', 'email', 'phonenumber', 'paymentplan'];
    const trimedSearch = search?.trim().toLocaleLowerCase();
    const columns = [];
    for (const [key, config] of Object.entries(this.columnRegistry)) {
      if (config.type === 'none' || !config.showFilter || skip.includes(key)) continue;
      if (trimedSearch.length > 0 && !config.label.toLocaleLowerCase().includes(search)) continue;
      columns.push({ key: key, label: config.label, type: config.type });
    }
    return columns;
  }

  // function to handle attribute change of a checklist condition
  onChangeChecklistAttribute(groupIndex: number, conditionIndex: number) {
    const conditions = (this.checklistForm.at(groupIndex) as FormGroup).get('conditions') as FormArray;
    const field = conditions.at(conditionIndex).get('field')?.value;

    conditions.setControl(conditionIndex, this.buildCondition(field));
  }

  // function to build a condition form group for a field
  private buildCondition(field: string): FormGroup {
    const type = this.columnRegistry[field]?.type;

    let value: AbstractControl;
    let op: string;

    switch (type) {
      case 'enum':
        value = this.form.control<string[]>([], [Validators.required]);
        op = 'in';
        break;
      case 'date':
        value = this.form.group({
          start: [null, [Validators.required]],
          end: [null, [Validators.required]],
        });
        op = 'between';
        break;
      case 'number':
        value = this.form.group({
          min: [null, [Validators.required]],
          max: [null, [Validators.required]],
        });
        op = 'between';
        break;
      case 'relation':
        value = this.form.array([
          this.form.group({
            productid: [null, [Validators.required]],
            operator: [null, [Validators.required]],
            count: [null, [Validators.required]],
          }),
        ]);
        op = 'count';
        break;
      default:
        value = this.form.control('', [Validators.required]);
        op = 'contains';
    }

    return this.form.group({
      field: [field, [Validators.required]],
      op: [op, [Validators.required]],
      value,
      search: '',
      type,
    });
  }

  // function to get the conditions of a checklist group
  getGroupCond(groupIndex) {
    return (this.checklistForm.at(groupIndex).get('conditions') as FormArray).controls;
  }

  // function to get available options of a column for checklist
  getAvailableOptionsForColumn(column) {
    if (column === 'current journey') {
      return Object.keys(this.mapJourney).map((jid) => ({
        key: jid,
        value: this.mapJourney[jid],
      }));
    } else if (column === 'customerstatus') {
      return ['active', 'non active', 'discontinued', 'banned'].map((val) => ({
        key: val,
        value: val,
      }));
    } else if (column === 'financialstatus') {
      return ['regular', 'locked', 'defaulted', 'discontinued', 'banned'].map((val) => ({ key: val, value: val }));
    } else if (column === 'venuefee') {
      return ['Paid', 'Not paid', 'Exempted'].map((val) => ({
        key: val,
        value: val,
      }));
    } else if (column === 'scanned') {
      return ['scanned', 'not scanned'].map((val) => ({
        key: val,
        value: val,
      }));
    }
    return [];
  }

  // function to add a product rule in a checklist condition
  addProductRuleForCheckList(condition: FormGroup) {
    const productArray = condition?.get('value') as FormArray;
    productArray.push(
      this.form.group({
        productid: [null, [Validators.required]],
        operator: [null, [Validators.required]],
        count: [null, [Validators.required]],
      }),
    );
  }

  // function to remove a product rule from a checklist condition
  removeProductRuleForCheckList(condition, index) {
    const productArray = condition?.get('value') as FormArray;
    productArray.removeAt(index);
  }

  // function to validate the checklist form
  validateCheckList(): boolean {
    const value = this.checkListForm.value;

    if (!value?.title?.trim()) return false;
    // if (!value?.checklist?.length) return false;

    for (const group of value.checklist) {
      if (!group?.conditions?.length) return false;

      for (const cond of group.conditions) {
        if (!cond?.field) return false;

        const v = cond.value;
        const type = this.columnRegistry[cond.field]?.type;
        switch (type) {
          case 'enum':
            if (!v?.length) return false;
            break;

          case 'date':
            if (!v?.start || !v?.end) return false;
            break;

          case 'number':
            if (this.isBlank(v?.min) || this.isBlank(v?.max)) return false;
            break;

          case 'relation':
            if (!v?.length) return false;
            if (v.some((r: any) => this.isBlank(r.productid) || this.isBlank(r.operator) || this.isBlank(r.count))) return false;
            break;

          default:
            if (this.isBlank(v)) return false;
        }
      }
    }

    return true;
  }

  // function to check a value is blank
  private isBlank(x: any): boolean {
    return x === null || x === undefined || (typeof x === 'string' && !x.trim());
  }

  // function to save the checklist
  async saveChecklist() {
    if (!this.validateCheckList()) {
      alert('Fill all the fields');
      return;
    }
    const value = this.checkListForm.value;

    if (value?.type === 'add') {
      for (const checklist of Object.values(this.checkListMap) as any) {
        const title = checklist?.title ?? '';
        if (title?.trim() === value?.title?.trim()) {
          alert('checklist name already exist');
          return;
        }
      }
    }

    const checkList = [];

    for (const group of value?.checklist) {
      const condition = [];
      for (const check of group?.conditions) {
        const type = this.columnRegistry[check?.field]?.type;
        if (type === 'relation') {
          for (const product of check?.value) {
            condition.push({
              field: check?.field,
              op: check?.op,
              where: { productid: product?.productid },
              compare: { op: product?.operator, value: product?.count },
            });
          }
        } else {
          condition.push({
            field: check?.field,
            op: check?.op,
            value: check?.value,
          });
        }
      }

      checkList.push({
        conditions: condition,
      });
    }

    let lastupated = null;
    if (value?.type === 'add') {
      lastupated = [
        {
          updatedby: this.loggedInProfile['profile_ref']?.id,
          date: Timestamp.fromDate(new Date()),
        },
      ];
    } else {
      lastupated = arrayUnion({
        updatedby: this.loggedInProfile['profile_ref']?.id,
        date: Timestamp.fromDate(new Date()),
      });
    }
    const docRef = doc(this.firestore, 'event checklist', value?.docid);

    const document = {
      docid: docRef.id,
      title: value?.title,
      updated: lastupated,
      type: checkList.length > 0 ? 'automated' : 'manual',
      eventref: value?.eventref ?? null,
      delete: value?.delete ?? false,
      checklist: checkList,
    };

    if (value?.type === 'add') {
      document['created'] = serverTimestamp();
    }

    try {
      await setDoc(docRef , document , {merge : true});
      await this.loadEventCheckList();
      this.closeChecklistPopup();
    } catch (error) {
      console.log(error)
    }
  }

  // function to delete a checklist ( soft delete )
  async deleteCheckList(checkListId: string) {
    const checkList = this.checkListMap[checkListId] ?? null;
    if (checkList) {
      const docref = doc(this.firestore, `event checklist/${checkListId}`);
      try {
        await setDoc(
          docref,
          {
            delete: true,
          },
          { merge: true },
        );
        this.loadEventCheckList();
      } catch (err) {
        console.log(err);
      }
    }
  }

  // function to handle manual checklist change of a row
  async onManualChecklistChange(pid: string, checklistId: string, checked: boolean) {
    const reqDoc = this.getRecentRequestData(this.participantRequestMap[pid] ?? []);
    if(!reqDoc) return
    const checklist = reqDoc['checklist'] ?? [];
    const isChecked = checklist?.includes(checklistId);
    const docid = reqDoc['docid'];
    if (docid) {
      const docref = doc(this.firestore, 'event participation request', docid);
      await setDoc(
        docref,
        {
          checklist: isChecked ? arrayRemove(checklistId) : arrayUnion(checklistId),
        },
        { merge: true },
      );
    }
  }

  // function to handle checklist filter click
  onChecklistFilterClick(checkId: string, type: string) {
    if (this.selectedChecklist) {
      if (this.selectedChecklist?.checklistId === checkId && this.selectedChecklist?.type === type) {
        this.selectedChecklist = null;
        if (this.columnRegistry[checkId]) {
          delete this.columnRegistry[checkId];
        }
        return;
      }
    }
    this.selectedChecklist = {
      checklistId: checkId,
      type,
    };
    if (!this.columnRegistry[checkId]) {
      this.toggleChecklist(checkId);
    }
  }

  // function to filter participants by the selected checklist
  filterByCheckList(pid: string) {
    if (!this.selectedChecklist) return true;
    const ispassed = this.getColumnValue(this.selectedChecklist?.checklistId, pid);

    return ispassed === this.selectedChecklist?.type;
  }

  // function to get manual checklist ids
  getManualChecklist() {
    return Object.keys(this.checkListMap).filter((id) => this.checkListMap[id]?.type === 'manual');
  }

  // function to bulk update a manual checklist for selected participants
  async bulkManualUpdate(checklistId: string, type: 'clear' | 'not clear') {
    if (!checklistId || !this.checkListMap[checklistId]) {
      return;
    }
    const selection = this.selection.selected;
    const documentsToUpdate = this.selection.selected.map((pid) => {
      const reqData = this.getRecentRequestData(this.participantRequestMap[pid]);
      return reqData['docid'];
    }).filter((data)=>data);
    const data = {
      checklist: type === 'clear' ? arrayUnion(checklistId) : arrayRemove(checklistId),
    };
    let batch = writeBatch(this.firestore);
    const BATCH_LIMIT = 500;
    let operations = 0;

    try {
      for (const docid of documentsToUpdate) {
        if (!docid) continue;
        const docRef = doc(this.firestore, 'event participation request', docid);
        batch.set(docRef, data, { merge: true });

        operations++;

        if (operations === BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(this.firestore);
          operations = 0;
        }
      }

      if (operations > 0) {
        await batch.commit();
      }

      this.pageIndex = 0;
      this.defaultSelection();
    } catch (error) {
      console.log(error);
    }
  }

  // ================================== Event Editor =========================

  // function to open event editor dialog
  openEventEditor(eventId?) {
    this.dialog
      .open(UpdateEventDetailComponent, {
        disableClose: true,
        data: {
          edit: [null, undefined, ''].includes(eventId) ? false : true,
          eventDocId: [null, undefined, ''].includes(eventId) ? doc(collection(this.firestore, 'event collection')).id : eventId,
        },
        panelClass: 'custom-dialog-container',
        maxHeight: '98vh',
        maxWidth: '98vw',
      })
      .afterClosed()
      .toPromise()
      .then(() => {
        // this.fetchSubEvent();
        this.router.navigateByUrl('/event-participation-confirmation')
      });
  }

  // ================================== UI Helpers =========================

  get productName() {
    return this.mapProduct[this.arena?.['productref']?.id] ?? 'Product';
  }

  // function to get initials of a name
  initials(name: string): string {
    return (
      (name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase() || '?'
    );
  }

  // function to format month and year
  formatMonthYear(ms: number): string {
    return ms
      ? new Date(ms).toLocaleDateString(undefined, {
          month: 'short',
          year: 'numeric',
        })
      : '';
  }

  // Compact money for the table (Indian scale): 5000 -> 5K, 122000 -> 1.2L, 25000000 -> 2.5Cr.
  shortAmount(v: any): string {
    const n = +(v || 0);
    if (!n) return '0';
    const abs = Math.abs(n);
    const fmt = (x: number, unit: number) => (x / unit).toFixed(abs % unit === 0 ? 0 : 1).replace(/\.0$/, '');
    if (abs >= 1e7) return fmt(n, 1e7) + 'Cr';
    if (abs >= 1e5) return fmt(n, 1e5) + 'L';
    if (abs >= 1e3) return fmt(n, 1e3) + 'K';
    return String(n);
  }

  // function to get finance dot class
  financeDotClass(f: string): string {
    const n = (f || '').toLowerCase().replace('fullypaid', 'fully paid').replace(/\s+/g, ' ').trim();
    if (n === 'regular' || n === 'fully paid') return 'd-ok';
    if (n === 'defaulted') return 'd-bad';
    if (n === 'locked') return 'd-org';
    return '';
  }

  // function to convert timestamp to millis
  toMillis(d: any): number {
    try {
      if (d?.toMillis) return d.toMillis();
      if (d?.toDate) return d.toDate().getTime();
      if (d) return new Date(d).getTime();
    } catch {}
    return 0;
  }         

  toggleJourneyCard() {
    this.showJourneyCard = !this.showJourneyCard;
  }

  // function to convert timestamp to JS Date
  toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  // function to convert string to number
  toNumber(value: string): number | null {
    const n = parseFloat(value);
    return isNaN(n) ? null : n;
  }

  // track by functions
  trackJourneyKey = (_: number, j: JourneyRow) => j.key;
  trackBreakdown = (_: number, b: { journey: string }) => b.journey;
  trackParticipant = (_: number, pid: string) => pid;
  trackByCommunication = (_: number, m: any) => m.docid;
  readonly trackByIndex = (i: number) => i;
  trackByTicketNo = (_: number, t: Ticket) => t.ticketno;
  trackByColumnKey = (_: number, column: any) => column.key;
  trackChip = (_: number, chip: FilterChip) => chip.key ?? chip.label;
  trackByChecklistId = (_: number, checklist: any) => checklist?.title;
}