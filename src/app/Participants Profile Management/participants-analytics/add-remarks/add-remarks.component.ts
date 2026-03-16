import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-add-remarks',
  imports: [
    FormsModule,
    MatButtonModule
  ],
  templateUrl: './add-remarks.component.html',
  styleUrl: './add-remarks.component.css'
})
export class AddRemarksComponent {
  remark:string
  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any, 
    public dialogRef: MatDialogRef<AddRemarksComponent>) {
    this.remark = data.remark
  }

  ngOnInit(): void {}

  submit(){
    var value:string
    if(this.remark != null || this.remark != undefined){
      if(this.remark.trim().length != 0){
        value = this.remark.trim()
      }
      else{
        value = null
      }
    }
    else{
      value = null
    }
    this.dialogRef.close(value)
  }

  cancel(){
    this.dialogRef.close(null)
  }
}
