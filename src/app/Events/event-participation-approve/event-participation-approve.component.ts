import { SelectionModel } from '@angular/cdk/collections';
import { Component, ElementRef, viewChild, ViewChild } from '@angular/core';
import { collection,collectionData,Firestore,query,doc,where,writeBatch,QuerySnapshot,getDocs, orderBy, arrayUnion, Timestamp} from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import * as XLSX from 'xlsx';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-event-participation-approve',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatCheckboxModule,
    MatTabsModule,
    MatFormFieldModule,
    FormsModule,
    CommonModule,
    MatSelectModule,
    MatButtonModule,
    MatInputModule,
    ProfilePictureComponent
  ],
  templateUrl: './event-participation-approve.component.html',
  styleUrl: './event-participation-approve.component.css'
})
export class EventParticipationApproveComponent {
  @ViewChild('table')table:ElementRef

  eventList = []
  selectedEventType:any = null
  requestedEventList = []
  private eventSubscription = new Subject<void>();
  private requestSubscription = new Subject<void>();

  mapProfileName = {}
  mapProduct = {}
  // requested
  requested = []
  displayedColumns: string[] = ['sno', 'clientname', 'product', 'action'];
  dataSource = new MatTableDataSource()
  @ViewChild('paginator') paginator!: MatPaginator;
  @ViewChild('sort') sort!: MatSort;

  // Approved
  approved = []
  displayedColumns1: string[] = ['sno', 'clientname', 'product', 'action'];
  dataSource1 = new MatTableDataSource()
  @ViewChild("paginator1")paginator1:MatPaginator
  @ViewChild("sort1")sort1:MatSort

  // Mark Attendance
  attendance = []
  displayedColumns2: string[] = ['sno', 'clientname', 'product', 'status', 'action'];
  dataSource2 = new MatTableDataSource()
  @ViewChild('paginator2') paginator2!: MatPaginator;
  @ViewChild('sort2') sort2!: MatSort;

  // Attended
  attended = []
  displayedColumns3: string[] = ['sno', 'clientname', 'product', 'status', 'action'];
  dataSource3 = new MatTableDataSource()
  @ViewChild('paginator3') paginator3!: MatPaginator;
  @ViewChild('sort3') sort3!: MatSort;

  // Revoke (read-only — no row actions)
  revoked = []
  displayedColumns4: string[] = ['sno', 'clientname', 'product', 'status'];
  dataSource4 = new MatTableDataSource()
  @ViewChild('paginator4') paginator4!: MatPaginator;
  @ViewChild('sort4') sort4!: MatSort;

  // requestedQueue = []
  // attendenceQueue = []
  loggedInProfileid = null
  requestselection = new SelectionModel(true,[]);
  attendanceselection = new SelectionModel(true,[]);

