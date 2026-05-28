import { Component, inject, Inject, OnDestroy, Optional } from '@angular/core';
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
import { collection, collectionSnapshots, doc, Firestore, getDocs, orderBy, query, where, updateDoc, arrayRemove, arrayUnion, setDoc, deleteDoc, collectionData, getDoc, writeBatch } from '@angular/fire/firestore';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';


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
    NgxMatSelectSearchModule
  ],
  templateUrl: './cohort-detail.component.html',
  styleUrl: './cohort-detail.component.css',
})
export class CohortDetailComponent  implements OnDestroy {
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
  productList = []
  queueTokenList = [];
  completedToken = 0;

   editAtcModel = null;
   editAtcModelData = [];

   editMandatoryActivities = null;
   editMandatoryActivitiesData = [];

   queueTokenSubscription : Subscription


  // Maps (preferably passed in from cohort-management; only loaded if missing)
  mapProfile: { [id: string]: string } = {};
  mapParticipantMeta: { [id: string]: any } = {};
  mapMarathon: { [id: string]: any } = {};
  mapAcceleratorEvent: { [id: string]: any } = {};
  bigActivityMap: { [id: string]: any } = {};
  mapBigAssignment: { [id: string]: any } = {};
  mapParticiantsAssignments: { [cohortId: string]: any } = {};
  mapQueueName: any;
  stageTokenMap = {}
  filterText = '';

  // Studio / live-assignment data (passed in from parent)
  mapParticipantStudios: { [participantId: string]: any[] } = {};
  mapStudioPairing: { [studioId: string]: any } = {};
  mapLiveAssignmentByStudio: { [studioId: string]: any } = {};
  studioPairingList: any[] = [];
  liveAssignmentList: any[] = [];
  mapLiveParticipants: { [participantId: string]: boolean } = {};
  eventParticipationList: any[] = [];
  studioPreAssign = {}
  stageActivityParse = {};
  stageStudioMap = {}

