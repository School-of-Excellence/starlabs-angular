import { Component, Injectable, inject } from '@angular/core';
import { CommonModule, DatePipe, Location } from "@angular/common";
import { collection, collectionSnapshots, doc, DocumentReference, Firestore, getDoc, getDocs, getFirestore, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { Subject, Subscription, takeUntil, timer } from 'rxjs';
import * as RecordRTC from 'recordrtc';
import { DomSanitizer } from '@angular/platform-browser';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { AtcOptionComponent } from '../../ATC/atc-option/atc-option.component';
import { NetworkStatusService } from '../../network-status.service';
import { MediaCacheService, PendingMedia } from '../../shared/media-cache.service';
import { ATCDraftService } from '../../shared/atc-draft.service';
import { DraftConflictDialogComponent } from '../shared/draft-conflict-dialog.component';
import { PreviewAtcBeforeSubmissionComponent } from '../preview-atc-before-submission/preview-atc-before-submission.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ErrorStateMatcher } from '@angular/material/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { UpdateDialogComponent } from '../../DialogBox/update-dialog/update-dialog.component';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MarkdownModule } from 'ngx-markdown';

@Component({
  selector: 'app-edit-atc',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    CommonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    NgxMatSelectSearchModule,
    MatCheckboxModule,
    MarkdownModule,
    MatSnackBarModule
  ],
  templateUrl: './edit-atc.component.html',
  styleUrl: './edit-atc.component.css'
})
export class EditAtcComponent {
  // private firestore = inject(Firestore);
  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  atcID: string
  loading: boolean = true
  loggedProfileID: string
  marathonId: string;
  assignmentId: string;
  participantAssignmentId: string;

  selectedParticipant = {}
  filteredSpecialist = ""
  reportATC = {
    atcData: null,
    profile_name: null,
    bigactivity: {},
    directive: null,
    // authors : "",
    date: '',
    product: "",
    atcpath: "",
    notesid: null,
    atceducation: [],
    validator: [],
    transcription: [{
      adjData: null,
      adjustment: "",
      awareness: null,
      awarenessdetail: null,
      potentialyears: null,
      adjustmentedit: "",
      adjustmentdelete: false,
      originalADJvalue: false,
      adjustmentpath: "",
      implementationagent: [],
      procedure: [{
        procedureData: null,
        name: "",
        proceduredelete: false,
        originalPROvalue: false,
        procedurepath: "",
        newprocedure: false,
        recommended_to: null,
        // assigned_to : [],
        bigactivity: {},
        mandatory: false,
        completed: false
      }]
    }]
  }

  updatedAdjustment = []
  newTranscription = [{
    adjustment: "",
    awareness: null,
    awarenessdetail: null,
    potentialyears: null,
    procedure: [{
      name: null,
      recommended_to: null,
      bigactivity: {},
      // assigned_to : [],
      mandatory: false,
      completed: false
    }]
  }]

  recommendlist = []
  authorList = []
  mentorList = []
  userroleSubscription: Subscription
  procedureList = []
  procedureSubscription: Subscription
  procedureMap = {}
  profileMap = {}
  // levelMap = {}
  uploading: boolean = false
  //Lets declare Record OBJ
  record;
  //Will use this flag for toggeling recording
  recording = false;
  //URL of Blob
  audioBlob = []
  audioBlobURL = [];
  // Timer
  countDown: string = "00 : 00";
  countDownSubscription: Subscription;
  // editable:boolean = false
  // Collection type
  collectionName
  // Image Notes
  selectedNoteImages = []
  previewNoteImages = []
  // Image ATC
  selectedATCImages = []
  previewATCImages = []
  //map notes
  roles: any = {}
  existingNotes = null
  editNotes = {
    noteid: null,
    notes: null, // Case note
    consultationsummary: null,
    consultationpoint: null,
    // mentoringnote: null,
    // mentorid: null,
    // mentor: [],
    notesedited: false,
  }

  // Big Activity
  mapBigActivity = {}
  assignedtoActivity = []
  authorActivity = []
  observerActivity = []
  mentorActivity = []
  otherBigActivity = []
  selectedAdditionalActivity = []

  //awareness
  adjustmentAwarenessDetail: any = {}

  // Network Status
  isonline: boolean
  pageloadedatfirsttime: boolean = false

  // Draft
  draftStatus = {
    message: "Draft not saved yet.",
    code: 0
  }
  lastDraftSavedOn = null
  hideDraftBanner = false
  submitAttempted = false  // true once Submit was pressed — drives the inline "required" hints
  // shows the inline "Required" message on every required field once Submit was attempted
  requiredMatcher: ErrorStateMatcher = {
    isErrorState: (control) => !!(control && control.invalid && (control.touched || this.submitAttempted))
  };
  // serialize draft saves so concurrent autosaves cannot overwrite each other
  private autoSaveInFlight: Promise<void> | null = null;

  firebaseDefaultBatch = writeBatch(this.firestoreDefault)
  firebaseATCBatch = writeBatch(this.firestoreATC)

  private subscriptionHandle = new Subject<void>()

  profileList = []
  temporaryFunctionAccess = []

  areasstring: any = null;
  summarystring: any = null;
  
  constructor(
    public storage: Storage,
    public router: Router,
    public route: ActivatedRoute,
    public guard: AuthguardService,
    private domSanitizer: DomSanitizer,
    public dialog: MatDialog,
    public location: Location,
    public datepipe: DatePipe,
    private networkStatusService: NetworkStatusService,
    private mediaCache: MediaCacheService,
    public snackbar: MatSnackBar,
    private draftService: ATCDraftService
  ) {
    this.reportATC = {
      atcData: null,
      profile_name: null,
      bigactivity: {},
      directive: null,
      // authors : "",
      date: '',
      product: "",
      atcpath: "",
      notesid: null,
      transcription: [],
      atceducation: [],
      validator: [],
    }
    this.newTranscription = []
    // this.route.queryParams.subscribe(data=>{
    //   console.log(data)
    //   if(data != null && data != undefined){
    //     if(data["arenamode"] == "true"){
    //       this.arenamode = true
    //     }
    //   }
    // })
    route.queryParams.subscribe(param => {
      console.log(param);
      this.marathonId = param['marathonid'];
      this.assignmentId = param['assignmentid'];
      this.participantAssignmentId = param['participantassignmentid'];
      console.log(this.bigActivity());
    });

    route.params.subscribe(data => {
      console.log(data)
      this.atcID = data['atc']
      this.collectionName = data['type'] == "alpha" ? "atc_alpha" : "atc_to_validate";

      console.log(this.atcID)
      guard.getRoles().then(async roles => {
        this.roles = roles
        this.loggedProfileID = roles.profile_ref.id
        // var adminRole = roles.admin
        // var eisRole = roles.eis
        // if (adminRole || eisRole) {
          await this.fetchPreData()
          this.getATC();
        // }
        // else {
        //   alert("The Access to this screen is restricted")
        // }
      }).catch(err => {
        this.loading = false
        console.log(err)
      })
    });
  }

