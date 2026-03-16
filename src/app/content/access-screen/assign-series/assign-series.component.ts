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
  selector: 'app-assign-series',
  imports: [
    MatFormFieldModule,
    CommonModule,MatInputModule,
    FormsModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './assign-series.component.html',
  styleUrl: './assign-series.component.css'
})
export class AssignSeriesComponent {

  edit = false
  delete = false
  tier : any = []
  mapTiers = {}
  selectedtier : any = []
  seriesName : any
  isDisabled: boolean = true;

  constructor(public dialog: MatDialog,public dialogRef: MatDialogRef<AssignSeriesComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any, private firestore : Firestore) {
      if(this.data){
        if(this.data.edit){
          console.log(this.data,"this.data");
          
          this.edit = this.data.edit
          this.selectedtier = this.data.tier
          this.seriesName = this.data.seriesName
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
          this.mapTiers[res.docs[i].id] = res.docs[i].data()['tier']
        }
        console.log(this.mapTiers)      
      })

     }

  ngOnInit(): void {}

  onClick(){
    this.dialogRef.close();
  }
  onedit(id:any){
    console.log(id)
   if(this.data.edit){
    let tierRefs: any = []
    for ( let i = 0; i< this.selectedtier.length; i++) {
      const tierRef = doc(this.firestore, 'tier',this.selectedtier[i]);
      tierRefs.push(tierRef)
    }
    const tierRef = doc(collection(this.firestore, 'series'),id);
    updateDoc(tierRef,{
      tier : tierRefs
    })
    .then(() => {
      this.dialogRef.close()
    })
    .catch(err => {
      console.error('Error adding tier:', err);
    });
    }
   this.dialogRef.close();
  }
  
 ondelete(id: any){
  if(this.data.delete){
    const seriesRef = doc(collection(this.firestore, 'series'),id);
    deleteDoc(seriesRef)
    .then(() => {
      this.dialogRef.close()
    })
    .catch(err => {
      console.error('Error adding tier:', err);
    });
  }
 }

 compareFn = (a:any,b:any) => {
  return a && b  ? this.mapTiers[a] === b : false
 }

}
