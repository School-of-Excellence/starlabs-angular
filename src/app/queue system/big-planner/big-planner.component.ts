import { Component, OnInit, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { CommonModule, DatePipe } from '@angular/common';
import { environment } from '../../../environments/environment';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { takeUntil } from 'rxjs/operators';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { MatListModule, MatNavList } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-big-planner',
  imports: [
    MatToolbarModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSidenavModule,
    MatCardModule,
    MatDividerModule,
    FormsModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatListModule,
    MatButtonModule,
    MatCheckboxModule
  ],
  templateUrl: './big-planner.component.html',
  styleUrl: './big-planner.component.css',
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, height: '0px' })),
      transition(':enter, :leave', [
        animate('300ms ease-in-out')
      ])
    ])
  ]
})
export class BigPlannerComponent {
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  loggedinProfileRoles = {}
  mapProfile = {};
  mapProfileData = {};
  queuelist = []
  selectedQueue = null
  filterText = ""
  filterActivity = ""
  displayParticipantRole = true
  viewOnly = true
  private unsubscribe$ = new Subject<void>();
  // Create Studio
  newStudioPairing = []

  // big Activity Property
  bigActivitySubcription: Subscription
  bigActivityList = []
  mapBigActivity = {}

  // Shadow Property
  profileShadowCount = {}
  studioActivityLogSubscription: Subscription

  // Big Invitation Property
  bigInvitationSubscription: Subscription
  bigInvitationList = []
  invitedParticipant = []
  waitingParticipant = []

  // Role Assign - Arena Studio Pairing Property
  studioPairingSubscription: Subscription
  studioPairingList = []
  profileStudioCount = {}
  studioPreAssign = {}
  studioinStudio = 0

  // Stage Property
  stageStudioMap = {}
  stageCompletedcount = {}

  // Live Assignment
  liveAssignmentSubscription: Subscription
  liveAssignmentList = []
  studioAssignmentMap = {}

  // Token Property
  queueTokenSubscription: Subscription
  queueTokenList = []
  completedToken = 0
  stageTokenMap = {}
  productList
  products = {}
  // Filter Studio Created
  filterStudioText = ""
  deleteOption: boolean = false
  reviewParticipant = []
  profileid: any;

  filteredStudioPairingList: MatTableDataSource<any>;
  filterActivityValue = '';
  filterAtcModelValue = '';
  filterStatusValue = '';
  displayedColumns: string[] = ['status', 'participants', 'preassign', 'activities', 'atcModel', 'actions'];
  showFilters: boolean = false;

  openViduEnabled = false;

  // Events
  selectedEvent: string = null;
  filterEvent : string = '';
  eventList: any[] = [];

  cohortparticipantsList = [];
  eventCohorts = [];

  private allProfilesMap = new Map<string, any>();

