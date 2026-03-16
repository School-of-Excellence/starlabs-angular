import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { collection, deleteDoc, doc, Firestore, getDocs, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-add-category',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    
  ],
  templateUrl: './add-category.component.html',
  styleUrl: './add-category.component.css'
})
export class AddCategoryComponent {

  add = false;
 edit = false;
 delete = false;
 category : any
 tabledata : any = []
 crossmatch: boolean | undefined
 crossmatcherrormessage!: string | boolean;

  constructor(public dialog: MatDialog,
    public dialogRef: MatDialogRef<AddCategoryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore
    ) { 
      if(this.data){
        if(this.data.add) {
          this.add = this.data.add
        }
        if(this.data.edit) {
          this.edit = this.data.edit
          this. category = this.data.category
        }
        if(this.data.delete) {
          this.delete = this.data.delete
        }
      }

      getDocs(collection(this.firestore,'category')).then((res) => {
        for(let i=0; i<res.docs.length; i++) {
          this.tabledata.push(res.docs[i].data())
        }
        console.log(this.tabledata)
      })
    }

  ngOnInit(): void {
  }

  onSubmit() {
    let id = doc(collection(this.firestore, 'category')).id;
      setDoc(doc(this.firestore,'category',id),{
        id : id,
        category : this.category,
        date : serverTimestamp()
      }).catch(err => {
        console.log(err);
      })
      console.log(this.category);
      this.dialogRef.close();
  }

  onEdit(id: any, category: any) {
    updateDoc(doc(this.firestore,'category',id),{
      category : category
    })
    console.log(category)
    this.dialogRef.close()
  }

  onDelete(id: any) {
    deleteDoc(doc(this.firestore,'category',id));
    console.log('document deleted successfully')
    this.dialogRef.close()
  }

  onClick() {
    this.dialogRef.close();
  }

  onSelect() {
    console.log(this.tabledata);

    var duplicateNameCheck = this.tabledata.some((e:any) => e.category.trim().toLowerCase() === this.category.trim().toLowerCase())
    console.log(duplicateNameCheck);
    this.crossmatch = duplicateNameCheck
    this.crossmatcherrormessage =  duplicateNameCheck ? "Given Name Already Exit": false
  }


}
