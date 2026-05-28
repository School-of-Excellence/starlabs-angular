import { ChangeDetectorRef, Component, ViewChild, TemplateRef, ChangeDetectionStrategy } from '@angular/core';
import { and, collection, collectionData, Firestore, or, query, where, getDocs, getCountFromServer, doc, updateDoc, setDoc, getDoc, limit, writeBatch } from '@angular/fire/firestore';
import { orderBy, Timestamp } from 'firebase/firestore';
import { takeUntil, Subject, Subscription, take, combineLatest } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { CommonModule, DatePipe, KeyValue } from '@angular/common';
import { ScheduleDialogComponent } from '../schedule-dialog/schedule-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule, MatDateRangePicker } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import * as XLSX from 'xlsx';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { EcoSystemDialogComponent } from '../eco-system-new/eco-system-dialog/eco-system-dialog.component';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { environment } from '../../../environments/environment';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { CrossOverMetricsDialogComponent } from '../cross-over-metrics-dialog/cross-over-metrics-dialog.component';

interface ColumnConfig {
  key: string;
  header: string;
  width?: string;
  type?: 'text' | 'date' | 'currency' | 'number' | 'status' | 'custom' | 'mapped';
  format?: string; // For date format or number format
  mapKey?: string;
  mapValue?: string
  mapper?: (value: any) => string; // Custom mapping function
  mapData?: { [key: string]: any }; // Mapping dictionary
  cssClass?: string; // Custom CSS class
  align?: 'left' | 'center' | 'right';
  prefix?: string; // Like ₹, $, etc.
  suffix?: string; // Like %, etc.
  statusColors?: { [key: string]: string }; // For status badges
  substringStart?: number;
  substringEnd?: number;
}

interface TableConfig {
  title?: string;
  columns: ColumnConfig[];
  data: any[];
  dataKey: string,
  dateFormat?: string;
  currencySymbol?: string;
  filters?: any[];
}

export interface DialogConfig {
  width?: string;
  height?: string;
  maxWidth?: string;
  maxHeight?: string;
  panelClass?: string | string[];
  backdropClass?: string;
  disableClose?: boolean;
  autoFocus?: boolean;
}

export interface Dialog {
  title: string;
  dialog: DialogConfig,
  table: TableConfig,
  avg?: number
}

export interface CategoryMetric {
  startpoint: number;
  endpoint: number;
  sequence: number;
}

export interface InterimProfile {
  profileId: string;
  profileName: string;
  createdDate: string;
  changedCount: number | 'all';
  progressedAreas: string[];
  regressedAreas: string[];
  metric: Record<string, CategoryMetric>;
  previousMetric: Record<string, CategoryMetric> | null;
  previousCreatedDate: string | null;
}

export interface MonthSummary {
  yearMonth: string;
  monthLabel: string;
  totalInterims: number;
  noChangeCount: number;
  progressedData: {
    areaBreakdown: Record<string | number, number>;
    categoryBreakdown: Record<string, number>;
  };
  regressedData: {
    areaBreakdown: Record<string | number, number>;
    categoryBreakdown: Record<string, number>;
  };
  profileGroups: {
    progressed: InterimProfile[];
    regressed: InterimProfile[];
    noChange: InterimProfile[];
  };
}

export type DialogType = 'nc' | 'area' | 'category' | 'summary' | 'months' | null;

export interface DialogContext {
  dialogType: DialogType;
  dialogTitle: string;
  dialogSubtitle: string;
  statusClass: 'up' | 'dn' | 'nc';
  profileList: InterimProfile[];
  statusType?: 'up' | 'dn' | 'nc';
}

