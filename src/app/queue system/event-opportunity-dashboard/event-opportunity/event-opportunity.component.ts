import { Component, Input, OnInit,Output , EventEmitter } from '@angular/core';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { collection, collectionData, doc, Firestore, getDoc, getDocs, orderBy, query, where } from '@angular/fire/firestore';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthguardService } from '../../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { ActivatedRoute, Router } from '@angular/router';


@Component({
  selector: 'app-event-opportunity',
  imports: [],
  templateUrl: './event-opportunity.component.html',
  styleUrl: './event-opportunity.component.css'
})
export class EventOpportunityComponent {
  @Input() queueid:string
  @Output() eventData = new EventEmitter<any>();
  mapProfile = {} //in
  selectedQueue = null 
  viewOnly = true
  queueTokenSubscription: Subscription
  queueTokenList = []
  completedToken = 0
  stageTokenMap = {}
  stages = []
  // stages = ['ATC Briefing' , 'Diagnostics', 'Diagnostics In-person', 'Diagnostics Readiness Changework', 'Consultation', 'Implementation']
  showReport = false;
  headerStyles: string[] = [
    'consultation-header',
    'diagnostics-header',
    'implementation-header',
    'video-header'
  ];

  // Stage Property
  stageStudioMap = {}
  stageCompletedcount = {}
 
  // Live Assignment
  liveAssignmentSubscription: Subscription
  liveAssignmentList = []
  studioAssignmentMap = {}
  studioPreAssign = {}
  // stageCountMap = {}
  stageStudioCount = {}
  // Create Studio
  newStudioPairing = []

  // big Activity Property
  bigActivitySubcription: Subscription // in
  bigActivityList = [] // in
  mapBigActivity = {} //in

  // Shadow Property
  profileShadowCount = {}
  studioActivityLogSubscription: Subscription

  // Big Invitation Property
  bigInvitationSubscription :Subscription
  bigInvitationList = []
  // invitedParticipant = []
  // waitingParticipant = []

  // Role Assign - Arena Studio Pairing Property
  studioPairingSubscription: Subscription
  studioPairingList = []
  profileStudioCount = {}
  studioinStudio = 0
  selectedDate:Date = new Date()
  // participantInLive = 0
  // participantNotInLive = 0
  newStageStudioMap = {}
  ArenaLiveparticipants = 0
  ArenaIdleparticipants = 0
  private subscription = new Subject<void>()
  mapLiveStudioToParticipants = {}
  mapLiveStudioToData = {}
  liveBigParticipantsByStage = {}
  liveStudioMap = {}
  studioMap = {}
  constructor(
    private firestore: Firestore,
    public guard : AuthguardService,
    public snackBar : MatSnackBar,
    public dialog : MatDialog,
    private route : ActivatedRoute,
    private router : Router,
  ){
    // const loading = this.dialog.open(LoadingProgressComponent, {
    //   data: {msg: "Loading"}
    // })
    // guard.getProfileMap().then(data => this.mapProfile = data.map)
    guard.getRoles().then(async roleData=>{
      // if(roleData["floor"] || roleData["ah"] || roleData["admin"] || roleData["mentor"] || roleData["developer"]){
        this.getQueueData()
        // loading.close()
      // }else{
      //   this.router.navigateByUrl("/")
      // }
    })
    collectionData(collection(this.firestore, 'bigactivity')).pipe(takeUntil(this.subscription)).subscribe(snap => {
        this.bigActivityList = snap
        this.bigActivityList.forEach(e => {
          this.mapBigActivity[e["docid"]] = e["activity"]
        })
      })
  }


  ngOnChanges(){
    this.getQueueData()
  }

   ngOnDestroy(){
      this.subscription.complete();
      this.subscription.next();
    }
  
    getPanelHeaderClass(index: number): string {
      return this.headerStyles[index*5 % this.headerStyles.length];
    }

    getQueueData(){
      getDoc(doc(this.firestore,'queue generation', this.queueid)).then(async queueData=>{
        this.selectedQueue = queueData.data()
        this.onQueueSelect()
      })
    }
  
