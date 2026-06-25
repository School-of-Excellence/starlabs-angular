import { Component, ElementRef, OnDestroy, OnInit, QueryList,ViewChild, ViewChildren,inject,} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {Firestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot, writeBatch, DocumentReference,} from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TextFieldModule } from '@angular/cdk/text-field';
import { AuthguardService } from '../../authguard.service';
import { VideoPlayerComponent } from '../../video-player/video-player.component';
import { ParticipantEvolutionMappingComponent } from '../../EvolutionMapping/evolution-mapping/participant-evolution-mapping/participant-evolution-mapping.component';
import { FormtemplateComponent } from '../../Product Designer/delivery-set/formtemplate/formtemplate.component';
import { ListOpenviduRoomComponent } from '../../OpenVidu/list-openvidu-room/list-openvidu-room.component';
import { WebStudioInvitationComponent } from '../../web-studio-invitation/web-studio-invitation.component';
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
    ParticipantEvolutionMappingComponent,
    FormtemplateComponent,
    ListOpenviduRoomComponent,
    WebStudioInvitationComponent
  ],
})
export class QueueWebVersion1Component implements OnInit, OnDestroy {

  private auth      = inject(AuthguardService);
  private firestore = inject(Firestore);
  [x: string]: any;
  @ViewChildren('stageElement') stageElements!: QueryList<ElementRef>;
  private chatListUnsub:   (() => void) | null = null;
  private pinnedChatUnsub: (() => void) | null = null;
  private queueLiveUnsub:    (() => void) | null = null;
  private queueTokenUnsub:   (() => void) | null = null;
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
  showInlineForm: boolean = false;
  inlineFormId: string = null;
  inlineQueueId: string = null;
  hasOpenSlot: boolean = false;
  openSlotStageName: string | null = null;
  hasBookedSlot: boolean = false;
  bookedSlotStageName: string | null = null;
  bookedSlotData: any = null;
  bookedSlotTitle: string = '';
  bookedSlotDescription: string = '';

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
    this.queueTokenUnsub?.();
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  isInStudio(): boolean {
    return this.profileJourneyProduct?.['queuetoken']?.['status'] === 'instudio';
  }

