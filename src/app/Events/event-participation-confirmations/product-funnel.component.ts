import { Component, Input, OnInit, TemplateRef, ViewChild } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs,
  doc, writeBatch, serverTimestamp, updateDoc, setDoc
} from '@angular/fire/firestore';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule, MAT_SELECT_CONFIG } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import * as XLSX from 'xlsx';

import { AuthguardService } from '../../authguard.service';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import { BulkAddProductsComponent } from '../../Participants Profile Management/participants-analytics/bulk-add-products/bulk-add-products.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';

type SegmentKey = 'potential' | 'requested' | 'notRequested' | 'eligible' | 'noProduct' | 'inQueue' | 'approved' | 'attended' | 'noShow' | 'unattended' | 'revoked' | 'overallRequested';

interface ImportPreviewRow { name: string; email: string; }
interface Split { key: string; label: string; count: number; }
interface JourneyRow { key: string; label: string; total: number; first: number; repeat: number; members?: string[]; isGroup?: boolean; }

interface PRow {
  profileid: string;
  name: string;
  email: string;
  photo: string;
  participantproductid: string | null;
  approvedRequestId: string | null;
  requestData: any | null;
  isOwner: boolean;
  isRequested: boolean;
  isApproved: boolean;
  isEligible: boolean;
  isNoProduct: boolean;
  isInQueueReq: boolean;
  isNotRequested: boolean;
  isUnattended: boolean;
  isRevoked: boolean;
  inQueue: boolean;
  attended: boolean;
  scanned: boolean;
  attendanceState: string;
  revokedBy: string;      // resolved display name (or raw profile id) of who revoked
  revokedDate: number;    // millis
  reason: string;
  requestedDate: number;
  journey: string;
  subEnd: number;
  subActive: boolean;
  finance: string;
  phone: string;
  purchaseValue: number | null;
  paid: number | null;
  customerStatus: string;
  completedProduct?: boolean;   // this product's id is in the participant's consumedproducts → "repeat"
  metaLoaded: boolean;
  subLoaded: boolean;
  metaError: boolean;
}

@Component({
  selector: 'app-product-funnel',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatTooltipModule, MatCheckboxModule, MatPaginatorModule,
    MatProgressBarModule, MatDialogModule, MatMenuModule,
    ProfilePictureComponent
  ],
  providers: [
    { provide: MAT_SELECT_CONFIG, useValue: { overlayPanelClass: 'sx-select-pane' } },
    { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 4000, panelClass: 'sx-snack' } },
    MatSnackBar
  ],
  templateUrl: './product-funnel.component.html',
  styleUrl: './product-funnel.component.css'
})
export class ProductFunnelComponent implements OnInit {

  @Input() arena: any;
  @Input() eventName = '';
  @Input() eventEnd = 0;

  @ViewChild('confirmTpl') confirmTpl!: TemplateRef<any>;
  @ViewChild('progressTpl') progressTpl!: TemplateRef<any>;
  @ViewChild('failuresTpl') failuresTpl!: TemplateRef<any>;

  readonly INITIATE_CHUNK_SIZE = 20;
  readonly INITIATE_CHUNK_DELAY_MS = 5000;
  readonly financeOptions = [
    { value: 'all', label: 'All finance' },
    { value: 'locked', label: 'Locked' },
    { value: 'defaulted', label: 'Defaulted' },
    { value: 'regular', label: 'Regular' },
    { value: 'fully paid', label: 'Fully paid' }
  ];

  readonly cards: { key: SegmentKey; label: string; cls: string; desc: string; tip?: string }[] = [
    { key: 'potential', label: 'Potential', cls: '', desc: 'hold the product', tip: 'Everyone in the system who holds this product, across all events' },
    { key: 'requested', label: 'Requested', cls: '', desc: 'said yes' },
    { key: 'notRequested', label: 'Not requested', cls: '', desc: 'owners, no request', tip: 'Hold the product but have not requested' },
    { key: 'eligible', label: 'Eligible', cls: 'elig', desc: 'ready to approve' },
    { key: 'noProduct', label: 'No product', cls: 'ne', desc: 'requested, needs product', tip: 'Requested but does not hold the product — assign it to revive them' },
    { key: 'inQueue', label: 'In queue', cls: 'inq', desc: 'already in a queue', tip: 'Requested but already in an active queue — already being served, no action needed' },
    { key: 'approved', label: 'Approved', cls: 'app', desc: 'initiated' },
    { key: 'attended', label: 'Attended', cls: 'att', desc: 'scanned or marked', tip: 'Of the approved, how many attended (scanned or marked)' },
    { key: 'noShow', label: 'No-show', cls: 'ns', desc: 'did not attend', tip: 'Approved but did not attend — set when you finalize attendance after the event. Product is kept.' },
    { key: 'unattended', label: 'Unattended', cls: 'un', desc: 'cancelled — product pulled', tip: 'Manually marked not attended during the event — the product is cancelled (status “unattended”).' },
    { key: 'revoked', label: 'Revoked', cls: 'rv', desc: 'cancelled — product pulled', tip: 'Manually revoked — the product is cancelled and the event profile removed (status “revoked”).' }
  ];

  // Card lookup + a grouped breakdown tree (depth = indentation; bar = share of the group total).
  readonly cardMap = this.cards.reduce((m, c) => (m[c.key] = c, m),
    {} as Record<SegmentKey, (typeof this.cards)[number]>);
  readonly funnelTree: { about: string; total: SegmentKey; rows: { key: SegmentKey; depth: number }[] }[] = [
    {
      about: 'Owners not yet initiated — your approval pool', total: 'potential', rows: [
        { key: 'potential', depth: 0 },
        { key: 'requested', depth: 1 },
        { key: 'eligible', depth: 2 },
        { key: 'noProduct', depth: 2 },
        { key: 'inQueue', depth: 2 },
        { key: 'notRequested', depth: 1 }
      ]
    },
    {
      about: 'Attendance outcome of the approved', total: 'approved', rows: [
        { key: 'approved', depth: 0 },
        { key: 'attended', depth: 1 },
        { key: 'noShow', depth: 1 },
        { key: 'unattended', depth: 1 },
        { key: 'revoked', depth: 1 }
      ]
    }
  ];
  // Share of a row within its panel total, for the proportion bar + percent label.
  barPct(key: SegmentKey, total: SegmentKey): number {
    const t = this.counts[total] || 0;
    return t ? Math.min(100, Math.round((this.counts[key] / t) * 100)) : 0;
  }

  // Per-segment breakdown by the actual customerstatus values found (only non-zero buckets).
  statusSplits: Record<SegmentKey, Split[]> = {} as Record<SegmentKey, Split[]>;
  customerStatusList: { key: string; label: string }[] = [];   // distinct statuses, for the filter
  splitsReady = false;
  // Loads customerstatus for every row in the background, then computes the breakdown.
  private async loadSplits() {
    try {
      await this.loadMeta(this.rows);
      this.computeSplits(this.rows);
      this.splitsReady = true;
    } catch (e) { console.log('split load failed', e); }
  }
  // Group key (merges case/spacing) and display label for a raw customerstatus value.
  statusKey(s: string): string { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'notset'; }
  private statusLabel(s: string): string { return (s || '').trim() || 'Not set'; }
  // Per-segment customerstatus counts (only non-zero buckets), shown inline in the summary.
  statusSplit(key: SegmentKey): Split[] { return this.statusSplits[key] ?? []; }
  private readonly statusColors: Record<string, string> = {
    active: '#1f8a3b', nonactive: '#c25e00', discontinued: '#d70015', notset: '#8e8e93'
  };
  private readonly statusPalette = ['#534ab7', '#1d9e75', '#d4537e', '#854f0b', '#185fa5', '#993556'];
  statusColor(key: string): string {
    if (this.statusColors[key]) return this.statusColors[key];
    const idx = this.customerStatusList.findIndex(s => s.key === key);
    return this.statusPalette[(idx >= 0 ? idx : 0) % this.statusPalette.length];
  }
  private computeSplits(rows: PRow[]): void {
    const keys: SegmentKey[] = ['potential', 'requested', 'notRequested', 'eligible', 'noProduct', 'inQueue', 'approved', 'attended', 'noShow', 'unattended', 'revoked'];
    const out = {} as Record<SegmentKey, Split[]>;
    const allStatuses = new Map<string, string>();
    for (const k of keys) {
      const inSeg = rows.filter(r => this.matchesSegment(r, k));
      const m = new Map<string, Split>();
      for (const r of inSeg) {
        const gk = this.statusKey(r.customerStatus);
        const label = this.statusLabel(r.customerStatus);
        allStatuses.set(gk, label);
        const e = m.get(gk) ?? { key: gk, label, count: 0 };
        e.count++; m.set(gk, e);
      }
      out[k] = [...m.values()].filter(e => e.count > 0).sort((a, b) => b.count - a.count);
    }
    this.statusSplits = out;
    this.customerStatusList = [...allStatuses.entries()].map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Approved cohort by journey, each split into first-timer vs repeat (for the cross-tab card).
    const jm = new Map<string, JourneyRow>();
    for (const r of rows) {
      if (!r.isApproved) continue;
      const label = (r.journey || '').trim() || 'Not set';
      const e = jm.get(label) ?? { key: label, label, total: 0, first: 0, repeat: 0 };
      e.total++;
      if (r.completedProduct) e.repeat++; else e.first++;
      jm.set(label, e);
    }
    this.approvedByJourney = [...jm.values()].sort((a, b) => b.total - a.total);
    this.rebuildDisplayedJourneys();
  }