@Component({
  selector: 'app-journeycoach-dashboard',
  imports: [
    CommonModule,
    MatInputModule,
    ReactiveFormsModule,
    FormsModule,
    MatDateRangePicker,
    MatFormFieldModule,
    MatDatepickerModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatDialogModule,
    MatMenuModule,
    MatButtonToggleModule,
    MatTabsModule,
    MatTableModule
  ],
  templateUrl: './journeycoach-dashboard.component.html',
  styleUrl: './journeycoach-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JourneycoachDashboardComponent {
  selectedRows: any[] = [];
  Math = Math;

  trackByKey(index: number, item: any) { return item.key; }
  trackByIndex(index: number) { return index; }

  // Add these to your existing properties
  @ViewChild('calendarDialogTemplate') calendarDialogTemplate: TemplateRef<any>;
  @ViewChild('CURADialogTemplate') CURADialogTemplate: TemplateRef<any>;
  @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;

  isCalendarOpen = false;
  isCURAOpen = false;
  isModalOpen = false;

  selectedCalendarDate: Date = new Date();
  currentCalendarMonth: Date = new Date();

  private currentSubscriptions: { [key: string]: Subscription } = {};

  // Array declarations
  journeyList = [];
  coachesList = [];
  assuredList = ['assured', 'notassured'];
  statusList = ['Approved', 'Pending'];
  saleTypeList = ['New', 'Upgrade', 'Add-on'];
  customerStatusList = ['Active', 'Non Active', 'Discontinued', 'Banned', 'Late'];
  continuityProfiles = [];
  upgradeProfiles = [];
  referralProfiles = [];
  addonProfiles = [];
  displayedColumns: string[] = ['sno', 'name'];
  selectedDateSchedules: any[] = [];
  appointmentsData = [];

  // Boolean declarations
  isLoading = true;
  hasActiveFilters = false;

  // Numeric declarations
  totalGrossValue: number = 0;
  totalGrossEMI: number = 0;
  totalAssuredValue: number = 0;
  totalAssuredEMI: number = 0;
  totalGrossCancelled: number = 0;
  totalAssuredCancelled: number = 0;
  totalGrossDowngradeToOld: number = 0;
  totalGrossDowngradeToNew: number = 0;
  totalAssuredDowngradeToOld: number = 0;
  totalAssuredDowngradeToNew: number = 0;
  totalMTSSales: number = 0;
  loveFactor: number = 0;
  totalCURASales: number = 0;

  currentAvgToASV;
  currentAvgGSVToASV;

  avgToASVList = [];
  avgGSVToASVList = [];

  approvedGrossSales: number = 0;
  pendingGrossSales: number = 0;

  // Date declarations
  lastMonth: Date;
  currentMonth: Date;
  nextMonth: Date;
  currentDate = new Date();
  startDate;
  endDate;
  monthyear;
  daysInput: number | null = null;

  // Object declarations 
  mapjourneyname: any = {};
  journeyTypeMap: { [key: string]: string } = {};
  modeMap: any = {};
  mapMetaData: any = {};
  mapprofile: any = {};
  mapAppointments: any = {};
  subscriptions: any = {};
  mapCoachAppointments: any = {};
  mapOnboardingAppointments: any = {};
  private loadingStates = {
    journeyData: false,
    salesLeads: false,
    metadata: false,
    journeyProduct: false,
    // customerSupport: false,
    modes: false
  };

  // Map of table keys to display names
  tableDisplayMap = {
    'grossSales': 'Gross Sales',
    'assuredSales': 'Assured Sales',
    'grossCancelledSales': 'Gross Cancelled',
    'assuredCancelledSales': 'Assured Cancelled',
    'grossDowngradeSales': 'Gross Downgrade',
    'assuredDowngradeSales': 'Assured Downgrade',
    'currentMonthEnd': 'Current Month End',
    'nextMonthEnd': 'Next Month End',
    'previousMonthEnd': 'Previous Month End',
    'overallEnd': 'Subscription Ended',
    'regularStatus': 'Regular Status',
    'missedStatus': 'Missed Status',
    'defaultedStatus': 'Defaulted Status',
    'lockedStatus': 'Locked Status',
    'fullyPaidStatus': 'Fully Paid',
    'notAssured': 'Not Assured',
    'toBeOnboarded': 'To Be Onboarded',
    'less7Days': 'Between 7 Days Not Onboarded',
    'more7Days': '7+ Days Not Onboarded',
    'onboarded': 'Onboarded',
    'activeEngagement': 'Active Engagement',
    'allProduct': 'Product not started',
    'less30Product': 'Product Not Started - 30 Days',
    'more30Product': 'Product Not Started - 30+ Days',
    'productInitiated': 'Product Initiated this month',
    'less90Engagement': 'Ideal for 60 - 90 days',
    'less180Engagement': 'Ideal for More than 3 months',
    'more180Engagement': 'Ideal for More than 6 Months'
  };

  participantTableLocations: string[] = [];

  originalData = {

    allParticipants: { count: 0, data: [] },

    // Sales 
    grosssale: { count: 0, data: [] },
    assuredsale: { count: 0, data: [] },
    grossnewsale: { count: 0, data: [] },
    grossupgradesale: { count: 0, data: [] },
    grossaddonsale: { count: 0, data: [] },
    assurednewsale: { count: 0, data: [] },
    assuredupgradesale: { count: 0, data: [] },
    assuredaddonsale: { count: 0, data: [] },
    grosscancelledsale: { count: 0, data: [] },
    assuredcancelledsale: { count: 0, data: [] },
    grossdowngradetooldsale: { count: 0, data: [] },
    grossdowngradetonewsale: { count: 0, data: [] },
    assureddowngradetooldsale: { count: 0, data: [] },
    assureddowngradetonewsale: { count: 0, data: [] },

    // Subscription 
    nextMonth: { count: 0, data: [] },
    lastMonth: { count: 0, data: [] },
    currentMonth: { count: 0, data: [] },
    totalMonth: { count: 0, data: [] },

    // AR Health 
    regularstatus: { count: 0, data: [] },
    missedstatus: { count: 0, data: [] },
    defaultedstatus: { count: 0, data: [] },
    lockedstatus: { count: 0, data: [] },
    fullypaidstatus: { count: 0, data: [] },

    // Onboarding 
    notassured: { count: 0, data: [] },
    all: { count: 0, data: [] },
    last7DaysnotOnboarded: { count: 0, data: [] },
    last15daysnotOnboarded: { count: 0, data: [] },
    onboarded: { count: 0, data: [] },

    // Product Initiation 
    alljourneynotstarted: { count: 0, data: [] },
    lessthan30daysjourneynotstarted: { count: 0, data: [] },
    morethan30daysjourneynotstarted: { count: 0, data: [] },
    currentjourneyinitiated: { count: 0, data: [] },

    // Journey Engagement
    activeEngagement: { count: 0, data: [] },
    less90Engagement: { count: 0, data: [] },
    less180Engagement: { count: 0, data: [] },
    more180Engagement: { count: 0, data: [] },
    ecosystem: { count: 0, data: [] },
    dfu: { count: 0, data: [] },
    discontinued: { count: 0, data: [] },
    overallParticipants: { count: 0, data: [] },

    // Customer Support 
    eventtickets: { count: 0, data: [] },
    eventticketnew: { count: 0, data: [] },
    eventticketresponded: { count: 0, data: [] },
    eventticketsclosed: { count: 0, data: [], avg: 0 },

    journeyticketnew: { count: 0, data: [] },
    journeyticketresponded: { count: 0, data: [] },
    journeytickets: { count: 0, data: [] },
    journeyticketsclosed: { count: 0, data: [], avg: 0 },

    financetickets: { count: 0, data: [] },
    financeticketnew: { count: 0, data: [] },
    financeticketresponded: { count: 0, data: [] },
    financeticketsclosed: { count: 0, data: [], avg: 0 },

    cancellationtickets: { count: 0, data: [] },
    cancellationticketsclosed: { count: 0, data: [], avg: 0 },
    cancellationticketnew: { count: 0, data: [], avg: 0 },
    cancellationticketresponded: { count: 0, data: [], avg: 0 },

    referraltickets: { count: 0, data: [], avg: 0 },
    referralticketnew: { count: 0, data: [], avg: 0 },
    referralticketresponded: { count: 0, data: [], avg: 0 },
    referralticketsclosed: { count: 0, data: [], avg: 0 },

    // CURA 
    continuitySales: { count: 0, data: [] },
    upgradeSales: { count: 0, data: [] },
    referralSales: { count: 0, data: [] },
    addonSales: { count: 0, data: [] },

    // Modes
    'Journey Priority Planning Mode': { count: 0, data: [] },
    'Journey Planning Mode': { count: 0, data: [] },
    'Extended Performance Mode': { count: 0, data: [] },
    'Performance Mode': { count: 0, data: [] },
    'Integration Mode': { count: 0, data: [] },
    'Event Mode': { count: 0, data: [] },
    'Big Mode': { count: 0, data: [] },
    'Installation Event Mode': { count: 0, data: [] },
    'Preparation Mode': { count: 0, data: [] },
    'Exploration Mode': { count: 0, data: [] },

    activeJourneyData: {},

    minimumpaymentdue: { count: 0, data: [] },
    disappear: { count: 0, data: [] },
    minimal: { count: 0, data: [] },
    average: { count: 0, data: [] },
    optimal: { count: 0, data: [] },
    superoptimal: { count: 0, data: [] },
    disappearIn: { count: 0, data: [] },
    minimalIn: { count: 0, data: [] },
    averageIn: { count: 0, data: [] },
    optimalIn: { count: 0, data: [] },
    superoptimalIn: { count: 0, data: [] },
    journeycancelled: { count: 0, data: [] }
  };

  grossSalesSplit = {
    new: 0,
    upgrades: 0,
    addons: 0,
    newEMI: 0,
    upgradesEMI: 0,
    addonsEMI: 0
  }

  assuredSalesSplit = {
    new: 0,
    upgrades: 0,
    addons: 0,
    newEMI: 0,
    upgradesEMI: 0,
    addonsEMI: 0
  }

  // String declarations
  tableSearchText: string = '';
  filteredTableData: any[] = [];
  pickerMode: string = 'month';
  tableType: string = null;
  selectedDateFilter = null;

  salesLeadsColumns: any = [];
  upgradeSalesColumns: any = [];
  subscriptionColumns: any = [];
  customerStatusColumns: any = [];
  notAssuredColumns: any = [];
  assuredColumns: any = [];
  onboardedColumns: any = [];
  productInitiationColumns: any = [];
  productInitiatedColumns: any = [];
  journeyEngagementColumns: any = [];
  customerSupportColumns: any = [];
  overallParticipantsColumns: any = [];

  // Table related properties
  showTable = false;
  currentTableConfig: TableConfig | null = null;

  // Pagination properties
  currentPage: number = 1;
  itemsPerPage: number = 10;
  totalPages: number = 1;
  itemsPerPageOptions: number[] = [5, 10, 20, 50, 100];

  // Sorting properties
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // EcoSystem declarations
  totalATC = {};
  percentageCompleted = [];
  percentageOngoing = 0;
  productCountMap = {}
  totalProductCount = 0;
  totalAdjustmentsCompletedMap = {}
  totalAdjustmentAwareMap = {}
  totalAdjustmentUnAwareMap = {}
  evolutionprogressMap = {}
  evolutionYearWastedMap = {}
  evolutionYearSavedMap = {}
  extendedLifeImpactTotal = 0;
  extendedLifeImpactMap = {}
  totalAdjustmentAware = 0;
  totalAdjustmentUnAware = 0;
  evolutionYearWasted = 0;
  evolutionYearSaved = 0;
  avgAssured: number = 0;
  avgPurchase: number = 0;
  eventClosedAvg: number = 0;
  journeyClosedAvg: number = 0;
  cancellationClosedAvg: number = 0;
  bigClosedAvg: number = 0;
  referralClosedAvg: number = 0;
  unvalidatedATC = [];
  avgAssuredList = [];
  avgPurchaseList = [];


  hideTimeout: any;
  popupData: any = null;

  filterForm: FormGroup;
  private subscriptionHandle = new Subject<void>();

  tableConfigs: { [key: string]: TableConfig } = {};
  dialogConfigs: { [key: string]: Dialog } = {};

  dialogConfig: Dialog | null = null;

  modesList: any = [];
  readonly CATEGORIES = ['Business', 'Career', 'Family', 'Health', 'Personal Genius'];
  readonly AREA_KEYS: (number | 'all')[] = [1, 2, 3, 4, 'all'];

  // ── Controls ──────────────────────────────────────────────────────────────
  numberOfMonths: number = null;
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  isFetchingData: boolean = false;
  dateRangeHint: string = '';

  // ── Data ──────────────────────────────────────────────────────────────────
  monthSummaries: MonthSummary[] = [];
  activeMonthIndex: number = 0;

  // ── Computed getters ──────────────────────────────────────────────────────
  get activeMonthSummary(): MonthSummary | null {
    return this.monthSummaries[this.activeMonthIndex] ?? null;
  }
  get activeProgressedCount(): number {
    return this.activeMonthSummary ? this.getTotalProgressed(this.activeMonthSummary) : 0;
  }
  get activeRegressedCount(): number {
    return this.activeMonthSummary ? this.getTotalRegressed(this.activeMonthSummary) : 0;
  }
  get progressedPercentage(): number {
    return this.activeMonthSummary
      ? Math.round((this.activeProgressedCount / this.activeMonthSummary.totalInterims) * 100) : 0;
  }
  get regressedPercentage(): number {
    return this.activeMonthSummary
      ? Math.round((this.activeRegressedCount / this.activeMonthSummary.totalInterims) * 100) : 0;
  }
  get noChangePercentage(): number {
    return this.activeMonthSummary
      ? Math.round((this.activeMonthSummary.noChangeCount / this.activeMonthSummary.totalInterims) * 100) : 0;
  }
  loggedInProfileid: string = "";

  // ── Dialog state ──────────────────────────────────────────────────────────
  isDialogOpen: boolean = false;
  dialogContext: DialogContext | null = null;
  dialogProfileList: InterimProfile[] = [];
  selectedProfile: InterimProfile | null = null;
  isAllMonthsDialogOpen: boolean = false;
  askAHLoveLetterSummary: any = null;
  journeyCoachTags: any[] = [];
  isTagProfilesDialogOpen: boolean = false;
  selectedTagName: string = '';
  selectedTagProfiles: any[] = [];
  evolutionProgressData: {
    keys: string[];
    bands: {
      label: string;
      range: [number, number];
      profiles: Record<string, { profileId: string; profileName: string; total: number; pct: number }[]>;
    }[];
    totals: Record<string, number>;
  } | null = null;

  // ── EP dialog state ──────────────────────────────
  isEpDialogOpen = false;
  epDialogTitle = '';
  epDialogSubtitle = '';
  epDialogBandIdx = 0;
  epDialogProfiles: { profileId: string; profileName: string; total: number; pct: number }[] = [];

  subscriptionMatrix: {
    journeys: { id: string; label: string }[];
    months: { ym: string; label: string }[];
    cells: Record<string, Record<string, { count: number; docs: any[] }>>;
    monthTotals: Record<string, number>;
    journeyTotals: Record<string, number>;
  } | null = null;

  isSubDialogOpen = false;
  subDialogTitle = '';
  subDialogDocs: any[] = [];

  tempActiveJourney: Record<string, { status: string; profiles: any[] }> = {};
  tempNullStatusProfiles: any[] = [];

  // Toggle state
  activeJourneyFilter: string | null = null; // journey name filter
  activeStatusFilter: 'active' | 'non active' | 'discontinued' | 'null' | 'all' = 'all';
  journeyStatusMatrix: {
    journeyName: string;
    journeyType: string;
    statuses: Record<string, { status: string; profiles: any[] }>;
    total: number;
  }[] = [];

  nullStatusProfiles: any[] = [];

  // Dialog
  isJourneyStatusDialogOpen = false;
  journeyStatusDialogTitle = '';
  journeyStatusDialogProfiles: any[] = [];
  activeStatusTab: string = 'all';
  expandedEpProfile: string | null = null;

  healthKeyData: {
    key: string;
    count: number;       // total adjustments
    pct: number;         // % of total adjustments
    barPct: number;
    profileCount: number; // unique profiles with this dominant key
    color: string;
    tag: string;
    tagBg: string;
    tagColor: string;
  }[] = [];

  healthInsights: { label: string; value: string; sub: string; color: string; }[] = [];
  isHealthDialogOpen = false;
  healthDialogTitle = '';
  healthDialogProfiles: {
    profileId: string;
    profileName: string;
    areas: Record<string, number>;
    total: number;
  }[] = [];
  filterMode: 'months' | 'daterange' | 'queue' = 'months';
  selectedQueueIds: string[] = [];
  queueList: { id: string; name: string }[] = [];
  journeyTypeFilter: 'all' | 'ecosystem' | 'dfu' = 'all';
  readonly arTotal = () =>
    this.originalData['regularstatus'].count +
    this.originalData['missedstatus'].count +
    this.originalData['defaultedstatus'].count +
    this.originalData['lockedstatus'].count +
    this.originalData['fullypaidstatus'].count;

  // Pre-convert keyvalue maps to arrays after data fetch, e.g.:
  productCountList: { key: string, value: any[] }[] = [];
  extendedLifeList: { key: string, value: number }[] = [];
  totalATCList: { key: string, value: any }[] = [];
  evolutionprogressList: { key: string, value: any }[] = [];
  curaActiveTab: number = 0;
  isAskAHDialogOpen = false;
  askAHDialogTitle = '';
  askAHDialogProfiles: any[] = [];
  askAHSourceFilter: 'all' | 'askAH' | 'loveLetter' = 'all';
  askAHResolvedFilter: 'all' | 'resolved' | 'unresolved' = 'all';

  constructor(
    public firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private guard: AuthguardService,
    private fb: FormBuilder,
    private datePipe: DatePipe,
    private dialog: MatDialog,
    private router: Router
  ) {
    this.guard.getRoles().then(roles => {
      this.loggedInProfileid = roles["profile_ref"].id
    })
    this.filterForm = this.fb.group({
      search: ['',],
      purchaseStart: ['',],
      purchaseEnd: ['',],
      journey: ['',],
      journeycoach: ['',],
      assured: ['',],
      status: ['',],
      saleType: ['',],
      customerStatus: ['',]
    })

    this.currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    this.lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    this.nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  }

  async ngOnInit() {
    this.isLoading = true;
    this.setCurrentMonth();

    try {
      getDocs(query(collection(this.firestore, 'users_roles'), where('ahmember', '==', true))).then(snap => {
        this.coachesList = snap.docs
          .map(e => e.data())
          .sort((a: any, b: any) => {
            const nameA = (this.mapprofile[a['profile_ref'].id] || '').toLowerCase();
            const nameB = (this.mapprofile[b['profile_ref'].id] || '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
      });

      this.fetchJourneyCoachTags();

      this.subscriptions['appointments'] = collectionData(query(collection(this.firestore, "appointments"), where("journeycoach", "==", true)), { idField: 'id' }).subscribe((appointments) => {
        let tempArray = [];
        let tempMap = {};

        const appointmentsList = appointments.sort((a,b)=> b['endtime'].toDate() - a['endtime'].toDate());

        // sort
        for (let i = 0; i < appointmentsList.length; i++) {
          const element = appointmentsList[i];
          element["docid"] = element["id"];

          this.mapOnboardingAppointments[element.id] = element['hosts']

          if ([null, undefined].includes(element['onboarding']) && element['cancelled'] == false) {
            if ([null, undefined].includes(tempMap[element['bookedby'].id])) {
              tempMap[element['bookedby'].id] = [];
            }
            tempMap[element['bookedby'].id].push(element);
          }

          tempArray.push(element);

          if (i + 1 == appointmentsList.length) {
            this.appointmentsData = tempArray;
            this.mapCoachAppointments = tempMap;
          }
        }
      })

      await getDocs(collection(this.firestore, 'journey')).then(snap => {
        for (let i = 0; i < snap.docs.length; i++) {
          const element = snap.docs[i].data();
          this.mapjourneyname[element['id']] = element['journey'];
          this.journeyTypeMap[element['id']] = element['type'];
        }
        this.loadingStates.journeyData = true;
        this.checkAllDataLoaded();
      });

      this.fetchData();
      this.loadQueueList();
      this.buildDisplayLists();
      this.guard.getAppointmentMap().then(data => this.mapAppointments = data.map);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    for (const key in this.subscriptions) {
      if (this.subscriptions[key]) {
        this.subscriptions[key].unsubscribe();
      }
    }
  };

  // Function to set current month date 
  setCurrentMonth() {
    const now = new Date();
    this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.monthyear = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
  }

  // Function to toggle date filter 
  toggleDate() {
    this.pickerMode = this.pickerMode == 'month' ? 'range' : 'month';
    this.setCurrentMonth();
    this.fetchData();
  }

  // Update date based on month selection 
  updateDate() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);

    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);

    this.fetchData();
  }

  // Function to toggle date of today and last 7 days 
  onDateFilterClick(filterType: string): void {
    this.selectedDateFilter = filterType;

    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now);

    switch (filterType) {
        case 'days':
       const days = this.daysInput || 1;
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - (days - 1));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        this.pickerMode = null;
        break;
    }

    if (this.selectedDateFilter != null) {
      this.startDate = this.datePipe.transform(startDate, 'dd-MMM-yyyy') || '';
      this.endDate = this.datePipe.transform(endDate, 'dd-MMM-yyyy') || '';
      this.fetchData();
    } else {
      this.pickerMode = 'range'
      this.toggleDate();
    }
  }

  onDaysChange() {
    if (this.daysInput > 60) {
      this.daysInput = 60;
    }
  }
  
  // move to next month 
  forwardMonth() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 12 ? month + 1 : 1;
    year = month == 1 ? year + 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');

    this.fetchData();
  }

  // move to previous month 
  backwardMonth() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 1 ? month - 1 : 12;
    year = month == 12 ? year - 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');

    this.fetchData();
  }

  // Function to check if all data is loaded 
  private checkAllDataLoaded(): void {
    const allLoaded = Object.values(this.loadingStates).every(state => state === true);
    const loadedCount = Object.values(this.loadingStates).filter(s => s === true).length;
    const total = Object.keys(this.loadingStates).length;

    this.cdr.markForCheck();

    if (allLoaded) {
      this.isLoading = false;
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }
  }

  // Function to call all data 
  fetchData() {
    this.ngOnDestroy();
    this.isLoading = true
    this.loadingStates = {
      journeyData: true,
      salesLeads: false,
      metadata: false,
      journeyProduct: false,
      // customerSupport: false,
      modes: false
    }

    this.loadParticipantMetadata();
    this.initializeColumns();
    this.loadDialogConfig();
    this.loadCurrentSalesLeads();
    // this.loadCustomerSupport();
    this.loadModes();
    this.getModes();
  }

  buildDisplayLists() {
    this.productCountList = Object.entries(this.productCountMap)
      .map(([key, value]) => ({ key, value: value as any[] }))
      .sort((a, b) => b.value.length - a.value.length);

    this.extendedLifeList = Object.entries(this.extendedLifeImpactMap)
      .filter(([key]) => this.mapprofile[key] != null)
      .map(([key, value]) => ({ key, value: value as number }))
      .sort((a, b) => b.value - a.value);

    this.totalATCList = Object.entries(this.totalATC)
      .map(([key, value]) => ({ key, value }));

    this.evolutionprogressList = Object.entries(this.evolutionprogressMap)
      .map(([key, value]) => ({ key, value }));
  }

  loadQueueList(): void {
    const queueQuery = query(
      collection(this.firestore, 'queue generation'),
      orderBy('queueenddate', 'desc')
    );

    getDocs(queueQuery).then(snap => {
      this.queueList = [];

      snap.forEach(doc => {
        const name = doc.data()['queuename'] ?? doc.id;
        this.queueList.push({ id: doc.id, name });
      });
    });
  }

  // Function to initialize columns for each column 
  initializeColumns() {
    this.salesLeadsColumns = [
      { key: 'name', header: 'Name', width: '10%', type: 'text' },
      { key: 'phonenumber', header: 'Mobile', width: '5%', type: 'number' },
      { key: 'email', header: 'EMail', width: '5%', type: 'text' },
      { key: 'journeytype', header: 'Type', width: '5%', type: 'text' },
      { key: 'purchasedate', header: 'Purchase Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'waitingperiod', header: 'Waiting Period', width: '5%', type: 'number' },
      { key: 'journey', header: 'Journey', width: '7%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'totalpurchasevalue', header: 'Purchase Value', width: '7%', type: 'currency', prefix: '₹' },
      { key: 'installmentamount', header: 'payment plan', width: '7%', type: 'currency', prefix: '₹' },
      { key: 'presalespersonname', header: 'Pre-Sales Perosn', width: '10%', type: 'text' },
      { key: 'salespersonname', header: 'Sales Person', width: '5%', type: 'text' },
      { key: 'notes', header: 'Sales Notes', width: '35%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'generalnotes', header: 'Notes', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 }
    ]

    //For upgrade sale payment plan details 

    this.upgradeSalesColumns = [
      { key: 'name', header: 'Name', width: '10%', type: 'text' },
      { key: 'phonenumber', header: 'Mobile', width: '5%', type: 'number' },
      { key: 'email', header: 'EMail', width: '5%', type: 'text' },
      { key: 'journeytype', header: 'Type', width: '5%', type: 'text' },
      { key: 'purchasedate', header: 'Purchase Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'waitingperiod', header: 'Waiting Period', width: '5%', type: 'number' },
      { key: 'journey', header: 'Journey', width: '7%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'totalpurchasevalue', header: 'Purchase Value', width: '7%', type: 'currency', prefix: '₹' },
      { key: 'preinstallmentamount', header: 'Previous Payment Plan', width: '7%', type: 'currency', prefix: '₹' },
      { key: 'installmentamount', header: 'Current payment plan', width: '7%', type: 'currency', prefix: '₹' },
      { key: 'installmentdiff', header: 'payment plan diff', width: '7%', type: 'currency', prefix: '₹' },
      { key: 'presalespersonname', header: 'Pre-Sales Perosn', width: '10%', type: 'text' },
      { key: 'salespersonname', header: 'Sales Person', width: '5%', type: 'text' },
      { key: 'notes', header: 'Sales Notes', width: '35%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'generalnotes', header: 'Notes', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 }
    ]


    this.subscriptionColumns = [
      { key: 'name', header: 'Name', width: '15%', type: 'text' },
      { key: 'phonenumber', header: 'Mobile', width: '14%', type: 'number' },
      { key: 'email', header: 'Email', width: '15%', type: 'text' },
      { key: 'activejourney', header: 'Journey', width: '14%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'financialstatus', header: 'Finance', width: '14%', type: 'number' },
      { key: 'purchasedate', header: 'Purchase Date', width: '14%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'subscriptionend', header: 'End Date', width: '14%', type: 'date', format: 'dd-MMM-yyyy' },
    ]

    this.customerStatusColumns = [
      { key: 'name', header: 'Name', width: '15%', type: 'text' },
      { key: 'phonenumber', header: 'Mobile', width: '8%', type: 'number' },
      { key: 'email', header: 'Email', width: '15%', type: 'text' },
      { key: 'activejourney', header: 'Journey', width: '12%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'pp_totalpurchasevalue', header: 'Purchase Value', width: '10%', type: 'currency', prefix: '₹' },
      { key: 'financedata', header: 'Schedule EMI', width: '10%', type: 'currency', prefix: '₹', mapValue: 'computedamount' },
      { key: 'lastpaymentdate', header: 'Last Payment', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'pp_totalpaid', header: 'Paid', width: '10%', type: 'currency', prefix: '₹' },
      { key: 'pp_balance', header: 'Balance', width: '10%', type: 'currency', prefix: '₹' }
    ]

    this.notAssuredColumns = [
      { key: 'profileid', header: 'Name', width: '17%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '16%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'profileid', header: 'EMail', width: '16%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'email' },
      { key: 'journeyref', header: 'Journey', width: '17%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'purchasedate', header: 'Purchase Date', width: '17%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'pp_totalpurchasevalue', header: 'Total Purchase Value', width: '6%', type: 'number' },
      { key: 'pp_totalpaid', header: 'Total Paid', width: '6%', type: 'number' },
      { key: 'salesperson', header: 'Sales Person', width: '17%', type: 'text' },
      { key: 'salenotes', header: 'Sale Notes', width: '17%', type: 'text', substringStart: 0, substringEnd: 20 },
    ]

    this.assuredColumns = [
      { key: 'profileid', header: 'Name', width: '6%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '4%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'profileid', header: 'EMail', width: '5%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'email' },
      { key: 'journeyref', header: 'Journey', width: '7%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'purchasedate', header: 'Purchase Date', width: '6%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'paymentplanassureddate', header: 'ENACH Date', width: '6%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'delayeddays', header: 'Delayed Days', width: '6%', type: 'number' },
      { key: 'salesperson', header: 'Sales Person', width: '6%', type: 'text' },
      { key: 'schedule', header: 'Schedule', width: '15%', type: 'text' },
      { key: 'schedulefor', header: 'Schedule For', width: '10%', type: 'text' },
      { key: 'action', header: 'Action', width: '10%', type: 'text' },
      { key: 'paymentplan', header: 'Payment Plan', width: '6%', type: 'text' },
      { key: 'journeyplan', header: 'Journey Plan', width: '15%', type: 'text' },
      { key: 'salenotes', header: 'Sale Notes', width: '18%', type: 'text', substringStart: 0, substringEnd: 20 },
      { key: 'generalnotes', header: 'Notes', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
    ]

    this.onboardedColumns = [
      { key: 'profileid', header: 'Name', width: '12%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '16%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'profileid', header: 'EMail', width: '5%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'email' },
      { key: 'journeyref', header: 'Journey', width: '15%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'purchasedate', header: 'Purchase Date', width: '17%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'onboardedtime', header: 'Onboarded Date', width: '17%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'onboardedby', header: 'Onboarded By', width: '17%', type: 'mapped', mapData: this.mapMetaData, mapKey: '[0].id', mapValue: 'name' },
      { key: 'salesperson', header: 'Sales Person', width: '17%', type: 'text' },
      { key: 'paymentplan', header: 'Journey Plan', width: '6%', type: 'text' },
      { key: 'salenotes', header: 'Sale Notes', width: '25%', type: 'text', substringStart: 0, substringEnd: 20 },
      { key: 'generalnotes', header: 'Notes', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 }
    ]

    this.productInitiationColumns = [
      { key: 'profileid', header: 'Name', width: '14%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '14%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'journeyref', header: 'Journey', width: '10%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'purchasedate', header: 'Purchase Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'profileid', header: 'Finance', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'financialstatus' },
      { key: 'onboardedtime', header: 'Onboarded Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'salenotes', header: 'Sale Notes', width: '28%', type: 'text', substringStart: 0, substringEnd: 20 },
    ]

    this.productInitiatedColumns = [
      { key: 'profileid', header: 'Name', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'profileid', header: 'EMail', width: '5%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'email' },
      { key: 'journey', header: 'Journey', width: '17%', type: 'text' },
      { key: 'initiatedtime', header: 'Initiated Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'profileid', header: 'Finance', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'financialstatus' },
      { key: 'subscriptionstart', header: 'Start Date', width: '14%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'subscriptionend', header: 'End Date', width: '14%', type: 'date', format: 'dd-MMM-yyyy' },
    ]

    this.journeyEngagementColumns = [
      { key: 'name', header: 'Name', width: '12%', type: 'text' },
      { key: 'phonenumber', header: 'Mobile', width: '12%', type: 'number' },
      { key: 'email', header: 'EMail', width: '15%', type: 'text' },
      { key: 'journey', header: 'Journey', width: '15%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'customerstatus', header: 'Customer Status', width: '10%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'purchasedate', header: 'Purchase Date', width: '15%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'financialstatus', header: 'Finance', width: '10%', type: 'number' },
      { key: 'lasttouchpoint', header: 'Last Touch Point', width: '11%', type: 'date', format: 'dd-MMM-yyyy', mapValue: 'activitydate' },
    ]

    this.customerSupportColumns = [
      { key: 'name', header: 'Name', width: '10%', type: 'text' },
      { key: 'mobile', header: 'Mobile', width: '10%', type: 'number' },
      { key: 'email', header: 'EMail', width: '10%', type: 'text' },
      { key: 'category', header: 'Category', width: '10%', type: 'text' },
      { key: 'reporteddate', header: 'Reported Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'issue', header: 'Issue', width: '50%', type: 'text' },
    ]

    this.overallParticipantsColumns = [
      { key: 'name', header: 'Name', width: '7%', type: 'text' },
      { key: 'email', header: 'Email', width: '8%', type: 'text' },
      { key: 'phonenumber', header: 'Mobile', width: '5%', type: 'number' },
      { key: 'journey', header: 'Journey', width: '10%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'customerstatus', header: 'Customer Status', width: '5%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'purchasedate', header: 'Purchase Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'pp_totalpurchasevalue', header: 'Purchase Value', width: '5%', type: 'currency', prefix: '₹' },
      { key: 'pp_totalpaid', header: 'Amount Paid', width: '5%', type: 'currency', prefix: '₹' },
      { key: 'balance', header: 'Balance', width: '5%', type: 'currency', prefix: '₹' },
      { key: 'journeyplan', header: 'Journey Plan', width: '15%', type: 'text' },
      { key: 'markcoach', header: 'Mark JC Complete', width: '10%', type: 'text' },
      { key: 'profiletags', header: 'Tag', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'generalnotes', header: 'Notes', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'menubutton', header: '+', width: '5%', type: 'text' },
    ];

    this.loadTableConfig();
  }

  // Function to load table config 
  loadTableConfig() {
    this.tableConfigs = {
      grossSales: {
        title: 'Gross Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grosssale',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status', 'saleType']
      },
      assuredSales: {
        title: 'Assured Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assuredsale',
        filters: ['search', 'purchasedate', 'journey', 'saleType']
      },
      grossCancelledSales: {
        title: 'Gross Cancelled Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grosscancelledsale',
        filters: ['search', 'purchasedate', 'journey']
      },

      assuredCancelledSales: {
        title: 'Assured Cancelled Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assuredcancelledsale',
        filters: ['search', 'purchasedate', 'journey']
      },
      grossDowngradeToOldSales: {
        title: 'Gross Downgrade To Old Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossdowngradetooldsale',
        filters: ['search', 'purchasedate', 'journey']
      },
      grossDowngradeToNewSales: {
        title: 'Gross Downgrade To New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossdowngradetonewsale',
        filters: ['search', 'purchasedate', 'journey']
      },
      assuredDowngradeToOldSales: {
        title: 'Assured Downgrade To Old Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assureddowngradetooldsale',
        filters: ['search', 'purchasedate', 'journey']
      },
      assuredDowngradeToNewSales: {
        title: 'Assured Downgrade To New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assureddowngradetonewsale',
        filters: ['search', 'purchasedate', 'journey']
      },
      grossNewSales: {
        title: 'Gross New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossnewsale',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status']
      },
      grossUpgradeSales: {
        title: 'Gross Upgrade Sales',
        columns: this.upgradeSalesColumns,
        data: [],
        dataKey: 'grossupgradesale',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status']
      },
      grossAddonSales: {
        title: 'Gross Add-on Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossaddonsale',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status']
      },
      assuredNewSales: {
        title: 'Assured New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assurednewsale',
        filters: ['search', 'purchasedate', 'journey']
      },
      assuredUpgradeSales: {
        title: 'Assured Upgrade Sales',
        columns: this.upgradeSalesColumns,
        data: [],
        dataKey: 'assuredupgradesale',
        filters: ['search', 'purchasedate', 'journey']
      },
      assuredAddonSales: {
        title: 'Assured Add-on Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assuredaddonsale',
        filters: ['search', 'purchasedate', 'journey']
      },
      currentMonthEnd: {
        title: 'Subscription End - Current Month',
        columns: this.subscriptionColumns,
        data: [],
        dataKey: 'currentMonth',
        filters: ['search', 'purchasedate', 'journey']
      },
      nextMonthEnd: {
        title: 'Subscription End - Next Month',
        columns: this.subscriptionColumns,
        data: [],
        dataKey: 'nextMonth',
        filters: ['search', 'purchasedate', 'journey']
      },
      previousMonthEnd: {
        title: 'Subscription End - Previous Month',
        columns: this.subscriptionColumns,
        data: [],
        dataKey: 'lastMonth',
        filters: ['search', 'purchasedate', 'journey']
      },
      overallEnd: {
        title: 'Subscription End - Total',
        columns: this.subscriptionColumns,
        data: [],
        dataKey: 'totalMonth',
        filters: ['search', 'purchasedate', 'journey']
      },
      regularStatus: {
        title: 'Customer Status - Regular',
        columns: this.customerStatusColumns,
        data: [],
        dataKey: 'regularstatus',
        filters: ['search']
      },
      missedStatus: {
        title: 'Customer Status - Missed',
        columns: this.customerStatusColumns,
        data: [],
        dataKey: 'missedstatus',
        filters: ['search']
      },
      defaultedStatus: {
        title: 'Customer Status - Defaulted',
        columns: this.customerStatusColumns,
        data: [],
        dataKey: 'defaultedstatus',
        filters: ['search']
      },
      lockedStatus: {
        title: 'Customer Status - Locked',
        columns: this.customerStatusColumns,
        data: [],
        dataKey: 'lockedstatus',
        filters: ['search']
      },
      fullyPaidStatus: {
        title: 'Customer Status - Fully Paid',
        columns: this.customerStatusColumns,
        data: [],
        dataKey: 'fullypaidstatus',
        filters: ['search']
      },
      notAssured: {
        title: 'Not Assured',
        columns: this.notAssuredColumns,
        data: [],
        dataKey: 'notassured',
        filters: ['search', 'purchasedate', 'journey']
      },
      toBeOnboarded: {
        title: 'To Be Onboared - Total',
        columns: this.assuredColumns,
        data: [],
        dataKey: 'all',
        filters: ['search', 'purchasedate', 'journey', 'journeycoach']
      },
      more7Days: {
        title: 'To Be Onboared - 7+ Days',
        columns: this.assuredColumns,
        data: [],
        dataKey: 'last15daysnotOnboarded',
        filters: ['search', 'purchasedate', 'journey', 'journeycoach']
      },
      less7Days: {
        title: 'To Be Onboared - 7 Days',
        columns: this.assuredColumns,
        data: [],
        dataKey: 'last7DaysnotOnboarded',
        filters: ['search', 'purchasedate', 'journey', 'journeycoach']
      },
      onboarded: {
        title: 'Onboared',
        columns: this.onboardedColumns,
        data: [],
        dataKey: 'onboarded',
        filters: ['search', 'purchasedate', 'journey', 'journeycoach']
      },
      activeEngagement: {
        title: 'Active Engagement',
        columns: this.journeyEngagementColumns,
        data: [],
        dataKey: 'activeEngagement',
        filters: ['search']
      },
      ecosystem: {
        title: 'Ecosystem',
        columns: this.journeyEngagementColumns,
        data: [],
        dataKey: 'ecosystem',
        filters: ['search', 'journey', 'customerStatus']
      },
      dfu: {
        title: 'DFU',
        columns: this.journeyEngagementColumns,
        data: [],
        dataKey: 'dfu',
        filters: ['search', 'journey', 'customerStatus']
      },
      discontinued: {
        title: 'Discontinued',
        columns: this.journeyEngagementColumns,
        data: [],
        dataKey: 'discontinued',
        filters: ['search', 'journey']
      },
      less90Engagement: {
        title: 'Ideal for 60 - 90 days',
        columns: this.journeyEngagementColumns,
        data: [],
        dataKey: 'less90Engagement',
        filters: ['search']
      },
      less180Engagement: {
        title: 'Ideal for More than 3 months',
        columns: this.journeyEngagementColumns,
        data: [],
        dataKey: 'less180Engagement',
        filters: ['search']
      },
      more180Engagement: {
        title: 'Ideal for More than 6 Months',
        columns: this.journeyEngagementColumns,
        data: [],
        dataKey: 'more180Engagement',
        filters: ['search']
      },
      allProduct: {
        title: 'Product Not Started',
        columns: this.productInitiationColumns,
        data: [],
        dataKey: 'alljourneynotstarted',
        filters: ['search']
      },
      less30Product: {
        title: 'Product Not Started - 30 Days',
        columns: this.productInitiationColumns,
        data: [],
        dataKey: 'lessthan30daysjourneynotstarted',
        filters: ['search']
      },
      more30Product: {
        title: 'Product Not Started - 30+ Days',
        columns: this.productInitiationColumns,
        data: [],
        dataKey: 'morethan30daysjourneynotstarted',
        filters: ['search']
      },
      productInitiated: {
        title: 'Product Initiated',
        columns: this.productInitiatedColumns,
        data: [],
        dataKey: 'currentjourneyinitiated',
        filters: ['search']
      },
      overallParticipants: {
        title: 'Overall Participants',
        columns: this.overallParticipantsColumns,
        data: [],
        dataKey: 'allParticipants',
        filters: ['search', 'journey', 'customerStatus']
      },
    }
  }

  loadDialogConfig() {
    const avgToASVColumn: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'journey', header: 'Journey', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'purchasedate', header: 'Purchase Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'currentdate', header: 'Current Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'daysdiff', header: 'Days', type: 'number' },
    ];

    const avgGSVToASVColumn: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'journey', header: 'Journey', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'purchasedate', header: 'Purchase Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'paymentplanassureddate', header: 'Assured Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'daysdiff', header: 'Days', type: 'number' },
    ];

    const avgAssuredColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'journeyref', header: 'Journey', type: 'custom', mapper: (ref) => this.mapjourneyname[ref['id']] ?? '-' },
      { key: 'onboardedtime', header: 'OnBoarded Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'paymentplanassureddate', header: 'Assured Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'daysdiff', header: 'Days', type: 'number' },
    ];

    const avgPurchasedColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'journeyref', header: 'Journey', type: 'custom', mapper: (ref) => this.mapjourneyname[ref['id']] ?? '-' },
      { key: 'onboardedtime', header: 'OnBoarded Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'purchasedate', header: 'Purchase Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'daysdiff', header: 'Days', type: 'number' },
    ]

    const onboardingScheduledColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'journeyref', header: 'Journey', type: 'custom', mapper: (ref) => this.mapjourneyname[ref?.['id']] ?? '-' },
      { key: 'onboardingscheduled', header: 'Scheduled Date', type: 'text' },
    ]

    const coachingScheduledColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'journeyref', header: 'Journey', type: 'custom', mapper: (ref) => this.mapjourneyname[ref?.['id']] ?? '-' },
      { key: 'coachingScheduled', header: 'Scheduled Date', type: 'text' },
    ]
    
    const modesColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
    ];

    this.dialogConfigs = {
      avgToASV: {
        title: 'Average Days To Become ASV',
        dialog: { width: '70%' },
        avg: 0,
        table: {
          columns: avgToASVColumn,
          data: [],
          dataKey: 'avgtoasv',
        },
      },
      avgGSVToASV: {
        title: 'Average Days GSV To ASV',
        dialog: { width: '70%' },
        avg: 0,
        table: {
          columns: avgGSVToASVColumn,
          data: [],
          dataKey: 'avggsvtoasv',
        }
      },
      avgAssured: {
        title: 'Average Assured',
        dialog: { width: '70%' },
        avg: 0,
        table: {
          columns: avgAssuredColumns,
          data: [],
          dataKey: 'avgassured',
        }
      },
      avgPurchase: {
        title: 'Average Purchased',
        dialog: { width: '70%' },
        avg: 0,
        table: {
          columns: avgPurchasedColumns,
          data: [],
          dataKey: 'avgpurchased',
        }
      },
      onboardingScheduled: {
        title: 'Onboarding Call Scheduled',
        dialog: { width: '70%' },
        table: {
          columns: onboardingScheduledColumns,
          data: [],
          dataKey: 'onboardingScheduled',
        }
      },
      coachingScheduled: {
        title: 'Journey coaching Call Scheduled',
        dialog: { width: '70%' },
        table: {
          columns:coachingScheduledColumns,
          data: [],
          dataKey: 'coachingScheduled',
        }
      },
      modes: {
        title: 'Mode',
        dialog: { width: '70%' },
        table: {
          columns: modesColumns,
          data: [],
          dataKey: 'modes',
        }
      }
    }
  }

  // Function to load sales leads data for current month 
  loadCurrentSalesLeads() {
    const currentMonthStart = new Date(this.startDate);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthEnd = new Date(this.endDate);
    currentMonthEnd.setHours(23, 59, 59, 999);

    // currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
    // currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

    let startdate = Timestamp.fromDate(currentMonthStart).toDate();
    let enddate = Timestamp.fromDate(currentMonthEnd).toDate();

    const queryValue = or(and(where("purchasedate", ">=", startdate), where("purchasedate", "<=", enddate)), and(where("date", ">=", startdate), where("date", "<=", enddate)))
    this.subscriptions['salesleads'] = collectionData(query(collection(this.firestore, "salesleads"), queryValue)).subscribe(async (salesleads) => {
      if (salesleads.length != 0) {

        let grossData = [];
        let assuredData = [];
        let grossNewData = [];
        let grossUpgradeData = [];
        let grossAddonData = [];
        let assuredNewData = [];
        let assuredUpgradeData = [];
        let assuredAddonData = [];
        let cancelledData = [];
        let downgradeData = [];
        let grossCancelledData = [];
        let assuredCancelledData = [];
        let grossDowngradeToOldData = [];
        let grossDowngradeToNewData = [];
        let assuredDowngradeToOldData = [];
        let assuredDowngradeToNewData = [];

        let grossNew = 0;
        let grossUpgrade = 0;
        let grossAddons = 0;

        let grossNewEMI = 0;
        let grossUpgradeEMI = 0;
        let grossAddonEMI = 0;


        let assuredNew = 0;
        let assuredUpgrade = 0;
        let assuredAddons = 0;

        let assuredNewEMI = 0;
        let assuredUpgradeEMI = 0;
        let assuredAddonEMI = 0;

        let tempContinuitySales = [];
        let tempUpgradeSales = [];
        let tempReferralSales = [];
        let tempAddonSales = [];

        let avgToASVList = [];
        let avgGSVToASVList = [];

        let salesData = salesleads.filter((e) => !(e['journey'] === 'RXvsMYoK0g4SstvDDURZ' && e['email']?.toLowerCase().includes('soexcellence.com')));

        try {
          for (let i = 0; i < salesData.length; i++) {
            const salesLeadsData = salesData[i];

            // if (salesLeadsData['journey'] === 'RXvsMYoK0g4SstvDDURZ' && salesLeadsData['email']?.toLowerCase().includes('soexcellence.com')) {
            //   continue; 
            // }

            salesLeadsData['generalnotes'] = [null, undefined, ''].includes(this.mapMetaData[salesLeadsData['profileid']]) ? [] : (this.mapMetaData[salesLeadsData['profileid']]['generalnotes'] ?? [])
            if (salesLeadsData['journey'] != 'InLXMl7OBAqlDTZcXwK0' && salesLeadsData['status']?.toLowerCase() != 'rejected') {
              // if (['new', 'upgrade', 'addons'].includes(salesLeadsData['journeytype']) && salesLeadsData['purchasedate']?.toDate() >= startdate && salesLeadsData['purchasedate']?.toDate() <= enddate) {
              if (salesLeadsData['purchasedate']?.toDate() >= startdate && salesLeadsData['purchasedate']?.toDate() <= enddate) {
                const grossSaleData = salesLeadsData;
                grossSaleData['waitingperiod'] = this.calculateGrossWaitingPeriod(grossSaleData['purchasedate']?.toDate())
                grossData.push(grossSaleData);

                if (![null, undefined, ""].includes(salesLeadsData['status']) && salesLeadsData['status']?.toLowerCase() == 'approved') {
                  if (salesLeadsData['journeytype'] == 'new') {
                    if (![null, undefined, ""].includes(salesLeadsData['referral']) && salesLeadsData['referral']) {
                      tempReferralSales.push(salesLeadsData);
                    }
                    grossNewData.push(salesLeadsData);
                    grossNew++;
                    grossNewEMI += salesLeadsData['installmentamount'] || 0;
                  } else if (salesLeadsData['journeytype'] == 'upgrade') {
                    if (this.mapjourneyname[salesLeadsData['journey']].toLowerCase().includes('continuity')) {
                      tempContinuitySales.push(salesLeadsData);
                    } else {
                      tempUpgradeSales.push(salesLeadsData);
                    }

                     const toEMI = salesLeadsData['installmentamount'] || 0;
                    const upgradeFromDocId = salesLeadsData['upgradefromdocid']?.id ?? salesLeadsData['upgradefromdocid'];

                    if (![null, undefined, ''].includes(upgradeFromDocId)) {
                      try {
                        const fromDocSnap = await getDoc(doc(this.firestore, 'salesleads', upgradeFromDocId));
                        if (fromDocSnap.exists()) {
                          const fromEMI = fromDocSnap.data()['installmentamount'] || 0;
                          const emiDiff = toEMI - fromEMI;

                          salesLeadsData['preinstallmentamount'] = fromEMI;
                          salesLeadsData['installmentamount'] = toEMI;
                          salesLeadsData['installmentdiff'] = emiDiff;
                          grossUpgradeEMI += emiDiff;
                        } else {
                          salesLeadsData['preinstallmentamount'] = 0;
                          salesLeadsData['installmentamount'] = toEMI;
                          salesLeadsData['installmentdiff'] = toEMI;
                          grossUpgradeEMI += toEMI;
                        }
                      } catch (error) {
                        console.log("Error in sales", error);
                        salesLeadsData['preinstallmentamount'] = 0;
                        salesLeadsData['installmentamount'] = toEMI;
                        salesLeadsData['installmentdiff'] = toEMI;
                        grossUpgradeEMI += toEMI;
                      }
                    } else {
                      salesLeadsData['preinstallmentamount'] = 0;
                      salesLeadsData['installmentamount'] = toEMI;
                      salesLeadsData['installmentdiff'] = toEMI;
                      grossUpgradeEMI += toEMI;
                    }

                    grossUpgradeData.push(salesLeadsData);
                    grossUpgrade++;

                  } else if (salesLeadsData['journeytype'] == 'addons') {
                    grossAddons++;
                    grossAddonData.push(salesLeadsData);
                    tempAddonSales.push(salesLeadsData);
                    grossAddonEMI += salesLeadsData['installmentamount'] || 0;
                  }
                }

                if (![null, undefined, ""].includes(salesLeadsData['paymentplan'])) {
                  const assuredSaleData = salesLeadsData;
                  assuredSaleData['waitingperiod'] = this.calculateAssuredWaitingPeriod(assuredSaleData['purchasedate']?.toDate(), assuredSaleData['paymentplanassureddate']?.toDate())
                  assuredData.push(assuredSaleData);

                  if (salesLeadsData['journeytype'] == 'new') {
                    assuredNewData.push(assuredSaleData);
                    assuredNew++;
                    assuredNewEMI += assuredSaleData['installmentamount'] || 0;
                  } else if (salesLeadsData['journeytype'] == 'upgrade') {
                    assuredUpgradeData.push(assuredSaleData);
                    assuredUpgrade++;
                    assuredUpgradeEMI += assuredSaleData['installmentdiff'] || 0;
                  } else if (salesLeadsData['journeytype'] == 'addons') {
                    assuredAddonData.push(assuredSaleData);
                    assuredAddons++;
                    assuredAddonEMI += assuredSaleData['installmentamount'] || 0;
                  }
                }
              }

              if (['cancelled', 'downgrade'].includes(salesLeadsData['journeytype']) && salesLeadsData['date']?.toDate() >= startdate && salesLeadsData['date']?.toDate() <= enddate && salesLeadsData['status']?.toLowerCase() == 'approved') {
                if (salesLeadsData['journeytype'] == 'cancelled') {
                  cancelledData.push(salesLeadsData);
                } else if (salesLeadsData['journeytype'] == 'downgrade') {
                  downgradeData.push(salesLeadsData);
                }
              }
            }
            if (i + 1 == salesData.length) {
              this.originalData['grosssale'].data = grossData;
              this.originalData['grosssale'].count = grossData.length;
              this.approvedGrossSales = grossData.filter(sale => sale['status'] && sale['status'].toLowerCase() === 'approved').length;
              this.pendingGrossSales = grossData.filter(sale => !sale['status'] || sale['status'] === null || sale['status'] === undefined || sale['status'] === '').length;

              // Love Factor Calculation 
              this.originalData['continuitySales'].data = tempContinuitySales;
              this.originalData['continuitySales'].count = tempContinuitySales.length;

              this.originalData['upgradeSales'].data = tempUpgradeSales;
              this.originalData['upgradeSales'].count = tempUpgradeSales.length;

              this.originalData['referralSales'].data = tempReferralSales;
              this.originalData['referralSales'].count = tempReferralSales.length;

              this.originalData['addonSales'].data = tempAddonSales;
              this.originalData['addonSales'].count = tempAddonSales.length;

              this.originalData['grossnewsale'].data = grossNewData;
              this.originalData['grossnewsale'].count = grossNewData.length;

              this.originalData['grossupgradesale'].data = grossUpgradeData;
              this.originalData['grossupgradesale'].count = grossUpgradeData.length;

              this.originalData['grossaddonsale'].data = grossAddonData;
              this.originalData['grossaddonsale'].count = grossAddonData.length;

              this.originalData['assurednewsale'].data = assuredNewData;
              this.originalData['assurednewsale'].count = assuredNewData.length;

              this.originalData['assuredupgradesale'].data = assuredUpgradeData;
              this.originalData['assuredupgradesale'].count = assuredUpgradeData.length;

              this.originalData['assuredaddonsale'].data = assuredAddonData;
              this.originalData['assuredaddonsale'].count = assuredAddonData.length;

              this.totalCURASales = tempContinuitySales.length + tempUpgradeSales.length + tempReferralSales.length + tempAddonSales.length;
              this.totalMTSSales = this.Math.abs(this.approvedGrossSales - this.totalCURASales);
              this.loveFactor = this.totalCURASales / this.totalMTSSales;

              this.totalGrossValue = grossData.reduce((sum, sale) => sum + (sale['totalpurchasevalue'] || 0), 0);
              this.totalGrossEMI = grossData
                .filter(sale =>
                  ![null, undefined, ''].includes(sale['status']) &&
                  sale['status']?.toLowerCase() == 'approved' &&
                  ['new', 'upgrade', 'addons'].includes(sale['journeytype'])
                )
                .reduce((sum, sale) => {
                  if (sale['journeytype'] == 'upgrade') {
                    return sum + (sale['installmentdiff'] || 0);
                  } else {
                    return sum + (sale['installmentamount'] || 0);
                  }
                }, 0);
              let avg1 = grossData.reduce((sum, entry) => {
                const daysDiff = Math.abs(this.calculateDaysAgo(entry['purchasedate']?.toDate(), new Date()));
                avgToASVList.push({ ...entry, daysdiff: daysDiff, currentdate: new Date().toString() })
                return sum + daysDiff
              }, 0);
              this.currentAvgToASV = grossData.length > 0 ? Number((avg1 / grossData.length).toFixed(2)) : 0;
              this.avgToASVList = avgToASVList

              this.grossSalesSplit = {
                new: grossNew,
                upgrades: grossUpgrade,
                addons: grossAddons,
                newEMI: grossNewEMI,
                upgradesEMI: grossUpgradeEMI,
                addonsEMI: grossAddonEMI
              }

              this.originalData['assuredsale'].data = assuredData;
              this.originalData['assuredsale'].count = assuredData.length;
              this.totalAssuredValue = assuredData.reduce((sum, sale) => sum + (sale['totalpurchasevalue'] || 0), 0);
              this.totalAssuredEMI = assuredData
                .filter(sale =>
                  ['new', 'upgrade', 'addons'].includes(sale['journeytype'])
                )
                .reduce((sum, sale) => {
                  if (sale['journeytype'] == 'upgrade') {
                    return sum + (sale['installmentdiff'] || 0);
                  } else {
                    return sum + (sale['installmentamount'] || 0);
                  }
                }, 0);
              let avg2 = assuredData.reduce((sum, entry) => {
                const daysDiff = Math.abs(this.calculateDaysAgo(entry['purchasedate']?.toDate(), entry['paymentplanassureddate']?.toDate()))
                avgGSVToASVList.push({ ...entry, daysdiff: daysDiff })
                return sum + daysDiff
              }, 0);
              this.currentAvgGSVToASV = assuredData.length > 0 ? Number((avg2 / assuredData.length).toFixed(2)) : 0;
              this.avgGSVToASVList = avgGSVToASVList;

              this.assuredSalesSplit = {
                new: assuredNew,
                upgrades: assuredUpgrade,
                addons: assuredAddons,
                newEMI: assuredNewEMI,
                upgradesEMI: assuredUpgradeEMI,
                addonsEMI: assuredAddonEMI

              }

              const cancelledValues = await Promise.all(
                cancelledData.map(async (sale) => {
                  if (sale['canceldocid']) {
                    const cancelRef = doc(this.firestore, 'salesleads', sale['canceldocid']);
                    const cancelSnap = await getDoc(cancelRef);

                    if (cancelSnap.exists()) {
                      let data = cancelSnap.data();
                      data['balanceamount'] = (data['totalpurchasevalue'] ?? 0) - (sale['totalpurchasevalue'] ?? 0)
                      grossCancelledData.push(data);
                      if (![null, undefined, ''].includes(data['paymentplan'])) {
                        assuredCancelledData.push(data);
                      }

                      return data['totalpurchasevalue'] || 0;
                    }
                  }
                  return 0;
                })
              );

              const downgradeValues = await Promise.all(
                downgradeData.map(async (sale) => {
                  if (!sale['downgradefromdocid']) return 0;

                  const downgradeRef = doc(this.firestore, 'salesleads', sale['downgradefromdocid']);
                  const downgradeSnap = await getDoc(downgradeRef);

                  if (downgradeSnap.exists()) {
                    const data = downgradeSnap.data();
                    if (sale['downgradetonewpurchase']
                      && sale['purchasedate']?.toDate() >= startdate
                      && sale['purchasedate']?.toDate() <= enddate
                    ) {
                      grossDowngradeToNewData.push(data)
                    } else {
                      grossDowngradeToOldData.push(data)
                    }
                    if (![null, undefined, ''].includes(data['paymentplan'])) {
                      if (sale['downgradetonewpurchase']
                        && sale['purchasedate']?.toDate() >= startdate
                        && sale['purchasedate']?.toDate() <= enddate
                      ) {
                        assuredDowngradeToNewData.push(data)
                      } else {
                        assuredDowngradeToOldData.push(data)
                      }
                    }
                    data['totalpurchasevalue'] || 0;
                  }
                  return 0;
                })
              );

              this.totalGrossCancelled = grossCancelledData.reduce((sum, item) => sum + (item['balanceamount'] || 0), 0);

              this.totalAssuredCancelled = assuredCancelledData.reduce(
                (sum, item) => sum + (item['balanceamount'] || 0),
                0
              );

              this.totalGrossDowngradeToOld = grossDowngradeToOldData.reduce(
                (sum, item) => sum + (item['totalpurchasevalue'] || 0),
                0
              );

              this.totalGrossDowngradeToNew = grossDowngradeToNewData.reduce(
                (sum, item) => sum + (item['totalpurchasevalue'] || 0),
                0
              );


              this.totalAssuredDowngradeToNew = assuredDowngradeToNewData.reduce(
                (sum, item) => sum + (item['totalpurchasevalue'] || 0),
                0
              );

              this.originalData['grosscancelledsale'].data = grossCancelledData;
              this.originalData['grosscancelledsale'].count = grossCancelledData.length;
              this.originalData['assuredcancelledsale'].data = assuredCancelledData;
              this.originalData['assuredcancelledsale'].count = assuredCancelledData.length;

              this.originalData['grossdowngradetooldsale'].data = grossDowngradeToOldData;
              this.originalData['grossdowngradetonewsale'].data = grossDowngradeToNewData;

              this.originalData['grossdowngradetooldsale'].count = grossDowngradeToOldData.length;
              this.originalData['grossdowngradetonewsale'].count = grossDowngradeToNewData.length;

              this.originalData['assureddowngradetooldsale'].data = assuredDowngradeToOldData;
              this.originalData['assureddowngradetonewsale'].data = assuredDowngradeToNewData;

              this.originalData['assureddowngradetooldsale'].count = assuredDowngradeToOldData.length;
              this.originalData['assureddowngradetonewsale'].count = assuredDowngradeToNewData.length;

    
              this.updateTableDataIfOpen(this.tableType);
              this.loadingStates.salesLeads = true;
              this.checkAllDataLoaded();
              this.cdr.detectChanges();

            }
          }
        } catch (error: any) {
          this.loadingStates.salesLeads = true;
          this.checkAllDataLoaded();
        }
      } else {
        this.loadingStates.salesLeads = true;
        this.checkAllDataLoaded();
      }
    })
  }

  // Function to fetch data from participant metadata 
  loadParticipantMetadata() {
    this.subscriptions['metadata'] = collectionData(query(collection(this.firestore, "participant metadata"), orderBy("name", "asc"))).subscribe((metadata) => {
      // Subscription declarations 
      let currentMonthEnd = [];
      let lastMonthEnd = [];
      let nextMonthEnd = [];
      let totalMonthEnd = [];

      //Mode map declarations
      let tempModeMap = {};

      // AR Health declarations 
      let fullyPaid = [];
      let regular = [];
      let defaulted = [];
      let missed = [];
      let locked = [];

      let allParticipantsList = [];
      let ecosystemMap = [];
      let dfuMap = [];
      let discontinuedArray = [];

      const mapCustomerStatusVariable: Record<string, string> = {
        "active": 'activejourney',
        "non active": 'lastcompletedjourney',
        'discontinued': 'lastsubscribedjourney'
      };

      let tempActiveJourney: Record<string, Record<string, { status: string; profiles: any[] }>> = {};
      let tempNullStatusProfiles: any[] = [];

      // Journey Engagement declarations 
      let journeyMap = {
        1: [],
        2: [],
        3: [],
        4: []
      }

      let currentMonth = new Date().getMonth() + 1;
      let currentYear = new Date().getFullYear();

      if (metadata.length != 0) {
        try {
          for (let i = 0; i < metadata.length; i++) {
            const metaData = metadata[i];

            const purchaseValue = metaData['pp_totalpurchasevalue'] || 0;
            const amountPaid = metaData['pp_totalpaid'] || 0;
            const customerStatus = metaData['customerstatus'] || null;

            metaData['balance'] = purchaseValue - amountPaid;

            if (![null, undefined, ""].includes(metaData['profileid'])) {
              allParticipantsList.push(metaData);
            }

            if (![null, undefined].includes(metaData['participantmode'])) {
              // console.log(metaData['profileid']);
              if ([null, undefined].includes(tempModeMap[metaData['participantmode']])) {
                tempModeMap[metaData['participantmode']] = [metaData['profileid']];
              } else {
                tempModeMap[metaData['participantmode']].push(metaData['profileid']);
              }
            } else {
              // tempModeMap['No Mode'] = tempModeMap['No Mode'] + 1 || 1;
              if ([null, undefined].includes(tempModeMap['No Mode'])) {
                tempModeMap['No Mode'] = [metaData['profileid']];
              } else {
                tempModeMap['No Mode'].push(metaData['profileid']);
              }
            }

            this.mapprofile[metaData['profileid']] = metaData['name']
            this.mapMetaData[metaData['profileid']] = metaData;

            // Subscription Status Processing 
            const subscriptionEndDate = ![null, undefined, ''].includes(metaData['subscriptionend']) ? metaData['subscriptionend'] : [null, undefined, ""].includes(metaData['lastsubscriptionend']) ? null : metaData['lastsubscriptionend'];

            if (subscriptionEndDate != null) {
              if (subscriptionEndDate && subscriptionEndDate.toDate().getMonth() + 1 === this.currentMonth.getMonth() + 1 && subscriptionEndDate.toDate().getFullYear() === this.currentMonth.getFullYear()) {
                currentMonthEnd.push(metaData);
              } else if (subscriptionEndDate && subscriptionEndDate.toDate().getMonth() + 1 === this.lastMonth.getMonth() + 1 && subscriptionEndDate.toDate().getFullYear() === this.lastMonth.getFullYear()) {
                lastMonthEnd.push(metaData);
              } else if (subscriptionEndDate && subscriptionEndDate.toDate().getMonth() + 1 === this.nextMonth.getMonth() + 1 && subscriptionEndDate.toDate().getFullYear() === this.nextMonth.getFullYear()) {
                nextMonthEnd.push(metaData);
              }
              if ((subscriptionEndDate && subscriptionEndDate.toDate()) < new Date()) {
                totalMonthEnd.push(metaData);
              }
            }

            // AR Health Processing 
            if (metaData['activejourney'] != 'InLXMl7OBAqlDTZcXwK0') {
              if (metaData['financedata'] && typeof metaData['financedata'] === 'object' && ['newpayment', 'schedule'].includes(metaData['financedata']['status']) && ![null, undefined, 0].includes(metaData['financedata']?.['computedamount'])) {

                // Convert finance date safely
                const financeDate = this.convertToDate(metaData['financedata']['date']);

                // Check if date matches current month and year
                if (financeDate &&
                  financeDate.getMonth() + 1 === currentMonth &&
                  financeDate.getFullYear() === currentYear) {

                  const purchaseValue = metaData['pp_totalpurchasevalue'] || 0;
                  const totalPaid = metaData['pp_totalpaid'] || 0;
                  const balance = purchaseValue - totalPaid;
                  metaData['pp_balance'] = balance;

                  // Check if fully paid (balance less than 100)
                  if (balance < 100) {
                    fullyPaid.push(metaData);
                  }
                  // Only check schedule status if not fully paid
                  else if (metaData['financedata']['status'] === 'schedule') {
                    const financialStatus = metaData['financialstatus'];
                    const paymentStatus = metaData['financedata']['paymentstatus'];
                    const lockedEMI = metaData['financedata']['lockedemi'];

                    if (financialStatus === 'regular') {
                      if (paymentStatus === 'missed') {
                        missed.push(metaData);
                      } else {
                        regular.push(metaData);
                      }
                    } else if (financialStatus === 'defaulted') {
                      if (paymentStatus === 'missed') {
                        missed.push(metaData);
                      } else {
                        defaulted.push(metaData);
                      }
                    } else if (financialStatus === 'locked' && (lockedEMI && lockedEMI > 0)) {
                      locked.push(metaData);
                    }
                  }
                }
              }

              if (metaData['lasttouchpoint'] && metaData['lasttouchpoint']['activitydate']) {
                let daysBetween = this.getDateDifferenceCategoryCode(metaData['lasttouchpoint']['activitydate']);
                journeyMap[daysBetween].push(metaData);
              }
            }

            if (['active', 'non active', 'discontinued'].includes(customerStatus)) {
              const journeyField = mapCustomerStatusVariable[customerStatus];
              if (journeyField) {
                const journeyId = metaData[journeyField];
                const journeyName = this.mapjourneyname[journeyId];
                if (journeyName) {
                  if (!tempActiveJourney[journeyName]) tempActiveJourney[journeyName] = {};
                  if (!tempActiveJourney[journeyName][customerStatus]) {
                    tempActiveJourney[journeyName][customerStatus] = { status: customerStatus, profiles: [] };
                  }
                  tempActiveJourney[journeyName][customerStatus].profiles.push(metaData);
                  // Store journeyId for type lookup
                  (tempActiveJourney[journeyName] as any)['_journeyId'] = journeyId;
                }
              }
            } else if ([null, undefined, '', "none"].includes(customerStatus)) {
              tempNullStatusProfiles.push(metaData);
            }

            if (metaData['activejourney']) {
              metaData['journey'] = metaData['activejourney'];
              const journeyId = metaData['activejourney'];
              if (this.journeyTypeMap[journeyId] === 'Eco system') {
                ecosystemMap.push(metaData);
              }
              else if (this.journeyTypeMap[journeyId] === 'DFU') {
                dfuMap.push(metaData);
              }
            }
            // Also check for non-active participants with lastcompletedjourney
            else if (metaData['lastcompletedjourney']) {
              metaData['journey'] = metaData['lastcompletedjourney'];
              const journeyId = metaData['lastcompletedjourney'];
              if (this.journeyTypeMap[journeyId] === 'Eco system') {
                ecosystemMap.push(metaData);
              }
              else if (this.journeyTypeMap[journeyId] === 'DFU') {
                dfuMap.push(metaData);
              }
            }

            if (metaData['customerstatus'] &&
              ['discontinued', 'banned', 'late'].includes(metaData['customerstatus'].toLowerCase())) {
              discontinuedArray.push(metaData);
            }

            if (i + 1 == metadata.length) {
              this.loadParticipantJourneyProduct();
              this.originalData['currentMonth'].data = currentMonthEnd;
              this.originalData['currentMonth'].count = currentMonthEnd.length;

              this.originalData['lastMonth'].data = lastMonthEnd;
              this.originalData['lastMonth'].count = lastMonthEnd.length;

              this.originalData['nextMonth'].data = nextMonthEnd;
              this.originalData['nextMonth'].count = nextMonthEnd.length;

              this.originalData['totalMonth'].data = totalMonthEnd;
              this.originalData['totalMonth'].count = totalMonthEnd.length;

              this.originalData['fullypaidstatus'].data = fullyPaid;
              this.originalData['fullypaidstatus']['count'] = fullyPaid.length;

              this.originalData['regularstatus'].data = regular;
              this.originalData['regularstatus']['count'] = regular.length;

              this.originalData['missedstatus'].data = missed;
              this.originalData['missedstatus']['count'] = missed.length;

              this.originalData['defaultedstatus'].data = defaulted;
              this.originalData['defaultedstatus']['count'] = defaulted.length;

              this.originalData['lockedstatus'].data = locked;
              this.originalData['lockedstatus']['count'] = locked.length;

              this.originalData['activeEngagement'].data = journeyMap[1];
              this.originalData['activeEngagement']['count'] = journeyMap[1].length;

              this.originalData['less90Engagement'].data = journeyMap[2];
              this.originalData['less90Engagement']['count'] = journeyMap[2].length;

              this.originalData['less180Engagement'].data = journeyMap[3];
              this.originalData['less180Engagement']['count'] = journeyMap[3].length;

              this.originalData['more180Engagement'].data = journeyMap[4];
              this.originalData['more180Engagement']['count'] = journeyMap[4].length;

              this.originalData['ecosystem'].data = ecosystemMap;
              this.originalData['ecosystem']['count'] = ecosystemMap.length;

              this.originalData['dfu'].data = dfuMap;
              this.originalData['dfu']['count'] = dfuMap.length;

              this.originalData['discontinued'].data = discontinuedArray;
              this.originalData['discontinued']['count'] = discontinuedArray.length;

              this.originalData['allParticipants'].data = allParticipantsList;
              this.originalData['allParticipants'].count = allParticipantsList.length;

              this.modeMap = tempModeMap;

              this.journeyStatusMatrix = Object.entries(tempActiveJourney).map(([journeyName, statusMap]) => {
                const journeyId = (statusMap as any)['_journeyId'] ?? '';
                const journeyType = this.journeyTypeMap[journeyId] ?? 'Other';
                const statuses = { ...statusMap };
                delete (statuses as any)['_journeyId'];
                return {
                  journeyName,
                  journeyType,
                  statuses,
                  total: Object.values(statuses).reduce((a, b) => a + b.profiles.length, 0)
                };
              }).sort((a, b) => b.total - a.total);
              this.nullStatusProfiles = tempNullStatusProfiles;

              this.updateTableDataIfOpen(this.tableType);
              this.loadingStates.metadata = true;
              this.checkAllDataLoaded();
            }
          }
        } catch (error) {
          console.log("error metadata", error);
          this.loadingStates.metadata = true;
          this.checkAllDataLoaded();
        }
      } else {
        this.loadingStates.metadata = true;
        this.checkAllDataLoaded();
      }
    })
  }

  private convertToDate(value: any): Date | null {
    if (!value) return null;

    try {
      if (value instanceof Date) {
        return value;
      } else if (typeof value.toDate === 'function') {
        return value.toDate();
      } else if (typeof value === 'string' || typeof value === 'number') {
        return new Date(value);
      }
    } catch (error) {
      console.warn('Failed to convert to date:', value, error);
    }

    return null;
  }

  // Function to fetch data from Participant Journey Product 
  loadParticipantJourneyProduct() {
    const now = new Date();
    const currentMonthStart = new Date(this.startDate);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthEnd = new Date(this.endDate);
    currentMonthEnd.setHours(23, 59, 59, 999);

    currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
    currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

    let startdate = Timestamp.fromDate(currentMonthStart).toDate();
    let enddate = Timestamp.fromDate(currentMonthEnd).toDate();

    const currentDate = new Date();
    // last 7 days
    let last7days = new Date();
    last7days.setDate(currentDate.getDate() - 7);

    try {
      this.subscriptions['journeyproduct1'] = collectionData(query(collection(this.firestore, "participantjourneyproduct"), where("paymentplan", "==", null))).subscribe(async (notassured) => {
        if (notassured.length != 0) {
          let tempArray1 = [];
          let addonsToCheck: { index: number; salesLeadId: string; data: any }[] = [];

          for (let i = 0; i < notassured.length; i++) {
            let notAssuredData = notassured[i];
            notAssuredData['pp_totalpurchasevalue'] = [null, undefined, ''].includes(this.mapMetaData[notAssuredData['profileid']]) ? null : (this.mapMetaData[notAssuredData['profileid']]['pp_totalpurchasevalue'] ?? null);
            notAssuredData['pp_totalpaid'] = [null, undefined, ''].includes(this.mapMetaData[notAssuredData['profileid']]) ? null : (this.mapMetaData[notAssuredData['profileid']]['pp_totalpaid'] ?? null);

            if (notAssuredData['purchasedate']?.toDate() >= new Date('2025-01-01') && ![null, undefined, ""].includes(notAssuredData['profileid'])) {
              if (notAssuredData['journeytype'] == 'addons' || ['ongoing', 'initiated'].includes(notAssuredData['journeystatus'])) {
                if (!this.mapMetaData[notAssuredData['profileid']]?.['email'].includes('soexcellence')) {

                  if (notAssuredData['journeytype'] == 'addons') {
                    const salesLeadId = notAssuredData['salesleadsref']?.id;

                    if (salesLeadId) {
                      // Collect addons that need async check
                      addonsToCheck.push({ index: i, salesLeadId, data: notAssuredData });
                    } else {
                      tempArray1.push(notAssuredData);
                    }
                  } else {
                    // For ongoing journey status (not addons), push directly
                    tempArray1.push(notAssuredData);
                  }
                }
              }
            }
          }

          // Batch check all addons in parallel using modular API
          if (addonsToCheck.length > 0) {
            const cancelChecks = await Promise.all(
              addonsToCheck.map(item => {
                const saleleadsQuery = query(
                  collection(this.firestore, 'salesleads'),
                  where('canceldocid', '==', item.salesLeadId),
                  where('status', '==', 'Approved'),
                  limit(1)
                );
                return getDocs(saleleadsQuery);
              })
            );

            // Process results
            cancelChecks.forEach((cancelledDocs, idx) => {
              if (cancelledDocs.empty) {
                tempArray1.push(addonsToCheck[idx].data);
              }
            });
          }

          this.originalData['notassured'].data = tempArray1;
          this.originalData['notassured'].count = tempArray1.length;
          this.updateTableDataIfOpen(this.tableType);
        }
      });

      this.subscriptions['journeyproduct2'] = collectionData(query(collection(this.firestore, "participantjourneyproduct"), where("paymentplan", "!=", null))).subscribe((onboarded) => {
        if (onboarded.length != 0) {
          // last 30days 
          let last30days = new Date();
          last30days.setDate(currentDate.getDate() - 30);

          let tempArray2 = [];
          let tempArray3 = [];
          let tempArray4 = [];
          let tempArray5 = [];
          let tempArray6 = [];

          let avgAssuredList = [];
          let avgPurchaseList = [];

          for (let i = 0; i < onboarded.length; i++) {
            const onboardedData = onboarded[i];
            onboardedData['generalnotes'] = [null, undefined, ''].includes(this.mapMetaData[onboardedData['profileid']]) ? [] : (this.mapMetaData[onboardedData['profileid']]['generalnotes'] ?? [])
            onboardedData['delayeddays'] = this.calculateDelayedDays(onboardedData['paymentplanassureddate']?.toDate());
            if (onboardedData['purchasedate']?.toDate() >= new Date('2025-01-01') && ([null, undefined, ""].includes(onboardedData['journeyref']) || onboardedData['journeyref'].id != 'InLXMl7OBAqlDTZcXwK0') && [null, 'ongoing', 'initiated'].includes(onboardedData['journeystatus'])) {
              if ([null, undefined, "", false].includes(onboardedData['onboarded'])) {
                if (onboardedData['purchasedate']?.toDate() >= last7days) {
                  tempArray2.push(onboardedData);
                } else if (onboardedData['purchasedate']?.toDate() < last7days) {
                  tempArray3.push(onboardedData)
                }
              } else if (onboardedData['onboarded'] == true) {
                if (onboardedData['onboardedtime']?.toDate() >= startdate && onboardedData['onboardedtime']?.toDate() <= enddate) {
                  tempArray4.push(onboardedData);
                }

                if (this.mapMetaData[onboardedData['profileid']]?.['activeproduct']?.length == 0 && this.mapMetaData[onboardedData['profileid']]?.['consumedproducts']?.length == 0) {
                  if (onboardedData['purchasedate']?.toDate() >= last30days) {
                    tempArray5.push(onboardedData);
                  } else {
                    tempArray6.push(onboardedData);
                  }
                }
              }
            }

            if (i + 1 == onboarded.length) {
              this.originalData['last7DaysnotOnboarded'].data = tempArray2;
              this.originalData['last7DaysnotOnboarded'].count = tempArray2.length;

              this.originalData['last15daysnotOnboarded'].data = tempArray3;
              this.originalData['last15daysnotOnboarded'].count = tempArray3.length;

              this.originalData['all'].data = [...tempArray2, ...tempArray3];
              this.originalData['all'].count = [...tempArray2, ...tempArray3].length;

              // --- Average days: Purchase → Onboard ---
              const tempPurchaseToOnboard = tempArray4.reduce((sum, item) => {
                const daysDiff = Number(this.calculateDaysAgo(item.onboardedtime?.toDate(), item.purchasedate?.toDate()));
                avgPurchaseList.push({ ...item, daysdiff: daysDiff })
                return sum + daysDiff;
              }, 0);
              this.avgPurchase = tempPurchaseToOnboard / tempArray4.length;
              this.avgPurchaseList = avgPurchaseList

              // --- Average days: Onboard → Payment Assured ---
              const tempAssuredToOnboard = tempArray4.reduce((sum, item) => {
                const daysDiff = Number(this.calculateDaysAgo(item.onboardedtime?.toDate(), item.paymentplanassureddate?.toDate()));
                avgAssuredList.push({ ...item, daysdiff: daysDiff })
                return sum + daysDiff;
              }, 0);

              this.avgAssured = tempAssuredToOnboard / tempArray4.length;
              this.avgAssuredList = avgAssuredList

              this.originalData['onboarded'].data = tempArray4;
              this.originalData['onboarded'].count = tempArray4.length;

              this.originalData['lessthan30daysjourneynotstarted'].data = tempArray5;
              this.originalData['lessthan30daysjourneynotstarted'].count = tempArray5.length;

              this.originalData['morethan30daysjourneynotstarted'].data = tempArray6;
              this.originalData['morethan30daysjourneynotstarted'].count = tempArray6.length;

              this.originalData['alljourneynotstarted'].data = [...tempArray5, ...tempArray6];
              this.originalData['alljourneynotstarted'].count = [...tempArray5, ...tempArray6].length;

              this.updateTableDataIfOpen(this.tableType);
            }
          }
        }
      })

      getDocs(query(
        collection(this.firestore, "participantjourneyproduct"),
        where("journeystatus", "in", ['ongoing', "completed"]),
        where("subscriptionend", ">=", startdate),
        where("subscriptionend", "<=", enddate)
      )).then((snapshot) => {

        // monthMap: { '2025-03': { 'journeyRefId': { label: string, count: number, docs: any[] } } }
        const monthMap: Record<string, Record<string, { label: string; count: number; docs: any[] }>> = {};

        snapshot.forEach(doc => {
          const data = doc.data();
          const end = data['subscriptionend']?.toDate ? data['subscriptionend'].toDate() : new Date(data['subscriptionend']);
          const ym = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
          const journeyId = data['journeyref']?.id ?? data['journeyref'] ?? 'Unknown';
          const journeyLabel = this.mapjourneyname?.[journeyId] ?? journeyId;

          if (!monthMap[ym]) monthMap[ym] = {};
          if (!monthMap[ym][journeyId]) monthMap[ym][journeyId] = { label: journeyLabel, count: 0, docs: [] };

          monthMap[ym][journeyId].count++;
          monthMap[ym][journeyId].docs.push({ id: doc.id, ...data });
        });

        // Convert to sorted array for template
        this.buildSubscriptionMatrix(snapshot)
      });

      this.updateTableDataIfOpen(this.tableType);
      this.loadingStates.journeyProduct = true;
      this.checkAllDataLoaded();
    } catch (error) {
      this.loadingStates.journeyProduct = true;
      this.checkAllDataLoaded();
    }
  }

  // Function to load customer support tickets 
  // async loadCustomerSupport() {
  //   this.subscriptions['clientissue'] = collectionData(query(collection(this.firestore, "clientissue"), where("category", "in", ['Events & Process', 'Journey Related', 'Downgrade, Cancellation & Exceptions', 'Finance & Accounts', 'Referrals & Upgrades']))).subscribe((tickets) => {
  //     if (tickets.length != 0) {
  //       const currentMonthStart = new Date(this.startDate);
  //       currentMonthStart.setHours(0, 0, 0, 0);

  //       const currentMonthEnd = new Date(this.endDate);
  //       currentMonthEnd.setHours(23, 59, 59, 999);

  //       currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
  //       currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

  //       let startdate = Timestamp.fromDate(currentMonthStart).toDate();
  //       let enddate = Timestamp.fromDate(currentMonthEnd).toDate();

  //       this.originalData['eventtickets'].count = 0
  //       this.originalData['eventtickets'].data = []
  //       this.originalData['eventticketnew'].count = 0
  //       this.originalData['eventticketnew'].data = []
  //       this.originalData['eventticketresponded'].count = 0
  //       this.originalData['eventticketresponded'].data = []
  //       this.originalData['eventticketsclosed'].count = 0
  //       this.originalData['eventticketsclosed'].data = []

  //       this.originalData['journeytickets'].count = 0
  //       this.originalData['journeytickets'].data = []
  //       this.originalData['journeyticketnew'].count = 0
  //       this.originalData['journeyticketnew'].data = []
  //       this.originalData['journeyticketresponded'].count = 0
  //       this.originalData['journeyticketresponded'].data = []
  //       this.originalData['journeyticketsclosed'].count = 0
  //       this.originalData['journeyticketsclosed'].data = []

  //       this.originalData['cancellationtickets'].count = 0
  //       this.originalData['cancellationtickets'].data = []
  //       this.originalData['cancellationticketnew'].count = 0
  //       this.originalData['cancellationticketnew'].data = []
  //       this.originalData['cancellationticketresponded'].count = 0
  //       this.originalData['cancellationticketresponded'].data = []
  //       this.originalData['cancellationticketsclosed'].count = 0
  //       this.originalData['cancellationticketsclosed'].data = []

  //       this.originalData['financetickets'].count = 0
  //       this.originalData['financetickets'].data = []
  //       this.originalData['financeticketnew'].count = 0
  //       this.originalData['financeticketnew'].data = []
  //       this.originalData['financeticketresponded'].count = 0
  //       this.originalData['financeticketresponded'].data = []
  //       this.originalData['financeticketsclosed'].count = 0
  //       this.originalData['financeticketsclosed'].data = []

  //       this.originalData['referraltickets'].count = 0
  //       this.originalData['referraltickets'].data = []
  //       this.originalData['referralticketnew'].count = 0
  //       this.originalData['referralticketnew'].data = []
  //       this.originalData['referralticketresponded'].count = 0
  //       this.originalData['referralticketresponded'].data = []
  //       this.originalData['referralticketsclosed'].count = 0
  //       this.originalData['referralticketsclosed'].data = []

  //       try {
  //         for (let i = 0; i < tickets.length; i++) {
  //           const ticketdata = tickets[i];
  //           if (ticketdata['status']?.status.toLowerCase() == 'open') {
  //             if (ticketdata['category'] == 'Events & Process') {
  //               this.originalData['eventtickets'].count++;
  //               this.originalData['eventtickets'].data.push(ticketdata);
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'new') {
  //                 this.originalData['eventticketnew'].count++;
  //                 this.originalData['eventticketnew'].data.push(ticketdata);
  //               }
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'decision making') {
  //                 this.originalData['eventticketresponded'].count++;
  //                 this.originalData['eventticketresponded'].data.push(ticketdata);
  //               }
  //             } else if (ticketdata['category'] == 'Journey Related') {
  //               this.originalData['journeytickets'].count++;
  //               this.originalData['journeytickets'].data.push(ticketdata);
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'new') {
  //                 this.originalData['journeyticketnew'].count++;
  //                 this.originalData['journeyticketnew'].data.push(ticketdata);
  //               }
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'decision making') {
  //                 this.originalData['journeyticketresponded'].count++;
  //                 this.originalData['journeyticketresponded'].data.push(ticketdata);
  //               }
  //             } else if (ticketdata['category'] == 'Downgrade, Cancellation & Exceptions') {
  //               this.originalData['cancellationtickets'].count++;
  //               this.originalData['cancellationtickets'].data.push(ticketdata);
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'new') {
  //                 this.originalData['cancellationticketnew'].count++;
  //                 this.originalData['cancellationticketnew'].data.push(ticketdata);
  //               }
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'decision making') {
  //                 this.originalData['cancellationticketresponded'].count++;
  //                 this.originalData['cancellationticketresponded'].data.push(ticketdata);
  //               }
  //             } else if (ticketdata['category'] == 'Finance & Accounts') {
  //               this.originalData['financetickets'].count++;
  //               this.originalData['financetickets'].data.push(ticketdata);

  //               if (ticketdata['chatstatus']?.toLowerCase() == 'new') {
  //                 this.originalData['financeticketnew'].count++;
  //                 this.originalData['financeticketnew'].data.push(ticketdata);
  //               }
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'decision making') {
  //                 this.originalData['financeticketresponded'].count++;
  //                 this.originalData['financeticketresponded'].data.push(ticketdata);
  //               }
  //             } else if (ticketdata['category'] == 'Referrals & Upgrades') {
  //               this.originalData['referraltickets'].count++;
  //               this.originalData['referraltickets'].data.push(ticketdata);
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'new') {
  //                 this.originalData['referralticketnew'].count++;
  //                 this.originalData['referralticketnew'].data.push(ticketdata);
  //               }
  //               if (ticketdata['chatstatus']?.toLowerCase() == 'decision making') {
  //                 this.originalData['referralticketresponded'].count++;
  //                 this.originalData['referralticketresponded'].data.push(ticketdata);
  //               }
  //             }
  //           } else if (ticketdata['status']?.status.toLowerCase() == 'closed' && (ticketdata['status']?.date?.toDate() >= startdate && ticketdata['status']?.date?.toDate() <= enddate)) {
  //             if (ticketdata['category'] == 'Events & Process') {
  //               this.originalData['eventticketsclosed'].count++;
  //               this.originalData['eventticketsclosed'].data.push(ticketdata);
  //             } else if (ticketdata['category'] == 'Journey Related') {
  //               this.originalData['journeyticketsclosed'].count++;
  //               this.originalData['journeyticketsclosed'].data.push(ticketdata);
  //             } else if (ticketdata['category'] == 'Downgrade, Cancellation & Exceptions') {
  //               this.originalData['cancellationticketsclosed'].count++;
  //               this.originalData['cancellationticketsclosed'].data.push(ticketdata);
  //             } else if (ticketdata['category'] == 'Finance & Accounts') {
  //               this.originalData['financeticketsclosed'].count++;
  //               this.originalData['financeticketsclosed'].data.push(ticketdata);
  //             } else if (ticketdata['category'] == 'Referrals & Upgrades') {
  //               this.originalData['referralticketsclosed'].count++;
  //               this.originalData['referralticketsclosed'].data.push(ticketdata);
  //             }
  //           }
  //           // Event tickets closed
  //           const eventClosed = this.originalData['eventticketsclosed'].data.reduce((sum, element) => {
  //             return sum + Number(
  //               this.calculateDaysClosed(
  //                 element['reporteddate']?.toDate(),
  //                 element['status']?.date?.toDate()
  //               )
  //             );
  //           }, 0);
  //           this.originalData['eventticketsclosed'].avg = eventClosed / this.originalData['eventticketsclosed'].data.length;

  //           // Journey tickets closed
  //           const journeyClosed = this.originalData['journeyticketsclosed'].data.reduce((sum, element) => {
  //             return sum + Number(
  //               this.calculateDaysClosed(
  //                 element['reporteddate']?.toDate(),
  //                 element['status']?.date?.toDate()
  //               )
  //             );
  //           }, 0);
  //           this.originalData['journeyticketsclosed'].avg = journeyClosed / this.originalData['journeyticketsclosed'].data.length;

  //           // Cancellation tickets closed
  //           const cancellationClosed = this.originalData['cancellationticketsclosed'].data.reduce((sum, element) => {
  //             return sum + Number(
  //               this.calculateDaysClosed(
  //                 element['reporteddate']?.toDate(),
  //                 element['status']?.date?.toDate()
  //               )
  //             );
  //           }, 0);
  //           this.originalData['cancellationticketsclosed'].avg = cancellationClosed / this.originalData['cancellationticketsclosed'].data.length;

  //           //Finance tickets closed
  //           const bigClosed = this.originalData['financeticketsclosed'].data.reduce((sum, element) => {
  //             return sum + Number(
  //               this.calculateDaysClosed(
  //                 element['reporteddate']?.toDate(),
  //                 element['status']?.date?.toDate()
  //               )
  //             );
  //           }, 0);
  //           this.originalData['financeticketsclosed'].avg = bigClosed / this.originalData['financeticketsclosed'].data.length;

  //           // Referral tickets closed
  //           const referralClosed = this.originalData['referralticketsclosed'].data.reduce((sum, element) => {
  //             return sum + Number(
  //               this.calculateDaysClosed(
  //                 element['reporteddate']?.toDate(),
  //                 element['status']?.date?.toDate()
  //               )
  //             );
  //           }, 0);
  //           this.originalData['referralticketsclosed'].avg = referralClosed / this.originalData['referralticketsclosed'].data.length;

  //           if (i + 1 == tickets.length) {
  //             this.loadingStates.customerSupport = true;
  //             this.checkAllDataLoaded();
  //           }
  //         }
  //       } catch (error) {
  //         this.loadingStates.customerSupport = true;
  //         this.checkAllDataLoaded();
  //       }
  //     } else {
  //       this.loadingStates.customerSupport = true;
  //       this.checkAllDataLoaded();
  //     }
  //   })

  // }

  // Function to load modes from participant products 
  async loadModes() {
    const now = new Date();

    // Get start of current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    currentMonthStart.setHours(0, 0, 0, 0);

    // Get end of current month
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    currentMonthEnd.setHours(23, 59, 59, 999);

    // Add timezone offset (5 hours 30 minutes for IST)
    currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
    currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

    let startdate = Timestamp.fromDate(currentMonthStart).toDate();
    let enddate = Timestamp.fromDate(currentMonthEnd).toDate();


    getDocs(query(collection(this.firestore, "participantsproduct"), where("statusdate.initiated", ">=", startdate), where("statusdate.initiated", "<=", enddate))).then((products) => {
      let tempArray = [];
      if (products.docs.length != 0) {
        for (let index = 0; index < products.docs.length; index++) {
          const productdata = products.docs[index].data();
          if (productdata['status'] === 'initiated' && productdata["deliverymode"] === "Priority Mode") {
            const statusDateInitiated = productdata['statusdate']?.['initiated'];
            productdata['initiatedtime'] = statusDateInitiated;
            const journeyId = this.mapMetaData[productdata['profileid']]?.['activejourney'];
            const journeyname = this.mapjourneyname[journeyId] || 'N/A';
            productdata['journey'] = journeyname;
            tempArray.push(productdata);
          }

          if (index + 1 == products.docs.length) {
            this.originalData['currentjourneyinitiated'].data = tempArray;
            this.originalData['currentjourneyinitiated'].count = tempArray.length;

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

  async getModes() {
    const q = query(collection(this.firestore, 'modes'), orderBy('sequence', 'asc'));
    const modesSnapshot = await getDocs(q);
    this.modesList = [];
    modesSnapshot.forEach((doc) => {
      const element = doc.data();
      this.modesList.push(element['mode']);
    });
  }


  updateTableDataIfOpen(boxType: string) {
    if (!boxType || !this.tableConfigs[boxType]) {
      return;
    }

    let configData = this.tableConfigs[boxType];

    if (this.showTable &&
      this.currentTableConfig &&
      this.currentTableConfig.dataKey === configData['dataKey']) {

      const newBaseData = [...this.originalData[configData['dataKey']].data];

      this.filteredTableData = newBaseData;

      if (this.hasActiveFilters) {
        this.filterTableData(this.filterForm.value);
      } else {
        configData['data'] = newBaseData;
        this.currentTableConfig.data = newBaseData;

        const previousPage = this.currentPage;
        const maxPage = Math.ceil(newBaseData.length / this.itemsPerPage);
        if (previousPage > maxPage && maxPage > 0) {
          this.currentPage = maxPage;
        }

        this.calculatePagination();
        this.cdr.detectChanges();
      }
    } else {
      configData['data'] = [...this.originalData[configData['dataKey']].data];
    }
  }

  // Function to call column class based on schedule condition 
  getColumnClass(tentativeStart: Date): string {
    const now = new Date();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);

    if (tentativeStart < now) {
      return 'overdue'; // red
    } else if (tentativeStart <= oneMonthFromNow) {
      return 'approaching'; // orange
    } else {
      return ''; // no color change
    }
  }

  // Function to naviagte to journey support screen 
  navigatejourneyplan(element: any) {
    const profileId = element['profileid'];
    const docId = element['docid'];
    const url = this.router.createUrlTree(['/journeysupport', profileId], { queryParams: { pjpid: docId } }).toString();
    window.open(url, '_blank');
  }

  // Function to filter table 
  filterTableData(value) {
    if (!this.currentTableConfig || !this.filteredTableData) {
      return;
    }

    const searchTerm = value.search || '';
    const selectedJourney = value.journey || [];
    const selectedJourneyCoach = this.mapprofile[value.journeycoach] || '';
    const selectedStartPurchaseDate = value.purchaseStart || '';
    const selectedEndPurchaseDate = value.purchaseEnd || '';
    const selectedAssuredData = value.assured;
    const selectedStatusData = value.status;
    const selectedSaleTypeData = value.saleType;
    const selectedCustomerStatus = value.customerStatus;

    this.hasActiveFilters = !!(
      searchTerm.trim() ||
      selectedJourney.length > 0 ||
      selectedJourneyCoach.trim() ||
      (selectedStartPurchaseDate && selectedEndPurchaseDate) ||
      selectedAssuredData?.trim() ||
      selectedStatusData?.trim() ||
      selectedSaleTypeData?.trim()
    );

    this.currentTableConfig.data = this.filteredTableData.filter(row => {
      let matchesSearch = true;
      let matchesJourney = true;
      let matchesJourneyCoach = true;
      let matchesPurchaseDate = true;
      let matchesAssured = true;
      let matchesStatus = true;
      let matchesSaleType = true;
      let matchesCustomerStatus = true;

      if (searchTerm.trim()) {
        matchesSearch = this.currentTableConfig.columns.some(col => {
          const headerLower = col.header.toLowerCase();

          if (headerLower === 'name') {
            const cellValue = this.formatCellValue(row, col).toLowerCase().trim();
            return cellValue.includes(searchTerm.toLowerCase());
          }

          if (headerLower === 'mobile') {
            const rawValue = this.formatCellValue(row, col);
            const cellValue = typeof rawValue === 'string' ? rawValue : String(rawValue);
            return cellValue.includes(searchTerm);
          }

          if (headerLower === 'email') {
            const cellValue = this.formatCellValue(row, col);
            return cellValue.includes(searchTerm);
          }

          return false;
        });
      }

      if (selectedJourney.length > 0) {

        const journeyColumn = this.currentTableConfig.columns.find(col =>
          col.header.toLowerCase() === 'journey'
        );

        if (journeyColumn) {
          const cellValue = this.formatCellValue(row, journeyColumn);
          matchesJourney = selectedJourney.includes(cellValue);
        }
      }

      if (selectedJourneyCoach.trim()) {
        const journeyCoachColumn = this.currentTableConfig.columns.find(col =>
          col.header.toLowerCase().trim().replace(/\s/g, "") === 'schedulefor' || col.header.toLowerCase().trim().replace(/\s/g, "") === 'onboardedby'
        );

        if (journeyCoachColumn) {
          const cellValue = this.formatCellValue(row, journeyCoachColumn);
          matchesJourneyCoach = selectedJourneyCoach == cellValue;
        }
      }

      if (selectedStartPurchaseDate && selectedEndPurchaseDate) {
        const purchaseDate = row['purchasedate'] instanceof Date ? row['purchasedate'] : new Date(row['purchasedate'].toDate());

        const startDate = selectedStartPurchaseDate ? new Date(selectedStartPurchaseDate) : null;
        const endDate = selectedEndPurchaseDate ? new Date(selectedEndPurchaseDate) : null;

        if (startDate && endDate && purchaseDate) {
          startDate.setHours(0, 0, 0, 0);
          endDate.setHours(23, 59, 59, 999);

          startDate.setTime(startDate.getTime() + (5 * 60 + 30) * 60 * 1000);
          endDate.setTime(endDate.getTime() + (5 * 60 + 30) * 60 * 1000);
          let startdate = Timestamp.fromDate(startDate).toDate();
          let enddate = Timestamp.fromDate(endDate).toDate();
          matchesPurchaseDate = matchesPurchaseDate && purchaseDate >= startdate && purchaseDate <= enddate;
        }
      }

      if (selectedAssuredData.trim()) {
        if (selectedAssuredData == 'assured') {
          matchesAssured = ![null, undefined, ""].includes(row['paymentplan']);
        } else if (selectedAssuredData == 'notassured') {
          matchesAssured = [null, undefined, ""].includes(row['paymentplan']);
        }
      }

      if (selectedStatusData.trim()) {

        if (selectedStatusData == 'Approved') {
          matchesStatus = ![null, undefined, ""].includes(row['status']);
        } else {
          matchesStatus = [null, undefined, ""].includes(row['status']);
        }

      }

      if (selectedSaleTypeData.trim()) {
        const selectedType = selectedSaleTypeData.toLowerCase();

        if (selectedType === 'new') {
          matchesSaleType = (row['journeytype'] === 'new');
        } else if (selectedType === 'upgrade') {
          matchesSaleType = (row['journeytype'] === 'upgrade');
        } else if (selectedType === 'add-on') {
          matchesSaleType = (row['journeytype'] === 'addons');
        }
      }

      if (selectedCustomerStatus?.trim()) {
        const selectedStatus = selectedCustomerStatus.toLowerCase();
        const rowStatus = row['customerstatus']?.toLowerCase();

        if (selectedStatus === 'active') {
          matchesCustomerStatus = (rowStatus === 'active');
        } else if (selectedStatus === 'non active') {
          matchesCustomerStatus = (rowStatus === 'non active');
        } else if (selectedStatus === 'discontinued') {
          matchesCustomerStatus = (rowStatus === 'discontinued');
        } else if (selectedStatus === 'banned') {
          matchesCustomerStatus = (rowStatus === 'banned');
        } else if (selectedStatus === 'late') {
          matchesCustomerStatus = (rowStatus === 'late');
        }
      }

      return matchesSearch && matchesJourney && matchesJourneyCoach && matchesPurchaseDate && matchesAssured && matchesStatus && matchesSaleType && matchesCustomerStatus;
    });

    this.currentPage = 1;
    this.calculatePagination();
  }

  // Function to check onboarding marked 
  checkMarkOnboarding(element) {
    let disabled = false;

    if (element['onboardingscheduled'] && element['onboardingscheduled']?.toDate() < this.currentDate && ![null, undefined, ''].includes(element['appointmentid'])) {
      disabled = false;
    } else if (element['onboardingscheduled'] && element['onboardingscheduled']?.toDate() > this.currentDate && ![null, undefined, ''].includes(element['appointmentid'])) {
      disabled = true;
    }

    return disabled;
  }

  // Function to mark onbaorded 
  markOnboarded(element) {
    element['markonboard'] = true
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;

    if (element['addnotes']) {
      delete element['addnotes']
    }

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
      disableClose: false,
      panelClass: 'custom-dialog-container'
    })
    dialogRef.afterClosed().toPromise().then(async value => {

      if (![null, undefined, ''].includes(value)) {
        const dialogRef = this.dialog.open(LoadingProgressComponent, {
          disableClose: true,
          data: { type: "spinner", msg: "Onboard Completing..." }
        });

        let salesdata = value.salesleadsData;

        delete value.salesleadsData;

        await updateDoc(doc(this.firestore, 'participantjourneyproduct', element['docid']), value);
        await updateDoc(doc(this.firestore, 'salesleads', salesdata['docid']), {
          referral: value['referral']
        });

        if (![null, undefined, ''].includes(value['appointmentid'])) {
          await updateDoc(doc(this.firestore, "appointments", element['appointmentid']), {
            attended: true,
            cancelled: false,
          }).then(() => {
            console.log("Onboard Marked Successfully");
            this.guard.openSnackBar("Onboard Marked Successfully", "OK", 600);
          }).catch((error) => {
            console.error("Oops! Error while marking Onboard", error);
            this.guard.openSnackBar("Oops! Error while marking Onboard", "OK", 600);
          });
        }

        // Updating Journey Status as Upgraded for previous Journey
        // if (value['journeytype'] == 'upgrade' && ![null, undefined, ''].includes(salesdata)) {
        //   const previousJourneyID = salesdata['upgradefromparticipantjourneyproductid']
        //   await updateDoc(doc(this.firestore, 'participantjourneyproduct', previousJourneyID), {
        //     journeystatus: 'Upgraded'
        //   }).then(() => {
        //     console.log("Previous Journey Status Updated");
        //     this.guard.openSnackBar("Previous Journey Status Updated to Upgraded", "OK", 600);
        //   }).catch((error) => {
        //     this.guard.openSnackBar("Oops Error While Updating Previous Journey Status", "OK", 600);
        //     console.log("Oops Error While Updating Previous Journey Status")
        //   });
        // }

        dialogRef.close();

      } else {
        this.guard.openSnackBar("No Action Taken", "OK", 600)
      }
    })
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

    // if (element['salenotes'] && typeof element['salenotes'] === 'string') {
    //   element['allnotes'] = [
    //     {
    //       note: element['salenotes'],
    //       updatedby: element['profileid'],
    //       updated: element['updated'] || null
    //     }
    //   ];
    // } else if (element['notes'] && typeof element['notes'] === 'string') {
    //   element['allnotes'] = [
    //     {
    //       note: element['notes'],
    //       updatedby: element['profileid'],
    //       updated: element['updated'] || null
    //     }
    //   ];
    // } else if (Array.isArray(element['generalnotes'])) {
    //   element['allnotes'] = element['generalnotes'];
    // } else {
    //   element['allnotes'] = [];
    // }

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

  // Hide popup with delay 
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

  navigatetoprofile(profileid) {
    if (profileid) {
      const navigationurl = 'userprofile';
      const url = `${navigationurl}/${profileid}`;
      window.open(url, '_blank');
    } else {
      alert('Profile Name Not Available');
    }
  }

  // Function to refresh filter 
  refreshFilter() {
    this.filterForm.controls['search'].setValue('');
    this.filterForm.controls['journey'].setValue('');
    this.filterForm.controls['journeycoach'].setValue('');
    this.filterForm.controls['purchaseStart'].setValue('');
    this.filterForm.controls['purchaseEnd'].setValue('');
    this.filterForm.controls['assured'].setValue('');
    this.filterForm.controls['status'].setValue('');
    this.filterForm.controls['saleType'].setValue('');
    this.filterForm.controls['customerStatus'].setValue('');

    this.filterTableData(this.filterForm.value);
  }

  // Function to view loading progress of the screen 
  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStates).filter(state => state === true).length;
    const total = Object.keys(this.loadingStates).length;
    this.cdr.markForCheck();
    return (loaded / total) * 100;
  }

  // Function to get total loaded count 
  getLoadedCount(): number {
    return Object.values(this.loadingStates).filter(state => state === true).length;
  }

  // Function to open schedule dialog 
  openSchedule(element, type) {
    if (type == 'coach') {
      element['isReschedule'] = ![null, undefined].includes(this.mapCoachAppointments[element['profileid']]) && !this.mapCoachAppointments[element['profileid']][0]['attended'] ? true : false;
      element['appointmentid'] = ![null, undefined].includes(this.mapCoachAppointments[element['profileid']]) ? this.mapCoachAppointments[element['profileid']][0]['docid'] : null;
    } else if (type == 'onboarding') {
      element['isReschedule'] = element['onboardingscheduled'] != null ? true : false;
    }

    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;
    element['calltype'] = type;
    var dialogRef = this.dialog.open(ScheduleDialogComponent, {
      data: element,
      autoFocus: false,
      disableClose: true,
      panelClass: 'custom-dialog-container',
      maxHeight: "90vh"
    });
  }

  // Function to mark Journey Coach Complete 
  async markJCcomplete(profile, schedule) {
    if (![null, undefined, ""].includes(schedule)) {
      if (![null, undefined, ''].includes(schedule['docid'])) {
        var x = confirm("Are you sure to mark Journey Coach complete");
        if (x) {
          await updateDoc(doc(this.firestore, "appointments", schedule['docid']), {
            attended: true,
            cancelled: false,
          }).then(() => {
            console.log("Journey Coach Marked Successfully");
            this.guard.openSnackBar("Journey Coach Marked Successfully", "OK", 600);
          }).catch((error) => {
            console.error("Oops! Error while marking Journey Coach", error);
            this.guard.openSnackBar("Oops! Error while marking Journey Coach", "OK", 600);
          });
        }
      } else {
        alert("Error - No Document Found");
      }
    } else {
      alert("Error Marking, Contact Developer")
    }
  }

  //Function to switch to previous months in the calendar
  previousCalendarMonth() {
    this.currentCalendarMonth = new Date(
      this.currentCalendarMonth.getFullYear(),
      this.currentCalendarMonth.getMonth() - 1,
      1
    );
  }

  //Function to switch to next months in the calendar
  nextCalendarMonth() {
    this.currentCalendarMonth = new Date(
      this.currentCalendarMonth.getFullYear(),
      this.currentCalendarMonth.getMonth() + 1,
      1
    );
  }

  onMonthSelected(date: Date) {
    this.currentCalendarMonth = date;
  }

  onCalendarDateSelected(date: Date) {
    this.selectedCalendarDate = date;
    this.getSelectedDateSchedules();
  }

  //Function to get onboarding scheduled data 
  getAllScheduledTableData() {
    if (this.originalData['all'] && this.originalData['all'].data) {
      return this.originalData['all'].data.filter(row =>
        ![null, undefined].includes(row.onboardingscheduled)
      );
    }
    return [];
  }

  // Function to get schedules 
  async getSelectedDateSchedules() {

    if (!this.selectedCalendarDate) {
      this.selectedDateSchedules = [];
      return;
    }

    const startDate = new Date(this.selectedCalendarDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(this.selectedCalendarDate);
    endDate.setHours(23, 59, 59, 999);

    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    let tempArray = [];
    tempArray = this.appointmentsData.filter((e) => e['starttime'] >= startTimestamp && e['endtime'] <= endTimestamp);
    this.selectedDateSchedules = tempArray;
  }

  //Function to get the count of scheduled appointments
  getTotalOnboardingScheduledCount(): number {
    const scheduledData = this.getAllScheduledTableData();
    return scheduledData.length;
  }

  //Function to get the count of scheduled appointments
  getTotalCoachingScheduledCount(): number {
    return this.appointmentsData.filter((e) => [null, undefined, ""].includes(e['onboarding']) && e['attended'] == false && e['cancelled'] == false).length;
  }

  //Function to get the count of scheduled appointments of current day
  getTodayCount(): number {
    const scheduledData = this.getAllScheduledTableData();
    const today = new Date();

    return scheduledData.filter(row => {
      if (row.onboardingscheduled) {
        const scheduleDate = row.onboardingscheduled.toDate();
        return scheduleDate.toDateString() === today.toDateString();
      }
      return false;
    }).length;
  }

  //Function to get the count of scheduled appointments of current month
  getMonthCount(): number {
    const scheduledData = this.getAllScheduledTableData();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    return scheduledData.filter(row => {
      if (row.onboardingscheduled) {
        const scheduleDate = row.onboardingscheduled.toDate();
        return scheduleDate.getMonth() === currentMonth &&
          scheduleDate.getFullYear() === currentYear;
      }
      return false;
    }).length;
  }

  hasScheduleOnDate(date: Date): boolean {

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    let appointmentLength = this.appointmentsData.filter((e) => e['starttime']?.toDate() >= startTimestamp.toDate() && e['endtime']?.toDate() <= endTimestamp.toDate()).length;

    return appointmentLength != 0 ? true : false;
  }


  dateClass = (date: Date): string => {
    return this.hasScheduleOnDate(date) ? 'has-schedule-dot' : '';
  };

  calculateDaysAgo(fromDate, toDate) {
    const daysDiff = Math.floor((fromDate?.getTime() - toDate?.getTime()) / (1000 * 3600 * 24));
    return daysDiff.toString() == '-1' ? 0 : daysDiff;
  }

  // Method to handle box clicks
  onBoxClick(boxType: string) {
    if (this.tableConfigs[boxType]) {
      if (this.currentTableConfig?.title === this.tableConfigs[boxType].title && this.showTable) {
        this.tableType = null;
        this.closeTable();
      } else {
        this.tableType = boxType;
        this.updateTable(boxType);
        this.showTable = true;
        this.currentPage = 1;

        // Reset search text when opening new table
        this.tableSearchText = '';

        // Scroll to table after a brief delay to allow rendering
        setTimeout(() => {
          const tableElement = document.querySelector('.jcd-table-section');
          if (tableElement) {
            tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    }
  }

  onCancelledClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  onDowngradeClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  onLess7DaysClick(event: Event) {
    event.stopPropagation();
    this.onBoxClick('less7Days');
  }

  onMore7DaysClick(event: Event) {
    event.stopPropagation();
    this.onBoxClick('more7Days');
  }

  onGrossSplitClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  onAssuredSplitClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  // Function to update table data 
  updateTable(boxType: string) {
    let configData = this.tableConfigs[boxType];
    configData['data'] = this.originalData[configData['dataKey']].data;

    // Store original data for filtering
    this.filteredTableData = [...configData['data']];
    this.currentTableConfig = configData;
    this.updateConfigData(configData);
    this.calculatePagination();
  }

  // Function to update config data 
  updateConfigData(configData: any) {
    this.journeyList = [];
    let tempJourney = [];

    configData['data'].map((row) => {
      configData['columns'].map((col) => {
        if (col.header.toLowerCase() === 'journey') {
          const cellValue = this.formatCellValue(row, col);
          if (!tempJourney.includes(cellValue)) {
            tempJourney.push(cellValue);
          }
        }
      });
    });

    this.journeyList = tempJourney;
  }

  // Calculate total pages
  calculatePagination() {
    this.totalPages = Math.ceil(this.currentTableConfig.data.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }

  // Update paginated data for display
  get updatePaginatedData() {

    let paginatedData = [];
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    paginatedData = this.currentTableConfig.data.slice(startIndex, endIndex);

    // Update the table config with paginated data
    if (this.currentTableConfig) {
      return paginatedData;
    }
    return '';
  }

  // Pagination controls
  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  // Next page
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  // Previous page
  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      // this.updatePaginatedData();
    }
  }

  // First page
  firstPage() {
    this.currentPage = 1;
    // this.updatePaginatedData();
  }

  // Last page
  lastPage() {
    this.currentPage = this.totalPages;
    // this.updatePaginatedData();
  }

  // Change items per page
  changeItemsPerPage(newSize: number) {
    this.itemsPerPage = newSize;
    this.currentPage = 1;
    this.calculatePagination();
  }

  // Get page numbers for pagination display
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;

    if (this.totalPages <= maxPagesToShow) {
      // Show all pages if total is less than max
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show limited pages with ellipsis
      const halfRange = Math.floor(maxPagesToShow / 2);
      let start = Math.max(1, this.currentPage - halfRange);
      let end = Math.min(this.totalPages, start + maxPagesToShow - 1);

      // Adjust start if we're near the end
      if (end === this.totalPages) {
        start = Math.max(1, end - maxPagesToShow + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }

    return pages;
  }

  // Check if column is sortable
  isSortable(column: any): boolean {
    return column.sortable !== false;
  }

  // Get sort icon for column
  getSortIcon(columnKey: string): string {
    if (this.sortColumn !== columnKey) {
      return '⇅'; // Both arrows
    }
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  // Export table data
  exportTableData() {
    const dataToExport = this.currentTableConfig.data;
    const columns = this.currentTableConfig?.columns || [];
    const headers = columns.map((col: any) => col.header);
    const worksheetData = [headers];

    dataToExport.forEach((row: any) => {
      const rowData = columns.map((col: any) => {
        const value = this.formatCellValue(row, col);
        return value;
      });
      worksheetData.push(rowData);
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Auto-size columns (optional but recommended)
    const maxWidths: number[] = [];
    worksheetData.forEach(row => {
      row.forEach((cell, colIndex) => {
        const cellLength = cell ? String(cell).length : 10;
        maxWidths[colIndex] = Math.max(maxWidths[colIndex] || 10, cellLength);
      });
    });

    ws['!cols'] = maxWidths.map(width => ({
      wch: Math.min(width + 2, 50) // Add padding, max width 50
    }));

    // Apply styles to header row
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_col(C) + '1';
      if (!ws[address]) continue;

      // Add header styling
      ws[address].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "E7E8F0" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // Add worksheet to workbook
    const sheetName = this.currentTableConfig?.title || 'Sheet1';
    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Excel sheet names max 31 chars

    // Generate filename with date
    const fileName = `${this.currentTableConfig?.title || 'export'}_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Write and download the file
    XLSX.writeFile(wb, fileName);
  }

  // Sort table by column
  sortTable(columnKey: string) {
    if (this.sortColumn === columnKey) {
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else if (this.sortDirection === 'desc') {
        this.sortDirection = null;
        this.sortColumn = null;

        this.currentTableConfig.data = [...this.filteredTableData];
        this.calculatePagination();
        return;
      }
    } else {
      this.sortColumn = columnKey;
      this.sortDirection = 'asc';
    }

    if (this.sortDirection) {
      this.currentTableConfig.data.sort((a, b) => {
        const valueA: any = this.getCellValue(a, columnKey);
        const valueB: any = this.getCellValue(b, columnKey);

        if (valueA == null && valueB == null) return 0;
        if (valueA == null) return this.sortDirection === 'asc' ? 1 : -1;
        if (valueB == null) return this.sortDirection === 'asc' ? -1 : 1;

        let comparison = 0;

        if (!isNaN(valueA) && !isNaN(valueB)) {
          comparison = Number(valueA) - Number(valueB);
        } else if (this.isDate(valueA) && this.isDate(valueB)) {
          comparison = new Date(valueA).getTime() - new Date(valueB).getTime();
        } else {
          comparison = valueA.toString().localeCompare(valueB.toString());
        }

        return this.sortDirection === 'asc' ? comparison : -comparison;
      });
    }
  }

  // Helper function to check if value is a date
  isDate(value: any): boolean {
    return value instanceof Date ||
      (typeof value === 'string' && !isNaN(Date.parse(value)));
  }

  // Close table view
  closeTable() {
    this.showTable = false;
    this.currentTableConfig = null;
    this.tableSearchText = '';
    this.filteredTableData = [];
    this.currentPage = 1;
    this.refreshFilter();
  }

  // Function to get difference of days from current date
  getDateDifferenceCategoryCode(inputDate: Date | string | Timestamp): number {
    let date: Date;

    // Handle different input types
    if (inputDate instanceof Timestamp) {
      // Firestore Timestamp
      date = inputDate.toDate();
    } else if (typeof inputDate === 'string') {
      // String date
      date = new Date(inputDate);
    } else if (inputDate instanceof Date) {
      // JavaScript Date
      date = inputDate;
    } else {
      // Fallback
      date = new Date(inputDate);
    }

    const today = new Date();
    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) return 1;        // 1 month or less
    if (diffDays <= 90) return 2;        // 2-3 months
    if (diffDays <= 180) return 3;       // 3-6 months
    return 4;                            // Greater than 6 months
  }

  // Function to format each cell value in table 
  formatCellValue(row: any, column: ColumnConfig): string {
    const value = row[column.key];

    if (value === null || value === undefined) {
      return '-';
    }

    if (column.key === 'generalnotes') {
      if (Array.isArray(value) && value.length > 0) {
        const lastNote = value[value.length - 1];
        if (lastNote && typeof lastNote === 'object' && lastNote.note) {
          return lastNote.note;
        }
      }
      return '-';
    }

    if (column.type === 'text') {
      const stringValue = value.toString();

      return column.substringEnd
        ? stringValue.substring(column.substringStart, column.substringEnd)
        : stringValue;
    }

    switch (column.type) {
      case 'date':
        return this.formatDate(value, column.format, column.mapValue);

      case 'currency':
        return this.formatCurrency(value, column.prefix, column.mapValue);

      case 'number':
        return this.formatNumber(value, column.prefix, column.suffix);

      case 'mapped':
        return this.mapValue(value, column.mapData, column.mapKey, column.mapValue);

      case 'custom':
        return column.mapper ? column.mapper(value) : value.toString();

      default:
        return value.toString();
    }
  }

  // Date formatting
  private formatDate(value: any, format?: string, mapValue?: string): string {
    if (!value) return '-';

    if (mapValue) {
      value = value[mapValue];
    }

    // Default format if not specified
    const dateFormat = format || 'dd-MMM-yyyy';

    // Handle string dates
    if (typeof value === 'string') {
      return this.datePipe.transform(new Date(value), dateFormat) || '-';
    }

    return this.datePipe.transform(value.toDate(), dateFormat) || '-';
  }

  // Currency formatting
  private formatCurrency(value: number, prefix?: string, mapValue?: string): string {
    if (!value && value !== 0) return '-';

    if (mapValue) {
      value = value[mapValue];
    }

    const symbol = prefix || '₹';
    const formatted = value.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });

    return `${symbol}${formatted}`;
  }

  // Number formatting
  private formatNumber(value: number, prefix?: string, suffix?: string): string {
    if (!value && value !== 0) return '-';

    const formatted = value.toLocaleString('en-IN');
    return `${prefix || ''}${formatted}${suffix || ''}`;
  }

  // Map value using dictionary
  private mapValue(value: any, mapData?: { [key: string]: any }, mapKey?: string, mapValue?: string): string {
    if (!mapData) return value.toString();
    let tempMap = '';

    if (mapKey) {
      // Check if it's array access like "[0].id"
      if (mapKey.startsWith('[')) {
        const match = mapKey.match(/\[(\d+)\]\.?(.*)$/);
        if (match) {
          const index = parseInt(match[1]);
          const property = match[2];

          tempMap = value?.[index];
          if (property) {
            tempMap = tempMap?.[property];
          }
        }
      } else {
        tempMap = value?.[mapKey];
      }
    } else {
      tempMap = value;
    }

    tempMap = mapValue ? mapData[tempMap]?.[mapValue] : mapData[tempMap];
    return tempMap || value.toString();
  }

  // Get value for a specific cell
  getCellValue(row: any, key: string): string {
    return row[key] || '-';
  }

  // Get theme class based on current table
  getTableThemeClass(): string {
    const themeMap: { [key: string]: string } = {
      'grossSales': 'gross-theme',
      'assuredSales': 'assured-theme',
      'grossValue': 'value-theme',
      'cancelledSales': 'canceled-theme',
      'downgradeSales': 'canceled-theme',
      'currentMonthEnd': 'yellow-theme',
      'nextMonthEnd': 'green-theme',
      'previousMonthEnd': 'orange-theme',
      'overallEnd': 'red-theme',
      'regularStatus': 'green-theme',
      'missedStatus': 'yellow-theme',
      'defaultedStatus': 'orange-theme',
      'lockedStatus': 'red-theme',
      'fullyPaidStatus': 'teal-theme',
      'notAssured': 'gray-theme',
      'toBeOnboarded': 'yellow-theme',
      'more7Days': 'red-theme',
      'less7Days': 'green-theme',
      'onboarded': 'dark-green-theme',
      'allProduct': 'gray-theme',
      'less30Product': 'yellow-theme',
      'more30Product': 'red-theme',
      'productInitiated': 'green-theme',
      'activeEngagement': 'green-theme',
      'less90Engagement': 'yellow-theme',
      'less180Engagement': 'orange-theme',
      'more180Engagement': 'red-theme',
    };

    // Find the key for current table
    for (const key in this.tableConfigs) {
      if (this.tableConfigs[key] === this.currentTableConfig) {
        return themeMap[key] || '';
      }
    }
    return '';
  }

  // Check if column should be highlighted
  shouldHighlightCell(columnKey: string): boolean {
    const highlightColumns = ['name', 'contractId', 'category'];
    return highlightColumns.includes(columnKey);
  }

  // Check if column should show as badge
  isBadgeColumn(columnKey: string): boolean {
    const badgeColumns = ['journey', 'paymentStatus'];
    return badgeColumns.includes(columnKey);
  }

  calculateDaysClosed(reportedDate: Date, closedDate: Date): string {
    const daysDiff = Math.floor((closedDate?.getTime() - reportedDate?.getTime()) / (1000 * 3600 * 24));
    return daysDiff.toString() == '-1' ? '0' : daysDiff.toString();
  }

  isRowSelected(row: any): boolean {
    return this.selectedRows.some(selectedRow => this.getRowIdentifier(selectedRow) === this.getRowIdentifier(row));
  }

  // Method to get unique identifier for a row 
  getRowIdentifier(row: any, index?: number): any {
    return row.id || row.profileId || row.email || `row_${index}`;
  }

  // Method to toggle individual row selection
  toggleRowSelection(row: any, event: any): void {
    if (event.checked) {
      if (!this.isRowSelected(row)) {
        this.selectedRows.push(row);
      }
    } else {
      this.selectedRows = this.selectedRows.filter(selectedRow =>
        this.getRowIdentifier(selectedRow) !== this.getRowIdentifier(row)
      );
    }
  }

  // Method to check if all visible rows are selected
  isAllSelected(): boolean {
    if (!this.updatePaginatedData || this.updatePaginatedData.length === 0) {
      return false;
    }
    return this.updatePaginatedData.every(row => this.isRowSelected(row));
  }

  // Method to check if some (but not all) rows are selected
  isPartiallySelected(): boolean {
    if (!this.updatePaginatedData || this.updatePaginatedData.length === 0) {
      return false;
    }
    const selectedCount = this.updatePaginatedData.filter(row => this.isRowSelected(row)).length;
    return selectedCount > 0 && selectedCount < this.updatePaginatedData.length;
  }

  // Method to toggle all rows selection
  toggleAllRows(event: any): void {
    const rows: any = this.updatePaginatedData || [];
    if (event.checked) {
      for (const row of rows as any[]) {
        if (!this.isRowSelected(row)) {
          this.selectedRows.push(row);
        }
      }
    } else {
      const newSelection: any[] = [];
      for (const selectedRow of this.selectedRows) {
        const isVisibleRow = (rows as any[]).some(
          (row: any) =>
            this.getRowIdentifier(selectedRow) === this.getRowIdentifier(row)
        );
        if (!isVisibleRow) {
          newSelection.push(selectedRow);
        }
      }
      this.selectedRows = newSelection;
    }
  }

  // Method to clear all selections (call this when closing table or changing filters)
  clearSelection(): void {
    this.selectedRows = [];
  }

  openEmailDialog(): void {
    this.dialog.open(EmailInputComponent, {
      minWidth: '600px',
      data: this.selectedRows
    });
  }

  // Function to open dialog to view participants data for ecosystem data 
  openEcoDialog(element: any, head: any, subHead: any = null, profileIdWiseCount: any = null, metrics: any = null, prevMetric: any = null, metricsection: any = null) {
    let dialogData = {};
    if (['Total ATC', 'Unvalidated ATC', 'Completed ATC', 'Total Adjustment'].includes(head)) {
      dialogData = element.sort((a, b) => b['prescription_date'] - a['prescription_date']);
    } else {
      dialogData = element;
    }
    var dialogRef = this.dialog.open(EcoSystemDialogComponent, {
      data: {
        element: dialogData,
        heading: head,
        subhead: subHead,
        profileIdWiseCountData: profileIdWiseCount,
        metricData: metrics,
        previoudMetricData: prevMetric,
        metricSection: metricsection
      },
      autoFocus: false,
      width: '90%',
      height: '95%',
    });
  }

  compareByValueLengthDesc(a: KeyValue<string, any>, b: KeyValue<string, any>): number {
    return b.value.length - a.value.length;
  }

  compareByValueDesc(a: KeyValue<string, number>, b: KeyValue<string, number>): number {
    return b.value - a.value;
  }

  scrollToExtendedLifeImpact() {
    const element = document.getElementById('extended-life-content');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.classList.add('highlight2');
      setTimeout(() => {
        element.classList.remove('highlight2');
      }, 2000);
    }
  }

  // Function to navigate to profile 
  profileNavigation(profileId: string) {
    const profileid = profileId;
    if (profileId.length < 10) {
      alert("No profile for this")
    } else {
      const navigationurl = 'userprofile';
      const url = `${navigationurl}/${profileid}`;
      window.open(url, '_blank');
    }
  }

  // Function to navigate screen to customer support 
  navigateToCustomerSupport() {
    if (window.location.port.includes('4200')) {
      window.open(`http://localhost:4200/customersupportdashboard`, '_blank');
    } else if (environment.firebase.projectId == 'starlabs-test') {
      window.open(`https://starlabs-test-19.web.app/customersupportdashboard`, '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open(`https://breakthroughs.app/customersupportdashboard`, '_blank');
    }
  }

  // Function to navigate screen to onboarding pipeline
  navigateToOnboardingPipeline() {
    window.open('/onboarding-pipeline', '_blank');
  }

  // Function to navigate screen to mode dashboard
  navigateToModeDashboard() {
    if (window.location.port.includes('4200')) {
      window.open(`http://localhost:4200/mode-dashboard-new`, '_blank');
    } else if (environment.firebase.projectId == 'starlabs-test') {
      window.open(`https://starlabs-test-19.web.app/mode-dashboard-new`, '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open(`https://breakthroughs.app/mode-dashboard-new`, '_blank');
    }
  }

  // Function to highlight row based on status 
  highlightRow(row: any) {
    if (this.tableType === 'grossSales' || this.tableType === 'grossDowngradeSales' || this.tableType === 'grossCancelledSales') {
      if ([null, undefined, "", "pending"].includes(row['status']?.toLowerCase())) {
        return 'pending-highlight'
      } else if (row['status']?.toLowerCase() == 'approved' && ![null, undefined, ""].includes(row['paymentplan'])) {
        return 'assured-highlight'
      } else {
        return ''
      }
    } if (this.tableType === 'overallParticipants') {
      const customerStatus = row['customerstatus']?.toLowerCase();

      if (customerStatus === 'active') {
        return 'active-highlight';
      } else if (customerStatus === 'non active') {
        return 'non-active-highlight';
      } else if (['discontinued', 'banned', 'late'].includes(customerStatus)) {
        return 'discontinued-highlight';
      }
    }
    return ''
  }

  // Function to get count of pending sales 
  getPendingCount() {
    return this.currentTableConfig.data.filter((e) => [null, undefined, "", "pending"].includes(e['status']?.toLowerCase())).length;
  }

  // Function to get count of assured 
  getAssuredCount() {
    return this.currentTableConfig.data.filter((e) => ![null, undefined, ""].includes(e['paymentplan'])).length;
  }

  // Function to get count of not assured 
  getNotAssuredCount() {
    return this.currentTableConfig.data.filter((e) => [null, undefined, ""].includes(e['paymentplan']) && e['status']?.toLowerCase() == 'approved').length;
  }

  // Function to get count of active participants
  getActiveCount(): number {
    if (!this.currentTableConfig?.data) return 0;
    return this.currentTableConfig.data.filter((e) =>
      e['customerstatus']?.toLowerCase() === 'active'
    ).length;
  }

  // Function to get count of non-active participants
  getNonactiveCount(): number {
    if (!this.currentTableConfig?.data) return 0;
    return this.currentTableConfig.data.filter((e) =>
      e['customerstatus']?.toLowerCase() === 'non active'
    ).length;
  }

  // Function to get count of discontinued participants
  getDiscontinuedCount(): number {
    if (!this.currentTableConfig?.data) return 0;
    return this.currentTableConfig.data.filter((e) =>
      ['discontinued', 'banned', 'late'].includes(e['customerstatus']?.toLowerCase())
    ).length;
  }

  // shouldHighlightWaitingPeriod(row: any): boolean {
  //   return this.tableType === 'grossSales';
  // }

  // Function to calculate gross waiting period 
  calculateGrossWaitingPeriod(purchaseDate: Date): number {
    if (!purchaseDate) return 0;
    let comparisonDate = new Date();

    const timeDifference = comparisonDate.getTime() - purchaseDate.getTime();
    const daysDifference = Math.floor(timeDifference / (1000 * 3600 * 24));
    return daysDifference;
  }

  // Function to calculate assured waiting period 
  calculateAssuredWaitingPeriod(purchaseDate: Date, comparisonDate: Date): number {
    if (!purchaseDate || !comparisonDate) return 0;

    const timeDifference = comparisonDate.getTime() - purchaseDate.getTime();
    const daysDifference = Math.floor(timeDifference / (1000 * 3600 * 24));
    return daysDifference;
  }

  // Add this method to your component
  calculateDelayedDays(enachDate: Date): number {
    if (!enachDate) return 0;

    const today = new Date();
    const timeDifference = today.getTime() - enachDate.getTime();
    const daysDifference = Math.floor(timeDifference / (1000 * 3600 * 24));

    return daysDifference;
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
        updateDoc(doc(this.firestore, 'participant metadata', element['profileid']), {
          generalnotes: element['generalnotes']
        }).then(() => {
          console.log("Notes Updated Successfully");
          this.guard.openSnackBar("Notes Updated Successfully", "OK", 600);
        }).catch((error) => {
          this.guard.openSnackBar("Oops! Error While Updating Notes", "OK", 600);
          console.error("Oops! Error While Updating Notes");
        });
      }
    })
  }

  showParticipantMenu(row: any, event: Event) {
    event.stopPropagation();
    this.participantTableLocations = [];

    const participantId = row.profileid;
    const participantEmail = row.email;

    Object.keys(this.tableConfigs).forEach(tableKey => {
      const config = this.tableConfigs[tableKey];
      const dataExists = this.originalData[config.dataKey]?.data?.some(item =>
        item.profileid === participantId ||
        item.email === participantEmail
      );

      if (dataExists && this.tableDisplayMap[tableKey]) {
        this.participantTableLocations.push(this.tableDisplayMap[tableKey]);
      }
    });
  }

  // Function to get atc alpha data 
  getAtcAlpha() {
    let atcQuery: any;
    let unvalidatedATCQuery: any;

    if (this.filterMode === 'queue' && this.selectedQueueIds.length > 0) {
      // Queue mode — no date filter
      atcQuery = query(
        collection(this.firestore, "atc_alpha"),
        where('queueid', 'in', this.selectedQueueIds),
        where("isdelete", "==", false)
      );
      unvalidatedATCQuery = query(
        collection(this.firestore, "atc_to_validate"),
        where('queueid', 'in', this.selectedQueueIds),
        where("isdelete", "==", false)
      );
      this.dateRangeHint = `${this.selectedQueueIds.length} queue${this.selectedQueueIds.length > 1 ? 's' : ''} selected`;
    } else {
      // Date mode
      const startInput = this.filterStartDate ? new Date(this.filterStartDate) : new Date();
      const endInput = this.filterEndDate ? new Date(this.filterEndDate) : new Date();

      const currentMonthStart = new Date(startInput);
      currentMonthStart.setHours(0, 0, 0, 0);
      const currentMonthEnd = new Date(endInput);
      currentMonthEnd.setHours(23, 59, 59, 999);

      currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
      currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

      const startdate = Timestamp.fromDate(currentMonthStart).toDate();
      const enddate = Timestamp.fromDate(currentMonthEnd).toDate();

      if (!startdate || !enddate) return;

      atcQuery = query(
        collection(this.firestore, "atc_alpha"),
        where('prescription_date', '>=', startdate),
        where('prescription_date', '<=', enddate),
        where("isdelete", "==", false)
      );
      unvalidatedATCQuery = query(
        collection(this.firestore, "atc_to_validate"),
        where('prescription_date', '>=', startdate),
        where('prescription_date', '<=', enddate),
        where("isdelete", "==", false)
      );

      if (this.filterStartDate && this.filterEndDate) {
        const sf = new Date(this.filterStartDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const ef = new Date(this.filterEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        this.dateRangeHint = `${sf} → ${ef}`;
      }
    }

    this.subscriptions['atctovalidate'] = collectionData(unvalidatedATCQuery).subscribe((unvalidated) => {
      this.unvalidatedATC = unvalidated;
    });

    this.subscriptions['atcalpha'] = collectionData(atcQuery, { idField: 'id' }).subscribe((docs: any[]) => {
      const validDocs = docs;
      const docCount = docs.length;

      // Build queue list from docs when in date mode
      if (this.filterMode !== 'queue') {
        this.buildQueueList(docs);
      }

      let tempTotalAdjustmentsCompleted = 0;
      let tempEvolutionYearSaved = 0;
      let tempEvolutionYearWasted = 0;
      let tempTotalAdjustmentAware = 0;
      let tempTotalAdjustmentUnAware = 0;
      let tempExtendedLifeImpactTotal = 0;
      let tempExtendedLifeImpactMap: { [key: string]: number } = {};
      let tempEvolutionprogressMap: { [key: string]: number } = {};
      let tempProductCountMap: { [key: string]: string[] } = {};
      let tempTotalATC: { [key: number]: string[] } = {};
      let tempPercentageCompleted = [];
      let tempPercentageOngoing = 0;
      let tempTotalProductCount = 0;
      let tempEvolutionProgressProfileMap: Record<string, { profileId: string; sum: number; docTotal: number }[]> = {};

      let tempTotalAdjustmentUnAwareMap = {
        count: 0, profileIds: [] as string[], data: [],
        profileIdWiseCount: {} as { [key: string]: number }
      };
      let tempTotalAdjustmentAwareMap = {
        count: 0, profileIds: [] as string[], data: [],
        profileIdWiseCount: {} as { [key: string]: number }
      };
      let tempEvolutionYearWastedMap = {
        count: 0, data: [], profileIds: [] as string[],
        profileIdWiseCount: {} as { [key: string]: number }
      };
      let tempEvolutionYearSavedMap = {
        count: 0, profileIds: [] as string[], data: [],
        profileIdWiseCount: {} as { [key: string]: number }
      };
      let tempTotalAdjustmentsCompletedMap = {
        count: 0, profileIds: [] as string[], data: [],
        profileIdWiseCount: {} as { [key: string]: number }
      };

      validDocs.forEach((atcData) => {
        const profileId = atcData['profileid'];

        if (!tempTotalATC[docCount]) tempTotalATC[docCount] = [];
        if (atcData) tempTotalATC[docCount].push(atcData);

        const totalAdjustments = atcData['totaladjustment'] || 0;
        const totalAdjustmentsCompleted = atcData['totaladjustmentcompleted'] || 0;
        const percentageCompleted = totalAdjustments > 0
          ? (totalAdjustmentsCompleted / totalAdjustments) * 100 : 0;

        if (percentageCompleted >= 75) {
          tempPercentageCompleted.push(atcData);
        } else {
          tempPercentageOngoing += 1;
        }

        if (atcData['totaladjustment'] != null) {
          const adjSavedCount = atcData['totaladjustment'];
          tempTotalAdjustmentsCompleted += adjSavedCount;
          tempTotalAdjustmentsCompletedMap.count = tempTotalAdjustmentsCompleted;
          tempTotalAdjustmentsCompletedMap.data.push(atcData);
          if (profileId && !tempTotalAdjustmentsCompletedMap.profileIds.includes(profileId))
            tempTotalAdjustmentsCompletedMap.profileIds.push(profileId);
          if (!tempTotalAdjustmentsCompletedMap.profileIdWiseCount[profileId])
            tempTotalAdjustmentsCompletedMap.profileIdWiseCount[profileId] = 0;
          tempTotalAdjustmentsCompletedMap.profileIdWiseCount[profileId] += adjSavedCount;
        }

        if (atcData['evolutionyearsaved'] != null) {
          const savedAmount = atcData['evolutionyearsaved'];
          tempEvolutionYearSaved += savedAmount;
          tempEvolutionYearSavedMap.count = tempEvolutionYearSaved;
          tempEvolutionYearSavedMap.data.push(atcData);
          if (profileId && !tempEvolutionYearSavedMap.profileIds.includes(profileId))
            tempEvolutionYearSavedMap.profileIds.push(profileId);
          if (!tempEvolutionYearSavedMap.profileIdWiseCount[profileId])
            tempEvolutionYearSavedMap.profileIdWiseCount[profileId] = 0;
          tempEvolutionYearSavedMap.profileIdWiseCount[profileId] += savedAmount;
        }

        if (atcData['evolutionyearwasted'] != null) {
          const wastedAmount = atcData['evolutionyearwasted'];
          tempEvolutionYearWasted += wastedAmount;
          tempEvolutionYearWastedMap.count = tempEvolutionYearWasted;
          tempEvolutionYearWastedMap.data.push(atcData);
          if (profileId && !tempEvolutionYearWastedMap.profileIds.includes(profileId))
            tempEvolutionYearWastedMap.profileIds.push(profileId);
          if (!tempEvolutionYearWastedMap.profileIdWiseCount[profileId])
            tempEvolutionYearWastedMap.profileIdWiseCount[profileId] = 0;
          tempEvolutionYearWastedMap.profileIdWiseCount[profileId] += wastedAmount;
        }

        if (atcData['totaladjustmentaware'] != null) {
          const awareCount = atcData['totaladjustmentaware'];
          tempTotalAdjustmentAware += awareCount;
          tempTotalAdjustmentAwareMap.count = tempTotalAdjustmentAware;
          tempTotalAdjustmentAwareMap.data.push(atcData);
          if (profileId && !tempTotalAdjustmentAwareMap.profileIds.includes(profileId))
            tempTotalAdjustmentAwareMap.profileIds.push(profileId);
          if (!tempTotalAdjustmentAwareMap.profileIdWiseCount[profileId])
            tempTotalAdjustmentAwareMap.profileIdWiseCount[profileId] = 0;
          tempTotalAdjustmentAwareMap.profileIdWiseCount[profileId] += awareCount;
        }

        if (atcData['totaladjustmentunaware'] != null) {
          const unAwareCount = atcData['totaladjustmentunaware'];
          tempTotalAdjustmentUnAware += unAwareCount;
          tempTotalAdjustmentUnAwareMap.count = tempTotalAdjustmentUnAware;
          tempTotalAdjustmentUnAwareMap.data.push(atcData);
          if (profileId && !tempTotalAdjustmentUnAwareMap.profileIds.includes(profileId))
            tempTotalAdjustmentUnAwareMap.profileIds.push(profileId);
          if (!tempTotalAdjustmentUnAwareMap.profileIdWiseCount[profileId])
            tempTotalAdjustmentUnAwareMap.profileIdWiseCount[profileId] = 0;
          tempTotalAdjustmentUnAwareMap.profileIdWiseCount[profileId] += unAwareCount;
        }

        if (atcData['product'] != null) {
          const product = atcData['product'];
          if (!tempProductCountMap[product]) tempProductCountMap[product] = [];
          if (profileId) tempProductCountMap[product].push(profileId);
          tempTotalProductCount += 1;
        }

        if (atcData['extendedlifeimpact'] != null) {
          Object.entries(atcData['extendedlifeimpact']).forEach(([key, value]) => {
            tempExtendedLifeImpactTotal += value as number;
            tempExtendedLifeImpactMap[key] = (tempExtendedLifeImpactMap[key] || 0) + (value as number);
          });
        }

        if (atcData['evolutionprogress'] != null) {
          Object.entries(atcData['evolutionprogress']).forEach(([key, value]) => {
            tempEvolutionprogressMap[key] = (tempEvolutionprogressMap[key] || 0) + (value as number);
            const pid = atcData['profileid'] ?? atcData['id'];
            const docTotal = Object.values(atcData['evolutionprogress'] as Record<string, number>)
              .reduce((a, b) => a + b, 0);
            if (!tempEvolutionProgressProfileMap[key]) tempEvolutionProgressProfileMap[key] = [];
            tempEvolutionProgressProfileMap[key].push({ profileId: pid, sum: Number(value), docTotal });
          });
        }
      });

      this.evolutionYearSaved = tempEvolutionYearSaved;
      this.evolutionYearWasted = tempEvolutionYearWasted;
      this.totalAdjustmentAware = tempTotalAdjustmentAware;
      this.totalAdjustmentUnAware = tempTotalAdjustmentUnAware;
      this.extendedLifeImpactTotal = tempExtendedLifeImpactTotal;
      this.extendedLifeImpactMap = tempExtendedLifeImpactMap;
      this.evolutionprogressMap = tempEvolutionprogressMap;
      this.productCountMap = tempProductCountMap;
      this.totalATC = tempTotalATC;
      this.percentageCompleted = tempPercentageCompleted;
      this.percentageOngoing = tempPercentageOngoing;
      this.totalProductCount = tempTotalProductCount;
      this.totalAdjustmentUnAwareMap = tempTotalAdjustmentUnAwareMap;
      this.totalAdjustmentAwareMap = tempTotalAdjustmentAwareMap;
      this.evolutionYearWastedMap = tempEvolutionYearWastedMap;
      this.evolutionYearSavedMap = tempEvolutionYearSavedMap;
      this.totalAdjustmentsCompletedMap = tempTotalAdjustmentsCompletedMap;
      this.evolutionprogressMap = tempEvolutionprogressMap;
      this.processEvolutionProgressFromMap(tempEvolutionProgressProfileMap);
      this.buildHealthOverview();

      this.cdr.markForCheck();
      this.buildDisplayLists();
      this.cdr.markForCheck(); 
    });
  }

  buildQueueList(docs: any[]): void {
    const seen = new Set<string>();
    docs.forEach(doc => {
      const qid = doc['queueid'];
      if (qid && !seen.has(qid)) {
        seen.add(qid);
        if (!this.queueList.find(q => q.id === qid)) {
          this.queueList.push({ id: qid, name: doc['queuename'] ?? qid });
        }
      }
    });
  }

  // Function to calculate evolution process percentage 
  processEvolutionProgressFromMap(keyProfileMap: Record<string, { profileId: string; sum: number; docTotal: number }[]>): void {
    const keys = Object.keys(keyProfileMap);

    const bands = [
      { label: '< 25%', range: [0, 25] as [number, number], profiles: {} as Record<string, any[]> },
      { label: '25 – 50%', range: [25, 50] as [number, number], profiles: {} as Record<string, any[]> },
      { label: '50 – 75%', range: [50, 75] as [number, number], profiles: {} as Record<string, any[]> },
      { label: '75 – 100%', range: [75, 101] as [number, number], profiles: {} as Record<string, any[]> },
    ];

    const totals: Record<string, number> = {};

    keys.forEach(key => {
      const allEntries = keyProfileMap[key];
      totals[key] = allEntries.reduce((a, b) => a + b.sum, 0);

      allEntries.forEach(({ profileId, sum, docTotal }) => {
        const pct = docTotal > 0 ? Math.round((sum / docTotal) * 100) : 0;
        const profileName = this.mapprofile[profileId] ?? profileId;
        const profile = { profileId, profileName, total: sum, pct };
        const band = bands.find(b => pct >= b.range[0] && pct < b.range[1]);
        if (band) {
          if (!band.profiles[key]) band.profiles[key] = [];
          band.profiles[key].push(profile);
        }
      });
    });

    this.evolutionProgressData = { keys, bands, totals };
    this.cdr.markForCheck();
  }

  buildHealthOverview(): void {
    const map = this.evolutionprogressMap as Record<string, number>;
    const total = Object.values(map).reduce((a: number, b: number) => a + b, 0);
    if (total === 0) return;

    const colors = ['#639922', '#1D9E75', '#378ADD', '#EF9F27', '#E24B4A'];
    const tags = [
      { t: 'Top key', bg: '#EAF3DE', c: '#27500A' },
      { t: 'Strong', bg: '#E1F5EE', c: '#085041' },
      { t: 'Moderate', bg: '#E6F1FB', c: '#0C447C' },
      { t: 'Watch', bg: '#FAEEDA', c: '#633806' },
      { t: 'At risk', bg: '#FCEBEB', c: '#791F1F' },
    ];

    const sorted: [string, number][] = (Object.entries(map) as [string, number][])
      .sort((a, b) => b[1] - a[1]);

    const maxCount: number = sorted[0]?.[1] ?? 1;

    // Count unique profiles per dominant key from evolutionProgressData
    const profileCountPerKey: Record<string, number> = {};
    if (this.evolutionProgressData) {
      const profileAllAreas: Record<string, Record<string, number>> = {};
      this.evolutionProgressData.keys.forEach(k => {
        this.evolutionProgressData!.bands.forEach(band => {
          (band.profiles[k] ?? []).forEach(p => {
            if (!profileAllAreas[p.profileId]) profileAllAreas[p.profileId] = {};
            profileAllAreas[p.profileId][k] = (profileAllAreas[p.profileId][k] ?? 0) + p.total;
          });
        });
      });
      Object.entries(profileAllAreas).forEach(([, areas]) => {
        const dominant = Object.entries(areas).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (dominant) profileCountPerKey[dominant] = (profileCountPerKey[dominant] ?? 0) + 1;
      });
    }

    this.healthKeyData = sorted.map(([key, count], i) => ({
      key,
      count,
      pct: Math.round((count / total) * 100),
      barPct: Math.round((count / maxCount) * 100),
      profileCount: profileCountPerKey[key] ?? 0,
      color: colors[i] ?? '#888780',
      tag: tags[i]?.t ?? '',
      tagBg: tags[i]?.bg ?? '#F1EFE8',
      tagColor: tags[i]?.c ?? '#444441',
    }));

    // Clear insights — no longer used
    this.healthInsights = [];
    this.cdr.markForCheck();
  }

  // Function to open the cross over metrics dialog 
  openCrossoverMetricsDialog() {
    const currentMonthStart = new Date(this.startDate);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthEnd = new Date(this.endDate);
    currentMonthEnd.setHours(23, 59, 59, 999);

    currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
    currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

    let startdate = Timestamp.fromDate(currentMonthStart).toDate();
    let enddate = Timestamp.fromDate(currentMonthEnd).toDate();

    this.dialog.open(CrossOverMetricsDialogComponent, {
      data: {
        startdate: startdate,
        enddate: enddate,
        mapProfile: this.mapprofile
      },
      disableClose: true
    });
  }

  onMonthsCountChange(): void {
    if (!this.numberOfMonths || this.numberOfMonths < 1) return;
    this.filterEndDate = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - this.numberOfMonths);
    start.setDate(1);
    this.filterStartDate = start;
    this.updateDateRangeHint();
    this.loadInterimData();
    this.getAtcAlpha();
  }

  onDateRangeChange(): void {
    if (!this.filterStartDate || !this.filterEndDate) return;
    const start = new Date(this.filterStartDate);
    const end = new Date(this.filterEndDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    const diffMs = end.getTime() - start.getTime();
    this.numberOfMonths = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.5)));
    this.updateDateRangeHint();
    this.loadInterimData();
    this.getAtcAlpha();
  }

  stepMonths(delta: number): void {
    this.numberOfMonths = Math.max(1, Math.min(24, this.numberOfMonths + delta));
    this.onMonthsCountChange(); // already calls loadInterimData
  }

  private loadInterimData(): void {
    if (!this.filterStartDate || !this.filterEndDate) return;
    this.isFetchingData = true;
    this.monthSummaries = [];
    this.activeMonthIndex = 0;
    this.cdr.markForCheck();

    const startDateObj = new Date(this.filterStartDate);
    startDateObj.setHours(0, 0, 0, 0);
    const endDateObj = new Date(this.filterEndDate);
    endDateObj.setHours(23, 59, 59, 999);

    this.fetchAskAHAndLoveLetterData(startDateObj, endDateObj);
  }

  private fetchAskAHAndLoveLetterData(startDate: Date, endDate: Date): void {
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const askAHQuery = query(
      collection(this.firestore, 'ask AH'),
      where('created', '>=', startTimestamp),
      where('created', '<=', endTimestamp)
    );

    const loveLetterQuery = query(
      collection(this.firestore, 'love letter'),
      where('created', '>=', startTimestamp),
      where('created', '<=', endTimestamp)
    );

    this.subscriptions['askAH']?.unsubscribe();
    this.subscriptions['askAH'] = combineLatest([
      collectionData(askAHQuery, { idField: 'id' }),
      collectionData(loveLetterQuery, { idField: 'id' })
    ]).subscribe({
      next: ([askAHRaw, loveLetterRaw]: [any[], any[]]) => {
        const askAHDocs = askAHRaw.map(doc => ({ ...doc, source: 'ask AH' }));
        const loveLetterDocs = loveLetterRaw.map(doc => ({ ...doc, source: 'love letter' }));
        const allDocs = [...askAHDocs, ...loveLetterDocs];

        this.askAHLoveLetterSummary = {
          total: allDocs.length,
          tagged: allDocs.filter(d => d['tagged'] === true).length,
          opportunity: allDocs.filter(d => d['opportunity'] === true).length,
          liked: allDocs.filter(d => d['liked'] === true).length,
          critical: allDocs.filter(d => d['critical'] === true).length,
          unflagged: allDocs.filter(d => !d['tagged'] && !d['opportunity'] && !d['liked'] && !d['critical']).length,

          resolvedTotal: allDocs.filter(d => d['resolved'] === true).length,
          resolvedLiked: allDocs.filter(d => d['liked'] && d['resolved']).length,
          resolvedTagged: allDocs.filter(d => d['tagged'] && d['resolved']).length,
          resolvedOpportunity: allDocs.filter(d => d['opportunity'] && d['resolved']).length,
          resolvedCritical: allDocs.filter(d => d['critical'] && d['resolved']).length,

          askAH: {
            total: askAHDocs.length,
            tagged: askAHDocs.filter(d => d['tagged'] === true).length,
            opportunity: askAHDocs.filter(d => d['opportunity'] === true).length,
            liked: askAHDocs.filter(d => d['liked'] === true).length,
            critical: askAHDocs.filter(d => d['critical'] === true).length,
            resolved: askAHDocs.filter(d => d['resolved'] === true).length,
            docs: askAHDocs
          },
          loveLetter: {
            total: loveLetterDocs.length,
            tagged: loveLetterDocs.filter(d => d['tagged'] === true).length,
            opportunity: loveLetterDocs.filter(d => d['opportunity'] === true).length,
            liked: loveLetterDocs.filter(d => d['liked'] === true).length,
            critical: loveLetterDocs.filter(d => d['critical'] === true).length,
            resolved: loveLetterDocs.filter(d => d['resolved'] === true).length,
            docs: loveLetterDocs
          }
        };

        this.isFetchingData = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('fetchAskAHAndLoveLetterData error:', err);
        this.isFetchingData = false;
        this.cdr.markForCheck();
      }
    });
  }

  private updateDateRangeHint(): void {
    if (this.filterStartDate && this.filterEndDate) {
      const sf = new Date(this.filterStartDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const ef = new Date(this.filterEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      this.dateRangeHint = `${sf} → ${ef}`;
    }
  }

  private async fetchAELAndInterimData(startDate: Date, endDate: Date): Promise<any[]> {
    const CATEGORIES = this.CATEGORIES;

    const [aelSnapshot, interimSnapshot] = await Promise.all([
      getDocs(collection(this.firestore, 'accelerated evolution level')),
      getDocs(query(
        collection(this.firestore, 'interim crossover'),
        where('created', '>=', Timestamp.fromDate(startDate)),
        where('created', '<=', Timestamp.fromDate(endDate))
      ))
    ]);

    // Build AEL lookup map keyed by "startpoint_endpoint"
    const aelLookupMap: Record<string, any> = {};
    aelSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const startPoint = data['startpoint'];
      const endPoint = data['endpoint'];
      if (startPoint != null && endPoint != null) {
        aelLookupMap[`${startPoint}_${endPoint}`] = { id: doc.id, ...data };
      }
    });

    // Group docs by profileId
    const profileDocsMap: Record<string, any[]> = {};

    interimSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const profileId = data['profileid'];
      if (!profileId) return;

      const rawMetric = data['metric'] ?? {};
      const enrichedMetric: Record<string, any> = {};

      CATEGORIES.forEach(category => {
        const categoryData = rawMetric[category] ?? {};
        const startPoint = categoryData['startpoint'];
        const endPoint = categoryData['endpoint'];
        const matchedAEL = aelLookupMap[`${startPoint}_${endPoint}`];
        enrichedMetric[category] = {
          ...categoryData,
          sequence: matchedAEL?.['sequence'] ?? null
        };
      });

      if (!profileDocsMap[profileId]) profileDocsMap[profileId] = [];
      profileDocsMap[profileId].push({ id: doc.id, ...data, metric: enrichedMetric });
    });

    // Group by profileId + yearMonth, compare consecutive docs
    const monthResultMap: Record<string, any> = {};

    Object.entries(profileDocsMap).forEach(([profileId, docs]) => {
      // Sort desc — newest first
      docs.sort((a, b) => b['created'].toDate() - a['created'].toDate());

      docs.forEach((doc, index) => {
        const createdDate: Date = doc['created'].toDate();
        const year = createdDate.getFullYear();
        const month = String(createdDate.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}-${month}`;

        if (!monthResultMap[yearMonth]) {
          monthResultMap[yearMonth] = { yearMonth, interimDocs: [] };
        }

        // Compare with previous (older) doc — index+1 in desc sorted array
        const previousDoc = docs[index + 1] ?? null;
        let comparison: any = null;

        if (previousDoc) {
          const allSame = CATEGORIES.every(cat => {
            const curr = doc.metric[cat];
            const prev = previousDoc.metric[cat];
            return curr?.startpoint === prev?.startpoint && curr?.endpoint === prev?.endpoint;
          });

          if (allSame) {
            comparison = { status: 'no change', progressedAreas: [], regressedAreas: [], changedCount: 0 };
          } else {
            const progressedAreas: string[] = [];
            const regressedAreas: string[] = [];

            CATEGORIES.forEach(cat => {
              const currSeq = doc.metric[cat]?.sequence ?? null;
              const prevSeq = previousDoc?.metric[cat]?.sequence ?? null;
              if (currSeq != null && prevSeq != null) {
                if (Number(currSeq) > Number(prevSeq)) progressedAreas.push(cat);
                else if (Number(currSeq) < Number(prevSeq)) regressedAreas.push(cat);
              }
            });

            const totalChanged = progressedAreas.length + regressedAreas.length;
            const changedCount: number | 'all' = totalChanged === 5 ? 'all' : totalChanged;

            // No longer single status — profile can be in BOTH progressed and regressed
            const isProgressed = progressedAreas.length > 0;
            const isRegressed = regressedAreas.length > 0;
            const isNoChange = !isProgressed && !isRegressed;

            comparison = {
              status: isNoChange ? 'no change' : 'changed',
              progressedAreas,
              regressedAreas,
              changedCount
            };
          }
        }

        monthResultMap[yearMonth].interimDocs.push({
          ...doc,
          profileid: profileId,
          comparison,
          _previousDoc: previousDoc
        });
      });
    });

    return Object.values(monthResultMap).sort((a, b) =>
      a.yearMonth.localeCompare(b.yearMonth)
    );
  }

  // ── Map raw result → MonthSummary ─────────────────────────────────────────

  private mapRawResultToMonthSummary(rawResult: any): MonthSummary {
    const progressedProfiles: InterimProfile[] = [];
    const regressedProfiles: InterimProfile[] = [];
    const noChangeProfiles: InterimProfile[] = [];

    const progressedAreaBreakdown: Record<string | number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, all: 0 };
    const regressedAreaBreakdown: Record<string | number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, all: 0 };
    const progressedCategoryBreakdown: Record<string, number> = {};
    const regressedCategoryBreakdown: Record<string, number> = {};
    this.CATEGORIES.forEach(cat => {
      progressedCategoryBreakdown[cat] = 0;
      regressedCategoryBreakdown[cat] = 0;
    });

    for (const doc of (rawResult.interimDocs ?? [])) {
      const profileId: string = doc.profileid ?? '';
      const profileEntry = this.mapMetaData[profileId];
      const profileName: string = profileEntry?.name ?? profileId;

      const createdDate = doc.created?.toDate
        ? doc.created.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
        : (doc.date ?? '');

      const comparisonStatus = doc.comparison?.status ?? 'no change';
      const progressedAreas: string[] = doc.comparison?.progressedAreas ?? [];
      const regressedAreas: string[] = doc.comparison?.regressedAreas ?? [];
      const rawChangedCount = doc.comparison?.changedCount ?? 0;
      const changedCount: number | 'all' = rawChangedCount === 'all' ? 'all' : rawChangedCount;

      const previousDoc = doc.comparison ? doc._previousDoc ?? null : null;
      const previousMetric = previousDoc?.metric ?? null;
      const previousCreatedDate = previousDoc?.created?.toDate
        ? previousDoc.created.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

      const interimProfile: InterimProfile = {
        profileId,
        profileName,
        createdDate,
        changedCount,
        progressedAreas,
        regressedAreas,
        metric: doc.metric ?? {},
        previousMetric,
        previousCreatedDate
      };

      if (!doc.comparison || comparisonStatus === 'no change') {
        noChangeProfiles.push(interimProfile);
      } else {
        // Add to progressed if any areas progressed
        if ((doc.comparison.progressedAreas ?? []).length > 0) {
          progressedProfiles.push(interimProfile);
          const progressedCount = doc.comparison.progressedAreas.length === 5
            ? 'all' : doc.comparison.progressedAreas.length;
          const areaKey: string | number = progressedCount === 'all' ? 'all' : progressedCount as number;
          progressedAreaBreakdown[areaKey] = (progressedAreaBreakdown[areaKey] ?? 0) + 1;
          doc.comparison.progressedAreas.forEach((cat: string) => {
            if (progressedCategoryBreakdown[cat] !== undefined) progressedCategoryBreakdown[cat]++;
          });
        }

        // Add to regressed if any areas regressed — independent of progressed
        if ((doc.comparison.regressedAreas ?? []).length > 0) {
          regressedProfiles.push(interimProfile);
          const regressedCount = doc.comparison.regressedAreas.length === 5
            ? 'all' : doc.comparison.regressedAreas.length;
          const areaKey: string | number = regressedCount === 'all' ? 'all' : regressedCount as number;
          regressedAreaBreakdown[areaKey] = (regressedAreaBreakdown[areaKey] ?? 0) + 1;
          doc.comparison.regressedAreas.forEach((cat: string) => {
            if (regressedCategoryBreakdown[cat] !== undefined) regressedCategoryBreakdown[cat]++;
          });
        }

        // noChange only if neither progressed nor regressed
        if ((doc.comparison.progressedAreas ?? []).length === 0 &&
          (doc.comparison.regressedAreas ?? []).length === 0) {
          noChangeProfiles.push(interimProfile);
        }
      }
    }

    const [year, month] = rawResult.yearMonth.split('-').map(Number);
    const monthLabel = new Date(year, month - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return {
      yearMonth: rawResult.yearMonth,
      monthLabel,
      totalInterims: (rawResult.interimDocs ?? []).length,
      noChangeCount: noChangeProfiles.length,
      progressedData: {
        areaBreakdown: progressedAreaBreakdown,
        categoryBreakdown: progressedCategoryBreakdown
      },
      regressedData: {
        areaBreakdown: regressedAreaBreakdown,
        categoryBreakdown: regressedCategoryBreakdown
      },
      profileGroups: {
        progressed: progressedProfiles,
        regressed: regressedProfiles,
        noChange: noChangeProfiles
      }
    };
  }

  // ── Tab navigation ────────────────────────────────────────────────────────

  switchActiveMonth(index: number): void {
    this.activeMonthIndex = index;
    this.closeDialog();
  }

  getTabLabel(monthSummary: MonthSummary): string {
    const parts = monthSummary.monthLabel.split(' ');
    return `${parts[0].slice(0, 3)} ${parts[1].slice(2)}`;
  }

  // ── Stat helpers ──────────────────────────────────────────────────────────

  getTotalProgressed(monthSummary: MonthSummary): number {
    return Object.values(monthSummary.progressedData.areaBreakdown).reduce((sum, val) => sum + val, 0);
  }

  getTotalRegressed(monthSummary: MonthSummary): number {
    return Object.values(monthSummary.regressedData.areaBreakdown).reduce((sum, val) => sum + val, 0);
  }

  getMaxValue(breakdownMap: Record<string | number, number>): number {
    return Math.max(...Object.values(breakdownMap), 1);
  }

  getBarWidthPercent(value: number, maxValue: number): number {
    return Math.round((value / Math.max(maxValue, 1)) * 100);
  }

  getAreaLabel(areaKey: number | 'all'): string {
    return areaKey === 'all' ? 'All Areas' : `${areaKey} Area${areaKey > 1 ? 's' : ''}`;
  }

  getAreaValue(monthSummary: MonthSummary, statusType: 'up' | 'dn', areaKey: number | 'all'): number {
    const breakdown = statusType === 'up'
      ? monthSummary.progressedData.areaBreakdown
      : monthSummary.regressedData.areaBreakdown;
    return breakdown[areaKey] ?? 0;
  }

  getCategoryValue(monthSummary: MonthSummary, statusType: 'up' | 'dn', category: string): number {
    const breakdown = statusType === 'up'
      ? monthSummary.progressedData.categoryBreakdown
      : monthSummary.regressedData.categoryBreakdown;
    return breakdown[category] ?? 0;
  }

  getInitials(name: string): string {
    return (name || '?').split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  }

  getCountBadgeClass(changedCount: number | 'all', statusType: 'up' | 'dn' | 'nc'): string {
    return changedCount === 'all' ? 'all' : statusType;
  }

  // ── Dialog openers ────────────────────────────────────────────────────────

  openNoChangeDialog(): void {
    const month = this.activeMonthSummary!;
    this.openProfileListDialog(
      'nc',
      'No Change',
      `${month.monthLabel} · ${month.noChangeCount} profiles`,
      'nc',
      month.profileGroups.noChange
    );
  }

  openProgressedDialog(): void {
    const month = this.activeMonthSummary!;
    const profiles = month.profileGroups.progressed;
    this.openProfileListDialog(
      'summary',
      'Progressed',
      `${month.monthLabel} · ${profiles.length} participants`,
      'up',
      profiles
    );
  }

  openRegressedDialog(): void {
    const month = this.activeMonthSummary!;
    const profiles = month.profileGroups.regressed;
    this.openProfileListDialog(
      'summary',
      'Regressed',
      `${month.monthLabel} · ${profiles.length} participants`,
      'dn',
      profiles
    );
  }

  openAreaDialog(statusType: 'up' | 'dn', areaKey: number | 'all'): void {
    const month = this.activeMonthSummary!;
    const filteredProfiles = statusType === 'up'
      ? month.profileGroups.progressed.filter(p => p.changedCount == areaKey)
      : month.profileGroups.regressed.filter(p => p.changedCount == areaKey);
    const areaLabel = areaKey === 'all' ? 'All areas' : `${areaKey} area${areaKey > 1 ? 's' : ''}`;
    this.openProfileListDialog(
      'area',
      `${statusType === 'up' ? 'Progressed' : 'Regressed'} · ${areaLabel}`,
      `${month.monthLabel} · ${filteredProfiles.length} participants`,
      statusType,
      filteredProfiles
    );
  }

  openCategoryDialog(statusType: 'up' | 'dn', category: string): void {
    const month = this.activeMonthSummary!;
    const filteredProfiles = statusType === 'up'
      ? month.profileGroups.progressed.filter(p => p.progressedAreas.includes(category))
      : month.profileGroups.regressed.filter(p => p.regressedAreas.includes(category));
    this.openProfileListDialog(
      'category',
      category,
      `${statusType === 'up' ? 'Progressed' : 'Regressed'} · ${month.monthLabel} · ${filteredProfiles.length}`,
      statusType,
      filteredProfiles
    );
  }

  private openProfileListDialog(
    dialogType: DialogType,
    title: string,
    subtitle: string,
    statusClass: 'up' | 'dn' | 'nc',
    profileList: InterimProfile[]
  ): void {
    this.dialogContext = { dialogType, dialogTitle: title, dialogSubtitle: subtitle, statusClass, profileList, statusType: statusClass };
    this.dialogProfileList = profileList;
    this.selectedProfile = null;
    this.isDialogOpen = true;
  }

  openProfileDetail(profile: InterimProfile): void { this.selectedProfile = profile; }
  backToProfileList(): void { this.selectedProfile = null; }

  closeDialog(): void {
    this.isDialogOpen = false;
    this.selectedProfile = null;
    this.dialogContext = null;
  }

  onDialogOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) this.closeDialog();
  }

  openAllMonthsDialog(): void { this.isAllMonthsDialogOpen = true; }
  closeAllMonthsDialog(): void { this.isAllMonthsDialogOpen = false; }

  onAllMonthsOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) this.closeAllMonthsDialog();
  }

  // ── Category detail helpers ────────────────────────────────────────────────

  getCategoryChangeType(profile: InterimProfile, category: string): 'up' | 'dn' | 'nc' {
    if (profile.progressedAreas.includes(category)) return 'up';
    if (profile.regressedAreas.includes(category)) return 'dn';
    return 'nc';
  }

  getCategoryArrow(changeType: 'up' | 'dn' | 'nc'): string {
    return changeType === 'up' ? '↑' : changeType === 'dn' ? '↓' : '→';
  }

  getCategoryStatusLabel(changeType: 'up' | 'dn' | 'nc'): string {
    return changeType === 'up' ? 'Progressed' : changeType === 'dn' ? 'Regressed' : 'No change';
  }

  isCategoryChanged(profile: InterimProfile, category: string): boolean {
    return [...profile.progressedAreas, ...profile.regressedAreas].includes(category);
  }

  getAllChangedAreas(profile: InterimProfile): string[] {
    return [...profile.progressedAreas, ...profile.regressedAreas];
  }

  toggleFilterMode(mode: 'months' | 'daterange' | 'queue'): void {
    this.filterMode = mode;
    // Clear the other filter's state when switching
    if (mode === 'queue') {
      // don't auto-fetch — wait for queue selection
    } else {
      this.selectedQueueIds = [];
      if (mode === 'months' && this.numberOfMonths) {
        this.onMonthsCountChange();
      } else if (mode === 'daterange' && this.filterStartDate && this.filterEndDate) {
        this.onDateRangeChange();
      }
    }
  }

  onQueueSelectionChange(): void {
    if (this.selectedQueueIds.length === 0) return;
    this.getAtcAlpha();
  }

  getOverallTotal(): number {
    return this.monthSummaries.reduce((sum, m) => sum + m.totalInterims, 0);
  }
  getOverallProgressed(): number {
    return this.monthSummaries.reduce((sum, m) => sum + this.getTotalProgressed(m), 0);
  }
  getOverallRegressed(): number {
    return this.monthSummaries.reduce((sum, m) => sum + this.getTotalRegressed(m), 0);
  }
  getOverallNoChange(): number {
    return this.monthSummaries.reduce((sum, m) => sum + m.noChangeCount, 0);
  }

  getOverallCategoryProgressed(category: string): number {
    return this.monthSummaries.reduce((sum, m) =>
      sum + (m.progressedData.categoryBreakdown[category] || 0), 0);
  }

  getOverallCategoryRegressed(category: string): number {
    return this.monthSummaries.reduce((sum, m) =>
      sum + (m.regressedData.categoryBreakdown[category] || 0), 0);
  }

  getOverallCategoryMax(type: 'up' | 'dn'): number {
    return Math.max(...this.CATEGORIES.map(cat =>
      type === 'up'
        ? this.getOverallCategoryProgressed(cat)
        : this.getOverallCategoryRegressed(cat)
    ), 1);
  }

  getMonthCategories(monthSummary: MonthSummary): string[] {
    return Object.keys(monthSummary.progressedData.categoryBreakdown);
  }

  getJourneyCoachTag(profileId: string): string {
    const journeyCoachTagIds: string[] = this.journeyCoachTags
      .filter(t => t['isActive'] === true)
      .map(t => t.id);
    const metaData = this.mapMetaData[profileId];
    const profileTags: string[] = metaData?.['profiletags'] ?? [];
    return profileTags.find(t => journeyCoachTagIds.includes(t)) ?? '';
  }

  async updateParticipantTag(profileId: string, selectedTagId: string | null, currentTagId: string | null): Promise<void> {
    // treat empty string as no selection
    const resolvedTagId = selectedTagId === '' ? null : selectedTagId;

    const metadataRef = doc(this.firestore, 'participant metadata', profileId);
    const metadataSnap = await getDoc(metadataRef);
    if (!metadataSnap.exists()) return;

    const metadataData = metadataSnap.data();
    const currentProfileTags: string[] = metadataData['profiletags'] ?? [];

    const journeyCoachTagIds: string[] = this.journeyCoachTags.map((t: any) => t.id);

    const nonJourneyCoachTags = currentProfileTags.filter(t => !journeyCoachTagIds.includes(t));
    const existingJourneyCoachTags = currentProfileTags.filter(t => journeyCoachTagIds.includes(t));

    const logPromises: Promise<void>[] = [];

    // Single removal log with ALL removed tags in one array
    if (existingJourneyCoachTags.length > 0) {
      const logId = doc(collection(this.firestore, 'participant tag logs')).id;
      logPromises.push(setDoc(doc(this.firestore, 'participant tag logs', logId), {
        logid: logId,
        profileid: profileId,
        type: 'removed',
        tags: existingJourneyCoachTags,
        updated: new Date(),
        updatedby: this.loggedInProfileid,
        source: 'journey coach'
      }));
    }

    // Build new tags — if null/empty, just keep non-journey-coach tags
    const newProfileTags = resolvedTagId
      ? [...nonJourneyCoachTags, resolvedTagId]
      : nonJourneyCoachTags;

    const batch = writeBatch(this.firestore);
    batch.update(metadataRef, { profiletags: newProfileTags });
    await batch.commit();

    // Addition log only if a real tag was selected
    if (resolvedTagId) {
      const logId = doc(collection(this.firestore, 'participant tag logs')).id;
      logPromises.push(setDoc(doc(this.firestore, 'participant tag logs', logId), {
        logid: logId,
        profileid: profileId,
        type: 'added',
        tags: [resolvedTagId],
        updated: new Date(),
        updatedby: this.loggedInProfileid,
        source: 'journey coach'
      }));
    }

    await Promise.all(logPromises);
    this.guard.openSnackBar("Tag updated successfully", "OK", 3000);
  }

  private async fetchJourneyCoachTags(): Promise<void> {
    try {
      const tagsSnapshot = await getDocs(query(
        collection(this.firestore, 'participant tags'),
        where('tagsfor', 'array-contains', 'journey coach')
      ));
      this.journeyCoachTags = (tagsSnapshot?.docs ?? []).map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
    } catch (error) {
      console.error('Error fetching journey coach tags:', error);
    }
  }

  getProfilesForTag(tagId: string): any[] {
    return Object.entries(this.mapMetaData)
      .filter(([profileId, meta]: [string, any]) =>
        (meta?.['profiletags'] ?? []).includes(tagId)
      )
      .map(([profileId, meta]: [string, any]) => ({
        profileId,
        name: meta?.['name'] ?? profileId
      }));
  }

  get activeJourneyCoachTags(): any[] {
    return this.journeyCoachTags.filter(tag =>
      this.getProfilesForTag(tag.id).length > 0 || tag['isActive'] === true
    );
  }

  openTagProfilesDialog(tag: any): void {
    this.selectedTagName = tag['name'] || tag.id;
    this.selectedTagProfiles = this.getProfilesForTag(tag.id);
    this.isTagProfilesDialogOpen = true;
  }

  closeTagProfilesDialog(): void {
    this.isTagProfilesDialogOpen = false;
    this.selectedTagProfiles = [];
    this.selectedTagName = '';
  }

  onTagProfilesOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) {
      this.closeTagProfilesDialog();
    }
  }

  getEpBandCount(key: string, bandIdx: number): number {
    return this.evolutionProgressData?.bands[bandIdx]?.profiles[key]?.length ?? 0;
  }

  getEpBandProfiles(key: string, bandIdx: number): { profileId: string; profileName: string; total: number; pct: number }[] {
    return this.evolutionProgressData?.bands[bandIdx]?.profiles[key] ?? [];
  }

  openEpDialog(key: string, bandLabel: string, bandIdx: number): void {
    const profiles = this.getEpBandProfiles(key, bandIdx);
    if (!profiles.length) return;
    this.epDialogTitle = `${key} · ${bandLabel}`;
    this.epDialogSubtitle = `${profiles.length} profiles in this band`;
    this.epDialogBandIdx = bandIdx;
    this.epDialogProfiles = profiles;
    this.isEpDialogOpen = true;
  }

  closeEpDialog(): void {
    this.isEpDialogOpen = false;
    this.epDialogProfiles = [];
  }

  onEpOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.closeEpDialog();
  }

  // Build matrix after fetch
  buildSubscriptionMatrix(snapshot: any): void {
    const cells: Record<string, Record<string, { count: number; docs: any[] }>> = {};
    const monthSet = new Set<string>();
    const journeyMap: Record<string, string> = {};

    snapshot.forEach((doc: any) => {
      const data = doc.data();
      const end = data['subscriptionend']?.toDate
        ? data['subscriptionend'].toDate()
        : new Date(data['subscriptionend']);
      const ym = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
      const journeyId = data['journeyref']?.id ?? data['journeyref'] ?? 'Unknown';
      const journeyLabel = this.mapjourneyname?.[journeyId] ?? journeyId;

      monthSet.add(ym);
      journeyMap[journeyId] = journeyLabel;

      if (!cells[journeyId]) cells[journeyId] = {};
      if (!cells[journeyId][ym]) cells[journeyId][ym] = { count: 0, docs: [] };
      cells[journeyId][ym].count++;
      cells[journeyId][ym].docs.push({ id: doc.id, ...data });
    });

    const months = [...monthSet].sort().map(ym => {
      const [y, m] = ym.split('-').map(Number);
      return {
        ym,
        label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      };
    });

    const journeys = Object.entries(journeyMap)
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Totals
    const monthTotals: Record<string, number> = {};
    const journeyTotals: Record<string, number> = {};
    months.forEach(m => {
      monthTotals[m.ym] = journeys.reduce((s, j) => s + (cells[j.id]?.[m.ym]?.count ?? 0), 0);
    });
    journeys.forEach(j => {
      journeyTotals[j.id] = months.reduce((s, m) => s + (cells[j.id]?.[m.ym]?.count ?? 0), 0);
    });

    this.subscriptionMatrix = { journeys, months, cells, monthTotals, journeyTotals };
  }

  // Dialog
  openSubDialog(docs: any[], title: string): void {
    this.subDialogTitle = title;
    this.subDialogDocs = docs;
    this.isSubDialogOpen = true;
  }
  closeSubDialog(): void { this.isSubDialogOpen = false; this.subDialogDocs = []; }
  onSubDialogOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.closeSubDialog();
  }
  getCellData(journeyId: string, ym: string) {
    return this.subscriptionMatrix?.cells[journeyId]?.[ym] ?? null;
  }
  getSubEndDate(doc: any): string {
    const d = doc['subscriptionend']?.toDate ? doc['subscriptionend'].toDate() : new Date(doc['subscriptionend']);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  getSubJourneyName(doc: any): string {
    const id = doc['journeyref']?.id ?? doc['journeyref'] ?? '';
    return this.mapjourneyname?.[id] ?? id;
  }
  getSubStatusClass(status: string): string {
    if (status === 'completed') return 'status-completed';
    if (status === 'ongoing') return 'status-ongoing';
    return '';
  }
  getGrandTotal(): number {
    if (!this.subscriptionMatrix) return 0;
    return Object.values(this.subscriptionMatrix.monthTotals).reduce((a, b) => a + b, 0);
  }

  openJourneyStatusDialog(profiles: any[], title: string): void {
    this.journeyStatusDialogProfiles = profiles;
    this.journeyStatusDialogTitle = title;
    this.isJourneyStatusDialogOpen = true;
  }

  closeJourneyStatusDialog(): void {
    this.isJourneyStatusDialogOpen = false;
    this.journeyStatusDialogProfiles = [];
  }

  onJourneyStatusOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.closeJourneyStatusDialog();
  }

  getStatusClass(status: string): string {
    if (status === 'active') return 'js-active';
    if (status === 'non active') return 'js-nonactive';
    if (status === 'discontinued') return 'js-discontinued';
    return 'js-null';
  }

  getAllProfilesForJourney(journey: any): any[] {
    return Object.values(journey.statuses).flatMap((s: any) => s.profiles);
  }

  toggleEpProfileExpand(profileId: string): void {
    this.expandedEpProfile = this.expandedEpProfile === profileId ? null : profileId;
  }

  getProfileAllKeyData(profileId: string): { key: string; count: number; pct: number; bandIdx: number }[] {
    if (!this.evolutionProgressData) return [];
    const result: { key: string; count: number; pct: number; bandIdx: number }[] = [];

    this.evolutionProgressData.keys.forEach(key => {
      this.evolutionProgressData!.bands.forEach((band, bandIdx) => {
        const entry = band.profiles[key]?.find(p => p.profileId === profileId);
        if (entry) {
          result.push({ key, count: entry.total, pct: entry.pct, bandIdx });
        }
      });
    });

    return result.sort((a, b) => b.pct - a.pct);
  }

  openHealthKeyDialog(key: string): void {
    if (!this.evolutionProgressData) return;

    // Get all profiles whose dominant key is this key
    const allKeyProfiles: Record<string, { sum: number; docTotal: number }[]> =
      (this as any)._tempEvolutionProgressProfileMap ?? {};

    // Rebuild from evolutionProgressData bands — collect all profiles that appear under this key
    const profileMap: Record<string, { areas: Record<string, number>; total: number }> = {};

    // For each profile in any band under this key, get their count
    this.evolutionProgressData.bands.forEach(band => {
      (band.profiles[key] ?? []).forEach(p => {
        if (!profileMap[p.profileId]) {
          profileMap[p.profileId] = {
            areas: {},
            total: 0
          };
        }
        profileMap[p.profileId].areas[band.label] = p.total;
        profileMap[p.profileId].total += p.total;
      });
    });

    // Also get all areas (all keys) for each profile from evolutionProgressData
    // We need per-profile breakdown across ALL keys, not just this one
    const profileAllAreas: Record<string, Record<string, number>> = {};

    this.evolutionProgressData.keys.forEach(k => {
      this.evolutionProgressData!.bands.forEach(band => {
        (band.profiles[k] ?? []).forEach(p => {
          if (!profileAllAreas[p.profileId]) profileAllAreas[p.profileId] = {};
          profileAllAreas[p.profileId][k] = (profileAllAreas[p.profileId][k] ?? 0) + p.total;
        });
      });
    });

    // Only include profiles whose dominant key matches the clicked key
    const result: typeof this.healthDialogProfiles = [];

    Object.entries(profileAllAreas).forEach(([profileId, areas]) => {
      const dominant = Object.entries(areas).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (dominant === key) {
        const total = Object.values(areas).reduce((a, b) => a + b, 0);
        result.push({
          profileId,
          profileName: this.mapprofile[profileId] ?? profileId,
          areas,
          total
        });
      }
    });

    result.sort((a, b) => b.total - a.total);

    this.healthDialogTitle = key;
    this.healthDialogProfiles = result;
    this.isHealthDialogOpen = true;
  }

  closeHealthDialog(): void {
    this.isHealthDialogOpen = false;
    this.healthDialogProfiles = [];
  }

  onHealthDialogOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.closeHealthDialog();
  }

  getHealthDialogKeys(): string[] {
    if (!this.evolutionProgressData) return [];
    return this.evolutionProgressData.keys;
  }

  get healthTotalProfiles(): number {
    return this.healthKeyData.reduce((a, k) => a + k.profileCount, 0);
  }

  get healthTotalAdjustments(): number {
    return this.healthKeyData.reduce((a, k) => a + k.count, 0);
  }

  // Computed filtered matrix
  get filteredJourneyStatusMatrix() {
    if (this.journeyTypeFilter === 'all') return this.journeyStatusMatrix;
    const type = this.journeyTypeFilter === 'ecosystem' ? 'Eco system' : 'DFU';
    return this.journeyStatusMatrix.filter(j => j.journeyType === type);
  }

  // Update getTotalForStatus to use filtered matrix
  getTotalForStatus(status: string): number {
    return this.filteredJourneyStatusMatrix.reduce((a, j) =>
      a + (j.statuses[status]?.profiles.length ?? 0), 0);
  }

  getJourneyStatusGrandTotal(): number {
    const matrixTotal = this.filteredJourneyStatusMatrix.reduce((a, j) => a + j.total, 0);
    return matrixTotal + (this.journeyTypeFilter === 'all' ? this.nullStatusProfiles.length : 0);
  }

  // ── Calendar ──
  openCalendarDialog(): void {
    this.selectedCalendarDate = new Date();
    this.onCalendarDateSelected(this.selectedCalendarDate);
    this.isCalendarOpen = true;
    this.cdr.markForCheck();
  }
  closeCalendarModal(): void {
    this.isCalendarOpen = false;
    this.cdr.markForCheck();
  }

  // ── CURA ──
  openCURADialog(): void {
    this.curaActiveTab = 0;
    this.isCURAOpen = true;
    this.cdr.markForCheck();
  }
  closeCURAModal(): void {
    this.isCURAOpen = false;
    this.cdr.markForCheck();
  }

  // ── Generic modal (modes, avg days etc.) ──
  openDialog(key: string): void {
    const config = this.modesList.includes(key) ? this.dialogConfigs['modes'] : this.dialogConfigs[key];
    if (!config) return;

    // populate data (keep your existing switch block)
    switch (config.table.dataKey) {
      case 'avgtoasv': config.table.data = this.avgToASVList; config.avg = this.currentAvgToASV; break;
      case 'avggsvtoasv': config.table.data = this.avgGSVToASVList; config.avg = this.currentAvgGSVToASV; break;
      case 'avgassured': config.table.data = this.avgAssuredList.map(d => ({ ...d, name: this.mapprofile[d['profileid']] ?? '-' })); config.avg = this.avgAssured; break;
      case 'avgpurchased': config.table.data = this.avgPurchaseList.map(d => ({ ...d, name: this.mapprofile[d['profileid']] ?? '-' })); config.avg = this.avgPurchase; break;
      case 'onboardingScheduled':const scheduledData = this.getAllScheduledTableData();config.table.data = scheduledData.map(row => ({
            ...row,
            name: this.mapprofile[row['profileid']] ?? '-',
            onboardingscheduled: row['onboardingscheduled']
              ? row['onboardingscheduled'].toDate().toLocaleDateString() : '-',
          }));
          break;

      case 'coachingScheduled':config.table.data = this.appointmentsData.filter(e =>[null, undefined].includes(e['onboarding']) &&e['cancelled'] == false &&e['attended'] == false
          )
          .map(row => {
            const profileId = row['bookedby']?.id;
            const journeyId = this.mapMetaData[profileId]?.['activejourney'];
            return {
              ...row,
              name: this.mapprofile[profileId] ?? '-',
              journeyref: journeyId ? { id: journeyId } : null,
              coachingScheduled: row['starttime']
                ? row['starttime'].toDate().toLocaleDateString()
                : '-',
            };
          });
          break;
      case 'modes': config.title = key; config.table.data = (this.modeMap[key] ?? []).map(id => ({ name: this.mapprofile[id] ?? '-' })); break;
    }
    config.table.data.sort((a, b) => (a['name'] ?? '').localeCompare(b['name'] ?? ''));

    this.dialogConfig = config;
    this.isModalOpen = true;
    this.cdr.markForCheck();
  }
  closeModalOverlay(): void {
    this.isModalOpen = false;
    this.dialogConfig = null;
    this.cdr.markForCheck();
  }

  openAskAHProfileDialog(docs: any[], flagType: string, title: string): void {
    this.askAHSourceFilter = 'all';
    this.askAHResolvedFilter = 'all';
    this.askAHDialogTitle = title;

    switch (flagType) {
      case 'liked': this.askAHDialogProfiles = docs.filter(d => d['liked']); break;
      case 'tagged': this.askAHDialogProfiles = docs.filter(d => d['tagged']); break;
      case 'opportunity': this.askAHDialogProfiles = docs.filter(d => d['opportunity']); break;
      case 'critical': this.askAHDialogProfiles = docs.filter(d => d['critical']); break;
      case 'unflagged': this.askAHDialogProfiles = docs.filter(d => !d['liked'] && !d['tagged'] && !d['opportunity'] && !d['critical']); break;
      case 'criticalOrTagged': this.askAHDialogProfiles = docs.filter(d => d['critical'] || d['tagged']); break;
      case 'any': this.askAHDialogProfiles = docs.filter(d => d['liked'] || d['tagged'] || d['opportunity'] || d['critical']); break;
      // resolved variants — pre-filter then let resolved filter chip refine further
      case 'likedResolved': this.askAHDialogProfiles = docs.filter(d => d['liked'] && d['resolved']); break;
      case 'taggedResolved': this.askAHDialogProfiles = docs.filter(d => d['tagged'] && d['resolved']); break;
      case 'opportunityResolved': this.askAHDialogProfiles = docs.filter(d => d['opportunity'] && d['resolved']); break;
      case 'criticalResolved': this.askAHDialogProfiles = docs.filter(d => d['critical'] && d['resolved']); break;
      case 'anyResolved': this.askAHDialogProfiles = docs.filter(d => d['resolved']); break;
      default: this.askAHDialogProfiles = docs;
    }

    this.isAskAHDialogOpen = true;
    this.cdr.markForCheck();
  }

  getCombinedAskAHDocs(): any[] {
    if (!this.askAHLoveLetterSummary) return [];
    return [
      ...this.askAHLoveLetterSummary.askAH.docs,
      ...this.askAHLoveLetterSummary.loveLetter.docs
    ];
  }

  private exportToXlsx(rows: any[][], filename: string): void {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  exportDialogData(profiles: any[], title: string): void {
    const rows = [['Name', 'Profile ID', 'Date', 'Changed Count']];
    profiles.forEach(p => rows.push([p.profileName || p.profileId, p.profileId, p.createdDate || '', String(p.changedCount || '')]));
    this.exportToXlsx(rows, title.replace(/[^a-zA-Z0-9]/g, '_'));
  }

  exportHealthDialogData(): void {
    const keys = this.getHealthDialogKeys();
    const rows = [['Name', 'Profile ID', ...keys, 'Total']];
    this.healthDialogProfiles.forEach(p => rows.push([p.profileName, p.profileId, ...keys.map(k => String(p.areas[k] || 0)), String(p.total)]));
    this.exportToXlsx(rows, `Health_${this.healthDialogTitle}`);
  }

  exportSubDialogData(): void {
    const rows = [['Name', 'Profile ID', 'Journey', 'Status', 'Subscription End']];
    this.subDialogDocs.forEach(d => rows.push([this.mapprofile[d['profileid']] || d['profileid'], d['profileid'], this.getSubJourneyName(d), d['journeystatus'] || '', this.getSubEndDate(d)]));
    this.exportToXlsx(rows, `Subscription_${this.subDialogTitle}`);
  }

  exportJourneyStatusDialogData(): void {
    const rows = [['Name', 'Profile ID', 'Status']];
    this.journeyStatusDialogProfiles.forEach(p => rows.push([this.mapprofile[p['profileid']] || p['profileid'], p['profileid'], p['customerstatus'] || 'No status']));
    this.exportToXlsx(rows, `JourneyStatus_${this.journeyStatusDialogTitle}`);
  }

  exportEpDialogData(): void {
    const rows = [['Name', 'Profile ID', 'Percentage']];
    this.epDialogProfiles.forEach(p => rows.push([p.profileName, p.profileId, `${p.pct}%`]));
    this.exportToXlsx(rows, `EP_${this.epDialogTitle}`);
  }

  exportAskAHDialogData(): void {
    const rows = [['Name', 'Profile ID', 'Source', 'Happy', 'Needs Attention', 'Opportunity', 'Critical']];
    this.askAHDialogProfiles.forEach(p => rows.push([
      this.mapprofile[p.profileid] || p.profileid, p.profileid,
      p.source === 'ask AH' ? 'Ask AH' : 'Love Letter',
      p.liked ? 'Yes' : '', p.tagged ? 'Yes' : '',
      p.opportunity ? 'Yes' : '', p.critical ? 'Yes' : ''
    ]));
    this.exportToXlsx(rows, `AskAH_${this.askAHDialogTitle}`);
  }

  exportTagDialogData(): void {
    const rows = [['Name', 'Profile ID']];
    this.selectedTagProfiles.forEach(p => rows.push([p.name, p.profileId || '']));
    this.exportToXlsx(rows, `Tag_${this.selectedTagName}`);
  }

  getFilteredAskAHProfiles(): any[] {
    let list = [...this.askAHDialogProfiles];

    if (this.askAHSourceFilter === 'askAH') {
      list = list.filter(p => p['source'] === 'ask AH');
    } else if (this.askAHSourceFilter === 'loveLetter') {
      list = list.filter(p => p['source'] !== 'ask AH');
    }

    if (this.askAHResolvedFilter === 'resolved') {
      list = list.filter(p => p['resolved'] === true);
    } else if (this.askAHResolvedFilter === 'unresolved') {
      list = list.filter(p => !p['resolved']);
    }

    return list;
  }
}
