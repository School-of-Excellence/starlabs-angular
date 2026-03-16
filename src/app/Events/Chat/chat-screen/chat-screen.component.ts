import { Component, OnInit, ViewChild, ElementRef, ViewChildren, QueryList, Renderer2, ChangeDetectorRef, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { query, where, getDocs, collectionSnapshots, limit, orderBy, Firestore, collectionData, onSnapshot, deleteDoc, collection, doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove } from '@angular/fire/firestore';
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
import { LinebreaksPipe, LinkPipe, EnhancedMessagePipe } from "../../../custompipe.pipe";
import { AuthguardService } from '../../../authguard.service';
import { MatTooltipModule } from '@angular/material/tooltip';

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
    ReactiveFormsModule,
    LinebreaksPipe,
    LinkPipe,
    EnhancedMessagePipe,
    MatTooltipModule
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

  supportchatList: any[] = [];
  filteredChatList: any[] = [];
  messages: any[] = [];
  filteredMessages: any[] = [];
  groupedMessages: MessageGroup[] = [];
  profileList =[];
  userListId=[];

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

  private destroy$ = new Subject<void>();

  @ViewChild('messageContainer') messageContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('previewContainer') previewContainer!: ElementRef;
  @ViewChild('messageSearchInput') messageSearchInput!: ElementRef;

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
      // if (roles.admin || roles.chatxadmin || roles.participant) {
        const userRef = doc(this.firestore, 'user_data', this.guard.uid);
        const profileDataSnap = await getDocs(query(collection(this.firestore, 'profile_data'), where('user_ref', '==', userRef)));
        if (!profileDataSnap.empty) {
          this.currentuserData = profileDataSnap.docs[0].data();
          this.currentuserData['uid'] = this.currentuserData['user_ref'].id || null;
          this.loadSupportChat();
        }

        //fetch profilelist and user list
        collectionSnapshots(query(this.profiledataCollection,orderBy('name','asc'))).pipe(takeUntil(this.destroy$)).subscribe((profileDoc)=>{
          this.profileList = [];
          this.userListId=[];
          for (let i = 0; i < profileDoc.length; i++) {
            const element = profileDoc[i].data();
            this.profileList.push(profileDoc[i].id);
            if(element['user_ref'] != null || element['user_ref'] != undefined){
              this.userListId.push(element['user_ref'].id);
              this.mapProfileuid[element['user_ref'].id] = element
            }
          }
        });

         //fetch userroles
        // this.firestore.collection('users_roles',ref=>ref.orderBy('name','asc')).snapshotChanges()
        collectionData(query(collection(this.firestore, 'users_roles'),orderBy('name', 'asc'))).pipe(takeUntil(this.destroy$)).subscribe((user)=>{
          this.mapRoles={};
          for (let i = 0; i < user.length; i++) {
            const element = user[i];
            this.mapRoles[element['profile_ref'].id] = element;
          }
        });

      // }
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

  loadSupportChat() {
    this.chatlistloading = true;
    let Query;
    if(this.chatAdmin == true || this.adminRole == true){
      Query = query(this.supportchatCollection, where('isdelete', '==', false), orderBy('last_modification', 'desc'))
    }else{
      Query = query(this.supportchatCollection, where('members', 'array-contains', this.currentuserData['user_ref'].id), where('isdelete', '==', false), orderBy('last_modification', 'desc'))
    }

    collectionSnapshots(Query).pipe(takeUntil(this.destroy$)).subscribe({
      next: (chat) => {
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
        // Sort by pinned first, then by last modification
        this.supportchatList = chatlist.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return b.last_modification.seconds - a.last_modification.seconds;
        });
        this.filteredChatList = [...this.supportchatList];
        this.chatlistloading = false;
      },
      error: (error) => {
        console.log("error while fetching supportchat", error);
        this.chatlistloading = false;
      }
    });
  }

  filterChats() {
    if (!this.searchQuery.trim()) {
      this.filteredChatList = [...this.supportchatList];
    } else {
      this.filteredChatList = this.supportchatList.filter(chat =>
        chat.chatname.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        chat.message.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
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

          element['docref'] = chat[i].ref
          element['docid'] = element['messageid']
          element['time'] = element['time']
          element['senderuid'] = element['sender_uid']
          element['files'] = element['files'] ?? []
          element['originalmessage'] = element['message']
          element['message'] = [null, undefined, ''].includes(element['message']) ? '' : element['message'].replace(/\n/g, '<br>')
          element['chattype'] = 'groupchat'
          element['read_by'] = element['read_by'] ?? []
          element['pending'] = element['pending'] ?? []
          element['links'] = element['links']
          element['type'] = element['type']
          element['isMyMessage'] = element['sender_uid'] === this.currentuserData['uid'];

          messages.push(element);
        }
        this.messages = messages;
        this.filteredMessages = [...this.messages];
        this.groupMessagesByDate();
        this.messagesLoading = false;
        
        // Mark messages as read
        this.markMessagesAsRead(selectedChat);
        
        // Scroll to bottom after messages load
        setTimeout(() => this.scrollToBottom(), 100);
      },
      error: (error) => {
        console.log("error while fetching messages", error);
        this.messagesLoading = false;
      }
    });
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
    if (!this.selectionMode) {
      this.enterSelectionMode();
    }
    this.toggleMessageSelection(message);
  }

  // Message selection methods
  enterSelectionMode() {
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

    try {
      await deleteDoc(doc(this.supportchatCollection, this.selectedChat.docid, 'messages', message.docid));
      this.snackBar.open('Message deleted', 'Close', { duration: 2000 });
    } catch (error) {
      console.error('Error deleting message:', error);
      this.snackBar.open('Error deleting message', 'Close', { duration: 2000 });
    }
  }

  async pinMessage(message: any) {
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

  // File attachment methods
  onFileSelected(event: any) {
    const files = event.target.files;
    this.processFiles(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
    const files = event.dataTransfer?.files;
    if (files) {
      this.processFiles(files);
    }
  }

  openSnackBar(message:string,action:string) {
    this.snackBar.open(message,action,{ duration: 2000})
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

  async sendMessage() {
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
  editGroup(groupdata: any): void{
    var groupDialog = this.dialog.open(CreateGroupDialogComponent,{
      disableClose:true,
      height:'80vh',
      width: '70vw',
      data:{
        profilelist : this.profileList,
        userlist : this.userListId,
        groupData : groupdata,
        mapUser : this.mapProfileuid,
      }
    });

    groupDialog.afterClosed().toPromise().then(async(result)=>{
      if(result != null){
        console.log('Dialog result:', result); 
        const docId = groupdata ? groupdata['docid'] : doc(collection(this.firestore, 'temp')).id;
        await this.buildGroup(result, docId);

        if (this.selectedChat && groupdata && this.selectedChat.docid === groupdata['docid']) {
          this.selectedChat.members = result.members;
          console.log('Updated selectedChat members:', this.selectedChat.members);
        }
        
        if (groupdata) {
          const chatIndex = this.supportchatList.findIndex(chat => chat.docid === groupdata['docid']);
          if (chatIndex !== -1) {
            this.supportchatList[chatIndex].members = result.members;
            this.filteredChatList = [...this.supportchatList];
          }
        }
      }
    });
  }

  // Handle group icon click for editing
  onGroupIconClick(event: Event, groupdata: any): void {
    event.stopPropagation(); 
    
    if (!this.canEditGroup(groupdata)) {
      this.openSnackBar('You don\'t have permission to edit this group', 'OK');
      return;
    }
    
    this.editGroup(groupdata);
  }

  // Check if user can edit the group
  canEditGroup(groupdata: any): boolean {
    if(this.chatAdmin){
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

  async hideGroup(chat){
    if(confirm("Sure, Do you want to delete?")){
      await updateDoc(doc(this.firestore, 'supportchat',chat.id),{
        isdelete : true
      });
    }
  }
}