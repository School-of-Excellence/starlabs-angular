import { Component, OnInit, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { ProductDialogComponent } from '../product-dialog/product-dialog.component';
import { ScheduleDialogComponent } from '../schedule-dialog/schedule-dialog.component';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
// import * as firebase from 'firebase';
import { firstValueFrom, Subject, Subscription, takeUntil } from 'rxjs';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { JourneyplanDialogComponent } from '../journeyplan-dialog/journeyplan-dialog.component';
import { RescheduleDialogComponent } from '../reschedule-dialog/reschedule-dialog.component';
import { SelectionModel } from '@angular/cdk/collections';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { AhNotificationComponent } from '../../DialogBox/ah-notification/ah-notification.component';
import { InAppMessageInputComponent } from '../../in-app-message-input/in-app-message-input.component';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { JourneycoachOpportunitiesComponent } from '../journeycoach-opportunities/journeycoach-opportunities.component';
import { JourneycoachCompletedComponent } from '../journeycoach-completed/journeycoach-completed.component';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Timestamp } from 'firebase/firestore';

@Component({
  selector: 'app-journeycoach-dashboard',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSlideToggleModule,
    FormsModule
  ],
  templateUrl: './journeycoach-dashboard.component.html',
  styleUrl: './journeycoach-dashboard.component.css'
})
export class JourneycoachDashboardComponent {
  selection = new SelectionModel(true, []);

  activeSection: string = 'all';
  selectedEngagementCategory: string = 'ActiveOnly';
  loggedInProfileId: any = null;
  journey: string;
  selectedjourney: string;
  ecosystemjourney: any;
  appointmentdoc: any;
  start: any;
  end: any;
  previousorientationstatus;
  popupData: any = null;
  hideTimeout: any;

  currentDate = new Date();
  selectedDate: Date = new Date();
  lastMonth: Date;
  currentMonth: Date;
  nextMonth: Date;
  onboardedStartDate;
  onboardedEndDate;

  totalproductCount: number = 0;
  currentMonthGrossSale: number = 0;
  currentMonthAssuredSale: number = 0;
  currentAvgToASV;
  currentAvgGSVToASV;
  totalGrossValue: number = 0;
  totalAssuredValue: number = 0;
  totalGrossEMI: number = 0;
  totalAssuredEMI: number = 0;
  currentJourneyCancelled: number = 0;

  ecosystemJourneys = [];
  last7DaysnotOnboardedData = [];
  last7to15notOnboardedData = [];
  minimumpaymentdueData = [];
  lessthan30daysjourneynotstartedData = [];
  last7to15journeynotstartedData = [];
  morethan30daysjourneynotstartedData = [];
  last15daysnotOnboardedData = [];
  disappearData = [];
  minimalData = [];
  averageData = [];
  optimalData = [];
  superoptimalData = [];
  nextMonthData = [];
  lastMonthData = [];
  currentMonthData = [];
  journeycompletedParticipants = [];
  grossSale = [];
  assuredSale = [];
  coachesList = [];
  onboardedData = [];
  regularStatusData = [];
  missedStatusData = [];
  defaultedStatusData = [];
  lockedStatusData = [];
  fullyPaidData = [];
  eventsData = [];
  journeyData = [];
  cancellationData = [];
  bigData = [];
  notAssuredData = [];
  eventsDataClosed = [];
  journeyDataClosed = [];
  cancellationDataClosed = [];
  bigDataClosed = [];
  journeyCancelledData = [];
  // Default columns to display
  defaultDisplayedColumns: string[] = ['select', 'name', 'number', 'journey', 'product+bonus', 'purchasedate', 'presalesperson', 'salesperson', 'paymentplanassureddate', 'toggle', 'schedule', 'schedulefor', 'journeyplan', 'action', 'viewnotes', 'addnotes'];
  // Columns for "Waiting for Onboarding"
  waitingForOnboardingColumns: string[] = ['select', 'name', 'number', 'journey', 'product+bonus', 'purchasedate', 'presalesperson', 'salesperson', 'paymentplanassureddate', 'toggle', 'schedule', 'schedulefor', 'action', 'journeyplan', 'viewnotes', 'addnotes'];
  minimumpaymentdueColumns: string[] = ['select', 'name', 'number', 'journey', 'onboardeddate', 'onboardedby', 'report', 'firstproduct', 'tentativestart', 'minimumpayment', 'paidamount', 'remainingamount', 'finance', 'queries', 'viewreport', 'journeyplan', 'viewnotes', 'addnotes'];
  journeynotstartedColumns: string[] = ['select', 'name', 'number', 'journey', 'product+bonus', 'onboardeddate', 'firstproduct', 'tentativestart', 'firstproduct', 'finance', 'queries', 'viewreport', 'journeyplan', 'initiate', 'viewnotes', 'addnotes'];
  engagementlevelColumns: string[] = ['select', 'name', 'number', 'journey', 'product+bonus', 'customerstatus', 'finance', 'paidamount', 'engagement', 'lasttouchpoint', 'enddate', 'queries', 'journeyplan', 'viewnotes', 'addnotes'];
  salesDisplayedColumns: string[] = ['select', 'name', 'number', 'purchasedate', 'journey', 'purchasevalue', 'installmentamount', 'presalesperson', 'salesperson', 'notes'];

  loading: boolean = false;
  pastappointment: boolean = false;

  subscription: Object = {};

  mapjourney = {};
  mapjourneyname = {};
  mapprofile = {};
  mapphone = {};
  mapProfileData = {};
  mapPackage = {};
  mapparticipantjourney = {};
  mapfirstProduct = {};
  mapAppointmentsData = {};
  issueCounts = {};
  totalPaidMap = {};
  mapproducts = {};
  mapMetadata = {};
  mapAppointments = {};

  originalData = {
    notassured: { count: 0, data: [] },
    all: { count: 0, data: [] },
    last7DaysnotOnboarded: { count: 0, data: [] },
    last7to15notOnboarded: { count: 0, data: [] },
    last15daysnotOnboarded: { count: 0, data: [] },
    onboarded: { count: 0, data: [] },
    minimumpaymentdue: { count: 0, data: [] },
    lessthan30daysjourneynotstarted: { count: 0, data: [] },
    last7to15journeynotstarted: { count: 0, data: [] },
    morethan30daysjourneynotstarted: { count: 0, data: [] },
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
    nextMonth: { count: 0, data: [] },
    lastMonth: { count: 0, data: [] },
    currentMonth: { count: 0, data: [] },
    alljourneynotstarted: { count: 0, data: [] },
    grosssale: { count: 0, data: [] },
    assuredsale: { count: 0, data: [] },
    regularstatus: { count: 0, data: [] },
    missedstatus: { count: 0, data: [] },
    defaultedstatus: { count: 0, data: [] },
    lockedstatus: { count: 0, data: [] },
    fullypaidstatus: { count: 0, data: [] },
    eventtickets: { count: 0, data: [] },
    journeytickets: { count: 0, data: [] },
    cancellationtickets: { count: 0, data: [] },
    bigtickets: { count: 0, data: [] },
    eventticketsclosed: { count: 0, data: [] },
    journeyticketsclosed: { count: 0, data: [] },
    cancellationticketsclosed: { count: 0, data: [] },
    bigticketsclosed: { count: 0, data: [] },
    journeycancelled: { count: 0, data: [] }
  };

  filterForm: FormGroup

  onboardingcount = {
    notassured: { count: 0, data: [] },
    all: { count: 0, data: [] },
    last7DaysnotOnboarded: { count: 0, data: [] },
    last7to15notOnboarded: { count: 0, data: [] },
    last15daysnotOnboarded: { count: 0, data: [] },
    onboarded: { count: 0, data: [] },
    minimumpaymentdue: { count: 0, data: [] },
    lessthan30daysjourneynotstarted: { count: 0, data: [] },
    last7to15journeynotstarted: { count: 0, data: [] },
    morethan30daysjourneynotstarted: { count: 0, data: [] },
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
    nextMonth: { count: 0, data: [] },
    lastMonth: { count: 0, data: [] },
    currentMonth: { count: 0, data: [] },
    alljourneynotstarted: { count: 0, data: [] },
    grosssale: { count: 0, data: [] },
    assuredsale: { count: 0, data: [] },
    regularstatus: { count: 0, data: [] },
    missedstatus: { count: 0, data: [] },
    defaultedstatus: { count: 0, data: [] },
    lockedstatus: { count: 0, data: [] },
    fullypaidstatus: { count: 0, data: [] },
    eventtickets: { count: 0, data: [] },
    journeytickets: { count: 0, data: [] },
    cancellationtickets: { count: 0, data: [] },
    bigtickets: { count: 0, data: [] },
    eventticketsclosed: { count: 0, data: [] },
    journeyticketsclosed: { count: 0, data: [] },
    cancellationticketsclosed: { count: 0, data: [] },
    bigticketsclosed: { count: 0, data: [] },
    journeycancelled: { count: 0, data: [] }
  };

