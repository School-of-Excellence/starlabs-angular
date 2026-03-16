import { Component, EventEmitter, Output } from '@angular/core';
import { FormBuilder, FormArray, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SafeUrl, DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask } from '@angular/fire/storage';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
interface FileObject {
  file: File;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  selected: Date;
  url: string | null;
}
@Component({
  selector: 'app-manual-assignments',
  imports: [
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule, CommonModule,
    MatCardModule,
    ReactiveFormsModule,
    FormsModule
  ],
  templateUrl: './manual-assignments.component.html',
  styleUrl: './manual-assignments.component.css'
})
export class ManualAssignmentsComponent {

  @Output() filesSelected = new EventEmitter<FileObject[]>();
  files: FileObject[] = [];

  // String declarations 
  profileid: string;
  profileAssignmentId: string;
  previewUrl: string = '';
  textContent: string = '';
  safePreviewUrl: SafeUrl = '';
  viewType: string = "";

  // Object declarations
  assignmentDoc: any = {};

  // Array declarations
  selectedFiles: any[] = [];
  selectedHlsFiles = [];
  notesFieldNames = ['Other Notes'];

  // Numeric declarations
  bytesTransferred = 0
  totalbytes = 0
  uploadProgress: number = 0;
  maxFileSize = 10;

  // Boolean declarations
  isuploading: boolean = false;
  uploading: boolean = false;
  isDragging = false;
  previewVisible: boolean = false;
  viewAccess: boolean = false;
  assignmentid;
  profileAssignmentDoc: any = null;
  previewFile: any = null;
  loggedInProfileId: any = null

  notesForm;

  get progress(): number {
    return (this.bytesTransferred / this.totalbytes) * 100;
  }

  constructor(
    private firestore: Firestore,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private storage: Storage,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private router: Router,
    private authservice: AuthguardService
  ) {
    this.notesForm = this.fb.group({
      notes: this.fb.array([])
    });
    this.assignmentid = this.route.snapshot.queryParams['assignmentid'];
    this.profileid = this.route.snapshot.queryParams['profileid']
    this.profileAssignmentId = this.route.snapshot.queryParams['participantAssignmentId'] ?? null
    this.viewType = this.route.snapshot.queryParams['type'];

    this.authservice.getRoles().then(async (roles) => {
      this.loggedInProfileId = roles['profile_ref'].id
      if (this.viewType == 'review') {
        if (roles['admin'] || roles['ah'] || roles['developer']) {
          this.getAssignmentData();
          this.viewAccess = true;
        } else {
          this.viewAccess = false;
          alert("You have no access to the screen");
          this.router.navigateByUrl("/");
        }
      } else if (['create', 'rework'].includes(this.viewType)) {
        if (roles['profile_ref'].id == this.profileid) {
          this.getAssignmentData();
          this.viewAccess = true;
        } else {
          this.viewAccess = false;
          alert("You have no access to the screen");
          this.router.navigateByUrl("/");
        }
      }
    })
  }

  async ngOnInit() {

  }

  getAssignmentData() {
    getDoc(doc(this.firestore, "big assignment", this.route.snapshot.queryParams['assignmentid'])).then(snap => {
      if (snap.exists()) {
        this.assignmentDoc = snap.data();
        getDoc(doc(this.firestore, "big participants assignments", this.profileAssignmentId)).then(assignment => {
          if (assignment.exists()) {
            this.profileAssignmentDoc = assignment.data();

            if (this.viewType == 'review') {
              getDoc(doc(this.firestore, "big assignment manual", this.profileAssignmentDoc['activityref'].id)).then((manual) => {
                if (manual.exists()) {
                  for (let i = 0; i < manual.data()['file'].length; i++) {
                    const filename = manual.data()['file'][i]['name'];
                    this.notesFieldNames.unshift(`${filename}${' '}${'Notes'}`);
                    this.addNote();
                  }
                  this.patchFiles(manual.data()['file']);
                  this.addNote();
                } else {
                  console.log("No Manual Assignment Found");
                }
              })
            }
          } else {
            console.log("No Participant Assigment Found");
          }
        })
      } else {
        console.log("No Assignment Found");
      }
    })
  }

