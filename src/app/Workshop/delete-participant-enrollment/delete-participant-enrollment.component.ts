import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';

@Component({
  selector: 'app-delete-participant-enrollment',
  imports: [
    MatDialogModule,
    CommonModule,
    MatButtonModule,
    MatListModule
  ],
  templateUrl: './delete-participant-enrollment.component.html',
  styleUrl: './delete-participant-enrollment.component.css'
})
export class DeleteParticipantEnrollmentComponent {
   constructor(
    public dialogRef: MatDialogRef<DeleteParticipantEnrollmentComponent>,
    @Inject(MAT_DIALOG_DATA) public data:any
  ){ }

  ngOnInit(): void {}
}
