import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subscription, Observable, startWith, map, Subject, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import {
  collection, collectionData, doc, Firestore, getDocs,orderBy, query, where, getDoc,updateDoc,arrayUnion,setDoc} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as XLSX from 'xlsx';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { environment } from '../../../environments/environment';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';

@Component({
  selector: 'app-channel-record',
  standalone: true,
  imports: [
    CommonModule,
    MatInputModule,
    MatFormFieldModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatDialogModule
  ],
  templateUrl: './channel-record.component.html',
  styleUrl: './channel-record.component.css'
})
export class ChannelRecordComponent implements OnInit, OnDestroy {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  displayedColumns: string[] = [
    'logDateTime', 'channelName', 'message', 'category', 'sentTo','actionClicks','receivedRate'
  ];

  notificationDataSource = new MatTableDataSource<any>();
  notificationSubscription: Subscription;

  // Profile maps
  mapProfile: any = {};
  mapProfiledata: any = {};

  // ── Category map: id -> name ──────────────────────────────────────────────
  categoryMap: { [id: string]: string } = {};

  // ── Channel map: id -> name ───────────────────────────────────────────────
  channelMap: { [id: string]: string } = {};

  // ── Filters ─────
  startDate: Date | null = null;
  endDate: Date | null = null;
  searchText: string = '';
  selectedCategory: string = '';
  selectedChannel: string = '';

  // Profile autocomplete
  profileSearchText: string = '';
  selectedProfileId: string | null = null;
  profileOptions: { id: string; name: string; email: string }[] = [];
  filteredProfileOptions: { id: string; name: string; email: string }[] = [];

  // Dropdown option lists — both hold { id, name } for ID-based filtering
  categoryOptions: { id: string; name: string }[] = [];
  channelOptions: { id: string; name: string }[] = [];

  // ── Statistics ────────────────────────────────────────────────────────────
  totalNotifications: number = 0;
  newlyNotifications: any[] = [];
  notificationSentRate: string = '0';
  newlysentnotificationRate: string = '0.00';
  failedNotifications: number = 0;
  currentfailedRate: number = 0;

  allNotifications: any[] = [];

  // ── Participants dialog ─────────────────────────────────────────────────────
  showParticipantsDialog: boolean = false;
  currentNotificationData: any = null;
  selectedTab: 'success' | 'failed' = 'success';

  currentChannelId: string = '';
  currentMessagesDocId: string = '';

  successParticipants: any[] = [];
  failedParticipants: any[] = [];
  filteredSuccessParticipants: any[] = [];
  filteredFailedParticipants: any[] = [];

  ParticipantSearchText: string = '';

  // Pagination inside dialog
  successPageIndex: number = 0;
  failedPageIndex: number = 0;
  pageSize: number = 10;
  pageSizeOptions: number[] = [10, 25, 50];

  // Log-loading state
  logsLoadingCount: number = 0;
  logsCheckedCount: number = 0;
  totalParticipantsWithUserRef: number = 0;
  isLoadingAllLogs: boolean = false;
  isExporting: boolean = false;

   // Follow-up card counts
  resolvedCount: number = 0;
  watchingCount: number = 0;
  noResponseCount: number = 0;
  totalFollowUpSent: number = 0;
  totalFailedParticipants: number = 0;
  totalFailedBroadcasts: number = 0;
 
  // Failures dialog
  showFailuresDialog: boolean = false;
  activeFailureTab: string = 'all';
  failureColumns: string[] = ['Participant', 'broadcast', 'failure', 'age', 'channelStatus', 'followUp'];
  failureTableSource = new MatTableDataSource<any>();
  failureTabs: { key: string; label: string; count: number }[] = [];
  selectedFailureProfileIds: Set<string> = new Set();

  // button click event
  buttonClicksDialogOpen: boolean = false;
  currentButtonClicks: { label: string; url: string; clickers: { profileId: string; name: string }[] }[] = [];
  currentButtonClicksTitle: string = '';
 
  private allFailureRows: any[] = [];

    private avatarColors = [
    '#4f6bed', '#e85d9f', '#2bb06b', '#f5a623',
    '#9b59b6', '#1abc9c', '#e74c3c', '#3498db'
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private sanitizer: DomSanitizer,
    private dialog: MatDialog,        
    private http: HttpClient 
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.setDefaultDates();
    this.setupFilterPredicate();

    // Load categories from classify -> channelcategories document
    this.fetchCategories();

    // Load channels map (id -> name) from channels collection
    this.fetchChannelMap();
    this.fetchData();

    // Load profile map
    this.guard.getProfileMap().then(data => {
      this.mapProfiledata = data.docdata;
      this.mapProfile = data.map;
      this.buildProfileOptions();
    });
  }

  ngOnDestroy(): void {
    this.notificationSubscription?.unsubscribe();
      this.destroy$.next();
  this.destroy$.complete();
  }

  private async fetchButtonClicksData(channelId: string, messagesDocId: string): Promise<{
  buttons: { label: string; url: string }[];
  button_clicks: { [label: string]: string[] };
}> {
  if (!channelId || !messagesDocId) return { buttons: [], button_clicks: {} };
  try {
    const messagesRef = collection(this.firestore, 'supportchat', channelId, 'messages');
    const q = query(messagesRef, where('messageid', '==', messagesDocId));
    const snap = await getDocs(q);
    if (snap.empty) return { buttons: [], button_clicks: {} };
    const data = snap.docs[0].data();
    return {
      buttons:       data['buttons']       || [],
      button_clicks: data['button_clicks'] || {},
    };
  } catch (err) {
    console.error('Error fetching button clicks:', err);
    return { buttons: [], button_clicks: {} };
  }
}

