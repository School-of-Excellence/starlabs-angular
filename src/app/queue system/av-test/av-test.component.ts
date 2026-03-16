import { Component, Inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';


@Component({
  selector: 'app-av-test',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule
  ],
  templateUrl: './av-test.component.html',
  styleUrl: './av-test.component.css'
})
export class AvTestComponent {
  mapProfile = {}
  token = {}
  zoomLink = ""

  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogdata: any,
    public dialogref: MatDialogRef<any>
  ) {
    this.token = dialogdata["token"] ?? "Bulk AV TEST"
    this.mapProfile = dialogdata["mapprofile"]
    this.token = dialogdata["token"]
    this.zoomLink = dialogdata["avtestlink"] ?? ""
  }

  ngOnInit(): void {
  }

  close(){
    this.dialogref.close(null)
  }

  update(status){
    this.dialogref.close({
      status: status,
      avtestlink: this.zoomLink,
    })
  }

}
