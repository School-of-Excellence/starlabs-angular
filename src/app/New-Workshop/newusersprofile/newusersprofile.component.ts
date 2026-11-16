import { Component, ElementRef, NgZone, OnDestroy, OnInit, PLATFORM_ID, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, Subscription, firstValueFrom, of } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SnackbarService } from '../../shared/snackbar.service';
import { WhatsAppProgressData, WhatsappProgressDialogComponent } from '../whatsapp-progress-dialog.component';
import { environment } from '../../../environments/environment.development';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { A11yModule } from '@angular/cdk/a11y';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  documentId,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { WorkshopAccessService } from '../workshop-access/workshop-access.service';
import { canOpenNewUsers as canOpenNewUsersRule } from '../workshop-access/workshop-access.model';
import { NxIconComponent, NxSortIconPipe } from './nx-icon';
import { NxAutofocusDirective, NxSheetDirective } from './nx-overlay.directives';

/**
 * Conversion filter. '' is Everyone (no conversion filter); the panel offers all three, and picking the
 * active option keeps it (2026-11-16 design).
 */
export type ConvertedFilter = '' | 'converted' | 'notconverted';

/** The desktop popovers. One is open at a time. */
export type FilterPanel = 'tags' | 'workshops' | 'created' | 'conversion' | 'columns' | 'import';

/** A filter dimension, as the readout chips and the no-match conditions name it. */
export type FilterKey = 'tags' | 'workshops' | 'created' | 'conversion';

/** One piece of a plain-language rule sentence. Bold pieces are tag or workshop names (render with @for, never innerHTML). */
export interface RulePart { text: string; bold: boolean; }

/** One readout chip under the toolbar: "Tags, excluding" + "Corporate", with its own remove action. */
export interface ReadoutChip {
  key: FilterKey;
  /** Plain phrase, e.g. "Tags, excluding all of", "Workshops, including", "Created", "Conversion". */
  phrase: string;
  /** The value in words, e.g. "Corporate, Hindi Batch", "1 Oct – 15 Nov 2026", "Not converted". */
  value: string;
  /** Same as value, with the year dropped from dates (phone layout). */
  valueShort: string;
  /** aria-label for the chip's remove button. */
  removeLabel: string;
}

/** One condition in the no-match state, with how many people it finds on its own. */
export interface NoMatchReason {
  key: FilterKey | 'search';
  phrase: string;
  value: string;
  /** People in the whole in-memory list passing this condition alone; null while it cannot be counted yet. */
  count: number | null;
  removeLabel: string;
}

/** A search suggestion that turns typed text into a real filter. */
export interface SearchSuggestion {
  kind: 'tag' | 'workshop';
  id: string;
  label: string;
  /** The label split around the first case-insensitive match, for a <mark>. */
  before: string;
  match: string;
  after: string;
  /** People carrying the tag / enrolled in the workshop; null when not known without a read. */
  count: number | null;
}

/** One day button in the Created calendar. Leading blanks are null entries in calDays. */
export interface CalDay {
  date: Date;
  day: number;
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
  isToday: boolean;
  /** Accessible name, e.g. "12 Nov 2026". */
  label: string;
}

export type CreatedPreset = 'today' | '7d' | '30d' | 'month';

export type FileResultKind = 'ok' | 'none' | 'bad-heading' | 'not-excel' | 'no-sheet' | 'no-emails' | 'error';

/** What the last Select-from-file did. Kept until dismissed or replaced by the next import. */
export interface FileImportResult {
  kind: FileResultKind;
  fileName: string;
  /** Distinct email-shaped values in the file. */
  total: number;
  /** Distinct file emails that matched someone. */
  matched: number;
  /** People selected (one email can match more than one person). */
  selectedCount: number;
  /** Distinct file emails that matched no one. */
  missing: number;
  /** Values in the email column that were not email-shaped. */
  invalid: number;
  /** Whether a previous selection was replaced. */
  replaced: boolean;
  /** Ids the file selected (used for the live hidden-by-filters count). */
  matchedIds: string[];
  /** The file emails that matched no one, in file order. */
  unmatched: string[];
}

export interface FileBanner {
  variant: 'ok' | 'warn' | 'danger';
  title: string;
  /** Single explanatory line (warn / danger). Empty for ok, whose details are separate counts. */
  message: string;
}

/** Per-row view model, built at most once per row per change of data, tag names, referrer names or workshop sets. */
export interface NewUserRowVm {
  version: number;
  id: string;
  name: string;
  initials: string;
  phoneCc: string;
  phoneNumber: string;
  /** "cc number", or '' when both are empty (the old cell text). */
  phoneLabel: string;
  email: string;
  /** Local part, split after its dots when longer than 26 characters (render with <wbr> between). */
  emailLocalParts: string[];
  /** "@domain", or '' when the address has no @. */
  emailDomain: string;
  createdMs: number | null;
  /** 'd MMM y, h:mm a' — the Created cell text and one of the search forms. '' when missing. */
  createdLabel: string;
  createdDay: string;
  createdTime: string;
  movedMs: number | null;
  /** 'medium' format, as the old Moved On cell. */
  movedLabel: string;
  movedDay: string;
  movedTime: string;
  enabled: boolean;
  isSubscriber: boolean;
  /** 'Subscriber', the referrer name, the raw id, or '' (same as referredBy()). */
  referredBy: string;
  /** The referrer name only (never 'Subscriber'); '' when none. */
  referrerName: string;
  tagNames: string[];
  shownTags: string[];
  moreCount: number;
  /** The hidden tag names joined with ', ' (tooltip). */
  moreTip: string;
  workshopNames: string[];
  /** Lowercased search text: same coverage as before the redesign. */
  haystack: string;
}

interface FilterState {
  active: boolean;
  q: string;
  tags: string[];
  tagMode: 'all' | 'any';
  tagPolarity: 'include' | 'exclude';
  start: number | null;
  end: number | null;
  conv: ConvertedFilter;
  workshops: boolean;
  workshopMode: 'include' | 'exclude';
}

interface DateParts { label: string; medium: string; day: string; time: string; }

