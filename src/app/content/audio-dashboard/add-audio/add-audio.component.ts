import { Component, Inject } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, Storage, UploadTask, uploadBytes } from '@angular/fire/storage';
import { MatFormFieldModule, MatHint } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatChipsModule, MatChipSet, MatChipRow, MatChipRemove } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-add-audio',
  imports: [
    MatFormFieldModule,
    CommonModule,
    MatInputModule,
    ReactiveFormsModule,
    FormsModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule
],
  templateUrl: './add-audio.component.html',
  // styleUrl: './add-audio.component.css'
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css']

})
export class AddAudioComponent {
  audioUrl!: any;
  file!: File;
  File!: File;
  image!: File;
  task!: UploadTask;
  fileName : any 
  description: any
  hlsurl: any
  dialogtitle:string | undefined
  deleteTitle: any
  editTitle: any
  crossmatch: boolean | undefined
  crossmatcherrormessage!: string | boolean;
  delete = false
  edit = false
  add = false
  errormessage : string | undefined
  tabledata :any[]=[]
  // uploadProgress? : number 
  imageUrl: any;
isUploading = false
  uploadProgress = 0
  tags = []
  mapTaxonomy = {}
  taxonomyList = []
  taxonomySubscription:Subscription
  filteredTaxonomyList:any [] = []
  private subscription = new Subject<void>();

  getloading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg : "loading...."},disableClose:true})
  }

  constructor(public dialog: MatDialog, 
    public dialogRef: MatDialogRef<AddAudioComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any, private storage: Storage, 
    // public dialogref: MatDialogRef<LoadingComponent>,
    private fb: FormBuilder,
    private firestore: Firestore,
    private domSanitizer: DomSanitizer) { 
      {
        if(this.data){
          if(this.data.delete){
            this.deleteTitle = "Are you sure want to delete this audio?"
            this.delete = this.data.delete
          }if(this.data.edit){
            this.editTitle = "Edit Audio"
            this.edit = this.data.edit
            this.fileName = this.data.name
            this.audioUrl = this.data.url
            this.description = this.data.description
            this.hlsurl = this.data.hlsurl
            this.imageUrl = this.data.imageUrl
            this.tags = this.data.tags ?? []
            // console.log(this.tags);
          }if(this.data.add){
            this.add = this.data.add
          }
        }
      }
      const solarvoiceaudiosref = collection(this.firestore,'solar voice audios')
      getDocs(solarvoiceaudiosref).then((res)=>{
        for(let i=0;i<res.docs.length; i++){
          this.tabledata.push(res.docs[i].data())
          // console.log(this.tabledata)
        }
      })
      const atctaxonomyRef = collection(this.firestore, "atc taxonomy");  
      collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snap => {
        let snapshot = snap.map(doc => ({id:doc.id,...doc.data()}))
        this.taxonomyList = snapshot
        for (let i = 0; i < snapshot.length; i++) {
          const element = snapshot[i];
          this.mapTaxonomy[element['id']] = element['name']
        }
        this.filteredTaxonomyList = this.taxonomyList
      })
    }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  previewAudio(event: any) {
    this.file = event.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.audioUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
      } else {
        console.log(Error)
      }
    };
  }

  previewImage(event: any) {
    this.image = event.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.image);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.imageUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
  
      } else {
        console.log(Error)
      }
    };
  }
  

