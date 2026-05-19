import { Component } from '@angular/core';
import { collection, collectionData, collectionSnapshots, getFirestore, orderBy, query, Query, QueryFieldFilterConstraint, QueryOrderByConstraint, where } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { AuthguardService } from '../../../authguard.service';
import { Subscription } from 'rxjs';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-view-triple-atc',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatDividerModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatButtonModule
  ],
  templateUrl: './view-triple-atc.component.html',
  styleUrl: './view-triple-atc.component.css'
})
export class ViewTripleATCComponent {
  loading: boolean = false;
  atcChangeAvailable: boolean = false
  // Loggedin Data
  profileID: string;
  profileRoles = {}
  superRoles: boolean = false

  // Subscription
  tripleATCSubscription: Subscription
  profileSubscription: Subscription
  procedureSubscription: Subscription
  AdjustmentGivenSubscription: Subscription
  procedureGivenSubscription: Subscription
  atcNotesSubscription: Subscription
  queueListSubscription: Subscription
  roleSubscription: Subscription
  // recommedSubscription:Subscription

  // Filter
  filterMode = false;
  selectedClient: string = null;
  clientList: Array<any> = [];
  selectedQueue: string = null;
  queueList: Array<any> = [];

  // ATC List
  tripleATCdata: Array<any> = []
  mergedATCdata: Array<any> = []

  // ATC View
  start: number = 0;
  end: number = 10;
  reportATC = [{
    authorid: [],
    tripleatclist: [],
    transcription: [{
      adjustment: "",
      adjustmentpath: "",
      procedure: [{
        procedurename: "",
        procedurepath: "",
        completed: false,
        recommended_to: null,
        assigned_to: [],
        assignedname: '',
      }]
    }]
  }]
  mapATCnotes = {}

  // Metadata
  profileMap = {}
  procedureMap = {}
  clientFilterCtrl = ""
  queueFilterCtrl = ""
  mentorProfileid = []

  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  constructor(public router: Router, public guard: AuthguardService) {
    this.reportATC = []
    this.loading = true
    guard.getRoles().then(async roles => {
      this.profileID = roles.profile_ref.id
      this.profileRoles = roles
      this.superRoles = this.profileRoles["ah"] || this.profileRoles["admin"] || this.profileRoles["developer"] || this.profileRoles["mentor"]
      // if (this.superRoles || roles["eis"]) {
        this.fetchMetaData()
        this.fetchTripleATC()
      // }
      // else {
      //   alert("The Access to this screen is restricted")
      //   router.navigateByUrl("/")
      // }
    }).catch(err => {
      this.loading = false
      console.log(err)
    })
  }

  fetchMetaData(): void {
    var queueCollection = collection(this.firestoreDefault, "queue generation")
    var queueQuery = query(queueCollection, orderBy("queuename"))
    this.queueListSubscription = collectionData(queueQuery).subscribe(queue => {
      this.queueList = queue
    })

    var roleCollection = collection(this.firestoreDefault, "users_roles")
    var roleQuery = query(roleCollection, orderBy("name"))
    this.roleSubscription = collectionData(roleQuery).subscribe(async userRoles => {
      var mentorList = []
      var nameList = [];
      for (let j = 0; j < userRoles.length; j++) {
        var role = userRoles[j]
        this.profileMap[role["profile_ref"]["id"]] = role
        nameList.push({
          name: role["name"],
          profileid: role["profile_ref"]["id"]
        })
        if (role["mentor"] == true) {
          mentorList.push(role["profile_ref"]["id"])
        }
      }
      this.clientList = nameList
      this.mentorProfileid = mentorList
    })

    /*
    this.profileSubscription = this.firestore.collection("profile_data", ref=>ref.orderBy("name")).valueChanges().subscribe(profileQuery=>{
      var nameList = [];
      for (let i = 0; i < profileQuery.length; i++) {
        var profileValue = profileQuery[i]
        nameList.push({
          name: profileValue["name"],
          profileid: profileValue["profileid"]
        })
        this.profileMap[profileValue["profileid"]] = profileValue
      }
      this.clientList = nameList
    })
    */

    var procedureCollection = collection(this.firestoreDefault, "procedures")
    this.procedureSubscription = collectionSnapshots(procedureCollection).subscribe(procedures => {
      procedures.forEach(doc => {
        this.procedureMap[doc.ref.path] = doc.data()['name']
      })
    })
  }