  constructor(
    private route: ActivatedRoute,
    public guard: AuthguardService,
    public firestore: Firestore,
    public dialog: MatDialog,
    public snackBar: MatSnackBar,
    private datePipe: DatePipe
  ) {
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Loading" }
    })
    getDocs(collection(this.firestore, 'products')).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.products[element['id']] = element
      }
    })
    // console.log(this.products);
    guard.getProfileMap().then(data => {
      this.mapProfile = data.map;
      this.mapProfileData = data.docdata;
    })
    guard.getRoles().then(async roleData => {
      this.loggedinProfileRoles = roleData
      this.profileid = roleData.profile_ref.id
      if (environment.firebase.projectId == "fir-sample-aae4a" && this.profileid == 'l0ApFnXuM5Ac8tpqJQnk') {
        this.deleteOption = true
      } else if (environment.firebase.projectId == "starlabs-test" && this.profileid == 'g2mQ7GiD6PSV8oaZnZLb') {
        this.deleteOption = true
      } else { this.deleteOption = false }
      // if (roleData["ah"] || roleData["admin"] || roleData["mentor"] || roleData["developer"]) {
        await getDocs(query(collection(this.firestore, 'queue generation'), orderBy("queueenddate", "desc"))).then(async queueData => {
          for (let i = 0; i < queueData.docs.length; i++) {
            const queue = queueData.docs[i].data();
            this.queuelist.push(queue)
          }
          this.route.queryParams.subscribe(data => {
            var queueid = data["queueid"]
            this.selectedQueue = this.queuelist.find(e => e["docid"] == queueid) ?? null
            if (this.selectedQueue != null) this.onQueueSelect();
            if (this.selectedQueue != null) {

              this.selectedEvent = this.selectedQueue['eventid'];

              const eventRef = doc(this.firestore, 'event collection',this.selectedEvent);
              collectionData(query(collection(this.firestore, 'big cohorts'),where('eventref','==',eventRef),where('status','==','active'))).subscribe((cohort)=>{
                let list = [];
                let participantsList = [];
                console.log('cohorts found :',cohort.length);
                
                if(cohort.length > 0){
                  for (let i = 0; i < cohort.length; i++) {
                    const cohortData = cohort[i];
                    list.push(cohortData);
                    if (Array.isArray(cohortData['participantidlist'])) {
                      participantsList.push(...cohortData['participantidlist']);
                    }
                  }
                  this.eventCohorts = list;
                  this.cohortparticipantsList = participantsList;
                }else{
                  this.guard.openSnackBar('No Cohorts found', 'OK',600);
                }
                console.log('totalParticipants',participantsList.length);
              });              
            };
          })
          loading.close()
        })
      // }
    })
  }

  ngOnInit(): void {
    
    collectionData(collection(this.firestore, 'profile_data'), { idField: 'docid' }).pipe(takeUntil(this.unsubscribe$)).subscribe(profiles => {
      this.allProfilesMap.clear();
      profiles.forEach((p: any) => {
        if (p.profileid) {
          this.allProfilesMap.set(p.profileid, p);
        }
      });
    });

    getDocs(query(collection(this.firestore, 'event collection'),orderBy('end_date','desc'))).then(event => {
      for (let i = 0; i < event.docs.length; i++) {
        const element = event.docs[i].data();
        element['docid'] = event.docs[i].id;
        this.eventList.push(element)
      }
    });

    getDocs(collection(this.firestore, 'review participants')).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.reviewParticipant.push(element)
      }
    });

    this.addPair();

    collectionData(collection(this.firestore, "bigactivity"), { idField: 'id' }).pipe(takeUntil(this.unsubscribe$)).subscribe(snap => {
      this.bigActivityList = snap
      this.bigActivityList.forEach(e => {
        this.mapBigActivity[e["docid"]] = e["activity"]
      })
    });


  }

  async eventSelected(){
    const queueRef = doc(this.firestore, 'queue generation', this.selectedQueue['docid']);
    await updateDoc(queueRef,{
      eventid:this.selectedEvent
    }).then(()=>{
      console.log('Event Updated In Queue');
      this.guard.openSnackBar('Event Updated in Queue', 'OK',600);
      
      const eventRef = doc(this.firestore, 'event collection',this.selectedEvent);
      collectionData(query(collection(this.firestore, 'big cohorts'),where('eventref','==',eventRef),where('status','==','active'))).subscribe((cohort)=>{
        let list = [];
        let participantsList = [];
        if(cohort.length > 0){
          for (let i = 0; i < cohort.length; i++) {
            const cohortData = cohort[i];
            list.push(cohortData);
            if (Array.isArray(cohortData['participantidlist'])) {
              participantsList.push(...cohortData['participantidlist']);
            }
          }
          this.eventCohorts = list;
          this.cohortparticipantsList = participantsList;
        }else{
          this.guard.openSnackBar('No Cohorts found', 'OK',600);
        }
      });

    }).catch((error)=>{
      console.log('Error While Updating Event',error,'ok');
      this.guard.openSnackBar('Error While Updating Event', 'OK',600);
    });
  }

  filterEvents(){
    return this.eventList.filter(e => e["name"].toLowerCase().includes(this.filterEvent.toLowerCase()))
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  // ngOnDestroy(){
  //   this.bigActivitySubcription?.unsubscribe()
  //   this.bigInvitationSubscription?.unsubscribe()
  //   this.studioPairingSubscription?.unsubscribe()
  //   this.liveAssignmentSubscription?.unsubscribe()
  //   this.queueTokenSubscription?.unsubscribe()
  //   this.studioActivityLogSubscription?.unsubscribe()
  // }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  async onQueueSelect() {

    // const promises = this.selectedQueue['arenaeventidlist'].map(element => {
    //   return getDoc(doc(this.firestore, 'arena events', element)).then(res => res.data()['productref'].id);
    // });

    // let productIds = []
    // productIds = await Promise.all(promises);
    // let tempProducts = [];
    // for (let i = 0; i < productIds.length; i++) {
    //   const element = productIds[i];
    //   if (this.products[element]) {
    //     tempProducts.push(this.products[element]);
    //   }
    // }
    // const atcModelSet = new Set();
    // this.productList = tempProducts.filter(product => {
    //   if (!product.atcmodel || atcModelSet.has(product.atcmodel)) {
    //     return false;
    //   }
    //   atcModelSet.add(product.atcmodel);
    //   return true;
    // });

    const arenaEventsSnap = await getDocs(query(collection(this.firestore, 'arena events'),where('docid', 'in', this.selectedQueue['arenaeventidlist'])));
    const productIds = arenaEventsSnap.docs.map(doc => doc.data()?.['productref']?.id).filter(Boolean);
    const seenAtcModels = new Set<string>();

    this.productList = productIds.map(id => this.products[id]).filter(Boolean).filter(product => {
      if (!product.atcmodel || seenAtcModels.has(product.atcmodel)) {
        return false;
      }
      seenAtcModels.add(product.atcmodel);
      return true;
    });

    collectionData(query(collection(this.firestore, 'biginvitation'),where('eventref','==',doc(this.firestore, 'queue generation', this.selectedQueue['docid'])))).pipe(takeUntil(this.unsubscribe$)).subscribe((list: any[]) => {

      this.bigInvitationList = list;

      const profileIds = [...new Set(list.map(e => e.profileid).filter(Boolean))];

      const invitedProfiles = profileIds.map(id => this.allProfilesMap.get(id)).filter(Boolean);

      invitedProfiles.sort((a, b) =>(a.name || '').localeCompare(b.name || ''));

      this.invitedParticipant = invitedProfiles;
      this.waitingParticipant = invitedProfiles.filter(p => p.waitinglist === true);
    });

    // Big Invitation
    // collectionData(query(collection(this.firestore, "biginvitation"), where("eventref", "==", doc(this.firestore, "queue generation", this.selectedQueue["docid"])))).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
    //   this.bigInvitationList = list;
    //   var profileid = list.map(e => e["profileid"])
    //   var profileList = []
    //   // console.log("profileid", profileid)
    //   for (let i = 0; i < profileid.length; i += 10) {
    //     const subProfile = profileid.slice(i, i + 10);
    //     getDocs(query(collection(this.firestore, "profile_data"), where("profileid", "in", subProfile))).then(profiledoc => {
    //       profiledoc.docs.forEach(doc => {
    //         var data = doc.data()
    //         profileList.push(data)
    //       })
    //       this.invitedParticipant = profileList
    //       this.invitedParticipant.sort((a, b) => a["name"].localeCompare(b["name"]))
    //       this.waitingParticipant = this.invitedParticipant.filter(e => e["waitinglist"] == true)
    //     })
    //   }
    // });


    // this.bigInvitationSubscription = this.firestore.collection("biginvitation", ref=>ref.where("eventref", "==", this.firestore.collection("queue generation").doc(this.selectedQueue["docid"]).ref)).valueChanges().subscribe(list=>{
    //   this.bigInvitationList = list
    //   var profileid = list.map(e => e["profileid"])
    //   var profileList = []
    //   // console.log("profileid", profileid)
    //   for (let i = 0; i < profileid.length; i+=10) {
    //     const subProfile = profileid.slice(i, i+10);
    //     this.firestore.collection("profile_data", ref=>ref.where("profileid", "in", subProfile)).get().toPromise().then(profiledoc=>{
    //       profiledoc.docs.forEach(doc=>{
    //         var data = doc.data()
    //         profileList.push(data)
    //       })
    //       this.invitedParticipant = profileList
    //       this.invitedParticipant.sort((a, b) => a["name"].localeCompare(b["name"]))
    //       this.waitingParticipant = this.invitedParticipant.filter(e => e["waitinglist"] == true)
    //     })
    //   }
    // })

    // Map Activity Combination to Stages
    var stageActivityParse = {}
    var stageList = this.selectedQueue["stages"] ?? []
    for (let i = 0; i < stageList.length; i++) {
      const stage = stageList[i]
      const stageProperty = this.selectedQueue["stageproperty"][stage];
      var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination: any = compulsoryActivity[j];
        const combinationArray = Array.isArray(activitycombination) ? activitycombination : [activitycombination];
        // var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        var parse = combinationArray.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        stageActivityParse[parse] = stageActivityParse[parse] ?? []
        stageActivityParse[parse].push(stage)
      }
    }

    // Queue Studio Pairing
    collectionData(query(collection(this.firestore, "queue studio pairing"), where("queueref", "==", doc(this.firestore, "queue generation", this.selectedQueue["docid"])), orderBy("created", "desc"))).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
      this.studioPairingList = list
      this.filteredStudioPairingList = new MatTableDataSource(this.studioPairingList);
      this.filteredStudioPairingList.paginator = this.paginator;
      var profileCount = {}
      var localMap = {}
      var studioin = 0
      var checkin = 0
      for (let i = 0; i < this.studioPairingList.length; i++) {
        const studio = this.studioPairingList[i];
        if (studio["studioin"]) studioin += 1
        if (studio["checkin"]) checkin += 1
        var participants = studio["participants"] ?? []
        participants.forEach(id => {
          profileCount[id] = profileCount[id] ?? []
          if (studio["studioin"]) profileCount[id].push(studio)
        })
        var studioActivity = Object.values(studio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",");
        (stageActivityParse[studioActivity] ?? []).forEach(stage => {
          localMap[stage] = localMap[stage] ?? []
          if (localMap[stage].filter((e: { [key: string]: any }) => e["docid"] == studio["docid"]).length == 0) localMap[stage].push(studio)
        })
      }
      this.studioinStudio = studioin
      this.profileStudioCount = profileCount
      this.stageStudioMap = localMap
      this.sortStudioAssignment();
      // let studioInCount:any[] = Object.values(this.profileStudioCount).flat()
      // console.log("studioin count" ,studioInCount.filter((e:any) => e['studioin'] && e['checkin']).length,checkin);
      // console.log("live count" ,studioInCount.filter(e => e['studioin'] && e['checkin'] && e['status'] == 'live').length,checkin);
      // console.log(this.profileStudioCount)
      // console.log(this.stageStudioMap)
    })

    // Studio Activity Log
    var shadowActivityList = this.bigActivityList.filter(e => e["shadow"]).map(e => e["docid"])
    // console.log(this.selectedQueue["docid"], shadowActivityList)
    if (shadowActivityList.length != 0) {
      collectionData(query(collection(this.firestore, "studio activity log"), where("queueid", "==", this.selectedQueue["docid"]), where("activity", "in", shadowActivityList))).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
        this.profileShadowCount = list.reduce(function (r, a) {
          r[a["profileid"]] = r[a["profileid"]] || []
          r[a["profileid"]].push(a)
          return r
        }, {})
        // console.log(this.profileShadowCount)
      })
    }

    // Live Assignment
    collectionData(query(collection(this.firestore, "live assignment"), where("queueid", "==", this.selectedQueue["docid"]))).pipe(takeUntil(this.unsubscribe$)).subscribe(list => {
      this.liveAssignmentList = list
      var completedStageAssignment = {}
      var stageCompletedParticipant = {}
      // Group Assignment by Studio
      this.studioAssignmentMap = this.liveAssignmentList.reduce(function (r, a) {
        completedStageAssignment[a["stagename"]] = completedStageAssignment[a["stagename"]] || []
        if (a["status"] == "completed") completedStageAssignment[a["stagename"]].push(a)
        r[a["studioid"]] = r[a["studioid"]] || []
        if (!r[a["studioid"]].includes(a["participantid"])) r[a["studioid"]].push(a["participantid"])
        return r
      }, {})

      Object.keys(completedStageAssignment).forEach(stage => {
        stageCompletedParticipant[stage] = Array.from(new Set(completedStageAssignment[stage].map(e => e["participantid"]))).length
      })

      this.stageCompletedcount = stageCompletedParticipant
      // console.log(this.studioAssignmentMap)
      // console.log(this.stageCompletedcount)
      this.sortStudioAssignment()
    })

    // Queue Token
    collectionData(query(collection(this.firestore, 'queue_token'), where("queueref", "==", doc(this.firestore, "queue generation", this.selectedQueue.docid)), where("tokenstatus", "==", "Active"), orderBy("logdate", "asc"))).pipe(takeUntil(this.unsubscribe$)).subscribe(token => {
      var lastStage = this.selectedQueue["stages"][this.selectedQueue["stages"].length - 1]
      this.queueTokenList = token.sort((a, b) => (a["profile_name"] ?? "").localeCompare(b["profile_name"] ?? ""))
      this.completedToken = this.queueTokenList.filter(e => e["currentstage"] == lastStage).length
      var localPreAssign = {}
      // Group token by Stage
      this.stageTokenMap = this.queueTokenList.reduce(function (r, a) {
        // Pre Assigned
        Object.keys(a["preassigned"] ?? {}).forEach(stage => {
          (a["preassigned"][stage] ?? []).forEach(studio => {
            localPreAssign[studio] = localPreAssign[studio] ?? []
            localPreAssign[studio].push(a)
          })
        })
        // Filter Token Status
        r[a["currentstage"]] = r[a["currentstage"]] || {}
        r[a["currentstage"]]["waiting"] = r[a["currentstage"]]["waiting"] ?? 0
        r[a["currentstage"]]["queued"] = r[a["currentstage"]]["queued"] ?? 0
        r[a["currentstage"]]["instudio"] = r[a["currentstage"]]["instudio"] ?? 0
        r[a["currentstage"]]["total"] = (r[a["currentstage"]]["total"] ?? 0) + 1
        r[a["currentstage"]]["tokenlist"] = r[a["currentstage"]]["tokenlist"] ?? []
        r[a["currentstage"]]["tokenlist"].push(a)
        if (a["status"] == "ready") {
          r[a["currentstage"]]["waiting"] += 1
        }
        else if (a["status"] == null || a["status"] == "queued" || a["status"] == "invited") {
          r[a["currentstage"]]["queued"] += 1
        }
        else if (a["status"] == "instudio") {
          r[a["currentstage"]]["instudio"] += 1
        }
        return r
      }, {})
      this.studioPreAssign = localPreAssign
      // console.log(this.stageTokenMap)
      // console.log(this.studioPreAssign)
    })
  }

  getUniquePreAssignedTokens(studioid: string): any[] {
    if (!this.studioPreAssign[studioid]) {
      return [];
    }

    // Remove duplicates based on token docid
    const uniqueTokens = this.studioPreAssign[studioid].filter((token, index, self) =>
      index === self.findIndex(t => t['docid'] === token['docid'])
    );

    return uniqueTokens;
  }

  getStageName(token, studioid): string {
    if (!token['preassigned']) {
      return 'N/A';
    }

    const stages = Object.keys(token['preassigned'])
      .filter(stage => {
        const studios = token['preassigned'][stage];
        return Array.isArray(studios) && studios.includes(studioid);
      });

    return stages.length > 0 ? stages.join(', ') : 'N/A';
  }

  filterStudioPairing() {
    return this.studioPairingList.filter(studio => {
      var participants = studio["participants"]
      const isDelected = [null, undefined, false].includes(studio['delete']);
      return isDelected && participants.some(e => this.mapProfile[e]?.toLowerCase().includes(this.filterStudioText.toLowerCase()))
    })
  }

  // Sort no of Session By each Studio
  sortStudioAssignment() {
    Object.keys(this.stageStudioMap).forEach(key => {
      this.stageStudioMap[key]?.sort((a, b) => (this.studioAssignmentMap[b["docid"]]?.length ?? 0) - (this.studioAssignmentMap[a["docid"]]?.length ?? 0))
      this.stageStudioMap[key] = this.stageStudioMap[key]
    })
  }

  filterInvitedParticipant(index) {
    let filteredParticipants = [];
    
    let filteredCohorts = this.eventCohorts.filter((e)=>e['bigactivity'] == this.newStudioPairing[index]['activity']);
    
    filteredCohorts.forEach(cohort => {
      if (Array.isArray(cohort['participantidlist'])) {
        filteredParticipants.push(...cohort['participantidlist']);
      }
    });
    
    let returnData = filteredParticipants.filter(e => this.mapProfile[e].toLowerCase().includes(this.filterText.toLowerCase()));
    
    return returnData.map((e)=>this.mapProfileData[e]);
  }

  filterTokenParticipant() {
    return this.queueTokenList.filter(e => e["profile_name"].toLowerCase().includes(this.filterText.toLowerCase()))
  }

  filterActivityfunction() {
    return this.bigActivityList.filter(e =>
      e["activity"].toLowerCase().includes(this.filterActivity.toLowerCase())
    );
  }

  addPair() {
    this.newStudioPairing.push({
      profileid: null,
      activity: null,
      atcmodel: null
    })
  }

  removePair(index) {
    // console.log(index)
    this.newStudioPairing.splice(index, 1)
  }

  async createStudioPairing() {
    let validation = true;
    const participants: string[] = [];
    const participantsactivity: any = {};
    let atcmodel: any = null;

    // 1️⃣ Validation + data preparation
    for (const element of this.newStudioPairing) {

      // atcmodel handling
      if (element?.atcmodel && !element.atcmodel.includes?.(null)) {
        atcmodel = element.atcmodel;
      }

      // required fields check
      if (element?.profileid && element?.activity) {
        participants.push(element.profileid);
        participantsactivity[element.profileid] = element.activity;
      } else {
        validation = false;
        break;
      }
    }

    if (!validation) {
      alert('Fill Every Field!');
      return;
    }

    try {
      // 2️⃣ Create batch
      const batch = writeBatch(this.firestore);

      const pairingRef = doc(collection(this.firestore, 'queue studio pairing'));

      // 3️⃣ Batch set
      batch.set(pairingRef, {
        created: serverTimestamp(),
        docid: pairingRef.id,
        participants,
        participantsactivity,
        queueref: doc(this.firestore, 'queue generation', this.selectedQueue['docid']),
        studioin: false,
        atcmodel,
        openvidu: this.openViduEnabled ?? false
      });

      // 4️⃣ Commit batch
      await batch.commit();

      // 5️⃣ UI updates
      this.snackBar.open('Studio created Successfully!', null, {
        duration: 3000
      });

      this.newStudioPairing = [];
      this.addPair();

    } catch (error) {
      console.error('Error creating studio pairing:', error);
      this.snackBar.open('Failed to create studio', null, {
        duration: 3000
      });
    }
  }

  // async createStudioPairing() {
  //   var validation = true
  //   var participants = []
  //   var participantsactivity = {}
  //   var atcmodel
  //   for (let i = 0; i < this.newStudioPairing.length; i++) {
  //     const element = this.newStudioPairing[i];
  //     if (![null, undefined].includes(element['atcmodel'])) {
  //       atcmodel = !element['atcmodel'].includes(null) ? element['atcmodel'] : null
  //     } else {
  //       atcmodel = null
  //     }
  //     if (element["profileid"] != null && element["activity"] != null) {
  //       participants.push(element["profileid"])
  //       participantsactivity[element["profileid"]] = element["activity"]
  //     }
  //     else {
  //       validation = false
  //       break;
  //     }
  //   }
  //   if (validation) {
  //     var docid = doc(collection(this.firestore, 'queue studio pairing')).id
  //     await setDoc(doc(this.firestore, "queue studio pairing", docid), {
  //       created: serverTimestamp(),
  //       docid: docid,
  //       participants: participants,
  //       participantsactivity: participantsactivity,
  //       queueref: doc(this.firestore, "queue generation", this.selectedQueue["docid"]),
  //       studioin: false,
  //       atcmodel: atcmodel,
  //       openvidu: this.openViduEnabled ?? false
  //     }).then(() => {
  //       this.snackBar.open("Studio created Successfully!", null, {
  //         duration: 3000
  //       })
  //     }).then(() => {
  //       this.newStudioPairing = []
  //       this.addPair()
  //     })
  //   }
  //   else {
  //     alert("Fill Every Field!")
  //   }
  // }

  toggleStudio(studio) {
    // console.log(studio["studioin"],!studio["studioin"]);
    updateDoc(doc(this.firestore, "queue studio pairing", studio["docid"]), {
      studioin: !studio["studioin"]
    })
    this.filterStudios()
  }

  toggleCheckin(studio) {
    // console.log(studio["checkin"],!studio["checkin"]);
    updateDoc(doc(this.firestore, "queue studio pairing", studio["docid"]), {
      checkin: !studio["checkin"]
    })
    this.filterStudios()
  }

  toggleOpenVidu(studio) {
    // console.log(studio["checkin"],!studio["checkin"]);
    updateDoc(doc(this.firestore, "queue studio pairing", studio["docid"]), {
      openvidu: !(studio["openvidu"] ?? false)
    })
    this.filterStudios()
  }

  updatePreAssigned(studioid, value) {
    // console.log(stage, studioid)
    var batch = writeBatch(this.firestore)
    var selectedToken = value.map(e => e["docid"])
    // console.log("Selected Token", selectedToken)
    // console.log("Assigned Token", assignedToken)
    let stages = Object.keys(this.stageStudioMap).filter(element => {
      let studioList = this.stageStudioMap[element].filter(e => e['docid'] == studioid);
      return studioList.length > 0;
    });

    value.forEach(token => {
      token["preassigned"] = token["preassigned"] ?? {}
      stages.forEach((stage) => {
        token["preassigned"][stage] = token["preassigned"][stage] ?? []
        if (!token["preassigned"][stage].includes(studioid)) token["preassigned"][stage].push(studioid)
      })

      batch.update(doc(this.firestore, "queue_token", token["docid"]), {
        preassigned: token["preassigned"]
      })
    })

    stages.forEach((stage) => {
      var assignedToken = this.queueTokenList.filter(e => (e["preassigned"] ?? {})[stage] != null && (e["preassigned"] ?? {})[stage] != undefined)

      assignedToken.forEach(token => {
        if (!selectedToken.includes(token["docid"])) {
          token["preassigned"] = token["preassigned"] ?? {}
          token["preassigned"][stage] = token["preassigned"][stage] ?? []
          var index = token["preassigned"][stage].findIndex(e => e == studioid)
          if (index != -1) {
            token["preassigned"][stage].splice(index, 1)

            batch.update(doc(this.firestore, "queue_token", token["docid"]), {
              preassigned: token["preassigned"]
            })
          }
        }
      })
    })
    batch.commit()
  }

  updateShadowLimit(studioid, value) {
    // console.log(studioid, value)
    updateDoc(doc(this.firestore, "queue studio pairing", studioid), {
      shadowlimit: value || null
    })
  }

  studioCheckin(studio) {
    updateDoc(doc(this.firestore, "queue studio pairing", studio["docid"]), {
      checkin: !studio["checkin"]
    })
  }

  setcheckintime(event: any, participant: any) {
    // console.log(participant);

    const selectedDateTime = new Date(event.target.value);
    var scheduletime = participant['checkinscheduletime'] ?? []
    scheduletime.push(selectedDateTime)
    // console.log(scheduletime);
    updateDoc(doc(this.firestore, "queue studio pairing", participant['docid']), {
      checkinscheduletime: scheduletime
    })
  }

  pauseonhold(studio) {
    const currentDate = new Date();
    studio["checkinscheduletime"] = studio["checkinscheduletime"].filter(timestamp => {
      const timestampTime = timestamp.toDate();
      // console.log(timestampTime);

      return timestampTime == currentDate;
    });
    updateDoc(doc(this.firestore, "queue studio pairing", studio["docid"]), {
      checkin: !studio["checkin"],
      onhold: false,
      checkinscheduletime: studio["checkinscheduletime"]
    })
  }

  markflag(studio) {
    if (window.confirm('Are you sure  want to mark as changework Expert?')) {
      updateDoc(doc(this.firestore, "queue studio pairing", studio["docid"]), {
        implementationexpert: true
      })
    }
  }

  deleteStudio(studio) {
    // console.log(studio['docid']);
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      delete: true
    })
  }

  filterStudios() {
    const filteredData = this.studioPairingList.filter(studio => {
      const hasParticipants = studio.participants && studio.participants.length > 0;
      const matchesParticipant = this.filterStudioText ? studio.participants.some(participant => this.mapProfile[participant].toLowerCase().includes(this.filterStudioText.toLowerCase())) : true;
      const matchesActivity = this.filterActivityValue ? hasParticipants && studio.participants.some(participant => studio.participantsactivity[participant] === this.filterActivityValue) : true;
      const matchesAtcModel = this.filterAtcModelValue && ![null, undefined].includes(studio.atcmodel) ? studio.atcmodel.includes(this.filterAtcModelValue) : true;
      const matchesStatus = this.filterStatusValue !== '' ? studio.studioin === this.filterStatusValue : true;

      return matchesParticipant && matchesActivity && matchesAtcModel && matchesStatus;
    });
    this.filteredStudioPairingList.data = filteredData;
    // console.log(filteredData);  
  }

  toggleSidebar(): void {
    this.displayParticipantRole = !this.displayParticipantRole;
  }


}
