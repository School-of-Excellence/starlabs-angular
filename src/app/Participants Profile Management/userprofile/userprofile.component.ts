import { AfterViewInit, Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { Storage } from '@angular/fire/storage';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { ReportsDialogComponent } from '../reports-dialog/reports-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { AelEditDialogComponent } from '../ael-edit-dialog/ael-edit-dialog.component';
import { doc, Firestore, getDoc, getDocs, where, query, orderBy, setDoc, collectionData, updateDoc, limit, documentId, collection, FieldPath } from '@angular/fire/firestore';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { VideoPlayerComponent } from '../../video-player/video-player.component';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatCheckboxModule } from '@angular/material/checkbox';


export interface ProductTableData {
  productName: string;
  packageName: string;
  mode: string;
  nextmode: string;
  nextmodedate: string;
  status: string;
  statusDate: string;
}

@Component({
  selector: 'app-userprofile',
  imports: [
    MatIconModule,
    MatInputModule,
    CommonModule,
    MatButtonModule,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    FormsModule,
    MatCardModule,
    MatSidenavModule,
    RouterModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  templateUrl: './userprofile.component.html',
  styleUrl: './userprofile.component.css'
})
export class UserprofileComponent {
  profileId:string;
  // profileId = this.route.snapshot.queryParams['profileid'];
  activeTab = 'Journey';
  eventTab = 'All'
  activesubTab = '';
  messageCurrentlyTyped:string = "";
  addonbonus: any;
  buttonLabel:string="Open Link";
  loadedTabs = new Set<string>();
  tabLoadingStates = new Map<string, boolean>();
  // loading:boolean = false;
  loadingQueue:boolean = false;
  isPopupChatVisible:boolean = false;

  mapProfile = {};
  mapAddress = {};
  profileimage = {};
  mapjourney = {};
  mapproduct = {};
  journeyproduct = {};
  mapPackage = {};
  mapevents = {};
  mapQueue = {};
  mapAppointment = {};
  mapWorkshop = {};
  queueData = {};
  participantproductlist = {};
  mappostcategory = {};
  aeldata = []
  participantsproduct = []
  mapReport = {
    "crossover": "AEL Crossover Metric",
    "evolutionprogress": "Evolution Progress",
    "loveletter": "A&H Love Letter",
    "askah": "Ask A&H"
  };
  profileJourneyProduct = {};
  selectedIndexes = {};
  chatList = {};
  expandedStages: { [key: string]: boolean } = {};

  participantjourney = [];
  participantevents = [];
  participantforms = [];
  workshopList = [];
  userData = {};
  userProfileData = {}
  participantreports = [];
  breakthroughs = [];
  liveEvolutionMapping = [];
  participantAppointments = []
  modeList = []
  notificationList = []
  mapVideoTitle: {} = {};
  mapRecordedDate : {} = {}
  customerticket = [];
  addonproduct: any = [];
  bonusproduct: any = [];
  products = [];
  displayQueueStages = [];
  aelEditData:any[] = [];
  pinnedChatList = [];
  unattendedEvent = []
  attendedEvent = []
  upcomingEvent = []
  fullAccess:boolean;
  openProductsection = false
  subscription = new Subject<void>()
  isloading = false

  touchpointList = []
  selectedTouchPoint = []
  timedelayTouchPoint = []
  timeDelayAvg = null
  showStatusEditor = false;
  selectedStatus = ''

  tabs = [
    'Journey',
    'Events',
    'Appointments',
    'Customer Tickets',
    'Forms Filled',
    'Interim Reports',
    'Breakthroughs',
    'AEL',
    'Notifications',
    'Touch Point'
  ];

  currentPages = {
    allEvents: 0,
    attendedEvents: 0,
    unattendedEvents: 0,
    upcomingEvents: 0,
    appointments: 0,
    notifications: 0,
    forms: 0,
    reports: 0,
    touchpoint: 0
  };

  // Paginated data getters
  get paginatedAllEvents() {
    const startIndex = this.currentPages.allEvents * this.pageSize;
    return this.participantevents.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedAttendedEvents() {
    const startIndex = this.currentPages.attendedEvents * this.pageSize;
    return this.attendedEvent.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedUnattendedEvents() {
    const startIndex = this.currentPages.unattendedEvents * this.pageSize;
    return this.unattendedEvent.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedUpcomingEvents() {
    const startIndex = this.currentPages.upcomingEvents * this.pageSize;
    return this.upcomingEvent.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedAppointments() {
    const startIndex = this.currentPages.appointments * this.pageSize;
    return this.participantAppointments.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedNotifications() {
    const startIndex = this.currentPages.notifications * this.pageSize;
    return this.notificationList.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedForms() {
    const startIndex = this.currentPages.forms * this.pageSize;
    return this.participantforms.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedReports() {
    const startIndex = this.currentPages.reports * this.pageSize;
    return this.participantreports.slice(startIndex, startIndex + this.pageSize);
  }

  get paginatedTouchpoint() {
    const startIndex = this.currentPages.touchpoint * this.pageSize;
    return this.touchpointList.slice(startIndex, startIndex + this.pageSize);
  }

  displayedColumns: string[] = ['sno','created','business','career','family','health','personalGenius'];
  productdisplayedColumns: string[] = [
    'productName',
    'packageName', 
    'mode',
    'nextmode',
    'nextmodedate',
    'status',
    'statusdates'
  ];
  
  productdataSource = new MatTableDataSource<ProductTableData>([]);

  currentMonth: Date;
  loggedInProfileId:any = null
  chatlistsubscription;
  pinnedChatSubscription;
  @ViewChildren('stageElement') stageElements!: QueryList<ElementRef>;

  dataSource = new MatTableDataSource();
  @ViewChild('paginator1', { static: false }) paginator!: MatPaginator;
  @ViewChild('sort1', { static: false }) sort!: MatSort;
  @ViewChild('paginator2', { static: false }) productpaginator!: MatPaginator;
  @ViewChild('sort2', { static: false }) productsort!: MatSort;


  pageSize = 5;
  pageIndex = 0;
  

  @ViewChild('paginator1') set matPaginator(paginator: MatPaginator) {
    if (paginator) {
        this.paginator = paginator;
        this.dataSource.paginator = paginator;
    }
  }

  @ViewChild('sort1') set matSort(sort: MatSort) {
    if (sort) {
        this.sort = sort;
        this.dataSource.sort = sort;
    }
  }

  @ViewChild('paginator2') set productMatPaginator(productpaginator: MatPaginator) {
    if (productpaginator) {
        this.productpaginator = productpaginator;
        this.productdataSource.paginator = productpaginator;
    }
  }

  @ViewChild('sort2') set productMatSort(productsort: MatSort) {
    if (productsort) {
        this.productsort = productsort;
        this.productdataSource.sort = productsort;
    }
  }


   //loading function
    get loading(){
      return this.dialog.open(LoadingProgressComponent,{data:{msg:'Processing Please Wait ...'},disableClose:true})
    }

  constructor(
    private route: ActivatedRoute,
    public firestore: Firestore,
    private storage: Storage,
    private guard: AuthguardService,
    private datePipe: DatePipe,
    public router: Router,
    public dialog: MatDialog,

  ) {
    // this.route.params.subscribe(params => {
    //   this.profileId = params['id']; 
    // });
    this.guard.getRoles().then(async roles=>{
      // if(roles["admin"] || roles["ah"]){
      if(roles["developer"]||roles["admin"] || roles["ah"]){
        this.fullAccess = true;
        console.log("Good")
      }
      else{
        this.fullAccess = false;
      }
      this.loggedInProfileId = roles['profile_ref'].id
      console.log("loggedIn ",this.loggedInProfileId);
    })
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map
      this.mapAddress = e.address
    })
    
    this.guard.getJourneyMap().then(e => {
      this.mapjourney = e
    })
    this.guard.getProductMap().then(e => {
      this.mapproduct = e
    })

    this.guard.getPackageMap().then(e => {
      this.mapPackage = e
    })

    this.guard.getAppointmentMap().then(e => {
      this.mapAppointment = e.map
    })

    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    // this.scrollToCurrentStage();
    this.route.params.subscribe(async params => {
      this.profileId = params['id'];
    });

    
  }

  async ngOnInit() {
   
    try {
      // Only load essential data and Journey tab (default) 
      await Promise.all([
        this.loadTabData('Journey')
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } 
  }

  async selectTab(tabName: string) {
    const previousTab = this.activeTab;
    this.activeTab = tabName;
    
    // Load data for the selected tab if not already loaded
    if (!this.loadedTabs.has(tabName)) {
      await this.loadTabData(tabName);
    }
  }

  async seteventTab(tabName: string) {
    const previousTab = this.eventTab;
    this.eventTab = tabName;
  }


  private async loadTabData(tabName: string) {
    console.log("Selected Tab", tabName)
    if (this.loadedTabs.has(tabName)) {
      return; // Already loaded
    }

    this.tabLoadingStates.set(tabName, true);
    
    try {
      switch (tabName) {
        case 'Journey':
          await this.loadJourneyData();
          break;
        case 'Events':
          await this.loadEventsData();
          break;
        case 'Customer Tickets':
          await this.fetchClientIssues();
          break;
        case 'Forms Filled':
          await this.fetchForms();
          break;
        case 'Appointments':
          await this.fetchAppointments();
          break;
        case 'Mode Tracker':
          await this.fetchModes();
          break; 
        case 'Interim Reports':
          await this.fetchReports();
          break;
        case 'Breakthroughs':
          await this.fetchBreakthroughs();
          break;
        case 'AEL':
          await this.fetchAELData();
          break;
        case 'Evolution Mapping':
          await this.fetchVideos();
          break;
        case 'OnGoing Event':
          await this.fetchOngoingQueue();
          break;
        case 'Notifications':
          await this.fetchNotifications();
          break;  
        case 'Touch Point':
          await this.fetchParticipantTouchPoint();
          break;  
        default:
          console.log("Condition Failed", tabName);
      }
      
      this.loadedTabs.add(tabName);
    } catch (error) {
      console.error(`Error loading ${tabName} data:`, error);
    } finally {
      this.tabLoadingStates.set(tabName, false);
    }
  }

  // Helper method to check if tab is loading
  isTabLoading(tabName: string): boolean {
    return this.tabLoadingStates.get(tabName) || false;
  }

  // Helper method to check if tab data is loaded
  isTabLoaded(tabName: string): boolean {
    return this.loadedTabs.has(tabName);
  }

  // Individual tab loading methods
  private async loadJourneyData() {
    let loadingRef = this.loading
    const [
      profileData,
      participantData,
      participantJourneySnap,
      participantProductsSnap,
    ] = await Promise.all([
      getDoc(doc(this.firestore, 'profile_data', this.profileId)),
      getDoc(doc(this.firestore, 'participant metadata', this.profileId)),
      getDocs(query(collection(this.firestore, 'participantjourneyproduct'), where('profileid', '==', this.profileId))),
      getDocs(query(collection(this.firestore, 'participantsproduct'), where('profileid', '==', this.profileId)))
    ]);
    // profile data
    var returnProfile = profileData.data()
    this.mapProfile[profileData.id] = returnProfile["name"]
    this.mapAddress[profileData.id] = returnProfile["address"]
    this.userProfileData = returnProfile
    // Meta Data
    this.userData = participantData.exists() ? participantData.data() : {}
    // journey data
    this.participantjourney = participantJourneySnap.docs.map(docs => docs.data())
    // productdata
    participantProductsSnap.docs.map(docs => {
      let element = docs.data()
      this.participantsproduct.push(element)
      this.participantproductlist[element['docid']] = element; 
    })
    this.productdataSource.data = this.participantsproduct
    loadingRef.close();
    
    // Sort after loading
    this.participantjourney.sort((a, b) => {
      const statusA = a.journeystatus === 'ongoing' ? 0 : 1;
      const statusB = b.journeystatus === 'ongoing' ? 0 : 1;
      return statusA - statusB;
    });
  }

  private async loadEventsData() {
    await Promise.all([
      // this.fetchEvents(),
      this.fetchEventProfiles()
    ]);
  }

  private async fetchAELData() {
    const collectionRef = collection(this.firestore, 'interim crossover')
    getDocs(query(collectionRef, where('profileid','==',this.profileId))).then((interimCrossover)=>{
      if(interimCrossover.docs.length != 0){
        this.aeldata = []
        console.log("interim crossover size",interimCrossover.size);
        interimCrossover.docs.forEach((doc)=>{
          const interimData = doc.data()
          let obj = {
            created: interimData['created'],
            aelid:interimData['aelid'],
            business:interimData['metric']['Business'],
            career:interimData['metric']['Career'],
            family:interimData['metric']['Family'],
            health:interimData['metric']['Health'],
            personalGenius:interimData['metric']['Personal Genius'],
            docid: interimData['docid'],
            metric:interimData['metric']
          } 
          this.aeldata.push(obj)
        })
        this.aeldata.sort((a, b)=>b['created'].toDate() - a['created'].toDate())
        this.dataSource.data = this.aeldata;
      }else {
        console.log(" No Interim Crossover ");
      }
    })
  }
 

  private async fetchEvents() {
    const eventRef = collection(this.firestore, 'event collection');
    const snapshot = await getDocs(eventRef);
    const queueRef = collection(this.firestore, 'queue generation');
    const snap = await getDocs(queueRef);
    for (let i = 0; i < snapshot.docs.length; i++) {
      const element = snapshot.docs[i].data();
      this.mapevents[snapshot.docs[i].id] = element;
    }
    for (let j = 0; j < snap.docs.length; j++) {
      const element = snap.docs[j].data();
      this.mapevents[snap.docs[j].id] = element;
    }
    
  }

  private async fetchEventProfiles() {
    this.isloading = true
    // const events_profilesRef = query(collection(this.firestore, 'events_profiles'), where('profile_ref', '==', doc(this.firestore, 'profile_data', this.profileId)));
    // const snapshot = await getDocs(events_profilesRef);

    // // const eventRequestIds = snapshot.docs.filter(doc => doc.data()['eventrequest']?.id !== undefined).map(doc => doc.data()['eventrequest'].id);
    // const eventRequestIds = [...new Set(
    //   snapshot.docs
    //     .filter(doc => doc.data()['eventrequest']?.id !== undefined)
    //     .map(doc => doc.data()['eventrequest'].id)
    // )];

    

    // if (eventRequestIds.length === 0) {
    //   return;
    // }

    const eventRequestsQuery = query(
      collection(this.firestore, 'event participation request'),
      where('profileid', '==', this.profileId)
      // where('docid', 'in', eventRequestIds)
    );
    const snap = await getDocs(eventRequestsQuery);

    var eventcollectionid = []
    var queuecollectionid = []

    var allevent = []
    var unattended = []
    var attended = []
    var approved = []
    for (let i = 0; i < snap.docs.length; i++) {
      const document = snap.docs[i];
      var data = document.data()
      allevent.push(data)
      var eventRef = doc(this.firestore, data["eventref"].path)
      if(eventRef.parent.id == "event collection"){
        eventcollectionid.push(eventRef.id)
      }
      if(eventRef.parent.id == "queue generation"){
        queuecollectionid.push(eventRef.id)
      }

      if(data["status"] == "unattended"){
        unattended.push(data)
      }
      else if(data["status"] == "attended"){
        attended.push(data)
      }
      else if(data["status"] == "approved"){
        approved.push(data)
      }
    }
    this.isloading = false

    if(eventcollectionid.length != 0){
      const eventRef = collection(this.firestore, 'event collection');
      var querylist = []
      if(eventcollectionid.length <= 30){
        querylist.push(where(documentId(), "in", eventcollectionid))
      }
      const snapshot = await getDocs(query(eventRef, ...querylist));
      for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j].data();
        this.mapevents[snapshot.docs[j].id] = element;
      }
    }
    if(queuecollectionid.length != 0){
      const eventRef = collection(this.firestore, 'queue generation');
      var querylist = []
      if(queuecollectionid.length <= 30){
        querylist.push(where(documentId(), "in", queuecollectionid))
      }
      const snapshot = await getDocs(query(eventRef, ...querylist));
      for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j].data();
        this.mapevents[snapshot.docs[j].id] = {
          name: element["queuename"],
          start_date: element["queuestartdate"],
          end_date: element["queueenddate"],
        };
      }
    }

    this.participantevents = allevent // snap.docs.map(doc => doc.data());
    this.unattendedEvent = unattended // this.participantevents.filter(e => e['status'] === 'unattended')
    this.attendedEvent = attended // this.participantevents.filter(e => e['status'] === 'attended')
    this.upcomingEvent = approved // this.participantevents.filter(e => e['status'] === 'approved')
    console.log( this.unattendedEvent,this.attendedEvent,this.upcomingEvent);
    
    
    this.participantevents.sort((a, b) => {
      const dateA = this.mapevents[a['eventref'].id]['start_date'].toDate();
      const dateB = this.mapevents[b['eventref'].id]['start_date'].toDate();
      return dateB - dateA;
    });
  
    
  }

  private async fetchClientIssues() {
    this.isloading = true
    const snapshot = await getDocs(query(
      collection(this.firestore, 'clientissue'),
      where('clientid', '==', this.profileId)
    ));
    
    const tickets = snapshot.docs.map(doc => doc.data());
    tickets.sort((a, b) => b['reporteddate'].toDate() - a['reporteddate'].toDate());
    this.customerticket.push(...tickets);
    this.isloading = false
  }

  private async fetchForms() {
    this.isloading = true
    await getDocs(collection(this.firestore, 'queue generation')).then(res => {
      for (let i = 0; i < res.docs.length; i++) {
        const element = res.docs[i].data();
        this.mapQueue[res.docs[i].id] = element['queuename']
      }
    })

    // console.log(this.mapQueue);
    
    const formsByClient = query(collection(this.firestore, 'formsByClient'), where('profileid', '==', this.profileId));
    const snapshot = await getDocs(formsByClient);
    this.isloading = false
    
    const forms = snapshot.docs.map(doc => doc.data());
    forms.sort((a, b) => b['date']?.toDate() - a['date']?.toDate());
    this.participantforms.push(...forms);
    console.log(this.participantforms);
    
  }

  private async fetchReports() {
    this.isloading = true
    const interimreportRef = collection(this.firestore, "interimreport log");
    const snapshot = await getDocs(query(interimreportRef, where('profileid', '==', this.profileId)));
    
    const reports = snapshot.docs.map(doc => {
      const element = doc.data();
      // element["reportlist"] = (element["reports"] ?? []).map(e => "- " + this.mapReport[e]).join("\n");
      return element;
    });
    this.isloading = false
    
    reports.sort((a, b) => {
      const dateA = a['lastupdate']?.toDate();
      const dateB = b['lastupdate']?.toDate();
      return dateB - dateA;
    });
    
    this.participantreports.push(...reports);
    console.log(this.participantreports);
    
  }

  

  private async fetchBreakthroughs() {
    this.isloading = true
    this.fetchPostCategories()
    const snapshot = await getDocs(query(
      collection(this.firestore, 'Achievements/posts/postcollection'),
      where('profileid', '==', this.profileId)
    ));
    
    const breakthroughspost = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const postData = doc.data();
        
        // Get likes count for this post
        const likesSnapshot = await getDocs(
          collection(this.firestore, `Achievements/posts/postcollection/${doc.id}/likes`)
        );
        
        return {
          ...postData,
          id: doc.id, 
          likesCount: likesSnapshot.size 
        };
      })
    );
    this.isloading = false
    
    breakthroughspost.sort((a, b) => b['created'].toDate() - a['created'].toDate());
    
    this.breakthroughs.push(...breakthroughspost);
  }

  private async fetchVideos() {
    this.mapVideoTitle = {};
    this.mapRecordedDate = {};
    
    const [evolutionVideos, liveVideos] = await Promise.all([
      getDocs(collection(this.firestore, 'evolutionmappingvideo')),
      getDocs(query(collection(this.firestore, 'liveevolutionmapping'), where('profileid', '==', this.profileId)))
    ]);

    for (let i = 0; i < evolutionVideos.docs.length; i++) {
      const data = evolutionVideos.docs[i].data();
      this.mapVideoTitle[data['videourl']] = data['title'];
      this.mapRecordedDate[data['videourl']] = data['recordeddate'];
    }

    for (let j = 0; j < liveVideos.docs.length; j++) {
      const data = liveVideos.docs[j].data();
      this.mapVideoTitle[data['videourl']] = data['title'];
      this.mapRecordedDate[data['videourl']] = data['recordeddate'];
    }
  }

  private async  fetchAppointments(){
    const snapshot = await getDocs(query(collection(this.firestore, 'appointments'), where('bookedby', '==', doc(this.firestore, 'profile_data', this.profileId))))
    // this.participantAppointments = snapshot.docs.map(e => e.data())
    var hostid = []
    var appointments = []
    for (let i = 0; i < snapshot.docs.length; i++) {
      const document = snapshot.docs[i];
      var data = document.data()
      appointments.push(data)
      hostid.push(...data["hosts"].map(e => e.id))
    }
    this.participantAppointments = appointments
    if(hostid.length != 0){
      hostid = Array.from(new Set(hostid))
      for (let i = 0; i < hostid.length; i+=30) {
        const profileid = hostid.slice(0, i+30);
        var collectionRef = collection(this.firestore, "profile_data")
        var queryRef = query(collectionRef, where(documentId(), "in", profileid))
        getDocs(queryRef).then(list =>{
          for (let a = 0; a < list.docs.length; a++) {
            const profileDoc = list.docs[a];
            this.mapProfile[profileDoc.id] = profileDoc.data()["name"]
          }
        })
      }
    }
  }

  async fetchParticipantTouchPoint(){
    await getDoc(doc(this.firestore, "classify", "touchpoint")).then(doc =>{
      if(doc.exists()){
        var data = doc.data()
        this.selectedTouchPoint = Array.from(new Set(data["touchpointlist"]))
        this.timedelayTouchPoint = Array.from(new Set(data["timedelaytouchpoint"] ?? data["touchpointlist"]))
      }
    })
    console.log("Time Delay", this.timedelayTouchPoint)

    const snapshot = await getDocs(query(collection(this.firestore, 'participant touchpoint'), where('profileid', '==', this.profileId)))
    this.touchpointList = snapshot.docs.map(e => e.data()).sort((a, b) => b["touchpointdate"].toDate() - a["touchpointdate"].toDate())

    this.updateTimeDelayTouchPoint(null)
  }

  updateTimeDelayTouchPoint(touchpoint){
    if(touchpoint != null){
      console.log()
      if(this.timedelayTouchPoint.includes(touchpoint)){
        this.timedelayTouchPoint.splice(this.timedelayTouchPoint.indexOf(touchpoint), 1)
      }
      else{
        this.timedelayTouchPoint.push(touchpoint)
      }
    }

    // Calculate Time Delay
    var timeline = this.touchpointList.filter(e => this.timedelayTouchPoint.includes(e["touchpoint"])).map(e => e["touchpointdate"].toDate()).sort((a, b) => a - b)
    console.log("Date Timeline", timeline)

    let totalDiff = 0;
    for (let i = 1; i < timeline.length; i++) {
      totalDiff += (timeline[i] - timeline[i - 1]);
    }

    // Average in ms
    const avgMs = totalDiff / (timeline.length - 1);

    // Convert to readable format
    const avgSec = avgMs / 1000;
    const days = Math.floor(avgSec / 86400);
    const hours = Math.floor((avgSec % 86400) / 3600);
    const minutes = Math.floor((avgSec % 3600) / 60);
    const seconds = Math.floor(avgSec % 60);

    this.timeDelayAvg = `${days}d ${hours}h ${minutes}m ${seconds}s`
    
    console.log("Average delay in days:", this.timeDelayAvg);
  }

  private async fetchModes(){
    const snapshot = await getDocs(query(collection(this.firestore, 'participant mode checklist'), where('profileid', '==', this.profileId)))
    this.modeList = snapshot.docs.map(e => e.data())
  }

  private async fetchNotifications(){
    this.isloading = true
    console.log("Profile User Ref", this.userProfileData["user_ref"])
    if(this.userProfileData["user_ref"]){
      var uid = this.userProfileData["user_ref"].id
      const logsSnapshot = await getDocs(query(collection(this.firestore, 'notifications', uid, 'logs'), orderBy('date', 'desc'), limit(100)));
      this.notificationList = logsSnapshot.docs.map(e => e.data())
      console.log(this.notificationList);
    }
    // const snapshot = await getDocs(query(collection(this.firestore, 'notifications'), where('name', '==', this.mapProfile[this.profileId])))
    // if(snapshot.docs.length != 0){
    //   let notificationDoc =  snapshot.docs[0].id
    //   console.log(notificationDoc);
      
    //   const logsSnapshot = await getDocs(query(collection(this.firestore, 'notifications', notificationDoc, 'logs'), orderBy('createdon', 'desc'), limit(100)));
    //   this.notificationList = logsSnapshot.docs.map(e => e.data())
    //   console.log(this.notificationList);
      
    // }
    this.isloading = false
  }


  private async fetchPostCategories() {
    const snapshot = await getDocs(collection(this.firestore, 'post_categories'));

    for (let i = 0; i < snapshot.docs.length; i++) {
      const element = snapshot.docs[i].data();
      this.mappostcategory[snapshot.docs[i].id] = element['type'];
    }
  }
  

  // Generic page change handler
  onPageChange(event: any, dataType: string) {
    this.currentPages[dataType] = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  // Helper method to get total count for each data type
  getTotalCount(dataType: string): number {
    switch(dataType) {
      case 'allEvents': return this.participantevents.length;
      case 'attendedEvents': return this.attendedEvent.length;
      case 'unattendedEvents': return this.unattendedEvent.length;
      case 'upcomingEvents': return this.upcomingEvent.length;
      case 'appointments': return this.participantAppointments.length;
      case 'notificatons': return this.notificationList.length;
      case 'forms': return this.participantforms.length;
      case 'reports': return this.participantreports.length;
      case 'touchpoint': return this.touchpointList.length;
      default: return 0;
    }
  }

  


  get formattedDateOfBirth() {
    return this.userData && this.userData['dateofbirth'] ? this.datePipe.transform(this.userData['dateofbirth'].toDate(), 'dd/MM/yyyy') : ''
  }

  calculateAge(birthDate: Date | null | undefined) {
    if (!birthDate) {
      return '';
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
    // openDialog(): void {
    //   const dialogRef = this.dialog.open(NewReleaseDialogComponent, {
    //     width: '100%',
    //     height:'85%',
    //     data: {
    //       content: {
    //         "Interim Report": "When a row in the Interim Report section's table is clicked, a dialog will open displaying a detailed report of the user's Cross Over Metric, Evolution Progress, Love Letter, and Ask A&H.",
    //         "AEL": "A new AEL section has been added. It contains a table listing all AEL entries filled by the user, along with an edit button to modify the AEL.",
    //       },        
    //       date: "26/12/2024",
    //       screenname: "UserProfile Screen"
    //     }
    //   });
    // }
  

  ngOnDestroy(){
    this.subscription.complete()
    this.subscription.next()
  }
  
  toggleProductSection(journey): void {
    journey.showProductSection = !journey.showProductSection;
  }

  openAllproduct(){
    this.openProductsection = !this.openProductsection
  }
  // reportView(report){
  //   console.log("reportview ",report);
    
  // }
  reportView(element) {    
    var dialogRef = this.dialog.open(ReportsDialogComponent, { 
      data: {
        element: element,
      },
      autoFocus: false,
      width: '90%',
      height: '95%',
    });
    firstValueFrom(dialogRef.afterClosed()).then(value => {
      if (value != null) {
       
      }
    });
  }
  async navigatetoTimeline(doc:any,engagementCategory,option: string){
  // const userResponse = confirm("Click 'Yes' if you want to view the Absolute timeline, or click 'Cancel' if you want to view the Relative timeline.");
    this.currentMonth = new Date(); 
    console.log("currentMonth", this.currentMonth);
    const fiveMonthsBefore = new Date(this.currentMonth);
    fiveMonthsBefore.setMonth(this.currentMonth.getMonth() - 5);
    console.log("Date 5 months before currentMonth", fiveMonthsBefore);
    console.log("currentMonthcurrentMonth",this.currentMonth);
    let listofprofileid = []
    let listofparticipants = doc
    let category = engagementCategory
    const docData = {
      profileid: this.loggedInProfileId,
      listofprofileid: listofprofileid,
      engagement:category,
      absolutedate:fiveMonthsBefore,
      timelinetype:option
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
    var docid = doc(this.firestore, 'filteredtimeline profile').id;
    const docRef = doc(this.firestore, 'filteredtimeline profile', docid)
    await setDoc(docRef, {
      profileid: this.loggedInProfileId,
      listofprofileid : listofparticipants,
      engagement:category,
      absolutedate:fiveMonthsBefore,
      timelinetype:option
    })
    console.log("console doc id",docid);
    
    const navigationurl = 'usertimeline'
    const url = this.router.createUrlTree([`/${navigationurl}`], { queryParams: { docid }})
    window.open(url.toString(), '_blank')     
  }
  // selectTab(tab: string) {
  //   this.activeTab = tab;
  //   this.activesubTab = ''
  // }

  selectsubTab(subtab: string) {
    this.activeTab = ''
    this.activesubTab = subtab;
  }

  onFormPreview(form:any){
    let path = doc(this.firestore, 'formsByClient', form['docid']).path
    const url = this.router.createUrlTree(['/formtemplate'],{queryParams:{id:form.formid,type:'form',patchdata:path}})
    // const url = this.router.navigateByUrl(`/formtemplate?id=${form.formid}&patchdata=${path}`)
    window.open(url.toString(), '_blank')
  }
  editRow(row: any) {
    var dialogRef = this.dialog.open(AelEditDialogComponent, { 
      data: {
        element: row,
      },
      autoFocus: false,
      width: '90%',
      height: '95%',
    });
    dialogRef.afterClosed().subscribe(value => {
      console.log('Dialog closed');
      console.log('Editing row id:', row['docid']);
      console.log('Editing row:', row);  
      // this.loadTableData();
    });
    console.log('Editing row id:', row['docid']);
    console.log('Editing row:', row);
  };

  async fetchOngoingQueue() {
    this.loadingQueue = true;
    const today = new Date();
    this.profileJourneyProduct['group'] = {};
  
    try {
      // Phase 1: Get participant product and deliverables in parallel
      const [participantProduct, deliverables] = await Promise.all([
        this.getParticipantProduct(),
        this.getParticipantProductId().then(id => 
          id ? this.getDeliverables(id) : null
        )
      ]);
  
      if (!participantProduct) {
        console.log("No Ongoing Events");
        this.loadingQueue = false;
        return;
      }
  
      if (!deliverables) {
        console.log("No Deliverables");
        this.loadingQueue = false;
        return;
      }
  
      // Phase 2: Get queue token and queue data in parallel
      const [queueToken, currentEvent] = await Promise.all([
        this.getQueueToken(deliverables),
        this.getCurrentEvent(today)
      ]);
  
      if (!queueToken) {
        console.log("NO QUEUE TOKEN FOUND");
        this.loadingQueue = false;
        return;
      }
  
      // Phase 3: Get queue data and process groups
      const queueData = await this.getQueueData(queueToken);
      if (queueData) {
        this.processQueueGroups(queueData, queueToken['currentstage']);
        
        // Phase 4: Setup chat subscriptions (non-blocking)
        this.setupChatSubscriptions(queueData['docid']);
      }
  
      console.log("PROFILE JOURNEY PRODUCT", this.profileJourneyProduct);
      console.log(this.selectedIndexes);
  
    } catch (error) {
      console.error("Error in fetchOngoingQueue:", error);
    } finally {
      this.loadingQueue = false;
      // Scroll after UI updates
      setTimeout(() => {
        this.scrollToCurrentStage();
      }, 500);
    }
  }
  
  // Helper methods for better organization and reusability
  private async getParticipantProduct() {
    const snapshot = await getDocs(query(
      collection(this.firestore, 'participantsproduct'), 
      where("profileid", "==", this.profileId)
    ));
  
    if (snapshot.docs.length === 0) {
      return null;
    }
  
    const doc = snapshot.docs[0];
    this.profileJourneyProduct['participantproductid'] = doc.id;
    this.profileJourneyProduct['participantproductdata'] = doc.data();
    
    return { id: doc.id, data: doc.data() };
  }
  
  private async getParticipantProductId(): Promise<string | null> {
    // If already fetched, return cached value
    if (this.profileJourneyProduct['participantproductid']) {
      return this.profileJourneyProduct['participantproductid'];
    }
    
    const product = await this.getParticipantProduct();
    return product ? product.id : null;
  }
  
  private async getDeliverables(participantProductId: string) {
    const snapshot = await getDocs(query(
      collection(this.firestore, 'deliverables'),
      where("participantproductid", "==", participantProductId),
      where("type", "==", "queue"),
      where("status", "==", "ongoing")
    ));
  
    if (snapshot.docs.length === 0) {
      return null;
    }
  
    const deliverables = snapshot.docs[0].data();
    this.profileJourneyProduct['deliverables'] = deliverables;
    return deliverables;
  }
  
  private async getQueueToken(deliverables: any) {
    const fileRef = deliverables['fileref'];
    if (!fileRef || fileRef.length === 0) {
      return null;
    }
  
    const tokenPath = fileRef[fileRef.length - 1].path;
    const queueTokenDoc = await getDoc(doc(this.firestore, tokenPath));
    
    if (!queueTokenDoc.exists()) {
      return null;
    }
  
    const queueTokenData = queueTokenDoc.data();
    this.profileJourneyProduct['queuetoken'] = queueTokenData;
    this.profileJourneyProduct['currentstage'] = queueTokenData['currentstage'];
    
    return queueTokenData;
  }
  
  private async getQueueData(queueToken: any) {
    const queueDataDoc = await getDoc(doc(this.firestore, queueToken['queueref'].path));
    
    if (!queueDataDoc.exists()) {
      return null;
    }
  
    const queueData = queueDataDoc.data() ?? {};
    this.profileJourneyProduct['queueData'] = queueData;
    
    // Set current event reference
    this.profileJourneyProduct["currenteventref"] = doc(this.firestore, queueDataDoc.ref.path);
    
    // Get current event name (non-blocking)
    this.getCurrentEventName(queueDataDoc.ref.path);
    
    return queueData;
  }
  
  private async getCurrentEventName(eventPath: string) {
    try {
      const currentEventDoc = await getDoc(doc(this.firestore, eventPath));
      if (currentEventDoc.exists()) {
        this.profileJourneyProduct["currenteventname"] = (currentEventDoc.data() ?? {})["queuename"];
      }
    } catch (error) {
      console.error("Error getting current event name:", error);
    }
  }
  
  private async getCurrentEvent(today: Date) {
    // Only fetch if no current event reference exists
    if (this.profileJourneyProduct["currenteventref"]) {
      return null;
    }
  
    try {
      const eventSnapshot = await getDocs(query(
        collection(this.firestore, 'event collection'),
        where("hosts", "array-contains", doc(this.firestore, 'profile_data', this.loggedInProfileId["pid"])),
        where("end_date", ">=", today)
      ));
  
      console.log("Ongoing Event", eventSnapshot.docs.length);
      
      // Find the first ongoing event
      for (const eventDoc of eventSnapshot.docs) {
        const eventData = eventDoc.data() ?? {};
        if (eventData["start_date"].toDate() <= today) {
          this.profileJourneyProduct["currenteventref"] = doc(this.firestore, eventDoc.ref.path);
          
          // Get event name (non-blocking)
          this.getEventName(eventDoc.ref.path);
          break;
        }
      }
    } catch (error) {
      console.error("Error getting current event:", error);
    }
  }
  
  private async getEventName(eventPath: string) {
    try {
      const currentEventDoc = await getDoc(doc(this.firestore, eventPath));
      if (currentEventDoc.exists()) {
        this.profileJourneyProduct["currenteventname"] = (currentEventDoc.data() ?? {})["name"];
      }
    } catch (error) {
      console.error("Error getting event name:", error);
    }
  }
  
  private processQueueGroups(queueData: any, currentStage: string) {
    const { stagegroup, stageproperty, stages } = queueData;
    
    if (!stagegroup || !stageproperty || !stages) {
      console.warn("Missing queue data properties");
      return;
    }
  
    // Create index map once for better performance
    const indexMap = new Map();
    stages.forEach((item: string, index: number) => {
      indexMap.set(item, index);
    });
  
    // Process each group
    for (const groupName of stagegroup) {
      // Skip if group already exists
      if (this.profileJourneyProduct['group'][groupName]) {
        continue;
      }
  
      // Filter and sort stages for this group
      const groupedStages = Object.keys(stageproperty)
        .filter(key => stageproperty[key]['stagegroup'] === groupName)
        .sort((x, y) => (indexMap.get(x) ?? 0) - (indexMap.get(y) ?? 0));
  
      this.profileJourneyProduct['group'][groupName] = groupedStages;
      
      // Find current stage index
      const currentStageIndex = groupedStages.findIndex(stage => currentStage === stage);
      this.selectedIndexes[groupName] = currentStageIndex === -1 ? null : currentStageIndex;
    }
  }
  
  private setupChatSubscriptions(queueDocId: string) {
    const queueDoc = doc(this.firestore, "queue generation", queueDocId);
    const stageChatCollection = collection(queueDoc, "stagechat");
  
    // Chat messages subscription
    const chatQuery = query(stageChatCollection, orderBy('date', 'desc'));
    collectionData(chatQuery, { idField: 'id' })
      .pipe(takeUntil(this.subscription))
      .subscribe((chatsnap) => {
        this.chatList = {};
        
        // Group chat messages by stage more efficiently
        for (const element of chatsnap) {
          const stage = element['stage'];
          if (!this.chatList[stage]) {
            this.chatList[stage] = [];
          }
          this.chatList[stage].push(element);
        }
      });
  
    // Pinned chat subscription
    const pinnedChatQuery = query(
      stageChatCollection,
      where("senderprofileid", '==', this.loggedInProfileId)
    );
    
    collectionData(pinnedChatQuery, { idField: 'id' })
      .pipe(takeUntil(this.subscription))
      .subscribe(snap => {
        this.pinnedChatList = snap;
      });
  }

  onChatPinned(pinnedvalue,chatdoc){
    updateDoc((doc(this.profileJourneyProduct['queueData']['docid']), 'stagechat', chatdoc['docid']), {
      pinned:pinnedvalue
    })
  }
  

  buttonLable(queuedata,stage) {
    
    var queueTokenData = queuedata
    let type;
    let buttonlabel;

    // let currentStage = this.profileJourneyProduct["currentstage"]
    let stageProperty = this.profileJourneyProduct["queueData"]['stageproperty'];
    if (stageProperty[stage]["actiontype"] == "link") {
      type = "link";
      buttonlabel = stageProperty[stage]['calltoaction'] ?? "Open Link";
    } 
    else if (stageProperty[stage]["actiontype"] == "form") {
      type = "form";
      buttonlabel = stageProperty[stage]['calltoaction'] ?? "Click to Fill Form";
    } 
    else if (stageProperty[stage]["actiontype"] == "videoask") {
      type = "videoask";
      // buttonlabel = stageProperty[stage]['calltoaction'] ?? "Open VideoAsk";
      buttonlabel = "Open App to Uploading Video"
    }
    else if (stageProperty[stage]["selfmovable"] == true) {
      type = "selfmovable";
      buttonlabel = stageProperty[stage]['calltoaction'] ?? "Ready for Next Stage"
    } 
    else if ((stageProperty[stage]["compulsoryactivity"] ?? []).length != 0) {
      type = "activity";
      if (queueTokenData["status"] == "instudio") {
        buttonlabel = "In Studio";
      } else if (queueTokenData["queueposition"] != null) {
        buttonlabel = "Queue Position" + queueTokenData["queueposition"];
      } else {
        buttonlabel = queueTokenData["status"] == "ready" ? "Awaiting" : "In Queue";
      }
    } else {
      type = "default";
      buttonlabel = stageProperty[stage]['calltoaction'] ?? "View All Stages";
    }

    return {type, buttonlabel}

  }

  actionButton(data, stage): void {
    let queueData = data;
    let stageproperty = queueData['stageproperty'][stage];
    
    if(stageproperty['actiontype'] == 'link'){
      window.open(stageproperty['actionresource'], "_blank");
      return;
    } else if (stageproperty['actiontype'] == 'form'){
      const formId = stageproperty['actionresource'].id ?? "";
      const queueId = queueData['docid'];
      window.open(window.location.origin + '/formtemplate?id=' + formId + "&type=form&queueid=" + queueId,'_blank');
      return;
    } else if (stageproperty['actiontype'] == 'videoask') {
      return;
    } else if (stageproperty['actiontype'] == 'selfmovable'){
      return;
    }
    
    // Default return for any unhandled cases
    return;
  }

  async sendMessage(){
      
    const check = confirm("Are You Sure want to send in Chat");

    if(check){

      let id = doc(collection(this.firestore, 'queue generation', this.profileJourneyProduct['queueData']['docid'], 'stagechat')).id;
      const ref = doc(this.firestore, 'queue generation', this.profileJourneyProduct['queueData']['docid'], 'stagechat', id)
      await setDoc(ref, {
        docid:id,
        stage:this.profileJourneyProduct['currentstage'],
        senderprofileid:this.loggedInProfileId,
        message: this.messageCurrentlyTyped,
        queueref: doc(this.firestore, 'queue generation',this.profileJourneyProduct['queueData']['docid']),
        date : new Date(),
        pinned : false,
      }).then(() => {
        console.log('Message Sent Successfully');
      }).catch(err => {
        console.log(err);
      });

      this.messageCurrentlyTyped = '';
    }
  }
  scrollToCurrentStage() {
    // Ensure `profileJourneyProduct` and required properties are initialized
    if (!this.profileJourneyProduct || !this.profileJourneyProduct['queueData'] || !this.profileJourneyProduct['queueData']['stageproperty']) {
      console.error("Stage property data is not available.");
      return;
    }
  
    let stageProperty = this.profileJourneyProduct['queueData']['stageproperty'];
    let currentStage = this.profileJourneyProduct['currentstage'];
  
    // Ensure current stage exists
    if (!currentStage || !stageProperty[currentStage]) {
      console.error("Current stage is undefined or invalid.");
      return;
    }
  
    // Ensure `stagegroup` exists before accessing it
    let stageGroup = stageProperty[currentStage]['stagegroup'];
    if (!stageGroup || !this.profileJourneyProduct['group'][stageGroup]) {
      console.error("Stage group is undefined or does not exist.");
      return;
    }
  
    // Get the index of the current stage
    const currentStageIndex = this.profileJourneyProduct['group'][stageGroup].indexOf(currentStage);
    
    if (currentStageIndex === -1) {
      console.error("Current stage index not found.");
      return;
    }
  
    console.log("Scrolling to stage index:", currentStageIndex);
  
    // Ensure `stageElements` are available
    if (!this.stageElements || !this.stageElements.get(currentStageIndex)) {
      console.error("Stage elements are not available yet.");
      return;
    }
  
    // Scroll to the current stage smoothly
    setTimeout(() => {
      this.stageElements.get(currentStageIndex)?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 500);
  }

  togglePopup() {
    this.isPopupChatVisible = !this.isPopupChatVisible;
  }

  toggleShowMore(stage: string) {
    this.expandedStages[stage] = !this.expandedStages[stage];
  }

  getStageSize(stage: string): string {
    const stageExplanation = this.profileJourneyProduct?.['queueData']?.['stageproperty'][stage]?.['stageexplanation'] || '';
    const isExpanded = this.expandedStages[stage];

    if (!stageExplanation) return 'small'; // Default small width
    const length = stageExplanation.length;

    if (!isExpanded) return 'small'; // Default width when collapsed

    if (length < 100) return 'medium';  // Small increase for short text
    if (length < 200) return 'large';   // Medium increase for moderate text
    return 'xlarge';                    // Large increase for long text
  }

  getStatusClass(status: string): string {
    if (!status || status === 'Not Started') {
      return ''; // Default gray styling
    }
    
    switch (status.toLowerCase()) {
      case 'ongoing':
      case 'active':
      case 'in progress':
        return 'ongoing';
      case 'completed':
      case 'finished':
      case 'done':
        return 'completed';
      case 'cancelled':
      case 'not attended':
      case 'missed':
        return 'not-attended';
      default:
        return '';
    }
  }
  
  getStatusText(status: string): string {
    if (!status) {
      return 'Not Started';
    }
    
    switch (status.toLowerCase()) {
      case 'ongoing':
      case 'active':
      case 'in progress':
        return 'On Going';
      case 'completed':
      case 'finished':
      case 'done':
        return 'Completed';
      case 'cancelled':
      case 'not attended':
      case 'missed':
        return 'Not Attended';
      default:
        return status;
    }
  }

  getCategoryIcon(category: string): string {
    switch (category.toLowerCase()) {
      case 'achievement':
        return 'fas fa-trophy';
      case 'personal growth':
        return 'fas fa-seedling';
      case 'relationship':
        return 'fas fa-heart';
      case 'career':
        return 'fas fa-briefcase';
      case 'health':
        return 'fas fa-heart-pulse';
      default:
        return 'fas fa-star';
    }
  }

  getCategoryColor(category: string): string {
    switch (category.toLowerCase()) {
      case 'achievement':
        return '#ffd700';
      case 'personal growth':
        return '#28a745';
      case 'relationship':
        return '#e91e63';
      case 'career':
        return '#1976d2';
      case 'health':
        return '#ff5722';
      default:
        return '#6c757d';
    }
  }

  openStatusEditor() {
    this.showStatusEditor = true;
  }

  closeStatusEditor() {
    this.showStatusEditor = false;
  }
  updateCustomerStatus(){
    if (!this.selectedStatus) {
      return;
    }
    try {
      const profileId = this.userData['profileid'];
      const userRef = doc(this.firestore, 'participant metadata', profileId)
      updateDoc(userRef, {
        customerstatus : this.selectedStatus
      }).then(() => {
        this.userData["customerstatus"] = this.selectedStatus
        this.closeStatusEditor()
        alert(`Customer status updated to "${this.selectedStatus}" successfully!`);
      })
    }catch(error){
      console.error('Error updating customer status:', error);
      alert('Failed to update customer status. Please try again.');
    }
  }
}