  // Derived
  participantRows: ParticipantRow[] = [];
  contentTab: 'participants' | 'activities' | 'studios' | 'comms' =
    'participants';
  ownerList: string[] = [];
  selectedOwner: string = '';

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
    @Optional() private dialogRef: MatDialogRef<CohortDetailComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData: any,
  ) {

    getDocs(collection(this.firestore, 'products')).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.products[element['id']] = element
      }

    })

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

      // this.mapParticipantStudios = this.dialogData.mapParticipantStudios || {};
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


      this.peopleCount = this.cohort?.['participantidlist']?.length || 0;
      this.computeStats();
      this.computeActivitiesFromInjectedMaps();
      this.computeOwners();
      this.rebuildParticipantRows();
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
    this.subscription.next()
    this.subscription.complete()
  }

  /**
   * Compute top-row stats: studios paired, Q demand, event confirmed.
   */
  computeStats() {
    const participants: string[] = this.cohort?.['participantidlist'] || [];
    this.peopleCount = participants.length;

    let studiosTotal = 0;
    let studiosPaired = 0;
    let checkedIn = 0;
    let live = 0;
    participants.forEach((pid) => {
      const studios = this.mapParticipantStudios?.[pid] || [];
      studiosTotal += studios.length;
      studiosPaired += studios.filter((s: any) => s?.studioin === true).length;
      checkedIn += studios.filter((s: any) => s?.checkin === true).length;
    });
    live = participants.filter(
      (pid) => !!this.mapLiveParticipants?.[pid],
    ).length;

    this.studiosPaired =
      studiosTotal > 0 ? `${studiosPaired}/${studiosTotal}` : '—';
    this.qDemand =
      studiosTotal > 0 ? String(Math.max(0, studiosPaired - checkedIn)) : '—';

    const eventConfirmedCount = this.computeEventConfirmedCount(participants);
    this.eventConfirmed =
      this.peopleCount > 0 ? `${eventConfirmedCount}/${this.peopleCount}` : '—';

    this.checkedInCount = checkedIn;
    this.liveCount = live;
  }

  private computeEventConfirmedCount(participants: string[]): number {
    if (!participants?.length) return 0;
    const list = this.eventParticipationList || [];
    if (!list.length) return participants.length;
    const confirmedIds = new Set<string>(
      list
        .filter((e: any) => {
          const status = (e?.status || e?.eventstatus || '').toLowerCase();
          return (
            !status ||
            status === 'confirmed' ||
            status === 'active' ||
            status === 'attending'
          );
        })
        .map((e: any) => e?.participantid || e?.profileid)
        .filter(Boolean),
    );
    return participants.filter((pid) => confirmedIds.has(pid)).length;
  }

  /** Studios listing for the Studios tab */
  getCohortStudios() {
    // const participants: string[] = this.cohort?.['participantidlist'] || [];
    // const studioIndex: { [sid: string]: { studio: any, participants: Set<string>, checkedIn: number, isLive: boolean } } = {};
    // participants.forEach(pid => {
    //   const arr = this.mapParticipantStudios?.[pid] || [];
    //   arr.forEach((s: any) => {
    //     const sid = s?.studioId || s?.studioId?.toString();
    //     if (!sid) return;
    //     if (!studioIndex[sid]) {
    //       studioIndex[sid] = {
    //         studio: this.mapStudioPairing?.[sid] || s?.studioData || { id: sid },
    //         participants: new Set<string>(),
    //         checkedIn: 0,
    //         isLive: !!this.mapLiveAssignmentByStudio?.[sid],
    //       };
    //     }
    //     studioIndex[sid].participants.add(pid);
    //     if (s?.checkin === true) studioIndex[sid].checkedIn++;
    //   });
    // });
    // return Object.entries(studioIndex).map(([studioId, v]) => ({
    //   studioId,
    //   studio: v.studio,
    //   participants: Array.from(v.participants),
    //   checkedIn: v.checkedIn,
    //   isLive: v.isLive,
    // }));

    return this.studioPairingList.filter((queue) => {
      const queueId = queue['queueref']?.id;
      const bigActivity = this.cohort['bigactivity'];
      const participantsActivity = Object.values(queue['participantsactivity'] ?? {})
      return queueId === this.selectedQueue && participantsActivity.includes(bigActivity);
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

  isParticipantInStudio(participantId: string): boolean {
    const studios = this.mapParticipantStudios?.[participantId] || [];
    return studios.some((s: any) => s?.studioin === true);
  }

  isParticipantLive(participantId: string): boolean {
    return !!this.mapLiveParticipants?.[participantId];
  }

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
    if (this.dialogRef) this.dialogRef.close(result);
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

  setTab(tab: 'participants' | 'activities' | 'studios' | 'comms') {
    this.contentTab = tab;
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
    // console.log(studio["studioin"],!studio["studioin"]);
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      studioin: !studio['studioin'],
    });
  }

  toggleCheckin(studio) {
    // console.log(studio["checkin"],!studio["checkin"]);
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      checkin: !studio['checkin'],
    });
  }

  toggleOpenVidu(studio) {
    // console.log(studio["checkin"],!studio["checkin"]);
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      openvidu: !(studio['openvidu'] ?? false),
    });
  }

  deleteStudio(studio) {
    // console.log(studio['docid']);
    updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), {
      delete: true
    })
  }

  async loadLiveAssignments() {
      if (this.liveassignmentSubscription) { this.liveassignmentSubscription.unsubscribe(); }
      if (this.queuestudioSubscription) { this.queuestudioSubscription.unsubscribe(); }
      if (this.queueTokenSubscription) { this.queueTokenSubscription.unsubscribe(); }
  
      if (!this.selectedQueue) {
        this.liveAssignmentList = [];
        this.studioPairingList = [];
        this.mapLiveParticipants = {};
        this.mapStudioPairing = {};
        this.mapParticipantStudios = {};
        this.mapLiveAssignmentByStudio = {};
        return;
      }
  
      const queue = this.searchableQueueList.find((q)=>q?.docid === this.selectedQueue);
      
      this.stageActivityParse = {};
      var stageList = queue['stages'] ?? [];
      for (let i = 0; i < stageList.length; i++) {
        const stage = stageList[i];
        const stageProperty = queue['stageproperty'][stage];
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
          this.stageActivityParse[parse] = this.stageActivityParse[parse] ?? [];
          this.stageActivityParse[parse].push(stage);
        }
      }

      this.liveassignmentSubscription = collectionSnapshots(
        query(
          collection(this.firestore, "live assignment"),
          where("status", "==", "live"),
          where('queueid', 'in', [this.selectedQueue])
        )
      ).pipe(takeUntil(this.subscription)).subscribe(snapData => {
        this.liveAssignmentList = snapData.map(doc => ({ id: doc.id, ...doc.data() }));
  
        this.mapLiveAssignmentByStudio = {};
        this.liveAssignmentList.forEach((assignment: any) => {
          if (assignment['studioid']) {
            this.mapLiveAssignmentByStudio[assignment['studioid']] = assignment;
          }
        });
  
        this.updateParticipantStudioMappings();
      });
  
      const selectedQueueRef = [this.selectedQueue].map(id => doc(this.firestore, 'queue generation', id));
  
      this.queuestudioSubscription = collectionSnapshots(
        query(
          collection(this.firestore, 'queue studio pairing'),
          where("queueref", "in", selectedQueueRef),
          orderBy("created", "desc")
        )
      ).pipe(takeUntil(this.subscription)).subscribe(snapData => {
        var localMap = {};
        this.studioPairingList = snapData.map(doc => ({ id: doc.id, docid: doc.id, ...doc.data() }));
  
        this.mapStudioPairing = {};
        this.studioPairingList.forEach((studio: any) => {
          this.mapStudioPairing[studio.docid || studio.id] = studio;
        });
        for (let i = 0; i < this.studioPairingList.length; i++) {
        const studio = this.studioPairingList[i];

        var studioActivity = Object.values(studio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",");
        (this.stageActivityParse[studioActivity] ?? []).forEach(stage => {
          localMap[stage] = localMap[stage] ?? []
          if (localMap[stage].filter((e: { [key: string]: any }) => e["docid"] == studio["docid"]).length == 0) localMap[stage].push(studio)
      });

      
    }
      this.stageStudioMap = localMap
  
        this.updateParticipantStudioMappings();
      });

      if(queue !== -1){
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
    this.queueTokenSubscription = collectionData(query(collection(this.firestore, 'queue_token'), where("queueref", "==", doc(this.firestore, "queue generation", this.selectedQueue)), where("tokenstatus", "==", "Active"), orderBy("logdate", "asc"))).pipe(takeUntil(this.subscription)).subscribe(token => {
      var lastStage = queue["stages"][queue["stages"].length - 1]
      this.queueTokenList = token.sort((a, b) => (a["profile_name"] ?? "").localeCompare(b["profile_name"] ?? ""))
      this.completedToken = this.queueTokenList.filter(e => e["currentstage"] == lastStage).length
      var localPreAssign = {}
      // Group token by Stage
      this.stageTokenMap = this.queueTokenList.reduce(function (r, a) {
        // Pre Assigned
        Object.keys(a["preassigned"] ?? {}).forEach(stage => {
          (a["preassigned"][stage] ?? []).forEach(studio => {
            localPreAssign[studio] = localPreAssign[studio] ?? []
            localPreAssign[studio].push(a)
          })
        })
        // Filter Token Status
        r[a["currentstage"]] = r[a["currentstage"]] || {}
        r[a["currentstage"]]["waiting"] = r[a["currentstage"]]["waiting"] ?? 0
        r[a["currentstage"]]["queued"] = r[a["currentstage"]]["queued"] ?? 0
        r[a["currentstage"]]["instudio"] = r[a["currentstage"]]["instudio"] ?? 0
        r[a["currentstage"]]["total"] = (r[a["currentstage"]]["total"] ?? 0) + 1
        r[a["currentstage"]]["tokenlist"] = r[a["currentstage"]]["tokenlist"] ?? []
        r[a["currentstage"]]["tokenlist"].push(a)
        if (a["status"] == "ready") {
          r[a["currentstage"]]["waiting"] += 1
        }
        else if (a["status"] == null || a["status"] == "queued" || a["status"] == "invited") {
          r[a["currentstage"]]["queued"] += 1
        }
        else if (a["status"] == "instudio") {
          r[a["currentstage"]]["instudio"] += 1
        }
        return r
      }, {})
      this.studioPreAssign = localPreAssign
      // console.log(this.stageTokenMap)
      // console.log(this.studioPreAssign)
    })
    }

    updateParticipantStudioMappings() {
    this.mapLiveParticipants = {};
    this.mapParticipantStudios = {};

    this.studioPairingList.forEach((studio: any) => {
      const studioId = studio.docid || studio.id;
      const participants = studio.participants || [];
      const liveAssignment = this.mapLiveAssignmentByStudio[studioId];
      const isLive = !!liveAssignment;

      participants.forEach((participantId: string) => {
        if (!this.mapParticipantStudios[participantId]) {
          this.mapParticipantStudios[participantId] = [];
        }

        this.mapParticipantStudios[participantId].push({
          studioId: studioId,
          isLive: isLive,
          checkin: studio.checkin || false,
          studioin: studio.studioin || false,
          liveAssignment: liveAssignment,
          studioData: studio
        });

        if (isLive) {
          this.mapLiveParticipants[participantId] = true;
        }
      });
    });

    this.liveAssignmentList.forEach((assignment: any) => {
      const allParticipants = [
        ...(assignment['pairing'] || []),
        ...(assignment['bonusactivityparticipant'] || [])
      ];

      allParticipants.forEach((pid: string) => {
        this.mapLiveParticipants[pid] = true;
      });
    });
  }

  // function to open atc edit form
  openAtcEditMode(studio : any){
    this.editAtcModel = studio['docid'];
    this.editAtcModelData = studio['atcmodel'] || [];

  }

   // function to cancel atc edit
  cancelAtcEdit(){
    this.editAtcModel = null;
    this.editAtcModelData = [];
  }
  
  applyAtcEdit(){
    updateDoc(doc(this.firestore, "queue studio pairing", this.editAtcModel), {
      atcmodel : this.editAtcModelData
    })
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
    updateDoc(doc(this.firestore, "queue studio pairing", this.editMandatoryActivities), {
      mandatoryactivities: this.editMandatoryActivitiesData
    });
    this.cancelMandatoryEdit();
  }

  filterActivityfunction() {
    const data = Object.values(this.bigActivityMap)

    data.sort((a, b) => a["activity"].localeCompare(b["activity"]));
    return data
  }


  getUniquePreAssignedTokens(studioid: string): any[] {
    if (!this.studioPreAssign[studioid]) {
      return [];
    }

    // Remove duplicates based on token docid
    const uniqueTokens = this.studioPreAssign[studioid].filter((token, index, self) =>
      index === self.findIndex(t => t['docid'] === token['docid'])
    );

    return uniqueTokens;
  }

   getStageName(token, studioid): string {
    if (!token['preassigned']) {
      return 'N/A';
    }

    const stages = Object.keys(token['preassigned'])
      .filter(stage => {
        const studios = token['preassigned'][stage];
        return Array.isArray(studios) && studios.includes(studioid);
      });

    return stages.length > 0 ? stages.join(', ') : 'N/A';
  }
  updatePreAssigned(studioid, value) {
      var batch = writeBatch(this.firestore)
      var selectedToken = value.map(e => e["docid"])
      // console.log("Selected Token", selectedToken)
      // console.log("Assigned Token", assignedToken)
      let stages = Object.keys(this.stageStudioMap).filter(element => {
        let studioList = this.stageStudioMap[element].filter(e => e['docid'] == studioid);
        return studioList.length > 0;
      });

  
      value.forEach(token => {
        token["preassigned"] = token["preassigned"] ?? {}
        stages.forEach((stage) => {
          token["preassigned"][stage] = token["preassigned"][stage] ?? []
          if (!token["preassigned"][stage].includes(studioid)) token["preassigned"][stage].push(studioid)
        })
  
        batch.update(doc(this.firestore, "queue_token", token["docid"]), {
          preassigned: token["preassigned"]
        })
      })
  
      stages.forEach((stage) => {
        var assignedToken = this.queueTokenList.filter(e => (e["preassigned"] ?? {})[stage] != null && (e["preassigned"] ?? {})[stage] != undefined)
  
        assignedToken.forEach(token => {
          if (!selectedToken.includes(token["docid"])) {
            token["preassigned"] = token["preassigned"] ?? {}
            token["preassigned"][stage] = token["preassigned"][stage] ?? []
            var index = token["preassigned"][stage].findIndex(e => e == studioid)
            if (index != -1) {
              token["preassigned"][stage].splice(index, 1)
  
              batch.update(doc(this.firestore, "queue_token", token["docid"]), {
                preassigned: token["preassigned"]
              })
            }
          }
        })
      })
      batch.commit()
    }
  filterTokenParticipant() {
    return this.queueTokenList.filter(e => e["profile_name"].toLowerCase().includes(this.filterText.toLowerCase()))
  }
}
