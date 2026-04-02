import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { collection, collectionData, collectionSnapshots, doc, DocumentReference, Firestore, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from '@angular/fire/storage';
import { AuthguardService } from '../../authguard.service';
import { CommonModule, DatePipe, Location } from '@angular/common';
import * as RecordRTC from 'recordrtc';
import { DomSanitizer } from '@angular/platform-browser';
import { Subject, Subscription, takeUntil, timer } from 'rxjs';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { AtcOptionComponent } from '../../ATC/atc-option/atc-option.component';
import { MatSnackBar } from '@angular/material/snack-bar';
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
  draftUrls = []
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
  directiveAssignmentRef : any = {}
  directiveMentor:any [] = []
  adjustmentAwarenessDetail:any = {}

  //network status
  isonline:boolean
  pageloadedatfirsttime:boolean = false

  // Draft
  draftStatus = {
    message: "No Draft Created!",
    code: 0
  }

  audiolist = []
  imagelist = []
  atcImageURL = []

  lastDraftSavedOn = null

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

  constructor(
    public location : Location,
    public firestore : Firestore,
    public storage : Storage,
    public route: ActivatedRoute,
    public router: Router,
    public guardservice : AuthguardService,
    public datepipe : DatePipe,
    private domSanitizer: DomSanitizer,
    public clipboard: Clipboard,
    public matDialog: MatDialog,
    public snackbar: MatSnackBar,
    private networkStatusService : NetworkStatusService
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
      getDocs(query(collection(this.firestore,"profile_data"),where("user_ref", "==", doc(this.firestore,'user_data',uid)))).then(async profileData=>{
        this.loggedinProfileid = profileData.docs[0].id
        getDoc(doc(this.firestore,profileData.docs[0].data()['role_ref']['path'])).then(async roleDoc=>{
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
          guardservice.getProfileMap().then(e => this.getDirectiveAssignments(e.docdata))
          // this.addActivity()
          await this.setupData()
          if(this.participantProfileid){
            await this.onProfileSelect()
          }
          this.settingup = false
        })
      })
      //get adjustment_wareness
      getDoc(doc(this.firestore,"classify","adjustment_awareness")).then( snap => {
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
    this.route.queryParams.subscribe(async params => {
      if (!params['aigenerated'] || !params['docid']) return;
      const docid = params['docid'];
      const draftRef = doc(this.firestore, 'temporary_ATC', docid);
      const draftSnap = await getDoc(draftRef);

      if (draftSnap.exists()) {
        console.log('Draft exists → loading from temporary_ATC');

        const value = draftSnap.data();

        this.autoSaveID = docid;
        this.participantProfileid = value['profileid'] ?? null;
        this.transcript = value['transcript'] ?? [];
        this.consultationSummary = value['consultationsummary'] ?? null;
        this.consultationpoint = value['consultationpoint'] ?? null;
        this.casenotes = value['notes'] ?? null;
        this.mentornotes = value['mentornotes'] ?? null;

        this.summarystring = value['aiatcsummary'] ?? null;
        this.areasstring = value['areastoexplore'] ?? [];

        console.log('Draft loaded, AI re-parse skipped');
        return;
      }
      console.log('No draft found → parsing AI output');

      const aiRef = doc(this.firestore, 'ai_generated_atc_summary', docid);
      const aiSnap = await getDoc(aiRef);

      if (!aiSnap.exists()) {
        console.warn('AI summary document not found');
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

      await setDoc(draftRef, {
        profileid: this.participantProfileid,
        transcript: [],
        aiatcsummary: this.summarystring,
        areastoexplore: this.areasstring,
        delete: false,
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
      if(this.pageloadedatfirsttime && this.isonline){
        console.log("atc draft runned");
        this.autoSave()
      }
    });
    // Big Assignment
    if(this.bigActivity()){
      this.validationnotrequired = false;
      await getDoc(doc(collection(this.firestore, 'big participants assignments'),this.participantAssignmentId)).then((bpadoc)=>{
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
  }

  async setupData(){
    try {
      // Fetch Products
      collectionData(query(collection(this.firestore,"atc model"), orderBy("atcmodel")), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(products=>{
        this.productAvailable = products.filter(e => (e["atcmodel"] ?? "").trim().length != 0)
        this.productLists = Array.from(new Map(this.productAvailable.map(item => [item["atcmodel"], item])).values());
        console.log("Products Loaded", this.productLists)
        for (let i = 0; i < this.productAvailable.length; i++) {
          this.mapProductidtoatcmodel[this.productAvailable[i]['id']] = this.productAvailable[i]['atcmodel']
        }
      })

      // Fetch User Roles
      collectionData(query(collection(this.firestore, 'users_roles'), orderBy('name')), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(userRoles=>{
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
      collectionSnapshots(query(collection(this.firestore, "procedure_recommend"), orderBy('name'))).pipe(takeUntil(this.subscriptionHandle)).subscribe(names=>{
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
      collectionSnapshots(query(collection(this.firestore,"procedures"),orderBy("name"))).pipe(takeUntil(this.subscriptionHandle)).subscribe(procedureList=>{
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
      getDocs(query(collection(this.firestore, "bigactivity"), orderBy("activity"))).then(activityList=>{
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
      await getDocs(query(collection(this.firestore,'queue generation'),where("queueenddate", ">=", new Date()))).then(async queuesnap=>{
        var ongoingQueueList = queuesnap.docs.map(e => e.data()).filter(e => e["queuestartdate"].toDate() < new Date())
        var queueref = ongoingQueueList.map(e => doc(this.firestore, 'queue generation', e["docid"]))
        if(queueref.length != 0){
          await getDocs(query(collection(this.firestore, "queue studio pairing"), where("queueref", "in", queueref),where("participants", "array-contains", this.loggedinProfileid),where("checkin", "==", true),where("studioin", "==", true))).then(pairing=>{
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
    this.mentorOption = Array.from(new Set([...this.relatedATCauthor, ...observerPath.map(e => doc(this.firestore,e).id)]))
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
      getDoc(doc(this.firestore, "profile_data",this.participantProfileid)).then(profile =>{
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
      getDocs(query(collection(this.firestore,"live assignment"),where("queueid", "==", this.ongoingQueue["docid"]),where("participantid", "==", this.participantProfileid),where('pairing', 'array-contains', this.loggedinProfileid),orderBy("created", "desc"))).then(async (studio) =>{
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
          getDocs(query(collection(this.firestore,"queue stage log"), where("liveassignmentid", "==", this.liveassignmentid),limit(1))).then(queuetoken=>{
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
      message: "No Draft Created!",
      code: 0
    }
    this.lastDraftSavedOn = null
    var draftATC = []
    if (this.developer || this.admin) {
      const q = query(
        collection(this.firestore, 'temporary_ATC'),
        where('profileid', '==', this.participantProfileid),
        where('delete', '==', false)
      );
      draftATC = (await getDocs(q)).docs;
    } else {
      const q = query(
        collection(this.firestore, 'temporary_ATC'),
        where('profileid', '==', this.participantProfileid),
        where('delete', '==', false),
        where('authorprofileid', 'array-contains', this.loggedinProfileid)
      );
      draftATC = (await getDocs(q)).docs;
    }
    console.log(draftATC.map(e => e.ref.path))
    this.autoSaveID = this.guardservice.generateId(this.firestore, "temporary_ATC")
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
            var value = atc["doc"].data()
            console.log(value);
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
            console.log(atc)
            for (let i = 0; i < this.transcript.length; i++) {
              this.transcript[i]['awareness'] = this.transcript[i]['awareness'] ?? null
              this.transcript[i]['potentialyears'] = this.transcript[i]['potentialyears'] ?? null
            }

            // Load audio recordings if they exist
            if(value['audioRecordings'] && value['audioRecordings'].length > 0) {
              try {
                this.draftStatus = {
                  message: "Loading Audio Recordings...",
                  code: 0
                }
                this.existingAudioURLs = value['audioRecordings'] || [];
                this.existingNoteImageURLs = value['noteImageURLs'] || [];
                this.existingATCImageURLs = value['atcImageURLs'] || [];
                this.imagelist = [...this.existingNoteImageURLs];
                this.atcImageURL = [...this.existingATCImageURLs];
                await this.loadAudioFromURLs(value['audioRecordings']);
                await this.loadNoteImagesFromURLs(value['noteImageURLs'])
                await this.loadATCImagesFromURLs(value['atcImageURLs'])
                console.log("Audio recordings loaded successfully");
              } catch (error) {
                console.error("Error loading audio recordings:", error);
                this.draftStatus = {
                  message: "ATC Draft Imported but failed to load audio. " + JSON.stringify(error),
                  code: -1
                }
                return;
              }
            }

            this.draftStatus = {
              message: "ATC Draft Imported Successfully.",
              code: 1
            }
            if(value["lastupdated"]){
              this.lastDraftSavedOn = value["lastupdated"].toDate()
            }
          }
        }
      })
    }
  }

  async loadAudioFromURLs(audioURLs: string[]) {
    this.audioBlobURL = [];
    this.audioBlob = [];

    const loadPromises = audioURLs.map(async (url, index) => {
      try {
        console.log(`Loading audio ${index + 1}/${audioURLs.length}:`, url);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();

        this.audioBlob.push(blob);
        this.audioBlobURL.push(url);
        console.log(this.audioBlobURL, 'this.audioBlobURL');

        console.log(`Audio ${index + 1} loaded successfully`);
        return blob;
      } catch (error) {
        console.error(`Error loading audio ${index + 1} from URL:`, url, error);
        this.audioBlob.push(null);
        this.audioBlobURL.push(null);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    const successfulLoads = results.filter(result => result !== null).length;
    console.log(`Audio files loaded: ${successfulLoads}/${audioURLs.length}`);

    // Filter out failed loads
    this.audioBlob = this.audioBlob.filter(blob => blob !== null);
    this.audioBlobURL = this.audioBlobURL.filter(url => url !== null);
  }

  // Load Note Images from URLs
  async loadNoteImagesFromURLs(imageURLs: string[]) {
    this.selectedNoteImages = [];
    this.previewNoteImages = [];


    const loadPromises = imageURLs.map(async (url, index) => {
      try {
        console.log(`Loading note image ${index + 1}/${imageURLs.length}:`, url);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();


        this.previewNoteImages.push(url);

        const file = new File([blob], `image_${index}.jpg`, { type: blob.type });
        this.selectedNoteImages.push(file);

        console.log(`Note Image ${index + 1} loaded successfully`);
        return blob;
      } catch (error) {
        console.error(`Error loading note image ${index + 1} from URL:`, url, error);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    const successfulLoads = results.filter(result => result !== null).length;
    console.log(`Note images loaded: ${successfulLoads}/${imageURLs.length}`);
  }

  // Load ATC Images from URLs
  async loadATCImagesFromURLs(imageURLs: string[]) {
    this.selectedATCImages = [];
    this.previewATCImages = [];

    const loadPromises = imageURLs.map(async (url, index) => {
      try {
        console.log(`Loading ATC image ${index + 1}/${imageURLs.length}:`, url);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        this.previewATCImages.push(url);

        const file = new File([blob], `atc_image_${index}.jpg`, { type: blob.type });
        this.selectedATCImages.push(file);

        console.log(`ATC Image ${index + 1} loaded successfully`);
        return blob;
      } catch (error) {
        console.error(`Error loading ATC image ${index + 1} from URL:`, url, error);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    const successfulLoads = results.filter(result => result !== null).length;
    console.log(`ATC images loaded: ${successfulLoads}/${imageURLs.length}`);
  }



  compareFnc(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.value === c2.value : c1 === c2;
  }

  async getDirectiveAssignments(profilemap){
    console.log("ATC Assignments")
    const q = query(collection(this.firestore, 'atc assignment'), where("assignedto","array-contains",this.loggedinProfileid), where("status", "==", 'initiated'))
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
            this.authorMap[value["activity"]] = value['assignedto'].map(e => doc(this.firestore, "profile_data", e).path)
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


  async autoSave() {
    this.filteredSpecialist = "";
    try {
      if (this.autoSaveID != null) {
        this.uploadProgress.isUploading = true;
        this.draftStatus = {
          message: "Saving to Draft...",
          code: 0
        };

        console.log(this.date);
        var authorprofileid = [];
        Object.values<any>(this.authorMap ?? {}).forEach(value => {
          if (value) {
            var id = (value ?? []).map(e => doc(this.firestore, e).id);
            authorprofileid = [...authorprofileid, ...id];
          }
        });

        if (authorprofileid.length == 0) authorprofileid = [this.loggedinProfileid];

        const [audioURLs, noteImageURLs, atcImageURLs] = await Promise.all([
          this.uploadAudioToStorage(),
          this.uploadNotesImageToStorage(),
          this.uploadATCImageToStorage()
        ]);

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
          audioRecordings: audioURLs,
          noteImageURLs: noteImageURLs,
          atcImageURLs: atcImageURLs,
          delete: false,
          authorprofileid: authorprofileid,
          lastupdated: serverTimestamp(),
          aiatcsummary:this.summarystring ?? '',
          areastoexplore:this.areasstring ?? '',
        };

        this.draftUrls = audioURLs;
        this.audiolist = audioURLs;
        this.imagelist = noteImageURLs;
        this.atcImageURL = atcImageURLs;

        // Update existing URLs for next save
        this.existingAudioURLs = audioURLs;
        this.existingNoteImageURLs = noteImageURLs;
        this.existingATCImageURLs = atcImageURLs;

        console.log("Data with audio URLs:", data);

        await setDoc(doc(this.firestore, 'temporary_ATC', this.autoSaveID), data);

        this.draftStatus = {
          message: "ATC and Audio Saved to Draft.",
          code: 1
        };
        this.lastDraftSavedOn = new Date();
        this.uploadProgress.isUploading = false;

      }
    } catch (error) {
      console.error("Error in autoSave:", error);
      this.draftStatus = {
        message: "Failed to Save Draft. " + JSON.stringify(error),
        code: -1
      };
      this.uploadProgress.isUploading = false;
    }
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

  async submit(){
    this.alphaid = generateId(this.firestore, 'atc_alpha');

    if(this.date == null || this.date == undefined){
      alert("Enter the Date of Prescription")
    }
    else if(this.participantProfileid == null){
      alert("Select a Valid Profile Name")
    }
    else if(this.product == null){
      alert("Select a Product")
    }
    else if(!Object.keys(this.authorMap).some(e => (this.authorMap[e] ?? []).length != 0) && !this.bigActivity()){
      alert("Choose the author names")
    }
    else if((this.atcdirective ?? "").trim().length == 0){
      alert("provide ATC directive")
    }
    else if((this.consultationpoint ?? "").trim().length == 0){
      alert("Consultation points Required")
    }
    else if((this.casenotes ?? "").trim().length == 0){
      alert("Case notes Required")
    }
    else if(this.transcript[0].adjustment.length == 0 || this.transcript[0].procedure[0].name == null){
      alert("Transcription first filed cannot be empty, Enter the adjustment and its procedure")
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
            alert("Empty fields are not allowed at submission, Fill Every Adjustment's Awareness Data")
            break;
          }
        }
        for(let j = 0; j < this.transcript[i].procedure.length; j++){
          if(this.transcript[i].procedure[j].name == null){
            if(this.transcript[i].adjustment.trim().length > 0){
              alert("Empty fields are not allowed at submission, Fill Every Adjustments Procedure Data or Remove the Empty Procedure")
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
                alert("Changework Brief Missing!")
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
    var firebaseBatch = writeBatch(this.firestore);
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
            atclevelBigActivity[e] = specialistList.map(e => doc(this.firestore, e).id)
          }
        })
        this.additionalActivityMap.forEach(additional=>{
          if(additional.specialist.length != 0){
            atclevelBigActivity[additional.activity] = [...(atclevelBigActivity[additional.activity] ?? []), ...additional.specialist.map(e => doc(this.firestore, e).id)]
          }
        })
        authorref = Array.from(new Set(authorref))
        authorref = authorref.map(e => doc(this.firestore, e))
        console.log(authorref)

        // Observer
        var observerref = []
        Object.keys(this.observerMap).forEach(e =>{
          var specialistList = this.observerMap[e] ?? []
          observerref = [...observerref, ...specialistList]
          if(specialistList.length != 0){
            atclevelBigActivity[e] = specialistList.map(e => doc(this.firestore, e).id)
          }
        })
        observerref = Array.from(new Set(observerref))
        observerref = observerref.map(e => doc(this.firestore, e))
        console.log(observerref)

        // Mentor
        var mentroref = []
        Object.keys(this.mentorMap).forEach(e =>{
          var specialistList = this.mentorMap[e] ?? []
          mentroref = [...mentroref, ...specialistList]
          if(specialistList.length != 0){
            atclevelBigActivity[e] = specialistList.map(e => doc(this.firestore, e).id)
          }
        })
        mentroref = Array.from(new Set(mentroref))
        mentroref = mentroref.map(e => doc(this.firestore, e))
        console.log(mentroref)

        var validatorref = []
        for (let k = 0; k < this.validator.length; k++) {
          validatorref.push(doc(this.firestore, this.validator[k]))
        }
        console.log(validatorref)

        // Write on ATC Alpha
        var mentoringID = (this.mentornotes ?? "").trim().length != 0 ? generateId(this.firestore, 'pick_for_mentoring') : null;
        var notesID = generateId(this.firestore, 'atc_notes');
        console.log(this.alphaid)
        var alphaData = {
          atcid: this.alphaid,
          notesid: notesID,
          mentoringid: mentoringID,
          directive: this.atcdirective ?? null,
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
          areastoexplore:this.areasstring ?? ''
        }

        if(this.assignmentInitiated){
          alphaData['directiveassignmentref'] = this.directiveAssignmentRef
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
          firebaseBatch.update(doc(this.firestore, 'big participants assignments',this.participantAssignmentId),{
            'status': 'review',
            'activityref' : doc(this.firestore, collectionName, this.alphaid)
          });
        }else{
          collectionName = this.validationnotrequired ? "atc_alpha" : "atc_to_validate"
        }
        console.log(alphaData)

        // Write Alpha Level
        firebaseBatch.set(doc(this.firestore, collectionName, this.alphaid), alphaData);
        if (this.queryparam?.['aigenerated'] && this.queryparam?.['docid']) {
          const aiSummaryRef = doc(this.firestore, 'ai_generated_atc_summary', this.queryparam['docid']);
          firebaseBatch.update(aiSummaryRef, {
            atcalpharef: doc(this.firestore, collectionName, this.alphaid),
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
            firebaseBatch.set(doc(collection(doc(this.firestore, collectionName, this.alphaid), "corrections"), adjId), adjustmentData);

            for (let j = 0; j < this.transcript[i].procedure.length; j++) {
              var procedureID = adjId + " - " + (j+1).toString()
              var assignref = []
              var assignlevel = {}
              var procedurelevelBigActivity = {}
              Object.keys(this.transcript[i].procedure[j].assignedMap).forEach(key=>{
                (this.transcript[i].procedure[j].assignedMap[key] ?? []).forEach(item=>{
                  assignref.push(item)
                  procedurelevelBigActivity[key] = procedurelevelBigActivity[key] ?? []
                  procedurelevelBigActivity[key].push(doc(this.firestore, item).id)
                })
              })
              assignref = Array.from(new Set(assignref))
              assignref = assignref.map(e => doc(this.firestore, e))

              console.log(assignlevel)
              console.log(this.transcript[i].procedure[j].recommended_to != null ? doc(this.firestore, this.transcript[i].procedure[j].recommended_to) : null)
              console.log(assignref.length != 0 ? assignref : null)
              var procedureData = {
                name : doc(this.firestore, this.transcript[i].procedure[j].name),
                assigned_to : assignref.length != 0 ? assignref : null,
                level : assignlevel,
                recommended_to : this.transcript[i].procedure[j].recommended_to != null ? doc(this.firestore, this.transcript[i].procedure[j].recommended_to) : null,
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
              firebaseBatch.set(doc(collection(doc(collection(doc(this.firestore, collectionName, this.alphaid), "corrections"), adjId), "procedures"), procedureID), procedureData);
            }
          }
        }

        // Commit Batch
        await firebaseBatch.commit()
        atc_alpha_ref: doc(this.firestore, 'atc_alpha', this.alphaid)
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
    var firebaseBatch = writeBatch(this.firestore);

    if(this.arenamode && this.liveassignmentid != null){
      // Close Live Assignment
      firebaseBatch.update(doc(this.firestore, "live assignment", this.liveassignmentid), {changeworkbrief: audiobrief});
    }

    for (let i = 0; i < this.atcAssignment.length; i++) {
      const assignment = this.atcAssignment[i];
      if((assignment.directive ?? "").trim().length != 0 && assignment.assignedto.length != 0){
        var docid = generateId(this.firestore, 'atc assignment');
        var assignmentData = {
          directive: assignment.directive,
          assignedto: assignment.assignedto.map(e => doc(this.firestore, e).id),
          activity: assignment.activity,
          author: atcAuthorRef.map(e => e.id),
          atcid: this.alphaid,
          profileid: this.participantProfileid,
          created: new Date(),
          status: "initiated"
        }
        // Save ATC Assignment
        firebaseBatch.set(doc(this.firestore, "atc assignment", docid), assignmentData);
      }
    }

    if((this.mentornotes ?? "").trim().length != 0){
      var authorref = []
      Object.keys(this.authorMap).forEach(e =>{
        authorref = [...authorref, ...(this.authorMap[e] ?? [])]
      })
      authorref = authorref.map(e => doc(this.firestore, e))
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
      firebaseBatch.set(doc(this.firestore, "pick_for_mentoring", mentoringID), mentorData);
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
    firebaseBatch.set(doc(this.firestore, "atc_notes", notesID), notesData);
    await firebaseBatch.commit()
    this.uploadCompleted()
  }

  async uploadCompleted(){
    this.loadingref?.close()
    this.loading = false
    // await this.cleanTemporaryaudio()
    updateDoc(doc(this.firestore, "temporary_ATC", this.autoSaveID), {delete: true}).catch(err=>{
      console.log(err)
    })

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
      this.autoSaveID = generateId(this.firestore, 'temporary_ATC');
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
