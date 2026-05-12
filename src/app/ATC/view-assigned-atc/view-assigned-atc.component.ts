import { CommonModule, DatePipe } from '@angular/common';
import { Component, ViewChild } from '@angular/core';
import { collection, collectionChanges, collectionData, CollectionReference, collectionSnapshots, doc, docSnapshots, DocumentSnapshot, getFirestore, getDocs, limit, or, orderBy, Query, query, QueryDocumentSnapshot, QueryFieldFilterConstraint, QueryLimitConstraint, QueryOrderByConstraint, updateDoc, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, Subscription, takeUntil, debounceTime, map } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-view-assigned-atc',
  imports: [
    CommonModule,
    MatProgressBarModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    NgxMatSelectSearchModule,
    MatSelectModule,
    MatPaginatorModule,
    MatListModule,
  ],
  templateUrl: './view-assigned-atc.component.html',
  styleUrl: './view-assigned-atc.component.css'
})
export class ViewAssignedATCComponent {
  @ViewChild('paginator') paginator: MatPaginator;

  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  // Loading states
  loading = new BehaviorSubject<boolean>(false);

  // Pagination
  pageIndex = 0
  pageSize = 10

  // Component lifecycle management
  private metaSubscription = new Subject<void>();
  private atcAlphaSubscription = new Subject<void>();
  
  // User profile data
  profileID: string;
  profileRoles = {};
  superRoles = false;
  
  // Filters
  filterText = "";
  selectedChangeagent: string = null;
  selectedParticipant: string = null;
  
  // List data
  changeAgentList: Array<any> = [];
  participantList: Array<any> = [];
  
  // ATC data management
  reportATC: QueryDocumentSnapshot<any>[] = [];

  // Adjustment & Procedures
  mapATCtranscription = {};
  mapTranscriptionSubscription = new Map<String, Array<Subscription>>();
  
  // Maps for lookup data
  profileMap = {};
  procedureMap = {};
  mapBigActivity = {};

  // ATC Notes
  mapATCnotes = {};
  mapNotesSubscription = {}
  
  // Metadata
  assignedToActivity = [];

  // Update Transcription
  updateProcedurePath = null
  newProcedureValue = {
    type: null,
    bigactivity: {},    
    lastactivity: null,
  }
  
  constructor(
    public router: Router,
    public guard: AuthguardService,
    public matdialog: MatDialog,
    public datepipe: DatePipe
  ) {}
  
  ngOnInit(): void {
    this.loading.next(true);
    // Initialize user roles and access
    this.initializeRolesAndAccess();
  }
  
  ngOnDestroy(): void {
    // Signal all subscriptions to unsubscribe
    this.clearAtcAlphaSubscription();
    this.metaSubscription.next();
    this.metaSubscription.complete();
    this.clearAdjustmentSubscription();
    this.clearNotesSubscription()
  }

  clearAtcAlphaSubscription(){
    this.atcAlphaSubscription.next()
    this.atcAlphaSubscription.complete()
  }

  clearAdjustmentSubscription(){
    this.mapTranscriptionSubscription.forEach(key => {
      key.forEach(sub => sub.unsubscribe())
    })
    this.mapTranscriptionSubscription.clear()
  }

  clearNotesSubscription(){
    Object.keys(this.mapNotesSubscription).forEach(key => {
      this.mapNotesSubscription[key]?.unsubscribe()
      this.mapNotesSubscription[key] = null
    })
  }

  clearUpdateEdit(){
    this.updateProcedurePath = null
    this.newProcedureValue = {
      type: null,
      bigactivity: {},
      lastactivity: null,
    }
  }
  
  // Role initialization
  private initializeRolesAndAccess(): void {
    this.guard.getRoles().then(roles => {
      this.profileID = roles.profile_ref.id;
      this.profileRoles = roles;
      this.superRoles = this.profileRoles["ah"] || this.profileRoles["admin"] || this.profileRoles["developer"] || this.profileRoles["mentor"];      
      // if (!this.superRoles && !this.profileRoles["changeagent"]) {
      //   alert("The Access to this screen is restricted");
      //   this.router.navigateByUrl("/");
      //   return;
      // }
      // else{
        this.loadReferenceData(); // Load reference data
        this.setupATCQueries(); // Load Initial ATC
      // }      
    }).catch(err => {
      console.error("Error getting roles:", err);
      this.loading.next(false);
    });
  }

