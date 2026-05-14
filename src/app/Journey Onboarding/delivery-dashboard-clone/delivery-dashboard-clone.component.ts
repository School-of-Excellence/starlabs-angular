import { ChangeDetectorRef, Component, ViewChild, TemplateRef, OnInit, OnDestroy, runInInjectionContext, Injector } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { Firestore, collection, collectionData, query, where, updateDoc, doc, getDocs, orderBy, Timestamp, getDoc, documentId } from '@angular/fire/firestore';
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
            "D&I Appointments",
            "Report",
            "Celebration Call"
        ],

        "criticalSupport": [
            "Total Eligible",
            "Request",
            "Pre-Process Form",
            "Diagnostics",
            "Implementation",
            "Post-Process Form",
            "Review",
            "Completion"
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
            'Post-Process Form',
            'Review'
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
    selectedStage = '';

    openAppointmentModal = false;
    participantLoading = false;

    productData: any = {
        eiStarterPack: {
            totalEligible: [],
            pastMonth: [],
            thisMonth: [],
            nextMonth: [],
            onBoarded: [],
            upcomingDIAppointments: [],
            reports: [],
            celebrationCall: []
        },

        criticalSupport: {
            totalEligible: [],
            request: [],
            preprocess: [],
            diagnostics: [],
            implementation: [],
            postForm: [],
            review: [],
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
    ) {
        this.filterForm = this.fb.group({
            search: [''],
            journey: [[]],
            product: [[]]
        });

    }

    async ngOnInit() {
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
        this.participantsProductDataSubscription?.unsubscribe();
        this.appointmentsSubscription?.unsubscribe();
        this.formsSubscription?.unsubscribe();
        this.ticketRequestSubscription?.unsubscribe();
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

                const status = item?.status?.toLowerCase?.() || null;
                const profileId = item?.profileid;
                const mode = this.mapMetaData?.[profileId]?.['participantmode']?.toLowerCase?.();
                const totalPaid = parseInt(this.mapMetaData?.[profileId]?.['pp_totalpaid'] ?? '0') || 0;
                const totalPurchaseValue = parseInt(this.mapMetaData?.[profileId]?.['pp_totalpurchasevalue'] ?? '0') || 0;
                const totalBalance = totalPurchaseValue - totalPaid;
                const minPayment = parseInt(item?.['minimumpayment']) || 0;
                const isEligible = !this.excludedModes.has(mode?.toLowerCase().trim()) && (totalBalance <= 0 || totalPaid >= minPayment);
                const statusdate = item?.statusdate || {};
                const tentativestart = item?.tentativestart || null;

                if (!['completed', 'ongoing'].includes(status)) {
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
                    } else (groupedNotEligible[productId] ||= []).push(item);
                }

                if (isEligible) {
                    const packageId = item?.packageref?.id;

                    if (packageId && this.bonusPackageIds.has(packageId)) {
                        (groupedBonus[productId] ||= []).push(item);
                    }
                    else if (packageId && this.addonsPackageIds.has(packageId)) {
                        (groupedAddons[productId] ||= []).push(item);
                    }
                    else {
                        (groupedPurchased[productId] ||= []).push(item);
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
    }

    getConversionRate(cardId: string): number {
        const funnel = this.getCardFunnel(cardId);
        const total = this.getCardGroupedFiltered(cardId).length;
        if (total === 0) return 0;
        return Math.round((funnel.completed.length / total) * 100);
    }

    async selectProduct(product: string) {
        this.participantLoading = true;
        this.productData = {};

        const productId = this.mapProductGroupId[product];
        this.selectedProductLabel = product;
        this.stages = this.stagesConfig[product] || [];

        if (this.allAppointments?.length === 0) {
            await this.filterAppointmentsByType();
            await this.FilterReportData(productId);
            if (product === 'Critical Support') await this.fetchTicketRiseParticipants();
        }

        if (product === 'EI Starter Pack') {
            this.selectedColumns = this.columns.eiStarterPack;
            await this.filterProductData('eiStarterPack', product, productId);
        }
        else if (product === 'Critical Support') {
            this.selectedColumns = this.columns.criticalSupport;
            await this.filterProductData('criticalSupport', product, productId);
        }

        if (product === 'Critical Support') await this.filterStageData();
        this.participantLoading = false;
    }

    async filterAppointmentsByType(): Promise<void> {
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

                const q = query(
                    collection(this.firestore, "appointments"),
                    where("cancelled", "==", false),
                    where("starttime", ">=", startTimestamp),
                    where("starttime", "<=", endTimestamp)
                );

                const sub = collectionData(q, { idField: 'id' })
                    .subscribe({
                        next: async (appointmentsSnap: any[]) => {

                            let updatedAppointments = [...appointmentsSnap];
                            await Promise.all(
                                updatedAppointments.map(async (appointment) => {
                                    appointment.appointmentTypeName =
                                        await this.resolveAppointmentType(appointment);
                                })
                            );

                            updatedAppointments = updatedAppointments.map((app: any) => {
                                const matchedProduct = this.allMatchedProductsRaw.find(
                                    (product: any) =>
                                        product.docid === app.participantproductid
                                );
                                return {
                                    ...app,
                                    ...matchedProduct
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
                            console.error("Error loading appointments:", err);
                            this.loadingStates.appointments = true;
                            this.journeyFlowLoading = false;
                            this.cdr.detectChanges();
                            reject(err);
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
                upcomingDIAppointments: [],
                reports: [],
                celebrationCall: []
            },

            criticalSupport: {
                totalEligible: [],
                request: this.ticketRequest.length ? this.ticketRequest : [],
                preprocess: [],
                diagnostics: [],
                implementation: [],
                postForm: [],
                review: [],
                completion: []
            }
        };

        this.selectedProductType = productType;
        const allAppointments = this.allAppointments;
        try {
            const totalEligible = this.getCardGroupedFiltered(productId);
            if (productType === 'criticalSupport') {
                productData.criticalSupport.totalEligible = [...totalEligible];
            }
            else if (productType === 'eiStarterPack') {
                for (let data of totalEligible) {
                    const { status, tentativestart } = data;

                    if (status === null || status === "initiated") {
                        if (!tentativestart) productData.totalEligible.push(data);
                        else if (tentativestart) {
                            const date = tentativestart.toDate();
                            const itemMonth = date.getMonth();
                            const itemYear = date.getFullYear();
                            this.handleMonthCategory(itemMonth, itemYear, data, null, productData);
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
                    if (productType === 'criticalSupport') productData.criticalSupport.totalEligible.push(mergedData);
                    if (productType === 'eiStarterPack') {
                        if (!data.tentativestart) {
                            productData.eiStarterPack.totalEligible.push(mergedData);
                        } else {
                            const date = data.tentativestart.toDate();
                            const itemMonth = date.getMonth();
                            const itemYear = date.getFullYear();
                            this.handleMonthCategory(itemMonth, itemYear, data, appointments, productData);
                        }
                    }
                }
                else if (attendedAppointments.length > 0) {
                    // ========================= EI STARTER PACK =========================
                    if (productType === 'eiStarterPack') {
                        const celebrationCallAppointment = attendedAppointments.find(app =>
                            app.formname?.toLowerCase() === `${product.toLowerCase()} celebration call`
                        );
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

                        if (celebrationCallAppointment) {
                            productData.eiStarterPack.celebrationCall.push({
                                ...mergedData,
                                ...celebrationCallAppointment
                            });
                        }
                        else if (reportAppointment) {
                            productData.eiStarterPack.reports.push({
                                ...mergedData,
                                ...reportAppointment
                            });

                        }
                        else if (implementationAppointment || diagnosticsAppointment) {
                            productData.eiStarterPack.upcomingDIAppointments.push({
                                ...mergedData,
                                ...(implementationAppointment || diagnosticsAppointment)
                            });

                        } else if (welcomeCallAppointment) {
                            productData.eiStarterPack.onBoarded.push({
                                ...mergedData,
                                ...welcomeCallAppointment
                            });
                        }
                    }
                    // ========================= CRITICAL SUPPORT =========================
                    else if (productType === 'criticalSupport') {
                        const reviewAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === `critical support review`
                        );

                        const postprocessAppointment = attendedAppointments.find(app =>
                            app.formname?.toLowerCase() === 'critical support post form'
                        );

                        const implementationAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === 'critical support implementation'
                        );

                        const diagnosticsAppointment = attendedAppointments.find(app =>
                            app.appointmentTypeName?.toLowerCase() === 'critical support diagnostics'
                        );

                        const preprocessAppointment = attendedAppointments.find(app =>
                            app.formname?.toLowerCase() === 'critical support request'
                        );

                        if (reviewAppointment) {
                            productData.criticalSupport.review.push({
                                ...mergedData,
                                ...reviewAppointment
                            });
                        }
                        else if (postprocessAppointment) {
                            productData.criticalSupport.postForm.push({
                                ...mergedData,
                                ...postprocessAppointment
                            });
                        }
                        else if (implementationAppointment) {
                            productData.criticalSupport.implementation.push({
                                ...mergedData,
                                ...implementationAppointment
                            });
                        }
                        else if (diagnosticsAppointment) {
                            productData.criticalSupport.diagnostics.push({
                                ...mergedData,
                                ...diagnosticsAppointment
                            });
                        }
                        else if (preprocessAppointment) {
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

    handleMonthCategory(itemMonth: number, itemYear: number, data: any, allappointments: any, productData: any) {
        let mergedData: any;
        if (allappointments !== null && allappointments?.length > 0) {
            mergedData = { ...data, allappointments: allappointments }
        } else {
            mergedData = data;
        }

        if (itemMonth === this.currentMonth && itemYear === this.currentYear) {
            productData.eiStarterPack.thisMonth.push(mergedData);
        }
        else if (
            (itemMonth === this.currentMonth - 1 && itemYear === this.currentYear) ||
            (this.currentMonth === 0 && itemMonth === 11 && itemYear === this.currentYear - 1)
        ) {
            productData.eiStarterPack.pastMonth.push(mergedData);
        }
        else if (
            (itemMonth === this.currentMonth + 1 && itemYear === this.currentYear) ||
            (this.currentMonth === 11 && itemMonth === 0 && itemYear === this.currentYear + 1)
        ) {
            productData.eiStarterPack.nextMonth.push(mergedData);
        }
        else productData.eiStarterPack.totalEligible.push(mergedData);
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
            } else if (app?.formname === 'Critical Support Request') {
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
            if (appointment?.formname === 'Critical Support Request') return 'Pre-Process';
            else if (appointment?.formname === 'Critical Support Post Form') return 'Post-Process Form';
            else if (appointment?.formname === 'Post Session Check-in') return 'Post Session Check-in';
        }
        // Normal appointment flow
        const id = appointment?.appointment?.id;
        const match = this.mappedAppointmentTypes.find(x => x.id === id);

        return match?.appointmenttype;
    }

    async filterStageData() {
        const stageConfig = [
            { key: 'diagnostics', appointmentType: 'Critical Support Diagnostics' },
            { key: 'implementation', appointmentType: 'Critical Support Implementation' },
            { key: 'review', appointmentType: 'Critical Support Review' }
        ];

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

        const filteredAppointments = this.allAppointments.filter(app =>
            app.appointmentTypeName === appointmentTypeName &&
            app.attended === false
        );

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
                6: this.productData.eiStarterPack.upcomingDIAppointments || [],
                7: this.productData.eiStarterPack.report || [],
                8: this.productData.eiStarterPack.celebrationCall || []
            };
        }
        else if (this.selectedProductType === 'criticalSupport') {
            sources = {
                0: this.productData.criticalSupport.totalEligible || [],
                1: this.productData.criticalSupport.request || [],
                2: this.productData.criticalSupport.preprocess || [],
                3: this.productData.criticalSupport.diagnostics || [],
                4: this.productData.criticalSupport.implementation || [],
                5: this.productData.criticalSupport.postForm || [],
                6: this.productData.criticalSupport.review || [],
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

    async loadSpecialistBaseData(retryCount = 0) {
        this.specialistLoading = true;
        this.cdr.detectChanges();

        try {
            const productsSnap = await runInInjectionContext(this.injector, () =>
                getDocs(query(
                    collection(this.firestore, 'products'),
                    where('mode', '==', 'Priority Mode')
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
            const productNamesArray = Array.from(entry.productNames);
            const productDisplay = productNamesArray.length > 1
                ? `${productNamesArray[0]} +${productNamesArray.length - 1}`
                : (productNamesArray[0] || 'N/A');

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

        for (const groupName of Object.keys(this.mergedGroupIds)) {
            const groupPids = this.mergedGroupIds[groupName];
            const hasData = [...groupPids].some((pid) => allProductIds.has(pid)); // Temporary
            if (hasData) { // Temporary
                result.push('group:' + groupName);
                for (const pid of groupPids) seen.add(pid);
            } // Temporary
        }

        for (const pid of allProductIds) {
            if (seen.has(pid)) continue;
            if (this.hiddenProductIds.has(pid)) continue;
            result.push(pid);
        }

        return result.sort((a, b) => this.getCardGroupedAll(b).length - this.getCardGroupedAll(a).length);
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
        return this.mapProductName[cardId] || 'Unknown';
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

    selectedStatus: string = 'all';
    allFunnelModalProfiles: any = {};

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
        // Awaiting
        // else if (this.selectedStageFilter === 'Awaiting') {
        //     const data =
        //         stage.awaiting?.[selectedFilter] ||
        //         stage.awaiting?.all ||
        //         [];

        //     this.groupedByStageProfileAll = this.selectedProductId
        //         ? data.filter(
        //               (item: any) => item.productId === this.selectedProductId
        //           )
        //         : data;
        // }
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
            // 'priority mode',
            'integration mode',
        ]);

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
        this.filterAppointmentsByType();
    }

    onJourneyMonthSelected(event: Date, picker: any) {
        this.selectedMonth = new Date(event.getFullYear(), event.getMonth(), 1);
        this.journeyMonthPicker.setValue(this.selectedMonth);
        this.updateDisplayMonth();
        picker.close();
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
}