  // Get notes FormArray
  get notes() {
    return this.notesForm.get('notes') as FormArray;
  }

  // Add a new note field
  addNote() {
    this.notes.push(this.fb.group({
      note: ['',]
    }));
  }

  // Remove a note field
  removeNote(index: number) {
    this.notes.removeAt(index);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input?.files) {
      Array.from(input.files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
          let fileType = null
          if (file.type.startsWith("image")) {
            fileType = 'image'
          } else if (file.type.startsWith("audio")) {
            fileType = 'audio'
          } else if (file.type.startsWith("application/pdf")) {
            fileType = 'application/pdf'
          } else if (file.type.startsWith("application/vnd")) {
            fileType = "application/vnd"
          }
          const fileData = {
            file: file,
            size: file.size,
            name: file.name,
            type: fileType,
            preview: fileType === 'application/pdf' ? URL.createObjectURL(file) : e.target?.result as string, // Base64 string for preview
            url: null
          };
          this.selectedFiles.push(fileData);
        };
        if (file.type.startsWith("image") || file.type.startsWith("audio") || file.type.startsWith("application/pdf")) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      });
    }
  }

  trustedurl(url: string) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url)
  }

  onOpen(file) {
    return window.open(file, "_blank")
  }

  async onRemoveFiles(index) {
    if (![null, undefined].includes(this.selectedFiles[index]['url'])) {
      const fileref = ref(this.storage, this.selectedFiles[index]['url'])
      await deleteObject(fileref).catch((error) => {
        console.error(error)
      })
    }
    return this.selectedFiles.splice(index, 1)
  }

  async onSubmit(assignmentStatus) {
    if (this.viewType == 'review') {
      const items = this.notesForm.get('notes').value;
      const notesarray = items.filter(item => item.note && item.note.trim() !== '').map(item => item.note.trim());
      if (notesarray.length > 0) {
        if (assignmentStatus == 'rework') {
          let x = confirm("Mark this assignment for Rework");
          if (x) {
            let activitylog = [];

            if ([null, undefined].includes(this.profileAssignmentDoc['activitylog'])) {
              activitylog.push({
                activityref: this.profileAssignmentDoc['activityref'],
                notes: notesarray,
                reviewdate: new Date(),
                reviewer: this.loggedInProfileId
              })
            } else {
              activitylog = [...this.profileAssignmentDoc['activitylog']];
              activitylog.unshift({
                activityref: this.profileAssignmentDoc['activityref'],
                notes: notesarray,
                reviewdate: new Date(),
                reviewer: this.loggedInProfileId
              })
            }
            await updateDoc(doc(this.firestore, "big participants assignments", this.profileAssignmentId), {
              status: "rework",
              activityref: "",
              activitylog: activitylog,
              updateddate: new Date()
            }).then(() => {
              this.files = [];
              this.openSnackBar("Sucessfully Marked for Rework", "OK");
              this.router.navigateByUrl('/');
            }).catch((error) => {
              this.openSnackBar("Error Marking for Rework", "OK");
            })
          }
        } else if (assignmentStatus == 'completed') {
          let x = confirm("Mark this assignment as Completed");

          if (x) {
            await updateDoc(doc(this.firestore, "big participants assignments", this.profileAssignmentId), {
              status: "completed",
              updateddate: new Date(),
              summary: notesarray
            }).then(() => {
              this.files = [];
              this.openSnackBar("Sucessfully Marked as Completed", "OK");
              this.router.navigateByUrl('/');
            }).catch((error) => {
              this.openSnackBar("Error Marking as Completed", "OK");
            })
          }
        }
      } else {
        alert("Enter atleast 1 note");
      }
    } else {
      if (confirm("Are you sure you want to submit?")) {
        try {
          this.uploading = true;
          const files = await this.uploadToFirestoreStorage();
          const id = doc(collection(this.firestore, 'big assignment manual')).id
          await setDoc(doc(this.firestore, "big assignment manual", id), {
            profileid: this.profileid,
            assigmentid: this.assignmentid,
            participantassignmentid: this.profileAssignmentId,
            cohortref: this.profileAssignmentDoc['cohortsref'],
            marathonref: this.profileAssignmentDoc['marathonref'],
            type: this.assignmentDoc['assignmenttype'],
            file: files,
            date: new Date()
          });
          await updateDoc(doc(this.firestore, "big participants assignments", this.profileAssignmentId), {
            status: "review",
            activityref: doc(this.firestore, "big assignment manual", id),
            updateddate: new Date()
          });

          this.uploading = false;
          this.files = [];
          this.openSnackBar("Successfully Submitted Assignment", "OK");
          this.router.navigateByUrl('/');
        } catch (error) {
          console.error("Error submitting assignment:", error);
          this.uploading = false;
          this.openSnackBar("Error Submitting Assignment", "OK");
        }
      }
    }
  }

  async uploadToFirestoreStorage(): Promise<any[]> {
    try {
      const files: any[] = [];
      this.bytesTransferred = 0;

      this.totalbytes = this.files.reduce((acc, curr) => {
        return acc + curr['size'];
      }, 0);

      for (let i = 0; i < this.files.length; i++) {
        const element = this.files[i];
        if (element['file'] != null) {
          const filepath = `big_assignments/${Date.now()}_${element['name']}`;
          const storageRef = ref(this.storage, filepath);
          const snapshot = await uploadBytes(storageRef, element['file']);
          this.bytesTransferred += snapshot.metadata.size;
          const downloadURL = await getDownloadURL(snapshot.ref);
          files.push({
            url: downloadURL,
            name: element['name'],
            type: element['type'],
            size: element['size']
          });
        }
      }

      return files;
    } catch (error) {
      console.error('Error uploading to Firestore Storage:', error);
      return [];
    }
  }


  onHlsFileSelection(event: any) {
    console.log(event.target.files)
    const files = event.target.files;
    this.selectedHlsFiles = []
    for (let i = 0; i < files.length; i++) {
      const element = files[i];
      this.selectedFiles.push(element)
    }
    this.uploadProgress = 0
    this.isuploading = false
  }

  uploadFiles(): void {
    if (!this.selectedHlsFiles.length) return;
    this.isuploading = true
    const destinationPath = 'hlsaudio-files'
  }

  handleFiles(files: FileList | null): void {
    if (!files) return;

    const validFiles = Array.from(files).filter(file => this.validateFile(file));

    const fileObjects = validFiles.map(file => {
      return {
        file: file,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        selected: new Date(),
        url: null
      };
    });

    this.files = [...this.files, ...fileObjects];

    this.filesSelected.emit(this.files);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  patchFiles(storedFiles: any[] = []): void {

    if (storedFiles.length != 0) {
      const storedFileObjects = storedFiles.map(file => ({
        file: null,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: null,
        selected: new Date(),
        url: file.url
      }));

      this.files = [...storedFileObjects];
    }

    this.filesSelected.emit(this.files);
  }


  validateFile(file: File): boolean {
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > this.maxFileSize) {
      alert(`File ${file.name} is too large. Maximum size is ${this.maxFileSize}MB.`);
      return false;
    }
    return true;
  }

  removeFile(index: number): void {
    this.files.splice(index, 1);
    this.filesSelected.emit(this.files);
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.handleFiles(input.files);
    input.value = '';
    updateDoc(doc(this.firestore, "big participants assignments", this.profileAssignmentId), {
      status: "ongoing"
    })
  }

  getReadableFileSize(size: number): string {
    if (size < 1024) return size + ' B';
    else if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    else return (size / (1024 * 1024)).toFixed(1) + ' MB';
  }

  getFileIcon(file: File | FileObject): string {
    const fileName = file instanceof File ? file.name : file.name;
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(extension)) {
      return 'image';
    } else if (['pdf'].includes(extension)) {
      return 'picture_as_pdf';
    } else if (['doc', 'docx'].includes(extension)) {
      return 'description';
    } else if (['xls', 'xlsx', 'csv'].includes(extension)) {
      return 'table_chart';
    } else if (['ppt', 'pptx'].includes(extension)) {
      return 'slideshow';
    } else if (['zip', 'rar', '7z'].includes(extension)) {
      return 'archive';
    } else if (['mp4', 'mov', 'avi', 'wmv'].includes(extension)) {
      return 'videocam';
    } else {
      return 'insert_drive_file';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    this.handleFiles(event.dataTransfer?.files || null);
  }

  clearAllFiles(): void {
    this.files = [];
    this.filesSelected.emit(this.files);
  }

  // Update the openPreview method
  openPreview(file: any): void {
    this.previewFile = file;
    this.previewVisible = true;

    // If it's a FileObject (with file property)
    const actualFile = file.file || file;

    // Create object URL for preview
    if (actualFile instanceof File) {
      // Create a blob URL
      const blob = new Blob([actualFile], { type: actualFile.type });
      const url = URL.createObjectURL(blob);

      // For images, sanitize differently
      if (this.isImageFile(file)) {
        // Use a direct DOM approach for images to avoid sanitization issues
        this.previewUrl = url;
        setTimeout(() => {
          const img = document.querySelector('.preview-image') as HTMLImageElement;
          if (img) {
            img.src = url;
          }
        }, 0);
      } else {
        // For other file types
        this.previewUrl = url;
        this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      }

      // For text files
      if (this.isTextFile(file)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.textContent = e.target?.result as string || '';
        };
        reader.readAsText(actualFile);
      }
    } else if (file.url) {
      // If it's already uploaded and has a URL
      this.previewUrl = file.url;
      this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(file.url);
    }
  }


  // function to open the snackbar 
  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 3000 });
  }

  closePreview(): void {
    this.previewVisible = false;
    if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewFile = null;
    this.previewUrl = '';
    this.textContent = '';
  }

  // File type checking methods
  isImageFile(file: any): boolean {
    if (!file) return false;
    const name = file.name || '';
    const type = file.type || '';
    return type.startsWith('image/') ||
      ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].some(ext =>
        name.toLowerCase().endsWith(ext));
  }

  isPdfFile(file: any): boolean {
    if (!file) return false;
    const name = file.name || '';
    const type = file.type || '';
    return type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
  }

  isTextFile(file: any): boolean {
    if (!file) return false;
    const name = file.name || '';
    const type = file.type || '';
    return type.startsWith('text/') ||
      ['.txt', '.csv', '.json', '.xml', '.md', '.html', '.css', '.js'].some(ext =>
        name.toLowerCase().endsWith(ext));
  }

  isVideoFile(file: any): boolean {
    if (!file) return false;
    const name = file.name || '';
    const type = file.type || '';
    return type.startsWith('video/') ||
      ['.mp4', '.webm', '.ogg', '.mov'].some(ext =>
        name.toLowerCase().endsWith(ext));
  }

  isAudioFile(file: any): boolean {
    if (!file) return false;
    const name = file.name || '';
    const type = file.type || '';
    return type.startsWith('audio/') ||
      ['.mp3', '.wav', '.ogg', '.m4a'].some(ext =>
        name.toLowerCase().endsWith(ext));
  }

  canPreview(file: any): boolean {
    return this.isImageFile(file) ||
      this.isPdfFile(file) ||
      this.isTextFile(file) ||
      this.isVideoFile(file) ||
      this.isAudioFile(file);
  }

  downloadFile(file: any): void {
    if (!file) return;

    // If it's a FileObject with a file property
    if (file.file instanceof File) {
      const url = URL.createObjectURL(file.file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (file.url) {
      // If it's already uploaded and has a URL
      window.open(file.url, '_blank');
    }
  }

}
