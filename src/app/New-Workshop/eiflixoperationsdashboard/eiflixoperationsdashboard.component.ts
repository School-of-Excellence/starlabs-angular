import { Component, OnDestroy, OnInit, HostListener, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { getApp, getApps, initializeApp } from '@angular/fire/app';
import { getFirestore } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import {
  Firestore, collection, collectionData, getDoc, getDocs, query, where, orderBy, documentId, Timestamp,
  doc, setDoc, serverTimestamp
} from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, takeUntil } from 'rxjs';
import * as XLSX from 'xlsx';
import { EodDialogService } from './eod-dialog/eod-dialog.service';

/** One bucket of the EiFlix Report: unique PEOPLE, split by cohort. */
interface CohortCount { existing: number; new: number; total: number; }

/** The EiFlix Report's four buckets. Mobile and web are counted independently — see buildReportCounts. */
interface ReportCounts {
  android: CohortCount;
  ios: CohortCount;
  mobileTotal: CohortCount;
  web: CohortCount;
}

/**
 * Watch time for one surface. Seconds; formatted for display by formatConsumption.
 *
 * Two independent cuts of the SAME total: by cohort (existing/new) and by where the content lives
 * (workshop/library). The second pair is not a subdivision of the first, and neither pair is
 * required to add up to `totalSeconds` — a `from` value that is neither workshop nor library still
 * counts towards the total.
 */
interface ConsumptionCounts {
  existingSeconds: number;
  newSeconds: number;
  totalSeconds: number;
  workshopSeconds: number;
  librarySeconds: number;
}

/** One `loginlog` document as the EiFlix App Logs table shows it. */
interface LogRow {
  id: string; profileid: string; name: string;
  date: Date | null; dateLabel: string;
  device_os: string; current_version: string;
  /** Resolved once at load, beside `name`, so filtering never re-walks the directories. */
  isNewUser: boolean;
}

type Accent = 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose' | 'orange' | 'red';
type RangeKey = 'today' | '7d' | '30d' | 'custom';

/**
 * Journey Support's TOTAL AMOUNT, copied EXACTLY from
 * journeyplan.component.ts watsonParticipantSchedule() — same filter, same
 * arithmetic, same order. TOTAL AMOUNT there is the last running total.
 * Returns null when no rows remain (Journey Support then shows no total).
 */
/**
 * Rupees in words, Indian system (crore / lakh / thousand / hundred), rounded to
 * the rupee: 10486474 -> "One crore four lakh eighty-six thousand four hundred seventy-four".
 */
export function indianNumberWords(value: number): string {
  const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (n: number) => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  const three = (n: number) => [n >= 100 ? ONES[Math.floor(n / 100)] + ' hundred' : '', n % 100 ? two(n % 100) : '']
    .filter(Boolean).join(' ');
  const words = (n: number): string => {
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    return [crore ? words(crore) + ' crore' : '', lakh ? two(lakh) + ' lakh' : '',
      thousand ? two(thousand) + ' thousand' : '', n ? three(n) : ''].filter(Boolean).join(' ');
  };
  const n = Math.round(Math.abs(Number(value) || 0));
  const out = n ? words(n) : 'zero';
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// Purchases rows now live in the shared, read-only Watson helpers (also used by the workshop dashboard).
export { watsonPurchaseRows } from '../watson-purchases';
import { watsonPurchaseRows, formatRupees } from '../watson-purchases';

export function journeySupportTotal(scheduleDocs: any[]): number | null {
  const watsonScheduleList = scheduleDocs.filter((e) => e['schedulemodified'] != true);
  let runningTotal = 0;
  const cumulativeTotals: number[] = [];
  watsonScheduleList.forEach(schedule => {
    runningTotal += (schedule.amount / 1.18); // Calculate the amount before GST
    cumulativeTotals.push(runningTotal);
  });
  return cumulativeTotals.length ? cumulativeTotals[cumulativeTotals.length - 1] : null;
}

/**
 * Journey Support's participant match, copied EXACTLY: walk the Participants
 * returned for the profile's email and take the first whose name OR email
 * matches (lower-cased, whitespace removed). Returns its `id` field, or null
 * ("unable to find Client in Watson").
 */
export function journeySupportParticipantId(participantDocs: any[], profileData: any): any {
  let participantid = null;
  for (let i = 0; i < participantDocs.length; i++) {
    const participantdata = participantDocs[i];
    if (participantdata["name"]?.toLowerCase().replace(/\s/g, "") == profileData["name"]?.toLowerCase().replace(/\s/g, "") || participantdata["email"]?.toLowerCase().replace(/\s/g, "") == profileData["email"]?.toLowerCase().replace(/\s/g, "")) {
      participantid = participantdata["id"];
      break;
    }
  }
  return participantid;
}

/** Firestore's cross-type order (null < boolean < number < timestamp < string < other), enough for `date`. */
function firestoreRank(v: any): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 2;
  if (v && typeof v.toMillis === 'function') return 3;
  if (typeof v === 'string') return 4;
  return 5;
}
function firestoreCompare(a: any, b: any): number {
  const ra = firestoreRank(a), rb = firestoreRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 3) return a.toMillis() - b.toMillis();
  if (ra === 1 || ra === 2) return Number(a) - Number(b);
  if (ra === 4) return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}
const byDocId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * What `where(field, '==', v)` returns for each v, rebuilt from one batched `in` read: docs grouped
 * by the field's exact value, in document-id order (the default order of an equality query).
 */
export function groupLikeEquality(docs: { id: string; data: any }[], field: string): Map<any, { id: string; data: any }[]> {
  const out = new Map<any, { id: string; data: any }[]>();
  [...docs].sort(byDocId).forEach(d => {
    const k = d.data?.[field];
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(d);
  });
  return out;
}

/** Journey Support's `orderBy('date', 'asc')`: docs without `date` drop out, ties break on document id. */
export function journeySupportScheduleOrder(docs: { id: string; data: any }[]): any[] {
  return docs
    .filter(d => d.data && Object.prototype.hasOwnProperty.call(d.data, 'date'))
    .sort((a, b) => firestoreCompare(a.data.date, b.data.date) || byDocId(a, b))
    .map(d => d.data);
}

/** The Users section adds 'all' — see `usersRange` for why it is the default. */
type UsersRangeKey = 'all' | RangeKey;

/**
 * One stat card on the operations dashboard. The dashboard is config-driven:
 * add a new entry to `cards` (plus its bucket rule in splitUsers) and the
 * grid, counts and side panel all pick it up with zero template changes.
 */
interface OpsCard {
  key: string;
  title: string;
  caption: string;
  icon: string;
  accent: Accent;
  emptyText: string;
  /** Full Firestore docs for this bucket — the panel receives everything. */
  users: any[];
  /** Animated display value (counts up to users.length). */
  displayCount: number;
  /** Pending count-up frame, cancelled when a newer emission arrives. */
  rafId?: number;
  /** Optional per-bucket counts rendered as the chip stack. */
  breakdown?: { label: string; count: number }[];
  /** Optional emphasised figure under the count (Master Class Purchase: the ₹ total). */
  highlight?: string;
  /** Small caption inside the highlight, e.g. "total amount". */
  highlightLabel?: string;
  /** The highlighted figure in words (New Users to Paid). */
  highlightWords?: string;
}

/** The shared right-hand side panel. Every card type renders through this. */
interface PanelState {
  kind: 'users' | 'viewers' | 'hotleads' | 'nonactive' | 'platform';
  cardKey?: string;
  title: string;
  caption: string;
  icon: string;
  accent: Accent;
  count: number;
  loading: boolean;
  error: boolean;
  emptyText: string;
  rows: any[];
  /** ---- v2 toolbar state (search / cohort filter / sort) ---- */
  q: string;
  cohort: 'all' | 'nud' | 'pm';
  sortKey: 'default' | 'name' | 'hours' | 'amount';
  sortOptions: ('default' | 'name' | 'hours' | 'amount')[];
  sortOpen: boolean;
  showCohort: boolean;
  journeyFilter: string;
  journeyOptions: string[];
  viewRows: any[];
}

/** One ranked row in the Top Performing Content card. */
interface ContentRow {
  videoid: string;
  title: string;
  seconds: number;
  hours: number;
  /** Bar width relative to the range's top content (0–100). */
  pct: number;
}

