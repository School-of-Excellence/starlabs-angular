import { Component, ElementRef, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, orderBy, query, setDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { DomSanitizer } from '@angular/platform-browser';
import { combineLatest, Observable, Subject, Subscription, takeUntil , of} from 'rxjs';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask, uploadBytesResumable } from '@angular/fire/storage';
import { AddEpisodeComponent } from './add-episode/add-episode.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import {MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import { AuthguardService } from '../../authguard.service';
import { map} from "rxjs/operators"
import { MatSortModule } from '@angular/material/sort';

export class uploadingelement {
  id:String | null;
  duration: string | null;
  title:String | null;
  reftitle:String | null;
  description:String | null;
  videoSize:String | null;
  videoSizeBytes:number | null;
  imagesize:number | null;
  imageUrl:string | null;
  videoUrl:string | null;
  screenshot:string | null
  date:Date;
  srt:string | null;
  previewImageUrl:String | ArrayBuffer;
  previewScreenshotUrl:String | ArrayBuffer;
  previewVideoUrl:string;
  uploadImageFile:File;
  uploadVideoFile:File;
  uploadSrtFile:File;
  uploadScreenshotFile:File;
  imageFileName:String;
  videoFileName:String;
  srtFileName:String;
  screenshotFileName:string;
  uploadingVideoPercentage : Observable<number>;
  uploadingImagePercentage : Observable<number>;
  uploadingSrtPercentage : Observable<number>;
  uploadingScreenshotPercentage : Observable<number>;
  videoTask : UploadTask | null;
  imagetask : UploadTask | null;
  srtTask : UploadTask | null;
  screenshotTask : UploadTask | null;
  submitted : boolean;
  savetofirestore:boolean;
  tags:Array<string>;
  status$:Observable<boolean>
}

@Component({
  selector: 'app-episodes-dashboard',
  imports: [
    MatTableModule,
    MatFormFieldModule,
    MatPaginatorModule,
    MatInputModule,
    MatChipsModule,
    CommonModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    MatTabsModule,
    MatSortModule
  ],
  templateUrl: './episodes-dashboard.component.html',
  // styleUrl: './episodes-dashboard.component.css'
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})

