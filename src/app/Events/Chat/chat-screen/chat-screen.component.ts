import { Component, OnInit, ViewChild, ElementRef, ViewChildren, QueryList, Renderer2, ChangeDetectorRef, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { query, where, getDocs, collectionSnapshots, limit, orderBy, Firestore, collectionData, onSnapshot, deleteDoc, collection, doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, startAfter, getCountFromServer } from '@angular/fire/firestore';
import { CollectionReference, writeBatch } from 'firebase/firestore';
import { CreateGroupDialogComponent } from '../create-group-dialog/create-group-dialog.component';
import { Storage } from '@angular/fire/storage';
import { DomSanitizer } from '@angular/platform-browser';
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { FormBuilder, Validators } from "@angular/forms";
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { environment } from '../../../../environments/environment';
import { Observable, Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { LinebreaksPipe, LinkPipe, EnhancedMessagePipe } from "../../../custompipe.pipe";
import { AuthguardService } from '../../../authguard.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as XLSX from 'xlsx';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ChannelCommunicationComponent } from '../../../Channel Communication/channel-communication/channel-communication.component';

interface AttachedFile {
  filename: string;
  filetype: string;
  fileurl: string;
  mediatype: string;
  file: File;
}

interface MessageGroup {
  date: string;
  messages: any[];
}

@Component({
  selector: 'app-chat-screen',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatToolbarModule,
    MatMenuModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressSpinner,
    MatTabsModule,
    ReactiveFormsModule,
    LinebreaksPipe,
    LinkPipe,
    EnhancedMessagePipe,
    MatTooltipModule,
    MatFormFieldModule,
  ],
  templateUrl: './chat-screen.component.html',
  styleUrl: './chat-screen.component.css'
})
export class ChatScreenComponent implements OnInit, OnDestroy {

  adminRole: boolean = false;
  chatAdmin: boolean = false;
  chatlistloading: boolean = false;
  messagesLoading: boolean = false;
  uploadingFiles: boolean = false;

  showPinnedSection: boolean = false;
  pinnedMessagesCount: number = 0;
  maxPinnedDisplay: number = 20;

  currentuserData: any = {};
  selectedChat: any = {};
  mapProfileuid: any = {};
  mapRoles: any = {};
  subscription = {};

  // Active and Inactive chat lists
  activeChatList: any[] = [];
  inactiveChatList: any[] = [];
  filteredActiveChatList: any[] = [];
  filteredInactiveChatList: any[] = [];

  // Tab control - 0 = Active, 1 = Inactive
  selectedTabIndex: number = 0;

  messages: any[] = [];
  filteredMessages: any[] = [];
  groupedMessages: MessageGroup[] = [];
  profileList = [];
  userListId = [];

  showMentionsList: boolean = false;
  filteredMembers: any[] = [];
  mentionStartPosition: number = 0;

  newMessage: string = '';
  searchQuery: string = '';
  messageSearchQuery: string = '';
  showMessageSearch: boolean = false;

  // File attachment
  attachedFiles: AttachedFile[] = [];
  dragOver: boolean = false;

  // Message selection
  selectionMode: boolean = false;
  selectedMessages: Set<string> = new Set();

  // Double tap handling
  private tapTimeout: any = null;
  private lastTap: number = 0;

  // Read receipts
  showReadReceipts: boolean = false;
  selectedMessageForReceipts: any = null;

  supportchatCollection: CollectionReference;
  profiledataCollection: CollectionReference;
  messagesUnsubscribe: any;

  mentionMappings: Map<string, string> = new Map();

    // Channel participants panel
  showChannelParticipants: boolean = false;
  selectedMessageForParticipants: any = null;

  // Channel chat lists (mirror the group lists)
  activeChannelList: any[] = [];
  inactiveChannelList: any[] = [];
  filteredActiveChannelList: any[] = [];
  filteredInactiveChannelList: any[] = [];

  // Channel send dialog
showChannelSendDialog: boolean = false;
channelDialogParticipants: any[] = [];  
selectedChannelParticipantIds: Set<string> = new Set();
selectedChannelParticipantsList: any[] = []; 
selectedParticipantsModel: any[] = [];
participantTab: 'seen' | 'unseen' | 'sent' = 'sent';
allParticipants: any[] = [];
activeChannelTotalCount: number = 0;
csdOpen = false;
csdQuery = '';
csdOptions: any[] = [];

// pagination variables
  lastActiveChannelDoc: any = null;
  lastInactiveChannelDoc: any = null;
  hasMoreActiveChannels: boolean = false;
  hasMoreInactiveChannels: boolean = false;
  loadingMoreActiveChannels: boolean = false;
  loadingMoreInactiveChannels: boolean = false;
  private activeChannelPageSize = 10;
  firstMessageDoc: any = null;
  hasMoreMessages: boolean = false;
  loadingMoreMessages: boolean = false;
  private messagePageSize = 10;
  private inactiveChannelPageSize = 10;


  private destroy$ = new Subject<void>();

  @ViewChild('messageContainer') messageContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('previewContainer') previewContainer!: ElementRef;
  @ViewChild('messageSearchInput') messageSearchInput!: ElementRef;
  @ViewChild('channelImportInput') channelImportInput!: ElementRef;

  constructor(
    public formbuilder: FormBuilder,
    private renderer: Renderer2,
    private sanitizer: DomSanitizer,
    public snackBar: MatSnackBar,
    public guard: AuthguardService,
    public router: Router,
    public firestore: Firestore,
    public dialog: MatDialog,
    public http: HttpClient,
    private storage: Storage,
    private cdr: ChangeDetectorRef,
  ) {

    this.supportchatCollection = collection(this.firestore, 'supportchat');
    this.profiledataCollection = collection(this.firestore, 'profile_data');

    this.guard.getRoles().then(async (roles) => {
      var profileID = roles['profile_ref'].id
      this.chatAdmin = roles['chatxadmin'] ?? false
      this.adminRole = roles['admin'] ?? false;
      const userRef = doc(this.firestore, 'user_data', this.guard.uid);
      const profileDataSnap = await getDocs(query(collection(this.firestore, 'profile_data'), where('user_ref', '==', userRef)));
      if (!profileDataSnap.empty) {
        this.currentuserData = profileDataSnap.docs[0].data();
        this.currentuserData['uid'] = this.currentuserData['user_ref'].id || null;
        this.loadSupportChat();
      }

      //fetch profilelist and user list
      collectionSnapshots(query(this.profiledataCollection, orderBy('name', 'asc'))).pipe(takeUntil(this.destroy$)).subscribe((profileDoc) => {
        this.profileList = [];
        this.userListId = [];
        for (let i = 0; i < profileDoc.length; i++) {
          const element = profileDoc[i].data();
          this.profileList.push(profileDoc[i].id);
          if (element['user_ref'] != null || element['user_ref'] != undefined) {
            this.userListId.push(element['user_ref'].id);
            this.mapProfileuid[element['user_ref'].id] = element
          }
        }
      });

      //fetch userroles
      collectionData(query(collection(this.firestore, 'users_roles'), orderBy('name', 'asc'))).pipe(takeUntil(this.destroy$)).subscribe((user) => {
        this.mapRoles = {};
        for (let i = 0; i < user.length; i++) {
          const element = user[i];
          this.mapRoles[element['profile_ref'].id] = element;
        }
      });
    });
  }

  ngOnInit() {
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.messagesUnsubscribe) {
      this.messagesUnsubscribe();
    }
    if (this.tapTimeout) {
      clearTimeout(this.tapTimeout);
    }
  }

  /**
   * Returns true when the currently selected chat is in the Inactive tab
   * (isdelete === true). Used in the template to hide the message input.
   */
  get isInactiveChatSelected(): boolean {
    return !!this.selectedChat && this.selectedChat.isdelete === true;
  }

 loadSupportChat() {
  this.chatlistloading = true;

  const baseFilter = (this.chatAdmin || this.adminRole)
    ? []
    : [where('members', 'array-contains', this.currentuserData['user_ref'].id)];

  const getGroupQuery = (isdelete: boolean) =>
    query(
      this.supportchatCollection,
      ...baseFilter,
      where('type', '==', 'group'),
      where('isdelete', '==', isdelete)
    );

  collectionSnapshots(getGroupQuery(false)).pipe(takeUntil(this.destroy$)).subscribe({
    next: (snap) => { this.activeChatList = this.mapChatList(snap); this.applySearchFilter(); this.chatlistloading = false; },
    error: (e) => { console.error('active groups', e); this.chatlistloading = false; }
  });
  collectionSnapshots(getGroupQuery(true)).pipe(takeUntil(this.destroy$)).subscribe({
    next: (snap) => { this.inactiveChatList = this.mapChatList(snap); this.applySearchFilter(); },
    error: (e) => console.error('inactive groups', e)
  });

  this.loadInitialChannels(false, baseFilter);

  this.loadInitialChannels(true, baseFilter);
}

private async loadInitialChannels(isInactive: boolean, baseFilter: any[]) {
  const q = query(
    this.supportchatCollection,
    ...baseFilter,
    where('type', '==', 'channel'),
    where('isdelete', '==', isInactive),
    orderBy('last_modification', 'desc'),
    limit(this.activeChannelPageSize)
  );

  try {
    if (!isInactive) {
      const countQuery = query(
        this.supportchatCollection,
        ...baseFilter,
        where('type', '==', 'channel'),
        where('isdelete', '==', false)
      );
      const countSnap = await getCountFromServer(countQuery);
      this.activeChannelTotalCount = countSnap.data().count;
    }

    const snap = await getDocs(q);
    const list = this.mapChatList(snap.docs);
    if (isInactive) {
      this.inactiveChannelList = list;
      this.lastInactiveChannelDoc = snap.docs[snap.docs.length - 1] ?? null;
      this.hasMoreInactiveChannels = snap.docs.length === this.inactiveChannelPageSize;
    } else {
      this.activeChannelList = list;
      this.lastActiveChannelDoc = snap.docs[snap.docs.length - 1] ?? null;
      this.hasMoreActiveChannels = snap.docs.length === this.activeChannelPageSize;
    }
    this.applySearchFilter();
    this.chatlistloading = false;
  } catch (e) {
    console.error('load initial channels', e);
    this.chatlistloading = false;
  }
}

async loadMoreActiveChannels() {
  if (!this.hasMoreActiveChannels || this.loadingMoreActiveChannels || !this.lastActiveChannelDoc) return;
  this.loadingMoreActiveChannels = true;

  const baseFilter = (this.chatAdmin || this.adminRole)
    ? []
    : [where('members', 'array-contains', this.currentuserData['user_ref'].id)];

  const q = query(
    this.supportchatCollection,
    ...baseFilter,
    where('type', '==', 'channel'),
    where('isdelete', '==', false),
    orderBy('last_modification', 'desc'),
    startAfter(this.lastActiveChannelDoc),
    limit(this.activeChannelPageSize)
  );

  try {
    const snap = await getDocs(q);
    const newList = this.mapChatList(snap.docs);
    this.activeChannelList = [...this.activeChannelList, ...newList];
    this.lastActiveChannelDoc = snap.docs[snap.docs.length - 1] ?? this.lastActiveChannelDoc;
    this.hasMoreActiveChannels = snap.docs.length === this.activeChannelPageSize;
    this.applySearchFilter();
  } catch (e) {
    console.error('load more active channels', e);
  } finally {
    this.loadingMoreActiveChannels = false;
  }
}

async loadMoreInactiveChannels() {
  if (!this.hasMoreInactiveChannels || this.loadingMoreInactiveChannels || !this.lastInactiveChannelDoc) return;
  this.loadingMoreInactiveChannels = true;

  const baseFilter = (this.chatAdmin || this.adminRole)
    ? []
    : [where('members', 'array-contains', this.currentuserData['user_ref'].id)];

  const q = query(
    this.supportchatCollection,
    ...baseFilter,
    where('type', '==', 'channel'),
    where('isdelete', '==', true),
    orderBy('last_modification', 'desc'),
    startAfter(this.lastInactiveChannelDoc),
    limit(this.inactiveChannelPageSize)
  );

  try {
    const snap = await getDocs(q);
    const newList = this.mapChatList(snap.docs);
    this.inactiveChannelList = [...this.inactiveChannelList, ...newList];
    this.lastInactiveChannelDoc = snap.docs[snap.docs.length - 1] ?? this.lastInactiveChannelDoc;
    this.hasMoreInactiveChannels = snap.docs.length === this.inactiveChannelPageSize;
    this.applySearchFilter();
  } catch (e) {
    console.error('load more inactive channels', e);
  } finally {
    this.loadingMoreInactiveChannels = false;
  }
}

getParticipantTriggerText(): string {
  const list = this.selectedChannelParticipantsList;
  if (!list || list.length === 0) return 'Filter Participants';
  if (list.length === 1) return list[0]?.name || '';
  if (list.length === 2) return `${list[0]?.name}, ${list[1]?.name}`;
  return `${list[0]?.name}, ${list[1]?.name} +${list.length - 2} more`;
}

filterCsdOptions() {
  const q = this.csdQuery.trim().toLowerCase();
  this.csdOptions = q
    ? this.allParticipants.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q))
    : [...this.allParticipants];
}

