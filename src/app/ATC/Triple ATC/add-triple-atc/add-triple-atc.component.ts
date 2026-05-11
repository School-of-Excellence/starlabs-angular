import { Component, OnDestroy } from '@angular/core';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { firstValueFrom, Subscription } from 'rxjs';
import { collection, collectionData, collectionSnapshots, doc, getDoc, getFirestore, getDocs, or, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { UpdateDialogComponent } from '../../../DialogBox/update-dialog/update-dialog.component';
import { AtcOptionComponent } from '../../atc-option/atc-option.component';
import { Clipboard } from '@angular/cdk/clipboard';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';

interface adjustmentInterface {
  adjustment: string,
  procedure: Array<procedureInterface>
}

interface procedureInterface {
  name: string,
  recommended_to: string,
  assigned_to: Array<string>,
  mandatory: boolean,
  completed: boolean
}

@Component({
  selector: 'app-add-triple-atc',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatCheckboxModule,
    DragDropModule
  ],
  templateUrl: './add-triple-atc.component.html',
  styleUrl: './add-triple-atc.component.css'
})
export class AddTripleATCComponent implements OnDestroy {
  autoSaveID = null;
  // Progess
  settingup: boolean = true
  loading = false;
  get loadingDialog() {
    return this.matDialog.open(LoadingProgressComponent, { data: { msg: 'Uploading ATC...' }, disableClose: true })
  }
  loadingref = null;

  // Roles
  roles = {}

  // Meta data
  loggedinUser;
  loggedinProfileid;
  mapProfile = {};
  procedureMap = {};

  // Dropdown Options
  filteredProfile = "";
  filteredSpecialist = ""
  marathonId:string;
  assignmentId:string;
  participantAssignmentId:string;

  profileList = [];
  specialistList = [];
  productLists = [];
  productAvailable = [];
  recommendlist = []; // For Procedure
  procedurelist = []; // Changework Names

  // Subscription
  profileSubscription: Subscription
  rolesSubscription: Subscription
  recommendationSubscription: Subscription
  procedureSubscription: Subscription
  productSubscription: Subscription

  // ATC Data
  alphaid: string
  date = null;
  product = null;
  atcdirective = null;
  participantProfileid = null;
  author = [];
  // observer = [];
  // mentee = [];
  transcript: Array<adjustmentInterface> = [{
    adjustment: "",
    procedure: [
      {
        name: null,
        recommended_to: null,
        assigned_to: [],
        mandatory: false,
        completed: false
      }
    ]
  }];

  tripleATC = []

  // Notes/Metoring
  /*
  consultationSummary = null;
  consultationpoint = null;
  casenotes = null;
  mentornotes = null;
  notesWritten = false
  */

  totalProcedures = 0;
  totalProcedureWritten = 0;

  // Queue Data
  queueList = []
  selectedQueueid = null

  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  constructor(
    public location: Location,
    public storage: Storage,
    public route: ActivatedRoute,
    public router: Router,
    public guardservice: AuthguardService,
    public datepipe: DatePipe,
    public clipboard: Clipboard,
    public matDialog: MatDialog,
  ) {
    this.settingup = true;
    this.date = datepipe.transform(new Date(), "yyyy-MM-dd");

    guardservice.getuid().then(uid => {
      this.loggedinUser = uid
    })
    guardservice.getRoles().then(roles => {
      this.roles = roles
      this.loggedinProfileid = roles["profile_ref"].id
      this.participantProfileid = this.loggedinProfileid;
      this.author = ["profile_data/" + this.loggedinProfileid]
      this.roles["transcriber"] = this.roles["transcriber"] ?? false
      this.setupData().then(() => {
        this.onProfileSelect()
        this.settingup = false
      })
    });

    this.route.queryParams.subscribe(data=>{
      console.log(data);
      if(![null,undefined].includes(data)){
        this.participantProfileid = data['profileid']
        this.marathonId = data['marathonid']
        this.assignmentId = data['assignmentid']
        this.participantAssignmentId = data['participantassignmentid']
        if(this.bigActivity()){
          getDoc(doc(this.firestoreDefault, 'big participants assignments', this.participantAssignmentId)).then((doc)=>{
            if(doc.exists()){
              if(doc.data()['status'] == 'initiated'){
                 updateDoc(doc.ref,{
                  status:'ongoing'
                });
              };
            }
          });
        } 
      }
    });

    for (let i = 0; i < 3; i++) {
      this.tripleATC.push({
        position: "",
        atc: JSON.parse(JSON.stringify(this.transcript))
      })
    }
    this.tripleATC = this.tripleATC
  }

