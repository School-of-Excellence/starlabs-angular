import { Component, OnDestroy } from '@angular/core';
import { arrayUnion, collection, collectionData, collectionSnapshots, doc, docSnapshots, getFirestore, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Subscription, Subject, takeUntil, debounceTime, firstValueFrom } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { AddReviewNotesComponent } from '../add-review-notes/add-review-notes.component';
import { SelectValidatorComponent } from '../select-validator/select-validator.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';

@Component({
  selector: 'app-review-flag-atc',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatTabsModule,
    MatExpansionModule
  ],
  templateUrl: './review-flag-atc.component.html',
  styleUrl: './review-flag-atc.component.css'
})
export class ReviewFlagATCComponent implements OnDestroy {
  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

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
  mentorProfileid = []
  // Alpha
  alphaStart = 0
  alphaEnd = 10
  alphaATC = []
  filteralphaATC = []
  // Validation
  validateStart = 0
  validateEnd = 10
  validateATC = []
  filtervalidateATC = []
  // Review
  finalReviewStart = 0
  finalReviewEnd = 10
  finalReviewATC = []
  filterfinalReviewATC = []
  // Flag Mandatory
  flagMandatoryStart = 0
  flagMandatoryEnd = 10
  flagMandatoryATC = []
  filterflagMandatoryATC = []
  // Flag Enhance
  flagEnhanceStart = 0
  flagEnhanceEnd = 10
  flagEnhanceATC = []
  filterflagEnhanceATC = []

  // Adjustment & Procedures
  mapATCtranscription = {};
  mapTranscriptionSubscription = new Map<String, Array<Subscription>>();

  mapATCnotes = {}

  // Subscription
  profileSubscription = new Subject<void>();
  alphaSubscription = new Subject<void>();
  validateToSubscription = new Subject<void>();

  constructor(public guard: AuthguardService, public router: Router, public matdialog: MatDialog, public snackBar: MatSnackBar) {
    this.loading = true
    guard.getRoles().then(roles=>{
      this.loggedinID = roles.profile_ref.id
      // if(roles.ah || roles.admin || roles.mentor || roles.developer){
        this.fetchData()
        this.getATC()
      // }
      // else{
      //   alert("Unauthorized access")
      //   this.router.navigateByUrl("/")
      // }
    })
  }

  ngOnDestroy(){
    this.profileSubscription?.next()
    this.profileSubscription?.complete()
    this.alphaSubscription?.next()
    this.alphaSubscription?.complete()
    this.validateToSubscription?.next()
    this.validateToSubscription?.complete()
    this.clearAdjustmentSubscription()
  }

  fetchData(){
    this.guard.getProcedureMap().then(data => this.mapProcedure = data)
    var collectionRef = collection(this.firestoreDefault, "users_roles")
    var queryRef = query(collectionRef, orderBy("name"))
    collectionData(queryRef).pipe(
      takeUntil(this.profileSubscription)
    ).subscribe(profile=>{
      var profileList = []
      var specialist = []
      for (let i = 0; i < profile.length; i++) {
        const element = profile[i];
        this.mapProfile[element["profile_ref"].id] = element["name"]
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
        if(element["mentor"]){
          this.mentorProfileid.push(element["profile_ref"].id)
        }
      }
      this.profileList = profileList
      this.specialistList = specialist
    })
  }

  clearAdjustmentSubscription(){
    this.mapTranscriptionSubscription.forEach(key => {
      key.forEach(sub => sub.unsubscribe())
    })
    this.mapTranscriptionSubscription.clear()
  }

  filterProfile(){
    return this.profileList.filter(e => e["name"].toLowerCase().includes(this.filterText.toLowerCase()))
  }

  filterSpecialist(){
    return this.specialistList.filter(e => e["name"].toLowerCase().includes(this.filterText.toLowerCase()))
  }

