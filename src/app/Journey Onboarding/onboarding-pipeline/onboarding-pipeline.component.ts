import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { getApp } from '@angular/fire/app';
import { Firestore as AfsFirestore } from '@angular/fire/firestore';
import { Auth, getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  Firestore, arrayUnion, collection, doc, getDoc, getDocs, getFirestore,
  limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { AddPipelineDialogComponent } from './add-pipeline-dialog/add-pipeline-dialog.component';
import { ScheduleDialogComponent } from '../schedule-dialog/schedule-dialog.component';

interface PipelineRef {
  id: string;
  pipelinename?: string;
  dealstage?: string[];
  dealstageIds?: string[];
}
import { AuthguardService } from '../../authguard.service';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import { environment } from '../../../environments/environment';

interface PipelineDoc {
  id: string;
  pipelinename: string;
  category?: string;
  description?: string;
  dealstage?: string[];
  dealstageIds?: string[];
  pipeline_visibleto?: string[];
  presaleowner?: string[];
  columns?: string[];
  journeyexperience?: boolean;
  delete?: boolean;
  hidden?: boolean;
  createdDate?: any;
  updatedDate?: any;
}

interface LeadDoc {
  id: string;
  name?: string;
  email?: string;
  mobile?: string;
  presalesowner?: string;
  salesowner?: string;
  leadstatus?: string;
  createdDate?: any;
  lastupdate?: any;
  [k: string]: any;
}

interface SourceParticipant {
  profileid: string;
  pjpDocId: string;          // participantjourneyproduct doc id — needed for schedule update
  pjpRaw: any;               // full raw doc, passed to the journey-coach ScheduleDialogComponent
  name: string;
  email?: string;
  mobile?: string;
  image?: string;
  onboardingscheduled?: any;
  purchasedate?: any;
  onboardedtime?: any;
  appointmentId?: string;
  hosts?: { id: string; name: string; image?: string }[];
  welcomecallnotes?: { by?: string; at?: any; note?: string; fromStage?: string; toStage?: string }[];
}

type SourceBucketKey =
  | 'notassured'
  | 'notassuredwc'
  | 'tobeonboarded'
  | 'tobeonboardedwc'
  | 'onboardedthismonth';

interface SourceBucket {
  key: SourceBucketKey;
  label: string;
  accent: string;
  scheduleField: 'onboardingscheduled' | 'onboardedtime' | 'purchasedate';
  scheduleLabel: string;
  participants: SourceParticipant[];
  loaded: boolean;
}

@Component({
  selector: 'app-onboarding-pipeline',
  standalone: true,
  imports: [
    ProfilePictureComponent,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './onboarding-pipeline.component.html',
  styleUrl: './onboarding-pipeline.component.css',
})
export class OnboardingPipelineComponent implements OnInit {

  private salescrmDb!: Firestore;

  // Access gate state
  loading: boolean = true;
  accessDenied: boolean = false;
  accessError: string = '';
  accessReason: 'config' | 'email' | 'notfound' | 'unknown' | '' = '';
  accessDebug: { email?: string; queriedEmails?: string[]; raw?: string } = {};
  salescrmUserId: string = '';
  salescrmUserName: string = '';

  // Starlabs profile_data doc id of the logged-in user (used as `by` on notes).
  starlabsProfileId: string = '';

  // Pipeline list state
  pipelines: PipelineDoc[] = [];
  pipelineSearch: string = '';

  // Elevated role flags (salescrm userRoles.admin / .superadmin)
  isAdmin: boolean = false;
  isSuperAdmin: boolean = false;

  // Stages view state
  selectedPipeline: PipelineDoc | null = null;
  stagesLoading: boolean = false;
  stages: string[] = [];
  leadsByStage: Record<string, LeadDoc[]> = {};
  totalLeadsInPipeline: number = 0;

  // Owner / profile maps (for resolving owner UIDs → names on lead cards)
  ownerNameMap: Record<string, string> = {};

  // starlabs profile_data id → display name (used for welcome-call note authors)
  profileNameMap: Record<string, string> = {};

  // Journey-coach source buckets (intake before formal pipeline stages)
  sourceBuckets: SourceBucket[] = [
    { key: 'notassured',         label: 'Not Assured',                       accent: '#DC2626', scheduleField: 'purchasedate',        scheduleLabel: 'Purchased', participants: [], loaded: false },
    { key: 'notassuredwc',       label: 'Not Assured · Welcome Call',        accent: '#D97706', scheduleField: 'purchasedate',        scheduleLabel: 'Purchased', participants: [], loaded: false },
    { key: 'tobeonboarded',      label: 'To Be Onboarded',                   accent: '#0891B2', scheduleField: 'onboardingscheduled', scheduleLabel: 'Scheduled', participants: [], loaded: false },
    { key: 'tobeonboardedwc',    label: 'To Be Onboarded · Welcome Call',    accent: '#7C3AED', scheduleField: 'onboardingscheduled', scheduleLabel: 'Scheduled', participants: [], loaded: false },
    { key: 'onboardedthismonth', label: 'Onboarded This Month',              accent: '#059669', scheduleField: 'onboardedtime',       scheduleLabel: 'Onboarded', participants: [], loaded: false },
  ];
  sourceBucketsLoading: boolean = false;

  // Image lightbox state
  expandedImage: string = '';
  expandedImageName: string = '';

  // ─── Welcome-call notes modal state ───
  wcModalOpen: boolean = false;
  wcModalParticipant: SourceParticipant | null = null;
  wcModalSourceKey: SourceBucketKey | null = null;
  wcModalTargetKey: SourceBucketKey | null = null;
  wcModalDestLabel: string = '';
  wcModalNotes: string = '';
  wcModalTouched: boolean = false;
  wcModalSaving: boolean = false;

  // ─── Add-lead modal state ───
  addLeadOpen: boolean = false;
  addLeadSaving: boolean = false;
  addLeadLoading: boolean = false;
  addLeadPipelineOptions: PipelineRef[] = [];
  addLeadSelectedPipeline: PipelineRef | null = null;
  addLeadPipelineLocked: boolean = false;
  addLeadStagesList: string[] = [];
  addLeadStageIds: string[] = [];
  addLeadSelectedStageName: string = '';
  addLeadSelectedStageId: string = '';
  addLeadProfiles: any[] = [];
  addLeadSearchQuery: string = '';
  addLeadSelectedProfileId: string = '';
  addLeadPreselectMode: boolean = false;
  private addLeadDefaultStage: string = '';

  // ─── Lead detail modal state ───
  leadModalOpen: boolean = false;
  leadModalLead: any = null;
  leadModalStages: string[] = [];
  leadModalPipelineName: string = '';
  leadModalOriginalStage: string = '';
  leadModalCurrentStage: string = '';
  leadModalSavingStage: string | null = null;
  leadModalAnyChangeMade: boolean = false;
  leadModalProfileLoading: boolean = false;
  leadModalProfileImage: string = '';
  leadModalProfileName: string = '';
  leadModalProfileMobile: string = '';
  leadModalProfileEmail: string = '';
  leadModalCopiedField: 'email' | 'mobile' | null = null;
  private leadModalCopyResetTimer: any = null;
  private readonly leadModalExcludedKeys = new Set<string>([
    'id', 'leadid', 'pipelineid', 'pipelinename', 'personid', 'profile_ref',
    'name', 'email', 'mobile', 'leadsource', 'leadstatus',
    'presalesowner', 'salesowner',
    'createdDate', 'lastupdate',
  ]);


  // Cycling palette of stage accents (eye-catchy but curated)
  private stageAccents: string[] = [
    '#2563EB', // blue
    '#0891B2', // cyan
    '#7C3AED', // violet
    '#DB2777', // pink
    '#EA580C', // orange
    '#65A30D', // lime
    '#0D9488', // teal
    '#475569', // slate (for closed/converted-ish stages)
  ];

  constructor(
    private dialog: MatDialog,
    private guard: AuthguardService,
    private snackBar: MatSnackBar,
    private starlabsFs: AfsFirestore,
  ) {}

  async ngOnInit() {
    try {
      // 1. Verify salescrm Firebase config is actually filled in.
      const salescrmCfg: any = (environment as any)?.['salescrm'];
      if (!salescrmCfg || !salescrmCfg.apiKey) {
        this.accessDenied = true;
        this.accessReason = 'config';
        this.accessError = 'Salescrm Firebase config is missing. Paste the salescrm web SDK config (apiKey, authDomain, etc.) into src/environments/environment.development.ts (and environment.ts for prod) under the "salescrm" key, then reload.';
        return;
      }

      // 2. Initialize the named app + Firestore instance.
      await this.guard.initializeSalescrm();
      this.salescrmDb = getFirestore(getApp('salescrm'));

      // 3. Resolve current starlabs email → salescrm userRegister id.
      await this.checkAccess();
      if (!this.accessDenied) {
        // Admin/superadmin role must be known BEFORE we fetch pipelines, so
        // we can skip the pipeline_visibleto filter for elevated users.
        await this.checkAdminAccess();
        await Promise.all([
          this.loadOwners(),
          this.loadPipelines(),
          this.resolveStarlabsProfileId(),
        ]);
        // Source buckets (journey-coach intake) load in the background —
        // shown at the top of the listing screen.
        this.loadSourceBuckets();
      }
    } catch (err: any) {
      console.error('[onboarding-pipeline] init error:', err);
      this.accessDenied = true;
      this.accessReason = 'unknown';
      this.accessError = 'Could not connect to salescrm. ' + (err?.message || '') + ' (See console for full details.)';
      this.accessDebug.raw = (err && (err.message || err.toString())) || 'unknown';
    } finally {
      this.loading = false;
    }
  }

  // ─── Access gate ──────────────────────────────────────────
  private async resolveCurrentEmail(): Promise<string> {
    // 1) Firebase Auth currentUser (synchronously available after auth resolves)
    const auth = getAuth();
    if (auth.currentUser?.email) return auth.currentUser.email;

    // 2) authguard cached value (set in some flows of the service)
    if (this.guard?.email) return this.guard.email;

    // 3) Wait briefly for auth state to settle (up to ~3 seconds)
    return await new Promise<string>((resolve) => {
      let resolved = false;
      const unsub = onAuthStateChanged(auth, (user) => {
        if (resolved) return;
        resolved = true;
        unsub();
        resolve(user?.email || '');
      });
      // Hard cap in case auth never resolves
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        unsub();
        resolve('');
      }, 3000);
    });
  }

  private async checkAccess() {
    const rawEmail = (await this.resolveCurrentEmail() || '').toString().trim();
    const email = rawEmail.toLowerCase();
    this.accessDebug.email = rawEmail;

    if (!email) {
      this.accessDenied = true;
      this.accessReason = 'email';
      this.accessError = 'Your starlabs session has no email. Try signing out and back in.';
      return;
    }

    const userRef = collection(this.salescrmDb, 'userRegister');
    const queriedEmails: string[] = [];

    // Try lowercase first
    queriedEmails.push(email);
    let snap = await getDocs(query(userRef, where('email', '==', email)));

    // Fallback: original case
    if (snap.empty && rawEmail !== email) {
      queriedEmails.push(rawEmail);
      snap = await getDocs(query(userRef, where('email', '==', rawEmail)));
    }

    this.accessDebug.queriedEmails = queriedEmails;

    if (snap.empty) {
      this.accessDenied = true;
      this.accessReason = 'notfound';
      this.accessError = `Your email (${rawEmail}) is not in salescrm's userRegister collection. Ask a salescrm admin to add you.`;
      console.warn('[onboarding-pipeline] userRegister lookup failed for emails:', queriedEmails);
      return;
    }
    const d = snap.docs[0];
    this.salescrmUserId = d.id;
    const data: any = d.data() || {};
    this.salescrmUserName = data['owner'] || data['owner_fullname'] || data['name'] || rawEmail;
    console.log('[onboarding-pipeline] salescrm user resolved:', { id: this.salescrmUserId, name: this.salescrmUserName });
  }

  // ─── Load owners (for resolving owner-uid → name on lead cards) ───
  private async loadOwners() {
    const userRef = collection(this.salescrmDb, 'userRegister');
    const snap = await getDocs(userRef);
    snap.forEach(d => {
      const data: any = d.data() || {};
      const id = d.id;
      const display = data['owner'] || data['owner_fullname'] || data['name'] || data['email'] || '';
      if (display) this.ownerNameMap[id] = display;
      // some collections use owner_id rather than doc id as the link
      if (data['owner_id']) this.ownerNameMap[data['owner_id']] = display;
    });
  }

  // ─── Pipelines listing ────────────────────────────────────
  private async loadPipelines() {
    const pipesRef = collection(this.salescrmDb, 'pipelines');
    const q = query(pipesRef, where('journeyexperience', '==', true));
    const snap = await getDocs(q);

    const elevated = this.isAdmin || this.isSuperAdmin;
    const list: PipelineDoc[] = [];
    snap.forEach(d => {
      const data = d.data() as any;
      // delete === false means published (salescrm convention)
      if (data['delete'] === true) return;
      // Admins / super-admins see every journey-experience pipeline.
      // Everyone else: must be in pipeline_visibleto.
      if (!elevated) {
        const visibleTo: string[] = data['pipeline_visibleto'] || [];
        if (!visibleTo.includes(this.salescrmUserId)) return;
      }
      list.push({ id: d.id, ...data });
    });

    // Sort: most recently updated first
    list.sort((a, b) => {
      const at = this.toMs(a.updatedDate || a.createdDate);
      const bt = this.toMs(b.updatedDate || b.createdDate);
      return bt - at;
    });
    this.pipelines = list;
  }

  get filteredPipelines(): PipelineDoc[] {
    const q = this.pipelineSearch.trim().toLowerCase();
    if (!q) return this.pipelines;
    return this.pipelines.filter(p =>
      (p.pipelinename || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }

  /**
   * Find the logged-in user's starlabs profile_data doc id and cache it.
   * Uses the same lookup pattern the rest of the codebase uses:
   * profile_data where user_ref == doc(user_data, guard.uid).
   */
  private async resolveStarlabsProfileId() {
    if (!this.guard?.uid) return;
    try {
      const userdataRef = doc(this.starlabsFs as any, 'user_data', this.guard.uid);
      const profilesRef = collection(this.starlabsFs as any, 'profile_data');
      const snap = await getDocs(query(profilesRef, where('user_ref', '==', userdataRef)));
      if (!snap.empty) {
        const d = snap.docs[0];
        this.starlabsProfileId = d.id;
        const data: any = d.data() || {};
        const name = data.name || data.fullname || d.id;
        this.profileNameMap[d.id] = name;
        console.log('[onboarding-pipeline] starlabs profileId:', this.starlabsProfileId, '·', name);
      } else {
        console.warn('[onboarding-pipeline] no profile_data doc found for uid', this.guard.uid);
      }
    } catch (err) {
      console.warn('[onboarding-pipeline] starlabs profileId lookup failed:', err);
    }
  }

  // ─── Admin role check (admin | superadmin in salescrm userRoles) ───
  private async checkAdminAccess() {
    if (!this.salescrmUserId) {
      console.warn('[onboarding-pipeline] admin check skipped: no salescrm user id');
      return;
    }
    try {
      const userRolesRef = collection(this.salescrmDb, 'userRoles');
      // Try the canonical link first: profile_uid == salescrm user id
      let snap = await getDocs(query(userRolesRef, where('profile_uid', '==', this.salescrmUserId)));
      // Some salescrm tenants key userRoles by the doc id directly
      if (snap.empty) {
        const direct = await getDoc(doc(this.salescrmDb, 'userRoles', this.salescrmUserId));
        if (direct.exists()) {
          const data: any = direct.data() || {};
          this.isAdmin = data['admin'] === true;
          this.isSuperAdmin = data['superadmin'] === true;
          console.log('[onboarding-pipeline] admin role (doc-id match):', {
            isAdmin: this.isAdmin, isSuperAdmin: this.isSuperAdmin,
          });
          return;
        }
      }
      if (!snap.empty) {
        const data: any = snap.docs[0].data() || {};
        this.isAdmin = data['admin'] === true;
        this.isSuperAdmin = data['superadmin'] === true;
        console.log('[onboarding-pipeline] admin role (profile_uid match):', {
          isAdmin: this.isAdmin, isSuperAdmin: this.isSuperAdmin,
        });
      } else {
        console.log('[onboarding-pipeline] no userRoles doc found for salescrm user', this.salescrmUserId);
      }
    } catch (err) {
      console.warn('[onboarding-pipeline] admin role check failed:', err);
    }
  }

  /** True when the pipeline doc has the current user in its visibility list. */
  isOwnPipeline(p: PipelineDoc): boolean {
    return Array.isArray(p.pipeline_visibleto) && p.pipeline_visibleto.includes(this.salescrmUserId);
  }

  // ─── Stage view ───────────────────────────────────────────
  async openPipeline(p: PipelineDoc) {
    this.selectedPipeline = p;
    this.stages = (p.dealstage && p.dealstage.length ? p.dealstage : []).map(s => (s || '').toString());
    this.leadsByStage = {};
    this.stages.forEach(s => (this.leadsByStage[s] = []));
    this.totalLeadsInPipeline = 0;
    await this.loadLeadsForPipeline(p.id);
  }

  back() {
    this.selectedPipeline = null;
    this.stages = [];
    this.leadsByStage = {};
    this.totalLeadsInPipeline = 0;
  }

  // ─── Source buckets (journey-coach intake) ────────────────
  private async loadSourceBuckets() {
    this.sourceBucketsLoading = true;
    try {
      const collRef = collection(this.starlabsFs as any, 'participantjourneyproduct');
      const minPurchaseDate = new Date('2025-01-01');

      // Two parallel queries: paymentplan == null vs != null
      const [naSnap, paidSnap] = await Promise.all([
        getDocs(query(collRef, where('paymentplan', '==', null), limit(300))),
        getDocs(query(collRef, where('paymentplan', '!=', null), limit(300))),
      ]);

      // ── Bucket 1 + 2: paymentplan == null pool ──
      //   - Not Assured              → welcomecall != true
      //   - Not Assured · WC done    → welcomecall == true
      const naList: any[] = [];
      const naWcList: any[] = [];
      naSnap.forEach(d => {
        const data: any = { docId: d.id, ...d.data() };
        if (!data.profileid) return;
        const purchaseDate = data.purchasedate?.toDate?.() || null;
        if (purchaseDate && purchaseDate < minPurchaseDate) return;
        const isAddons = data.journeytype === 'addons';
        const okStatus = ['ongoing', 'initiated'].includes(data.journeystatus);
        if (!isAddons && !okStatus) return;
        if (data.welcomecall === true) {
          naWcList.push(data);
        } else {
          naList.push(data);
        }
      });

      // ── Buckets 3 + 4 + 5: paymentplan != null pool ──
      //   - To Be Onboarded              → !onboarded AND welcomecall != true
      //   - To Be Onboarded · WC done    → !onboarded AND welcomecall == true
      //   - Onboarded This Month         → onboarded in current month (welcomecall not considered)
      const tboList: any[] = [];
      const tboWcList: any[] = [];
      const obList: any[] = [];
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      paidSnap.forEach(d => {
        const data: any = { docId: d.id, ...d.data() };
        if (!data.profileid) return;
        const purchaseDate = data.purchasedate?.toDate?.() || null;
        if (purchaseDate && purchaseDate < minPurchaseDate) return;
        const validStatus = data.journeystatus == null ||
          ['ongoing', 'initiated'].includes(data.journeystatus);
        if (!validStatus) return;

        const onboarded = data.onboarded === true;
        const obTime = data.onboardedtime?.toDate?.() || null;

        if (onboarded && obTime && obTime >= startOfMonth && obTime <= endOfMonth) {
          obList.push(data);
        } else if (!onboarded) {
          if (data.welcomecall === true) {
            tboWcList.push(data);
          } else {
            tboList.push(data);
          }
        }
      });

      // Sort + cap each bucket
      const byDateDesc = (field: string) => (a: any, b: any) => {
        const at = a[field]?.toDate?.()?.getTime?.() || 0;
        const bt = b[field]?.toDate?.()?.getTime?.() || 0;
        return bt - at;
      };
      naList.sort(byDateDesc('purchasedate'));
      naWcList.sort(byDateDesc('purchasedate'));
      tboList.sort(byDateDesc('purchasedate'));
      tboWcList.sort(byDateDesc('purchasedate'));
      obList.sort(byDateDesc('onboardedtime'));
      const CAP = 60;
      if (naList.length > CAP)     naList.length = CAP;
      if (naWcList.length > CAP)   naWcList.length = CAP;
      if (tboList.length > CAP)    tboList.length = CAP;
      if (tboWcList.length > CAP)  tboWcList.length = CAP;
      if (obList.length > CAP)     obList.length = CAP;

      // Collect unique profileids (participants + welcome-call note authors)
      const allLists = [naList, naWcList, tboList, tboWcList, obList];
      const allIds = new Set<string>();
      allLists.forEach(arr => arr.forEach((x: any) => {
        if (x.profileid) allIds.add(x.profileid);
        // Note authors — we want their profile_data names too
        const notes = Array.isArray(x.welcomecallnotes) ? x.welcomecallnotes : [];
        notes.forEach((n: any) => { if (n?.by) allIds.add(n.by); });
      }));

      // Fetch appointments for participants that have onboardingscheduled (+ appointmentid)
      const appointmentIds = new Set<string>();
      allLists.forEach(arr => arr.forEach((x: any) => {
        if (x.appointmentid && x.onboardingscheduled) appointmentIds.add(x.appointmentid);
      }));

      const apptMap: Record<string, any> = {};
      await Promise.all(Array.from(appointmentIds).map(async (aid) => {
        try {
          const snap = await getDoc(doc(this.starlabsFs as any, 'appointments', aid));
          if (snap.exists()) apptMap[aid] = snap.data();
        } catch { /* skip */ }
      }));

      // Pull host profile ids out of the appointment docs so we can resolve names
      Object.values(apptMap).forEach((appt: any) => {
        const hosts = Array.isArray(appt?.hosts) ? appt.hosts : [];
        hosts.forEach((h: any) => {
          const hid = (typeof h === 'object' && h?.id) ? h.id : (typeof h === 'string' ? h : null);
          if (hid) allIds.add(hid);
        });
      });

      // Batch-fetch profile_data in parallel for participants, hosts, and note authors
      const profileMap: Record<string, any> = {};
      await Promise.all(Array.from(allIds).map(async (pid) => {
        try {
          const snap = await getDoc(doc(this.starlabsFs as any, 'profile_data', pid));
          if (snap.exists()) profileMap[pid] = snap.data();
        } catch {/* skip */}
      }));

      // Build / merge the component-level profile name map so the welcome-call
      // dialog (and anywhere else) can resolve starlabs profile ids → names.
      const nextNameMap: Record<string, string> = { ...this.profileNameMap };
      Object.keys(profileMap).forEach(id => {
        const prof = profileMap[id] || {};
        nextNameMap[id] = prof.name || prof.fullname || id;
      });
      this.profileNameMap = nextNameMap;

      const resolveHosts = (pjp: any): { id: string; name: string; image?: string }[] => {
        if (!pjp.appointmentid) return [];
        const appt = apptMap[pjp.appointmentid];
        if (!appt) return [];
        const hosts = Array.isArray(appt.hosts) ? appt.hosts : [];
        return hosts
          .map((h: any) => {
            const hid = (typeof h === 'object' && h?.id) ? h.id : (typeof h === 'string' ? h : null);
            if (!hid) return null;
            const prof = profileMap[hid] || {};
            return {
              id: hid,
              name: prof.name || prof.fullname || hid,
              image: prof.profileimg || prof.profile || '',
            };
          })
          .filter((x: any) => x);
      };

      const toParticipant = (pjp: any): SourceParticipant => {
        const profile = profileMap[pjp.profileid] || {};
        return {
          profileid: pjp.profileid,
          pjpDocId: pjp.docId || '',
          pjpRaw: pjp,
          name: profile.name || profile.fullname || pjp.name || '(Unknown)',
          email: profile.email || pjp.email || '',
          mobile: profile.mobile || profile.phonenumber || pjp.mobile || '',
          image: profile.profileimg || profile.profile || '',
          onboardingscheduled: pjp.onboardingscheduled,
          purchasedate: pjp.purchasedate,
          onboardedtime: pjp.onboardedtime,
          appointmentId: pjp.appointmentid,
          hosts: resolveHosts(pjp),
          welcomecallnotes: Array.isArray(pjp.welcomecallnotes) ? pjp.welcomecallnotes : [],
        };
      };

      const next = this.sourceBuckets.map(b => {
        let src: any[] = [];
        if (b.key === 'notassured')         src = naList;
        if (b.key === 'notassuredwc')       src = naWcList;
        if (b.key === 'tobeonboarded')      src = tboList;
        if (b.key === 'tobeonboardedwc')    src = tboWcList;
        if (b.key === 'onboardedthismonth') src = obList;
        return { ...b, participants: src.map(toParticipant), loaded: true };
      });
      this.sourceBuckets = next;
    } catch (err) {
      console.error('[onboarding-pipeline] source bucket load failed:', err);
      this.sourceBuckets.forEach(b => (b.loaded = true));
    } finally {
      this.sourceBucketsLoading = false;
    }
  }

  countForSource(bucket: SourceBucket): number {
    return bucket.participants.length;
  }

  scheduleValue(bucket: SourceBucket, p: SourceParticipant): string {
    const ts = (p as any)[bucket.scheduleField];
    return ts ? this.formatDate(ts) : '';
  }

  /** Open the fullscreen image overlay for a participant's profile picture. */
  expandImage(p: SourceParticipant, event: MouseEvent) {
    event.stopPropagation();
    if (!p?.image) return;
    this.expandedImage = p.image;
    this.expandedImageName = p.name || '';
  }

  closeExpandedImage() {
    this.expandedImage = '';
    this.expandedImageName = '';
  }

  /** Returns the bucket the participant would land in after toggling welcomecall. */
  counterpartBucketKey(key: SourceBucketKey): SourceBucketKey | null {
    if (key === 'notassured')       return 'notassuredwc';
    if (key === 'notassuredwc')     return 'notassured';
    if (key === 'tobeonboarded')    return 'tobeonboardedwc';
    if (key === 'tobeonboardedwc')  return 'tobeonboarded';
    return null;  // onboardedthismonth has no toggle
  }

  /** True when the toggle moves the card INTO a welcome-call bucket. */
  isWelcomeCallForward(key: SourceBucketKey): boolean {
    return key === 'notassured' || key === 'tobeonboarded';
  }

  /** Short label shown on the toggle button. */
  moveLabelForBucket(key: SourceBucketKey): string {
    if (key === 'notassured' || key === 'tobeonboarded') return 'Welcome call';
    if (key === 'notassuredwc')   return 'Not assured';
    if (key === 'tobeonboardedwc') return 'To be onboarded';
    return '';
  }

  /** Open the inline welcome-call notes modal for this card. */
  toggleWelcomeCall(p: SourceParticipant, sourceKey: SourceBucketKey, event: MouseEvent) {
    event.stopPropagation();
    if (!p?.pjpDocId) return;
    const targetKey = this.counterpartBucketKey(sourceKey);
    if (!targetKey) return;
    const targetBucket = this.sourceBuckets.find(b => b.key === targetKey);
    if (!targetBucket) return;

    this.wcModalParticipant = p;
    this.wcModalSourceKey = sourceKey;
    this.wcModalTargetKey = targetKey;
    this.wcModalDestLabel = targetBucket.label;
    this.wcModalNotes = '';
    this.wcModalTouched = false;
    this.wcModalSaving = false;
    this.wcModalOpen = true;
  }

  closeWcModal() {
    if (this.wcModalSaving) return;
    this.wcModalOpen = false;
    this.wcModalParticipant = null;
    this.wcModalSourceKey = null;
    this.wcModalTargetKey = null;
  }

  wcResolveName(uid: string | undefined): string {
    if (!uid) return 'Unknown';
    return this.profileNameMap[uid] || uid;
  }

  /** Save the note + flip welcomecall on the doc. */
  async submitWcModal() {
    this.wcModalTouched = true;
    const text = this.wcModalNotes.trim();
    if (!text) return;
    const p = this.wcModalParticipant;
    const sourceKey = this.wcModalSourceKey;
    const targetKey = this.wcModalTargetKey;
    if (!p?.pjpDocId || !sourceKey || !targetKey) return;
    const sourceBucket = this.sourceBuckets.find(b => b.key === sourceKey);
    const targetBucket = this.sourceBuckets.find(b => b.key === targetKey);
    if (!sourceBucket || !targetBucket) return;

    this.wcModalSaving = true;
    const newValue = this.isWelcomeCallForward(sourceKey);
    const noteEntry = {
      by: this.starlabsProfileId || '',
      at: new Date(),
      note: text,
      fromStage: sourceBucket.label,
      toStage: targetBucket.label,
    };

    try {
      const ref = doc(this.starlabsFs as any, 'participantjourneyproduct', p.pjpDocId);
      await updateDoc(ref, {
        welcomecall: newValue,
        welcomecallnotes: arrayUnion(noteEntry),
      });
      p.welcomecallnotes = [...(p.welcomecallnotes || []), noteEntry];
      this.snackBar.open(`${p.name} moved to ${targetBucket.label}`, '', { duration: 2000 });
      sourceBucket.participants = sourceBucket.participants.filter(x => x.pjpDocId !== p.pjpDocId);
      targetBucket.participants = [p, ...targetBucket.participants];
      this.wcModalOpen = false;
      this.wcModalParticipant = null;
      this.wcModalSourceKey = null;
      this.wcModalTargetKey = null;
    } catch (err: any) {
      console.error('[onboarding-pipeline] welcome-call save failed:', err);
      this.snackBar.open(err?.message || 'Move failed', 'Close', { duration: 3000 });
    } finally {
      this.wcModalSaving = false;
    }
  }

  /**
   * Opens the same ScheduleDialog the journey-coach dashboard uses, for the
   * onboarding call type. Builds the element payload exactly like the
   * dashboard's openSchedule(row, 'onboarding') does so the dialog behaves
   * identically.
   */
  openScheduleDialog(p: SourceParticipant, event: MouseEvent) {
    event.stopPropagation();
    if (!p?.pjpDocId) return;

    // The journey-coach dialog reads off the raw participantjourneyproduct
    // row, plus a few helper fields tacked on. Mirror that shape.
    const element: any = {
      ...(p.pjpRaw || {}),
      docid: p.pjpDocId,
      profileid: p.profileid,
      name: p.name,
      onboardingscheduled: p.onboardingscheduled ?? null,
      isReschedule: p.onboardingscheduled != null,
      mapProfile: { [p.profileid]: p.name },
      mapJourney: {},
      calltype: 'onboarding',
    };

    const dialogRef = this.dialog.open(ScheduleDialogComponent, {
      data: element,
      autoFocus: false,
      disableClose: true,
      panelClass: 'custom-dialog-container',
      maxHeight: '90vh',
    });

    dialogRef.afterClosed().subscribe(() => {
      // Re-fetch the bucket data so the new onboardingscheduled time appears
      // on the card.
      this.loadSourceBuckets();
    });
  }

  /** Open the inline Add-Lead modal with this participant preselected. */
  addFromSource(p: SourceParticipant, event: MouseEvent) {
    event.stopPropagation();
    this.openAddLeadModal({
      pipelines: this.pipelines.map(pl => ({
        id: pl.id,
        pipelinename: pl.pipelinename,
        dealstage: pl.dealstage,
        dealstageIds: pl.dealstageIds,
      })),
      preselectedProfileId: p.profileid,
      preselectedProfile: {
        id: p.profileid,
        name: p.name,
        email: p.email,
        mobile: p.mobile,
        profileimg: p.image,
      },
    });
  }

  private async loadLeadsForPipeline(pipelineId: string) {
    this.stagesLoading = true;
    try {
      const leadsRef = collection(this.salescrmDb, 'leads');
      // Use ordered + limited fetch, mirror the salescrm main-screen pattern
      const q = query(
        leadsRef,
        where('pipelineid', '==', pipelineId),
        orderBy('lastupdate', 'desc'),
        limit(2000),
      );
      let snap;
      try {
        snap = await getDocs(q);
      } catch (err) {
        // Fallback if no compound index — just filter by pipelineid
        const fallback = query(leadsRef, where('pipelineid', '==', pipelineId), limit(2000));
        snap = await getDocs(fallback);
      }
      const byStage: Record<string, LeadDoc[]> = {};
      this.stages.forEach(s => (byStage[s] = []));
      let total = 0;
      snap.forEach(d => {
        const data = d.data() as any;
        const lead: LeadDoc = { id: d.id, ...data };
        total += 1;
        const status = (data['leadstatus'] || '').toString();
        if (byStage[status]) byStage[status].push(lead);
        else if (this.stages.length === 0) {
          // No stages declared — bucket under '(no stage)'
          byStage['(no stage)'] = byStage['(no stage)'] || [];
          byStage['(no stage)'].push(lead);
        }
      });
      this.leadsByStage = byStage;
      this.totalLeadsInPipeline = total;
    } catch (err) {
      console.error('Lead load failed:', err);
      this.snackBar.open('Failed to load leads for this pipeline.', 'Close', { duration: 3000 });
    } finally {
      this.stagesLoading = false;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────
  stageAccent(index: number): string {
    return this.stageAccents[index % this.stageAccents.length];
  }

  ownerName(uid: string | undefined | null): string {
    if (!uid) return '—';
    return this.ownerNameMap[uid] || uid;
  }

  countFor(stage: string): number {
    return (this.leadsByStage[stage] || []).length;
  }

  initials(name: string | undefined): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  formatDate(ts: any): string {
    const ms = this.toMs(ts);
    if (!ms) return '';
    const d = new Date(ms);
    const now = Date.now();
    const diff = now - ms;
    const dayMs = 86400000;
    if (diff < dayMs && d.getDate() === new Date().getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 7 * dayMs) {
      const days = Math.floor(diff / dayMs);
      return days <= 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private toMs(ts: any): number {
    if (!ts) return 0;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts.seconds) return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    return 0;
  }

  // ─── Dialog ───────────────────────────────────────────────
  openAddPipeline() {
    const ref = this.dialog.open(AddPipelineDialogComponent, {
      width: '70vw',
      maxWidth: '1200px',
      autoFocus: false,
      data: { type: 'add', currentSalescrmUserId: this.salescrmUserId },
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadPipelines();
    });
  }

  openEditPipeline(p: PipelineDoc, event: MouseEvent) {
    event.stopPropagation();
    const ref = this.dialog.open(AddPipelineDialogComponent, {
      width: '70vw',
      maxWidth: '1200px',
      autoFocus: false,
      data: { type: 'edit', pipelineid: p.id, currentSalescrmUserId: this.salescrmUserId },
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadPipelines();
    });
  }

  openAddLead(event?: MouseEvent) {
    if (event) event.stopPropagation();
    if (!this.selectedPipeline) return;
    this.openAddLeadModal({
      pipeline: {
        id: this.selectedPipeline.id,
        pipelinename: this.selectedPipeline.pipelinename,
        dealstage: this.selectedPipeline.dealstage,
        dealstageIds: this.selectedPipeline.dealstageIds,
      },
      defaultStage: this.stages[0],
    });
  }

  // ═══════════════════════════════════════════════════════
  //   ADD-LEAD MODAL (inline overlay)
  // ═══════════════════════════════════════════════════════

  /** Open the inline add-lead modal. Caller specifies which mode to use. */
  private async openAddLeadModal(opts: {
    pipeline?: PipelineRef;
    pipelines?: PipelineRef[];
    defaultStage?: string;
    preselectedProfileId?: string;
    preselectedProfile?: {
      id: string;
      name?: string;
      email?: string;
      mobile?: string;
      profileimg?: string;
      profile?: string;
    };
  }) {
    // Reset modal state
    this.addLeadSaving = false;
    this.addLeadLoading = true;
    this.addLeadSearchQuery = '';
    this.addLeadSelectedProfileId = '';
    this.addLeadProfiles = [];
    this.addLeadDefaultStage = opts.defaultStage || '';

    if (opts.pipeline) {
      this.addLeadPipelineLocked = true;
      this.addLeadSelectedPipeline = opts.pipeline;
      this.addLeadPipelineOptions = [opts.pipeline];
    } else if (opts.pipelines?.length) {
      this.addLeadPipelineLocked = false;
      this.addLeadSelectedPipeline = null;
      this.addLeadPipelineOptions = opts.pipelines;
    } else {
      // Nothing to pick — abort
      return;
    }
    this.applyAddLeadPipeline(this.addLeadSelectedPipeline);

    this.addLeadOpen = true;

    // Preselect path (from source card)
    if (opts.preselectedProfileId) {
      this.addLeadPreselectMode = true;
      // Optimistic snapshot card before fetch
      if (opts.preselectedProfile) {
        this.addLeadProfiles = [{ ...opts.preselectedProfile, id: opts.preselectedProfileId }];
      }
      this.addLeadSelectedProfileId = opts.preselectedProfileId;
      try {
        const snap = await getDoc(doc(this.starlabsFs as any, 'profile_data', opts.preselectedProfileId));
        if (snap.exists()) {
          this.addLeadProfiles = [{ id: snap.id, ...(snap.data() as any) }];
        }
      } catch (err) {
        console.warn('[add-lead] preselect profile_data fetch failed:', err);
      } finally {
        this.addLeadLoading = false;
      }
      return;
    }

    // Full list path (from kanban "+ Add lead")
    this.addLeadPreselectMode = false;
    await this.addLeadLoadProfiles();
  }

  closeAddLeadModal() {
    if (this.addLeadSaving) return;
    this.addLeadOpen = false;
  }

  /** Apply a chosen pipeline → derive stages + auto-select default stage. */
  addLeadSetPipeline(p: PipelineRef) {
    if (this.addLeadSaving || this.addLeadPipelineLocked) return;
    this.addLeadSelectedPipeline = p;
    this.applyAddLeadPipeline(p);
  }

  private applyAddLeadPipeline(p: PipelineRef | null) {
    this.addLeadStagesList = p?.dealstage || [];
    this.addLeadStageIds = p?.dealstageIds || [];
    const initial = this.addLeadDefaultStage || this.addLeadStagesList[0] || '';
    this.addLeadSetStage(initial);
  }

  addLeadSetStage(name: string) {
    this.addLeadSelectedStageName = name;
    const idx = this.addLeadStagesList.indexOf(name);
    this.addLeadSelectedStageId = idx >= 0 ? (this.addLeadStageIds[idx] || '') : '';
  }

  /** Load up to 300 profile_data docs for the search list. */
  private async addLeadLoadProfiles() {
    try {
      const ref = collection(this.starlabsFs as any, 'profile_data');
      const q = query(ref, orderBy('name'), limit(300));
      const snap = await getDocs(q);
      this.addLeadProfiles = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (err: any) {
      console.error('[add-lead] profile_data load failed:', err);
      this.snackBar.open('Failed to load participants: ' + (err?.message || ''), 'Close', { duration: 3500 });
    } finally {
      this.addLeadLoading = false;
    }
  }

  get addLeadFilteredProfiles(): any[] {
    const q = this.addLeadSearchQuery.trim().toLowerCase();
    if (!q) return this.addLeadProfiles;
    return this.addLeadProfiles.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.mobile || '').toString().includes(q)
    );
  }

  get addLeadSelectedProfile(): any | null {
    if (!this.addLeadSelectedProfileId) return null;
    return this.addLeadProfiles.find(p => p.id === this.addLeadSelectedProfileId) || null;
  }

  get addLeadCanAdd(): boolean {
    return !this.addLeadSaving
      && !!this.addLeadSelectedProfileId
      && !!this.addLeadSelectedStageName
      && !!this.addLeadSelectedStageId
      && !!this.addLeadSelectedPipeline?.id;
  }

  addLeadSelectProfile(p: any) {
    if (this.addLeadSaving) return;
    this.addLeadSelectedProfileId = (p?.id || '').toString();
  }

  clearAddLeadSearch() {
    this.addLeadSearchQuery = '';
  }

  /** Write the lead to salescrm; identical shape to the previous dialog. */
  async submitAddLead() {
    if (!this.addLeadCanAdd) return;
    this.addLeadSaving = true;
    try {
      const profile = this.addLeadSelectedProfile;
      if (!profile) throw new Error('No participant selected');
      const profileId = profile.id;

      // Look up the matching salescrm person by profileid (best-effort)
      let person: any = null;
      try {
        const personQ = query(
          collection(this.salescrmDb, 'person'),
          where('profileid', '==', profileId),
          limit(1),
        );
        const personSnap = await getDocs(personQ);
        if (!personSnap.empty) {
          person = { id: personSnap.docs[0].id, ...(personSnap.docs[0].data() as any) };
        }
      } catch (err) {
        console.warn('[add-lead] person lookup failed, falling back to profile_data:', err);
      }

      const base: any = person || profile;
      const personId = person?.id || profileId;
      const newId = doc(collection(this.salescrmDb, 'leads')).id;
      const now = new Date();

      const leadData: any = {
        Id: newId,
        leadid: newId,
        firstId: personId,
        personid: personId,
        name: base.name ?? null,
        firstname: base.firstname ?? null,
        lastname: base.lastname ?? null,
        lowercasename: base.lowercasename ?? null,
        countrycode: base.countrycode ?? null,
        mobile: base.mobile ?? null,
        email: base.email ?? null,
        message: base.message ?? null,
        source: base.source ?? 'journey-experience',
        campaign: base.campaign ?? null,
        datafrom: base.datafrom ?? null,
        referredby: base.referredby ?? null,
        pipelineid: this.addLeadSelectedPipeline!.id,
        leadstatus: this.addLeadSelectedStageName,
        statusid: this.addLeadSelectedStageId,
        leadtimeline: { [this.addLeadSelectedStageId]: now },
        onlyadvance: false,
        createdDate: now,
        lastupdate: now,
        closedDate: null,
        remarks: doc(this.salescrmDb, 'personremarks', personId),
        collectionname: 'leads/',
        presalesowner: 'd8fEvKNI6QSAR7S9H3a7jx4oH792',
        salesowner: null,
      };

      await setDoc(doc(this.salescrmDb, 'leads', newId), leadData);
      this.snackBar.open(
        `${base.name || 'Lead'} added to "${this.addLeadSelectedStageName}".`,
        '', { duration: 2500 }
      );

      // Close modal then refresh kanban if applicable
      this.addLeadOpen = false;
      if (this.selectedPipeline) this.loadLeadsForPipeline(this.selectedPipeline.id);
    } catch (err: any) {
      console.error('[add-lead] save failed:', err);
      this.snackBar.open(err?.message || 'Failed to add lead.', 'Close', { duration: 3500 });
    } finally {
      this.addLeadSaving = false;
    }
  }

  // ─── Lead detail / stage move (inline modal) ─────────────
  openLeadDetail(lead: LeadDoc, stage: string) {
    if (!this.selectedPipeline) return;
    this.leadModalLead = lead;
    this.leadModalStages = this.stages;
    this.leadModalPipelineName = this.selectedPipeline.pipelinename || '';
    this.leadModalOriginalStage = (lead?.leadstatus || '').toString();
    this.leadModalCurrentStage = this.leadModalOriginalStage;
    this.leadModalSavingStage = null;
    this.leadModalAnyChangeMade = false;
    this.leadModalProfileImage = '';
    this.leadModalProfileName = '';
    this.leadModalProfileMobile = '';
    this.leadModalProfileEmail = '';
    this.leadModalCopiedField = null;
    this.leadModalOpen = true;
    // Profile fetch from starlabs profile_data
    this.loadLeadModalProfile();
  }

  closeLeadDetail() {
    const lead = this.leadModalLead;
    const fromStage = this.leadModalOriginalStage;
    const newStage = this.leadModalCurrentStage;
    const changed = this.leadModalAnyChangeMade;
    this.leadModalOpen = false;
    this.leadModalLead = null;
    if (changed && newStage && fromStage !== newStage && lead) {
      this.applyLocalStageMove(lead, fromStage, newStage);
    }
  }

  private async loadLeadModalProfile() {
    const lead = this.leadModalLead;
    if (!lead) return;
    const pid = (lead.personid || lead.profileid || '').toString().trim();
    if (!pid) { this.leadModalProfileLoading = false; return; }
    this.leadModalProfileLoading = true;
    try {
      const ref = doc(this.starlabsFs as any, 'profile_data', pid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d: any = snap.data() || {};
        this.leadModalProfileImage = d['profileimg'] || d['profile'] || '';
        this.leadModalProfileName = d['name'] || d['fullname'] || '';
        this.leadModalProfileMobile = d['mobile'] || d['phone'] || '';
        this.leadModalProfileEmail = d['email'] || '';
      }
    } catch (err) {
      console.warn('[lead-modal] profile_data lookup failed:', err);
    } finally {
      this.leadModalProfileLoading = false;
    }
  }

  // ─── Lead modal display helpers ─────────────────────────
  get leadModalDisplayName(): string {
    const l = this.leadModalLead || {};
    return l.name || this.leadModalProfileName || l.email || '(unnamed lead)';
  }
  get leadModalDisplayEmail(): string {
    return this.leadModalLead?.email || this.leadModalProfileEmail || '';
  }
  get leadModalDisplayMobile(): string {
    return this.leadModalLead?.mobile || this.leadModalProfileMobile || '';
  }

  leadModalIsPast(index: number): boolean {
    const currentIdx = this.leadModalStages.indexOf(this.leadModalCurrentStage);
    if (currentIdx < 0) return false;
    return index < currentIdx;
  }

  get leadModalExtraFields(): { key: string; label: string; value: any }[] {
    const lead = this.leadModalLead;
    if (!lead) return [];
    const out: { key: string; label: string; value: any }[] = [];
    for (const k of Object.keys(lead)) {
      if (this.leadModalExcludedKeys.has(k)) continue;
      const v = lead[k];
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'object' && !this.isFormattableDate(v)) {
        if (Array.isArray(v) && v.every(x => typeof x === 'string' || typeof x === 'number')) {
          out.push({ key: k, label: this.prettyLabel(k), value: v.join(', ') });
        }
        continue;
      }
      out.push({ key: k, label: this.prettyLabel(k), value: this.formatLeadValue(v) });
    }
    return out;
  }

  private prettyLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  private isFormattableDate(v: any): boolean {
    return v && (typeof v.toDate === 'function' || typeof v.seconds === 'number');
  }

  private formatLeadValue(v: any): string {
    if (this.isFormattableDate(v)) return this.formatDate(v);
    return String(v);
  }

  /** One-click stage commit inside the lead modal. */
  async leadModalPickStage(stage: string) {
    if (!stage || !this.leadModalLead) return;
    if (stage === this.leadModalCurrentStage || this.leadModalSavingStage) return;
    if (!this.leadModalLead.id) {
      this.snackBar.open('Lead id missing — cannot save.', 'Close', { duration: 3000 });
      return;
    }
    if (!this.salescrmDb) {
      this.snackBar.open('Salescrm not connected.', 'Close', { duration: 3000 });
      return;
    }
    this.leadModalSavingStage = stage;
    try {
      const ref = doc(this.salescrmDb, 'leads', this.leadModalLead.id);
      await updateDoc(ref, { leadstatus: stage, lastupdate: serverTimestamp() });
      this.leadModalCurrentStage = stage;
      this.leadModalLead.leadstatus = stage;
      this.leadModalLead.lastupdate = new Date();
      this.leadModalAnyChangeMade = true;
      this.snackBar.open(`Moved to "${stage}".`, 'Undo', { duration: 3500 })
        .onAction()
        .subscribe(() => this.leadModalPickStage(this.leadModalOriginalStage));
    } catch (err: any) {
      console.error('[lead-modal] save error:', err);
      this.snackBar.open(err?.message || 'Failed to update lead stage.', 'Close', { duration: 3500 });
    } finally {
      this.leadModalSavingStage = null;
    }
  }

  /** Copy email/phone with visual feedback. */
  async leadModalCopy(value: string, field: 'email' | 'mobile', label: string) {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.leadModalCopiedField = field;
      if (this.leadModalCopyResetTimer) clearTimeout(this.leadModalCopyResetTimer);
      this.leadModalCopyResetTimer = setTimeout(() => (this.leadModalCopiedField = null), 1400);
      this.snackBar.open(`${label} copied`, '', { duration: 1500 });
    } catch (err) {
      console.error('[lead-modal] copy failed:', err);
      this.snackBar.open('Copy failed', 'Close', { duration: 2000 });
    }
  }

  private applyLocalStageMove(lead: LeadDoc, fromStage: string, toStage: string) {
    if (fromStage === toStage) return;
    // Remove from old column
    const oldList = this.leadsByStage[fromStage] || [];
    const idx = oldList.findIndex(l => l.id === lead.id);
    if (idx !== -1) oldList.splice(idx, 1);

    // Update lead's local leadstatus + lastupdate
    lead.leadstatus = toStage;
    lead.lastupdate = new Date();

    // Push into new column (top of list)
    const newList = this.leadsByStage[toStage] || (this.leadsByStage[toStage] = []);
    newList.unshift(lead);
  }
}
