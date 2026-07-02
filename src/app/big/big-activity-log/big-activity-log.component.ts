import { Component, OnInit, ViewChild } from '@angular/core';
import { collection, collectionData, Firestore, getDocs, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';


@Component({
  selector: 'app-big-activity-log',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    CommonModule,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatButtonModule,
    ProfilePictureComponent
  ],
  templateUrl: './big-activity-log.component.html',
  styleUrl: './big-activity-log.component.css'
})
export class BigActivityLogComponent {
    // Table Property
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  displayedColumns: string[] = ["profileid", "participantid", "activity", "activitydate", "queueid", "atcmodel", "source","matched"];
  dataSource = new MatTableDataSource();
  logtype = "studio"

  // ATC Activity Log
  activitylogSubscription: Subscription
  activityLogList = []

  // Studio Activity Log
  studiologSubscription: Subscription
  studioLogList = []
  mapStudioLog = {}

  // Profile Property
  profileSubscription: Subscription
  selectedProfile = null
  filteredProfile = ""
  profileList = []
  mapProfile = {}

  // Big Activity
  bigActivitySubscription: Subscription
  selectedBigActivity = null
  bigActivityList = []
  mapBigActivity = {}

  // Queue Property
  queueSubscription: Subscription
  queueList = []
  mapQueuename = {}
  selectedQueue = null

  //queue activity log
  queueActivityLogSubscription:Subscription
  queueActivityLogList:any [] = []
  mapQueueActivityLog = {}

  //filter
  filter:any = {
    atcmodel:[],
    selectedBigParticipant : [],
    selectedQueue:[],
    selectedBigActivity:[],
    selectedProfile:[],
    startdate:null,
    enddate:null
  }

  //atcmodel
  atcModelList = []

  //queue
  forQuerySelectedQueue = []
  studioActivityMatchedCount = 0
  studioActivityNotFoundCount = 0
  subscription = new Subject<void>

  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        collectionData(query(collection(this.firestore,"bigactivity"), orderBy("activity"))).pipe(takeUntil(this.subscription)).subscribe(list=>{
          this.bigActivityList = list
          this.bigActivityList.forEach(item=>{
            this.mapBigActivity[item["docid"]] = item["activity"]
          })
        })
        
