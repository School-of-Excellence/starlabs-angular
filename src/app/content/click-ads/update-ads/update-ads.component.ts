// import { Component, Inject } from '@angular/core';
// import { collection, doc, Firestore, setDoc, updateDoc } from '@angular/fire/firestore';
// import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
// import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
// import { MatSelect, MatSelectModule } from '@angular/material/select';
// import { DomSanitizer } from '@angular/platform-browser';
// import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
// import { CommonModule } from '@angular/common';
// import { MatButtonModule } from '@angular/material/button';
// import { MatOptionModule } from '@angular/material/core';
// import { MatDatepickerModule } from '@angular/material/datepicker';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatInputModule } from '@angular/material/input';
// import { MatSelectChange } from '@angular/material/select';
// import { MatCheckboxModule } from '@angular/material/checkbox';

// @Component({
//   selector: 'app-update-ads',
//   imports: [
//     MatFormFieldModule,
//     MatInputModule,
//     FormsModule,
//     ReactiveFormsModule,
//     MatOptionModule,
//     CommonModule,
//     MatDatepickerModule,
//     MatButtonModule,
//     MatSelectModule,
//     MatCheckboxModule
//   ],
//   templateUrl: './update-ads.component.html',
//   styleUrl: './update-ads.component.css'
// })
// export class UpdateAdsComponent {

//   image = []
//   selectedThumbnail = null
//   adsForm!: FormGroup; 
//   loading:boolean = false
//   // size: [, {validators: [Validators.required], updateOn:"change"}],
//   // image_url: [, {validators: [Validators.required], updateOn:"change"}],
//   ratioList = ["w16h9","w9h16","w4h5","w5h4","w1h1"]
//   constructor(
//     public formbuilder: FormBuilder,
//     @Inject(MAT_DIALOG_DATA) public dailogData,
//     public dialogRef: MatDialogRef<any>,
//     private domSanitizer: DomSanitizer,
//     public firestore: Firestore,
//     public storage: Storage
//   ) {
//     this.adsForm = this.formbuilder.group ({
//     paymentlink: [, {validators: [], updateOn:"change"}],
//     delete: [false, {validators: [Validators.required], updateOn:"change"}],
//     calltoaction :[null,{validators: [Validators.required], updateOn:"change"}],
//     displayscreen : [null,{validators: [Validators.required], updateOn:"change"}],
//     startdate:[null,{validators: [Validators.required], updateOn:"change"}],
//     enddate:[null,{validators: [Validators.required], updateOn:"change"}],
//     deeplinkinternal:[null,{validators: [], updateOn:"change"}],
//     deeplink : [false, {validators: [Validators.required], updateOn:"change"}]
//   })
//     var existingAd = this.dailogData["addata"]
//     if(existingAd != null){
//       console.log(existingAd)
//       // this.adsForm.patchValue(existingAd)
//       this.adsForm.patchValue({
//         paymentlink:existingAd.paymentlink,
//         delete:existingAd.delete,
//         calltoaction:existingAd.calltoaction ?? null,
//         displayscreen:existingAd.displayscreen ?? null,
//         startdate : existingAd.startdate != undefined ? existingAd.startdate.toDate() : null,
//         enddate : existingAd.enddate != undefined ? existingAd.enddate.toDate() : null,
//         deeplinkinternal : existingAd.deeplinkinternal ?? null,
//         deeplink:existingAd.deeplink ?? null
//       })
//       if(existingAd.image != undefined){
//         this.image = []
//         for (const key in existingAd.image) {
//           let width = key.replace(/[wh]/g,"/").split("/")[1]
//           let height = key.replace(/[wh]/g,"/").split("/")[2]
//           this.image.push({
//             w:width,
//             h:height,
//             file:null,
//             fileurl:null,
//             url:existingAd.image[key],
//             name:key
//           })
//         }
//       }else{
//         // this.image[0].url = existingAd.image_url ?? null
//         this.image.push({
//           w:null,
//           h:null,
//           file:null,
//           fileurl:null,
//           url:existingAd.image_url ?? null,
//           name:null
//         })
//       }
//     }
//   }

//   ngOnInit(): void {
//   }

//   onAddNewRatio(event: MatSelectChange): void {
//     const selectedValue = event.value;
//     console.log(selectedValue);

//     const width = selectedValue.replace(/[wh]/g, "/").split("/")[1];
//     const height = selectedValue.replace(/[wh]/g, "/").split("/")[2];

//     if (!this.image.some(e => e.w === width && e.h === height)) {
//       this.image.push({
//         w: width,
//         h: height,
//         file: null,
//         fileurl: null,
//         url: null,
//         name: null
//       });
//     }
//   }


//   onUpdateWidthAndHeight(index){
//     this.image[index].name = `w${this.image[index].w}h${this.image[index].h}`
//     console.log(this.image[index].name);
//   }

