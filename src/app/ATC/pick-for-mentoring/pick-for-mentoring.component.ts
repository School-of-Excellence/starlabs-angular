import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { collection, collectionData, collectionSnapshots, doc, Firestore, getDocs, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-pick-for-mentoring',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatTabsModule,
    MatExpansionModule,
    MatButtonModule
  ],
  templateUrl: './pick-for-mentoring.component.html',
  styleUrl: './pick-for-mentoring.component.css'
})
export class PickForMentoringComponent implements OnDestroy {
  @ViewChild('noteField') noteField: ElementRef;

  loggedinID: string
  loading:boolean
  mapProfile = {}
  mapProcedure = {}
  // filter
  filterText = ""
  profileList = []
  selectedProfile = null
  specialistList = []
  selectedSpecialist = null
  profileRoleSubscription:Subscription
  // Alpha
  alphaStart = 0
  alphaEnd = 10
  alphaATC = []
  filteralphaATC = []
  alphaSubscription: Subscription
  // Validation
  validateStart = 0
  validateEnd = 10
  validateATC = []
  filtervalidateATC = []
  validateSubscription: Subscription
  // Mentoring
  mentorStart = 0
  mentorEnd = 10
  mentoringATC = []
  filtermentoringATC = []
  // mapATC = {}
  mentoringSubscription: Subscription
  mapMentoringNote = {}

  constructor(public guard: AuthguardService, public firestore: Firestore, public router: Router) {
    this.loading = true
    guard.getRoles().then(roles=>{
      this.loggedinID = roles.profile_ref.id
      // if(roles.ah || roles.admin){
        this.fetchData()
        this.filterATC()
        this.getATC()
      // }
      // else{
      //   alert("Unauthorized access")
      //   this.router.navigateByUrl("/")
      // }
    })
  }

  fetchData() {
    this.guard.getProcedureMap().then(data => this.mapProcedure = data)
    this.guard.getProfileMap().then(data => this.mapProfile = data.map)
    var collectionRef = collection(this.firestore, "users_roles")
    var queryRef = query(collectionRef, orderBy("name"))
    this.profileRoleSubscription = collectionData(queryRef).subscribe(profile=>{
      var profileList = []
      var specialist = []
      for (let i = 0; i < profile.length; i++) {
        const element = profile[i];
        profileList.push({
          name: element["name"],
          profileid: element["profile_ref"].id
        })
        if(element["eis"] || element["changeagent"]){
          specialist.push({
            name: element["name"],
            profileid: element["profile_ref"].id
          })
        }
      }
      this.profileList = profileList
      this.specialistList = specialist
    })
  }

  ngOnDestroy(){
    this.alphaSubscription?.unsubscribe()
    this.validateSubscription?.unsubscribe()
    this.mentoringSubscription?.unsubscribe()
    this.profileRoleSubscription?.unsubscribe()
  }

  filterProfile(){
    return this.profileList.filter(e => e["name"].toLowerCase().includes(this.filterText.toLowerCase()))
  }

  filterSpecialist(){
    return this.specialistList.filter(e => e["name"].toLowerCase().includes(this.filterText.toLowerCase()))
  }

  async getATC(){
    this.loading = true
    var alphaCollection = collection(this.firestore, "atc_alpha")
    var alphaQuery = query(alphaCollection, where("isdelete", "==", false), where("type", "==", "online"), orderBy("prescription_date", "desc"))
    this.alphaSubscription = collectionData(alphaQuery).subscribe(atc=>{
      this.alphaATC = atc
      this.mentoringATC = [...this.alphaATC, ...this.validateATC].filter(e => ![null, undefined].includes(e["mentoringid"]))
      this.filterATC()
    })
    var toValidateCollection = collection(this.firestore, "atc_to_validate")
    var toValidateQuery = query(toValidateCollection, where("status", "==", "atc given"), where("isdelete", "==", false), orderBy("prescription_date", "desc"))
    this.validateSubscription = collectionData(toValidateQuery).subscribe(atc=>{
      this.validateATC = atc
      this.mentoringATC = [...this.alphaATC, ...this.validateATC].filter(e => ![null, undefined].includes(e["mentoringid"]))
      this.filterATC()
    })
    var mentoringCollection = collection(this.firestore, "pick_for_mentoring")
    var mentoringQuery = query(mentoringCollection, orderBy("created", "desc"))
    this.mentoringSubscription = collectionSnapshots(mentoringQuery).subscribe(atc=>{
      for (let i = 0; i < atc.length; i++) {
        const element = atc[i];
        this.mapMentoringNote[element.id] = element.data()
      }
    })
  }

  filterATC(){
    this.filteralphaATC = this.alphaATC.filter(e => {
      return (this.selectedProfile == null ? true : (this.selectedProfile == e["profileid"])) &&
      ((this.selectedSpecialist == null ? true : (e["author"]?.map(e => e.id).includes(this.selectedSpecialist) ?? false)))
    })
    this.filtervalidateATC = this.validateATC.filter(e => {
      return (this.selectedProfile == null ? true : (this.selectedProfile == e["profileid"])) &&
      ((this.selectedSpecialist == null ? true : (e["author"]?.map(e => e.id).includes(this.selectedSpecialist) ?? false)))
    })
    this.filtermentoringATC = this.mentoringATC.filter(e => {
      return (this.selectedProfile == null ? true : (this.selectedProfile == e["profileid"])) &&
      ((this.selectedSpecialist == null ? true : (e["author"]?.map(e => e.id).includes(this.selectedSpecialist) ?? false)))
    })
  }