  async getATC(){
    this.loading = true

    var alphaCollectionRef = collection(this.firestoreATC, "atc_alpha")
    var alphaQueryRef = query(alphaCollectionRef, where("isdelete", "==", false), where("type", "==", "online"), orderBy("prescription_date", "desc"))    
    collectionData(alphaQueryRef).pipe(
      takeUntil(this.alphaSubscription)
    ).subscribe(atc=>{
      var alphaList = []
      var finalReviewList = []
      var flagMandatoryList = []
      var flagEnhanceList = []
      for (let i = 0; i < atc.length; i++) {
        const data = atc[i];
        data["atcpath"] = doc(this.firestoreATC, "atc_alpha", data["atcid"]).path
        if(data["flagtype"] == "finalreview"){
          finalReviewList.push(data)
        }
        else if(data["flagtype"] == "flagmandatory"){
          flagMandatoryList.push(data)
        }
        else if(data["flagtype"] == "flagenhance"){
          flagEnhanceList.push(data)
        }
        else{
          alphaList.push(data)
        }
      }
      this.alphaATC = alphaList
      this.finalReviewATC = finalReviewList
      this.flagMandatoryATC = flagMandatoryList
      this.flagEnhanceATC = flagEnhanceList
      this.filterATC()
    })

    var toValidateCollectionRef = collection(this.firestoreATC, "atc_to_validate")
    var toValidateQueryRef = query(toValidateCollectionRef, where("isdelete", "==", false), where("type", "==", "online"), where("status", "==", "atc given"), orderBy("prescription_date", "desc"))

    collectionData(toValidateQueryRef).pipe(
      takeUntil(this.validateToSubscription)
    ).subscribe(atc=>{
      var validateList = []
      for (let i = 0; i < atc.length; i++) {
        const data = atc[i];
        data["atcpath"] = doc(this.firestoreATC, "atc_to_validate", data["atcid"]).path
        validateList.push(data)
      }
      this.validateATC = validateList
      this.filterATC()
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
    this.filterfinalReviewATC = this.finalReviewATC.filter(e => {
      return (this.selectedProfile == null ? true : (this.selectedProfile == e["profileid"])) &&
      ((this.selectedSpecialist == null ? true : (e["author"]?.map(e => e.id).includes(this.selectedSpecialist) ?? false)))
    })
    this.filterflagMandatoryATC = this.flagMandatoryATC.filter(e => {
      return (this.selectedProfile == null ? true : (this.selectedProfile == e["profileid"])) &&
      ((this.selectedSpecialist == null ? true : (e["author"]?.map(e => e.id).includes(this.selectedSpecialist) ?? false)))
    })
    this.filterflagEnhanceATC = this.flagEnhanceATC.filter(e => {
      return (this.selectedProfile == null ? true : (this.selectedProfile == e["profileid"])) &&
      ((this.selectedSpecialist == null ? true : (e["author"]?.map(e => e.id).includes(this.selectedSpecialist) ?? false)))
    })
  }

  editATC(atcid, type){
    // this.router.navigateByUrl("/editATC/" + atcid + "/" + type)
    var url = "/editATC/" + atcid + "/" + type
    window.open(url.toString(), '_blank')
  }
  
  async markATCvalidate(atcid){
    let dialog = this.matdialog.open(SelectValidatorComponent,{data:{type:"selectvalidator"},disableClose:true})
    var result = await firstValueFrom(dialog.afterClosed())
    let validators = []
    var resultList = result ?? []
    resultList.forEach((e:any) => validators.push(e.profile_ref))
    updateDoc(doc(this.firestoreATC, "atc_to_validate", atcid), {
      status: "validated",
      validator: validators
    }).catch(err =>{
      console.log(err)
    })

    // var validatorPath = [...(validator ?? []).map(e => e.path), this.firestore.collection("profile_data").doc(this.loggedinID).ref.path]
    // validatorPath = Array.from(new Set(validatorPath))
    // var validatorRef = validatorPath.map(e => this.firestore.doc(e).ref)
    // this.firestore.collection("atc_to_validate").doc(atcid).update({
    //   status: "validated",
    //   validator: validatorRef
    // })
  }

  unSubscribeSingleTranscription(atcid){
    console.log(atcid)
    if (this.mapTranscriptionSubscription.has(atcid)) {
      this.mapTranscriptionSubscription.get(atcid).forEach(sub =>{
        sub.unsubscribe();
      });
      this.mapTranscriptionSubscription.delete(atcid);
    }
    this.mapTranscriptionSubscription.set(atcid, [])
  }

  closeATC(atcData){
    var atcid = atcData['atcid']
    this.unSubscribeSingleTranscription(atcid)
    console.log(this.mapATCtranscription[atcid])
  }

  openATC(atcData){
    console.log(atcData)
    var atcid = atcData["atcid"]
    this.fetchATCnotes(atcData) // Load ATC Notes

    // Clear Previous Subscription
    this.unSubscribeSingleTranscription(atcid)
    
    console.log(this.mapATCtranscription[atcid])

    this.mapATCtranscription[atcid] = this.mapATCtranscription[atcid] || []
    var transcription = this.mapATCtranscription[atcid]
    var adjCollection = collection(this.firestoreATC, atcData["atcpath"], "corrections")
    var adjSubscription = collectionSnapshots(adjCollection).pipe(
      takeUntil(this.alphaSubscription),
      debounceTime(300),
    ).subscribe(adjustmentSnapshot =>{
      for (let i = 0; i < adjustmentSnapshot.length; i++) {
        const adjDoc = adjustmentSnapshot[i];
        var adjData = adjDoc.data()
        if(transcription[i]){
          transcription[i] = {
            adjustment: adjData,
            procedure: transcription[i]["procedure"] || []
          }
        }
        else{
          transcription.push({
            adjustment: adjData,
            procedure: []
          })
        }
        var procedureCollectionRef = collection(this.firestoreATC, adjDoc.ref.path, "procedures")
        var proSubscription = collectionSnapshots(procedureCollectionRef).pipe(
          takeUntil(this.alphaSubscription),
          debounceTime(300),
        ).subscribe(procedureSnapshot =>{
          for (let j = 0; j < procedureSnapshot.length; j++) {
            const proDoc = procedureSnapshot[j];
            var proData = proDoc.data()
            if(transcription[i]["procedure"][j]){
              transcription[i]["procedure"][j] = proData
            }
            else{
              transcription[i]["procedure"].push(proData)
            }
          }
        })
        this.mapTranscriptionSubscription.set(atcid, [...this.mapTranscriptionSubscription.get(atcid), proSubscription])
      }
    })
    this.mapTranscriptionSubscription.set(atcid, [...this.mapTranscriptionSubscription.get(atcid), adjSubscription])
  }

  fetchATCnotes(atcData){
    var noteid = atcData["notesid"]
    var mentoringid = atcData["mentoringid"]
    if(noteid && !this.mapATCnotes[noteid]){
      docSnapshots(doc(this.firestoreATC, "atc_notes", noteid)).pipe(
        takeUntil(this.alphaSubscription),
      ).subscribe(doc =>{
        this.mapATCnotes[doc.id] = doc.data()
      })
    }
    if(mentoringid && !this.mapATCnotes[mentoringid]){
      docSnapshots(doc(this.firestoreDefault, "pick_for_mentoring", mentoringid)).pipe(
        takeUntil(this.alphaSubscription),
        debounceTime(300),
      ).subscribe(doc =>{
        this.mapATCnotes[doc.id] = doc.data()
      })
    }
  }

  updateNote(atc, type){
    console.log(atc["atcpath"], type)
    var dailog = this.matdialog.open(AddReviewNotesComponent, {
      data: {
        heading: type == "review" ? "Add Review Comment" : "Add Flag Comment"
      }
    })
    dailog.afterClosed().toPromise().then(value =>{
      console.log(value)
      if((value ?? "").trim().length != 0){
        var commentData = arrayUnion({
          comment: value,
          addedby: this.loggedinID,
          date: new Date().toString(),
          type: type
        })
        updateDoc(doc(this.firestoreATC, atc["atcpath"]), {
          flagtype: type,
          flagcomment: commentData
        }).then(() =>{
          this.snackBar.open("Success", null, { duration: 2000})
        }).catch(err =>{
          console.log(err)
        })
      }
    })
  }

  viewImage(src){
    window.open(src, '_blank')
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
      case "finalreview":
        this.finalReviewStart = this.finalReviewStart - 10
        this.finalReviewEnd = this.finalReviewEnd - 10
        break;
      case "flagmandatory":
        this.flagMandatoryStart = this.flagMandatoryStart - 10
        this.flagMandatoryEnd = this.flagMandatoryEnd - 10
        break;  
      case "flagenhance":
        this.flagEnhanceStart = this.flagEnhanceStart - 10
        this.flagEnhanceEnd = this.flagEnhanceEnd - 10
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
      case "finalreview":
        this.finalReviewStart = this.finalReviewStart + 10
        this.finalReviewEnd = this.finalReviewEnd + 10
        break;
      case "flagmandatory":
        this.flagMandatoryStart = this.flagMandatoryStart + 10
        this.flagMandatoryEnd = this.flagMandatoryEnd + 10
        break; 
      case "flagenhance":
        this.flagEnhanceStart = this.flagEnhanceStart + 10
        this.flagEnhanceEnd = this.flagEnhanceEnd + 10
        break;  
      default:
        break;
    }
  }
}