  ngOnDestroy() {
    this.roleSubscription?.unsubscribe()
    this.profileSubscription?.unsubscribe()
    this.procedureSubscription?.unsubscribe()
    this.AdjustmentGivenSubscription?.unsubscribe()
    this.procedureGivenSubscription?.unsubscribe()
    this.atcNotesSubscription?.unsubscribe()
    this.queueListSubscription?.unsubscribe()
  }

  fetchTripleATC() {
    var tripleATCcollection = collection(this.firestoreATC, "triple atc")
    var queryFilter: Array<QueryOrderByConstraint | QueryFieldFilterConstraint> = [orderBy("prescription_date", "desc")]
    if (!this.superRoles) {
      this.selectedClient = this.profileID
      queryFilter.unshift(where("profileid", "==", this.profileID))
    }
    // Subscription
    var atcQuery = query(tripleATCcollection, ...queryFilter)
    this.tripleATCSubscription = collectionData(atcQuery).subscribe(data => {
      var newList = this.tripleATCdata.length == 0
      this.tripleATCdata = data
      if (newList) {
        this.mergedATCdata = this.tripleATCdata.sort((a, b) => b["prescription_date"].toDate() - a["prescription_date"].toDate())
        this.reloadATC()
      }
      else {
        this.atcChangeAvailable = true
      }
    })
    this.loading = false
  }

  returnQueue() {
    return this.queueList.filter(e => e.queuename.toLowerCase().includes(this.queueFilterCtrl.toLowerCase()))
  }

  returnClient() {
    return this.clientList.filter(e => e.name.toLowerCase().includes(this.clientFilterCtrl.toLowerCase()))
  }

  reloadATC() {
    if (this.selectedQueue != null) {
      this.onQueueSelect()
    }
    else if (this.selectedClient != null) {
      this.onClientSelect()
    }
    else {
      this.mergedATCdata = this.tripleATCdata.sort((a, b) => b["prescription_date"].toDate() - a["prescription_date"].toDate())
    }
    this.atcChangeAvailable = false
    this.scrollToTop()
  }

  resetFilter() {
    if (this.superRoles) {
      this.selectedClient = null
    }
    this.selectedQueue = null
    this.filterMode = false
    this.reloadATC()
  }

  async onQueueSelect() {
    this.filterMode = true
    if (this.superRoles) {
      this.selectedClient = null
    }
    console.log(this.selectedQueue)
    var filterTripleATC = this.tripleATCdata.filter(e => (e["queueid"] == this.selectedQueue))
    this.mergedATCdata = filterTripleATC.sort((a, b) => b["prescription_date"].toDate() - a["prescription_date"].toDate())
    this.getATCids()
  }

  async onClientSelect() {
    if (this.superRoles) {
      this.filterMode = true
    }
    this.selectedQueue = null
    console.log(this.selectedClient)
    if (this.selectedClient == "all") {
      this.mergedATCdata = filterTripleATC.sort((a, b) => b["prescription_date"].toDate() - a["prescription_date"].toDate())
    }
    else {
      var filterTripleATC = this.tripleATCdata.filter(e => (e["profileid"] == this.selectedClient))
      this.mergedATCdata = filterTripleATC.sort((a, b) => b["prescription_date"].toDate() - a["prescription_date"].toDate())
    }
    this.getATCids()
  }

  async getATCids() {
    this.loading = true
    this.reportATC = []
    this.start = 0
    this.end = 10
    this.scrollToTop()
    if (this.mergedATCdata.length == 0) {
      alert("No ATC(s) found")
    }
    else {
      await this.getReport()
    }
    this.loading = false
  }

  onEditATC(atcid) {
    var url = this.router.serializeUrl(this.router.createUrlTree(['/edittripleATC/' + atcid]))
    window.open(url, '_blank')
  }