  // ── Fetch categories from classify/channelcategories ──────────────────────

  private async fetchCategories(): Promise<void> {
    try {
      // Path: classify (collection) -> channelcategories (document)
      const docRef = doc(this.firestore, 'classify', 'channelcategories');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const categories: { id: string; name: string }[] = data['categories'] || [];

        // Build category map: id -> name
        this.categoryMap = {};
        categories.forEach(cat => {
          this.categoryMap[cat.id] = cat.name;
        });

        // Set dropdown options (sorted by name)
        this.categoryOptions = [...categories].sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (err) {
      console.error('Error fetching channel categories:', err);
    }
  }

  // ── Fetch channels from supportchat collection (type == 'channel') ────────

  private async fetchChannelMap(): Promise<void> {
    try {
      const q = query(
        collection(this.firestore, 'supportchat'),
        where('type', '==', 'channel'),
        where('isdelete', '==', false)
      );
      const snap = await getDocs(q);
      this.channelMap = {};
      const options: { id: string; name: string }[] = [];

      snap.docs.forEach(d => {
        const data = d.data();
        const name = data['group_name'] || d.id;
        this.channelMap[d.id] = name;
        options.push({ id: d.id, name });
      });

      // Sort alphabetically by name
      this.channelOptions = options.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error('Error fetching channels from supportchat:', err);
    }
  }

  async buildFailureRows(notifications: any[]): Promise<void> {
    const rowMap = new Map<string, any>();
    const now = new Date();

    await Promise.all(notifications.map(async notif => {
      const failedProfiles: string[] = notif.profilefailed || [];
      if (!failedProfiles.length) return;

      const channelId  = notif?.metadata?.channelid || notif?.channelid || '';
      const messagesId = notif?.metadata?.messageid || '';

      const [readBySet, followUpSet, followUpSent] = await Promise.all([
        this.fetchReadBySet(channelId, messagesId),
        this.fetchFollowUpSet(channelId, messagesId),
        this.fetchFollowUpSentStatus(channelId, messagesId),
      ]);

      const sentAt: Date = notif.date?.toDate ? notif.date.toDate() : new Date(notif.date);
      const ageMinutes = Math.round((now.getTime() - sentAt.getTime()) / 60000);

      for (const profileId of failedProfiles) {
        if (rowMap.has(profileId)) continue;

        const name   = this.mapProfile[profileId]     || 'Unknown';
        const cohort = this.mapProfiledata[profileId]?.cohort || '';

        const failedlist: { [id: string]: string } = notif.failedlist || {};
        const rawReason: string = failedlist[profileId] || '';
        const hasRead     = readBySet.has(profileId);
        const hasFollowUp = followUpSet.has(profileId);

        let failureReason: string;
        if (!rawReason) {
          failureReason = 'Unknown error';
        } else if (
          rawReason.toLowerCase().includes('no active fcm token') ||
          rawReason.toLowerCase().includes('no user_ref') ||
          rawReason.toLowerCase().includes('profile not found') ||
          rawReason.toLowerCase().includes('registration-token-not-registered') ||
          rawReason.toLowerCase().includes('invalid-registration-token')
        ) {
          failureReason = 'App not linked';
        } else {
          failureReason = rawReason;
        }

        const appFCMSuccess: string[] = notif.appFCMSuccess || [];
        const webFCMSuccess: string[] = notif.webFCMSuccess || [];
        const delivered = appFCMSuccess.includes(profileId) || webFCMSuccess.includes(profileId);

        let followUpStatus: string;
        let channelStatus: string;

  const hasFollowUpSent = followUpSet.has(profileId);  

  if (hasRead) {
    followUpStatus = 'Resolved';
    channelStatus  = 'Delivered · Read';
  } else if (hasFollowUpSent) {
    followUpStatus = 'Watching';
    channelStatus  = 'Sent';
  } else if (delivered && !hasRead) {
    followUpStatus = 'Watching';
    channelStatus  = 'Delivered';
  } else {
    followUpStatus = 'Needs follow-up';
    channelStatus  = 'Not sent';
  }

        rowMap.set(profileId, {
          profileId,
          name,
          cohort,
          broadcastName:     notif.title || this.getChannelName(notif),
          broadcastCategory: this.getCategoryName(notif),
          sentAt,
          ageMinutes,
          failureReason,
          rawFailureReason:  rawReason || 'No error detail available',
          channelStatus,
          followUpStatus,
          notifDocId:    notif.docid,
          messagesDocId: notif.metadata?.messageid || null,
          channelId:     notif.metadata?.channelid || notif.channelid || null,
          selected: false,
        });
      }
    }));

    this.allFailureRows = Array.from(rowMap.values());
    this.computeFollowUpCounts(this.allFailureRows, notifications);  // ← updates card counts
    this.setFailureTab(this.activeFailureTab || 'all');
  }

  getAgeLabel(ageMinutes: number): string {
    if (ageMinutes < 60) {
      return `${ageMinutes}m ago`;
    } else if (ageMinutes < 1440) {         
      const hours = Math.floor(ageMinutes / 60);
      const mins  = ageMinutes % 60;
      return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
    } else {
      const days  = Math.floor(ageMinutes / 1440);
      const hours = Math.floor((ageMinutes % 1440) / 60);
      return hours > 0 ? `${days}d ${hours}h ago` : `${days}d ago`;
    }
  }

  private async refreshFollowUpStatusForRows(
    rows: any[],
    channelId: string,
    notifDocId: string
  ): Promise<void> {
      const notif       = this.allNotifications.find(n => n.docid === notifDocId);
      const messagesId  = notif?.metadata?.messageid || '';       
      const readBySet   = await this.fetchReadBySet(channelId, messagesId);
      const followUpSent = await this.fetchFollowUpSentStatus(channelId, messagesId);

      for (const row of rows) {
        const appFCMSuccess: string[] = notif?.appFCMSuccess || [];
        const webFCMSuccess: string[] = notif?.webFCMSuccess || [];
        const delivered  = appFCMSuccess.includes(row.profileId) || webFCMSuccess.includes(row.profileId);
        const hasRead    = readBySet.has(row.profileId);

        let followUpStatus: string;
        let channelStatus: string;

    const followUpSet = await this.fetchFollowUpSet(channelId, messagesId);
    const hasFollowUpSent = followUpSet.has(row.profileId);

    if (hasRead) {
      followUpStatus = 'Resolved';
      channelStatus  = 'Delivered · Read';
    } else if (hasFollowUpSent) {
      followUpStatus = 'Watching';
      channelStatus  = 'Sent';
    } else if (delivered && !hasRead) {
      followUpStatus = 'Watching';
      channelStatus  = 'Delivered';
    } else {
      followUpStatus = 'Needs follow-up';
      channelStatus  = 'Not sent';
    }

        row.followUpStatus = followUpStatus;
        row.channelStatus  = channelStatus;

        const idx = this.allFailureRows.findIndex(r => r.profileId === row.profileId);
        if (idx > -1) {
          this.allFailureRows[idx].followUpStatus = followUpStatus;
          this.allFailureRows[idx].channelStatus  = channelStatus;
        }
      }

      this.computeFollowUpCounts(this.allFailureRows, this.allNotifications);
      this.setFailureTab(this.activeFailureTab);
  }

    // ── Checkbox selection ────────────────────────────────────────────────────
  toggleFailureSelection(row: any): void {
    row.selected = !row.selected;
    if (row.selected) {
      this.selectedFailureProfileIds.add(row.profileId);
    } else {
      this.selectedFailureProfileIds.delete(row.profileId);
    }
  }

  getSelectedFailureRows(): any[] {
    return this.failureTableSource.data.filter(r => r.selected);
  }

  get selectedFailureCount(): number {
    return this.failureTableSource.data.filter(r => r.selected).length;
  }

  async sendFailureFollowUpEmail(): Promise<void> {
    const selected = this.getSelectedFailureRows();
    if (selected.length === 0) { alert('Please select at least one Participant'); return; }

    const selectedProfiles = selected.map(r => this.mapProfiledata[r.profileId]).filter(p => p != null);
    if (selectedProfiles.length === 0) { alert('No profile data found for selected Participants'); return; }

    const dialogRef = this.dialog.open(EmailInputComponent, {
      data: {
        profiles: selectedProfiles,
        filterTemplateName: 'Create template'   
      },
      minWidth: '600px',
      disableClose: true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
    if (result != null && result != undefined) {
      const archiveid = result?.docid ?? result?.archiveid ?? null;  // ← extract here

      const docRef = doc(collection(this.firestore, 'email archive'), result['docid']);
      if (result['status'] === 'queued' || result['status'] === 'send') {
        await setDoc(docRef, result, { merge: true })
          .then(() => this.guard.openSnackBar('Email Sent', 'OK', 600))
          .catch(err => { console.error(err); this.guard.openSnackBar('Error Sending Email', 'OK', 600); });
      } else if (result['status'] === 'validated') {
        let url = environment.firebase.projectId === 'starlabs-test'
          ? 'https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail'
          : 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail';
        let data = result; data['archiveid'] = result['docid'];
        this.http.post(url, JSON.stringify(data), { responseType: 'text', headers: new HttpHeaders().set('Content-Type', 'application/json') })
          .subscribe({ next: res => console.log(res), error: err => console.error(err) });
      }

      await this.writeFollowUpRecord(selected, 'email', archiveid);  // ← pass it
    }
  });

  }

  private async writeFollowUpRecord(rows: any[], medium: 'wati' | 'email', archiveid?: string): Promise<void> {
    const byBroadcast = new Map<string, { profileIds: string[]; messagesDocId: string; channelId: string }>();

    rows.forEach(r => {
      if (!byBroadcast.has(r.notifDocId)) {
        byBroadcast.set(r.notifDocId, {
          profileIds:    [],
          messagesDocId: r.messagesDocId || '',
          channelId:     r.channelId     || '',
        });
      }
      byBroadcast.get(r.notifDocId)!.profileIds.push(r.profileId);
    });

    for (const [notifDocId, { profileIds, messagesDocId, channelId }] of byBroadcast.entries()) {

      if (!channelId || !messagesDocId) {
        console.warn(`Missing channelId or messagesDocId for notifDocId: ${notifDocId}`);
        this.guard.openSnackBar('Could not find channel — follow-up not recorded', 'OK', 3000);
        continue;
      }

      try {
        const messagesRef = collection(this.firestore, 'supportchat', channelId, 'messages');
        const q           = query(messagesRef, where('messageid', '==', messagesDocId));
        const snap        = await getDocs(q);

        if (snap.empty) {
          console.warn(`channelId: ${channelId}, messageid: ${messagesDocId}`);
          this.guard.openSnackBar('Messages doc not found for broadcast', 'OK', 3000);
          continue;
        }

        const msgDocRef = snap.docs[0].ref;

        const followupEntry: Record<string, any> = archiveid
          ? (medium === 'wati'
              ? { wati_archiveid: doc(this.firestore, 'wati archive', archiveid) }
              : { email_archiveid: doc(this.firestore, 'email archive', archiveid) })
          : {};

      await updateDoc(msgDocRef, {
        'follow_up': arrayUnion(...profileIds),
        ...(archiveid ? { followup_medium: arrayUnion(followupEntry as any) } : {}),
      });

        console.log(`channel: ${channelId}, messageid: ${messagesDocId}, medium: ${medium}`);
        await this.refreshFollowUpStatusForRows(rows, channelId, notifDocId);

      } catch (err) {
        console.error('Error writing follow-up record:', err);
        this.guard.openSnackBar('Error saving follow-up record', 'OK', 3000);
      }
    }

    this.failureTableSource.data.forEach(r => r.selected = false);
    this.selectedFailureProfileIds.clear();
  }

  private async fetchFollowUpSentStatus(channelId: string, messagesDocId: string): Promise<boolean> {
    if (!channelId || !messagesDocId) return false;
    try {
      const messagesRef = collection(this.firestore, 'supportchat', channelId, 'messages');
      const q = query(messagesRef, where('messageid', '==', messagesDocId));
      const snap = await getDocs(q);
      if (snap.empty) return false;

      const followupMedium: any[] = snap.docs[0].data()['followup_medium'] || [];
      if (!followupMedium.length) return false;

      // Check each entry by reading the actual archive document
      const checks = await Promise.all(followupMedium.map(async (entry: any) => {
        const archiveId = entry?.wati_archiveid || entry?.email_archiveid || null;
        const collection_name = entry?.wati_archiveid ? 'wati archive' : 'email archive';
        if (!archiveId) return false;
        try {
          const archiveSnap = await getDoc(doc(this.firestore, collection_name, archiveId));
          if (!archiveSnap.exists()) return false;
          const data = archiveSnap.data();
          return data?.['status'] === 'sent' && !!data?.['sentAt'];
        } catch {
          return false;
        }
      }));

      return checks.some(Boolean);
    } catch (err) {
      console.error('Error fetching followup_sent:', err);
      return false;
    }
  }

  private async fetchFollowUpSet(channelId: string, messagesDocId: string): Promise<Set<string>> {
    const result = new Set<string>();
    if (!channelId || !messagesDocId) return result;

    try {
      const messagesRef = collection(this.firestore, 'supportchat', channelId, 'messages');
      const q = query(messagesRef, where('messageid', '==', messagesDocId));
      const snap = await getDocs(q);

      snap.docs.forEach(d => {
        const followUp: string[] = d.data()['follow_up'] || [];
        followUp.forEach(pid => result.add(pid));
      });
    } catch (err) {
      console.error('Error fetching follow_up for channel', channelId, err);
    }

    return result;
  }

  async sendFailureFollowUpWhatsApp(): Promise<void> {
    const selected = this.getSelectedFailureRows();
    if (selected.length === 0) { alert('Please select at least one Participant'); return; }

    const selectedProfiles = selected
      .map(r => {
        const pd = this.mapProfiledata[r.profileId];
        if (!pd) return null;
        return {
          ...pd,
          profileid: r.profileId,
          name:      pd.name        || this.mapProfile[r.profileId] || r.name || '',
          email:     pd.email       || '',
          number:    pd.number      || pd.phonenumber || pd.phone   || '',
        };
      })
      .filter(p => p != null);

    if (selectedProfiles.length === 0) {
      alert('No profile data found for selected Participants');
      return;
    }

    const dialogRef = this.dialog.open(WatiInputComponent, {
      data: { profiles: selectedProfiles, filterTemplateName: 'evol_4' },
      width: '70vw',
      height: '80vh',
      disableClose: true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        if (result === 'success' || result?.status === 'success') {
          const archiveid = result?.archiveid ?? null;   // ← extract here
          this.guard.openSnackBar('Wati Message Sent Successfully', 'OK', 3000);
          await this.writeFollowUpRecord(selected, 'wati', archiveid);  // ← pass it
        } else if (result === 'failed') {
          this.guard.openSnackBar('Sending Wati Message Failed', 'OK', 3000);
        }
      }
    });
  }

