import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { collection, collectionData, collectionSnapshots, doc, DocumentReference, Firestore, getDoc, getDocs, getFirestore, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from '@angular/fire/storage';
import { AuthguardService } from '../../authguard.service';
import { CommonModule, DatePipe, Location } from '@angular/common';
import * as RecordRTC from 'recordrtc';
import { DomSanitizer } from '@angular/platform-browser';
import { Subject, Subscription, takeUntil, timer } from 'rxjs';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatDialog } from '@angular/material/dialog';
import { ConnectivityGuardService } from '../../shared/connectivity-guard.service';
import { MediaCacheService, PendingMedia } from '../../shared/media-cache.service';
import { ATCDraftService } from '../../shared/atc-draft.service';
import { DraftConflictDialogComponent } from '../shared/draft-conflict-dialog.component';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { AtcOptionComponent } from '../../ATC/atc-option/atc-option.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ErrorStateMatcher } from '@angular/material/core';
import { AtcAelConfirmComponent } from '../../ATC/atc-ael-confirm/atc-ael-confirm.component';
import { NetworkStatusService } from '../../network-status.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UpdateDialogComponent } from '../../DialogBox/update-dialog/update-dialog.component';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MarkdownModule } from 'ngx-markdown';

interface AssignmentData {
  clipurl?: string;
  capturedby?: string;
  timestamp?: string;
}

const generateId = (firestore: Firestore, collectionName: string) => doc(collection(firestore, collectionName)).id;

@Component({
  selector: 'app-prescribe-atc',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    DragDropModule,
    FormsModule,
    MatSelectModule,
    MatCheckboxModule,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MarkdownModule
  ],

  templateUrl: './prescribe-atc.component.html',
  styleUrl: './prescribe-atc.component.css'
})
export class PrescribeATCComponent {
  autoSaveID = null;
  // Progess
  settingup:boolean = true
  loading = false;
  data: any = [];
  get loadingDialog(){
    return this.matDialog.open(LoadingProgressComponent, {data: {msg:'Uploading ATC...'}, disableClose:true})
  }
  loadingref = null;

  // Roles
  developer:boolean = false
  admin:boolean = false
  ah:boolean = false
  transcriber:boolean = false
  eis:boolean = false
  mentor:boolean = false

  // Meta data
  loggedinUser;
  loggedinProfileid;
  mapProfile = {};
  procedureMap = {};

  // Dropdown Options
  filteredProfile = "";
  profileList = [];
  filteredSpecialist = ""
  specialistList = [];
  productLists = [];
  productAvailable = [];
  recommendlist = []; // For Procedure
  procedurelist = []; // Changework Names
  relatedATCauthor = [];
  mentorOption = []; // Mentee Person

  // Subscription
  profileSubscription: Subscription
  rolesSubscription: Subscription
  recommendationSubscription: Subscription
  procedureSubscription: Subscription
  productSubscription: Subscription

  // Big Activity
  bigActivityList = []
  bigActivityAuthor = []
  bigActivityObserver = []
  bigActivityMentor = []
  bigActivityAdditional = []
  bigActivityAssignedto = []

  // ATC Data
  alphaid:string
  date = null;
  product = null;
  atcdirective = null;
  participantProfileid = null;
  selectedParticipantProfile = {}
  // author = [];
  authorMap = {}
  // observer = [];
  observerMap = {}
  mentorMap = {}
  additionalActivityMap = [{
    activity: null,
    specialist: []
  }]
  mentee = []
  transcript = [{
    adjustment : "",
    awareness : null,
    potentialyears : null,
    procedure : [
      {
        name : null,
        recommended_to : null,
        assignedMap: {},
        // assigned_to : [],
        mandatory : false,
        completed: false
      }
    ]
  }];

  // ATC Directives
  atcAssignment = [
    {directive: null, assignedto: [], activity: null}
  ]

  // Notes/Metoring
  consultationSummary = null;
  consultationpoint = null;
  casenotes = null;
  mentornotes = null;

  // totalProcedures = 0;
  // totalProcedureWritten = 0;

  //Lets declare Record OBJ
  record;
  //Will use this flag for toggeling recording
  recording = false;
  //URL of Blob
  audioBlob = []
  audioBlobURL = [];
  notesWritten = false;

  // Timer
  countDown:string = "00 : 00";
  countDownSubscription:Subscription;

  // Validation
  validationnotrequired:boolean;
  validator = []
  mentorNameList = []

  // Image Notes
  selectedNoteImages = []
  previewNoteImages = []
  // Image ATC
  selectedATCImages = []
  previewATCImages = []

  // Queue Data
  ongoingQueue = null
  arenamode:boolean = false
  liveassignmentid = null
  liveassignmentdata = null
  tokendata = null
  queueid:string = null
  stagename:string = null
  queryparam

  // ATC List
  alphaSubscription:Subscription
  toValidateSubscription:Subscription
  mergeATC = []
  alphaATClist = []
  atctoValidateList = []
  mapATCnotes = {}

  subscriptionHandle = new Subject<void>()

  //directive assignment ongoing
  mapProductidtoatcmodel:any = {}
  assignmentInitiated:boolean = false
  directiveAssignmentRef : any = null
  directiveMentor:any [] = []
  adjustmentAwarenessDetail:any = {}

  //network status
  isonline:boolean
  pageloadedatfirsttime:boolean = false
  aigeneratedEntry:boolean = false  // true when opened from an AI-generated draft link (hides "open another draft")
  // "Edited from AI generation" provenance — set when a draft is started from / loaded from an AI source,
  // carried through to the final atc_alpha / atc_to_validate document on submit.
  aiedited:boolean = false
  aigeneratedsource:string | null = null
  aigeneratedid:string | null = null
  submitAttempted = false  // true once Submit was pressed — drives the inline "required" hints
  // shows the inline "Required" message on every required field once Submit was attempted
  requiredMatcher: ErrorStateMatcher = {
    isErrorState: (control) => !!(control && control.invalid && (control.touched || this.submitAttempted))
  };

  // Draft
  draftStatus = {
    message: "Draft not saved yet.",
    code: 0
  }
  existingDraftIds: string[] = []  // ids of this participant's existing drafts (to detect drafts other than the current one)

  audiolist = []
  imagelist = []
  atcImageURL = []

  lastDraftSavedOn = null

  // --- Connectivity monitoring (handled by ConnectivityGuardService) ---
  private unregisterConnectivity: (() => void) | null = null;

  uploadProgress = {
    audio: 0,
    noteImages: 0,
    atcImages: 0,
    isUploading: false
  };

  existingAudioURLs: string[] = [];
  existingNoteImageURLs: string[] = [];
  existingATCImageURLs: string[] = [];

  marathonId:string;
  assignmentId:string;
  participantAssignmentId:string;

  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  constructor(
    public location : Location,
    // public firestore : Firestore,
    public storage : Storage,
    public route: ActivatedRoute,
    public router: Router,
    public guardservice : AuthguardService,
    public datepipe : DatePipe,
    private domSanitizer: DomSanitizer,
    public clipboard: Clipboard,
    public matDialog: MatDialog,
    public snackbar: MatSnackBar,
    private networkStatusService : NetworkStatusService,
    private connectivity: ConnectivityGuardService,
    private mediaCache: MediaCacheService,
    private draftService: ATCDraftService
  ) {
    this.settingup = true
    this.route.queryParams.subscribe(data=>{
      console.log(data);

      this.queryparam = data
      if (!data['aigenerated']) {
        this.participantProfileid = data['profileid']
        this.marathonId = data['marathonid']
        this.assignmentId = data['assignmentid']
        this.participantAssignmentId = data['participantassignmentid']
      }
      // this.participantProfileid = data['profileid']
      // this.marathonId = data['marathonid']
      // this.assignmentId = data['assignmentid']
      // this.participantAssignmentId = data['participantassignmentid']
    });
    this.date = datepipe.transform(new Date(), "yyyy-MM-dd")
    guardservice.getuid().then(uid=>{
      this.loggedinUser = uid
      console.log(uid)
      getDocs(query(collection(this.firestoreDefault, "profile_data"),where("user_ref", "==", doc(this.firestoreDefault, 'user_data', uid)))).then(async profileData=>{
        this.loggedinProfileid = profileData.docs[0].id
        getDoc(doc(this.firestoreDefault, profileData.docs[0].data()['role_ref']['path'])).then(async roleDoc=>{
          var roleData = roleDoc.data()
          this.admin = roleData['admin'] ?? false
          this.transcriber = roleData['transcriber'] ?? false
          this.eis = roleData['eis'] ?? false
          this.ah = roleData['eis'] ?? false
          this.developer = roleData['developer'] ?? false
          this.mentor = roleData['mentor'] ?? false

          if(!this.admin && !this.transcriber && !this.eis && !this.ah && !this.developer){
            alert("Access for this screen is denied")
            this.router.navigateByUrl('/')
          }
          // this.addActivity()
          await this.setupData()
          // await the assignment check so its popup resolves before setup completes
          const profileMapData = await guardservice.getProfileMap()
          await this.getDirectiveAssignments(profileMapData.docdata)
          if(this.participantProfileid){
            await this.onProfileSelect()
          }
          this.settingup = false
        })
      })
      //get adjustment_wareness
      getDoc(doc(this.firestoreDefault, "classify", "adjustment_awareness")).then( snap => {
        if(snap.exists()){
          this.adjustmentAwarenessDetail = snap.data()
        }
      })
    })
  }
  private extractProcedureKey(value: string): string {
    if (!value) return '';
    return value.replace(/\d+/g, '').trim().toLowerCase();
  }

  patchAIAdjustments(aiJson: any) {
    const adjustments = aiJson?.ATC_Report?.Adjustments;
    if (!Array.isArray(adjustments)) return;

    this.transcript = [];

    adjustments.forEach(adj => {
      const procedures = [];

      (adj.Procedures || []).forEach(rawProc => {
        const aiKey = this.extractProcedureKey(rawProc).toLowerCase();

        const matchedProcedure = this.procedurelist.find(p =>
          p.procedurename.toLowerCase().includes(aiKey)
        );

        if (matchedProcedure) {
          procedures.push({
            name: matchedProcedure.procedurepath,
            recommended_to: null,
            assignedMap: {},
            mandatory: false,
            completed: false
          });
        }
      });
      const adjustmentText =
        adj.Adjustment
          ? adj.Adjustment +
            (
              adj.Outcome && adj.Outcome.toString().trim().length > 0
                ? `, Outcome: ${adj.Outcome}`
                : ''
            )
          : '';

      this.transcript.push({
        adjustment: adjustmentText,
        awareness: null,
        potentialyears: null,
        procedure: procedures.length
          ? procedures
          : [{
              name: null,
              recommended_to: null,
              assignedMap: {},
              mandatory: false,
              completed: false
            }]
      });
    });

    setTimeout(() => this.autoSave(), 300);
  }

  pendingAIJson: any = null;
  areasstring: any = null;
  summarystring: any = null;
  proceduresLoaded = false;

