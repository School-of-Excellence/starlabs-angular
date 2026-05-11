import { Component, ElementRef, NgZone, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { getFirestore, collection, query, orderBy, collectionData, collectionSnapshots} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { combineLatestWith, debounceTime, map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSort } from '@angular/material/sort';
import { FormsModule } from '@angular/forms'; 
import { MatSelectModule } from '@angular/material/select'; 
import { CommonModule } from '@angular/common';
import { MatRadioModule } from '@angular/material/radio';   
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ReviewParticipantAELComponent } from './review-participant-ael/review-participant-ael.component';
import { doc, where, getDocs, Timestamp ,writeBatch,updateDoc} from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-participant-ael',
  standalone: true,
  imports: [CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgxMatSelectSearchModule,
    MatFormFieldModule,
    MatSelectModule,
    MatRadioModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule],
  templateUrl: './participant-ael.component.html',
  styleUrls: ['./participant-ael.component.css']
})
export class ParticipantAELComponent implements OnInit {
  superRole = false
  loggedinProfileData = {}
  mapProfile = {}
  private firestoreSubscription = new Subject<void>();

  // Table Data
  @ViewChild(MatPaginator) paginator: MatPaginator
  @ViewChild(MatSort) sort: MatSort
  tableHeader = []
  tableHeaderWithAction: string[] = []
  tableDataSource = new MatTableDataSource<any[]>()
  // Filter Option
  selectedFilterType = "event"
  selectedLiveEvent = null
  acceleratorLevelLoaded = false;
  selectedBigParticipanttype = null
  selectedBigParticipant = null
  filterText:string= ""
  filteredProfiles:any[] = []
  prescribedParticipantList = []
  liveEventList = []
  eventParticipantList = []
  categoryList = []
  gourpParticipantAEL = {}
  participantAELlist = []
  acceleratorLevel = []
  startDate = null
  endDate = null
  firestoreDefault = getFirestore()

  constructor(
    public guard: AuthguardService,
    public matDialog: MatDialog,
    private cdRef: ChangeDetectorRef,
    private route: ActivatedRoute,
    public ngZone: NgZone
  ) {
    guard.getRoles().then(roles =>{
      this.loggedinProfileData = roles
      console.log("logged In", this.loggedinProfileData)
      this.superRole = roles["admin"] || roles["ah"] || roles["developer"] || roles["mentor"]
      // if(roles["eis"] || this.superRole){
        this.loadData()
      // }
    })
  }

  ngOnInit() {
  }
  ngAfterViewInit(): void {
   this.tableDataSource.paginator = this.paginator;
   this.tableDataSource.sort = this.sort;
   this.cdRef.detectChanges();

  }

  ngOnDestroy() {
    this.firestoreSubscription.next(); 
    this.firestoreSubscription.complete(); 
  }
 
  async getPrescribedParticipant(){
    console.log("ATC From", this.startDate, this.endDate)
    var profileref = null
    if(this.selectedBigParticipant != "all" && this.selectedBigParticipant != null){
      profileref = doc(this.firestoreDefault, "profile_data", this.selectedBigParticipant);
    }
    try{
    const firestoreATC = getFirestore("firestore-atc")
    let atcQuery = query(
      collection(firestoreATC, "atc_alpha"), where("type", "==", "online"),  where("isdelete", "==", false), where("prescription_date", ">=", this.startDate), where("prescription_date", "<=", this.endDate)
    );
    if (profileref) {
      atcQuery = query(atcQuery, where("author", "array-contains", profileref));
    }
    const atcSnapshot = await getDocs(atcQuery);
      console.log("ATC Prescribed By Author", profileref?.id, "---", atcSnapshot.size);
      this.prescribedParticipantList = []
      for (let i = 0; i < atcSnapshot.docs.length; i++) {
        const doc = atcSnapshot.docs[i];
        var data = doc.data()
        var atcModel = data["product"]
        var eligibleModel = ["A&H ATC", "B!G", "CI", "CPM", "Expanding Horizon", "LYL", "SLD", "uP!"]
        if(eligibleModel.includes(atcModel)){ 
          this.prescribedParticipantList.push(data["profileid"])
        }
      }
      this.prescribedParticipantList = Array.from(new Set(this.prescribedParticipantList))
    }
    catch (err) {
    console.error("Error fetching prescribed participants:", err);
    }
  }
  