const EMPTY_FILTER: FilterState = {
  active: false, q: '', tags: [], tagMode: 'all', tagPolarity: 'include',
  start: null, end: null, conv: '', workshops: false, workshopMode: 'include',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The design's pager, standing in for mat-paginator as MatTableDataSource's paginator: the data source only
 * reads page / initialized / pageIndex / pageSize / length, and sets length itself after each filter pass.
 */
export class NxPager {
  readonly page = new Subject<PageEvent>();
  readonly initialized: Observable<void> = of(undefined);
  readonly pageSizeOptions = [20, 50, 100];
  pageIndex = 0;
  pageSize = 20;
  length = 0;

  get pageCount(): number { return Math.max(1, Math.ceil(this.length / this.pageSize)); }
  get hasPrevious(): boolean { return this.pageIndex > 0; }
  get hasNext(): boolean { return this.pageIndex < this.pageCount - 1; }
  /** "1–20 of 148"; "0 of 0" with no rows. */
  get rangeLabel(): string {
    if (this.length <= 0) return '0 of 0';
    const from = this.pageIndex * this.pageSize + 1;
    const to = Math.min(this.length, (this.pageIndex + 1) * this.pageSize);
    return `${from}–${to} of ${this.length}`;
  }

  firstPage(): void { this.goTo(0); }
  previousPage(): void { this.goTo(this.pageIndex - 1); }
  nextPage(): void { this.goTo(this.pageIndex + 1); }
  lastPage(): void { this.goTo(this.pageCount - 1); }

  /** A new size starts again at the first page. */
  setPageSize(size: number | string): void {
    const n = Number(size);
    if (!Number.isFinite(n) || n <= 0 || n === this.pageSize) return;
    const previousPageIndex = this.pageIndex;
    this.pageSize = n;
    this.pageIndex = 0;
    this.page.next({ pageIndex: 0, previousPageIndex, pageSize: n, length: this.length });
  }

  private goTo(index: number): void {
    const target = Math.max(0, Math.min(index, this.pageCount - 1));
    if (target === this.pageIndex) return;
    const previousPageIndex = this.pageIndex;
    this.pageIndex = target;
    this.page.next({ pageIndex: target, previousPageIndex, pageSize: this.pageSize, length: this.length });
  }
}

@Component({
  selector: 'app-newusersprofile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatSortModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSlideToggleModule,
    OverlayModule,
    A11yModule,
    NxIconComponent,
    NxSortIconPipe,
    NxAutofocusDirective,
    NxSheetDirective,
  ],
  templateUrl: './newusersprofile.component.html',
  styleUrl: './newusersprofile.component.css',
  // Design 2026-11-16: the sheet's selectors were verified against the global sheets as written; every rule is
  // rooted in an nx- class, and the overlay templates (outside the host) need the same rules.
  encapsulation: ViewEncapsulation.None,
})
export class NewusersprofileComponent implements OnInit, OnDestroy {
  dataSource = new MatTableDataSource<any>([]);
  loading = true;
  /** The new users stream failed (2.3). Search text and filters are kept for retry(). */
  loadError = false;
  // ---- column chooser (operator 2026-11-12) ----
  // The table columns a viewer can show or hide, in table order. Workshop and Moved On are not here:
  // they still appear on their own while their filters are on.
  readonly columnOptions: { key: string; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'phonenumber', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'created', label: 'Created' },
    { key: 'enable', label: 'Status' },
    { key: 'referredby', label: 'Referred by' },
    { key: 'tags', label: 'Tags' },
  ];
  private static readonly DEFAULT_COLUMNS = ['name', 'phonenumber', 'email', 'created', 'tags'];
  /** Remembered per browser only: a viewing preference, not shared data. */
  private static readonly COLUMNS_STORAGE_KEY = 'newusersprofile.columns.v1';
  static readonly SEARCH_DEBOUNCE_MS = 200;
  static readonly NARROW_BELOW_PX = 900;
  static readonly PHONE_BELOW_PX = 620;
  /** Firestore's limit for an 'in' query. */
  private static readonly IN_BATCH = 30;
  visibleColumns = new Set<string>(NewusersprofileComponent.loadSavedColumns());
  displayedColumns = this.buildColumns();
  // Keyed by user id so selection survives live data refreshes.
  selection = new SelectionModel<string>(true, []);
  applyingBulk = false;
  /** How many people the running bulk tag write covers ("Updating tags for N people…"). */
  updatingTagsCount = 0;
  private datePipe = new DatePipe('en-US');

  // ---- export ----
  showExport = false;
  // `label` is the Excel header and must not change; the panel chips read exportLabel(key).
  exportColumns: { key: string; label: string; value: (u: any) => string }[] = [
    { key: 'name', label: 'Name', value: u => u.name || '' },
    { key: 'countryCode', label: 'Country Code', value: u => u.countryCode || '' },
    { key: 'phonenumber', label: 'Phone', value: u => u.phonenumber || '' },
    { key: 'email', label: 'Email', value: u => u.email || '' },
    { key: 'created', label: 'Created', value: u => this.datePipe.transform(this.toDate(u.created), 'medium') || '' },
    { key: 'enable', label: 'Status', value: u => (u.enable ? 'Enabled' : 'Disabled') },
    { key: 'referredby', label: 'Referred By', value: u => this.referredBy(u) },
    { key: 'tags', label: 'Tags', value: u => this.tagNames(u).join(', ') }
  ];
  /** Chip labels for the Export panel (display only; the Excel headers stay `exportColumns[].label`). */
  static readonly EXPORT_DISPLAY_LABELS: Record<string, string> = {
    name: 'Name', countryCode: 'Country code', phonenumber: 'Phone', email: 'Email', created: 'Created',
    enable: 'Status', referredby: 'Referred by', tags: 'Tags', workshop: 'Workshop', movedon: 'Moved On',
  };
  // Default: all columns selected.
  selectedExportKeys: string[] = this.exportColumns.map(c => c.key);
  // Workshop titles export column — offered only while the workshop filter is
  // active; titles come from the cached enrolled reads, same as the table column.
  private readonly workshopExportColumn = {
    key: 'workshop',
    label: 'Workshop',
    value: (u: any) => this.workshopNames(u).join(', ')
  };
  // Moved On export column — offered only while the Converted filter is active.
  private readonly movedonExportColumn = {
    key: 'movedon',
    label: 'Moved On',
    value: (u: any) => this.datePipe.transform(this.toDate(u.movedon), 'medium') || ''
  };
  // What the export panel offers right now (base + Workshop/Moved On when filtering).
  exportColumnsView = this.exportColumns;

  // Conversion filter: '' Everyone, 'converted', 'notconverted'.
  convertedFilter: ConvertedFilter = '';
  private lastConvertedActive = false;

  // tag id -> name, from the newusertags collection (live).
  tagMap: Record<string, string> = {};
  /** tag id -> number of people in the in-memory list carrying it (one pass per data change). */
  tagCounts: Record<string, number> = {};

  // Sort comes from the table's matSort, wired via a setter ViewChild (the table renders behind @if).
  @ViewChild(MatSort) set matSort(ms: MatSort) {
    if (ms) this.dataSource.sort = ms;
    this.sortRef = ms;
  }
  private sortRef?: MatSort;
  /** The design's pager. Used whenever the template has no <mat-paginator> (the old template still has one). */
  readonly pager = new NxPager();
  @ViewChild(MatPaginator) set matPaginator(mp: MatPaginator) {
    if (!this.dataSource) return;
    this.dataSource.paginator = mp || (this.pager as unknown as MatPaginator);
  }
  /** The rows on the current page, after filter, sort and paging (from the data source's render stream). */
  pageRows: any[] = [];

  // profileId -> name from `participant metadata`, read lazily for the referrer ids present in the data only.
  private metaMap: Record<string, string> = {};
  /** new_user_data id -> name. A referrer can be a new user too, not only a participant (operator 2026-11-04). */
  private nudNames: Record<string, string> = {};
  /** Referrer ids already asked for (or answered), so each id is read at most once per visit. */
  private referrerRequested = new Set<string>();
  private referrerPending: Promise<void> | null = null;
  /** True while a referrer-name read is in flight. */
  referrerNamesLoading = false;

  // "Send communication" panel + tag-based selection state.
  showComm = false;
  allTags: { id: string; name: string }[] = [];
  selectByTagMode: 'all' | 'any' = 'all';
  // include = show profiles matching the tag condition; exclude = show the rest.
  selectByTagPolarity: 'include' | 'exclude' = 'include';
  selectByTagIds = new Set<string>();
  // Date range filter on the `created` column.
  startDate: Date | null = null;
  endDate: Date | null = null;
  // Workshop filter: options from workshopconfiguration (label detailpage.title), read on first need,
  // matching rows via `workshop participant enrolled` (workshopref -> profileid).
  workshopOptions: { id: string; title: string; evergreen: boolean }[] = [];
  selectedWorkshopIds = new Set<string>();
  workshopFilterLoading = false;
  /** The workshop LIST (not the people) is being read. */
  workshopOptionsLoading = false;
  /** The last workshop list read failed. */
  workshopOptionsError = false;
  /** Which part of workshopconfiguration is cached: none yet, the funnel (evergreen) ones, or all. */
  private workshopScope: 'none' | 'funnel' | 'all' = 'none';
  private workshopPending: { scope: 'funnel' | 'all'; promise: Promise<void> } | null = null;
  // Funnel only (default ON): offer only evergreenWorkshop == true configs.
  funnelOnly = true;
  // include = show enrolled profiles; exclude = show profiles NOT enrolled in
  // any selected workshop.
  workshopFilterMode: 'include' | 'exclude' = 'include';
  // profileids enrolled in any selected workshop; null while inactive/loading.
  private workshopProfileIds: Set<string> | null = null;
  // workshop id -> enrolled profileids, so re-selections don't refetch.
  private enrolledCache = new Map<string, string[]>();
  // profileid -> selected workshop ids (drives the `workshop` column) — built
  // from the per-workshop cache only, never a collection-wide read.
  private workshopsByProfile = new Map<string, string[]>();
  private workshopTitleById: Record<string, string> = {};
  // Tracks selection-active transitions for the export-chip sync.
  private lastWorkshopFilterActive = false;
  // Guards against out-of-order async results; bumped to invalidate in-flight loads.
  private workshopFilterToken = 0;
  private destroy$ = new Subject<void>();
  /** Set on destroy: late async results are ignored. */
  private destroyed = false;
  private usersSub: Subscription | null = null;
  private tagsSub: Subscription | null = null;

  // ---- filter state (parsed once per change, read by the predicate and the counts) ----
  private filterState: FilterState = EMPTY_FILTER;
  /** Ids of the rows that pass the current filters; replaced (new identity) after every filter pass. */
  private filteredIdSet = new Set<string>();
  /** id -> row for the whole list; rebuilt on each data emission. */
  private dataById = new Map<string, any>();
  private vmCache = new WeakMap<object, NewUserRowVm>();
  /** Bumped when tag names, referrer names or workshop sets change, so row view models rebuild on next read. */
  private vmVersion = 0;
  private dateCache = new Map<number, DateParts>();
  /** One chip per active filter (not the search). Rebuilt after each filter change. */
  readoutChips: ReadoutChip[] = [];
  /** Filled only when filters/search leave no one; one entry per active condition. */
  noMatchReasons: NoMatchReason[] = [];

  // ---- search ----
  searchText = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  suggestions: SearchSuggestion[] = [];
  suggestOpen = false;
  /** Index of the arrow-highlighted suggestion; -1 when none. */
  suggestActive = -1;
  /** People whose details mention the typed text (the suggestions footer); null when not counted. */
  suggestSearchCount: number | null = null;

  // ---- panels ----
  openPanel: FilterPanel | null = null;
  /**
   * Pill panels open below the pill, start-aligned; near the right edge they align to the pill's end instead,
   * and they flip above when there is more room there. Tall panels scroll inside (flexible dimensions).
   */
  readonly panelPositionsStart: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ];
  /** Columns and Select from file sit at the end of their rows: end-aligned first. */
  readonly panelPositionsEnd: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  ];
  private tagFindText = '';
  /** Find a tag (bind with [(ngModel)] or (input)); narrows tagPanelChosen / tagPanelRest. */
  get tagFind(): string { return this.tagFindText || ''; }
  set tagFind(value: string) {
    this.tagFindText = value || '';
    this.rebuildTagPanelLists();
  }
  /** Find a workshop; filteredWorkshopOptions follows it. */
  workshopFind = '';
  /** Tags panel lists: chosen first, frozen in the order they had when the panel opened. */
  tagPanelChosen: { id: string; name: string }[] = [];
  tagPanelRest: { id: string; name: string }[] = [];
  private tagOrderSnapshot: Set<string> | null = null;

  // ---- created panel ----
  fromText = '';
  toText = '';
  /** First day of the month the calendar shows. */
  calMonth: Date = NewusersprofileComponent.monthStart(new Date());
  /** Seven-column grid: leading nulls are blanks before the 1st. */
  calDays: Array<CalDay | null> = [];
  readonly calWeekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  /** The next calendar click sets To (after a click set From). */
  private calPickingEnd = false;

  // ---- narrow layout (below 900px of the screen root's own width) ----
  isNarrow = false;
  isPhone = false;
  filtersSheetOpen = false;
  sheetView: 'main' | 'tags' | 'workshops' = 'main';
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private resizeObserver: ResizeObserver | null = null;
  private observedEl: HTMLElement | null = null;
  /** Put #screenRoot on the .nx-shell element: its width decides the narrow layout. */
  @ViewChild('screenRoot') set screenRoot(ref: ElementRef<HTMLElement> | undefined) {
    this.observeWidth(ref?.nativeElement ?? null);
  }

  /** Card-layout Sort select. 'newest' is the data order (no active sort), as on desktop. */
  readonly cardSortOptions: { key: string; label: string }[] = [
    { key: 'newest', label: 'Newest first' },
    { key: 'oldest', label: 'Oldest first' },
    { key: 'name-asc', label: 'Name A–Z' },
    { key: 'name-desc', label: 'Name Z–A' },
    { key: 'email-asc', label: 'Email A–Z' },
    { key: 'status', label: 'Status' },
    { key: 'referredby', label: 'Referred by' },
  ];
  private static readonly CARD_SORTS: Record<string, { active: string; direction: 'asc' | 'desc' | '' }> = {
    'newest': { active: '', direction: '' },
    'oldest': { active: 'created', direction: 'asc' },
    'name-asc': { active: 'name', direction: 'asc' },
    'name-desc': { active: 'name', direction: 'desc' },
    'email-asc': { active: 'email', direction: 'asc' },
    'status': { active: 'enable', direction: 'desc' },
    'referredby': { active: 'referredby', direction: 'asc' },
    'movedon': { active: 'movedon', direction: 'desc' },
  };

  // ---- select from file ----
  importing = false;
  /** The file being read, for "Reading <file>…". */
  importingName = '';
  fileResult: FileImportResult | null = null;
  showUnmatched = false;
  // Kept on the component so the detached input can't be GC'd while the native file picker is open.
  private importFileInput: HTMLInputElement | null = null;

  /** Guards against a second dialog while the first one's code is still loading. */
  private dialogOpening = false;

  // memo slots (identity-keyed, so they recompute only when their inputs change)
  private selMemo: { sel: string[] | null; set: Set<string> | null; matching: number } = { sel: null, set: null, matching: 0 };
  private exportRowsMemo: { sel: string[] | null; byId: Map<string, any> | null; n: number } = { sel: null, byId: null, n: 0 };
  private fileHiddenMemo: { sel: string[] | null; set: Set<string> | null; r: FileImportResult | null; n: number } =
    { sel: null, set: null, r: null, n: 0 };
  private wsOptionsMemo: { opts: any[] | null; funnel: boolean; find: string; out: { id: string; title: string; evergreen: boolean }[] } =
    { opts: null, funnel: true, find: '', out: [] };

  // Access to this screen is granted in a workshop's Dashboard Access settings.
  // The check starts in the constructor, as asked, and everything this screen
  // loads waits on it — an unauthorised visit must not read the data at all.
  accessAllowed = false;
  accessChecked = false;
  private readonly accessCheck: Promise<boolean>;

  constructor(
    private firestore: Firestore,
    private authguard: AuthguardService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private snackbarService: SnackbarService,
    private accessService: WorkshopAccessService,
  ) {
    this.wireDataSource();
    this.rebuildCalendar();
    this.accessCheck = (async () => {
      try {
        const [profileId, lists] = await Promise.all([
          this.accessService.currentProfileId(),
          this.accessService.getAdminLists(),
        ]);
        return canOpenNewUsersRule(profileId, lists);
      } catch (error) {
        // Nothing is open by default, so a failed read keeps the screen closed.
        console.error('Error checking new users access:', error);
        return false;
      }
    })().then(allowed => {
      this.accessAllowed = allowed;
      this.accessChecked = true;
      if (!allowed) this.loading = false;
      return allowed;
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }

  ngOnInit(): void {
    this.accessCheck.then(allowed => { if (allowed && !this.destroyed) this.loadNewUsersScreen(); });
  }

  // =====================================================================================
  // Loading
  // =====================================================================================

  /**
   * What the page shows: checking access (1.1), denied (2.1), the stream failed (2.3), reading the list (1.2),
   * no users at all (2.2), or the table.
   */
  get phase(): 'checking' | 'denied' | 'error' | 'loading' | 'empty' | 'ready' {
    if (!this.accessChecked) return 'checking';
    if (!this.accessAllowed) return 'denied';
    if (this.loadError) return 'error';
    if (this.loading) return 'loading';
    return this.dataSource.data.length ? 'ready' : 'empty';
  }

  /** The header figure: null until the list has arrived (show the skeleton). */
  get totalCount(): number | null {
    return this.accessAllowed && !this.loading && !this.loadError ? this.dataSource.data.length : null;
  }

  /** Filter pills and the Filters button wake up once there are rows (1.2 keeps them ghosted). */
  get filtersReady(): boolean {
    return this.phase === 'ready';
  }

  private loadNewUsersScreen(): void {
    this.subscribeTags();
    this.subscribeUsers();
  }

  /** Re-read the list after a stream error. Search text and filters stay as they are. */
  retry(): void {
    if (!this.accessAllowed || this.destroyed) return;
    this.loadError = false;
    if (!this.tagsSub || this.tagsSub.closed) this.subscribeTags();
    this.subscribeUsers();
  }

  private subscribeTags(): void {
    this.tagsSub?.unsubscribe();
    this.tagsSub = collectionData(
      query(collection(this.firestore, 'newusertags'), where('type', '==', 'newusersegments')),
      { idField: 'id' }
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (rows: any[]) => this.setTags(rows),
      error: (err) => console.error('Error loading tags:', err)
    });
  }

  private subscribeUsers(): void {
    this.usersSub?.unsubscribe();
    this.loading = true;
    this.usersSub = collectionData(collection(this.firestore, 'new_user_data'), { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.loadError = false;
          this.setData(data);
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading new users:', err);
          this.loadError = true;
          this.loading = false;
        }
      });
  }

  /** Filter predicate, sort accessors, the pager and the page-rows feed. No reads. */
  private wireDataSource(): void {
    this.dataSource.filterPredicate = (u: any) => this.passesFilters(u, this.filterState);
    this.dataSource.sortingDataAccessor = (u: any, id: string) => {
      switch (id) {
        case 'created':
          return this.dateMs(u?.created) || 0;
        case 'movedon':
          return this.dateMs(u?.movedon) || 0;
        case 'enable':
          return u?.enable ? 1 : 0;
        case 'referredby':
          return this.referredBy(u).toLowerCase();
        default:
          return (u?.[id] ?? '').toString().toLowerCase();
      }
    };
    if (!this.dataSource.paginator) this.dataSource.paginator = this.pager as unknown as MatPaginator;
    this.dataSource.connect().pipe(takeUntil(this.destroy$)).subscribe(rows => (this.pageRows = rows || []));
  }

  /** Tag names (live). A rename re-runs the search (it matches tag names), with no jump back to page 1. */
  private setTags(rows: any[]): void {
    const map: Record<string, string> = {};
    rows.forEach(r => (map[r.id] = (r.name || '').toString()));
    this.tagMap = map;
    this.allTags = rows
      .map(r => ({ id: r.id, name: (r.name || '').toString() }))
      .filter(t => t.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    this.vmVersion++;
    this.rebuildTagPanelLists();
    this.rerunFilter();
    if (this.searchText) this.updateSuggestions();
  }

  /** A new emission of the whole list: newest first, then every derived count. */
  private setData(data: any[]): void {
    const rows = (data || []).slice()
      .sort((a, b) => (this.dateMs(b?.created) || 0) - (this.dateMs(a?.created) || 0));
    // Names of everyone in new_user_data, from the same read — no extra query.
    const names: Record<string, string> = {};
    const byId = new Map<string, any>();
    const counts: Record<string, number> = {};
    for (const u of rows) {
      const id = this.rowId(u);
      if (id) byId.set(id, u);
      const name = (u?.name ?? '').toString().trim();
      if (u?.id && name) names[u.id] = name;
      if (Array.isArray(u?.tags)) {
        for (const t of new Set<string>(u.tags)) counts[t] = (counts[t] || 0) + 1;
      }
    }
    this.nudNames = names;
    this.dataById = byId;
    this.tagCounts = counts;
    this.vmVersion++;
    this.dataSource.data = rows;
    this.afterFilterChange();
    this.maybeLoadReferrers();
    if (this.searchText) this.updateSuggestions();
  }

  // =====================================================================================
  // Row view model
  // =====================================================================================

  /** The row's precomputed view model. Cheap to call from the template. */
  vm(u: any): NewUserRowVm {
    if (!u || typeof u !== 'object') return this.buildVm(u || {});
    let v = this.vmCache.get(u);
    if (!v || v.version !== this.vmVersion) {
      v = this.buildVm(u);
      this.vmCache.set(u, v);
    }
    return v;
  }

  /** trackBy for the table rows. */
  readonly trackRow = (_: number, u: any): string => this.rowId(u);

  private buildVm(u: any): NewUserRowVm {
    const name = (u?.name ?? '').toString();
    const cc = (u?.countryCode ?? '').toString().trim();
    const phone = (u?.phonenumber ?? '').toString();
    const email = (u?.email ?? '').toString();
    const at = email.lastIndexOf('@');
    const local = at >= 0 ? email.slice(0, at) : email;
    const created = this.dateParts(this.dateMs(u?.created));
    const movedMs = this.dateMs(u?.movedon);
    const moved = this.dateParts(movedMs);
    const createdMs = this.dateMs(u?.created);
    const isSub = this.isSubscriber(u);
    const referredBy = this.referredBy(u);
    const tagNames = this.computeTagNames(u);
    const enabled = !!u?.enable;
    const haystack = [
      u?.name,
      u?.countryCode,
      u?.phonenumber,
      u?.email,
      created?.medium,
      created?.label,   // as the column shows it
      enabled ? 'enabled active' : 'disabled inactive',
      referredBy,
      tagNames.join(' ')
    ].filter(Boolean).join(' ').toLowerCase();
    return {
      version: this.vmVersion,
      id: this.rowId(u),
      name,
      initials: NewusersprofileComponent.initialsOf(name, email),
      phoneCc: cc,
      phoneNumber: phone,
      phoneLabel: (u?.countryCode || u?.phonenumber) ? ((u?.countryCode ? u.countryCode + ' ' : '') + (u?.phonenumber || '')) : '',
      email,
      emailLocalParts: local.length > 26 ? (local.match(/[^.]*\.|[^.]+$/g) || [local]).filter(Boolean) : (local ? [local] : []),
      emailDomain: at >= 0 ? email.slice(at) : '',
      createdMs,
      createdLabel: created?.label || '',
      createdDay: created?.day || '',
      createdTime: created?.time || '',
      movedMs,
      movedLabel: moved?.medium || '',
      movedDay: moved?.day || '',
      movedTime: moved?.time || '',
      enabled,
      isSubscriber: isSub,
      referredBy,
      referrerName: isSub ? '' : referredBy,
      tagNames,
      shownTags: tagNames.slice(0, 3),
      moreCount: Math.max(0, tagNames.length - 3),
      moreTip: tagNames.slice(3).join(', '),
      workshopNames: this.computeWorkshopNames(u),
      haystack,
    };
  }

  /** Date strings cached by epoch ms: live re-emissions don't re-format every row. */
  private dateParts(ms: number | null): DateParts | null {
    if (ms == null) return null;
    let p = this.dateCache.get(ms);
    if (!p) {
      const d = new Date(ms);
      p = {
        label: this.datePipe.transform(d, 'd MMM y, h:mm a') || '',
        medium: this.datePipe.transform(d, 'medium') || '',
        day: this.datePipe.transform(d, 'd MMM y') || '',
        time: this.datePipe.transform(d, 'h:mm a') || '',
      };
      this.dateCache.set(ms, p);
    }
    return p;
  }

  private static initialsOf(name: string, email: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    if (words.length === 1) return words[0][0].toUpperCase();
    return email ? email[0].toUpperCase() : '?';
  }

  /** Epoch ms of a Timestamp, Date, string or number; null when missing or unparseable. */
  private dateMs(value: any): number | null {
    if (!value) return null;
    let ms: number;
    if (typeof value?.toMillis === 'function') ms = value.toMillis();
    else if (typeof value?.toDate === 'function') ms = value.toDate()?.getTime();
    else ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  // Subscriber -> "Subscriber"; else the refferedprofile value if present.
  isSubscriber(u: any): boolean {
    return u?.subscriber === true;
  }

  referredBy(u: any): string {
    if (this.isSubscriber(u)) return 'Subscriber';
    const key = this.referrerKey(u);
    if (!key) return '';
    // Map the id to a name: participant metadata first, then new_user_data (the referrer may be a new user);
    // fall back to the id if neither knows it.
    return this.metaMap[key] || this.nudNames[key] || key;
  }

  /** The referrer id: refferedprofile may be an id string or a DocumentReference. '' for subscribers and none. */
  private referrerKey(u: any): string {
    if (this.isSubscriber(u)) return '';
    const rp = u?.refferedprofile;
    if (rp === null || rp === undefined || rp === '') return '';
    return typeof rp === 'object' ? (rp.id || '').toString() : rp.toString();
  }

  // Resolve a user's tag ids to their names.
  tagNames(u: any): string[] {
    return this.vm(u).tagNames;
  }

  private computeTagNames(u: any): string[] {
    const ids: string[] = Array.isArray(u?.tags) ? u.tags : [];
    return ids.map(id => this.tagMap[id]).filter(Boolean);
  }

  // =====================================================================================
  // Referrer names (lazy)
  // =====================================================================================

  /** Referrer names are needed while Referred by is shown, a search is typed, or an export includes it. */
  get referrerNamesNeeded(): boolean {
    return !!this.visibleColumns?.has('referredby')
      || !!(this.searchText || '').trim()
      || (this.showExport && (this.selectedExportKeys || []).includes('referredby'));
  }

  /** Starts a referrer-name read when one is needed. Safe to call often. */
  private maybeLoadReferrers(): void {
    if (this.referrerNamesNeeded) this.loadReferrerNames();
  }

  /**
   * Reads `participant metadata` names for the referrer ids present in the data that have not been asked for
   * yet: documentId() 'in' batches of 30, in parallel. When names arrive the rows re-render and the filter
   * re-runs (a referrer-name search matches without retyping). Resolves when every read in flight is done.
   */
  loadReferrerNames(): Promise<void> {
    const rows: any[] = this.dataSource?.data || [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const u of rows) {
      const id = this.referrerKey(u);
      if (!id || seen.has(id) || this.referrerRequested.has(id)) continue;
      seen.add(id);
      if (NewusersprofileComponent.isPlainDocId(id)) ids.push(id);
    }
    if (!ids.length) return this.referrerPending || Promise.resolve();
    ids.forEach(id => this.referrerRequested.add(id));
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += NewusersprofileComponent.IN_BATCH) {
      batches.push(ids.slice(i, i + NewusersprofileComponent.IN_BATCH));
    }
    this.referrerNamesLoading = true;
    const run = Promise.all(batches.map(b => this.fetchParticipantNames(b)))
      .then(results => {
        if (this.destroyed) return;
        const next = { ...this.metaMap };
        let added = 0;
        for (const r of results) {
          for (const [id, name] of Object.entries(r)) {
            if (name) { next[id] = name; added++; }
          }
        }
        if (!added) return;
        this.metaMap = next;
        this.vmVersion++;
        this.rerunFilter();
      })
      .catch(err => {
        // Let a later trigger ask again.
        ids.forEach(id => this.referrerRequested.delete(id));
        if (!this.destroyed) console.error('Error loading referrer names:', err);
      });
    const all = Promise.all([this.referrerPending, run]).then(() => undefined);
    this.referrerPending = all;
    all.then(() => {
      if (this.referrerPending === all) {
        this.referrerPending = null;
        this.referrerNamesLoading = false;
      }
    });
    return all;
  }

  /** One 'in' read: id -> name for the ids that exist and have a name. */
  private async fetchParticipantNames(ids: string[]): Promise<Record<string, string>> {
    const snap = await getDocs(query(collection(this.firestore, 'participant metadata'), where(documentId(), 'in', ids)));
    const out: Record<string, string> = {};
    snap.docs.forEach(d => {
      const name = d.data()?.['name'];
      if (name !== null && name !== undefined && name !== '') out[d.id] = name.toString();
    });
    return out;
  }

  /** documentId() 'in' rejects ids with '/', '.', '..' and __x__; such referrers keep showing the raw id. */
  private static isPlainDocId(id: string): boolean {
    return !!id && id.length <= 1500 && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);
  }

  // =====================================================================================
  // Filtering
  // =====================================================================================

  private buildFilterState(): FilterState {
    const f: FilterState = {
      active: false,
      q: (this.searchText || '').trim().toLowerCase(),
      tags: [...(this.selectByTagIds || [])],
      tagMode: this.selectByTagMode || 'all',
      tagPolarity: this.selectByTagPolarity === 'exclude' ? 'exclude' : 'include',
      start: this.dayBound(this.startDate, 'start'),
      end: this.dayBound(this.endDate, 'end'),
      conv: this.convertedFilter || '',
      workshops: (this.selectedWorkshopIds?.size || 0) > 0,
      workshopMode: this.workshopFilterMode || 'include',
    };
    f.active = !!(f.q || f.tags.length || f.start != null || f.end != null || f.conv || f.workshops);
    return f;
  }

  private passesFilters(u: any, f: FilterState): boolean {
    return this.matchSearch(u, f) && this.matchTags(u, f) && this.matchCreated(u, f)
      && this.matchConversion(u, f) && this.matchWorkshops(u, f);
  }

  // Text search across every column.
  private matchSearch(u: any, f: FilterState): boolean {
    return !f.q || this.vm(u).haystack.includes(f.q);
  }

  // Tag filter — include keeps profiles matching the chosen tags (per the all/any mode); exclude keeps the rest.
  private matchTags(u: any, f: FilterState): boolean {
    if (!f.tags.length) return true;
    const userTags: string[] = Array.isArray(u?.tags) ? u.tags : [];
    const tagMatch = f.tagMode === 'all'
      ? f.tags.every(t => userTags.includes(t))
      : f.tags.some(t => userTags.includes(t));
    return f.tagPolarity === 'include' ? tagMatch : !tagMatch;
  }

  // Date range filter on the `created` column.
  private matchCreated(u: any, f: FilterState): boolean {
    if (f.start == null && f.end == null) return true;
    const created = this.dateMs(u?.created);
    if (created == null) return false;
    if (f.start != null && created < f.start) return false;
    if (f.end != null && created > f.end) return false;
    return true;
  }

  // Conversion filter — one side or the other, never both.
  private matchConversion(u: any, f: FilterState): boolean {
    if (f.conv === 'converted') return u?.movedtoexist === true;
    if (f.conv === 'notconverted') return u?.movedtoexist !== true;
    return true;
  }

  // Workshop filter. The enrolled set lives on `this`; while it is still loading, show nothing rather than a
  // flash of unfiltered rows.
  private matchWorkshops(u: any, f: FilterState): boolean {
    if (!f.workshops) return true;
    if (!this.workshopProfileIds) return false;
    const pid = (u?.profileid || this.rowId(u) || '').toString();
    const enrolled = this.workshopProfileIds.has(pid);
    return f.workshopMode === 'include' ? enrolled : !enrolled;
  }

  /** Called by the template's (input); typing shows the × at once and filters after a 200ms pause. */
  onSearchInput(event: Event): void {
    this.searchText = (event?.target as HTMLInputElement)?.value || '';
    this.updateSuggestions();
    if (this.searchText.trim()) this.maybeLoadReferrers();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      if (!this.destroyed) this.commitSearch();
    }, NewusersprofileComponent.SEARCH_DEBOUNCE_MS);
  }

  /** Old name, kept for the current template. Same as onSearchInput (debounced). */
  applyFilter(event: Event): void {
    this.onSearchInput(event);
  }

  /** Applies the typed text now, if it differs from what the table is filtered by. */
  commitSearch(): void {
    if (this.searchTimer) { clearTimeout(this.searchTimer); this.searchTimer = null; }
    if ((this.searchText || '').trim().toLowerCase() !== this.filterState.q) this.refreshFilter();
  }

  /** Immediate: no debounce. */
  clearSearch(): void {
    if (this.searchTimer) { clearTimeout(this.searchTimer); this.searchTimer = null; }
    this.searchText = '';
    this.closeSuggestions();
    this.suggestions = [];
    this.refreshFilter();
  }

  /** Any search or filter (the no-match copy says "these filters" for both). */
  get hasAnyFilter(): boolean {
    return !!(this.searchText || this.selectByTagIds.size > 0 || this.hasDateFilter
      || this.selectedWorkshopIds.size > 0 || !!this.convertedFilter);
  }

  /** Any of the four filters (search excluded). */
  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  /** Active dimensions among Tags, Workshops, Created and Conversion (the Filters button's count). */
  get activeFilterCount(): number {
    return (this.selectByTagIds.size > 0 ? 1 : 0) + (this.selectedWorkshopIds.size > 0 ? 1 : 0)
      + (this.hasDateFilter ? 1 : 0) + (this.convertedFilter ? 1 : 0);
  }

  /** Readout "Clear all filters": the four filters only. The search is cleared in its own field. */
  clearAllFilters(): void {
    this.resetFiltersOnly();
    this.refreshFilter();
  }

  /** No-match primary button: clears the search and the filters together. */
  clearFiltersAndSearch(): void {
    if (this.searchTimer) { clearTimeout(this.searchTimer); this.searchTimer = null; }
    this.searchText = '';
    this.closeSuggestions();
    this.suggestions = [];
    this.resetFiltersOnly();
    this.refreshFilter();
  }

  private resetFiltersOnly(): void {
    this.selectByTagIds.clear();
    this.selectByTagPolarity = 'include';
    this.startDate = null;
    this.endDate = null;
    this.calPickingEnd = false;
    this.syncDateTexts();
    this.rebuildCalendar();
    this.convertedFilter = '';
    this.resetWorkshopFilter();
    if (!this.tagOrderSnapshot) this.rebuildTagPanelLists();
  }

  // Rebuild the filter state from search + tags + dates + conversion + workshops, then back to page 1.
  private refreshFilter(): void {
    this.filterState = this.buildFilterState();
    this.applyFilterState();
    this.dataSource?.paginator?.firstPage();
  }

  /** Re-run the current filter without a page jump (tag renames, referrer names arriving). */
  private rerunFilter(): void {
    if (!this.dataSource) return;
    if (this.filterState.active) this.applyFilterState();
    else this.afterFilterChange();
  }

  private applyFilterState(): void {
    const f = this.filterState;
    // '' skips the predicate altogether; any other value re-runs it (the setter always re-filters).
    this.dataSource.filter = f.active ? JSON.stringify(f) : '';
    this.afterFilterChange();
  }

  /** Everything derived from the filtered rows. One pass per filter or data change. */
  private afterFilterChange(): void {
    // MatTable disconnects the data source when it is destroyed (state swaps); without the pipeline,
    // filteredData would go stale. connect() rebuilds it only when it is gone.
    this.dataSource?.connect();
    const rows: any[] = this.dataSource?.filteredData || [];
    const ids = new Set<string>();
    for (const u of rows) {
      const id = this.rowId(u);
      if (id) ids.add(id);
    }
    this.filteredIdSet = ids;
    this.readoutChips = this.buildReadoutChips();
    this.noMatchReasons = this.isNoMatch ? this.buildNoMatchReasons() : [];
  }

  /** Rows exist, but the filters/search leave no one. */
  get isNoMatch(): boolean {
    const ds = this.dataSource;
    return !!ds && ds.data.length > 0 && ds.filteredData.length === 0 && !this.workshopFilterLoading;
  }

  /** Header select and sorting are off while a workshop's people load (2.5) and in the no-match state (2.4). */
  get tableLocked(): boolean {
    return this.workshopFilterLoading || this.isNoMatch;
  }

  matchCount(): number {
    return this.dataSource.filteredData.length;
  }

  get filteredCount(): number { return this.dataSource.filteredData.length; }
  get totalUsers(): number { return this.dataSource.data.length; }

  // ---- readout chips ----

  private buildReadoutChips(): ReadoutChip[] {
    const chips: ReadoutChip[] = [];
    const tags = this.chosenTagNames();
    if (tags.length) {
      const value = tags.join(', ');
      chips.push({ key: 'tags', phrase: this.tagChipPhrase(tags.length), value, valueShort: value, removeLabel: 'Remove the tags filter' });
    }
    if (this.selectedWorkshopIds?.size) {
      const value = this.chosenWorkshopTitles().join(', ');
      chips.push({
        key: 'workshops',
        phrase: this.workshopFilterMode === 'exclude' ? 'Workshops, excluding' : 'Workshops, including',
        value, valueShort: value, removeLabel: 'Remove the workshops filter'
      });
    }
    if (this.hasDateFilter) {
      chips.push({
        key: 'created', phrase: 'Created',
        value: this.formatRange(this.startDate, this.endDate, true),
        valueShort: this.formatRange(this.startDate, this.endDate, false),
        removeLabel: 'Remove the created date filter'
      });
    }
    if (this.convertedFilter) {
      const value = this.convertedFilter === 'converted' ? 'Converted' : 'Not converted';
      chips.push({ key: 'conversion', phrase: 'Conversion', value, valueShort: value, removeLabel: 'Remove the conversion filter' });
    }
    return chips;
  }

  private tagChipPhrase(n: number): string {
    if (this.selectByTagPolarity === 'exclude') {
      return this.selectByTagMode === 'all' && n > 1 ? 'Tags, excluding all of' : 'Tags, excluding';
    }
    if (n === 1) return 'Tags';
    return this.selectByTagMode === 'all' ? 'Tags, all of' : 'Tags, any of';
  }

  /** The chip × and the no-match chip × (one filter only). */
  removeChip(key: FilterKey): void {
    switch (key) {
      case 'tags': this.clearTagFilter(); break;
      case 'workshops': this.clearWorkshopFilter(); break;
      case 'created': this.clearDates(); break;
      case 'conversion': this.clearConvertedFilter(); break;
    }
  }

  // ---- no match ----

  private buildNoMatchReasons(): NoMatchReason[] {
    const rows: any[] = this.dataSource?.data || [];
    const f = this.filterState;
    const count = (pass: (u: any) => boolean): number => {
      let n = 0;
      for (const u of rows) if (pass(u)) n++;
      return n;
    };
    const out: NoMatchReason[] = [];
    if (f.q) {
      out.push({
        key: 'search', phrase: 'Search', value: `“${(this.searchText || '').trim()}”`,
        count: count(u => this.matchSearch(u, f)), removeLabel: 'Clear the search'
      });
    }
    for (const chip of this.readoutChips) {
      let c: number | null = null;
      if (chip.key === 'tags') c = count(u => this.matchTags(u, f));
      else if (chip.key === 'created') c = count(u => this.matchCreated(u, f));
      else if (chip.key === 'conversion') c = count(u => this.matchConversion(u, f));
      else if (chip.key === 'workshops') c = this.workshopProfileIds ? count(u => this.matchWorkshops(u, f)) : null;
      out.push({ key: chip.key, phrase: chip.phrase, value: chip.value, count: c, removeLabel: chip.removeLabel });
    }
    return out;
  }

  removeReason(key: FilterKey | 'search'): void {
    if (key === 'search') this.clearSearch();
    else this.removeChip(key);
  }

  // =====================================================================================
  // Search suggestions
  // =====================================================================================

  /** Rebuilds the suggestion list from the typed text: tags (with counts) and loaded workshops. */
  updateSuggestions(): void {
    const q = (this.searchText || '').trim().toLowerCase();
    if (q.length < 2) {
      this.suggestions = [];
      this.suggestOpen = false;
      this.suggestActive = -1;
      this.suggestSearchCount = null;
      return;
    }
    // Workshop suggestions need the list: read it now (funnel-only when that is on); they join when it lands.
    if (!this.workshopOptionsLoaded && !this.workshopOptionsLoading && this.accessAllowed) this.ensureWorkshopsLoaded();
    const split = (label: string): { before: string; match: string; after: string } => {
      const i = label.toLowerCase().indexOf(q);
      return { before: label.slice(0, i), match: label.slice(i, i + q.length), after: label.slice(i + q.length) };
    };
    const out: SearchSuggestion[] = [];
    for (const t of this.allTags || []) {
      if (out.length >= 3) break;
      if (this.selectByTagIds.has(t.id) || !t.name.toLowerCase().includes(q)) continue;
      out.push({ kind: 'tag', id: t.id, label: t.name, ...split(t.name), count: this.tagCount(t.id) });
    }
    if (this.workshopOptionsLoaded) {
      let n = 0;
      for (const w of this.visibleWorkshopOptions) {
        if (n >= 2) break;
        if (this.selectedWorkshopIds.has(w.id) || !w.title.toLowerCase().includes(q)) continue;
        out.push({ kind: 'workshop', id: w.id, label: w.title, ...split(w.title), count: this.cachedWorkshopCount(w.id) });
        n++;
      }
    }
    this.suggestions = out;
    this.suggestOpen = out.length > 0;
    if (this.suggestActive >= out.length) this.suggestActive = -1;
    this.suggestSearchCount = this.suggestOpen ? this.countSearchOnly(q) : null;
  }

  /** People among the in-memory list enrolled in a workshop, only when its enrolment read is cached. */
  private cachedWorkshopCount(id: string): number | null {
    const enrolled = this.enrolledCache.get(id);
    if (!enrolled) return null;
    const set = new Set(enrolled);
    let n = 0;
    for (const u of this.dataSource?.data || []) {
      if (set.has((u?.profileid || this.rowId(u) || '').toString())) n++;
    }
    return n;
  }

  private countSearchOnly(q: string): number {
    let n = 0;
    for (const u of this.dataSource?.data || []) if (this.vm(u).haystack.includes(q)) n++;
    return n;
  }

  /** Arrow keys move the highlight; Enter applies a highlighted suggestion, otherwise searches now. */
  onSearchKeydown(event: KeyboardEvent): void {
    const n = this.suggestions.length;
    switch (event.key) {
      case 'ArrowDown':
        if (!n) return;
        event.preventDefault();
        this.suggestOpen = true;
        this.suggestActive = (this.suggestActive + 1) % n;
        return;
      case 'ArrowUp':
        if (!n) return;
        event.preventDefault();
        this.suggestOpen = true;
        this.suggestActive = this.suggestActive <= 0 ? n - 1 : this.suggestActive - 1;
        return;
      case 'Enter':
        if (this.suggestOpen && this.suggestActive >= 0 && this.suggestActive < n) {
          event.preventDefault();
          this.applySuggestion(this.suggestions[this.suggestActive]);
        } else {
          this.closeSuggestions();
          this.commitSearch();
        }
        return;
      case 'Escape':
      case 'Tab':
        this.closeSuggestions();
        return;
      default:
        return;
    }
  }

  closeSuggestions(): void {
    this.suggestOpen = false;
    this.suggestActive = -1;
  }

  /** Turns a suggestion into a filter and clears the typed text. */
  applySuggestion(s: SearchSuggestion): void {
    if (!s) return;
    if (this.searchTimer) { clearTimeout(this.searchTimer); this.searchTimer = null; }
    this.searchText = '';
    this.suggestions = [];
    this.closeSuggestions();
    if (s.kind === 'tag') {
      this.selectByTagIds.add(s.id);
      this.refreshFilter();
    } else {
      this.selectedWorkshopIds.add(s.id);
      this.updateDisplayedColumns();
      this.refreshWorkshopFilter();
    }
  }

  // =====================================================================================
  // Panels
  // =====================================================================================

  isPanelOpen(panel: FilterPanel): boolean {
    return this.openPanel === panel;
  }

  /** A pill or tool button: opens its panel, or closes it when it is already open. */
  togglePanel(panel: FilterPanel): void {
    if (this.openPanel === panel) this.closePanel();
    else this.openFilterPanel(panel);
  }

  openFilterPanel(panel: FilterPanel): void {
    this.closeSuggestions();
    this.openPanel = panel;
    if (panel === 'tags') {
      this.tagFind = '';
      this.tagOrderSnapshot = new Set(this.selectByTagIds);
      this.rebuildTagPanelLists();
    } else if (panel === 'workshops') {
      this.workshopFind = '';
      this.ensureWorkshopsLoaded();
    } else if (panel === 'created') {
      this.syncDateTexts();
      this.calMonth = NewusersprofileComponent.monthStart(this.validDate(this.startDate) || this.validDate(this.endDate) || new Date());
      this.calPickingEnd = !!this.validDate(this.startDate) && !this.validDate(this.endDate);
      this.rebuildCalendar();
    }
  }

  closePanel(): void {
    if (this.openPanel === 'created') {
      this.commitDateText('from');
      this.commitDateText('to');
    }
    if (this.openPanel === 'tags') {
      this.tagOrderSnapshot = null;
      this.tagFindText = '';
      this.rebuildTagPanelLists();
    }
    this.openPanel = null;
  }

  /**
   * (overlayOutsideClick) handler: closes the open panel unless the click landed on one of `ignore` (the
   * panel's own trigger), so the trigger's own (click) can toggle it without a flicker.
   */
  onPanelOutsideClick(event: Event, ...ignore: Array<HTMLElement | ElementRef<HTMLElement> | null | undefined>): void {
    const target = event?.target as Node | null;
    for (const el of ignore) {
      const node = (el as ElementRef<HTMLElement>)?.nativeElement ?? (el as HTMLElement);
      if (node && target && typeof (node as HTMLElement).contains === 'function' && (node as HTMLElement).contains(target)) return;
    }
    this.closePanel();
  }

  /** (overlayKeydown) handler: Escape closes the open panel and gives focus back to its trigger. */
  onOverlayKeydown(event: KeyboardEvent, trigger?: HTMLElement | ElementRef<HTMLElement> | null): void {
    if (event?.key === 'Escape') {
      event.preventDefault?.();
      this.closePanelAndFocus(trigger);
    }
  }

  /** Done (and Escape): close, and return focus to the pill or button that opened the panel. */
  closePanelAndFocus(trigger?: HTMLElement | ElementRef<HTMLElement> | null): void {
    this.closePanel();
    const el = (trigger as ElementRef<HTMLElement>)?.nativeElement ?? (trigger as HTMLElement | null | undefined);
    if (this.isBrowser && el && typeof el.focus === 'function') setTimeout(() => el.focus({ preventScroll: true }));
  }

  /**
   * (detach) of a panel overlay. The CDK detaches on its own only for Escape; a detach caused by another
   * panel opening must not close that new panel, so only the panel that is still open is closed.
   */
  onPanelDetach(panel: FilterPanel): void {
    if (this.openPanel === panel) this.closePanel();
  }

  /** Conversion menu: arrow keys, Home and End move between the three options. */
  onMenuKeydown(event: KeyboardEvent): void {
    const root = event?.currentTarget as HTMLElement | null;
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[role="menuitemradio"]:not([disabled])'));
    if (!items.length) return;
    const i = items.indexOf(root.ownerDocument?.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = i < 0 ? 0 : (i + 1) % items.length; break;
      case 'ArrowUp': next = i <= 0 ? items.length - 1 : i - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    items[next].focus();
  }

  /** Same idea for the suggestions list (the search field itself is excluded). */
  onSuggestOutsideClick(event: Event, ...ignore: Array<HTMLElement | ElementRef<HTMLElement> | null | undefined>): void {
    const target = event?.target as Node | null;
    for (const el of ignore) {
      const node = (el as ElementRef<HTMLElement>)?.nativeElement ?? (el as HTMLElement);
      if (node && target && typeof (node as HTMLElement).contains === 'function' && (node as HTMLElement).contains(target)) return;
    }
    this.closeSuggestions();
  }

  // ---- tags panel ----

  tagCount(id: string): number {
    return this.tagCounts?.[id] || 0;
  }

  onTagFind(value: string): void {
    this.tagFind = value || '';
  }

  /** Chosen tags first (as chosen when the panel opened), then the rest; narrowed by Find. */
  private rebuildTagPanelLists(): void {
    const find = (this.tagFind || '').trim().toLowerCase();
    const chosen = this.tagOrderSnapshot || this.selectByTagIds || new Set<string>();
    const first: { id: string; name: string }[] = [];
    const rest: { id: string; name: string }[] = [];
    for (const t of this.allTags || []) {
      if (find && !t.name.toLowerCase().includes(find)) continue;
      (chosen.has(t.id) ? first : rest).push(t);
    }
    this.tagPanelChosen = first;
    this.tagPanelRest = rest;
  }

  /** The rule sentence under the Tags switches, e.g. "Hides everyone tagged A or B." */
  get tagRuleParts(): RulePart[] {
    const names = this.chosenTagNames();
    if (!names.length) return [];
    const exclude = this.selectByTagPolarity === 'exclude';
    const all = this.selectByTagMode === 'all' && names.length > 1;
    if (!all) {
      return [{ text: exclude ? 'Hides everyone tagged ' : 'Shows people tagged ', bold: false },
        ...NewusersprofileComponent.joinParts(names, 'or'), { text: '.', bold: false }];
    }
    const lead = exclude ? 'Hides people who carry ' : 'Shows only people who carry ';
    const quant = names.length === 2 ? 'both ' : 'all of ';
    return [{ text: lead + quant, bold: false }, ...NewusersprofileComponent.joinParts(names, 'and'), { text: '.', bold: false }];
  }

  get tagRuleText(): string {
    return this.tagRuleParts.map(p => p.text).join('');
  }

  /** Chosen tag names in list order (alphabetical); a removed tag still reads as one. */
  private chosenTagNames(): string[] {
    const ids = this.selectByTagIds;
    if (!ids?.size) return [];
    const names = (this.allTags || []).filter(t => ids.has(t.id)).map(t => t.name);
    const known = new Set((this.allTags || []).map(t => t.id));
    ids.forEach(id => { if (!known.has(id)) names.push(this.tagMap?.[id] || 'a removed tag'); });
    return names;
  }

  // ---- workshops panel ----

  /** The cached list covers what the panel offers right now. */
  get workshopOptionsLoaded(): boolean {
    return this.workshopScope === 'all' || (this.funnelOnly && this.workshopScope === 'funnel');
  }

  /** Every workshop's count, once the full list is cached ("Turn off Funnel only to choose from all N"). */
  get allWorkshopsCount(): number | null {
    return this.workshopScope === 'all' ? this.workshopOptions.length : null;
  }

  /**
   * Reads workshopconfiguration the first time it is needed (Workshops panel, Filters sheet, suggestions):
   * only evergreenWorkshop == true while Funnel only is on, the full list once it is off. Cached here.
   */
  ensureWorkshopsLoaded(): Promise<void> {
    if (this.workshopOptionsLoaded) return Promise.resolve();
    const want: 'funnel' | 'all' = this.funnelOnly ? 'funnel' : 'all';
    if (this.workshopPending && (this.workshopPending.scope === 'all' || this.workshopPending.scope === want)) {
      return this.workshopPending.promise;
    }
    this.workshopOptionsLoading = true;
    this.workshopOptionsError = false;
    const promise = this.fetchWorkshopOptions(want === 'funnel')
      .then(list => {
        if (this.destroyed) return;
        // A funnel read that lands after the full list must not shrink it.
        if (want === 'funnel' && this.workshopScope === 'all') return;
        this.workshopOptions = list.sort((a, b) => a.title.localeCompare(b.title));
        this.workshopScope = want;
        const titles: Record<string, string> = { ...this.workshopTitleById };
        list.forEach(w => (titles[w.id] = w.title));
        this.workshopTitleById = titles;
        this.vmVersion++;
        this.afterFilterChange();
        if (this.searchText) this.updateSuggestions();
      })
      .catch(err => {
        if (this.destroyed) return;
        console.error('Error loading workshops:', err);
        this.workshopOptionsError = true;
      })
      .finally(() => {
        if (this.workshopPending?.promise === promise) {
          this.workshopPending = null;
          this.workshopOptionsLoading = false;
        }
      });
    this.workshopPending = { scope: want, promise };
    return promise;
  }

  private async fetchWorkshopOptions(funnelOnly: boolean): Promise<{ id: string; title: string; evergreen: boolean }[]> {
    const ref = collection(this.firestore, 'workshopconfiguration');
    const snap = await getDocs(funnelOnly ? query(ref, where('evergreenWorkshop', '==', true)) : ref);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: (data?.['detailpage']?.['title'] || 'Untitled workshop').toString(),
        evergreen: data?.['evergreenWorkshop'] === true
      };
    });
  }

  // Options offered in the dropdown; Funnel only narrows to evergreen configs.
  get visibleWorkshopOptions(): { id: string; title: string; evergreen: boolean }[] {
    return this.funnelOnly ? this.workshopOptions.filter(w => w.evergreen) : this.workshopOptions;
  }

  /** visibleWorkshopOptions narrowed by Find a workshop (memoised). */
  get filteredWorkshopOptions(): { id: string; title: string; evergreen: boolean }[] {
    const m = this.wsOptionsMemo;
    const find = (this.workshopFind || '').trim().toLowerCase();
    if (m.opts !== this.workshopOptions || m.funnel !== this.funnelOnly || m.find !== find) {
      m.opts = this.workshopOptions;
      m.funnel = this.funnelOnly;
      m.find = find;
      m.out = this.visibleWorkshopOptions.filter(w => !find || w.title.toLowerCase().includes(find));
    }
    return m.out;
  }

  /** "Shows people enrolled in W, with a Workshop column." / "Hides people enrolled in W. No Workshop column." */
  get workshopRuleParts(): RulePart[] {
    const titles = this.chosenWorkshopTitles();
    if (!titles.length) return [];
    const exclude = this.workshopFilterMode === 'exclude';
    return [
      { text: exclude ? 'Hides people enrolled in ' : 'Shows people enrolled in ', bold: false },
      ...NewusersprofileComponent.joinParts(titles, 'or'),
      { text: exclude ? '. No Workshop column.' : ', with a Workshop column.', bold: false },
    ];
  }

  get workshopRuleText(): string {
    return this.workshopRuleParts.map(p => p.text).join('');
  }

  /** "Winning Heart – Workshop", or "2 workshops", for "Loading the people enrolled in …". */
  get loadingWorkshopLabel(): string {
    const titles = this.chosenWorkshopTitles();
    return titles.length === 1 ? titles[0] : `${titles.length} workshops`;
  }

  private chosenWorkshopTitles(): string[] {
    return [...(this.selectedWorkshopIds || [])].map(id => this.workshopTitleById?.[id] || 'a workshop');
  }

  setFunnelOnly(on: boolean): void {
    if (this.funnelOnly === on) return;
    this.funnelOnly = on;
    if (!on) {
      // The full list is a separate, larger read: only now.
      this.ensureWorkshopsLoaded();
      return;
    }
    // Selections that are no longer offered would filter invisibly — drop them.
    let changed = false;
    [...this.selectedWorkshopIds].forEach(id => {
      const opt = this.workshopOptions.find(w => w.id === id);
      if (opt && !opt.evergreen) {
        this.selectedWorkshopIds.delete(id);
        changed = true;
      }
    });
    if (changed) {
      this.updateDisplayedColumns();
      this.refreshWorkshopFilter();
    }
  }

  // Switching include/exclude reuses the already-loaded enrolled sets — no refetch.
  setWorkshopFilterMode(mode: 'include' | 'exclude'): void {
    if (this.workshopFilterMode === mode) return;
    this.workshopFilterMode = mode;
    this.updateDisplayedColumns();
    this.refreshFilter();
  }

  toggleWorkshopSelect(id: string): void {
    if (this.selectedWorkshopIds.has(id)) this.selectedWorkshopIds.delete(id);
    else this.selectedWorkshopIds.add(id);
    this.updateDisplayedColumns();
    this.refreshWorkshopFilter();
  }

  // Resolve the selected workshops' doc refs against `workshop participant
  // enrolled` (workshopref == ref) and keep only rows whose profileid is
  // enrolled in at least one of them. Reads are per-workshop and cached —
  // never a scan of the whole (huge) enrolled collection.
  private async refreshWorkshopFilter(): Promise<void> {
    const ids = [...this.selectedWorkshopIds];
    const token = ++this.workshopFilterToken;

    if (!ids.length) {
      this.workshopProfileIds = null;
      this.workshopsByProfile.clear();
      this.workshopFilterLoading = false;
      this.vmVersion++;
      this.refreshFilter();
      return;
    }

    this.workshopFilterLoading = true;
    this.workshopProfileIds = null; // predicate hides rows while loading
    // Clear now (not just on completion) so a mid-load export can't read the previous selection's titles.
    this.workshopsByProfile.clear();
    this.vmVersion++;
    this.refreshFilter();

    try {
      const uncached = ids.filter(id => !this.enrolledCache.has(id));
      await Promise.all(uncached.map(async id => {
        const workshopref = doc(this.firestore, 'workshopconfiguration', id);
        const snap = await getDocs(query(
          collection(this.firestore, 'workshop participant enrolled'),
          where('workshopref', '==', workshopref)
        ));
        this.enrolledCache.set(
          id,
          snap.docs.map(d => (d.data()?.['profileid'] || '').toString()).filter(Boolean)
        );
      }));
      if (this.destroyed || token !== this.workshopFilterToken) return; // superseded by a newer change
      const set = new Set<string>();
      const byProfile = new Map<string, string[]>();
      ids.forEach(id => (this.enrolledCache.get(id) || []).forEach(p => {
        set.add(p);
        const list = byProfile.get(p) || [];
        list.push(id);
        byProfile.set(p, list);
      }));
      this.workshopProfileIds = set;
      this.workshopsByProfile = byProfile;
    } catch (err) {
      if (this.destroyed) return;
      console.error('Error loading enrolled participants:', err);
      if (token === this.workshopFilterToken) {
        // Fail closed in BOTH modes: null keeps the predicate hiding rows. An
        // empty set would fail open in exclude mode — every profile would
        // count as "not enrolled" and show up.
        this.workshopProfileIds = null;
        this.workshopsByProfile.clear();
        this.snackBar.open('Error loading enrolled participants. Please try again.', 'Close', { duration: 3000 });
      }
    } finally {
      if (!this.destroyed && token === this.workshopFilterToken) {
        this.workshopFilterLoading = false;
        this.vmVersion++;
        this.refreshFilter();
      }
    }
  }

  clearWorkshopFilter(): void {
    this.resetWorkshopFilter();
    this.refreshFilter();
  }

  private resetWorkshopFilter(): void {
    this.selectedWorkshopIds.clear();
    this.workshopProfileIds = null;
    this.workshopsByProfile.clear();
    this.workshopFilterLoading = false;
    this.workshopFilterMode = 'include'; // back to the default; funnelOnly is a list preference, kept
    this.workshopFilterToken++; // invalidate any in-flight load
    this.vmVersion++;
    this.updateDisplayedColumns();
  }

  // Titles for the `workshop` column: the selected workshops this profile is enrolled in.
  workshopNames(u: any): string[] {
    return this.vm(u).workshopNames;
  }

  private computeWorkshopNames(u: any): string[] {
    const pid = (u?.profileid || this.rowId(u) || '').toString();
    return (this.workshopsByProfile.get(pid) || [])
      .map(id => this.workshopTitleById[id])
      .filter(Boolean);
  }

  // ---- tag filter actions ----

  setTagMode(mode: 'all' | 'any'): void {
    this.selectByTagMode = mode;
    this.refreshFilter();
  }

  setTagPolarity(polarity: 'include' | 'exclude'): void {
    if (this.selectByTagPolarity === polarity) return;
    this.selectByTagPolarity = polarity;
    // Exclude reads as "hide anyone with ANY of these tags" — align the mode with that (and with the workshop
    // filter's Exclude). Match all stays selectable afterwards for the rarer "not all of them" case.
    if (polarity === 'exclude') this.selectByTagMode = 'any';
    this.refreshFilter();
  }

  toggleTagSelect(id: string): void {
    if (this.selectByTagIds.has(id)) this.selectByTagIds.delete(id);
    else this.selectByTagIds.add(id);
    if (!this.tagOrderSnapshot) this.rebuildTagPanelLists();
    this.refreshFilter();
  }

  clearTagFilter(): void {
    this.selectByTagIds.clear();
    this.selectByTagPolarity = 'include'; // back to the default
    if (!this.tagOrderSnapshot) this.rebuildTagPanelLists();
    this.refreshFilter();
  }

  // ---- created panel ----

  onDateChange(): void {
    this.syncDateTexts();
    this.refreshDates();
  }

  clearDates(): void {
    this.startDate = null;
    this.endDate = null;
    this.fromText = '';
    this.toText = '';
    this.calPickingEnd = false;
    this.refreshDates();
  }

  /**
   * Applies a typed From/To (on change, blur or Enter). A good date is shown back as "12 Nov 2026"; empty text
   * removes that end; unparseable text is no bound and stays as typed.
   */
  commitDateText(which: 'from' | 'to'): void {
    const text = which === 'from' ? this.fromText : this.toText;
    const parsed = NewusersprofileComponent.parseDay(text);
    const current = which === 'from' ? this.startDate : this.endDate;
    if (parsed && this.sameDay(parsed, current)) {
      this.setDateText(which, this.formatDay(parsed));
      return;
    }
    if (!parsed && !(text || '').trim() && !this.validDate(current)) return;
    if (which === 'from') this.startDate = parsed;
    else this.endDate = parsed;
    if (parsed) {
      this.setDateText(which, this.formatDay(parsed));
      this.calMonth = NewusersprofileComponent.monthStart(parsed);
    }
    this.refreshDates();
  }

  /** Quick ranges. Last 7 days = today−6 to today; This month = the 1st to today. */
  applyPreset(preset: CreatedPreset): void {
    const range = this.presetRange(preset);
    this.startDate = range.start;
    this.endDate = range.end;
    this.calPickingEnd = false;
    this.syncDateTexts();
    this.calMonth = NewusersprofileComponent.monthStart(range.end);
    this.refreshDates();
  }

  /** The preset the current range equals, if any (to mark it). */
  get activePreset(): CreatedPreset | null {
    const s = this.validDate(this.startDate);
    const e = this.validDate(this.endDate);
    if (!s || !e) return null;
    for (const p of ['today', '7d', '30d', 'month'] as CreatedPreset[]) {
      const r = this.presetRange(p);
      if (this.sameDay(r.start, s) && this.sameDay(r.end, e)) return p;
    }
    return null;
  }

  private presetRange(preset: CreatedPreset): { start: Date; end: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const back = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
    switch (preset) {
      case '7d': return { start: back(6), end: today };
      case '30d': return { start: back(29), end: today };
      case 'month': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
      default: return { start: today, end: today };
    }
  }

  /** First click sets From (dropping a To before it); the second sets To, swapped if it falls before From. */
  pickDay(day: Date | CalDay): void {
    const d = this.validDate((day as CalDay)?.date ?? (day as Date));
    if (!d) return;
    const picked = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const start = this.validDate(this.startDate);
    if (!this.calPickingEnd || !start) {
      this.startDate = picked;
      const end = this.validDate(this.endDate);
      if (end && end.getTime() < picked.getTime()) this.endDate = null;
      this.calPickingEnd = true;
    } else {
      if (picked.getTime() < start.getTime()) {
        this.endDate = start;
        this.startDate = picked;
      } else {
        this.endDate = picked;
      }
      this.calPickingEnd = false;
    }
    this.syncDateTexts();
    this.refreshDates();
  }

  shiftMonth(delta: number): void {
    this.calMonth = new Date(this.calMonth.getFullYear(), this.calMonth.getMonth() + delta, 1);
    this.rebuildCalendar();
  }

  /** "November 2026". */
  get calMonthLabel(): string {
    return this.datePipe.transform(this.calMonth, 'MMMM y') || '';
  }

  /** "12 Nov 2026". */
  formatDay(d: Date | null): string {
    const v = this.validDate(d);
    return v ? (this.datePipe.transform(v, 'd MMM y') || '') : '';
  }

  /**
   * Created range in words: "12 Nov 2026", "1 – 15 Nov 2026", "1 Oct – 15 Nov 2026", "from 1 Oct 2026",
   * "until 15 Nov 2026". withYear=false drops the year when both ends share it (phones).
   */
  formatRange(start: Date | null, end: Date | null, withYear = true): string {
    const s = this.validDate(start);
    const e = this.validDate(end);
    const fmt = (d: Date, f: string) => this.datePipe.transform(d, f) || '';
    const full = withYear ? 'd MMM y' : 'd MMM';
    if (s && e) {
      if (s.getFullYear() !== e.getFullYear()) return `${fmt(s, 'd MMM y')} – ${fmt(e, 'd MMM y')}`;
      if (s.getMonth() === e.getMonth()) {
        if (s.getDate() === e.getDate()) return fmt(s, full);
        return `${s.getDate()} – ${fmt(e, full)}`;
      }
      return `${fmt(s, 'd MMM')} – ${fmt(e, full)}`;
    }
    if (s) return `from ${fmt(s, full)}`;
    if (e) return `until ${fmt(e, full)}`;
    return '';
  }

  /**
   * Reads a typed day: "12 nov", "12 Nov 2026", "Nov 12, 2026", D/M/Y numerics ("12/11/2026", "12-11-26",
   * "12.11"), and ISO ("2026-11-12"). A missing year is this year. Returns local midnight, or null.
   */
  static parseDay(text: string | null | undefined): Date | null {
    const t = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!t) return null;
    const year = (y: string | undefined): number | null => {
      if (!y) return new Date().getFullYear();
      const n = parseInt(y, 10);
      if (y.length === 2) return 2000 + n;
      if (y.length === 4) return n;
      return null;
    };
    const make = (y: number | null, m: number, d: number): Date | null => {
      if (y == null || !(m >= 0 && m < 12) || !(d >= 1 && d <= 31)) return null;
      const out = new Date(y, m, d);
      return out.getFullYear() === y && out.getMonth() === m && out.getDate() === d ? out : null;
    };
    const month = (name: string): number => {
      const n = name.replace(/\.$/, '');
      if (n.length < 3) return -1;
      const i = MONTHS.findIndex(m => n.startsWith(m));
      if (i < 0) return -1;
      // Accept "nov", "november", "sept"; reject words that only share the first three letters.
      const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][i];
      return full.startsWith(n) || n === 'sept' ? i : -1;
    };
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (m) return make(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/.exec(t);
    if (m) return make(year(m[3]), +m[2] - 1, +m[1]);
    m = /^(\d{1,2})(?:st|nd|rd|th)?[ \-\/.,]*([a-z]+\.?)(?:[ \-\/.,]+(\d{2}|\d{4}))?$/.exec(t);
    if (m) {
      const mi = month(m[2]);
      return mi < 0 ? null : make(year(m[3]), mi, +m[1]);
    }
    m = /^([a-z]+\.?)[ \-\/.]*(\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{2}|\d{4}))?$/.exec(t);
    if (m) {
      const mi = month(m[1]);
      return mi < 0 ? null : make(year(m[3]), mi, +m[2]);
    }
    return null;
  }

  // Midnight (start) or 23:59:59.999 (end) of the picked day; null when empty or unparseable.
  private dayBound(value: Date | null, edge: 'start' | 'end'): number | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return edge === 'start'
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0).getTime()
      : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999).getTime();
  }

  // Active only when a bound actually narrows the table — an unparseable date must not light the control up.
  get hasDateFilter(): boolean {
    return this.dayBound(this.startDate, 'start') != null
      || this.dayBound(this.endDate, 'end') != null;
  }

  private refreshDates(): void {
    this.rebuildCalendar();
    this.refreshFilter();
  }

  private syncDateTexts(): void {
    this.fromText = this.formatDay(this.startDate);
    this.toText = this.formatDay(this.endDate);
  }

  private setDateText(which: 'from' | 'to', text: string): void {
    if (which === 'from') this.fromText = text;
    else this.toText = text;
  }

  private validDate(value: any): Date | null {
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  }

  private sameDay(a: Date | null, b: Date | null): boolean {
    const x = this.validDate(a);
    const y = this.validDate(b);
    return !!x && !!y && x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }

  private static monthStart(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  /** The month grid: leading blanks, then each day with its range and today flags. */
  private rebuildCalendar(): void {
    const month = this.calMonth || NewusersprofileComponent.monthStart(new Date());
    const y = month.getFullYear();
    const mo = month.getMonth();
    const days = new Date(y, mo + 1, 0).getDate();
    const s = this.dayBound(this.startDate, 'start');
    const e = this.dayBound(this.endDate, 'start');
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const cells: Array<CalDay | null> = [];
    for (let i = 0; i < new Date(y, mo, 1).getDay(); i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, mo, d);
      const ms = date.getTime();
      cells.push({
        date,
        day: d,
        isStart: s != null && ms === s,
        isEnd: e != null && ms === e,
        inRange: s != null && e != null && ms > s && ms < e,
        isToday: Math.abs(ms - todayMs) < DAY_MS / 2,
        label: this.datePipe ? (this.datePipe.transform(date, 'd MMM y') || '') : '',
      });
    }
    this.calDays = cells;
  }

  // ---- conversion ----

  // The pill's old label; the redesigned pill shows a dot instead, and the readout chip says the value.
  get convertedLabel(): string {
    if (this.convertedFilter === 'converted') return 'Converted';
    if (this.convertedFilter === 'notconverted') return 'Not converted';
    return 'Conversion';
  }

  /** Sets the conversion filter. Picking the active option keeps it; '' is Everyone. */
  setConvertedFilter(value: ConvertedFilter): void {
    const next: ConvertedFilter = value === 'converted' || value === 'notconverted' ? value : '';
    if (this.convertedFilter === next) return;
    this.convertedFilter = next;
    this.updateDisplayedColumns();
    this.refreshFilter();
  }

  /** Conversion panel pick: set and close (menu semantics). */
  pickConversion(value: ConvertedFilter): void {
    this.setConvertedFilter(value);
    if (this.openPanel === 'conversion') this.openPanel = null;
  }

  clearConvertedFilter(): void {
    this.convertedFilter = '';
    this.updateDisplayedColumns();
    this.refreshFilter();
  }

  // =====================================================================================
  // Narrow layout
  // =====================================================================================

  private observeWidth(el: HTMLElement | null): void {
    if (el === this.observedEl) return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedEl = el;
    if (!el || !this.isBrowser || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(entries => {
      const w = entries[entries.length - 1]?.contentRect?.width ?? 0;
      this.zone.run(() => this.applyWidth(w));
    });
    this.resizeObserver.observe(el);
  }

  /** Below 900px the cards, card bar and Filters button show; crossing the line closes the open panels. */
  applyWidth(width: number): void {
    if (!(width > 0) || this.destroyed) return; // a hidden root reports 0: keep the current layout
    const narrow = width < NewusersprofileComponent.NARROW_BELOW_PX;
    this.isPhone = width < NewusersprofileComponent.PHONE_BELOW_PX;
    if (narrow === this.isNarrow) return;
    this.isNarrow = narrow;
    this.openPanel = null;
    this.tagOrderSnapshot = null;
    this.closeSuggestions();
    if (!narrow) {
      this.filtersSheetOpen = false;
      this.sheetView = 'main';
    }
  }

  openFiltersSheet(): void {
    this.openPanel = null;
    this.closeSuggestions();
    this.sheetView = 'main';
    this.filtersSheetOpen = true;
  }

  closeFiltersSheet(): void {
    this.commitDateText('from');
    this.commitDateText('to');
    this.filtersSheetOpen = false;
    this.sheetView = 'main';
  }

  setSheetView(view: 'main' | 'tags' | 'workshops'): void {
    this.sheetView = view;
    if (view === 'tags') {
      this.tagFind = '';
      this.rebuildTagPanelLists();
    } else if (view === 'workshops') {
      this.workshopFind = '';
      this.ensureWorkshopsLoaded();
    }
  }

  /** The card Sort select's current option, read off MatSort. */
  get cardSortKey(): string {
    const active = this.sortRef?.active || '';
    const dir = this.sortRef?.direction || '';
    if (!active || !dir) return 'newest';
    for (const [key, s] of Object.entries(NewusersprofileComponent.CARD_SORTS)) {
      if (s.active === active && s.direction === dir) return key;
    }
    return '';
  }

  /** Options for the card Sort select; "Recently moved on" joins while Converted is on. */
  get cardSortChoices(): { key: string; label: string }[] {
    return this.convertedFilter === 'converted'
      ? [...this.cardSortOptions, { key: 'movedon', label: 'Recently moved on' }]
      : this.cardSortOptions;
  }

  /** Drives the same MatSort the header uses ('newest' = no active sort, the data order). */
  setCardSort(key: string): void {
    const s = NewusersprofileComponent.CARD_SORTS[key];
    const sort = this.sortRef;
    if (!s || !sort) return;
    sort.active = s.active;
    sort.direction = s.direction;
    sort.sortChange.emit({ active: s.active, direction: s.direction });
  }

  // =====================================================================================
  // Selection
  // =====================================================================================

  rowId(u: any): string {
    return u?.id || u?.docid || '';
  }

  /** Selected ids among the filtered rows; recomputed only when the selection or the filtered set changes. */
  private get selectedMatchingCount(): number {
    const sel = this.selection.selected;
    const set = this.filteredIdSet;
    const m = this.selMemo;
    if (m.sel !== sel || m.set !== set) {
      let n = 0;
      for (const id of sel) if (set.has(id)) n++;
      m.sel = sel;
      m.set = set;
      m.matching = n;
    }
    return m.matching;
  }

  /** Every filtered person (on every page) is selected. */
  isAllSelected(): boolean {
    const size = this.filteredIdSet.size;
    return size > 0 && this.selectedMatchingCount === size;
  }

  someSelected(): boolean {
    return this.selection.hasValue() && !this.isAllSelected();
  }

  /** Header box: selects everyone who matches, on every page; clears them when all are selected. */
  masterToggle(): void {
    const ids = [...this.filteredIdSet].filter(Boolean);
    if (this.isAllSelected()) this.deselectIds(ids);
    else this.selectIds(ids);
  }

  /** Dock "Select all N matching": select only, never toggles off. */
  selectAllMatching(): void {
    this.selectIds([...this.filteredIdSet].filter(id => id && !this.selection.isSelected(id)));
  }

  /** "Select only this page" / "Only this page": exactly the rows rendered on the current page. */
  onlyThisPage(): void {
    const ids = (this.pageRows || []).map(u => this.rowId(u)).filter(Boolean);
    this.selection.clear();
    this.selectIds(ids);
  }

  selectOnlyThisPage(): void {
    this.onlyThisPage();
  }

  /** Bulk select in slices, so a very long list never overflows the call's argument limit. */
  private selectIds(ids: string[]): void {
    for (let i = 0; i < ids.length; i += 5000) this.selection.select(...ids.slice(i, i + 5000));
  }

  private deselectIds(ids: string[]): void {
    for (let i = 0; i < ids.length; i += 5000) this.selection.deselect(...ids.slice(i, i + 5000));
  }

  /** Everyone matching is selected and some of them are on other pages (the cross-page banner). */
  get allMatchingSelected(): boolean {
    return this.isAllSelected() && this.filteredIdSet.size > (this.pageRows?.length || 0);
  }

  /** Selected matching people not on this page ("including 128 on other pages"). */
  get selectedOffPage(): number {
    const onPage = (this.pageRows || []).filter(u => this.selection.isSelected(this.rowId(u))).length;
    return Math.max(0, this.selectedMatchingCount - onPage);
  }

  /** Selected people the current filters or search are hiding — they still get any bulk action. */
  get hiddenSelectedCount(): number {
    if (!this.selection.hasValue()) return 0;
    return this.selection.selected.length - this.selectedMatchingCount;
  }

  get bulkCount(): number {
    return this.selection.selected.length;
  }

  /** The bulk tag write is running: every dock action is disabled. */
  get updatingTags(): boolean {
    return this.applyingBulk;
  }

  clearSelection(): void {
    this.selection.clear();
    this.showExport = false;
    this.showComm = false;
  }

  // =====================================================================================
  // Export
  // =====================================================================================

  // Export and Send open one panel at a time above the selection bar.
  toggleExport(): void {
    this.showExport = !this.showExport;
    if (this.showExport) {
      this.showComm = false;
      this.maybeLoadReferrers();
    }
  }

  selectAllExportColumns(): void {
    this.selectedExportKeys = this.exportColumnsView.map(c => c.key);
    this.maybeLoadReferrers();
  }

  exportLabel(key: string): string {
    return NewusersprofileComponent.EXPORT_DISPLAY_LABELS[key] || key;
  }

  isExportKeyOn(key: string): boolean {
    return this.selectedExportKeys.includes(key);
  }

  /** Workshop and Moved On are offered only while their filters are on. */
  isExportColumnOffered(key: string): boolean {
    return this.exportColumnsView.some(c => c.key === key);
  }

  toggleExportKey(key: string): void {
    if (this.isExportKeyOn(key)) this.selectedExportKeys = this.selectedExportKeys.filter(k => k !== key);
    else this.selectedExportKeys = [...this.selectedExportKeys, key];
    if (key === 'referredby') this.maybeLoadReferrers();
  }

  /** Chosen columns the panel offers right now (a lingering hidden key does not count). */
  get exportColumnCount(): number {
    return this.exportColumnsView.filter(c => this.selectedExportKeys.includes(c.key)).length;
  }

  /** Selected people that are in the list (hidden ones included). */
  get exportRowCount(): number {
    const sel = this.selection.selected;
    const m = this.exportRowsMemo;
    if (m.sel !== sel || m.byId !== this.dataById) {
      let n = 0;
      for (const id of sel) if (this.dataById.has(id)) n++;
      m.sel = sel;
      m.byId = this.dataById;
      m.n = n;
    }
    return m.n;
  }

  /** Why Download is disabled: '' when it is not. */
  get exportDisabledReason(): '' | 'workshop-loading' | 'no-columns' | 'no-rows' {
    if (this.workshopFilterLoading) return 'workshop-loading';
    if (this.exportColumnCount === 0) return 'no-columns';
    if (this.exportRowCount === 0) return 'no-rows';
    return '';
  }

  get exportReasonText(): string {
    switch (this.exportDisabledReason) {
      case 'workshop-loading': return 'The Workshop column is still reading its people';
      case 'no-columns': return 'Choose at least one column';
      case 'no-rows': return 'No one selected is in the list';
      default: return '';
    }
  }

  /** "Excel file · 6 columns · 5 rows". */
  get exportSummaryText(): string {
    const c = this.exportColumnCount;
    const r = this.exportRowCount;
    return `Excel file · ${c} column${c === 1 ? '' : 's'} · ${r} row${r === 1 ? '' : 's'}`;
  }

  async exportExcel(): Promise<void> {
    if (this.workshopFilterLoading) {
      this.snackBar.open('Workshop filter is still loading. Please wait.', 'Close', { duration: 3000 });
      return;
    }
    const cols = this.exportColumnsView.filter(c => this.selectedExportKeys.includes(c.key));
    if (cols.length === 0) {
      this.snackBar.open('Select at least one column to export.', 'Close', { duration: 3000 });
      return;
    }
    const users = this.selection.selected.map(id => this.dataById.get(id)).filter(Boolean);
    if (users.length === 0) {
      this.snackBar.open('No profiles selected.', 'Close', { duration: 3000 });
      return;
    }
    // Referrer names are read lazily: make sure they are in before the file is built.
    if (cols.some(c => c.key === 'referredby')) await this.loadReferrerNames();
    const XLSX = await import('xlsx');
    if (this.destroyed) return;

    // Build rows in the chosen column order (read-only — no DB writes).
    const rows = users.map(u => {
      const row: Record<string, string> = {};
      cols.forEach(c => (row[c.label] = c.value(u)));
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: cols.map(c => c.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'New Users');
    const stamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `new_users_${stamp}.xlsx`);
    this.snackBar.open(`Exported ${users.length} profile${users.length === 1 ? '' : 's'}.`, 'Close', { duration: 2500 });
  }

  // ---- send panel ----

  /** Everyone selected, hidden people included. */
  get sendCount(): number {
    return this.selection.selected.length;
  }

  toggleComm(): void {
    this.showComm = !this.showComm;
    if (this.showComm) this.showExport = false;
  }

  // =====================================================================================
  // Select from file
  // =====================================================================================

  /** Header button: toggles the popover that states the file rule. */
  openImport(): void {
    this.togglePanel('import');
  }

  /** Old entry point, kept for the current template: opens the file picker directly. */
  importFromExcel(): void {
    this.pickImportFile();
  }

  /** "Choose file": closes the popover and opens the native picker (.xlsx / .xls). */
  pickImportFile(): void {
    if (this.openPanel === 'import') this.openPanel = null;
    if (!this.isBrowser || this.importing) return;
    const input = document.createElement('input');
    this.importFileInput = input;
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) this.processImportFile(file);
    };
    input.click();
  }

  get importBusyLabel(): string {
    return this.importing ? `Reading ${this.importingName || 'file'}…` : '';
  }

  /**
   * Reads an Excel file: A1 headed "email", emails from row 2 down. The matching people replace the selection;
   * the outcome goes to the file banner (fileResult) instead of snackbars.
   */
  async processImportFile(file: File): Promise<void> {
    const fileName = file?.name || 'file';
    const lower = fileName.toLowerCase();
    this.showUnmatched = false;
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      this.fileResult = this.emptyFileResult('not-excel', fileName);
      return;
    }
    this.importing = true;
    this.importingName = fileName;
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      if (this.destroyed) return;
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        this.fileResult = this.emptyFileResult('no-sheet', fileName);
        return;
      }
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      const head = (rows[0]?.[0] ?? '').toString().trim().toLowerCase();
      if (head !== 'email') {
        this.fileResult = this.emptyFileResult('bad-heading', fileName);
        return;
      }
      this.applyImportedEmails(fileName, rows.slice(1).map(r => r?.[0]));
    } catch (err) {
      if (this.destroyed) return;
      console.warn('Could not read the Excel file:', err);
      this.fileResult = this.emptyFileResult('error', fileName);
    } finally {
      this.importing = false;
      this.importingName = '';
    }
  }

  /** The matching half of an import (column A values below the heading). Exposed for tests. */
  applyImportedEmails(fileName: string, cells: any[]): FileImportResult {
    const values = (cells || []).map(v => (v ?? '').toString().trim().toLowerCase()).filter(Boolean);
    // Stray notes/numbers in column A would inflate the counts — keep email-shaped values only and report the rest.
    const emailList = values.filter(v => v.includes('@'));
    const invalid = values.length - emailList.length;
    const emails = new Set(emailList);
    if (emails.size === 0) {
      const r = { ...this.emptyFileResult('no-emails', fileName), invalid };
      this.fileResult = r;
      return r;
    }
    // Work out the matches BEFORE touching the selection — a zero-match import must not destroy the selection.
    const matchedIds: string[] = [];
    const matched = new Set<string>();
    for (const u of this.dataSource?.data || []) {
      const mail = (u?.email || '').toString().trim().toLowerCase();
      if (mail && emails.has(mail)) {
        const id = this.rowId(u);
        if (id) {
          matchedIds.push(id);
          matched.add(mail);
        }
      }
    }
    const unmatched = [...emails].filter(e => !matched.has(e));
    const base: FileImportResult = {
      kind: 'ok', fileName, total: emails.size, matched: matched.size, selectedCount: matchedIds.length,
      missing: emails.size - matched.size, invalid, replaced: false, matchedIds, unmatched,
    };
    if (!matchedIds.length) {
      const r = { ...base, kind: 'none' as FileResultKind };
      this.fileResult = r;
      return r;
    }
    // Select exactly the imported emails (matched case-insensitively).
    base.replaced = this.selection.selected.length > 0;
    this.selection.clear();
    this.selectIds(matchedIds);
    this.fileResult = base;
    return base;
  }

  private emptyFileResult(kind: FileResultKind, fileName: string): FileImportResult {
    return {
      kind, fileName, total: 0, matched: 0, selectedCount: 0, missing: 0, invalid: 0,
      replaced: false, matchedIds: [], unmatched: [],
    };
  }

  /** Of the people the file selected, how many the current filters hide (live, not a snapshot). */
  get fileResultHiddenCount(): number {
    const r = this.fileResult;
    if (!r || r.kind !== 'ok') return 0;
    const sel = this.selection.selected;
    const set = this.filteredIdSet;
    const m = this.fileHiddenMemo;
    if (m.r !== r || m.sel !== sel || m.set !== set) {
      let n = 0;
      for (const id of r.matchedIds) if (this.selection.isSelected(id) && !set.has(id)) n++;
      m.r = r;
      m.sel = sel;
      m.set = set;
      m.n = n;
    }
    return m.n;
  }

  /** Banner variant, title and (warn / danger) message. Null when there is nothing to report. */
  get fileBanner(): FileBanner | null {
    const r = this.fileResult;
    if (!r) return null;
    switch (r.kind) {
      case 'ok':
        return { variant: 'ok', title: `Selected ${r.selectedCount} ${r.selectedCount === 1 ? 'person' : 'people'} from ${r.fileName}`, message: '' };
      case 'none':
        return { variant: 'warn', title: `None of the ${r.total} email${r.total === 1 ? '' : 's'} matched anyone`, message: 'Your selection is unchanged.' };
      case 'bad-heading':
        return { variant: 'danger', title: 'This file can\'t be used', message: 'The first column needs the heading “email”. Fix the heading and choose the file again.' };
      case 'not-excel':
        return { variant: 'danger', title: 'This file can\'t be used', message: 'Choose an Excel file (.xlsx or .xls).' };
      case 'no-sheet':
        return { variant: 'danger', title: 'This file can\'t be used', message: 'The file has no sheets.' };
      case 'no-emails':
        return { variant: 'danger', title: 'This file can\'t be used', message: 'No email addresses were found under the “email” heading.' };
      default:
        return { variant: 'danger', title: 'This file can\'t be used', message: 'The file could not be read. Try again, or choose another file.' };
    }
  }

  toggleUnmatched(): void {
    this.showUnmatched = !this.showUnmatched;
  }

  dismissFileResult(): void {
    this.fileResult = null;
    this.showUnmatched = false;
  }

  // =====================================================================================
  // Tag dialogs
  // =====================================================================================

  /** Per-row pencil / Add tag. */
  async openTags(user: any): Promise<void> {
    await this.openAssignDialog({ user });
  }

  // Toolbar "Manage tags": the same dialog in manage mode (create and rename tags, segment links).
  async openTagsManager(): Promise<void> {
    await this.openAssignDialog({ mode: 'manage' });
  }

  async openBulkTags(): Promise<void> {
    const ids = this.selection.selected;
    if (!ids.length || this.applyingBulk) return;
    const users = ids.map(id => this.dataById.get(id)).filter(Boolean);
    const ref = await this.openAssignDialog({ mode: 'bulk', users });
    ref?.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((result: any) => {
      if (result && (result.add?.length || result.remove?.length)) {
        this.applyTagsToUsers(users, result.add || [], result.remove || []);
      }
    });
  }

  /** Opens AssignTagsDialog (loaded on first use) with the per-tag counts from the in-memory list. */
  private async openAssignDialog(data: Record<string, any>) {
    if (this.dialogOpening) return null;
    this.dialogOpening = true;
    try {
      const { AssignTagsDialogComponent } = await import('./assign-tags-dialog/assign-tags-dialog.component');
      if (this.destroyed) return null;
      return this.dialog.open(AssignTagsDialogComponent, {
        width: '580px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        autoFocus: false,
        panelClass: 'atd-dialog-panel',
        data: { ...data, tagCounts: this.tagCounts }
      });
    } finally {
      this.dialogOpening = false;
    }
  }

  private async applyTagsToUsers(users: any[], add: string[], remove: string[]): Promise<void> {
    this.applyingBulk = true;
    this.updatingTagsCount = users.length;
    this.showExport = false;
    this.showComm = false;
    const batch = writeBatch(this.firestore);
    let changed = 0;

    users.forEach(u => {
      const id = this.rowId(u);
      if (!id) return;
      const existing: string[] = Array.isArray(u.tags) ? u.tags : [];
      // Start from existing, drop removed, add new — Set dedupes so an already-present tag is never duplicated.
      const set = new Set(existing);
      remove.forEach(t => set.delete(t));
      add.forEach(t => set.add(t));
      const merged = [...set];
      const didChange =
        add.some(t => !existing.includes(t)) || remove.some(t => existing.includes(t));
      if (didChange) {
        batch.update(doc(this.firestore, 'new_user_data', id), { tags: merged });
        changed++;
      }
    });

    try {
      if (changed > 0) await batch.commit();
      this.snackBar.open(
        changed > 0
          ? `Tags updated for ${changed} user${changed === 1 ? '' : 's'}.`
          : 'No changes were needed.',
        'Close',
        { duration: 2500 }
      );
      this.selection.clear();
    } catch (err) {
      console.error('Error applying bulk tags:', err);
      this.snackBar.open('Error updating tags. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.applyingBulk = false;
      this.updatingTagsCount = 0;
    }
  }

  // =====================================================================================
  // Column chooser
  // =====================================================================================

  /** The chosen columns, saved earlier in this browser, or the defaults. Unknown keys are dropped. */
  private static loadSavedColumns(): string[] {
    const known = new Set(['name', 'phonenumber', 'email', 'created', 'enable', 'referredby', 'tags']);
    try {
      const saved = JSON.parse(localStorage.getItem(NewusersprofileComponent.COLUMNS_STORAGE_KEY) || 'null');
      if (Array.isArray(saved)) {
        const keys = saved.filter((k: unknown) => typeof k === 'string' && known.has(k));
        if (keys.length) return keys;
      }
    } catch { /* storage blocked or bad value: use the defaults */ }
    return [...NewusersprofileComponent.DEFAULT_COLUMNS];
  }

  private buildColumns(): string[] {
    return ['select', ...this.columnOptions.filter(c => this.visibleColumns.has(c.key)).map(c => c.key)];
  }

  isColumnOn(key: string): boolean {
    return this.visibleColumns.has(key);
  }

  /** "N of 7" on the Columns button. */
  get columnsShownCount(): number {
    return this.columnOptions.filter(c => this.visibleColumns.has(c.key)).length;
  }

  get columnsTotal(): number {
    return this.columnOptions.length;
  }

  /** The last visible column can't be hidden, or the table would have nothing to show. */
  isLastColumn(key: string): boolean {
    return this.visibleColumns.size === 1 && this.visibleColumns.has(key);
  }

  get columnsAreDefault(): boolean {
    const d = NewusersprofileComponent.DEFAULT_COLUMNS;
    return this.visibleColumns.size === d.length && d.every(k => this.visibleColumns.has(k));
  }

  toggleColumn(key: string): void {
    if (this.visibleColumns.has(key)) {
      if (this.isLastColumn(key)) return;
      this.visibleColumns.delete(key);
      this.clearSortIfHidden(key);
    } else {
      this.visibleColumns.add(key);
    }
    this.saveColumns();
    this.updateDisplayedColumns();
    if (key === 'referredby') this.maybeLoadReferrers();
  }

  resetColumns(): void {
    this.visibleColumns = new Set(NewusersprofileComponent.DEFAULT_COLUMNS);
    this.saveColumns();
    this.updateDisplayedColumns();
    // Judge by what is on screen now: Workshop / Moved On are not chooser columns but may still be showing.
    const active = this.sortRef?.active;
    if (active && !this.displayedColumns.includes(active)) this.clearSortIfHidden(active);
  }

  /** Sorting by a column that is no longer on screen would order rows with no visible reason: drop it. */
  private clearSortIfHidden(key: string): void {
    const sort = this.sortRef;
    if (!sort || sort.active !== key) return;
    sort.active = '';
    sort.direction = '';
    sort.sortChange.emit({ active: '', direction: '' });
  }

  private saveColumns(): void {
    try {
      localStorage.setItem(NewusersprofileComponent.COLUMNS_STORAGE_KEY, JSON.stringify([...this.visibleColumns]));
    } catch { /* storage blocked: the choice still holds for this visit */ }
  }

  private updateDisplayedColumns(): void {
    // The Workshop column/export only means something in include mode — in
    // exclude mode every visible row is by definition not enrolled.
    const filterActive = this.selectedWorkshopIds.size > 0;
    const columnActive = filterActive && this.workshopFilterMode === 'include';

    const cols = this.buildColumns();
    const exportCols = [...this.exportColumns];
    if (columnActive) {
      cols.push('workshop');
      exportCols.push(this.workshopExportColumn);
    }
    // The Moved On column/export belongs to the "Converted" side only — the
    // profiles on the other side have no move date to put in it.
    const convertedActive = this.convertedFilter === 'converted';
    if (convertedActive) {
      cols.push('movedon');
      exportCols.push(this.movedonExportColumn);
    }
    this.displayedColumns = cols;
    this.exportColumnsView = exportCols;

    // Sync the export chip selection only when a filter itself turns on/off
    // — not on include/exclude round-trips or workshop toggles — so a manual
    // deselection isn't fought. A lingering key is inert while the view
    // doesn't offer the column.
    if (filterActive !== this.lastWorkshopFilterActive) {
      this.lastWorkshopFilterActive = filterActive;
      if (filterActive) {
        if (!this.selectedExportKeys.includes('workshop')) {
          this.selectedExportKeys = [...this.selectedExportKeys, 'workshop'];
        }
      } else {
        this.selectedExportKeys = this.selectedExportKeys.filter(k => k !== 'workshop');
      }
    }

    if (convertedActive !== this.lastConvertedActive) {
      this.lastConvertedActive = convertedActive;
      if (convertedActive) {
        if (!this.selectedExportKeys.includes('movedon')) {
          this.selectedExportKeys = [...this.selectedExportKeys, 'movedon'];
        }
      } else {
        this.selectedExportKeys = this.selectedExportKeys.filter(k => k !== 'movedon');
      }
    }
  }

  // =====================================================================================
  // helpers
  // =====================================================================================

  /** ["A"] / ["A", " or ", "B"] / ["A", ", ", "B", " or ", "C"] as bold names and plain joints. */
  private static joinParts(names: string[], conj: 'or' | 'and'): RulePart[] {
    const out: RulePart[] = [];
    names.forEach((n, i) => {
      if (i > 0) out.push({ text: i === names.length - 1 ? ` ${conj} ` : ', ', bold: false });
      out.push({ text: n, bold: true });
    });
    return out;
  }

  // ============ Send communication (ported verbatim from workshop-dashboard) ============
  // Selected profiles shaped like the dashboard's participants ({ profileid, metadata }).
  private get filteredParticipants(): any[] {
    return this.selection.selected
      .map(id => this.dataById.get(id))
      .filter(Boolean)
      .map(u => ({
        profileid: u.profileid || this.rowId(u),
        metadata: {
          name: u.name,
          email: u.email,
          phonenumber: u.phonenumber,
          countryCode: u.countryCode || u.countrycode || ''
        }
      }));
  }

  private readonly WHATSAPP_CHUNK_SIZE = 200;
  private readonly CHUNK_DELAY_MS = 1000;

  // ============ Email composer (ported from participants-analytics) ============
  // EmailInputComponent reads `profileid`, `email` and `name` off each entry, so
  // pass the raw user doc with profileid resolved the same way the rest of this
  // component does.
  private get emailRecipients(): any[] {
    return this.selection.selected
      .map(id => this.dataById.get(id))
      .filter(u => u && u.email)
      .map(u => ({ ...u, profileid: u.profileid || this.rowId(u) }));
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }

  async sendEmailToSelectedParicipant() {
    const recipients = this.emailRecipients;
    if (recipients.length === 0) {
      this.openSnackBar('No selected profile has an email address', 'OK');
      return;
    }

    // Loaded on use: the composer pulls in xlsx.
    const { EmailInputComponent } = await import(
      '../../Participants Profile Management/participants-analytics/email-input/email-input.component'
    );
    if (this.destroyed) return;
    let dialogRef = this.dialog.open(EmailInputComponent, {
      data: recipients,
      minWidth: "600px",
      disableClose: true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        console.log(result);

        const docRef = doc(collection(this.firestore, "email archive"), result['docid']);
        if (result['status'] == 'queued' || result['status'] == 'send') {
          await setDoc(docRef, result, { merge: true }).then(() => {
            this.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK");
          }).catch(err => {
            console.log(err);
            this.openSnackBar("Error Sending Email", "OK");
          });
        } else if (result['status'] == 'validated') {
          let url: string;
          if (environment.firebase.projectId == 'starlabs-test') {
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data), {
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log(err);
              console.log("Error: " + err);
            }
          });
        }

      }
    })
  }

  async sendMail() {
    const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'mail' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleDialogResult(result);
    });
  }

  async sendWatti() {
    const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'whatsapp' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleWhatsappChunked(result);
    });
  }

  private async handleWhatsappChunked(result: any) {
    if (result?.action !== 'sent' || result.type !== 'whatsapp') {
      return;
    }

    const { templateName, customParams } = result;
    const participants = this.filteredParticipants
      .filter(participant => {
        const metadata = participant['metadata'];
        return metadata && metadata['phonenumber'] && metadata['name'];
      })
      .map(participant => {
        const metadata = participant['metadata'];
        const name = metadata['name'];
        let cc = metadata['countryCode'] || metadata['countrycode'] || '';
        cc = cc.trim();
        if (cc && !cc.startsWith('+')) cc = '+' + cc;
        let phone = metadata['phonenumber']?.toString().trim() || '';
        phone = phone.replace(/^\+/, '');
        const phonenumber = cc ? `${cc}${phone}` : phone;
        const processedParams = customParams.map((param: any) => ({
          name: param.name,
          value: param.value.replace(/\{\{name\}\}/g, name)
        }));
        return { profileid: participant['profileid'], phonenumber, name, customParams: processedParams };
      });

    if (participants.length === 0) {
      this.snackbarService.show('No valid participants found');
      return;
    }

    const progressDialog = this.dialog.open(WhatsappProgressDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        totalParticipants: participants.length,
        templateName: templateName
      } as WhatsAppProgressData
    });
    const progressComponent = progressDialog.componentInstance;
    const chunks = this.chunkArray(participants, this.WHATSAPP_CHUNK_SIZE);
    const totalChunks = chunks.length;
    progressComponent.updateProgress({ totalChunks });

    let totalSuccess = 0;
    let totalFailed = 0;
    let allErrors: string[] = [];
    let isCancelled = false;
    const cancelSubscription = progressComponent.cancel$.subscribe(() => {
      isCancelled = true;
    });

    const url = this.getCloudFunctionUrl('workshopprogressmessage');
    for (let i = 0; i < chunks.length; i++) {
      if (isCancelled) {
        console.log('Sending cancelled by user');
        break;
      }

      const chunk = chunks[i];
      const chunkIndex = i + 1;

      progressComponent.updateProgress({
        currentChunk: chunkIndex,
        isProcessingChunk: true
      });

      try {
        const chunkPayload = {
          type: 'whatsapp',
          templateName,
          participants: chunk,
          chunkInfo: {
            chunkIndex,
            totalChunks,
            chunkSize: chunk.length
          }
        };

        const response = await firstValueFrom(
          this.http.post<any>(url, chunkPayload, { responseType: 'json' })
        );

        console.log(`Chunk ${chunkIndex}/${totalChunks} response:`, response);
        const chunkSuccess = response.successCount || chunk.length;
        const chunkFailed = response.failureCount || 0;
        totalSuccess += chunkSuccess;
        totalFailed += chunkFailed;
        if (response.errors && Array.isArray(response.errors)) {
          allErrors = [...allErrors, ...response.errors];
        }

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: response.errors || [],
          watiErrors: response.watiErrors || []
        });

      } catch (error: any) {
        console.error(`Failed to send chunk ${chunkIndex}:`, error);
        totalFailed += chunk.length;
        const errorMessage = `Chunk ${chunkIndex} failed: ${error.message || 'Unknown error'}`;
        allErrors.push(errorMessage);

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: [errorMessage]
        });
      }
      if (i < chunks.length - 1 && !isCancelled) {
        await this.delay(this.CHUNK_DELAY_MS);
      }
    }
    cancelSubscription.unsubscribe();

    let finalStatus: 'success' | 'partial' | 'error';
    if (isCancelled) {
      finalStatus = totalSuccess > 0 ? 'partial' : 'error';
    } else if (totalFailed === 0) {
      finalStatus = 'success';
    } else if (totalSuccess > 0) {
      finalStatus = 'partial';
    } else {
      finalStatus = 'error';
    }
    progressComponent.complete(finalStatus);
    const dialogResult = await firstValueFrom(progressDialog.afterClosed());
    console.log('Final sending result:', dialogResult);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCloudFunctionUrl(functionName: string): string {
    const projectId = environment.firebase.projectId;
    const projectUrlMap: Record<string, string> = {
      'test-environment-841c3': `https://us-central1-test-environment-841c3.cloudfunctions.net/${functionName}`,
      'starlabs-test': `https://us-central1-starlabs-test.cloudfunctions.net/${functionName}`,
      'fir-sample-aae4a': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
      'launch-your-legacy-development': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
    };
    return projectUrlMap[projectId] || '';
  }

  private async handleDialogResult(result: any) {
    if (result?.action === 'sent') {
      if (result.type === 'mail') {
        const { subject, message } = result;
        const recipients = this.filteredParticipants
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['email'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            return { profileid: participant['profileid'], email: metadata['email'], name: metadata['name'] };
          });

        if (recipients.length === 0) {
          this.snackbarService.show('No valid recipients found');
          return;
        }

        const bulkPayload = { type: 'mail', subject, message, recipients };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = recipients.length;

          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `Message successfully sent to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Sent to ${successfulSends} participants. Failed to send to ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
        } catch (error) {
          console.error('Failed to send bulk emails:', error);
          this.snackbarService.show('Failed to send bulk emails');
        }

      } else if (result.type === 'whatsapp') {
        const { templateName, customParams } = result;
        const participants = this.filteredParticipants
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['phonenumber'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            const name = metadata['name'];
            let cc = metadata['countryCode'] || metadata['countrycode'] || '';
            cc = cc.trim();
            if (cc && !cc.startsWith('+')) cc = '+' + cc;
            let phone = metadata['phonenumber']?.toString().trim() || '';
            phone = phone.replace(/^\+/, '');
            const fullPhoneNumber = cc ? `${cc}${phone}` : phone;
            const processedParams = customParams.map((param: any) => ({
              name: param.name,
              value: param.value.replace(/\{\{name\}\}/g, name)
            }));
            return { profileid: participant['profileid'], phonenumber: fullPhoneNumber, name, customParams: processedParams };
          });

        if (participants.length === 0) {
          this.snackbarService.show('No valid participants found');
          return;
        }

        const bulkPayload = { type: 'whatsapp', templateName, participants };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = participants.length;
          const broadcastName = res.broadcastName || ' ';
          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `WhatsApp broadcast "${broadcastName}" sent successfully to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Broadcast "${broadcastName}": Sent to ${successfulSends} participants. Failed: ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send WhatsApp message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
        } catch (error) {
          console.error('Failed to send bulk WhatsApp:', error);
          this.snackbarService.show('Failed to send bulk WhatsApp messages');
        }
      }
    } else if (result?.action === 'closed') {
      console.log('closed');
    }
  }

  async sendNotificationinBreakthrough() {
    const { AhNotificationComponent } = await import(
      '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      width: "60vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
      data: this.filteredParticipants
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        var profileID = this.filteredParticipants.map(p => p.profileid);
        var notificationimage = null;
        if (result["notificationimage"] != null) {
          const { getDownloadURL, ref, uploadBytes } = await import('@angular/fire/storage');
          const { getStorage } = await import('firebase/storage');
          const { getApp } = await import('firebase/app');
          const storage = getStorage(getApp());
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(storage, filepath);
            const uploadResult = await uploadBytes(storageRef, result['notificationimage']);
            notificationimage = await getDownloadURL(uploadResult.ref);
          } catch (error) {
            console.log('file upload error', error);
          }
        }
        this.authguard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: profileID,
          receivingapp: result["receivingapp"] ?? "breakthroughsapp",
        }).then(() => {
          alert("A&H Update sent to App user " + profileID.length.toString());
        });
      }
    });
  }
}



//https://eiflix.com?segment=nRpMxgeTYEzhGHEeigrL
// https://eiflix.com/eiflix?segment=3ZLQDG4RiVklI2HUz00D,nRpMxgeTYEzhGHEeigrL