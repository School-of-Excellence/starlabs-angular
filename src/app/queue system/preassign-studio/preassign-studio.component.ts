import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';

@Component({
  selector: 'app-preassign-studio',
  imports: [
    MatRadioModule,
    CommonModule,
    FormsModule,
    MatButtonModule
  ],
  templateUrl: './preassign-studio.component.html',
  styleUrl: './preassign-studio.component.css'
})
export class PreassignStudioComponent {
  mapProfile = {}
  mapActivity = {}
  stagename = ""
  studioList = []
  selectedStudioid = null

  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogdata,
    public dialogref: MatDialogRef<any>
  ) {
    console.log(dialogdata)
    this.mapProfile = dialogdata["mapprofile"]
    this.mapActivity = dialogdata["mapactivity"]
    this.stagename = dialogdata["stagename"]
    this.studioList = dialogdata["studiolist"]
  }

  ngOnInit(): void {
  }

  close(){
    this.dialogref.close(null)
  }

  submit(){
    if(this.selectedStudioid != null){
      this.dialogref.close(this.selectedStudioid)
    }
  }
}
