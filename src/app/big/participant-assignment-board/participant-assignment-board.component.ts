import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, getDocs, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { CommonModule, formatDate } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FormsModule } from '@angular/forms';
import { WatchVideosComponent } from '../watch-videos/watch-videos.component';


@Component({
  selector: 'app-participant-assignment-board',
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatOptionModule,
    NgxMatSelectSearchModule,
    FormsModule,
  ],
  templateUrl: './participant-assignment-board.component.html',
  styleUrl: './participant-assignment-board.component.css',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class ParticipantAssignmentBoardComponent {
  private subscription = new Subject<void>
  @ViewChild(MatSort) sort: MatSort;  
  marathon = null;
  currentProfile: any = null;
  searchTerm: string = '';
  mapProfile: { [key: string]: string } = {};

  filteredKeys: string[] = [];  
  selectedProfile: string | null = null;
  selectedStatus = 'myactivities';  
  loggedInProfileId:any = null
  allActivities: any[] = [];
  selectedDirective: string = '';
  searchKeyword = '';
  loading:boolean = true;
  developerAccess:boolean = false;
  dataSource = new MatTableDataSource<any>([]);
  selectedMarathon = {};
  marathonMap = null;
  bigMarathonList = [];
  mapAssignments = {}
  currentDate: Date = new Date();
  currentTimestampSeconds: number;  
  mapParticipantAssignments = {}
  bigParticipantsAssignmentsSubscription:Subscription

  constructor(
    private firestore: Firestore,
    public authguard: AuthguardService,
    private router: Router,
    public dialog: MatDialog,
    public route : ActivatedRoute,
    private snackBar: MatSnackBar,
  ) {
    let querycount = 0
    this.route.queryParams.subscribe(params => {
      if(params && params['profileid']){
        console.log("from url");
        this.currentProfile = {profileid:params['profileid']} 
        querycount += 1
        if(querycount >= 3){
          this.onSelect(this.currentProfile['profileid'])
          this.loading =false
        }
      }else{
        this.authguard.username().then(async (profile) => {
          console.log("from login");
          this.currentProfile = profile 
          querycount += 1
          if(querycount >= 3){
            this.onSelect(this.currentProfile['profileid'])
            this.loading =false
          }
        });
      }
    })
    this.authguard.getRoles().then(async roles=>{
      console.log(roles['profile_ref'].id,"roles['profile_ref'].id");
      
      this.loggedInProfileId = roles['profile_ref'].id
      if(roles["developer"]){
        this.developerAccess = true;
        this.authguard.getProfileMap().then(e => {
          this.mapProfile = e.map;
          this.filteredKeys = this.getKeys(this.mapProfile);
        })
      }
      else{
        this.developerAccess = false;
      }
    })
    collectionSnapshots(query(collection(this.firestore,"big assignment"), 
      where("status", "in", ['initiated', 'ongoing', 'completed'])
    )).pipe(takeUntil(this.subscription)).subscribe(assignmentSnap => {
      this.mapAssignments = {};
    
      for (let i = 0; i < assignmentSnap.length; i++) {
        const element = assignmentSnap[i].data();
        const docId = assignmentSnap[i].id;
        this.mapAssignments[docId] = element;
      }
    
      querycount += 1;
      if (querycount >= 3) {
        this.onSelect(this.currentProfile['profileid']);
        this.loading = false;
      }
    });
    getDocs(query(collection(this.firestore,"big marathon"),orderBy("startdate",'desc'))).then(snap => {
      this.marathonMap = {};
      this.bigMarathonList = [];
      if(snap.docs.length != 0){
        for (let i = 0; i < snap.docs.length; i++) {
          const bigMarathonDoc = snap.docs[i].data();
          bigMarathonDoc['marathonref'] = snap.docs[i].ref;
          bigMarathonDoc['pending'] = 0
          this.marathonMap[snap.docs[i].ref.id] = bigMarathonDoc;
          this.bigMarathonList.push(bigMarathonDoc);
        }
        this.selectedMarathon = this.bigMarathonList[0];
        querycount += 1
        if(querycount >= 3){
          this.onSelect(this.currentProfile['profileid'])
          this.loading =false
        }
      }
    });
  }

  ngOnInit(): void {
    const dateOnly = new Date(this.currentDate);
    dateOnly.setHours(0, 0, 0, 0);
    this.currentTimestampSeconds = Math.floor(dateOnly.getTime() / 1000);    
    console.log(this.dataSource.data,"test datasource");
  }

  ngOnDestroy(){
    this.subscription.complete();
    this.subscription.next();
    this.bigParticipantsAssignmentsSubscription?.unsubscribe()
  }

  getKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  filterOptions(): void {
    this.filteredKeys = this.getKeys(this.mapProfile).filter(key => 
      this.mapProfile[key].toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  onSelect(selectedId: string): void {
    this.currentProfile = { profileid: selectedId };
    this.getPendingList()
    if(this.selectedMarathon && this.selectedMarathon['marathonref']){
      this.loadParticipantAssignments(this.selectedMarathon);
    }
  }

  fetchMarathonData(marathon:Object){
    this.selectedMarathon =  marathon;
    this.dataSource.data = null;
    console.log(this.dataSource.data,"dataSource.data");
    if(this.currentProfile &&  this.currentProfile['profileid']){
      this.loadParticipantAssignments(this.selectedMarathon);
    }
  }

  loadParticipantAssignments(selectedMarathon: any) {
    console.log(this.currentProfile['profileid'], "current profile");
    console.log("selectedMarathon", selectedMarathon);
    
    collectionSnapshots(query(collection(this.firestore,"big participants assignments"), 
     where("profileid", "==", this.currentProfile['profileid']),where("marathonref", "==", selectedMarathon['marathonref'])))
      .pipe(takeUntil(this.subscription))
      .subscribe(assignmentsSnap => {
      this.allActivities = [];
      this.mapParticipantAssignments = {};
      
      assignmentsSnap.forEach(action => {
        const participantAssignment = action.data();
        const assignmentId = participantAssignment['assignmentref'].id;
        const marathonId = participantAssignment['marathonref'].id;

        if (!this.mapAssignments[assignmentId]) return;

        const activity = {
          ...this.mapAssignments[assignmentId],
          participantAssignmentId: participantAssignment['docid'],
          profileId: participantAssignment['profileid'],
          activityref: participantAssignment['activityref'],
          formtemplate: participantAssignment['formtemplate'],
          summary: participantAssignment['summary'],
          activityLog: participantAssignment['activitylog'] || [],
          originalStatus: participantAssignment['status'],
          atcdocid:participantAssignment['atcdocid']
        };

        this.allActivities.push(activity);
      });

      this.categorizeActivities(selectedMarathon['marathonref'].id);
      this.applyStatusFilter("myactivities");
    });
  }

  categorizeActivities(marathonId: string) {
    const now = new Date();
    const categories = {
      myactivities: [],
      review: [],
      rework: [],
      missed: [],
      completed: []
    };

    this.allActivities.forEach(activity => {
      const startDateTime = this.createDateTime(activity.startdate, activity.startdate);
      const endDateTime = this.createDateTime(activity.enddate, activity.enddate);
      
      if (activity.originalStatus === 'completed') {
        categories.completed.push(activity);
      } else if (activity.originalStatus === 'rework') {
        categories.rework.push(activity);
      } else if (activity.originalStatus === 'review') {
        categories.review.push(activity);
      } else if (endDateTime < now) {
        categories.missed.push(activity);
      } else {
        categories.myactivities.push(activity);
      }
    });

    // Sort My Activities: ongoing first, then by start date
    categories.myactivities.sort((a, b) => {
      const aStart = this.createDateTime(a.startdate, a.startdate);
      const aEnd = this.createDateTime(a.enddate, a.enddate);
      const bStart = this.createDateTime(b.startdate, b.startdate);
      const bEnd = this.createDateTime(b.enddate, b.enddate);
      
      const aIsOngoing = now >= aStart && now <= aEnd;
      const bIsOngoing = now >= bStart && now <= bEnd;
      
      if (aIsOngoing && !bIsOngoing) return -1;
      if (!aIsOngoing && bIsOngoing) return 1;
      
      return aStart.getTime() - bStart.getTime();
    });

    this.mapParticipantAssignments[marathonId] = categories;
  }

  createDateTime(date: any, time: any): Date {
    if (!date || !time) return new Date(0);
    
    const d = date.toDate();
    const t = time.toDate();
    
    return new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      t.getHours(),
      t.getMinutes(),
      t.getSeconds()
    );
  }

   getPendingList() {
    if(this.bigParticipantsAssignmentsSubscription){
      this.bigParticipantsAssignmentsSubscription.unsubscribe()
    }
    collectionSnapshots(query(collection(this.firestore,"big participants assignments"),
      where("profileid", "==", this.currentProfile['profileid']))).pipe(takeUntil(this.subscription)).subscribe(assignmentsSnap => {
        Object.keys(this.marathonMap).forEach(marathonId => {
          this.marathonMap[marathonId].pending = 0;
        });      
        if (assignmentsSnap.length != 0) {
          for (let i = 0; i < assignmentsSnap.length; i++) {
            const assignmentData = assignmentsSnap[i].data();
            const marathonRefId = assignmentData['marathonref'].id;          
            if (assignmentData['status'] !== 'completed') {
              this.marathonMap[marathonRefId].pending++;
            }
          }
        }
    });
  }

  applyStatusFilter(status: string) {
    this.selectedStatus = status;
    this.updateDataSource(status);
  }

  updateDataSource(status: string) {
    if (
      !this.selectedMarathon['marathonref'] ||
      !this.mapParticipantAssignments[this.selectedMarathon['marathonref'].id] ||
      !this.mapParticipantAssignments[this.selectedMarathon['marathonref'].id][status]
    ) {
      this.dataSource.data = [];
      return;
    }
    this.dataSource.data = this.mapParticipantAssignments[this.selectedMarathon['marathonref'].id][status];
  }

  applyKeywordFilter(event: Event) {
    this.searchKeyword = (event.target as HTMLInputElement).value.trim().toLowerCase();
    let filteredData = this.mapParticipantAssignments[this.selectedMarathon['marathonref'].id][this.selectedStatus]
    if (this.searchKeyword) {
      filteredData = filteredData.filter(activity => {
        return (
          (activity.title && activity.title.toLowerCase().includes(this.searchKeyword)) ||
          (activity.directive && activity.directive.toLowerCase().includes(this.searchKeyword)) ||
          (activity.type && activity.type.toLowerCase().includes(this.searchKeyword)) ||
          (activity.assignmenttype && activity.assignmenttype.toLowerCase().includes(this.searchKeyword))
        );
      });
    }
    this.dataSource.data = filteredData;;
  }
 
  formatDate(date: any): string {
    if (!date) return '';
    if (date.toDate) {
      date = date.toDate();
    }
    return formatDate(date, 'EEE, MMM d, y, h:mm a', 'en-US');
  }
  
  hasUpcomingZoomCall(): boolean {
    return this.allActivities.some(activity => 
      activity.assignmenttype === 'Zoom Call' && 
      this.checkActivityStart(activity));
  }

  getNextZoomCall() {
    const upcomingCalls = this.allActivities.filter(activity => 
      activity.assignmenttype === 'Zoom Call' && 
      this.checkActivityStart(activity));
    if (upcomingCalls.length === 0) return null;
    return upcomingCalls.sort((a, b) => 
      a.startdate.toDate().getTime() - b.startdate.toDate().getTime())[0];
  }

  viewDirective(activity: any) {
    this.selectedDirective = activity.directive || 'No directive available';
  }

  bigChat(activity:any) {
    console.log(activity);
    console.log(this.loggedInProfileId,'----',activity.profileId);
    if (activity.profileId === this.loggedInProfileId) {
      this.router.navigate(['bigchatscreen'], {
        queryParams: {
          assignemtnId: activity.docid,
          assignmentprofileId:activity.profileId,
          sender: "participant"
        }
      }).then(() => {
        window.location.reload();
      }); 
    } else {
      alert("not allowed")
    }
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {duration: 3000});
  }

  performAction(activity: any,activityDate:boolean) {
    console.log(activity,"activity");
    if (activity.originalStatus === 'sent') {
      let confirmend = confirm(' Are you sure want to accept the Activity');
      if(confirmend){
        console.log(activity);
      }
    } else {
      if (activityDate) {
        switch (activity.assignmenttype) {
          case 'Zoom Call':
            this.joinMeeting(activity);
            break;
          case 'Form':
            if (activity.originalStatus === 'review' || activity.originalStatus === 'completed') {
              this.reviewLastForm(activity);
            } else {
              this.fillForm(activity);
            }
            break;
          case 'Manual Assignment':
            this.fillManualAssignment(activity);
            break;
          case 'Video':
            this.OpenVideos(activity);
            break;
          case 'Triple ATC':
            if (activity.originalStatus === 'review' || activity.originalStatus === 'completed') {
              this.previewTripleATC(activity);
            }else if (activity.originalStatus === 'rework'){
              this.editTripleATC(activity);
            }else{
              this.prescribeTripleATC(activity);
            }
            // this.tripleATCAssignment(activity);
            break;
          case 'ATC':
            if (activity.originalStatus === 'review' || activity.originalStatus === 'completed') {
              this.openPreviewATC(activity);
            }else if (activity.originalStatus === 'rework'){
              this.openEditATC(activity);
            }else{
              this.openPrescribeATC(activity);
            }
            break;
          default:
        }
      } else {
        const startDate = new Date(activity.startdate.seconds * 1000);
        const endDate = new Date(activity.enddate.seconds * 1000);

        const formattedStartDate = startDate.toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        });

        const formattedEndDate = endDate.toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        });

        if (this.currentTimestampSeconds >= (activity.startdate.seconds - (activity.startdate.seconds % 86400))) {
          this.openSnackBar(
            `This activity is no longer available. It ended on ${formattedEndDate}.`,
            "OK"
          );
        } else {
          this.openSnackBar(
            `This activity has not started yet. You can begin this activity on ${formattedStartDate}. Please come back then.`,
            "OK"
          );
        }
        console.log(activity, "activity");
        console.log(activityDate, "performAction activity date");
      }
    }
  }

  joinMeeting(activity: any) {
    let url = this.router.createUrlTree(['/zoommeeting_bigparticipants/'], {
      queryParams: {
        assignmentid: activity.docid,
        profileid: activity.profileId,
        participantAssignmentId: activity.participantAssignmentId,
        type: 0
      }
    });
    window.open(url.toString(), "_blank");
  }

  fillManualAssignment(activity: any) {
    let url = this.router.createUrlTree(['manual_assignment'], {
      queryParams: {
        assignmentid: activity.docid,
        profileid: activity.profileId,
        participantAssignmentId: activity.participantAssignmentId,
        type: [null, undefined, 'initiated', 'ongoing'].includes(activity.originalStatus) ? 'create' : 'rework'
      }
    });
    window.open(url.toString(), "_blank");
  }

  tripleATCAssignment(activity: any) {
    let url = this.router.createUrlTree(['triple_atc_assignment'], {
      queryParams: {
        assignmentid: activity.docid,
        profileid: activity.profileId,
        participantAssignmentId: activity.participantAssignmentId,
        from: 'bigcohorts',
      }
    });
    window.open(url.toString(), "_blank");
  }

  ATCAssignment(activity: any){
    let url = this.router.createUrlTree(['atc_assignment'],{
      queryParams:{
        assignmentid:activity.docid,
        profileid:activity.profileid,
        participantAssignmentId : activity.participantAssignmentId,
        from:'bigcohorts',
      }
    })
    
    window.open(url.toString(), "_blank")
  }

  fillForm(activity: any) {
    console.log(activity);

    const formTemplateId = activity.selectedform;
    const profileId = activity.profileId;
    const assignmentId = activity.docid;
    const participantAssignmentId = activity.participantAssignmentId;
    const activityLog = activity.activityLog;
    
    // let url = `/formbasedsubmission?id=${formTemplateId}&type=form&queueid=${assignmentId}&profileid=${profileId}&participantAssignmentId=${participantAssignmentId}`;
    let url = `/formtemplate?id=${formTemplateId}&type=form&queueid=${assignmentId}&profileid=${profileId}&participantAssignmentId=${participantAssignmentId}`;
    if (activityLog && activityLog.length > 0) {
      const encodedNotes = encodeURIComponent(JSON.stringify(activityLog[activityLog.length - 1].notes));
      url += `&reviewLast=true&reviewNotes=${encodedNotes}`;
    }
    console.log(url);
    
    window.open(url.toString(), "_blank");
  }

  reviewLastForm(activity: any){
    console.log(activity);
    
    const formtemplateid = activity.formtemplate;
    const profileId = activity.profileId;
    const activityref = activity.activityref;
    const summary = activity.summary;
    const participantAssignmentId = activity.participantAssignmentId;
    let url;
    const encodedNotes = encodeURIComponent(JSON.stringify(summary));
    if (activity.originalStatus === 'completed') {
      // url = "/formbasedsubmission?id=" + formtemplateid + "&type=form&patchdata=" + activityref.id + "&profileid=" + profileId + "&participantAssignmentId=" + participantAssignmentId + "&viewCompleted=" + true + "&reviewNotes=" + encodedNotes;  
      url = "/formtemplate?id=" + formtemplateid + "&type=form&patchdata=" + activityref.id + "&profileid=" + profileId + "&participantAssignmentId=" + participantAssignmentId + "&viewCompleted=" + true + "&reviewNotes=" + encodedNotes;  
    } else {
      // url = "/formbasedsubmission?id=" + formtemplateid + "&type=form&patchdata=" + activityref.id + "&profileid=" + profileId + "&participantAssignmentId=" + participantAssignmentId + "&viewFilledForm=" + true;  
      url = "/formtemplate?id=" + formtemplateid + "&type=form&patchdata=" + activityref.id + "&profileid=" + profileId + "&participantAssignmentId=" + participantAssignmentId + "&viewFilledForm=" + true;  
    }
    window.open(url.toString(),"_blank") 
  }
  
  checkActivityStart(activity: any): boolean {
    if (!activity?.startdate || !activity?.startdate || !activity?.enddate || !activity?.enddate) {
      return false;
    }

    const startDateTime = this.createDateTime(activity.startdate, activity.startdate);
    const endDateTime = this.createDateTime(activity.enddate, activity.enddate);
    const now = new Date();

    return now >= startDateTime && now <= endDateTime;
  }

  isActivityOngoing(activity: any): boolean {
    return this.checkActivityStart(activity);
  }

  OpenVideos(activity){

    const dialogRef = this.dialog.open(WatchVideosComponent, {
      data: {
        activity: activity,
      },
      disableClose: true
    });
    dialogRef.afterClosed().subscribe((result) =>{
      if (result?.['completed'] == true) {
        console.log(result);
        this.updateAssignmentStatus(activity.docid,activity.participantAssignmentId,'completed')
      }
    });

  }

  async updateAssignmentStatus(assignmentid: string, participantAssignmentId: string, status:string) {
    // if (assignmentid) {
    //   await updateDoc(doc(this.firestore, "big assignment", assignmentid), {
    //     status: "completed"
    //   })
    // }
    if (participantAssignmentId) {
      await updateDoc(doc(this.firestore, "big participants assignments", participantAssignmentId), {
        status: status
      });
    }
  }

  openPrescribeATC(activity) {
    // console.log(activity);
    const url = this.router.createUrlTree(['/prescribeATC'], { 
      queryParams: { 
        validation: true,
        profileid: this.currentProfile['profileid'],
        marathonid : activity.marathonref.id,
        assignmentid : activity.docid,
        participantassignmentid : activity.participantAssignmentId
      } 
    }).toString();
    window.open(url, '_blank');
  }

  openEditATC(activity){
    console.log(activity);
    const url = this.router.createUrlTree(['/editATC/' + activity.activityref.id + '/' + 'atc_to_validate'], {
      queryParams: {
        type: 'validation',
        atcdocid:activity.activityref.id,
        profileid: this.currentProfile['profileid'],
        marathonid: activity.marathonref.id,
        assignmentid: activity.docid,
        participantassignmentid: activity.participantAssignmentId
      }
    }).toString();
    window.open(url, '_blank');
  }


  openPreviewATC(activity) {
    console.log(activity);
    const url = this.router.createUrlTree(['/previewATC'], {
      queryParams: {
        type: 'validation',
        atcdocid:activity.activityref.id,
        validation: true,
        profileid: this.currentProfile['profileid'],
        marathonid: activity.marathonref.id,
        assignmentid: activity.docid,
        participantassignmentid: activity.participantAssignmentId
      }
    }).toString();
    window.open(url, '_blank');
  }

  shouldShowButton(activity: any): boolean {
    if(activity?.assignmenttype === 'Manual Assignment') return false;
    // Always show button for review, rework, and completed
    if (['review', 'rework', 'completed'].includes(this.selectedStatus)) {
      return true;
    }

    // Don't show button for missed
    if (this.selectedStatus === 'missed') {
      return false;
    }

    // For myactivities, always show button (either "Yet to Start" or "Open Activity")
    if (this.selectedStatus === 'myactivities') {
      return true;
    }

    return false;
  }

  getButtonText(activity: any): string {
    switch (this.selectedStatus) {
      case 'completed':
        return 'Completed';
      case 'review':
        return 'View Submitted Activity';
      case 'rework':
        return 'Rework Activity';
      case 'myactivities':
        return this.checkActivityStart(activity) ? 'Open Activity' : 'Yet To Start';
      default:
        return '';
    }
  }

  isButtonDisabled(activity: any): boolean {
    // Completed status is always disabled
    if (this.selectedStatus === 'completed') {
      return true;
    }

    // Yet to start buttons in myactivities should be disabled
    if (this.selectedStatus === 'myactivities' && !this.checkActivityStart(activity)) {
      return true;
    }

    return false;
  }

  prescribeTripleATC(activity) {
    // console.log(activity);
    const url = this.router.createUrlTree(['/addtripleATC'], { 
      queryParams: { 
        validation: true,
        profileid: this.currentProfile['profileid'],
        marathonid : activity.marathonref.id,
        assignmentid : activity.docid,
        participantassignmentid : activity.participantAssignmentId
      } 
    }).toString();
    window.open(url, '_blank');
  }

  editTripleATC(activity){
    console.log(activity);
    const url = this.router.createUrlTree(['/edittripleATC/' + activity.activityref.id], {
      queryParams: {
        type: 'validation',
        atcdocid:activity.activityref.id,
        profileid: this.currentProfile['profileid'],
        marathonid: activity.marathonref.id,
        assignmentid: activity.docid,
        participantassignmentid: activity.participantAssignmentId
      }
    }).toString();
    window.open(url, '_blank');
  }


  previewTripleATC(activity) {
    console.log(activity);
    const url = this.router.createUrlTree(['/previewtripleATC'], {
      queryParams: {
        type: 'validation',
        atcdocid:activity.activityref.id,
        validation: true,
        profileid: this.currentProfile['profileid'],
        marathonid: activity.marathonref.id,
        assignmentid: activity.docid,
        participantassignmentid: activity.participantAssignmentId
      }
    }).toString();
    window.open(url, '_blank');
  }

}