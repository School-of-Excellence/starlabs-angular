import { Component } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { combineLatest, map, of, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatButtonModule } from '@angular/material/button';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-monitor-activity-log',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatSelectModule,
    CommonModule,
    FormsModule,
    NgxMatSelectSearchModule,
    MatCheckboxModule,
    MatButtonModule
  ],
  templateUrl: './monitor-activity-log.component.html',
  styleUrl: './monitor-activity-log.component.css'
})
export class MonitorActivityLogComponent {

  queueGenerationList: any[] = []
  selectedQueueList: any[] = []
  selectedQueueDoc = {}
  // Array
  tokenData: any[] = []
  paginatedTokenData: any[] = [] // For pagination
  compulsoryStages: string[] = []
  stageLogData: any[] = []
  studioLogData: any[] = []

  // Pagination properties
  pageSize: number = 5
  pageSizeOptions: number[] = [5, 10, 50]
  currentPage: number = 1
  totalItems: number = 0
  
  // Expanded rows tracking
  expandedRows: Set<string> = new Set<string>()

  // Maps
  mapQueueStageLog = {}
  mapLiveAssignment = {}
  mapParticipantStageLog = {}
  mapLiveAssignToActivityLog = {}
  mapProfile = {}
  mapBigActivity = {}
  allParticipantStageLog = {}
  mapStudioLog = {}
  atcmodelByProduct = {}
  atcmodelByVariationId = {}
  participantStageByLiveAssignment = {}

  // Observable
  private destroy$ = new Subject<void>();
  private queueSelection$ = new Subject<any>();
  
  private subscription = new Subject<void>();

  //loading progress
  get loading(){
    return this.dialog.open(LoadingProgressComponent,{
      data:{
        msg:"Please wait processing ..."
      }
    })
  }

  // filtering big activity logged in tokendata
  filteredTokenData = []
  bigActivityLogged:any[] = [true,false]
  bigActivityReview:any[] = ["none"]
  filterText:string = ""
  participantSearchText:string = ""
  filteredProfiles:any[] = []
  editrole:boolean = false
  constructor(
    private firestore: Firestore,
    private authguard: AuthguardService,
    private router : Router,
    private route : ActivatedRoute,
    private dialog : MatDialog,
    private snackbar : MatSnackBar
  ) {
    this.authguard.getuid().then((uid) => {
      if(['uJz8VjvijQR4tVMkJ4Y8ZQ9nBQ62','XRaBam1TiHdqls35AVTMgA16hva2','edKuVejA2vPcvYuvPyi2rXKgWBN2', 'dnwezEjM1KWBdqr14fM1k45nRvL2', '2OgWzhcPlCfi8JfLQ8B9CySZM6i2'].includes(uid)){
        this.editrole = true
      }
        const loadingRef = this.loading
        getDocs(collection(this.firestore,"queue generation")).then(snap => {
          this.queueGenerationList = snap.docs.map(e => {
            let element = e.data()
            element['ref'] = e.ref
            return element
          })
          this.route.queryParams.subscribe(params => {
            if(![null,undefined].includes(params['queueid'])){
              console.log("in params");
              let findQueueDoc = this.queueGenerationList.find(e => e.docid === params['queueid'])
              loadingRef.close()
              this.selectedQueueDoc = findQueueDoc
              this.queueSelection$.next(findQueueDoc)
            }else {
              console.log("else");
              loadingRef.close()
            }

            if(![null,undefined].includes(params['bigactivitylogged'])) this.bigActivityLogged = JSON.parse(params['bigactivitylogged'])
            if(![null,undefined].includes(params['bigactivityreview'])) this.bigActivityReview = JSON.parse(params['bigactivityreview'])
          })
        })
        this.authguard.getProfileMap().then((e) => {
          this.mapProfile = e.map
        })
        getDocs(collection(this.firestore,"bigactivity")).then(snap => {
          this.mapBigActivity = snap.docs.map(e => e.data()).reduce((a, c) => {
            a[c['docid']] = c['activity']
            return a
          }, {})
        })
        getDocs(collection(this.firestore,"products")).then(productSnap => {
          for (let i = 0; i < productSnap.docs.length; i++) {
            const element = productSnap.docs[i].data();
            this.atcmodelByProduct[element['id']] = element['atcmodel']
          }
        })
      // }
      // else{
      //   alert("Access denied")
      //   this.router.navigateByUrl("/")
      // }
    })

  }

