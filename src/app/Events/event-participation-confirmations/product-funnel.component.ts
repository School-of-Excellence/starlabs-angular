import { Component, Input, OnInit, TemplateRef, ViewChild } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs,
  doc, writeBatch, serverTimestamp, updateDoc
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import * as XLSX from 'xlsx';

import { AuthguardService } from '../../authguard.service';
import { BulkAddProductsComponent } from '../../Participants Profile Management/participants-analytics/bulk-add-products/bulk-add-products.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';

type SegmentKey = 'potential' | 'requested' | 'notRequested' | 'eligible' | 'noProduct' | 'inQueue' | 'approved' | 'attended' | 'noShow';

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
  inQueue: boolean;
  attended: boolean;
  scanned: boolean;
  attendanceState: string;
  reason: string;
  journey: string;
  subEnd: number;
  subActive: boolean;
  finance: string;
  metaLoaded: boolean;
  metaError: boolean;
}

@Component({
  selector: 'app-product-funnel',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatTooltipModule, MatCheckboxModule, MatPaginatorModule,
    MatProgressBarModule, MatDialogModule, MatMenuModule
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
    { key: 'noShow', label: 'No-show', cls: 'ns', desc: 'did not attend', tip: 'Approved but did not attend — set when you finalize attendance after the event' }
  ];

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
  selection = new SelectionModel<PRow>(true, []);

  counts: Record<SegmentKey, number> = {
    potential: 0, requested: 0, notRequested: 0, eligible: 0, noProduct: 0, inQueue: 0, approved: 0, attended: 0, noShow: 0
  };

  pageSize = 25;
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
    public storage: Storage
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
    const arena = this.arena;
    try {
      const [ownSnap, eprSnap, tokSnap, scanSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'participantsproduct'),
          where('productref', '==', arena['productref']), where('status', '==', null))),
        getDocs(query(collection(this.firestore, 'event participation request'),
          where('arenaeventid', '==', arena['docid']),
          where('status', 'in', ['requested', 'approved', 'attended']))),
        getDocs(query(collection(this.firestore, 'queue_token'),
          where('queueref', '==', arena['eventref']))),
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
      const attendanceStateByPid = new Map<string, string>();
      eprSnap.docs.forEach(d => {
        const x = d.data();
        const pid = x['profileid'];
        if (!pid) return;
        if (x['status'] == 'approved') { approvedReq.set(pid, x['docid'] ?? d.id); attendanceStateByPid.set(pid, x['attendance_state'] ?? ''); }
        else if (x['status'] == 'attended') { attendedIds.add(pid); approvedReq.set(pid, x['docid'] ?? d.id); attendanceStateByPid.set(pid, x['attendance_state'] ?? 'attended'); }
        else if (x['status'] == 'requested') requestedData.set(pid, { ...x, docid: x['docid'] ?? d.id });
      });

      const active = new Set<string>();
      tokSnap.docs.forEach(d => {
        const x = d.data();
        if ((x['tokenstatus'] ?? '').toString().toLowerCase() == 'active' && x['profile_id']) active.add(x['profile_id']);
      });

      const scanned = new Set<string>();
      scanSnap.docs.forEach(d => { const x = d.data(); if (x['profileid']) scanned.add(x['profileid']); });

      // Approved cohort = EPR approved/attended OR physically scanned (a scan means they were ticketed).
      // Cohort members are not "requested", so attended is always a subset of approved.
      const cohort = new Set<string>([...approvedReq.keys(), ...scanned]);
      cohort.forEach(p => requestedData.delete(p));

      const ids = new Set<string>([...owners.keys(), ...requestedData.keys(), ...cohort]);
      const rows: PRow[] = [];
      ids.forEach(pid => {
        const prof = this.mapProfile[pid] ?? {};
        const isOwner = owners.has(pid);
        const isScanned = scanned.has(pid);
        const isAttended = attendedIds.has(pid) || isScanned;
        const inCohort = approvedReq.has(pid) || isScanned;
        const isRequested = requestedData.has(pid);
        const inQueue = active.has(pid);
        const isEligible = isRequested && isOwner && !inQueue;
        const isNoProduct = isRequested && !isOwner;
        const isInQueueReq = isRequested && isOwner && inQueue;
        const isNotRequested = isOwner && !isRequested && !inCohort;
        const reason = isNoProduct ? 'No product' : (isInQueueReq ? 'In active queue' : '');
        rows.push({
          profileid: pid,
          name: prof['name'] ?? 'Unknown',
          email: prof['email'] ?? '',
          photo: prof['profile'] ?? prof['photoURL'] ?? '',
          participantproductid: owners.get(pid) ?? null,
          approvedRequestId: approvedReq.get(pid) ?? null,
          requestData: requestedData.get(pid) ?? null,
          isOwner, isRequested, isApproved: inCohort,
          isEligible, isNoProduct, isInQueueReq, isNotRequested, inQueue,
          attended: isAttended,
          scanned: isScanned,
          attendanceState: attendanceStateByPid.get(pid) ?? '',
          reason,
          journey: '', subEnd: 0, subActive: false, finance: '', metaLoaded: false, metaError: false
        });
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      this.rows = rows;

      this.counts = {
        potential: owners.size,
        requested: requestedData.size,
        notRequested: [...owners.keys()].filter(o => !requestedData.has(o) && !cohort.has(o)).length,
        eligible: rows.filter(r => r.isEligible).length,
        noProduct: rows.filter(r => r.isNoProduct).length,
        inQueue: rows.filter(r => r.isInQueueReq).length,
        approved: cohort.size,
        attended: rows.filter(r => r.attended).length,
        noShow: rows.filter(r => r.attendanceState === 'no_show').length
      };

      this.deliverySetList = await this.loadDeliverySets(arena);
      await this.loadVariations(arena);

      this.defaultSelection();
      this.refreshMeta();
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

  private async loadMeta(rows: PRow[]) {
    const pending = rows.filter(r => !r.metaLoaded);
    if (pending.length === 0) return;
    const byId = new Map<string, PRow>();
    pending.forEach(r => byId.set(r.profileid, r));
    const ids = [...byId.keys()];
    const now = Date.now();
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      try {
        const snap = await getDocs(query(collection(this.firestore, 'participant metadata'),
          where('profileid', 'in', chunk)));
        const metaById: Record<string, any> = {};
        snap.docs.forEach(d => { const x = d.data(); if (x['profileid']) metaById[x['profileid']] = x; });
        chunk.forEach(pid => {
          const row = byId.get(pid);
          if (!row) return;
          const m = metaById[pid] ?? {};
          row.journey = this.mapJourney[m['activejourney']] ?? '';
          row.subEnd = this.toMillis(m['subscriptionend']);
          row.subActive = row.subEnd ? row.subEnd >= now : false;
          row.finance = m['financialstatus'] ?? '';
          row.metaLoaded = true;
        });
      } catch (e) {
        console.log('meta load failed', e);
        chunk.forEach(pid => { const row = byId.get(pid); if (row) { row.metaError = true; row.metaLoaded = true; } });
      }
    }
  }

  private refreshMeta() {
    this.loadMeta(this.pagedRows);
    if (this.financeFilter !== 'all') this.loadMeta(this.segmentMembers());
  }

  // ---- Segments ----
  setSegment(s: SegmentKey) {
    this.segment = s;
    this.pageIndex = 0;
    this.defaultSelection();
    this.refreshMeta();
  }

  private inSegment(r: PRow): boolean {
    switch (this.segment) {
      case 'potential': return r.isOwner;
      case 'requested': return r.isRequested;
      case 'notRequested': return r.isNotRequested;
      case 'eligible': return r.isEligible;
      case 'noProduct': return r.isNoProduct;
      case 'inQueue': return r.isInQueueReq;
      case 'approved': return r.isApproved;
      case 'attended': return r.attended;
      case 'noShow': return r.attendanceState === 'no_show';
    }
    return false;
  }

  private financeMatches(r: PRow): boolean {
    if (this.financeFilter === 'all') return true;
    const norm = (r.finance || '').toLowerCase().replace('fullypaid', 'fully paid').replace(/\s+/g, ' ').trim();
    return norm === this.financeFilter;
  }

  segmentMembers(): PRow[] {
    const s = this.searchText.trim().toLowerCase();
    return this.rows.filter(r => this.inSegment(r) &&
      (!s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)));
  }

  get segmentRows(): PRow[] {
    return this.segmentMembers().filter(r => this.financeMatches(r));
  }

  get pagedRows(): PRow[] {
    const start = this.pageIndex * this.pageSize;
    return this.segmentRows.slice(start, start + this.pageSize);
  }

  get isFiltered(): boolean { return this.financeFilter !== 'all' || this.searchText.trim().length > 0; }

  onPage(e: PageEvent) { this.pageIndex = e.pageIndex; this.pageSize = e.pageSize; this.refreshMeta(); }
  onSearch() { this.pageIndex = 0; this.refreshMeta(); }
  onFinance() { this.pageIndex = 0; this.refreshMeta(); }

  // ---- Selection: approve on Eligible, attendance on Approved/No-show/Attended ----
  get selectionMode(): 'approve' | 'attend' | 'none' {
    if (this.segment === 'eligible') return 'approve';
    if (this.segment === 'approved' || this.segment === 'noShow' || this.segment === 'attended') return 'attend';
    return 'none';
  }
  get showSelect() { return this.selectionMode !== 'none'; }

  private defaultSelection() {
    this.selection.clear();
    if (this.segment === 'eligible') this.rows.filter(r => r.isEligible).forEach(r => this.selection.select(r));
  }
  isSelectable(r: PRow) {
    if (this.selectionMode === 'approve') return r.isEligible;
    if (this.selectionMode === 'attend') return r.isApproved && !r.attended;
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
  get readyCount() { return this.selection.selected.filter(r => r.isEligible).length; }
  get selectedToMark() { return this.selection.selected.filter(r => r.isApproved && !r.attended); }

  // ---- Display helpers ----
  formatMonthYear(ms: number): string {
    return ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';
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
    const selected = this.selection.selected.filter(r => r.isEligible && r.participantproductid);
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
          status: 'attended', attendance_state: 'attended',
          attendance_source: 'manual', attendance_marked_at: serverTimestamp()
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

  // ---- Finalize attendance (after the event): mark no-show + lock the frozen snapshot ----
  // Product-preserving: writes only namespaced fields (attendance on the request, snapshot on the arena doc).
  get eventEnded(): boolean { return !!this.eventEnd && Date.now() > this.eventEnd; }
  get alreadyFinalized(): boolean { return !!this.arena?.['epc_snapshot']; }
  get pendingNoShow(): PRow[] {
    return this.rows.filter(r => r.isApproved && !r.attended && r.attendanceState !== 'no_show');
  }
  get canFinalize(): boolean { return this.eventEnded && !this.alreadyFinalized; }
  get showUpPct(): number {
    const snap = this.arena?.['epc_snapshot'];
    const pot = snap ? (snap['potential'] || 0) : this.counts.potential;
    const att = snap ? (snap['attended'] || 0) : this.counts.attended;
    return pot ? Math.round(att / pot * 100) : 0;
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
      width: '70vw', disableClose: true
    }).afterClosed().subscribe(async () => {
      const seq = this.selectedDeliverySet, variation = this.selectedQueueVariation;
      await this.loadData();
      this.selectedDeliverySet = seq;
      this.selectedQueueVariation = variation;
    });
  }

  // ---- Communications (sends to the current segment's participants) ----
  get commsRecipients(): PRow[] { return this.segmentRows; }

  sendWhatsApp() {
    const recipients = this.commsRecipients;
    if (!recipients.length) { this.snackbar.open('No participants to message', 'OK', { duration: 3000 }); return; }
    const data = recipients.map(r => ({ profileid: r.profileid, name: r.name, email: r.email }));
    this.dialog.open(WatiInputComponent, { data, width: '70vw', height: '80vh', disableClose: true })
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
    this.dialog.open(AhNotificationComponent, { width: '60vw', maxHeight: '90vh', disableClose: true, autoFocus: false })
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
            logged: true, landingpage: result['landingpage'], profileid: profileids
          });
          this.snackbar.open(`Notification sent to ${profileids.length}`, 'OK', { duration: 4000 });
        } catch (e) {
          console.log(e);
          this.snackbar.open('Could not send notification', 'OK', { duration: 4000 });
        }
      });
  }

  exportList() {
    const rows = this.segmentRows;
    const data = rows.map(r => ({
      Name: r.name, Email: r.email, Journey: r.journey,
      Subscription: (r.subActive ? 'Active' : (r.subEnd ? 'Expired' : '')) + (r.subEnd ? ' ' + this.formatMonthYear(r.subEnd) : ''),
      Finance: r.finance, Reason: r.reason, Attended: r.attended ? 'Yes' : 'No'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    XLSX.writeFile(wb, `${this.productName}_${this.segment}.xlsx`);
    this.snackbar.open(`Exported ${rows.length} rows`, 'OK', { duration: 3000 });
  }
}