  async getReport() {
    for (let i = this.start; i < (this.end < this.mergedATCdata.length ? this.end : this.mergedATCdata.length); i++) {
      var atcDoc = this.mergedATCdata[i]
      var atcData = this.mergedATCdata[i]
      if (this.reportATC[i] == null || this.reportATC[i] == undefined) {
        this.reportATC.push({
          authorid: [],
          tripleatclist: [],
          transcription: []
        })
      }
      this.reportATC[i] = { ...this.reportATC[i], ...atcData }
      this.reportATC[i].authorid = atcData["author"].map(e => e.id)
      var adjCollection = collection(this.firestoreATC, "triple atc", atcDoc["atcid"], "corrections")
      this.AdjustmentGivenSubscription = collectionSnapshots(adjCollection).subscribe(async adjustment => {
        for (let j = 0; j < adjustment.length; j++) {
          var adjustmentDoc = adjustment[j]
          var adjustmentData = adjustmentDoc.data()
          if (this.reportATC[i].transcription[j] == undefined) {
            this.reportATC[i].transcription.push({
              adjustmentpath: '',
              adjustment: '',
              procedure: []
            })
          }
          this.reportATC[i].transcription[j] = { ...this.reportATC[i].transcription[j], ...adjustmentData }
          this.reportATC[i].transcription[j].adjustment = adjustmentData["name"]
          this.reportATC[i].transcription[j].adjustmentpath = adjustmentDoc.ref.path
          var procedureCollection = collection(this.firestoreATC, adjustmentDoc.ref.path, "procedures")
          this.procedureGivenSubscription = collectionSnapshots(procedureCollection).subscribe(procedure => {
            for (let k = 0; k < procedure.length; k++) {
              var procedureDoc = procedure[k]
              var procedureData = procedureDoc.data()
              if (this.reportATC[i].transcription[j].procedure[k] == undefined) {
                this.reportATC[i].transcription[j].procedure.push({
                  procedurename: "",
                  procedurepath: "",
                  completed: false,
                  recommended_to: null,
                  assigned_to: [],
                  assignedname: ''
                })
              }
              this.reportATC[i].transcription[j].procedure[k] = { ...this.reportATC[i].transcription[j].procedure[k], ...procedureData }
              this.reportATC[i].transcription[j].procedure[k].procedurename = this.procedureMap[procedureData["name"]?.path]
              this.reportATC[i].transcription[j].procedure[k].recommended_to = procedureData["recommended_to"]?.path
              this.reportATC[i].transcription[j].procedure[k].assigned_to = procedureData["assigned_to"]?.map(e => e.path) ?? []
              this.reportATC[i].transcription[j].procedure[k].assignedname = procedureData["assigned_to"]?.map(e => this.profileMap[e.id]?.name)
              this.reportATC[i].transcription[j].procedure[k].completed = procedureData["status"] == "completed"
              this.reportATC[i].transcription[j].procedure[k].procedurepath = procedureDoc.ref.path
            }
            for (let a = 0; a < this.reportATC[i]["perceptualposition"].length; a++) {
              const triple = this.reportATC[i]["perceptualposition"][a];
              if (this.reportATC[i].tripleatclist[a] == undefined) {
                this.reportATC[i].tripleatclist.push({
                  perceptualposition: triple,
                  transcription: this.reportATC[i].transcription.filter(e => e["perceptualposition"] == triple)
                })
              }
              else {
                this.reportATC[i].tripleatclist[a] = {
                  perceptualposition: triple,
                  transcription: this.reportATC[i].transcription.filter(e => e["perceptualposition"] == triple)
                }
              }
            }
          })
        }
      })
    }
    console.log(this.reportATC);
  }

  /*
  getNotes(atcid, noteid){
    this.atcNotesSubscription = this.firestore.collection("atc_notes").doc(noteid).snapshotChanges().subscribe(note=>{
      console.log(note.payload.id, note.payload.exists)
      if(note.payload.exists()){
        var noteData = Object.assign({}, note.payload.data() ?? {})
        this.mapATCnotes[note.payload.id] = {...(this.mapATCnotes[note.payload.id] ?? {}), ...noteData}
        this.firestore.collection("pick_for_mentoring", ref=>ref.where("atcid", "==", atcid).limit(1)).get().toPromise().then(mentoring=>{
          if(mentoring.size != 0){
            var mentorData = mentoring.docs[0].data()
            this.mapATCnotes[note.payload.id]["mentornote"] = mentorData
          }
        })

      }
    })
  }
  */

  viewImage(src) {
    window.open(src, '_blank')
  }

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    })
  }

  async previousATC() {
    this.scrollToTop()
    this.start = this.start - 10
    this.end = this.end - 10
  }

  async nextATC() {
    this.loading = true
    this.scrollToTop()
    this.start = this.start + 10
    this.end = this.end + 10
    if (this.reportATC[this.start] == undefined) {
      await this.getReport()
    }

    this.loading = false
  }

  onPreviewATC(tripleatc: string) {
    console.log(tripleatc);
    const url = this.router.createUrlTree(['/previewtripleATC'], {
      queryParams: {
        type: 'validation',
        atcid:tripleatc,
        validation: true,
        profileid: this.profileID,
        // marathonid: activity.marathonref.id,
        // assignmentid: activity.docid,
        // participantassignmentid: activity.participantAssignmentId
      }
    }).toString();
    window.open(url, '_blank');
  }
}