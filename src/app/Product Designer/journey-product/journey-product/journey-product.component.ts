import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { AuthguardService } from '../../../authguard.service';
import { MapJourneyProductComponent } from './map-journey-product/map-journey-product.component';
import { collection, collectionSnapshots, Firestore } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-journey-product',
  imports: [
    MatTableModule,
    MatIconModule,
    MatPaginatorModule,
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './journey-product.component.html',
  styleUrl: './journey-product.component.css'
})
export class JourneyProductComponent {
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  journeyProductHeading = ["journey", "product", "action"];
  journeyProductSource:MatTableDataSource<any> = new MatTableDataSource();
  mapProduct = {}
  mapJourney = {}
  private unsubscribe$ = new Subject<void>();

  constructor(private dialog : MatDialog,private afs: Firestore, public guard: AuthguardService, public router: Router) {
    this.guard.getRoles().then(roleData=>{
      // if(roleData["integrator"] || roleData["admin"] || roleData["ah"]){
      //   console.log("Good")
      // }
      // else{
      //   alert("Unauthorized Access")
      //   this.router.navigateByUrl('/')
      // }
    })

    const productCollection = collection(this .afs, 'products')
    collectionSnapshots(productCollection).pipe(takeUntil(this.unsubscribe$)).subscribe(snap => {
      snap.forEach(doc => {
        this.mapProduct[doc.ref.path] = doc.data()["product"]
      })
    })

    console.log(this.mapProduct, 'this.mapProduct');
    
    const journeyCollection = collection(this.afs, 'journey')
    collectionSnapshots(journeyCollection).pipe(takeUntil(this.unsubscribe$)).subscribe(journey => {
      journey.forEach(doc => {
        this.mapJourney[doc.ref.path] = doc.data()["journey"]
      })
    })
    const journeyproductCollection = collection(this.afs, 'journey-to-product')
    collectionSnapshots(journeyproductCollection).pipe(takeUntil(this.unsubscribe$)).subscribe(journeyProduct => {
      var data = []
      for (let i = 0; i < journeyProduct.length; i++) {
        const doc = journeyProduct[i];
        var docdata = doc.data()
        var sequenceList = []
        docdata["product"]?.forEach(sequence=>{
          sequenceList.push(sequence.path)
        })
        data.push({
          journey: docdata["journey"]["path"],
          product: sequenceList,
          journeyrequiredjourneycoach: docdata["journeyrequiredjourneycoach"] ?? false,
          docid: doc.id
        })
      }
      this.journeyProductSource.data = data
      this.journeyProductSource.sort = this.sort
      this.journeyProductSource.paginator = this.paginator
    })
  
  }

  ngOnInit(): void {
   
  }

  ngOnDestroy(){
    this.unsubscribe$.next();
    this.unsubscribe$.complete()
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.journeyProductSource.filter = filterValue.trim().toLowerCase();
  }

  onopendialog(){
    window.scrollTo({
      top : 0,
    })
    this.dialog.open(MapJourneyProductComponent, {
      width: '90%'
    })
  }

  onrowedit(row){
    window.scrollTo({
      top : 0,
    })
    this.dialog.open(MapJourneyProductComponent,{
      data:row,
      width: '90%',
      height: '90%'
    })
  }

  onrowdelete(id){
    console.log(id);
    this.dialog.open(MapJourneyProductComponent,{
      data:{
        id:id,
        delete:true,
        width: '90%',
        height: '90%'
      }
    })
  }
}
