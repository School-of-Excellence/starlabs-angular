import { ChangeDetectorRef, Component, ViewChild, TemplateRef, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe, KeyValue } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { Firestore, collection, collectionData, query, where, updateDoc, doc, getDocs, orderBy, Timestamp, getDoc } from '@angular/fire/firestore';
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

@Component({
  selector: 'app-delivery-dashboard',
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
  ],
  templateUrl: './delivery-dashboard.component.html',
  styleUrl: './delivery-dashboard.component.css'
})
export class DeliveryDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('tabGroup') tabGroup: any;
  filterForm: FormGroup;

  // Boolean declarations
  isLoading = true;
  subscriptions: any = {};
  Math = Math;
  isFilterButtonClick = false;

  activeFilter: 'none' | 'readyForInitiation' | 'clearedMoreThan7Days' | 'clearedMoreThan30Days' | 'initiatedToday' | 'welcomeCall' | 'clarityCall' | 'diagnostics' | 'implementation' | 'midReviewDiagnostics' | 'implementationPhase2' | 'finalReview' | 'completed' | 'needsValidation' | 'todayActivity' | 'last7DaysActivity' | 'last30DaysActivity' | 'thisMonthActivity' = 'none'; selectedProduct: string = 'All Products Overview';
  selectedTimeFilter: string = '';

  selectedMonth: Date = new Date();
  displayMonth: string = '';

  //Array declarations
  journeyList = [];
  productList: string[] = [];
  coachesList = [];

  searchText: string = '';
  filteredData: any[] = [];

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
  productsSubscription!: Subscription;

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

  constructor(
    private firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private guard: AuthguardService,
    private router: Router,
    private fb: FormBuilder,
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
          if (element['journey']) {
            this.journeyList.push(element['journey']);
          }
        }
        this.loadingStates.journeyData = true;
        this.checkAllDataLoaded();
      });
      await getDocs(collection(this.firestore, 'products')).then(snap => {
        for (let i = 0; i < snap.docs.length; i++) {
          const doc = snap.docs[i];
          const element = doc.data();
          this.mapProductName[doc.id] = element['product'] || 'Unknown Product';
          if (element['product']) {
            this.productList.push(element['product']);
          }
        }
      });
      this.fetchData();
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
  loadParticipantMetadata() {
    this.subscriptions['metadata'] = collectionData(query(collection(this.firestore, "participant metadata"), orderBy("name", "asc"))).subscribe((metadata) => {
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
              this.loadJourneyProductData();
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

    const products$ = collectionData(
      query(
        collection(this.firestore, "participantsproduct"),
        where("statusdate.initiated", "<=", enddate)
      ),
      { idField: 'id' }
    );

    this.productsSubscription = products$.subscribe((products: any[]) => {
      let tempArray1 = [];
      let tempArray2 = [];

      if (products.length !== 0) {
        for (let index = 0; index < products.length; index++) {
          const productdata = products[index];

          if (
            productdata['status'] === 'initiated' &&
            productdata["deliverymode"] === "Priority Mode"
          ) {
            const statusDateInitiated = productdata['statusdate']?.['initiated'];

            productdata['initiatedtime'] = statusDateInitiated;

            const initiatedDate = statusDateInitiated.toDate();
            initiatedDate.setHours(0, 0, 0, 0);

            if (initiatedDate.toDateString() === todayString) {
              tempArray1.push(productdata);
            }

            productdata['waitingperiod'] = this.calculateWaitingPeriod(
              statusDateInitiated.toDate()
            );

            const journeyId =
              this.mapMetaData[productdata['profileid']]?.['activejourney'];

            const journeyname = this.mapjourneyname[journeyId] || 'N/A';
            productdata['journey'] = journeyname;

            tempArray2.push(productdata);
          }

          if (index + 1 === products.length) {
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
    });
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

  // async filterAppointmentsByType() {
  //   try {
  //     const appointments = await getDocs(query(collection(this.firestore, "appointments"),where("attended", "==", true),where("cancelled", "==", false)));
  //     console.log('Total appointments found:', appointments.docs.length);
  //     if (appointments.docs.length === 0) {
  //       console.log('No appointments found matching the query');
  //       this.loadingStates.appointments = true;
  //       this.checkAllDataLoaded();
  //       return;
  //     }
  //     const appointmentTypeRefs = new Map();
  //     appointments.docs.forEach(doc => {
  //       const ref = doc.data()['appointment'];
  //       if (ref) {
  //         appointmentTypeRefs.set(ref.path, ref);
  //       }
  //     });
  //     const appointmentTypePromises = Array.from(appointmentTypeRefs.values()).map(ref =>
  //       getDoc(ref).catch(error => {
  //         console.error('Error fetching appointment type:', error);
  //         return null;
  //       })
  //     );
  //     const appointmentTypeDocs = await Promise.all(appointmentTypePromises);
  //     const typeNameMap = new Map();
  //     Array.from(appointmentTypeRefs.keys()).forEach((path, index) => {
  //       const doc = appointmentTypeDocs[index];
  //       if (doc?.exists()) {
  //         typeNameMap.set(path, doc.data()['appointmenttype'] || '');
  //       }
  //     });

  //     const categoryMap = {
  //       'Welcome To WiSH': 'welcomeCall',

  //       'EI Celebration Call': 'clarityCall',
  //       'WiSH Experience Call': 'clarityCall',
  //       'EI Starter Pack Clarity Call': 'clarityCall',

  //       'A&H Light Diagnostics': 'diagnostics',
  //       'EI Starter Pack Diagnostics': 'diagnostics',
  //       'WiSH Diagnostics': 'diagnostics',
  //       'Critical Support Diagnostics': 'diagnostics',
  //       'EI Diagnostics': 'diagnostics',

  //       'EI Implementation': 'implementation',
  //       'WiSH Implementation': 'implementation',
  //       'Critical Support Implementation': 'implementation',
  //       'A&H Light Implementation': 'implementation',
  //       'EI Starter Pack Implementation': 'implementation',
  //       'Breakthrough Implementation': 'implementation',
  //       'A&H Review Implementation': 'implementation',
  //       'A&H Motherhood Implementation': 'implementation',

  //       'WiSH Review': 'midReviewDiagnostics',
  //       'A&H Light Mid Review': 'midReviewDiagnostics',
  //       'EI Review': 'midReviewDiagnostics',
  //       'Critical Support Mid Review': 'midReviewDiagnostics',

  //       'WiSH Final Review Call': 'implementationPhase2'
  //     };
  //     const categorizedData = {
  //       welcomeCall: [],
  //       clarityCall: [],
  //       diagnostics: [],
  //       implementation: [],
  //       midReviewDiagnostics: [],
  //       implementationPhase2: []
  //     };
  //     appointments.docs.forEach(doc => {
  //       const appointmentData = doc.data();
  //       appointmentData['docid'] = doc.id;

  //       const appointmentTypeRef = appointmentData['appointment'];
  //       if (appointmentTypeRef) {
  //         const appointmentTypeName = typeNameMap.get(appointmentTypeRef.path);
  //         if (appointmentTypeName) {
  //           appointmentData['appointmentTypeName'] = appointmentTypeName;
  //           const category = categoryMap[appointmentTypeName];
  //           if (category) {
  //             categorizedData[category].push(appointmentData);
  //             if (category === 'midReviewDiagnostics') {
  //               console.log('debuggg', appointmentData);
  //             }
  //           }
  //         }
  //       }
  //     });
  //     Object.keys(categorizedData).forEach(key => {
  //       console.log(`debuggg33 ${key}`, categorizedData[key]);
  //       this.originalData[key].data = categorizedData[key];
  //       this.originalData[key].count = categorizedData[key].length;
  //     });
  //     console.log('Filtered appointments:', this.originalData);
  //     this.loadingStates.appointments = true;
  //     this.checkAllDataLoaded();

  //   } catch (error) {
  //     console.error('Error loading appointments:', error);
  //     this.loadingStates.appointments = true;
  //     this.checkAllDataLoaded();
  //   }
  // }

  // async filterAppointmentsByType() {
  //   try {
  //     const appointmentsSnap = await getDocs(query(collection(this.firestore, "appointments"),where("attended", "==", true),where("cancelled", "==", false)));
  //     if (appointmentsSnap.empty) {
  //       this.loadingStates.appointments = true;
  //       this.checkAllDataLoaded();
  //       return;
  //     }

  //     const productIds = appointmentsSnap.docs
  //       .map(doc => doc.data()["productid"])
  //       .filter((id: string) => !!id);

  //     if (productIds.length === 0) {
  //       console.log("No product IDs found in appointments");
  //       this.loadingStates.appointments = true;
  //       this.checkAllDataLoaded();
  //       return;
  //     }

  //     const productQuery = query(collection(this.firestore, "participantsproduct"),where("status", "in", ["initiated", "ongoing"]));
  //     const productSnap = await getDocs(productQuery);
  //     const validProductIds = productSnap.docs.map(d => d.data()["productid"]);
  //     // console.log("Valid product IDs (initiated/ongoing):", validProductIds);
  //     let filteredAppointments = appointmentsSnap.docs.filter(doc => {
  //       const productId = doc.data()["productid"];
  //       return validProductIds.includes(productId);
  //     });
  //     if (filteredAppointments.length === 0) {
  //       this.loadingStates.appointments = true;
  //       this.checkAllDataLoaded();
  //       return;
  //     }
  //     const appointmentTypeRefs = new Map();
  //     filteredAppointments.forEach(doc => {
  //       const ref = doc.data()["appointment"];
  //       if (ref) appointmentTypeRefs.set(ref.path, ref);
  //     });
  //     const appointmentTypePromises = Array.from(appointmentTypeRefs.values()).map(ref =>
  //       getDoc(ref).catch(error => {
  //         console.error("Error fetching appointment type:", error);
  //         return null;
  //       })
  //     );
  //     const appointmentTypeDocs = await Promise.all(appointmentTypePromises);
  //     const typeNameMap = new Map();
  //     Array.from(appointmentTypeRefs.keys()).forEach((path, index) => {
  //       const doc = appointmentTypeDocs[index];
  //       if (doc?.exists()) typeNameMap.set(path, doc.data()["appointmenttype"] || "");
  //     });
  //     if (this.selectedProduct !== "All Products Overview") {
  //       const productKeywordsMap: any = {
  //         "WISH": ["WiSH"],
  //         "A&H LIGHT": ["A&H Light"],
  //         "EI Solution": ["EI Solution", "EI Celebration"],
  //         "EI Starter Pack": ["EI Starter Pack"],
  //         "Critical Support": ["Critical Support"]
  //       };

  //       const selectedKeywords = productKeywordsMap[this.selectedProduct] || [];

  //       filteredAppointments = filteredAppointments.filter(doc => {
  //         const appointmentRef = doc.data()["appointment"];
  //         if (!appointmentRef) return false;
  //         const appointmentTypeName = typeNameMap.get(appointmentRef.path) || "";
  //         return selectedKeywords.some(keyword => appointmentTypeName.includes(keyword));
  //       });
  //     }
  //     const categoryMap = {
  //       "Welcome To WiSH": "welcomeCall",

  //       "WiSH Experience Call": "clarityCall",
  //       "EI Starter Pack Clarity Call": "clarityCall",

  //       "A&H Light Diagnostics": "diagnostics",
  //       "EI Starter Pack Diagnostics": "diagnostics",
  //       "WiSH Diagnostics": "diagnostics",
  //       "Critical Support Diagnostics": "diagnostics",
  //       "EI Diagnostics": "diagnostics",

  //       "EI Implementation": "implementation",
  //       "WiSH Implementation": "implementation",
  //       "Critical Support Implementation": "implementation",
  //       "A&H Light Implementation": "implementation",
  //       "EI Starter Pack Implementation": "implementation",

  //       "WiSH Review": "midReviewDiagnostics",
  //       "A&H Light Mid Review": "midReviewDiagnostics",
  //       "EI Review": "midReviewDiagnostics",
  //       "Critical Support Mid Review": "midReviewDiagnostics",

  //       "WiSH Final Review Call": "implementationPhase2",

  //       "EI Celebration Call": "completed",
  //       "WiSH Celebration Call": "completed"
  //     };

  //     const categorizedData = {
  //       welcomeCall: [],
  //       clarityCall: [],
  //       diagnostics: [],
  //       implementation: [],
  //       midReviewDiagnostics: [],
  //       implementationPhase2: [],
  //       completed: []
  //     };

  //     filteredAppointments.forEach(doc => {
  //       const appointmentData = doc.data();
  //       appointmentData["docid"] = doc.id;
  //       const appointmentTypeRef = appointmentData["appointment"];
  //       if (appointmentTypeRef) {
  //         const appointmentTypeName = typeNameMap.get(appointmentTypeRef.path);
  //         if (appointmentTypeName) {
  //           appointmentData["appointmentTypeName"] = appointmentTypeName;
  //           const category = categoryMap[appointmentTypeName];
  //           if (category) categorizedData[category].push(appointmentData);
  //         }
  //       }
  //     });
  //     Object.keys(categorizedData).forEach(key => {
  //       this.originalData[key].data = categorizedData[key];
  //       this.originalData[key].count = categorizedData[key].length;
  //     });

  //     this.loadingStates.appointments = true;
  //     this.checkAllDataLoaded();

  //   } catch (error) {
  //     console.error("Error loading appointments:", error);
  //     this.loadingStates.appointments = true;
  //     this.checkAllDataLoaded();
  //   }
  // }

  async filterAppointmentsByType() {
    try {
      const metadataSnap = await getDocs(collection(this.firestore, "participant metadata"));
      const validProfileData = new Map<string, string[]>();

      metadataSnap.docs.forEach(doc => {
        const data = doc.data();
        const activeJourney = data['activejourney'];
        const activeProduct = data['activeproduct'];

        if (activeJourney && activeProduct && activeProduct.length > 0) {
          const profileRef = `profile_data/${doc.id}`;
          validProfileData.set(profileRef, activeProduct);
        }
      });

      if (validProfileData.size === 0) {
        this.loadingStates.appointments = true;
        this.checkAllDataLoaded();
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

      const appointmentsSnap = await getDocs(query(
        collection(this.firestore, "appointments"),
        where("cancelled", "==", false),
        where("starttime", ">=", startTimestamp),
        where("starttime", "<=", endTimestamp)
      ));

      if (appointmentsSnap.empty) {
        this.loadingStates.appointments = true;
        this.checkAllDataLoaded();
        return;
      }

      const participantAppointments = new Map();
      appointmentsSnap.docs.forEach(doc => {
        const appointmentData = doc.data();
        const bookedBy = appointmentData["bookedby"];
        const bookedByPath = bookedBy?.path || null;
        const participantId = bookedBy?.id;
        const startTime = appointmentData["endtime"];
        const productId = appointmentData["productid"];

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
        const latestWithPrevious = { ...value.latest, previousAppointment: value.previous };
        participantLatestAppointments.set(key, latestWithPrevious);
      });

      if (participantLatestAppointments.size === 0) {
        this.loadingStates.appointments = true;
        this.checkAllDataLoaded();
        return;
      }

      const allAppointments = Array.from(participantLatestAppointments.values());
      const appointmentTypeRefs = new Map();
      allAppointments.forEach(appointmentData => {
        const ref = appointmentData["appointment"];
        if (ref) appointmentTypeRefs.set(ref.path, ref);
        const prevRef = appointmentData.previousAppointment?.appointment;
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
      this.checkAllDataLoaded();
    } catch (error) {
      console.error("Error loading appointments:", error);
      this.loadingStates.appointments = true;
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
    this.loadModes();
    this.filterAppointmentsByType();
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
    console.log('All data loaded:', this.loadingStates);
    const allLoaded = Object.values(this.loadingStates).every(state => state === true);
    if (allLoaded) {
      this.processTodayActivity();
      this.processLast7DaysActivity();
      this.processLast30DaysActivity();
      this.processThisMonthActivity();
      this.isLoading = false;
      this.updatePaginatedData();
    }
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
    this.filterAppointmentsByType();
  }
}