import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Firestore, collection, doc, setDoc, updateDoc, serverTimestamp, DocumentReference } from '@angular/fire/firestore';

@Component({
  selector: 'app-workshop-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './workshop-category.component.html',
  styleUrl: './workshop-category.component.css'
})
export class WorkshopCategoryComponent {
  nameControl = new FormControl('', [Validators.required, Validators.minLength(2)]);
  descriptionControl = new FormControl('', [Validators.required, Validators.minLength(2)]);
  isEditMode = false;
  categoryId: string | null = null;
  workshopid: string | null = null;

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<WorkshopCategoryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.workshopid = data?.workshopid;
    if (data?.workshopid === 'edit' && data?.category) {
      this.isEditMode = true;
      this.categoryId = data.category.id;
      this.nameControl.setValue(data.category.name);
      this.descriptionControl.setValue(data.category.description);
    }
  }

  async saveCategory() {
    if (this.nameControl.value?.trim()) {
      try {
        if (this.isEditMode && this.categoryId) {
          const categoryRef = doc(this.firestore, 'workshopcategory', this.categoryId);
          await updateDoc(categoryRef, {
            name: this.nameControl.value.trim(),
            description: this.descriptionControl.value.trim()
          });
          console.log('Category updated with ID: ', this.categoryId);
        } else {
          const workshopCategoryRef = collection(this.firestore, 'workshopcategory');
          const docRef = doc(workshopCategoryRef);
          await setDoc(docRef, {
            name: this.nameControl.value.trim(),
            description: this.descriptionControl.value.trim(),
            created: serverTimestamp(),
            docid: docRef.id,
            workshopid : this.workshopid
          });
          console.log('Category created with ID: ', docRef.id);
        }

        this.dialogRef.close({ name: this.nameControl.value.trim() });
      } catch (error) {
        console.error('Error saving category: ', error);
      }
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}
