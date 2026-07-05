import { Component, ElementRef, inject, Inject, OnDestroy, Optional, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthguardService } from '../../authguard.service';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { collection, collectionSnapshots, doc, Firestore, getDocs, orderBy, query, where, updateDoc, arrayRemove, arrayUnion, setDoc, deleteDoc, collectionData, getDoc, writeBatch, serverTimestamp } from '@angular/fire/firestore';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { environment } from '../../../environments/environment.development';
import { MapRecommendedplaylistToparticipantComponentComponent } from '../../Participants Profile Management/participants-analytics/map-recommendedplaylist-toparticipant.component/map-recommendedplaylist-toparticipant.component.component';
import { Storage,ref,uploadBytes,getDownloadURL } from '@angular/fire/storage';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatOptionSelectionChange } from '@angular/material/core';

interface ParticipantRow {
  id: string;
  name: string;
  initials: string;
  avatarClass: string;
  roleLabel: string;
  roleClass: string;
}

@Component({
  selector: 'app-cohort-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    NgxMatSelectSearchModule,
    MatCheckboxModule,
  ],
  templateUrl: './cohort-detail.component.html',
  styleUrl: './cohort-detail.component.css',
})
export class CohortDetailComponent implements OnDestroy {
  @ViewChild('duplicateStudiosModel')
  duplicateStudiosModel: TemplateRef<ElementRef>;
  loggedinProfileRoles = {};
  cohort: any = null;
  cohortId: string | null = null;
  cohortName: string = '';
  marathonId: string | null = null;
  eventId: string | null = null;
  fromRoute: string = 'bigcohorts';
  selectedQueue = null;
  searchableQueueList = [];
  private subscription = new Subject<void>();
  products = {};
  productList = [];
  queueTokenList = [];
  completedToken = 0;

  editAtcModel = null;
  editAtcModelData = [];

  editMandatoryActivities = null;
  editMandatoryActivitiesData = [];

  queueTokenSubscription: Subscription;

  studioCreateMode = false;
  studioStages = [];
  selectedStage = '';
  studioCombinations: any = {};
  selectCombination = false;
  selectedCombination = null;
  newStudioPairing = [];
  duplicatedStudios: any | null = {};
  duplicateModelRef!: MatDialogRef<any>;
  selectMode = false;
  selectedParticipantIds = new Set();

  // Maps (preferably passed in from cohort-management; only loaded if missing)
  mapProfile: { [id: string]: string } = {};
  mapParticipantMeta: { [id: string]: any } = {};
  mapMarathon: { [id: string]: any } = {};
  mapAcceleratorEvent: { [id: string]: any } = {};
  bigActivityMap: { [id: string]: any } = {};
  mapBigAssignment: { [id: string]: any } = {};
  mapParticiantsAssignments: { [cohortId: string]: any } = {};
  mapQueueName: any;
  stageTokenMap = {};
  filterText = '';

  // Studio / live-assignment data (passed in from parent)
  mapParticipantStudios: { [key : string] : {[participantId: string]: any[]} } = {};
  mapStudioPairing: { [studioId: string]: any } = {};
  mapLiveAssignmentByStudio: { [studioId: string]: any } = {};
  studioPairingList: any[] = [];
  liveAssignmentList: any[] = [];
  mapLiveParticipants: { [key: string]: { [key: string]: boolean } } = {};
  eventParticipationList: any[] = [];
  studioPreAssign = {};
  stageActivityParse = {};
  stageStudioMap = {};

  // Derived
  participantRows: ParticipantRow[] = [];
  contentTab: 'studios' | 'participants' | 'activities' | 'comms' =
    'participants';
  ownerList: string[] = [];
  selectedOwner: string = '';
  mentorsList = [];
  selectedMentors = [];
  isCohortUpdates : boolean = false;
  showDisabledStudio = true;

  // Studios tab UI state
  studioGroupFilter: Set<string> = new Set<string>(); // selected group codes (uP! / LYL / B!G). Empty = all.
  studioUnassignedSearch: string = '';
  /** docids of expanded studio cards (the chevron toggles entry presence). */
  studioExpanded: Set<string> = new Set<string>();
  dragPayload = null;

  unassignedParticipants = [];
  filterUnassignedParticipants = [];

  toggleStudioExpanded(studio: any, event?: Event) {
    if (event) event.stopPropagation();
    const sid = studio?.docid || studio?.id;
    if (!sid) return;
    if (this.studioExpanded.has(sid)) this.studioExpanded.delete(sid);
    else this.studioExpanded.add(sid);
  }
  isStudioExpanded(studio: any): boolean {
    const sid = studio?.docid || studio?.id;
    return !!sid && this.studioExpanded.has(sid);
  }

  loading: boolean = false;
  isDialogMode: boolean = false;

  // Stats
  peopleCount: number = 0;
  studiosPaired: string = '—';
  qDemand: string = '—';
  eventConfirmed: string = '—';
  checkedInCount: number = 0;
  liveCount: number = 0;

  // Activities
  activitiesCount: number = 0;
  activities: any[] = [];

