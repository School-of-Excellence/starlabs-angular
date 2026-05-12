import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { combineLatest, Observable, of, Subject, takeUntil } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ref, getDownloadURL, deleteObject, Storage, UploadTask, uploadBytesResumable
} from '@angular/fire/storage';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

export class uploadingelement {
  id: String | null;
  duration: string | null;
  title: String | null;
  reftitle: String | null;
  description: String | null;
  videoSize: String | null;
  videoSizeBytes: number | null;
  imagesize: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  screenshot: string | null;
  date: Date;
  srt: string | null;
  previewImageUrl: String | ArrayBuffer;
  previewScreenshotUrl: String | ArrayBuffer;
  previewVideoUrl: string;
  uploadImageFile: File;
  uploadVideoFile: File;
  uploadSrtFile: File;
  uploadScreenshotFile: File;
  imageFileName: String;
  videoFileName: String;
  srtFileName: String;
  screenshotFileName: string;
  uploadingVideoPercentage: Observable<number>;
  uploadingImagePercentage: Observable<number>;
  uploadingSrtPercentage: Observable<number>;
  uploadingScreenshotPercentage: Observable<number>;
  videoTask: UploadTask | null;
  imagetask: UploadTask | null;
  srtTask: UploadTask | null;
  srtToDelete: string | null;
  screenshotTask: UploadTask | null;
  submitted: boolean;
  savetofirestore: boolean;
  tags: Array<string>;
  status$: Observable<boolean>;
}

@Component({
  selector: 'app-upload-episode-dialog',
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    CommonModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
  ],
  templateUrl: './upload-episode-dialog.component.html',
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css']
})
export class UploadEpisodeDialogComponent {
  @ViewChild('thumbnailref') thumbnailref: ElementRef;
  @ViewChild('screenshotref') screenshotref: ElementRef;
  @ViewChild('srtref') srtref: ElementRef;
  @ViewChild('videoref') videoref: ElementRef;

  uploadEpisodeDoc = new uploadingelement();
  showFileSizeError = false;
  uploadingTask: uploadingelement[] = [];

  mapTaxonomy: { [key: string]: string } = {};
  taxonomyList: any[] = [];
  filteredTaxonomyList: any[] = [];

  private subscription = new Subject<void>();