  ngOnDestroy(): void {
    this.profileSubscription?.unsubscribe()
    this.rolesSubscription?.unsubscribe()
    this.recommendationSubscription?.unsubscribe()
    this.procedureSubscription?.unsubscribe()
    this.productSubscription?.unsubscribe()
  }

  async setupData() {
    try {
      // Fetch Profile List
      /*
      this.profileSubscription = this.firestore.collection("profile_data", ref=>ref.orderBy("name")).snapshotChanges().subscribe(profileData=>{
        var nameList = [];
        for (let i = 0; i < profileData.length; i++) {
          const profileDoc = profileData[i].payload.doc.data()
          var personLevel = []
          if(profileData[i].payload.doc.data()['installations_level'] != null){
            personLevel.push(profileData[i].payload.doc.data()['installations_level'])
          }
          if(profileData[i].payload.doc.data()['atc_level'] != null){
            personLevel.push(profileData[i].payload.doc.data()['atc_level'])
          }
          if(profileData[i].payload.doc.data()['changework_level'] != null){
            personLevel.push(profileData[i].payload.doc.data()['changework_level'])
          }
          profileDoc["level"] = personLevel
          this.mapProfile[profileDoc["profileid"]] = profileDoc
          nameList.push(profileDoc)
        }
        this.profileList = nameList
        console.log("profile loaded")
      })
      */

      // Fetch Products
      var productCollection = collection(this.firestoreDefault, "products")
      var productQuery = query(productCollection, orderBy("atcmodel"))
      this.productSubscription = collectionData(productQuery).subscribe(products => {
        this.productAvailable = products.filter(e => (e["atcmodel"] ?? "").trim().length != 0)
        this.productLists = Array.from(new Map(this.productAvailable.map(item => [item["atcmodel"], item])).values());
        console.log("Products Loaded", this.productLists)
      })

      // Fetch User Roles
      var userCollection = collection(this.firestoreDefault, "users_roles")
      var userQuery = query(userCollection, orderBy("name"))
      this.rolesSubscription = collectionData(userQuery).subscribe(userRoles => {
        var usersWithRoles = []
        var nameList = [];
        for (let i = 0; i < userRoles.length; i++) {
          const userData = userRoles[i];
          this.mapProfile[userData["profile_ref"].id] = userData
          nameList.push({
            name: userData["name"],
            profileid: userData["profile_ref"].id
          })
          if (userData['changeagent'] == true || userData['eis'] == true || userData['admin'] == true || userData['ah'] == true) {
            usersWithRoles.push({
              authorname: userData["name"],
              authorpath: userData["profile_ref"]["path"],
            })
          }
        }
        this.specialistList = usersWithRoles
        this.profileList = nameList
        console.log("Specialists loaded")
      })

      // Procedure Recommendation
      /*
      this.recommendationSubscription = this.firestore.collection("procedure_recommend", ref=>ref.orderBy("name")).snapshotChanges().subscribe(names=>{
        var list = [];
        names.forEach(type=>{
          list.push({
            name: type.payload.doc.data()["name"],
            path: type.payload.doc.ref.path
          })
        })
        this.recommendlist = list
        console.log("Recommendation loaded")
      })
      */

      // Fetch changeworks
      var procedureCollection = collection(this.firestoreDefault, "procedures")
      var procedureQuery = query(procedureCollection, orderBy("name"))
      this.procedureSubscription = collectionSnapshots(procedureQuery).subscribe(procedureList => {
        var list = []
        for (let i = 0; i < procedureList.length; i++) {
          var procedure = procedureList[i]
          var procedureData = procedure.data()
          this.procedureMap[procedure.id] = procedureData["name"]
          list.push({
            procedurepath: procedure.ref.path,
            procedurename: procedureData["name"]
          })
        }
        this.procedurelist = list
        console.log("Procedures loaded")
      })

      // Check if inside a Queue
      var queueCollection = collection(this.firestoreDefault, "queue generation")
      var queueQuery = query(queueCollection, orderBy("queueenddate", "desc"))
      await getDocs(queueQuery).then(async queuesnap => {
        this.queueList = queuesnap.docs.map(e => e.data())
      });
    } catch (error) {
      console.log(error)
    }
  }

