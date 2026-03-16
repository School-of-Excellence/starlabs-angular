import { Component, OnInit, ViewChild } from '@angular/core';
import { AuthguardService } from '../../authguard.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { collectionData, Firestore, collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch, CollectionReference, DocumentReference } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NgIf } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AddPackageDesignComponent } from './add-package-design/add-package-design.component';



@Component({
  selector: 'app-package-design',
  imports: [MatFormFieldModule,
            MatTableModule,
            MatSortModule,
            MatPaginatorModule,
            NgIf,
            MatInputModule,
            MatButtonModule,
            MatSortModule,
            MatDialogModule
          ],
  templateUrl: './package-design.component.html',
  styleUrl: './package-design.component.css'
})
export class PackageDesignComponent {

  @ViewChild(MatSort) matsort:MatSort
  @ViewChild(MatPaginator) paginator:MatPaginator
  packageDesignHeader = ["packagelabel", "currentjourney", "newjourney", "packagestatus", "subscriptionfrom", "extentionmonths"];
  packageDesignData:MatTableDataSource<any> = new MatTableDataSource();
  journeySubscription:Subscription
  journeyList = []
  journeyMap = {}
  packageDesignSubscription:Subscription

  constructor(public  guard : AuthguardService, public firestore: Firestore, public dialog: MatDialog, public router: Router) {
    // guard.getRoles().then(roles=>{
    //   if(roles["ah"] || roles["admin"] || roles["developer"]){
        this.fetchPackageDesign()
    //   }
    //   else{
    //     router.navigateByUrl("/")
    //   }
    // })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(){
    this.journeySubscription?.unsubscribe()
    this.packageDesignSubscription?.unsubscribe()
  }

  fetchPackageDesign(){
    const journeyCollection = collection(this.firestore,'journey') 
    const q = query(journeyCollection,orderBy("journey"))
    const journeyData = collectionData(q,  { idField: 'id' })
    this.journeySubscription = journeyData.subscribe({
      next: (journey) => {
        this.journeyList = journey
        console.log("list", journey);

        for (let i = 0; i < this.journeyList.length; i++) {
          const element = this.journeyList[i];
          this.journeyMap[element["id"]] = element["journey"]
        }
      }
    })
      
   const packageDesigncollection = collection(this.firestore ,'package design')
   this.packageDesignSubscription = collectionData(packageDesigncollection , {idField: 'id'}).subscribe(design => {
    this.packageDesignData.data = design
    this.packageDesignData.sort = this.matsort
    this.packageDesignData.paginator = this.paginator
   })
  }

  filterPackageDesign(value){
    this.packageDesignData.filter = value
  }

  createPackageDesign(design){
    this.dialog.open(AddPackageDesignComponent, {
      maxWidth: '90vw',
      maxHeight: '90vh',
      data: {
        design: Object.assign({}, design),
        journeylist: this.journeyList,
        journeymap: this.journeyMap
      },
      disableClose: true,
      
    })
  }

}
