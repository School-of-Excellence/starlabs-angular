import { ChangeDetectorRef, Component, ViewChild, TemplateRef, OnInit, OnDestroy, runInInjectionContext, Injector } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe, KeyValue } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { Firestore, collection, collectionData, query, where, updateDoc, doc, getDocs, orderBy, Timestamp, getDoc, documentId } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { MatDatepickerModule, MatDateRangePicker } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { limit } from '@angular/fire/firestore';  // add 'limit' to the existing firestore import
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

interface TableHeader {
  key: string;
  label: string;
  width?: string;
  type?: 'text' | 'date' | 'currency' | 'number' | 'status' | 'custom' | 'mapped';
  format?: string;
  mapKey?: string;
  mapValue?: string;
  mapData?: { [key: string]: any };
  substringStart?: number;
  substringEnd?: number;
}

interface TabTableConfig {
  headers: TableHeader[];
  dataKey: string;
}

interface CompletionMonth {
  label: string;
  badge: string;
}

interface CompletionSummary {
  totalCompleted: number;
  avgStartToDone: number;
  avgInitToStart: number;
  productsActive: number;
}

interface CompletionTrend {
  type: 'up' | 'down' | 'neutral';
  text: string;
}

interface CompletionProduct {
  name: string;
  subName: string;
  icon: string;
  color: string;
  iconBg: string;
  completed: number;
  bonusCompletions: number;
  purchasedCompletions: number;
  activeSubUsers: number;
  noSubUsers: number;
  avgInitToStart: number;
  avgStartToDone: number;
  eligiblePct: number;
  trendLabel?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
}

interface SlotOverview {
  totalSlots: number;
  booked: number;
  available: number;
  bookingRate: number;
}

interface SlotByProduct {
  name: string;
  booked: number;
  total: number;
  pct: number;
  color: string;
}

interface SpecialistRow {
  name: string;
  role: string;
  product: string;
  productClass: string;
  appointmentsGiven: number;
  booked: number;
  availableSlots: number;
  slotDots: string[];  // 'booked' | 'open' | 'confirmed'
  utilizationPct: number;
  utilizationNote?: string;
  utilizationNoteColor?: string;
}

@Component({
  selector: 'app-delivery-dashboard-clone',
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    MatSlideToggleModule
  ],
  providers: [DatePipe],
  templateUrl: './delivery-dashboard-clone.component.html',
  styleUrl: './delivery-dashboard-clone.component.css'
})

export class DeliveryDashboardCloneComponent {
  @ViewChild('tabGroup') tabGroup: any;
  filterForm: FormGroup;

  // Boolean declarations
  isLoading = true;
  subscriptions: any = {};
  Math = Math;
  isFilterButtonClick = false;

  activeFilter: 'none' | 'readyForInitiation' | 'clearedMoreThan7Days' | 'clearedMoreThan30Days' | 'initiatedToday' | 'welcomeCall' | 'clarityCall' | 'diagnostics' | 'implementation' | 'midReviewDiagnostics' | 'implementationPhase2' | 'finalReview' | 'completed' | 'needsValidation' | 'todayActivity' | 'last7DaysActivity' | 'last30DaysActivity' | 'thisMonthActivity' = 'none';
  selectedProduct: string = 'All Products Overview';
  selectedMonth: Date = new Date();
  displayMonth: string = '';

  //Array declarations
  journeyList = [];
  productList: string[] = [];
  coachesList = [];

  searchText: string = '';
  filteredData: any[] = [];
  fileredStatsData: any[] = [];
  rawProductData = [];

  hideTimeout: any;
  popupData: any = null;

  // Pagination properties
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;
  itemsPerPageOptions = [5, 10, 20, 50, 100];
  currentTabIndex: number = 0;
  paginatedData: any[] = [];

  currentDate = new Date();
  startDate;
  endDate;
  monthyear;

  groupedByProduct = {};
  selectedProductId: string | null = null;
  groupedAll: { [key: string]: any[] } = {};
  groupedFiltered: { [key: string]: any[] } = {};
  groupedThisMonth: { [key: string]: any[] } = {};
  groupedNextMonth: { [key: string]: any[] } = {};
  modalType: 'all' | 'filtered' | 'thismonth' | 'nextmonth' | 'bonus' | 'purchased' = 'all';
  groupedByProfileAll: { [profileId: string]: any[] } = {};
  groupedByProfileFiltered: { [profileId: string]: any[] } = {};
  bonusPackageIds: Set<string> = new Set();
  groupedBonus: { [key: string]: any[] } = {};
  groupedPurchased: { [key: string]: any[] } = {};
  avgInitToStart: { [key: string]: number } = {};
  avgStartToComplete: { [key: string]: number } = {};
  avgModalOpen = false;
  avgModalProductId: string | null = null;
  avgModalType: 'initToStart' | 'startToComplete' = 'initToStart';
  avgModalDetails: any[] = [];
  // Declarations
  funnelData: { [productId: string]: { awaiting: any[], initiated: any[], started: any[], ongoing: any[], completed: any[] } } = {};
  funnelModalOpen = false;
  funnelModalProductId: string | null = null;
  funnelModalType: string = '';
  funnelModalProfiles: { [profileId: string]: any[] } = {};

  // Hidden products (by name)
  hiddenProductNames: Set<string> = new Set([
    'CTD Review',
    'CTD Live Event',
    'SMP Live',
    'SMP Master Class',
    'CTD Master Class',
    'B!G Accelerator March 2025',
    'CPM Modules',
    'Post uP! Review',
    'High Performance Delivered',
    'HPC Implementation',
    'Pattern Interrupt Diagnostics And Implementation',
    'A&H Vitality Booster',
    'Complimentary Review',
    'Covid Support',
    'Test-Glimpse',
    'Breakthrough Extreme Diagnostics & Implementation',
    'Evolution Prep',
    'A&H Custom Motherhood Excellence Solution for Wife'
  ]);

  // Merged product groups: display name -> product names
  mergedGroups: { [groupName: string]: string[] } = {
    'CTD Diagnostics & Implementation': [
      'CTD Diagnostics (Appointment)',
      'CTD Diagnostics & Implementation (Appointment)',
      'CTD Platinum',
      'CTD Diagnostics And Implementation'
    ],
    'EI Solution': [
      'EI Solution',
      'EI Solution for Wife',
      'EI Solution for Husband',
      'EI for Entrepreneurs',
      'EI for Academy Growth',
    ],
    'Critical Support': [
      'Critical Support Diagnostics And Implementation',
      'Critical Support Implementation',
    ],
    'SMP Diagnostics & Implementation': [
      'SMP Diagnostics & Implementation',
      'SMP Diagnostic & Implementation (Appointment)',
    ]
  };

  showHiddenProducts = false;

  // Resolved: group name -> product IDs
  mergedGroupIds: { [groupName: string]: Set<string> } = {};
  productIdToGroup: { [productId: string]: string } = {};
  hiddenProductIds: Set<string> = new Set();

  // Date filter
  selectedTimeFilter: string = 'all';
  dateRangeStart: Date | null = null;
  dateRangeEnd: Date | null = null;
  range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  // Store unfiltered data for re-filtering
  allMatchedProductsRaw: any[] = [];

  showHiddenCompletionProducts: boolean = false;

  get funnelProfileIds(): string[] {
    return Object.keys(this.funnelModalProfiles);
  }

  private allFetchedAppointments: any[] = [];
  journeyFlowLoading: boolean = false;
  journeyMonthPicker = new FormControl<Date>(new Date());

  originalData = {
    awaitingInitiation: { data: [], count: 0 },
    readyForInitiation: { data: [], count: 0 },
    paymentNotCleared: { data: [], count: 0 },
    currentJourneyInitiated: { data: [], count: 0 },
    productOngoing: { data: [], count: 0 },
    stuckCases: { data: [], count: 0 },
    todayActivity: { data: [], count: 0 },
    last7DaysActivity: { data: [], count: 0 },
    last30DaysActivity: { data: [], count: 0 },
    thisMonthActivity: { data: [], count: 0 },

    welcomeCall: { data: [], count: 0 },
    clarityCall: { data: [], count: 0 },
    diagnostics: { data: [], count: 0 },
    implementation: { data: [], count: 0 },
    midReviewDiagnostics: { data: [], count: 0 },
    implementationPhase2: { data: [], count: 0 },
    finalReview: { data: [], count: 0 },
    completed: { data: [], count: 0 },
    needsValidation: { data: [], count: 0 },

    clearedMoreThan30Days: { data: [], count: 0 },
    clearedMoreThan7Days: { data: [], count: 0 },
    initiatedToday: { data: [], count: 0 },

  };

  searchName: string = '';
  filteredOriginalData: any = {};

  // *Abishek Vimal

  // Search participant
  showSearchBar = false;
  showTable = false;

  tableData: any[] = [];
  filteredParticipantData: any = {};

  searchedParticipantHeaders: string[] = [
    'Name',
    'Email',
    'Initiated',
    'Welcome Call',
    'Clarity Call',
    'Diagnostics',
    'Implementation',
    'Mid Review - Diagnostics',
    'Implementation Phase 2',
    'Final Review',
    'Completed',
    'Needs Validation'
  ];

  categoryColumnMap: { [category: string]: string } = {
    initiatedToday: 'initiated',
    welcomeCall: 'welcomeCall',
    clarityCall: 'clarityCall',
    diagnostics: 'diagnostics',
    implementation: 'implementation',
    midReviewDiagnostics: 'midReviewDiagnostics',
    implementationPhase2: 'implementationPhase2',
    finalReview: 'finalReview',
    completed: 'completed',
    needsValidation: 'needsValidation'
  };

  // Abishek Vimal M*

  awaitingPendingCount = 0;
  initiatedClearedCount = 0;
  initiatedPendingCount = 0;
  totalParticipants = 0;
  inProcessCount = 0;
  completedCount = 0;

  mapMetaData: any = {};
  mapjourneyname: any = {};
  mapProductName: any = {};
  modeMap: any = {};
  mapProduct: any = {};
  journeyProductMap: any = {};
  mapprofile: any = {};
  private loadingStates = {
    journeyData: false,
    metadata: false,
    appointments: false,
    journeyProduct: false,
    modes: false
  };