  // Load reference data from firestore
  private loadReferenceData(): void {
    // Load user roles
    var roleCollection = collection(this.firestoreDefault, "users_roles")
    var roleQuery = query(roleCollection, or(where("changeagent", "==", true), where("eis", "==", true), where("ah", "==", true), where("admin", "==", true)))
    collectionData(roleQuery).pipe(takeUntil(this.metaSubscription)).subscribe(userRoles => {
      var nameList = [];
      var changeAgent = []
      for (let j = 0; j < userRoles.length; j++) {
        const role:any = userRoles[j];
        this.profileMap[role["profile_ref"].id] = {...this.profileMap[role["profile_ref"].id], ...role};
        nameList.push({
          name: role["name"],
          profileid: role["profile_ref"].id
        });
        if (role["changeagent"] || role["eis"] || role["ah"] || role["admin"]) {
          changeAgent.push({
            authorname: role["name"],
            authorid: role["profile_ref"].id,
          });
        }
      }
      this.participantList = nameList;
      this.changeAgentList = changeAgent
    });
    
    // Load procedures
    var procedureCollection = collection(this.firestoreDefault, "procedures")
    collectionChanges(procedureCollection).pipe(takeUntil(this.metaSubscription)).subscribe(procedures => {
      procedures.forEach(doc => {
        this.procedureMap[doc.doc.ref.path] = doc.doc.data()['name'];
      });
    });
    
    // Load big activity
    var bigactivityCollection = collection(this.firestoreDefault, "bigactivity")
    collectionData(bigactivityCollection).pipe(takeUntil(this.metaSubscription)).subscribe(activity => {
      const assigned = [];
      activity.forEach(e => {
        this.mapBigActivity[e["docid"]] = e["activity"];
        if (e["atcproperty"] == "assigned_to") {
          assigned.push(e);
        }
      });
      this.assignedToActivity = assigned;
    });
  }
  
  // Set up ATC queries based on user role
  setupATCQueries(): void {
    this.clearPreviousPage(this.pageIndex)
    this.clearUpdateEdit()
    this.clearAtcAlphaSubscription()
    this.clearAdjustmentSubscription()
    this.clearNotesSubscription()
    this.atcAlphaSubscription = new Subject<void>();
    this.loading.next(true);
    this.reportATC = [];
    this.pageIndex = 0;
    this.paginator.firstPage();
    if(!this.superRoles){
      this.selectedChangeagent = this.profileID;
    }

    var alphaCollection: CollectionReference = collection(this.firestoreATC, "atc_alpha")
    var queryList: Array<QueryFieldFilterConstraint | QueryOrderByConstraint | QueryLimitConstraint> = [
      where("isdelete", "==", false),
      where("type", "==", "online"),
      orderBy("prescription_date", "desc")
    ]
    if(this.selectedChangeagent != null){
      queryList.push(where("implementationagent", "array-contains", this.selectedChangeagent))
    }
    if(this.selectedParticipant != null){
      queryList.push(where("profileid", "==", this.selectedParticipant))
    }
    if(this.selectedParticipant == null && this.selectedChangeagent == null){
      queryList.push(limit(25))
    }
    var alphaQuery:Query = query(alphaCollection, ...queryList)
    this.subscribeToATCCollections(alphaQuery);
  }
  