  get needsFollowUpCount(): number {
    return this.allFailureRows.filter(
      r => r.followUpStatus === 'Needs follow-up'
    ).length;
  }

  private async fetchReadBySet(channelId: string, messagesDocId: string): Promise<Set<string>> {
    const result = new Set<string>();
    if (!channelId || !messagesDocId) return result;
 
    try {
      const messagesRef = collection(this.firestore, 'supportchat', channelId, 'messages');
      const q = query(messagesRef, where('messageid', '==', messagesDocId));
      const snap = await getDocs(q);
 
      snap.docs.forEach(d => {
        const readBy: string[] = d.data()['read_by'] || [];
        readBy.forEach(pid => result.add(pid));
      });
    } catch (err) {
      console.error('Error fetching read_by for channel', channelId, err);
    }
 
    return result;
  }
 
  private computeFollowUpCounts(rows: any[], notifications: any[]): void {
    this.resolvedCount   = rows.filter(r => r.followUpStatus === 'Resolved').length;
    this.watchingCount   = rows.filter(r => r.followUpStatus === 'Watching').length;
    this.noResponseCount = rows.filter(r => r.followUpStatus === 'No response').length;

    this.totalFollowUpSent = rows.filter(r =>
      r.followUpStatus === 'Resolved' ||
      r.followUpStatus === 'Watching' ||
      r.followUpStatus === 'No response'
    ).length;
      this.totalFailedParticipants = rows.length;
      this.totalFailedBroadcasts = new Set(rows.map(r => r.notifDocId)).size;

      const appNotLinked = rows.filter(r => r.failureReason === 'App not linked').length;

      this.failureTabs = [
        { key: 'all',           label: 'All failures',   count: rows.length        },
        { key: 'watching',      label: 'Watching',        count: this.watchingCount },
        { key: 'noResponse',    label: 'No response',     count: this.noResponseCount },
        { key: 'appNotLinked',  label: 'App not linked',  count: appNotLinked       },
      ];
    }

