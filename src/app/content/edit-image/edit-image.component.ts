import { Component, Inject } from '@angular/core';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { collection, doc, Firestore, updateDoc } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask } from '@angular/fire/storage';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';


@Component({
  selector: 'app-edit-image',
  imports: [
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './edit-image.component.html',
  styleUrl: './edit-image.component.css'
})
export class EditImageComponent {

  imageUrl!: any;
  file!: File;
  task!: UploadTask;
  edit = false
  add = false

  getloading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:"upoading please wait...."},disableClose:true})
  }

  constructor( public dialog: MatDialog,public dialogRef: MatDialogRef<EditImageComponent>,@Inject(MAT_DIALOG_DATA) public data: any,
    private domSanitizer: DomSanitizer,private storage: Storage,private firestore: Firestore){ 
    if(this.data){
      if(this.data.edit){
        this.edit = this.data.edit
        this.imageUrl = this.data.imageurl
      }
    }
  }

  ngOnInit(): void {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  previewImage(event: any) {
    this.file = event.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.imageUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
      } else {
        console.log(Error)
      }
    };
  }

  async onedit(id: any, imageUrl: string, file: File){
    let loadingref = this.getloading();
    const filePath = `solar voice images/${Date.now()}_${file.name}`;
    const imageRef = ref(this.storage, filePath);
    try {
      await uploadBytes(imageRef, file);
      const newImageUrl = await getDownloadURL(imageRef);
      if (imageUrl) {
        const oldImageRef = ref(this.storage, imageUrl);
        await deleteObject(oldImageRef);
        console.log("Successfully deleted", imageUrl);
      }
      await this.saveImageToFirestore(newImageUrl, id);
    } catch (error) {
      console.error(error);
    } finally {
      loadingref.close();
      this.dialogRef.close();
    }
  }


  async saveImageToFirestore(imageurl: string, id:any){
    const solarvoiceplaylistRef = doc(this.firestore,"solar voice playlist",id)
    await updateDoc(solarvoiceplaylistRef,{
        imageurl : imageurl,
    }).then(() => {
        this.data.imageurl = imageurl
        console.log("document successfully updated");          
    }).catch(err=>{
        console.log(err);       
    })
  }

}