  async loadData() {
    const loading = this.matDialog.open(LoadingProgressComponent, {
      disableClose: true,
      data: { msg: "Pre-Fetching Data..." }
    });
    await this.guard.getProfileMap().then(data => {
      this.mapProfile = data.map;
      this.filteredProfiles = Object.keys(this.mapProfile)
    });
    if (!this.acceleratorLevelLoaded) {
      const accelQuery = query(
        collection(this.firestoreDefault, "accelerated evolution level"),
      )
      const snapshot = await getDocs(accelQuery);
      this.acceleratorLevel = snapshot.docs.map(doc => doc.data())

      console.log("Accelerator Level snapshot count:", snapshot.docs.length)
      console.log("Accelerator Level data:", this.acceleratorLevel)

      this.acceleratorLevelLoaded = true;
    }

    // collectionData(eventQuery, {idField: "id"}).pipe(
    //   takeUntil(this.firestoreSubscription)
    // ).subscribe(snapshot =>{
    //   this.ngZone.run(() => {
    //     this.liveEventList = snapshot;
    //   });
    // })
  
    const eventQuery = query(collection(this.firestoreDefault, "event collection"), orderBy("end_date", "desc"));
    const queueQuery = query(collection(this.firestoreDefault, "queue generation"), orderBy("queueenddate", "desc"));
    var eventSnapshot = collectionSnapshots(eventQuery)
    var queueSnapshot = collectionSnapshots(queueQuery)
    eventSnapshot.pipe(
      combineLatestWith(queueSnapshot), // Combine Other Subscription
      takeUntil(this.firestoreSubscription), // Subscribe until destroyed
      debounceTime(300), // Debounce to handle multiple rapid updates
      map(([eventDocs, queueDocs]) => {
        console.log(eventDocs.length, "Event data");
        console.log(queueDocs.length, "Queue Data")
        var liveEvent = []
        var QueueEvent = []

        eventDocs.forEach(doc =>{
          var data = doc.data()
          liveEvent.push({
            eventpath: doc.ref.path,
            type: "Live Event",
            eventname: data["name"],
            startdate: data["start_date"].toDate(),
            enddate: data["end_date"].toDate(),
          })
        })
        queueDocs.forEach(doc =>{
          var data = doc.data()
          QueueEvent.push({
            eventpath: doc.ref.path,
            type: "Queue Event",
            eventname: data["queuename"],
            startdate: data["queuestartdate"].toDate(),
            enddate: data["queueenddate"].toDate(),
          })
        })
        const merged = [...liveEvent, ...QueueEvent].sort(
          (a, b) => b["startdate"] - a["startdate"]
        );
        return merged;
      })
    ).subscribe({
      next: mergedDocs => {
        console.log("Subscribed to Combine Query", mergedDocs.length)
        this.liveEventList = mergedDocs
      },
      error: err => {
        console.log("Error in Combine Query", err)
      },
      complete: () => {
        console.log("Subscription Completed")
      }
    })

    const aelQuery = query(
      collection(this.firestoreDefault, "participant AEL"),
      orderBy("created", "desc")
    );
    collectionData(aelQuery, {idField: "id"}).pipe(
      takeUntil(this.firestoreSubscription)
    ).subscribe(snapshot =>{
      console.log("Total AEL", snapshot.length);
      this.ngZone.run(() => {
        this.participantAELlist = snapshot;
        this.groupAELbyProfile();
        if (loading) {
          loading.close();
        }
      });
    })
    // onSnapshot(aelQuery, snapshot => {
    //   const aelList = snapshot.docs.map(doc => doc.data());
    //   console.log("Total AEL", aelList.length);
    //   this.ngZone.run(() => {
    //     this.participantAELlist = aelList;
    //     this.groupAELbyProfile();
    //     if (loading) {
    //       loading.close();
    //     }
    //   });
    // });
  }

