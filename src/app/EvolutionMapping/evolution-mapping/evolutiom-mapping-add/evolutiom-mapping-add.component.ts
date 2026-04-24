import * as XLSX from 'xlsx';
import { Component, OnInit, Inject } from '@angular/core';
import { Firestore, collection, writeBatch, collectionData, query, where, getDoc, setDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { AuthguardService } from '../../../authguard.service';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { VideoPlayerComponent } from '../../video-player.component';

@Component({
  selector: 'app-evolutiom-mapping-add',
  imports: [
    MatFormFieldModule,
    CommonModule, MatDatepickerModule, FormsModule, MatSelectModule,
    MatProgressBarModule, NgxMatSelectSearchModule, MatInputModule,
    MatButtonModule, MatIconModule, MatTableModule,
    VideoPlayerComponent
  ],
  templateUrl: './evolutiom-mapping-add.component.html',
  styleUrl: './evolutiom-mapping-add.component.css'
})
export class EvolutiomMappingAddComponent implements OnInit {

  mapProfile: { [key: string]: string } = {};
  loading: boolean = true;
  disableButton: boolean = false;
  searchTerm: string = '';
  selectedProfile: string | null = null;
  filteredKeys: string[] = [];
  title: string = '';
  videourl: string = '';
  recordedDate: Date | null = null;
  selectedVideos: Set<string> = new Set<string>();
  editVideoUrl: string = '';
  editVideoTitle: string = '';
  editRecordedDate: Date | null = null;
  videoTitleOptions: { id: string; title: string; videourl: string; recordeddate: any; type: string }[] = [];
  previewVideo: any = null;
  importPreview: any[] = [];
  mapEmailData: any = {};
  showPreviewPlayer: boolean = false;

  constructor(
    public firestore: Firestore,
    private guard: AuthguardService,
    private storage: Storage,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<EvolutiomMappingAddComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public router: Router,
  ) {
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
      this.mapEmailData = e.mapEmailData;
      this.filteredKeys = this.getKeys(this.mapProfile);
    }).then(() => {
      this.loading = false;
    });
  }

  ngOnInit(): void {
    if (this.data) {
      this.selectedProfile = this.data.profileid;
      this.title = this.data.title;
      this.recordedDate = this.data.recordeddate?.toDate ? this.data.recordeddate.toDate() : null;
      this.videourl = this.data.videourl;
      this.editVideoTitle = this.data.title;
      this.editVideoUrl = this.data.videourl;
      this.editRecordedDate = this.data.recordeddate?.toDate ? this.data.recordeddate.toDate() : null;
      this.recordedDate = this.editRecordedDate;
      this.showPlayer = true;
      this.onSelect(this.selectedProfile, true).then(() => {
        const matched = this.videoTitleOptions.find(v => v.title === this.data.title);
        if (matched) {
          this.selectedType = matched.type;
          this.filteredVideoOptions = this.videoTitleOptions.filter(v => v.type === matched.type);
          this.selectedVideos.add(matched.title);
        }
      });
    }
  }

  getKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  filterOptions(): void {
    this.filteredKeys = this.getKeys(this.mapProfile).filter(key =>
      this.mapProfile[key].toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  async onSelect(selectedId: string, skipReset: boolean = false): Promise<void> {
    this.selectedProfile = selectedId;
    this.videoTitleOptions = [];

    if (!skipReset) {
      this.selectedVideos.clear();
      this.showPlayer = false;
      this.title = '';
      this.videourl = '';
      this.recordedDate = null;
      this.selectedType = null;
      this.filteredVideoOptions = [];
      this.videoTypes = [];
    }

    const profileDataSnap = await getDocs(
      query(collection(this.firestore, 'profile_data'),
        where('name', '==', selectedId))
    );

    if (profileDataSnap.empty) return;
    const profileid = profileDataSnap.docs[0].data()['profileid'] || selectedId;

    const videoSnap = await getDocs(
      query(
        collection(this.firestore, 'participant videos'),
        where('profileid', '==', profileid),
        where('delete', '==', false)
      )
    );

    this.videoTitleOptions = videoSnap.docs.map((d) => ({
      id: d.id,
      title: d.data()['title'] || 'Untitled',
      videourl: d.data()['videourl'] || '',
      recordeddate: d.data()['recordeddate'] || null,
      type: d.data()['type'] || 'Other',
    }));

    // Build unique types
    this.videoTypes = [...new Set(this.videoTitleOptions.map(v => v.type))];
    this.selectedType = null;
    this.filteredVideoOptions = [];
    this.previewVideo = null;
  }

  videoTypes: string[] = [];
  selectedType: string | null = null;
  filteredVideoOptions: any[] = [];

  onTypeSelect(type: string): void {
    this.selectedType = type;
    this.filteredVideoOptions = this.videoTitleOptions.filter(v => v.type === type);
  }

  showPlayer: boolean = false;

  convertDropboxUrl(url: string): string {
    if (!url || !url.includes('dropbox.com')) return url;
    return url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/[?&]dl=\d/, '')
      .replace(/[?&]raw=\d/, '')
      + (url.includes('?') ? '&' : '?') + 'raw=1';
  }

  getTypeCount(type: string): number {
    return this.videoTitleOptions.filter(v => v.type === type).length;
  }

  onVideoTitleSelect(video: any, previewOnly: boolean = false): void {
    if (this.data != null) {
      this.selectedVideos.clear();
      this.selectedVideos.add(video.title);
      this.editVideoTitle = video.title;
      this.title = video.title;
      this.editVideoUrl = this.convertDropboxUrl(video.videourl);
      this.videourl = this.editVideoUrl;
      this.editRecordedDate = video.recordeddate?.toDate? video.recordeddate.toDate(): video.recordeddate ? new Date(video.recordeddate) : null;
      this.recordedDate = this.editRecordedDate;
      this.showPlayer = false;
      setTimeout(() => { this.showPlayer = true; }, 50);
      return;
    }
    if (this.selectedVideos.has(video.title)) {
      if (previewOnly) {
        this.showPreviewPlayer = false;
        this.previewVideo = {
          ...video,
          videourl: this.convertDropboxUrl(video.videourl),
          recordedDate: video.recordeddate?.toDate ? video.recordeddate.toDate() : video.recordeddate ? new Date(video.recordeddate) : null
        };
        setTimeout(() => { this.showPreviewPlayer = true; }, 50);
        return;
      }
      this.selectedVideos.delete(video.title);
      this.selectedVideos = new Set(this.selectedVideos);
      if (this.previewVideo?.title === video.title) {
        this.previewVideo = null;
      }
    } else {
      this.selectedVideos.add(video.title);
      this.selectedVideos = new Set(this.selectedVideos);
      this.showPreviewPlayer = false;
      this.previewVideo = {
        ...video,
        videourl: this.convertDropboxUrl(video.videourl),
        recordedDate: video.recordeddate?.toDate ? video.recordeddate.toDate() : video.recordeddate ? new Date(video.recordeddate) : null
      };
      setTimeout(() => { this.showPreviewPlayer = true; }, 50);
    }
  }

  isVideoSelected(title: string): boolean {
    return this.selectedVideos.has(title);
  }

  getSelectedVideoObjects(): any[] {
    return this.videoTitleOptions.filter(v => this.selectedVideos.has(v.title));
  }

  selectAllVideos(): void {
    this.filteredVideoOptions.forEach(v => this.selectedVideos.add(v.title));
    this.selectedVideos = new Set(this.selectedVideos);
  }

  clearAllVideos(): void {
    this.selectedVideos = new Set();
  }

  removeSelectedVideo(title: string): void {
    this.selectedVideos.delete(title);
    this.selectedVideos = new Set(this.selectedVideos);
  }

  async addEvolution(): Promise<void> {
    this.disableButton = true;
    if (this.data != null) {
      if (!this.selectedProfile || this.selectedVideos.size === 0) {
        alert('Please select a participant and a video.');
        this.disableButton = false;
        return;
      }
      try {
        const docRef = doc(this.firestore, 'evolutionmappingvideo', this.data.docid);
        await setDoc(docRef, {
          recordeddate: this.recordedDate ?? null,
          title: this.title,
          videourl: this.videourl,
        }, { merge: true });
        this.disableButton = false;
        this.closeDialog();
      } catch (error) {
        this.disableButton = false;
        console.error('Error updating evolution mapping:', error);
      }
      return;
    }
    if (!this.selectedProfile || this.selectedVideos.size === 0) {
      alert('Please select a participant and at least one video.');
      this.disableButton = false;
      return;
    }
    try {
      const batch = writeBatch(this.firestore);
      for (const video of this.getSelectedVideoObjects()) {
        const newDocRef = doc(collection(this.firestore, 'evolutionmappingvideo'));
        batch.set(newDocRef, {
          docid: newDocRef.id,
          profileid: this.selectedProfile,
          title: video.title,
          videourl: this.convertDropboxUrl(video.videourl),
          recordeddate: video.recordeddate ?? null,
          created: serverTimestamp(),
          deleted: false,
        });
      }
      await batch.commit();
      this.disableButton = false;
      this.closeDialog();
    } catch (error) {
      this.disableButton = false;
      console.error('Error saving evolution mappings:', error);
    }
  }
  closeDialog(): void {
    this.dialogRef.close();
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload only Excel or CSV files.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      this.importPreview = [];
      jsonData.slice(1).forEach((row: any) => {
        let [email, title, videourl] = row;
        if (!email && !title && !videourl) return;
        email = email ? String(email).trim() : '';
        videourl = videourl ? String(videourl).trim() : '';
        if (typeof title === 'number') {
          const date = XLSX.SSF.parse_date_code(title);
          if (date) {
            const jsDate = new Date(date.y, date.m - 1, date.d);
            title = jsDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
          } else {
            title = String(title);
          }
        } else {
          title = String(title ?? '');
        }
        const profileData = this.mapEmailData[email];
        this.importPreview.push({
          email,
          title,
          videourl,
          profileid: profileData ? profileData['profileid'] ?? profileData['id'] : null,
        });
      });
    };
    reader.readAsArrayBuffer(file);
  }

  async uploadBulk(): Promise<void> {
    this.disableButton = true;
    const batch = writeBatch(this.firestore);
    let count = 0;

    for (const item of this.importPreview) {
      if (!item.profileid) continue;
      const newDocRef = doc(collection(this.firestore, 'evolutionmappingvideo'));
      batch.set(newDocRef, {
        docid: newDocRef.id,
        recordeddate: serverTimestamp(),
        title: item.title,
        videourl: item.videourl,
        profileid: item.profileid,
        created: serverTimestamp(),
        deleted: false
      });
      count++;
    }

    try {
      await batch.commit();
      alert(`${count} records uploaded successfully!`);
      this.importPreview = [];
    } catch (err) {
      console.error('Bulk upload failed:', err);
      alert('Error during bulk upload. Check console.');
    } finally {
      this.disableButton = false;
    }
  }
}