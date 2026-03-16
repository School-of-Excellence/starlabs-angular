import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FillFormComponent } from './fill-form/fill-form.component';
import { ParticipantDetailComponent } from '../participant-detail/participant-detail.component';
import {
  Participant,
  Journey,
} from '../participant-detail/participant-detail.component';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  Timestamp,
  doc,
  updateDoc,
  and,
  docData,
  DocumentReference
} from '@angular/fire/firestore';
import { Subject, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { AuthguardService } from '../../../authguard.service';
import { Auth, authState } from '@angular/fire/auth';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatChipListbox, MatChipsModule } from '@angular/material/chips';
import { MatListModule, MatSelectionList } from '@angular/material/list';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';

interface EventItem {
  id: string;
  name: string;
  start_date: Timestamp;
  end_date: Timestamp;
}
interface QueueItem {
  id: string;
  queuename: string;
  queuestartdate: Timestamp;
  queueenddate: Timestamp;
}

@Component({
  selector: 'app-participant-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ParticipantDetailComponent,
    FillFormComponent,
    MatIconModule,
    MatIconButton,
    MatChipsModule,
    MatChipListbox,
    MatSelectionList,
    MatListModule,
    MatDialogModule
  ],
  templateUrl: './participant-list.component.html',
  styleUrls: ['./participant-list.component.css'],
})
export class ParticipantListComponent implements OnInit, OnDestroy {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  @ViewChild('eventModal') eventModal !: TemplateRef<any>;

  selectedProfileId: string | null = null;
  showDetailView = false;
  showFormView = false;
  selectedFormDocId: string | null = null;
  showQuickNoteModal = false;
  quickNoteProfile: Participant | null = null;
  quickNoteText = '';
  quickNoteSaving = false;
  showImageUploadModal = false;
  imageUploadProfile: Participant | null = null;
  selectedImageFile: File | null = null;
  imagePreviewUrl: string | null = null;
  imageUploading = false;

  // Image Preview Popup state
  showImagePreviewPopup = false;
  imagePreviewProfile: Participant | null = null;
  loading = true;
  isLoadingMore = false;
  totalProfileCount = 0;
  currentLimit = 20;
  isScrolled = false;
  showFilterModal = false;
  filterbox = 1;

  profilesMap: Map<string, Participant> = new Map();
  // profilesMap: Map<string, Participant> = new Map();
  journeyMap: { [key: string]: any } = {};
  productsMap: Map<string, any> = new Map();
  sortedProfileIds: string[] = [];
  filteredProfileIds: string[] = [];
  excludedProfileIds: Set<string> = new Set();
  eventList: any[] = [];
  queueList: QueueItem[] = [];
  ecosystemJourneysList: string[] = [];
  dfuJourneysList: string[] = [];
  searchText = '';
  selectedEvents: string[] = [];
  selectedQueues: string[] = [];
  selectedEcosystem: string[] = [];
  selectedDFU: string[] = [];
  filterActive = false;
  eventParticipants: string[] = [];
  queueParticipants: string[] = [];
  ecosystemParticipants: string[] = [];
  dfuParticipants: string[] = [];
  loggedUser: any = {};
  isAdmin = false;

  isLoading = true;
  loadingStatus = {
    participant: true,
    journey: true,
    events: true,
    eventReq: true
  }

  subscriptions: { [key: string]: Subscription } = {}

  upComingEventsMap = {}
  eventParticipantReqMap = {}

  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  eventDilaogConfig: any = null;

  constructor(private firestore: Firestore, private authService: AuthguardService, private dilaog: MatDialog) {
    this.authService.user.pipe(
      takeUntil(this.destroy$),
      switchMap((user) => {
        if (!user) {
          return of(null);
        }
        const userRef = doc(collection(this.firestore, 'user_data'), user.uid);
        const profilequery = query(collection(this.firestore, 'profile_data'), where("user_ref", '==', userRef))
        return collectionData(profilequery);
      })
    ).subscribe((user) => {
      if (user.length > 0) {
        this.loggedUser = user[0];
      }
    });
  }

  ngOnInit(): void {
    // this.fetchEvents()
    this.initializeData();
    this.setupSearchDebounce();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearchDebounce(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.applyFilters());
  }

