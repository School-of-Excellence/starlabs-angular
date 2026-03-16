import { Component, Inject } from '@angular/core';
import { FormGroup, Validators, FormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { collection, collectionSnapshots, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, orderBy, query, runTransaction, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-add-notes',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
  ],
  templateUrl: './add-notes.component.html',
  styleUrl: './add-notes.component.css'
})
export class AddNotesComponent {
  notesform!:FormGroup
  notes=[]
  loading=true

  constructor(
    public dialogRef: MatDialogRef<AddNotesComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    public formbuilder: FormBuilder,
    public dialog: MatDialog,
    private firestore:Firestore,
    private snackBar: MatSnackBar
  ) {
    this.notesform = this.formbuilder.group({
      notes:[,{validators:[Validators.required], updateOn:"change"}],
    })
   }

  ngOnInit(): void {
  }

  onsubmit(value){
    this.dialogRef.close(value.notes);
  }
  close(value){
    this.dialogRef.close(value.notes);
  }
}
