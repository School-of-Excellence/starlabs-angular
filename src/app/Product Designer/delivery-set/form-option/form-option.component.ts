import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { Firestore , collection,doc,deleteDoc} from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-form-option',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './form-option.component.html',
  styleUrl: './form-option.component.css'
})
export class FormOptionComponent {
  draftOption = [];
  constructor(@Inject(MAT_DIALOG_DATA) public forms, public dialogRef: MatDialogRef<any>, public firestore: Firestore) { 
    this.draftOption = forms["drafts"] ?? []
  }
  
  ngOnInit(): void {
  }

  selecteForm(type, doc){
    var value = {
      type: type,
      doc: doc
    }
    this.dialogRef.close(value)
  }

  async deleteDraft(id, index){
    if(confirm("Sure, do you want to delete this ATC")){
      await deleteDoc(doc(collection(this.firestore,"big_temporary_forms"),id));
      this.draftOption.splice(index, 1);
    }
  }

  close(){
    this.dialogRef.close(null)
  }
}