openCsd() {
  this.csdOpen = true;
  this.csdQuery = '';
  this.csdOptions = [...this.allParticipants];
  setTimeout(() => {
    const el = document.querySelector('.csd-search-input') as HTMLInputElement;
    if (el) el.focus();
  }, 50);
}

closeCsd() {
  this.csdOpen = false;
  this.csdQuery = '';
}

getChannelFileIcon(nameOrUrl: string): string {
  if (!nameOrUrl) return 'attach_file';
  const lower = nameOrUrl.toLowerCase();
  if (lower.includes('.pdf'))  return 'picture_as_pdf';
  if (lower.match(/\.(doc|docx)/)) return 'description';
  if (lower.match(/\.(xls|xlsx)/)) return 'table_chart';
  if (lower.match(/\.(ppt|pptx)/)) return 'slideshow';
  if (lower.match(/\.(mp4|mov|avi|webm)/)) return 'videocam';
  if (lower.match(/\.(mp3|wav|ogg)/)) return 'audiotrack';
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)/)) return 'image';
  if (lower.match(/\.(zip|rar|7z)/)) return 'archive';
  return 'attach_file';
}

getChannelFileExt(filename: string): string {
  if (!filename) return 'FILE';
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
}

openChannelFile(file: any) {
  const url = file.url || file.fileurl;
  if (url) window.open(url, '_blank');
}

