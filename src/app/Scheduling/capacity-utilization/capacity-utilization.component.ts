import { CommonModule, DatePipe } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { AuthguardService } from '../../authguard.service';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';

export interface UtilityData{
  name: string,
  profileid: string,
  totalhours: number,
  consumedhours: number,
  utility: number,
}

export interface Availability{
  totalGivenHours: number,
  totalConsumedHours: number,
  starttime: Date,
  endtime: Date,
}

@Component({
  selector: 'app-capacity-utilization',
  imports: [
    MatProgressBarModule,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatDatepickerModule
  ],
  templateUrl: './capacity-utilization.component.html',
  styleUrl: './capacity-utilization.component.css'
})

export class CapacityUtilizationComponent {
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild('TABLE') table:ElementRef;
  loading:boolean = true
  startDate
  endDate
  utilityHeading = ["name", "totalhours", "consumedhours", "utility"]
  utilitySource = new MatTableDataSource()
  mapProfile = {}

  constructor(public firestore: Firestore, public guard: AuthguardService, public router: Router, public pipe: DatePipe) {
    // guard.getRoles().then(async roleData=>{
      // if(roleData["ah"] || roleData["admin"] || roleData["capacityplanner"]){
        var today = new Date()
        var nextsevent = new Date(new Date().setDate(today.getDate() + 7))
        this.startDate = pipe.transform(today, "yyyy-MM-dd")
        this.endDate = pipe.transform(nextsevent, "yyyy-MM-dd")
        this.showUtility()
      // }
      // else{
      //   alert("Unauthorized Access")
      //   this.router.navigateByUrl('/')
      // }
    // })
  }

  ngOnInit(): void {
  }

  async showUtility(){
    var profileID:Array<string> = []
    var availability:{[key: string]: Array<Availability>} = {}
    var utilityData:Array<UtilityData> = []

    var start = new Date(this.startDate)
    start.setHours(0,0,0,0)
    var end = new Date(this.endDate)
    end.setHours(23, 59, 59, 59)
    console.log(start, " - ", end)

    var collectionRef = collection(this.firestore, "availability")
    var queryFilter = query(collectionRef, where("starttime", ">=", start),where("starttime", "<=", end))
    await getDocs(queryFilter).then(availabilities=>{
      for (let i = 0; i < availabilities.docs.length; i++) {
        const doc = availabilities.docs[i].data();
        var availableProfileid = doc["profileref"]["id"]
        var starttime = doc["starttime"].toDate()
        var endtime = doc["endtime"].toDate()
        var totalHours = ((endtime.getHours()*60 + endtime.getMinutes()) - (starttime.getHours()*60 + starttime.getMinutes())) / 60
        var usedHours = 0
        for (let j = 0; j < doc["appointments"].length; j++) {
          const appointment = doc["appointments"][j]["id"] ?? [];
          for (let k = 0; k < (doc[appointment] ?? []).length; k++) {
            const slot = doc[appointment][k];
            if(slot["booked"]){
              var slotstart = slot["slotstart"].toDate()
              var slotend = slot["slotend"].toDate()
              usedHours = usedHours + (((slotend.getHours()*60 + slotend.getMinutes()) - (slotstart.getHours()*60 + slotstart.getMinutes())) / 60)
            }
          }
        }
        if(!profileID.includes(availableProfileid)) {
          profileID.push(availableProfileid)
        }        
        availability[availableProfileid] = availability[availableProfileid] || []
        availability[availableProfileid].push({
          starttime: starttime,
          endtime: endtime,
          totalGivenHours: totalHours,
          totalConsumedHours: usedHours,
        })
      }
    })
    console.log(availability)

    var promises:Array<Promise<any>>= []
    for (let i = 0; i < profileID.length; i+=30) {
      const profileSublist = profileID.slice(i, i+30);
      var profileCollection = collection(this.firestore, "profile_data")
      var profileQuery = query(profileCollection, where("profileid", "in", profileSublist))
      promises.push(getDocs(profileQuery))
    }

    await Promise.all(promises).then(result =>{
      for (let i = 0; i < result.length; i++) {
        const docs = result[i].docs;
        for (let j = 0; j < docs.length; j++) {
          var data = docs[j].data()
          this.mapProfile[docs[j].id] = data["name"]
        }
      }
    })

    for (let profileid in availability) {
      var profileAvailability = availability[profileid]
      var given = 0
      var consumed = 0
      var utility = 0
      for (let a = 0; a < profileAvailability.length; a++) {
        const old = profileAvailability[a];
        given = given + old.totalGivenHours
        consumed = consumed + old.totalConsumedHours
      }
      utility = Math.floor((consumed/given) * 100)
      utilityData.push({
        name : this.mapProfile[profileid],
        profileid : profileid,
        totalhours : given,
        consumedhours : consumed,
        utility : isNaN(utility) ? 0 : utility,
      })
    }

    this.utilitySource.data = utilityData
    this.utilitySource.sort = this.sort
    this.utilitySource.paginator = this.paginator
    this.loading = false
  }

  filterTable(value){
    this.utilitySource.filter = value
  }

  exportCSV(){
    const ws:XLSX.WorkSheet = XLSX.utils.table_to_sheet(this.table.nativeElement)
    const wb:XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'sheet1');
    //  save to file
    XLSX.writeFile(wb, 'Utility.csv')
  }

}