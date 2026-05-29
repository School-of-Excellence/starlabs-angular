import { Component, OnInit, ChangeDetectorRef, QueryList, ElementRef, ViewChildren, ViewChild, NgZone, TemplateRef, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom, Subject, Subscription, takeUntil } from 'rxjs';
import { QueueInvitationApprovalComponent } from '../queue-invitation-approval/queue-invitation-approval.component';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { AssignQueueStudioComponent } from '../assign-queue-studio/assign-queue-studio.component';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AssignProcedureStudioComponent } from '../assign-procedure-studio/assign-procedure-studio.component';
import { InviteOtherStudioComponent } from '../invite-other-studio/invite-other-studio.component';
import { AcceptOtherStudioComponent } from '../accept-other-studio/accept-other-studio.component';
import { PreassignStudioComponent } from '../preassign-studio/preassign-studio.component';
import { HoldAlertDialogComponent } from '../hold-alert-dialog/hold-alert-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { collection, collectionData, doc, Firestore, getDoc, getDocs, orderBy, query, updateDoc , arrayUnion, deleteDoc, setDoc, serverTimestamp, arrayRemove, addDoc, writeBatch, collectionSnapshots, documentId, limit, where, DocumentReference, getFirestore } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { StageIncompleteConfirmationComponent } from '../stage-incomplete-confirmation/stage-incomplete-confirmation.component';
import { ViewParticipantAtcComponent } from '../../ATC/view-participant-atc/view-participant-atc.component';


@Component({
  selector: 'app-dynamic-studio-v2',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
    MatDialogModule,
    ViewParticipantAtcComponent,
  ],
  templateUrl: './dynamic-studio-v2.component.html',
  styleUrl: './dynamic-studio-v2.component.css'
})
export class DynamicStudioV2Component {
  @ViewChildren('itemElement') itemElements: QueryList<ElementRef>;
  @ViewChild('formDialogTpl') formDialogTpl!: TemplateRef<any>;
  @ViewChild('checkinConflictTpl') checkinConflictTpl!: TemplateRef<any>;
  profileRoles = {}
  profileid = null
  mapProfile = {}
  mapProfileData: any = {}
  ongoingQueueList = []
  ongoingQueue = {}
  selectedQueue = {}
  queueStudioCounts: { [queueid: string]: number } = {}
  queuesWithStudios: any[] = []
  noStudioInAnyQueue = false
  queueStudioCountSubscriptions: Subscription[] = []
  mapVariationName = {}
  queueVariation = {}
  mapQueue = {}
  // Activity
  activitySubscription:Subscription = null
  mapActivity:any = {}
  // Studio
  additionalActivities = {}
  mapStudio = {}
  studioPairingSubscription:Subscription = null
  studioList = []
  selectedStudio = {}
  availableStudioList = []
  liveStudio = []
  // Outside Studio
  outsideLiveAssignmentSubscription: Subscription = null
  outsideLiveAssignment = []
  // Studio Assignment
  liveassignmentSubscription:Subscription = null
  liveAssignment = null
  mapStudioLiveAssignment = {}
  // Token
  tokenSubscription:Subscription = null
  stageTokenList = []
  // Studio Invitation
  invitationCountdown:MatDialogRef<any> = null
  studioInvitationSubscription: Subscription
  studioInvitation = null
  studioGroupingInvitationSubscription: Subscription = null
  studioconversationSubscription: Subscription = null
  // Tokens currently being invited by ANOTHER studio in the same queue.
  // Keyed by token doc id → { studioName, specialistNames } of the inviting studio.
  // Used by the waiting-list "Bring To Studio" row to hide the CTA and show
  // an amber "Already being invited" chip instead.
  tokenInvitedByOther: { [tokenDocId: string]: { studioName?: string; specialistNames?: string[] } } = {}
  private otherStudioInvitationSubscription: Subscription = null
  private otherStudioInvitationHandle = new Subject<void>()
  // Zoom Control
  zoomlinkGenerator = false
  // ATC Property
  mapProcedure = {}
  alphaATCList = []
  unvalidatedATCList = []
  mapATCnotes = {}
  cwATClist = [] // Changework Assigned ATC
  showPreviousATC: boolean = false
  showLoveLetter: boolean = false
  loveLetterList: any[] = []
  loveLetterLoading: boolean = false
  loveLetterLoadedFor: string | null = null
  // UP Attendance
  readonly upProductIds = ['N0MhGQnxP9S8TdavuRJR', '0ayiNALL1HDVvCXDHcZ4', 'Rq9cu2Z3FSuILXdwYtca']
  participantUPVisitLabel: string | null = null
  participantUPVisitLoadedFor: string | null = null
  expandedImage: string | null = null
  // Form
  participantForm = []
  // Triple ATC
  tripleATCSubscription: Subscription
  tripleATCList = []
  // Transferred Queue
  transferredQueue = null
  
  checkinlog : any
  onhold: boolean = false;
  allStudioList = [];
  studiochatList = []
  mapProducts = {}
  mappreassignedprocedure = {}
  mappreassignedagent = {}
  chatref: any;
  chatsloading : boolean;
  messagescopy;
  messages = [];
  subscription = {};
  subscribemessagesboolean: boolean;
  selectedChat =  null;
  currentuseruid;
  currentuserData: any;
  message='';
  mapNotificationid={};
  mapProfileuid: any = {};
  selectedParticipant = false
  participantinvitationSubscription : Subscription
  private subscriptionHandle = new Subject<void>()
  messageform:FormGroup 
  chatId: any;
  pendingMessagesCount: { [key: string]: number } = {};
  isChatContainerOpen: boolean = false;
  // deleteOption : boolean = false
  // Participant AEL
  aelLevelList = []
  participantAEL = {}
  isLoadingStudios: boolean;

  // Stepper state (v2)
  activeStepId: string = ''
  private lastStepSignature: string = ''
  private userNavigated: boolean = false
  private lastAssignmentId: string = ''

  // Sidebar profile collapse state (Milestone/Product/Variation/Journey rows)
  sidebarProfileOpen: boolean = true
  toggleSidebarProfile() { this.sidebarProfileOpen = !this.sidebarProfileOpen }

  // True only when the participant is currently in the wait screen (which
  // is the moment the specialist might want to jump to the meeting button).
  // Used to gate the topbar "Jump to Meeting" CTA.
  get participantInWaitingRoom(): boolean {
    void this.presenceTick
    const la: any = this.liveAssignment || {}
    const ready = la['participantReadyAt']
    const inCall = la['participantInCallAt']
    const left = la['participantLeftAt']
    if (!ready || inCall || left) return false
    const ls = la['participantLastSeenAt']
    if (!ls) return true // legacy fallback
    const ms = typeof ls?.toMillis === 'function'
      ? ls.toMillis()
      : (ls instanceof Date ? ls.getTime() : 0)
    if (!ms) return false
    return (Date.now() - ms) < this.PARTICIPANT_PRESENCE_FRESHNESS_MS
  }

  // True when the participant is actually live in the Zoom call.
  get participantHasJoinedCall(): boolean {
    void this.presenceTick
    const la: any = this.liveAssignment || {}
    if (!la['participantInCallAt']) return false
    if (la['participantLeftAt']) return false
    const ls = la['participantLastSeenAt']
    if (!ls) return true
    const ms = typeof ls?.toMillis === 'function'
      ? ls.toMillis()
      : (ls instanceof Date ? ls.getTime() : 0)
    if (!ms) return false
    return (Date.now() - ms) < this.PARTICIPANT_PRESENCE_FRESHNESS_MS
  }

  // True when the current specialist has the mentor role. Used to gate the
  // Edit ATC button on previous-cycle ATCs (only mentors can edit them).
  get isMentor(): boolean {
    return !!this.profileRoles?.['mentor']
  }

  // Body scroll lock is done purely via CSS (:has() selector in styles.css
  // targeting .dyn-studio-v2-app) — no JS needed.

  // Studio invitation countdown (configurable via classify/studiotimer.timerinseconds)
  invitationTimerSeconds: number = 120

  // Participant's active journey name (from metadata/<profileid>.activejourney → journey/<id>)
  participantJourneyName: string | null = null
  private journeyLoadedForProfile: string = ''

  // Total ATC prescribed in the current queue session (validated + pending).
  // Used to show a "ATC prescribed for this queue" banner at the top of the studio.
  get atcInThisQueueCount(): number {
    if (!this.liveAssignment || !this.ongoingQueue) return 0
    const qid = this.ongoingQueue['docid']
    let count = 0
    for (const atc of (this.alphaATCList || [])) {
      if (atc?.['atcdata']?.['queueid'] === qid) count++
    }
    for (const atc of (this.unvalidatedATCList || [])) {
      if (atc?.['atcdata']?.['queueid'] === qid) count++
    }
    return count
  }

  // Returns the stage name immediately before the current one in the participant's
  // stage list. Used by the "Send Back" button next to Invite More.
  get previousStageName(): string | null {
    if (!this.liveAssignment) return null
    const variationId = this.liveAssignment['token']?.['variationid']
    const stageList: string[] = variationId != null
      ? (this.queueVariation[variationId] ?? [])
      : (this.ongoingQueue?.['stages'] ?? [])
    if (!stageList.length) return null
    const idx = stageList.findIndex(s => s === this.liveAssignment['stagename'])
    return idx > 0 ? stageList[idx - 1] : null
  }

  sendBack() {
    const prev = this.previousStageName
    if (!prev) {
      alert('There is no previous stage to send the participant back to.')
      return
    }
    if (!confirm(`Send participant back to the "${prev}" stage?`)) return
    this.moveStage(prev, false)
  }

  // ATC card expand/collapse state (per ATC id)
  expandedATC: { [atcid: string]: boolean } = {}
  toggleATC(atcid: string) {
    this.expandedATC[atcid] = !this.expandedATC[atcid]
  }
  isATCExpanded(atcid: string): boolean {
    return !!this.expandedATC[atcid]
  }

  // True when the participant has opened the openmeeting screen and is
  // actively present. Driven by `participantReadyAt` + a 10s heartbeat on
  // `participantLastSeenAt`. If the participant closes the tab the heartbeat
  // stops and after ~25s this flips back to false (best-effort presence).
  // Falls back to `participantReadyAt` alone if heartbeat data is missing
  // (e.g., participant is on an older build).
  readonly PARTICIPANT_PRESENCE_FRESHNESS_MS = 25000
  // Tick property only exists so change detection re-evaluates this getter
  // periodically — see participantPresenceTicker below.
  private presenceTick: number = 0
  get participantReady(): boolean {
    void this.presenceTick // ensure getter re-runs when tick increments
    const readyAt = this.liveAssignment?.['participantReadyAt']
    if (!readyAt) return false
    const lastSeen = this.liveAssignment?.['participantLastSeenAt']
    if (lastSeen) {
      const ms = typeof lastSeen?.toMillis === 'function'
        ? lastSeen.toMillis()
        : (lastSeen instanceof Date ? lastSeen.getTime() : 0)
      if (!ms) return false
      return (Date.now() - ms) < this.PARTICIPANT_PRESENCE_FRESHNESS_MS
    }
    // Legacy client (no heartbeat field) — fall back to presence-only check
    return true
  }
  private presenceTimer: any = null

  // Top-bar live status pill — pure derivation from liveAssignment + the
  // presence ticker. Returns a tone/icon/title/sub that the template binds to.
  // tones: primary | green | amber | slate. icons are Material icon names.
  get topBarStatus(): { tone: string; icon: string; title: string; sub: string } {
    void this.presenceTick // re-run on tick
    const la: any = this.liveAssignment || {}
    const readyAt = la['participantReadyAt']
    const inCallAt = la['participantInCallAt']
    const leftAt = la['participantLeftAt']
    const specialistJoinedAt = la['specialistJoinedAt']
    const lastSeen = la['participantLastSeenAt']
    const fresh = (ts: any): boolean => {
      if (!ts) return false
      const ms = typeof ts?.toMillis === 'function'
        ? ts.toMillis()
        : (ts instanceof Date ? ts.getTime() : 0)
      if (!ms) return false
      return (Date.now() - ms) < this.PARTICIPANT_PRESENCE_FRESHNESS_MS
    }

    // session ended — both participant left and call had started
    if (leftAt && specialistJoinedAt && !fresh(lastSeen)) {
      return { tone: 'slate', icon: 'check', title: 'Session ended', sub: 'The participant has disconnected' }
    }
    // participant left mid-call
    if (leftAt && specialistJoinedAt) {
      return { tone: 'amber', icon: 'logout', title: 'Participant left the meeting', sub: 'Connection dropped — waiting for them to rejoin' }
    }
    // participant in call (joined live)
    if (inCallAt && fresh(lastSeen)) {
      return {
        tone: 'primary',
        icon: 'login',
        title: 'Participant has joined',
        sub: (this.mapProfile?.[la?.['token']?.profile_id] || 'Participant') + ' is now live in the meeting'
      }
    }
    // participant ready (on meeting screen) — show review hint
    if (readyAt && fresh(lastSeen)) {
      return { tone: 'green', icon: 'videocam', title: 'Participant is waiting', sub: 'Take a moment to review the forms and ATC before starting the call.' }
    }
    if (readyAt && !lastSeen) {
      return { tone: 'green', icon: 'videocam', title: 'Participant is waiting', sub: 'Take a moment to review the forms and ATC before starting the call.' }
    }
    // default — silent (no scary "no signal" copy)
    return { tone: 'slate', icon: 'schedule', title: 'Awaiting participant', sub: 'Use this time to review the forms and ATC.' }
  }

  // ----- Studio-screen presence (writes to live assignment) -----------------
  // Heartbeat `specialistAtStudioLastSeenAt` every 10s on the currently
  // selected studio's live assignment so the arena board can tell that the
  // specialist is actually looking at the studio screen (vs. just having the
  // record around). One-shot `returnedToStudioAt` is also written the first
  // time we hit a beat with `specialistJoinedAt` already set on the
  // assignment (i.e. the specialist came back after a call had started).
  private studioPresenceTimer: any = null
  private readonly STUDIO_PRESENCE_HEARTBEAT_MS = 10000
  private studioReturnStampedFor = new Set<string>()

  private startStudioPresence() {
    if (this.studioPresenceTimer) return
    this.beatStudioPresence()
    this.studioPresenceTimer = setInterval(
      () => this.beatStudioPresence(),
      this.STUDIO_PRESENCE_HEARTBEAT_MS
    )
  }

  private beatStudioPresence() {
    const docid: string = this.liveAssignment?.['docid']
    if (!docid) return
    const update: any = { specialistAtStudioLastSeenAt: serverTimestamp() }
    // One-shot: stamp `returnedToStudioAt` the first time we beat against this
    // assignment AFTER its call has started (specialistJoinedAt set) and we
    // haven't stamped it already this session.
    const callStarted = !!this.liveAssignment?.['specialistJoinedAt']
    const alreadyOnDoc = !!this.liveAssignment?.['returnedToStudioAt']
    if (callStarted && !alreadyOnDoc && !this.studioReturnStampedFor.has(docid)) {
      update.returnedToStudioAt = serverTimestamp()
      this.studioReturnStampedFor.add(docid)
    }
    updateDoc(doc(this.firestore, 'live assignment', docid), update)
      .catch(err => console.warn('Studio presence beat failed', err))
  }

  private stopStudioPresence() {
    if (this.studioPresenceTimer) {
      clearInterval(this.studioPresenceTimer)
      this.studioPresenceTimer = null
    }
  }

