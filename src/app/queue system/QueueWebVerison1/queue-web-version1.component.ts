import { Component, ElementRef, OnDestroy, OnInit, QueryList,ViewChild, ViewChildren,inject,} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {Firestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot, writeBatch, DocumentReference,} from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TextFieldModule } from '@angular/cdk/text-field';
import { AuthguardService } from '../../authguard.service';
import { VideoPlayerComponent } from '../../video-player/video-player.component';
@Component({
  selector: 'app-queue-web-version1',
  templateUrl: './queue-web-version1.component.html',
  styleUrls: ['./queue-web-version1.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    MatIconModule,
    MatButtonModule,
    TextFieldModule,
    VideoPlayerComponent,
  ],
})
export class QueueWebVersion1Component implements OnInit, OnDestroy {

  private auth      = inject(AuthguardService);
  private firestore = inject(Firestore);
  [x: string]: any;
  @ViewChildren('stageElement') stageElements!: QueryList<ElementRef>;
  private chatListUnsub:   (() => void) | null = null;
  private pinnedChatUnsub: (() => void) | null = null;
  private queueLiveUnsub:  (() => void) | null = null;  
  user: any = {};
  mapProfile:      Record<string, any> = {};
  mapproduct:      Record<string, any> = {};
  mapVideoTitle:   Record<string, any> = {};
  mapRecordedDate: Record<string, any> = {};
  profileJourneyProduct: Record<string, any> = {};
  chatList: Record<string, any[]> = {};
  pinnedChatList: any[] = [];
  liveEvolutionMapping:any[] = [];
  loadingQueue:boolean = true;
  currentQueueStageIndex:number  = 0;
  stageMessage:string  = '';

