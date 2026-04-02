import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { collection, collectionData, collectionSnapshots, deleteDoc, doc, docSnapshots, DocumentData, DocumentReference, Firestore, getDoc, getDocs, onSnapshot, orderBy, query, QueryDocumentSnapshot, setDoc, Unsubscribe, updateDoc, where, writeBatch } from '@angular/fire/firestore'
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ReactiveFormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatTableDataSource } from '@angular/material/table';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import * as XLSX from 'xlsx';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSortModule } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { EditrecommendedplaylistComponent } from './editrecommendedplaylist/editrecommendedplaylist.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Timestamp } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment.development';
import { HttpClient } from '@angular/common/http';
import { SnackbarService } from '../../shared/snackbar.service';
import { debounceTime, firstValueFrom, Subject, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';

@Component({
  selector: 'app-manage-recommended-playlist',
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressBarModule,
    FormsModule,
    NgxMatSelectSearchModule,
    MatChipsModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatTooltipModule,
    MatSortModule,
    MatSlideToggleModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './manage-recommended-playlist-component.html',
  styleUrl: './manage-recommended-playlist-component.css'
})
export class ManageRecommendedPlaylistComponent implements OnInit, OnDestroy {
  mapPlaylist = {}
  mapPlaylistMeta = {}
  mapEpisodes = {}
  mapEpisodesMeta = {}
  mapAudio = {}
  mapAudioMeta = {}
  events: any[] = [];
  eventSearchText: string = '';
  selectedEvent: any = null
  uploadpercentage: number = 0;
  operationMode: 'Submit' | 'Edit' = 'Submit'
  playlist: any[] = []
  displayedColumns: string[] = ['status','name', 'type', 'list', 'date','expire', 'personalised', 'recommendedbyname', 'title', 'description', 'delete'];
  // displayedColumns: string[] = ['status','name', 'type', 'list', 'date','expire', 'personalised', 'recommendedbyname', 'title', 'description', 'delete', 'delete_all'];
  dataSource = new MatTableDataSource();

  groupPlaylist: any[] = [];
  groupDisplayedColumns: string[] = ['title','content','date', 'expire', 'deeplink', 'action'];
  groupDataSource = new MatTableDataSource();
  groupSortField: string = '';
  groupSortDirection: 'asc' | 'desc' = 'desc';
  selectedProfileIds: string[] = [];
  profileList: { id: string; name: string }[] = [];
  profileSearchText: string = '';
  @ViewChild('groupPaginator') groupPaginator: MatPaginator;
  @ViewChild('groupSort') groupSort: MatSort;
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  mapProfile: any = {}
  
  personalisedStatsExpanded = false;
  personalisedPlaylist: any[] = [];
  personalisedDisplayedColumns: string[] = ['recommendedbyname', 'title', 'profiles', 'content', 'date', 'expire', 'status'];
  personalisedDataSource = new MatTableDataSource();
  selectedRecommenderId: string = '';
  personalisedStatusFilter: string = '';
  personalisedContentFilter: string = '';
  recommenderList: { id: string; name: string }[] = [];
  expandedPersonalisedProfiles = new Set<number>();
  personalisedStats = {
    total: 0,
    active: 0,
    disabled: 0,
    byRecommender: [] as { id: string; name: string; count: number }[]
  };
  private destroy$ = new Subject<void>();
  @ViewChild('personalisedPaginator') personalisedPaginator: MatPaginator;
  @ViewChild('personalisedSort') personalisedSort: MatSort;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  isLoading = false;
  isMetaLoaded = false;
  mapProfileMeta: any = {};

  constructor(
    private firestore: Firestore,
    public clipboard: Clipboard,
    private dialog: MatDialog,
    private snackbarService: SnackbarService,  
    private http : HttpClient,
    private guard: AuthguardService,  
  ) {
  }

  ngOnInit(): void {
    const today = new Date();
    this.dateRangeEnd = today;
    this.dateRangeStart = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
    this.loadInitialData();
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  async loadInitialData() {
    this.isLoading = true;
    try {
      const [profilesnap] = await Promise.all([
        getDocs(collection(this.firestore, 'participant metadata')),
        this.getMetaData()
      ]);

      for (const d of profilesnap.docs) {
        const data = d.data();
        this.mapProfile[data['profileid']] = data['name'];
        this.mapProfileMeta[data['profileid']] = data;
      }
      this.buildProfileList();
      this.isMetaLoaded = true;

      await this.loadData();
    } catch (err) {
      console.error('Error loading initial data:', err);
      this.isLoading = false;
    }
  }

  async loadData() {
    this.isLoading = true;
    try {
      const startTimestamp = Timestamp.fromDate(this.dateRangeStart);
      const endDate = new Date(this.dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      const endTimestamp = Timestamp.fromDate(endDate);
      const bufferQuery = query(
        collection(this.firestore, 'buffermix archive'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      const groupSnap = await getDocs(bufferQuery);
      this.groupPlaylist = groupSnap.docs.map(d => ({ ...d.data() }));
      this.groupDataSource.data = this.groupPlaylist;
      if (this.groupSort) {
        this.groupSort.active = 'date';
        this.groupSort.direction = 'desc';
        this.groupSort.sortChange.emit({
          active: 'date',
          direction: 'desc'
        });
      }
      this.personalisedPlaylist = this.groupPlaylist.filter(g => g['personalised'] === true);
      this.personalisedDataSource.data = this.personalisedPlaylist;
      this.buildRecommenderList();
      this.buildPersonalisedStats();

      this.personalisedDataSource.sortingDataAccessor = (item: any, property: string) => {
        switch (property) {
          case 'date': return item.date?.toDate ? item.date.toDate().getTime() : 0;
          case 'expire': return item.expiredate?.toDate ? item.expiredate.toDate().getTime() : 0;
          case 'title': return (item.title || '').toLowerCase();
          case 'recommendedbyname': return (this.mapProfile[item.recommendedby] || '').toLowerCase();
          default: return item[property] || '';
        }
      };

      this.groupDataSource.sortingDataAccessor = (item: any, property: string) => {
        switch (property) {
          case 'date': return item.date?.toDate ? item.date.toDate().getTime() : 0;
          case 'expire': return item.expiredate?.toDate ? item.expiredate.toDate().getTime() : 0;
          case 'title': return (item.title || '').toLowerCase();
          case 'recommendedby': return (this.mapProfile[item.createdby] || '').toLowerCase();
          default: return item[property] || '';
        }
      };
      const playlistQuery = query(
        collection(this.firestore, 'recommended mix playlist'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      const playlistSnap = await getDocs(playlistQuery);
      this.playlist = playlistSnap.docs.map(d => {
        const data = d.data();
        return { ...data, docid: d.id, name: this.mapProfile[data['profileid']] || '' };
      });
      this.dataSource.data = this.playlist;
      this.buildGroupStats();

      if (this.paginator) this.dataSource.paginator = this.paginator;
      if (this.sort) this.dataSource.sort = this.sort;
      if (this.groupPaginator) this.groupDataSource.paginator = this.groupPaginator;
      if (this.groupSort) this.groupDataSource.sort = this.groupSort;
      if (this.personalisedPaginator) this.personalisedDataSource.paginator = this.personalisedPaginator;
      if (this.personalisedSort) this.personalisedDataSource.sort = this.personalisedSort;
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      this.isLoading = false;
    }
  }

  onDateFilter() {
    if (this.dateRangeStart && this.dateRangeEnd) {
      this.loadData();
    }
  }
  buildRecommenderList() {
    const map = new Map<string, string>();
    this.personalisedPlaylist.forEach(row => {
      if (row.recommendedby) {
        const name = this.mapProfile[row.recommendedby] || row.recommendedbyname || row.recommendedby;
        map.set(row.recommendedby, name);
      }
    });
    this.recommenderList = Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  buildPersonalisedStats() {
    const all = this.personalisedPlaylist;
    this.personalisedStats.total = all.length;
    this.personalisedStats.active = all.filter(r => r.delete !== true).length;
    this.personalisedStats.disabled = all.filter(r => r.delete === true).length;

    const countMap = new Map<string, { name: string; count: number }>();
    all.forEach(row => {
      if (row.recommendedby) {
        const name = this.mapProfile[row.recommendedby] || row.recommendedbyname || row.recommendedby;
        const existing = countMap.get(row.recommendedby);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(row.recommendedby, { name, count: 1 });
        }
      }
    });
    this.personalisedStats.byRecommender = Array.from(countMap.entries())
      .map(([id, val]) => ({ id, name: val.name, count: val.count }))
      .sort((a, b) => b.count - a.count);
  }

  applyPersonalisedFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.personalisedDataSource.filter = filterValue;
    this.applyPersonalisedFilters();
  }

  applyPersonalisedFilters() {
    let data = [...this.personalisedPlaylist];
    if (this.selectedRecommenderId) {
      data = data.filter(row => row.recommendedby === this.selectedRecommenderId);
    }
    if (this.personalisedStatusFilter === 'active') {
      data = data.filter(row => row.delete !== true);
    } else if (this.personalisedStatusFilter === 'disabled') {
      data = data.filter(row => row.delete === true);
    }
    if (this.personalisedContentFilter) {
      data = data.filter(row => (row[this.personalisedContentFilter] || []).length > 0);
    }
    if (this.personalisedDataSource.filter) {
      const search = this.personalisedDataSource.filter;
      data = data.filter(row => {
        const title = (row.title || '').toLowerCase();
        const recName = (this.mapProfile[row.recommendedby] || row.recommendedbyname || '').toLowerCase();
        const profileNames = (row.profileid || []).map((id: string) => (this.mapProfile[id] || '').toLowerCase()).join(' ');
        return title.includes(search) || recName.includes(search) || profileNames.includes(search);
      });
    }

    this.personalisedDataSource.data = data;
  }

  clearPersonalisedFilters() {
    this.selectedRecommenderId = '';
    this.personalisedStatusFilter = '';
    this.personalisedContentFilter = '';
    this.personalisedDataSource.filter = '';
    this.personalisedDataSource.data = this.personalisedPlaylist;
  }

  get hasPersonalisedFilters(): boolean {
    return !!this.selectedRecommenderId || !!this.personalisedStatusFilter || !!this.personalisedContentFilter || !!this.personalisedDataSource.filter;
  }

  togglePersonalisedProfiles(index: number) {
    if (this.expandedPersonalisedProfiles.has(index)) {
      this.expandedPersonalisedProfiles.delete(index);
    } else {
      this.expandedPersonalisedProfiles.add(index);
    }
  }

  async onTogglePersonalisedDelete(row: any, event: any) {
    const newValue = row.delete !== true;
    if (!confirm('Are you sure?')) {
      event.source.checked = row.delete !== true;
      return;
    }
    try {
      const bufferDocRef = doc(this.firestore, 'buffermix archive', row.docid);
      await updateDoc(bufferDocRef, { delete: newValue });
      const playlistCollection = collection(this.firestore, 'recommended mix playlist');
      const q = query(playlistCollection, where('bufferdocref', '==', bufferDocRef));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(this.firestore);
        snap.docs.forEach(d => batch.update(d.ref, { delete: newValue }));
        await batch.commit();
      }
      row.delete = newValue;
      this.buildPersonalisedStats();
    } catch (err) {
      console.error(err);
      event.source.checked = row.delete !== true;
    }
  }
  getMetaData() {
    return Promise.all([
      getDocs(collection(this.firestore, 'series')).then(seriesSnap => {
        for (let i = 0; i < seriesSnap.docs.length; i++) {
          const element = seriesSnap.docs[i];
          this.mapPlaylist[element.id] = element.data()['seriesName']
          this.mapPlaylistMeta[element.id] = element.data();
        }
      }),
      getDocs(collection(this.firestore, 'episodes')).then(episodeSnap => {
        for (let i = 0; i < episodeSnap.docs.length; i++) {
          const element = episodeSnap.docs[i];
          this.mapEpisodes[element.id] = element.data()['title']
          this.mapEpisodesMeta[element.id] = element.data();
        }
      }),
      getDocs(collection(this.firestore, 'solar voice playlist')).then(solarVoiceSnap => {
        for (let i = 0; i < solarVoiceSnap.docs.length; i++) {
          const element = solarVoiceSnap.docs[i];
          this.mapPlaylist[element.id] = element.data()['name']
          this.mapPlaylistMeta[element.id] = element.data();
        }
      }),
      getDocs(collection(this.firestore, 'solar voice audios')).then(audiosSnap => {
        for (let i = 0; i < audiosSnap.docs.length; i++) {
          const element = audiosSnap.docs[i];
          this.mapAudio[element.id] = element.data()['name']
          this.mapAudioMeta[element.id] = element.data();
        }
      }),
      getDocs(collection(this.firestore, 'content_urls')).then(contentSnap => {
        for (let i = 0; i < contentSnap.docs.length; i++) {
          const element = contentSnap.docs[i];
          this.mapPlaylist[element.id] = element.data()['title']
          this.mapPlaylistMeta[element.id] = element.data();
        }
      })
    ]);
  }
  onEventSelect(event: MatSelectChange): void {
    this.selectedEvent = event.value;
    console.log('Selected event:', this.selectedEvent);
  }
  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.groupDataSource.paginator = this.groupPaginator;
    this.groupDataSource.sort = this.groupSort;
    this.personalisedDataSource.paginator = this.personalisedPaginator;
    this.personalisedDataSource.sort = this.personalisedSort;
  }
  // onToggleDeletePlaylist(row: any, event: any) {
  //   const newValue = row.delete !== true;
  //   if (!confirm('Are you sure?')) {
  //     event.source.checked = row.delete !== true; 
  //     return;
  //   }
  //   const docRef = doc(this.firestore, 'recommended mix playlist', row.id);
  //   updateDoc(docRef, { delete: newValue });
  // }
  async onToggleDeletePlaylist(row: any, event: any) {
    const newValue = row.delete !== true;
    if (!confirm('Are you sure?')) {
      event.source.checked = row.delete !== true; 
      return;
    }
    try {
      const docRef = doc(this.firestore, 'recommended mix playlist', row.id);
      await updateDoc(docRef, { delete: newValue });
      row.delete = newValue;
    } catch (err) {
      console.error(err);
      event.source.checked = row.delete !== true;
    }
  }
  // onDeletePlaylist(docData: any, bool: boolean) {
  //   if (confirm("Are you sure ?")) {
  //     const docRef = doc(this.firestore, "recommended mix playlist", docData.id);
  //     updateDoc(docRef, { delete: bool })
  //   }
  // }
  onDeleteAllPlaylist(docData: any, bool: boolean) {
    if (confirm("Are you sure ?")) {
      const colRef = collection(this.firestore, "recommended mix playlist");
      const q = query(colRef, where("bufferdocref", "==", docData.bufferdocref));

      getDocs(q).then(snap => {
        const batch = writeBatch(this.firestore);
        snap.docs.forEach(d => {
          batch.update(d.ref, { delete: bool });
        });

        batch.commit().then(() => {
          console.log("done");
        });
      });
    }
  }
  copyToClipboard(data) {
    var url = "https://breakthroughs.app/content/recommended/" + data["id"]
    this.clipboard.copy(url)
  }
  copyToClipboardgroup(data) {
    console.log(data,'consoleclipdatalogg');
    var url = "https://breakthroughs.app/recommended/" + data["docid"]
    this.clipboard.copy(url)
    this.snackbarService.show(data["title"] + ' Depelink copied');
  }
  formatDate(date: any) {
    if (!date) return '';
    if (date?.toDate) {
      return date.toDate().toDateString();
    } else if (date?.toDateString) {
      return date?.toDateString()
    }

    return date;
  }

    exportPlaylistExcel() {
    const data = this.dataSource.filteredData;
    const sheetData: any[][] = [];
    const merges: XLSX.Range[] = [];
    sheetData.push([
      'Name',
      'Type',
      'Playlist',
      'Created Date',
      'Personalised',
      'Recommended Person',
      'Title',
      'Description',
      'Delete',
      'Delete All'
    ]);

    let rowIndex = 1;
    data.forEach((item : any )=> {
      const playlistLength = item?.list?.length || 1;
      const startRow = rowIndex;
      const playList = item?.list || [];
      const personalised = [null , undefined].includes(item?.personalised) ? '' :String(item?.personalised);

      playList.forEach((playlistItem: any, i: number) => {
        sheetData.push([
          i === 0 ? item.name || '' : '',
          i === 0 ? item.type || '' : '',
          this.mapPlaylist[playlistItem?.id] || '',
          i === 0 ? this.formatDate(item?.date) || '' : '',
          i === 0 ? personalised  : '',
          i === 0 ? item?.recommendedbyname || '' : '',
          i === 0 ? item?.title || '': '',
          i === 0 ? item?.description || '' : '',
          i === 0 ? item?.delete ? 'Enable' : 'Disable' : '', 
          i === 0 ? item?.delete ? 'Enable All' : 'Disable All' : '', 
        ]);

        rowIndex++;
      });
      if (playlistLength > 1) {
        merges.push({
          s: { r: startRow, c: 2 },
          e: { r: startRow + playlistLength - 1, c: 2 }
        });
      }
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    worksheet['!cols'] = [
      { wch: 25 },
      { wch: 18 },
      { wch: 40 },
      { wch: 18 },
      { wch: 15 },
      { wch: 22 },
      { wch: 15 },
      { wch: 30 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Content');

    XLSX.writeFile(
      workbook,
      `content_playlist_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  }
  expandedProfiles = new Set<number>();

  toggleProfiles(index: number) {
    if (this.expandedProfiles.has(index)) {
      this.expandedProfiles.delete(index);
    } else {
      this.expandedProfiles.add(index);
    }
  }
  sidePanelOpen = false;
  sidePanelTitle = '';
  sidePanelProfiles: {
    name: string;
    profileid: string;
    completed: boolean;
    playlistDoc: any;
    percentage?: number;
    metadata?: any;
  }[] = [];
  openContentPanel(
  groupRow: any,
  type: 'eiflix' | 'generalcontent' | 'solarvoice',
  itemIndex: number,
  status: 'all' | 'completed' | 'notcompleted',
  sequenceIndex?: number
) {
  const contentList: any[] = groupRow[type] || [];
  const item = contentList[itemIndex];
  const itemId = item?.id || item;
  const itemName = this.mapPlaylist[itemId] || itemId;

  const completedField = type === 'generalcontent' ? 'completedcontent' : 'completedplaylist';
  const matchingDocs = this.playlist.filter(
    p => p['bufferdocref']?.id === groupRow['docid'] && p['type'] === type
  );

  if (sequenceIndex !== undefined) {
    const meta = this.mapPlaylistMeta[itemId];
    const sequenceRefs: any[] = meta?.sequence || [];
    const seqRef = sequenceRefs[sequenceIndex];
    const seqId = seqRef?.id || seqRef;
    const seqName =
      type === 'solarvoice'
        ? this.mapAudio[seqId] || seqId
        : this.mapEpisodes[seqId] || seqId;

    let profiles = matchingDocs.map(doc => {
      const completedContentIds: string[] = (doc['completedcontent'] || []).map((r: any) => r?.id || r);
      const completed = completedContentIds.includes(seqId);
      return {
        name: this.mapProfile[doc['profileid']] || doc['profileid'],
        profileid: doc['profileid'],
        completed,
        playlistDoc: doc,
        percentage: undefined,
        metadata: this.mapProfileMeta[doc['profileid']] || null
      };
    });

    if (status === 'completed') {
      profiles = profiles.filter(p => p.completed);
    } else if (status === 'notcompleted') {
      profiles = profiles.filter(p => !p.completed);
    }

    const statusLabel =
      status === 'completed' ? ' — Completed' :
      status === 'notcompleted' ? ' — Pending' : '';

    this.sidePanelTitle = `${itemName} › ${seqName}${statusLabel}`;
    this.sidePanelProfiles = profiles;
    this.sidePanelOpen = true;
    return;
  }

  const sequenceArray = this.mapPlaylistMeta[itemId]?.['sequence'] || [];

  let profiles = matchingDocs.map(doc => {
    const completedIds: string[] = (doc[completedField] || []).map((ref: any) => ref?.id || ref);
    let percentage: number | undefined = undefined;

    if (type === 'eiflix' || type === 'solarvoice') {
      const sequenceIds: string[] = (sequenceArray || []).map((ref: any) => ref?.id || ref);
      const completedContentIds: string[] = (doc['completedcontent'] || []).map((ref: any) => ref?.id);
      const totalSequence = sequenceIds.length;
      if (totalSequence > 0) {
        const matchedCount = sequenceIds.filter(id => completedContentIds.includes(id)).length;
        percentage = Math.round((matchedCount / totalSequence) * 100);
      }
    }

    return {
      name: this.mapProfile[doc['profileid']] || doc['profileid'],
      profileid: doc['profileid'],
      completed: (doc[completedField] || []).map((ref: any) => ref?.id || ref).includes(itemId),
      playlistDoc: doc,
      percentage,
      metadata: this.mapProfileMeta[doc['profileid']] || null
    };
  });

  if (status === 'completed') {
    profiles = profiles.filter(p => p.completed);
  } else if (status === 'notcompleted') {
    profiles = profiles.filter(p => !p.completed);
  }

  const statusLabel =
    status === 'completed' ? ' — Completed' :
    status === 'notcompleted' ? ' — Pending' : '';

  this.sidePanelTitle = `${itemName}${statusLabel}`;
  this.sidePanelProfiles = profiles;
  this.sidePanelOpen = true;
}
  // openContentPanel(
  //   groupRow: any,
  //   type: 'eiflix' | 'generalcontent' | 'solarvoice',
  //   itemIndex: number,
  //   status: 'all' | 'completed' | 'notcompleted'
  // ) {

  //   const contentList: any[] = groupRow[type] || [];
  //   const item = contentList[itemIndex];
  //   const itemId = item?.id || item;
  //   const itemName = this.mapPlaylist[itemId] || itemId;
  //   const sequenceArray = this.mapPlaylistMeta[itemId]['sequence'] || itemId;
  //   console.log(itemName,'consoleitemname');
  //   console.log(itemId,'consoleitemid');
  //   console.log(sequenceArray,'sequenceArray');
  //   const completedField = type === 'generalcontent' ? 'completedcontent' : 'completedplaylist';
  //   const matchingDocs = this.playlist.filter(
  //     p =>
  //       p['bufferdocref']?.id === groupRow['docid'] &&
  //       p['type'] === type
  //   );

  //   let profiles = matchingDocs.map(doc => {
  //     const completedIds: string[] = (doc[completedField] || []).map((ref: any) => ref?.id || ref);
  //     let percentage: number | undefined = undefined;
  //     if (type === 'eiflix' || type === 'solarvoice') {
  //       const sequenceIds: string[] = (sequenceArray || []).map((ref: any) => ref?.id || ref);
  //       const completedContentIds: string[] = (doc['completedcontent'] || []).map((ref: any) => ref?.id);
  //       const totalSequence = sequenceIds.length;
  //       if (totalSequence > 0) {
  //         const matchedCount = sequenceIds.filter(id =>
  //           completedContentIds.includes(id)
  //         ).length;
  //         percentage = Math.round((matchedCount / totalSequence) * 100);
  //       }
  //     }
  //     return {
  //       name: this.mapProfile[doc['profileid']] || doc['profileid'],
  //       profileid: doc['profileid'],
  //       completed: completedIds.includes(itemId),
  //       playlistDoc: doc,
  //       percentage,
  //       metadata: this.mapProfileMeta[doc['profileid']] || null
  //     };
  //   });
  //   if (status === 'completed') {
  //     profiles = profiles.filter(p => p.completed);
  //   } else if (status === 'notcompleted') {
  //     profiles = profiles.filter(p => !p.completed);
  //   }
  //   const statusLabel =
  //     status === 'completed'
  //       ? ' — Completed'
  //       : status === 'notcompleted'
  //       ? ' — Pending'
  //       : '';

  //   this.sidePanelTitle = `${itemName}${statusLabel}`;
  //   this.sidePanelProfiles = profiles;
  //   this.sidePanelOpen = true;
  // }
  // openContentPanel(groupRow: any, type: 'eiflix' | 'generalcontent' | 'solarvoice', itemIndex: number, status: 'all' | 'completed' | 'notcompleted') {
  //   console.log('start conosle')
  //   console.log(groupRow)
  //   console.log(type)
  //   console.log(itemIndex,'index')
  //   console.log(status)
  //   console.log('end conosle')
  //   const contentList: any[] = groupRow[type] || [];
  //   const item = contentList[itemIndex];
  //   const itemId = item?.id || item;
  //   const itemName = this.mapPlaylist[itemId] || itemId;
  //   const completedField = type === 'generalcontent' ? 'completedcontent' : 'completedplaylist';

  //   const matchingDocs = this.playlist.filter(
  //     p => (p['bufferdocref']?.id === groupRow['docid']) && p['type'] === type
  //   );

  //   let profiles = matchingDocs.map(doc => {
  //     const completedIds: string[] = (doc[completedField] || []).map((ref: any) => ref?.id || ref);
  //     return {
  //       name: this.mapProfile[doc['profileid']] || doc['profileid'],
  //       completed: completedIds.includes(itemId)
  //     };
  //   });

  //   if (status === 'completed') {
  //     profiles = profiles.filter(p => p.completed);
  //   } else if (status === 'notcompleted') {
  //     profiles = profiles.filter(p => !p.completed);
  //   }

  //   const statusLabel = status === 'completed' ? ' — Completed' : status === 'notcompleted' ? ' — Pending' : '';
  //   this.sidePanelTitle = `${itemName}${statusLabel}`;
  //   this.sidePanelProfiles = profiles;
  //   this.sidePanelOpen = true;
  // }
  closeSidePanel() {
    this.sidePanelOpen = false;
  }
  // private buildGroupStats() {
  //   for (const group of this.groupPlaylist) {
  //     group._stats = {};
  //     for (const type of ['eiflix', 'generalcontent', 'solarvoice']) {
  //       const contentList: any[] = group[type] || [];
  //       const completedField = type === 'generalcontent' ? 'completedcontent' : 'completedplaylist';
  //       const matchingDocs = this.playlist.filter(
  //         p => p['bufferdocref']?.id === group['docid'] && p['type'] === type
  //       );
  //       const total = matchingDocs.length;

  //       group._stats[type] = contentList.map(item => {
  //         const itemId = item?.id || item;
  //         let completed = 0;
  //         matchingDocs.forEach(d => {
  //           const ids = (d[completedField] || []).map((r: any) => r?.id || r);
  //           if (ids.includes(itemId)) completed++;
  //         });
  //         return { total, completed, notCompleted: total - completed };
  //       });
  //     }
  //   }
  // }
  private buildGroupStats() {
    for (const group of this.groupPlaylist) {
      group._stats = {};

      for (const type of ['eiflix', 'generalcontent', 'solarvoice']) {
        const contentList: any[] = group[type] || [];
        const matchingDocs = this.playlist.filter(
          p => p['bufferdocref']?.id === group['docid'] && p['type'] === type
        );
        const total = matchingDocs.length;

        group._stats[type] = contentList.map(item => {
          const itemId = item?.id || item;
          const completedField = type === 'generalcontent' ? 'completedcontent' : 'completedplaylist';

          let completed = 0;
          matchingDocs.forEach(d => {
            const ids = (d[completedField] || []).map((r: any) => r?.id || r);
            if (ids.includes(itemId)) completed++;
          });

          let sequenceStats: { id: string; completed: number; notCompleted: number }[] = [];
          if (type === 'eiflix' || type === 'solarvoice') {
            const meta = this.mapPlaylistMeta[itemId];
            const sequenceRefs: any[] = meta?.sequence || [];
            sequenceStats = sequenceRefs.map(seq => {
              const seqId = seq?.id || seq;
              let seqCompleted = 0;
              matchingDocs.forEach(d => {
                const completedContentIds = (d['completedcontent'] || []).map((r: any) => r?.id || r);
                if (completedContentIds.includes(seqId)) seqCompleted++;
              });
              return {
                id: seqId,
                completed: seqCompleted,
                notCompleted: total - seqCompleted
              };
            });
          }

          return { total, completed, notCompleted: total - completed, sequenceStats };
        });
      }
    }
  }
  applyGroupFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.groupDataSource.filter = filterValue;
    this.applyGroupSort();
  }
  buildProfileList() {
    this.profileList = Object.keys(this.mapProfile)
      .filter(id => id && id !== 'undefined' && this.mapProfile[id])
      .map(id => ({
        id,
        name: this.mapProfile[id]
      }));
    this.profileList.sort((a, b) => a.name.localeCompare(b.name));
  }

  get filteredProfileList() {
    if (!this.profileSearchText) return this.profileList;
    const search = this.profileSearchText.toLowerCase();
    return this.profileList.filter(p => p.name.toLowerCase().includes(search));
  }

  applyGroupSort() {
    let data = [...this.groupPlaylist];
    if (this.selectedProfileIds.length > 0) {
      data = data.filter(row =>
        (row['profileid'] || []).some((id: string) => this.selectedProfileIds.includes(id))
      );
    }
    if (this.groupDataSource.filter) {
      const filter = this.groupDataSource.filter;
      data = data.filter(row => {
        const title = (row['title'] || '').toLowerCase();
        const desc = (row['description'] || '').toLowerCase();
        return title.includes(filter) || desc.includes(filter);
      });
    }
    if (this.groupSortField) {
      data.sort((a, b) => {
        let valA: any, valB: any;

        if (this.groupSortField === 'date' || this.groupSortField === 'expiredate') {
          valA = a[this.groupSortField]?.toDate ? a[this.groupSortField].toDate().getTime() : 0;
          valB = b[this.groupSortField]?.toDate ? b[this.groupSortField].toDate().getTime() : 0;
        } else {
          valA = (a[this.groupSortField] || '').toString().toLowerCase();
          valB = (b[this.groupSortField] || '').toString().toLowerCase();
        }

        if (valA < valB) return this.groupSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return this.groupSortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    this.groupDataSource.data = data;
  }

  onGroupSortChange(field: string) {
    if (this.groupSortField === field) {
      this.groupSortDirection = this.groupSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.groupSortField = field;
      this.groupSortDirection = field === 'title' ? 'asc' : 'desc';
    }
    this.applyGroupSort();
  }
  clearGroupFilters() {
    this.groupSortField = '';
    this.groupSortDirection = 'desc';
    this.selectedProfileIds = [];
    this.profileSearchText = '';
    this.groupDataSource.filter = '';
    this.groupDataSource.data = this.groupPlaylist;
  }

  get hasGroupFilters(): boolean {
    return !!this.groupSortField || this.selectedProfileIds.length > 0 || !!this.groupDataSource.filter;
  }
  onProfileFilterChange() {
    this.applyGroupSort();
  }
  onEditGroup(row: any) {
    this.dialog.open(EditrecommendedplaylistComponent, {
      width: '900px',
      data: {
        row: row,
        mapPlaylist: this.mapPlaylist,
        mapProfile: this.mapProfile,
        mapPlaylistMeta: this.mapPlaylistMeta,
        profileList: this.profileList
      }
    });
  }
  async onToggleGroupDelete(row: any, event?: any) {
    const newValue = !row.delete;
    if (!confirm(`Are you sure you want to ${newValue ? 'disable' : 'enable'} this group?`)) {
      if (event?.source) {
        event.source.checked = row.delete !== true;
      }
      return;
    }
    try {
      const bufferDocRef = doc(this.firestore, 'buffermix archive', row.docid);
      await updateDoc(bufferDocRef, { delete: newValue });
      const playlistCollection = collection(this.firestore, 'recommended mix playlist');
      const q = query(playlistCollection, where('bufferdocref', '==', bufferDocRef));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(this.firestore);
        snap.docs.forEach(d => batch.update(d.ref, { delete: newValue }));
        await batch.commit();
      }
      row.delete = newValue;
    } catch (err) {
      console.error(err);
      if (event?.source) {
        event.source.checked = row.delete !== true;
      }
    }
  }
  async sendWatti() {
    const { SendmessagesComponent } = await import('../../New-Workshop/workshop-dashboard/sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'whatsapp' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleDialogResult(result);
    });
  }
async sendNotificationinBreakthrough(){
    console.log(this.sidePanelProfiles,"thisssssssss")
    const { AhNotificationComponent } = await import(
      '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    let dialogRef = this.dialog.open(AhNotificationComponent, {      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
      data:this.sidePanelProfiles
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(profileID,"profile id worskshop notifiation");
      if(result != null && result != undefined){
        var userID = [];
        var profileID = this.sidePanelProfiles.map(p => p.profileid);
        console.log(profileID,"profile id worskshop notifiation");
        var notificationimage = null
        if(result["notificationimage"] != null){
        const { getDownloadURL, ref, uploadBytes } = await import('@angular/fire/storage');
        const { inject } = await import('@angular/core');
        const { getStorage } = await import('firebase/storage');
        const { getApp } = await import('firebase/app');
        const storage = getStorage(getApp());
        const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
        try {
          const storageRef = ref(storage, filepath);
          const uploadResult = await uploadBytes(storageRef, result['notificationimage']);
          notificationimage = await getDownloadURL(uploadResult.ref);
        } catch (error) {
          console.log('file upload error', error);
        }
        }
        this.guard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true, 
          landingpage: result["landingpage"],
          profileid: profileID,
        }).then(()=>{
          console.log( notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  }
  private getCloudFunctionUrl(functionName: string): string {
    const projectId = environment.firebase.projectId;
    const projectUrlMap: Record<string, string> = {
      'test-environment-841c3': `https://us-central1-test-environment-841c3.cloudfunctions.net/${functionName}`,
      'starlabs-test': `https://us-central1-starlabs-test.cloudfunctions.net/${functionName}`,
      'fir-sample-aae4a': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
      'launch-your-legacy-development': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
    };
    return projectUrlMap[projectId] || '';
  }
  private async handleDialogResult(result: any) {
    if (result?.action === 'sent') {
      if (result.type === 'mail') {
        console.log(this.sidePanelProfiles, 'message participants');
        console.log('Message sent:', result);
        const { subject, message } = result;
        const recipients = this.sidePanelProfiles
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['email'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            return {
              email: metadata['email'],
              name: metadata['name']
            };
          });

        if (recipients.length === 0) {
          this.snackbarService.show('No valid recipients found');
          return;
        }

        const bulkPayload = {
          type: 'mail',
          subject,
          message,
          recipients 
        };

        // let url: string = '';
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        // if (environment.firebase.projectId === 'test-environment-841c3') {
        //   console.log('Test Env 1');
        //   url = 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage';
        // } else if (environment.firebase.projectId === 'starlabs-test') {
        //   console.log('Test Env 2');
        //   url = 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage';
        // } else if (
        //   environment.firebase.projectId === 'fir-sample-aae4a' ||
        //   environment.firebase.projectId === 'launch-your-legacy-development'
        // ) {
        //   console.log('Production Env');
        //   url = 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
        // }

        try {
          const response = await firstValueFrom(
            this.http.post(url, bulkPayload, { responseType: 'json' })
          );

          console.log('Bulk email response:', response);

          const result = response as any;
          const successfulSends = result.successCount || 0;
          const failedSends = result.failureCount || 0;
          const totalParticipants = recipients.length;

          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `Message successfully sent to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Sent to ${successfulSends} participants. Failed to send to ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);

        } catch (error) {
          console.error('Failed to send bulk emails:', error);
          this.snackbarService.show('Failed to send bulk emails');
        }

      } else if (result.type === 'whatsapp') {
        console.log(this.sidePanelProfiles, 'WhatsApp participants');
        console.log('WhatsApp message:', result);
        const { templateName, customParams } = result;
        const participants = this.sidePanelProfiles
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['phonenumber'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            const name = metadata['name'];
            let cc = metadata['countryCode'] || metadata['countrycode'] || '';
              cc = cc.trim();
              if (cc && !cc.startsWith('+')) {
                cc = '+' + cc;
              }
            let phone = metadata['phonenumber']?.toString().trim() || '';
            phone = phone.replace(/^\+/, '');
            const fullPhoneNumber = cc ? `${cc}${phone}` : phone;
            const processedParams = customParams.map((param: any) => ({
              name: param.name,
              value: param.value.replace(/\{\{name\}\}/g, name)
            }));

            return {
              phonenumber: fullPhoneNumber,
              name,
              customParams: processedParams
            };
          });

        if (participants.length === 0) {
          this.snackbarService.show('No valid participants found');
          return;
        }

        const bulkPayload = {
          type: 'whatsapp',
          templateName,
          participants 
        };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');
        // let url: string = '';

        // if (environment.firebase.projectId === 'test-environment-841c3') {
        //   console.log('Test Env 1');
        //   url = 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage';
        // } else if (environment.firebase.projectId === 'starlabs-test') {
        //   console.log('Test Env 2');
        //   url = 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage';
        // } else if (
        //   environment.firebase.projectId === 'fir-sample-aae4a' ||
        //   environment.firebase.projectId === 'launch-your-legacy-development'
        // ) {
        //   console.log('Production Env');
        //   url = 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
        // }

        try {
          const response = await firstValueFrom(
            this.http.post(url, bulkPayload, { responseType: 'json' })
          );

          console.log('Bulk WhatsApp response:', response);

          const result = response as any;
          const successfulSends = result.successCount || 0;
          const failedSends = result.failureCount || 0;
          const totalParticipants = participants.length;
          const broadcastName = result.broadcastName || ' ';
          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `WhatsApp broadcast "${broadcastName}" sent successfully to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Broadcast "${broadcastName}": Sent to ${successfulSends} participants. Failed: ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send WhatsApp message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);

        } catch (error) {
          console.error('Failed to send bulk WhatsApp:', error);
          this.snackbarService.show('Failed to send bulk WhatsApp messages');
        }
      }
    } else if (result?.action === 'closed') {
      console.log('closed');
    }
  }
  // async onToggleGroupDelete(row: any) {
  //   const newValue = !row.delete;
  //   if (!confirm(`Are you sure you want to ${newValue ? 'disable' : 'enable'} this group?`)) return;
  //   try {
  //     const bufferDocRef = doc(this.firestore, 'buffermix archive', row.docid);
  //     await updateDoc(bufferDocRef, { delete: newValue });
  //     const playlistCollection = collection(this.firestore, 'recommended mix playlist');
  //     const q = query(playlistCollection, where('bufferdocref', '==', bufferDocRef));
  //     const snap = await getDocs(q);
  //     if (!snap.empty) {
  //       const batch = writeBatch(this.firestore);
  //       snap.docs.forEach(d => batch.update(d.ref, { delete: newValue }));
  //       await batch.commit();
  //     }
  //     row.delete = newValue;
  //   } catch (err) {
  //     console.error(err);
  //   }
  // }
  get sortedSidePanelProfiles() {
    return [...this.sidePanelProfiles].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? -1 : 1;
      }
      
      const pA = a.percentage ?? -1;
      const pB = b.percentage ?? -1;
      return pB - pA;
    });
  }
  getProgressState(p: any): 'not-started' | 'in-progress' | 'completed' {
    if (p.completed) return 'completed';
    if (p.percentage !== undefined && p.percentage > 0) return 'in-progress';
    return 'not-started';
  }
}