  // Helper: count specialists across all activities in an ATC
  countSpecialists(atc: any): number {
    const bigactivity = atc?.atcdata?.bigactivity || {}
    let total = 0
    Object.values(bigactivity).forEach((arr: any) => {
      if (Array.isArray(arr)) total += arr.length
    })
    return total
  }

  // Helper: count procedures across all adjustments in an ATC
  countProcedures(atc: any): number {
    const items = atc?.transcription || atc?.adjustments || []
    let total = 0
    items.forEach((adj: any) => {
      if (adj?.procedure && Array.isArray(adj.procedure)) total += adj.procedure.length
    })
    return total
  }

  get visibleSteps(): { id: string, label: string, icon: string, color: string }[] {
    if (!this.liveAssignment) return []
    const stagename = this.liveAssignment['stagename']
    const stageprop = this.ongoingQueue?.['stageproperty']?.[stagename] || {}
    const widgets: string[] = stageprop?.studiowidgets || []
    const steps: { id: string, label: string, icon: string, color: string }[] = []

    // 1. Submitted form(s) - Current uP! cycle
    if (this.participantForm && this.participantForm.length) {
      steps.push({ id: 'current-forms', label: 'Submitted Forms', icon: 'description', color: '#0ea5e9' })
    }

    // 2. ATC & Love Letter - Previous uP! cycle(s)
    if (widgets.includes('previousatc') || widgets.includes('loveletters')) {
      steps.push({ id: 'prev-history', label: 'Previous ATC & Love Letters', icon: 'history', color: '#84cc16' })
    }

    // 3. View submitted ATC - Current uP! cycle
    if (widgets.includes('prescribedvalidatedatc') ||
        widgets.includes('prescribedunvalidatedatc') ||
        widgets.includes('assignedatc') ||
        widgets.includes('viewtripleatc')) {
      steps.push({ id: 'view-atc', label: 'View Submitted ATC', icon: 'fact_check', color: '#22c55e' })
    }

    // 4. Zoom session — the meeting itself (always shown)
    steps.push({ id: 'getstarted', label: 'Zoom Session', icon: 'videocam', color: '#4f46e5' })

    // 5. Prescribe ATC — only when there's an actual prescribe / assign action
    // for the stage. The shared list widgets (validated/unvalidated/triple)
    // are kept inside this step as supporting reference but they alone are
    // not enough to justify the step (they're already in Step 3 "View Submitted ATC").
    if (widgets.includes('addunvalidatedatc') ||
        widgets.includes('addvalidatedatc') ||
        widgets.includes('assignprocedure')) {
      steps.push({ id: 'prescribe-atc', label: 'Prescribe ATC', icon: 'add_circle', color: '#ef4444' })
    }

    // 6. AEL validation
    if (widgets.includes('validateael')) {
      steps.push({ id: 'ael-validation', label: 'AEL Validation', icon: 'verified', color: '#14b8a6' })
    }

    // 7. Mark as completed
    if (widgets.includes('movetonextqueue') || stageprop?.nextstage?.length) {
      steps.push({ id: 'mark-completed', label: 'Mark as Completed', icon: 'flag', color: '#a855f7' })
    }

    // Reset userNavigated flag when the live assignment changes (new session)
    const assignmentId = this.liveAssignment?.['docid'] || this.liveAssignment?.['token']?.tokenid || ''
    if (assignmentId !== this.lastAssignmentId) {
      this.lastAssignmentId = assignmentId
      this.userNavigated = false
    }

    // Re-sync active step whenever the step list changes
    const signature = steps.map(s => s.id).join('|')
    if (signature !== this.lastStepSignature) {
      this.lastStepSignature = signature
      // If user hasn't navigated, always snap to first step (handles async step inserts).
      // If user has navigated and their step disappeared, also reset.
      if (!this.userNavigated || !steps.find(s => s.id === this.activeStepId)) {
        this.activeStepId = steps[0]?.id || ''
      }
    }

    return steps
  }

  setActiveStep(id: string) {
    this.activeStepId = id
    this.userNavigated = true
  }

  goToStep(offset: number) {
    const steps = this.visibleSteps
    const idx = steps.findIndex(s => s.id === this.activeStepId)
    const next = Math.max(0, Math.min(steps.length - 1, idx + offset))
    this.activeStepId = steps[next]?.id || this.activeStepId
    this.userNavigated = true
  }

  getStepIndex(id: string): number {
    return this.visibleSteps.findIndex(s => s.id === id)
  }

  isStepCompleted(id: string): boolean {
    const steps = this.visibleSteps
    const activeIdx = steps.findIndex(s => s.id === this.activeStepId)
    const idx = steps.findIndex(s => s.id === id)
    return idx >= 0 && idx < activeIdx
  }

  // If `mapProfile` doesn't yet have the participant (they were created/added
  // after the initial profile map load), fetch their profile doc on the fly
  // so the UI shows their name/avatar without needing a page refresh.
  private profilesBeingFetched = new Set<string>()
  async ensureProfileLoaded(profileid: string) {
    if (!profileid) return
    if (this.mapProfile?.[profileid]) return
    if (this.profilesBeingFetched.has(profileid)) return
    this.profilesBeingFetched.add(profileid)
    try {
      const snap = await getDoc(doc(this.firestore, 'profile_data', profileid))
      if (snap.exists()) {
        const data: any = snap.data()
        this.mapProfile = { ...this.mapProfile, [profileid]: data?.name || data?.fullname || 'Participant' }
        this.mapProfileData = { ...this.mapProfileData, [profileid]: data }
      }
    } catch (err) {
      console.warn('Could not lazy-load participant profile', profileid, err)
    } finally {
      this.profilesBeingFetched.delete(profileid)
    }
  }

  // Fetch the participant's active journey name (from metadata/<profileid>.activejourney → journey/<id>).
  // Idempotent per participant id; safe to call repeatedly.
  async fetchParticipantJourney(profileid: string) {
    if (!profileid || this.journeyLoadedForProfile === profileid) return
    this.journeyLoadedForProfile = profileid
    this.participantJourneyName = null
    console.log('[Journey] fetching metadata for profile', profileid)
    try {
      const metaSnap = await getDoc(doc(this.firestore, 'metadata', profileid))
      if (!metaSnap.exists()) {
        console.warn('[Journey] metadata doc does not exist for', profileid)
        return
      }
      const metaData: any = metaSnap.data()
      console.log('[Journey] metadata doc data:', metaData)
      const journeyId = metaData?.activejourney
      if (!journeyId) {
        console.warn('[Journey] activejourney field is empty on metadata', profileid)
        return
      }
      console.log('[Journey] resolving journey doc', journeyId)
      const journeySnap = await getDoc(doc(this.firestore, 'journey', journeyId))
      if (!journeySnap.exists()) {
        console.warn('[Journey] journey doc not found:', journeyId)
        // Fall back to showing the ID so something appears
        this.participantJourneyName = journeyId
        return
      }
      const data: any = journeySnap.data()
      console.log('[Journey] journey data:', data)
      this.participantJourneyName = data?.journeyname || data?.name || data?.title || journeyId
    } catch (err) {
      console.warn('Could not fetch participant journey', err)
    }
  }

