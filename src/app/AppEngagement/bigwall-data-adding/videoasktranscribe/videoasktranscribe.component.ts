import { Component, Input, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, getDocs, query, addDoc, updateDoc, doc, where, Timestamp } from '@angular/fire/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { deleteDoc } from '@angular/fire/firestore';


@Component({
  selector: 'app-videoasktranscribe',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    NgxMatSelectSearchModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './videoasktranscribe.component.html',
  styleUrl: './videoasktranscribe.component.css'
})
export class VideoasktranscribeComponent implements OnInit {

  @Input() eventid!: string;

  profileList: any[] = [];
  filteredProfiles: any[] = [];

  selectedProfileId = '';
  transcribeText = '';
  available = true;

  editDocId: string | null = null;

  // displayedColumns = ['type', 'profile', 'heading', 'content', 'available', 'action'];
  displayedColumns = ['type', 'profile', 'heading', 'content', 'available', 'action', 'delete'];
  dataSource = new MatTableDataSource<any>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  mapProfile: { [key: string]: any } = {};

  // Timer fields - using date and time strings for the picker
  timerDate: Date | null = null;
  timerTime: string = '';

  type: 'videoask' | 'image' | 'announcement' | 'timer' = 'videoask';

  heading = '';
  announcementText = '';
  selectedFile: File | null = null;

  storage = getStorage();

  constructor(private firestore: Firestore) {}

  ngOnInit() {
    this.loadProfiles();
    this.loadTable();
  }

  async loadProfiles() {
    const snap = await getDocs(collection(this.firestore, 'profile_data'));

    this.profileList = snap.docs.map(d => {
      const data = d.data();
      this.mapProfile[data['profileid']] = data;
      return data;
    });

    this.filteredProfiles = [...this.profileList];
  }

  async loadTable() {
    const snap = await getDocs(query(collection(this.firestore, 'arena highlights'), where('from', 'in', ['videoask', 'announcement', 'image', 'timer'])));
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(rows, 'printrows');
    this.dataSource.data = rows;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  profileSearch = '';

  filterProfiles() {
    const search = this.profileSearch.toLowerCase();
    this.filteredProfiles = this.profileList.filter(p =>
      p.name.toLowerCase().includes(search)
    );
  }

  // Combine date and time into a single Date object
  getTimerDateTime(): Date | null {
    if (!this.timerDate || !this.timerTime) return null;

    const [hours, minutes] = this.timerTime.split(':').map(Number);
    const combined = new Date(this.timerDate);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }

  // Format timestamp for display in table
  formatTimestamp(timestamp: any): string {
    if (!timestamp) return '—';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  async submit() {
    if (!this.eventid || !this.type) return;

    let payload: any = {
      eventref: doc(this.firestore, 'event collection', this.eventid),
      from: this.type,
      available: this.available,
      updated: new Date()
    };

    // VIDEOASK (existing)
    if (this.type === 'videoask') {
      if (!this.selectedProfileId || !this.transcribeText) return;

      payload = {
        ...payload,
        profileid: this.selectedProfileId,
        transcribe: this.transcribeText
      };
    }

    // TIMER
    if (this.type === 'timer') {
      const timerDateTime = this.getTimerDateTime();
      if (!this.heading || !timerDateTime) return;

      payload = {
        ...payload,
        heading: this.heading,
        time: Timestamp.fromDate(timerDateTime)
      };
    }

    // IMAGE
    if (this.type === 'image') {
      if (!this.heading || !this.selectedFile) return;

      const imageUrl = await this.uploadImage();

      payload = {
        ...payload,
        heading: this.heading,
        imageUrl
      };
    }

    // ANNOUNCEMENT
    if (this.type === 'announcement') {
      if (!this.heading || !this.announcementText) return;

      payload = {
        ...payload,
        heading: this.heading,
        announcementtext: this.announcementText
      };
    }

    if (this.editDocId) {
      await updateDoc(doc(this.firestore, 'arena highlights', this.editDocId), payload);
    } else {
      await addDoc(collection(this.firestore, 'arena highlights'), {
        ...payload,
        created: new Date()
      });
    }

    this.resetForm();
    this.loadTable();
  }

  edit(row: any) {
    this.editDocId = row.id;
    this.type = row.from;
    this.available = row.available ?? true;

    // RESET FIRST (important)
    this.selectedProfileId = '';
    this.transcribeText = '';
    this.heading = '';
    this.announcementText = '';
    this.selectedFile = null;
    this.timerDate = null;
    this.timerTime = '';

    // VIDEOASK
    if (row.from === 'videoask') {
      this.selectedProfileId = row.profileid || '';
      this.transcribeText = row.transcribe || '';
    }

    // IMAGE
    if (row.from === 'image') {
      this.heading = row.heading || '';
    }

    // TIMER
    if (row.from === 'timer') {
      this.heading = row.heading || '';
      if (row.time) {
        const date = row.time.toDate ? row.time.toDate() : new Date(row.time);
        this.timerDate = date;
        this.timerTime = date.toTimeString().slice(0, 5); // HH:MM format
      }
    }

    // ANNOUNCEMENT
    if (row.from === 'announcement') {
      this.heading = row.heading || '';
      this.announcementText = row.announcementtext || '';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onTypeChange() {
    this.selectedProfileId = '';
    this.transcribeText = '';
    this.heading = '';
    this.announcementText = '';
    this.timerDate = null;
    this.timerTime = '';
    this.selectedFile = null;
  }

  resetForm() {
    this.editDocId = null;
    this.selectedProfileId = '';
    this.transcribeText = '';
    this.heading = '';
    this.announcementText = '';
    this.timerDate = null;
    this.timerTime = '';
    this.selectedFile = null;
    this.available = true;
    this.type = 'videoask';
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  async uploadImage(): Promise<string> {
    if (!this.selectedFile) return '';

    const filePath = `arena-images/${Date.now()}_${this.selectedFile.name}`;
    const storageRef = ref(this.storage, filePath);

    await uploadBytes(storageRef, this.selectedFile);
    return await getDownloadURL(storageRef);
  }

  isSubmitDisabled(): boolean {
    if (!this.eventid) return true;

    // VIDEOASK
    if (this.type === 'videoask') {
      return !this.selectedProfileId || !this.transcribeText;
    }

    // IMAGE
    if (this.type === 'image') {
      return !this.heading || !this.selectedFile;
    }

    // ANNOUNCEMENT
    if (this.type === 'announcement') {
      return !this.heading || !this.announcementText;
    }

    // TIMER
    if (this.type === 'timer') {
      return !this.heading || !this.timerDate || !this.timerTime;
    }

    return true;
  }
  async deleteRow(row: any) {
  if (!row?.id) return;

  const confirmed = window.confirm(
    'Are you sure you want to delete this item?\nThis action cannot be undone.'
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(this.firestore, 'arena highlights', row.id));

    // If deleting the currently edited row → reset form
    if (this.editDocId === row.id) {
      this.resetForm();
    }

    await this.loadTable();
    // alert('Deleted successfully');
  } catch (err) {
    console.error('Delete failed', err);
    alert('Failed to delete. Please try again.');
  }
}

}