  displayedColumns: string[] = this.defaultDisplayedColumns;
  dataSource = new MatTableDataSource()
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  private subscriptionHandle = new Subject<void>()

  // lastpaymentMap = {}
  constructor(
    public firestore: Firestore,
    private dialog: MatDialog,
    private guard: AuthguardService,
    private router: Router,
    public datepipe: DatePipe,
    private storage: Storage,
    private formbuilder: FormBuilder
  ) {

    this.filterForm = this.formbuilder.group({
      name: [''],
      dateStart: [null],
      dateEnd: [null],
      new: [false],
      upgrade: [false],
      DFU: [false],
      journey: [''],
      journeycoach: ''
    });
    // this.guard.getRoles().then(async roles=>{
    //   this.loggedInProfileId = roles['profile_ref'].id
    //   if(roles["journeycoach"]){
    //     console.log("Good")
    //   }
    //   else{
    //     alert("Unauthorized Access")
    //     this.router.navigateByUrl('/')
    //   }
    // });

    this.guard.getProfileMap().then(e => {
      this.mapprofile = e.map;
      this.mapphone = e.phonenumber;
      this.mapProfileData = e.docdata;
    });

    this.guard.getProductMap().then(e => {
      this.mapproducts = e
    });

    this.guard.getPackageMap().then(e => {
      this.mapPackage = e
    });

    getDocs(query(collection(this.firestore, 'users_roles'), where('ahmember', '==', true))).then(snap => {
      this.coachesList = snap.docs.map(e => e.data())
    });

    collectionData(query(collection(this.firestore, "salesleads"), where("journeytype", "in", ['new', 'upgrade', 'addons']))).pipe(takeUntil(this.subscriptionHandle)).subscribe((salesdoc) => {
      if (salesdoc.length > 0) {
        let list = [];
        for (let i = 0; i < salesdoc.length; i++) {
          const saleData = salesdoc[i];
          if (![null, undefined].includes(saleData['purchasedate'])) {
            saleData['journeystatus'] = null;
            saleData['salesperson'] = saleData['salespersonname']
            saleData['journeyref'] = ![null, undefined, ''].includes(saleData['journey']) ? doc(this.firestore, "journey", saleData['journey']) : (saleData['journeytype'] == 'addons' ? null : null)
            saleData['presalesperson'] = saleData['presalesperson']
            list.push(saleData);
          }
        }

        let finalList = list.filter((e) => {
          return e['purchasedate'] && e['purchasedate'].toDate() >= new Date('2025-01-01');
        }).sort((a, b) => b['purchasedate'].toDate() - a['purchasedate'].toDate());

        this.grossSale = finalList.filter((e) => [null, undefined, "", "Approved"].includes(e['status']) && e['journey'] != 'InLXMl7OBAqlDTZcXwK0');
        this.assuredSale = finalList.filter((e) => ![null, undefined].includes(e['paymentplan']) && e['journey'] != 'InLXMl7OBAqlDTZcXwK0' && e['status'] == 'Approved');
        this.onboardingcount['grosssale']['data'] = this.grossSale;
        this.onboardingcount['assuredsale']['data'] = this.assuredSale;

        let allData = [...this.grossSale, ...this.assuredSale];

        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentMonthStart.setHours(0, 0, 0, 0);

        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        currentMonthEnd.setHours(23, 59, 59, 999);

        currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
        currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

        let startdate = Timestamp.fromDate(currentMonthStart).toDate();
        let enddate = Timestamp.fromDate(currentMonthEnd).toDate();

        const currentGross = this.grossSale.filter(sale => {
          const purchaseDate = ![null, undefined, ''].includes(sale['purchasedate']) ? (sale['purchasedate'] instanceof Date ? sale['purchasedate'] : sale['purchasedate'].toDate()) : null;
          return purchaseDate && purchaseDate >= startdate && purchaseDate <= enddate;
        });

        this.currentMonthGrossSale = currentGross.length;
        this.totalGrossValue = currentGross.reduce((sum, sale) => sum + (sale['totalpurchasevalue'] || 0), 0);
        this.totalGrossEMI = currentGross.reduce((sum, sale) => sum + (sale['installmentamount'] || 0), 0);
        let avg1 = currentGross.reduce((sum, entry) => sum + Math.abs(this.calculateDaysAgo(entry['date']?.toDate(), new Date())), 0);
        this.currentAvgToASV = (avg1 / this.currentMonthGrossSale).toFixed(2);

        const currentAssured = this.assuredSale.filter(sale => {
          const purchaseDate = ![null, undefined, ''].includes(sale['purchasedate']) ? (sale['purchasedate'] instanceof Date ? sale['purchasedate'] : sale['purchasedate'].toDate()) : null;
          return purchaseDate && purchaseDate >= startdate && purchaseDate <= enddate;
        });

        this.currentMonthAssuredSale = currentAssured.length;
        this.totalAssuredValue = currentAssured.reduce((sum, sale) => sum + (sale['totalpurchasevalue'] || 0), 0);
        this.totalAssuredEMI = currentAssured.reduce((sum, sale) => sum + (sale['installmentamount'] || 0), 0);
        let avg2 = currentAssured.reduce((sum, entry) => sum + Math.abs(this.calculateDaysAgo(entry['date']?.toDate(), entry['paymentplanassureddate']?.toDate())), 0);
        this.currentAvgGSVToASV = (avg2 / this.currentMonthAssuredSale).toFixed(2);
      }
    });

    collectionData(query(collection(this.firestore, 'appointments'), where('journeycoach', '==', true), where('cancelled', '==', false)), { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle)).subscribe((appointments: any[]) => {
      this.mapAppointments = {};
      this.mapAppointmentsData = {};
      if (appointments.length != 0) {
        for (let i = 0; i < appointments.length; i++) {
          const appointment = appointments[i];
          this.mapAppointments[appointment.id] = appointment['hosts'];
          this.mapAppointmentsData[appointment.id] = appointment['hosts'];
        }
      }
    });

    getDocs(query(collection(this.firestore, 'clientissue'), where('status.status', '==', 'Open'))).then(res => {
      for (let i = 0; i < res.docs.length; i++) {
        const element = res.docs[i].data();
        this.issueCounts[element['clientid']] = (this.issueCounts[element['clientid']] || 0) + 1;
      }
    });

    collectionData(collection(this.firestore, 'participant metadata')).pipe(takeUntil(this.subscriptionHandle)).subscribe(res => {
      for (let i = 0; i < res.length; i++) {
        const element = res[i];
        this.mapMetadata[element['profileid']] = element
      }
    });

    collectionData(query(collection(this.firestore, "clientissue"), where("category", "in", ['Events & Process', 'Journey Related', 'Downgrade, Cancellation & Exceptions', 'B!G Support ']))).pipe(takeUntil(this.subscriptionHandle)).subscribe((tickets) => {
      if (tickets.length != 0) {
        const currentMonth1st = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        this.onboardingcount['eventtickets'].count = 0
        this.onboardingcount['eventtickets'].data = []
        this.onboardingcount['journeytickets'].count = 0
        this.onboardingcount['journeytickets'].data = []
        this.onboardingcount['cancellationtickets'].count = 0
        this.onboardingcount['cancellationtickets'].data = []
        this.onboardingcount['bigtickets'].count = 0
        this.onboardingcount['bigtickets'].data = []
        this.onboardingcount['eventticketsclosed'].count = 0
        this.onboardingcount['eventticketsclosed'].data = []
        this.onboardingcount['journeyticketsclosed'].count = 0
        this.onboardingcount['journeyticketsclosed'].data = []
        this.onboardingcount['cancellationticketsclosed'].count = 0
        this.onboardingcount['cancellationticketsclosed'].data = []
        this.onboardingcount['bigticketsclosed'].count = 0
        this.onboardingcount['bigticketsclosed'].data = []
        for (let i = 0; i < tickets.length; i++) {
          const ticketdata = tickets[i];
          if (ticketdata['status']?.status.toLowerCase() == 'open') {
            if (ticketdata['category'] == 'Events & Process') {
              this.onboardingcount['eventtickets'].count++;
              this.onboardingcount['eventtickets'].data.push(ticketdata);
              this.eventsData = this.onboardingcount['eventtickets'].data;
            } else if (ticketdata['category'] == 'Journey Related') {
              this.onboardingcount['journeytickets'].count++;
              this.onboardingcount['journeytickets'].data.push(ticketdata);
              this.journeyData = this.onboardingcount['journeytickets'].data;
            } else if (ticketdata['category'] == 'Downgrade, Cancellation & Exceptions') {
              this.onboardingcount['cancellationtickets'].count++;
              this.onboardingcount['cancellationtickets'].data.push(ticketdata);
              this.cancellationData = this.onboardingcount['cancellationtickets'].data;
            } else if (ticketdata['category'] == 'B!G Support ') {
              this.onboardingcount['bigtickets'].count++;
              this.onboardingcount['bigtickets'].data.push(ticketdata);
              this.bigData = this.onboardingcount['bigtickets'].data;
            }
          } else if (ticketdata['status']?.status.toLowerCase() == 'closed' && ticketdata['status']?.date?.toDate() >= currentMonth1st) {
            if (ticketdata['category'] == 'Events & Process') {
              this.onboardingcount['eventticketsclosed'].count++;
              this.onboardingcount['eventticketsclosed'].data.push(ticketdata);
              this.eventsDataClosed = this.onboardingcount['eventticketsclosed'].data;
            } else if (ticketdata['category'] == 'Journey Related') {
              this.onboardingcount['journeyticketsclosed'].count++;
              this.onboardingcount['journeyticketsclosed'].data.push(ticketdata);
              this.journeyDataClosed = this.onboardingcount['journeyticketsclosed'].data;
            } else if (ticketdata['category'] == 'Downgrade, Cancellation & Exceptions') {
              this.onboardingcount['cancellationticketsclosed'].count++;
              this.onboardingcount['cancellationticketsclosed'].data.push(ticketdata);
              this.cancellationDataClosed = this.onboardingcount['cancellationticketsclosed'].data;
            } else if (ticketdata['category'] == 'B!G Support ') {
              this.onboardingcount['bigticketsclosed'].count++;
              this.onboardingcount['bigticketsclosed'].data.push(ticketdata);
              this.bigDataClosed = this.onboardingcount['bigticketsclosed'].data;
            }
          }
        }
      }
    })

    getDocs(query(collection(this.firestore, 'participantdashboard'), where('customerstatus', '!=', 'discontinued'))).then(res => {

      for (let i = 0; i < res.docs.length; i++) {
        const element = res.docs[i].data();
        this.totalPaidMap[element['profileid']] = element;

        const subscriptionEndDate = ![null, undefined, ''].includes(element['subscriptionend']) ? element['subscriptionend'] : null;

        if (![null, undefined].includes(element['productcount'])) {
          this.totalproductCount = Object.values((element['productcount']) as number[]).reduce((acc, value) => acc + value, 0);
          element['participantproductcount'] = this.totalproductCount
          element['queryCount'] = this.issueCounts[element['profileid']] || 0;
          element['generalnotes'] = [null, undefined, ''].includes(this.mapMetadata[element['profileid']]) ? [] : (this.mapMetadata[element['profileid']]['generalnotes'] ?? [])
        }

        if (![null, undefined].includes(this.mapMetadata[element['profileid']]?.['journeycoachtouchpoint'])) {
          element['lasttouchpoint'] = [null, undefined, ''].includes(this.mapMetadata[element['profileid']]?.['journeycoachtouchpoint']) ? {} : this.mapMetadata[element['profileid']]?.['journeycoachtouchpoint'];
        }

        const isSubscriptionActive = subscriptionEndDate && subscriptionEndDate.toDate() > new Date();
        const isSubscriptionInActive = subscriptionEndDate && subscriptionEndDate.toDate() < new Date();

        if (![null, undefined].includes(this.mapMetadata[element['profileid']]?.['journeycoachtouchpoint']?.['activitydate'])) {
          let lasttouchpointDate = this.mapMetadata[element['profileid']]?.['journeycoachtouchpoint']?.['activitydate'].toDate();
          const monthsSinceLastTouchPoint = this.getMonthDifference(lasttouchpointDate, this.currentDate);

          let category;
          if ([null, undefined].includes(monthsSinceLastTouchPoint)) {
            category = 'disappear';
          } else if (monthsSinceLastTouchPoint >= 5) {
            category = 'disappear';
          } else if (monthsSinceLastTouchPoint === 4) {
            category = 'minimal';
          } else if (monthsSinceLastTouchPoint === 3) {
            category = 'average';
          } else if (monthsSinceLastTouchPoint === 2) {
            category = 'optimal';
          } else {
            category = 'superoptimal';
          }

          if (isSubscriptionActive) {
            if (['disappear', 'minimal', 'average', 'optimal', 'superoptimal'].includes(category)) {
              this.onboardingcount[category].data.push(element);
              this.onboardingcount[category].count++;
              this[`${category}Data`] = this.onboardingcount[category].data;
            }
          }

          if (isSubscriptionInActive) {
            const inactiveSuffix = 'In';
            const categoryWithSuffix = category + inactiveSuffix;
            this.onboardingcount[categoryWithSuffix]['data'].push(element);
            this.onboardingcount[categoryWithSuffix]['count']++;
            if (this.journey && this.journey !== 'all') {
              this.onboardingcount[categoryWithSuffix].data = this.onboardingcount[categoryWithSuffix].data.filter(j => j['activejourney'] === this.mapjourneyname[this.journey] || j['lastcompletedjourney'] === this.mapjourneyname[this.journey]);
            }
          }
        }
        if (subscriptionEndDate && subscriptionEndDate.toDate().getMonth() + 1 === this.currentMonth.getMonth() + 1 && subscriptionEndDate.toDate().getFullYear() === this.currentMonth.getFullYear()) {
          this.onboardingcount['currentMonth']['count']++;
          this.onboardingcount['currentMonth']['data'].push(element);
          this.currentMonthData = this.onboardingcount['currentMonth']['data'];
        } else if (subscriptionEndDate && subscriptionEndDate.toDate().getMonth() + 1 === this.lastMonth.getMonth() + 1 && subscriptionEndDate.toDate().getFullYear() === this.lastMonth.getFullYear()) {
          this.onboardingcount['lastMonth']['count']++;
          this.onboardingcount['lastMonth']['data'].push(element);
          this.lastMonthData = this.onboardingcount['lastMonth']['data'];
        } else if (subscriptionEndDate && subscriptionEndDate.toDate().getMonth() + 1 === this.nextMonth.getMonth() + 1 && subscriptionEndDate.toDate().getFullYear() === this.nextMonth.getFullYear()) {
          this.onboardingcount['nextMonth']['count']++;
          this.onboardingcount['nextMonth']['data'].push(element);
          this.nextMonthData = this.onboardingcount['nextMonth']['data'];
        } else {
          if (this.currentDate < (subscriptionEndDate && subscriptionEndDate.toDate())) {
            element['subscriptionend'] = ['', null, undefined].includes(element['subscriptionend']) ? null : element['subscriptionend']
            this.journeycompletedParticipants.push(element)
          }
        }
      }
    });
  }

