import { Component, inject, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { collection, collectionData, doc, getFirestore, getDoc, getDocs, orderBy, query, updateDoc, where} from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-live-event-dashboard',
  imports: [
    MatProgressSpinnerModule,
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    NgxMatSelectSearchModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    RouterModule,
    MatMenuModule
  ],
  providers:[
    provideNativeDateAdapter()
  ],
  templateUrl: './live-event-dashboard.component.html',
  styleUrl: './live-event-dashboard.component.css'
})
export class LiveEventDashboardComponent {
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  private unsubscribe$ = new Subject<void>();
  storedAggregateData: any[] = [];
  loading:boolean = true;
  liveeventList = []
  uniqueParticipantList = []
  aggregateTableValue = {}
  missingProfile: any
  totalAdjustmentCount = 0
  totalAdjustmentPendingCount = 0
  totalAdjustmentCompletedCount = 0
  totalprocedure = 0
  totalprocedurepending = 0
  totalprocedurecompleted = 0
  totalevolutionyearwasted = 0
  totalevolutionyearsaved = 0
  totalextendedlifeimpact = 0
  validatedAEL = 0
  totalAELcount = 0
  validatedATC = 0
  unvalidatedATC = 0
  eventNewCount = 0
  eventOldCount = 0
  totalBreakthroughs = 0
  currentEventBreakthroughs = 0
  todayBreakthroughsMap: { [key: string]: any[] } = {};
  todayBreakthrough = 0
  totaleventdays = 0
  mapProcedure = {}
  mapCompleted = {}
  mapPending = {}
  maptotal = {}
  mapAttendence = {}
  mapvideoAsk = {}
  mapunvalidatedATC = {}
  mapvalidatedATC = {}
  mapBreakthroughs = {}
  mapEventBreakthroughs = {}
  mapextendedLifeImpactCounts = {}
  maparticipantael = {}
  mapValidatedParticipantael = {}
  mapUnValidatedParticipantael = {}
  mapprofile = {}
  mapJourney = {}
  mapactivejourney = {}
  mapParticipantMetaData = {}
  proceduresArray = []
  isFirstLoad = true;
  dataSource = new MatTableDataSource<any>([]);
  tableColumns: { name: string; value: string }[] = [
    { name: 'Name', value: 'name' },
    { name: 'Arena Products', value: 'arenaproducts' },
    { name: 'ATC Model', value: 'atcmodel' },
    { name: 'Precribed Date', value: 'prescription_date' },
    { name: 'Author', value: 'author' },
    { name: 'ATC Count', value: 'atccount' },
    { name: 'UnVal ATC Count', value: 'unvalidatedatccount' },
    { name: 'Total Procedures Completed', value: 'participanttotalprocedurecompleted' },
    { name: 'Total Procedures Pending', value: 'participanttotalprocedurepending' },
    { name: 'Procedure Completion %', value: 'procedurecompletionpercentage' },
    { name: 'Adjustments Completed', value: 'totaladjustmentcompleted' },
    { name: 'Adjustments Pending', value: 'totaladjustmentpending' },
    { name: 'Procedures Done for Others', value: 'proceduredoneforothers' },
    { name: 'Arena Attendance', value: 'arenaAttendence' },
    { name: 'AEL', value: 'validatedAel' },
    { name: 'Event Breakthroughs', value: 'eventbreakthroughs' }
  ];
  displayedColumns: string[] = [];
  lastActivityOptions:string [] = [
    'Last 24 Hrs','Last 48 Hrs','After 48 Hrs'
  ]
  breakthroughsFilter:string [] = [
    'Today','Event'
  ]
  aelFilter:string [] = [
    'Validated','UnValidated'
  ]
  adjFilter:string [] = [
    'Completed','Pending'
  ]
  procFilter:string [] = [
    'Completed','Pending'
  ]
  atcFilter:string [] = [
    'Validated','UnValidated','Total','NoAtc'
  ]
  filter={
    name:[],
    product:[],
    eventnew:null,
    abscent:[],
    present:[],
    // lastactivity:''
    lastActivityOperator:">",
    lastActivityHours:24,
    breakthroughs:'',
    procDFO_Operator:">=",
    procCount:0,
    ael:'',
    adj:'',
    proc:'',
    proc_c_Operator:">=",
    procedurecompletioncount:0,
    procedurecompletionpercentage:0,
    atcmodel:[],
    author:[],
    atc:null
  }
  timeOperators = [
    { value: 'lte', label: 'Active within last or at (≤)' },
    { value: 'gte', label: 'Not active within last or at (≥)' },
  ];
  openedAt: Date;
  hasLoggedUsage = false;
  form : FormGroup
  todayAttendence: any;
  allDayAbsent: any;
  profileTotalProcedureMap: { [key: string]: number } = {};
  profileTotalProcedurePendingMap: { [key: string]: number } = {};
  profileTotalProcedureCompletedMap: { [key: string]: number } = {};
  originalDataSource: any[] = null;
  currentProcedureStatus: 'completed' | 'pending' | 'all' = 'all';
  currentBreakthroughsStatus: 'total' | 'today' | 'event' = 'event';
  selectedMetric: string = '';
  selectedParticipants: any[] = [];
  showParticipantModal: boolean = false;
  
  //event participation Request
  eventParticipants = []
  initialEventParticipants = []
  mapEventParticipantsProducts = {}
  //products
  productsList = []
  mapProductsNameById = {}
  mapProductsIdToAtcModel = {}

  topProcedures: any[] = [];
  showAllProcedures: boolean = false;

  getEventDatesUntilToday = []
  uniqueFilteredParticipants = 0

  procedureDoneForOthers = {}
  searchtext=""
  filteredEventParticipants = []

  mapLiveEvent = {}

  searchProfileText = ""
  filteredProfileList = []

  temporaryFunctionAccess = []
  loggedProfileID = null

  eventProductAtcModelList = []
  listOfAtcmodels=[]

  searchTerm: string = '';
  filteredProfile = "";

