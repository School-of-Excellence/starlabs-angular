import { Component, OnInit, ViewChild } from '@angular/core';
import { Firestore, collection, collectionData, doc, deleteDoc} from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import {MatPaginator} from '@angular/material/paginator';
import {MatSort} from '@angular/material/sort';
import {MatTableDataSource} from '@angular/material/table';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { AddTagsComponent } from '../addtags/addtags.component';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-view-tags',
  standalone: true,
  imports:[
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatIconModule,
    MatPaginatorModule,
    MatTableModule,
    MatButtonModule
  ],
  templateUrl: './view-tags.component.html',
  styleUrls: ['./view-tags.component.css']
})
export class ViewTagsComponent implements OnInit {
  // displayedColumns: string[] = ['id','name','edit','delete'];
  displayedColumns: string[] = ['name','edit'];
  dataSource = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  tableData = []
  tableDataSubscription:Subscription 
  constructor(
    private firestore:Firestore,
    private dialog:MatDialog
    ){ 
    const atcCollection = collection(this.firestore, 'atc taxonomy');
    this.tableDataSubscription = collectionData(atcCollection, { idField: 'id' }).subscribe(snap => {
    this.tableData = snap;
    this.dataSource.data = this.tableData;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  });
  }

  ngOnInit(): void {}

  ngOnDestroy(){
    this.tableDataSubscription.unsubscribe()
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
  onAddTag(){
    this.dialog.open(AddTagsComponent,{
      data:{
        type:"add",
        doc:null
      }
    })
  }

  onEdit(doc:any){
    this.dialog.open(AddTagsComponent,{
      data:{
        type:"edit",
        doc:doc
      }
    })
  }

  onDelete(docItem: any) {
  const docRef = doc(this.firestore, `atc taxonomy/${docItem['id']}`);
  deleteDoc(docRef);
}
}
