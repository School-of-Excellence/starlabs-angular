import { ChangeDetectorRef, Component, ViewChild, TemplateRef } from '@angular/core';
import { and, collection, collectionData, Firestore, or, query, where, orderBy,getDocs, getCountFromServer, doc, updateDoc, setDoc, getDoc } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe, KeyValue } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { takeUntil, Subject, Subscription } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import * as XLSX from 'xlsx';

// Pure business rules for this dashboard. Extracted 2026-09-10; see product-initiation-dashboard.engine.ts
// for what moved and why. The component keeps the Firestore gathering and asks the engine the questions.
import {
  allLoaded,
  isAfterSalesEpoch,
  stepMonthYearKey,
  boundsFromMonthYearKey,
  boxForTabIndex,
  cellValueOrDash,
  clampPage,
  compareCellValues,
  daysAgo,
  financialLabel,
  formatCurrencyCell,
  formatNumberCell,
  formatTextCell,
  hasAnyClearedProduct,
  hasInFlightJourney,
  isAwaitingInitiationCandidate,
  isBadgeColumn,
  isDateLike,
  isDeadJourney,
  isEngagementCleared,
  isEngagementOpportunity,
  isPerformanceMode,
  isReportableJourney,
  isSortable,
  isStatusEmpty,
  isTestParticipantEmail,
  isWithinRange,
  istShiftedWindow,
  lastNoteText,
  loadedCount,
  loadingProgressPct,
  mapCellValue,
  matchesRowFilters,
  monthBounds,
  monthYearKey,
  nextSortState,
  pageNumbers,
  purchaseAgeBucket,
  resolveMinimumPayment,
  salesEpoch,
  shouldHighlightCell,
  sortIcon,
  totalPagesFor,
  waitingDaysSince,
} from './product-initiation-dashboard.engine';

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
  selector: 'app-product-initiation-dashboard',
  imports: [
    ProfilePictureComponent,
    MatDialogModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    MatMenuModule,
  ],
  templateUrl: './product-initiation-dashboard.component.html',
  styleUrl: './product-initiation-dashboard.component.css'
})
export class ProductInitiationDashboardComponent {

  @ViewChild('productDialog') productDialogTemplate!: TemplateRef<any>;
  @ViewChild('tabGroup') tabGroup: any;

  Math = Math;
  awaitingClearedCount: number = 0;
  awaitingPendingCount: number = 0;
  initiatedClearedCount: number = 0;
  initiatedPendingCount: number = 0;
  // Date declarations
  lastMonth: Date;
  currentMonth: Date;
  nextMonth: Date;
  currentDate = new Date();
  startDate;
  endDate;
  monthyear;

  selectedView: string = 'today';
  
  hideTimeout: any;
  popupData: any = null;
  selectedProducts: any[] = [];
  selectedProfileName: string = '';

  priorityMap: { [profileId: string]: boolean } = {};

  //Array declarations
  journeyList = [];
  coachesList = [];
  statusList  = ['Cleared', 'Pending'];

  // Boolean declarations
  isLoading = true;
  subscriptions: any = {};

  // Object declarations 
  mapjourneyname: any = {};
  mapProductName: any = {};
  mapMetaData: any = {};
  modeMap: any = {};
  journeyProductMap: { [profileId: string]: any } = {};


  // Sorting properties
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Pagination properties
  currentPage: number = 1;
  itemsPerPage: number = 10;
  totalPages: number = 1;
  itemsPerPageOptions: number[] = [5, 10, 20, 50, 100];

  productInitiationColumns: any = [];
  onboardedColumns: any = [];
  awaitingInitiationColumns: any = [];
  readyForInitiationColumns: any = [];
  paymentNotClearedColumns: any = [];
  initiatedPendingColumns: any = [];
  engagementOpportunityColumns: any = [];

  mapprofile: any = {};
  mapProduct = {}
  originalData = {

    // Product Initiation
    alljourneynotstarted: { count: 0, data: [] },
    lessthan30daysjourneynotstarted: { count: 0, data: [] },
    morethan30daysjourneynotstarted: { count: 0, data: [] },
    currentjourneyinitiated: { count: 0, data: [] },

    onboarded: { count: 0, data: [] },

    awaitingInitiation: { count: 0, data: [] },
    readyForInitiation: {count: 0, data: []},
    paymentNotCleared: {count:0, data: []},
    initiatedPending: { count: 0, data: [] },
    engagementOpportunity: { count: 0, data: [] },
  }

  tableConfigs: { [key: string]: TableConfig } = {};
  currentTableConfig: TableConfig | null = null;
  showTable = false;
  tableType: string = null;
  tableSearchText: string = '';
  filteredTableData: any[] = [];

  filterForm: FormGroup;
  private subscriptionHandle = new Subject<void>();

  private loadingStates = {
    journeyData: false,
    metadata: false,
    journeyProduct: false,
    modes: false
  };

