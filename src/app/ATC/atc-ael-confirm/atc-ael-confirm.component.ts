import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';

@Component({
  selector: 'app-atc-ael-confirm',
  imports: [
    MatButtonModule,
    CommonModule,
    MatRadioModule,
    FormsModule
  ],
  templateUrl: './atc-ael-confirm.component.html',
  styleUrl: './atc-ael-confirm.component.css'
})
export class AtcAelConfirmComponent {
  loading = true
  confirmMessage = ""
  availableAEL = null
  selecteAEL = null

  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogData: any,
    public dialogRef: MatDialogRef<any>,
    public firestore: Firestore
  ) {
    console.log(dialogData)
    
    var selectedModel = dialogData["atcmodel"]
    var profileid = dialogData["profileid"]
    this.confirmMessage = dialogData["confirmationmessage"]
    if(["up!", "b!g", "big", "lyl"].includes(selectedModel.toLowerCase())){
      getDocs(query(collection(this.firestore,"participant AEL"),where("atcmodel", "==", "uP!"),where("status", "==", "ongoing"),where("profileid", "==", profileid))).then(ael=>{
      // firestore.collection("participant AEL", ref=>ref.where("atcmodel", "==", "uP!").where("status", "==", "ongoing").where("profileid", "==", profileid)).get().toPromise().then(ael=>{
        if(ael.size != 0){
          var list = ael.docs.map(e => e.data())
          list.sort((a, b) => b["created"].toDate() - a["created"].toDate())
          this.availableAEL = list[0]["docid"]
        }
        else{
          this.selecteAEL = false
        }
        this.loading = false
      })
    }
    else{
      this.loading = false
      this.selecteAEL = false
    }
  }

  ngOnInit(): void {
  }

  confirmATC(){
    if(this.selecteAEL != null){
      this.dialogRef.close(this.selecteAEL)
    }
  }
  
  close(){
    this.dialogRef.close(null)
  }
}