  private extractATCJson(input: string): any | null {
    let searchFrom = 0;

    while (true) {
      const startIdx = input.indexOf('{', searchFrom);
      const endIdx = input.lastIndexOf('}');
      if (startIdx === -1 || startIdx >= endIdx) {
        console.error('Could not find a valid JSON structure.');
        return null;
      }
      const candidate = input.slice(startIdx, endIdx + 1);

      try {
        const parsed = JSON.parse(candidate);
        if (parsed?.ATC_Report) {
          return parsed;
        }
        searchFrom = startIdx + 1;
      } catch (e) {
        try {
          const cleaned = candidate.replace(/\.\.\./g, 'null').replace(/,\s*([\]}])/g, '$1');
          const parsed = JSON.parse(cleaned);
          if (parsed?.ATC_Report) {
            return parsed;
          }

          searchFrom = startIdx + 1;
        } catch {
          searchFrom = startIdx + 1;
        }
      }
      if (searchFrom >= input.length) break;
    }

    return null;
  }

  async ngOnInit(){
    this.unregisterConnectivity = this.connectivity.register(async () => {
      if (!this.autoSaveID) return; // no draft context yet
      await this.autoSave();
    });
    this.route.queryParams.subscribe(async params => {
      if (!params['aigenerated'] || !params['docid']) return;
      const docid = params['docid'];
      const draftRef = doc(this.firestoreATC, 'temporary_ATC', docid);
      const draftSnap = await getDoc(draftRef);

      if (draftSnap.exists()) {
        console.log('Draft exists → loading from temporary_ATC');

        const value = draftSnap.data();

        this.autoSaveID = docid;
        this.aigeneratedEntry = true;  // AI-generated draft entry: lock name, no "open another draft"
        this.participantProfileid = value['profileid'] ?? null;
        this.transcript = value['transcript'] ?? [];
        this.consultationSummary = value['consultationsummary'] ?? null;
        this.consultationpoint = value['consultationpoint'] ?? null;
        this.casenotes = value['notes'] ?? null;
        this.mentornotes = value['mentornotes'] ?? null;

        this.summarystring = value['aiatcsummary'] ?? null;
        this.areasstring = value['areastoexplore'] ?? [];

        this.aiedited = value['aiedited'] ?? true;  // reached via an aigenerated link → AI-edited
        this.aigeneratedsource = value['aigeneratedsource'] ?? null;
        this.aigeneratedid = value['aigeneratedid'] ?? docid;

        console.log('Draft loaded, AI re-parse skipped');
        return;
      }
      console.log('No draft found → parsing AI output');

      // AI source collection: the queue-studio flow stores its AI ATC in
      // queue_atc_generation (its `output` field); the legacy view-ai-generated-atc flow
      // uses ai_generated_atc_summary. Both expose `output` + `profileid`, so the parse
      // below is identical for either source.
      const aiSourceCollection = params['source'] === 'queueatc' ? 'queue_atc_generation' : 'ai_generated_atc_summary';
      const aiRef = doc(this.firestoreATC, aiSourceCollection, docid);
      const aiSnap = await getDoc(aiRef);

      if (!aiSnap.exists()) {
        console.warn('AI source document not found in ' + aiSourceCollection);
        return;
      }

      const data = aiSnap.data();
      const output = data?.['output'];
      if (!output) {
        console.warn('No output field in AI document');
        return;
      }
      // const beforeJsonMatch = output.match(/^[\s\S]*?(?=\{\s*"ATC_Report")/);
      // this.summarystring = beforeJsonMatch ? beforeJsonMatch[0].trim() : null;
      // const jsonStartIndex = output.search(/\{\s*"ATC_Report"/);
      // if (jsonStartIndex === -1) {
      //   console.warn('No ATC_Report JSON found in AI output');
      //   return;
      // }
      // const jsonString = output.substring(jsonStartIndex);
      // let parsedJson;
      // try {
      //   parsedJson = JSON.parse(jsonString);
      // } catch (e) {
      //   console.error('Failed to parse ATC JSON:', e, 'String was:', jsonString.substring(0, 100));
      //   return;
      // }

        const firstBrace = output.indexOf('{');
        this.summarystring = firstBrace > 0 ? output.substring(0, firstBrace).trim() : null;
        const parsedJson = this.extractATCJson(output);

        if (!parsedJson) {
          console.warn('No ATC_Report JSON found in AI output');
          return;
        }

      // const beforeJsonMatch = output.match(/^[\s\S]*?(?=\{)/);
      // this.summarystring = beforeJsonMatch ? beforeJsonMatch[0].trim() : null;

      // const jsonMatch = output.match(/\{[\s\S]*\}/);
      // if (!jsonMatch) {
      //   console.warn('No JSON found in AI output');
      //   return;
      // }

      // const parsedJson = JSON.parse(jsonMatch[0]);

      this.areasstring =
        parsedJson?.ATC_Report?.Areas_that_need_to_be_explored_more ?? [];

      this.participantProfileid = data['profileid'] ?? null;
      this.pendingAIJson = parsedJson;

      this.autoSaveID = docid;
      this.aigeneratedEntry = true;  // AI-generated draft entry: lock name, no "open another draft"
      this.aiedited = true;
      this.aigeneratedsource = aiSourceCollection;
      this.aigeneratedid = docid;

      await setDoc(draftRef, {
        profileid: this.participantProfileid,
        transcript: [],
        aiatcsummary: this.summarystring,
        areastoexplore: this.areasstring,
        delete: false,
        // Mark that this ATC was started from an AI generation (edited-from-AI provenance).
        aiedited: true,
        aigeneratedsource: aiSourceCollection,
        aigeneratedid: docid,
        created: serverTimestamp(),
        lastupdated: serverTimestamp()
      });

      if (this.proceduresLoaded) {
        this.patchAIAdjustments(this.pendingAIJson);
        this.pendingAIJson = null;
      }

      console.log('AI parsed and draft created with SAME docid');
    });

  //     this.route.queryParams.subscribe(params => {
  //       console.log(params['areas'],'console areassss');
  //     if (params['areas']) {
  //       this.areasstring = JSON.parse(decodeURIComponent(params['areas']));
  //     }
  //     if (params['summary']) {
  //       this.summarystring = decodeURIComponent(params['summary']);
  //       console.log('AI pre-analysis text:', this.summarystring);
  //     }
  //   if (params['aigenerated'] && params['json']) {
  //     this.participantProfileid = params['profileid'];
  //     this.pendingAIJson = JSON.parse(decodeURIComponent(params['json']));
  //     console.log('AI JSON stored, waiting for procedures...');
  //   }
  // });
    this.networkStatusService.onlineStatus$.subscribe(status => {
      this.isonline = status
      if(!this.isonline){
        this.pageloadedatfirsttime = true
      }
      // reconnect autosave is handled once by ConnectivityGuardService.register; no duplicate save here
    });
    // Big Assignment
    if(this.bigActivity()){
      this.validationnotrequired = false;
      await getDoc(doc(collection(this.firestoreDefault, 'big participants assignments'),this.participantAssignmentId)).then((bpadoc)=>{
        if(bpadoc.exists() && bpadoc.data()['status'] == 'initiated'){
          updateDoc(bpadoc.ref,{status : 'ongoing'});
        }
      });
    }else {
      this.validationnotrequired = true;
    }
  }

  ngOnDestroy(): void{
    this.profileSubscription?.unsubscribe()
    this.rolesSubscription?.unsubscribe()
    this.recommendationSubscription?.unsubscribe()
    this.procedureSubscription?.unsubscribe()
    this.productSubscription?.unsubscribe()
    this.alphaSubscription?.unsubscribe()
    this.toValidateSubscription?.unsubscribe()

    this.subscriptionHandle.complete();
    this.subscriptionHandle.next();

    this.unregisterConnectivity?.();
  }

  async setupData(){
    try {
      // Fetch Products
      collectionData(query(collection(this.firestoreDefault,"products"), orderBy("atcmodel")), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(products=>{
        for (let i = 0; i < products.length; i++) {
          const productAvailable = products[i]
          this.mapProductidtoatcmodel[productAvailable['id']] = productAvailable['atcmodel']
        }
      })
      collectionData(query(collection(this.firestoreDefault, "atc model"), orderBy("atcmodel")), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(products=>{
        this.productAvailable = products.filter(e => (e["atcmodel"] ?? "").trim().length != 0)
        this.productLists = Array.from(new Map(this.productAvailable.map(item => [item["atcmodel"], item])).values());
      })

      // Fetch User Roles
      collectionData(query(collection(this.firestoreDefault, 'users_roles'), orderBy('name')), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(userRoles=>{
        var usersWithRoles = []
        var mentor = []
        var profileList = []
        for (let i = 0; i < userRoles.length; i++) {
          const userData = userRoles[i];
          this.mapProfile[userData["profile_ref"].id] = userData
          profileList.push({
            profileid: userData["profile_ref"].id,
            name: userData["name"]
          })
          if(userData['changeagent'] == true || userData['eis'] == true || userData['admin'] == true || userData['ah'] == true || userData['mentor'] == true){
            usersWithRoles.push({
              authorname : userData["name"],
              authorpath: userData["profile_ref"]["path"],
            })
          }
          if(userData['mentor'] == true){
            mentor.push({
              authorname : userData["name"],
              authorpath: userData["profile_ref"]["path"],
            })
          }
        }
        this.specialistList = usersWithRoles
        this.mentorNameList = mentor
        this.profileList = profileList
        console.log("Specialists loaded")
      })

      // Procedure Recommendation
      collectionSnapshots(query(collection(this.firestoreDefault, "procedure_recommend"), orderBy('name'))).pipe(takeUntil(this.subscriptionHandle)).subscribe(names=>{
        var list = [];
        names.forEach(type=>{
          list.push({
            name: type.data()["name"],
            path: type.ref.path
          })
        })
        this.recommendlist = list
        console.log("Recommendation loaded")
      })

      // Fetch changeworks
      collectionSnapshots(query(collection(this.firestoreDefault,"procedures"),orderBy("name"))).pipe(takeUntil(this.subscriptionHandle)).subscribe(procedureList=>{
      // this.procedureSubscription = this.firestore.collection("procedures", ref=>ref.orderBy("name")).snapshotChanges().subscribe(procedureList=>{
        var list = []
        for (let i = 0; i < procedureList.length; i++) {
          var procedure = procedureList[i]
          var procedureData = procedure.data()
          this.procedureMap[procedure.id] = procedureData["name"]
          list.push({
            procedurepath : procedure.ref.path,
            procedurename : procedureData["name"]
          })
        }
        this.procedurelist = list
        this.proceduresLoaded = true;
        console.log("Procedures loaded")
        if (this.pendingAIJson) {
          this.patchAIAdjustments(this.pendingAIJson);
          this.pendingAIJson = null;
        }
      })

      // Big Activity
      getDocs(query(collection(this.firestoreDefault, "bigactivity"), orderBy("activity"))).then(activityList=>{
        for (let i = 0; i < activityList.docs.length; i++) {
          const activityDoc = activityList.docs[i];
          var activityData = activityDoc.data()
          var atcProperty = activityData["atcproperty"]
          this.bigActivityList.push(activityData)
          if(atcProperty == "author"){
            this.bigActivityAuthor.push(activityData)
          }
          else if(atcProperty == "observer"){
            this.bigActivityObserver.push(activityData)
          }
          else if(atcProperty == "assigned_to"){
            this.bigActivityAssignedto.push(activityData)
          }
          else if(atcProperty == "mentoring"){
            this.bigActivityMentor.push(activityData)
          }
          else {
            this.bigActivityAdditional.push(activityData)
          }
        }

        // Author Property
        this.bigActivityAuthor.forEach(activity=>{
          this.authorMap[activity["docid"]] = []
        })
        // Oberser Property
        this.bigActivityObserver.forEach(activity=>{
          this.observerMap[activity["docid"]] = []
        })
        // Mentor
        this.bigActivityMentor.forEach(activity=>{
          this.mentorMap[activity["docid"]] = []
        })
      })

      // Check if inside a Queue
      await getDocs(query(collection(this.firestoreDefault,'queue generation'),where("queueenddate", ">=", new Date()))).then(async queuesnap=>{
        var ongoingQueueList = queuesnap.docs.map(e => e.data()).filter(e => e["queuestartdate"].toDate() < new Date())
        var queueref = ongoingQueueList.map(e => doc(this.firestoreDefault, 'queue generation', e["docid"]))
        if(queueref.length != 0){
          await getDocs(query(collection(this.firestoreDefault, "queue studio pairing"), where("queueref", "in", queueref),where("participants", "array-contains", this.loggedinProfileid),where("checkin", "==", true),where("studioin", "==", true))).then(pairing=>{
            if(pairing.size != 0){
              this.ongoingQueue = ongoingQueueList.find(e => e["docid"] == pairing.docs[0].data()["queueref"].id) ?? null
              if(this.ongoingQueue != null) this.arenamode = true
            }
          })
        }
        console.log("Ongoing Queue", this.ongoingQueue, queueref)

      });
    } catch (error) {
      console.log(error)
    }
  }

  addAdditionalActivity(){
    this.additionalActivityMap.push({
      activity: null,
      specialist: []
    })
  }

  removeAdditionalActivity(index){
    this.additionalActivityMap.splice(index, 1)
  }

  copyToClipboard(){
    var hostname = window.location.origin
    var url = hostname + "/liveprescription/" + this.autoSaveID
    this.clipboard.copy(url)
  }

  onProductSelect(){
    console.log("Selected Product", this.product)
    if(!this.assignmentInitiated){
      var selectedIndex = this.productAvailable.findIndex(e => e["atcmodel"] == this.product && e["directive"] != null)
      if(selectedIndex != -1){
        var givenDirective = (this.productAvailable[selectedIndex]["directive"] ?? "").trim()
        this.atcdirective = givenDirective.length == 0 ? null : givenDirective
      }
      else{
        this.atcdirective = null
      }
    }
  }

  onObserverSelect(){
    var observerPath = []
    Object.keys(this.observerMap).forEach(item=>{
      observerPath = [...observerPath, ...(this.observerMap[item] ?? [])]
    })
    this.mentorOption = Array.from(new Set([...this.relatedATCauthor, ...observerPath.map(e => doc(this.firestoreDefault,e).id)]))
  }

  editDirective(){
    var dialogRef = this.matDialog.open(UpdateDialogComponent, {
      autoFocus: false,
      data: this.atcdirective,
      disableClose: true,
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
      if(result != null){
        if(result.toString().trim().length != 0){
          this.atcdirective = result
          this.autoSave()
        }
      }
    })
  }

  onMenteeSelect(value, id){
    if(value){
      this.mentee.push(id)
    }
    else{
      var index = this.mentee.findIndex(e => e == id)
      if(index != -1){
        this.mentee.splice(index, 1)
      }
    }
    console.log(value, "Mentee", this.mentee)
  }

  addDirective(){
    this.atcAssignment.push({
      directive: null,
      assignedto: [],
      activity: null
    })
  }

  removeDirective(index){
    this.atcAssignment.splice(index, 1)
  }

  availableProfileList(): Array<any>{
    var person = this.profileList.filter(e=>e.name.toLowerCase().includes(this.filteredProfile.toLowerCase()))
    return person;
  }

  availableSpecialistList(): Array<any>{
    var person = this.specialistList.filter(e=>e.authorname.toLowerCase().includes(this.filteredSpecialist.toLowerCase()))
    return person;
  }

  availableMentorList(): Array<any>{
    var person = this.mentorNameList.filter(e=>e.authorname.toLowerCase().includes(this.filteredSpecialist.toLowerCase()))
    return person;
  }

  async onProfileSelect(){
    console.log("Selected Profile", this.participantProfileid)
    this.selectedParticipantProfile = {}
    if(this.participantProfileid){
      getDoc(doc(this.firestoreDefault, "profile_data",this.participantProfileid)).then(profile =>{
        if(profile.exists()){
          this.selectedParticipantProfile = profile.data()
        }
      })
    }
    if(this.ongoingQueue != null){
      console.log(this.ongoingQueue);

      // var atcstudio = ["diagnostics", "consultation", "ah", "validation"]
      var atcWidget = ["addunvalidatedatc", "addvalidatedatc"]
      var atcActivityStage = []
      Object.keys(this.ongoingQueue["stageproperty"] ?? {}).forEach(key=>{
        var studiowidgets = this.ongoingQueue["stageproperty"][key]["studiowidgets"] ?? []
        if(studiowidgets.some(e => atcWidget.includes(e))){
          atcActivityStage.push(key)
        }
      })
      console.log(atcActivityStage)
      getDocs(query(collection(this.firestoreDefault,"live assignment"),where("queueid", "==", this.ongoingQueue["docid"]),where("participantid", "==", this.participantProfileid),where('pairing', 'array-contains', this.loggedinProfileid),orderBy("created", "desc"))).then(async (studio) =>{
        var live = studio.docs.filter(e => e.data()["status"] == "recording" || e.data()["status"] == "live")
        var atcStudio = null
        if(live.length != 0){
          atcStudio = live[0]
        }
        else{
          var lastStudio = studio.docs.filter(e => atcActivityStage.includes(e.data()["stagename"]))
          if(lastStudio.length != 0){
            atcStudio = lastStudio[0]
          }
        }
        if(atcStudio != null){
          this.liveassignmentid = atcStudio.id
          this.liveassignmentdata = atcStudio.data()
          console.log("Live assignment", this.liveassignmentdata)
          this.stagename = this.liveassignmentdata['stagename']
          this.queueid = this.ongoingQueue["docid"]
          this.validationnotrequired = this.mentor || this.queryparam["validation"] == "true" // this.liveassignmentdata['stagetype'] == 'consultation' || this.liveassignmentdata['stagetype'] == 'ah' || (this.ongoingQueue["isconsultationrequired"] ?? []).length == 0
          getDocs(query(collection(this.firestoreDefault,"queue stage log"), where("liveassignmentid", "==", this.liveassignmentid),limit(1))).then(queuetoken=>{
            console.log("queue Token", queuetoken.size)
            console.log("Live Assignment", this.liveassignmentdata)
            if(queuetoken.size != 0){
              var token = queuetoken.docs[0].data()
              this.tokendata = token
              this.product = this.mapProductidtoatcmodel[token['productref']?.id] ?? null
              console.log(this.mapProductidtoatcmodel)
              console.log("Mapped Product", this.product, token['productref']?.id)
              console.log("Token data", this.tokendata)

              // display clips
              if(this.liveassignmentdata['cliptimings']){
                this.liveassignmentdata['cliptimings'].forEach(timing => {
                  const assignmentData: AssignmentData = {
                    clipurl: timing.clipurl,
                    capturedby: timing.capturedby,
                    timestamp: timing.timestamp,
                  };
                  this.data.push(assignmentData);
                  console.log(this.data);

                });
              }
              // display clips

              var authorParameter = this.bigActivityAuthor.map(e => e["docid"])
              var observerParameter = this.bigActivityObserver.map(e => e["docid"])
              var mentorParameter = this.bigActivityMentor.map(e => e["docid"])
              console.log(authorParameter, observerParameter, mentorParameter)
              var authorValue = {}
              var observerValue = {}
              var mentorValue = {}
              var otherValue = {}
              Object.entries<any>(this.liveassignmentdata["participantsactivity"] ?? {}).forEach(([key, value])=>{
                if(authorParameter.includes(value)){
                  authorValue[value] = this.authorMap[value] ?? []
                  authorValue[value].push("profile_data/"+key)
                }
                else if(observerParameter.includes(value)){
                  observerValue[value] = this.observerMap[value] ?? []
                  observerValue[value].push("profile_data/"+key)
                }
                else if(mentorParameter.includes(value)){
                  mentorValue[value] = this.mentorMap[value] ?? []
                  mentorValue[value].push("profile_data/"+key)
                }
                else{
                  otherValue[value] = otherValue[value] ?? []
                  otherValue[value].push("profile_data/"+key)
                }
              })
              Object.entries<any>(this.liveassignmentdata["bonusactivity"] ?? {}).forEach(([key, value])=>{
                if(authorParameter.includes(value)){
                  authorValue[value] = this.authorMap[value] ?? []
                  authorValue[value].push("profile_data/"+key)
                }
                else if(observerParameter.includes(value)){
                  observerValue[value] = this.observerMap[value] ?? []
                  observerValue[value].push("profile_data/"+key)
                }
                else if(mentorParameter.includes(value)){
                  mentorValue[value] = this.mentorMap[value] ?? []
                  mentorValue[value].push("profile_data/"+key)
                }
                else{
                  otherValue[value] = otherValue[value] ?? []
                  otherValue[value].push("profile_data/"+key)
                }
              })
              this.authorMap = authorValue
              this.observerMap = observerValue
              this.mentorMap = mentorValue
              Object.keys(otherValue).forEach(key=>{
                this.additionalActivityMap.push({
                  activity: key,
                  specialist: otherValue[key]
                })
              })
              console.log(this.authorMap, this.observerMap, this.mentorMap, this.additionalActivityMap)
              this.onObserverSelect()
              console.log(this.authorMap, this.observerMap, this.mentorMap, this.additionalActivityMap)

            }
            else{
              this.tokendata = null
            }
          })


        }
        else{
          this.liveassignmentid = null
          this.stagename = null
          this.queueid = null
          this.alphaATClist = []
          this.atctoValidateList = []
          this.mergeATC = []
          this.arenamode = false
          this.liveassignmentdata = null
          this.tokendata = null
          alert(`You are currently active in the Queue ${this.ongoingQueue['queuename']}. But there is no record of you having a session with ${this.mapProfile[this.participantProfileid]['name']}. You can still submit this ATC independently or choose other participant who you have worked with in this queue.`)
        }
      }).catch(e =>{
        console.log(e)
      })
    }
    this.getATCoptions()
  }



  async getATCoptions(){
    console.log("ATC Draft")
    this.draftStatus = {
      message: "Draft not saved yet.",
      code: 0
    }
    this.lastDraftSavedOn = null
    var draftATC = []
    // push any drafts that never reached the server (e.g. saved offline) before reading the list
    await this.draftService.flushDirty(this.firestoreATC)
    if (this.developer || this.admin) {
      const q = query(
        collection(this.firestoreATC, 'temporary_ATC'),
        where('profileid', '==', this.participantProfileid),
        where('delete', '==', false)
      );
      // local-first list: bounded server query merged with any unsynced local drafts; local-only if unreachable
      draftATC = await this.draftService.listDrafts('temporary_ATC', q, 
        d => d['profileid'] === this.participantProfileid && d['delete'] !== true
      );
    } else {
      const q = query(
        collection(this.firestoreATC, 'temporary_ATC'),
        where('profileid', '==', this.participantProfileid),
        where('delete', '==', false),
        where('authorprofileid', 'array-contains', this.loggedinProfileid)
      );
      // local-first list: bounded server query merged with any unsynced local drafts; local-only if unreachable
      draftATC = await this.draftService.listDrafts('temporary_ATC', q,
        d => d['profileid'] === this.participantProfileid && d['delete'] !== true && (d['authorprofileid'] || []).includes(this.loggedinProfileid)
      );
    }
    console.log(draftATC.map(e => e.ref.path))
    this.existingDraftIds = draftATC.map(e => e.id)  // remember this participant's existing draft ids
    this.autoSaveID = this.guardservice.generateId(this.firestoreATC, "temporary_ATC")
    if(draftATC.length != 0){
      var dialogRef = this.matDialog.open(AtcOptionComponent, {
        data:{
          drafts: draftATC,
          assignments : [],
          initiated: [],
          mapProfile: this.mapProfile
        },
        autoFocus: false,
        maxHeight: "90vh",
        disableClose: true
      })
      dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async selectedATC=>{
        if(selectedATC != null){
          var atc = selectedATC
          if(atc["type"] == "draft"){
            this.autoSaveID = atc["doc"].id
            // local-first open: render whatever we have without blocking; reconcile against a bounded server fetch
            // (clean → adopt; local-ahead → keep local; divergence → user picks, loser archived). Falls back to local.
            const value = (await this.draftService.openDraft(this.firestoreATC, 'temporary_ATC', this.autoSaveID, (mine, theirs) => this.openConflictDialog(mine, theirs))) ?? atc["doc"].data()
            this.applyDraftValue(value)
            this.draftStatus = { message: "Loading media...", code: 0 }
            await this.reloadDraftMedia()
            this.draftStatus = { message: "ATC Draft Imported Successfully.", code: 1 }
          }
        }
      })
    }
  }

  async loadAudioFromURLs(audioURLs: string[]) {
    this.audioBlobURL = [];
    this.audioBlob = [];

    // load sequentially so the arrays stay index-aligned with existingAudioURLs
    for (let index = 0; index < audioURLs.length; index++) {
      const url = audioURLs[index];
      // always keep the uploaded audio (plays from the URL when online); placeholder keeps alignment if offline
      this.audioBlobURL.push(url);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
        this.audioBlob.push(await response.blob());
      } catch (error) {
        console.warn(`Audio ${index + 1} kept by URL (not fetched, offline?):`, url);
        this.audioBlob.push(null);
      }
    }
  }

  // Load Note Images from URLs
  async loadNoteImagesFromURLs(imageURLs: string[]) {
    this.selectedNoteImages = [];
    this.previewNoteImages = [];

    // load sequentially so the arrays stay index-aligned with existingNoteImageURLs
    for (let index = 0; index < imageURLs.length; index++) {
      const url = imageURLs[index];
      // always keep the uploaded image (shows from the URL when online); placeholder keeps alignment if offline
      this.previewNoteImages.push(url);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const blob = await response.blob();
        this.selectedNoteImages.push(new File([blob], `image_${index}.jpg`, { type: blob.type }));
      } catch (error) {
        console.warn(`Note image ${index + 1} kept by URL (not fetched, offline?):`, url);
        this.selectedNoteImages.push(null);
      }
    }
  }

  // Load ATC Images from URLs
  async loadATCImagesFromURLs(imageURLs: string[]) {
    this.selectedATCImages = [];
    this.previewATCImages = [];

    // load sequentially so the arrays stay index-aligned with existingATCImageURLs
    for (let index = 0; index < imageURLs.length; index++) {
      const url = imageURLs[index];
      // always keep the uploaded image (shows from the URL when online); placeholder keeps alignment if offline
      this.previewATCImages.push(url);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const blob = await response.blob();
        this.selectedATCImages.push(new File([blob], `atc_image_${index}.jpg`, { type: blob.type }));
      } catch (error) {
        console.warn(`ATC image ${index + 1} kept by URL (not fetched, offline?):`, url);
        this.selectedATCImages.push(null);
      }
    }
  }



  compareFnc(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.value === c2.value : c1 === c2;
  }

  async getDirectiveAssignments(profilemap){
    console.log("ATC Assignments")
    const q = query(collection(this.firestoreDefault, 'atc assignment'), where("assignedto","array-contains",this.loggedinProfileid), where("status", "==", 'initiated'))
    var atcassignment = (await getDocs(q)).docs;
    if(atcassignment.length != 0){
      var dialogRef = this.matDialog.open(AtcOptionComponent, {
        data:{
          drafts: [],
          assignments : atcassignment,
          initiated: [],
          mapProfile:profilemap
        },
        autoFocus: false,
        maxHeight: "90vh",
        disableClose: true
      })
      dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(selectedATC=>{
        if(selectedATC != null){
          var atc = selectedATC
          if(atc["type"] == "assignment"){
            var value = atc["doc"].data()
            this.date = new Date()
            this.atcdirective = value['directive']
            this.participantProfileid = value['profileid']
            this.authorMap[value["activity"]] = value['assignedto'].map(e => doc(this.firestoreDefault, "profile_data", e).path)
            // this.author = value['assignedto'].map(e => this.firestore.collection("profile_data").doc(e).ref.path)
            this.directiveMentor = value['author']
            this.assignmentInitiated = true
            this.directiveAssignmentRef = atc["doc"].ref
            this.validationnotrequired = false
            this.getATCoptions()
          }
        }
      })
    }
  }

  async uploadAudioToStorage(): Promise<string[]> {
    if (this.audioBlob.length === 0) {
      return this.existingAudioURLs || [];
    }

    console.log(this.audioBlob, 'this.audioBlob');
    this.uploadProgress.audio = 0;

    const allURLs: string[] = [];
    let uploadedCount = 0;
    let skippedCount = 0;

    for (let index = 0; index < this.audioBlob.length; index++) {
      const blob = this.audioBlob[index];

      // Check if this audio already has a URL
      if (this.existingAudioURLs[index]) {
        console.log(`Audio ${index} already uploaded, skipping:`, this.existingAudioURLs[index]);
        allURLs.push(this.existingAudioURLs[index]);
        skippedCount++;

        // Update progress for skipped files
        this.uploadProgress.audio = Math.round(((skippedCount + uploadedCount) / this.audioBlob.length) * 100);
        continue;
      }

      // Upload new audio
      var audioID = this.audioBlobURL[index].split('/');
      console.log(index, audioID);

      const storageRef = ref(
        this.storage,
        "ATC_Audio_Notes/" + this.loggedinProfileid + '/' + "Audio - " + (index+1).toString() + " " + audioID[audioID.length-1]
      );

      try {
        const uploadTask = uploadBytesResumable(storageRef, blob);

        const downloadURL = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              this.uploadProgress.audio = Math.round(
                ((skippedCount + uploadedCount + progress/100) / this.audioBlob.length) * 100
              );
              console.log(`Audio ${index} upload progress: ${progress}%`);
            },
            (error) => {
              console.error(`Error uploading audio ${index}:`, error);
              reject(error);
            },
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              console.log(`Audio ${index} uploaded successfully:`, url);
              resolve(url);
            }
          );
        });

        allURLs.push(downloadURL);
        this.existingAudioURLs[index] = downloadURL; // Store for future saves
        uploadedCount++;

      } catch (error) {
        console.error(`Error uploading audio ${index}:`, error);
        throw error;
      }
    }

    this.uploadProgress.audio = 100;
    return allURLs;
  }

  // Upload notes images
  async uploadNotesImageToStorage(): Promise<string[]> {
    if (this.selectedNoteImages.length === 0) {
      return this.existingNoteImageURLs || [];
    }

    this.uploadProgress.noteImages = 0;

    const allURLs: (string | null)[] = [];
    let uploadedCount = 0;
    let skippedCount = 0;

    for (let index = 0; index < this.selectedNoteImages.length; index++) {
      const imageFile = this.selectedNoteImages[index];

      // Check if this image already has a URL
      if (this.existingNoteImageURLs[index]) {
        console.log(`Note image ${index} already uploaded, skipping:`, this.existingNoteImageURLs[index]);
        allURLs.push(this.existingNoteImageURLs[index]);
        skippedCount++;

        // Update progress for skipped files
        this.uploadProgress.noteImages = Math.round(((skippedCount + uploadedCount) / this.selectedNoteImages.length) * 100);
        continue;
      }

      // Upload new image
      const imageRef = ref(
        this.storage,
        "Uploaded ATC/" + imageFile.name + imageFile.lastModified + imageFile.size
      );

      try {
        const uploadTask = uploadBytesResumable(imageRef, imageFile);

        const imageURL = await new Promise<string | null>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              this.uploadProgress.noteImages = Math.round(
                ((skippedCount + uploadedCount + progress/100) / this.selectedNoteImages.length) * 100
              );
              console.log(`Note image ${index} upload progress: ${progress}%`);
            },
            (error) => {
              console.error(`Error uploading note image ${index}:`, error);
              resolve(null);
            },
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              console.log(`Note image ${index} uploaded successfully:`, url);
              resolve(url);
            }
          );
        });

        allURLs.push(imageURL);
        if (imageURL) {
          this.existingNoteImageURLs[index] = imageURL; // Store for future saves
        }
        uploadedCount++;

      } catch (err) {
        console.log(err);
        allURLs.push(null);
      }
    }

    this.uploadProgress.noteImages = 100;
    return allURLs.filter(url => url !== null) as string[];
  }

  // Upload ATC images
  async uploadATCImageToStorage(): Promise<string[]> {
    if (this.selectedATCImages.length === 0) {
      return this.existingATCImageURLs || [];
    }

    this.uploadProgress.atcImages = 0;

    const allURLs: (string | null)[] = [];
    let uploadedCount = 0;
    let skippedCount = 0;

    for (let index = 0; index < this.selectedATCImages.length; index++) {
      const imageFile = this.selectedATCImages[index];

      // Check if this image already has a URL
      if (this.existingATCImageURLs[index]) {
        console.log(`ATC image ${index} already uploaded, skipping:`, this.existingATCImageURLs[index]);
        allURLs.push(this.existingATCImageURLs[index]);
        skippedCount++;

        // Update progress for skipped files
        this.uploadProgress.atcImages = Math.round(((skippedCount + uploadedCount) / this.selectedATCImages.length) * 100);
        continue;
      }

      // Upload new image
      const storageRef = ref(
        this.storage,
        "Online ATC Images/" + imageFile.name + imageFile.lastModified + imageFile.size
      );

      try {
        const uploadTask = uploadBytesResumable(storageRef, imageFile);

        const imageURL = await new Promise<string | null>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              this.uploadProgress.atcImages = Math.round(
                ((skippedCount + uploadedCount + progress/100) / this.selectedATCImages.length) * 100
              );
              console.log(`ATC image ${index} upload progress: ${progress}%`);
            },
            (error) => {
              console.error(`Error uploading ATC image ${index}:`, error);
              resolve(null);
            },
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              console.log(`ATC image ${index} uploaded successfully:`, url);
              resolve(url);
            }
          );
        });

        allURLs.push(imageURL);
        if (imageURL) {
          this.existingATCImageURLs[index] = imageURL; // Store for future saves
        }
        uploadedCount++;

      } catch (err) {
        console.log(err);
        allURLs.push(null);
      }
    }

    this.uploadProgress.atcImages = 100;
    return allURLs.filter(url => url !== null) as string[];
  }


  // serialize draft saves so concurrent autosaves cannot overwrite each other
  private autoSaveInFlight: Promise<void> | null = null;

  async autoSave() {
    // chain each save after the previous one so writes stay in order
    this.autoSaveInFlight = (this.autoSaveInFlight ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.runAutoSave());
    return this.autoSaveInFlight;
  }

  async runAutoSave() {
    this.filteredSpecialist = "";
    try {
      if (this.autoSaveID != null) {
        this.uploadProgress.isUploading = true;
        this.draftStatus = {
          message: "Saving to Draft...",
          code: 0
        };

        // keep a durable local copy of any not-yet-uploaded media (survives offline + app close)
        await this.mediaCache.replaceDraft(this.autoSaveID, this.collectLocalMedia());

        console.log(this.date);
        var authorprofileid = [];
        Object.values<any>(this.authorMap ?? {}).forEach(value => {
          if (value) {
            // guard each path so a malformed ref can't throw and abort the whole draft save
            var id = (value ?? []).map(e => {
              try { return doc(this.firestoreDefault, e).id; }
              catch { return null; }
            }).filter(id => id != null);
            authorprofileid = [...authorprofileid, ...id];
          }
        });

        if (authorprofileid.length == 0) authorprofileid = [this.loggedinProfileid];

        // build the draft with the media URLs we already have; new media is uploaded after the text is saved
        var data = {
          date: this.datepipe.transform(this.date, "yyyy-MM-dd"),
          product: this.product,
          atcdirective: this.atcdirective,
          profileid: this.participantProfileid,
          author: this.authorMap ?? {},
          observer: this.observerMap ?? {},
          mentor: this.mentorMap ?? {},
          additionalactivity: this.additionalActivityMap,
          transcript: this.transcript ?? [],
          accountuid: this.loggedinUser,
          accountpid: this.loggedinProfileid,
          consultationsummary: this.consultationSummary ?? null,
          consultationpoint: this.consultationpoint ?? null,
          notes: this.casenotes ?? null,
          mentornotes: this.mentornotes ?? null,
          atcassignment: this.atcAssignment ?? [],
          audioRecordings: this.existingAudioURLs ?? [],
          noteImageURLs: this.existingNoteImageURLs ?? [],
          atcImageURLs: this.existingATCImageURLs ?? [],
          delete: false,
          authorprofileid: authorprofileid,
          lastupdated: new Date(),       // client time (was serverTimestamp) so the draft is durable in the local outbox + REST fallback
          aiatcsummary:this.summarystring ?? '',
          areastoexplore:this.areasstring ?? '',
          // preserve "edited from AI generation" provenance across autosaves (each sync overwrites the doc)
          aiedited: this.aiedited ?? false,
          aigeneratedsource: this.aigeneratedsource ?? null,
          aigeneratedid: this.aigeneratedid ?? null,
        };

        // local-first: durable local write (never lost), then push to Firestore inside a rev-checked transaction.
        // A second device's edit is detected as a 'conflict' and surfaced on reopen — never silently overwritten.
        await this.draftService.saveLocal('temporary_ATC', this.autoSaveID, data);
        const res = await this.draftService.sync(this.firestoreATC, 'temporary_ATC', this.autoSaveID);
        this.draftStatus = this.draftService.statusFor(res.outcome);
        this.lastDraftSavedOn = new Date();

        // a divergence was detected (this device AND another both changed since the last sync) — surface it NOW
        // (this also covers reconnect, which re-runs autosave): re-fetch, let the user pick, re-hydrate. Never clobbers.
        if (res.outcome === 'conflict') {
          await this.reconcileOpenDraft();
        }

        // upload media only when we actually reached the server with a clean result; otherwise it stays cached
        if (navigator.onLine && (res.outcome === 'created' || res.outcome === 'updated' || res.outcome === 'unchanged' || res.outcome === 'took-remote')) {
          try {
            const [audioURLs, noteImageURLs, atcImageURLs] = await Promise.all([
              this.uploadAudioToStorage(),
              this.uploadNotesImageToStorage(),
              this.uploadATCImageToStorage()
            ]);

            this.audiolist = audioURLs;
            this.imagelist = noteImageURLs;
            this.atcImageURL = atcImageURLs;
            this.existingAudioURLs = audioURLs;
            this.existingNoteImageURLs = noteImageURLs;
            this.existingATCImageURLs = atcImageURLs;

            // patch the uploaded media URLs into the saved draft
            await updateDoc(doc(this.firestoreATC, 'temporary_ATC', this.autoSaveID), {
              audioRecordings: audioURLs,
              noteImageURLs: noteImageURLs,
              atcImageURLs: atcImageURLs
            });
            // all media uploaded — drop the local copies
            await this.mediaCache.deleteByDraft(this.autoSaveID);
          } catch (mediaErr) {
            console.warn("Media upload deferred, will retry:", mediaErr);
          }
        }

        this.uploadProgress.isUploading = false;

      }
    } catch (error) {
      console.error("Error in autoSave:", error);
      // honest message: a genuine offline state vs. anything else (incl. the SDK assertion) — never the false "network" claim
      this.draftStatus = navigator.onLine
        ? { message: "Could not save the draft just now — your changes are kept on this device and will retry.", code: -1 }
        : { message: "Saved on this device — will sync when online.", code: 1 };
      this.uploadProgress.isUploading = false;
    }
  }




  // re-open the draft picker for the same participant after flushing the current draft
  async openAnotherDraft(){
    await this.autoSave();
    this.getATCoptions();
  }

  // open a fresh prescribe-atc screen in a new browser tab to start a new ATC
  createNewATC(){
    window.open(window.location.origin + window.location.pathname, '_blank');
  }

  // true when the participant has at least one draft other than the one currently open
  get hasOtherDrafts(): boolean {
    return this.existingDraftIds.some(id => id !== this.autoSaveID);
  }

  // guards re-entrancy while a conflict dialog is open (so autosave doesn't open a second dialog or loop)
  private resolvingConflict = false;

  // map a draft document (server, local, or a conflict winner) onto the form fields. Reused on open AND after a resolve.
  private applyDraftValue(value: any) {
    this.date = value['date']
    this.product = value['product']
    this.atcdirective = value['atcdirective'] ?? null
    this.participantProfileid = value['profileid']
    this.authorMap = value['author'] ?? {}
    this.additionalActivityMap = value["additionalactivity"] ?? []
    this.observerMap = value['observer'] ?? {}
    this.mentorMap = value['mentor'] ?? {}
    this.transcript = value['transcript'] ?? []
    this.atcAssignment = value['atcassignment'] ?? []
    // Notes
    this.consultationSummary = value['consultationsummary'] ?? null
    this.consultationpoint = value['consultationpoint'] ?? null
    this.casenotes = value['notes'] ?? null
    this.mentornotes = value['mentornotes'] ?? null
    // Carry the "edited from AI generation" provenance through to submit.
    this.aiedited = value['aiedited'] ?? false
    this.aigeneratedsource = value['aigeneratedsource'] ?? null
    this.aigeneratedid = value['aigeneratedid'] ?? null
    for (let i = 0; i < this.transcript.length; i++) {
      this.transcript[i]['awareness'] = this.transcript[i]['awareness'] ?? null
      this.transcript[i]['potentialyears'] = this.transcript[i]['potentialyears'] ?? null
    }
    // media URL arrays the draft already has (uploaded earlier)
    this.existingAudioURLs = value['audioRecordings'] || [];
    this.existingNoteImageURLs = value['noteImageURLs'] || [];
    this.existingATCImageURLs = value['atcImageURLs'] || [];
    this.imagelist = [...this.existingNoteImageURLs];
    this.atcImageURL = [...this.existingATCImageURLs];
    if (value["lastupdated"]) {
      // lastupdated may be a Firestore Timestamp (server read) or a JS Date (local cache) — handle both
      this.lastDraftSavedOn = this.toJsDate(value["lastupdated"])
    }
  }

  // (re)load uploaded media from URLs and re-attach offline-captured media for the current draft. Used on open + resolve.
  private async reloadDraftMedia() {
    try {
      await this.loadAudioFromURLs(this.existingAudioURLs);
      await this.loadNoteImagesFromURLs(this.existingNoteImageURLs);
      await this.loadATCImagesFromURLs(this.existingATCImageURLs);
    } catch (error) {
      console.warn("Some media could not be loaded (kept by URL):", error);
    }
    const pendingMedia = await this.mediaCache.listByDraft(this.autoSaveID);
    this.reattachPendingMedia(pendingMedia);
    // upload offline-captured media now if we're back online (but not mid conflict-resolve, to avoid a loop)
    if (pendingMedia.length && navigator.onLine && !this.resolvingConflict) this.autoSave();
  }

  // reconcile the CURRENTLY-OPEN draft against the server (fired when autosave/reconnect detects a 'conflict'):
  // re-fetch (bounded), let the user pick on a true divergence, then re-hydrate the winner. Re-entrancy-guarded.
  private async reconcileOpenDraft() {
    if (this.autoSaveID == null || this.resolvingConflict) return;
    this.resolvingConflict = true;
    try {
      const value = await this.draftService.openDraft(this.firestoreATC, 'temporary_ATC', this.autoSaveID, (mine, theirs) => this.openConflictDialog(mine, theirs));
      if (value) { this.applyDraftValue(value); await this.reloadDraftMedia(); }
    } finally {
      this.resolvingConflict = false;
    }
  }

  // ask the user which version to keep when the same draft diverged across two devices (default to this device's
  // copy if dismissed — the rejected side is archived by ATCDraftService either way, so nothing is ever lost)
  private openConflictDialog(mine: any, theirs: any): Promise<'mine' | 'theirs'> {
    // build the name lookups the dialog needs from the lists the parent already loaded (offline-safe, no reads):
    // recommended_to → procedure_recommend (recommendlist), assigned agents → profile paths (specialist/mentor lists)
    const recommendMap: Record<string, string> = {};
    (this.recommendlist ?? []).forEach((r: any) => { if (r?.path) recommendMap[r.path] = r.name; });
    const agentMap: Record<string, string> = {};
    [...(this.specialistList ?? []), ...(this.mentorNameList ?? [])].forEach((s: any) => { if (s?.authorpath) agentMap[s.authorpath] = s.authorname; });
    const ref = this.matDialog.open(DraftConflictDialogComponent, {
      data: { mine, theirs, recommendMap, agentMap, procedureMap: this.procedureMap },
      autoFocus: false, disableClose: true, width: '90vw', maxWidth: '960px'
    });
    return ref.afterClosed().toPromise().then(choice => (choice === 'theirs' ? 'theirs' : 'mine'));
  }

  // lastupdated may arrive as a Firestore Timestamp (server read) or a JS Date (local cache) — normalise to a Date
  private toJsDate(v: any): Date | null {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // collect media blobs that haven't been uploaded yet (for durable offline storage)
  private collectLocalMedia(): PendingMedia[] {
    const records: PendingMedia[] = [];
    (this.audioBlob ?? []).forEach((blob, i) => {
      if (blob && !this.existingAudioURLs[i]) {
        records.push({ id: `${this.autoSaveID}-audio-${i}`, draftId: this.autoSaveID, kind: 'audio', blob, name: 'audio-' + i });
      }
    });
    (this.selectedNoteImages ?? []).forEach((file, i) => {
      if (file && !this.existingNoteImageURLs[i]) {
        records.push({ id: `${this.autoSaveID}-note-${i}`, draftId: this.autoSaveID, kind: 'note', blob: file, name: file.name });
      }
    });
    (this.selectedATCImages ?? []).forEach((file, i) => {
      if (file && !this.existingATCImageURLs[i]) {
        records.push({ id: `${this.autoSaveID}-atc-${i}`, draftId: this.autoSaveID, kind: 'atc', blob: file, name: file.name });
      }
    });
    return records;
  }

  // re-attach media captured offline (not yet uploaded) when a draft is reopened, so it shows and uploads later
  private reattachPendingMedia(records: PendingMedia[]) {
    records.forEach(r => {
      if (r.kind === 'audio') {
        this.audioBlob.push(r.blob);
        this.audioBlobURL.push(URL.createObjectURL(r.blob));
      } else if (r.kind === 'note') {
        this.selectedNoteImages.push(new File([r.blob], r.name, { type: r.blob.type }));
        this.previewNoteImages.push(URL.createObjectURL(r.blob));
      } else {
        this.selectedATCImages.push(new File([r.blob], r.name, { type: r.blob.type }));
        this.previewATCImages.push(URL.createObjectURL(r.blob));
      }
    });
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.transcript, event.previousIndex, event.currentIndex);
  }

  addNewAdjustment(){
    var adjProperty = this.transcript[this.transcript.length-1]
    if(adjProperty.adjustment.trim() != ""){ //  && adjProperty.awareness != null && adjProperty.potentialyears != null
      if(adjProperty.procedure[0].name !=null){
        this.transcript.push({
          adjustment : "",
          awareness : null,
          potentialyears : null,
          procedure : [{
            name : null,
            recommended_to : null,
            assignedMap: {},
            // assigned_to : [],
            mandatory : false,
            completed: false
          }]
        })
      }
      else{
        alert("Fill atleast one procedure list in the current adjustments")
      }
    }
    else{
      alert("Fill Previous One And Proceed")
    }
  }

  removeAdjustment(index){
    if(confirm("Sure, Remove this adjustment and its procedures?")){
      this.transcript.splice(index, 1)
    }
  }

  addnewProcedure(index){
    if(this.transcript[index].procedure[this.transcript[index].procedure.length-1].name != null){
      this.transcript[index].procedure.push({
        name : null,
        recommended_to : null,
        assignedMap: {},
        // assigned_to : [],
        mandatory : false,
        completed: false
      })
    }
    else{
      alert("Fill Previous Procedures And Proceed")
    }
  }

  removeProcedure(i,j){
    this.transcript[i].procedure.splice(j, 1)
    this.autoSave()
  }

  importNoteImages(event){
    const input = event.target as HTMLInputElement;
    const files = input.files;
    this.selectedNoteImages = Array.from(files)
    this.previewNoteImages = []
    let loadedCount = 0;
    const totalFiles = this.selectedNoteImages.length;
    for (let i = 0; i < this.selectedNoteImages.length; i++) {
      const pic = this.selectedNoteImages[i];
      var reader = new FileReader()
      reader.readAsDataURL(pic)
      reader.onload = (event=>{
        this.previewNoteImages.push(event.target.result)
      })
      loadedCount++;
      if (loadedCount === totalFiles) {
        // All images loaded
        console.log(this.selectedNoteImages, this.previewNoteImages);
        this.autoSave();
      }
    }
    console.log(this.selectedNoteImages, this.previewNoteImages)
  }

  // removeNoteImage(index){
  //   console.log(index)
  //   this.selectedNoteImages.splice(index, 1)
  //   this.previewNoteImages.splice(index, 1)

  //   this.autoSave()
  // }

  importATCImages(event){
    const input = event.target as HTMLInputElement;
    const files = input.files;

    this.selectedATCImages = Array.from(files)
    this.previewATCImages = []
    let loadedCount = 0;
    const totalFiles = this.selectedATCImages.length;
    for (let i = 0; i < this.selectedATCImages.length; i++) {
      const pic = this.selectedATCImages[i];
      var reader = new FileReader()
      reader.readAsDataURL(pic)
      reader.onload = (event=>{
        this.previewATCImages.push(event.target.result)
      })
      loadedCount++;
      if (loadedCount === totalFiles) {
        // All images loaded
        console.log(this.selectedNoteImages, this.previewNoteImages);
        this.autoSave();
      }
    }
    console.log(this.selectedATCImages, this.previewATCImages)
  }

  // removeATCImage(index){
  //   console.log(index)
  //   this.selectedATCImages.splice(index, 1)
  //   this.previewATCImages.splice(index, 1)
  //   this.autoSave()
  // }

  sanitize(url: string) {
    return this.domSanitizer.bypassSecurityTrustUrl(url);
  }

  // upload recording
  audioUpload(audio){
    console.log(audio);
    for (let i = 0; i < audio.length; i++) {
      const file = audio[i];
      this.processRecording(file)
    }
  }

  // Start recording.
  initiateRecording() {
    this.recording = true;
    let mediaConstraints = {
      video: false,
      audio: true
    };
    navigator.mediaDevices.getUserMedia(mediaConstraints).then(this.successCallback.bind(this), this.errorCallback.bind(this));
  }

  // Will be called automatically.
  successCallback(stream) {
    var options = {
      mimeType: "audio/wav",
      numberOfAudioChannels: 1,
      // sampleRate: 16000,
    };
    //Start Actuall Recording
    var StereoAudioRecorder = RecordRTC.StereoAudioRecorder;
    this.record = new StereoAudioRecorder(stream, options);
    this.record.record();
    this.startCount();
  }

  // Stop recording
  stopRecording() {
    this.recording = false;
    this.record.stop(this.processRecording.bind(this));
    this.endCount();
  }

  // processRecording Do what ever you want with blob
  // @param  {any} blob Blog
  processRecording(blob) {
    this.audioBlobURL = this.audioBlobURL.concat(URL.createObjectURL(blob));
    this.audioBlob = this.audioBlob.concat(blob);
    this.audioBlobURL = this.audioBlobURL
    console.log("blob", blob);

    // Auto-save after recording is processed
    this.autoSave();
  }

  // Process Error.
  errorCallback(error) {
    this.recording = false;
    alert(error)
  }

  startCount(){
    this.countDown = "00 : 00";
    var interval = timer(0, 1000)
    this.countDownSubscription = interval.subscribe(value=>{
      var minutes = (Math.floor(value/60)).toString()
      var seconds = (value % 60).toString()
      minutes = minutes.length == 1 ? "0"+minutes : minutes
      seconds = seconds.length == 1 ? "0"+seconds : seconds
      this.countDown = minutes + " : " + seconds
    })
  }

  endCount(){
    this.countDownSubscription.unsubscribe()
  }

  // removeAudio(index){
  //   if(confirm("Do you want to remove the recording?")){
  //     this.audioBlob.splice(index, 1)
  //     this.audioBlobURL.splice(index, 1)
  //     console.log(this.audioBlobURL, 'this.audioBlobURL');

  //     // this.cleanTemporaryaudio()
  //     this.autoSave();
  //   }
  // }

  // Remove audio with storage deletion
