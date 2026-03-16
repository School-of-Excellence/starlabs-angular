import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { Firestore, collection, orderBy, query,collectionData} from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
// import { UpdateDeliveryComponent } from 'src/app/DialogBox/update-delivery/update-delivery.component';
import { Router} from '@angular/router';
import { map, Subject, takeUntil } from 'rxjs';
import { UpdateDeliveryComponent } from './update-delivery/update-delivery.component';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';


@Component({
  selector: 'app-delivery-set',
  imports: [
    CommonModule,
    MatTableModule,
    MatFormFieldModule,
    MatIconModule,
    MatPaginatorModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './delivery-set.component.html',
  styleUrl: './delivery-set.component.css'
})
export class DeliverySetComponent {
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  deliveryColumns = ["deliveryname", "type", "action"]
  deliverySource = new MatTableDataSource();

  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)

  constructor(public dialog: MatDialog,private router:Router) {
    let apptList = []
    let eventList = []
    let formList = []
    let reportList = []
    let queueList = []
    let fieldworkList = []
    // Appointment
    const appointmentTypeCollection = collection(this.firestore,"appointmenttype")
    const apptQ = query(appointmentTypeCollection,orderBy('appointmenttype'))
    collectionData(apptQ,{idField:'docid'}).pipe(takeUntil(this.destroy$)).subscribe(appt=>{
      apptList = appt.map((apptData:any) => ({
        type: "Appointment",
        deliveryname: apptData["appointmenttype"],
        duration: apptData["duration"],
        ischangeworkrequired: apptData["ischangeworkrequired"] ?? false,
        groupappointment: apptData["groupappointment"] ?? false,
        maxbooking: apptData["maxbooking"],
        docid:apptData.docid
      }))
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliverySource.data = list
      this.deliverySource.sort = this.sort
      this.deliverySource.paginator = this.paginator
    })
    // Form
    const formTypeCollection = collection(this.firestore,"delivery forms")
    const formQ = query(formTypeCollection,orderBy("formname"))
    collectionData(formQ,{idField:"docid"}).pipe(takeUntil(this.destroy$)).subscribe(form => {
      formList = form.map((formDoc) => ({
        type: "Form",
        deliveryname: formDoc["formname"],
        docid: formDoc.docid,
        delete: formDoc['delete']
      }))
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliverySource.data = list
      this.deliverySource.sort = this.sort
      this.deliverySource.paginator = this.paginator
    })
    // Report
    const reportTypeCollection = collection(this.firestore,"delivery report")
    const reportQ = query(reportTypeCollection,orderBy("reportname"))
    collectionData(reportQ,{idField:'docid'}).pipe(takeUntil(this.destroy$)).subscribe((report) => {
      reportList = report.map((reportDoc:any) => ({
        type: "Report",
        deliveryname: reportDoc["reportname"],
        docid: reportDoc.docid
      }))
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliverySource.data = list
      this.deliverySource.sort = this.sort
      this.deliverySource.paginator = this.paginator
    })
    // Event
    const eventTypeCollection = collection(this.firestore,"delivery events")
    const eventQ = query(eventTypeCollection,orderBy("eventname"))
    collectionData(eventQ,{idField:"docid"}).pipe(takeUntil(this.destroy$)).subscribe(event => {
      eventList = event.map((eventDoc) => ({
        type: "Events",
        deliveryname: eventDoc["eventname"],
        events:  eventDoc["events"] != null ? eventDoc["events"].map((e) => e.path) : [],
        docid: eventDoc.docid
      }))
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliverySource.data = list
      this.deliverySource.sort = this.sort
      this.deliverySource.paginator = this.paginator
    })
    // Queue
    const queueTypeCollection = collection(this.firestore,"delivery queue")
    const queueQ = query(queueTypeCollection,orderBy("queuename"))
    collectionData(queueQ,{idField:"docid"}).pipe(takeUntil(this.destroy$)).subscribe(queue => {
      var data = []
      for (let i = 0; i < queue.length; i++) {
        const queueDoc = queue[i];
        let queuePathList = []
        if(queueDoc["queuelist"] != null || queueDoc["queuelist"] != undefined){
          for (let i = 0; i < queueDoc["queuelist"].length; i++) {
            const element = queueDoc["queuelist"][i];
            queuePathList.push(element.path)
          }
        }
        data.push({
          type: "Queue",
          deliveryname: queueDoc["queuename"],
          queue: queueDoc["queue"] != null ? queueDoc["queue"].path : null,
          queuelist:queuePathList,
          docid: queueDoc.docid
        })
      }
      queueList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliverySource.data = list
      this.deliverySource.sort = this.sort
      this.deliverySource.paginator = this.paginator
    })
    // Field Work
    const fieldworkTypeCollection = collection(this.firestore,'delivery fieldwork')
    const fieldworkQ = query(fieldworkTypeCollection,orderBy("fieldworkname"))
    collectionData(fieldworkQ,{idField:"docid"}).pipe(takeUntil(this.destroy$)).subscribe(fieldwork => {
      var data = []
      for (let i = 0; i < fieldwork.length; i++) {
        const workDoc = fieldwork[i];
        data.push({
          type: "Fieldwork",
          deliveryname: workDoc["fieldworkname"],
          docid: workDoc.docid
        })
      }
      fieldworkList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliverySource.data = list
      this.deliverySource.sort = this.sort
      this.deliverySource.paginator = this.paginator
    })
  }

  ngOnInit(): void {}

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  applyFilter(event){
    this.deliverySource.filter = (event.target as HTMLInputElement).value
  }

  addDelivery(){
    this.dialog.open(UpdateDeliveryComponent, {
      data: null,
      disableClose: true,
      maxWidth: '100%',
      maxHeight: '100%',
      height: '90%',
      width: '90%',
      panelClass: 'full-screen-modal',
    })
  }

  editDelivery(data){
    this.dialog.open(UpdateDeliveryComponent, {
      data: data,
      disableClose: true,
      maxWidth: '100%',
      maxHeight: '100%',
      height: '90%',
      width: '90%',
      panelClass: 'full-screen-modal',
    })
  }

  formpreview(obj){
    console.log(obj);
    if(obj.type === 'Form'){
      // this.router.navigateByUrl(`/formpreview?id=${obj.docid}&type=${obj.type.toLocaleLowerCase()}`)
      // this.router.navigateByUrl(`/formtemplate?id=${obj.docid}&type=${obj.type.toLocaleLowerCase()}`)
      const url = this.router.createUrlTree(['/formtemplate'],{queryParams:{id:obj.docid,type:obj.type.toLocaleLowerCase()}})
      window.open(url.toString(), '_blank')
    }else if(obj.type === 'Report'){
      // this.router.navigateByUrl(`/report_preview?id=${obj.docid}&type=${obj.type.toLocaleLowerCase()}`)
    }else{
      alert ("routing path doesn't match")
    }
  }

  viewQueue(){
    this.router.navigateByUrl("/queue list")
  }
}