  ngOnInit(): void {
    // Set up the subscription pipeline based on queue selection
    this.queueSelection$.pipe(
      takeUntil(this.destroy$),
      tap(value => {
        console.log("selected queue doc list", value);
        this.selectedQueueList = [value];
        this.compulsoryStages = this.extractCompulsoryStages(value);
        // Reset pagination when selecting a new queue
        this.currentPage = 1;
      }),
      switchMap(value => {
        const queueDocIdList = this.selectedQueueList.map(e => e['docid']);
        const queueDocRefList = this.selectedQueueList.map(e => e['ref']);
        
        // Create observables for all our data sources using the new Firebase v9+ API
        const tokens$ = collectionSnapshots(
          query(
            collection(this.firestore, "queue_token"),
            where("queueref", "in", queueDocRefList)
          )
        ).pipe(
          map(tokenSnap => tokenSnap.map(doc => ({ ...doc.data(), docid: doc.id })).filter(e => 
            e['stagestatus'] === 'Approved' && e['tokenstatus'] === 'Active'
          ).sort((a, b) => a['tokennumber'] - b['tokennumber']))
        );
        
        const stageLogs$ = collectionSnapshots(
          query(
            collection(this.firestore, "queue stage log"),
            where("queueref", "in", queueDocRefList),
            orderBy("logdate", "asc")
          )
        ).pipe(
          map(logs => logs.map(doc => ({ ...doc.data(), docid: doc.id })).filter(e => 
            e['stagestatus'] === 'Approved' && e['tokenstatus'] === 'Active'
          ))
        );
        
        const liveAssignments$ = collectionSnapshots(
          query(
            collection(this.firestore, "live assignment"),
            where("queueid", "in", queueDocIdList)
          )
        ).pipe(
          map(docs => docs.map(doc => ({ ...doc.data(), docid: doc.id })))
        );
        
        const studioLogs$ = collectionSnapshots(
          query(
            collection(this.firestore, "studio activity log"),
            where("queueid", "in", queueDocIdList),
            orderBy("created", "asc")
          )
        ).pipe(
          map(docs => docs.map(doc => ({ ...doc.data(), docid: doc.id })))
        );

        const queueActivityLogs$ = collectionSnapshots(
          query(
            collection(this.firestore, "queue activity log"),
            where("queueid", "in", queueDocIdList),
            orderBy("activitydate", "asc")
          )
        ).pipe(
          map(docs => docs.map(doc => ({ ...doc.data(), docid: doc.id })))
        );
        
        // Return a combined stream of all our data
        return combineLatest([
          tokens$,
          stageLogs$,
          liveAssignments$,
          studioLogs$,
          queueActivityLogs$,
          of({queueDocIdList, queueDocRefList}) // Pass the queueDocIdList to the next step
        ]);
      })
    ).subscribe(([tokens, stageLogs, liveAssignments, studioLogs, queueActivityLog, queueInfo]) => {
      
      // Update component data
      this.tokenData = tokens;
      console.log("this.tokenData", this.tokenData.length);
      
      this.stageLogData = stageLogs;
      this.studioLogData = studioLogs;

      // Sort stage logs as per compulsory stages
      // let mapStageIndex = this.selectedQueueList[0]['stages'].slice().reverse().reduce((prev, curr, index) => {
      //   prev[curr] = index
      //   return prev
      // }, {})
      
      // this.tokenData = this.tokenData.sort((a, b) => {
      //   const indexA = mapStageIndex[a['currentstage']] ?? Infinity;
      //   const indexB = mapStageIndex[b['currentstage']] ?? Infinity;
      //   return indexA - indexB;
      // });

      //sort by logdate
      this.tokenData = this.tokenData.sort((a, b) => {
        const dateA = a['logdate'] ? a['logdate'].toDate() : a['createdon'].toDate();
        const dateB = b['logdate'] ? b['logdate'].toDate() : b['createdon'].toDate();
        return dateB - dateA;
      });

      // Process live assignments
      this.mapLiveAssignment = {};
      for (const element of liveAssignments) {
        this.mapLiveAssignment[element['docid']] = element;
      }
      
      // Process stage logs
      this.allParticipantStageLog = {};
      this.mapParticipantStageLog = {};
      this.mapQueueStageLog = {};
      this.participantStageByLiveAssignment = {}
      
      for (const element of this.stageLogData) {
        this.allParticipantStageLog[element['profile_id']] = this.allParticipantStageLog[element['profile_id']] || []
        this.allParticipantStageLog[element['profile_id']].push(element)
        if(![null, undefined].includes(element['liveassignmentid'])){
          if(this.mapLiveAssignment[element['liveassignmentid']] && this.mapLiveAssignment[element['liveassignmentid']]['participantsactivity'] && Object.keys(this.mapLiveAssignment[element['liveassignmentid']]['participantsactivity']).length > 0){
            this.mapParticipantStageLog[element['profile_id']] = this.mapParticipantStageLog[element['profile_id']] || [];
          this.mapParticipantStageLog[element['profile_id']].push(element);

          this.mapQueueStageLog[element['logdocid']] = element;

          this.participantStageByLiveAssignment[element['profile_id']] = this.participantStageByLiveAssignment[element['profile_id']] || {}
          this.participantStageByLiveAssignment[element['profile_id']][element['currentstage']] = this.participantStageByLiveAssignment[element['profile_id']][element['currentstage']] || []
          this.participantStageByLiveAssignment[element['profile_id']][element['currentstage']].push(element['liveassignmentid'])
          }
        }
      }
      
      // Process activity logs (now handled in the main stream above)
      this.mapLiveAssignToActivityLog = {};
      for (const doc of queueActivityLog) {
        const element = doc;
        if (element['source'] === "queue stage log" && this.mapQueueStageLog[element['sourceref'].id]) {
          const liveAssignmentId = this.mapQueueStageLog[element['sourceref'].id]['liveassignmentid'];
          this.mapLiveAssignToActivityLog[liveAssignmentId] = this.mapLiveAssignToActivityLog[liveAssignmentId] || [];
          this.mapLiveAssignToActivityLog[liveAssignmentId].push(element);
        } else if(element['source'] === "live assignment"){
          const liveAssignmentId = element['sourceref'].id
          this.mapLiveAssignToActivityLog[liveAssignmentId] = this.mapLiveAssignToActivityLog[liveAssignmentId] || [];
          this.mapLiveAssignToActivityLog[liveAssignmentId].push(element);
        }
      }

      // Map studio activity logs by participant
      this.mapStudioLog = {}
      for (const studiolog of this.studioLogData) {
        this.mapStudioLog[studiolog['participantid']] = this.mapStudioLog[studiolog['participantid']] || []
        this.mapStudioLog[studiolog['participantid']].push(studiolog)
      }

      // Get atcmodel from queue variation using the new Firebase v9+ API
      getDocs(
        query(
          collection(this.firestore, "queue variation"),
          where("queueref", "in", queueInfo.queueDocRefList)
        )
      ).then((variationSnap) => {
        this.atcmodelByVariationId = {}
        variationSnap.forEach((doc) => {
          const variationElement = doc.data();
          if(variationElement['atcmodel']){
            this.atcmodelByVariationId[doc.id] = variationElement['atcmodel']
          }
        });
      });
      
      this.onFilterTokenData();
    });
  }