  ngOnInit(): void {
    this.fetchData();
    this.dataSource.data = this.onboardingcount[this.activeSection].data
    this.filterForm.valueChanges.subscribe(() => {
      this.applyFilter();
    });
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    this.onboardedStartDate = new Date(currentYear, currentMonth, 1);
    this.onboardedEndDate = new Date(currentYear, currentMonth + 1, 0);
  }

  getMonthDifference(lasttouchpointDate: Date, currentDate: Date): number {
    const yearDiff = currentDate.getFullYear() - lasttouchpointDate.getFullYear();
    const monthDiff = currentDate.getMonth() - lasttouchpointDate.getMonth();
    return yearDiff * 12 + monthDiff;
  }


  filterData(journeyType: string) {
    if (this.onboardingcount[journeyType]) {
      console.log(this.onboardingcount[journeyType], 'journeytype');

      this.dataSource.data = this.onboardingcount[journeyType].data;
    } else {
      console.log(this.activeSection, 'this.activeSection');

      this.dataSource.data = this.onboardingcount[this.activeSection].data
    }
  }

  onEngagementCategoryChange(value: string) {
    this.selectedEngagementCategory = value;
  }

  updateMonthLabels() {
    this.currentMonth = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
    this.lastMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.nextMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
  }

  enachDays(timestamp1) {
    let difference;
    if (![null, undefined, ''].includes(timestamp1)) {
      const date1 = new Date()
      const date2 = timestamp1.toDate();

      const diffTime = Math.abs(date2.getTime() - date1.getTime());

      difference = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } else {
      difference = '';
    }
    return difference;
  }