  // Subscribe to ATC collections and handle real-time updates
  private subscribeToATCCollections(alphaQuery: Query): void {
    console.log(alphaQuery)
    collectionSnapshots(alphaQuery).pipe(
      takeUntil(this.atcAlphaSubscription), // Subscribe until destroyed
      debounceTime(300), // Debounce to handle multiple rapid updates
    ).subscribe({
      next: mergedDocs => {
        console.log("Subscribed to Combine Query", mergedDocs.length)
        var existingReport = new Map()
        mergedDocs.forEach(snapshot => {
          const id = snapshot.id;
          const data = snapshot.data();
          if (!data["isdelete"]) {
            existingReport.set(id, snapshot); // Update or add the item
          } else if (existingReport.has(id)) {
            existingReport.delete(id); // Remove the item if it exists and is now deleted
          }
        });
        if(this.reportATC.length == 0){
          this.reportATC = Array.from(existingReport.values())
          this.openCurrentPage()  
        }
        this.reportATC = Array.from(existingReport.values())
        this.getProfileData()
        this.loading.next(false);
      },
      error: err =>{
        console.log("Error in Combine Query", err)
      },
      complete: () => {
        console.log("Subscription Completed")
      }
    });
  }

  // Filter Participant list
  filterParticipantList(): any[] {
    const filterValue = this.filterText;
    return this.participantList.filter(option => 
      option.name.toLowerCase().includes(filterValue.toLowerCase())
    );
  }
  
  // Filter Changeagent list
  filterChangeAgentList(): any[] {
    const filterValue = this.filterText;
    return this.changeAgentList.filter(option => 
      option.authorname.toLowerCase().includes(filterValue.toLowerCase())
    );
  }

  resetFilter(): void {
    this.selectedParticipant = null;
    if (this.superRoles) {
      this.selectedChangeagent = null;
    }
    
    // Reload with original query
    this.setupATCQueries();
  }

  onParticipantSelect(){
    if(this.superRoles){
      this.selectedChangeagent = null
    }
    console.log(this.selectedParticipant, this.selectedChangeagent)
    this.setupATCQueries()
  }

  onChangeagentSelect(){
    this.selectedParticipant = null
    console.log(this.selectedParticipant, this.selectedChangeagent)
    this.setupATCQueries()
  }

  getProfileData(){
    var start = this.pageIndex * this.pageSize
    var end = (this.pageIndex * this.pageSize) + this.pageSize
    var atcSlice = this.reportATC.slice(start, end)
    var profileid = atcSlice.map(e => e.data()["profileid"]).filter(e => !((this.profileMap[e] || {})["profileid"]))
    profileid = Array.from(new Set(profileid))
    if(profileid.length != 0){
      var profileCollection = collection(this.firestoreDefault, "profile_data")
      var profileQuery = query(profileCollection, where("profileid", "in", profileid))
      getDocs(profileQuery).then(list =>{
        for (let i = 0; i < list.docs.length; i++) {
          const element = list.docs[i];
          var profiledata:any = element.data()
          this.profileMap[element.id] = {...this.profileMap[element.id], ...profiledata};
        }
      })
    }
  }

  handlePageEvent(event: PageEvent){
    console.log("Page Event", event)
    window.scrollTo({
      top : 0,
      behavior : 'smooth',
    })
    this.pageIndex = event.pageIndex
    this.clearUpdateEdit()
    this.clearPreviousPage(event.previousPageIndex)
    this.openCurrentPage()
    this.getProfileData()
  }

  openCurrentPage(){
    var start = this.pageIndex * this.pageSize
    var end = (this.pageIndex * this.pageSize) + this.pageSize
    var atcSlice = this.reportATC.slice(start, end)
    for (let i = 0; i < atcSlice.length; i++) {
      const atcDoc = atcSlice[i];
      this.openATC(atcDoc) 
    }
  }

  clearPreviousPage(previousIndex){
    var start = previousIndex * this.pageSize
    var end = (previousIndex * this.pageSize) + this.pageSize
    var atcSlice = this.reportATC.slice(start, end)
    for (let i = 0; i < atcSlice.length; i++) {
      const atcDoc = atcSlice[i];
      this.closeATC(atcDoc) 
    }
  }

