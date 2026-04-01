import { Component, OnInit, OnDestroy } from '@angular/core';
import { Firestore, collection, getDocs, query, where, addDoc, limit, DocumentReference, orderBy } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { trigger, transition, style, animate } from '@angular/animations';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { HttpClient } from '@angular/common/http';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { SendmessagesComponent } from '../workshop-dashboard/sendmessages/sendmessages.component';
import { SnackbarService } from '../../shared/snackbar.service';
import { AuthguardService } from '../../authguard.service';
import { environment } from '../../../environments/environment.development';

interface JourneyDisplay {
  id: string; name: string; count: number; engaged: number;
  engagedParticipants?: any[]; notEngagedParticipants?: any[];
}

interface EventDisplay {
  id: string; name: string; date: Date; engagedCount: number; notEngagedCount: number;
  engagedParticipants: any[]; notEngagedParticipants: any[];
}

interface AppointmentDisplay {
  id: string; name: string; engagedCount: number; notEngagedCount: number;
  engagedParticipants: any[]; notEngagedParticipants: any[];
}

type FilterType = 'product' | 'event' | 'both';
type StatusMode = 'active' | 'inactive';
type PanelType = 'engaged' | 'not-engaged' | 'all' | '';
type EventTab = 'journey' | 'individual' | 'appointment';

