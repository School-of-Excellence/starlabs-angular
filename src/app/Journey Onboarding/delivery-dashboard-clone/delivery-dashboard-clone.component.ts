import { ChangeDetectorRef, Component, ViewChild, TemplateRef, OnInit, OnDestroy, runInInjectionContext, Injector, NgZone } from '@angular/core'; // getFireStore
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { Firestore, collection, collectionData, query, where, updateDoc, doc, getDocs, orderBy, Timestamp, getDoc, serverTimestamp, arrayUnion, writeBatch, documentId } from '@angular/fire/firestore';
import { Observable, Subscription, combineLatest } from 'rxjs';
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
import { MatDatepickerModule } from '@angular/material/datepicker';
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
    eisId: string;
    role: string;
    appointmentTypeName: string;
    appointmentTypeId: string;
    productId: string;
    productClass: string;
    appointmentsGiven: number;
    booked: number;
    availableSlots: number;
    utilizationPct: number;
    utilizationNote?: string;
    utilizationNoteColor?: string;
}

interface VelocityRow {
    week: string;
    product_id: string;
    completions: number;
}

interface FunnelRow {
    product_id: string;
    stage: 'initiated' | 'awaiting' | 'started' | 'ongoing' | 'completed';
    count: number;
}

interface UtilizationRow {
    specialist_id: string;
    profile_ref: string;
    week: string;
    booked: number;
    available: number;
    utilization: number;
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

    // Outer mat-tab-group selectedIndex (Overview=0, Analytics=1, Participants=2)
    outerTabIndex: number = 0;