  openFailuresDialog(): void {
    this.showFailuresDialog = true;
    this.setFailureTab('all');
  }
 
  closeFailuresDialog(): void {
    this.showFailuresDialog = false;
  }
 
  setFailureTab(key: string): void {
  this.activeFailureTab = key;
  let filtered = [...this.allFailureRows];

  switch (key) {
    case 'watching':      filtered = filtered.filter(r => r.followUpStatus === 'Watching');        break;
    case 'noResponse':    filtered = filtered.filter(r => r.followUpStatus === 'No response');     break;
    case 'needsFollowUp': filtered = filtered.filter(r => r.followUpStatus === 'Needs follow-up'); break;
    case 'appNotLinked':  filtered = filtered.filter(r => r.failureReason  === 'App not linked');  break;
  }

  this.failureTableSource.data = filtered;
}
 
  getInitials(name: string): string {
    if (!name || name === 'Unknown') return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  }
 
  getAvatarColor(name: string): string {
    if (!name) return this.avatarColors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return this.avatarColors[Math.abs(hash) % this.avatarColors.length];
  }


  getChannelName(element: any): string {
    const channelId = element?.metadata?.channelid || element?.channelid;
    if (channelId && this.channelMap[channelId]) {
      return this.channelMap[channelId];
    }
    return element.channelname || element.channel || '-';
  }

