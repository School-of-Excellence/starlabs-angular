import { Component, Inject, ViewChild } from '@angular/core';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule, DatePipe } from '@angular/common';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer } from '@angular/platform-browser';
import { AuthguardService } from '../../../authguard.service';
import { collection, collectionSnapshots, doc, Firestore, getDocs, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { ref, getDownloadURL, Storage, deleteObject, uploadBytesResumable } from '@angular/fire/storage';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-content-upload-dialog',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatRadioModule,
    MatDatepickerModule,
    MatDividerModule,
    MatChipsModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatDialogModule,
    MatProgressBarModule
  ],
  templateUrl: './content-upload-dialog.component.html',
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css']
})
export class ContentUploadDialogComponent {

  loggedinUser: any;
  loggedinProfileid: any;
  Videourl = [];
  Thumbnailurl = [];
  type: any;
  publishdate: any;
  hero = false;
  contentform!: FormGroup;
  mapTaxonomy = {};
  taxonomyList = [];
  tags = [];
  @ViewChild("chiptaglist") chiptaglist;
  filteredTaxonomyList: any[] = [];
  private subscription = new Subject<void>();
  editMode: boolean = false;

  // Progress tracking
  uploadProgress: number = 0;
  isUploading: boolean = false;
  uploadLabel: string = '';