  constructor(
    public dialogRef: MatDialogRef<UploadEpisodeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore,
    private storage: Storage,
    private sanitizer: DomSanitizer,
  ) {
    if (this.data?.edit && this.data?.row) {
      this.populateFromRow(this.data.row);
    }

    const atctaxonomyRef = collection(this.firestore, 'atc taxonomy');
    collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      const snap = snapshot.map(doc => ({ id: doc.id, ...doc.data() }));
      this.taxonomyList = snap;
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        this.mapTaxonomy[element['id']] = element['name'];
      }
      this.filteredTaxonomyList = snap;
    });
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  close(): void {
    this.dialogRef.close();
  }

  private populateFromRow(row: any): void {
    this.uploadEpisodeDoc = new uploadingelement();
    this.uploadEpisodeDoc.id = row.id;
    this.uploadEpisodeDoc.title = row.title ?? null;
    this.uploadEpisodeDoc.reftitle = row.reftitle ?? null;
    this.uploadEpisodeDoc.videoSize = row.videoSize ?? null;
    this.uploadEpisodeDoc.videoSizeBytes = row.videoSizeBytes ?? null;
    this.uploadEpisodeDoc.imagesize = row.imagesize ?? null;
    this.uploadEpisodeDoc.description = row.description ?? null;
    this.uploadEpisodeDoc.duration = row.duration ?? null;
    this.uploadEpisodeDoc.tags = row.tags ?? [];
    this.uploadEpisodeDoc.videoUrl = row.videoUrl ?? null;
    this.uploadEpisodeDoc.imageUrl = row.imageUrl ?? null;
    this.uploadEpisodeDoc.srt = row.srt ?? null;
    this.uploadEpisodeDoc.screenshot = row.screenshot ?? null;
    this.uploadEpisodeDoc.date = row.date != undefined
      ? row.date.seconds != undefined ? row.date.toDate() : row.date
      : null;
  }

  onTagSearch(event) {
    const value = ![null, undefined, ''].includes(event.target.value)
      ? event.target.value.trim().toLowerCase() : '';
    this.filteredTaxonomyList = this.taxonomyList.filter(e => e['name'].toLowerCase().indexOf(value) === 0);
  }

  onTagSelect(tagid) {
    this.uploadEpisodeDoc.tags = this.uploadEpisodeDoc.tags || [];
    this.uploadEpisodeDoc.tags.push(tagid);
  }

  onTagRemove(index) {
    this.uploadEpisodeDoc.tags.splice(index, 1);
  }

  previewVideo(event: any) {
    const input = event.target as HTMLInputElement;
    if (input && input.files.length > 0) {
      const file: File = input.files[0];
      const maxSizeBytes = 15 * 1024 * 1024 * 1024;
      if (file.size < maxSizeBytes) {
        this.showFileSizeError = false;
        this.uploadEpisodeDoc.previewVideoUrl = URL.createObjectURL(file);
        this.uploadEpisodeDoc.uploadVideoFile = file;
      } else {
        this.showFileSizeError = true;
      }
    }
  }

  previewImage(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input && input.files.length > 0) {
      const reader = new FileReader();
      reader.readAsDataURL(input.files[0]);
      reader.onload = (e => {
        this.uploadEpisodeDoc.previewImageUrl = e.target.result;
        this.uploadEpisodeDoc.uploadImageFile = input.files[0];
      });
    }
  }

  previewScreenshot(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input && input.files.length > 0) {
      const reader = new FileReader();
      reader.readAsDataURL(input.files[0]);
      reader.onload = (e => {
        this.uploadEpisodeDoc.previewScreenshotUrl = e.target.result;
        this.uploadEpisodeDoc.uploadScreenshotFile = input.files[0];
      });
    }
  }

  addToDoc(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input && input.files && input.files.length > 0) {
      const file: File = input.files[0];
      if (this.uploadEpisodeDoc.srt && !this.uploadEpisodeDoc.srtToDelete) {
        this.uploadEpisodeDoc.srtToDelete = this.uploadEpisodeDoc.srt;
      }
      this.uploadEpisodeDoc.uploadSrtFile = file;
      this.uploadEpisodeDoc.srtFileName = file.name;
      this.uploadEpisodeDoc.srt = null;
    }
  }

  removeSrt(event: Event) {
    event.stopPropagation();
    if (this.uploadEpisodeDoc.srt && !this.uploadEpisodeDoc.srtToDelete) {
      this.uploadEpisodeDoc.srtToDelete = this.uploadEpisodeDoc.srt;
    }
    this.uploadEpisodeDoc.srt = null;
    this.uploadEpisodeDoc.srtFileName = null;
    this.uploadEpisodeDoc.uploadSrtFile = null;
    if (this.srtref?.nativeElement) {
      this.srtref.nativeElement.value = '';
    }
  }

  getSrtFileNameFromUrl(url: string): string {
    if (!url) return '';
    try {
      const decoded = decodeURIComponent(url.split('?')[0]);
      const segment = decoded.substring(decoded.lastIndexOf('/') + 1);
      return segment || 'Subtitle file';
    } catch {
      return 'Subtitle file';
    }
  }

  sanitize(url: string) {
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
        resolve();
      };
      video.onerror = () => {
        this.uploadingTask[index].duration = null;
        resolve();
      };
    });
  }

  onSubmit() {
    this.uploadEpisodeDoc.submitted = false;
    this.uploadEpisodeDoc.date = this.uploadEpisodeDoc.date ?? new Date();
    this.uploadEpisodeDoc.id = this.uploadEpisodeDoc.id ?? doc(collection(this.firestore, 'episodes')).id;

    if (this.uploadEpisodeDoc.uploadVideoFile) {
      const videoFilePath = `eiflix_episodes/${Date.now()}_${this.uploadEpisodeDoc.uploadVideoFile.name}`;
      const reference = ref(this.storage, videoFilePath);
      const task = uploadBytesResumable(reference, this.uploadEpisodeDoc.uploadVideoFile);
      this.uploadEpisodeDoc.videoTask = task;
      this.uploadEpisodeDoc.uploadingVideoPercentage = this.trackUploadProgress(task);
      this.uploadEpisodeDoc.videoFileName = this.uploadEpisodeDoc.uploadVideoFile.name;
    }

    if (this.uploadEpisodeDoc.uploadImageFile) {
      const imageFilePath = `eiflix_images/${Date.now()}_${this.uploadEpisodeDoc.uploadImageFile.name}`;
      const reference = ref(this.storage, imageFilePath);
      const task = uploadBytesResumable(reference, this.uploadEpisodeDoc.uploadImageFile);
      this.uploadEpisodeDoc.imagetask = task;
      this.uploadEpisodeDoc.uploadingImagePercentage = this.trackUploadProgress(task);
      this.uploadEpisodeDoc.imageFileName = this.uploadEpisodeDoc.uploadImageFile.name;
    }

    if (this.uploadEpisodeDoc.uploadScreenshotFile) {
      const screenshotFilePath = `eiflix_images/${Date.now()}_${this.uploadEpisodeDoc.uploadScreenshotFile.name}`;
      const reference = ref(this.storage, screenshotFilePath);
      const task = uploadBytesResumable(reference, this.uploadEpisodeDoc.uploadScreenshotFile);
      this.uploadEpisodeDoc.screenshotTask = task;
      this.uploadEpisodeDoc.uploadingScreenshotPercentage = this.trackUploadProgress(task);
      this.uploadEpisodeDoc.screenshotFileName = this.uploadEpisodeDoc.uploadScreenshotFile.name;
    }

    if (this.uploadEpisodeDoc.uploadSrtFile) {
      const srtFilePath = `eiflix_srt/${Date.now()}_${this.uploadEpisodeDoc.uploadSrtFile.name}`;
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

    this.thumbnailref.nativeElement.value = '';
    this.videoref.nativeElement.value = '';
    this.srtref.nativeElement.value = '';
    this.screenshotref.nativeElement.value = '';
  }

  private getVideoSizeInfo(file: File) {
    const bytes = file.size;
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    return {
      videoSizeBytes: bytes,
      videoSize: `${mb} MB`
    };
  }

  getTaskStatus(task: uploadingelement, index) {
    if (!task.submitted) {
      this.uploadingTask[index].submitted = true;
      this.saveDataToFirestore(index);
    }
    return !task.savetofirestore ? (task.submitted ? 'On Process' : 'Not Yet Uploaded') : 'Submitted';
  }

  async saveDataToFirestore(index: number) {
    const checkuploaded: boolean[] = [];

    if (this.uploadingTask[index].uploadImageFile) {
      try {
        const imagesnap = await this.uploadingTask[index].imagetask;
        if (imagesnap.bytesTransferred === imagesnap.totalBytes) {
          const url = await getDownloadURL(imagesnap.ref);
          const previousImageUrl = this.uploadingTask[index].imageUrl;
          if (previousImageUrl !== null && previousImageUrl !== undefined) {
            try {
              const oldImageRef = ref(this.storage, previousImageUrl);
              await deleteObject(oldImageRef);
            } catch (deleteErr) {
              console.warn('Error deleting previous image:', previousImageUrl, deleteErr);
            }
          }
          this.uploadingTask[index].imageUrl = url;
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error('Image upload error:', err);
        checkuploaded.push(false);
      }
    }

    if (this.uploadingTask[index].uploadScreenshotFile) {
      try {
        const screenshotsnap = await this.uploadingTask[index].screenshotTask;
        if (screenshotsnap.bytesTransferred === screenshotsnap.totalBytes) {
          const url = await getDownloadURL(screenshotsnap.ref);
          const oldScreenshotUrl = this.uploadingTask[index].screenshot;
          if (oldScreenshotUrl !== null && oldScreenshotUrl !== undefined) {
            try {
              const oldScreenshotRef = ref(this.storage, oldScreenshotUrl);
              await deleteObject(oldScreenshotRef);
            } catch (deleteErr) {
              console.warn('Error deleting old screenshot:', oldScreenshotUrl, deleteErr);
            }
          }
          this.uploadingTask[index].screenshot = url;
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error('Screenshot upload error:', err);
        checkuploaded.push(false);
      }
    }

    if (this.uploadingTask[index].uploadVideoFile) {
      try {
        const videosnap = await this.uploadingTask[index].videoTask;
        if (videosnap.bytesTransferred === videosnap.totalBytes) {
          const url = await getDownloadURL(videosnap.ref);
          const oldVideoUrl = this.uploadingTask[index].videoUrl;
          if (oldVideoUrl !== null && oldVideoUrl !== undefined) {
            try {
              const oldVideoRef = ref(this.storage, oldVideoUrl);
              await deleteObject(oldVideoRef);
            } catch (deleteErr) {
              console.warn('Error deleting old video:', oldVideoUrl, deleteErr);
            }
          }
          this.uploadingTask[index].videoUrl = url;
          await this.extractVideoDuration(url, index);
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error('Video upload error:', err);
        checkuploaded.push(false);
      }
    }

    if (this.uploadingTask[index].uploadSrtFile) {
      try {
        const srtSnap = await this.uploadingTask[index].srtTask;
        if (srtSnap.bytesTransferred === srtSnap.totalBytes) {
          const url = await getDownloadURL(srtSnap.ref);
          const existingSrtUrl = this.uploadingTask[index].srtToDelete ?? this.uploadingTask[index].srt;
          if (existingSrtUrl !== null && existingSrtUrl !== undefined) {
            try {
              const oldFileRef = ref(this.storage, existingSrtUrl);
              await deleteObject(oldFileRef);
            } catch (deleteErr) {
              console.warn('Error deleting old SRT:', existingSrtUrl, deleteErr);
            }
          }
          this.uploadingTask[index].srt = url;
          this.uploadingTask[index].srtToDelete = null;
          checkuploaded.push(true);
        } else {
          checkuploaded.push(false);
        }
      } catch (err) {
        console.error('Error uploading SRT:', err);
        checkuploaded.push(false);
      }
    } else if (this.uploadingTask[index].srtToDelete) {
      try {
        const oldFileRef = ref(this.storage, this.uploadingTask[index].srtToDelete);
        await deleteObject(oldFileRef);
      } catch (deleteErr) {
        console.warn('Error deleting removed SRT:', this.uploadingTask[index].srtToDelete, deleteErr);
      }
      this.uploadingTask[index].srtToDelete = null;
    }

    if (!checkuploaded.includes(false)) {
      const episode = this.uploadingTask[index];
      const docRef = doc(this.firestore, `episodes/${episode.id}`);
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
    return 'Done';
  }

  editFromQueue(task: uploadingelement, index: number) {
    this.populateFromRow(task);
    this.uploadEpisodeDoc.tags = task.tags ?? [];
    task.submitted = false;
    this.removeDoc(index);
  }

  removeDoc(index: number) {
    this.uploadingTask.splice(index, 1);
  }
}