  mapProfile: Record<string, any> = {};
  mapEmailData: Record<string, any> = {};
  mapProduct: Record<string, string> = {};
  mapJourney: Record<string, string> = {};

  deliverySetList: any[] = [];
  selectedDeliverySet: string | null = null;
  queueVariationList: any[] = [];
  mapQueueVariation: Record<string, string> = {};
  selectedQueueVariation: string | null = null;

  rows: PRow[] = [];
  segment: SegmentKey = 'eligible';
  searchText = '';
  financeFilter = 'all';
  // Customer-status filter (clicking the Active / Non-Active / Discontinued chips below Potential, or the dropdown).
  customerFilter = 'all';   // 'all' or a key from customerFilterOptions
  readonly customerFilterOptions = [
    { key: 'active', label: 'Active' },
    { key: 'nonactive', label: 'Non active' },
    { key: 'discontinued', label: 'Discontinued' }
  ];
  selection = new SelectionModel<PRow>(true, []);

  counts: Record<SegmentKey, number> = {
    potential: 0, requested: 0, notRequested: 0, eligible: 0, noProduct: 0, inQueue: 0, approved: 0, attended: 0, noShow: 0, unattended: 0, revoked: 0, overallRequested: 0
  };

  // Everyone who ever raised their hand for this event — including the terminal outcomes
  // (unattended / revoked), who were approved once and then had their product cancelled.
  // `requested` excludes the approved cohort, and terminal rows are excluded from both
  // (see loadData), so these four buckets are disjoint — no double-count.
  get overallRequested(): number {
    return this.counts.requested + this.counts.approved + this.counts.unattended + this.counts.revoked;
  }

  // Customer-status split of the Potential pool (Active / Non-Active / Discontinued), shown as
  // clickable chips below the Potential card. Counts come from the precomputed statusSplits.
  potentialStatusCount(key: string): number {
    return (this.statusSplits['potential'] ?? []).find(s => s.key === key)?.count ?? 0;
  }
  // Click a chip: jump to Potential and toggle that customer-status filter.
  setCustomerChip(key: string): void {
    this.segment = 'potential';
    this.customerFilter = this.customerFilter === key ? 'all' : key;
    this.pageIndex = 0;
    this.defaultSelection();
    this.refreshMeta();
  }

  // Approved cohort broken down by journey, each split into first-timer vs repeat — for the
  // "Approved by journey" cross-tab card (computed in computeSplits once journeys are loaded).
  // Repeat = this product's id is in the participant's `consumedproducts` (participant metadata),
  // captured per-row as PRow.completedProduct during loadMeta.
  approvedByJourney: JourneyRow[] = [];
  journeyFilter = 'all';   // 'all', a journey label, or a group key ('grp:<name>')
  journeyFilterMembers = new Set<string>();  // journey labels the current filter covers (union for groups)
  frFilter = 'all';        // 'all' | 'first' | 'repeat'
  // Persisted per-event grouping: journey label → group name. Stored in localStorage keyed by arenaevent id.
  journeyGroups: Record<string, string> = {};
  groupEditMode = false;
  journeySel = new Set<string>();   // journeys ticked in edit mode, waiting to be grouped
  groupNameInput = '';              // name to apply when grouping the current selection
  private readonly journeyPalette = ['#1f8a3b', '#0060df', '#534ab7', '#c25e00', '#0f6e56', '#d4537e', '#185fa5'];
  journeyColor(key: string): string {
    const i = this.displayedJourneys.findIndex(j => j.key === key);
    return this.journeyPalette[(i < 0 ? 0 : i) % this.journeyPalette.length];
  }

