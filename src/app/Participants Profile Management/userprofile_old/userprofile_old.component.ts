import { Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { CommonModule, DatePipe, JsonPipe, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

// AngularFire
import {
  Firestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  DocumentReference,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

// Angular Material
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';

// CDK
import { TextFieldModule } from '@angular/cdk/text-field';

// Auth service
import { AuthguardService } from '../../authguard.service';

// Custom pipes — update paths to match your project structure
import { LinebreaksPipe, LinkPipe } from "../../custompipe.pipe";

// Custom components — update paths to match your project structure
import { VideoPlayerComponent } from '../../video-player/video-player.component';

@Component({
  selector: 'app-userprofile',
  templateUrl: './userprofile_old.component.html',
  styleUrls: ['./userprofile_old.component.css'],
  standalone: true,
  imports: [
    // Angular core
    CommonModule,
    FormsModule,
    DatePipe,
    JsonPipe,
    KeyValuePipe,

    // Angular Material
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatTabsModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatMenuModule,
    MatDividerModule,
    MatFormFieldModule,

    // CDK
    TextFieldModule,

    // Custom pipes
    LinebreaksPipe,
    LinkPipe,

    // Custom components
    VideoPlayerComponent,
  ],
})
export class UserprofileComponent implements OnInit {

  // ── Injected services ────────────────────────────────────────────────────────
  private auth     = inject(AuthguardService);
  private firestore = inject(Firestore);
  private storage  = inject(Storage);

  // ── ViewChildren / ViewChild ─────────────────────────────────────────────────
  dataSource = new MatTableDataSource<any>();
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChildren('stageElement') stageElements!: QueryList<ElementRef>;
  @ViewChild('fileInput') fileInput!: ElementRef;
  [x: string]: any;

  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    this.dataSource.paginator = this.paginator;
  }

  @ViewChild(MatSort) set matSort(sort: MatSort) {
    this.dataSource.sort = this.sort;
  }

  // ── Subscriptions ────────────────────────────────────────────────────────────
  chatlistsubscription: any;
  pinnedChatSubscription: any;

  // ── String declarations ───────────────────────────────────────────────────────
  selectedScreen: string = 'Journey';
  stageMessage: string  = '';
  ticketMessage: string = '';

  // ── Object declarations ───────────────────────────────────────────────────────
  participantproductlist: Record<string, any> = {};
  mapjourney:     Record<string, any> = {};
  mapPackage:     Record<string, any> = {};
  mapproduct:     Record<string, any> = {};
  mapevents:      Record<string, any> = {};
  mapProfile:     Record<string, any> = {};
  profileimage:   Record<string, any> = {};
  mapQueue:       Record<string, any> = {};
  mapWorkshop:    Record<string, any> = {};
  mapReport:      Record<string, any> = {};
  mappostcategory:    Record<string, any> = {};
  profileJourneyProduct: Record<string, any> = {};
  selectedIndexes:       Record<string, any> = {};
  chatList:    Record<string, any> = {};
  mapUserId:   Record<string, any> = {};
  currentIssueData: Record<string, any> = {};
  mapVideoTitle:    Record<string, any> = {};
  mapRecordedDate:  Record<string, any> = {};
  expandedStages:   Record<string, boolean> = {};
  user: any;

  // ── Array declarations ────────────────────────────────────────────────────────
  participantjourney:  any[] = [];
  participantevents:   any[] = [];
  products:            any[] = [];
  customerticket:      any[] = [];
  participantforms:    any[] = [];
  workshopList:        any[] = [];
  participantreports:  any[] = [];
  breakthroughs:       any[] = [];
  pinnedChatList:      any[] = [];
  stages:              any[] = [];
  currentIssueChat:    any[] = [];
  ticketFiles:         any[] = [];
  selectedFiles:       any[] = [];
  liveEvolutionMapping: any[] = [];

  displayedColumns: string[] = ['edit', 'sno', 'created', 'business', 'career', 'family', 'health', 'personalGenius'];

  menuItems = [
    { icon: 'live_tv',          label: 'E!-Flix'   },
    { icon: 'timeline',         label: 'Journey'   },
    { icon: 'list',             label: 'Tasks'     },
    { icon: 'hourglass_arrow_up', label: 'ATC'     },
    { icon: 'email',            label: 'Emails'    },
    { icon: 'person',           label: 'Profile'   },
    { icon: 'calendar_today',   label: 'Upcoming'  },
    { icon: 'settings',         label: 'Support'   },
  ];

  tabs = [
    { label: 'Ongoing Event',   icon: 'mode_standby'     },
    { label: 'Journey',         icon: 'rocket_launch'    },
    { label: 'Event Attended',  icon: 'local_activity'   },
    { label: 'Support Ticket',  icon: 'support_agent'    },
    { label: 'Forms',           icon: 'history_edu'      },
    { label: 'Interim Report',  icon: 'trending_up'      },
    { label: 'Breakthroughs',   icon: 'batch_prediction' },
    { label: 'AEL',             icon: 'genetics'         },
  ];

  // ── Boolean declarations ──────────────────────────────────────────────────────
  loadingQueue: boolean = true;

  // ── Numeric declarations ──────────────────────────────────────────────────────
  currentQueueStageIndex: number = 0;
  unreadcount: number = 0;

  // ── Constructor ───────────────────────────────────────────────────────────────
  constructor() {
    this.auth.username().then((userdata: any) => (this.user = userdata));

    this.auth.getProfileMap().then((e: any) => {
      this.mapProfile   = e.map;
      this.profileimage = e.profileimage;
      this.mapUserId    = e.mapUserId;
    });

    // journey
    getDocs(collection(this.firestore, 'journey')).then((res) => {
      res.docs.forEach((d) => {
        const element = d.data();
        this.mapjourney[element['id']] = element['journey'];
      });
    });

    // package
    getDocs(collection(this.firestore, 'package')).then((snap) => {
      snap.docs.forEach((d) => {
        this.mapPackage[d.id] = d.data()['package'];
      });
    });

    // products
    getDocs(collection(this.firestore, 'products')).then((res) => {
      res.docs.forEach((d) => {
        const element = d.data();
        this.mapproduct[element['id']] = element['product'];
      });
    });

    // eiflix workshop
    getDocs(collection(this.firestore, 'eiflix workshop')).then((snap) => {
      this.workshopList = snap.docs.map((e) => e.data());
      this.workshopList.forEach((element) => {
        this.mapWorkshop[element['docid']] = element['title'];
      });
    });

    // queue generation
    getDocs(
      query(collection(this.firestore, 'queue generation'), orderBy('queueenddate', 'desc'))
    ).then(async (queuesnap) => {
      queuesnap.docs.forEach((d) => {
        const element = d.data();
        this.mapQueue[element['docid']] = element['queuename'];
      });
    });

    // post_categories
    getDocs(collection(this.firestore, 'post_categories')).then((type) => {
      type.docs.forEach((d) => {
        this.mappostcategory[d.id] = d.data()['type'];
      });
    });

    setTimeout(() => {
      this.fetchData();
      this.fetchOngoingQueue();
    }, 4000);
  }

  // ── Lifecycle hooks ───────────────────────────────────────────────────────────
  ngOnInit(): void {
    // this.fetchData();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort      = this.sort;
    this.scrollToCurrentStage();
  }

  // ── Ongoing queue ─────────────────────────────────────────────────────────────
  async fetchOngoingQueue(): Promise<void> {
    this.loadingQueue = true;
    const today = new Date();
    this.profileJourneyProduct['group'] = {};
    this.mapVideoTitle   = {};
    this.mapRecordedDate = {};

    // Evolution mapping videos
    const videoDocs = await getDocs(
      query(collection(this.firestore, 'evolutionmappingvideo'), where('profileid', '==', this.user.profileid))
    );
    videoDocs.docs.forEach((element) => {
      const data = element.data();
      this.mapVideoTitle[data['videourl']]   = data['title'];
      this.mapRecordedDate[data['videourl']] = data['recordeddate'];
    });

    // Live evolution mapping
    getDoc(doc(this.firestore, 'liveevolutionmapping', this.user.profileid))
      .then((livedata) => {
        this.liveEvolutionMapping = [];
        const element = livedata.data();
        if (element) {
          this.liveEvolutionMapping.push(element);
          console.log('live', this.liveEvolutionMapping);
        } else {
          console.log('No data');
        }
      })
      .catch((error) => console.error('Error', error));

    // Participant product (ongoing event mode)
    const p_product = await getDocs(
      query(
        collection(this.firestore, 'participantsproduct'),
        where('profileid', '==', this.user.profileid),
        where('mode', '==', 'Event Mode'),
        where('status', '==', 'ongoing'),
        limit(1)
      )
    );
    if (p_product.docs.length !== 0) {
      this.profileJourneyProduct['participantproductid']   = p_product.docs[0].id;
      this.profileJourneyProduct['participantproductdata'] = p_product.docs[0].data();
      console.log('PARTICIPANT PRODUCT ID', this.profileJourneyProduct['participantproductid']);
    } else {
      console.log('No Ongoing Events');
    }

    // Deliverables
    const delivery = await getDocs(
      query(
        collection(this.firestore, 'deliverables'),
        where('participantproductid', '==', this.profileJourneyProduct['participantproductid']),
        where('type', '==', 'queue'),
        where('status', '==', 'ongoing')
      )
    );
    if (delivery.docs.length !== 0) {
      this.profileJourneyProduct['deliverables'] = delivery.docs[0].data();
      // console.log("DELIVERABLES", this.profileJourneyProduct['deliverables']);
    } else {
      console.log('No Deliverables');
    }

    // Queue token — resolve the document reference stored in deliverables.fileref
    const filerefArray = this.profileJourneyProduct['deliverables']['fileref'];
    const lastFileref  = filerefArray[filerefArray.length - 1] as DocumentReference;
    const queuetoken   = await getDoc(lastFileref);
    if (queuetoken.exists()) {
      this.profileJourneyProduct['queuetoken']      = queuetoken.data();
      this.profileJourneyProduct['currentstage']    = queuetoken.data()!['currentstage'];
    } else {
      console.log('NO QUEUE TOKEN FOUND');
    }

    // Queue data
    const queueDataSnap = await getDoc(
      this.profileJourneyProduct['queuetoken']['queueref'] as DocumentReference
    );
    if (queueDataSnap.exists()) {
      let ongoingQueuepath = '';
      this.profileJourneyProduct['queueData'] = queueDataSnap.data() ?? {};

      if (![null, undefined, ''].includes(this.profileJourneyProduct['queueData'])) {
        const index = this.profileJourneyProduct['queueData']['stages'].findIndex(
          (e: any) => e === this.profileJourneyProduct['currentstage']
        );
        this.currentQueueStageIndex = index !== -1 ? index : 0;
      }

      ongoingQueuepath = queueDataSnap.ref.path;
      if (ongoingQueuepath != null) {
        this.profileJourneyProduct['currenteventref'] = queueDataSnap.ref;
        getDoc(doc(this.firestore, ongoingQueuepath)).then((currentevent) => {
          if (currentevent.exists()) {
            this.profileJourneyProduct['currenteventname'] = (currentevent.data() ?? {})['queuename'];
          }
        });
      }
    }

    if (this.profileJourneyProduct['currenteventref'] == null) {
      const profileRef = doc(this.firestore, 'profile_data', this.user.profileid);
      const eventLists = await getDocs(
        query(
          collection(this.firestore, 'event collection'),
          where('hosts', 'array-contains', profileRef),
          where('end_date', '>=', today)
        )
      );
      console.log('Ongoing Event', eventLists.docs.length);
      let ongoingEventpath: string | undefined;
      for (let i = 0; i < eventLists.docs.length; i++) {
        const eventDoc  = eventLists.docs[i];
        const eventData = eventDoc.data() ?? {};
        if ((eventData['start_date'].toDate() as Date) < today) {
          ongoingEventpath = eventDoc.ref.path;
          break;
        }
      }
      if (ongoingEventpath != null) {
        this.profileJourneyProduct['currenteventref'] = doc(this.firestore, ongoingEventpath);
        getDoc(doc(this.firestore, ongoingEventpath)).then((currentevent) => {
          if (currentevent.exists()) {
            this.profileJourneyProduct['currenteventname'] = (currentevent.data() ?? {})['name'];
          }
        });
      }
    }

    console.log('dataa', this.profileJourneyProduct);

    // Build stage groups
    for (const index in this.profileJourneyProduct['queueData']['stagegroup']) {
      const groupName     = this.profileJourneyProduct['queueData']['stagegroup'][index];
      const groupedStages = Object.keys(
        this.profileJourneyProduct['queueData']['stageproperty']
      ).filter(
        (key) => this.profileJourneyProduct['queueData']['stageproperty'][key]['stagegroup'] === groupName
      );

      const indexMap = new Map<any, number>();
      this.profileJourneyProduct['queueData']['stages'].forEach((item: any, idx: number) => {
        indexMap.set(item, idx);
      });

      const sortedFinal = groupedStages.sort((x, y) => (indexMap.get(x) ?? 0) - (indexMap.get(y) ?? 0));

      let currentStageIndex = 0;
      if (Object.keys(this.profileJourneyProduct['group']).length === 0) {
        this.profileJourneyProduct['group'][groupName] = sortedFinal;
        currentStageIndex = sortedFinal.findIndex(
          (e) => this.profileJourneyProduct['currentstage'] === e
        );
      } else {
        if (!Object.keys(this.profileJourneyProduct['group']).includes(groupName)) {
          this.profileJourneyProduct['group'][groupName] = sortedFinal;
          currentStageIndex = sortedFinal.findIndex(
            (e) => this.profileJourneyProduct['currentstage'] === e
          );
        }
      }
      this.selectedIndexes[groupName] = currentStageIndex === -1 ? null : currentStageIndex;
    }

    // Stage chat — real-time listener (replaces snapshotChanges)
    const queueDocRef = doc(
      this.firestore,
      'queue generation',
      this.profileJourneyProduct['queueData']['docid']
    );
    const stageChatCol = collection(queueDocRef, 'stagechat');

    this.chatlistsubscription = onSnapshot(
      query(stageChatCol, orderBy('date', 'desc')),
      (chatsnap) => {
        this.chatList = {};
        for (let j = 0; j < this.profileJourneyProduct['queueData']['stages'].length; j++) {
          const element = this.profileJourneyProduct['queueData']['stages'][j];
          this.chatList[element] = [];
        }
        chatsnap.docs.forEach((d) => {
          const element = d.data();
          this.chatList[element['stage']] = this.chatList[element['stage']] || [];
          this.chatList[element['stage']].push(element);
        });
      }
    );

    // Pinned chat listener
    this.pinnedChatSubscription = onSnapshot(
      query(
        stageChatCol,
        where('senderprofileid', '==', this.user.profileid),
        where('pinned', '==', true),
        orderBy('date', 'desc')
      ),
      async (snap) => {
        this.pinnedChatList = snap.docs.map((d) => d.data());
      }
    );

    this.loadingQueue = false;
    setTimeout(() => this.scrollToCurrentStage(), 500);
  }

  // ── Fetch participant data ────────────────────────────────────────────────────
  async fetchData(): Promise<void> {
    // Interim crossover / AEL
    const interimCrossover = await getDocs(
      query(collection(this.firestore, 'interim crossover'), where('profileid', '==', this.user.profileid))
    );
    if (interimCrossover.docs.length !== 0) {
      const aeldata: any[] = [];
      interimCrossover.docs.forEach((d) => {
        const interimData = d.data();
        aeldata.push({
          created:       interimData['created'],
          aelid:         interimData['aelid'],
          business:      interimData['metric']['Business'],
          career:        interimData['metric']['Career'],
          family:        interimData['metric']['Family'],
          health:        interimData['metric']['Health'],
          personalGenius: interimData['metric']['Personal Genius'],
          docid:         interimData['docid'],
          metric:        interimData['metric'],
        });
      });
      aeldata.sort((a, b) => b['created'].toDate() - a['created'].toDate());
      this.dataSource.data = aeldata;
    } else {
      console.log(' No Interim Crossover ');
    }

    // Breakthroughs
    const breakthroughsSnap = await getDocs(
      query(
        collection(this.firestore, 'Achievements/posts/postcollection'),
        where('profileid', '==', this.user.profileid)
      )
    );
    const breakthroughspost: any[] = [];
    breakthroughsSnap.docs.forEach((d) => breakthroughspost.push(d.data()));
    breakthroughspost.sort((a, b) => b['created'].toDate() - a['created'].toDate());
    this.breakthroughs.push(...breakthroughspost);

    // Interim report log
    const reports = await getDocs(
      query(collection(this.firestore, 'interimreport log'), where('profileid', '==', this.user.profileid))
    );
    reports.docs.forEach((d) => {
      const element = d.data();
      element['reportlist'] = ((element['reports'] ?? []) as string[])
        .map((e) => '- ' + this.mapReport[e])
        .join('\n');
      this.participantreports.push(element);
    });
    this.participantreports.sort((a, b) => {
      const dateA = a['lastupdate']?.toDate();
      const dateB = b['lastupdate']?.toDate();
      return dateB - dateA;
    });

    // Forms by client
    const formSnap = await getDocs(
      query(collection(this.firestore, 'formsByClient'), where('profileid', '==', this.user.profileid))
    );
    const forms: any[] = [];
    formSnap.docs.forEach((d) => forms.push(d.data()));
    forms.sort((a, b) => b['date'].toDate() - a['date'].toDate());
    this.participantforms.push(...forms);

    // Event collection map
    const events = await getDocs(collection(this.firestore, 'event collection'));
    events.docs.forEach((d) => {
      this.mapevents[d.id] = d.data();
    });

    // Events profiles
    const profileRef    = doc(this.firestore, 'profile_data', this.user.profileid);
    const eventsProfiles = await getDocs(
      query(collection(this.firestore, 'events_profiles'), where('profile_ref', '==', profileRef))
    );
    eventsProfiles.docs.forEach((d) => this.participantevents.push(d.data()));
    this.participantevents.sort((a, b) => {
      const dateA = this.mapevents[a['event_ref'].id]['start_date'].toDate();
      const dateB = this.mapevents[b['event_ref'].id]['start_date'].toDate();
      return dateB - dateA;
    });

    // Client issues / support tickets
    const clientissue = await getDocs(
      query(collection(this.firestore, 'clientissue'), where('clientid', '==', this.user.profileid))
    );
    const tickets: any[] = [];
    clientissue.docs.forEach((d) => tickets.push(d.data()));
    tickets.sort((a, b) => b['reporteddate'].toDate() - a['reporteddate'].toDate());
    this.customerticket.push(...tickets);

    // Participant journey product
    const journeySnap = await getDocs(
      query(collection(this.firestore, 'participantjourneyproduct'), where('profileid', '==', this.user.profileid))
    );
    if (journeySnap.docs.length !== 0) {
      journeySnap.docs.forEach((d) => {
        const element = d.data();
        element['showProductSection'] = false;
        this.participantjourney.push(element);
      });
    } else {
      console.log('No Journey Product Found');
    }

    // Participants product list
    const participantsProductSnap = await getDocs(
      query(collection(this.firestore, 'participantsproduct'), where('profileid', '==', this.user.profileid))
    );
    participantsProductSnap.docs.forEach((d) => {
      const element = d.data();
      this.participantproductlist[element['docid']] = element;
    });

    this.participantjourney.sort((a, b) => {
      const statusA = a.journeystatus === 'ongoing' ? 0 : 1;
      const statusB = b.journeystatus === 'ongoing' ? 0 : 1;
      return statusA - statusB;
    });
  }

  // ── Support ticket chat ───────────────────────────────────────────────────────
  fetchTicketMessages(ticket: any): void {
    this.currentIssueData = ticket;
    const messagesCol = collection(this.firestore, 'clientissue', ticket['id'], 'messages');
    onSnapshot(query(messagesCol, orderBy('time', 'desc')), (snap) => {
      const chat = snap.docs.map((d) => d.data());
      this.unreadcount = chat.filter(
        (e) => e['pending'] !== undefined && e['pending'].includes('admin')
      ).length;
      const list: any[] = [];
      chat.forEach((messagedata, i) => {
        messagedata['originalmessage'] = messagedata['message'];
        messagedata['message'] = [null, undefined, ''].includes(messagedata['message'])
          ? ''
          : messagedata['message'].replace(/\n/g, '<br>');
        list.push(messagedata);
        if (i === chat.length - 1) {
          this.currentIssueChat = list;
        }
      });
    });
  }

  onClick(event: any): void {
    event.target.value = '';
  }

  chooseType(type: string): void {
    if (type === 'image')  this['filetype'] = 'image/*';
    else if (type === 'video') this['filetype'] = 'video/*';
    else if (type === 'audio') this['filetype'] = 'audio/*';
    else if (type === 'files') this['filetype'] = 'application/*';

    setTimeout(() => this.fileInput.nativeElement.click(), 50);
  }

  selectFiles(value: any): void {
    this.selectedFiles = [];
    const localURL: any[] = [];
    this.selectedFiles = Array.from(value);

    for (let i = 0; i < this.selectedFiles.length; i++) {
      const element = this.selectedFiles[i];
      const reader  = new FileReader();
      reader.readAsDataURL(element);
      reader.onload = (event: any) => {
        const map: any = {
          filename: element.name,
          type:     element.type,
          url:      event.target.result,
        };
        console.log(map);
        localURL.push(map);
        this.ticketFiles = localURL;
      };
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
    const file = [...this.ticketFiles];
    file.splice(index, 1);
    this.ticketFiles = file;
  }

  async sendChatMessage(ticketmsg: string, SelectedChat: any): Promise<void> {
    if (this.selectedFiles.length === 0 && (ticketmsg === '' || ticketmsg === '\n')) {
      alert('Oops, Please type a message....');
    } else {
      console.log('Sending Message');

      const message         = ticketmsg;
      const files           = this.selectedFiles;
      this.selectedFiles    = [];
      this.ticketMessage    = '';
      this.ticketFiles      = [];
      const extractedLinks  = (ticketmsg.match(this['linkPattern']) || []).map((link: string) => link.trim());

      console.log('uploading');
      const date  = serverTimestamp();
      const docID = doc(collection(this.firestore, 'clientissue')).id; // generates a new ID

      const chatCollectionRef    = doc(this.firestore, 'clientissue', SelectedChat['id']);
      const chatSubCollectionRef = doc(
        this.firestore,
        'clientissue', SelectedChat['id'], 'messages', docID
      );

      const msgData: any = {
        time:             date,
        message:          message,
        messageid:        docID,
        sender_profileid: this.user.profileid,
        sender_email:     this.user.email,
        sender_uid:       this.user.user_ref.id,
        pending:          ['admin'],
        read_by:          ['user'],
        links:            extractedLinks,
        files:            [],
        type:             'chat',
        clientid:         SelectedChat['clientid'],
        ticketid:         SelectedChat['id'],
      };

      await updateDoc(chatCollectionRef, {
        chatstatus:        'Decision Making',
        last_modification: serverTimestamp(),
        last_pending:      ['admin'],
        last_read_by:      ['user'],
      });

      if (SelectedChat['status']['status'].toLowerCase() !== 'open') {
        await updateDoc(chatCollectionRef, {
          status: {
            status:   'Open',
            date:     serverTimestamp(),
            editedBy: this.user.profileid,
          },
        });
      }

      const batch = writeBatch(this.firestore);
      batch.set(chatSubCollectionRef, msgData);
      await batch
        .commit()
        .then(async () => console.log('Message sent successfully'))
        .catch((error) => console.log('error', error));

      this.updateSupportchatMessage(SelectedChat['id']);
      if (files.length !== 0) {
        this.uploadFiles(chatCollectionRef, chatSubCollectionRef, files);
      }
    }
  }

  async uploadFiles(
    chatCollectionRef: any,
    chatSubCollectionRef: any,
    files: any[]
  ): Promise<void> {
    const uploadedFiles: any[] = [];

    if (files.length !== 0) {
      console.log('file uploading...');

      for (let a = 0; a < files.length; a++) {
        const imageFile  = files[a];
        // Angular Fire v7 Storage: ref + uploadBytes + getDownloadURL
        const storageRef = ref(this.storage, 'Chat/' + imageFile.name + imageFile.lastModified + imageFile.size);
        const uploaded   = await uploadBytes(storageRef, imageFile);
        const imageURL   = await getDownloadURL(uploaded.ref);

        uploadedFiles.push({
          filename:  imageFile.name,
          filetype:  imageFile.type.split('/')[0] + '/' + imageFile.type.split('/')[1],
          fileurl:   imageURL,
          mediatype: imageFile.type.split('/')[0],
        });

        console.log('file uploading completed...');
      }

      await updateDoc(chatSubCollectionRef, {
        files: uploadedFiles ?? [],
        type:  uploadedFiles.length === 0 ? 'text' : uploadedFiles[0]['filetype'],
      })
        .then(() => console.log('file uploaded and updated successfully'))
        .catch((error) => console.log('Oops error while uploading files', error));

      await updateDoc(chatCollectionRef, {
        last_modification: serverTimestamp(),
        files:             uploadedFiles,
      })
        .then(() => console.log('file uploaded and updated successfully in main collection'))
        .catch((error) => console.log('Oops error while uploading files in main collection', error));
    } else {
      console.log('No files to upload');
    }
  }

  updateSupportchatMessage(chatid: string): void {
    getDocs(
      query(
        collection(this.firestore, 'clientissue', chatid, 'messages'),
        where('pending', 'array-contains', 'user'),
        orderBy('time', 'desc')
      )
    ).then((newData) => {
      console.log('Pending Message count', newData.docs.length);
      if (newData.docs.length !== 0) {
        newData.docs.forEach((d) => {
          updateDoc(d.ref, {
            read_by: arrayUnion('user'),
            pending: arrayRemove('user'),
          })
            .then(() => console.log('reciept updated successfully'))
            .catch((error) => console.log('Oops Error while updating reciept', error));
        });
      } else {
        console.log('No Messages to update..');
      }
    });
  }

  async sendMessage(sentmessage: string): Promise<void> {
    if (sentmessage === '' || sentmessage === '\n') {
      alert('Oops, Please type a message....');
    } else {
      console.log('Sending Message');

      const message    = sentmessage;
      this.stageMessage = '';
      const queuedocid = this.profileJourneyProduct['queueData']['docid'];
      const time       = new Date();
      const docID      = doc(collection(this.firestore, 'queue generation')).id;

      const chatCollectionRef    = doc(this.firestore, 'queue generation', queuedocid);
      const chatSubCollectionRef = doc(
        this.firestore, 'queue generation', queuedocid, 'stagechat', docID
      );

      const msgData = {
        docid:           docID,
        stage:           this.profileJourneyProduct['currentstage'],
        senderprofileid: this.user.profileid,
        message:         message,
        queueref:        chatCollectionRef,
        date:            time,
        pinned:          false,
      };

      const batch = writeBatch(this.firestore);
      batch.set(chatSubCollectionRef, msgData);
      await batch
        .commit()
        .then(async () => console.log('Message sent successfully'))
        .catch((error) => console.log('error', error));
    }
  }

  actionButton(data: any, stage: string): any {
    const queueData     = data;
    const stageproperty = queueData['stageproperty'][stage];

    if (stageproperty['actiontype'] === 'link') {
      return window.open(stageproperty['actionresource'], '_blank');
    } else if (stageproperty['actiontype'] === 'form') {
      const formId  = stageproperty['actionresource'].id ?? '';
      const queueId = queueData['docid'];
      return window.open(
        window.location.origin + '/formtemplate?id=' + formId + '&type=form&queueid=' + queueId,
        '_blank'
      );
    } else if (stageproperty['actiontype'] === 'videoask') {
      return null;
    } else if (stageproperty['actiontype'] === 'selfmovable') {
      // handle selfmovable
    }
  }

  scrollToCurrentStage(): void {
    if (
      !this.profileJourneyProduct ||
      !this.profileJourneyProduct['queueData'] ||
      !this.profileJourneyProduct['queueData']['stageproperty']
    ) {
      console.error('Stage property data is not available.');
      return;
    }

    const stageProperty = this.profileJourneyProduct['queueData']['stageproperty'];
    const currentStage  = this.profileJourneyProduct['currentstage'];

    if (!currentStage || !stageProperty[currentStage]) {
      console.error('Current stage is undefined or invalid.');
      return;
    }

    const stageGroup = stageProperty[currentStage]['stagegroup'];
    if (!stageGroup || !this.profileJourneyProduct['group'][stageGroup]) {
      console.error('Stage group is undefined or does not exist.');
      return;
    }

    const currentStageIndex = this.profileJourneyProduct['group'][stageGroup].indexOf(currentStage);
    if (currentStageIndex === -1) {
      console.error('Current stage index not found.');
      return;
    }

    console.log('Scrolling to stage index:', currentStageIndex);

    if (!this.stageElements || !this.stageElements.get(currentStageIndex)) {
      console.error('Stage elements are not available yet.');
      return;
    }

    setTimeout(() => {
      this.stageElements
        .get(currentStageIndex)
        ?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 500);
  }

  buttonLable(queuedata: any, stage: string): { type: string; buttonlabel: string } {
    const queueTokenData  = queuedata;
    const stageProperty   = this.profileJourneyProduct['queueData']['stageproperty'];
    let type: string;
    let buttonlabel: string;

    if (stageProperty[stage]['actiontype'] === 'link') {
      type        = 'link';
      buttonlabel = stageProperty[stage]['calltoaction'] ?? 'Open Link';
    } else if (stageProperty[stage]['actiontype'] === 'form') {
      type        = 'form';
      buttonlabel = stageProperty[stage]['calltoaction'] ?? 'Click to Fill Form';
    } else if (stageProperty[stage]['actiontype'] === 'videoask') {
      type        = 'videoask';
      // buttonlabel = stageProperty[stage]['calltoaction'] ?? "Open VideoAsk";
      buttonlabel = 'Open App to Uploading Video';
    } else if (stageProperty[stage]['selfmovable'] === true) {
      type        = 'selfmovable';
      buttonlabel = stageProperty[stage]['calltoaction'] ?? 'Ready for Next Stage';
    } else if ((stageProperty[stage]['compulsoryactivity'] ?? []).length !== 0) {
      type = 'activity';
      if (queueTokenData['status'] === 'instudio') {
        buttonlabel = 'In Studio';
      } else if (queueTokenData['queueposition'] != null) {
        buttonlabel = 'Queue Position' + queueTokenData['queueposition'];
      } else {
        buttonlabel = queueTokenData['status'] === 'ready' ? 'Awaiting' : 'In Queue';
      }
    } else {
      type        = 'default';
      buttonlabel = stageProperty[stage]['calltoaction'] ?? 'View All Stages';
    }

    return { type, buttonlabel };
  }

  toggleProductSection(journey: any): void {
    for (let i = 0; i < this.participantjourney.length; i++) {
      if (this.participantjourney[i]['docid'] === journey['docid']) {
        this.participantjourney[i].showProductSection = !this.participantjourney[i].showProductSection;
      } else {
        this.participantjourney[i].showProductSection = false;
      }
    }
  }

  downloadFiles(url: string): void {
    window.open(url, '_blank');
  }
}