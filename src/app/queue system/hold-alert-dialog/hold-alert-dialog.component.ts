import { Component, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Firestore } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-hold-alert-dialog',
  imports: [
    MatButtonModule
  ],
  templateUrl: './hold-alert-dialog.component.html',
  styleUrl: './hold-alert-dialog.component.css'
})
export class HoldAlertDialogComponent {
  constructor( public dialogRef: MatDialogRef<any>,private firestore: Firestore) { }

  ngOnInit(): void {
  }

  onSubmit(){
    this.dialogRef.close("confirm")
  }
  
  cancel(){
    this.dialogRef.close(null)
  }
}