  private journeyGroupsKey(): string { return 'epc_journey_groups_' + (this.arena?.['docid'] ?? 'unknown'); }
  private loadJourneyGroups(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(this.journeyGroupsKey());
      this.journeyGroups = raw ? (JSON.parse(raw) || {}) : {};
    } catch { this.journeyGroups = {}; }
    this.rebuildDisplayedJourneys();
  }
  private saveJourneyGroups(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(this.journeyGroupsKey(), JSON.stringify(this.journeyGroups));
    } catch { /* storage unavailable — grouping just won't persist */ }
    this.rebuildDisplayedJourneys();
  }
  toggleGroupEdit(): void {
    this.groupEditMode = !this.groupEditMode;
    this.journeySel = new Set();   // clear any pending selection when entering/leaving edit mode
    this.groupNameInput = '';
  }
  // Distinct group names already in use, for the datalist / add-to-existing.
  get existingGroupNames(): string[] {
    return [...new Set(Object.values(this.journeyGroups).map(g => (g || '').trim()).filter(Boolean))].sort();
  }
  isJourneySel(label: string): boolean { return this.journeySel.has(label); }
  toggleJourneySel(label: string): void {
    if (this.journeySel.has(label)) this.journeySel.delete(label); else this.journeySel.add(label);
  }
  // Group the ticked journeys under the typed name (creates the group or adds to an existing one). Persists.
  groupSelected(): void {
    const name = (this.groupNameInput || '').trim();
    if (!name || !this.journeySel.size) return;
    this.journeySel.forEach(label => { this.journeyGroups[label] = name; });
    this.saveJourneyGroups();
    this.journeySel = new Set();
    this.groupNameInput = '';
  }
  // Remove the ticked journeys from whatever group they're in. Persists.
  ungroupSelected(): void {
    if (!this.journeySel.size) return;
    this.journeySel.forEach(label => { delete this.journeyGroups[label]; });
    this.saveJourneyGroups();
    this.journeySel = new Set();
  }
  // Disband a whole group (all its journeys become ungrouped). Persists.
  ungroupGroup(groupName: string): void {
    Object.keys(this.journeyGroups).forEach(label => { if (this.journeyGroups[label] === groupName) delete this.journeyGroups[label]; });
    this.saveJourneyGroups();
  }

  // The rows actually shown in the card: journeys sharing a group name collapse into one aggregated
  // row (summing total/first/repeat, members = the grouped journey labels); ungrouped journeys stay as-is.
  //
  // This MUST be a cached field, not a getter. As a getter it returned fresh objects on every change
  // detection pass, so *ngFor (identity tracking) destroyed and rebuilt every row continuously — a real
  // mouse click then never fired, because mousedown and mouseup landed on different DOM nodes.
  // Rebuilt only when the journeys or the grouping actually change. trackBy below is a second guard.
  displayedJourneys: JourneyRow[] = [];
  private rebuildDisplayedJourneys(): void {
    const groups = new Map<string, JourneyRow>();
    const singles: JourneyRow[] = [];
    for (const j of this.approvedByJourney) {
      const g = (this.journeyGroups[j.label] || '').trim();
      if (!g) { singles.push({ ...j, members: [j.label] }); continue; }
      const key = 'grp:' + g;
      const e = groups.get(key) ?? { key, label: g, total: 0, first: 0, repeat: 0, members: [], isGroup: true };
      e.total += j.total; e.first += j.first; e.repeat += j.repeat; e.members!.push(j.label);
      groups.set(key, e);
    }
    this.displayedJourneys = [...groups.values(), ...singles].sort((a, b) => b.total - a.total);
  }
  trackJourneyKey = (_: number, j: JourneyRow) => j.key;
  trackBreakdown = (_: number, b: { journey: string }) => b.journey;
  trackParticipant = (_: number, p: PRow) => p.profileid;

  // Participants for a journey/group are shown in a mat-menu overlay (see the card template),
  // so the card itself stays compact regardless of how many people are in a group.
  private journeyLabelOf(r: PRow): string { return (r.journey || '').trim() || 'Not set'; }
  // The approved participants whose journey falls inside this group, sorted by name.
  groupParticipants(row: JourneyRow): PRow[] {
    const members = new Set(row.members ?? [row.label]);
    return this.rows
      .filter(r => r.isApproved && members.has(this.journeyLabelOf(r)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  // Which journeys are inside this group, and who is approved under each — powers the overlay panels.
  // Every member journey is listed even if it currently has no matching participants.
  // `fr` narrows to first-timers ('first') or repeats ('repeat'); 'all' is the whole approved cohort.
  groupJourneyBreakdown(row: JourneyRow, fr: 'all' | 'first' | 'repeat' = 'all'): { journey: string; participants: PRow[] }[] {
    const members = row.members ?? [row.label];
    const byJourney = new Map<string, PRow[]>();
    members.forEach(m => byJourney.set(m, []));
    for (const r of this.rows) {
      if (!r.isApproved) continue;
      const isRepeat = !!r.completedProduct;
      if (fr === 'first' && isRepeat) continue;
      if (fr === 'repeat' && !isRepeat) continue;
      const lbl = this.journeyLabelOf(r);
      if (byJourney.has(lbl)) byJourney.get(lbl)!.push(r);
    }
    return [...members].sort((a, b) => a.localeCompare(b)).map(m => ({
      journey: m,
      participants: (byJourney.get(m) ?? []).sort((a, b) => a.name.localeCompare(b.name))
    }));
  }

  // Click a journey/group row → filter the table to the union of its journeys (clears the first/repeat sub-filter).
  // The participant list lives in the overlay opened by the people icon, not here.
  setJourneyChip(row: JourneyRow): void {
    this.segment = 'approved';
    const same = this.journeyFilter === row.key && this.frFilter === 'all';
    this.journeyFilter = same ? 'all' : row.key;
    this.journeyFilterMembers = same ? new Set() : new Set(row.members ?? [row.label]);
    this.frFilter = 'all';
    this.pageIndex = 0;
    this.defaultSelection();
    this.refreshMeta();
  }
  // Click a first-timer/repeat pill under a journey/group → filter to that union ∩ that group (toggles off if repeated).
  setJourneyFr(row: JourneyRow, frKey: string): void {
    this.segment = 'approved';
    const same = this.journeyFilter === row.key && this.frFilter === frKey;
    this.journeyFilter = same ? 'all' : row.key;
    this.journeyFilterMembers = same ? new Set() : new Set(row.members ?? [row.label]);
    this.frFilter = same ? 'all' : frKey;
    this.pageIndex = 0;
    this.defaultSelection();
    this.refreshMeta();
  }
  private journeyMatches(r: PRow): boolean {
    if (this.journeyFilter === 'all') return true;
    return this.journeyFilterMembers.has((r.journey || '').trim() || 'Not set');
  }
  private frMatches(r: PRow): boolean {
    if (this.frFilter === 'all') return true;
    const isRepeat = !!r.completedProduct;
    return this.frFilter === 'repeat' ? isRepeat : !isRepeat;
  }

  // Post-approval checks (Queue stage) — shown only on the approved cohort.
  queueStageByPid = new Map<string, string>();          // queue_token.currentstage per participant (queue events)
  queueStagesLoaded = false;
  private queueStagesLoading = false;

  // owner email → row, and active-queue profile ids — used by bulk import categorisation
  private ownerByEmail = new Map<string, PRow>();
  private activeProfileIds = new Set<string>();
  importPreview: { total: number; willAdd: ImportPreviewRow[]; inQueue: ImportPreviewRow[]; noProduct: ImportPreviewRow[] } | null = null;
  importExpand = { willAdd: false, inQueue: false, noProduct: false };
  private pendingImportRows: PRow[] = [];

  pageSize = 10;
  pageIndex = 0;
  loading = true;
  loadError = false;

  // progress dialog state
  progress = { msg: '', value: 0, total: 0, eta: '' };

  constructor(
    public firestore: Firestore,
    public guard: AuthguardService,
    public dialog: MatDialog,
    public snackbar: MatSnackBar,
    public storage: Storage,
    public http: HttpClient
  ) {}

  async ngOnInit() {
    const profile = await this.guard.getProfileMap();
    this.mapProfile = profile.docdata;
    this.mapEmailData = profile.mapEmailData;
    this.mapProduct = await this.guard.getProductMap();
    this.mapJourney = await this.guard.getJourneyMap();
    await this.loadData();
  }

  get productName() { return this.mapProduct[this.arena?.['productref']?.id] ?? 'Product'; }

  initials(name: string): string {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  }

  async loadData() {
    this.loading = true;
    this.loadError = false;
    this.splitsReady = false;
    this.queueStageByPid = new Map<string, string>();
    this.queueStagesLoaded = false;
    const arena = this.arena;
    this.loadJourneyGroups();   // per-event journey grouping from localStorage (keyed by arenaevent id)
    try {
      const [ownSnap, eprSnap, scanSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'participantsproduct'),
          where('productref', '==', arena['productref']), where('status', '==', null))),
        getDocs(query(collection(this.firestore, 'event participation request'),
          where('arenaeventid', '==', arena['docid']),
          where('status', 'in', ['requested', 'approved', 'attended', 'unattended', 'revoked']))),
        getDocs(query(collection(this.firestore, 'arena e-ticket log'),
          where('eventref', '==', arena['eventref'])))
      ]);

      const owners = new Map<string, string>();
      ownSnap.docs.forEach(d => {
        const x = d.data();
        if (x['profileid'] && !owners.has(x['profileid'])) owners.set(x['profileid'], x['docid'] ?? d.id);
      });

      const requestedData = new Map<string, any>();
      const approvedReq = new Map<string, string>();
      const attendedIds = new Set<string>();
      const unattendedIds = new Set<string>();
      const revokedIds = new Set<string>();
      const revokedByPid = new Map<string, string>();
      const revokedDatePid = new Map<string, number>();
      const attendanceStateByPid = new Map<string, string>();
      const bucketByPid = new Map<string, string>();
      const reqDateByPid = new Map<string, number>();
      eprSnap.docs.forEach(d => {
        const x = d.data();
        const pid = x['profileid'];
        if (!pid) return;
        const created = this.toMillis(x['doccreateddate']);
        if (created) reqDateByPid.set(pid, created);
        if (x['status'] == 'approved') { approvedReq.set(pid, x['docid'] ?? d.id); attendanceStateByPid.set(pid, x['attendance_state'] ?? ''); }
        else if (x['status'] == 'attended') { attendedIds.add(pid); approvedReq.set(pid, x['docid'] ?? d.id); attendanceStateByPid.set(pid, x['attendance_state'] ?? 'attended'); }
        else if (x['status'] == 'unattended') { unattendedIds.add(pid); attendanceStateByPid.set(pid, 'unattended'); }
        else if (x['status'] == 'revoked') {
          revokedIds.add(pid); attendanceStateByPid.set(pid, 'revoked');
          if (x['revoked_by']) revokedByPid.set(pid, x['revoked_by']);
          const rd = this.toMillis(x['revoked_date']); if (rd) revokedDatePid.set(pid, rd);
        }
        else if (x['status'] == 'requested') { requestedData.set(pid, { ...x, docid: x['docid'] ?? d.id }); if (x['epc_bucket']) bucketByPid.set(pid, x['epc_bucket']); }
      });
      // Unattended and revoked participants are terminal (product cancelled) — they never belong to any live bucket.
      unattendedIds.forEach(p => requestedData.delete(p));
      revokedIds.forEach(p => requestedData.delete(p));

      // Eligibility buckets are precomputed by the rollup (epc_bucket on each requested doc).
      // When every requested participant carries one, use them and SKIP the queue_token scan;
      // otherwise fall back to reading active tokens and computing the split live.
      const useBuckets = requestedData.size > 0 && [...requestedData.keys()].every(pid => bucketByPid.has(pid));
      const active = new Set<string>();
      if (!useBuckets) {
        const tokSnap = await getDocs(query(collection(this.firestore, 'queue_token'),
          where('queueref', '==', arena['eventref'])));
        tokSnap.docs.forEach(d => {
          const x = d.data();
          if ((x['tokenstatus'] ?? '').toString().toLowerCase() == 'active' && x['profile_id']) active.add(x['profile_id']);
        });
      }

      const scanned = new Set<string>();
      scanSnap.docs.forEach(d => { const x = d.data(); if (x['profileid']) scanned.add(x['profileid']); });

      // Approved cohort = EPR approved/attended OR physically scanned (a scan means they were ticketed).
      // Cohort members are not "requested", so attended is always a subset of approved.
      const cohort = new Set<string>([...approvedReq.keys(), ...scanned]);
      cohort.forEach(p => requestedData.delete(p));

      // Unattended/revoked are terminal — drop them from the live cohort/owner sets so they only show in their terminal segment.
      // `cohort` must lose them too: someone scanned at the event and revoked afterwards would otherwise be counted
      // in BOTH `approved` (cohort.size) and `revoked`, double-counting them in `overallRequested`.
      unattendedIds.forEach(p => { approvedReq.delete(p); attendedIds.delete(p); cohort.delete(p); });
      revokedIds.forEach(p => { approvedReq.delete(p); attendedIds.delete(p); cohort.delete(p); });

      const ids = new Set<string>([...owners.keys(), ...requestedData.keys(), ...cohort, ...unattendedIds, ...revokedIds]);
      const rows: PRow[] = [];
      ids.forEach(pid => {
        const prof = this.mapProfile[pid] ?? {};
        const isUnattended = unattendedIds.has(pid);
        const isRevoked = revokedIds.has(pid);
        const isTerminal = isUnattended || isRevoked;
        const isOwner = !isTerminal && owners.has(pid);
        const isScanned = !isTerminal && scanned.has(pid);
        const isAttended = !isTerminal && (attendedIds.has(pid) || isScanned);
        const inCohort = !isTerminal && (approvedReq.has(pid) || isScanned);
        const isRequested = !isTerminal && requestedData.has(pid);
        const bucket = useBuckets ? bucketByPid.get(pid) : undefined;
        const inQueue = bucket ? (bucket === 'inQueue') : active.has(pid);
        const isEligible = isTerminal ? false : (bucket ? (bucket === 'eligible') : (isRequested && isOwner && !inQueue));
        const isNoProduct = isTerminal ? false : (bucket ? (bucket === 'noProduct') : (isRequested && !isOwner));
        const isInQueueReq = isTerminal ? false : (bucket ? (bucket === 'inQueue') : (isRequested && isOwner && inQueue));
        const isNotRequested = !isTerminal && isOwner && !isRequested && !inCohort;
        const reason = isNoProduct ? 'No product' : (isInQueueReq ? 'In active queue' : (isUnattended ? 'Product cancelled' : (isRevoked ? 'Revoked — product cancelled' : '')));
        rows.push({
          profileid: pid,
          name: prof['name'] ?? 'Unknown',
          email: prof['email'] ?? '',
          photo: prof['profile'] ?? prof['photoURL'] ?? '',
          participantproductid: owners.get(pid) ?? null,
          approvedRequestId: approvedReq.get(pid) ?? null,
          requestData: requestedData.get(pid) ?? null,
          isOwner, isRequested, isApproved: inCohort,
          isEligible, isNoProduct, isInQueueReq, isNotRequested, isUnattended, isRevoked, inQueue,
          attended: isAttended,
          scanned: isScanned,
          attendanceState: attendanceStateByPid.get(pid) ?? '',
          revokedBy: (() => { const rb = revokedByPid.get(pid); return rb ? (this.mapProfile[rb]?.['name'] ?? rb) : ''; })(),
          revokedDate: revokedDatePid.get(pid) ?? 0,
          reason,
          requestedDate: reqDateByPid.get(pid) ?? 0,
          journey: '', subEnd: 0, subActive: false, finance: '',
          phone: prof['number'] ?? prof['phone'] ?? '',
          purchaseValue: null, paid: null, customerStatus: '',
          metaLoaded: false, subLoaded: false, metaError: false
        });
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      this.rows = rows;

      // Indexes for bulk import categorisation.
      this.ownerByEmail = new Map<string, PRow>();
      rows.forEach(r => { if (r.isOwner && r.email) this.ownerByEmail.set(r.email.trim().toLowerCase(), r); });
      this.activeProfileIds = active;

      this.counts = {
        potential: owners.size,
        requested: requestedData.size,
        notRequested: [...owners.keys()].filter(o => !requestedData.has(o) && !cohort.has(o)
          && !unattendedIds.has(o) && !revokedIds.has(o)).length,
        eligible: rows.filter(r => r.isEligible).length,
        noProduct: rows.filter(r => r.isNoProduct).length,
        inQueue: rows.filter(r => r.isInQueueReq).length,
        approved: cohort.size,
        attended: rows.filter(r => r.attended).length,
        noShow: rows.filter(r => r.attendanceState === 'no_show').length,
        unattended: rows.filter(r => r.isUnattended).length,
        revoked: rows.filter(r => r.isRevoked).length,
        overallRequested: requestedData.size + cohort.size + unattendedIds.size + revokedIds.size
      };

      this.deliverySetList = await this.loadDeliverySets(arena);
      await this.loadVariations(arena);

      this.defaultSelection();
      this.refreshMeta();
      // Splits need customerstatus for ALL rows — load it in the background so the screen shows immediately.
      this.loadSplits();
    } catch (err) {
      console.log('confirmations load failed', err);
      this.loadError = true;
      this.snackbar.open('Could not load participants', 'OK', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  retry() { this.loadData(); }

  private async loadDeliverySets(arena: any): Promise<any[]> {
    const snap = await getDocs(query(collection(this.firestore, 'productToDeliverySequence'),
      where('product', '==', arena['productref'])));
    return snap.docs.length ? (snap.docs[0].data()['deliveryoptions'] ?? []) : [];
  }

  private async loadVariations(arena: any) {
    this.queueVariationList = [];
    this.mapQueueVariation = {};
    if (arena['type'] != 'queue') return;
    const snap = await getDocs(query(collection(this.firestore, 'queue variation'),
      where('queueref', '==', arena['eventref'])));
    snap.docs.forEach(d => {
      this.mapQueueVariation[d.id] = d.data()['variationname'];
      this.queueVariationList.push({ id: d.id, data: d.data() });
    });
  }

  // Core metadata (name, number, finance, customerstatus…). Chunked by 30 (Firestore `in` max), concurrent.
  // Does NOT touch PJP — subscriptionend is loaded separately + lazily so big events stay fast.
  private async loadMeta(rows: PRow[]) {
    const pending = rows.filter(r => !r.metaLoaded);
    if (pending.length === 0) return;
    const productId = this.arena?.['productref']?.id;   // for the consumedproducts "repeat" check
    const byId = new Map<string, PRow>();
    pending.forEach(r => byId.set(r.profileid, r));
    const ids = [...byId.keys()];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    await Promise.all(chunks.map(async chunk => {
      try {
        const snap = await getDocs(query(collection(this.firestore, 'participant metadata'), where('profileid', 'in', chunk)));
        const metaById: Record<string, any> = {};
        snap.docs.forEach(d => { const x = d.data(); if (x['profileid']) metaById[x['profileid']] = x; });
        chunk.forEach(pid => {
          const row = byId.get(pid);
          if (!row) return;
          const m = metaById[pid] ?? {};
          // Current journey depends on customer status: active → activejourney,
          // non active → lastcompletedjourney, otherwise → lastsubscribedjourney.
          const cs = (m['customerstatus'] ?? '').toString().trim().toLowerCase();
          const journeyId = cs === 'active' ? m['activejourney']
            : cs === 'non active' ? m['lastcompletedjourney']
            : m['lastsubscribedjourney'];
          row.journey = this.mapJourney[journeyId] ?? '';
          row.finance = m['financialstatus'] ?? '';
          row.purchaseValue = m['pp_totalpurchasevalue'] ?? null;
          row.paid = m['pp_totalpaid'] ?? null;
          row.customerStatus = m['customerstatus'] ?? '';
          // "Repeat" = this product is already in the participant's consumedproducts (product ids).
          row.completedProduct = !!productId && Array.isArray(m['consumedproducts'])
            && m['consumedproducts'].some((p: any) => String(p) === String(productId));
          // Name + number come from participant metadata (profile_data value stays only as fallback).
          if (m['name']) row.name = m['name'];
          const metaNum = m['phonenumber'] ?? m['number'];
          if (metaNum !== undefined && metaNum !== null && metaNum !== '') row.phone = metaNum.toString();
          row.metaLoaded = true;
        });
      } catch (e) {
        console.log('meta load failed', e);
        chunk.forEach(pid => { const row = byId.get(pid); if (row) { row.metaError = true; row.metaLoaded = true; } });
      }
    }));
  }

  // subscriptionend from the PJP collection — loaded lazily (only for the rows on screen / being exported).
  private async loadSubscriptions(rows: PRow[]) {
    const pending = rows.filter(r => !r.subLoaded);
    if (pending.length === 0) return;
    const byId = new Map<string, PRow>();
    pending.forEach(r => byId.set(r.profileid, r));
    const ids = [...byId.keys()];
    const now = Date.now();
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    await Promise.all(chunks.map(async chunk => {
      try {
        const snap = await getDocs(query(collection(this.firestore, 'participantjourneyproduct'), where('profileid', 'in', chunk)));
        const subByPid: Record<string, number> = {};
        snap.docs.forEach(d => {
          const x = d.data(); const pid = x['profileid']; if (!pid) return;
          const ms = this.toMillis(x['subscriptionend']);
          if (ms && (!subByPid[pid] || ms > subByPid[pid])) subByPid[pid] = ms;
        });
        chunk.forEach(pid => {
          const row = byId.get(pid);
          if (!row) return;
          row.subEnd = subByPid[pid] ?? 0;
          row.subActive = row.subEnd ? row.subEnd >= now : false;
          row.subLoaded = true;
        });
      } catch (e) {
        console.log('subscription load failed', e);
        chunk.forEach(pid => { const row = byId.get(pid); if (row) row.subLoaded = true; });
      }
    }));
  }

  private refreshMeta() {
    this.loadMeta(this.pagedRows);
    this.loadSubscriptions(this.pagedRows);   // PJP only for the visible page
    // Finance + customer + journey filters depend on metadata, so load it for the whole segment when any is active.
    if (this.financeFilter !== 'all' || this.customerFilter !== 'all' || this.journeyFilter !== 'all') this.loadMeta(this.segmentMembers());
  }

  // ---- Segments ----
  setSegment(s: SegmentKey) {
    this.segment = s;
    this.journeyFilter = 'all';   // the journey filter is scoped to the Approved-by-journey card; clear it on navigation
    this.journeyFilterMembers = new Set();
    this.frFilter = 'all';        // same for the first-timer/repeat filter
    this.pageIndex = 0;
    this.defaultSelection();
    this.refreshMeta();
    if (this.showApprovalChecks) this.ensureQueueStages();
  }

  // ---- Post-approval checks (Queue stage) ----
  get showApprovalChecks(): boolean {
    return this.segment === 'approved' || this.segment === 'attended' || this.segment === 'noShow';
  }
  get colSpan(): number {
    return (this.showSelect ? 1 : 0) + 8 + (this.showApprovalChecks ? 1 : 0);
  }
  // Lazily load queue_token.currentstage for the whole event once (queue events only).
  async ensureQueueStages() {
    if (this.queueStagesLoaded || this.queueStagesLoading || this.arena?.['type'] !== 'queue') return;
    this.queueStagesLoading = true;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'queue_token'),
        where('queueref', '==', this.arena['eventref'])));
      snap.docs.forEach(d => { const x = d.data(); if (x['profile_id'] && x['currentstage']) this.queueStageByPid.set(x['profile_id'], x['currentstage']); });
      this.queueStagesLoaded = true;
    } catch (e) {
      console.log('queue stage load failed', e);
    } finally {
      this.queueStagesLoading = false;
    }
  }
  private inSegment(r: PRow): boolean { return this.matchesSegment(r, this.segment); }

  private matchesSegment(r: PRow, key: SegmentKey): boolean {
    switch (key) {
      case 'potential': return r.isOwner;
      case 'requested': return r.isRequested;
      case 'notRequested': return r.isNotRequested;
      case 'eligible': return r.isEligible;
      case 'noProduct': return r.isNoProduct;
      case 'inQueue': return r.isInQueueReq;
      case 'approved': return r.isApproved;
      case 'attended': return r.attended;
      case 'noShow': return r.attendanceState === 'no_show';
      case 'unattended': return r.isUnattended;
      case 'revoked': return r.isRevoked;
      case 'overallRequested': return r.isRequested || r.isApproved || r.isUnattended || r.isRevoked;
    }
    return false;
  }

  private financeMatches(r: PRow): boolean {
    if (this.financeFilter === 'all') return true;
    const norm = (r.finance || '').toLowerCase().replace('fullypaid', 'fully paid').replace(/\s+/g, ' ').trim();
    return norm === this.financeFilter;
  }

  private customerMatches(r: PRow): boolean {
    if (this.customerFilter === 'all') return true;
    return this.statusKey(r.customerStatus) === this.customerFilter;
  }

  segmentMembers(): PRow[] {
    const s = this.searchText.trim().toLowerCase();
    return this.rows.filter(r => this.inSegment(r) &&
      (!s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)));
  }

  get segmentRows(): PRow[] {
    return this.segmentMembers().filter(r => this.financeMatches(r) && this.customerMatches(r) && this.journeyMatches(r) && this.frMatches(r));
  }

  get pagedRows(): PRow[] {
    const start = this.pageIndex * this.pageSize;
    return this.segmentRows.slice(start, start + this.pageSize);
  }

  get isFiltered(): boolean { return this.financeFilter !== 'all' || this.customerFilter !== 'all' || this.journeyFilter !== 'all' || this.frFilter !== 'all' || this.searchText.trim().length > 0; }

  onPage(e: PageEvent) { this.pageIndex = e.pageIndex; this.pageSize = e.pageSize; this.refreshMeta(); }
  onSearch() { this.pageIndex = 0; this.refreshMeta(); }
  onFinance() { this.pageIndex = 0; this.refreshMeta(); }
  onCustomer() { this.pageIndex = 0; this.refreshMeta(); }

  // ---- Selection: approve on Eligible + Not requested, attendance on Approved/Attended/No-show ----
  get selectionMode(): 'approve' | 'attend' | 'none' {
    if (this.segment === 'eligible' || this.segment === 'notRequested') return 'approve';
    if (this.segment === 'approved' || this.segment === 'noShow' || this.segment === 'attended') return 'attend';
    return 'none';
  }
  get showSelect() { return this.selectionMode !== 'none'; }

  // An owner is approvable whether or not they requested (matches initiate-event-product).
  private isApprovable(r: PRow) { return (r.isEligible || r.isNotRequested) && !!r.participantproductid; }

  private defaultSelection() {
    // Start every segment with nothing checked — the user opts in.
    this.selection.clear();
  }
  isSelectable(r: PRow) {
    if (this.selectionMode === 'approve') return this.isApprovable(r);
    if (this.selectionMode === 'attend') return r.isApproved;   // approved rows; attended ones can still be marked unattended
    return false;
  }
  toggleRow(r: PRow) { if (this.isSelectable(r)) this.selection.toggle(r); }
  private get selectableInView() { return this.segmentRows.filter(r => this.isSelectable(r)); }
  isAllSelected() { const v = this.selectableInView; return v.length > 0 && v.every(r => this.selection.isSelected(r)); }
  hasSelectionInView() { return this.selectableInView.some(r => this.selection.isSelected(r)); }
  masterToggle() {
    const v = this.selectableInView;
    if (this.isAllSelected()) v.forEach(r => this.selection.deselect(r));
    else v.forEach(r => this.selection.select(r));
  }
  get readyCount() { return this.selection.selected.filter(r => this.isApprovable(r)).length; }
  get selectedToMark() { return this.selection.selected.filter(r => r.isApproved && !r.attended); }
  get selectedToUnattend() { return this.selection.selected.filter(r => r.isApproved); }

  // ---- Display helpers ----
  formatMonthYear(ms: number): string {
    return ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';
  }
  // Compact money for the table (Indian scale): 5000 -> 5K, 122000 -> 1.2L, 25000000 -> 2.5Cr.
  shortAmount(v: any): string {
    const n = +(v || 0);
    if (!n) return '0';
    const abs = Math.abs(n);
    const fmt = (x: number, unit: number) => (x / unit).toFixed(abs % unit === 0 ? 0 : 1).replace(/\.0$/, '');
    if (abs >= 1e7) return fmt(n, 1e7) + 'Cr';
    if (abs >= 1e5) return fmt(n, 1e5) + 'L';
    if (abs >= 1e3) return fmt(n, 1e3) + 'K';
    return String(n);
  }
  financeDotClass(f: string): string {
    const n = (f || '').toLowerCase().replace('fullypaid', 'fully paid').replace(/\s+/g, ' ').trim();
    if (n === 'regular' || n === 'fully paid') return 'd-ok';
    if (n === 'defaulted') return 'd-bad';
    if (n === 'locked') return 'd-org';
    return '';
  }
  toMillis(d: any): number {
    try {
      if (d?.toMillis) return d.toMillis();
      if (d?.toDate) return d.toDate().getTime();
      if (d) return new Date(d).getTime();
    } catch { }
    return 0;
  }
  private etaText(remainingChunks: number): string {
    const secs = Math.max(0, remainingChunks) * (this.INITIATE_CHUNK_DELAY_MS / 1000);
    if (secs <= 0) return '';
    if (secs < 60) return `~${Math.round(secs)}s remaining`;
    return `~${Math.ceil(secs / 60)} min remaining`;
  }

  // ---- Approve ----
  approveDisabledReason(): string {
    if (this.readyCount === 0) return 'Select at least one eligible participant';
    if (!this.selectedDeliverySet) return 'Pick a delivery sequence to enable approve';
    if (this.arena?.['type'] === 'queue' && this.queueVariationList.length > 0 && !this.selectedQueueVariation)
      return 'Pick a queue variation';
    return '';
  }
  canApprove(): boolean { return this.approveDisabledReason() === ''; }

  async approveSelected() {
    if (!this.canApprove()) return;
    const selected = this.selection.selected.filter(r => this.isApprovable(r));
    if (!selected.length) return;
    await this.loadMeta(selected);
    const risky = selected.filter(r => ['locked', 'defaulted'].includes(
      (r.finance || '').toLowerCase().replace(/\s+/g, ' ').trim()));

    const ref = this.dialog.open(this.confirmTpl, {
      width: '420px', autoFocus: false, panelClass: 'sx-dialog',
      data: {
        title: 'Approve participants',
        body: `Approve ${selected.length} eligible participant(s) with delivery sequence “${this.selectedDeliverySet}”.`,
        warn: risky.length ? `${risky.length} have Locked or Defaulted finance.` : '',
        confirm: `Approve ${selected.length}`
      }
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;
    await this.runApprove(selected);
  }

  private async runApprove(selected: PRow[]) {
    const total = selected.length;
    const chunks: PRow[][] = [];
    for (let i = 0; i < total; i += this.INITIATE_CHUNK_SIZE) chunks.push(selected.slice(i, i + this.INITIATE_CHUNK_SIZE));

    this.progress = { msg: 'Approving...', value: 0, total, eta: this.etaText(chunks.length - 1) };
    const pref = this.dialog.open(this.progressTpl, { width: '380px', disableClose: true, autoFocus: false, panelClass: 'sx-dialog' });
    let success = 0;
    const failed: PRow[] = [];

    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      try {
        const batch = writeBatch(this.firestore);
        for (const row of chunk) {
          let participationId: string;
          let participationData: any;
          if (row.requestData) {
            participationId = row.requestData['docid'];
            participationData = {
              eventref: this.arena['eventref'], productref: this.arena['productref'], status: 'approved',
              profileid: row.profileid, participantproductid: row.participantproductid,
              arenaeventid: this.arena['docid'], initiatedfrom: 'web'
            };
          } else {
            participationId = doc(collection(this.firestore, 'event participation request')).id;
            participationData = {
              docid: participationId, doccreateddate: serverTimestamp(),
              eventref: this.arena['eventref'], productref: this.arena['productref'], status: 'approved',
              profileid: row.profileid, participantproductid: row.participantproductid,
              arenaeventid: this.arena['docid'], initiatedfrom: 'web'
            };
          }
          const participationRef = doc(this.firestore, 'event participation request', participationId);
          batch.set(participationRef, participationData, { merge: true });
          const productData: any = {
            eventref: this.arena['eventref'], arenaeventid: this.arena['docid'], status: 'initiated',
            eventparticipationid: participationRef.id, deliverytype: this.selectedDeliverySet,
            'statusdate.initiated': serverTimestamp()
          };
          if (this.arena['type'] == 'queue') productData['queuevariationid'] = this.selectedQueueVariation;
          batch.update(doc(this.firestore, 'participantsproduct', row.participantproductid!), productData);
        }
        await batch.commit();
        success += chunk.length;
      } catch (err) {
        failed.push(...chunk);
      }
      this.progress.value = Math.round(((success + failed.length) / total) * 100);
      this.progress.eta = this.etaText(chunks.length - 1 - c);
      if (c < chunks.length - 1) {
        this.progress.msg = `Waiting before next batch — ${success} / ${total} done`;
        await new Promise(res => setTimeout(res, this.INITIATE_CHUNK_DELAY_MS));
        this.progress.msg = 'Approving...';
      }
    }
    pref.close();

    if (failed.length) {
      this.selection.clear();
      failed.forEach(r => this.selection.select(r));
      this.dialog.open(this.failuresTpl, {
        width: '420px', autoFocus: false, panelClass: 'sx-dialog',
        data: { success, total, failed: failed.map(f => f.name) }
      }).afterClosed().subscribe(res => { if (res === 'retry') this.runApprove(failed); });
    } else {
      this.snackbar.open(`Approved ${success} of ${total}`, 'OK', { duration: 4000 });
      await this.loadData();
    }
  }

  // ---- Attendance ----
  async markAttended(rows: PRow[]) {
    const targets = rows.filter(r => r.approvedRequestId && !r.attended);
    if (!targets.length) return;
    const wasNoShow = targets.filter(r => r.attendanceState === 'no_show').length;
    this.progress = { msg: 'Marking attended...', value: 0, total: targets.length, eta: '' };
    const pref = this.dialog.open(this.progressTpl, { width: '380px', disableClose: true, autoFocus: false, panelClass: 'sx-dialog' });
    try {
      const refList = targets.map(r => doc(this.firestore, 'event participation request', r.approvedRequestId!));
      const batch = writeBatch(this.firestore);
      targets.forEach((r, i) => {
        batch.update(refList[i], {
          status: 'attended'
        });
        batch.set(doc(collection(this.firestore, 'events_profiles')), {
          event_ref: this.arena['eventref'],
          profile_ref: doc(this.firestore, 'profile_data', r.profileid),
          pseudo_name: null, token: null, eventrequest: refList[i]
        });
      });
      for (let i = 0; i < refList.length; i += 10) {
        const sub = refList.slice(i, i + 10);
        const delSnap = await getDocs(query(collection(this.firestore, 'deliverables'),
          where('fileref', 'array-contains-any', sub)));
        delSnap.docs.forEach(d => batch.update(d.ref, { status: 'completed' }));
      }
      await batch.commit();
      targets.forEach(r => { r.attended = true; r.attendanceState = 'attended'; });
      this.counts.attended += targets.length;
      this.counts.noShow = Math.max(0, this.counts.noShow - wasNoShow);
      this.selection.clear();
      this.snackbar.open(`Marked ${targets.length} attended`, 'OK', { duration: 4000 });
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not mark attended', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
  }

  // ---- Mark not attended (destructive): status -> 'unattended' AND cancel the product ----
  // Mirrors the legacy "Mark as Not Attended": cancels participantsproduct, deletes the events_profiles
  // record, and nulls the deliverables. Use this DURING the event; no-show (product-preserving) is at finalize.
  async markUnattended(rows: PRow[]) {
    const targets = rows.filter(r => r.approvedRequestId);
    if (!targets.length) return;
    const ref = this.dialog.open(this.confirmTpl, {
      width: '440px', autoFocus: false, panelClass: 'sx-dialog',
      data: {
        title: 'Mark not attended',
        body: `Mark ${targets.length} participant(s) as not attended. Their product will be cancelled.`,
        warn: 'This cancels the product, removes their event profile, and clears deliverables. It cannot be undone.',
        confirm: `Mark ${targets.length} unattended`
      }
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.progress = { msg: 'Cancelling…', value: 0, total: targets.length, eta: '' };
    const pref = this.dialog.open(this.progressTpl, { width: '380px', disableClose: true, autoFocus: false, panelClass: 'sx-dialog' });
    try {
      const batch = writeBatch(this.firestore);
      const reqRefs = targets.map(r => doc(this.firestore, 'event participation request', r.approvedRequestId!));
      targets.forEach((r, i) => {
        batch.update(reqRefs[i], { status: 'unattended' });
      });
      // Delete the events_profiles record for each (profile + event).
      for (const r of targets) {
        const epSnap = await getDocs(query(collection(this.firestore, 'events_profiles'),
          where('profile_ref', '==', doc(this.firestore, 'profile_data', r.profileid)),
          where('event_ref', '==', this.arena['eventref'])));
        epSnap.docs.forEach(d => batch.delete(d.ref));
      }
      // Cancel the product from the deliverable (matches event-participation-approve), then null the deliverables.
      for (let i = 0; i < reqRefs.length; i += 10) {
        const sub = reqRefs.slice(i, i + 10);
        const delSnap = await getDocs(query(collection(this.firestore, 'deliverables'),
          where('fileref', 'array-contains-any', sub)));
        delSnap.docs.forEach(d => {
          const dd = d.data();
          if (dd['participantproductid']) {
            batch.update(doc(this.firestore, 'participantsproduct', dd['participantproductid']), { status: 'cancelled' });
          }
          batch.update(d.ref, { status: null });
        });
      }
      await batch.commit();
      this.snackbar.open(`Marked ${targets.length} not attended`, 'OK', { duration: 4000 });
      this.selection.clear();
      await this.loadData();
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not mark not attended', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
  }

  // ---- Revoke (destructive): status -> 'revoked' AND cancel the product, then re-assign a product ----
  // Same writes as markUnattended EXCEPT the request status is 'revoked' (not 'unattended'). On success we
  // auto-open the shared bulk-add-products dialog, pre-loaded with the revoked profiles + this event's product,
  // so an admin can create a fresh product for them in one flow.
  get selectedToRevoke() { return this.selection.selected.filter(r => r.isApproved); }

  async markRevoked(rows: PRow[]) {
    const targets = rows.filter(r => r.approvedRequestId);
    if (!targets.length) return;
    const ref = this.dialog.open(this.confirmTpl, {
      width: '440px', autoFocus: false, panelClass: 'sx-dialog',
      data: {
        title: 'Revoke participation',
        body: `Revoke ${targets.length} participant(s). Their current product will be cancelled, then you can assign a new one.`,
        warn: 'This cancels the product, removes their event profile, and clears deliverables. It cannot be undone.',
        confirm: `Revoke ${targets.length}`
      }
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.progress = { msg: 'Revoking…', value: 0, total: targets.length, eta: '' };
    const pref = this.dialog.open(this.progressTpl, { width: '380px', disableClose: true, autoFocus: false, panelClass: 'sx-dialog' });
    let committed = false;
    try {
      const batch = writeBatch(this.firestore);
      const reqRefs = targets.map(r => doc(this.firestore, 'event participation request', r.approvedRequestId!));
      const revokedBy = (this.guard.loggedinProfile as any)?.['profileid'] ?? null;
      targets.forEach((r, i) => {
        batch.update(reqRefs[i], { status: 'revoked', revoked_by: revokedBy, revoked_date: serverTimestamp() });
      });
      // Delete the events_profiles record for each (profile + event).
      for (const r of targets) {
        const epSnap = await getDocs(query(collection(this.firestore, 'events_profiles'),
          where('profile_ref', '==', doc(this.firestore, 'profile_data', r.profileid)),
          where('event_ref', '==', this.arena['eventref'])));
        epSnap.docs.forEach(d => batch.delete(d.ref));
      }
      // Cancel the product from the deliverable, then null the deliverables.
      for (let i = 0; i < reqRefs.length; i += 10) {
        const sub = reqRefs.slice(i, i + 10);
        const delSnap = await getDocs(query(collection(this.firestore, 'deliverables'),
          where('fileref', 'array-contains-any', sub)));
        delSnap.docs.forEach(d => {
          const dd = d.data();
          if (dd['participantproductid']) {
            batch.update(doc(this.firestore, 'participantsproduct', dd['participantproductid']), { status: 'cancelled' });
          }
          batch.update(d.ref, { status: null });
        });
      }
      await batch.commit();
      committed = true;
      this.snackbar.open(`Revoked ${targets.length}`, 'OK', { duration: 4000 });
      this.selection.clear();
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not revoke', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
    if (!committed) return;

    // Auto-open the bulk-add dialog with the revoked profiles + this event's product to create a new product.
    const participants = targets.map(r => ({ profileid: r.profileid, name: r.name, email: r.email }));
    console.log('REVOKE→bulk-add', {
      productrefId: this.arena?.['productref']?.id,
      productrefResolvesToName: this.mapProduct[this.arena?.['productref']?.id],
      participants
    });
    this.dialog.open(BulkAddProductsComponent, {
      data: { participants, productrefId: this.arena?.['productref']?.id },
      width: '70vw', disableClose: true, panelClass: 'sx-dialog-surface'
    }).afterClosed().subscribe(async () => {
      const seq = this.selectedDeliverySet, variation = this.selectedQueueVariation;
      await this.loadData();
      this.selectedDeliverySet = seq;
      this.selectedQueueVariation = variation;
    });
  }

  // ---- Finalize attendance (after the event): mark no-show + lock the frozen snapshot ----
  // Product-preserving: writes only namespaced fields (attendance on the request, snapshot on the arena doc).
  get eventEnded(): boolean { return !!this.eventEnd && Date.now() > this.eventEnd; }
  get alreadyFinalized(): boolean { return !!this.arena?.['epc_snapshot']; }
  get pendingNoShow(): PRow[] {
    return this.rows.filter(r => r.isApproved && !r.attended && r.attendanceState !== 'no_show');
  }
  get canFinalize(): boolean { return this.eventEnded && !this.alreadyFinalized; }
  get frozenStats() {
    const s = this.arena?.['epc_snapshot'];
    const att = s ? (s['attended'] || 0) : this.counts.attended;
    const app = s ? (s['approved'] || 0) : this.counts.approved;
    const pot = s ? (s['potential'] || 0) : this.counts.potential;
    return {
      attended: att, approved: app, potential: pot,
      ofApproved: app ? Math.round(att / app * 100) : 0,
      ofPotential: pot ? Math.round(att / pot * 100) : 0
    };
  }

  async finalizeAttendance() {
    if (!this.canFinalize) return;
    const targets = this.pendingNoShow.filter(r => r.approvedRequestId);
    const ref = this.dialog.open(this.confirmTpl, {
      width: '420px', autoFocus: false, panelClass: 'sx-dialog',
      data: {
        title: 'Finalize attendance',
        body: targets.length
          ? `Mark ${targets.length} approved participant(s) who did not attend as no-show, and lock this event's final numbers. Their product is not changed.`
          : `Lock this event's final numbers. Everyone approved has attended.`,
        warn: 'This cannot be undone.',
        confirm: 'Finalize'
      }
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.progress = { msg: 'Finalizing...', value: 0, total: Math.max(1, targets.length), eta: '' };
    const pref = this.dialog.open(this.progressTpl, { width: '380px', disableClose: true, autoFocus: false, panelClass: 'sx-dialog' });
    try {
      for (let i = 0; i < targets.length; i += 400) {
        const chunk = targets.slice(i, i + 400);
        const batch = writeBatch(this.firestore);
        chunk.forEach(r => {
          batch.update(doc(this.firestore, 'event participation request', r.approvedRequestId!), {
            attendance_state: 'no_show', attendance_source: 'manual', attendance_marked_at: serverTimestamp()
          });
        });
        await batch.commit();
        this.progress.value = Math.round(Math.min(i + chunk.length, targets.length) / targets.length * 100);
      }
      targets.forEach(r => { r.attendanceState = 'no_show'; });
      this.counts.noShow += targets.length;

      const snapshot = {
        potential: this.counts.potential, requested: this.counts.requested,
        notRequested: this.counts.notRequested, eligible: this.counts.eligible,
        noProduct: this.counts.noProduct, inQueue: this.counts.inQueue,
        approved: this.counts.approved, attended: this.counts.attended, noShow: this.counts.noShow
      };
      await updateDoc(doc(this.firestore, 'arena events', this.arena['docid']), {
        epc_snapshot: snapshot, epc_snapshot_at: serverTimestamp()
      });
      this.arena['epc_snapshot'] = snapshot;
      this.snackbar.open(targets.length ? `Finalized — ${targets.length} marked no-show` : 'Event finalized', 'OK', { duration: 4000 });
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not finalize', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
  }

  // ---- Assign product (no-product rows) ----
  assignProduct(row: PRow) {
    const participants = [{ profileid: row.profileid, name: row.name, email: row.email }];
    this.dialog.open(BulkAddProductsComponent, {
      data: { participants, productrefId: this.arena?.['productref']?.id },
      width: '70vw', disableClose: true, panelClass: 'sx-dialog-surface'
    }).afterClosed().subscribe(async () => {
      const seq = this.selectedDeliverySet, variation = this.selectedQueueVariation;
      await this.loadData();
      this.selectedDeliverySet = seq;
      this.selectedQueueVariation = variation;
    });
  }

  // ---- Bulk import (Excel) — mirrors initiate-event-product, incl. non-requesters ----
  @ViewChild('importTpl') importTpl!: TemplateRef<any>;
  private importDialogRef: any = null;

  downloadSampleExcel() {
    const ws = XLSX.utils.aoa_to_sheet([['name', 'email'], ['Jane Doe', 'jane@example.com']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    XLSX.writeFile(wb, 'participants_sample.xlsx');
  }

  importParticipants() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xls,.xlsx';
    input.addEventListener('change', (ev: any) => {
      const file: File = ev.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { this.snackbar.open('File too large (max 10MB)', 'OK', { duration: 4000 }); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          const parsed: ImportPreviewRow[] = [];
          const seen = new Set<string>();
          json.forEach((row, idx) => {
            if (idx === 0 || !row[0] || !row[1]) return;
            const name = row[0].toString().trim();
            const email = row[1].toString().trim().toLowerCase();
            if (name && email && !seen.has(email)) { seen.add(email); parsed.push({ name, email }); }
          });
          const willAdd: ImportPreviewRow[] = [], inQueue: ImportPreviewRow[] = [], noProduct: ImportPreviewRow[] = [];
          this.pendingImportRows = [];
          parsed.forEach(p => {
            const owner = this.ownerByEmail.get(p.email);
            if (owner && (owner.inQueue || this.activeProfileIds.has(owner.profileid))) inQueue.push(p);
            else if (owner) { willAdd.push(p); this.pendingImportRows.push(owner); }
            else noProduct.push(p);
          });
          this.importPreview = { total: parsed.length, willAdd, inQueue, noProduct };
          this.importExpand = { willAdd: false, inQueue: false, noProduct: false };
          this.importDialogRef = this.dialog.open(this.importTpl, { width: '560px', maxHeight: '90vh', autoFocus: false, panelClass: 'sx-dialog' });
        } catch (err) {
          console.log(err);
          this.snackbar.open('Could not read file', 'OK', { duration: 4000 });
        }
      };
      reader.onerror = () => this.snackbar.open('Could not read file', 'OK', { duration: 4000 });
      reader.readAsArrayBuffer(file);
    });
    input.click();
  }

  // Confirm import → initiate the owner rows (eligible OR not-requested) with the chosen sequence.
  async confirmImport() {
    this.importDialogRef?.close();
    const rows = this.pendingImportRows.slice();
    this.pendingImportRows = [];
    if (!rows.length) { this.snackbar.open('No participants to add', 'OK', { duration: 4000 }); return; }
    if (!this.selectedDeliverySet) { this.snackbar.open('Pick a delivery sequence first, then import', 'OK', { duration: 5000 }); return; }
    if (this.arena?.['type'] === 'queue' && this.queueVariationList.length > 0 && !this.selectedQueueVariation) {
      this.snackbar.open('Pick a queue variation first, then import', 'OK', { duration: 5000 }); return;
    }
    await this.runApprove(rows);
  }

  // Assign the product to the imported "no product" people via the shared bulk-add dialog.
  assignImportNoProduct() {
    const noProduct = this.importPreview?.noProduct ?? [];
    const participants = noProduct
      .map(p => ({ profileid: this.mapEmailData[p.email]?.['profileid'], name: p.name, email: p.email }))
      .filter(p => p.profileid);
    this.importDialogRef?.close();
    if (!participants.length) { this.snackbar.open('No matching profiles to assign', 'OK', { duration: 4000 }); return; }
    this.dialog.open(BulkAddProductsComponent, {
      data: { participants, productrefId: this.arena?.['productref']?.id },
      width: '70vw', disableClose: true, panelClass: 'sx-dialog-surface'
    }).afterClosed().subscribe(async () => {
      const seq = this.selectedDeliverySet, variation = this.selectedQueueVariation;
      await this.loadData();
      this.selectedDeliverySet = seq;
      this.selectedQueueVariation = variation;
    });
  }

  exportImportNoProduct() {
    const ws = XLSX.utils.json_to_sheet(this.importPreview?.noProduct ?? []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'No product');
    XLSX.writeFile(wb, 'import_no_product.xlsx');
  }

  // ---- Communications (sends to the current segment's participants) ----
  get commsRecipients(): PRow[] { return this.segmentRows; }

  sendWhatsApp() {
    const recipients = this.commsRecipients;
    if (!recipients.length) { this.snackbar.open('No participants to message', 'OK', { duration: 3000 }); return; }
    const data = recipients.map(r => ({ profileid: r.profileid, name: r.name, email: r.email }));
    this.dialog.open(WatiInputComponent, { data, width: '70vw', height: '80vh', disableClose: true, panelClass: 'sx-dialog-surface' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const failed = result === 'failed' || result?.status === 'failed';
        this.snackbar.open(failed ? 'WhatsApp send failed' : 'WhatsApp message sent', 'OK', { duration: 4000 });
      });
  }

  sendNotification() {
    const recipients = this.commsRecipients;
    if (!recipients.length) { this.snackbar.open('No participants to notify', 'OK', { duration: 3000 }); return; }
    const profileids = recipients.map(r => r.profileid);
    this.dialog.open(AhNotificationComponent, { width: '60vw', maxHeight: '90vh', disableClose: true, autoFocus: false, panelClass: 'sx-dialog-surface' })
      .afterClosed().subscribe(async result => {
        if (!result) return;
        try {
          let image: string | null = null;
          if (result['notificationimage']) {
            const path = 'Notification Images/' + new Date().toISOString() + result['notificationimage'].name;
            const up = await uploadBytes(ref(this.storage, path), result['notificationimage']);
            image = await getDownloadURL(up.ref);
          }
          await this.guard.saveNotificationRecord({
            title: result['title'], message: result['message'], subtitle: result['subtitle'] ?? null,
            notificationtype: 'ahupdate', notificationimage: image, sticky: result['sticky'],
            logged: true, landingpage: result['landingpage'], profileid: profileids,
            receivingapp: result['receivingapp'] ?? "breakthroughsapp"
          });
          this.snackbar.open(`Notification sent to ${profileids.length}`, 'OK', { duration: 4000 });
        } catch (e) {
          console.log(e);
          this.snackbar.open('Could not send notification', 'OK', { duration: 4000 });
        }
      });
  }

  sendEmail() {
    const recipients = this.commsRecipients;
    if (!recipients.length) { this.snackbar.open('No participants to email', 'OK', { duration: 3000 }); return; }
    const data = recipients.map(r => ({ profileid: r.profileid, name: r.name, email: r.email }));
    this.dialog.open(EmailInputComponent, { data, minWidth: '600px', disableClose: true, panelClass: 'sx-dialog-surface' })
      .afterClosed().subscribe(async (result: any) => {
        if (!result) return;
        try {
          if (result['status'] === 'queued' || result['status'] === 'send') {
            await setDoc(doc(collection(this.firestore, 'email archive'), result['docid']), result, { merge: true });
            this.snackbar.open('Email queued', 'OK', { duration: 4000 });
          } else if (result['status'] === 'validated') {
            const url = environment.firebase.projectId === 'starlabs-test'
              ? 'https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail'
              : 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail';
            const payload: any = { ...result, archiveid: result['docid'] };
            this.http.post(url, JSON.stringify(payload), {
              responseType: 'text', headers: new HttpHeaders().set('Content-Type', 'application/json')
            }).subscribe({
              next: () => this.snackbar.open('Email sent', 'OK', { duration: 4000 }),
              error: (e) => { console.log(e); this.snackbar.open('Error sending email', 'OK', { duration: 4000 }); }
            });
          }
        } catch (e) { console.log(e); this.snackbar.open('Could not send email', 'OK', { duration: 4000 }); }
      });
  }

  // Funnel-bucket label for a row (used in export "Eligibility" column).
  eligibilityLabel(r: PRow): string {
    if (r.isUnattended) return 'Unattended';
    if (r.attended) return 'Attended';
    if (r.attendanceState === 'no_show') return 'No-show';
    if (r.isApproved) return 'Approved';
    if (r.isEligible) return 'Eligible';
    if (r.isNoProduct) return 'No product';
    if (r.isInQueueReq) return 'In queue';
    if (r.isNotRequested) return 'Not requested';
    return '';
  }

  async exportList() {
    const rows = this.segmentRows;
    if (!rows.length) { this.snackbar.open('Nothing to export', 'OK', { duration: 3000 }); return; }
    // Make sure every row in the segment has its metadata before exporting (not just the visible page).
    this.progress = { msg: 'Preparing export…', value: 0, total: rows.length, eta: '' };
    const pref = this.dialog.open(this.progressTpl, { width: '360px', disableClose: true, autoFocus: false, panelClass: 'sx-dialog' });
    try {
      await Promise.all([this.loadMeta(rows), this.loadSubscriptions(rows)]);
      const data = rows.map(r => {
        const due = (typeof r.purchaseValue === 'number' && typeof r.paid === 'number') ? r.purchaseValue - r.paid : '';
        const rd = r.requestedDate ? new Date(r.requestedDate) : null;
        return {
          Name: r.name,
          Email: r.email || '',
          Phone: r.phone || '',
          // Real Excel date value (date-only) so it sorts/filters as a date; time in its own column.
          'Requested date': rd ? new Date(rd.getFullYear(), rd.getMonth(), rd.getDate()) : '',
          'Requested time': rd ? formatDate(rd, 'h:mm:ss a', 'en-US') : '',
          'Active journey': r.journey || '',
          'Total purchase value': r.purchaseValue ?? '',
          'Total paid': r.paid ?? '',
          Due: due,
          'Financial status': r.finance || '',
          Subscription: (r.subActive ? 'Active' : (r.subEnd ? 'Expired' : '')) + (r.subEnd ? ' ' + this.formatMonthYear(r.subEnd) : ''),
          'Customer status': r.customerStatus || '',
          Eligibility: this.eligibilityLabel(r),
          Reason: r.reason || '',
          Attended: r.attended ? 'Yes' : 'No'
        };
      });
      const ws = XLSX.utils.json_to_sheet(data, { cellDates: true, dateNF: 'yyyy-mm-dd' });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Participants');
      XLSX.writeFile(wb, `${this.productName}_${this.segment}.xlsx`);
      this.snackbar.open(`Exported ${rows.length} rows`, 'OK', { duration: 3000 });
    } catch (e) {
      console.log(e);
      this.snackbar.open('Could not export', 'OK', { duration: 4000 });
    } finally {
      pref.close();
    }
  }
}
