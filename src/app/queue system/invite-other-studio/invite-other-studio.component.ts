import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, collectionData, doc, docData, Firestore } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, Subscription, takeUntil } from 'rxjs';

@Component({
  selector: 'app-invite-other-studio',
  imports: [
    FormsModule,
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './invite-other-studio.component.html',
  styleUrl: './invite-other-studio.component.css'
})
export class InviteOtherStudioComponent {
  // invitationSubscription: Subscription
  mapActivity = {}
  mapProfile = {}
  mapStudio = {}
  mandatoryStudio = []
  optionalStudio = []
  acceptedStudio = []
  deniedStudio = []
  callReady = false
  invitationSubscription = new Subject<void>()
  constructor(
    @Inject(MAT_DIALOG_DATA) dialogdata:any, 
    public dialogRef: MatDialogRef<any>,
    public firestore: Firestore  
    
  ) {
    console.log(dialogdata)
    this.mapActivity = dialogdata["mapactivity"]
    this.mapProfile = dialogdata["mapprofile"]
    this.mapStudio = dialogdata["mapstudio"]
    docData(doc(this.firestore,'studioinvitation', dialogdata["invitationid"]), {idField:'id'}).pipe(takeUntil(this.invitationSubscription)).subscribe(value=>{
      this.mandatoryStudio = value["mandatorystudio"] ?? []
      this.optionalStudio = value["optionalstudio"] ?? []
      this.acceptedStudio = value["acceptedstudio"] ?? []
      this.deniedStudio = value["deniedstudio"] ?? []

      if(this.mandatoryStudio.length == 0){
        this.callReady = true
      }
      else{
        if(this.mandatoryStudio.every(e => this.acceptedStudio.includes(e))){
          this.callReady = true
        }
        else if(this.mandatoryStudio.some(e => this.deniedStudio.includes(e))){
          alert("We cannot proceed with the call since other specialist is not available.")
          this.callReady = false
        }
      }
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(){
    this.invitationSubscription.complete();
    this.invitationSubscription.next();
  }

  submit(){
    this.dialogRef.close(this.acceptedStudio)
  }

  cancel(){
    this.dialogRef.close("denied")
  }
}
