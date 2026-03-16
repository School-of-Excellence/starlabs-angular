import { Component, OnInit, ViewChild } from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AddCategoryComponent } from './add-category/add-category.component';
import { MatDialog } from '@angular/material/dialog';
import { collection, collectionData, doc, Firestore, orderBy, query, updateDoc } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-category-dashboard',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    DragDropModule,
    MatButtonModule
  ],
  templateUrl: './category-dashboard.component.html',
  // styleUrl: './category-dashboard.component.css'
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class CategoryDashboardComponent {
  displayedColumns: string[] = [ 'category', 'Edit', 'Delete'];
  dataSource = new MatTableDataSource();
  subscription = new Subject<void>()
  @ViewChild(MatPaginator) paginator : MatPaginator | any
  @ViewChild(MatSort) sort : MatSort | any
  
  constructor(public dialog: MatDialog, private firestore: Firestore) { 
    collectionData(collection(this.firestore,'category')).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      this.dataSource.data = snapshot;
      this.dataSource.paginator = this.paginator
      this.dataSource.sort = this.sort
    })
  }

  ngOnInit(): void {
  }
  ngOnDestroy(){
    this.subscription.complete();
    this.subscription.next();
  }

  openDialog() {
    this.dialog.open(AddCategoryComponent,{
      data: {
        add : true
      }
    })
  }

  onEditDialog(id:any, category:any) {
    this.dialog.open(AddCategoryComponent,{
      data: {
        edit : true,
        id : id,
        category : category
      }
    })
  }

  onDeleteDialog(id:any) {
    this.dialog.open(AddCategoryComponent,{
      data : {
        delete : true,
        id : id
      }
    })
  }

  ApplyFilter(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource.filter = filterValue.trim().toLowerCase()
   }

   onDrop(event: CdkDragDrop<any[]>) {
    const data = this.dataSource.data; // Get the underlying data array
    moveItemInArray(data, event.previousIndex, event.currentIndex);
    this.dataSource.data = data
    console.log(data) // Update the data source with the modified array
    this.saveOrder(data)
  }
  
 
  fetchData() {
    collectionData(query(collection(this.firestore,'series'), orderBy('order'))).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      this.dataSource.data = snapshot;
      console.log(snapshot)
    })
  }
  
  saveOrder(data: any[]) {
    const collectionRef = collection(this.firestore,'series');
  
    data.forEach((row: any, index: number) => {
      const docRef = doc(collectionRef,row.id);
      updateDoc(docRef,{ order: index })
        .then(() => console.log(`Order for document ${row.id} updated successfully.`))
        .catch((error) => console.error(`Error updating order for document ${row.id}:`, error));
    });
  }
}
