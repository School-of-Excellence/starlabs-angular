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
  onSnapshot,
  addDoc,
  deleteDoc,
  getDocs,
  serverTimestamp
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
import { MatDialogRef } from '@angular/material/dialog';


interface Banner {
  id?: string;
  title: string;
  description: string;
  seriesRefId: string;
  seriesName?: string;
  buttonname: string;
  externallink: string;
  path: string;
  imageUrl: string;
  imageUrlApp: string;
  videoUrl: string;
  timestamp: number;
  enable: boolean;
  enableapp: boolean;
  order?: number;
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

  displayedColumns: string[] = ['drag', 'image', 'title', 'seriesName', 'status', 'actions'];
  dataSource = new MatTableDataSource<Banner>([]);
  searchText = '';

  priority: string = 'workshop';

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(
    private firestore: Firestore,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private storage: Storage,
    private dialogRef: MatDialogRef<EiflixBannerComponent>
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      description: ['', Validators.required],
      path: ['DeepLink', Validators.required],
      enable: [true, Validators.required],
      enableapp: [true, Validators.required],
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
    this.dataSource.filterPredicate = (data: Banner, filter: string) => {
      const searchStr = filter.toLowerCase();
      return data.title.toLowerCase().includes(searchStr) ||
        data.description.toLowerCase().includes(searchStr) ||
        (data.seriesName?.toLowerCase().includes(searchStr) || false);
    };
  }

  async loadSeries() {
    const seriesRef = collection(this.firestore, 'series');
    const snapshot = await getDocs(seriesRef);
    this.seriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    this.updateSeriesNames();
  }

  async loadPriority() {
    const docRef = doc(this.firestore, 'static meta data', 'EiFlix Banner');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      this.priority = docSnap.data()['priority'] || 'workshop';
    }
  }
  async loadBanners() {
    const bannerRef = collection(this.firestore, 'eiflixbanner');
    const snapshot = await getDocs(bannerRef);
    const data: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    data.sort((a, b) => (a.order || 0) - (b.order || 0));
    this.dataSource.data = data;
    this.updateSeriesNames();
    this.loadPriority();
  }

  updateSeriesNames() {
    if (this.seriesList.length > 0 && this.dataSource.data.length > 0) {
      const updatedData = this.dataSource.data.map(banner => {
        const series = this.seriesList.find(s => s.id === banner.seriesRefId);
        return {
          ...banner,
          seriesName: series?.seriesName || (banner.path === 'DeepLink' ? 'Unknown' : null)
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
      this.snackBar.open('Please fill all fields', 'OK', { duration: 2000 });
      return;
    }

    this.isUploading = true;

    try {
      const bannerRef = collection(this.firestore, 'eiflixbanner');

      const snapshot = await getDocs(bannerRef);
      let maxOrder = 0;
      snapshot.forEach((docSnap) => {
        const data: any = docSnap.data();
        if (data.order && data.order > maxOrder) {
          maxOrder = data.order;
        }
      });

      let imageUrl = '';
      let imageUrlApp = '';
      let videoUrl = '';

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

      await addDoc(bannerRef, {
        title: formValue.title,
        description: formValue.description,
        path: formValue.path,
        enable: formValue.enable,
        enableapp: formValue.enableapp,
        seriesRefId: formValue.seriesId,
        buttonname: formValue.buttonname || '',
        externallink: formValue.externallink || '',
        imageUrl,
        imageUrlApp,
        videoUrl,
        timestamp: serverTimestamp(),
        order: maxOrder + 1
      });
      await this.loadBanners();
      this.snackBar.open('Banner added!', 'OK', { duration: 2000 });
      this.resetForm();

    } catch (error) {
      console.error(error);
      this.snackBar.open('Error saving banner', 'OK', { duration: 2000 });
    } finally {
      this.isUploading = false;
    }
  }

  resetForm() {
    this.form.reset({
      path: 'DeepLink',
      enable: true,
      enableapp:true
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
      enableapp: banner.enableapp,
      seriesId: banner.seriesRefId || '',
      externallink: banner.externallink || '',
      buttonname: banner.buttonname || ''
    });

    this.imagePreview = banner.imageUrl;
    this.imagePreviewApp = banner.imageUrlApp;
    this.videoPreview = banner.videoUrl;

    this.tabGroup.selectedIndex = 0;
  }

  async togglePlatform(banner: any, platform: 'web' | 'app') {
    const field = platform === 'web' ? 'enable' : 'enableapp';
    const newValue = !banner[field];
    await updateDoc(doc(this.firestore, 'eiflixbanner', banner.id), {
      [field]: newValue
    });
    banner[field] = newValue;
  }

  async deleteBanner(banner: any, index?: number) {
    if (!confirm('Delete this banner?')) return;
    await deleteDoc(doc(this.firestore, 'eiflixbanner', banner.id));
    await this.loadBanners();
    this.snackBar.open('Deleted!', 'OK', { duration: 2000 });
    
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
    moveItemInArray(this.dataSource.data, event.previousIndex, event.currentIndex);
    this.dataSource.data = [...this.dataSource.data];
    this.saveBannerOrder();
  }

  async saveBannerOrder() {
    try {
      const updates = this.dataSource.data.map((banner, index) => {
        return updateDoc(
          doc(this.firestore, 'eiflixbanner', banner.id!),
          { order: index + 1 }
        );
      });

      await Promise.all(updates);
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
      this.snackBar.open('Failed to update priority', 'OK', { duration: 2500 });
    }
  }
  closeDialog() {
    this.dialogRef.close();
  }
}