  // private firestore = inject(Firestore)
  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore
  constructor(
    public guard: AuthguardService,
    public router: Router,
    public formbuilder: FormBuilder,
    public dialog: MatDialog
  ) 
  { 
    this.form = this.formbuilder.group ({
      profileid: [,],
      atcmodel: [['uP!', 'LYL', 'B!G','LFL'],],
      event:[,],
      range: new FormGroup({
        start: new FormControl(),
        end: new FormControl()
      })
    })

    guard.getRoles().then(roles=>{
      this.loggedProfileID = roles.profile_ref.id
    })

    guard.getProfileMap().then(e => {
      this.mapprofile = e.map;
      this.filteredProfileList = Object.keys(this.mapprofile)
    });

    guard.getJourneyMap().then(e=> {
      this.mapJourney = e
    })

    getDocs(collection(this.firestoreDefault,"products")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapProductsNameById[element['id']] = element['product']
        this.mapProductsIdToAtcModel[element['id']] = element['atcmodel']
        if(![null,undefined,""].includes(element['atcmodel']) && element['atcmodel'].trim().length > 1 && !this.listOfAtcmodels.includes(element['atcmodel'])){
          this.listOfAtcmodels.push(element['atcmodel'])
        }
      }
    })

    getDoc(doc(this.firestoreDefault,"temporary function access","atcaccess")).then(atcAccessSnap => {
      if(atcAccessSnap.exists()){
        this.temporaryFunctionAccess = atcAccessSnap.data()['profilelist'] || []
        this.displayedColumns = this.tableColumns.map(col => col.value).filter(e => !['atcmodel','prescription_date','author','eventbreakthroughs'].includes(e));
        if(this.temporaryFunctionAccess.includes(this.loggedProfileID)){
          this.displayedColumns.push('isdelete')
        }
      }
    })

    // Fetch procedures
    getDocs(collection(this.firestoreDefault,"procedures")).then(res => {
      for (let i = 0; i < res.docs.length; i++) {
        const element = res.docs[i].data();
        this.mapProcedure[res.docs[i].id] = element
      }
    })

    // Fetch events
    getDocs(query(collection(this.firestoreDefault,"event collection"),orderBy("start_date","desc"))).then(snap => {
      for (let k = 0; k < snap.docs.length; k++) {
        const event = snap.docs[k].data();
        event['ref'] = snap.docs[k].ref;
        this.liveeventList.push(event);
        this.mapLiveEvent[snap.docs[k].id] = event
      }
      this.fetchData()
    });

  }

  ngOnInit():void {
    this.dataSource.filterPredicate = this.customfilter()
  }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.filter);
  }

  public customfilter(): (data: any, filter: string) => boolean {
    let filterFunction = (data: any, filter: any): boolean => {
      let e = data;
      let value = JSON.parse(filter);
      
      e['arenaAttendence'] = this.mapAttendence[e['profileid']] || []
      let arenaAttendence = e['arenaAttendence'].map(l => new Date(l['logdate'].toDate()).toLocaleDateString('en-CA'));
      // console.log(arenaAttendence);
      
      let lastActivityFilter = true;
  
      if (value.lastActivityOperator && value.lastActivityHours !== null && value.lastActivityHours !== undefined) {
        const now = new Date();
        const lastActivity = e['lastactivity'];
        const hoursInMs = value.lastActivityHours * 60 * 60 * 1000;
        const compareTime = new Date(now.getTime() - hoursInMs);
        
        switch (value.lastActivityOperator) {
          case 'lt': // Active within last X hours
            // lastActivity > compareTime means the activity happened after the compareTime (more recent)
            // Example: Activity within last 15 hours
            lastActivityFilter = lastActivity > compareTime;
            break;
            
          case 'lte': // Active within last X hours or exactly at X hours ago
            // lastActivity >= compareTime means activity happened at or after compareTime
            lastActivityFilter = lastActivity >= compareTime;
            break;
            
          case 'gt': // Not active within last X hours (activity was earlier)
            // lastActivity < compareTime means the activity happened before the compareTime (older)
            // Example: No activity in last 15 hours
            lastActivityFilter = lastActivity < compareTime;
            break;
            
          case 'gte': // Not active within last X hours or exactly at X hours ago
            // lastActivity <= compareTime means activity happened at or before compareTime
            lastActivityFilter = lastActivity <= compareTime;
            break;
            
          case 'eq': // Activity exactly at X hours ago (within 1 hour range for flexibility)
            const hourStart = new Date(now.getTime() - hoursInMs - (1 * 60 * 60 * 1000));
            const hourEnd = new Date(now.getTime() - hoursInMs + (1 * 60 * 60 * 1000));
            lastActivityFilter = lastActivity >= hourStart && lastActivity <= hourEnd;
            break;
            
          case 'neq': // Activity not exactly at X hours ago
            const notHourStart = new Date(now.getTime() - hoursInMs - (1 * 60 * 60 * 1000));
            const notHourEnd = new Date(now.getTime() - hoursInMs + (1 * 60 * 60 * 1000));
            lastActivityFilter = !(lastActivity >= notHourStart && lastActivity <= notHourEnd);
            break;
            
          case 'inactive': // No activity for X hours
            // This is similar to 'gt' but with clearer naming for users
            // lastActivity < compareTime means the last activity was more than X hours ago
            lastActivityFilter = lastActivity < compareTime;
            break;
            
          default:
            lastActivityFilter = true;
        }
      }
      let breakthroughsFilter = true;
      if (value.breakthroughs) {
        if (value.breakthroughs ==='Today') {
          const todayBreakthroughs = this.todayBreakthroughsMap[e['profileid']];
          breakthroughsFilter = todayBreakthroughs && todayBreakthroughs.length > 0;
        } else if(value.breakthroughs ==='Event'){
          const eventBreakthroughs = this.mapEventBreakthroughs[e['profileid']];
          breakthroughsFilter = eventBreakthroughs && eventBreakthroughs.length > 0;
        }
      }
      let aelFilter = true;
      if (value.ael) {
        if (value.ael ==='Validated') {
          const validatedAel = this.mapValidatedParticipantael[e['profileid']];
          aelFilter = validatedAel && validatedAel.length > 0;
        } else if(value.ael ==='UnValidated'){
          const UnValidatedAel = this.mapUnValidatedParticipantael[e['profileid']];
          aelFilter = UnValidatedAel && UnValidatedAel.length > 0;
        }
      }
      let adjFilter = true;
      if (value.adj) {
        if (value.adj ==='Completed') {
          const completedAdj = e['totaladjustmentcompleted'];
          adjFilter = completedAdj && completedAdj > 0;
        } else if(value.adj ==='Pending'){
          const PendingAdj = e['totaladjustmentpending'];
          adjFilter = PendingAdj && PendingAdj > 0;
        }
      }
      let procFilter = true;
      if (value.proc) {
        if (value.proc ==='Completed') {
          const completedProc = this.profileTotalProcedureCompletedMap[e['profileid']];
          procFilter = completedProc && completedProc > 0;
        } else if(value.proc ==='Pending'){
          const PendingProc = this.profileTotalProcedurePendingMap[e['profileid']];
          procFilter = PendingProc && PendingProc > 0;
        }
      }
      let atcFilter = true;
      if (value.atc) {
        const UnValidatedAtc = e['unvalidatedATC'];
        const validatedAtc = e['validatedATC']
        if (value.atc ==='Validated') {
          atcFilter = validatedAtc && validatedAtc.length > 0;
        } else if(value.atc ==='UnValidated'){
          atcFilter = validatedAtc && UnValidatedAtc && UnValidatedAtc.length > 0 && validatedAtc.length == 0;
        } else if(value.atc ==='NoAtc'){
          atcFilter = validatedAtc && UnValidatedAtc && UnValidatedAtc.length == 0 && validatedAtc.length == 0;
        } else if(value.atc ==='Total'){
          const hasValidatedAtc = this.mapvalidatedATC[e['profileid']] && this.mapvalidatedATC[e['profileid']].length > 0;
          const hasUnvalidatedAtc = this.mapunvalidatedATC[e['profileid']] && this.mapunvalidatedATC[e['profileid']].length > 0;
          atcFilter = hasValidatedAtc || hasUnvalidatedAtc;
        }
      }

      type ComparisonOperator = '>' | '<' | '>=' | '<=' | '===';

      const comparisons: Record<ComparisonOperator, (x: number, y: number) => boolean> = {
        '>':  (x, y) => x > y,
        '<':  (x, y) => x < y,
        '>=': (x, y) => x >= y,
        '<=': (x, y) => x <= y,
        '===': (x, y) => x === y
      };
      // console.log(value.proc_c_Operator,e['procedurecompletionpercentage'],value.procedurecompletionpercentage);
      
      return (value.name.length > 0 ? value['name'].includes(e['profileid']) : true) &&
        (value.product.length > 0 ? value['product'].some((l: string) => e['arenaproducts'].includes(l)) : true) && 
        (value.eventnew != null ? value.eventnew === e['eventnew'] : true) && 
        (value.abscent.length > 0 ? value.abscent.every(m => !arenaAttendence.includes(m)) : true) && 
        (value.present.length > 0 ? value.present.every(m => arenaAttendence.includes(m)) : true) &&
        lastActivityFilter && breakthroughsFilter && aelFilter && adjFilter && procFilter && atcFilter &&
        (value.procDFO_Operator && value.procCount && value.procCount != 0 ? comparisons[value.procDFO_Operator]?.(Number(e['proceduredoneforothers']),Number(value.procCount)):true) &&
        (value.proc_c_Operator && value.procedurecompletioncount != null && value.procedurecompletioncount > 0 ? comparisons[value.proc_c_Operator]?.(Number(e['participanttotalprocedurecompleted']),Number(value.procedurecompletioncount)) ?? true :true) && 
        (value.proc_c_Operator && value.procedurecompletionpercentage != null && value.procedurecompletionpercentage > 0 ? comparisons[value.proc_c_Operator]?.(Number(e['procedurecompletionpercentage']),Number(value.procedurecompletionpercentage)) ?? true :true) &&
        (value.atcmodel.length > 0 ? value['atcmodel'].includes(e['atcmodel']) : true) && 
        (value.author.length > 0 ? value['author'].some((l: string) => e['author'].includes(l)) : true) 
    }
    
    return (data: any, filter: string) => {
      let result = filterFunction(data, filter);
      return result;
    };
  }

  // Add this helper method to your component for better performance
  trackByProfileId(index: number, participant: any): string {
    return participant.profileid;
  }

  // Add this new trackBy method for ATC records
  trackByATCId(index: number, participant: any): string {
    // Use atcid if available, otherwise fallback to profileid + index
    return participant.atcid || `${participant.profileid}_${index}`;
  }

  async fetchData() {
    this.loading = true

    if (this.liveeventList.length > 0 && this.isFirstLoad) {
      this.form.patchValue({
        event: this.liveeventList[0],
        atcmodel: ['uP!', 'LYL', 'B!G', 'LFL']
      });
      this.isFirstLoad = false;
    }
    const eventStartdate = this.form.get('event').value['start_date'].toDate();
    const eventEnddate = this.form.get('event').value['end_date'].toDate();

    const diffTime = Math.abs(eventEnddate - eventStartdate); // difference in milliseconds
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // convert to days
    this.totaleventdays = diffDays
    console.log(this.totaleventdays)

    this.getEventDatesUntilToday = []
    const today = new Date() > eventEnddate ? eventEnddate : new Date()
    for (let dt = new Date(eventStartdate); dt <= today; dt.setDate(dt.getDate() + 1)) {
      this.getEventDatesUntilToday.push(new Date(dt).toLocaleDateString('en-CA'))
    }
    console.log(this.getEventDatesUntilToday);

    this.eventProductAtcModelList = this.form.value['atcmodel']
    const eventProfiles = await getDocs(query(collection(this.firestoreDefault, "event participation request"), where('eventref', '==', this.form.value['event'].ref)))
    const profileIds = []
    this.eventParticipants = []
    this.mapEventParticipantsProducts = {}
    this.filteredEventParticipants = []
    for (let i = 0; i < eventProfiles.docs.length; i++) {
      const element = eventProfiles.docs[i].data();
      if (['approved', 'attended'].includes(element['status'])) {
        this.initialEventParticipants.push(element);
        this.mapEventParticipantsProducts[element['profileid']] = this.mapEventParticipantsProducts[element['profileid']] || []
        this.mapEventParticipantsProducts[element['profileid']].push(element['productref'].id)
        if (!profileIds.includes(element['profileid'])) {
          profileIds.push(element['profileid'])
          this.eventParticipants.push(element)
        }
      }
    }
    this.filteredEventParticipants = this.eventParticipants
    // console.log("unique event participants",this.eventParticipants.length)

    getDocs(query(collection(this.firestoreDefault, "arena events"), where("eventref", "==", this.form.value['event'].ref))).then(eventSnap => {
      this.productsList = eventSnap.docs.map(e => e.data()).filter(e => e['delete'] != true)
    })

    const promises = [];
    for (let i = 0; i < profileIds.length; i += 10) {
      const profilelist = profileIds.slice(i, i + 10);
      const promise = getDocs(query(collection(this.firestoreDefault, "participant metadata"), where("profileid", "in", profilelist))).then(res => {
        for (let j = 0; j < res.docs.length; j++) {
          const element = res.docs[j].data();
          this.mapactivejourney[element['profileid']] = element['activejourney'];
          this.mapParticipantMetaData[element['profileid']] = element;
        }
      });
      promises.push(promise);
    }
    await Promise.all(promises);


    var currentDate = new Date();
    var startDate = new Date(currentDate);
    startDate.setMonth(currentDate.getMonth() - 4);
    this.form.controls["range"].patchValue({
      start: startDate,
      end: currentDate
    });

    const formValue = this.form.value;
    const start = formValue["range"]["start"];
    const end = formValue["range"]["end"];

    if (start != null && end != null) {
      // console.log('Start date:', start, 'End date:', end);

      const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0);
      const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);

      // fetch unvalidated ATC
      collectionData(query(collection(this.firestoreATC, "atc_to_validate"),
        where("isdelete", "==", false),
        where("prescription_date", ">=", startDate),
        where("prescription_date", "<=", endDate),
        where("status", "==", "atc given"),
        orderBy("prescription_date", "desc")
      )).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
        this.mapunvalidatedATC = {}
        list = list.filter(e => profileIds.includes(e['profileid']))
        for (let i = 0; i < list.length; i++) {
          const element = list[i];
          this.mapunvalidatedATC[element['profileid']] = this.mapunvalidatedATC[element['profileid']] || []
          this.mapunvalidatedATC[element['profileid']].push(element)
        }
      })

      // fetch Attendence
      collectionData(query(collection(this.firestoreDefault, "arena e-ticket log"), where('eventref', '==', formValue['event'].ref)))
        .pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
          this.mapAttendence = {}
          // this.todayAttendence = list.filter(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')).length
          for (let i = 0; i < list.length; i++) {
            const element = list[i];
            this.mapAttendence[element['profileid']] = this.mapAttendence[element['profileid']] || []
            let getLogDate = this.mapAttendence[element['profileid']].map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA'))
            if (!getLogDate.includes(new Date(element['logdate'].toDate()).toLocaleDateString('en-CA'))) {
              this.mapAttendence[element['profileid']].push(element)
            }
          }
          const flattenedArray: any = Object.values(this.mapAttendence).reduce((acc: [], curr: []) => [...acc, ...curr], []);
          // console.log(flattenedArray,"flattenedArray");
          this.todayAttendence = flattenedArray.filter(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')).length
          this.allDayAbsent = this.eventParticipants.filter(participant => {
            const attendanceDates = this.mapAttendence[participant['profileid']]?.map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA')) || [];
            return this.getEventDatesUntilToday.every(date => !attendanceDates.includes(date));
          }).length;
        })

      // fetch videoAsk
      collectionData(query(collection(this.firestoreDefault, "arenavideoask"), where('eventref', '==', formValue['event'].ref)))
        .pipe(takeUntil(this.unsubscribe$)).subscribe(videoask => {
          for (let i = 0; i < videoask.length; i++) {
            const element = videoask[i];
            this.mapvideoAsk[element['profileid']] = this.mapvideoAsk[element['profileid']] || []
            this.mapvideoAsk[element['profileid']].push(element)
          }
        })

      this.mapEventBreakthroughs = {};
      this.todayBreakthroughsMap = {};
      this.mapBreakthroughs = {};
      this.totalBreakthroughs = 0;
      this.currentEventBreakthroughs = 0;
      this.todayBreakthrough = 0;

      // fetch Breakthroughs
      collectionData(collection(this.firestoreDefault, `Achievements/${'posts'}/postcollection`))
        .pipe(takeUntil(this.unsubscribe$)).subscribe(snap => {
          this.totalBreakthroughs = snap.length;

          const eventStartdate = this.form.get('event').value['start_date'].toDate();
          const eventEnddate = this.form.get('event').value['end_date'].toDate();

          let eventBreakthroughs = snap.filter(e => e['created'].toDate() >= eventStartdate && e['created'].toDate() <= eventEnddate);
          this.currentEventBreakthroughs = eventBreakthroughs.length;

          let todayBreakthroughs = snap.filter(e => new Date(e['created'].toDate()).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA'));
          this.todayBreakthrough = todayBreakthroughs.length;

          // Clear maps before repopulating
          this.todayBreakthroughsMap = {};
          this.mapEventBreakthroughs = {};
          this.mapBreakthroughs = {};

          // Populate todayBreakthroughsMap
          for (let i = 0; i < todayBreakthroughs.length; i++) {
            const element = todayBreakthroughs[i];
            if (!this.todayBreakthroughsMap[element['profileid']]) {
              this.todayBreakthroughsMap[element['profileid']] = [];
            }
            this.todayBreakthroughsMap[element['profileid']].push(element);
          }

          // Populate eventBreakthroughs map
          for (let i = 0; i < eventBreakthroughs.length; i++) {
            const element = eventBreakthroughs[i];
            if (!this.mapEventBreakthroughs[element['profileid']]) {
              this.mapEventBreakthroughs[element['profileid']] = [];
            }
            this.mapEventBreakthroughs[element['profileid']].push(element);
          }

          // Populate all breakthroughs map
          for (let i = 0; i < snap.length; i++) {
            const element = snap[i];
            if (!this.mapBreakthroughs[element['profileid']]) {
              this.mapBreakthroughs[element['profileid']] = [];
            }
            this.mapBreakthroughs[element['profileid']].push(element);
          }
        });

      // console.log(this.mapEventBreakthroughs,"consoling map event breakthroughs");


      // fetch participant ael
      collectionData(query(collection(this.firestoreDefault, "participant AEL"), orderBy("created", "desc"))).pipe(takeUntil(this.unsubscribe$)).subscribe(snap => {
        // this.totalAELcount = snap.length;
        this.validatedAEL = 0
        this.totalAELcount = 0
        this.maparticipantael = {}
        this.mapValidatedParticipantael = {}
        const processedProfileIds = new Set();
        for (let j = 0; j < snap.length; j++) {
          const element = snap[j];
          // ['uP!', 'LYL', 'B!G','LFL']
          if (this.eventProductAtcModelList.includes(element['atcmodel'])) {
            if (!processedProfileIds.has(element['profileid'])) {
              processedProfileIds.add(element['profileid']);
              if (profileIds.includes(element['profileid'])) {
                if (![null, undefined].includes(element['validatedby'])) {
                  this.validatedAEL++;
                  this.mapValidatedParticipantael[element['profileid']] = this.mapValidatedParticipantael[element['profileid']] || [];
                  this.mapValidatedParticipantael[element['profileid']].push(element);
                } else {
                  this.totalAELcount++
                  this.mapUnValidatedParticipantael[element['profileid']] = this.mapUnValidatedParticipantael[element['profileid']] || [];
                  this.mapUnValidatedParticipantael[element['profileid']].push(element);

                }
                this.maparticipantael[element['profileid']] = this.maparticipantael[element['profileid']] || [];
                this.maparticipantael[element['profileid']].push(element);
              }
            }
          }
        }
      });

      try {
        collectionData(query(collection(this.firestoreATC, "atc_alpha"),
          where("isdelete", "==", false),
          where("prescription_date", ">=", startDate),
          where("prescription_date", "<=", endDate),
          orderBy("prescription_date", "desc")
        )).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
          this.mapvalidatedATC = {}
          // ['uP!', 'LYL', 'B!G','LFL']
          list = list.filter(e => [null, 'validated',undefined].includes(e['status']) && this.eventProductAtcModelList.includes(e['product']) && profileIds.includes(e['profileid']))
          // console.log('ATC data count:', list.length);
          // this.validatedATC = list.length
          for (let i = 0; i < list.length; i++) {
            const element = list[i];
            this.mapvalidatedATC[element['profileid']] = this.mapvalidatedATC[element['profileid']] || []
            this.mapvalidatedATC[element['profileid']].push(element)
          }
          // const aggregateData = [];
          const aggregateData = {};
          let profilesWithATC = new Set()
          let completedATC = {}
          let totalATC = {}
          this.totalAdjustmentCount = 0;
          this.totalAdjustmentPendingCount = 0;
          this.totalAdjustmentCompletedCount = 0
          this.totalprocedure = 0
          this.totalprocedurepending = 0
          this.totalprocedurecompleted = 0
          this.totalevolutionyearwasted = 0
          this.totalevolutionyearsaved = 0
          this.totalextendedlifeimpact = 0
          this.profileTotalProcedureMap = {};
          this.profileTotalProcedurePendingMap = {};
          this.profileTotalProcedureCompletedMap = {};
          this.procedureDoneForOthers = {};

          for (let i = 0; i < list.length; i++) {
            const atcData = list[i];
            // if(atcData['evolutionprogressdate']){
            //   console.log(atcData,"atcData console");
            // }
            // console.log(atcData['atcid'],atcData['totalprocedurecompleted']);

            profilesWithATC.add(atcData['profileid']);
            const participanttotalAdjustmentCount = atcData["totaladjustment"] ? Number.isNaN(atcData["totaladjustment"] ?? 0) ? 0 : atcData["totaladjustment"] : 0;
            const participanttotalAdjustmentCompleted = atcData["totaladjustmentcompleted"] ? Number.isNaN(atcData["totaladjustmentcompleted"] ?? 0) ? 0 : atcData["totaladjustmentcompleted"] : 0;
            const participanttotaladjustmentpending = atcData['totaladjustmentpending'] ? Number.isNaN(atcData["totaladjustmentpending"] ?? 0) ? 0 : atcData["totaladjustmentpending"] : 0;
            const participanttotalprocedure = atcData['totalprocedure'] ? Number.isNaN(atcData["totalprocedure"] ?? 0) ? 0 : atcData["totalprocedure"] : 0;
            const participanttotalprocedurepending = atcData['totalprocedurepending'] ? Number.isNaN(atcData["totalprocedurepending"] ?? 0) ? 0 : atcData["totalprocedurepending"] : 0;
            const participanttotalprocedurecompleted = atcData['totalprocedurecompleted'] ? Number.isNaN(atcData["totalprocedurecompleted"] ?? 0) ? 0 : atcData["totalprocedurecompleted"] : 0;

            const evolutionyearwasted = atcData['evolutionyearwasted'] ? Number.isNaN(atcData["evolutionyearwasted"] ?? 0) ? 0 : atcData["evolutionyearwasted"] : 0;
            const evolutionyearsaved = atcData['evolutionyearsaved'] ? (typeof atcData["evolutionyearsaved"] === 'number' && !isNaN(atcData["evolutionyearsaved"])) ? atcData["evolutionyearsaved"] : 0 : 0;
            const profileId = atcData['profileid'];

            // Initialize or update the profile procedure maps
            this.profileTotalProcedureMap[profileId] = (this.profileTotalProcedureMap[profileId] || 0) + participanttotalprocedure;
            this.profileTotalProcedurePendingMap[profileId] = (this.profileTotalProcedurePendingMap[profileId] || 0) + participanttotalprocedurepending;
            this.profileTotalProcedureCompletedMap[profileId] = (this.profileTotalProcedureCompletedMap[profileId] || 0) + participanttotalprocedurecompleted;

            this.totalAdjustmentCount += participanttotalAdjustmentCount;
            this.totalAdjustmentPendingCount += participanttotaladjustmentpending;
            this.totalAdjustmentCompletedCount += participanttotalAdjustmentCompleted
            this.totalprocedure += participanttotalprocedure
            this.totalprocedurepending += participanttotalprocedurepending
            this.totalprocedurecompleted += participanttotalprocedurecompleted
            this.totalevolutionyearwasted += evolutionyearwasted
            this.totalevolutionyearsaved += evolutionyearsaved
            // console.log( this.totalevolutionyearsaved);

            for (const implSpecialist in atcData['implspecialistproceduremap'] || {}) {
              this.procedureDoneForOthers[implSpecialist] = this.procedureDoneForOthers[implSpecialist] || {}
              for (const procedureKey in atcData['implspecialistproceduremap'][implSpecialist]) {
                this.procedureDoneForOthers[implSpecialist][procedureKey] = (this.procedureDoneForOthers[implSpecialist][procedureKey] || 0) + atcData['implspecialistproceduremap'][implSpecialist][procedureKey]
              }
            }


            // console.log(this.totalprocedurecompleted);

            totalATC[atcData['profileid']] = (totalATC[atcData['profileid']] || 0) + 1;
            if (participanttotalAdjustmentCount === participanttotalAdjustmentCompleted) {
              completedATC[atcData['profileid']] = (completedATC[atcData['profileid']] || 0) + 1;
            }


            if (typeof atcData['extendedlifeimpact'] === 'object' && atcData['extendedlifeimpact'] !== null) {
              for (const [impact, count] of Object.entries(atcData['extendedlifeimpact'])) {
                if (typeof count === 'number') {
                  this.mapextendedLifeImpactCounts[impact] = (this.mapextendedLifeImpactCounts[impact] || 0) + count;
                  this.totalextendedlifeimpact += count;
                } else {
                  console.warn(`Expected count to be a number for impact ${impact}, but got ${typeof count}`);
                }
              }
            }
            // this.mapProcedureStats[atcData["profileid"]] = {
            //   total: participanttotalprocedure,
            //   pending: participanttotalprocedurepending,
            //   completed: participanttotalprocedurecompleted
            // };  
            let eventNewParticipant = null;
            if (this.mapParticipantMetaData.hasOwnProperty(atcData['profileid'])) {
              if (
                this.mapParticipantMetaData[atcData['profileid']]['productevent'] &&
                this.productsList.some(e => this.mapParticipantMetaData[profileId]['productevent'].hasOwnProperty(e['productref'].id))
              ) {
                eventNewParticipant = false;
              } else {
                eventNewParticipant = true
              }
            }
            // aggregateData.push({
            //   atcid: [atcData['atcid']],
            //   profileid: atcData["profileid"],
            //   name: this.mapprofile[atcData["profileid"]],
            //   atcmodel: atcData["product"],
            //   author: (atcData['author'] || []).map(e => e.id),
            //   eventnew: eventNewParticipant,
            //   arenaproducts: this.mapEventParticipantsProducts[atcData["profileid"]] || [],
            //   prescription_date: atcData["prescription_date"].toDate(),
            //   lastactivity: atcData["lastactivity"] ? atcData["lastactivity"].toDate() : null,
            //   totaladjustment: participanttotalAdjustmentCount || 0,
            //   totaladjustmentpending: participanttotaladjustmentpending || 0,
            //   totaladjustmentcompleted: participanttotalAdjustmentCompleted || 0,
            //   totaladjustmentaware: atcData["totaladjustmentaware"] ? Number.isNaN(atcData["totaladjustmentaware"] ?? 0) ? 0 : atcData["totaladjustmentaware"] : 0,
            //   evolutionyearwasted: evolutionyearwasted || 0,
            //   evolutionyearsaved: evolutionyearsaved || 0,
            //   participanttotalprocedure: participanttotalprocedure || 0,
            //   participanttotalprocedurepending: participanttotalprocedurepending || 0,
            //   participanttotalprocedurecompleted: participanttotalprocedurecompleted || 0,
            //   totalautogeneralized: atcData["totalautogeneralized"] ? Number.isNaN(atcData["totalautogeneralized"] ?? 0) ? 0 : atcData["totalautogeneralized"] : 0,
            //   atccompletionpercentage: Math.floor((participanttotalAdjustmentCompleted / participanttotalAdjustmentCount) * 100),
            //   procedurecompletionpercentage: Math.floor((participanttotalprocedurecompleted / participanttotalprocedure) * 100),
            //   procedurecompletedlist: atcData['procedurecompletedlist'] || [],
            //   procedurependinglist: atcData['procedurependinglist'] || [],
            //   arenaAttendence: this.mapAttendence[atcData["profileid"]] || [],
            //   unvalidatedATC: this.mapunvalidatedATC[atcData["profileid"]] || [],
            //   validatedATC: this.mapvalidatedATC[atcData["profileid"]] || [],
            //   atccount: (this.mapunvalidatedATC[atcData["profileid"]] || []).length + (this.mapvalidatedATC[atcData["profileid"]] || []).length,
            //   breakthroughs: this.mapBreakthroughs[atcData["profileid"]] || [],
            //   eventbreakthroughs: this.mapEventBreakthroughs[atcData["profileid"]] || [],
            //   ael: this.maparticipantael[atcData["profileid"]] || [],
            //   validatedAel: this.mapValidatedParticipantael[atcData["profileid"]] || [],
            //   unvalidatedAel: this.mapUnValidatedParticipantael[atcData["profileid"]] || [],
            //   totalATC: totalATC[atcData["profileid"]] || 0,
            //   completedATC: completedATC[atcData['profileid']] || 0,
            //   extendedLifeImpact: this.mapextendedLifeImpactCounts[atcData['profileid']] || 0,
            //   profileTotalProcedure: this.profileTotalProcedureMap[profileId] || 0,
            //   profileTotalProcedurePending: this.profileTotalProcedurePendingMap[profileId] || 0,
            //   profileTotalProcedureCompleted: this.profileTotalProcedureCompletedMap[profileId] || 0
            // });

            aggregateData[atcData["profileid"]] = this.deepMergeSum(
              aggregateData[atcData["profileid"]] || {},{
                atcid: [atcData['atcid']],
                profileid: atcData["profileid"],
                name: this.mapprofile[atcData["profileid"]],
                atcmodel: [atcData["product"]],
                author: (atcData['author'] || []).map(e => e.id),
                eventnew: eventNewParticipant,
                arenaproducts: [this.mapEventParticipantsProducts[atcData["profileid"]] || []],
                prescription_date: [atcData["prescription_date"].toDate()],
                lastactivity: [atcData["lastactivity"] ? atcData["lastactivity"].toDate() : null],
                totaladjustment: participanttotalAdjustmentCount || 0,
                totaladjustmentpending: participanttotaladjustmentpending || 0,
                totaladjustmentcompleted: participanttotalAdjustmentCompleted || 0,
                totaladjustmentaware: atcData["totaladjustmentaware"] ? Number.isNaN(atcData["totaladjustmentaware"] ?? 0) ? 0 : atcData["totaladjustmentaware"] : 0,
                evolutionyearwasted: evolutionyearwasted || 0,
                evolutionyearsaved: evolutionyearsaved || 0,
                participanttotalprocedure: participanttotalprocedure || 0,
                participanttotalprocedurepending: participanttotalprocedurepending || 0,
                participanttotalprocedurecompleted: participanttotalprocedurecompleted || 0,
                totalautogeneralized: atcData["totalautogeneralized"] ? Number.isNaN(atcData["totalautogeneralized"] ?? 0) ? 0 : atcData["totalautogeneralized"] : 0,
                procedurecompletedlist: atcData['procedurecompletedlist'] || [],
                procedurependinglist: atcData['procedurependinglist'] || [],
                arenaAttendence: this.mapAttendence[atcData["profileid"]] || [],
                unvalidatedATC: this.mapunvalidatedATC[atcData["profileid"]] || [],
                validatedATC: this.mapvalidatedATC[atcData["profileid"]] || [],
                breakthroughs: this.mapBreakthroughs[atcData["profileid"]] || [],
                eventbreakthroughs: this.mapEventBreakthroughs[atcData["profileid"]] || [],
                ael: this.maparticipantael[atcData["profileid"]] || [],
                validatedAel: this.mapValidatedParticipantael[atcData["profileid"]] || [],
                unvalidatedAel: this.mapUnValidatedParticipantael[atcData["profileid"]] || [],
                extendedLifeImpact: this.mapextendedLifeImpactCounts[atcData['profileid']] || 0,
                profileTotalProcedure: this.profileTotalProcedureMap[profileId] || 0,
                profileTotalProcedurePending: this.profileTotalProcedurePendingMap[profileId] || 0,
                profileTotalProcedureCompleted: this.profileTotalProcedureCompletedMap[profileId] || 0
              }
            )
          }
          // this.totalprocedurecompleted = 0;
          // this.totalprocedurepending = 0;
          // this.totalprocedure = 0;

          // // Calculate totals from maps
          // Object.values(this.profileTotalProcedureCompletedMap).forEach(value => {
          //   this.totalprocedurecompleted += value;
          // });

          // Object.values(this.profileTotalProcedurePendingMap).forEach(value => {
          //   this.totalprocedurepending += value;
          // });

          // Object.values(this.profileTotalProcedureMap).forEach(value => {
          //   this.totalprocedure += value;
          // });

          // console.log('Updated procedure totals:', {
          //   completed: this.totalprocedurecompleted,
          //   pending: this.totalprocedurepending,
          //   total: this.totalprocedure
          // });

          // profileIds.forEach(profileId => {
          //   if (!profilesWithATC.has(profileId)) {
          //     console.log(profileId);
          //       aggregateData.push({
          //         profileid: profileId,
          //         totaladjustment: 0,
          //         totaladjustmentpending: 0,
          //         totaladjustmentcompleted: 0,
          //       });
          //   }
          // });
          // console.log(profilesWithATC,"profilesWithATC");
          //up live event product id 0ayiNALL1HDVvCXDHcZ4
          profileIds.forEach(profileId => {
            let newParticipant = null;
            if (this.mapParticipantMetaData.hasOwnProperty(profileId)) {
              if (
                this.mapParticipantMetaData[profileId]['productevent'] &&
                this.productsList.some(e => this.mapParticipantMetaData[profileId]['productevent'].hasOwnProperty(e['productref'].id))
              ) {
                newParticipant = false;
              } else {
                newParticipant = true
              }
            }
            if (!profilesWithATC.has(profileId)) {
              // console.log(profileId);
              // aggregateData.push({
              //   profileid: profileId,
              //   name: this.mapprofile[profileId],
              //   atcmodel: null,
              //   author: [],
              //   prescription_date: null,
              //   eventnew: newParticipant,
              //   lastactivity: null,
              //   arenaproducts: this.mapEventParticipantsProducts[profileId] || [],
              //   totaladjustment: 0,
              //   totaladjustmentpending: 0,
              //   totaladjustmentcompleted: 0,
              //   breakthroughs: this.mapBreakthroughs[profileId] || [],
              //   eventbreakthroughs: this.mapEventBreakthroughs[profileId] || [],
              //   arenaAttendence: this.mapAttendence[profileId] || [],
              //   unvalidatedATC: this.mapunvalidatedATC[profileId] || [],
              //   validatedATC: this.mapvalidatedATC[profileId] || [],
              //   atccount: (this.mapunvalidatedATC[profileId] || []).length + (this.mapvalidatedATC[profileId] || []).length,
              //   ael: this.maparticipantael[profileId] || [],
              //   validatedAel: this.mapValidatedParticipantael[profileId] || [],
              //   unvalidatedAel: this.mapUnValidatedParticipantael[profileId] || [],
              //   totalATC: 0,
              //   completedATC: 0,
              //   extendedLifeImpact: this.mapextendedLifeImpactCounts[profileId] || 0,
              //   profileTotalProcedure: this.profileTotalProcedureMap[profileId] || 0,
              //   profileTotalProcedurePending: this.profileTotalProcedurePendingMap[profileId] || 0,
              //   profileTotalProcedureCompleted: this.profileTotalProcedureCompletedMap[profileId] || 0,
              //   participanttotalprocedurecompleted: 0,
              //   participanttotalprocedure: 0,
              //   procedurecompletionpercentage: 0
              // });
              aggregateData[profileId] = {
                profileid: profileId,
                name: this.mapprofile[profileId],
                atcmodel: null,
                author: [],
                prescription_date: null,
                eventnew: newParticipant,
                lastactivity: null,
                arenaproducts: this.mapEventParticipantsProducts[profileId] || [],
                totaladjustment: 0,
                totaladjustmentpending: 0,
                totaladjustmentcompleted: 0,
                breakthroughs: this.mapBreakthroughs[profileId] || [],
                eventbreakthroughs: this.mapEventBreakthroughs[profileId] || [],
                arenaAttendence: this.mapAttendence[profileId] || [],
                unvalidatedATC: this.mapunvalidatedATC[profileId] || [],
                validatedATC: this.mapvalidatedATC[profileId] || [],
                atccount: (this.mapunvalidatedATC[profileId] || []).length + (this.mapvalidatedATC[profileId] || []).length,
                ael: this.maparticipantael[profileId] || [],
                validatedAel: this.mapValidatedParticipantael[profileId] || [],
                unvalidatedAel: this.mapUnValidatedParticipantael[profileId] || [],
                totalATC: 0,
                completedATC: 0,
                extendedLifeImpact: this.mapextendedLifeImpactCounts[profileId] || 0,
                profileTotalProcedure: this.profileTotalProcedureMap[profileId] || 0,
                profileTotalProcedurePending: this.profileTotalProcedurePendingMap[profileId] || 0,
                profileTotalProcedureCompleted: this.profileTotalProcedureCompletedMap[profileId] || 0,
                participanttotalprocedurecompleted: 0,
                participanttotalprocedure: 0,
                procedurecompletionpercentage: 0
              };
            }
          });
          // console.log(this.mapEventBreakthroughs,"Check the structure and data");
          // console.log(aggregateData,"Check the structure and data aggregate");
          // this.processProcedureData(aggregateData);
          let tableData = Object.values(aggregateData)
          console.log(tableData);
          
          this.processProcedureData(Object.values(tableData));
          this.validatedATC = 0;
          this.unvalidatedATC = 0;
          this.eventNewCount = 0;
          this.eventOldCount = 0;
          let uniqueList = []
          // for (const e of aggregateData) {
          for (const e of tableData) {
            e['proceduredoneforothers'] = 0
            e['totalATC'] = totalATC[e["profileid"]] || 0
            e['completedATC'] = completedATC[e['profileid']] || 0
            e['atccompletionpercentage'] = Math.floor((e['totaladjustmentcompleted'] / e['totaladjustment']) * 100) || 0
            e['procedurecompletionpercentage'] = Math.floor((e['participanttotalprocedurecompleted'] / e['participanttotalprocedure']) * 100) || 0
            e['atccount'] = (this.mapvalidatedATC[e["profileid"]] || []).length
            e['unvalidatedatccount'] = (this.mapunvalidatedATC[e["profileid"]] || []).length
            if (this.procedureDoneForOthers.hasOwnProperty(e['profileid'])) {
              e['proceduredoneforothers'] = Object.values(this.procedureDoneForOthers[e['profileid']]).reduce((acc: number, curr: number) => acc + curr, 0)
            }
            if ((e['validatedATC'] || []).length > 0) {
              this.validatedATC++;
            }
            if ((e['validatedATC'] || []).length === 0 && (e['unvalidatedATC'] || []).length > 0) {
              this.unvalidatedATC++;
            }
            if (!uniqueList.includes(e['profileid'])) {
              uniqueList.push(e['profileid'])
              if (e['eventnew']) {
                this.eventNewCount++;
              } else {
                this.eventOldCount++;
              }
            }
          }
          this.dataSource.data = tableData
          this.dataSource.sort = this.sort
          this.dataSource.paginator = this.paginator
          this.storedAggregateData = tableData;
          // this.onEventFilter()
        });

      } catch (error) {
        console.error("Error fetching ATC data:", error);
      } finally {
        this.loading = false
      }
    }
  }

  deepMergeSum(a: any = {}, b: any = {}): any {
    const out: any = { ...a };

    for (const key in b) {
      const bVal = b[key];
      const aVal = out[key];

      if (typeof bVal === 'number') {
        out[key] = (aVal || 0) + bVal;

      } else if (Array.isArray(bVal)) {
        out[key] = [...(aVal || []), ...bVal];

      } else if (bVal && typeof bVal === 'object') {
        out[key] = this.deepMergeSum(aVal, bVal);

      } else {
        out[key] = bVal;
      }
    }
    return out;
  }

  currentFilterState = {
    type: '',
    status: ''
  };
  