  toggleSection(section: string) {
    console.log('Toggling section:', section);
    if (this.activeSection === section) {
      this.activeSection = section;
    } else {

      this.activeSection = section;
      if (section === 'all' || section === 'last15daysnotOnboarded' || section === 'last7to15notOnboarded' || section === 'last7DaysnotOnboarded') {
        this.displayedColumns = this.waitingForOnboardingColumns;
      } else if (section === 'minimumpaymentdue') {

        this.filterForm.controls['dateStart'].setValue(null);
        this.filterForm.controls['dateEnd'].setValue(null);

        this.displayedColumns = this.minimumpaymentdueColumns;

      } else if (section === 'lessthan30daysjourneynotstarted' || section === 'alljourneynotstarted' || section === 'morethan30daysjourneynotstarted') {

        this.displayedColumns = this.journeynotstartedColumns;

        this.filterForm.controls['dateStart'].setValue(null);
        this.filterForm.controls['dateEnd'].setValue(null);

      } else if (section === 'disappear' || section === 'minimal' || section === 'average' || section === 'optimal' || section === 'superoptimal' || section === 'disappearIn' || section === 'minimalIn' || section === 'averageIn' || section === 'optimalIn' || section === 'superoptimalIn' || section === 'currentMonth' || section === 'lastMonth' || section === 'nextMonth') {

        this.displayedColumns = this.engagementlevelColumns;

        this.filterForm.controls['dateStart'].setValue(null);
        this.filterForm.controls['dateEnd'].setValue(null);

      } else if (section == 'grosssale' || section == 'assuredsale' || section == 'journeycancelled') {

        this.displayedColumns = this.salesDisplayedColumns;

      } else {

        this.displayedColumns = this.defaultDisplayedColumns;

      }
      this.updateTable(section);
    }
    this.applyFilter();
  }

  // function to calculate active time for ticket that is opened 
  calculateDaysAgo(fromDate, toDate) {
    const daysDiff = Math.floor((fromDate?.getTime() - toDate?.getTime()) / (1000 * 3600 * 24));
    return daysDiff.toString() == '-1' ? 0 : daysDiff;
  }