  onSearchTokenData(){
    return this.filteredProfiles = this.filteredTokenData.filter(e => e['profile_name'].toLowerCase().includes(this.participantSearchText ? this.participantSearchText.toLowerCase().trim() : ""))
  }

  onFilterTokenData(){
    //checking each token has live assignment captured or not (bigactivitylogged:boolean)
    for(const token of this.tokenData){
      let booleanarray = []
      if(this.participantStageByLiveAssignment.hasOwnProperty(token['profile_id'])){
        for (const stage in this.participantStageByLiveAssignment[token['profile_id']]) {
          if(this.participantStageByLiveAssignment[token['profile_id']][stage].map((e:string) => this.hasActivityLogs(e)).includes(true)){
            booleanarray.push(true)
          }else booleanarray.push(false)
        }
      }
      if(booleanarray.length > 0){
        if(booleanarray.includes(false)) token['bigactivitylogged'] = false
        else token['bigactivitylogged'] = true
      }else{
        token['bigactivitylogged'] = "none"
      }
    }
    console.log(this.filterText);
    
    this.filteredTokenData = this.tokenData.filter(e => 
      e['profile_id'].includes(![null,undefined].includes(this.filterText) ? this.filterText : "") && 
      this.bigActivityLogged.includes(e['bigactivitylogged'] != undefined ? e['bigactivitylogged'] : "none") &&
      this.bigActivityReview.includes(e['bigactivityreview'] != undefined ? e['bigactivityreview'] : "none")
    )
    // Update pagination
    this.totalItems = this.filteredTokenData.length;
    this.updatePaginatedData();
    this.router.navigate([],{
      queryParams:{
        bigactivitylogged:JSON.stringify(this.bigActivityLogged),
        bigactivityreview:JSON.stringify(this.bigActivityReview)
      },
      queryParamsHandling:'merge'
    })
  }