openChannelSendDialog() {
  this.channelDialogParticipants = this.buildChannelParticipants();
  this.selectedChannelParticipantIds = new Set();
  this.selectedChannelParticipantsList = [];
  this.selectedParticipantsModel = [];
  this.selectedParticipantsModel = [];
  this.allParticipants = [...this.channelDialogParticipants];
  this.showChannelSendDialog = true;
  this.csdOpen = false;
  this.csdQuery = '';
  this.csdOptions = [...this.channelDialogParticipants];
}

closeChannelSendDialog() {
  this.showChannelSendDialog = false;
  this.csdOpen = false;
}
buildChannelParticipants(): any[] {
  const result: any[] = [];

  for (let i = 0; i < this.profileList.length; i++) {
    const profileDocId = this.profileList[i];
    const uid = this.userListId[i];
    const profile = uid ? this.mapProfileuid[uid] : null;

    if (profile?.name) {
      result.push({ ...profile, profileDocId });
    }
  }

  return result;
}

toggleChannelParticipant(participant: any) {
  const id = participant.profileDocId;
  if (this.selectedChannelParticipantIds.has(id)) {
    this.selectedChannelParticipantIds.delete(id);
    this.selectedChannelParticipantsList = this.selectedChannelParticipantsList.filter(p => p.profileDocId !== id);
    this.selectedParticipantsModel = this.selectedParticipantsModel.filter(p => p.profileDocId !== id);
    this.selectedParticipantsModel = [...this.selectedParticipantsModel];
  } else {
    this.selectedChannelParticipantIds.add(id);
    this.selectedChannelParticipantsList.push(participant);
    this.selectedParticipantsModel = [...this.selectedParticipantsModel, participant];
    this.selectedParticipantsModel = [...this.selectedParticipantsModel];
  }
}

// ── Import Excel ─────────────────────────────────────────────

handleChannelImportClick() {
  const sampleDownload = confirm('Download sample import Excel format?');
  if (sampleDownload) {
    const data = [
      { name: 'John Doe',    email: 'john@example.com' },
      { name: 'Jane Smith',  email: 'jane@example.com' },
    ];
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sample');
    XLSX.writeFile(wb, 'channel_participants_sample.xlsx');
    return;
  }
  this.channelImportInput.nativeElement.click();
}

onChannelImportChange(evt: Event) {
  const target = evt.target as HTMLInputElement;
  const file   = target.files?.[0];
  if (!file) return;

  const isExcel = /\.(xls|xlsx)$/i.test(file.name);
  if (!isExcel) {
    this.snackBar.open('Please upload an Excel file (.xls or .xlsx)', 'Close', { duration: 3000 });
    target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e: ProgressEvent<FileReader>) => {
    try {
      const ab  = e.target?.result as ArrayBuffer;
      const wb  = XLSX.read(ab, { type: 'array', cellDates: true });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      let matchedCount = 0;
      rows.forEach((row: any) => {
        const importName  = row['name']?.toString().trim().toLowerCase();
        const importEmail = row['email']?.toString().trim().toLowerCase();

        const match = this.channelDialogParticipants.find(p =>
          (importEmail && p.email?.toLowerCase() === importEmail) ||
          (importName  && p.name?.toLowerCase()  === importName)
        );

        if (match && !this.selectedChannelParticipantIds.has(match.profileDocId)) {
          this.selectedChannelParticipantIds.add(match.profileDocId);
          this.selectedChannelParticipantsList.push(match);
          this.selectedParticipantsModel = [...this.selectedChannelParticipantsList];
          matchedCount++;
        }
      });

      this.snackBar.open(
        `Import complete: ${matchedCount} participant(s) matched`,
        'Close', { duration: 3000 }
      );
    } catch (err) {
      console.error('Import error', err);
      this.snackBar.open('Error reading file', 'Close', { duration: 3000 });
    }
  };
  target.value = '';
  reader.readAsArrayBuffer(file);
}

