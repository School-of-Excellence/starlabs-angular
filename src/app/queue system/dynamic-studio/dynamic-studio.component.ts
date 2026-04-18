import { Component, OnInit, ChangeDetectorRef, QueryList, ElementRef, ViewChildren, ViewChild, NgZone } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom, Subject, Subscription, takeUntil } from 'rxjs';
import { QueueInvitationApprovalComponent } from '../queue-invitation-approval/queue-invitation-approval.component';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { AssignQueueStudioComponent } from '../assign-queue-studio/assign-queue-studio.component';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AssignProcedureStudioComponent } from '../assign-procedure-studio/assign-procedure-studio.component';
import { InviteOtherStudioComponent } from '../invite-other-studio/invite-other-studio.component';
import { AcceptOtherStudioComponent } from '../accept-other-studio/accept-other-studio.component';
import { PreassignStudioComponent } from '../preassign-studio/preassign-studio.component';
import { HoldAlertDialogComponent } from '../hold-alert-dialog/hold-alert-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { collection, collectionData, doc, Firestore, getDoc, getDocs, orderBy, query, updateDoc , arrayUnion, deleteDoc, setDoc, serverTimestamp, arrayRemove, addDoc, writeBatch, collectionSnapshots, documentId, limit, where, DocumentReference } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { StageIncompleteConfirmationComponent } from '../stage-incomplete-confirmation/stage-incomplete-confirmation.component';
import { ViewParticipantAtcComponent } from '../../ATC/view-participant-atc/view-participant-atc.component';


@Component({
  selector: 'app-dynamic-studio',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
    ViewParticipantAtcComponent,
  ],
  templateUrl: './dynamic-studio.component.html',
  styleUrl: './dynamic-studio.component.css'
})
export class DynamicStudioComponent {
  @ViewChildren('itemElement') itemElements: QueryList<ElementRef>;
  profileRoles = {}
  profileid = null
  mapProfile = {}
  ongoingQueueList = []
  ongoingQueue = {}
  selectedQueue = {}
  queueStudioCounts: { [queueid: string]: number } = {}
  queuesWithStudios: any[] = []
  noStudioInAnyQueue = false
  queueStudioCountSubscriptions: Subscription[] = []
  mapVariationName = {}
  queueVariation = {}
  mapQueue = {}
  // Activity
  activitySubscription:Subscription = null
  mapActivity:any = {}
  // Studio
  additionalActivities = {}
  mapStudio = {}
  studioPairingSubscription:Subscription = null
  studioList = []
  selectedStudio = {}
  availableStudioList = []
  liveStudio = []
  // Outside Studio
  outsideLiveAssignmentSubscription: Subscription = null
  outsideLiveAssignment = []
  // Studio Assignment
  liveassignmentSubscription:Subscription = null
  liveAssignment = null
  mapStudioLiveAssignment = {}
  // Token
  tokenSubscription:Subscription = null
  stageTokenList = []
  // Studio Invitation
  invitationCountdown:MatDialogRef<any> = null
  studioInvitationSubscription: Subscription 
  studioInvitation = null
  studioGroupingInvitationSubscription: Subscription = null
  studioconversationSubscription: Subscription = null
  // Zoom Control
  zoomlinkGenerator = false
  // ATC Property
  mapProcedure = {}
  alphaATCList = []
  unvalidatedATCList = []
  mapATCnotes = {}
  cwATClist = [] // Changework Assigned ATC
  showPreviousATC: boolean = false
  showLoveLetter: boolean = false
  loveLetterList: any[] = []
  loveLetterLoading: boolean = false
  loveLetterLoadedFor: string | null = null
  // Form
  participantForm = []
  // Triple ATC
  tripleATCSubscription: Subscription
  tripleATCList = []
  // Transferred Queue
  transferredQueue = null
  
