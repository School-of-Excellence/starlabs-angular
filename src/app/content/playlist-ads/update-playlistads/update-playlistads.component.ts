import { Component, Inject } from '@angular/core';
import { Firestore, doc, setDoc, collection } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { ref, uploadBytes, getDownloadURL, Storage } from '@angular/fire/storage';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { CommonModule } from '@angular/common';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-update-playlistads',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatOptionModule,
    CommonModule,
    MatDatepickerModule,
    MatButtonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    DragDropModule
  ],
  templateUrl: './update-playlistads.component.html',
  styleUrl: './update-playlistads.component.css'
})
export class UpdatePlaylistadsComponent {

  filterContentName = ""
  generalContentPlaylist = []
  selectedThumbnail: File | null = null
  playlistads!: FormGroup; 
  loading: boolean = false

  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dailogData: any,
    public dialogRef: MatDialogRef<UpdatePlaylistadsComponent>,
    private domSanitizer: DomSanitizer,
    public firestore: Firestore,
    public storage: Storage
  ) {
    this.playlistads = this.formbuilder.group({
      adstitle: ['', { validators: [Validators.required], updateOn: "change" }],
      adsdescription: ['', { validators: [Validators.required], updateOn: "change" }],
      adslink: ['', { validators: [Validators.required], updateOn: "change" }],
      adstype: ['', { validators: [Validators.required], updateOn: "change" }],
      adsthumbnail: [null, { validators: [], updateOn: "change" }],
      adstrailer: ['', { validators: [Validators.required], updateOn: "change" }],
      startdate: ['', { validators: [Validators.required], updateOn: "change" }],
      enddate: ['', { validators: [Validators.required], updateOn: "change" }],
      playlist: [[], { validators: [Validators.required], updateOn: "change" }],
      available: [true, { validators: [Validators.required], updateOn: "change" }],
      docid: ['', { validators: [], updateOn: "change" }],
    });

    this.generalContentPlaylist = this.dailogData["contentlist"] || [];
    const existingPlaylist = this.dailogData["adsplaylist"];
    
    if (existingPlaylist != null) {
      console.log(existingPlaylist);
      this.playlistads.patchValue(existingPlaylist);
      this.playlistads.patchValue({
        playlist: (existingPlaylist["playlist"] ?? []).map((e: any) => e.id),
        startdate: existingPlaylist["startdate"]?.toDate ? existingPlaylist["startdate"].toDate() : existingPlaylist["startdate"],
        enddate: existingPlaylist["enddate"]?.toDate ? existingPlaylist["enddate"].toDate() : existingPlaylist["enddate"]
      });
    }
  }

  ngOnInit(): void {}

  filterContent() {
    return this.generalContentPlaylist.filter((e: any) => 
      e['title'].toLowerCase().includes(this.filterContentName.trim().toLowerCase())
    );
  }

  importNoteImages(imported: Event) {
    const target = imported.target as HTMLInputElement;
    const files = target.files;
    
    if (files && files.length > 0) {
      console.log(files[0]);
      this.selectedThumbnail = files[0];
      const reader = new FileReader();
      reader.readAsDataURL(this.selectedThumbnail);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          this.playlistads.patchValue({
            adsthumbnail: this.domSanitizer.bypassSecurityTrustUrl(reader.result)
          });
        } else {
          console.log('Error reading file');
        }
      };
    }
  }

  removeNoteImage() {
    this.selectedThumbnail = null;
    this.playlistads.patchValue({
      adsthumbnail: null
    });
  }

async submit(){
  const playlistValue = this.playlistads.value;
  console.log(playlistValue);

  if (this.playlistads.valid && (this.selectedThumbnail || playlistValue["adsthumbnail"])) {
    this.loading = true;
    playlistValue["docid"] = playlistValue["docid"] || doc(collection(this.firestore, 'adsplaylist')).id;
    if (this.selectedThumbnail) {
      try {
        const imagePath = `adsplaylist thumbnail/${this.selectedThumbnail.name}_${this.selectedThumbnail.lastModified}_${this.selectedThumbnail.size}`;
        const storageRef = ref(this.storage, imagePath);
        const snapshot = await uploadBytes(storageRef, this.selectedThumbnail);
        const url = await getDownloadURL(snapshot.ref);
        playlistValue["adsthumbnail"] = url;
      } catch (error) {
        console.error('Thumbnail upload error:', error);
      }
    }
    playlistValue["playlist"] = playlistValue["playlist"].map((id: string) => doc(this.firestore, `content_urls/${id}`));

    try {
      const playlistDocRef = doc(this.firestore, `adsplaylist/${playlistValue["docid"]}`);
      await setDoc(playlistDocRef, playlistValue);
      this.loading = false;
      this.close();
    } catch (error) {
      console.error('Error saving playlist:', error);
      this.loading = false;
    }

  } else {
    alert("Fill every input.");
  }
}


  close() {
    this.dialogRef.close(null);
  }

  drop(event: CdkDragDrop<string[]>) {
    const playlistArray = this.playlistads.get('playlist')?.value || [];
    moveItemInArray(playlistArray, event.previousIndex, event.currentIndex);
    this.playlistads.get('playlist')?.setValue([...playlistArray]);
  }
}