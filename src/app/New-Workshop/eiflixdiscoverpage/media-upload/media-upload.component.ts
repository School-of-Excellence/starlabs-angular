import { Component, Input, ViewChild, ElementRef, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Storage,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from '@angular/fire/storage';

/**
 * Reusable media uploader.
 *
 * Drop it anywhere with a reactive form:
 *   <app-media-upload type="video" formControlName="orientationvideo"></app-media-upload>
 *   <app-media-upload type="image" formControlName="orientationthumbnail"></app-media-upload>
 *
 * - `type` restricts the file picker to video-only or image-only.
 * - Uploads to Firebase Storage under `folder` (default `eiflixdiscover`) and
 *   writes the resulting download URL back into the bound form control.
 */
@Component({
  selector: 'app-media-upload',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './media-upload.component.html',
  styleUrl: './media-upload.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MediaUploadComponent),
      multi: true
    }
  ]
})
export class MediaUploadComponent implements ControlValueAccessor {
  /** Restricts the picker and preview. */
  @Input() type: 'video' | 'image' = 'image';
  /** Storage folder to upload into. */
  @Input() folder = 'eiflixdiscover';
  /** Max file size in MB. 0 = use a sensible default per type. */
  @Input() maxSizeMb = 0;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  /** Current value = the stored download URL. */
  value = '';
  disabled = false;

  isUploading = false;
  uploadProgress = 0;
  fileName = '';
  dragging = false;

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private storage: Storage,
    private snackBar: MatSnackBar
  ) {}

  // ---- display helpers ----
  get isVideo(): boolean { return this.type === 'video'; }
  get acceptAttr(): string { return this.isVideo ? 'video/*' : 'image/*'; }
  get chooseLabel(): string { return this.isVideo ? 'Choose video' : 'Choose image'; }
  get emptyIcon(): string { return this.isVideo ? 'movie' : 'image'; }
  get formatHint(): string {
    return this.isVideo ? 'MP4, WebM or MOV' : 'PNG, JPG, WebP or GIF';
  }
  private get effectiveMaxMb(): number {
    return this.maxSizeMb > 0 ? this.maxSizeMb : (this.isVideo ? 500 : 15);
  }

  // ---- ControlValueAccessor ----
  writeValue(val: string): void { this.value = val || ''; }
  registerOnChange(fn: (val: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }

  // ---- interaction ----
  openPicker(): void {
    if (this.disabled || this.isUploading) return;
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (file) this.handleFile(file);
    input.value = ''; // allow re-selecting the same file
  }

  onDragOver(event: DragEvent): void {
    if (this.disabled || this.isUploading) return;
    event.preventDefault();
    this.dragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (this.disabled || this.isUploading) return;
    const file = event.dataTransfer?.files && event.dataTransfer.files[0];
    if (file) this.handleFile(file);
  }

  remove(): void {
    this.value = '';
    this.fileName = '';
    this.onChange('');
    this.onTouched();
  }

  copyUrl(): void {
    if (!this.value) return;
    navigator?.clipboard?.writeText(this.value)
      .then(() => this.snackBar.open('URL copied to clipboard.', 'Close', { duration: 1500 }))
      .catch(() => {});
  }

  // ---- upload ----
  private handleFile(file: File): void {
    const okType = this.isVideo ? file.type.startsWith('video/') : file.type.startsWith('image/');
    if (!okType) {
      this.snackBar.open(`Please choose a ${this.type} file only.`, 'Close', { duration: 3000 });
      return;
    }

    const maxBytes = this.effectiveMaxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      this.snackBar.open(`File is too large. Maximum is ${this.effectiveMaxMb} MB.`, 'Close', { duration: 3500 });
      return;
    }

    this.upload(file);
  }

  private upload(file: File): void {
    this.isUploading = true;
    this.uploadProgress = 0;
    this.fileName = file.name;

    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${this.folder}/${Date.now()}_${safeName}`;
    const storageRef = ref(this.storage, path);
    const metadata = { contentType: file.type || undefined };

    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      'state_changed',
      snapshot => {
        this.uploadProgress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      error => {
        console.error('Media upload failed:', error);
        this.isUploading = false;
        this.snackBar.open('Upload failed. Please try again.', 'Close', { duration: 3500 });
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          this.value = url;
          this.onChange(url);
          this.onTouched();
          this.snackBar.open(`${this.isVideo ? 'Video' : 'Image'} uploaded.`, 'Close', { duration: 2000 });
        } catch (err) {
          console.error('Could not get download URL:', err);
          this.snackBar.open('Uploaded, but could not read the URL.', 'Close', { duration: 3000 });
        } finally {
          this.isUploading = false;
        }
      }
    );
  }
}