  private async getParticipantSegments(): Promise<string[]> {
    const result: string[] = [];
  
    const listSnap = await getDocs(query(
      collection(this.firestore, 'participant list'),
      where('profilelist', 'array-contains', this.user.profileid)
    ));
  
    for (const doc of listSnap.docs) {
      const segmentIds: string[] = doc.data()['segmentid'] ?? [];
      for (const id of segmentIds) {
        if (!result.includes(id)) {
          result.push(id);
        }
      }
    }
  
    return result;
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

    console.log('lastFileref path:', lastFileref.path);
    console.log('queuetoken from lastFileref:', queuetoken.data());
    if (!queuetoken.exists()) {
        console.log('NO QUEUE TOKEN FOUND');
        this.loadingQueue = false;
        return;
    }

    this.profileJourneyProduct['queuetoken']   = queuetoken.data();
    this.profileJourneyProduct['currentstage'] = queuetoken.data()!['currentstage'];
    
    this.hasOpenSlot = await this.resolveOpenSlotForParticipant();

    // Fetch variation stages if variationid exists
    const variationId = queuetoken.data()!['variationid'];
    if (variationId) {
      const variationSnap = await getDoc(doc(this.firestore, 'queue variation', variationId));
      if (variationSnap.exists()) {
        this.profileJourneyProduct['variationStages'] = variationSnap.data()['stages'];
      }
    }

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

    // Live listener on queue token — registered AFTER queueData is set
    this.queueTokenUnsub?.();
    this.queueTokenUnsub = onSnapshot(lastFileref, async (tokenSnap) => {
      if (!tokenSnap.exists()) return;
      const tokenData = tokenSnap.data();

      const activeStages = this.profileJourneyProduct['variationStages'] 
        ?? this.profileJourneyProduct['queueData']?.['stages'];
      
      let newIndex = this.currentQueueStageIndex;
      if (activeStages) {
        const idx = activeStages.findIndex((e: any) => e === tokenData['currentstage']);
        newIndex = idx !== -1 ? idx : 0;
      }

      // Spread to new object reference to trigger Angular change detection
      this.profileJourneyProduct = {
        ...this.profileJourneyProduct,
        queuetoken: tokenData,
        currentstage: tokenData['currentstage'],
      };

      this.currentQueueStageIndex = newIndex;

      this.hasOpenSlot = await this.resolveOpenSlotForParticipant();
    });

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

            // Find the deliverable that references this token doc
            const tokenDocRef = tokenDoc.ref;
            const matchingDeliverySnap = await getDocs(
              query(
                collection(this.firestore, 'deliverables'),
                where('profileid', '==', this.user.profileid),
                where('type', '==', 'queue'),
                where('status', '==', 'ongoing'),
                where('fileref', 'array-contains', tokenDocRef)
              )
            );

            if (matchingDeliverySnap.docs.length === 0) {
              console.log('No matching deliverable for this live token, skipping...');
              continue;
            }

            const matchingDelivery = matchingDeliverySnap.docs[0].data();
            const participantproductid = matchingDelivery['participantproductid'];

            // Get the participantsproduct using the id from deliverable
            const correctPPSnap = await getDoc(
              doc(this.firestore, 'participantsproduct', participantproductid)
            );

            if (!correctPPSnap.exists()) {
              console.log('No participantsproduct found, skipping...');
              continue;
            }

            this.profileJourneyProduct['participantproductid']   = correctPPSnap.id;
            this.profileJourneyProduct['participantproductdata'] = correctPPSnap.data();
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

    
    // Use variation stages if available, otherwise fall back to all queue stages
    const activeStages = this.profileJourneyProduct['variationStages'] 
      ?? this.profileJourneyProduct['queueData']['stages'];
    this.profileJourneyProduct['activeStages'] = activeStages;

    // Set current stage index in timeline
    const stageIndex = activeStages.findIndex(
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
    this.hasOpenSlot = await this.resolveOpenSlotForParticipant();   
  }


  private buildStageSlotConfig(planning: any[],activeStages: string[],participantSegments: string[],variationId: string | null): { stageName: string; slotConfigured: boolean }[] {
    const now = new Date();
    const config = activeStages.map(s => ({ stageName: s, slotConfigured: false }));

    for (const plan of planning) {
      if (variationId && `${plan.variationid}` !== `${variationId}`) continue;

      const segments = plan.segments || [];

      for (const segment of segments) {
        const segmentId = `${segment.segmentid}`;
        const participantBelongsToSegment = participantSegments.includes(segmentId);

        if (!participantBelongsToSegment) continue;

        const slots = segment.slots || [];

        for (const slot of slots) {
          const endDate: Date = slot.enddate?.toDate ? slot.enddate.toDate() : new Date(slot.enddate);
          const slotAlreadyEnded = endDate <= now;

          if (slotAlreadyEnded) continue;

          const matchIndex = config.findIndex(c => c.stageName === slot.stagename);
          if (matchIndex >= 0) {
            config[matchIndex].slotConfigured = true;
          }
        }
      }
    }

    return config;
  }

  private findNextStageWithSlot(currentStageIndex: number,stageConfig: { stageName: string; slotConfigured: boolean }[]): { index: number; stageName: string | null } 
  {
    for (let i = currentStageIndex; i < stageConfig.length; i++) {
      if (stageConfig[i].slotConfigured) {
        return { index: i, stageName: stageConfig[i].stageName };
      }
    }
    return { index: -1, stageName: null };
  }

  async checkStageHasOpenSlot(stageName: string, participantSegments: string[]): Promise<boolean> {
    const queueId = this.profileJourneyProduct['queueData']['docid'];
    const variationId = this.profileJourneyProduct['queuetoken']['variationid'] ?? null;
    const selectedSlots = this.profileJourneyProduct['queuetoken']['selectedstageslot'] || {};
    const now = new Date();

    const alreadyBooked = selectedSlots[stageName] != null;
    if (alreadyBooked) return false;

    const snap = await getDocs(query(
      collection(this.firestore, 'queue planning'),
      where('queueid', '==', queueId)
    ));
    if (snap.empty) return false;

    const planning = snap.docs[0].data()['planning'] || [];

    for (const plan of planning) {
      if (variationId && `${plan.variationid}` !== `${variationId}`) continue;

      const segments = plan.segments || [];

      for (const segment of segments) {
        const segmentId = `${segment.segmentid}`;
        const participantBelongsToSegment = participantSegments.includes(segmentId);

        if (!participantBelongsToSegment) continue;

        const slots = segment.slots || [];

        for (const slot of slots) {
          const isWrongStage = slot.stagename !== stageName;
          if (isWrongStage) continue;

          const endDate: Date = slot.enddate?.toDate ? slot.enddate.toDate() : new Date(slot.enddate);
          const slotAlreadyEnded = endDate <= now;
          if (slotAlreadyEnded) continue;

          const maxslot: number = slot.maxslot ?? 0;
          const usedslot: number = slot.usedslot ?? 0;
          const isFull = maxslot !== 0 && usedslot >= maxslot;

          if (!isFull) return true;
        }
      }
    }

    return false;
  }

  private formatOrdinalDate(date: Date): string {
    const day = date.getDate();
    const suffix = (day % 10 === 1 && day !== 11) ? 'st'
      : (day % 10 === 2 && day !== 12) ? 'nd'
      : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${day}${suffix} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  private formatDayName(date: Date): string {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return days[date.getDay()];
  }

  private formatTime12Hour(date: Date): string {
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  getBookedSlotSummary(): string {
    if (!this.bookedSlotData) return '';

    const toDate = (d: any): Date | null => d?.toDate ? d.toDate() : (d ? new Date(d) : null);
    const start = toDate(this.bookedSlotData.startdate);
    const end = toDate(this.bookedSlotData.enddate);

    if (!start) return '';

    const sameDay = end && start.toDateString() === end.toDateString();

    if (!end || sameDay) {
      return `${this.formatOrdinalDate(start)} (${this.formatDayName(start)})`;
    }

    const sameMonthYear = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonthYear) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return `${start.getDate()}${this.getOrdinalSuffix(start.getDate())} & ${end.getDate()}${this.getOrdinalSuffix(end.getDate())} ${months[start.getMonth()]} ${start.getFullYear()} (${this.formatDayName(start)} & ${this.formatDayName(end)})`;
    }

    return `${this.formatOrdinalDate(start)} – ${this.formatOrdinalDate(end)}`;
  }

  private getOrdinalSuffix(day: number): string {
    return (day % 10 === 1 && day !== 11) ? 'st'
      : (day % 10 === 2 && day !== 12) ? 'nd'
      : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
  }

  getBookedSlotStartTime(): string {
    if (!this.bookedSlotData?.startdate) return '';
    const toDate = (d: any) => d?.toDate ? d.toDate() : new Date(d);
    return this.formatTime12Hour(toDate(this.bookedSlotData.startdate));
  }

  private async resolveBookedSlotDetails(): Promise<{ title: string; description: string }> {
    const empty = { title: '', description: '' };
    if (!this.bookedSlotData) return empty;

    const queueplanid = this.bookedSlotData['queueplanid'];
    const segmentid   = this.bookedSlotData['segmentid'];
    const stagename   = this.bookedSlotStageName;

    if (!queueplanid || !segmentid || !stagename) return empty;

    const planDoc = await getDoc(doc(this.firestore, 'queue planning', queueplanid));
    if (!planDoc.exists()) return empty;

    const bookedStart = this.bookedSlotData['startdate']?.toDate
      ? this.bookedSlotData['startdate'].toDate().getTime()
      : new Date(this.bookedSlotData['startdate']).getTime();

    const planning = planDoc.data()['planning'] || [];

    for (const plan of planning) {
      for (const segment of (plan.segments || [])) {
        if (`${segment.segmentid}` !== `${segmentid}`) continue;

        for (const slot of (segment.slots || [])) {
          if (slot.stagename !== stagename) continue;

          const slotStart = slot.startdate?.toDate
            ? slot.startdate.toDate().getTime()
            : new Date(slot.startdate).getTime();

          if (slotStart === bookedStart) {
            return { title: slot.title || '', description: slot.description || '' };
          }
        }
      }
    }

    return empty;
  }
  
  async resolveOpenSlotForParticipant(): Promise<boolean> {
    const queueData  = this.profileJourneyProduct?.['queueData'];
    const queueToken = this.profileJourneyProduct?.['queuetoken'];

    const resetOpen   = () => { this.openSlotStageName = null; };
    const resetBooked = () => { this.hasBookedSlot = false; this.bookedSlotStageName = null; this.bookedSlotData = null; };

    if (!queueData || !queueToken) {
      resetOpen(); resetBooked(); return false;
    }

    const queueId = queueData['docid'];
    if (!queueId) {
      resetOpen(); resetBooked(); return false;
    }

    const currentStage: string = queueToken['currentstage'];
    if (!currentStage) {
      resetOpen(); resetBooked(); return false;
    }

    const variationId: string | null = queueToken['variationid'] ?? null;
    const snap = await getDocs(query(
      collection(this.firestore, 'queue planning'),
      where('queueid', '==', queueId)
    ));
    if (snap.empty) {
      resetOpen(); resetBooked(); return false;
    }

    const planning = snap.docs[0].data()['planning'] || [];
    const activeStages: string[] = this.profileJourneyProduct['variationStages']
      ?? queueData['stages']
      ?? [];

    const currentStageIndex = activeStages.indexOf(currentStage);

    if (currentStageIndex === -1) {
      resetOpen(); resetBooked(); return false;
    }

    const participantSegments = await this.getParticipantSegments();
    const stageConfig = this.buildStageSlotConfig(planning, activeStages, participantSegments, variationId);
    const nextSlotStage = this.findNextStageWithSlot(currentStageIndex, stageConfig);

    if (nextSlotStage.index === -1 || !nextSlotStage.stageName) {
      resetOpen(); resetBooked(); return false;
    }

    const selectedSlots = queueToken['selectedstageslot'] || {};
    const bookedSlot    = selectedSlots[nextSlotStage.stageName];

    if (bookedSlot != null) {
      const bookedEnd: Date = bookedSlot.enddate?.toDate
        ? bookedSlot.enddate.toDate()
        : new Date(bookedSlot.enddate);

      const bookedSlotExpired = bookedEnd <= new Date();

      if (!bookedSlotExpired) {
    this.hasBookedSlot       = true;
    this.bookedSlotStageName = nextSlotStage.stageName;
    this.bookedSlotData      = bookedSlot;

    const { title, description } = await this.resolveBookedSlotDetails();
    this.bookedSlotTitle       = title;
    this.bookedSlotDescription = description;

    resetOpen();
    return false;
  }

      resetBooked();
    }

    resetBooked();

    const hasCapacity = await this.checkStageHasOpenSlot(nextSlotStage.stageName, participantSegments);
    this.openSlotStageName = hasCapacity ? nextSlotStage.stageName : null;
    return hasCapacity;
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
      this.inlineFormId  = stageproperty['actionresource'].id ?? '';
      this.inlineQueueId = data['docid'];
      this.showInlineForm = true;
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
    } else if (stageproperty[stage]['compulsoryactivity'] && Object.keys(stageproperty[stage]['compulsoryactivity']).length !== 0) {
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