    onQueueSelect(){  
  
      // Big Invitation
      collectionData(query(collection(this.firestore, 'biginvitation'), where("eventref", "==", doc(this.firestore, 'queue generation', this.selectedQueue["docid"]))), {idField : 'id'}).pipe(takeUntil(this.subscription)).subscribe(list=>{
        this.bigInvitationList = list
        var profileid = list.map(e => e["profileid"])
        var profileList = []
        for (let i = 0; i < profileid.length; i+=10) {
          const subProfile = profileid.slice(i, i+10);
          getDocs(query(collection(this.firestore, 'profile_data'), where("profileid", "in", subProfile))).then(profiledoc=>{
            profiledoc.docs.forEach(doc=>{
              var data = doc.data()
              profileList.push(data)
            })
          })
        }
      })
     
  
      // Map Activity Combination to Stages
      var stageActivityParse = {}
      var stageList = this.selectedQueue["stages"] ?? []
      for (let i = 0; i < stageList.length; i++) {
        const stage = stageList[i]
        const stageProperty = this.selectedQueue["stageproperty"][stage];
        var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
        for (let j = 0; j < compulsoryActivity.length; j++) {
          const activitycombination:any = compulsoryActivity[j];
          var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
          stageActivityParse[parse] = stageActivityParse[parse] ?? []
          stageActivityParse[parse].push(stage)
        }
      }
      // console.log("stageActivityParse",stageActivityParse);
      
      // Queue Studio Pairing
        collectionData(query(collection(this.firestore, 'queue studio pairing'), where("queueref", "==", doc(this.firestore, 'queue generation', this.selectedQueue["docid"])), orderBy("created", "desc")), {idField: 'id'}).pipe(takeUntil(this.subscription)).subscribe(list => {
        this.studioPairingList = list
        //
        this.liveStudioMap = this.studioPairingList.filter(e => e['studioin'] == true && e['checkin'] == true && e['status'] === 'live').reduce((a,c) => {
          a[c['docid']] = c
          return a
        },{})

        this.studioMap = this.studioPairingList.reduce((a, c) => {
          a[c['docid']] = c
          return a
        }, {})
        //
        var localMap = {}
        for (let i = 0; i < this.studioPairingList.length; i++) {
          const studio = this.studioPairingList[i];
          var studioActivity = Object.values(studio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",");
          (stageActivityParse[studioActivity] ?? []).forEach(stage =>{
            localMap[stage] = localMap[stage] ?? []
            if(localMap[stage].filter((e:{[key:string]:any}) => e["docid"] == studio["docid"]).length == 0) localMap[stage].push(studio)
          })
        }
        this.stageStudioMap = localMap
        // console.log("stageStudioMap",this.stageStudioMap);

        let newLocalMap = {}
        const liveParticipantIds = new Set();
        for (const key in localMap) {
          if (localMap[key].length !== 0) {
           
            newLocalMap[key] = newLocalMap[key] || {};
            // newLocalMap[key]['live'] = localMap[key].filter(e => e['studioin'] == true && e['checkin'] == true && e['status'] === 'live'  && !liveParticipantIds.has(e.docid));
            // newLocalMap[key]['live'].forEach(e => liveParticipantIds.add(e.docid));
            // const liveParticipantsCount = newLocalMap[key]['live'].reduce((total, element) => {
            //   return total + Object.values(element["participantsactivity"]).length; 
            // }, 0);
            
            // Store the total count in newLocalMap
            // newLocalMap[key]['live']['participantsactivity'] = liveParticipantsCount;
            // this.ArenaLiveparticipants += liveParticipantsCount; 
        
            // console.log(newLocalMap[key]['live']['participantsactivity'], 'activity');
            newLocalMap[key]['idle'] = localMap[key].filter(e => e['studioin'] == true && e['checkin'] == true && e['status'] !== 'live');
            // if (newLocalMap[key]['live'].length === 0) {
              // newLocalMap[key]['idle'] = localMap[key].filter(e => e['studioin'] == true && e['checkin'] == true); 
            // }
            // Calculate total participants activity for idle participants
            const idleParticipantsCount = newLocalMap[key]['idle'].reduce((total, element) => {
              return total + Object.values(element["participantsactivity"]).length; 
            }, 0);
            
            newLocalMap[key]['idle']['participantsactivity'] = idleParticipantsCount;
            // console.log(newLocalMap[key]['live']['participantsactivity'], 'activity');
  
            // this.ArenaIdleparticipants += idleParticipantsCount; 
          }
        }
        this.newStageStudioMap = newLocalMap
        // console.log(this.newStageStudioMap ,"this.newStageStudioMap ");
        
        this.emitData()
        
      })
  
      // Studio Activity Log
      // var shadowActivityList = this.bigActivityList.filter(e => e["shadow"]).map(e => e["docid"])
      // console.log(this.selectedQueue["docid"], shadowActivityList)
      // if(shadowActivityList.length != 0){
      //   this.studioActivityLogSubscription = this.firestore.collection("studio activity log", ref=>ref.where("queueid", "==", this.selectedQueue["docid"]).where("activity", "in", shadowActivityList)).valueChanges().subscribe(list =>{
      //     this.profileShadowCount = list.reduce(function (r, a){
      //       r[a["profileid"]] = r[a["profileid"]] || []
      //       r[a["profileid"]].push(a)
      //       return r
      //     }, {})
      //   })
      // }
  
      // Live Assignment
      collectionData(query(collection(this.firestore, 'live assignment'), where("queueid", "==", this.selectedQueue["docid"])), {idField: 'id'}).pipe(takeUntil(this.subscription)).subscribe(list => {
        this.liveAssignmentList = list
        //
        this.liveBigParticipantsByStage = this.liveAssignmentList.filter(e => e['status'] === 'live').reduce((a,c) => {
          a[c['stagename']] = a[c['stagename']] || []
          a[c['stagename']].push(c)
          return a
        },{})
        // console.log("liveBigParticipantsByStage",this.liveBigParticipantsByStage);
        
        //
        var completedStageAssignment = {}
        var stageCompletedParticipant = {}
        // Group Assignment by Studio
        this.studioAssignmentMap = this.liveAssignmentList.reduce(function(r, a){
          completedStageAssignment[a["stagename"]] = completedStageAssignment[a["stagename"]] || []
          if(a["status"] == "completed") completedStageAssignment[a["stagename"]].push(a)
          r[a["studioid"]] = r[a["studioid"]] || []
          if(!r[a["studioid"]].includes(a["participantid"])) r[a["studioid"]].push(a["participantid"])
          return r
        }, {})
  
        Object.keys(completedStageAssignment).forEach(stage=>{
          stageCompletedParticipant[stage] = Array.from(new Set(completedStageAssignment[stage].map(e => e["participantid"]))).length
        })
        // console.log(this.studioAssignmentMap);
        
        //get live participants
        this.mapLiveStudioToParticipants = this.liveAssignmentList.filter(e => e['status'] === 'live').reduce((a,c) => {
          a[c['studioid']] = c['participantid']
          return a
        },{})

        this.mapLiveStudioToData = this.liveAssignmentList.filter(e => e['status'] === 'live').reduce((a,c) => {
          a[c['studioid']] = c
          return a
        },{})
  
        // Get daily report
        // var AssignmentcompletedbyToday = {};
        // var stagecompletedbyToday = {};
        // var availableSpecialist = {}
        // var studioStage = {}
        // const today = new Date();
        // const todayString = this.selectedDate.toISOString().split('T')[0]; 
        // this.stageCountMap = this.liveAssignmentList.reduce((r, a) => {
        //   if(![null,undefined].includes(a['updated'])){
        //     AssignmentcompletedbyToday[a["stagename"]] = AssignmentcompletedbyToday[a["stagename"]] || {};
        //     if (a["status"] === "completed" && a["updated"].toDate().toISOString().split('T')[0] === todayString) {
        //       AssignmentcompletedbyToday[a["stagename"]][a['participantid']] = AssignmentcompletedbyToday[a["stagename"]][a['participantid']] || []
        //       AssignmentcompletedbyToday[a["stagename"]][a['participantid']].push(a);
        //     }
        //   }
        //   return r; 
        // }, {});
        // console.log(AssignmentcompletedbyToday);
        
  
        // Object.keys(AssignmentcompletedbyToday).forEach(stage => {
        //   stagecompletedbyToday[stage] = Object.keys(AssignmentcompletedbyToday[stage]).length
        // });
        // console.log(stagecompletedbyToday);
        
        // this.stageCompletedcount = stageCompletedParticipant
        // this.stageCountMap = stagecompletedbyToday
        // for (let i = 0; i < this.studioPairingList.length; i++) {
        //   const element = this.studioPairingList[i];
        //   var activityParse = Object.values(element["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        //   // console.log(activityParse,'activityParse');
          
        //   var stageList = this.selectedQueue["stages"] ?? []
        //   for (let i = 0; i < stageList.length; i++) {
        //     const stage = stageList[i]
        //     const stageProperty = this.selectedQueue["stageproperty"][stage];
        //     var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
        //     for (let j = 0; j < compulsoryActivity.length; j++) {
        //       const activitycombination:any = compulsoryActivity[j];
        //       var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        //       // console.log(parse, 'parse');
        //       if (!studioStage[stage]) {
        //         studioStage[stage] = 0; // Initialize to 0
        //       }
        //       if(parse == activityParse){
        //         studioStage[stage] += 1
        //       }
        //     }
        //   }
        // }
        // var activityParse = Object.values(this.selectedStudio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        // this.stageStudioCount = studioStage
        // console.log(studioStage, 'stageStudioCount');
        this.emitData()
      })
  
      // Queue Token
      collectionData(query(collection(this.firestore, 'queue_token'), where("queueref", "==", doc(this.firestore, 'queue generation',this.selectedQueue.docid)), where("tokenstatus", "==", "Active"), orderBy("logdate", "asc")), {idField: 'id'}).pipe(takeUntil(this.subscription)).subscribe(token => {
        var lastStage = this.selectedQueue["stages"][this.selectedQueue["stages"].length - 1]
        this.queueTokenList = token.sort((a, b) => (a["profile_name"] ?? "").localeCompare(b["profile_name"] ?? ""))
        this.completedToken = this.queueTokenList.filter(e => e["currentstage"] == lastStage).length
        var localPreAssign = {}
        // Group token by Stage
        this.stageTokenMap = this.queueTokenList.reduce(function(r, a){
          // Pre Assigned
          Object.keys(a["preassigned"] ?? {}).forEach(stage=>{
            (a["preassigned"][stage] ?? []).forEach(studio=>{
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
          if(a["status"] == "ready"){
            r[a["currentstage"]]["waiting"] += 1
          }
          else if(a["status"] == null || a["status"] == "queued" || a["status"] == "invited"){
            r[a["currentstage"]]["queued"] += 1
          }
          else if(a["status"] == "instudio"){
            r[a["currentstage"]]["instudio"] += 1
          }
          return r
        }, {})
        this.studioPreAssign = localPreAssign
        // console.log(this.studioPreAssign,"studioPreAssign")
        
        this.stages = []
        for (const stage in this.stageTokenMap) {
          if(this.stageTokenMap[stage]['waiting'] > 0 || this.stageTokenMap[stage]['instudio'] > 0){
            this.stages.push(stage)
          }
        }
        this.emitData()
      })
    }

    private emitData(): void {
      this.eventData.emit({
        stages : this.stages,
        stageTokenMap : this.stageTokenMap,
        // stageCountMap : this.stageCountMap,
        liveBigParticipantsByStage:this.liveBigParticipantsByStage,
        newStageStudioMap : this.newStageStudioMap,
        mapBigActivity : this.mapBigActivity,
        mapLiveStudioToParticipants : this.mapLiveStudioToParticipants,
        mapLiveStudioToData: this.mapLiveStudioToData,
        studioPreAssign : this.studioPreAssign,
        studioAssignmentMap : this.studioAssignmentMap,
        liveStudioMap :this.liveStudioMap,
        studioMap: this.studioMap
      });
    }
}
