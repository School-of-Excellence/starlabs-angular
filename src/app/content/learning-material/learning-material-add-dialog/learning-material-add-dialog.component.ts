import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  collection,
  doc,
  DocumentReference,
  Firestore,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  Storage,
} from '@angular/fire/storage';
import { MatSelectModule } from '@angular/material/select';

interface UploadedFile {
  name: string;
  url: string;
  size: string;
  type: string;
  storagePath: string;
}

interface UploadingFile {
  name: string;
  progress: number;
}

@Component({
  selector: 'app-learning-material-add-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    CdkDropList,
    CdkDrag,
    MatSelectModule
  ],
  templateUrl: './learning-material-add-dialog.component.html',
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css']
})
export class LearningMaterialAddDialogComponent {
  isEditMode = false;
  materialId: string | null = null;
  selectedTier: string[] = [];
  type: 'free' | 'tier' = 'tier';
  available:'yes'|'no' ='yes';
  tierList: any[] = [];
  name = '';
  description = '';
  files: UploadedFile[] = [];
  uploadingFiles: UploadingFile[] = [];
  isDragOver = false;
  saving = false;
  thumbnailUrl: string = '';
  thumbnailUploading = false;
  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private dialogRef: MatDialogRef<LearningMaterialAddDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: { editMode: boolean; materialId?: string; material?: any }
  ) {
    const tierRef = collection(this.firestore, 'tier');
    getDocs(tierRef).then((res) => {
      this.tierList = res.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
    });
    this.isEditMode = data.editMode;
    this.materialId = data.materialId || null;

    if (this.isEditMode && data.material) {
      this.name = data.material.name || '';
      this.description = data.material.description || '';
      this.type = data.material.type || '';
      this.available = data.material.available || '';
      this.thumbnailUrl = data.material.thumbnail || '';
      if (this.type === 'tier') {
        const tierRefs: any[] = data.material.tier || [];

        this.selectedTier = tierRefs.map((t: any) =>
          t instanceof DocumentReference ? t.id : t
        );
      } else {
        this.selectedTier = [];
      }
      this.files = (data.material.files || []).map((f: any) => ({ ...f }));
    }
  }
  async onThumbnailSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];

    if (!file.type.startsWith('image/')) {
      alert('Only image files allowed');
      return;
    }

    this.thumbnailUploading = true;

    try {
      const timestamp = Date.now();
      const storagePath = `learning-materials/thumbnails/${timestamp}_${file.name}`;
      const storageRef = ref(this.storage, storagePath);

      const uploadTask = await uploadBytesResumable(storageRef, file);

      const url = await getDownloadURL(uploadTask.ref);

      this.thumbnailUrl = url;

    } catch (err) {
      console.error('Thumbnail upload failed', err);
    } finally {
      this.thumbnailUploading = false;
    }

    input.value = '';
  }
  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.uploadFiles(Array.from(input.files));
    input.value = '';
  }
  ontypeChange() {
    if (this.type !== 'tier') {
      this.selectedTier = [];
    }
  }
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    if (event.dataTransfer?.files?.length) {
      this.uploadFiles(Array.from(event.dataTransfer.files));
    }
  }

  private uploadFiles(fileList: File[]) {
    for (const file of fileList) {
      const timestamp = Date.now();
      const storagePath = `learning-materials/${timestamp}_${file.name}`;
      const storageRef = ref(this.storage, storagePath);
      const uploadingEntry: UploadingFile = { name: file.name, progress: 0 };
      this.uploadingFiles.push(uploadingEntry);
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          uploadingEntry.progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
        },
        (error) => {
          console.error('Upload error:', error);
          this.uploadingFiles = this.uploadingFiles.filter((u) => u !== uploadingEntry);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          this.files.push({
            name: file.name,
            url: url,
            size: this.formatFileSize(file.size),
            type: file.type || this.getFileExtension(file.name),
            storagePath: storagePath,
          });
          this.uploadingFiles = this.uploadingFiles.filter((u) => u !== uploadingEntry);
        }
      );
    }
  }

  async removeFile(index: number) {
    const file = this.files[index];
    if (file.storagePath) {
      try {
        await deleteObject(ref(this.storage, file.storagePath));
      } catch (e) {
        console.warn('Failed to delete file from storage:', e);
      }
    }
    this.files.splice(index, 1);
  }
  dropFile(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.files, event.previousIndex, event.currentIndex);
  }
  openFile(url: string) {
    window.open(url, '_blank');
  }
  async onSave() {
    if (!this.name.trim()) return;
    this.saving = true;

    try {
      const filesData = this.files.map((f) => ({
        name: f.name,
        url: f.url,
        size: f.size,
        type: f.type,
        storagePath: f.storagePath,
      }));

      if (this.isEditMode && this.materialId) {
        const docRef = doc(this.firestore, 'learning-materials', this.materialId);
        let tierRefs: DocumentReference[] | null = null;

        if (this.type === 'tier') {
          tierRefs = this.selectedTier.map((tid) =>
            doc(this.firestore, 'tier', tid)
          );
        }
        await updateDoc(docRef, {
          name: this.name.trim(),
          description: this.description.trim(),
          type:this.type.trim(),
          thumbnail: this.thumbnailUrl,
          available:this.available,
          tier:tierRefs,
          files: filesData,
          updated: serverTimestamp(),
        });
      } else {
        const colRef = collection(this.firestore, 'learning-materials');
        const newDocRef = doc(colRef);
        let tierRefs: DocumentReference[] | null = null;
        if (this.type === 'tier') {
          tierRefs = this.selectedTier.map((tid) =>
            doc(this.firestore, 'tier', tid)
          );
        }
        await setDoc(newDocRef, {
          docid: newDocRef.id,
          name: this.name.trim(),
          type:this.type.trim(),
          available:this.available,
          thumbnail: this.thumbnailUrl,
          tier:tierRefs,
          description: this.description.trim(),
          files: filesData,
          date: serverTimestamp(),
        });
      }

      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error saving material:', err);
    } finally {
      this.saving = false;
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getFileExtension(name: string): string {
    return name.split('.').pop()?.toLowerCase() || '';
  }

  getFileIcon(name: string): string {
    const ext = this.getFileExtension(name);
    const iconMap: { [key: string]: string } = {
      pdf: 'picture_as_pdf',
      doc: 'description',
      docx: 'description',
      xls: 'table_chart',
      xlsx: 'table_chart',
      ppt: 'slideshow',
      pptx: 'slideshow',
      png: 'image',
      jpg: 'image',
      jpeg: 'image',
      gif: 'image',
      bmp: 'image',
      webp: 'image',
      svg: 'image',
    };
    return iconMap[ext] || 'insert_drive_file';
  }
}