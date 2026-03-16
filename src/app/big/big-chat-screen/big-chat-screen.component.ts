import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SafeUrl, DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { Subscription, Observable, of, finalize, map, catchError, forkJoin, takeUntil, Subject } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask, uploadBytesResumable } from '@angular/fire/storage';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-big-chat-screen',
  imports: [
    MatSidenavModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    MatIconModule
  ],
  templateUrl: './big-chat-screen.component.html',
  styleUrl: './big-chat-screen.component.css'
})
export class BigChatScreenComponent {
  assignmentDocId: string;
  mapProfile: { [key: string]: string } = {};
  assignmentData: any;
  chatExists: boolean = false;
  loading: boolean = true;
  participants: string[] = [];
  admins: string[] = [];
  selectedParticipant: string = null;
  newMessage: string = '';
  messages: any[] = [];
  @ViewChild('chatMessages') chatMessagesContainer: ElementRef;
  @ViewChild('sidenav') sidenav: MatSidenav;
  @ViewChild('messageInput') messageInput: ElementRef;
  loggedInProfileId:any = null
  isSending: boolean = false;
  messageReadStatus: { [key: string]: boolean } = {};
  unreadCounts: { [key: string]: number } = {};
  isLoadingMessages: boolean = false;
  groupedMessages: { date: Date, messages: any[] }[] = [];
  isGroupChat: boolean = false;
  bigAdminAccess: boolean = false;
  groupChatParticipants: string[] = [];
  assignemtnId : string;
  sender:string;
  profileid:any;
  assignmentprofileId:string;
  adminsParam: string[] = [];
  marathons: any[] = [];
  marathonmap = {}
  broadcastName: string = '';
  currentBroadcastId: string = null;
  currentBroadcastName: string = 'Broadcast';
  // multiple broadcast
  broadcasts: { id: string, name: string, participants: string[] }[] = [];
  private subscription = new Subject<void>();

  assignments: any[] = [];
  selectedMarathonId: string = '';
  selectedMarathonTitle: string = '';
  loadingAssignments: boolean = false;
  mentorRole: boolean = false;
  


  isSelectingParticipants: boolean = false;
  selectedParticipantIds: string[] = [];

