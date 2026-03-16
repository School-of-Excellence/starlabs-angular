import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, getDoc, getDocs, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-add-tier',
  imports: [
    MatFormFieldModule,
    CommonModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule
  ],
  templateUrl: './add-tier.component.html',
  styleUrl: './add-tier.component.css'
})
export class AddTierComponent {

  add = false;
  edit = false;
  delete = false;
  tier: string = '';
  tiereligibilitymessage: string = '';  
  tabledata: any = []
  crossmatch: any;
  crossmatcherrormessage: any;
  

  constructor(public dialog: MatDialog,
    public dialogRef: MatDialogRef<AddTierComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore) { 
      if(this.data){
        if(this.data.add) {
          this.add = this.data.add
        }
        if(this.data?.edit){
          this.edit = true;

          const tierRef = doc(this.firestore,'tier', this.data.id);

          getDoc(tierRef).then(res => {
            const tierData:any = res.data();

            this.tier = tierData?.tier || '';
            this.tiereligibilitymessage = tierData?.tiereligibilitymessage || '';
          });
        }
        if(this.data.delete) {
          this.delete = this.data.delete
        }
      }
      const tierRef = collection(this.firestore, 'tier');
      getDocs(tierRef).then((res) => {
        for(let i=0; i<res.docs.length; i++) {
          this.tabledata.push(res.docs[i].data())
        }
        console.log(this.tabledata)
      })
    }

  ngOnInit(): void {
  }

  onSubmit() {
    const tierRef = doc(collection(this.firestore, 'tier'));
    const id = tierRef.id;
    const data = {
      id: id,
      tier : this.tier,
      tiereligibilitymessage: this.tiereligibilitymessage || '',
      date : new Date()
    }
    setDoc(tierRef, data)
    .then(() => {
      console.log('Tier added:', this.tier);
      this.dialogRef.close();
    })
    .catch(err => {
      console.error('Error adding tier:', err);
    });
  }

  onEdit(id: any) {
    const tierRef = doc(collection(this.firestore, 'tier'),id);
    updateDoc(tierRef,{
      tier : this.tier,
      tiereligibilitymessage: this.tiereligibilitymessage || ''
    })
    .then(() => {
      console.log(this.tier)
      this.dialogRef.close()
    })
    .catch(err => {
      console.error('Error adding tier:', err);
    });
  }

  onDelete(id: any) {
    const tierRef = doc(collection(this.firestore, 'tier'),id);
    deleteDoc(tierRef)
    .then(() => {
      this.dialogRef.close()
    })
    .catch(err => {
      console.error('Error adding tier:', err);
    });
  }

  onClick() {
    this.dialogRef.close();
  }

  onSelect() {
    console.log(this.tabledata);

    const inputTier = (this.tier || '').trim().toLowerCase();

    const duplicateNameCheck = this.tabledata.some((e: any) => {
      const existingTier = (e.tier || '').trim().toLowerCase();
      return existingTier === inputTier;
    });

    console.log(duplicateNameCheck);
    this.crossmatch = duplicateNameCheck;
    this.crossmatcherrormessage = duplicateNameCheck ? "Given Name Already Exists" : '';
  }



}