// ── Proceed to one-way communication ─────────────────────────
proceedChannelCommunication() {
  if (this.selectedChannelParticipantsList.length === 0) {
    this.snackBar.open('Please select at least one participant', 'Close', { duration: 2000 });
    return;
  }
  const selectedParticipantsModel = this.selectedChannelParticipantsList.map(p => ({
    profileid: p.profileDocId,
    name: p.name || '',
    email: p.email || '',
  }));
  this.dialog.open(ChannelCommunicationComponent, {
    data: selectedParticipantsModel,
    width: '860px',
    maxHeight: '90vh',
    panelClass: 'ow-dialog-panel'
  });
  this.closeChannelSendDialog(); 
}

  /**
   * Common mapping logic shared by active and inactive chat subscriptions.
   * Keeps the shape of each chat object identical to the original implementation.
   */
  private mapChatList(chat: any[]): any[] {
    var chatlist = [];
    for (let i = 0; i < chat.length; i++) {
      const element = chat[i].data();
      element['created'] = element['created_on']
      element['chatname'] = element['group_name']
      element['docref'] = chat[i].ref
      element['docid'] = chat[i].ref.id
      element['chattype'] = 'supportchat'
      element['chatprofile'] = element['group_profile']
      element['read_by'] = element['last_read_by']
      element['pending'] = [null, undefined].includes(element['last_pending']) ? [] : element['last_pending']
      element['senderuid'] = element['last_sender_uid']
      element['message'] = [null, undefined].includes(element['last_message']) ? "...." : element['last_message']
      element['files'] = [null, undefined].includes(element['files']) ? [] : element['files']
      element['time'] = element['last_modification']
      element['pinned'] = [null, undefined].includes(element['pinned']) ? false : element['pinned']

      // Check if current user has unread messages
      element['hasUnreadMessages'] = element['pending'].includes(this.currentuserData['uid']);

      chatlist.push(element);
    }
    // Sort: pinned first, then by last modification
    return chatlist.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const aTime = a.last_modification?.seconds ?? 0;
      const bTime = b.last_modification?.seconds ?? 0;
      return bTime - aTime;
    });
  }

  /**
   * Called whenever search input changes OR when chat lists update.
   * Filters both lists in parallel so that switching tabs is instant.
   */
  filterChats() {
    this.applySearchFilter();
  }

  private applySearchFilter() {
  const q = this.searchQuery.trim().toLowerCase();

  if (!q) {
    this.filteredActiveChatList    = [...this.activeChatList];
    this.filteredInactiveChatList  = [...this.inactiveChatList];
    this.filteredActiveChannelList   = [...this.activeChannelList];
    this.filteredInactiveChannelList = [...this.inactiveChannelList];
    return;
  }

  const matches = (chat: any) =>
    (chat.chatname && chat.chatname.toLowerCase().includes(q)) ||
    (chat.message  && chat.message.toLowerCase().includes(q));

  this.filteredActiveChatList    = this.activeChatList.filter(matches);
  this.filteredInactiveChatList  = this.inactiveChatList.filter(matches);
  this.filteredActiveChannelList   = this.activeChannelList.filter(matches);
  this.filteredInactiveChannelList = this.inactiveChannelList.filter(matches);
}

clearselectedParticipants() {
  this.selectedParticipantsModel = [];
  this.selectedParticipantsModel = [];
  this.selectedChannelParticipantIds = new Set();
  this.selectedChannelParticipantsList = [];
}

  /**
   * Tab change handler. When the user switches tabs we clear any
   * currently selected chat so the right pane reflects the active tab.
   */
  onTabChange(index: number) {
  this.selectedTabIndex = index;
    // Clear selection when switching tabs to avoid showing a chat from the other list
  this.selectedChat = {};
  this.unsubscribe();
  this.messages = [];
  this.filteredMessages = [];
  this.groupedMessages = [];
  this.exitSelectionMode();
  this.showMessageSearch = false;
  this.messageSearchQuery = '';
  this.showChannelParticipants = false;
  this.selectedMessageForParticipants = null;
}

  filterMessages() {
    if (!this.messageSearchQuery.trim()) {
      this.filteredMessages = [...this.messages];
    } else {
      this.filteredMessages = this.messages.filter(message =>
        message.originalmessage?.toLowerCase().includes(this.messageSearchQuery.toLowerCase()) ||
        message.message?.toLowerCase().includes(this.messageSearchQuery.toLowerCase())
      );
    }
    this.groupMessagesByDate();
  }

  toggleMessageSearch() {
    this.showMessageSearch = !this.showMessageSearch;
    if (this.showMessageSearch) {
      setTimeout(() => {
        if (this.messageSearchInput) {
          this.messageSearchInput.nativeElement.focus();
        }
      }, 100);
    } else {
      this.messageSearchQuery = '';
      this.filteredMessages = [...this.messages];
      this.groupMessagesByDate();
    }
  }

  unsubscribe() {
    for (const keys in this.subscription) {
      if (Object.prototype.hasOwnProperty.call(this.subscription, keys)) {
        const element = this.subscription[keys];
        if (![null, undefined].includes(element)) {
          element.unsubscribe();
        }
      }
    }
  }

  loadChats(selectedChat: any) {
    this.selectedChat = selectedChat;
    this.messagesLoading = true;
    this.messages = [];
    this.filteredMessages = [];
    this.exitSelectionMode();
    this.showMessageSearch = false;
    this.messageSearchQuery = '';

    // Subscribe to messages collection
    // Reset message pagination state
    this.firstMessageDoc = null;
    this.hasMoreMessages = false;
    this.loadingMoreMessages = false;

    if (selectedChat.type === 'channel') {
      // Channel: paginated, load 10 most recent
      this.loadInitialChannelMessages(selectedChat);
      return;
    }

    // Group: unchanged real-time subscription
    this.subscription['messages'] = collectionSnapshots(
      query(
        collection(this.supportchatCollection, selectedChat['docid'], 'messages'),
        orderBy('time', 'asc')
      )
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (chat) => {
        let messages = [];
        for (let i = 0; i < chat.length; i++) {
          const element = chat[i].data();

          element['docref'] = chat[i].ref;
          element['docid'] = element['messageid'];
          element['time'] = element['time'];
          element['senderuid'] = element['sender_uid'];
          element['files'] = element['files'] ?? [];

          const rawText = this.isChannelChat(element, selectedChat)
            ? (element['htmlbody'] ?? '')
            : (element['message'] ?? '');

          element['originalmessage'] = rawText;
          element['message'] = rawText === '' ? '' : rawText.replace(/\n/g, '<br>');

          element['chattype'] = 'groupchat';
          element['read_by'] = element['read_by'] ?? [];
          element['pending'] = element['pending'] ?? [];
          element['links'] = element['links'];
          element['type'] = element['type'];
          element['isMyMessage'] = this.isChannelChat(element, selectedChat) ? '' : element['sender_uid'] === this.currentuserData['uid'];

          messages.push(element);
        }
        this.messages = messages;
        this.filteredMessages = [...this.messages];
        this.groupMessagesByDate();
        this.messagesLoading = false;

        // Only mark messages as read if this is an ACTIVE chat.
        // Inactive (deleted) chats are read-only.
        if (!this.isInactiveChatSelected) {
          this.markMessagesAsRead(selectedChat);
        }

        // Scroll to bottom after messages load
        setTimeout(() => this.scrollToBottom(), 100);
      },
      error: (error) => {
        console.log("error while fetching messages", error);
        this.messagesLoading = false;
      }
    });
  }

  private async loadInitialChannelMessages(selectedChat: any) {
  this.messagesLoading = true;
  const msgCol = collection(this.supportchatCollection, selectedChat['docid'], 'messages');

  const q = query(
    msgCol,
    orderBy('time', 'desc'),
    limit(this.messagePageSize)
  );

  try {
    const snap = await getDocs(q);
    const reversed = [...snap.docs].reverse();
    this.firstMessageDoc = reversed[0] ?? null; 
    this.hasMoreMessages = snap.docs.length === this.messagePageSize;

    this.messages = reversed.map(d => this.mapMessageDoc(d, selectedChat));
    this.filteredMessages = [...this.messages];
    this.groupMessagesByDate();
    this.messagesLoading = false;

    if (!this.isInactiveChatSelected) {
      this.markMessagesAsRead(selectedChat);
    }
    setTimeout(() => this.scrollToBottom(), 100);
  } catch (e) {
    console.error('load initial channel messages', e);
    this.messagesLoading = false;
  }
}