  //chat attahcment
  selectedFiles: File[] = [];
  filePreviewUrls: { [key: string]: SafeUrl } = {};
  fileUploadProgress: { [key: string]: number } = {};
  uploadingAttachments: boolean = false;
  attachmentUrls: { url: string, type: string, name: string, size: number }[] = [];
  maxFileSize: number = 10 * 1024 * 1024; // 10MB limit

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    public authguard: AuthguardService,
    private router: Router,
    public snackbar: MatSnackBar,
    private sanitizer: DomSanitizer,
    private storage: Storage,
  ) {
    this.assignemtnId = this.route.snapshot.queryParams['assignemtnId'];
    this.profileid = this.route.snapshot.queryParams['profileId'];
    this.assignmentprofileId = this.route.snapshot.queryParams['assignmentprofileId'];
    this.adminsParam = this.route.snapshot.queryParams['admins'];
    this.loading = true;
    this.authguard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    });
    this.authguard.getRoles().then(async roles => {
      console.log(this.adminsParam,"consoling in get roles");
      this.loggedInProfileId = roles['profile_ref'].id;
      if (roles["mentor"]) {
        this.mentorRole = true;
      }
      this.adminsCheck(this.mentorRole)
      console.log(this.loggedInProfileId,"consoling profileid in get roles");
      // if(roles["mentor"] && this.adminsParam.includes(this.loggedInProfileId)) {
      //   // if (this.adminsParam.includes(this.loggedInProfileId)) {
      //     this.bigAdminAccess = true;
      //     this.sender = requestedSender; 
      //   // }
      // } else {
      //   this.bigAdminAccess = false;
      //   this.sender = 'participant';
      //   if (requestedSender === 'admin') {
      //     this.snackbar.open('You do not have admin access. Using participant view instead.', 'OK', {
      //       duration: 5000,
      //     });
      //   }
      // }
      
      console.log("sender after role check:", this.sender);
      
      console.log("profileid from url", this.route.snapshot.queryParams['profileId']);
      console.log("loggedInProfileId", this.loggedInProfileId);
      if (this.sender === 'participant') {
        console.log(this.assignmentprofileId,"--------",this.loggedInProfileId);
        
        if (this.assignmentprofileId === this.loggedInProfileId) {
          console.log("approved");
        } else {
          console.log("not approved");
          alert("You have no access to the screen");
          this.router.navigateByUrl("/");
        } 
      }
      this.initializeAfterRoleCheck();
    });
  }
  adminsCheck(mentorRole){
    console.log(this.adminsParam,"adminsParamadminsParam");
    console.log(mentorRole,"mentorRolementorRole");
    const requestedSender = this.route.snapshot.queryParams['sender'];
    if(mentorRole && this.adminsParam.includes(this.loggedInProfileId)) {
        this.bigAdminAccess = true;
        this.sender = requestedSender; 
      // }
    } else {
      this.bigAdminAccess = false;
      this.sender = 'participant';
      if (requestedSender === 'admin') {
        this.snackbar.open('You do not have admin access. Using participant view instead.', 'OK', {
          duration: 5000,
        });
      }
    }
  }
  initializeBroadcasts() {
    collectionSnapshots(collection(this.firestore,"bigchat",this.assignmentDocId,"bigchatmessages")).pipe(takeUntil(this.subscription)).subscribe(messageData => {
      let messages = messageData.map(doc=>({id:doc.id,...doc.data()}))
        const broadcastsMap = new Map();        
        messages.forEach(msg => {
          if (msg['broadcastId'] && msg['broadcastName'] && msg['isGroupMessage']) {
            if (!broadcastsMap.has(msg['broadcastId'])) {
              broadcastsMap.set(msg['broadcastId'], {
                id: msg['broadcastId'],
                name: msg['broadcastName'],
                participants: msg['participant'] || []
              });
            }
          }
        });
        this.broadcasts = Array.from(broadcastsMap.values())
          .sort((a, b) => a.name.localeCompare(b.name));
      });
  }
  toggleSidenav() {
    console.log('Before toggle:', this.sidenav.opened);
    this.sidenav.toggle();
    console.log('After toggle:', this.sidenav.opened);
  }
  initializeAfterRoleCheck() {
    this.assignmentDocId = this.assignemtnId;
    
    if (this.profileid && this.profileid.length === 1) {
      this.selectParticipant(this.profileid[0]);
    }
    if (this.profileid && this.profileid.length > 1) {
      this.isGroupChat = true;
      this.groupChatParticipants = [...this.profileid];
      this.selectGroupChat();
    }
    getDocs(query(collection(this.firestore,"big marathon"),orderBy("startdate", 'desc'))).then(snap => {
      if (snap.docs.length != 0) {
        this.marathons = snap.docs.map(doc => {
          const data = doc.data();
          this.marathonmap[data['docid']] = data['title'];
          return {
            id: doc.id,
            title: data['title'] || 'Unnamed Marathon',
            startdate: data['startdate'],
            assignments: []
          };
        });
      }
    });
    docSnapshots(doc(this.firestore,"big assignment",this.assignmentDocId)).pipe(takeUntil(this.subscription)).subscribe(bigAssignmentDocData => {
      let bigAssignmentDoc = { id: bigAssignmentDocData.id, ...bigAssignmentDocData.data() };
      console.log("Big assignment document data:", bigAssignmentDoc);
      this.assignmentData = bigAssignmentDoc;
      this.participants = this.assignmentData['participantidlist'] || [];
    });
    getDoc(doc(this.firestore,"bigchat",this.assignmentDocId)).then(docData => {
        this.adminsParam = []
        this.chatExists = docData.exists();
        this.loading = false;
        if (this.chatExists) {
          if (this.sender === 'admin' && this.bigAdminAccess) {
            console.log("inside chat admin exist");
            this.adminsParam =  docData.data()['admins'] || [];
            this.fetchUnreadCounts();
            this.initializeBroadcasts();
          } else if (this.sender === 'participant') {
            setTimeout(() => {
              this.autoSelectSupportChat();
            }, 500);
          }
        }
        this.adminsCheck(this.mentorRole)
        console.log(doc,"docdocdoc");
        console.log("inside chat admin exist",this.admins);
        
      })
      .catch(error => {
        console.error("Error checking if chat exists:", error);
        this.loading = false;
      });
  }
  startParticipantSelection() {
    this.isSelectingParticipants = true;
    this.selectedParticipantIds = [];
    this.selectedParticipant = null;
    this.broadcastName = '';
  }
  
  cancelParticipantSelection() {
    this.isSelectingParticipants = false;
    this.selectedParticipantIds = [];
    this.broadcastName = '';
  }
  toggleParticipantSelection(participantId: string) {
    const index = this.selectedParticipantIds.indexOf(participantId);
    if (index === -1) {
      this.selectedParticipantIds.push(participantId);
    } else {
      this.selectedParticipantIds.splice(index, 1);
    }
  }
  
  isParticipantSelected(participantId: string): boolean {
    return this.selectedParticipantIds.includes(participantId);
  }
  
  toggleSelectAllParticipants() {
    if (this.areAllParticipantsSelected()) {
      this.selectedParticipantIds = [];
    } else {
      this.selectedParticipantIds = this.participants.filter(participant => participant !== this.loggedInProfileId);
    }
  }
  areAllParticipantsSelected(): boolean {
    const selectableParticipants = this.participants.filter(participant => participant !== this.loggedInProfileId);
    return selectableParticipants.length > 0 && selectableParticipants.every(participant => this.selectedParticipantIds.includes(participant));
  }
  
  createNewBroadcast() {
    if (this.selectedParticipantIds.length === 0 || !this.broadcastName?.trim()) return;
    this.isGroupChat = true;
    this.groupChatParticipants = [...this.selectedParticipantIds];
    this.isSelectingParticipants = false;    
    const broadcastId = 'broadcast_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
    const trimmedName = this.broadcastName.trim();
    this.selectGroupChat(trimmedName, broadcastId);
  }
  selectGroupChat(broadcastName?: string, broadcastId?: string) {
    this.messages = [];
    this.isLoadingMessages = true;
    this.selectedParticipant = 'group';    
    if (broadcastName) {
      this.currentBroadcastName = broadcastName;
    }
    if (broadcastId) {
      this.currentBroadcastId = broadcastId;
    } else if (!this.currentBroadcastId) {
      this.currentBroadcastId = null;
    }
    
    setTimeout(() => {
      this.loadMessages();
      this.focusMessageInput();
    }, 10);
  }
  focusMessageInput(): void {
    setTimeout(() => {
      if (this.messageInput && this.messageInput.nativeElement) {
        this.messageInput.nativeElement.focus();
      }
    }, 0);
  }
  toggleMarathon(marathonId: string, marathonTitle: string) {
    if (this.selectedMarathonId === marathonId) {
      this.selectedMarathonId = '';
      this.selectedMarathonTitle = '';
    } else {
      this.selectedMarathonId = marathonId;
      this.selectedMarathonTitle = marathonTitle;
      const marathon = this.marathons.find(m => m.id === marathonId);
      if (marathon && marathon.assignments.length === 0) {
        this.loadAssignmentsForMarathon(marathonId);
      }
    }
  }
  
  loadAssignmentsForMarathon(marathonId: string) {
    this.loadingAssignments = true;
    const marathonRef = doc(this.firestore,"big marathon",marathonId);
    getDocs(query(collection(this.firestore,"big assignment"),where("marathonref", "==", marathonRef))).then(snap => {
      this.loadingAssignments = false;
      const marathonIndex = this.marathons.findIndex(m => m.id === marathonId);
      if (marathonIndex !== -1) {
        this.marathons[marathonIndex].assignments = snap.docs.map(doc => {
          var data = doc.data()
          return {
            id: doc.id,
            title: data['title'],
            participants: data['participantidlist']
          };
        });
        
        this.marathons = [...this.marathons];
      }
    })
    .catch(error => {
      this.loadingAssignments = false;
      console.error("Error fetching assignments:", error);
    });
  }
  selectAssignment(assignment: string) {
    if (this.assignmentData.docid === assignment['id']) {
      var bar = this.snackbar.open(`Already in the chat: ${this.assignmentData['title']}`,'OK', {
        duration: 10000,
      });
    } else {
      this.router.navigate(['bigchatscreen'], {
        queryParams: {
          assignemtnId: assignment['id'],
          sender: "admin"
        }
      }).then(() => {
        window.location.reload();
      });
    }
  }
  autoSelectSupportChat() {
    this.selectedParticipant = this.loggedInProfileId;
    this.loadMessages();
    this.focusMessageInput();
  }
  
  fetchUnreadCounts() {
    if (this.sender !== 'admin') return;    
    // if (this.sender !== 'admin') return;    
    collectionSnapshots(collection(this.firestore,"bigchat",this.assignmentDocId,"bigchatmessages")).pipe(takeUntil(this.subscription)).subscribe(allMessagesData=> {
      let allMessages = allMessagesData.map(doc=>({id:doc.id,...doc.data()}))
        this.unreadCounts = {};        
        this.participants.forEach(participant => {
          if (participant !== this.loggedInProfileId) {
            this.unreadCounts[participant] = 0;
          }
        });
        allMessages.forEach(message => {
          if (message['sender'] === 'participant' && !message['readByAdmin']) {
            const participantId = message['senderid'];
            if (participantId && participantId !== this.loggedInProfileId) {
              this.unreadCounts[participantId] = (this.unreadCounts[participantId] || 0) + 1;
            }
          }
        });
      });
  }
  
  ngOnInit(): void {
    getDoc(doc(this.firestore,"bigchat",this.assignmentDocId)).then(docData => {
        this.chatExists = docData.exists();
        this.loading = false;
        if (this.chatExists) {
          if (this.sender === 'admin' && this.bigAdminAccess) {            
            this.fetchUnreadCounts();
          } else if (this.sender === 'participant' || !this.bigAdminAccess) {
            setTimeout(() => {
              this.autoSelectSupportChat();
            }, 500);
          }
        }
      })
      .catch(error => {
        console.error("Error checking if chat exists:", error);
      });
  }

  getInitials(name: string): string {
    if (!name) return '?';
    
    const parts = name.split(' ');
    if (parts.length === 1) {
      return name.substring(0, 2).toUpperCase();
    }
    
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  selectParticipant(participant: string) {
    console.log(participant,"select partitititit");
    
    if (this.selectedParticipant === participant) return;
    this.messages = [];
    this.isLoadingMessages = true;
    this.selectedParticipant = participant;
    setTimeout(() => {
      this.loadMessages();
      this.focusMessageInput();
    }, 10);
  }
  
  markMessagesAsReadByAdmin() {
    if (this.sender !== 'admin') return;
    const batch = writeBatch(this.firestore)
    let updatesMade = false;
    const participantMessages = this.messages.filter(message => 
      message.sender === 'participant' && !message.readByAdmin
    );
    
    participantMessages.forEach(message => {

    const messageRef = doc(
      this.firestore,
      "bigchat",
      this.assignmentDocId,
      "bigchatmessages",
      message.messageid
    );
      
      batch.update(messageRef, { readByAdmin: true, adminReadAt: new Date() });
      updatesMade = true;
    });
    
    if (updatesMade) {
      batch.commit().catch(error => {
        console.error("Error marking messages as read by admin:", error);
      });
    }
  }

loadMessages() {
  console.log(this.selectedParticipant, "loadconsole");
  if ((!this.selectedParticipant && this.sender !== 'participant')) return;

  this.isLoadingMessages = true;
  this.messages = [];

  let msgQuery;
  const baseCollection = collection(this.firestore, "bigchat", this.assignmentDocId, "bigchatmessages");

  if (this.sender === 'participant') {
    console.log("query 1");
    msgQuery = query(baseCollection, where("participant", "array-contains", this.loggedInProfileId));
  } else if (this.isGroupChat && this.selectedParticipant === 'group') {
    console.log("query for group chat");
    msgQuery = baseCollection; // no filters
  } else {
    console.log("query 2");
    msgQuery = query(baseCollection, where("participant", "array-contains", this.selectedParticipant));
  }

  collectionSnapshots(msgQuery)
    .pipe(takeUntil(this.subscription))
    .subscribe(messageData => {
      let messages = messageData.map(doc => ({ id: doc.id, ...doc.data() }));
      let filteredMessages = [];

      if (this.isGroupChat && this.selectedParticipant === 'group') {
        if (this.currentBroadcastId) {
          filteredMessages = messages.filter(msg =>
            msg['broadcastId'] === this.currentBroadcastId
          );
        } else {
          filteredMessages = messages.filter(msg => {
            const containsAllGroupMembers = this.groupChatParticipants.every(
              member => msg['participant']?.includes(member)
            );
            const containsAnyGroupMember = this.groupChatParticipants.some(
              member => msg['participant']?.includes(member)
            );
            const senderIsGroupMember = this.groupChatParticipants.includes(msg['senderid']);
            return containsAllGroupMembers || (containsAnyGroupMember && senderIsGroupMember);
          });

          if (filteredMessages.length > 0 && filteredMessages[0].broadcastId) {
            this.currentBroadcastId = filteredMessages[0].broadcastId;
            filteredMessages = messages.filter(msg =>
              msg['broadcastId'] === this.currentBroadcastId
            );
          }
        }

        if (filteredMessages.length > 0 && filteredMessages[0].broadcastName) {
          this.currentBroadcastName = filteredMessages[0].broadcastName;
        }
      } else {
        filteredMessages = messages;
      }

      this.messages = filteredMessages.sort((a, b) => {
        const timeA = a.time instanceof Date ? a.time : a.time?.toDate?.();
        const timeB = b.time instanceof Date ? b.time : b.time?.toDate?.();
        return timeA - timeB;
      });

      this.groupedMessages = this.groupMessagesByDate(this.messages);
      this.isLoadingMessages = false;

      if (this.sender === 'participant') {
        this.markMessagesAsRead();
      } else if (this.sender === 'admin') {
        this.markMessagesAsReadByAdmin();
        this.fetchMessageReadStatus();
      }

      setTimeout(() => {
        this.scrollToBottom();
        this.focusMessageInput();
      }, 100);
    }, error => {
      console.error("Error loading messages:", error);
      this.isLoadingMessages = false;
    });
}
markMessagesAsRead() {
  if (this.sender !== 'participant') return;
  const batch = writeBatch(this.firestore)
  let updatesMade = false;
  
  this.messages.forEach(message => {
    if (message.sender === 'admin' && 
      ((message.isGroupMessage && 
        message.participantReadStatus && 
        message.participantReadStatus[this.loggedInProfileId] === false) || 
      (!message.isGroupMessage && !message.readByParticipant))) {
      const messageRef = doc(
        this.firestore,
        "bigchat",
        this.assignmentDocId,
        "bigchatmessages",
        message.messageid
      );
      
      if (message.isGroupMessage) {
        let updatedStatus = {...message.participantReadStatus};
        updatedStatus[this.loggedInProfileId] = true;
        batch.update(messageRef, { 
          [`participantReadStatus.${this.loggedInProfileId}`]: true,
          [`${this.loggedInProfileId}ReadAt`]: new Date()
        });
      } else {
        batch.update(messageRef, { 
          readByParticipant: true, 
          readAt: new Date() 
        });
      }
      
      updatesMade = true;
    }
  });
  
  if (updatesMade) {
    batch.commit().catch(error => {
      console.error("Error marking messages as read:", error);
    });
  }
}
  fetchMessageReadStatus() {
    if (this.sender !== 'admin') return;
    this.messageReadStatus = {};
    
    this.messages.forEach(message => {
      if (message.sender === 'admin') {
        if (message.isGroupMessage && this.selectedParticipant !== 'group') {
          this.messageReadStatus[message.messageid] = 
            message.participantReadStatus && 
            message.participantReadStatus[this.selectedParticipant] === true;
        } else if (!message.isGroupMessage) {
          this.messageReadStatus[message.messageid] = !!message.readByParticipant;
        }
      }
    });
  }
   

  attachment() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,audio/*,video/*';
    fileInput.addEventListener('change', (event: any) => {
      const files: FileList = event.target.files;
      if (files && files.length) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.size > this.maxFileSize) {
            this.snackbar.open(`File ${file.name} is too large. Maximum size is 10MB.`, 'OK', {
              duration: 5000,
            });
            continue;
          }
          this.selectedFiles.push(file);
          if (file.type.startsWith('image/') || 
              file.type.startsWith('audio/') || 
              file.type.startsWith('video/')) {
            const unsafeUrl = URL.createObjectURL(file);
            this.filePreviewUrls[file.name] = this.sanitizer.bypassSecurityTrustUrl(unsafeUrl);
          }
        }
      }
    });
    fileInput.click();
  }
  
  removeSelectedFile(index: number) {
    const fileName = this.selectedFiles[index].name;
    if (this.filePreviewUrls[fileName]) {
      delete this.filePreviewUrls[fileName];
    }
    this.selectedFiles.splice(index, 1);
  }
  
  uploadFiles(): Observable<any[]> {
    if (this.selectedFiles.length === 0) {
      return of([]);
    }

    this.uploadingAttachments = true;
    const timestamp = Date.now();

    const uploads = this.selectedFiles.map(file => {
      const filePath = `bigchatattachment/${this.assignmentDocId}/${timestamp}_${file.name}`;
      const fileRef = ref(this.storage, filePath);
      const task = uploadBytesResumable(fileRef, file);
      task.on('state_changed', snapshot => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        this.fileUploadProgress[file.name] = progress;
      });

      return new Observable(observer => {
        task.then(() => {
          getDownloadURL(fileRef).then(url => {
            observer.next({
              url,
              type: file.type,
              name: file.name,
              size: file.size
            });
            observer.complete();
          }).catch(err => {
            console.error(`Failed to get download URL for ${file.name}:`, err);
            this.snackbar.open(`Failed to get URL for ${file.name}`, 'OK', { duration: 5000 });
            observer.next(null);
            observer.complete();
          });
        }).catch(error => {
          console.error(`Error uploading file ${file.name}:`, error);
          this.snackbar.open(`Failed to upload ${file.name}`, 'OK', { duration: 5000 });
          observer.next(null);
          observer.complete();
        });
      });
    });

    return forkJoin(uploads);
  }


  sendMessage() {
    if (
      this.isSending || 
      this.uploadingAttachments || 
      (this.newMessage.trim() === '' && this.selectedFiles.length === 0)
    ) return;

    this.isSending = true;

    if (this.selectedFiles.length > 0) {
      this.uploadingAttachments = true;
      const timestamp = Date.now();
      const uploadObservables: Observable<any>[] = [];

      this.attachmentUrls = [];

      for (let file of this.selectedFiles) {
        const filePath = `bigchatattachment/${this.assignmentDocId}/${timestamp}_${file.name}`;
        const fileRef = ref(this.storage, filePath);
        const task = uploadBytesResumable(fileRef, file);

        // Track progress
        task.on('state_changed', snapshot => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          this.fileUploadProgress[file.name] = progress;
        });

        // Push an observable that resolves to file metadata after upload
        const fileUpload$ = new Observable(observer => {
          task.then(() => {
            getDownloadURL(fileRef).then(url => {
              observer.next({
                url: url,
                type: file.type,
                name: file.name,
                size: file.size
              });
              observer.complete();
            }).catch(err => {
              console.error(`Failed to get URL for ${file.name}`, err);
              this.snackbar.open(`Failed to get URL for ${file.name}`, 'OK', { duration: 5000 });
              observer.error(err);
            });
          }).catch(error => {
            console.error(`Error uploading ${file.name}:`, error);
            this.snackbar.open(`Failed to upload ${file.name}`, 'OK', { duration: 5000 });
            observer.error(error);
          });
        });

        uploadObservables.push(fileUpload$);
      }

      forkJoin(uploadObservables).subscribe({
        next: (attachments) => {
          this.sendMessageWithAttachments(attachments);
          this.uploadingAttachments = false;
          this.isSending = false;
        },
        error: (err) => {
          console.error('Error uploading attachments:', err);
          this.snackbar.open('Error uploading attachments', 'OK', { duration: 5000 });
          this.uploadingAttachments = false;
          this.isSending = false;
        }
      });

    } else {
      // No attachments
      this.sendMessageWithAttachments([]);
      this.isSending = false;
    }
  }
  

  sendMessageWithAttachments(attachments: any[]) {
    let participants = [];
    let isGroupMessage = false;
    let broadcastName = null;
    let broadcastId = null;
    
    if (this.sender === 'participant') {
      participants = [this.loggedInProfileId];
    } else if (this.isGroupChat && this.selectedParticipant === 'group') {
      participants = [...this.groupChatParticipants];
      isGroupMessage = true;
      broadcastName = this.currentBroadcastName; 
      broadcastId = this.currentBroadcastId;
    } else {
      participants = [this.selectedParticipant];
    }
    
    if (participants.length === 0 && this.sender !== 'participant') {
      this.isSending = false;
      this.uploadingAttachments = false;
      return;
    }
    
    const messageText = this.newMessage.trim();
    this.newMessage = '';
    
    const messagesRef = collection(this.firestore, 'bigchat', this.assignmentDocId, 'bigchatmessages');
    const newMessageRef = doc(messagesRef);
        
    let readStatus = {};
    if (isGroupMessage) {
      participants.forEach(participantId => {
        if (participantId !== this.loggedInProfileId) {
          readStatus[participantId] = false;
        }
      });
    }
    
    const messageData = {
      message: messageText,
      time: new Date(),
      messageid: newMessageRef.id,
      senderid: this.loggedInProfileId,
      sender: this.sender === 'participant' ? 'participant' : 'admin',
      participant: participants,
      readByParticipant: this.sender === 'participant',
      readByAdmin: this.sender === 'admin',
      isGroupMessage: isGroupMessage,
      participantReadStatus: readStatus || {},
      broadcastName: broadcastName,
      broadcastId: broadcastId,
      hasAttachments: attachments.length > 0,
      attachments: attachments
    };
    setDoc(newMessageRef,messageData).then(() => {
        console.log('Message sent successfully');
        this.messages.push(messageData);
        this.groupedMessages = this.groupMessagesByDate(this.messages);
        this.scrollToBottom(); 
        this.focusMessageInput();
        this.selectedFiles = [];
        this.filePreviewUrls = {};
        this.fileUploadProgress = {};
        this.attachmentUrls = [];
      })
      .catch(error => {
        console.error("Error sending message:", error);
        this.newMessage = messageText;
        this.snackbar.open('Error sending message', 'OK', { duration: 5000 });
      })
      .finally(() => {
        this.isSending = false;
        this.uploadingAttachments = false;
      });
  }
  
  getFileSize(size: number): string {
    if (size < 1024) {
      return size + ' B';
    } else if (size < 1024 * 1024) {
      return (size / 1024).toFixed(1) + ' KB';
    } else {
      return (size / (1024 * 1024)).toFixed(1) + ' MB';
    }
  }

  ngOnDestroy() {
    this.subscription.next();
    this.subscription.complete();
  }
  
  scrollToBottom() {
    if (this.chatMessagesContainer) {
      this.chatMessagesContainer.nativeElement.scrollTop = 
        this.chatMessagesContainer.nativeElement.scrollHeight;
    }
  }
  
  groupMessagesByDate(messages: any[]): { date: Date, messages: any[] }[] {
    if (!messages || messages.length === 0) return [];
    
    const groups: { date: Date, messages: any[] }[] = [];
    let currentDate: Date = null;
    let currentGroup: any[] = [];
    
    messages.forEach(message => {
      const messageDate = message.time instanceof Date ? message.time : message.time.toDate();
      const messageDateOnly = new Date(
        messageDate.getFullYear(), 
        messageDate.getMonth(), 
        messageDate.getDate()
      );
      
      if (!currentDate || currentDate.getTime() !== messageDateOnly.getTime()) {
        if (currentGroup.length > 0) {
          groups.push({
            date: currentDate,
            messages: currentGroup
          });
        }
        currentDate = messageDateOnly;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push({
        date: currentDate,
        messages: currentGroup
      });
    }
    
    return groups;
  }

  getDateHeader(date: Date): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.getTime() === today.getTime()) {
      return 'Today';
    } else if (date.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  }

}