  fetchATCnotes(atcData){
    var noteid = atcData["notesid"]
    var mentoringid = atcData["mentoringid"]
    console.log(this.mapNotesSubscription[noteid], this.mapNotesSubscription[mentoringid])
    if(noteid && !this.mapNotesSubscription[noteid]){
      var noteSubscription = docSnapshots(doc(this.firestoreATC, "atc_notes/"+noteid)).pipe(
        takeUntil(this.atcAlphaSubscription),
      ).subscribe(doc =>{
        this.mapATCnotes[doc.id] = doc.data()
      })
      this.mapNotesSubscription[noteid] = noteSubscription
    }
  }

  unSubscribeSingleTranscription(atcData){
    if (this.mapTranscriptionSubscription.has(atcData["atcid"])) {
      this.mapTranscriptionSubscription.get(atcData["atcid"]).forEach(sub =>{
        sub.unsubscribe();
      });
      this.mapTranscriptionSubscription.delete(atcData["atcid"]);
    }
    this.mapTranscriptionSubscription.set(atcData["atcid"], [])

    if(this.mapNotesSubscription[atcData["notesid"]]){
      this.mapNotesSubscription[atcData["notesid"]]?.unsubscribe()
      this.mapNotesSubscription[atcData["notesid"]] = null
    }
    if(this.mapNotesSubscription[atcData["mentoringid"]]){
      this.mapNotesSubscription[atcData["mentoringid"]]?.unsubscribe()
      this.mapNotesSubscription[atcData["mentoringid"]] = null
    }
  }

  closeATC(atc: DocumentSnapshot<any>){
    if(this.mapATCtranscription[atc.id]){
      this.mapATCtranscription[atc.id]["view"] = false;
    }
    this.unSubscribeSingleTranscription(atc.data())
    console.log(this.mapATCtranscription[atc.id])
  }

  openATC(atc: DocumentSnapshot<any>){
    console.log(atc)
    var atcData = atc.data()

    // Clear Previous Subscription
    this.unSubscribeSingleTranscription(atcData)

    this.fetchATCnotes(atcData) // Load ATC Notes
    
    console.log(this.mapATCtranscription[atc.id])

    this.mapATCtranscription[atc.id] = this.mapATCtranscription[atc.id] || {view: true, transcription: []}
    this.mapATCtranscription[atc.id]["view"] = true
    var transcription = this.mapATCtranscription[atc.id]["transcription"]

    var adjCollectionRef = collection(this.firestoreATC, atc.ref.path+"/corrections")
    var adjQueryList = [where("isdelete", "==", false)]
    if(this.selectedChangeagent != null){
      adjQueryList.push(where("implementationagent", "array-contains", this.selectedChangeagent))
    }
    var adjCollectionQuery = query(adjCollectionRef, ...adjQueryList)
    
    var adjSubscription = collectionSnapshots(adjCollectionQuery).pipe(
      takeUntil(this.metaSubscription),
      debounceTime(300),
    ).subscribe(adjustmentSnapshot =>{
      for (let i = 0; i < adjustmentSnapshot.length; i++) {
        const adjDoc = adjustmentSnapshot[i];
        if(transcription[i]){
          transcription[i] = {
            adjustment: adjDoc,
            procedure: transcription[i]["procedure"] || []
          }
        }
        else{
          transcription.push({
            adjustment: adjDoc,
            procedure: []
          })
        }

        var procedureCollectionRef = collection(this.firestoreATC, adjDoc.ref.path+"/procedures")
        var procedureQueryList = [where("isdelete", "==", false)]
        if(this.selectedChangeagent != null){
          procedureQueryList.push(where("assigned_to", "array-contains", doc(this.firestoreDefault, "profile_data/"+this.selectedChangeagent)))
        }
        var procedureCollectionQuery = query(procedureCollectionRef, ...procedureQueryList)


        var proSubscription = collectionSnapshots(procedureCollectionQuery).pipe(
          takeUntil(this.metaSubscription),
          debounceTime(300),
        ).subscribe(procedureSnapshot =>{
          for (let j = 0; j < procedureSnapshot.length; j++) {
            const proDoc = procedureSnapshot[j];
            if(transcription[i]["procedure"][j]){
              transcription[i]["procedure"][j] = proDoc
            }
            else{
              transcription[i]["procedure"].push(proDoc)
            }
          }
        })
        this.mapTranscriptionSubscription.set(atc.id, [...this.mapTranscriptionSubscription.get(atc.id), proSubscription])
      }
    })
    this.mapTranscriptionSubscription.set(atc.id, [...this.mapTranscriptionSubscription.get(atc.id), adjSubscription])
  }