  // Update paginated data based on current page and page size
  updatePaginatedData() {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, this.filteredTokenData.length);
    this.paginatedTokenData = this.filteredTokenData.slice(startIndex, endIndex);
  }

  // Change page size
  onPageSizeChange(newSize: number) {
    this.pageSize = newSize;
    this.currentPage = 1; // Reset to first page
    this.updatePaginatedData();
  }

  // Go to specific page
  goToPage(page: number) {
    this.currentPage = page;
    this.updatePaginatedData();
  }

  // Extract compulsory stages from queue document
  private extractCompulsoryStages(value: any): string[] {
    const stages: string[] = [];
    for (const queuedoc of [value]) {
      for (const key in queuedoc['stageproperty']) {
        if (queuedoc['stageproperty'][key] && 
            queuedoc['stageproperty'][key]['compulsoryactivity'] && 
            Object.values(queuedoc['stageproperty'][key]['compulsoryactivity']).length !== 0) {
          stages.push(key);
        }
      }
    }
    return value['stages'].filter((e: string) => stages.includes(e));
  }
  
  // Handle queue selection from UI
  onSelectQueue(value: any) {
    this.queueSelection$.next(value);
    this.router.navigate([],{
      queryParams:{
        queueid:value['docid']
      },
      queryParamsHandling:'merge'
    })
  }

  // Toggle expanded row
  toggleRow(profileId: string) {
    if (this.expandedRows.has(profileId)) {
      this.expandedRows.delete(profileId);
    } else {
      this.expandedRows.add(profileId);
      // Format dates if needed for the expanded logs
      if (this.allParticipantStageLog[profileId]) {
        this.allParticipantStageLog[profileId].forEach(log => {
          // Ensure the date is properly formatted for display
          // This handles both Firestore Timestamp objects and regular Date objects
          if (log.logdate && typeof log.logdate.toDate === 'function') {
            // It's a Firestore Timestamp
            log._formattedDate = log.logdate.toDate();
          } else {
            // It's already a Date or a string
            log._formattedDate = log.logdate;
          }
        });
      }
    }
  }

  // Check if row is expanded
  isRowExpanded(profileId: string): boolean {
    return this.expandedRows.has(profileId);
  }
  
  hasActivityLogs(liveassignmentid: string): boolean {
    return this.mapLiveAssignToActivityLog[liveassignmentid] 
            && this.mapLiveAssignToActivityLog[liveassignmentid].length > 0 ? true : false;
  }

  isProfileInAssignment(profileId: string, liveassignmentid: string): boolean {
    return this.mapLiveAssignment[liveassignmentid] && 
           this.mapLiveAssignment[liveassignmentid].participantsactivity &&
           Object.keys(this.mapLiveAssignment[liveassignmentid].participantsactivity).includes(profileId);
  }

  // Return total pages count for pagination
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }
  
  // Generate array of page numbers for pagination UI
  get pageNumbers(): number[] {
    const pages = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }
  
  ngOnDestroy() {
    // Complete all subscriptions
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onManageQueueActivityLog(type:string,queuestagelogdoc:{[key:string]:any}){
    console.log(type,queuestagelogdoc);
    if(type === 'add'){
      if(confirm("Are you sure want to add big participant activity")){
        let batch = writeBatch(this.firestore)
        const liveAssignmentDoc = this.mapLiveAssignment[queuestagelogdoc['liveassignmentid']]
        if (liveAssignmentDoc && ![null,undefined].includes(liveAssignmentDoc['participantsactivity'])){
          for (const profileId in liveAssignmentDoc['participantsactivity']) {
            const docid = doc(collection(this.firestore,'queue activity log')).id
            const activitydoc = {
              activity: liveAssignmentDoc['participantsactivity'][profileId],
              activitydate:![null,undefined].includes(liveAssignmentDoc['updated']) ? liveAssignmentDoc['updated'].toDate() : liveAssignmentDoc['created'].toDate(),
              atcmodel: queuestagelogdoc['variationid'] ? ![null,undefined].includes(this.atcmodelByVariationId[queuestagelogdoc['variationid']]) ? this.atcmodelByVariationId[queuestagelogdoc['variationid']] :this.atcmodelByProduct[queuestagelogdoc['productref'].id] : this.atcmodelByProduct[queuestagelogdoc['productref'].id],
              docid: docid,
              profileid: profileId,
              queueid: queuestagelogdoc['queueref'].id,
              participantid: queuestagelogdoc['profile_id'],
              stagename:liveAssignmentDoc['stagename'],
              source: "live assignment",
              sourceref: doc(this.firestore,"live assignment",liveAssignmentDoc['docid'])
            };
            batch.set(doc(this.firestore,"queue activity log",docid), activitydoc);
          }
          if(liveAssignmentDoc['bonusactivity']){
            for (const profileid in liveAssignmentDoc['bonusactivity']) {
              const docid = doc(collection(this.firestore,'queue activity log')).id
              const activitydoc = {
                activity: liveAssignmentDoc['bonusactivity'][profileid],
                activitydate:![null,undefined].includes(liveAssignmentDoc['updated']) ? liveAssignmentDoc['updated'].toDate() : liveAssignmentDoc['created'].toDate(),
                atcmodel: queuestagelogdoc['variationid'] ? ![null,undefined].includes(this.atcmodelByVariationId[queuestagelogdoc['variationid']]) ? this.atcmodelByVariationId[queuestagelogdoc['variationid']] :this.atcmodelByProduct[queuestagelogdoc['productref'].id] : this.atcmodelByProduct[queuestagelogdoc['productref'].id],
                docid: docid,
                profileid: profileid,
                queueid: queuestagelogdoc['queueref'].id,
                participantid: queuestagelogdoc['profile_id'],
                stagename:liveAssignmentDoc['stagename'],
                source: "live assignment",
                sourceref: doc(this.firestore,"live assignment",liveAssignmentDoc['docid'])
              };
              batch.set(doc(this.firestore,"queue activity log",docid), activitydoc);
            }
          }
        }
        await batch.commit().then(() => {
          console.log("successfully activity log added");
        })
      }
    }
    if(type === 'remove'){
      if(confirm("are you sure want to remove big participant activity")){
        if(this.mapLiveAssignToActivityLog[queuestagelogdoc['liveassignmentid']].length > 0){
          let batch = writeBatch(this.firestore)
          for (let i = 0; i < this.mapLiveAssignToActivityLog[queuestagelogdoc['liveassignmentid']].length; i++) {
            const queueActivityElement = this.mapLiveAssignToActivityLog[queuestagelogdoc['liveassignmentid']][i];
            console.log(queueActivityElement);
            let ref = doc(this.firestore,"queue activity log",queueActivityElement['docid'])
            batch.delete(ref)
          }
          await batch.commit().then(() => {
            console.log("successfully activity log removed");
          })
        }
      }
    }
  }

  onValidateBigActivityByParticipant(event:MatCheckboxChange,token:{[key:string]:any}){
    console.log(event);
    
    updateDoc(doc(this.firestore,"queue_token",token['docid']),{
      bigactivityreview:event.checked
    }).then(() => {
      console.log("successfully updated big activity review ",this.mapProfile[token['profile_id']]);
    })
  }

  exportLog(){
    var dump = []
    this.filteredTokenData.forEach(token =>{
      (this.mapParticipantStageLog[token.profile_id] ?? []).forEach(stage =>{
        if(this.mapLiveAssignToActivityLog[stage.liveassignmentid] && this.mapLiveAssignToActivityLog[stage.liveassignmentid].length > 0){
          if(this.mapLiveAssignment[stage.liveassignmentid] && this.mapLiveAssignment[stage.liveassignmentid]['participantsactivity']){
            var liveAssignmentData = this.mapLiveAssignment[stage.liveassignmentid] ?? {}
            Object.keys((liveAssignmentData["participantsactivity"] ?? {})).forEach((key) =>{
              var value = liveAssignmentData["participantsactivity"][key]
              dump.push({
                bigparticipant: this.mapProfile[key],
                bigactivity: this.mapBigActivity[value],
                participant: this.mapProfile[token["profile_id"]],
                tokennumber: token["tokennumber"],
                stagename: liveAssignmentData["stagename"],
                created: liveAssignmentData["created"]?.toDate(),
                updated: liveAssignmentData["updated"]?.toDate(),
                queuename: this.selectedQueueDoc["queuename"]
              })
            })
            Object.keys((liveAssignmentData["bonusactivity"] ?? {})).forEach((key) =>{
              var value = liveAssignmentData["bonusactivity"][key]
              dump.push({
                bigparticipant: this.mapProfile[key],
                bigactivity: this.mapBigActivity[value],
                participant: this.mapProfile[token["profile_id"]],
                tokennumber: token["tokennumber"],
                stagename: liveAssignmentData["stagename"],
                created: liveAssignmentData["created"]?.toDate(),
                updated: liveAssignmentData["updated"]?.toDate(),
                queuename: this.selectedQueueDoc["queuename"]
              })
            })
          }
        }
      })
    })
    console.log(dump)

    // Convert JSON -> Sheet
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(dump);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Big Monitor.xlsx');

    /* save to file */
    XLSX.writeFile(wb, 'Events Data');
  }

}
