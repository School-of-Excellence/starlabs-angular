import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, ViewChild } from '@angular/core';
import { collection, collectionData, Firestore, query, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router, RouterModule } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { Subject, takeUntil } from 'rxjs';
import { TeamDeliveryHoursUpdateComponent } from '../team-delivery-hours-update/team-delivery-hours-update.component';
import { AddOfftimeComponent } from '../../Offtime/add-offtime/add-offtime.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-team-delivery-hours',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    RouterModule
  ],
  templateUrl: './team-delivery-hours.component.html',
  styleUrl: './team-delivery-hours.component.css'
})
export class TeamDeliveryHoursComponent implements OnDestroy{
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  displayedColumns = ["name", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  dataSource = new MatTableDataSource();
  subscription = new Subject<void>();

  loggedinPID;
  mapProfile = {}

  loading:boolean = true
  superRole:boolean = false

  constructor(public router: Router, public guard : AuthguardService, private dialog : MatDialog, private firestore : Firestore, public datepipe : DatePipe) {
    guard.getRoles().then(async roleData=>{
      await this.mapdata()
      this.loggedinPID = roleData["profile_ref"].id
      this.superRole = roleData["admin"] || roleData["scheduler"] || roleData["ah"] || roleData["capacityplanner"] || roleData["integrator"]
      // if(this.superRole || (roleData["eis"] || roleData["changeagent"])){ // roleData['selfavailability']
        this.fetchData()
      // }
      // else{
      //   alert("Unauthoried Access")
      //   this.router.navigateByUrl('/')
      // }
      this.loading = false
    })
  }

  ngOnDestroy(): void {
    this.subscription?.complete()
  }

  async mapdata(){
    await this.guard.getProfileMap().then(data => this.mapProfile = data.map)
  }

  async fetchData(){
    var collectionRef = collection(this.firestore, "deliverytime")
    var queryRef = null
    if(!this.superRole){
      queryRef = query(collectionRef, where("profileid", "==", this.loggedinPID))
    }
    collectionData(queryRef ?? collectionRef).pipe(
      takeUntil(this.subscription)
    ).subscribe(document =>{
      console.log(document.length)
        var source = []
        for (let i = 0; i < document.length; i++) {
          const data = document[i];
          data["name"] = this.mapProfile[data["profileid"]]
          source.push(data)
        }
        this.dataSource.data = source
        this.dataSource.sort = this.sort
        this.dataSource.paginator = this.paginator
    })
  }

  openMonthlyAvailability(element){
    console.log(element?.profileid)
    this.dialog.open(TeamDeliveryHoursUpdateComponent,{
      disableClose : true,
      minWidth: "500px",
      maxHeight: "90vh",
      data: element?.profileid
    })
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  addOfftime(){
    this.dialog.open(AddOfftimeComponent, {
      autoFocus: false,
      maxHeight: "90vh",
      disableClose: true
    })
  }
}