async startUpload() {
    this.isUploading = true;
    this.uploadProgress = 0;
    this.dialogRef.disableClose = true;

    try {
      const audioFilePath = `solar voice audios/${Date.now()}_${this.file.name}`;
      const audioFileRef = ref(this.storage, audioFilePath);

      const url = await this.uploadWithProgress(audioFileRef, this.file, 0, this.image ? 80 : 100);

      let imageUrl = null;
      if (this.image) {
        const imageFilePath = `solar voice images/${Date.now()}_${this.image.name}`;
        const imageFileRef = ref(this.storage, imageFilePath);
        imageUrl = await this.uploadWithProgress(imageFileRef, this.image, 80, 100);
      }

      await this.saveDataToFirestore(url, imageUrl, this.fileName, this.description, this.hlsurl);
      this.uploadProgress = 100;
      this.dialogRef.close();
    } catch (error) {
      console.error("Error during upload:", error);
      this.isUploading = false;
      this.dialogRef.disableClose = false;
    }
  }

  private uploadWithProgress(fileRef: any, file: File, rangeStart: number, rangeEnd: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file);
      task.on('state_changed',
        (snapshot) => {
          const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          this.uploadProgress = Math.round(rangeStart + (fileProgress / 100) * (rangeEnd - rangeStart));
        },
        (error) => reject(error),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        }
      );
    });
  }
  private getSizeInfo(file: File) {
    const bytes = file.size;
    const mb = (bytes / (1024 * 1024)).toFixed(2);

    return {
      sizeBytes: bytes,
      size: `${mb} MB`
    };
  }

  async saveDataToFirestore(url: string, imageUrl: string, fileName: any, description: any, hlsurl:any) {
    console.log(fileName)
    const solarvoiceaudiosRef = collection(this.firestore, 'solar voice audios');
    const docRef = doc(solarvoiceaudiosRef);
    let id = docRef.id;
    const sizeInfo = this.getSizeInfo(this.file);
    await setDoc(docRef,{
      id: id,
      name: fileName,
      url: url,
      imageUrl: imageUrl || null,
      description: description,
      hlsurl:hlsurl || null,
      date: new Date(),
      tags:this.tags,
      size: sizeInfo.size,
      sizeBytes: sizeInfo.sizeBytes
    });
  }
  
  onNoClick(): void {
    this.dialogRef.close();
  }
  async onedit(id: string, fileName: string, description: string, file, image, hlsurl: string) {
    this.isUploading = true;
    this.uploadProgress = 0;
    this.dialogRef.disableClose = true;

    try {
      if (this.audioUrl != this.data.url && !this.image) {
        const sizeInfo = this.getSizeInfo(this.file);
        const fileRef = ref(this.storage, `solar voice audios/${Date.now()}_${this.file.name}`);
        const url = await this.uploadWithProgress(fileRef, this.file, 0, 90);
        this.uploadProgress = 90;
        await updateDoc(doc(this.firestore, 'solar voice audios', id), {
          url: url, name: fileName, description: description,
          hlsurl: hlsurl || null, tags: this.tags,
          size: sizeInfo.size, sizeBytes: sizeInfo.sizeBytes
        });
        if (this.data.url) {
          await deleteObject(ref(this.storage, this.data.url));
        }

      } else if (this.audioUrl != this.data.url && this.image) {
        const sizeInfo = this.getSizeInfo(this.file);
        const audioFileRef = ref(this.storage, `solar voice audios/${Date.now()}_${this.file.name}`);
        const url = await this.uploadWithProgress(audioFileRef, this.file, 0, 60);
        const imageFileRef = ref(this.storage, `solar voice images/${Date.now()}_${this.image.name}`);
        const imageUrl = await this.uploadWithProgress(imageFileRef, this.image, 60, 90);
        this.uploadProgress = 90;
        await updateDoc(doc(this.firestore, 'solar voice audios', id), {
          url: url, imageUrl: imageUrl, name: fileName, description: description,
          hlsurl: hlsurl || null, tags: this.tags,
          size: sizeInfo.size, sizeBytes: sizeInfo.sizeBytes
        });
        if (this.data.url) {
          await deleteObject(ref(this.storage, this.data.url));
        }
        if (this.data.imageUrl) {
          await deleteObject(ref(this.storage, this.data.imageUrl));
        }

      } else if (this.audioUrl === this.data.url && this.imageUrl !== this.data.imageUrl && this.image) {
        const imageFileRef = ref(this.storage, `solar voice images/${Date.now()}_${this.image.name}`);
        const imageUrl = await this.uploadWithProgress(imageFileRef, this.image, 0, 90);
        this.uploadProgress = 90;
        await updateDoc(doc(this.firestore, 'solar voice audios', id), {
          imageUrl: imageUrl, name: fileName, description: description,
          hlsurl: hlsurl || null, tags: this.tags
        });
        if (this.data.imageUrl) {
          await deleteObject(ref(this.storage, this.data.imageUrl));
        }

      } else if (this.audioUrl === this.data.url && this.imageUrl === this.data.imageUrl) {
        this.uploadProgress = 50;
        await updateDoc(doc(this.firestore, 'solar voice audios', id), {
          name: fileName, description: description,
          hlsurl: hlsurl || null, tags: this.tags
        });
      }

      this.uploadProgress = 100;
      this.dialogRef.close();
    } catch (error) {
      console.error("Error during edit:", error);
      this.isUploading = false;
      this.dialogRef.disableClose = false;
    }
  }
  // async onedit(id:string,fileName:string,description:string,file,image,hlsurl:string) {
  //   let loadingref = this.getloading();
  //   if(this.audioUrl != this.data.url && !this.image){
  //     const sizeInfo = this.getSizeInfo(this.file);
  //     console.log('If audioUrl has changed but no image was uploaded')
  //     const fileRef = ref(this.storage, `solar voice audios/${Date.now()}_${this.file.name}`);
  //     await uploadBytes(fileRef, this.file).then(async () => {
  //       const url = await getDownloadURL(fileRef);
  //       await updateDoc(doc(this.firestore, 'solar voice audios', id), {
  //         url: url,
  //         name: fileName,
  //         description: description,
  //         hlsurl: hlsurl || null,
  //         tags: this.tags,
  //         size: sizeInfo.size,
  //         sizeBytes: sizeInfo.sizeBytes
  //       });
  //       if (this.data.url) {
  //         const oldAudioRef = ref(this.storage, this.data.url);
  //         await deleteObject(oldAudioRef);
  //       }
  //     }).catch((error) => {
  //       console.error("Error uploading file or updating Firestore:", error);
  //     });
  //   }else if(this.audioUrl != this.data.url && this.image) {
  //     const sizeInfo = this.getSizeInfo(this.file);
  //     console.log('If audioUrl has changed and an image was uploaded')
  //     const audioFileRef = ref(this.storage, `solar voice audios/${Date.now()}_${this.file.name}`);
  //     await uploadBytes(audioFileRef, this.file).then(async () => {
  //       const url = await getDownloadURL(audioFileRef);
  //       const imageFileRef = ref(this.storage, `solar voice images/${Date.now()}_${this.image.name}`);
  //       await uploadBytes(imageFileRef, this.image).then(async () => {
  //         const imageUrl = await getDownloadURL(imageFileRef);
  //         await updateDoc(doc(this.firestore, 'solar voice audios', id), {
  //           url: url,
  //           imageUrl: imageUrl,
  //           name: fileName,
  //           description: description,
  //           hlsurl: hlsurl || null,
  //           tags: this.tags,
  //           size: sizeInfo.size,
  //           sizeBytes: sizeInfo.sizeBytes
  //         });
  //         if (this.data.url) {
  //           const oldAudioRef = ref(this.storage, this.data.url);
  //           await deleteObject(oldAudioRef);
  //         }
  //         if (this.data.imageUrl) {
  //           const oldImageRef = ref(this.storage, this.data.imageUrl);
  //           await deleteObject(oldImageRef);
  //         }
  //       }).catch((error) => {
  //         console.error("Error uploading image:", error);
  //       });
  //     }).catch((error) => {
  //       console.error("Error uploading audio file:", error);
  //     });
  //   }else if(this.audioUrl === this.data.url && this.imageUrl !== this.data.imageUrl && this.image) {
  //     console.log('If audioUrl has not changed but a new image was uploaded')
  //     // If audioUrl hasn't changed but a new image was uploaded
  //     const imageFileRef = ref(this.storage, `solar voice images/${Date.now()}_${this.image.name}`);
  //     await uploadBytes(imageFileRef, this.image).then(async () => {
  //       const imageUrl = await getDownloadURL(imageFileRef);
  //       await updateDoc(doc(this.firestore, 'solar voice audios', id), {
  //         imageUrl: imageUrl,
  //         name: fileName,
  //         description: description,
  //         hlsurl: hlsurl || null,
  //         tags: this.tags
  //       });
  //       if (this.data.imageUrl) {
  //         const oldImageRef = ref(this.storage, this.data.imageUrl);
  //         await deleteObject(oldImageRef);
  //       }
  //     }).catch((error) => {
  //       console.error("Error uploading image or updating Firestore:", error);
  //     });
  //   }else if(this.audioUrl === this.data.url && this.imageUrl === this.data.imageUrl) {
  //     console.log('If audioUrl has not changed and no new image was uploaded')
  //     // If audioUrl hasn't changed and no new image was uploaded
  //     await updateDoc(doc(this.firestore, 'solar voice audios', id), {
  //       name: fileName,
  //       description: description,
  //       hlsurl:hlsurl || null,
  //       tags:this.tags
  //     })
  //   }
  //   loadingref.close();
  //   this.dialogRef.close();    
  // }


  async ondelete(id: any,url:any,imageurl:any){
    if(this.data.delete){
      try {
        const audioRef = ref(this.storage, url)
        await deleteObject(audioRef)
        await deleteDoc(doc(this.firestore,'solar voice audios',id))
        if (imageurl) {
          const imageRef = ref(this.storage,imageurl)
          await deleteObject(imageRef)
        }
      } catch (error) {
        console.error(error);
      }
    }
    this.dialogRef.close()  
  }

  onselect(){
    let name = this.fileName
    const duplicateNameCheck = this.tabledata.some(e=>e.name.trim().toLowerCase() === name.trim().toLowerCase())
    this.crossmatch = duplicateNameCheck
    this.crossmatcherrormessage =  duplicateNameCheck ? "Given Name Already Exit": false

  }

  onselectchange(){
    let name = this.fileName
    const duplicateNameCheck = this.tabledata.some(e=>e.name.trim().toLowerCase() === name.trim().toLowerCase())
    this.crossmatch = duplicateNameCheck
    this.crossmatcherrormessage =  duplicateNameCheck ? "Given Name Already Exit": false
  }

  onTagSearch(event){
    let value = ![null,undefined,""].includes(event.target.value) ? event.target.value.trim().toLowerCase() :""
    this.filteredTaxonomyList = this.taxonomyList.filter(e => e['name'].toLowerCase().indexOf(value) === 0)
  }

  onTagSelect(tagid){
    this.tags.push(tagid)
    this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id))
  }

  onTagRemove(index){
    this.tags.splice(index,1)
    this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id))
  }

}