  ngOnInit(): void {
    getDoc(doc(this.firestoreDefault, "temporary function access", "atcaccess")).then(tempAccess => {
      if (tempAccess.exists()) this.temporaryFunctionAccess = tempAccess.data()['profilelist'] || []
    })
    getDocs(collection(this.firestoreDefault, "profile_data")).then(snap => {
      this.profileList = snap.docs.map(e => e.data())
    })
    collectionSnapshots(query(collection(this.firestoreDefault, 'procedures'), orderBy('name'))).pipe(takeUntil(this.subscriptionHandle)).subscribe(procedures => {
      var list = []
      procedures.forEach(doc => {
        list.push({
          name: doc.data()['name'],
          path: doc.ref.path
        })
        this.procedureMap[doc.ref.path] = doc.data()['name']
      })
      this.procedureList = list
    })
    getDocs(query(collection(this.firestoreDefault, "procedure_recommend"), orderBy("name"))).then(names => {
      var list = [];
      names.forEach(type => {
        list.push(type)
      })
      this.recommendlist = list
    })
    getDoc(doc(this.firestoreDefault, "classify", "adjustment_awareness")).then(snap => {
      this.adjustmentAwarenessDetail = snap.data()
    })

    this.networkStatusService.onlineStatus$.subscribe(status => {
      this.isonline = status
      if (!this.isonline) {
        this.pageloadedatfirsttime = true
      }
      if (this.pageloadedatfirsttime && this.isonline) {
        console.log("atc draft runned");
        this.autoSave()
      }
    })
    if (!this.reportATC.atcData) {
      this.reportATC.atcData = {}; 
    }
  }

  ngOnDestroy() {
    this.procedureSubscription?.unsubscribe()
    this.userroleSubscription?.unsubscribe()
  }

  onLogInAsBigPariticipant(value: string) {
    console.log(value);
    this.loggedProfileID = value
  }

  async fetchPreData() {
    await getDocs(query(collection(this.firestoreDefault, "users_roles"), orderBy("name"))).then(async users => {
      var mentor = []
      var author = []
      for (let i = 0; i < users.docs.length; i++) {
        var userDoc = users.docs[i]
        var userData = userDoc.data()
        this.profileMap[userData["profile_ref"].id] = userData['name']
        if (userData["mentor"]) {
          mentor.push({
            authorpath: userData["profile_ref"]["path"],
            authorname: userData["name"]
          })
        }
        if (userData["changeagent"] || userData["eis"] || userData["admin"] || userData["ah"] || userData["mentor"]) {
          author.push({
            authorpath: userData["profile_ref"]["path"],
            authorname: userData["name"]
          })
        }
      }
      this.mentorList = mentor
      this.authorList = author
      console.log(this.mentorList)
    })
    await getDocs(query(collection(this.firestoreDefault, "bigactivity"), orderBy("activity", "asc"))).then(list => {
      for (let i = 0; i < list.docs.length; i++) {
        const doc = list.docs[i];
        var data = doc.data()
        var atcProperty = data["atcproperty"]
        this.mapBigActivity[doc.id] = data["activity"]
        if (atcProperty == "author") {
          this.authorActivity.push(data)
        }
        else if (atcProperty == "observer") {
          this.observerActivity.push(data)
        }
        else if (atcProperty == "mentoring") {
          this.mentorActivity.push(data)
        }
        else if (atcProperty == "assigned_to") {
          this.assignedtoActivity.push(data)
        }
        else {
          this.otherBigActivity.push(data)
        }
      }
    })


  }

  availableSpecialistList(): Array<any> {
    var person = this.authorList.filter(e => e.authorname.toLowerCase().includes(this.filteredSpecialist.toLowerCase()))
    return person;
  }

  availableMentorList(): Array<any> {
    var person = this.mentorList.filter(e => e.authorname.toLowerCase().includes(this.filteredSpecialist.toLowerCase()))
    return person;
  }