  async initializeData(): Promise<void> {
    this.isLoading = true;
    try {
      this.fetchJourney();
      this.loadParticipants();
      this.loadEvents();
      this.fetchQueueGeneration();
      this.loadProductsMap();
    } catch (error) {
      console.error('Error in fetching the data :', error);
      this.isLoading = false;
    }
  }

  checkAllDataLoaded() {
    const allLoaded = Object.values(this.loadingStatus).every((stat) => !stat);
    if (allLoaded) this.isLoading = false; this.applyFilters();
  }

  private async loadParticipants(): Promise<void> {
    this.loadingStatus.participant = true;
    const profilesRef = collection(this.firestore, 'participant metadata');
    const participantQuery = query(profilesRef, orderBy('name'))
    collectionData(participantQuery, { idField: "profileid" }).pipe(takeUntil(this.destroy$)).subscribe((snapshot) => {
      const profilesMap = new Map();
      const sortedProfileIds = [];
      snapshot.forEach((d) => {
        const data = d as Participant;
        if (![null, undefined, '', 'late', 'banned'].includes(data['customerstatus'])) {
          profilesMap.set(d.profileid, { ...data });
          sortedProfileIds.push(d.profileid);
        }
      });

      this.profilesMap = profilesMap;
      this.sortedProfileIds = sortedProfileIds;

      this.filteredProfileIds = this.sortedProfileIds;
      this.totalProfileCount = this.sortedProfileIds.length;

      if (this.loadingStatus.participant) {
        this.loadingStatus.participant = false;
        this.checkAllDataLoaded()
        return
      }
      this.applyFilters()
    })
  }

  private async loadEvents() {
    this.loadingStatus.events = true;
    const eventsMap = {}
    const collRef = collection(this.firestore, 'event collection')
    const eventQuery = query(collRef, where('end_date', '>=', Timestamp.now()), orderBy('end_date', 'desc'))
    collectionData(eventQuery, { idField: "docid" }).pipe(takeUntil(this.destroy$)).subscribe((events) => {
      const currentDate = new Date();
      events.forEach((event) => {
        eventsMap[event.docid] = event;
        if (this.loadingStatus.events) {
          const eventStartDate = event['start_date'].toDate();
          const eventEndDate = event['end_date'].toDate();
          if (eventStartDate <= currentDate && currentDate <= eventEndDate) {
            this.selectedEvents.push(event.docid)
          }
        }
      })

      events.sort((a, b) => a['start_date']?.toDate() - b['start_date']?.toDate())
      this.eventList = events;
      this.upComingEventsMap = eventsMap;
      if (this.loadingStatus.events) {
        this.loadingStatus.events = false;
        this.checkAllDataLoaded()
      }
      this.loadEventParticipantReq()
    });
  }

  private async loadEventParticipantReq() {
    this.loadingStatus.eventReq = true;
    const collRef = collection(this.firestore, 'event participation request');
    const eventParticipantReqMap = {};
    const participants: string[] = [];
    const docsRef = Object.keys(this.upComingEventsMap).map((eid) => doc(this.firestore, `event collection`, eid))
    const eventParticipantQuery = query(collRef, where('eventref', 'in', docsRef), where("status", 'in', ["approved", "attended"]))
    collectionData(eventParticipantQuery, { idField: 'docid' }).pipe(takeUntil(this.destroy$))
      .subscribe((snap) => {
        snap.forEach((event) => {
          const eventRef = (event['eventref'] as DocumentReference)?.id;
          if (!eventRef) return
          if (Object.hasOwn(eventParticipantReqMap, eventRef)) {
            eventParticipantReqMap[eventRef].push(event);
          } else {
            eventParticipantReqMap[eventRef] = [event];
          }
        })
        this.eventParticipantReqMap = eventParticipantReqMap;
        if (this.loadingStatus.eventReq) {
          this.loadingStatus.eventReq = false;
          this.checkAllDataLoaded()
          return
        }
        this.applyFilters();
      })
  }