async loadMoreChannelMessages() {
  if (!this.hasMoreMessages || this.loadingMoreMessages || !this.firstMessageDoc) return;
  this.loadingMoreMessages = true;

  const msgCol = collection(this.supportchatCollection, this.selectedChat['docid'], 'messages');

  const q = query(
    msgCol,
    orderBy('time', 'desc'),
    startAfter(this.firstMessageDoc),
    limit(this.messagePageSize)
  );

  try {
    const snap = await getDocs(q);
    const reversed = [...snap.docs].reverse();
    this.firstMessageDoc = reversed[0] ?? this.firstMessageDoc;
    this.hasMoreMessages = snap.docs.length === this.messagePageSize;

    const olderMessages = reversed.map(d => this.mapMessageDoc(d, this.selectedChat));
    this.messages = [...olderMessages, ...this.messages];
    this.filteredMessages = [...this.messages];
    this.groupMessagesByDate();
  } catch (e) {
    console.error('load more channel messages', e);
  } finally {
    this.loadingMoreMessages = false;
  }
}

private mapMessageDoc(docSnap: any, selectedChat: any): any {
  const element = docSnap.data();
  element['docref'] = docSnap.ref;
  element['docid'] = element['messageid'];
  element['time'] = element['time'];
  element['senderuid'] = element['sender_uid'];
  element['files'] = element['files'] ?? [];

  const rawText = this.isChannelChat(element, selectedChat)
    ? (element['htmlbody'] ?? '')
    : (element['message'] ?? '');

  element['originalmessage'] = rawText;
  element['message'] = rawText === '' ? '' : rawText.replace(/\n/g, '<br>');
  element['chattype'] = 'groupchat';
  element['read_by'] = element['read_by'] ?? [];
  element['pending'] = element['pending'] ?? [];
  element['links'] = element['links'];
  element['type'] = element['type'];
  element['isMyMessage'] = this.isChannelChat(element, selectedChat)
    ? ''
    : element['sender_uid'] === this.currentuserData['uid'];

  return element;
}

  isChannelChat(messageElement: any, chat: any): boolean {
  return chat?.type === 'channel';
}

getChannelReadByUsers(message: any): any[] {
  if (!message?.read_by) return [];
  return message.read_by
    .map((profileDocId: string) => this.getProfileByDocId(profileDocId))
    .filter((p: any) => !!p);
}

getChannelSentMessages(message: any): any[] {
  if (!message?.members) return [];
  return message.members
    .map((profileDocId: string) => this.getProfileByDocId(profileDocId))
    .filter((p: any) => !!p);
}

getChannelPendingUsers(message: any): any[] {
  if (!message?.pending) return [];
  console.log("pendingList",message.pending)
  return message.pending
    .map((profileDocId: string) => this.getProfileByDocId(profileDocId))
    .filter((p: any) => !!p);
}

getProfileByDocId(profileDocId: string): any {
  const byField = Object.values(this.mapProfileuid).find((p: any) =>
    p['profileid'] === profileDocId ||
    p['profile_id'] === profileDocId ||
    p['id'] === profileDocId
  );
  if (byField) return byField;

  const idx = this.profileList.indexOf(profileDocId);
  if (idx !== -1) {
    const uid = this.userListId[idx];
    return uid ? this.mapProfileuid[uid] : null;
  }
  return null;
}

getTotalParticipantsCount(message: any): number {
  if (!message) return 0;
  return (message?.read_by?.length ?? 0) + (message?.pending?.length ?? 0);
}

getReadCount(message: any): number {
  return message?.read_by?.length ?? 0;
}

  groupMessagesByDate() {
    const groups: MessageGroup[] = [];
    let currentDate = '';
    let currentGroup: MessageGroup | null = null;

    this.filteredMessages.forEach(message => {
      const messageDate = this.getDateString(message.time);

      if (messageDate !== currentDate) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          date: messageDate,
          messages: [message]
        };
        currentDate = messageDate;
      } else if (currentGroup) {
        currentGroup.messages.push(message);
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }

    this.groupedMessages = groups;
  }

  getDateString(timestamp: any): string {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (this.isSameDay(date, today)) {
      return 'Today';
    } else if (this.isSameDay(date, yesterday)) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear();
  }

  // Double tap message selection
  onMessageTap(message: any, event: Event) {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - this.lastTap;

    if (tapLength < 500 && tapLength > 0) {
      // Double tap detected
      event.preventDefault();
      this.handleDoubleTap(message);
    } else {
      // Single tap
      if (this.selectionMode) {
        this.toggleMessageSelection(message);
      }
    }

    this.lastTap = currentTime;
  }

  handleDoubleTap(message: any) {
    // Disable selection in inactive chats
    if (this.isInactiveChatSelected) return;
    if (!this.selectionMode) {
      this.enterSelectionMode();
    }
    this.toggleMessageSelection(message);
  }

  // Message selection methods
  enterSelectionMode() {
    if (this.isInactiveChatSelected) return;
    this.selectionMode = true;
    this.selectedMessages.clear();
  }

  exitSelectionMode() {
    this.selectionMode = false;
    this.selectedMessages.clear();
  }

  toggleMessageSelection(message: any) {
    if (this.selectedMessages.has(message.docid)) {
      this.selectedMessages.delete(message.docid);
    } else {
      this.selectedMessages.add(message.docid);
    }

    if (this.selectedMessages.size === 0) {
      this.exitSelectionMode();
    }
  }

  async deleteSelectedMessages() {
    if (this.selectedMessages.size === 0) return;
    if (this.isInactiveChatSelected) return;

    const batch = writeBatch(this.firestore);
    const messagesToDelete = Array.from(this.selectedMessages);

    messagesToDelete.forEach(messageId => {
      const messageRef = doc(this.supportchatCollection, this.selectedChat.docid, 'messages', messageId);
      batch.delete(messageRef);
    });

    try {
      await batch.commit();
      this.snackBar.open(`${messagesToDelete.length} messages deleted`, 'Close', { duration: 2000 });
      this.exitSelectionMode();
    } catch (error) {
      console.error('Error deleting messages:', error);
      this.snackBar.open('Error deleting messages', 'Close', { duration: 2000 });
    }
  }

  async deleteSingleMessage(message: any) {
    if (!message.isMyMessage) return;
    if (this.isInactiveChatSelected) return;

    try {
      await deleteDoc(doc(this.supportchatCollection, this.selectedChat.docid, 'messages', message.docid));
      this.snackBar.open('Message deleted', 'Close', { duration: 2000 });
    } catch (error) {
      console.error('Error deleting message:', error);
      this.snackBar.open('Error deleting message', 'Close', { duration: 2000 });
    }
  }

  async pinMessage(message: any) {
    if (this.isInactiveChatSelected) return;
    const pinnedValue = [null, undefined, "", false].includes(message.pinned) ? true : false;
    try {
      await updateDoc(doc(this.supportchatCollection, this.selectedChat.docid, 'messages', message.docid), {
        pinned: pinnedValue
      });
      this.snackBar.open(`Message ${pinnedValue ? 'Pinned' : 'UnPinned'}`, 'Close', { duration: 2000 });
    } catch (error) {
      console.error('Error deleting message:', error);
      this.snackBar.open('Error deleting message', 'Close', { duration: 2000 });
    }
  }

  copyMessage(message: any) {
    const textToCopy = message.originalmessage || message.message.replace(/<br>/g, '\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      this.snackBar.open('Message copied to clipboard', 'Close', { duration: 1500 });
    }).catch(() => {
      this.snackBar.open('Failed to copy message', 'Close', { duration: 1500 });
    });
  }

  // Read receipts
  showReadReceiptsModal(message: any) {
    this.selectedMessageForReceipts = message;
    this.showReadReceipts = true;
  }

  closeReadReceipts() {
    this.showReadReceipts = false;
    this.selectedMessageForReceipts = null;
  }

  getReadByUsers(message: any): any[] {
    if (!message.read_by || !this.selectedChat.members) return [];

    return this.selectedChat.members.filter((memberId: string) =>
      message.read_by.includes(memberId)
    );
  }

  getPendingUsers(message: any): any[] {
    if (!message.pending || !this.selectedChat.members) return [];

    return this.selectedChat.members.filter((memberId: string) =>
      message.pending.includes(memberId)
    );
  }

