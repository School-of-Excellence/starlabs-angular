import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  collection, Firestore, query, where, getDocs, getDoc, doc, getFirestore,
  setDoc
} from '@angular/fire/firestore';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';

// ── Queue options driving the dropdown ───────────────────────────────────────
//   type 'diagnostic' → the FINAL queue (all Active tokens, ATC report happens here)
//   type 'prep'       → a prep queue, filtered to people who crossed Scope Enhancement
//                       but have NOT yet moved to the diagnostic queue
// Add more entries here to extend the dropdown.
type QueueType = 'diagnostic' | 'prep';
interface QueueOption { id: string; label: string; type: QueueType; }

// The diagnostic queue used as the "already moved" reference for prep-queue filtering
const DIAGNOSTIC_QUEUE_ID = 'bk2Fx9B41cGUv4DhrDi0';

const QUEUE_OPTIONS: QueueOption[] = [
  { id: 'bk2Fx9B41cGUv4DhrDi0', label: 'uP!/Legacy Diagnostics & Consultation (Apr–Aug 2026)', type: 'diagnostic' },
  { id: 'vuvS7eBgTxLKufnesLQT', label: 'A&H Evolution Prep - April  · still in prep (not in Diagnostics)',       type: 'prep' },
  { id: 'kOYFTu7SSEUt0IWQErNa', label: 'A&H Evolution Prep - First Cycle · still in prep (not in Diagnostics)', type: 'prep' },
  { id: 'V3hxDtze0zNzTeaTW5Jx', label: 'A&H Evolution Prep - June · still in prep (not in Diagnostics)',        type: 'prep' },
];

interface ParticipantRow {
  docid:          string;
  profile_id:     string;
  profile_name:   string;
  currentstage:   string;
  zoomTranscript: boolean | null;  // null = not checked yet
  flow:           string[];        // chronological queue names → ending at current queue
  flowLoading:    boolean;
  dropboxLink:    string;          // Dropbox transcript link
  linkSaving:     boolean;
  _rawData:       any;             // raw token data (for chain walking)
}

