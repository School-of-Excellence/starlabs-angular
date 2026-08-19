import { Component, OnDestroy, OnInit, HostListener, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import {
  Firestore, collection, collectionData, getDocs, query, where, documentId, Timestamp,
  doc, setDoc, serverTimestamp
} from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, takeUntil } from 'rxjs';
import { EodDialogService } from './eod-dialog/eod-dialog.service';

type Accent = 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose' | 'orange' | 'red';
type RangeKey = 'today' | '7d' | '30d' | 'custom';

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
  sortKey: 'default' | 'name' | 'hours';
  sortOptions: ('default' | 'name' | 'hours')[];
  sortOpen: boolean;
  showCohort: boolean;
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
  imports: [CommonModule, FormsModule, MatIconModule, A11yModule],
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
      caption: 'Signed up · not yet moved to paid',
      icon: 'person_add',
      accent: 'indigo',
      emptyText: 'No users here yet.',
      users: [],
      displayCount: 0
    },
    {
      key: 'new-users-to-paid',
      title: 'New Users to Paid',
      caption: 'Moved to existing / paid profiles',
      icon: 'workspace_premium',
      accent: 'emerald',
      emptyText: 'No users here yet.',
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
  dbRange: 1 | 2 | 3 = 1;
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
    return this.dbRange === 1 ? 'last 1 month' : 'last ' + this.dbRange + ' months';
  }

  // ==================== lifecycle ====================

  ngOnInit(): void {
    this.nudReady = new Promise<void>(res => (this.nudReadyResolve = res));

    // Single realtime listener over new_user_data: feeds the Users cards
    // AND the profile directory (nudMap) in one query.
    const ref = collection(this.firestore, 'new_user_data');
    collectionData(ref, { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.splitUsers(data);
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
    this.loadNaRegister();
    this.fetchEngagement();
  }

  ngOnDestroy(): void {
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

  /** The three B!G journey docs -> their `journey` name field. */
  private async loadJourneyNames(): Promise<void> {
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'journey'),
        where(documentId(), 'in', this.bigJourneyIdList)
      ));
      snap.forEach(d => this.journeyNames.set(d.id, (d.data() as any).journey || ''));
    } catch (err) {
      console.error('eiflixoperationsdashboard: journey names load failed', err);
    }
    // Names may land after the pm listener has already built the card —
    // but never rebuild before the first pm emission (an open panel would
    // flash a false empty state off the still-empty pmMap).
    if (!this.pmLoading) this.updateBigParticipantsCard();
  }

  private journeyName(id: string): string {
    return this.journeyNames.get(id) || 'Journey ' + (this.bigJourneyIdList.indexOf(id) + 1);
  }

  // ==================== Users ====================

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
    const sorted = data
      .map(u => ({
        ...u,
        createdLabel: this.formatCreated(u.created),
        initialsLabel: this.initials(u.name),
        sourceTag: 'New User'
      }))
      .sort((a, b) => (this.toDate(b.created)?.getTime() || 0) - (this.toDate(a.created)?.getTime() || 0));
    for (const card of this.cards) {
      if (card.key === 'big-participants') continue;
      card.users = sorted.filter(u =>
        card.key === 'new-users-to-paid' ? u.movedtoexist === true : u.movedtoexist !== true
      );
      this.animateCount(card, card.users.length);
    }
    // Keep an open users panel in sync with realtime updates.
    if (this.activePanel?.kind === 'users') {
      const card = this.cards.find(c => c.key === this.activePanel!.cardKey);
      if (card && card.key !== 'big-participants') {
        this.setPanelRows(this.activePanel, card.users);
        this.activePanel.loading = false;
      }
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

  /** The Users cards load from two different listeners. */
  cardLoading(card: OpsCard): boolean {
    return card.key === 'big-participants' ? this.pmLoading : this.loading;
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
          if (this.pmMap.has(pid)) {
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
   * 'participant metadata' is PRIMARY; ids found only in new_user_data
   * carry the 'New User' tag; leftovers render as unknown.
   */
  private async resolveProfiles(ids: string[]): Promise<any[]> {
    await Promise.all([this.pmReady, this.nudReady]);
    return ids
      .map(id => {
        const pm = this.pmMap.get(id);
        if (pm) return { ...pm, id, initialsLabel: this.initials(pm.name) };
        const nud = this.nudMap.get(id);
        if (nud) return { ...nud, id, initialsLabel: this.initials(nud.name), sourceTag: 'New User' };
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
      assign(id, true, created ? this.daysBetween(today, created) : null);
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
    this.computeDeviceBreakdown();
    // A range change while a platform panel is open refreshes it in place.
    if (this.activePanel?.kind === 'platform' && this.activePanel.cardKey) {
      this.refreshPlatformPanel();
    }
  }

  private platformPerProfile(platform: string): Map<string, number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.dbRange * 30);
    const cutoffKey = this.dayKey(cutoff);
    const perProfile = new Map<string, number>();
    this.naPages.forEach((page, key) => {
      if (key < cutoffKey) return;
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

  /** Share of watch time per platform over the last 1/2/3 months of pages. */
  private computeDeviceBreakdown(): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.dbRange * 30);
    const cutoffKey = this.dayKey(cutoff);
    const totals = new Map<string, number>();
    this.naPages.forEach((page, key) => {
      if (key < cutoffKey) return;
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
    panel.sortOptions = hasHours ? ['default', 'name', 'hours'] : ['default', 'name'];
    if (!panel.sortOptions.includes(panel.sortKey)) panel.sortKey = 'default';
    const hasNud = rows.some(r => !!r.sourceTag);
    const hasPm = rows.some(r => !r.sourceTag && !r.unknown);
    panel.showCohort = (hasNud && hasPm) || panel.cohort !== 'all';
    this.updatePanelView(panel);
  }

  /** Recompute the visible rows from search + cohort + sort. */
  updatePanelView(panel: PanelState): void {
    const q = panel.q.trim().toLowerCase();
    let rows = panel.rows;
    if (panel.cohort === 'nud') rows = rows.filter(r => !!r.sourceTag);
    else if (panel.cohort === 'pm') rows = rows.filter(r => !r.sourceTag && !r.unknown);
    if (q) {
      rows = rows.filter(r =>
        ((r.name || '') + ' ' + (r.email || '') + ' ' + (r.phonenumber || '')).toLowerCase().includes(q));
    }
    if (panel.sortKey === 'name') {
      rows = [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (panel.sortKey === 'hours') {
      rows = [...rows].sort((a, b) => (b.hoursSeconds || 0) - (a.hoursSeconds || 0));
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

  setPanelSort(panel: PanelState, key: 'default' | 'name' | 'hours'): void {
    panel.sortKey = key;
    panel.sortOpen = false;
    this.updatePanelView(panel);
  }

  sortLabel(key: 'default' | 'name' | 'hours'): string {
    return key === 'name' ? 'Name A–Z' : key === 'hours' ? 'Watch hours' : 'Default';
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
    this.activePanel = null;
    this.unlockScroll();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
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