openChannelParticipants(message: any) {
  this.selectedMessageForParticipants = message;
  this.participantTab = 'sent';   // always default to Seen
  this.showChannelParticipants = true;
}

closeChannelParticipants() {
  this.showChannelParticipants = false;
  this.selectedMessageForParticipants = null;
}

get isChannelSelected(): boolean {
  return this.selectedChat?.type === 'channel';
}

  // File attachment methods
  onFileSelected(event: any) {
    const files = event.target.files;
    this.processFiles(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (this.isInactiveChatSelected) return;
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
    if (this.isInactiveChatSelected) return;
    const files = event.dataTransfer?.files;
    if (files) {
      this.processFiles(files);
    }
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 2000 })
  }

  processFiles(files: FileList) {
    Array.from(files).forEach(file => {
      if (this.isValidFileType(file)) {
        const attachedFile: AttachedFile = {
          filename: file.name,
          filetype: file.type,
          mediatype: file.type,
          fileurl: '',
          file: file
        };

        // Generate preview for images
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            attachedFile.fileurl = e.target?.result as string;
            this.cdr.detectChanges();
          };
          reader.readAsDataURL(file);
        }

        this.attachedFiles.push(attachedFile);
      } else {
        this.snackBar.open(`File type not supported: ${file.name}`, 'Close', { duration: 3000 });
      }
    });
  }

  togglePinnedSection(): void {
    this.showPinnedSection = !this.showPinnedSection;

    if (this.showPinnedSection) {
      this.updatePinnedMessagesCount();
    }
  }

  updatePinnedMessagesCount(): void {
    this.pinnedMessagesCount = this.getPinnedMessages().length;
  }

  getPinnedMessages(): any[] {
    if (!this.groupedMessages || this.groupedMessages.length === 0) {
      return [];
    }

    // Flatten all messages and filter pinned ones
    const pinnedMessages = this.groupedMessages
      .flatMap(group => group.messages)
      .filter(message => message.pinned === true)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()); // Newest first

    return pinnedMessages;
  }

  expandPinnedMessages(): void {
    this.maxPinnedDisplay = Math.min(this.maxPinnedDisplay + 6, this.getPinnedMessages().length);
  }

  jumpToMessage(message: any): void {
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${message.docid}"]`) as HTMLElement;
      if (messageElement) {
        // Scroll to message
        messageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

        // Add highlight effect
        messageElement.classList.add('highlight-message');
        setTimeout(() => {
          messageElement.classList.remove('highlight-message');
        }, 3000);
      }
    }, 100);
  }

  truncatePinnedMessage(message: string): string {
    if (!message) return '';

    const maxLength = 100; // Shorter for card display

    if (message.length <= maxLength) {
      return message;
    }

    // Truncate at word boundary
    const truncated = message.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    return (lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  getFileExtension(filename: string): string {
    if (!filename) return 'FILE';

    const parts = filename.split('.');
    if (parts.length < 2) return 'FILE';

    return parts[parts.length - 1].toUpperCase();
  }

  getImageFiles(files: any[]): any[] {
    if (!files || files.length === 0) return [];

    return files.filter(file =>
      file.filetype &&
      file.filetype.startsWith('image/') &&
      file.fileurl
    );
  }

  showAllImages(message: any): void {
    const imageFiles = this.getImageFiles(message.files);

    if (imageFiles.length > 0) {
      this.openImage(imageFiles[0]);
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Ctrl/Cmd + Shift + P to toggle pinned section
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
      event.preventDefault();
      this.togglePinnedSection();
    }
  }

  isValidFileType(file: File): boolean {
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documents
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
      // Audio
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
      // Video
      'video/mp4', 'video/webm', 'video/ogg',
      // Archives
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
    ];

    return allowedTypes.includes(file.type) || file.size <= 10 * 1024 * 1024; // 10MB limit
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  removeAttachedFile(index: number) {
    this.attachedFiles.splice(index, 1);
  }

  getFileIcon(fileType: string): string {
    if (fileType.startsWith('image/')) return 'image';
    if (fileType.startsWith('audio/')) return 'audiotrack';
    if (fileType.startsWith('video/')) return 'videocam';
    if (fileType.includes('pdf')) return 'picture_as_pdf';
    if (fileType.includes('word') || fileType.includes('document')) return 'description';
    if (fileType.includes('sheet') || fileType.includes('excel')) return 'table_chart';
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'slideshow';
    if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('7z')) return 'archive';
    return 'attach_file';
  }

  async uploadFiles(): Promise<any[]> {
    if (this.attachedFiles.length === 0) return [];

    this.uploadingFiles = true;
    const uploadedFiles = [];

    try {
      for (const attachedFile of this.attachedFiles) {
        const fileName = `${Date.now()}_${attachedFile.filename}`;
        const storageRef = ref(this.storage, `chat-files/${this.selectedChat.docid}/${fileName}`);

        const snapshot = await uploadBytes(storageRef, attachedFile.file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        uploadedFiles.push({
          filename: attachedFile.filename,
          filetype: attachedFile.filetype,
          fileurl: downloadURL,
          mediatype: attachedFile.filetype,
        });
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      this.snackBar.open('Error uploading files', 'Close', { duration: 2000 });
    } finally {
      this.uploadingFiles = false;
    }

    return uploadedFiles;
  }

  async markMessagesAsRead(chat: any) {
    try {
      // Remove current user from pending array
      await updateDoc(chat.docref, {
        last_pending: arrayRemove(this.currentuserData['uid'])
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  async togglePinChat(event: Event, chat: any) {
    event.stopPropagation(); // Prevent chat selection when clicking pin

    try {
      const newPinnedState = !chat.pinned;
      await updateDoc(chat.docref, {
        pinned: newPinnedState
      });

      this.snackBar.open(
        newPinnedState ? 'Chat pinned successfully' : 'Chat unpinned successfully',
        'Close',
        { duration: 2000 }
      );
    } catch (error) {
      console.error('Error toggling pin:', error);
      this.snackBar.open('Error updating pin status', 'Close', { duration: 2000 });
    }
  }

  selectChat(chat: any) {
    this.unsubscribe();
    this.loadChats(chat);
    this.localstorageMessage(chat.docid);
  }

  /**
   * Restore an inactive group back to active by setting isdelete = false.
   */
  async restoreGroup(event: Event, chat: any) {
    event.stopPropagation();
    if (!confirm("Restore this group back to Active?")) return;

    try {
      await updateDoc(doc(this.firestore, 'supportchat', chat.docid), {
        isdelete: false
      });
      this.snackBar.open('Group restored to Active', 'Close', { duration: 2000 });

      // If the restored chat is currently selected, clear it (it will reappear in Active tab)
      if (this.selectedChat?.docid === chat.docid) {
        this.selectedChat = {};
        this.unsubscribe();
        this.messages = [];
        this.filteredMessages = [];
        this.groupedMessages = [];
      }
    } catch (error) {
      console.error('Error restoring group:', error);
      this.snackBar.open('Error restoring group', 'Close', { duration: 2000 });
    }
  }

  async sendMessage() {
    // Block sending in inactive chats
    if (this.isInactiveChatSelected) {
      this.snackBar.open('This group is inactive. Sending messages is disabled.', 'Close', { duration: 2000 });
      return;
    }
    if ((!this.newMessage.trim() && this.attachedFiles.length === 0) || !this.selectedChat.docid) return;

    try {
      const messageId = doc(collection(this.firestore, 'temp')).id;
      const messagesCollection = collection(this.supportchatCollection, this.selectedChat.docid, 'messages');

      // Upload files if any
      const uploadedFiles = await this.uploadFiles();
      const { processedMessage, mentionedUsers } = this.processMentions(this.newMessage);

      console.log('Original message:', this.newMessage);
      console.log('Processed message (stored in DB):', processedMessage);
      console.log('Mentioned users:', mentionedUsers);

      const messageData = {
        messageid: messageId,
        message: processedMessage,
        sender_uid: this.currentuserData['uid'],
        time: serverTimestamp(),
        type: uploadedFiles.length > 0 ? 'media' : 'text',
        files: uploadedFiles,
        links: [],
        read_by: [this.currentuserData['uid']],
        pending: this.selectedChat.members.filter((uid: string) => uid !== this.currentuserData['uid']),
        mentions: mentionedUsers,
      };

      // Add message to subcollection
      await setDoc(doc(messagesCollection, messageId), messageData);

      const lastMessage = this.newMessage.trim() || (uploadedFiles.length > 0 ? '📎 Attachment' : '');
      await updateDoc(this.selectedChat.docref, {
        last_message: lastMessage,
        last_sender_uid: this.currentuserData['uid'],
        last_modification: serverTimestamp(),
        last_pending: this.selectedChat.members.filter((uid: string) => uid !== this.currentuserData['uid'])
      });

      this.newMessage = '';
      this.mentionMappings.clear();
      this.attachedFiles = [];
      setTimeout(() => this.scrollToBottom(), 100);

    } catch (error) {
      console.error('Error sending message:', error);
      this.snackBar.open('Error sending message', 'Close', { duration: 2000 });
    }
  }

  async buildGroup(value: any, docID: string) {
    const membersList = value.members;
    if (membersList.length < 2) {
      alert("Unable To Create Group. Select at least 2 members to create a group");
      return;
    }
    let image: string | undefined;
    if (value['image'] && value['image'].length > 0) {
      for (let a = 0; a < value['image'].length; a++) {
        const imageFile = value['image'][a];
        const imagePath = "Chat/" + imageFile.name + imageFile.lastModified + imageFile.size;
        const imageRef = ref(this.storage, imagePath);
        await uploadBytes(imageRef, imageFile).then(async (uploaded) => {
          image = await getDownloadURL(uploaded.ref);
        });
      }
    } else {
      image = value.groupprofile;
    }
    if (!membersList.includes(this.currentuserData['user_ref'].id)) {
      membersList.push(this.currentuserData['user_ref'].id);
    }
    const chatDocRef = doc(this.firestore, "supportchat", docID);
    await setDoc(chatDocRef, {
      isdelete: false,
      type: "group",
      members: membersList,
      last_modification: serverTimestamp(),
      group_name: value.groupname,
      group_profile: image,
      created_on: serverTimestamp(),
      creator_uid: this.currentuserData['user_ref'].id,
      id: docID
    }, { merge: true }).then(() => {
      console.log('Group Successfully created');
      this.openSnackBar("Group Successfully created", "Ok");
    }).catch((error) => {
      console.log('Oops error while creating Group', error);
      this.openSnackBar("Oops Error while creating Group", "Ok");
    });
  }

  //edit group function
  editGroup(groupdata: any): void {
    var groupDialog = this.dialog.open(CreateGroupDialogComponent, {
      disableClose: true,
      height: '80vh',
      width: '70vw',
      data: {
        profilelist: this.profileList,
        userlist: this.userListId,
        groupData: groupdata,
        mapUser: this.mapProfileuid,
      }
    });

    groupDialog.afterClosed().toPromise().then(async (result) => {
      if (result != null) {
        console.log('Dialog result:', result);
        const docId = groupdata ? groupdata['docid'] : doc(collection(this.firestore, 'temp')).id;
        await this.buildGroup(result, docId);

        if (this.selectedChat && groupdata && this.selectedChat.docid === groupdata['docid']) {
          this.selectedChat.members = result.members;
          console.log('Updated selectedChat members:', this.selectedChat.members);
        }

        if (groupdata) {
          // Update the appropriate cached list (active in this case, since we don't edit inactive groups)
          const idx = this.activeChatList.findIndex(chat => chat.docid === groupdata['docid']);
          if (idx !== -1) {
            this.activeChatList[idx].members = result.members;
            this.applySearchFilter();
          }
        }
      }
    });
  }

  // Handle group icon click for editing
  onGroupIconClick(event: Event, groupdata: any): void {
    event.stopPropagation();

    // Don't allow editing for inactive groups
    if (groupdata.isdelete === true) {
      return;
    }

    if (!this.canEditGroup(groupdata)) {
      this.openSnackBar('You don\'t have permission to edit this group', 'OK');
      return;
    }

    this.editGroup(groupdata);
  }

  // Check if user can edit the group
  canEditGroup(groupdata: any): boolean {
    // Inactive groups cannot be edited
    if (groupdata.isdelete === true) {
      return false;
    }
    if (this.chatAdmin) {
      return true;
    }

    if (groupdata.creator_uid === this.currentuserData['uid']) {
      return true;
    }

    const currentUserProfile = this.mapProfileuid[this.currentuserData['uid']];
    if (currentUserProfile && currentUserProfile.profileid) {
      const userRole = this.mapRoles[currentUserProfile.profileid];
      if (userRole?.admin || userRole?.chatxadmin) {
        return true;
      }
    }

    return false;
  }

  scrollToBottom() {
    if (this.messageContainer) {
      const element = this.messageContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  formatChatTime(timestamp: any): string {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } else if (hours < 168) { // Less than a week
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  }

  truncateMessage(message: string, maxLength: number = 50): string {
    if (!message) return '';
    return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
  }

  openFileInput() {
    this.fileInput.nativeElement.click();
  }

  localstorageMessage(value: string) {
    localStorage.setItem('selectedChatId', value);
  }

  changechat(value: any) {
    console.log(value, "chatvaluee console");
    // Implementation for changing chat type if needed
  }

  trackByMessageId(index: number, message: any): string {
    return message.docid || index;
  }

  trackByGroupDate(index: number, group: MessageGroup): string {
    return group.date;
  }

  openImage(file: any) {
    window.open(file.fileurl, '_blank')
  }

  // Utility method to get message read status
  getMessageReadStatus(message: any): string {
    if (!message.read_by || !this.selectedChat.members) return '';

    const totalMembers = this.selectedChat.members.length;
    const readByCount = message.read_by.length;

    if (readByCount === totalMembers) {
      return 'Read by all';
    } else if (readByCount > 1) {
      return `Read by ${readByCount}/${totalMembers}`;
    } else {
      return 'Delivered';
    }
  }

  // Utility method to check if message has unread users
  hasUnreadUsers(message: any): boolean {
    return message.pending && message.pending.length > 0;
  }

  // Method to handle input changes and detect @ mentions
  onMessageInputChange(event: any) {
    const inputValue = event.target.value;
    const cursorPosition = event.target.selectionStart;
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    console.log('Input changed:', { inputValue, cursorPosition, textBeforeCursor, lastAtIndex });

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      if (charBeforeAt === ' ' || lastAtIndex === 0) {
        const mentionQuery = textBeforeCursor.substring(lastAtIndex + 1);
        if (!mentionQuery.includes(' ')) {
          this.mentionStartPosition = lastAtIndex;
          console.log('Showing mentions for query:', mentionQuery);
          this.filterMembers(mentionQuery);
          this.showMentionsList = true;
          return;
        }
      }
    }
    this.showMentionsList = false;
  }

  filterMembers(query: string) {
    if (!this.selectedChat.members) {
      this.filteredMembers = [];
      return;
    }

    const members = this.selectedChat.members
      .filter((memberId: string) => memberId !== this.currentuserData['uid'])
      .map((memberId: string) => this.mapProfileuid[memberId])
      .filter((profile: any) => profile && profile.name &&
        profile.name.toLowerCase().includes(query.toLowerCase())
      );

    this.filteredMembers = members;
    console.log('Filtered members:', this.filteredMembers);
  }

  selectMention(member: any) {
    const textarea = this.messageInput.nativeElement.querySelector('textarea');
    const currentValue = this.newMessage;

    const beforeAt = currentValue.substring(0, this.mentionStartPosition);
    const afterAt = currentValue.substring(this.mentionStartPosition + 1);

    const spaceIndex = afterAt.indexOf(' ');
    const afterMention = spaceIndex !== -1 ? afterAt.substring(spaceIndex) : '';

    // Get profile ID instead of user ID
    const profileId = member.profileid || member.profile_id; // Adjust based on your data structure

    this.newMessage = beforeAt + `@${member.name} ` + afterMention;
    this.showMentionsList = false;

    if (!this.mentionMappings) {
      this.mentionMappings = new Map();
    }
    this.mentionMappings.set(`@${member.name}`, profileId);

    setTimeout(() => {
      textarea.focus();
      const newPos = beforeAt.length + member.name.length + 2;
      textarea.setSelectionRange(newPos, newPos);
    }, 10);
  }

  processMentions(message: string): { processedMessage: string; mentionedUsers: string[] } {
    const mentionedUsers: string[] = [];
    let processedMessage = message;

    console.log('Processing message:', message);
    console.log('Available mappings:', Array.from(this.mentionMappings.entries()));

    // Process each mention mapping
    if (this.mentionMappings && this.mentionMappings.size > 0) {
      this.mentionMappings.forEach((profileId, mentionText) => {
        if (message.includes(mentionText)) {
          const escapedMentionText = mentionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          processedMessage = processedMessage.replace(new RegExp(escapedMentionText, 'g'), `@${profileId}`);
          if (!mentionedUsers.includes(profileId)) {
            mentionedUsers.push(profileId);
          }
        }
      });
    } else {
      console.log('No mappings available');
    }

    return { processedMessage, mentionedUsers };
  }

  onKeyPress(event: KeyboardEvent) {
    if (this.showMentionsList) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.showMentionsList = false;
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        if (this.filteredMembers.length > 0) {
          this.selectMention(this.filteredMembers[0]);
        }
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !this.showMentionsList) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  async hideGroup(chat) {
    if (confirm("Sure, Do you want to delete?")) {
      await updateDoc(doc(this.firestore, 'supportchat', chat.id), {
        isdelete: true
      });
    }
  }
}