async removeAudio(index: number) {
  if (confirm("Do you want to remove the recording?")) {
    try {
      // Check if this audio has been uploaded to storage
      if (this.existingAudioURLs[index]) {
        const audioURL = this.existingAudioURLs[index];

        // Delete from Firebase Storage
        try {
          const audioRef = ref(this.storage, audioURL);
          await deleteObject(audioRef);
          console.log(`Audio ${index} deleted from storage:`, audioURL);
        } catch (deleteError) {
          console.error(`Error deleting audio ${index} from storage:`, deleteError);
          // Continue with removal even if storage deletion fails
        }
      }

      // Remove from local arrays
      this.audioBlob.splice(index, 1);
      this.audioBlobURL.splice(index, 1);
      this.existingAudioURLs.splice(index, 1);

      // Also remove from audiolist if it exists
      if (this.audiolist && this.audiolist[index]) {
        this.audiolist.splice(index, 1);
      }

      console.log(this.audioBlobURL, 'this.audioBlobURL');

      // Save the updated state
      await this.autoSave();

    } catch (error) {
      console.error('Error removing audio:', error);
      alert('Failed to remove audio. Please try again.');
    }
  }
}

// Remove note image with storage deletion
async removeNoteImage(index: number) {
  if (confirm("Do you want to remove this image?")) {
    try {
      if (this.existingNoteImageURLs[index]) {
        const imageURL = this.existingNoteImageURLs[index];

        // Delete from Firebase Storage
        try {
          const imageRef = ref(this.storage, imageURL);
          await deleteObject(imageRef);
          console.log(`Note image ${index} deleted from storage:`, imageURL);
        } catch (deleteError) {
          console.error(`Error deleting note image ${index} from storage:`, deleteError);
        }
      }
      this.selectedNoteImages.splice(index, 1);
      this.previewNoteImages.splice(index, 1);
      this.existingNoteImageURLs.splice(index, 1);

      // Also remove from imagelist if it exists
      if (this.imagelist && this.imagelist[index]) {
        this.imagelist.splice(index, 1);
      }

      console.log(this.selectedNoteImages, 'selectedNoteImages');
      await this.autoSave();

    } catch (error) {
      console.error('Error removing note image:', error);
      alert('Failed to remove image. Please try again.');
    }
  }
}

