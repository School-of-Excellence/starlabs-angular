import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { PlanActivityComponent } from '../plan-activity/plan-activity.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-big-cohorts',
  imports: [
    MatFormFieldModule,
    CommonModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    MatInputModule
  ],
  templateUrl: './big-cohorts.component.html',
  styleUrl: './big-cohorts.component.css'
})
export class BigCohortsComponent {
  cohortsList = []
  filteredCohortsList = []
  marathonList = []
  participantlist = {};

  acceleratorEventList = []
  filteredAcceleratorEventList = []

  mapProfile = {}
  contentview = 'assignment'
  selectedMarathon:string | null = null
  selectedAcceleratorEvent = []
  mapMarathon = {}
  mapAcceleratorEvent = {}
  mapBigCohortsToAssignment = {}

  mapBigAssignment = {}
  private subscription = new Subject<void>();
  mapParticiantsAssignments = {}
  mapCompletedParticiantsAssignments = {}
  mapOngoingAssignments = {}
  mapCompletedAssignments = {}

  totalParticpantsEngagement = 0
  totalParticipantsInCohorts = []

  loading:boolean = true;

  loggedInProfile
  constructor(
    private firestore : Firestore,
    public authguard: AuthguardService,
    private dialog : MatDialog,
    private router : Router
  ){

    this.authguard.getProfileMap().then(e => this.mapProfile = e.map)
    this.authguard.username().then((e) => this.loggedInProfile = e)

    getDocs(collection(this.firestore,"big cohorts")).then(snap => {
      this.cohortsList = snap.docs.map(e =>{ 
        let element = e.data()
        element['contentview'] = null
        return element
      })
      this.filteredCohortsList = this.cohortsList
      this.toRunFilterFunctions()
    })
    getDocs(query(collection(this.firestore,"big marathon"),orderBy("startdate","asc"))).then(snap => {
      // this.marathonList = snap.docs.map(e => e.data())
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        element['ref'] = snap.docs[i].ref
        this.mapMarathon[element['docid']] = element
        this.marathonList.push(element)
      }
      
      this.selectedMarathon = this.marathonList[this.marathonList.length - 1]['docid']
      this.toRunFilterFunctions()
    })
    getDocs(collection(this.firestore,"event collection")).then(snap => {
      this.acceleratorEventList = snap.docs.map((e) => {
        let element = e.data()
        element['ref'] = e.ref
        this.mapAcceleratorEvent[element['ref'].id] = element['name']
        return element
      }).filter(e => e['bigmarathonref'] != undefined)

      this.filteredAcceleratorEventList = this.acceleratorEventList
      this.toRunFilterFunctions()
      // for (let i = 0; i < this.acceleratorEventList.length; i++) {
      //   const element = this.acceleratorEventList[i];
      //   this.mapAcceleratorEvent[element['ref'].id] = element['name']
      // }
    })

    let collectionName = "participant metadata"
    getDocs(query(collection(this.firestore,"journey"),where("atcmodel","==","B!G"))).then((snap) => {
      if(!snap.empty){
        let bigJourneyList = snap.docs.map(e => e.id)
        getDocs(query(collection(this.firestore,collectionName),where("activejourney","in",bigJourneyList))).then((activeJourneySnap) => {
          getDocs(query(collection(this.firestore,collectionName),where("lastcompletedjourney","in",bigJourneyList))).then((nonActiveJourneySnap) => {
            let activeJourneyList = activeJourneySnap.docs.map(e => e.data()).filter(e => e["name"] != null && e["testuser"] != true && (!['discontinued','banned','late'].includes(e["financialstatus"])))
            let nonActiveJourneyList = nonActiveJourneySnap.docs.map(e => e.data()).filter(e => e["name"] != null && e["testuser"] != true && (!['discontinued','banned','late'].includes(e["financialstatus"]))).filter(e => [null,undefined].includes(e['activejourney']))
            this.participantlist = [...activeJourneyList,...nonActiveJourneyList];
          })
        })
      } else {
        console.log("No Participants list found");
      }
    }) 
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  onFilter(){
    this.filteredCohortsList = this.cohortsList.filter(e => {
      if((this.selectedMarathon ? this.selectedMarathon == e['marathonref'].id : true) 
        && (this.selectedAcceleratorEvent.length != 0 ? this.selectedAcceleratorEvent.includes(e['eventref']?.id) : true)){
        return e
      }
    });
    console.log(this.filteredCohortsList);
    
    let participantList = this.filteredCohortsList.map(e => e['participantidlist']);
    this.totalParticipantsInCohorts = [].concat(...participantList)
    this.totalParticipantsInCohorts = Array.from(new Set(this.totalParticipantsInCohorts))
    return this.filteredCohortsList
  }

  toRunFilterFunctions(){
    if(this.cohortsList && this.cohortsList.length != 0 && this.selectedMarathon){
      this.onFilter();
    }
    if(this.selectedMarathon && this.acceleratorEventList && this.acceleratorEventList.length != 0){
      this.onFilterAcceleratorEvent();
    }
  }

  onCreateAssignment(cohorts:any){
    let dialogref = this.dialog.open(PlanActivityComponent,{
      maxWidth: '100vw',
      width: '100vw',
      height: '100vh',
      panelClass: 'full-width-dialog',
      data:{
        type:'new',
        doc:cohorts,
        cohortslist:this.cohortsList.filter(e => this.selectedMarathon === e['marathonref'].id),
        mapProfile: this.mapProfile,
        participantList : this.participantlist ?? []
      },
      disableClose:true,
    })
    dialogref.afterClosed().subscribe((result) => {
      if(result){

      }
    })
  }

