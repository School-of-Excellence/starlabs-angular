import { Component, ViewChild } from '@angular/core';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AuthguardService } from '../../authguard.service';
import { PackageEntryComponent } from './package-entry/package-entry.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-addpackage',
  imports: [
    MatFormFieldModule,
    MatPaginatorModule,
    MatTableModule,
    MatSortModule,
    CommonModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './addpackage.component.html',
  styleUrl: './addpackage.component.css'
})
export class AddpackageComponent {

  displayedColumns = ["package","Edit",];
  dataSource:MatTableDataSource<any>;
  listofpackage: any[]

  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;
  
  // private unsubscribePackage?: () => void;
  unsubscribePackage:Subscription

  constructor(public dialog:MatDialog,private afs : Firestore, public guard: AuthguardService, public router: Router) { 
    this.guard.getRoles().then(roleData=>{
      // if(roleData["integrator"] || roleData["admin"] || roleData["ah"]){
      //   console.log("Good")
      // }
      // else{
      //   alert("Unauthorized Access")
      //   this.router.navigateByUrl('/')
      // }
    })
    this.dataSource = new MatTableDataSource([]);
  }

  ngOnInit(): void {
    
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  ngAfterViewInit(){
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    const packageCollection = collection(this.afs,'package')
    this.unsubscribePackage = collectionData(packageCollection,{idField : 'id'}).subscribe(doc =>{
      this.listofpackage = doc
      this.dataSource.data = doc
    })
    // this.unsubscribePackage = onSnapshot(packageCollection,(snapshot)=>{
    //   const packageData = snapshot.docs.map(doc =>({
    //     id:doc.id,
    //     ...doc.data()
    //   }));
    //   this.listofpackage = packageData
    //   this.dataSource.data = packageData
    // }
  }
  ngOnDestroy(){
    if (this.unsubscribePackage) {
      this.unsubscribePackage.unsubscribe()
    }  
  }
  addpackagedialog(){
    this.dialog.open(PackageEntryComponent,{
      width:'600px'
    })
  }

  ///
  onrowdelete(id){
    // console.log(id);
    this.dialog.open(PackageEntryComponent,{
      width:'400px',
      data : {
        delete : true ,
        id: id
      }
    })
  }
  ////
  onrowedit (id){
    const userobj = this.listofpackage.find( item => {
      return item.id === id
    })
    // console.log(userobj);
    this.dialog.open(PackageEntryComponent,{data : userobj})
  }
}
