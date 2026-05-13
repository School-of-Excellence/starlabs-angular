import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { collection, doc, getFirestore, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../../authguard.service';
import { UpdateDialogComponent } from '../../../DialogBox/update-dialog/update-dialog.component';
import { AtcOptionComponent } from '../../atc-option/atc-option.component';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-edit-triple-atc',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    DragDropModule
  ],
  templateUrl: './edit-triple-atc.component.html',
  styleUrl: './edit-triple-atc.component.css'
})
export class EditTripleATCComponent implements OnDestroy {

  collectionName = "triple atc"
  atcID: string
  loading: boolean = true
  loggedProfileID: string

  tripleATC = []
  finalATCmode = false
  finalATC = []
  atcnewid = null

  reportATC = {
    atcData: null,
    profile_name: null,
    directive: null,
    authors: "",
    date: '',
    product: "",
    atcpath: "",
    notesid: null,
    atceducation: [],
    validator: [],
    transcription: [{
      newadjustment: false,
      selected: false,
      comment: null,
      adjData: null,
      perceptualposition: "",
      adjustment: "",
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
        assigned_to: [],
        mandatory: false,
      }]
    }]
  }

  updatedAdjustment = []

  newTranscription = [{
    perceptualposition: "",
    adjustment: "",
    comment: "",
    procedure: [{
      name: null,
      recommended_to: null,
      assigned_to: [],
      mandatory: false,
    }]
  }]

  procedureList = []
  procedureMap = {}
  profileMap = {}
  // levelMap = {}
  uploading: boolean = false

  // Image Notes
  selectedNoteImages = []
  previewNoteImages = []
  // Image ATC
  selectedATCImages = []
  previewATCImages = []

  //map notes
  roles: any = {}
  /*
  existingNotes = null
  editNotes = {
    noteid: null,
    notes: null, // Case note
    consultationsummary: null,
    consultationpoint: null,
    mentoringnote: null,
    mentorid: null,
    mentor: [],
    notesedited: false,
    mentoredited: false
  }
  */

  // Filer
  profileList = []
  filteredSpecialist = ""

  marathonId:string;
  assignmentId:string;
  participantAssignmentId:string;

  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  constructor(
    // public firestore: Firestore,
    public storage: Storage,
    public router: Router,
    public route: ActivatedRoute,
    public guard: AuthguardService,
    public dialog: MatDialog,
    public location: Location,
    public datepipe: DatePipe
  ) {
    this.reportATC = {
      atcData: null,
      profile_name: null,
      directive: null,
      authors: "",
      date: '',
      product: "",
      atcpath: "",
      notesid: null,
      transcription: [],
      atceducation: [],
      validator: [],
    }
    this.newTranscription = []

    route.params.subscribe(data => {
      console.log(data)
      this.atcID = data["atc"]
      console.log(this.atcID)
      guard.getRoles().then(async roles => {
        this.roles = roles
        this.loggedProfileID = roles.profile_ref.id
        this.roles = roles
        // var superRoles = roles["admin"] || roles["ah"] || roles["mentor"]
        // if (superRoles || roles["eis"]) {
          this.fetchMetaData()
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

    route.queryParams.subscribe((data)=>{
      this.marathonId = data['marathonid']
      this.assignmentId = data['assignmentid']
      this.participantAssignmentId = data['participantassignmentid'] 
    });
  }

  ngOnDestroy(): void {

  }

  fetchMetaData() {
    var procedureCollection = collection(this.firestoreDefault, "procedures")
    var procedureQuery = query(procedureCollection, orderBy("name"))
    getDocs(procedureQuery).then(procedures => {
      var list = []
      procedures.forEach(doc => {
        var data = doc.data()
        list.push({
          name: data['name'],
          path: doc.ref.path
        })
        this.procedureMap[doc.ref.path] = data['name']
      })
      this.procedureList = list
    })

    var profileCollection = collection(this.firestoreDefault, "users_roles")
    var profileQuery = query(profileCollection, where("mentor", "==", true))
    getDocs(profileQuery).then(profile => {
      profile.docs.forEach(doc => {
        var data = doc.data()
        if (data["profile_ref"] == undefined) {
          console.log(doc.ref.path)
        }
        this.profileList.push({
          name: data["name"],
          profileid: data["profile_ref"].id
        })
      })
    })
  }

  availableSpecialistList(): Array<any> {
    var person = this.profileList.filter(e => e.name.toLowerCase().includes(this.filteredSpecialist.toLowerCase()))
    return person;
  }

  async getATC() {
    var date = new Date()
    var totalProcedureRead = 0
    var atcDoc = doc(this.firestoreATC, this.collectionName, this.atcID)
    await getDoc(atcDoc).then(async atcData => {
      var atcDocData = atcData.data()

      // Map Profile
      var profileInvolved = [atcDocData["profileid"], ...(atcDocData['author'] ?? []).map(e => e.id)]
      profileInvolved = Array.from(new Set(profileInvolved))
      for (let i = 0; i < profileInvolved.length; i += 30) {
        const element = profileInvolved.slice(i, i + 30);
        var profileCollection = collection(this.firestoreDefault, "profile_data")
        await getDocs(query(profileCollection, where("profileid", "in", element))).then(list => {
          list.docs.forEach(doc => {
            this.profileMap[doc.id] = doc.data()["name"]
          })
        })
      }

      this.reportATC.atcData = atcDocData
      this.reportATC.profile_name = this.profileMap[atcDocData['profileid']]
      this.reportATC.directive = atcDocData["directive"]
      this.reportATC.atcpath = atcData.ref.path
      this.reportATC.product = atcDocData['product'] != null ? atcDocData['product'] : null
      this.reportATC.notesid = atcDocData['notesid'] != null ? atcDocData['notesid'] : null
      this.reportATC.date = atcDocData['prescription_date'].toDate()
      this.reportATC.atceducation = atcDocData["atceducation"] != null ? atcDocData["atceducation"] : []
      this.reportATC.validator = (atcDocData["validator"] ?? []).length == 0 ? [this.loggedProfileID] : atcDocData["validator"].map(e => e.id)

      var authorList = []
      if (atcDocData['author'] != null) {
        for (let a = 0; a < atcDocData['author'].length; a++) {
          var name = this.profileMap[atcDocData['author'][a].id]
          // var level = this.levelMap[atcDocData['author'][a].path] == null ? null : this.levelMap[atcDocData['author'][a].path]
          var data = name // + (level != null ? " (" + level.join(', ') + ")" : "")
          authorList.push(data)
        }
      }
      this.reportATC.authors = authorList.join(', ')
      var adjCollection = collection(this.firestoreATC, atcData.ref.path, "corrections")
      getDocs(adjCollection).then(async adjustment => {
        for (let i = 0; i < adjustment.docs.length; i++) {
          var adjDoc = adjustment.docs[i]
          var adjData = adjDoc.data()
          this.reportATC.transcription.push({
            newadjustment: false,
            selected: false,
            adjData: null,
            comment: null,
            perceptualposition: "",
            adjustment: "",
            adjustmentedit: "",
            adjustmentdelete: false,
            originalADJvalue: false,
            procedure: [],
            adjustmentpath: "",
            implementationagent: [],
          })
          this.reportATC.transcription[i].adjData = adjData
          this.reportATC.transcription[i].newadjustment = false
          this.reportATC.transcription[i].comment = adjData["comment"] ?? null
          this.reportATC.transcription[i].adjustment = adjData["name"]
          this.reportATC.transcription[i].perceptualposition = adjData["perceptualposition"]
          this.reportATC.transcription[i].adjustmentedit = adjData["name"]
          this.reportATC.transcription[i].adjustmentdelete = adjData["isdelete"] ?? false
          this.reportATC.transcription[i].originalADJvalue = adjData["isdelete"] ?? false
          this.reportATC.transcription[i].adjustmentpath = adjDoc.ref.path
          this.reportATC.transcription[i].implementationagent = adjData["implementationagent"] ?? []
          var procedureCollection = collection(this.firestoreATC, adjustment.docs[i].ref.path, "procedures")
          getDocs(procedureCollection).then(procedure => {
            totalProcedureRead = totalProcedureRead + 1
            for (let j = 0; j < procedure.docs.length; j++) {
              var procedureDoc = procedure.docs[j]
              var procedureData = procedureDoc.data()
              this.reportATC.transcription[i].procedure.push({
                procedureData: null,
                name: "",
                proceduredelete: false,
                procedurepath: "",
                originalPROvalue: false,
                newprocedure: false,
                recommended_to: null,
                assigned_to: [],
                mandatory: false,
              })
              this.reportATC.transcription[i].procedure[j].procedureData = procedureData
              this.reportATC.transcription[i].procedure[j].name = this.procedureMap[procedureData["name"].path]
              this.reportATC.transcription[i].procedure[j].proceduredelete = procedureData["isdelete"] ?? false
              this.reportATC.transcription[i].procedure[j].originalPROvalue = procedureData["isdelete"] ?? false
              this.reportATC.transcription[i].procedure[j].procedurepath = procedureDoc.ref.path
              this.reportATC.transcription[i].procedure[j].newprocedure = false
              var agentList = []
              if (procedure.docs[j].data()["assigned_to"] != null) {
                for (let a = 0; a < procedure.docs[j].data()["assigned_to"].length; a++) {
                  const changeagent = procedure.docs[j].data()["assigned_to"][a];
                  agentList.push(changeagent.path)
                }
              }
              this.reportATC.transcription[i].procedure[j].assigned_to = agentList
            }
            for (let a = 0; a < atcDocData["perceptualposition"].length; a++) {
              const position = atcDocData["perceptualposition"][a];
              if (this.tripleATC[a] == null || this.tripleATC[a] == undefined) {
                this.tripleATC.push({
                  position: position,
                  atc: this.reportATC.transcription.filter(e => e.perceptualposition == position)
                })
              }
              else {
                this.tripleATC[a]["atc"] = this.reportATC.transcription.filter(e => e.perceptualposition == position)
              }
            }
            if (totalProcedureRead == adjustment.size) {
              this.getATCoptions()
            }
          })
        }
      })
      /*
      if(atcDocData["notesid"] != null){
        await this.firestore.collection("atc_notes").doc(atcDocData["notesid"]).get().toPromise().then(async snap => {
          if(snap.exists()){
            this.existingNotes = snap.data()
            this.editNotes.notes = (this.existingNotes['notes'] ?? "").trim().length != 0 ? this.existingNotes['notes'] : null
            this.editNotes.consultationsummary = (this.existingNotes['consultationsummary'] ?? "").trim().length != 0 ? this.existingNotes['consultationsummary'] : null
            this.editNotes.consultationpoint = (this.existingNotes['consultationpoint'] ?? "").trim().length != 0 ? this.existingNotes['consultationpoint'] : null
          }
        })
      }
      */
    })
    /*
    if(this.roles["mentor"]){
      await this.firestore.collection("pick_for_mentoring",ref =>ref.where('atcid','==',this.atcID)).get().toPromise().then(async snap => {
        if(snap.docs.length != 0){
          this.editNotes.mentorid = snap.docs[0].id
          var currentMentoringNotes = snap.docs[0].data()
          this.editNotes.mentoringnote = currentMentoringNotes['mentoringnote']
        }
      })
    }
    */
    console.log(this.reportATC)
    this.loading = false
  }

  async getATCoptions() {
    console.log("ATC Draft")
    this.loading = false
    var draftATC = []
    var draftDoc = doc(this.firestoreATC, "temporary_edit_tripleATC", this.reportATC.atcData["atcid"])
    await getDoc(draftDoc).then(draft => {
      if (draft.exists()) {
        if (draft.data()["delete"] != true) {
          draftATC = [draft]
        }
      }
    })
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
      var selectedATC = await firstValueFrom(dialogRef.afterClosed())
      if (selectedATC != null) {
        var atc = selectedATC
        if (atc["type"] == "draft") {
          var value = atc["doc"].data()
          this.reportATC.directive = value["directive"] ?? null
          this.tripleATC = value["tripleatc"]
          this.reportATC.transcription = value["transcript"] ?? []
          this.updatedAdjustment = value["updatedadjustment"] ?? []
          this.newTranscription = value["newtranscript"] ?? []
        }
      }
    }
  }

  autoSave() {
    console.log("Auto Saved")
    if (this.reportATC.atcData["atcid"] != null) {
      console.log(this.newTranscription);

      var data = {
        date: this.datepipe.transform(this.reportATC.atcData["prescription_date"].toDate(), "yyyy-MM-dd"),
        directive: this.reportATC.directive ?? null,
        profileid: this.reportATC.atcData["profileid"],
        tripleatc: this.tripleATC,
        transcript: this.reportATC.transcription ?? [],
        updatedadjustment: this.updatedAdjustment ?? [],
        newtranscript: this.newTranscription ?? [],
        accountpid: this.loggedProfileID,
        delete: false
      }
      console.log(data)
      var draftDoc = doc(this.firestoreATC, "temporary_edit_tripleATC", this.reportATC.atcData["atcid"])
      setDoc(draftDoc, data).catch(err => {
        console.log(err)
      })
    }
  }

  async editDirective() {
    var dialogRef = this.dialog.open(UpdateDialogComponent, {
      autoFocus: false,
      data: this.reportATC.directive,
      disableClose: true,
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
    var result = await firstValueFrom(dialogRef.afterClosed())
    if (result != null) {
      if (result.toString().trim().length != 0) {
        this.reportATC.directive = result
        this.autoSave()
      }
    }
  }

  onAdjustmentUpdate(atcindex, index) {
    this.tripleATC[atcindex]["atc"][index].adjustmentdelete = !this.tripleATC[atcindex]["atc"][index].adjustmentdelete
    this.tripleATC[atcindex]["atc"][index].procedure.forEach(procedure => {
      procedure.proceduredelete = this.tripleATC[atcindex]["atc"][index].adjustmentdelete
    })
  }

  onProcedureUpdated(atcindex, index, jndex) {
    this.tripleATC[atcindex]["atc"][index].procedure[jndex].proceduredelete = !this.tripleATC[atcindex]["atc"][index].procedure[jndex].proceduredelete
    var totalProcedures = this.tripleATC[atcindex]["atc"][index].procedure.length
    var totalProceduresDeleted = 0

    this.tripleATC[atcindex]["atc"][index].procedure.forEach(procedurelist => {
      if (procedurelist.proceduredelete) {
        totalProceduresDeleted = totalProceduresDeleted + 1
      }
    })
    if (totalProcedures == totalProceduresDeleted) {
      this.tripleATC[atcindex]["atc"][index].adjustmentdelete = true
    }
    else {
      this.tripleATC[atcindex]["atc"][index].adjustmentdelete = false
    }
  }

  async editAdjustment(atcindex, index) {
    var text = this.tripleATC[atcindex]["atc"][index].adjustmentedit
    var dialogRef = this.dialog.open(UpdateDialogComponent, {
      autoFocus: false,
      data: text,
      disableClose: true,
      maxHeight: "90vh"
    })
    var result = await firstValueFrom(dialogRef.afterClosed())
    if (result != null) {
      if (result.toString() != this.tripleATC[atcindex]["atc"][index].adjustment.toString()) {
        if (!this.updatedAdjustment.includes(index)) {
          this.updatedAdjustment.push(index)
        }
        this.tripleATC[atcindex]["atc"][index].adjustmentedit = result
        this.autoSave()
      }
      else {
        console.log("No change");
      }
    }
  }

  addAdditionalProcedure(atcindex, index) {
    this.tripleATC[atcindex]["atc"][index].adjustmentdelete = false
    this.tripleATC[atcindex]["atc"][index].procedure.push({
      procedureData: null,
      name: null,
      newprocedure: true,
      originalPROvalue: false,
      proceduredelete: false,
      procedurepath: "",
      recommended_to: null,
      assigned_to: [],
      mandatory: false,
    })
  }

  removeAdditionalProcedure(atcindex, index, jndex) {
    this.tripleATC[atcindex]["atc"][index].procedure.splice(jndex, 1)
    if (this.tripleATC[atcindex]["atc"][index].procedure.filter(e => e.newprocedure == true).length == 0) {
      this.tripleATC[atcindex]["atc"][index].procedure.forEach(procedure => {
        procedure.proceduredelete = this.tripleATC[atcindex]["atc"][index].adjustmentdelete
      })
    }
  }

  addnewAdjustment(atcindex, perceptualposition) {
    this.tripleATC[atcindex]["atc"].push({
      newadjustment: true,
      selected: false,
      comment: null,
      adjData: null,
      perceptualposition: perceptualposition,
      adjustment: "",
      adjustmentedit: "",
      adjustmentdelete: false,
      originalADJvalue: false,
      adjustmentpath: "",
      implementationagent: [],
      procedure: [{
        procedureData: null,
        name: null,
        newprocedure: true,
        originalPROvalue: false,
        proceduredelete: false,
        procedurepath: "",
        recommended_to: null,
        assigned_to: [],
        mandatory: false,
      }]
    })
  }

  removenewAdjustment(atcindex, index) {
    this.tripleATC[atcindex]["atc"].splice(index, 1)
  }

  addnewProcedure(index) {
    if (this.newTranscription[index].procedure[this.newTranscription[index].procedure.length - 1].name != null) {
      this.newTranscription[index].procedure.push({
        name: null,
        recommended_to: null,
        assigned_to: [],
        mandatory: false,
      })
    }
    else {
      alert("Fill Previous Procedures And Proceed")
    }
  }

  removeProcedure(i, j) {
    this.newTranscription[i].procedure.splice(j, 1)
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
  }

  removeImage(index) {
    console.log(index)
    this.selectedNoteImages.splice(index, 1)
    this.previewNoteImages.splice(index, 1)
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
  }

  removeATCImage(index) {
    console.log(index)
    this.selectedATCImages.splice(index, 1)
    this.previewATCImages.splice(index, 1)
  }

  validateExistingPrescription(): boolean {
    var result: boolean = true
    for (let i = 0; i < this.updatedAdjustment.length; i++) {
      if (this.reportATC.transcription[this.updatedAdjustment[i]].adjustment.trim().length == 0 || this.reportATC.transcription[this.updatedAdjustment[i]].procedure.filter(e => e.name == null).length != 0) {
        result = false
        alert("Remove empty procedures fields on the Adjustment")
        break
      }
      if (i + 1 == this.updatedAdjustment.length) {
        result = true
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
        var adjustment = this.newTranscription[i]
        if (adjustment.adjustment.trim().length == 0 || adjustment.procedure.filter(e => e.name == null).length != 0) {
          console.log(adjustment.adjustment.trim().length == 0, adjustment.procedure.filter(e => e.name == null).length != 0)
          alert("Empty adjustment and procedure are not allowed")
          result = false
          break
        }
        if (i == this.newTranscription.length - 1) {
          result = true
        }
      }
    }
    return result
  }

  changeworkBriefValidation(): boolean {
    var value: boolean = true
    // var totalMandatoryProcedure = 0
    // for (let i = 0; i < this.reportATC.transcription.length; i++) {
    //   var element1 = this.reportATC.transcription[i]
    //   totalMandatoryProcedure = totalMandatoryProcedure + element1.procedure.filter(e => e.newprocedure == true && e.mandatory == true).length
    // }

    // for (let i = 0; i < this.newTranscription.length; i++) {
    //   var element2 = this.newTranscription[i]
    //   totalMandatoryProcedure = totalMandatoryProcedure + element2.procedure.filter(e => e.mandatory == true).length
    // }
    // console.log(totalMandatoryProcedure)
    // if(totalMandatoryProcedure != 0 && this.audioBlob.length == 0){
    //   value = false
    //   alert("Changework brief missing!")
    // }
    // else{
    //   value = true
    // }
    return value
  }

  async submit() {
    var mergerAdjustment = [].concat.apply([], this.tripleATC.map(e => e["atc"]))
    this.reportATC.transcription = mergerAdjustment.filter(e => !e["newadjustment"])
    this.newTranscription = mergerAdjustment.filter(e => e["newadjustment"])
    var validation1: boolean = this.validateExistingPrescription()
    var validation2: boolean = this.validateNewPrescription()
    var validation3: boolean = true // this.collectionName == "atc_alpha" ? this.changeworkBriefValidation() : true

    console.log(this.newTranscription)
    console.log(this.reportATC.transcription)
    if (validation1 && validation2 && validation3) {
      /*
      var dialogOptions = [{
        name: "",
        profileid: "",
        atceducation: false,
      }]
      dialogOptions = []
      var assignedAgent = []
      for (let i = 0; i < this.reportATC.transcription.length; i++) {
        const adjustment = this.reportATC.transcription[i];
        for (let j = 0; j < adjustment.procedure.length; j++) {
          const procedure = adjustment.procedure[j];
          for (let k = 0; k < procedure.assigned_to.length; k++) {
            const agent = procedure.assigned_to[k];
            if(dialogOptions.filter(e=>e.profileid == agent.split('/')[1]).length == 0){
              dialogOptions.push({
                name: this.profileMap[agent.split('/')[1]],
                profileid: agent.split('/')[1],
                atceducation: this.reportATC.atceducation.includes(agent.split('/')[1])
              })
            }
            if(!assignedAgent.includes(agent.split('/')[1])){
              assignedAgent.push(agent.split('/')[1])
            }
          }
        }
      }
      */
      // console.log(this.updatedAdjustment)
      this.uploading = true
      // await this.updateChangeWorkBrief()
      await this.replicateATC(this.collectionName)
    }
  }

  async updateATC(expiryDate, atceducation, agent) {
    await updateDoc(doc(this.firestoreATC, this.reportATC.atcpath), {
      visibilityexpiry: expiryDate,
      atceducation: atceducation,
      implementationagent: agent
    }).catch(err => {
      console.log(err)
    })
  }

  /*
  async updateChangeWorkBrief(){
    var audiobrief = []
    var imagenotes = []
    if(imagenotes.length == this.selectedNoteImages.length){
      await this.updateATCnotes(audiobrief, imagenotes)
    }
    for (let a = 0; a < this.selectedNoteImages.length; a++) {
      const imageFile = this.selectedNoteImages[a];
      await this.storage.upload("Uploaded ATC/" + imageFile.name + imageFile.lastModified + imageFile.size, imageFile).then(async uploaded=>{
        await uploaded.ref.getDownloadURL().then(async imageURL =>{
          imagenotes.push(imageURL)
          if(imagenotes.length == this.selectedNoteImages.length){
            await this.updateATCnotes(audiobrief, imagenotes)
          }
        })
      })
    }
  }

  async updateATCnotes(audiobrief, imagenotes){

    if(audiobrief.length != 0 || imagenotes.length != 0 || this.editNotes.notesedited){
      var notesID = this.reportATC.notesid ?? this.firestore.createId()
      await this.firestore.doc(this.reportATC.atcpath).update({
        notesid : notesID,
        imagenotes: imagenotes,
      }).catch(err=>{
        console.log(err)
      })

      var audiodata = []
      var imagedata = []
      if(this.existingNotes != null){
        audiodata = [...(this.existingNotes['changeworkbrief'] ?? []), ...audiobrief]
        imagedata = [...(this.existingNotes["imagenotes"] ?? []), ...imagenotes]

        this.existingNotes["logid"] = this.firestore.createId()
        this.firestore.collection("atc_notes").doc(notesID).collection("revision").doc(this.existingNotes["logid"]).set(this.existingNotes).then(() => {
          console.log("revision upated");
        }).catch(err => {
          console.log(err);
        })
      }

      /*
      if(this.reportATC.notesid != null){
        await this.firestore.collection("atc_notes").doc(notesID).get().toPromise().then(async notes=>{
          var notesData = notes.data()
          audiodata = [...(notesData['changeworkbrief'] ?? []), ...audiobrief]
          imagedata = [...(notesData["imagenotes"] ?? []), ...imagenotes]

          notesData["docid"] = this.firestore.createId()
          this.firestore.collection("atc_notes").doc(notesID).collection("revision").doc(notesData['docid']).set(notesData).then(() => {
            console.log("revision upated");
          }).catch(err => {
            console.log(err);
          })
        })
      }
      * /

      await this.firestore.collection("atc_notes").doc(notesID).set({
        lastupdated: firebase.default.firestore.FieldValue.serverTimestamp(),
        lastupdatedby: this.loggedProfileID,
        atcid : newATCID,
        consultationsummary : this.editNotes.consultationsummary ?? null,
        consultationpoint: this.editNotes.consultationpoint ?? null,
        notes : this.editNotes.notes ?? null,
        changeworkbrief : audiobrief,
        imagenotes: imagenotes,

      }, {merge: true}).catch(err=>{
        console.log(err)
      })
    }
  }
  */

  async replicateATC(finalCollection) {
    var batchATC = writeBatch(this.firestoreATC)
    this.atcnewid = this.guard.generateId(this.firestoreATC, "triple ATC")
    var newData = { ...this.reportATC.atcData, ...{ atcid: this.atcnewid, editedfrom: doc(this.firestoreATC, this.reportATC.atcpath) } }
    newData["status"] = "atc given"
    newData["validator"] = null
    console.log(newData)

    // Upload ATC Image
    var atcImageURL: Array<String> = []
    for (let a = 0; a < this.selectedATCImages.length; a++) {
      const imageFile = this.selectedATCImages[a];
      const imageRef = ref(this.storage, "Online ATC Images/" + imageFile.name + imageFile.lastModified + imageFile.size);
      try {
        const uploadResult = await uploadBytes(imageRef, imageFile);
        const imageURL = await getDownloadURL(uploadResult.ref);
        atcImageURL.push(imageURL);
      } catch (err) {
        console.log(err);
      }
    }
    console.log(atcImageURL)
    newData["prescription_image"] = [...(newData["prescription_image"] ?? []), ...atcImageURL]
    newData["directive"] = this.reportATC.directive
    // var totalWrite = 0
    // totalWrite = this.reportATC.transcription.length
    // this.reportATC.transcription.forEach(e => {totalWrite = totalWrite + e.procedure.length})
    // totalWrite = totalWrite + this.newTranscription.length
    // this.newTranscription.forEach(e => {totalWrite = totalWrite + e.procedure.length})
    // var totalcompleted = 0
    // console.log(totalWrite)
    batchATC.set(doc(this.firestoreATC, finalCollection, this.atcnewid), newData, { merge: true })
    //Big Activity
    if(this.bigActivity()){
      newData['assignmentid'] = this.assignmentId
      newData['participantassignmentid'] = this.participantAssignmentId
      newData['marathonid'] = this.marathonId
      newData['bigassignment'] = true;
    }

    for (let i = 0; i < this.reportATC.transcription.length; i++) {
      var adjustmentKey = "adjustment " + ((i + 1).toString().length == 1 ? "0" + (i + 1).toString() : (i + 1).toString())
      var adjPath = doc(this.firestoreATC, finalCollection, this.atcnewid, "corrections", adjustmentKey).path
      var adjAgent = []
      for (let j = 0; j < this.reportATC.transcription[i].procedure.length; j++) {
        var procedureKey = adjustmentKey + " - " + ((j + 1).toString())
        var procedurePath = doc(this.firestoreATC, adjPath, "procedures", procedureKey).path
        var assignref = []
        // var assignlevel = {}
        for (let a = 0; a < this.reportATC.transcription[i].procedure[j].assigned_to.length; a++) {
          assignref.push(doc(this.firestoreATC, this.reportATC.transcription[i].procedure[j].assigned_to[a]))
          // assignlevel[this.reportATC.transcription[i].procedure[j].assigned_to[a].split('/')[1]] = this.levelMap[this.reportATC.transcription[i].procedure[j].assigned_to[a]]
        }
        // Add New Procedures
        if (this.reportATC.transcription[i].procedure[j].newprocedure) {
          batchATC.set(doc(this.firestoreATC, procedurePath), {
            name: doc(this.firestoreATC, this.reportATC.transcription[i].procedure[j].name),
            recommended_to: this.reportATC.transcription[i].procedure[j].recommended_to != null ? doc(this.firestoreATC, this.reportATC.transcription[i].procedure[j].recommended_to) : null,
            assigned_to: assignref.length != 0 ? assignref : null,
            // level : assignlevel,
            created: serverTimestamp(),
            mandatory: this.reportATC.transcription[i].procedure[j].mandatory,
            isdelete: false,
            product: this.reportATC.product,
            newlyadded: true,
            addedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
            status: "yet to start",
            cancelled: false,
            autogeneralized: false,
            editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
            editedon: serverTimestamp(),
          }, { merge: true })
        }
        // Update Procedure
        else {
          if (this.reportATC.transcription[i].procedure[j].originalPROvalue != this.reportATC.transcription[i].procedure[j].proceduredelete) {
            var newProcedureData = {
              ...this.reportATC.transcription[i].procedure[j].procedureData, ...{
                isdelete: this.reportATC.transcription[i].procedure[j].proceduredelete,
                editedon: serverTimestamp(),
                editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID)
              }
            }
            batchATC.set(doc(this.firestoreATC, procedurePath), newProcedureData, { merge: true })
          }
          else {
            var newProcedureData = { ...this.reportATC.transcription[i].procedure[j].procedureData }
            batchATC.set(doc(this.firestoreATC, procedurePath), newProcedureData, { merge: true })
          }
        }
        for (let a = 0; a < this.reportATC.transcription[i].procedure[j].assigned_to.length; a++) {
          if (!adjAgent.includes(this.reportATC.transcription[i].procedure[j].assigned_to[a].split('/')[1])) {
            adjAgent.push(this.reportATC.transcription[i].procedure[j].assigned_to[a].split('/')[1])
          }
        }
      }
      // Update Adjustment
      if ((this.reportATC.transcription[i].originalADJvalue != this.reportATC.transcription[i].adjustmentdelete) || (this.reportATC.transcription[i].adjustment != this.reportATC.transcription[i].adjustmentedit)) {
        var newAdjData = {
          ...this.reportATC.transcription[i].adjData, ...{
            name: this.reportATC.transcription[i].adjustmentedit,
            isdelete: this.reportATC.transcription[i].adjustmentdelete,
            comment: this.reportATC.transcription[i].comment,
            editedon: serverTimestamp(),
            editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID)
          }
        }
        batchATC.set(doc(this.firestoreATC, adjPath), newAdjData, { merge: true })
      }
      else {
        this.reportATC.transcription[i].adjData["comment"] = this.reportATC.transcription[i].comment
        console.log(this.reportATC.transcription[i].adjData)
        batchATC.set(doc(this.firestoreATC, adjPath), this.reportATC.transcription[i].adjData, { merge: true })
      }
      adjAgent.sort((a, b) => a.localeCompare(b))
      this.reportATC.transcription[i].implementationagent.sort((a, b) => a.localeCompare(b))
      if (adjAgent.toString() != this.reportATC.transcription[i].implementationagent.toString()) {
        batchATC.set(doc(this.firestoreATC, adjPath), {
          implementationagent: adjAgent
        }, { merge: true })
      }
    }

    for (let i = 0; i < this.newTranscription.length; i++) {
      if (this.newTranscription[i].adjustment.trim().length != 0) {
        var adjustmentLength = this.reportATC.transcription.length + i + 1
        var adjustmentID = "adjustment " + (adjustmentLength.toString().length == 1 ? "0" + adjustmentLength.toString() : adjustmentLength.toString())
        var adjAgent = []
        for (let j = 0; j < this.newTranscription[i].procedure.length; j++) {
          var procedureID = adjustmentID + " - " + (j + 1).toString()
          var assignref = []
          // var assignlevel = {}
          for (let a = 0; a < this.newTranscription[i].procedure[j].assigned_to.length; a++) {
            assignref.push(doc(this.firestoreATC, this.newTranscription[i].procedure[j].assigned_to[a]))
            // assignlevel[this.newTranscription[i].procedure[j].assigned_to[a].split('/')[1]] = this.levelMap[this.newTranscription[i].procedure[j].assigned_to[a]]             
            if (!adjAgent.includes(this.newTranscription[i].procedure[j].assigned_to[a].split('/')[1])) {
              adjAgent.push(this.newTranscription[i].procedure[j].assigned_to[a].split('/')[1])
            }
          }

          batchATC.set(doc(this.firestoreATC, finalCollection, this.atcnewid, "corrections", adjustmentID, "procedures", procedureID), {
            name: doc(this.firestoreATC, this.newTranscription[i].procedure[j].name),
            recommended_to: this.newTranscription[i].procedure[j].recommended_to != null ? doc(this.firestoreATC, this.newTranscription[i].procedure[j].recommended_to) : null,
            assigned_to: assignref.length != 0 ? assignref : null,
            // level : assignlevel,
            created: serverTimestamp(),
            mandatory: this.newTranscription[i].procedure[j].mandatory,
            isdelete: false,
            product: this.reportATC.product,
            newlyadded: true,
            status: "yet to start",
            cancelled: false,
            autogeneralized: false,
            editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
            editedon: serverTimestamp(),
          })
        }

        batchATC.set(doc(this.firestoreATC, finalCollection, this.atcnewid, "corrections", adjustmentID), {
          name: this.newTranscription[i].adjustment,
          created: serverTimestamp(),
          isdelete: false,
          newlyadded: true,
          implementationagent: adjAgent,
          editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
          editedon: serverTimestamp(),
          perceptualposition: this.newTranscription[i].perceptualposition,
          comment: this.newTranscription[i].comment,
        })
      }
    }
    await batchATC.commit().then(async () => {
      await updateDoc(doc(this.firestoreDefault, 'big participants assignments', this.participantAssignmentId), {
        status: 'review',
        activityref: doc(this.firestoreDefault, finalCollection, this.atcnewid),
        atcdocid: this.atcnewid
      });
      this.completed(doc(this.firestoreATC, finalCollection, this.atcnewid))
    }).catch(err => {
      console.log(err)
      this.loading = false
      this.uploading = false
      alert(err)
    })
  }

  async completed(toatcref) {
    console.log("Done")
    await updateDoc(doc(this.firestoreATC, this.reportATC.atcpath), {
      status: "upgraded",
      upgradedto: toatcref,
      isdelete: true
    }).catch(err => {
      console.log(err)
    })
    this.uploading = false
    alert("Updated Successfully")
    if (this.roles["mentor"]) {
      this.pickForFinalATC()
    }
    else {
      window.self.close()
    }
    this.uploading = false
  }

  pickForFinalATC() {
    var mergerAdjustment: Array<any> = [].concat.apply([], this.tripleATC.map(e => e["atc"]))
    var selectedAdjustment = mergerAdjustment.filter(e => e["selected"])
    if (selectedAdjustment.length != 0) {
      this.finalATCmode = true
      this.finalATC = selectedAdjustment
    }
    else {
      alert("You haven't selected any adjustment for the Final ATC")
    }
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.finalATC, event.previousIndex, event.currentIndex);
  }

  async createFinalATC() {
    if (this.reportATC.validator.length != 0) {
      var batch = writeBatch(this.firestoreATC)
      this.loading = true
      console.log(this.finalATC)
      // var totalwritten = 0
      // var totalprocedure = this.finalATC.length
      // this.finalATC.forEach(adj=>{
      //   totalprocedure = totalprocedure + adj.procedure.length
      // })
      var atcData = this.reportATC.atcData
      atcData["atcid"] = this.guard.generateId(this.firestoreATC, "atc_alpha")
      atcData["directive"] = this.reportATC.directive
      atcData["validator"] = this.reportATC.validator.map(e => doc(this.firestoreATC, "profile_data", e)) // [this.firestore.collection("profile_data").doc(this.loggedProfileID).ref]
      atcData["editedfrom"] = doc(this.firestoreATC, this.reportATC.atcpath)
      atcData["isdelete"] = false
      atcData["status"] = "validated"
      if (this.atcnewid != null) {
        atcData["tripleatcfrom"] = doc(this.firestoreATC, "triple atc", this.atcnewid)
        batch.update(doc(this.firestoreATC, "triple atc", this.atcnewid), {
          upgradedto: doc(this.firestoreATC, "atc_alpha", atcData["atcid"])
        })
      }
      else {
        atcData["tripleatcfrom"] = doc(this.firestoreATC, this.reportATC.atcpath)
        batch.update(doc(this.firestoreATC, this.reportATC.atcpath), {
          upgradedto: doc(this.firestoreATC, "atc_alpha", atcData["atcid"])
        })
      }
      console.log("ATC data", atcData)
      for (let i = 0; i < this.finalATC.length; i++) {
        const adj = this.finalATC[i];
        var adjustmentID = "adjustment " + (i.toString().length == 1 ? "0" + i.toString() : i.toString())
        var adjData = {
          name: adj.newadjustment ? adj.adjustment : adj.adjustmentedit,
          created: serverTimestamp(),
          isdelete: adj.adjustmentdelete,
          perceptualposition: adj.perceptualposition,
          comment: adj.comment
        }
        var updateAdjData = {}
        if (adj.newadjustment) {
          updateAdjData = {
            newlyadded: true,
            implementationagent: [],
            editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
            editedon: serverTimestamp()
          }
        }
        else {
          if (adj.adjustment != adj.adjustmentedit) {
            updateAdjData = {
              editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
              editedon: serverTimestamp()
            }
          }
        }
        adjData = { ...adjData, ...updateAdjData }
        console.log("Adjustment ", adjustmentID, adjData)
        batch.set(doc(this.firestoreATC, "atc_alpha", atcData["atcid"], "corrections", adjustmentID), adjData)
        for (let j = 0; j < adj.procedure.length; j++) {
          var procedureID = adjustmentID + " - " + (j + 1).toString()
          var procedure = adj.procedure[j]
          var procedureData = {
            name: procedure.newprocedure ? doc(this.firestoreATC, procedure.name) : procedure.procedureData.name,
            recommended_to: null, //procedure.newprocedure ? this.firestore.doc(procedure.recommended_to).ref : procedure.proceduredata.recommended_to,
            assigned_to: [],// assignref.length != 0 ? assignref : null,
            // level : assignlevel,
            created: serverTimestamp(),
            mandatory: procedure.mandatory,
            isdelete: procedure.proceduredelete,
            product: this.reportATC.product,
            status: "yet to start",
            cancelled: false,
            autogeneralized: false,
            implementationagent: [],
          }
          var updateproData = {}
          if (adj.newadjustment) {
            updateproData = {
              addedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
              editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
              newlyadded: true,
              editedon: serverTimestamp()
            }
          }
          else {
            if (adj.adjustment != adj.adjustmentedit) {
              updateproData = {
                editedby: doc(this.firestoreATC, "profile_data", this.loggedProfileID),
                editedon: serverTimestamp()
              }
            }
          }
          procedureData = { ...procedureData, ...updateproData }
          console.log("Procedure ", procedureID, procedureData)

          batch.set(doc(this.firestoreATC, "atc_alpha", atcData["atcid"], "corrections", adjustmentID, "procedures", procedureID), procedureData)
        }
      }
      await batch.commit().then(() => {
        this.clearTripleATC(atcData)
      })
    }
    else {
      alert("Requires validator!")
    }
  }

  async clearTripleATC(atcdata) {
    var batch = writeBatch(this.firestoreATC)
    if (this.atcnewid != null) {
      batch.update(doc(this.firestoreATC, "triple atc", this.atcnewid), {
        status: "validated",
        validator: this.reportATC.validator.map(e => doc(this.firestoreATC, "profile_data", e)) // [this.firestore.collection("profile_data").doc(this.loggedProfileID).ref]
      })
    }
    else {
      batch.update(doc(this.firestoreATC, this.reportATC.atcpath), {
        status: "validated",
        validator: this.reportATC.validator.map(e => doc(this.firestoreATC, "profile_data", e)) // [this.firestore.collection("profile_data").doc(this.loggedProfileID).ref]
      })
    }
    batch.set(doc(this.firestoreATC, "atc_alpha", atcdata["atcid"]), atcdata)

    batch.commit().then(() => {
      alert("Final ATC has been submitted successfully")
      window.self.close()
    })
    this.loading = false
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