//   onRemoveImage(index: number): void {
//     const imageToRemove = this.image[index];
//     if (imageToRemove?.url) {
//       const fileRef = ref(this.storage, imageToRemove.url);
//     deleteObject(fileRef)
//       .then(() => {
//         console.log('Image deleted from storage:', imageToRemove.url);
//       })
//       .catch((error) => {
//         console.error('Error deleting image:', error);
//       });
//     }

//     this.image.splice(index, 1);
//   }

//   importImages(imported,index){
//     this.image[index].file = imported.target.files[0]
//     const reader = new FileReader();
//     reader.readAsDataURL(this.image[index].file)
//     reader.onload = () => {
//       if(typeof reader.result === 'string') {
//         this.image[index].fileurl = this.domSanitizer.bypassSecurityTrustUrl(reader.result)
//       } else {
//         console.log(Error)
//       }
//     }
//     this.image[index].name = `w${this.image[index].w}h${this.image[index].h}`

//   }

//   removeImage(index){
//     if(this.image[index].url != null){
//       const fileRef = ref(this.storage, this.image[index].url);
//       deleteObject(fileRef).then(()=>{
//         this.image[index].url = null
//       })
//     }
//     this.image[index].fileurl = null
//     this.image[index].file = null
//   }

//   async submit(){
//     var adValue = this.adsForm.value
//     this.loading = true
//     let validate = true
//     for (let i = 0; i < this.image.length; i++) {
//       const element = this.image[i];
//       if([null,undefined].includes(element.w) || [null,undefined].includes(element.w)){
//         validate = false
//         alert("please give value to width & height")
//       }
//       if([null,undefined].includes(element.file) && [null,undefined].includes(element.url)){
//         validate = false
//         alert("please select a image")
//       }
//     }
//     if(validate === true){
//       await this.uploadingimages()
//       let imageresult = {}
//       for (let i = 0; i < this.image.length; i++) {
//         const element = this.image[i];
//         imageresult[element['name']] = element.url
//       }
//       console.log(imageresult);
//       adValue["image"] = imageresult
//       const adsCollection = collection(this.firestore, "ads");
//       if([null,undefined].includes(this.dailogData["addata"])){
//         console.log("oncreate");
//         const newDocRef = doc(adsCollection);
//         adValue["docid"] = newDocRef.id;
//         await setDoc(newDocRef, adValue);

//       }else{
//         const existingDocRef = doc(this.firestore, `ads/${this.dailogData.addata.docid}`);
//         await updateDoc(existingDocRef, adValue);
//       }
//       this.loading = false;
//       this.close();
//     }else{
//       this.loading = false
//     }
//   }


//   async uploadingimages(): Promise<void> {
//     for (let i = 0; i < this.image.length; i++) {
//       const element = this.image[i];
//       if (element?.file) {
//         try {
//           console.log("Uploading file");
//           const timestamp = new Date().toISOString();
//           const imagePath = `ads/${timestamp}_${element.name}_${element.file.name}`;
//           console.log(imagePath);
//           const fileRef = ref(this.storage, imagePath);
//           const uploadSnapshot = await uploadBytes(fileRef, element.file);
//           if (element.url) {
//             try {
//               const oldFileRef = ref(this.storage, element.url);
//               await deleteObject(oldFileRef);
//               console.log("Old image deleted");
//             } catch (deleteErr) {
//               console.warn("Failed to delete old image:", deleteErr);
//             }
//           }

//           const url = await getDownloadURL(uploadSnapshot.ref);
//           this.image[i].url = url;

//         } catch (uploadErr) {
//           console.error("Error uploading file:", uploadErr);
//         }
//       }
//     }
//   }


//   close(){
//     this.dialogRef.close(null)
//   }


// }


import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer } from '@angular/platform-browser';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-update-ads',
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
    MatIconModule,
    MatDialogModule,
  ],
  templateUrl: './update-ads.component.html',
  // styleUrl: '../../audio-dashboard/audio-shared.css'
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css']
})
export class UpdateAdsComponent {