  liveassignmentSubscription: Subscription | null = null;
  queuestudioSubscription: Subscription | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private firestore: Firestore,
    public authguard: AuthguardService,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private _snackBar: MatSnackBar,
    private storage : Storage,
    private http : HttpClient,
    @Optional() private dialogRef: MatDialogRef<CohortDetailComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData: any,
  ) {
    
    getDocs(collection(this.firestore, 'products')).then((snap) => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.products[element['id']] = element;
      }
    });

    authguard.getRoles().then(async (roleData) => {
      this.loggedinProfileRoles = roleData;
    });
    if (this.dialogData) {
      // Dialog mode — reuse pre-loaded data
      this.isDialogMode = true;
      this.cohort = this.dialogData.cohort || null;
      this.cohortId =
        this.cohort?.['docid'] || this.dialogData.cohortId || null;
      this.cohortName =
        this.cohort?.['name'] || this.dialogData.cohortName || '';
      this.marathonId =
        this.dialogData.marathonId || this.cohort?.['marathonref']?.id || null;
      this.eventId =
        this.dialogData.eventId || this.cohort?.['eventref']?.id || null;

      this.mapProfile = this.dialogData.mapProfile || {};
      this.mapParticipantMeta = this.dialogData.mapParticipantMeta || {};
      this.mapMarathon = this.dialogData.mapMarathon || {};
      this.mapAcceleratorEvent = this.dialogData.mapAcceleratorEvent || {};
      this.bigActivityMap = this.dialogData.bigActivityMap || {};
      this.mapBigAssignment = this.dialogData.mapBigAssignment || {};
      this.mapParticiantsAssignments =
        this.dialogData.mapParticiantsAssignments || {};

      this.mapParticipantStudios = this.dialogData.mapParticipantStudios || {};
      // this.mapStudioPairing = this.dialogData.mapStudioPairing || {};
      // this.mapLiveAssignmentByStudio =
      //   this.dialogData.mapLiveAssignmentByStudio || {};
      // this.studioPairingList = this.dialogData.studioPairingList || [];
      // this.liveAssignmentList = this.dialogData.liveAssignmentList || [];
      // this.mapLiveParticipants = this.dialogData.mapLiveParticipants || {};
      this.eventParticipationList =
        this.dialogData.eventParticipationList || [];
      this.searchableQueueList = this.dialogData.searchableQueueList ?? [];
      this.mapQueueName = this.dialogData.mapQueueName ?? {};
      this.selectedQueue = this.isStudioCohort() ? this.dialogData.cohort['queueref']?.id ?? null : null;
      this.contentTab = this.dialogData.viewType ?? 'participants'
      console.log('queueid', this.dialogData.cohort['queueref']?.id);
      this.peopleCount = this.cohort?.['participantidlist']?.length || 0;
      this.selectedMentors = this.cohort?.['mentors'] ?? [];
      // this.computeStats();
      this.computeActivitiesFromInjectedMaps();
      this.computeOwners();
      this.rebuildParticipantRows();
      console.log('selected queue',this.selectedQueue)
      if(this.selectedQueue)  this.loadLiveAssignments();
      this.loadMentors();
      return;
    }

    // Route mode — fetch from Firestore (fallback for direct URL access)
    this.route.queryParams.subscribe((params) => {
      this.cohortId = params['cohortid'] || null;
      this.cohortName = params['cohortname'] || '';
      this.marathonId = params['marathonid'] || null;
      this.eventId = params['eventid'] || null;
      this.fromRoute = params['from'] || 'bigcohorts';
      if (this.cohortId) this.loadCohort();
    });

    this.authguard
      .getProfileMap()
      .then((e: any) => {
        this.mapProfile = e?.map || {};
        this.rebuildParticipantRows();
      })
      .catch(() => {});
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  /**
   * Compute top-row stats: studios paired, Q demand, event confirmed.
   */
  // computeStats() {
  //   const participants: string[] = this.cohort?.['participantidlist'] || [];
  //   this.peopleCount = participants.length;
  //   // const queueId = this.cohort;

  //   let studiosTotal = 0;
  //   let studiosPaired = 0;
  //   let checkedIn = 0;
  //   let live = 0;
  //   participants.forEach((pid) => {
  //     const studios = this.mapParticipantStudios?.[pid] || [];
  //     studiosTotal += studios.length;
  //     studiosPaired += studios.filter((s: any) => s?.studioin === true).length;
  //     checkedIn += studios.filter((s: any) => s?.checkin === true).length;
  //   });
  //   live = participants.filter(
  //     (pid) => !!this.mapLiveParticipants?.[this.selectedQueue]?.[pid],
  //   ).length;

  //   this.studiosPaired =
  //     studiosTotal > 0 ? `${studiosPaired}/${studiosTotal}` : '—';
  //   this.qDemand =
  //     studiosTotal > 0 ? String(Math.max(0, studiosPaired - checkedIn)) : '—';

  //   const eventConfirmedCount = this.computeEventConfirmedCount(participants);
  //   this.eventConfirmed =
  //     this.peopleCount > 0 ? `${eventConfirmedCount}/${this.peopleCount}` : '—';

  //   this.checkedInCount = checkedIn;
  //   this.liveCount = live;
  // }

  // private computeEventConfirmedCount(participants: string[]): number {
  //   if (!participants?.length) return 0;
  //   const list = this.eventParticipationList || [];
  //   if (!list.length) return participants.length;
  //   const confirmedIds = new Set<string>(
  //     list
  //       .filter((e: any) => {
  //         const status = (e?.status || e?.eventstatus || '').toLowerCase();
  //         return (
  //           !status ||
  //           status === 'confirmed' ||
  //           status === 'active' ||
  //           status === 'attending'
  //         );
  //       })
  //       .map((e: any) => e?.participantid || e?.profileid)
  //       .filter(Boolean),
  //   );
  //   return participants.filter((pid) => confirmedIds.has(pid)).length;
  // }

  /** Studios listing for the Studios tab */
  getCohortStudios() {
    return this.studioPairingList.filter((queue) => {
      const queueId = queue['queueref']?.id;
      const bigActivity = this.cohort['bigactivity'];
      const participantsActivity = Object.values(
        queue['participantsactivity'] ?? {},
      );
      return (
        queueId === this.selectedQueue &&
        participantsActivity.includes(bigActivity)
      );
    });
  }

  getStudioDisplayName(studio: any): string {
    return (
      studio?.studioname ||
      studio?.name ||
      studio?.studioData?.studioname ||
      studio?.studioData?.name ||
      studio?.id?.substring?.(0, 8) ||
      'Studio'
    );
  }

  // isParticipantInStudio(participantId: string): boolean {
  //   const studios = this.mapParticipantStudios?.[participantId] || [];
  //   return studios.some((s: any) => s?.studioin === true);
  // }

  isParticipantLive(queueId: string, participantId: string): boolean {
    return !!(
      this.mapLiveParticipants &&
      this.mapLiveParticipants[queueId] &&
      this.mapLiveParticipants[queueId][participantId]
    );
  }

  // ════════════════════════════════════════════════════════════════
  // Studios — UI helpers (match standalone "Studio" tab design)
  // ════════════════════════════════════════════════════════════════

  /** Filtered list of studios (applies group filter pills). */
  getFilteredStudios(): any[] {
    const all = this.getCohortStudios() || [];
    const studios = [...all].map((st)=>{
      st['sort'] = this.isParticipantInCohort(st['participants'] ?? []) ? 1 : 0;
      return st
    });
    return studios;
  }

  /** All possible group codes (uP! / LYL / B!G) discovered across studios. */
  getStudioGroupCodes(): string[] {
    const codes = new Set<string>();
    (this.getCohortStudios() || []).forEach((s: any) => {
      const c = this.getStudioGroupCode(s);
      if (c) codes.add(c);
    });
    return Array.from(codes).sort();
  }

  /** Studio code shown in card header (S 01, S 02 …). */
  getStudioCode(studio: any, indexFallback?: number): string {
    const raw = studio?.studioname || studio?.name || '';
    const m = String(raw).match(/(?:^|[\s\-_#])S?\s*(\d{1,3})/i);
    if (m && m[1]) return `S ${m[1].padStart(2, '0')}`;
    if (typeof indexFallback === 'number')
      return `S ${String(indexFallback + 1).padStart(2, '0')}`;
    return raw || 'Studio';
  }

  /** Group code derived from studio name / stage (uP!, LYL, B!G). */
  getStudioGroupCode(studio: any): string {
    const src =
      `${studio?.studioname || ''} ${studio?.name || ''} ${studio?.stagename || ''} ${studio?.studioData?.stagename || ''}`.toUpperCase();
    if (src.includes('UP!') || /\bUP\b/.test(src)) return 'uP!';
    if (src.includes('LYL')) return 'LYL';
    if (src.includes('B!G') || /\bBIG\b/.test(src)) return 'B!G';
    return '';
  }

  /** True if studio currently has any live activity. */
  isStudioLive(studio: any): boolean {
    const sid = studio?.docid || studio?.id;
    return !!sid && !!this.mapLiveAssignmentByStudio?.[sid];
  }

  /** All participant IDs paired into this studio. */
  getStudioParticipantIds(studio: any): string[] {
    const arr: any[] =
      studio?.pairing ||
      studio?.specialistpairing ||
      studio?.participants ||
      [];
    return (arr || []).filter((x: any) => !!x);
  }

  /** Activity label for a participant inside a studio (from participantsactivity map). */
  getStudioParticipantActivity(studio: any, pid: string): string {
    const activityId = studio?.['participantsactivity']?.[pid];
    if (!activityId) return '';
    const m = this.bigActivityMap as any;
    return m?.[activityId]?.['activity'] || activityId;
  }

  /** Split a studio's participants into SPECIALIST / WORKING WITH / MENTOR / SHADOWING buckets. */
  getStudioRoles(studio: any): {
    specialists: string[];
    workingWith: string[];
    mentors: string[];
    shadowing: string[];
  } {
    const ids = this.getStudioParticipantIds(studio);
    const specialists: string[] = [];
    const workingWith: string[] = [];
    const mentors: string[] = [];
    const shadowing: string[] = [];
    ids.forEach((pid: string) => {
      const act = (
        this.getStudioParticipantActivity(studio, pid) || ''
      ).toLowerCase();
      if (act.includes('eis') || act.includes('specialist'))
        specialists.push(pid);
      else if (act.includes('mentor')) mentors.push(pid);
      else if (act.includes('shadow') || act.includes('observ'))
        shadowing.push(pid);
      else workingWith.push(pid);
    });
    // Fallback: if no participant matched anything, treat the first as specialist
    if (
      specialists.length === 0 &&
      workingWith.length === 0 &&
      mentors.length === 0 &&
      shadowing.length === 0 &&
      ids.length
    ) {
      specialists.push(ids[0]);
      if (ids.length > 1) workingWith.push(ids[1]);
      if (ids.length > 2) mentors.push(ids[2]);
      if (ids.length > 3) shadowing.push(...ids.slice(3));
    }
    return { specialists, workingWith, mentors, shadowing };
  }

  /** Participants in cohort but NOT in any studio (for Unassigned-to-Studio panel). */
  getUnassignedToStudio(): string[] {
    console.log('message from uassign studio')
    const cohortParticipants: string[] =
      this.cohort?.['participantidlist'] || [];
    const inAnyStudio = new Set<string>();
    (this.getCohortStudios() || []).forEach((s: any) => {
      if (s?.studioin) {
        this.getStudioParticipantIds(s).forEach((pid) => inAnyStudio.add(pid));
      }
    });
    const newStudioPairingPID = this.newStudioPairing.map((studio)=>studio['participants'] ?? []).flatMap((studio)=>studio)
    const result = cohortParticipants.filter((pid) => !inAnyStudio.has(pid) && !newStudioPairingPID.includes(pid));
    const q = (this.studioUnassignedSearch || '').toLowerCase().trim();
    if (!q) return result;
    return result.filter((pid) =>
      (this.mapProfile?.[pid] || pid).toLowerCase().includes(q),
    );
  }

  calculateUnassignedParticipants(){
    const cohortParticipants: string[] =
      this.cohort?.['participantidlist'] || [];
    const inAnyStudio = new Set<string>();
    (this.getCohortStudios() || []).forEach((s: any) => {
      if (s?.studioin) {
        this.getStudioParticipantIds(s).forEach((pid) => inAnyStudio.add(pid));
      }
    });
    const newStudioPairingPID = this.newStudioPairing.map((studio)=>studio['participants'] ?? []).flatMap((studio)=>studio)
    const result = cohortParticipants.filter((pid) => !inAnyStudio.has(pid) && !newStudioPairingPID.includes(pid));

    console.log('result' , this.getCohortStudios())
    this.unassignedParticipants = [...result];
    this.filterUnassignedParticipants = [...result];
    this.applyUnassignedFilter();
  }

  applyUnassignedFilter(){
    let participants = [...this.unassignedParticipants];
    const q = (this.studioUnassignedSearch || '').toLowerCase().trim();
    if (q){
      participants = participants.filter((pid) =>
        (this.mapProfile?.[pid] || pid).toLowerCase().includes(q),
      );
    }

    this.filterUnassignedParticipants = [...participants];
  }


  /** Toggle a group-code filter pill (uP!/LYL/B!G). */
  toggleStudioGroupFilter(code: string) {
    if (this.studioGroupFilter.has(code)) this.studioGroupFilter.delete(code);
    else this.studioGroupFilter.add(code);
  }

  isStudioGroupSelected(code: string): boolean {
    return (
      this.studioGroupFilter.size === 0 || this.studioGroupFilter.has(code)
    );
  }

  /** SESSION LOG done count — best-effort using participantsactivity. */
  getSessionDoneCount(studio: any): number {
    const log = studio?.['sessionlog'] || studio?.['sessions'] || null;
    if (Array.isArray(log))
      return log.filter((s: any) => s?.status === 'done' || s?.done === true)
        .length;
    if (typeof log === 'number') return log;
    return 0;
  }

  /** Initials for an avatar — uses mapProfile name fallback. */
  getInitialsForId(pid: string): string {
    const name = this.mapProfile?.[pid] || pid;
    return this.getInitials(name);
  }

  /** Get display name. */
  getNameForId(pid: string): string {
    return this.mapProfile?.[pid] || pid;
  }

  /** True when a single participant id belongs to the current cohort's roster. */
  isPidInCohort(pid: string): boolean {
    const roster: string[] = this.cohort?.['participantidlist'] || [];
    return roster.includes(pid);
  }

  /** Avatar colour class via deterministic hash. */
  getAvatarColorClass(pid: string): string {
    const palette = ['purple', 'blue', 'green', 'amber', 'rose'];
    if (!pid) return palette[0];
    let h = 0;
    for (let i = 0; i < pid.length; i++) {
      h = ((h << 5) - h + pid.charCodeAt(i)) | 0;
    }
    return palette[Math.abs(h) % palette.length];
  }

  /** Re-pair button (placeholder). Hook your existing re-pair logic here. */
  onRepairStudios() {
    // Hook into existing re-pair implementation if present.
    // No-op placeholder — UI feedback only.
    this._snackBar?.open('Re-pair triggered', 'OK', { duration: 1500 });
  }

  // ════════════════════════════════════════════════════════════════
  // Drag & drop — unassigned participant → studio
  // ════════════════════════════════════════════════════════════════
  private studioDragPayload: {
    participantId: string;
    sourceStudioId?: string | null;
  } | null = null;
  hoverDropStudioId: string | null = null;

  onUnassignedDragStart(event: DragEvent, participantId: string) {
    if (!event.dataTransfer) return;
    this.studioDragPayload = { participantId, sourceStudioId: null };
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData(
        'text/plain',
        JSON.stringify(this.studioDragPayload),
      );
    } catch {}
  }

  onStudioParticipantDragStart(
    event: DragEvent,
    participantId: string,
    sourceStudio: any,
  ) {
    if (!event.dataTransfer) return;
    event.stopPropagation();
    this.studioDragPayload = {
      participantId,
      sourceStudioId: sourceStudio?.docid || sourceStudio?.id,
    };
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData(
        'text/plain',
        JSON.stringify(this.studioDragPayload),
      );
    } catch {}
  }

  onStudioCardDragOver(event: DragEvent, studio: any) {
    if (!this.studioDragPayload) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.hoverDropStudioId = studio?.docid || studio?.id || null;
  }

  onStudioCardDragLeave(_event: DragEvent, studio: any) {
    const sid = studio?.docid || studio?.id;
    if (this.hoverDropStudioId === sid) this.hoverDropStudioId = null;
  }

  async onStudioCardDrop(event: DragEvent, targetStudio: any) {
    event.preventDefault();
    event.stopPropagation();
    const payload = this.studioDragPayload;
    this.studioDragPayload = null;
    this.hoverDropStudioId = null;
    if (!payload || !targetStudio) return;

    const targetId = targetStudio?.docid || targetStudio?.id;
    if (!targetId) return;
    if (payload.sourceStudioId === targetId) return;
    await this.assignParticipantToStudio(
      payload.participantId,
      targetStudio,
      payload.sourceStudioId || null,
    );
  }

  /** Drop handler: add participant to the target studio (and remove from source if any). */
  async assignParticipantToStudio(
    participantId: string,
    targetStudio: any,
    sourceStudioId: string | null,
  ): Promise<void> {
    if (!participantId || !targetStudio) return;
    const targetId = targetStudio?.docid || targetStudio?.id;
    if (!targetId) return;

    // Already in target? bail.
    const targetPairing: string[] = (targetStudio['pairing'] || []) as string[];
    if (targetPairing.includes(participantId)) {
      this._snackBar?.open('Already in this studio', 'OK', { duration: 1500 });
      return;
    }

    try {
      // Update target studio in Firestore
      const targetRef = doc(this.firestore, 'studio pairing', targetId);
      await updateDoc(targetRef, { pairing: arrayUnion(participantId) }).catch(
        async () => {
          // fallback collection name
          const altRef = doc(this.firestore, 'studiopairing', targetId);
          await updateDoc(altRef, { pairing: arrayUnion(participantId) });
        },
      );

      // Local mutation — keep the in-memory list in sync (passed by reference from parent)
      targetStudio['pairing'] = targetStudio['pairing'] || [];
      if (!targetStudio['pairing'].includes(participantId))
        targetStudio['pairing'].push(participantId);

      // Remove from source if cross-studio move
      if (sourceStudioId) {
        const srcStudio = (this.studioPairingList || []).find(
          (s: any) => (s?.docid || s?.id) === sourceStudioId,
        );
        if (srcStudio) {
          const srcRef = doc(this.firestore, 'studio pairing', sourceStudioId);
          await updateDoc(srcRef, {
            pairing: arrayRemove(participantId),
          }).catch(async () => {
            const altRef = doc(this.firestore, 'studiopairing', sourceStudioId);
            await updateDoc(altRef, { pairing: arrayRemove(participantId) });
          });
          srcStudio['pairing'] = (srcStudio['pairing'] || []).filter(
            (p: string) => p !== participantId,
          );
        }
      }

      // Refresh the parent map so unassigned-to-studio recomputes
      // this.refreshStudioMappings(participantId, targetStudio, sourceStudioId);

      this._snackBar?.open(
        `Assigned ${this.getNameForId(participantId)} to studio`,
        'OK',
        { duration: 1800 },
      );
    } catch (err) {
      console.error('Failed to assign participant to studio', err);
      this._snackBar?.open('Failed to assign. Try again.', 'Dismiss', {
        duration: 2500,
      });
    }
  }

  /** Remove participant from a studio (× button on a role row). */
  // async removeParticipantFromStudio(
  //   participantId: string,
  //   studio: any,
  //   event?: Event,
  // ): Promise<void> {
  //   if (event) {
  //     event.preventDefault();
  //     event.stopPropagation();
  //   }
  //   if (!participantId || !studio) return;
  //   const sid = studio?.docid || studio?.id;
  //   if (!sid) return;

  //   try {
  //     const sref = doc(this.firestore, 'studio pairing', sid);
  //     await updateDoc(sref, { pairing: arrayRemove(participantId) }).catch(
  //       async () => {
  //         const altRef = doc(this.firestore, 'studiopairing', sid);
  //         await updateDoc(altRef, { pairing: arrayRemove(participantId) });
  //       },
  //     );
  //     studio['pairing'] = (studio['pairing'] || []).filter(
  //       (p: string) => p !== participantId,
  //     );
  //     this.refreshStudioMappings(participantId, null, sid);
  //     this._snackBar?.open(
  //       `Removed ${this.getNameForId(participantId)}`,
  //       'OK',
  //       { duration: 1500 },
  //     );
  //   } catch (err) {
  //     console.error('Failed to remove participant', err);
  //     this._snackBar?.open('Failed to remove. Try again.', 'Dismiss', {
  //       duration: 2500,
  //     });
  //   }
  // }

  /** Keep mapParticipantStudios in sync after an assign/move/remove. */
  // private refreshStudioMappings(
  //   participantId: string,
  //   targetStudio: any | null,
  //   sourceStudioId: string | null,
  // ) {
  //   if (!this.mapParticipantStudios) this.mapParticipantStudios = {};
  //   const entry: any[] = this.mapParticipantStudios[participantId] || [];

  //   // Remove the source mapping
  //   let next = entry;
  //   if (sourceStudioId) {
  //     next = entry.filter((e: any) => e?.studioId !== sourceStudioId);
  //   }
  //   // Add the target mapping
  //   if (targetStudio) {
  //     const sid = targetStudio?.docid || targetStudio?.id;
  //     const already = next.some((e: any) => e?.studioId === sid);
  //     if (!already) {
  //       next = [
  //         ...next,
  //         {
  //           studioId: sid,
  //           studioData: targetStudio,
  //           studioin: !!targetStudio['studioin'],
  //           checkin: !!targetStudio['checkin'],
  //         },
  //       ];
  //     }
  //   }
  //   this.mapParticipantStudios[participantId] = next;
  // }

  private computeActivitiesFromInjectedMaps() {
    if (!this.cohortId) {
      this.activities = [];
      this.activitiesCount = 0;
      return;
    }
    const assignmentsMap =
      this.mapParticiantsAssignments?.[this.cohortId] || {};
    const assignmentIds = Object.keys(assignmentsMap);
    this.activitiesCount = assignmentIds.length;
    this.activities = assignmentIds
      .map((aid) => this.mapBigAssignment?.[aid])
      .filter(Boolean);
  }

  private computeOwners() {
    const owner =
      this.cohort?.['ownername'] ||
      this.cohort?.['mentorname'] ||
      this.cohort?.['createdbyname'] ||
      (this.cohort?.['createdby']
        ? this.mapProfile?.[this.cohort['createdby']] ||
          this.cohort['createdby']
        : '');
    this.selectedOwner = owner || '';
    this.ownerList = owner ? [owner] : [];
  }

  closeDialog(result?: any) {
    if (this.dialogRef) this.dialogRef.close(this.isCohortUpdates);
  }

  async loadCohort() {
    if (!this.cohortId) return;
    this.loading = true;
    try {
      const cohortRef = doc(this.firestore, 'big cohorts', this.cohortId);
      const snap = await getDoc(cohortRef);
      if (snap.exists()) {
        this.cohort = snap.data();
        this.cohortName = this.cohort?.['name'] || this.cohortName;
        this.peopleCount = this.cohort?.['participantidlist']?.length || 0;
        this.eventConfirmed = `${this.peopleCount}/${this.peopleCount}`;
        await this.loadActivitiesFromFirestore();
        this.computeOwners();
      }
      this.rebuildParticipantRows();
    } catch (err) {
      console.error('Failed to load cohort', err);
    } finally {
      this.loading = false;
    }
  }

  async loadActivitiesFromFirestore() {
    if (!this.cohortId) return;
    try {
      const q = query(
        collection(this.firestore, 'big assignment'),
        where('cohortidlist', 'array-contains', this.cohortId),
      );
      const snap = await getDocs(q);
      this.activitiesCount = snap.size;
      this.activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      this.activitiesCount = 0;
      this.activities = [];
    }
  }

  rebuildParticipantRows() {
    const ids: string[] = (this.cohort?.['participantidlist'] ||
      []) as string[];
    const palette = ['purple', 'blue', 'green', 'amber', 'rose'];
    this.participantRows = ids.map((pid, idx) => {
      const name =
        this.mapProfile?.[pid] ||
        this.mapParticipantMeta?.[pid]?.['name'] ||
        pid;
      const initials = this.getInitials(name);
      const hash = this.hashCode(pid);
      const role = this.deriveRoleLabel(pid, idx);
      return {
        id: pid,
        name,
        initials,
        avatarClass: palette[Math.abs(hash) % palette.length],
        roleLabel: role.label,
        roleClass: role.cls,
      };
    });
  }

  private deriveRoleLabel(
    pid: string,
    idx: number,
  ): { label: string; cls: string } {
    const meta = this.mapParticipantMeta?.[pid] || {};
    const candidate =
      meta?.['role'] ||
      meta?.['track'] ||
      meta?.['level'] ||
      meta?.['stage'] ||
      '';
    const presets = [
      { label: 'Diagnostics Shadow', cls: 'role-amber' },
      { label: 'Expanding Horizons Solo', cls: 'role-purple' },
      { label: 'Consultation Shadow', cls: 'role-green' },
      { label: 'Changework Solo', cls: 'role-rose' },
      { label: 'Installation Specialist', cls: 'role-blue' },
      { label: 'Diagnostics Collaborator Lead', cls: 'role-purple' },
      { label: 'Field Preparation', cls: 'role-gray' },
      { label: 'Installation Apprentice', cls: 'role-blue' },
      { label: 'Scope Enhancer Solo', cls: 'role-gray' },
      { label: 'Expanding Horizons Shadow', cls: 'role-purple' },
      { label: 'Diagnostics Solo', cls: 'role-amber' },
      { label: 'Changework Mentee', cls: 'role-rose' },
      { label: 'Consultation Solo', cls: 'role-green' },
      { label: 'Diagnostics Collaborator', cls: 'role-amber' },
    ];
    if (candidate && typeof candidate === 'string') {
      const k = candidate.toLowerCase();
      let cls = 'role-gray';
      if (k.includes('diagnostic')) cls = 'role-amber';
      else if (k.includes('expand')) cls = 'role-purple';
      else if (k.includes('consult')) cls = 'role-green';
      else if (k.includes('changework')) cls = 'role-rose';
      else if (k.includes('install')) cls = 'role-blue';
      else if (k.includes('scope')) cls = 'role-gray';
      else if (k.includes('field')) cls = 'role-gray';
      return { label: candidate, cls };
    }
    return presets[Math.abs(this.hashCode(pid + idx)) % presets.length];
  }

  private hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  private getInitials(name: string): string {
    if (!name) return '?';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('') || '?'
    );
  }

  setTab(tab: 'studios' | 'participants' | 'activities' | 'comms') {
    this.contentTab = tab;
    this.selectMode = false;
    this.selectedParticipantIds = new Set()
  }

  goBack() {
    this.router.navigate(['/bigcohorts']);
  }

  getCategoryLabel(): string {
    const c = (this.cohort?.['cohortCategory'] || '').toLowerCase();
    if (!c) return '';
    const m: any = {
      studio: 'studio',
      readiness: 'readiness',
      educational: 'educational',
      operational: 'operational',
    };
    return m[c] || c;
  }

  getCategoryClass(): string {
    const c = (this.cohort?.['cohortCategory'] || '').toLowerCase();
    if (c.includes('studio')) return 'badge-purple';
    if (c.includes('readiness')) return 'badge-green';
    if (c.includes('educational')) return 'badge-cyan';
    if (c.includes('operational')) return 'badge-slate';
    return 'badge-gray';
  }

  toggleStudio(studio) {
    const studioCheckIn = studio['checkin'];
    const isLiveStudio  = this.mapLiveAssignmentByStudio[studio['docid']];
    if(studioCheckIn) {
      alert('please checkout the studio before proceed');
      return
    };

    if(![null , undefined , ''].includes(isLiveStudio)){
      alert('stduio can not be disabled because studio is live');
      return
    }
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      studioin: !studio['studioin'],
    });
  }

  toggleCheckin(studio) {
    // console.log(studio["checkin"],!studio["checkin"]);
    const isLiveStudio  = this.mapLiveAssignmentByStudio[studio['docid']];
    const isEnabled = studio['studioin'];

    if(!isEnabled){
      alert('please enable the studio to checkin');
      return
    }

    if(![null , undefined , ''].includes(isLiveStudio)){
      alert('stduio can not be checkout because studio is live');
      return
    }
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      checkin: !studio['checkin'],
    });
  }

  toggleOpenVidu(studio) {
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      openvidu: !(studio['openvidu'] ?? false),
    });
  }

  deleteStudio(studio) {
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      delete: true,
    });
  }

  async loadLiveAssignments() {
    if (this.liveassignmentSubscription) {
      this.liveassignmentSubscription.unsubscribe();
    }
    if (this.queuestudioSubscription) {
      this.queuestudioSubscription.unsubscribe();
    }
    if (this.queueTokenSubscription) {
      this.queueTokenSubscription.unsubscribe();
    }

    const queue = this.searchableQueueList.find(
      (q) => q?.docid === this.selectedQueue,
    );

    if (!this.selectedQueue || !queue) {
      this.liveAssignmentList = [];
      this.studioPairingList = [];
      this.mapLiveParticipants = {};
      this.mapStudioPairing = {};
      this.mapParticipantStudios = {};
      this.mapLiveAssignmentByStudio = {};
      return;
    }

    this.stageActivityParse = {};
    const studioStages = [];
    var stageList = queue['stages'] ?? [];
    for (let i = 0; i < stageList.length; i++) {
      const stage = stageList[i];
      const stageProperty = queue['stageproperty'][stage];
      var compulsoryActivity = Object.values(
        stageProperty['compulsoryactivity'] ?? {},
      );
      if (compulsoryActivity.length > 0) {
        studioStages.push(stage);
      }
      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination: any = compulsoryActivity[j];
        const combinationArray = Array.isArray(activitycombination)
          ? activitycombination
          : [activitycombination];
        // var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        var parse = combinationArray
          .sort((a, b) => a.toString().localeCompare(b.toString()))
          .join(',');
        this.stageActivityParse[parse] = this.stageActivityParse[parse] ?? [];
        this.stageActivityParse[parse].push(stage);
      }
    }
    this.studioStages = studioStages;

    this.liveassignmentSubscription = collectionSnapshots(
      query(
        collection(this.firestore, 'live assignment'),
        where('status', '==', 'live'),
        where('queueid', 'in', [this.selectedQueue]),
      ),
    )
      .pipe(takeUntil(this.subscription))
      .subscribe((snapData) => {
        this.liveAssignmentList = snapData.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        this.mapLiveAssignmentByStudio = {};
        this.liveAssignmentList.forEach((assignment: any) => {
          if (assignment['studioid']) {
            this.mapLiveAssignmentByStudio[assignment['studioid']] = assignment;
          }
        });

        this.updateParticipantStudioMappings();
      });

    const selectedQueueRef = [this.selectedQueue].map((id) =>
      doc(this.firestore, 'queue generation', id),
    );

    this.queuestudioSubscription = collectionSnapshots(
      query(
        collection(this.firestore, 'queue studio pairing'),
        where('queueref', 'in', selectedQueueRef),
        orderBy('created', 'desc'),
      ),
    )
      .pipe(takeUntil(this.subscription))
      .subscribe((snapData) => {
        var localMap = {};
        this.studioPairingList = snapData.map((doc) => ({
          id: doc.id,
          docid: doc.id,
          ...doc.data(),
        }));

        this.mapStudioPairing = {};
        this.studioPairingList.forEach((studio: any) => {
          this.mapStudioPairing[studio.docid || studio.id] = studio;
        });
        for (let i = 0; i < this.studioPairingList.length; i++) {
          const studio = this.studioPairingList[i];

          var studioActivity = Object.values(studio['participantsactivity'])
            .sort((a, b) => a.toString().localeCompare(b.toString()))
            .join(',');
          (this.stageActivityParse[studioActivity] ?? []).forEach((stage) => {
            localMap[stage] = localMap[stage] ?? [];
            if (
              localMap[stage].filter(
                (e: { [key: string]: any }) => e['docid'] == studio['docid'],
              ).length == 0
            )
              localMap[stage].push(studio);
          });
        }
        this.stageStudioMap = localMap;

        this.updateParticipantStudioMappings();
        this.calculateUnassignedParticipants();
      });

    if (queue) {
      const arenaEventsSnap = await getDocs(
        query(
          collection(this.firestore, 'arena events'),
          where('docid', 'in', queue['arenaeventidlist'] ?? []),
        ),
      );
      const productIds = arenaEventsSnap.docs
        .map((doc) => doc.data()?.['productref']?.id)
        .filter(Boolean);
      const seenAtcModels = new Set<string>();

      this.productList = productIds
        .map((id) => this.products[id])
        .filter(Boolean)
        .filter((product) => {
          if (!product.atcmodel || seenAtcModels.has(product.atcmodel)) {
            return false;
          }
          seenAtcModels.add(product.atcmodel);
          return true;
        });
    }

    // Queue Token
    this.queueTokenSubscription = collectionData(
      query(
        collection(this.firestore, 'queue_token'),
        where(
          'queueref',
          '==',
          doc(this.firestore, 'queue generation', this.selectedQueue),
        ),
        where('tokenstatus', '==', 'Active'),
        orderBy('logdate', 'asc'),
      ),
    )
      .pipe(takeUntil(this.subscription))
      .subscribe((token) => {
        var lastStage = queue['stages'][queue['stages'].length - 1];
        this.queueTokenList = token.sort((a, b) =>
          (a['profile_name'] ?? '').localeCompare(b['profile_name'] ?? ''),
        );
        this.completedToken = this.queueTokenList.filter(
          (e) => e['currentstage'] == lastStage,
        ).length;
        var localPreAssign = {};
        // Group token by Stage
        this.stageTokenMap = this.queueTokenList.reduce(function (r, a) {
          // Pre Assigned
          Object.keys(a['preassigned'] ?? {}).forEach((stage) => {
            (a['preassigned'][stage] ?? []).forEach((studio) => {
              localPreAssign[studio] = localPreAssign[studio] ?? [];
              localPreAssign[studio].push(a);
            });
          });
          // Filter Token Status
          r[a['currentstage']] = r[a['currentstage']] || {};
          r[a['currentstage']]['waiting'] =
            r[a['currentstage']]['waiting'] ?? 0;
          r[a['currentstage']]['queued'] = r[a['currentstage']]['queued'] ?? 0;
          r[a['currentstage']]['instudio'] =
            r[a['currentstage']]['instudio'] ?? 0;
          r[a['currentstage']]['total'] =
            (r[a['currentstage']]['total'] ?? 0) + 1;
          r[a['currentstage']]['tokenlist'] =
            r[a['currentstage']]['tokenlist'] ?? [];
          r[a['currentstage']]['tokenlist'].push(a);
          if (a['status'] == 'ready') {
            r[a['currentstage']]['waiting'] += 1;
          } else if (
            a['status'] == null ||
            a['status'] == 'queued' ||
            a['status'] == 'invited'
          ) {
            r[a['currentstage']]['queued'] += 1;
          } else if (a['status'] == 'instudio') {
            r[a['currentstage']]['instudio'] += 1;
          }
          return r;
        }, {});
        this.studioPreAssign = localPreAssign;
        
      });
  }

  updateParticipantStudioMappings() {
    this.mapLiveParticipants = {};
    this.mapParticipantStudios = {};

    this.studioPairingList.forEach((studio: any) => {
      const studioId = studio.docid || studio.id;
      const participants = studio.participants || [];
      const liveAssignment = this.mapLiveAssignmentByStudio[studioId];
      const isLive = !!liveAssignment;
      const queueId = studio['queueref']?.id;

      if([null , undefined , ''].includes(queueId)) return
      this.mapLiveParticipants[queueId] = this.mapLiveParticipants[queueId] ?? {};
      this.mapParticipantStudios[queueId] = this.mapParticipantStudios[queueId] ?? {};
      participants.forEach((participantId: string) => {
         if (!this.mapParticipantStudios[queueId][participantId]) {
          this.mapParticipantStudios[queueId][participantId] = [];
        }

        this.mapParticipantStudios[queueId][participantId].push({
          studioId: studioId,
          isLive: isLive,
          checkin: studio.checkin || false,
          studioin: studio.studioin || false,
          liveAssignment: liveAssignment,
          studioData: studio,
        });

        if (isLive) {
          this.mapLiveParticipants[queueId][participantId] = true;
          // this.mapLiveParticipants[participantId] = true;
        }
      });
    });

    this.liveAssignmentList.forEach((assignment: any) => {
      const allParticipants = [
        ...(assignment['pairing'] || []),
        ...(assignment['bonusactivityparticipant'] || []),
      ];
      const queueId = assignment['queueid'];
      allParticipants.forEach((pid: string) => {
        if(!this.mapLiveParticipants[queueId]) return 
        this.mapLiveParticipants[queueId][pid] = true;
      });
    });
  }

  // function to open atc edit form
  openAtcEditMode(studio: any) {
    this.editAtcModel = studio['docid'];
    this.editAtcModelData = studio['atcmodel'] || [];
  }

  // function to cancel atc edit
  cancelAtcEdit() {
    this.editAtcModel = null;
    this.editAtcModelData = [];
  }

  applyAtcEdit() {
    updateDoc(doc(this.firestore, 'queue studio pairing', this.editAtcModel), {
      atcmodel: this.editAtcModelData,
    });
    this.cancelAtcEdit();
  }

  openMandatoryEditMode(studio: any) {
    this.editMandatoryActivities = studio['docid'];
    this.editMandatoryActivitiesData = studio['mandatoryactivities'] || [];
  }

  cancelMandatoryEdit() {
    this.editMandatoryActivities = null;
    this.editMandatoryActivitiesData = [];
  }

  applyMandatoryEdit() {
    updateDoc(
      doc(this.firestore, 'queue studio pairing', this.editMandatoryActivities),
      {
        mandatoryactivities: this.editMandatoryActivitiesData,
      },
    );
    this.cancelMandatoryEdit();
  }

  filterActivityfunction() {
    const data = Object.values(this.bigActivityMap);

    data.sort((a, b) => a['activity'].localeCompare(b['activity']));
    return data;
  }

  getUniquePreAssignedTokens(studioid: string): any[] {
    if (!this.studioPreAssign[studioid]) {
      return [];
    }

    // Remove duplicates based on token docid
    const uniqueTokens = this.studioPreAssign[studioid].filter(
      (token, index, self) =>
        index === self.findIndex((t) => t['docid'] === token['docid']),
    );

    return uniqueTokens;
  }

  getStageName(token, studioid): string {
    if (!token['preassigned']) {
      return 'N/A';
    }

    const stages = Object.keys(token['preassigned']).filter((stage) => {
      const studios = token['preassigned'][stage];
      return Array.isArray(studios) && studios.includes(studioid);
    });

    return stages.length > 0 ? stages.join(', ') : 'N/A';
  }
  updatePreAssigned(studioid, value) {
    var batch = writeBatch(this.firestore);
    var selectedToken = value.map((e) => e['docid']);
    
    let stages = Object.keys(this.stageStudioMap).filter((element) => {
      let studioList = this.stageStudioMap[element].filter(
        (e) => e['docid'] == studioid,
      );
      return studioList.length > 0;
    });

    value.forEach((token) => {
      token['preassigned'] = token['preassigned'] ?? {};
      stages.forEach((stage) => {
        token['preassigned'][stage] = token['preassigned'][stage] ?? [];
        if (!token['preassigned'][stage].includes(studioid))
          token['preassigned'][stage].push(studioid);
      });

      batch.update(doc(this.firestore, 'queue_token', token['docid']), {
        preassigned: token['preassigned'],
      });
    });

    stages.forEach((stage) => {
      var assignedToken = this.queueTokenList.filter(
        (e) =>
          (e['preassigned'] ?? {})[stage] != null &&
          (e['preassigned'] ?? {})[stage] != undefined,
      );

      assignedToken.forEach((token) => {
        if (!selectedToken.includes(token['docid'])) {
          token['preassigned'] = token['preassigned'] ?? {};
          token['preassigned'][stage] = token['preassigned'][stage] ?? [];
          var index = token['preassigned'][stage].findIndex(
            (e) => e == studioid,
          );
          if (index != -1) {
            token['preassigned'][stage].splice(index, 1);

            batch.update(doc(this.firestore, 'queue_token', token['docid']), {
              preassigned: token['preassigned'],
            });
          }
        }
      });
    });
    batch.commit();
  }
  filterTokenParticipant() {
    return this.queueTokenList.filter((e) =>
      e['profile_name'].toLowerCase().includes(this.filterText.toLowerCase()),
    );
  }

  enableStduioCreateMode() {
    this.studioCreateMode = !this.studioCreateMode;
    this.newStudioPairing = [];
    if(this.studioCreateMode){
      this.createStudioCombination()
    } else {
      this.calculateUnassignedParticipants();
    }
  }

  getStudioCombination() {
    this.newStudioPairing = [];
    if (this.selectedStage) {
      const selectedQueue = this.searchableQueueList.find(
        (q) => q?.docid === this.selectedQueue,
      );
      const stageProperty = selectedQueue['stageproperty'][this.selectedStage];
      const studioCombination = {};
      var compulsoryActivity = Object.values(
        stageProperty['compulsoryactivity'] ?? {},
      );

      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination: any = compulsoryActivity[j];
        const combinationArray = Array.isArray(activitycombination)
          ? activitycombination
          : [activitycombination];
        // var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        var parse = combinationArray
          .sort((a, b) => a.toString().localeCompare(b.toString()))
          .join(',');
        var comboObject = {};
        if (combinationArray.length > 0) {
          combinationArray.forEach((activity) => {
            comboObject[activity] = (comboObject[activity] ?? 0) + 1;
          });
          studioCombination[parse] = comboObject;
        }
      }
      this.studioCombinations = studioCombination;
    }
  }