  private fetchQueueGeneration() {
    const today = Timestamp.fromDate(new Date());
    collectionData(
      query(
        collection(this.firestore, 'queue generation'),
        where('queuestartdate', '<=', today),
        where('queueenddate', '>=', today),
        orderBy('queuestartdate')
      ),
      { idField: 'id' }
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe((q) => {
        this.queueList = q as QueueItem[];
        this.applyFilters();
      });
  }

  private loadProductsMap() {
    collectionData(collection(this.firestore, 'products'), { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe((p) => {
        this.productsMap.clear();
        (p as any[]).forEach((prod) => this.productsMap.set(prod.id, prod));
        this.applyFilters();
      });
  }

  async fetchJourney() {
    this.loadingStatus.journey = true;
    const collRef = collection(this.firestore, 'journey');
    let map = {}
    const journeyQuery = query(collRef)
    const journeyDocs = await getDocs(journeyQuery)
    for (let i = 0; i < journeyDocs.docs.length; i++) {
      const doc = journeyDocs.docs[i];
      const journey = doc.data()
      map[doc.id] = journey
      if (journey['type'] === 'DFU') this.dfuJourneysList.push(doc.id);
      else if (journey['type'] === 'Eco system')
        this.ecosystemJourneysList.push(doc.id);
    }
    if (this.loadingStatus.journey) {
      this.loadingStatus.journey = false;
      this.checkAllDataLoaded()
    }
    this.journeyMap = map;
  }

  onSearchChange(event: any): void {
    this.searchText = event.target.value;
    this.searchSubject.next(this.searchText);
  }
  clearSearch(): void {
    this.searchText = '';
    this.applyFilters();
  }
  hasActiveFilters(): boolean {
    return (
      this.searchText.trim() !== '' ||
      this.selectedEvents.length > 0 ||
      this.selectedQueues.length > 0 ||
      this.selectedEcosystem.length > 0 ||
      this.selectedDFU.length > 0
    );
  }

  async applyFilters(): Promise<void> {
    if (!this.hasActiveFilters()) {
      this.filteredProfileIds = [...this.sortedProfileIds];
      this.filterActive = false;
      return;
    }
    this.loading = true;
    let tempEventParticipantId = []
    if (this.selectedEvents.length > 0) {

      this.loadEventParticipants();

      tempEventParticipantId = this.eventParticipants;
      if (this.eventDilaogConfig && this.eventDilaogConfig?.selectedOptionsList.length > 0) {
        tempEventParticipantId = this.eventParticipants.filter((pid) => {
          return this.eventDilaogConfig?.selectedOptionsList.some((id) => {
            return this.eventDilaogConfig?.optionsMap[id]?.participantList.includes(pid);
          })
        })
      }
    }

    if (this.selectedQueues.length > 0 && this.queueParticipants.length === 0)
      await this.loadQueueParticipants();
    if (
      this.selectedEcosystem.length > 0 &&
      this.ecosystemParticipants.length === 0
    )
      this.loadEcosystemParticipants();
    if (this.selectedDFU.length > 0 && this.dfuParticipants.length === 0)
      this.loadDFUParticipants();
    this.filteredProfileIds = this.sortedProfileIds.filter((pid) => {
      const profile = this.profilesMap.get(pid);
      if (!profile) return false;
      const nameMatch =
        !this.searchText.trim() ||
        (profile.name || '')
          .toLowerCase()
          .includes(this.searchText.toLowerCase().trim());
      return (
        nameMatch &&
        (!this.selectedEvents.length || tempEventParticipantId.includes(pid)) &&
        (!this.selectedQueues.length || this.queueParticipants.includes(pid)) &&
        (!this.selectedEcosystem.length ||
          this.ecosystemParticipants.includes(pid)) &&
        (!this.selectedDFU.length || this.dfuParticipants.includes(pid))
      );
    });
    this.filterActive =
      this.selectedEvents.length > 0 ||
      this.selectedQueues.length > 0 ||
      this.selectedEcosystem.length > 0 ||
      this.selectedDFU.length > 0;
    this.loading = false;
  }

  private loadEventParticipants(): void {
    let participants = [];

    this.selectedEvents?.forEach((eid) => {
      if (Object.hasOwn(this.eventParticipantReqMap, eid)) {
        for (let participant of this.eventParticipantReqMap[eid]) {
          const participantId = participant['profileid'] || ''
          if (![null, undefined, ''].includes(participantId)) {
            participants.push(participantId);
          }
        }
      }
    })

    this.eventParticipants = participants;
  }
  private async loadQueueParticipants(): Promise<void> {
    const ref = collection(this.firestore, 'queue_token');
    const participants: string[] = [];
    for (const qid of this.selectedQueues) {
      const queueDocRef = doc(this.firestore, 'queue generation', qid);
      const snapshot = await getDocs(
        query(
          ref,
          where('tokenstatus', '==', 'Active'),
          where('queueref', '==', queueDocRef)
        )
      );
      snapshot.docs.forEach((d) => {
        const id = d.data()['profile_id'];
        if (id) participants.push(id.toString());
      });
    }
    this.queueParticipants = participants;
  }
  private loadEcosystemParticipants(): void {
    const participants: string[] = [];
    this.selectedEcosystem.forEach((eid) => {
      this.profilesMap.forEach((m, pid) => {
        if (m.activejourney === eid) participants.push(pid);
      });
    });
    this.ecosystemParticipants = participants;
  }
  private loadDFUParticipants(): void {
    const participants: string[] = [];
    this.selectedDFU.forEach((did) => {
      this.profilesMap.forEach((m, pid) => {
        if (m.activejourney === did) participants.push(pid);
      });
    });
    this.dfuParticipants = participants;
  }

  openFilterModal(): void {
    this.showFilterModal = true;
  }
  closeFilterModal(): void {
    this.showFilterModal = false;
  }
  selectFilterTab(tab: number): void {
    this.filterbox = tab;
  }
  toggleEventSelection(id: string): void {
    const idx = this.selectedEvents.indexOf(id);
    if (idx > -1) this.selectedEvents.splice(idx, 1);
    else {
      this.selectedEvents.push(id);
      this.selectedQueues = [];
      this.selectedEcosystem = [];
      this.selectedDFU = [];
    }
    this.eventParticipants = [];
  }
  toggleQueueSelection(id: string): void {
    const idx = this.selectedQueues.indexOf(id);
    if (idx > -1) this.selectedQueues.splice(idx, 1);
    else {
      this.selectedQueues.push(id);
      this.selectedEcosystem = [];
      this.selectedDFU = [];
    }
    this.queueParticipants = [];
  }
  toggleEcosystemSelection(id: string): void {
    const idx = this.selectedEcosystem.indexOf(id);
    if (idx > -1) this.selectedEcosystem.splice(idx, 1);
    else {
      this.selectedEcosystem.push(id);
      // this.selectedEvents = [];
      this.selectedQueues = [];
      this.selectedDFU = [];
    }
    this.ecosystemParticipants = [];
  }
  toggleDFUSelection(id: string): void {
    const idx = this.selectedDFU.indexOf(id);
    if (idx > -1) this.selectedDFU.splice(idx, 1);
    else {
      this.selectedDFU.push(id);
      // this.selectedEvents = [];
      this.selectedQueues = [];
      this.selectedEcosystem = [];
    }
    this.dfuParticipants = [];
  }
  clearAllFilters(): void {
    // this.selectedEvents = [];
    this.selectedQueues = [];
    this.selectedEcosystem = [];
    this.selectedDFU = [];
    // this.eventParticipants = [];
    this.queueParticipants = [];
    this.ecosystemParticipants = [];
    this.dfuParticipants = [];
    // this.filterActive = false;
    // this.filteredProfileIds = this.selectedEvents.length === 0 ? this.sortedProfileIds.slice(0, this.currentLimit) : this.filteredProfileIds;
    this.applyFilters()
    this.closeFilterModal();
  }
  applyFilterSelection(): void {
    this.eventParticipants = [];
    this.queueParticipants = [];
    this.ecosystemParticipants = [];
    this.dfuParticipants = [];
    this.applyFilters();
    this.closeFilterModal();
  }

  getActiveFilterChips(): { label: string; type: string, filterId: string }[] {
    const chips: { label: string; type: string, filterId: string }[] = [];
    // this.selectedEvents.forEach((id) => {
    //   const e = this.eventList.find((x) => x.id === id);
    //   if (e) chips.push({ label: e.name, type: 'event' });
    // });
    this.selectedQueues.forEach((id) => {
      const q = this.queueList.find((x) => x.id === id);
      if (q) chips.push({ label: q.queuename, type: 'queue', filterId: id });
    });
    this.selectedEcosystem.forEach((id) => {
      const e = this.ecosystemJourneysList.find((journeyId: string) => journeyId === id);
      if (e) chips.push({ label: this.journeyMap[e].journey, type: 'ecosystem', filterId: id });
    });
    this.selectedDFU.forEach((id) => {
      const d = this.dfuJourneysList.find((journeyId) => journeyId === id);
      if (d) chips.push({ label: this.journeyMap[d].journey, type: 'dfu', filterId: id });
    });
    return chips;
  }

  removeFilter(filter: { label: string; type: string, filterId: string }) {
    const filterId = filter.filterId;
    switch (filter.type) {
      case 'queue':
        this.selectedQueues = this.selectedQueues.filter((id) => id !== filterId);
        break;
      case 'ecosystem':
        this.selectedEcosystem = this.selectedEcosystem.filter((id) => id !== filterId);
        break;
      case 'dfu':
        this.selectedDFU = this.selectedDFU.filter((id) => id !== filterId);
        break;
      default:
        break;
    }
    this.applyFilters()
  }

  toggleSelectEvent(eventId: string) {
    if (!this.selectedEvents.includes(eventId)) {
      this.selectedEvents.push(eventId);
    } else {
      const filteredEventsIds = this.selectedEvents.filter((id) => id !== eventId);
      this.selectedEvents = filteredEventsIds;
    }
    this.applyFilters()
  }

  onScroll(event: any): void {
    const el = event.target;
    this.isScrolled = el.scrollTop > 100;
    // if (el.scrollHeight - el.scrollTop <= el.clientHeight + 100)
    //   this.loadMore();
  }
  scrollToTop(): void {
    this.scrollContainer?.nativeElement.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }
  async loadMore(): Promise<void> {
    if (
      this.isLoadingMore ||
      this.filteredProfileIds.length >= this.sortedProfileIds.length
    )
      return;
    this.isLoadingMore = true;
    if (!this.hasActiveFilters()) {
      this.currentLimit = Math.min(
        this.currentLimit + 20,
        this.sortedProfileIds.length
      );
      this.filteredProfileIds = this.sortedProfileIds.slice(
        0,
        this.currentLimit
      );
    }
    this.isLoadingMore = false;
  }

  getParticipant(pid: string): Participant | undefined {
    return this.profilesMap.get(pid);
  }
  getMetadata(pid: string): Participant | undefined {
    return this.profilesMap.get(pid);
  }
  getJourney(jid: string): string | undefined {
    return this.journeyMap[jid]?.journey ?? '';
  }
  getProfileImage(p: Participant | null): string | null {
    return p?.profileimg || p?.profile || null;
  }
  getLatestNote(p: Participant): string {
    const notes = p?.notes?.ahnotes || [];
    return notes.length
      ? notes[notes.length - 1]?.ahnotes || 'No notes yet'
      : 'No notes yet';
  }

  openDetailView(profileId: string): void {
    this.selectedProfileId = profileId;
    this.showDetailView = true;
  }
  closeDetailView(): void {
    this.selectedProfileId = null;
    this.showDetailView = false;
  }
  openFormView(formDocId: string): void {
    this.selectedFormDocId = formDocId;
    this.showFormView = true;
  }
  closeFormView(): void {
    this.selectedFormDocId = null;
    this.showFormView = false;
  }
  onFormSaved(): void {
    console.log('Form saved successfully');
    this.closeFormView();
  }

  openAddNoteModal(profile: Participant, event: Event): void {
    event.stopPropagation();
    this.quickNoteProfile = profile;
    this.quickNoteText = '';
    this.showQuickNoteModal = true;
  }
  closeQuickNoteModal(): void {
    this.showQuickNoteModal = false;
    this.quickNoteProfile = null;
    this.quickNoteText = '';
  }

  async saveQuickNote(): Promise<void> {
    if (!this.quickNoteText.trim() || !this.quickNoteProfile) return;
    this.quickNoteSaving = true;
    try {
      const profileId = this.quickNoteProfile.profileid;
      const currentProfile = this.profilesMap.get(profileId);
      if (currentProfile) {
        const notesMap = currentProfile.notes || { ahnotes: [] };
        const ahnotes = notesMap.ahnotes || [];
        console.log(this.loggedUser)
        ahnotes.push({
          givenby: this.loggedUser['profileid'] || 'unknown',
          ahnotes: this.quickNoteText.trim(),
          date: new Date(),
        });
        await updateDoc(doc(this.firestore, 'participant metadata', profileId), {
          notes: { ahnotes },
        });
        // currentProfile.notes = { ahnotes };
        // this.profilesMap.set(profileId, currentProfile);
        this.closeQuickNoteModal();
      }
    } catch (error) {
      console.error('Error saving quick note:', error);
    } finally {
      this.quickNoteSaving = false;
    }
  }

  openImageUploadModal(profile: Participant, event: Event): void {
    event.stopPropagation();
    this.imageUploadProfile = profile;
    this.selectedImageFile = null;
    this.imagePreviewUrl = null;
    this.showImageUploadModal = true;
  }
  openImageUploadFromDetail(profile: Participant): void {
    this.imageUploadProfile = profile;
    this.selectedImageFile = null;
    this.imagePreviewUrl = null;
    this.showImageUploadModal = true;
  }
  closeImageUploadModal(): void {
    this.showImageUploadModal = false;
    this.imageUploadProfile = null;
    this.selectedImageFile = null;
    this.imagePreviewUrl = null;
  }

  onImageSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      this.selectedImageFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreviewUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  async uploadProfileImage(): Promise<void> {
    if (!this.selectedImageFile || !this.imageUploadProfile) return;
    this.imageUploading = true;
    try {
      const profileId = this.imageUploadProfile.profileid;
      const reader = new FileReader();
      reader.onload = async (e: any) => {
        const base64Image = e.target.result;
        await updateDoc(doc(this.firestore, 'participant metadata', profileId), {
          profileimg: base64Image,
        });
        const profile = this.profilesMap.get(profileId);
        if (profile) {
          profile.profileimg = base64Image;
          this.profilesMap.set(profileId, profile);
        }
        this.imageUploading = false;
        this.closeImageUploadModal();
      };
      reader.readAsDataURL(this.selectedImageFile);
    } catch (error) {
      console.error('Error uploading image:', error);
      this.imageUploading = false;
    }
  }

  // Image Preview Popup Methods
  openImagePreviewPopup(profile: Participant, event: Event): void {
    event.stopPropagation();
    this.imagePreviewProfile = profile;
    this.showImagePreviewPopup = true;
  }

  closeImagePreviewPopup(): void {
    this.showImagePreviewPopup = false;
    this.imagePreviewProfile = null;
  }

  // Switch from preview popup to upload modal
  switchToUploadFromPreview(): void {
    const profile = this.imagePreviewProfile;
    this.closeImagePreviewPopup();
    if (profile) {
      this.imageUploadProfile = profile;
      this.selectedImageFile = null;
      this.imagePreviewUrl = null;
      this.showImageUploadModal = true;
    }
  }

  logout(): void {
    console.log('Logout');
  }
  trackByProfileId(index: number, profileId: string): string {
    return profileId;
  }

  openEventDilaog(type: string) {
    if (!this.eventDilaogConfig || this.eventDilaogConfig?.name !== type) {
      const config = {
        title: '',
        name: type,
        selectedOptionsList: [],
        optionsMap: null,
        options: null,
        icon: ''
      }

      if (type === 'cohort') {
        config.title = 'Selected Cohorts';
        config.icon = 'groups_2'
        // config.optionsMap = await this.fetchCoherts()
        // config.options = Object.values(config.optionsMap);
        this.fetchCoherts()
      } else if (type === 'journey') {
        config.title = 'Selected Journey'
        config.icon = 'route'
        config.optionsMap = this.fetchJourneyForEvent()
        config.options = Object.values(config.optionsMap);
        // this.fetchJourneyForEvent()
      } else if (type === 'product') {
        config.title = 'Selected Products'
        config.icon = 'inventory_2'
        // config.optionsMap = await this.fetchProductsForEvents()
        // config.options = Object.values(config.optionsMap);
        this.fetchProductsForEvents()
      }
      this.eventDilaogConfig = config;
    }
    this.dilaog.open(this.eventModal).afterClosed().subscribe(() => {
      this.applyFilters()
    })
  }

  async fetchCoherts() {
    const cohorts = {};
    if (this.selectedEvents.length > 0) {
      const cohortsRef = collection(this.firestore, 'big cohorts');
      for (let eventId of this.selectedEvents) {
        const event = doc(this.firestore, `event collection/${eventId}`)
        const cohortsQuery = query(cohortsRef, where('eventref', '==', event), where('status', '==', 'active'))
        const cohortsDocs = await getDocs(cohortsQuery)
        if (!cohortsDocs.empty) {
          cohortsDocs.docs.forEach((doc) => {
            const data = doc.data();
            cohorts[doc.id] = {
              id: doc.id,
              name: data['name'] || '',
              participantList: data['participantidlist'] ?? []
            }
          });
        }
      }

    }
    if (this.eventDilaogConfig) {
      this.eventDilaogConfig.optionsMap = cohorts;
      this.eventDilaogConfig.options = Object.values(cohorts);
    }

  }

  fetchJourneyForEvent() {
    const journeyMap = {}
    if (this.selectedEvents.length > 0) {
      for (let participantId of this.filteredProfileIds) {
        const participant = this.getParticipant(participantId);
        if (!participant) continue
        const journey = participant['activejourney'] || ''
        // console.log(journey)
        if (journey) {
          if (!Object.hasOwn(journeyMap, journey)) {
            journeyMap[journey] = {
              id: journey,
              name: this.getJourney(journey),
              participantList: [participantId]
            }
          } else {
            journeyMap[journey]?.participantList.push(participantId)
          }
        }
      }
    }
    return journeyMap
  }

  async fetchProductsForEvents() { // i have checked product in productsmap 
    // but not checked profileid is presnet in profilemap or not
    const productsMap = {};
    const arenaCollRef = collection(this.firestore, 'arena events');
    const eventsDocRef = Object.keys(this.upComingEventsMap).map((eid) => doc(this.firestore, `event collection`, eid));
    const arenaQuery = query(arenaCollRef, where('eventref', 'in', eventsDocRef));
    const arenaSDocs = await getDocs(arenaQuery);
    arenaSDocs.docs.forEach((arenaSnapDoc) => {
      const arenaDoc = arenaSnapDoc.data();
      const productRef = arenaDoc['productref']?.id;
      if (![null, undefined, ''].includes(productRef) && this.productsMap.has(productRef)) {
        const product = this.productsMap.get(productRef);
        productsMap[productRef] = {
          id: productRef,
          name: product?.product || '',
          participantList: []
        };
      }
    })

    for (const eid of this.selectedEvents) {
      if (Object.hasOwn(this.eventParticipantReqMap, eid)) {
        for (let participant of this.eventParticipantReqMap[eid] || []) {
          const productRef = participant['productref']?.id;
          if (![null, undefined, ''].includes(productRef) && Object.hasOwn(productsMap, productRef)) {
            const profileId = participant['profileid'];
            productsMap[productRef].participantList.push(profileId)
          }
        }
      }

    }

    if (this.eventDilaogConfig) {
      this.eventDilaogConfig.optionsMap = productsMap;
      this.eventDilaogConfig.options = Object.values(productsMap);
    }
  }

  selectAll() {
    if (this.eventDilaogConfig) {
      const options = Object.keys(this.eventDilaogConfig.optionsMap);
      this.eventDilaogConfig.selectedOptionsList = options;
    }
  }

  clearAll() {
    if (this.eventDilaogConfig) {
      this.eventDilaogConfig.selectedOptionsList = [];
    }
  }

  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStatus).filter(state => state === false).length;
    const total = Object.keys(this.loadingStatus).length;

    return (loaded / total) * 100;
  }

}

