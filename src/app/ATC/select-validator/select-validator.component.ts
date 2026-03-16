import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { collection, Firestore, getDocs, or, orderBy, query, where } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-select-validator',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './select-validator.component.html',
  styleUrl: './select-validator.component.css'
})
export class SelectValidatorComponent {
  validatorList = [];
  selectedValidator = [];

  constructor(private firestore:Firestore, public matDialogRef : MatDialogRef<any>){

    var collectionRef = collection(firestore, "users_roles")
    var queryRef = query(collectionRef, or(where("ah", "==", true), where("mentor", "==", true), where("admin", "==", true)))
    getDocs(queryRef).then(async snap => {
      this.validatorList = [];
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.validatorList.push(element);
      }
      this.validatorList.sort((a, b) => a["name"].localeCompare(b["name"]))
      console.log(this.validatorList.length);
    });
  }

  ngOnInit(): void {
  }

  submitValidator(){
    this.matDialogRef.close(this.selectedValidator);
  }

  closeDialog(){
    this.matDialogRef.close([])
  }
}