  isAllSelectedrequest() {
    const numSelected = this.requestselection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterTogglerequest() {
    this.isAllSelectedrequest() ?
    this.requestselection.clear() :
    this.dataSource.data.forEach(row => this.requestselection.select(row));
  }

  isAllSelectedattendance() {
    const numSelected = this.attendanceselection.selected.length;
    const numRows = this.dataSource2.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggleattendance() {
    this.isAllSelectedattendance() ?
    this.attendanceselection.clear() :
    this.dataSource2.data.forEach(row => this.attendanceselection.select(row));
  }

  constructor(
    private firestore : Firestore,
    private authguard : AuthguardService,
    public matdailog: MatDialog,
    private route : ActivatedRoute,
    private router : Router
  ){
    this.authguard.getRoles().then(roles =>{
      this.loggedInProfileid = roles?.["profile_ref"]?.id ?? null
    })
    let n = 0
    const collRef = collection(this.firestore,"event collection")
    const q = query(collRef,orderBy("end_date","desc"))
    collectionData(q,{idField:'docid'}).pipe(takeUntil(this.eventSubscription)).subscribe(async snap => {
      this.eventList = []
      snap.forEach( e => {
        let element = e
        element['eventRef'] = doc(collRef,e.docid)
        this.eventList.push(element)
      })
      console.log(this.eventList);
      await this.authguard.getProfileMap().then(e => this.mapProfileName = e.map)
      await this.authguard.getProductMap().then(e => this.mapProduct = e) 
      this.fromRoute()
    })
  }

  async ngOnInit(){}

  fromRoute(){
    this.route.queryParams.subscribe(params => {
      console.log(params['eventid'],"event id");
      if(params['eventid']){
        this.selectedEventType = this.eventList.find(e => e['docid'] === params['eventid'])
        this.onEventSelect()
      }
    })
  }

  ngAfterViewInit(){
    this.dataSource.data = this.requested
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
    
    this.dataSource1.data = this.approved
    this.dataSource1.sort = this.sort1
    this.dataSource1.paginator = this.paginator1
    
    this.dataSource2.data = this.attendance
    this.dataSource2.sort = this.sort2
    this.dataSource2.paginator = this.paginator2
    
    this.dataSource3.data = this.attended
    this.dataSource3.sort = this.sort3
    this.dataSource3.paginator = this.paginator3

    this.dataSource4.data = this.revoked
    this.dataSource4.sort = this.sort4
    this.dataSource4.paginator = this.paginator4
  }

  ngOnDestroy(){
    this.eventSubscription?.next()
    this.eventSubscription?.complete()
    this.requestSubscription?.next()
    this.requestSubscription?.complete()
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  applyFilterD1(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource1.filter = filterValue.trim().toLowerCase();
  }

  applyFilterD2(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource2.filter = filterValue.trim().toLowerCase();
  }

  applyFilterD3(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource3.filter = filterValue.trim().toLowerCase();
  }

  applyFilterD4(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource4.filter = filterValue.trim().toLowerCase();
  }

  onEventSelect(){
    // this.requestSubscription?.next()
    // this.requestSubscription?.complete()
    console.log(this.selectedEventType);
    const collRef = collection(this.firestore,"event participation request")
    console.log(this.selectedEventType['eventRef'].path);
    
    const q = query(collRef,where("eventref", "==", this.selectedEventType['eventRef']))
    collectionData(q,{idField:'docid'}).pipe(takeUntil(this.requestSubscription)).subscribe(async snap => {
      console.log("snap",snap.length);
      
      this.requestedEventList = []
      this.requested = []
      this.approved = []
      this.attendance = []
      this.attended = []
      this.revoked = []
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        element['clientname'] = this.mapProfileName[element['profileid']]
        element['product'] = this.mapProduct[element['productref']['id']]
        this.requestedEventList.push(element)
        if(element["status"] == "requested"){
          this.requested.push(element)
        }
        else if(element["status"] == "approved"){
          this.approved.push(element)
        }
        if(['approved','unattended'].includes(element["status"])){
          this.attendance.push(element)
        }
        else if(element["status"] == "attended"){
          this.attended.push(element)
        }
        else if(element["status"] == "revoked"){
          this.revoked.push(element)
        }
      }
      this.ngAfterViewInit()
    })
    this.router.navigate([],{
      queryParams:{
        eventid:this.selectedEventType['eventRef'].id
      },
      queryParamsHandling:'merge'
    })
  }

  async markAsAttended(){
    if(confirm("Sure, would you like to update the selection? The selected list will be marked as attended.")){
      var selected = this.attendanceselection.selected
      var loading = this.matdailog.open(LoadingProgressComponent, {
        data:{
          msg: "updating status...."
        },
        disableClose : true
      })
      var batch = writeBatch(this.firestore)
      var promises:Array<Promise<QuerySnapshot<any>>> = []
      for (let i = 0; i < selected.length; i+=10) {
        const subList = selected.slice(i,i+10);
        console.log(subList)
        var refList = []
        subList.forEach(element =>{
          var ref = doc(this.firestore,"event participation request",element["docid"])
          batch.update(ref, {
            status: "attended"
          })
          batch.set(doc(collection(this.firestore,"events_profiles")), {
            event_ref: element.eventref,
            profile_ref: doc(this.firestore,"profile_data",element.profileid),
            pseudo_name: null,
            token: null,
            eventrequest: ref,
          })
          refList.push(doc(this.firestore,"event participation request",element["docid"]))
        })
        if(refList.length != 0){
          const deliverablesCollRef = collection(this.firestore,"deliverables")
          const q = query(deliverablesCollRef,where("fileref", "array-contains-any", refList))
          promises.push(getDocs(q))
        }
      }

      await Promise.all(promises).then(result =>{
        for (let i = 0; i < result.length; i++) {
          const snapshot = result[i];
          console.log("Promise", i+1, "---", snapshot.size)
          for (let j = 0; j < snapshot.docs.length; j++) {
            const deliverableDoc = snapshot.docs[j];
            console.log(deliverableDoc.ref.path)
            batch.update(deliverableDoc.ref, {
              status: "completed"
            })
          }
        }
      })
      await batch.commit().then(() =>{
        console.log("Successfully Marked as Attended!")
      }).catch(err =>{
        console.log(err)
        alert("Something went wrong...")
      })
      loading.close()
      this.clearSelection()
    }
  }

  async markAsUnattendedAndCancelProduct() {
    if (confirm("The selected list will be marked as unattended, and the product will be marked as canceled. Would you like to proceed with updating the selection?")) {
      var selected = this.attendanceselection.selected
      var loading = this.matdailog.open(LoadingProgressComponent, {
        data: {
          msg: "updating status...."
        },
        disableClose: true
      })
      var batch = writeBatch(this.firestore)
      var promises: Array<Promise<QuerySnapshot<any>>> = []
      for (let i = 0; i < selected.length; i += 10) {
        const subList = selected.slice(i, i + 10);
        console.log(subList)
        var refList = []
        var eventProfileListPromises: Array<Promise<QuerySnapshot<any>>> = []
        subList.forEach(element => {
          var ref = doc(this.firestore, "event participation request", element["docid"])
          batch.update(ref, {
            status: "unattended",
            statuslog: arrayUnion({
              status: "unattended",
              updatedby: this.loggedInProfileid,
              updatedon: Timestamp.now()
            })
          })
          const events_profilesCollRef = collection(this.firestore, "events_profiles")
          const q = query(
            events_profilesCollRef,
            where("profile_ref", "==", doc(this.firestore, "profile_data", element.profileid)),
            where("event_ref", "==", element.eventref)
          )
          eventProfileListPromises.push(getDocs(q))
          refList.push(doc(this.firestore, "event participation request", element["docid"]))
        })
        if (refList.length != 0) {
          const deliverablesCollRef = collection(this.firestore, "deliverables")
          const q = query(deliverablesCollRef, where("fileref", "array-contains-any", refList))
          promises.push(getDocs(q))
        }
      }

      await Promise.all(eventProfileListPromises).then(result => {
        for (let i = 0; i < result.length; i++) {
          const snapshot = result[i];
          console.log("Promise", i + 1, "---", snapshot.size)
          for (let j = 0; j < snapshot.docs.length; j++) {
            batch.delete(snapshot.docs[j].ref)
          }
        }
      })

      await Promise.all(promises).then(result => {
        for (let i = 0; i < result.length; i++) {
          const snapshot = result[i];
          console.log("Promise", i + 1, "---", snapshot.size)
          for (let j = 0; j < snapshot.docs.length; j++) {
            const deliverableDoc = snapshot.docs[j];
            console.log(deliverableDoc.ref.path)
            var deliverableData = deliverableDoc.data()
            if (deliverableData["participantproductid"]) {
              batch.update(doc(this.firestore, "participantsproduct", deliverableData["participantproductid"]), {
                status: "cancelled"
              })
            }
            batch.update(deliverableDoc.ref, {
              status: null
            })
          }
        }
      })
      await batch.commit().then(() => {
        console.log("Successfully Marked as Unattended!")
      }).catch(err => {
        console.log(err)
        alert("Something went wrong...")
      })
      loading.close()
      this.clearSelection()
    }
  }

  async updateStatus(status, tab){
    if(confirm("Sure, do you want to update the selected?")){
      var selected = tab == "request" ? this.requestselection.selected : this.attendanceselection.selected
      var loading = this.matdailog.open(LoadingProgressComponent, {
        data:{
          msg: "updating status...."
        },
        disableClose : true
      })
      var batch = writeBatch(this.firestore)
      var promises:Array<Promise<QuerySnapshot<any>>> = []
      for (let i = 0; i < selected.length; i+=10) {
        const subList = selected.slice(i, i+10);
        console.log(subList)
        var refList = []
        subList.forEach(element =>{
          var ref = doc(this.firestore,"event participation request",element["docid"])
          batch.update(ref, {
            status: status
          })
          batch.set(doc(collection(this.firestore,"events_profiles")), {
            event_ref: element.eventref,
            profile_ref: doc(this.firestore,"profile_data",element.profileid),
            pseudo_name: null,
            token: null,
            eventrequest: ref,
          })
          refList.push(this.firestore,"event participation request",element["docid"])
        })
        if(refList.length != 0){
          const deliverablesCollRef = collection(this.firestore,"deliverables")
          const q = query(deliverablesCollRef,where("fileref", "array-contains-any", refList))
          promises.push(getDocs(q))
        }
      }

      await Promise.all(promises).then(result =>{
        for (let i = 0; i < result.length; i++) {
          const snapshot = result[i];
          console.log("Promise", i+1, "---", snapshot.size)
          for (let j = 0; j < snapshot.docs.length; j++) {
            const deliverableDoc = snapshot.docs[j];
            console.log(deliverableDoc.ref.path)
            batch.update(deliverableDoc.ref, {
              status: "completed"
            })
          }
        }
      })
      // await batch.commit().then(() =>{
      //   console.log("Attendance Marked")
      // }).catch(err =>{
      //   console.log(err)
      //   alert("Something went wrong...")
      // })
      loading.close()
      this.clearSelection()

      /*
      for (let i = 0; i < selected.length; i++) {
        const element = selected[i];
        console.log(element)
        var ref = this.firestore.collection("event participation request").doc(element["docid"]).ref
        firebase.default.firestore
        ref.update({
          status: status
        }).then(()=>{
          if(i+1 == selected.length){
            loading.close()
            this.clearSelection()
          }
          this.onEventSelect(this.selectedEventType)
          this.authguard.updateDeliveryStatus(ref.path, status == "approved" ? "ongoing" : status == "attended" ? "completed" : null)
          if(status == "attended"){
            this.firestore.collection("events_profiles").add({
              event_ref: element.eventref,
              profile_ref: this.firestore.collection("profile_data").doc(element.profileid).ref,
              pseudo_name: null,
              token: null,
              eventrequest: ref,
            })
          }
        })

      }
      */
    }
  }
  
  onApprove(row, status){
    console.log(row, status);
    /*
    // if(confirm("Are you sure want to update!")){
      var ref = this.firestore.collection("event participation request").doc(row["docid"]).ref
      ref.update({
        status: status
      }).then(()=>{
        this.onEventSelect(this.selectedEventType)
        this.authguard.updateDeliveryStatus(ref.path, status == "approved" ? "ongoing" : status == "attended" ? "completed" : null)
        if(status == "attended"){
          this.firestore.collection("events_profiles").add({
            event_ref: row.eventref,
            profile_ref: this.firestore.collection("profile_data").doc(row.profileid).ref,
            pseudo_name: null,
            token: null,
            eventrequest: ref,
          })
        }
      })
    // }
    */
  }

  clearSelection(){
    this.requestselection.clear()
    this.attendanceselection.clear()
  }
  exportCSV(){
    const ws:XLSX.WorkSheet = XLSX.utils.table_to_sheet(this.table.nativeElement)
    const wb:XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'sheet1');
    //  save to file
    XLSX.writeFile(wb,'Attended.csv')
  }
  compareFn(a:any,b:any){
    return a && b ? a.eventRef.id === b.eventRef.id : false
  }
}