  async fetchData() {
    this.loading = true
    this.currentMonth = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
    this.lastMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.nextMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    currentMonthEnd.setHours(23, 59, 59, 999);

    currentMonthStart.setTime(currentMonthStart.getTime() + (5 * 60 + 30) * 60 * 1000);
    currentMonthEnd.setTime(currentMonthEnd.getTime() + (5 * 60 + 30) * 60 * 1000);

    let startdate = Timestamp.fromDate(currentMonthStart).toDate();
    let enddate = Timestamp.fromDate(currentMonthEnd).toDate();

    this.ecosystemJourneys = [];
    await getDocs(collection(this.firestore, 'journey')).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapjourneyname[element['id']] = element;
        if (element['type'] == 'Eco system') {
          this.ecosystemJourneys.push(element);
        }
      }
    });

    this.ecosystemJourneys.push({ id: 'all', journey: 'All' });

    // calculate Date Range
    const currentDate = new Date();
    // last 7 days
    let last7days = new Date();
    last7days.setDate(currentDate.getDate() - 7);

    // last 30days 
    let last30days = new Date();
    last30days.setDate(currentDate.getDate() - 30);

    // 7to15 days
    let sevento15days = new Date();
    sevento15days.setDate(currentDate.getDate() - 15);

    // 15 days
    let fifteendays = new Date();
    fifteendays.setDate(currentDate.getDate() - 15);
    var paymentplan = ['bulk', 'enach', 'enach-icici', 'enach-axis', 'manual', 'fully paid', 'pdc', 'razorpay']

    collectionData(query(collection(this.firestore, 'participantjourneyproduct'))).pipe(takeUntil(this.subscriptionHandle)).subscribe(async (res) => {
      const participantProductIds = res.map(j => this.mapMetadata[j['profileid']]?.minimumpayment !== undefined && j['onboarded'] === true ? j['profileid'] : null).filter(id => id !== null);

      const participantProductData = await Promise.all(
        participantProductIds.map(id => getDocs(query(collection(this.firestore, 'participantsproduct'), where('profileid', '==', id), orderBy('sequenceorder', 'asc'), limit(1))))
      );

      const productDataMap = {};
      participantProductData.forEach((docSnap, index) => {
        if (!docSnap.empty) {
          docSnap.forEach(doc => {
            const productData = doc.data();
            this.mapfirstProduct[productData['profileid']] = productData;
            productDataMap[participantProductIds[index]] = productData; this.onboardingcount['minimumpaymentdue'].data
          });
        } else {
          console.warn(`No product data found for profile ID: ${participantProductIds[index]}`);
        }
      });

      this.onboardingcount['last7DaysnotOnboarded'].count = 0,
        this.onboardingcount['last7DaysnotOnboarded'].data = [],
        this.onboardingcount['last7to15notOnboarded'].count = 0,
        this.onboardingcount['last7to15notOnboarded'].data = [],
        this.onboardingcount['last15daysnotOnboarded'].count = 0,
        this.onboardingcount['last15daysnotOnboarded'].data = [],
        this.onboardingcount['onboarded'].count = 0,
        this.onboardingcount['onboarded'].data = [],
        this.onboardingcount['minimumpaymentdue'].count = 0,
        this.onboardingcount['minimumpaymentdue'].data = [],
        this.onboardingcount['lessthan30daysjourneynotstarted'].count = 0
      this.onboardingcount['lessthan30daysjourneynotstarted'].data = []
      this.onboardingcount['last7to15journeynotstarted'].count = 0
      this.onboardingcount['last7to15journeynotstarted'].data = []
      this.onboardingcount['morethan30daysjourneynotstarted'].count = 0
      this.onboardingcount['morethan30daysjourneynotstarted'].data = []
      this.onboardingcount['regularstatus'].count = 0
      this.onboardingcount['regularstatus'].data = []
      this.onboardingcount['missedstatus'].count = 0
      this.onboardingcount['missedstatus'].data = []
      this.onboardingcount['defaultedstatus'].count = 0
      this.onboardingcount['defaultedstatus'].data = []
      this.onboardingcount['lockedstatus'].count = 0
      this.onboardingcount['lockedstatus'].data = []
      this.onboardingcount['fullypaidstatus'].count = 0
      this.onboardingcount['fullypaidstatus'].data = []
      this.onboardingcount['journeycancelled'].count = 0
      this.onboardingcount['journeycancelled'].data = []
      this.onboardingcount['notassured'].count = 0
      this.onboardingcount['notassured'].data = []

      for (let i = 0; i < res.length; i++) {
        const journey = res[i];

        // this.notAssuredData = allData.filter((e) => {
        //   return [null, undefined, ""].includes(e['paymentplan']);
        // });

        if ([null, undefined, ""].includes(journey['paymentplan']) && journey['journeystatus'] != 'cancelled' && journey['purchasedate']?.toDate() >= new Date('2025-01-01') && !this.mapProfileData[journey['profileid']]['email'].includes("soexcellence.com")) {
          this.onboardingcount['notassured'].data.push(journey);
          this.onboardingcount['notassured'].count++;
        }

        if (journey['journeystatus'] == 'cancelled' && journey['purchasedate']?.toDate() >= new Date('2025-01-01')) {
          this.onboardingcount['journeycancelled']['count']++;
          this.onboardingcount['journeycancelled'].data.push(journey);
          this.journeyCancelledData = this.onboardingcount['journeycancelled'].data;
          this.currentJourneyCancelled = this.journeyCancelledData.filter((e) => e['purchasedate']?.toDate() >= startdate && e['purchasedate']?.toDate() <= enddate).length;
        }

        if (journey['journeyref']?.id != 'InLXMl7OBAqlDTZcXwK0' && [null, 'ongoing', 'initiated', 'completed'].includes(journey['journeystatus'])) {
          if (![null, undefined, ""].includes(this.mapMetadata[journey['profileid']]) && ![null, undefined, ""].includes(this.mapMetadata[journey['profileid']]['financedata'])) {
            const mapData = this.mapMetadata[journey['profileid']];
            if (['newpayment', 'schedule'].includes(mapData['financedata']['status'])) {
              if ((mapData['pp_totalpurchasevalue'] - mapData['pp_totalpaid']) < 100) {
                this.onboardingcount['fullypaidstatus']['count']++;
                this.onboardingcount['fullypaidstatus'].data.push(journey);
                this.fullyPaidData = this.onboardingcount['fullypaidstatus'].data;
              } else if (mapData['financedata']['status'] == 'schedule' && ['ongoing', 'initiated', 'completed'].includes(journey['journeystatus'])) {
                if (mapData['financialstatus'] == 'regular') {
                  this.onboardingcount['regularstatus']['count']++;
                  this.onboardingcount['regularstatus'].data.push(journey);
                  this.regularStatusData = this.onboardingcount['regularstatus'].data;

                  if (mapData['financedata']['paymentstatus'] == 'missed') {
                    this.onboardingcount['missedstatus']['count']++;
                    this.onboardingcount['missedstatus'].data.push(journey);
                    this.missedStatusData = this.onboardingcount['missedstatus'].data;
                  }
                } else if (mapData['financialstatus'] == 'defaulted') {
                  this.onboardingcount['defaultedstatus']['count']++;
                  this.onboardingcount['defaultedstatus'].data.push(journey);
                  this.defaultedStatusData = this.onboardingcount['defaultedstatus'].data;

                  if (mapData['financedata']['paymentstatus'] == 'missed') {
                    this.onboardingcount['missedstatus']['count']++;
                    this.onboardingcount['missedstatus'].data.push(journey);
                    this.missedStatusData = this.onboardingcount['missedstatus'].data;
                  }
                } else if (mapData['financialstatus'] == 'locked') {
                  this.onboardingcount['lockedstatus']['count']++;
                  this.onboardingcount['lockedstatus'].data.push(journey);
                  this.lockedStatusData = this.onboardingcount['lockedstatus'].data;
                }
              }
            }
          }
        }

        if (([null, undefined, ""].includes(journey['journeyref']) || journey['journeyref'].id != 'InLXMl7OBAqlDTZcXwK0') && [null, 'ongoing', 'initiated'].includes(journey['journeystatus'])) {
          if (![null, undefined, '', false].includes(journey['onboarded']) && ![null, undefined, ""].includes(journey['onboardedtime'])) {
            const onboardedDate = journey['onboardedtime'].toDate();
            if (onboardedDate >= this.onboardedStartDate &&
              onboardedDate <= this.onboardedEndDate) {

              this.onboardingcount['onboarded'].count++;
              this.onboardingcount['onboarded'].data.push(journey);
            }

            this.onboardedData = this.onboardingcount['onboarded'].data;
          }

          journey['generalnotes'] = [null, undefined, ''].includes(this.mapMetadata[journey['profileid']]) ? [] : (this.mapMetadata[journey['profileid']]['generalnotes'] || [])
          // if(journey['journeyref'] != null){
          journey['queryCount'] = this.issueCounts[journey['profileid']] || 0;

          if (![null, undefined].includes(journey['purchasedate']) && journey['purchasedate'].toDate() >= last7days && journey['onboarded'] === false && paymentplan.includes(journey['paymentplan'])) {
            journey['customerstatus'] = [null, undefined, ''].includes(this.totalPaidMap[journey['profileid']]) ? 'No status' : (this.totalPaidMap[journey['profileid']]?.['customerstatus'] ?? 'No Status');
            journey['name'] = this.mapprofile[journey['profileid']]
            this.onboardingcount['last7DaysnotOnboarded'].count++;
            this.onboardingcount['last7DaysnotOnboarded'].data.push(journey);
            this.last7DaysnotOnboardedData = this.onboardingcount['last7DaysnotOnboarded'].data;
          }
          else if (![null, undefined].includes(journey['purchasedate']) && journey['purchasedate'].toDate() < last7days && journey['onboarded'] === false && paymentplan.includes(journey['paymentplan'])) {
            journey['customerstatus'] = [null, undefined, ''].includes(this.totalPaidMap[journey['profileid']]) ? 'No status' : (this.totalPaidMap[journey['profileid']]?.['customerstatus'] ?? 'No status');
            journey['name'] = this.mapprofile[journey['profileid']]
            this.onboardingcount['last15daysnotOnboarded'].count++;
            this.onboardingcount['last15daysnotOnboarded'].data.push(journey);
            this.last15daysnotOnboardedData = this.onboardingcount['last15daysnotOnboarded'].data
          }

          this.onboardingcount['all'].data = [...(this.onboardingcount['last15daysnotOnboarded']?.data || []), ...(this.onboardingcount['last7to15notOnboarded']?.data || []), ...(this.onboardingcount['last7DaysnotOnboarded']?.data || [])]

          if (journey['onboarded'] == true && this.mapMetadata[journey['profileid']]?.['activeproduct']?.length == 0 && journey['purchasedate']?.toDate() >= new Date('2025-01-01')) {
            if (journey['purchasedate']?.toDate() >= last30days) {
              this.onboardingcount['lessthan30daysjourneynotstarted'].count++;
              this.onboardingcount['lessthan30daysjourneynotstarted'].data.push(journey);
              this.lessthan30daysjourneynotstartedData = this.onboardingcount['lessthan30daysjourneynotstarted'].data
            } else {
              this.onboardingcount['morethan30daysjourneynotstarted'].count++;
              this.onboardingcount['morethan30daysjourneynotstarted'].data.push(journey);
              this.morethan30daysjourneynotstartedData = this.onboardingcount['morethan30daysjourneynotstarted'].data
            }
          }

          // if (this.mapMetadata[journey['profileid']]?.minimumpayment !== undefined) {

          //   const totalPaid = parseInt(this.totalPaidMap[journey['profileid']] ? this.totalPaidMap[journey['profileid']].pp_totalpaid : 0) || 0;
          //   journey['totalPaid'] = totalPaid;
          //   journey['name'] = this.mapprofile[journey['profileid']]

          //   if (journey['onboarded'] === true && this.mapMetadata[journey['profileid']]['minimumpayment'] > totalPaid && this.mapMetadata[journey['profileid']]['minimumpayment'] !== 0) {

          //     const firstproduct = this.mapfirstProduct[journey['profileid']]
          //     journey['firstproductname'] = firstproduct.productref.id;
          //     journey['tentativestart'] = firstproduct.tentativestart?.toDate() ?? null;
          //     journey['firstproductminimumpayment'] = this.mapMetadata[journey['profileid']]['minimumpayment']
          //     journey['financialstatus'] = this.mapMetadata[journey['profileid']]['financialstatus']
          //     this.onboardingcount['minimumpaymentdue'].count++;
          //     this.onboardingcount['minimumpaymentdue'].data.push(journey);
          //     this.minimumpaymentdueData = this.onboardingcount['minimumpaymentdue'].data

          //   } else if (journey['onboarded'] === true && this.mapMetadata[journey['profileid']]['minimumpayment'] <= totalPaid && this.mapMetadata[journey['profileid']]['minimumpayment'] !== 0) {

          //     const firstproduct = this.mapfirstProduct[journey['profileid']]
          //     journey['firstproductname'] = firstproduct.productref.id;
          //     journey['tentativestart'] = firstproduct.tentativestart?.toDate();
          //     journey['firstproductminimumpayment'] = this.mapMetadata[journey['profileid']]['minimumpayment']
          //     journey['financialstatus'] = this.mapMetadata[journey['profileid']]['financialstatus']
          //     if (this.totalPaidMap[journey['profileid']].lastpaymentdate.toDate() >= last30days && firstproduct.status === null) {
          //       this.onboardingcount['lessthan30daysjourneynotstarted'].count++;
          //       this.onboardingcount['lessthan30daysjourneynotstarted'].data.push(journey);
          //       this.lessthan30daysjourneynotstartedData = this.onboardingcount['lessthan30daysjourneynotstarted'].data
          //     } else if (this.totalPaidMap[journey['profileid']].lastpaymentdate.toDate() < last30days && firstproduct.status === null) {
          //       journey['financialstatus'] = this.mapMetadata[journey['profileid']]['financialstatus']
          //       this.onboardingcount['morethan30daysjourneynotstarted'].count++;
          //       this.onboardingcount['morethan30daysjourneynotstarted'].data.push(journey);
          //       this.morethan30daysjourneynotstartedData = this.onboardingcount['morethan30daysjourneynotstarted'].data
          //     }

          //   }
          // }

          this.onboardingcount['alljourneynotstarted'].data = [...(this.onboardingcount['lessthan30daysjourneynotstarted']?.data || []), ...(this.onboardingcount['last7to15journeynotstarted']?.data || []), ...(this.onboardingcount['morethan30daysjourneynotstarted']?.data || [])]
        }
      }
      console.log('checking......');
      this.updateTable(this.activeSection)

    });

    this.loading = false
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  };

  ngOnDestroy() {
    for (const key in this.subscription) {
      if (this.subscription[key]) {
        this.subscription[key].unsubscribe();
      }
    }
  };

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

  // function to close popup after removing mouse pointer 
  hidePopup() {
    this.popupData = null;
  }

  getHeaderBackground() {
    switch (this.activeSection) {
      case 'last7daysonboarding': return '#99cc99';
      case 'sevenToFifteen': return '#ffcc66';
      case 'moreThan15Days': return '#ffcccc';
      case 'paymentDue': return '#66ccff';
      default: return '#ffffff';
    }
  }

  async updateTable(section: string = 'all', skipFilterApply: boolean = false) {
    console.log('tableworking...');
    this.loading = true;

    const sectionKey = this.onboardingcount[section] ? section : 'all';

    if (section === 'last15daysnotOnboarded') {
      this.dataSource.data = [
        ...(this.onboardingcount['last15daysnotOnboarded']?.data || []),
        ...(this.onboardingcount['last7to15notOnboarded']?.data || [])
      ];
    } else {
      this.dataSource.data = this.onboardingcount[sectionKey]?.data || [];
    }

    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // Only apply filter if not skipped (to prevent recursion)
    if (!skipFilterApply) {
      this.applyFilter();
    }

    this.loading = false;
  }

  applyFilter() {
    const formValues = this.filterForm.value;

    // Ensure activeSection exists in onboardingcount
    if (!this.onboardingcount[this.activeSection] || !this.onboardingcount[this.activeSection]['data']) {
      console.warn(`No data found for section: ${this.activeSection}`);
      this.dataSource.data = [];
      return;
    }

    const filteredResults = this.onboardingcount[this.activeSection]['data'].map(data => {
      let isMatch = true;

      // Check for New Sales and Upgrade filters
      if (formValues.new || formValues.upgrade) {
        const journeyType = data['journeytype'];

        if (formValues.new && formValues.upgrade) {
          isMatch = isMatch && (journeyType === 'new' || journeyType === 'upgrade');
        } else {
          if (formValues.new && journeyType !== 'new') {
            isMatch = false;
          }
          if (formValues.upgrade && journeyType !== 'upgrade') {
            isMatch = false;
          }
        }
      }

      if (formValues && formValues.dateStart && formValues.dateEnd && ![null, undefined].includes(data.purchasedate)) {
        const purchaseDate = data.purchasedate instanceof Date ? data.purchasedate : new Date(data.purchasedate.toDate());

        const startDate = formValues.dateStart ? new Date(formValues.dateStart) : null;
        const endDate = formValues.dateEnd ? new Date(formValues.dateEnd) : null;

        if (startDate && endDate && purchaseDate) {
          startDate.setHours(0, 0, 0, 0);
          endDate.setHours(23, 59, 59, 999);

          startDate.setTime(startDate.getTime() + (5 * 60 + 30) * 60 * 1000);
          endDate.setTime(endDate.getTime() + (5 * 60 + 30) * 60 * 1000);
          let startdate = Timestamp.fromDate(startDate).toDate();
          let enddate = Timestamp.fromDate(endDate).toDate();
          isMatch = isMatch && purchaseDate >= startdate && purchaseDate <= enddate;
        }
      }

      const searchTerm = formValues.name ? formValues.name.trim().toLowerCase() : '';
      const name = this.mapprofile[data['profileid']] ? this.mapprofile[data['profileid']] : '';

      if (searchTerm && name) {
        isMatch = isMatch && name.toLowerCase().includes(searchTerm);
      }

      if (formValues.DFU) {
        isMatch = isMatch && this.mapjourneyname[data.journeyref?.id]?.type === 'DFU';
      }

      if (formValues.journey && formValues.journey.length > 0 && !['all'].includes(formValues.journey)) {
        if (![null, undefined, ''].includes(data.journeyref)) {
          isMatch = isMatch && formValues.journey == data.journeyref.id;

          // Store the journey but don't call journeyFilter here
          if (this.journey !== formValues.journey) {
            this.journey = formValues.journey;
            // We'll handle journeyFilter separately
          }
        } else {
          isMatch = false;
        }
      }

      if (![null, undefined, ''].includes(formValues.journeycoach)) {
        if (![null, undefined, ''].includes(data.appointmentid) && ![null, undefined, ''].includes(this.mapAppointments[data.appointmentid])) {

          let hosts = this.mapAppointments[data.appointmentid].map((e: any) => e.id);

          isMatch = isMatch && hosts.includes(formValues.journeycoach)
        } else {
          isMatch = false;
        }
      }

      return isMatch ? data : null;
    });

    this.dataSource.data = filteredResults.filter(result => result !== null);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  async resetFilters() {
    this.journey = null;
    this.filterForm.reset({
      new: false,
      upgrade: false,
      name: '',
      DFU: false,
      Ecosystem: false,
      journey: null,
      dateStart: null,
      dateEnd: null,
      journeycoach: null,
    });
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    this.onboardedStartDate = new Date(currentYear, currentMonth, 1);
    this.onboardedEndDate = new Date(currentYear, currentMonth + 1, 0);
    this.dataSource.data = this.onboardingcount[this.activeSection]['data'];
    await this.journeyFilter();
  }

  async journeyFilter() {
    if (this.journey && this.journey != 'all') {
      // Save original data before filtering if not already saved
      if (!this.originalData) {
        this.originalData = { ...this.onboardingcount };
      }

      // Filter all data sections
      this.onboardingcount['disappear'].data = this.disappearData.filter(j => {
        j['activejourney'] = ![null, undefined].includes(j['activejourney']) ? j['activejourney'] : j['lastcompletedjourney'];
        return j['activejourney'] === this.mapjourneyname[this.journey];
      });

      this.onboardingcount['minimal'].data = this.minimalData.filter(j => {
        j['activejourney'] = ![null, undefined].includes(j['activejourney']) ? j['activejourney'] : j['lastcompletedjourney'];
        return j['activejourney'] === this.mapjourneyname[this.journey]['journey'];
      });

      this.onboardingcount['average'].data = this.averageData.filter(j => {
        j['activejourney'] = ![null, undefined].includes(j['activejourney']) ? j['activejourney'] : j['lastcompletedjourney'];
        return j['activejourney'] === this.mapjourneyname[this.journey]['journey'];
      });

      this.onboardingcount['optimal'].data = this.optimalData.filter(j => {
        j['activejourney'] = ![null, undefined].includes(j['activejourney']) ? j['activejourney'] : j['lastcompletedjourney'];
        return j['activejourney'] === this.mapjourneyname[this.journey]['journey'];
      });

      this.onboardingcount['superoptimal'].data = this.superoptimalData.filter(j => {
        j['activejourney'] = ![null, undefined].includes(j['activejourney']) ? j['activejourney'] : j['lastcompletedjourney'];
        return j['activejourney'] === this.mapjourneyname[this.journey]['journey'];
      });

      this.onboardingcount['currentMonth'].data = this.currentMonthData.filter(j =>
        j['activejourney'] == this.mapjourneyname[this.journey]['journey'] ||
        j['lastcompletedjourney'] == this.mapjourneyname[this.journey]['journey']
      );

      this.onboardingcount['lastMonth'].data = this.lastMonthData.filter(j => {
        j['activejourney'] = ![null, undefined].includes(j['activejourney']) ? j['activejourney'] : j['lastcompletedjourney'];
        return j['activejourney'] === this.mapjourneyname[this.journey]['journey'];
      });

      this.onboardingcount['nextMonth'].data = this.nextMonthData.filter(j => {
        j['activejourney'] = ![null, undefined].includes(j['activejourney']) ? j['activejourney'] : j['lastcompletedjourney'];
        return j['activejourney'] === this.mapjourneyname[this.journey]['journey'];
      });

      this.onboardingcount['grosssale'].data = this.grossSale.filter((e) =>
        ![null, undefined, ''].includes(e['journey']) ? (e['journey'].id == this.journey) : false
      );

      this.onboardingcount['assuredsale'].data = this.assuredSale.filter((e) =>
        e['journey'] && e['journey'].id == this.journey
      );

      this.onboardingcount['notassured'].data = this.notAssuredData.filter((e) =>
        e['journey'] && e['journey'].id == this.journey
      );

      this.onboardingcount['last7DaysnotOnboarded'].data = this.last7DaysnotOnboardedData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['last15daysnotOnboarded'].data = this.last15daysnotOnboardedData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['minimumpaymentdue'].data = this.minimumpaymentdueData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['lessthan30daysjourneynotstarted'].data = this.lessthan30daysjourneynotstartedData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['morethan30daysjourneynotstarted'].data = this.morethan30daysjourneynotstartedData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['onboarded'].data = this.onboardedData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['regularstatus'].data = this.regularStatusData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['missedstatus'].data = this.missedStatusData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['defaultedstatus'].data = this.defaultedStatusData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['lockedstatus'].data = this.lockedStatusData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['fullypaidstatus'].data = this.fullyPaidData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['journeycancelled'].data = this.journeyCancelledData.filter(j =>
        j['journeyref'] && j['journeyref'].id == this.journey
      );

      this.onboardingcount['eventtickets'].data = this.eventsData;
      this.onboardingcount['journeytickets'].data = this.journeyData;
      this.onboardingcount['cancellationtickets'].data = this.cancellationData;
      this.onboardingcount['bigtickets'].data = this.bigData;

      this.onboardingcount['eventticketsclosed'].data = this.eventsDataClosed;
      this.onboardingcount['journeyticketsclosed'].data = this.journeyDataClosed;
      this.onboardingcount['cancellationticketsclosed'].data = this.cancellationDataClosed;
      this.onboardingcount['bigticketsclosed'].data = this.bigDataClosed;

      this.onboardingcount['alljourneynotstarted'].data = [
        ...(this.onboardingcount['lessthan30daysjourneynotstarted'].data || []),
        ...(this.onboardingcount['morethan30daysjourneynotstarted'].data || [])
      ];

      this.onboardingcount['all'].data = [
        ...(this.onboardingcount['last7DaysnotOnboarded'].data || []),
        ...(this.onboardingcount['last15daysnotOnboarded'].data || [])
      ];

      // Call updateTable with skipFilterApply=true to avoid recursion
      await this.updateTable(this.activeSection, true);
    } else {
      // Restore original data if available, otherwise use stored data
      if (this.originalData) {
        this.onboardingcount = { ...this.originalData };
        this.originalData = null;
      } else {
        this.onboardingcount['grosssale'].data = this.grossSale;
        this.onboardingcount['assuredsale'].data = this.assuredSale;
        this.onboardingcount['disappear'].data = this.disappearData;
        this.onboardingcount['minimal'].data = this.minimalData;
        this.onboardingcount['average'].data = this.averageData;
        this.onboardingcount['optimal'].data = this.optimalData;
        this.onboardingcount['superoptimal'].data = this.superoptimalData;
        this.onboardingcount['lastMonth'].data = this.lastMonthData;
        this.onboardingcount['currentMonth'].data = this.currentMonthData;
        this.onboardingcount['nextMonth'].data = this.nextMonthData;
        this.onboardingcount['last7DaysnotOnboarded'].data = this.last7DaysnotOnboardedData;
        this.onboardingcount['last15daysnotOnboarded'].data = this.last15daysnotOnboardedData;
        this.onboardingcount['minimumpaymentdue'].data = this.minimumpaymentdueData;
        this.onboardingcount['lessthan30daysjourneynotstarted'].data = this.lessthan30daysjourneynotstartedData;
        this.onboardingcount['morethan30daysjourneynotstarted'].data = this.morethan30daysjourneynotstartedData;
        this.onboardingcount['onboarded'].data = this.onboardedData;
        this.onboardingcount['regularstatus'].data = this.regularStatusData;
        this.onboardingcount['missedstatus'].data = this.missedStatusData;
        this.onboardingcount['defaultedstatus'].data = this.defaultedStatusData;
        this.onboardingcount['lockedstatus'].data = this.lockedStatusData;
        this.onboardingcount['fullypaidstatus'].data = this.fullyPaidData;
        this.onboardingcount['eventtickets'].data = this.eventsData;
        this.onboardingcount['journeytickets'].data = this.journeyData;
        this.onboardingcount['cancellationtickets'].data = this.cancellationData;
        this.onboardingcount['bigtickets'].data = this.bigData;
        this.onboardingcount['notassured'].data = this.notAssuredData;
        this.onboardingcount['eventticketsclosed'].data = this.eventsDataClosed;
        this.onboardingcount['journeyticketsclosed'].data = this.journeyDataClosed;
        this.onboardingcount['cancellationticketsclosed'].data = this.cancellationDataClosed;
        this.onboardingcount['bigticketsclosed'].data = this.bigDataClosed;
        this.onboardingcount['journeycancelled'].data = this.journeyCancelledData;
        this.onboardingcount['alljourneynotstarted'].data = [
          ...(this.onboardingcount['lessthan30daysjourneynotstarted'].data || []),
          ...(this.onboardingcount['morethan30daysjourneynotstarted'].data || [])
        ];
        this.onboardingcount['all'].data = [
          ...(this.onboardingcount['last7DaysnotOnboarded'].data || []),
          ...(this.onboardingcount['last15daysnotOnboarded'].data || [])
        ];
      }

      // Call updateTable with skipFilterApply=true to avoid recursion
      await this.updateTable(this.activeSection, true);
    }
  }

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

  getStatusClass(status: string | null | undefined): string {
    if (!status || status === '') {
      return 'no-status';
    }

    // Convert status to lowercase to handle any capitalization variations
    const statusLower = status.toLowerCase();

    switch (statusLower) {
      case 'completed':
        return 'completed';
      case 'initiated':
        return 'initiated';
      case 'ongoing':
        return 'ongoing';
      case 'shifted':
        return 'shifted';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'no-status';
    }
  }

  getButtonClass(tentativeStart: Date): string {
    const now = new Date();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);

    if (tentativeStart < now) {
      return 'button-overdue';
    } else if (tentativeStart <= oneMonthFromNow) {
      return 'button-approaching';
    } else {
      return 'button-normal'; // for normal styling
    }
  }


  showjourney() {
    // this.filterForm.Ecosystem = !this.filter.Ecosystem 
  }

  openSchedule(element) {

    element['isReschedule'] = element['onboardingscheduled'] != null ? true : false;
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;
    element['mapPhone'] = this.mapphone;
    element['mapProducts'] = this.mapproducts;
    var dialogRef = this.dialog.open(ScheduleDialogComponent, {
      data: element,
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    });

    dialogRef.afterClosed().toPromise().then(value => {
      if (value != null) {

      }
    })
  }

  openProduct(element) {
    console.log(element);
    element['mapJourney'] = this.mapjourneyname
    element['mapProduct'] = this.mapproducts
    element['mapPackage'] = this.mapPackage
    var dialogRef = this.dialog.open(ProductDialogComponent, {
      data: element,
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    });
    dialogRef.afterClosed().toPromise().then(value => {
      if (value != null) { }
    })
  }

  openAppointmentstatus(element) {
    element['appointment'] = true;
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;
    element['mapPhone'] = this.mapphone;
    element['mapProducts'] = this.mapproducts;
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
    })
    firstValueFrom(dialogRef.afterClosed()).then(value => {
      // console.log(value);

      if (value != null) {
        console.log(value);
        if (value.attended == true) {
          updateDoc(doc(this.firestore, "appointments", element['appointmentid']), {
            attended: true,
          });
          updateDoc(doc(this.firestore, 'participantjourneyproduct', element['docid']), {
            orientationstatus: 'attended'
          })
        }
        if (value.attended == false) {
          updateDoc(doc(this.firestore, "appointments", element['appointmentid']), {
            cancelled: true,
          });
          updateDoc(doc(this.firestore, 'participantjourneyproduct', element['docid']), {
            onboardingscheduled: null
          })
        }
      }
    })
  }

  checkMarkOnboarding(element) {
    let disabled = false;

    if (element['onboardingscheduled'] && element['onboardingscheduled']?.toDate() < this.currentDate && ![null, undefined, ''].includes(element['appointmentid'])) {
      disabled = false;
    } else if (element['onboardingscheduled'] && element['onboardingscheduled']?.toDate() > this.currentDate && ![null, undefined, ''].includes(element['appointmentid'])) {
      disabled = true;
    }

    return disabled;
  }

  markOnboarded(element) {
    element['markonboard'] = true
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;
    element['mapPhone'] = this.mapphone;
    element['mapProducts'] = this.mapproducts;

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
      panelClass: 'fullscreen-dialog'
    })
    dialogRef.afterClosed().toPromise().then(async value => {
      delete value.salesleadsData;
      console.log(value);

      if (![null, undefined, ''].includes(value)) {
        const dialogRef = this.dialog.open(LoadingProgressComponent, {
          disableClose: true,
          data: { type: "spinner", msg: "Onboard Completing..." }
        });

        let salesdata = value.salesleadsData;

        delete value.salesleadsData;

        await updateDoc(doc(this.firestore, 'participantjourneyproduct', element['docid']), value);
        if (![null, undefined, ''].includes(value['appointmentid'])) {
          await updateDoc(doc(this.firestore, "appointments", element['appointmentid']), {
            attended: true,
            cancelled: false,
          }).then(() => {
            console.log("Onboard Marked Successfully");
            this.guard.openSnackBar("Onboard Marked Successfully", "OK");
          }).catch((error) => {
            console.error("Oops! Error while marking Onboard", error);
            this.guard.openSnackBar("Oops! Error while marking Onboard", "OK");
          });
        }

        // Updating Journey Status as Upgraded for previous Journey
        if (value['journeytype'] == 'upgrade' && ![null, undefined, ''].includes(salesdata)) {
          const previousJourneyID = salesdata['upgradefromparticipantjourneyproductid']
          await updateDoc(doc(this.firestore, 'participantjourneyproduct', previousJourneyID), {
            journeystatus: 'Upgraded'
          }).then(() => {
            console.log("Previous Journey Status Updated");
            this.guard.openSnackBar("Previous Journey Status Updated to Upgraded", "OK");
          }).catch((error) => {
            this.guard.openSnackBar("Oops Error While Updating Previous Journey Status", "OK");
            console.log("Oops Error While Updating Previous Journey Status")
          });
        }

        dialogRef.close();

      } else {
        this.guard.openSnackBar("No Action Taken", "OK")
      }
    })
  }

  addNotes(element) {

    element['addnotes'] = true;
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;
    element['mapPhone'] = this.mapphone;
    element['mapProducts'] = this.mapproducts;
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
        console.log(generalnotes);
        element['generalnotes'] = element['generalnotes'] || []
        element['generalnotes'].push(generalnotes)
        // this.firestore.collection('participantjourneyproduct').doc(element['docid']).update({
        //   generalnotes : element['generalnotes']
        // });
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

  viewNotes(element) {
    element['viewnotes'] = true;
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;
    element['mapPhone'] = this.mapphone;
    element['mapProducts'] = this.mapproducts;
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
      panelClass: 'custom-dialog-container'
    });
  }

  viewReport(element) {
    element['viewreport'] = true;
    element['mapProfile'] = this.mapprofile;
    element['mapJourney'] = this.mapjourneyname;
    element['mapPhone'] = this.mapphone;
    element['mapProducts'] = this.mapproducts;
    element['onboardedtime'] = element['onboardedtime'] || null

    if (element['markonboard']) {
      delete element['markonboard'];
    }
    if (element['viewnotes']) {
      delete element['viewnotes'];
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
      panelClass: 'custom-dialog-container'
    });
  }

  journeyonboared(element) {
    if (confirm("Sure, Do you want to mark Onboarded?")) {
      updateDoc(doc(this.firestore, 'participantjourneyproduct', element.docid), {
        onboarded: true,
        onboardedtime: serverTimestamp(),
        journeystatus: 'initiated',
        onboardedby: this.loggedInProfileId
      })
    }
  }

  openreshedule() {
    this.dialog.open(RescheduleDialogComponent, {
      autoFocus: false,
      data: {
        mapProfile: this.mapprofile,
        mapJourney: this.mapjourneyname,
        mapPhone: this.mapphone,
        mapProducts: this.mapproducts,
      },
      panelClass: 'custom-dialog-container'
    })

    //  this.router.navigateByUrl('/journeycoachreschedule')
  }

  opencompleted() {
    this.dialog.open(JourneycoachCompletedComponent, {
      autoFocus: false,
      data: {
        mapProfile: this.mapprofile,
        mapJourney: this.mapjourneyname,
        mapPhone: this.mapphone,
        mapProducts: this.mapproducts,
        completed: this.journeycompletedParticipants
      },
      panelClass: 'custom-dialog-container'
    })

  }

  async initiateProduct(element) {
    console.log(element);

    let initiationProductId = element['participantproducts'].find((e) => e['productref'].id == element['firstproductname']);
    console.log(initiationProductId);

    await getDoc(doc(this.firestore, "participantsproduct", initiationProductId['participantproductid'])).then(async (snap) => {
      if (snap.exists()) {
        if (snap.data()['status'] == null) {
          let check = confirm("Are you sure wnat to Initiate First Product");
          if (check) {
            await updateDoc(snap.ref, { status: 'initiated' }).then(() => {
              console.log('First Product Initiated Successfully');
            }).catch((error) => {
              console.error("Oops Error While Initiating First Product", error);
            });
          }
        } else {
          console.log("Product Status", snap.data()['status']);
        }
      } else {
        console.log("No Data Found");
      }
    })

  }

  navigatejourneyplan(element: any) {
    const profileId = element['profileid'];
    const docId = element['docid'];
    const url = this.router.createUrlTree(['/journeysupport', profileId], { queryParams: { pjpid: docId } }).toString();
    window.open(url, '_blank');
  }

  openopportunities() {
    this.dialog.open(JourneycoachOpportunitiesComponent, {
      data: {
        mapProfile: this.mapprofile,
        mapJourney: this.mapjourneyname,
        mapPhone: this.mapphone,
        metaData: this.mapMetadata
      },
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    });
  }

  isChecked(element: any): boolean {
    return element.orientationstatus === 'planning';
  }

  onToggleChange(event: MatSlideToggleChange, element: any) {
    if (event.checked) {

      this.previousorientationstatus = element.orientationstatus
      updateDoc(doc(this.firestore, 'participantjourneyproduct', element.docid), {
        previousorientationstatus: this.previousorientationstatus,
        orientationstatus: 'planning'
      }).then(() => {
        console.log('Document successfully updated!');
      }).catch((error) => {
        console.error('Error updating document: ', error);
      });
    } else {

      var dialogRef = this.dialog.open(JourneyplanDialogComponent, {
        data: element,
        autoFocus: false,
        width: '350px',
        height: '80%',
      })

      dialogRef.afterClosed().toPromise().then(value => {
        console.log(value);
        if (value != null) {
          updateDoc(doc(this.firestore, 'participantjourneyproduct', element.docid), value).then(() => {
            console.log('Document successfully updated to not planning!');
          }).catch((error) => {
            console.error('Error updating document: ', error);
          });
        }
      })
    }
  }

  async navigatetoTimeline(doc: any, engagementCategory) {
    const userResponse = confirm("Click 'Yes' if you want to view the Absolute timeline, or click 'Cancel' if you want to view the Relative timeline.");
    this.currentMonth = new Date();
    console.log("currentMonth", this.currentMonth);
    const fiveMonthsBefore = new Date(this.currentMonth);
    fiveMonthsBefore.setMonth(this.currentMonth.getMonth() - 5);
    console.log("Date 5 months before currentMonth", fiveMonthsBefore);
    console.log("currentMonthcurrentMonth", this.currentMonth);
    let listofprofileid = []
    let listofparticipants = doc
    let category = engagementCategory
    for (let i = 0; i < listofparticipants.length; i++) {
      const element = listofparticipants[i];
      listofprofileid.push(element['profileid'])
    }
    const docData = {
      profileid: this.loggedInProfileId,
      listofprofileid: listofprofileid,
      engagement: category,
      absolutedate: fiveMonthsBefore,
      timelinetype: userResponse ? 'Absolute' : 'Relative'
    };
    const docSizeInBytes = new Blob([JSON.stringify(docData)]).size;
    console.log("Document size (bytes):", docSizeInBytes);

    // Check if size exceeds Firestore limit (1 MB = 1,048,576 bytes)
    if (docSizeInBytes > 1048576) {
      console.error("Document size exceeds Firestore limit of 1 MB.");
      alert("The document is too large to save to Firestore. Please reduce the data size.");
      return;
    }
    // if (listofprofileid.length <= 1000 ) {
    const docid = doc(collection(this.firestore, 'filteredtimeline profile')).id;
    await setDoc(doc(this.firestore, 'filteredtimeline profile', docid), docData);
    const navigationurl = 'usertimeline'
    const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { docid } })
    window.open(url.toString(), '_blank')
    // } 

  }


  
  navigatetoprofile(profileid) {
    if (profileid) {
      const navigationurl = 'userprofile';
      const url = `${navigationurl}/${profileid}`;
      window.open(url, '_blank');
      // const navigationurl = 'UserProfile';
      // const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { profileid }})
      // window.open(url.toString(), '_blank')  
    } else {
      alert('Profile Name Not Available');
    }
  }

  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.selection.select(...this.dataSource.data);
    }
  }

  toggleRow(row: any) {
    this.selection.toggle(row);
  }

  sendMessagesToSelectedPartiicpant() {

    let dialogRef = this.dialog.open(InAppMessageInputComponent, {
      data: this.selection.selected,
      disableClose: true,
      panelClass: 'custom-dialog-container'
    })
    dialogRef.afterClosed().toPromise().then(result => {
      // console.log(result);
      if (result != null && result != undefined) {
        let docid = doc(collection(this.firestore, 'participants message archive')).id
        result['docid'] = docid
        setDoc(doc(this.firestore, "participants message archive", docid), result).then(() => {
          console.log("message to participants document created");
        }).catch(err => {
          console.log(err);
        })
      }
    });
  }

  //send in app messages to selected participant
  sendNotificationinBreakthrough() {
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      disableClose: true,
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    })
    firstValueFrom(dialogRef.afterClosed()).then(async result => {
      // console.log(result);
      if (result != null && result != undefined) {
        var selectedProfileid = []
        var userRef = []
        for (let i = 0; i < this.selection.selected.length; i++) {
          const selected = this.selection.selected[i];
          selectedProfileid.push(selectedProfileid)
          var profiledata = this.mapprofile[selected["profileid"]]
          if (profiledata["user_ref"] != null) {
            userRef.push(profiledata["user_ref"])
          }
        }

        var notificationimage = null
        if (result["notificationimage"] != null) {
          try {
            const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
            const storageRef = ref(this.storage, filepath);

            const snapshot = await uploadBytes(storageRef, result["notificationimage"]);
            const url = await getDownloadURL(snapshot.ref);
            notificationimage = url;
          } catch (error) {
            console.log(error);
          }
        }

        this.guard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: selectedProfileid,
        }).then(() => {
          alert("A&H Update sent to App user " + selectedProfileid.length.toString())
        })

      }
    })
  }

}