export class EpisodesDashboardComponent {
  // displayedColumns: string[] = [ 'Title', 'Description','tags', 'convertedtohls', 'Series', 'Thumbnail', 'Episode', 'Edit', 'Delete'];
  displayedColumns: string[] = [ 'Title', 'Referencetitle','Duration', 'added', 'convertedtohls',  'videosize', 'Series', 'Edit', 'Delete'];
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
  filteredTaxonomyList:any [] = []
  //
  @ViewChild('tabGroup') tabGroup!: MatTabGroup;
  tabs = ['View Uploaded Episodes','Upload New Episode'];
  //
  private subscription = new Subject<void>();
  constructor(
    public dialog: MatDialog, 
    private firestore: Firestore,
    public authguard: AuthguardService,  
    private storage: Storage,
    private sanitizer:DomSanitizer) {
    const episodesRef = collection(this.firestore,"episodes")
    const episodeQuery = query(episodesRef,orderBy('date', 'desc'))
    collectionSnapshots(episodeQuery).pipe(takeUntil(this.subscription)).subscribe((episodesData) => {
      let snapshotData = episodesData.map(doc=>({id:doc.id,...doc.data()}))
      this.dataSource.data = snapshotData;
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.dataSource.sortingDataAccessor = (item : any, headerSort : string)=>{
        switch(headerSort){
          case 'Title' : return item.title?.toLowerCase() ?? '';
          case 'Referencetitle' : return item.reftitle?. toLowerCase() ?? '';
          case 'Duration' : return item.duration ?? 0 ;
          case 'added': return item.date?.toDate().getTime() ?? 0;
          case 'videosize' :return item.videoSize ?? 0 ;  
          case 'Series' : return item.imagesize ?? 0;   
        }
      }
    });

    const atctaxonomyRef = collection(this.firestore,"atc taxonomy")
    collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      let snap = snapshot.map(doc=>({id:doc.id,...doc.data()}))
      this.taxonomyList = snap
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        this.mapTaxonomy[element['id']] = element['name']
      }
      this.filteredTaxonomyList = snap
    })
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  onTagSearch(event){
    let value = ![null,undefined,""].includes(event.target.value) ? event.target.value.trim().toLowerCase() :""
    this.filteredTaxonomyList = this.taxonomyList.filter(e => e['name'].toLowerCase().indexOf(value) === 0)
  }

  onTagSelect(tagid){
    this.uploadEpisodeDoc.tags = this.uploadEpisodeDoc.tags || []
    console.log(tagid,this.uploadEpisodeDoc.tags);
    this.uploadEpisodeDoc.tags.push(tagid)
    // this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.uploadEpisodeDoc.tags.includes(e.id))
  }

  onTagRemove(index){
    this.uploadEpisodeDoc.tags.splice(index,1)
    // this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.uploadEpisodeDoc.tags.includes(e.id))
  }

  openDialog() {
    this.dialog.open(AddEpisodeComponent,{
      data : {
        add : true
      }
    })
  }

  openEditDialog(doc,tabname:string) {
    // this.dialog.open(AddEpisodeComponent, {
    //   data : {
    //     edit : true,
    //     id : doc.id,
    //     title : doc.title,
    //     description : doc.description,
    //     videoUrl : doc.videoUrl,
    //     imageUrl : doc.imageUrl
    //   }
    // })
    console.log(doc);
    
    this.uploadEpisodeDoc = new uploadingelement
    this.uploadEpisodeDoc.id = doc.id
    this.uploadEpisodeDoc.title= doc.title ?? null
    this.uploadEpisodeDoc.reftitle= doc.reftitle ?? null
    this.uploadEpisodeDoc.videoSize= doc.videoSize ?? null
    this.uploadEpisodeDoc.videoSizeBytes= doc.videoSizeBytes ?? null
    this.uploadEpisodeDoc.imagesize= doc.imagesize ?? null
    this.uploadEpisodeDoc.description = doc.description ?? null
    this.uploadEpisodeDoc.duration = doc.duration ?? null
    this.uploadEpisodeDoc.tags = doc.tags ?? []
    this.uploadEpisodeDoc.videoUrl = doc.videoUrl ?? null
    this.uploadEpisodeDoc.imageUrl = doc.imageUrl ?? null
    this.uploadEpisodeDoc.srt = doc.srt ?? null
    this.uploadEpisodeDoc.screenshot = doc.screenshot ?? null
    this.uploadEpisodeDoc.date = doc.date != undefined ? doc.date.seconds != undefined ? doc.date.toDate() : doc.date : null
    // console.log(this.uploadEpisodeDoc);
    
    this.moveToSelectedTab(tabname)
  }

  openDeleteDialog(id:any,srt:any,imageUrl:any, videoUrl: any,screenshot:string) {
    this.dialog.open(AddEpisodeComponent, {
      data: {
        delete : true,
        id : id,
        imageUrl : imageUrl,
        srt : srt,
        videoUrl : videoUrl,
        screenshot:screenshot
      }
    })
  }

  ApplyFilter(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource.filter = filterValue.trim().toLowerCase()
  }

  //add episodes
  previewVideo(event: any) {
    const input = event.target as HTMLInputElement
    if(input && input.files.length > 0){
      const file:File = input.files[0]
      const maxSizeBytes = 15 * 1024 * 1024 * 1024;
      if (file.size < maxSizeBytes) {
        this.showFileSizeError = false
        console.log(file.size)
        this.uploadEpisodeDoc.previewVideoUrl = URL.createObjectURL(file)
        this.uploadEpisodeDoc.uploadVideoFile = file
      }else {
        console.log(file.size)
        this.showFileSizeError = true;
      }
    }
  }

  previewImage(event:Event) {
    const input = event.target as HTMLInputElement
    if(input && input.files.length > 0){
      const reader = new FileReader();
      reader.readAsDataURL(input.files[0])
      reader.onload = ( e => {
        this.uploadEpisodeDoc.previewImageUrl = e.target.result
        this.uploadEpisodeDoc.uploadImageFile = input.files[0]
        console.log(this.uploadEpisodeDoc.uploadImageFile.size)
      })
    }
  }

  previewScreenshot(event:Event) {
    const input = event.target as HTMLInputElement
    if(input && input.files.length > 0){
      const reader = new FileReader();
      reader.readAsDataURL(input.files[0])
      reader.onload = ( e => {
        this.uploadEpisodeDoc.previewScreenshotUrl = e.target.result
        this.uploadEpisodeDoc.uploadScreenshotFile = input.files[0]
      })
    }
  }

  // addToDoc(event:any){
  //   const file:File = event[0]
  //   this.uploadEpisodeDoc.uploadSrtFile = file
  // }
  addToDoc(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input && input.files && input.files.length > 0) {
      const file: File = input.files[0];
      this.uploadEpisodeDoc.uploadSrtFile = file;
      this.uploadEpisodeDoc.srtFileName = file.name;
      console.log('SRT file selected:', file.name);
    }
  }


  sanitize(url:string){
    return this.sanitizer.bypassSecurityTrustUrl(url);
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
  async extractVideoDuration(videoUrl: string, index: number) {
    return new Promise<void>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = videoUrl;

      video.onloadedmetadata = () => {
        const totalSeconds = video.duration;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        this.uploadingTask[index].duration = formatted;

        console.log("Extracted duration:", formatted);

        resolve();
      };

      video.onerror = () => {
        console.warn("Failed to load video metadata for duration.");
        this.uploadingTask[index].duration = null;
        resolve();
      };
    });
  }



  onSubmit() {
    console.log(this.uploadEpisodeDoc);

    this.uploadEpisodeDoc.submitted = false;
    this.uploadEpisodeDoc.date = this.uploadEpisodeDoc.date ?? new Date();
    this.uploadEpisodeDoc.id = this.uploadEpisodeDoc.id ?? doc(collection(this.firestore, "episodes")).id;

    let videoFilePath = null;
    if (this.uploadEpisodeDoc.uploadVideoFile) {
      videoFilePath = `eiflix_episodes/${Date.now()}_${this.uploadEpisodeDoc.uploadVideoFile.name}`;
      const reference = ref(this.storage, videoFilePath);
      const task = uploadBytesResumable(reference, this.uploadEpisodeDoc.uploadVideoFile);
      this.uploadEpisodeDoc.videoTask = task;
      this.uploadEpisodeDoc.uploadingVideoPercentage = this.trackUploadProgress(task);
      this.uploadEpisodeDoc.videoFileName = this.uploadEpisodeDoc.uploadVideoFile.name;
    }

    let imageFilePath = null;
    if (this.uploadEpisodeDoc.uploadImageFile) {
      imageFilePath = `eiflix_images/${Date.now()}_${this.uploadEpisodeDoc.uploadImageFile.name}`;
      const reference = ref(this.storage, imageFilePath);
      const task = uploadBytesResumable(reference, this.uploadEpisodeDoc.uploadImageFile);
      this.uploadEpisodeDoc.imagetask = task;
      this.uploadEpisodeDoc.uploadingImagePercentage = this.trackUploadProgress(task);
      this.uploadEpisodeDoc.imageFileName = this.uploadEpisodeDoc.uploadImageFile.name;
    }

    let screenshotFilePath = null;
    if (this.uploadEpisodeDoc.uploadScreenshotFile) {
      screenshotFilePath = `eiflix_images/${Date.now()}_${this.uploadEpisodeDoc.uploadScreenshotFile.name}`;
      const reference = ref(this.storage, screenshotFilePath);
      const task = uploadBytesResumable(reference, this.uploadEpisodeDoc.uploadScreenshotFile);
      this.uploadEpisodeDoc.screenshotTask = task;
      this.uploadEpisodeDoc.uploadingScreenshotPercentage = this.trackUploadProgress(task);
      this.uploadEpisodeDoc.screenshotFileName = this.uploadEpisodeDoc.uploadScreenshotFile.name;
    }

    let srtFilePath = null;
    if (this.uploadEpisodeDoc.uploadSrtFile) {
      srtFilePath = `eiflix_srt/${Date.now()}_${this.uploadEpisodeDoc.uploadSrtFile.name}`;
      const reference = ref(this.storage, srtFilePath);
      const task = uploadBytesResumable(reference, this.uploadEpisodeDoc.uploadSrtFile);
      this.uploadEpisodeDoc.srtTask = task;
      this.uploadEpisodeDoc.uploadingSrtPercentage = this.trackUploadProgress(task);
      this.uploadEpisodeDoc.srtFileName = this.uploadEpisodeDoc.uploadSrtFile.name;
    }

    this.uploadEpisodeDoc.savetofirestore = false;
    this.uploadEpisodeDoc.status$ = combineLatest([
      this.uploadEpisodeDoc.uploadVideoFile ? this.uploadEpisodeDoc.uploadingVideoPercentage : of(100),
      this.uploadEpisodeDoc.uploadImageFile ? this.uploadEpisodeDoc.uploadingImagePercentage : of(100),
      this.uploadEpisodeDoc.uploadSrtFile ? this.uploadEpisodeDoc.uploadingSrtPercentage : of(100),
      this.uploadEpisodeDoc.uploadScreenshotFile ? this.uploadEpisodeDoc.uploadingScreenshotPercentage : of(100),
    ]).pipe(
      map(([video, image, srt, screenshot]) =>
        video === 100 && image === 100 && srt === 100 && screenshot === 100
      )
    );
    this.uploadingTask.push(this.uploadEpisodeDoc);
    this.uploadEpisodeDoc = new uploadingelement();

    // reset inputs
    this.thumbnailref.nativeElement.value = "";
    this.videoref.nativeElement.value = "";
    this.srtref.nativeElement.value = "";
    this.screenshotref.nativeElement.value = "";
  }
  private getVideoSizeInfo(file: File) {
    const bytes = file.size;
    const mb = (bytes / (1024 * 1024)).toFixed(2);

    return {
      videoSizeBytes: bytes,
      videoSize: `${mb} MB`
    };
  }
  getTaskStatus(task:uploadingelement,index){
    console.log("task logged");
    
    if(!task.submitted ){
      console.log("once............")
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
    if (this.uploadingTask[index].uploadScreenshotFile) {
      console.log("get screenshot url");
      try {
        const screenshotsnap = await this.uploadingTask[index].screenshotTask;
        if (screenshotsnap.bytesTransferred === screenshotsnap.totalBytes) {
          const url = await getDownloadURL(screenshotsnap.ref);
          const oldScreenshotUrl = this.uploadingTask[index].screenshot;
          if (oldScreenshotUrl !== null && oldScreenshotUrl !== undefined) {
            try {
              const oldScreenshotRef = ref(this.storage, oldScreenshotUrl);
              await deleteObject(oldScreenshotRef);
              console.log("Old screenshot deleted");
            } catch (deleteErr) {
              console.warn("Error deleting old screenshot:", oldScreenshotUrl, deleteErr);
            }
          }
          this.uploadingTask[index].screenshot = url;
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error("Screenshot upload error:", err);
        checkuploaded.push(false);
      }
    }

    //video
    if (this.uploadingTask[index].uploadVideoFile) {
      console.log("get video url");

      try {
        const videosnap = await this.uploadingTask[index].videoTask;

        if (videosnap.bytesTransferred === videosnap.totalBytes) {
          const url = await getDownloadURL(videosnap.ref);

          const oldVideoUrl = this.uploadingTask[index].videoUrl;

          if (oldVideoUrl !== null && oldVideoUrl !== undefined) {
            try {
              const oldVideoRef = ref(this.storage, oldVideoUrl);
              await deleteObject(oldVideoRef);
              console.log("Old video deleted");
            } catch (deleteErr) {
              console.warn("Error deleting old video:", oldVideoUrl, deleteErr);
            }
          }

          this.uploadingTask[index].videoUrl = url;
          await this.extractVideoDuration(url, index);
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error("Video upload error:", err);
        checkuploaded.push(false);
      }
    }

    //srt
    if (this.uploadingTask[index].uploadSrtFile) {
      console.log("srt file url");
      try {
        const srtSnap = await this.uploadingTask[index].srtTask;
        if (srtSnap.bytesTransferred === srtSnap.totalBytes) {
          const url = await getDownloadURL(srtSnap.ref);
          const existingSrtUrl = this.uploadingTask[index].srt;
          if (existingSrtUrl !== null && existingSrtUrl !== undefined) {
            try {
              const oldFileRef = ref(this.storage, existingSrtUrl);
              await deleteObject(oldFileRef);
              console.log("Old SRT deleted");
            } catch (deleteErr) {
              console.warn("Error deleting old SRT:", existingSrtUrl, deleteErr);
            }
          }

          this.uploadingTask[index].srt = url;
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error("Error uploading SRT:", err);
        checkuploaded.push(false);
      }
    }

    // uploading to firestore
    if(!checkuploaded.includes(false)){
      const episode = this.uploadingTask[index];
      const docRef = doc(this.firestore, `episodes/${episode.id}`);
      // let sizeInfo = null;

      // if (episode.uploadVideoFile) {
      //   sizeInfo = this.getVideoSizeInfo(episode.uploadVideoFile);
      // }
      let videoSizeBytes = episode.videoSizeBytes ?? null;
      let videoSize = episode.videoSize ?? null;

      if (episode.uploadVideoFile) {
        const sizeInfo = this.getVideoSizeInfo(episode.uploadVideoFile);
        videoSizeBytes = sizeInfo.videoSizeBytes;
        videoSize = sizeInfo.videoSize;
      }
      let imagesize = episode.imagesize ?? null;

      if (episode.uploadImageFile) {
        imagesize = episode.uploadImageFile.size ?? null;
      }
      const episodeData = {
        id: episode.id,
        title: episode.title ?? null,
        reftitle: episode.reftitle ?? null,
        videoUrl: episode.videoUrl ?? null,
        imageUrl: episode.imageUrl ?? null,
        imagesize: imagesize,
        // imagesize: episode.uploadImageFile ? episode.uploadImageFile.size ?? null : null,
        // videoSizeBytes: sizeInfo ? sizeInfo.videoSizeBytes : null,
        // videoSize: sizeInfo ? sizeInfo.videoSize : null,
        videoSizeBytes: videoSizeBytes,
        videoSize: videoSize,
        srt: episode.srt ?? null,
        screenshot: episode.screenshot ?? null,
        description: episode.description ?? null,
        date: episode.date,
        tags: episode.tags ?? [],
        duration: episode.duration ?? null
      };
      try {
        await setDoc(docRef, episodeData, { merge: true });
        this.uploadingTask[index].savetofirestore = true;
      } catch (err) {
        console.error(err);
      }
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

  moveToSelectedTab(tabName: string): void {
    const tabIndex = this.tabs.indexOf(tabName);
    if (tabIndex !== -1) {
      this.tabGroup.selectedIndex = tabIndex;
    }
  }
}