@Component({
  selector: 'app-engagement-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatProgressBarModule, MatIconModule, MatCardModule,
    MatExpansionModule, MatChipsModule, MatButtonModule, RouterModule,
    MatButtonToggleModule, MatSelectModule, MatFormFieldModule, MatMenuModule,
    MatRadioModule, MatTooltipModule, MatProgressSpinnerModule
  ],
  templateUrl: './engagement-dashboard.component.html',
  styleUrl: './engagement-dashboard.component.css',
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class EngagementDashboardComponent implements OnInit, OnDestroy {
  readonly months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  selectedMonth = this.months[new Date().getMonth()];
  currentMonth = new Date().getMonth();
  currentYear = new Date().getFullYear();
  monthPickerYear = this.currentYear;
  loading = true;
  monthPickerOpen = false;
  engagementFilter: FilterType = 'both';
  participantStatusMode: StatusMode = 'active';
  selectedEventTab: EventTab = 'journey';
  today = new Date();
  
  panelVisible = false;
  panelTitle = '';
  panelSubtitle = '';
  panelParticipants: any[] = [];
  panelType: PanelType = '';
  panelOrigin: 'product' | 'event' | '' = '';
  showPanelFilter = false;
  showPanelFilterDropdown = false;
  panelEventFilter = 'all';

  
  isSnapshotLocked = false;
  savedSnapshot: any = null;
  snapshotStatus = 'live';
  isSavingSnapshot = false;

  overview = { activeParticipants: 0, engaged: 0, notEngaged: 0, engagementRate: 0 };
  journeysDisplay: JourneyDisplay[] = [];
  journeysCombinedDisplay: JourneyDisplay[] = [];
  journeysEventDisplay: JourneyDisplay[] = [];
  journeysAppointmentDisplay: JourneyDisplay[] = [];
  eventEngagementDisplay: EventDisplay[] = [];
  appointmentEngagementDisplay: AppointmentDisplay[] = [];
  eventsDisplay: any[] = [];
  appointmentsDisplay: any[] = [];
  allActiveParticipants: any[] = [];
  allEngagedParticipantsGlobal: any[] = [];
  allNotEngagedParticipantsGlobal: any[] = [];

  private journeyIdToName: Record<string, string> = {};
  private participantsCache: any[] = [];
  private eventsCache: any[] = [];
  private appointmentsCache: any[] = [];
  private appointmentTypeNamesCache: Record<string, string> = {};
  private participantMetadataCache = new Map<string, any>();
  private cacheLoaded = { journeys: false, participants: false, events: false, appointments: false };
  
  private currentMonthEventRefs: DocumentReference[] = [];
  private currentMonthWorkshopRefs: DocumentReference[] = [];

  private destroy$ = new Subject<void>();
  private currentLoadController: AbortController | null = null;
  private monthChangeTimeout: any = null;

  constructor(
    private router: Router,
    private firestore: Firestore,
    private http: HttpClient,
    private snackbarService: SnackbarService,
    private storage: Storage,
    public dialog: MatDialog,
    private guard: AuthguardService,
  ) {}

  async ngOnInit() {
    this.loading = true;
    try {
      await this.loadStaticData();
      if (await this.loadSnapshotIfExists(this.getMonthKey())) {
        this.loading = false;
        return;
      }
      
      this.snapshotStatus = 'live';
      this.filterEventsForMonth();
      this.filterAppointmentsForMonth();
      await this.updateForMonth();
      this.loading = false;
      this.loadEngagementDataInBackground();
      
    } catch (error) {
      console.error('error:', error);
      this.loading = false;
    }
  }

  private async loadEngagementDataInBackground() {
    try {
      await Promise.all([
        this.eventsDisplay.length > 0 ? this.fetchEventEngagement() : Promise.resolve(),
        this.appointmentsDisplay.length > 0 ? this.fetchAppointmentEngagement() : Promise.resolve()
      ]);
      this.recalculateBreakdowns();
    } catch (error) {
      console.error('error:', error);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentLoadController?.abort();
    clearTimeout(this.monthChangeTimeout);
  }

  private canonical = (pid: any) => String(pid).trim();
  
  private parseDate(val: any): Date {
    if (!val) return new Date(0);
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    return new Date(val);
  }

  private getMonthRange() {
    const start = new Date(this.currentYear, this.currentMonth, 1);
    const end = new Date(this.currentYear, this.currentMonth + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  private getMonthKey = () => `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}`;
  getMonthLabel = () => `${this.months[this.currentMonth]} ${this.currentYear}`;
  getMonthPickerYear = () => this.monthPickerYear;
  private async loadStaticData() {
    await Promise.all([
      this.fetchJourneyNames(),
      this.fetchParticipants(),
      this.fetchAllEvents(),
      this.fetchAllAppointments(),
      this.fetchAppointmentTypeNames()
    ]);
  }

  private async loadDynamicData() {
    this.filterEventsForMonth();
    this.filterAppointmentsForMonth();
    await this.updateForMonth();
    await Promise.all([
      this.eventsDisplay.length > 0 ? this.fetchEventEngagement() : Promise.resolve(),
      this.appointmentsDisplay.length > 0 ? this.fetchAppointmentEngagement() : Promise.resolve()
    ]);
    this.recalculateBreakdowns();
  }

  private recalculateBreakdowns() {
    this.calculateCombinedJourneyBreakdown();
    this.calculateJourneyEventBreakdown();
    this.calculateJourneyAppointmentBreakdown();
  }

  private async fetchJourneyNames() {
    if (this.cacheLoaded.journeys) return;
    const snap = await getDocs(collection(this.firestore, 'journey'));
    snap.docs.forEach(doc => this.journeyIdToName[doc.id] = doc.data()['journey']);
    this.cacheLoaded.journeys = true;
  }

  private async fetchParticipants() {
    if (this.cacheLoaded.participants) return this.participantsCache;
    const snap = await getDocs(collection(this.firestore, 'participant metadata'));
    this.participantsCache = [];
    this.participantMetadataCache.clear();
    snap.docs.forEach(doc => {
      const data = doc.data();
      this.participantsCache.push(data);
      this.participantMetadataCache.set(data['profileid'] || doc.id, data);
    });
    this.cacheLoaded.participants = true;
    return this.participantsCache;
  }

  private async fetchAllEvents() {
    if (this.cacheLoaded.events) return this.eventsCache;
    const [live, queue, workshop] = await Promise.all([
      getDocs(collection(this.firestore, 'event collection')),
      getDocs(collection(this.firestore, 'queue generation')),
      getDocs(collection(this.firestore, 'workshopconfiguration'))
    ]);
    this.eventsCache = [
      ...live.docs.map(d => ({ id: d.id, ref: d.ref, name: d.data()['name'], type: 'live', startDate: this.parseDate(d.data()['start_date']), endDate: null })),
      ...queue.docs.map(d => ({ id: d.id, ref: d.ref, name: d.data()['queuename'], type: 'queue', startDate: this.parseDate(d.data()['queuestartdate']), endDate: this.parseDate(d.data()['queueenddate']) })),
      ...workshop.docs.map(d => ({ id: d.id, ref: d.ref, name: d.data()['detailpage']?.['title'] || '(Untitled)', type: 'workshop', startDate: this.parseDate(d.data()['detailpage']?.['workshopStartDate']), endDate: null }))
    ];
    this.cacheLoaded.events = true;
    return this.eventsCache;
  }

  private async fetchAllAppointments() {
    if (this.cacheLoaded.appointments) return this.appointmentsCache;
    const snap = await getDocs(collection(this.firestore, 'appointments'));
    this.appointmentsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    this.cacheLoaded.appointments = true;
    return this.appointmentsCache;
  }

  private async fetchAppointmentTypeNames() {
    const snap = await getDocs(collection(this.firestore, 'appointmenttype'));
    snap.docs.forEach(doc => this.appointmentTypeNamesCache[doc.id] = doc.data()['appointmenttype'] || doc.id);
  }

  private filterEventsForMonth() {
    const { start, end } = this.getMonthRange();
    this.currentMonthEventRefs = [];
    this.currentMonthWorkshopRefs = [];
    this.eventsDisplay = this.eventsCache.filter(ev => {
      if (!ev.startDate || isNaN(ev.startDate.getTime())) return false;
      
      let inRange = false;
      
      if (ev.type === 'queue' && ev.endDate && !isNaN(ev.endDate.getTime())) {
        inRange = ev.startDate <= end && ev.endDate >= start;
      } else {
        inRange = ev.startDate >= start && ev.startDate <= end;
      }
      
      if (inRange) {
        (ev.type === 'workshop' ? this.currentMonthWorkshopRefs : this.currentMonthEventRefs).push(ev.ref);
      }
      return inRange;
    }).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  private filterAppointmentsForMonth() {
    const { start, end } = this.getMonthRange();
    this.appointmentsDisplay = this.appointmentsCache.map(appt => {
      const date = this.parseDate(appt.appointmentstart);
      const typeId = appt.appointment?.id || (typeof appt.appointment === 'string' ? appt.appointment.split('/').pop() : '');
      return {
        id: appt.id, appointmentTypeId: typeId, name: this.appointmentTypeNamesCache[typeId] || 'Unknown',
        date, bookedby: appt.bookedby, cancelled: appt.cancelled,
        profileId: appt.bookedby?.id || (typeof appt.bookedby === 'string' ? appt.bookedby.split('/').pop() : '')
      };
    }).filter(a => a.date >= start && a.date <= end).sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private async updateForMonth() {
    const { start, end } = this.getMonthRange();
    const participants = await this.fetchParticipants();
    const isActive = this.participantStatusMode === 'active';
    
    const targetProfiles = participants.filter(p => {
      if (isActive) return p['customerstatus'] === 'active';
      if (p['customerstatus'] !== 'non active' || !p['lastsubscriptionend']) return false;
      return this.parseDate(p['lastsubscriptionend']) < new Date();
    });

    const targetProfileMap = new Map(targetProfiles.map(p => [p['profileid'], p]));
    const targetProfileIds = new Set(targetProfiles.map(p => p['profileid']));
    const analyticsSnap = await getDocs(query(
      collection(this.firestore, 'content analytics'),
      where('logdate', '>=', start),
      where('logdate', '<=', end),
      orderBy('logdate', 'desc')
    ));
    const engagedProfileSet = new Set<string>();
    const profileToLatestContent = new Map<string, any>();
    
    for (const doc of analyticsSnap.docs) {
      const log = doc.data();
      const pid = log['profileid'];
      if (!targetProfileIds.has(pid)) continue;
      engagedProfileSet.add(pid);
      if (!profileToLatestContent.has(pid)) {
        profileToLatestContent.set(pid, log);
      }
    }

    this.overview = {
      activeParticipants: targetProfiles.length,
      engaged: engagedProfileSet.size,
      notEngaged: targetProfiles.length - engagedProfileSet.size,
      engagementRate: targetProfiles.length > 0 ? Math.round((engagedProfileSet.size / targetProfiles.length) * 100) : 0
    };

    const journeyMap: Record<string, string[]> = {};
    this.allActiveParticipants = [];
    this.allEngagedParticipantsGlobal = [];
    this.allNotEngagedParticipantsGlobal = [];

    targetProfiles.forEach(p => {
      const pid = p['profileid'];
      const journeyId = isActive ? p['activejourney'] : p['lastcompletedjourney'];
      if (journeyId) {
        if (!journeyMap[journeyId]) journeyMap[journeyId] = [];
        journeyMap[journeyId].push(pid);
      }

      const lastActivity = profileToLatestContent.get(pid);
      const subEndField = isActive ? p['subscriptionend'] : p['lastsubscriptionend'];
      
      const participantData = {
        name: p['name'] || pid, profileid: pid,
        journeyName: this.journeyIdToName[journeyId] || journeyId || 'N/A',
        subscriptionEnd: subEndField ? this.parseDate(subEndField) : null,
        lastContent: lastActivity ? (lastActivity['videoname'] || lastActivity['contentname'] || lastActivity['videoid'] || '(No data)') : 'No activity this month',
        lastDate: lastActivity ? this.parseDate(lastActivity['logdate']) : null,
        status: engagedProfileSet.has(pid) ? 'engaged' : 'not-engaged'
      };
      
      this.allActiveParticipants.push(participantData);
      (engagedProfileSet.has(pid) ? this.allEngagedParticipantsGlobal : this.allNotEngagedParticipantsGlobal).push(participantData);
    });

    this.journeysDisplay = Object.entries(journeyMap).map(([id, ids]) => {
      const engaged = ids.filter(pid => engagedProfileSet.has(pid));
      const notEngaged = ids.filter(pid => !engagedProfileSet.has(pid));
      return {
        id, name: this.journeyIdToName[id] ?? id, count: ids.length, engaged: engaged.length,
        engagedParticipants: engaged.map(pid => this.buildParticipant(targetProfileMap.get(pid), profileToLatestContent.get(pid), id)),
        notEngagedParticipants: notEngaged.map(pid => this.buildParticipant(targetProfileMap.get(pid), null, id))
      };
    });
  }

  private buildParticipant(p: any, lastContent: any, journeyId: string) {
    return {
      name: p?.['name'] || p?.['profileid'], profileid: p?.['profileid'],
      journeyName: this.journeyIdToName[journeyId] ?? journeyId,
      lastContent: lastContent ? (lastContent['videoname'] || lastContent['contentname'] || '(No data)') : 'No activity this month',
      lastDate: lastContent ? this.parseDate(lastContent['logdate']) : null
    };
  }

  private async fetchEventEngagement() {
    const eventIds = this.eventsDisplay.map(e => e.id);
    if (!eventIds.length) { this.eventEngagementDisplay = []; return; }
    const targetPidSet = new Set(this.allActiveParticipants.map(p => this.canonical(p.profileid)));
    const profileMap = new Map(this.allActiveParticipants.map(p => [this.canonical(p.profileid), p]));
    const { start, end } = this.getMonthRange();
    const queueEvents = this.eventsDisplay.filter(e => e.type === 'queue');
    const liveEvents = this.eventsDisplay.filter(e => e.type === 'live');
    const workshopEvents = this.eventsDisplay.filter(e => e.type === 'workshop');

    const queueRefs = queueEvents.map(e => e.ref);
    const liveRefs = liveEvents.map(e => e.ref);
    const workshopRefs = workshopEvents.map(e => e.ref);
    const [liveSnap, workshopSnap, queueTokenSnap, queueStageLogSnap] = await Promise.all([
      liveRefs.length ? getDocs(query(collection(this.firestore, 'event participation request'), where('eventref', 'in', liveRefs))) : { docs: [] },
      workshopRefs.length ? getDocs(query(collection(this.firestore, 'workshop participant enrolled'), where('workshopref', 'in', workshopRefs))) : { docs: [] },
      queueRefs.length ? getDocs(query(collection(this.firestore, 'queue_token'), where('queueref', 'in', queueRefs))) : { docs: [] },
      queueRefs.length ? getDocs(query(collection(this.firestore, 'queue stage log'), where('queueref', 'in', queueRefs))) : { docs: [] }
    ]);

    const liveRequests = liveSnap.docs.map(d => d.data()).filter(r => 
      r['eventref']?.id && eventIds.includes(r['eventref'].id) && targetPidSet.has(this.canonical(r['profileid']))
    );
    const workshopRequests = workshopSnap.docs.map(d => d.data()).filter(r => 
      r['workshopref']?.id && eventIds.includes(r['workshopref'].id) && targetPidSet.has(this.canonical(r['profileid']))
    );
    const queueTokensByQueue = new Map<string, any[]>();
    queueTokenSnap.docs.forEach(d => {
      const data = d.data();
      const queueId = data['queueref']?.id;
      const profileId = this.canonical(data['profile_id']);
      if (queueId && targetPidSet.has(profileId)) {
        if (!queueTokensByQueue.has(queueId)) queueTokensByQueue.set(queueId, []);
        queueTokensByQueue.get(queueId)!.push({ ...data, profile_id: profileId });
      }
    });
    const queueStageLogsByProfileAndQueue = new Map<string, any[]>();
    queueStageLogSnap.docs.forEach(d => {
      const data = d.data();
      const queueId = data['queueref']?.id;
      const profileId = this.canonical(data['profile_id']);
      const logDate = this.parseDate(data['logdate']);
      if (queueId && profileId && logDate >= start && logDate <= end) {
        const hasForm = !!data['formref'];
        const hasVideoAsk = data['videoaskref'] && Array.isArray(data['videoaskref']) && data['videoaskref'].length > 0;
        const hasLiveAssignment = !!data['liveassignmentid'];
        
        if (hasForm || hasVideoAsk || hasLiveAssignment) {
          const key = `${profileId}_${queueId}`;
          if (!queueStageLogsByProfileAndQueue.has(key)) queueStageLogsByProfileAndQueue.set(key, []);
          queueStageLogsByProfileAndQueue.get(key)!.push({
            ...data,
            profile_id: profileId,
            queueId,
            logDate,
            activityType: hasForm ? 'form' : hasVideoAsk ? 'videoask' : 'live_assignment',
            hasForm,
            hasVideoAsk,
            hasLiveAssignment
          });
        }
      }
    });
    this.eventEngagementDisplay = this.eventsDisplay.map(event => {
      if (event.type === 'queue') {
        const tokens = queueTokensByQueue.get(event.id) || [];
        const engagedParticipants: any[] = [];
        const notEngagedParticipants: any[] = [];

        tokens.forEach(token => {
          const profileId = token.profile_id;
          const basic = profileMap.get(profileId) || { profileid: profileId, name: profileId };
          const key = `${profileId}_${event.id}`;
          const logs = queueStageLogsByProfileAndQueue.get(key) || [];
          const isTokenActive = token['tokenstatus'] === 'Active';
          const hasActivityInMonth = logs.length > 0;
          const activities: string[] = [];
          let lastActivityDate: Date | null = null;
          
          logs.forEach(log => {
            if (log.hasForm) activities.push('Form');
            if (log.hasVideoAsk) activities.push('VideoAsk');
            if (log.hasLiveAssignment) activities.push('Live Assignment');
            if (!lastActivityDate || log.logDate > lastActivityDate) {
              lastActivityDate = log.logDate;
            }
          });
          
          const uniqueActivities = [...new Set(activities)];
          
          const participantData = {
            name: basic.name,
            profileid: profileId,
            journeyName: basic.journeyName || '',
            eventName: event.name,
            queueName: event.name,
            tokenstatus: token['tokenstatus'],
            activities: uniqueActivities,
            activityDetails: uniqueActivities.join(', ') || 'No activity',
            lastActivityDate,
            logsCount: logs.length
          };
          if (isTokenActive && hasActivityInMonth) {
            engagedParticipants.push(participantData);
          } else {
            notEngagedParticipants.push(participantData);
          }
        });

        return {
          id: event.id,
          name: event.name,
          date: event.startDate,
          engagedCount: engagedParticipants.length,
          notEngagedCount: notEngagedParticipants.length,
          engagedParticipants,
          notEngagedParticipants
        };

      } else if (event.type === 'workshop') {
        const requests = workshopRequests.filter(r => r['workshopref']?.id === event.id);
        const engaged = requests.filter(r => ['enrolled', 'enrollednotstarted'].includes(r['status']));
        const notEngaged: any[] = [];

        const mapParticipant = (req: any) => {
          const basic = profileMap.get(this.canonical(req['profileid'])) || { profileid: req['profileid'], name: req['profileid'] };
          return { name: basic.name, profileid: basic.profileid, journeyName: basic.journeyName || '', eventName: event.name };
        };

        return {
          id: event.id,
          name: event.name,
          date: event.startDate,
          engagedCount: engaged.length,
          notEngagedCount: notEngaged.length,
          engagedParticipants: engaged.map(mapParticipant),
          notEngagedParticipants: notEngaged.map(mapParticipant)
        };

      } else {
        const requests = liveRequests.filter(r => r['eventref']?.id === event.id);
        const engaged = requests.filter(r => r['status'] === 'attended');
        const notEngaged = requests.filter(r => ['unattended', 'approved'].includes(r['status']));

        const mapParticipant = (req: any) => {
          const basic = profileMap.get(this.canonical(req['profileid'])) || { profileid: req['profileid'], name: req['profileid'] };
          return { name: basic.name, profileid: basic.profileid, journeyName: basic.journeyName || '', eventName: event.name };
        };

        return {
          id: event.id,
          name: event.name,
          date: event.startDate,
          engagedCount: engaged.length,
          notEngagedCount: notEngaged.length,
          engagedParticipants: engaged.map(mapParticipant),
          notEngagedParticipants: notEngaged.map(mapParticipant)
        };
      }
    });
  }

  private async fetchAppointmentEngagement() {
    if (!this.appointmentsDisplay.length) { this.appointmentEngagementDisplay = []; return; }
    
    const targetPidSet = new Set(this.allActiveParticipants.map(p => this.canonical(p.profileid)));
    const profileMap = new Map(this.allActiveParticipants.map(p => [this.canonical(p.profileid), p]));
    const typeMap = new Map<string, any[]>();

    this.appointmentsDisplay.forEach(appt => {
      if (!targetPidSet.has(this.canonical(appt.profileId))) return;
      const key = appt.appointmentTypeId;
      if (!typeMap.has(key)) typeMap.set(key, []);
      typeMap.get(key)!.push(appt);
    });

    this.appointmentEngagementDisplay = Array.from(typeMap.entries()).map(([typeId, appointments]) => {
      const engaged = appointments.filter(a => !a.cancelled);
      const notEngaged = appointments.filter(a => a.cancelled);
      const groupByParticipant = (appts: any[]) => {
        const grouped = new Map<string, any[]>();
        appts.forEach(a => {
          const pid = this.canonical(a.profileId);
          if (!grouped.has(pid)) grouped.set(pid, []);
          grouped.get(pid)!.push(a);
        });
        return Array.from(grouped.entries()).map(([pid, pAppts]) => {
          const basic = profileMap.get(pid) || { profileid: pid, name: pid };
          const sortedDates = pAppts.sort((a, b) => a.date.getTime() - b.date.getTime());
          return { name: basic.name, profileid: basic.profileid, journeyName: basic.journeyName || 'N/A', appointmentName: appointments[0].name,
            appointmentDatesFormatted: sortedDates.map(a => a.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })).join(', ') };
        });
      };
      return { id: typeId, name: appointments[0].name, engagedCount: new Set(engaged.map(a => this.canonical(a.profileId))).size,
        notEngagedCount: new Set(notEngaged.map(a => this.canonical(a.profileId))).size, engagedParticipants: groupByParticipant(engaged), notEngagedParticipants: groupByParticipant(notEngaged) };
    });
  }
  private getEngagedIdSets() {
    const product = new Set(this.allEngagedParticipantsGlobal.map(p => this.canonical(p.profileid)));
    const event = new Set<string>();
    const appointment = new Set<string>();
    this.eventEngagementDisplay.forEach(e => e.engagedParticipants.forEach(p => event.add(this.canonical(p.profileid))));
    this.appointmentEngagementDisplay.forEach(a => a.engagedParticipants.forEach(p => appointment.add(this.canonical(p.profileid))));
    return { product, event, appointment };
  }

  private getJourneyParticipantMap() {
    const journeyMap: Record<string, any[]> = {};
    this.allActiveParticipants.forEach(p => {
      const participant = this.participantsCache.find(pc => this.canonical(pc['profileid']) === this.canonical(p.profileid));
      if (!participant) return;
      const journeyId = this.participantStatusMode === 'active' ? participant['activejourney'] : participant['lastcompletedjourney'];
      if (journeyId) (journeyMap[journeyId] ??= []).push(p);
    });
    return journeyMap;
  }

  private calculateCombinedJourneyBreakdown() {
    if (this.engagementFilter !== 'both') { this.journeysCombinedDisplay = []; return; }
    const { product, event, appointment } = this.getEngagedIdSets();
    const journeyMap = this.getJourneyParticipantMap();

    this.journeysCombinedDisplay = Object.entries(journeyMap).map(([journeyId, participants]) => {
      const engaged = participants.filter(p => { const pid = this.canonical(p.profileid); return product.has(pid) || event.has(pid) || appointment.has(pid); })
        .map(p => { const pid = this.canonical(p.profileid); const types = [product.has(pid) && 'content', event.has(pid) && 'events', appointment.has(pid) && 'appointments'].filter(Boolean);
          return { ...p, status: 'engaged', engagedIn: types.join(' & ') }; });
      const notEngaged = participants.filter(p => { const pid = this.canonical(p.profileid); return !product.has(pid) && !event.has(pid) && !appointment.has(pid); })
        .map(p => ({ ...p, status: 'not-engaged' }));
      return { id: journeyId, name: this.journeyIdToName[journeyId] || journeyId, count: participants.length, engaged: engaged.length, engagedParticipants: engaged, notEngagedParticipants: notEngaged };
    });
  }

  private calculateJourneyEventBreakdown() {
    if (this.engagementFilter !== 'event') { this.journeysEventDisplay = []; return; }
    const { event } = this.getEngagedIdSets();
    const journeyMap = this.getJourneyParticipantMap();

    this.journeysEventDisplay = Object.entries(journeyMap).map(([journeyId, participants]) => {
      const engaged = participants.filter(p => event.has(this.canonical(p.profileid))).map(p => {
        const events = this.eventEngagementDisplay.filter(e => e.engagedParticipants.some(ep => this.canonical(ep.profileid) === this.canonical(p.profileid))).map(e => e.name);
        return { ...p, status: 'engaged', eventName: events.join(', ') || 'N/A' };
      });
      const notEngaged = participants.filter(p => !event.has(this.canonical(p.profileid))).map(p => ({ ...p, status: 'not-engaged', eventName: 'No event participation' }));
      return { id: journeyId, name: this.journeyIdToName[journeyId] || journeyId, count: participants.length, engaged: engaged.length, engagedParticipants: engaged, notEngagedParticipants: notEngaged };
    });
  }

  private calculateJourneyAppointmentBreakdown() {
    if (this.engagementFilter !== 'event') { this.journeysAppointmentDisplay = []; return; }
    const { appointment } = this.getEngagedIdSets();
    const journeyMap = this.getJourneyParticipantMap();

    this.journeysAppointmentDisplay = Object.entries(journeyMap).map(([journeyId, participants]) => {
      const engaged = participants.filter(p => appointment.has(this.canonical(p.profileid))).map(p => {
        const appts = this.appointmentEngagementDisplay.filter(a => a.engagedParticipants.some(ap => this.canonical(ap.profileid) === this.canonical(p.profileid))).map(a => a.name);
        return { ...p, status: 'engaged', appointmentName: appts.join(', ') || 'N/A' };
      });
      const notEngaged = participants.filter(p => !appointment.has(this.canonical(p.profileid))).map(p => ({ ...p, status: 'not-engaged', appointmentName: 'No attendance' }));
      return { id: journeyId, name: this.journeyIdToName[journeyId] || journeyId, count: participants.length, engaged: engaged.length, engagedParticipants: engaged, notEngagedParticipants: notEngaged };
    });
  }
  getActiveParticipants = () => this.allActiveParticipants.length;
  
  getEngagedParticipants(): number {
    if (this.engagementFilter === 'product') return this.allEngagedParticipantsGlobal.length;
    const { product, event, appointment } = this.getEngagedIdSets();
    if (this.engagementFilter === 'event') return new Set([...event, ...appointment]).size;
    return new Set([...product, ...event, ...appointment]).size;
  }

  getNotEngagedParticipants = () => this.getActiveParticipants() - this.getEngagedParticipants();
  getEngagementRate = () => this.getActiveParticipants() > 0 ? Math.round((this.getEngagedParticipants() / this.getActiveParticipants()) * 100) : 0;

  getJourneyEventUniqueCount = () => this.engagementFilter === 'event' ? new Set(this.journeysEventDisplay.flatMap(j => j.engagedParticipants?.map(p => this.canonical(p.profileid)) || [])).size : 0;
  getIndividualEventUniqueCount = () => this.engagementFilter === 'event' ? new Set(this.eventEngagementDisplay.flatMap(e => e.engagedParticipants.map(p => this.canonical(p.profileid)))).size : 0;
  getAppointmentUniqueCount = () => this.engagementFilter === 'event' ? new Set(this.appointmentEngagementDisplay.flatMap(a => a.engagedParticipants.map(p => this.canonical(p.profileid)))).size : 0;
  toggleMonthPicker = () => this.monthPickerOpen = !this.monthPickerOpen;
  closeMonthPicker = () => this.monthPickerOpen = false;
  incrementYear = () => this.monthPickerYear = this.currentYear = this.monthPickerYear + 1;
  decrementYear = () => this.monthPickerYear = this.currentYear = this.monthPickerYear - 1;

  selectMonth(monthIndex: number) {
    this.currentMonth = monthIndex;
    this.currentYear = this.monthPickerYear;
    this.selectedMonth = this.months[monthIndex];
    this.resetState();
    this.closeMonthPicker();
    this.loading = true;
    clearTimeout(this.monthChangeTimeout);
    this.monthChangeTimeout = setTimeout(() => this.runDataLoad(), 300);
  }

  private resetState() {
    this.isSnapshotLocked = false;
    this.savedSnapshot = null;
    this.snapshotStatus = 'loading';
    this.journeysDisplay = [];
    this.journeysCombinedDisplay = [];
    this.journeysEventDisplay = [];
    this.eventEngagementDisplay = [];
    this.appointmentEngagementDisplay = [];
    this.selectedEventTab = 'journey';
    this.closePanel();
    this.currentLoadController?.abort();
  }

  async runDataLoad(forceLive = false) {
    if (this.isSnapshotLocked && !forceLive) return;
    this.currentLoadController = new AbortController();
    
    try {
      this.resetState();
      if (!forceLive && await this.loadSnapshotIfExists(this.getMonthKey())) {
        this.loading = false;
        this.snapshotStatus = 'locked';
        return;
      }
      this.snapshotStatus = 'live';
      this.filterEventsForMonth();
      this.filterAppointmentsForMonth();
      await this.updateForMonth();
      this.loading = false;
      this.loadEngagementDataInBackground();
      
    } catch (error: any) {
      if (error.name !== 'AbortError') console.error('Load error:', error);
      this.loading = false;
    }
  }

  onEngagementFilterChange(newFilter: FilterType) {
    this.engagementFilter = newFilter;
    this.closePanel();
    if (!this.isSnapshotLocked) this.recalculateBreakdowns();
  }

  onStatusToggle(mode: StatusMode) {
    this.participantStatusMode = mode;
    if (this.isSnapshotLocked && this.savedSnapshot) {
      this.restoreOptimizedSnapshot(this.savedSnapshot[mode === 'active' ? 'activeSnapshot' : 'inactiveSnapshot']);
      this.snackbarService.show(`📸 Showing ${mode} snapshot for ${this.selectedMonth}`);
      return;
    }
    this.loading = true;
    this.resetState();
    clearTimeout(this.monthChangeTimeout);
    this.monthChangeTimeout = setTimeout(() => this.runDataLoad(), 200);
  }

  private enrichPanelParticipants() {
    this.panelParticipants = this.panelParticipants.map(p => {
      const metadata = this.participantMetadataCache.get(p.profileid);
      return { ...p, email: metadata?.['email'] || '', phonenumber: metadata?.['phonenumber'] || '', metadata: metadata || {} };
    });
  }

  private openPanel(type: PanelType, title: string, subtitle: string, participants: any[], origin: 'product' | 'event' | '' = '') {
    this.panelType = type;
    this.panelTitle = title;
    this.panelSubtitle = subtitle;
    this.panelParticipants = participants;
    this.panelOrigin = origin;
    this.enrichPanelParticipants();
    this.panelVisible = true;
  }

  openEngagedPanel(j: JourneyDisplay) { this.openPanel('engaged', j.name, `${j.engaged} Engaged`, j.engagedParticipants || [], this.engagementFilter === 'event' ? 'event' : this.engagementFilter === 'product' ? 'product' : ''); }
  openNotEngagedPanel(j: JourneyDisplay) { this.openPanel('not-engaged', j.name, `${j.count - j.engaged} Not Engaged`, j.notEngagedParticipants || [], this.engagementFilter === 'event' ? 'event' : this.engagementFilter === 'product' ? 'product' : ''); }
  openAllParticipantsPanel(j: JourneyDisplay) {
    const all = [...(j.engagedParticipants || []).map(p => ({ ...p, status: 'engaged' })), ...(j.notEngagedParticipants || []).map(p => ({ ...p, status: 'not-engaged' }))];
    this.openPanel('all', j.name, `${j.count} Total`, all, this.engagementFilter === 'event' ? 'event' : this.engagementFilter === 'product' ? 'product' : '');
  }

  openEventEngagedPanel(e: EventDisplay) { this.openPanel('engaged', e.name, `${e.engagedCount} Engaged`, e.engagedParticipants, 'event'); }
  openEventNotEngagedPanel(e: EventDisplay) { this.openPanel('not-engaged', e.name, `${e.notEngagedCount} Not Engaged`, e.notEngagedParticipants, 'event'); }
  openEventAllPanel(e: EventDisplay) {
    const all = [...e.engagedParticipants.map(p => ({ ...p, status: 'engaged', eventName: e.name })), ...e.notEngagedParticipants.map(p => ({ ...p, status: 'not-engaged', eventName: e.name }))];
    this.openPanel('all', e.name, `${e.engagedCount + e.notEngagedCount} Total`, all, 'event');
  }

  openAppointmentEngagedPanel(a: AppointmentDisplay) { this.openPanel('engaged', a.name, `${a.engagedCount} Attended`, a.engagedParticipants, 'event'); }
  openAppointmentNotEngagedPanel(a: AppointmentDisplay) { this.openPanel('not-engaged', a.name, `${a.notEngagedCount} Cancelled`, a.notEngagedParticipants, 'event'); }
  openAppointmentAllPanel(a: AppointmentDisplay) {
    const all = [...a.engagedParticipants.map(p => ({ ...p, status: 'engaged' })), ...a.notEngagedParticipants.map(p => ({ ...p, status: 'not-engaged' }))];
    this.openPanel('all', a.name, `${a.engagedCount + a.notEngagedCount} Total`, all, 'event');
  }

  openAllActiveParticipantsPanel() {
    const { product, event, appointment } = this.getEngagedIdSets();
    const participants = this.allActiveParticipants.map(p => {
      const pid = this.canonical(p.profileid);
      const isEngaged = this.engagementFilter === 'event' ? (event.has(pid) || appointment.has(pid)) :
        this.engagementFilter === 'product' ? product.has(pid) : (product.has(pid) || event.has(pid) || appointment.has(pid));
      const events = this.eventEngagementDisplay.filter(e => e.engagedParticipants.some(ep => this.canonical(ep.profileid) === pid) || e.notEngagedParticipants.some(ep => this.canonical(ep.profileid) === pid))
        .map(e => ({ name: e.name, date: e.date, engaged: e.engagedParticipants.some(ep => this.canonical(ep.profileid) === pid) }));
      const appointments = this.appointmentEngagementDisplay.filter(a => a.engagedParticipants.some(ap => this.canonical(ap.profileid) === pid) || a.notEngagedParticipants.some(ap => this.canonical(ap.profileid) === pid))
        .map(a => { const ep = a.engagedParticipants.find(ap => this.canonical(ap.profileid) === pid); const nep = a.notEngagedParticipants.find(ap => this.canonical(ap.profileid) === pid);
          return { name: a.name, dates: ep?.appointmentDatesFormatted || nep?.appointmentDatesFormatted, engaged: !!ep }; });
      return { ...p, events, appointments, status: isEngaged ? 'engaged' : 'not-engaged' };
    });
    this.openPanel('all', 'All Active Participants', `${participants.length} Total`, participants, '');
  }

  openAllEngagedParticipantsPanel() {
    this.showPanelFilter = this.engagementFilter !== 'product';
    this.showPanelFilterDropdown = false;
    this.panelEventFilter = 'all';
    this.updateEngagedPanelParticipants();
    this.panelType = 'engaged';
    this.panelTitle = 'All Engaged Participants';
    this.enrichPanelParticipants();
    this.panelVisible = true;
  }

  updateEngagedPanelParticipants() {
    const participantMap = new Map<string, any>();
    if (this.engagementFilter === 'product') {
      this.panelParticipants = this.allEngagedParticipantsGlobal.map(p => ({ ...p, events: [], appointments: [] }));
    } else {
      const addToMap = (p: any, source: 'event' | 'appointment', data: any) => {
        const pid = this.canonical(p.profileid);
        if (!participantMap.has(pid)) {
          participantMap.set(pid, { name: p.name, profileid: p.profileid, journeyName: p.journeyName || 'N/A', events: [], appointments: [] });
        }
        const participant = participantMap.get(pid)!;
        (source === 'event' ? participant.events : participant.appointments).push(data);
      };
      if (this.panelEventFilter === 'all') {
        if (this.engagementFilter !== 'event') this.allEngagedParticipantsGlobal.forEach(p => participantMap.set(this.canonical(p.profileid), { ...p, events: [], appointments: [] }));
        this.eventEngagementDisplay.forEach(e => e.engagedParticipants.forEach(p => addToMap(p, 'event', { name: e.name, date: e.date })));
        this.appointmentEngagementDisplay.forEach(a => a.engagedParticipants.forEach(p => addToMap(p, 'appointment', { name: a.name, dates: p.appointmentDatesFormatted })));
      } else {
        const selected = this.eventEngagementDisplay.find(e => e.id === this.panelEventFilter);
        if (selected) {
          const targetPids = new Set(this.allActiveParticipants.map(p => this.canonical(p.profileid)));
          selected.engagedParticipants.filter(p => targetPids.has(this.canonical(p.profileid))).forEach(p => addToMap(p, 'event', { name: selected.name, date: selected.date }));
        }
      }
      this.panelParticipants = Array.from(participantMap.values());
    }
    this.panelSubtitle = `${this.panelParticipants.length} Engaged (This Month)`;
  }

  openAllNotEngagedParticipantsPanel() {
    const { product, event, appointment } = this.getEngagedIdSets();
    const notEngaged = this.allActiveParticipants.filter(p => {
      const pid = this.canonical(p.profileid);
      return this.engagementFilter === 'product' ? !product.has(pid) :
        this.engagementFilter === 'event' ? (!event.has(pid) && !appointment.has(pid)) : (!product.has(pid) && !event.has(pid) && !appointment.has(pid));
    }).map(p => {
      const events = this.eventEngagementDisplay.filter(e => e.notEngagedParticipants.some(np => this.canonical(np.profileid) === this.canonical(p.profileid))).map(e => ({ name: e.name, date: e.date }));
      const appointments = this.appointmentEngagementDisplay.filter(a => a.notEngagedParticipants.some(np => this.canonical(np.profileid) === this.canonical(p.profileid))).map(a => {
        const np = a.notEngagedParticipants.find(ap => this.canonical(ap.profileid) === this.canonical(p.profileid));
        return { name: a.name, dates: np?.appointmentDatesFormatted };
      });
      return { ...p, events, appointments, status: 'not-engaged' };
    });
    this.openPanel('not-engaged', 'All Not Engaged', `${notEngaged.length} Not Engaged (This Month)`, notEngaged, '');
  }

  closePanel() { this.panelVisible = false; this.showPanelFilter = false; this.showPanelFilterDropdown = false; this.panelEventFilter = 'all'; }
  togglePanelFilter = () => this.showPanelFilterDropdown = !this.showPanelFilterDropdown;
  onPanelFilterChange = () => this.updateEngagedPanelParticipants();
  navigateToProfile(profileId: string) { window.open(this.router.serializeUrl(this.router.createUrlTree(['/userprofile', profileId])), '_blank'); }
  eventType = (event: any) => event.type || this.eventsDisplay.find(e => e.id === event.id)?.type || '';
  exportParticipants() {
    if (!this.panelParticipants.length) return;
    const esc = (s: any) => `"${String(s || '').replace(/"/g, '""')}"`;
    let csv = '';
    const isAppointment = this.appointmentEngagementDisplay.some(a => a.name === this.panelTitle);
    
    if (this.panelOrigin === 'event' && isAppointment) {
      csv = 'Name,Profile ID,Journey,Status,Appointment,Dates,Email,Phone\n';
      this.panelParticipants.forEach(p => csv += `${esc(p.name)},${esc(p.profileid)},${esc(p.journeyName)},${esc(p.status === 'engaged' ? 'Attended' : 'Cancelled')},${esc(p.appointmentName || this.panelTitle)},${esc(p.appointmentDatesFormatted)},${esc(p.email)},${esc(p.phonenumber)}\n`);
    } else if (this.panelOrigin === 'event') {
      csv = 'Name,Profile ID,Journey,Status,Event,Date,Email,Phone\n';
      const event = this.eventEngagementDisplay.find(e => e.name === this.panelTitle);
      this.panelParticipants.forEach(p => csv += `${esc(p.name)},${esc(p.profileid)},${esc(p.journeyName)},${esc(p.status === 'engaged' ? 'Attended' : 'Not Attended')},${esc(p.eventName || this.panelTitle)},${esc(event?.date?.toLocaleString() || '')},${esc(p.email)},${esc(p.phonenumber)}\n`);
    } else if (this.panelOrigin === 'product') {
      csv = 'Name,Profile ID,Journey,Status,Last Content,Last Activity,Email,Phone\n';
      this.panelParticipants.forEach(p => csv += `${esc(p.name)},${esc(p.profileid)},${esc(p.journeyName)},${esc(p.status)},${esc(p.lastContent)},${esc(p.lastDate ? new Date(p.lastDate).toLocaleString() : '')},${esc(p.email)},${esc(p.phonenumber)}\n`);
    } else {
      csv = 'Name,Profile ID,Journey,Status,Last Content,Last Activity,Events,Appointments,Email,Phone\n';
      this.panelParticipants.forEach(p => {
        const events = (p.events || []).map((e: any) => `${e.name}(${new Date(e.date).toLocaleDateString()})`).join('; ') || 'None';
        const appts = (p.appointments || []).map((a: any) => `${a.name}(${a.dates})`).join('; ') || 'None';
        csv += `${esc(p.name)},${esc(p.profileid)},${esc(p.journeyName)},${esc(p.status)},${esc(p.lastContent)},${esc(p.lastDate ? new Date(p.lastDate).toLocaleString() : '')},${esc(events)},${esc(appts)},${esc(p.email)},${esc(p.phonenumber)}\n`;
      });
    }
    this.downloadCsv(csv, `${this.panelTitle.replace(/\s+/g, '_')}_${this.panelType}_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  private downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } 

  async exportFullDashboardToCsv() {
    const original = { mode: this.participantStatusMode, filter: this.engagementFilter };
    const snapshots: any = {};
    
    for (const mode of ['active', 'inactive'] as StatusMode[]) {
      this.participantStatusMode = mode;
      this.engagementFilter = 'both';
      await this.runDataLoad();
      snapshots[mode] = {
        metrics: { participants: this.getActiveParticipants(), engaged: this.getEngagedParticipants(), notEngaged: this.getNotEngagedParticipants(), rate: this.getEngagementRate() },
        journeysCombined: [...this.journeysCombinedDisplay], journeysProduct: [...this.journeysDisplay], allParticipants: [...this.allActiveParticipants]
      };
      this.engagementFilter = 'event';
      this.recalculateBreakdowns();
      snapshots[mode].journeysEvent = [...this.journeysEventDisplay];
      snapshots[mode].events = [...this.eventEngagementDisplay];
      snapshots[mode].appointments = [...this.appointmentEngagementDisplay];
    }

    this.participantStatusMode = original.mode;
    this.engagementFilter = original.filter;
    await this.runDataLoad();
    
    const lines: string[] = [];
    const esc = (s: any) => `"${String(s || '').replace(/"/g, '""')}"`;
    
    for (const [label, snap] of [['ACTIVE', snapshots.active], ['NON ACTIVE', snapshots.inactive]] as [string, any][]) {
      lines.push(`${label} – METRICS – ${this.selectedMonth} ${this.currentYear}`);
      lines.push('Metric,Value');
      Object.entries(snap.metrics).forEach(([k, v]) => lines.push(`${k},${v}`));
      lines.push('', `${label} – COMBINED JOURNEY BREAKDOWN`, 'Journey,Total,Engaged,Not Engaged,%');
      snap.journeysCombined.forEach((j: any) => lines.push(`${esc(j.name)},${j.count},${j.engaged},${j.count - j.engaged},${j.count > 0 ? Math.round(j.engaged / j.count * 100) : 0}`));
      lines.push('', `${label} – CONTENT JOURNEY BREAKDOWN`, 'Journey,Total,Engaged,Not Engaged,%');
      snap.journeysProduct.forEach((j: any) => lines.push(`${esc(j.name)},${j.count},${j.engaged},${j.count - j.engaged},${j.count > 0 ? Math.round(j.engaged / j.count * 100) : 0}`));
      lines.push('', `${label} – EVENT JOURNEY BREAKDOWN`, 'Journey,Total,Engaged,Not Engaged,%');
      snap.journeysEvent.forEach((j: any) => lines.push(`${esc(j.name)},${j.count},${j.engaged},${j.count - j.engaged},${j.count > 0 ? Math.round(j.engaged / j.count * 100) : 0}`));
      lines.push('', `${label} – INDIVIDUAL EVENTS`, 'Event,Date,Engaged,Not Engaged,Total');
      snap.events.forEach((e: any) => lines.push(`${esc(e.name)},${e.date?.toISOString() || ''},${e.engagedCount},${e.notEngagedCount},${e.engagedCount + e.notEngagedCount}`));
      lines.push('', `${label} – APPOINTMENTS`, 'Appointment,Attended,Cancelled,Total');
      snap.appointments.forEach((a: any) => lines.push(`${esc(a.name)},${a.engagedCount},${a.notEngagedCount},${a.engagedCount + a.notEngagedCount}`));
      lines.push('', `${label} – ALL PARTICIPANTS`, 'Name,Profile ID,Journey,Status,Last Content,Last Activity,Email,Phone');
      snap.allParticipants.forEach((p: any) => lines.push(`${esc(p.name)},${esc(p.profileid)},${esc(p.journeyName)},${esc(p.status)},${esc(p.lastContent)},${p.lastDate ? new Date(p.lastDate).toISOString() : ''},${esc(p.email)},${esc(p.phonenumber)}`));
      lines.push('', '');
    }
    this.downloadCsv(lines.join('\r\n'), `Engagement_${this.selectedMonth}_${this.currentYear}.csv`);
  }

  sendMail() { this.openMessageDialog('mail'); }
  sendWatti() { setTimeout(() => this.openMessageDialog('whatsapp'), 150); }

  private openMessageDialog(type: 'mail' | 'whatsapp') {
    this.dialog.open(SendmessagesComponent, { width: '90vw', height: '90vh', maxWidth: '100vw', maxHeight: '100vh', data: { type } })
      .afterClosed().subscribe(result => this.handleDialogResult(result));
  }

  sendNotificationinBreakthrough() {
    const profileIDs = this.panelParticipants.map(p => p.profileid);
    this.dialog.open(AhNotificationComponent, { width: '60vw', maxHeight: '90vh', disableClose: true, autoFocus: false })
      .afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
        if (!result) return;
        let notificationImage = null;
        if (result.notificationimage) {
          try {
            const storageRef = ref(this.storage, `Notification Images/${new Date().toISOString()}${result.notificationimage.name}`);
            const uploadResult = await uploadBytes(storageRef, result.notificationimage);
            notificationImage = await getDownloadURL(uploadResult.ref);
          } catch (e) { console.error('Upload error:', e); }
        }
        await this.guard.saveNotificationRecord({
          title: result.title, message: result.message, subtitle: result.subtitle ?? null,
          notificationtype: 'ahupdate', notificationimage: notificationImage, sticky: result.sticky,
          logged: true, landingpage: result.landingpage, profileid: profileIDs
        });
        alert(`A&H Update sent to ${profileIDs.length} users`);
      });
  }

  private async handleDialogResult(result: any) {
    if (result?.action !== 'sent') return;
    const url = this.getCloudFunctionUrl();
    const validParticipants = this.panelParticipants.filter(p => p.metadata?.email && p.metadata?.name);
    if (!validParticipants.length) { this.snackbarService.show('No valid recipients'); return; }

    try {
      if (result.type === 'mail') {
        const recipients = validParticipants.map(p => ({ email: p.metadata.email, name: p.metadata.name }));
        const response: any = await firstValueFrom(this.http.post(url, { type: 'mail', subject: result.subject, message: result.message, recipients }));
        this.snackbarService.show(response.successCount === recipients.length ? `Sent to all ${recipients.length}!` : `Sent: ${response.successCount}, Failed: ${response.failureCount}`);
      } else {
        const participants = validParticipants.map(p => {
          let cc = (p.metadata.countryCode || p.metadata.countrycode || '').trim().replace(/^\+?/, '+');
          const phone = (p.metadata.phonenumber?.toString().trim() || '').replace(/^\+/, '');
          return { phonenumber: cc ? `${cc}${phone}` : phone, name: p.metadata.name,
            customParams: result.customParams.map((param: any) => ({ name: param.name, value: param.value.replace(/\{\{name\}\}/g, p.metadata.name) })) };
        });
        const response: any = await firstValueFrom(this.http.post(url, { type: 'whatsapp', templateName: result.templateName, participants }));
        this.snackbarService.show(response.successCount === participants.length ? `WhatsApp sent to all ${participants.length}!` : `Sent: ${response.successCount}, Failed: ${response.failureCount}`);
      }
    } catch (e) { console.error('Send error:', e); this.snackbarService.show('Failed to send'); }
  }

  private getCloudFunctionUrl(): string {
    const projectId = environment.firebase.projectId;
    return projectId.includes('test') ? `https://us-central1-${projectId}.cloudfunctions.net/workshopprogressmessage` :
      'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
  }

  canSaveEngagement(): boolean {
    const today = new Date();
    const selectedIdx = this.months.indexOf(this.selectedMonth);
    if (this.currentYear < today.getFullYear() || (this.currentYear === today.getFullYear() && selectedIdx < today.getMonth())) return true;
    if (this.currentYear === today.getFullYear() && selectedIdx === today.getMonth()) {
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      return today.getDate() >= lastDay - 4;
    }
    return false;
  }

  getSaveButtonTooltip(): string {
    if (this.snapshotStatus === 'locked') return 'Already saved';
    const today = new Date();
    const selectedIdx = this.months.indexOf(this.selectedMonth);
    if (this.currentYear > today.getFullYear() || (this.currentYear === today.getFullYear() && selectedIdx > today.getMonth())) return 'Cannot save future months';
    if (this.currentYear === today.getFullYear() && selectedIdx === today.getMonth() && !this.canSaveEngagement()) {
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      return `Available in ${lastDay - 4 - today.getDate()} day(s)`;
    }
    return 'Save engagement';
  }

  confirmAndSaveEngagement() {
    if (!this.canSaveEngagement()) { this.snackbarService.show(this.getSaveButtonTooltip()); return; }
    if (confirm(`Save and lock engagement for ${this.selectedMonth} ${this.currentYear}?`)) this.saveCurrentEngagementSnapshot();
  }

private async saveCurrentEngagementSnapshot() {
  this.isSavingSnapshot = true;
  this.loading = true;
  const original = { mode: this.participantStatusMode, filter: this.engagementFilter };
  const snapshots: any = {};

  try {
    for (const mode of ['active', 'inactive'] as StatusMode[]) {
      this.participantStatusMode = mode;
      this.engagementFilter = 'both';
      await this.runDataLoad(true);
      if (this.eventsDisplay.length && !this.eventEngagementDisplay.length) {
        await this.fetchEventEngagement();
      }
      if (this.appointmentsDisplay.length && !this.appointmentEngagementDisplay.length) {
        await this.fetchAppointmentEngagement();
      }
      this.engagementFilter = 'both';
      this.recalculateBreakdowns();
      const combinedBreakdown = [...this.journeysCombinedDisplay];
      this.engagementFilter = 'product';
      this.recalculateBreakdowns();
      const contentBreakdown = [...this.journeysDisplay];
      this.engagementFilter = 'event';
      this.recalculateBreakdowns();
      const eventBreakdown = [...this.journeysEventDisplay];
      const appointmentBreakdown = [...this.journeysAppointmentDisplay];
      const refArrays = this.buildReferenceArrays();
      const snapshot: any = {
        ref: refArrays,
        overview: { ...this.overview },
        participants: {
          allParticipantIds: this.allActiveParticipants.map(p => p.profileid),
          engagedParticipantIds: this.allEngagedParticipantsGlobal.map(p => p.profileid),
          notEngagedParticipantIds: this.allNotEngagedParticipantsGlobal.map(p => p.profileid)
        },
        contentAnalytics: this.buildContentAnalytics(),
        journeys: {
          contentEngagement: contentBreakdown.map(j => 
            this.compressJourneyBreakdown(j, refArrays.journeys)
          ),
          combinedEngagement: combinedBreakdown.map(j => ({
            ...this.compressJourneyBreakdown(j, refArrays.journeys),
            engagedParticipants: (j.engagedParticipants || []).map(p => ({
              profileId: p.profileid,
              engagementType: p.engagedIn || ''
            }))
          })),
          eventEngagement: eventBreakdown.map(j => ({
            ...this.compressJourneyBreakdown(j, refArrays.journeys),
            engagedParticipants: (j.engagedParticipants || []).map(p => ({
              profileId: p.profileid,
              eventName: p.eventName || ''
            }))
          })),
          appointmentEngagement: appointmentBreakdown.map(j => ({
            ...this.compressJourneyBreakdown(j, refArrays.journeys),
            engagedParticipants: (j.engagedParticipants || []).map(p => ({
              profileId: p.profileid,
              appointmentName: p.appointmentName || ''
            }))
          }))
        },
        events: this.eventEngagementDisplay.map(e => ({
          eventId: e.id,
          eventName: e.name,
          eventDate: e.date.toISOString(),
          engagedCount: e.engagedCount,
          notEngagedCount: e.notEngagedCount,
          engagedParticipantIds: e.engagedParticipants.map(p => p.profileid),
          notEngagedParticipantIds: e.notEngagedParticipants.map(p => p.profileid),
          engagedParticipantsDetails: e.engagedParticipants.map(p => ({
            profileId: p.profileid,
            activities: p.activities || [],
            tokenstatus: p.tokenstatus,
            lastActivityDate: p.lastActivityDate ? p.lastActivityDate.toISOString() : null
          })),
          notEngagedParticipantsDetails: e.notEngagedParticipants.map(p => ({
            profileId: p.profileid,
            activities: p.activities || [],
            tokenstatus: p.tokenstatus,
            lastActivityDate: p.lastActivityDate ? p.lastActivityDate.toISOString() : null
          }))
        })),
        appointments: this.appointmentEngagementDisplay.map(a => ({
          appointmentId: a.id,
          appointmentName: a.name,
          engagedCount: a.engagedCount,
          notEngagedCount: a.notEngagedCount,
          engagedParticipants: a.engagedParticipants.map(p => ({
            profileId: p.profileid,
            appointmentDates: p.appointmentDatesFormatted || ''
          })),
          notEngagedParticipants: a.notEngagedParticipants.map(p => ({
            profileId: p.profileid,
            appointmentDates: p.appointmentDatesFormatted || ''
          }))
        }))
      };
      
      snapshots[`${mode}Snapshot`] = snapshot;
    }

    this.participantStatusMode = original.mode;
    this.engagementFilter = original.filter;
    await this.runDataLoad(true);

    const monthKey = this.getMonthKey();
    const timestamp = new Date().toISOString();
    const baseDoc = { 
      monthKey, 
      selectedMonth: this.selectedMonth, 
      currentMonth: this.currentMonth + 1, 
      currentYear: this.currentYear, 
      savedAt: timestamp, 
      savedBy: 'dashboard', 
      v: 3
    };
    
    await Promise.all([
      addDoc(collection(this.firestore, 'engagement_snapshots'), 
        this.sanitizeForFirestore({ 
          ...baseDoc, 
          type: `${monthKey}_active`, 
          participantMode: 'active', 
          snapshot: snapshots.activeSnapshot 
        })
      ),
      addDoc(collection(this.firestore, 'engagement_snapshots'), 
        this.sanitizeForFirestore({ 
          ...baseDoc, 
          type: `${monthKey}_inactive`, 
          participantMode: 'inactive', 
          snapshot: snapshots.inactiveSnapshot 
        })
      )
    ]);

    this.isSnapshotLocked = true;
    this.savedSnapshot = snapshots;
    this.snapshotStatus = 'locked';
    this.snackbarService.show(`Engagement locked for ${this.selectedMonth} ${this.currentYear}!`, 'success');
  } catch (e) { 
    console.error('Save error:', e); 
    this.snackbarService.show('Failed to save', 'error'); 
  } finally { 
    this.loading = false; 
    this.isSavingSnapshot = false; 
  }
}

private buildReferenceArrays(): { journeys: string[], content: string[] } {
  const journeyRefList = Object.values(this.journeyIdToName);
  const contentRefList: string[] = [];
  const contentRefMap = new Map<string, number>();
  
  this.allActiveParticipants.forEach(p => {
    if (p.lastContent && p.lastContent !== 'No activity this month') {
      if (!contentRefMap.has(p.lastContent)) {
        contentRefMap.set(p.lastContent, contentRefList.length);
        contentRefList.push(p.lastContent);
      }
    }
  });
  
  return { journeys: journeyRefList, content: contentRefList };
}

private buildContentAnalytics(): Record<string, { contentIndex: number; lastDate: string }> {
  const { content: contentRefList } = this.buildReferenceArrays();
  const contentRefMap = new Map<string, number>();
  contentRefList.forEach((content, idx) => contentRefMap.set(content, idx));
  
  const getContentRef = (content: string) => {
    if (!content || content === 'No activity this month') return -1;
    return contentRefMap.get(content) ?? -1;
  };

  const contentAnalytics: Record<string, { contentIndex: number; lastDate: string }> = {};
  this.allActiveParticipants.forEach(p => {
    if (p.lastContent && p.lastContent !== 'No activity this month') {
      contentAnalytics[p.profileid] = {
        contentIndex: getContentRef(p.lastContent),
        lastDate: p.lastDate instanceof Date ? p.lastDate.toISOString() : (p.lastDate || '')
      };
    }
  });
  
  return contentAnalytics;
}

  private captureOptimizedSnapshot(): any {
    const journeyRefList = Object.values(this.journeyIdToName);
    const contentRefList: string[] = [];
    const contentRefMap = new Map<string, number>();
    const getContentRef = (content: string) => {
      if (!content || content === 'No activity this month') return -1;
      if (!contentRefMap.has(content)) { contentRefMap.set(content, contentRefList.length); contentRefList.push(content); }
      return contentRefMap.get(content)!;
    };

    const contentAnalytics: Record<string, { contentIndex: number; lastDate: string }> = {};
    this.allActiveParticipants.forEach(p => {
      if (p.lastContent && p.lastContent !== 'No activity this month')
        contentAnalytics[p.profileid] = { contentIndex: getContentRef(p.lastContent), lastDate: p.lastDate instanceof Date ? p.lastDate.toISOString() : (p.lastDate || '') };
    });

    return {
      ref: { journeys: journeyRefList, content: contentRefList },
      overview: { ...this.overview },
      participants: { allParticipantIds: this.allActiveParticipants.map(p => p.profileid), engagedParticipantIds: this.allEngagedParticipantsGlobal.map(p => p.profileid), notEngagedParticipantIds: this.allNotEngagedParticipantsGlobal.map(p => p.profileid) },
      contentAnalytics,
      journeys: {
        contentEngagement: this.journeysDisplay.map(j => this.compressJourneyBreakdown(j, journeyRefList)),
        combinedEngagement: this.journeysCombinedDisplay.map(j => ({ ...this.compressJourneyBreakdown(j, journeyRefList), engagedParticipants: (j.engagedParticipants || []).map(p => ({ profileId: p.profileid, engagementType: p.engagedIn || '' })) })),
        eventEngagement: [], appointmentEngagement: []
      },
      events: this.eventEngagementDisplay.map(e => ({ eventId: e.id, eventName: e.name, eventDate: e.date.toISOString(), engagedCount: e.engagedCount, notEngagedCount: e.notEngagedCount, engagedParticipantIds: e.engagedParticipants.map(p => p.profileid), notEngagedParticipantIds: e.notEngagedParticipants.map(p => p.profileid) })),
      appointments: this.appointmentEngagementDisplay.map(a => ({ appointmentId: a.id, appointmentName: a.name, engagedCount: a.engagedCount, notEngagedCount: a.notEngagedCount, engagedParticipants: a.engagedParticipants.map(p => ({ profileId: p.profileid, appointmentDates: p.appointmentDatesFormatted || '' })), notEngagedParticipants: a.notEngagedParticipants.map(p => ({ profileId: p.profileid, appointmentDates: p.appointmentDatesFormatted || '' })) }))
    };
  }

  private compressJourneyBreakdown(j: JourneyDisplay, journeyRefList: string[]) {
    return { journeyIndex: journeyRefList.indexOf(j.name), totalCount: j.count, engagedCount: j.engaged, engagedParticipantIds: (j.engagedParticipants || []).map(p => p.profileid), notEngagedParticipantIds: (j.notEngagedParticipants || []).map(p => p.profileid) };
  }

private async loadSnapshotIfExists(monthKey: string): Promise<boolean> {
  try {
    const [activeSnap, inactiveSnap] = await Promise.all([
      getDocs(query(collection(this.firestore, 'engagement_snapshots'), where('type', '==', `${monthKey}_active`), limit(1))),
      getDocs(query(collection(this.firestore, 'engagement_snapshots'), where('type', '==', `${monthKey}_inactive`), limit(1)))
    ]);
    if (activeSnap.empty || inactiveSnap.empty) {
      return false;
    }
    const activeData = activeSnap.docs[0].data()['snapshot'];
    const inactiveData = inactiveSnap.docs[0].data()['snapshot'];  
    this.savedSnapshot = { 
      activeSnapshot: activeData, 
      inactiveSnapshot: inactiveData 
    };
    this.isSnapshotLocked = true;
    this.snapshotStatus = 'locked';
    this.filterEventsForMonth();
    this.filterAppointmentsForMonth()
    const currentSnapshot = this.savedSnapshot[this.participantStatusMode === 'active' ? 'activeSnapshot' : 'inactiveSnapshot'];
    this.restoreOptimizedSnapshot(currentSnapshot);
    this.snackbarService.show(`Loaded snapshot for ${this.selectedMonth} (${this.participantStatusMode})`, 'info');
    return true;
  } catch (e) { 
    console.error('error:', e); 
    return false; 
  }
}

private restoreOptimizedSnapshot(snapshot: any) {
  if (!snapshot?.ref) return;
  const { journeys: journeyRefList, content: contentRefList } = snapshot.ref;
  
  const reconstructParticipant = (pid: string, journeyIdx?: number, extraData?: any) => {
    const metadata = this.participantMetadataCache.get(pid);
    const participant = this.participantsCache.find(p => this.canonical(p['profileid']) === this.canonical(pid));
    if (!participant) return null;
    const journeyName = journeyIdx !== undefined && journeyIdx >= 0 ? journeyRefList[journeyIdx] : (this.journeyIdToName[this.participantStatusMode === 'active' ? participant['activejourney'] : participant['lastcompletedjourney']] || 'N/A');
    const contentData = snapshot.contentAnalytics?.[pid];
    return { 
      name: participant['name'] || pid, 
      profileid: pid, 
      journeyName, 
      subscriptionEnd: participant['subscriptionend'] ? this.parseDate(participant['subscriptionend']) : null,
      lastContent: contentData && contentData.contentIndex >= 0 ? contentRefList[contentData.contentIndex] : 'No activity this month',
      lastDate: contentData?.lastDate ? new Date(contentData.lastDate) : null, 
      email: metadata?.['email'] || '', 
      phonenumber: metadata?.['phonenumber'] || '', 
      metadata: metadata || {},
      ...(extraData || {})
    };
  };

  const decompressJourney = (j: any) => {
    const journeyName = j.journeyIndex >= 0 ? journeyRefList[j.journeyIndex] : 'N/A';
    const journeyId = Object.entries(this.journeyIdToName).find(([, name]) => name === journeyName)?.[0] || '';
    return { 
      id: journeyId, 
      name: journeyName, 
      count: j.totalCount || 0, 
      engaged: j.engagedCount || 0,
      engagedParticipants: (j.engagedParticipantIds || []).map((pid: string, idx: number) => {
        const extraData = j.engagedParticipants?.[idx];
        return reconstructParticipant(pid, j.journeyIndex, extraData);
      }).filter(Boolean).map((p: any) => ({ ...p, status: 'engaged' })),
      notEngagedParticipants: (j.notEngagedParticipantIds || []).map((pid: string) => 
        reconstructParticipant(pid, j.journeyIndex)
      ).filter(Boolean).map((p: any) => ({ ...p, status: 'not-engaged' })) 
    };
  };

  this.overview = snapshot.overview || { activeParticipants: 0, engaged: 0, notEngaged: 0, engagementRate: 0 };
  this.allActiveParticipants = (snapshot.participants?.allParticipantIds || []).map((pid: string) => reconstructParticipant(pid)).filter(Boolean);
  this.allEngagedParticipantsGlobal = (snapshot.participants?.engagedParticipantIds || []).map((pid: string) => ({ ...reconstructParticipant(pid), status: 'engaged' })).filter(Boolean);
  this.allNotEngagedParticipantsGlobal = (snapshot.participants?.notEngagedParticipantIds || []).map((pid: string) => ({ ...reconstructParticipant(pid), status: 'not-engaged' })).filter(Boolean);
  this.journeysDisplay = (snapshot.journeys?.contentEngagement || []).map(decompressJourney);
  this.journeysCombinedDisplay = (snapshot.journeys?.combinedEngagement || []).map((j: any) => ({ 
    ...decompressJourney(j), 
    engagedParticipants: (j.engagedParticipants || []).map((item: any) => ({ 
      ...reconstructParticipant(item.profileId, j.journeyIndex), 
      status: 'engaged', 
      engagedIn: item.engagementType 
    })).filter(Boolean) 
  }));
  
  this.journeysEventDisplay = (snapshot.journeys?.eventEngagement || []).map((j: any) => ({
    ...decompressJourney(j),
    engagedParticipants: (j.engagedParticipants || []).map((item: any) => ({
      ...reconstructParticipant(item.profileId, j.journeyIndex),
      status: 'engaged',
      eventName: item.eventName || 'N/A'
    })).filter(Boolean)
  }));
  
  this.journeysAppointmentDisplay = (snapshot.journeys?.appointmentEngagement || []).map((j: any) => ({
    ...decompressJourney(j),
    engagedParticipants: (j.engagedParticipants || []).map((item: any) => ({
      ...reconstructParticipant(item.profileId, j.journeyIndex),
      status: 'engaged',
      appointmentName: item.appointmentName || 'N/A'
    })).filter(Boolean)
  }));
  
  this.eventEngagementDisplay = (snapshot.events || []).map((e: any) => ({ 
    id: e.eventId, 
    name: e.eventName, 
    date: new Date(e.eventDate), 
    engagedCount: e.engagedCount, 
    notEngagedCount: e.notEngagedCount,
    engagedParticipants: (e.engagedParticipantsDetails || e.engagedParticipantIds || []).map((item: any) => {
      const pid = typeof item === 'string' ? item : item.profileId;
      const details = typeof item === 'object' ? item : {};
      return {
        ...reconstructParticipant(pid),
        eventName: e.eventName,
        activities: details.activities || [],
        tokenstatus: details.tokenstatus,
        lastActivityDate: details.lastActivityDate ? new Date(details.lastActivityDate) : null
      };
    }).filter(Boolean),
    notEngagedParticipants: (e.notEngagedParticipantsDetails || e.notEngagedParticipantIds || []).map((item: any) => {
      const pid = typeof item === 'string' ? item : item.profileId;
      const details = typeof item === 'object' ? item : {};
      return {
        ...reconstructParticipant(pid),
        eventName: e.eventName,
        activities: details.activities || [],
        tokenstatus: details.tokenstatus,
        lastActivityDate: details.lastActivityDate ? new Date(details.lastActivityDate) : null
      };
    }).filter(Boolean)
  }));
  
  this.appointmentEngagementDisplay = (snapshot.appointments || []).map((a: any) => ({ 
    id: a.appointmentId, 
    name: a.appointmentName, 
    engagedCount: a.engagedCount, 
    notEngagedCount: a.notEngagedCount,
    engagedParticipants: (a.engagedParticipants || []).map((item: any) => ({ 
      ...reconstructParticipant(item.profileId), 
      appointmentName: a.appointmentName, 
      appointmentDatesFormatted: item.appointmentDates 
    })).filter(Boolean),
    notEngagedParticipants: (a.notEngagedParticipants || []).map((item: any) => ({ 
      ...reconstructParticipant(item.profileId), 
      appointmentName: a.appointmentName, 
      appointmentDatesFormatted: item.appointmentDates 
    })).filter(Boolean) 
  }));
}

  private sanitizeForFirestore(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(item => this.sanitizeForFirestore(item)).filter(item => item !== null);
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) if (obj.hasOwnProperty(key)) { const val = this.sanitizeForFirestore(obj[key]); if (val !== undefined && val !== null) sanitized[key] = val; }
      return sanitized;
    }
    return obj;
  }

  async unlockToLiveData() {
    this.isSnapshotLocked = false;
    this.savedSnapshot = null;
    this.snapshotStatus = 'loading';
    await this.runDataLoad(true);
    this.snapshotStatus = 'live';
    this.snackbarService.show('🔓 Switched to live data');
  }
}