  specialistLoading = false;
  specialistSlotsInitialized = false;
  specialistDisplayMonth = '';
  specialistStartDate: Date | null = null;
  specialistEndDate: Date | null = null;
  specialistRange = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });
  specialistSequences: any[] = [];
  specialistRolesMap: { [id: string]: string[] } = {};
  specialistEISMap: { [id: string]: { [role: string]: string[] } } = {};
  specialistAllSlots: any[] = [];
  slotOverview: SlotOverview = { totalSlots: 0, booked: 0, available: 0, bookingRate: 0 };
  slotsByProduct: SlotByProduct[] = [];
  specialistData: SpecialistRow[] = [];

  constructor(
    private firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private guard: AuthguardService,
    private router: Router,
    private fb: FormBuilder,
    private injector: Injector,
    private datepipe: DatePipe,
  ) {
    this.filterForm = this.fb.group({
      search: [''],
      journey: [[]],
      product: [[]]
    });
  }

  async ngOnInit() {
    this.isLoading = true;
    this.setCurrentMonth();
    this.initializeMonthFilter();

    try {
      // Fetch all initial data in parallel
      const [usersSnap, journeySnap, productsSnap] = await Promise.all([
        runInInjectionContext(this.injector, () =>
          getDocs(query(collection(this.firestore, 'users_roles'), where('ahmember', '==', true)))
        ),
        runInInjectionContext(this.injector, () =>
          getDocs(collection(this.firestore, 'journey'))
        ),
        runInInjectionContext(this.injector, () =>
          getDocs(collection(this.firestore, 'products'))
        ),
      ]);

      const packageSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'package'),
          where('package', '==', 'Bonus')
        ))
      );
      this.bonusPackageIds = new Set(packageSnap.docs.map((d) => d.id));

      // Process journey 
      for (const doc of journeySnap.docs) {
        const data = doc.data();
        this.mapjourneyname[data['id']] = data['journey'];
        if (data['journey']) this.journeyList.push(data['journey']);
      }
      this.loadingStates.journeyData = true;

      // Process products
      for (const doc of productsSnap.docs) {
        const data = doc.data();
        this.rawProductData.push(data);
        this.mapProductName[doc.id] = data['product'] || 'Unknown Product';
        if (data['product']) this.productList.push(data['product']);
      }

      this.resolveProductGroups();

      // Subscribe to date range changes
      this.range.valueChanges.subscribe((val) => {
        if (val.start && val.end) {
          this.selectedTimeFilter = 'custom';
          this.dateRangeStart = val.start;
          this.dateRangeEnd = val.end;
          this.applyDateFilter();
        }
      });

      // Load metadata + dependent data
      await this.loadParticipantMetadata();

      // Process users (depends on mapprofile from metadata)
      this.coachesList = usersSnap.docs
        .map((e) => e.data())
        .sort((a: any, b: any) => {
          const nameA = (this.mapprofile[a['profile_ref']?.id] || '').toLowerCase();
          const nameB = (this.mapprofile[b['profile_ref']?.id] || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

      // this.initSpecialistDateRange();
      // this.specialistRange.valueChanges.subscribe((val) => {
      //   if (val.start && val.end) {
      //     this.specialistStartDate = val.start;
      //     this.specialistEndDate = val.end;
      //     this.updateSpecialistDisplayMonth();
      //     if (this.specialistSlotsInitialized) {
      //       this.fetchSpecialistSlotsAndCompute();
      //     }
      //   }
      // });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    // Unsubscribe from all subscriptions
    Object.keys(this.subscriptions).forEach(key => {
      if (this.subscriptions[key]) {
        this.subscriptions[key].unsubscribe();
      }
    });
  }

  onFilterClick(filter: string) {
    this.selectedTimeFilter = filter;
    this.range.reset();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
      case 'today':
        this.dateRangeStart = today;
        this.dateRangeEnd = now;
        break;
      case '7days':
        this.dateRangeStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        this.dateRangeEnd = now;
        break;
      case '30days':
        this.dateRangeStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        this.dateRangeEnd = now;
        break;
      case 'thismonth':
        this.dateRangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        this.dateRangeEnd = now;
        break;
      case 'all':
        this.dateRangeStart = null;
        this.dateRangeEnd = null;
        break;
    }

    this.applyDateFilter();
  }

  applyDateFilter() {
    const excludedModes = new Set([
      'installation event mode',
      'event mode',
      // 'priority mode',
      'integration mode',
    ]);

    const groupedAll = {};
    const groupedFiltered = {};
    const groupedThisMonth = {};
    const groupedNextMonth = {};
    const groupedBonus = {};
    const groupedPurchased = {};
    const funnelData = {};
    const avgInitToStart = {};
    const avgStartToComplete = {};

    // groupedAll & groupedFiltered: exclude completed status
    for (const item of this.allMatchedProductsRaw) {
      const productId = item['productref']?.id;
      if (!productId) continue;

      const status = item['status']?.toLowerCase() || null;
      const profileId = item['profileid'];
      const mode = this.mapMetaData[profileId]?.['participantmode']?.toLowerCase();
      const totalPaid = parseInt(this.mapMetaData[profileId]?.['pp_totalpaid'] ?? '0') || 0;
      const totalPurchaseValue = parseInt(this.mapMetaData[profileId]?.['pp_totalpurchasevalue'] ?? '0') || 0;
      const totalBalance = totalPurchaseValue - totalPaid;
      const minPayment = parseInt(item['minimumpayment']);
      const isEligible = !excludedModes.has(mode) && (totalBalance <= 0 || totalPaid >= minPayment);
      const statusdate = item['statusdate'] || {};
      const tentativestart = item['tentativestart'] || null;

      console.log("statusdate", statusdate)

      // eligible badge & eligibility breakdown: exclude completed
      if (!['completed', 'ongoing'].includes(status)) {
        (groupedAll[productId] ||= []).push(item);

        if (isEligible) {
          (groupedFiltered[productId] ||= []).push(item);

          if (tentativestart) {
            if (this.isDateInCurrentMonth(tentativestart.toDate())) {
              (groupedThisMonth[productId] ||= []).push(item);
            } else if (this.isDateInNextMonth(tentativestart.toDate())) {
              (groupedNextMonth[productId] ||= []).push(item);
            }
          }

          const packageId = item['packageref']?.id;
          if (packageId && this.bonusPackageIds.has(packageId)) {
            (groupedBonus[productId] ||= []).push(item);
          } else {
            (groupedPurchased[productId] ||= []).push(item);
          }
        }
      }

      // Funnel: awaiting always shows, initiated/started/completed filter by date
      if (!funnelData[productId]) {
        funnelData[productId] = { awaiting: [], initiated: [], started: [], ongoing: [], completed: [] };
      }

      if (status === 'ongoing') {
        funnelData[productId].ongoing.push(item);
      }

      if (isEligible) {
        if (status === null || status === undefined || status === '') {
          funnelData[productId].awaiting.push(item);
        } else if (status === 'initiated') {
          const initiatedDate = this.getDateFromFieldPublic(statusdate['initiated']);
          if (this.isDateInRange(initiatedDate)) {
            funnelData[productId].initiated.push(item);
          }
        } else if (status === 'ongoing') {
          const ongoingDate = this.getDateFromFieldPublic(statusdate['ongoing']);
          if (this.isDateInRange(ongoingDate)) {
            funnelData[productId].started.push(item);
          }
        } else if (status === 'completed') {
          const completedDate = this.getDateFromFieldPublic(statusdate['completed']);
          if (this.isDateInRange(completedDate)) {
            funnelData[productId].completed.push(item);
          }
        }
      }
    }

    // Avg times: use funnel data directly
    for (const productId of Object.keys(funnelData)) {
      let initToStartTotal = 0, initToStartCount = 0;
      let startToCompleteTotal = 0, startToCompleteCount = 0;

      // Initiation → Start: use "started" funnel items (status=ongoing, filtered by date)
      for (const item of funnelData[productId].started) {
        const statusdate = item['statusdate'];
        if (!statusdate) continue;

        const initiatedDate = this.getDateFromFieldPublic(statusdate['initiated']);
        const ongoingDate = this.getDateFromFieldPublic(statusdate['ongoing']);

        if (initiatedDate && ongoingDate) {
          const days = Math.abs(ongoingDate.getTime() - initiatedDate.getTime()) / (1000 * 60 * 60 * 24);
          initToStartTotal += days;
          initToStartCount++;
        }
      }

      // Start → Complete: use "completed" funnel items (status=completed, filtered by date)
      for (const item of funnelData[productId].completed) {
        const statusdate = item['statusdate'];
        if (!statusdate) continue;

        const ongoingDate = this.getDateFromFieldPublic(statusdate['ongoing']);
        const completedDate = this.getDateFromFieldPublic(statusdate['completed']);

        if (ongoingDate && completedDate) {
          const days = Math.abs(completedDate.getTime() - ongoingDate.getTime()) / (1000 * 60 * 60 * 24);
          startToCompleteTotal += days;
          startToCompleteCount++;
        }
      }

      avgInitToStart[productId] = initToStartCount > 0 ? Math.round(initToStartTotal / initToStartCount) : 0;
      avgStartToComplete[productId] = startToCompleteCount > 0 ? Math.round(startToCompleteTotal / startToCompleteCount) : 0;
    }

    this.groupedAll = groupedAll;
    this.groupedFiltered = groupedFiltered;
    this.groupedThisMonth = groupedThisMonth;
    this.groupedNextMonth = groupedNextMonth;
    this.groupedBonus = groupedBonus;
    this.groupedPurchased = groupedPurchased;
    this.funnelData = funnelData;
    this.avgInitToStart = avgInitToStart;
    this.avgStartToComplete = avgStartToComplete;
  }

  getConversionRate(cardId: string): number {
    const funnel = this.getCardFunnel(cardId);
    const total = this.getCardGroupedFiltered(cardId).length;
    if (total === 0) return 0;
    return Math.round((funnel.completed.length / total) * 100);
  }

  async fetchDFUProductData() {
    const dfuProducts = this.rawProductData.filter((e) => e['type']?.toLowerCase() == 'dfu');
    const dfuProductIds = Array.from(new Set(dfuProducts.map((p) => p['id'])));

    const rejectedStatuses = new Set(['cancelled', 'shifted']);

    const activeProfileIds = new Set(
      Object.keys(this.mapMetaData).filter((pid) => {
        const meta = this.mapMetaData[pid];
        if (meta['customerstatus'] === 'active' || meta['customerstatus'] === 'non active') {
          return true;
          // const fieldsToCheck = [
          //   ...(meta['addons'] || []),
          //   ...(meta['bonus'] || []),
          //   ...(meta['consumedproducts'] || []),
          //   ...(meta['unconsumedproducts'] || []),
          // ];
          // return fieldsToCheck.some((id) => dfuProductIds.includes(id));
        }
        return false;
      })
    );

    const productChunks = [];
    for (let i = 0; i < dfuProductIds.length; i += 30) {
      productChunks.push(dfuProductIds.slice(i, i + 30));
    }

    const snapshots = await Promise.all(
      productChunks.map((chunk) =>
        runInInjectionContext(this.injector, () =>
          getDocs(query(
            collection(this.firestore, 'participantsproduct'),
            where('productref', 'in', chunk.map((id) => doc(this.firestore, 'products', id)))
          ))
        )
      )
    );

    const allMatchedProducts = [];
    for (const snapshot of snapshots) {
      for (const d of snapshot.docs) {
        const data = d.data();
        if (
          activeProfileIds.has(data['profileid']) &&
          !rejectedStatuses.has(data['status']?.toLowerCase())
        ) {
          allMatchedProducts.push({ id: d.id, ...data });
        }
      }
    }

    // Store raw data for re-filtering
    this.allMatchedProductsRaw = allMatchedProducts;

    // Apply current filter
    this.applyDateFilter();
  }

  initSpecialistDateRange() {
    const now = new Date();
    this.specialistStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.specialistEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.specialistRange.setValue({
      start: this.specialistStartDate,
      end: this.specialistEndDate,
    });
    this.updateSpecialistDisplayMonth();
  }

  updateSpecialistDisplayMonth() {
    if (!this.specialistStartDate || !this.specialistEndDate) return;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const startMonth = this.specialistStartDate.getMonth();
    const startYear = this.specialistStartDate.getFullYear();
    const endMonth = this.specialistEndDate.getMonth();
    const endYear = this.specialistEndDate.getFullYear();

    if (startMonth === endMonth && startYear === endYear) {
      this.specialistDisplayMonth = `${monthNames[startMonth]} ${startYear}`;
    } else {
      const startLabel = this.datepipe.transform(this.specialistStartDate, 'MMM d, yyyy');
      const endLabel = this.datepipe.transform(this.specialistEndDate, 'MMM d, yyyy');
      this.specialistDisplayMonth = `${startLabel} – ${endLabel}`;
    }
  }

  /**
   * Load products → delivery sequences → appointment types → roles → EIS.
   * Called ONCE after fetchDFUProductData completes. Caches everything.
   * Then fetches availability slots for current date range.
   */
  async loadSpecialistBaseData(retryCount = 0) {
    this.specialistLoading = true;
    this.cdr.detectChanges();

    try {
      // ── Step 1: Products with Priority Mode ──
      const productsSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'products'),
          where('mode', '==', 'Priority Mode')
        ))
      );

      // ── Step 2: Delivery sequences per product ──
      const deliveryPromises = productsSnap.docs.map((productDoc) =>
        runInInjectionContext(this.injector, () =>
          getDocs(query(
            collection(this.firestore, 'productToDeliverySequence'),
            where('product', '==', productDoc.ref)
          ))
        ).then((snapshot) => ({ productDoc, snapshot }))
      );
      const allDeliveryResults = await Promise.all(deliveryPromises);

      // ── Step 3: Collect activity refs from delivery sequences ──
      const activityFetchList: { productDoc: any; productName: string; activityRef: any }[] = [];

      for (const { productDoc, snapshot } of allDeliveryResults) {
        const productName = productDoc.data()['product'];

        for (const deliveryDoc of snapshot.docs) {
          const deliveryOptions = deliveryDoc.data()['deliveryoptions'];
          if (!Array.isArray(deliveryOptions) || deliveryOptions.length === 0) continue;

          const lastOption = deliveryOptions.at(-1);
          const deliverySequence = lastOption?.deliverysequence;
          if (!Array.isArray(deliverySequence)) continue;

          for (const sequenceItem of deliverySequence) {
            if (sequenceItem.activity) {
              activityFetchList.push({
                productDoc,
                productName,
                activityRef: sequenceItem.activity,
              });
            }
          }
        }
      }

      // ── Step 4: Fetch activity documents (batched to avoid Firestore overload) ──
      const activityResults: { productDoc: any; productName: string; activityRef: any; snap: any }[] = [];
      const actBatchSize = 15;

      for (let i = 0; i < activityFetchList.length; i += actBatchSize) {
        const batch = activityFetchList.slice(i, i + actBatchSize);
        const batchResults = await Promise.all(
          batch.map((item) =>
            runInInjectionContext(this.injector, () =>
              getDoc(item.activityRef)
            ).then((snap) => ({ ...item, snap }))
          )
        );
        activityResults.push(...batchResults);
      }

      // ── Step 5: Build unique appointment type sequences ──
      const seenTypeIds = new Set<string>();
      this.specialistSequences = [];

      for (const { productDoc, productName, snap: activitySnap } of activityResults) {
        if (!activitySnap.exists()) continue;

        const activityData = activitySnap.data();
        const appointmentTypeId = activityData['id'];
        const appointmentTypeName = activityData['appointmenttype'];

        if (!appointmentTypeId || !appointmentTypeName) continue;
        if (seenTypeIds.has(appointmentTypeId)) continue;
        seenTypeIds.add(appointmentTypeId);

        this.specialistSequences.push({
          productId: productDoc.id,
          productName,
          appointmentType: appointmentTypeName,
          appointmentTypeId,
        });
      }

      // ── Step 6: Prefetch Roles + EIS per appointment type (batched) ──
      const roleBatchSize = 10;

      for (let i = 0; i < this.specialistSequences.length; i += roleBatchSize) {
        const batch = this.specialistSequences.slice(i, i + roleBatchSize);

        await Promise.all(
          batch.map(async (sequence) => {
            const typeId = sequence.appointmentTypeId;

            const rolesSnap = await runInInjectionContext(this.injector, () =>
              getDocs(query(
                collection(this.firestore, 'AppointmentType-To-Roles'),
                where('assigned_appttype_ref', '==', doc(this.firestore, 'appointmenttype/' + typeId)),
                limit(1)
              ))
            );

            const roles: string[] = [];
            rolesSnap.forEach((roleDoc) => {
              const requiredRoles = roleDoc.data()['required_role'] ?? [];
              requiredRoles.forEach((element: any) => roles.push(element.path));
            });
            this.specialistRolesMap[typeId] = roles;

            const eisMap: { [role: string]: string[] } = {};

            await Promise.all(
              roles.map(async (rolePath) => {
                const eisSnap = await runInInjectionContext(this.injector, () =>
                  getDocs(query(
                    collection(this.firestore, 'Roles-To-EIS'),
                    where('assigned_role_ref', '==', doc(this.firestore, rolePath))
                  ))
                );

                const eisRefs: string[] = [];
                eisSnap.forEach((eisDoc) => {
                  const assignedEis = eisDoc.data()['assigned_eis'] ?? [];
                  assignedEis.forEach((element: any) => eisRefs.push(element.path));
                });
                eisMap[rolePath] = eisRefs;
              })
            );

            this.specialistEISMap[typeId] = eisMap;
          })
        );
      }

      this.specialistSlotsInitialized = true;
      await this.fetchSpecialistSlotsAndCompute();

    } catch (error) {
      console.error('Error loading specialist base data:', error);

      if (retryCount < 2) {
        setTimeout(() => this.loadSpecialistBaseData(retryCount + 1), 2000);
        return;
      }

      this.specialistLoading = false;
      this.cdr.detectChanges();
    }
  }

  async fetchSpecialistSlotsAndCompute(retryCount = 0) {
    if (!this.specialistStartDate || !this.specialistEndDate) return;

    this.specialistLoading = true;
    this.cdr.detectChanges();

    try {
      const rangeStart = new Date(this.specialistStartDate);
      rangeStart.setHours(0, 0, 0, 0);

      const rangeEnd = new Date(this.specialistEndDate);
      rangeEnd.setHours(23, 59, 59, 999);

      const results = await Promise.all(
        this.specialistSequences.map(async (seq) => {
          const typeId = seq.appointmentTypeId;
          const roles = this.specialistRolesMap[typeId] || [];
          const eisMap = this.specialistEISMap[typeId] || {};
          const matchedSlots: any[] = [];
          const availabilityPromises: Promise<void>[] = [];

          for (const role of roles) {
            const eisProfiles = eisMap[role] || [];

            for (const eisProfile of eisProfiles) {
              const promise = runInInjectionContext(this.injector, () =>
                getDocs(query(
                  collection(this.firestore, 'availability'),
                  where('profileref', '==', doc(this.firestore, eisProfile)),
                  where('appointments', 'array-contains', doc(this.firestore, 'appointmenttype/' + typeId)),
                  where('starttime', '>=', rangeStart),
                  where('starttime', '<=', rangeEnd)
                ))
              ).then((snapshot) => {
                snapshot.forEach((slotDoc) => {
                  const slotArray = slotDoc.data()[typeId];

                  if (!Array.isArray(slotArray)) return;

                  for (const slot of slotArray) {
                    const slotStart = slot.slotstart?.toDate?.() || (slot.slotstart ? new Date(slot.slotstart) : null);

                    // ── Only include slots within the selected date range ──
                    if (!slotStart || slotStart < rangeStart || slotStart > rangeEnd) continue;

                    matchedSlots.push({
                      booked: slot.booked || false,
                      available: slot.available || false,
                      eisprofile: eisProfile,
                    });
                  }
                });
              });

              availabilityPromises.push(promise);
            }
          }

          await Promise.all(availabilityPromises);

          return {
            appointmentType: typeId,
            appointmentLabel: seq.appointmentType,
            productName: seq.productName,
            productId: seq.productId,
            slots: matchedSlots,
          };
        })
      );

      this.specialistAllSlots = results;
      this.computeSpecialistDisplayData();

    } catch (error) {
      console.error('Error fetching specialist slots:', error);
      if (retryCount < 2) {
        console.log(`Retrying specialist slots (attempt ${retryCount + 1})...`);
        setTimeout(() => this.fetchSpecialistSlotsAndCompute(retryCount + 1), 2000);
        return;
      }
    } finally {
      this.specialistLoading = false;
      this.cdr.detectChanges();
    }
  }

  computeSpecialistDisplayData() {
    let totalSlots = 0;
    let totalBooked = 0;
    let totalAvailable = 0;

    const productMap = new Map<string, { name: string; booked: number; total: number }>();
    const specialistMap = new Map<string, {
      productNames: Set<string>;
      totalSlots: number;
      booked: number;
      available: number;
    }>();

    const productColors = [
      '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444',
      '#6366f1', '#10b981', '#0891b2', '#be123c', '#7c3aed'
    ];

    // ── Aggregate slots by product and specialist ──
    for (const appointmentSlot of this.specialistAllSlots) {
      const productName = appointmentSlot.productName || 'Unknown';
      const productId = appointmentSlot.productId;

      if (!productMap.has(productId)) {
        productMap.set(productId, { name: productName, booked: 0, total: 0 });
      }
      const productEntry = productMap.get(productId)!;

      for (const slot of appointmentSlot.slots) {
        totalSlots++;
        productEntry.total++;

        const eisId = (slot.eisprofile || '').split('/').pop() || 'unknown';

        if (!specialistMap.has(eisId)) {
          specialistMap.set(eisId, {
            productNames: new Set(),
            totalSlots: 0,
            booked: 0,
            available: 0,
          });
        }

        const specialistEntry = specialistMap.get(eisId)!;
        specialistEntry.productNames.add(productName);
        specialistEntry.totalSlots++;

        if (slot.booked) {
          totalBooked++;
          productEntry.booked++;
          specialistEntry.booked++;
        } else if (slot.available) {
          totalAvailable++;
          specialistEntry.available++;
        }
      }
    }

    // ── Slot Overview ──
    this.slotOverview = {
      totalSlots,
      booked: totalBooked,
      available: totalAvailable,
      bookingRate: totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0,
    };

    // ── Slots by Product ──
    let colorIndex = 0;
    this.slotsByProduct = [];

    for (const [, entry] of productMap) {
      if (entry.total > 0) {
        this.slotsByProduct.push({
          name: entry.name,
          booked: entry.booked,
          total: entry.total,
          pct: Math.round((entry.booked / entry.total) * 100),
          color: productColors[colorIndex % productColors.length],
        });
        colorIndex++;
      }
    }
    this.slotsByProduct.sort((a, b) => b.total - a.total);

    // ── Specialist Table Rows ──
    const productClassList = ['upi', 'wig', 'ftm', 'pto', 'ei', 'cs'];
    this.specialistData = [];

    for (const [eisId, entry] of specialistMap) {
      if (entry.totalSlots === 0) continue;

      const name = this.mapprofile[eisId] || this.mapMetaData[eisId]?.['name'] || eisId;
      const productNamesArray = Array.from(entry.productNames);
      const productDisplay = productNamesArray.length > 1
        ? `${productNamesArray[0]} +${productNamesArray.length - 1}`
        : (productNamesArray[0] || 'N/A');

      // Slot dots (cap at 20 for display)
      const slotDots: string[] = [];
      for (let i = 0; i < Math.min(entry.booked, 20); i++) slotDots.push('booked');
      for (let i = 0; i < Math.min(entry.available, 20); i++) slotDots.push('open');

      const utilizationPct = Math.round((entry.booked / entry.totalSlots) * 100);

      let utilizationNote = '';
      let utilizationNoteColor = '';
      if (entry.available > 0 && utilizationPct < 60) {
        utilizationNote = 'needs bookings';
        utilizationNoteColor = '#f59e0b';
      } else if (entry.available > 0) {
        utilizationNote = `${entry.available} open`;
        utilizationNoteColor = '#10b981';
      }

      this.specialistData.push({
        name,
        role: 'Specialist',
        product: productDisplay,
        productClass: productClassList[this.specialistData.length % productClassList.length],
        appointmentsGiven: entry.totalSlots,
        booked: entry.booked,
        availableSlots: entry.available,
        slotDots,
        utilizationPct,
        utilizationNote: utilizationNote || undefined,
        utilizationNoteColor: utilizationNoteColor || undefined,
      });
    }

    this.specialistData.sort((a, b) => b.appointmentsGiven - a.appointmentsGiven);
  }

  get visibleCardIds(): string[] {
    const allProductIds = this.allProductIdsFromRaw;
    const seen = new Set<string>();
    const result: string[] = [];

    // First add merged groups
    for (const groupName of Object.keys(this.mergedGroupIds)) {
      const groupPids = this.mergedGroupIds[groupName];
      const hasData = [...groupPids].some((pid) => allProductIds.has(pid));
      if (hasData) {
        result.push('group:' + groupName);
        for (const pid of groupPids) seen.add(pid);
      }
    }

    // Then add individual products (not hidden, not in a group)
    for (const pid of allProductIds) {
      if (seen.has(pid)) continue;
      if (this.hiddenProductIds.has(pid)) continue;
      result.push(pid);
    }

    // Sort by getCardGroupedAll length descending
    result.sort((a, b) => this.getCardGroupedAll(b).length - this.getCardGroupedAll(a).length);

    return result;
  }

  get hiddenCardIds(): string[] {
    const allProductIds = this.allProductIdsFromRaw;
    return [...allProductIds]
      .filter((pid) => this.hiddenProductIds.has(pid))
      .sort((a, b) => this.getCardGroupedAll(b).length - this.getCardGroupedAll(a).length);
  }

  get allProductIdsFromRaw(): Set<string> {
    const ids = new Set<string>();
    for (const item of this.allMatchedProductsRaw) {
      const pid = item['productref']?.id;
      if (pid) ids.add(pid);
    }
    return ids;
  }

  // Helper: get product IDs for a card
  getCardProductIds(cardId: string): string[] {
    if (cardId.startsWith('group:')) {
      const groupName = cardId.replace('group:', '');
      return [...(this.mergedGroupIds[groupName] || [])];
    }
    return [cardId];
  }

  getCardName(cardId: string): string {
    if (cardId.startsWith('group:')) {
      return cardId.replace('group:', '');
    }
    return this.mapProductName[cardId] || 'Unknown';
  }

  getCardSubNames(cardId: string): string[] {
    if (cardId.startsWith('group:')) {
      const groupName = cardId.replace('group:', '');
      return (this.mergedGroups[groupName] || []);
    }
    return [];
  }

  // Aggregated getters for merged cards
  getCardGroupedAll(cardId: string): any[] {
    return this.getCardProductIds(cardId).flatMap((pid) => this.groupedAll[pid] || []);
  }

  getCardGroupedFiltered(cardId: string): any[] {
    return this.getCardProductIds(cardId).flatMap((pid) => this.groupedFiltered[pid] || []);
  }

  getCardGroupedThisMonth(cardId: string): any[] {
    return this.getCardProductIds(cardId).flatMap((pid) => this.groupedThisMonth[pid] || []);
  }

  getCardGroupedNextMonth(cardId: string): any[] {
    return this.getCardProductIds(cardId).flatMap((pid) => this.groupedNextMonth[pid] || []);
  }

  getCardGroupedBonus(cardId: string): any[] {
    return this.getCardProductIds(cardId).flatMap((pid) => this.groupedBonus[pid] || []);
  }

  getCardGroupedPurchased(cardId: string): any[] {
    return this.getCardProductIds(cardId).flatMap((pid) => this.groupedPurchased[pid] || []);
  }

  getCardFunnel(cardId: string): any {
    const pids = this.getCardProductIds(cardId);
    return {
      initiated: pids.flatMap((pid) => this.funnelData[pid]?.initiated || []),
      awaiting: pids.flatMap((pid) => this.funnelData[pid]?.awaiting || []),
      started: pids.flatMap((pid) => this.funnelData[pid]?.started || []),
      ongoing: pids.flatMap((pid) => this.funnelData[pid]?.ongoing || []),
      completed: pids.flatMap((pid) => this.funnelData[pid]?.completed || []),
    };
  }

  getCardAvgInitToStart(cardId: string): number {
    const funnel = this.getCardFunnel(cardId);
    let total = 0, count = 0;
    for (const item of funnel.started) {
      const sd = item['statusdate'];
      if (!sd) continue;
      const init = this.getDateFromFieldPublic(sd['initiated']);
      const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
      if (init && ongoing) {
        total += Math.abs(ongoing.getTime() - init.getTime()) / (1000 * 60 * 60 * 24);
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : 0;
  }

  getCardAvgStartToComplete(cardId: string): number {
    const funnel = this.getCardFunnel(cardId);
    let total = 0, count = 0;
    for (const item of funnel.completed) {
      const sd = item['statusdate'];
      if (!sd) continue;
      const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
      const completed = this.getDateFromFieldPublic(sd['completed']);
      if (ongoing && completed) {
        total += Math.abs(completed.getTime() - ongoing.getTime()) / (1000 * 60 * 60 * 24);
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : 0;
  }

  getCardActiveSub(cardId: string): number {
    return this.getCardProductIds(cardId).reduce((sum, pid) => sum + this.getActiveSub(pid), 0);
  }

  getCardNonActiveSub(cardId: string): number {
    return this.getCardProductIds(cardId).reduce((sum, pid) => sum + this.getNonActiveSub(pid), 0);
  }

  // Updated modal openers for merged cards
  openCardModal(cardId: string, type: 'all' | 'filtered' | 'thismonth' | 'nextmonth' | 'bonus' | 'purchased') {
    this.selectedProductId = cardId;
    this.modalType = type;

    let source;
    switch (type) {
      case 'all': source = this.getCardGroupedAll(cardId); break;
      case 'filtered': source = this.getCardGroupedFiltered(cardId); break;
      case 'thismonth': source = this.getCardGroupedThisMonth(cardId); break;
      case 'nextmonth': source = this.getCardGroupedNextMonth(cardId); break;
      case 'bonus': source = this.getCardGroupedBonus(cardId); break;
      case 'purchased': source = this.getCardGroupedPurchased(cardId); break;
    }

    const grouped = {};
    for (const doc of source || []) {
      const pid = doc['profileid'];
      (grouped[pid] ||= []).push(doc);
    }
    this.groupedByProfileAll = grouped;
  }

  openCardFunnelModal(cardId: string, type: string, event: Event) {
    event.stopPropagation();
    this.funnelModalProductId = cardId;
    this.funnelModalType = type;
    this.funnelModalOpen = true;

    const funnel = this.getCardFunnel(cardId);
    const source = funnel[type] || [];
    const grouped = {};
    for (const doc of source) {
      const pid = doc['profileid'];
      (grouped[pid] ||= []).push(doc);
    }
    this.funnelModalProfiles = grouped;
  }

  openCardAvgModal(cardId: string, type: 'initToStart' | 'startToComplete', event: Event) {
    event.stopPropagation();
    this.avgModalProductId = cardId;
    this.avgModalType = type;
    this.avgModalOpen = true;

    const funnel = this.getCardFunnel(cardId);
    const items = type === 'initToStart' ? funnel.started : funnel.completed;
    const details = [];

    for (const item of items) {
      const sd = item['statusdate'];
      if (!sd) continue;

      const initiatedDate = this.getDateFromFieldPublic(sd['initiated']);
      const ongoingDate = this.getDateFromFieldPublic(sd['ongoing']);
      const completedDate = this.getDateFromFieldPublic(sd['completed']);

      if (type === 'initToStart' && initiatedDate && ongoingDate) {
        const days = Math.abs(ongoingDate.getTime() - initiatedDate.getTime()) / (1000 * 60 * 60 * 24);
        details.push({
          name: this.mapMetaData[item['profileid']]?.['name'] || item['profileid'],
          productName: this.mapProductName[item['productref']?.id] || 'Unknown',
          fromDate: initiatedDate,
          toDate: ongoingDate,
          days: Math.round(days * 10) / 10
        });
      }

      if (type === 'startToComplete' && ongoingDate && completedDate) {
        const days = Math.abs(completedDate.getTime() - ongoingDate.getTime()) / (1000 * 60 * 60 * 24);
        details.push({
          name: this.mapMetaData[item['profileid']]?.['name'] || item['profileid'],
          productName: this.mapProductName[item['productref']?.id] || 'Unknown',
          fromDate: ongoingDate,
          toDate: completedDate,
          days: Math.round(days * 10) / 10
        });
      }
    }

    this.avgModalDetails = details.sort((a, b) => b.days - a.days);
  }

  toggleHiddenProducts() {
    this.showHiddenProducts = !this.showHiddenProducts;
  }

  resolveProductGroups() {
    // Build reverse map: product name -> product ID
    const nameToId: { [name: string]: string } = {};
    for (const pid of Object.keys(this.mapProductName)) {
      nameToId[this.mapProductName[pid]] = pid;
    }

    // Resolve hidden
    this.hiddenProductIds = new Set();
    for (const name of this.hiddenProductNames) {
      const id = nameToId[name];
      if (id) this.hiddenProductIds.add(id);
    }

    // Resolve merged groups
    this.mergedGroupIds = {};
    this.productIdToGroup = {};
    for (const groupName of Object.keys(this.mergedGroups)) {
      const ids = new Set<string>();
      for (const name of this.mergedGroups[groupName]) {
        const id = nameToId[name];
        if (id) {
          ids.add(id);
          this.productIdToGroup[id] = groupName;
        }
      }
      this.mergedGroupIds[groupName] = ids;
    }
  }

  getDateFromFieldPublic(field: any): Date | null {
    if (!field) return null;
    return field?.toDate?.() || new Date(field);
  }

  isDateInCurrentMonth(date: Date): boolean {
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  isDateInNextMonth(date: Date): boolean {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return date.getMonth() === nextMonth.getMonth() && date.getFullYear() === nextMonth.getFullYear();
  }

  isDateInRange(date: Date | null): boolean {
    if (!this.dateRangeStart || !this.dateRangeEnd || !date) return true;
    return date >= this.dateRangeStart && date <= this.dateRangeEnd;
  }

  openFunnelModal(productId: string, type: string, event: Event) {
    event.stopPropagation();
    this.funnelModalProductId = productId;
    this.funnelModalType = type;
    this.funnelModalOpen = true;

    const source = this.funnelData[productId]?.[type] || [];
    const grouped = {};
    for (const doc of source) {
      const pid = doc['profileid'];
      (grouped[pid] ||= []).push(doc);
    }
    this.funnelModalProfiles = grouped;
  }

  closeFunnelModal() {
    this.funnelModalOpen = false;
    this.funnelModalProductId = null;
    this.funnelModalProfiles = {};
  }

  get productIds(): string[] {
    return Object.keys(this.groupedAll);
  }

  getActiveSub(productId: string): number {
    const today = new Date();
    return this.groupedFiltered[productId]?.filter((doc) => {
      const endDate = doc['subscriptionend']?.toDate?.() || new Date(doc['subscriptionend']);
      return endDate >= today;
    }).length || 0;
  }

  getNonActiveSub(productId: string): number {
    const today = new Date();
    return this.groupedFiltered[productId]?.filter((doc) => {
      const endDate = doc['subscriptionend']?.toDate?.() || new Date(doc['subscriptionend']);
      return endDate < today;
    }).length || 0;
  }

  get profileIds(): string[] {
    return Object.keys(this.currentGroupedByProfile);
  }

  openModal(productId: string, type: 'all' | 'filtered' | 'bonus' | 'purchased') {
    this.selectedProductId = productId;
    this.modalType = type;

    let source;
    switch (type) {
      case 'all': source = this.groupedAll[productId]; break;
      case 'filtered': source = this.groupedFiltered[productId]; break;
      case 'bonus': source = this.groupedBonus[productId]; break;
      case 'purchased': source = this.groupedPurchased[productId]; break;
    }

    const grouped = {};
    for (const doc of source || []) {
      const pid = doc['profileid'];
      (grouped[pid] ||= []).push(doc);
    }

    this.groupedByProfileAll = grouped;
  }

  get currentGroupedByProfile() {
    return this.groupedByProfileAll;
  }

  closeModal() {
    this.selectedProductId = null;
    this.groupedByProfileAll = {};
    this.groupedByProfileFiltered = {};
  }

  openAvgModal(productId: string, type: 'initToStart' | 'startToComplete', event: Event) {
    event.stopPropagation();
    this.avgModalProductId = productId;
    this.avgModalType = type;
    this.avgModalOpen = true;

    const excludedModes = new Set([
      'installation event mode',
      'event mode',
      'priority mode',
      'integration mode',
    ]);

    const items = this.allMatchedProductsRaw.filter((i) => i['productref']?.id === productId);
    const details = [];

    for (const item of items) {
      const profileId = item['profileid'];
      const mode = this.mapMetaData[profileId]?.['participantmode']?.toLowerCase();
      const totalPaid = parseInt(this.mapMetaData[profileId]?.['pp_totalpaid']);
      const minPayment = parseInt(item['minimumpayment']);
      if (excludedModes.has(mode) || totalPaid <= minPayment) continue;

      const statusdate = item['statusdate'];
      if (!statusdate) continue;

      const initiatedDate = this.getDateFromFieldPublic(statusdate['initiated']);
      const ongoingDate = this.getDateFromFieldPublic(statusdate['ongoing']);
      const completedDate = this.getDateFromFieldPublic(statusdate['completed']);

      if (type === 'initToStart' && initiatedDate && ongoingDate && this.isDateInRange(ongoingDate)) {
        const days = Math.abs(ongoingDate.getTime() - initiatedDate.getTime()) / (1000 * 60 * 60 * 24);
        details.push({
          name: this.mapMetaData[profileId]?.['name'] || profileId,
          fromDate: initiatedDate,
          toDate: ongoingDate,
          days: Math.round(days * 10) / 10
        });
      }

      if (type === 'startToComplete' && ongoingDate && completedDate && this.isDateInRange(completedDate)) {
        const days = Math.abs(completedDate.getTime() - ongoingDate.getTime()) / (1000 * 60 * 60 * 24);
        details.push({
          name: this.mapMetaData[profileId]?.['name'] || profileId,
          fromDate: ongoingDate,
          toDate: completedDate,
          days: Math.round(days * 10) / 10
        });
      }
    }

    this.avgModalDetails = details.sort((a, b) => b.days - a.days);
  }

  closeAvgModal() {
    this.avgModalOpen = false;
    this.avgModalProductId = null;
    this.avgModalDetails = [];
  }

  get avgModalTotal(): number {
    return this.avgModalDetails.reduce((sum, d) => sum + d.days, 0);
  }

  get avgModalAvg(): number {
    return this.avgModalDetails.length > 0
      ? Math.round((this.avgModalTotal / this.avgModalDetails.length) * 10) / 10
      : 0;
  }

  tabTableConfigs: { [key: string]: TabTableConfig } = {
    awaitingInitiation: {
      headers: [
        { key: 'priority', label: 'PRIORITY', width: '5%' },
        { key: 'profileid', label: 'NAME', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
        { key: 'profileid', label: 'MOBILE', width: '5%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
        { key: 'journey', label: 'JOURNEY', width: '10%', type: 'text' },
        { key: 'onboardedtime', label: 'ONBOARDED', width: '10%', type: 'date', format: 'MMM dd, yyyy' },
        { key: 'waitingperiod', label: 'DAYS WAITING', width: '10%', type: 'number' },
        { key: 'financialdata', label: 'PAYMENT STATUS', width: '10%' },
        { key: 'lastpaymentdate', label: 'LASTPAYMENT', width: '10%', type: 'date', format: 'MMM dd, yyyy' },
        { key: 'bottleneck', label: 'BOTTLENECK', width: '10%' },
        { key: 'action', label: 'ACTION REQUIRED', width: '20%' }
      ],
      dataKey: 'awaitingInitiation'
    },
    initiatedPending: {
      headers: [
        { key: 'priority', label: 'STATUS', width: '15%' },
        { key: 'profileid', label: 'NAME', width: '15%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
        { key: 'journey', label: 'JOURNEY', width: '12%', type: 'text' },
        { key: 'profileid', label: 'MOBILE', width: '15%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
        { key: 'initiatedtime', label: 'INITIATED DATE', width: '15%', type: 'date', format: 'MMM dd, yyyy' },
        { key: 'waitingperiod', label: 'DAYS WAITING', width: '10%', type: 'number' },
        { key: 'generalnotes', label: 'NOTES', width: '10%' },
        { key: 'addnotes', label: '+', width: '5%', substringStart: 0, substringEnd: 50 }
      ],
      dataKey: 'currentJourneyInitiated'
    },
    stuckCases: {
      headers: [
        { key: 'escalationlevel', label: 'ESCALATION LEVEL', width: '10%', type: 'text' },
        { key: 'profileid', label: 'NAME', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
        { key: 'activejourney', label: 'JOURNEY', width: '12%', type: 'text' },
        { key: 'product', label: 'PRODUCT', width: '12%', type: 'text' },
        { key: 'appointment', label: 'APPOINTMENT', width: '12%', type: 'text' },
        { key: 'appointmentstatus', label: 'APPOINTMENT STATUS', type: 'text', width: '130px' },
        { key: 'issuetype', label: 'ISSUE TYPE', width: '10%', type: 'text' },
        { key: 'date', label: 'APPOINTMENT DATE', width: '10%', type: 'date', format: 'MMM dd, yyyy' },
        { key: 'waitingperiod', label: 'DAYS STUCK', width: '10%', type: 'number' },
        { key: 'lastaction', label: 'LAST ACTION', width: '10%', type: 'text' },
        { key: 'assignedto', label: 'ASSIGNED TO', width: '13%', type: 'text' },
        { key: 'generalnotes', label: 'RESOLUTION', width: '10%' },
        { key: 'addnotes', label: '+', width: '5%', substringStart: 0, substringEnd: 50 }
      ],
      dataKey: 'stuckCases'
    },
    todayActivityHeaders: {
      headers: [
        { key: 'name', label: 'Name', type: 'text', width: '150px' },
        { key: 'journey', label: 'JOURNEY', width: '10%', type: 'text' },
        { key: 'product', label: 'PRODUCT', type: 'text', width: '120px' },
        { key: 'productstatus', label: 'PRODUCT STATUS', type: 'text', width: '120px' },
        { key: 'appointment', label: 'APPOINTMENT', type: 'text', width: '150px' },
        { key: 'appointmentstatus', label: 'APPOINTMENT STATUS', type: 'text', width: '130px' },
        { key: 'assignedto', label: 'ASSIGNED TO', type: 'text', width: '120px' }
      ],
      dataKey: 'todayActivity'
    },
    last7DaysActivityHeaders: {
      headers: [
        { key: 'name', label: 'NAME', type: 'text', width: '150px' },
        { key: 'journey', label: 'JOURNEY', width: '10%', type: 'text' },
        { key: 'product', label: 'PRODUCT', type: 'text', width: '120px' },
        { key: 'productstatus', label: 'PRODUCT STATUS', type: 'text', width: '120px' },
        { key: 'appointment', label: 'APPOINTMENT', type: 'text', width: '150px' },
        { key: 'appointmentstatus', label: 'APPOINTMENT STATUS', type: 'text', width: '130px' },
        { key: 'date', label: 'Date', type: 'date', format: 'MMM d, yyyy', width: '120px' },
        { key: 'waitingperiod', label: 'WAITING PERIOD', type: 'text', width: '100px' },
        { key: 'assignedto', label: 'ASSIGNED TO', type: 'text', width: '120px' }
      ],
      dataKey: 'last7DaysActivity'
    },
    last30DaysActivityHeaders: {
      headers: [
        { key: 'name', label: 'NAME', type: 'text', width: '150px' },
        { key: 'journey', label: 'JOURNEY', width: '10%', type: 'text' },
        { key: 'product', label: 'PRODUCT', type: 'text', width: '120px' },
        { key: 'productstatus', label: 'PRODUCT STATUS', type: 'text', width: '120px' },
        { key: 'appointment', label: 'APPOINTMENT', type: 'text', width: '150px' },
        { key: 'appointmentstatus', label: 'APPOINTMENT STATUS', type: 'text', width: '130px' },
        { key: 'date', label: 'Date', type: 'date', format: 'MMM d, yyyy', width: '120px' },
        { key: 'waitingperiod', label: 'WAITING PERIOD', type: 'text', width: '100px' },
        { key: 'assignedto', label: 'ASSIGNED TO', type: 'text', width: '120px' }
      ],
      dataKey: 'last30DaysActivity'
    },
    thisMonthActivityHeaders: {
      headers: [
        { key: 'name', label: 'NAME', type: 'text', width: '150px' },
        { key: 'journey', label: 'JOURNEY', width: '10%', type: 'text' },
        { key: 'product', label: 'PRODUCT', type: 'text', width: '120px' },
        { key: 'productstatus', label: 'PRODUCT STATUS', type: 'text', width: '120px' },
        { key: 'appointment', label: 'APPOINTMENT', type: 'text', width: '150px' },
        { key: 'appointmentstatus', label: 'APPOINTMENT STATUS', type: 'text', width: '130px' },
        { key: 'date', label: 'Date', type: 'date', format: 'MMM d, yyyy', width: '120px' },
        { key: 'waitingperiod', label: 'WAITING PERIOD', type: 'text', width: '100px' },
        { key: 'assignedto', label: 'ASSIGNED TO', type: 'text', width: '120px' }
      ],
      dataKey: 'thisMonthActivity'
    }
  };

  // Function to fetch data from participant metadata 
  async loadParticipantMetadata() {
    const metadataSnap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'participant metadata'), orderBy('name', 'asc')))
    );

    const tempModeMap = {};

    for (const doc of metadataSnap.docs) {
      const metaData = doc.data();
      if (!metaData['name'] || !metaData['profileid']) continue;

      if (metaData['participantmode'] != null) {
        tempModeMap[metaData['participantmode']] = (tempModeMap[metaData['participantmode']] || 0) + 1;
      }

      this.mapprofile[metaData['profileid']] = metaData['name'];
      this.mapMetaData[metaData['profileid']] = metaData;
    }

    this.modeMap = tempModeMap;
    this.loadingStates.metadata = true;

    // Fetch dependent data
    await this.fetchDFUProductData();

    // Close main loading FIRST
    this.checkAllDataLoaded();

    this.filterAppointmentsByType();
  }

  async filterAppointmentsByType() {
    this.journeyFlowLoading = true;
    this.cdr.detectChanges();

    try {
      const validProfileData = new Map<string, string[]>();

      Object.keys(this.mapMetaData).forEach(profileId => {
        const data = this.mapMetaData[profileId];
        const activeJourney = data['activejourney'];
        const activeProduct = data['activeproduct'];

        if (activeJourney && activeProduct && activeProduct.length > 0) {
          const profileRef = `profile_data/${profileId}`;
          validProfileData.set(profileRef, activeProduct);
        }
      });

      if (validProfileData.size === 0) {
        this.loadingStates.appointments = true;
        this.journeyFlowLoading = false;
        this.cdr.detectChanges();
        return;
      }

      const monthStart = new Date(
        this.selectedMonth.getFullYear(),
        this.selectedMonth.getMonth(),
        1
      );
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(
        this.selectedMonth.getFullYear(),
        this.selectedMonth.getMonth() + 1,
        0
      );
      monthEnd.setHours(23, 59, 59, 999);

      // Add timezone offset (IST = +5:30)
      monthStart.setTime(monthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
      monthEnd.setTime(monthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

      const startTimestamp = Timestamp.fromDate(monthStart);
      const endTimestamp = Timestamp.fromDate(monthEnd);

      const appointments$ = collectionData(query(
        collection(this.firestore, "appointments"),
        where("cancelled", "==", false),
        where("starttime", ">=", startTimestamp),
        where("starttime", "<=", endTimestamp)
      ), { idField: 'id' });

      appointments$.subscribe(async (appointmentsSnap: any[]) => {

        if (appointmentsSnap.length === 0) {
          this.loadingStates.appointments = true;
          this.journeyFlowLoading = false;
          this.cdr.detectChanges();
          return;
        }

        const participantAppointments = new Map();

        appointmentsSnap.forEach(doc => {

          const appointmentData = doc;
          const bookedBy = appointmentData["bookedby"];
          const bookedByPath = bookedBy?.path || null;
          const participantId = bookedBy?.id;
          const startTime = appointmentData["endtime"];
          const productId = appointmentData["productid"];

          console.log("participant appointments", appointmentsSnap);

          if (bookedByPath && validProfileData.has(bookedByPath) && participantId && productId) {

            const activeProducts = validProfileData.get(bookedByPath);

            if (activeProducts?.includes(productId)) {

              appointmentData["docid"] = doc.id;

              const existing = participantAppointments.get(participantId);

              if (!existing) {
                participantAppointments.set(participantId, { latest: appointmentData, previous: null });
              } else {

                const existingTime = existing.latest.starttime?.seconds || 0;
                const currentTime = startTime?.seconds || 0;

                if (currentTime > existingTime) {

                  participantAppointments.set(participantId, {
                    latest: appointmentData,
                    previous: existing.latest
                  });

                } else if (currentTime < existingTime) {

                  const previousTime = existing.previous?.starttime?.seconds || 0;

                  if (currentTime > previousTime) {

                    participantAppointments.set(participantId, {
                      latest: existing.latest,
                      previous: appointmentData
                    });

                  }
                }
              }
            }
          }
        });

        const participantLatestAppointments = new Map();

        participantAppointments.forEach((value, key) => {
          const latestWithPrevious = {
            ...value.latest,
            previousAppointment: value.previous
          };
          participantLatestAppointments.set(key, latestWithPrevious);
        });

        if (participantLatestAppointments.size === 0) {
          this.loadingStates.appointments = true;
          this.journeyFlowLoading = false;
          this.cdr.detectChanges();
          return;
        }

        const allAppointments = Array.from(participantLatestAppointments.values());
        const appointmentTypeRefs = new Map();
        allAppointments.forEach(appointmentData => {
          const ref = appointmentData["appointment"];
          if (ref) appointmentTypeRefs.set(ref.path, ref);
          const prevRef = appointmentData.participantLatestAppointments?.appointment;
          if (prevRef) appointmentTypeRefs.set(prevRef.path, prevRef);
        });

        const appointmentTypePromises = Array.from(appointmentTypeRefs.values()).map(ref =>
          getDoc(ref).catch(error => {
            console.error("Error fetching appointment type:", error);
            return null;
          })
        );

        const appointmentTypeDocs = await Promise.all(appointmentTypePromises);
        const typeNameMap = new Map();
        Array.from(appointmentTypeRefs.keys()).forEach((path, index) => {
          const doc = appointmentTypeDocs[index];
          if (doc?.exists()) typeNameMap.set(path, doc.data()["appointmenttype"] || "");
        });

        const categoryMap = {
          "Welcome To WiSH": "welcomeCall",

          "EI Starter Pack Clarity Call": "clarityCall",

          "A&H Light Diagnostics": "diagnostics",
          "EI Starter Pack Diagnostics": "diagnostics",
          "WiSH Diagnostics": "diagnostics",
          "Critical Support Diagnostics": "diagnostics",
          "EI Diagnostics": "diagnostics",

          "EI Implementation": "implementation",
          "WiSH Implementation": "implementation",
          "Critical Support Implementation": "implementation",
          "A&H Light Implementation": "implementation",
          "EI Starter Pack Implementation": "implementation",

          "Critical Support Mid Review": "midReviewDiagnostics",
          "A&H Light Mid Review": "midReviewDiagnostics",

          "A&H Light Review": "finalReview",
          "EI Review": "finalReview",
          "WiSH Review": "finalReview",
          "EI Starter Pack Review": "finalReview",
          "Critical Support Review": "finalReview",
          "WiSH Final Review Call": "finalReview",

          "EI Celebration Call": "completed",
          "WiSH Celebration Call": "completed",
          "WiSH Experience Call": "completed",
        };

        const productKeywordsMap: any = {
          "WISH": ["WiSH"],
          "A&H LIGHT": ["A&H Light"],
          "EI Solution": ["EI Solution", "EI Celebration", "EI Implementation", "EI Diagnostics", "EI Review"],
          "EI Starter Pack": ["EI Starter Pack"],
          "Critical Support": ["Critical Support"]
        };

        // Add appointment type names and categories for both current and previous appointments
        allAppointments.forEach(appointmentData => {
          const appointmentTypeRef = appointmentData["appointment"];
          if (appointmentTypeRef) {
            const appointmentTypeName = typeNameMap.get(appointmentTypeRef.path);
            if (appointmentTypeName) {
              appointmentData["appointmentTypeName"] = appointmentTypeName;
              appointmentData["category"] = categoryMap[appointmentTypeName] || null;
            }
          }

          // Add type name for previous appointment
          if (appointmentData.previousAppointment?.appointment) {
            const prevTypeName = typeNameMap.get(appointmentData.previousAppointment.appointment.path);
            if (prevTypeName) {
              appointmentData.previousAppointment["appointmentTypeName"] = prevTypeName;
            }
          }
        });

        // Filter by selected product
        let filteredLatestAppointments = allAppointments;
        if (this.selectedProduct !== "All Products Overview") {
          const selectedKeywords = productKeywordsMap[this.selectedProduct] || [];
          filteredLatestAppointments = allAppointments.filter(appointment => {
            const appointmentTypeName = appointment["appointmentTypeName"] || "";
            return selectedKeywords.some(keyword => appointmentTypeName.includes(keyword));
          });
        }

        // Calculate stuck cases and days stuck
        const stuckCasesArray = [];
        const currentDate = new Date();

        filteredLatestAppointments.forEach(latestAppointment => {
          const appointmentEnd = latestAppointment["endtime"] || latestAppointment["starttime"];
          const appointmentEndDate = appointmentEnd?.toDate ? appointmentEnd.toDate() : appointmentEnd;
          const daysSinceAppointment = this.calculateWaitingPeriod(appointmentEndDate);

          const participantId = latestAppointment["bookedby"]?.id;
          let assignedToName = 'Unassigned';
          if (latestAppointment["hosts"] && latestAppointment["hosts"].length > 0) {
            const roleRef = latestAppointment["hosts"][0];
            if (roleRef?.id) {
              assignedToName = this.mapprofile[roleRef.id] || roleRef.id;
            }
          }

          const productId = latestAppointment["productid"];
          const actualProductName = this.mapProductName[productId] || 'N/A';
          latestAppointment["waitingperiod"] = this.calculateWaitingPeriod(appointmentEndDate);
          latestAppointment["profileid"] = participantId;
          latestAppointment["appointmentstatus"] = latestAppointment["attended"] ? 'Completed' : 'Scheduled'
          latestAppointment["appointment"] = latestAppointment["appointmentTypeName"] || 'N/A';
          latestAppointment["product"] = actualProductName;
          latestAppointment["date"] = appointmentEnd;
          latestAppointment["assignedto"] = assignedToName;
          const journeyId = this.mapMetaData[participantId]?.['activejourney'];
          latestAppointment["activejourney"] = this.mapjourneyname[journeyId] || 'N/A';
          latestAppointment["escalationlevel"] = daysSinceAppointment > 30 ? 'HIGH' : daysSinceAppointment > 15 ? 'MEDIUM' : 'LOW';
          latestAppointment["issuetype"] = daysSinceAppointment > 15 ? 'Stuck in Phase' : 'In Progress';
          latestAppointment["lastaction"] = latestAppointment.previousAppointment?.appointmentTypeName || 'N/A';
          latestAppointment["resolution"] = daysSinceAppointment > 15 ? 'Pending' : 'N/A';

          if (daysSinceAppointment > 15) {
            stuckCasesArray.push(latestAppointment);
          }
        });

        // Categorize appointments
        const categorizedData = {
          welcomeCall: [],
          clarityCall: [],
          diagnostics: [],
          implementation: [],
          midReviewDiagnostics: [],
          implementationPhase2: [],
          finalReview: [],
          completed: [],
          needsValidation: []
        };

        filteredLatestAppointments.forEach(appointmentData => {
          const category = appointmentData["category"];
          if (category && categorizedData[category]) {

            categorizedData[category].push(appointmentData);
          }
        });

        Object.keys(categorizedData).forEach(key => {
          this.originalData[key].data = categorizedData[key];
          this.originalData[key].count = categorizedData[key].length;
        });

        this.originalData['stuckCases'].data = stuckCasesArray;
        this.originalData['stuckCases'].count = stuckCasesArray.length;
        this.totalParticipants =
          (this.originalData['currentJourneyInitiated']?.count || 0) +
          (this.originalData['welcomeCall']?.count || 0) +
          (this.originalData['clarityCall']?.count || 0) +
          (this.originalData['diagnostics']?.count || 0) +
          (this.originalData['implementation']?.count || 0) +
          (this.originalData['midReviewDiagnostics']?.count || 0) +
          (this.originalData['implementationPhase2']?.count || 0) +
          (this.originalData['finalReview']?.count || 0) +
          (this.originalData['completed']?.count || 0) +
          (this.originalData['needsValidation']?.count || 0);

        this.completedCount = this.originalData['completed']?.count || 0;
        this.inProcessCount = this.totalParticipants - this.completedCount;
        this.loadingStates.appointments = true;
        this.allFetchedAppointments = allAppointments;

        // Abishek Vimal
        // Filter Participant Table

        const allRecords = Object.values(this.originalData)
          .flatMap((item: any) => item.data || []);

        const rows = allRecords.map((item: any) => {

          const participantId = item.bookedby?.id;
          const participant = this.mapMetaData[participantId] || {};

          const row: any = {
            name: participant.name || '-',
            email: participant.email || '-',
            initiated: '-',
            welcomeCall: '-',
            clarityCall: '-',
            diagnostics: '-',
            implementation: '-',
            midReviewDiagnostics: '-',
            implementationPhase2: '-',
            finalReview: '-',
            completed: '-',
            needsValidation: '-'
          };

          if (item.category === 'initiatedToday') row.initiated = item.appointmentstatus;
          if (item.category === 'welcomeCall') row.welcomeCall = item.appointmentstatus;
          if (item.category === 'clarityCall') row.clarityCall = item.appointmentstatus;
          if (item.category === 'diagnostics') row.diagnostics = item.appointmentstatus;
          if (item.category === 'implementation') row.implementation = item.appointmentstatus;
          if (item.category === 'midReviewDiagnostics') row.midReviewDiagnostics = item.appointmentstatus;
          if (item.category === 'implementationPhase2') row.implementationPhase2 = item.appointmentstatus;
          if (item.category === 'finalReview') row.finalReview = item.appointmentstatus;
          if (item.category === 'completed') row.completed = item.appointmentstatus;
          if (item.category === 'needsValidation') row.needsValidation = item.appointmentstatus;

          return row;
        });

        this.tableData = rows;        // store original rows
        this.filteredData = [...rows]; // display rows

        this.applyProductFilter();
        this.journeyFlowLoading = false;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error("Error loading appointments:", error);
      this.loadingStates.appointments = true;
      this.journeyFlowLoading = false;
      this.cdr.detectChanges();
    }
  }

  applyProductFilter() {
    const productKeywordsMap: any = {
      "WISH": ["WiSH"],
      "A&H LIGHT": ["A&H Light"],
      "EI Solution": ["EI Solution", "EI Celebration", "EI Implementation", "EI Diagnostics", "EI Review"],
      "EI Starter Pack": ["EI Starter Pack"],
      "Critical Support": ["Critical Support"]
    };

    let filteredLatestAppointments = this.allFetchedAppointments;
    if (this.selectedProduct !== "All Products Overview") {
      const selectedKeywords = productKeywordsMap[this.selectedProduct] || [];
      filteredLatestAppointments = this.allFetchedAppointments.filter(appointment => {
        const appointmentTypeName = appointment["appointmentTypeName"] || "";
        return selectedKeywords.some(keyword => appointmentTypeName.includes(keyword));
      });
    }

    // Calculate stuck cases
    const stuckCasesArray = [];

    filteredLatestAppointments.forEach(latestAppointment => {
      const appointmentEnd = latestAppointment["endtime"] || latestAppointment["starttime"];
      const appointmentEndDate = appointmentEnd?.toDate ? appointmentEnd.toDate() : appointmentEnd;
      const daysSinceAppointment = this.calculateWaitingPeriod(appointmentEndDate);

      const participantId = latestAppointment["bookedby"]?.id;
      let assignedToName = 'Unassigned';
      if (latestAppointment["hosts"] && latestAppointment["hosts"].length > 0) {
        const roleRef = latestAppointment["hosts"][0];
        if (roleRef?.id) {
          assignedToName = this.mapprofile[roleRef.id] || roleRef.id;
        }
      }

      const productId = latestAppointment["productid"];
      const actualProductName = this.mapProductName[productId] || 'N/A';
      latestAppointment["waitingperiod"] = this.calculateWaitingPeriod(appointmentEndDate);
      latestAppointment["profileid"] = participantId;
      latestAppointment["appointmentstatus"] = latestAppointment["attended"] ? 'Completed' : 'Scheduled';
      latestAppointment["appointment"] = latestAppointment["appointmentTypeName"] || 'N/A';
      latestAppointment["product"] = actualProductName;
      latestAppointment["date"] = appointmentEnd;
      latestAppointment["assignedto"] = assignedToName;
      const journeyId = this.mapMetaData[participantId]?.['activejourney'];
      latestAppointment["activejourney"] = this.mapjourneyname[journeyId] || 'N/A';
      latestAppointment["escalationlevel"] = daysSinceAppointment > 30 ? 'HIGH' : daysSinceAppointment > 15 ? 'MEDIUM' : 'LOW';
      latestAppointment["issuetype"] = daysSinceAppointment > 15 ? 'Stuck in Phase' : 'In Progress';
      latestAppointment["lastaction"] = latestAppointment.previousAppointment?.appointmentTypeName || 'N/A';
      latestAppointment["resolution"] = daysSinceAppointment > 15 ? 'Pending' : 'N/A';

      if (daysSinceAppointment > 15) {
        stuckCasesArray.push(latestAppointment);
      }
    });

    // Categorize appointments
    const categorizedData = {
      welcomeCall: [],
      clarityCall: [],
      diagnostics: [],
      implementation: [],
      midReviewDiagnostics: [],
      implementationPhase2: [],
      finalReview: [],
      completed: [],
      needsValidation: []
    };

    filteredLatestAppointments.forEach(appointmentData => {
      const category = appointmentData["category"];
      if (category && categorizedData[category]) {
        categorizedData[category].push(appointmentData);
      }
    });

    Object.keys(categorizedData).forEach(key => {
      this.originalData[key].data = categorizedData[key];
      this.originalData[key].count = categorizedData[key].length;
    });

    this.originalData['stuckCases'].data = stuckCasesArray;
    this.originalData['stuckCases'].count = stuckCasesArray.length;

    this.totalParticipants =
      (this.originalData['currentJourneyInitiated']?.count || 0) +
      (this.originalData['welcomeCall']?.count || 0) +
      (this.originalData['clarityCall']?.count || 0) +
      (this.originalData['diagnostics']?.count || 0) +
      (this.originalData['implementation']?.count || 0) +
      (this.originalData['midReviewDiagnostics']?.count || 0) +
      (this.originalData['implementationPhase2']?.count || 0) +
      (this.originalData['finalReview']?.count || 0) +
      (this.originalData['completed']?.count || 0) +
      (this.originalData['needsValidation']?.count || 0);

    this.completedCount = this.originalData['completed']?.count || 0;
    this.inProcessCount = this.totalParticipants - this.completedCount;
    this.cdr.detectChanges();
  }

  // Abishek Vimal

  // Search Participant data from table

  searchStatsParticipant(event: any) {

    const searchText = event.target.value?.toLowerCase().trim();

    if (!searchText) {
      this.filteredOriginalData = JSON.parse(JSON.stringify(this.originalData));
      return;
    }

    const filtered: any = {};

    Object.keys(this.originalData).forEach((key: any) => {

      const section = this.originalData[key];

      const filteredRows = section.data.filter((item: any) => {

        const participantId = item.bookedby?.id;
        const participant = this.mapMetaData[participantId] || {};
        const name = participant.name?.toLowerCase() || "";
        const email = participant.email?.toLowerCase() || "";

        return (
          name.includes(searchText) ||
          email.includes(searchText)
        );
      });

      filtered[key] = {
        ...section,
        data: filteredRows,
        count: filteredRows.length
      };

    });

    this.originalData = filtered;

  }

  searchParticipant(event: any) {

    const searchText = event.target.value?.toLowerCase().trim();

    if (!searchText) {
      this.filteredData = [...this.tableData];
      return;
    }

    this.filteredData = this.tableData.filter((row: any) =>
      row.name?.toLowerCase().includes(searchText) ||
      row.email?.toLowerCase().includes(searchText)
    );
  }

  async loadModes() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    currentMonthEnd.setHours(23, 59, 59, 999);

    currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
    currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

    let startdate = Timestamp.fromDate(currentMonthStart).toDate();
    let enddate = Timestamp.fromDate(currentMonthEnd).toDate();
    const todayString = new Date().toDateString();

    getDocs(query(collection(this.firestore, "participantsproduct"), where("statusdate.initiated", "<=", enddate))).then((products) => {
      let tempArray1 = [];
      let tempArray2 = [];
      if (products.docs.length != 0) {
        for (let index = 0; index < products.docs.length; index++) {
          const productdata = products.docs[index].data();
          if (productdata['status'] === 'initiated' && productdata["deliverymode"] === "Priority Mode") {
            const statusDateInitiated = productdata['statusdate']?.['initiated'];
            productdata['initiatedtime'] = statusDateInitiated;
            const initiatedDate = statusDateInitiated.toDate();
            initiatedDate.setHours(0, 0, 0, 0);

            if (initiatedDate.toDateString() === todayString) {
              tempArray1.push(productdata);
            }
            productdata['waitingperiod'] = this.calculateWaitingPeriod(statusDateInitiated.toDate());
            const journeyId = this.mapMetaData[productdata['profileid']]?.['activejourney'];
            const journeyname = this.mapjourneyname[journeyId] || 'N/A';
            productdata['journey'] = journeyname;
            tempArray2.push(productdata);
          }

          if (index + 1 == products.docs.length) {
            this.originalData['initiatedToday'].data = tempArray1;
            this.originalData['initiatedToday'].count = tempArray1.length;

            this.originalData['currentJourneyInitiated'].data = tempArray2;
            this.originalData['currentJourneyInitiated'].count = tempArray2.length;

            this.loadingStates.modes = true;
            this.checkAllDataLoaded();
          }
        }
      } else {
        this.loadingStates.modes = true;
        this.checkAllDataLoaded();
      }
    })
  }

  loadJourneyProductData() {
    try {
      // Awaiting Initiation Logic
      this.subscriptions['journeyproductActiveCheck'] = collectionData(
        query(collection(this.firestore, "participantjourneyproduct"),
          where("onboarded", "==", true))
      ).subscribe(async (onboardedParticipants) => {
        if (onboardedParticipants.length != 0) {
          let tempArray1 = [];
          let tempArray2 = [];
          let tempArray3 = [];
          let readyForInitiationArray = [];
          let paymentNotClearedArray = [];
          let awaitingPendingCount = 0;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const productQueryPromises = [];
          const participantsToProcess = [];

          for (let i = 0; i < onboardedParticipants.length; i++) {
            const participant = onboardedParticipants[i];
            const profileId = participant['profileid'];
            const activeProduct = this.mapMetaData[profileId]?.['activeproduct'];
            const consumedProduct = this.mapMetaData[profileId]?.['consumedproducts'];
            const journeyStatus = participant['journeystatus'];

            if ((journeyStatus === 'initiated' || journeyStatus === 'ongoing') &&
              (!activeProduct || activeProduct.length === 0) &&
              (!consumedProduct || consumedProduct.length === 0)) {

              participantsToProcess.push(participant);
              productQueryPromises.push(
                getDocs(
                  query(collection(this.firestore, "participantsproduct"),
                    where("profileid", "==", profileId))
                )
              );
            }
          }
          const productQueryResults = await Promise.all(productQueryPromises);
          for (let i = 0; i < participantsToProcess.length; i++) {
            const participant = participantsToProcess[i];
            const profileId = participant['profileid'];
            const productQuery = productQueryResults[i];

            const onboardedDate = participant['onboardedtime']?.toDate();
            participant['waitingperiod'] = this.calculateWaitingPeriod(onboardedDate);
            const totalpaid = this.mapMetaData[profileId]?.['pp_totalpaid'] || 0;
            const paymentdate = this.mapMetaData[profileId]?.['lastpaymentdate'];
            participant['lastpaymentdate'] = paymentdate;
            let hasAtLeastOneCleared = false;

            for (let j = 0; j < productQuery.docs.length; j++) {
              const productData = productQuery.docs[j].data();
              let minimumpayment = productData['minimumpayment'];
              if ([null, undefined].includes(minimumpayment)) {
                minimumpayment = this.mapProduct[productData['productref']?.id]?.minimumrequiredamount || 0;
              }

              if (minimumpayment <= totalpaid) {
                hasAtLeastOneCleared = true;
                break;
              }
            }

            participant['financialdata'] = hasAtLeastOneCleared ? 'Cleared' : 'Pending';
            if (participant['financialdata'] === 'Cleared') {
              readyForInitiationArray.push(participant);
              if (paymentdate) {
                const lastPaymentDate = paymentdate.toDate();
                lastPaymentDate.setHours(0, 0, 0, 0);
                const daysDifference = Math.floor((today.getTime() - lastPaymentDate.getTime()) / (1000 * 3600 * 24));

                if (daysDifference > 30) {
                  tempArray1.push(participant);
                } else if (daysDifference > 7) {
                  tempArray2.push(participant);
                }
              }
            } else {
              awaitingPendingCount++;
              paymentNotClearedArray.push(participant);
            }
            const journeyId = this.mapMetaData[participant['profileid']]?.['activejourney'];
            const journeyname = this.mapjourneyname[journeyId] || 'N/A';
            participant['journey'] = journeyname;
            tempArray3.push(participant);
          }

          this.originalData['clearedMoreThan30Days'].data = tempArray1;
          this.originalData['clearedMoreThan30Days'].count = tempArray1.length;
          this.originalData['clearedMoreThan7Days'].data = tempArray2;
          this.originalData['clearedMoreThan7Days'].count = tempArray2.length;
          this.originalData['awaitingInitiation'].data = tempArray3;
          this.originalData['awaitingInitiation'].count = tempArray3.length;
          this.originalData['readyForInitiation'].data = readyForInitiationArray;
          this.originalData['readyForInitiation'].count = readyForInitiationArray.length;
          this.awaitingPendingCount = awaitingPendingCount;
          this.loadingStates.journeyProduct = true;
          this.checkAllDataLoaded();
          this.cdr.detectChanges();
        } else {
          this.loadingStates.journeyProduct = true;
          this.checkAllDataLoaded();
        }
      });
    } catch (error) {
      console.error('Error loading journey product data:', error);
      this.loadingStates.journeyProduct = true;
      this.checkAllDataLoaded();
    }
  }

  processActivityByDateRange(startDate: Date, endDate: Date, dataKey: string) {
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const activityData = [];
    const processedParticipants = new Set();
    this.originalData['currentJourneyInitiated'].data.forEach(productdata => {
      const initiatedTime = productdata['initiatedtime']?.toDate ? productdata['initiatedtime'].toDate() : productdata['initiatedtime'];

      if (initiatedTime && initiatedTime >= startDate && initiatedTime <= endDate) {
        const profileId = productdata['profileid'];
        processedParticipants.add(profileId);
        const productName = this.mapProductName[productdata['productref']?.id] || 'N/A';

        activityData.push({
          profileid: profileId,
          name: this.mapMetaData[profileId]?.name || 'N/A',
          journey: productdata['journey'],
          product: productName,
          productstatus: 'Initiated',
          appointment: 'N/A',
          appointmentstatus: 'N/A',
          date: productdata['initiatedtime'],
          waitingperiod: productdata['waitingperiod'],
          assignedto: 'N/A'
        });
      }
    });

    this.originalData['awaitingInitiation'].data.forEach(participant => {
      const onboardedTime = participant['onboardedtime']?.toDate ? participant['onboardedtime'].toDate() : participant['onboardedtime'];

      if (onboardedTime && onboardedTime >= startDate && onboardedTime <= endDate) {
        const profileId = participant['profileid'];

        if (!processedParticipants.has(profileId)) {
          processedParticipants.add(profileId);

          activityData.push({
            profileid: profileId,
            name: this.mapMetaData[profileId]?.name || 'N/A',
            journey: participant['journey'] || 'N/A',
            product: 'N/A',
            productstatus: 'Awaiting Initiation',
            appointment: 'N/A',
            appointmentstatus: 'N/A',
            date: participant['onboardedtime'],
            waitingperiod: participant['waitingperiod'],
            assignedto: 'N/A'
          });
        }
      }
    });

    const allAppointmentCategories = ['welcomeCall', 'clarityCall', 'diagnostics', 'implementation',
      'midReviewDiagnostics', 'implementationPhase2', 'finalReview', 'completed', 'needsValidation'];
    allAppointmentCategories.forEach(category => {
      this.originalData[category].data.forEach(appointmentData => {
        const startTime = appointmentData["starttime"];
        const endTime = appointmentData["endtime"];

        if (startTime || endTime) {
          const appointmentDateObj = startTime?.toDate ? startTime.toDate() : endTime?.toDate ? endTime.toDate() : null;

          if (appointmentDateObj && appointmentDateObj >= startDate && appointmentDateObj <= endDate) {
            const participantId = appointmentData["bookedby"]?.id;
            const productId = appointmentData["productid"];
            const actualProductName = this.mapProductName[productId] || 'N/A';

            const existingIndex = activityData.findIndex(item => item.profileid === participantId);

            if (existingIndex !== -1) {
              activityData[existingIndex].product = actualProductName;
              activityData[existingIndex].appointment = appointmentData["appointmentTypeName"] || 'Scheduled';
              activityData[existingIndex].appointmentstatus = appointmentData["attended"] ? 'Completed' : 'Scheduled';
              activityData[existingIndex].assignedto = appointmentData["assignedto"] || 'Unassigned';
            } else if (!processedParticipants.has(participantId)) {
              processedParticipants.add(participantId);
              activityData.push({
                profileid: participantId,
                name: this.mapMetaData[participantId]?.name || 'N/A',
                journey: appointmentData["activejourney"],
                product: actualProductName,
                productstatus: 'Ongoing',
                appointment: appointmentData["appointmentTypeName"] || 'Scheduled',
                appointmentstatus: appointmentData["attended"] ? 'Completed' : 'Scheduled',
                date: startTime || endTime,
                waitingperiod: appointmentData["waitingperiod"],
                assignedto: appointmentData["assignedto"] || 'Unassigned'
              });
            }
          }
        }
      });
    });

    this.originalData[dataKey].data = activityData;
    this.originalData[dataKey].count = activityData.length;
  }

  processTodayActivity() {
    const today = new Date();
    const endOfToday = new Date();
    this.processActivityByDateRange(today, endOfToday, 'todayActivity');
  }

  processLast7DaysActivity() {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    this.processActivityByDateRange(sevenDaysAgo, today, 'last7DaysActivity');
  }

  processLast30DaysActivity() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    this.processActivityByDateRange(thirtyDaysAgo, today, 'last30DaysActivity');
  }

  processThisMonthActivity() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.processActivityByDateRange(monthStart, monthEnd, 'thisMonthActivity');
  }

  // Add these methods after setCurrentMonth()

  initializeMonthFilter() {
    this.selectedMonth = new Date();
    this.updateDisplayMonth();
  }

  updateDisplayMonth() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    this.displayMonth = `${monthNames[this.selectedMonth.getMonth()]} ${this.selectedMonth.getFullYear()}`;
    console.log("original data", this.originalData)
  }

  goToPreviousMonth() {
    this.selectedMonth = new Date(
      this.selectedMonth.getFullYear(),
      this.selectedMonth.getMonth() - 1,
      1
    );
    this.updateDisplayMonth();
    this.applyMonthFilter();
  }

  goToNextMonth() {
    this.selectedMonth = new Date(
      this.selectedMonth.getFullYear(),
      this.selectedMonth.getMonth() + 1,
      1
    );
    this.updateDisplayMonth();
    this.applyMonthFilter();
  }

  applyMonthFilter() {
    // Set start and end dates based on selected month
    this.startDate = new Date(
      this.selectedMonth.getFullYear(),
      this.selectedMonth.getMonth(),
      1
    );
    this.endDate = new Date(
      this.selectedMonth.getFullYear(),
      this.selectedMonth.getMonth() + 1,
      0
    );

    // Update monthyear format for existing logic
    this.monthyear = `${this.selectedMonth.getFullYear()}-${String(this.selectedMonth.getMonth() + 1).padStart(2, '0')}`;

    // Refresh data
    this.fetchData();
  }

  fetchData() {
    this.ngOnDestroy();
    this.isLoading = true
    this.loadingStates = {
      journeyData: true,
      metadata: false,
      journeyProduct: false,
      appointments: false,
      modes: false
    }
    this.loadParticipantMetadata();
    // this.loadModes();
    // this.filterAppointmentsByType();
  }

  // Function to view loading progress of the screen 
  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStates).filter(state => state === true).length;
    const total = Object.keys(this.loadingStates).length;
    return (loaded / total) * 100;
  }


  // Function to get total loaded count 
  getLoadedCount(): number {
    return Object.values(this.loadingStates).filter(state => state === true).length;
  }

  calculateWaitingPeriod(onboardedtime: Date): number {
    if (!onboardedtime) return 0;
    let comparisonDate = new Date();
    const timeDifference = comparisonDate.getTime() - onboardedtime.getTime();
    const daysDifference = Math.floor(timeDifference / (1000 * 3600 * 24));
    return daysDifference;
  }

  getWaitingPeriod(participant: any): number {
    if (participant.waitingperiod !== undefined) {
      return participant.waitingperiod;
    }
    if (participant.initiatedtime) {
      return this.calculateWaitingPeriod(participant.initiatedtime?.toDate());
    }
    return 0;
  }

  checkAllDataLoaded() {
    this.isLoading = false;
    // const allLoaded = Object.values(this.loadingStates).every(state => state === true);
    // if (allLoaded) {
    //   this.processTodayActivity();
    //   this.processLast7DaysActivity();
    //   this.processLast30DaysActivity();
    //   this.processThisMonthActivity();
    //   this.isLoading = false;
    //   this.updatePaginatedData();
    // }
  }

  getPriorityLabel(waitingPeriod: number): string {
    if (waitingPeriod >= 14) return 'URGENT';
    if (waitingPeriod >= 10) return 'HIGH';
    if (waitingPeriod >= 5) return 'MEDIUM';
    return 'LOW';
  }

  // Function to set current month date 
  setCurrentMonth() {
    const now = new Date();
    this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.monthyear = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
  }

  getCurrentTabHeaders(): TableHeader[] {
    if (this.activeFilter === 'todayActivity') {
      return this.tabTableConfigs['todayActivityHeaders']?.headers || [];
    }
    if (this.activeFilter === 'last7DaysActivity') {
      return this.tabTableConfigs['last7DaysActivityHeaders']?.headers || [];
    }
    if (this.activeFilter === 'last30DaysActivity') {
      return this.tabTableConfigs['last30DaysActivityHeaders']?.headers || [];
    }
    if (this.activeFilter === 'thisMonthActivity') {
      return this.tabTableConfigs['thisMonthActivityHeaders']?.headers || [];
    }
    const tabKeys = ['awaitingInitiation', 'initiatedPending', 'stuckCases'];
    const currentTabKey = tabKeys[this.currentTabIndex || 0];
    return this.tabTableConfigs[currentTabKey]?.headers || [];
  }

  getCurrentTabData(): any[] {
    const tabKeys = ['awaitingInitiation', 'initiatedPending', 'stuckCases'];
    const currentTabKey = tabKeys[this.currentTabIndex || 0];
    const dataKey = this.tabTableConfigs[currentTabKey]?.dataKey;

    if (this.activeFilter === 'todayActivity') {
      return this.originalData['todayActivity']?.data || [];
    }
    if (this.activeFilter === 'last7DaysActivity') {
      return this.originalData['last7DaysActivity']?.data || [];
    }
    if (this.activeFilter === 'last30DaysActivity') {
      return this.originalData['last30DaysActivity']?.data || [];
    }
    if (this.activeFilter === 'thisMonthActivity') {
      return this.originalData['thisMonthActivity']?.data || [];
    }

    if (currentTabKey === 'awaitingInitiation') {
      if (this.activeFilter === 'readyForInitiation') {
        return this.originalData['readyForInitiation']?.data || [];
      } else if (this.activeFilter === 'clearedMoreThan7Days') {
        return this.originalData['clearedMoreThan7Days']?.data || [];
      } else if (this.activeFilter === 'clearedMoreThan30Days') {
        return this.originalData['clearedMoreThan30Days']?.data || [];
      }
    }

    if (currentTabKey === 'initiatedPending' && this.activeFilter === 'initiatedToday') {
      return this.originalData['initiatedToday']?.data || [];
    }

    if (currentTabKey === 'stuckCases') {
      const appointmentFilters = ['welcomeCall', 'clarityCall', 'diagnostics', 'implementation', 'midReviewDiagnostics', 'finalReview', 'implementationPhase2', 'completed'];
      if (appointmentFilters.includes(this.activeFilter)) {
        return this.originalData[this.activeFilter]?.data || [];
      }
    }

    const allData = this.originalData[dataKey]?.data || [];
    return allData;
  }

  calculatePagination() {
    const allData = this.getCurrentTabData();
    this.totalPages = Math.ceil(allData.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }

  // Get paginated data for display
  updatePaginatedData(): void {
    if (this.filterForm.value.search || this.filterForm.value.journey?.length > 0 || this.filterForm.value.product?.length > 0) {
      this.updatePaginatedDataWithSearch();
    } else {
      const allData = this.getCurrentTabData();
      this.totalPages = Math.ceil(allData.length / this.itemsPerPage);

      const startIndex = (this.currentPage - 1) * this.itemsPerPage;
      const endIndex = startIndex + this.itemsPerPage;
      this.paginatedData = allData.slice(startIndex, endIndex);
    }
  }

  filterBySearch(): void {
    this.filterTableData();
  }

  filterTableData(): void {
    const allData = this.getCurrentTabDataBeforeFilter();
    const formValue = this.filterForm.value;
    const searchTerm = formValue.search?.toLowerCase().trim() || '';
    const selectedJourneys = formValue.journey || [];
    const selectedProducts = formValue.product || [];

    if (!searchTerm && selectedJourneys.length === 0 && selectedProducts.length === 0) {
      this.filteredData = allData;
    } else {
      this.filteredData = allData.filter(participant => {
        let matchesSearch = true;
        let matchesJourney = true;
        let matchesProduct = true;

        // Search filter
        if (searchTerm) {
          const name = this.mapMetaData[participant['profileid']]?.['name'] || '';
          matchesSearch = name.toLowerCase().includes(searchTerm);
        }

        // Journey filter
        if (selectedJourneys.length > 0) {
          const journeyId = this.mapMetaData[participant['profileid']]?.['activejourney'];
          const journeyname = this.mapjourneyname[journeyId] || participant['journey'] || participant['activejourney'] || '';
          matchesJourney = selectedJourneys.includes(journeyname);
        }

        // Product filter (for stuck cases and activity tabs)
        if (selectedProducts.length > 0) {
          const productName = participant['product'] || '';
          matchesProduct = selectedProducts.some(prod => productName.includes(prod));
        }

        return matchesSearch && matchesJourney && matchesProduct;
      });
    }

    this.currentPage = 1;
    this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
    this.updatePaginatedDataWithSearch();
  }

  // 7. Add new getCurrentTabDataBeforeFilter() method:
  getCurrentTabDataBeforeFilter(): any[] {
    const tabKeys = ['awaitingInitiation', 'initiatedPending', 'stuckCases'];
    const currentTabKey = tabKeys[this.currentTabIndex || 0];
    const dataKey = this.tabTableConfigs[currentTabKey]?.dataKey;

    if (this.activeFilter === 'todayActivity') {
      return this.originalData['todayActivity']?.data || [];
    }
    if (this.activeFilter === 'last7DaysActivity') {
      return this.originalData['last7DaysActivity']?.data || [];
    }
    if (this.activeFilter === 'last30DaysActivity') {
      return this.originalData['last30DaysActivity']?.data || [];
    }
    if (this.activeFilter === 'thisMonthActivity') {
      return this.originalData['thisMonthActivity']?.data || [];
    }

    if (currentTabKey === 'awaitingInitiation') {
      if (this.activeFilter === 'readyForInitiation') {
        return this.originalData['readyForInitiation']?.data || [];
      } else if (this.activeFilter === 'clearedMoreThan7Days') {
        return this.originalData['clearedMoreThan7Days']?.data || [];
      } else if (this.activeFilter === 'clearedMoreThan30Days') {
        return this.originalData['clearedMoreThan30Days']?.data || [];
      }
    }

    if (currentTabKey === 'initiatedPending' && this.activeFilter === 'initiatedToday') {
      return this.originalData['initiatedToday']?.data || [];
    }

    if (currentTabKey === 'stuckCases') {
      const appointmentFilters = ['welcomeCall', 'clarityCall', 'diagnostics', 'implementation', 'midReviewDiagnostics', 'finalReview', 'implementationPhase2', 'completed'];
      if (appointmentFilters.includes(this.activeFilter)) {
        return this.originalData[this.activeFilter]?.data || [];
      }
    }

    return this.originalData[dataKey]?.data || [];
  }

  // 8. Add new refreshFilter() method:
  refreshFilter(): void {
    this.filterForm.reset({
      search: '',
      journey: [],
      product: []
    });
    this.searchText = '';
    this.filteredData = [];
    this.currentPage = 1;
    this.updatePaginatedData();
  }

  updatePaginatedDataWithSearch(): void {
    const dataToDisplay = (this.filterForm.value.search || this.filterForm.value.journey?.length > 0 || this.filterForm.value.product?.length > 0) ? this.filteredData : this.getCurrentTabData();
    this.totalPages = Math.ceil(dataToDisplay.length / this.itemsPerPage);

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedData = dataToDisplay.slice(startIndex, endIndex);
  }

  clearSearch(): void {
    this.refreshFilter();
  }

  // Add these new methods to get unique journeys and products from current table data:

  getUniqueJourneysForCurrentTab(): string[] {
    const currentData = this.getCurrentTabDataBeforeFilter();
    const journeys = new Set<string>();

    currentData.forEach(participant => {
      const journeyId = this.mapMetaData[participant['profileid']]?.['activejourney'];
      const journeyname = this.mapjourneyname[journeyId] || participant['journey'] || participant['activejourney'];

      if (journeyname && journeyname !== 'N/A') {
        journeys.add(journeyname);
      }
    });

    return Array.from(journeys).sort();
  }

  getUniqueProductsForCurrentTab(): string[] {
    const currentData = this.getCurrentTabDataBeforeFilter();
    const products = new Set<string>();

    currentData.forEach(participant => {
      const productName = participant['product'];
      if (productName && productName !== 'N/A') {
        products.add(productName);
      }
    });

    return Array.from(products).sort();
  }

  // Function to view notes 
  viewNotes(element, key) {
    element['viewnotes'] = true;
    element['mapProfile'] = this.mapprofile;
    element['allnotes'] = [];

    if (element[key]) {
      if (typeof element[key] === 'string') {
        element['allnotes'].push({
          note: element[key],
          updatedby: element['profileid'],
          updated: element['updated'] || null
        })
      } else if (Array.isArray(element[key])) {
        element['allnotes'] = element[key]
      }
    }

    if (element['addnotes']) {
      delete element['addnotes']
    }

    if (element['markonboard']) {
      delete element['markonboard'];
    }

    if (![null, undefined, ''].includes(element['journeyref'])) {
      element['journeyname'] = this.mapjourneyname[element['journeyref'].id]?.['journey'] || '';
    }

    if (![null, undefined, ''].includes(element['activejourney'])) {
      element['journeyname'] = element['activejourney']
    }

    this.dialog.open(OnboardingRemarkComponent, {
      data: element,
      autoFocus: false,
      width: '600px',
      maxHeight: '80vh',
      panelClass: 'custom-dialog-container'
    });
  }

  addNotes(element) {
    element['addnotes'] = true;
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;

    if (element['viewnotes']) {
      delete element['viewnotes']
    }
    if (![null, undefined, ''].includes(element['journeyref'])) {
      element['journeyname'] = this.mapjourneyname[element['journeyref'].id]?.['journey'] || '';
    }
    if (![null, undefined, ''].includes(element['activejourney'])) {
      element['journeyname'] = element['activejourney']
    }
    var dialogRef = this.dialog.open(OnboardingRemarkComponent, {
      data: element,
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    });

    dialogRef.afterClosed().toPromise().then(generalnotes => {
      if (![null, undefined, ''].includes(generalnotes)) {
        element['generalnotes'] = element['generalnotes'] || []
        element['generalnotes'].push(generalnotes)
        console.log("Temporary Note Added:", generalnotes);
        this.guard.openSnackBar("Note Added Temporarily", "OK");
      }
    })
  }

  hidePopupWithDelay() {
    this.hideTimeout = setTimeout(() => {
      this.popupData = null;
    }, 200);
  }

  // Function to clear hdie timeout 
  clearHideTimeout() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
  }

  // Function to show popup 
  showPopup(row: any, event: MouseEvent, container: HTMLElement) {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    const popupWidth = 300;
    const popupHeight = 200;
    const offset = 10;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = event.clientY + offset;
    let left = event.clientX + offset;

    if (left + popupWidth > viewportWidth) {
      left = event.clientX - popupWidth - offset;
    }

    if (top + popupHeight > viewportHeight) {
      top = viewportHeight - popupHeight - offset;
    }

    if (left < 0) {
      left = offset;
    }

    if (top < 0) {
      top = offset;
    }

    row['position'] = {
      top,
      left
    }
    this.popupData = row;
    const targetElement = event.target as HTMLElement;
    const rect = targetElement.getBoundingClientRect();
  }

  exportTableData() {
    const tabKeys = ['awaitingInitiation', 'initiatedPending', 'stuckCases'];
    const currentTabKey = tabKeys[this.currentTabIndex || 0];
    const currentConfig = this.tabTableConfigs[currentTabKey];

    if (!currentConfig) {
      console.error('No configuration found for current tab');
      return;
    }
    const dataToExport = this.getCurrentTabData();
    const columns = currentConfig.headers;
    const exportColumns = columns.filter(col =>
      col.key !== 'checkbox' &&
      col.key !== 'action' &&
      col.key !== 'addnotes'
    );

    const headers = exportColumns.map(col => col.label);
    const worksheetData = [headers];
    dataToExport.forEach((participant: any) => {
      const rowData = exportColumns.map(col => {
        return this.formatCellValueForExport(participant, col);
      });
      worksheetData.push(rowData);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    const maxWidths: number[] = [];
    worksheetData.forEach(row => {
      row.forEach((cell, colIndex) => {
        const cellLength = cell ? String(cell).length : 10;
        maxWidths[colIndex] = Math.max(maxWidths[colIndex] || 10, cellLength);
      });
    });

    ws['!cols'] = maxWidths.map(width => ({
      wch: Math.min(width + 2, 50)
    }));

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_col(C) + '1';
      if (!ws[address]) continue;

      ws[address].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "E7E8F0" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // Add worksheet to workbook
    const tabNames = ['Awaiting_Initiation', 'Initiated_Pending', 'Stuck_Cases'];
    const sheetName = tabNames[this.currentTabIndex || 0];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const filterSuffix = this.isFilterActive() ? `_${this.activeFilter}` : '';
    const fileName = `${sheetName}${filterSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Write and download the file
    XLSX.writeFile(wb, fileName);
  }

  // Helper method to format cell values for export
  private formatCellValueForExport(participant: any, header: TableHeader): any {
    const value = participant[header.key];

    // Handle priority
    if (header.key === 'priority') {
      return this.getPriorityLabel(this.getWaitingPeriod(participant));
    }

    // Handle mapped fields (Name, Token)
    if (header.type === 'mapped' && header.mapValue) {
      return this.mapMetaData[value]?.[header.mapValue] || 'N/A';
    }

    // Handle date fields
    if (header.type === 'date' && value) {
      const date = value.toDate ? value.toDate() : value;
      const datePipe = new DatePipe('en-US');
      return datePipe.transform(date, header.format || 'MMM dd, yyyy') || 'N/A';
    }

    // Handle waiting period with DAYS label
    if (header.key === 'waitingperiod') {
      return `${value || 0} DAYS`;
    }

    // Handle general notes
    if (header.key === 'generalnotes') {
      if (participant[header.key] && participant[header.key].length > 0) {
        return participant[header.key][participant[header.key].length - 1].note || 'N/A';
      }
      return 'N/A';
    }

    // Handle financial data
    if (header.key === 'financialdata') {
      return value === 'Cleared' ? 'ELIGIBLE' : 'NOT CLEARED';
    }

    // Handle bottleneck
    if (header.key === 'bottleneck') {
      return participant['financialdata'] === 'Cleared' ? 'Ready for Initiation' : 'Payment Follow-up';
    }

    // Handle text fields
    if (header.type === 'text') {
      return value || 'N/A';
    }

    // Default return
    return value || 'N/A';
  }

  getCurrentTabDataLength(): number {
    if (this.filterForm.value.search || this.filterForm.value.journey?.length > 0 || this.filterForm.value.product?.length > 0) {
      return this.filteredData.length;
    }
    return this.getCurrentTabData().length;
  }

  // Pagination navigation methods
  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.updatePaginatedData();
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePaginatedData();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePaginatedData();
    }
  }

  firstPage() {
    this.currentPage = 1;
    this.updatePaginatedData();
  }

  lastPage() {
    this.currentPage = this.totalPages;
    this.updatePaginatedData();
  }

  // Change items per page
  changeItemsPerPage(newSize: number) {
    this.itemsPerPage = newSize;
    this.currentPage = 1;
    this.updatePaginatedData();
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    if (this.totalPages <= maxPagesToShow) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      const halfRange = Math.floor(maxPagesToShow / 2);
      let start = Math.max(1, this.currentPage - halfRange);
      let end = Math.min(this.totalPages, start + maxPagesToShow - 1);

      if (end === this.totalPages) {
        start = Math.max(1, end - maxPagesToShow + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    return pages;
  }

  onItemsPerPageChange() {
    this.currentPage = 1;
    this.calculatePagination();
  }

  onTabChange(event: any) {
    this.currentTabIndex = event.index;
    this.currentPage = 1;
    this.itemsPerPage = 10;
    this.refreshFilter();

    if (!this.isFilterButtonClick) {
      this.activeFilter = 'none';
    } else {
      if (this.activeFilter === 'todayActivity') {
        this.activeFilter = 'none';
      }
      if (this.currentTabIndex === 0 && this.activeFilter === 'initiatedToday') {
        this.activeFilter = 'none';
      }
      if (this.currentTabIndex === 1 && ['readyForInitiation', 'clearedMoreThan7Days', 'clearedMoreThan30Days'].includes(this.activeFilter)) {
        this.activeFilter = 'none';
      }
      if (this.currentTabIndex === 2) {
        const appointmentFilters = ['welcomeCall', 'clarityCall', 'diagnostics', 'implementation', 'midReviewDiagnostics', 'finalReview', 'implementationPhase2', 'completed'];
        if (!appointmentFilters.includes(this.activeFilter)) {
          this.activeFilter = 'none';
        }
      }
      if (this.currentTabIndex !== 2) {
        const appointmentFilters = ['welcomeCall', 'clarityCall', 'diagnostics', 'implementation', 'midReviewDiagnostics', 'finalReview', 'implementationPhase2', 'completed'];
        if (appointmentFilters.includes(this.activeFilter)) {
          this.activeFilter = 'none';
        }
      }
    }

    this.isFilterButtonClick = false;
    this.updatePaginatedData();
  }

  onBulkInitiateClick() {
    this.isFilterButtonClick = true;
    this.activeFilter = 'readyForInitiation';
    this.currentPage = 1;
    this.currentTabIndex = 0;
    if (this.tabGroup) {
      this.tabGroup.selectedIndex = 0;
    }
    this.updatePaginatedData();
    this.scrollToTable();
  }

  onShow7DaysStuckClick() {
    this.isFilterButtonClick = true;
    this.activeFilter = 'clearedMoreThan7Days';
    this.currentPage = 1;
    this.currentTabIndex = 0;
    if (this.tabGroup) {
      this.tabGroup.selectedIndex = 0;
    }
    this.updatePaginatedData();
    this.scrollToTable();
  }

  on30DaysStuckClick() {
    this.isFilterButtonClick = true;
    this.activeFilter = 'clearedMoreThan30Days';
    this.currentPage = 1;
    this.currentTabIndex = 0;
    if (this.tabGroup) {
      this.tabGroup.selectedIndex = 0;
    }
    this.updatePaginatedData();
    this.scrollToTable();
  }

  onInitiatedTodayClick() {
    this.isFilterButtonClick = true;
    this.activeFilter = 'initiatedToday';
    this.currentPage = 1;
    this.currentTabIndex = 1;
    if (this.tabGroup) {
      this.tabGroup.selectedIndex = 1;
    }
    this.updatePaginatedData();
    this.scrollToTable();
  }

  clearActiveFilter() {
    this.activeFilter = 'none';
    this.selectedTimeFilter = '';
    this.currentPage = 1;
    this.updatePaginatedData();
  }

  onTodayFilterClick() {
    this.isFilterButtonClick = true;
    this.selectedTimeFilter = 'today';
    this.activeFilter = 'todayActivity';
    this.currentPage = 1;
    this.updatePaginatedData();
    this.scrollToTable();
  }

  on7DaysFilterClick() {
    this.isFilterButtonClick = true;
    this.selectedTimeFilter = '7days';
    this.activeFilter = 'last7DaysActivity';
    this.currentPage = 1;
    this.updatePaginatedData();
    this.scrollToTable();
  }

  on30DaysFilterClick() {
    this.isFilterButtonClick = true;
    this.selectedTimeFilter = '30days';
    this.activeFilter = 'last30DaysActivity';
    this.currentPage = 1;
    this.updatePaginatedData();
    this.scrollToTable();
  }

  onThisMonthFilterClick() {
    this.isFilterButtonClick = true;
    this.selectedTimeFilter = 'thismonth';
    this.activeFilter = 'thisMonthActivity';
    this.currentPage = 1;
    this.updatePaginatedData();
    this.scrollToTable();
  }

  getFilterDisplayText(): string {
    switch (this.activeFilter) {
      case 'readyForInitiation':
        return 'Showing only participants with cleared payment';
      case 'clearedMoreThan7Days':
        return 'Showing only participants waiting 7+ days with cleared payment';
      case 'clearedMoreThan30Days':
        return 'Showing only participants waiting 30+ days with cleared payment';
      case 'initiatedToday':
        return 'Showing only participants initiated today';
      case 'todayActivity':
        return 'Showing today\'s activity (initiated and appointments)';
      case 'last7DaysActivity':
        return 'Showing last 7 days activity';
      case 'last30DaysActivity':
        return 'Showing last 30 days activity';
      case 'thisMonthActivity':
        return 'Showing this month\'s activity';
      case 'welcomeCall':
        return 'Showing participants in Welcome Call stage';
      case 'clarityCall':
        return 'Showing participants in Clarity Call stage';
      case 'diagnostics':
        return 'Showing participants in Diagnostics stage';
      case 'implementation':
        return 'Showing participants in Implementation stage';
      case 'midReviewDiagnostics':
        return 'Showing participants in Mid Review - Diagnostics stage';
      case 'implementationPhase2':
        return 'Showing participants in Implementation Phase 2 stage';
      case 'finalReview':
        return 'Showing participants in Final Review stage';
      case 'completed':
        return 'Showing completed participants';
      default:
        return '';
    }
  }

  getActiveFilterCount(): number {
    if (this.activeFilter === 'none') return 0;
    return this.originalData[this.activeFilter]?.count || 0;
  }

  isFilterActive(): boolean {
    return this.activeFilter !== 'none';
  }

  openParticipantPurchase(participant: any): void {
    const participantId = participant['profileid'];
    if (participantId) {
      const url = this.router.createUrlTree(['/participantpurchase', participantId]).toString();
      window.open(url, '_blank');
    } else {
      console.error('Participant ID not found', participant);
    }
  }

  onKanbanColumnClick(filterType: string) {
    this.isFilterButtonClick = true;

    if (filterType === 'currentJourneyInitiated') {
      this.activeFilter = 'none';
      this.currentPage = 1;
      this.currentTabIndex = 1;
      if (this.tabGroup) {
        this.tabGroup.selectedIndex = 1;
      }
    } else {
      this.activeFilter = filterType as any;
      this.currentPage = 1;
      this.currentTabIndex = 2;
      if (this.tabGroup) {
        this.tabGroup.selectedIndex = 2;
      }
    }

    this.updatePaginatedData();
    this.scrollToTable();
  }

  private scrollToTable() {
    setTimeout(() => {
      const tableElement = document.querySelector('.participant-management-container');
      if (tableElement) {
        tableElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        setTimeout(() => {
          window.scrollBy({ top: -80, behavior: 'smooth' });
        }, 300);
      }
    }, 100);
  }

  onProductFilterChange(event: any) {
    this.selectedProduct = event.target.value;
    this.applyProductFilter();
  }

  onJourneyMonthChange(event: any) {
    const selectedDate = event.value;
    if (!selectedDate) return;
    this.selectedMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    this.updateDisplayMonth();

    // Re-fetch appointments for the new month
    this.filterAppointmentsByType();
  }

  onJourneyMonthSelected(event: Date, picker: any) {
    this.selectedMonth = new Date(event.getFullYear(), event.getMonth(), 1);
    this.journeyMonthPicker.setValue(this.selectedMonth);
    this.updateDisplayMonth();
    picker.close();

    // Re-fetch appointments for the new month
    this.filterAppointmentsByType();
  }

  getCompletionSummary(): CompletionSummary {
    const allCards = [...this.visibleCardIds, ...this.hiddenCardIds];
    let totalCompleted = 0;
    let initToStartTotal = 0, initToStartCount = 0;
    let startToDoneTotal = 0, startToDoneCount = 0;
    const activeProducts = new Set<string>();

    for (const cardId of allCards) {
      const funnel = this.getCardFunnel(cardId);
      const completedCount = funnel.completed.length;
      totalCompleted += completedCount;

      if (completedCount > 0) {
        activeProducts.add(cardId);
      }

      // Avg Init→Start from started items
      for (const item of funnel.started) {
        const sd = item['statusdate'];
        if (!sd) continue;
        const init = this.getDateFromFieldPublic(sd['initiated']);
        const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
        if (init && ongoing) {
          initToStartTotal += Math.abs(ongoing.getTime() - init.getTime()) / (1000 * 60 * 60 * 24);
          initToStartCount++;
        }
      }

      // Avg Start→Done from completed items
      for (const item of funnel.completed) {
        const sd = item['statusdate'];
        if (!sd) continue;
        const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
        const completed = this.getDateFromFieldPublic(sd['completed']);
        if (ongoing && completed) {
          startToDoneTotal += Math.abs(completed.getTime() - ongoing.getTime()) / (1000 * 60 * 60 * 24);
          startToDoneCount++;
        }
      }
    }

    return {
      totalCompleted,
      avgStartToDone: startToDoneCount > 0 ? Math.round(startToDoneTotal / startToDoneCount) : 0,
      avgInitToStart: initToStartCount > 0 ? Math.round(initToStartTotal / initToStartCount) : 0,
      productsActive: activeProducts.size
    };
  }

  getCompletionProducts(): CompletionProduct[] {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#14b8a6', '#6366f1', '#ef4444', '#0891b2', '#be123c', '#7c3aed'];
    const icons = ['🌱', '💡', '✨', '🔬', '🎯', '📦', '⚡', '🔮', '🎨', '🚀'];
    const iconBgs = ['#eff6ff', '#f5f3ff', '#ecfdf5', '#fffbeb', '#f0fdfa', '#eef2ff', '#fef2f2', '#e0f2fe', '#fce7f3', '#ede9fe'];

    const buildProduct = (cardId: string, ci: number): CompletionProduct => {
      const funnel = this.getCardFunnel(cardId);
      const completedItems = funnel.completed;
      const completedCount = completedItems.length;
      const eligible = this.getCardGroupedFiltered(cardId).length;

      let bonusCompletions = 0;
      let purchasedCompletions = 0;
      for (const item of completedItems) {
        const packageId = item['packageref']?.id;
        if (packageId && this.bonusPackageIds.has(packageId)) {
          bonusCompletions++;
        } else {
          purchasedCompletions++;
        }
      }

      let initToStartSum = 0, initToStartCnt = 0;
      let startToDoneSum = 0, startToDoneCnt = 0;

      for (const item of funnel.started) {
        const sd = item['statusdate'];
        if (!sd) continue;
        const init = this.getDateFromFieldPublic(sd['initiated']);
        const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
        if (init && ongoing) {
          initToStartSum += Math.abs(ongoing.getTime() - init.getTime()) / (1000 * 60 * 60 * 24);
          initToStartCnt++;
        }
      }

      for (const item of completedItems) {
        const sd = item['statusdate'];
        if (!sd) continue;
        const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
        const completed = this.getDateFromFieldPublic(sd['completed']);
        if (ongoing && completed) {
          startToDoneSum += Math.abs(completed.getTime() - ongoing.getTime()) / (1000 * 60 * 60 * 24);
          startToDoneCnt++;
        }
      }

      const idx = ci % colors.length;
      return {
        name: this.getCardName(cardId),
        subName: cardId.startsWith('group:') ? this.getCardSubNames(cardId).slice(0, 2).join(', ') : '',
        icon: icons[idx],
        color: colors[idx],
        iconBg: iconBgs[idx],
        completed: completedCount,
        bonusCompletions,
        purchasedCompletions,
        activeSubUsers: this.getCardActiveSub(cardId),
        noSubUsers: this.getCardNonActiveSub(cardId),
        avgInitToStart: initToStartCnt > 0 ? Math.round(initToStartSum / initToStartCnt) : 0,
        avgStartToDone: startToDoneCnt > 0 ? Math.round(startToDoneSum / startToDoneCnt) : 0,
        eligiblePct: eligible > 0 ? Math.round((completedCount / eligible) * 100) : 0,
      };
    };

    // Build visible products first
    let colorIdx = 0;
    const visibleProducts: CompletionProduct[] = [];
    for (const cardId of this.visibleCardIds) {
      visibleProducts.push(buildProduct(cardId, colorIdx++));
    }
    visibleProducts.sort((a, b) => b.completed - a.completed);

    // Then hidden products
    const hiddenProducts: CompletionProduct[] = [];
    for (const cardId of this.hiddenCardIds) {
      hiddenProducts.push(buildProduct(cardId, colorIdx++));
    }
    hiddenProducts.sort((a, b) => b.completed - a.completed);

    return [...visibleProducts, ...hiddenProducts];
  }

  exportProfileModal(): void {
    const rows: any[] = [];
    let index = 1;

    for (const pid of this.profileIds) {
      const items = this.currentGroupedByProfile[pid] || [];
      for (const item of items) {
        rows.push({
          '#': index,
          'DocID': item.id || item['docid'] || '',
          'ProfileID': pid,
          'Participant': this.mapMetaData[pid]?.['name'] || pid,
          'Product': this.mapProductName[item['productref']?.id] || 'Unknown',
          'Status': item['status'] || 'N/A'
        });
      }
      index++;
    }

    this.downloadExcel(rows, `${this.getCardName(this.selectedProductId!)}_${this.modalType}`);
  }

  exportFunnelModal(): void {
    const rows: any[] = [];
    let index = 1;

    for (const pid of this.funnelProfileIds) {
      const items = this.funnelModalProfiles[pid] || [];
      for (const item of items) {
        rows.push({
          '#': index,
          'DocID': item.id || item['docid'] || '',
          'ProfileID': pid,
          'Participant': this.mapMetaData[pid]?.['name'] || pid,
          'Product': this.mapProductName[item['productref']?.id] || 'Unknown',
          'Initiated': item['statusdate']?.['initiated'] ? this.getDateFromFieldPublic(item['statusdate']['initiated']) : '',
          'Ongoing': item['statusdate']?.['ongoing'] ? this.getDateFromFieldPublic(item['statusdate']['ongoing']) : '',
          'Completed': item['statusdate']?.['completed'] ? this.getDateFromFieldPublic(item['statusdate']['completed']) : ''
        });
      }
      index++;
    }

    this.downloadExcel(rows, `${this.getCardName(this.funnelModalProductId!)}_${this.funnelModalType}`);
  }


  getCompletionProductsVisible(): CompletionProduct[] {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#14b8a6', '#6366f1', '#ef4444', '#0891b2', '#be123c', '#7c3aed'];
    let colorIdx = 0;
    const products: CompletionProduct[] = [];
    for (const cardId of this.visibleCardIds) {
      products.push(this.buildCompletionProduct(cardId, colorIdx++));
    }
    products.sort((a, b) => b.completed - a.completed);
    return products;
  }

  getCompletionProductsHidden(): CompletionProduct[] {
    let colorIdx = this.visibleCardIds.length;
    const products: CompletionProduct[] = [];
    for (const cardId of this.hiddenCardIds) {
      products.push(this.buildCompletionProduct(cardId, colorIdx++));
    }
    products.sort((a, b) => b.completed - a.completed);
    return products;
  }

  private buildCompletionProduct(cardId: string, ci: number): CompletionProduct {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#14b8a6', '#6366f1', '#ef4444', '#0891b2', '#be123c', '#7c3aed'];
    const icons = ['🌱', '💡', '✨', '🔬', '🎯', '📦', '⚡', '🔮', '🎨', '🚀'];
    const iconBgs = ['#eff6ff', '#f5f3ff', '#ecfdf5', '#fffbeb', '#f0fdfa', '#eef2ff', '#fef2f2', '#e0f2fe', '#fce7f3', '#ede9fe'];

    const funnel = this.getCardFunnel(cardId);
    const completedItems = funnel.completed;
    const completedCount = completedItems.length;
    const eligible = this.getCardGroupedFiltered(cardId).length;

    let bonusCompletions = 0;
    let purchasedCompletions = 0;
    for (const item of completedItems) {
      const packageId = item['packageref']?.id;
      if (packageId && this.bonusPackageIds.has(packageId)) {
        bonusCompletions++;
      } else {
        purchasedCompletions++;
      }
    }

    let initToStartSum = 0, initToStartCnt = 0;
    let startToDoneSum = 0, startToDoneCnt = 0;

    for (const item of funnel.started) {
      const sd = item['statusdate'];
      if (!sd) continue;
      const init = this.getDateFromFieldPublic(sd['initiated']);
      const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
      if (init && ongoing) {
        initToStartSum += Math.abs(ongoing.getTime() - init.getTime()) / (1000 * 60 * 60 * 24);
        initToStartCnt++;
      }
    }

    for (const item of completedItems) {
      const sd = item['statusdate'];
      if (!sd) continue;
      const ongoing = this.getDateFromFieldPublic(sd['ongoing']);
      const completed = this.getDateFromFieldPublic(sd['completed']);
      if (ongoing && completed) {
        startToDoneSum += Math.abs(completed.getTime() - ongoing.getTime()) / (1000 * 60 * 60 * 24);
        startToDoneCnt++;
      }
    }

    const idx = ci % colors.length;
    return {
      name: this.getCardName(cardId),
      subName: cardId.startsWith('group:') ? this.getCardSubNames(cardId).slice(0, 2).join(', ') : '',
      icon: icons[idx],
      color: colors[idx],
      iconBg: iconBgs[idx],
      completed: completedCount,
      bonusCompletions,
      purchasedCompletions,
      activeSubUsers: this.getCardActiveSub(cardId),
      noSubUsers: this.getCardNonActiveSub(cardId),
      avgInitToStart: initToStartCnt > 0 ? Math.round(initToStartSum / initToStartCnt) : 0,
      avgStartToDone: startToDoneCnt > 0 ? Math.round(startToDoneSum / startToDoneCnt) : 0,
      eligiblePct: eligible > 0 ? Math.round((completedCount / eligible) * 100) : 0,
    };
  }

  private downloadExcel(data: any[], filename: string): void {
    if (!data.length) return;

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename.replace(/\s+/g, '_')}.xlsx`);
  }

  toggleTableView() {
    this.showTable = !this.showTable;
  }
}
