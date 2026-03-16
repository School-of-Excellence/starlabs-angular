import { OnInit, OnDestroy, signal, Signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule, DatePipe } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { AuthguardService } from '../../authguard.service';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';
import { Firestore, collection, query, where, Timestamp, or, and, doc, getDoc, getDocs, updateDoc, Unsubscribe, collectionSnapshots, onSnapshot } from '@angular/fire/firestore';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, ViewChild, TemplateRef } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import * as XLSX from 'xlsx';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ChartComponent, ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexDataLabels, ApexPlotOptions, ApexGrid, ApexStroke, ApexTooltip, ApexLegend } from 'ng-apexcharts';
export interface GrossSalesData {
  person: string;
  grossCount: number;
  assuredCount: number;
  grossCancelledNumber: number;
  assuredCancelledNumber: number;
  grossDowngradeNumber: number;
  assuredDowngradeNumber: number;
  actualGrossNumber: number;
  actualAssuredNumber: number;
  expanded?: boolean;
  expandedData?: any[];
  expandedType?: string;
}

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
  stroke: ApexStroke;
  tooltip: ApexTooltip;
  legend: ApexLegend;
  colors: string[];
};

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
  title: string;
  columns: ColumnConfig[];
  data: any[];
  dataKey: string,
  dateFormat?: string;
  currencySymbol?: string;
  filters: any[];
}

