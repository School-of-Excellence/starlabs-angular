import { SelectionModel } from '@angular/cdk/collections';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { AddOfftimeComponent } from '../add-offtime/add-offtime.component';
import { collection, collectionData, doc, Firestore, query, where, writeBatch } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-offtime-list',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  templateUrl: './offtime-list.component.html',
  styleUrl: './offtime-list.component.css'
})
export class OfftimeListComponent implements OnDestroy {
  @ViewChild(MatPaginator) paginator: MatPaginator
  @ViewChild(MatSort) sort: MatSort

  roleData = {}
  loggedinPID:string
  loading:boolean = true

  offtimeHeader = ["name", "date", "time", "status", "action"]
  offtimeSource:MatTableDataSource<any> = new MatTableDataSource()
  subscription = new Subject<void>()
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

  constructor(public guard: AuthguardService, public firestore: Firestore, public dialog: MatDialog, public http: HttpClient) {
    guard.getRoles().then(async roleData=>{
      this.roleData = roleData
      this.loggedinPID = roleData["profile_ref"].id
      this.fetchData()
    })
  }

  ngOnDestroy(): void {
    this.subscription?.complete()
  }

  fetchData(){
    var collectionRef = collection(this.firestore, "offtime")
    var queryFilter = query(collectionRef, where("profileid", "==", this.loggedinPID), where("date", ">=", new Date()))
    collectionData(queryFilter).pipe(
      takeUntil(this.subscription)
    ).subscribe(offtime=>{
      var data = []
      for (let i = 0; i < offtime.length; i++) {
        const value = offtime[i];
        value["name"] = this.roleData["name"]
        value["date"] = value["date"].toDate()
        value["starttime"] = value["starttime"].toDate()
        value["endtime"] = value["endtime"].toDate()
        data.push(value)
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

  addOfftime(){
    this.dialog.open(AddOfftimeComponent, {
      autoFocus: false,
      maxHeight: "90vh",
      disableClose: true
    })
  }

  deleteSelectedOff(){
    if(confirm("Sure, Do you want to delete the selected Offtime?")){
      var selected = this.selection.selected
      console.log(selected)
      var batch = writeBatch(this.firestore)
      for (let i = 0; i < selected.length; i++) {
        const data = selected[i];
        batch.delete(doc(this.firestore, "offtime/"+data["docid"]))
        if(data["status"] == "approved"){
          this.guard.generateSpecialistSlot(data["profileid"])
        }
        // this.firestore.collection("offtime").doc(data["docid"]).delete().then(()=>{
        //   if(data["status"] == "approved"){
        //     this.guard.generateSpecialistSlot(data["profileid"])
        //   }
        // })
      }
      batch.commit()
      this.selection.clear()
    }
  }
}