  constructor(
    public firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private guard: AuthguardService,
    private fb: FormBuilder,
    private datePipe: DatePipe,
    private dialog: MatDialog,
    private router: Router
  ) {
    this.filterForm = this.fb.group({
      search: ['',],
      purchaseStart: ['',],
      purchaseEnd: ['',],
      journey: ['',],
      status: ['',],
      journeycoach: ['',]
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

      await getDocs(collection(this.firestore, 'journey')).then(snap => {
        for (let i = 0; i < snap.docs.length; i++) {
          const element = snap.docs[i].data();
          this.mapjourneyname[element['id']] = element['journey'];
        }
        this.loadingStates.journeyData = true;
        this.checkAllDataLoaded();
      });
       await getDocs(collection(this.firestore, 'products')).then(snap => {
        for (let i = 0; i < snap.docs.length; i++) {
          const doc = snap.docs[i];
          const element = doc.data();
          this.mapProductName[doc.id] = element['product'] || 'Unknown Product';
        }
      });
      this.fetchData();
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
    const bounds = monthBounds(now);
    this.startDate = bounds.start;
    this.endDate = bounds.end;
    this.monthyear = monthYearKey(now);
  }

  // Update date based on month selection 
  updateDate() {
    const bounds = boundsFromMonthYearKey(this.monthyear);
    this.startDate = bounds.start;
    this.endDate = bounds.end;

    this.fetchData();
  }

  // move to next month 
  forwardMonth() {
    const next = stepMonthYearKey(this.monthyear, 1);
    this.startDate = next.start;
    this.endDate = next.end;
    this.monthyear = next.monthyear;

    this.fetchData();
  }

  // move to previous month 
  backwardMonth() {
    const prev = stepMonthYearKey(this.monthyear, -1);
    this.startDate = prev.start;
    this.endDate = prev.end;
    this.monthyear = prev.monthyear;

    this.fetchData();
  }

  onTabChange(event: any) {
    console.log('Tab changed to index:', event.index);
    const box = boxForTabIndex(event.index);
    if (box) {
      this.onBoxClick(box);
    }
  }

  // Calculate total pages
  calculatePagination() {
    this.totalPages = totalPagesFor(this.currentTableConfig.data.length, this.itemsPerPage);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = clampPage(this.currentPage, this.totalPages);
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

  // Function to filter table 
  filterTableData(value) {
    if (!this.currentTableConfig || !this.filteredTableData) {
      return;
    }

    const searchTerm = value.search || '';
    const selectedJourney = value.journey || [];
    const selectedStatus = value.status || [];

    const columnFor = (header: string) => this.currentTableConfig.columns.find(col =>
      col.header.toLowerCase() === header) || null;
    const nameColumn = columnFor('name');
    const mobileColumn = columnFor('mobile');
    const emailColumn = columnFor('email');
    const journeyColumn = columnFor('journey');

    this.currentTableConfig.data = this.filteredTableData.filter(row => matchesRowFilters({
      name: nameColumn ? this.formatCellValue(row, nameColumn) : null,
      mobile: mobileColumn ? this.formatCellValue(row, mobileColumn) : null,
      email: emailColumn ? this.formatCellValue(row, emailColumn) : null,
      journey: journeyColumn ? this.formatCellValue(row, journeyColumn) : null,
      financialdata: row['financialdata'],
    }, { search: searchTerm, selectedJourney, selectedStatus }));

    this.currentPage = 1;
    this.calculatePagination();
  }

  // Function to refresh filter 
  refreshFilter() {
    this.filterForm.controls['search'].setValue('');
    this.filterForm.controls['journey'].setValue('');
    this.filterForm.controls['status'].setValue('');
    this.filterTableData(this.filterForm.value);
  }

  // Function to check if all data is loaded 
  private checkAllDataLoaded(): void {
    if (allLoaded(this.loadingStates)) {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  fetchData() {
    this.ngOnDestroy();
    this.isLoading = true
    this.loadingStates = {
      journeyData: true,
      metadata: false,
      journeyProduct: false,
      modes: false
    }
    this.loadParticipantMetadata();
    this.loadModes();
    this.initializeColumns();
  }

  initializeColumns() {
    this.productInitiationColumns = [
      { key: 'profileid', header: 'Name', width: '12%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '12%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'journeyref', header: 'Journey', width: '12%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'purchasedate', header: 'Purchase Date', width: '12%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'profileid', header: 'Finance', width: '12%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'financialstatus' },
      { key: 'onboardedtime', header: 'Onboarded Date', width: '12%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'salenotes', header: 'Sale Notes', width: '28%', type: 'text', substringStart: 0, substringEnd: 20 },
    ]

    this.onboardedColumns = [
      { key: 'profileid', header: 'Name', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '5%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'profileid', header: 'EMail', width: '5%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'email' },
      { key: 'journeyref', header: 'Journey', width: '8%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'purchasedate', header: 'Purchase Date', width: '8%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'onboardedtime', header: 'Onboarded Date', width: '6%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'onboardedby', header: 'Onboarded By', width: '8%', type: 'mapped', mapData: this.mapMetaData, mapKey: '[0].id', mapValue: 'name' },
      { key: 'salesperson', header: 'Sales Person', width: '8%', type: 'text' },
      { key: 'paymentplan', header: 'Journey Plan', width: '8%', type: 'text' },
      { key: 'salenotes', header: 'Sale Notes', width: '26%', type: 'text', substringStart: 0, substringEnd: 20 },
      { key: 'generalnotes', header: 'Notes', width: '10%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '2%', type: 'text', substringStart: 0, substringEnd: 50 }
    ]

    this.awaitingInitiationColumns = [
      { key: 'prioritystatus', header: 'Priority', width: '4%', type: 'number' },
      { key: 'profileid', header: 'Name', width: '12%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '8%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'journeyref', header: 'Journey', width: '8%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'products', header: 'Product', width: '12%', type: 'action', actionLabel: 'View Products', action: (row) => this.loadProductsForMenu(row.profileid) },
      { key: 'onboardedtime', header: 'Onboarded Date', width: '8%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'waitingperiod', header: 'Days Waiting', width: '8%', type: 'number' },
      { key: 'financialdata', header: 'Finance Status', width: '8%', type: 'text' },
      // { key: 'minimumamount', header: 'minimum payment', width: '15%', type: 'number' },
      // { key: 'totalpaid', header: 'paid amount', width: '15%', type: 'number' },
      { key: 'salenotes', header: 'Sale Notes', width: '14%', type: 'text', substringStart: 0, substringEnd: 20 },
      { key: 'action', header: 'Action', width: '8%', type: 'text' },
      { key: 'generalnotes', header: 'Notes', width: '8%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '2%', type: 'text', substringStart: 0, substringEnd: 50 },
    ]

    this.readyForInitiationColumns = [
      { key: 'prioritystatus', header: 'Priority', width: '5%', type: 'number' },
      { key: 'profileid', header: 'Name', width: '15%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'journeyref', header: 'Journey', width: '10%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'products', header: 'Product', width: '10%', type: 'action', actionLabel: 'View Products', action: (row) => this.loadProductsForMenu(row.profileid) },
      { key: 'onboardedtime', header: 'Onboarded Date', width: '8%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'waitingperiod', header: 'Days Waiting', width: '7%', type: 'number' },
      { key: 'financialdata', header: 'Finance Status', width: '10%', type: 'text' },
      // { key: 'minimumamount', header: 'minimum payment', width: '15%', type: 'number' },
      // { key: 'totalpaid', header: 'paid amount', width: '15%', type: 'number' },
      { key: 'salenotes', header: 'Sale Notes', width: '15%', type: 'text', substringStart: 0, substringEnd: 20 },
      { key: 'action', header: 'Action', width: '10%', type: 'text' },
    ]

    this.paymentNotClearedColumns = [
      { key: 'prioritystatus', header: 'Priority', width: '5%', type: 'number' },
      { key: 'profileid', header: 'Name', width: '15%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '10%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'journeyref', header: 'Journey', width: '10', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'products', header: 'Product', width: '10%', type: 'action', actionLabel: 'View Products', action: (row) => this.loadProductsForMenu(row.profileid) },
      { key: 'onboardedtime', header: 'Onboarded Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'waitingperiod', header: 'Days Waiting', width: '5%', type: 'number' },
      { key: 'financialdata', header: 'Finance Status', width: '10%', type: 'text' },
      // { key: 'minimumamount', header: 'minimum payment', width: '15%', type: 'number' },
      // { key: 'totalpaid', header: 'paid amount', width: '15%', type: 'number' },
      { key: 'salenotes', header: 'Sale Notes', width: '15%', type: 'text', substringStart: 0, substringEnd: 20 },
      { key: 'action', header: 'Action', width: '10%', type: 'text' },
    ]

    this.initiatedPendingColumns = [
      { key: 'prioritystatus', header: 'Priority', width: '4%', type: 'number' },
      { key: 'profileid', header: 'Name', width: '14%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '6%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'journeyref', header: 'Journey', width: '6%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'products', header: 'Product', width: '10%', type: 'action', actionLabel: 'View Products', action: (row) => this.loadProductsForMenu(row.profileid) },
      { key: 'initiatedtime', header: 'Initiated Date', width: '10%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'waitingperiod', header: 'Days Waiting', width: '6%', type: 'number' },
      { key: 'financialdata', header: 'Finance Status', width: '6%', type: 'text' },
      // { key: 'minimumamount', header: 'minimum payment', width: '15%', type: 'number' },
      // { key: 'totalpaid', header: 'paid amount', width: '15%', type: 'number' },
      // { key: 'salenotes', header: 'Sale Notes', width: '18%', type: 'text', substringStart: 0, substringEnd: 20 },
      { key: 'generalnotes', header: 'Notes', width: '14%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '2%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'action', header: 'Action', width: '4%', type: 'text' },
    ]

    this.engagementOpportunityColumns = [
      { key: 'prioritystatus', header: 'Priority', width: '4%', type: 'number' },
      { key: 'profileid', header: 'Name', width: '8%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'name' },
      { key: 'profileid', header: 'Mobile', width: '8%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'phonenumber' },
      { key: 'journeyref', header: 'Journey', width: '8%', type: 'mapped', mapData: this.mapjourneyname, mapKey: 'id' },
      { key: 'productref', header: 'Product', width: '12%', type: 'mapped', mapData: this.mapProductName, mapKey: 'id' },
      { key: 'lastConsumedDate', header: 'Last Consumed Date', width: '8%', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'waitingperiod', header: 'Days idle', width: '8%', type: 'number' },
      { key: 'profileid', header: 'Finance Status', width: '8%', type: 'mapped', mapData: this.mapMetaData, mapValue: 'financialstatus' },
      { key: 'financialdata', header: 'Finance Status', width: '8%', type: 'text' },
      // { key: 'minimumamount', header: 'minimum payment', width: '15%', type: 'number' },
      { key: 'totalpaid', header: 'paid amount', width: '8%', type: 'number' },
      { key: 'salenotes', header: 'Sale Notes', width: '10%', type: 'text', substringStart: 0, substringEnd: 20 },
      // { key: 'action', header: 'Action', width: '10%', type: 'text' },
      { key: 'generalnotes', header: 'Notes', width: '8%', type: 'text', substringStart: 0, substringEnd: 50 },
      { key: 'addnotes', header: '+', width: '2%', type: 'text', substringStart: 0, substringEnd: 50 },
    ]

    this.loadTableConfig();
  }

  // Function to load table config 
  loadTableConfig() {
    this.tableConfigs = {
      allProduct: {
        title: 'Product Not Started',
        columns: this.productInitiationColumns,
        data: [],
        dataKey: 'alljourneynotstarted',
        filters: ['search','journey']
      },
      less30Product: {
        title: 'Product Not Started - 30 Days',
        columns: this.productInitiationColumns,
        data: [],
        dataKey: 'lessthan30daysjourneynotstarted',
        filters: ['search','journey']
      },
      more30Product: {
        title: 'Product Not Started - 30+ Days',
        columns: this.productInitiationColumns,
        data: [],
        dataKey: 'morethan30daysjourneynotstarted',
        filters: ['search','journey']
      },
      productInitiated: {
        title: 'Product Initiated',
        columns: this.productInitiationColumns,
        data: [],
        dataKey: 'currentjourneyinitiated',
        filters: ['search','journey']
      },
      onboarded: {
        title: 'Onboarded',
        columns: this.onboardedColumns,
        data: [],
        dataKey: 'onboarded',
        filters: ['search', 'purchasedate', 'journey', 'journeycoach']
      },

      engagementOpportunity: {
        title: 'Engagement Opportunity',
        columns: this.engagementOpportunityColumns,
        data: [],
        dataKey: 'engagementOpportunity',
        filters: ['search','journey']
      },
      awaitingInitiation: {
        title: 'Awaiting Initiation',
        columns: this.awaitingInitiationColumns,
        data: [],
        dataKey: 'awaitingInitiation',
        filters: ['search','journey']
      },
      readyForInitiation:{
        title: 'Ready For Initiation',
        columns: this.readyForInitiationColumns,
        data: [],
        dataKey: 'readyForInitiation',
        filters: ['search','journey']
      },
      paymentNotCleared:{
        title: 'Minimum Payment Not Cleared',
        columns: this.paymentNotClearedColumns,
        data: [],
        dataKey: 'paymentNotCleared',
        filters: ['search','journey']
      },
      initiatedPending: {
        title: 'Initiated -Pending Consumption',
        columns: this.initiatedPendingColumns,
        data: [],
        dataKey: 'initiatedPending',
        filters: ['search','journey']
      }

    }
  }

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
      }
    }
  }


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

  // Pagination controls
  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    // this.updatePaginatedData();
  }

  // Next page
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      // this.updatePaginatedData();
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
    return pageNumbers(this.currentPage, this.totalPages);
  }

  // Check if column is sortable
  isSortable(column: any): boolean {
    return isSortable(column);
  }

  // Get sort icon for column
  getSortIcon(columnKey: string): string {
    return sortIcon({ sortColumn: this.sortColumn, sortDirection: this.sortDirection }, columnKey);
  }

  // Check if column should be highlighted
  shouldHighlightCell(columnKey: string): boolean {
    return shouldHighlightCell(columnKey);
  }

  // Check if column should show as badge
  isBadgeColumn(columnKey: string): boolean {
    return isBadgeColumn(columnKey);
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
          this.guard.openSnackBar("Notes Updated Successfully", "OK",600);
        }).catch((error) => {
          this.guard.openSnackBar("Oops! Error While Updating Notes", "OK",600);
        });
      }
    })
  }

  // Function to view notes 
  viewNotes(element,key) {
    element['viewnotes'] = true;
    element['mapProfile'] = this.mapprofile;
    element['allnotes'] = [];
    if(element[key]) {
      if (typeof element[key] === 'string') {
        element['allnotes'].push({
          note: element[key],
          updatedby: element['profileid'],
          updated: element['updated'] || null
        })
      } else if(Array.isArray(element[key])) {
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

  togglePriority(row: any, event: Event) {
    event.stopPropagation(); 
    const profileId = row['profileid'];

    // Toggle the priority status
    this.priorityMap[profileId] = !this.priorityMap[profileId];

    // Update the row data
    row['prioritystatus'] = this.priorityMap[profileId];
  }

  isPriority(row: any): boolean {
    return this.priorityMap[row['profileid']] || row['prioritystatus'] || false;
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

  // calculateWaitingPeriod() moved to the engine as waitingDaysSince(); call sites use it directly.

  loadProductsForMenu(profileId: string) {
    const participantMetadata = this.mapMetaData[profileId];
    this.selectedProfileName = participantMetadata?.['name'] || 'Unknown';
    getDocs(
      query(
        collection(this.firestore, "participantsproduct"),
        where("profileid", "==", profileId)
      )
    ).then((snapshot) => {
      const products = snapshot.docs.map(doc => doc.data());
      this.selectedProducts = products.map(product => {
        const productName = product['productref']?.id 
          ? this.mapProductName[product['productref'].id] 
          : 'N/A';
      
        let startDate = 'Not Started';
        if (product['statusdate']?.['initiated']) {
          startDate = this.datePipe.transform(
            product['statusdate']['initiated'].toDate(),
            'dd-MMM-yyyy'
          ) || 'Not Started';
        }
        return {
          productName: productName,
          minimumPayment: product['minimumpayment'] || 0,
          startDate: startDate,
          status: product['status'] || 'N/A',
          profileId: profileId
        };
      });
    }).catch(error => {
      console.error('Error loading products:', error);
      this.selectedProducts = [];
    });
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
    const wasCycledOff = this.sortColumn === columnKey && this.sortDirection === 'desc';
    const next = nextSortState({ sortColumn: this.sortColumn, sortDirection: this.sortDirection }, columnKey);
    this.sortColumn = next.sortColumn;
    this.sortDirection = next.sortDirection;

    if (wasCycledOff) {
      this.currentTableConfig.data = [...this.filteredTableData];
      this.calculatePagination();
      return;
    }

    if (this.sortDirection) {
      this.currentTableConfig.data.sort((a, b) => compareCellValues(
        this.getCellValue(a, columnKey),
        this.getCellValue(b, columnKey),
        this.sortDirection,
      ));
    }
  }

  // Get value for a specific cell
  getCellValue(row: any, key: string): string {
    return cellValueOrDash(row, key);
  }

  // Helper function to check if value is a date
  isDate(value: any): boolean {
    return isDateLike(value);
  }

  closeTable() {
    this.showTable = false;
    this.currentTableConfig = null;
    this.tableSearchText = '';
    this.filteredTableData = [];
    this.currentPage = 1;
  }

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

    try {
      const journeyProductSnapshot = await getDocs(collection(this.firestore, "participantjourneyproduct"));
      this.journeyProductMap = {};

      journeyProductSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data['profileid']) {
          this.journeyProductMap[data['profileid']] = data;
        }
      });

      const productsSnapshot = await getDocs(
        query(
          collection(this.firestore, "participantsproduct"),
          where("statusdate.initiated", ">=", startdate),
          where("statusdate.initiated", "<=", enddate)
        )
      );
      let tempArray = [];
      if (productsSnapshot.docs.length != 0) {
        for (let index = 0; index < productsSnapshot.docs.length; index++) {
          const productdata = productsSnapshot.docs[index].data();

          const profileId = productdata['profileid'];
          if (profileId && this.journeyProductMap[profileId]) {
            const journeyData = this.journeyProductMap[profileId];
            productdata['journeyref'] = journeyData['journeyref'] || null;
            productdata['purchasedate'] = journeyData['purchasedate'] || null;
            productdata['salenotes'] = journeyData['salenotes'] || '';
            productdata['onboardedtime'] = journeyData['onboardedtime'] || null;
          }

          tempArray.push(productdata);

          if (index + 1 == productsSnapshot.docs.length) {
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
    } catch (error) {
      console.error('Error in loadModes:', error);
      this.loadingStates.modes = true;
      this.checkAllDataLoaded();
    }
  }

  // Function to fetch data from participant metadata 
  loadParticipantMetadata() {
    this.subscriptions['metadata'] = collectionData(collection(this.firestore, "participant metadata")).pipe(takeUntil(this.subscriptionHandle)).subscribe((metadata) => {
      // Subscription declarations 
      let currentMonthEnd = [];
      let lastMonthEnd = [];
      let nextMonthEnd = [];
      let totalMonthEnd = [];

      //Mode map declarations
      let tempModeMap = {};
      let allParticipantsList = [];

      // Journey Engagement declarations 
      let journeyMap = {
        1: [],
        2: [],
        3: [],
        4: []
      }

      if (metadata.length != 0) {
        try {
          for (let i = 0; i < metadata.length; i++) {
            const metaData = metadata[i];
            if (!metaData['name'] || !metaData['profileid']) {
              continue;
            }
        
            const purchaseValue = metaData['pp_totalpurchasevalue'] || 0;
            const amountPaid = metaData['pp_totalpaid'] || 0;
            metaData['balance'] = purchaseValue - amountPaid;
            allParticipantsList.push(metaData);
            if (![null, undefined].includes(metaData['participantmode'])) {
              if ([null, undefined].includes(tempModeMap[metaData['participantmode']])) {
                tempModeMap[metaData['participantmode']] = 1;
              } else {
                tempModeMap[metaData['participantmode']]++;
              }
            }

            this.mapprofile[metaData['profileid']] = metaData['name']
            this.mapMetaData[metaData['profileid']] = metaData;
          
            if (i + 1 == metadata.length) {
              this.loadParticipantJourneyProduct();
              this.modeMap = tempModeMap;
              this.loadingStates.metadata = true;
              this.checkAllDataLoaded();
            }
          }
        } catch (error) {
          this.loadingStates.metadata = true;
          this.checkAllDataLoaded();
        }
      } else {
        this.loadingStates.metadata = true;
        this.checkAllDataLoaded();
      }
    })
  }

  // Function to fetch data from Participant Journey Product 
  loadParticipantJourneyProduct() {
    const now = new Date();
    // The IST shift is a known defect, pinned in the engine - see istShiftedWindow().
    const monthWindow = istShiftedWindow(this.startDate, this.endDate);
    let startdate = Timestamp.fromDate(monthWindow.start).toDate();
    let enddate = Timestamp.fromDate(monthWindow.end).toDate();

    const currentDate = new Date();
    // last 7 days
    let last7days = daysAgo(7, currentDate);

    try {
      this.subscriptions['journeyproduct1'] = collectionData(query(collection(this.firestore, "participantjourneyproduct"), where("paymentplan", "==", null))).subscribe((notassured) => {
        if (notassured.length != 0) {
          let tempArray1 = [];
          for (let i = 0; i < notassured.length; i++) {
            const notAssuredData = notassured[i];
            // notAssuredData['generalnotes'] = [null, undefined, ''].includes(this.mapMetaData[notAssuredData['profileid']]) ? [] : (this.mapMetaData[notAssuredData['profileid']]['generalnotes'] ?? [])
            if (isAfterSalesEpoch(notAssuredData['purchasedate']?.toDate()) && ![null, undefined, ""].includes(notAssuredData['profileid'])) {
              if (!isDeadJourney(notAssuredData['journeystatus'])) {
                // NOTE: the '.email' deref below is deliberately left unguarded — see the engine's
                // isTestParticipantEmail() header for why this throws on a record with no email.
                if (!isTestParticipantEmail(this.mapMetaData[notAssuredData['profileid']]?.['email'])) {
                  tempArray1.push(notAssuredData);
                }
              }
            }
          }
        }
      })
      this.subscriptions['journeyproduct2'] = collectionData(query(collection(this.firestore, "participantjourneyproduct"), where("paymentplan", "!=", null))).subscribe((onboarded) => {
        if (onboarded.length != 0) {
          // last 30days 
          let last30days = daysAgo(30, currentDate);

          let tempArray2 = [];
          let tempArray3 = [];
          let tempArray4 = [];
          let tempArray5 = [];
          let tempArray6 = [];

          for (let i = 0; i < onboarded.length; i++) {
            const onboardedData = onboarded[i];
            onboardedData['generalnotes'] = [null, undefined, ''].includes(this.mapMetaData[onboardedData['profileid']]) ? [] : (this.mapMetaData[onboardedData['profileid']]['generalnotes'] ?? [])

            if (isAfterSalesEpoch(onboardedData['purchasedate']?.toDate())
              && isReportableJourney(
                [null, undefined, ""].includes(onboardedData['journeyref']) ? null : onboardedData['journeyref'].id,
                onboardedData['journeystatus'])) {
              if ([null, undefined, "", false].includes(onboardedData['onboarded'])) {
                if (purchaseAgeBucket(onboardedData['purchasedate']?.toDate(), last7days) === 'recent') {
                  tempArray2.push(onboardedData);
                } else if (onboardedData['purchasedate']?.toDate() < last7days) {
                  tempArray3.push(onboardedData)
                }
              } else if (onboardedData['onboarded'] == true) {
                if (isWithinRange(onboardedData['onboardedtime']?.toDate(), startdate, enddate)) {
                  tempArray4.push(onboardedData);
                }

                if (this.mapMetaData[onboardedData['profileid']]?.['activeproduct']?.length == 0) {
                  if (purchaseAgeBucket(onboardedData['purchasedate']?.toDate(), last30days) === 'recent') {
                    tempArray5.push(onboardedData);
                  } else {
                    tempArray6.push(onboardedData);
                  }
                }
              }
            }

            if (i + 1 == onboarded.length) {
              this.originalData['onboarded'].data = tempArray4;
              this.originalData['onboarded'].count = tempArray4.length;

              this.originalData['lessthan30daysjourneynotstarted'].data = tempArray5;
              this.originalData['lessthan30daysjourneynotstarted'].count = tempArray5.length;

              this.originalData['morethan30daysjourneynotstarted'].data = tempArray6;
              this.originalData['morethan30daysjourneynotstarted'].count = tempArray6.length;

              this.originalData['alljourneynotstarted'].data = [...tempArray5, ...tempArray6];
              this.originalData['alljourneynotstarted'].count = [...tempArray5, ...tempArray6].length;
            }
          }
        }
      })

      this.subscriptions['journeyproductActiveCheck'] = collectionData(query(collection(this.firestore, "participantjourneyproduct"), where("onboarded", "==", true))).subscribe(async (onboardedParticipants) => {
        if (onboardedParticipants.length != 0) {
          let tempArray7 = [];
          let tempArray8 = [];
          let readyForInitiationArray = [];
          let paymentNotClearedArray = [];
          let awaitingClearedCount = 0;
          let awaitingPendingCount = 0;
          let initiatedClearedCount = 0;
          let initiatedPendingCount = 0;
          var productList = []

          for (let i = 0; i < onboardedParticipants.length; i++) {
            const participant = onboardedParticipants[i];
            const profileId = participant['profileid'];
            const activeProduct = this.mapMetaData[profileId]?.['activeproduct'];
            const consumedProduct = this.mapMetaData[profileId]?.['consumedproducts'];
            const journeyStatus = participant['journeystatus'];

            if (isAwaitingInitiationCandidate(journeyStatus, activeProduct, consumedProduct)) {
              const productQuery = await getDocs(
                query(collection(this.firestore, "participantsproduct"),
                  where("profileid", "==", profileId))
              );
              const onboardedDate = participant['onboardedtime']?.toDate();
              participant['waitingperiod'] = waitingDaysSince(onboardedDate);

              const totalpaid = this.mapMetaData[profileId]?.['pp_totalpaid'] || 0;
              const hasAtLeastOneCleared = hasAnyClearedProduct(
                productQuery.docs.map(d => resolveMinimumPayment(
                  d.data()['minimumpayment'],
                  this.mapProduct[d.data()['productref']?.id]?.minimumrequiredamount,
                )),
                totalpaid,
              );

              participant['financialdata'] = financialLabel(hasAtLeastOneCleared);
              if (participant['financialdata'] === 'Cleared') {
                awaitingClearedCount++;
                readyForInitiationArray.push(participant);
              } else {
                awaitingPendingCount++;
                paymentNotClearedArray.push(participant);
              }
              tempArray7.push(participant);
            }
            if (i + 1 == onboardedParticipants.length) {
              this.originalData['awaitingInitiation'].data = tempArray7;
              this.originalData['awaitingInitiation'].count = tempArray7.length;
              this.originalData['readyForInitiation'].data = readyForInitiationArray;
              this.originalData['readyForInitiation'].count = readyForInitiationArray.length;
              this.originalData['paymentNotCleared'].data = paymentNotClearedArray;
              this.originalData['paymentNotCleared'].count = paymentNotClearedArray.length;
              this.awaitingClearedCount = awaitingClearedCount;
              this.awaitingPendingCount = awaitingPendingCount;
            }
          }
        }
      });
      this.subscriptions['priorityModeProductsCombined'] = collectionData(query(collection(this.firestore, "participantsproduct"), where("deliverymode", "==", "Priority Mode")), { idField: "docid" }
      ).subscribe(async (priorityModeParticipants) => {
        let tempArray8: any[] = [];
        let tempArray9: any[] = [];
        let initiatedClearedCount = 0;
        let initiatedPendingCount = 0;
        var productList = []
        var cumulativeMinimumPayment = 0;
        for (const participant of priorityModeParticipants) {
          const modeStatus = participant['status'];
          const profileId = participant['profileid'];
          const statusDateInitiated = participant['statusdate']?.['initiated'];
          const statusDateCompleted = participant['statusdate']?.['completed'];

          if (modeStatus === 'initiated') {
            const journeyQuery = await getDocs(
              query(collection(this.firestore, "participantjourneyproduct"),
                where("profileid", "==", profileId))
            );

            const hasInitiatedOrOngoingJourney = hasInFlightJourney(
              journeyQuery.docs.map(d => d.data()['journeystatus']));
            if (hasInitiatedOrOngoingJourney) {
              const participantObj: any = {
                profileid: profileId,
                initiatedtime: statusDateInitiated,
                waitingperiod: statusDateInitiated ? waitingDaysSince(statusDateInitiated.toDate()) : 0
              };
              const journeyData = this.journeyProductMap[profileId];
              participantObj['journeyref'] = journeyData ? journeyData['journeyref'] || null : null;
              participantObj['salenotes'] = journeyData ? journeyData['salenotes'] || '' : '';

              const totalpaid = this.mapMetaData[profileId]?.['pp_totalpaid'] || '0';
              const minimumpayment = participant['minimumpayment'] || 'NA';

              const allProductsQuery = await getDocs(
                query(collection(this.firestore, "participantsproduct"),
                  where("profileid", "==", profileId))
              );

              // NOTE: totalpaid defaults to the STRING '0' here, so this comparison can be
              // lexicographic — pinned as a defect in the engine's hasAnyClearedProduct().
              const hasAtLeastOneCleared = hasAnyClearedProduct(
                allProductsQuery.docs.map(d => resolveMinimumPayment(
                  d.data()['minimumpayment'],
                  this.mapProduct[d.data()['productref']?.id]?.minimumrequiredamount,
                )),
                totalpaid,
              );

              participantObj['totalpaid'] = totalpaid;
              participantObj['minimumamount'] = minimumpayment;
              participantObj['financialdata'] = financialLabel(hasAtLeastOneCleared);
              if (participantObj['financialdata'] === 'Cleared') {
                initiatedClearedCount++;
              } else {
                initiatedPendingCount++;
              }
              tempArray8.push(participantObj);
            }
          }

          const statusEmpty = isStatusEmpty(modeStatus);
          const participantMode = participant['mode'];
          // NOTE: isValidMode is computed and never read — pinned as a defect in the engine
          // (see PERFORMANCE_MODES). Left in place so behaviour is unchanged.
          const isValidMode = isPerformanceMode(participantMode);

          let completedDate: Date | null = null;
          if (statusDateCompleted && typeof statusDateCompleted.toDate === 'function') {
            completedDate = statusDateCompleted.toDate();
          }

          if (statusEmpty) {
            const journeyQuery = await getDocs(
              query(collection(this.firestore, "participantjourneyproduct"),
                where("profileid", "==", profileId))
            );

            const hasInitiatedOrOngoingJourney = hasInFlightJourney(
              journeyQuery.docs.map(d => d.data()['journeystatus']));
            const consumedProduct = this.mapMetaData[profileId]?.['consumedproducts'];
            const activeProduct = this.mapMetaData[profileId]?.['activeproduct'];

            if (isEngagementOpportunity(hasInitiatedOrOngoingJourney, consumedProduct, activeProduct)) {
              const journeyData = this.journeyProductMap[profileId];
              participant['journeyref'] = journeyData ? journeyData['journeyref'] || null : null;
              participant['lastConsumedDate'] = statusDateCompleted;
              participant['waitingperiod'] = completedDate ? waitingDaysSince(completedDate) : 0;

              const totalpaid = this.mapMetaData[profileId]?.['pp_totalpaid'] || 'NA';
              const minimumpayment = participant['minimumpayment'] || 'NA';

              participant['totalpaid'] = totalpaid;
              participant['minimumamount'] = minimumpayment;
              // 'NA' - 'NA' is NaN and NaN <= 0 is false — pinned in the engine as isEngagementCleared().
              participant['financialdata'] = financialLabel(isEngagementCleared(minimumpayment, totalpaid));
              tempArray9.push(participant);
            }
          }
        }
        this.originalData['initiatedPending'].data = tempArray8;
        this.originalData['initiatedPending'].count = tempArray8.length;
        this.initiatedClearedCount = initiatedClearedCount;
        this.initiatedPendingCount = initiatedPendingCount;

        this.originalData['engagementOpportunity'].data = tempArray9;
        this.originalData['engagementOpportunity'].count = tempArray9.length;
      });

      this.loadingStates.journeyProduct = true;
      this.checkAllDataLoaded();

// this.subscriptions['priorityModeProductsCombined'] = collectionData(
//   query(collection(this.firestore, "participantsproduct"), where("deliverymode", "==", "Priority Mode")), 
//   { idField: "docid" }
// ).subscribe(async (priorityModeParticipants) => {
//   let tempArray8: any[] = [];
//   let tempArray9: any[] = [];
//   let initiatedClearedCount = 0;
//   let initiatedPendingCount = 0;

//   // Extract all unique profile IDs upfront
//   const profileIds = [...new Set(priorityModeParticipants.map(p => p['profileid']))];

//   // Batch fetch all journey data for all participants at once
//   const allJourneyDocs = await getDocs(
//     query(collection(this.firestore, "participantjourneyproduct"),
//       where("profileid", "in", profileIds.slice(0, 30))) // Firestore 'in' limit is 30
//   );

//   // Create a map of profileId -> journey data for O(1) lookups
//   const journeyMap = new Map();
//   allJourneyDocs.docs.forEach(doc => {
//     const data = doc.data();
//     const profileId = data['profileid'];
//     if (!journeyMap.has(profileId)) {
//       journeyMap.set(profileId, []);
//     }
//     journeyMap.get(profileId).push(data);
//   });

//   // If more than 30 profiles, fetch remaining in batches
//   if (profileIds.length > 30) {
//     const remainingBatches = [];
//     for (let i = 30; i < profileIds.length; i += 30) {
//       const batch = profileIds.slice(i, i + 30);
//       remainingBatches.push(
//         getDocs(query(collection(this.firestore, "participantjourneyproduct"),
//           where("profileid", "in", batch)))
//       );
//     }
    
//     const batchResults = await Promise.all(remainingBatches);
//     batchResults.forEach(snapshot => {
//       snapshot.docs.forEach(doc => {
//         const data = doc.data();
//         const profileId = data['profileid'];
//         if (!journeyMap.has(profileId)) {
//           journeyMap.set(profileId, []);
//         }
//         journeyMap.get(profileId).push(data);
//       });
//     });
//   }

//   // Batch fetch all products data
//   const allProductsDocs = await getDocs(
//     query(collection(this.firestore, "participantsproduct"),
//       where("profileid", "in", profileIds.slice(0, 30)))
//   );

//   // Create a map of profileId -> products for O(1) lookups
//   const productsMap = new Map();
//   allProductsDocs.docs.forEach(doc => {
//     const data = doc.data();
//     const profileId = data['profileid'];
//     if (!productsMap.has(profileId)) {
//       productsMap.set(profileId, []);
//     }
//     productsMap.get(profileId).push(data);
//   });

//   // Fetch remaining product batches if needed
//   if (profileIds.length > 30) {
//     const remainingProductBatches = [];
//     for (let i = 30; i < profileIds.length; i += 30) {
//       const batch = profileIds.slice(i, i + 30);
//       remainingProductBatches.push(
//         getDocs(query(collection(this.firestore, "participantsproduct"),
//           where("profileid", "in", batch)))
//       );
//     }
    
//     const productBatchResults = await Promise.all(remainingProductBatches);
//     productBatchResults.forEach(snapshot => {
//       snapshot.docs.forEach(doc => {
//         const data = doc.data();
//         const profileId = data['profileid'];
//         if (!productsMap.has(profileId)) {
//           productsMap.set(profileId, []);
//         }
//         productsMap.get(profileId).push(data);
//       });
//     });
//   }

//   // Now process all participants without any await calls in the loop
//   for (const participant of priorityModeParticipants) {
//     const modeStatus = participant['status'];
//     const profileId = participant['profileid'];
//     const statusDateInitiated = participant['statusdate']?.['initiated'];
//     const statusDateCompleted = participant['statusdate']?.['completed'];

//     if (modeStatus === 'initiated') {
//       // Use pre-fetched journey data from map
//       const journeyDocs = journeyMap.get(profileId) || [];
      
//       let hasInitiatedOrOngoingJourney = false;
//       for (const journeyData of journeyDocs) {
//         const journeyStatus = journeyData['journeystatus'];
//         if (journeyStatus === 'initiated' || journeyStatus === 'ongoing') {
//           hasInitiatedOrOngoingJourney = true;
//           break;
//         }
//       }

//       if (hasInitiatedOrOngoingJourney) {
//         const participantObj: any = {
//           profileid: profileId,
//           initiatedtime: statusDateInitiated,
//           waitingperiod: statusDateInitiated ? waitingDaysSince(statusDateInitiated.toDate()) : 0
//         };
        
//         const journeyData = this.journeyProductMap[profileId];
//         participantObj['journeyref'] = journeyData ? journeyData['journeyref'] || null : null;
//         participantObj['salenotes'] = journeyData ? journeyData['salenotes'] || '' : '';

//         const totalpaid = this.mapMetaData[profileId]?.['pp_totalpaid'] || '0';
//         const minimumpayment = participant['minimumpayment'] || 'NA';
//         let hasAtLeastOneCleared = false;

//         // Use pre-fetched products data from map
//         const allProducts = productsMap.get(profileId) || [];
        
//         for (const productData of allProducts) {
//           let productMinimumPayment = productData['minimumpayment'];

//           if ([null, undefined].includes(productMinimumPayment)) {
//             productMinimumPayment = this.mapProduct[productData['productref']?.id]?.minimumrequiredamount || 0;
//           }

//           if (productMinimumPayment <= totalpaid) {
//             hasAtLeastOneCleared = true;
//             break;
//           }
//         }

//         participantObj['totalpaid'] = totalpaid;
//         participantObj['minimumamount'] = minimumpayment;
//         participantObj['financialdata'] = hasAtLeastOneCleared ? 'Cleared' : 'Pending';
        
//         if (participantObj['financialdata'] === 'Cleared') {
//           initiatedClearedCount++;
//         } else {
//           initiatedPendingCount++;
//         }
//         tempArray8.push(participantObj);
//       }
//     }

//     const isStatusEmpty = [null, undefined, ''].includes(modeStatus);
//     const participantMode = participant['mode'];
//     const isValidMode = ['Performance Mode', 'Extended Performance Mode', 'After Extended Performance Mode'].includes(participantMode);

//     let completedDate: Date | null = null;
//     if (statusDateCompleted && typeof statusDateCompleted.toDate === 'function') {
//       completedDate = statusDateCompleted.toDate();
//     }

//     if (isStatusEmpty) {
//       // Use pre-fetched journey data from map
//       const journeyDocs = journeyMap.get(profileId) || [];
      
//       let hasInitiatedOrOngoingJourney = false;
//       for (const journeyData of journeyDocs) {
//         const journeyStatus = journeyData['journeystatus'];
//         if (journeyStatus === 'initiated' || journeyStatus === 'ongoing') {
//           hasInitiatedOrOngoingJourney = true;
//           break;
//         }
//       }

//       const consumedProduct = this.mapMetaData[profileId]?.['consumedproducts'];
//       const hasConsumedProducts = consumedProduct && consumedProduct.length > 0;
//       const activeProduct = this.mapMetaData[profileId]?.['activeproduct'];

//       if (hasInitiatedOrOngoingJourney && hasConsumedProducts && (!activeProduct || activeProduct.length === 0)) {
//         const journeyData = this.journeyProductMap[profileId];
//         participant['journeyref'] = journeyData ? journeyData['journeyref'] || null : null;
//         participant['lastConsumedDate'] = statusDateCompleted;
//         participant['waitingperiod'] = completedDate ? waitingDaysSince(completedDate) : 0;

//         const totalpaid = this.mapMetaData[profileId]?.['pp_totalpaid'] || 'NA';
//         const minimumpayment = participant['minimumpayment'] || 'NA';
//         const remainingamount = minimumpayment - totalpaid;

//         participant['totalpaid'] = totalpaid;
//         participant['minimumamount'] = minimumpayment;
//         participant['financialdata'] = remainingamount <= 0 ? 'Cleared' : 'Pending';
//         tempArray9.push(participant);
//       }
//     }
//   }

//   this.originalData['initiatedPending'].data = tempArray8;
//   this.originalData['initiatedPending'].count = tempArray8.length;
//   this.initiatedClearedCount = initiatedClearedCount;
//   this.initiatedPendingCount = initiatedPendingCount;

//   this.originalData['engagementOpportunity'].data = tempArray9;
//   this.originalData['engagementOpportunity'].count = tempArray9.length;
// });

      // this.loadingStates.journeyProduct = true;
      // this.checkAllDataLoaded();

    } catch (error) {
      this.loadingStates.journeyProduct = true;
      this.checkAllDataLoaded();
    }
  }

  // Function to view loading progress of the screen 
  getLoadingProgress(): number {
    return loadingProgressPct(this.loadingStates);
  }

  // Function to get total loaded count 
  getLoadedCount(): number {
    return loadedCount(this.loadingStates);
  }

  // Function to format each cell value in table 
  formatCellValue(row: any, column: ColumnConfig): string {
    const value = row[column.key];
    if (value === null || value === undefined) {
      return '-';
    }

    if (column.key === 'generalnotes') {
      return lastNoteText(value);
    }

    if (column.type === 'text') {
      return formatTextCell(value, column.substringStart, column.substringEnd);
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
    return formatCurrencyCell(value, prefix, mapValue);
  }

  // Number formatting
  private formatNumber(value: number, prefix?: string, suffix?: string): string {
    return formatNumberCell(value, prefix, suffix);
  }

  // Map value using dictionary
  private mapValue(value: any, mapData?: { [key: string]: any }, mapKey?: string, mapValue?: string): string {
    return mapCellValue(value, mapData, mapKey, mapValue);
  }

}