        collectionData(query(collection(this.firestore,"profile_data"),orderBy("name"))).pipe(takeUntil(this.subscription)).subscribe(list=>{
          this.profileList = list
          this.profileList.forEach(item=>{
            this.mapProfile[item["profileid"]] = item
          })
        })
        collectionData(query(collection(this.firestore,"queue generation"), orderBy("queuename"))).pipe(takeUntil(this.subscription)).subscribe(list=>{
          this.queueList = list
          this.queueList.forEach(item=>{
            this.mapQueuename[item["docid"]] = item["queuename"]
          })
        })
      // }
    })
  }


  ngOnInit(): void {
    getDocs(collection(this.firestore,"products")).then(productSnap => {
      this.atcModelList = Array.from(new Set(productSnap.docs.map(e => e.data()['atcmodel'])))
    })

    this.dataSource.filterPredicate = this.customfilter()
  }

  onFilter(){
    console.log(this.filter);
    this.dataSource.filter = JSON.stringify(this.filter)
  }

  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['atcmodel'].length != 0 ? value['atcmodel'].includes(e['atcmodel']) : true) &&
      (value['selectedQueue'].length != 0 ? value['selectedQueue'].includes(e['queueid']) : true) && 
      (value['selectedBigActivity'].length != 0 ? value['selectedBigActivity'].includes(e['activity']) : true) && 
      (value['selectedProfile'].length != 0 ? value['selectedProfile'].includes(e['participantid']) : true) &&
      (value['selectedBigParticipant'].length != 0 ? value['selectedBigParticipant'].includes(e['profileid']) : true) &&
      (value['startdate'] != null && value['enddate'] != null ? e['activitydate'] > new Date(new Date(value['startdate']).setHours(0,0,0,0)) && e['activitydate'] < new Date(new Date(value['enddate']).setHours(23,59,59,999)) : true)
    }
    return (data: any, filter: string) => {
      let result = filterFunction(data, filter);
      return result
    };
  }

  onClearFilter(){
    this.filter = {
      atcmodel:[],
      selectedBigParticipant:[],
      selectedQueue:[],
      selectedBigActivity:[],
      selectedProfile:[],
      startdate:null,
      enddate:null
    }
    this.onFilter()
  }

  ngOnDestroy(){
    this.activitylogSubscription?.unsubscribe()
    this.profileSubscription?.unsubscribe()
    this.bigActivitySubscription?.unsubscribe()
    this.queueSubscription?.unsubscribe()
    this.queueActivityLogSubscription?.unsubscribe()
  }

  updateDataSource(){
    this.dataSource.data = this.logtype == "studio" ? this.studioLogList : this.logtype == "atc" ? this.activityLogList : this.queueActivityLogList
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }
  
  filterTable(value){
    this.dataSource.filter = value
  }

  filterProfileList(): Array<any>{
    var person = this.profileList.filter(e=>e.name.toLowerCase().includes(this.filteredProfile.toLowerCase()))
    return person;
  }

  onSelectQueue(){
    if(this.forQuerySelectedQueue.length != 0){
      collectionData(query(collection(this.firestore,"activitylog"), orderBy("activitydate", "desc"))).pipe(takeUntil(this.subscription)).subscribe(list=>{
        for (let i = 0; i < list.length; i++) {
          const data = list[i];
          data["activitydate"] = data["activitydate"].toDate()
        }
        this.activityLogList = list
        this.updateDataSource()
      })
      console.log("out",this.studiologSubscription);
      if(this.studiologSubscription){
        console.log("in subscription");
        this.studiologSubscription.unsubscribe()
      }
      collectionData(query(collection(this.firestore,"studio activity log"), where("queueid","in",this.forQuerySelectedQueue),orderBy("activitydate", "desc"))).pipe(takeUntil(this.subscription)).subscribe(list=>{
        this.mapStudioLog = {}
        for (let i = 0; i < list.length; i++) {
          list[i]["activitydate"] = list[i]["activitydate"].toDate()
          if(list[i]['matched'] != 'copy'){
            let key = `${list[i]['profileid']}_${list[i]['participantid']}_${list[i]['activity']}_${list[i]['queueid']}`
            this.mapStudioLog[key] = this.mapStudioLog[key] || []
            this.mapStudioLog[key].push(list[i])
          }
        }
        this.studioLogList = list
        this.updateDataSource()
        this.markStudioLogMatched()
      })
      console.log("out",this.queueActivityLogSubscription);
      if(this.queueActivityLogSubscription){
        console.log("in subscription");
        this.queueActivityLogSubscription.unsubscribe()
      }
      collectionData(query(collection(this.firestore,"queue activity log"), where("queueid","in",this.forQuerySelectedQueue),orderBy("activitydate","desc"))).pipe(takeUntil(this.subscription)).subscribe(list => {
        for (let i = 0; i < list.length; i++) {
          list[i]["activitydate"] = list[i]["activitydate"].toDate()
          let key = `${list[i]['profileid']}_${list[i]['participantid']}_${list[i]['activity']}_${list[i]['queueid']}`
          this.mapQueueActivityLog[key] = this.mapQueueActivityLog[key] || []
          this.mapQueueActivityLog[key].push(list[i])
        }
        this.queueActivityLogList = list
        this.updateDataSource()
        this.markStudioLogMatched()
      })
    }else{
      alert("Please select queue")
    }
  }

  markStudioLogMatched(){
    this.studioActivityMatchedCount = 0
    this.studioActivityNotFoundCount = 0
    for (const key in this.mapStudioLog) {
      let usedIndexes = new Set();
      this.mapStudioLog[key].forEach(obj1 => {
          let found = false;
          for(let i = 0; i < (this.mapQueueActivityLog[key] || []).length; i++) {
            // let obj2 = this.mapQueueActivityLog[key][i];
            if(!usedIndexes.has(i)) {
              usedIndexes.add(i); 
              found = true
              this.studioActivityMatchedCount += 1
              break;
            }
          }
          obj1.matched = found ? "matched" : "not found";
          if(!found){
            this.studioActivityNotFoundCount += 1
          }
      });
    }
  }

  markDuplicate(doc){
    if(this.logtype === "studio"){
      updateDoc(doc(this.firestore,"studio activity log"),doc['docid'],{
        matched:doc['matched'] === 'copy' ? null : 'copy'
      })
    }
  }

  async exportCSV(){
    var data = []
    for (let i = 0; i < this.dataSource.filteredData.length; i++) {
      const row = this.dataSource.filteredData[i];
      let obj = {
        "B!G Participants" : this.mapProfile[row["profileid"]]?.name,
        "Participants" : this.mapProfile[row["participantid"]]?.name,
        "Activity" : this.mapBigActivity[row["activity"]],
        "Actvity Date":row["activitydate"] ? row["activitydate"].toISOString() : "",
        "Queue" : this.mapQueuename[row["queueid"]],
        "ATC Model":row["atcmodel"] ?? "",
        "Source" : row["source"]
      }
      data.push(obj)
    }
    // console.log(JSON.stringify(data))
    if(this.dataSource.filteredData.length != 0){
      this.downloadFile(data, new Date().toDateString() + this.logtype)
    }else{
      alert("no participants selected.Export works only for selected participants ")
    }
  }
  
  downloadFile(data,filename = 'bigpariticipantsdata') {
    let csvData = this.ConvertToCSV(data,Object.keys(data[0]) );
    let blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    let dwldLink = document.createElement("a");
    let url = URL.createObjectURL(blob);
    let isSafariBrowser = navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1;
    if (isSafariBrowser) {  //if Safari open in new window to save file with random filename.
      dwldLink.setAttribute("target", "_blank");
    }
    dwldLink.setAttribute("href", url);
    dwldLink.setAttribute("download", filename + ".csv");
    dwldLink.style.visibility = "hidden";
    document.body.appendChild(dwldLink);
    dwldLink.click();
    document.body.removeChild(dwldLink);
  }

  ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = '';
    // 'Index,'
    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    console.log("row",row);
    str += row + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = '';
      // (i + 1) + 
      for (let index in headerList) {
        let head = headerList[index];
        line += array[i][head] + ',';
      }
      str += line + '\r\n';
    }
    console.log(str);
    
    return str;
  }
}
