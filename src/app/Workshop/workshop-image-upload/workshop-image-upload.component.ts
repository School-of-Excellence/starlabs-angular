import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Observable, Subject, takeUntil } from 'rxjs';
import { deleteObject, getDownloadURL, ref, Storage, uploadBytesResumable, UploadTask } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { collection, collectionData, doc, Firestore, orderBy, query, setDoc, where } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';


export class uploadingelement {
  id:string | null;
  name:string | null;
  ratio:string | null;
  type:string | null;
  // title:String | null;
  description:String | null;
  imageUrl:string | null;
  // videoUrl:string | null;
  // screenshot:string | null
  date:Date;
  // srt:string | null;
  previewImageUrl:string | ArrayBuffer;
  // previewScreenshotUrl:string | ArrayBuffer;
  // previewVideoUrl:string;
  uploadImageFile:File;
  // uploadVideoFile:File;
  // uploadSrtFile:File;
  // uploadScreenshotFile:File;
  imageFileName:string;
  // videoFileName:string;
  // srtFileName:string;
  // screenshotFileName:string;
  // uploadingVideoPercentage : Observable<number>;
  uploadingImagePercentage : Observable<number>;
  // uploadingSrtPercentage : Observable<number>;
  // uploadingScreenshotPercentage : Observable<number>;
  // videoTask : AngularFireUploadTask | null;
  imagetask :  UploadTask | null;
  // srtTask : AngularFireUploadTask | null;
  // screenshotTask : AngularFireUploadTask | null;
  submitted : boolean;
  savetofirestore:boolean;
  // tags:Array<string>;
}