  editATC(atcid, type){
    // this.router.navigateByUrl("/edi ATC/" + atcid + "/" + type)
    var url = "/editATC/" + atcid + "/" + type
    window.open(url.toString(), '_blank')
  }
  
  markATCvalidate(atcid, validator){
    var validatorPath = [...(validator ?? []).map(e => e.path), doc(this.firestore, "profile_data", this.loggedinID).path]
    validatorPath = Array.from(new Set(validatorPath))
    var validatorRef = validatorPath.map(e => doc(this.firestore, e))
    updateDoc(doc(this.firestore, "atc_to_validate", atcid), {
      status: "validated",
      validator: validatorRef
    })
  }

  getTranscription(type, atc){
    var atcid = atc["atcid"]
    var atcpath = ""
    var selectedATC = null
    if(type == "alpha"){
      atcpath = doc(this.firestore, "atc_alpha", atc.atcid).path
      var index = this.alphaATC.findIndex(e => e.atcid == atcid)
      if(index != -1) selectedATC = this.alphaATC[index]
    }
    else if(type == "validate"){
      atcpath = doc(this.firestore, "atc_to_validate", atc.atcid).path
      var index = this.validateATC.findIndex(e => e.atcid == atcid)
      if(index != -1) selectedATC = this.validateATC[index]
    }
    if(selectedATC != null && (selectedATC["transcription"] == null || selectedATC["transcription"] == undefined)){
      selectedATC["transcription"] = []
    }

    var adjCollection = collection(this.firestore, atcpath, "corrections")
    var adjQuery = query(adjCollection, where("isdelete", "==", false))

    getDocs(adjQuery).then(adjustment=>{
      console.log("Adjustment Length", adjustment.size)
      for (let i = 0; i < adjustment.docs.length; i++) {
        const adjdoc = adjustment.docs[i];

        var procedureCollection = collection(this.firestore, adjdoc.ref.path, "procedures")
        var procedureQuery = query(procedureCollection, where("isdelete", "==", false))
        const adjdata = adjdoc.data();
        getDocs(procedureQuery).then(procedure=>{
          console.log("Procedures Length", procedure.size)
          var proList = []
          for (let j = 0; j < procedure.docs.length; j++) {
            const prodata = procedure.docs[j].data();
            proList.push(prodata)
          }
          if(selectedATC != null){
            if(selectedATC["transcription"][i] == null || selectedATC["transcription"][i] == undefined){
              selectedATC["transcription"].push({})
            }
            selectedATC["transcription"][i] = {
              adjustment: adjdata,
              procedure: proList
            }
          }
        })
      }
    })
  }

  pickformentoring(from, atc){
    console.log(atc)
    var mentoringID = doc(collection(this.firestore,'pick_for_mentoring')).id
    var batch = writeBatch(this.firestore)
    batch.set(doc(this.firestore, "pick_for_mentoring", mentoringID), {
      lastupdated: serverTimestamp(),
      atcid : atc.atcid,
      profileid: atc.profileid,
      author: atc.author,
      prescription_date: atc.prescription_date.toDate(),
      mentoringnote: null,
      from: from,
      mentorperson: this.loggedinID,
      created: serverTimestamp()
    })
    batch.update(doc(this.firestore, from == "alpha" ? "atc_alpha" : "atc_to_validate", atc.atcid), {
      mentoringid: mentoringID
    })
    batch.commit()
  }

  updateMentoringNote(note:string, atc){
    var batch = writeBatch(this.firestore)
    console.log(note, atc)
    if(note.trim().length != 0){
      if(this.mapMentoringNote[atc.mentoringid]){
        var logid = doc(collection(this.firestore,'pick_for_mentoring')).id
        batch.set(doc(this.firestore, "pick_for_mentoring", atc.mentoringid, "revision", logid), {logid: logid, ...this.mapMentoringNote[atc.mentoringid]})
      }
      batch.update(doc(this.firestore, "pick_for_mentoring", atc.mentoringid), {
        mentoringnote: note.trim(),
        mentorperson: this.loggedinID,
        atcid : atc.atcid,
        lastupdated: serverTimestamp()
      })
      batch.commit()
      this.noteField.nativeElement.value = '';
    }
  }

  previous(type){
    window.scrollTo({
      top : 0,
      behavior : 'smooth',
    })
    switch (type) {
      case "alpha":
        this.alphaStart = this.alphaStart - 10
        this.alphaEnd = this.alphaEnd - 10
        break; 
      case "validate":
        this.validateStart = this.validateStart - 10
        this.validateEnd = this.validateEnd - 10
        break; 
      case "mentor":
        this.mentorStart = this.mentorStart - 10
        this.mentorEnd = this.mentorEnd - 10
        break;    
      default:
        break;
    }
  }

  next(type){
    window.scrollTo({
      top : 0,
      behavior : 'smooth',
    })
    switch (type) {
      case "alpha":
        this.alphaStart = this.alphaStart + 10
        this.alphaEnd = this.alphaEnd + 10
        break;  
      case "validate":
        this.validateStart = this.validateStart + 10
        this.validateEnd = this.validateEnd + 10
        break; 
      case "mentor":
        this.mentorStart = this.mentorStart + 10
        this.mentorEnd = this.mentorEnd + 10
        break;     
      default:
        break;
    }
  }
}