  constructor() {
    // Resolve user and profile map before fetching queue data
    this.auth.username().then((userdata: any) => {
      this.user = userdata;

      this.auth.getProfileMap().then((e: any) => {
        this.mapProfile = e.map;
      });

      // Product lookup
      getDocs(collection(this.firestore, 'products')).then((res) => {
        res.docs.forEach((d) => {
          const element = d.data();
          this.mapproduct[element['id']] = element['product'];
        });
      });

      // Kick off queue fetch after a brief delay (mirrors original)
      setTimeout(() => this.fetchOngoingQueue(), 500);
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.chatListUnsub?.();
    this.pinnedChatUnsub?.();
    this.queueLiveUnsub?.();  

  }

  async fetchOngoingQueue(): Promise<void> {
    this.loadingQueue = true;
    this.profileJourneyProduct = { group: {} };
    this.mapVideoTitle   = {};
    this.mapRecordedDate = {};

    const videoDocs = await getDocs( query( collection(this.firestore, 'evolutionmappingvideo'),where('profileid', '==', this.user.profileid) ) );
    videoDocs.docs.forEach((d) => {
        const data = d.data();
        this.mapVideoTitle[data['videourl']]   = data['title'];
        this.mapRecordedDate[data['videourl']] = data['recordeddate'];
    });

    //  Live evolution mapping 
    try {
        const liveSnap = await getDoc( doc(this.firestore, 'liveevolutionmapping', this.user.profileid)  );
        this.liveEvolutionMapping = [];
        if (liveSnap.exists()) {
          this.liveEvolutionMapping.push(liveSnap.data());
        }
    } catch (err) {
        console.error('Live evolution mapping error', err);
    }

    //Participant product (ongoing / Event Mode)
    const p_product = await getDocs( query( collection(this.firestore, 'participantsproduct'), where('profileid', '==', this.user.profileid),  where('mode', '==', 'Event Mode'),  where('status', '==', 'ongoing'), limit(1) ) );

    if (p_product.docs.length === 0) {
        console.log('No Ongoing Events');
        this.loadingQueue = false;
        return;
    }

    this.profileJourneyProduct['participantproductid']   = p_product.docs[0].id;
    this.profileJourneyProduct['participantproductdata'] = p_product.docs[0].data();

    //  Deliverables 
    const delivery = await getDocs(  query( collection(this.firestore, 'deliverables'),  where('participantproductid', '==', this.profileJourneyProduct['participantproductid']), where('type', '==', 'queue'),  where('status', '==', 'ongoing') ) );

    if (delivery.docs.length === 0) {
        console.log('No Deliverables');
        this.loadingQueue = false;
        return;
    }

    this.profileJourneyProduct['deliverables'] = delivery.docs[0].data();

    //Queue token 
    const filerefArray = this.profileJourneyProduct['deliverables']['fileref'];
    const lastFileref  = filerefArray[filerefArray.length - 1] as DocumentReference;
    const queuetoken   = await getDoc(lastFileref);

    if (!queuetoken.exists()) {
        console.log('NO QUEUE TOKEN FOUND');
        this.loadingQueue = false;
        return;
    }

    this.profileJourneyProduct['queuetoken']   = queuetoken.data();
    this.profileJourneyProduct['currentstage'] = queuetoken.data()!['currentstage'];

    // Queue data 
    const queueDocRef = this.profileJourneyProduct['queuetoken']['queueref'] as DocumentReference;

    // One-time read to bootstrap queueData
    const queueDataSnap = await getDoc(queueDocRef);

    if (!queueDataSnap.exists()) {
        console.log('No Queue Data');
        this.loadingQueue = false;
        return;
    }

    this.profileJourneyProduct['queueData'] = queueDataSnap.data() ?? {};

    //  Check if this queue is actually live 
    const now        = new Date();
    const startDate  = this.profileJourneyProduct['queueData']['queuestartdate']?.toDate() as Date;
    const endDate    = this.profileJourneyProduct['queueData']['queueenddate']?.toDate() as Date;
    const isLive     = startDate && endDate && now >= startDate && now <= endDate;

    if (!isLive) {
        console.log('Resolved queue is not live. Searching for correct live queue token...');

        // Scan all active queue_token docs for this participant
        const allTokensSnap = await getDocs( query(  collection(this.firestore, 'queue_token'), where('profile_id', '==', this.user.profileid), where('tokenstatus', '==', 'Active')) );

        let liveTokenFound = false;

        for (const tokenDoc of allTokensSnap.docs) {
        const tokenData        = tokenDoc.data();
        const linkedQueueSnap  = await getDoc(tokenData['queueref'] as DocumentReference);

        if (!linkedQueueSnap.exists()) continue;

        const linkedQueueData  = linkedQueueSnap.data()!;
        const lStart: Date     = linkedQueueData['queuestartdate']?.toDate();
        const lEnd: Date       = linkedQueueData['queueenddate']?.toDate();
        const linkedIsLive     = lStart && lEnd && now >= lStart && now <= lEnd;

        if (linkedIsLive) {
            console.log('Found live queue:', linkedQueueData['queuename']);

            // Re-fetch participantsproduct linked to this live queue token
            const correctPPSnap = await getDocs(
            query(  collection(this.firestore, 'participantsproduct'),  where('profileid', '==', this.user.profileid), where('mode', '==', 'Event Mode'), where('status', '==', 'ongoing'), limit(1) ) );

            if (correctPPSnap.docs.length === 0) break;

            this.profileJourneyProduct['participantproductid']   = correctPPSnap.docs[0].id;
            this.profileJourneyProduct['participantproductdata'] = correctPPSnap.docs[0].data();
            this.profileJourneyProduct['queueData']              = linkedQueueData;
            this.profileJourneyProduct['queuetoken']             = tokenData;
            this.profileJourneyProduct['currentstage']           = tokenData['currentstage'];

            liveTokenFound = true;
            break;
        }
        }

        if (!liveTokenFound) {
        console.log('No live queue found for this participant.');
        this.loadingQueue = false;
        return;
        }
    }

    // Realtime listener
    this.queueLiveUnsub?.();
    this.queueLiveUnsub = onSnapshot(
        this.profileJourneyProduct['queuetoken']['queueref'] as DocumentReference,
        (snap) => {
        if (!snap.exists()) {
            console.log('Queue document removed');
            this.profileJourneyProduct = { group: {} };
            this.loadingQueue = false;
            return;
        }

        const data = snap.data();
        const snapNow = new Date();
        const snapStart = data['queuestartdate']?.toDate() as Date;
        const snapEnd = data['queueenddate']?.toDate() as Date;
        const snapIsLive = snapStart && snapEnd && snapNow >= snapStart && snapNow <= snapEnd;

        if (!snapIsLive) {
            console.log('Queue is no longer live (outside date range)');
            this.profileJourneyProduct = { group: {} };
            this.loadingQueue = false;
            return;
        }

        // Queue is still live — keep queueData fresh
        this.profileJourneyProduct['queueData'] = data;
        }
    );

    // Set current stage index in timeline
    const stageIndex = this.profileJourneyProduct['queueData']['stages'].findIndex(
        (e: any) => e === this.profileJourneyProduct['currentstage']
    );
    this.currentQueueStageIndex = stageIndex !== -1 ? stageIndex : 0;

    //  Build stage groups 
    const stagegroup = this.profileJourneyProduct['queueData']['stagegroup'] ?? {};
    for (const index in stagegroup) {
      const groupName     = stagegroup[index];
      const stageproperty = this.profileJourneyProduct['queueData']['stageproperty'] ?? {};
      const groupedStages = Object.keys(stageproperty).filter((key) => stageproperty[key]['stagegroup'] === groupName);

      const indexMap = new Map<any, number>();
      this.profileJourneyProduct['queueData']['stages'].forEach((item: any, idx: number) => {
        indexMap.set(item, idx);
        });
        const sortedFinal = groupedStages.sort( (x, y) => (indexMap.get(x) ?? 0) - (indexMap.get(y) ?? 0) );

        if (!Object.keys(this.profileJourneyProduct['group']).includes(groupName)) {
            this.profileJourneyProduct['group'][groupName] = sortedFinal;
        }
    }

    //  Stage chat — realtime listener 
    const stageChatCol = collection(
        doc(this.firestore, 'queue generation', this.profileJourneyProduct['queueData']['docid']),
        'stagechat'
    );

    // Unsubscribe previous listeners if any
    this.chatListUnsub?.();
    this.pinnedChatUnsub?.();

    this.chatListUnsub = onSnapshot(
        query(stageChatCol, orderBy('date', 'desc')),
        (chatsnap) => {
        this.chatList = {};
        for (const stage of this.profileJourneyProduct['queueData']['stages']) {
            this.chatList[stage] = [];
        }
        chatsnap.docs.forEach((d) => {
            const element = d.data();
            if (!this.chatList[element['stage']]) {
            this.chatList[element['stage']] = [];
            }
            this.chatList[element['stage']].push(element);
        });
        }
    );

    this.pinnedChatUnsub = onSnapshot( query( stageChatCol, where('senderprofileid', '==', this.user.profileid),  where('pinned', '==', true), orderBy('date', 'desc')), (snap) => {this.pinnedChatList = snap.docs.map((d) => d.data()); } );
    this.loadingQueue = false;
}

  
  isDifferentDay(msgA: any, msgB: any): boolean {
    const dateA = msgA?.['date']?.toDate();
    const dateB = msgB?.['date']?.toDate();
    if (!dateA || !dateB) return false;
    return (
      dateA.getFullYear() !== dateB.getFullYear() ||
      dateA.getMonth()    !== dateB.getMonth()    ||
      dateA.getDate()     !== dateB.getDate()
    );
  }

  onEnterKey(event: KeyboardEvent): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage(this.stageMessage);
    }
  }