  getCategoryName(element: any): string {
    const categoryId = element?.metadata?.category || element?.categoryid || element?.category;
    if (categoryId && this.categoryMap[categoryId]) {
      return this.categoryMap[categoryId];
    }
    return element.notificationtype || element.category || '-';
  }

  // ── Default date range (last 7 days) ─────────────────────────────────────

  private setDefaultDates(): void {
    this.endDate = new Date();
    this.endDate.setHours(23, 59, 59, 999);

    this.startDate = new Date();
    this.startDate.setDate(this.startDate.getDate() - 7);
    this.startDate.setHours(0, 0, 0, 0);
  }

  // ── Data fetching ─────────────────────────────────────────────────────────

  fetchData(): void {
    if (!this.startDate || !this.endDate) return;

    this.notificationSubscription?.unsubscribe();

    const recordQuery = query(
      collection(this.firestore, 'notificationrecord'),
      where('date', '>=', this.startDate),
      where('date', '<=', this.endDate),
      where('notificationtype', '==', 'channel'),
      orderBy('date', 'desc')
    );

    this.notificationSubscription = collectionData(recordQuery, { idField: 'id' })
      .subscribe((list: any[]) => {
        list.forEach(element => {
          element['docid'] = element.id;
          element['receivedRate'] = (element['profileid']?.length > 0)
            ? +((element['profilesuccess']?.length || 0) / element['profileid'].length * 100).toFixed(2)
            : 0;
        });

        this.allNotifications = list;
        this.extractFilterOptions(list);
        this.notificationDataSource.data = list;
        this.notificationDataSource.sort = this.sort;
        this.notificationDataSource.paginator = this.paginator;
        this.updateStatistics(list);
        this.buildFailureRows(list);
        this.notificationClickButton(list);
      });
  }