filterTable(status: string, type: string): void {
  if (!this.originalDataSource) {
    this.originalDataSource = [...this.dataSource.data];
  }
  this.currentFilterState = {
    type: type,
    status: status
  };
  let filteredData = [...this.originalDataSource];
  if (type === 'procedure') {
    if (status === 'completed') {
      filteredData = filteredData.filter(item => {
        return this.profileTotalProcedureCompletedMap[item.profileid] > 0;
      });
    } else if (status === 'pending') {
      filteredData = filteredData.filter(item => {
        return this.profileTotalProcedurePendingMap[item.profileid] > 0;
      });
    } else if (status === 'all') {
      filteredData = [...this.originalDataSource];
    }
  } else if (type === 'breakthroughs') {
    if (status === 'today') {
      filteredData = filteredData.filter(item => {
        const todayBreakthroughs = this.todayBreakthroughsMap[item.profileid];
        return todayBreakthroughs && todayBreakthroughs.length > 0;
      });
    } else if (status === 'event') {
      filteredData = filteredData.filter(item => {
        const eventBreakthroughs = this.mapEventBreakthroughs[item.profileid];
        return eventBreakthroughs && eventBreakthroughs.length > 0;
      });
    }
  } else if (type === 'atc') {
    if (status === 'unvalidated') {
      filteredData = filteredData.filter(e => e['validatedATC'].length == 0 && e['unvalidatedATC'].length > 0)
    } 
    else if (status === 'validated') {
      filteredData = filteredData.filter(e => e['validatedATC'].length > 0);
    } else if (status === 'noatc') {
      filteredData = filteredData.filter(e => e['validatedATC'].length == 0 && e['unvalidatedATC'].length == 0);
    }else if(status === 'total'){
      filteredData = filteredData.filter(item => {
        const hasValidatedAtc = this.mapvalidatedATC[item.profileid] && this.mapvalidatedATC[item.profileid].length > 0;
        const hasUnvalidatedAtc = this.mapunvalidatedATC[item.profileid] && this.mapunvalidatedATC[item.profileid].length > 0;
        return hasValidatedAtc || hasUnvalidatedAtc;
      });
    }
  } else if(type === "AEL"){
    if (status === 'validated') { 
      filteredData = filteredData.filter(e => e['validatedAel'].length > 0)
    } else if(status === 'unvalidated'){
      filteredData = filteredData.filter(e => e['unvalidatedAel'].length > 0)
    }
  } else if(type === "attendance"){
    if (status === 'today') {
      filteredData = filteredData.filter(e => e['arenaAttendence'].some(l => new Date(l['logdate'].toDate()).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')))
    }
  } else if(type === "adjustment"){
    if (status === 'complete') {
      filteredData = filteredData.filter(e => e['totaladjustmentcompleted'] > 0)
    } else if (status === 'pending') {
      filteredData = filteredData.filter(e => e['totaladjustmentpending'] > 0)
    } 
  }
  
  this.dataSource.data = filteredData;
  if (this.paginator) {
    this.paginator.firstPage();
  }
  setTimeout(() => {
    const tableContainer = document.querySelector('.scrolltotable');
    if (tableContainer) {
      tableContainer.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  }, 100);
}

  onCardClick(metricType: string, filterType?: string) {
    this.selectedMetric = metricType;
    this.selectedParticipants = [];

    console.log("data", this.storedAggregateData);

    switch (metricType) {
      case 'validatedATC':
        // Based on your logic: this.validatedATC counts unique participants with validatedATC.length > 0
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.validatedATC || []).length > 0
        );
        break;

      case 'unvalidatedATC':
        // Based on your logic: this.unvalidatedATC counts participants with no validated but has unvalidated ATC
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.validatedATC || []).length === 0 && (p.unvalidatedATC || []).length > 0
        );
        break;

      case 'totalATC':
        // Total ATC should be validatedATC + unvalidatedATC counts
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.validatedATC || []).length > 0 || (p.unvalidatedATC || []).length > 0
        );
        break;

      case 'noATC':
        // No ATC participants
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.validatedATC || []).length === 0 && (p.unvalidatedATC || []).length === 0
        );
        break;

      case 'adjustmentCompleted':
        // Show all ATC records that contribute to totalAdjustmentCompletedCount sum
        // This will include multiple records per participant if they have multiple ATCs
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.totaladjustmentcompleted || 0) > 0
        );
        break;

      case 'adjustmentPending':
        // Show all ATC records that contribute to totalAdjustmentPendingCount sum
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.totaladjustmentpending || 0) > 0
        );
        break;

      case 'procedureCompleted':
        // Show all ATC records that contribute to totalprocedurecompleted sum
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.participanttotalprocedurecompleted || 0) > 0
        );
        break;

      case 'procedurePending':
        // Show all ATC records that contribute to totalprocedurepending sum
        this.selectedParticipants = this.storedAggregateData.filter(p =>
          (p.participanttotalprocedurepending || 0) > 0
        );
        break;

      case 'newParticipants':
        // ISSUE: Your counting logic uses uniqueList to avoid double counting
        // But storedAggregateData may have duplicate profileids (multiple ATC records per participant)
        // Need to get unique participants only
        const uniqueNewParticipants = new Map();
        this.storedAggregateData.forEach(p => {
          if (p.eventnew === true && !uniqueNewParticipants.has(p.profileid)) {
            uniqueNewParticipants.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueNewParticipants.values());
        break;

      case 'oldParticipants':
        // Same issue as above - need unique participants
        const uniqueOldParticipants = new Map();
        this.storedAggregateData.forEach(p => {
          if (p.eventnew === false && !uniqueOldParticipants.has(p.profileid)) {
            uniqueOldParticipants.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueOldParticipants.values());
        break;

      case 'todayAttendance':
        // ISSUE: Your counting logic uses flattenedArray to count total attendance records for today
        // But this should show unique participants who attended today
        const todayDate = new Date().toLocaleDateString('en-CA');
        const uniqueTodayAttendees = new Map();
        this.storedAggregateData.forEach(p => {
          const attendedToday = (p.arenaAttendence || []).some(att =>
            new Date(att.logdate.toDate()).toLocaleDateString('en-CA') === todayDate
          );
          if (attendedToday && !uniqueTodayAttendees.has(p.profileid)) {
            uniqueTodayAttendees.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueTodayAttendees.values());
        break;

      case 'allDayAbsent':
        // This logic looks correct - it matches your counting logic
        const uniqueAbsentParticipants = new Map();
        this.storedAggregateData.forEach(p => {
          const attendanceDates = (p.arenaAttendence || []).map(e =>
            new Date(e.logdate.toDate()).toLocaleDateString('en-CA')
          );
          const isAllDayAbsent = this.getEventDatesUntilToday.every(date => !attendanceDates.includes(date));
          if (isAllDayAbsent && !uniqueAbsentParticipants.has(p.profileid)) {
            uniqueAbsentParticipants.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueAbsentParticipants.values());
        break;

      case 'todayBreakthroughs':
        // ISSUE: Your counting shows total breakthrough records for today
        // This filters for unique participants with breakthroughs today
        const todayDateBT = new Date().toLocaleDateString('en-CA');
        const uniqueTodayBTParticipants = new Map();
        this.storedAggregateData.forEach(p => {
          const hasTodayBT = (p.breakthroughs || []).some(bt =>
            new Date(bt.created.toDate()).toLocaleDateString('en-CA') === todayDateBT
          );
          if (hasTodayBT && !uniqueTodayBTParticipants.has(p.profileid)) {
            uniqueTodayBTParticipants.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueTodayBTParticipants.values());
        break;

      case 'eventBreakthroughs':
        // ISSUE: Your counting shows total event breakthrough records
        // This filters for unique participants with event breakthroughs
        const uniqueEventBTParticipants = new Map();
        this.storedAggregateData.forEach(p => {
          if ((p.eventbreakthroughs || []).length > 0 && !uniqueEventBTParticipants.has(p.profileid)) {
            uniqueEventBTParticipants.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueEventBTParticipants.values());
        break;

      case 'validatedAEL':
        // ISSUE: Your AEL counting logic processes unique participants using processedProfileIds
        // But storedAggregateData may have multiple ATC records per participant
        const uniqueValidatedAELParticipants = new Map();
        this.storedAggregateData.forEach(p => {
          if ((p.validatedAel || []).length > 0 && !uniqueValidatedAELParticipants.has(p.profileid)) {
            uniqueValidatedAELParticipants.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueValidatedAELParticipants.values());
        break;

      case 'unvalidatedAEL':
        // Same issue as above
        const uniqueUnvalidatedAELParticipants = new Map();
        this.storedAggregateData.forEach(p => {
          if ((p.unvalidatedAel || []).length > 0 && !uniqueUnvalidatedAELParticipants.has(p.profileid)) {
            uniqueUnvalidatedAELParticipants.set(p.profileid, p);
          }
        });
        this.selectedParticipants = Array.from(uniqueUnvalidatedAELParticipants.values());
        break;
    }

    console.log(`${metricType} filtered participants:`, this.selectedParticipants.length);
    this.showParticipantModal = true;
  }

  closeParticipantModal() {
    this.showParticipantModal = false;
    this.selectedParticipants = [];
    this.selectedMetric = '';
  }

  getMetricTitle(metricType: string): string {
    const titles: { [key: string]: string } = {
      'validatedATC': 'Validated ATC Participants',
      'unvalidatedATC': 'Unvalidated ATC Participants',
      'totalATC': 'Total ATC Participants',
      'noATC': 'Participants with No ATC',
      'adjustmentCompleted': 'Adjustment Completed Participants',
      'adjustmentPending': 'Adjustment Pending Participants',
      'procedureCompleted': 'Procedure Completed Participants',
      'procedurePending': 'Procedure Pending Participants',
      'newParticipants': 'New Participants',
      'oldParticipants': 'Experienced Participants',
      'todayAttendance': 'Today\'s Attendance',
      'allDayAbsent': 'All Day Absent Participants',
      'todayBreakthroughs': 'Today\'s Breakthroughs',
      'eventBreakthroughs': 'Event Breakthroughs',
      'validatedAEL': 'Validated AEL Participants',
      'unvalidatedAEL': 'Unvalidated AEL Participants'
    };
    return titles[metricType] || 'Participants';
  }

resetFilters(): void {
  if (this.originalDataSource) {
    this.dataSource.data = [...this.originalDataSource];
    if (this.paginator) {
      this.paginator.firstPage();
    }
    // Reset to default view
    this.currentFilterState = {
      type: '',
      status: ''
    };
    setTimeout(() => {
      const dashboardContainer = document.querySelector('.dashboard-container');
      if (dashboardContainer) {
        dashboardContainer.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 100);
    // console.log('Filters reset. Showing all records.');
  }
}
  
  processProcedureData(aggregateData: any[]) {
    this.mapCompleted = {};
    this.mapPending = {};
    this.maptotal = {};
  
    for (let atcData of aggregateData) {
      for (const key in this.mapProcedure) {
        if (Object.prototype.hasOwnProperty.call(this.mapProcedure, key)) {
          if (atcData['procedurecompletedlist']?.includes(key)) {
            this.mapCompleted[key] = (this.mapCompleted[key] || 0) + 1;
          }
          if (atcData['procedurependinglist']?.includes(key)) {
            this.mapPending[key] = (this.mapPending[key] || 0) + 1;
          }
          if (atcData['procedurependinglist']?.includes(key) || atcData['procedurecompletedlist']?.includes(key)) {
            this.maptotal[key] = (this.maptotal[key] || 0) + 1;
          }
        }
      }
    }
    
    this.proceduresArray = [];
    for (const key in this.mapProcedure) {
      if (Object.prototype.hasOwnProperty.call(this.mapProcedure, key) && this.maptotal[key]) {
        this.proceduresArray.push({
          id: key,
          name: this.mapProcedure[key].name || `Procedure ${key}`,
          total: this.maptotal[key] || 0,
          completed: this.mapCompleted[key] || 0,
          pending: this.mapPending[key] || 0
        });
      }
    }
    this.topProcedures = this.getTopProcedures(5);
    // console.log('Top procedures:', this.proceduresArray);
  }
  
  // saveUsageLog(): void {
  //   this.openedAt = new Date();
  //   const usageData = {
  //     profileid: this.loggedInProfileId, 
  //     screenName: 'uP! Dashboard',
  //     openedAt: this.openedAt,
  //   };
  //   this.firestore.collection("updashboard_logs").add(usageData);
  // }  
  ngOnDestroy() {
    this.unsubscribe$.next(); 
    this.unsubscribe$.complete(); 
  }

  setSelectedEvent(event: any) {
    this.form.get('event').setValue(event);
    // console.log('Selected event:', event);
  }


  filterUniqueParticipant(){
    this.uniqueParticipantList = Array.from(new Set(this.dataSource.filteredData.map(e => e["profileid"])))
    this.aggregateTableValue = {}
    this.dataSource.filteredData.forEach((data) => {
      Object.keys(data).forEach(key =>{
        if(Number.isInteger(data[key])){
          this.aggregateTableValue[key] = this.aggregateTableValue[key] || 0
          this.aggregateTableValue[key] += data[key]
        }
      })
    }, {})
    this.aggregateTableValue["atccompletionpercentage"] = Math.floor((this.aggregateTableValue["atccompletionpercentage"] / this.dataSource.filteredData.length))
    // console.log(this.aggregateTableValue)
  }
  getTopProcedures(count: number = 3): any[] {
    // Sort procedures by total count in descending order and get top 'count'
    return [...this.proceduresArray]
      .sort((a, b) => b.total - a.total)
      .slice(0, count);
  }
  toggleProceduresView(): void {
    this.showAllProcedures = !this.showAllProcedures;
  }
  onclear(){
    this.filter = {
      name:[],
      product:[],
      eventnew:null,
      abscent:[],
      present:[],
      // lastactivity:null
      lastActivityOperator: '',
      lastActivityHours: 24,
      breakthroughs:'',
      procDFO_Operator:'>',
      procCount:0,
      ael:'',
      adj:'',
      proc:'',
      proc_c_Operator:">=",
      procedurecompletioncount:0,
      procedurecompletionpercentage:0,
      atcmodel:[],
      author:[],
      atc:null
    }
    this.onFilter()
  }

  getUniqueListOfParticipants(){
    let arrayofprofileid = (this.dataSource.filteredData || []).map(e => e['profileid'])
    let getUniquelist = Array.from(new Set(arrayofprofileid))
    return getUniquelist.length
  }

  onSearchParticipants(){
    let filterText = ![null,undefined,''].includes(this.searchtext) ? this.searchtext.toLowerCase().trim() : ""
    return this.filteredEventParticipants = this.eventParticipants.filter(e => this.mapprofile[e['profileid']].toLowerCase().includes(filterText))
  }
  onSearchProfile(){
    let filterText = ![null,undefined,''].includes(this.searchProfileText) ? this.searchProfileText.toLowerCase().trim() : ""
    return this.filteredProfileList = Object.keys(this.mapprofile).filter(e => this.mapprofile[e].toLowerCase().includes(filterText))
  }

  async exportCSV(){
    var data = []
    for (let i = 0; i < this.dataSource.filteredData.length; i++) {
      const row = this.dataSource.filteredData[i];
      data.push({
        'Name':this.mapprofile[row['profileid']],
        "First Timer":row['eventnew'] ? 'New' : 'Old',
        'Journey':this.mapactivejourney[row['profileid']] ? this.mapJourney[this.mapactivejourney[row['profileid']]] : 'None',
        'Products':row['arenaproducts'] ? row['arenaproducts'].map(e => this.mapProductsNameById[e]).join("/") : [],
        'ATC Model':row['atcmodel'],
        'Prescription Date':row['prescription_date'],
        'Author':`${row['author'].map(e => this.mapprofile[e]).join(" / ")}`,
        'Atc Count':row.atccount ? row.atccount : 0,
        'Total Procedure Completed':row['participanttotalprocedurecompleted'] ? row['participanttotalprocedurecompleted'] : 0,
        'Total Procedure Pending':row['participanttotalprocedurepending'] ? row['participanttotalprocedurepending'] : 0,
        'Procedure Completion Percentage': row['procedurecompletionpercentage'] ? row['procedurecompletionpercentage'] : 0,
        'Total Adjustment Completed':row['totaladjustmentcompleted'] ? row['totaladjustmentcompleted'] : 0,
        'Total Adjustment Pending':row['totaladjustmentpending'] ? row['totaladjustmentpending'] : 0,
        'Procedure Done For Others':row['proceduredoneforothers']? row['proceduredoneforothers'] : 0,
        "Attendence" : row['arenaAttendence'] ? row['arenaAttendence'].length : 0,
        "Validated AEL":row['validatedAel'] && row['validatedAel'].length > 0 ? 'Validated' : 'Un Validated',
        "Total Ael":row['ael'] ? row['ael'].length : 0,
        "Event Breakthroughs Post":row['eventbreakthroughs'] ? row['eventbreakthroughs'].length : 0
      })
    }
    this.downloadFile(data, new Date().toDateString() + this.mapLiveEvent[this.form.value['event'].ref.id]['name'])
  }
  
  downloadFile(data,filename = new Date().toDateString() + this.mapLiveEvent[this.form.value['event'].ref.id]['name']) {
    let csvData = this.ConvertToCSV(data,Object.keys(data[0]) );
    // console.log(csvData)
    let blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    let dwldLink = document.createElement("a");
    let url = URL.createObjectURL(blob);
    let isSafariBrowser = navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1;
    if (isSafariBrowser) {  //if Safari open in new window to save file with random filename.
      dwldLink.setAttribute("target", "_blank");
    }
    dwldLink.setAttribute("href", url);
    dwldLink.setAttribute("download", filename + ".csv");
    dwldLink.style.visibility = "hidden";
    document.body.appendChild(dwldLink);
    dwldLink.click();
    document.body.removeChild(dwldLink);
  }

  ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = '';
    // 'Index,'
    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    // console.log("row",row);
    str += row + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = '';
      // (i + 1) + 
      for (let index in headerList) {
        let head = headerList[index];
        line += array[i][head] + ',';
      }
      str += line + '\r\n';
    }
    // console.log(str);
    return str;
  }

  async onDeleteATC(row){
    if(confirm("are you sure want to delete")){
      getDoc(doc(this.firestoreDefault,"temporary function access","atcaccess")).then(async snap => {
        this.temporaryFunctionAccess = snap.data()['profilelist'] || []
        if(this.temporaryFunctionAccess.includes(this.loggedProfileID)){
          console.log(row['atcid'],this.mapprofile[row['profileid']],row['prescription_date'])
          await updateDoc(doc(this.firestoreATC,"atc_alpha",row['atcid']),{
            isdelete:true,
            deletedDate:new Date()
          }).then(() => {
            alert("document successfully mark as deleted")
            console.log("document successfully deleted")
          })
        }else{
          alert("access denied contact tech team")
        }
      })
      
    }
  }
}
