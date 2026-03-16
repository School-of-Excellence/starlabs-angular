import { Component, ViewChild } from '@angular/core';
import { collectionData, Firestore, query,orderBy,doc, collection } from '@angular/fire/firestore';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { UpdateEventDetailComponent } from './update-event-detail/update-event-detail.component';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu'; 
import { CommonModule } from '@angular/common';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-event-list',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatMenuModule,
    CommonModule,
    ClipboardModule
  ],
  templateUrl: './event-list.component.html',
  styleUrl: './event-list.component.css'
})
export class EventListComponent {
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild(MatPaginator) paginator:MatPaginator

  eventHeader = ["id", "name", "venue", "startdate", "enddate","notifyparticipants","addtocalendar", "action"];
  eventDataSource = new MatTableDataSource();

  roles:any = {}

  loading = true

  private destroy$ = new Subject<void>()

  currentDate = new Date()

  constructor(
    private firestore : Firestore, 
    public router : Router, 
    private dialog : MatDialog,
    public clipboard: Clipboard,
  ){
    this.getEventList()
  }

  async ngOnInit(){}

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  getEventList(){
    const collRef = collection(this.firestore,"event collection")
    const q = query(collRef,orderBy("start_date", "desc"))
    collectionData(q,{idField:"docid"}).pipe(takeUntil(this.destroy$)).subscribe(events=>{
      var eventdata = []
      events.forEach(data=>{
        eventdata.push({
          id : data['event_id'],
          name : data['name'],
          venue : data['venue'],
          startdate : data['start_date'].toDate(),
          enddate : data['end_date'].toDate(),
          docid : data.docid,
          notifyparticipants:data['notifyparticipants'] ?? false,
          addtocalendar:data['addtocalendar'] ?? false
        })
      })
      this.eventDataSource.data = eventdata
      this.eventDataSource.sort = this.sort
      this.loading = false
    })
  }

  openEventEditor(eventId?){
    this.dialog.open(UpdateEventDetailComponent,{
      disableClose:true,
      data:{
        edit:[null,undefined,''].includes(eventId) ? false : true,
        eventDocId : [null,undefined,''].includes(eventId) ? doc(collection(this.firestore,"event collection")).id : eventId,
      },
      panelClass: 'custom-dialog-container',
      maxHeight: "90vh",
      maxWidth: "90vw"
    });
  }

  onViewEventParticipants(eventId:string){
    const url = this.router.createUrlTree(["/event_participation_approve"],{queryParams:{eventid:eventId}})
    window.open(url.toString(),"_blank")
  }

  copyToClipboard(eventid){
    var url = `https://breakthroughs.app/calendar/event/${eventid}`
    this.clipboard.copy(url)
  }
}
