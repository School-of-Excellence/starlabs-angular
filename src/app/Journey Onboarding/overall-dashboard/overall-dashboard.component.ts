import { Component, OnInit, OnDestroy, ChangeDetectorRef, TemplateRef, ViewChild } from '@angular/core';
import { Firestore, collection, query, where, getDocs, collectionData } from '@angular/fire/firestore';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthguardService } from '../../authguard.service';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { limit, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ColumnConfig {
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

export interface TableConfig {
  title?: string;
  columns: ColumnConfig[];
  data: any[];
  dataKey: string,
  dateFormat?: string;
  currencySymbol?: string;
  filters?: any[];
  sort?: 'asc' | 'desc' | null;
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
  table: TableConfig
}

@Component({
  selector: 'app-overall-dashboard',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MatButtonModule,
    MatDialogModule
  ],
  templateUrl: './overall-dashboard.component.html',
  styleUrl: './overall-dashboard.component.css'
})
export class OverallDashboardComponent implements OnInit, OnDestroy {

  @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;

  // Active Participants counts
  bigCount = 0;
  upCount = 0;
  lylCount = 0;
  cpmCount = 0;
  totalActiveCount: number = 0;
  totalEngagedCount = 0;
  totalEngagedProfiles = [];

  // Last 30 Days counts
  newSalesSum = 0;
  upgradesSum = 0;
  dfuSalesCount = 0;
  dfuSalesSum = 0;
  timeFrameFilter = 'last7days';
  allSalesData: any[] = []; // Store all sales data
  currentFilter: 'all' | 'last30days' | 'last7days' | 'custom' = 'last7days';
  salesStartDate: string = '';
  salesEndDate: string = '';
  newSalesCount = 0;
  upgradesCount = 0;
  adsSpent = 0;
  adsCampaigns = 0;
  lastUpdatedAdsDate = ''

  // Engagement Last 6 Months counts
  journeyCoachingCount = 0;
  dfuCount = 0;
  appCount = 0;
  activeParticipantsCount = 0;
  nonActiveParticipantsCount = 0;
  workshopCount = 0;

  // This Month Finance
  thisMonthReceived = 0;
  thisMonthYetToReceive = 0;
  thisMonthDue = 0;
  nextMonthDue = 0;

  assuredRevenue = 0;
  grossRevenue = 0;
  assuredCount = 0;
  grossCount = 0;

  mapProfile = {};

  incentiveCount = 0;
  incentiveSum = 0;

  isLoading = true;
  mapJourneyName: any = {};
  private participantMetadataCache: any[] = [];

  assuredRevenueList = [];
  newSales = [];
  upgradeSales = [];
  dfuSales = [];
  activityOverview = {
    big: [],
    up: [],
    lyl: [],
    cpm: []
  }

  engagement = {
    journeycoaching: [],
    email: [],
    app: [],
    workshop: [],
    dfu: [],
    a_h: []
  }

  activeParticipantsList = [];
  nonactiveParticipantsList = [];

  private loadingStates = {
    journeyMap: false,
    newAndUpgradeSales: false,
    adsSpent: false,
    currentMonthExpenditure: false,
    nextMonthExpenditure: false,
    lastUpdatedAds: false,
    appointments: false,
    appUser: false,
    products: false,
    workshop: false,
    watson: false,
    salescrm: false
  };

  subscriptions = {}

  dailySalesData: Array<{
    date: Date;
    newSales: number;
    upgrades: number;
    total: number;
    newPercent: number;
    upgradePercent: number;
  }> = [];

  expenditure = {
    planned: 0,
    paid: 0,
  }

  nextMonthExpenditurePlanned = 0;
  currentDate = new Date();
  currentMonth = this.currentDate.getMonth() + 1;
  currentYear = this.currentDate.getFullYear();
  nextMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);

  thisMonthEMIPaid = 0;
  thisMonthAdditional = 0;
  thisMonthNewPayment = 0;
  thisMonthRevived = 0;
  thisMonthUnschedule = 0;

  allEngProfileIds = {
    journeyCoaching: [],
    appUser: [],
    dfuProduct: [],
    workshop: []
  }

  journeyTypeMap: any = {};

  dialogConfig: Dialog

  dialogConfigs: { [key: string]: Dialog }

  constructor(private firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private guard: AuthguardService,
    private http: HttpClient,
    private dialog: MatDialog,
    private datePipe: DatePipe
  ) {
    this.guard.getJourneyMap().then((map) => {
      this.mapJourneyName = map;
      this.initilizeDialogConfigs();
    });
  }

  async ngOnInit() {
    this.fetchData();
    let watsonurl = '';
    let salescrmurl = '';
    if (environment.firebase.projectId === "starlabs-test") {
      watsonurl = "https://us-central1-watson-test-19.cloudfunctions.net/sendGrowthDataToBusinessDashboard";
      salescrmurl = 'https://us-central1-salescrm-test-19.cloudfunctions.net/sendIncentiveDataToBusinessDashboard';
    } else if (environment.firebase.projectId === "fir-sample-aae4a") {
      watsonurl = "https://us-central1-watsonproduction-becde.cloudfunctions.net/sendGrowthDataToBusinessDashboard";
      salescrmurl = 'https://us-central1-salesleadcrm.cloudfunctions.net/sendIncentiveDataToBusinessDashboard';
    }

    if (watsonurl && salescrmurl) {
      const watsonresult: any = await firstValueFrom(this.http.get(watsonurl));
      const salescrmresult: any = await firstValueFrom(this.http.get(salescrmurl));

      if (watsonresult) {
        this.thisMonthDue = watsonresult.value[`${this.currentMonth}-${this.currentYear}`] || 0;
        this.nextMonthDue = watsonresult.value[`${this.nextMonth.getMonth() + 1}-${this.nextMonth.getFullYear()}`] || 0;
      }

      if (salescrmresult) {
        let salescrmdata = salescrmresult.data || {};
        this.incentiveCount = Object.keys(salescrmdata).length;
        this.incentiveSum = Object.keys(salescrmdata).reduce((sum, key) => sum + salescrmdata[key], 0);
      }

      this.loadingStates.watson = true
      this.loadingStates.salescrm = true
      this.checkAllDataLoaded()
    }

    this.fetchJourney()
  }

  ngOnDestroy() {
    Object.values(this.subscriptions).forEach((sub: any) => {
      sub.unsubscribe()
    })
  }

  initilizeDialogConfigs() {
    const totalRevenueColumn: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'pp_totalpurchasevalue', header: 'Purchase Value', type: 'currency', prefix: '₹' },
      { key: 'pp_totalpaid', header: 'Total Paid', type: 'currency', prefix: '₹' },
      { key: 'balance', header: 'Balance', type: 'currency', prefix: '₹' },
    ];

    const activeOverview: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'journey', header: 'Journey', type: 'mapped', mapData: this.mapJourneyName },
      { key: 'totalpurchasevalue', header: 'Purchase Value', type: 'currency', prefix: '₹' },
      { key: 'purchasedate', header: 'Purchase Date', type: 'date', format: 'dd-MMM-yyyy' },
      { key: 'paymentplanassureddate', header: 'Assured Date', type: 'date', format: 'dd-MMM-yyyy' },
    ];

    const activeParticipantColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
    ];

    const engagementColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text', mapper: (id) => this.mapProfile[id]?.name ? this.mapProfile[id]['name'] : '-' },
    ]

    const ActiveParticipantsColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'isActive', header: 'Active Last 6 Months', type: 'custom', mapper: (value) => value ? 'Yes' : 'No' }
    ]

    const NonActiveParticipantColumns: ColumnConfig[] = [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'isNonActive', header: 'Non Active Last 6 Months', type: 'custom', mapper: (value) => value ? 'Yes' : 'No' }
    ]

    this.dialogConfigs = {
      totalRevenue: {
        title: 'Total Revenue',
        dialog: {
          width: '70%'
        },
        table: {
          data: [],
          dataKey: 'totalrevenue',
          columns: totalRevenueColumn
        }
      },
      newSales: {
        title: 'Activity Overview ( New Sales )',
        dialog: {
          width: '70%'
        },
        table: {
          data: [],
          dataKey: 'newsales',
          columns: activeOverview
        }
      },
      upgradeSales: {
        title: 'Activity Overview ( Upgrade Sales )',
        dialog: {
          width: '70%'
        },
        table: {
          data: [],
          dataKey: 'upgradesales',
          columns: activeOverview
        }
      },
      dfuSales: {
        title: 'Activity Overview ( DFU Sales )',
        dialog: {
          width: '70%'
        },
        table: {
          data: [],
          dataKey: 'dfusales',
          columns: activeOverview
        }
      },
      big: {
        title: 'Active Participants ( BIG )',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'big',
          columns: activeParticipantColumns
        }
      },
      lyl: {
        title: 'Active Participants ( LYL )',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'lyl',
          columns: activeParticipantColumns
        }
      },
      up: {
        title: 'Active Participants ( UP )',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'up',
          columns: activeParticipantColumns
        }
      },
      cpm: {
        title: 'Active Participants ( CPM )',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'cpm',
          columns: activeParticipantColumns
        }
      },
      journeyCoaching: {
        title: 'Engagement (Last 6 Months) Journey Coaching',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'journeyCoaching',
          columns: engagementColumns
        }
      },
      email: {
        title: 'Engagement (Last 6 Months) Email',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'email',
          columns: engagementColumns
        }
      },
      app: {
        title: 'Engagement (Last 6 Months) App',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'appUser',
          columns: engagementColumns
        }
      },
      dfu: {
        title: 'Engagement (Last 6 Months) DFU',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'dfuProduct',
          columns: engagementColumns
        }
      },
      workshop: {
        title: 'Engagement (Last 6 Months) Workshop',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'workshop',
          columns: engagementColumns
        }
      },
      activeParticipant: {
        title: 'Active Participants',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'activeparticipant',
          columns: ActiveParticipantsColumns,
          sort: null
        }
      },
      nonActiveParticipant: {
        title: 'Non Active Participants',
        dialog: {
          width: '50%'
        },
        table: {
          data: [],
          dataKey: 'nonactiveparticipant',
          columns: NonActiveParticipantColumns,
          sort: null
        }
      },
    }
  }

  // function to load all data
  async fetchData() {
    this.isLoading = true;
    this.loadEngagementLast6Months()
    this.selectTimeFrame('last7days')
    this.loadActiveParticipants()
    this.fetchLastUpdatedAds()
    this.fetchExpenditure()
  }

  // Function to check if all data is loaded 
  private checkAllDataLoaded(): void {
    const allLoaded = Object.values(this.loadingStates).every(state => state === true);
    if (allLoaded) {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // function to load active participants data
  async loadActiveParticipants() {

    this.subscriptions['participant metadata'] = collectionData(collection(this.firestore, 'participant metadata'), { idField: 'id' }).pipe(catchError((error) => {
      console.log('Error in fetching participant metadata : ', error)
      return of([])
    })).subscribe((metadata) => {
      let assuredRevenue = 0;
      let tempBigCount = 0;
      let tempUpCount = 0;
      let tempLylCount = 0;
      let tempCpmCount = 0;
      let activeParticipantsCount = 0;
      let nonActiveParticipantsCount = 0;
      let receivedAmount = 0;
      let yetToReceiveAmount = 0;
      let tempEMIPaid = 0;
      let tempNewPayment = 0;
      let tempAdditional = 0;
      let tempRevived = 0;
      let tempUnschedule = 0;

      let assuredRevenueList = [];
      let activityOverview = {
        big: [],
        up: [],
        lyl: [],
        cpm: []
      }
      let activeParticipantsList = [];
      let nonactiveParticipantsList = [];

      if (metadata.length !== 0) {
        for (let i = 0; i < metadata.length; i++) {
          const docref = metadata[i]
          const participantMetadata = metadata[i];
          this.mapProfile[docref['id']] = participantMetadata;
          const activeJourney = participantMetadata['activejourney'];
          const activeCustomerStatus = participantMetadata['customerstatus'];
          const purchase = participantMetadata['pp_totalpurchasevalue'] || 0;
          const paid = participantMetadata['pp_totalpaid'] || 0;
          const financeData = participantMetadata['financedata'];
          if (financeData && typeof financeData === 'object' && financeData['date'] && this.isCurrentMonth(financeData['date'])) {
            const financeDate = financeData['date']?.toDate();
            const customerStatus = financeData['customerstatus'];
            const status = financeData['status'];
            const paymentStatus = financeData['paymentstatus'];
            const receipt = financeData['receipt'] || 0;
            receivedAmount += receipt;
            //filter schedule and new payment amount
            if (["newpayment"].includes(financeData['status'])) {
              tempNewPayment = tempNewPayment + financeData['newpaymentamount'];
              if (![null, undefined, 0].includes(financeData['scheduleamount'])) {
                if ([null, undefined, 0].includes(financeData['revivedreceipts'])) {
                  if (['regular', 'defaulted'].includes(customerStatus) && ![null, undefined, 0].includes(financeData['scheduleamount'])) {

                    tempEMIPaid = tempEMIPaid + financeData['scheduleamount'];
                    if (financeData['paymentstatus'] == 'extrapaid') {
                      tempAdditional = tempAdditional + (financeData['receipt'] - ([null, undefined, ""].includes(financeData['computedamount']) ? 0 : financeData['computedamount']));
                    }
                  }
                }
              }
            }
            // get unschedule amount
            if ([null, undefined, "", "emipause"].includes(financeData['status']) && financeData['receipt'] > 0) {
              tempUnschedule = tempUnschedule + financeData['scheduleamount'];
            }
            // get revived data
            if (financeData['revivedreceipts'] > 0) {
              tempRevived = tempRevived + financeData['revivedreceipts'];
            }
            // filter expected revenue
            if (['regular', 'defaulted'].includes(customerStatus) && ['schedule', 'schedule-extended'].includes(financeData['status'])) {
              if ([null, undefined, 0].includes(financeData['revivedreceipts'])) {
                if (['regular', 'defaulted'].includes(customerStatus) && ![null, undefined, 0].includes(financeData['scheduleamount'])) {
                  tempEMIPaid = tempEMIPaid + (financeData['scheduleamount'] > financeData['computedamount'] ? financeData['computedamount'] : financeData['scheduleamount']);
                }
              }
              // filter additional emi
              if (financeData['paymentstatus'] == 'extrapaid' && [null, undefined, 0].includes(financeData['revivedreceipts'])) {
                tempAdditional = tempAdditional + (financeData['receipt'] - ([null, undefined, ""].includes(financeData['computedamount']) ? 0 : financeData['computedamount']));
              }
            }
            if (['regular', 'defaulted'].includes(customerStatus) && financeData['computedamount'] != 0) {
              if (['schedule', 'schedule-extended'].includes(status) && paymentStatus === 'due') {
                const amount = financeData['computedamount'] || 0;
                yetToReceiveAmount += amount;
              }
            }
          }
          if (activeCustomerStatus == 'non active') {
            nonActiveParticipantsCount++;
            nonactiveParticipantsList.push(participantMetadata)
          }
          if (activeCustomerStatus === 'active') {
            activeParticipantsCount++;
            activeParticipantsList.push(participantMetadata)
            if (activeJourney) {
              let balance = purchase - paid;
              if (balance < 0) balance = 0;
              assuredRevenue += balance;
              assuredRevenueList.push({ ...participantMetadata, balance: balance })
              const journeyName = this.mapJourneyName[activeJourney]?.toLowerCase();
              if (journeyName) {
                if (journeyName.includes('big')) {
                  tempBigCount++;
                  activityOverview.big.push(participantMetadata)
                } else if (journeyName.includes('up!')) {
                  tempUpCount++;
                  activityOverview.up.push(participantMetadata)
                } else if (journeyName.includes('ftm')) {
                  tempLylCount++;
                  activityOverview.lyl.push(participantMetadata)
                } else if (journeyName.includes('cpm')) {
                  tempCpmCount++;
                  activityOverview.cpm.push(participantMetadata)
                }
              }
            }
          }
        }

        this.assuredRevenue = assuredRevenue;
        this.bigCount = tempBigCount;
        this.upCount = tempUpCount;
        this.lylCount = tempLylCount;
        this.cpmCount = tempCpmCount;
        this.thisMonthReceived = receivedAmount;
        this.thisMonthYetToReceive = yetToReceiveAmount;
        this.nonActiveParticipantsCount = nonActiveParticipantsCount
        this.activeParticipantsCount = activeParticipantsCount;
        this.thisMonthEMIPaid = tempEMIPaid;
        this.thisMonthAdditional = tempAdditional;
        this.thisMonthNewPayment = tempNewPayment;
        this.thisMonthRevived = tempRevived;
        this.thisMonthUnschedule = tempUnschedule;

        this.assuredRevenueList = assuredRevenueList;
        this.activityOverview = activityOverview;

        this.activeParticipantsList = activeParticipantsList;
        this.nonactiveParticipantsList = nonactiveParticipantsList;
      }
      if (!this.loadingStates.journeyMap) {
        this.loadingStates.journeyMap = true;
        this.checkAllDataLoaded();
      }
    });
  }

  // Function to check the finance date is in current month  
  isCurrentMonth(date) {
    if (!date) {
      return false;
    }

    const financeDate = date?.toDate();
    const financeMonth = financeDate.getMonth() + 1;
    const financeYear = financeDate.getFullYear();

    return financeMonth == this.currentMonth && financeYear == this.currentYear;
  }

  // function to handle data range change
  async onDateRangeChange() {
    if (this.salesStartDate && this.salesEndDate) {
      this.isLoading = true;
      this.loadingStates.adsSpent = false;
      this.loadingStates.newAndUpgradeSales = false
      this.timeFrameFilter = '';
      try {
        const startDate = new Date(this.salesStartDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(this.salesEndDate);
        endDate.setHours(23, 59, 59, 999);
        this.loadNewAndUpgradeSalesWithCustomDates(startDate, endDate)
        this.loadAdsSpentWithCustomDates(startDate, endDate)
      } catch (error) {
        console.error('Error loading custom date range:', error);
      }
    }
  }

  // functoin to load data ethier last30days or last7days
  async selectTimeFrame(timeFrame: 'last30days' | 'last7days') {
    this.isLoading = true;
    this.loadingStates.adsSpent = false;
    this.loadingStates.newAndUpgradeSales = false
    this.timeFrameFilter = timeFrame;
    this.salesStartDate = '';
    this.salesEndDate = '';

    try {
      const daysAgo = this.timeFrameFilter === 'last30days' ? 30 : 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      startDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(23, 59, 59, 999);


      this.loadNewAndUpgradeSalesWithCustomDates(startDate, today)
      this.loadAdsSpentWithCustomDates(startDate, today)

    } catch (error) {
      console.error('Error loading time frame data:', error);
    }
  }

  // Helper methods for footer totals
  getTotalNewSales(): number {
    return this.dailySalesData.reduce((sum, day) => sum + day.newSales, 0);
  }

  // function to get total upgrades
  getTotalUpgrades(): number {
    return this.dailySalesData.reduce((sum, day) => sum + day.upgrades, 0);
  }

  // function to get total sales
  getTotalSales(): number {
    return this.dailySalesData.reduce((sum, day) => sum + day.total, 0);
  }

  // get active participants count from total engaged particpants 
  getActiveParticipants() {
    const totalEngagedProfiles = this.getTotalEngagedProfiles
    return totalEngagedProfiles.filter((e) => this.mapProfile[e]?.['customerstatus']?.toLowerCase() == 'active').length;
  }

  // get non active participants count from total engaged particpants 
  getNonActiveParticipants() {
    const totalEngagedProfiles = this.getTotalEngagedProfiles
    return totalEngagedProfiles.filter((e) => this.mapProfile[e]?.['customerstatus']?.toLowerCase() == 'non active').length;
  }

  // function to get new and upgrades sales
  async loadNewAndUpgradeSalesWithCustomDates(startDate: Date, endDate: Date) {
    if (this.subscriptions['salesleads']) {
      this.subscriptions['salesleads'].unsubscribe()
    }

    const q = query(
      collection(this.firestore, 'salesleads'),
      where('paymentplanassureddate', '>=', startDate),
      where('paymentplanassureddate', '<=', endDate)
    );

    this.subscriptions['salesleads'] = collectionData(q).pipe(catchError((error) => {
      console.log('Error in fetching salesleads : ', error)
      return of([])
    })).subscribe((snapshot) => {
      let newSalesSum = 0;
      let upgradesSum = 0;
      let newSalesCount = 0;
      let upgradesCount = 0;
      let dfuSalesSum = 0;
      let dfuSalesCount = 0;

      let newSales = [];
      let upgradeSales = [];
      let dfuSales = [];

      const dailyMap = new Map<string, { newSales: number; upgrades: number }>();
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dailyMap.set(currentDate.toDateString(), { newSales: 0, upgrades: 0 });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      snapshot.forEach(doc => {
        const data = doc;
        const journeyType = data['journeytype']?.toLowerCase();
        const paymentPlan = data['paymentplan'];
        const totalPurchaseValue = data['totalpurchasevalue'] || 0;
        const purchaseDate = data['purchasedate']?.toDate();
        const assuredDate = data['paymentplanassureddate']?.toDate();
        const journeyId = data['journey'];
        const isDFU = this.journeyTypeMap[journeyId] === 'DFU';
        const dateKey = assuredDate.toDateString();
        const dayData = dailyMap.get(dateKey);

        if (journeyType === 'new') {
          dayData.newSales++;
          newSalesSum += totalPurchaseValue;
          newSalesCount++;
          newSales.push(data)
        } else if (journeyType === 'upgrade') {
          dayData.upgrades++;
          upgradesSum += totalPurchaseValue;
          upgradesCount++;
          upgradeSales.push(data)
        }

        // Count DFU sales separately
        if (isDFU && (journeyType === 'new' || journeyType === 'upgrade')) {
          dfuSalesSum += totalPurchaseValue;
          dfuSalesCount++;
          dfuSales.push(data)
        }
      });

      this.dailySalesData = Array.from(dailyMap.entries())
        .map(([dateStr, counts]) => {
          const date = new Date(dateStr);
          const total = counts.newSales + counts.upgrades;
          return {
            date,
            dateStr,
            newSales: counts.newSales,
            upgrades: counts.upgrades,
            total,
            newPercent: total > 0 ? Math.round((counts.newSales / total) * 100) : 0,
            upgradePercent: total > 0 ? Math.round((counts.upgrades / total) * 100) : 0
          };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      this.newSalesSum = newSalesSum;
      this.upgradesSum = upgradesSum;
      this.newSalesCount = newSalesCount;
      this.upgradesCount = upgradesCount;
      this.dfuSalesSum = dfuSalesSum;
      this.dfuSalesCount = dfuSalesCount;

      this.newSales = newSales;
      this.upgradeSales = upgradeSales;
      this.dfuSales = dfuSales;

      if (!this.loadingStates.newAndUpgradeSales) {
        this.loadingStates.newAndUpgradeSales = true;
        this.checkAllDataLoaded();
      }
    })
  }

  // function to load ads spent
  async loadAdsSpentWithCustomDates(startDate: Date, endDate: Date) {
    if (this.subscriptions['adsinvestment']) {
      this.subscriptions['adsinvestment'].unsubscribe()
    }

    const adsQuery = query(
      collection(this.firestore, 'adsinvestment'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    this.subscriptions['adsinvestment'] = collectionData(adsQuery).pipe(catchError((error) => {
      console.log('Error in fetching adsinvestment : ', error)
      return of([])
    })).subscribe((snapshot) => {
      let adsSpent = 0;
      let adsCampaigns = 0;

      snapshot.forEach((value) => {
        adsSpent += value['amount']
        adsCampaigns += value['campaigns']
      })

      this.adsSpent = adsSpent;
      this.adsCampaigns = adsCampaigns

      if (!this.loadingStates.adsSpent) {
        this.loadingStates.adsSpent = true;
        this.checkAllDataLoaded();
      }
    })
  }

  // function to fetch last updated date and time form ads collection
  async fetchLastUpdatedAds() {
    const lastUpdatedDocQuery = query(
      collection(this.firestore, 'adsinvestment'),
      orderBy('lastupdated', 'desc'),
      limit(1)
    )

    this.subscriptions['lastupdatedads'] = collectionData(lastUpdatedDocQuery).pipe(catchError((error) => {
      console.log('Error in fetching lastupdatedads : ', error)
      return of([])
    })).subscribe((lastUpdatedDoc) => {
      this.lastUpdatedAdsDate = lastUpdatedDoc[0]['lastupdated']?.toDate() ?? ''
      if (!this.loadingStates.lastUpdatedAds) {
        this.loadingStates.lastUpdatedAds = true
        this.checkAllDataLoaded();
      }
    })
  }

  // function to get journey
  async fetchJourney() {
    const journeySnapshot = await getDocs(collection(this.firestore, 'journey'));
    journeySnapshot.docs.forEach(doc => {
      this.journeyTypeMap[doc.id] = doc.data()['type'];
    });
  }

  // function to load engagement data for last 6 months
  async loadEngagementLast6Months() {

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const appointmentsQuery = query(
      collection(this.firestore, 'appointments'),
      where('starttime', '>=', sixMonthsAgo),
      where('starttime', '<=', today),
      where('journeycoach', '==', true),
      where('cancelled', '==', false),
      where('attended', '==', true)
    );

    const appUsersQuery = query(
      collection(this.firestore, 'FCM_token'),
      where('last_modified', '>=', sixMonthsAgo),
      where('last_modified', '<=', today),
      where('active', '==', true),
      where("device_os", "in", ["ios", "android"])
    );

    const productsQuery = query(
      collection(this.firestore, 'participantsproduct'),
      where("status", "in", ['completed', 'ongoing']),
      where("deliverymode", "==", "Priority Mode")
    );

    const workshopConfigQuery = query(
      collection(this.firestore, 'workshopconfiguration')
    );

    const workshopEnrolledQuery = query(
      collection(this.firestore, 'workshop participant enrolled')
    );

    this.subscriptions['appointments'] = collectionData(appointmentsQuery).pipe(catchError((error) => {
      console.log('Error in fetching appointments : ', error)
      return of([])
    })).subscribe((appointmentsSnapshot) => {
      const allEngagedProfileIds = new Set<string>();
      // Journey Coaching - Track unique profile IDs
      appointmentsSnapshot.forEach(doc => {
        const data = doc;
        const journeyCoach = data['journeycoach'];
        const cancelled = data['cancelled'];
        const attended = data['attended'];
        const profileId = data['bookedby']?.id;
        if (journeyCoach === true && cancelled === false && attended === true && profileId) {
          allEngagedProfileIds.add(profileId);
        }
      });

      this.allEngProfileIds.journeyCoaching = Array.from(allEngagedProfileIds)
      if (!this.loadingStates.appointments) {
        this.loadingStates.appointments = true
        this.checkAllDataLoaded()
      }
    })

    this.subscriptions['FCM_token'] = collectionData(appUsersQuery).pipe(catchError((error) => {
      console.log('Error in fetching FCM_token : ', error)
      return of([])
    })).subscribe((appUsersSnapshot) => {
      const appProfileIds = new Set<string>();
      const appList = [];
      const allEngagedProfileIds = new Set<string>();
      appUsersSnapshot.forEach(doc => {
        const data = doc;
        const profileRef = data['profile_ref']?.id;

        if (profileRef) {
          appProfileIds.add(profileRef);
          appList.push(data)
          allEngagedProfileIds.add(profileRef);
        }
      });

      this.allEngProfileIds.appUser = Array.from(allEngagedProfileIds)
      if (!this.loadingStates.appUser) {
        this.loadingStates.appUser = true
        this.checkAllDataLoaded()
      }
    })

    this.subscriptions['participantsproduct'] = collectionData(productsQuery).pipe(catchError((error) => {
      console.log('Error in fetching participants product : ', error)
      return of([])
    })).subscribe((productsSnapshot) => {
      const allEngagedProfileIds = new Set<string>();
      productsSnapshot.forEach(doc => {
        const data = doc;
        const deliveryMode = data['deliverymode'];
        const status = data['status'];
        const statusDateMap = data['statusdate']
        const profileId = data['profileid'];

        if (deliveryMode === 'Priority Mode') {
          const statusTimestamp = status === 'completed'
            ? statusDateMap?.['completed']
            : statusDateMap?.['ongoing'];

          if (statusTimestamp) {
            const statusDate = statusTimestamp.toDate();

            if (statusDate >= sixMonthsAgo && statusDate <= today && profileId) {
              allEngagedProfileIds.add(profileId);
            }
          }
        }

      });


      this.allEngProfileIds.dfuProduct = Array.from(allEngagedProfileIds)
      if (!this.loadingStates.products) {
        this.loadingStates.products = true
        this.checkAllDataLoaded()
      }
    })

    this.subscriptions['workshop participant enrolled'] = collectionData(workshopEnrolledQuery).pipe(catchError((error) => {
      console.log('Error in fetching workshop participant enrolled  : ', error)
      return of([])
    })).subscribe(async (workshopEnrolledSnapshot) => {

      const activeWorkshopIds = new Set();
      const allEngagedProfileIds = new Set<string>();

      const workshopConfigSnapshot = await getDocs(workshopConfigQuery)

      workshopConfigSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const active = data['active'];
        const workshopCompleted = data['workshopcompleted'];

        if (active === true || workshopCompleted === true) {
          activeWorkshopIds.add(doc.id);
        }
      });


      workshopEnrolledSnapshot.forEach(doc => {
        const data = doc;
        const workshopRef = data['workshopref']?.id;
        const enrollmentDate = data['enrollmentdate']?.toDate();
        const profileId = data['profileid'];

        if (workshopRef &&
          activeWorkshopIds.has(workshopRef) &&
          enrollmentDate &&
          enrollmentDate >= sixMonthsAgo &&
          enrollmentDate <= today &&
          profileId) {
          allEngagedProfileIds.add(profileId);
        }
      });
      this.allEngProfileIds.workshop = Array.from(allEngagedProfileIds)
      if (!this.loadingStates.workshop) {
        this.loadingStates.workshop = true
        this.checkAllDataLoaded()
      }
    })
  }

  // function to get total engaged count
  get getTotalEngagedCount(): number {
    return Object.values(this.allEngProfileIds).reduce((sum, ids) => {
      return sum + ids.length
    }, 0)
  }

  // function to get total engaged profiles
  get getTotalEngagedProfiles(): string[] {
    const profiles = Object.values(this.allEngProfileIds).flat();
    return Array.from(new Set(profiles))
  }

  // method for date formatting
  formatDate(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  // method for weekday formatting
  getWeekday(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }

  // function to format number to money
  formatCurrency(amount: number): string {
    return amount.toLocaleString('en-IN');
  }

  // function to get loading progess
  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStates).filter(state => state === true).length;
    const total = Object.keys(this.loadingStates).length;

    return (loaded / total) * 100;
  }

  // Function to get total loaded count 
  getLoadedCount(): number {
    return Object.values(this.loadingStates).filter(state => state === true).length;
  }

  // function to get expenditure
  async fetchExpenditure() {
    const currentMonthStart = new Date()
    const currentMonthEnd = new Date()

    currentMonthStart.setHours(0, 0, 0, 0)
    currentMonthStart.setDate(1)

    currentMonthEnd.setHours(23, 59, 59, 999)
    currentMonthEnd.setMonth(currentMonthEnd.getMonth() + 1)
    currentMonthEnd.setDate(0)

    const nextMonthStart = new Date()
    const nextMonthEnd = new Date()

    nextMonthStart.setHours(0, 0, 0, 0)
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1)
    nextMonthStart.setDate(1)

    nextMonthEnd.setHours(23, 59, 59, 999)
    nextMonthEnd.setMonth(nextMonthEnd.getMonth() + 2)
    nextMonthEnd.setDate(0)

    const queryForcurrentMonth = query(collection(this.firestore, 'expenseplanning'), where('date', '>=', currentMonthStart), where('date', '<=', currentMonthEnd), where('delete', '==', false))

    const queryForNextMonth = query(collection(this.firestore, 'expenseplanning'), where('date', '>=', nextMonthStart), where('date', '<=', nextMonthEnd), where('delete', '==', false))

    // query to fetch expenditure for current month
    this.subscriptions['currentMonthExpenditure'] = collectionData(queryForcurrentMonth).pipe(catchError((error) => {
      console.log('Error in fetching currentMonthExpenditure : ', error)
      return of([])
    })).subscribe((currentMonthExp) => {
      let planned = 0
      let paid = 0

      for (let expense of currentMonthExp) {
        paid += expense['totalpaid'] ?? 0
        planned += expense['description']?.reduce((sum, desc) => {
          return sum + (desc.amount ?? 0)
        }, 0)
      }

      this.expenditure = {
        planned,
        paid
      }
      if (!this.loadingStates.currentMonthExpenditure) {
        this.loadingStates.currentMonthExpenditure = true;
        this.checkAllDataLoaded();
      }
    })

    // query to fetch expenditure for next month
    this.subscriptions['nextMonthExpenditure'] = collectionData(queryForNextMonth).pipe(catchError((error) => {
      console.log('Error in fetching nextMonthExpenditure : ', error)
      return of([])
    })).subscribe((nextMonthExp) => {
      let planned = 0
      for (let expense of nextMonthExp) {
        planned += expense['description']?.reduce((sum, desc) => {
          return sum + (desc.amount ?? 0)
        }, 0)
      }
      this.nextMonthExpenditurePlanned = planned;
      if (!this.loadingStates.nextMonthExpenditure) {
        this.loadingStates.nextMonthExpenditure = true;
        this.checkAllDataLoaded();
      }
    })
  }


  // function to format values in table cells
  formatCellValue(row: any, column: any): string {
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
        return this.formatDateForCell(value, column.format, column.mapValue);

      case 'currency':
        return this.formatCurrencyForCell(value, column.prefix, column.mapValue);

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
  private formatDateForCell(value: any, format?: string, mapValue?: string): string {
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
  private formatCurrencyForCell(value: number, prefix?: string, mapValue?: string): string {
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

  openModal(dailogType: string): void {
    const dialog = this.dialogConfigs[dailogType];
    const totalEngagedProfiles = this.getTotalEngagedProfiles;
    if (dialog) {
      switch (dialog.table.dataKey) {
        case 'totalrevenue':
          dialog.table.data = this.assuredRevenueList;
          break;
        case 'newsales':
          dialog.table.data = this.newSales;
          break;
        case 'upgradesales':
          dialog.table.data = this.upgradeSales;
          break;
        case 'dfusales':
          dialog.table.data = this.dfuSales;
          break;
        case 'big':
          dialog.table.data = this.activityOverview.big;
          break
        case 'cpm':
          dialog.table.data = this.activityOverview.cpm;
          break
        case 'lyl':
          dialog.table.data = this.activityOverview.lyl;
          break
        case 'up':
          dialog.table.data = this.activityOverview.up;
          break
        case 'journeyCoaching': case 'dfuProduct': case 'workshop': case 'appUser':
          dialog.table.data = this.allEngProfileIds[dialog.table.dataKey]?.map((id) => ({ name: this.mapProfile[id]?.name ? this.mapProfile[id]['name'] : '-' })) ?? [];
          break
        case 'activeparticipant':
          const activeParticipant = totalEngagedProfiles.filter((e) => this.mapProfile[e]?.['customerstatus']?.toLowerCase() == 'active')
          dialog.table.data = this.activeParticipantsList.map((profile) => {
            return { ...profile, isActive: activeParticipant.includes(profile['profileid']) }
          });
          break
        case 'nonactiveparticipant':
          const nonActiveParticipant = totalEngagedProfiles.filter((e) => this.mapProfile[e]?.['customerstatus']?.toLowerCase() == 'non active')
          dialog.table.data = this.nonactiveParticipantsList.map((profile) => {
            return { ...profile, isNonActive: nonActiveParticipant.includes(profile['profileid']) }
          });
          break
        default:
          break;
      }
      dialog.table.data.sort((a, b) => {
        const left = a['name']?.trim()?.split(' ')[0];
        const right = b['name']?.trim()?.split(' ')[0];
        return left?.localeCompare(right)
      });
      this.dialogConfig = dialog
      this.dialog.open(this.modalTemplate, dialog.dialog).afterClosed().toPromise().then(() => this.dialogConfig = null);
    }
  }


  // Function to navigate screen to expense planner 
  navigateToExpensePlanner(path: string) {
    if (window.location.port.includes('4200')) {
      window.open(`expense-planner/${path}`, '_blank');
    } else if (environment.firebase.projectId == 'starlabs-test') {
      window.open(`expense-planner/${path}`, '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open(`expense-planner/${path}`, '_blank');
    }
  }

  // Function to navigate screen to ads entry
  navigateToAdsEntry() {
    if (window.location.port.includes('4200')) {
      window.open(`ads-entry`, '_blank');
    } else if (environment.firebase.projectId == 'starlabs-test') {
      window.open(`ads-entry`, '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open(`ads-entry`, '_blank');
    }
  }

  sortParticipants() {
    const config = this.dialogConfig
    if (config && ['activeparticipant', 'nonactiveparticipant'].includes(config.table.dataKey)) {
      const column = config.table.columns.filter((col)=> ['isActive' , 'isNonActive'].includes(col.key))[0] ;

      if (!config.table.sort || config.table.sort === 'desc') {
        config.table.data.sort((a, b) => this.formatCellValue(b,column )?.localeCompare(this.formatCellValue(a,column )))
        config.table.sort = 'asc';
      } else {
        config.table.data.sort((a, b) => this.formatCellValue(a,column )?.localeCompare(this.formatCellValue(b,column )));
        config.table.sort = 'desc';
      }

      this.dialogConfig = config;
    }
  }

}