  async sendMessage(sentmessage: string): Promise<void> {
    const trimmed = sentmessage?.trim();
    if (!trimmed || trimmed === '\n') {
      alert('Oops, Please type a message….');
      return;
    }

    this.stageMessage = '';

    const queuedocid = this.profileJourneyProduct['queueData']['docid'];
    const time = new Date();
    const docID = doc(collection(this.firestore, 'queue generation')).id;
    const chatCollectionRef = doc(this.firestore, 'queue generation', queuedocid);
    const chatSubCollectionRef = doc(
      this.firestore, 'queue generation', queuedocid, 'stagechat', docID
    );

    const msgData = {
      docid:docID,
      stage:this.profileJourneyProduct['currentstage'],
      senderprofileid:this.user.profileid,
      message:trimmed,
      queueref:chatCollectionRef,
      date: time,
      pinned: false,
    };
    const batch = writeBatch(this.firestore);
    batch.set(chatSubCollectionRef, msgData);
    await batch .commit() .then(() => console.log('Message sent successfully')) .catch((err) => console.error('Send message error', err));
  }

  
  actionButton(data: any, stage: string): void {
    const stageproperty = data['stageproperty'][stage];

    if (stageproperty['actiontype'] === 'link') {
      window.open(stageproperty['actionresource'], '_blank');
    } else if (stageproperty['actiontype'] === 'form') {
      const formId  = stageproperty['actionresource'].id ?? '';
      const queueId = data['docid'];
      window.open(
        window.location.origin + '/formtemplate?id=' + formId + '&type=form&queueid=' + queueId,
        '_blank'
      );
    } else if (stageproperty['actiontype'] === 'videoask') {
      // handle videoask — no-op for now
    } else if (stageproperty['selfmovable'] === true) {
      // handle selfmovable
    }
  }

  
  buttonLable(queuedata: any, stage: string): { type: string; buttonlabel: string } {
    const stageproperty  = this.profileJourneyProduct['queueData']['stageproperty'];
    const queueTokenData = this.profileJourneyProduct['queuetoken'];
    let type: string;
    let buttonlabel: string;

    if (stageproperty[stage]['actiontype'] === 'link') {
      type        = 'link';
      buttonlabel = stageproperty[stage]['calltoaction'] ?? 'Open Link';
    } else if (stageproperty[stage]['actiontype'] === 'form') {
      type        = 'form';
      buttonlabel = stageproperty[stage]['calltoaction'] ?? 'Click to Fill Form';
    } else if (stageproperty[stage]['actiontype'] === 'videoask') {
      type        = 'videoask';
      buttonlabel = 'Open App to Upload Video';
    } else if (stageproperty[stage]['selfmovable'] === true) {
      type        = 'selfmovable';
      buttonlabel = stageproperty[stage]['calltoaction'] ?? 'Ready for Next Stage';
    } else if ((stageproperty[stage]['compulsoryactivity'] ?? []).length !== 0) {
      type = 'activity';
      if (queueTokenData['status'] === 'instudio') {
        buttonlabel = 'In Studio';
      } else if (queueTokenData['queueposition'] != null) {
        buttonlabel = 'Queue Position ' + queueTokenData['queueposition'];
      } else {
        buttonlabel = queueTokenData['status'] === 'ready' ? 'Awaiting' : 'In Queue';
      }
    } else {
      type        = 'default';
      buttonlabel = stageproperty[stage]['calltoaction'] ?? 'View All Stages';
    }

    return { type, buttonlabel };
  }
}