  constructor(
    public dialogRef: MatDialogRef<ContentUploadDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public currentContent: any,
    public formbuilder: FormBuilder,
    public dialog: MatDialog,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    public pipe: DatePipe,
    public guardservice: AuthguardService,
    private storage: Storage,
    private sanitizer: DomSanitizer
  ) {
    this.contentform = this.formbuilder.group({
      title: [null, { validators: [Validators.required], updateOn: "change" }],
      available: [true, { validators: [Validators.required], updateOn: "change" }],
    });

    guardservice.getuid().then(async uid => {
      this.loggedinUser = uid;
      const userdataRef = doc(this.firestore, 'user_data', uid);
      const profiledataRef = collection(this.firestore, 'profile_data');
      const profiledataQuery = query(profiledataRef, where("user_ref", "==", userdataRef));
      getDocs(profiledataQuery).then(profileData => {
        this.loggedinProfileid = profileData.docs[0].id;
      });

      const atctaxonomyRef = collection(this.firestore, 'atc taxonomy');
      collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snapData => {
        let snap = snapData.map(doc => ({ id: doc.id, ...doc.data() }));
        this.taxonomyList = snap;
        for (let i = 0; i < snap.length; i++) {
          const element = snap[i];
          this.mapTaxonomy[element['id']] = element['name'];
        }

        if (currentContent != null) {
          this.contentform.patchValue({
            title: this.currentContent.title,
            available: this.currentContent.available,
          });

          this.type = this.currentContent.type;
          if (this.currentContent.publishdate != undefined) {
            this.publishdate = this.currentContent.publishdate.toDate();
          }
          this.hero = this.currentContent.hero ?? false;
          this.tags = this.currentContent.tags ?? [];
          this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id));

          var video = {};
          video['url'] = this.currentContent.url;
          video['filename'] = this.currentContent.title;
          video['uploadurl'] = this.currentContent.url; // Firebase URL string — not a File
          this.Videourl.push(video);

          if (this.currentContent.thumbnail != null) {
            var thumbnail = {};
            thumbnail['url'] = this.currentContent.thumbnail;
            thumbnail['filename'] = this.currentContent.title;
            thumbnail['uploadurl'] = this.currentContent.thumbnail; // Firebase URL string — not a File
            this.Thumbnailurl.push(thumbnail);
          } else {
            this.Thumbnailurl = [];
          }
        } else {
          this.filteredTaxonomyList = this.taxonomyList;
        }
        this.editMode = currentContent != null;
      });
    });
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  async uploadThumbnail(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const loadingref = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Loading thumbnail..." }
    });

    const reader = new FileReader();
    reader.onload = () => {
      this.Thumbnailurl.push({
        url: reader.result,
        filename: file.name,
        uploadurl: file, // File object
        size: file.size
      });
      loadingref.close();
    };
    reader.readAsDataURL(file);
  }

  async uploadVideo(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file: File = input.files[0];
    const sizeInfo = this.getSizeInfo(file);
    const loadingref = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Loading video..." }
    });

    try {
      this.Videourl.push({
        url: URL.createObjectURL(file),
        filename: file.name,
        uploadurl: file, // File object
        videoSize: sizeInfo.videoSize,
        videoSizeBytes: sizeInfo.videoSizeBytes
      });
    } catch (error) {
      console.error("Error while creating video preview URL:", error);
    } finally {
      loadingref.close();
    }
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 2000 });
  }

  async cancelVideo(index) {
    const loadingref = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Removing video..." }
    });

    const videoEntry = this.Videourl[index];

    if (this.currentContent == null) {
      // New upload — just remove from local array (blob URL, nothing to delete in storage)
      this.Videourl.splice(index, 1);
    } else {
      // Edit mode — only delete from Firebase Storage if it's an actual Firebase download URL
      const isFirebaseUrl = typeof videoEntry.uploadurl === 'string' &&
        videoEntry.uploadurl.startsWith('https://firebasestorage.googleapis.com');

      if (isFirebaseUrl) {
        try {
          const videoUrlRef = ref(this.storage, videoEntry.uploadurl);
          await deleteObject(videoUrlRef);
        } catch (e) {
          // 404 means already deleted or path changed — safe to ignore
          console.warn('Could not delete video from storage:', e);
        }
      }
      this.Videourl.splice(index, 1);
      this.currentContent.url = null;
    }

    loadingref.close();
  }

  async cancelthumbnail(index) {
    const loadingref = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Removing thumbnail..." }
    });

    const thumbEntry = this.Thumbnailurl[index];

    if (this.currentContent == null) {
      // New upload — just remove from local array
      this.Thumbnailurl.splice(index, 1);
    } else {
      // Edit mode — only delete from Firebase Storage if it's an actual Firebase download URL
      const isFirebaseUrl = typeof thumbEntry.uploadurl === 'string' &&
        thumbEntry.uploadurl.startsWith('https://firebasestorage.googleapis.com');

      if (isFirebaseUrl) {
        try {
          const ThumbnailurlRef = ref(this.storage, thumbEntry.uploadurl);
          await deleteObject(ThumbnailurlRef);
        } catch (e) {
          console.warn('Could not delete thumbnail from storage:', e);
        }
      }
      this.Thumbnailurl.splice(index, 1);
      this.currentContent.thumbnail = null;
    }

    loadingref.close();
  }

  sanitize(url: string) {
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  onTagSearch(event) {
    let value = ![null, undefined, ""].includes(event.target.value)
      ? event.target.value.trim().toLowerCase()
      : "";
    this.filteredTaxonomyList = this.taxonomyList.filter(
      e => e['name'] && e['name'].toLowerCase().indexOf(value) === 0
    );
  }

  onTagSelect(tagid) {
    this.tags.push(tagid);
    this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id));
  }

  onTagRemove(index) {
    this.tags.splice(index, 1);
    this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id));
  }

  private getSizeInfo(file: File) {
    const bytes = file.size;
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    return {
      videoSizeBytes: bytes,
      videoSize: `${mb} MB`
    };
  }

  // Resumable upload with progress tracking
  private uploadFileWithProgress(file: File, storagePath: string, label: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.uploadLabel = label;
      this.uploadProgress = 0;
      this.isUploading = true;

      const storageRef = ref(this.storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          this.uploadProgress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
        },
        (error) => {
          this.isUploading = false;
          console.error(`Upload failed [${label}]:`, error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            this.isUploading = false;
            resolve(downloadURL);
          } catch (e) {
            this.isUploading = false;
            reject(e);
          }
        }
      );
    });
  }

  async submit(value) {
    if (this.Videourl.length === 0) {
      alert('Please select a video');
      return;
    }
    if (this.Thumbnailurl.length === 0) {
      alert('Please select a thumbnail');
      return;
    }

    this.isUploading = true;

    try {
      if (this.currentContent != null) {
        // ── EDIT MODE ──────────────────────────────────────────────
        let videourl: string | null = null;
        let thumbnailurl: string | null = null;
        let sizeInfo: any = null;

        // Upload new video only if the old one was removed and a new File was selected
        const videoIsNewFile = this.Videourl[0]?.uploadurl instanceof File;
        if (this.currentContent.url == null && videoIsNewFile) {
          const filepath = `Surprise Content/${this.Videourl[0]['filename']}`;
          videourl = await this.uploadFileWithProgress(
            this.Videourl[0]['uploadurl'],
            filepath,
            'Uploading video...'
          );
          sizeInfo = this.getSizeInfo(this.Videourl[0]['uploadurl']);
        }

        // Upload new thumbnail only if the old one was removed and a new File was selected
        const thumbIsNewFile = this.Thumbnailurl[0]?.uploadurl instanceof File;
        if (this.currentContent.thumbnail == null && thumbIsNewFile) {
          this.uploadLabel = 'Uploading thumbnail...';
          this.uploadProgress = 0;
          const imagePath = `Surprise Content/${this.Thumbnailurl[0]['filename']}`;
          const storageRef = ref(this.storage, imagePath);
          const uploadTask = uploadBytesResumable(storageRef, this.Thumbnailurl[0]['uploadurl']);
          thumbnailurl = await new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed',
              (snapshot) => {
                this.uploadProgress = Math.round(
                  (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                );
              },
              (error) => reject(error),
              async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
            );
          });
        }

        const docRef = doc(this.firestore, `content_urls/${this.currentContent['docid']}`);

        await updateDoc(docRef, {
          available: value.available,
          addedby: this.loggedinProfileid,
          title: value.title,
          url: videourl ?? this.currentContent.url,
          videoSizeBytes: sizeInfo ? sizeInfo.videoSizeBytes : (this.currentContent.videoSizeBytes ?? null),
          videoSize: sizeInfo ? sizeInfo.videoSize : (this.currentContent.videoSize ?? null),
          thumbnail: thumbnailurl ?? this.currentContent.thumbnail,
          thumbnailsize: this.Thumbnailurl[0]?.['size']
            ? this.Thumbnailurl[0]['size']
            : (this.currentContent.thumbnailsize ?? null),
          type: this.type,
          publishdate: this.publishdate,
          hero: this.hero,
          tags: this.tags
        });

        this.openSnackBar("Successfully Content Updated", "");
        this.dialogRef.close();

      } else {
        // ── NEW UPLOAD MODE ────────────────────────────────────────
        const filepath = `Surprise Content/${this.Videourl[0]['filename']}`;
        const videourl = await this.uploadFileWithProgress(
          this.Videourl[0]['uploadurl'],
          filepath,
          'Uploading video...'
        );
        const sizeInfo = this.getSizeInfo(this.Videourl[0]['uploadurl']);

        // Thumbnail upload with progress
        this.uploadLabel = 'Uploading thumbnail...';
        this.uploadProgress = 0;
        const imagepath = `Surprise Content/${this.Thumbnailurl[0]['filename']}`;
        const storageImageRef = ref(this.storage, imagepath);
        const imageUploadTask = uploadBytesResumable(storageImageRef, this.Thumbnailurl[0]['uploadurl']);
        const thumbnailurl = await new Promise<string>((resolve, reject) => {
          imageUploadTask.on('state_changed',
            (snapshot) => {
              this.uploadProgress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
            },
            (error) => reject(error),
            async () => resolve(await getDownloadURL(imageUploadTask.snapshot.ref))
          );
        });

        const docRef = doc(collection(this.firestore, 'content_urls'));

        await setDoc(docRef, {
          docid: docRef.id,
          available: value.available,
          addedby: this.loggedinProfileid,
          added: new Date(),
          title: value.title,
          url: videourl,
          videoSizeBytes: sizeInfo.videoSizeBytes,
          videoSize: sizeInfo.videoSize,
          thumbnail: thumbnailurl,
          thumbnailsize: this.Thumbnailurl[0]['size'] ? this.Thumbnailurl[0]['size'] : null,
          starredby: [],
          type: this.type,
          publishdate: this.publishdate,
          hero: this.hero,
          tags: this.tags
        });

        this.openSnackBar("Successfully Content Added", "");
        this.dialogRef.close();
      }

    } catch (err) {
      console.error('Submit error:', err);
      this.isUploading = false;
      this.openSnackBar("Something went wrong", "");
      this.dialogRef.close();
    }
  }

  dialogClose() {
    this.dialogRef.close();
  }
}