@Component({
  selector: 'app-evolution-prep-participants',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatPaginatorModule, MatSortModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatSelectModule,
    MatProgressSpinnerModule, MatTooltipModule, MatSnackBarModule,
  ],
  templateUrl: './evolution-prep-participants.component.html',
  styleUrl:    './evolution-prep-participants.component.css',
})
export class EvolutionPrepParticipantsComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort)      sort!:      MatSort;

  queueOptions   = QUEUE_OPTIONS;
  selectedQueue  = QUEUE_OPTIONS[0]?.id ?? '';

  loading            = false;
  loadingFlows       = false;
  loadingTranscripts = false;

  dataSource = new MatTableDataSource<ParticipantRow>([]);
  allRows: ParticipantRow[] = [];

  displayedColumns = ['profile_name', 'currentstage', 'zoomTranscript', 'flow', 'dropboxLink'];

  searchText       = '';
  filterTranscript = '';   // '' | 'yes' | 'no'

  // caches to minimise reads while walking transfer chains
  private tokenCache          = new Map<string, any>();     // tokenId → data | null
  private queueNameCache      = new Map<string, string>();  // queueGenId → queuename
  private diagProfileSet: Set<string> | null = null;        // profileids Active in diagnostic queue

  private destroy$ = new Subject<void>();

  constructor(private firestore: Firestore, private snackbar: MatSnackBar) {}

  ngOnInit(): void  { this.load(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  get selectedOption(): QueueOption | undefined {
    return this.queueOptions.find(q => q.id === this.selectedQueue);
  }
  get isPrepQueue(): boolean { return this.selectedOption?.type === 'prep'; }

  async load(): Promise<void> {
    const opt = this.selectedOption;
    if (!opt) return;

    this.loading = true;
    this.allRows = [];
    this.tokenCache.clear();

    const qref = doc(this.firestore, 'queue generation', opt.id);
    const thisQueueName = await this.resolveQueueName(opt.id);

    let tokenDocs: { id: string; data: any }[] = [];

    if (opt.type === 'diagnostic') {
      // All Active tokens in the diagnostic queue
      const snap = await getDocs(
        query(
          collection(this.firestore, 'queue_token'),
          where('queueref',    '==', qref),
          where('tokenstatus', '==', 'Active'),
        )
      );
      tokenDocs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    } else {
      // PREP queue: crossed Scope Enhancement AND not yet moved to Diagnostics
      // 1. stages after Scope Enhancement
      const queueDoc = await getDoc(qref);
      let stagesAfterSE: string[] = [];
      if (queueDoc.exists()) {
        const stages: string[] = queueDoc.data()['stages'] ?? [];
        const seIdx = stages.indexOf('Scope Enhancement');
        stagesAfterSE = seIdx >= 0 ? stages.slice(seIdx + 1) : [];
      }

      if (stagesAfterSE.length > 0) {
        // 2. tokens Active + Approved + currentstage in post-SE
        const snap = await getDocs(
          query(
            collection(this.firestore, 'queue_token'),
            where('queueref',     '==', qref),
            where('tokenstatus',  '==', 'Active'),
            where('stagestatus',  '==', 'Approved'),
            where('currentstage', 'in', stagesAfterSE),
          )
        );
        // 3. exclude anyone already in the diagnostic queue
        const diagSet = await this.getDiagnosticProfileSet();
        tokenDocs = snap.docs
          .map(d => ({ id: d.id, data: d.data() }))
          .filter(t => !diagSet.has(t.data['profile_id']));
      }
    }

    for (const t of tokenDocs) {
      this.allRows.push({
        docid:          t.id,
        profile_id:     t.data['profile_id']   ?? '',
        profile_name:   t.data['profile_name'] ?? '',
        currentstage:   t.data['currentstage'] ?? '',
        zoomTranscript: null,
        flow:           [thisQueueName],   // placeholder until chain is walked
        flowLoading:    true,
        dropboxLink:    '',
        linkSaving:     false,
        _rawData:       t.data,
      });
    }

    this.dataSource.data = this.allRows;
    setTimeout(() => {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort      = this.sort;
    });
    this.loading = false;

    // Non-blocking: build flows + check transcripts
    this.buildAllFlows(thisQueueName);
    this.checkTranscripts();
  }

  // Profileids Active in the diagnostic queue (cached) — used to exclude from prep views
  private async getDiagnosticProfileSet(): Promise<Set<string>> {
    if (this.diagProfileSet) return this.diagProfileSet;
    const diagRef = doc(this.firestore, 'queue generation', DIAGNOSTIC_QUEUE_ID);
    const snap = await getDocs(
      query(
        collection(this.firestore, 'queue_token'),
        where('queueref',    '==', diagRef),
        where('tokenstatus', '==', 'Active'),
      )
    );
    const set = new Set<string>();
    snap.forEach(d => { const p = d.data()['profile_id']; if (p) set.add(p); });
    this.diagProfileSet = set;
    return set;
  }

  // ── Save the Dropbox link onto the Scope Enhancement live-assignment doc ──────
  // Mirrors the cloud-function query: find the participant's "Scope Enhancement"
  // studio (instudio) queue-stage-log, take the latest, follow its liveassignmentid,
  // and store the link + the "need transcripts for SE" flag on that live assignment.
  async saveDropboxLink(row: ParticipantRow): Promise<void> {
    if (!row.profile_id) return;
    row.linkSaving = true;
    try {
      // queue stage log (default DB): 3 equality filters (no composite index needed);
      // logdate ordering done client-side.
      const logSnap = await getDocs(
        query(
          collection(this.firestore, 'queue stage log'),
          where('currentstage', '==', 'Scope Enhancement'),
          where('status',       '==', 'instudio'),
          where('profile_id',   '==', row.profile_id),
        )
      );

      if (logSnap.empty) {
        this.snackbar.open('No Scope Enhancement studio session found for this participant', 'Close', { duration: 4000 });
        return;
      }

      // latest by logdate
      const logs = logSnap.docs.map(d => d.data());
      logs.sort((a, b) =>
        (b['logdate']?.toMillis?.() ?? 0) - (a['logdate']?.toMillis?.() ?? 0));

      const liveAssignmentId = logs[0]['liveassignmentid'];
      if (!liveAssignmentId) {
        this.snackbar.open('No live assignment id on the Scope Enhancement stage log', 'Close', { duration: 4000 });
        return;
      }

      // Save the Dropbox link + flag onto the live assignment doc
      await setDoc(
        doc(this.firestore, 'live assignment', liveAssignmentId),
        {
          dropboxlink:          row.dropboxLink ?? '',
          needtranscriptsforse: true,
        },
        { merge: true },
      );

      this.snackbar.open('Dropbox link saved to live assignment', 'Close', { duration: 2500 });
    } catch (err) {
      console.error('Saving dropbox link failed:', err);
      this.snackbar.open('Failed to save link', 'Close', { duration: 3000 });
    } finally {
      row.linkSaving = false;
    }
  }

  // ── Walk each token backward via tokentransferredfrom to reconstruct journey ──
  async buildAllFlows(diagName: string): Promise<void> {
    this.loadingFlows = true;
    try {
      let done = 0;
      await Promise.all(this.allRows.map(async row => {
        try {
          row.flow = await this.buildFlow(row._rawData, diagName);
        } catch {
          row.flow = [diagName];   // fall back to the current queue only
        }
        row.flowLoading = false;
        // Incremental render every 25 rows so progress is visible
        if (++done % 25 === 0) this.applyFilters();
      }));
      this.applyFilters();
    } catch (err) {
      console.error('Flow build failed:', err);
    } finally {
      this.loadingFlows = false;
    }
  }

  private async buildFlow(startData: any, diagName: string): Promise<string[]> {
    const chain: string[] = [diagName];
    const visited = new Set<string>();
    let cur = startData;
    let hops = 0;

    while (cur && hops < 12) {
      const prevRef = cur['tokentransferredfrom'];
      if (!prevRef || !prevRef.id) break;
      if (visited.has(prevRef.id)) break;   // loop guard
      visited.add(prevRef.id);

      let prevData = this.tokenCache.get(prevRef.id);
      if (prevData === undefined) {
        try {
          const s = await getDoc(prevRef);
          prevData = s.exists() ? s.data() : null;
        } catch { prevData = null; }
        this.tokenCache.set(prevRef.id, prevData);
      }
      if (!prevData) break;

      const pq = prevData['queueref'];
      const qn = pq?.id ? await this.resolveQueueName(pq.id) : '[unknown]';
      chain.push(qn);
      cur = prevData;
      hops++;
    }

    chain.reverse();  // chronological: earliest prep queue → … → diagnostic
    return chain;
  }

  private async resolveQueueName(id: string): Promise<string> {
    if (this.queueNameCache.has(id)) return this.queueNameCache.get(id)!;
    let name = id;
    try {
      const s = await getDoc(doc(this.firestore, 'queue generation', id));
      name = s.exists() ? (s.data()['queuename'] ?? id) : id;
    } catch { /* keep id */ }
    this.queueNameCache.set(id, name);
    return name;
  }

  // ── Zoom transcript check (firestore-atc) ────────────────────────────────────
  async checkTranscripts(): Promise<void> {
    this.loadingTranscripts = true;
    try {
      const atcDb = getFirestore('firestore-atc');
      const transcriptSet = new Set<string>();

      for (const coll of ['queue_atc_generation', 'queue_atc_generation_backup']) {
        const snap = await getDocs(
          query(
            collection(atcDb, coll),
            where('type',  '==', 'zoom'),
            where('stage', '==', 'Scope Enhancement'),
          )
        );
        snap.forEach(d => {
          const data = d.data();
          const dataMap = data['data'] as Record<string, any> | undefined;
          if (dataMap?.['transcript_raw'] && dataMap?.['transcript_text']) {
            transcriptSet.add(data['profileid'] as string);
          }
        });
      }

      // Mutate rows in place — do NOT reassign this.allRows (that would orphan
      // the row objects that buildAllFlows() is concurrently mutating).
      this.allRows.forEach(r => { r.zoomTranscript = transcriptSet.has(r.profile_id); });
      this.applyFilters();
    } catch (err) {
      console.error('Transcript check failed:', err);
    } finally {
      this.loadingTranscripts = false;
    }
  }

  // ── Filters ──────────────────────────────────────────────────────────────────
  applyFilters(): void {
    const term = this.searchText.toLowerCase().trim();
    const tx   = this.filterTranscript;

    this.dataSource.data = this.allRows.filter(r => {
      if (tx === 'yes' && r.zoomTranscript !== true)  return false;
      if (tx === 'no'  && r.zoomTranscript !== false) return false;
      if (term && !r.profile_name.toLowerCase().includes(term) &&
                  !r.profile_id.toLowerCase().includes(term))  return false;
      return true;
    });

    if (this.paginator) this.paginator.firstPage();
  }

  onQueueChange(): void {
    this.searchText = '';
    this.filterTranscript = '';
    this.load();
  }

  clearFilters(): void {
    this.searchText = '';
    this.filterTranscript = '';
    this.applyFilters();
  }

  get totalFiltered(): number { return this.dataSource.data.length; }
  get totalAll():      number { return this.allRows.length; }
  get transcriptYesCount(): number {
    return this.allRows.filter(r => r.zoomTranscript === true).length;
  }
  get transcriptNoCount(): number {
    return this.allRows.filter(r => r.zoomTranscript === false).length;
  }
}