  onSelectProcedureEdit(procedure: DocumentSnapshot<any>, updateType){
    this.updateProcedurePath = procedure.ref.path
    var procedureData = procedure.data()
    var assigned = {}
    var activityKeys = Object.keys(procedureData["bigactivity"] ?? {})

    if(activityKeys.length == 0 && (procedureData["assigned_to"] ?? []).length != 0){
      if(this.assignedToActivity.length != 0){
        assigned[this.assignedToActivity[0]["docid"]] = procedureData["assigned_to"].map(e => e.id)
      }
    }
    else{
      activityKeys.forEach(activity =>{
        assigned[activity] = procedureData["bigactivity"][activity]
      })
    }

    this.newProcedureValue = {
      type: updateType,
      bigactivity: assigned,
      lastactivity: this.datepipe.transform(typeof procedureData["last_activity"] == 'string' ? new Date(procedureData["last_activity"]) : (procedureData["last_activity"]?.toDate() ?? new Date()), "yyyy-MM-ddThh:mm"),
    }    
  }

  markProcedureComplete(procedure: DocumentSnapshot<any>){
    var bigactivity = {}
    var assigned = []
    Object.keys(this.newProcedureValue["bigactivity"]).forEach(activity =>{
      if((this.newProcedureValue["bigactivity"][activity] || []).length != 0){
        bigactivity[activity] = this.newProcedureValue["bigactivity"][activity]
        assigned = [...assigned, ...this.newProcedureValue["bigactivity"][activity]]
      }
    })

    var newRecord = {
      bigactivity: bigactivity,
      assigned_to: assigned.map(e => doc(this.firestoreATC, "profile_data/"+e)),
      "status": "completed",
      "last_activity": new Date(this.newProcedureValue["lastactivity"])
    }
    if(this.newProcedureValue["type"] == "autogeneralized"){
      newRecord["autogeneralized"] = true
    }
    console.log(newRecord)
    if(newRecord.last_activity == null || isNaN(newRecord.last_activity?.getTime())){
      alert("Enter Valid Activity Date!")
      return
    }
    
    if(confirm(`Mark procedure as ${this.newProcedureValue["type"] == "autogeneralized" ? 'Auto Generalized and Completed' : 'Completed'} on ${newRecord['last_activity']}.`)){
      updateDoc(doc(this.firestoreATC, procedure.ref.path), newRecord).catch(err =>{
        console.log("Err Update", err)
      })
      this.clearUpdateEdit()
    }
  }

  undoProcedureComplete(procedure: DocumentSnapshot<any>, updateType){
    var newRecord = {
      "autogeneralized": false
    }
    if(updateType == "completed"){
      newRecord["status"] = "yet to start"
      newRecord["last_activity"] = null
    }
    console.log(newRecord)
    if(confirm(`Sure, Unmark procedure as ${updateType == "autogeneralized" ? 'Auto Generalized and Completed' : 'Completed'}.`)){
      updateDoc(doc(this.firestoreATC, procedure.ref.path), newRecord).catch(err =>{
        console.log("Err Update", err)
      })
      this.clearUpdateEdit()
    }
  }

  returnProcedureTime(time){
    if(typeof time == 'string'){
      return new Date(time)
    }
    else{
      return time.toDate()
    }
  }

  trackByAuthorId(index: number, author: any): any {
    return author.authorid || author.profileid || author.id;
  }

  trackByAtcId(index: number, atc: any): any {
    return atc.id || atc.atcid;
  }

  trackByAdjustmentID(index: number, transcription: any): any {
    return transcription["adjustment"]?.id;
  }

  trackByProcedureId(index: number, procedure: any): any {
    return procedure.id;
  }

  trackByActivityId(index: number, activity: any): any {
    return activity.docid;
  }
}
