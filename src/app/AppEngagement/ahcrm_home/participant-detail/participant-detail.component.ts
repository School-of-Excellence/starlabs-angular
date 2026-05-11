import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  Timestamp,
  doc,
  docData,
  updateDoc,
  getFirestore
} from '@angular/fire/firestore';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// ============================================
// INTERFACES
// ============================================
export interface Participant {
  profileid: string;
  name: string;
  profileimg?: string;
  profile?: string;
  customerstatus?: string;
  activejourney?: string;
  activeproduct?: string[];
  mode?: string;
  notes?: { ahnotes: AHNote[] };
}

export interface AHNote {
  givenby: string;
  ahnotes: string;
  date: any;
  tags?: string[];
}

// export interface Participant {
//   profileid: string;
//   customerstatus?: string;
//   activejourney?: string;
//   activeproduct?: string[];
//   mode?: string;
// }

export interface Journey {
  id: string;
  journey: string;
  type: string;
}

export interface FormByClient {
  docid: string;
  formname: string;
  profileid: string;
  date: any;
  formarray: any[];
}

// ============================================
// PARTICIPANT DETAIL COMPONENT
// ============================================
@Component({
  selector: 'app-participant-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './participant-detail.component.html',
  styleUrls: ['./participant-detail.component.css']
})
export class ParticipantDetailComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  @Input() profileId: string = '';
  @Input() loggedUser: any = {};
  @Output() closeDetail = new EventEmitter<void>();
  @Output() openForm = new EventEmitter<string>();
  @Output() uploadImageRequest = new EventEmitter<Participant>();

  loading = true;
  bodyLoading = true;
  formsLoading = true;
  showCollapsedTitle = false;
  showNotesModal = false;
  showImageModal = false;
  showNotesPopup = false;
  showFormsPopup = false;
  isScrolled = false;

  profileData: Participant | null = null;
  participantMetadata: Participant | null = null;
  productsMap: Map<string, any> = new Map();
  journeyMap: Map<string, Journey> = new Map();
  mapProfile: Map<string, any> = new Map();
  formsByClient: Map<string, FormByClient[]> = new Map();

  reversedNotes: AHNote[] = [];
  newNoteText: string = '';
  // loggedUser: any = {};
  isAdmin = false;

  private destroy$ = new Subject<void>();
  firestoreDefault = getFirestore()
  firestoreForms = getFirestore('firestore-forms')

  constructor() { }

  ngOnInit(): void {
    if (this.profileId) this.initializeData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profileId'] && !changes['profileId'].firstChange) {
      this.resetComponent();
      this.initializeData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private resetComponent(): void {
    this.loading = true;
    this.bodyLoading = true;
    this.profileData = null;
    this.participantMetadata = null;
    this.reversedNotes = [];
    this.formsByClient.clear();
  }

  initializeData(): void {
    if (!this.profileId) return;
    this.loading = true;
    this.bodyLoading = true;
    this.loadProfileData();
    this.loadMetadata();
    this.loadJourneys();
    this.loadProducts();
    this.loadForms();
    setTimeout(() => { this.bodyLoading = false; }, 800);
  }

  private loadProfileData(): void {
    const profileRef = doc(this.firestoreDefault, 'participant metadata', this.profileId);
    docData(profileRef, { idField: 'profileid' }).pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.profileData = data as Participant;
      if (this.profileData?.notes?.ahnotes) {
        this.processNotes(this.profileData.notes.ahnotes);
      }
      this.loading = false;
    });
  }

  private loadMetadata(): void {
    const metadataRef = collection(this.firestoreDefault, 'participant metadata');
    const q = query(metadataRef, where('profileid', '==', this.profileId));
    collectionData(q, { idField: 'id' }).pipe(takeUntil(this.destroy$)).subscribe(metadata => {
      if (metadata.length > 0) this.participantMetadata = metadata[0] as Participant;
    });
  }

  private loadJourneys(): void {
    const journeyRef = collection(this.firestoreDefault, 'journey');
    collectionData(journeyRef, { idField: 'id' }).pipe(takeUntil(this.destroy$)).subscribe(journeys => {
      this.journeyMap.clear();
      (journeys as Journey[]).forEach(j => this.journeyMap.set(j.id, j));
    });
  }

  private loadProducts(): void {
    const productsRef = collection(this.firestoreDefault, 'products');
    collectionData(productsRef, { idField: 'id' }).pipe(takeUntil(this.destroy$)).subscribe(products => {
      this.productsMap.clear();
      (products as any[]).forEach(p => this.productsMap.set(p.id, p));
    });
  }

  private loadForms(): void {
    this.formsLoading = true;
    const formsRef = collection(this.firestoreForms, 'formsByClient');
    const q = query(formsRef, where('profileid', '==', this.profileId));
    collectionData(q, { idField: 'docid' }).pipe(takeUntil(this.destroy$)).subscribe(forms => {
      this.formsByClient.clear();
      (forms as FormByClient[]).forEach(form => {
        if (!this.formsByClient.has(form.formname)) this.formsByClient.set(form.formname, []);
        this.formsByClient.get(form.formname)!.push(form);
      });
      this.formsLoading = false;
    });
  }

  private processNotes(notes: AHNote[]): void {
    this.reversedNotes = [...notes].sort((a, b) => {
      const dateA = this.parseDate(a.date);
      const dateB = this.parseDate(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    const authorIds = new Set(notes.map(n => n.givenby).filter(Boolean));
    authorIds.forEach(id => {
      if (!this.mapProfile.has(id)) {
        docData(doc(this.firestoreDefault, 'participant metadata', id)).pipe(takeUntil(this.destroy$))
          .subscribe(data => { if (data) this.mapProfile.set(id, data); });
      }
    });
  }

  private parseDate(date: any): Date {
    if (date instanceof Timestamp) return date.toDate();
    if (date instanceof Date) return date;
    return new Date(date) || new Date(0);
  }

  get profileImage(): string | null {
    return this.profileData?.profileimg || this.profileData?.profile || null;
  }

  get participantTag(): string {
    return this.participantMetadata?.mode || 'Participant';
  }

  get currentJourney(): Journey | null {
    if (this.participantMetadata?.activejourney) {
      return this.journeyMap.get(this.participantMetadata.activejourney) || null;
    }
    return null;
  }

  get productEntries(): { label: string; count: number }[] {
    const productIds = this.participantMetadata?.activeproduct || [];
    const productCounts = new Map<string, number>();
    productIds.forEach(productId => {
      const product = this.productsMap.get(productId);
      const label = product?.product || productId;
      productCounts.set(label, (productCounts.get(label) || 0) + 1);
    });
    return Array.from(productCounts.entries()).map(([label, count]) => ({ label, count }));
  }

  get displayedNotes(): AHNote[] {
    return this.reversedNotes.slice(0, 3);
  }

  get formNames(): string[] {
    return Array.from(this.formsByClient.keys());
  }

  onScroll(event: any): void {
    const scrollTop = event.target.scrollTop;
    this.showCollapsedTitle = scrollTop > 180;
    this.isScrolled = scrollTop > 50;
  }

  goBack(): void {
    this.closeDetail.emit();
  }

  openNotesModal(): void { this.showNotesModal = true; }
  closeNotesModal(): void { this.showNotesModal = false; this.newNoteText = ''; }

  // Popup methods
  openNotesPopup(): void { this.showNotesPopup = true; }
  closeNotesPopup(): void { this.showNotesPopup = false; this.newNoteText = ''; }

  openFormsPopup(): void { this.showFormsPopup = true; }
  closeFormsPopup(): void { this.showFormsPopup = false; }

  async saveNote(): Promise<void> {
    if (!this.newNoteText.trim() || !this.profileData) return;
    const notesMap = this.profileData.notes || { ahnotes: [] };
    const ahnotes = notesMap.ahnotes || [];
    ahnotes.push({ givenby: this.loggedUser['profileid'] || 'unknown', ahnotes: this.newNoteText.trim(), date: new Date() });
    try {
      await updateDoc(doc(this.firestoreDefault, 'participant metadata', this.profileId), { notes: { ahnotes } });
      this.newNoteText = '';
      // Refresh notes
      this.processNotes(ahnotes);
    } catch (error) { console.error('Error saving note:', error); }
  }

  openImageModal(): void { if (this.profileImage) this.showImageModal = true; }
  closeImageModal(): void { this.showImageModal = false; }

  uploadImage(): void {
    if (this.profileData) {
      this.uploadImageRequest.emit(this.profileData);
    }
  }

  isFormCompleted(formName: string): boolean {
    const forms = this.formsByClient.get(formName);
    return forms ? forms.length > 0 && forms[0].date != null : false;
  }

  getFormDate(formName: string): string | null {
    const forms = this.formsByClient.get(formName);
    if (forms && forms.length > 0 && forms[0].date) {
      const date = forms[0].date.toDate?.() || new Date(forms[0].date);
      return this.formatDate(date);
    }
    return null;
  }

  navigateToForm(formName: string): void {
    const forms = this.formsByClient.get(formName);
    if (forms && forms.length > 0) {
      this.openForm.emit(forms[0].docid);
    }
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDateTime(date: any): string {
    const d = this.parseDate(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }

  formatRelativeTime(date: any): string {
    const d = this.parseDate(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getNoteAuthor(givenBy: string): string {
    return this.mapProfile.get(givenBy)?.name || 'Unknown';
  }
}