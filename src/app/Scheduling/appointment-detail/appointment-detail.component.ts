import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MarkAppointmentStatusComponent } from '../mark-appointment-status/mark-appointment-status.component';

@Component({
  selector: 'app-appointment-detail',
  imports: [
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './appointment-detail.component.html',
  styleUrl: './appointment-detail.component.css'
})
export class AppointmentDetailComponent {
  metaData:any = {}
  enableCancel:boolean = false
  enableStatus:boolean = false

  constructor(public dialog: MatDialog, public dialogRef:MatDialogRef<any>,  @Inject(MAT_DIALOG_DATA) public data:any) {
    this.metaData = data
    if(!this.metaData['cancelled'] && new Date() < this.metaData['starttime'].toDate()){ // this.metaData['type'] == 'appointment' && 
      this.enableCancel = true
    }
    if(!this.metaData['cancelled'] && !this.metaData['attended'] && this.metaData['starttime'].toDate() < new Date()){ // this.metaData['type'] == 'slot' && 
      this.enableStatus = true
    }
  }

  cancel(){
    this.dialogRef.close(this.metaData)
  }

  updateStatus(){
    this.close()
    this.dialog.open(MarkAppointmentStatusComponent, {
      data: this.metaData,
      disableClose: true,
      autoFocus: false
    })
  }

  close(){
    this.dialogRef.close(null)
  }
}