createStudioCombination() {
    this.newStudioPairing.push({
      participants: [],
      atcmodel: null,
      mandatoryActivity: null,
      openViduEnabled: false,
    });
  }

  removePairing(index) {
    this.newStudioPairing.splice(index, 1);
    this.calculateUnassignedParticipants();
  }

  getDuplicatedStudios(studioToCreate) {
    let duplicates = [];
    const participantList = studioToCreate.participants ?? [];
    for (let studio of this.studioPairingList) {
      const participants = studio['participants'] || [];
      const activityMap = studio['participantsactivity'] || {};
      const cohortActivity = this.cohort['bigactivity'];
      if (
        participants.length === participantList.length &&
        Object.values(activityMap).includes(cohortActivity)
      ) {
        const doesMatch = participantList.every((pid) => {
          if (participants.includes(pid)) {
            return true;
          }
          return false;
        });
        if (doesMatch) {
          duplicates.push(studio);
        }
      }
    }
    return duplicates;
  }

  async assignRoles() {
    const duplicateStudios = {};
    const validList = [];

    this.newStudioPairing.forEach((studio) => {
      const duplicates = this.getDuplicatedStudios(studio);
      const studiokey = (studio.participants ?? [])
        .map((pid) => this.mapProfile[pid])
        .join('x');
      if (duplicates.length > 0) {
        duplicateStudios[studiokey] = duplicates;
      } else {
        validList.push(studio);
      }
    });

    if (Object.keys(duplicateStudios).length > 0) {
      this.duplicatedStudios = duplicateStudios;
      this.duplicateModelRef = this.dialog.open(this.duplicateStudiosModel);
      this.duplicateModelRef.afterClosed().subscribe((data) => {
        if (data) {
          this.newStudioPairing = [...validList];
          this.createStudios();
          this.duplicatedStudios = null;
        }
      });
    } else {
      this.createStudios();
    }
  }

  toggleStudioInModel(studio){
    this.toggleStudio(studio);
    studio['studioin'] = !studio['studioin'];
  }
  closeDuplicateStuioModel(data: boolean = false) {
    if (this.duplicateModelRef) {
      this.duplicateModelRef.close(data);
    }
  }

  validateStudios() {
    const invalidStudios = [];
    const valid = [];

    this.newStudioPairing.forEach((studio) => {
      const participants = studio.participants ?? [];
      const atcModel = studio.atcmodel ?? [];
      const mandatoryActivity = studio.mandatoryActivity ?? [];
      if (participants.length === 0) {
        invalidStudios.push(studio);
      } else {
        valid.push(studio);
      }
    });

    if (invalidStudios.length > 0) {
      alert('Fill all the studios');
      this.newStudioPairing = [...invalidStudios, ...valid];
      return false;
    }

    return true;
  }

  async createStudios() {
    if (this.validateStudios()) {
      try {
        // 2️⃣ Create batch
        const batch = writeBatch(this.firestore);
        const cohortActivity = this.cohort['bigactivity'];

        // const pairingRef = doc(
        //   collection(this.firestore, 'queue studio pairing'),
        // );

        this.newStudioPairing.forEach((studio) => {
          const pairingRef = doc(
            collection(this.firestore, 'queue studio pairing'),
          );
          const participants = studio.participants ?? [];
          const atcmodel = studio.atcmodel ?? [];
          const mandatoryactivities = studio.mandatoryActivity ?? [];
          const participantsactivity = {};

          participants.forEach((pid) => {
            participantsactivity[pid] = cohortActivity;
          });
          // 3️⃣ Batch set
          batch.set(pairingRef, {
            created: serverTimestamp(),
            docid: pairingRef.id,
            participants,
            participantsactivity,
            queueref: doc(
              this.firestore,
              'queue generation',
              this.selectedQueue,
            ),
            studioin: false,
            atcmodel,
            mandatoryactivities: mandatoryactivities,
            openvidu: studio.openViduEnabled,
          });
        });

        // 4️⃣ Commit batch
        await batch.commit();
        this.studioCreateMode = false;
        this.newStudioPairing = [];
        this.showDisabledStudio = true;
      } catch (error) {
        console.error('Error creating studio pairing:', error);
      }
    }
  }

  showQueueSelection() {
    return (
      this.isStudioCohort() && !this.cohort['queueref']?.id && this.searchableQueueList.length > 0
    );
  }

  isStudioCohort(){
    const isStudioCohort = this.cohort['cohortCategory'] === 'studio';
    const isShadowCohort =
      this.bigActivityMap[this.cohort['bigactivity'] ?? '']?.shadow;
    return (
      isStudioCohort && isShadowCohort === false
    )
  }

  toggleSelectMode(){
    this.selectMode = !this.selectMode;
    if(!this.selectMode) this.selectedParticipantIds = new Set();
  }

  toggleParticipantSelection(profileid){
    if(this.selectedParticipantIds.has(profileid)){
      this.selectedParticipantIds.delete(profileid);
    }else{
      this.selectedParticipantIds.add(profileid);
    }
  }

  selectAllParticipants(){
    const participants = this.cohort['participantidlist'] ?? [];
    participants.forEach((profileid)=>{
      this.selectedParticipantIds.add(profileid);
    })
  }

   private cohortForSelected(cohort: any): any {
    const ids = Array.from(this.selectedParticipantIds)
    return { ...cohort, participantidlist: ids, mentors: [] }
  }
  sendSelectedNotification(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortNotification?.(this.cohortForSelected(cohort))
  }
  sendSelectedEmail(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortEmail?.(this.cohortForSelected(cohort))
  }
  sendSelectedWhatsapp(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortWhatsapp?.(this.cohortForSelected(cohort))
  }
  sendSelectedRecommendPlayist(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortRecommendedPlaylist?.(this.cohortForSelected(cohort))
  }

  sendCohortNotification(cohorts){    
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMeta[e])
    let dialogRef = this.dialog.open(AhNotificationComponent,{
      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result,'send app notificationssss');
      if(result != null && result != undefined){
        var userID = [];
        var profileID = [];
        console.log(selectedParticipants,"selectedParticipants");
        for (let i = 0; i < selectedParticipants.length; i++) {
          const selected = selectedParticipants[i];
          if(selected["firebaseuserref"] != null){
            profileID.push(selected["profileid"])
          }
        }

        var notificationimage = null
        if(result["notificationimage"] != null){
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(this.storage,filepath)
            const uploadResult = await uploadBytes(storageRef,result["notificationimage"])
            notificationimage = await getDownloadURL(uploadResult.ref)
          } catch (error) {
            console.log("file upload error",error);
          }
        }
        console.log(profileID,"profileIDprofileIDprofileIDprofileID");
        this.authguard.saveNotificationRecord({
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
  };

  sendCohortEmail(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMeta[e])
    console.log(selectedParticipants);
    
    let dialogRef = this.dialog.open(EmailInputComponent,{
      data : selectedParticipants,
      minWidth : "600px",
      disableClose:true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        console.log(result);
        
        const docRef = doc(collection(this.firestore,"email archive"),result['docid']);
        if(result['status'] == 'queued' || result['status'] == 'send'){
          await setDoc(docRef,result,{merge:true}).then(() => {
            this.authguard.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK",600);
          }).catch(err => {
            console.log(err);
            this.authguard.openSnackBar("Error Sending Email", "OK",600);
          });
        }else if (result['status'] == 'validated'){
          let url:string;
          if(environment.firebase.projectId == 'starlabs-test'){
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data),{
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log(err);
              console.log("Error: " + err);
            }
          });
        }

      }
    })
  };

  sendCohortWhatsapp(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMeta[e])
    
    let dialogRef = this.dialog.open(WatiInputComponent,{
      data : selectedParticipants,
      width : "70vw",
      height : "80vh",
      disableClose:true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        if(result == 'success') {
          this.authguard.openSnackBar("Wati Message Sent Successfully", "OK",600);
          if(result['status'] == 'sendtoparticipants'){
            let url:string;

            if(environment.firebase.projectId == 'starlabs-test'){
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
              url = ""
            } 

            const docRef = doc(collection(this.firestore , 'wati archive'), result['archiveid']);
            await updateDoc(docRef, {
              templatestatus: "created",
              templatevalidated: true,
            }).then(() => {
              console.log("Wati Archive Document Created");
            }).catch((error) => {
              console.log("Error Creating Wati Archive");
            });

            const response = await this.http.post(url, { archiveid: result['archiveid'] }).toPromise();
            console.log("Response : ",response)

          }
        } else if(result == 'failed') {
          this.authguard.openSnackBar("Sending Wati Message Failed", "OK",600);
        }
      }
    });
  };

  sendCohortRecommendedPlaylist(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMeta[e]);

    let dialogRef = this.dialog.open(MapRecommendedplaylistToparticipantComponentComponent, {
      data: {
        participantlist: selectedParticipants,
        // personalised : personalised
      },
      minWidth: "500px",
      disableClose: true
    })
    // dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
    //   if (result != null && result != undefined) {
    //     let docid = doc(collection(this.firestore, "buffermix archive")).id
    //     result['docid'] = docid
    //     setDoc(doc(this.firestore, "buffermix archive", docid), result).then(() => {
    //       console.log("buffer document created");
    //     }).catch(err => {
    //       console.log(err);
    //     })
    //   }
    // });
  }

  async loadMentors(){
    try{
      const rolesQuery = query(collection(this.firestore, "users_roles"),where("mentor", "==", true));
      const rolesSnap = await getDocs(rolesQuery);

      const mentorProfileIds: string[] = [];
      rolesSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data['profile_ref'] && data['mentor'] == true) {
          // Extract profile ID from DocumentReference
          const profileId = typeof data['profile_ref'] === 'string' 
            ? data['profile_ref'] 
            : data['profile_ref'].id;
          if (profileId) {
            mentorProfileIds.push(profileId);
          }
        }
      });
      this.mentorsList = mentorProfileIds;
    } catch (error){
      console.error('Error loading mentors:', error);
  }
  }

  toggleMentors(event : MatOptionSelectionChange){
    const cohortId = this.cohort['docid'] ?? null;
    if(cohortId){
      if(!this.isCohortUpdates) this.isCohortUpdates = true
      const docRef = doc(this.firestore , 'big cohorts' , cohortId);
      updateDoc(docRef, {
        mentors : this.selectedMentors
      });
    }
  }

  isParticipantInCohort(pid){
    const studioParticipants = pid ?? [];
    const cohortParticipants = this.cohort['participantidlist'] ?? [];
    return studioParticipants.every((pid)=>cohortParticipants.includes(pid))
  }

  onStduioParticipantDrag(event: DragEvent , participantId : string , studioIndex : number){
    if (!event.dataTransfer) return
    event.stopPropagation()
    this.dragPayload = { kind: 'studio', studioIndex , participantId  }
    event.dataTransfer.effectAllowed = 'move'
    try { event.dataTransfer.setData('text/plain', JSON.stringify(this.dragPayload)) } catch {}
  }

  onParticipantDragStart(event: DragEvent , participantId : string) {
    if (!event.dataTransfer) return
    event.stopPropagation()
    this.dragPayload = { kind: 'participant', participantId  }
    event.dataTransfer.effectAllowed = 'move'
    try { event.dataTransfer.setData('text/plain', JSON.stringify(this.dragPayload)) } catch {}
  }

  onStudioDragOver(event: DragEvent) {
    if (!this.dragPayload) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  async onStudioDrop(event: DragEvent, studioIndex: any) {
    event.preventDefault()
    event.stopPropagation()
    const payload = this.dragPayload
    this.dragPayload = null
    if (!payload || [null , undefined , ''].includes(studioIndex)) return
    if (payload.kind === 'participant' && payload.participantId) {
      this.newStudioPairing = this.newStudioPairing.map((studio , index)=>{
      if (
        index === studioIndex &&
        !(studio['participants'] ?? []).includes(payload.participantId)
      ) {
        studio['participants'] = [
          ...studio['participants'],
          payload.participantId,
        ];
      }

      return {...studio}
      });

      this.calculateUnassignedParticipants();
    } else if(payload.kind === 'studio' && payload.participantId && ![null , undefined , ''].includes(payload.studioIndex)){
      this.newStudioPairing = this.newStudioPairing.map((studio , index)=>{
      if (
        index === studioIndex &&
        !(studio['participants'] ?? []).includes(payload.participantId)
      ) {
        studio['participants'] = [
          ...studio['participants'],
          payload.participantId,
        ];
      }

      if (
        index === payload.studioIndex &&
        (studio['participants'] ?? []).includes(payload.participantId)
      ) {
        studio['participants'] = (studio['participants'] ?? []).filter((pid)=>pid !== payload.participantId);
      }

      return {...studio}
      });
    }
  }

}