  private async notificationClickButton(notifications: any[]): Promise<void> {
  await Promise.all(notifications.map(async notif => {
    const channelId  = notif?.metadata?.channelid || notif?.channelid || '';
    const messagesId = notif?.metadata?.messageid || '';
    if (!channelId || !messagesId) return;

    const { buttons, button_clicks } = await this.fetchButtonClicksData(channelId, messagesId);
    notif['_buttons']       = buttons;
    notif['_button_clicks'] = button_clicks;
  }));

  this.notificationDataSource.data = [...this.allNotifications];
}

getTotalButtonClicks(element: any): number {
  const button_clicks: { [label: string]: string[] } = element['_button_clicks'] || {};
  const allIds = new Set<string>();
  Object.values(button_clicks).forEach(ids => ids.forEach(id => allIds.add(id)));
  return allIds.size;
}

hasButtons(element: any): boolean {
  return (element['_buttons']?.length || 0) > 0;
}

openButtonClicksDialog(element: any, event: Event): void {
  event.stopPropagation();
  const buttons: { label: string; url: string }[]      = element['_buttons']       || [];
  const button_clicks: { [label: string]: string[] }   = element['_button_clicks'] || {};

  this.currentButtonClicksTitle = element.title || this.getChannelName(element);
  this.currentButtonClicks = buttons.map(btn => ({
    label:    btn.label,
    url:      btn.url,
    clickers: (button_clicks[btn.label] || []).map(profileId => ({
      profileId,
      name: this.mapProfile[profileId] || 'Unknown',
    })),
  }));

  this.buttonClicksDialogOpen = true;
}

closeButtonClicksDialog(): void {
  this.buttonClicksDialogOpen = false;
}

  onDateChange(): void {
    this.fetchData();
  }

  // ── Filter options extraction ─────────────────────────────────────────────
  // Channel options come from fetchChannelMap (supportchat collection).
  // Category options come from fetchCategories (classify/channelcategories).
  // Nothing to extract from the data list.
  private extractFilterOptions(_list: any[]): void {}

  // ── Profile autocomplete ──────────────────────────────────────────────────

