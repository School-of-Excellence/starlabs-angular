import { Component, Inject, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { AuthguardService } from '../../../authguard.service';
import { MatIconModule } from '@angular/material/icon';
import { deleteDoc, doc, Firestore } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SnackbarService } from '../../../shared/snackbar.service';

@Component({
  selector: 'app-clear-workshop',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './clear-workshop.component.html',
  styleUrls: ['./clear-workshop.component.css']
})
export class ClearWorkshopComponent implements AfterViewInit {
  displayedColumns: string[] = ['profileid', 'status', 'enrollmentdate', 'workshopStartedAt', 'enrollid', 'participantdocid', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  mapProfile: any = {};

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  constructor(
    public dialogRef: MatDialogRef<ClearWorkshopComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore ,
    private snackbarService: SnackbarService,  
  ) {
    this.mapProfile = data.mapProfile;
    const transformedData = data.participants.map((item: any) => ({
      id: item.id,
      participantworkshopid: item.participantworkshopref.id,
      profileid: item.profileid,
      status: item.status,
      enrollmentdate: new Date(item.enrollmentdate.seconds * 1000).toLocaleString(),
      workshopStartedAt: item.workshopStartedAt
        ? new Date(item.workshopStartedAt.seconds * 1000).toLocaleString()
        : 'Not Started'
    }));

    this.dataSource.data = transformedData;
    this.dataSource.filterPredicate = (row: any, filter: string) => {
      const name = this.mapProfile[row.profileid]['name'] || '';
      return (
        name.toLowerCase().includes(filter) ||
        row.status.toLowerCase().includes(filter) ||
        row.enrollmentdate.toLowerCase().includes(filter) ||
        row.workshopStartedAt.toLowerCase().includes(filter)
      );
    };
  }


  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }
  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  async deleteRow(row: any) {
    const confirmed = confirm(`Are you sure you want to delete this participant?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(this.firestore, 'workshop participant enrolled', row.id));
      await deleteDoc(doc(this.firestore, 'participant workshop', row.participantworkshopid));
      this.dataSource.data = this.dataSource.data.filter(r => r.id !== row.id);

      console.log(`Deleted ${row.id} and ${row.participantworkshopid} successfully`);
    } catch (err) {
      console.error('Error deleting documents:', err);
    }
  }
  closeDialog() {
    this.dialogRef.close();
  }
  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    this.snackbarService.show('Copied ' +text);
  }

}