  async getATC() {
    var date = new Date()
    var totalProcedureRead = 0
    // push any edit-draft that never reached the server (e.g. saved offline) before loading
    await this.draftService.flushDirty(this.firestoreATC)
    await getDoc(doc(this.firestoreATC, this.collectionName, this.atcID)).then(async atcData => {
      var atcDocData = atcData.data()
      getDoc(doc(this.firestoreDefault, "profile_data", atcDocData["profileid"])).then(participant => {
        if (participant.exists()) {
          this.selectedParticipant = participant.data()
        }
      })
      if (atcDocData["notesid"] != null) {
        await getDoc(doc(this.firestoreATC, "atc_notes", atcDocData["notesid"])).then(async snap => {
          if (snap.exists()) {
            this.existingNotes = snap.data()
            this.editNotes.notes = (this.existingNotes['notes'] ?? "").trim().length != 0 ? this.existingNotes['notes'] : null
            this.editNotes.consultationsummary = (this.existingNotes['consultationsummary'] ?? "").trim().length != 0 ? this.existingNotes['consultationsummary'] : null
            this.editNotes.consultationpoint = (this.existingNotes['consultationpoint'] ?? "").trim().length != 0 ? this.existingNotes['consultationpoint'] : null
          }
        })
      }
      this.reportATC.atcData = atcDocData || {};
      this.reportATC.profile_name = this.profileMap[atcDocData['profileid']]
      this.reportATC.directive = atcDocData["directive"] ?? null
      this.reportATC.atcpath = atcData.ref.path
      this.reportATC.product = atcDocData['product'] != null ? atcDocData['product'] : null
      this.reportATC.notesid = atcDocData['notesid'] != null ? atcDocData['notesid'] : null
      this.reportATC.date = atcDocData['prescription_date'].toDate()
      this.reportATC.atceducation = atcDocData["atceducation"] != null ? atcDocData["atceducation"] : []
      this.reportATC.validator = atcDocData["validator"]?.map(e => e.id)


      var atcActivity = Object.keys(atcDocData["bigactivity"] ?? {})
      if (atcActivity.length == 0) {
        this.reportATC.bigactivity[this.authorActivity[0].docid] = atcDocData["author"]?.map(e => e.path) ?? []
      }
      else {
        atcActivity.forEach(bigactivityID => {
          var specialist = (atcDocData["bigactivity"][bigactivityID] ?? []).map(e => "profile_data/" + e)
          if (this.otherBigActivity.filter(e => e.docid == bigactivityID).length != 0) {
            this.selectedAdditionalActivity.push({
              activity: bigactivityID,
              specialist: specialist
            })
          }
          else {
            this.reportATC.bigactivity[bigactivityID] = specialist
          }
        })
      }

      getDocs(collection(atcData.ref, "corrections")).then(async adjustment => {
        for (let i = 0; i < adjustment.docs.length; i++) {
          var adjustmentData = adjustment.docs[i].data()
          this.reportATC.transcription.push({
            adjData: null,
            adjustment: "",
            awareness: null,
            awarenessdetail: null,
            potentialyears: null,
            adjustmentedit: "",
            adjustmentdelete: false,
            originalADJvalue: false,
            procedure: [],
            adjustmentpath: "",
            implementationagent: [],
          })
          this.reportATC.transcription[i].adjData = adjustmentData
          this.reportATC.transcription[i].adjustment = adjustmentData['name']
          this.reportATC.transcription[i].adjustmentedit = adjustmentData['name']
          this.reportATC.transcription[i].awareness = adjustmentData['awareness'] ?? null
          this.reportATC.transcription[i].awarenessdetail = adjustmentData['awarenessdetail'] ?? null
          this.reportATC.transcription[i].potentialyears = adjustmentData['potentialyears'] ?? null
          this.reportATC.transcription[i].adjustmentdelete = adjustmentData['isdelete'] != null ? adjustmentData['isdelete'] : false
          this.reportATC.transcription[i].originalADJvalue = adjustmentData['isdelete'] != null ? adjustmentData['isdelete'] : false
          this.reportATC.transcription[i].adjustmentpath = adjustment.docs[i].ref.path
          this.reportATC.transcription[i].implementationagent = adjustmentData['implementationagent'] ?? []

          getDocs(collection(adjustment.docs[i].ref, "procedures")).then(procedure => {
            totalProcedureRead = totalProcedureRead + 1
            for (let j = 0; j < procedure.docs.length; j++) {
              var procedureData = procedure.docs[j].data()
              this.reportATC.transcription[i].procedure.push({
                procedureData: null,
                name: "",
                proceduredelete: false,
                procedurepath: "",
                originalPROvalue: false,
                newprocedure: false,
                recommended_to: null,
                // assigned_to : [],
                bigactivity: {},
                mandatory: false,
                completed: false
              })
              this.reportATC.transcription[i].procedure[j].procedureData = procedureData
              this.reportATC.transcription[i].procedure[j].name = this.procedureMap[procedureData['name'].path]
              this.reportATC.transcription[i].procedure[j].proceduredelete = procedureData['isdelete'] != null ? procedureData['isdelete'] : false
              this.reportATC.transcription[i].procedure[j].originalPROvalue = procedureData['isdelete'] != null ? procedureData['isdelete'] : false
              this.reportATC.transcription[i].procedure[j].procedurepath = procedure.docs[j].ref.path
              this.reportATC.transcription[i].procedure[j].newprocedure = false
              var agentList = []
              if (procedure.docs[j].data()['assigned_to'] != null) {
                for (let a = 0; a < procedure.docs[j].data()["assigned_to"].length; a++) {
                  const changeagent = procedure.docs[j].data()["assigned_to"][a];
                  agentList.push(changeagent.path)
                }
              }
              // this.reportATC.transcription[i].procedure[j].assigned_to = agentList
              var procedureLevel = Object.keys(procedureData["bigactivity"] ?? {})
              if (procedureLevel.length == 0) {
                this.reportATC.transcription[i].procedure[j].bigactivity[this.assignedtoActivity[0].docid] = procedureData["assigned_to"]?.map(e => e.path) ?? []
              }
              else {
                procedureLevel.forEach(e => {
                  this.reportATC.transcription[i].procedure[j].bigactivity[e] = (procedureData["bigactivity"][e] ?? []).map(e => "profile_data/" + e)
                })
              }
            }
            // console.log(totalProcedureRead, adjustment.size)
            if (totalProcedureRead == adjustment.size) {
              this.getATCoptions()
            }
          })
        }
      })
    })
    if (this.roles["mentor"]) {
      // await this.firestore.collection("pick_for_mentoring",ref =>ref.where('atcid','==',this.atcID)).get().toPromise().then(async snap => {
      //   if(snap.docs.length != 0){
      //     this.editNotes.mentorid = snap.docs[0].id
      //     var currentMentoringNotes = snap.docs[0].data()
      //     this.editNotes.mentoringnote = currentMentoringNotes['mentoringnote']
      //   }
      // })
    }
    console.log(this.reportATC)
  }

  async getATCoptions() {
    console.log("ATC Draft")
    this.draftStatus = {
      message: "Draft not saved yet.",
      code: 0
    }
    this.loading = false
    var draftATC = []
    const atcid = this.reportATC.atcData["atcid"];
    if (navigator.onLine) {
      await getDoc(doc(this.firestoreATC, "temporary_edit_ATC", atcid)).then(snap => {
        if (snap.exists() && snap.data()["delete"] != true) {
          draftATC = [snap]
        }
      })
    } else {
      // offline: read the edit-draft from our local cache (Firestore persistence cache is gone)
      const local = await this.draftService.loadLocal('temporary_edit_ATC', atcid);
      if (local && local["delete"] != true) {
        draftATC = [{ id: atcid, data: () => local, ref: { path: `temporary_edit_ATC/${atcid}` } }];
      }
    }
    if (draftATC.length != 0) {
      var dialogRef = this.dialog.open(AtcOptionComponent, {
        data: {
          drafts: draftATC,
          assignments: [],
          initiated: [],
          mapProfile: {}
        },
        autoFocus: false,
        maxHeight: "90vh",
        disableClose: true
      })
      dialogRef.afterClosed().toPromise().then(async selectedATC => {
        if (selectedATC != null) {
          var atc = selectedATC
          if (atc["type"] == "draft") {
            // reconcile the server draft with this device's local cache (true divergence → user picks; loser archived)
            var value: any;
            if (navigator.onLine) {
              value = await this.draftService.reconcileOnOpen(this.firestoreATC, 'temporary_edit_ATC', atcid, atc["doc"].data(), (mine, theirs) => this.openConflictDialog(mine, theirs))
            } else {
              value = (await this.draftService.loadLocal('temporary_edit_ATC', atcid)) ?? atc["doc"].data()
            }
            this.reportATC.bigactivity = value["bigactivity"] ?? {}
            this.selectedAdditionalActivity = value["otheractivity"] ?? []
            this.reportATC.directive = value["directive"] ?? null
            this.reportATC.transcription = value["transcript"] ?? []
            this.updatedAdjustment = value["updatedadjustment"] ?? []
            this.newTranscription = value["newtranscript"] ?? []
            this.editNotes.consultationsummary = value["consultationsummary"] ?? null
            this.editNotes.consultationpoint = value["consultationpoint"] ?? null
            this.editNotes.notes = value["notes"] ?? null
            this.editNotes.notesedited = value["notesedited"] ?? false
            // this.editNotes.mentoringnote = value["mentornotes"] ?? null
            // re-attach any media captured offline during a previous edit session
            const pendingMedia = await this.mediaCache.listByDraft(this.reportATC.atcData["atcid"]);
            this.reattachPendingMedia(pendingMedia);
            this.draftStatus = {
              message: "ATC Draft Imported Successfully.",
              code: 1
            }
            if (value["lastupdated"]) {
              // lastupdated may be a Firestore Timestamp (server read) or a JS Date (local cache) — handle both
              this.lastDraftSavedOn = this.toJsDate(value["lastupdated"])
            }
          }
        }
      })
    }
  }

