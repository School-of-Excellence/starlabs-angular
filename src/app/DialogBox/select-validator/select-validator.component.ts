import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Firestore ,collection, query, orderBy, getDocs } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-select-validator',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatOptionModule,
    MatSelectModule,
    FormsModule,
    CommonModule,
    MatButtonModule,
  ],
  templateUrl: './select-validator.component.html',
  styleUrls: ['./select-validator.component.css']
})
export class SelectValidatorComponent implements OnInit {

  validatorList = [];
  selectedValidator = [];
  constructor(private firestore:Firestore, public matDialogRef : MatDialogRef<SelectValidatorComponent>){
    const userRolesRef = query(collection(this.firestore, "users_roles"), orderBy("name"));
    getDocs(userRolesRef).then(async snap => {
      this.validatorList = [];
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        if(element['ah'] || element['developer'] || element['admin'] || element['mentor']){
          this.validatorList.push(element);
        }
      }
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
