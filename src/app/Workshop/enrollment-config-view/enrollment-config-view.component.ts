import { Component, inject, ViewChild } from '@angular/core';
import { EnrollmentConfigCreateComponent } from '../enrollment-config-create/enrollment-config-create.component';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { Subject, takeUntil } from 'rxjs';
import { collection, collectionData, deleteDoc, doc, Firestore } from '@angular/fire/firestore';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-enrollment-config-view',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatButtonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatDialogModule,
    MatCheckboxModule
  ],
  templateUrl: './enrollment-config-view.component.html',
  styleUrl: './enrollment-config-view.component.css'
})
export class EnrollmentConfigViewComponent {
  displayedColumns: string[] = ['label', 'edit', 'delete'];
  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  constructor(
    private dialog:MatDialog,
  )
  {
    collectionData(collection(this.firestore,"eiflix enrolment")).pipe(takeUntil(this.destroy$)).subscribe(snap => {
      console.log(snap);
      this.dataSource.data = snap
      this.ngAfterViewInit()
    })
  }

  ngOnInit(): void {}

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  onOpenDialog(){
    this.dialog.open(EnrollmentConfigCreateComponent,{
      data:{
        type:'add',
        doc:null
      },
      width:'100%',
      height:'90%',
      disableClose:true
    })
  }

  onEditDialog(doc:any){
    this.dialog.open(EnrollmentConfigCreateComponent,{
      data:{
        type:'edit',
        doc:doc
      },
      width:'100%',
      height:'90%',
      disableClose:true
    })
  }

  onDeleteDoc(row){
    if(confirm("Are you sure?")){
      deleteDoc(doc(this.firestore,"eiflix enrolment",row.docid))
    }
  }
}