  onEditAssignment(cohorts,assignment){
    console.log(assignment);
    
    let dialogref = this.dialog.open(PlanActivityComponent,{
      data:{
        type:'edit',
        doc:cohorts,
        cohortslist:this.cohortsList.filter(e => this.selectedMarathon === e['marathonref'].id),
        assignmentdoc:assignment,
        mapProfile: this.mapProfile,
      },
      disableClose:true,
      width: '100%',
      height: '100%',
      panelClass: 'full-width-dialog',
    })
    dialogref.afterClosed().subscribe((result) => {
      if(result){

      }
    })
  }

  onFilterAcceleratorEvent(){
    this.getAssignmentData()
    return this.filteredAcceleratorEventList = this.acceleratorEventList.filter(e => e['bigmarathonref'].id === this.selectedMarathon)
  }

  getAssignmentData(){
    // if(!!this.bigAssignmentSubscription && !this.bigAssignmentSubscription.closed){
    //   this.bigAssignmentSubscription.unsubscribe()
    // }
    const bigassignmentQuery = query(collection(this.firestore,"big assignment"),where("marathonref","==",this.mapMarathon[this.selectedMarathon]['ref']))
    collectionSnapshots(bigassignmentQuery).pipe(takeUntil(this.subscription)).subscribe((snapData) => {
      let snap = snapData.map(doc=>({id:doc.id,...doc.data()}))
      console.log("assignment change detect",snap.length);
      
      // this.mapBigCohortsToAssignment = {}
      this.mapBigAssignment = {}
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        this.mapBigAssignment[element['docid']] = element
        // this.mapBigCohortsToAssignment[element['marathonref'].id] = this.mapBigCohortsToAssignment[element['marathonref'].id] || {}
        // this.mapBigCohortsToAssignment[element['marathonref'].id][element['cohortsref'].id] = this.mapBigCohortsToAssignment[element['marathonref'].id][element['cohortsref'].id] || []
        // this.mapBigCohortsToAssignment[element['marathonref'].id][element['cohortsref'].id].push(element)
      }
    })
    // if(!!this.participantsAssignmentsSubscription && !this.participantsAssignmentsSubscription.closed){
    //   this.participantsAssignmentsSubscription.unsubscribe()
    // }
    const bigparticipantsassignmentsQuery = query(collection(this.firestore,"big participants assignments"),where("marathonref","==",this.mapMarathon[this.selectedMarathon]['ref']))
    collectionSnapshots(bigparticipantsassignmentsQuery).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      let snap = snapData.map(doc=>({id:doc.id,...doc.data()}))
      this.mapParticiantsAssignments = {}
      // this.mapCompletedParticiantsAssignments = {}
      this.mapOngoingAssignments = {}
      this.mapCompletedAssignments= {}
      for (let i = 0; i < snap.length; i++){
        const element = snap[i];
        this.mapParticiantsAssignments[element['cohortsref'].id] = this.mapParticiantsAssignments[element['cohortsref'].id] || {}
        this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] = this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] || []
        this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id].push(element)
        if(['initiated','ongoing'].includes(element['status'])){
          this.mapOngoingAssignments[element['assignmentref'].id] = this.mapOngoingAssignments[element['assignmentref'].id] || []
          this.mapOngoingAssignments[element['assignmentref'].id].push(element)
        }else{
          // this.mapCompletedParticiantsAssignments[element['cohortsref'].id] = this.mapCompletedParticiantsAssignments[element['cohortsref'].id] || {}
          // this.mapCompletedParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] = this.mapCompletedParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] || []
          // this.mapCompletedParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id].push(element)

          this.mapCompletedAssignments[element['assignmentref'].id] = this.mapCompletedAssignments[element['assignmentref'].id] || []
          this.mapCompletedAssignments[element['assignmentref'].id].push(element)
        }
      }
      let totalparticipantengagement = []
      for (const cohorts in this.mapParticiantsAssignments) {
        for (const assignment in this.mapParticiantsAssignments[cohorts]) {
          totalparticipantengagement.push(this.mapParticiantsAssignments[cohorts][assignment])
        } 
      }
      const participantEngagementArray = [].concat(...(totalparticipantengagement || []));
      const totalParticipantsCount = this.totalParticipantsInCohorts ? this.totalParticipantsInCohorts.length : 0;
      let percentage = 0;
      if (totalParticipantsCount > 0) {
        percentage = Math.ceil((participantEngagementArray.length / totalParticipantsCount)*100)
      }
      this.totalParticpantsEngagement = percentage
    })
    this.loading = false
  }

  onStartMetting(assignmentid:string){
    console.log(assignmentid,this.loggedInProfile['profileid']);
    // let url = this.router.createUrlTree(['/zoommeeting_bigparticipants/'+assignmentid+'/'+profileid+'/'+participantAssignmentId])
    let url = this.router.createUrlTree(['/zoommeeting_bigparticipants/'],{
      queryParams:{
        assignmentid:assignmentid,
        profileid:this.loggedInProfile['profileid'],
        participantAssignmentId : null,
        type:1
      }
    })
    window.open(url.toString(),"_blank")
    // window.open(this.mapBigAssignment[assignmentid]['zoomdata']['start_url'].toString(),"_blank")
  }

  onValidateParticipantAssignment(assignmentDocId:string,){
    console.log("assignmentDocId",assignmentDocId);
    
    let url = this.router.createUrlTree(['/validateParticipantAssignments/'],{
      queryParams:{
        assignmentid:assignmentDocId,
      }
    })
    window.open(url.toString(),"_blank")
  }

}
