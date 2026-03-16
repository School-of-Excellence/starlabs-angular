import { Component, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDoc, orderBy, query, setDoc } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AuthguardService } from '../authguard.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { where } from 'firebase/firestore';

@Component({
  selector: 'app-participant-touchpoint',
  imports: [
    CommonModule,
    MatInputModule,
    FormsModule,
    MatFormFieldModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule
  ],
  templateUrl: './participant-touchpoint.component.html',
  styleUrl: './participant-touchpoint.component.css'
})
export class ParticipantTouchpointComponent {

  mapProfile = {}

  startDate = new Date()
  endDate = new Date()

  touchPointList = []
  filterTouchPoint = []
  timedelayTouchPoint = []
  participantTouchPoint = []
  timeDelayAvg
  displayedColumns = ["profileid", "touchpoint", "label", "touchpointdate", "notes"];
  dataSource:MatTableDataSource<any> = new MatTableDataSource();
  subscription = new Subject<void>

  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;


  constructor(private afs : Firestore, public guard: AuthguardService) {
    this.startDate.setDate(this.startDate.getDate() - 7)
    this.startDate.setHours(0, 0, 0)
    this.endDate.setHours(23, 59, 59)
  }

  ngOnInit(): void {
    this.guard.getProfileMap().then(data => this.mapProfile = data.map)
    getDoc(doc(this.afs, "/classify/touchpoint")).then(point =>{
      if(point.exists()){
        var data = point.data()
        this.touchPointList = Array.from(new Set(data["touchpointlist"]))
        this.filterTouchPoint = Array.from(new Set(this.touchPointList))
        this.timedelayTouchPoint = Array.from(new Set(data["timedelaytouchpoint"] ?? data["touchpointlist"]))
      }
    }).then(() =>{
      this.fetchData()
    })
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  async fetchData(){
   if(this.startDate && this.endDate){
    console.log(this.startDate,  this.endDate)
     this.ngOnDestroy()
      this.subscription = new Subject()
      const touchpointColleciton = collection(this.afs, 'participant touchpoint')
      collectionData(query(touchpointColleciton, where("touchpointdate", ">=", this.startDate), where("touchpointdate", "<=", this.endDate), orderBy('touchpointdate', 'asc'))).pipe(
        takeUntil(this.subscription)
      ).subscribe(snapshot =>{
        this.participantTouchPoint = snapshot
        this.calculateTimeDelay()
      });
   }
  }

  ngOnDestroy(){
    this.subscription?.complete()
  }

  calculateTimeDelay(){
    this.dataSource.data = this.participantTouchPoint.filter(e => this.filterTouchPoint.includes(e["touchpoint"]))
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.updateTimeDelayTouchPoint(null)
  }

  updateTimeDelayTouchPoint(touchpoint){
    if(touchpoint != null){
      console.log()
      if(this.timedelayTouchPoint.includes(touchpoint)){
        this.timedelayTouchPoint.splice(this.timedelayTouchPoint.indexOf(touchpoint), 1)
      }
      else{
        this.timedelayTouchPoint.push(touchpoint)
      }
    }

    // Calculate Time Delay
    var timeline = this.dataSource.data.filter(e => this.timedelayTouchPoint.includes(e["touchpoint"])).map(e => e["touchpointdate"].toDate()).sort((a, b) => a - b)
    console.log("Date Timeline", timeline)

    let totalDiff = 0;
    for (let i = 1; i < timeline.length; i++) {
      totalDiff += (timeline[i] - timeline[i - 1]);
    }

    // Average in ms
    const avgMs = totalDiff / (timeline.length - 1);

    // Convert to readable format
    const avgSec = avgMs / 1000;
    const days = Math.floor(avgSec / 86400);
    const hours = Math.floor((avgSec % 86400) / 3600);
    const minutes = Math.floor((avgSec % 3600) / 60);
    const seconds = Math.floor(avgSec % 60);

    this.timeDelayAvg = `${days}d ${hours}h ${minutes}m ${seconds}s`
    
    console.log("Average delay in days:", this.timeDelayAvg);
  }
}
