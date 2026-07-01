import { SelectionModel } from '@angular/cdk/collections';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDocs, query, Query, updateDoc, where } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-approve-offtime',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatCheckboxModule,
    MatButtonModule,
    ProfilePictureComponent
  ],
  templateUrl: './approve-offtime.component.html',
  styleUrl: './approve-offtime.component.css'
})
export class ApproveOfftimeComponent implements OnDestroy {
  @ViewChild(MatPaginator) paginator: MatPaginator
  @ViewChild(MatSort) sort: MatSort

  loggedinPID:string
  loading:boolean = true
  mapProfile = {}

  offtimeHeader = ["profileid", "date", "time", "status", "action"]
  offtimeSource:MatTableDataSource<any> = new MatTableDataSource()
  subscription = new Subject<void>();
  selection = new SelectionModel(true,[]);

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.offtimeSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    this.isAllSelected() ? this.selection.clear() : this.offtimeSource.data.forEach(row => this.selection.select(row));
  }

  constructor(public guard: AuthguardService, public firestore: Firestore, public router: Router, public http: HttpClient) {
    guard.getRoles().then(async roleData=>{
      this.loggedinPID = roleData["profile_ref"].id
      // var admin = roleData["admin"] ?? false
      // var scheduler = roleData["scheduler"] ?? false
      // var ah = roleData["ah"] ?? false
      // var capacityplanner = roleData["capacityplanner"] ?? false
      // var integrator = roleData["integrator"] ?? false
      // var superRole = admin || ah || scheduler || capacityplanner || integrator
      // if(superRole){
        this.fetchData()
      // }
      // else{
      //   alert("Unauthorized Access")
      //   router.navigateByUrl("/")
      // }
    })
  }

  ngOnDestroy(): void {
    this.subscription?.complete();
  }

  fetchData(){
    var profileID = []
    var collectionRef = collection(this.firestore, "offtime")
    var queryFilter = query(collectionRef, where("date", ">=", new Date()))
    collectionData(queryFilter).pipe(
      takeUntil(this.subscription)
    ).subscribe(offtime=>{
      var data = []
      for (let i = 0; i < offtime.length; i++) {
        const value = offtime[i];
        profileID.push(value["profileid"])
        value["date"] = value["date"].toDate()
        value["starttime"] = value["starttime"].toDate()
        value["endtime"] = value["endtime"].toDate()
        data.push(value)
      }

      var profileToMap = profileID.filter(e => this.mapProfile[e] == null || this.mapProfile[e] == undefined)
      for (let a = 0; a < profileToMap.length; a+=30) {
        const profileList = profileToMap.slice(a, a+30);
        getDocs(query(collection(this.firestore, "profile_data"), where("profileid", "in", profileList))).then(list =>{
          for (let b = 0; b < list.docs.length; b++) {
            const profileDoc = list.docs[b];
            var profileData = profileDoc.data()
            this.mapProfile[profileDoc.id] = profileData["name"]
          }
        }).catch(err =>{
          console.log(err)
        })
      }

      this.offtimeSource.data = data
      this.offtimeSource.sort = this.sort
      this.offtimeSource.paginator = this.paginator
      this.loading = false
    })
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.offtimeSource.filter = filterValue.trim().toLowerCase();
  }

  selectedOfftimeAction(action:string){
    if(confirm("Sure, Do you want to " + action + " the selected offtime?")){
      var selected = this.selection.selected
      if(action == "approve" || action == "deny"){
        var noStatus = selected.filter(e => e["status"] == null)
        for (let i = 0; i < noStatus.length; i++) {
          const element = noStatus[i];
          this.offtimeAction(action == "approve", element["docid"])
        }
      }
      else if(action == "revoke"){
        var status = selected.filter(e => e["status"] != null)
        var revokeProfileid = []
        for (let i = 0; i < status.length; i++) {
          const element = status[i];
          this.revokeOfftime(element["status"], element["docid"])
          if(element["status"] == "approved"){
            revokeProfileid.push(element["profileid"])
          }
        }
        revokeProfileid = Array.from(new Set(revokeProfileid))
        for (let i = 0; i < revokeProfileid.length; i++) {
          const profileid = revokeProfileid[i];
          this.guard.generateSpecialistSlot(profileid) 
        }
      }
      this.selection.clear()
    }
  }

  offtimeAction(value:boolean, docid:string){
    // if(confirm((value ? "Approve" : "Deny") + " Offtime")){
      updateDoc(doc(this.firestore, "offtime/"+docid), {
        status: value ? "approved" : "denied",
        authorizedby: this.loggedinPID
      }).then(()=>{
        if(value){
          // Delete Availability & Cancel Appt
          try{
            var url:string
            if(environment.firebase.projectId == "test-environment-841c3"){
              console.log("test")
              url = "https://us-central1-test-environment-841c3.cloudfunctions.net/approveOfftime?offid=" + docid
            }
            if(environment.firebase.projectId == "starlabs-test"){
              console.log("test 19")
              url = "https://us-central1-starlabs-test.cloudfunctions.net/approveOfftime?offid=" + docid
            }
            else if(environment.firebase.projectId == "fir-sample-aae4a" || environment.firebase.projectId == "launch-your-legacy-development"){
              console.log("Production")
              url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/approveOfftime?offid=" + docid
            }
            this.http.get(url).toPromise().then(res=>{
              console.log(res)
            }).catch(err=>{
              console.log(err)
            })
          }catch(err){
            console.log(err);
          }
        }
      })
    // }
  }

  revokeOfftime(currentstatus:string, docid:string){
    // if(confirm("Revoke Offtime?")){
      updateDoc(doc(this.firestore, "offtime/"+docid), {
        status: null
      })
    // }
  }
}