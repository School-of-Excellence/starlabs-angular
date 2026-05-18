import { CommonModule } from '@angular/common';
import { Component, Inject, NgZone, OnInit } from '@angular/core';
import { doc, Firestore, getFirestore, updateDoc } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-atc-option',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './atc-option.component.html',
  styleUrl: './atc-option.component.css'
})
export class AtcOptionComponent {
  draftOption = []
  initiatedATC = []
  mapProfile = {}
  assignments = []

  firestoreATC = getFirestore("firestore-atc")

  constructor(@Inject(MAT_DIALOG_DATA) public atc, public dialogRef: MatDialogRef<any>,private ngZone: NgZone) {
    this.draftOption = atc["drafts"] ?? []
    this.initiatedATC = atc["initiated"] ?? []
    this.mapProfile = atc["mapProfile"] ?? {}
    this.assignments = atc["assignments"] ?? []
    console.log(this.initiatedATC)
    console.log(this.mapProfile)
    console.log(this.assignments.map(e =>e.data()));
    
  }

  ngOnInit(): void {
  }

  selecteATC(type, doc){
    var value = {
      type: type,
      doc: doc
    }
    this.dialogRef.close(value)
  }

  deleteDraft(atcdoc, index){
    if(confirm("Sure, do you want to delete this ATC")){
      updateDoc(doc(this.firestoreATC, atcdoc.ref.path),{
        delete: true
      }).catch(err =>{
        console.log(err)
      })
      this.draftOption.splice(index, 1)
      if(this.draftOption.length == 0){
        this.close()
      }
    }
  }

  close(){
    this.ngZone.run(() => {
      this.dialogRef.close(null);
    });  
    // this.dialogRef.close(null)
  }
}