  copyToClipboard() {
    var hostname = window.location.origin
    var url = hostname + "/liveprescription/" + this.autoSaveID
    this.clipboard.copy(url)
  }

  onProductSelect() {
    console.log("Selected Product", this.product)
    var selectedIndex = this.productAvailable.findIndex(e => e["atcmodel"] == this.product && e["directive"] != null)
    if (selectedIndex != -1) {
      var givenDirective = (this.productAvailable[selectedIndex]["directive"] ?? "").trim()
      this.atcdirective = givenDirective.length == 0 ? null : givenDirective
    }
    else {
      this.atcdirective = null
    }
  }

  /*
  onObserverSelect(){
    this.mentorOption = Array.from(new Set([...this.relatedATCauthor, ...this.observer.map(e => this.firestore.doc(e).ref.id)]))
  }
  */

  async editDirective() {
    var dialogRef = this.matDialog.open(UpdateDialogComponent, {
      autoFocus: false,
      data: this.atcdirective,
      disableClose: true,
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
    var result = await firstValueFrom(dialogRef.afterClosed())
    if (result != null) {
      if (result.toString().trim().length != 0) {
        this.atcdirective = result
        this.autoSave()
      }
    }
  }

  availableProfileList(): Array<any> {
    var person = this.profileList.filter(e => e.name.toLowerCase().includes(this.filteredProfile.toLowerCase()))
    return person;
  }

  availableSpecialistList(): Array<any> {
    var person = this.specialistList.filter(e => e.authorname.toLowerCase().includes(this.filteredSpecialist.toLowerCase()))
    return person;
  }

  async onProfileSelect() {
    console.log("Selected Profile", this.participantProfileid)
    this.getATCoptions()
  }

  async getATCoptions() {
    console.log("ATC Draft")
    var draftATC = []
    if (this.roles["developer"] || this.roles['transcriber'] || this.loggedinProfileid == this.participantProfileid) {
      var temporaryCollection = collection(this.firestoreATC, "temporary_tripleatc")
      var temporaryQuery = query(temporaryCollection, where("profileid", "==", this.participantProfileid), where("delete", "==", false))
      draftATC = (await getDocs(temporaryQuery)).docs
    }
    this.autoSaveID = doc(collection(this.firestoreATC, 'temporary_tripleatc')).id
    if (draftATC.length != 0) {
      var dialogRef = this.matDialog.open(AtcOptionComponent, {
        data: {
          drafts: draftATC,
          initiated: [],
          mapProfile: this.mapProfile
        },
        autoFocus: false,
        maxHeight: "90vh",
        disableClose: true
      })
      var selectedATC = await firstValueFrom(dialogRef.afterClosed())
      if (selectedATC != null) {
        var atc = selectedATC
        if (atc["type"] == "draft") {
          this.autoSaveID = atc["doc"].id
          var value = atc["doc"].data()
          this.date = value['date']
          this.product = value['product']
          this.atcdirective = value['atcdirective']
          this.participantProfileid = value['profileid']
          this.author = value['author']
          this.selectedQueueid = value["selectedqueueid"]
          this.tripleATC = value["tripleatc"]
          // this.observer = value['observer']
          // this.transcript = value['transcript']
          // this.atcAssignment = value['atcassignment']
          // Notes
          /*
          this.consultationSummary = value['consultationsummary']
          this.consultationpoint = value['consultationpoint']
          this.casenotes = value['notes']
          this.mentornotes = value['mentornotes']
          */
        }
      }
    }
  }

  autoSave() {
    if (this.autoSaveID != null) {
      console.log(this.date)
      var data = {
        date: this.datepipe.transform(this.date, "yyyy-MM-dd"),
        product: this.product,
        atcdirective: this.atcdirective,
        profileid: this.participantProfileid,
        author: this.author,
        selectedqueueid: this.selectedQueueid,
        tripleatc: this.tripleATC,
        /*
        consultationsummary: this.consultationSummary,
        consultationpoint: this.consultationpoint,
        notes: this.casenotes,
        mentornotes: this.mentornotes,
        */
        accountuid: this.loggedinUser,
        accountpid: this.loggedinProfileid,
        delete: false,
        // atcassignment: this.atcAssignment,
        // observer: this.observer,
        // transcript: this.transcript,
      }
      setDoc(doc(this.firestoreATC, "temporary_tripleatc", this.autoSaveID), data).catch(err => {
        console.log(err)
      })
    }
  }

  drop(atcindex, event: CdkDragDrop<string[]>) {
    moveItemInArray(this.tripleATC[atcindex]["atc"], event.previousIndex, event.currentIndex);
  }

  addATC() {
    this.tripleATC.push({
      position: "",
      atc: JSON.parse(JSON.stringify(this.transcript))
    })
  }

  removeATC(atcindex) {
    if (confirm("Sure, do you want to remove this ATC")) {
      this.tripleATC.splice(atcindex, 1)
    }
  }

  addNewAdjustment(atcindex) {
    if (this.tripleATC[atcindex]["atc"][this.tripleATC[atcindex]["atc"].length - 1].adjustment.trim().length != 0) {
      if (this.tripleATC[atcindex]["atc"][this.tripleATC[atcindex]["atc"].length - 1].procedure[0].name != null) {
        this.tripleATC[atcindex]["atc"].push({
          adjustment: "",
          procedure: [{
            name: null,
            recommended_to: null,
            assigned_to: [],
            mandatory: false,
            completed: false
          }]
        })
      }
      else {
        alert("Fill atleast one procedure list in the current adjustments")
      }
    }
    else {
      alert("Fill Previous One And Proceed")
    }
  }

  removeAdjustment(atcindex, index) {
    if (confirm("Sure, Remove this adjustment and its procedures?")) {
      this.tripleATC[atcindex]["atc"].splice(index, 1)
    }
  }

  addnewProcedure(atcindex, index) {
    if (this.tripleATC[atcindex]["atc"][index]["procedure"][this.tripleATC[atcindex]["atc"][index]["procedure"].length - 1].name != null) {
      this.tripleATC[atcindex]["atc"][index]["procedure"].push({
        name: null,
        recommended_to: null,
        assigned_to: [],
        mandatory: false,
        completed: false
      })
    }
    else {
      alert("Fill Previous Procedures And Proceed")
    }
  }

  removeProcedure(atcindex, i, j) {
    this.tripleATC[atcindex]["atc"][i]["procedure"].splice(j, 1)
    this.autoSave()
  }

  async submit() {
    this.alphaid = doc(collection(this.firestoreATC, 'triple atc')).id
    if (this.date == null || this.date == undefined) {
      alert("Enter the Date of Prescription")
    }
    else if (this.participantProfileid == null) {
      alert("Select a Valid Profile Name")
    }
    else if (this.author.length == 0) {
      alert("Choose the author names")
    }
    else if (this.selectedQueueid == null) {
      alert("Select Event")
    }
    else if (this.product == null) {
      alert("Select a Product")
    }
    else if ((this.atcdirective ?? "").trim().length == 0) {
      alert("provide ATC directive")
    }
    /*
    else if((this.consultationpoint ?? "").trim().length == 0){
      alert("Consultation points Required")
    }
    else if((this.casenotes ?? "").trim().length == 0){
      alert("Case notes Required")
    }
    */
    else {
      var procedureCount = 0
      var conditionSatified = true
      for (let i = 0; i < this.tripleATC.length; i++) {
        const tripleatc = this.tripleATC[i];
        if (tripleatc["position"].trim().length == 0) {
          alert("Provide Preceptual Position for each ATC")
          conditionSatified = false
          break
        }
        for (let j = 0; j < tripleatc["atc"].length; j++) {
          const atc = tripleatc["atc"][j];
          if (atc["adjustment"].trim().length == 0) {
            alert("Adjustment cannot be submitted empty")
            i = this.tripleATC.length + 1
            j = tripleatc["atc"].length + 1
            conditionSatified = false
            break
          }
          for (let k = 0; k < atc["procedure"].length; k++) {
            procedureCount = procedureCount + 1
            const procedure = atc["procedure"][k];
            if (procedure["name"] == null) {
              alert("Every adjustments requires procedure. procedures cannot be submitted empty")
              i = this.tripleATC.length + 1
              j = tripleatc["atc"].length + 1
              k = atc["procedure"].length + 1
              conditionSatified = false
              break
            }
          }
        }
      }

      if (conditionSatified) {
        this.totalProcedureWritten = 0
        this.totalProcedures = procedureCount // * 2
        console.log("Total Procedure ", this.totalProcedures)
        this.uploadATC();
      }
    }
  }

  async uploadATC() {
    var queuename = null
    var queueindex = this.queueList.findIndex(e => e["docid"] == this.selectedQueueid)
    if (queueindex != null) {
      queuename = this.queueList[queueindex]["queuename"]
    }
    var confirmationMessage = `You are sumbitting this Triple ATC for the Queue '${queuename}'. This Triple ATC will be validated by A&H`
    if (confirm(confirmationMessage)) {
      var defaultBatch = writeBatch(this.firestoreDefault)
      var atcBatch = writeBatch(this.firestoreATC)
      // this.loading = true
      this.loadingref = this.loadingDialog
      var authorref = []
      // var authorlevel = {}
      for (let j = 0; j < this.author.length; j++) {
        const element = this.author[j];
        authorref.push(doc(this.firestoreDefault, element))
        // authorlevel[element.split('/')[1]] = this.mapProfile[this.firestore.doc(element).ref.id].level
      }
      console.log(authorref)
      /*
      var obseverref = []
      for (let k = 0; k < this.observer.length; k++) {
        obseverref.push(this.firestore.doc(this.observer[k]).ref)                
      }
      console.log(obseverref)
      var validatorref = []
      for (let k = 0; k < this.validator.length; k++) {
        validatorref.push(this.firestore.doc(this.validator[k]).ref)                
      }
      console.log(validatorref)
      */
      // Write on ATC Alpha
      var notesID = doc(collection(this.firestoreATC, 'atc_notes')).id
      console.log(this.alphaid)
      var alphaData = {
        atcid: this.alphaid,
        notesid: notesID,
        directive: this.atcdirective,
        // mentee: this.mentee,
        author: authorref.length == 0 ? null : authorref,
        // level: authorlevel,
        prescription_date: new Date(new Date(this.date).setHours(new Date().getHours(), new Date().getMinutes())),
        profileid: this.participantProfileid,
        product: this.product,
        type: "online",
        observer: null,
        isdelete: false,
        validator: null,
        prescription_image: null,
        queueid: this.selectedQueueid,
        status: "atc given",
        tripleatc: true,
        perceptualposition: this.tripleATC.map(e => e["position"])
      }

      //Big Activity
      if(this.bigActivity()){
        alphaData['assignmentid'] = this.assignmentId
        alphaData['participantassignmentid'] = this.participantAssignmentId
        alphaData['marathonid'] = this.marathonId
        alphaData['bigassignment'] = true;

        defaultBatch.update(doc(this.firestoreDefault, 'big participants assignments', this.participantAssignmentId), {
          status: 'review',
          activityref: doc(this.firestoreATC, collectionName, this.alphaid),
          atcdocid: this.alphaid
        });

      }

      var collectionName = "triple atc"
      console.log(alphaData)
      atcBatch.set(doc(this.firestoreATC, collectionName, this.alphaid), alphaData)
      var mergeAdjustment = []
      this.tripleATC.forEach(e => {
        e["atc"].forEach(f => {
          mergeAdjustment.push({
            ...f, ...{ perceptualposition: e["position"] }
          })
        })
      })
      console.log("Merged Adjustment", mergeAdjustment)
      for (let i = 0; i < mergeAdjustment.length; i++) {
        var atcAdjustment = mergeAdjustment[i]
        var adjustmentKey = (i + 1).toString().length == 1 ? "0" + (i + 1).toString() : (i + 1).toString()
        var adjId = "adjustment " + adjustmentKey
        var adjustmentAgent = []
        for (let a = 0; a < atcAdjustment.procedure.length; a++) {
          for (let b = 0; b < atcAdjustment.procedure[a].assigned_to.length; b++) {
            const profilePath = atcAdjustment.procedure[a].assigned_to[b]
            if (!adjustmentAgent.includes(profilePath.split('/')[1])) {
              adjustmentAgent.push(profilePath.split('/')[1])
            }
          }
        }
        var adjData = {
          name: atcAdjustment.adjustment,
          created: serverTimestamp(),
          isdelete: false,
          implementationagent: adjustmentAgent,
          perceptualposition: atcAdjustment["perceptualposition"]
        }
        atcBatch.set(doc(this.firestoreATC, collectionName, this.alphaid, "corrections", adjId), adjData)
        for (let j = 0; j < atcAdjustment.procedure.length; j++) {
          var procedureID = adjId + " - " + (j + 1).toString()
          var assignref = []
          // var assignlevel = {}
          for (let a = 0; a < atcAdjustment.procedure[j].assigned_to.length; a++) {
            const profilePath = atcAdjustment.procedure[j].assigned_to[a]
            assignref.push(doc(this.firestoreDefault, profilePath))
            // assignlevel[profilePath.split('/')[1]] = this.mapProfile[this.firestoreDefault.doc(profilePath).ref.id].level
          }
          // console.log(assignlevel)
          console.log(atcAdjustment.procedure[j].recommended_to != null ? doc(this.firestoreDefault, atcAdjustment.procedure[j].recommended_to) : null)
          console.log(assignref.length != 0 ? assignref : null)

          var procedureData = {
            name: doc(this.firestoreDefault, atcAdjustment.procedure[j].name),
            assigned_to: assignref.length != 0 ? assignref : null,
            // level: assignlevel,
            // recommended_to: atcAdjustment.procedure[j].recommended_to != null ? this.firestore.doc(atcAdjustment.procedure[j].recommended_to).ref : null,
            status: atcAdjustment.procedure[j].completed ? "completed" : "yet to start",
            created: serverTimestamp(),
            mandatory: atcAdjustment.procedure[j].mandatory,
            cancelled: false,
            isdelete: false,
            autogeneralized: false,
            product: this.product,
          }
          atcBatch.set(doc(this.firestoreATC, collectionName, this.alphaid, "corrections", adjId, "procedures", procedureID), procedureData)
        }
      }
      atcBatch.commit().then(() => {
        defaultBatch.commit()
        this.uploadCompleted()
      })
      console.log("Done")
    }
  }

  /*
  async uploadATCnotes(notesID, audiobrief, imagenotes){
    if((this.mentornotes ?? "").trim().length != 0){
      await this.firestore.collection("pick_for_mentoring").doc(this.alphaid).set({
        profileid: this.participantProfileid,
        author: this.author.map(e => this.firestore.doc(e).ref),
        prescription_date: new Date(new Date(this.date).setHours(new Date().getHours(), new Date().getMinutes())),
        atcid: this.alphaid,
        mentoringnote: this.mentornotes,
        from: "triple atc",
        mentorperson: this.loggedinProfileid,
        created: firebase.default.firestore.FieldValue.serverTimestamp()
      })
    }
    await this.firestore.collection("atc_notes").doc(notesID).set({
      lastupdated: firebase.default.firestore.FieldValue.serverTimestamp(),
      lastupdatedby: this.loggedinProfileid,
      atcid : this.alphaid,
      consultationsummary : this.consultationSummary ?? null,
      consultationpoint: this.consultationpoint ?? null,
      notes : this.casenotes ?? null,
      changeworkbrief : audiobrief,
      imagenotes: imagenotes,
    }).then(()=>{
      this.notesWritten = true
      if(this.totalProcedureWritten == this.totalProcedures){
        this.uploadCompleted()
      }
      else{
        console.log("total procedure", this.totalProcedures, "Total written", this.totalProcedureWritten)
      }
    }).catch(err=>{
      console.log(err)
    })
  }
  */

  async uploadCompleted() {
    console.log(this.totalProcedureWritten, this.totalProcedures)
    // if(this.notesWritten){
    updateDoc(doc(this.firestoreATC, "temporary_tripleatc", this.autoSaveID), { delete: true }).catch(err => {
      console.log(err)
    })
    this.loadingref?.close()
    alert("Triple ATC submitted successfully.")
    this.router.navigateByUrl("/viewtripleATC")
    // }
    // else{
    //   console.log("Brief pending")
    // }
  }

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