  image: any[] = [];
  selectedThumbnail = null;
  adsForm!: FormGroup;
  loading: boolean = false;
  ratioList = ['w16h9', 'w9h16', 'w4h5', 'w5h4', 'w1h1'];

  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dailogData: any,
    public dialogRef: MatDialogRef<any>,
    private domSanitizer: DomSanitizer,
    public firestore: Firestore,
    public storage: Storage
  ) {
    this.adsForm = this.formbuilder.group({
      paymentlink: [, { validators: [], updateOn: 'change' }],
      delete: [false, { validators: [Validators.required], updateOn: 'change' }],
      calltoaction: [null, { validators: [Validators.required], updateOn: 'change' }],
      displayscreen: [null, { validators: [Validators.required], updateOn: 'change' }],
      startdate: [null, { validators: [Validators.required], updateOn: 'change' }],
      enddate: [null, { validators: [Validators.required], updateOn: 'change' }],
      deeplinkinternal: [null, { validators: [], updateOn: 'change' }],
      deeplink: [false, { validators: [Validators.required], updateOn: 'change' }],
    });

    var existingAd = this.dailogData['addata'];
    if (existingAd != null) {
      this.adsForm.patchValue({
        paymentlink: existingAd.paymentlink,
        delete: existingAd.delete,
        calltoaction: existingAd.calltoaction ?? null,
        displayscreen: existingAd.displayscreen ?? null,
        startdate: existingAd.startdate != undefined ? existingAd.startdate.toDate() : null,
        enddate: existingAd.enddate != undefined ? existingAd.enddate.toDate() : null,
        deeplinkinternal: existingAd.deeplinkinternal ?? null,
        deeplink: existingAd.deeplink ?? null,
      });
      if (existingAd.image != undefined) {
        this.image = [];
        for (const key in existingAd.image) {
          let width = key.replace(/[wh]/g, '/').split('/')[1];
          let height = key.replace(/[wh]/g, '/').split('/')[2];
          this.image.push({
            w: width,
            h: height,
            file: null,
            fileurl: null,
            url: existingAd.image[key],
            name: key,
          });
        }
      } else {
        this.image.push({
          w: null,
          h: null,
          file: null,
          fileurl: null,
          url: existingAd.image_url ?? null,
          name: null,
        });
      }
    }
  }

  ngOnInit(): void {}

  onAddNewRatio(event: MatSelectChange): void {
    const selectedValue = event.value;
    const width = selectedValue.replace(/[wh]/g, '/').split('/')[1];
    const height = selectedValue.replace(/[wh]/g, '/').split('/')[2];
    if (!this.image.some((e: any) => e.w === width && e.h === height)) {
      this.image.push({
        w: width,
        h: height,
        file: null,
        fileurl: null,
        url: null,
        name: null,
      });
    }
  }

  onUpdateWidthAndHeight(index: number) {
    this.image[index].name = `w${this.image[index].w}h${this.image[index].h}`;
  }

  onRemoveImage(index: number): void {
    const imageToRemove = this.image[index];
    if (imageToRemove?.url) {
      const fileRef = ref(this.storage, imageToRemove.url);
      deleteObject(fileRef)
        .then(() => console.log('Image deleted from storage:', imageToRemove.url))
        .catch((error: any) => console.error('Error deleting image:', error));
    }
    this.image.splice(index, 1);
  }

  importImages(imported: any, index: number) {
    this.image[index].file = imported.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.image[index].file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.image[index].fileurl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
      }
    };
    this.image[index].name = `w${this.image[index].w}h${this.image[index].h}`;
  }

  removeImage(index: number) {
    if (this.image[index].url != null) {
      const fileRef = ref(this.storage, this.image[index].url);
      deleteObject(fileRef).then(() => {
        this.image[index].url = null;
      });
    }
    this.image[index].fileurl = null;
    this.image[index].file = null;
  }

  async submit() {
    var adValue = this.adsForm.value;
    this.loading = true;
    let validate = true;
    for (let i = 0; i < this.image.length; i++) {
      const element = this.image[i];
      if ([null, undefined].includes(element.w) || [null, undefined].includes(element.h)) {
        validate = false;
        alert('Please provide width & height values');
      }
      if ([null, undefined].includes(element.file) && [null, undefined].includes(element.url)) {
        validate = false;
        alert('Please select an image');
      }
    }
    if (validate === true) {
      await this.uploadingimages();
      let imageresult: any = {};
      for (let i = 0; i < this.image.length; i++) {
        const element = this.image[i];
        imageresult[element['name']] = element.url;
      }
      adValue['image'] = imageresult;
      const adsCollection = collection(this.firestore, 'ads');
      if ([null, undefined].includes(this.dailogData['addata'])) {
        const newDocRef = doc(adsCollection);
        adValue['docid'] = newDocRef.id;
        await setDoc(newDocRef, adValue);
      } else {
        const existingDocRef = doc(this.firestore, `ads/${this.dailogData.addata.docid}`);
        await updateDoc(existingDocRef, adValue);
      }
      this.loading = false;
      this.close();
    } else {
      this.loading = false;
    }
  }

  async uploadingimages(): Promise<void> {
    for (let i = 0; i < this.image.length; i++) {
      const element = this.image[i];
      if (element?.file) {
        try {
          const timestamp = new Date().toISOString();
          const imagePath = `ads/${timestamp}_${element.name}_${element.file.name}`;
          const fileRef = ref(this.storage, imagePath);
          const uploadSnapshot = await uploadBytes(fileRef, element.file);
          if (element.url) {
            try {
              const oldFileRef = ref(this.storage, element.url);
              await deleteObject(oldFileRef);
            } catch (deleteErr) {
              console.warn('Failed to delete old image:', deleteErr);
            }
          }
          const url = await getDownloadURL(uploadSnapshot.ref);
          this.image[i].url = url;
        } catch (uploadErr) {
          console.error('Error uploading file:', uploadErr);
        }
      }
    }
  }

  close() {
    this.dialogRef.close(null);
  }
}