@Component({
  selector: 'app-eiflixoperationsdashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, A11yModule, MatSelectModule, MatFormFieldModule, NgxMatSelectSearchModule],
  templateUrl: './eiflixoperationsdashboard.component.html',
  styleUrl: './eiflixoperationsdashboard.component.css',
  animations: [
    trigger('fade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('240ms ease', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease', style({ opacity: 0 }))
      ])
    ]),
    trigger('slide', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate('340ms cubic-bezier(0.22, 1, 0.36, 1)', style({ transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('240ms cubic-bezier(0.55, 0, 0.55, 0.2)', style({ transform: 'translateX(100%)' }))
      ])
    ])
  ]
})
export class EiflixoperationsdashboardComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private eodDialog = inject(EodDialogService);
  private destroy$ = new Subject<void>();

  @ViewChild('engSection') engSection?: ElementRef<HTMLElement>;

  readonly reducedMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  today = new Date();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  loading = true;
  loadError = false;

  get todayStr(): string {
    return formatDate(new Date(), 'yyyy-MM-dd', 'en-US');
  }

  /** B!G journey doc ids ('journey' collection) — participant metadata
   *  docs with activejourney in this list count as B!G Participants. */
  private readonly bigJourneyIdList = [
    'Qedrk9QWQvlizWLWXemR',
    'lv05Armcn9KpVzt3aWFa',
    'ESgJg1EUYarVj9GAd2md'
  ];
  private readonly bigJourneyIds = new Set(this.bigJourneyIdList);
  /** journey doc id -> its `journey` (name) field. */
  private journeyNames = new Map<string, string>();

  cards: OpsCard[] = [
    {
      key: 'total-new-users',
      title: 'Total New Users',
      caption: 'Signed up · not yet purchased journey',
      icon: 'person_add',
      accent: 'indigo',
      emptyText: 'No users here yet.',
      users: [],
      displayCount: 0
    },
    {
      key: 'new-users-to-paid',
      title: 'New Users to Paid',
      caption: 'Purchased Journey',
      icon: 'workspace_premium',
      accent: 'emerald',
      emptyText: 'No users here yet.',
      users: [],
      displayCount: 0
    },
    {
      key: 'masterclass-purchase',
      title: 'Master Class Purchase',
      caption: 'Captured payments',
      icon: 'school',
      accent: 'amber',
      emptyText: 'No captured purchases in this range.',
      users: [],
      displayCount: 0
    },
    {
      key: 'big-participants',
      title: 'Total B!G Participants',
      caption: 'Active in a B!G journey',
      icon: 'groups',
      accent: 'violet',
      emptyText: 'No participants here yet.',
      users: [],
      displayCount: 0
    }
  ];

  // ---- Users section date range (operator 2026-10-12) ----
  /**
   * 'all' is both the default and the cleared state, deliberately. These are
   * headline totals that have always meant "every signup" / "everyone who
   * moved across", so defaulting to a window would silently rewrite a number
   * the operator reads every day. Today / 7D / 30D and the manual From-To
   * narrow them on request.
   */
  usersRange: UsersRangeKey = 'all';
  usersCustomStart = '';
  usersCustomEnd = '';
  /** Human label for the active window ('' while unfiltered). */
  usersRangeLabel = '';
  /** Raw docs from the live listener, kept so a range change re-buckets in memory. */
  private nudDocs: any[] = [];

  // ---- Watson TOTAL AMOUNT for New Users to Paid (operator 2026-10-13) ----
  /** profileid -> total plan value excl. GST; null = not found in Watson / no schedule. */
  private planTotals = new Map<string, number | null>();
  private planPending = new Set<string>();
  /** profileid -> the products that person bought (Watson ParticipantPurchases), for the hover card. */
  private planPurchases = new Map<string, { date: Date | null; product: string; amount: number | null; dateLabel: string; amountLabel: string }[]>();
  /** profileid -> sum of those purchases' amounts (the card footer). */
  private planPurchaseTotals = new Map<string, number>();
  /** The paid-panel row whose purchases are showing in the hover card. */
  planTipRow: any = null;
  planTipStyle: Record<string, string> = {};
  private planTipTimer: any = null;
  /** 'unavailable' = this build has no Watson config (the emulator build, deliberately). */
  planStatus: 'idle' | 'loading' | 'ready' | 'unavailable' = 'idle';

  // ---- Master Class Purchase (operator 2026-10-13) ----
  /** Captured `workshoppaymentlog` rows, read once. */
  private mcPayments: any[] = [];
  /** workshopconfiguration doc id -> detailpage.title, read once. */
  private workshopTitles = new Map<string, string>();
  mcLoading = true;
  mcError = false;

  // ---- Directories, each loaded ONCE for the whole dashboard ----
  /** Entire 'participant metadata' collection keyed by doc id (PRIMARY). */
  private pmMap = new Map<string, any>();
  /** Entire 'new_user_data' collection keyed by doc id (fallback, tagged
   *  'New User'). Fed by the SAME realtime listener as the Users cards. */
  private nudMap = new Map<string, any>();
  /** Entire 'episodes' collection keyed by doc id (content titles). */
  private epMap = new Map<string, any>();
  private pmReady!: Promise<void>;
  private pmReadyResolve!: () => void;
  private nudReady!: Promise<void>;
  private nudReadyResolve!: () => void;
  private epReady!: Promise<void>;
  /** True when the participant directory failed to load — split undercounts. */
  pmFailed = false;
  /** True until the first participant metadata emission lands. */
  pmLoading = true;

  // ---- Engagement (shared range drives BOTH cards from ONE fetch) ----
  engRange: RangeKey = 'today';
  engCustomStart = '';
  engCustomEnd = '';
  engLoading = true;
  engError = false;
  engRangeLabel = '';
  engTotalSeconds = 0;
  engUniqueIds: string[] = [];
  engPmSeconds = 0;
  engNudSeconds = 0;
  engUnknownSeconds = 0;
  engPmViewers = 0;
  engNudViewers = 0;
  engUnknownViewers = 0;
  engPmViewerIds: string[] = [];
  engNudViewerIds: string[] = [];
  /** Per-profile stats for the CURRENT range (seconds + per-video seconds). */
  private engProfileStats = new Map<string, { seconds: number; videos: Map<string, number> }>();

  // ---- Cohort watch-time trend (inline SVG paths) ----
  engTrendBuckets: { label: string; nud: number; pm: number }[] = [];
  engTrendNudLine = ''; engTrendNudArea = '';
  engTrendPmLine = ''; engTrendPmArea = '';
  engTrendHover: { i: number; x: number; tipX: number; label: string; nud: number; pm: number } | null = null;

  // ---- Top Performing Content ----
  engContentAll: ContentRow[] = [];
  engContentPage = 0;
  readonly engContentPageSize = 10;
  /** Rejects stale responses when the operator switches ranges quickly. */
  private engFetchToken = 0;

  // ---- 🔥 Hot Leads (default: TODAY's data from the same fetch, frozen
  // against the engagement filter; threshold + range configurable) ----
  hotLoading = true;
  hotError = false;
  hotLeadIds: string[] = [];
  hotThresholdHours = 3;
  hotMode: 'today' | 'custom' = 'today';
  hotFrom = '';
  hotTo = '';
  hotRangeLabel = 'today';
  private hotStats = new Map<string, { seconds: number; videos: Map<string, number> }>();
  private hotFetchToken = 0;

  // ---- Non-Active Users (register in 'eiflixdailywatchers') ----
  naLoading = true;
  naError = false;
  naRegisterSince: string | null = null;
  naAsOf: Date | null = null;
  /** dayKey -> register page ({ profileids, platforms, builtAt }). */
  private naPages = new Map<string, any>();
  private naToken = 0;
  naBuckets = [
    {
      key: 'na-1m', title: 'Inactive 1 Month', caption: 'No watch in 30–60 days',
      icon: 'bedtime', accent: 'amber' as Accent, days: 30,
      total: 0, nudCount: 0, pmCount: 0, ids: [] as { id: string; lastSeen: string | null; isNud: boolean }[]
    },
    {
      key: 'na-2m', title: 'Inactive 2 Months', caption: 'No watch in 60–90 days',
      icon: 'notifications_paused', accent: 'orange' as Accent, days: 60,
      total: 0, nudCount: 0, pmCount: 0, ids: [] as { id: string; lastSeen: string | null; isNud: boolean }[]
    },
    {
      key: 'na-3m', title: 'Inactive 3+ Months', caption: 'No watch in 90+ days',
      icon: 'power_off', accent: 'red' as Accent, days: 90,
      total: 0, nudCount: 0, pmCount: 0, ids: [] as { id: string; lastSeen: string | null; isNud: boolean }[]
    }
  ];

  // ---- Device Breakdown ----
  dbRange: 1 | 2 | 3 | 'custom' = 1;
  /** Manual From–To for Device Breakdown, as 'yyyy-MM-dd' — the register's own key format. */
  dbFrom = '';
  dbTo = '';
  dbTotalSeconds = 0;
  dbRows: {
    key: string; label: string; seconds: number; hours: number;
    pct: number; pctExact: number; dashOffset: number; color: string;
  }[] = [];
  /** Fixed colors for the known platforms (color follows entity). */
  private readonly platformColors: Record<string, string> = {
    'Eiflixweb': '#4753e6',
    'EiflixMobile': '#a35d04',
    'breakthroughsapp': '#0c8a5f'
  };
  private readonly platformExtraColors = ['#6d28d9', '#c2233c', '#b8480a', '#9f1a1a'];

  activePanel: PanelState | null = null;

  // ==================== getters ====================

  get engHours(): number { return this.engTotalSeconds / 3600; }
  get engPmHours(): number { return this.engPmSeconds / 3600; }
  get engNudHours(): number { return this.engNudSeconds / 3600; }
  get engUnknownHours(): number { return this.engUnknownSeconds / 3600; }

  /** True while exactly one custom date is picked — shows the header hint. */
  get engCustomHint(): boolean {
    return !!this.engCustomStart !== !!this.engCustomEnd;
  }

  get engTrendAria(): string {
    return 'Watch time trend, ' + this.engRangeLabel + '. New users '
      + this.engNudHours.toFixed(1) + ' hours, participants '
      + this.engPmHours.toFixed(1) + ' hours.';
  }

  get engContentRows(): ContentRow[] {
    const s = this.engContentPage * this.engContentPageSize;
    return this.engContentAll.slice(s, s + this.engContentPageSize);
  }

  get engContentPageLabel(): string {
    const n = this.engContentAll.length;
    if (!n) return '';
    const s = this.engContentPage * this.engContentPageSize + 1;
    return s + '–' + Math.min(s + this.engContentPageSize - 1, n) + ' of ' + n;
  }

  get engContentHasPrev(): boolean { return this.engContentPage > 0; }
  get engContentHasNext(): boolean {
    return (this.engContentPage + 1) * this.engContentPageSize < this.engContentAll.length;
  }

  get hotTitle(): string {
    return this.hotMode === 'today' ? 'Hot Leads Today' : 'Hot Leads';
  }

  get hotSub(): string {
    return 'Watched over ' + this.hotThresholdHours + 'h of EiFlix · ' + this.hotRangeLabel;
  }

  get dbRangeLabel(): string {
    if (this.dbRange === 'custom') {
      const { from, to } = this.dbKeyBounds();
      return this.formatRange(this.parseDateInput(from), this.parseDateInput(to));
    }
    return this.dbRange === 1 ? 'last 1 month' : 'last ' + this.dbRange + ' months';
  }

  // ==================== lifecycle ====================

  ngOnInit(): void {
    this.loadLoginLogs();
    this.nudReady = new Promise<void>(res => (this.nudReadyResolve = res));

    // Single realtime listener over new_user_data: feeds the Users cards
    // AND the profile directory (nudMap) in one query.
    const ref = collection(this.firestore, 'new_user_data');
    collectionData(ref, { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.splitUsers(data);
          this.computeNudCounts();   // free: the documents are already here
          this.loading = false;
          this.loadError = false;
          if (!this.naLoading) this.computeNonActive();
          this.nudReadyResolve();
        },
        error: (err) => {
          console.error('eiflixoperationsdashboard: new_user_data load failed', err);
          this.loading = false;
          this.loadError = true;
          this.nudReadyResolve();
        }
      });

    // Realtime listener (still ONE query) so cohort attribution never goes
    // stale on a long-lived dashboard: conversions to paid reclassify live.
    this.pmReady = new Promise<void>(res => (this.pmReadyResolve = res));
    collectionData(collection(this.firestore, 'participant metadata'), { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.pmMap.clear();
          for (const d of data) {
            if (d.id) this.pmMap.set(d.id, d);
          }
          this.pmFailed = false;
          this.pmLoading = false;
          this.updateBigParticipantsCard();
          this.rebuildPaidCard();
          this.rebuildMasterclassCard();
          if (!this.naLoading) this.computeNonActive();
          this.pmReadyResolve();
        },
        error: (err) => {
          console.error('eiflixoperationsdashboard: participant metadata load failed', err);
          this.pmFailed = true;
          this.pmLoading = false;
          this.pmReadyResolve();
        }
      });

    this.epReady = this.loadDirectory('episodes', this.epMap);
    this.loadJourneyNames();
    this.loadMasterclass();
    this.loadNaRegister();
    this.fetchEngagement();
    this.refreshConsumption();
    this.refreshMasterclass();
  }

  // ==================== EiFlix App Logs (loginlog) ====================
  /** Range in days: 1 = today (since local midnight), 7, 30. */
  logRange: 1 | 7 | 30 = 1;
  /** How many days the rows currently in logAll actually cover — what the report reuses. */
  private logFetchedDays = 0;
  logLoading = false;
  logError = false;
  /** Every EiFlix row in the range, newest first — filters/sort/paging derive from this. */
  logAll: LogRow[] = [];
  logShown: LogRow[] = [];
  logPage: LogRow[] = [];
  logSearch = '';
  logNameFilter = 'all';
  logOsFilter = 'all';
  logUserTypeFilter: 'all' | 'new' | 'existing' = 'all';
  /** Distinct people in the loaded rows, labelled by name — the name filter's options. */
  logNameOptions: { profileid: string; name: string }[] = [];
  /** Typed into the name filter's search row; narrows the options, not the table. */
  logNameSearch = '';
  get logNameOptionsShown(): { profileid: string; name: string }[] {
    const q = this.logNameSearch.trim().toLowerCase();
    return q ? this.logNameOptions.filter(o => o.name.toLowerCase().includes(q)) : this.logNameOptions;
  }
  /** How many different people are behind the rows (all in range, and those currently shown). */
  get logUniquePeople(): number { return new Set(this.logAll.map(r => r.profileid).filter(Boolean)).size; }
  get logUniquePeopleShown(): number { return new Set(this.logShown.map(r => r.profileid).filter(Boolean)).size; }
  logOsOptions: string[] = [];
  logSortKey: 'name' | 'date' | 'device_os' | 'current_version' = 'date';
  logSortDir: 'asc' | 'desc' = 'desc';
  logPageIndex = 0;
  logPageSize = 25;
  readonly logPageSizes = [10, 25, 50];

  get logPageCount(): number { return Math.max(1, Math.ceil(this.logShown.length / this.logPageSize)); }
  get logRangeLabel(): string { return this.logRange === 1 ? 'today' : 'last ' + this.logRange + ' days'; }

  setLogRange(days: 1 | 7 | 30): void {
    if (this.logRange === days && this.logAll.length) return;
    this.logRange = days;
    this.loadLoginLogs();
  }

  /** Local midnight `days - 1` days ago: today = since 00:00 today; 7D = today plus the six days before. */
  private logRangeStart(days: number): Date {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1)); return d;
  }

  /**
   * One query on `loginlog`, bounded by `date` (a Timestamp) from the range start — a single-field
   * range, no composite index. The app filter is applied client-side afterwards, as requested, so a
   * document without the field is simply not an EiFlix row.
   */
  /**
   * One `loginlog` read for the last `days` days, mapped to LogRow.
   *
   * Shared by the table and the EiFlix Report so there is exactly one definition of "an EiFlix
   * login row" — the same server-side range query, the same app/web filter, the same OS
   * normalisation and the same cohort resolution.
   */
  private async fetchLoginRows(days: number): Promise<LogRow[]> {
    const snap = await getDocs(query(
      collection(this.firestore, 'loginlog'),
      where('date', '>=', Timestamp.fromDate(this.logRangeStart(days))),
      orderBy('date', 'desc'),
    ));
    await Promise.all([this.pmReady, this.nudReady]).catch(() => undefined);
    const rows: LogRow[] = [];
    snap.docs.forEach(d => {
      const data = d.data() || {};
      if (!this.isEiflixLogin(data)) return;
      const date = this.toDate(data['date']);
      const profileid = String(data['profileid'] ?? '').trim();
      rows.push({
        id: d.id, profileid,
        name: this.logNameFor(profileid),
        date, dateLabel: date ? formatDate(date, 'dd MMM yyyy, h:mm a', 'en-IN') : '—',
        device_os: this.logDeviceOs(data),
        current_version: String(data['current_version'] ?? '').trim(),
        isNewUser: this.isNewUserProfile(profileid),
      });
    });
    return rows;
  }

  async loadLoginLogs(): Promise<void> {
    this.logLoading = true; this.logError = false;
    try {
      const rows = await this.fetchLoginRows(this.logRange);
      this.logFetchedDays = this.logRange;
      this.logAll = rows;
      const names = new Map<string, string>();
      const os = new Set<string>();
      rows.forEach(r => { if (r.profileid) names.set(r.profileid, r.name); if (r.device_os) os.add(r.device_os); });
      this.logNameOptions = Array.from(names, ([profileid, name]) => ({ profileid, name })).sort((a, b) => a.name.localeCompare(b.name));
      this.logOsOptions = Array.from(os).sort();
      if (this.logNameFilter !== 'all' && !names.has(this.logNameFilter)) this.logNameFilter = 'all';
      if (this.logOsFilter !== 'all' && !os.has(this.logOsFilter)) this.logOsFilter = 'all';
      this.logPageIndex = 0;
      this.applyLogFilters();
      // A wider table fetch may now cover a report range that previously needed its own read.
      this.refreshReport();
    } catch (err) {
      console.error('eiflixoperationsdashboard: loginlog load failed', err);
      this.logError = true; this.logAll = []; this.logShown = []; this.logPage = [];
    } finally {
      this.logLoading = false;
    }
  }

  /**
   * Whether this person is still a NEW user.
   *
   * Deliberately the same rule the Total New Users card above uses (splitUsers:
   * `movedtoexist !== true`), so the card's number and this filter can never disagree. Anyone
   * who has been moved across — the New Users to Paid card — counts as existing from here on,
   * which is the whole point of that card.
   *
   * Everyone else who can sign in to the app is existing: the split is total, so no log row
   * disappears from both halves of the filter.
   */
  /**
   * Which `loginlog` documents belong on this table.
   *
   * Two kinds of EiFlix sign-in are recorded differently: the apps set `app: 'EiFlix'`, while the web
   * client sets the boolean `eiflixweb: true` instead. Either one is an EiFlix login and both belong
   * here; anything else (SolarVoice and friends) does not.
   *
   * Strictly `=== true`, not truthy: the flag is written as a boolean, and accepting the string
   * 'false' — which is truthy — would pull in rows that explicitly said they were not web.
   */
  private isEiflixLogin(data: any): boolean {
    return data?.['app'] === 'EiFlix' || data?.['eiflixweb'] === true;
  }

  /**
   * The Device OS column.
   *
   * A web sign-in has no device OS of its own, so `eiflixweb: true` reads as 'web'. That takes
   * precedence over any stored `device_os`: the flag says where the session actually happened, and a
   * row carrying both is a web session whatever the other field was left as.
   */
  private logDeviceOs(data: any): string {
    if (data?.['eiflixweb'] === true) return 'web';
    return String(data?.['device_os'] ?? '').trim();
  }

  // ==================== EiFlix Report ====================

  repRange: 1 | 7 | 30 = 1;
  repLoading = false;
  repError = false;
  repCounts: ReportCounts = this.emptyReportCounts();
  /** Rows for a window WIDER than the table's — fetched only when the table's cannot cover it. */
  private repRows: LogRow[] = [];
  private repFetchedDays = 0;
  private repToken = 0;

  get repRangeLabel(): string { return this.repRange === 1 ? 'today' : 'last ' + this.repRange + ' days'; }

  // ---- Total Content Consumption (content analytics) ----
  repConsumption: { app: ConsumptionCounts; web: ConsumptionCounts } = this.emptyConsumption();
  /**
   * Web App Users, counted from `content analytics` (platform_name 'Eiflixweb') rather than from
   * `loginlog` — operator decision, 2026-10-09. A web session is recorded in the analytics rows,
   * and the loginlog side was missing people. Fed by the consumption pass, so no extra read.
   */
  repWebUsers: CohortCount = { existing: 0, new: 0, total: 0 };
  repConsLoading = false;
  repConsError = false;
  /** Cached per range in days — one read per distinct range for the life of the session. */
  private repConsCache = new Map<number, { app: ConsumptionCounts; web: ConsumptionCounts; webUsers: CohortCount }>();
  private repConsToken = 0;

  /** The `platform_name` values each surface is recorded under, compared case-insensitively. */
  private static readonly PLATFORM_WEB = 'eiflixweb';
  private static readonly PLATFORM_APP = 'eiflixapp';
  /** `from` values that say which library a watched item came out of. */
  private static readonly FROM_WORKSHOP = 'eiflixworkshop';
  private static readonly FROM_LIBRARY = 'eiflixcontent';

  // ---- Purchases & signups ----
  /** new_user_data.movedon within the report window — people who bought a journey. */
  repJourneyPurchased = 0;
  /** new_user_data.created within the report window — people who joined. */
  repNewUsersJoined = 0;
  /** workshoppaymentlog.datetime within the window AND status 'captured'. */
  repMasterclass = 0;
  repMasterclassLoading = false;
  repMasterclassError = false;
  private repMasterclassCache = new Map<number, number>();
  private repMasterclassToken = 0;

  private emptyConsumption(): { app: ConsumptionCounts; web: ConsumptionCounts; webUsers: CohortCount } {
    const z = (): ConsumptionCounts => ({
      existingSeconds: 0, newSeconds: 0, totalSeconds: 0, workshopSeconds: 0, librarySeconds: 0,
    });
    return { app: z(), web: z(), webUsers: { existing: 0, new: 0, total: 0 } };
  }

  private emptyReportCounts(): ReportCounts {
    const z = (): CohortCount => ({ existing: 0, new: 0, total: 0 });
    return { android: z(), ios: z(), mobileTotal: z(), web: z() };
  }

  setRepRange(days: 1 | 7 | 30): void {
    if (this.repRange === days) return;
    this.repRange = days;
    this.refreshReport();
    this.refreshConsumption();
    this.computeNudCounts();
    this.refreshMasterclass();
  }

  /**
   * Total Content Consumption for both surfaces, over the report's own window.
   *
   * ONE `content analytics` read per distinct range, cached for the session — the same collection
   * and the same single-field `logdate` range the dashboard already uses, so no new index.
   *
   * It does NOT piggyback on fetchEngagement's pass, deliberately: engagement's "7D" starts at
   * today−7 while the report's starts at today−6 (seven calendar days including today, matching the
   * user counts directly above it). Sharing the aggregate would make "7D" mean two different things
   * inside one card, which is worse than one extra read.
   */
  async refreshConsumption(): Promise<void> {
    const token = ++this.repConsToken;
    const want = this.repRange;
    const cached = this.repConsCache.get(want);
    if (cached) { this.repConsumption = cached; this.repWebUsers = cached.webUsers; this.repConsError = false; return; }
    this.repConsLoading = true;
    this.repConsError = false;
    try {
      const start = this.logRangeStart(want);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const snap = await getDocs(query(
        collection(this.firestore, 'content analytics'),
        where('logdate', '>', Timestamp.fromDate(start)),
        where('logdate', '<', Timestamp.fromDate(end)),
      ));
      await Promise.all([this.pmReady, this.nudReady]).catch(() => undefined);
      if (token !== this.repConsToken) return;
      const built = this.buildConsumption(snap.docs.map(d => d.data()));
      this.repConsCache.set(want, built);
      this.repConsumption = built;
      this.repWebUsers = built.webUsers;
    } catch (err) {
      if (token !== this.repConsToken) return;
      console.error('eiflixoperationsdashboard: consumption load failed', err);
      this.repConsError = true;
      this.repConsumption = this.emptyConsumption();
      this.repWebUsers = { existing: 0, new: 0, total: 0 };
    } finally {
      if (token === this.repConsToken) this.repConsLoading = false;
    }
  }

  /** Start/end of the report's current window, shared by everything in the section. */
  private repWindow(days: number): { start: number; end: number } {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return { start: this.logRangeStart(days).getTime(), end: end.getTime() };
  }

  /**
   * How many documents carry `field` as a timestamp inside the window.
   *
   * Pure and defensive: a doc with the field missing, null, or unparseable is simply not in the
   * window — it must never be counted and must never throw. toDate() already copes with a
   * Timestamp, a Date, or a {seconds} shape, which is what a mixed-age collection holds.
   */
  private countInWindow(docs: Iterable<any>, field: string, start: number, end: number): number {
    let n = 0;
    for (const d of docs || []) {
      const at = this.toDate(d?.[field]);
      if (!at) continue;
      const t = at.getTime();
      // toDate() hands back an Invalid Date for junk (it falls through to `new Date(value)`), and
      // NaN comparisons are all false — so this already excluded it. Made explicit so it is a
      // decision rather than a happy accident.
      if (!Number.isFinite(t)) continue;
      if (t >= start && t <= end) n++;
    }
    return n;
  }

  /**
   * Journey Purchased and New Users Joined — both from `new_user_data`, which is ALREADY in memory.
   *
   * ngOnInit holds a realtime listener over that whole collection and keeps every document in
   * nudMap, so these two counts need no query at all: they are a filter over what is already here,
   * and they re-run for free whenever the listener emits.
   */
  private computeNudCounts(): void {
    const { start, end } = this.repWindow(this.repRange);
    const docs = [...this.nudMap.values()];
    this.repJourneyPurchased = this.countInWindow(docs, 'movedon', start, end);
    this.repNewUsersJoined = this.countInWindow(docs, 'created', start, end);
  }

  /**
   * Masterclass Purchase — `workshoppaymentlog`.
   *
   * ONE `where` on `datetime` only, with `status` tested in code. That is deliberate and is this
   * dashboard's convention throughout: a second equality alongside a range would need a composite
   * index, and every other query here is kept to a single-field range for the same reason.
   *
   * Cached per range for the session, like the consumption figures.
   */
  async refreshMasterclass(): Promise<void> {
    const token = ++this.repMasterclassToken;
    const want = this.repRange;
    const cached = this.repMasterclassCache.get(want);
    if (cached !== undefined) { this.repMasterclass = cached; this.repMasterclassError = false; return; }
    this.repMasterclassLoading = true;
    this.repMasterclassError = false;
    try {
      const { start, end } = this.repWindow(want);
      const snap = await getDocs(query(
        collection(this.firestore, 'workshoppaymentlog'),
        where('datetime', '>=', Timestamp.fromDate(new Date(start))),
        where('datetime', '<=', Timestamp.fromDate(new Date(end))),
      ));
      if (token !== this.repMasterclassToken) return;
      let n = 0;
      snap.forEach(d => {
        const data: any = d.data() || {};
        // The status filter lives here, not in the query — see the note above.
        if (String(data['status'] ?? '').trim().toLowerCase() !== 'captured') return;
        n++;
      });
      this.repMasterclassCache.set(want, n);
      this.repMasterclass = n;
    } catch (err) {
      if (token !== this.repMasterclassToken) return;
      console.error('eiflixoperationsdashboard: masterclass purchases load failed', err);
      this.repMasterclassError = true;
      this.repMasterclass = 0;
    } finally {
      if (token === this.repMasterclassToken) this.repMasterclassLoading = false;
    }
  }

  /**
   * Sum `totaltimespend` per surface, split by cohort.
   *
   * Platform is matched case-insensitively on the raw `platform_name`: the value is free text from
   * the client and `platformKey()` elsewhere preserves its case, so 'Eiflixweb' and 'eiflixweb' are
   * the same surface and must not land in different buckets.
   *
   * The cohort rule is `isNewUserProfile` — the same one the user counts above use, and the same one
   * the Users cards use. A person moved to paid is EXISTING even though new_user_data still has them.
   *
   * Mobile is one bucket: Android and iOS both record `platform_name: 'eiflixapp'`, so there is
   * nothing to split here.
   *
   * `existingSeconds` is derived as `total − new`, so the parts always agree with the whole.
   */
  private buildConsumption(docs: any[]): { app: ConsumptionCounts; web: ConsumptionCounts; webUsers: CohortCount } {
    const blank = () => ({ total: 0, fresh: 0, workshop: 0, library: 0 });
    const web = blank();
    const app = blank();
    // Web App Users come from these same rows (see repWebUsers): unique PEOPLE, not sessions.
    const webIds = new Set<string>();
    const webNewIds = new Set<string>();
    for (const d of docs || []) {
      const platform = String(d?.['platform_name'] ?? '').trim().toLowerCase();
      const isWeb = platform === EiflixoperationsdashboardComponent.PLATFORM_WEB;
      const isApp = platform === EiflixoperationsdashboardComponent.PLATFORM_APP;
      if (!isWeb && !isApp) continue;
      const seconds = Number(d?.['totaltimespend']) || 0;
      if (seconds <= 0) continue;
      const bucket = isWeb ? web : app;
      bucket.total += seconds;

      const pid = String(d?.['profileid'] ?? '').trim();
      const isNew = !!pid && this.isNewUserProfile(pid);
      if (isNew) bucket.fresh += seconds;
      // A row with no profileid still contributes its SECONDS (the time was watched) but cannot
      // count as a PERSON — the two answers legitimately differ on the same row.
      if (isWeb && pid) { webIds.add(pid); if (isNew) webNewIds.add(pid); }

      // Same free-text treatment as platform_name, for the same reason.
      const from = String(d?.['from'] ?? '').trim().toLowerCase();
      if (from === EiflixoperationsdashboardComponent.FROM_WORKSHOP) bucket.workshop += seconds;
      else if (from === EiflixoperationsdashboardComponent.FROM_LIBRARY) bucket.library += seconds;
    }
    const shape = (b: ReturnType<typeof blank>): ConsumptionCounts => ({
      totalSeconds: b.total,
      newSeconds: b.fresh,
      existingSeconds: b.total - b.fresh,
      workshopSeconds: b.workshop,
      librarySeconds: b.library,
    });
    return {
      app: shape(app),
      web: shape(web),
      webUsers: { total: webIds.size, new: webNewIds.size, existing: webIds.size - webNewIds.size },
    };
  }

  // ==================== export ====================

  repExporting = false;
  /** Shown beside the button: an export is user-initiated, so a silent failure is not acceptable. */
  repExportError = false;

  /** `d MMM` for the sheet's period line, e.g. "Sept 25". */
  private sheetDay(d: Date): string {
    return formatDate(d, 'MMM d', 'en-US');
  }

  /**
   * The report as an .xlsx, laid out like the weekly report the team writes by hand.
   *
   * The grid, the merges and the column widths mirror that workbook cell for cell so the two can
   * sit side by side. SheetJS's community build cannot write cell STYLES (bold, borders), so the
   * file carries the layout and the values but not the manual sheet's bold headings — swapping
   * `xlsx` for the drop-in `xlsx-js-style` would add those without touching this code's shape.
   *
   * Everything written here is already on screen. Export never re-queries, so the file and the
   * dashboard can never disagree.
   */
  /**
   * The workbook's grid and merges — pure, so the layout can be tested without writing a file.
   *
   * Mirrors the weekly report the team writes by hand, cell for cell: same row order, same merged
   * title/period/section bands, and the Total header spanning rows 6-7 beside the two-column
   * Android and iOS groups.
   */
  buildReportSheet(): { rows: (string | number)[][]; merges: any[] } {
    const { start } = this.repWindow(this.repRange);
    const now = new Date();
    const period = this.repRange === 1
      ? formatDate(now, 'MMM d, y', 'en-US')
      : `${this.sheetDay(new Date(start))} to ${formatDate(now, 'MMM d, y', 'en-US')}`;

    const m = this.repCounts, c = this.repConsumption, w = this.repWebUsers;
    const dur = (sec: number) => this.formatConsumption(sec);
    const E = '';

    const rows: (string | number)[][] = [
      ['EiFlix Weekly Report', E, E, E, E],
      [E, E, E, E, E],
      [period, E, E, E, E],
      [E, E, E, E, E],
      ['EiFlix Mobile App Users', E, E, E, E],
      ['Android', E, 'iOS', E, 'Total'],
      ['Existing Users', 'New Users', 'Existing Users', 'New Users', E],
      [m.android.existing, m.android.new, m.ios.existing, m.ios.new, m.mobileTotal.total],
      [E, E, E, E, E],
      ['EiFlix Web App Users', E, E, E, E],
      ['Existing Users', 'New Users', 'Total', E, E],
      [w.existing, w.new, w.total, E, E],
      [E, E, E, E, E],
      ['Total Content Consumption', E, E, E, E],
      ['EiFlix Mobile App Users', E, E, E, E],
      ['Existing Users', 'New Users', 'Total', 'Workshop Videos', 'Library Videos'],
      [dur(c.app.existingSeconds), dur(c.app.newSeconds), dur(c.app.totalSeconds),
       dur(c.app.workshopSeconds), dur(c.app.librarySeconds)],
      [E, E, E, E, E],
      ['EiFlix Web App Users', E, E, E, E],
      ['Existing Users', 'New Users', 'Total', 'Workshop Videos', 'Library Videos'],
      [dur(c.web.existingSeconds), dur(c.web.newSeconds), dur(c.web.totalSeconds),
       dur(c.web.workshopSeconds), dur(c.web.librarySeconds)],
      [E, E, E, E, E],
      ['New Users Joined in EiFlix', 'Journey Purchased', 'Masterclass Purchase', E, E],
      [this.repNewUsersJoined, this.repJourneyPurchased, this.repMasterclass, E, E],
    ];

    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },    // title
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },    // period
      { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } },    // Mobile App Users
      { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } },    // Android
      { s: { r: 5, c: 2 }, e: { r: 5, c: 3 } },    // iOS
      { s: { r: 5, c: 4 }, e: { r: 6, c: 4 } },    // Total, two rows tall
      { s: { r: 9, c: 0 }, e: { r: 9, c: 2 } },    // Web App Users
      { s: { r: 13, c: 0 }, e: { r: 13, c: 4 } },  // Total Content Consumption
      { s: { r: 14, c: 0 }, e: { r: 14, c: 4 } },  // …Mobile
      { s: { r: 18, c: 0 }, e: { r: 18, c: 4 } },  // …Web
    ];
    return { rows, merges };
  }

  exportReport(): void {
    if (this.repExporting) return;
    this.repExporting = true;
    this.repExportError = false;
    try {
      const { rows, merges } = this.buildReportSheet();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!merges'] = merges;
      // Wide enough for "322 hours 09 minutes 30 seconds" without the reader resizing anything.
      ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Weekly Report');
      XLSX.writeFile(wb, `EiFlix Report ${formatDate(new Date(), 'yyyy-MM-dd', 'en-US')}.xlsx`);
      this.repExportError = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: report export failed', err);
      this.repExportError = true;
    } finally {
      this.repExporting = false;
    }
  }

  /**
   * "127 hours 06 minutes 42 seconds".
   *
   * Hours are NOT capped at 24 — this is a running total across many people, so three figures are
   * normal. Minutes and seconds are zero-padded so a column of these stays aligned.
   */
  formatConsumption(seconds: number | null | undefined): string {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${h} hours ${pad(m)} minutes ${pad(sec)} seconds`;
  }

  /**
   * Recount the report.
   *
   * READ REUSE is the point here. The table has already read `loginlog` for its own range, and a
   * LogRow carries everything the report needs — profileid, date, the normalised device_os (already
   * 'web' for an eiflixweb sign-in) and the resolved cohort. So:
   *
   *   • report window ⊆ the table's window      → count from logAll, ZERO extra reads
   *   • otherwise, and already fetched wider    → count from the report's own cached rows
   *   • otherwise                               → one read, cached for the rest of the session
   *
   * Picking Today while the table is on 30D therefore costs nothing, and the first load costs
   * nothing because both default to Today.
   */
  async refreshReport(): Promise<void> {
    const token = ++this.repToken;
    const want = this.repRange;
    try {
      let source: LogRow[] | null = null;
      if (this.logFetchedDays >= want) source = this.logAll;
      else if (this.repFetchedDays >= want) source = this.repRows;

      if (!source) {
        this.repLoading = true;
        this.repError = false;
        const rows = await this.fetchLoginRows(want);
        if (token !== this.repToken) return;
        this.repRows = rows;
        this.repFetchedDays = want;
        source = rows;
      }
      // The cached rows cover AT LEAST the wanted window, usually more — trim to the one asked for.
      const since = this.logRangeStart(want).getTime();
      const inWindow = source.filter(r => !!r.date && r.date.getTime() >= since);
      this.repCounts = this.buildReportCounts(inWindow);
      this.repError = false;
    } catch (err) {
      if (token !== this.repToken) return;
      console.error('eiflixoperationsdashboard: report load failed', err);
      this.repError = true;
      this.repCounts = this.emptyReportCounts();
    } finally {
      if (token === this.repToken) this.repLoading = false;
    }
  }

  /**
   * Which surface a row came from.
   *
   * `web` first and by exact match: logDeviceOs() already rewrote an `eiflixweb: true` row to
   * exactly 'web', so nothing else can claim it. The mobile tests are substring matches because
   * device_os is free text from the client — "Android 13", "iOS 17.2", "iPadOS" all arrive.
   */
  private deviceClass(os: string): 'web' | 'android' | 'ios' | 'other' {
    const v = (os || '').trim().toLowerCase();
    if (v === 'web') return 'web';
    if (v.includes('android')) return 'android';
    if (v.includes('ios') || v.includes('iphone') || v.includes('ipad')) return 'ios';
    return 'other';
  }

  /**
   * Unique PEOPLE per surface, split into existing and new.
   *
   * Counts are of profileids, not rows — somebody who signed in nine times today is one person.
   *
   * MOBILE TOTAL is the union of Android and iOS, deduplicated: a person who used both phones is
   * one person, so the total is normally LESS than Android + iOS rather than their sum.
   *
   * WEB IS COUNTED SEPARATELY and is deliberately NOT deduplicated against mobile. Plenty of people
   * use a phone and the web, and collapsing them would hide exactly that. The two sections answer
   * different questions and their totals are not meant to be added together.
   *
   * `existing` is derived as `total - new` rather than counted on its own, so the two halves can
   * never disagree with the total they are shown beside.
   */
  private buildReportCounts(rows: LogRow[]): ReportCounts {
    const bucket = (keep: (c: 'web' | 'android' | 'ios' | 'other') => boolean): CohortCount => {
      const ids = new Set<string>();
      const newIds = new Set<string>();
      for (const r of rows || []) {
        // Trimmed here rather than trusting the caller: fetchLoginRows already trims, but a
        // whitespace-only id is not a person and this function should be right on its own terms.
        const pid = String(r?.profileid ?? '').trim();
        if (!pid) continue;
        if (!keep(this.deviceClass(r.device_os))) continue;
        ids.add(pid);
        if (r.isNewUser) newIds.add(pid);
      }
      return { total: ids.size, new: newIds.size, existing: ids.size - newIds.size };
    };
    return {
      android: bucket(c => c === 'android'),
      ios: bucket(c => c === 'ios'),
      mobileTotal: bucket(c => c === 'android' || c === 'ios'),
      // PARKED 2026-10-09 (operator): Web App Users now come from `content analytics`
      // (platform_name 'Eiflixweb') via repWebUsers, not from loginlog's device_os. The loginlog
      // rule is kept here, switched off, because the hooks and the deviceClass('web') branch are
      // still live for the App Logs table and this may be wanted back.
      //   web: bucket(c => c === 'web'),
      web: { existing: 0, new: 0, total: 0 },
    };
  }

  private isNewUserProfile(profileid: string): boolean {
    const nud = profileid ? this.nudMap.get(profileid) : null;
    return !!nud && nud['movedtoexist'] !== true;
  }

  /** Name from the participant directory, then new_user_data; the id itself when neither knows them. */
  private logNameFor(profileid: string): string {
    if (!profileid) return '—';
    const pm = this.pmMap.get(profileid); if (pm?.name) return String(pm.name);
    const nud = this.nudMap.get(profileid); if (nud?.name) return String(nud.name);
    return profileid;
  }

  applyLogFilters(): void {
    const q = this.logSearch.trim().toLowerCase();
    const dir = this.logSortDir === 'asc' ? 1 : -1;
    const key = this.logSortKey;
    this.logShown = this.logAll
      .filter(r => this.logNameFilter === 'all' || r.profileid === this.logNameFilter)
      .filter(r => this.logOsFilter === 'all' || r.device_os === this.logOsFilter)
      .filter(r => this.logUserTypeFilter === 'all'
        || (this.logUserTypeFilter === 'new' ? r.isNewUser : !r.isNewUser))
      .filter(r => !q || `${r.name} ${r.profileid} ${r.device_os} ${r.current_version} ${r.dateLabel}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (key === 'date') return ((a.date?.getTime() || 0) - (b.date?.getTime() || 0)) * dir;
        return String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { numeric: true, sensitivity: 'base' }) * dir;
      });
    if (this.logPageIndex > this.logPageCount - 1) this.logPageIndex = this.logPageCount - 1;
    this.slicePage();
  }

  private slicePage(): void {
    const start = this.logPageIndex * this.logPageSize;
    this.logPage = this.logShown.slice(start, start + this.logPageSize);
  }

  setLogSort(key: 'name' | 'date' | 'device_os' | 'current_version'): void {
    if (this.logSortKey === key) this.logSortDir = this.logSortDir === 'asc' ? 'desc' : 'asc';
    else { this.logSortKey = key; this.logSortDir = key === 'date' ? 'desc' : 'asc'; }
    this.applyLogFilters();
  }
  onLogFilterChange(): void { this.logPageIndex = 0; this.applyLogFilters(); }
  clearLogFilters(): void { this.logSearch = ''; this.logNameSearch = ''; this.logNameFilter = 'all'; this.logOsFilter = 'all'; this.logUserTypeFilter = 'all'; this.onLogFilterChange(); }
  get logFilterCount(): number { return (this.logSearch.trim() ? 1 : 0) + (this.logNameFilter !== 'all' ? 1 : 0) + (this.logOsFilter !== 'all' ? 1 : 0) + (this.logUserTypeFilter !== 'all' ? 1 : 0); }
  setLogPageSize(size: number): void { this.logPageSize = Number(size) || 25; this.logPageIndex = 0; this.slicePage(); }
  logPrev(): void { if (this.logPageIndex > 0) { this.logPageIndex--; this.slicePage(); } }
  logNext(): void { if (this.logPageIndex < this.logPageCount - 1) { this.logPageIndex++; this.slicePage(); } }
  get logPageFrom(): number { return this.logShown.length ? this.logPageIndex * this.logPageSize + 1 : 0; }
  get logPageTo(): number { return Math.min(this.logShown.length, (this.logPageIndex + 1) * this.logPageSize); }
  trackLog(_: number, r: LogRow): string { return r.id; }

  ngOnDestroy(): void {
    if (this.planTipTimer) clearTimeout(this.planTipTimer);
    this.destroy$.next();
    this.destroy$.complete();
    if (typeof cancelAnimationFrame !== 'undefined') {
      for (const card of this.cards) {
        if (card.rafId !== undefined) cancelAnimationFrame(card.rafId);
      }
    }
    this.unlockScroll();
  }

  // ==================== directories ====================

  /** One-shot full load of a collection into a directory map. */
  private async loadDirectory(coll: string, map: Map<string, any>): Promise<void> {
    try {
      const snap = await getDocs(collection(this.firestore, coll));
      snap.forEach(d => map.set(d.id, d.data()));
    } catch (err) {
      // Non-fatal: dependents fall back to unknown rows/titles.
      console.error(`eiflixoperationsdashboard: ${coll} load failed`, err);
    }
  }

  /** Entire `journey` collection -> id to `journey` name — participant rows
   *  in ANY panel can carry any activejourney, so all names are needed. */
  private async loadJourneyNames(): Promise<void> {
    try {
      const snap = await getDocs(collection(this.firestore, 'journey'));
      snap.forEach(d => this.journeyNames.set(d.id, (d.data() as any).journey || ''));
    } catch (err) {
      console.error('eiflixoperationsdashboard: journey names load failed', err);
    }
    // Names may land after the listeners have already built cards — but
    // never rebuild before the first pm emission (an open panel would
    // flash a false empty state off the still-empty pmMap).
    if (!this.pmLoading) {
      this.updateBigParticipantsCard();
      this.rebuildPaidCard();
      this.rebuildMasterclassCard();
    }
  }

  /** journeyTag for any participant doc, when its journey has a name. */
  private journeyTagFor(pmDoc: any): string | undefined {
    if (!pmDoc?.activejourney) return undefined;
    return this.journeyNames.get(pmDoc.activejourney) || undefined;
  }

  private journeyName(id: string): string {
    return this.journeyNames.get(id) || 'Journey ' + (this.bigJourneyIdList.indexOf(id) + 1);
  }

  // ==================== Users ====================

  setUsersRange(key: 'all' | 'today' | '7d' | '30d'): void {
    this.usersRange = key;
    this.usersCustomStart = '';
    this.usersCustomEnd = '';
    this.refreshUsersCards();
  }

  /** Both pickers set -> switch to the manual range (mirrors Engagement). */
  applyUsersCustom(): void {
    if (!this.usersCustomStart || !this.usersCustomEnd) return;
    this.usersRange = 'custom';
    this.refreshUsersCards();
  }

  /** True while exactly one custom date is picked — shows the header hint. */
  get usersCustomHint(): boolean {
    return !!this.usersCustomStart !== !!this.usersCustomEnd;
  }

  /**
   * The active window as timestamps, or null for "no date filter". Computed
   * ONCE per rebuild and passed down, never evaluated per row.
   */
  private usersWindow(): { start: number; end: number } | null {
    if (this.usersRange === 'all') return null;
    // A cleared picker leaves the key on 'custom' with no bounds — read that
    // as unfiltered rather than filtering against nothing.
    if (this.usersRange === 'custom' && (!this.usersCustomStart || !this.usersCustomEnd)) return null;
    const start = new Date();
    const end = new Date();
    if (this.usersRange === 'custom') {
      const s = this.parseDateInput(this.usersCustomStart);
      const e = this.parseDateInput(this.usersCustomEnd);
      // Tolerate a reversed pick — the earlier date is the start.
      start.setTime(Math.min(s.getTime(), e.getTime()));
      end.setTime(Math.max(s.getTime(), e.getTime()));
    } else if (this.usersRange === '7d') {
      start.setDate(start.getDate() - 7);
    } else if (this.usersRange === '30d') {
      start.setDate(start.getDate() - 30);
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  }

  /**
   * Is this stored date inside the window? A row whose date is missing or
   * unreadable cannot be placed in any window, so it drops out while a range
   * is active and is kept while there is none.
   */
  private inUsersWindow(value: any, win: { start: number; end: number } | null): boolean {
    if (!win) return true;
    const t = this.toDate(value)?.getTime();
    return typeof t === 'number' && Number.isFinite(t) && t >= win.start && t <= win.end;
  }

  /**
   * Re-bucket both date-driven cards from the documents already in memory.
   * `new_user_data` is a full realtime listener, so every range change on this
   * section costs ZERO Firestore reads.
   */
  private refreshUsersCards(): void {
    const win = this.usersWindow();
    this.usersRangeLabel = !win ? ''
      : this.usersRange === 'today' ? 'today'
      : this.usersRange === '7d' ? 'in the last 7 days'
      : this.usersRange === '30d' ? 'in the last 30 days'
      : this.formatRange(new Date(win.start), new Date(win.end));
    this.rebuildNewUsersCard();
    this.rebuildPaidCard();
    this.rebuildMasterclassCard();
  }

  /**
   * Bucket the raw docs into the cards, newest first. Display strings are
   * precomputed once per emission so change detection never re-formats rows.
   * Also refreshes nudMap — the raw-doc directory used by profile lookups.
   */
  private splitUsers(data: any[]): void {
    this.nudMap.clear();
    for (const u of data) {
      if (u.id) this.nudMap.set(u.id, u);
    }
    this.nudDocs = data;
    this.rebuildNewUsersCard();
    this.rebuildPaidCard();
    this.rebuildMasterclassCard();
    // Keep an open users panel in sync with realtime updates.
    if (this.activePanel?.kind === 'users') {
      const card = this.cards.find(c => c.key === this.activePanel!.cardKey);
      if (card && card.key !== 'big-participants') {
        this.setPanelRows(this.activePanel, card.users);
        this.activePanel.loading = false;
      }
    }
  }

  /**
   * Total New Users — rows not yet moved to paid, narrowed by the section
   * range on the SIGNUP date.
   */
  private rebuildNewUsersCard(): void {
    const card = this.cards.find(c => c.key === 'total-new-users');
    if (!card) return;
    const win = this.usersWindow();
    const rows = this.nudDocs
      .filter(u => u['movedtoexist'] !== true && this.inUsersWindow(u['created'], win))
      .map(u => ({
        ...u,
        createdLabel: this.formatCreated(u.created),
        initialsLabel: this.initials(u.name),
        sourceTag: 'New User'
      }))
      .sort((a, b) => (this.toDate(b.created)?.getTime() || 0) - (this.toDate(a.created)?.getTime() || 0));
    card.users = rows;
    card.caption = win ? 'Signed up ' + this.usersRangeLabel : 'Signed up · not yet purchased journey';
    this.animateCount(card, rows.length);
    if (this.activePanel?.kind === 'users' && this.activePanel.cardKey === card.key) {
      this.setPanelRows(this.activePanel, rows);
      this.activePanel.loading = false;
    }
  }

  /**
   * Master Class Purchase: ONE equality query (status == 'captured', so no
   * composite index), plus one read of workshopconfiguration for the titles.
   * The Users range then narrows on `datetime` in memory — a range change
   * costs no read.
   */
  private async loadMasterclass(): Promise<void> {
    this.mcLoading = true;
    this.mcError = false;
    try {
      const [paySnap, wsSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'workshoppaymentlog'), where('status', '==', 'captured'))),
        getDocs(collection(this.firestore, 'workshopconfiguration'))
      ]);
      this.workshopTitles.clear();
      wsSnap.forEach(d => {
        const title = String((d.data() as any)?.['detailpage']?.['title'] ?? '').trim();
        if (title) this.workshopTitles.set(d.id, title);
      });
      this.mcPayments = paySnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (err) {
      console.error('Master Class Purchase load failed', err);
      this.mcError = true;
      this.mcPayments = [];
    } finally {
      this.mcLoading = false;
      this.rebuildMasterclassCard();
    }
  }

  /** workshopref is a DocumentReference; tolerate a plain path string too. */
  private refId(ref: any): string {
    if (!ref) return '';
    if (typeof ref === 'string') return ref.split('/').filter(Boolean).pop() || '';
    if (typeof ref.id === 'string') return ref.id;
    if (typeof ref.path === 'string') return ref.path.split('/').filter(Boolean).pop() || '';
    return '';
  }

  /**
   * One row per captured payment in the Users range. Name comes from the
   * directories (participant metadata first, then new_user_data); a payer who
   * is in new_user_data is tagged New User (operator rule). Re-run whenever the
   * range or either directory changes, so names and tags stay current.
   */
  private rebuildMasterclassCard(): void {
    const card = this.cards.find(c => c.key === 'masterclass-purchase');
    if (!card) return;
    const win = this.usersWindow();
    let rupees = 0;
    let newUsers = 0;
    const rows = this.mcPayments
      .filter(p => this.inUsersWindow(p['datetime'], win))
      .map(p => {
        const pid = String(p['profileid'] ?? '').trim();
        const pm = pid ? this.pmMap.get(pid) : undefined;
        const nud = pid ? this.nudMap.get(pid) : undefined;
        // The dashboard's one new-user rule: movedtoexist == true means they now live in participant
        // metadata — existing, never "New User" (row tag, card count and the export's User Type all
        // read this). Operator 2026-10-17.
        const isNew = this.isNewUserProfile(pid);
        const src: any = pm || nud || {};
        const amount = Number(p['amountRupees']);
        const rs = Number.isFinite(amount) ? amount : 0;
        rupees += rs;
        if (isNew) newUsers++;
        const wsId = this.refId(p['workshopref']);
        return {
          id: p.id,
          profileid: pid,
          name: src.name || pid || 'Unknown',
          email: src.email,
          phonenumber: src.phonenumber,
          initialsLabel: this.initials(src.name),
          unknown: !pm && !nud,
          ...(isNew ? { sourceTag: 'New User' } : {}),
          // Journey exists only on participant metadata — new-user-only payers get none.
          ...(pm ? { journeyTag: this.journeyTagFor(pm) } : {}),
          workshopTag: this.workshopTitles.get(wsId) || (wsId ? 'Unknown workshop' : undefined),
          amountLabel: '₹' + rs.toLocaleString('en-IN'),
          amountValue: rs,
          created: p['datetime'],
          createdLabel: this.formatCreated(p['datetime'])
        };
      })
      .sort((a, b) => (this.toDate(b.created)?.getTime() || 0) - (this.toDate(a.created)?.getTime() || 0));
    card.users = rows;
    card.breakdown = rows.length ? [{ label: 'new users', count: newUsers }] : undefined;
    card.highlight = this.mcError ? undefined : '₹' + rupees.toLocaleString('en-IN');
    card.caption = this.mcError
      ? 'Couldn’t load purchases — refresh to retry'
      : 'Captured payments' + (win ? ' · ' + this.usersRangeLabel : '');
    this.animateCount(card, rows.length);
    if (this.activePanel?.kind === 'users' && this.activePanel.cardKey === card.key) {
      this.setPanelRows(this.activePanel, rows);
      this.activePanel.loading = false;
    }
  }

  /** Ease the card number from its current value to the new total. */
  private animateCount(card: OpsCard, to: number): void {
    if (card.rafId !== undefined && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(card.rafId);
      card.rafId = undefined;
    }
    if (this.reducedMotion || typeof requestAnimationFrame === 'undefined' || card.displayCount === to) {
      card.displayCount = to;
      return;
    }
    const from = card.displayCount;
    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      card.displayCount = Math.round(from + (to - from) * eased);
      card.rafId = t < 1 ? requestAnimationFrame(tick) : undefined;
    };
    card.rafId = requestAnimationFrame(tick);
  }

  /**
   * New Users to Paid (operator): the ids still come from new_user_data
   * (movedtoexist == true), but each row shows the PARTICIPANT METADATA
   * profile (primary) with its journey — falling back to the nud doc only
   * while pm hasn't loaded or the twin doc is missing.
   */
  private rebuildPaidCard(): void {
    const card = this.cards.find(c => c.key === 'new-users-to-paid');
    if (!card) return;
    const win = this.usersWindow();
    const rows: any[] = [];
    this.nudMap.forEach((nud, id) => {
      if (nud.movedtoexist !== true) return;
      // The move date is read off the NEW-USER doc, never off `src` below: the
      // row renders from participant metadata when a twin exists and that
      // document carries no move date, so reading it there would drop everyone
      // with a full profile the moment a range is applied.
      if (!this.inUsersWindow(nud['movedon'], win)) return;
      const pm = this.pmMap.get(id);
      const src = pm || nud;
      rows.push({
        ...src, id,
        created: src.created ?? nud.created,
        createdLabel: this.formatCreated(src.created ?? nud.created),
        initialsLabel: this.initials(src.name),
        // Everyone on this card has movedtoexist == true, so none is a New User (operator 2026-10-17).
        ...(pm ? { journeyTag: this.journeyTagFor(pm) } : {}),
        amountLabel: this.planLabel(id),
        // Numeric copy for the panel's Amount sort; not found / loading sort last.
        planValue: this.planTotals?.get(id) ?? undefined,
        planPurchases: this.planPurchases?.get(id),
        planPurchaseTotalLabel: this.planPurchaseTotals?.has(id) ? this.formatPlan(this.planPurchaseTotals.get(id) as number) : undefined
      });
    });
    rows.sort((a, b) => (this.toDate(b.created)?.getTime() || 0) - (this.toDate(a.created)?.getTime() || 0));
    card.users = rows;
    card.caption = win ? 'Purchased Journey · ' + this.usersRangeLabel : 'Purchased Journey';
    // Card total = the people currently in the card (so it follows the range).
    if (this.planStatus === 'unavailable' || this.planStatus === 'idle') {
      card.highlight = undefined;
    } else if (rows.some(r => !this.planTotals.has(r.id))) {
      card.highlight = '…';
    } else {
      const found = rows.filter(r => typeof this.planTotals.get(r.id) === 'number');
      if (!found.length && rows.length) {
        // Nobody in the card was found in Watson — say so; never show ₹0.
        card.highlight = '—';
      } else {
        const sum = found.reduce((acc, r) => acc + (this.planTotals.get(r.id) as number), 0);
        card.highlight = this.formatPlan(sum);
        card.highlightWords = indianNumberWords(sum);
      }
    }
    if (!card.highlight || card.highlight === '…' || card.highlight === '—' || card.highlight === this.formatPlan(0)) card.highlightWords = undefined;
    // No label inside the pill — the amount (and its words) only (operator 2026-10-13).
    card.highlightLabel = undefined;
    // Once both directories have loaded, look up anyone not yet fetched.
    if (!this.loading && !this.pmLoading) void this.loadPlanTotals();
    this.animateCount(card, rows.length);
    if (this.activePanel?.kind === 'users' && this.activePanel.cardKey === card.key) {
      this.setPanelRows(this.activePanel, rows);
      this.activePanel.loading = false;
    }
  }

  /** Rupees with Indian digit grouping (₹2,06,94,876) — the shared formatter, same as the workshop dashboard. */
  private formatPlan(v: number): string {
    return formatRupees(v);
  }

  private planLabel(profileid: string): string | undefined {
    if (this.planStatus === 'unavailable' || this.planStatus === 'idle') return undefined;
    if (!this.planTotals.has(profileid)) return '…';
    const v = this.planTotals.get(profileid);
    return v === null || v === undefined ? '—' : this.formatPlan(v);
  }

  /** Same initialisation as AuthguardService.initializeWatson; null when this build has no Watson config. */
  private watsonDb(): any | null {
    const cfg = (environment as any)['watson'];
    if (!cfg) return null;
    if (!getApps().some(a => a.name === 'watson')) initializeApp(cfg, 'watson');
    return getFirestore(getApp('watson'));
  }

  /**
   * Watson TOTAL AMOUNT for everyone on the paid side — the EXACT chain Journey
   * Support runs for one person, run here for each person:
   *   profile_data/{profileid}            -> name + email
   *   Watson Participants where email ==  -> first name-or-email match -> id
   *   Watson Payment Schedule where participantid == , orderBy date asc
   *   -> journeySupportTotal()
   * Each person is fetched once per visit and cached. Every step reads 30 people per query, all
   * queries at once, and rebuilds each person's equality result from the batch.
   */
  private async loadPlanTotals(): Promise<void> {
    const wanted: string[] = [];
    this.nudMap.forEach((nud, id) => {
      if (nud.movedtoexist !== true || this.planTotals.has(id) || this.planPending.has(id)) return;
      wanted.push(id);
    });
    if (!wanted.length) return;
    const watsonDatabase = this.watsonDb();
    if (!watsonDatabase) {
      if (this.planStatus !== 'unavailable') { this.planStatus = 'unavailable'; this.rebuildPaidCard(); }
      return;
    }
    wanted.forEach(id => this.planPending.add(id));
    this.planStatus = 'loading';
    const purchaseRowsFor = (docs: any[]) => watsonPurchaseRows(docs).map(r => ({
      ...r,
      dateLabel: r.date ? formatDate(r.date, 'd MMM y', 'en-US') : '—',
      amountLabel: r.amount === null ? '—' : this.formatPlan(r.amount)
    }));
    const setPurchases = (profileid: string, docs: any[]) => {
      const rows = purchaseRowsFor(docs);
      this.planPurchases.set(profileid, rows);
      this.planPurchaseTotals.set(profileid, rows.reduce((acc, r) => acc + (r.amount ?? 0), 0));
    };
    // The single-person chain, kept for a profile whose email is not text (the batched read needs text).
    const one = async (profileid: string, profileData: any): Promise<number | null> => {
      try {
        const participant = await getDocs(query(collection(watsonDatabase, 'Participants'), where('email', '==', profileData['email'])));
        const participantid = journeySupportParticipantId(participant.docs.map(d => d.data()), profileData);
        if (participantid == null) return null;   // Journey Support: "unable to find Client in Watson"
        const [schedule, purchases] = await Promise.all([
          getDocs(query(collection(watsonDatabase, 'Payment Schedule'), where('participantid', '==', participantid), orderBy('date', 'asc'))),
          getDocs(query(collection(watsonDatabase, 'ParticipantPurchases'), where('participantid', '==', participantid))),
        ]);
        setPurchases(profileid, purchases.docs.map(d => d.data()));
        return journeySupportTotal(schedule.docs.map(d => d.data()));
      } catch (err) {
        console.error('eiflixoperationsdashboard: Watson total amount lookup failed for ' + profileid, err);
        return null;
      }
    };
    // Same chain as Journey Support, read 30 people per query with every query in flight at once
    // (the workshop dashboard's Sale Achieved fix, 2026-10-15). READ ONLY — Watson is never written.
    const readIn = async (db: any, coll: string, field: any, values: any[]): Promise<{ id: string; data: any }[]> => {
      const chunks: any[][] = [];
      for (let k = 0; k < values.length; k += 30) chunks.push(values.slice(k, k + 30));
      const snaps = await Promise.all(chunks.map(c =>
        getDocs(query(collection(db, coll), where(field, 'in', c))).catch(err => {
          console.error('eiflixoperationsdashboard: Watson total amount read failed (' + coll + ')', err);
          return null;
        })));
      return snaps.flatMap(sn => sn ? sn.docs.map(d => ({ id: d.id, data: d.data() })) : []);
    };
    const totals = new Map<string, number | null>();
    try {
      const profiles = new Map((await readIn(this.firestore, 'profile_data', documentId(), wanted)).map(d => [d.id, d.data]));
      const textEmail = wanted.filter(id => typeof profiles.get(id)?.['email'] === 'string');
      const emails = [...new Set(textEmail.map(id => profiles.get(id)!['email']))];
      const participantsByEmail = groupLikeEquality(await readIn(watsonDatabase, 'Participants', 'email', emails), 'email');
      const participantOf = new Map<string, any>();
      textEmail.forEach(id => {
        const profileData = profiles.get(id);
        const pid = journeySupportParticipantId((participantsByEmail.get(profileData['email']) ?? []).map(d => d.data), profileData);
        if (pid != null) participantOf.set(id, pid);   // null: "unable to find Client in Watson"
      });
      const pids = [...new Set(participantOf.values())];
      const [scheduleDocs, purchaseDocs] = await Promise.all([
        readIn(watsonDatabase, 'Payment Schedule', 'participantid', pids),
        readIn(watsonDatabase, 'ParticipantPurchases', 'participantid', pids),
      ]);
      const scheduleBy = groupLikeEquality(scheduleDocs, 'participantid');
      const purchasesBy = groupLikeEquality(purchaseDocs, 'participantid');
      participantOf.forEach((pid, id) => {
        setPurchases(id, (purchasesBy.get(pid) ?? []).map(d => d.data));
        totals.set(id, journeySupportTotal(journeySupportScheduleOrder(scheduleBy.get(pid) ?? [])));
      });
      // A profile with a non-text email still gets the exact single-person chain.
      await Promise.all(wanted
        .filter(id => profiles.has(id) && !textEmail.includes(id))
        .map(async id => totals.set(id, await one(id, profiles.get(id)))));
    } catch (err) {
      console.error('eiflixoperationsdashboard: Watson total amount lookup failed', err);
    }
    wanted.forEach(id => {
      this.planTotals.set(id, totals.has(id) ? totals.get(id)! : null);
      this.planPending.delete(id);
    });
    this.planStatus = 'ready';
    this.rebuildPaidCard();
  }

  /**
   * Purchases hover card (operator 2026-10-14): one line per product bought,
   * from Watson ParticipantPurchases. Only rows that carry purchases open it. The side panel sits at z-index 1001 — above the
   * CDK overlay layer (1000) — so this is a fixed card at 1002 placed beside the
   * panel, level with the row; with no room beside it (phones) it drops below.
   */
  showPlanTip(row: any, el: HTMLElement): void {
    this.keepPlanTip();
    if (!row?.planPurchases?.length || !el) { this.planTipRow = null; return; }
    const r = el.getBoundingClientRect();
    const panel = (el.closest('.eod-panel') as HTMLElement | null)?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipMax = 360;   // matches .eod-plan-tip max-height + head/foot
    const roomLeft = panel ? panel.left : r.left;
    this.planTipStyle = roomLeft >= 320
      ? { top: Math.max(8, Math.min(r.top, vh - tipMax - 8)) + 'px', right: (vw - roomLeft + 10) + 'px' }
      : { top: Math.max(8, Math.min(r.bottom + 6, vh - tipMax - 8)) + 'px', left: '12px', right: '12px' };
    this.planTipRow = row;
  }

  /** Pointer moved onto the card (to scroll it) — cancel the pending close. */
  keepPlanTip(): void {
    if (this.planTipTimer) { clearTimeout(this.planTipTimer); this.planTipTimer = null; }
  }

  /** Close after a short grace, so the pointer can travel from the row onto the card. */
  hidePlanTip(): void {
    this.keepPlanTip();
    this.planTipTimer = setTimeout(() => { this.planTipRow = null; this.planTipTimer = null; }, 140);
  }

  // B!G Participants lives in its own section (operator 2026-10-13). The
  // `cards` array stays whole so loading, panels and live updates are shared.
  get userCards(): OpsCard[] { return this.cards.filter(c => c.key !== 'big-participants'); }
  get bigCards(): OpsCard[] { return this.cards.filter(c => c.key === 'big-participants'); }

  /** The Users cards load from two different listeners. */
  cardLoading(card: OpsCard): boolean {
    if (card.key === 'big-participants') return this.pmLoading;
    if (card.key === 'masterclass-purchase') return this.mcLoading;
    return this.loading;
  }

  /**
   * B!G Participants: filtered from the SAME participant metadata listener
   * that feeds the profile directory — no extra Firestore query.
   */
  private updateBigParticipantsCard(): void {
    const card = this.cards.find(c => c.key === 'big-participants');
    if (!card) return;
    const rows: any[] = [];
    const perJourney = new Map<string, number>();
    this.pmMap.forEach((docData, id) => {
      if (this.bigJourneyIds.has(docData.activejourney)) {
        perJourney.set(docData.activejourney, (perJourney.get(docData.activejourney) || 0) + 1);
        rows.push({
          ...docData, id,
          initialsLabel: this.initials(docData.name),
          journeyTag: this.journeyName(docData.activejourney)
        });
      }
    });
    rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    card.users = rows;
    card.breakdown = this.bigJourneyIdList.map(id => ({
      label: this.journeyName(id),
      count: perJourney.get(id) || 0
    }));
    this.animateCount(card, rows.length);
    if (this.activePanel?.kind === 'users' && this.activePanel.cardKey === card.key) {
      this.setPanelRows(this.activePanel, rows);
      this.activePanel.loading = false;
    }
  }

  openPanel(card: OpsCard): void {
    const panel: PanelState = {
      kind: 'users',
      cardKey: card.key,
      title: card.title,
      caption: card.caption,
      icon: card.icon,
      accent: card.accent,
      count: card.users.length,
      loading: this.cardLoading(card),
      error: false,
      emptyText: card.emptyText,
      q: '',
      cohort: 'all',
      sortKey: 'default',
      sortOptions: ['default', 'name'],
      sortOpen: false,
      showCohort: false,
      journeyFilter: 'all',
      journeyOptions: [],
      viewRows: [],
      rows: []
    };
    this.activePanel = panel;
    this.setPanelRows(panel, card.users);
    this.lockScroll();
  }

  // ==================== Engagement (shared range) ====================

  setEngRange(key: 'today' | '7d' | '30d'): void {
    this.engRange = key;
    this.engCustomStart = '';
    this.engCustomEnd = '';
    this.fetchEngagement();
  }

  /** Both pickers set -> switch to the manual range. */
  applyEngCustom(): void {
    if (!this.engCustomStart || !this.engCustomEnd) return;
    this.engRange = 'custom';
    this.fetchEngagement();
  }

  /** Retry keeps keyboard focus in the section (the button it sat on unmounts). */
  retryEngagement(): void {
    this.engSection?.nativeElement.focus();
    this.fetchEngagement();
  }

  private engBounds(): { start: Date; end: Date } {
    const start = new Date();
    const end = new Date();
    if (this.engRange === 'custom' && this.engCustomStart && this.engCustomEnd) {
      const s = this.parseDateInput(this.engCustomStart);
      const e = this.parseDateInput(this.engCustomEnd);
      // Tolerate a reversed pick — use the earlier date as the start.
      start.setTime(Math.min(s.getTime(), e.getTime()));
      end.setTime(Math.max(s.getTime(), e.getTime()));
    } else if (this.engRange === '7d') {
      start.setDate(start.getDate() - 7);
    } else if (this.engRange === '30d') {
      start.setDate(start.getDate() - 30);
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  /** 'yyyy-MM-dd' -> local-midnight Date (avoids the UTC shift of new Date(str)). */
  private parseDateInput(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /**
   * ONE 'content analytics' range query feeds the WHOLE Engagement section:
   * total watch hours, the cohort split, unique viewers, the trend, the Top
   * Performing Content ranking — and, on Today, the hot-leads snapshot and
   * the day's register page.
   */
  async fetchEngagement(): Promise<void> {
    // A cleared custom picker leaves engRange 'custom' with no bounds —
    // fall back to Today (mirrors the Clear button) instead of throwing.
    if (this.engRange === 'custom' && (!this.engCustomStart || !this.engCustomEnd)) {
      this.engRange = 'today';
    }
    const token = ++this.engFetchToken;
    const hotTokenAtStart = this.hotFetchToken;
    this.engLoading = true;
    this.engError = false;
    try {
      const { start, end } = this.engBounds();
      this.engRangeLabel = this.formatRange(start, end);
      // Server-side: logdate range only (automatic single-field index — no
      // composite index needed). The eiflix type filter runs client-side.
      const snap = await getDocs(query(
        collection(this.firestore, 'content analytics'),
        where('logdate', '>', Timestamp.fromDate(start)),
        where('logdate', '<', Timestamp.fromDate(end))
      ));
      // Cohort + title classification needs the directories.
      await Promise.all([this.pmReady, this.nudReady, this.epReady]);
      if (token !== this.engFetchToken) return; // a newer range superseded this fetch

      let totalSeconds = 0;
      let pmSeconds = 0, nudSeconds = 0, unknownSeconds = 0;
      const pmIds = new Set<string>(), nudIds = new Set<string>(), unknownIds = new Set<string>();
      const ids = new Set<string>();
      const perVideo = new Map<string, number>();
      const perProfile = new Map<string, { seconds: number; videos: Map<string, number> }>();
      const perPlatform = new Map<string, Record<string, number>>();

      // Trend buckets: hourly when the range is a single day, else daily.
      const hourMs = 3600000, dayMs = 86400000;
      const hourly = end.getTime() - start.getTime() <= dayMs;
      const bucketMs = hourly ? hourMs : dayMs;
      const bucketCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / bucketMs));
      const nudB = new Array(bucketCount).fill(0);
      const pmB = new Array(bucketCount).fill(0);

      snap.forEach(d => {
        const data: any = d.data();
        if (data.type !== 'eiflix' && data.type !== 'eiflixcontent') return;
        const seconds = Number(data.totaltimespend) || 0;
        totalSeconds += seconds;
        const logAt = this.toDate(data.logdate);
        const bucket = logAt
          ? Math.min(bucketCount - 1, Math.max(0, Math.floor((logAt.getTime() - start.getTime()) / bucketMs)))
          : -1;
        const pid = data.profileid;
        if (pid && this.isValidProfileId(pid)) {
          ids.add(pid);
          let stats = perProfile.get(pid);
          if (!stats) { stats = { seconds: 0, videos: new Map() }; perProfile.set(pid, stats); }
          stats.seconds += seconds;
          if (data.videoid) stats.videos.set(data.videoid, (stats.videos.get(data.videoid) || 0) + seconds);
          const platKey = this.platformKey(data.platform_name);
          let plat = perPlatform.get(platKey);
          if (!plat) { plat = Object.create(null) as Record<string, number>; perPlatform.set(platKey, plat); }
          plat[pid] = (plat[pid] || 0) + seconds;
          // Existing = participant metadata, or new_user_data already moved to existing.
          if (this.pmMap.has(pid) || (this.nudMap.has(pid) && !this.isNewUserProfile(pid))) {
            pmSeconds += seconds; pmIds.add(pid);
            if (bucket >= 0) pmB[bucket] += seconds;
          } else if (this.nudMap.has(pid)) {
            nudSeconds += seconds; nudIds.add(pid);
            if (bucket >= 0) nudB[bucket] += seconds;
          } else { unknownSeconds += seconds; unknownIds.add(pid); }
        } else {
          unknownSeconds += seconds;
        }
        if (data.videoid) {
          perVideo.set(data.videoid, (perVideo.get(data.videoid) || 0) + seconds);
        }
      });

      this.engTotalSeconds = totalSeconds;
      this.engUniqueIds = [...ids];
      this.engPmSeconds = pmSeconds;
      this.engNudSeconds = nudSeconds;
      this.engUnknownSeconds = unknownSeconds;
      this.engPmViewers = pmIds.size;
      this.engNudViewers = nudIds.size;
      this.engUnknownViewers = unknownIds.size;
      this.engPmViewerIds = [...pmIds];
      this.engNudViewerIds = [...nudIds];
      this.engProfileStats = perProfile;

      this.engTrendBuckets = Array.from({ length: bucketCount }, (_, i) => ({
        label: formatDate(new Date(start.getTime() + i * bucketMs), hourly ? 'h a' : 'MMM d', 'en-US'),
        nud: nudB[i] / 3600,
        pm: pmB[i] / 3600
      }));
      this.engTrendHover = null;
      this.buildTrendPaths();

      const top = [...perVideo.entries()].sort((a, b) => b[1] - a[1]);
      const max = top.length ? top[0][1] : 0;
      this.engContentAll = top.map(([videoid, seconds]) => {
        const ep = this.epMap.get(videoid);
        return {
          videoid,
          title: ep?.title || 'Unknown content',
          seconds,
          hours: seconds / 3600,
          pct: max ? Math.max(2, Math.round((seconds / max) * 100)) : 0
        };
      });
      this.engContentPage = 0;

      if (this.engRange === 'today') {
        this.writeTodayRegisterPage(perProfile, perPlatform);
      }
      // The default Today snapshot doubles as the Hot Leads source — a new
      // variable, frozen while the operator explores other ranges, and left
      // alone entirely while a custom hot range is configured.
      if (this.engRange === 'today' && this.hotMode === 'today' && this.hotFetchToken === hotTokenAtStart) {
        this.hotStats = perProfile;
        this.computeHotLeads();
      } else if (this.hotMode === 'today' && this.hotLoading && this.hotFetchToken === hotTokenAtStart) {
        // The Today fetch that was going to seed hot leads got superseded —
        // give hot its own completion path so the card never hangs.
        this.fetchHotLeads();
      }

      this.engLoading = false;
      // A range change while the viewers panel is open refreshes it in place
      // (rows swap under the existing search/filter/sort — no ghost flash).
      if (this.activePanel?.kind === 'viewers') {
        this.refreshViewersPanel();
      }
    } catch (err) {
      if (token !== this.engFetchToken) return;
      console.error('eiflixoperationsdashboard: content analytics load failed', err);
      this.engLoading = false;
      this.engError = true;
      if (this.hotMode === 'today' && this.hotLoading && this.hotFetchToken === hotTokenAtStart) {
        if (this.engRange === 'today') {
          this.hotLoading = false;
          this.hotError = true;
        } else {
          this.fetchHotLeads();
        }
      }
    }
  }

  // ==================== trend graph ====================

  /** Normalized points -> smooth cubic path (catmull-rom) + gradient area. */
  private buildTrendPaths(): void {
    const H = 32, PAD_T = 3, PAD_B = 1.5;
    const n = this.engTrendBuckets.length;
    const max = Math.max(1e-9, ...this.engTrendBuckets.map(b => Math.max(b.nud, b.pm)));
    const toPts = (sel: (b: { nud: number; pm: number }) => number) =>
      this.engTrendBuckets.map((b, i) => ({
        x: n === 1 ? 50 : (i / (n - 1)) * 100,
        y: H - PAD_B - (sel(b) / max) * (H - PAD_T - PAD_B)
      }));
    const nudPts = toPts(b => b.nud);
    const pmPts = toPts(b => b.pm);
    this.engTrendNudLine = this.smoothPath(nudPts);
    this.engTrendPmLine = this.smoothPath(pmPts);
    this.engTrendNudArea = this.areaPath(nudPts, H);
    this.engTrendPmArea = this.areaPath(pmPts, H);
  }

  private smoothPath(pts: { x: number; y: number }[]): string {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M0,' + pts[0].y.toFixed(2) + ' L100,' + pts[0].y.toFixed(2);
    let d = 'M' + pts[0].x.toFixed(2) + ',' + pts[0].y.toFixed(2);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2)
        + ' ' + p2.x.toFixed(2) + ',' + p2.y.toFixed(2);
    }
    return d;
  }

  private areaPath(pts: { x: number; y: number }[], height: number): string {
    if (!pts.length) return '';
    const line = this.smoothPath(pts);
    const first = pts[0], last = pts[pts.length - 1];
    return line + ' L' + (pts.length === 1 ? '100' : last.x.toFixed(2)) + ',' + height
      + ' L' + (pts.length === 1 ? '0' : first.x.toFixed(2)) + ',' + height + ' Z';
  }

  onTrendMove(event: MouseEvent): void {
    const n = this.engTrendBuckets.length;
    if (!n) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const i = Math.round(frac * (n - 1));
    const x = n === 1 ? 50 : (i / (n - 1)) * 100;
    const b = this.engTrendBuckets[i];
    this.engTrendHover = {
      i, x,
      tipX: Math.min(84, Math.max(16, x)),
      label: b.label, nud: b.nud, pm: b.pm
    };
  }

  onTrendLeave(): void {
    this.engTrendHover = null;
  }

  nextContentPage(): void {
    if (this.engContentHasNext) this.engContentPage++;
  }

  prevContentPage(): void {
    if (this.engContentHasPrev) this.engContentPage--;
  }

  // ==================== 🔥 Hot Leads ====================

  /** Threshold + range settings via the shared dashboard dialog service. */
  async openHotSettings(): Promise<void> {
    const result = await this.eodDialog.open({
      title: 'Hot Leads Settings',
      subtitle: 'Who counts as a hot lead',
      icon: 'local_fire_department',
      accent: 'rose',
      submitLabel: 'Apply',
      fields: [
        {
          key: 'hours', label: 'Minimum watch hours', type: 'number',
          value: this.hotThresholdHours, min: 0.25, step: 0.25, required: true,
          suffix: 'h', hint: 'Profiles watching more than this total count as hot leads'
        },
        { key: 'from', label: 'From', type: 'date', value: this.hotMode === 'custom' ? this.hotFrom : this.todayStr, max: this.todayStr },
        { key: 'to', label: 'To', type: 'date', value: this.hotMode === 'custom' ? this.hotTo : this.todayStr, max: this.todayStr }
      ],
      validate: v => (v['from'] && v['to'] && v['from'] > v['to']) ? 'From must be on or before To' : null
    });
    if (!result) return;
    this.hotThresholdHours = Math.max(0.25, Number(result['hours']) || 3);
    let from = (result['from'] as string) || this.todayStr;
    let to = (result['to'] as string) || this.todayStr;
    if (from > to) [from, to] = [to, from];
    const isToday = from === this.todayStr && to === this.todayStr;
    const rangeUnchanged = isToday
      ? this.hotMode === 'today'
      : this.hotMode === 'custom' && this.hotFrom === from && this.hotTo === to;
    this.hotMode = isToday ? 'today' : 'custom';
    this.hotFrom = isToday ? '' : from;
    this.hotTo = isToday ? '' : to;
    if (rangeUnchanged && !this.hotError && !this.hotLoading) {
      this.computeHotLeads(); // threshold-only change — no query needed
    } else {
      this.fetchHotLeads();
    }
  }

  retryHot(): void {
    if (this.hotMode === 'today' && this.engRange === 'today') {
      this.hotLoading = true;
      this.hotError = false;
      this.fetchEngagement(); // repopulates engagement AND the hot snapshot
    } else {
      this.fetchHotLeads();
    }
  }

  private hotBounds(): { start: Date; end: Date } {
    const start = new Date();
    const end = new Date();
    if (this.hotMode === 'custom' && this.hotFrom && this.hotTo) {
      const s = this.parseDateInput(this.hotFrom);
      const e = this.parseDateInput(this.hotTo);
      start.setTime(Math.min(s.getTime(), e.getTime()));
      end.setTime(Math.max(s.getTime(), e.getTime()));
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  /** Dedicated hot-leads fetch — only used when the operator configures a
   *  range the engagement Today snapshot can't serve. */
  private async fetchHotLeads(): Promise<void> {
    const token = ++this.hotFetchToken;
    this.hotLoading = true;
    this.hotError = false;
    try {
      const { start, end } = this.hotBounds();
      const snap = await getDocs(query(
        collection(this.firestore, 'content analytics'),
        where('logdate', '>', Timestamp.fromDate(start)),
        where('logdate', '<', Timestamp.fromDate(end))
      ));
      if (token !== this.hotFetchToken) return;
      const perProfile = new Map<string, { seconds: number; videos: Map<string, number> }>();
      snap.forEach(d => {
        const data: any = d.data();
        if (data.type !== 'eiflix' && data.type !== 'eiflixcontent') return;
        const pid = data.profileid;
        if (!pid || !this.isValidProfileId(pid)) return;
        const seconds = Number(data.totaltimespend) || 0;
        let stats = perProfile.get(pid);
        if (!stats) { stats = { seconds: 0, videos: new Map() }; perProfile.set(pid, stats); }
        stats.seconds += seconds;
        if (data.videoid) stats.videos.set(data.videoid, (stats.videos.get(data.videoid) || 0) + seconds);
      });
      this.hotStats = perProfile;
      this.computeHotLeads();
    } catch (err) {
      if (token !== this.hotFetchToken) return;
      console.error('eiflixoperationsdashboard: hot leads load failed', err);
      this.hotLoading = false;
      this.hotError = true;
    }
  }

  /** Apply the current threshold to hotStats and refresh dependent UI. */
  private computeHotLeads(): void {
    this.hotLeadIds = [...this.hotStats.entries()]
      .filter(([, st]) => st.seconds > this.hotThresholdHours * 3600)
      .map(([id]) => id);
    const { start, end } = this.hotBounds();
    this.hotRangeLabel = this.hotMode === 'today' ? 'today' : this.formatRange(start, end);
    this.hotLoading = false;
    this.hotError = false;
    if (this.activePanel?.kind === 'hotleads') this.refreshHotLeadsPanel();
  }

  private async buildHotLeadsRows(): Promise<any[]> {
    return this.withStats(await this.resolveProfiles(this.hotLeadIds), this.hotStats)
      .map(row => ({
        ...row,
        expandable: true,
        expanded: false,
        videos: [...(this.hotStats.get(row.id)?.videos || new Map<string, number>()).entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([videoid, seconds]) => ({
            videoid,
            title: this.epMap.get(videoid)?.title || 'Unknown content',
            hours: seconds / 3600
          }))
      }))
      .sort((a, b) => (this.hotStats.get(b.id)?.seconds || 0) - (this.hotStats.get(a.id)?.seconds || 0));
  }

  /** Swap rows under the open hot-leads panel, keeping search/filter/sort. */
  private async refreshHotLeadsPanel(): Promise<void> {
    const panel = this.activePanel;
    if (!panel || panel.kind !== 'hotleads') return;
    panel.title = this.hotTitle;
    panel.caption = this.hotSub;
    panel.emptyText = this.hotMode === 'today' ? 'No hot leads yet today.' : 'No hot leads in this range.';
    try {
      const rows = await this.buildHotLeadsRows();
      if (this.activePanel !== panel) return;
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: hot leads refresh failed', err);
    }
  }

  // ==================== viewers / hot-leads panels ====================

  private viewersMeta(scope: 'all' | 'nud' | 'pm') {
    return {
      all: { ids: this.engUniqueIds, title: 'Unique Viewers', icon: 'movie', accent: 'amber' as Accent },
      nud: { ids: this.engNudViewerIds, title: 'New Users · Viewers', icon: 'person_add', accent: 'indigo' as Accent },
      pm: { ids: this.engPmViewerIds, title: 'Participants · Viewers', icon: 'groups', accent: 'emerald' as Accent }
    }[scope];
  }

  private async buildViewersRows(scope: 'all' | 'nud' | 'pm'): Promise<any[]> {
    return this.withStats(await this.resolveProfiles(this.viewersMeta(scope).ids), this.engProfileStats);
  }

  /** Swap rows under the open viewers panel, keeping search/filter/sort. */
  private async refreshViewersPanel(): Promise<void> {
    const panel = this.activePanel;
    if (!panel || panel.kind !== 'viewers') return;
    const scope = (panel.cardKey as 'all' | 'nud' | 'pm') || 'all';
    panel.caption = 'EiFlix watch activity · ' + this.engRangeLabel;
    try {
      const rows = await this.buildViewersRows(scope);
      if (this.activePanel !== panel) return;
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: viewers refresh failed', err);
    }
  }

  async openViewersPanel(scope: 'all' | 'nud' | 'pm' = 'all'): Promise<void> {
    const meta = this.viewersMeta(scope);
    const panel: PanelState = {
      kind: 'viewers',
      cardKey: scope,
      title: meta.title,
      caption: 'EiFlix watch activity · ' + this.engRangeLabel,
      icon: meta.icon,
      accent: meta.accent,
      count: meta.ids.length,
      loading: true,
      error: false,
      emptyText: 'No viewers in this range.',
      q: '',
      cohort: 'all',
      sortKey: 'default',
      sortOptions: ['default', 'name'],
      sortOpen: false,
      showCohort: false,
      journeyFilter: 'all',
      journeyOptions: [],
      viewRows: [],
      rows: []
    };
    this.activePanel = panel;
    this.lockScroll();
    try {
      const rows = await this.buildViewersRows(scope);
      if (this.activePanel !== panel) return; // closed or superseded meanwhile
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: profile resolution failed', err);
      if (this.activePanel !== panel) return;
      panel.loading = false;
      panel.error = true;
    }
  }

  /** 🔥 Hot leads: watchers over the configured threshold, sorted by watch
   *  time, rows expandable to the videos that profile watched. */
  async openHotLeadsPanel(): Promise<void> {
    const panel: PanelState = {
      kind: 'hotleads',
      title: this.hotTitle,
      caption: this.hotSub,
      icon: 'local_fire_department',
      accent: 'rose',
      count: this.hotLeadIds.length,
      loading: true,
      error: false,
      emptyText: this.hotMode === 'today' ? 'No hot leads yet today.' : 'No hot leads in this range.',
      q: '',
      cohort: 'all',
      sortKey: 'default',
      sortOptions: ['default', 'name'],
      sortOpen: false,
      showCohort: false,
      journeyFilter: 'all',
      journeyOptions: [],
      viewRows: [],
      rows: []
    };
    this.activePanel = panel;
    this.lockScroll();
    try {
      const rows = await this.buildHotLeadsRows();
      if (this.activePanel !== panel) return;
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: hot leads resolution failed', err);
      if (this.activePanel !== panel) return;
      panel.loading = false;
      panel.error = true;
    }
  }

  /** Attach per-row watch-hours (label + sortable seconds) from a stats map. */
  private withStats(rows: any[], stats: Map<string, { seconds: number }>): any[] {
    return rows.map(row => {
      const st = stats.get(row.id);
      return st
        ? { ...row, hoursSeconds: st.seconds, hoursLabel: (st.seconds / 3600).toFixed(1) + 'h' }
        : row;
    });
  }

  /**
   * profileid -> full profile doc, entirely from the in-memory directory.
   * 'participant metadata' is PRIMARY; ids found only in new_user_data carry the
   * 'New User' tag unless moved to existing; leftovers render as unknown.
   */
  private async resolveProfiles(ids: string[]): Promise<any[]> {
    await Promise.all([this.pmReady, this.nudReady]);
    return ids
      .map(id => {
        const pm = this.pmMap.get(id);
        if (pm) return { ...pm, id, initialsLabel: this.initials(pm.name), journeyTag: this.journeyTagFor(pm) };
        const nud = this.nudMap.get(id);
        // A moved-to-existing doc is not a New User (no tag -> "Existing" in filters and export).
        if (nud) return { ...nud, id, initialsLabel: this.initials(nud.name), ...(this.isNewUserProfile(id) ? { sourceTag: 'New User' } : {}) };
        return { id, name: 'Unknown profile', email: id, phonenumber: '—', initialsLabel: '?', unknown: true };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  // ==================== Non-Active Users ====================

  private dayKey(d: Date): string {
    return formatDate(d, 'yyyy-MM-dd', 'en-US');
  }

  private daysBetween(later: Date, earlier: Date): number {
    const a = new Date(later); a.setHours(0, 0, 0, 0);
    const b = new Date(earlier); b.setHours(0, 0, 0, 0);
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  /** Load the register window (one query — only existing pages return). */
  async loadNaRegister(): Promise<void> {
    const token = ++this.naToken;
    this.naLoading = true;
    this.naError = false;
    try {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const snap = await getDocs(query(
        collection(this.firestore, 'eiflixdailywatchers'),
        where(documentId(), '>=', this.dayKey(since)),
        where(documentId(), '<=', this.todayStr)
      ));
      if (token !== this.naToken) return;
      this.naPages.clear();
      snap.forEach(d => this.naPages.set(d.id, d.data()));
      const keys = [...this.naPages.keys()].sort();
      this.naRegisterSince = keys[0] || null;
      await this.healRegisterGaps(token);
      if (token !== this.naToken) return;
      await Promise.all([this.pmReady, this.nudReady]);
      if (token !== this.naToken) return;
      this.computeNonActive();
      this.naLoading = false;
    } catch (err) {
      if (token !== this.naToken) return;
      console.error('eiflixoperationsdashboard: eiflixdailywatchers load failed', err);
      this.naLoading = false;
      this.naError = true;
    }
  }

  /**
   * Rebuild missing/partial pages for up to the last 7 days — but never a
   * day before the register began (operator: no historical backfill).
   */
  private async healRegisterGaps(token: number): Promise<void> {
    if (!this.naRegisterSince) return;
    const sinceDate = this.parseDateInput(this.naRegisterSince);
    for (let back = 7; back >= 1; back--) {
      const day = new Date();
      day.setDate(day.getDate() - back);
      if (day.getTime() < sinceDate.getTime()) continue;
      const key = this.dayKey(day);
      const page = this.naPages.get(key);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      const builtAt = page ? this.toDate(page.builtAt) : null;
      const finalPage = !!builtAt && builtAt.getTime() > dayEnd.getTime();
      if (page && finalPage && page.platforms) continue;
      await this.buildRegisterPage(day);
      if (token !== this.naToken) return;
    }
  }

  /** Query ONE day of content analytics and persist its register page. */
  private async buildRegisterPage(day: Date): Promise<void> {
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 59, 999);
    const snap = await getDocs(query(
      collection(this.firestore, 'content analytics'),
      where('logdate', '>', Timestamp.fromDate(start)),
      where('logdate', '<', Timestamp.fromDate(end))
    ));
    const profileids: Record<string, number> = Object.create(null);
    const platforms: Record<string, Record<string, number>> = Object.create(null);
    snap.forEach(d => {
      const data: any = d.data();
      if (data.type !== 'eiflix' && data.type !== 'eiflixcontent') return;
      if (!this.isValidProfileId(data.profileid)) return;
      const seconds = Number(data.totaltimespend) || 0;
      profileids[data.profileid] = (profileids[data.profileid] || 0) + seconds;
      const platKey = this.platformKey(data.platform_name);
      if (!platforms[platKey]) platforms[platKey] = Object.create(null);
      platforms[platKey][data.profileid] = (platforms[platKey][data.profileid] || 0) + seconds;
    });
    const key = this.dayKey(day);
    await setDoc(doc(this.firestore, 'eiflixdailywatchers', key), { profileids, platforms, builtAt: serverTimestamp() });
    this.naPages.set(key, { profileids, platforms, builtAt: Timestamp.fromDate(new Date()) });
  }

  /**
   * Today's page falls out of the Today engagement fetch we already run —
   * zero extra reads. Fire-and-forget; local map updates regardless so the
   * buckets always see today's watchers.
   */
  private writeTodayRegisterPage(
    perProfile: Map<string, { seconds: number }>,
    perPlatform: Map<string, Record<string, number>>
  ): void {
    const profileids: Record<string, number> = Object.create(null);
    perProfile.forEach((st, id) => { profileids[id] = st.seconds; });
    const platforms: Record<string, Record<string, number>> = Object.create(null);
    perPlatform.forEach((byProfile, name) => { platforms[name] = byProfile; });
    const key = this.todayStr;
    this.naPages.set(key, { profileids, platforms, builtAt: Timestamp.fromDate(new Date()) });
    if (!this.naRegisterSince || key < this.naRegisterSince) this.naRegisterSince = key;
    setDoc(doc(this.firestore, 'eiflixdailywatchers', key), { profileids, platforms, builtAt: serverTimestamp() })
      .catch(err => console.error('eiflixoperationsdashboard: today register write failed', err));
    if (!this.naLoading) this.computeNonActive();
  }

  /** Buckets from the register + the directories already in memory. */
  private computeNonActive(): void {
    const today = new Date();
    const coverageDays = this.naRegisterSince
      ? this.daysBetween(today, this.parseDateInput(this.naRegisterSince))
      : 0;
    // profileid -> last day present in the register
    const lastSeen = new Map<string, string>();
    this.naPages.forEach((page, key) => {
      for (const id of Object.keys(page?.profileids || {})) {
        const prev = lastSeen.get(id);
        if (!prev || key > prev) lastSeen.set(id, key);
      }
    });
    for (const bucket of this.naBuckets) {
      bucket.ids = [];
      bucket.total = 0;
      bucket.nudCount = 0;
      bucket.pmCount = 0;
    }
    const assign = (id: string, isNud: boolean, ageDays: number | null) => {
      const seen = lastSeen.get(id) || null;
      // Never-seen: inactive since tracking began, but never longer than the
      // account has existed — a 40-day-old signup is 40 days inactive, not 90.
      const daysSince = seen
        ? this.daysBetween(today, this.parseDateInput(seen))
        : (ageDays !== null ? Math.min(coverageDays, ageDays) : coverageDays);
      for (let i = this.naBuckets.length - 1; i >= 0; i--) {
        const bucket = this.naBuckets[i];
        const upper = i < this.naBuckets.length - 1 ? this.naBuckets[i + 1].days : Infinity;
        if (daysSince < bucket.days || daysSince >= upper) continue;
        if (ageDays !== null && ageDays < bucket.days) continue; // too new to be inactive
        bucket.ids.push({ id, lastSeen: seen, isNud });
        bucket.total++;
        if (isNud) bucket.nudCount++; else bucket.pmCount++;
        break;
      }
    };
    this.pmMap.forEach((pmDoc, id) => {
      if (!this.isEligibleParticipant(pmDoc)) return;
      assign(id, false, null);
    });
    this.nudMap.forEach((nudDoc, id) => {
      if (this.pmMap.has(id)) return; // participant metadata is primary
      const created = this.toDate(nudDoc.created);
      // movedtoexist == true: still a user, but an existing one — never counted as new.
      assign(id, this.isNewUserProfile(id), created ? this.daysBetween(today, created) : null);
    });
    this.naAsOf = new Date();
    this.computeDeviceBreakdown();
    // Refresh an open non-active panel in place (keeps search/filter/sort).
    if (this.activePanel?.kind === 'nonactive') {
      this.refreshNonActivePanel();
    }
  }

  private nonActiveEntries(bucket: (typeof this.naBuckets)[number], scope: 'all' | 'nud' | 'pm') {
    return scope === 'all'
      ? bucket.ids
      : bucket.ids.filter(e => (scope === 'nud' ? e.isNud : !e.isNud));
  }

  private async buildNonActiveRows(
    bucket: (typeof this.naBuckets)[number],
    scope: 'all' | 'nud' | 'pm'
  ): Promise<any[]> {
    const entries = this.nonActiveEntries(bucket, scope);
    const lastSeenById = new Map(entries.map(e => [e.id, e.lastSeen]));
    return (await this.resolveProfiles(entries.map(e => e.id)))
      .map(row => {
        const seen = lastSeenById.get(row.id) || null;
        return {
          ...row,
          lastSeenLabel: seen
            ? 'Last seen ' + formatDate(this.parseDateInput(seen), 'MMM d, y', 'en-US')
            : 'Not seen since tracking began'
        };
      })
      .sort((a, b) => (lastSeenById.get(b.id) || '').localeCompare(lastSeenById.get(a.id) || ''));
  }

  private async refreshNonActivePanel(): Promise<void> {
    const panel = this.activePanel;
    if (!panel || panel.kind !== 'nonactive') return;
    const [bucketKey, scopeRaw] = (panel.cardKey || '').split(':');
    const bucket = this.naBuckets.find(b => b.key === bucketKey);
    if (!bucket) return;
    const scope = (scopeRaw as 'all' | 'nud' | 'pm') || 'all';
    try {
      const rows = await this.buildNonActiveRows(bucket, scope);
      if (this.activePanel !== panel) return;
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: non-active refresh failed', err);
    }
  }

  /**
   * Non-Active eligibility (operator rule): a participant is only checked
   * when customerstatus is 'active' AND firebaseuserref carries a value —
   * cancelled customers and profiles without an app account are not
   * "inactive", they were never expected to watch.
   */
  private isEligibleParticipant(pmDoc: any): boolean {
    const status = (pmDoc?.customerstatus ?? '').toString().trim().toLowerCase();
    if (status !== 'active') return false;
    const ref = pmDoc?.firebaseuserref;
    if (ref === null || ref === undefined) return false;
    if (typeof ref === 'string') return ref.trim() !== '';
    return true; // non-null object (e.g. a document reference) is a value
  }

  async openNonActivePanel(
    bucket: (typeof this.naBuckets)[number],
    scope: 'all' | 'nud' | 'pm' = 'all'
  ): Promise<void> {
    const entries = this.nonActiveEntries(bucket, scope);
    const scopeTitle = scope === 'nud' ? ' · New Users' : scope === 'pm' ? ' · Participants' : '';
    const panel: PanelState = {
      kind: 'nonactive',
      cardKey: bucket.key + ':' + scope,
      title: bucket.title + scopeTitle,
      caption: bucket.caption + ' · tracking since ' +
        (this.naRegisterSince ? formatDate(this.parseDateInput(this.naRegisterSince), 'MMM d', 'en-US') : 'today'),
      icon: bucket.icon,
      accent: bucket.accent,
      count: entries.length,
      loading: true,
      error: false,
      emptyText: 'Nobody in this bucket — good sign.',
      q: '',
      cohort: 'all',
      sortKey: 'default',
      sortOptions: ['default', 'name'],
      sortOpen: false,
      showCohort: false,
      journeyFilter: 'all',
      journeyOptions: [],
      viewRows: [],
      rows: []
    };
    this.activePanel = panel;
    this.lockScroll();
    try {
      const rows = await this.buildNonActiveRows(bucket, scope);
      if (this.activePanel !== panel) return;
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: non-active resolution failed', err);
      if (this.activePanel !== panel) return;
      panel.loading = false;
      panel.error = true;
    }
  }

  // ==================== Device Breakdown ====================

  /** EXACT stored key -> display label. Named mappings; rest shown as-is. */
  platformLabel(key: string): string {
    if (key === 'Eiflixweb') return 'EiFlix Web';
    if (key === 'eiflixapp') return 'EiFlix App';
    if (key === 'breakthroughsapp') return 'Breakthroughs App';
    return key;
  }

  /** Same normalization the backfill script uses when writing pages.
   *  Reserved JS/Firestore names ('__proto__', '__x__', constructor…) are
   *  prefixed — they would pollute Object.prototype or be rejected as
   *  Firestore field names. */
  private platformKey(raw: any): string {
    const name = (raw ?? '').toString().trim();
    if (!name) return 'breakthroughsapp';
    const safe = name.replace(/[.\/]/g, '_');
    if (/^__.*__$/.test(safe) || safe === 'constructor' || safe === 'prototype') {
      return 'x_' + safe;
    }
    return safe;
  }

  /** Client-writable profileids: reject values Firestore forbids as field
   *  names (and that would pollute prototypes as object keys). */
  private isValidProfileId(pid: any): boolean {
    if (typeof pid !== 'string' || !pid) return false;
    return !/^__.*__$/.test(pid) && pid !== 'constructor' && pid !== 'prototype';
  }

  private platformColor(key: string): string {
    if (this.platformColors[key]) return this.platformColors[key];
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return this.platformExtraColors[hash % this.platformExtraColors.length];
  }

  private platformAccent(key: string): Accent {
    if (key === 'Eiflixweb') return 'indigo';
    if (key === 'EiflixMobile') return 'amber';
    if (key === 'breakthroughsapp') return 'emerald';
    return 'violet';
  }

  setDbRange(months: 1 | 2 | 3): void {
    this.dbRange = months;
    this.dbFrom = '';
    this.dbTo = '';
    this.applyDbChange();
  }

  /** Both pickers set -> switch to the manual range (mirrors Engagement / Users). */
  applyDbCustom(): void {
    if (!this.dbFrom || !this.dbTo) return;
    this.dbRange = 'custom';
    this.applyDbChange();
  }

  /** True while exactly one manual date is picked — shows the header hint. */
  get dbCustomHint(): boolean {
    return !!this.dbFrom !== !!this.dbTo;
  }

  /**
   * Earliest day the register holds — the From picker's floor. Device Breakdown
   * is summed from register pages only, so a date before this has no data.
   */
  get dbMinDate(): string {
    return this.naRegisterSince || '';
  }

  /**
   * The window as inclusive register keys. Keys and <input type="date"> values
   * are both 'yyyy-MM-dd', so plain string comparison is a date comparison.
   */
  private dbKeyBounds(): { from: string; to: string } {
    if (this.dbRange === 'custom' && this.dbFrom && this.dbTo) {
      // Tolerate a reversed pick — the earlier date is the start.
      return this.dbFrom <= this.dbTo
        ? { from: this.dbFrom, to: this.dbTo }
        : { from: this.dbTo, to: this.dbFrom };
    }
    const months = this.dbRange === 'custom' ? 1 : this.dbRange;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - months * 30);
    return { from: this.dayKey(cutoff), to: this.dayKey(new Date()) };
  }

  private applyDbChange(): void {
    this.computeDeviceBreakdown();
    // A range change while a platform panel is open refreshes it in place.
    if (this.activePanel?.kind === 'platform' && this.activePanel.cardKey) {
      this.refreshPlatformPanel();
    }
  }

  private platformPerProfile(platform: string): Map<string, number> {
    const { from, to } = this.dbKeyBounds();
    const perProfile = new Map<string, number>();
    this.naPages.forEach((page, key) => {
      if (key < from || key > to) return;
      const byProfile = page?.platforms?.[platform];
      if (!byProfile) return;
      for (const [pid, sec] of Object.entries(byProfile as Record<string, number>)) {
        perProfile.set(pid, (perProfile.get(pid) || 0) + (Number(sec) || 0));
      }
    });
    return perProfile;
  }

  private async buildPlatformRows(platform: string): Promise<any[]> {
    const perProfile = this.platformPerProfile(platform);
    return (await this.resolveProfiles([...perProfile.keys()]))
      .map(row => ({
        ...row,
        hoursSeconds: perProfile.get(row.id) || 0,
        hoursLabel: ((perProfile.get(row.id) || 0) / 3600).toFixed(1) + 'h'
      }))
      .sort((a, b) => (perProfile.get(b.id) || 0) - (perProfile.get(a.id) || 0));
  }

  private async refreshPlatformPanel(): Promise<void> {
    const panel = this.activePanel;
    if (!panel || panel.kind !== 'platform' || !panel.cardKey) return;
    panel.caption = 'Watched on this platform · ' + this.dbRangeLabel;
    try {
      const rows = await this.buildPlatformRows(panel.cardKey);
      if (this.activePanel !== panel) return;
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: platform refresh failed', err);
    }
  }

  /** Share of watch time per platform over the chosen window of register pages. */
  private computeDeviceBreakdown(): void {
    const { from, to } = this.dbKeyBounds();
    const totals = new Map<string, number>();
    this.naPages.forEach((page, key) => {
      if (key < from || key > to) return;
      const plats = page?.platforms;
      if (!plats) return;
      for (const [name, byProfile] of Object.entries(plats)) {
        let sum = totals.get(name) || 0;
        for (const sec of Object.values(byProfile as Record<string, number>)) {
          sum += Number(sec) || 0;
        }
        totals.set(name, sum);
      }
    });
    const totalSeconds = [...totals.values()].reduce((a, b) => a + b, 0);
    this.dbTotalSeconds = totalSeconds;
    let cum = 0;
    this.dbRows = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, seconds]) => {
        const pctExact = totalSeconds ? (seconds / totalSeconds) * 100 : 0;
        const row = {
          key,
          label: this.platformLabel(key),
          seconds,
          hours: seconds / 3600,
          pct: Math.round(pctExact),
          pctExact,
          dashOffset: -cum,
          color: this.platformColor(key)
        };
        cum += pctExact;
        return row;
      });
  }

  /** Viewers of one platform over the selected window, hours-sorted. */
  async openPlatformPanel(platform: string): Promise<void> {
    const perProfile = this.platformPerProfile(platform);
    const panel: PanelState = {
      kind: 'platform',
      cardKey: platform,
      title: this.platformLabel(platform),
      caption: 'Watched on this platform · ' + this.dbRangeLabel,
      icon: 'devices',
      accent: this.platformAccent(platform),
      count: perProfile.size,
      loading: true,
      error: false,
      emptyText: 'No viewers on this platform in this range.',
      q: '',
      cohort: 'all',
      sortKey: 'default',
      sortOptions: ['default', 'name'],
      sortOpen: false,
      showCohort: false,
      journeyFilter: 'all',
      journeyOptions: [],
      viewRows: [],
      rows: []
    };
    this.activePanel = panel;
    this.lockScroll();
    try {
      const rows = await this.buildPlatformRows(platform);
      if (this.activePanel !== panel) return;
      this.setPanelRows(panel, rows);
      panel.loading = false;
    } catch (err) {
      console.error('eiflixoperationsdashboard: platform panel resolution failed', err);
      if (this.activePanel !== panel) return;
      panel.loading = false;
      panel.error = true;
    }
  }

  // ==================== Shared panel v2: search / filter / sort ====================

  /** Set a panel's rows and derive its toolbar capabilities. */
  private setPanelRows(panel: PanelState, rows: any[]): void {
    panel.rows = rows;
    const hasHours = rows.some(r => r.hoursSeconds !== undefined);
    // Amount appears once rows carry a Watson total (New Users to Paid).
    const hasAmount = rows.some(r => typeof r.planValue === 'number');
    panel.sortOptions = ['default', 'name', ...(hasHours ? ['hours' as const] : []), ...(hasAmount ? ['amount' as const] : [])];
    if (!panel.sortOptions.includes(panel.sortKey)) panel.sortKey = 'default';
    const hasNud = rows.some(r => !!r.sourceTag);
    const hasPm = rows.some(r => !r.sourceTag && !r.unknown);
    panel.showCohort = (hasNud && hasPm) || panel.cohort !== 'all';
    panel.journeyOptions = [...new Set(rows.map(r => r.journeyTag).filter(Boolean))].sort() as string[];
    if (panel.journeyFilter !== 'all' && !panel.journeyOptions.includes(panel.journeyFilter)) {
      panel.journeyFilter = 'all';
    }
    this.updatePanelView(panel);
  }

  /** Recompute the visible rows from search + cohort + sort. */
  updatePanelView(panel: PanelState): void {
    const q = panel.q.trim().toLowerCase();
    let rows = panel.rows;
    if (panel.cohort === 'nud') rows = rows.filter(r => !!r.sourceTag);
    else if (panel.cohort === 'pm') rows = rows.filter(r => !r.sourceTag && !r.unknown);
    if (panel.journeyFilter !== 'all') {
      rows = rows.filter(r => r.journeyTag === panel.journeyFilter);
    }
    if (q) {
      rows = rows.filter(r =>
        ((r.name || '') + ' ' + (r.email || '') + ' ' + (r.phonenumber || '')).toLowerCase().includes(q));
    }
    if (panel.sortKey === 'name') {
      rows = [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (panel.sortKey === 'hours') {
      rows = [...rows].sort((a, b) => (b.hoursSeconds || 0) - (a.hoursSeconds || 0));
    } else if (panel.sortKey === 'amount') {
      // Highest total first; people not found in Watson (or still loading) last.
      const v = (r: any) => (typeof r.planValue === 'number' ? r.planValue : -1);
      rows = [...rows].sort((a, b) => v(b) - v(a));
    }
    // Precompute highlight segments once per view change — never per CD cycle.
    panel.viewRows = q
      ? rows.map(r => ({
          ...r,
          hl: {
            name: this.splitMatch(r.name || '—', q),
            email: this.splitMatch(r.email || '—', q),
            phone: this.splitMatch(r.phonenumber || '—', q)
          }
        }))
      : rows;
    panel.count = panel.viewRows.length;
  }

  onPanelSearch(panel: PanelState, value: string): void {
    panel.q = value;
    this.updatePanelView(panel);
  }

  setPanelCohort(panel: PanelState, cohort: 'all' | 'nud' | 'pm'): void {
    panel.cohort = cohort;
    this.updatePanelView(panel);
  }

  /**
   * Export the panel's CURRENTLY SHOWN rows (search/cohort/journey/sort all
   * applied) as an .xlsx — base columns always, extras only when that panel
   * actually displays them.
   */
  exportPanel(panel: PanelState): void {
    const worksheetData = this.panelExportRows(panel);
    if (worksheetData.length < 2) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const maxWidths: number[] = [];
    worksheetData.forEach(row => row.forEach((cell, i) => {
      const len = cell ? String(cell).length : 10;
      maxWidths[i] = Math.max(maxWidths[i] || 10, len);
    }));
    ws['!cols'] = maxWidths.map(w => ({ wch: Math.min(w + 2, 50) }));
    const sheetName = panel.title.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'Export';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const slug = panel.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    XLSX.writeFile(wb, slug + '-' + this.todayStr + '.xlsx');
  }

  /** Header + one line per visible panel row — the sheet exportPanel writes. */
  panelExportRows(panel: PanelState): (string | number)[][] {
    const rows = panel.viewRows;
    if (!rows.length) return [];
    // Amounts go out as NUMBERS so the sheet can be summed: the Watson total
    // (rounded to the rupee, as Journey Support displays it) for New Users to
    // Paid, the payment amount for Master Class Purchase. Blank when unknown.
    const hasPlan = rows.some(r => typeof r.planValue === 'number');
    const hasAmount = !hasPlan && rows.some(r => typeof r.amountValue === 'number');
    const hasHours = rows.some(r => r.hoursSeconds !== undefined || r.hoursLabel);
    const hasLastSeen = rows.some(r => r.lastSeenLabel);
    const hasCreated = rows.some(r => r.createdLabel);
    const hasVideos = rows.some(r => Array.isArray(r.videos));
    // Master Class Purchase rows carry the workshop they paid for (operator 2026-10-17).
    const hasWorkshop = rows.some(r => r.workshopTag);
    const header = ['Name', 'Phone Number', 'Email', 'Journey', 'User Type'];
    if (hasWorkshop) header.push('Workshop');
    if (hasHours) header.push('Watch Hours');
    if (hasVideos) header.push('Videos Watched');
    if (hasLastSeen) header.push('Last Seen');
    if (hasCreated) header.push('Created');
    if (hasPlan) header.push('Total Amount');
    if (hasAmount) header.push('Amount');
    const data = rows.map(r => {
      const line: (string | number)[] = [
        String(r.name ?? ''),
        String(r.phonenumber ?? ''),
        String(r.email ?? ''),
        r.journeyTag || '',
        r.unknown ? 'Unknown' : (r.sourceTag ? 'New User' : 'Existing')
      ];
      if (hasWorkshop) line.push(r.workshopTag || '');
      if (hasHours) line.push(r.hoursSeconds !== undefined ? +(r.hoursSeconds / 3600).toFixed(2) : '');
      if (hasVideos) line.push(Array.isArray(r.videos) ? r.videos.length : '');
      if (hasLastSeen) line.push(r.lastSeenLabel || '');
      if (hasCreated) line.push(r.createdLabel || '');
      if (hasPlan) line.push(typeof r.planValue === 'number' ? Math.round(r.planValue) : '');
      if (hasAmount) line.push(typeof r.amountValue === 'number' ? r.amountValue : '');
      return line;
    });
    return [header, ...data];
  }

  setPanelJourney(panel: PanelState, value: string): void {
    panel.journeyFilter = value || 'all';
    this.updatePanelView(panel);
  }

  setPanelSort(panel: PanelState, key: 'default' | 'name' | 'hours' | 'amount'): void {
    panel.sortKey = key;
    panel.sortOpen = false;
    this.updatePanelView(panel);
  }

  sortLabel(key: 'default' | 'name' | 'hours' | 'amount'): string {
    return key === 'name' ? 'Name A–Z' : key === 'hours' ? 'Watch hours' : key === 'amount' ? 'Amount high–low' : 'Default';
  }

  /** 'Abdul Hakkim' + 'ha' -> ['Abdul ', 'Ha', 'kkim']; no match -> [text, '', ''].
   *  Coerces here — phonenumbers are sometimes stored as numbers. */
  private splitMatch(text: any, q: string): [string, string, string] {
    const str = String(text ?? '—');
    const i = str.toLowerCase().indexOf(q);
    if (i < 0) return [str, '', ''];
    return [str.slice(0, i), str.slice(i, i + q.length), str.slice(i + q.length)];
  }

  // ==================== Shared panel + helpers ====================

  /** Row click: log the profileid (operator request) and toggle expansion
   *  on expandable rows (hot leads -> watched-video list). Expansion is
   *  synced to the backing row in panel.rows so it survives view rebuilds
   *  (search/sort/cohort produce spread copies). */
  onRowClick(panel: PanelState, row: any): void {
    console.log('profileid:', row.id, row);
    if (!row.expandable) return;
    row.expanded = !row.expanded;
    const src = panel.rows.find(r => r.id === row.id);
    if (src && src !== row) src.expanded = row.expanded;
  }

  closePanel(): void {
    this.planTipRow = null;
    this.activePanel = null;
    this.unlockScroll();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: KeyboardEvent): void {
    if (event.defaultPrevented) return; // e.g. MatSelect just closed its dropdown
    if (!this.activePanel) return;
    if (this.activePanel.sortOpen) {
      this.activePanel.sortOpen = false;
      return;
    }
    this.closePanel();
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  private formatCreated(value: any): string {
    const date = this.toDate(value);
    return date ? formatDate(date, 'MMM d, y · h:mm a', 'en-US') : '—';
  }

  private formatRange(start: Date, end: Date): string {
    const sameDay = start.toDateString() === end.toDateString();
    const s = formatDate(start, 'MMM d', 'en-US');
    return sameDay ? s : s + ' – ' + formatDate(end, 'MMM d', 'en-US');
  }

  initials(name: string | undefined | null): string {
    if (!name?.trim()) return '·';
    const parts = name.trim().split(/\s+/);
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  private lockScroll(): void {
    if (typeof document !== 'undefined') document.body.classList.add('eod-scroll-lock');
  }

  private unlockScroll(): void {
    if (typeof document !== 'undefined') document.body.classList.remove('eod-scroll-lock');
  }
}
