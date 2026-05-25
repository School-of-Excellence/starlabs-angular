import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { arrayUnion, collection, collectionData, collectionSnapshots, deleteDoc, doc, docSnapshots, DocumentData, DocumentReference, Firestore, getDoc, getDocs, getFirestore, onSnapshot, or, orderBy, query, QueryDocumentSnapshot, setDoc, Unsubscribe, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { SnackbarService } from '../../shared/snackbar.service';
import { MatDialog } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CreateMarathonComponent } from '../create-marathon/create-marathon.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GroupDialogComponent } from '../group-dialog/group-dialog.component';
import { ManageCohertsComponent } from '../manage-coherts/manage-coherts.component';
import * as XLSX from 'xlsx';
import { Router } from '@angular/router';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { environment } from '../../../environments/environment.development';
import { HttpClient } from '@angular/common/http';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { Storage,ref,uploadBytes,getDownloadURL } from '@angular/fire/storage';
import { AuthguardService } from '../../authguard.service';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';

@Component({
  selector: 'app-big-dashboard',
  imports: [
    MatSidenavModule,
    MatIconModule,
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatMenuModule,
    MatCheckbox,
    MatTableModule,
    MatDividerModule,
    MatCardModule,
    FormsModule,
    MatPaginator,
    MatChipsModule,
    ReactiveFormsModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './big-dashboard.component.html',
  styleUrl: './big-dashboard.component.css'
})
export class BigDashboardComponent {
  @ViewChild('fileInput') fileInput!: ElementRef;
  // router = inject(Router);
  //table
  dataSource = new MatTableDataSource()
  @ViewChild(MatPaginator) paginator: MatPaginator
  @ViewChild(MatSort) sort: MatSort
  // displayedColumns:String [] = ["select",'name','totalbigopportunitiesused','tags','notes']
  selection = new SelectionModel<any>(true, []);
  selectedColumns = ['select', 'name', "profileid", "tags", "notes"];
  displayedColumns = this.selectedColumns;
  // 'CTD Regular ', 'CTD FT ', 'B!G Regular ', 'B!G FT ', 'uP! Regular ','uP! FT ',"Health Explorative Regular","Health Explorative Fasttrack","LYL Regular","LYL Fasttrack","SMP Regular","SMP Fasttrack"
  private destroy$ = new Subject<void>()
  @ViewChild('sidenav') sidenav: MatSidenav;

  //tags
  particpantsTags = {};
  mapParticipants = {}
  eventsAttendedBig = {}
  participantLiveEventAttendanceMap = {}
  mapEventCollection = {}
  mapATCWritten = {}
  mapATCgotMentoring = {}
  // mapATCMentor = {}
  profile_data = {}
  bigLevel: any = {};
  bigAggregateLevel: any = {};
  bigLevelup = {};
  queueGeneration = {}
  mapJourney = {}
  mapProduct = {}
  mapActivity = {}
  lastCohortsParticipation = {}
  currentCohortsParticipation = {}
  selectedMarathon = {}
  filterForm = {
    name: null,
    tags: [],
  }
  eventsAttendedUP = {
    0: {
      name: "1 - uP! Attended",
      count: 0,
      participantidlist: []
    },
    1: {
      name: "2 - uP! Attended",
      count: 0,
      participantidlist: []
    },
    2: {
      name: "3 - uP! Attended",
      count: 0,
      participantidlist: []
    },
    3: {
      name: "4 & Above - uP! Attended",
      count: 0,
      participantidlist: []
    },
    4: {
      name: "0 - uP! Attended",
      count: 0,
      participantidlist: []
    },
  }

  bigMarathonList = []
  bigTags: any[] = [];
  notes: { text: string, isEditing: boolean }[] = [];
  bigJourneyList: String[] = []
  participantlist = []
  bigNotes: any[] = [];
  eventCollectionList = []
  filteredEventCollectionList = []
  cohortsList = []
  acceleratorEventlist = []
  filteredItemsArray: any[] = [];
  bigAggregateLevelList = []
  beforeDiagnosticLevelList = []
  afterDiagnosticLevelList = [];
  bigAssignmentList = [];
  firstcontainer:any[] = [
    {
      key: "Total Impactul Years",
      value: 0
    },
    {
      key: "Before Diagnostics Capabilities",
      value: {}
    },
    {
      key: "After Diagnostics  Capabilities",
      value: {}
    },
    // {
    //   key : "Not Attended BiG Participants",
    //   value : null
    // }
  ];
  bigLevelUpArray: string[] = ["B!G_REG", "B!G_FT", "LYL_REG", "LYL_FT", "uP!_REG", "uP!_FT", "Health Explorative_REG", "Health Explorative_FT", "CTD_REG", "CTD_FT", "SMP_REG", "SMP_FT"];
  availableColumns = [
    { label: 'Select', value: 'select' },
    { label: 'Name', value: 'name' },
    { label: 'Activity', value: 'activity' },
    { label: 'Tags', value: 'tags' },
    { label: 'Notes', value: 'notes' },
    { label: 'Subscription Start', value: 'subscriptionstart' },
    { label: 'Subscription End', value: 'subscriptionend' },
    { label: 'Active Journey', value: 'activejourney' },
    { label: 'Last Completed Journey', value: 'lastcompletedjourney' },
    { label: 'Active Product', value: 'activeproduct' },
    { label: 'ATC Count', value: 'atccount' },
    { label: 'ATC Written', value: 'atcwritten' },
    { label: 'ATC GotMentoring', value: 'atcgotmentoring' },
    // { label: 'ATC Mentored', value: 'atcmentored' },
    { label: 'Current AEL Count', value: 'currentaelcount' },
    { label: 'Completed AEL Count', value: 'completedaelcount' },
    { label: 'Total AEL Count', value: 'totalaelcount' },
    { label: 'not updated (adj)', value: 'not updated' },
    { label: 'No Change (adj)', value: 'No Change' },
    { label: 'Somewhat Change (adj)', value: 'Somewhat change' },
    { label: 'Changed (adj)', value: 'Changed' },
    { label: 'Changed Improvement (adj)', value: 'Changed improvement' },
    { label: 'Completely Changed (adj)', value: 'Completely changed' },
    { label: 'Potential Years', value: 'evolutionyearwasted' },
    { label: 'Saved Years', value: 'evolutionyearsaved' },
    { label: 'Extended Life Impact', value: 'extendedlifeimpact' },
    { label: 'Total Studio Opportunitiesused', value: 'totalstudioopportunitiesused' },
    { label: 'Live Event Opportunitiesused', value: 'liveeventopportunitiesused' },
    { label: 'Adj aware', value: 'totaladjustmentaware' },
    { label: 'Adj unaware', value: 'totaladjustmentunaware' },
    { label: 'Total Touch Points', value: 'touchpoints' },
    { label: 'ATC Model', value: 'atcmodel' },
    { label: 'B!G_REG', value: 'B!G_REG' },
    { label: 'B!G_FT', value: 'B!G_FT' },
    { label: 'LYL_REG', value: 'LYL_REG' },
    { label: 'LYL_FT', value: 'LYL_FT' },
    { label: 'uP!_REG', value: 'uP!_REG' },
    { label: 'uP!_FT', value: 'uP!_FT' },
    { label: 'Health Explorative_REG', value: 'Health Explorative_REG' },
    { label: 'Health Explorative_FT', value: 'Health Explorative_FT' },
    { label: 'CTD_REG', value: 'CTD_REG' },
    { label: 'CTD_FT', value: 'CTD_FT' },
    { label: 'SMP_REG', value: 'SMP_REG' },
    { label: 'SMP_FT', value: 'SMP_FT' },
    { label: 'Previous Cohorts', value: 'previouscohorts' },
    { label: 'Current Cohorts', value: 'currentcohorts' },
    { label: 'Family', value: 'Family' },
    { label: 'Health', value: 'Health' },
    { label: 'Career', value: 'Career' },
    { label: 'Business', value: 'Business' },
    { label: 'Personal Genius', value: 'Personal Genius' },
  ];

  isAddingTag = false;
  istableloaded: boolean = false
  showCompactChipList = false;
  delete = false;
  showBigLevelHeaders = false;

  notesForm!: FormGroup;
  tagForm!: FormGroup;

  notesData: any;
  cohorts: any;

  profileId: '';
  screenType = "groupView"

  selectedEventFromMarathonRef = null
  hoveredTrack: any = null;

  tagSubscription: Subscription
  cohortsSubscription: Subscription
  bigTagsSubscription: Subscription
  bigParticipantNotesSubscription: Subscription

  private storage = inject(Storage)
  private authguard = inject(AuthguardService)

  constructor(
    private firestore: Firestore,
    private formbulider: FormBuilder,
    private auth : AuthguardService,
    private snackbarService:SnackbarService,
    public dialog : MatDialog,
    private router: Router,
    private snackBar: MatSnackBar,
    private http : HttpClient
  ){

    //tags
    this.tagForm = this.formbulider.group({
      newTag:["",[Validators.required]]
    });

    //notsform
    this.notesForm = this.formbulider.group({
      note: ['']
    });

    //auth
    this.auth.getRoles().then(async (roles)=>{
      this.profileId = roles['profile_ref'].id
    });

    getDocs(query(collection(this.firestore, "journey"),where("atcmodel","==","B!G"))).then(snap => {
      if(!snap.empty){
        console.log("snap",snap);
        
        let bigJourneyList = snap.docs.map(e => e.id)
        // getDocs(query(collection(this.firestore,"participant metadata"),or(where("activejourney", "in", bigJourneyList),where("lastcompletedjourney", "in", bigJourneyList)))).then(nonActiveJourneySnap => {
        getDocs(query(collection(this.firestore,"participant metadata"))).then(nonActiveJourneySnap => {
          let nonActiveJourneyList = nonActiveJourneySnap.docs.map(e => e.data()).filter(e => e["name"] != null && e["testuser"] != true && (!['discontinued','banned','late'].includes(e["financialstatus"])))
          console.log("nonActiveJourneyList",nonActiveJourneyList);

          this.participantlist = [...nonActiveJourneyList]
          this.ngAfterViewInit()

          for (let i = 0; i < this.participantlist.length; i++) {
            const element = this.participantlist[i];
            this.mapParticipants[element['profileid']] = element
            this.participantLiveEventAttendanceMap[element['profileid']] =  (element['consumedproducts'] ?? []).filter(e => e == "0ayiNALL1HDVvCXDHcZ4").length
            this.firstcontainer[0]["value"] = this.firstcontainer[0]["value"] + (element['extendedlifeimpact'] || 0)
          }
          
          for (const key in this.participantLiveEventAttendanceMap) {
            if(this.participantLiveEventAttendanceMap[key] === 0){
              this.eventsAttendedUP[4].count++
              this.eventsAttendedUP[4].participantidlist.push(key)
            }else if(this.participantLiveEventAttendanceMap[key] === 1){
              this.eventsAttendedUP[0].count++
              this.eventsAttendedUP[0].participantidlist.push(key)
            }else if(this.participantLiveEventAttendanceMap[key] === 2){
              this.eventsAttendedUP[1].count++
              this.eventsAttendedUP[1].participantidlist.push(key)
            }else if(this.participantLiveEventAttendanceMap[key] === 3){
              this.eventsAttendedUP[2].count++
              this.eventsAttendedUP[2].participantidlist.push(key)
            }else if(this.participantLiveEventAttendanceMap[key] > 3){
              this.eventsAttendedUP[3].count++
              this.eventsAttendedUP[3].participantidlist.push(key)
            }
          }

          this.getBigAttendance()
          this.getATCWrittenData()
          // this.getATCMentorData()
        })
      }
    })

    this.tagSubscription = collectionSnapshots(collection(this.firestore,"big participants tags")).subscribe((value)=>{
      for (let i = 0; i< value.length; i++) {
        const element = value[i].data();  
        this.particpantsTags[element["id"]]=element;
        console.log("particpantsTags",this.particpantsTags);
      }
    });

    // this.cohortsSubscription = collectionSnapshots(collection(this.firestore,"big cohorts")).valueChanges().subscribe(snap => {
    //   this.cohortsList = snap
    //   // get big marathon
    //   this.getMarathon()
    // })

    this.cohortsSubscription = collectionSnapshots(collection(this.firestore, "big cohorts")).subscribe(snapshot => {
      this.cohortsList = snapshot.map(doc => ({
        id: doc.id,
        ...doc.data() as any
      }));

        console.log("cohorts",this.cohortsList);
        
      this.getMarathon();
    });
    

    getDocs(query(collection(this.firestore, "event collection"),orderBy('start_date','desc',))).then(async(snap) => {
      this.acceleratorEventlist = []
      this.eventCollectionList = []
      this.mapEventCollection = {}

      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        element['ref'] = snap.docs[i].ref
        element['index'] = i
        if(element['bigmarathonref'] != undefined){
          this.acceleratorEventlist.push(element['ref'])
          this.eventCollectionList.push(element)
        }
        this.mapEventCollection[snap.docs[i].id] = element
      }

      // this.eventCollectionList = snap.docs.map(e => {
      //   let element = e.data()
      //   element['ref'] = e.ref
      //   return element
      // }).filter(e => e['bigmarathonref'] != undefined);

      // snap.docs.forEach((e,index) => {
      //   let element = e.data()
      //   element['index'] = index
      //   this.mapEventCollection[e.id] = element
      // })

      // this.acceleratorEventlist = snap.docs.map(e => {
      //   let element = e.data()
      //   element['ref'] = e.ref
      //   return element
      // }).filter(e => e['bigmarathonref'] != undefined).map(e => e['ref'])

      if(this.selectedMarathon['docid'])this.filteredEventCollectionList = this.eventCollectionList.filter(e => e['bigmarathonref'].id === this.selectedMarathon['docid'])

      this.getBigAttendance()

    })

    this.bigTagsSubscription = collectionSnapshots(collection(this.firestore,"big tags")).subscribe((value)=>{
      for (let i = 0; i< value.length; i++) {
        const element = value[i].data();
        this.bigTags.push(element);        
      }
    })

    getDocs(collection(this.firestore,"profile_data")).then((value)=>{
      for (let i = 0; i< value.docs.length; i++) {
        const element = value.docs[i].data();
        this.profile_data[element["profileid"]]=element        
      }
    })

    this.bigParticipantNotesSubscription = collectionSnapshots(collection(this.firestore,"big participants notes")).subscribe((value)=>{
      this.bigNotes = [];
      for (let i = 0; i< value.length; i++) {
        const element = value[i].data();
        this.bigNotes.push(element);
      }
    })

     getDocs(query(collection(this.firestore,"biglevel"),orderBy("sequence","desc"))).then((value)=>{
      let getdiagnosticindex = null
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        this.bigLevel[element["docid"]] = element
        if(getdiagnosticindex === null  && element['level'].toLowerCase().includes("diagnostic")){
          getdiagnosticindex = element['sequence']
        }
        if(!getdiagnosticindex){
          this.beforeDiagnosticLevelList.push(element['docid'])
        }else{
          this.afterDiagnosticLevelList.push(element['docid'])
        }
      }
      this.getBeforeAfterDiagnosticsLevel()
    })
    getDocs(collection(this.firestore,"big aggregate level")).then(async value => {
      this.bigAggregateLevelList = []
      for (let i = 0; i < value.docs.length; i++) {
        const element = value.docs[i].data();
        this.bigLevelup[element['profileid']] = this.bigLevelup[element['profileid']]  || {}
        this.bigLevelup[element['profileid']][element['atcmodel']] = element
        this.bigAggregateLevelList.push(element)
      }
      // let x = [];
      // var map = {};
    
      // for (let index = 0; index < value.docs.length; index++) {
      //   const element = value.docs[index].data();
      //   x[element["profileid"]] = element;

      //   if (!map[element["profileid"]]) {
      //     map[element["profileid"]] = {}; 
      //   }
      //   if (!map[element["profileid"]][element["atcmodel"]]) {
      //     map[element["profileid"]][element["atcmodel"]] = {}; 
      //   }
      //   map[element["profileid"]][element["atcmodel"]] = element;
      // }
      // this.bigAggregateLevel = x;
      // this.bigLevelup = map;
      this.getBeforeAfterDiagnosticsLevel()
    });

    getDocs(collection(this.firestore,"queue generation")).then((value)=>{
      for (let index = 0; index < value.docs.length; index++) {
        const element = value.docs[index].data();
        this.queueGeneration[element["docid"]] = element        
      }
    })

     getDocs(collection(this.firestore,"journey")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapJourney[element['id']] = element['journey']
      }
    })

    getDocs(collection(this.firestore,"products")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapProduct[element['id']] = element['product']
      }
    })

    getDocs(collection(this.firestore,"bigactivity")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapActivity[element['docid']] = element['activity']
      }
    })
  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = this.customfilter()
  }

  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['name'] != null ? e['name'].toLowerCase().includes(value['name'].toLowerCase().trim()) : true) && 
        (value['tags'].length != 0  ?  (this.particpantsTags[e['profileid']] ? (this.particpantsTags[e['profileid']]['tags'] || []) : []).some((tag:string) => value['tags'].includes(tag)): true) 
    }
    return filterFunction;
  }

  
  // ngOnDestroy(){
  //   this.tagSubscription.unsubscribe()
  //   this.cohortsSubscription.unsubscribe()
  //   this.bigTagsSubscription.unsubscribe()
  //   this.bigParticipantNotesSubscription.unsubscribe()
  // }

  ngAfterViewInit(){
    this.dataSource.data = this.participantlist
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
    // console.log("particpant",this.participantlist);
  }

   getBigAttendance(){
    if(this.participantlist.length != 0 && this.acceleratorEventlist.length != 0){
      let geteventparticipationcount = {}
      let geteventparticipationprofile = {}
      let mapEventNameToId = {}
      
      this.acceleratorEventlist.forEach(e => {
        mapEventNameToId[this.mapEventCollection[e['id']]['name']] = e['id']
      })
      // this.mapEventCollection[e['id']]['name']
      let acceleratorEventNames = this.acceleratorEventlist.map(e => e['id'])
      
      for (let i = 0; i < this.participantlist.length; i++){
        let value = Object.values(this.participantlist[i]['productevent'] ?? []).reduce((acc: string[], curr: unknown) => acc.concat(curr as string[]), []);
        let productEventArray = Array.from(new Set(value as string[]))
        acceleratorEventNames.forEach(eventname => {
          if(productEventArray.includes(eventname)){
            geteventparticipationcount[eventname] = (geteventparticipationcount[eventname] || 0) + 1
            geteventparticipationprofile[eventname] = geteventparticipationprofile[eventname] || []
            geteventparticipationprofile[eventname].push(this.participantlist[i]['profileid'])
          }
        }) 
      }
      // mapEventNameToId[eventname]
      for (const eventname of acceleratorEventNames){
        this.eventsAttendedBig[this.mapEventCollection[eventname]['index']] = {
          // name: eventname,
          name: this.mapEventCollection[eventname]['name'],
          count: geteventparticipationcount[eventname],
          participantidlist : geteventparticipationprofile[eventname]
        }
      }
    }
  }

  async getATCWrittenData(){
    // console.time("getATCWrittenData");
    const firestoreATC = getFirestore("firestore-atc")
    for (let i = 0; i < this.participantlist.length; i=i+10) {
      const arrayofprofileref = this.participantlist.slice(i,i+10).map(e => doc(firestoreATC, "profile_data", e['profileid']) );
      await getDocs(query(
        collection(firestoreATC, "atc_alpha"),
        where("author", "array-contains-any", arrayofprofileref),
        where("isdelete", "==", false)
      )).then(async atcSnap => {
        console.log("atcsnap",atcSnap);
        for (let j = 0; j < atcSnap.docs.length; j++) {
          const element = atcSnap.docs[j].data();
          element['author'].forEach((profileRef) => {
            this.mapATCWritten[profileRef.id] = this.mapATCWritten[profileRef.id] || []
            if(!this.mapATCWritten[profileRef.id].some(e => e['atcid'] == element['atcid'])){
              this.mapATCWritten[profileRef.id].push(element)
              //getting how many they got motoring other than thenself.
              if(element['validator'] && element['validator'].length != 0){
                if(element['validator'].filter(e => e.id != profileRef.id).length != 0 ){
                  this.mapATCgotMentoring[profileRef.id] = this.mapATCgotMentoring[profileRef.id] || []
                  if(!this.mapATCgotMentoring[profileRef.id].some((e:any)=> e['atcid'] == element['atcid'])){
                    this.mapATCgotMentoring[profileRef.id].push(element)
                  }
                }
              }

            }
          })
        }
      })
    }
    // console.timeEnd("getATCWrittenData");
  }


  getCohortsByMarathon(): any[] {
    // get cohorts
    // console.log("getCohortsByMarathon");
    // let marathonref = this.firestore.collection("big marathon").doc(this.selectedMarathon['docid']).ref
    
    if (this.selectedMarathon['docid']) {
      if (this.selectedEventFromMarathonRef != null) {
        console.log("selectedEventFromMarathonRef", this.selectedEventFromMarathonRef.id);
        this.cohorts = this.cohortsList.filter(e => 
          e['marathonref'].id === this.selectedMarathon['docid'] && 
          e['eventref'].id === this.selectedEventFromMarathonRef.id
        );
        return this.cohorts;
      } else {
        console.log(this.selectedMarathon['docid']);
        this.cohorts = this.cohortsList.filter(e => 
          e['marathonref']?.id === this.selectedMarathon['docid']
        );
        return this.cohorts;
      }
    } else {
      this.snackbarService.show("Select event to get Cohorts data");
      return []; // Return empty array when no marathon selected
    }
  }

  getMarathon(){
    getDocs(query(collection(this.firestore,"big marathon"),orderBy("startdate","asc"))).then(snap => {
      if(!snap.empty){
        let n = 0
        this.bigMarathonList = snap.docs.map(e => {
          let element =  e.data()
          element["index"] = n
          n++
          return element
        })
        console.log("thisbigmarathon",this.bigMarathonList);
        
        if(this.selectedMarathon === null) this.selectedMarathon = this.bigMarathonList[this.bigMarathonList.length - 1]
        else{
          let findindex = null
          this.bigMarathonList.forEach((e,index) =>{
            if(e['docid'] === this.selectedMarathon['docid']){
              findindex = index 
            }
          })
          if(findindex != null)this.selectedMarathon = this.bigMarathonList[findindex]
          else{this.selectedMarathon = this.bigMarathonList[this.bigMarathonList.length - 1]}
        }
        if(this.selectedMarathon['docid'])this.filteredEventCollectionList = this.eventCollectionList.filter(e => e['bigmarathonref'].id === this.selectedMarathon['docid'])
          console.log("eventCollectionList",this.eventCollectionList);
        this.getBigAttendance()
        this.getCohortsByMarathon();
        let lastTwoMarathons =  this.bigMarathonList.slice(-2)
        var index = 0
        // console.log(lastTwoMarathons);
        // console.log("this.cohortslist",this.cohortsList);
        lastTwoMarathons.forEach(doc => {
          // console.log(doc.title);
          let filterCohorts = this.cohortsList.filter(e => e['marathonref'].id === doc.docid)
          filterCohorts.forEach(cohortsdoc => {
            for (let i = 0; i < cohortsdoc['participantidlist'].length; i++) {
              const profileId = cohortsdoc['participantidlist'][i];
              if(index === 0){
                this.lastCohortsParticipation[profileId] = this.lastCohortsParticipation[profileId] || []
                this.lastCohortsParticipation[profileId].push(cohortsdoc)
              }else{
                this.currentCohortsParticipation[profileId] = this.currentCohortsParticipation[profileId] || []
                this.currentCohortsParticipation[profileId].push(cohortsdoc)
              }
            }
          })
          index++
        })
        // console.log(this.lastCohortsParticipation);
        // console.log(this.currentCohortsParticipation);        

      }else{
        alert("currently there is no marathon")
      }
    })
  }

  getBeforeAfterDiagnosticsLevel(){
    let mapBeforeAfterDiagnosticsByAtcModel = {
      before:{},
      after:{}
    }
    // let mapatcbylevelcount = {}
    if(this.beforeDiagnosticLevelList.length != 0 && Object.keys(this.bigLevelup).length != 0){
      for (let i = 0; i < this.bigAggregateLevelList.length; i++) {
        const element = this.bigAggregateLevelList[i];
        // mapatcbylevelcount[element['atcmodel']] = mapatcbylevelcount[element['atcmodel']] || {};
        // (element['fasttrack'] || []).forEach(e => {
        //   mapatcbylevelcount[element['atcmodel']][this.bigLevel[e['level'].id]['level']] = (mapatcbylevelcount[element['atcmodel']][this.bigLevel[e['level'].id]['level']] || 0) + 1
        // })
        
        if(this.afterDiagnosticLevelList.includes(element['level'].id)){
          mapBeforeAfterDiagnosticsByAtcModel['after'][element['atcmodel']] = mapBeforeAfterDiagnosticsByAtcModel['after'][element['atcmodel']] || []
          mapBeforeAfterDiagnosticsByAtcModel['after'][element['atcmodel']].push(element['profileid'])
        }
        if(this.beforeDiagnosticLevelList.includes(element['level'].id)){
          mapBeforeAfterDiagnosticsByAtcModel['before'][element['atcmodel']] = mapBeforeAfterDiagnosticsByAtcModel['before'][element['atcmodel']] || []
          mapBeforeAfterDiagnosticsByAtcModel['before'][element['atcmodel']].push(element['profileid'])
        }
      }
    }
    this.firstcontainer[1].value = mapBeforeAfterDiagnosticsByAtcModel.before
    this.firstcontainer[2].value = mapBeforeAfterDiagnosticsByAtcModel.after
    // console.log(mapatcbylevelcount);
    
  }

  onEditMarathon(){
    let ref = this.dialog.open(CreateMarathonComponent,{
      width:"40vw",
      disableClose:true,
      data : this.selectedMarathon
    })
    ref.afterClosed().subscribe((result) => {
      if(result){
        setDoc(doc(this.firestore, "big marathon", result.docid), result, { merge: true }).then(() => {
          this.getMarathon();
        });
      }
    })
  }

  onChangeMarathon(type){
    if(this.selectedMarathon != null){
      if(type == "forward"){
        if(this.selectedMarathon['index'] < (this.bigMarathonList.length - 1)){
          this.selectedMarathon = this.bigMarathonList[this.selectedMarathon['index'] + 1]
          if(this.selectedMarathon['docid'])this.filteredEventCollectionList = this.eventCollectionList.filter(e => e['bigmarathonref'].id === this.selectedMarathon['docid'])
            console.log("filyerteedevent",this.filteredEventCollectionList);
            
          this.selectedEventFromMarathonRef = null
          this.getCohortsByMarathon()
        }
      }else if(type == "backward"){
        if(this.selectedMarathon['index'] != 0){
          this.selectedMarathon = this.bigMarathonList[this.selectedMarathon['index'] - 1]
          if(this.selectedMarathon['docid'])this.filteredEventCollectionList = this.eventCollectionList.filter(e => e['bigmarathonref'].id === this.selectedMarathon['docid'])
          this.selectedEventFromMarathonRef = null
          this.getCohortsByMarathon()
        }
      }
    }
  }

  onCreateMarathon(){
    let ref = this.dialog.open(CreateMarathonComponent,{
      width:"40vw",
      disableClose:true
    })
    ref.afterClosed().subscribe((result) => {
      if(result){
        // this.firestore.collection("big marathon").doc(result.docid).set(result,{merge:true}).then(() => {
        //   this.getMarathon()
        // })
        setDoc(doc(this.firestore,"big marathon", result.docid), result, { merge: true }).then(() => {
          this.getMarathon();
        });
        console.log("diglog true");
      }
    })
  }

  onPatchDataToTable(participantidlist,cohort){
    this.getBigAssignment(cohort);
    this.selection.clear()
    let array = this.dataSource.data.filter(e => participantidlist.includes(e['profileid']))
    this.selection.select(...array)
    // this.updateTableData()
  }

  onPatchDataToTableFromActivity(participantidlist){
    this.selection.clear()
    let array = this.dataSource.data.filter(e => participantidlist.includes(e['profileid']))
    this.selection.select(...array)
  }

  onEditCohorts(cohortsdoc){
    if(this.selectedMarathon){
      // console.log(this.selection.selected);
      let loadingRef =  this.dialog.open(ManageCohertsComponent,{
        disableClose:true,
        data:{
          selectedMarathon : this.selectedMarathon,
          selectedParticipants : cohortsdoc.participantlist,
          totalParticipants:this.participantlist,
          eventCollectionList : this.eventCollectionList.filter(e => e['bigmarathonref'].id === this.selectedMarathon['docid']),
          doc : cohortsdoc,
          type:"edit",
          mapEventCollection:this.mapEventCollection
        },
        width: '560px',
        maxWidth: '95vw',
        maxHeight: '90vh',
      })
      loadingRef.afterClosed().subscribe(result => {
        if(result){
          this.getCohortsByMarathon()
          this.snackbarService.show("Cohorts updated");
        }
      });
    }else{
      alert("No marathon been selected.")
    }
  }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.filterForm)
  }

  onFilterReset(){
    this.filterForm = {
      name:null,
      tags:[],
    }
    this.onFilter()
  }

  toggleAddTagForm() {
    this.isAddingTag = !this.isAddingTag; 
  }

  toggleChipListView(): void {
    this.showCompactChipList = !this.showCompactChipList;
  }

  onColumnChipRemove(columnValue: string, event: Event) {
  event.stopPropagation(); // Prevent the chip click event from firing
  
  // Remove from selectedColumns array
  this.selectedColumns = this.selectedColumns.filter(col => col !== columnValue);
  
  // Or if you have a toggle method, call it
  // this.onColumnChipToggle(columnValue);
}

   OnManageTag(){
    if (!this.selection.isEmpty()) {
      const dialogRef = this.dialog.open(GroupDialogComponent, {
        width: '500px',
        data: { selectedRows: this.selection.selected, totalCount: this.selection.selected.length }
      });
    }
  }

  onManageCoherts(){
    let dialogData  = {
      selectedMarathon : this.selectedMarathon,
      selectedParticipants:this.selection.selected,
      totalParticipants:this.participantlist,
      eventCollectionList : this.eventCollectionList.filter(e => e['bigmarathonref'].id === this.selectedMarathon['docid']),
      type:"new",
      mapEventCollection:this.mapEventCollection
    };
    console.log(dialogData);
    
    if(this.selection.selected.length != 0 && this.selectedMarathon){
      let loadingRef =  this.dialog.open(ManageCohertsComponent,{
        disableClose:true,
        data:dialogData,
        width:"80vw",
        height:"80vh"
      });
      loadingRef.afterClosed().subscribe(result => {
        this.selection.clear();
        if(result != null){ 
          this.getCohortsByMarathon()
          this.snackbarService.show("Cohorts Created");
        }
      });
    }else{
      alert("No participants been selected.")
    }
  }

  //notes
  OnManageNotes(){
    const selectedData = this.selection.selected;
    this.sidenav.open();
  }

  addtags(){
    if(this.tagForm.valid){
      const id = doc(collection(this.firestore,"big tags")).id
      setDoc(doc(this.firestore,"big tags",id),{
        id:id,
        tagName:this.tagForm.value.newTag,
        created :new Date(),
      },{merge : true}).then(value=>{
        console.log("set sucessfully");   
      })
      this.isAddingTag = false;
      this.tagForm.reset();
      this.snackBar.open('Tag added successfully!', 'Close', {
        duration: 3000,  
        verticalPosition: 'top', 
        horizontalPosition: 'center'
      });
    }
  }

   onImportData(event:any):void{
    const file = event.target.files[0]
    if(file){
      const fileExtension = file.name.split(".").pop()?.toLowerCase();
      if (fileExtension === 'csv') {
        // this.importCSV(file).subscribe(
        //   (result) => {
        //     console.log(result);
        //     this.fileInput.nativeElement.value = null
        //     if(result.length != 0){
        //       let arrayOfProfileId = result.map(e => e['profileid'])
        //       let filteredArray = this.participantlist.filter(e => arrayOfProfileId.includes(e['profileid']))
        //       for (let i = 0; i < filteredArray.length; i++) {
        //         const element = filteredArray[i];
        //         if(!this.selection.isSelected(element)){
        //           this.selection.select(element)
        //         }
        //       }
        //     }else alert("import file doesn't have any data")
        //   },
        //   (error) => {
        //     console.error('Error importing CSV:', error);
        //   }
        // );
      } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
        this.importExcel(file).subscribe(
          (result) => {
            console.log(result);
            if(result.length != 0){
              let arrayOfProfileId = result.map(e => e['profileid'])
              let filteredArray = this.participantlist.filter(e => arrayOfProfileId.includes(e['profileid']))
              for (let i = 0; i < filteredArray.length; i++) {
                const element = filteredArray[i];
                if(!this.selection.isSelected(element)){
                  this.selection.select(element)
                }
              }
            }else alert("import file doesn't have any data")
          },
          (error) => {
            console.error('Error importing Excel:', error);
          }
        );
      }

    }
  }

   importExcel(file: File): Observable<any[]> {
    return new Observable((observer) => {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, {
            type: 'array',
            cellDates: true,
            dateNF: 'yyyy-mm-dd'
          });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            dateNF: 'yyyy-mm-dd'
          });

          observer.next(jsonData);
          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      };

      reader.onerror = (error) => {
        observer.error(error);
      };

      reader.readAsArrayBuffer(file);
    });
  }

  async exportCSV(tablecolumn){
    if(tablecolumn === 'all') this.displayedColumns = this.availableColumns.map(e => e.value)
    var data = []
    let mapBigLevelValue = {
      "B!G_REG":"B!G",
      "B!G_FT":"B!G",
      "LYL_REG":"LYL",
      "LYL_FT":"LYL",
      "uP!_REG":"uP!",
      "uP!_FT":"uP!",
      "Health Explorative_REG":"Health Explorative",
      "Health Explorative_FT":"Health Explorative",
      "CTD_REG":"CTD",
      "CTD_FT":"CTD",
      "SMP_REG":"SMP",
      "SMP_FT":"SMP"
    }
    for (let i = 0; i < this.selection.selected.length; i++) {
      const e = this.selection.selected[i];
      console.log(this.selection.selected[i]);
      
      let obj = {}
      let crossovermetric = {
        "Family":[],
        "Health":[],
        "Career":[],
        "Business":[],
        "Personal Genius":[]
      };
      let mapBigData = {
        "B!G_REG":"",
        "B!G_FT":[],
        "LYL_REG":"",
        "LYL_FT":[],
        "uP!_REG":"",
        "uP!_FT":[],
        "Health Explorative_REG":"",
        "Health Explorative_FT":[],
        "CTD_REG":"",
        "CTD_FT":[],
        "SMP_REG":"",
        "SMP_FT":[]
      }

      let activeProduct = [];
      if(e['activeproduct']){activeProduct = e['activeproduct'].map((e:string) => this.mapProduct[e])}

      let aelField = ['currentael','completedael']
      aelField.forEach(item => {
        (e[item] || []).forEach(intermreport => {
          for (const key in intermreport['crossovermetric']){
            crossovermetric[key] = crossovermetric[key] || []
            if(intermreport['crossovermetric'][key]){
              crossovermetric[key].push(`${intermreport['crossovermetric'][key]['startpoint']} to ${intermreport['crossovermetric'][key]['endpoint']}`)
            }
          }
        })
      });

      ["B!G_REG","LYL_REG","uP!_REG","Health Explorative_REG","CTD_REG","SMP_REG"].forEach(atcmodel => {
        mapBigData[atcmodel] = this.bigLevelup[e['profileid']] ? this.bigLevelup[e['profileid']][mapBigLevelValue[atcmodel]] ? this.bigLevel[this.bigLevelup[e['profileid']][mapBigLevelValue[atcmodel]]['level'].id].level : "" : ""
      });

      ["B!G_FT","LYL_FT","uP!_FT","Health Explorative_FT","CTD_FT","SMP_FT"].forEach(atcmodel => {
        if(this.bigLevelup[e['profileid']] && this.bigLevelup[e['profileid']][mapBigLevelValue[atcmodel]] && this.bigLevelup[e['profileid']][mapBigLevelValue[atcmodel]]['fasttrack']){
          (this.bigLevelup[e['profileid']][mapBigLevelValue[atcmodel]]['fasttrack'] || []).forEach(doc => {
            let concatenate = `${this.bigLevel[doc.level.id].level} (val - ${doc['validation'][0]['completed']}/${doc['validation'][0]['metric']}) (stab - ${doc['stabilization'][0]['completed']}/${doc['stabilization'][0]['metric']})`
            mapBigData[atcmodel].push(concatenate)
          })
        }
      })
      // atcmentor:this.mapATCMentor[e['profileid']] != undefined ? this.mapATCMentor[e['profileid']].length : 0,
      const tableValueAbstract = {
        profileid:e['profileid'],
        name:e['name'],
        subscriptionstart:![null,undefined].includes(e['subscriptionstart']) ? new Date(e['subscriptionstart'].toDate()).toISOString().substring(0,10) : "",
        subscriptionend:![null,undefined].includes(e['subscriptionend']) ? new Date(e['subscriptionend'].toDate()).toISOString().substring(0,10) : "",
        activejourney:e['activejourney'] ? this.mapJourney[e['activejourney']] : "",
        activeproduct:e['activeproduct'] ? activeProduct : "",
        lastcompletedjourney:e['lastcompletedjourney'] != undefined? this.mapJourney[e['lastcompletedjourney']] : "",
        atccount:e['atccount'] != undefined? e['atccount'] : "",
        atcmodel:e['atcmodel'] ? e['atcmodel'].join("/") : "",
        atcwritten:this.mapATCWritten[e['profileid']] != undefined ? this.mapATCWritten[e['profileid']].length : 0,
        atcgotmentoring:this.mapATCgotMentoring[e['profileid']] != undefined ? this.mapATCgotMentoring[e['profileid']].length : 0,
        currentaelcount:e['currentael'] ? e['currentael'].length : 0,  
        completedaelcount:e['completedael'] ? e['completedael'].length : 0,
        "totalaelcount" : (e['currentael'] ? e['currentael'].length : 0) + (e['completedael'] ? e['completedael'].length : 0),
        "Family":crossovermetric['Family'] != undefined ? crossovermetric['Family'].length != 0 ? crossovermetric['Family'].join("/") : "" : "",
        "Health":crossovermetric['Health'].length != 0 ? crossovermetric['Health'].join("/") : "",
        "Career":crossovermetric['Career'].length != 0 ? crossovermetric['Career'].join("/") : "",
        "Business":crossovermetric['Business'].length != 0 ? crossovermetric['Business'].join("/") : "",
        "Personal Genius":crossovermetric['Personal Genius'].length != 0 ? crossovermetric['Personal Genius'].join("/") : "",
        'not updated': e['evolutionprogress'] ? typeof(e['evolutionprogress']) === 'object'  ?  (e['evolutionprogress']['not updated'] ?? 0) : 0 : 0,
        'No Change' : e['evolutionprogress'] ? typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['No Change'] ?? 0 : 0 : 0,
        'Somewhat change': e['evolutionprogress'] ? typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Somewhat change'] ?? 0 : 0 : 0,
        'Changed' : e['evolutionprogress'] ? typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Changed'] ?? 0 : 0 : 0,
        'Changed improvement' : e['evolutionprogress'] ? typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Changed improvement'] ?? 0 : 0 : 0,
        'Completely changed' : e['evolutionprogress'] ? typeof(e['evolutionprogress']) === 'object'? e['evolutionprogress']['Completely changed'] ?? 0 : 0 : 0,
        'evolutionyearwasted' : e['evolutionyearwasted'] ? e['evolutionyearwasted'] :  0,
        'evolutionyearsaved' : e['evolutionyearsaved'] ? e['evolutionyearsaved']: 0,
        'extendedlifeimpact' : e['extendedlifeimpact'] ? e["extendedlifeimpact"] :0,
        'totalstudioopportunitiesused' : e['totalstudioopportunitiesused'] ? e["totalstudioopportunitiesused"] :  0,
        'studioevents' : (e['studioevents'] || []).map((item:string) => this.queueGeneration[item]['queuename']).join("/"),
        'totaladjustmentaware' : e['totaladjustmentaware'] ? e["totaladjustmentaware"] :  0,
        'totaladjustmentunaware' : e['totaladjustmentunaware'] ? e["totaladjustmentunaware"] :  0,
        'touchpoints' : e['touchpoints'] ? e["touchpoints"] :  0,
        'tags': this.particpantsTags[e.profileid] ? this.particpantsTags[e.profileid]['tags'].join("/") ?? "" : "",
        "previouscohorts" : (this.lastCohortsParticipation[e['profileid']] || []).map((item) => item.name).join("/"),
        "currentcohorts" : (this.currentCohortsParticipation[e['profileid']] || []).map((item) => item.name).join("/"),
        "B!G_REG":mapBigData['B!G_REG'],
        "B!G_FT":mapBigData['B!G_FT'].length != 0 ? mapBigData['B!G_FT'].join("/") : "",
        "LYL_REG":mapBigData['LYL_REG'],
        "LYL_FT":mapBigData['LYL_FT'].length != 0 ? mapBigData['LYL_FT'].join("/") : "",
        "uP!_REG":mapBigData['uP!_REG'],
        "uP!_FT":mapBigData['uP!_FT'].length != 0 ? mapBigData['uP!_FT'].join("/") : "",
        "Health Explorative_REG":mapBigData['Health Explorative_REG'],
        "Health Explorative_FT":mapBigData['Health Explorative_FT'].length != 0 ? mapBigData['Health Explorative_FT'].join("/") : "",
        "CTD_REG":mapBigData['CTD_REG'],
        "CTD_FT":mapBigData['CTD_FT'].length != 0 ? mapBigData['CTD_FT'].join("/") : "",
        "SMP_REG":mapBigData['SMP_REG'],
        "SMP_FT":mapBigData['SMP_FT'].length != 0 ? mapBigData['SMP_FT'].join("/") : "",
      }
      for (let j = 0; j < this.displayedColumns.length; j++){
        if(!["select","notes"].includes(this.displayedColumns[j])){
          obj[this.displayedColumns[j]] = tableValueAbstract[this.displayedColumns[j]]
        }
      }
      data.push(obj)
    }
    // console.log(JSON.stringify(data))
    if(this.selection.selected.length != 0){
      this.downloadFile(data, new Date().toDateString() + "participant evolution summary")
    }else{
      alert("no participants selected.Export works only for selected participants ")
    }
  }

   downloadFile(data,filename = 'bigpariticipantsdata') {
    let csvData = this.ConvertToCSV(data,Object.keys(data[0]) );
    console.log(csvData)
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
    console.log("row",row);
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
    console.log(str);
    
    return str;
  }

  isTagSelected(value: string): boolean {
    return this.selectedColumns.includes(value);
  }

  onColumnChipToggle(columnValue: string): void {
    // const index = this.selectedColumns.indexOf(columnValue);
    // if (index >= 0){
    //   this.selectedColumns.splice(index, 1);
    // } else {
    //   this.selectedColumns.push(columnValue);
    // }
    // const columnIndex = this.availableColumns.findIndex(column => column.value === columnValue);
    // if (columnIndex >= 0) {
    //   const [movedColumn] = this.availableColumns.splice(columnIndex, 1);
    //   this.availableColumns.unshift(movedColumn); 
    // }
    // this.displayedColumns = [...this.selectedColumns];
    let valueindex = this.displayedColumns.indexOf(columnValue)
    if(valueindex >= 0){
      this.displayedColumns.splice(valueindex,1)
    }else{
      this.displayedColumns.push(columnValue)
    }
  }

    /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  
  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.dataSource.data);
    
  }

  onToggleSelection(row:any){
    this.selection.toggle(row);
    // this.updateTableData()
  }

  //bigprofilescreen
  bigProfile(row: any): void {
    console.log("element",row);
    this.router.navigate(['/bigProfile'], { queryParams: { data: JSON.stringify(row)} }).then((success) => {
      console.log('Edit navigation success:', success);
    }).catch((error) => {
      console.error('Edit navigation error:', error);
    });
  }

  removeTag(profileId: string, index: number): void {
    if (this.particpantsTags[profileId] && this.particpantsTags[profileId]['tags']) {
      const tags = this.particpantsTags[profileId]['tags'];
      if (index >= 0 && index < tags.length) {
        tags.splice(index, 1); 
        setDoc(doc(this.firestore,"big participants notes",profileId),{
           tags: tags
        },{merge:true})
      }
    }
  }

  countItems(element: any): { count: number, matchedNames: string[] } {
    if (!element || !element.productevent) {
      return { count: 0, matchedNames: [] };
    }
  
    this.filteredItemsArray = [];
    Object.values(element.productevent).forEach((value) => {
      if (Array.isArray(value)) {
        this.filteredItemsArray.push(...value);
      }
    });
  
    let matchCount = 0;
    let matchedNames: string[] = [];
    
    for (const event of this.eventCollectionList) {
      if (this.filteredItemsArray.includes(event.ref.id)) {
        matchCount++;
        matchedNames.push(event.name);  
      }
    }
    return { count: matchCount, matchedNames: matchedNames };
  }

  unselectRow(row: any) {
    if (this.selection.isSelected(row)) {
      this.selection.deselect(row); // Deselect the row
    }
  }

   saveNote() {
    const noteValue = this.notesForm.get('note')?.value;
    if (noteValue) {
      for (let index = 0; index < this.selection.selected.length; index++) {
        const element =  this.selection.selected[index];
        const noteObject = {
          notescreatedby: this.profileId,
          created: new Date(),
          note: noteValue,
        };
        setDoc(doc(this.firestore,"big participants notes",element["profileid"]),{
          docid:element["profileid"],
          notes: arrayUnion(noteObject)
        },{merge:true})
      }
      this.notes.push({ text: noteValue, isEditing: false }); 
      this.notesForm.reset();
    }
  }
  

  editNote(index: number, notedata: any): void {
    notedata.notes.forEach((note: any) => note.isEditing = false);
    notedata.notes[index].isEditing = true;
  }
  
  saveEditedNote(index: number, notedataId: string, notedata: any): void {
    const noteToUpdate = notedata.notes[index];
    const updatedNote = {
      note: noteToUpdate.note, 
      editedNotesBy:this.profileId,
      editedDate:new Date(),
      notescreatedby: noteToUpdate.notescreatedby, 
      created: noteToUpdate.created, 
    };

    setDoc(doc(this.firestore,"big participants notes",notedataId),{
      notes:notedata.notes.map((note, i) => i === index ? updatedNote : note)
    },{merge:true})

  }

  toggleDeleteConfirmation(index: number,notedata: any): void {
    notedata.notes[index].delete = true;
  }
  
  cancelEdit(index: number, notedata: any): void {
    notedata.notes[index].isEditing = false; 
  }
  
  deleteNote(index: number,noteId: string): void {
     const noteToDelete = this.bigNotes.find(nd => nd.docid === noteId);
     if (noteToDelete && noteToDelete.notes.length > index) {
       noteToDelete.notes = noteToDelete.notes.filter((_, i) => i !== index);
        updateDoc(doc(this.firestore,'big participants notes',noteId),{
         notes: noteToDelete.notes,
       })
       .then(() => {
         console.log('Note deleted successfully!');
       })
       .catch((error) => {
         console.error('Error deleting note: ', error);
       });
     }
  }

  adjustTextareaHeight(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  objectToArray(value: any) {
    if (typeof value !== 'object' || value === null) {
      return [];
    }

    return Object.entries(value).map(([key, val]) => ({
      key: key,
      count: Array.isArray(val) ? val.length : 0
    }));
  }

  sendEmailToSelectedParicipant(){
    let dialogRef = this.dialog.open(EmailInputComponent,{
        data: this.selection.selected,
        minWidth: "600px",
        disableClose: true
      });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        console.log(result);

        const docRef = doc(collection(this.firestore, "email archive"), result['docid']);
        if (result['status'] == 'queued' || result['status'] == 'send') {
          await setDoc(docRef, result, { merge: true }).then(() => {
            this.snackbarService.show("Email Sent");
          }).catch(err => {
            console.log(err);
            this.snackbarService.show("Error Sending Email");
          });
        } else if (result['status'] == 'validated') {
          let url: string;
          if (environment.firebase.projectId == 'starlabs-test') {
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }

          const response = await this.http.post(url, { archiveid: result['docid'] }).toPromise();
          console.log("Response : ", response)
        }

      }
    });
  }

  sendWatiMessage(){
    let dialogRef = this.dialog.open(WatiInputComponent, {
      data: this.selection.selected,
      width: "70vw",
      height: "80vh",
      disableClose: true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        if (result == 'success') {
          this.snackbarService.show("Wati Message Sent Successfully");
          if (result['status'] == 'sendtoparticipants') {
            let url: string;

            if (environment.firebase.projectId == 'starlabs-test') {
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
              url = ""
            }

            const docRef = doc(collection(this.firestore, 'wati archive'), result['archiveid']);
            await updateDoc(docRef, {
              templatestatus: "created",
              templatevalidated: true,
            }).then(() => {
              console.log("Wati Archive Document Created");
            }).catch((error) => {
              console.log("Error Creating Wati Archive");
            });

            const response = await this.http.post(url, { archiveid: result['archiveid'] }).toPromise();
            console.log("Response : ", response)

          }
        } else if (result == 'failed') {
          this.snackbarService.show("Sending Wati Message Failed");
        }
      }
    });
  }

  sendNotificationinBreakthrough(){
    let dialogRef = this.dialog.open(AhNotificationComponent,{
      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result,'send app notificationssss');
      if(result != null && result != undefined){
        var userID = [];
        var profileID = [];
        console.log(this.selection.selected,"this.selection.selected");
        // var unsentProfiles = [];
        for (let i = 0; i < this.selection.selected.length; i++) {
          const selected = this.selection.selected[i];
          profileID.push(selected["profileid"])
          // var profiledata = this.mapProfile[selected["profileid"]]
          // if(profiledata["user_ref"] != null) {
          //   userID.push(profiledata["user_ref"].id);
          //   profileID.push(selected['profileid']);
          // }

          // if(profiledata["user_ref"] == null) {
          //   unsentProfiles.push(profiledata);
          // }
        }

        var notificationimage = null
        if(result["notificationimage"] != null){
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(this.storage,filepath)
            const uploadResult = await uploadBytes(storageRef,result["notificationimage"])
            notificationimage = await getDownloadURL(uploadResult.ref)
          } catch (error) {
            console.log("file upload error",error);
          }
        }
        console.log(profileID,"profileIDprofileIDprofileIDprofileID");
        this.authguard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true, 
          landingpage: result["landingpage"],
          profileid: profileID,
        }).then(()=>{
          console.log( notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        });
      }
    });
  }

  async getBigAssignment(cohort){
    console.log(cohort)
    const cohortRef = doc(this.firestore, 'big cohorts',cohort.docid);
    const bigassignmentdoc = await getDocs(query(collection(this.firestore, 'big assignment'),where('cohortsref', '==', cohortRef)));

    console.log(bigassignmentdoc.docs.length);

    if (!bigassignmentdoc.empty) {
      this.bigAssignmentList = bigassignmentdoc.docs.map(doc => doc.data()).sort((a,b)=>a['createddate'] - b['createddate']);
    }
  }

}