  async autoSave() {
    // chain each save after the previous one so writes stay in order
    this.autoSaveInFlight = (this.autoSaveInFlight ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.runAutoSave());
    return this.autoSaveInFlight;
  }

  async runAutoSave() {
    console.log("Auto Saved")
    try {
      if (this.reportATC.atcData["atcid"] != null) {
        this.draftStatus = {
          message: "Saving to Draft...",
          code: 0
        }

        // keep a durable local copy of any media added during editing (survives offline + app close)
        await this.mediaCache.replaceDraft(this.reportATC.atcData["atcid"], this.collectLocalMedia());

        var data = {
          date: this.datepipe.transform(this.reportATC.atcData["prescription_date"].toDate(), "yyyy-MM-dd"),
          directive: this.reportATC.directive ?? null,
          profileid: this.reportATC.atcData["profileid"],
          bigactivity: this.reportATC.bigactivity ?? {},
          otheractivity: this.selectedAdditionalActivity ?? [],
          transcript: this.reportATC.transcription ?? [],
          updatedadjustment: this.updatedAdjustment ?? [],
          newtranscript: this.newTranscription ?? [],
          accountpid: this.loggedProfileID,
          consultationsummary: this.editNotes.consultationsummary ?? null,
          consultationpoint: this.editNotes.consultationpoint ?? null,
          notes: this.editNotes.notes ?? null,
          notesedited: this.editNotes.notesedited ?? false,
          delete: false,
          lastupdated: new Date()        // client time (was serverTimestamp) so the draft is durable in the local outbox + REST fallback
        }

        // local-first: durable local write (never lost), then push to Firestore inside a rev-checked transaction.
        // A second device's edit is detected as a 'conflict' and surfaced on reopen — never silently overwritten.
        await this.draftService.saveLocal('temporary_edit_ATC', this.reportATC.atcData["atcid"], data);
        const res = await this.draftService.sync(this.firestoreATC, 'temporary_edit_ATC', this.reportATC.atcData["atcid"]);
        this.draftStatus = this.draftService.statusFor(res.outcome);
        this.lastDraftSavedOn = new Date()
      }
    } catch (error) {
      console.log(error)
      // honest message: a genuine offline state vs. anything else (incl. the SDK assertion) — never the false "network" claim
      this.draftStatus = navigator.onLine
        ? { message: "Could not save the draft just now — your changes are kept on this device and will retry.", code: -1 }
        : { message: "Saved on this device — will sync when online.", code: 1 }
    }
  }

