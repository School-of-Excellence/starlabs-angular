import { Component, OnInit, ChangeDetectorRef, QueryList, ElementRef, ViewChildren, ViewChild, NgZone, TemplateRef, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom, Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { collection, collectionData, doc, Firestore, getDoc, getDocs, getCountFromServer, orderBy, query, updateDoc , arrayUnion, deleteDoc, setDoc, serverTimestamp, arrayRemove, addDoc, writeBatch, collectionSnapshots, documentId, limit, where, DocumentReference, getFirestore } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
    MatTooltipModule,
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
  @ViewChild('atcDialogTpl') atcDialogTpl!: TemplateRef<any>;
  @ViewChild('checkinConflictTpl') checkinConflictTpl!: TemplateRef<any>;
  @ViewChild('collaboratorBusyTpl') collaboratorBusyTpl!: TemplateRef<any>;
  @ViewChild('chatScroll') chatScroll: ElementRef
  // The scrollable content area of the live studio. Reset to the top whenever the
  // active step changes so a new stage always shows its top content (previously
  // it kept the scroll position from the stage you switched away from).
  @ViewChild('dsMainScroll') dsMainScroll?: ElementRef<HTMLElement>
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
  // Flat list of ALL the user's studios across every queue (mockup lobby: shows
  // studios directly, no queue-selection step). Built from the same
  // "queue studio pairing" subscription that powers the per-queue counts.
  allStudios: any[] = []
  private allStudioChunks: any[][] = []
  queueStudioCountSubscriptions: Subscription[] = []
  mapVariationName = {}
  queueVariation = {}
  mapQueue = {}
  // Activity
  activitySubscription:Subscription = null
  mapActivity:any = {}
  // activityId -> [profileId] of specialists who can run that activity, sourced
  // from `big cohorts` (bigactivity -> participantidlist). Powers the
  // activity-scoped specialist chips in the Enter-Studio popup (mirrors the
  // big-planner screen's filterInvitedParticipant logic).
  activitySpecialistMap: { [activityId: string]: string[] } = {}
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
  // One live-assignment listener per ongoing-queue chunk (Firestore `in` caps
  // at 30 ids). Tracked so they can be torn down on queue switch / destroy —
  // the old single-field listener was never stored and leaked on every switch.
  outsideLiveAssignmentSubscriptions: Subscription[] = []
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
  // Tokens this SAME studio has a still-pending invitation for (awaiting the
  // participant's response). Keyed by token doc id. Used by the waiting-list row
  // to replace the "Bring To Studio" CTA with an "awaiting response" chip + a
  // Cancel action, so the specialist can't re-invite (and hit the reservation
  // guard) and can recover a stuck participant without waiting for expiry.
  // `approved` distinguishes a still-pending invite (awaiting response) from one
  // the participant already approved — the latter shows an "Assign studio" CTA
  // that reopens the assign dialog (otherwise an accidentally-dismissed dialog
  // is unrecoverable). `invitation` is the full doc so the CTA can re-invoke
  // assignStudio().
  tokenInvitedBySelf: { [tokenDocId: string]: { invitationDocId?: string; approved?: boolean; invitation?: any } } = {}
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
  // Next-month-review action state (drives the inline confirmation in the
  // Mark-as-Completed step so the specialist sees the action succeeded).
  nextMonthReviewMarked: boolean = false
  nextMonthReviewSaving: boolean = false
  // Evolution Wishlist
  evolutionWishlist: any[] = []
  evolutionWishlistLoaded: string = ''
  evolutionWishlistLoading: boolean = false
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
  // Realtime listeners for the "previous ATC" lists, keyed by collectiontype
  // ('alpha' | 'validation'). previewATC() replaces the entry for its key on
  // every call, so at most TWO listeners ever exist (no unbounded growth). Torn
  // down on destroy via subscriptionHandle and explicitly in ngOnDestroy. The
  // nested corrections/procedures stay one-time getDocs per emit to avoid a
  // nested-listener fan-out.
  private previousAtcSubs: { [key: string]: Subscription } = {}
  private subscriptionHandle = new Subject<void>()
  messageform:FormGroup 
  chatId: any;
  pendingMessagesCount: { [key: string]: number } = {};
  isChatContainerOpen: boolean = false;
  // deleteOption : boolean = false
  // Participant AEL
  aelLevelList = []
  private aelLevelListLoaded = false
  participantAEL = {}
  // AEL slider modal (mockup): opened from the AEL step. The slider indexes the
  // existing band list (aelLevelList) so the stored "start---end" value model is
  // unchanged — this is UI only.
  aelModalOpen = false
  // "Move to Next Stage" dropdown (mockup): replaces the old Mark-as-Completed
  // step. Same moveStage()/movetoNextMonthReview() actions, now in a popup
  // opened from the header or footer trigger.
  nextStageMenuOpen: 'header' | 'footer' | null = null
  isLoadingStudios: boolean;

  // Stepper state (v2)
  activeStepId: string = ''
  // Deep-link target: a step id requested via the `?step=` query param (e.g. the
  // "Prescribe ATC" bubble in the in-call Zoom view). The stepper is built async
  // once the live assignment loads, so we can't set activeStepId in the
  // constructor — it would be overwritten by the visibleSteps re-sync. Instead we
  // stash the request here and apply it in that re-sync once the step exists.
  private pendingDeepLinkStep: string = ''
  // Precomputed index of activeStepId within visibleSteps. Kept in sync at the
  // three points activeStepId / the step list can change (the visibleSteps
  // getter's re-sync block, setActiveStep, goToStep) so the template can read a
  // field instead of calling getStepIndex(activeStepId) — which re-runs the
  // side-effecting visibleSteps getter on every change-detection tick.
  activeStepIndex: number = -1
  // True once the "Previous ATC & Love Letters" step has been opened at least
  // once. The step's content is then kept mounted (toggled with [hidden] instead
  // of *ngIf) so the heavy <app-view-participant-atc> child loads ONCE and
  // persists, instead of being destroyed/recreated — and re-fetching all its ATC
  // getDocs — on every step change.
  prevHistoryMounted: boolean = false
  // Master switch for the AI-ATC pre-check. While false the whole studio-side feature is held:
  // no queue_atc_generation query, and the "Use AI-Generated ATC" buttons never render. Flip to
  // true to release the feature.
  aiAtcFeatureEnabled: boolean = false
  // Inline "Use AI ATC" button state for the Prescribe ATC step (populated by
  // checkAiAtcAvailability() when a completed queue_atc_generation doc exists for the participant).
  aiAtcAvailable: boolean = false
  aiAtcDocId: string | null = null
  aiAtcCheckedKey: string | null = null
  private lastStepSignature: string = ''
  private userNavigated: boolean = false
  private lastAssignmentId: string = ''
  //Chat
  isChatOpen = false
  chatMessages: any[] = []
  chatText = ''
  chatAttachedFiles: any[] = []
  chatUploading = false
  chatHasMore = false
  hasUnreadChat = false
  unreadChatCount = 0
  private allChatMessages: any[] = []
  private chatDisplayCount = 10
  private chatUnreadSub: Subscription = null
  private chatLiveSub: Subscription = null

  // Sidebar profile collapse state (Milestone/Product/Variation/Journey rows)
  sidebarProfileOpen: boolean = true
  toggleSidebarProfile() { this.sidebarProfileOpen = !this.sidebarProfileOpen }

  // Expand/collapse state for the "Extra invited specialists" roster panel.
  extraSpecialistsOpen: boolean = true
  toggleExtraSpecialists() { this.extraSpecialistsOpen = !this.extraSpecialistsOpen }

  // Per-stage-note expand state (clamp to 2 lines, "Show more" when longer).
  expandedStageNotes = new Set<string>()
  toggleStageNote(key: string) {
    if (this.expandedStageNotes.has(key)) this.expandedStageNotes.delete(key)
    else this.expandedStageNotes.add(key)
  }
  isStageNoteExpanded(key: string): boolean {
    return this.expandedStageNotes.has(key)
  }

  /**
   * The participant's profile ID for the current live assignment. Prefers
   * the queue_token's `profile_id` (set when the specialist invited them
   * via the Bring-To-Studio flow) but falls back to the assignment's own
   * `participantid` so auto-enter (no token hydrated) still shows the
   * participant's name and photo in the sidebar.
   */
  get participantProfileId(): string {
    const la: any = this.liveAssignment || {}
    return la['token']?.['profile_id'] || la['participantid'] || ''
  }

  /**
   * Runs ALL widget-driven fetches for the current live assignment —
   * Validated ATC, Unvalidated ATC, Assigned ATC, Triple ATC, AEL, UP
   * Visit, Forms, Transferred Queue. Idempotent — safe to call from both
   * `onStudioSelect`'s queue_token subscription AND directly from the
   * live-assignment auto-enter path, so the data lights up regardless of
   * which path fired first.
   * Only re-runs when the assignment / stage actually changes.
   */
  private widgetFetchSignature = ''
  async loadAssignmentWidgetData() {
    const la: any = this.liveAssignment
    if (!la?.['docid'] || !la?.['stagename']) return
    // Include the token identity so a freshly-hydrated token (auto-enter path
    // runs before the token settles) triggers exactly ONE refresh of the
    // token-dependent widgets (AEL, Forms), then same-token ticks are skipped.
    const sig = la['docid'] + '|' + la['stagename'] + '|' + (la['token']?.['docid'] ?? 'pending')
    if (sig === this.widgetFetchSignature) return  // already loaded this combination
    this.widgetFetchSignature = sig
    this.initChatThread()

    // New assignment/stage → reset per-session action state so confirmations
    // from a previous participant don't carry over.
    this.nextMonthReviewMarked = false
    this.nextMonthReviewSaving = false

    const studioWidget: string[] =
      this.ongoingQueue?.['stageproperty']?.[la['stagename']]?.studiowidgets ?? []
    console.log('[loadAssignmentWidgetData] widgets', studioWidget)

    // Validated / Alpha ATC
    if (studioWidget.includes('prescribedvalidatedatc')) {
      this.previewATC('alpha')
    } else {
      this.alphaATCList = []
    }
    // Unvalidated ATC
    if (studioWidget.includes('prescribedunvalidatedatc')) {
      this.previewATC('validation')
    } else {
      this.unvalidatedATCList = []
    }
    // Assigned changework ATC
    if (studioWidget.includes('assignedatc')) {
      this.getAssignedATC()
    } else {
      this.cwATClist = []
    }
    // Triple ATC
    if (studioWidget.includes('viewtripleatc')) {
      this.getTripleATC()
    } else {
      this.tripleATCList = []
    }
    // UP visit count for the Milestone row
    this.getParticipantUPVisit()
    // AEL
    if (studioWidget.includes('validateael')) {
      this.getCurrentAEL()
    } else {
      this.participantAEL = {}
    }
    // Evolution Wishlist
    if (studioWidget.includes('evolutionwishlist')) {
      this.loadEvolutionWishlist(this.participantProfileId)
    } else {
      this.evolutionWishlist = []
    }
    // Forms (needs token.queueref for cross-queue history; falls back to
    // a single-queue lookup if the token isn't hydrated yet).
    this.loadParticipantForms()
  }

  /**
   * Fetches the participant's Evolution Wishlist log entries from the
   * `evolutionwishlistlog` collection, sorted newest-first. Guarded by
   * `evolutionWishlistLoaded` (profileid) to avoid re-fetching for the same
   * participant. Each entry keeps its raw fields — the template formats them.
   */
  async loadEvolutionWishlist(profileid: string) {
    if (!profileid) {
      this.evolutionWishlist = []
      return
    }
    if (this.evolutionWishlistLoaded === profileid) {
      return
    }
    this.evolutionWishlistLoading = true
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'evolutionwishlistlog'),
        where('profileid', '==', profileid),
      ))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a: any, b: any) => {
        const am = typeof a?.['created']?.toMillis === 'function' ? a['created'].toMillis() : 0
        const bm = typeof b?.['created']?.toMillis === 'function' ? b['created'].toMillis() : 0
        return bm - am
      })
      this.evolutionWishlist = list
      this.evolutionWishlistLoaded = profileid
    } catch (error) {
      console.error('Error fetching evolution wishlist:', error)
      this.evolutionWishlist = []
    } finally {
      this.evolutionWishlistLoading = false
    }
  }

  /** Formats an Evolution Wishlist `type` for display. */
  formatEvolutionWishlistType(type: string): string {
    if (type === 'familyandpeers') return 'Family & Peers'
    if (type === 'self') return 'Self'
    return type || '-'
  }

  /**
   * Formats an Evolution Wishlist `status` for display. 'sended' renders as
   * 'Shared'; the 'Partially ' prefix is applied when `mannualcompleted` is
   * truthy on the entry.
   */
  formatEvolutionWishlistStatus(entry: any): string {
    let status: string = entry?.['status'] || '-'
    if (status === 'sended') status = 'Shared'
    if (entry?.['mannualcompleted']) status = 'Partially ' + status
    return status
  }

  /**
   * Returns the contacts count string `submitted/total` when the entry has a
   * contacts array; otherwise null (hide the chip). The submitted count is
   * computed from the contacts array directly (matching the Evolution
   * Wishlist Log screen, which counts `contact.submitted === true`) so it's
   * accurate even when the doc doesn't carry a stored `submittedCount`.
   */
  evolutionWishlistContactsLabel(entry: any): string | null {
    const contacts = entry?.['contacts']
    if (!Array.isArray(contacts) || contacts.length === 0) return null
    const submitted = contacts.filter((c: any) => c?.submitted === true).length
    return `${submitted}/${contacts.length}`
  }

  /**
   * Fetches the participant's submitted forms for the current live
   * assignment's stage. Tolerant of a missing `token` — falls back to the
   * ongoing queue's ref when the token hasn't been hydrated by
   * `onStudioSelect`'s queue_token subscription yet.
   */
  private async loadParticipantForms() {
    const la: any = this.liveAssignment
    if (!la?.['stagename']) { this.participantForm = []; return }
    const mappedForm: string[] =
      this.ongoingQueue?.['stageproperty']?.[la['stagename']]?.participantform ?? []
    if (mappedForm.length === 0 || !la?.['participantid']) {
      this.participantForm = []
      return
    }
    try {
      // Resolve the queue_token for THIS live assignment freshly, so form
      // loading doesn't depend on token-hydration timing (ensureTokenForAssignment
      // runs un-awaited on the auto-enter path) or on a stale token carried
      // over from a previous participant. Without this, a specialist who
      // auto-enters a studio before the token settles — or whose participant
      // was transferred from another queue — sees no forms while another
      // specialist (direct-queue participant) sees them fine.
      let token: any = la?.['token']
      if (!token?.['queueref'] || token?.['liveassignmentid'] !== la['docid']) {
        const tokSnap = await getDocs(query(
          collection(this.firestore, 'queue_token'),
          where('liveassignmentid', '==', la['docid']),
          limit(1),
        ))
        token = tokSnap.empty ? null : tokSnap.docs[0].data()
      }

      const firestoreForms = getFirestore('firestore-forms')
      // Build the full set of queues whose forms count for this participant:
      // the current queue plus the entire transfer chain it came through.
      // Mirrors onStudioSelect's manual "Bring to Studio" path so both behave
      // identically for transferred participants.
      let involvedQueueRef: any[] = []
      if (token?.['queueref']) {
        involvedQueueRef.push(token['queueref'])
        if (![null, undefined].includes(token['transferredfrom'])) {
          involvedQueueRef.push(token['transferredfrom'])
          let currentRef: DocumentReference | null = token['tokentransferredfrom'] ?? null
          while (currentRef != null) {
            const transferData = await this.getQueueRefFromTransferredFrom(currentRef)
            if (![null, undefined].includes(transferData['transferredfrom'])) {
              involvedQueueRef.push(transferData['transferredfrom'])
              currentRef = transferData['tokentransferredfrom']
            } else {
              currentRef = null
              break
            }
          }
        }
      } else {
        // No token at all — fall back to the ongoing queue's own ref.
        involvedQueueRef.push(doc(this.firestore, 'queue generation', this.ongoingQueue['docid']))
      }
      involvedQueueRef = involvedQueueRef.map(e => doc(firestoreForms, e.path))

      const snap = await getDocs(query(
        collection(firestoreForms, 'formsByClient'),
        where('queueref', 'in', involvedQueueRef),
        where('profileid', '==', la['participantid']),
      ))
      this.participantForm = snap.docs.map(d => d.data())
        .filter(d => mappedForm.includes(d['formid']))
      console.log('[loadParticipantForms] result', this.participantForm)
    } catch (err) {
      console.warn('loadParticipantForms failed', err)
      this.participantForm = []
    }
  }

  /**
   * Auto-fetches the queue_token row for the current live assignment when
   * it isn't already attached (e.g. when we entered the studio directly via
   * auto-enter, skipping the Bring-To-Studio flow). Stamps it onto
   * `liveAssignment.token` so the existing template bindings light up
   * (product name, variation, queueposition, preassigned, etc.).
   */
  private fetchingTokenFor = ''
  private async ensureTokenForAssignment() {
    const la: any = this.liveAssignment
    if (!la?.['docid']) return
    if (la['token']?.['profile_id']) return  // already hydrated
    if (this.fetchingTokenFor === la['docid']) return  // already fetching
    this.fetchingTokenFor = la['docid']
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'queue_token'),
        where('liveassignmentid', '==', la['docid']),
        limit(1),
      ))
      if (!snap.empty) {
        const tok: any = snap.docs[0].data()
        if (this.liveAssignment?.['docid'] === la['docid']) {
          this.liveAssignment = { ...this.liveAssignment, token: tok }
        }
      }
    } catch (err) {
      console.warn('ensureTokenForAssignment failed', err)
    } finally {
      this.fetchingTokenFor = ''
    }
  }

  // True only when the participant is currently in the wait screen (which
  // is the moment the specialist might want to jump to the meeting button).
  // Used to gate the topbar "Jump to Meeting" CTA.
  get participantInWaitingRoom(): boolean {
    void this.presenceTick
    const la: any = this.liveAssignment || {}
    const ready = la['participantReadyAt']
    const inCall = la['participantInCallAt']
    const left = la['participantLeftAt']
    // Heartbeat removed — derive purely from the one-shots (see plan).
    return !!ready && !inCall && !left
  }

  // True when the participant is actually live in the Zoom call.
  get participantHasJoinedCall(): boolean {
    void this.presenceTick
    const la: any = this.liveAssignment || {}
    if (!la['participantInCallAt']) return false
    if (la['participantLeftAt']) return false
    return true
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

  // Validated ATCs prescribed specifically for the current queue session.
  // Used by the green "ATC has been submitted for this activity" highlight at
  // the top of the Prescribe ATC step.
  get currentQueueValidatedATCList(): any[] {
    const qid = this.ongoingQueue?.['docid']
    if (!qid) return []
    return (this.alphaATCList || []).filter(atc => atc?.['atcdata']?.['queueid'] === qid)
  }

  // Pending/unvalidated ATCs prescribed for the current queue session.
  get currentQueueUnvalidatedATCList(): any[] {
    const qid = this.ongoingQueue?.['docid']
    if (!qid) return []
    return (this.unvalidatedATCList || []).filter(atc => atc?.['atcdata']?.['queueid'] === qid)
  }

  // Extra specialists invited into THIS studio via "Invite More Specialist(s)"
  // (stored on the live assignment as bonusactivity = { profileId: activityId }).
  // Resolved to display name + activity name for the sidebar roster shown next
  // to the participant profile.
  get additionalSpecialists(): { profileId: string; name: string; activity: string }[] {
    const bonus = this.liveAssignment?.['bonusactivity'] ?? {}
    return Object.keys(bonus).map(profileId => ({
      profileId,
      name: this.mapProfile?.[profileId] ?? '—',
      activity: this.mapActivity?.[bonus[profileId]] ?? ''
    }))
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

  /**
   * Stage notes to display in the topbar. Configured in queue-creation under
   * the CURRENT stage as a map { [targetStage]: note } — where targetStage
   * need not be the current stage. Each note is shown ONLY when the
   * participant's variation includes that target stage.
   *
   * Variation→stage list resolution mirrors `previousStageName`: when the
   * token carries a `variationid` we use `queueVariation[variationid]`; if
   * that map has no entry we are conservative and show nothing. When there's
   * no variationid we fall back to the queue's full stage list.
   */
  get currentStageNotes(): { stage: string; note: string }[] {
    if (!this.liveAssignment || !this.ongoingQueue) return []
    const stagename = this.liveAssignment['stagename']
    if (!stagename) return []
    const raw = this.ongoingQueue?.['stageproperty']?.[stagename]?.['stagenote']
    if (raw == null) return []

    // Normalize both shapes into [{ stage, note }]:
    //  - new ARRAY format: [{ stage, note }]
    //  - legacy MAP format: { [stage]: note }
    const entries: { stage: string; note: any }[] = Array.isArray(raw)
      ? raw.map((r: any) => ({ stage: r?.['stage'], note: r?.['note'] }))
      : (typeof raw === 'object'
          ? Object.keys(raw).map(k => ({ stage: k, note: raw[k] }))
          : [])

    // Resolve the participant's variation stage list.
    const variationId = this.liveAssignment['token']?.['variationid']
    let stageList: string[]
    if (variationId != null) {
      if (!(variationId in this.queueVariation)) return [] // conservative
      stageList = this.queueVariation[variationId] ?? []
    } else {
      stageList = this.ongoingQueue?.['stages'] ?? []
    }

    const out: { stage: string; note: string }[] = []
    for (const e of entries) {
      if (!e.stage) continue
      if (e.note == null || String(e.note).trim().length === 0) continue
      if (stageList.includes(e.stage)) {
        out.push({ stage: e.stage, note: String(e.note) })
      }
    }
    return out
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

  // True when the participant has opened the openmeeting screen (on the wait
  // screen). Heartbeat removed — derived purely from `participantReadyAt`
  // (which is nulled on leave/in-call, so its mere presence means "waiting").
  // See specs/plans/2026-06-24-presence-heartbeat-removal.md.
  // Tick property only exists so change detection re-evaluates this getter
  // periodically — see startPresenceTicker below.
  private presenceTick: number = 0
  get participantReady(): boolean {
    void this.presenceTick // ensure getter re-runs when tick increments
    return !!this.liveAssignment?.['participantReadyAt']
  }
  private presenceTimer: any = null

  // Top-bar live status pill — pure derivation from liveAssignment one-shots.
  // tones: primary | green | amber | slate. icons are Material icon names.
  get topBarStatus(): { tone: string; icon: string; title: string; sub: string } {
    void this.presenceTick // re-run on tick
    const la: any = this.liveAssignment || {}
    const readyAt = la['participantReadyAt']
    const inCallAt = la['participantInCallAt']
    const leftAt = la['participantLeftAt']
    const specialistJoinedAt = la['specialistJoinedAt']
    const specialistLeftAt = la['specialistLeftAt']

    // call ended — BOTH parties left after the call had started (e.g. "End
    // meeting for all"). Must be checked before the participant-left branch,
    // otherwise an ended call reads as "participant left · waiting for rejoin".
    if (leftAt && specialistLeftAt && specialistJoinedAt) {
      return { tone: 'slate', icon: 'check_circle', title: 'Call ended', sub: 'Complete the activity to finish this session.' }
    }
    // participant in call (joined live) — readyAt/leftAt are nulled on join
    if (inCallAt && !leftAt) {
      return {
        tone: 'primary',
        icon: 'login',
        title: 'Participant has joined',
        sub: (this.mapProfile?.[la?.['token']?.profile_id] || 'Participant') + ' is now live in the meeting'
      }
    }
    // participant ready (on meeting screen) — show review hint
    if (readyAt && !leftAt) {
      return { tone: 'green', icon: 'videocam', title: 'Participant is waiting', sub: 'Take a moment to review the forms and ATC before starting the call.' }
    }
    // participant left mid-call while the specialist is still in the meeting
    if (leftAt && specialistJoinedAt) {
      return { tone: 'amber', icon: 'logout', title: 'Participant left the meeting', sub: 'Connection dropped — waiting for them to rejoin' }
    }
    // default — silent (no scary "no signal" copy)
    return { tone: 'slate', icon: 'schedule', title: 'Awaiting participant', sub: 'Use this time to review the forms and ATC.' }
  }

  // ----- Studio-screen presence -----------------
  // The `specialistAtStudioLastSeenAt` 10s heartbeat and the `returnedToStudioAt`
  // one-shot were REMOVED (see plan). The arena no longer distinguishes
  // "Returned to studio" from "Awaiting" — "Call ended" alone is enough.
  // startStudioPresence/stopStudioPresence kept as no-ops to avoid churning
  // the call sites; the actual writes are gone.
  private startStudioPresence() {}

  private stopStudioPresence() {}

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

    // 1. Review Forms + Love Letters - Current uP! cycle. Love Letters now live
    // here (mockup step 1), so the step also shows when only the loveletters
    // widget is configured, even with no submitted forms.
    if ((this.participantForm && this.participantForm.length) || widgets.includes('loveletters')) {
      steps.push({ id: 'current-forms', label: 'Review Forms', icon: 'description', color: '#0ea5e9' })
    }

    // 2. Previous ATC - Previous uP! cycle(s). (Love Letters moved to step 1.)
    if (widgets.includes('previousatc') || widgets.includes('evolutionwishlist')) {
      steps.push({ id: 'prev-history', label: 'Previous ATC', icon: 'history', color: '#84cc16' })
    }

    // 3. View submitted ATC - Current uP! cycle
    if (widgets.includes('prescribedvalidatedatc') ||
        widgets.includes('prescribedunvalidatedatc') ||
        widgets.includes('assignedatc') ||
        widgets.includes('viewtripleatc')) {
      steps.push({ id: 'view-atc', label: 'This Cycle ATCs', icon: 'fact_check', color: '#22c55e' })
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
      steps.push({ id: 'ael-validation', label: 'Validate AEL', icon: 'verified', color: '#14b8a6' })
    }

    // (Mark as Completed is NOT a step anymore — per mockup its actions live in
    // the "Move to Next Stage" dropdown triggered from the header/footer.)

    // Reset userNavigated flag when the live assignment changes (new session)
    const assignmentId = this.liveAssignment?.['docid'] || this.liveAssignment?.['token']?.tokenid || ''
    if (assignmentId !== this.lastAssignmentId) {
      this.lastAssignmentId = assignmentId
      this.userNavigated = false
      // New assignment → unmount the previous-ATC step again so it stays lazy
      // (re-mounts + loads only when the user opens it for this participant).
      this.prevHistoryMounted = false
    }

    // Re-sync active step whenever the step list changes
    const signature = steps.map(s => s.id).join('|')
    if (signature !== this.lastStepSignature) {
      this.lastStepSignature = signature
      // Deep-link: honor a `?step=` request once its step actually exists in the
      // list. Consumed once so later step-list changes fall back to normal rules.
      if (this.pendingDeepLinkStep && steps.find(s => s.id === this.pendingDeepLinkStep)) {
        this.activeStepId = this.pendingDeepLinkStep
        this.userNavigated = true
        this.pendingDeepLinkStep = ''
      }
      // If user hasn't navigated, always snap to first step (handles async step inserts).
      // If user has navigated and their step disappeared, also reset.
      else if (!this.userNavigated || !steps.find(s => s.id === this.activeStepId)) {
        this.activeStepId = steps[0]?.id || ''
      }
      // Auto-select may land on the prescribe step without going through setActiveStep().
      if (this.activeStepId === 'prescribe-atc') this.checkAiAtcAvailability()
      // Step list changed (or active step was reset) — refresh the cached index.
      this.activeStepIndex = steps.findIndex(s => s.id === this.activeStepId)
      if (this.activeStepId === 'prev-history') this.prevHistoryMounted = true
    }

    return steps
  }

  setActiveStep(id: string) {
    this.activeStepId = id
    this.userNavigated = true
    this.activeStepIndex = this.visibleSteps.findIndex(s => s.id === id)
    if (id === 'prev-history') this.prevHistoryMounted = true
    // Lazily check for an AI-generated ATC only when the specialist opens the prescribe step.
    if (id === 'prescribe-atc') this.checkAiAtcAvailability()
    this.scrollMainToTop()
    this.scrollActiveStepIntoView()
  }

  goToStep(offset: number) {
    const steps = this.visibleSteps
    const idx = steps.findIndex(s => s.id === this.activeStepId)
    const next = Math.max(0, Math.min(steps.length - 1, idx + offset))
    this.activeStepId = steps[next]?.id || this.activeStepId
    this.activeStepIndex = steps.findIndex(s => s.id === this.activeStepId)
    if (this.activeStepId === 'prev-history') this.prevHistoryMounted = true
    this.userNavigated = true
    // next/prev arrows bypass setActiveStep — trigger the AI-ATC check when landing here too.
    if (this.activeStepId === 'prescribe-atc') this.checkAiAtcAvailability()
    this.scrollMainToTop()
    this.scrollActiveStepIntoView()
  }

  // Scroll the content area back to the top on every step change so a new stage
  // always shows its top content instead of inheriting the previous stage's
  // scroll position. Runs after render (the step content swaps via *ngIf, so the
  // new, possibly taller content must exist before we reset). Guards the un-pinned
  // (short/mobile) mode where the window scrolls instead of the inner container.
  private scrollMainToTop() {
    const reset = () => {
      const el = this.dsMainScroll?.nativeElement
      if (el && el.scrollTop) el.scrollTop = 0
      // Un-pinned fallback: the page itself scrolls, so send the container's top
      // to the viewport top only if it's currently above the fold.
      if (el && getComputedStyle(el).overflowY === 'visible' && el.getBoundingClientRect().top < 0) {
        el.scrollIntoView({ block: 'start' })
      }
    }
    reset()
    setTimeout(reset) // catch the case where new content mounts after this tick
  }

  // Keep the ACTIVE step chip in view in the left stepper — so advancing via the
  // footer Next/Back also scrolls the sidebar stepper to follow (when it scrolls).
  // `block:'nearest'` moves the nearest scroll container the minimum needed, so it
  // works for both the vertical sidebar list and the horizontal wrapped band.
  private scrollActiveStepIntoView() {
    const run = () => {
      const active = document.querySelector('.ds-app .ds-vstep.active') as HTMLElement | null
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
    run()
    setTimeout(run)
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
    private sanitizer: DomSanitizer,
    private storage: Storage
  ) {
    const overrideProfileId = this.route.snapshot.queryParamMap.get('profileid')
    // Honor a deep-linked step (e.g. ?step=prescribe-atc from the Zoom in-call bubble).
    this.pendingDeepLinkStep = this.route.snapshot.queryParamMap.get('step') || ''
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
      // fetch user data + atcmodel in PARALLEL — two independent reads that were
      // previously awaited one-after-the-other on the load critical path. Both must
      // resolve before the queue-generation block below (which uses mapProducts).
      await Promise.all([
        getDoc(roles['profile_ref']).then((profileDoc) => {
          if (profileDoc.exists()) {
            this.currentuserData = profileDoc.data();
            this.currentuseruid = profileDoc.data()['user_ref'].id;
          }
        }),
        getDocs(collection(this.firestore, 'products')).then(snap => {
          for (let i = 0; i < snap.docs.length; i++) {
            const element = snap.docs[i].data();
            this.mapProducts[element['id']] = element['atcmodel']
          }
        }),
      ]);
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

            // If the specialist is already in a LIVE session, prefer that
            // queue so they go straight inside the studio (no queue picker).
            const queueWithLive = await this.findQueueWithLiveAssignment()

            // BUT only honor it when they actually have a studio in that queue.
            // `findQueueWithLiveAssignment` matches on the live-assignment's
            // `pairing` (which includes invited/bonus specialists), whereas the
            // arena renders from `queue studio pairing` (studioin==true) for YOU.
            // If you're only an invited/bonus specialist in someone else's live
            // studio, honoring queueWithLive would select a queue with no studio
            // for you → blank screen. Fall back to the queue where you DO have a
            // studio (legacy behavior). Invited studios remain reachable via the
            // "Other Studio you're invited to Join" path.
            const queueWithLiveHasStudio = queueWithLive && (this.queueStudioCounts[queueWithLive['docid']] || 0) > 0
            this.ongoingQueue = (queueWithLiveHasStudio ? queueWithLive : firstWithStudios) || this.ongoingQueueList[0]
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
      //fetch profilelist and user list — deferred off the synchronous construction
      // frame so the heavy full profile_data read (ordered by name) doesn't compete
      // with the initial queue load. Only feeds notification / profile-uid maps,
      // which were always populated asynchronously, so behaviour is unchanged.
      setTimeout(() => {
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
      }, 0)
  }

  ngOnInit(): void {
    this.guard.getProcedureMap().then(value => this.mapProcedure = value)
    collectionData(collection(this.firestore,"bigactivity"), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(list=>{
      list.forEach(data=>{
        this.mapActivity[data["docid"]] = data["activity"]
      })
    })
    // Build activity -> specialists map from cohorts (see big-planner). We take
    // ALL active cohorts and union their participant lists per `bigactivity`, so
    // the Enter-Studio popup can offer the right specialists for each activity.
    collectionData(collection(this.firestore,"big cohorts"), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(cohorts=>{
      const map: { [activityId: string]: string[] } = {}
      cohorts.forEach(cohort=>{
        const activityId = cohort["bigactivity"]
        if(activityId == null) return
        if(cohort["status"] != null && cohort["status"] !== "active") return
        const ids: string[] = Array.isArray(cohort["participantidlist"]) ? cohort["participantidlist"] : []
        const set = new Set<string>(map[activityId] ?? [])
        ids.forEach(id => set.add(id))
        map[activityId] = Array.from(set)
      })
      this.activitySpecialistMap = map
    })
    this.enableZoomLinkGenerator()
    // Start the studio-presence heartbeat. It writes only when there is a
    // currently selected studio with a live assignment, so an idle / empty
    // studio screen produces no writes.
      this.startStudioPresence()
      this.requestNotificationPermission()
  }

  ngOnDestroy(){
   this.chatUnreadSub?.unsubscribe()
   this.chatLiveSub?.unsubscribe()
   // takeUntil tears down only on a notifier `next` — emitting it BEFORE
   // `complete()` is what actually unsubscribes every takeUntil(subscriptionHandle)
   // stream. The previous order (complete() then next()) left ~18 realtime
   // Firestore collectionData listeners alive after destroy → unbounded
   // listener/memory growth across studio navigations.
   this.subscriptionHandle.next();
   this.subscriptionHandle.complete();
   this.otherStudioInvitationHandle.next();
   this.otherStudioInvitationHandle.complete();
   // Explicitly drop the previous-ATC realtime listeners (belt-and-suspenders on
   // top of takeUntil above).
   Object.values(this.previousAtcSubs).forEach(s => s?.unsubscribe());
   this.previousAtcSubs = {};
   // resetSubscription tears down the subscriptions that are NOT wired through
   // takeUntil (notably tripleATCSubscription at :3593).
   this.resetSubscription();
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

  processMessage(message: string, linkColor: string = '#1a56db'): SafeHtml {
    if (!message) return '';
    let processed = message.replace(/\n/g, '<br>');
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    processed = processed.replace(urlRegex, `<a href="$1" target="_blank" rel="noopener" style="color:${linkColor};word-break:break-word;overflow-wrap:anywhere;">$1</a>`);    return this.sanitizer.bypassSecurityTrustHtml(processed);
  }

  resetSubscription(){
    this.studioPairingSubscription?.unsubscribe()
    this.liveassignmentSubscription?.unsubscribe()
    this.tokenSubscription?.unsubscribe()
    this.studioInvitationSubscription?.unsubscribe()
    this.studioGroupingInvitationSubscription?.unsubscribe()
    this.tripleATCSubscription?.unsubscribe()
    this.outsideLiveAssignmentSubscription?.unsubscribe()
    this.outsideLiveAssignmentSubscriptions.forEach(s => s?.unsubscribe())
    this.studioconversationSubscription?.unsubscribe()
    this.otherStudioInvitationSubscription?.unsubscribe()

    this.studioPairingSubscription = null
    this.liveassignmentSubscription = null
    this.tokenSubscription = null
    // Must null it (like every other sub here): resetSubscription() already
    // unsubscribed it above, and getStudio() only rebuilds the invitation
    // listener when this handle is null/closed. Leaving a closed non-null object
    // here left the "Bring to Studio" countdown subscription permanently dead.
    this.studioInvitationSubscription = null
    this.studioGroupingInvitationSubscription = null
    this.tripleATCSubscription = null
    this.outsideLiveAssignmentSubscription = null
    this.outsideLiveAssignmentSubscriptions = []
    this.studioconversationSubscription = null
    this.otherStudioInvitationSubscription = null
    this.tokenInvitedByOther = {}
    this.tokenInvitedBySelf = {}
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
    this.tokenInvitedBySelf = {}

    const queueRef = doc(this.firestore, 'queue generation', this.ongoingQueue['docid'])
    // Pull every non-expired invite for the queue and classify in code by
    // `clientresponse` + `studioid`. Participant invites (written by
    // inviteParticipant) carry no `status` field — they reserve the token purely
    // via expiry + clientresponse — so we must NOT filter on status here, or a
    // token with a live invite would stay a clickable-but-blocked CTA (the bug).
    this.otherStudioInvitationSubscription = collectionData(
      query(
        collection(this.firestore, 'studioinvitation'),
        where('queueref', '==', queueRef),
        where('expirydate', '>=', new Date()),
      ),
      { idField: 'id' }
    ).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.otherStudioInvitationHandle)).subscribe(invitations => {
      const next: { [tokenDocId: string]: { studioName?: string; specialistNames?: string[] } } = {}
      const nextSelf: { [tokenDocId: string]: { invitationDocId?: string; approved?: boolean; invitation?: any } } = {}
      const selfStudio = this.selectedStudio?.['docid']
      for (const inv of (invitations || [])) {
        const invStudio = inv['studioid']
        if (!invStudio) continue
        const tokenRef: any = inv['tokenref']
        const tokenDocId = tokenRef?.id
          ?? (typeof tokenRef?.path === 'string' ? tokenRef.path.split('/').pop() : null)
        // Skip non-participant invites (e.g. stage-grouping) and terminal states.
        if (!tokenDocId) continue
        const clientResp = inv['clientresponse']
        if (clientResp === 'denied') continue
        // This studio's own invite → pending shows "awaiting response" + Cancel;
        // approved shows an "Assign studio" CTA that reopens the assign dialog.
        if (invStudio === selfStudio) {
          nextSelf[tokenDocId] = {
            invitationDocId: inv['docid'] ?? inv['id'],
            approved: clientResp === 'approved',
            invitation: inv
          }
          continue
        }
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
      this.tokenInvitedBySelf = nextSelf
    })
  }

  compareFn(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
  }


  /**
   * Returns the queue object that already has a live assignment for this
   * specialist (so we can auto-enter it on page load instead of showing
   * the queue picker). Returns null if none exist. Cross-queue lookup —
   * searches all the specialist's ongoing queues.
   */
  private async findQueueWithLiveAssignment(): Promise<any | null> {
    try {
      if (!this.profileid || !this.ongoingQueueList?.length) return null
      const queueIds = this.ongoingQueueList.map(q => q['docid'])
      // Firestore `in` operator is limited to 30 values; chunk if needed.
      for (let i = 0; i < queueIds.length; i += 30) {
        const chunk = queueIds.slice(i, i + 30)
        const snap = await getDocs(query(
          collection(this.firestore, 'live assignment'),
          where('status', '==', 'live'),
          where('pairing', 'array-contains', this.profileid),
          where('queueid', 'in', chunk),
          limit(1),
        ))
        if (!snap.empty) {
          const liveQueueId = snap.docs[0].data()?.['queueid']
          const match = this.ongoingQueueList.find(q => q['docid'] === liveQueueId)
          if (match) return match
        }
      }
      return null
    } catch (err) {
      console.warn('findQueueWithLiveAssignment failed', err)
      return null
    }
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
    this.allStudioChunks = chunks.map(() => [])
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
        this.allStudioChunks[idx] = studios.filter(s => [null, undefined, false].includes(s['delete']))
        this.rebuildAllStudios()
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

  /** Build the flat, cross-queue studio-card list for the mockup lobby. */
  private rebuildAllStudios(){
    const flat = ([] as any[]).concat(...this.allStudioChunks)
    this.allStudios = flat.map(s => {
      const queueId = s['queueref']?.id
      const queue = this.ongoingQueueList.find(q => q['docid'] === queueId)
      const participants: string[] = s['participants'] || []
      const activities = [...new Set(participants
        .map(p => this.mapActivity[s['participantsactivity']?.[p]])
        .filter(Boolean))]
      const specialists = participants
        .map(p => p === this.profileid ? 'You' : (this.mapProfile[p] || ''))
        .filter(Boolean)
      return {
        studioId: s['docid'],
        queueId,
        queueName: queue?.['queuename'] || '',
        studio: s,
        activity: activities.join(', ') || 'Studio',
        specialists: specialists.join(', '),
        isLive: !!this.mapStudioLiveAssignment?.[s['docid']],
        checkin: !!s['checkin']
      }
    }).sort((a, b) => (a.queueName + a.activity).localeCompare(b.queueName + b.activity))
  }

  /** Lobby card click: switch to the studio's queue if needed, then open it. */
  async openStudioCard(entry: any){
    if (!entry) return
    const queue = this.ongoingQueueList.find(q => q['docid'] === entry.queueId)
    if (queue && queue['docid'] !== this.ongoingQueue?.['docid']){
      this.checkoutQueue()
      this.ongoingQueue = queue
      this.selectedQueue = queue
      await this.onQueueSelect()
    }
    const studio = this.studioList.find(s => s['docid'] === entry.studioId) ?? entry.studio
    if (studio) this.onStudioSelect(studio)
  }

  /**
   * Back from a studio's waiting list to the lobby studio grid ("All studios").
   * If we're currently CHECKED IN to this studio, check out FIRST — leaving the
   * studio should take you offline here, so opening another studio afterwards no
   * longer triggers a checkout-conflict prompt. Direct write (mirrors the
   * checkout-log shape in checkinStudio) so it isn't gated by the check-in
   * schedule/hold logic — leaving is always allowed.
   */
  async backToStudios(){
    const studio = this.selectedStudio
    if (studio?.['checkin'] && studio?.['docid']){
      // Leaving the studio checks you out — confirm first so it isn't a silent
      // background surprise. Cancel keeps you in the studio, still checked in.
      if (!window.confirm('You are checked in to this studio. Going back to All Studios will check you out. Continue?')) return
      studio['checkin'] = false
      try {
        await updateDoc(doc(this.firestore, 'queue studio pairing', studio['docid']), { checkin: false })
        const logid = doc(collection(this.firestore, 'studio checkin log')).id
        setDoc(doc(this.firestore, 'studio checkin log', logid), {
          logparticipant: this.profileid,
          queueref: studio['queueref'],
          logdate: new Date(),
          activity: 'checkout',
          participants: studio['participants'] || [],
          studio: studio['docid']
        })
      } catch (err) {
        console.log('Checkout on back failed', err)
      }
    }
    this.selectedStudio = {}
    this.stageTokenList = []
    this.liveAssignment = null
  }

  /**
   * Confirm-guarded queue switch used by the in-studio top navigator
   * (`.ds-qnav`). The navigator stays visible WHILE in a live assignment
   * (legacy parity), so switching could drop an active session — ask first.
   * No-op when picking the already-active queue.
   */
  confirmSwitchQueue(queue: any){
    if (!queue || queue['docid'] === this.ongoingQueue['docid']) return
    if (this.liveAssignment != null && !window.confirm('Leave this studio and switch to another queue?')) return
    this.selectQueueCard(queue)
  }

  /**
   * Confirm-guarded studio switch used by the in-studio top navigator.
   * Same rationale as confirmSwitchQueue. No-op when picking the already-
   * selected studio.
   */
  confirmSwitchStudio(studio: any){
    if (!studio || studio['docid'] === this.selectedStudio['docid']) return
    if (this.liveAssignment != null && !window.confirm('Leave this studio and switch to another studio?')) return
    this.onStudioSelect(studio)
  }

  /**
   * Confirm-guarded jump to a studio in another queue that you've been invited
   * to join (`outsideLiveAssignment`). Joining leaves your current live session,
   * so ask first while in a live assignment. Delegates to the existing
   * visitOtherStudio() which handles the actual join.
   */
  confirmVisitOtherStudio(studio: any){
    if (!studio) return
    if (this.liveAssignment != null && !window.confirm('Leave this studio and join the invited studio?')) return
    this.visitOtherStudio(studio)
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
    // An "outside studio" invite (added via Invite More → bonusactivityparticipant)
    // can live in ANY of the specialist's ongoing queues, not just the one
    // currently selected. Watch every ongoing queue so the invite surfaces no
    // matter which queue the specialist is looking at. Firestore `in` allows at
    // most 30 values, so chunk the queue ids and merge the per-chunk results.
    this.outsideLiveAssignmentSubscriptions.forEach(s => s?.unsubscribe())
    this.outsideLiveAssignmentSubscriptions = []
    this.outsideLiveAssignment = []

    const queueIds = (this.ongoingQueueList ?? []).map(q => q['docid']).filter(Boolean)
    if (queueIds.length === 0) return

    const chunks: string[][] = []
    for (let i = 0; i < queueIds.length; i += 30) chunks.push(queueIds.slice(i, i + 30))

    const chunkResults: any[][] = chunks.map(() => [])
    chunks.forEach((chunk, idx) => {
      const sub = collectionData(query(collection(this.firestore,"live assignment"), where("queueid", "in", chunk),where("status", "==", "live"),where("bonusactivityparticipant", "array-contains", this.profileid)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(assignment=>{
        chunkResults[idx] = assignment
        this.outsideLiveAssignment = chunkResults.flat()
      })
      this.outsideLiveAssignmentSubscriptions.push(sub)
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
    await this.clearChatThread()
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
        // The outer "queue studio pairing" subscription re-fires on every
        // check-in/out, so unsubscribe the previous listener before creating a
        // new one — otherwise a fresh listener leaked on every emission (the
        // handle was never stored, so the old `== null` guard never tripped and
        // duplicate listeners kept re-opening the invitation dialog).
        this.studioGroupingInvitationSubscription?.unsubscribe()
        this.studioGroupingInvitationSubscription = collectionData(query(collection(this.firestore,"studioinvitation"), where("type", "==", "stagegrouping"),where("status", "==", "pending"),where("invitedstudio", "array-contains-any", involvedStudio)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async studioInvitation=>{
            for (let i = 0; i < studioInvitation.length; i++) {
              const invitation = studioInvitation[i];
              var matchedstudio = invitation["invitedstudio"].find(studio => involvedStudio.includes(studio))
              if(matchedstudio != null && matchedstudio != undefined && !invitation["acceptedstudio"].includes(matchedstudio)){
                // TODO Open Invitation Dialog
                console.log(matchedstudio, invitation["docid"]);
                (await this.openAcceptOtherStudio({
                  data: {
                    mapprofile: this.mapProfile,
                    invitation: invitation
                  }
                })).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result => {
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
          // Store the handle so the `== null` guard above actually works.
          // Before, the result was discarded, so a brand-new live-assignment
          // listener was created on EVERY pairing emission — each one
          // independently re-ran the auto-enter logic below, multiplying the
          // "studio opens blank then loads" race and leaking listeners.
          this.liveassignmentSubscription = collectionData(query(collection(this.firestore,"live assignment"), where("queueid", "==", this.ongoingQueue["docid"]),where("status", "==", "live"),where("studioid", "in", studioID)), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async assignment=>{
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

            // Auto-enter the live studio when the specialist lands on the
            // page. If they already have a studio in this queue with an
            // active live assignment AND they haven't selected anything yet
            // (and aren't navigating themselves), select it for them — so
            // they go straight into the session instead of seeing the
            // queue/stage picker first.
            // CRITICAL: we must call onStudioSelect() (not just set
            // selectedStudio) because that's what kicks off form / ATC /
            // milestone / journey fetches. Without it, the sidebar shows
            // no name / no product / no milestone and the Submitted Forms
            // step is hidden.
            const noSelection = !this.selectedStudio?.['docid']
            const liveStudioId = activeStudio[0]
            if (noSelection && liveStudioId && !this.userNavigated) {
              const target = this.studioList.find(s => s['docid'] === liveStudioId)
              if (target) {
                console.log('[auto-enter] live studio found — onStudioSelect', liveStudioId)
                // Fire-and-forget — onStudioSelect is async but the
                // subscription handler stays sync.
                this.onStudioSelect(target)
              }
            }

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
              // When we auto-entered the studio (no manual Bring-To-Studio
              // flow), the queue_token isn't attached. Pull it so the
              // sidebar shows product / variation / queue position.
              // Await it BEFORE loading widgets so the first render already has
              // product / variation / forms data, instead of flashing a blank
              // studio that fills in a moment later.
              await this.ensureTokenForAssignment()
              // Trigger all widget-driven fetches (Validated ATC,
              // Unvalidated ATC, Assigned ATC, Triple ATC, AEL, UP visit,
              // Forms) directly from the live-assignment subscription so
              // they don't depend on onStudioSelect's nested queue_token
              // subscription firing in time. Idempotent — skips if the
              // assignment / stage hasn't changed.
              this.loadAssignmentWidgetData()
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
          // Null it so the `if(!this.studioInvitationSubscription)` below
          // rebuilds the listener — previously the handle was never stored, so
          // it stayed falsy and a fresh listener leaked on every emission.
          this.studioInvitationSubscription = null
        }
        if(!this.studioInvitationSubscription || this.studioInvitationSubscription.closed){
          console.log(this.studioInvitationSubscription, 'studioInvitationSubscription');

          this.studioInvitationSubscription = collectionData(query(collection(this.firestore,"studioinvitation"), where("specialistpairing", 'array-contains', this.profileid),where("queueref", '==', doc(this.firestore,'queue generation',this.ongoingQueue["docid"])),where("studioid", "in", studioID),where("expirydate", ">=", new Date())), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async invitationSnap => {
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
                    this.invitationCountdown = await this.openQueueInvitationApproval({
                      disableClose:true,
                      // timerSeconds = classify/studiotimer.timerinseconds (the
                      // same value used to set the invitation's expiry) so the
                      // dialog ring scales to the configured duration directly.
                      data: { ...this.studioInvitation, timerSeconds: this.invitationTimerSeconds },
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

  // trackBy fns for the stage/token *ngFor lists. Each queue_token snapshot
  // rebuilds stageTokenList as a fresh array of fresh objects, so without a
  // stable identity Angular tears down and re-creates every row (and its
  // avatar/name) on each emission — the visible flicker. Key on the stage name
  // and the token docid so updates patch in place instead.
  trackByStageName(_index: number, stage: any){
    return stage?.stagename
  }

  trackByTokenDocId(_index: number, token: any){
    return token?.docid
  }

  async onStudioSelect(studio){
    console.log("****** studio select ******");
    
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Setting up Studio..."},
      disableClose: true
    })
    await this.clearChatThread()
    this.selectedParticipant = false
    this.selectedStudio = studio
    console.log(this.selectedStudio)
    this.liveAssignment = this.mapStudioLiveAssignment[this.selectedStudio["docid"]] ?? null
    this.initChatThread()
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
    // onStudioSelect re-fires on every studio switch / check-in-out (and from
    // the auto-enter + "Bring to Studio" paths), so tear down the previous
    // listener before opening a new one — otherwise a fresh anonymous listener
    // leaked on every call and kept firing in parallel.
    this.studioconversationSubscription?.unsubscribe()
    this.studioconversationSubscription = collectionData(query(collection(this.firestore,"studio conversation"), where('studioid', 'array-contains', this.selectedStudio['docid'])), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(async snap => {
      this.studiochatList = snap;

      // Unread badge counts. Previously this re-downloaded EVERY message of
      // EVERY conversation on every emission just to count the ones still
      // pending for this user. Use a server-side aggregation count with the
      // same `pending array-contains uid` filter (mirrors :selectedchat) so we
      // transfer a single integer per conversation instead of the full history.
      const messagePromises = this.studiochatList.map(async doc => {
        try {
          const unreadQuery = query(
            collection(this.firestore, "studio conversation", doc['docid'], 'messages'),
            where('pending', 'array-contains', this.currentuseruid),
          );
          const agg = await getCountFromServer(unreadQuery);
          this.pendingMessagesCount[doc['docid']] = agg.data().count;
        } catch (err) {
          console.warn('unread count failed for', doc['docid'], err);
          this.pendingMessagesCount[doc['docid']] = this.pendingMessagesCount[doc['docid']] ?? 0;
        }
      });

      await Promise.all(messagePromises);
    });
    
    if(studioStage.length != 0){
      // Same leak as the studio-conversation listener above: a new queue_token
      // listener was opened on every onStudioSelect call and never stored, so
      // duplicates accumulated and each one reassigned this.stageTokenList on
      // every token change — spamming the console and flickering the on-screen
      // names. Tear down the previous listener before subscribing again.
      this.tokenSubscription?.unsubscribe()
      this.tokenSubscription = collectionData(query(collection(this.firestore,"queue_token"), where("queueref", "==", doc(this.firestore,'queue generation',this.ongoingQueue["docid"])),where("stagestatus", "==", "Approved"),where("tokenstatus", "==", "Active"),where("currentstage", "in", studioStage))).pipe(takeUntil(this.subscriptionHandle)).subscribe(async token=>{
        console.log(token)
        if(this.liveAssignment != null && token.length != 0){
          this.liveAssignment["token"] = token.find(e => e["liveassignmentid"] == this.liveAssignment["docid"])
          console.log(this.liveAssignment['docid']);
          console.log(this.liveAssignment['token']);
          // If the specialist is already on the prescribe step, refresh the AI-ATC button for the
          // (possibly switched) participant. Keyed inside the method, so same-participant token
          // refreshes don't re-query.
          if (this.activeStepId === 'prescribe-atc') this.checkAiAtcAvailability();
          
          
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

          // Run the per-participant widget fan-out through the shared, guarded
          // helper. It dedups via widgetFetchSignature (docid|stagename|token),
          // so this only re-queries ATC / Triple ATC / Forms / AEL / Evolution
          // Wishlist when the assignment, stage, or token actually changes —
          // NOT on every token tick. transferredQueue + token are already set
          // above, so the token-dependent widgets read the right values.
          await this.loadAssignmentWidgetData()

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
  async checkinStudio(event){
    // Accept either the MatSlideToggleChange event (from the template) or a raw
    // boolean (defensive). When the user cancels the conflict dialog we must
    // snap the toggle back to its real state — a one-way [checked] binding won't
    // do it because the model value never changed.
    const toggle = (event && typeof event === 'object') ? event.source : null
    const value = (event && typeof event === 'object') ? event.checked : event
    const revertToggle = () => {
      if (toggle) {
        toggle.checked = !!this.selectedStudio?.['checkin']
        this.cdr.detectChanges()
      }
    }
    if (value === true) {
      // Collaborator conflict (hard block): a co-specialist on THIS studio is
      // already busy in a live activity in another studio. Unlike the self
      // check-in conflict below, this cannot be resolved by checking out — the
      // busy person is someone else — so we alert and refuse the check-in.
      const collaboratorConflicts = await this.findCollaboratorConflicts(this.selectedStudio)
      if (collaboratorConflicts.length > 0) {
        await firstValueFrom(
          this.dialog.open(this.collaboratorBusyTpl, {
            data: { collaborators: collaboratorConflicts },
            disableClose: true,
            width: '460px',
            maxWidth: '92vw',
            autoFocus: false,
          }).afterClosed()
        )
        revertToggle()
        return
      }

      const conflicts = await this.findActiveCheckins(this.selectedStudio?.['docid'])
      if (conflicts.length > 0) {
        const confirmed = await firstValueFrom(
          this.dialog.open(this.checkinConflictTpl, {
            // `conflicts` already carries queueName / stageName / isLive,
            // pass through untouched so the template can render the queue +
            // stage context (not just the studio name).
            data: { studios: conflicts },
            disableClose: true,
            width: '500px',
            maxWidth: '92vw',
            autoFocus: false,
          }).afterClosed()
        )
        if (!confirmed) { revertToggle(); return }
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
          revertToggle()
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
   * Each returned entry is enriched with `queueName` and `stageName` so the
   * conflict dialog can show the user EXACTLY where else they are checked
   * in (not just an opaque studio name).
   */
  private async findActiveCheckins(excludeStudioId: string | undefined | null): Promise<any[]> {
    if (!this.profileid) return []
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'queue studio pairing'),
        where('participants', 'array-contains', this.profileid),
        where('checkin', '==', true),
      ))
      // Only consider studios that belong to the specialist's currently LIVE
      // / ongoing queues. A studio in a queue that has ended shouldn't count
      // as an active check-in conflict.
      const liveQueueIds = new Set(
        (this.ongoingQueueList || []).map((q: any) => q['docid'])
      )
      const studios = snap.docs
        .map(d => d.data())
        .filter(s =>
          s['docid'] !== excludeStudioId &&
          [null, undefined, false].includes(s['delete']) &&
          (liveQueueIds.size === 0 || liveQueueIds.has(s['queueref']?.id))
        )

      // Enrich each conflicting studio with queue name + current stage name
      // (best-effort — falls back to "Studio" / "—" if lookups fail).
      const enriched = await Promise.all(studios.map(async (s: any) => {
        let queueName = ''
        let stageName = ''
        try {
          if (s['queueref']) {
            const queueSnap = await getDoc(s['queueref'])
            if (queueSnap.exists()) {
              const qd: any = queueSnap.data()
              queueName = qd?.['queuename'] || qd?.['name'] || ''
            }
          }
        } catch {}
        try {
          const liveSnap = await getDocs(query(
            collection(this.firestore, 'live assignment'),
            where('studioid', '==', s['docid']),
            where('status', '==', 'live'),
            limit(1),
          ))
          if (!liveSnap.empty) {
            stageName = liveSnap.docs[0].data()?.['stagename'] || ''
          }
        } catch {}
        return {
          docid: s['docid'],
          queueref: s['queueref'],
          participants: s['participants'] || [],
          name: s['studioname'] || s['name'] || 'Studio',
          queueName,
          stageName,
          isLive: !!stageName,
        }
      }))
      return enriched
    } catch (err) {
      console.log('findActiveCheckins error', err)
      return []
    }
  }

  /**
   * Collaborator conflict finder. Looks at the OTHER specialists paired on
   * `studio` (everyone in `participants` except the current user) and returns
   * any of them who is currently in a LIVE activity in a DIFFERENT studio.
   *
   * "In activity" = they appear in a `live assignment` whose `status` is
   * 'live' and whose `studioid` is not this studio. We query only by
   * `pairing array-contains <collaborator>` (a single-field index that always
   * exists) and filter status/studio client-side to avoid needing a composite
   * index. Best-effort — returns [] on error so a lookup failure never blocks
   * a legitimate check-in.
   */
  private async findCollaboratorConflicts(studio: any): Promise<any[]> {
    try {
      const collaborators: string[] = (studio?.['participants'] ?? [])
        .filter((p: string) => p !== this.profileid)
      if (collaborators.length === 0) return []

      const conflicts: any[] = []
      const seen = new Set<string>()
      for (const collab of collaborators) {
        const snap = await getDocs(query(
          collection(this.firestore, 'live assignment'),
          where('pairing', 'array-contains', collab),
        ))
        for (const d of snap.docs) {
          const la: any = d.data()
          if (la['status'] === 'live' && la['studioid'] && la['studioid'] !== studio?.['docid']) {
            if (seen.has(collab)) continue
            seen.add(collab)
            conflicts.push({
              collaborator: collab,
              collaboratorName: this.mapProfile[collab] ?? collab,
              studioid: la['studioid'],
              stageName: la['stagename'] ?? '',
            })
            break
          }
        }
      }
      return conflicts
    } catch (err) {
      console.log('findCollaboratorConflicts error', err)
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
        await this.openHoldAlertDialog()
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
      });
      (await this.openInviteOtherStudio({
        data: {
          mapprofile: this.mapProfile,
          mapactivity: this.mapActivity,
          invitationid: invitationID,
          mapstudio: this.mapStudio
        },
        disableClose: true,
        maxHeight: "90vh",
        maxWidth: "90vw"
      })).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
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

  /**
   * Cancel THIS studio's still-pending invitation(s) for a token so a stuck
   * "awaiting response" participant can be recovered (and re-invited) without
   * waiting for the invite to expire. Only deletes un-answered invites created
   * by the current studio — an already-approved invite is being moved in and is
   * left alone.
   */
  async cancelOwnInvitation(token){
    const snap = await getDocs(query(
      collection(this.firestore,"studioinvitation"),
      where("tokenref", "==", doc(this.firestore,"queue_token",token["docid"])),
      where("studioid", "==", this.selectedStudio["docid"]),
    ))
    const stale = snap.docs.filter(e => e.data()["clientresponse"] == null)
    await Promise.all(stale.map(e =>
      deleteDoc(doc(this.firestore,"studioinvitation", e.id)).catch(err => console.log(err))
    ))
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

  async assignStudio(invitation){
    console.log(invitation)
    var token = this.stageTokenList.filter(e => e["stagename"] == invitation["stage"])[0]["tokenlist"].find(e => e["profile_id"] == invitation["profileid"])
    console.log(token)
    // New redesigned "Participant accepted the invitation" popup. It is a
    // restyled sibling of AssignQueueStudioComponent (left untouched for the
    // invite/update flows) and closes with the same result contract, so the
    // afterClosed handler below is unchanged.
    var assignStudio = await this.openEnterStudioAssign({
      data: {
        participantname: invitation["participantname"] ?? this.mapProfile[invitation["profileid"]],
        studio: this.selectedStudio,
        currentprofileid: this.profileid,
        mapprofile: this.mapProfile,
        mapactivity: this.mapActivity,
        activityspecialists: this.activitySpecialistMap,
        additionalactivities: this.additionalActivities
      },
      autoFocus: false,
      // Don't let a stray backdrop tap dismiss the assign step — an
      // accidentally-closed dialog used to be unrecoverable. The dialog has its
      // own "Cancel" button for an intentional cancel, and the waiting-list
      // "Approved · Assign studio" CTA can reopen it.
      disableClose: true,
      panelClass: "enter-studio-dialog",
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
  // Move the participant back to the QUEUED section of the SAME stage.
  // Unlike moveStage(), this does NOT advance the token: `currentstage` stays
  // the current stage and `status` is forced to "queued" so they reappear in
  // the queued pool of this stage. Based on the same-stage branch of
  // moveStage() (StageIncompleteConfirmation → close studio → release pairing),
  // minus the dropIndex/last-stage delivery-completed handling, since we are
  // not progressing the token.
  async moveBackToQueue(){
    if(this.liveAssignment == null) return
    var inCompleteDialog = await this.openStageIncompleteConfirmation({
      data: {
        currentstage: this.liveAssignment["stagename"],
        participantname: this.mapProfile[this.liveAssignment["token"]?.profile_id]
      },
      maxWidth: "70vw",
      maxHeight: "90vh",
      disableClose: true
    })
    await firstValueFrom(inCompleteDialog.afterClosed()).then(async value =>{
      console.log("[moveBackToQueue] confirm value", value)
      if(!value) return
      var loading = this.dialog.open(LoadingProgressComponent, {
        data: {msg: "Moving participant back to queue"},
        disableClose: true
      })
      try {
        var currentstage = this.liveAssignment["stagename"]
        var data: any = {
          previousstage: currentstage,
          currentstage: currentstage,
          logdate: serverTimestamp(),
          stagestatus: "Returned",
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
          status: "queued"
        }
        if(value["preassign"]){
          data[`preassigned.${currentstage}`] = arrayUnion(this.liveAssignment["studioid"])
        }
        if((value["reason"] ?? "").trim().length != 0){
          data["notes"] = value["reason"]
          data["notesList"] = arrayUnion({
            author: this.profileid,
            stage: currentstage,
            text: value["reason"],
            updatedon: new Date()
          })
        }
        var log = {...this.liveAssignment["token"], ...data}
        await this.updateQueueStage(log)
        var studioid = this.liveAssignment["studioid"]
        await updateDoc(doc(this.firestore,'live assignment/' + this.liveAssignment["docid"]),{
          isactivitydone : false,
          status: "completed",
          updated: serverTimestamp()
        })
        if(studioid){
          await updateDoc(doc(this.firestore,"queue studio pairing",studioid),{
            status: null,
          })
        }
        await this.clearChatThread()
        this.snackBar.open('Participant moved back to the queue.', 'OK', { duration: 2500 })
      } catch(err) {
        console.error("[moveBackToQueue] failed", err)
        this.snackBar.open('Could not move participant back. Please try again.', 'Dismiss', { duration: 3500 })
      } finally {
        loading.close()
      }
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
      var studio = await this.openPreassignStudio({
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
        var inCompleteDialog = await this.openStageIncompleteConfirmation({
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
            await this.clearChatThread()
            loading.close()
          }
        })
      }else{
        var reviewSpecialist = (await this.inviteMore(true))
        if(!reviewSpecialist) return
        var confirm = await this.openHoldAlertDialog({
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
    await this.clearChatThread()
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
    var inviteParticipant = await this.openAssignQueueStudio({
      data: {
        title: reviewSpecialist ? "Confirm Specialist(s) who attended this Studio" : "Update Additional Specialist and Activity in the Studio",
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
        if(Object.keys(result).length != 0){
          // Update Bonus Activity
          var mergeActivity = reviewSpecialist ? (result["bonusactivity"] ?? {}) : {...(this.liveAssignment["bonusactivity"] ?? {}), ...result["bonusactivity"]}
          var additionalSpecialist = Object.keys(mergeActivity)

          await updateDoc(doc(this.firestore, "live assignment", this.liveAssignment["docid"]), {
            bonusactivity: additionalSpecialist.length != 0 ? mergeActivity : null,
            bonusactivityparticipant: additionalSpecialist.length != 0 ? additionalSpecialist : null
          });

          // Update People Involved
          var peopleInvolved = Object.keys(mergeActivity)
          var mergePeopleInvolved = Array.from(new Set(peopleInvolved.concat(this.liveAssignment["pairing"] ?? []) as string[]))

          await updateDoc(doc(this.firestore, "queue_token", this.liveAssignment["token"]["docid"]), {
            people_involved: mergePeopleInvolved
          });
          this.snackBar.open('Specialist(s) added to the studio.', 'OK',
            { duration: 3000, horizontalPosition: 'center', verticalPosition: 'top' })
        } else {
          // Dialog closed with no specialist rows added — tell the user how.
          this.snackBar.open('No specialist was added. Click "Add Other Specialists", fill it, then Assign.', 'OK',
            { duration: 5000, horizontalPosition: 'center', verticalPosition: 'top' })
        }
        invited = true
      }
    } catch (error: any) {
      console.error('Error in inviteMore:', error);
      this.snackBar.open('Invite failed: ' + (error?.message || error), 'Dismiss',
        { duration: 7000, horizontalPosition: 'center', verticalPosition: 'top' });
    }
    return invited
  }

  // Copy the raw Zoom start URL to the clipboard (shown below Start Meeting
  // on the getstarted step). Falls back gracefully when the Clipboard API is
  // unavailable (e.g. non-secure context).
  async copyZoomLink(url: string){
    if(!url) return
    try{
      await navigator.clipboard.writeText(url)
      this.snackBar.open('Zoom link copied to clipboard.', 'OK', { duration: 2000 })
    }catch(err){
      console.warn('Clipboard copy failed', err)
      this.snackBar.open('Could not copy the link. Long-press or right-click to copy it manually.', 'Dismiss', { duration: 3000 })
    }
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

    // Legacy (v1) behaviour: fire the regenerate request and let the Firestore
    // subscription push the fresh zoomdata back into `liveAssignment`. The
    // cloud function returns a plain-text "success" body, so we read it as text
    // to avoid a spurious JSON parse error — but, like v1, we do NOT surface any
    // success/error toast. The earlier rewrite raised a false error toast when
    // the (server-side-successful) call came back CORS/network-blocked.
    try {
      const res = await this.http.get(url, { responseType: 'text' }).toPromise();
      console.log('[regenerateZoomLink] response', res)
    } catch (err) {
      console.log('[regenerateZoomLink] error (ignored, link regenerates server-side)', err)
    }

    generateLoading.close()
    this.enableZoomLinkGenerator()
  }
  
  // ==========================================
  // Inline form viewer state (used by formDialogTpl)
  // Mirrors the overlay used by view-participants-form so the specialist sees
  // the rendered submitted form inside the dialog instead of an iframe.
  // ==========================================
  formViewerState: { loading: boolean; data: any; title: string } = {
    loading: false,
    data: null,
    title: ''
  }

  async viewform(form: any) {
    this.formViewerState = {
      loading: true,
      data: null,
      title: form?.['formname'] || 'Form'
    }
    this.dialog.open(this.formDialogTpl, {
      width: '92vw',
      maxWidth: '1000px',
      height: '92vh',
      panelClass: 'form-dialog-panel',
      autoFocus: false
    })

    try {
      const firestoreForms = getFirestore('firestore-forms')
      const [formTemplateDoc, submittedFormDoc] = await Promise.all([
        getDoc(doc(this.firestore, 'delivery forms', form['formid'])),
        getDoc(doc(firestoreForms, 'formsByClient', form['docid']))
      ])

      if (!formTemplateDoc.exists() || !submittedFormDoc.exists()) {
        this.formViewerState = { ...this.formViewerState, loading: false }
        return
      }

      this.formViewerState = {
        loading: false,
        data: this.buildFormDisplayData(form, formTemplateDoc.data(), submittedFormDoc.data()),
        title: this.formViewerState.title
      }
    } catch (err) {
      console.error('Error loading form overlay:', err)
      this.formViewerState = { ...this.formViewerState, loading: false }
    }
  }

  // ==========================================
  // Full-ATC overlay viewer state (used by atcDialogTpl).
  // Mirrors formViewerState so "View Full ATC" opens the ATC in a MatDialog
  // overlay (same UX as the form viewer) instead of expanding inline.
  // ==========================================
  atcViewerState: { loading: boolean; data: any; title: string; kind: string } = {
    loading: false,
    data: null,
    title: '',
    kind: ''
  }

  viewATCInDialog(atc: any, kind: string = '') {
    this.atcViewerState = {
      loading: false,
      data: atc,
      title: 'Full ATC',
      kind: kind || ''
    }
    this.dialog.open(this.atcDialogTpl, {
      width: '92vw',
      maxWidth: '1000px',
      height: '92vh',
      panelClass: 'form-dialog-panel',
      autoFocus: false
    })
  }

  // ==========================================
  // SHARED: Build form display data for overlay (ported from
  // view-participants-form.component.ts buildFormDisplayData)
  // ==========================================
  private buildFormDisplayData(row: any, formTemplate: any, submittedFormData: any): any {
    const formValues: any = {}
    let controlIndex = 0
    if (submittedFormData['formarray']) {
      for (const field of submittedFormData['formarray']) {
        if (['label', 'video', 'audio'].includes(field.type)) continue
        formValues[`control${controlIndex}`] = field.value
        controlIndex++
      }
    }

    controlIndex = 0
    let questionNumber = 0
    const fields: any[] = []

    for (const field of formTemplate['formarray'] || []) {
      if (['video', 'audio'].includes(field.type)) continue

      if (field.type === 'label') {
        fields.push({ type: 'label', fieldname: field.fieldname, fielddescription: field.fielddescription || null })
        continue
      }

      const fieldValue = formValues[`control${controlIndex}`]
      controlIndex++
      questionNumber++

      fields.push({
        type: 'field',
        number: questionNumber,
        fieldname: field.fieldname,
        fielddescription: field.fielddescription || null,
        fieldnotes: field.fieldnotes || null,
        required: field.required || false,
        fieldType: field.type,
        value: this.formatFieldValueForOverlay(field, fieldValue),
        isEmpty: !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)
      })
    }

    // Studio doesn't have the full mapProfile/mapWorkshop landscape of
    // view-participants-form — fall back to row-level fields with safe defaults.
    const participantName =
      (row?.['profileid'] && this.mapProfile?.[row['profileid']])
      || row?.['profilename']
      || (this.liveAssignment && this.mapProfile?.[(this.liveAssignment as any)?.['participantid']])
      || '—'
    const queueId = row?.['queueid'] || row?.['queueref']?.id
    const queueName = (queueId && this.mapQueue?.[queueId]) || '—'
    const workshopName = '—'
    let submittedDate = '—'
    try {
      if (row?.['date']?.toDate) submittedDate = new Date(row['date'].toDate()).toLocaleDateString()
      else if (row?.['date']) submittedDate = new Date(row['date']).toLocaleDateString()
    } catch { /* keep dash */ }

    return {
      participantName,
      formTitle: formTemplate['formname'] || 'Form',
      formDescription: formTemplate['formdescription'] || null,
      queue: queueName,
      workshop: workshopName,
      date: submittedDate,
      fields
    }
  }

  // ==========================================
  // FORMAT FIELD VALUE FOR OVERLAY DISPLAY (ported)
  // ==========================================
  private formatFieldValueForOverlay(field: any, value: any): string {
    if (!value && value !== 0) return 'Not answered'

    switch (field.type) {
      case 'date':
        if (value?.toDate) return value.toDate().toLocaleDateString()
        try { return new Date(value).toLocaleDateString() } catch { return String(value) }
      case 'Checkbox':
        return value ? 'Yes' : 'No'
      case 'MultiSelect':
      case 'multicheckbox':
        return Array.isArray(value) ? value.join(', ') : String(value)
      case 'slider': {
        let result = String(value)
        if (field.options?.length > 0) result += ` (Range: ${field.options[0]}-${field.options[field.options.length - 1]})`
        return result
      }
      case 'array':
        if (Array.isArray(value) && value.length > 0) {
          return value.map((item: any) => {
            if (typeof item === 'object' && item !== null) {
              if (field.array && Array.isArray(field.array)) {
                const parts = field.array.map((af: any) => {
                  const v = item[af.fieldname]
                  return v != null && v !== '' ? `${af.fieldname}: ${v}` : null
                }).filter(Boolean)
                return parts.join('\n')
              }
              const parts = Object.entries(item)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => `${k}: ${v}`)
              return parts.join('\n')
            }
            return String(item)
          }).join('\n')
        }
        return 'No items'
      default:
        if (Array.isArray(value)) return value.join(', ')
        if (typeof value === 'boolean') return value ? 'Yes' : 'No'
        if (typeof value === 'object') {
          try {
            return Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ')
          } catch { return JSON.stringify(value) }
        }
        return String(value)
    }
  }
  
  // Manual prescribe: blank prescribe-ATC form for this participant (opens in a new tab).
  addATC(validated, profileid) {
    console.log(profileid, 'profileid');

    const url = this.router.createUrlTree(['/prescribeATC'], { queryParams: { validation: validated, profileid: profileid } }).toString();
    window.open(url, '_blank');
  }

  // Open prescribe-ATC pre-filled from the completed AI-generated ATC (queue_atc_generation).
  // Only callable when checkAiAtcAvailability() found a doc and surfaced the "Use AI ATC" button.
  useAiAtc(validated) {
    if (!this.aiAtcDocId) return;
    const url = this.router.createUrlTree(['/prescribeATC'], {
      queryParams: { aigenerated: true, docid: this.aiAtcDocId, source: 'queueatc', validation: validated }
    }).toString();
    window.open(url, '_blank');
  }

  // Pre-check whether a completed AI-generated ATC exists for the live participant, driving the
  // inline "Use AI ATC" button. Keyed on profileid+token so it queries once per participant; any
  // failure leaves the button hidden (manual prescribe always remains available). Reads only
  // (firestore-atc, queue_atc_generation), never writes.
  async checkAiAtcAvailability() {
    if (!this.aiAtcFeatureEnabled) { this.aiAtcAvailable = false; return; }  // feature held — no query, no buttons
    const token = this.liveAssignment?.['token'];
    const profileid = this.participantProfileId;
    const queueTokenId = token?.['docid'];
    const tokenQueueRef = token?.['queueref'];

    if (!profileid || !queueTokenId || !tokenQueueRef?.id) {
      // token not hydrated yet — reset so a later token update re-checks.
      this.aiAtcAvailable = false;
      this.aiAtcDocId = null;
      this.aiAtcCheckedKey = null;
      return;
    }

    const key = profileid + '|' + queueTokenId;
    if (key === this.aiAtcCheckedKey) return;  // already checked this participant

    // New participant → clear stale state immediately and claim the key (prevents concurrent
    // duplicate queries while this one is in flight).
    this.aiAtcCheckedKey = key;
    this.aiAtcAvailable = false;
    this.aiAtcDocId = null;

    try {
      const firestoreATC = getFirestore("firestore-atc");
      // queue_atc_generation stores queueref as a firestore-atc reference
      // (cloud fn: adminATC.doc(queueRef.path)); the studio token's queueref points at the default
      // DB, so rebuild it against firestore-atc for the equality query to match.
      const atcQueueRef = doc(firestoreATC, 'queue generation', tokenQueueRef.id);
      const aiSnap = await getDocs(query(
        collection(firestoreATC, 'queue_atc_generation'),
        where('profileid', '==', profileid),
        where('queue_token_id', '==', queueTokenId),
        where('queueref', '==', atcQueueRef),
        where('stage', '==', 'Scope Enhancement'),
        where('status', '==', 'completed')
      ));

      // Guard against a participant switch that happened while this query was awaiting.
      if (this.aiAtcCheckedKey !== key) return;

      if (!aiSnap.empty) {
        this.aiAtcDocId = aiSnap.docs[0].id;
        this.aiAtcAvailable = true;
      }
    } catch (err) {
      console.error('AI ATC availability check failed; hiding AI button', err);
      this.aiAtcCheckedKey = null;  // allow a retry on the next entry
    }
  }

  updateATC(atcid, collection, option){
    var url = '/editATC/'+atcid+"/" + collection + option
    window.open(url.toString(), '_blank')
  }
  
  // Realtime entry point. Instead of a one-time fetch on every screen load, watch
  // the participant's ATC collection and re-hydrate the list whenever it changes.
  // Replaces any existing listener for this collectiontype so they never stack.
  previewATC(collectiontype){
    const firestoreATC = getFirestore("firestore-atc")
    const startDate = this.transferredQueue != null ? this.transferredQueue["queuestartdate"].toDate() : this.ongoingQueue["queuestartdate"].toDate()
    // Mirrors the effective query in hydratePreviewATC (the role branch there is
    // dead — `|| true` always selects the allow-all form).
    const watchQuery = collectiontype == "alpha"
      ? query(
          collection(firestoreATC, "atc_alpha"),
          where("profileid", "==", this.liveAssignment["participantid"]),
          where("prescription_date", ">=", startDate)
        )
      : query(
          collection(firestoreATC, "atc_to_validate"),
          where("status", "==", "atc given"),
          where("profileid", "==", this.liveAssignment["participantid"]),
          where("prescription_date", ">=", startDate)
        )
    this.previousAtcSubs[collectiontype]?.unsubscribe()
    this.previousAtcSubs[collectiontype] = collectionData(watchQuery, {idField: 'id'})
      .pipe(takeUntil(this.subscriptionHandle))
      .subscribe(() => this.hydratePreviewATC(collectiontype))
  }

  async hydratePreviewATC(collectiontype){

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
      // NOTE: we deliberately do NOT add `orderBy('created')` to the Firestore
      // query. Combining `where('profileid')` with `orderBy('created')` requires
      // a composite index — when that index is missing the whole query throws and
      // the list ends up empty ("Love Letters not displayed"). `orderBy` would
      // also silently drop any love-letter doc that lacks a `created` field.
      // Fetch by profile only, then sort newest-first on the client.
      const q = query(
        collection(this.firestore, "love letter"),
        where("profileid", "==", profileid)
      )
      const snap = await getDocs(q)
      const toMillis = (v: any): number => {
        if (!v) return 0
        if (typeof v?.toDate === 'function') return v.toDate().getTime()
        const t = new Date(v).getTime()
        return isNaN(t) ? 0 : t
      }
      this.loveLetterList = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => toMillis(b['created']) - toMillis(a['created']))
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
    
    

    (await this.openAssignProcedureStudio({
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
    })).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result=>{
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
    
    // Tear down the previous listener before opening a new one and pipe through
    // takeUntil — getTripleATC can be called repeatedly per participant, and
    // without this each call orphaned a live "triple atc" listener.
    this.tripleATCSubscription?.unsubscribe()
    this.tripleATCSubscription = collectionData(tripleATCQuery).pipe(takeUntil(this.subscriptionHandle)).subscribe(atc => {
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

    // AEL needs liveAssignment.token to know which queue(s) to search.
    if(!this.liveAssignment["token"]) return;

    try {
      // Static reference collection — fetch once per session, not per call.
      if (!this.aelLevelListLoaded) {
        const level = await getDocs(collection(this.firestore, "accelerated evolution level"));
        this.aelLevelList = level.docs.map(e => e.data())
        this.aelLevelListLoaded = true
      }

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
  
  // ---- Move to Next Stage dropdown (mockup) — same actions, popup UI ----
  get hasNextStageOptions(): boolean {
    const sp = this.ongoingQueue?.['stageproperty']?.[this.liveAssignment?.['stagename']] || {}
    return !!(sp?.nextstage?.length) || !!(sp?.studiowidgets?.includes('movetonextqueue'))
  }
  toggleNextStageMenu(which: 'header' | 'footer'){ this.nextStageMenuOpen = this.nextStageMenuOpen === which ? null : which }
  closeNextStageMenu(){ this.nextStageMenuOpen = null }

  // ---- AEL slider modal helpers (UI only; band model unchanged) ----
  openAelModal(){ if(this.participantAEL['aelStatus'] !== 'validated' && this.participantAEL['crossovermetric'] != null) this.aelModalOpen = true }
  closeAelModal(){ this.aelModalOpen = false }
  /** index of the current band ("start---end") within aelLevelList (0 if none). */
  aelBandIndex(value: any): number {
    const idx = this.aelLevelList.findIndex(o => (o['startpoint'] + '---' + o['endpoint']) === value)
    return idx < 0 ? 0 : idx
  }
  /** set the band from a slider index; keeps the exact stored value string. */
  setAelBand(crossover: any, idx: any){
    const o = this.aelLevelList[+idx]
    if(!o) return
    crossover.value['value'] = o['startpoint'] + '---' + o['endpoint']
    this.participantAEL['aelStatus'] = 'edited'
  }
  /** human label for the current band, e.g. "0 – 10". */
  aelBandLabel(value: any): string {
    const o = this.aelLevelList[this.aelBandIndex(value)]
    return o ? (o['startpoint'] + ' – ' + o['endpoint']) : '—'
  }
  async validateAelFromModal(){
    await this.updateCurrentAEL()
    this.aelModalOpen = false
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
  
  // True when the current live assignment's Zoom link is missing or marked
  // as broken by the cloud function. Used by the template to show an inline
  // amber warning and to swap the Start Meeting button copy.
  get isZoomLinkBroken(): boolean {
    const url = this.liveAssignment?.['zoomdata']?.['start_url']
    return !url || url === 'Link Broken'
  }

  navigateMeeting(doc:any){
    console.log(doc);
    const zoomData = doc["zoomdata"] ?? {}

    if(!zoomData["start_url"] || zoomData["start_url"] == "Link Broken"){
      // Replace the blunt alert with an inline snackbar pointing the user at
      // the "Generate New Link" action right below.
      this.snackBar.open(
        'This Zoom link is broken. Use "Generate New Link" below.',
        'Dismiss',
        { duration: 5000, horizontalPosition: 'center', verticalPosition: 'top' }
      )
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
      this.nextMonthReviewSaving = true
      try {
        await setDoc(doc(this.firestore, "review participants", token['docid']), token);
        this.nextMonthReviewMarked = true
        this.snackBar.open('Participant marked for next month review.', 'OK',
          { duration: 4000, horizontalPosition: 'center', verticalPosition: 'top' })
      } catch (error) {
        console.error('Error moving to next month review:', error);
        this.snackBar.open('Could not mark for next month review. Please try again.', 'Dismiss',
          { duration: 5000, horizontalPosition: 'center', verticalPosition: 'top' })
      } finally {
        this.nextMonthReviewSaving = false
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

  // ── Lazily-loaded dialogs ───────────────────────────────────────────────
  // Each dialog component is code-split into its own chunk via dynamic import()
  // and fetched only when the dialog actually opens, keeping it out of the
  // /dynamicstudio route chunk. Helpers return the MatDialogRef so callers keep
  // using .afterClosed() exactly as before.
  private async openAcceptOtherStudio(cfg?: any){
    const { AcceptOtherStudioComponent } = await import('../accept-other-studio/accept-other-studio.component')
    return this.dialog.open(AcceptOtherStudioComponent, cfg)
  }
  private async openQueueInvitationApproval(cfg?: any){
    const { QueueInvitationApprovalComponent } = await import('../queue-invitation-approval/queue-invitation-approval.component')
    return this.dialog.open(QueueInvitationApprovalComponent, cfg)
  }
  private async openHoldAlertDialog(cfg?: any){
    const { HoldAlertDialogComponent } = await import('../hold-alert-dialog/hold-alert-dialog.component')
    return this.dialog.open(HoldAlertDialogComponent, cfg)
  }
  private async openInviteOtherStudio(cfg?: any){
    const { InviteOtherStudioComponent } = await import('../invite-other-studio/invite-other-studio.component')
    return this.dialog.open(InviteOtherStudioComponent, cfg)
  }
  private async openAssignQueueStudio(cfg?: any){
    const { AssignQueueStudioComponent } = await import('../assign-queue-studio/assign-queue-studio.component')
    return this.dialog.open(AssignQueueStudioComponent, cfg)
  }
  private async openEnterStudioAssign(cfg?: any){
    const { EnterStudioAssignComponent } = await import('../enter-studio-assign/enter-studio-assign.component')
    return this.dialog.open(EnterStudioAssignComponent, cfg)
  }
  private async openStageIncompleteConfirmation(cfg?: any){
    const { StageIncompleteConfirmationComponent } = await import('../stage-incomplete-confirmation/stage-incomplete-confirmation.component')
    return this.dialog.open(StageIncompleteConfirmationComponent, cfg)
  }
  private async openPreassignStudio(cfg?: any){
    const { PreassignStudioComponent } = await import('../preassign-studio/preassign-studio.component')
    return this.dialog.open(PreassignStudioComponent, cfg)
  }
  private async openAssignProcedureStudio(cfg?: any){
    const { AssignProcedureStudioComponent } = await import('../assign-procedure-studio/assign-procedure-studio.component')
    return this.dialog.open(AssignProcedureStudioComponent, cfg)
  }

  trackById(index: number, item: any): string {
    return item.key;
  }

  // Generic *ngFor identity: track realtime-stream rows by their stable Firestore
  // id so an emit diffs in place instead of tearing down + rebuilding the DOM.
  // Falls back to index for primitive / id-less rows (safe for these small,
  // non-reordering inner lists).
  trackByDocId(index: number, item: any): any {
    return item?.docid ?? item?.id ?? index;
  }

  trackByStudioId(index: number, item: any): any {
    return item?.studioId ?? index;
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

  async initChatThread() {
    if (!this.selectedStudio['docid']) return
    const threadRef = doc(this.firestore, 'studio_chat', this.selectedStudio['docid'])
    const snap = await getDoc(threadRef)
    const liveassignementId = this.liveAssignment?.['docid'] ?? null
    const participants = this.selectedStudio['participants'] ?? []
    const specialistid = {}
    const participantid = this.liveAssignment?.['participantid'] ?? null
    if (this.liveAssignment) {
      ;[...(this.liveAssignment['pairing'] ?? []), ...Object.keys(this.liveAssignment['bonusactivity'] ?? {})].forEach(id => {
        specialistid[id] = participantid
      })
    }

    if (!snap.exists()) {
      await setDoc(threadRef, {
        studioid: this.selectedStudio['docid'],
        queueid: this.ongoingQueue['docid'],
        liveassignmentid: liveassignementId ? [liveassignementId] : [],
        currentliveassignmentid: liveassignementId,
        specialistid,
        lastmessage: null,
        lastmessageat: null,
        createdat: serverTimestamp(),
        profileid: participants
      })
    } else {
      const update: any = { profileid: arrayUnion(...participants) }
      if (liveassignementId) {
        update.currentliveassignmentid = liveassignementId
        update.specialistid = specialistid
        update.liveassignmentid = arrayUnion(liveassignementId)
      }
      await updateDoc(threadRef, update)
    }

    this.chatUnreadSub?.unsubscribe()
    let previousMsgIds: Set<string> | null = null
    this.chatUnreadSub = collectionData(query(collection(this.firestore, 'studio_chat', this.selectedStudio['docid'], 'messages'),where('pending', 'array-contains', this.profileid))).pipe(takeUntil(this.subscriptionHandle)).subscribe(msgs =>
    {
      this.unreadChatCount = msgs.length
      if (!this.isChatOpen && previousMsgIds !== null) {
        msgs.forEach((m: any) => {
          if (m['messageid'] && !previousMsgIds.has(m['messageid']) && m['sent_by'] !== this.profileid) {
            this.showChatNotification(m['message'] || 'Sent an attachment', 'A&H Team')
          }
        })
      }
      previousMsgIds = new Set(msgs.map((m: any) => m['messageid']))
    })
  }

  async clearChatThread() {
    this.closeChat()
    this.chatUnreadSub?.unsubscribe()
    if (!this.selectedStudio['docid']) return
    await updateDoc(doc(this.firestore, 'studio_chat', this.selectedStudio['docid']), {
      currentliveassignmentid: null,
      specialistid: null,
      lastsessionendedat: serverTimestamp()
    }).catch(() => {})
  }

  async openChat() {
    this.isChatOpen = true
    const studioid = this.selectedStudio['docid']
    this.chatMessages = []
    this.allChatMessages = []
    this.chatHasMore = false
    this.chatDisplayCount = 10
    this.chatLiveSub?.unsubscribe()

    const threadSnap = await getDoc(doc(this.firestore, 'studio_chat', studioid))
    const threadData = threadSnap.data() ?? {}
    const currentAssignmentId: string | null = threadData['currentliveassignmentid'] ?? null
    const sessionend = threadData['lastsessionendedat'] ?? null

    let allMsgs: any[] = []

    if (currentAssignmentId) {
      const [sessionMsgs, nullMsgs] = await Promise.all([getDocs(query(collection(this.firestore, 'studio_chat', studioid, 'messages'),where('liveassignmentid', '==', currentAssignmentId),orderBy('sentat', 'asc'))),sessionend
          ? getDocs(query(collection(this.firestore, 'studio_chat', studioid, 'messages'),where('sentat', '>', sessionend),orderBy('sentat', 'asc')))
          : getDocs(query(collection(this.firestore, 'studio_chat', studioid, 'messages'),orderBy('sentat', 'asc'))) ])
      const sessionData = sessionMsgs.docs.map(d => d.data())
      const nullData = nullMsgs.docs.map(d => d.data()).filter((m: any) => m['liveassignmentid'] == null)
      const merged = [...sessionData, ...nullData]
      merged.sort((a: any, b: any) => (a['sentat']?.toMillis?.() ?? 0) - (b['sentat']?.toMillis?.() ?? 0))
      const seen = new Set()
      allMsgs = merged.filter((m: any) => {
        if (seen.has(m['messageid'])) return false
        seen.add(m['messageid'])
        return true
      })
    } else if (sessionend) {
      const snap = await getDocs(query(collection(this.firestore, 'studio_chat', studioid, 'messages'),where('sentat', '>', sessionend),orderBy('sentat', 'asc')))
      allMsgs = snap.docs.map(d => d.data()).filter((m: any) => m['liveassignmentid'] == null)
    } else {
      const snap = await getDocs(query(collection(this.firestore, 'studio_chat', studioid, 'messages'),orderBy('sentat', 'asc')))
      allMsgs = snap.docs.map(d => d.data()).filter((m: any) => m['liveassignmentid'] == null)
    }

    this.allChatMessages = allMsgs
    this.chatDisplayCount = 10
    this.chatHasMore = allMsgs.length > this.chatDisplayCount
    this.chatMessages = allMsgs.slice(-this.chatDisplayCount)

    this.markChatRead()
    setTimeout(() => {
      if (this.chatScroll) this.chatScroll.nativeElement.scrollTop = this.chatScroll.nativeElement.scrollHeight
    }, 50)

    const sinceTime = this.chatMessages.length? this.chatMessages[this.chatMessages.length - 1]['sentat']: sessionend
    const liveQuery = sinceTime? query(collection(this.firestore, 'studio_chat', studioid, 'messages'),orderBy('sentat', 'asc'),where('sentat', '>', sinceTime))
      : query(collection(this.firestore, 'studio_chat', studioid, 'messages'),orderBy('sentat', 'asc'))

    this.chatLiveSub = collectionData(liveQuery).pipe(takeUntil(this.subscriptionHandle)).subscribe(newMsgs => {
      newMsgs.forEach((m: any) => {
        if (this.allChatMessages.some(e => e['messageid'] === m['messageid'])) return
        const mid = m['liveassignmentid']
        const currentId = this.liveAssignment?.['docid'] ?? null
        if (mid === currentId) {
        } else if (mid == null && currentId !== null) {
          if (sessionend) {
            const msgMs = typeof m['sentat']?.toMillis === 'function' ? m['sentat'].toMillis() : 0
            const cutoffMs = typeof sessionend.toMillis === 'function' ? sessionend.toMillis() : 0
            if (msgMs <= cutoffMs) return
          }
        } else {
          return
        }
        this.allChatMessages = [...this.allChatMessages, m]
        this.chatMessages = this.allChatMessages.slice(-this.chatDisplayCount)
        this.markChatRead()
        if (m['sent_by'] !== this.profileid) {
          this.showChatNotification(m['message'] || 'Sent an attachment', 'A&H Team')
        }
        setTimeout(() => {
          if (this.chatScroll) this.chatScroll.nativeElement.scrollTop = this.chatScroll.nativeElement.scrollHeight
        }, 50)
      })
    })
  }

  loadMoreChatMessages() {
    this.chatDisplayCount = Math.min(this.chatDisplayCount + 10, this.allChatMessages.length)
    this.chatHasMore = this.allChatMessages.length > this.chatDisplayCount
    this.chatMessages = this.allChatMessages.slice(-this.chatDisplayCount)
  }

  private markChatRead() {
    const unread = this.chatMessages.filter(m =>
      m['sent_by'] !== this.profileid && (m['pending'] ?? []).includes(this.profileid)
    )
    if (!unread.length) return
    const batch = writeBatch(this.firestore)
    unread.forEach(m => {
      batch.update(
        doc(this.firestore, 'studio_chat', this.selectedStudio['docid'], 'messages', m['messageid']),
        { pending: arrayRemove(this.profileid), read_by: arrayUnion(this.profileid) }
      )
    })
    batch.commit().catch(() => {})
  }

  onChatFileSelected(event: any) {
    Array.from(event.target.files as FileList).forEach((file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        this.snackBar.open(`${file.name} exceeds 10MB`, 'OK', { duration: 2500 })
        return
      }
      const entry: any = { file, filename: file.name, filetype: file.type, fileurl: '', mediatype: file.type }
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = e => { entry.fileurl = e.target?.result as string }
        reader.readAsDataURL(file)
      }
      this.chatAttachedFiles.push(entry)
    })
  }

  isImageFile(filename: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename || '')
  }

  removeChatFile(index: number) {
    this.chatAttachedFiles.splice(index, 1)
  }

  async sendChatMessage() {
    if (this.chatUploading) return
    if (!this.chatText.trim() && !this.chatAttachedFiles.length) return
    if (!this.selectedStudio['docid']) return
    this.chatUploading = true
    const studioid = this.selectedStudio['docid']
    const queueid = this.ongoingQueue['docid']
    const msgid = doc(collection(this.firestore, 'studio_chat', studioid, 'messages')).id
    const text = this.chatText.trim()
    this.chatText = ''
    const threadSnap = await getDoc(doc(this.firestore, 'studio_chat', studioid))
    const profileids: string[] = threadSnap.data()?.['profileid'] ?? []
    const pending = profileids.filter(id => id !== this.profileid)
    let files: any[] = []
    try {
      files = await Promise.all(
        this.chatAttachedFiles.map(async f => {
          const fileName = `${Date.now()}_${f.filename}`
          const storageRef = ref(this.storage, `studio-chat/${queueid}/${studioid}/${fileName}`)
          const snap = await uploadBytes(storageRef, f.file)
          const url = await getDownloadURL(snap.ref)
          return { filename: f.filename, fileurl: url }
        })
      )
    } catch {
      this.snackBar.open('File upload failed', 'OK', { duration: 2500 })
      this.chatUploading = false
      return
    }
    this.chatAttachedFiles = []
    const newMsg = {
      messageid: msgid,
      message: text || null,
      sent_by: this.profileid,
      sentat: serverTimestamp(),
      files,
      read_by: [this.profileid],
      pending,
      liveassignmentid: this.liveAssignment?.['docid'] ?? null,
      studioid,
      queueid
    }
    await Promise.all([
      setDoc(doc(this.firestore, 'studio_chat', studioid, 'messages', msgid), newMsg),
      updateDoc(doc(this.firestore, 'studio_chat', studioid), {
        lastmessage: text || 'media',
        lastmessageat: serverTimestamp()
      })
    ])
    if (!this.chatMessages.some(m => m['messageid'] === msgid)) {
      this.chatMessages = [...this.chatMessages, { ...newMsg, sentat: new Date() }]
    }
    setTimeout(() => {
      if (this.chatScroll) this.chatScroll.nativeElement.scrollTop = this.chatScroll.nativeElement.scrollHeight
    }, 50)
    this.chatUploading = false
  }

  private requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  onChatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      this.sendChatMessage()
    }
  }

  closeChat() {
    this.isChatOpen = false
    this.chatMessages = []
    this.allChatMessages = []
    this.chatDisplayCount = 10
    this.chatLiveSub?.unsubscribe()
  }

  private showChatNotification(message: string, senderName: string) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(`New message from ${senderName}`, {
      body: message || 'Sent an attachment',
      icon: '/assets/icons/icon-72x72.png'
    });

    notification.onclick = () => {
      window.focus();
      this.isChatOpen = true;
      this.openChat();
      notification.close();
    };

    setTimeout(() => notification.close(), 5000);
  }

}
