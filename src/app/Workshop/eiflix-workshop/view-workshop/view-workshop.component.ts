import { Component, OnInit,ViewChild } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, onSnapshot } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { AddWorkshopComponent } from '../add-workshop/add-workshop.component';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-view-workshop',
  standalone: true,
  imports: [
    MatTableModule,
    MatIconModule,
    MatSelectModule,
    MatInputModule,
    MatPaginatorModule,
    CommonModule,
    MatButtonModule,
  ],
  templateUrl: './view-workshop.component.html',
  styleUrls: ['./view-workshop.component.css']
})
export class ViewWorkshopComponent implements OnInit {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  displayedColumns: string[] = ['title','description','startdate','enddate','lastregistrationdate',"edit",'delete'];
  contentData = new MatTableDataSource();

  loading:boolean = true;
  workshopdatalist = [];

  constructor(
    private storage : Storage,
    private firestore: Firestore,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ){ 
    const colRef = collection(this.firestore, "eiflix workshop");
    onSnapshot(colRef, (snapshot) => {
    this.workshopdatalist = [];
    for (let i = 0; i < snapshot.docs.length; i++) {
      const element = snapshot.docs[i].data();
      console.log("element", element);
        this.workshopdatalist.push(element);
      }
      this.contentData.data = this.workshopdatalist
      this.contentData.sort = this.sort
      this.contentData.paginator = this.paginator
    })
  }

  ngOnInit(): void {}

  openSnackBar(message:string,action:string) {
    this.snackBar.open(message,action,{ duration: 2000})
  }

  editContent(currentcontent){
    this.dialog.open(AddWorkshopComponent,{
      disableClose:true,
      data:currentcontent,
      maxHeight: "90vh"
    })
  }

  createWorkshop(){
    this.dialog.open(AddWorkshopComponent,{
      disableClose:true,
      width:"90vw",
      maxHeight: "90vh"
    })
  }

  async deleteContent(currentcontent){
    console.log(currentcontent);
    let confirmdialog = confirm('Are you sure want the delete this content');
    if(confirmdialog){
      const docRef = doc(this.firestore, 'eiflix workshop', currentcontent['docid']);
      await deleteDoc(docRef).then(() => {
        console.log('successfully deleted');
        this.openSnackBar("Successfully Content Deleted","")
      }).catch((err)=>{
        console.log(err);
        this.openSnackBar("Something went wrong","")
      })
    }
  }

}
