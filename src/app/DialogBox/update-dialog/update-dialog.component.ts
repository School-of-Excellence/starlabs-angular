import { CommonModule } from '@angular/common';
import { Component, OnInit, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-update-dialog',
  imports: [
    MatFormFieldModule,
    MatButtonModule,
    CommonModule,
    FormsModule,
    MatInputModule
  ],
  templateUrl: './update-dialog.component.html',
  styleUrl: './update-dialog.component.css'
})
export class UpdateDialogComponent {
  message:string

  constructor(public dialogRef: MatDialogRef<any>, @Inject(MAT_DIALOG_DATA) public data:any) {
    this.message = data?.toString() 
  }

  ngOnInit(): void {
  }

  cancel(){
    this.dialogRef.close(null)
  }

  submit(){
    this.dialogRef.close(this.message)
  }

}
