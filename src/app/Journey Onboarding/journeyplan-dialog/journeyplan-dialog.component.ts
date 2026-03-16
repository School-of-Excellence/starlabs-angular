import { Component, Inject, OnInit } from '@angular/core';
import { AuthguardService } from '../../authguard.service';
import { Firestore } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-journeyplan-dialog',
  imports: [
    MatButtonModule
  ],
  templateUrl: './journeyplan-dialog.component.html',
  styleUrl: './journeyplan-dialog.component.css'
})
export class JourneyplanDialogComponent {
  participantjourneyproduct 
  orientationstatus
  constructor(@Inject(MAT_DIALOG_DATA) public data:any,
  public dialogRef: MatDialogRef<any>,
  private dialog: MatDialog,
  private firestore: Firestore,
  public guard: AuthguardService,) { 
    this.participantjourneyproduct = data
  }

  ngOnInit(): void {
  }

  onplanned(){
    var value = {}
    value['orientationstatus'] = 'planned'
    this.dialogRef.close(value)
  }

  onrevert(){
    var value = {}
    value['orientationstatus'] = this.participantjourneyproduct.previousorientationstatus
    this.dialogRef.close(value)
  }
}