  private buildProfileOptions(): void {
    this.profileOptions = Object.keys(this.mapProfiledata).map(id => {
      const p = this.mapProfiledata[id];
      return {
        id,
        name: p?.name || this.mapProfile[id] || id,
        email: p?.email || ''
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    this.filteredProfileOptions = [...this.profileOptions];
  }

  onProfileSearchChange(): void {
    const term = this.profileSearchText.toLowerCase().trim();
    this.filteredProfileOptions = this.profileOptions.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.email.toLowerCase().includes(term)
    );
  }

  onProfileSelected(event: MatAutocompleteSelectedEvent): void {
    const selected = this.profileOptions.find(p => p.name === event.option.value);
    if (selected) {
      this.selectedProfileId = selected.id;
      this.profileSearchText = selected.name;
    }
    this.customFilter();
  }

  // ── Filter predicate & application ───────────────────────────────────────

  private setupFilterPredicate(): void {
    this.notificationDataSource.filterPredicate = (data: any, filter: string): boolean => {
      if (!filter || filter.trim() === '') return true;

      let filterObj: any;
      try {
        filterObj = JSON.parse(filter);
      } catch {
        return true;
      }

      // ── Text search across title, message body, channel name, category name ──
      const searchTerm = filterObj.searchText?.toLowerCase() || '';
      const channelDisplayName = this.getChannelName(data).toLowerCase();
      const categoryDisplayName = this.getCategoryName(data).toLowerCase();
      const messageText = (
        data['metadata']?.htmlbody ||
        data['metadata']?.textbody ||
        data['textbody'] ||
        data['message'] || ''
      ).toLowerCase();

      const searchMatch = !searchTerm || (
        data['title']?.toLowerCase().includes(searchTerm) ||
        messageText.includes(searchTerm) ||
        channelDisplayName.includes(searchTerm) ||
        categoryDisplayName.includes(searchTerm)
      );

      // ── Category filter — match metadata.category ID exactly ──────────────
      const recordCategoryId = data?.metadata?.category || data?.categoryid || data?.category || '';
      const categoryMatch = !filterObj.categoryId ||
        recordCategoryId === filterObj.categoryId;

      // ── Channel filter — match metadata.channelid ID exactly ──────────────
      const recordChannelId = data?.metadata?.channelid || data?.channelid || '';
      const channelMatch = !filterObj.channelId ||
        recordChannelId === filterObj.channelId;

      // ── Profile filter ────────────────────────────────────────────────────
      const profileMatch = !filterObj.profileId ||
        (Array.isArray(data['profileid']) && data['profileid'].includes(filterObj.profileId));

      // All active filters must match (AND logic)
      return searchMatch && categoryMatch && channelMatch && profileMatch;
    };
  }

  customFilter(): void {
    const filterValue = JSON.stringify({
      searchText: this.searchText || '',
      categoryId: this.selectedCategory || '',   // holds category ID
      channelId: this.selectedChannel || '',     // holds channel ID
      profileId: this.selectedProfileId || ''
    });

    this.notificationDataSource.filter = filterValue.trim();
    this.updateStatistics(this.notificationDataSource.filteredData);
  }

  onSearchChange(): void { this.customFilter(); }
  onFilterChange(): void { this.customFilter(); }

  clearFilters(): void {
    this.searchText = '';
    this.selectedCategory = '';
    this.selectedChannel = '';
    this.selectedProfileId = null;
    this.profileSearchText = '';
    this.filteredProfileOptions = [...this.profileOptions];
    this.notificationDataSource.filter = '';
    this.updateStatistics(this.allNotifications);
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  updateStatistics(data: any[]): void {
    this.totalNotifications = data.length;

    const today = new Date().toDateString();
    this.newlyNotifications = data.filter(item =>
      new Date(item.date.toDate()).toDateString() === today
    );

    const totalProfileIds = data.reduce((t, n) => t + (n?.profileid?.length || 0), 0);
    const totalNewly = this.newlyNotifications.reduce((t, n) => t + (n?.profileid?.length || 0), 0);

    const successTotal = data.reduce((t, n) => t + (n?.profilesuccess?.length || 0), 0);
    const successNewly = this.newlyNotifications.reduce((t, n) => t + (n?.profilesuccess?.length || 0), 0);

    this.failedNotifications = data.reduce((t, n) => t + (n?.profilefailed?.length || 0), 0);
    this.currentfailedRate = this.newlyNotifications.reduce((t, n) => t + (n?.profilefailed?.length || 0), 0);

    this.notificationSentRate = totalProfileIds > 0
      ? ((successTotal / totalProfileIds) * 100).toFixed(2)
      : '0';

    this.newlysentnotificationRate = totalNewly > 0
      ? ((successNewly / totalNewly) * 100).toFixed(2)
      : '0.00';
  }

  // ── Receiving-rate bar color ──────────────────────────────────────────────

  getReceivedRateColor(rate: number): string {
    if (rate >= 70) return '#4CAF50';
    if (rate >= 40) return '#FF9800';
    return '#F44336';
  }

  // ── Safe HTML for message body ────────────────────────────────────────────

  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  // ── Participants dialog ─────────────────────────────────────────────────────

  openParticipantDialog(notificationData: any): void {
  this.showParticipantsDialog = true;
  this.currentNotificationData = notificationData;
  this.currentChannelId   = notificationData?.metadata?.channelid || notificationData?.channelid || '';
  this.currentMessagesDocId = notificationData?.metadata?.messageid || '';
    this.selectedTab = 'success';
    this.successParticipants = [];
    this.failedParticipants = [];
    this.ParticipantSearchText = '';
    this.successPageIndex = 0;
    this.failedPageIndex = 0;
    this.logsLoadingCount = 0;
    this.logsCheckedCount = 0;
    this.totalParticipantsWithUserRef = 0;
    this.isLoadingAllLogs = false;

    // Build success Participants
    if (notificationData.profilesuccess?.length) {
      this.successParticipants = notificationData.profilesuccess.map((profileId: string) => {
        const userRef = this.mapProfiledata[profileId]?.user_ref ?? null;
        const hasUserRef = !!userRef;
        if (hasUserRef) this.totalParticipantsWithUserRef++;

        return {
          profileId,
          name: this.mapProfile[profileId] || 'Unknown',
          status: 'Success',
          reason: '-',
          appstatus: notificationData.appFCMSuccess?.includes(profileId) ? 'App: Sent' : null,
          webstatus: notificationData.webFCMSuccess?.includes(profileId) ? 'Web: Sent' : null,
          logCount: 0,
          hasLogs: false,
          hasUserRef,
          logsLoading: false,
          logsChecked: false,
          read: false,
          clicked: 'unknown'
        };
      });
    }
    this.filteredSuccessParticipants = [...this.successParticipants];

    // Build failed Participants
    if (notificationData.profilefailed?.length) {
      this.failedParticipants = notificationData.profilefailed.map((profileId: string) => {
        const userRef = this.mapProfiledata[profileId]?.user_ref ?? null;
        const hasUserRef = !!userRef;
        if (hasUserRef) this.totalParticipantsWithUserRef++;

        return {
          profileId,
          name: this.mapProfile[profileId] || 'Unknown',
          status: 'Failed',
          reason: notificationData.failedlist?.[profileId] || 'Unknown error',
          appstatus: notificationData.appFCMFailed?.includes(profileId) ? 'App: Failed' : null,
          webstatus: notificationData.webFCMFailed?.includes(profileId) ? 'Web: Failed' : null,
          logCount: 0,
          hasLogs: false,
          hasUserRef,
          logsLoading: false,
          logsChecked: false,
          read: false,
          clicked: 'unknown'
        };
      });
    }
    this.filteredFailedParticipants = [...this.failedParticipants];

    this.loadLogsForVisibleItems();
  }

  closeParticipantsDialog(): void {
    this.showParticipantsDialog = false;
  }

  // ── Log loading helpers ───────────────────────────────────────────────────

  get allLogsLoaded(): boolean {
    return this.totalParticipantsWithUserRef === 0 ||
      this.logsCheckedCount >= this.totalParticipantsWithUserRef;
  }

  get logsLoadingProgress(): number {
    if (this.totalParticipantsWithUserRef === 0) return 100;
    return Math.round((this.logsCheckedCount / this.totalParticipantsWithUserRef) * 100);
  }

  loadAllLogsForExport(): void {
    if (this.allLogsLoaded || this.isLoadingAllLogs) return;
    this.isLoadingAllLogs = true;

    [...this.successParticipants, ...this.failedParticipants].forEach(r => {
      if (!r.logsChecked && r.hasUserRef) {
        const type = this.successParticipants.includes(r) ? 'success' : 'failed';
        this.fetchParticipantLogs(r.profileId, this.currentNotificationData.docid, type);
      }
    });
  }

  private loadLogsForVisibleItems(): void {
    const list = this.selectedTab === 'success'
      ? this.filteredSuccessParticipants
      : this.filteredFailedParticipants;

    const pageIndex = this.selectedTab === 'success' ? this.successPageIndex : this.failedPageIndex;
    const start = pageIndex * this.pageSize;
    const visible = list.slice(start, start + this.pageSize);

    visible.forEach(r => {
      if (!r.logsChecked && r.hasUserRef) {
        this.fetchParticipantLogs(r.profileId, this.currentNotificationData.docid, this.selectedTab);
      }
    });
  }

  async fetchParticipantLogs(
    profileId: string,
    docId: string,
    type: 'success' | 'failed'
  ): Promise<void> {
    const userRef = this.mapProfiledata[profileId]?.user_ref;
    if (!userRef) return;

    const Participant = type === 'success'
      ? this.successParticipants.find(r => r.profileId === profileId)
      : this.failedParticipants.find(r => r.profileId === profileId);

    if (Participant?.logsChecked || Participant?.logsLoading) return;

    this.updateParticipantLogStatus(profileId, type, { logsLoading: true });
    this.logsLoadingCount++;

    const logsRef = collection(this.firestore, 'notifications', userRef.id, 'logs');
    const q = query(logsRef, where('recordid', '==', docId));

    try {
      const snap = await getDocs(q);
      const logCount = snap.size;
      const hasLogs = logCount > 0;

      let read = false;
      let clicked = 'unknown';

      if (this.currentChannelId && this.currentMessagesDocId) {
        const readBySet = await this.fetchReadBySet(this.currentChannelId, this.currentMessagesDocId);
        read = readBySet.has(profileId);
      }

      if (!snap.empty) {
        const logData = snap.docs[0].data();
        clicked = logData['clicked'] === true ? 'Yes' : 'unknown';
      }

      this.updateParticipantLogStatus(profileId, type, {
        logCount, hasLogs, logsLoading: false, logsChecked: true, read, clicked
      });
    } catch (err) {
      console.error('Error fetching channel logs:', err);
      this.updateParticipantLogStatus(profileId, type, { logsLoading: false, logsChecked: true });
    } finally {
      this.logsLoadingCount--;
      this.logsCheckedCount++;
      if (this.isLoadingAllLogs && this.allLogsLoaded) {
        this.isLoadingAllLogs = false;
      }
    }
  }

  private updateParticipantLogStatus(
    profileId: string,
    type: 'success' | 'failed',
    updates: Partial<any>
  ): void {
    if (type === 'success') {
      const idx = this.successParticipants.findIndex(r => r.profileId === profileId);
      if (idx > -1) {
        this.successParticipants[idx] = { ...this.successParticipants[idx], ...updates };
        this.filteredSuccessParticipants = [...this.successParticipants];
      }
    } else {
      const idx = this.failedParticipants.findIndex(r => r.profileId === profileId);
      if (idx > -1) {
        this.failedParticipants[idx] = { ...this.failedParticipants[idx], ...updates };
        this.filteredFailedParticipants = [...this.failedParticipants];
      }
    }
  }

  // ── Participant search & tabs ───────────────────────────────────────────────

  filterParticipants(): void {
    const term = this.ParticipantSearchText?.toLowerCase().trim() || '';

    if (!term) {
      this.filteredSuccessParticipants = [...this.successParticipants];
      this.filteredFailedParticipants = [...this.failedParticipants];
    } else {
      this.filteredSuccessParticipants = this.successParticipants.filter(r =>
        r.name?.toLowerCase().includes(term)
      );
      this.filteredFailedParticipants = this.failedParticipants.filter(r =>
        r.name?.toLowerCase().includes(term) || r.reason?.toLowerCase().includes(term)
      );
    }

    this.successPageIndex = 0;
    this.failedPageIndex = 0;
    this.loadLogsForVisibleItems();
  }

  switchTab(tab: 'success' | 'failed'): void {
    this.selectedTab = tab;
    this.ParticipantSearchText = '';
    this.filterParticipants();
    this.loadLogsForVisibleItems();
  }

  // ── Paginator handlers ────────────────────────────────────────────────────

  onSuccessPageChange(event: any): void {
    this.successPageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLogsForVisibleItems();
  }

  onFailedPageChange(event: any): void {
    this.failedPageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLogsForVisibleItems();
  }

  getPaginatedSuccessParticipants(): any[] {
    const start = this.successPageIndex * this.pageSize;
    return this.filteredSuccessParticipants.slice(start, start + this.pageSize);
  }

  getPaginatedFailedParticipants(): any[] {
    const start = this.failedPageIndex * this.pageSize;
    return this.filteredFailedParticipants.slice(start, start + this.pageSize);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportParticipantsToExcel(): void {
    if (!this.allLogsLoaded) return;
    this.isExporting = true;

    const rows = [
      ...this.successParticipants.map(r => ({
        Name: r.name || 'Unknown',
        Status: 'Success',
        Reason: '-',
        Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
        Read: r.read ? 'true' : 'false',
        Clicked: r.clicked,
        'Log Created': this.getLogStatusText(r)
      })),
      ...this.failedParticipants.map(r => ({
        Name: r.name || 'Unknown',
        Status: 'Failed',
        Reason: r.reason || 'Unknown error',
        Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
        Read: r.read ? 'true' : 'false',
        Clicked: r.clicked,
        'Log Created': this.getLogStatusText(r)
      }))
    ];

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 25 }, { wch: 10 }, { wch: 30 },
      { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 15 }
    ];

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');

    const title = this.currentNotificationData?.title || 'channel';
    const fileName = `channel_Participants_${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    this.isExporting = false;
  }

  getLogStatusText(Participant: any): string {
    if (!Participant.hasUserRef) return 'No User Ref';
    if (Participant.hasLogs) return `Yes (${Participant.logCount})`;
    return 'No';
  }
}