// Remove ATC image with storage deletion
async removeATCImage(index: number) {
  if (confirm("Do you want to remove this ATC image?")) {
    try {
      if (this.existingATCImageURLs[index]) {
        const imageURL = this.existingATCImageURLs[index];

        // Delete from Firebase Storage
        try {
          const imageRef = ref(this.storage, imageURL);
          await deleteObject(imageRef);
          console.log(`ATC image ${index} deleted from storage:`, imageURL);
        } catch (deleteError) {
          console.error(`Error deleting ATC image ${index} from storage:`, deleteError);
        }
      }

      this.selectedATCImages.splice(index, 1);
      this.previewATCImages.splice(index, 1);
      this.existingATCImageURLs.splice(index, 1);

      // Also remove from atcImageURL if it exists
      if (this.atcImageURL && this.atcImageURL[index]) {
        this.atcImageURL.splice(index, 1);
      }

      console.log(this.selectedATCImages, 'selectedATCImages');

      await this.autoSave();

    } catch (error) {
      console.error('Error removing ATC image:', error);
      alert('Failed to remove ATC image. Please try again.');
    }
  }
}

  /**
   * Scrolls the page to the field with the given anchor id, flashes a brief
   * red highlight on it, and shows the validation message in a snackbar
   * (replacing the old blocking alert). Returns nothing — call and return.
   */
  private focusMissingField(anchorId: string, message: string) {
    try {
      // Prefer the explicit anchor. If it's missing (e.g. a newly added field
      // without an anchor id), fall back to the FIRST invalid Material field
      // in the form — so new required fields scroll automatically with no
      // extra wiring.
      let el: HTMLElement | null = anchorId ? document.getElementById(anchorId) : null;
      if (!el) el = this.firstInvalidFieldElement();
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('atc-field-invalid-flash');
        setTimeout(() => el?.classList.remove('atc-field-invalid-flash'), 2500);
      }
    } catch {}
    this.snackbar.open(message, 'Dismiss', {
      duration: 4000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['atc-validation-snack'],
    });
  }

  /**
   * Finds the first visible invalid form field in the ATC form. Angular marks
   * a required-but-empty ngModel control as `.ng-invalid` immediately, so this
   * dynamically locates whatever field is missing — including any newly added
   * required field — without needing a hardcoded anchor id.
   */
  private firstInvalidFieldElement(): HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.atc-main .ng-invalid, .atc-main mat-form-field.mat-form-field-invalid, ' +
        '.atc-main textarea.ng-invalid, .atc-main input.ng-invalid, .atc-main mat-select.ng-invalid'
      )
    );
    for (const c of candidates) {
      // Skip hidden elements and the form wrapper itself.
      if (c.tagName.toLowerCase() === 'form') continue;
      const rect = c.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      return c;
    }
    return null;
  }

  async submit(){
    // mark that a submit was attempted so required fields reveal their inline "required" message
    this.submitAttempted = true;
    // block submit while offline — the ATC must reach the server before the draft is removed (draft stays saved)
    if (!navigator.onLine) {
      alert("You're offline. Your draft is saved — please reconnect to submit the ATC.");
      return;
    }
    // wait for any in-flight draft save to finish so it can't re-create the draft after the soft-delete
    await this.autoSaveInFlight;
    this.alphaid = generateId(this.firestoreATC, 'atc_alpha');

    if(this.date == null || this.date == undefined){
      this.focusMissingField('atcfield-date', 'Enter the Date of Prescription')
    }
    else if(this.participantProfileid == null){
      this.focusMissingField('atcfield-profile', 'Select a Valid Profile Name')
    }
    else if(this.product == null){
      this.focusMissingField('atcfield-product', 'Select a Product')
    }
    else if(!Object.keys(this.authorMap).some(e => (this.authorMap[e] ?? []).length != 0) && !this.bigActivity()){
      this.focusMissingField('atcfield-author', 'Choose the author names')
    }
    else if((this.atcdirective ?? "").trim().length == 0){
      this.focusMissingField('atcfield-directive', 'Provide ATC directive')
    }
    else if((this.consultationpoint ?? "").trim().length == 0){
      this.focusMissingField('atcfield-consultationpoint', 'Consultation points required')
    }
    else if((this.casenotes ?? "").trim().length == 0){
      this.focusMissingField('atcfield-casenotes', 'Case notes required')
    }
    else if(this.transcript[0].adjustment.length == 0 || this.transcript[0].procedure[0].name == null){
      this.focusMissingField('atcfield-transcript', 'Transcription first field cannot be empty — enter the adjustment and its procedure')
    }
    else{
      var assignmentChecked = true
      for (let i = 0; i < this.atcAssignment.length; i++) {
        const directive = this.atcAssignment[i];
        if(
          ((directive.directive ?? "").trim().length == 0 && directive.assignedto.length != 0) ||
          ((directive.directive ?? "").trim().length != 0 && directive.assignedto.length == 0) ||
          (((directive.directive ?? "").trim().length == 0 || directive.assignedto.length == 0) && directive.assignedto.length != 0) ||
          (((directive.directive ?? "").trim().length != 0 || directive.assignedto.length != 0) && directive.assignedto.length == 0)
        ){
          assignmentChecked = false
          break
        }
      }

      if(!assignmentChecked){
        alert("While adding directives, Fill the directive and assign specialist.")
        return
      }

      var procedureCount = 0
      var mandatoryProcedure = 0
      for (let i = 0; i < this.transcript.length; i++) {
        if(this.transcript[i].adjustment.trim().length != 0){
          if(this.transcript[i].awareness == null || this.transcript[i].potentialyears == null){
            this.focusMissingField('atcfield-adjustment-' + i, "Empty fields are not allowed at submission. Fill every adjustment's Awareness data.")
            break;
          }
        }
        for(let j = 0; j < this.transcript[i].procedure.length; j++){
          if(this.transcript[i].procedure[j].name == null){
            if(this.transcript[i].adjustment.trim().length > 0){
              this.focusMissingField('atcfield-adjustment-' + i, "Empty fields are not allowed at submission. Fill every adjustment's procedure data or remove the empty procedure.")
              i = 1000;
              j = 1000;
              break
            }
          }
          else{
            procedureCount = procedureCount + 1
            mandatoryProcedure = mandatoryProcedure + (this.transcript[i].procedure[j].mandatory ? 1 : 0)
          }

          if(i == this.transcript.length-1 && j == this.transcript[i].procedure.length-1){
            console.log("Total Procedure ", procedureCount)
            console.log("Mandatory Procedure ", mandatoryProcedure)
            if(mandatoryProcedure != 0 && this.audioBlob.length == 0){
              if(this.eis || this.admin || this.ah){
                this.focusMissingField('atcfield-changework', 'Changework Brief is required when a mandatory procedure is given')
                return
              }
            }
            this.uploadATC();
          }
        }
      }
    }
  }

  async uploadATC(){
    var firebaseDefaultBatch = writeBatch(this.firestoreDefault)
    var firebaseATCBatch = writeBatch(this.firestoreATC)
    // var firebaseBatch = writeBatch(this.firestore);
    var selectedProfile = this.mapProfile[this.participantProfileid]["name"]
    var confirmationMessage = this.liveassignmentdata != null ? `You are sumbitting this ATC for the Queue '${this.ongoingQueue['queuename']}' for the stage '${this.liveassignmentdata?.stagename}'. After submission you can move the participant to the next stage` : `Sure do you want to submit this ATC to the participant '${selectedProfile}'?`
    var aelConfirm = this.matDialog.open(AtcAelConfirmComponent, {
      maxHeight: "90vh",
      maxWidth: "60vw",
      disableClose: true,
      data: {
        confirmationmessage: confirmationMessage,
        profileid: this.participantProfileid,
        atcmodel: this.product
      }
    })
    aelConfirm.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async aelvalue => {
      console.log(aelvalue)
      if(aelvalue != null){
        console.log("Submitting.....")
        this.loading = true
        this.loadingref = this.loadingDialog
        this.alphaSubscription?.unsubscribe()
        this.toValidateSubscription?.unsubscribe()

        // Upload ATC Image
        // var atcImageURL = []
        // for (let a = 0; a < this.selectedATCImages.length; a++) {
        //   const imageFile = this.selectedATCImages[a];
        //   const storageRef = ref(this.storage, "Online ATC Images/" + imageFile.name + imageFile.lastModified + imageFile.size);
        //   const uploadResult = await uploadBytes(storageRef, imageFile);
        //   const imageURL = await getDownloadURL(uploadResult.ref);
        //   atcImageURL.push(imageURL);
        // }
        // console.log(atcImageURL)
        var atclevelBigActivity = {}

        // Author
        var authorref = []
        Object.keys(this.authorMap).forEach(e =>{
          var specialistList = this.authorMap[e] ?? []
          authorref = [...authorref, ...specialistList]
          if(specialistList.length != 0){
            atclevelBigActivity[e] = specialistList.map(e => doc(this.firestoreATC, e).id)
          }
        })
        this.additionalActivityMap.forEach(additional=>{
          if(additional.specialist.length != 0){
            atclevelBigActivity[additional.activity] = [...(atclevelBigActivity[additional.activity] ?? []), ...additional.specialist.map(e => doc(this.firestoreATC, e).id)]
          }
        })
        authorref = Array.from(new Set(authorref))
        authorref = authorref.map(e => doc(this.firestoreATC, e))
        console.log(authorref)

        // Observer
        var observerref = []
        Object.keys(this.observerMap).forEach(e =>{
          var specialistList = this.observerMap[e] ?? []
          observerref = [...observerref, ...specialistList]
          if(specialistList.length != 0){
            atclevelBigActivity[e] = specialistList.map(e => doc(this.firestoreATC, e).id)
          }
        })
        observerref = Array.from(new Set(observerref))
        observerref = observerref.map(e => doc(this.firestoreATC, e))
        console.log(observerref)

        // Mentor
        var mentorref = []
        Object.keys(this.mentorMap).forEach(e =>{
          var specialistList = this.mentorMap[e] ?? []
          mentorref = [...mentorref, ...specialistList]
          if(specialistList.length != 0){
            atclevelBigActivity[e] = specialistList.map(e => doc(this.firestoreATC, e).id)
          }
        })
        mentorref = Array.from(new Set(mentorref))
        mentorref = mentorref.map(e => doc(this.firestoreATC, e))
        console.log(mentorref)

        var validatorref = []
        for (let k = 0; k < this.validator.length; k++) {
          validatorref.push(doc(this.firestoreATC, this.validator[k]))
        }
        console.log(validatorref)

        // Write on ATC Alpha
        var mentoringID = (this.mentornotes ?? "").trim().length != 0 ? generateId(this.firestoreATC, 'pick_for_mentoring') : null;
        var notesID = generateId(this.firestoreATC, 'atc_notes');
        console.log(this.alphaid)
        var alphaData = {
          atcid: this.alphaid,
          notesid: notesID,
          mentoringid: mentoringID,
          directive: this.atcdirective ?? null,
          mentorref: mentorref,
          mentee: this.mentee ?? [],
          author: authorref.length == 0 ? null : authorref,
          prescription_date: new Date(new Date(this.date).setHours(new Date().getHours(), new Date().getMinutes())),
          profileid: this.participantProfileid,
          product: this.product,
          type: "online",
          observer: observerref.length != 0 ? observerref : null,
          isdelete: false,
          validator: validatorref.length != 0 ? validatorref : null,
          prescription_image: this.atcImageURL.length == 0 ? null : this.atcImageURL,
          bigactivity: atclevelBigActivity,
          evolutionprogressdate: new Date(),
          aiatcsummary:this.summarystring ?? '',
          areastoexplore:this.areasstring ?? '',
          aiedited: this.aiedited ?? false
        }

        if(this.aiedited){
          alphaData['aigeneratedsource'] = this.aigeneratedsource ?? null
          alphaData['aigeneratedid'] = this.aigeneratedid ?? null
        }

        if(this.assignmentInitiated){
          alphaData['directiveassignmentref'] = doc(this.firestoreATC, this.directiveAssignmentRef.path)
          alphaData['mentor'] = this.directiveMentor
        }
        if(this.queueid != null){
          alphaData["queueid"] = this.queueid
          alphaData["stagename"] = this.stagename
          alphaData["liveassignmentid"] = this.liveassignmentid
        }
        if(aelvalue != false){
          alphaData["aelid"] = aelvalue
        }
        if(!this.validationnotrequired) {
          alphaData["status"] = "atc given"
        }
        var collectionName
        //Big Assignment
        if(this.bigActivity()){
          alphaData['marathonid'] = this.marathonId
          alphaData['assignmentid'] = this.assignmentId
          alphaData['participantassignmentid'] = this.participantAssignmentId
          alphaData['bigassignment'] = true;
          collectionName = 'atc_to_validate'

          //Big Assignment
          console.log(this.participantAssignmentId);
          firebaseDefaultBatch.update(doc(this.firestoreDefault, 'big participants assignments',this.participantAssignmentId),{
            'status': 'review',
            'activityref' : doc(this.firestoreDefault, collectionName, this.alphaid)
          });
        }else{
          collectionName = this.validationnotrequired ? "atc_alpha" : "atc_to_validate"
        }
        console.log(alphaData)

        // Write Alpha Level
        firebaseATCBatch.set(doc(this.firestoreATC, collectionName, this.alphaid), alphaData);
        // Back-reference only the legacy ai_generated_atc_summary flow. For source=queueatc the
        // docid points at queue_atc_generation (not a summary doc); writing there would either fail
        // the batch (missing doc) or trigger the queue_atc_generation onUpdate cloud function. The
        // aiedited / aigeneratedid fields on the alpha doc already record the AI origin.
        if (this.queryparam?.['aigenerated'] && this.queryparam?.['docid'] && this.queryparam?.['source'] !== 'queueatc') {
          const aiSummaryRef = doc(this.firestoreATC, 'ai_generated_atc_summary', this.queryparam['docid']);
          firebaseATCBatch.update(aiSummaryRef, {
            atcalpharef: doc(this.firestoreATC, collectionName, this.alphaid),
            atcsubmittedat: serverTimestamp(),
          });
        }
        for (let i = 0; i < this.transcript.length; i++) {
          if(this.transcript[i].adjustment.length!=0){
            var adjustmentKey = (i+1).toString().length == 1 ? "0"+(i+1).toString() : (i+1).toString()
            var adjId = "adjustment " + adjustmentKey
            var adjustmentAgent = []
            for (let a = 0; a < this.transcript[i].procedure.length; a++) {
              var procedureItem = this.transcript[i].procedure[a]
              Object.keys(procedureItem.assignedMap).forEach(key=>{
                (procedureItem.assignedMap[key] ?? []).forEach(item=>{
                  adjustmentAgent.push(item.split('/')[1])
                })
              })
            }
            adjustmentAgent = Array.from(new Set(adjustmentAgent))

            var adjustmentData = {
              name : this.transcript[i].adjustment,
              potentialyears : this.transcript[i].potentialyears,
              awareness :  this.transcript[i]['awareness'] != null ? (this.transcript[i]['awareness']['aware'] ?? null) : null,
              awarenessdetail : this.transcript[i]['awareness'] != null ? (this.transcript[i]['awareness']['value'] ?? null) : null,
              created : serverTimestamp(),
              isdelete : false,
              implementationagent : adjustmentAgent
            }

            // Write Adjustment Level
            firebaseATCBatch.set(doc(collection(doc(this.firestoreATC, collectionName, this.alphaid), "corrections"), adjId), adjustmentData);

            for (let j = 0; j < this.transcript[i].procedure.length; j++) {
              var procedureID = adjId + " - " + (j+1).toString()
              var assignref = []
              var assignlevel = {}
              var procedurelevelBigActivity = {}
              Object.keys(this.transcript[i].procedure[j].assignedMap).forEach(key=>{
                (this.transcript[i].procedure[j].assignedMap[key] ?? []).forEach(item=>{
                  assignref.push(item)
                  procedurelevelBigActivity[key] = procedurelevelBigActivity[key] ?? []
                  procedurelevelBigActivity[key].push(doc(this.firestoreATC, item).id)
                })
              })
              assignref = Array.from(new Set(assignref))
              assignref = assignref.map(e => doc(this.firestoreATC, e))

              console.log(assignlevel)
              console.log(this.transcript[i].procedure[j].recommended_to != null ? doc(this.firestoreATC, this.transcript[i].procedure[j].recommended_to) : null)
              console.log(assignref.length != 0 ? assignref : null)
              var procedureData = {
                name : doc(this.firestoreATC, this.transcript[i].procedure[j].name),
                assigned_to : assignref.length != 0 ? assignref : null,
                level : assignlevel,
                recommended_to : this.transcript[i].procedure[j].recommended_to != null ? doc(this.firestoreATC, this.transcript[i].procedure[j].recommended_to) : null,
                status : this.transcript[i].procedure[j].completed ? "completed" : "yet to start",
                created : serverTimestamp(),
                mandatory : this.transcript[i].procedure[j].mandatory,
                cancelled : false,
                isdelete : false,
                autogeneralized : false,
                product : this.product,
                bigactivity: procedurelevelBigActivity
              }

              // Write Procedure Level
              firebaseATCBatch.set(doc(collection(doc(collection(doc(this.firestoreATC, collectionName, this.alphaid), "corrections"), adjId), "procedures"), procedureID), procedureData);
            }
          }
        }

        // Commit Batch
        await firebaseATCBatch.commit()
        await firebaseDefaultBatch.commit()
        // Audio Note & Notes Image
        if(this.audioBlob.length == 0 && this.selectedNoteImages.length == 0){
          this.uploadATCnotes(notesID, mentoringID, [], [], authorref)
        }
        else{
          // var audiolist = []
          // var imagelist = []

          // // Upload audio files
          // for (let i = 0; i < this.audioBlob.length; i++) {
          //   var audioID = this.audioBlobURL[i].split('/')
          //   console.log(i, audioID)
          //   const audioRef = ref(this.storage, "ATC_Audio_Notes/"+this.loggedinProfileid+'/'+ "Audio - " + (i+1).toString() + " " + audioID[audioID.length-1]);
          //   try {
          //     const uploadResult = await uploadBytes(audioRef, this.audioBlob[i]);
          //     const url = await getDownloadURL(uploadResult.ref);
          //     audiolist.push(url);
          //     console.log(i, url);
          //   } catch(err) {
          //     console.log(err);
          //   }
          // }

          // // Upload image files
          // for (let a = 0; a < this.selectedNoteImages.length; a++) {
          //   const imageFile = this.selectedNoteImages[a];
          //   const imageRef = ref(this.storage, "Uploaded ATC/" + imageFile.name + imageFile.lastModified + imageFile.size);
          //   try {
          //     const uploadResult = await uploadBytes(imageRef, imageFile);
          //     const imageURL = await getDownloadURL(uploadResult.ref);
          //     imagelist.push(imageURL);
          //   } catch(err) {
          //     console.log(err);
          //   }
          // }

          // Call uploadATCnotes after all uploads are complete
          this.uploadATCnotes(notesID, mentoringID, this.audiolist, this.imagelist, authorref);
        }
        console.log("Done")
      }
    })
  }

  async uploadATCnotes(notesID: string, mentoringID: string, audiobrief: string[], imagenotes: string[], atcAuthorRef: DocumentReference[]){
    var firebaseDefaultBatch = writeBatch(this.firestoreDefault);
    var firebaseATCBatch = writeBatch(this.firestoreATC);

    if(this.arenamode && this.liveassignmentid != null){
      // Close Live Assignment
      firebaseDefaultBatch.update(doc(this.firestoreDefault, "live assignment", this.liveassignmentid), {changeworkbrief: audiobrief});
    }

    for (let i = 0; i < this.atcAssignment.length; i++) {
      const assignment = this.atcAssignment[i];
      if((assignment.directive ?? "").trim().length != 0 && assignment.assignedto.length != 0){
        var docid = generateId(this.firestoreDefault, 'atc assignment');
        var assignmentData = {
          directive: assignment.directive,
          assignedto: assignment.assignedto.map(e => doc(this.firestoreDefault, e).id),
          activity: assignment.activity,
          author: atcAuthorRef.map(e => e.id),
          atcid: this.alphaid,
          profileid: this.participantProfileid,
          created: new Date(),
          status: "initiated"
        }
        // Save ATC Assignment
        firebaseDefaultBatch.set(doc(this.firestoreDefault, "atc assignment", docid), assignmentData);
      }
    }

    if((this.mentornotes ?? "").trim().length != 0){
      var authorref = []
      Object.keys(this.authorMap).forEach(e =>{
        authorref = [...authorref, ...(this.authorMap[e] ?? [])]
      })
      authorref = authorref.map(e => doc(this.firestoreDefault, e))
      var mentorData = {
        lastupdated: serverTimestamp(),
        atcid : this.alphaid,
        profileid: this.participantProfileid,
        author: authorref,
        prescription_date: new Date(new Date(this.date).setHours(new Date().getHours(), new Date().getMinutes())),
        mentoringnote: this.mentornotes,
        from: this.validationnotrequired ? "alpha" : "validation",
        mentorperson: this.loggedinProfileid,
        created: serverTimestamp()
      }
      // Save Mentor Notes
      firebaseDefaultBatch.set(doc(this.firestoreDefault, "pick_for_mentoring", mentoringID), mentorData);
    }

    var notesData = {
      created: serverTimestamp(),
      lastupdatedby: this.loggedinProfileid,
      atcid : this.alphaid,
      consultationsummary : this.consultationSummary ?? null,
      consultationpoint: this.consultationpoint ?? null,
      notes : this.casenotes ?? null,
      changeworkbrief : audiobrief,
      imagenotes: imagenotes,
      from: this.validationnotrequired ? "alpha" : "validation",
    }
    firebaseATCBatch.set(doc(this.firestoreATC, "atc_notes", notesID), notesData);
    await firebaseDefaultBatch.commit()
    await firebaseATCBatch.commit()
    this.uploadCompleted()
  }

  async uploadCompleted(){
    this.loadingref?.close()
    this.loading = false
    // await this.cleanTemporaryaudio()
    // wait for the soft-delete to complete so the submitted draft does not reappear
    // soft-delete the server draft AND purge the local cache copy (idempotent; self-heals if it can't complete now)
    await this.draftService.finalizeSubmit(this.firestoreATC, "temporary_ATC", this.autoSaveID)
    // clear locally-cached media for the submitted draft
    await this.mediaCache.deleteByDraft(this.autoSaveID)

    if(!this.arenamode){
      window.scrollTo({
        top : 0,
        behavior : 'smooth'
      })
      this.product = null;
      this.atcdirective = null
      this.filteredProfile = '';
      this.participantProfileid = null;
      this.mentee = []
      this.transcript = [{
        adjustment : "",
        awareness : null,
        potentialyears : 0,
        procedure : [
          {
            name : null,
            recommended_to : null,
            assignedMap: {},
            mandatory : false,
            completed: false
          }
        ]
      }];

      Object.keys(this.observerMap).forEach(key=>{
        this.observerMap[key] = []
      })

      this.notesWritten = false;
      this.consultationSummary = null;
      this.casenotes = null;
      this.consultationpoint = null;
      this.mentornotes = null;
      this.audioBlob = [];
      this.audioBlobURL = [];
      this.autoSaveID = null;  // clear draft context so the name unlocks and a new participant can be selected
      this.aigeneratedEntry = false;
      this.existingDraftIds = [];
      this.selectedNoteImages = []
      this.previewNoteImages = []
      this.selectedATCImages = []
      this.previewATCImages = []
      this.atcAssignment = [
        {directive: null, assignedto: [], activity: null}
      ]
    }

    if(this.assignmentInitiated){
      await updateDoc(this.directiveAssignmentRef, {
        status:'submitted'
      }).then(() => {
        this.assignmentInitiated = false
        this.directiveAssignmentRef = null
        this.directiveMentor = []
        console.log("assignment status submitted");
      }).catch(err => {
        console.log("error on submitting assignment ref");
      })
    }

    if(this.arenamode){
      alert("ATC submitted successfully. You can move participant directly to the next stage.")
      this.moveToStudio()
      window.close()
    }

    var bar = this.snackbar.open('The ATC has been submitted successfully. You can view the prescribed ATC in View Screen', 'View ATC', {
      duration: 10000,
    });
    bar.afterDismissed().subscribe(d=>{
      if(d.dismissedByAction){
        this.router.navigateByUrl("/viewprescribedATC")
      }
    })
  }

  /*
  async closeStudio(stagename: string, previousstage: boolean){
    console.log(stagename, previousstage)
    var loading = this.matDialog.open(LoadingProgressComponent, {
      data:{
        msg: "Completing Studio..."
      }
    })

    await updateDoc(doc(this.firestore, "queue studio pairing", this.tokendata["studioid"]), {
      status: null,
    })

    await updateDoc(doc(this.firestore, "live assignment", this.tokendata["liveassignmentid"]), {
      status: "completed",
      updated: serverTimestamp()
    })

    var tokendata = {
      previousstage: this.tokendata["currentstage"],
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
    }

    if(stagename != null){
      var stageIndex = this.ongoingQueue["stages"].findIndex(e => e == stagename)
      tokendata["currentstage"] = this.ongoingQueue["stages"][stageIndex] ?? this.ongoingQueue["stages"][0]
    }
    else{
      var lastStage:boolean
      if(this.tokendata["variationid"] == null){
        var stageIndex = this.ongoingQueue["stages"].findIndex(e => e == tokendata["previousstage"])
        tokendata["currentstage"] = this.ongoingQueue["stages"][previousstage ? (stageIndex - 1) : (stageIndex + 1)]
        lastStage = (stageIndex + 1) == this.ongoingQueue["stages"].length
      }
      else{
        const variationDoc = await getDoc(doc(this.firestore, "queue variation", this.tokendata["variationid"]));
        if (variationDoc.exists()) {
          var variationStage = variationDoc.data()["stages"] ?? []
          var stageIndex = variationStage.findIndex(e => e == tokendata["previousstage"])
          tokendata["currentstage"] = variationStage[previousstage ? (stageIndex - 1) : (stageIndex + 1)]
          lastStage = (stageIndex + 1) == variationStage.length
        }
      }
      if(lastStage){
        console.log("Completing Queue")
      }
    }
    var log = {...this.tokendata, ...tokendata};
    console.log(log)
    await this.moveQueueStage(log)
    loading.close()
  }

  async moveQueueStage(log: any){
    await updateDoc(doc(this.firestore, "queue_token", log["docid"]), log).catch(err=>{
      console.log(err);
    });

    var logdocid = generateId(this.firestore, 'queue stage log');
    log["logdocid"] = logdocid;
    log["movedby"] = this.loggedinProfileid;
    log["movedthrough"] = 'atc';
    await setDoc(doc(this.firestore, "queue stage log", logdocid), log).catch(err=>{
      console.log(err);
    });
    console.log("Token", log)
    window.location.reload()
  }

  onEditATC(collection: string, id: string){
    var url = '/editATC/'+ id +"/" + collection
    window.open(url.toString(), '_blank')
  }
  */

  moveToStudio(){
    this.router.navigateByUrl("/dynamicstudio")
  }

  //Big Assignment
  bigActivity(){
    let returnData:boolean;
    if(![null,undefined,''].includes(this.marathonId) && ![null,undefined,''].includes(this.assignmentId) && ![null,undefined,''].includes(this.participantAssignmentId) ){
      returnData = true;
    }else {
      returnData = false;
    }
    return returnData
  }
}