@Component({
  selector: 'app-workshop-image-upload',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatTabsModule,
    ClipboardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
  ],
  templateUrl: './workshop-image-upload.component.html',
  styleUrl: './workshop-image-upload.component.css'
})
export class WorkshopImageUploadComponent {
    // 'Title' 'tags' 'convertedtohls', 'Series', 'Thumbnail', 'Episode', 'Delete'
  displayedColumns: string[] = ['name','ratio','type','description','imageurl','copyimageurl','Edit'];
  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator) paginator : MatPaginator | any
  @ViewChild(MatSort) sort : MatSort | any

  @ViewChild("thumbnailref")thumbnailref:ElementRef
  @ViewChild("screenshotref")screenshotref:ElementRef
  @ViewChild("srtref")srtref:ElementRef
  @ViewChild("videoref")videoref:ElementRef

  tabledata: any = []

  //uploadEpisodes
  uploadEpisodeDoc = new uploadingelement
  showFileSizeError: boolean = false;
  // uploadEpisodeDoc = {
  //   id:null,
  //   title:null,
  //   description:null,
  //   imageUrl:null,
  //   videoUrl:null,
  //   date:new Date(),
  //   srt:null,
  //   previewImageUrl:null,
  //   previewVideoUrl:null,
  //   uploadImageFile:null,
  //   uploadVideoFile:null,
  //   uploadSrtFile:null,
  //   uploadingVideoPercentage : 0,
  //   uploadingImagePercentage : 0,
  //   videoTask : null,
  //   imagetask : null
  // }

  onEdit:boolean = false
  uploadingTask:uploadingelement[] = []
  runtime = 0

  // tags = []
  mapTaxonomy = {}
  taxonomyList = []
  // taxonomySubscription:Subscription
  filteredTaxonomyList:any [] = []
  //
  // workshopImagesSubscription:Subscription
  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  //
  @ViewChild('tabGroup') tabGroup!: MatTabGroup;
  tabs = ['View Uploaded Images','Upload New Image'];
  
  constructor (
    public dialog: MatDialog, 
    private storage: Storage,
    private sanitizer: DomSanitizer
  ){
    collectionData(query(collection(this.firestore,"workshop images"),orderBy('date', 'desc'))).pipe(takeUntil(this.destroy$))
    .subscribe((snapshot) => {
      this.dataSource.data = snapshot;
      this.dataSource.paginator = this.paginator;
      // this.dataSource.sort = this.sort;
    });
    collectionData(collection(this.firestore,"atc taxonomy")).subscribe(snap => {
      this.taxonomyList = snap
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        this.mapTaxonomy[element['id']] = element['name']
      }
      this.filteredTaxonomyList = snap
    })
    
   }

  ngOnInit(): void {}

  ngOnDestroy(){
    // this.taxonomySubscription.unsubscribe()
    // this.workshopImagesSubscription.unsubscribe()
    this.destroy$.next();
    this.destroy$.complete();
  }

  // tags
  onTagSearch(event){
    let value = ![null,undefined,""].includes(event.target.value) ? event.target.value.trim().toLowerCase() :""
    this.filteredTaxonomyList = this.taxonomyList.filter(e => e['name'].toLowerCase().indexOf(value) === 0)
  }

  // onTagSelect(tagid){
  //   this.uploadEpisodeDoc.tags = this.uploadEpisodeDoc.tags || []
  //   console.log(tagid,this.uploadEpisodeDoc.tags);
  //   this.uploadEpisodeDoc.tags.push(tagid)
  //   this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.uploadEpisodeDoc.tags.includes(e.id))
  // }

  // onTagRemove(index){
  //   this.uploadEpisodeDoc.tags.splice(index,1)
  //   this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.uploadEpisodeDoc.tags.includes(e.id))
  // }


  openEditDialog(doc,tabname:string) {
    console.log(doc);
    this.uploadEpisodeDoc = new uploadingelement
    this.uploadEpisodeDoc.id = doc.id
    this.uploadEpisodeDoc.name = doc.name
    this.uploadEpisodeDoc.ratio = doc.ratio
    this.uploadEpisodeDoc.type = doc.type
    // this.uploadEpisodeDoc.title= doc.title ?? null
    this.uploadEpisodeDoc.description = doc.description ?? null
    // this.uploadEpisodeDoc.tags = doc.tags ?? []
    // this.uploadEpisodeDoc.videoUrl = doc.videoUrl ?? null
    this.uploadEpisodeDoc.imageUrl = doc.imageUrl ?? null
    // this.uploadEpisodeDoc.srt = doc.srt ?? null
    // this.uploadEpisodeDoc.screenshot = doc.screenshot ?? null
    this.uploadEpisodeDoc.date = doc.date != undefined ? doc.date.seconds != undefined ? doc.date.toDate() : doc.date : null
    this.moveToSelectedTab(tabname)
  }

  ApplyFilter(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource.filter = filterValue.trim().toLowerCase()
  }

  //add episodes
  // previewVideo(event: any) {
  //   const file:File = event[0]
  //   const maxSizeBytes = 15 * 1024 * 1024 * 1024;
  //   if (file.size < maxSizeBytes) {
  //     this.showFileSizeError = false
  //     console.log(file.size)
  //     this.uploadEpisodeDoc.previewVideoUrl = URL.createObjectURL(file)
  //     this.uploadEpisodeDoc.uploadVideoFile = file
  //   }else {
  //     console.log(file.size)
  //     this.showFileSizeError = true;
  //   }
  // }

  previewImage(event:Event) {
    const input = event.target as HTMLInputElement
    if(input.files && input.files[0]){
      const reader = new FileReader();
      reader.readAsDataURL(input.files[0])
      reader.onload = ( e => {
        this.uploadEpisodeDoc.previewImageUrl = e.target.result
        this.uploadEpisodeDoc.uploadImageFile = input.files[0]
        console.log(this.uploadEpisodeDoc.uploadImageFile.size)
      })
    }
  }

  // previewScreenshot(event) {
  //   const reader = new FileReader();
  //   reader.readAsDataURL(event[0])
  //   reader.onload = ( e => {
  //     this.uploadEpisodeDoc.previewScreenshotUrl = e.target.result
  //     this.uploadEpisodeDoc.uploadScreenshotFile = event[0]
  //   })
  // }

  // addToDoc(event:any){
  //   const file:File = event[0]
  //   this.uploadEpisodeDoc.uploadSrtFile = file
  // }

  sanitize(url:string){
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  onSubmit(){
    console.log(this.uploadEpisodeDoc);
    //
    this.uploadEpisodeDoc.submitted = false
    //doc id
    this.uploadEpisodeDoc.date = this.uploadEpisodeDoc.date ?? new Date()
    this.uploadEpisodeDoc.id = this.uploadEpisodeDoc.id ?? doc(collection(this.firestore,"workshop images")).id
    // uploading video
    // let videoFilePath = null
    // if(this.uploadEpisodeDoc.uploadVideoFile ) videoFilePath =  `eiflix_episodes/${Date.now()}_${this.uploadEpisodeDoc.uploadVideoFile.name}`
    // if(videoFilePath){
    //   console.log("video task");
    //   this.uploadEpisodeDoc.videoTask = this.storage.upload(videoFilePath,this.uploadEpisodeDoc.uploadVideoFile)
    //   this.uploadEpisodeDoc.uploadingVideoPercentage = this.uploadEpisodeDoc.videoTask.percentageChanges()
    //   this.uploadEpisodeDoc.videoFileName = this.uploadEpisodeDoc.uploadVideoFile.name
    // }
    //uploading image
    let imageFilePath = null
    if(this.uploadEpisodeDoc.uploadImageFile) imageFilePath = `eiflix_images/${Date.now()}size${this.uploadEpisodeDoc.ratio}size${this.uploadEpisodeDoc.uploadImageFile.name}`
    if(imageFilePath){
      console.log("image task");
      const reference = ref(this.storage,imageFilePath)
      const task = uploadBytesResumable(reference,this.uploadEpisodeDoc.uploadImageFile)
      this.uploadEpisodeDoc.imagetask = task
      this.uploadEpisodeDoc.uploadingImagePercentage = this.trackUploadProgress(task)
      this.uploadEpisodeDoc.imageFileName = this.uploadEpisodeDoc.uploadImageFile.name
    }
    //uploading screenshot
    // let screenshotFilePath = null
    // if(this.uploadEpisodeDoc.uploadScreenshotFile) screenshotFilePath = `eiflix_images/${Date.now()}_${this.uploadEpisodeDoc.uploadScreenshotFile.name}`
    // if(screenshotFilePath){
    //   console.log("screenshot task");
    //   this.uploadEpisodeDoc.screenshotTask = this.storage.upload(screenshotFilePath,this.uploadEpisodeDoc.uploadScreenshotFile)
    //   this.uploadEpisodeDoc.uploadingScreenshotPercentage = this.uploadEpisodeDoc.screenshotTask.percentageChanges()
    //   this.uploadEpisodeDoc.screenshotFileName = this.uploadEpisodeDoc.uploadScreenshotFile.name
    // }
    //upload srt file
    // let srtFilePath = null
    // if(this.uploadEpisodeDoc.uploadSrtFile) srtFilePath = `eiflix_srt/${Date.now()}_${this.uploadEpisodeDoc.uploadSrtFile.name}`
    // if(srtFilePath){
    //   console.log("srt file task");
    //   this.uploadEpisodeDoc.srtTask = this.storage.upload(srtFilePath,this.uploadEpisodeDoc.uploadSrtFile)
    //   this.uploadEpisodeDoc.uploadingSrtPercentage = this.uploadEpisodeDoc.srtTask.percentageChanges()
    //   this.uploadEpisodeDoc.srtFileName = this.uploadEpisodeDoc.uploadSrtFile.name
    // }
    this.uploadEpisodeDoc.savetofirestore = false
    this.uploadingTask.push(this.uploadEpisodeDoc)
    this.uploadEpisodeDoc = new uploadingelement
    console.log(this.uploadEpisodeDoc);
    this.thumbnailref.nativeElement.value = ""
    // this.videoref.nativeElement.value = ""
    // this.srtref.nativeElement.value = ""
    // this.screenshotref.nativeElement.value = ""
  } 

  getTaskStatus(task:uploadingelement,index){
    if(!task.submitted){
      this.uploadingTask[index].submitted = true
      this.saveDataToFirestore(index)
    }
    return !task.savetofirestore ? (task.submitted ? "On Process" : "Not Yet Uploaded") : "Submitted"
  }

  async saveDataToFirestore(index:number){
    // console.log(this.runtime);
    // this.runtime++
    let checkuploaded:boolean[] = []
    //image
    if (this.uploadingTask[index].uploadImageFile) {
      console.log("get image url");
      try {
        const imagesnap = await this.uploadingTask[index].imagetask;
        if (imagesnap.bytesTransferred === imagesnap.totalBytes) {
          const url = await getDownloadURL(imagesnap.ref);
          const previousImageUrl = this.uploadingTask[index].imageUrl;
          if (previousImageUrl !== null && previousImageUrl !== undefined) {
            try {
              const oldImageRef = ref(this.storage, previousImageUrl);
              await deleteObject(oldImageRef);
              console.log("Previous image deleted");
            } catch (deleteErr) {
              console.warn("Error deleting previous image:", previousImageUrl, deleteErr);
            }
          }
          this.uploadingTask[index].imageUrl = url;
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error("Image upload error:", err);
        checkuploaded.push(false);
      }
    }
    //screenshot
    // if(this.uploadingTask[index].uploadScreenshotFile){
    //   console.log("get screenshot url");
    //   await this.uploadingTask[index].screenshotTask.then(async screenshotsnap => {
    //     if(screenshotsnap.bytesTransferred === screenshotsnap.totalBytes){
    //       await screenshotsnap.ref.getDownloadURL().then(async url => {
    //         if(![null,undefined].includes(this.uploadingTask[index].screenshot)){
    //           await this.storage.refFromURL(this.uploadingTask[index].screenshot).delete().toPromise().then(() => {
    //             this.uploadingTask[index].screenshot = url
    //             checkuploaded.push(true)
    //           }).catch(err => {
    //             console.log("error on deleting previous screenshot url",this.uploadingTask[index].screenshot,err);
    //             this.uploadingTask[index].screenshot = url
    //             checkuploaded.push(true)
    //           })
    //         }else{
    //           this.uploadingTask[index].screenshot = url
    //           checkuploaded.push(true)
    //         }
    //       }).catch(err => {
    //         console.log(err);
    //         checkuploaded.push(false)
    //       })
    //     }else{
    //       checkuploaded.push(false)
    //     }
    //   })
    // }
    //video
    // if(this.uploadingTask[index].uploadVideoFile){
    //   console.log("get video url");
    //   await this.uploadingTask[index].videoTask.then(async videosnap => {
    //     if(videosnap.bytesTransferred === videosnap.totalBytes){
    //       await videosnap.ref.getDownloadURL().then(async url => {
    //         if(![null,undefined].includes(this.uploadingTask[index].videoUrl)){
    //           await this.storage.refFromURL(this.uploadingTask[index].videoUrl).delete().toPromise().then(() => {
    //             this.uploadingTask[index].videoUrl = url
    //             checkuploaded.push(true)
    //           }).catch(err => {
    //             console.log("error on delete previous url",this.uploadingTask[index].videoUrl,err);
    //             this.uploadingTask[index].videoUrl = url
    //             checkuploaded.push(true)
    //           })
    //         }else{
    //           this.uploadingTask[index].videoUrl = url
    //           checkuploaded.push(true)
    //         }
    //       })
    //     }else{
    //       checkuploaded.push(false)
    //     }
    //   })
    // }
    //srt
    // if(this.uploadingTask[index].uploadSrtFile){
    //   console.log("srt file url");
    //   await this.uploadingTask[index].srtTask.then(async srtSnap => {
    //     if(srtSnap.bytesTransferred === srtSnap.totalBytes){
    //       await srtSnap.ref.getDownloadURL().then(async url => {
    //         if(![null,undefined].includes(this.uploadingTask[index].srt)){
    //           await this.storage.refFromURL(this.uploadingTask[index].srt).delete().toPromise().then(() => {
    //             this.uploadingTask[index].srt = url
    //             checkuploaded.push(true)
    //           }).catch(err => {
    //             console.log("error on deleting previous srt file",this.uploadingTask[index].srt,err);
    //             this.uploadingTask[index].srt = url
    //             checkuploaded.push(true)
    //           })
    //         }else{
    //           this.uploadingTask[index].srt = url
    //           checkuploaded.push(true)
    //         }
    //       })
    //     }else{
    //       checkuploaded.push(false)
    //     }
    //   })
    // }

    // uploading to firestore
    if(!checkuploaded.includes(false)){
      setDoc(doc(this.firestore,"workshop images",this.uploadingTask[index].id),{
        id: this.uploadingTask[index].id,
        name:this.uploadingTask[index].imageFileName ?? this.uploadingTask[index].name,
        ratio:this.uploadingTask[index].ratio,
        type:this.uploadingTask[index].type,
        // title: this.uploadingTask[index].title ?? null,
        // videoUrl: this.uploadingTask[index].videoUrl ?? null,
        imageUrl: this.uploadingTask[index].imageUrl ?? null,
        imagesize : this.uploadingTask[index].uploadImageFile ? this.uploadingTask[index].uploadImageFile.size ?? null: null,
        // srt : this.uploadingTask[index].srt ?? null,
        // screeshot : this.uploadingTask[index].screenshot ?? null,
        description: this.uploadingTask[index].description ?? null,
        date: this.uploadingTask[index].date,
        // tags: this.uploadingTask[index].tags ?? []
      },{merge:true}).then(() => {
        this.uploadingTask[index].savetofirestore = true
        // this.uploadingTask[index].submitted = false
      }).catch(err => {
        console.log(err);
      })
    }
    console.log(this.uploadingTask[index]);
    return "Done"
  }

  // uploadFiles(index){
  //   console.log(index)
  //   this.saveDataToFirestore(index)
  // }

  removeDoc(index:number){
    this.uploadingTask.splice(index,1)
  }

  trackUploadProgress(task: UploadTask): Observable<number> {
    return new Observable<number>((observer) => {
      task.on('state_changed', snapshot => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        observer.next(progress);
      }, 
      error => observer.error(error),
      () => observer.complete());
    });
  }

  moveToSelectedTab(tabName: string): void {
    const tabIndex = this.tabs.indexOf(tabName);
    if (tabIndex !== -1) {
      this.tabGroup.selectedIndex = tabIndex;
    }
  }
  
}
