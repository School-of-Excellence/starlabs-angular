import { CommonModule } from '@angular/common';
import { Component, OnInit,Inject} from '@angular/core';
import { Firestore,collection,setDoc,doc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import {MatDialog, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field';
import { merge } from 'rxjs';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-addtags',
  standalone:true,
  imports:[MatFormFieldModule,CommonModule,FormsModule,MatInputModule,MatIconModule,MatButtonModule],
  templateUrl: './addtags.component.html',
  styleUrls: ['./addtags.component.css']
})
export class AddTagsComponent implements OnInit {
  id:string = null
  name:string = null
  constructor(
    public dialogRef: MatDialogRef<AddTagsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore : Firestore
  ) { 
    console.log(data);
    if(data.type === 'edit'){
      this.id = data.doc['id']
      this.name = data.doc['name']
    }
  }

  ngOnInit(): void {
  }
  async onsubmit() {
      if (confirm("Are you sure want to submit ?")) {
      const docRef = doc(collection(this.firestore, "atc taxonomy"));
     const docid = this.id ?? docRef.id;        try {
          await setDoc(doc(this.firestore, "atc taxonomy", docid), {
            id: docid,
            name: this.name,
            updateddate: new Date()
          }, { merge: true });

          this.id = null;
          this.name = null;
          if (this.data.type === 'edit') this.dialogRef.close();
        } catch (error) {
          console.error("Submission failed: ", error);
        }
      }
    }

}