    // Stages chip loading state (5-8s data fetch needs visible feedback)
    stagesLoading: boolean = false;

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
    productList: any[] = [];
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
    modalType: 'all' | 'filtered' | 'thismonth' | 'nextmonth' | 'bonus' | 'purchased' | 'noteligible' = 'all';
    stageModalType: string = '';
    groupedScheduled: any = {};
    groupedAwaiting: { [key: string]: any[] } = {};
    groupedByProfileAll: { [profileId: string]: any[] } = {};
    groupedByStageProfileAll: any = {};
    groupedByProfileFiltered: { [profileId: string]: any[] } = {};
    bonusPackageIds: Set<{ id: string; package: string }> = new Set();
    addonsPackageIds: Set<{ id: string; package: string }> = new Set();
    groupedBonus: { [key: string]: any[] } = {};
    groupedAddons: { [key: string]: any[] } = {};
    groupedPurchased: { [key: string]: any[] } = {};
    groupedNotEligible: { [key: string]: any[] } = {}
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
    notEligible: any = [];
    stageModalOpen = false;

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
        'A&H Custom Motherhood Excellence Solution for Wife',
        'Test new'
    ]);

    // Specialist section collapsed-by-default UX state (Option A redesign)
    specialistCollapsed = true;

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
        'Critical Support Diagnostics and Implementation': [
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

    // Date filter — default to Last 30 days per sanity-check feedback
    // (this-month was masking pipeline counts when run early in a calendar month)
    selectedTimeFilter: string = '30days';
    dateRangeStart: Date | null = (() => {
        const n = new Date();
        const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
        return new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    })();
    dateRangeEnd: Date | null = new Date();
    range = new FormGroup({
        start: new FormControl<Date | null>(null),
        end: new FormControl<Date | null>(null),
    });

    // Store unfiltered data for re-filtering
    allMatchedProductsRaw: any[] = [];

    showHiddenCompletionProducts: boolean = false;

    private allFetchedAppointments: any[] = [];
    journeyFlowLoading: boolean = false;
    appointmentsAccessible: boolean = true;
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

    productsSubscription: Subscription;
    searchName: string = '';
    filteredOriginalData: any = {};
    showSearchBar = false;
    showTable = false;
    expandedSections: string[] = [];
    filteredCardsMap: { [key: number]: any[] } = {};
    productParticipantData = [];
    selectedProductLabel: string = "";

    appointmentMap = new Map();
    allAppointments = [];
    typeNameMap = new Map();
    appointmentTypes$: any;
    appointmentTypes: any[] = [];
    mappedAppointmentTypes: any[] = [];

    selectedFlowProduct = "";
    mapProductGroupId: any = [];
    stages: any = [];
    tableData: any[] = [];
    filteredParticipantData: any = {};
    selectedProductType: string = '';
    selectedColumns: string[] = [];

    filteredBookedAppointments: any[] = [];
    // The specialist's booked appointments across ALL appointment types — used to
    // resolve who/what occupies a slot (incl. "unavailable" slots that are blocked
    // because the specialist is booked for a different appointment type).
    specialistBookedAll: any[] = [];
    expandedSpecialist: string | null = null;
    minDate: Date = new Date();

    private appointmentsSubscription: Subscription | null = null;
    private participantsProductDataSubscription: Subscription;
    private formsSubscription: Subscription;
    private ticketRequestSubscription: Subscription;

    columns = {
        "eiStarterPack": [
            "Total Eligible",
            "Past Month",
            "This Month",
            "Next Month",
            "Onboarded",
            "Pre-Process",
            "Diagnostics",
            "Implementation",
            "Report",
            "Celebration Call"
        ],

        "criticalSupport": [
            "Total Eligible",
            "Request",
            "Pre-Process Form",
            "Diagnostics",
            "Implementation",
            "Review",
            "Post-Process Form",
            "Completion"
        ],

        "eiCustomSolutions": [
            "Total Eligible",
            "Diagnostics",
            "Implementation",
            "Review",
            "Celebration Call"
        ]
    };

    products = [
        { label: 'WiSH', value: 'WiSH' },
        { label: 'A&H Light', value: 'A&H Light' },
        { label: 'EI Solution', value: 'EI Solution' },
        { label: 'EI Starter Pack', value: 'EI Starter Pack' },
        {
            label: 'Critical Support',
            value: 'Critical Support Diagnostics and Implementation'
        }
    ];

    stagesConfig: any = {
        'Critical Support': [
            'Pre-Process',
            'Diagnostics',
            'Implementation',
            'Review',
            'Post-Process Form',
        ],
        'EI Starter Pack': [
            'Welcome Call',
            'Diagnostics',
            'Implementation',
            'Post Session Check-in',
            'Celebration Call'
        ]
    };

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
    specialistLoadProgress = '';   // e.g. "12 / 53"
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

    currentMonth: number = new Date().getMonth();
    currentYear: number = new Date().getFullYear();

    addonsPackageLookup: Record<string, string> = {};
    bonusPackageLookup: Record<string, string> = {};

    sortDirection: { [key: number]: 'asc' | 'desc' } = {};
    ticketRequest: any[] = [];
    ticketSubscription: any;
    selectedFilter: string = 'recent';
    selectedStageFilter: string = '';
    selectedStatus: string = 'all';
    allFunnelModalProfiles: any = {};
    selectedStage = '';

    openAppointmentModal = false;
    participantLoading = false;

    selectedSpecialistSlots: any;
    availableDates: any[] = [];
    selectedDate: string = '';
    selectedEisProfile: string = '';
    selectedEISId = null;
    selectedAppointmentTypeId = null;
    selectedActivity: string | null = null;
    selectedView: string = 'booked';

    profileList = [];
    mapProfile = {};
    selectedUser: string = null
    filteredProfile = ""
    slotSelected = false;
    selectedSlotData: any;
    loggedInPID: any;

    // Profiles that actually have a ready appointment deliverable for the
    // selected activity — used to pre-filter the booking profile picker.
    eligibleProfileIds = new Set<string>();
    eligibleProfilesLoading = false;

    initiateProductOptions: any = {};
    deliveryTypes: string[] = [];
    participantData: any;
    minimumPayment: number | null = null;
    tentativeStartDate: Date | null = null;
    selectedDeliveryType: string = '';

    productData: any = {
        eiStarterPack: {
            totalEligible: [],
            pastMonth: [],
            thisMonth: [],
            nextMonth: [],
            onBoarded: [],
            preprocess: [],
            diagnostics: [],
            implementation: [],
            reports: [],
            celebrationCall: []
        },

        eiCustomSolutions: {
            totalEligible: [],
            pastMonth: [],
            thisMonth: [],
            nextMonth: [],
            diagnostics: [],
            implementation: [],
            review: [],
            celebrationCall: []
        },

        criticalSupport: {
            totalEligible: [],
            request: [],
            preprocess: [],
            diagnostics: [],
            implementation: [],
            review: [],
            postForm: [],
            completion: []
        }
    };

    stageData: any = {
        diagnostics: {
            all: [],
            today: [],
            tomorrow: [],
            overdue: []
        },
        implementation: {
            all: [],
            today: [],
            tomorrow: [],
            overdue: []
        },
        review: {
            all: [],
            today: [],
            tomorrow: [],
            overdue: []
        },
        celebrationCall: {
            all: [],
            today: [],
            tomorrow: [],
            overdue: []
        }
    };

    constructor(
        private firestore: Firestore,
        private cdr: ChangeDetectorRef,
        private dialog: MatDialog,
        private guard: AuthguardService,
        private router: Router,
        private fb: FormBuilder,
        private injector: Injector,
        private datepipe: DatePipe,
        private ngZone: NgZone,
    ) {
        this.filterForm = this.fb.group({
            search: [''],
            journey: [[]],
            product: [[]]
        });

        this.filterForm.get('product')!.valueChanges.subscribe(() => {
            this.onProductMultiFilterChange();
        });

    }

    get productFilterControl(): FormControl {
        return this.filterForm.get('product') as FormControl;
    }

    private shortenProductName(rawName: string): string {
        if (!rawName) return '';
        const norm = rawName.toLowerCase().trim();
        const matched = (this.products || []).find((p: any) =>
            (p?.value || '').toLowerCase().trim() === norm ||
            (p?.label || '').toLowerCase().trim() === norm
        );
        return matched?.label || rawName;
    }

    cardLabelForProductId(productId: string): string {
        const groups = this.mergedGroupIds || {};
        for (const groupName of Object.keys(groups)) {
            const ids = groups[groupName];
            if (ids && (ids instanceof Set ? ids.has(productId) : (ids as any)[productId] !== undefined)) {
                return groupName;
            }
        }
        return this.shortenProductName(this.mapProductName?.[productId] || '');
    }

    // ----- Memoization for hot getters (clear via invalidateMemos()) -------
    private _memo = new Map<string, any>();
    private invalidateMemos(): void { this._memo.clear(); }
    private memoGet<T>(key: string, compute: () => T): T {
        if (!this._memo.has(key)) this._memo.set(key, compute());
        return this._memo.get(key);
    }

    trackByCardId = (_: number, id: string) => id;

    get availableCardLabels(): string[] {
        return this.memoGet('acl', () => {
            const labels = new Set<string>();
            for (const item of this.allMatchedProductsRaw || []) {
                const pid = item?.productref?.id;
                if (!pid) continue;
                const label = this.cardLabelForProductId(pid);
                if (label) labels.add(label);
            }
            return Array.from(labels).sort();
        });
    }

    get allProductsSelected(): boolean {
        const sel = (this.productFilterControl?.value as string[]) || [];
        const all = this.availableCardLabels;
        return all.length > 0 && sel.length === all.length;
    }

    get productFilterActive(): boolean {
        const sel = (this.productFilterControl?.value as string[]) || [];
        return sel.length > 0 && !this.allProductsSelected;
    }

    get productSelectTrigger(): string {
        const sel = (this.productFilterControl?.value as string[]) || [];
        const all = this.availableCardLabels;
        if (sel.length === 0 || sel.length === all.length) return 'All products';
        if (sel.length === 1) return sel[0];
        return `${sel.length} products selected`;
    }

    toggleAllProducts(checked: boolean) {
        this.productFilterControl?.setValue(checked ? [...this.availableCardLabels] : []);
    }

    get activeFilterSummary(): string {
        const parts: string[] = [];
        const sel = (this.productFilterControl?.value as string[]) || [];
        const all = this.availableCardLabels;
        if (sel.length > 0 && sel.length < all.length) {
            parts.push(sel.length === 1 ? sel[0] : `${sel.length} products`);
        }
        const tf = this.selectedTimeFilter;
        const tfLabel: Record<string, string> = {
            today: 'Today', '7days': '7 days', '30days': '30 days',
            thismonth: 'This month', custom: 'Custom range'
        };
        if (tf && tf !== 'all' && tfLabel[tf]) parts.push(tfLabel[tf]);
        return parts.join(' · ');
    }

    itemPassesProductFilter(item: any): boolean {
        if (!this.productFilterActive) return true;
        const pid = item?.productref?.id;
        if (!pid) return false;
        const label = this.cardLabelForProductId(pid);
        if (!label) return false;
        return ((this.productFilterControl.value as string[]) || []).includes(label);
    }

    private resolveProductLabel(picked: string): string | null {
        // Direct match (e.g., 'EI Starter Pack' is both card label and mapProductGroupId key)
        if (this.mapProductGroupId?.[picked]) return picked;
        // Indirect match: the multi-select shows the full product NAME from Firestore
        // (e.g., 'Critical Support Diagnostics and Implementation') but
        // mapProductGroupId is keyed by the short label (e.g., 'Critical Support').
        const norm = (picked || '').toLowerCase().trim();
        const found = (this.products || []).find((p: any) =>
            (p?.value || '').toLowerCase().trim() === norm ||
            (p?.label || '').toLowerCase().trim() === norm
        );
        if (found && this.mapProductGroupId?.[found.label]) return found.label;
        return null;
    }

    async onProductMultiFilterChange() {
        const selectedProductIds: string[] = this.productFilterControl.value ?? [];
        console.log("selected product ids", selectedProductIds);
        if (!this.allMatchedProductsRaw || this.allMatchedProductsRaw.length === 0) return;
        // Filter changed → flush memoized getters (visibleCardIds, allProductIdsFromRaw, etc.)
        this.invalidateMemos();
        const sel = (this.productFilterControl.value as string[]) || [];
        let known: string | null = null;
        if (this.productFilterActive && sel.length >= 1) {
            for (const label of sel) {
                const resolved = this.resolveProductLabel(label);
                if (resolved) { known = resolved; break; }
            }
        }
        if (known) {
            this.selectedProductLabel = known;
        } else {
            this.clearStats();
        }
        // applyDateFilter rebuilds gated data and (when label is set) re-runs selectProduct
        await this.applyDateFilter();
    }

    async ngOnInit() {
        this.startLastUpdatedTimer();
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

            const bonusPackageSnap = await runInInjectionContext(this.injector, () =>
                getDocs(query(
                    collection(this.firestore, 'package'),
                    where('package', '==', 'Bonus')
                ))
            );

            const addonsPackageSnap = await runInInjectionContext(this.injector, () =>
                getDocs(query(
                    collection(this.firestore, 'package'),
                    where('package', '==', 'Addons')
                ))
            );

            this.bonusPackageIds = new Set(
                bonusPackageSnap.docs.map(d => ({
                    id: d.id,
                    package: (d.data() as any)?.package || ''
                }))
            );

            this.addonsPackageIds = new Set(
                addonsPackageSnap.docs.map(d => ({
                    id: d.id,
                    package: (d.data() as any)?.package || ''
                }))
            );

            this.bonusPackageIds.forEach((p: any) => {
                this.bonusPackageLookup[p.id] = p.package;
            });

            this.addonsPackageIds.forEach((p: any) => {
                this.addonsPackageLookup[p.id] = p.package;
            });

            // Process journey 
            for (const doc of journeySnap.docs) {
                const data = doc.data();
                this.mapjourneyname[data['id']] = data['journey'];
                if (data['journey']) this.journeyList.push(data['journey']);
            }

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

            // Get Appointment Types
            const appointmentTypesSnap = await runInInjectionContext(this.injector, () =>
                getDocs(collection(this.firestore, 'appointmenttype'))
            );

            this.mappedAppointmentTypes = appointmentTypesSnap.docs.map(d => ({
                id: d.id,
                appointmenttype: d.data()['appointmenttype']
            }));

            // Filter only required Products from the Productlist
            this.mapProductGroupId = this.rawProductData
                .filter(item =>
                    this.products.some(
                        p => p.value.toLowerCase().trim() === item?.product?.toLowerCase().trim()
                    )
                )
                .reduce((acc, item) => {
                    const matchedProduct = this.products.find(
                        p => p.value.toLowerCase().trim() === item.product?.toLowerCase().trim()
                    );

                    if (matchedProduct) {
                        acc[matchedProduct.label] = item.id;
                    }

                    return acc;
                }, {} as Record<string, string>);

            // Process users (depends on mapprofile from metadata)
            this.coachesList = usersSnap.docs
                .map((e) => e.data())
                .sort((a: any, b: any) => {
                    const nameA = (this.mapprofile[a['profile_ref']?.id] || '').toLowerCase();
                    const nameB = (this.mapprofile[b['profile_ref']?.id] || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });

            this.checkAllDataLoaded();

            // Specialist Appointment Slots section is always visible (no longer
            // collapsible) — initialise the date range and load its base data.
            if (!this.specialistSlotsInitialized) {
                this.specialistSlotsInitialized = true;
                this.initSpecialistDateRange();
                this.loadSpecialistBaseData();
            }

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
        this.participantsProductDataSubscription?.unsubscribe();
        this.appointmentsSubscription?.unsubscribe();
        this.formsSubscription?.unsubscribe();
        this.ticketRequestSubscription?.unsubscribe();
        // Clear the "last updated" timer
        if (this._lastUpdatedTimer) {
            clearInterval(this._lastUpdatedTimer);
            this._lastUpdatedTimer = null;
        }
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

    excludedModes = new Set([
        'installation event mode',
        'event mode',
        'integration mode',
    ]);

    async applyDateFilter() {
        // Invalidate memoized getters — fresh data is about to land.
        this.invalidateMemos();
        try {
            const groupedAll = {};
            const groupedFiltered = {};
            const groupedThisMonth = {};
            const groupedNextMonth = {};
            const groupedBonus = {};
            const groupedAddons = {}
            const groupedPurchased = {};
            const groupedNotEligible = {};
            const funnelData = {};
            const avgInitToStart = {};
            const avgStartToComplete = {};

            for (const item of this.allMatchedProductsRaw) {
                const productId = item?.productref?.id;
                if (!productId) continue;
                if (!this.itemPassesProductFilter(item)) continue;

                const status = item?.status?.toLowerCase?.() || null;
                const profileId = item?.profileid;
                const mode = this.mapMetaData?.[profileId]?.['participantmode']?.toLowerCase().trim();
                const totalPaid = parseInt(this.mapMetaData?.[profileId]?.['pp_totalpaid'] ?? '0') || 0;
                const totalPurchaseValue = parseInt(this.mapMetaData?.[profileId]?.['pp_totalpurchasevalue'] ?? '0') || 0;
                const totalBalance = totalPurchaseValue - totalPaid;
                const minPayment = parseInt(item?.['minimumpayment']) || 0;
                const isEligible = !this.excludedModes.has(mode) && (totalBalance <= 0 || totalPaid >= minPayment);
                const statusdate = item?.statusdate || {};
                const tentativestart = item?.tentativestart || null;
                const packageId = item?.packageref?.id;

                if (!['completed', 'ongoing'].includes(status)) {
                    // ── Pre-completion pool (Total, Eligible, Not Elig., Purchased, Bonus) ──
                    // All four participant-count columns use the same base filter:
                    // exclude completed and ongoing so the sums are consistent:
                    //   Total = Eligible + Not Elig.
                    //   Eligible = Purchased + Bonus
                    (groupedAll[productId] ||= []).push(item);

                    if (isEligible) {
                        (groupedFiltered[productId] ||= []).push(item);

                        if (tentativestart?.toDate) {
                            const d = tentativestart.toDate();
                            if (this.isDateInCurrentMonth(d)) {
                                (groupedThisMonth[productId] ||= []).push(item);
                            } else if (this.isDateInNextMonth(d)) {
                                (groupedNextMonth[productId] ||= []).push(item);
                            }
                        }

                        // Purchased / Bonus split — inside same status guard so they match Eligible.
                        // Addons are treated as Purchased (both are paid/entitled, non-bonus).
                        if (packageId && this.bonusPackageLookup[packageId]) {
                            (groupedBonus[productId] ||= []).push(item);
                        } else {
                            // Standard purchase OR addons package — both go into Purchased
                            (groupedPurchased[productId] ||= []).push(item);
                        }
                    } else {
                        (groupedNotEligible[productId] ||= []).push(item);
                    }
                }

                if (!funnelData[productId]) {
                    funnelData[productId] = { awaiting: [], initiated: [], started: [], ongoing: [], completed: [] };
                }

                if (status === 'ongoing') {
                    funnelData[productId].ongoing.push(item);
                }

                if (status === 'completed') {
                    const completedDate = this.getDateFromFieldPublic(statusdate['completed']);
                    if (this.isDateInRange(completedDate)) funnelData[productId].completed.push(item);
                }

                if (isEligible) {
                    // Funnel Data (includes ongoing/completed — separate from the participant-count columns)
                    if (!status) {
                        funnelData[productId].awaiting.push(item);
                    } else if (status === 'initiated') {
                        const d = this.getDateFromFieldPublic(statusdate['initiated']);
                        if (this.isDateInRange(d)) funnelData[productId].initiated.push(item);
                    } else if (status === 'ongoing') {
                        const d = this.getDateFromFieldPublic(statusdate['ongoing']);
                        if (this.isDateInRange(d)) funnelData[productId].started.push(item);
                    }
                }
            }

            // assign
            this.groupedAll = groupedAll;
            this.groupedFiltered = groupedFiltered;
            this.groupedThisMonth = groupedThisMonth;
            this.groupedNextMonth = groupedNextMonth;
            this.groupedBonus = groupedBonus;
            this.groupedAddons = groupedAddons;
            this.groupedPurchased = groupedPurchased;
            this.groupedNotEligible = groupedNotEligible;
            this.funnelData = funnelData;
        } catch (err) {
            console.log("error apply date filter", err);
        }

        // Universal filter: rehydrate Stages section against freshly gated data
        if (this.selectedProductLabel) {
            await this.selectProduct(this.selectedProductLabel);
        }

        // Repopulate the actionable cohorts (Participants tab) from the
        // freshly gated participantsproduct data. Stage-based, not appointment-
        // based — so it works even when the appointments read is denied.
        this.populateActionableCohorts();
    }

    getConversionRate(cardId: string): number {
        const funnel = this.getCardFunnel(cardId);
        const total = this.getCardGroupedFiltered(cardId).length;
        if (total === 0) return 0;
        return Math.round((funnel.completed.length / total) * 100);
    }

    async selectProduct(product: string) {
        this.participantLoading = true;
        // Clear previous product's data immediately so stale cards don't show while loading
        this.productData = {
            eiStarterPack: { totalEligible: [], pastMonth: [], thisMonth: [], nextMonth: [], onBoarded: [], preprocess: [], diagnostics: [], implementation: [], reports: [], celebrationCall: [] },
            eiCustomSolutions: { totalEligible: [], pastMonth: [], thisMonth: [], nextMonth: [], diagnostics: [], implementation: [], review: [], celebrationCall: [] },
            criticalSupport: { totalEligible: [], request: [], preprocess: [], diagnostics: [], implementation: [], review: [], postForm: [], completion: [] }
        };
        const productId = this.mapProductGroupId[product];
        this.selectedProductLabel = product;
        this.stages = this.stagesConfig[product] || [];

        if (this.allAppointments?.length === 0) {
            await this.filterAppointmentsByType('all', null);
            await this.FilterReportData(productId);
            if (product === 'Critical Support') await this.fetchTicketRiseParticipants();
        }

        if (product === 'EI Starter Pack') {
            this.selectedColumns = this.columns.eiStarterPack;
            await this.filterProductData('eiStarterPack', product, productId);
            await this.filterStageData('eiStarterPack');
        } else if (product === 'EI Solution') {
            this.selectedColumns = this.columns.eiCustomSolutions;
            await this.filterProductData('eiCustomSolutions', product, productId);
            await this.filterStageData('eiCustomSolutions');
        } else if (product === 'Critical Support') {
            this.selectedColumns = this.columns.criticalSupport;
            await this.filterProductData('criticalSupport', product, productId);
            await this.filterStageData('criticalSupport');
        }
        this.participantLoading = false;
        this.stagesLoading = false;
    }

    async filterAppointmentsByType(mode: string, appointmentTypeId: string): Promise<void> {
        this.journeyFlowLoading = true;
        this.cdr.detectChanges();

        return new Promise((resolve, reject) => {
            try {
                this.appointmentsSubscription?.unsubscribe();
                this.appointmentsSubscription = new Subscription();

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

                const startTimestamp = Timestamp.fromDate(monthStart);
                const endTimestamp = Timestamp.fromDate(monthEnd);

                let q: any;
                if (mode === 'all') {
                    q = query(
                        collection(this.firestore, "appointments"),
                        where("cancelled", "==", false),
                        where("starttime", ">=", startTimestamp),
                        where("starttime", "<=", endTimestamp)
                    );
                } else if (mode === 'custom') {
                    q = query(
                        collection(this.firestore, "appointments"),
                        where("cancelled", "==", false),
                        where("starttime", ">=", startTimestamp),
                        where("starttime", "<=", endTimestamp),
                        where(
                            "appointment",
                            "==",
                            doc(this.firestore, `/appointmenttype/${appointmentTypeId}`)
                        )
                    );
                }

                const sub = collectionData(q, { idField: 'id' })
                    .subscribe({
                        next: async (appointmentsSnap: any[]) => {
                            let updatedAppointments = [...appointmentsSnap];
                            await Promise.all(
                                updatedAppointments.map(async (appointment: any) => {
                                    appointment.appointmentTypeName = await this.resolveAppointmentType(appointment);
                                })
                            );

                            updatedAppointments = updatedAppointments.map((app: any) => {
                                const matchedProduct = this.allMatchedProductsRaw.find(
                                    (product: any) =>
                                        product.docid === app.participantproductid
                                );
                                return {
                                    ...matchedProduct,
                                    ...app
                                };
                            });

                            const hasChanges = this.allAppointments !== updatedAppointments;
                            if (hasChanges) {
                                this.allAppointments = updatedAppointments;

                                if (this.selectedProductLabel) {
                                    await this.selectProduct(this.selectedProductLabel);
                                }
                                this.cdr.detectChanges();
                            }
                            this.loadingStates.appointments = true;
                            this.journeyFlowLoading = false;
                            resolve();
                        },
                        error: (err) => {
                            // Defensive degrade: a Firestore permission denial on
                            // the 'appointments' collection means the user's role
                            // can't read appointment-level detail. Keep the page
                            // alive — Stages columns are sourced from
                            // participantsproduct + funnelData and continue to work.
                            const denied = err?.code === 'permission-denied' ||
                                /permission|insufficient/i.test(err?.message || '');
                            if (denied) {
                                console.warn("Appointments not accessible for this role; degrading gracefully.", err);
                                this.appointmentsAccessible = false;
                                this.allAppointments = [];
                            } else {
                                console.error("Error loading appointments:", err);
                            }
                            this.loadingStates.appointments = true;
                            this.journeyFlowLoading = false;
                            this.cdr.detectChanges();
                            resolve();
                        }
                    });
                this.appointmentsSubscription.add(sub);
            } catch (error) {
                console.error("Error loading appointments:", error);
                this.loadingStates.appointments = true;
                this.journeyFlowLoading = false;
                this.cdr.detectChanges();
                reject(error);
            }
        });
    }

    async filterProductData(productType: string, product: string, productId: string) {
        let productData: any = {
            eiStarterPack: {
                totalEligible: [],
                pastMonth: [],
                thisMonth: [],
                nextMonth: [],
                onBoarded: [],
                preprocess: [],
                diagnostics: [],
                implementation: [],
                reports: [],
                celebrationCall: []
            },

            eiCustomSolutions: {
                totalEligible: [],
                pastMonth: [],
                thisMonth: [],
                nextMonth: [],
                diagnostics: [],
                implementation: [],
                review: [],
                celebrationCall: []
            },

            criticalSupport: {
                totalEligible: [],
                request: this.ticketRequest.length ? this.ticketRequest : [],
                preprocess: [],
                diagnostics: [],
                implementation: [],
                review: [],
                postForm: [],
                completion: []
            }
        };

        this.selectedProductType = productType;
        const allAppointments = this.allAppointments;
        try {
            const totalEligible = this.getCardGroupedFiltered(productId);
            if (this.selectedProductType === 'criticalSupport') {
                productData.criticalSupport.totalEligible = [...totalEligible];
            }
            else if (this.selectedProductType === 'eiStarterPack') {
                for (let data of totalEligible) {
                    const { status, tentativestart } = data;

                    if (status === null || status === "initiated") {
                        if (!tentativestart) productData.eiStarterPack.totalEligible.push(data);
                        else if (tentativestart) {
                            const date = tentativestart.toDate();
                            const itemMonth = date.getMonth();
                            const itemYear = date.getFullYear();
                            this.handleMonthCategory(itemMonth, itemYear, data, null, productData, 'eiStarterPack');
                        }
                    }
                };
            }

            // Total Eligible
            const ongoingData = this.funnelData[productId]?.ongoing || [];

            for (let data of ongoingData) {
                let appointments = Array.from(allAppointments.values() || [])
                    .filter((app: any) => app.participantproductid === data.docid);
                await Promise.all(
                    appointments.map(async (appointment) => {
                        if (!appointment.appointmentTypeName) {
                            appointment.appointmentTypeName =
                                await this.resolveAppointmentType(appointment);
                        }
                    })
                );

                const attendedAppointments = appointments.filter(app => app.attended === true || app.status === 'submitted');
                let mergedData = {
                    ...data,
                    allappointments: appointments
                };

                if (attendedAppointments.length === 0) {
                    if (this.selectedProductType === 'criticalSupport') {
                        productData.criticalSupport.totalEligible.push(mergedData);
                    } else if (this.selectedProductType === 'eiStarterPack') {
                        if (!data.tentativestart) {
                            productData.eiStarterPack.totalEligible.push(mergedData);
                        } else {
                            const date = data.tentativestart.toDate();
                            const itemMonth = date.getMonth();
                            const itemYear = date.getFullYear();
                            this.handleMonthCategory(itemMonth, itemYear, data, appointments, productData, 'eiStarterPack');
                        }
                    } else if (this.selectedProductType === 'eiCustomSolutions') {
                        if (!data.tentativestart) {
                            productData.eiCustomSolutions.totalEligible.push(mergedData);
                        } else {
                            const date = data.tentativestart.toDate();
                            const itemMonth = date.getMonth();
                            const itemYear = date.getFullYear();
                            this.handleMonthCategory(itemMonth, itemYear, data, appointments, productData, this.selectedProductType);
                        }
                    }
                }
                else if (attendedAppointments.length > 0) {
                    // ========================= EI CUSTOM SOLUTIONS =========================
                    if (this.selectedProductType === 'eiCustomSolutions') {
                        const reviewAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `ei review`
                        );
                        const implementationAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `ei implementation`
                        );
                        const diagnosticsAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `ei diagnostics`
                        );

                        if (reviewAppointment) {
                            productData.eiCustomSolutions.review.push({
                                ...mergedData,
                                ...reviewAppointment
                            });
                        } else if (implementationAppointment) {
                            productData.eiCustomSolutions.implementation.push({
                                ...mergedData,
                                ...implementationAppointment
                            });
                        } else if (diagnosticsAppointment) {
                            productData.eiCustomSolutions.diagnostics.push({
                                ...mergedData,
                                ...diagnosticsAppointment
                            });
                        }
                    }
                    // ========================= EI STARTER PACK =========================
                    else if (this.selectedProductType === 'eiStarterPack') {
                        const reportAppointment = attendedAppointments.find(app =>
                            app.formname?.toLowerCase() === `${product.toLowerCase()} post session check-in`
                        );
                        const implementationAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `${product.toLowerCase()} implementation`
                        );
                        const diagnosticsAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `${product.toLowerCase()} diagnostics`
                        );
                        const welcomeCallAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `${product.toLowerCase()} welcome call`
                        );

                        if (reportAppointment) {
                            productData.eiStarterPack.reports.push({
                                ...mergedData,
                                ...reportAppointment
                            });
                        } else if (implementationAppointment) {
                            productData.eiStarterPack.implementation.push({
                                ...mergedData,
                                ...(implementationAppointment)
                            });
                        } else if (diagnosticsAppointment) {
                            productData.eiStarterPack.diagnostics.push({
                                ...mergedData,
                                ...(diagnosticsAppointment)
                            });
                        } else if (welcomeCallAppointment) {
                            productData.eiStarterPack.onBoarded.push({
                                ...mergedData,
                                ...welcomeCallAppointment
                            });
                        }
                    }
                    // ========================= CRITICAL SUPPORT =========================
                    else if (this.selectedProductType === 'criticalSupport') {
                        const postprocessAppointment = attendedAppointments.find(app =>
                            app.formname?.toLowerCase() === 'critical support post form'
                        );
                        const reviewAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `critical support review`
                        );
                        const implementationAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === 'critical support implementation'
                        );
                        const diagnosticsAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === 'critical support diagnostics'
                        );
                        const preprocessAppointment = attendedAppointments.find(app =>
                            app.formname?.toLowerCase() === 'critical support pre form'
                        );


                        if (postprocessAppointment) {
                            productData.criticalSupport.postForm.push({
                                ...mergedData,
                                ...postprocessAppointment
                            });
                        } else if (reviewAppointment) {
                            productData.criticalSupport.review.push({
                                ...mergedData,
                                ...reviewAppointment
                            });
                        } else if (implementationAppointment) {
                            productData.criticalSupport.implementation.push({
                                ...mergedData,
                                ...implementationAppointment
                            });
                        } else if (diagnosticsAppointment) {
                            productData.criticalSupport.diagnostics.push({
                                ...mergedData,
                                ...diagnosticsAppointment
                            });
                        } else if (preprocessAppointment) {
                            productData.criticalSupport.preprocess.push({
                                ...mergedData,
                                ...preprocessAppointment
                            });
                        }
                    }
                }
            }

            // ========================= COMPLETED DATA =========================
            const completedData = this.funnelData[productId]?.completed || [];

            for (let data of completedData) {
                let appointments = Array.from(allAppointments.values() || [])
                    .filter((app: any) => app.participantproductid === data.docid);
                data = {
                    ...data,
                    allappointments: appointments
                };

                if (productType === 'eiStarterPack') {
                    productData.eiStarterPack.celebrationCall.push(data);
                }

                if (productType === 'criticalSupport') {
                    productData.criticalSupport.completion.push(data);
                }
            }
            Object.assign(this.productData, productData);
            this.updateFilteredCards();
        } catch (err) {
            console.log("error filtering data", err);
        }
    }

    handleMonthCategory(itemMonth: number, itemYear: number, data: any, allappointments: any, productData: any, productType: string) {
        let mergedData: any;
        if (allappointments !== null && allappointments?.length > 0) {
            mergedData = { ...data, allappointments: allappointments }
        } else {
            mergedData = data;
        }

        if (itemMonth === this.currentMonth && itemYear === this.currentYear) {
            productData[productType].thisMonth.push(mergedData);
        } else if (
            (itemMonth === this.currentMonth - 1 && itemYear === this.currentYear) ||
            (this.currentMonth === 0 && itemMonth === 11 && itemYear === this.currentYear - 1)
        ) {
            productData[productType].pastMonth.push(mergedData);
        } else if (
            (itemMonth === this.currentMonth + 1 && itemYear === this.currentYear) ||
            (this.currentMonth === 11 && itemMonth === 0 && itemYear === this.currentYear + 1)
        ) {
            productData[productType].nextMonth.push(mergedData);
        } else productData[productType].totalEligible.push(mergedData);
    }

    async fetchTicketRiseParticipants() {
        this.ticketRequestSubscription?.unsubscribe();
        this.ticketRequestSubscription = new Subscription();

        const ticketQuery = query(
            collection(this.firestore, 'clientissue'),
            where('category', '==', 'Critical Support'),
            where('status.status', '==', 'Open')
        );

        const sub = collectionData(ticketQuery, {
            idField: 'id'
        }).subscribe(async (participantTickets: any) => {

            this.ticketRequest = participantTickets;

            if (this.selectedProductLabel) {
                await this.selectProduct(this.selectedProductLabel);
            }
        });
        this.ticketRequestSubscription.add(sub);
    }

    async FilterReportData(productId: string) {
        if (this.formsSubscription) {
            this.formsSubscription.unsubscribe();
        }

        this.formsSubscription = new Subscription();
        const observables: Observable<any[]>[] = [];

        for (let i = 0; i < this.allMatchedProductsRaw.length; i += 10) {
            const chunk = this.allMatchedProductsRaw
                .slice(i, i + 10)
                .map(item => item.docid);
            const q = query(
                collection(this.firestore, 'formsByClient'),
                where('participantproductid', 'in', chunk)
            );
            const obs$ = runInInjectionContext(this.injector, () =>
                collectionData(q, { idField: 'id' })
            );
            observables.push(obs$);
        }

        const sub = combineLatest(observables).subscribe(async (snapshots) => {
            const updatedForms: any[] = [];
            for (const docs of snapshots) {
                const formResults = await Promise.all(
                    docs.map(async (data: any) => {
                        let appointments = Array.from(this.allAppointments.values() || [])
                            .filter((app: any) =>
                                app.participantproductid === data.participantproductid
                            );
                        for (let appointment of appointments) {
                            try {
                                const appointmenttype =
                                    await this.resolveAppointmentType(appointment);

                                appointment.appointmentTypeName = appointmenttype;
                            } catch (err) {
                                console.log("error", err);
                            }
                        }
                        appointments = [...appointments, data];
                        return {
                            ...data,
                            status: data?.date ? 'submitted' : 'pending',
                            appointmentstart: data?.date || null,
                            productid: productId,
                            allappointments: appointments || []
                        };
                    })
                );
                updatedForms.push(...formResults);
            }
            this.allAppointments = [
                ...Array.from(this.allAppointments.values()),
                ...updatedForms
            ];
            if (this.selectedProductLabel) await this.selectProduct(this.selectedProductLabel);
        });
        this.formsSubscription.add(sub);
    };

    getAppointmentsByStage(stage: string, appointments: any[]) {
        if (!appointments?.length) return [];

        return appointments.filter(app => {
            let typeName = '';
            if (app?.appointmentTypeName) {
                typeName = app.appointmentTypeName;
            } else if (app?.formname === 'Critical Support Pre Form') {
                typeName = 'Pre-Process';
            } else if (app?.formname === 'Critical Support Post Form') {
                typeName = 'Post-Process Form'
            } else if (app?.formname === 'EI Starter Pack Post Session Check-in') {
                typeName = 'Post Session Check-in';
            }
            return typeName.toLowerCase().includes(stage.toLowerCase());
        });
    }

    getAppointmentDisplay(appointment: any) {
        if (!appointment) return null;
        if (appointment?.date) {
            return {
                label: 'Submitted:',
                start: this.formatDateTime(appointment.date),
                end: null
            };
        }

        return {
            label: 'Start:',
            start: appointment?.appointmentstart
                ? this.formatDateTime(appointment.appointmentstart)
                : null,
            end: appointment?.appointmentend
                ? this.formatDateTime(appointment.appointmentend)
                : null
        };
    }

    getStyleStatusClass(app: any): string {
        if (app?.cancelled) return 'status-cancelled';
        else if (app?.attended) return 'status-completed';
        else if (app?.starttime) return 'status-scheduled';
        else if (app?.date) return 'status-submitted';
        else return 'status-notscheduled';
    }

    getFullStageName(c: any, stage: string) {
        const productName = this.mapProductName?.[c?.productref?.id] || '';
        return `${productName} ${stage}`;
    }

    resolveAppointmentType(appointment: any) {
        // If it's from forms
        if (appointment?.formid) {
            if (appointment?.formname === 'Critical Support Pre Form') return 'Pre-Process';
            else if (appointment?.formname === 'Critical Support Post Form') return 'Post-Process Form';
            else if (appointment?.formname === 'Post Session Check-in') return 'Post Session Check-in';
        }
        // Normal appointment flow
        const id = appointment?.appointment?.id;
        const match = this.mappedAppointmentTypes.find(x => x.id === id);

        return match?.appointmenttype;
    }

    async filterStageData(product: string) {
        let stageConfig = [];
        if (product === 'criticalSupport') {
            stageConfig = [
                { key: 'diagnostics', appointmentType: 'Critical Support Diagnostics' },
                { key: 'implementation', appointmentType: 'Critical Support Implementation' },
                { key: 'review', appointmentType: 'Critical Support Review' }
            ];
        } else if (product === 'eiStarterPack') {
            stageConfig = [
                { key: 'onboarded', appointmentType: 'EI Starter Pack Welcome Call' },
                { key: 'diagnostics', appointmentType: 'EI Starter Pack Diagnostics' },
                { key: 'implementation', appointmentType: 'EI Starter Pack Implementation' },
                { key: 'celebration call', appointmentType: 'EI Starter Pack Celebration Call' }
            ];
        } else if (product === 'eiCustomSolutions') {
            stageConfig = [
                { key: 'diagnostics', appointmentType: 'EI Diagnostics' },
                { key: 'implementation', appointmentType: 'EI Implementation' },
                { key: 'review', appointmentType: 'EI Review' },
                { key: 'celebration call', appointmentType: 'EI Celebration Call' }
            ];
        }

        stageConfig.forEach(stage => {
            this.stageData[stage.key] = this.filterAppointmentsForStage(stage.appointmentType);
        });
    }

    filterAppointmentsForStage(appointmentTypeName: string) {
        const {
            startOfToday,
            startOfTomorrow,
            endOfTomorrow
        } = this.getTodayAndTomorrowRange();

        // const filteredAppointments = this.allAppointments.filter(app =>
        //     app.appointmentTypeName === appointmentTypeName &&
        //     app.attended === false
        // );

        const filteredAppointments = this.allAppointments
            .filter(app =>
                app.appointmentTypeName === appointmentTypeName &&
                app.attended === false
            )
            .map((app: any) => {

                const matchedProduct = this.allMatchedProductsRaw.find(
                    (product: any) =>
                        product.docid === app.participantproductid
                );

                return {
                    ...matchedProduct,
                    ...app
                };
            });
        console.log("filtered appointments", filteredAppointments, this.allAppointments);

        return {
            all: filteredAppointments,
            today: filteredAppointments.filter(app => {
                const appointmentDate = app?.endtime?.toDate();
                return (
                    appointmentDate >= startOfToday &&
                    appointmentDate < startOfTomorrow
                );
            }),
            tomorrow: filteredAppointments.filter(app => {
                const appointmentDate = app?.endtime?.toDate();
                return (
                    appointmentDate >= startOfTomorrow &&
                    appointmentDate <= endOfTomorrow
                );
            }),
            overdue: filteredAppointments.filter(app => {
                const appointmentDate = app?.endtime?.toDate();
                return appointmentDate < startOfToday;
            })
        };
    }

    getPackageName(packageref: string): string | undefined {
        const id = packageref?.split('/').pop();
        return Array.from(this.addonsPackageIds)
            .find((p: any) => p.id === id)?.package;
    }

    updateFilteredCards() {
        const search = this.searchText?.toLowerCase().trim() || '';
        let sources: any = {};
        if (this.selectedProductType === 'eiStarterPack') {
            sources = {
                0: this.productData.eiStarterPack.totalEligible || [],
                1: this.productData.eiStarterPack.pastMonth || [],
                2: this.productData.eiStarterPack.thisMonth || [],
                3: this.productData.eiStarterPack.nextMonth || [],
                4: this.productData.eiStarterPack.onBoarded || [],
                5: this.productData.eiStarterPack.preprocess || [],
                6: this.productData.eiStarterPack.diagnostics || [],
                7: this.productData.eiStarterPack.implementation || [],
                8: this.productData.eiStarterPack.report || [],
                9: this.productData.eiStarterPack.celebrationCall || []
            };
        }
        else if (this.selectedProductType === 'eiCustomSolutions') {
            sources = {
                0: this.productData.eiCustomSolutions.totalEligible || [],
                1: this.productData.eiCustomSolutions.diagnostics || [],
                2: this.productData.eiCustomSolutions.implementation || [],
                3: this.productData.eiCustomSolutions.review || [],
                4: this.productData.eiCustomSolutions.celebrationCall || []
            };
        }
        else if (this.selectedProductType === 'criticalSupport') {
            sources = {
                0: this.productData.criticalSupport.totalEligible || [],
                1: this.productData.criticalSupport.request || [],
                2: this.productData.criticalSupport.preprocess || [],
                3: this.productData.criticalSupport.diagnostics || [],
                4: this.productData.criticalSupport.implementation || [],
                5: this.productData.criticalSupport.review || [],
                6: this.productData.criticalSupport.postForm || [],
                7: this.productData.criticalSupport.completion || []
            };
        }

        Object.keys(sources).forEach((key: any) => {
            const data = sources[key];
            const newData = !search
                ? data
                : data.filter(c =>
                    this.mapMetaData[c.profileid || c.clientid]?.name
                        ?.toLowerCase()
                        .includes(search)
                );

            if (!this.filteredCardsMap[key]) {
                this.filteredCardsMap[key] = [];
            }
            this.updateArrayInPlace(this.filteredCardsMap[key], newData);
        });
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
                }
                return false;
            })
        );

        const productChunks = [];
        for (let i = 0; i < dfuProductIds.length; i += 30) {
            productChunks.push(dfuProductIds.slice(i, i + 30));
        }

        const snapshots: any[] = [];
        this.participantsProductDataSubscription = new Subscription();
        productChunks.forEach((chunk, index) => {
            const q = query(
                collection(this.firestore, 'participantsproduct'),
                where(
                    'productref',
                    'in',
                    chunk.map((id) => doc(this.firestore, 'products', id))
                )
            );
            const sub = collectionData(q, { idField: 'id' })
                .subscribe(async (snapshot: any[]) => {
                    snapshots[index] = snapshot;
                    const productMap = new Map<string, any>();
                    for (const snap of snapshots) {
                        if (!snap) continue;
                        for (const data of snap) {
                            if (
                                activeProfileIds.has(data['profileid']) &&
                                !rejectedStatuses.has(data['status']?.toLowerCase())
                            ) {
                                productMap.set(data.id, data);
                            }
                        }
                    }
                    this.allMatchedProductsRaw = Array.from(productMap.values());
                    await this.applyDateFilter();
                    if (this.selectedProductLabel) {
                        this.selectProduct(this.selectedProductLabel);
                    }
                });
            this.participantsProductDataSubscription.add(sub);
        });
    };

    async onSpecialistExpandToggle() {
        this.specialistCollapsed = !this.specialistCollapsed;
        if (!this.specialistCollapsed && !this.specialistSlotsInitialized) {
            this.initSpecialistDateRange();
            await this.loadSpecialistBaseData();
        }
    }

    initSpecialistDateRange() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);

        this.specialistStartDate = today;
        this.specialistEndDate = nextWeek;

        this.specialistRange.setValue({
            start: today,
            end: nextWeek,
        });
        this.updateSpecialistDisplayMonth();
    }

    // Native <input type="date"> emits a 'yyyy-MM-dd' string; parse to a
    // local Date and delegate to the existing range logic.
    onSpecialistStartInput(event: Event) {
        const value = (event.target as HTMLInputElement)?.value;
        if (!value) return;
        const parsed = new Date(`${value}T00:00:00`);
        if (isNaN(parsed.getTime())) return;
        this.onSpecialistDateChange(parsed);
    }

    // WHEN USER CHANGES START DATE
    async onSpecialistDateChange(selectedDate: Date) {
        this.specialistLoading = true;
        if (!selectedDate) return;

        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 7);

        this.specialistStartDate = start;
        this.specialistEndDate = end;

        this.specialistRange.patchValue({
            start,
            end,
        });

        this.updateSpecialistDisplayMonth();
        await this.fetchSpecialistSlotsAndCompute(this.selectedAppointmentTypeId);
    }

    updateSpecialistDisplayMonth() {
        const start = this.specialistStartDate;
        const end = this.specialistEndDate;

        if (!start || !end) return;

        this.specialistDisplayMonth =
            `${start.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            })} - ${end.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            })}`;
    }

    async loadSpecialistBaseData(retryCount = 0) {
        this.specialistLoading = true;
        this.cdr.detectChanges();
        this.specialistAllSlots = [];
        this.specialistData = [];
        this.filteredBookedAppointments = [];
        this.availableDates = [];

        try {
            const productsSnap = await runInInjectionContext(this.injector, () =>
                getDocs(query(
                    collection(this.firestore, 'products'),
                    where('mode', '==', 'Priority Mode'),
                ))
            );

            const deliveryPromises = productsSnap.docs.map((productDoc) =>
                runInInjectionContext(this.injector, () =>
                    getDocs(query(
                        collection(this.firestore, 'productToDeliverySequence'),
                        where('product', '==', productDoc.ref)
                    ))
                ).then((snapshot) => ({ productDoc, snapshot }))
            );

            const allDeliveryResults = await Promise.all(deliveryPromises);

            const activityFetchList: { productDoc: any; productName: string; activityRef: any }[] = [];

            for (const { productDoc, snapshot } of allDeliveryResults) {
                const productName = productDoc.data()['product'];

                for (const deliveryDoc of snapshot.docs) {
                    const deliveryOptions = deliveryDoc.data()['deliveryoptions'];
                    if (!Array.isArray(deliveryOptions) || deliveryOptions.length === 0) continue;

                    const lastOption = deliveryOptions.at(0);
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
            // Show delivery activities alphabetically (ascending).
            this.specialistSequences.sort((a: any, b: any) =>
                (a.appointmentType || '').localeCompare(b.appointmentType || '')
            );
            this.specialistLoading = false;
        } catch (error) {
            console.error('Error loading specialist base data:', error);
            this.specialistLoading = false;
            this.cdr.detectChanges();
        }
    }

    async fetchSpecialistSlotsAndCompute(appointmentTypeId: string) {
        if (!this.specialistStartDate || !this.specialistEndDate) return;

        const filteredSequences = appointmentTypeId
            ? this.specialistSequences.filter(
                (seq: any) => seq.appointmentTypeId === this.selectedAppointmentTypeId
            )
            : this.specialistSequences;
        const total = filteredSequences.length;

        this.specialistLoading = true;
        this.cdr.detectChanges();
        try {
            const rangeStart = new Date(this.specialistStartDate);
            rangeStart.setHours(0, 0, 0, 0);

            const rangeEnd = new Date(this.specialistEndDate);
            rangeEnd.setHours(23, 59, 59, 999);

            const results: any[] = [];

            for (let i = 0; i < filteredSequences.length; i++) {
                const seq = filteredSequences[i];
                const typeId = seq.appointmentTypeId;
                const roles = this.specialistRolesMap[typeId] || [];
                const eisMap = this.specialistEISMap[typeId] || {};
                const matchedSlots: any[] = [];

                for (const role of roles) {
                    const eisProfiles = eisMap[role] || [];
                    for (const eisProfile of eisProfiles) {
                        const snapshot = await runInInjectionContext(this.injector, () =>
                            getDocs(query(
                                collection(this.firestore, 'availability'),
                                where('profileref', '==', doc(this.firestore, eisProfile)),
                                where(
                                    'appointments',
                                    'array-contains',
                                    doc(this.firestore, 'appointmenttype/' + typeId)
                                ),
                                where('starttime', '>=', rangeStart),
                                where('starttime', '<=', rangeEnd)
                            ))
                        );

                        snapshot.forEach((slotDoc) => {
                            const slotArray = slotDoc.data()[typeId];
                            if (!Array.isArray(slotArray)) return;

                            for (let a = 0; a < slotArray.length; a++) {
                                const slot = slotArray[a];
                                const slotStart =
                                    slot.slotstart?.toDate?.()
                                    || (slot.slotstart ? new Date(slot.slotstart) : null);
                                if (
                                    !slotStart
                                    || slotStart < rangeStart
                                    || slotStart > rangeEnd
                                ) continue;

                                matchedSlots.push({
                                    slotStart: slot.slotstart,
                                    slotEnd: slot.slotend,
                                    booked: slot.booked || false,
                                    available: slot.available || false,
                                    eisprofile: eisProfile,
                                    // Identifiers needed to write the appointment's
                                    // `slotdata` and to flip the slot to booked.
                                    docid: slotDoc.id,
                                    index: a,
                                    appointmentrole: role,
                                });
                            }
                        });
                    }
                }

                results.push({
                    appointmentTypeId: typeId,
                    appointmentTypeName: seq.appointmentType,
                    productName: seq.productName,
                    productId: seq.productId,
                    slots: matchedSlots,
                });

                // progress update
                if ((i + 1) % 5 === 0 || i === total - 1) {
                    this.specialistLoadProgress = `${i + 1} / ${total}`;
                    this.cdr.detectChanges();
                }
            }

            this.specialistAllSlots = results;
            this.specialistLoadProgress = '';
            const totalSlotsFetched = results.reduce((sum, r) => sum + r.slots.length, 0);
            this.computeSpecialistDisplayData();
        } catch (error) {
            console.error('Error fetching specialist slots:', error);
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
            productId: string;
            productNames: Set<string>;
            appointmentTypeName: string;
            appointmentTypeId: string;
            totalSlots: number;
            booked: number;
            available: number;
        }>();

        const productColors = [
            '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444',
            '#6366f1', '#10b981', '#0891b2', '#be123c', '#7c3aed'
        ];

        for (const appointmentSlot of this.specialistAllSlots) {
            const productName = appointmentSlot.productName || 'Unknown';
            const productId = appointmentSlot.productId;
            const appointmentTypeName = appointmentSlot.appointmentTypeName;
            const appointmentTypeId = appointmentSlot.appointmentTypeId;

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
                        productId: '',
                        productNames: new Set(),
                        appointmentTypeName: '',
                        appointmentTypeId: '',
                        totalSlots: 0,
                        booked: 0,
                        available: 0,
                    });
                }
                const specialistEntry = specialistMap.get(eisId)!;
                specialistEntry.productId = productId;
                specialistEntry.appointmentTypeName = appointmentTypeName;
                specialistEntry.appointmentTypeId = appointmentTypeId;
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

        this.slotOverview = {
            totalSlots,
            booked: totalBooked,
            available: totalAvailable,
            bookingRate: totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0,
        };

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

        const productClassList = ['upi', 'wig', 'ftm', 'pto', 'ei', 'cs'];
        this.specialistData = [];
        for (const [eisId, entry] of specialistMap) {
            if (entry.totalSlots === 0) continue;

            const name = this.mapprofile[eisId] || this.mapMetaData[eisId]?.['name'] || eisId;
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
                eisId,
                role: 'Specialist',
                appointmentTypeName: entry.appointmentTypeName,
                appointmentTypeId: entry.appointmentTypeId,
                productId: entry.productId,
                productClass: productClassList[this.specialistData.length % productClassList.length],
                appointmentsGiven: entry.totalSlots,
                booked: entry.booked,
                availableSlots: entry.available,
                utilizationPct,
                utilizationNote: utilizationNote || undefined,
                utilizationNoteColor: utilizationNoteColor || undefined,
            });
        }
        this.specialistData.sort((a, b) => b.appointmentsGiven - a.appointmentsGiven);
    }

    async onActivityChange(appointmentTypeId: string) {
        this.selectedAppointmentTypeId = appointmentTypeId;
        if (!appointmentTypeId) return;

        const rolesSnap = await runInInjectionContext(this.injector, () =>
            getDocs(query(
                collection(this.firestore, 'AppointmentType-To-Roles'),
                where(
                    'assigned_appttype_ref',
                    '==',
                    doc(this.firestore, `appointmenttype/${this.selectedAppointmentTypeId}`)
                ),
                limit(1)
            ))
        );

        const roles: string[] = [];
        rolesSnap.forEach((roleDoc) => {
            const requiredRoles = roleDoc.data()['required_role'] ?? [];
            const additionalRoles = roleDoc.data()['additional_role'] ?? [];
            [...requiredRoles, ...additionalRoles].forEach((role: any) => {
                if (role?.path) roles.push(role.path);
            });
        });
        this.specialistRolesMap[this.selectedAppointmentTypeId] = roles;

        const eisMap: { [role: string]: string[] } = {};
        await Promise.all(
            roles.map(async (rolePath) => {
                const eisSnap = await runInInjectionContext(this.injector, () =>
                    getDocs(query(
                        collection(this.firestore, 'Roles-To-EIS'),
                        where(
                            'assigned_role_ref',
                            '==',
                            doc(this.firestore, rolePath)
                        )
                    ))
                );
                const eisRefs: string[] = [];
                eisSnap.forEach((eisDoc) => {
                    const assignedEis = eisDoc.data()['assigned_eis'] ?? [];
                    assignedEis.forEach((eis: any) => {
                        eisRefs.push(eis.path);
                    });
                });
                eisMap[rolePath] = eisRefs;
            })
        );
        this.specialistEISMap[this.selectedAppointmentTypeId] = eisMap;
        await this.fetchSpecialistSlotsAndCompute(this.selectedAppointmentTypeId);
    }

    async openSpecialistSlots(eisId: string) {
        if (this.expandedSpecialist === eisId) {
            this.expandedSpecialist = null;
            this.filteredBookedAppointments = [];
            return;
        }
        this.selectedEISId = eisId;
        this.filteredBookedAppointments = [];
        this.specialistBookedAll = [];
        this.expandedSpecialist = eisId;

        // Load ALL appointments for the month (cancelled==false + starttime range —
        // an index that already exists). We deliberately DON'T use the 'custom'
        // mode here: adding `appointment ==` needs a separate composite index that
        // isn't provisioned. Filtering by type/host client-side avoids that and
        // also lets us label cross-type "busy" slots.
        await this.filterAppointmentsByType('all', null);
        // Appointment hosts are stored as profile_data/<eisId> refs, so the host
        // path's last segment IS the specialist's eisId (NOT mapMetaData[eisId].profileid).
        const hostIsThisSpecialist = (appointment: any) =>
            appointment?.hosts?.some((host: any) => {
                const hostPath = host?.path || host?.id || host || '';
                return String(hostPath).split('/').pop() === eisId;
            });

        // All of this specialist's active bookings, regardless of appointment type
        // (drives the "who/what occupies this slot" labels in the seat map).
        this.specialistBookedAll = this.allAppointments.filter(
            (appointment: any) => hostIsThisSpecialist(appointment) && !appointment?.attended
        );

        // Bookings for the currently selected appointment type only (booked-list).
        this.filteredBookedAppointments = this.specialistBookedAll.filter(
            (appointment: any) =>
                appointment?.appointment?.id === this.selectedAppointmentTypeId
        );
    }

    // Extract the booked participant id from an appointment's stored reference.
    private getBookedParticipantId(appointment: any): string | null {
        return (
            appointment?.bookedby?.id ||
            appointment?.bookedby?.path?.split('/')?.pop() ||
            (typeof appointment?.bookedby === 'string'
                ? appointment.bookedby.split('/').pop()
                : null) ||
            appointment?.profileid ||
            appointment?.participantproductid ||
            null
        );
    }

    getSpecialistAvailability(eisProfile: string) {
        this.selectedEisProfile = eisProfile;
        this.generateWeekDates();

        // Auto-select the first day that actually has slots (skip empty days).
        const firstWithSlots =
            this.availableDates.find((d: any) => d.hasSlots) || this.availableDates[0];
        if (firstWithSlots) {
            this.onDateSelect(firstWithSlots);
        }
    }

    setSpecialistView(view: string) {
        this.selectedView = view;
        if (
            view === 'available' &&
            this.availableDates.length > 0
        ) {
            this.onDateSelect(this.availableDates[0]);
        }
    }

    // All slots (booked + available) for the selected specialist on a given day.
    private getSlotsForDate(dateStr: string): any[] {
        const appointmentData = this.specialistAllSlots.find(
            (item: any) => item.appointmentTypeId === this.selectedAppointmentTypeId
        );
        if (!appointmentData) return [];
        return (appointmentData.slots || []).filter(
            (slot: any) =>
                slot?.eisprofile?.split('/').pop() === this.selectedEisProfile &&
                slot.slotStart?.toDate?.().toDateString() === dateStr
        );
    }

    onDateSelect(date: any) {
        this.selectedDate = date.fullDate.toDateString();
        // Merged view: keep both booked and available slots, sorted by time.
        this.selectedSpecialistSlots = this.getSlotsForDate(this.selectedDate)
            .sort((a: any, b: any) =>
                (a.slotStart?.toDate?.()?.getTime() || 0) - (b.slotStart?.toDate?.()?.getTime() || 0)
            );
    }

    // Slot counts for the currently selected day (drive the seat-map summary).
    get selectedDayAvailableCount(): number {
        return (this.selectedSpecialistSlots || []).filter((s: any) => s.available && !s.booked).length;
    }
    get selectedDayBookedCount(): number {
        return (this.selectedSpecialistSlots || []).filter((s: any) => s.booked).length;
    }
    get selectedDayUnavailableCount(): number {
        return (this.selectedSpecialistSlots || []).filter((s: any) => !s.available && !s.booked).length;
    }

    // Find the appointment occupying a slot's time for this specialist — works for
    // both "booked" slots (this appointment type) and "unavailable" slots (the
    // specialist is busy with a DIFFERENT appointment type that overlaps).
    getSlotBookingInfo(slot: any): { name: string; type: string } | null {
        const start: Date | null = slot?.slotStart?.toDate?.() ?? null;
        const end: Date | null = slot?.slotEnd?.toDate?.() ?? null;
        if (!start) return null;

        const match = (this.specialistBookedAll || []).find((a: any) => {
            const aStart: Date | null = a?.starttime?.toDate?.() ?? null;
            const aEnd: Date | null = a?.endtime?.toDate?.() ?? null;
            if (!aStart) return false;
            // Prefer a true time-overlap test; fall back to same-minute start.
            if (aEnd && end) return aStart < end && aEnd > start;
            return Math.floor(aStart.getTime() / 60000) === Math.floor(start.getTime() / 60000);
        });
        if (!match) return null;

        return {
            name: this.resolveBookedParticipantName(match),
            type: this.resolveAppointmentType(match) || '',
        };
    }

    // Resolve the participant a booking belongs to. Real appointment docs store
    // the client in `bookedby` (a profile_data ref → has `.id`/`.path`); our
    // optimistic local appointments use `profileid`. Handle both + a name map.
    private resolveBookedParticipantName(appointment: any): string {
        const participantId = this.getBookedParticipantId(appointment);
        if (!participantId) return 'Booked';
        // Resolve the display name straight from loaded metadata.
        return (
            this.mapMetaData[participantId]?.name ||
            this.mapprofile[participantId] ||
            'Booked'
        );
    }

    // Convenience: just the participant name for a booked slot (used in tooltips).
    getBookedProfileName(slot: any): string {
        return this.getSlotBookingInfo(slot)?.name || '';
    }

    // Booked client appointments for the currently selected day.
    get bookedForSelectedDate(): any[] {
        if (!this.selectedDate) return [];
        return (this.filteredBookedAppointments || []).filter(
            (a: any) => a?.starttime?.toDate?.().toDateString() === this.selectedDate
        );
    }

    generateWeekDates() {
        this.availableDates = [];
        const currentDate = new Date(this.specialistStartDate);
        while (currentDate <= this.specialistEndDate) {
            const dateStr = new Date(currentDate).toDateString();
            const slots = this.getSlotsForDate(dateStr);
            const availableCount = slots.filter((s: any) => s.available && !s.booked).length;
            this.availableDates.push({
                fullDate: new Date(currentDate),
                date: currentDate.getDate(),
                day: currentDate
                    .toLocaleDateString('en-US', {
                        weekday: 'short',
                    })
                    .toUpperCase(),
                hasSlots: slots.length > 0,
                slotCount: slots.length,
                availableCount,
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    get visibleCardIds(): string[] {
        return this.memoGet('vci', () => {
            const allProductIds = this.allProductIdsFromRaw;
            const seen = new Set<string>();
            const result: string[] = [];

            for (const groupName of Object.keys(this.mergedGroupIds)) {
                const groupPids = this.mergedGroupIds[groupName];
                const hasData = [...groupPids].some((pid) => allProductIds.has(pid));
                if (hasData) {
                    result.push('group:' + groupName);
                    for (const pid of groupPids) seen.add(pid);
                }
            }

            for (const pid of allProductIds) {
                if (seen.has(pid)) continue;
                if (this.hiddenProductIds.has(pid)) continue;
                result.push(pid);
            }

            return result.sort((a, b) => this.getCardGroupedAll(b).length - this.getCardGroupedAll(a).length);
        });
    }

    get hiddenCardIds(): string[] {
        return this.memoGet('hci', () => {
            const allProductIds = this.allProductIdsFromRaw;
            return [...allProductIds]
                .filter((pid) => this.hiddenProductIds.has(pid))
                .sort((a, b) => this.getCardGroupedAll(b).length - this.getCardGroupedAll(a).length);
        });
    }

    // ===== Option A redesign: top-of-page KPIs derived from existing data =====
    get kpiActivePipeline(): number {
        return this.memoGet('kpiAP', () =>
            this.visibleCardIds.reduce(
                (sum, id) => sum + this.getCardGroupedFiltered(id).length, 0
            )
        );
    }
    get kpiOngoingTotal(): number {
        return this.memoGet('kpiOG', () =>
            this.visibleCardIds.reduce(
                (sum, id) => sum + (this.getCardFunnel(id)?.ongoing?.length || 0), 0
            )
        );
    }
    getCardOngoing(cardId: string): number {
        return this.getCardFunnel(cardId)?.ongoing?.length || 0;
    }
    get kpiReadyToInitiate(): number {
        return this.originalData?.['readyForInitiation']?.count || 0;
    }
    get kpiStuck(): number {
        return this.originalData?.['stuckCases']?.count || 0;
    }
    get kpiAwaitingTotal(): number {
        return this.originalData?.['awaitingInitiation']?.count || 0;
    }
    get kpiInitiatedNotConsuming(): number {
        return this.originalData?.['currentJourneyInitiated']?.count || 0;
    }
    get kpiCompletedTotal(): number {
        return this.getCompletionSummary().totalCompleted;
    }
    get kpiAvgComplete(): number {
        return this.getCompletionSummary().avgStartToDone;
    }
    get hasSpecialistData(): boolean {
        return (this.slotOverview?.totalSlots || 0) > 0;
    }

    // ===== Ported design getters (delivery-dashboard hero focuses on ongoing) =====
    // (kpiOngoingTotal already exists above; ongoingByCard delegates to getCardOngoing)
    ongoingByCard(cardId: string): number {
        return this.getCardOngoing(cardId);
    }
    get ongoingMaxAcrossProducts(): number {
        return Math.max(1, ...this.visibleCardIds.map(id => this.getCardOngoing(id)));
    }
    ongoingPctOfMax(cardId: string): number {
        const v = this.getCardOngoing(cardId);
        return Math.max(4, Math.round((v / this.ongoingMaxAcrossProducts) * 100));
    }
    // Stage column → color modifier class (Stages kanban)
    stageColorClass(stage: string): string {
        if (!stage) return 'col--eligible';
        const s = stage.toLowerCase().trim();
        if (s.includes('eligible')) return 'col--eligible';
        if (s.includes('request')) return 'col--request';
        if (s.includes('pre-process')
            || s.includes('preprocess')
            || s.includes('welcome')) return 'col--preprocess';
        if (s.includes('diagnostic')) return 'col--diagnostic';
        if (s.includes('implement')) return 'col--implement';
        if (s.includes('review')) return 'col--review';
        if (s.includes('complet')
            || s.includes('post-process')
            || s.includes('celebration')
            || s.includes('check-in')) return 'col--completion';
        return 'col--eligible';
    }
    // Dot color class for product rows (cycles through 5-color set by index)
    productDotClass(idx: number): string {
        const palette = ['dot-indigo', 'dot-teal', 'dot-emerald', 'dot-amber', 'dot-violet'];
        return palette[idx % palette.length];
    }
    // Participants tab count (sum across the 3 sub-cohorts)
    get participantsTotalCount(): number {
        return (this.originalData?.['awaitingInitiation']?.count || 0)
            + (this.originalData?.['currentJourneyInitiated']?.count || 0)
            + (this.originalData?.['stuckCases']?.count || 0);
    }

    // ===== Action Center → Participants tab deep-links (Batch A) =====
    // Maps an attention tile to (outer tab index, participants sub-tab index, optional activeFilter).
    // Tab indices: outer 0=Overview, 1=Analytics, 2=Participants
    // Inner sub-tabs: 0=Awaiting Initiation, 1=Initiated–Not Consuming, 2=Stuck Cases
    navToAttention(target: 'stuck' | 'awaiting' | 'ready' | 'idle') {
        this.outerTabIndex = 2;
        switch (target) {
            case 'stuck':
                this.currentTabIndex = 2;
                this.activeFilter = 'none';
                break;
            case 'awaiting':
                this.currentTabIndex = 0;
                this.activeFilter = 'none';
                break;
            case 'ready':
                this.currentTabIndex = 0;
                this.activeFilter = 'readyForInitiation';
                break;
            case 'idle':
                this.currentTabIndex = 1;
                this.activeFilter = 'none';
                break;
        }
        if (this.tabGroup) this.tabGroup.selectedIndex = this.currentTabIndex;
        // Re-trigger paginated data for the newly active sub-tab
        try { this.filterTableData?.(); } catch { /* ignore if not ready */ }
    }

    // Human-readable active sub-tab name for the Export button label
    get participantsActiveTabName(): string {
        switch (this.currentTabIndex) {
            case 0: return 'Awaiting';
            case 1: return 'Idle';
            case 2: return 'Stuck';
            default: return '';
        }
    }

    // Bulk Initiate Ready — confirmation gate (Batch B)
    bulkInitiateReady() {
        const readyCount = this.kpiReadyToInitiate;
        if (readyCount === 0) {
            alert('No participants are currently in the Ready state to initiate.');
            return;
        }
        const ok = confirm(
            `Bulk-initiate ${readyCount} participant${readyCount === 1 ? '' : 's'}?\n\n` +
            `This will trigger the initiation flow for everyone currently in the Ready state. ` +
            `This action cannot be undone in one click.`
        );
        if (!ok) return;
        // Surface intent — actual bulk logic is not yet implemented in the backend.
        alert(`Bulk-initiate triggered for ${readyCount} participant${readyCount === 1 ? '' : 's'}. ` +
            `Backend wiring is pending — this is a UX-confirmed stub.`);
    }

    // First-letter monogram for a product (replaces emoji icons in Completion History).
    // 1 word → first 2 letters; 2 words → 2 initials; 3+ words → 3 initials.
    // Avoids collisions when several products share a common prefix
    // (e.g., "EI Solution" vs "EI Starter Pack" both starting with "EI").
    productMonogram(name: string): string {
        if (!name) return '?';
        const cleaned = name.trim().replace(/^[^a-zA-Z0-9]+/, '');
        const parts = cleaned.split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        if (parts.length === 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
    }

    // Per-product pipeline total for the Action Center mini-funnel rows
    getCardPipelineTotal(cardId: string): number {
        const f = this.getCardFunnel(cardId);
        return (f?.initiated?.length || 0)
            + (f?.awaiting?.length || 0)
            + (f?.started?.length || 0)
            + (f?.ongoing?.length || 0)
            + (f?.completed?.length || 0);
    }

    // Sparkline data: per-product counts for each KPI (cached per filter/visible set)
    private _sparkCacheKey = '';
    private _sparkCache: { ready: number[]; stuck: number[]; completed: number[] } = { ready: [], stuck: [], completed: [] };
    private buildSparkData() {
        const ids = this.visibleCardIds;
        const key = ids.join('|') + ':' + this.selectedTimeFilter;
        if (this._sparkCacheKey === key) return this._sparkCache;
        const ready: number[] = [];
        const stuck: number[] = [];
        const completed: number[] = [];
        const stuckByProfile = new Set((this.originalData?.['stuckCases']?.data || []).map((d: any) => d?.profileid));
        const readyByProfile = new Set((this.originalData?.['readyForInitiation']?.data || []).map((d: any) => d?.profileid));
        for (const id of ids) {
            const pids = this.getCardProductIds(id);
            const items = pids.flatMap(p => this.groupedFiltered?.[p] || []);
            const profileSet = new Set(items.map((i: any) => i?.profileid));
            let r = 0, s = 0;
            profileSet.forEach((pid) => {
                if (readyByProfile.has(pid)) r++;
                if (stuckByProfile.has(pid)) s++;
            });
            ready.push(r);
            stuck.push(s);
            completed.push(this.getCardFunnel(id)?.completed?.length || 0);
        }
        this._sparkCache = { ready, stuck, completed };
        this._sparkCacheKey = key;
        return this._sparkCache;
    }
    get sparkReady(): number[] { return this.buildSparkData().ready; }
    get sparkStuck(): number[] { return this.buildSparkData().stuck; }
    get sparkCompleted(): number[] { return this.buildSparkData().completed; }
    sparkMax(arr: number[]): number { return Math.max(1, ...arr); }

    // Avg-time gauge benchmark
    avgTimeTarget = 30;
    get avgTimePct(): number {
        const v = this.kpiAvgComplete || 0;
        return Math.min(150, Math.round((v / this.avgTimeTarget) * 100));
    }

    // Live "last updated" stamp — stored string so Angular's double-check pass sees the same value.
    // Updated every 5 s outside the Angular zone to avoid NG0100.
    lastUpdated = new Date();
    lastUpdatedRelative = 'just now';
    private _lastUpdatedTimer: ReturnType<typeof setInterval> | null = null;

    private computeLastUpdatedRelative(): string {
        const diff = Math.floor((Date.now() - this.lastUpdated.getTime()) / 1000);
        if (diff < 5) return 'just now';
        if (diff < 60) return diff + 's ago';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        return Math.floor(diff / 3600) + 'h ago';
    }

    private startLastUpdatedTimer() {
        if (this._lastUpdatedTimer) return;
        this.ngZone.runOutsideAngular(() => {
            this._lastUpdatedTimer = setInterval(() => {
                const next = this.computeLastUpdatedRelative();
                if (next !== this.lastUpdatedRelative) {
                    this.ngZone.run(() => {
                        this.lastUpdatedRelative = next;
                        this.cdr.markForCheck();
                    });
                }
            }, 5000);
        });
    }

    get allProductIdsFromRaw(): Set<string> {
        return this.memoGet('apidsR', () => {
            const ids = new Set<string>();
            for (const item of this.allMatchedProductsRaw) {
                if (!this.itemPassesProductFilter(item)) continue;
                const pid = item['productref']?.id;
                if (pid) ids.add(pid);
            }
            return ids;
        });
    }

    getCardProductIds(cardId: string): string[] {
        if (cardId.startsWith('group:')) {
            const groupName = cardId.replace('group:', '');
            const mergedIds = [...(this.mergedGroupIds[groupName] || [])];
            return mergedIds;
        }
        return [cardId];
    }

    getCardName(cardId: string): string {
        if (cardId.startsWith('group:')) {
            return cardId.replace('group:', '');
        }
        return this.shortenProductName(this.mapProductName[cardId] || '') || 'Unknown';
    }

    getCardSubNames(cardId: string): string[] {
        if (cardId.startsWith('group:')) {
            const groupName = cardId.replace('group:', '');
            return (this.mergedGroups[groupName] || []);
        }
        return [];
    }

    getCardGroupedAll(cardId: string): any[] {
        return this.getCardProductIds(cardId).flatMap((pid) => this.groupedAll[pid] || []);
    }

    getCardGroupedFiltered(cardId: string): any[] {
        return this.getCardProductIds(cardId).flatMap((pid) => this.groupedFiltered[pid] || []);
    };

    getCardGroupedAddons(cardId: string): any[] {
        return this.getCardProductIds(cardId).flatMap((pid) => this.groupedAddons[pid] || []);
    };

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

    getCardGroupedNotEligible(cardId: string): any[] {
        return this.getCardProductIds(cardId).flatMap((pid) => this.groupedNotEligible[pid] || []);
    };

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

    openCardModal(cardId: string, type: 'all' | 'filtered' | 'thismonth' | 'nextmonth' | 'bonus' | 'purchased' | 'noteligible') {
        this.selectedProductId = cardId;
        this.modalType = type;
        this.selectedStatus = 'all';

        let source;
        switch (type) {
            case 'all': source = this.getCardGroupedAll(cardId); break;
            case 'filtered': source = this.getCardGroupedFiltered(cardId); break;
            case 'thismonth': source = this.getCardGroupedThisMonth(cardId); break;
            case 'nextmonth': source = this.getCardGroupedNextMonth(cardId); break;
            case 'bonus': source = this.getCardGroupedBonus(cardId); break;
            case 'purchased': source = this.getCardGroupedPurchased(cardId); break;
            case 'noteligible': source = this.getCardGroupedNotEligible(cardId); break;
        }

        const grouped = {};
        for (const doc of source || []) {
            const pid = doc['profileid'];
            (grouped[pid] ||= []).push(doc);
        }
        this.allFunnelModalProfiles = grouped;
        this.groupedByProfileAll = { ...grouped };
        console.log("groupedProfileAll", this.groupedByProfileAll);
        return this.groupedByProfileAll;
    }

    filterCardProfiles() {
        if (this.selectedStatus === 'all') {
            this.groupedByProfileAll = { ...this.allFunnelModalProfiles };
            return;
        }

        const filtered: any = {};

        Object.keys(this.allFunnelModalProfiles).forEach(profileId => {
            const matchedProfiles = this.allFunnelModalProfiles[profileId].filter(
                (item: any) => (item.status || '') === this.selectedStatus
            );

            if (matchedProfiles.length > 0) {
                filtered[profileId] = matchedProfiles;
            }
        });

        this.groupedByProfileAll = filtered;
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
        const nameToId: { [name: string]: string } = {};
        for (const pid of Object.keys(this.mapProductName)) {
            nameToId[this.mapProductName[pid]] = pid;
        }

        this.hiddenProductIds = new Set();
        for (const name of this.hiddenProductNames) {
            const id = nameToId[name];
            if (id) this.hiddenProductIds.add(id);
        }

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
        this.selectedStatus = 'all';

        const source = this.funnelData[productId]?.[type] || [];
        const grouped: any = {};

        for (const doc of source) {
            const pid = doc.profileid;
            (grouped[pid] ||= []).push(doc);
        }

        this.allFunnelModalProfiles = grouped;
        this.funnelModalProfiles = { ...grouped };
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

    get funnelProfileIds(): string[] {
        return Object.keys(this.funnelModalProfiles);
    }

    openModal(productId: string, type: 'all' | 'filtered' | 'bonus' | 'purchased' | 'noteligible') {
        this.selectedProductId = productId;
        this.modalType = type;

        let source;
        switch (type) {
            case 'all': source = this.groupedAll[productId]; break;
            case 'filtered': source = this.groupedFiltered[productId]; break;
            case 'bonus': source = this.groupedBonus[productId]; break;
            case 'purchased': source = this.groupedPurchased[productId]; break;
            case 'noteligible': source = this.groupedNotEligible[productId]; break;
        }

        const grouped = {};
        for (const doc of source || []) {
            const pid = doc['profileid'];
            (grouped[pid] ||= []).push(doc);
        }

        this.groupedByProfileAll = grouped;
    }

    openStageModal(selectedStage: string, stageFilter: string, participantData: any) {
        this.openAppointmentModal = true;
        this.selectedStage = selectedStage;
        this.selectedFilter = 'all';
        this.selectedStageFilter = stageFilter;
        this.groupedByStageProfileAll = participantData;
    }

    onFilterChange(selectedFilter: string) {
        this.selectedFilter = selectedFilter;
        const stageKey = this.selectedStage?.toLowerCase();
        const stage = this.stageData?.[stageKey];

        if (!stage) {
            this.groupedByStageProfileAll = [];
            return;
        }
        // Scheduled
        if (this.selectedStageFilter === 'Scheduled') {
            const data = stage[selectedFilter] || stage.all || [];

            this.groupedByStageProfileAll = this.selectedProductId
                ? data.filter(
                    (item: any) => item.productId === this.selectedProductId
                )
                : data;
        }
    }

    async initiateProduct(pid: string) {
        this.initiateProductOptions[pid] = true;

        if (this.initiateProductOptions) {
            this.participantData = this.currentGroupedByProfile[pid];
            const product = this.participantData[0];
            const productId = product?.productref?.id;
            await this.getDeliveryTypes(productId);

            // Patch the form like the participant-purchase screen does:
            // pre-fill Minimum Payment from the product's existing value or,
            // failing that, the product's configured minimum required amount.
            this.tentativeStartDate = product?.tentativestart?.toDate
                ? product.tentativestart.toDate()
                : (product?.tentativestart ?? null);
            this.selectedDeliveryType = product?.deliverytype ?? '';
            this.minimumPayment =
                product?.minimumpayment ??
                (await this.getProductMinimumRequiredAmount(productId)) ??
                null;
            this.cdr.detectChanges();
        }
    }

    // Reads a product's configured minimum required amount (the same source
    // the participant-purchase screen uses to seed Minimum Payment).
    private async getProductMinimumRequiredAmount(productId: string): Promise<number | null> {
        if (!productId) return null;
        try {
            const snap = await runInInjectionContext(this.injector, () =>
                getDoc(doc(this.firestore, 'products', productId))
            );
            const amt = (snap.data() as any)?.minimumrequiredamount;
            return amt != null ? amt : null;
        } catch (err) {
            console.error('getProductMinimumRequiredAmount failed:', err);
            return null;
        }
    }

    async getDeliveryTypes(productId: string) {
        try {
            const snapshot = await runInInjectionContext(this.injector, () =>
                getDocs(collection(this.firestore, 'productToDeliverySequence'))
            );
            const deliveryType: string[] = [];
            snapshot.forEach((doc) => {
                const data: any = doc.data();
                // Match product, then collect its delivery options.
                if (data.product?.id === productId) {
                    const types = (data.deliveryoptions || []).map(
                        (item: any) => item.deliverytype
                    );
                    deliveryType.push(...types);
                }
            });
            // Assign ONCE after the loop (the old code reset it to [] every pass).
            this.deliveryTypes = deliveryType;
        } catch (error) {
            console.log(error);
        }
    }

    async updateParticipantProductStatus(docid: string, profileid: string) {
        console.log("docid", docid, "profileid", profileid);

        // Guard: Minimum Payment and Delivery Option are mandatory (matches the
        // participant-purchase initiate flow).
        const missing: string[] = [];
        if (this.minimumPayment == null || (this.minimumPayment as any) === '') {
            missing.push('Minimum Payment');
        }
        if (!this.selectedDeliveryType) {
            missing.push('Delivery Option');
        }
        if (missing.length) {
            alert(`Please fill the required field(s): ${missing.join(', ')}.`);
            return;
        }

        const participantsProductRef = collection(this.firestore, 'participantsproduct');
        const q = query(
            participantsProductRef,
            where('docid', '==', docid),
            where('profileid', '==', profileid)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const updatePromises = querySnapshot.docs.map((docSnap) =>
                updateDoc(docSnap.ref, {
                    status: 'initiated',
                    minimumpayment: this.minimumPayment,
                    tentativestart: this.tentativeStartDate,
                    deliverytype: this.selectedDeliveryType,
                    statusdate: {
                        initiated: serverTimestamp()
                    }
                })
            );
            await Promise.all(updatePromises);

            // Mirror the participant-purchase flow: after marking the product
            // initiated, (re)build the participant's delivery sequence doc. We
            // fetch ALL of the profile's products (not just this one) so the
            // existing sequence isn't truncated/corrupted.
            try {
                await this.syncDeliverySequence(profileid);
            } catch (err) {
                console.error('updateDeliverySequence failed:', err);
            }

            this.initiateProductOptions[profileid] = false;

            // Optimistically reflect the new status in the open dialog so the
            // item flips to "Initiated" immediately (no refresh needed). The
            // doc objects are shared across participantData / groupedByProfileAll
            // / allFunnelModalProfiles, so mutating them updates every view.
            this.applyInitiatedStatusLocally(docid, profileid);

            alert('Product has been initiated. The participant can now proceed with their journey.');
        } else {
            console.log('No matching document found');
        }
    }

    // Mutates the in-memory dialog data so a just-initiated product shows the
    // new status without waiting for a page refresh/re-fetch.
    private applyInitiatedStatusLocally(docid: string, profileid: string) {
        const stamp = (item: any) => {
            if (!item) return;
            item.status = 'initiated';
            item.minimumpayment = this.minimumPayment;
            item.tentativestart = this.tentativeStartDate;
            item.deliverytype = this.selectedDeliveryType;
        };

        const matches = (item: any) =>
            item && (item.docid === docid || item.participantproductid === docid);

        // Update every collection that may hold this product's row.
        const buckets = [
            this.groupedByProfileAll?.[profileid],
            this.allFunnelModalProfiles?.[profileid],
            this.participantData,
        ];
        buckets.forEach((arr: any) => {
            if (Array.isArray(arr)) arr.filter(matches).forEach(stamp);
        });

        // Re-apply the active status filter so a now-"initiated" row drops out
        // of a "Not Initiated" view (or appears under "Initiated").
        this.filterCardProfiles();
        this.cdr.detectChanges();
    }

    // Build the full ordered product list for a profile and hand it to the
    // shared guard, which upserts participantdeliverysequence/<profileid>
    // (preserving any existing per-product `delivery` arrays).
    private async syncDeliverySequence(profileid: string) {
        const snap = await runInInjectionContext(this.injector, () =>
            getDocs(query(
                collection(this.firestore, 'participantsproduct'),
                where('profileid', '==', profileid)
            ))
        );
        const products = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => (a.sequenceorder ?? 0) - (b.sequenceorder ?? 0))
            .map((p) => ({
                docid: p.docid ?? p.id,
                participantproductid: p.docid ?? p.id,
                // The guard expects productref as a product-id string.
                productref: p.productref?.id ?? p.productref,
            }))
            .filter((p) => !!p.productref);

        if (!products.length) return;
        await this.guard.updateDeliverySequence(profileid, products);
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

        const items = this.allMatchedProductsRaw.filter((i) => i['productref']?.id === productId);
        const details = [];

        for (const item of items) {
            const profileId = item['profileid'];
            const mode = this.mapMetaData[profileId]?.['participantmode']?.toLowerCase();
            const totalPaid = parseInt(this.mapMetaData[profileId]?.['pp_totalpaid']);
            const minPayment = parseInt(item['minimumpayment']);
            if (this.excludedModes.has(mode?.toLowerCase().trim()) || totalPaid <= minPayment) continue;

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

    // Function to fetch data from participant metadata and profile_data
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
    }


    applyProductFilter() {
        const productKeywordsMap: any = {
            "WISH": ["WiSH"],
            "A&H LIGHT": ["A&H Light"],
            "EI Solution": ["EI Solution", "EI Celebration", "EI Implementation", "EI Diagnostics", "EI Review"],
            "EI Starter Pack": ["EI Starter Pack"],
            "Critical Support": ["Critical Support Implementation and Diagnostics"]
        };

        let filteredLatestAppointments = this.allFetchedAppointments;
        if (this.selectedProduct !== "All Products Overview") {
            const selectedKeywords = productKeywordsMap[this.selectedProduct] || [];
            filteredLatestAppointments = this.allFetchedAppointments.filter(appointment => {
                const appointmentTypeName = appointment["appointmentTypeName"] || "";
                return selectedKeywords.some(keyword => appointmentTypeName.includes(keyword));
            });
        }

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

    showAllAppointmentDetails(c: any) {
        const status = c?.status;
        const productName = this.mapProductName?.[c?.productref?.id];

        const isCompletedorSubmitted =
            status === 'completed' || status === 'submitted';
        const isOngoingWithValidAppointment =
            status === 'ongoing' &&
            (
                c?.appointmentTypeName === `${productName} Welcome Call` ||
                c?.appointmentTypeName === `${productName} Diagnostics` ||
                c?.appointmentTypeName === `${productName} Implementation`
            );

        return isCompletedorSubmitted || isOngoingWithValidAppointment;
    }

    showActiveStage(c: any) {
        const { status, appointmentTypeName, tentativestart } = c;

        if (status?.status == 'Open') return 'Ticket Raised: ';
        if ((status === null || status === 'initiated') && tentativestart) return 'Tentative Start: '
        else if (status === 'completed') return 'Completed: ';
        else if (status === 'submitted') return 'Form Submitted: ';
        else if (appointmentTypeName === 'Critical Support Diagnostics') return 'Diagnostics: ';
        else if (appointmentTypeName === 'Critical Support Implementation') return 'Implementation: ';
        else if (appointmentTypeName === 'Critical Support Review') return 'Review: ';
        else return '';
    }

    showParticipantActiveDate(c: any): string {
        const { status, date, statusdate, appointmentTypeName, appointmentend, appointmentstart, tentativestart, starttime, attended, endtime } = c;
        const validAppointments = [
            `Critical Support Diagnostics`,
            `Critical Support Implementation`,
            `Critical Support Review`
        ];

        if (status?.status === 'Open') return this.formatDate(status.date);
        if (status === null || status === 'initiated') return this.formatDate(tentativestart);
        else if (status === 'submitted') return this.formatDateTime(date);
        else if (statusdate?.completed) return this.formatDateTime(statusdate?.completed);
        else if (status === 'ongoing' &&
            !attended && appointmentstart &&
            starttime &&
            validAppointments.includes(appointmentTypeName)) {
            return this.formatDateTime(starttime);
        }
        else if (status === 'ongoing' &&
            attended && appointmentend &&
            endtime &&
            validAppointments.includes(appointmentTypeName)) {
            return this.formatDateTime(endtime);
        }
        else return '';
    }

    getDaysDifference(targetDate: any): string {
        const date = targetDate?.toDate
            ? targetDate.toDate()
            : new Date(targetDate);

        const today = new Date();
        const diffTime = today.getTime() - date.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }

    showDelayDate(c: any): string {
        const { status, tentativestart, attended, appointmentend, date } = c;

        if (status?.status === 'Open' && status.date) {
            return this.getDaysDifference(status.date);
        }

        if ((status === null || status === 'initiated') && tentativestart) {
            return this.getDaysDifference(tentativestart);
        } else if (
            status === 'ongoing' &&
            attended &&
            appointmentend
        ) {
            return this.getDaysDifference(appointmentend);
        } else if (status === 'submitted') {
            return this.getDaysDifference(date);
        }

        return '';
    }

    getAppointmentDate(stage: string, c: any, appointment: any) {
        const { attended, starttime, endtime } = appointment;

        if (stage === 'Post Session Check-in') return this.formatDateTime(c?.date);
        else if (attended && endtime) return this.formatDateTime(endtime);
        else return this.formatDateTime(starttime);
    }

    getAppointmentStatus(stage: string, appointment: any) {
        const { attended } = appointment;

        if (stage === 'Pre-Process' || stage === 'Post-Process Form' || stage === 'Post Session Check-in') return 'Submitted';
        else if (attended) return 'Completed';
        else if (!attended) return 'Scheduled';
        else return 'Cancelled';
    }

    searchParticipant(event: any) {
        this.searchText = event.target.value;
        this.updateFilteredCards();
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

        const productsRef = query(
            collection(this.firestore, "participantsproduct"),
            where("statusdate.initiated", "<=", enddate)
        );

        this.productsSubscription = collectionData(productsRef, { idField: 'id' })
            .subscribe((products: any[]) => {
                this.products = products;
            });

        let tempArray1: any[] = [];
        let tempArray2: any[] = [];

        if (this.products.length !== 0) {
            this.products.forEach((productdata) => {
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
            });

            this.originalData['initiatedToday'].data = tempArray1;
            this.originalData['initiatedToday'].count = tempArray1.length;

            this.originalData['currentJourneyInitiated'].data = tempArray2;
            this.originalData['currentJourneyInitiated'].count = tempArray2.length;
        } else {
            this.originalData['initiatedToday'].data = [];
            this.originalData['initiatedToday'].count = 0;

            this.originalData['currentJourneyInitiated'].data = [];
            this.originalData['currentJourneyInitiated'].count = 0;
        }

        this.loadingStates.modes = true;
        this.checkAllDataLoaded();
    }

    loadJourneyProductData() {
        try {
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

    initializeMonthFilter() {
        this.selectedMonth = new Date();
        this.updateDisplayMonth();
    }

    updateDisplayMonth() {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        this.displayMonth = `${monthNames[this.selectedMonth.getMonth()]} ${this.selectedMonth.getFullYear()}`;
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

        this.monthyear = `${this.selectedMonth.getFullYear()}-${String(this.selectedMonth.getMonth() + 1).padStart(2, '0')}`;

        this.fetchData();
    }

    fetchData() {
        this.ngOnDestroy();
        this.isLoading = false
        this.loadingStates = {
            journeyData: true,
            metadata: false,
            journeyProduct: false,
            appointments: false,
            modes: false
        }
        this.loadParticipantMetadata();
    }

    getLoadingProgress(): number {
        const loaded = Object.values(this.loadingStates).filter(state => state === true).length;
        const total = Object.keys(this.loadingStates).length;
        return (loaded / total) * 100;
    }

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
    }

    getPriorityLabel(waitingPeriod: number): string {
        if (waitingPeriod >= 14) return 'URGENT';
        if (waitingPeriod >= 10) return 'HIGH';
        if (waitingPeriod >= 5) return 'MEDIUM';
        return 'LOW';
    }

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

                if (searchTerm) {
                    const name = this.mapMetaData[participant['profileid']]?.['name'] || '';
                    matchesSearch = name.toLowerCase().includes(searchTerm);
                }

                if (selectedJourneys.length > 0) {
                    const journeyId = this.mapMetaData[participant['profileid']]?.['activejourney'];
                    const journeyname = this.mapjourneyname[journeyId] || participant['journey'] || participant['activejourney'] || '';
                    matchesJourney = selectedJourneys.includes(journeyname);
                }

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
                this.guard.openSnackBar("Note Added Temporarily", "OK");
            }
        })
    }

    hidePopupWithDelay() {
        this.hideTimeout = setTimeout(() => {
            this.popupData = null;
        }, 200);
    }

    clearHideTimeout() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }
    }

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

        const tabNames = ['Awaiting_Initiation', 'Initiated_Pending', 'Stuck_Cases'];
        const sheetName = tabNames[this.currentTabIndex || 0];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const filterSuffix = this.isFilterActive() ? `_${this.activeFilter}` : '';
        const fileName = `${sheetName}${filterSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;

        XLSX.writeFile(wb, fileName);
    }

    private formatCellValueForExport(participant: any, header: TableHeader): any {
        const value = participant[header.key];

        if (header.key === 'priority') {
            return this.getPriorityLabel(this.getWaitingPeriod(participant));
        }

        if (header.type === 'mapped' && header.mapValue) {
            return this.mapMetaData[value]?.[header.mapValue] || 'N/A';
        }

        if (header.type === 'date' && value) {
            const date = value.toDate ? value.toDate() : value;
            const datePipe = new DatePipe('en-US');
            return datePipe.transform(date, header.format || 'MMM dd, yyyy') || 'N/A';
        }

        if (header.key === 'waitingperiod') {
            return `${value || 0} DAYS`;
        }

        if (header.key === 'generalnotes') {
            if (participant[header.key] && participant[header.key].length > 0) {
                return participant[header.key][participant[header.key].length - 1].note || 'N/A';
            }
            return 'N/A';
        }

        if (header.key === 'financialdata') {
            return value === 'Cleared' ? 'ELIGIBLE' : 'NOT CLEARED';
        }

        if (header.key === 'bottleneck') {
            return participant['financialdata'] === 'Cleared' ? 'Ready for Initiation' : 'Payment Follow-up';
        }

        if (header.type === 'text') {
            return value || 'N/A';
        }

        return value || 'N/A';
    }

    getCurrentTabDataLength(): number {
        if (this.filterForm.value.search || this.filterForm.value.journey?.length > 0 || this.filterForm.value.product?.length > 0) {
            return this.filteredData.length;
        }
        return this.getCurrentTabData().length;
    }

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
        this.filterAppointmentsByType('all', null);
    }

    onJourneyMonthSelected(event: Date, picker: any) {
        this.selectedMonth = new Date(event.getFullYear(), event.getMonth(), 1);
        this.journeyMonthPicker.setValue(this.selectedMonth);
        this.updateDisplayMonth();
        picker.close();
        this.filterAppointmentsByType('all', null);
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
        // Monogram fallback: per-card monogram is computed from the product name (see productMonogram)
        // Keep this stub for shape compatibility with downstream `product.icon` consumers.
        const icons = ['', '', '', '', '', '', '', '', '', ''];
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
                if (packageId && this.bonusPackageLookup[packageId]) {
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

        let colorIdx = 0;
        const visibleProducts: CompletionProduct[] = [];
        for (const cardId of this.visibleCardIds) {
            visibleProducts.push(buildProduct(cardId, colorIdx++));
        }
        visibleProducts.sort((a, b) => b.completed - a.completed);

        const hiddenProducts: CompletionProduct[] = [];
        for (const cardId of this.hiddenCardIds) {
            hiddenProducts.push(buildProduct(cardId, colorIdx++));
        }
        hiddenProducts.sort((a, b) => b.completed - a.completed);

        return [...visibleProducts, ...hiddenProducts];
    }

    isParticipantEligible(pid, item) {
        const totalPaid = parseInt(this.mapMetaData?.[pid]?.['pp_totalpaid'] ?? '0') || 0;
        const totalPurchaseValue = parseInt(this.mapMetaData?.[pid]?.['pp_totalpurchasevalue'] ?? '0') || 0;

        const totalBalance = totalPurchaseValue - totalPaid;
        const minPayment = parseInt(item?.['minimumpayment']) || 0;

        const mode = (this.mapMetaData[pid]?.['participantmode'] || '').trim().toLowerCase();

        return !this.excludedModes.has(mode?.toLowerCase().trim()) && (totalBalance <= 0 || totalPaid >= minPayment);
    }

    exportProfileModal(): void {
        const rows: any[] = [];
        let index = 1;

        for (const pid of this.profileIds) {
            const items = this.currentGroupedByProfile[pid] || [];
            for (const item of items) {

                const isEligible = this.isParticipantEligible(pid, item);

                const row: any = {
                    '#': index,
                    'DocID': item.id || item['docid'] || '',
                    'ProfileID': pid,
                    'Participant': this.mapMetaData[pid]?.['name'] || pid,
                    'Product': this.mapProductName[item['productref']?.id] || 'Unknown',
                    'Status': item['status'] || 'N/A'
                };

                if (!isEligible) {
                    row['Mode'] = this.mapMetaData[pid]?.['participantmode'] || '';
                    if ((((item?.['minimumpayment'] || 0) - (this.mapMetaData[pid]?.['pp_totalpaid'] || 0))) >= 0) {
                        row['Minimum Payment'] = this.formatPrice(item?.['minimumpayment'] || '');
                        row['Total Payable'] = this.formatPrice(this.mapMetaData[pid]?.['pp_totalpaid'] || '');
                        row['Remaining Payment'] = this.formatPrice(((item?.['minimumpayment'] || 0) - (this.mapMetaData[pid]?.['pp_totalpaid'] || 0)));
                    }
                }

                rows.push(row);
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
        // Monogram fallback: per-card monogram is computed from the product name (see productMonogram)
        // Keep this stub for shape compatibility with downstream `product.icon` consumers.
        const icons = ['', '', '', '', '', '', '', '', '', ''];
        const iconBgs = ['#eff6ff', '#f5f3ff', '#ecfdf5', '#fffbeb', '#f0fdfa', '#eef2ff', '#fef2f2', '#e0f2fe', '#fce7f3', '#ede9fe'];

        const funnel = this.getCardFunnel(cardId);
        const completedItems = funnel.completed;
        const completedCount = completedItems.length;
        const eligible = this.getCardGroupedFiltered(cardId).length;

        let bonusCompletions = 0;
        let purchasedCompletions = 0;
        for (const item of completedItems) {
            const packageId = item['packageref']?.id;
            if (packageId && this.bonusPackageLookup[packageId]) {
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

    getTodayAndTomorrowRange() {
        const now = new Date();

        // Start of today
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        // End of today
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        // Start of tomorrow
        const startOfTomorrow = new Date(now);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
        startOfTomorrow.setHours(0, 0, 0, 0);

        // End of tomorrow
        const endOfTomorrow = new Date(now);
        endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
        endOfTomorrow.setHours(23, 59, 59, 999);

        return {
            startOfToday,
            startOfTomorrow,
            endOfTomorrow
        };
    };

    // Sort Participant Data in Stage
    sortColumn(columnIndex: number): void {
        const currentDirection = this.sortDirection[columnIndex];
        const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';

        this.sortDirection[columnIndex] = newDirection;

        const cards = [...(this.filteredCardsMap[columnIndex] || [])];

        cards.sort((a: any, b: any) => {
            const dateA = this.getSortDate(a, columnIndex);
            const dateB = this.getSortDate(b, columnIndex);

            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;

            return newDirection === 'asc'
                ? dateA.getTime() - dateB.getTime()
                : dateB.getTime() - dateA.getTime();
        });

        this.filteredCardsMap[columnIndex] = cards;
    }

    private getSortDate(card: any, columnIndex: number): Date | null {
        switch (columnIndex) {
            case 0: // Total Eligible
                return card?.tentativestart ? new Date(card.tentativestart.seconds * 1000) : null;
            case 1: // Request
                return card?.status?.date ? new Date(card.status.date.seconds * 1000) : null;
            case 2: // Completion
                return card?.date ? new Date(card.date.seconds * 1000) : null;
            case 3: // Diagnostics
            case 4: // Implementation
            case 6: // Review
                return card?.endtime ? new Date(card.endtime.seconds * 1000) : null;
            default:
                const displayDate = this.showParticipantActiveDate(card);
                return displayDate ? new Date(displayDate) : null;
        }
    }

    updateArrayInPlace(target: any[], source: any[]) {
        target.length = 0;
        target.push(...source);
    }

    trackByCard(item: any): string {
        return item.docid || item.profileid;
    }

    toggleTableView() {
        this.showTable = !this.showTable;
    }

    formatDateTime(timestamp: any): string {
        const date = timestamp?.toDate?.();
        return date
            ? new Intl.DateTimeFormat('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).format(date)
            : '';
    }

    formatDate(timestamp: any): string {
        const date = timestamp?.toDate?.();
        return date
            ? new Intl.DateTimeFormat('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            }).format(date)
            : '';
    }

    toggleExpand(c: any, index: number) {
        c._expanded = !c._expanded;

        if (c._expanded) {
            setTimeout(() => {
                const el = document.getElementById('section-' + index);
                el?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'end'
                });
            }, 0);
        }
    }

    formatPrice(price: any): string {
        return new Intl.NumberFormat('en-IN').format(price);
    }

    clearStats() {
        this.participantLoading = false;
        this.selectedProductLabel = "";
        this.filteredCardsMap = {};
        this.productData = {};
        this.selectedProductType = '';
        // this.ticketRequest = [];
        this.stageData = {}
    }

    resetStats() {
        this.productData = {
            totalEligible: [],
            pastMonth: [],
            thisMonth: [],
            nextMonth: [],
            onBoarded: [],
            upcomingDIAppointments: [],
            reports: [],
            celebrationCall: []
        };
    }

    closeStageModal() {
        this.openAppointmentModal = false;
        this.groupedByStageProfileAll = {};
        this.selectedFilter = 'all';
        this.selectedStageFilter = '';
    }

    async goToBooking(selectedSlot: any) {
        this.selectedUser = null;
        this.filteredProfile = "";
        this.selectedSlotData = selectedSlot;

        // Open the picker IMMEDIATELY (with its loading state) so the click feels
        // responsive — profile map + eligible profiles then stream in.
        this.slotSelected = true;
        this.eligibleProfilesLoading = true;
        this.cdr.detectChanges();

        // Load which profiles are eligible to book this activity (Option A).
        this.loadEligibleProfiles(this.selectedAppointmentTypeId);

        this.guard.getProfileMap().then(data => {
            this.profileList = data.list;
            this.mapProfile = data.map;
            this.cdr.detectChanges();
        });

        const roles = await this.guard.getRoles();
        this.loggedInPID = roles.profile_ref.id;
    }

    // Human-readable label for the slot currently being booked (shown in the
    // picker header so the user knows exactly which slot they're filling).
    get selectedSlotLabel(): string {
        const slot = this.selectedSlotData;
        if (!slot) return '';
        const start = slot?.slotStart?.toDate?.();
        const end = slot?.slotEnd?.toDate?.();
        if (!start) return '';
        const fmt = (d: Date) =>
            d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const eisId = (slot?.eisprofile || '').split('/').pop();
        const who = this.mapprofile[eisId] || this.mapMetaData[eisId]?.['name'] || '';
        const day = start.toLocaleDateString([], { day: '2-digit', month: 'short' });
        const time = end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
        return who ? `${day} · ${time} · ${who}` : `${day} · ${time}`;
    }

    // Fetch the set of profiles that have a ready appointment deliverable for
    // the given activity, so the picker only offers bookable profiles.
    async loadEligibleProfiles(appointmentTypeId: string) {
        this.eligibleProfileIds = new Set<string>();
        if (!appointmentTypeId) return;
        this.eligibleProfilesLoading = true;
        this.cdr.detectChanges();
        try {
            const snap = await runInInjectionContext(this.injector, () =>
                getDocs(query(
                    collection(this.firestore, 'deliverables'),
                    where('deliveryref', '==', doc(this.firestore, 'appointmenttype/' + appointmentTypeId)),
                    where('type', '==', 'appointment'),
                    where('status', '==', 'ready'),
                ))
            );
            snap.forEach((d) => {
                const pid = d.data()['profileid'];
                if (pid) this.eligibleProfileIds.add(pid);
            });
        } catch (e) {
            console.error('Error loading eligible profiles:', e);
        } finally {
            this.eligibleProfilesLoading = false;
            this.cdr.detectChanges();
        }
    }

    returnClient() {
        const search = (this.filteredProfile || '').toLowerCase();
        return this.profileList.filter(
            (e: any) =>
                this.eligibleProfileIds.has(e.id) &&
                (e.name || '').toLowerCase().includes(search)
        );
    }

    // Pick a profile from the custom searchable list and start the booking.
    selectProfileForBooking(user: any) {
        this.selectedUser = user.id;
        this.onProfileSelect(user.id);
    }

    async directBookAppointment(appointmentTypeId: string, profileId: string) {
        const injector = this.injector;
        try {
            const selectedSlotData = this.selectedSlotData;
            await runInInjectionContext(injector, async () => {

                const deliverableCollection = collection(this.firestore, "deliverables");
                const deliverableQuery = query(
                    deliverableCollection,
                    where("profileid", "==", profileId),
                    where("type", "==", "appointment"),
                    where("deliveryref", "==", doc(this.firestore, "appointmenttype/" + appointmentTypeId))
                );

                const deliverableDocs = await getDocs(deliverableQuery);
                if (deliverableDocs.empty) {
                    alert("No matching deliverable found for this appointment type.");
                    return;
                }

                // ---- Item 4: honor the customer's per-role specialist mapping.
                // book-appointment only offers EIS that are assigned to THIS
                // customer (customer_eismapping.eisroles[role]); DDC fetches the
                // whole role pool, so verify the chosen specialist is allowed for
                // this customer before booking.
                const chosenRole: string = selectedSlotData?.appointmentrole;
                const chosenEis: string = selectedSlotData?.eisprofile;
                if (chosenRole && chosenEis) {
                    const custMapSnap = await getDoc(
                        doc(this.firestore, "customer_eismapping/" + profileId)
                    );
                    if (custMapSnap.exists()) {
                        const eisroles = custMapSnap.data()?.["eisroles"] || {};
                        const assigned = (eisroles[chosenRole] || [])
                            .map((e: any) => e?.path || e)
                            .filter(Boolean);
                        // Only enforce when the customer has an explicit mapping
                        // for this role; otherwise fall back to the global pool.
                        if (assigned.length > 0 && !assigned.includes(chosenEis)) {
                            alert("The selected specialist is not assigned to this customer for this appointment role.");
                            return;
                        }
                    }
                }

                const deliverableMap: { [path: string]: any } = {};
                deliverableDocs.docs.forEach(d => {
                    deliverableMap[d.ref.path] = d;
                });

                const deliverySequenceDoc = doc(this.firestore, "participantdeliverysequence/" + profileId);
                const participantDelivery = await getDoc(deliverySequenceDoc);
                if (!participantDelivery.exists()) {
                    alert("No Delivery Sequence Found");
                    return;
                }

                const products = participantDelivery.data()["products"];
                let matchedProduct: any = null;
                let matchedDelivery: any = null;
                let deliverablePath: string = null;

                for (const product of products) {
                    if (!product.delivery) continue;
                    for (const delivery of product.delivery) {
                        if (
                            delivery.type === "appointment" &&
                            (delivery.status === "ready" || delivery.status == null) &&
                            deliverableMap[delivery.sequenceref?.path] !== undefined
                        ) {
                            matchedProduct = product;
                            matchedDelivery = delivery;
                            deliverablePath = delivery.sequenceref.path;
                            break;
                        }
                    }
                    if (matchedProduct) break;
                }

                if (!matchedProduct || !matchedDelivery || !deliverablePath) {
                    alert("No matching delivery sequence entry found.");
                    return;
                }

                // Get appointment roles
                const apptRoleCollection = collection(this.firestore, "AppointmentType-To-Roles");
                const apptRoleQuery = query(
                    apptRoleCollection,
                    where("assigned_appttype_ref", "==", doc(this.firestore, "appointmenttype/" + appointmentTypeId)),
                    limit(1)
                );

                let appointmentRoles: string[] = [];
                const rolesDocs = await getDocs(apptRoleQuery);
                rolesDocs.forEach(d => {
                    (d.data()["required_role"] ?? []).forEach((r: any) => appointmentRoles.push(r.path));
                    (d.data()["additional_role"] ?? []).forEach((r: any) => appointmentRoles.push(r.path));
                });

                if (appointmentRoles.length === 0) {
                    alert("No roles configured for this appointment type.");
                    return;
                }

                const slotStart: Date = selectedSlotData.slotStart;
                const slotEnd: Date = selectedSlotData.slotEnd;
                const eisprofile: string = selectedSlotData.eisprofile;

                const docdata: { id: string, index: number }[] = selectedSlotData.docdata ?? [
                    { id: selectedSlotData.docid, index: selectedSlotData.index ?? 0 }
                ];

                // Map the chosen host to the role its slot actually fills (fall
                // back to the first required role if the slot didn't carry one).
                const slotRole: string = selectedSlotData.appointmentrole || appointmentRoles[0];
                const hostRole: { [key: string]: any[] } = {};
                hostRole[slotRole] = [doc(this.firestore, eisprofile)];

                const availabilityDocRef = doc(this.firestore, "availability/" + docdata[0].id);
                const availabilitySnap = await getDoc(availabilityDocRef);
                const availabilityData: any = availabilitySnap.data() || {};

                // ---- Item 2: flip the chosen slot to booked and mark any
                // overlapping slots (across appointment types) unavailable, so
                // the availability doc reflects the booking (mirrors book-appointment).
                const toDate = (v: any): Date | null =>
                    v?.toDate?.() ?? (v ? new Date(v) : null);
                const targetStart = toDate(slotStart);
                const targetEnd = toDate(slotEnd);
                const apptTypeRefs: any[] = availabilityData["appointments"] ?? [];
                for (const apptRef of apptTypeRefs) {
                    const apptId = apptRef?.id;
                    if (!apptId) continue;
                    const computedSlots = availabilityData[apptId];
                    if (!Array.isArray(computedSlots)) continue;
                    for (let k = 0; k < computedSlots.length; k++) {
                        const se = computedSlots[k];
                        const sStart = toDate(se.slotstart);
                        const sEnd = toDate(se.slotend);
                        if (!sStart || !sEnd || !targetStart || !targetEnd) continue;
                        const overlaps =
                            (sStart >= targetStart && sStart < targetEnd) ||
                            (sEnd > targetStart && sEnd < targetEnd) ||
                            (targetStart >= sStart && targetStart < sEnd);
                        if (!overlaps) continue;
                        if (!se.booked) se.available = false;
                        if (apptId === appointmentTypeId && k === docdata[0].index) {
                            se.booked = true;
                        }
                    }
                }

                const requiredRoles = appointmentRoles.map(r => doc(this.firestore, r));
                const hostRefs = [doc(this.firestore, eisprofile)];
                const docid = doc(collection(this.firestore, "appointments")).id;
                const appointmentDocRef = doc(this.firestore, "appointments/" + docid);
                const appointmentData = {
                    docid,
                    starttime: slotStart,
                    endtime: slotEnd,
                    appointment: doc(this.firestore, "appointmenttype/" + appointmentTypeId),
                    appointmentrole: requiredRoles,
                    bookedby: doc(this.firestore, "profile_data/" + profileId),
                    hosts: hostRefs,
                    hostRole,
                    slotdata: docdata,
                    attended: false,
                    cancelled: false,
                    created: serverTimestamp(),
                    loggedid: this.loggedInPID,
                    productid: matchedProduct.productref.id
                };

                const batch = writeBatch(this.firestore);

                batch.update(availabilityDocRef, availabilityData);
                batch.set(appointmentDocRef, appointmentData);
                await batch.commit();

                const updatedProducts = products.map((p: any) => {
                    if (p.participantproductid !== matchedProduct.participantproductid) return p;
                    const updatedDelivery = (p.delivery ?? []).map((d: any) => {
                        if (d.sequenceref?.path === deliverablePath) {
                            return { ...d, status: "ongoing" };
                        }
                        return d;
                    });
                    return { ...p, delivery: updatedDelivery };
                });

                const sequenceDocRef = doc(this.firestore, "participantdeliverysequence/" + profileId);
                await updateDoc(sequenceDocRef, { products: updatedProducts });

                const deliverableDocRef = doc(this.firestore, deliverablePath);
                await updateDoc(deliverableDocRef, {
                    fileref: arrayUnion(doc(this.firestore, appointmentDocRef.path)),
                    status: "ongoing"
                });

                const participantProductDocRef = doc(this.firestore, "participantsproduct/" + matchedProduct.participantproductid);
                await updateDoc(participantProductDocRef, { status: "ongoing" });

                alert("Appointment Booked Successfully!");

                // ---- Reflect the booking immediately + clear the booking state.
                // Optimistically lock the chosen slot so it shows as booked.
                const wasAvailable = !!selectedSlotData?.available && !selectedSlotData?.booked;
                if (selectedSlotData) {
                    selectedSlotData.booked = true;
                    selectedSlotData.available = false;
                }
                // Keep the aggregate counts (header "BOOKED / OPEN" badge + day
                // pill) in sync with the slot we just flipped, without a re-fetch.
                if (wasAvailable) {
                    const slotEisId = (selectedSlotData?.eisprofile || '').split('/').pop();
                    const spec = (this.specialistData || []).find((s: any) => s.eisId === slotEisId);
                    if (spec) {
                        spec.booked = (spec.booked || 0) + 1;
                        spec.availableSlots = Math.max(0, (spec.availableSlots || 0) - 1);
                        spec.utilizationPct = spec.appointmentsGiven
                            ? Math.round((spec.booked / spec.appointmentsGiven) * 100)
                            : 0;
                        if (spec.availableSlots > 0 && spec.utilizationPct < 60) {
                            spec.utilizationNote = 'needs bookings';
                            spec.utilizationNoteColor = '#f59e0b';
                        } else if (spec.availableSlots > 0) {
                            spec.utilizationNote = `${spec.availableSlots} open`;
                            spec.utilizationNoteColor = '#10b981';
                        } else {
                            spec.utilizationNote = '';
                        }
                    }
                    // Decrement the "N OPEN" count on the matching day pill.
                    const slotDay = selectedSlotData?.slotStart?.toDate?.()?.toDateString?.();
                    const dayEntry = (this.availableDates || []).find(
                        (d: any) => d.fullDate?.toDateString?.() === slotDay
                    );
                    if (dayEntry && dayEntry.availableCount > 0) {
                        dayEntry.availableCount--;
                    }
                }
                // Add the new appointment locally so the slot/booked-list show the
                // profile name without needing a full re-fetch.
                const newAppt = {
                    starttime: slotStart,
                    endtime: slotEnd,
                    profileid: profileId,
                    appointment: { id: appointmentTypeId },
                };
                this.filteredBookedAppointments = [
                    ...(this.filteredBookedAppointments || []),
                    newAppt,
                ];
                this.specialistBookedAll = [
                    ...(this.specialistBookedAll || []),
                    newAppt,
                ];
                // Clear the picker / selection state.
                this.slotSelected = false;
                this.selectedUser = null;
                this.filteredProfile = "";
                this.selectedSlotData = null;
                this.cdr.detectChanges();
            });

        } catch (err) {
            console.error("directBookAppointment error:", err);
            alert("Error booking appointment. Please try again.");
        }
    }

    async onProfileSelect(selectedprofile: string) {
        const confirmed = confirm('Are you sure you want to book this appointment?');
        if (confirmed) {
            await this.directBookAppointment(
                this.selectedAppointmentTypeId,
                selectedprofile
            );
        }
    }

    // ===== Analytics tab =================================================

    analyticsLoading = false;
    analyticsLoaded = false;
    analyticsError: string | null = null;
    analyticsVelocity: VelocityRow[] = [];
    analyticsFunnel: FunnelRow[] = [];
    analyticsUtilization: UtilizationRow[] = [];

    onOuterTabChange(event: any) {
        const label = event?.tab?.textLabel || '';
        if (label === 'Analytics') {
            // Always reload — analytics are computed in-memory so this is instant.
            // This ensures the charts reflect the current product-filter selection.
            this.analyticsLoaded = false;
            this.loadAnalytics();
        }
    }

    async loadAnalytics(): Promise<void> {
        if (this.analyticsLoading) return;
        this.analyticsLoading = true;
        this.analyticsError = null;
        try {
            // Use visibleCardIds (same product set as Overview) so analytics always matches.
            const visibleProductNames = this.visibleCardIds.map(id => this.getCardName(id));

            // 1. Load velocity — this is fast (in-memory compute).
            //    Don't await specialist here: that chain is 5 collections deep and can be slow.
            //    We load it independently so the section appears immediately.
            const velocity = await this.completionVelocity({ weeks: 12, productIds: visibleProductNames });
            this.analyticsVelocity = velocity;
            // funnelChart reads directly from funnelData — no separate load needed.
            this.analyticsLoaded = true;
        } catch (e: any) {
            this.analyticsError = e?.message || 'Failed to load analytics';
            console.warn('Analytics load failed', e);
        } finally {
            this.analyticsLoading = false;
            this.cdr.detectChanges();
        }

        // 2. Specialist slot load — disabled until fetchSpecialistSlotsAndCompute is optimised.
        // if (!this.specialistSlotsInitialized) {
        //     this.initSpecialistDateRange();
        //     this.loadSpecialistBaseData();
        // }
    }

    // ---- Velocity chart view-model ----------------------------------------

    get velocityChart(): {
        weeks: string[];
        yMax: number;
        lines: { product: string; pathD: string; points: { x: number; y: number; count: number }[]; color: string }[];
        width: number;
        height: number;
        pad: { l: number; r: number; t: number; b: number };
    } {
        const rows = this.analyticsVelocity;
        const w = 720, h = 234;
        const pad = { l: 36, r: 14, t: 26, b: 26 };
        if (rows.length === 0) {
            return { weeks: [], yMax: 1, lines: [], width: w, height: h, pad };
        }
        const weeks = Array.from(new Set(rows.map(r => r.week))).sort();
        const products = Array.from(new Set(rows.map(r => r.product_id))).sort();
        const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#0891b2'];
        const yMax = Math.max(1, ...rows.map(r => r.completions));
        const plotW = w - pad.l - pad.r;
        const plotH = h - pad.t - pad.b;
        const xStep = weeks.length > 1 ? plotW / (weeks.length - 1) : 0;
        const xAt = (i: number) => pad.l + i * xStep;
        const yAt = (v: number) => pad.t + (plotH - (v / yMax) * plotH);
        const lines = products.map((p, idx) => {
            const points = weeks.map((wk, i) => {
                const row = rows.find(r => r.week === wk && r.product_id === p);
                const c = row?.completions || 0;
                return { x: xAt(i), y: yAt(c), count: c };
            });
            const pathD = points
                .map((pt, i) => (i === 0 ? `M${pt.x},${pt.y}` : `L${pt.x},${pt.y}`))
                .join(' ');
            return { product: p, pathD, points, color: palette[idx % palette.length] };
        });
        return { weeks, yMax, lines, width: w, height: h, pad };
    }

    // ---- Funnel view-model -----------------------------------------------

    get funnelChart(): {
        products: { product: string; stages: { stage: string; label: string; count: number; pct: number; color: string }[]; total: number }[];
    } {
        // Uses the same funnelData as the Overview (time-filtered + product-filtered via visibleCardIds)
        // so Analytics and Overview always agree on numbers.
        const stageKeys = ['initiated', 'awaiting', 'started', 'ongoing', 'completed'] as const;
        const stageLabels: Record<string, string> = { initiated: 'Initiated', awaiting: 'Awaiting', started: 'Started', ongoing: 'Ongoing', completed: 'Completed' };
        const stageColors: Record<string, string> = { initiated: '#a78bfa', awaiting: '#fb923c', started: '#60a5fa', ongoing: '#818cf8', completed: '#34d399' };

        return {
            products: this.visibleCardIds.map(cardId => {
                const funnel = this.getCardFunnel(cardId);
                const stages = stageKeys.map(s => ({
                    stage: s,
                    label: stageLabels[s],
                    count: (funnel[s] as any[])?.length || 0,
                    pct: 0,
                    color: stageColors[s],
                }));
                const total = stages.reduce((sum, s) => sum + s.count, 0) || 1;
                stages.forEach(s => s.pct = Math.round((s.count / total) * 100));
                return { product: this.getCardName(cardId), stages, total };
            })
        };
    }

    // ---- Specialist utilization view-model -------------------------------

    get utilizationChart(): {
        specialists: { specialist_id: string; profile_ref: string; weeks: { week: string; util: number; booked: number; available: number }[]; avgUtil: number }[];
    } {
        const bySpec = new Map<string, UtilizationRow[]>();
        for (const r of this.analyticsUtilization) {
            const arr = bySpec.get(r.specialist_id) || [];
            arr.push(r);
            bySpec.set(r.specialist_id, arr);
        }
        const specs: any[] = [];
        bySpec.forEach((rows, id) => {
            const sorted = rows.slice().sort((a, b) => a.week.localeCompare(b.week));
            const avgUtil = sorted.length
                ? sorted.reduce((s, r) => s + r.utilization, 0) / sorted.length
                : 0;
            specs.push({
                specialist_id: id,
                profile_ref: sorted[0]?.profile_ref || id,
                weeks: sorted.map(r => ({
                    week: r.week,
                    util: r.utilization,
                    booked: r.booked,
                    available: r.available,
                })),
                avgUtil,
            });
        });
        specs.sort((a, b) => b.avgUtil - a.avgUtil);
        return { specialists: specs };
    }

    velocityWeekLabel(week: string): string {
        // Compact label: "May 18" or just "18" depending on chart density
        if (!week) return '';
        const d = new Date(week);
        const m = d.toLocaleString('en-US', { month: 'short' });
        return `${m} ${d.getDate()}`;
    }

    utilTone(util: number): string {
        if (util >= 0.85) return 'high';
        if (util >= 0.6) return 'med';
        if (util >= 0.3) return 'low';
        return 'min';
    }

    // ===== Analytics — real Firestore data =================================

    /** Convert any Firestore Timestamp / Date / epoch to a JS Date, or null. */
    private tsToDate(ts: any): Date | null {
        if (!ts) return null;
        if (ts?.toDate) return ts.toDate() as Date;
        if (ts instanceof Date) return ts;
        if (typeof ts === 'number') return new Date(ts);
        return null;
    }

    /** Return the ISO date string (YYYY-MM-DD) for the Monday of the given date's week. */
    private weekMonday(d: Date): string {
        const day = new Date(d);
        const dow = (day.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
        day.setDate(day.getDate() - dow);
        day.setHours(0, 0, 0, 0);
        return day.toISOString().slice(0, 10);
    }

    /**
     * Completion Velocity — counts participants whose `statusdate.completed`
     * timestamp falls within each of the last `weeks` calendar weeks,
     * grouped by product name.
     */
    async completionVelocity(opts: { weeks: number; productIds?: string[] | null } = { weeks: 12 }): Promise<VelocityRow[]> {
        const { weeks, productIds } = opts;
        const today = new Date();
        const cutoffMs = today.getTime() - weeks * 7 * 24 * 60 * 60 * 1000;

        // Build optional name filter (product label or product name)
        const filterNames = new Set<string>(
            (productIds ?? []).map(id => id.toLowerCase().trim()).filter(Boolean)
        );

        const map = new Map<string, number>(); // "week|productName" → completion count

        for (const item of this.allMatchedProductsRaw) {
            if ((item?.status || '').toString().toLowerCase().trim() !== 'completed') continue;

            const completedDate = this.tsToDate(item?.statusdate?.completed);
            if (!completedDate || completedDate.getTime() < cutoffMs) continue;

            const productName = this.mapProductName?.[item?.productref?.id] || '';
            if (!productName) continue;
            if (filterNames.size > 0 && !filterNames.has(productName.toLowerCase().trim())) continue;

            const key = `${this.weekMonday(completedDate)}|${productName}`;
            map.set(key, (map.get(key) || 0) + 1);
        }

        const rows: VelocityRow[] = [];
        for (const [key, completions] of map) {
            const sep = key.indexOf('|');
            rows.push({ week: key.slice(0, sep), product_id: key.slice(sep + 1), completions });
        }
        return rows.sort((a, b) => a.week.localeCompare(b.week));
    }

    /**
     * Funnel Drop-off — for each product, shows how many participants are
     * currently at each pipeline stage (cumulative: each tier includes all
     * participants at that stage AND every stage beyond it).
     *
     * Stage mapping (from `status` field on participantsproduct):
     *   null / unknown → 'initiated'
     *   'initiated' | 'awaiting' | 'started' | 'ongoing' | 'completed' → direct
     */
    async funnelDropoff(opts: { fromDate?: string; productIds?: string[] | null } = {}): Promise<FunnelRow[]> {
        const { productIds } = opts;
        const stageOrder: FunnelRow['stage'][] = ['initiated', 'awaiting', 'started', 'ongoing', 'completed'];
        const excludedStatuses = new Set(['rejected', 'cancelled', 'inactive', 'shifted']);

        const filterNames = new Set<string>(
            (productIds ?? []).map(id => id.toLowerCase().trim()).filter(Boolean)
        );

        // Count participants by current status, per product
        const productStageCounts = new Map<string, Map<string, number>>();

        for (const item of this.allMatchedProductsRaw) {
            const rawStatus = (item?.status || '').toString().toLowerCase().trim();
            if (!rawStatus || excludedStatuses.has(rawStatus)) continue;

            const productName = this.mapProductName?.[item?.productref?.id] || '';
            if (!productName) continue;
            if (filterNames.size > 0 && !filterNames.has(productName.toLowerCase().trim())) continue;

            const stage: FunnelRow['stage'] = (stageOrder as string[]).includes(rawStatus)
                ? rawStatus as FunnelRow['stage']
                : 'initiated';

            if (!productStageCounts.has(productName)) {
                productStageCounts.set(productName, new Map());
            }
            const sm = productStageCounts.get(productName)!;
            sm.set(stage, (sm.get(stage) || 0) + 1);
        }

        // Non-cumulative: each stage shows only participants currently at that exact stage.
        // This lets the stacked bar chart show WHERE people are right now (stage distribution).
        const rows: FunnelRow[] = [];
        for (const [productName, stageCounts] of productStageCounts) {
            for (let i = 0; i < stageOrder.length; i++) {
                rows.push({ product_id: productName, stage: stageOrder[i], count: stageCounts.get(stageOrder[i]) || 0 });
            }
        }
        return rows;
    }

    /**
     * Specialist Utilization — for each specialist (taken from `hosts[0]` on
     * participantsproduct), counts how many participants they were actively
     * supporting during each of the last `weeks` calendar weeks.
     *
     * "Active during week W" = participant's `statusdate.ongoing` (or `.started`
     * or `.initiated`) is before week-end, AND `statusdate.completed` is either
     * absent or after week-start.
     *
     * `booked`       = active participant count for the week (+ any appointments)
     * `available`    = assumed capacity (20) − booked
     * `utilization`  = booked / 20, capped at 1
     */
    async specialistUtilization(opts: { weeks: number } = { weeks: 8 }): Promise<UtilizationRow[]> {
        const { weeks } = opts;
        const CAPACITY = 20;

        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        monday.setHours(0, 0, 0, 0);

        // --- Build specialist → participant list ---
        const specMap = new Map<string, { name: string; participants: any[] }>();

        for (const item of this.allMatchedProductsRaw) {
            const rawHost = item?.hosts?.[0];
            if (!rawHost) continue;

            const hostId: string = typeof rawHost === 'string'
                ? (rawHost.split('/').pop() || rawHost)
                : ((rawHost?.path || '').split('/').pop() || rawHost?.id || '');
            if (!hostId) continue;

            if (!specMap.has(hostId)) {
                const name = this.mapMetaData?.[hostId]?.['name'] || hostId;
                specMap.set(hostId, { name, participants: [] });
            }
            specMap.get(hostId)!.participants.push(item);
        }

        // --- Build appointment count: "week|hostId" → count ---
        // Link appointments to specialists via participantproductid → docid/id → hosts[0]
        const docToHost = new Map<string, string>();
        for (const [hostId, data] of specMap) {
            for (const item of data.participants) {
                const docid = item?.docid || item?.id || '';
                if (docid) docToHost.set(docid, hostId);
            }
        }

        const apptMap = new Map<string, number>(); // "week|hostId" → appointment count
        for (const appt of (this.allAppointments as any[])) {
            const ppid: string = appt?.participantproductid || appt?.productid || '';
            const hostId = docToHost.get(ppid);
            if (!hostId) continue;
            const startDate = this.tsToDate(appt?.starttime || appt?.appointmentstart);
            if (!startDate) continue;
            const key = `${this.weekMonday(startDate)}|${hostId}`;
            apptMap.set(key, (apptMap.get(key) || 0) + 1);
        }

        // --- Build rows ---
        const rows: UtilizationRow[] = [];

        for (const [hostId, data] of specMap) {
            for (let w = weeks - 1; w >= 0; w--) {
                const weekStart = new Date(monday);
                weekStart.setDate(monday.getDate() - w * 7);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 7);
                const weekStr = weekStart.toISOString().slice(0, 10);

                let active = 0;
                for (const item of data.participants) {
                    const sd = item?.statusdate || {};
                    const ongoingDate = this.tsToDate(sd['ongoing'] || sd['started'] || sd['initiated']);
                    if (!ongoingDate) {
                        if (w === 0) active++; // no timestamp → assume currently active
                        continue;
                    }
                    const completedDate = this.tsToDate(sd['completed']);
                    if (ongoingDate <= weekEnd && (!completedDate || completedDate >= weekStart)) {
                        active++;
                    }
                }

                const apptCount = apptMap.get(`${weekStr}|${hostId}`) || 0;
                const booked = Math.max(active, apptCount);
                const available = Math.max(0, CAPACITY - booked);
                const utilization = Math.round(Math.min(1, booked / CAPACITY) * 1000) / 1000;

                rows.push({ specialist_id: hostId, profile_ref: data.name, week: weekStr, booked, available, utilization });
            }
        }

        return rows;
    }

    // ===== Actionable cohorts (populates the Participants tab from stage data) =====
    //
    // The original populator was appointment-driven (line 2787 area), so it returned
    // empty whenever appointments couldn't be read (permission denial) or whenever a
    // participant had never had an appointment. This stage-based populator walks
    // participantsproduct directly (the data the Stages section already uses) and
    // categorizes every actionable participant into one of three buckets, mapped to
    // the PM table's column shape.

    private readonly IDLE_DAYS = 7;
    private readonly STUCK_DAYS = 15;

    private daysSinceTs(ts: any): number {
        if (!ts) return 0;
        const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
        if (!d || isNaN(d.getTime())) return 0;
        return Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000)));
    }

    populateActionableCohorts(): void {
        const awaiting: any[] = [];
        const idle: any[] = [];
        const stuck: any[] = [];

        const rejected = new Set(['rejected', 'cancelled', 'inactive']);

        for (const item of this.allMatchedProductsRaw || []) {
            if (!this.itemPassesProductFilter(item)) continue;

            const profileId = item?.profileid;
            if (!profileId) continue;
            const meta = this.mapMetaData?.[profileId] || {};
            const status = (item?.status || '').toString().toLowerCase().trim();
            if (status === 'completed' || rejected.has(status)) continue;

            const mode = (meta['participantmode'] || '').toString().toLowerCase().trim();
            const totalPaid = parseInt(meta['pp_totalpaid'] ?? '0') || 0;
            const totalPurchaseValue = parseInt(meta['pp_totalpurchasevalue'] ?? '0') || 0;
            const totalBalance = totalPurchaseValue - totalPaid;
            const minPayment = parseInt(item?.['minimumpayment']) || 0;
            const isEligible = !this.excludedModes.has(mode)
                && (totalBalance <= 0 || totalPaid >= minPayment);
            const financialdata = isEligible ? 'Cleared' : 'Not Scheduled';

            const productId = item?.productref?.id;
            const productName = this.shortenProductName(this.mapProductName?.[productId] || '');
            const journeyId = item?.journeyref?.id || meta['activejourney'];
            const journeyName = this.mapjourneyname?.[journeyId] || 'N/A';

            const sd = item?.statusdate || {};
            const onboarded = meta['onboardedtime'] || sd['initiated'] || null;
            const initiated = sd['initiated'] || null;
            const lastActivity = sd['ongoing'] || sd['started'] || sd['initiated'] || onboarded;
            const lastPayment = meta['lastpaymentdate'] || meta['lastpayment'] || null;

            const daysSinceOnboarded = this.daysSinceTs(onboarded);
            const daysSinceInitiated = this.daysSinceTs(initiated);
            const daysSinceActivity = this.daysSinceTs(lastActivity);

            // --- Awaiting Initiation -------------------------------------
            // Payment cleared (eligible), and status is null/empty (not yet initiated)
            if (!status && isEligible) {
                awaiting.push({
                    profileid: profileId,
                    journey: journeyName,
                    onboardedtime: onboarded,
                    waitingperiod: daysSinceOnboarded,
                    financialdata,
                    lastpaymentdate: lastPayment,
                    bottleneck: 'Ready for Initiation',
                });
                continue;
            }

            // --- Initiated · Not Consuming -------------------------------
            // status='initiated' and idle > IDLE_DAYS
            if (status === 'initiated' && daysSinceInitiated >= this.IDLE_DAYS) {
                idle.push({
                    profileid: profileId,
                    journey: journeyName,
                    initiatedtime: initiated,
                    waitingperiod: daysSinceInitiated,
                    generalnotes: [],
                });
            }

            // --- Stuck Cases ----------------------------------------------
            // In any active stage (initiated/ongoing) and no movement > STUCK_DAYS
            if ((status === 'initiated' || status === 'ongoing') && daysSinceActivity >= this.STUCK_DAYS) {
                const days = daysSinceActivity;
                const escalation = days > 30 ? 'HIGH' : days > 21 ? 'MEDIUM' : 'LOW';
                stuck.push({
                    profileid: profileId,
                    activejourney: journeyName,
                    product: productName || 'N/A',
                    appointment: 'N/A',
                    appointmentstatus: 'N/A',
                    issuetype: status === 'ongoing' ? 'Stuck mid-flow' : 'Initiated · stalled',
                    date: lastActivity,
                    waitingperiod: days,
                    lastaction: status,
                    assignedto: 'Unassigned',
                    escalationlevel: escalation,
                    generalnotes: [],
                });
            }
        }

        this.originalData['awaitingInitiation'].data = awaiting;
        this.originalData['awaitingInitiation'].count = awaiting.length;
        this.originalData['currentJourneyInitiated'].data = idle;
        this.originalData['currentJourneyInitiated'].count = idle.length;
        this.originalData['stuckCases'].data = stuck;
        this.originalData['stuckCases'].count = stuck.length;

        // Pagination depends on these arrays; recalc if a table is currently mounted.
        if (typeof this.calculatePagination === 'function') {
            this.calculatePagination();
            this.updatePaginatedData?.();
        }
    }
}