import { Component, Inject } from '@angular/core';
import { LoadingComponent } from '../../../DialogBox/loading/loading.component';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask, uploadBytesResumable, fromTask } from '@angular/fire/storage';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject, Observable, finalize } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-add-episode',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './add-episode.component.html',
  styleUrl: './add-episode.component.css'
})
export class AddEpisodeComponent {

  add = false
  edit = false
  delete = false
  title : any
  description : any
  videoUrl : any
  imageUrl : any
  video! : File
  File!: File;
  image! : File
  tabledata : any = []
  crossmatch: any;
  crossmatcherrormessage: any;

  getloading(){
    return this.dialog.open(LoadingComponent,{disableClose:true})
  }

  task: UploadTask; 
  videoProgress$ = new BehaviorSubject<number>(0);
  imageProgress$ = new BehaviorSubject<number>(0);



  constructor(
    public dialog: MatDialog, 
    public dialogRef: MatDialogRef<AddEpisodeComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private domSanitizer: DomSanitizer,
    private storage: Storage,
    private firestore: Firestore) {
      if(this.data){
        if(this.data.add) {
          this.add = this.data.add
        }
        if(this.data.edit) {
          this.edit = this.data.edit
          console.log(this.data.id)
          this.title = this.data.title
          console.log(this.data.title)
          this.description = this.data.description
          this.imageUrl = this.data.imageUrl
          console.log(this.data.imageUrl)
          this.videoUrl = this.data.videoUrl
          console.log(this.data.videoUrl)
        }
        if(this.data.delete) {
          this.delete = this.data.delete
        }
      }
      getDocs(collection(this.firestore,"episodes")).then((res) => {
        for(let i=0; i<res.docs.length; i++){
           this.tabledata.push(res.docs[i].data())
          //  console.log(this.tabledata)
        }
      })
      }

  ngOnInit(): void {
  }

previewVideo(event: any) {
  this.video = event.target.files[0];
  console.log(this.video)
  const reader = new FileReader();
  reader.readAsDataURL(this.video);
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      this.videoUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);

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
    if(typeof reader.result === 'string') {
      this.imageUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
    } else {
      console.log(Error)
    }
   }
}

// onSubmit(){
  
//   let loadingref = this.getloading();
//   const videoFilePath = `episodes/${Date.now()}_${this.video.name}`;
//   console.log(this.video)
//   const videoTask = this.storage.upload(videoFilePath, this.video);
//   videoTask.snapshotChanges().pipe(
//     finalize(() => {
//       this.storage.ref(videoFilePath).getDownloadURL().subscribe(videoUrl => {
//         console.log(videoUrl)
//         const imageFilePath = `images/${Date.now()}_${this.image.name}`;
//         const imageTask = this.storage.upload(imageFilePath, this.image);
//         imageTask.snapshotChanges().pipe(
//           finalize(() => {
//             this.storage.ref(imageFilePath).getDownloadURL().subscribe(imageUrl => {
//               console.log(imageUrl)
//               this.saveDataToFirestore(videoUrl,imageUrl,this.title,this.description)
//               loadingref.close();
//             })
//           })
//         ).subscribe();
//       })
//     })
//   ).subscribe();
//   // this.dialogRef.close();
// }