  async groupAELbyProfile(){
    if(this.selectedLiveEvent != null && this.selectedBigParticipant != "all" && this.selectedBigParticipant != null) {
      await this.getPrescribedParticipant()
    }
    else{
      this.prescribedParticipantList = []
    }
    console.log(this.selectedFilterType, this.selectedBigParticipant, this.selectedBigParticipanttype)
    this.gourpParticipantAEL = {}
    for (let i = 0; i < this.participantAELlist.length; i++) {
      const data = this.participantAELlist[i];
      var profileid = data["profileid"]

      if(this.selectedLiveEvent != null && !this.eventParticipantList.includes(profileid)){
        continue;
      }

      if(this.selectedFilterType == "event"){ 
        if(this.selectedBigParticipant != "all" && !this.prescribedParticipantList.includes(profileid)){
          continue;
        }
      }
      if(!(data["created"] instanceof Date && !isNaN(data["created"].getTime()))) data["created"] = data["created"].toDate()
      if(!(data["tentativestart"] instanceof Date && !isNaN(data["tentativestart"].getTime()))) data ["tentativestart"] = data ["tentativestart"]?.toDate()
      if(!(data["tentativeend"] instanceof Date && !isNaN(data["tentativeend"].getTime()))) data ["tentativeend"] = data ["tentativeend"]?.toDate()
      if(!this.gourpParticipantAEL[profileid]){
        this.gourpParticipantAEL[profileid] = {
          participant: this.mapProfile[profileid],
          profileid: profileid,
          // Recent AEL Data
          recentdate: data["created"],
          recentstatus: data["flag"] ?? "unvalidated",
          recentparticipantresponse: data["participantresponse"],
          recentaelid: data["docid"],
          recentvalidatedby: data["validatedby"] != null ? this.mapProfile[data["validatedby"]] : null,
          recentupdated: data["updated"] ?? false,
          // Group AEL
          total: [],
          validated: [],
          invalidate: [],
          discusslater: [],
          pending: []
        }

        var selectedCategory = data["category"] ?? []
        for (let a = 0; a < selectedCategory.length; a++) {
          const type = selectedCategory[a]
          var trimmedType = type?.trim()
          var crossoverMetric = (data["crossovermetric"] ?? {})[type]
          if(crossoverMetric){
            this.gourpParticipantAEL[profileid][trimmedType] = `${crossoverMetric["startpoint"]} - ${crossoverMetric["endpoint"]}`
          }
          if(!this.categoryList.includes(trimmedType)){
            this.categoryList.push(trimmedType)
          }
        }
      }

      this.gourpParticipantAEL[profileid].total.push(data)
      if(data["flag"] == "validated"){
        this.gourpParticipantAEL[profileid].validated.push(data)
      }
      else if(data["flag"] == "invalidate"){
        this.gourpParticipantAEL[profileid].invalidate.push(data)
      }
      else if(data["flag"] == "discuss later"){
        this.gourpParticipantAEL[profileid].discusslater.push(data)
      }
      else{
        this.gourpParticipantAEL[profileid].pending.push(data)
      }
    }
    this.tableHeader = ["sno", "participant", "recentdate", ...this.categoryList, "recentstatus", "recentvalidatedby", "recentparticipantresponse"]
    this.tableHeaderWithAction = [...this.tableHeader, "action"];
    this.tableDataSource.data = Object.values(this.gourpParticipantAEL)
    this.tableDataSource._updateChangeSubscription()
    this.tableDataSource.sort = this.sort
    this.tableDataSource.paginator = this.paginator
    this.cdRef.detectChanges(); 

  }

  applyFilter(value){
    console.log(value)
    this.tableDataSource.filter = value
  }

  onFilterProfiles(){
    const value = ![null,undefined,""].includes(this.filterText) ? this.filterText.toLowerCase().trim() : ""
    return this.filteredProfiles = Object.keys(this.mapProfile).filter(e => this.mapProfile[e].toLowerCase().includes(value))
  }

  onAllAELselect(){
    this.selectedFilterType = 'all';
    this.selectedLiveEvent = null;
    this.selectedBigParticipant = null;
    this.selectedBigParticipanttype = null
    this.groupAELbyProfile();
  }

