import { Component, Inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-accept-other-studio',
  imports: [
    MatButtonModule
  ],
  templateUrl: './accept-other-studio.component.html',
  styleUrl: './accept-other-studio.component.css'
})
export class AcceptOtherStudioComponent {
  invitationdata = {}
  mapProfile = {}

  constructor(
    @Inject(MAT_DIALOG_DATA) dialogdata:any, 
    public dialogRef: MatDialogRef<any>,
  ) {
    this.invitationdata = dialogdata["invitation"]
    this.mapProfile = dialogdata["mapprofile"]
  }

  ngOnInit(): void {
  }

  cancel(){
    this.dialogRef.close("denied")
  }

  submit(){
    this.dialogRef.close("success")
  }

} 