  checkinlog : any
  onhold: boolean = false;
  allStudioList = [];
  studiochatList = []
  mapProducts = {}
  mappreassignedprocedure = {}
  mappreassignedagent = {}
  chatref: any;
  chatsloading : boolean;
  messagescopy;
  messages = [];
  subscription = {};
  subscribemessagesboolean: boolean;
  selectedChat =  null;
  currentuseruid;
  currentuserData: any;
  message='';
  mapNotificationid={};
  mapProfileuid: any = {};
  selectedParticipant = false
  participantinvitationSubscription : Subscription
  private subscriptionHandle = new Subject<void>()
  messageform:FormGroup 
  chatId: any;
  pendingMessagesCount: { [key: string]: number } = {};
  isChatContainerOpen: boolean = false;
  // deleteOption : boolean = false
  // Participant AEL
  aelLevelList = []
  participantAEL = {}
  isLoadingStudios: boolean;

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public dialog: MatDialog,
    public http: HttpClient,
    public router: Router,
    private cdr: ChangeDetectorRef,
    public snackBar: MatSnackBar,
    public formbuilder: FormBuilder,
    private ngZone: NgZone,
    private route: ActivatedRoute
  ) {
    const overrideProfileId = this.route.snapshot.queryParamMap.get('profileid')
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Loading..."},
      disableClose: true
    })
    this.messageform = this.formbuilder.group({
      sms : [''],
      files: [[],],
    });
    guard.getRoles().then(async roles=>{
      this.profileRoles = roles
      this.profileid = overrideProfileId || roles['profile_ref'].id
      // if(environment.firebase.projectId == "fir-sample-aae4a" && this.profileid == 'l0ApFnXuM5Ac8tpqJQnk'){
      //   this.deleteOption = true
      // }else if(environment.firebase.projectId == "starlabs-test" && this.profileid == 'g2mQ7GiD6PSV8oaZnZLb'){
      //   this.deleteOption = true
      // }else{this.deleteOption = false}
      // fetch user data
      await getDoc(roles['profile_ref']).then((profileDoc) => {
        if (profileDoc.exists()) {
          this.currentuserData = profileDoc.data();
          this.currentuseruid = profileDoc.data()['user_ref'].id;        
        }
      });
      // get atcmodel
      await getDocs(collection(this.firestore, 'products')).then(snap => {
        for (let i = 0; i < snap.docs.length; i++) {
          const element = snap.docs[i].data();
          this.mapProducts[element['id']] = element['atcmodel']
        }
      })
      // if(roles["eis"] || roles["changeagent"] || roles["ah"] || roles["admin"] || roles["developer"]){
        await getDocs(query(collection(this.firestore, 'queue generation'), where("queueenddate", ">=", new Date()))).then(async queue=>{
          var activeQueueList = queue.docs.filter(e => e.data()["queuestartdate"].toDate() <= new Date()) // Find Ongoing Queue
          var live = []
          activeQueueList.forEach(e =>{
            var data = e.data()
            live.push(data)
            this.mapQueue[e.id] = e.data()["queuename"]
          })
          this.ongoingQueueList = live
          if(this.ongoingQueueList.length != 0){
            await this.loadQueueStudioCounts()
            const firstWithStudios = this.ongoingQueueList.find(q => (this.queueStudioCounts[q['docid']] || 0) > 0)
            this.noStudioInAnyQueue = !firstWithStudios
            this.ongoingQueue = firstWithStudios || this.ongoingQueueList[0]
            this.selectedQueue = this.ongoingQueue
            await this.onQueueSelect()
            this.mapProfile = (await guard.getProfileMap()).map
          }
        })
      // }
      loading.close()
      if(this.ongoingQueue["docid"] == null || this.ongoingQueue["docid"] == undefined){
        alert("No Active Queue Found.")
      }
        //
      // })
    })
      //fetch profilelist and user list
      collectionData(query(collection(this.firestore, 'profile_data'), orderBy('name','asc')), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe((profileDoc)=>{
        // this.profileList = [];
        // this.userListId=[];
        this.mapNotificationid={};
        for (let i = 0; i < profileDoc.length; i++) {
          const element = profileDoc[i];
          // this.profileList.push(profileDoc[i].payload.doc.id);
  
          if(![null,undefined,''].includes(element['notification_token']) ){
            this.mapNotificationid[element['user_ref'].id] = element['notification_token']
          }
          
          if(element['user_ref'] != null || element['user_ref'] != undefined){
            // this.userListId.push(element['user_ref'].id);
            this.mapProfileuid[element['user_ref'].id] = element
          }
        }
      });
  }

  ngOnInit(): void {
    this.guard.getProcedureMap().then(value => this.mapProcedure = value)
    collectionData(collection(this.firestore,"bigactivity"), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(list=>{
      list.forEach(data=>{
        this.mapActivity[data["docid"]] = data["activity"]
      })
    })
    this.enableZoomLinkGenerator()
  }

  ngOnDestroy(){
   this.subscriptionHandle.complete();
   this.subscriptionHandle.next();
  }

  processMessage(message: string): string {
    if (!message) return '';
    
    // Handle linebreaks and links in one go
    let processed = message.replace(/\n/g, '<br>');
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    processed = processed.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
    
    return processed;
  }

  resetSubscription(){
    this.studioPairingSubscription?.unsubscribe()
    this.liveassignmentSubscription?.unsubscribe()
    this.tokenSubscription?.unsubscribe()
    this.studioInvitationSubscription?.unsubscribe()
    this.studioGroupingInvitationSubscription?.unsubscribe()
    this.tripleATCSubscription?.unsubscribe()
    this.outsideLiveAssignmentSubscription?.unsubscribe()
    this.studioconversationSubscription?.unsubscribe()

    this.studioPairingSubscription = null
    this.liveassignmentSubscription = null
    this.tokenSubscription = null
    // this.studioInvitationSubscription = null
    this.studioGroupingInvitationSubscription = null
    this.tripleATCSubscription = null
    this.outsideLiveAssignmentSubscription = null
    this.studioconversationSubscription = null
  }

  compareFn(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
  }


  async loadQueueStudioCounts(){
    // Cleanup any previous subscriptions
    this.queueStudioCountSubscriptions.forEach(s => s?.unsubscribe())
    this.queueStudioCountSubscriptions = []
    this.queueStudioCounts = {}
    this.queuesWithStudios = []

    const refs = this.ongoingQueueList.map(q => doc(this.firestore, 'queue generation', q['docid']))
    const chunks: DocumentReference[][] = []
    for (let i = 0; i < refs.length; i += 30) chunks.push(refs.slice(i, i + 30))
    if (chunks.length === 0) return

    const chunkResults: { [qid: string]: number }[] = chunks.map(() => ({}))
    let firstEmitCount = 0
    const resolveFirst: { resolve?: () => void } = {}
    const firstEmitPromise = new Promise<void>(res => (resolveFirst.resolve = res))

    chunks.forEach((chunk, idx) => {
      const sub = collectionData(query(
        collection(this.firestore, 'queue studio pairing'),
        where('studioin', '==', true),
        where('participants', 'array-contains', this.profileid),
        where('queueref', 'in', chunk)
      )).pipe(takeUntil(this.subscriptionHandle)).subscribe((studios: any[]) => {
        const local: { [qid: string]: number } = {}
        studios.forEach(s => {
          if (s['delete']) return
          const qid = s['queueref']?.id
          if (!qid) return
          local[qid] = (local[qid] || 0) + 1
        })
        const isFirst = Object.keys(chunkResults[idx]).length === 0 && !(chunkResults[idx] as any).__seeded
        ;(chunkResults[idx] as any).__seeded = true
        chunkResults[idx] = local
        this.recomputeQueueStudioCounts(chunkResults)
        if (isFirst) {
          firstEmitCount += 1
          if (firstEmitCount === chunks.length) resolveFirst.resolve?.()
        }
      })
      this.queueStudioCountSubscriptions.push(sub)
    })

    await firstEmitPromise
  }

  private recomputeQueueStudioCounts(chunkResults: { [qid: string]: number }[]){
    const merged: { [qid: string]: number } = {}
    chunkResults.forEach(chunk => {
      Object.keys(chunk).forEach(qid => {
        if (qid === '__seeded') return
        merged[qid] = (merged[qid] || 0) + chunk[qid]
      })
    })
    this.queueStudioCounts = merged
    this.queuesWithStudios = this.ongoingQueueList.filter(q => (merged[q['docid']] || 0) > 0)
    this.noStudioInAnyQueue = this.queuesWithStudios.length === 0
    // If currently selected queue lost all studios, pick another (but don't interrupt a live session)
    const currentId = this.ongoingQueue?.['docid']
    const currentStillHas = currentId && (merged[currentId] || 0) > 0
    if (!currentStillHas && this.liveStudio.length === 0 && this.queuesWithStudios.length > 0) {
      const next = this.queuesWithStudios[0]
      if (next && next['docid'] !== currentId) {
        this.ongoingQueue = next
        this.selectedQueue = next
        this.onQueueSelect()
      }
    }
  }

  selectQueueCard(queue: any){
    if (queue['docid'] === this.ongoingQueue['docid']) return
    this.checkoutQueue()
    this.ongoingQueue = queue
    this.selectedQueue = queue
    this.onQueueSelect()
  }

  async onQueueSelect(){
    this.resetSubscription()
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Switching Queue..."},
      disableClose: true
    })
    this.getOutsideStudio()
    // this.getStudio()
    await getDocs(query(collection(this.firestore,"queue variation"), where("queueref",'==', doc(this.firestore,"queue generation",this.ongoingQueue["docid"])))).then(variation =>{
      variation.docs.forEach(doc =>{
        var variationData = doc.data()
        this.mapVariationName[doc.id] = variationData["variationname"]
        this.queueVariation[doc.id] = variationData["stages"]
      })
    })
    await this.getStudio()
    loading.close()
  }

  checkoutQueue(){
    console.log("Check out", this.selectedQueue)
    if(this.selectedQueue != null && this.selectedQueue["docid"] != this.ongoingQueue["docid"]){
      var checkoutID = this.selectedQueue["docid"]
      this.selectedQueue = this.ongoingQueue
      getDocs(query(collection(this.firestore,"queue studio pairing"), where("participants", "array-contains", this.profileid) , where("queueref", "==", doc(this.firestore,"queue generation",checkoutID)))).then(pairing=>{
        pairing.forEach(doc=>{
          updateDoc(doc.ref , {
            checkin: false
          })
         
        })
      })
    }
  }

  enableZoomLinkGenerator(){
    this.zoomlinkGenerator = false
    setTimeout(() => this.zoomlinkGenerator = true, 10000)
  }

  getOutsideStudio(){
    collectionData(query(collection(this.firestore,"live assignment"), where("queueid", "==", this.ongoingQueue["docid"]),where("status", "==", "live"),where("bonusactivityparticipant", "array-contains", this.profileid)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(assignment=>{
      this.outsideLiveAssignment = assignment
    })
  }

  async visitOtherStudio(liveassignment){
    console.log(liveassignment)
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Joining Studio..."},
      disableClose: true
    })

    const studioid = liveassignment["studioid"]
    var openViduEnabled = false
    await getDoc(doc(this.firestore, "queue studio pairing", studioid)).then(studioDoc =>{
      if(studioDoc.exists()){
        openViduEnabled = studioDoc.data()["openvidu"]
      }
    })
    loading.close()

    var joinurl = null
    if(openViduEnabled){
      joinurl = this.router.createUrlTree(['/joinroom', liveassignment['docid']])
    }
    else{
      var joinurl = (liveassignment["zoomdata"] ?? {})["join_url"]
    }

    if(joinurl != null && joinurl != undefined){
      if(confirm("Join Now!")){
        window.open(joinurl, '_blank')
      }
    }
    else{
      alert("Unable to join in the moment.")
    }
  }

  async getStudio(){
    this.selectedStudio = {}
    this.liveAssignment = null
    this.isLoadingStudios = true;
    // .where("participants", "array-contains", this.profileid)
    this.studioPairingSubscription = collectionData(query(collection(this.firestore,"queue studio pairing"), where("studioin", "==", true),where("queueref", "==", doc(this.firestore,"queue generation",this.ongoingQueue["docid"])))).pipe(takeUntil(this.subscriptionHandle)).subscribe(studio=>{
      this.mapStudio = studio.reduce(function(r, a){
        r[a["docid"]] = r[a["docid"]] || {}
        r[a["docid"]] = a
        return r
      }, {})
      this.availableStudioList = studio.filter(e => e["checkin"] && [null, undefined, false].includes(e['delete']))
      this.allStudioList = studio
      this.studioList = studio.filter(e => e["participants"].includes(this.profileid) && [null, undefined, false].includes(e['delete']))
      console.log(this.studioList, 'this.studioList');
      
      this.liveStudio = this.studioList.filter(e => e["status"] == "live")
      console.log("Live Studio", this.liveStudio)
      this.isLoadingStudios = false;
      if(this.studioList.length == 0 && !this.isLoadingStudios){
        this.selectedStudio = {}
        this.liveAssignment = null
        this.stageTokenList = []
      }
      else{
        this.selectedStudio = this.studioList.find(e => e["docid"] == this.selectedStudio["docid"]) ?? {}
        if(Object.values(this.selectedStudio).length == 0){
          this.liveAssignment = null
          this.stageTokenList = []
        }
        // Check if Studio Grouping Invitation is Sent
        var involvedStudio = this.studioList.map(e => e["docid"])
        // if(this.studioGroupingInvitationSubscription == null){
          collectionData(query(collection(this.firestore,"studioinvitation"), where("type", "==", "stagegrouping"),where("status", "==", "pending"),where("invitedstudio", "array-contains-any", involvedStudio)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(studioInvitation=>{
            for (let i = 0; i < studioInvitation.length; i++) {
              const invitation = studioInvitation[i];
              var matchedstudio = invitation["invitedstudio"].find(studio => involvedStudio.includes(studio))
              if(matchedstudio != null && matchedstudio != undefined && !invitation["acceptedstudio"].includes(matchedstudio)){
                // TODO Open Invitation Dialog
                console.log(matchedstudio, invitation["docid"])
                this.dialog.open(AcceptOtherStudioComponent, {
                  data: {
                    mapprofile: this.mapProfile,
                    invitation: invitation
                  }
                }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result => {
                  if (result == "success") {
                    updateDoc(doc(this.firestore, "studioinvitation", invitation["docid"]), {
                      acceptedstudio: arrayUnion(matchedstudio)
                    });
                  } else {
                    updateDoc(doc(this.firestore, "studioinvitation", invitation["docid"]), {
                      deniedstudio: arrayUnion(matchedstudio)
                    });
                  }
                });
                break;
              }
            }
          })
        // }
        
        // Check if Live Assignment is On
        var studioID = this.studioList.map(e => e["docid"])
        if(this.liveassignmentSubscription == null){
          collectionData(query(collection(this.firestore,"live assignment"), where("queueid", "==", this.ongoingQueue["docid"]),where("status", "==", "live"),where("studioid", "in", studioID)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(assignment=>{
            var activeStudio = []
            assignment.forEach(e =>{
              activeStudio.push(e["studioid"])
              this.mapStudioLiveAssignment[e["studioid"]] = e
            })
            studioID.forEach(e =>{
              if(!activeStudio.includes(e)){
                this.mapStudioLiveAssignment[e] = null
              }
            })
            if(this.mapStudioLiveAssignment[this.selectedStudio["docid"]] != null && this.mapStudioLiveAssignment[this.selectedStudio["docid"]] != undefined){
              this.liveAssignment = {
                ...{token: (this.liveAssignment ?? {})["token"]},
                ...this.mapStudioLiveAssignment[this.selectedStudio["docid"]]
              }
            }
            else{
              this.liveAssignment = null
            }
          })
        }
        // Check Invitation Sent
        if(!!this.studioInvitationSubscription && !this.studioInvitationSubscription.closed){
          console.log("studioInvitationSubscription","subscribed");
          this.studioInvitationSubscription.unsubscribe()
        }
        if(!this.studioInvitationSubscription){
          console.log(this.studioInvitationSubscription, 'studioInvitationSubscription');
          
          collectionData(query(collection(this.firestore,"studioinvitation"), where("specialistpairing", 'array-contains', this.profileid),where("queueref", '==', doc(this.firestore,'queue generation',this.ongoingQueue["docid"])),where("studioid", "in", studioID),where("expirydate", ">=", new Date())), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async invitationSnap => {
          // this.studioInvitationSubscription = this.firestore.collection("studioinvitation", ref => ref.where("specialistpairing", 'array-contains', this.profileid).where("queueref", '==', this.firestore.collection("queue generation").doc(this.ongoingQueue["docid"]).ref).where("studioid", "in", studioID).where("expirydate", ">=", new Date())).valueChanges().subscribe(async invitationSnap => {
            console.log(invitationSnap)
            // Scenario: Invitation Approved by Participant (Invitation is saved from previous snapshot)
            if(this.invitationCountdown != null){
              this.studioInvitation = invitationSnap.find(e => e["docid"] == (this.studioInvitation ?? {})["docid"])
              console.log("Countdown is on....", this.studioInvitation)
              if(this.studioInvitation == undefined){
                this.invitationCountdown?.close()
                this.invitationCountdown = null
                this.studioInvitation = null
                alert("The invitation expired.")
              }
              else if(this.studioInvitation["clientresponse"] == "approved" || this.studioInvitation["clientresponse"] == "denied"){
                // Force close the dialog
                if(this.invitationCountdown != null){
                  this.invitationCountdown.close()
                  this.invitationCountdown = null
                }
                
                if(this.studioInvitation["clientresponse"] == "approved"){
                  const approvedInvitation = Object.assign({}, this.studioInvitation);
                  if(this.studioInvitation['createdby'] && this.studioInvitation['createdby'] === this.profileid){
                    this.assignStudio(approvedInvitation); 
                  }
                  this.studioInvitation = null;
                }
                else{
                  this.studioInvitation = null
                  alert("Participant denied to join the session.")
                }
              }
            }
            else{
              if(invitationSnap.length != 0){
                if(this.selectedStudio["docid"] == null || this.selectedStudio["docid"] == undefined){
                  // Scenario: Checking if any sent invitation is yet to approved by participant (Auto select studio from the invitation if not any studio is opened by B!G Participant)
                  this.studioInvitation = invitationSnap.find(e => e["clientresponse"] == null) ?? null
                  console.log("Selected Invitation", this.studioInvitation)
                  if(this.studioInvitation != null && this.studioInvitation != undefined){
                    this.selectedStudio = this.studioList.find(e => e["docid"] == this.studioInvitation["studioid"]) ?? {}
                    this.onStudioSelect(this.selectedStudio)
                  }
                }
                else{
                  // Scenario: Checking if any sent invitation is yet to approved by participant (Studio is already Opened by B!G Participant)
                  this.studioInvitation = invitationSnap.find(e => e["studioid"] == this.selectedStudio["docid"] && e["clientresponse"] == null) ?? null
                  console.log("Selected Studio Invitation", this.studioInvitation)
                }
                if(this.studioInvitation != null && this.studioInvitation != undefined){
                  console.log('checking......');
                  
                  // Open Invitation Countdown
                  if(this.invitationCountdown == null){
                    this.invitationCountdown = this.dialog.open(QueueInvitationApprovalComponent,{
                      disableClose:true,
                      data: this.studioInvitation,
                      maxHeight: "90vh",
                      maxWidth: '95vw',
                    })
                  }
                  // Denied by B!G Participant
                  this.invitationCountdown?.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
                    console.log(result)
                    if(result == "invitation cancelled"){
                      deleteDoc(doc(this.firestore, 'studioinvitation', this.studioInvitation["docid"])).catch(err=>{
                        console.log(err)
                      }).catch(err =>{
                        console.log(err)
                      })
                    }
                    this.studioInvitation = null
                    this.invitationCountdown = null
                  })
                }
              }
              else{
                this.studioInvitation = null
              }
            }
          })
        }
      }
    })
  }

  async onStudioSelect(studio){
    console.log("****** studio select ******");
    
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Setting up Studio..."},
      disableClose: true
    })
    this.selectedParticipant = false
    this.selectedStudio = studio
    console.log(this.selectedStudio)
    this.liveAssignment = this.mapStudioLiveAssignment[this.selectedStudio["docid"]] ?? null
    console.log(this.liveAssignment, 'this.liveAssignment');
    
    var studioStage = []
    // List Eligible Stages and Token
    var activityParse = Object.values(this.selectedStudio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
    console.log(activityParse)
    var stageList = this.ongoingQueue["stages"] ?? []
    for (let i = 0; i < stageList.length; i++) {
      const stage = stageList[i]
      console.log(stage, 'stage');
      
      const stageProperty = this.ongoingQueue["stageproperty"][stage];
      console.log(stageProperty, 'stageProperty');
      
      var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
      console.log(compulsoryActivity, 'compulsoryActivity');
      
      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination:any = compulsoryActivity[j];
        const combinationArray = Array.isArray(activitycombination) ? activitycombination : [activitycombination];
        var parse = combinationArray.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        // var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        console.log(parse);
        
        if(parse == activityParse){
          studioStage.push(stage)
        }
      }
    }
     // get studioconversation
    collectionData(query(collection(this.firestore,"studio conversation"), where('studioid', 'array-contains', this.selectedStudio['docid'])), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async snap => {
      this.studiochatList = snap;
      console.log(this.studiochatList);

      const messagePromises = this.studiochatList.map(async doc => {
        console.log(doc['docid'], doc);
        
        // Fetch messages for the current document
        const count = await getDocs(collection(this.firestore,"studio conversation", doc['docid'], 'messages'));
        const messages = count.docs.map(e => e.data());
        console.log(messages);

        // Calculate unread messages
        const unreadMessages = messages.filter(msg => msg['pending'].includes(this.currentuseruid)).length;
        this.pendingMessagesCount[doc['docid']] = unreadMessages;
        console.log(unreadMessages);
      });

      await Promise.all(messagePromises);
    });
    
    if(studioStage.length != 0){
      collectionData(query(collection(this.firestore,"queue_token"), where("queueref", "==", doc(this.firestore,'queue generation',this.ongoingQueue["docid"])),where("stagestatus", "==", "Approved"),where("tokenstatus", "==", "Active"),where("currentstage", "in", studioStage))).pipe(takeUntil(this.subscriptionHandle)).subscribe(async token=>{
        console.log(token)
        if(this.liveAssignment != null && token.length != 0){
          this.liveAssignment["token"] = token.find(e => e["liveassignmentid"] == this.liveAssignment["docid"])
          console.log(this.liveAssignment['docid']);
          console.log(this.liveAssignment['token']);
          
          
          // Transferred Queue Detail
          if(![null,undefined].includes(this.liveAssignment["token"] ? this.liveAssignment["token"]["transferredfrom"] : null)){
            await getDoc(doc(this.firestore,this.liveAssignment["token"]["transferredfrom"].path)).then(previousQueue=>{
              if(previousQueue.exists()){
                this.transferredQueue = previousQueue.data()
                this.mapQueue[previousQueue.id] = previousQueue.data()["queuename"]
              }
              else{
                this.transferredQueue = null
              }
            })
            console.log("Transferred Queue", this.transferredQueue)
          }
          else{
            this.transferredQueue = null
          }

          // Get Studio Widgets
          var studioWidget = this.ongoingQueue["stageproperty"][this.liveAssignment["stagename"]]?.studiowidgets ?? []
          // List Validated ATC
          if(studioWidget.includes("prescribedvalidatedatc")){
            this.previewATC("alpha")
          }
          else{
            this.alphaATCList = []
          }

          // List Unvalidated ATC
          if(studioWidget.includes("prescribedunvalidatedatc")){
            this.previewATC("validation")
          }
          else{
            this.unvalidatedATCList = []
          }

          // List Procedure to Mark
          if(studioWidget.includes("assignedatc")){
            this.getAssignedATC()
          }
          else{
            this.cwATClist = []
          }

          // List Triple ATC
          if(studioWidget.includes("viewtripleatc")){
            this.getTripleATC()
          }
          else{
            this.tripleATCList = []
          }

          // List Form
          var mappedForm = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']]?.participantform ?? []
          console.log(this.liveAssignment["participantid"], mappedForm)
          if(mappedForm.length != 0 && this.liveAssignment["token"]){
            // var involvedQueueRef = [this.firestore.collection("queue generation").doc(this.ongoingQueue["docid"]).ref]
            var involvedQueueRef = []
            involvedQueueRef.push(this.liveAssignment["token"]['queueref'])
            if(![null,undefined].includes(this.liveAssignment["token"]["transferredfrom"])){
              involvedQueueRef.push(this.liveAssignment["token"]["transferredfrom"])
              let currentRef:DocumentReference | null = this.liveAssignment["token"]['tokentransferredfrom'] ?? null
              while (currentRef != null) {
                const transferData = await this.getQueueRefFromTransferredFrom(currentRef);
                if(![null,undefined].includes(transferData['transferredfrom'])){
                  involvedQueueRef.push(transferData["transferredfrom"])
                  currentRef = transferData['tokentransferredfrom']
                }else{
                  currentRef = null;
                  break;
                }
              }
            }
            console.log("Involved Queue", involvedQueueRef.map(e => e.path))
            await getDocs(query(collection(this.firestore,"formsByClient"), where("queueref", "in", involvedQueueRef),where("profileid", "==", this.liveAssignment["participantid"]))).then(queueform =>{
              console.log("Related Form", queueform.docs.map(e =>e.data()["formid"]))
              this.participantForm = queueform.docs.map(e =>e.data()).filter(e => mappedForm.includes(e["formid"]))
              console.log(this.participantForm)
            }).catch(e =>{
              console.log("Unable to fetch Form", e)
            })
          }
          else{
            this.participantForm = []
          }

          // current AEL
          // List Triple ATC
          if(studioWidget.includes("validateael")){
            this.getCurrentAEL()
          }
          else{
            this.participantAEL = {}
          }

        }
        // var stageToken = token.filter(e => e["liveassignmentid"] == null && (e["preassigned"] == null || e["preassigned"] == undefined || e["preassigned"] == this.selectedStudio["docid"])).sort((a, b) => a["logdate"].toDate() - b["logdate"].toDate())
        var localTokenList = []
        studioStage.forEach(stage=>{
          localTokenList.push({
            stagename: stage,
            tokenlist: token.filter(e => e["status"] == "ready" && e["currentstage"] == stage && e["liveassignmentid"] == null && ([null,undefined].includes(this.selectedStudio['atcmodel']) ||  this.selectedStudio['atcmodel'].includes(this.mapProducts[e['productref'].id]))  && (e["preassigned"] == null || e["preassigned"] == undefined || (e["preassigned"][stage] ?? []).length == 0 || (e["preassigned"][stage] ?? []).includes(this.selectedStudio["docid"]))).sort((a, b) => a["queueposition"] - b["queueposition"]) // .sort((a, b) => b["logdate"].toDate() - a["logdate"].toDate())
          })
        })
        this.stageTokenList = localTokenList
        console.log(this.stageTokenList, 'stageTokenList');
        
        loading?.close()
        loading = null
      })
    }
    else{
      loading?.close()
      loading = null
      alert("No eligible stages found for this Studio!")
    }
  }

  async checkinStudio(value){
    const currentDate = new Date();
    const currentTime = currentDate.getTime(); 
    const scheduledTimes = (this.selectedStudio["checkinscheduletime"] ?? []).filter(timestamp => {
      const timestampTime = timestamp.toDate().getTime(); 
      console.log(timestampTime);
      
      return timestampTime > currentTime; 
    });
    console.log(scheduledTimes);
    const dayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dayEnd = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1);
    
    await getDocs(query(collection(this.firestore,"studio checkin log"),where('logparticipant', '==', this.profileid),where('logdate', '>=', dayStart),where('logdate', '<', dayEnd)))
    .then(snap => {
      this.checkinlog = snap.docs.length
      console.log(this.checkinlog);
    })
    
    console.log(this.selectedStudio["checkinscheduletime"] == undefined || 
    this.selectedStudio["checkinscheduletime"].length == 0 || scheduledTimes.length > 0 || this.checkinlog != 0);
    
    if(this.selectedStudio["checkinscheduletime"] == undefined || 
      this.selectedStudio["checkinscheduletime"].length == 0 || scheduledTimes.length > 0 || this.checkinlog != 0){
      this.selectedStudio["checkin"] = value
      updateDoc(doc(this.firestore, 'queue studio pairing',this.selectedStudio["docid"]),{
        checkin: this.selectedStudio["checkin"]
      })
     
      let id = doc(collection(this.firestore, 'studio checkin log')).id
      let activity =  value == true ? "checkin" : "checkout"
      let data = {
        logparticipant : this.profileid,
        queueref : this.selectedStudio['queueref'],
        logdate : new Date(),
        activity : activity,
        participants: this.selectedStudio["participants"],
        studio: this.selectedStudio["docid"]
      }
      setDoc(doc(this.firestore,"studio checkin log", id), data)
      }else{
        this.dialog.open(HoldAlertDialogComponent)
        this.onhold = true
        this.selectedStudio["checkin"] = false
        console.log("scheduled time have passed. Check-in restricted.");
        updateDoc(doc(this.firestore,"queue studio pairing", this.selectedStudio["docid"]), {
          checkin: this.selectedStudio["checkin"],
          onhold: this.onhold
        })
      }
    }

  // Studio Stage Grouping
  async sendStudioInvitation(token){
    this.additionalActivities = {}
    var mandatoryStage = this.ongoingQueue["stageproperty"][token["currentstage"]]["mandatorystagegrouping"] ?? []
    var optionalStage = this.ongoingQueue["stageproperty"][token["currentstage"]]["optionalstagegrouping"] ?? []
    console.log(mandatoryStage, optionalStage)
    var mandatoryStudio = []
    var optionalStudio = []
    if(mandatoryStage.length != 0 || optionalStage.length != 0){
      await getDocs(query(collection(this.firestore,"live assignment"),where("queueid", "==", this.ongoingQueue["docid"]),where("stagename", "in", [...mandatoryStage, ...optionalStage]),where("status", "==", "completed"))).then(previousStudio=>{
        var studioData = previousStudio.docs.map(e => e.data())
        console.log("Previous Studio", studioData)
        studioData.sort((a, b) => b["created"].toDate() - a["created"].toDate())
        studioData.forEach(studio=>{
          if(!studio["pairing"].includes(this.profileid)){
            if(mandatoryStage.includes(studio["stagename"]) && mandatoryStudio.filter(e => e["stagename"] == studio["stagename"]).length == 0){
              mandatoryStudio.push(studio)
            }
            if(optionalStage.includes(studio["stagename"]) && optionalStudio.filter(e => e["stagename"] == studio["stagename"]).length == 0){
              optionalStudio.push(studio)
            }
          }
        })
        console.log(mandatoryStudio, optionalStudio)
      })
    }

    // Send Invitation for Mandatory & Optional Stage
    if(mandatoryStudio.length != 0 || optionalStudio.length != 0){
      var invitationID = doc(collection(this.firestore,'studioinvitation')).id
      setDoc(doc(this.firestore, 'studioinvitation', invitationID), {
        docid: invitationID,
        createddate: new Date(),
        type: "stagegrouping",
        invitedstudio: [...mandatoryStudio.map(e => e["studioid"]), ...optionalStudio.map(e => e["studioid"])],
        acceptedstudio: [],
        deniedstudio: [],
        mandatorystudio: mandatoryStudio.map(e => e["studioid"]),
        optionalstudio: optionalStudio.map(e => e["studioid"]),
        studioid: this.selectedStudio["docid"],
        stage: token["currentstage"],
        queueref: token['queueref'],
        tokenref:  doc(this.firestore, 'queue_token', token["docid"]),
        participantname: this.mapProfile[token['profile_id']],
        status: "pending",
        createdby:this.profileid
      })
      this.dialog.open(InviteOtherStudioComponent, {
        data: {
          mapprofile: this.mapProfile,
          mapactivity: this.mapActivity,
          invitationid: invitationID,
          mapstudio: this.mapStudio
        },
        disableClose: true,
        maxHeight: "90vh",
        maxWidth: "90vw"
      }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
        if(result != "denied"){
          updateDoc(doc(this.firestore, 'studioinvitation', invitationID), {
            status: "success"
          })
         
          result.forEach(studioid=>{
            var studio
            var findMandatory = mandatoryStudio.find(e => e["studioid"] == studioid)
            if(findMandatory != null || findMandatory != undefined){
              studio = findMandatory
            }
            else{
              studio = optionalStudio.find(e => e["studioid"] == studioid)
            }
            var participantActivity = Object.keys(studio["participantsactivity"] ?? {})
            participantActivity.forEach(profile =>{
              var transferActivity = this.ongoingQueue["stageproperty"][token["currentstage"]]["transferactivity"] ?? {}
              var newActivity = transferActivity[studio["participantsactivity"][profile]] ?? studio["participantsactivity"][profile]
              this.additionalActivities[newActivity] = this.additionalActivities[newActivity] ?? []
              this.additionalActivities[newActivity].push(profile)
            })
          })
          console.log("activities", this.additionalActivities)
          this.inviteParticipant(token)
        }
        else{
          updateDoc(doc(this.firestore, 'studioinvitation', invitationID),{
            status: "cancelled"
          })
         
        }
      })
    }
    else{
      this.inviteParticipant(token)
    }
  }

  async inviteParticipant(token){
    await getDocs(query(collection(this.firestore,"studioinvitation"),where("tokenref", "==", doc(this.firestore,"queue_token",token["docid"])),where("expirydate", ">=", new Date()))).then(invitation=>{
      var pending = invitation.docs.filter(e => e.data()["clientresponse"] == null || e.data()["clientresponse"] == "approved")
      if(pending.length != 0){
        alert("The selected participant is about to respond invitation from other studio. Try picking other participant or again later.")
      }
      else{
        var invitationData = {
          docid: doc(collection(this.firestore, 'studioinvitation')).id,
          specialistpairing: this.selectedStudio['participants'],
          profileid: token["profile_id"],
          tokenref: doc(this.firestore,'queue_token',token["docid"]),
          participantname: this.mapProfile[token['profile_id']],
          stage: token["currentstage"],
          expirydate: new Date(new Date().getTime() + 2*60000),
          queueref: token['queueref'],
          createddate: new Date(),
          clientresponse: null,
          studioid: this.selectedStudio["docid"],
          createdby:this.profileid
        }
        setDoc(doc(this.firestore,"studioinvitation",invitationData['docid']),invitationData,{merge:true}).catch((err)=>{
          alert(err)
        })
       
      }
    })
  }

  // async inviteParticipant(token: any) {
  //   try {
  //     console.log("inviteParticipant started");
  //     const db = firebase.default.firestore();
  //     // Start a transaction
  //     return await db.runTransaction(async (transaction) => {
  //       console.log("in transaction");
  //       // Create references
  //       const tokenRef = db.collection("queue_token").doc(token["docid"]);
  //       // Create the query
  //       const querySnapshot = await db.collection("studioinvitation")
  //         .where("tokenref", "==", tokenRef)
  //         .where("expirydate", ">=", firebase.default.firestore.Timestamp.fromDate(new Date()))
  //         .get();
  //       if (!querySnapshot.empty) {
  //         throw new Error("The selected participant is about to respond invitation from other studio. Try picking other participant or again later.");
  //       }
  //       // Deterministic ID to prevent duplicate entries
  //       const docId = `${tokenRef.id}_${new Date().toISOString().slice(0,16)}`;
  //       console.log("docId",docId);
  //       const newInvitationRef = db.collection("studioinvitation").doc(docId);
  //       // Prepare invitation data
  //       const invitationData = {
  //         docid: docId,
  //         specialistpairing: this.selectedStudio["participants"],
  //         profileid: token["profile_id"],
  //         tokenref: tokenRef,
  //         participantname: this.mapProfile[token["profile_id"]],
  //         stage: token["currentstage"],
  //         expirydate: firebase.default.firestore.Timestamp.fromDate(
  //           new Date(new Date().getTime() + 2 * 60000)
  //         ),
  //         queueref: token["queueref"],
  //         createddate: firebase.default.firestore.Timestamp.fromDate(new Date()),
  //         clientresponse: null,
  //         studioid: this.selectedStudio["docid"],
  //       };
  //       // Set the new invitation data in the transaction
  //       transaction.set(newInvitationRef, invitationData);
  //       return invitationData;
  //     });
  //   } catch (error) {
  //     console.error("Transaction failed:", error);
  //     alert(error.message || "Transaction failed");
  //     throw error;
  //   }
  // } 

  assignStudio(invitation){
    console.log(invitation)
    var token = this.stageTokenList.filter(e => e["stagename"] == invitation["stage"])[0]["tokenlist"].find(e => e["profile_id"] == invitation["profileid"])
    console.log(token)
    var assignStudio = this.dialog.open(AssignQueueStudioComponent, {
      data: {
        title: "Update Specialist and Activity in the Studio",
        studiolist: [this.selectedStudio],
        mapprofile: this.mapProfile,
        mapactivity: this.mapActivity,
        additionalactivities: this.additionalActivities
      },
      autoFocus: false,
      maxWidth: "90vw",
      maxHeight: "90vh"
    })
    assignStudio.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result=>{
      console.log(result)
      if(result != null && this.liveAssignment == null){
        var loading = this.dialog.open(LoadingProgressComponent,{
          data:{
            msg: "Moving Token " + token["tokennumber"] + "..."
          },
          disableClose: true
        })
        var atcmodel = null
        if(![null,undefined].includes(token['variationid'])){
          await getDoc(doc(this.firestore,"queue variation",token['variationid'])).then(async variationSnap => {
            if(variationSnap.exists()){
              if(![null,undefined].includes(variationSnap.data()['atcmodel'])){
                console.log("Atc model from queue variation",variationSnap.data()['atcmodel']);
                atcmodel = variationSnap.data()['atcmodel']
              }
            }
          })
        }else {
          getDoc(doc(this.firestore,token['productref'].path)).then(productSnap => {
            atcmodel = productSnap.data()['atcmodel']
          })
        }
        // Update Studio
        await updateDoc(doc(this.firestore,"queue studio pairing",result["docid"]),{
          status: "live",
        })
        
        var liveassignmentid = doc(collection(this.firestore,'live assignment')).id
        // Update Token
        var data = {
          previousstage: invitation["stage"],
          currentstage: invitation["stage"],
          logdate: serverTimestamp(),
          stagestatus: "Approved",
          quicknotes: null,
          cwmentoring: null,
          cwshadowing: null,
          cwperson: null,
          diagnosticmentoring: null,
          diagnosticshadowing: null,
          diagnosticperson: null,
          people_involved: Array.from(new Set(result["participants"].concat(...Object.keys(result["bonusactivity"] ?? {}) as string[]))),
          arenaid: null,
          liveassignmentid: liveassignmentid,
          studioid: result["docid"],
          status: "instudio"
        }
        var log = {...token, ...data}
        await this.updateQueueStage(log)

        // Create Live Assignment
        var liveassignmentData = {
          docid: liveassignmentid,
          pairing: result["participants"],
          participantid: token['profile_id'],
          stagename: invitation["stage"],
          atcmodel: atcmodel,
          // stagetype: diagnosticStage.includes(dropStage) ? "diagnostics" : consultationStage.includes(dropStage) ? "consultation" : ahStage.includes(dropStage) ? "ah" : reviewStage.includes(dropStage) ? "validation" : "changework",
          status: 'live',
          queueid: this.ongoingQueue["docid"],
          created: serverTimestamp(),
          // shadowperson: result["shadow"] ?? null
          studioid: result["docid"],
          participantsactivity: result["participantsactivity"], // From Studio Pairing
          bonusactivity: result["bonusactivity"] ?? null, // Addition Activities
          bonusactivityparticipant: result["bonusactivity"] != null && result["bonusactivity"] != undefined ? Object.keys(result["bonusactivity"]) : null
        }
        liveassignmentData["zoomlinkrequired"] = this.ongoingQueue["zoomlinkrequired"] ?? true
        await setDoc(doc(this.firestore,('live assignment/' + liveassignmentid)),liveassignmentData, {merge: true})
        
        loading.close()
      }
    })
  }

  async updateQueueStage(log){
    console.log(log)
    await updateDoc(doc(this.firestore,"queue_token",log["docid"]),log).catch(err =>{
      console.log(err)
    })
   
    var logdocid = doc(collection(this.firestore, 'queue stage log')).id
    log["logdocid"] = logdocid
    log["movedby"] = this.profileid
    log["movedthrough"] = 'studio'
    await setDoc(doc(this.firestore, 'queue stage log', logdocid),log).catch(err =>{
      console.log(err)
    })
  }
  async moveStage(nextstage:string,markascompleted:any){
    console.log("********* moveStage *********");
    
    console.log(nextstage, 'nextstage',markascompleted,"markascompleted");
    console.log(this.liveAssignment);

    if(markascompleted){
      if(Object.keys(this.participantAEL).length != 0){
        if(this.participantAEL["aelStatus"] == "validated"){
          console.log("Given AEL validated")
        } else {
          alert("Participant AEL is not validated. Mark validate to compelete this session.")
          return;
        }
      }
    }
    
    var preloading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Validating next stage..."},
      disableClose: true
    })

    var preassignActivity = []
    var nextStageProperty = (this.ongoingQueue["stageproperty"][nextstage] ?? {})
    console.log(nextStageProperty);
    
    var nextStageMandatoryStage = nextStageProperty["mandatorystagegrouping"] ?? []
    console.log(nextStageMandatoryStage);
    
    var nextActivtityProperty = nextStageProperty["transferactivityproperty"] ?? []
    console.log(nextActivtityProperty);
    console.log(this.liveAssignment["stagename"]);
    
    if(nextStageMandatoryStage.includes(this.liveAssignment["stagename"])){
      Object.keys(this.selectedStudio["participantsactivity"] ?? {}).forEach(profileid=>{
        var activity = this.selectedStudio["participantsactivity"][profileid]
        var newActivity = nextActivtityProperty.find(e => e["activity"] == activity && e["sameperson"] == true)
        if(newActivity != undefined && newActivity != null){
          preassignActivity.push({
            activity: activity,
            newactivity: newActivity["newactivity"],
            profileid: profileid
          })
        }
      })
    }
    console.log(preassignActivity)

    var eligiblePreStudio = []  
    var preassignProfile = preassignActivity.map(e => e["profileid"])
    if(preassignProfile.length != 0){
      await getDocs(query(collection(this.firestore,"queue studio pairing"), where("queueref", "==", doc(this.firestore,"queue generation",this.ongoingQueue["docid"])),where("participants", "array-contains-any", preassignProfile),where("studioin", "==", true))).then(otherStudio=>{
        for (let i = 0; i < otherStudio.docs.length; i++) {
          const studiodoc = otherStudio.docs[i];
          var studiodata = studiodoc.data()
          var participantsActivity = studiodata["participantsactivity"] ?? {}
          console.log(participantsActivity)
          var checkRoles = preassignActivity.every(e => {
            var activity = e["newactivity"]
            var profile = e["profileid"]
            console.log(activity, profile)
            return participantsActivity[profile] == activity
          })
          if(checkRoles){
            eligiblePreStudio.push(studiodata)
          }
        }
      })
    }
    console.log("Eligible Studio", eligiblePreStudio)

    var movable = true

    var token = this.liveAssignment["token"]
    console.log(token);
    
    token["preassigned"] = token["preassigned"] ?? {}
    token["preassigned"][nextstage] = token["preassigned"][nextstage] ?? []
    
    if(eligiblePreStudio.length == 1){
      if(!token["preassigned"][nextstage].includes(token["preassigned"][nextstage])) token["preassigned"][nextstage].push(eligiblePreStudio[0]["docid"])
      await updateDoc(doc(this.firestore,"queue_token" ,token["docid"]),{
        preassigned: token["preassigned"]
      }).catch(err =>{
        console.log(err)
      })
    }
    else if(eligiblePreStudio.length != 0){
      var studio = this.dialog.open(PreassignStudioComponent, {
        data: {
          stagename: nextstage,
          studiolist: eligiblePreStudio,
          mapprofile: this.mapProfile,
          mapactivity: this.mapActivity
        },
        disableClose: true,
        maxHeight: "90vh",
        maxWidth: "90vw"
      })
      await studio.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result=>{
        if(result != null){
          if(!token["preassigned"][nextstage].includes(result)) token["preassigned"][nextstage].push(result)
          console.log(token)
          await updateDoc(doc(this.firestore,"queue_token",token["docid"]),{
            preassigned: token["preassigned"]
          }).catch(err =>{
            console.log(err)
          })
        }
        else{
          movable = false
        }
      })
    }
    preloading.close()

    if(movable){
      if(this.liveAssignment["stagename"] == nextstage || (this.liveAssignment["stagename"] != nextstage && markascompleted != true)){
        var inCompleteDialog = this.dialog.open(StageIncompleteConfirmationComponent, {
          data: {
            currentstage: this.liveAssignment["stagename"],
            participantname: this.mapProfile[this.liveAssignment["token"]?.profile_id]
          },
          maxWidth: "70vw",
          maxHeight: "90vh",
          disableClose: true
        })
        await firstValueFrom(inCompleteDialog.afterClosed()).then(async value =>{
          console.log(value)
          if(value){
            var loading = this.dialog.open(LoadingProgressComponent, {
              data: {msg: "Closing Studio"},
              disableClose: true
            })
            var stageList = this.liveAssignment["token"]["variationid"] != null && this.liveAssignment["token"]["variationid"] != undefined ? this.queueVariation[this.liveAssignment["token"]["variationid"]] : this.ongoingQueue["stages"]
            var dropIndex = stageList.findIndex(e => e == nextstage)
            var data = {
              previousstage: this.liveAssignment["stagename"],
              currentstage: nextstage,
              logdate: serverTimestamp(),
              stagestatus: "Approved",
              quicknotes: null,
              cwmentoring: null,
              cwshadowing: null,
              cwperson: null,
              diagnosticmentoring: null,
              diagnosticshadowing: null,
              diagnosticperson: null,
              people_involved: [],
              arenaid: null,
              liveassignmentid: null,
              studioid: null,
              status: ((this.ongoingQueue["stageproperty"][nextstage] ?? {})["compulsoryactivity"] ?? []).length == 0 ? null : "queued"
              // dropType == "Queued" ? "queued" : dropType == "Waiting" ? "ready" : null
            }
            if(value["preassign"]){
              data[`preassigned.${this.liveAssignment["stagename"]}`] = arrayUnion(this.liveAssignment["studioid"])
            }
            if((value["reason"] ?? "").trim().length != 0){
              data["notes"] = value["reason"]
              data["notesList"] = arrayUnion({
                author: this.profileid,
                stage: this.liveAssignment["stagename"],
                text: value["reason"],
                updatedon: new Date()
              })
            }
            var log = {...this.liveAssignment["token"], ...data}
            await this.updateQueueStage(log)
            console.log("Drop Index", dropIndex, "Length", stageList.length)
            if(dropIndex+1 == stageList.length){
              await this.guard.updateDeliveryStatus(
                doc(this.firestore, "queue_token", log["docid"]).path, 
                "completed", 
                {
                  eventRequestRef: query(
                    collection(this.firestore, 'event participation request'),
                    where('profileid', '==', token['profile_id']),
                    where('eventref', '==', log['queueref']),
                    where('status', '==', 'approved')
                  )
                }
              )
            }
            var studioid = this.liveAssignment["studioid"]
            await updateDoc(doc(this.firestore,'live assignment/' + this.liveAssignment["docid"]),{
              isactivitydone : false,
              status: "completed",
              updated: serverTimestamp()
            })
            await updateDoc(doc(this.firestore,"queue studio pairing",studioid),{
              status: null,
            })
            loading.close()
          }
        })
      }else{
        var reviewSpecialist = (await this.inviteMore(true))
        if(!reviewSpecialist) return
        var confirm = this.dialog.open(HoldAlertDialogComponent, {
          data : {}
        })
  
        const result =  await confirm.afterClosed().toPromise()
        if (result == null) {
          return;          
        }
  
        this.ngZone.run(async () => {
          if(result != null){
  
            var loading = this.dialog.open(LoadingProgressComponent, {
              data: {msg: "Closing Studio"},
              disableClose: true
            })
            var stageList = this.liveAssignment["token"]["variationid"] != null && this.liveAssignment["token"]["variationid"] != undefined ? this.queueVariation[this.liveAssignment["token"]["variationid"]] : this.ongoingQueue["stages"]
            var dropIndex = stageList.findIndex(e => e == nextstage)
            var data = {
              previousstage: this.liveAssignment["stagename"],
              currentstage: nextstage,
              logdate: serverTimestamp(),
              stagestatus: "Approved",
              quicknotes: null,
              cwmentoring: null,
              cwshadowing: null,
              cwperson: null,
              diagnosticmentoring: null,
              diagnosticshadowing: null,
              diagnosticperson: null,
              people_involved: [],
              arenaid: null,
              liveassignmentid: null,
              studioid: null,
              status: ((this.ongoingQueue["stageproperty"][nextstage] ?? {})["compulsoryactivity"] ?? []).length == 0 ? null : "queued"
              // dropType == "Queued" ? "queued" : dropType == "Waiting" ? "ready" : null
            }
            var log = {...this.liveAssignment["token"], ...data}
            await this.updateQueueStage(log)
            console.log("Drop Index", dropIndex, "Length", stageList.length)
            if(dropIndex+1 == stageList.length){
              // await this.guard.updateDeliveryStatus(this.firestore.doc("/queue_token/" + log["docid"]).ref.path, "completed")
              await this.guard.updateDeliveryStatus(doc(this.firestore,"/queue_token/" + log["docid"]).path, "completed", {
                eventRequestRef: query(collection(this.firestore,'event participation request'), where('profileid', '==', token['profile_id']),where('eventref', '==', log['queueref']),where("status", "==", "approved"))
              })
            }
            await this.closeStudio()
            loading.close()
          }
        })
      }
     
    }
  }

  async closeStudio(){
    var studioid = this.liveAssignment["studioid"]
    // var confirm = this.dialog.open(HoldAlertDialogComponent, {
    //   data : {}
    // })
    // await confirm.afterClosed().toPromise().then(async result => {
    //   if(result != null){
    //     await this.firestore.doc('live assignment/' + this.liveAssignment["docid"]).update({
    //       isactivitydone : true,
    //       status: "completed",
    //       updated: firebase.default.firestore.FieldValue.serverTimestamp()
    //     })
    //   }
    // })
    await updateDoc(doc(this.firestore,'live assignment/' + this.liveAssignment["docid"]),{
      isactivitydone : true,
      status: "completed",
      updated: serverTimestamp()
    })
    await updateDoc(doc(this.firestore,"queue studio pairing",studioid),{
      status: null,
    })
    this.liveAssignment = null
  }

  // async moveStage(nextstage){
  //   var preloading = this.dialog.open(LoadingProgressComponent, {
  //     data: {msg: "Validating next stage..."},
  //     disableClose: true
  //   })
  //   var preassignActivity = []
  //   var nextStageProperty = (this.ongoingQueue["stageproperty"][nextstage] ?? {})
  //   var nextStageMandatoryStage = nextStageProperty["mandatorystagegrouping"] ?? []
  //   var nextActivtityProperty = nextStageProperty["transferactivityproperty"] ?? []
  //   if(nextStageMandatoryStage.includes(this.liveAssignment["stagename"])){
  //     Object.keys(this.selectedStudio["participantsactivity"] ?? {}).forEach(profileid=>{
  //       var activity = this.selectedStudio["participantsactivity"][profileid]
  //       var newActivity = nextActivtityProperty.find(e => e["activity"] == activity && e["sameperson"] == true)
  //       if(newActivity != undefined && newActivity != null){
  //         preassignActivity.push({
  //           activity: activity,
  //           newactivity: newActivity["newactivity"],
  //           profileid: profileid
  //         })
  //       }
  //     })
  //   }
  //   console.log(preassignActivity)
  //   var eligiblePreStudio = []
  //   var preassignProfile = preassignActivity.map(e => e["profileid"])
  //   if(preassignProfile.length != 0){
  //     await this.firestore.collection("queue studio pairing", ref=>ref.where("queueref", "==", this.firestore.collection("queue generation").doc(this.ongoingQueue["docid"]).ref).where("participants", "array-contains-any", preassignProfile).where("studioin", "==", true)).get().toPromise().then(otherStudio=>{
  //       for (let i = 0; i < otherStudio.docs.length; i++) {
  //         const studiodoc = otherStudio.docs[i];
  //         var studiodata = studiodoc.data()
  //         var participantsActivity = studiodata["participantsactivity"] ?? {}
  //         console.log(participantsActivity)
  //         var checkRoles = preassignActivity.every(e => {
  //           var activity = e["newactivity"]
  //           var profile = e["profileid"]
  //           console.log(activity, profile)
  //           return participantsActivity[profile] == activity
  //         })
  //         if(checkRoles){
  //           eligiblePreStudio.push(studiodata)
  //         }
  //       }
  //     })
  //   }
  //   console.log("Eligible Studio", eligiblePreStudio)
  //   var movable = true
  //   var token = this.liveAssignment["token"]
  //   token["preassigned"] = token["preassigned"] ?? {}
  //   token["preassigned"][nextstage] = token["preassigned"][nextstage] ?? []
  //   if(eligiblePreStudio.length == 1){
  //     if(!token["preassigned"][nextstage].includes(token["preassigned"][nextstage])) token["preassigned"][nextstage].push(eligiblePreStudio[0]["docid"])
  //     await this.firestore.collection("queue_token").doc(token["docid"]).update({
  //       preassigned: token["preassigned"]
  //     }).catch(err =>{
  //       console.log(err)
  //     })
  //   }
  //   else if(eligiblePreStudio.length != 0){
  //     var studio = this.dialog.open(PreassignStudioComponent, {
  //       data: {
  //         stagename: nextstage,
  //         studiolist: eligiblePreStudio,
  //         mapprofile: this.mapProfile,
  //         mapactivity: this.mapActivity
  //       },
  //       disableClose: true,
  //       maxHeight: "90vh",
  //       maxWidth: "90vw"
  //     })
  //     await studio.afterClosed().toPromise().then(async result=>{
  //       if(result != null){
  //         if(!token["preassigned"][nextstage].includes(result)) token["preassigned"][nextstage].push(result)
  //         console.log(token)
  //         await this.firestore.collection("queue_token").doc(token["docid"]).update({
  //           preassigned: token["preassigned"]
  //         }).catch(err =>{
  //           console.log(err)
  //         })
  //       }
  //       else{
  //         movable = false
  //       }
  //     })
  //   }
  //   preloading.close()
  //   if(movable){
  //     var loading = this.dialog.open(LoadingProgressComponent, {
  //       data: {msg: "Closing Studio"},
  //       disableClose: true
  //     })
  //     var stageList = this.liveAssignment["token"]["variationid"] != null && this.liveAssignment["token"]["variationid"] != undefined ? this.queueVariation[this.liveAssignment["token"]["variationid"]] : this.ongoingQueue["stages"]
  //     var dropIndex = stageList.findIndex(e => e == nextstage)
  //     var data = {
  //       previousstage: this.liveAssignment["stagename"],
  //       currentstage: nextstage,
  //       logdate: firebase.default.firestore.FieldValue.serverTimestamp(),
  //       stagestatus: "Approved",
  //       quicknotes: null,
  //       cwmentoring: null,
  //       cwshadowing: null,
  //       cwperson: null,
  //       diagnosticmentoring: null,
  //       diagnosticshadowing: null,
  //       diagnosticperson: null,
  //       people_involved: [],
  //       arenaid: null,
  //       liveassignmentid: null,
  //       studioid: null,
  //       status: ((this.ongoingQueue["stageproperty"][nextstage] ?? {})["compulsoryactivity"] ?? []).length == 0 ? null : "queued"
  //       // dropType == "Queued" ? "queued" : dropType == "Waiting" ? "ready" : null
  //     }
  //     var log = {...this.liveAssignment["token"], ...data}
  //     await this.updateQueueStage(log)
  //     console.log("Drop Index", dropIndex, "Length", stageList.length)
  //     if(dropIndex+1 == stageList.length){
  //       await this.guard.updateDeliveryStatus(this.firestore.doc("/queue_token/" + log["docid"]).ref.path, "completed")
  //     }
  //     await this.closeStudio()
  //     loading.close()
  //   }
  // }
  // async closeStudio(){
  //   var studioid = this.liveAssignment["studioid"]
  //   await this.firestore.doc('live assignment/' + this.liveAssignment["docid"]).update({
  //     status: "completed",
  //     updated: firebase.default.firestore.FieldValue.serverTimestamp()
  //   })
  //   await this.firestore.collection("queue studio pairing").doc(studioid).update({
  //     status: null,
  //   })
  //   this.liveAssignment = null
  // }

  async inviteMore(reviewSpecialist): Promise<boolean>{
    var invited:boolean = false
    var additionalActivities = {};
    Object.keys(this.liveAssignment["bonusactivity"] ?? {}).forEach(profileid =>{
      additionalActivities[this.liveAssignment["bonusactivity"][profileid]] = additionalActivities[this.liveAssignment["bonusactivity"][profileid]] ?? []
      additionalActivities[this.liveAssignment["bonusactivity"][profileid]].push(profileid)
    }) 
    console.log(additionalActivities)   
    var inviteParticipant = this.dialog.open(AssignQueueStudioComponent, {
      data: {
        title: reviewSpecialist ? "Assign Other Specialist if attended in this Studio" : "Update Additional Specialist and Activity in the Studio",
        studiolist: reviewSpecialist ? [this.selectedStudio] : null,
        mapprofile: this.mapProfile,
        mapactivity: this.mapActivity,
        additionalactivities: reviewSpecialist ? additionalActivities : null
      },
      autoFocus: false,
      maxWidth: "90vw",
      maxHeight: "90vh"
    })
    
    try {
      const result = await inviteParticipant.afterClosed().toPromise();
      if(result != null){
        console.log(result)
        if(Object.keys(result).length != 0){
          // Update Bonus Activity
          var mergeActivity = reviewSpecialist ? (result["bonusactivity"] ?? {}) : {...(this.liveAssignment["bonusactivity"] ?? {}), ...result["bonusactivity"]}
          console.log(mergeActivity)
          var additionalSpecialist = Object.keys(mergeActivity)
          
          await updateDoc(doc(this.firestore, "live assignment", this.liveAssignment["docid"]), {
            bonusactivity: additionalSpecialist.length != 0 ? mergeActivity : null,
            bonusactivityparticipant: additionalSpecialist.length != 0 ? additionalSpecialist : null
          });
  
          // Update People Involved
          var peopleInvolved = Object.keys(mergeActivity)
          var mergePeopleInvolved = Array.from(new Set(peopleInvolved.concat(this.liveAssignment["pairing"] ?? []) as string[]))
          console.log(mergePeopleInvolved)
          
          await updateDoc(doc(this.firestore, "queue_token", this.liveAssignment["token"]["docid"]), {
            people_involved: mergePeopleInvolved
          });
        }
        invited = true
      }
    } catch (error) {
      console.error('Error in inviteMore:', error);
    }
    return invited
  }
  
  async regenerateZoomLink(){
    var url:string
    if(environment.firebase.projectId == "starlabs-test"){
      console.log("test")
      console.log(this.liveAssignment["zoomdata"], 'liveassignment');
      
      url = "https://us-central1-starlabs-test.cloudfunctions.net/studioZoomLinkRegenerate?liveassignmentid="+this.liveAssignment["docid"]+"&zoomdata="+JSON.stringify(this.liveAssignment['zoomdata'])
    }
    else if(environment.firebase.projectId == "fir-sample-aae4a" || environment.firebase.projectId == "launch-your-legacy-development"){
      console.log("Production")
      url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/studioZoomLinkRegenerate?liveassignmentid="+this.liveAssignment["docid"]+"&zoomdata="+JSON.stringify(this.liveAssignment['zoomdata'])
    }
    var generateLoading = this.dialog.open(LoadingProgressComponent, {
      data:{
        msg: "Generating Link...."
      }
    })
    
    try {
      const res = await this.http.get(url).toPromise();
      console.log(res)
    } catch (err) {
      console.log("Error", err)
    }
    
    generateLoading.close()
    this.enableZoomLinkGenerator()
  }
  
  viewform(form){
    let path = doc(this.firestore, "formsByClient", form['docid']).path
    const url = this.router.createUrlTree(['/formtemplate'],{queryParams: {id: form.formid, type:'form', patchdata:path}})
    window.open(url.toString(), '_blank')
  }
  
  addATC(validated, profileid) {
    console.log(profileid, 'profileid');
  
    const url = this.router.createUrlTree(['/prescribeATC'], { queryParams: { validation: validated, profileid: profileid } }).toString();
    window.open(url, '_blank');
  }
  
  updateATC(atcid, collection, option){
    var url = '/editATC/'+atcid+"/" + collection + option
    window.open(url.toString(), '_blank')
  }
  
  async previewATC(collectiontype){
    var startDate = this.transferredQueue != null ? this.transferredQueue["queuestartdate"].toDate() : this.ongoingQueue["queuestartdate"].toDate()
    console.log("ATC Fetch Date", startDate, this.transferredQueue)
    
    var unvalidateQuery = this.profileRoles["mentor"] || this.profileRoles["ah"] || this.profileRoles["developer"] || true ? // Allow all Specialist to access all Queue ATC
      query(
        collection(this.firestore, "atc_to_validate"),
        where("status", "==", "atc given"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      ) : 
      query(
        collection(this.firestore, "atc_to_validate"),
        where("author", "array-contains", doc(this.firestore, "profile_data", this.profileid)),
        where("status", "==", "atc given"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      );
      
    var alphaQuery = this.profileRoles["mentor"] || this.profileRoles["ah"] || this.profileRoles["developer"] || true ? // Allow all Specialist to access all Queue ATC
      query(
        collection(this.firestore, "atc_alpha"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      ) : 
      query(
        collection(this.firestore, "atc_alpha"),
        where("author", "array-contains", doc(this.firestore, "profile_data", this.profileid)),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      );
      
    var queryToUse = collectiontype == "alpha" ? alphaQuery : unvalidateQuery
    var atcList = []
    
    try {
      const atcsnap = await getDocs(queryToUse);
      var atc = atcsnap.docs.filter(e => e.data()["status"] != "upgraded")
      if(collectiontype != "alpha"){
        atc = atcsnap.docs.filter(e => e.data()["status"] != "validated")
      }
      console.log(atc.length)
      if(atc.length == 0){
        if(collectiontype == "alpha"){
          this.alphaATCList = []
        }
        else{
          this.unvalidatedATCList = []
        }
      }
      
      for (let i = 0; i < atc.length; i+=10) {
        var notesIDList:any[] = atc.slice(i, i+10).map(e => e.data()["notesid"]).filter(e => e != null && e != undefined)
        if(notesIDList.length != 0){
          const notesQuery = query(
            collection(this.firestore, "atc_notes"),
            where(documentId(), "in", notesIDList)
          );
          const notes = await getDocs(notesQuery);
          
          for (let a = 0; a < notes.docs.length; a++) {
            const notedoc = notes.docs[a];
            var notedata = notedoc.data()
            this.mapATCnotes[notedoc.id] = notedata
          }
        }
      }
      
      for (let i = 0; i < atc.length; i+=10) {
        var mentoringIDList:any[] = atc.slice(i, i+10).map(e => e.data()["mentoringid"]).filter(e => e != null && e != undefined)
        if(mentoringIDList.length != 0){
          const mentoringQuery = query(
            collection(this.firestore, "pick_for_mentoring"),
            where(documentId(), "in", mentoringIDList)
          );
          const notes = await getDocs(mentoringQuery);
          
          for (let a = 0; a < notes.docs.length; a++) {
            const notedoc = notes.docs[a];
            var notedata = notedoc.data()
            this.mapATCnotes[notedoc.id] = notedata
          }
        }
      }
      
      for (let a = 0; a < atc.length; a++) {
        const atcDoc = atc[a];
        if(atcList[a] == null || atcList[a] == undefined){
          atcList[a] = {
            atcid: atcDoc.id,
            atcdata: atcDoc.data(),
            transcription: []
          }
        }
        
        const correctionsQuery = query(
          collection(this.firestore, atcDoc.ref.path, "corrections"),
          where("isdelete", "==", false)
        );
        const adjustment = await getDocs(correctionsQuery);
        
        for (let b = 0; b < adjustment.docs.length; b++) {
          const adjDoc = adjustment.docs[b];
          if(atcList[a].transcription[b] == undefined || atcList[a].transcription[b] == null){
            atcList[a].transcription[b] = {
              adjustment: adjDoc.data()["name"],
              procedure: []
            }
          }
          
          const proceduresQuery = query(
            collection(this.firestore, adjDoc.ref.path, "procedures"),
            where("isdelete", "==", false)
          );
          const procedure = await getDocs(proceduresQuery);
          
          for (let c = 0; c < procedure.docs.length; c++) {
            const procedureDoc = procedure.docs[c];
            var data = procedureDoc.data()
            atcList[a].transcription[b].procedure[c] = {
              procedureid: data["name"].id,
              status: data["status"],
              path: procedureDoc.ref.path
            }
          }
          if(collectiontype == "alpha"){
            this.alphaATCList = atcList
          }
          else{
            this.unvalidatedATCList = atcList
          }
          console.log(atcList[a])
        }
      }
    } catch (error) {
      console.error('Error in previewATC:', error);
    }
  }
  
  async getLoveLetters(){
    const profileid = this.liveAssignment?.["participantid"]
    if(!profileid){
      this.loveLetterList = []
      return
    }
    if(this.loveLetterLoadedFor == profileid){
      return
    }
    this.loveLetterLoading = true
    try {
      const q = query(
        collection(this.firestore, "love letter"),
        where("profileid", "==", profileid),
        orderBy("created", "desc")
      )
      const snap = await getDocs(q)
      this.loveLetterList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      this.loveLetterLoadedFor = profileid
    } catch (error) {
      console.error('Error fetching love letters:', error)
      this.loveLetterList = []
    } finally {
      this.loveLetterLoading = false
    }
  }

  toggleLoveLetter(){
    this.showLoveLetter = !this.showLoveLetter
    if(this.showLoveLetter){
      this.getLoveLetters()
    }
  }

  async getAssignedATC(){
    var startDate = this.transferredQueue != null ? this.transferredQueue["queuestartdate"].toDate() : this.ongoingQueue["queuestartdate"].toDate()
    
    try {
      const atcQuery = query(
        collection(this.firestore, "atc_alpha"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("implementationagent", "array-contains", this.profileid),
        where("prescription_date", ">=", startDate)
      );
      const atc = await getDocs(atcQuery);
      
      console.log(atc.size)
      if(atc.size == 0){
        this.cwATClist = []
      }
      
      for (let a = 0; a < atc.docs.length; a++) {
        const atcDoc = atc.docs[a];
        var atcData = atcDoc.data()
        
        this.cwATClist[a] = {
          atcdata: atcData,
          adjustments: [],
          cwbrief: []
        }
        
        const adjustmentQuery = query(
          collection(this.firestore, atcDoc.ref.path, "corrections"),
          where("implementationagent", "array-contains", this.profileid)
        );
        const adjustment = await getDocs(adjustmentQuery);
        
        console.log("Total Adj", adjustment.size)
        var adjustmentread = 0
        
        for (let b = 0; b < adjustment.docs.length; b++) {
          const adjDoc = adjustment.docs[b];
          var adjustmentdata = adjDoc.data()
          
          this.cwATClist[a]["adjustments"][b] = {
            adjustments: adjustmentdata["name"],
            procedure: []
          }
          
          const procedureQuery = query(
            collection(this.firestore, adjDoc.ref.path, "procedures"),
            where("mandatory", "==", true),
            where("assigned_to", "array-contains", doc(this.firestore, "profile_data", this.profileid))
          );
          const procedure = await getDocs(procedureQuery);
          
          console.log("Total Pro", procedure.size)
          adjustmentread += 1
          var procedureList = []
          
          for (let c = 0; c < procedure.docs.length; c++) {
            const procedureDoc = procedure.docs[c];
            var data = procedureDoc.data()
            procedureList.push({
              procedureid: data["name"].id,
              status: data["status"],
              path: procedureDoc.ref.path
            })
          }
          
          this.cwATClist[a]["adjustments"][b]["procedure"] = procedureList
          console.log(this.cwATClist[a]["adjustments"])
  
          if(adjustmentread == adjustment.size){
            console.log("Adjustment Reading completed for ATC", a+1, this.cwATClist[a]["atcdata"]["atcid"], this.cwATClist[a]["atcdata"]["notesid"])
            var hasProcedure = this.cwATClist[a]["adjustments"].some(e => e["procedure"].length != 0)
            console.log(hasProcedure)
            
            if(hasProcedure && this.cwATClist[a]["atcdata"]["notesid"] != null){
              const atcnotesDoc = await getDoc(doc(this.firestore, "atc_notes", this.cwATClist[a]["atcdata"]["notesid"]));
              if(atcnotesDoc.exists()){
                var notesdata = atcnotesDoc.data()
                this.cwATClist[a]["cwbrief"] = notesdata["changeworkbrief"] ?? []
              }
            } 
            else if(!hasProcedure){
              this.cwATClist[a]["adjustments"] = []
            }                     
          }
          console.log(this.cwATClist)
        }
      }
    } catch (error) {
      console.error('Error in getAssignedATC:', error);
    }
  }
  
  async markProcedure(atcindex, adjindex, proindex){
    var procedure = this.cwATClist[atcindex]["adjustments"][adjindex]["procedure"][proindex]
    console.log(procedure)
    procedure["status"] = procedure["status"] == "completed" ? "yet to start" : "completed"
    
    try {
      await updateDoc(doc(this.firestore, procedure["path"]), {
        status: procedure["status"]
      });
    } catch (error) {
      console.error('Error updating procedure:', error);
    }
  }
  
  async assignChangeagent(validated){
    // var assignProperty = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']]?.studioassignprocedureproperty ?? {}
    // var eligibleStages = (validated ? assignProperty["addvalidatedatc"] : assignProperty["addunvalidatedatc"]) ?? []
    var eligibleStages = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']]["implementationstages"] ?? []
    // var eligibleStages = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']] ?? []
    console.log(this.liveAssignment);
    console.log(this.liveAssignment['stagename']);
    console.log(eligibleStages, 'eligibleStages');
    var eligibleActivityParse = []
    for (let i = 0; i < eligibleStages.length; i++) {
      const stage = eligibleStages[i];
      console.log(stage);
      
      const stageProperty = this.ongoingQueue["stageproperty"][stage];
      var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
      console.log(compulsoryActivity,'compulsoryActivity');
      
      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination:any = compulsoryActivity[j];
        var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        eligibleActivityParse.push(parse)
      } 
    }
    console.log(eligibleActivityParse)

    var eligibleStudio = this.allStudioList.filter(studio => eligibleActivityParse.includes(Object.values(studio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",")))
    console.log(eligibleStudio)

    var allParticipants = eligibleStudio.reduce((acc, studio) => {
      if (Array.isArray(studio.participants)) {
          acc.push(...studio.participants);
      } else {
          console.log('No participants array found in this studio:', studio);
      }
      return acc;
    }, []);

    let chunkSize = 10;
    let preassigned = [];
    this.mappreassignedagent = {};
    this.mappreassignedprocedure = {};

    for (let i = 0; i < allParticipants.length; i += chunkSize){
      let chunk = allParticipants.slice(i, i + chunkSize);
      console.log(this.ongoingQueue["docid"]);
      let promise = getDocs(query(collection(this.firestore,"atc_alpha"), where('queueid', '==', this.ongoingQueue["docid"]),where('isdelete','==',false),where("implementationagent", "array-contains-any", chunk)))
      preassigned.push(promise)
    }
    console.log(preassigned.length);
    let preassignedagent = [];
    await Promise.all(preassigned).then(results => {
      console.log(results); 
      results.forEach(snap => {
        snap.docs.forEach(e => {
          console.log(e.data());
          preassignedagent.push(e.data()) 
          if(e.data()['implementationagent'] != null && e.data()['implementationagent'] != undefined && e.data()['implementationagent'].length != 0){
            e.data()['implementationagent'].forEach(agent => {
              console.log(agent);
              if (!this.mappreassignedagent[agent]) {
                this.mappreassignedagent[agent] = 0;
              }
              this.mappreassignedagent[agent]++;
              if(e.data()['totalmandatoryprocedure'] == e.data()['totalmandatoryprocedurecompleted']){
                console.log(e.data()['totalmandatoryprocedure']);
                this.mappreassignedagent[agent]--;
              }
            })
          }
        })
        
      });
      preassignedagent.forEach(e => {
        if(e['implementationagent'] != null && e['implementationagent'] != undefined && ![null,undefined].includes(e['implementationagentcount'])){
          Object.keys(e['implementationagentcount']).forEach(key =>{
            if(key != null && key != undefined){
              let value = e['implementationagentcount'][key];
              console.log(value);
              console.log(value['totalmandatoryprocedure']);
              var assignedprodure = value['totalmandatoryprocedure'] - value['totalmandatoryprocedurecompleted']

              if(assignedprodure == 0 && this.mappreassignedagent[key] != 0){
                this.mappreassignedagent[key]--;
              }else if(assignedprodure == 0 && this.mappreassignedagent[key] == 0){
                this.mappreassignedagent[key] = 0
              }
              this.mappreassignedprocedure[key] = (this.mappreassignedprocedure[key] || 0) + assignedprodure
            }
          })
        }
      })
    })
    .catch(error => {
        console.error('Error fetching documents:', error);
    });
    
    

    this.dialog.open(AssignProcedureStudioComponent, {
      data: {
        studiolist: eligibleStudio,
        collectiontype: validated || this.profileRoles["mentor"] ? "alpha" : "validation",
        authorid: this.selectedStudio["participants"],
        participantid: this.liveAssignment["participantid"],
        mapprofile: this.mapProfile,
        mappreassignedagent : this.mappreassignedagent,
        mappreassignedprocedure : this.mappreassignedprocedure
      },
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true
    }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
      if(result != null){
        var token = this.liveAssignment["token"]
        var preassigned = token["preassigned"] ?? {}
        eligibleStages.forEach(stage=>{
          preassigned[stage] = Array.from(new Set((preassigned[stage] ?? []).concat(result)))
        })
        updateDoc(doc(this.firestore, 'queue_token', token["docid"]), {
          preassigned: preassigned
        })
        
      }
    })
  }
  
  getTripleATC(){
    var involvedQueue = [this.ongoingQueue["docid"]]
    console.log(involvedQueue)
    if(this.transferredQueue != null) involvedQueue.push(this.transferredQueue["docid"])
    console.log(this.transferredQueue)
    
    const tripleATCQuery = query(
      collection(this.firestore, "triple atc"),
      where("profileid", "==", this.liveAssignment["participantid"]),
      where("queueid", "in", involvedQueue),
      where("status", "==", "atc given")
    );
    
    this.tripleATCSubscription = collectionData(tripleATCQuery).subscribe(atc => {
      this.tripleATCList = atc.sort((a, b) => a["prescription_date"].toDate() - b["prescription_date"].toDate())
    });
  }
  
  viewTripleATC(id){
    const url = this.router.createUrlTree(['/edit triple ATC/'+id])
    window.open(url.toString(), '_blank')
  }

  async getQueueRefFromTransferredFrom(value:DocumentReference){
    let docData = await getDoc(value)
    return docData.data()
  }
  
  async getCurrentAEL(){
    console.log("Checking AEL.....")
    this.participantAEL = {}

    if(!this.liveAssignment["token"]) return;
    
    try {
      const level = await getDocs(collection(this.firestore, "accelerated evolution level"));
      this.aelLevelList = level.docs.map(e => e.data())

      var involvedQueueID = []
      involvedQueueID.push(this.liveAssignment["token"]['queueref'].id)
      if(![null,undefined].includes(this.liveAssignment["token"]["transferredfrom"])){
        involvedQueueID.push(this.liveAssignment["token"]["transferredfrom"].id)
        let currentRef:DocumentReference | null = this.liveAssignment["token"]['tokentransferredfrom'] ?? null
        while (currentRef != null) {
          const transferData = await this.getQueueRefFromTransferredFrom(currentRef);
          if(![null,undefined].includes(transferData['transferredfrom'])){
            involvedQueueID.push(transferData["transferredfrom"].id)
            currentRef = transferData['tokentransferredfrom']
          }else{
            currentRef = null;
            break;
          }
        }
      }

      var aelQuery = query(collection(this.firestore, "participant AEL"), where("queueid", "in", involvedQueueID), where("profileid", "==", this.liveAssignment['participantid']))
      const ael = await getDocs(aelQuery);

      if(ael.docs.length != 0){
        this.participantAEL = ael.docs[0].data()
        this.participantAEL["aelStatus"] = this.participantAEL["flag"]
        this.participantAEL["originalmetric"] = this.participantAEL["crossovermetric"] ?? {}
        this.participantAEL["crossovermetric"] = Object.keys(this.participantAEL["crossovermetric"] ?? {}).length == 0 ? null : this.participantAEL["crossovermetric"]
        if(this.participantAEL["crossovermetric"] != null){
          Object.keys(this.participantAEL["crossovermetric"]).forEach(key =>{
            var metric = this.participantAEL["crossovermetric"][key]
            metric["value"] = metric["startpoint"] + "---" + metric["endpoint"]
          })
        }
      }
      
      /*
      const deliverableQuery = query(
        collection(this.firestore, "deliverables"),
        where("fileref", "array-contains", doc(this.firestore, "queue_token", this.liveAssignment["token"]["docid"])),
        limit(1)
      );
      const deliverable = await getDocs(deliverableQuery);
      
      if(deliverable.size != 0){
        var participantProductID = deliverable.docs[0].data()["participantproductid"]
        console.log("Participant Product ID", participantProductID)
        
        const product = await getDoc(doc(this.firestore, "participantsproduct", participantProductID));
        if(product.exists()){
          var productData = product.data()
          console.log("AEL ID", productData["aelid"])
          
          if(productData["aelid"] != null && productData["aelid"] != undefined){
            const ael = await getDoc(doc(this.firestore, "participant AEL", productData["aelid"]));
            if(ael.exists()){
              this.participantAEL = ael.data()
              this.participantAEL["originalmetric"] = this.participantAEL["crossovermetric"] ?? {}
              this.participantAEL["crossovermetric"] = Object.keys(this.participantAEL["crossovermetric"] ?? {}).length == 0 ? null : this.participantAEL["crossovermetric"]
              if(this.participantAEL["crossovermetric"] != null){
                Object.keys(this.participantAEL["crossovermetric"]).forEach(key =>{
                  var metric = this.participantAEL["crossovermetric"][key]
                  metric["value"] = metric["startpoint"] + "---" + metric["endpoint"]
                })
              }
            }
          }
        }
      }
      */
    } catch (error) {
      console.error('Error in getCurrentAEL:', error);
    }
  }
  
  async updateCurrentAEL(){
    var reviewed = false
    // Generate new document ID
    const newDocId = doc(collection(this.firestore, 'temp')).id;
    
    var crossoverdata = {
      "docid": newDocId,
      "aelid": this.participantAEL["docid"],
      "created": serverTimestamp(),
      "metric": {},
      "profileid": this.liveAssignment["participantid"],
      "validatedby": this.profileid
    }
    
    Object.keys(this.participantAEL["crossovermetric"]).forEach(key =>{
      var original = this.participantAEL["originalmetric"][key]
      var metric = this.participantAEL["crossovermetric"][key]
      var newValue = metric["value"]
      var splitValue = newValue.split("---")
      crossoverdata["metric"][key] = crossoverdata["metric"][key] ?? {}
      crossoverdata["metric"][key]["startpoint"] = splitValue[0]
      crossoverdata["metric"][key]["endpoint"] = splitValue[1]
      crossoverdata["metric"][key]["metric"] = metric["metric"] ?? null
      if(original["startpoint"] != splitValue[0] || original["endpoint"] != splitValue[1]){
        reviewed = true
      }
    })
    console.log(crossoverdata)
  
    try {
      var batch = writeBatch(this.firestore)
      batch.set(doc(this.firestore, "interim crossover", crossoverdata.docid), crossoverdata)
      var newAELdata = {
        "crossovermetric": crossoverdata.metric,
        "flag": "validated",
        "validatedby": this.profileid
      }
      if(reviewed){
        newAELdata["updated"] = true
      }
      batch.update(doc(this.firestore, "participant AEL", crossoverdata.aelid), newAELdata)
      await batch.commit().then(()=> {
        console.log("AEL Updated Successfully");
        this.participantAEL["status"] = "validated"
        this.participantAEL["aelStatus"] = "validated"
      })
    } catch (error) {
      console.error('Error in updateCurrentAEL:', error);
    }
  }
  
  navigateMeeting(doc:any){
    console.log(doc);
    const zoomData = doc["zoomdata"] ?? {}

    if(!zoomData["start_url"] || zoomData["start_url"] == "Link Broken"){
      alert("Link is broken. Generate new Link.")
      return
    }

    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/openmeeting', doc['docid'], 'queue'])
    );
         
    window.open(url, "_blank");
  }
  
  async movetoNextMonthReview(){
    console.log(this.liveAssignment);
    var token = this.liveAssignment["token"]
    
    if(window.confirm('Are you sure want to move participants to the next month review?')){
      try {
        await setDoc(doc(this.firestore, "review participants", token['docid']), token);
      } catch (error) {
        console.error('Error moving to next month review:', error);
      }
    }
  }

  async getstudiochat(chat) {
    if(Object.keys(this.subscription).includes('messages')){
      console.log("Destroy");
      
      for(var key in this.subscription) {
        this.subscription[key].unsubscribe();
      }
    }
    if (this.selectedChat && this.selectedChat.docid === chat['docid']) {
      // If the same chat is clicked again, toggle the selectedParticipant to false
      this.selectedParticipant = false;
      this.selectedChat = null;
      this.messages = [];
      return;
    }
    this.selectedParticipant = true
    console.log(chat);
    this.chatId = chat['docid'];
    this.chatsloading = true;
    this.messagescopy = [];
    this.messages = [];
    this.subscription = {};
    this.pendingMessagesCount[chat['docid']] = 0
    this.chatref = query(
      collection(this.firestore, 'studio conversation'),
      where('docid', '==', chat['docid'])
    );
    
  
    const chatDocs = await this.chatref.get().toPromise();
  
    if (!chatDocs.empty) {
      chatDocs.forEach(async chatDoc => {
        const chatData = chatDoc.data();
        const data = {
          chatindex: chatData['pendingmessages'] ?? 0,
          useruid: this.currentuseruid,
          username: this.currentuserData['name'],
          useremail: this.currentuserData['email'],
          userprofileid: this.currentuserData['profileid'],
          chatname: chatData["chatname"],
          chatprofile: chatData["chatprofile"],
          members: chatData["members"] ?? [],
          docref: chatDoc.ref,
          docid: chatDoc.id,
        };
  
        this.selectedChat = data;
        this.selectedchat(this.selectedChat);
  
        const messagesRef = query(collection(this.firestore,`studio conversation/${chatDoc.id}/messages`), orderBy('time', 'asc'));
        
        this.subscription['messages'] = collectionSnapshots(messagesRef).pipe(takeUntil(this.subscriptionHandle)).subscribe((messageDocs) => {
          this.subscribemessagesboolean = true;
          const messages = messageDocs.map(messageDoc => {
            const element = messageDoc.data() as any;
            element['docref'] = messageDoc.ref;
            element['docid'] = element['messageid'];
            element['time'] = element['time'];
            element['senderuid'] = element['sender_uid'];
            element['originalmessage'] = element['message'];
            element['message'] = [null, undefined, ''].includes(element['message']) ? '' : element['message'].replace(/\n/g, '<br>');
            element['read_by'] = element['read_by'];
            element['pending'] = element['pending'];
            element['link'] = element['link'];
            element['type'] = element['type'] ?? null;
            return element;
          });
  
          this.messagescopy = messages;
          this.messages = messages;
          this.cdr.detectChanges();
          this.scrollToIndex();
        });
      });
    } else {
      console.log('No chat documents found.');
    }
  }
  

  scrollToIndex() {
  
    if (this.itemElements && this.itemElements.length > 0) {
      const lastItem = this.itemElements.last.nativeElement;
      lastItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }


  // Method to toggle chat container visibility
  toggleChatContainer() {
    this.isChatContainerOpen = !this.isChatContainerOpen;
  }


  //sending message to support chat
  async sendMessage(formvalue) {
    console.log(formvalue);
    if(formvalue.sms == '' && formvalue.sms == '\n'){
      alert("Oops, Please type a message....");
    }else{
      console.log("Sending Message");
      
      var msgData ={};
      var lastmessage = {};
      var message = formvalue.sms
      this.resetform();

      // var extractedLinks = (formvalue.sms.match(this.linkPattern) || []).map(link => link.trim());

      console.log('uploading');
      var time = new Date();
      const docID = doc(collection(this.firestore,'messages')).id

      const chatDocsSnapshot = await this.chatref.get().toPromise();

      if (!chatDocsSnapshot.empty) {
        const chatDoc = chatDocsSnapshot.docs[0]; // Take the first matching document
        const msgDocRef = chatDoc.ref.collection("messages").doc(docID);

        var members = this.selectedChat['members'] ?? [];
        var index = members.indexOf(this.selectedChat['useruid']);
        
        if (index > -1) {
            members.splice(index, 1);
        }

        msgData = {
            "time": time,
            "sender_uid": this.selectedChat['useruid'],
            "sender_email": this.selectedChat['useremail'],
            "message": message,
            "messageid": docID,
            "read_by": [this.selectedChat['useruid']],
            "pending": members,
            "files": [],
            "type": 'text'
        };

        lastmessage = {
            "last_modification": time,
            "last_message": message,
            "last_pending": members,
            "last_read_by": [this.selectedChat['useruid']],
            "last_sender_uid": this.selectedChat['useruid'],
            "files": []
        };

        const batch = writeBatch(this.firestore);
        batch.set(msgDocRef, msgData);

        await batch.commit().then(async () => {
            this.message = '';
            console.log('Message sent successfully');
            this.openSnackBar("Message sent successfully", "Ok");
        }).catch((error) => {
            console.log('error', error);
            this.openSnackBar("Oops something went wrong", "Ok");
        });
        var url = window.location.href.split('/')
        console.log(url);

        var tokens = [];
        var userRefs = [];
        if (this.selectedChat['members'].length != 0) {
            for (let j = 0; j < this.selectedChat['members'].length; j++) {
                const element = this.selectedChat['members'][j];
                if (![null, undefined].includes(this.mapNotificationid[element])) {
                    tokens.push(this.mapNotificationid[element]);
                }
                userRefs.push(doc(this.firestore,"user_data",element))
            }
            // Uncomment and implement push message logic if needed
            await this.guard.sendPushMessage(
              'Message From ' + this.currentuserData['name'],
              message + ' http://'+url[2]+'/'+this.chatId,
              'http://'+url[2]+'/chat/chats/'+'/'+this.chatId,
              tokens
            );

            addDoc(collection(this.firestore, "A&H updates"), {
              date: serverTimestamp(),
              users: userRefs,
              title: this.mapProfileuid[msgData['sender_uid']]['name'],
              message: msgData['message'],
              sticky: false,
              landingpage: null,
              notificationimage: null,
            }).then((id)=>{
              console.log(id.id,"updated A&H Updates")
            }).catch((error)=>{
              console.log("Oops error while updating A&H updates");
            });
        }
    } else {
        console.error('No chat document found for the given live assignment ID');
    }

     
    }
  }


  // mark unread message as read
  async selectedchat(value){
    console.log(value);
    getDocs(query(collection(this.firestore,'studio conversation',value['docid'],"messages"),where('pending','array-contains',this.currentuseruid),orderBy("time",'desc'))).then((newData)=>{
      for (let i = 0; i < newData.docs.length; i++) {
        const element = newData.docs[i];
        this.updateRecipient(element.ref,this.currentuseruid);
      }
    });
    var ref = doc(this.firestore,"studio conversation",value['docid'])
    this.updateSupportchat(ref,this.currentuseruid);
  }


  resetform(){
    this.messageform.patchValue({
      sms:'',
      files :[]
    });
  }
  
  sendMsg(e: Event) {
    const keyboardEvent = e as KeyboardEvent;
    if (!keyboardEvent.shiftKey) { 
      keyboardEvent.preventDefault();
      var msg = this.messageform.controls['sms'].value.trim();
      if (msg != "") {
        this.sendMessage(this.messageform.value);
      }
    }
  }

  openSnackBar(message:string,action:string) {
    this.snackBar.open(message,action,{ duration: 2000})
  }
  
  //updating supportchat message
  updateRecipient(msgRef,uid) {
    msgRef.update({
      "read_by": arrayUnion(uid),
      "pending": arrayRemove(uid)
    }).then(()=>{
      console.log('reciept updated successfully');
    }).catch((error)=>{
      console.log('Oops Error while updating reciept',error);
    });
  }

  //updated supportchat
  updateSupportchat(msgRef,uid) {
    var collection = msgRef.path.split("/");
    updateDoc(doc(this.firestore,collection[0],collection[1]),{
      "last_read_by": arrayUnion(uid),
      "last_pending": arrayRemove(uid)
    }).then(()=>{
      console.log('reciept updated successfully');
    }).catch((error)=>{
      console.log('Oops Error while updating reciept',error);
    });
  }

  trackById(index: number, item: any): string {
    return item.key;
  }

  async joinOpenViduRoom(){
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Setting uP!..."},
      disableClose: true
    })
    try{
      var liveAssignmentID = this.liveAssignment["docid"]
      var roomDoc = doc(this.firestore, "openviduroom", liveAssignmentID)

      await getDoc(roomDoc).then(async doc =>{
        if(!doc.exists()){
          await this.guard.createOpenViduRoom({
            active: true,
            createddate: serverTimestamp(),
            sessiontype: "live assignment",
            sessionid: liveAssignmentID,
            roomid: liveAssignmentID,
            hosts: this.liveAssignment["pairing"],
            participantid: this.liveAssignment["participantid"],
            title: `${this.mapProfile[this.liveAssignment["token"]?.profile_id]} - ${this.liveAssignment["stagename"]} (${this.liveAssignment["pairing"].map(e => this.mapProfile[e]).join(", ")})`,
            metadata: {
              queueid: this.ongoingQueue["docid"]
            }
          })

          // var roomData = {
          //   active: true,
          //   createddate: serverTimestamp(),
          //   sessiontype: "live assignment",
          //   sessionid: liveAssignmentID,
          //   roomid: liveAssignmentID,
          //   hosts: this.liveAssignment["pairing"],
          //   participantid: this.liveAssignment["participantid"],
          //   title: `${this.mapProfile[this.liveAssignment["token"]?.profile_id]} - ${this.liveAssignment["stagename"]} (${this.liveAssignment["pairing"].map(e => this.mapProfile[e]).join(", ")})`,
          //   metadata: {
          //     queueid: this.ongoingQueue["docid"]
          //   }
          // }
          // await setDoc(roomDoc, roomData)
        }
        else{
          if(!doc.data()["active"]){
            await updateDoc(roomDoc, {active: true})
          }
        }
      })

      loading.close()

      var hostname = window.location.origin
      window.open(`${hostname}/joinroom/${liveAssignmentID}`, '_blank')
    }
    catch(err){
      loading.close()
      console.log(err)
    }
  }
}
