import { CommonModule } from '@angular/common';
import { Component, inject, ViewChild } from '@angular/core';
import { collection, collectionGroup, doc, Firestore, getDocs, limit, orderBy, query, where } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject } from 'rxjs';
import * as XLSX from 'xlsx';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatButtonModule } from "@angular/material/button";

@Component({
  selector: 'app-notifications-log',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatSelectModule,
    MatButtonModule
],
  providers:[
    provideNativeDateAdapter()
  ],
  templateUrl: './notifications-log.component.html',
  styleUrl: './notifications-log.component.css'
})

export class NotificationsLogComponent {
  // Mat Table Properties
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  // Notification Log
  displayedColumns: string[] = ["name", "message", "sticky", "type", "date", "read", "clicked", "landingpage"];
  dataSource:MatTableDataSource<any> = new MatTableDataSource();
  notificationLogList = []
  selectedNotificationType = ""
  notificationTypes = []

  // Map App User
  mapAppUser = {}
  NotificationReadUserID = []

  // Date
  selectedDate = new Date()
  startDate: Date | null = new Date();
  endDate: Date | null = new Date();
  //
  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  constructor(public dialog: MatDialog) {
    getDocs(collection(this.firestore,"user_data")).then(profile=>{
      console.log(profile.size)
      profile.forEach(doc=>{
        this.mapAppUser[doc.id] = doc.data()["name"]
      })
    })
    getDocs(query(collection(this.firestore, "notifications"), where("read", "==", true))).then(list =>{
      this.NotificationReadUserID = list.docs.map(e => e.id)
    }).then(() =>{
      this.onDateSelect()
    })
  }

  ngOnInit(): void {}

  filterTable(event){
    this.dataSource.filter = (event.target as HTMLInputElement).value;
  }

  onNotificationTypeFilterChange(){
    this.dataSource.data = this.selectedNotificationType == "" ? this.notificationLogList : this.notificationLogList.filter(e => e["type"] == this.selectedNotificationType)
  }

  resetData(){
    this.selectedNotificationType = ""
    this.notificationLogList = []
    this.dataSource.data = []
  }

  async onDateSelect(){
    // var startDate = new Date(new Date(this.selectedDate).setHours(0, 0, 0, 0))
    // var endDate = new Date(new Date(this.selectedDate).setHours(23, 59, 59, 59))
    // console.log("Selected Date", this.selectedDate, startDate, endDate)
    // this.resetData()
    // var loading = this.dialog.open(LoadingProgressComponent, {
    //   data: {msg: "Fetching..."}
    // })
    // await getDocs(
    //   query(
    //     collectionGroup(this.firestore,"logs"),
    //     where("date", ">=", startDate),
    //     where("date", "<=", endDate),
    //     orderBy("date", "desc"),
    //     // limit(200)
    //   )
    // ).then(log=>{
    //   console.log(log.size)
    //   var list = []
    //   log.docs.forEach(elementDoc=>{
    //     var parentDocument = elementDoc.ref.parent.parent.path
    //     // console.log(parentDocument)
    //     var data = elementDoc.data()
    //     if(!this.notificationTypes.includes(data["type"])){
    //       this.notificationTypes.push(data["type"])
    //     }
    //     data["userid"] = doc(this.firestore,parentDocument).id
    //     data["read"] = (data["read"] == true) || this.NotificationReadUserID.includes(data["userid"])
    //     if(data["message"] == null || data["message"] == undefined){
    //       if(data["type"] == "like"){
    //         data["message"] = `${data["count"]} People liked your Breakthrough ${data["postmessage"]}`
    //       }
    //       else if(data["type"] == "comment"){
    //         data["message"] = `${data["name"]} Commented your Breakthrough ${data["postmessage"]}`
    //       }
    //       else if(data["type"] == "commentlike"){
    //         data["message"] = `${data["count"]} People liked your Breakthrough ${data["comment"]}`
    //       }
    //     }
    //     list.push(data)
    //   })
    //   this.notificationLogList = Array.from(list)
    //   this.dataSource.data = Array.from(list)
    //   this.dataSource.sort = this.sort
    //   this.dataSource.paginator = this.paginator
    // }).catch(err =>{
    //   console.log(err)
    // })
    // loading.close()
    // Only proceed if both dates are selected
    if (!this.startDate || !this.endDate) {
      return;
    }

    var startDateRange = new Date(new Date(this.startDate).setHours(0, 0, 0, 0))
    var endDateRange = new Date(new Date(this.endDate).setHours(23, 59, 59, 59))
    
    console.log("Selected Date Range", this.startDate, this.endDate, startDateRange, endDateRange)
    this.resetData()
    
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Fetching..."}
    })
    
    await getDocs(
      query(
        collectionGroup(this.firestore,"logs"),
        where("date", ">=", startDateRange),
        where("date", "<=", endDateRange),
        orderBy("date", "desc"),
        // limit(200)
      )
    ).then(log=>{
      console.log(log.size)
      var list = []
      log.docs.forEach(elementDoc=>{
        var parentDocument = elementDoc.ref.parent.parent.path
        // console.log(parentDocument)
        var data = elementDoc.data()
        if(!this.notificationTypes.includes(data["type"])){
          this.notificationTypes.push(data["type"])
        }
        data["userid"] = doc(this.firestore,parentDocument).id
        data["read"] = (data["read"] == true) || this.NotificationReadUserID.includes(data["userid"])
        if(data["message"] == null || data["message"] == undefined){
          if(data["type"] == "like"){
            data["message"] = `${data["count"]} People liked your Breakthrough ${data["postmessage"]}`
          }
          else if(data["type"] == "comment"){
            data["message"] = `${data["name"]} Commented your Breakthrough ${data["postmessage"]}`
          }
          else if(data["type"] == "commentlike"){
            data["message"] = `${data["count"]} People liked your Breakthrough ${data["comment"]}`
          }
        }
        list.push(data)
      })
      this.notificationLogList = Array.from(list)
      this.dataSource.data = Array.from(list)
      this.dataSource.sort = this.sort
      this.dataSource.paginator = this.paginator
    }).catch(err =>{
      console.log(err)
    })
    loading.close()
  }

  exportCSV(){
    // If datasource is MatTableDataSource
    const data = this.dataSource.filteredData ?? this.dataSource.data;

    // Convert JSON -> Sheet
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);

    // Create workbook
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'sheet1');
    const dateRange = `${this.startDate?.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-')}_to_${this.endDate?.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-')}`;
    XLSX.writeFile(wb, `notificationLog_${dateRange}.csv`);

    // Export
    // XLSX.writeFile(wb, `notificationLog_${this.selectedDate.toDateString()}.csv`);
    
    // const ws:XLSX.WorkSheet = XLSX.utils.table_to_sheet(this.table.nativeElement)
    // const wb:XLSX.WorkBook = XLSX.utils.book_new();
    // XLSX.utils.book_append_sheet(wb,ws,'sheet1');
    // XLSX.writeFile(wb,'participant.csv')
  }
}