// saveDataToFirestore(videoUrl: string,imageUrl: string,title: any, description: any) {
//   console.log(title)
//   let id = this.firestore.createId();
//   this.firestore.doc('/episodes/' + id).set({
//     id: id,
//     title: title,
//     videoUrl: videoUrl,
//     imageUrl : imageUrl,
//     description: description,
//     date: firebase.firestore.FieldValue.serverTimestamp(),
//   });
//   console.log(videoUrl)
// }
  getVideoDuration(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';

      videoElement.onloadedmetadata = () => {
        const durationInSeconds = videoElement.duration;
        const minutes = Math.floor(durationInSeconds / 60);
        const seconds = Math.floor(durationInSeconds % 60);
        const formattedDuration = `${minutes.toString().padStart(2, '0')}.${seconds.toString().padStart(2, '0')}`;
        resolve(formattedDuration);
      };

      videoElement.onerror = (e) => {
        reject('Failed to load video metadata');
      };

      videoElement.src = URL.createObjectURL(file);
    });
  }

  onSubmit() {
    const loadingref = this.getloading();
    const videoPath = `episodes/${Date.now()}_${this.video.name}`;
    const imagePath = `images/${Date.now()}_${this.image.name}`;
    const videoRef = ref(this.storage, videoPath);
    const videoTask = uploadBytesResumable(videoRef, this.video);
    const videoTask$ = fromTask(videoTask);
    videoTask$.subscribe(snapshot => {
      this.videoProgress$.next((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
    });

    videoTask$.pipe(
      finalize(async () => {
        const videoUrl = await getDownloadURL(videoRef);
        console.log('Video URL:', videoUrl);
        const duration = await this.getVideoDuration(this.video);
        console.log('Duration:', duration);

        const imageRef = ref(this.storage, imagePath);
        const imageTask = uploadBytesResumable(imageRef, this.image);
        const imageTask$ = fromTask(imageTask);

        imageTask$.subscribe(snapshot => {
          this.imageProgress$.next((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        });
        imageTask$.pipe(
          finalize(async () => {
            const imageUrl = await getDownloadURL(imageRef);
            console.log('Image URL:', imageUrl);
            this.saveDataToFirestore(videoUrl, imageUrl, this.title, this.description, duration);
            loadingref.close();
          })
        ).subscribe();
      })
    ).subscribe();
  }

  saveDataToFirestore(videoUrl: string, imageUrl: string, title: any, description: any,duration: string) {
    console.log(title);
    let id = doc(collection(this.firestore,'episodes')).id
    setDoc(doc(this.firestore,"episodes",id),{
      id: id,
      title: title,
      videoUrl: videoUrl,
      imageUrl: imageUrl,
      description: description,
      duration: duration,
      date: new Date()
    });
    console.log(videoUrl);
    this.dialogRef.close();
  }



  async onEdit(id: any) {
    if (!this.data.edit) return;
    const loadingref = this.getloading();
    try {
      const episodeDocRef = doc(this.firestore, "episodes", id);
      const title = this.title;
      const description = this.description;
      let updatedData: any = {
        title,
        description,
      };
      const hasVideoChanged = this.videoUrl !== this.data.videoUrl;
      const hasImageChanged = this.imageUrl !== this.data.imageUrl;

      if (hasVideoChanged && hasImageChanged) {
        console.log('both video and image have changed');

        const videoRef = ref(this.storage, `episodes/${Date.now()}_${this.video.name}`);
        await uploadBytes(videoRef, this.video);
        const videoUrl = await getDownloadURL(videoRef);

        const imageRef = ref(this.storage, `images/${Date.now()}_${this.image.name}`);
        await uploadBytes(imageRef, this.image);
        const imageUrl = await getDownloadURL(imageRef);

        updatedData.videoUrl = videoUrl;
        updatedData.imageUrl = imageUrl;

      } else if (hasVideoChanged) {
        console.log('video has changed');
        const videoRef = ref(this.storage, `episodes/${Date.now()}_${this.video.name}`);
        await uploadBytes(videoRef, this.video);
        const videoUrl = await getDownloadURL(videoRef);

        updatedData.videoUrl = videoUrl;
        updatedData.imageUrl = this.imageUrl;

      } else if (hasImageChanged) {
        console.log('image has changed');
        const imageRef = ref(this.storage, `images/${Date.now()}_${this.image.name}`);
        await uploadBytes(imageRef, this.image);
        const imageUrl = await getDownloadURL(imageRef);

        updatedData.imageUrl = imageUrl;
        updatedData.videoUrl = this.videoUrl;

      } else {
        console.log('only title/description has changed');
        updatedData.videoUrl = this.videoUrl;
        updatedData.imageUrl = this.imageUrl;
      }
      await updateDoc(episodeDocRef, updatedData);
      this.dialogRef.close();

    } catch (error) {
      console.error('Error during edit:', error);
    } finally {
      loadingref.close();
    }
  }

onClick(){
  this.dialogRef.close();
}

async onDelete(id: any,videoUrl:any,imageUrl:any,screenshot:string){
  console.log(id);
  console.log("videoUrl",videoUrl)
  console.log("imageUrl",imageUrl)
  console.log("delete process started");
  console.log("this.data",this.data)
  if(this.data.delete){
    // this.storage.refFromURL(videoUrl).delete().toPromise().then(() => {
    if(imageUrl){
      const imageRef = ref(this.storage,imageUrl)
      deleteObject(imageRef)
    }

    if(screenshot){
      const screenshotRef = ref(this.storage,screenshot)
      deleteObject(screenshotRef)
    }

    if(videoUrl){
      const videoRef = ref(this.storage,videoUrl)
      deleteObject(videoRef)
    }

    deleteDoc(doc(this.firestore,"episodes",id))
    // })
    // if(srt != undefined && videoUrl != undefined && imageUrl != undefined){
    //   this.storage.refFromURL(videoUrl).delete().toPromise().then(() => {
    //     this.storage.ref(imageUrl).delete().toPromise().then(() => {
    //       this.storage.refFromURL(srt).delete().toPromise().then(() => {
    //         this.firestore.collection('episodes').doc(id).delete()
    //       })
    //     })
    //     })
    //     .catch(err => {
    //       console.log(err)
    //     })
    // }
  }
  this.dialogRef.close()  
}
onSelect(){
 console.log(this.tabledata)

  var duplicateNameCheck = this.tabledata.some((e:any) => e.title.trim().toLowerCase() === this.title.trim().toLowerCase())
  console.log(duplicateNameCheck);
  this.crossmatch = duplicateNameCheck
  this.crossmatcherrormessage =  duplicateNameCheck ? " Title Already Exit": false
}

}