  // Fetch configurable invitation countdown duration (in seconds) from classify/studiotimer
  async fetchInvitationTimerSeconds() {
    try {
      const snap = await getDoc(doc(this.firestore, 'classify', 'studiotimer'))
      if (snap.exists()) {
        const data: any = snap.data()
        const value = Number(data?.timerinseconds)
        if (!isNaN(value) && value > 0) {
          this.invitationTimerSeconds = value
        }
      }
    } catch (err) {
      console.warn('Could not fetch classify/studiotimer.timerinseconds — using default', err)
    }
  }

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public dialog: MatDialog,
    public http: HttpClient,
    public router: Router,
    private cdr: ChangeDetectorRef,
    public snackBar: MatSnackBar,
    public formbuilder: FormBuilder,
    private ngZone: NgZone,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer
  ) {
    const overrideProfileId = this.route.snapshot.queryParamMap.get('profileid')
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Loading..."},
      disableClose: true
    })
    this.messageform = this.formbuilder.group({
      sms : [''],
      files: [[],],
    });

    // Kick off the timer fetch early so it's available before any invitation is sent
    this.fetchInvitationTimerSeconds()

    // Periodically re-evaluate participant presence freshness (5s tick)
    this.startPresenceTicker()

    guard.getRoles().then(async roles=>{
      this.profileRoles = roles
      this.profileid = overrideProfileId || roles['profile_ref'].id
      // if(environment.firebase.projectId == "fir-sample-aae4a" && this.profileid == 'l0ApFnXuM5Ac8tpqJQnk'){
      //   this.deleteOption = true
      // }else if(environment.firebase.projectId == "starlabs-test" && this.profileid == 'g2mQ7GiD6PSV8oaZnZLb'){
      //   this.deleteOption = true
      // }else{this.deleteOption = false}
      // fetch user data
      await getDoc(roles['profile_ref']).then((profileDoc) => {
        if (profileDoc.exists()) {
          this.currentuserData = profileDoc.data();
          this.currentuseruid = profileDoc.data()['user_ref'].id;        
        }
      });
      // get atcmodel
      await getDocs(collection(this.firestore, 'products')).then(snap => {
        for (let i = 0; i < snap.docs.length; i++) {
          const element = snap.docs[i].data();
          this.mapProducts[element['id']] = element['atcmodel']
        }
      })
      // if(roles["eis"] || roles["changeagent"] || roles["ah"] || roles["admin"] || roles["developer"]){
        await getDocs(query(collection(this.firestore, 'queue generation'), where("queueenddate", ">=", new Date()))).then(async queue=>{
          var activeQueueList = queue.docs.filter(e => e.data()["queuestartdate"].toDate() <= new Date()) // Find Ongoing Queue
          var live = []
          activeQueueList.forEach(e =>{
            var data = e.data()
            live.push(data)
            this.mapQueue[e.id] = e.data()["queuename"]
          })
          this.ongoingQueueList = live
          if(this.ongoingQueueList.length != 0){
            await this.loadQueueStudioCounts()
            const firstWithStudios = this.ongoingQueueList.find(q => (this.queueStudioCounts[q['docid']] || 0) > 0)
            this.noStudioInAnyQueue = !firstWithStudios
            this.ongoingQueue = firstWithStudios || this.ongoingQueueList[0]
            this.selectedQueue = this.ongoingQueue
            await this.onQueueSelect()
            const profileMap = await guard.getProfileMap()
            this.mapProfile = profileMap.map
            this.mapProfileData = profileMap.docdata
          }
        })
      // }
      loading.close()
      if(this.ongoingQueue["docid"] == null || this.ongoingQueue["docid"] == undefined){
        alert("No Active Queue Found.")
      }
        //
      // })
    })
      //fetch profilelist and user list
      collectionData(query(collection(this.firestore, 'profile_data'), orderBy('name','asc')), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe((profileDoc)=>{
        // this.profileList = [];
        // this.userListId=[];
        this.mapNotificationid={};
        for (let i = 0; i < profileDoc.length; i++) {
          const element = profileDoc[i];
          // this.profileList.push(profileDoc[i].payload.doc.id);
  
          if(![null,undefined,''].includes(element['notification_token']) ){
            this.mapNotificationid[element['user_ref'].id] = element['notification_token']
          }
          
          if(element['user_ref'] != null || element['user_ref'] != undefined){
            // this.userListId.push(element['user_ref'].id);
            this.mapProfileuid[element['user_ref'].id] = element
          }
        }
      });
  }

  ngOnInit(): void {
    this.guard.getProcedureMap().then(value => this.mapProcedure = value)
    collectionData(collection(this.firestore,"bigactivity"), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(list=>{
      list.forEach(data=>{
        this.mapActivity[data["docid"]] = data["activity"]
      })
    })
    this.enableZoomLinkGenerator()
    // Start the studio-presence heartbeat. It writes only when there is a
    // currently selected studio with a live assignment, so an idle / empty
    // studio screen produces no writes.
    this.startStudioPresence()
  }

  ngOnDestroy(){
   this.subscriptionHandle.complete();
   this.subscriptionHandle.next();
   if (this.presenceTimer) { clearInterval(this.presenceTimer); this.presenceTimer = null }
   this.stopStudioPresence()
  }

  // Trigger periodic change detection so `participantReady` re-evaluates
  // its freshness check even when the live-assignment doc hasn't changed
  // (i.e., when the participant's heartbeats have stopped).
  private startPresenceTicker() {
    if (this.presenceTimer) return
    this.ngZone.runOutsideAngular(() => {
      this.presenceTimer = setInterval(() => {
        this.ngZone.run(() => { this.presenceTick++ })
      }, 5000)
    })
  }

  processMessage(message: string): string {
    if (!message) return '';
    
    // Handle linebreaks and links in one go
    let processed = message.replace(/\n/g, '<br>');
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    processed = processed.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
    
    return processed;
  }

  resetSubscription(){
    this.studioPairingSubscription?.unsubscribe()
    this.liveassignmentSubscription?.unsubscribe()
    this.tokenSubscription?.unsubscribe()
    this.studioInvitationSubscription?.unsubscribe()
    this.studioGroupingInvitationSubscription?.unsubscribe()
    this.tripleATCSubscription?.unsubscribe()
    this.outsideLiveAssignmentSubscription?.unsubscribe()
    this.studioconversationSubscription?.unsubscribe()
    this.otherStudioInvitationSubscription?.unsubscribe()

    this.studioPairingSubscription = null
    this.liveassignmentSubscription = null
    this.tokenSubscription = null
    // this.studioInvitationSubscription = null
    this.studioGroupingInvitationSubscription = null
    this.tripleATCSubscription = null
    this.outsideLiveAssignmentSubscription = null
    this.studioconversationSubscription = null
    this.otherStudioInvitationSubscription = null
    this.tokenInvitedByOther = {}
  }

  /**
   * Subscribe to pending studio invitations for the CURRENT queue that were
   * sent from a studio OTHER than the one this specialist is in. Populates
   * `tokenInvitedByOther` (keyed by token doc id) so the waiting-list row can
   * hide the "Bring To Studio" CTA and show an amber chip instead.
   *
   * Re-runs whenever the selected studio changes (we filter by
   * `studioid !== selectedStudio.docid` in the snapshot).
   */
  private subscribeOtherStudioInvitations(){
    if (!this.ongoingQueue?.['docid']) return
    // Tear down the previous handle so any in-flight stream stops, then
    // make a fresh one for the new selected studio.
    this.otherStudioInvitationHandle.next()
    this.otherStudioInvitationSubscription?.unsubscribe()
    this.tokenInvitedByOther = {}

    const queueRef = doc(this.firestore, 'queue generation', this.ongoingQueue['docid'])
    this.otherStudioInvitationSubscription = collectionData(
      query(
        collection(this.firestore, 'studioinvitation'),
        where('queueref', '==', queueRef),
        where('status', '==', 'pending'),
        where('expirydate', '>=', new Date()),
      ),
      { idField: 'id' }
    ).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.otherStudioInvitationHandle)).subscribe(invitations => {
      const next: { [tokenDocId: string]: { studioName?: string; specialistNames?: string[] } } = {}
      const selfStudio = this.selectedStudio?.['docid']
      for (const inv of (invitations || [])) {
        const invStudio = inv['studioid']
        if (!invStudio || invStudio === selfStudio) continue
        const tokenRef: any = inv['tokenref']
        const tokenDocId = tokenRef?.id
          ?? (typeof tokenRef?.path === 'string' ? tokenRef.path.split('/').pop() : null)
        if (!tokenDocId) continue
        // Skip terminal client responses
        const clientResp = inv['clientresponse']
        if (clientResp === 'denied') continue
        const studio = this.mapStudio?.[invStudio] || {}
        const studioName = studio?.['studioname'] || studio?.['name'] || 'another studio'
        const specialistIds: string[] = Array.isArray(inv['specialistpairing'])
          ? inv['specialistpairing']
          : (Array.isArray(studio?.['participants']) ? studio['participants'] : [])
        const specialistNames = specialistIds
          .map(p => this.mapProfile?.[p])
          .filter(n => !!n)
        next[tokenDocId] = { studioName, specialistNames }
      }
      this.tokenInvitedByOther = next
    })
  }

  compareFn(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
  }


  async loadQueueStudioCounts(){
    // Cleanup any previous subscriptions
    this.queueStudioCountSubscriptions.forEach(s => s?.unsubscribe())
    this.queueStudioCountSubscriptions = []
    this.queueStudioCounts = {}
    this.queuesWithStudios = []

    const refs = this.ongoingQueueList.map(q => doc(this.firestore, 'queue generation', q['docid']))
    const chunks: DocumentReference[][] = []
    for (let i = 0; i < refs.length; i += 30) chunks.push(refs.slice(i, i + 30))
    if (chunks.length === 0) return

    const chunkResults: { [qid: string]: number }[] = chunks.map(() => ({}))
    let firstEmitCount = 0
    const resolveFirst: { resolve?: () => void } = {}
    const firstEmitPromise = new Promise<void>(res => (resolveFirst.resolve = res))

    chunks.forEach((chunk, idx) => {
      const sub = collectionData(query(
        collection(this.firestore, 'queue studio pairing'),
        where('studioin', '==', true),
        where('participants', 'array-contains', this.profileid),
        where('queueref', 'in', chunk)
      )).pipe(takeUntil(this.subscriptionHandle)).subscribe((studios: any[]) => {
        const local: { [qid: string]: number } = {}
        studios.forEach(s => {
          if (s['delete']) return
          const qid = s['queueref']?.id
          if (!qid) return
          local[qid] = (local[qid] || 0) + 1
        })
        const isFirst = Object.keys(chunkResults[idx]).length === 0 && !(chunkResults[idx] as any).__seeded
        ;(chunkResults[idx] as any).__seeded = true
        chunkResults[idx] = local
        this.recomputeQueueStudioCounts(chunkResults)
        if (isFirst) {
          firstEmitCount += 1
          if (firstEmitCount === chunks.length) resolveFirst.resolve?.()
        }
      })
      this.queueStudioCountSubscriptions.push(sub)
    })

    await firstEmitPromise
  }

  private recomputeQueueStudioCounts(chunkResults: { [qid: string]: number }[]){
    const merged: { [qid: string]: number } = {}
    chunkResults.forEach(chunk => {
      Object.keys(chunk).forEach(qid => {
        if (qid === '__seeded') return
        merged[qid] = (merged[qid] || 0) + chunk[qid]
      })
    })
    this.queueStudioCounts = merged
    this.queuesWithStudios = this.ongoingQueueList.filter(q => (merged[q['docid']] || 0) > 0)
    this.noStudioInAnyQueue = this.queuesWithStudios.length === 0
    // If currently selected queue lost all studios, pick another (but don't interrupt a live session)
    const currentId = this.ongoingQueue?.['docid']
    const currentStillHas = currentId && (merged[currentId] || 0) > 0
    if (!currentStillHas && this.liveStudio.length === 0 && this.queuesWithStudios.length > 0) {
      const next = this.queuesWithStudios[0]
      if (next && next['docid'] !== currentId) {
        this.ongoingQueue = next
        this.selectedQueue = next
        this.onQueueSelect()
      }
    }
  }

  selectQueueCard(queue: any){
    if (queue['docid'] === this.ongoingQueue['docid']) return
    this.checkoutQueue()
    this.ongoingQueue = queue
    this.selectedQueue = queue
    this.onQueueSelect()
  }

  async onQueueSelect(){
    this.resetSubscription()
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Switching Queue..."},
      disableClose: true
    })
    this.getOutsideStudio()
    // this.getStudio()
    await getDocs(query(collection(this.firestore,"queue variation"), where("queueref",'==', doc(this.firestore,"queue generation",this.ongoingQueue["docid"])))).then(variation =>{
      variation.docs.forEach(doc =>{
        var variationData = doc.data()
        this.mapVariationName[doc.id] = variationData["variationname"]
        this.queueVariation[doc.id] = variationData["stages"]
      })
    })
    await this.getStudio()
    loading.close()
  }

  checkoutQueue(){
    console.log("Check out", this.selectedQueue)
    if(this.selectedQueue != null && this.selectedQueue["docid"] != this.ongoingQueue["docid"]){
      var checkoutID = this.selectedQueue["docid"]
      this.selectedQueue = this.ongoingQueue
      getDocs(query(collection(this.firestore,"queue studio pairing"), where("participants", "array-contains", this.profileid) , where("queueref", "==", doc(this.firestore,"queue generation",checkoutID)))).then(pairing=>{
        pairing.forEach(doc=>{
          updateDoc(doc.ref , {
            checkin: false
          })
         
        })
      })
    }
  }

  enableZoomLinkGenerator(){
    this.zoomlinkGenerator = false
    setTimeout(() => this.zoomlinkGenerator = true, 10000)
  }

  getOutsideStudio(){
    collectionData(query(collection(this.firestore,"live assignment"), where("queueid", "==", this.ongoingQueue["docid"]),where("status", "==", "live"),where("bonusactivityparticipant", "array-contains", this.profileid)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(assignment=>{
      this.outsideLiveAssignment = assignment
    })
  }

  async visitOtherStudio(liveassignment){
    console.log(liveassignment)
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Joining Studio..."},
      disableClose: true
    })

    const studioid = liveassignment["studioid"]
    var openViduEnabled = false
    await getDoc(doc(this.firestore, "queue studio pairing", studioid)).then(studioDoc =>{
      if(studioDoc.exists()){
        openViduEnabled = studioDoc.data()["openvidu"]
      }
    })
    loading.close()

    var joinurl = null
    if(openViduEnabled){
      joinurl = this.router.createUrlTree(['/joinroom', liveassignment['docid']])
    }
    else{
      var joinurl = (liveassignment["zoomdata"] ?? {})["join_url"]
    }

    if(joinurl != null && joinurl != undefined){
      if(confirm("Join Now!")){
        window.open(joinurl, '_blank')
      }
    }
    else{
      alert("Unable to join in the moment.")
    }
  }

  async getStudio(){
    this.selectedStudio = {}
    this.liveAssignment = null
    this.isLoadingStudios = true;
    // .where("participants", "array-contains", this.profileid)
    this.studioPairingSubscription = collectionData(query(collection(this.firestore,"queue studio pairing"), where("studioin", "==", true),where("queueref", "==", doc(this.firestore,"queue generation",this.ongoingQueue["docid"])))).pipe(takeUntil(this.subscriptionHandle)).subscribe(studio=>{
      this.mapStudio = studio.reduce(function(r, a){
        r[a["docid"]] = r[a["docid"]] || {}
        r[a["docid"]] = a
        return r
      }, {})
      this.availableStudioList = studio.filter(e => e["checkin"] && [null, undefined, false].includes(e['delete']))
      this.allStudioList = studio
      this.studioList = studio.filter(e => e["participants"].includes(this.profileid) && [null, undefined, false].includes(e['delete']))
      console.log(this.studioList, 'this.studioList');
      
      this.liveStudio = this.studioList.filter(e => e["status"] == "live")
      console.log("Live Studio", this.liveStudio)
      this.isLoadingStudios = false;
      // Keep the "Already being invited" chip current whenever the studio
      // list (and therefore mapStudio) changes.
      this.subscribeOtherStudioInvitations()
      if(this.studioList.length == 0 && !this.isLoadingStudios){
        this.selectedStudio = {}
        this.liveAssignment = null
        this.stageTokenList = []
      }
      else{
        this.selectedStudio = this.studioList.find(e => e["docid"] == this.selectedStudio["docid"]) ?? {}
        if(Object.values(this.selectedStudio).length == 0){
          this.liveAssignment = null
          this.stageTokenList = []
        }
        // Check if Studio Grouping Invitation is Sent
        var involvedStudio = this.studioList.map(e => e["docid"])
        // if(this.studioGroupingInvitationSubscription == null){
          collectionData(query(collection(this.firestore,"studioinvitation"), where("type", "==", "stagegrouping"),where("status", "==", "pending"),where("invitedstudio", "array-contains-any", involvedStudio)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(studioInvitation=>{
            for (let i = 0; i < studioInvitation.length; i++) {
              const invitation = studioInvitation[i];
              var matchedstudio = invitation["invitedstudio"].find(studio => involvedStudio.includes(studio))
              if(matchedstudio != null && matchedstudio != undefined && !invitation["acceptedstudio"].includes(matchedstudio)){
                // TODO Open Invitation Dialog
                console.log(matchedstudio, invitation["docid"])
                this.dialog.open(AcceptOtherStudioComponent, {
                  data: {
                    mapprofile: this.mapProfile,
                    invitation: invitation
                  }
                }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result => {
                  if (result == "success") {
                    updateDoc(doc(this.firestore, "studioinvitation", invitation["docid"]), {
                      acceptedstudio: arrayUnion(matchedstudio)
                    });
                  } else {
                    updateDoc(doc(this.firestore, "studioinvitation", invitation["docid"]), {
                      deniedstudio: arrayUnion(matchedstudio)
                    });
                  }
                });
                break;
              }
            }
          })
        // }
        
        // Check if Live Assignment is On
        var studioID = this.studioList.map(e => e["docid"])
        if(this.liveassignmentSubscription == null){
          collectionData(query(collection(this.firestore,"live assignment"), where("queueid", "==", this.ongoingQueue["docid"]),where("status", "==", "live"),where("studioid", "in", studioID)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(assignment=>{
            var activeStudio = []
            assignment.forEach(e =>{
              activeStudio.push(e["studioid"])
              this.mapStudioLiveAssignment[e["studioid"]] = e
            })
            studioID.forEach(e =>{
              if(!activeStudio.includes(e)){
                this.mapStudioLiveAssignment[e] = null
              }
            })
            if(this.mapStudioLiveAssignment[this.selectedStudio["docid"]] != null && this.mapStudioLiveAssignment[this.selectedStudio["docid"]] != undefined){
              this.liveAssignment = {
                ...{token: (this.liveAssignment ?? {})["token"]},
                ...this.mapStudioLiveAssignment[this.selectedStudio["docid"]]
              }
              // Fetch the participant's active journey + ensure their profile
              // is in mapProfile (in case they were created after the initial load).
              const profId = this.liveAssignment?.['participantid'] || this.liveAssignment?.['token']?.['profile_id']
              if (profId) {
                this.ensureProfileLoaded(profId)
                this.fetchParticipantJourney(profId)
              }
            }
            else{
              this.liveAssignment = null
              this.participantJourneyName = null
              this.journeyLoadedForProfile = ''
            }
          })
        }
        // Check Invitation Sent
        if(!!this.studioInvitationSubscription && !this.studioInvitationSubscription.closed){
          console.log("studioInvitationSubscription","subscribed");
          this.studioInvitationSubscription.unsubscribe()
        }
        if(!this.studioInvitationSubscription){
          console.log(this.studioInvitationSubscription, 'studioInvitationSubscription');
          
          collectionData(query(collection(this.firestore,"studioinvitation"), where("specialistpairing", 'array-contains', this.profileid),where("queueref", '==', doc(this.firestore,'queue generation',this.ongoingQueue["docid"])),where("studioid", "in", studioID),where("expirydate", ">=", new Date())), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async invitationSnap => {
          // this.studioInvitationSubscription = this.firestore.collection("studioinvitation", ref => ref.where("specialistpairing", 'array-contains', this.profileid).where("queueref", '==', this.firestore.collection("queue generation").doc(this.ongoingQueue["docid"]).ref).where("studioid", "in", studioID).where("expirydate", ">=", new Date())).valueChanges().subscribe(async invitationSnap => {
            console.log(invitationSnap)
            // Scenario: Invitation Approved by Participant (Invitation is saved from previous snapshot)
            if(this.invitationCountdown != null){
              this.studioInvitation = invitationSnap.find(e => e["docid"] == (this.studioInvitation ?? {})["docid"])
              console.log("Countdown is on....", this.studioInvitation)
              if(this.studioInvitation == undefined){
                this.invitationCountdown?.close()
                this.invitationCountdown = null
                this.studioInvitation = null
                alert("The invitation expired.")
              }
              else if(this.studioInvitation["clientresponse"] == "approved" || this.studioInvitation["clientresponse"] == "denied"){
                // Force close the dialog
                if(this.invitationCountdown != null){
                  this.invitationCountdown.close()
                  this.invitationCountdown = null
                }
                
                if(this.studioInvitation["clientresponse"] == "approved"){
                  const approvedInvitation = Object.assign({}, this.studioInvitation);
                  if(this.studioInvitation['createdby'] && this.studioInvitation['createdby'] === this.profileid){
                    this.assignStudio(approvedInvitation); 
                  }
                  this.studioInvitation = null;
                }
                else{
                  this.studioInvitation = null
                  alert("Participant denied to join the session.")
                }
              }
            }
            else{
              if(invitationSnap.length != 0){
                if(this.selectedStudio["docid"] == null || this.selectedStudio["docid"] == undefined){
                  // Scenario: Checking if any sent invitation is yet to approved by participant (Auto select studio from the invitation if not any studio is opened by B!G Participant)
                  this.studioInvitation = invitationSnap.find(e => e["clientresponse"] == null) ?? null
                  console.log("Selected Invitation", this.studioInvitation)
                  if(this.studioInvitation != null && this.studioInvitation != undefined){
                    this.selectedStudio = this.studioList.find(e => e["docid"] == this.studioInvitation["studioid"]) ?? {}
                    this.onStudioSelect(this.selectedStudio)
                  }
                }
                else{
                  // Scenario: Checking if any sent invitation is yet to approved by participant (Studio is already Opened by B!G Participant)
                  this.studioInvitation = invitationSnap.find(e => e["studioid"] == this.selectedStudio["docid"] && e["clientresponse"] == null) ?? null
                  console.log("Selected Studio Invitation", this.studioInvitation)
                }
                if(this.studioInvitation != null && this.studioInvitation != undefined){
                  console.log('checking......');
                  
                  // Open Invitation Countdown
                  if(this.invitationCountdown == null){
                    this.invitationCountdown = this.dialog.open(QueueInvitationApprovalComponent,{
                      disableClose:true,
                      data: this.studioInvitation,
                      maxHeight: "90vh",
                      maxWidth: '95vw',
                    })
                  }
                  // Denied by B!G Participant
                  this.invitationCountdown?.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
                    console.log(result)
                    if(result == "invitation cancelled"){
                      deleteDoc(doc(this.firestore, 'studioinvitation', this.studioInvitation["docid"])).catch(err=>{
                        console.log(err)
                      }).catch(err =>{
                        console.log(err)
                      })
                    }
                    this.studioInvitation = null
                    this.invitationCountdown = null
                  })
                }
              }
              else{
                this.studioInvitation = null
              }
            }
          })
        }
      }
    })
  }

  async onStudioSelect(studio){
    console.log("****** studio select ******");
    
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Setting up Studio..."},
      disableClose: true
    })
    this.selectedParticipant = false
    this.selectedStudio = studio
    console.log(this.selectedStudio)
    this.liveAssignment = this.mapStudioLiveAssignment[this.selectedStudio["docid"]] ?? null
    console.log(this.liveAssignment, 'this.liveAssignment');
    // Switching the active studio changes which invitations count as
    // "another studio's" — re-derive the chip map.
    this.subscribeOtherStudioInvitations()
    
    var studioStage = []
    // List Eligible Stages and Token
    var activityParse = Object.values(this.selectedStudio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
    console.log(activityParse)
    var stageList = this.ongoingQueue["stages"] ?? []
    for (let i = 0; i < stageList.length; i++) {
      const stage = stageList[i]
      console.log(stage, 'stage');
      
      const stageProperty = this.ongoingQueue["stageproperty"][stage];
      console.log(stageProperty, 'stageProperty');
      
      var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
      console.log(compulsoryActivity, 'compulsoryActivity');
      
      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination:any = compulsoryActivity[j];
        const combinationArray = Array.isArray(activitycombination) ? activitycombination : [activitycombination];
        var parse = combinationArray.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        // var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        console.log(parse);
        
        if(parse == activityParse){
          studioStage.push(stage)
        }
      }
    }
     // get studioconversation
    collectionData(query(collection(this.firestore,"studio conversation"), where('studioid', 'array-contains', this.selectedStudio['docid'])), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async snap => {
      this.studiochatList = snap;
      console.log(this.studiochatList);

      const messagePromises = this.studiochatList.map(async doc => {
        console.log(doc['docid'], doc);
        
        // Fetch messages for the current document
        const count = await getDocs(collection(this.firestore,"studio conversation", doc['docid'], 'messages'));
        const messages = count.docs.map(e => e.data());
        console.log(messages);

        // Calculate unread messages
        const unreadMessages = messages.filter(msg => msg['pending'].includes(this.currentuseruid)).length;
        this.pendingMessagesCount[doc['docid']] = unreadMessages;
        console.log(unreadMessages);
      });

      await Promise.all(messagePromises);
    });
    
    if(studioStage.length != 0){
      collectionData(query(collection(this.firestore,"queue_token"), where("queueref", "==", doc(this.firestore,'queue generation',this.ongoingQueue["docid"])),where("stagestatus", "==", "Approved"),where("tokenstatus", "==", "Active"),where("currentstage", "in", studioStage))).pipe(takeUntil(this.subscriptionHandle)).subscribe(async token=>{
        console.log(token)
        if(this.liveAssignment != null && token.length != 0){
          this.liveAssignment["token"] = token.find(e => e["liveassignmentid"] == this.liveAssignment["docid"])
          console.log(this.liveAssignment['docid']);
          console.log(this.liveAssignment['token']);
          
          
          // Transferred Queue Detail
          if(![null,undefined].includes(this.liveAssignment["token"] ? this.liveAssignment["token"]["transferredfrom"] : null)){
            await getDoc(doc(this.firestore,this.liveAssignment["token"]["transferredfrom"].path)).then(previousQueue=>{
              if(previousQueue.exists()){
                this.transferredQueue = previousQueue.data()
                this.mapQueue[previousQueue.id] = previousQueue.data()["queuename"]
              }
              else{
                this.transferredQueue = null
              }
            })
            console.log("Transferred Queue", this.transferredQueue)
          }
          else{
            this.transferredQueue = null
          }

          // Get Studio Widgets
          var studioWidget = this.ongoingQueue["stageproperty"][this.liveAssignment["stagename"]]?.studiowidgets ?? []
          // List Validated ATC
          if(studioWidget.includes("prescribedvalidatedatc")){
            this.previewATC("alpha")
          }
          else{
            this.alphaATCList = []
          }

          // List Unvalidated ATC
          if(studioWidget.includes("prescribedunvalidatedatc")){
            this.previewATC("validation")
          }
          else{
            this.unvalidatedATCList = []
          }

          // List Procedure to Mark
          if(studioWidget.includes("assignedatc")){
            this.getAssignedATC()
          }
          else{
            this.cwATClist = []
          }

          // List Triple ATC
          if(studioWidget.includes("viewtripleatc")){
            this.getTripleATC()
          }
          else{
            this.tripleATCList = []
          }

          // UP Attendance Count
          this.getParticipantUPVisit()

          // List Form
          const firestoreForms = getFirestore("firestore-forms")
          var mappedForm = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']]?.participantform ?? []
          console.log(this.liveAssignment["participantid"], mappedForm)
          if(mappedForm.length != 0 && this.liveAssignment["token"]){
            // var involvedQueueRef = [this.firestore.collection("queue generation").doc(this.ongoingQueue["docid"]).ref]
            var involvedQueueRef = []
            involvedQueueRef.push(this.liveAssignment["token"]['queueref'])
            if(![null,undefined].includes(this.liveAssignment["token"]["transferredfrom"])){
              involvedQueueRef.push(this.liveAssignment["token"]["transferredfrom"])
              let currentRef:DocumentReference | null = this.liveAssignment["token"]['tokentransferredfrom'] ?? null
              while (currentRef != null) {
                const transferData = await this.getQueueRefFromTransferredFrom(currentRef);
                if(![null,undefined].includes(transferData['transferredfrom'])){
                  involvedQueueRef.push(transferData["transferredfrom"])
                  currentRef = transferData['tokentransferredfrom']
                }else{
                  currentRef = null;
                  break;
                }
              }
            }
            involvedQueueRef = involvedQueueRef.map(e => doc(firestoreForms, e.path))
            console.log("Involved Queue", involvedQueueRef.map(e => e.path))
            await getDocs(query(collection(firestoreForms,"formsByClient"), where("queueref", "in", involvedQueueRef),where("profileid", "==", this.liveAssignment["participantid"]))).then(queueform =>{
              console.log("Related Form", queueform.docs.map(e =>e.data()["formid"]))
              this.participantForm = queueform.docs.map(e =>e.data()).filter(e => mappedForm.includes(e["formid"]))
              console.log(this.participantForm)
            }).catch(e =>{
              console.log("Unable to fetch Form", e)
            })
          }
          else{
            this.participantForm = []
          }

          // current AEL
          // List Triple ATC
          if(studioWidget.includes("validateael")){
            this.getCurrentAEL()
          }
          else{
            this.participantAEL = {}
          }

        }
        // var stageToken = token.filter(e => e["liveassignmentid"] == null && (e["preassigned"] == null || e["preassigned"] == undefined || e["preassigned"] == this.selectedStudio["docid"])).sort((a, b) => a["logdate"].toDate() - b["logdate"].toDate())
        var localTokenList = []
        studioStage.forEach(stage=>{
          localTokenList.push({
            stagename: stage,
            tokenlist: token.filter(e => e["status"] == "ready" && e["currentstage"] == stage && e["liveassignmentid"] == null && ([null,undefined].includes(this.selectedStudio['atcmodel']) ||  this.selectedStudio['atcmodel'].includes(this.mapProducts[e['productref'].id]))  && (e["preassigned"] == null || e["preassigned"] == undefined || (e["preassigned"][stage] ?? []).length == 0 || (e["preassigned"][stage] ?? []).includes(this.selectedStudio["docid"]))).sort((a, b) => a["queueposition"] - b["queueposition"]) // .sort((a, b) => b["logdate"].toDate() - a["logdate"].toDate())
          })
        })
        this.stageTokenList = localTokenList
        console.log(this.stageTokenList, 'stageTokenList');
        
        loading?.close()
        loading = null
      })
    }
    else{
      loading?.close()
      loading = null
      alert("No eligible stages found for this Studio!")
    }
  }

  /**
   * Public entry point for the Studio Checkin toggle. Enforces the
   * one-active-checkin-per-specialist rule: if the user is already checked
   * into another studio (any queue), prompts a confirmation dialog and
   * batch-checks-out the others before proceeding with this check-in.
   * Checkouts (value === false) skip the conflict check entirely.
   */
  async checkinStudio(value){
    if (value === true) {
      const conflicts = await this.findActiveCheckins(this.selectedStudio?.['docid'])
      if (conflicts.length > 0) {
        const confirmed = await firstValueFrom(
          this.dialog.open(this.checkinConflictTpl, {
            data: {
              studios: conflicts.map(c => ({
                docid: c['docid'],
                name: c['studioname'] || c['name'] || 'Studio'
              }))
            },
            disableClose: true,
            width: '460px',
            maxWidth: '92vw',
            autoFocus: false,
          }).afterClosed()
        )
        if (!confirmed) return
        // Batch-checkout the conflicting studios atomically before continuing.
        try {
          const batch = writeBatch(this.firestore)
          for (const c of conflicts) {
            batch.update(doc(this.firestore, 'queue studio pairing', c['docid']), { checkin: false })
          }
          await batch.commit()
          // Log a checkout entry for each, mirroring performCheckin's log shape.
          for (const c of conflicts) {
            const logid = doc(collection(this.firestore, 'studio checkin log')).id
            setDoc(doc(this.firestore, 'studio checkin log', logid), {
              logparticipant: this.profileid,
              queueref: c['queueref'],
              logdate: new Date(),
              activity: 'checkout',
              participants: c['participants'] || [],
              studio: c['docid']
            })
          }
        } catch (err) {
          console.log('Failed to checkout other studios', err)
          alert('Could not check out of the other studio. Please try again.')
          return
        }
      }
    }
    return this.performCheckin(value)
  }

  /**
   * Returns the user's other studios across all queues that currently have
   * `checkin: true`. Excludes the studio identified by `excludeStudioId`
   * (typically the one being toggled). Returns empty array on no conflict.
   */
  private async findActiveCheckins(excludeStudioId: string | undefined | null): Promise<any[]> {
    if (!this.profileid) return []
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'queue studio pairing'),
        where('participants', 'array-contains', this.profileid),
        where('checkin', '==', true),
      ))
      return snap.docs
        .map(d => d.data())
        .filter(s => s['docid'] !== excludeStudioId && [null, undefined, false].includes(s['delete']))
    } catch (err) {
      console.log('findActiveCheckins error', err)
      return []
    }
  }

  private async performCheckin(value){
    const currentDate = new Date();
    const currentTime = currentDate.getTime();
    const scheduledTimes = (this.selectedStudio["checkinscheduletime"] ?? []).filter(timestamp => {
      const timestampTime = timestamp.toDate().getTime();
      console.log(timestampTime);

      return timestampTime > currentTime;
    });
    console.log(scheduledTimes);
    const dayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dayEnd = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1);
    
    await getDocs(query(collection(this.firestore,"studio checkin log"),where('logparticipant', '==', this.profileid),where('logdate', '>=', dayStart),where('logdate', '<', dayEnd)))
    .then(snap => {
      this.checkinlog = snap.docs.length
      console.log(this.checkinlog);
    })
    
    console.log(this.selectedStudio["checkinscheduletime"] == undefined || 
    this.selectedStudio["checkinscheduletime"].length == 0 || scheduledTimes.length > 0 || this.checkinlog != 0);
    
    if(this.selectedStudio["checkinscheduletime"] == undefined || 
      this.selectedStudio["checkinscheduletime"].length == 0 || scheduledTimes.length > 0 || this.checkinlog != 0){
      this.selectedStudio["checkin"] = value
      updateDoc(doc(this.firestore, 'queue studio pairing',this.selectedStudio["docid"]),{
        checkin: this.selectedStudio["checkin"]
      })
     
      let id = doc(collection(this.firestore, 'studio checkin log')).id
      let activity =  value == true ? "checkin" : "checkout"
      let data = {
        logparticipant : this.profileid,
        queueref : this.selectedStudio['queueref'],
        logdate : new Date(),
        activity : activity,
        participants: this.selectedStudio["participants"],
        studio: this.selectedStudio["docid"]
      }
      setDoc(doc(this.firestore,"studio checkin log", id), data)
      }else{
        this.dialog.open(HoldAlertDialogComponent)
        this.onhold = true
        this.selectedStudio["checkin"] = false
        console.log("scheduled time have passed. Check-in restricted.");
        updateDoc(doc(this.firestore,"queue studio pairing", this.selectedStudio["docid"]), {
          checkin: this.selectedStudio["checkin"],
          onhold: this.onhold
        })
      }
    }

  // Studio Stage Grouping
  async sendStudioInvitation(token){
    this.additionalActivities = {}
    var mandatoryStage = this.ongoingQueue["stageproperty"][token["currentstage"]]["mandatorystagegrouping"] ?? []
    var optionalStage = this.ongoingQueue["stageproperty"][token["currentstage"]]["optionalstagegrouping"] ?? []
    console.log(mandatoryStage, optionalStage)
    var mandatoryStudio = []
    var optionalStudio = []
    if(mandatoryStage.length != 0 || optionalStage.length != 0){
      await getDocs(query(collection(this.firestore,"live assignment"),where("queueid", "==", this.ongoingQueue["docid"]),where("stagename", "in", [...mandatoryStage, ...optionalStage]),where("status", "==", "completed"))).then(previousStudio=>{
        var studioData = previousStudio.docs.map(e => e.data())
        console.log("Previous Studio", studioData)
        studioData.sort((a, b) => b["created"].toDate() - a["created"].toDate())
        studioData.forEach(studio=>{
          if(!studio["pairing"].includes(this.profileid)){
            if(mandatoryStage.includes(studio["stagename"]) && mandatoryStudio.filter(e => e["stagename"] == studio["stagename"]).length == 0){
              mandatoryStudio.push(studio)
            }
            if(optionalStage.includes(studio["stagename"]) && optionalStudio.filter(e => e["stagename"] == studio["stagename"]).length == 0){
              optionalStudio.push(studio)
            }
          }
        })
        console.log(mandatoryStudio, optionalStudio)
      })
    }

    // Send Invitation for Mandatory & Optional Stage
    if(mandatoryStudio.length != 0 || optionalStudio.length != 0){
      var invitationID = doc(collection(this.firestore,'studioinvitation')).id
      setDoc(doc(this.firestore, 'studioinvitation', invitationID), {
        docid: invitationID,
        createddate: new Date(),
        type: "stagegrouping",
        invitedstudio: [...mandatoryStudio.map(e => e["studioid"]), ...optionalStudio.map(e => e["studioid"])],
        acceptedstudio: [],
        deniedstudio: [],
        mandatorystudio: mandatoryStudio.map(e => e["studioid"]),
        optionalstudio: optionalStudio.map(e => e["studioid"]),
        studioid: this.selectedStudio["docid"],
        stage: token["currentstage"],
        queueref: token['queueref'],
        tokenref:  doc(this.firestore, 'queue_token', token["docid"]),
        participantname: this.mapProfile[token['profile_id']],
        status: "pending",
        createdby:this.profileid
      })
      this.dialog.open(InviteOtherStudioComponent, {
        data: {
          mapprofile: this.mapProfile,
          mapactivity: this.mapActivity,
          invitationid: invitationID,
          mapstudio: this.mapStudio
        },
        disableClose: true,
        maxHeight: "90vh",
        maxWidth: "90vw"
      }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
        if(result != "denied"){
          updateDoc(doc(this.firestore, 'studioinvitation', invitationID), {
            status: "success"
          })
         
          result.forEach(studioid=>{
            var studio
            var findMandatory = mandatoryStudio.find(e => e["studioid"] == studioid)
            if(findMandatory != null || findMandatory != undefined){
              studio = findMandatory
            }
            else{
              studio = optionalStudio.find(e => e["studioid"] == studioid)
            }
            var participantActivity = Object.keys(studio["participantsactivity"] ?? {})
            participantActivity.forEach(profile =>{
              var transferActivity = this.ongoingQueue["stageproperty"][token["currentstage"]]["transferactivity"] ?? {}
              var newActivity = transferActivity[studio["participantsactivity"][profile]] ?? studio["participantsactivity"][profile]
              this.additionalActivities[newActivity] = this.additionalActivities[newActivity] ?? []
              this.additionalActivities[newActivity].push(profile)
            })
          })
          console.log("activities", this.additionalActivities)
          this.inviteParticipant(token)
        }
        else{
          updateDoc(doc(this.firestore, 'studioinvitation', invitationID),{
            status: "cancelled"
          })
         
        }
      })
    }
    else{
      this.inviteParticipant(token)
    }
  }

  async inviteParticipant(token){
    await getDocs(query(collection(this.firestore,"studioinvitation"),where("tokenref", "==", doc(this.firestore,"queue_token",token["docid"])),where("expirydate", ">=", new Date()))).then(invitation=>{
      var pending = invitation.docs.filter(e => e.data()["clientresponse"] == null || e.data()["clientresponse"] == "approved")
      if(pending.length != 0){
        alert("The selected participant is about to respond invitation from other studio. Try picking other participant or again later.")
      }
      else{
        var invitationData = {
          docid: doc(collection(this.firestore, 'studioinvitation')).id,
          specialistpairing: this.selectedStudio['participants'],
          profileid: token["profile_id"],
          tokenref: doc(this.firestore,'queue_token',token["docid"]),
          participantname: this.mapProfile[token['profile_id']],
          stage: token["currentstage"],
          expirydate: new Date(new Date().getTime() + this.invitationTimerSeconds * 1000),
          queueref: token['queueref'],
          createddate: new Date(),
          clientresponse: null,
          studioid: this.selectedStudio["docid"],
          createdby:this.profileid
        }
        setDoc(doc(this.firestore,"studioinvitation",invitationData['docid']),invitationData,{merge:true}).catch((err)=>{
          alert(err)
        })
       
      }
    })
  }

  // async inviteParticipant(token: any) {
  //   try {
  //     console.log("inviteParticipant started");
  //     const db = firebase.default.firestore();
  //     // Start a transaction
  //     return await db.runTransaction(async (transaction) => {
  //       console.log("in transaction");
  //       // Create references
  //       const tokenRef = db.collection("queue_token").doc(token["docid"]);
  //       // Create the query
  //       const querySnapshot = await db.collection("studioinvitation")
  //         .where("tokenref", "==", tokenRef)
  //         .where("expirydate", ">=", firebase.default.firestore.Timestamp.fromDate(new Date()))
  //         .get();
  //       if (!querySnapshot.empty) {
  //         throw new Error("The selected participant is about to respond invitation from other studio. Try picking other participant or again later.");
  //       }
  //       // Deterministic ID to prevent duplicate entries
  //       const docId = `${tokenRef.id}_${new Date().toISOString().slice(0,16)}`;
  //       console.log("docId",docId);
  //       const newInvitationRef = db.collection("studioinvitation").doc(docId);
  //       // Prepare invitation data
  //       const invitationData = {
  //         docid: docId,
  //         specialistpairing: this.selectedStudio["participants"],
  //         profileid: token["profile_id"],
  //         tokenref: tokenRef,
  //         participantname: this.mapProfile[token["profile_id"]],
  //         stage: token["currentstage"],
  //         expirydate: firebase.default.firestore.Timestamp.fromDate(
  //           new Date(new Date().getTime() + 2 * 60000)
  //         ),
  //         queueref: token["queueref"],
  //         createddate: firebase.default.firestore.Timestamp.fromDate(new Date()),
  //         clientresponse: null,
  //         studioid: this.selectedStudio["docid"],
  //       };
  //       // Set the new invitation data in the transaction
  //       transaction.set(newInvitationRef, invitationData);
  //       return invitationData;
  //     });
  //   } catch (error) {
  //     console.error("Transaction failed:", error);
  //     alert(error.message || "Transaction failed");
  //     throw error;
  //   }
  // } 

  assignStudio(invitation){
    console.log(invitation)
    var token = this.stageTokenList.filter(e => e["stagename"] == invitation["stage"])[0]["tokenlist"].find(e => e["profile_id"] == invitation["profileid"])
    console.log(token)
    var assignStudio = this.dialog.open(AssignQueueStudioComponent, {
      data: {
        title: "Update Specialist and Activity in the Studio",
        studiolist: [this.selectedStudio],
        mapprofile: this.mapProfile,
        mapactivity: this.mapActivity,
        additionalactivities: this.additionalActivities
      },
      autoFocus: false,
      maxWidth: "90vw",
      maxHeight: "90vh"
    })
    assignStudio.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result=>{
      console.log(result)
      if(result != null && this.liveAssignment == null){
        var loading = this.dialog.open(LoadingProgressComponent,{
          data:{
            msg: "Moving Token " + token["tokennumber"] + "..."
          },
          disableClose: true
        })
        var atcmodel = null
        if(![null,undefined].includes(token['variationid'])){
          await getDoc(doc(this.firestore,"queue variation",token['variationid'])).then(async variationSnap => {
            if(variationSnap.exists()){
              if(![null,undefined].includes(variationSnap.data()['atcmodel'])){
                console.log("Atc model from queue variation",variationSnap.data()['atcmodel']);
                atcmodel = variationSnap.data()['atcmodel']
              }
            }
          })
        }else {
          getDoc(doc(this.firestore,token['productref'].path)).then(productSnap => {
            atcmodel = productSnap.data()['atcmodel']
          })
        }
        // Update Studio
        await updateDoc(doc(this.firestore,"queue studio pairing",result["docid"]),{
          status: "live",
        })
        
        var liveassignmentid = doc(collection(this.firestore,'live assignment')).id
        // Update Token
        var data = {
          previousstage: invitation["stage"],
          currentstage: invitation["stage"],
          logdate: serverTimestamp(),
          stagestatus: "Approved",
          quicknotes: null,
          cwmentoring: null,
          cwshadowing: null,
          cwperson: null,
          diagnosticmentoring: null,
          diagnosticshadowing: null,
          diagnosticperson: null,
          people_involved: Array.from(new Set(result["participants"].concat(...Object.keys(result["bonusactivity"] ?? {}) as string[]))),
          arenaid: null,
          liveassignmentid: liveassignmentid,
          studioid: result["docid"],
          status: "instudio"
        }
        var log = {...token, ...data}
        await this.updateQueueStage(log)

        // Create Live Assignment
        var liveassignmentData = {
          docid: liveassignmentid,
          pairing: result["participants"],
          participantid: token['profile_id'],
          stagename: invitation["stage"],
          atcmodel: atcmodel,
          // stagetype: diagnosticStage.includes(dropStage) ? "diagnostics" : consultationStage.includes(dropStage) ? "consultation" : ahStage.includes(dropStage) ? "ah" : reviewStage.includes(dropStage) ? "validation" : "changework",
          status: 'live',
          queueid: this.ongoingQueue["docid"],
          created: serverTimestamp(),
          // shadowperson: result["shadow"] ?? null
          studioid: result["docid"],
          participantsactivity: result["participantsactivity"], // From Studio Pairing
          bonusactivity: result["bonusactivity"] ?? null, // Addition Activities
          bonusactivityparticipant: result["bonusactivity"] != null && result["bonusactivity"] != undefined ? Object.keys(result["bonusactivity"]) : null
        }
        liveassignmentData["zoomlinkrequired"] = this.ongoingQueue["zoomlinkrequired"] ?? true
        await setDoc(doc(this.firestore,('live assignment/' + liveassignmentid)),liveassignmentData, {merge: true})
        
        loading.close()
      }
    })
  }

  async updateQueueStage(log){
    console.log(log)
    await updateDoc(doc(this.firestore,"queue_token",log["docid"]),log).catch(err =>{
      console.log(err)
    })
   
    var logdocid = doc(collection(this.firestore, 'queue stage log')).id
    log["logdocid"] = logdocid
    log["movedby"] = this.profileid
    log["movedthrough"] = 'studio'
    await setDoc(doc(this.firestore, 'queue stage log', logdocid),log).catch(err =>{
      console.log(err)
    })
  }
  async moveStage(nextstage:string,markascompleted:any){
    console.log("********* moveStage *********");
    
    console.log(nextstage, 'nextstage',markascompleted,"markascompleted");
    console.log(this.liveAssignment);

    if(markascompleted){
      if(Object.keys(this.participantAEL).length != 0){
        if(this.participantAEL["aelStatus"] == "validated"){
          console.log("Given AEL validated")
        } else {
          alert("Participant AEL is not validated. Mark validate to compelete this session.")
          return;
        }
      }
    }
    
    var preloading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Validating next stage..."},
      disableClose: true
    })

    var preassignActivity = []
    var nextStageProperty = (this.ongoingQueue["stageproperty"][nextstage] ?? {})
    console.log(nextStageProperty);
    
    var nextStageMandatoryStage = nextStageProperty["mandatorystagegrouping"] ?? []
    console.log(nextStageMandatoryStage);
    
    var nextActivtityProperty = nextStageProperty["transferactivityproperty"] ?? []
    console.log(nextActivtityProperty);
    console.log(this.liveAssignment["stagename"]);
    
    if(nextStageMandatoryStage.includes(this.liveAssignment["stagename"])){
      Object.keys(this.selectedStudio["participantsactivity"] ?? {}).forEach(profileid=>{
        var activity = this.selectedStudio["participantsactivity"][profileid]
        var newActivity = nextActivtityProperty.find(e => e["activity"] == activity && e["sameperson"] == true)
        if(newActivity != undefined && newActivity != null){
          preassignActivity.push({
            activity: activity,
            newactivity: newActivity["newactivity"],
            profileid: profileid
          })
        }
      })
    }
    console.log(preassignActivity)

    var eligiblePreStudio = []  
    var preassignProfile = preassignActivity.map(e => e["profileid"])
    if(preassignProfile.length != 0){
      await getDocs(query(collection(this.firestore,"queue studio pairing"), where("queueref", "==", doc(this.firestore,"queue generation",this.ongoingQueue["docid"])),where("participants", "array-contains-any", preassignProfile),where("studioin", "==", true))).then(otherStudio=>{
        for (let i = 0; i < otherStudio.docs.length; i++) {
          const studiodoc = otherStudio.docs[i];
          var studiodata = studiodoc.data()
          var participantsActivity = studiodata["participantsactivity"] ?? {}
          console.log(participantsActivity)
          var checkRoles = preassignActivity.every(e => {
            var activity = e["newactivity"]
            var profile = e["profileid"]
            console.log(activity, profile)
            return participantsActivity[profile] == activity
          })
          if(checkRoles){
            eligiblePreStudio.push(studiodata)
          }
        }
      })
    }
    console.log("Eligible Studio", eligiblePreStudio)

    var movable = true

    var token = this.liveAssignment["token"]
    console.log(token);
    
    token["preassigned"] = token["preassigned"] ?? {}
    token["preassigned"][nextstage] = token["preassigned"][nextstage] ?? []
    
    if(eligiblePreStudio.length == 1){
      if(!token["preassigned"][nextstage].includes(token["preassigned"][nextstage])) token["preassigned"][nextstage].push(eligiblePreStudio[0]["docid"])
      await updateDoc(doc(this.firestore,"queue_token" ,token["docid"]),{
        preassigned: token["preassigned"]
      }).catch(err =>{
        console.log(err)
      })
    }
    else if(eligiblePreStudio.length != 0){
      var studio = this.dialog.open(PreassignStudioComponent, {
        data: {
          stagename: nextstage,
          studiolist: eligiblePreStudio,
          mapprofile: this.mapProfile,
          mapactivity: this.mapActivity
        },
        disableClose: true,
        maxHeight: "90vh",
        maxWidth: "90vw"
      })
      await studio.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result=>{
        if(result != null){
          if(!token["preassigned"][nextstage].includes(result)) token["preassigned"][nextstage].push(result)
          console.log(token)
          await updateDoc(doc(this.firestore,"queue_token",token["docid"]),{
            preassigned: token["preassigned"]
          }).catch(err =>{
            console.log(err)
          })
        }
        else{
          movable = false
        }
      })
    }
    preloading.close()

    if(movable){
      if(this.liveAssignment["stagename"] == nextstage || (this.liveAssignment["stagename"] != nextstage && markascompleted != true)){
        var inCompleteDialog = this.dialog.open(StageIncompleteConfirmationComponent, {
          data: {
            currentstage: this.liveAssignment["stagename"],
            participantname: this.mapProfile[this.liveAssignment["token"]?.profile_id]
          },
          maxWidth: "70vw",
          maxHeight: "90vh",
          disableClose: true
        })
        await firstValueFrom(inCompleteDialog.afterClosed()).then(async value =>{
          console.log(value)
          if(value){
            var loading = this.dialog.open(LoadingProgressComponent, {
              data: {msg: "Closing Studio"},
              disableClose: true
            })
            var stageList = this.liveAssignment["token"]["variationid"] != null && this.liveAssignment["token"]["variationid"] != undefined ? this.queueVariation[this.liveAssignment["token"]["variationid"]] : this.ongoingQueue["stages"]
            var dropIndex = stageList.findIndex(e => e == nextstage)
            var data = {
              previousstage: this.liveAssignment["stagename"],
              currentstage: nextstage,
              logdate: serverTimestamp(),
              stagestatus: "Approved",
              quicknotes: null,
              cwmentoring: null,
              cwshadowing: null,
              cwperson: null,
              diagnosticmentoring: null,
              diagnosticshadowing: null,
              diagnosticperson: null,
              people_involved: [],
              arenaid: null,
              liveassignmentid: null,
              studioid: null,
              status: ((this.ongoingQueue["stageproperty"][nextstage] ?? {})["compulsoryactivity"] ?? []).length == 0 ? null : "queued"
              // dropType == "Queued" ? "queued" : dropType == "Waiting" ? "ready" : null
            }
            if(value["preassign"]){
              data[`preassigned.${this.liveAssignment["stagename"]}`] = arrayUnion(this.liveAssignment["studioid"])
            }
            if((value["reason"] ?? "").trim().length != 0){
              data["notes"] = value["reason"]
              data["notesList"] = arrayUnion({
                author: this.profileid,
                stage: this.liveAssignment["stagename"],
                text: value["reason"],
                updatedon: new Date()
              })
            }
            var log = {...this.liveAssignment["token"], ...data}
            await this.updateQueueStage(log)
            console.log("Drop Index", dropIndex, "Length", stageList.length)
            if(dropIndex+1 == stageList.length){
              await this.guard.updateDeliveryStatus(
                doc(this.firestore, "queue_token", log["docid"]).path, 
                "completed", 
                {
                  eventRequestRef: query(
                    collection(this.firestore, 'event participation request'),
                    where('profileid', '==', token['profile_id']),
                    where('eventref', '==', log['queueref']),
                    where('status', '==', 'approved')
                  )
                }
              )
            }
            var studioid = this.liveAssignment["studioid"]
            await updateDoc(doc(this.firestore,'live assignment/' + this.liveAssignment["docid"]),{
              isactivitydone : false,
              status: "completed",
              updated: serverTimestamp()
            })
            await updateDoc(doc(this.firestore,"queue studio pairing",studioid),{
              status: null,
            })
            loading.close()
          }
        })
      }else{
        var reviewSpecialist = (await this.inviteMore(true))
        if(!reviewSpecialist) return
        var confirm = this.dialog.open(HoldAlertDialogComponent, {
          data : {}
        })
  
        const result =  await confirm.afterClosed().toPromise()
        if (result == null) {
          return;          
        }
  
        this.ngZone.run(async () => {
          if(result != null){
  
            var loading = this.dialog.open(LoadingProgressComponent, {
              data: {msg: "Closing Studio"},
              disableClose: true
            })
            var stageList = this.liveAssignment["token"]["variationid"] != null && this.liveAssignment["token"]["variationid"] != undefined ? this.queueVariation[this.liveAssignment["token"]["variationid"]] : this.ongoingQueue["stages"]
            var dropIndex = stageList.findIndex(e => e == nextstage)
            var data = {
              previousstage: this.liveAssignment["stagename"],
              currentstage: nextstage,
              logdate: serverTimestamp(),
              stagestatus: "Approved",
              quicknotes: null,
              cwmentoring: null,
              cwshadowing: null,
              cwperson: null,
              diagnosticmentoring: null,
              diagnosticshadowing: null,
              diagnosticperson: null,
              people_involved: [],
              arenaid: null,
              liveassignmentid: null,
              studioid: null,
              status: ((this.ongoingQueue["stageproperty"][nextstage] ?? {})["compulsoryactivity"] ?? []).length == 0 ? null : "queued"
              // dropType == "Queued" ? "queued" : dropType == "Waiting" ? "ready" : null
            }
            var log = {...this.liveAssignment["token"], ...data}
            await this.updateQueueStage(log)
            console.log("Drop Index", dropIndex, "Length", stageList.length)
            if(dropIndex+1 == stageList.length){
              // await this.guard.updateDeliveryStatus(this.firestore.doc("/queue_token/" + log["docid"]).ref.path, "completed")
              await this.guard.updateDeliveryStatus(doc(this.firestore,"/queue_token/" + log["docid"]).path, "completed", {
                eventRequestRef: query(collection(this.firestore,'event participation request'), where('profileid', '==', token['profile_id']),where('eventref', '==', log['queueref']),where("status", "==", "approved"))
              })
            }
            await this.closeStudio()
            loading.close()
          }
        })
      }
     
    }
  }

  async closeStudio(){
    var studioid = this.liveAssignment["studioid"]
    // var confirm = this.dialog.open(HoldAlertDialogComponent, {
    //   data : {}
    // })
    // await confirm.afterClosed().toPromise().then(async result => {
    //   if(result != null){
    //     await this.firestore.doc('live assignment/' + this.liveAssignment["docid"]).update({
    //       isactivitydone : true,
    //       status: "completed",
    //       updated: firebase.default.firestore.FieldValue.serverTimestamp()
    //     })
    //   }
    // })
    await updateDoc(doc(this.firestore,'live assignment/' + this.liveAssignment["docid"]),{
      isactivitydone : true,
      status: "completed",
      updated: serverTimestamp()
    })
    await updateDoc(doc(this.firestore,"queue studio pairing",studioid),{
      status: null,
    })
    this.liveAssignment = null
  }

  // async moveStage(nextstage){
  //   var preloading = this.dialog.open(LoadingProgressComponent, {
  //     data: {msg: "Validating next stage..."},
  //     disableClose: true
  //   })
  //   var preassignActivity = []
  //   var nextStageProperty = (this.ongoingQueue["stageproperty"][nextstage] ?? {})
  //   var nextStageMandatoryStage = nextStageProperty["mandatorystagegrouping"] ?? []
  //   var nextActivtityProperty = nextStageProperty["transferactivityproperty"] ?? []
  //   if(nextStageMandatoryStage.includes(this.liveAssignment["stagename"])){
  //     Object.keys(this.selectedStudio["participantsactivity"] ?? {}).forEach(profileid=>{
  //       var activity = this.selectedStudio["participantsactivity"][profileid]
  //       var newActivity = nextActivtityProperty.find(e => e["activity"] == activity && e["sameperson"] == true)
  //       if(newActivity != undefined && newActivity != null){
  //         preassignActivity.push({
  //           activity: activity,
  //           newactivity: newActivity["newactivity"],
  //           profileid: profileid
  //         })
  //       }
  //     })
  //   }
  //   console.log(preassignActivity)
  //   var eligiblePreStudio = []
  //   var preassignProfile = preassignActivity.map(e => e["profileid"])
  //   if(preassignProfile.length != 0){
  //     await this.firestore.collection("queue studio pairing", ref=>ref.where("queueref", "==", this.firestore.collection("queue generation").doc(this.ongoingQueue["docid"]).ref).where("participants", "array-contains-any", preassignProfile).where("studioin", "==", true)).get().toPromise().then(otherStudio=>{
  //       for (let i = 0; i < otherStudio.docs.length; i++) {
  //         const studiodoc = otherStudio.docs[i];
  //         var studiodata = studiodoc.data()
  //         var participantsActivity = studiodata["participantsactivity"] ?? {}
  //         console.log(participantsActivity)
  //         var checkRoles = preassignActivity.every(e => {
  //           var activity = e["newactivity"]
  //           var profile = e["profileid"]
  //           console.log(activity, profile)
  //           return participantsActivity[profile] == activity
  //         })
  //         if(checkRoles){
  //           eligiblePreStudio.push(studiodata)
  //         }
  //       }
  //     })
  //   }
  //   console.log("Eligible Studio", eligiblePreStudio)
  //   var movable = true
  //   var token = this.liveAssignment["token"]
  //   token["preassigned"] = token["preassigned"] ?? {}
  //   token["preassigned"][nextstage] = token["preassigned"][nextstage] ?? []
  //   if(eligiblePreStudio.length == 1){
  //     if(!token["preassigned"][nextstage].includes(token["preassigned"][nextstage])) token["preassigned"][nextstage].push(eligiblePreStudio[0]["docid"])
  //     await this.firestore.collection("queue_token").doc(token["docid"]).update({
  //       preassigned: token["preassigned"]
  //     }).catch(err =>{
  //       console.log(err)
  //     })
  //   }
  //   else if(eligiblePreStudio.length != 0){
  //     var studio = this.dialog.open(PreassignStudioComponent, {
  //       data: {
  //         stagename: nextstage,
  //         studiolist: eligiblePreStudio,
  //         mapprofile: this.mapProfile,
  //         mapactivity: this.mapActivity
  //       },
  //       disableClose: true,
  //       maxHeight: "90vh",
  //       maxWidth: "90vw"
  //     })
  //     await studio.afterClosed().toPromise().then(async result=>{
  //       if(result != null){
  //         if(!token["preassigned"][nextstage].includes(result)) token["preassigned"][nextstage].push(result)
  //         console.log(token)
  //         await this.firestore.collection("queue_token").doc(token["docid"]).update({
  //           preassigned: token["preassigned"]
  //         }).catch(err =>{
  //           console.log(err)
  //         })
  //       }
  //       else{
  //         movable = false
  //       }
  //     })
  //   }
  //   preloading.close()
  //   if(movable){
  //     var loading = this.dialog.open(LoadingProgressComponent, {
  //       data: {msg: "Closing Studio"},
  //       disableClose: true
  //     })
  //     var stageList = this.liveAssignment["token"]["variationid"] != null && this.liveAssignment["token"]["variationid"] != undefined ? this.queueVariation[this.liveAssignment["token"]["variationid"]] : this.ongoingQueue["stages"]
  //     var dropIndex = stageList.findIndex(e => e == nextstage)
  //     var data = {
  //       previousstage: this.liveAssignment["stagename"],
  //       currentstage: nextstage,
  //       logdate: firebase.default.firestore.FieldValue.serverTimestamp(),
  //       stagestatus: "Approved",
  //       quicknotes: null,
  //       cwmentoring: null,
  //       cwshadowing: null,
  //       cwperson: null,
  //       diagnosticmentoring: null,
  //       diagnosticshadowing: null,
  //       diagnosticperson: null,
  //       people_involved: [],
  //       arenaid: null,
  //       liveassignmentid: null,
  //       studioid: null,
  //       status: ((this.ongoingQueue["stageproperty"][nextstage] ?? {})["compulsoryactivity"] ?? []).length == 0 ? null : "queued"
  //       // dropType == "Queued" ? "queued" : dropType == "Waiting" ? "ready" : null
  //     }
  //     var log = {...this.liveAssignment["token"], ...data}
  //     await this.updateQueueStage(log)
  //     console.log("Drop Index", dropIndex, "Length", stageList.length)
  //     if(dropIndex+1 == stageList.length){
  //       await this.guard.updateDeliveryStatus(this.firestore.doc("/queue_token/" + log["docid"]).ref.path, "completed")
  //     }
  //     await this.closeStudio()
  //     loading.close()
  //   }
  // }
  // async closeStudio(){
  //   var studioid = this.liveAssignment["studioid"]
  //   await this.firestore.doc('live assignment/' + this.liveAssignment["docid"]).update({
  //     status: "completed",
  //     updated: firebase.default.firestore.FieldValue.serverTimestamp()
  //   })
  //   await this.firestore.collection("queue studio pairing").doc(studioid).update({
  //     status: null,
  //   })
  //   this.liveAssignment = null
  // }

  async inviteMore(reviewSpecialist): Promise<boolean>{
    var invited:boolean = false
    var additionalActivities = {};
    Object.keys(this.liveAssignment["bonusactivity"] ?? {}).forEach(profileid =>{
      additionalActivities[this.liveAssignment["bonusactivity"][profileid]] = additionalActivities[this.liveAssignment["bonusactivity"][profileid]] ?? []
      additionalActivities[this.liveAssignment["bonusactivity"][profileid]].push(profileid)
    }) 
    console.log(additionalActivities)   
    var inviteParticipant = this.dialog.open(AssignQueueStudioComponent, {
      data: {
        title: reviewSpecialist ? "Assign Other Specialist if attended in this Studio" : "Update Additional Specialist and Activity in the Studio",
        studiolist: reviewSpecialist ? [this.selectedStudio] : null,
        mapprofile: this.mapProfile,
        mapactivity: this.mapActivity,
        additionalactivities: reviewSpecialist ? additionalActivities : null
      },
      autoFocus: false,
      maxWidth: "90vw",
      maxHeight: "90vh"
    })
    
    try {
      const result = await inviteParticipant.afterClosed().toPromise();
      if(result != null){
        console.log(result)
        if(Object.keys(result).length != 0){
          // Update Bonus Activity
          var mergeActivity = reviewSpecialist ? (result["bonusactivity"] ?? {}) : {...(this.liveAssignment["bonusactivity"] ?? {}), ...result["bonusactivity"]}
          console.log(mergeActivity)
          var additionalSpecialist = Object.keys(mergeActivity)
          
          await updateDoc(doc(this.firestore, "live assignment", this.liveAssignment["docid"]), {
            bonusactivity: additionalSpecialist.length != 0 ? mergeActivity : null,
            bonusactivityparticipant: additionalSpecialist.length != 0 ? additionalSpecialist : null
          });
  
          // Update People Involved
          var peopleInvolved = Object.keys(mergeActivity)
          var mergePeopleInvolved = Array.from(new Set(peopleInvolved.concat(this.liveAssignment["pairing"] ?? []) as string[]))
          console.log(mergePeopleInvolved)
          
          await updateDoc(doc(this.firestore, "queue_token", this.liveAssignment["token"]["docid"]), {
            people_involved: mergePeopleInvolved
          });
        }
        invited = true
      }
    } catch (error) {
      console.error('Error in inviteMore:', error);
    }
    return invited
  }
  
  async regenerateZoomLink(){
    var url:string
    if(environment.firebase.projectId == "starlabs-test"){
      console.log("test")
      console.log(this.liveAssignment["zoomdata"], 'liveassignment');
      
      url = "https://us-central1-starlabs-test.cloudfunctions.net/studioZoomLinkRegenerate?liveassignmentid="+this.liveAssignment["docid"]+"&zoomdata="+JSON.stringify(this.liveAssignment['zoomdata'])
    }
    else if(environment.firebase.projectId == "fir-sample-aae4a" || environment.firebase.projectId == "launch-your-legacy-development"){
      console.log("Production")
      url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/studioZoomLinkRegenerate?liveassignmentid="+this.liveAssignment["docid"]+"&zoomdata="+JSON.stringify(this.liveAssignment['zoomdata'])
    }
    var generateLoading = this.dialog.open(LoadingProgressComponent, {
      data:{
        msg: "Generating Link...."
      }
    })
    
    try {
      const res = await this.http.get(url).toPromise();
      console.log(res)
    } catch (err) {
      console.log("Error", err)
    }
    
    generateLoading.close()
    this.enableZoomLinkGenerator()
  }
  
  viewform(form){
    const firestoreForms = getFirestore("firestore-forms")
    let path = doc(firestoreForms, "formsByClient", form['docid']).path
    // embed=true tells the app shell to hide its toolbar/sidenav so only the
    // form renders inside the iframe — no STARLABS chrome.
    const url = this.router.createUrlTree(['/formtemplate'], {
      queryParams: { id: form.formid, type: 'form', patchdata: path, embed: 'true' }
    })
    const safeUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url.toString())
    this.dialog.open(this.formDialogTpl, {
      data: { url: safeUrl, formname: form['formname'] || 'Form' },
      width: '92vw',
      maxWidth: '1200px',
      height: '92vh',
      panelClass: 'form-dialog-panel',
      autoFocus: false
    })
  }
  
  addATC(validated, profileid) {
    console.log(profileid, 'profileid');
  
    const url = this.router.createUrlTree(['/prescribeATC'], { queryParams: { validation: validated, profileid: profileid } }).toString();
    window.open(url, '_blank');
  }
  
  updateATC(atcid, collection, option){
    var url = '/editATC/'+atcid+"/" + collection + option
    window.open(url.toString(), '_blank')
  }
  
  async previewATC(collectiontype){

    const firestoreATC = getFirestore("firestore-atc")

    var startDate = this.transferredQueue != null ? this.transferredQueue["queuestartdate"].toDate() : this.ongoingQueue["queuestartdate"].toDate()
    console.log("ATC Fetch Date", startDate, this.transferredQueue)
    
    var unvalidateQuery = this.profileRoles["mentor"] || this.profileRoles["ah"] || this.profileRoles["developer"] || true ? // Allow all Specialist to access all Queue ATC
      query(
        collection(firestoreATC, "atc_to_validate"),
        where("status", "==", "atc given"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      ) : 
      query(
        collection(firestoreATC, "atc_to_validate"),
        where("author", "array-contains", doc(firestoreATC, "profile_data", this.profileid)),
        where("status", "==", "atc given"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      );
      
    var alphaQuery = this.profileRoles["mentor"] || this.profileRoles["ah"] || this.profileRoles["developer"] || true ? // Allow all Specialist to access all Queue ATC
      query(
        collection(firestoreATC, "atc_alpha"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      ) : 
      query(
        collection(firestoreATC, "atc_alpha"),
        where("author", "array-contains", doc(firestoreATC, "profile_data", this.profileid)),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("prescription_date", ">=", startDate)
      );
      
    var queryToUse = collectiontype == "alpha" ? alphaQuery : unvalidateQuery
    var atcList = []
    
    try {
      const atcsnap = await getDocs(queryToUse);
      var atc = atcsnap.docs.filter(e => e.data()["status"] != "upgraded")
      if(collectiontype != "alpha"){
        atc = atcsnap.docs.filter(e => e.data()["status"] != "validated")
      }
      console.log(atc.length)
      if(atc.length == 0){
        if(collectiontype == "alpha"){
          this.alphaATCList = []
        }
        else{
          this.unvalidatedATCList = []
        }
      }
      
      for (let i = 0; i < atc.length; i+=10) {
        var notesIDList:any[] = atc.slice(i, i+10).map(e => e.data()["notesid"]).filter(e => e != null && e != undefined)
        if(notesIDList.length != 0){
          const notesQuery = query(
            collection(firestoreATC, "atc_notes"),
            where(documentId(), "in", notesIDList)
          );
          const notes = await getDocs(notesQuery);
          
          for (let a = 0; a < notes.docs.length; a++) {
            const notedoc = notes.docs[a];
            var notedata = notedoc.data()
            this.mapATCnotes[notedoc.id] = notedata
          }
        }
      }
      
      for (let i = 0; i < atc.length; i+=10) {
        var mentoringIDList:any[] = atc.slice(i, i+10).map(e => e.data()["mentoringid"]).filter(e => e != null && e != undefined)
        if(mentoringIDList.length != 0){
          const mentoringQuery = query(
            collection(this.firestore, "pick_for_mentoring"),
            where(documentId(), "in", mentoringIDList)
          );
          const notes = await getDocs(mentoringQuery);
          
          for (let a = 0; a < notes.docs.length; a++) {
            const notedoc = notes.docs[a];
            var notedata = notedoc.data()
            this.mapATCnotes[notedoc.id] = notedata
          }
        }
      }
      
      for (let a = 0; a < atc.length; a++) {
        const atcDoc = atc[a];
        if(atcList[a] == null || atcList[a] == undefined){
          atcList[a] = {
            atcid: atcDoc.id,
            atcdata: atcDoc.data(),
            transcription: []
          }
        }
        
        const correctionsQuery = query(
          collection(firestoreATC, atcDoc.ref.path, "corrections"),
          where("isdelete", "==", false)
        );
        const adjustment = await getDocs(correctionsQuery);
        
        for (let b = 0; b < adjustment.docs.length; b++) {
          const adjDoc = adjustment.docs[b];
          if(atcList[a].transcription[b] == undefined || atcList[a].transcription[b] == null){
            atcList[a].transcription[b] = {
              adjustment: adjDoc.data()["name"],
              procedure: []
            }
          }
          
          const proceduresQuery = query(
            collection(firestoreATC, adjDoc.ref.path, "procedures"),
            where("isdelete", "==", false)
          );
          const procedure = await getDocs(proceduresQuery);
          
          for (let c = 0; c < procedure.docs.length; c++) {
            const procedureDoc = procedure.docs[c];
            var data = procedureDoc.data()
            atcList[a].transcription[b].procedure[c] = {
              procedureid: data["name"].id,
              status: data["status"],
              path: procedureDoc.ref.path
            }
          }
          if(collectiontype == "alpha"){
            this.alphaATCList = atcList
          }
          else{
            this.unvalidatedATCList = atcList
          }
          console.log(atcList[a])
        }
      }
    } catch (error) {
      console.error('Error in previewATC:', error);
    }
  }
  
  async getParticipantUPVisit(){
    const profileid = this.liveAssignment?.["participantid"]
    if(!profileid){
      this.participantUPVisitLabel = null
      this.participantUPVisitLoadedFor = null
      return
    }
    if(this.participantUPVisitLoadedFor == profileid){
      return
    }
    try {
      const snap = await getDoc(doc(this.firestore, "participant metadata", profileid))
      const consumed: string[] = snap.exists() ? (snap.data()["consumedproducts"] ?? []) : []
      const matched = consumed.filter(id => this.upProductIds.includes(id)).length
      this.participantUPVisitLabel = this.formatOrdinal(matched + 1) + ' Time'
      this.participantUPVisitLoadedFor = profileid
    } catch (error) {
      console.error('Error fetching participant UP visit:', error)
      this.participantUPVisitLabel = null
    }
  }

  private formatOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  async getLoveLetters(){
    const profileid = this.liveAssignment?.["participantid"]
    if(!profileid){
      this.loveLetterList = []
      return
    }
    if(this.loveLetterLoadedFor == profileid){
      return
    }
    this.loveLetterLoading = true
    try {
      const q = query(
        collection(this.firestore, "love letter"),
        where("profileid", "==", profileid),
        orderBy("created", "desc")
      )
      const snap = await getDocs(q)
      this.loveLetterList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      this.loveLetterLoadedFor = profileid
    } catch (error) {
      console.error('Error fetching love letters:', error)
      this.loveLetterList = []
    } finally {
      this.loveLetterLoading = false
    }
  }

  toggleLoveLetter(){
    this.showLoveLetter = !this.showLoveLetter
    if(this.showLoveLetter){
      this.getLoveLetters()
    }
  }

  async getAssignedATC(){

    const firestoreATC = getFirestore("firestore-atc");

    var startDate = this.transferredQueue != null ? this.transferredQueue["queuestartdate"].toDate() : this.ongoingQueue["queuestartdate"].toDate()
    
    try {
      const atcQuery = query(
        collection(firestoreATC, "atc_alpha"),
        where("profileid", "==", this.liveAssignment["participantid"]),
        where("implementationagent", "array-contains", this.profileid),
        where("prescription_date", ">=", startDate)
      );
      const atc = await getDocs(atcQuery);
      
      console.log(atc.size)
      if(atc.size == 0){
        this.cwATClist = []
      }
      
      for (let a = 0; a < atc.docs.length; a++) {
        const atcDoc = atc.docs[a];
        var atcData = atcDoc.data()
        
        this.cwATClist[a] = {
          atcdata: atcData,
          adjustments: [],
          cwbrief: []
        }
        
        const adjustmentQuery = query(
          collection(firestoreATC, atcDoc.ref.path, "corrections"),
          where("implementationagent", "array-contains", this.profileid)
        );
        const adjustment = await getDocs(adjustmentQuery);
        
        console.log("Total Adj", adjustment.size)
        var adjustmentread = 0
        
        for (let b = 0; b < adjustment.docs.length; b++) {
          const adjDoc = adjustment.docs[b];
          var adjustmentdata = adjDoc.data()
          
          this.cwATClist[a]["adjustments"][b] = {
            adjustments: adjustmentdata["name"],
            procedure: []
          }
          
          const procedureQuery = query(
            collection(firestoreATC, adjDoc.ref.path, "procedures"),
            where("mandatory", "==", true),
            where("assigned_to", "array-contains", doc(firestoreATC, "profile_data", this.profileid))
          );
          const procedure = await getDocs(procedureQuery);
          
          console.log("Total Pro", procedure.size)
          adjustmentread += 1
          var procedureList = []
          
          for (let c = 0; c < procedure.docs.length; c++) {
            const procedureDoc = procedure.docs[c];
            var data = procedureDoc.data()
            procedureList.push({
              procedureid: data["name"].id,
              status: data["status"],
              path: procedureDoc.ref.path
            })
          }
          
          this.cwATClist[a]["adjustments"][b]["procedure"] = procedureList
          console.log(this.cwATClist[a]["adjustments"])
  
          if(adjustmentread == adjustment.size){
            console.log("Adjustment Reading completed for ATC", a+1, this.cwATClist[a]["atcdata"]["atcid"], this.cwATClist[a]["atcdata"]["notesid"])
            var hasProcedure = this.cwATClist[a]["adjustments"].some(e => e["procedure"].length != 0)
            console.log(hasProcedure)
            
            if(hasProcedure && this.cwATClist[a]["atcdata"]["notesid"] != null){
              const atcnotesDoc = await getDoc(doc(firestoreATC, "atc_notes", this.cwATClist[a]["atcdata"]["notesid"]));
              if(atcnotesDoc.exists()){
                var notesdata = atcnotesDoc.data()
                this.cwATClist[a]["cwbrief"] = notesdata["changeworkbrief"] ?? []
              }
            } 
            else if(!hasProcedure){
              this.cwATClist[a]["adjustments"] = []
            }                     
          }
          console.log(this.cwATClist)
        }
      }
    } catch (error) {
      console.error('Error in getAssignedATC:', error);
    }
  }
  
  async markProcedure(atcindex, adjindex, proindex){
    const firestoreATC = getFirestore("firestore-atc");
    var procedure = this.cwATClist[atcindex]["adjustments"][adjindex]["procedure"][proindex]
    console.log(procedure)
    procedure["status"] = procedure["status"] == "completed" ? "yet to start" : "completed"
    
    try {
      await updateDoc(doc(firestoreATC, procedure["path"]), {
        status: procedure["status"]
      });
    } catch (error) {
      console.error('Error updating procedure:', error);
    }
  }
  
  async assignChangeagent(validated){
    const firestoreATC = getFirestore("firestore-atc");
    // var assignProperty = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']]?.studioassignprocedureproperty ?? {}
    // var eligibleStages = (validated ? assignProperty["addvalidatedatc"] : assignProperty["addunvalidatedatc"]) ?? []
    var eligibleStages = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']]["implementationstages"] ?? []
    // var eligibleStages = this.ongoingQueue['stageproperty'][this.liveAssignment['stagename']] ?? []
    console.log(this.liveAssignment);
    console.log(this.liveAssignment['stagename']);
    console.log(eligibleStages, 'eligibleStages');
    var eligibleActivityParse = []
    for (let i = 0; i < eligibleStages.length; i++) {
      const stage = eligibleStages[i];
      console.log(stage);
      
      const stageProperty = this.ongoingQueue["stageproperty"][stage];
      var compulsoryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
      console.log(compulsoryActivity,'compulsoryActivity');
      
      for (let j = 0; j < compulsoryActivity.length; j++) {
        const activitycombination:any = compulsoryActivity[j];
        var parse = activitycombination.sort((a, b) => a.toString().localeCompare(b.toString())).join(",")
        eligibleActivityParse.push(parse)
      } 
    }
    console.log(eligibleActivityParse)

    var eligibleStudio = this.allStudioList.filter(studio => eligibleActivityParse.includes(Object.values(studio["participantsactivity"]).sort((a, b) => a.toString().localeCompare(b.toString())).join(",")))
    console.log(eligibleStudio)

    var allParticipants = eligibleStudio.reduce((acc, studio) => {
      if (Array.isArray(studio.participants)) {
          acc.push(...studio.participants);
      } else {
          console.log('No participants array found in this studio:', studio);
      }
      return acc;
    }, []);

    let chunkSize = 10;
    let preassigned = [];
    this.mappreassignedagent = {};
    this.mappreassignedprocedure = {};

    for (let i = 0; i < allParticipants.length; i += chunkSize){
      let chunk = allParticipants.slice(i, i + chunkSize);
      console.log(this.ongoingQueue["docid"]);
      let promise = getDocs(query(collection(firestoreATC,"atc_alpha"), where('queueid', '==', this.ongoingQueue["docid"]),where('isdelete','==',false),where("implementationagent", "array-contains-any", chunk)))
      preassigned.push(promise)
    }
    console.log(preassigned.length);
    let preassignedagent = [];
    await Promise.all(preassigned).then(results => {
      console.log(results); 
      results.forEach(snap => {
        snap.docs.forEach(e => {
          console.log(e.data());
          preassignedagent.push(e.data()) 
          if(e.data()['implementationagent'] != null && e.data()['implementationagent'] != undefined && e.data()['implementationagent'].length != 0){
            e.data()['implementationagent'].forEach(agent => {
              console.log(agent);
              if (!this.mappreassignedagent[agent]) {
                this.mappreassignedagent[agent] = 0;
              }
              this.mappreassignedagent[agent]++;
              if(e.data()['totalmandatoryprocedure'] == e.data()['totalmandatoryprocedurecompleted']){
                console.log(e.data()['totalmandatoryprocedure']);
                this.mappreassignedagent[agent]--;
              }
            })
          }
        })
        
      });
      preassignedagent.forEach(e => {
        if(e['implementationagent'] != null && e['implementationagent'] != undefined && ![null,undefined].includes(e['implementationagentcount'])){
          Object.keys(e['implementationagentcount']).forEach(key =>{
            if(key != null && key != undefined){
              let value = e['implementationagentcount'][key];
              console.log(value);
              console.log(value['totalmandatoryprocedure']);
              var assignedprodure = value['totalmandatoryprocedure'] - value['totalmandatoryprocedurecompleted']

              if(assignedprodure == 0 && this.mappreassignedagent[key] != 0){
                this.mappreassignedagent[key]--;
              }else if(assignedprodure == 0 && this.mappreassignedagent[key] == 0){
                this.mappreassignedagent[key] = 0
              }
              this.mappreassignedprocedure[key] = (this.mappreassignedprocedure[key] || 0) + assignedprodure
            }
          })
        }
      })
    })
    .catch(error => {
        console.error('Error fetching documents:', error);
    });
    
    

    this.dialog.open(AssignProcedureStudioComponent, {
      data: {
        studiolist: eligibleStudio,
        collectiontype: validated || this.profileRoles["mentor"] ? "alpha" : "validation",
        authorid: this.selectedStudio["participants"],
        participantid: this.liveAssignment["participantid"],
        mapprofile: this.mapProfile,
        mappreassignedagent : this.mappreassignedagent,
        mappreassignedprocedure : this.mappreassignedprocedure
      },
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true
    }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
      if(result != null){
        var token = this.liveAssignment["token"]
        var preassigned = token["preassigned"] ?? {}
        eligibleStages.forEach(stage=>{
          preassigned[stage] = Array.from(new Set((preassigned[stage] ?? []).concat(result)))
        })
        updateDoc(doc(this.firestore, 'queue_token', token["docid"]), {
          preassigned: preassigned
        })
        
      }
    })
  }
  
  getTripleATC(){
    const firestoreATC = getFirestore("firestore-atc")
    var involvedQueue = [this.ongoingQueue["docid"]]
    console.log(involvedQueue)
    if(this.transferredQueue != null) involvedQueue.push(this.transferredQueue["docid"])
    console.log(this.transferredQueue)
    
    const tripleATCQuery = query(
      collection(firestoreATC, "triple atc"),
      where("profileid", "==", this.liveAssignment["participantid"]),
      where("queueid", "in", involvedQueue),
      where("status", "==", "atc given")
    );
    
    this.tripleATCSubscription = collectionData(tripleATCQuery).subscribe(atc => {
      this.tripleATCList = atc.sort((a, b) => a["prescription_date"].toDate() - b["prescription_date"].toDate())
    });
  }
  
  viewTripleATC(id){
    const url = this.router.createUrlTree(['/edittripleATC/'+id])
    window.open(url.toString(), '_blank')
  }

  async getQueueRefFromTransferredFrom(value:DocumentReference){
    let docData = await getDoc(value)
    return docData.data()
  }
  
  async getCurrentAEL(){
    console.log("Checking AEL.....")
    this.participantAEL = {}

    if(!this.liveAssignment["token"]) return;
    
    try {
      const level = await getDocs(collection(this.firestore, "accelerated evolution level"));
      this.aelLevelList = level.docs.map(e => e.data())

      var involvedQueueID = []
      involvedQueueID.push(this.liveAssignment["token"]['queueref'].id)
      if(![null,undefined].includes(this.liveAssignment["token"]["transferredfrom"])){
        involvedQueueID.push(this.liveAssignment["token"]["transferredfrom"].id)
        let currentRef:DocumentReference | null = this.liveAssignment["token"]['tokentransferredfrom'] ?? null
        while (currentRef != null) {
          const transferData = await this.getQueueRefFromTransferredFrom(currentRef);
          if(![null,undefined].includes(transferData['transferredfrom'])){
            involvedQueueID.push(transferData["transferredfrom"].id)
            currentRef = transferData['tokentransferredfrom']
          }else{
            currentRef = null;
            break;
          }
        }
      }

      var aelQuery = query(collection(this.firestore, "participant AEL"), where("queueid", "in", involvedQueueID), where("profileid", "==", this.liveAssignment['participantid']))
      const ael = await getDocs(aelQuery);

      if(ael.docs.length != 0){
        this.participantAEL = ael.docs[0].data()
        this.participantAEL["aelStatus"] = this.participantAEL["flag"]
        this.participantAEL["originalmetric"] = this.participantAEL["crossovermetric"] ?? {}
        this.participantAEL["crossovermetric"] = Object.keys(this.participantAEL["crossovermetric"] ?? {}).length == 0 ? null : this.participantAEL["crossovermetric"]
        if(this.participantAEL["crossovermetric"] != null){
          Object.keys(this.participantAEL["crossovermetric"]).forEach(key =>{
            var metric = this.participantAEL["crossovermetric"][key]
            metric["value"] = metric["startpoint"] + "---" + metric["endpoint"]
          })
        }
      }
      
      /*
      const deliverableQuery = query(
        collection(this.firestore, "deliverables"),
        where("fileref", "array-contains", doc(this.firestore, "queue_token", this.liveAssignment["token"]["docid"])),
        limit(1)
      );
      const deliverable = await getDocs(deliverableQuery);
      
      if(deliverable.size != 0){
        var participantProductID = deliverable.docs[0].data()["participantproductid"]
        console.log("Participant Product ID", participantProductID)
        
        const product = await getDoc(doc(this.firestore, "participantsproduct", participantProductID));
        if(product.exists()){
          var productData = product.data()
          console.log("AEL ID", productData["aelid"])
          
          if(productData["aelid"] != null && productData["aelid"] != undefined){
            const ael = await getDoc(doc(this.firestore, "participant AEL", productData["aelid"]));
            if(ael.exists()){
              this.participantAEL = ael.data()
              this.participantAEL["originalmetric"] = this.participantAEL["crossovermetric"] ?? {}
              this.participantAEL["crossovermetric"] = Object.keys(this.participantAEL["crossovermetric"] ?? {}).length == 0 ? null : this.participantAEL["crossovermetric"]
              if(this.participantAEL["crossovermetric"] != null){
                Object.keys(this.participantAEL["crossovermetric"]).forEach(key =>{
                  var metric = this.participantAEL["crossovermetric"][key]
                  metric["value"] = metric["startpoint"] + "---" + metric["endpoint"]
                })
              }
            }
          }
        }
      }
      */
    } catch (error) {
      console.error('Error in getCurrentAEL:', error);
    }
  }
  
  async updateCurrentAEL(){
    var reviewed = false
    // Generate new document ID
    const newDocId = doc(collection(this.firestore, 'temp')).id;
    
    var crossoverdata = {
      "docid": newDocId,
      "aelid": this.participantAEL["docid"],
      "created": serverTimestamp(),
      "metric": {},
      "profileid": this.liveAssignment["participantid"],
      "validatedby": this.profileid
    }
    
    Object.keys(this.participantAEL["crossovermetric"]).forEach(key =>{
      var original = this.participantAEL["originalmetric"][key]
      var metric = this.participantAEL["crossovermetric"][key]
      var newValue = metric["value"]
      var splitValue = newValue.split("---")
      crossoverdata["metric"][key] = crossoverdata["metric"][key] ?? {}
      crossoverdata["metric"][key]["startpoint"] = splitValue[0]
      crossoverdata["metric"][key]["endpoint"] = splitValue[1]
      crossoverdata["metric"][key]["metric"] = metric["metric"] ?? null
      if(original["startpoint"] != splitValue[0] || original["endpoint"] != splitValue[1]){
        reviewed = true
      }
    })
    console.log(crossoverdata)
  
    try {
      var batch = writeBatch(this.firestore)
      batch.set(doc(this.firestore, "interim crossover", crossoverdata.docid), crossoverdata)
      var newAELdata = {
        "crossovermetric": crossoverdata.metric,
        "flag": "validated",
        "validatedby": this.profileid
      }
      if(reviewed){
        newAELdata["updated"] = true
      }
      batch.update(doc(this.firestore, "participant AEL", crossoverdata.aelid), newAELdata)
      await batch.commit().then(()=> {
        console.log("AEL Updated Successfully");
        this.participantAEL["status"] = "validated"
        this.participantAEL["aelStatus"] = "validated"
      })
    } catch (error) {
      console.error('Error in updateCurrentAEL:', error);
    }
  }
  
  navigateMeeting(doc:any){
    console.log(doc);
    const zoomData = doc["zoomdata"] ?? {}

    if(!zoomData["start_url"] || zoomData["start_url"] == "Link Broken"){
      alert("Link is broken. Generate new Link.")
      return
    }

    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/openmeeting', doc['docid'], 'queue'])
    );
         
    window.open(url, "_blank");
  }
  
  async movetoNextMonthReview(){
    console.log(this.liveAssignment);
    var token = this.liveAssignment["token"]
    
    if(window.confirm('Are you sure want to move participants to the next month review?')){
      try {
        await setDoc(doc(this.firestore, "review participants", token['docid']), token);
      } catch (error) {
        console.error('Error moving to next month review:', error);
      }
    }
  }

  async getstudiochat(chat) {
    if(Object.keys(this.subscription).includes('messages')){
      console.log("Destroy");
      
      for(var key in this.subscription) {
        this.subscription[key].unsubscribe();
      }
    }
    if (this.selectedChat && this.selectedChat.docid === chat['docid']) {
      // If the same chat is clicked again, toggle the selectedParticipant to false
      this.selectedParticipant = false;
      this.selectedChat = null;
      this.messages = [];
      return;
    }
    this.selectedParticipant = true
    console.log(chat);
    this.chatId = chat['docid'];
    this.chatsloading = true;
    this.messagescopy = [];
    this.messages = [];
    this.subscription = {};
    this.pendingMessagesCount[chat['docid']] = 0
    this.chatref = query(
      collection(this.firestore, 'studio conversation'),
      where('docid', '==', chat['docid'])
    );
    
  
    const chatDocs = await this.chatref.get().toPromise();
  
    if (!chatDocs.empty) {
      chatDocs.forEach(async chatDoc => {
        const chatData = chatDoc.data();
        const data = {
          chatindex: chatData['pendingmessages'] ?? 0,
          useruid: this.currentuseruid,
          username: this.currentuserData['name'],
          useremail: this.currentuserData['email'],
          userprofileid: this.currentuserData['profileid'],
          chatname: chatData["chatname"],
          chatprofile: chatData["chatprofile"],
          members: chatData["members"] ?? [],
          docref: chatDoc.ref,
          docid: chatDoc.id,
        };
  
        this.selectedChat = data;
        this.selectedchat(this.selectedChat);
  
        const messagesRef = query(collection(this.firestore,`studio conversation/${chatDoc.id}/messages`), orderBy('time', 'asc'));
        
        this.subscription['messages'] = collectionSnapshots(messagesRef).pipe(takeUntil(this.subscriptionHandle)).subscribe((messageDocs) => {
          this.subscribemessagesboolean = true;
          const messages = messageDocs.map(messageDoc => {
            const element = messageDoc.data() as any;
            element['docref'] = messageDoc.ref;
            element['docid'] = element['messageid'];
            element['time'] = element['time'];
            element['senderuid'] = element['sender_uid'];
            element['originalmessage'] = element['message'];
            element['message'] = [null, undefined, ''].includes(element['message']) ? '' : element['message'].replace(/\n/g, '<br>');
            element['read_by'] = element['read_by'];
            element['pending'] = element['pending'];
            element['link'] = element['link'];
            element['type'] = element['type'] ?? null;
            return element;
          });
  
          this.messagescopy = messages;
          this.messages = messages;
          this.cdr.detectChanges();
          this.scrollToIndex();
        });
      });
    } else {
      console.log('No chat documents found.');
    }
  }
  

  scrollToIndex() {
  
    if (this.itemElements && this.itemElements.length > 0) {
      const lastItem = this.itemElements.last.nativeElement;
      lastItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }


  // Method to toggle chat container visibility
  toggleChatContainer() {
    this.isChatContainerOpen = !this.isChatContainerOpen;
  }


  //sending message to support chat
  async sendMessage(formvalue) {
    console.log(formvalue);
    if(formvalue.sms == '' && formvalue.sms == '\n'){
      alert("Oops, Please type a message....");
    }else{
      console.log("Sending Message");
      
      var msgData ={};
      var lastmessage = {};
      var message = formvalue.sms
      this.resetform();

      // var extractedLinks = (formvalue.sms.match(this.linkPattern) || []).map(link => link.trim());

      console.log('uploading');
      var time = new Date();
      const docID = doc(collection(this.firestore,'messages')).id

      const chatDocsSnapshot = await this.chatref.get().toPromise();

      if (!chatDocsSnapshot.empty) {
        const chatDoc = chatDocsSnapshot.docs[0]; // Take the first matching document
        const msgDocRef = chatDoc.ref.collection("messages").doc(docID);

        var members = this.selectedChat['members'] ?? [];
        var index = members.indexOf(this.selectedChat['useruid']);
        
        if (index > -1) {
            members.splice(index, 1);
        }

        msgData = {
            "time": time,
            "sender_uid": this.selectedChat['useruid'],
            "sender_email": this.selectedChat['useremail'],
            "message": message,
            "messageid": docID,
            "read_by": [this.selectedChat['useruid']],
            "pending": members,
            "files": [],
            "type": 'text'
        };

        lastmessage = {
            "last_modification": time,
            "last_message": message,
            "last_pending": members,
            "last_read_by": [this.selectedChat['useruid']],
            "last_sender_uid": this.selectedChat['useruid'],
            "files": []
        };

        const batch = writeBatch(this.firestore);
        batch.set(msgDocRef, msgData);

        await batch.commit().then(async () => {
            this.message = '';
            console.log('Message sent successfully');
            this.openSnackBar("Message sent successfully", "Ok");
        }).catch((error) => {
            console.log('error', error);
            this.openSnackBar("Oops something went wrong", "Ok");
        });
        var url = window.location.href.split('/')
        console.log(url);

        var tokens = [];
        var userRefs = [];
        if (this.selectedChat['members'].length != 0) {
            for (let j = 0; j < this.selectedChat['members'].length; j++) {
                const element = this.selectedChat['members'][j];
                if (![null, undefined].includes(this.mapNotificationid[element])) {
                    tokens.push(this.mapNotificationid[element]);
                }
                userRefs.push(doc(this.firestore,"user_data",element))
            }
            // Uncomment and implement push message logic if needed
            await this.guard.sendPushMessage(
              'Message From ' + this.currentuserData['name'],
              message + ' http://'+url[2]+'/'+this.chatId,
              'http://'+url[2]+'/chat/chats/'+'/'+this.chatId,
              tokens
            );

            addDoc(collection(this.firestore, "A&H updates"), {
              date: serverTimestamp(),
              users: userRefs,
              title: this.mapProfileuid[msgData['sender_uid']]['name'],
              message: msgData['message'],
              sticky: false,
              landingpage: null,
              notificationimage: null,
            }).then((id)=>{
              console.log(id.id,"updated A&H Updates")
            }).catch((error)=>{
              console.log("Oops error while updating A&H updates");
            });
        }
    } else {
        console.error('No chat document found for the given live assignment ID');
    }

     
    }
  }


  // mark unread message as read
  async selectedchat(value){
    console.log(value);
    getDocs(query(collection(this.firestore,'studio conversation',value['docid'],"messages"),where('pending','array-contains',this.currentuseruid),orderBy("time",'desc'))).then((newData)=>{
      for (let i = 0; i < newData.docs.length; i++) {
        const element = newData.docs[i];
        this.updateRecipient(element.ref,this.currentuseruid);
      }
    });
    var ref = doc(this.firestore,"studio conversation",value['docid'])
    this.updateSupportchat(ref,this.currentuseruid);
  }


  resetform(){
    this.messageform.patchValue({
      sms:'',
      files :[]
    });
  }
  
  sendMsg(e: Event) {
    const keyboardEvent = e as KeyboardEvent;
    if (!keyboardEvent.shiftKey) { 
      keyboardEvent.preventDefault();
      var msg = this.messageform.controls['sms'].value.trim();
      if (msg != "") {
        this.sendMessage(this.messageform.value);
      }
    }
  }

  openSnackBar(message:string,action:string) {
    this.snackBar.open(message,action,{ duration: 2000})
  }
  
  //updating supportchat message
  updateRecipient(msgRef,uid) {
    msgRef.update({
      "read_by": arrayUnion(uid),
      "pending": arrayRemove(uid)
    }).then(()=>{
      console.log('reciept updated successfully');
    }).catch((error)=>{
      console.log('Oops Error while updating reciept',error);
    });
  }

  //updated supportchat
  updateSupportchat(msgRef,uid) {
    var collection = msgRef.path.split("/");
    updateDoc(doc(this.firestore,collection[0],collection[1]),{
      "last_read_by": arrayUnion(uid),
      "last_pending": arrayRemove(uid)
    }).then(()=>{
      console.log('reciept updated successfully');
    }).catch((error)=>{
      console.log('Oops Error while updating reciept',error);
    });
  }

  trackById(index: number, item: any): string {
    return item.key;
  }

  async joinOpenViduRoom(){
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Setting uP!..."},
      disableClose: true
    })
    try{
      var liveAssignmentID = this.liveAssignment["docid"]
      var roomDoc = doc(this.firestore, "openviduroom", liveAssignmentID)

      await getDoc(roomDoc).then(async doc =>{
        if(!doc.exists()){
          await this.guard.createOpenViduRoom({
            active: true,
            createddate: serverTimestamp(),
            sessiontype: "live assignment",
            sessionid: liveAssignmentID,
            roomid: liveAssignmentID,
            hosts: this.liveAssignment["pairing"],
            participantid: this.liveAssignment["participantid"],
            title: `${this.mapProfile[this.liveAssignment["token"]?.profile_id]} - ${this.liveAssignment["stagename"]} (${this.liveAssignment["pairing"].map(e => this.mapProfile[e]).join(", ")})`,
            metadata: {
              queueid: this.ongoingQueue["docid"]
            }
          })

          // var roomData = {
          //   active: true,
          //   createddate: serverTimestamp(),
          //   sessiontype: "live assignment",
          //   sessionid: liveAssignmentID,
          //   roomid: liveAssignmentID,
          //   hosts: this.liveAssignment["pairing"],
          //   participantid: this.liveAssignment["participantid"],
          //   title: `${this.mapProfile[this.liveAssignment["token"]?.profile_id]} - ${this.liveAssignment["stagename"]} (${this.liveAssignment["pairing"].map(e => this.mapProfile[e]).join(", ")})`,
          //   metadata: {
          //     queueid: this.ongoingQueue["docid"]
          //   }
          // }
          // await setDoc(roomDoc, roomData)
        }
        else{
          if(!doc.data()["active"]){
            await updateDoc(roomDoc, {active: true})
          }
        }
      })

      loading.close()

      var hostname = window.location.origin
      window.open(`${hostname}/joinroom/${liveAssignmentID}`, '_blank')
    }
    catch(err){
      loading.close()
      console.log(err)
    }
  }
}
