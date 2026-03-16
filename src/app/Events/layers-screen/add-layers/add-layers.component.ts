import { Component, Inject, OnInit } from '@angular/core';
import { FormGroup, Validators, FormBuilder, FormArray, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {doc, Firestore } from '@angular/fire/firestore';
import { collection, query, getDocs, where, onSnapshot, CollectionReference, DocumentData } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { v4 as uuidv4 } from 'uuid'; 
import { setDoc, serverTimestamp } from '@angular/fire/firestore';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { getDownloadURL, getStorage, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-add-layers',
  standalone:true,
  imports:[
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
    MatDialogModule,
    MatSelectModule,
    MatIconModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './add-layers.component.html',
  styleUrls: ['./add-layers.component.css']
})
export class AddLayersComponent implements OnInit {
  layerForm: FormGroup;
  events: any = []
  event: any;
  images = []
  previewImages: any = [];
  loading:boolean = false
  imageUrls: any[];
  uploaded: boolean = false;
  url: any;
  mapEvents: any = {};

  constructor(
    private formbuilder: FormBuilder, 
    private firestore: Firestore, 
    private storage: Storage,
    @Inject(MAT_DIALOG_DATA) public dailogdata:any,
    public dialogRef: MatDialogRef<AddLayersComponent>,) { 
      this.layerForm = this.formbuilder.group ({
      title: [, {validators: [Validators.required], updateOn:"change"}],
      description:[,{validators: [Validators.required], updateOn:"change"}],
      event:[,{validators: [Validators.required], updateOn:"change"}],
      thumbnails:[,{validators: [Validators.required], updateOn:"change"}],
      sequence: [, {validators: [Validators.required], updateOn:"change"}],
      docid: [, {validators: [], updateOn:"change"}],
      additionalDescriptions: this.formbuilder.array([]) 
    })
    const eventCollectionRef = collection(this.firestore, 'event collection');
     getDocs(eventCollectionRef).then(snapshot => { 
      for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j];
        const elementData = snapshot.docs[j].data()
        this.mapEvents[element.id] = elementData
        elementData['docid'] = element.id
        this.events.push(elementData)
        console.log(this.events)
      }
    })
    var existingAccount = this.dailogdata["layerdata"]
    console.log(existingAccount);
    
    if (existingAccount != null) {
      console.log(existingAccount);
      this.layerForm.patchValue({
        title: existingAccount.title,
        event: existingAccount.eventref ? existingAccount.eventref.id : null,
        sequence : existingAccount.sequence ?? null,
        docid : existingAccount.docid
      });     
  
      if (existingAccount.images) {
        this.previewImages = existingAccount.images;
        this.images = existingAccount.images
      }

      if (Array.isArray(existingAccount.description)) {
        this.layerForm.patchValue({
            description: existingAccount.description[0] 
        });

        const additionalDescriptionsArray = this.layerForm.get('additionalDescriptions') as FormArray;
        for (let i = 1; i < existingAccount.description.length; i++) {
            additionalDescriptionsArray.push(new FormControl(existingAccount.description[i]));
        }
      } else {
        this.layerForm.patchValue({
            description: existingAccount.description
        });
      }
    }
  }

  ngOnInit(): void {
  }

  get additionalDescriptions(): FormArray {
    return this.layerForm.get('additionalDescriptions') as FormArray;
  }

  get additionalDescriptionsControls(): FormControl[] {
    return this.additionalDescriptions.controls as FormControl[];
  }

  addDescription() {
    this.additionalDescriptions.push(this.formbuilder.control('', Validators.required));
  }

  removeDescription() {
    if (this.additionalDescriptions.length > 0) {
      this.additionalDescriptions.removeAt(this.additionalDescriptions.length - 1);
    }
  }  

  returnFilterEvent(){
    return this.events.filter(
      e => e.name && e.name.toLowerCase().includes(this.event?.toLowerCase() || "")
    )
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        reader.onload = () => {
          const imageDataURL = reader.result as string;
          this.previewImages.push(imageDataURL);
        };
        reader.readAsDataURL(files[i]);
        this.images.push(files[i]);
      }
    }
    console.log(this.previewImages);
    console.log(this.images);
    
    
  }
  
  removePreview(index: number) {
    this.previewImages.splice(index, 1);
  }

  async uploadImage() {
    this.loading = true;
    var formData = this.layerForm.value;
    var descriptions = [formData.description, ...formData.additionalDescriptions];
    var title = formData.title;
    const eventref = doc(this.firestore, 'event collection', formData.event);
    const imageUrls: string[] = [];    
    var docid = formData['docid']
    var sequence = formData.sequence
    const firebaseStorage = getStorage()
    console.log(sequence)
    for (let i = 0; i < this.images.length; i++) {
        const image = this.images[i];
        console.log(image);
        const filePath = `layers_images/${Date.now()}_${image.name}`
        const fileRef = ref(firebaseStorage, filePath);
        try {
            await uploadBytes(fileRef, image); 
            const url = await getDownloadURL(fileRef)
            imageUrls.push(url)
        } catch (error) {
        console.error('Error uploading image:', error)
        }
    }
    console.log(imageUrls);
    this.saveFormData(imageUrls, descriptions, title, eventref, docid, sequence);
    this.loading = false;
    this.close()
  }

  saveFormData(imageUrls: string[], descriptions: any[], title: string, eventref: any, docid?: string, sequence?: number) {
    const id = docid ?? uuidv4();
    const docRef = doc(this.firestore, 'arenalayers', id);
    setDoc(docRef, {
      docid: id,
      createddate: serverTimestamp(),
      title: title,
      description: descriptions,
      images: imageUrls,
      delete: false,
      eventref: eventref,
      sequence: sequence
    })
    .then(() => {
      alert('Layers successfully submitted');
    })
    .catch(error => {
      console.error('Error saving form data:', error);
    });
  }

  close(){
    this.dialogRef.close(null)
  }

}