@Component({
  selector: 'app-sales-dashboard',
  imports: [
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCardModule,
    MatButtonModule,
    CommonModule,
    MatButtonToggleModule,
    MatTableModule,
    MatDialogModule,
    MatPaginatorModule,
    MatSortModule,
    NgApexchartsModule,
    FormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  templateUrl: './sales-dashboard.component.html',
  styleUrl: './sales-dashboard.component.css',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', display: 'none' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ])
  ]
})
export class SalesDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('preSalesPaginator') preSalesPaginator!: MatPaginator;
  @ViewChild('preSalesSort') preSalesSort!: MatSort;
  @ViewChild('salesPersonPaginator') salesPersonPaginator!: MatPaginator;
  @ViewChild('salesPersonSort') salesPersonSort!: MatSort;
  @ViewChild('newSalesPreSalesPaginator') newSalesPreSalesPaginator!: MatPaginator;
  @ViewChild('newSalesPreSalesSort') newSalesPreSalesSort!: MatSort;
  @ViewChild('newSalesSalesPersonPaginator') newSalesSalesPersonPaginator!: MatPaginator;
  @ViewChild('newSalesSalesPersonSort') newSalesSalesPersonSort!: MatSort;
  @ViewChild('upgradePreSalesPaginator') upgradePreSalesPaginator!: MatPaginator;
  @ViewChild('upgradePreSalesSort') upgradePreSalesSort!: MatSort;
  @ViewChild('upgradeSalesPersonPaginator') upgradeSalesPersonPaginator!: MatPaginator;
  @ViewChild('upgradeSalesPersonSort') upgradeSalesPersonSort!: MatSort;
  @ViewChild("barchart") barchart!: ChartComponent;
  // Month filter
  displayMonth: string = '';
  pickerMode: string = 'month';

  currentMonth: Date = new Date();
  startDate: Date = new Date();
  endDate: Date = new Date();
  Math = Math;
  mapprofile: any = {};
  salesLeadsMap: any = signal<object>({})

  selectedAssuredDateFilter: string = '';
  assuredFilterStartDate: string = '';
  assuredFilterEndDate: string = '';
  selectedFilter: string = '';

  selectedPreSalesPerson: string[] = [];
  selectedSalesPerson: string[] = [];
  preSalesPersonList: string[] = [];
  salesPersonList: string[] = [];
  ecosystemJourneys: string[] = [];
  dfuJourneys: string[] = [];
  giftsJourneys: string[] = [];
  newSalesColumns: string[] = ['person', 'grossCount', 'assuredCount'];
  upgradeColumns: string[] = ['person', 'grossCount', 'assuredCount'];
  selectedSaleTypeFilter: string[] = [];
  selectedJourney: string[] = [];

  journeyList = [];
  coachesList = [];
  assuredList = ['assured', 'notassured'];
  statusList = ['Approved', 'Pending'];
  saleTypeList = ['New', 'Upgrade', 'Add-on'];
  customerStatusList = ['Active', 'Non Active', 'Discontinued', 'Banned', 'Late'];

  filteredPreSalesTableData: GrossSalesData[] = [];
  filteredSalesPersonTableData: GrossSalesData[] = [];

  preSalesDataSource = new MatTableDataSource<GrossSalesData>([]);
  salesPersonDataSource = new MatTableDataSource<GrossSalesData>([]);
  newSalesPreSalesDataSource = new MatTableDataSource<Partial<GrossSalesData>>([]);
  newSalesSalesPersonDataSource = new MatTableDataSource<Partial<GrossSalesData>>([]);
  upgradePreSalesDataSource = new MatTableDataSource<Partial<GrossSalesData>>([]);
  upgradeSalesPersonDataSource = new MatTableDataSource<Partial<GrossSalesData>>([]);

  // Subscriptions
  private subscriptions: { [key: string]: Unsubscribe } = {};
  cacheSnapShot
  isLoading = true;

  // Loading states
  private loadingStates = {
    journeyNames: false,
    salesLeads: false,
    cancelledSales: false,
    downgradeSales: false
  };

  // Table data - Gross Sales only
  preSalesTableData: GrossSalesData[] = [];
  salesPersonTableData: GrossSalesData[] = [];
  // newSalesPreSalesTableData: GrossSalesData[] = [];
  // newSalesSalesPersonTableData: GrossSalesData[] = [];
  // upgradePreSalesTableData: GrossSalesData[] = [];
  // upgradeSalesPersonTableData: GrossSalesData[] = [];

  // filteredNewSalesPreSalesTableData: GrossSalesData[] = [];
  // filteredNewSalesSalesPersonTableData: GrossSalesData[] = [];
  // filteredUpgradePreSalesTableData: GrossSalesData[] = [];
  // filteredUpgradeSalesPersonTableData: GrossSalesData[] = [];

  customStartDate: Date | null = null;
  customEndDate: Date | null = null;

  selectedPersonType: 'presales' | 'sales' = 'presales';
  public barChartOptions!: Partial<ChartOptions>;

  participantTableLocations: string[] = [];

  tableDisplayMap = {
    'grossSales': 'Gross Sales',
    'assuredSales': 'Assured Sales',
  }
  originalData: any = {
    grosssale: { data: [], count: 0 },
    assuredsale: { data: [], count: 0 },
    grosscancelledsale: { data: [], count: 0 },
    assuredcancelledsale: { data: [], count: 0 },
    grossdowngradetooldsale: { data: [], count: 0 },
    grossdowngradetonewsale: { data: [], count: 0 },
    assureddowngradetooldsale: { data: [], count: 0 },
    assureddowngradetonewsale: { data: [], count: 0 },
    approvedGrossSales: 0,
    pendingGrossSales: 0,
    totalGrossEMI: 0,
    totalAssuredEMI: 0,
    totalGrossCancelled: 0,
    totalAssuredCancelled: 0,
    totalGrossDowngradeToOld: 0,
    totalGrossDowngradeToNew: 0,
    totalAssuredDowngradeToOld: 0,
    totalAssuredDowngradeToNew: 0,
    grossSalesSplit: { new: 0, upgrades: 0, addons: 0 },
    grossNewValue: 0,
    grossUpgradeValue: 0,
    grossAddonValue: 0,
    assuredNewValue: 0,
    assuredUpgradeValue: 0,
    assuredAddonValue: 0,
    assuredSalesSplit: { new: 0, upgrades: 0, addons: 0 }
  };

  metric = {
    gross: {
      data: [],
      totalValue: 0,
      totalEMI: 0,
    },
    assured: {
      data: [],
      totalValue: 0,
      totalEMI: 0,
    },
    grosspending: [],
    grossnew: { data: [], totalValue: 0 },
    grossupgrade: { data: [], totalValue: 0 },
    grossaddons: { data: [], totalValue: 0 },
    grosscancelled: { data: [], totalValue: 0 },
    grossdowngradetoold: { data: [], totalValue: 0 },
    grossdowngradetonew: { data: [], totalValue: 0 },
    assurednew: { data: [], totalValue: 0 },

    assuredupgrade: { data: [], totalValue: 0 },
    assuredaddons: { data: [], totalValue: 0 },
    assuredcancelled: { data: [], totalValue: 0 },
    assureddowngradetoold: { data: [], totalValue: 0 },
    assureddowngradetonew: { data: [], totalValue: 0 },
  }


  mapjourneyname: any = {};
  filterForm: FormGroup;
  hideTimeout: any;
  popupData: any = null;

  // Metrics
  totalSalesCount: number = 0;
  totalGrossCount: number = 0;
  totalGrossValue: number = 0;
  totalAssuredCount: number = 0;
  totalAssuredValue: number = 0;
  detailColumns: string[] = ['name', 'journey', 'type', 'purchasevalue', 'purchasedate', 'relatedperson'];

  // Displayed columns
  preSalesColumns: string[] = [
    'person',
    'grossCount',
    'assuredCount',
    'grossCancelledNumber',
    'assuredCancelledNumber',
    'grossDowngradeNumber',
    'assuredDowngradeNumber',
    'actualGrossNumber',
    'actualAssuredNumber'
  ];

  salesPersonColumns: string[] = [
    'person',
    'grossCount',
    'assuredCount',
    'grossCancelledNumber',
    'assuredCancelledNumber',
    'grossDowngradeNumber',
    'assuredDowngradeNumber',
    'actualGrossNumber',
    'actualAssuredNumber'
  ];

  showTable = false;
  currentTableConfig: TableConfig | null = null;
  filteredTableData: any[] = [];
  tableType: string = null;
  currentPage: number = 1;
  itemsPerPage: number = 10;
  itemsPerPageOptions: number[] = [5, 10, 20, 50, 100];
  totalPages: number = 1;
  tableSearchText: string = '';
  tableConfigs: { [key: string]: TableConfig } = {};
  salesLeadsColumns: any[] = [];
  hasActiveFilters = false;
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  constructor(public firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private guard: AuthguardService,
    private datePipe: DatePipe,) {

    {
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
    }
  }

  ngOnInit(): void {
    this.setMonthDates();
    this.updateDisplayMonth();
    this.initializeData();
    this.initializeBarChartOptions();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.preSalesDataSource.paginator = this.preSalesPaginator;
      this.preSalesDataSource.sort = this.preSalesSort;
      this.preSalesDataSource.filterPredicate = this.filterPredicateForSaleType

      this.salesPersonDataSource.paginator = this.salesPersonPaginator;
      this.salesPersonDataSource.sort = this.salesPersonSort;
      this.salesPersonDataSource.filterPredicate = this.filterPredicateForSaleType

      this.newSalesPreSalesDataSource.paginator = this.newSalesPreSalesPaginator;
      this.newSalesPreSalesDataSource.sort = this.newSalesPreSalesSort;
      this.newSalesPreSalesDataSource.filterPredicate = this.filterPredicateForSaleType

      this.newSalesSalesPersonDataSource.paginator = this.newSalesSalesPersonPaginator;
      this.newSalesSalesPersonDataSource.sort = this.newSalesSalesPersonSort;
      this.newSalesSalesPersonDataSource.filterPredicate = this.filterPredicateForSaleType

      this.upgradePreSalesDataSource.paginator = this.upgradePreSalesPaginator;
      this.upgradePreSalesDataSource.sort = this.upgradePreSalesSort;
      this.upgradePreSalesDataSource.filterPredicate = this.filterPredicateForSaleType

      this.upgradeSalesPersonDataSource.paginator = this.upgradeSalesPersonPaginator;
      this.upgradeSalesPersonDataSource.sort = this.upgradeSalesPersonSort;
      this.upgradeSalesPersonDataSource.filterPredicate = this.filterPredicateForSaleType

      this.updateBarChart();
    });
  }

  ngOnDestroy(): void {
    Object.values(this.subscriptions).forEach(sub => sub());
  }

  // function to initially load salesdata  
  private async initializeData(): Promise<void> {
    this.isLoading = true;
    Object.keys(this.loadingStates).forEach(key => {
      this.loadingStates[key as keyof typeof this.loadingStates] = false;
    });

    try {
      await this.loadJourneyNames();
      this.loadCurrentSalesLeads();
    } catch (error) {
      console.error('Error initializing data:', error);
    }
  }

  // functoin to fetch and load journey names from journey collectionn
  async loadJourneyNames(): Promise<void> {
    try {
      const snap = await getDocs(collection(this.firestore, 'journey'));
      this.journeyList = [];

      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapjourneyname[element['id']] = element['journey'];

        this.journeyList.push({
          id: element['id'],
          name: element['journey']
        });

        if (element['journey'] === 'FTO') {
          this.giftsJourneys.push(element['id']);
        } else if (element['type'] === 'Eco system') {
          this.ecosystemJourneys.push(element['id']);
        } else if (element['type'] === 'DFU') {
          this.dfuJourneys.push(element['id']);
        }
      }
      this.journeyList.sort((a, b) => a.name.localeCompare(b.name));
      this.initializeSalesLeadsColumns();
      this.initializeTableConfigs();
      this.loadingStates.journeyNames = true;
    } catch (error) {
      console.error('Error loading journey names:', error);
    }
  }

  // function to initialize sales leads columns
  private initializeSalesLeadsColumns(): void {
    this.salesLeadsColumns = [
      { key: 'name', header: 'Name', width: '10%', type: 'text' },
      { key: 'phonenumber', header: 'Mobile', width: '10%', type: 'number' },
      { key: 'email', header: 'Email', width: '15%', type: 'text' },
      { key: 'journey', header: 'Journey', width: '10%', type: 'mapped', mapData: this.mapjourneyname },
      { key: 'journeytype', header: 'Type', width: '8%', type: 'text' },
      { key: 'totalpurchasevalue', header: 'Purchase Value', width: '10%', type: 'currency', prefix: '₹' },
      { key: 'installmentamount', header: 'EMI', width: '10%', type: 'currency', prefix: '₹' },
      { key: 'purchasedate', header: 'Purchase Date', width: '12%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'paymentplanassureddate', header: 'Assured Date', width: '12%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'presalespersonname', header: 'Pre-Sales Person', width: '10%', type: 'text' },
      { key: 'salespersonname', header: 'Sales Person', width: '10%', type: 'text' },
      { key: 'notes', header: 'Sales Notes', width: '35%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'generalnotes', header: 'Notes', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '25%', type: 'text', substringStart: 0, substringEnd: 50 },
    ];
  }

  // private function to load table configs
  private initializeTableConfigs(): void {
    this.tableConfigs = {
      grossSales: {
        title: 'Gross Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'gross',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status']
      },
      assuredSales: {
        title: 'Assured Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assured',
        filters: ['search', 'purchasedate', 'journey', 'saleType']
      },
      grossNewSales: {
        title: 'Gross New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossnew',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status']
      },
      grossUpgradeSales: {
        title: 'Gross Upgrade Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossupgrade',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status']
      },
      grossAddonSales: {
        title: 'Gross Add-on Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossaddons',
        filters: ['search', 'purchasedate', 'journey', 'assured', 'status']
      },
      assuredNewSales: {
        title: 'Assured New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assurednew',
        filters: ['search', 'purchasedate', 'journey']
      },
      assuredUpgradeSales: {
        title: 'Assured Upgrade Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assuredupgrade',
        filters: ['search', 'purchasedate', 'journey']
      },
      assuredAddonSales: {
        title: 'Assured Add-on Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assuredaddons',
        filters: ['search', 'purchasedate', 'journey']
      },
      grossCancelledSales: {
        title: 'Gross Cancelled Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grosscancelled',
        filters: ['search', 'purchasedate', 'journey']
      },
      assuredCancelledSales: {
        title: 'Assured Cancelled Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assuredcancelled',
        filters: ['search', 'purchasedate', 'journey']
      },
      grossDowngradeToOldSales: {
        title: 'Gross Downgrade To Old Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossdowngradetoold',
        filters: ['search', 'purchasedate', 'journey']
      },

      grossDowngradeToNewSales: {
        title: 'Gross Downgrade To New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'grossdowngradetonew',
        filters: ['search', 'purchasedate', 'journey']
      },

      assuredDowngradeToOldSales: {
        title: 'Assured Downgrade To Old Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assureddowngradetoold',
        filters: ['search', 'purchasedate', 'journey']
      },

      assuredDowngradeToNewSales: {
        title: 'Assured Downgrade To New Sales',
        columns: this.salesLeadsColumns,
        data: [],
        dataKey: 'assureddowngradetonew',
        filters: ['search', 'purchasedate', 'journey']
      }
    };
  }
  // function to check loading status of the screen
  private checkLoadingComplete(): void {
    const allLoaded = Object.values(this.loadingStates).every(state => state === true);
    if (allLoaded) {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // function to get loading progress
  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStates).filter(state => state === true).length;
    const total = Object.keys(this.loadingStates).length;
    return (loaded / total) * 100;
  }

  // function to get loaded count
  getLoadedCount(): number {
    return Object.values(this.loadingStates).filter(state => state === true).length;
  }

  // function to set current month
  setMonthDates(): void {
    const now = this.currentMonth;
    this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  // functoin to handle customer dates range seletion
  onCustomDateChange(): void {
    if (this.customStartDate && this.customEndDate) {
      this.isLoading = true;
      this.loadingStates.salesLeads = false;
      this.loadingStates.cancelledSales = false;
      this.loadingStates.downgradeSales = false;

      this.startDate = new Date(this.customStartDate);
      this.startDate.setHours(0, 0, 0, 0);

      this.endDate = new Date(this.customEndDate);
      this.endDate.setHours(23, 59, 59, 999);

      this.loadCurrentSalesLeads();
    }
  }

  // function to load sales leads data
  loadCurrentSalesLeads(): void {
    this.ngOnDestroy()
    this.loadingStates.salesLeads = false;
    this.loadingStates.cancelledSales = false;
    this.loadingStates.downgradeSales = false;

    const currentMonthStart = new Date(this.startDate);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthEnd = new Date(this.endDate);
    currentMonthEnd.setHours(23, 59, 59, 999);

    let startdate = Timestamp.fromDate(currentMonthStart).toDate();
    let enddate = Timestamp.fromDate(currentMonthEnd).toDate();
    const queryValue = or(
      and(where("purchasedate", ">=", startdate), where("purchasedate", "<=", enddate)),
      and(where("date", ">=", startdate), where("date", "<=", enddate))
    );

    this.subscriptions['salesleads'] = onSnapshot(
      query(collection(this.firestore, "salesleads"), queryValue),
      {
        includeMetadataChanges: true,
      },

      async (snap) => {
        try {

          if (snap.metadata.fromCache) {
            return
          }

          const salesleads = snap.docs.map((d) => ({ ...d.data() }))
          await this.processSalesLeadsData(salesleads, startdate, enddate)

          this.loadingStates.salesLeads = true;
          this.loadingStates.cancelledSales = true;
          this.loadingStates.downgradeSales = true;
          this.checkLoadingComplete();

        } catch (error) {
          console.error('Error in fetching sales leads : ', error)
          this.loadingStates.salesLeads = true;
          this.loadingStates.cancelledSales = true;
          this.loadingStates.downgradeSales = true;
          this.checkLoadingComplete();
        }

      }
    )
  }

  // function to process and assign values respect to sales leads data
  // async processSalesData(salesleads: any[], startdate: Date, enddate: Date): Promise<void> {
  //   const preSalesMap = new Map<string, GrossSalesData>();
  //   const salesPersonMap = new Map<string, GrossSalesData>();
  //   const saleLeadsMap = {}

  //   let grossData = [];
  //   let assuredData = [];
  //   let cancelledData = [];
  //   let downgradeData = [];
  //   let grossCancelledData = [];
  //   let assuredCancelledData = [];
  //   let grossDowngradeToOldData = [];
  //   let grossDowngradeToNewData = [];
  //   let assuredDowngradeToNewData = [];
  //   let assuredDowngradeToOldData = [];

  //   // Process each sale
  //   for (let i = 0; i < salesleads.length; i++) {
  //     const salesLeadsData = salesleads[i];

  //     if (salesLeadsData['journey'] == 'InLXMl7OBAqlDTZcXwK0' || salesLeadsData['status']?.toLowerCase() == 'rejected') {
  //       continue;
  //     }

  //     const preSalesPerson = salesLeadsData['presalespersonname'] || 'Unknown';
  //     const salesPerson = salesLeadsData['salespersonname'] || 'Unknown';

  //     if ((salesLeadsData['purchasedate']?.toDate() >= startdate && salesLeadsData['purchasedate']?.toDate() <= enddate) &&
  //       (salesLeadsData['journeytype'] !== 'cancelled')
  //     ) {
  //       // const grossSaleData = { ...salesLeadsData };
  //       grossData.push(salesLeadsData['docid']);
  //       saleLeadsMap[salesLeadsData['docid']] = salesLeadsData


  //       if (salesLeadsData['status']?.toLowerCase() === 'approved' &&
  //         ['new', 'upgrade', 'addons'].includes(salesLeadsData['journeytype'])) {

  //         if (!preSalesMap.has(preSalesPerson)) {
  //           preSalesMap.set(preSalesPerson, {
  //             person: preSalesPerson,
  //             grossCount: 0,
  //             assuredCount: 0,
  //             grossCancelledNumber: 0,
  //             assuredCancelledNumber: 0,
  //             grossDowngradeNumber: 0,
  //             assuredDowngradeNumber: 0,
  //           });
  //         }

  //         if (!salesPersonMap.has(salesPerson)) {
  //           salesPersonMap.set(salesPerson, {
  //             person: salesPerson,
  //             grossCount: 0,
  //             assuredCount: 0,
  //             grossCancelledNumber: 0,
  //             assuredCancelledNumber: 0,
  //             grossDowngradeNumber: 0,
  //             assuredDowngradeNumber: 0,
  //           });
  //         }

  //         const preSalesEntry = preSalesMap.get(preSalesPerson)!;
  //         preSalesEntry.grossCount++;

  //         const salesPersonEntry = salesPersonMap.get(salesPerson)!;
  //         salesPersonEntry.grossCount++;
  //       }

  //       if (![null, undefined, ''].includes(salesLeadsData['paymentplan'])) {
  //         // const assuredSaleData = { ...salesLeadsData };
  //         assuredData.push(salesLeadsData['docid']);

  //         if (salesLeadsData['status']?.toLowerCase() === 'approved' &&
  //           ['new', 'upgrade', 'addons'].includes(salesLeadsData['journeytype'])) {
  //           const preSalesEntry = preSalesMap.get(preSalesPerson);
  //           const salesPersonEntry = salesPersonMap.get(salesPerson);

  //           if (preSalesEntry) {
  //             preSalesEntry.assuredCount++;
  //           }

  //           if (salesPersonEntry) {
  //             salesPersonEntry.assuredCount++;
  //           }
  //         }
  //       }
  //     }

  //     if (['cancelled', 'downgrade'].includes(salesLeadsData['journeytype']) &&
  //       salesLeadsData['date']?.toDate() >= startdate &&
  //       salesLeadsData['date']?.toDate() <= enddate &&
  //       salesLeadsData['status']?.toLowerCase() === 'approved') {
  //       if (salesLeadsData['journeytype'] === 'cancelled') {
  //         cancelledData.push(salesLeadsData);
  //       } else if (salesLeadsData['journeytype'] === 'downgrade') {
  //         downgradeData.push(salesLeadsData);
  //       }
  //     }
  //   }

  //   const cancelledPromises = cancelledData.map(async (sale) => {
  //     if (sale['canceldocid']) {
  //       const cancelRef = doc(this.firestore, 'salesleads', sale['canceldocid']);
  //       const cancelSnap = await getDoc(cancelRef);

  //       if (cancelSnap.exists()) {
  //         const originalSale = cancelSnap.data();
  //         const preSalesPerson = originalSale['presalespersonname'] || 'Unknown';
  //         const salesPerson = originalSale['salespersonname'] || 'Unknown';
  //         const balanceAmount = (originalSale['totalpurchasevalue'] ?? 0) - (sale['totalpurchasevalue'] ?? 0);

  //         const cancelData = { ...originalSale, balanceamount: balanceAmount };
  //         grossCancelledData.push(cancelData['docid']);
  //         saleLeadsMap[cancelData['docid']] = cancelData

  //         if (preSalesMap.has(preSalesPerson)) {
  //           const entry = preSalesMap.get(preSalesPerson)!;
  //           entry.grossCancelledNumber++;
  //         }

  //         if (salesPersonMap.has(salesPerson)) {
  //           const entry = salesPersonMap.get(salesPerson)!;
  //           entry.grossCancelledNumber++;
  //         }

  //         if (![null, undefined, ''].includes(originalSale['paymentplan'])) {
  //           assuredCancelledData.push(cancelData['docid']);

  //           if (preSalesMap.has(preSalesPerson)) {
  //             const entry = preSalesMap.get(preSalesPerson)!;
  //             entry.assuredCancelledNumber++;
  //           }

  //           if (salesPersonMap.has(salesPerson)) {
  //             const entry = salesPersonMap.get(salesPerson)!;
  //             entry.assuredCancelledNumber++;
  //           }
  //         }
  //       }
  //     }
  //   });

  //   await Promise.all(cancelledPromises);

  //   const downgradePromises = downgradeData.map(async (sale) => {
  //     if (sale['downgradefromdocid']) {
  //       const downgradeRef = doc(this.firestore, 'salesleads', sale['downgradefromdocid']);
  //       const downgradeSnap = await getDoc(downgradeRef);

  //       if (downgradeSnap.exists()) {
  //         const originalSale = downgradeSnap.data();
  //         const preSalesPerson = originalSale['presalespersonname'] || 'Unknown';
  //         const salesPerson = originalSale['salespersonname'] || 'Unknown';
  //         const downgradeValue = originalSale['totalpurchasevalue'] || 0;

  //         saleLeadsMap[originalSale['docid']] = originalSale
  //         if (sale['downgradetonewpurchase']
  //           && sale['purchasedate']?.toDate() >= startdate
  //           && sale['purchasedate']?.toDate() <= enddate
  //         ) {
  //           grossDowngradeToNewData.push(originalSale['docid']);
  //         } else {
  //           grossDowngradeToOldData.push(originalSale['docid']);
  //         }

  //         if (preSalesMap.has(preSalesPerson)) {
  //           const entry = preSalesMap.get(preSalesPerson)!;
  //           entry.grossDowngradeNumber++;
  //         }

  //         if (salesPersonMap.has(salesPerson)) {
  //           const entry = salesPersonMap.get(salesPerson)!;
  //           entry.grossDowngradeNumber++;
  //         }
  //         if (![null, undefined, ''].includes(originalSale['paymentplan'])) {
  //           if (sale['downgradetonewpurchase']
  //             && sale['purchasedate']?.toDate() >= startdate
  //             && sale['purchasedate']?.toDate() <= enddate
  //           ) {
  //             assuredDowngradeToNewData.push(originalSale['docid']);
  //           } else {
  //             assuredDowngradeToOldData.push(originalSale['docid']);
  //           }

  //           if (preSalesMap.has(preSalesPerson)) {
  //             const entry = preSalesMap.get(preSalesPerson)!;
  //             entry.assuredDowngradeNumber++;
  //           }

  //           if (salesPersonMap.has(salesPerson)) {
  //             const entry = salesPersonMap.get(salesPerson)!;
  //             entry.assuredDowngradeNumber++;
  //           }
  //         }
  //       }
  //     }
  //   });

  //   await Promise.all(downgradePromises);

  //   const approvedGrossData = grossData.filter(saleId => saleLeadsMap[saleId]['status']?.toLowerCase() === 'approved');
  //   let grossNew = 0, grossUpgrade = 0, grossAddons = 0;
  //   let assuredNew = 0, assuredUpgrade = 0, assuredAddons = 0;

  //   approvedGrossData.forEach(saleId => {
  //     const sale = saleLeadsMap[saleId]
  //     if (sale['journeytype'] === 'new') grossNew++;
  //     else if (sale['journeytype'] === 'upgrade') grossUpgrade++;
  //     else if (sale['journeytype'] === 'addons') grossAddons++;
  //   });

  //   assuredData.forEach(saleId => {
  //     const sale = saleLeadsMap[saleId]
  //     if (sale['journeytype'] === 'new') assuredNew++;
  //     else if (sale['journeytype'] === 'upgrade') assuredUpgrade++;
  //     else if (sale['journeytype'] === 'addons') assuredAddons++;
  //   });

  //   this.originalData.grossSalesSplit = {
  //     new: grossNew,
  //     upgrades: grossUpgrade,
  //     addons: grossAddons
  //   };

  //   this.originalData.assuredSalesSplit = {
  //     new: assuredNew,
  //     upgrades: assuredUpgrade,
  //     addons: assuredAddons
  //   };

  //   let grossNewValue = 0, grossUpgradeValue = 0, grossAddonValue = 0;
  //   let assuredNewValue = 0, assuredUpgradeValue = 0, assuredAddonValue = 0;

  //   approvedGrossData.forEach(saleId => {
  //     const sale = saleLeadsMap[saleId]
  //     const value = sale['totalpurchasevalue'] || 0;
  //     if (sale['journeytype'] === 'new') grossNewValue += value;
  //     else if (sale['journeytype'] === 'upgrade') grossUpgradeValue += value;
  //     else if (sale['journeytype'] === 'addons') grossAddonValue += value;
  //   });

  //   assuredData.forEach(saleId => {
  //     const sale = saleLeadsMap[saleId]
  //     const value = sale['totalpurchasevalue'] || 0;
  //     if (sale['journeytype'] === 'new') assuredNewValue += value;
  //     else if (sale['journeytype'] === 'upgrade') assuredUpgradeValue += value;
  //     else if (sale['journeytype'] === 'addons') assuredAddonValue += value;
  //   });

  //   this.originalData.grossNewValue = grossNewValue;
  //   this.originalData.grossUpgradeValue = grossUpgradeValue;
  //   this.originalData.grossAddonValue = grossAddonValue;
  //   this.originalData.assuredNewValue = assuredNewValue;
  //   this.originalData.assuredUpgradeValue = assuredUpgradeValue;
  //   this.originalData.assuredAddonValue = assuredAddonValue;

  //   this.originalData.approvedGrossSales = approvedGrossData.length;

  //   this.originalData.pendingGrossSales = grossData.filter(saleId => {
  //     const sale = saleLeadsMap[saleId]
  //     return [null, undefined, '', 'pending'].includes(sale['status']) ||
  //       sale['status']?.toLowerCase() === 'pending'
  //   }
  //   ).length;

  //   this.originalData.totalGrossValue = grossData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['totalpurchasevalue'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalGrossEMI = grossData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     sum + (sale['installmentamount'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalGrossCancelled = grossCancelledData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['balanceamount'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalAssuredCancelled = assuredCancelledData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['balanceamount'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalGrossDowngradeToOld = grossDowngradeToOldData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['totalpurchasevalue'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalGrossDowngradeToNew = grossDowngradeToNewData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['totalpurchasevalue'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalAssuredDowngradeToOld = assuredDowngradeToOldData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['totalpurchasevalue'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalAssuredDowngradeToNew = assuredDowngradeToNewData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['totalpurchasevalue'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalAssuredValue = assuredData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     return sum + (sale['totalpurchasevalue'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalAssuredEMI = assuredData.reduce((sum, saleId) => {
  //     const sale = saleLeadsMap[saleId]
  //     sum + (sale['installmentamount'] || 0)
  //   }, 0
  //   );

  //   this.originalData.totalAssuredCount = assuredData.length;

  //   // Separate data by journey type
  //   const grossNewData = approvedGrossData.filter(saleId => saleLeadsMap[saleId]['journeytype'] === 'new');
  //   const grossUpgradeData = approvedGrossData.filter(saleId => saleLeadsMap[saleId]['journeytype'] === 'upgrade');
  //   const grossAddonData = approvedGrossData.filter(saleId => saleLeadsMap[saleId]['journeytype'] === 'addons');

  //   const assuredNewData = assuredData.filter(saleId => saleLeadsMap[saleId]['journeytype'] === 'new');
  //   const assuredUpgradeData = assuredData.filter(saleId => saleLeadsMap[saleId]['journeytype'] === 'upgrade');
  //   const assuredAddonData = assuredData.filter(saleId => saleLeadsMap[saleId]['journeytype'] === 'addons');

  //   // Store ALL data
  //   this.originalData['allgrossdata'] = grossData;
  //   this.originalData['grosssale'] = { data: approvedGrossData, count: approvedGrossData.length };
  //   this.originalData['allgrosssales'] = { data: grossData, count: grossData.length };
  //   this.originalData['assuredsale'] = { data: assuredData, count: assuredData.length };
  //   this.originalData['grosscancelledsale'] = { data: grossCancelledData, count: grossCancelledData.length };
  //   this.originalData['assuredcancelledsale'] = { data: assuredCancelledData, count: assuredCancelledData.length };
  //   this.originalData['grossdowngradetooldsale'] = { data: grossDowngradeToOldData, count: grossDowngradeToOldData.length };
  //   this.originalData['grossdowngradetonewsale'] = { data: grossDowngradeToNewData, count: grossDowngradeToNewData.length };
  //   this.originalData['assureddowngradetooldsale'] = { data: assuredDowngradeToOldData, count: assuredDowngradeToOldData.length };
  //   this.originalData['assureddowngradetonewsale'] = { data: assuredDowngradeToNewData, count: assuredDowngradeToNewData.length };
  //   this.originalData['grossnewsale'] = { data: grossNewData, count: grossNewData.length };
  //   this.originalData['grossupgradesale'] = { data: grossUpgradeData, count: grossUpgradeData.length };
  //   this.originalData['grossaddonsale'] = { data: grossAddonData, count: grossAddonData.length };
  //   this.originalData['assurednewsale'] = { data: assuredNewData, count: assuredNewData.length };
  //   this.originalData['assuredupgradesale'] = { data: assuredUpgradeData, count: assuredUpgradeData.length };
  //   this.originalData['assuredaddonsale'] = { data: assuredAddonData, count: assuredAddonData.length };

  //   this.preSalesTableData = Array.from(preSalesMap.values());
  //   this.salesPersonTableData = Array.from(salesPersonMap.values());

  //   this.preSalesPersonList = this.preSalesTableData.map(item => item.person).sort();
  //   this.salesPersonList = this.salesPersonTableData.map(item => item.person).sort();

  //   this.salesLeadsMap.set(saleLeadsMap)

  //   this.applyFilters();
  //   this.calculateTotals();
  //   this.cdr.detectChanges();
  // }


  // function to proccess and assign properties with applied filters
  // calculateTotals(): void {
  //   let allGrossData = [...(this.originalData['allgrossdata'] || [])];
  //   let filteredAssuredData = [...this.originalData['assuredsale'].data];
  //   const salesLeadsMap = this.salesLeadsMap()

  //   if (this.selectedFilter || this.selectedJourney || this.selectedAssuredDateFilter) {
  //     allGrossData = allGrossData.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );
  //     filteredAssuredData = filteredAssuredData.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );
  //   }

  //   const approvedGrossData = allGrossData.filter((saleId: string) => salesLeadsMap[saleId]['status']?.toLowerCase() === 'approved');

  //   const pendingCount = allGrossData.filter((saleId: any) => {
  //     const sale = salesLeadsMap[saleId];
  //     return [null, undefined, '', 'pending'].includes(sale['status']) ||
  //       sale['status']?.toLowerCase() === 'pending'
  //   }
  //   ).length;

  //   let grossNew = 0, grossUpgrade = 0, grossAddons = 0;
  //   let assuredNew = 0, assuredUpgrade = 0, assuredAddons = 0;

  //   approvedGrossData.forEach(saleId => {
  //     const sale = salesLeadsMap[saleId];
  //     if (sale['journeytype'] === 'new') grossNew++;
  //     else if (sale['journeytype'] === 'upgrade') grossUpgrade++;
  //     else if (sale['journeytype'] === 'addons') grossAddons++;
  //   });

  //   filteredAssuredData.forEach(saleId => {
  //     const sale = salesLeadsMap[saleId];
  //     if (sale['journeytype'] === 'new') assuredNew++;
  //     else if (sale['journeytype'] === 'upgrade') assuredUpgrade++;
  //     else if (sale['journeytype'] === 'addons') assuredAddons++;
  //   });

  //   this.totalGrossCount = approvedGrossData.length + pendingCount;
  //   this.totalGrossValue = allGrossData.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['totalpurchasevalue'] || 0)
  //     , 0);

  //   this.originalData.totalGrossEMI = allGrossData.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['installmentamount'] || 0)
  //     , 0);

  //   this.totalAssuredCount = filteredAssuredData.length;
  //   this.totalAssuredValue = filteredAssuredData.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['totalpurchasevalue'] || 0)
  //     , 0);

  //   this.originalData.totalAssuredEMI = filteredAssuredData.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['installmentamount'] || 0)
  //     , 0);

  //   this.originalData.grossSalesSplit = {
  //     new: grossNew,
  //     upgrades: grossUpgrade,
  //     addons: grossAddons
  //   };

  //   this.originalData.assuredSalesSplit = {
  //     new: assuredNew,
  //     upgrades: assuredUpgrade,
  //     addons: assuredAddons
  //   };

  //   // Recalculate values for filtered data
  //   let grossNewValue = 0, grossUpgradeValue = 0, grossAddonValue = 0;
  //   let assuredNewValue = 0, assuredUpgradeValue = 0, assuredAddonValue = 0;

  //   approvedGrossData.forEach(saleId => {
  //     const sale = salesLeadsMap[saleId];
  //     const value = sale['totalpurchasevalue'] || 0;
  //     if (sale['journeytype'] === 'new') grossNewValue += value;
  //     else if (sale['journeytype'] === 'upgrade') grossUpgradeValue += value;
  //     else if (sale['journeytype'] === 'addons') grossAddonValue += value;
  //   });

  //   filteredAssuredData.forEach(saleId => {
  //     const sale = salesLeadsMap[saleId];
  //     const value = sale['totalpurchasevalue'] || 0;
  //     if (sale['journeytype'] === 'new') assuredNewValue += value;
  //     else if (sale['journeytype'] === 'upgrade') assuredUpgradeValue += value;
  //     else if (sale['journeytype'] === 'addons') assuredAddonValue += value;
  //   });

  //   this.originalData.grossNewValue = grossNewValue;
  //   this.originalData.grossUpgradeValue = grossUpgradeValue;
  //   this.originalData.grossAddonValue = grossAddonValue;
  //   this.originalData.assuredNewValue = assuredNewValue;
  //   this.originalData.assuredUpgradeValue = assuredUpgradeValue;
  //   this.originalData.assuredAddonValue = assuredAddonValue;
  //   this.originalData.approvedGrossSales = approvedGrossData.length;
  //   this.originalData.pendingGrossSales = pendingCount;
  //   this.originalData['assuredsale'].count = filteredAssuredData.length;
  //   let filteredGrossCancelled = [...this.originalData['grosscancelledsale'].data];
  //   let filteredAssuredCancelled = [...this.originalData['assuredcancelledsale'].data];

  //   let filteredGrossDowngradeToOld = [...this.originalData['grossdowngradetooldsale'].data];
  //   let filteredGrossDowngradeToNew = [...this.originalData['grossdowngradetonewsale'].data];

  //   let filteredAssuredDowngradeToOld = [...this.originalData['assureddowngradetooldsale'].data];
  //   let filteredAssuredDowngradeToNew = [...this.originalData['assureddowngradetonewsale'].data];

  //   if (this.selectedFilter || this.selectedJourney || this.selectedAssuredDateFilter) {
  //     filteredGrossCancelled = filteredGrossCancelled.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );
  //     filteredAssuredCancelled = filteredAssuredCancelled.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );
  //     //

  //     filteredGrossDowngradeToOld = filteredGrossDowngradeToOld.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );

  //     filteredGrossDowngradeToNew = filteredGrossDowngradeToNew.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );

  //     //
  //     filteredAssuredDowngradeToOld = filteredAssuredDowngradeToOld.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );

  //     filteredAssuredDowngradeToNew = filteredAssuredDowngradeToNew.filter((saleId: string) =>
  //       this.matchesFilterCriteria(salesLeadsMap[saleId])
  //     );
  //   }
  //   this.originalData.totalGrossCancelled = filteredGrossCancelled.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['balanceamount'] || 0)
  //     , 0);

  //   this.originalData.totalAssuredCancelled = filteredAssuredCancelled.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['balanceamount'] || 0)
  //     , 0);

  //   this.originalData.totalGrossDowngradeToOld = filteredGrossDowngradeToOld.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['totalpurchasevalue'] || 0)
  //     , 0);

  //   this.originalData.totalGrossDowngradeToNew = filteredGrossDowngradeToNew.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['totalpurchasevalue'] || 0)
  //     , 0);

  //   this.originalData.totalAssuredDowngradeToOld = filteredAssuredDowngradeToOld.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['totalpurchasevalue'] || 0)
  //     , 0);

  //   this.originalData.totalAssuredDowngradeToNew = filteredAssuredDowngradeToNew.reduce((sum: number, saleId: string) => sum + (salesLeadsMap[saleId]['totalpurchasevalue'] || 0)
  //     , 0);

  //   this.originalData['grosscancelledsale'].count = filteredGrossCancelled.length;
  //   this.originalData['assuredcancelledsale'].count = filteredAssuredCancelled.length;

  //   this.originalData['grossdowngradetooldsale'].count = filteredGrossDowngradeToOld.length;
  //   this.originalData['grossdowngradetonewsale'].count = filteredGrossDowngradeToNew.length;

  //   this.originalData['assureddowngradetooldsale'].count = filteredAssuredDowngradeToOld.length;
  //   this.originalData['assureddowngradetonewsale'].count = filteredAssuredDowngradeToNew.length;

  //   this.updateBarChart();
  // }

  // function to reset or clear applied filters
  clearFilters(): void {
    this.selectedPreSalesPerson = [];
    this.selectedSalesPerson = [];
    this.selectedJourney = [];
    this.selectedSaleTypeFilter = [];
    this.selectedFilter = '';
    this.selectedAssuredDateFilter = '';
    this.calculateDashboardMetrics();
  }

  // function to apply journey filter
  onJourneyClick(journey: 'ecosystem' | 'dfu' | 'gifts'): void {
    if (this.selectedFilter === journey) {
      this.selectedFilter = '';
      this.selectedJourney = [];
    } else {
      this.selectedFilter = journey;
      this.selectedJourney = this[`${journey}Journeys`] || [];
    }
    this.closeTable();
    this.calculateDashboardMetrics()
  }

  // function to apply assureddate filter
  onAssuredDateFilterClick(filterType: string): void {
    this.isLoading = true

    if (this.selectedAssuredDateFilter === filterType) {
      this.selectedAssuredDateFilter = '';
      this.loadCurrentSalesLeads();
    } else {
      this.selectedAssuredDateFilter = filterType;
      this.loadAssuredDateFilteredData(filterType);
    }
    this.closeTable();
  }

  // function to initalize properties with assured filter
  loadAssuredDateFilteredData(filterType: string): void {

    this.ngOnDestroy()

    this.loadingStates.salesLeads = false;
    this.loadingStates.cancelledSales = false;
    this.loadingStates.downgradeSales = false;

    const now = new Date();
    const daysAgo = filterType === 'last7days' ? 7 : 30;
    const filterDate = new Date(now);
    filterDate.setDate(filterDate.getDate() - daysAgo);
    filterDate.setHours(0, 0, 0, 0);

    this.assuredFilterStartDate = this.datePipe.transform(filterDate, 'dd-MMM-yyyy') || '';
    this.assuredFilterEndDate = this.datePipe.transform(now, 'dd-MMM-yyyy') || '';

    const filterDateTimestamp = Timestamp.fromDate(filterDate).toDate();
    const queryValue = where("paymentplanassureddate", ">=", filterDateTimestamp);

    this.subscriptions['salesleads'] = onSnapshot(query(collection(this.firestore, "salesleads"), queryValue), {
      includeMetadataChanges: true
    },
      async (snap) => {
        try {
          if (snap.metadata.fromCache) {
            return
          }
          const salesleads = snap.docs.map((d) => ({ ...d.data() }))
          const filteredSales = salesleads.filter(sale => {
            if (!sale['paymentplanassureddate']) return false;

            const assuredDate = sale['paymentplanassureddate'] instanceof Date
              ? sale['paymentplanassureddate']
              : sale['paymentplanassureddate'].toDate();

            return assuredDate >= filterDate;
          });

          if (filteredSales.length > 0) {
            const dates = filteredSales.map(sale => {
              const purchaseDate = sale['purchasedate']?.toDate();
              const saleDate = sale['date']?.toDate();
              return purchaseDate || saleDate;
            }).filter(d => d);
            if (dates.length > 0) {
              const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
              const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

              // await this.processSalesData(filteredSales, minDate, maxDate);
              await this.processSalesLeadsData(filteredSales, minDate, maxDate)
            }
          } else {
            // await this.processSalesData(filteredSales, filterDate, now);
            await this.processSalesLeadsData(filteredSales, filterDate, now)
          }
          this.loadingStates.salesLeads = true;
          this.loadingStates.cancelledSales = true;
          this.loadingStates.downgradeSales = true;
          this.checkLoadingComplete();
        } catch (error) {
          console.error('Error in fetching sales leads : ', error)
          this.loadingStates.salesLeads = true;
          this.loadingStates.cancelledSales = true;
          this.loadingStates.downgradeSales = true;
          this.checkLoadingComplete();
        }

      }
    )
  }


  // function to get journey list with resect to selected journey filter
  getFilteredJourneyList(): { id: string, name: string }[] {
    if (this.selectedFilter === 'ecosystem') {
      return this.journeyList.filter(j => this.ecosystemJourneys.includes(j.id));
    } else if (this.selectedFilter === 'dfu') {
      return this.journeyList.filter(j => this.dfuJourneys.includes(j.id));
    } else if (this.selectedFilter === 'gifts') {
      return this.journeyList.filter(j => this.giftsJourneys.includes(j.id));
    }
    return this.journeyList;
  }

  // functoin to handle indiviual journey selection
  onJourneyChange(journeyIds: string[]): void {
    this.selectedJourney = journeyIds;
    this.calculateDashboardMetrics();
  }

  // function to handle presales person filter selection
  onPreSalesPersonChange(person: string[]): void {
    this.selectedPreSalesPerson = person;
    this.calculateDashboardMetrics();
  }

  // function to handle sales person filter selection
  onSalesPersonChange(person: string[]): void {
    this.selectedSalesPerson = person;
    this.calculateDashboardMetrics();
  }

  // function to calucate presales and sales persons metrics with applied filters
  applyFilters(): void {
    let filteredPreSales = [...this.preSalesDataSource.data];
    let filteredSalesPerson = [...this.salesPersonDataSource.data];

    console.log(filteredSalesPerson.length)

    if (this.selectedJourney || this.selectedFilter || this.selectedAssuredDateFilter) {
      filteredPreSales = filteredPreSales.map(person => {
        const filteredData = this.getFilteredDataForPerson(person.person, true);
        return {
          ...person,
          grossCount: filteredData.grossCount,
          assuredCount: filteredData.assuredCount,
          grossCancelledNumber: filteredData.grossCancelledNumber,
          assuredCancelledNumber: filteredData.assuredCancelledNumber,
          grossDowngradeNumber: filteredData.grossDowngradeNumber,
          assuredDowngradeNumber: filteredData.assuredDowngradeNumber,
        };
      });
      filteredSalesPerson = filteredSalesPerson.map(person => {
        const filteredData = this.getFilteredDataForPerson(person.person, false);
        return {
          ...person,
          grossCount: filteredData.grossCount,
          assuredCount: filteredData.assuredCount,
          grossCancelledNumber: filteredData.grossCancelledNumber,
          assuredCancelledNumber: filteredData.assuredCancelledNumber,
          grossDowngradeNumber: filteredData.grossDowngradeNumber,
          assuredDowngradeNumber: filteredData.assuredDowngradeNumber,
        };
      });
    }

    console.log(filteredSalesPerson.length)
    console.log(filteredSalesPerson)
    if (this.selectedSaleTypeFilter.length > 0) {
      filteredPreSales = filteredPreSales.filter(person => {
        return this.selectedSaleTypeFilter.some(filterType => {
          switch (filterType) {
            case 'gross':
              return person.grossCount > 0;
            case 'assured':
              return person.assuredCount > 0;
            case 'grossCancelled':
              return person.grossCancelledNumber > 0;
            case 'assuredCancelled':
              return person.assuredCancelledNumber > 0;
            case 'grossDowngrade':
              return person.grossDowngradeNumber > 0;
            case 'assuredDowngrade':
              return person.assuredDowngradeNumber > 0;
            default:
              return true;
          }
        });
      });

      filteredSalesPerson = filteredSalesPerson.filter(person => {
        return this.selectedSaleTypeFilter.some(filterType => {
          switch (filterType) {
            case 'gross':
              return person.grossCount > 0;
            case 'assured':
              return person.assuredCount > 0;
            case 'grossCancelled':
              return person.grossCancelledNumber > 0;
            case 'assuredCancelled':
              return person.assuredCancelledNumber > 0;
            case 'grossDowngrade':
              return person.grossDowngradeNumber > 0;
            case 'assuredDowngrade':
              return person.assuredDowngradeNumber > 0;
            default:
              return true;
          }
        });
      });
    } else {
      filteredPreSales = filteredPreSales.filter(person =>
        person.grossCount > 0 ||
        person.assuredCount > 0 ||
        person.grossCancelledNumber > 0 ||
        person.assuredCancelledNumber > 0 ||
        person.grossDowngradeNumber > 0 ||
        person.assuredDowngradeNumber > 0
      );

      filteredSalesPerson = filteredSalesPerson.filter(person =>
        person.grossCount > 0 ||
        person.assuredCount > 0 ||
        person.grossCancelledNumber > 0 ||
        person.assuredCancelledNumber > 0 ||
        person.grossDowngradeNumber > 0 ||
        person.assuredDowngradeNumber > 0
      );
    }

    console.log(filteredSalesPerson.length)

    if (this.selectedPreSalesPerson.length > 0) {
      filteredPreSales = filteredPreSales.filter(item => this.selectedPreSalesPerson.includes(item.person));

      filteredSalesPerson = filteredSalesPerson
        .map(person => this.recalculatePersonCounts(person, false, this.selectedPreSalesPerson, []))
        .filter(p => p.grossCount > 0 || p.assuredCount > 0 || p.grossCancelledNumber > 0 ||
          p.assuredCancelledNumber > 0 || p.grossDowngradeNumber > 0 || p.assuredDowngradeNumber > 0);
    }

    if (this.selectedSalesPerson.length > 0) {
      filteredSalesPerson = filteredSalesPerson.filter(item => this.selectedSalesPerson.includes(item.person));

      filteredPreSales = filteredPreSales
        .map(person => this.recalculatePersonCounts(person, true, [], this.selectedSalesPerson))
        .filter(p => p.grossCount > 0 || p.assuredCount > 0 || p.grossCancelledNumber > 0 ||
          p.assuredCancelledNumber > 0 || p.grossDowngradeNumber > 0 || p.assuredDowngradeNumber > 0);
    }

    console.log(filteredSalesPerson.length)
    // this.filteredPreSalesTableData = filteredPreSales;
    // this.filteredSalesPersonTableData = filteredSalesPerson;

    // this.preSalesDataSource.data = this.filteredPreSalesTableData;
    // this.salesPersonDataSource.data = this.filteredSalesPersonTableData;

    // let [
    //   filteredNewSalesPreSales,
    //   filteredNewSalesSalesPerson,
    //   filteredUpgradePreSales,
    //   filteredUpgradeSalesPerson
    // ] = this.calculateJourneyTypeTables();

    // if (this.selectedPreSalesPerson.length > 0) {
    //   filteredNewSalesPreSales = filteredNewSalesPreSales.filter(p => this.selectedPreSalesPerson.includes(p.person));
    //   filteredUpgradePreSales = filteredUpgradePreSales.filter(p => this.selectedPreSalesPerson.includes(p.person));
    // }

    // if (this.selectedSalesPerson.length > 0) {
    //   filteredNewSalesSalesPerson = filteredNewSalesSalesPerson.filter(p => this.selectedSalesPerson.includes(p.person));
    //   filteredUpgradeSalesPerson = filteredUpgradeSalesPerson.filter(p => this.selectedSalesPerson.includes(p.person));
    // }

    // this.filteredNewSalesPreSalesTableData = filteredNewSalesPreSales;
    // this.filteredNewSalesSalesPersonTableData = filteredNewSalesSalesPerson;
    // this.filteredUpgradePreSalesTableData = filteredUpgradePreSales;
    // this.filteredUpgradeSalesPersonTableData = filteredUpgradeSalesPerson;

    // this.newSalesPreSalesDataSource.data = filteredNewSalesPreSales;
    // this.newSalesSalesPersonDataSource.data = filteredNewSalesSalesPerson;
    // this.upgradePreSalesDataSource.data = filteredUpgradePreSales;
    // this.upgradeSalesPersonDataSource.data = filteredUpgradeSalesPerson;

    // if (this.preSalesPaginator) {
    //   this.preSalesPaginator.firstPage();
    // }
    // if (this.salesPersonPaginator) {
    //   this.salesPersonPaginator.firstPage();
    // }
    // this.updateBarChart();
  }

  // function to calculate new and upgrade
  private calculateJourneyTypeTables(): any[] {
    const newSalesPreSalesMap = new Map<string, Partial<GrossSalesData>>();
    const newSalesSalesPersonMap = new Map<string, Partial<GrossSalesData>>();
    const upgradePreSalesMap = new Map<string, Partial<GrossSalesData>>();
    const upgradeSalesPersonMap = new Map<string, Partial<GrossSalesData>>();

    const salesLeadsMap = this.salesLeadsMap()

    // Process gross sales for 'new' journey type
    this.originalData['grosssale'].data.forEach((saleId: any) => {
      const sale = salesLeadsMap[saleId];
      if (sale['journeytype'] === 'new' && this.matchesFilterCriteria(sale)) {
        if (this.selectedPreSalesPerson.length > 0 && !this.selectedPreSalesPerson.includes(sale['presalespersonname'])) return;
        if (this.selectedSalesPerson.length > 0 && !this.selectedSalesPerson.includes(sale['salespersonname'])) return;
        const preSalesPerson = sale['presalespersonname'] || 'Unknown';
        const salesPerson = sale['salespersonname'] || 'Unknown';

        if (!newSalesPreSalesMap.has(preSalesPerson)) {
          newSalesPreSalesMap.set(preSalesPerson, {
            person: preSalesPerson, grossCount: 0, assuredCount: 0,
          });
        }
        if (!newSalesSalesPersonMap.has(salesPerson)) {
          newSalesSalesPersonMap.set(salesPerson, {
            person: salesPerson, grossCount: 0, assuredCount: 0,
          });
        }

        newSalesPreSalesMap.get(preSalesPerson)!.grossCount++;
        newSalesSalesPersonMap.get(salesPerson)!.grossCount++;
      }
    });

    // Process assured sales for 'new' journey type
    this.originalData['assuredsale'].data.forEach((saleId: any) => {
      const sale = salesLeadsMap[saleId];
      if (sale['journeytype'] === 'new' && this.matchesFilterCriteria(sale)) {
        if (this.selectedPreSalesPerson.length > 0 && !this.selectedPreSalesPerson.includes(sale['presalespersonname'])) return;
        if (this.selectedSalesPerson.length > 0 && !this.selectedSalesPerson.includes(sale['salespersonname'])) return;
        const preSalesPerson = sale['presalespersonname'] || 'Unknown';
        const salesPerson = sale['salespersonname'] || 'Unknown';

        if (newSalesPreSalesMap.has(preSalesPerson)) {
          newSalesPreSalesMap.get(preSalesPerson)!.assuredCount++;
        }
        if (newSalesSalesPersonMap.has(salesPerson)) {
          newSalesSalesPersonMap.get(salesPerson)!.assuredCount++;
        }
      }
    });

    // Process gross sales for 'upgrade' journey type
    this.originalData['grosssale'].data.forEach((saleId: any) => {
      const sale = salesLeadsMap[saleId];
      if (sale['journeytype'] === 'upgrade' && this.matchesFilterCriteria(sale)) {
        if (this.selectedPreSalesPerson.length > 0 && !this.selectedPreSalesPerson.includes(sale['presalespersonname'])) return;
        if (this.selectedSalesPerson.length > 0 && !this.selectedSalesPerson.includes(sale['salespersonname'])) return;
        const preSalesPerson = sale['presalespersonname'] || 'Unknown';
        const salesPerson = sale['salespersonname'] || 'Unknown';

        if (!upgradePreSalesMap.has(preSalesPerson)) {
          upgradePreSalesMap.set(preSalesPerson, {
            person: preSalesPerson, grossCount: 0, assuredCount: 0,
          });
        }
        if (!upgradeSalesPersonMap.has(salesPerson)) {
          upgradeSalesPersonMap.set(salesPerson, {
            person: salesPerson, grossCount: 0, assuredCount: 0,
          });
        }

        upgradePreSalesMap.get(preSalesPerson)!.grossCount++;
        upgradeSalesPersonMap.get(salesPerson)!.grossCount++;
      }
    });

    // Process assured sales for 'upgrade' journey type
    this.originalData['assuredsale'].data.forEach((saleId: any) => {
      const sale = salesLeadsMap[saleId];
      if (sale['journeytype'] === 'upgrade' && this.matchesFilterCriteria(sale)) {
        if (this.selectedPreSalesPerson.length > 0 && !this.selectedPreSalesPerson.includes(sale['presalespersonname'])) return;
        if (this.selectedSalesPerson.length > 0 && !this.selectedSalesPerson.includes(sale['salespersonname'])) return;
        const preSalesPerson = sale['presalespersonname'] || 'Unknown';
        const salesPerson = sale['salespersonname'] || 'Unknown';

        if (upgradePreSalesMap.has(preSalesPerson)) {
          upgradePreSalesMap.get(preSalesPerson)!.assuredCount++;
        }
        if (upgradeSalesPersonMap.has(salesPerson)) {
          upgradeSalesPersonMap.get(salesPerson)!.assuredCount++;
        }
      }
    });


    return [
      Array.from(newSalesPreSalesMap.values()),
      Array.from(newSalesSalesPersonMap.values()),
      Array.from(upgradePreSalesMap.values()),
      Array.from(upgradeSalesPersonMap.values())
    ];
  }

  // function to calculate metrics for sales or presales person
  private recalculatePersonCounts(person: any, isPreSales: boolean, filterPresales: string[] = [], filterSales: string[]): any {
    const personField = isPreSales ? 'presalespersonname' : 'salespersonname';
    const salesLeadsMap = this.salesLeadsMap()

    const filterSale = (saleId: any) => {
      const sale = salesLeadsMap[saleId]
      if (sale[personField] !== person.person) return false;
      if (filterPresales.length > 0 && !filterPresales.includes(sale['presalespersonname'])) return false;
      if (filterSales.length > 0 && !filterSales.includes(sale['salespersonname'])) return false;
      return this.matchesFilterCriteria(sale);
    };

    const grossSales = this.originalData['grosssale'].data.filter(filterSale);
    const assuredSales = this.originalData['assuredsale'].data.filter(filterSale);
    const grossCancelled = this.originalData['grosscancelledsale'].data.filter(filterSale);
    const assuredCancelled = this.originalData['assuredcancelledsale'].data.filter(filterSale);
    const grossDowngrade = [...this.originalData['grossdowngradetooldsale'].data, ...this.originalData['grossdowngradetonewsale'].data].filter(filterSale);
    const assuredDowngrade = [...this.originalData['assureddowngradetooldsale'].data, ...this.originalData['assureddowngradetonewsale'].data].filter(filterSale);

    return {
      ...person,
      grossCount: grossSales.length,
      assuredCount: assuredSales.length,
      grossCancelledNumber: grossCancelled.length,
      assuredCancelledNumber: assuredCancelled.length,
      grossDowngradeNumber: grossDowngrade.length,
      assuredDowngradeNumber: assuredDowngrade.length,
    };
  }

  // function to get filtered data for  sales or persales person 
  getFilteredDataForPerson(personName: string, isPreSales: boolean): any {
    const result = {
      grossCount: 0,
      assuredCount: 0,
      grossCancelledNumber: 0,
      assuredCancelledNumber: 0,
      grossDowngradeNumber: 0,
      assuredDowngradeNumber: 0,
    };
    const salesLeadsMap = this.salesLeadsMap()

    const personField = isPreSales ? 'presalespersonname' : 'salespersonname';

    const grossSales = this.metric['gross'].data.filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      return sale[personField] === personName && this.matchesFilterCriteria(sale)
    }
    );
    result.grossCount = grossSales.length;

    const assuredSales = this.metric['assured'].data.filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      return sale[personField] === personName && this.matchesFilterCriteria(sale)
    }
    );
    result.assuredCount = assuredSales.length;

    const grossCancelled = this.metric['grosscancelled'].data.filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      return sale[personField] === personName && this.matchesFilterCriteria(sale)
    }
    );
    result.grossCancelledNumber = grossCancelled.length;

    const assuredCancelled = this.metric['assuredcancelled'].data.filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      return sale[personField] === personName && this.matchesFilterCriteria(sale)
    }
    );
    result.assuredCancelledNumber = assuredCancelled.length;

    const grossDowngrade = [...this.metric['grossdowngradetoold'].data, ...this.metric['grossdowngradetonew'].data].filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      return sale[personField] === personName && this.matchesFilterCriteria(sale)
    }
    );
    result.grossDowngradeNumber = grossDowngrade.length;

    const assuredDowngrade = [...this.metric['assureddowngradetoold'].data, ...this.metric['assureddowngradetonew'].data].filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      return sale[personField] === personName && this.matchesFilterCriteria(sale)
    }
    );
    result.assuredDowngradeNumber = assuredDowngrade.length;

    return result;
  }

  // function to move date range to previous month
  goToPreviousMonth(): void {
    this.isLoading = true;
    this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
    this.setMonthDates();
    this.updateDisplayMonth();
    this.loadCurrentSalesLeads();
  }

  // function to move date range to next month
  goToNextMonth(): void {
    this.isLoading = true;
    this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
    this.setMonthDates();
    this.updateDisplayMonth();
    this.loadCurrentSalesLeads();
  }

  // function to toggle between month to custom date range filter
  toggleDateMode(): void {
    this.isLoading = true;
    this.pickerMode = this.pickerMode === 'month' ? 'range' : 'month';
    if (this.pickerMode === 'month') {
      this.currentMonth = new Date();
      this.setMonthDates();
      this.updateDisplayMonth();
      this.loadCurrentSalesLeads();
    } else {
      this.setMonthDates();
      this.customStartDate = new Date(this.startDate);
      this.customEndDate = new Date(this.endDate);
      this.loadCurrentSalesLeads();
    }
  }

  // function to set expanded of grosssales data
  isExpanded = (index: number, row: GrossSalesData) => {
    return row.expanded === true;
  };

  // function to handle click in table cell
  onCellClick(row: GrossSalesData, type: string, isPreSalesTable: boolean): void {
    const dataSource = isPreSalesTable ? this.preSalesDataSource.data : this.salesPersonDataSource.data;
    const salesLeadsMap = this.salesLeadsMap()
    dataSource.forEach(r => {
      if (r !== row) {
        r.expanded = false;
        r.expandedData = [];
        r.expandedType = '';
      }
    });

    if (row.expanded && row.expandedType === type) {
      row.expanded = false;
      row.expandedData = [];
      row.expandedType = '';
      return;
    }

    let dataToShow: any[] = [];

    switch (type) {
      case 'grossCount':
        dataToShow = this.metric['gross'].data.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          return isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person
        }
        );
        break;
      case 'assuredCount':
        dataToShow = this.metric['assured'].data.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          return isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person
        }
        );
        break;
      case 'grossCancelled':
        dataToShow = this.metric['grosscancelled'].data.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          return isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person
        }
        );
        break;
      case 'assuredCancelled':
        dataToShow = this.metric['assuredcancelled'].data.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          return isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person
        }
        );
        break;
      case 'grossDowngrade':
        const grossDowngrade = [...this.metric['grossdowngradetoold'].data, ...this.metric['grossdowngradetonew'].data]
        dataToShow = grossDowngrade.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          return isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person
        }
        );
        break;
      case 'assuredDowngrade':
        const assuredDowngrade = [...this.metric['assureddowngradetoold'].data, ...this.metric['assureddowngradetonew'].data]
        dataToShow = assuredDowngrade.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          return isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person
        }
        );
        break;
      case 'actualGross':
        dataToShow = this.metric['grosscancelled'].data.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          const [start, end] = this.getDateRange
          const isInSelectedRange = start <= sale['purchasedate']?.toDate() && end >= sale['purchasedate']?.toDate()
          return (isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person) && isInSelectedRange;
        }
        );
        break;
      case 'actualAssured':
        dataToShow = this.metric['assuredcancelled'].data.filter((saleId: string) => {
          const sale = salesLeadsMap[saleId];
          const [start, end] = this.getDateRange
          const isInSelectedRange = start <= sale['purchasedate']?.toDate() && end >= sale['purchasedate']?.toDate()
          return (isPreSalesTable ?
            sale['presalespersonname'] === row.person :
            sale['salespersonname'] === row.person) && isInSelectedRange
        }
        );
        break;
    }

    dataToShow = dataToShow.filter((saleId: string) => {
      let matches = true;
      const sale = salesLeadsMap[saleId];
      if (this.selectedPreSalesPerson.length > 0 && !this.selectedPreSalesPerson.includes(sale['presalespersonname'])) {
        matches = false;
      }

      if (this.selectedSalesPerson.length > 0 && !this.selectedSalesPerson.includes(sale['salespersonname'])) {
        matches = false;
      }

      if (!this.matchesFilterCriteria(sale)) {
        matches = false;
      }

      return matches;
    });

    row.expanded = true;
    row.expandedData = dataToShow;
    row.expandedType = type;

    if (isPreSalesTable) {
      this.preSalesDataSource.data = [...this.preSalesDataSource.data];
    } else {
      this.salesPersonDataSource.data = [...this.salesPersonDataSource.data];
    }
  }

  // function to update month display value in ui
  private updateDisplayMonth(): void {
    const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
    this.displayMonth = this.currentMonth.toLocaleDateString('en-US', options);
  }

  // function to close expanded row
  closeExpandedRow(row: GrossSalesData, isPreSalesTable: boolean): void {
    row.expanded = false;
    row.expandedData = [];
    row.expandedType = '';
    if (isPreSalesTable) {
      this.preSalesDataSource.data = [...this.preSalesDataSource.data];
    } else {
      this.salesPersonDataSource.data = [...this.salesPersonDataSource.data];
    }
  }

  // function to handle cell click in sales and presales person journey tabel
  onCellClickJourneyType(row: GrossSalesData, type: string, isPreSalesTable: boolean, journeyType: 'new' | 'upgrade'): void {
    const dataSource = isPreSalesTable
      ? (journeyType === 'new' ? this.newSalesPreSalesDataSource.data : this.upgradePreSalesDataSource.data)
      : (journeyType === 'new' ? this.newSalesSalesPersonDataSource.data : this.upgradeSalesPersonDataSource.data);
    const salesLeadsMap = this.salesLeadsMap();

    dataSource.forEach(r => {
      if (r !== row) {
        r.expanded = false;
        r.expandedData = [];
        r.expandedType = '';
      }
    });

    if (row.expanded && row.expandedType === type) {
      row.expanded = false;
      row.expandedData = [];
      row.expandedType = '';
      return;
    }

    let dataToShow: any[] = [];
    const dataKey = type === 'grossCount' ? 'gross' : 'assured';

    dataToShow = this.metric[dataKey].data.filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      const matchesPerson = isPreSalesTable
        ? sale['presalespersonname'] === row.person
        : sale['salespersonname'] === row.person;
      const matchesJourneyType = sale['journeytype'] === journeyType;
      return matchesPerson && matchesJourneyType;
    });

    dataToShow = dataToShow.filter((saleId: string) => {
      const sale = salesLeadsMap[saleId];
      let matches = true;
      if (this.selectedPreSalesPerson.length > 0 && !this.selectedPreSalesPerson.includes(sale['presalespersonname'])) {
        matches = false;
      }
      if (this.selectedSalesPerson.length > 0 && !this.selectedSalesPerson.includes(sale['salespersonname'])) {
        matches = false;
      }
      if (!this.matchesFilterCriteria(sale)) {
        matches = false;
      }
      return matches;
    });

    row.expanded = true;
    row.expandedData = dataToShow;
    row.expandedType = type;

    if (isPreSalesTable) {
      if (journeyType === 'new') {
        this.newSalesPreSalesDataSource.data = [...this.newSalesPreSalesDataSource.data];
      } else {
        this.upgradePreSalesDataSource.data = [...this.upgradePreSalesDataSource.data];
      }
    } else {
      if (journeyType === 'new') {
        this.newSalesSalesPersonDataSource.data = [...this.newSalesSalesPersonDataSource.data];
      } else {
        this.upgradeSalesPersonDataSource.data = [...this.upgradeSalesPersonDataSource.data];
      }
    }
  }

  // function to close expanded row in journey table
  closeExpandedRowJourneyType(row: GrossSalesData, isPreSalesTable: boolean, journeyType: 'new' | 'upgrade'): void {
    row.expanded = false;
    row.expandedData = [];
    row.expandedType = '';

    if (isPreSalesTable) {
      if (journeyType === 'new') {
        this.newSalesPreSalesDataSource.data = [...this.newSalesPreSalesDataSource.data];
      } else {
        this.upgradePreSalesDataSource.data = [...this.upgradePreSalesDataSource.data];
      }
    } else {
      if (journeyType === 'new') {
        this.newSalesSalesPersonDataSource.data = [...this.newSalesSalesPersonDataSource.data];
      } else {
        this.upgradeSalesPersonDataSource.data = [...this.upgradeSalesPersonDataSource.data];
      }
    }
  }

  // function to check whether the sale data is passed the filters or not
  matchesFilterCriteria(sale: any): boolean {
    const saleJourney = sale['journey'];
    const preSalesPerson = sale['presalespersonname'] || 'Unknown';
    const salesPerson = sale['salespersonname'] || 'Unknown';

    const journeyCondition = (![null, undefined, ''].includes(this.selectedFilter) || this.selectedJourney.length > 0) && !this.selectedJourney.includes(saleJourney)

    const preSalesPersonCondition = this.selectedPreSalesPerson.length > 0 && !this.selectedPreSalesPerson.includes(preSalesPerson)
    const salesPersonCondition = this.selectedSalesPerson.length > 0 && !this.selectedSalesPerson.includes(salesPerson)

    if (journeyCondition || preSalesPersonCondition || salesPersonCondition) {
      return false;
    }

    return true;
  }


  // function to format normal number to indian currency
  formatIndianCurrency(value: number): string {
    if (!value && value !== 0) return '-';

    return value.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }


  // function to open the table 
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
        this.tableSearchText = '';

        setTimeout(() => {
          const tableElement = document.querySelector('.table-section2');
          if (tableElement) {
            tableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 10);
      }
    }
  }

  // function to open tabel with gross data
  onGrossSplitClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  // function to open tabel with assured data
  onAssuredSplitClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  // function to open tabel with journey type cancelled
  onCancelledClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  // function to open tabel with journey type downgrade
  onDowngradeClick(event: Event, boxType: string) {
    event.stopPropagation();
    this.onBoxClick(boxType);
  }

  // function to update table data
  updateTable(boxType: string) {
    let configData = this.tableConfigs[boxType];
    configData['data'] = configData['dataKey'] === 'gross' ? [...this.metric[configData['dataKey']].data, ...this.metric.grosspending] : this.metric[configData['dataKey']].data;
    this.filteredTableData = [...configData['data']];
    this.currentTableConfig = configData;
    this.calculatePagination();
  }

  // function to close table
  closeTable() {
    this.showTable = false;
    this.currentTableConfig = null;
    this.tableSearchText = '';
    this.filteredTableData = [];
    this.currentPage = 1;
  }

  // function to filter table data if open
  filterTableData(value) {
    if (!this.currentTableConfig || !this.filteredTableData) {
      return;
    }

    const salesLeadsMap = this.salesLeadsMap();

    const searchTerm = value.search || '';
    const selectedJourney = value.journey || [];
    const selectedStartPurchaseDate = value.purchaseStart || '';
    const selectedEndPurchaseDate = value.purchaseEnd || '';
    const selectedAssuredData = value.assured;
    const selectedStatusData = value.status;
    const selectedSaleTypeData = value.saleType;
    const selectedCustomerStatus = value.customerStatus;

    this.hasActiveFilters = !!(
      searchTerm.trim() ||
      selectedJourney.length > 0 ||
      (selectedStartPurchaseDate && selectedEndPurchaseDate) ||
      selectedAssuredData?.trim() ||
      selectedStatusData?.trim() ||
      selectedSaleTypeData?.trim()
    );

    this.currentTableConfig.data = this.filteredTableData.filter(saleId => {
      let matchesSearch = true;
      let matchesJourney = true;
      let matchesJourneyCoach = true;
      let matchesPurchaseDate = true;
      let matchesAssured = true;
      let matchesStatus = true;
      let matchesSaleType = true;
      let matchesCustomerStatus = true;

      const row = salesLeadsMap[saleId];

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
        matchesJourney = selectedJourney.includes(row['journey']);
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

  // function to update or change tabel config if table open
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

  // function to refres table filters
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

  // function to format values in table cells
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
      value = new Date(value);
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
    return [];
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

  // function to export table data
  exportExpandedData(ids: any[], personName: string, isPreSales: boolean) {
    const data = this.getSalesData(ids)
    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }

    const headers = isPreSales
      ? ['Name', 'Journey', 'Type', 'Purchase Value', 'Purchase Date', 'Sales Person']
      : ['Name', 'Journey', 'Type', 'Purchase Value', 'Purchase Date', 'Pre-Sales Person'];

    const csvData = data.map(row => {
      // Handle date conversion properly
      let purchaseDate = '';
      if (row.purchasedate) {
        if (typeof row.purchasedate.toDate === 'function') {
          // It's a Firestore Timestamp
          purchaseDate = this.datePipe.transform(row.purchasedate.toDate(), 'dd-MMM-yyyy') || '';
        } else if (row.purchasedate instanceof Date) {
          // It's already a Date object
          purchaseDate = this.datePipe.transform(row.purchasedate, 'dd-MMM-yyyy') || '';
        } else {
          // Try to convert string to date
          purchaseDate = this.datePipe.transform(new Date(row.purchasedate), 'dd-MMM-yyyy') || '';
        }
      }

      return [
        row.name || '',
        this.mapjourneyname[row.journey] || '',
        row.journeytype || '',
        row.totalpurchasevalue || 0,
        purchaseDate,
        isPreSales ? (row.salespersonname || '') : (row.presalespersonname || '')
      ];
    });

    // Add headers
    csvData.unshift(headers);

    // Convert to CSV string
    const csvContent = csvData.map(row =>
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const fileName = `${personName.replace(/\s+/g, '_')}_Sales_Data_${new Date().toISOString().split('T')[0]}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export table data
  exportTableData() {
    const dataToExport = this.currentTableConfig.data;
    const columns = this.currentTableConfig?.columns || [];
    const headers = columns.map((col: any) => col.header);
    const worksheetData = [headers];
    const salesLeadsMap = this.salesLeadsMap()

    dataToExport.forEach((saleId: any) => {
      const rowData = columns.map((col: any) => {
        const value = this.formatCellValue(salesLeadsMap[saleId], col);
        return value;
      });
      worksheetData.push(rowData);
    });

    // Create workbook and worksheet
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

  // function to check whether it is date or not
  isDate(value: any): boolean {
    return value instanceof Date ||
      (typeof value === 'string' && !isNaN(Date.parse(value)));
  }

  // function to get an cell value
  getCellValue(row: any, key: string): string {
    return row[key] || '-';
  }

  // Sort table by column
  sortTable(columnKey: string) {
    const salesLeadsMap = this.salesLeadsMap()
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
        const valueA: any = this.getCellValue(salesLeadsMap[a], columnKey);
        const valueB: any = this.getCellValue(salesLeadsMap[b], columnKey);

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
    const sales = this.salesLeadsMap()
    return this.currentTableConfig.data.filter((e) => [null, undefined, "", "pending"].includes(sales[e]['status']?.toLowerCase())).length;
  }

  // Function to get count of assured 
  getAssuredCount() {
    const sales = this.salesLeadsMap()
    return this.currentTableConfig.data.filter((e) => ![null, undefined, ""].includes(sales[e]['paymentplan'])).length;
  }

  // Function to get count of not assured 
  getNotAssuredCount() {
    const sales = this.salesLeadsMap()
    return this.currentTableConfig.data.filter((e) => [null, undefined, ""].includes(sales[e]['paymentplan']) && sales[e]['status']?.toLowerCase() == 'approved').length;
  }

  // Function to get count of active participants
  getActiveCount(): number {
    const sales = this.salesLeadsMap()
    if (!this.currentTableConfig?.data) return 0;
    return this.currentTableConfig.data.filter((e) =>
      sales[e]['customerstatus']?.toLowerCase() === 'active'
    ).length;
  }

  // Function to get count of non-active participants
  getNonactiveCount(): number {
    const sales = this.salesLeadsMap()
    if (!this.currentTableConfig?.data) return 0;
    return this.currentTableConfig.data.filter((e) =>
      sales[e]['customerstatus']?.toLowerCase() === 'non active'
    ).length;
  }

  // Function to get count of discontinued participants
  getDiscontinuedCount(): number {
    const sales = this.salesLeadsMap()
    if (!this.currentTableConfig?.data) return 0;
    return this.currentTableConfig.data.filter((e) =>
      ['discontinued', 'banned', 'late'].includes(sales[e]['customerstatus']?.toLowerCase())
    ).length;
  }

  // Check if column should be highlighted
  shouldHighlightCell(columnKey: string): boolean {
    const highlightColumns = ['name', 'contractId', 'category'];
    return highlightColumns.includes(columnKey);
  }

  // function to check whether the column is badge column or not
  isBadgeColumn(columnKey: string): boolean {
    const badgeColumns = ['journey', 'paymentStatus'];
    return badgeColumns.includes(columnKey);
  }

  // function to navigate to use profile
  navigatetoprofile(profileid) {
    if (profileid) {
      const navigationurl = 'userprofile';
      const url = `${navigationurl}/${profileid}`;
      window.open(url, '_blank');
    } else {
      alert('Profile Name Not Available');
    }
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

  // function to add notes
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
          this.guard.openSnackBar("Notes Updated Successfully", "OK");
        }).catch((error) => {
          this.guard.openSnackBar("Oops! Error While Updating Notes", "OK");
          console.error("Oops! Error While Updating Notes");
        });
      }
    })
  }

  // function to show participant menu
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

  // private function to initalize bar chart options
  private initializeBarChartOptions(): void {
    this.barChartOptions = {
      series: [],
      chart: {
        type: "bar",
        height: 420,
        fontFamily: 'Inter, sans-serif',
        toolbar: { show: true },
        animations: {
          enabled: true,
          speed: 1000,
          animateGradually: {
            enabled: true,
            delay: 150
          }
        }
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "70%",
          borderRadius: 1
        }
      },
      dataLabels: {
        enabled: true
      },
      stroke: {
        show: false,
        width: 0,
        colors: ["transparent"]
      },
      xaxis: {
        categories: [],
        labels: {
          rotate: -45,
          rotateAlways: false,
          style: {
            colors: '#1d1d1f',
            fontSize: '11px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600
          }
        }
      },
      yaxis: {
        title: {
          text: "Number of Sales",
          style: {
            color: '#86868b',
            fontSize: '14px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600
          }
        },
        labels: {
          style: {
            colors: '#86868b',
            fontSize: '13px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600
          }
        }
      },
      grid: {
        borderColor: 'rgba(0, 0, 0, 0.04)',
        strokeDashArray: 0,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } }
      },
      colors: ['#2b81deff', '#7c53b6ff'],
      tooltip: { enabled: true },
      legend: { show: true, position: 'top' }
    };
  }

  updateBarChart(): void {
    const dataSource = this.selectedPersonType === 'presales'
      ? this.preSalesDataSource.data
      : this.salesPersonDataSource.data;

    const personNames = dataSource.map(item => item.person);
    const grossCounts = dataSource.map(item => item.grossCount);
    const assuredCounts = dataSource.map(item => item.assuredCount);

    this.barChartOptions = {
      ...this.barChartOptions,
      series: [
        { name: 'Gross Sales', data: grossCounts },
        { name: 'Assured Sales', data: assuredCounts }
      ],
      xaxis: {
        ...this.barChartOptions.xaxis,
        categories: personNames
      }
    };
  }

  // functoin to toggle person type in bar graph
  togglePersonType(type: 'presales' | 'sales'): void {
    this.selectedPersonType = type;
    this.updateBarChart();
  }

  getSale(saleId) {
    return this.salesLeadsMap()[saleId] || {}
  }

  getSalesData(salesIds: any[]) {
    const salesLeadsMap = this.salesLeadsMap();
    return salesIds.map((saleId) => salesLeadsMap[saleId])
  }

  async processSalesLeadsData(salesleads: any[], startdate: Date, enddate: Date): Promise<void> {
    const saleLeadsMap = {};
    const cancelledData = [];
    const downgradeData = [];

    // Process each sale
    for (let i = 0; i < salesleads.length; i++) {
      const salesLeadsData = salesleads[i];

      if (salesLeadsData['journey'] == 'InLXMl7OBAqlDTZcXwK0' || salesLeadsData['status']?.toLowerCase() == 'rejected') {
        continue;
      }

      if ((salesLeadsData['purchasedate']?.toDate() >= startdate && salesLeadsData['purchasedate']?.toDate() <= enddate )
      ) {
        salesLeadsData['type'] = salesLeadsData['journeytype']
        saleLeadsMap[salesLeadsData['docid']] = salesLeadsData
      }

      if (['cancelled', 'downgrade'].includes(salesLeadsData['journeytype']) &&
        salesLeadsData['date']?.toDate() >= startdate &&
        salesLeadsData['date']?.toDate() <= enddate &&
        salesLeadsData['status']?.toLowerCase() === 'approved') {
        if (salesLeadsData['journeytype'] === 'cancelled') {
          cancelledData.push(salesLeadsData);
        } else if (salesLeadsData['journeytype'] === 'downgrade') {
          downgradeData.push(salesLeadsData);
        }
      }

    }
    const cancelledPromises = cancelledData.map(async (sale) => {
      console.log('doc cancanlled : ',sale)
      if (sale['canceldocid']) {
        const cancelRef = doc(this.firestore, 'salesleads', sale['canceldocid']);
        const cancelSnap = await getDoc(cancelRef);

        if (cancelSnap.exists()) {
          const originalSale = cancelSnap.data();
          console.log('cancelled doc original doc : ' , originalSale)
          const balanceAmount = (originalSale['totalpurchasevalue'] ?? 0) - (sale['totalpurchasevalue'] ?? 0);
          const cancelData = { ...originalSale, balanceamount: balanceAmount, type: 'cancelled' };
          saleLeadsMap[cancelData['docid']] = cancelData
        }
      }
    });

    await Promise.all(cancelledPromises);

    const downgradePromises = downgradeData.map(async (sale) => {
      if (sale['downgradefromdocid']) {
        const downgradeRef = doc(this.firestore, 'salesleads', sale['downgradefromdocid']);
        const downgradeSnap = await getDoc(downgradeRef);

        if (downgradeSnap.exists()) {
          const originalSale = downgradeSnap.data();
          const downgradeValue = originalSale['totalpurchasevalue'] || 0;

          if (sale['downgradetonewpurchase']
            && sale['purchasedate']?.toDate() >= startdate
            && sale['purchasedate']?.toDate() <= enddate
          ) {
            originalSale['type'] = 'downgradetonew'
          } else {
            originalSale['type'] = 'downgradetoold'
          }

          saleLeadsMap[originalSale['docid']] = originalSale
        }
      }
    });

    await Promise.all(downgradePromises);

    this.salesLeadsMap.set(saleLeadsMap)

    this.calculateDashboardMetrics()
    this.preSalesPersonList = this.preSalesDataSource.data.map(item => item.person).sort();
    this.salesPersonList = this.salesPersonDataSource.data.map(item => item.person).sort();

    this.cdr.detectChanges();
  }

  // async processSalesLeadsData(salesleads: any[], startdate: Date, enddate: Date): Promise<void> {
  //   console.time('process')
  //   console.timeLog('process', 'start of aggregation')
  //   let saleLeadsMap = this.salesLeadsMap();
  //   const cancelledData = []
  //   const downgradeData = []

  //   const metric = { ...this.metric }

  //   const preSalesMap = new Map<string, GrossSalesData>(this.preSalesDataSource.data.map((p) => [p.person, p]));
  //   const salesPersonMap = new Map<string, GrossSalesData>(this.salesPersonDataSource.data.map((p) => [p.person, p]));

  //   const newPreSalesPerson = new Map<string, Partial<GrossSalesData>>(this.newSalesPreSalesDataSource.data.map((p) => [p.person, p]));
  //   const newSalesPerson = new Map<string, Partial<GrossSalesData>>(this.newSalesSalesPersonDataSource.data.map((p) => [p.person, p]));
  //   const upgradePreSalesPerson = new Map<string, Partial<GrossSalesData>>(this.upgradePreSalesDataSource.data.map((p) => [p.person, p]));
  //   const upgradeSalesPerson = new Map<string, Partial<GrossSalesData>>(this.upgradeSalesPersonDataSource.data.map((p) => [p.person, p]));

  //   // Process each sale
  //   for (let i = 0; i < salesleads.length; i++) {
  //     const sale = salesleads[i]
  //     const salesLeadsData = salesleads[i].doc.data();

  //     if (salesLeadsData['journey'] == 'InLXMl7OBAqlDTZcXwK0' || salesLeadsData['status']?.toLowerCase() == 'rejected') {
  //       continue;
  //     }

  //     if ((salesLeadsData['purchasedate']?.toDate() >= startdate && salesLeadsData['purchasedate']?.toDate() <= enddate)
  //     ) {
  //       salesLeadsData['type'] = salesLeadsData['journeytype']

  //       if (sale?.type === 'added') {
  //         saleLeadsMap[salesLeadsData['docid']] = salesLeadsData
  //         this.calculateDashboardMetricForSale(salesLeadsData, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //       } else if (sale?.type === 'modified') {
  //         this.removeSale(saleLeadsMap[salesLeadsData['docid']], metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //         this.calculateDashboardMetricForSale(salesLeadsData, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //         saleLeadsMap[salesLeadsData['docid']] = salesLeadsData
  //       } else {
  //         this.removeSale(saleLeadsMap[salesLeadsData['docid']], metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //         const docId = salesLeadsData['docid'];
  //         const { [docId]: _, ...sale } = saleLeadsMap
  //         saleLeadsMap = sale
  //       }

  //     }

  //     if (['cancelled', 'downgrade'].includes(salesLeadsData['journeytype']) &&
  //       salesLeadsData['date']?.toDate() >= startdate &&
  //       salesLeadsData['date']?.toDate() <= enddate &&
  //       salesLeadsData['status']?.toLowerCase() === 'approved') {
  //       if (salesLeadsData['journeytype'] === 'cancelled') {
  //         cancelledData.push(sale);
  //       } else if (salesLeadsData['journeytype'] === 'downgrade') {
  //         downgradeData.push(sale);
  //       }
  //     }

  //   }
  //   const cancelledPromises = cancelledData.map(async (sale) => {
  //     const saleLeadsData = sale.doc.data()
  //     if (saleLeadsData['canceldocid']) {
  //       const cancelRef = doc(this.firestore, 'salesleads', saleLeadsData['canceldocid']);
  //       const cancelSnap = await getDoc(cancelRef);

  //       if (cancelSnap.exists()) {
  //         const originalSale = cancelSnap.data();
  //         const balanceAmount = (originalSale['totalpurchasevalue'] ?? 0) - (saleLeadsData['totalpurchasevalue'] ?? 0);
  //         const cancelData = { ...originalSale, balanceamount: balanceAmount, type: 'cancelled' };

  //         if (sale?.type === 'added') {
  //           this.calculateDashboardMetricForSale(cancelData, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //         } else if (sale?.type === 'modified') {
  //           this.removeSale(saleLeadsMap[cancelData['docid']], metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //           this.calculateDashboardMetricForSale(cancelData, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //         }
  //         saleLeadsMap[cancelData['docid']] = cancelData
  //       }
  //     }
  //   });

  //   await Promise.all(cancelledPromises);

  //   const downgradePromises = downgradeData.map(async (sale) => {
  //     const saleLeadsData = sale.doc.data()
  //     if (saleLeadsData['downgradefromdocid']) {
  //       const downgradeRef = doc(this.firestore, 'salesleads', saleLeadsData['downgradefromdocid']);
  //       const downgradeSnap = await getDoc(downgradeRef);

  //       if (downgradeSnap.exists()) {
  //         const originalSale = downgradeSnap.data();
  //         const downgradeValue = originalSale['totalpurchasevalue'] || 0;

  //         if (saleLeadsData['downgradetonewpurchase']
  //           && saleLeadsData['purchasedate']?.toDate() >= startdate
  //           && saleLeadsData['purchasedate']?.toDate() <= enddate
  //         ) {
  //           originalSale['type'] = 'downgradetonew'
  //         } else {
  //           originalSale['type'] = 'downgradetoold'
  //         }

  //         if (sale?.type === 'added') {
  //           saleLeadsMap[originalSale['docid']] = originalSale
  //           this.calculateDashboardMetricForSale(originalSale, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //         } else if (sale?.type === 'modified') {
  //           this.removeSale(saleLeadsMap[originalSale['docid']], metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //           this.calculateDashboardMetricForSale(originalSale, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //           saleLeadsMap[originalSale['docid']] = originalSale
  //         }
  //         // else if (sale?.type === 'removed') {
  //         //   const docId = originalSale['docid'];
  //         //   const { [docId] :_ , ...sale } = saleLeadsMap
  //         //   saleLeadsMap[originalSale['docid']] = originalSale
  //         //   this.removeSale(originalSale, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson)
  //         // }

  //       }
  //     }
  //   });

  //   await Promise.all(downgradePromises);

  //   this.salesLeadsMap.set(saleLeadsMap)
  //   console.timeLog('process', 'end of aggreation')
  //   this.calculateDashboardMetrics()
  //   this.preSalesPersonList = this.preSalesDataSource.data.map(item => item.person).sort();
  //   this.salesPersonList = this.salesPersonDataSource.data.map(item => item.person).sort();
  //   console.timeEnd('process')
  //   this.cdr.detectChanges();
  // }

  calculateDashboardMetrics() {
    const sales = this.salesLeadsMap();
    const metric = {
      gross: {
        data: [],
        totalValue: 0,
        totalEMI: 0,
      },
      assured: {
        data: [],
        totalValue: 0,
        totalEMI: 0,
      },
      grosspending: [],
      grossnew: { data: [], totalValue: 0 },
      grossupgrade: { data: [], totalValue: 0 },
      grossaddons: { data: [], totalValue: 0 },
      grosscancelled: { data: [], totalValue: 0 },
      grossdowngradetoold: { data: [], totalValue: 0 },
      grossdowngradetonew: { data: [], totalValue: 0 },
      assurednew: { data: [], totalValue: 0 },

      assuredupgrade: { data: [], totalValue: 0 },
      assuredaddons: { data: [], totalValue: 0 },
      assuredcancelled: { data: [], totalValue: 0 },
      assureddowngradetoold: { data: [], totalValue: 0 },
      assureddowngradetonew: { data: [], totalValue: 0 },
    }

    const preSalesMap = new Map<string, GrossSalesData>();
    const salesPersonMap = new Map<string, GrossSalesData>();

    const newPreSalesPerson = new Map<string, Partial<GrossSalesData>>();
    const newSalesPerson = new Map<string, Partial<GrossSalesData>>();
    const upgradePreSalesPerson = new Map<string, Partial<GrossSalesData>>();
    const upgradeSalesPerson = new Map<string, Partial<GrossSalesData>>();

    for (let sale of Object.values(sales)) {

      if (!this.matchesFilterCriteria(sale)) {
        continue
      }

      const status = sale['status']?.toLowerCase() || ''
      const docId = sale['docid']
      const valueKey = sale['type'] === 'cancelled' ? 'balanceamount' : 'totalpurchasevalue';
      const isAssured = ![null, undefined, ''].includes(sale['paymentplan'])
      const preSalesPerson = sale['presalespersonname'] || 'Unknown';
      const salesPerson = sale['salespersonname'] || 'Unknown';
      const [start, end] = this.getDateRange
      const isInSelectedRange = start <= sale['purchasedate']?.toDate() && end >= sale['purchasedate']?.toDate()

      if (!['cancelled', 'downgradetoold', 'downgradetonew'].includes(sale['type']) || (isInSelectedRange)) {

        metric.gross.totalValue += sale[valueKey] || 0
        metric.gross.totalEMI += sale['installmentamount'] || 0

        if (status === 'approved') {
          metric.gross.data.push(docId)
          if (!['downgrade', 'cancelled'].includes(sale['journeytype'])) {
            metric[`gross${sale['journeytype']}`]?.data.push(docId)
            metric[`gross${sale['journeytype']}`].totalValue += sale[valueKey] || 0
          }
        } else if ([null, undefined, '', 'pending'].includes(status)) {
          metric.grosspending.push(docId)
        }


        if (isAssured) {
          metric.assured.data.push(docId)
          metric.assured.totalValue += sale[valueKey] || 0
          metric.assured.totalEMI += sale['installmentamount'] || 0

          if (!['downgrade', 'cancelled'].includes(sale['journeytype'])) {
            metric[`assured${sale['journeytype']}`]?.data.push(docId)
            metric[`assured${sale['journeytype']}`].totalValue += sale[valueKey] || 0
          }
        }


      }
      if (['cancelled', 'downgradetoold', 'downgradetonew'].includes(sale['type']) && sale['journeytype'] !== 'cancelled') {
        metric[`gross${sale['type']}`].data.push(docId)
        metric[`gross${sale['type']}`].totalValue += sale[valueKey] || 0

        if (isAssured) {
          metric[`assured${sale['type']}`].data.push(docId)
          metric[`assured${sale['type']}`].totalValue += sale[valueKey] || 0
        }

      }

      if (status === 'approved') {
        if (!preSalesMap.has(preSalesPerson)) {
          preSalesMap.set(preSalesPerson, {
            person: preSalesPerson,
            grossCount: 0,
            assuredCount: 0,
            grossCancelledNumber: 0,
            assuredCancelledNumber: 0,
            grossDowngradeNumber: 0,
            assuredDowngradeNumber: 0,
            actualGrossNumber : 0 , 
            actualAssuredNumber : 0,
          })
        }

        if (!salesPersonMap.has(salesPerson)) {
          salesPersonMap.set(salesPerson, {
            person: salesPerson,
            grossCount: 0,
            assuredCount: 0,
            grossCancelledNumber: 0,
            assuredCancelledNumber: 0,
            grossDowngradeNumber: 0,
            assuredDowngradeNumber: 0,
            actualGrossNumber : 0 , 
            actualAssuredNumber : 0,
          })
        }

        if (!newPreSalesPerson.has(preSalesPerson)) {
          newPreSalesPerson.set(preSalesPerson, {
            person: preSalesPerson, grossCount: 0, assuredCount: 0,
          })
        }

        if (!upgradePreSalesPerson.has(preSalesPerson)) {
          upgradePreSalesPerson.set(preSalesPerson, {
            person: preSalesPerson, grossCount: 0, assuredCount: 0,
          })
        }

        if (!newSalesPerson.has(salesPerson)) {
          newSalesPerson.set(salesPerson, {
            person: salesPerson, grossCount: 0, assuredCount: 0,
          })
        }

        if (!upgradeSalesPerson.has(salesPerson)) {
          upgradeSalesPerson.set(salesPerson, {
            person: salesPerson, grossCount: 0, assuredCount: 0,
          })
        }

        if (['new', 'addons', 'upgrade'].includes(sale['type']) || isInSelectedRange) {
          preSalesMap.get(preSalesPerson).grossCount++
          salesPersonMap.get(salesPerson).grossCount++

          if (sale['type'] === 'new') {
            newPreSalesPerson.get(preSalesPerson).grossCount++
            newSalesPerson.get(salesPerson).grossCount++
          } else if (sale['type'] === 'upgrade') {
            upgradePreSalesPerson.get(preSalesPerson).grossCount++
            upgradeSalesPerson.get(salesPerson).grossCount++
          }

          if (isAssured) {
            preSalesMap.get(preSalesPerson).assuredCount++
            salesPersonMap.get(salesPerson).assuredCount++

            if (sale['type'] === 'new') {
              newPreSalesPerson.get(preSalesPerson).assuredCount++
              newSalesPerson.get(salesPerson).assuredCount++
            } else if (sale['type'] === 'upgrade') {
              upgradePreSalesPerson.get(preSalesPerson).assuredCount++
              upgradeSalesPerson.get(salesPerson).assuredCount++
            }
          }

        }

        if (sale['type'] === 'cancelled') {
          preSalesMap.get(preSalesPerson).grossCancelledNumber++
          salesPersonMap.get(salesPerson).grossCancelledNumber++

          if (isInSelectedRange) {
            preSalesMap.get(preSalesPerson).actualGrossNumber++
            salesPersonMap.get(salesPerson).actualGrossNumber++
          }

          if (isAssured) {
            preSalesMap.get(preSalesPerson).assuredCancelledNumber++
            salesPersonMap.get(salesPerson).assuredCancelledNumber++

          if (isInSelectedRange) {
            preSalesMap.get(preSalesPerson).actualAssuredNumber++
            salesPersonMap.get(salesPerson).actualAssuredNumber++
          }

          }
        }

        if (['downgradetoold', 'downgradetonew'].includes(sale['type'])) {
          preSalesMap.get(preSalesPerson).grossDowngradeNumber++
          salesPersonMap.get(salesPerson).grossDowngradeNumber++
          if (isAssured) {
            preSalesMap.get(preSalesPerson).assuredDowngradeNumber++
            salesPersonMap.get(salesPerson).assuredDowngradeNumber++
          }
        }

      }

    }

    this.metric = metric

    this.preSalesDataSource.data = Array.from(preSalesMap.values()).filter(this.filterPreAndSalesPerson)
    this.salesPersonDataSource.data = Array.from(salesPersonMap.values()).filter(this.filterPreAndSalesPerson)

    this.newSalesPreSalesDataSource.data = Array.from(newPreSalesPerson.values()).filter(this.filterPreAndSalesPerson)
    this.upgradePreSalesDataSource.data = Array.from(upgradePreSalesPerson.values()).filter(this.filterPreAndSalesPerson)
    this.newSalesSalesPersonDataSource.data = Array.from(newSalesPerson.values()).filter(this.filterPreAndSalesPerson)
    this.upgradeSalesPersonDataSource.data = Array.from(upgradeSalesPerson.values()).filter(this.filterPreAndSalesPerson)

    this.updateBarChart()
  }

  calculateDashboardMetricForSale(sale, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson) {
    if (!this.matchesFilterCriteria(sale)) {
      return
    }
    const status = sale['status']?.toLowerCase() || ''
    const docId = sale['docid']
    const valueKey = sale['type'] === 'cancelled' ? 'balanceamount' : 'totalpurchasevalue';
    const isAssured = ![null, undefined, ''].includes(sale['paymentplan'])
    const preSalesPerson = sale['presalespersonname'] || 'Unknown';
    const salesPerson = sale['salespersonname'] || 'Unknown';
    const [start, end] = this.getDateRange
    const isInSelectedRange = start <= sale['purchasedate']?.toDate() && end >= sale['purchasedate']?.toDate()

    if (!['cancelled', 'downgradetoold', 'downgradetonew'].includes(sale['type']) || (isInSelectedRange)) {

      metric.gross.totalValue += sale[valueKey] || 0
      metric.gross.totalEMI += sale['installmentamount'] || 0

      if (status === 'approved') {
        metric.gross.data.push(docId)
        if (sale['journeytype'] !== 'downgrade') {
          metric[`gross${sale['journeytype']}`]?.data.push(docId)
          metric[`gross${sale['journeytype']}`].totalValue += sale[valueKey] || 0
        }
      } else if ([null, undefined, '', 'pending'].includes(status)) {
        metric.grosspending.push(docId)
      }


      if (isAssured) {
        metric.assured.data.push(docId)
        metric.assured.totalValue += sale[valueKey] || 0
        metric.assured.totalEMI += sale['installmentamount'] || 0

        if (sale['journeytype'] !== 'downgrade') {
          metric[`assured${sale['journeytype']}`]?.data.push(docId)
          metric[`assured${sale['journeytype']}`].totalValue += sale[valueKey] || 0
        }
      }


    }
    if (['cancelled', 'downgradetoold', 'downgradetonew'].includes(sale['type']) && sale['journeytype'] !== 'cancelled') {
      metric[`gross${sale['type']}`].data.push(docId)
      metric[`gross${sale['type']}`].totalValue += sale[valueKey] || 0

      if (isAssured) {
        metric[`assured${sale['type']}`].data.push(docId)
        metric[`assured${sale['type']}`].totalValue += sale[valueKey] || 0
      }

    }

    if (status === 'approved') {
      if (!preSalesMap.has(preSalesPerson)) {
        preSalesMap.set(preSalesPerson, {
          person: preSalesPerson,
          grossCount: 0,
          assuredCount: 0,
          grossCancelledNumber: 0,
          assuredCancelledNumber: 0,
          grossDowngradeNumber: 0,
          assuredDowngradeNumber: 0
        })
      }

      if (!salesPersonMap.has(salesPerson)) {
        salesPersonMap.set(salesPerson, {
          person: salesPerson,
          grossCount: 0,
          assuredCount: 0,
          grossCancelledNumber: 0,
          assuredCancelledNumber: 0,
          grossDowngradeNumber: 0,
          assuredDowngradeNumber: 0
        })
      }

      if (!newPreSalesPerson.has(preSalesPerson)) {
        newPreSalesPerson.set(preSalesPerson, {
          person: preSalesPerson, grossCount: 0, assuredCount: 0,
        })
      }

      if (!upgradePreSalesPerson.has(preSalesPerson)) {
        upgradePreSalesPerson.set(preSalesPerson, {
          person: preSalesPerson, grossCount: 0, assuredCount: 0,
        })
      }

      if (!newSalesPerson.has(salesPerson)) {
        newSalesPerson.set(salesPerson, {
          person: salesPerson, grossCount: 0, assuredCount: 0,
        })
      }

      if (!upgradeSalesPerson.has(salesPerson)) {
        upgradeSalesPerson.set(salesPerson, {
          person: salesPerson, grossCount: 0, assuredCount: 0,
        })
      }

      if (['new', 'addons', 'upgrade'].includes(sale['type']) || isInSelectedRange) {
        preSalesMap.get(preSalesPerson).grossCount++
        salesPersonMap.get(salesPerson).grossCount++

        if (sale['type'] === 'new') {
          newPreSalesPerson.get(preSalesPerson).grossCount++
          newSalesPerson.get(salesPerson).grossCount++
        } else if (sale['type'] === 'upgrade') {
          upgradePreSalesPerson.get(preSalesPerson).grossCount++
          upgradeSalesPerson.get(salesPerson).grossCount++
        }

        if (isAssured) {
          preSalesMap.get(preSalesPerson).assuredCount++
          salesPersonMap.get(salesPerson).assuredCount++

          if (sale['type'] === 'new') {
            newPreSalesPerson.get(preSalesPerson).assuredCount++
            newSalesPerson.get(salesPerson).assuredCount++
          } else if (sale['type'] === 'upgrade') {
            upgradePreSalesPerson.get(preSalesPerson).assuredCount++
            upgradeSalesPerson.get(salesPerson).assuredCount++
          }
        }

      }

      if (sale['type'] === 'cancelled') {
        preSalesMap.get(preSalesPerson).grossCancelledNumber++
        salesPersonMap.get(salesPerson).grossCancelledNumber++
        if (isAssured) {
          preSalesMap.get(preSalesPerson).assuredCancelledNumber++
          salesPersonMap.get(salesPerson).assuredCancelledNumber++
        }
      }

      if (['downgradetoold', 'downgradetonew'].includes(sale['type'])) {
        preSalesMap.get(preSalesPerson).grossDowngradeNumber++
        salesPersonMap.get(salesPerson).grossDowngradeNumber++
        if (isAssured) {
          preSalesMap.get(preSalesPerson).assuredDowngradeNumber++
          salesPersonMap.get(salesPerson).assuredDowngradeNumber++
        }
      }

    }

  }

  removeSale(sale, metric, preSalesMap, salesPersonMap, newPreSalesPerson, upgradePreSalesPerson, newSalesPerson, upgradeSalesPerson) {
    if (!this.matchesFilterCriteria(sale)) {
      return
    }

    const status = sale['status']?.toLowerCase() || ''
    const docId = sale['docid']
    const valueKey = sale['type'] === 'cancelled' ? 'balanceamount' : 'totalpurchasevalue';
    const isAssured = ![null, undefined, ''].includes(sale['paymentplan'])
    const preSalesPerson = sale['presalespersonname'] || 'Unknown';
    const salesPerson = sale['salespersonname'] || 'Unknown';
    const [start, end] = this.getDateRange
    const isInSelectedRange = start <= sale['purchasedate']?.toDate() && end >= sale['purchasedate']?.toDate()

    if (!['cancelled', 'downgradetoold', 'downgradetonew'].includes(sale['type']) || (isInSelectedRange)) {

      metric.gross.totalValue -= sale[valueKey] || 0
      metric.gross.totalEMI -= sale['installmentamount'] || 0

      if (status === 'approved') {
        const findId = metric.gross.data.find((id) => docId)
        metric.gross.data.splice(findId, 1);
        if (sale['journeytype'] !== 'downgrade') {
          const findId = metric[`gross${sale['journeytype']}`]?.data.find((id) => docId)
          metric[`gross${sale['journeytype']}`]?.data.splice(findId, 1);
          metric[`gross${sale['journeytype']}`].totalValue -= sale[valueKey] || 0
        }
      } else if ([null, undefined, '', 'pending'].includes(status)) {
        const findId = metric.grosspending.find((id) => docId)
        metric.grosspending.splice(findId, 1);
      }


      if (isAssured) {
        const findId = metric.assured.data.find((id) => docId)
        metric.assured.data.splice(findId, 1);

        metric.assured.totalValue -= sale[valueKey] || 0
        metric.assured.totalEMI -= sale['installmentamount'] || 0

        if (sale['journeytype'] !== 'downgrade') {
          const findId = metric[`assured${sale['journeytype']}`]?.data.find((id) => docId)
          metric[`assured${sale['journeytype']}`]?.data.splice(findId, 1);

          metric[`assured${sale['journeytype']}`].totalValue -= sale[valueKey] || 0
        }
      }


    }
    if (['cancelled', 'downgradetoold', 'downgradetonew'].includes(sale['type'])) {
      const findId = metric[`gross${sale['type']}`].data.find((id) => docId)
      metric[`gross${sale['type']}`].data.splice(findId, 1);

      metric[`gross${sale['type']}`].totalValue -= sale[valueKey] || 0

      if (isAssured) {
        const findId = metric[`assured${sale['type']}`].data.find((id) => docId)
        metric[`assured${sale['type']}`].data.splice(findId, 1);

        metric[`assured${sale['type']}`].totalValue -= sale[valueKey] || 0
      }

    }

    if (status === 'approved') {

      if (['new', 'addons', 'upgrade'].includes(sale['type']) || isInSelectedRange) {

        preSalesMap.get(preSalesPerson).grossCount--
        salesPersonMap.get(salesPerson).grossCount--

        if (sale['type'] === 'new') {
          newPreSalesPerson.get(preSalesPerson).grossCount--
          newSalesPerson.get(salesPerson).grossCount--
        } else if (sale['type'] === 'upgrade') {
          upgradePreSalesPerson.get(preSalesPerson).grossCount--
          upgradeSalesPerson.get(salesPerson).grossCount--
        }

        if (isAssured) {
          preSalesMap.get(preSalesPerson).assuredCount--
          salesPersonMap.get(salesPerson).assuredCount--

          if (sale['type'] === 'new') {
            newPreSalesPerson.get(preSalesPerson).assuredCount--
            newSalesPerson.get(salesPerson).assuredCount--
          } else if (sale['type'] === 'upgrade') {
            upgradePreSalesPerson.get(preSalesPerson).assuredCount--
            upgradeSalesPerson.get(salesPerson).assuredCount--
          }
        }

      }

      if (sale['type'] === 'cancelled') {
        preSalesMap.get(preSalesPerson).grossCancelledNumber--
        salesPersonMap.get(salesPerson).grossCancelledNumber--
        if (isAssured) {
          preSalesMap.get(preSalesPerson).assuredCancelledNumber--
          salesPersonMap.get(salesPerson).assuredCancelledNumber--
        }
      }

      if (['downgradetoold', 'downgradetonew'].includes(sale['type'])) {
        preSalesMap.get(preSalesPerson).grossDowngradeNumber--
        salesPersonMap.get(salesPerson).grossDowngradeNumber--
        if (isAssured) {
          preSalesMap.get(preSalesPerson).assuredDowngradeNumber--
          salesPersonMap.get(salesPerson).assuredDowngradeNumber--
        }
      }

    }

  }


  filterPredicateForSaleType(person, selectedSaleTypeFilter: string) {
    const saleTypes = selectedSaleTypeFilter.split(',')
    if (saleTypes.length > 0) {
      return saleTypes.some((key) => {
        return person[key] > 0
      })
    }
    return true
  }

  filterBySalesType() {
    const filter = this.selectedSaleTypeFilter.join(',')
    this.preSalesDataSource.filter = filter
    this.salesPersonDataSource.filter = filter

    this.newSalesPreSalesDataSource.filter = filter
    this.newSalesSalesPersonDataSource.filter = filter

    this.upgradePreSalesDataSource.filter = filter
    this.upgradeSalesPersonDataSource.filter = filter
  }

  filterPreAndSalesPerson(person): boolean {
    const values: any = Object.values(person);
    if (person?.person !== 'Unknown') {
      for (let i = 1; i < values.length; i++) {
        if (values[i] > 0) {
          return true
        }
      }
    }
    return false
  }

  get getDateRange() {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999)

    return [start, end]

  }

}