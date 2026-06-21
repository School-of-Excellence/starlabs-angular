import { Component, OnInit, ViewChild } from '@angular/core';
import { getFirestore, collection,getDocs ,collectionData,query,where, orderBy} from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subscription } from 'rxjs';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { MatChipInputEvent } from '@angular/material/chips';
import { MatChipsModule } from '@angular/material/chips';
import { MatChipInput } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ExcludeFilterArrayPipe } from '../exclude-filter-array.pipe';
import {COMMA, ENTER} from '@angular/cdk/keycodes';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatChipGrid } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarHorizontalPosition,MatSnackBarVerticalPosition} from '@angular/material/snack-bar';
import { MatFormField } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ProfilePictureComponent } from '../../../ProfilePicture/profile-picture/profile-picture.component';


@Component({
  selector: 'app-update-adjustment-taxonomy',
  standalone:true,
  imports:[MatFormFieldModule,
    ExcludeFilterArrayPipe,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    CommonModule,
    MatInputModule,
    MatChipsModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    ProfilePictureComponent,
    ],
  templateUrl: './update-adjustment-taxonomy.component.html',
  styleUrls: ['./update-adjustment-taxonomy.component.css']
})
export class UpdateAdjustmentTaxonomyComponent implements OnInit {

  displayedColumns: string[] = ['prescription_date','created','name','tags','update'];
  dataSource = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  tableData = []
  profileData = []
  taxonomyList = []
  mapTaxonomy = {}
  taxonomyListSubscription:Subscription
  filteredTaxonomyList = []

  separatorKeysCodes: number[] = [ENTER, COMMA];
  
  firestoreDefault = getFirestore()

  constructor(
    private dialog:MatDialog,
    private _snackBar: MatSnackBar
    ){ 
    const profileCol = collection(this.firestoreDefault, "profile_data");
    getDocs(profileCol).then(snap => {
      this.profileData = snap.docs.map(e => e.data())
    })
      const taxonomyCol = collection(this.firestoreDefault, "atc taxonomy");
      this.taxonomyListSubscription = collectionData(taxonomyCol, { idField: 'id' }).subscribe(data => {
      this.taxonomyList = data;
      for (let i = 0; i < this.taxonomyList.length; i++) {
        const element = this.taxonomyList[i];
        this.mapTaxonomy[element['id']] = element['name']
      }
      this.filteredTaxonomyList = this.taxonomyList
    })
  }

  ngOnInit(): void {}

  ngOnDestroy(){
      this.taxonomyListSubscription?.unsubscribe();
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  ngAfterViewInit(){
    this.dataSource.data = this.tableData
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  async onSelect(event){
    let profileId = event.value
    let loadingRef = this.dialog.open(LoadingProgressComponent,{
      data:{
        msg:"Please await ...."
      },
      disableClose:true
    })
    const firestoreATC = getFirestore("firestore-atc")
    const atcAlphaQuery = query(
        collection(firestoreATC, "atc_alpha"),
        where("profileid", "==", profileId),
        orderBy("prescription_date", "desc")
      );
     const snap = await getDocs(atcAlphaQuery);
     this.tableData = [];      
      if(snap.docs.length === 0) this.ngAfterViewInit()
      for (const docSnap of snap.docs) {
      const atcElement = docSnap.data();
      const correctionsSnap = await getDocs(collection(docSnap.ref, "corrections"));
      for (const correction of correctionsSnap.docs) {
            const element = correction.data();
            if(element['isdelete'] != true){
              element['prescription_date'] = atcElement['prescription_date'].toDate()
              element['ref'] = correction.ref
              element['tags'] = element['tags'] || []
              this.tableData.push(element)
            }
          }
        this.ngAfterViewInit()
      }
    loadingRef.close()
  }

  onTagRemove(doc:any,index:number){
    doc['tags'].splice(index,1)
  }

  onUpdateTag(event:MatAutocompleteSelectedEvent,doc:any){
    doc['tags'].push(event.option.value)
  }

  onSubmit(doc:any){
    // console.log(doc['ref'].path);
    doc['ref'].update({
      tags:doc['tags']
    }).then(() => {
      this.openSnackBar()
    })
  }

  onSearchTags(event){
    let filterValue = ![null,undefined,""].includes(event.target.value) ? event.target.value.trim().toLowerCase() : ""
    return this.filteredTaxonomyList = this.taxonomyList.filter(e => e.name.toLowerCase().indexOf(filterValue) === 0)
  }

  filterTags(incomingArray){
    return this.taxonomyList.filter( e => !incomingArray.includes(e['id']))
  }

  openSnackBar() {
    this._snackBar.open('Updated', 'Ok', {
      horizontalPosition: "center",
      verticalPosition: "bottom",
    });
  }
}
