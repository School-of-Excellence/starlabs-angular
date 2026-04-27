import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import {
  Firestore,
  collectionData,
  collection,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  onSnapshot
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';


interface Banner {
  title: string;
  description: string;
  seriesRefId: string;
  seriesName?: string;
  buttonname: string;
  externallink:string;
  path: string;
  imageUrl: string;
  imageUrlApp: string;
  videoUrl: string;
  timestamp: number;
  enable: boolean;
}

@Component({
  selector: 'app-eiflix-banner',
  standalone: true,
  templateUrl: './eiflix-banner.component.html',
  styleUrls: ['./eiflix-banner.component.css'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTabsModule,
    MatSortModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatTooltipModule,
    DragDropModule
  ]
})
export class EiflixBannerComponent implements AfterViewInit {
  @ViewChild('tabGroup') tabGroup: any;

  currentEditIndex: number | null = null;
  editingBanner: Banner | null = null;

  form: FormGroup;
  seriesList: any[] = [];

  imagePreview: string | null = null;
  imagePreviewApp: string | null = null;
  videoPreview: string | null = null;

  isUploading = false;
  uploadProgress = 0;

  displayedColumns: string[] = ['image', 'title', 'description', 'seriesName', 'actions'];
  dataSource = new MatTableDataSource<Banner>([]);
  searchText = '';

  priority;

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(
    private firestore: Firestore,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private storage: Storage,
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      description: ['', Validators.required],
      path: ['DeepLink', Validators.required],
      enable:[true, Validators.required],
      seriesId: [''],
      externallink: [''],
      image: [null, Validators.required],
      imageApp: [null, Validators.required],
      video: [null, Validators.required],
      buttonname: ['']
    });

    this.loadSeries();
    this.loadBanners();
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    
    // Custom filter predicate
    this.dataSource.filterPredicate = (data: Banner, filter: string) => {
      const searchStr = filter.toLowerCase();
      return data.title.toLowerCase().includes(searchStr) ||
             data.description.toLowerCase().includes(searchStr) ||
             (data.seriesName?.toLowerCase().includes(searchStr) || false)
    };
  }

  loadSeries() {
    const seriesRef = collection(this.firestore, 'series');
    collectionData(seriesRef, { idField: 'id' }).subscribe(data => {
      this.seriesList = data;
      // Update series names in table data
      this.updateSeriesNames();
    });
  }

  loadBanners() {
    const docRef = doc(this.firestore, 'static meta data', 'EiFlix Banner');
    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const banners = docSnap.data()['banner'] || [];
        this.priority = docSnap.data()['priority'] || 'workshop';
        this.dataSource.data = banners;
        this.updateSeriesNames();
      }
    });
  }

  updateSeriesNames() {
    if (this.seriesList.length > 0 && this.dataSource.data.length > 0) {
      const updatedData = this.dataSource.data.map(banner => {
        const series = this.seriesList.find(s => s.id === banner.seriesRefId);
        return {
          ...banner,
          seriesName: series?.seriesName || 'Unknown'
        };
      });
      this.dataSource.data = updatedData;
    }
  }

  applyFilter() {
    this.dataSource.filter = this.searchText.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  clearSearch() {
    this.searchText = '';
    this.applyFilter();
  }

  onImageSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.form.patchValue({ image: file });
      const reader = new FileReader();
      reader.onload = () => this.imagePreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }
  onImageSelectedApp(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.form.patchValue({ imageApp: file });
      const reader = new FileReader();
      reader.onload = () => this.imagePreviewApp = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  onVideoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.form.patchValue({ video: file });
      const reader = new FileReader();
      reader.onload = () => this.videoPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }
  onPathChange() {
    const path = this.form.get('path')?.value;

    if (path === 'DeepLink') {
      this.form.get('externallink')?.setValue('');
      this.form.get('externallink')?.clearValidators();
      
      this.form.get('seriesId')?.setValidators([Validators.required]);
      this.form.get('seriesId')?.setValue('');

    } else if (path === 'External Link') {
      this.form.get('seriesId')?.setValue('');
      this.form.get('seriesId')?.clearValidators();

      this.form.get('externallink')?.setValidators([Validators.required]);
      this.form.get('externallink')?.setValue('');
    }

    this.form.get('seriesId')?.updateValueAndValidity();
    this.form.get('externallink')?.updateValueAndValidity();
  }

  async submit() {
    const formValue = this.form.value;

    if (!formValue.title || !formValue.description) {
      this.snackBar.open("Please fill all fields", "OK", { duration: 2000 });
      return;
    }

    this.isUploading = true;
    this.uploadProgress = 0;

    try {
      const docRef = doc(this.firestore, 'static meta data', 'EiFlix Banner');
      const docSnap = await getDoc(docRef);

      let existing: Banner[] = docSnap.exists() ? docSnap.data()['banner'] || [] : [];

      let imageUrl = this.editingBanner?.imageUrl || '';
      let imageUrlApp = this.editingBanner?.imageUrlApp || '';
      let videoUrl = this.editingBanner?.videoUrl || '';

      // Only upload if NEW FILE selected
      if (formValue.image instanceof File) {
        const imageRef = ref(this.storage, `eiflixbanner/images/${Date.now()}_${formValue.image.name}`);
        imageUrl = await this.uploadWithProgress(imageRef, formValue.image, 0, 50);
      }
      if (formValue.imageApp instanceof File) {
        const imageRef = ref(this.storage, `eiflixbanner/images/${Date.now()}_${formValue.imageApp.name}`);
        imageUrlApp = await this.uploadWithProgress(imageRef, formValue.imageApp, 0, 50);
      }
      if (formValue.video instanceof File) {
        const videoRef = ref(this.storage, `eiflixbanner/videos/${Date.now()}_${formValue.video.name}`);
        videoUrl = await this.uploadWithProgress(videoRef, formValue.video, 50, 100);
      }

      const updatedBanner: Banner = {
        title: formValue.title,
        description: formValue.description,
        path: formValue.path,
        enable: formValue.enable,
        seriesRefId: formValue.seriesId,
        buttonname: formValue.buttonname || '',
        externallink: formValue.externallink || '',
        imageUrl: imageUrl,
        imageUrlApp: imageUrlApp,
        videoUrl: videoUrl,
        timestamp: this.currentEditIndex !== null 
          ? this.editingBanner!.timestamp
          : Date.now()
      };

      if (this.currentEditIndex !== null) {
        existing[this.currentEditIndex] = updatedBanner;
      } else {
        existing.push(updatedBanner);
      }

      await updateDoc(docRef, { banner: existing });

      this.snackBar.open(
        this.currentEditIndex !== null ? "Banner updated successfully!" : "Banner saved successfully!",
        "OK", 
        { duration: 2000 }
      );

      this.resetForm();
      this.currentEditIndex = null;
      this.editingBanner = null;
    } catch (error) {
      console.error('Error saving banner:', error);
      this.snackBar.open("Error saving banner", "OK", { duration: 2000 });
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
    }
  }


  resetForm() {
    this.form.reset({
      path: 'DeepLink'
    });
    this.imagePreview = null;
    this.imagePreviewApp = null;
    this.videoPreview = null;
    this.currentEditIndex = null;
    this.editingBanner = null;
  }

  async editBanner(banner: Banner, index: number) {
    this.currentEditIndex = index;
    this.editingBanner = banner;

    this.form.patchValue({
      title: banner.title,
      description: banner.description,
      path: banner.path,
      enable: banner.enable,
      seriesId: banner.seriesRefId || '',
      externallink: banner.externallink || '',
      buttonname: banner.buttonname || ''
    });

    this.imagePreview = banner.imageUrl;
    this.imagePreviewApp = banner.imageUrlApp;
    this.videoPreview = banner.videoUrl;

    this.tabGroup.selectedIndex = 0;
  }

  async deleteBanner(banner: Banner, index: number) {
    if (!confirm('Are you sure you want to delete this banner?')) return;

    try {
      if (banner.imageUrl) {
        try {
          const imageRef = ref(this.storage, banner.imageUrl);
          await deleteObject(imageRef);
        } catch (e) {
          console.log('Image already deleted or not found');
        }
      }
      if (banner.imageUrlApp) {
        try {
          const imageRef = ref(this.storage, banner.imageUrlApp);
          await deleteObject(imageRef);
        } catch (e) {
          console.log('App Image already deleted or not found');
        }
      }
      if (banner.videoUrl) {
        try {
          const videoRef = ref(this.storage, banner.videoUrl);
          await deleteObject(videoRef);
        } catch (e) {
          console.log('Video already deleted or not found');
        }
      }
      const docRef = doc(this.firestore, 'static meta data', 'EiFlix Banner');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        let banners: Banner[] = docSnap.data()['banner'] || [];
        banners = banners.filter((_, i) => i !== index);
        await updateDoc(docRef, { banner: banners });
        this.snackBar.open("Banner deleted successfully!", "OK", { duration: 2000 });
      }
    } catch (error) {
      console.error('Error deleting banner:', error);
      this.snackBar.open("Error deleting banner", "OK", { duration: 2000 });
    }
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  openVideo(videoUrl: string) {
    window.open(videoUrl, '_blank');
  }

  private uploadWithProgress(storageRef: any, file: File, startPercent: number, endPercent: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const metadata = {
        contentType: file.type || this.getMimeType(file.name)
      };

      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on('state_changed',
        (snapshot) => {
          const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes);
          this.uploadProgress = Math.round(startPercent + fileProgress * (endPercent - startPercent));
        },
        (error) => {
          this.isUploading = false;
          reject(error);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        }
      );
    });
  }
  async toggleEnable(banner: Banner) {
    const docRef = doc(this.firestore, 'static meta data', 'EiFlix Banner');
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    let banners: Banner[] = docSnap.data()['banner'] || [];
    const index = banners.findIndex(b => b.timestamp === banner.timestamp);

    if (index !== -1) {
      banners[index].enable = !banners[index].enable;
      await updateDoc(docRef, { banner: banners });
      this.snackBar.open("Status changed!", "OK", { duration: 2000 });
    }
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogg': 'video/ogg',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  dropTable(event: CdkDragDrop<Banner[]>) {
    const prev = [...this.dataSource.data];
    moveItemInArray(this.dataSource.data, event.previousIndex, event.currentIndex);
    this.dataSource.data = [...this.dataSource.data];
    this.saveBannerOrder();
  }

  async saveBannerOrder() {
    const docRef = doc(this.firestore, 'static meta data', 'EiFlix Banner');
    try {
      await updateDoc(docRef, { banner: this.dataSource.data });
      this.snackBar.open('Order updated!', 'OK', { duration: 1500 });
    } catch (e) {
      this.snackBar.open('Failed to update order', 'OK', { duration: 2500 });
    }
  }
  async workshopPriority() {
    const docRef = doc(this.firestore, 'static meta data', 'EiFlix Banner');
    try {
      await updateDoc(docRef, { priority: this.priority });
      this.snackBar.open('Priority updated!', 'OK', { duration: 1500 });
    } catch (e) {
      this.snackBar.open('Failed to update order', 'OK', { duration: 2500 });
    }
  }
}