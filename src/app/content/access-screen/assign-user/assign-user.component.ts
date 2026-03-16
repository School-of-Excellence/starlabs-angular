import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, getDocs, updateDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-assign-user',
  imports: [
    MatFormFieldModule,
    CommonModule,MatInputModule,
    FormsModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './assign-user.component.html',
  styleUrl: './assign-user.component.css'
})
export class AssignUserComponent {
  edit = false
  delete = false
  tier : any = []
  username : any
  selectedtier : any = []
  isDisabled: boolean = true;
  mapTiers = {}

  constructor(
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<AssignUserComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any, 
    private firestore : Firestore
  ) 
  {
    if(this.data){
      if(this.data.edit){
        this.edit = this.data.edit
        this.selectedtier = this.data.tier
        this.username = this.data.username
      }
      if(this.data.delete){
        this.delete = this.data.delete
        console.log(this.data.delete);
      }
    }
    const tierRef = collection(this.firestore, 'tier');
    getDocs(tierRef).then((res) => {
      for(let i=0; i<res.docs.length; i++){
        this.tier.push(res.docs[i].data())
        this.mapTiers[res.docs[i].id] = res.docs[i].data()
      }
      console.log(this.tier)      
    })
  }

  ngOnInit(): void {}

  onClick(){
    this.dialogRef.close();
  }

  onedit(id:any){
    console.log(id)
    if(this.data.edit){
      const userRef = doc(collection(this.firestore, 'user'),id);
      updateDoc(userRef,{
        tier : this.selectedtier
      })
      .then(() => {
        this.dialogRef.close()
      })
      .catch(err => {
        console.error('Error adding tier:', err);
      });
    }
  }
  
  ondelete(id: any){
    if(this.data.delete){
      const userRef = doc(collection(this.firestore, 'user'),id);
      deleteDoc(userRef)
      .then(() => {
        this.dialogRef.close()
      })
      .catch(err => {
        console.error('Error adding tier:', err);
      });
    }
  }

  compareFn = (a:any,b:any) => {
    return a && b ? a === b : false
  }

}
