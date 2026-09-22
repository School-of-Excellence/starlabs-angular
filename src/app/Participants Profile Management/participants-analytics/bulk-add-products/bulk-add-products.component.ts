import { CommonModule } from '@angular/common';
import { Component, inject, Inject, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import {
  collection,
  doc,
  documentId,
  Firestore,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

export const DESCRIPTION_MIN_LENGTH = 10;
const HISTORY_PAGE_SIZE = 20;
const BULK_JOBS_COLLECTION = 'bulkProductJobs';
const CHUNK_SIZE = 100;
/** A claim older than this (ms) is treated as dead — the job can be Reset. Matches the CF guard. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

interface BulkJobParticipant {
  profileid: string;
  name?: string;
  email?: string;
}

/** A failed participant on the lean job doc. */
interface FailureEntry {
  profileid: string;
  reason: string;
}

/** Participant metadata resolved at DISPLAY time (not stored on the job doc). */
export interface ParticipantMeta {
  name?: string | null;
  email?: string | null;
  phonenumber?: string | null;
  countrycode?: string | null;
  participantmode?: string | null;
  customerstatus?: string | null;
}

interface BulkJobDoc {
  docid: string;
  batchId: string;
  createdat: any;
  createdby: string;
  description: string;
  productref: string;
  packageref: string | null;
  minimumpayment: number | null;
  profiles: string[];
  retry: boolean;
  processing: boolean;
  claimedAt: any;
  success: string[]; // profileids only
  failures: FailureEntry[]; // { profileid, reason }
  totalcount: number;
}

/**
 * Bulk Add Products — queue front end. This dialog no longer reads/writes participant
 * product data itself; it creates `bulkProductJobs` docs (chunked by 100) and a Cloud
 * Function does the work. See specs/plans/2026-09-22-bulk-add-products-queue.md.
 */
@Component({
  selector: 'app-bulk-add-products',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    ReactiveFormsModule,
    FormsModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './bulk-add-products.component.html',
  styleUrl: './bulk-add-products.component.css',
})
export class BulkAddProductsComponent implements OnInit, OnDestroy {
  // Reference data for the two dropdowns
  productsList: any[] = [];
  allpackageList: any[] = [];
  mapMinimumRequiredAmount: Record<string, any> = {};

  selectedProduct: string | null = null;
  productFilter = '';
  tab = 0;

  @ViewChild('bapParticipantsTpl') participantsTpl!: TemplateRef<any>;

  form: FormGroup;

  participants: BulkJobParticipant[] = [];
  createdby = '';
  productrefId: string | null = null;

  // Submit state
  submitting = false;
  lastBatch: { batchId: string; total: number } | null = null;
  batchProgress: { success: number; failures: number; total: number } | null = null;
  private batchUnsub?: () => void;

  // History tab state (live)
  jobs: BulkJobDoc[] = [];
  historyLoading = false;
  historyDone = false;
  private historyLimit = HISTORY_PAGE_SIZE;
  private historyUnsub?: () => void;
  /** profileid → metadata, resolved client-side at display time (the job doc stores only ids). */
  metaCache = new Map<string, ParticipantMeta>();

  private firestore = inject(Firestore);

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<BulkAddProductsComponent>,
    private fb: FormBuilder,
    private dialog: MatDialog
  ) {
    if (Array.isArray(data)) {
      this.participants = data ?? [];
      this.productrefId = null;
      this.createdby = '';
    } else {
      this.participants = data?.participants ?? [];
      this.productrefId = data?.productrefId ?? null;
      this.createdby = data?.loggedInProfileId ?? '';
    }

    // With no selection, the Add tab is disabled — open straight to History.
    this.tab = this.participants.length ? 0 : 1;

    this.form = this.fb.group({
      productref: [null, Validators.required],
      packageref: [null, Validators.required],
      minimumpayment: [null, Validators.required],
      description: [
        '',
        [Validators.required, Validators.minLength(DESCRIPTION_MIN_LENGTH)],
      ],
    });
  }

  ngOnInit() {
    getDocs(query(collection(this.firestore, 'products'), orderBy('product', 'asc'))).then(
      (products) => {
        let docs = products.docs;
        if (this.productrefId) {
          docs = docs.filter((d) => d.id === this.productrefId);
        }
        for (const d of docs) {
          const productdata: any = d.data();
          productdata['id'] = productdata['id'] ?? d.id;
          this.mapMinimumRequiredAmount[productdata['id']] = productdata['minimumrequiredamount'];
          this.productsList.push(productdata);
        }
        // Pre-select when the dialog was opened for a single product
        if (this.productrefId) {
          this.selectedProduct = this.productrefId;
          this.onProductChange();
        }
      }
    );

    getDocs(query(collection(this.firestore, 'package'), orderBy('package'))).then((packagelist) => {
      this.allpackageList = packagelist.docs.map((d) => {
        const data: any = d.data();
        data['docid'] = d.id;
        return data;
      });
    });

    // Opened with no selection → History is the only tab; start it live immediately.
    if (this.tab === 1) this.startHistory();
  }

  ngOnDestroy() {
    this.batchUnsub?.();
    this.historyUnsub?.();
  }

  get selectedCount(): number {
    return this.participants.length;
  }

  /** Products filtered by the in-dropdown search box. */
  filteredProducts(): any[] {
    const f = (this.productFilter || '').trim().toLowerCase();
    if (!f) return this.productsList;
    return this.productsList.filter((p) => (p.product || '').toLowerCase().includes(f));
  }

  get chunkCount(): number {
    return Math.ceil(this.participants.length / 100) || 0;
  }

  /** Prefill minimum payment from the product's required amount when a product is picked. */
  onProductChange() {
    this.form.patchValue({ productref: this.selectedProduct });
    const prefill = this.selectedProduct
      ? this.mapMinimumRequiredAmount[this.selectedProduct]
      : null;
    if (prefill != null && (this.form.value.minimumpayment == null || this.form.value.minimumpayment === '')) {
      this.form.patchValue({ minimumpayment: prefill });
    }
  }

  get canSubmit(): boolean {
    return this.form.valid && this.participants.length > 0 && !this.submitting;
  }

  async submit() {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    this.batchUnsub?.();
    this.batchProgress = null;
    try {
      const v = this.form.value;
      const { batchId } = await this.createJobs({
        participants: this.participants,
        productref: v.productref,
        packageref: v.packageref ?? null,
        minimumpayment: v.minimumpayment ?? null,
        description: (v.description ?? '').trim(),
        createdby: this.createdby,
      });

      this.lastBatch = { batchId, total: this.participants.length };
      // Non-blocking: watch the batch's chunks fill in.
      this.batchUnsub = this.watchBatch(batchId, (chunks) => {
        const success = chunks.reduce((n, j) => n + (j.success?.length ?? 0), 0);
        const failures = chunks.reduce((n, j) => n + (j.failures?.length ?? 0), 0);
        const total = chunks.reduce((n, j) => n + (j.totalcount ?? 0), 0);
        this.batchProgress = { success, failures, total };
      });

      // Reset the add form so a second product can be queued immediately.
      this.selectedProduct = null;
      this.form.reset();
    } catch (err) {
      console.error('Failed to create bulk product jobs', err);
    } finally {
      this.submitting = false;
    }
  }

  /** True when nothing is selected — the Add tab is then disabled (History only). */
  get addDisabled(): boolean {
    return this.selectedCount === 0;
  }

  setTab(index: number) {
    if (index === 0 && this.addDisabled) return; // can't add with no selection
    this.tab = index;
    this.onTabChange(index);
  }

  onTabChange(index: number) {
    if (index === 1 && !this.historyUnsub) this.startHistory();
  }

  /** Subscribe to a live history page of `historyLimit` jobs. */
  private startHistory() {
    this.historyUnsub?.();
    this.historyLoading = true;
    this.historyUnsub = this.watchJobs(this.historyLimit, (jobs, reachedEnd) => {
      this.jobs = jobs;
      this.historyDone = reachedEnd;
      this.historyLoading = false;
      const creatorIds = jobs
        .filter((j) => j.createdby && !this.metaCache.has(j.createdby))
        .map((j) => j.createdby);
      if (creatorIds.length) {
        this.getMeta(creatorIds).then((m) => m.forEach((v, k) => this.metaCache.set(k, v)));
      }
    });
  }

  /** Re-open the live history (used by the post-submit "view history" link). */
  loadHistory(_reset = false) {
    this.startHistory();
  }

  /** Grow the live window by one page. */
  loadMore() {
    this.historyLimit += HISTORY_PAGE_SIZE;
    this.startHistory();
  }

  /** Manual retry: re-arm the flag. The CF re-fires and drains `failures`. */
  async retry(job: BulkJobDoc) {
    await updateDoc(doc(this.firestore, BULK_JOBS_COLLECTION, job.docid), { retry: true });
    job.retry = true; // optimistic — disables the button until the CF re-runs
  }

  /** Clear a dead claim (crashed run) so the job can run again. */
  async reset(job: BulkJobDoc) {
    await updateDoc(doc(this.firestore, BULK_JOBS_COLLECTION, job.docid), {
      processing: false,
      retry: true,
    });
    job.processing = false;
    job.retry = true;
  }

  // --- template helpers ---
  statusOf(job: BulkJobDoc): 'queued' | 'running' | 'done' | 'attention' | 'stuck' {
    if (this.isStuck(job)) return 'stuck';
    if (job.processing) return 'running';
    if (job.retry) return 'queued';
    return (job.failures?.length ?? 0) > 0 ? 'attention' : 'done';
  }
  /** Retry is offered only when there is something to retry and nothing is running. */
  canRetry(job: BulkJobDoc): boolean {
    return (job.failures?.length ?? 0) > 0 && !job.retry && !job.processing;
  }
  /** A job is "stuck" when a claim is held but older than the stale threshold. */
  isStuck(job: BulkJobDoc): boolean {
    if (!job.processing || !job.claimedAt) return false;
    const claimedMs = typeof job.claimedAt?.toMillis === 'function' ? job.claimedAt.toMillis() : 0;
    return claimedMs > 0 && Date.now() - claimedMs > STALE_CLAIM_MS;
  }
  productName(id: string): string {
    const p = this.productsList.find((x) => x.id === id);
    return p?.product ?? id;
  }
  packageName(id: string | null): string {
    if (!id) return '—';
    const p = this.allpackageList.find((x) => x.docid === id);
    return p?.package ?? id;
  }
  createdLabel(job: BulkJobDoc): string {
    const ts = job.createdat;
    const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : ts ? new Date(ts) : null;
    if (!d) return '';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  /** Open the participant list for a job in its own overlay dialog (not an inline panel). */
  async openParticipants(job: BulkJobDoc) {
    // Resolve participant metadata for this job's ids at display time.
    const ids = [
      ...(job.success || []),
      ...(job.failures || []).map((f) => f.profileid),
    ].filter((id) => id && !this.metaCache.has(id));
    if (ids.length) {
      const m = await this.getMeta(ids);
      m.forEach((v, k) => this.metaCache.set(k, v));
    }
    this.dialog.open(this.participantsTpl, {
      data: job,
      panelClass: 'bap-overlay',
      width: '560px',
      maxHeight: '82vh',
      autoFocus: false,
    });
  }

  /** Render helpers. `success` entries are plain profileid strings; `failures` are {profileid, reason}. */
  pId(p: any): string {
    return p && typeof p === 'object' ? p.profileid : p;
  }
  metaOf(p: any): ParticipantMeta {
    return this.metaCache.get(this.pId(p)) || {};
  }
  pName(p: any): string {
    return this.metaOf(p).name || this.pId(p) || '';
  }
  reasonOf(p: any): string {
    // Every entry in the failures list is a failure; show the specific reason when the doc has one
    // (current CF stores {profileid, reason}), else a generic tag for older/lean data.
    if (p && typeof p === 'object') return p.reason || p.error || 'failed';
    return 'failed';
  }

  /** Failures grouped by reason, so the participants modal can show one section per reason. */
  failureGroups(job: BulkJobDoc): { reason: string; items: any[] }[] {
    const map = new Map<string, any[]>();
    for (const p of job.failures || []) {
      const r = this.reasonOf(p);
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(p);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([reason, items]) => ({ reason, items }));
  }
  creatorLabel(job: BulkJobDoc): string {
    return this.metaCache.get(job.createdby)?.name || job.createdby || '—';
  }
  donePct(job: BulkJobDoc): number {
    const total = job.totalcount || (job.success?.length ?? 0) + (job.failures?.length ?? 0);
    if (!total) return 0;
    return Math.round(((job.success?.length ?? 0) / total) * 100);
  }
  trackByDocid(_i: number, job: BulkJobDoc) {
    return job.docid;
  }
  trackByProfile(_i: number, r: any) {
    return r && typeof r === 'object' ? r.profileid : r;
  }

  // --- Firestore access (formerly BulkProductJobService) -----------------

  /** Split `items` into contiguous chunks of at most `size`. */
  private chunkArr<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }

  /**
   * Create one job doc per chunk of `CHUNK_SIZE` participants, all sharing a `batchId`.
   * Each doc is created `retry:true` — the "please process me" signal + refire guard the CF clears.
   */
  private async createJobs(params: {
    participants: BulkJobParticipant[];
    productref: string;
    packageref: string | null;
    minimumpayment: number | null;
    description: string;
    createdby: string;
  }): Promise<{ batchId: string; jobIds: string[] }> {
    const col = collection(this.firestore, BULK_JOBS_COLLECTION);
    const batchId = doc(col).id;
    const jobIds: string[] = [];
    await Promise.all(
      this.chunkArr(params.participants, CHUNK_SIZE).map((chunkParticipants) => {
        const jobRef = doc(col);
        const payload: BulkJobDoc = {
          docid: jobRef.id,
          batchId,
          createdat: serverTimestamp(),
          createdby: params.createdby,
          description: params.description,
          productref: params.productref,
          packageref: params.packageref,
          minimumpayment: params.minimumpayment,
          profiles: chunkParticipants.map((p) => p.profileid),
          retry: true,
          processing: false,
          claimedAt: null,
          success: [],
          failures: [],
          totalcount: chunkParticipants.length,
        };
        jobIds.push(jobRef.id);
        return setDoc(jobRef, payload as any);
      })
    );
    return { batchId, jobIds };
  }

  /** Live updates for the chunks of one submit (drives the post-submit toast/badge). */
  private watchBatch(batchId: string, cb: (jobs: BulkJobDoc[]) => void): () => void {
    const q = query(collection(this.firestore, BULK_JOBS_COLLECTION), where('batchId', '==', batchId));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as BulkJobDoc)));
  }

  /** Live history: newest first, up to `pageLimit`. Callback re-fires on any change. */
  private watchJobs(
    pageLimit: number,
    cb: (jobs: BulkJobDoc[], reachedEnd: boolean) => void
  ): () => void {
    const q = query(
      collection(this.firestore, BULK_JOBS_COLLECTION),
      orderBy('createdat', 'desc'),
      limit(pageLimit)
    );
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as BulkJobDoc), snap.size < pageLimit));
  }

  /**
   * Resolve profileids → participant metadata from `participant metadata` (docid = profileid),
   * at DISPLAY time (the job doc stores only ids). Batched by 30 (Firestore `in` limit).
   */
  private async getMeta(ids: string[]): Promise<Map<string, ParticipantMeta>> {
    const map = new Map<string, ParticipantMeta>();
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    for (let i = 0; i < uniq.length; i += 30) {
      const batch = uniq.slice(i, i + 30);
      try {
        const snap = await getDocs(
          query(collection(this.firestore, 'participant metadata'), where(documentId(), 'in', batch))
        );
        snap.docs.forEach((d) => {
          const m = d.data() as any;
          map.set(d.id, {
            name: m?.name ?? null,
            email: m?.email ?? null,
            phonenumber: m?.phonenumber ?? m?.number ?? null,
            countrycode: m?.countrycode ?? null,
            participantmode: m?.participantmode ?? null,
            customerstatus: m?.customerstatus ?? null,
          });
        });
      } catch (e) {
        console.warn('getMeta batch failed', e);
      }
    }
    return map;
  }
}
