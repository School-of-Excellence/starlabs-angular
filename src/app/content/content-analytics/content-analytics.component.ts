import { Component, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { async, Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, Firestore, getDocs, onSnapshot, orderBy, query, where } from '@angular/fire/firestore';
import { log } from 'console';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-content-analytics',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    MatDatepickerModule,
    MatButtonModule,
    MatOptionModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatSelectModule
  ],  templateUrl: './content-analytics.component.html',
  styleUrl: './content-analytics.component.css'
})
export class ContentAnalyticsComponent {

  contentAnalytics=[];
  mapProfile = {}
  //newuser
  mapProfileNew = {}
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  // displayedColumns: string[] = ['profileid','from','lastwatchedtime','logdate','totalruntime','totaltimespend','type','videoname'];
  displayedColumns: string[] = ['logdate','profileid','from','videoname','platform_name','totalruntime','lastwatchedtime','totaltimespend','type','playlist','status'];
  contentData = new MatTableDataSource();
  startDate: Date;
  endDate: Date;
  mapPlaylist ={}

  filterValue = {
    name:null,
    startdate:null,
    enddate:null,
    from:null,
    videoname:[],
    totaltimespend:null,
    platform_name:null
  }

  videoNameList = []
  fromScreenList = []
  platformNameList = []
  private subscription = new Subject<void>();
  uniqueuser = 0
  uniqueUserContentConsumptionbyhours:any = 0
  uniqueUserContentConsumptionbydays:any = 0
  averageTimeSpendPerUser:any = 0
  querydays:any = null
  unsubscribeContentAnalytics: any;
  constructor(
    public firestore: Firestore,
    private guard : AuthguardService
  ){
    this.startDate = new Date(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate() -7));
    this.endDate = new Date(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()));
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map
    })
    //newuser
    this.guard.getProfileMapNewUser().then(newuser => {
      this.mapProfileNew = newuser.map
    })
    this.filterData();
    this.querydays = Math.round((Math.abs(new Date(this.endDate).getTime() - new Date(this.startDate).getTime()))/(1000*60*60*24))
  }

  ngOnInit(): void {
    this.contentData.filterPredicate = this.customfilter()
  }

  onClearFilterValue(){
    this.filterValue = {
      name:null,
      startdate:null,
      enddate:null,
      from:null,
      videoname:[],
      totaltimespend:null,
      platform_name:null
    }
    this.onFilter(this.filterValue)
  }

  ngAfterViewInit(){
    this.contentData.data = this.contentAnalytics
    this.contentData.sort = this.sort
    this.contentData.paginator = this.paginator
  }

  convertDecimal(value:number){
    const minutes = Math.floor(value / 60); // Get the whole minutes
    const remainingSeconds = value % 60; // Get the remaining seconds
    return `${minutes} mins ${remainingSeconds} sec (${value})`
  }

  convertDaysHoursMins(seconds:number){
    const days = Math.floor(seconds / (3600 * 24));
    const remainingSecondsAfterDays = seconds % (3600 * 24);

    const hours = Math.floor(remainingSecondsAfterDays / 3600);
    const remainingSecondsAfterHours = remainingSecondsAfterDays % 3600;

    const minutes = Math.floor(remainingSecondsAfterHours / 60);
    const remainingSeconds = remainingSecondsAfterHours % 60;

    return `${days} days ${hours} hours ${minutes} mins ${remainingSeconds} secs`
  }

  convertHoursMins(seconds:number){
    const hours = Math.floor(seconds / 3600);
    const remainingSecondsAfterHours = seconds % 3600;

    const minutes = Math.floor(remainingSecondsAfterHours / 60);
    const remainingSeconds = remainingSecondsAfterHours % 60;

    return `${hours} hours ${minutes} mins ${remainingSeconds} secs`
  }


  filterData(){
    // ref =>ref.where('logdate','>', this.startDate).where('logdate','<', this.endDate)
    // console.log(this.subscription?.closed);
    // if(this.subscription?.closed === false) this.subscription.unsubscribe()
    this.contentAnalytics = []
    this.ngAfterViewInit()
    this.startDate = new Date(this.startDate.setHours(0,0,0,0))
    this.endDate = new Date(this.endDate.setHours(23,59,59,999))
    console.log(this.startDate,this.endDate);
    const contentanalyticsRef = collection(this.firestore,"content analytics")
    const contentanalyticsQuery = query(contentanalyticsRef,where('logdate','>', this.startDate),where('logdate','<', this.endDate),orderBy('logdate','desc'))
    
    this.unsubscribeContentAnalytics = onSnapshot(
      contentanalyticsQuery,
      (snapshot) => {
        // Process each change exactly like before
        snapshot.docChanges().forEach(e => {
          let element = e.doc.data();
          element["docid"] = e.doc.id;
          element['live'] = (e.type === 'modified');
          this.contentAnalytics.push(element);
        });
        
        this.ngAfterViewInit();
        this.getUniqueUser();
        
        for (let i = 0; i < this.contentAnalytics.length; i++) {
          const element = this.contentAnalytics[i];
          if(!this.fromScreenList.includes(element['from'])){
            this.fromScreenList.push(element['from']);
          }
          if(!this.videoNameList.includes(element['videoname'])){
            this.videoNameList.push(element['videoname']);
          }
          if(element['platform_name'] != undefined){
            if(!this.platformNameList.includes(element['platform_name'])){
              this.platformNameList.push(element['platform_name']);
            }
          }
        }
        
        this.querydays = Math.round((Math.abs(new Date(this.endDate).getTime() - new Date(this.startDate).getTime()))/(1000*60*60*24));
      },
      (error) => {
        console.error("Content analytics error:", error);
      }
    );

    const solarvoiceplaylistRef = collection(this.firestore,"solar voice playlist")
    getDocs(solarvoiceplaylistRef).then(playlist=>{
      for(let i = 0; i<playlist.docs.length;i++){
        const element = playlist.docs[i].data();
        this.mapPlaylist[element['id']] = element['name']
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }


  applyNameFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.contentData.filter = filterValue;
  }

  getUniqueUser(){
    // this.uniqueuser = Array.from(new Map(this.contentAnalytics.map(e => [e.profileid,e])).values()).length;
    let uniqueUser:{[key:string]:number} = {}
    for (let i = 0; i < this.contentData.filteredData.length; i++) {
      const element = this.contentData.filteredData[i];
      uniqueUser[element['profileid']] = (uniqueUser[element['profileid']] || 0) + element['totaltimespend']
    }
    this.uniqueuser = Object.keys(uniqueUser).length
    let totalconsumption = Object.values(uniqueUser).reduce((c,a) => {
      return c + a
    },0)
    this.uniqueUserContentConsumptionbydays = this.convertDaysHoursMins(totalconsumption)
    this.uniqueUserContentConsumptionbyhours = this.convertHoursMins(totalconsumption)
    this.averageTimeSpendPerUser = this.convertHoursMins(Math.round(totalconsumption/this.uniqueuser))
  }

  onFilter(value:any){
    this.contentData.filter = JSON.stringify(value)
  }
  //newuser
  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (![null,undefined].includes(value['name']) ? (
      (this.mapProfile[e['profileid']]?.toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0) ||
      (this.mapProfileNew[e['profileid']]?.toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0)): true)&& 
      (value['startdate'] != null && value['enddate'] != null ? (e['logdate'].toDate() > new Date(new Date(value['startdate']).setHours(0,0,0,0)) && e['logdate'].toDate() < new Date(new Date(value['enddate']).setHours(23,59,59,59))) : true) &&
      (![null,undefined].includes(value['from']) ? (e['from'] === value['from']) : true) &&
      (value['videoname'].length != 0 ? value['videoname'].includes(e['videoname']) : true) &&
      (![null,undefined].includes(value['totaltimespend']) ? (Math.ceil(e['totaltimespend']/60) > value['totaltimespend']) : true) &&
      (![null,undefined].includes(value['platform_name']) ? (e['platform_name'] != undefined ? e['platform_name'] === value['platform_name'] : false) : true)
    }
    return filterFunction;
  }
  // public customfilter():(data:any,filter:string)=> boolean{
  //   let filterFunction = (data:any, filter:any):boolean => {
  //     let e = data
  //     let value = JSON.parse(filter);
  //     return (![null,undefined].includes(value['name']) ? (this.mapProfile[e['profileid']].toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0) : true) && 
  //           (value['startdate'] != null && value['enddate'] != null ? (e['logdate'].toDate() > new Date(new Date(value['startdate']).setHours(0,0,0,0)) && e['logdate'].toDate() < new Date(new Date(value['enddate']).setHours(23,59,59,59))) : true) &&
  //           (![null,undefined].includes(value['from']) ? (e['from'] === value['from']) : true) &&
  //           (value['videoname'].length != 0 ? value['videoname'].includes(e['videoname']) : true) &&
  //           (![null,undefined].includes(value['totaltimespend']) ? (Math.ceil(e['totaltimespend']/60) > value['totaltimespend']) : true) &&
  //           (![null,undefined].includes(value['platform_name']) ? (e['platform_name'] != undefined ? e['platform_name'] === value['platform_name'] : false) : true)
  //   }
  //   return filterFunction;
  // }

  async exportCSV(){
    // ['profileid','from','lastwatchedtime','logdate','totalruntime', 'totaltimespend' ,'type', 'videoname'];
    var data = []
    let clonedContentData = Object.assign([],this.contentData.filteredData.length != 0 ? this.contentData.filteredData : this.contentData.data)
    // console.log("clonedContentData",clonedContentData);
    
    for (let i = 0; i < clonedContentData.length; i++) {
      let element = clonedContentData[i]
      if([null,undefined].includes(element['videoname'])){
        console.log("videoname",element);
        
      }
      data.push({
        "logdate":new Date(new Date(element['logdate'].toDate()).getTime() + (5 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString().substring(0,10),
        "logtime":new Date(new Date(element['logdate'].toDate()).getTime() + (5 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString().substring(11,19),
        "name":this.mapProfile[element['profileid']] ?? this.mapProfileNew[element['profileid']],
        "from":element['from'],
        "videoname" :![null,undefined].includes(element['videoname']) ? element['videoname'].replace(/,/g," ") : null,
        "totalruntime(sec)":element['totalruntime'],
        "lastwatchedtime":element['lastwatchedtime'],
        // "lastwatchedtime(only mins)":element['lastwatchedtime'].slice(2,4),
        "totaltimespend(sec)":element['totaltimespend'],
        // "platform" : element['platform_name'] ?? null
        "platform": element['platform_name'] ?? "A&H App" 
        // type:element['type']
      })
        // element['name'] = this.mapProfile[element['profileid']]
        // delete element['profileid']
        // data.push(element)
    }
    // console.log(JSON.stringify(data))
    this.downloadFile(data, new Date().toDateString() + " " + "content analytics")
  }

  downloadFile(data,filename = 'data') {
    if(data.length != 0){
      let csvData = this.ConvertToCSV(data,Object.keys(data[0]));
      // console.log(csvData)
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
    }else{
      console.log("export data empty");
    }
  }

  ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = 'Index,';

    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    // console.log(row);
    
    str += row + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = (i + 1) + '';
      for (let index in headerList) {
        let head = headerList[index];
        line += ',' + array[i][head];
      }
      str += line + '\r\n';
    }
    // console.log(str);
    
    return str;
  }

  printLog(log){
    console.log(log)
  }

}
