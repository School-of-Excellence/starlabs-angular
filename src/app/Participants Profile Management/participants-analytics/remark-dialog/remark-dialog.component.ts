import { CommonModule, NgFor } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-remark-dialog',
  imports: [
    FormsModule,
    NgFor,
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './remark-dialog.component.html',
  styleUrl: './remark-dialog.component.css'
})
export class RemarkDialogComponent {
  remark:any;
  add : boolean = false
  edit : boolean = false
  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any, 
    public dialogRef: MatDialogRef<RemarkDialogComponent>
  ) {
    console.log(data);
    this.remark = data
  }

  ngOnInit(): void {}

  submit() {
    console.log('Submit');
    let value: any;
    if(this.remark != null || this.remark != undefined){
      if(this.remark.length != 0){
        value = this.remark
      }else{
        value = null
      }
    }
    else{
      value = null
    }
    this.dialogRef.close(value)
  }

  cancel(){
    console.log('cancel');
    this.dialogRef.close(null)
  }
} 