  async onLiveEventSelect(){
    console.log("Selected Event", this.selectedLiveEvent)
    this.filterText = "";
    this.onFilterProfiles()
    this.startDate = new Date(this.selectedLiveEvent["startdate"])
    this.startDate.setMonth(this.startDate.getMonth() - 3)
    this.endDate = this.selectedLiveEvent["enddate"]
    this.selectedFilterType = 'event';
    this.selectedBigParticipant = this.loggedinProfileData["profile_ref"].id;
    this.selectedBigParticipanttype = this.loggedinProfileData["profile_ref"].id;
    var loading = this.matDialog.open(LoadingProgressComponent, {
      data: {msg: "Loading Participant from the Selected Event"},
      disableClose: true
    })
    try {
      if(this.selectedLiveEvent["type"] == "Live Event"){
        const eventRef = doc(this.firestoreDefault, this.selectedLiveEvent["eventpath"]);
        const participationQuery = query(
          collection(this.firestoreDefault, "event participation request"),
          where("eventref", "==", eventRef),
          where("status", "in", ["approved", "attended"])
        );
        const snapshot = await getDocs(participationQuery);
        const approvedList = [];
        for (let i = 0; i < snapshot.docs.length; i++) {
          approvedList.push(snapshot.docs[i].data()["profileid"]);
        }
        this.eventParticipantList = approvedList;
      }
      else{
        const eventRef = doc(this.firestoreDefault, this.selectedLiveEvent["eventpath"]);
        const participationQuery = query(
          collection(this.firestoreDefault, "queue_token"),
          where("queueref", "==", eventRef),
          where("stagestatus", "==", "Approved"),
          where("tokenstatus", "==", "Active"),
        );
        const snapshot = await getDocs(participationQuery);
        const approvedList = [];
        for (let i = 0; i < snapshot.docs.length; i++) {
          approvedList.push(snapshot.docs[i].data()["profile_id"]);
        }
        this.eventParticipantList = approvedList;
      }
  } catch (err) {
    console.log(err);
  }
    this.groupAELbyProfile()
    this.ngZone.run(() =>{
      loading.close()
    })
  }

  onBigParticipantSelect(profileid){
    console.log(profileid)
    this.filterText = "";
    this.onFilterProfiles()
    this.selectedBigParticipant = profileid
    this.selectedBigParticipanttype = profileid
    this.groupAELbyProfile();
  }

  async markAsValidate(row){
    var recentAEL = row["total"][0]
    console.log(recentAEL)
    if(confirm("Sure, Mark this as validated?")){
      var loading = this.matDialog.open(LoadingProgressComponent, {
        data: {msg: "Updating..."},
        disableClose: true
      })
      const batch = writeBatch(this.firestoreDefault);
      const participantAELDocRef = doc(this.firestoreDefault, "participant AEL", recentAEL["docid"]);
      batch.update(participantAELDocRef, {
        status: "ongoing",
        tentativestart: recentAEL["created"],
        flag: "validated",
        validatedby: this.loggedinProfileData["profile_ref"].id
      })
      const interimCrossoverQuery = query( collection(this.firestoreDefault, "interim crossover"), where("aelid", "==", recentAEL["docid"]) );
      const metricSnapshot = await getDocs(interimCrossoverQuery);
      const metricData = metricSnapshot.docs.map(doc => doc.data());
        metricData.sort((a, b) => b["created"].toDate() - a["created"].toDate())
        if(metricData.length != 0){
          const latestDocId = metricData[0]["docid"];
          const interimDocRef = doc(this.firestoreDefault, "interim crossover", latestDocId);
          batch.update(interimDocRef, {
            validatedby: this.loggedinProfileData["profile_ref"].id
          })
        }
      await batch.commit().catch(err =>{
        console.log(err)
      })
      this.ngZone.run(() =>{
        loading.close()
      })
    }
  }

  discussLater(row){
    var recentAEL = row["total"][0]
    console.log(recentAEL)
    if(confirm("Sure, Mark this as Discuss Later?")){
      const participantDocRef = doc(this.firestoreDefault, 'participant AEL', recentAEL.docid);
      updateDoc(participantDocRef, {
        flag: "discuss later",
      })
    }
  }
  async reviewAEL(row: any) {
    // await this.loadData();
    // this.groupAELbyProfile(); 
    this.openReviewDialog(row); 
  }

  openReviewDialog(row: any) {
    console.log("Data sent to dialog:");
    console.log("Accelerator Level:", this.acceleratorLevel);
    console.log("Selected AEL:", [row["total"][0]]);
    this.matDialog.open(ReviewParticipantAELComponent, {
      disableClose: true,
      autoFocus: false,
      maxHeight: "90vh",
      maxWidth: "90vw",
      data: {
        level: this.acceleratorLevel,
        selectedAEL: [row["total"][0]]
      }
    });
  }
}