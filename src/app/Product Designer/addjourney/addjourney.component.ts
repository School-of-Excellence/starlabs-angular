import { Component, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, orderBy, query, writeBatch } from '@angular/fire/firestore';
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
import { JourneyEntryComponent } from './journey-entry/journey-entry.component';
import { Subscription } from 'rxjs';
import { CdkDragDrop, CdkDropList, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-addjourney',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    CommonModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    CdkDropList,
    DragDropModule
  ],
  templateUrl: './addjourney.component.html',
  styleUrl: './addjourney.component.css'
})
export class AddjourneyComponent {

  displayedColumns = ["reoder","journey","atcmodel","Edit",];
  dataSource:MatTableDataSource<any>;
  listofjourney: any[] = [];
  journeySubscription:Subscription

  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  private unsubscribeJourney?: () => void;

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
  }

  ngOnInit(): void {
    this.dataSource = new MatTableDataSource([]);
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
    const journeyColleciton = collection(this.afs,'journey')
    this.journeySubscription = collectionData(query(journeyColleciton,orderBy('sequence', 'asc'))).subscribe(doc =>{
      this.listofjourney = doc
      this.dataSource.data = doc
    });
  }

  ngOnDestroy(){
    if (this.journeySubscription) {
      this.journeySubscription.unsubscribe()
    }  
  }

  addjourneydialog(){
    this.dialog.open(JourneyEntryComponent,{
      width:'600px'
    })
  }

  onrowdelete(id){
    this.dialog.open(JourneyEntryComponent,{
      width:'400px',
      data : {
        delete : true ,
        id: id
      }
    })
  }

  onrowedit (id){
    const userobj = this.listofjourney.find( item => {
      return item.id === id
    })
    this.dialog.open(JourneyEntryComponent,{data : userobj})
  }

  drop(event: CdkDragDrop<any[]>) {
    console.log('Drop event:', event);
    
    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.dataSource.data, event.previousIndex, event.currentIndex);
      this.dataSource.data = [...this.dataSource.data];
      // console.log('Updated list:', this.dataSource.data); 
    }
  }

  async updateOrder(){
    try{
      const batch = writeBatch(this.afs);
      this.dataSource.data.forEach((item, index) => {
        const docRef = doc(this.afs, 'journey', item.id);
        batch.update(docRef, { sequence: index, updatedAt: new Date() });
      });
      
      await batch.commit();
      console.log('Order updated successfully in Firestore');
    }catch(error){
      console.error('Error updating order:', error);
    }
  }


}