  // ask the user which version to keep when the same edit-draft diverged across two devices (default to this
  // device's copy if dismissed — the rejected side is archived by ATCDraftService either way, nothing is lost)
  private openConflictDialog(mine: any, theirs: any): Promise<'mine' | 'theirs'> {
    const ref = this.dialog.open(DraftConflictDialogComponent, {
      data: { mine, theirs }, autoFocus: false, disableClose: true, maxWidth: '680px'
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

  // collect media blobs added during editing (for durable offline storage)
  private collectLocalMedia(): PendingMedia[] {
    const id = this.reportATC.atcData["atcid"];
    const records: PendingMedia[] = [];
    (this.audioBlob ?? []).forEach((blob, i) => {
      if (blob) records.push({ id: `${id}-audio-${i}`, draftId: id, kind: 'audio', blob, name: 'audio-' + i });
    });
    (this.selectedNoteImages ?? []).forEach((file, i) => {
      if (file) records.push({ id: `${id}-note-${i}`, draftId: id, kind: 'note', blob: file, name: file.name });
    });
    (this.selectedATCImages ?? []).forEach((file, i) => {
      if (file) records.push({ id: `${id}-atc-${i}`, draftId: id, kind: 'atc', blob: file, name: file.name });
    });
    return records;
  }

  // re-attach media captured during a previous (offline) session when the draft is reopened
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

  addAdditionalActivity() {
    this.selectedAdditionalActivity.push({
      activity: null,
      specialist: []
    })
  }

  removeAdditionalActivity(index) {
    this.selectedAdditionalActivity.splice(index, 1)
  }

  editDirective() {
    var dialogRef = this.dialog.open(UpdateDialogComponent, {
      autoFocus: false,
      data: this.reportATC.directive,
      disableClose: true,
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result => {
      if (result != null) {
        if (result.toString().trim().length != 0) {
          this.reportATC.directive = result
          this.autoSave()
        }
      }
    })
  }

  onAdjustmentUpdate(index) {
    if (!this.updatedAdjustment.includes(index)) {
      this.updatedAdjustment.push(index)
    }
    this.reportATC.transcription[index].adjustmentdelete = !this.reportATC.transcription[index].adjustmentdelete
    this.reportATC.transcription[index].procedure.forEach(procedure => {
      procedure.proceduredelete = this.reportATC.transcription[index].adjustmentdelete
    })
  }

  compareFnc(c1: any, c2: any): boolean {
    // console.log(c1,c2);
    return c1 && c2 ? c1.value === c2 : c1 === c2;
  }

  onProcedureUpdated(index, jndex) {
    if (!this.updatedAdjustment.includes(index)) {
      this.updatedAdjustment.push(index)
    }
    this.reportATC.transcription[index].procedure[jndex].proceduredelete = !this.reportATC.transcription[index].procedure[jndex].proceduredelete
    var totalProcedures = this.reportATC.transcription[index].procedure.length
    var totalProceduresDeleted = 0

    this.reportATC.transcription[index].procedure.forEach(procedurelist => {
      if (procedurelist.proceduredelete) {
        totalProceduresDeleted = totalProceduresDeleted + 1
      }
    })
    if (totalProcedures == totalProceduresDeleted) {
      this.reportATC.transcription[index].adjustmentdelete = true
    }
    else {
      this.reportATC.transcription[index].adjustmentdelete = false
    }
  }

  editAdjustment(index) {
    var text = this.reportATC.transcription[index].adjustmentedit
    var dialogRef = this.dialog.open(UpdateDialogComponent, {
      autoFocus: false,
      data: text,
      disableClose: true,
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
    dialogRef.afterClosed().toPromise().then(result => {
      if (result != null) {
        if (result.toString() != this.reportATC.transcription[index].adjustment.toString()) {
          if (!this.updatedAdjustment.includes(index)) {
            this.updatedAdjustment.push(index)
          }
          this.reportATC.transcription[index].adjustmentedit = result
          this.autoSave()
        }
        else {
          console.log("No change");
        }
      }
    })
  }

  addAdditionalProcedure(index) {
    if (!this.updatedAdjustment.includes(index)) {
      this.updatedAdjustment.push(index)
    }
    this.reportATC.transcription[index].adjustmentdelete = false
    this.reportATC.transcription[index].procedure.push({
      procedureData: null,
      name: null,
      newprocedure: true,
      originalPROvalue: false,
      proceduredelete: false,
      procedurepath: "",
      recommended_to: null,
      // assigned_to : [],
      bigactivity: {},
      mandatory: false,
      completed: false
    })
  }

  removeAdditionalProcedure(index, jndex) {
    this.reportATC.transcription[index].procedure.splice(jndex, 1)
    if (this.reportATC.transcription[index].procedure.filter(e => e.newprocedure == true).length == 0) {
      this.reportATC.transcription[index].procedure.forEach(procedure => {
        procedure.proceduredelete = this.reportATC.transcription[index].adjustmentdelete
      })
    }
  }

  addnewAdjustment() {
    if (this.newTranscription.length == 0) {
      this.newTranscription.push({
        adjustment: "",
        awareness: null,
        awarenessdetail: null,
        potentialyears: null,
        procedure: [{
          name: null,
          recommended_to: null,
          // assigned_to : [],
          bigactivity: {},
          mandatory: false,
          completed: false
        }]
      })
    }
    else if (this.newTranscription[this.newTranscription.length - 1].adjustment != "" && this.newTranscription[this.newTranscription.length - 1].procedure[0].name != null) {
      this.newTranscription.push({
        adjustment: "",
        awareness: null,
        awarenessdetail: null,
        potentialyears: null,
        procedure: [{
          name: null,
          recommended_to: null,
          // assigned_to : [],
          bigactivity: {},
          mandatory: false,
          completed: false
        }]
      })
    }
    else {
      alert("Fill Previous One And Proceed")
    }
  }

  removenewAdjustment(index) {
    this.newTranscription.splice(index, 1)
  }

  addnewProcedure(index) {
    if (this.newTranscription[index].procedure[this.newTranscription[index].procedure.length - 1].name != null) {
      this.newTranscription[index].procedure.push({
        name: null,
        recommended_to: null,
        // assigned_to : [],
        bigactivity: {},
        mandatory: false,
        completed: false
      })
    }
    else {
      alert("Fill Previous Procedures And Proceed")
    }
  }

  removeProcedure(i, j) {
    this.newTranscription[i].procedure.splice(j, 1)
  }

  sanitize(url: string) {
    return this.domSanitizer.bypassSecurityTrustUrl(url);
  }

  // upload recording
  audioUpload(audio) {
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
    this.autoSave();  // draft the new recording (also caches it locally for offline)
  }

  // Process Error.
  errorCallback(error) {
    this.recording = false;
    alert(error)
  }

  startCount() {
    this.countDown = "00 : 00";
    var interval = timer(0, 1000)
    this.countDownSubscription = interval.subscribe(value => {
      var minutes = (Math.floor(value / 60)).toString()
      var seconds = (value % 60).toString()
      minutes = minutes.length == 1 ? "0" + minutes : minutes
      seconds = seconds.length == 1 ? "0" + seconds : seconds
      this.countDown = minutes + " : " + seconds
    })
  }

  endCount() {
    this.countDownSubscription.unsubscribe()
  }

  removeAudio(index) {
    if (confirm("Do you want to remove the recording?")) {
      this.audioBlob.splice(index, 1)
      this.audioBlobURL.splice(index, 1)
      this.autoSave();  // re-snapshot media so the removed item is dropped from the local cache
    }
  }

  importImages(images) {
    this.selectedNoteImages = Array.from(images)
    this.previewNoteImages = []
    for (let i = 0; i < this.selectedNoteImages.length; i++) {
      const pic = this.selectedNoteImages[i];
      var reader = new FileReader()
      reader.readAsDataURL(pic)
      reader.onload = (event => {
        this.previewNoteImages.push(event.target.result)
      })
    }
    console.log(this.selectedNoteImages, this.previewNoteImages)
    this.autoSave();  // draft the imported note images (also caches them locally for offline)
  }

  removeImage(index) {
    console.log(index)
    this.selectedNoteImages.splice(index, 1)
    this.previewNoteImages.splice(index, 1)
    this.autoSave();  // re-snapshot media so the removed item is dropped from the local cache
  }

  importATCImages(images) {
    this.selectedATCImages = Array.from(images)
    this.previewATCImages = []
    for (let i = 0; i < this.selectedATCImages.length; i++) {
      const pic = this.selectedATCImages[i];
      var reader = new FileReader()
      reader.readAsDataURL(pic)
      reader.onload = (event => {
        this.previewATCImages.push(event.target.result)
      })
    }
    console.log(this.selectedATCImages, this.previewATCImages)
    this.autoSave();  // draft the imported ATC images (also caches them locally for offline)
  }

  removeATCImage(index) {
    console.log(index)
    this.selectedATCImages.splice(index, 1)
    this.previewATCImages.splice(index, 1)
    this.autoSave();  // re-snapshot media so the removed item is dropped from the local cache
  }

  validateExistingPrescription(): boolean {
    var result: boolean = true

    var authorGiven = this.authorActivity.filter(e => (this.reportATC.bigactivity[e.docid] ?? []).length != 0)
    console.log("author", authorGiven)
    if (authorGiven.length == 0 && !this.bigActivity()) {
      result = false
      this.focusMissingField('atcfield-author', 'Author name required')
    }

    if (result) {
      for (let i = 0; i < this.reportATC.transcription.length; i++) {
        var existingAdj = this.reportATC.transcription[i]
        if (existingAdj.awareness == null || existingAdj.awarenessdetail == null || existingAdj.potentialyears == null) {
          result = false
          this.focusMissingField('', "Fill the missing Awareness Detail & Potential Years in the existing adjustments")
          break
        }
      }
    }

    if (result) {
      for (let i = 0; i < this.updatedAdjustment.length; i++) {
        if (this.reportATC.transcription[this.updatedAdjustment[i]].procedure.filter(e => e.name == null).length != 0) {
          result = false
          this.focusMissingField('', "Fill or remove the empty procedure on the existing adjustments")
          break
        }
        if (i + 1 == this.updatedAdjustment.length) {
          result = true
        }
      }
    }
    return result
  }

  validateNewPrescription(): boolean {
    var result: boolean
    if (this.newTranscription.length == 0) {
      result = true
    }
    else {
      for (let i = 0; i < this.newTranscription.length; i++) {
        console.log(this.newTranscription[i]);

        if ((this.newTranscription[i]['awareness'] === null || this.newTranscription[i]['awarenessdetail'] === null) || this.newTranscription[i]['potentialyears'] === null) {
          this.focusMissingField('', "Fill the missing Awareness & Potential Years in the new adjustments")
          result = false
          break;
        }
        for (let j = 0; j < this.newTranscription[i].procedure.length; j++) {
          if (this.newTranscription[i].procedure[j].name == null) {
            if (this.newTranscription[i].adjustment.length > 0) {
              this.focusMissingField('', "Fill or remove the empty procedure row in the new adjustments")
              result = false
              i = 1000;
              j = 1000;
              break
            }
          }
          if (i == this.newTranscription.length - 1 && j == this.newTranscription[i].procedure.length - 1) {
            result = true
          }
        }
      }
    }
    return result
  }

  changeworkBriefValidation(): boolean {
    var value: boolean
    var totalMandatoryProcedure = 0
    for (let i = 0; i < this.reportATC.transcription.length; i++) {
      var element1 = this.reportATC.transcription[i]
      totalMandatoryProcedure = totalMandatoryProcedure + element1.procedure.filter(e => e.newprocedure == true && e.mandatory == true).length
    }

    for (let i = 0; i < this.newTranscription.length; i++) {
      var element2 = this.newTranscription[i]
      totalMandatoryProcedure = totalMandatoryProcedure + element2.procedure.filter(e => e.mandatory == true).length
    }
    console.log(totalMandatoryProcedure)
    if (totalMandatoryProcedure != 0 && this.audioBlob.length == 0) {
      value = false
      this.focusMissingField('atcfield-changework', 'Changework brief missing')
    }
    else {
      value = true
    }
    return value
  }

  adjustmentNewOrder = []
  /**
   * Scrolls to the field with the given anchor id (or, if none, the first invalid
   * Material field in the form), flashes a red highlight, and shows the message in
   * a top snackbar — so the user is taken to exactly what they missed.
   */
  private focusMissingField(anchorId: string, message: string) {
    try {
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

  /** Finds the first visible required-but-empty Material field (Angular marks it .ng-invalid). */
  private firstInvalidFieldElement(): HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.atc-main .ng-invalid, .atc-main mat-form-field.mat-form-field-invalid, ' +
        '.atc-main textarea.ng-invalid, .atc-main input.ng-invalid, .atc-main mat-select.ng-invalid'
      )
    );
    for (const c of candidates) {
      if (c.tagName.toLowerCase() === 'form') continue;
      const rect = c.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      return c;
    }
    return null;
  }

  async submit() {
    // mark that a submit was attempted so required fields reveal their inline "required" message
    this.submitAttempted = true;
    // block submit while offline — the ATC must reach the server before the draft is removed (changes stay saved)
    if (!navigator.onLine) {
      alert("You're offline. Your changes are saved — please reconnect to submit.");
      return;
    }
    // flush any in-flight save so the latest edits are included and the draft can't re-appear after submit
    await this.autoSave()
    var validation1: boolean = this.validateExistingPrescription()
    var validation2: boolean = this.validateNewPrescription()
    var validation3: boolean = this.collectionName == "atc_alpha" ? this.changeworkBriefValidation() : true
    if (validation1 && validation2 && validation3) {
      window.scrollTo({
        top: 0,
        behavior: 'auto',
      })
      this.hideDraftBanner = true
      console.log(this.updatedAdjustment)
      console.log(this.reportATC)

      var specialistData = []
      Object.keys(this.reportATC.bigactivity).forEach(e => {
        var activitySpecialist = this.reportATC.bigactivity[e]
        if (activitySpecialist.length != 0) {
          specialistData.push({
            activity: this.mapBigActivity[e],
            specialist: activitySpecialist.map(profile => this.profileMap[doc(this.firestoreATC, profile).id]).join(", ")
          })
        }
      })
      this.selectedAdditionalActivity.forEach(e => {
        if (e.specialist.length != 0) {
          specialistData.push({
            activity: this.mapBigActivity[e.activity],
            specialist: e.specialist.map(profile => this.profileMap[doc(this.firestoreATC, profile).id]).join(", ")
          })
        }
      })
      console.log("New Big Activity", specialistData)

      var confirmationMessage = ""
      if (this.collectionName == "atc_alpha") {
        confirmationMessage = "The changes will save as the latest version of the ATC, and the previous version will be hidden from participants."
      }
      else if (this.roles["mentor"]) {
        confirmationMessage = "The changes will save as the latest version of the ATC, marked as validated, and made visible to participants."
      }
      else {
        confirmationMessage = "The changes will be saved as the latest version of the ATC and will be visible to participants once validated by Mentors (A&H, Fellowships)."
      }

      var previewData = {
        participant: this.selectedParticipant["name"],
        product: this.reportATC.product,
        specialist: specialistData,
        directive: this.reportATC.directive,
        adjustmentlist: [...this.reportATC.transcription, ...this.newTranscription.filter(adj => adj.adjustment.trim().length != 0)],
        mapprocedure: this.procedureMap,
        confirmationmessage: confirmationMessage
      }
      console.log(previewData)

      var previewBox = this.dialog.open(PreviewAtcBeforeSubmissionComponent, {
        data: previewData,
        minWidth: "50vw",
        maxHeight: "90vh",
        maxWidth: "90vw",
        autoFocus: false,
        disableClose: true
      })

      previewBox.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(data => {
        console.log(data)
        window.scrollTo({
          top: document.body.scrollHeight,
          left: 0,
          behavior: 'auto'
        });
        this.hideDraftBanner = false
        if (data != null && data != undefined) {
          this.adjustmentNewOrder = data
          console.log("Submitting.....")
          this.uploading = true
          this.firebaseDefaultBatch = writeBatch(this.firestoreDefault)
          this.firebaseATCBatch = writeBatch(this.firestoreATC)
          this.updateChangeWorkBrief()
        }
      })


    }
  }

  async updateChangeWorkBrief() {

    try {
      // Upload audio files
      const audioPromises = this.audioBlob.map(async (blob, i) => {
        const audioID = this.audioBlobURL[i].split('/');
        const fileName = `ATC_Audio_Notes/${this.loggedProfileID}/New Audio - ${(i + 1).toString()} ${audioID[audioID.length - 1]}`;

        const storageRef = ref(this.storage, fileName);
        const snapshot = await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(snapshot.ref);

        return url;
      });

      // Upload image files
      const imagePromises = this.selectedNoteImages.map(async (imageFile) => {
        const fileName = `Uploaded ATC/${imageFile.name}${imageFile.lastModified}${imageFile.size}`;

        const storageRef = ref(this.storage, fileName);
        const snapshot = await uploadBytes(storageRef, imageFile);
        const url = await getDownloadURL(snapshot.ref);

        return url;
      });

      // Wait for all uploads to complete
      const [audioUrls, imageUrls] = await Promise.all([
        Promise.all(audioPromises),
        Promise.all(imagePromises)
      ]);

      // Update ATC notes with all URLs
      await this.updateATCnotes(audioUrls, imageUrls);

    } catch (error) {
      console.error('Error uploading files:', error);
    }
  }



  async updateATCnotes(audiobrief: string[], imagenotes: string[]) {
    console.log(this.editNotes.notesedited);
    const newATCID = doc(collection(this.firestoreATC, 'atc_alpha')).id; // Generate ID using actual collection

    if (audiobrief.length != 0 || imagenotes.length != 0 || this.editNotes.notesedited) {
      const notesID = this.reportATC.notesid ?? doc(collection(this.firestoreATC, 'atc_notes')).id;
      const notesMeta = {
        notesid: notesID,
        imagenotes: imagenotes,
      };

      const atcDocRef = doc(this.firestoreATC, this.reportATC.atcpath);
      this.firebaseATCBatch.update(atcDocRef, notesMeta);

      let audiodata: string[] = [];
      let imagedata: string[] = [];

      if (this.existingNotes != null) {
        audiodata = [...(this.existingNotes['changeworkbrief'] ?? []), ...audiobrief];
        imagedata = [...(this.existingNotes["imagenotes"] ?? []), ...imagenotes];

        this.existingNotes["logid"] = doc(collection(this.firestoreATC, 'atc_notes')).id;
        const revisionDocRef = doc(this.firestoreATC, "atc_notes", notesID, "revision", this.existingNotes["logid"]);
        this.firebaseATCBatch.set(revisionDocRef, this.existingNotes);
      }

      const newNotesData = {
        created: serverTimestamp(),
        lastupdatedby: this.loggedProfileID,
        atcid: newATCID,
        consultationsummary: this.editNotes.consultationsummary ?? null,
        consultationpoint: this.editNotes.consultationpoint ?? null,
        notes: this.editNotes.notes ?? null,
        changeworkbrief: audiodata,
        imagenotes: imagedata,
        from: this.collectionName == "atc_alpha" ? "alpha" : "validation",
      };

      const notesDocRef = doc(this.firestoreATC, "atc_notes", notesID);
      this.firebaseATCBatch.set(notesDocRef, newNotesData, { merge: true });

      await this.replicateATC(this.collectionName, newATCID, notesID);
    } else {
      await this.replicateATC(this.collectionName, newATCID, this.reportATC.notesid ?? null);
    }
  }

  async replicateATC(finalCollection: string, newid: string, noteid: string) {
    const atcDocRef = doc(this.firestoreATC, this.reportATC.atcpath);
    const newData = {
      ...this.reportATC.atcData,
      atcid: newid,
      lasteditedon: new Date(),
      editedfrom: atcDocRef
    };

    if (noteid != null) {
      newData["notesid"] = noteid;
      if (this.reportATC.atcData["mentoringid"]) {
        newData["mentoringid"] = this.reportATC.atcData["mentoringid"];
      }
    }

    // Upload ATC Images
    const atcImageURL: string[] = [];
    for (let a = 0; a < this.selectedATCImages.length; a++) {
      const imageFile = this.selectedATCImages[a];
      const fileName = `Online ATC Images/${imageFile.name}${imageFile.lastModified}${imageFile.size}`;
      const storageRef = ref(this.storage, fileName);

      try {
        const snapshot = await uploadBytes(storageRef, imageFile);
        const imageURL = await getDownloadURL(snapshot.ref);
        atcImageURL.push(imageURL);
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    }

    console.log(atcImageURL);
    newData["prescription_image"] = [...(newData["prescription_image"] ?? []), ...atcImageURL];
    newData["directive"] = this.reportATC.directive ?? null;

    this.reportATC.bigactivity = this.reportATC.bigactivity ?? {};
    const newBigActivity: any = {};
    const newAuthorRef: DocumentReference[] = [];
    const newObserverRef: DocumentReference[] = [];

    Object.keys(this.reportATC.bigactivity).forEach(e => {
      if (this.reportATC.bigactivity[e].length != 0) {
        const activitySpecialist = this.reportATC.bigactivity[e];
        newBigActivity[e] = activitySpecialist.map((path: string) => doc(this.firestoreATC, path).id);
      }
    });

    this.selectedAdditionalActivity.forEach(additional => {
      if (additional.specialist.length != 0) {
        newBigActivity[additional.activity] = additional.specialist.map((path: string) => doc(this.firestoreATC, path).id);
      }
    });

    console.log("New Big Activity", newBigActivity);

    this.authorActivity.forEach(activityitem => {
      const refs = (this.reportATC.bigactivity[activityitem.docid] ?? []).map((path: string) => doc(this.firestoreATC, path));
      newAuthorRef.push(...refs);
    });

    this.observerActivity.forEach(activityitem => {
      const refs = (this.reportATC.bigactivity[activityitem.docid] ?? []).map((path: string) => doc(this.firestoreATC, path));
      newObserverRef.push(...refs);
    });

    newData["bigactivity"] = newBigActivity;
    newData["author"] = newAuthorRef;
    newData["observer"] = newObserverRef.length == 0 ? null : newObserverRef;

    console.log("new Data", newData);

    // evolutionprogressdate
    if (this.newTranscription.length != 0) {
      newData['evolutionprogressdate'] = new Date();
    }

    // Batch operations
    const finalCollectionDocRef = doc(this.firestoreATC, finalCollection, newid);
    this.firebaseATCBatch.set(finalCollectionDocRef, newData, { merge: true });

    //Big Activity
    if(this.bigActivity()){
      newData['assignmentid'] = this.assignmentId
      newData['participantassignmentid'] = this.participantAssignmentId
      newData['marathonid'] = this.marathonId
      newData['bigassignment'] = true;

      this.firebaseDefaultBatch.update(doc(this.firestoreDefault, 'big participants assignments', this.participantAssignmentId), {
        status: 'review',
        activityref: doc(this.firestoreDefault, finalCollectionDocRef.path),
        atcdocid: finalCollectionDocRef.id
      });
    }
    
    for (let i = 0; i < this.adjustmentNewOrder.length; i++) {
      const newOrder = this.adjustmentNewOrder[i];
      const adjustmentKey = "adjustment " + ((i + 1).toString().length == 1 ? "0" + (i + 1).toString() : (i + 1).toString());
      const adjDocRef = doc(this.firestoreATC, finalCollection, newid, "corrections", adjustmentKey);
      const adjPath = adjDocRef.path;

      if (newOrder["adjData"] != null && newOrder["adjData"] != undefined) {
        // Update Existing Adjustment
        for (let j = 0; j < newOrder.procedure.length; j++) {
          const procedureKey = adjustmentKey + " - " + ((j + 1).toString());
          const procedureDocRef = doc(this.firestoreATC, adjPath, "procedures", procedureKey);
          const procedurePath = procedureDocRef.path;

          let assignref: DocumentReference[] = [];
          const procedurelevelBigActivity: any = {};

          Object.keys(newOrder.procedure[j].bigactivity).forEach(key => {
            (newOrder.procedure[j].bigactivity[key] ?? []).forEach((item: string) => {
              assignref.push(doc(this.firestoreATC, item));
              procedurelevelBigActivity[key] = procedurelevelBigActivity[key] ?? [];
              procedurelevelBigActivity[key].push(doc(this.firestoreATC, item).id);
            });
          });

          assignref = Array.from(new Set(assignref));

          // Add New Procedures
          if (newOrder.procedure[j].newprocedure) {
            const newProcedureData = {
              name: doc(this.firestoreATC, newOrder.procedure[j].name),
              recommended_to: newOrder.procedure[j].recommended_to != null ? doc(this.firestoreATC, newOrder.procedure[j].recommended_to) : null,
              assigned_to: assignref.length != 0 ? assignref : null,
              bigactivity: procedurelevelBigActivity,
              created: serverTimestamp(),
              mandatory: newOrder.procedure[j].mandatory,
              isdelete: false,
              product: this.reportATC.product,
              newlyadded: true,
              addedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
              status: newOrder.procedure[j].completed ? "completed" : "yet to start",
              cancelled: false,
              autogeneralized: false,
              editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID)
            };
            this.firebaseATCBatch.set(procedureDocRef, newProcedureData, { merge: true });
          }
          // Update Procedure
          else {
            if (newOrder.procedure[j].originalPROvalue != newOrder.procedure[j].proceduredelete) {
              const updateProcedureData = {
                ...newOrder.procedure[j].procedureData,
                isdelete: newOrder.procedure[j].proceduredelete,
                editedon: serverTimestamp(),
                editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID)
              };
              this.firebaseATCBatch.set(procedureDocRef, updateProcedureData, { merge: true });
            } else {
              const updateProcedureData = { ...newOrder.procedure[j].procedureData };
              this.firebaseATCBatch.set(procedureDocRef, updateProcedureData, { merge: true });
            }
          }
        }

        // Update Adjustment
        const oldawarness = newOrder.adjData["awareness"];
        const oldawarenessdetail = newOrder.adjData["awarenessdetail"];
        const oldpotentialyears = newOrder.adjData["potentialyears"];

        if (
          (newOrder.originalADJvalue != newOrder.adjustmentdelete) ||
          (newOrder.adjustment != newOrder.adjustmentedit) ||
          (oldawarness != newOrder.awareness) ||
          (oldawarenessdetail != newOrder.awarenessdetail) ||
          (oldpotentialyears != newOrder.potentialyears)
        ) {
          const newAdjData = {
            ...newOrder.adjData,
            name: newOrder.adjustmentedit,
            awareness: newOrder.awareness,
            awarenessdetail: newOrder.awarenessdetail,
            potentialyears: newOrder.potentialyears,
            isdelete: newOrder.adjustmentdelete,
            editedon: serverTimestamp(),
            editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID)
          };
          this.firebaseATCBatch.set(adjDocRef, newAdjData, { merge: true });
        } else {
          this.firebaseATCBatch.set(adjDocRef, newOrder.adjData, { merge: true });
        }
      } else {
        if (newOrder.adjustment.trim().length != 0) {
          const adjAgent: any[] = [];

          for (let j = 0; j < newOrder.procedure.length; j++) {
            const procedureKey = adjustmentKey + " - " + ((j + 1).toString());
            const procedureDocRef = doc(this.firestoreATC, adjPath, "procedures", procedureKey);

            let assignref: DocumentReference[] = [];
            const procedurelevelBigActivity: any = {};

            Object.keys(newOrder.procedure[j].bigactivity).forEach(key => {
              (newOrder.procedure[j].bigactivity[key] ?? []).forEach((item: string) => {
                assignref.push(doc(this.firestoreATC, item));
                procedurelevelBigActivity[key] = procedurelevelBigActivity[key] ?? [];
                procedurelevelBigActivity[key].push(doc(this.firestoreATC, item).id);
              });
            });

            assignref = Array.from(new Set(assignref));

            const additionalProcedureData = {
              name: doc(this.firestoreATC, newOrder.procedure[j].name),
              recommended_to: newOrder.procedure[j].recommended_to != null ? doc(this.firestoreATC, newOrder.procedure[j].recommended_to) : null,
              assigned_to: assignref.length != 0 ? assignref : null,
              bigactivity: procedurelevelBigActivity,
              created: serverTimestamp(),
              mandatory: newOrder.procedure[j].mandatory,
              isdelete: false,
              product: this.reportATC.product,
              newlyadded: true,
              status: newOrder.procedure[j].completed ? "completed" : "yet to start",
              cancelled: false,
              autogeneralized: false,
              editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID)
            };
            this.firebaseATCBatch.set(procedureDocRef, additionalProcedureData);
          }

          const additionaAdjustmentData = {
            name: newOrder.adjustment,
            awareness: newOrder.awareness,
            awarenessdetail: newOrder.awarenessdetail,
            potentialyears: newOrder.potentialyears,
            created: serverTimestamp(),
            isdelete: false,
            newlyadded: true,
            implementationagent: adjAgent,
            editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID)
          };
          this.firebaseATCBatch.set(adjDocRef, additionaAdjustmentData);
        }
      }
    }

    await this.completed(finalCollectionDocRef);
  }

  async completed(toatcref: DocumentReference) {
    console.log("Done");
    try {
      const updateATCdata = {
        status: "upgraded",
        upgradedto: toatcref,
        isdelete: true
      };

      const originalAtcDocRef = doc(this.firestoreATC, this.reportATC.atcpath);
      const tempEditDocRef = doc(this.firestoreATC, "temporary_edit_ATC", this.reportATC.atcData["atcid"]);

      this.firebaseATCBatch.update(originalAtcDocRef, updateATCdata);
      this.firebaseATCBatch.update(tempEditDocRef, { delete: true });

      await this.firebaseATCBatch.commit();
      await this.firebaseDefaultBatch.commit();

      // clear locally-cached media AND the local draft copy for the submitted ATC (server soft-delete is in the batch above)
      await this.mediaCache.deleteByDraft(this.reportATC.atcData["atcid"]);
      await this.draftService.purgeLocal('temporary_edit_ATC', this.reportATC.atcData["atcid"]);

      if (this.roles["mentor"] && !this.bigActivity()) {
        const existingValidator = Array.from(new Set([...(this.reportATC.validator ?? []), this.loggedProfileID]));
        const newATCData = {
          status: "validated",
          validator: existingValidator.map(e => doc(this.firestoreATC, "profile_data", e))
        };

        try {
          await updateDoc(toatcref, newATCData);
        } catch (err) {
          console.log(err);
        }
      }

      this.uploading = false;
      alert("Updated Successfully");
      window.self.close();
    } catch (error) {
      console.log(error);
      this.uploading = false;
    }
  }

  updateExistingAwarenessDetail(i: number, event: any) {
    console.log("onAwarenessSubmit", i, event.value);
    this.reportATC.transcription[i]['awareness'] = event.value['aware'];
    this.reportATC.transcription[i]['awarenessdetail'] = event.value['value'];
    this.autoSave();
  }

  onAwarenessSubmit(i: number, event: any) {
    console.log("onAwarenessSubmit", i, event.value);
    this.newTranscription[i]['awareness'] = event.value['aware'];
    this.newTranscription[i]['awarenessdetail'] = event.value['value'];
    this.autoSave();
  }

  onPotentialYearUpdate(i: number, event: Event) {
    console.log(i, parseInt((event.target as HTMLInputElement).value), typeof ((event.target as HTMLInputElement).value));
    const textValue = parseInt((event.target as HTMLInputElement).value);
    this.newTranscription[i]['potentialyears'] = textValue;
    this.autoSave();
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