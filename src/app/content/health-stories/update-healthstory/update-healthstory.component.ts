import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { ref, uploadBytes, getDownloadURL, Storage } from '@angular/fire/storage';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-update-healthstory',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatOptionModule,
    CommonModule,
    MatDatepickerModule,
    MatButtonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    DragDropModule,
    MatIconModule,
    MatDialogModule
  ],
  templateUrl: './update-healthstory.component.html',
  // styleUrl: './update-healthstory.component.css'
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css']
})
export class UpdateHealthstoryComponent {

  selectedImages = []
  healthStoryForm!: FormGroup; 
  loading:boolean = false

  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dailogData,
    public dialogRef: MatDialogRef<any>,
    private domSanitizer: DomSanitizer,
    public firestore: Firestore,
    public storage: Storage
  ) {
    this.healthStoryForm = this.formbuilder.group ({
    subject: [, {validators: [Validators.required], updateOn:"change"}],
    description: [, {validators: [Validators.required], updateOn:"change"}],
    images: [[], {validators: [Validators.required], updateOn : "change"}],
    docid: [, {validators: [], updateOn:"change"}],
    delete: [false, {validators: [Validators.required], updateOn:"change"}],
  })
    var story = dailogData["story"]
    if(story != null){
      this.healthStoryForm.patchValue(story)
    }
  }

  ngOnInit() {
  }

  importImages(event: Event): void {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    
    if (files) {
      this.selectedImages = Array.from(files);
      const localURL: any[] = [];
      
      for (let i = 0; i < this.selectedImages.length; i++) {
        const element = this.selectedImages[i];
        const reader = new FileReader();
        reader.readAsDataURL(element);
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            localURL.push(this.domSanitizer.bypassSecurityTrustUrl(reader.result));
            this.healthStoryForm.patchValue({
              images: localURL
            });
          } else {
            console.log('Error reading file');
          }
        };
      }
      console.log(files, localURL);
    }
  }
  removeImage(index){
    console.log(index)
    this.selectedImages.splice(index, 1)
    var images = Object.assign([], this.healthStoryForm.get("images").value)
    images.splice(index, 1)
    this.healthStoryForm.patchValue({
      images: images
    })
  }

  async submit() {
    const storyValue = this.healthStoryForm.value;

    if (this.healthStoryForm.valid && (this.selectedImages.length > 0 || storyValue.images.length > 0)) {
      this.loading = true;
      storyValue.docid = storyValue.docid || doc(collection(this.firestore, 'health stories')).id;

      if (this.selectedImages.length > 0) {
        const imageURLList: string[] = [];

        for (let file of this.selectedImages) {
          const imageRef = ref(this.storage, `health stories/${file.name}_${file.lastModified}_${file.size}`);
          const snapshot = await uploadBytes(imageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          imageURLList.push(url);
        }

        storyValue.images = imageURLList;
      }

      const docRef = doc(this.firestore, `health stories/${storyValue.docid}`);
      await setDoc(docRef, storyValue);

      this.loading = false;
      this.close();
    } else {
      alert('Fill all required inputs.');
    }
  }


  close(){
    this.dialogRef.close(null)
  }
}
