import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  collection, Firestore, query, where, getDocs, getDoc, doc, getFirestore,
  setDoc, documentId, serverTimestamp
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';

// ── VTT → LLM-friendly transcript ─────────────────────────────────────────────
// The pasted transcript is a .vtt file. Strip the WEBVTT header, cue numbers and
// timestamp lines, then merge consecutive lines from the same speaker into one
// "Speaker: text" entry. (Provided verbatim by the team.)
function convertVttToLLM(vttText: string): string {
  const lines = vttText.trim().split('\n');
  const entries: string[] = [];
  let currentSpeaker: string | null = null;
  let currentText = '';

  for (let line of lines) {
    line = line.trim();
    if (
      !line ||
      line === 'WEBVTT' ||
      /^\d+$/.test(line) ||
      /^\d{2}:\d{2}:\d{2}/.test(line)
    ) continue;

    const match = line.match(/^(.+?):\s+(.+)$/);
    if (match) {
      const speaker = match[1].trim();
      const text = match[2].trim();
      if (speaker === currentSpeaker) {
        currentText += ' ' + text;
      } else {
        if (currentSpeaker) entries.push(`${currentSpeaker}: ${currentText}`);
        currentSpeaker = speaker;
        currentText = text;
      }
    }
  }
  if (currentSpeaker) entries.push(`${currentSpeaker}: ${currentText}`);
  return entries.join('\n');
}

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
  queueName:      string;          // the queue this token belongs to (for multi-queue view)
  zoomTranscript: boolean | null;  // null = not checked yet
  flow:           string[];        // chronological queue names → ending at current queue
  flowLoading:    boolean;
  dropboxLink:    string;          // Dropbox transcript link (manual entry)
  linkSaving:     boolean;
  existingVideoUrl:     string | null;  // most-recent 'participant videos' videourl (for validation)
  existingVideoLoading: boolean;
  hasTranscriptLA:      boolean | null;  // Scope-Enhancement transcript in 'live assignment' (null = checking)
  seSessionTranscript:  boolean | null;  // Branch B (per-SE-session): queue stage log → liveassignmentid → transcript_text&_raw
  seSessionLoading:     boolean;
  linkConfirmed:        boolean;         // "link added elsewhere" checkbox (Not-both rows)
  pasteTranscript:      string;          // Branches tab: manually-pasted SE transcript (→ live assignment)
  transcriptSaving:     boolean;         // save-in-flight for the pasted transcript
  _rawData:       any;             // raw token data (for chain walking)
}

@Component({
  selector: 'app-evolution-prep-participants',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatPaginatorModule, MatSortModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatSelectModule, MatCheckboxModule,
    MatProgressSpinnerModule, MatTooltipModule, MatSnackBarModule,
  ],
  templateUrl: './evolution-prep-participants.component.html',
  styleUrl:    './evolution-prep-participants.component.css',
})
export class EvolutionPrepParticipantsComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort)      sort!:      MatSort;

  queueOptions   = QUEUE_OPTIONS;
  selectedQueues: string[] = QUEUE_OPTIONS[0] ? [QUEUE_OPTIONS[0].id] : [];  // multi-select
  private lastLoadedQueues = '';

  // Existing-Videos tab filter (multi-select): subset of ['transcripts','links','notboth']
  videoFilter: string[] = [];

  loading            = false;
  loadingFlows       = false;
  loadingTranscripts = false;
  videosLoading      = false;
  laLoading          = false;   // live-assignment transcript check
  seLoading          = false;   // Branch B per-session transcript check

  // 'flow'     → the full participant-flow table          (COMMENTED OUT in template)
  // 'videos'   → simple list of participants + videourl    (COMMENTED OUT in template)
  // 'branches' → Participant · Branch B (SE transcript Y/N) · Add transcript/link · queue flow
  // Only the Branches tab is active now — default straight to it.
  viewMode: 'flow' | 'videos' | 'branches' = 'branches';

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

  get selectedOptions(): QueueOption[] {
    return this.queueOptions.filter(q => this.selectedQueues.includes(q.id));
  }

  async load(): Promise<void> {
    const opts = this.selectedOptions;
    this.lastLoadedQueues = [...this.selectedQueues].sort().join(',');
    if (opts.length === 0) {
      this.allRows = [];
      this.dataSource.data = [];
      return;
    }

    this.loading = true;
    this.allRows = [];
    this.tokenCache.clear();

    const rows: ParticipantRow[] = [];
    for (const opt of opts) {
      const qref = doc(this.firestore, 'queue generation', opt.id);
      const thisQueueName = await this.resolveQueueName(opt.id);
      const tokenDocs = await this.loadQueueTokens(opt, qref);
      for (const t of tokenDocs) {
        rows.push({
          docid:          t.id,
          profile_id:     t.data['profile_id']   ?? '',
          profile_name:   t.data['profile_name'] ?? '',
          currentstage:   t.data['currentstage'] ?? '',
          queueName:      thisQueueName,
          zoomTranscript: null,
          flow:           [thisQueueName],   // placeholder until chain is walked
          flowLoading:    true,
          dropboxLink:    '',
          linkSaving:     false,
          existingVideoUrl:     null,
          existingVideoLoading: false,
          hasTranscriptLA:      null,
          seSessionTranscript:  null,
          seSessionLoading:     true,
          linkConfirmed:        false,
          pasteTranscript:      '',
          transcriptSaving:     false,
          _rawData:       t.data,
        });
      }
    }
    this.allRows = rows;

    this.dataSource.data = this.allRows;
    setTimeout(() => {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort      = this.sort;
    });
    this.loading = false;

    // Non-blocking, all independent: build flows · check transcripts · fetch video links
    this.buildAllFlows();
    this.checkTranscripts();
    this.loadExistingVideoLinks();          // participant-videos links
    // COMMENTED OUT: aggregate 'live assignment' check (any SE doc by participantid).
    // Superseded by the per-session loadSessionTranscripts() below, which is the
    // authoritative transcript check (profile_id → queue stage log SE 'instudio' →
    // latest liveassignmentid → that live assignment doc → transcript present?).
    // this.loadLiveAssignmentTranscripts();
    this.loadSessionTranscripts();          // Branch B: per-SE-session transcript (queue stage log → liveassignmentid)
  }

  // Load one queue's tokens (diagnostic → all Active; prep → post-SE, not in Diagnostics)
  private async loadQueueTokens(opt: QueueOption, qref: any): Promise<{ id: string; data: any }[]> {
    if (opt.type === 'diagnostic') {
      const snap = await getDocs(
        query(
          collection(this.firestore, 'queue_token'),
          where('queueref',    '==', qref),
          where('tokenstatus', '==', 'Active'),
        )
      );
      return snap.docs.map(d => ({ id: d.id, data: d.data() }));
    }
    // PREP: crossed Scope Enhancement AND not yet moved to Diagnostics
    const queueDoc = await getDoc(qref);
    let stagesAfterSE: string[] = [];
    if (queueDoc.exists()) {
      const stages: string[] = queueDoc.data()['stages'] ?? [];
      const seIdx = stages.indexOf('Scope Enhancement');
      stagesAfterSE = seIdx >= 0 ? stages.slice(seIdx + 1) : [];
    }
    if (stagesAfterSE.length === 0) return [];
    const snap = await getDocs(
      query(
        collection(this.firestore, 'queue_token'),
        where('queueref',     '==', qref),
        where('tokenstatus',  '==', 'Active'),
        where('stagestatus',  '==', 'Approved'),
        where('currentstage', 'in', stagesAfterSE),
      )
    );
    const diagSet = await this.getDiagnosticProfileSet();
    return snap.docs
      .map(d => ({ id: d.id, data: d.data() }))
      .filter(t => !diagSet.has(t.data['profile_id']));
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
      const liveAssignmentId = await this.resolveSELiveAssignmentId(row.profile_id);
      if (!liveAssignmentId) return;   // snackbar already surfaced by the resolver

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

  // ── Branches tab: save a MANUALLY-PASTED .vtt SE transcript onto live assignment ─
  // Same target doc as saveDropboxLink (SE 'instudio' stage log → latest liveassignmentid).
  // The pasted text is a .vtt file → convertVttToLLM() produces the clean
  // "Speaker: text" transcript that we store as transcript_text; the original
  // .vtt is kept as transcript_raw.
  //
  // ⚠️ FIELD SHAPE PENDING TEAM CONFIRMATION. These four fields mirror the zoom /
  // se_transcript_ingest capture shape documented in
  // journals/2026-07-03-se-transcript-ingest-handoff.md. If the team wants a
  // different shape, change ONLY this object.
  async saveTranscript(row: ParticipantRow): Promise<void> {
    if (!row.profile_id) return;
    const vtt = (row.pasteTranscript ?? '').trim();
    if (!vtt) {
      this.snackbar.open('Paste the .vtt transcript first', 'Close', { duration: 3000 });
      return;
    }
    const converted = convertVttToLLM(vtt);   // .vtt → clean "Speaker: text" lines
    row.transcriptSaving = true;
    try {
      const liveAssignmentId = await this.resolveSELiveAssignmentId(row.profile_id);
      if (!liveAssignmentId) return;   // snackbar already surfaced by the resolver

      await setDoc(
        doc(this.firestore, 'live assignment', liveAssignmentId),
        {
          transcript_text:         converted,   // convertVttToLLM output
          transcript_raw:          vtt,         // original pasted .vtt
          transcriptCapturedAt:    serverTimestamp(),
          transcriptCaptureStatus: 'captured',
        },
        { merge: true },
      );

      row.seSessionTranscript = true;   // reflect on the Branch B column immediately
      this.snackbar.open('Transcript saved to live assignment', 'Close', { duration: 2500 });
    } catch (err) {
      console.error('Saving transcript failed:', err);
      this.snackbar.open('Failed to save transcript', 'Close', { duration: 3000 });
    } finally {
      row.transcriptSaving = false;
    }
  }

  // Resolve a participant's Scope-Enhancement live-assignment doc id.
  // queue stage log (default DB): 3 equality filters (no composite index needed);
  // logdate ordering done client-side. Surfaces its own snackbar on miss and
  // returns null so callers can bail.
  private async resolveSELiveAssignmentId(profileId: string): Promise<string | null> {
    const logSnap = await getDocs(
      query(
        collection(this.firestore, 'queue stage log'),
        where('currentstage', '==', 'Scope Enhancement'),
        where('status',       '==', 'instudio'),
        where('profile_id',   '==', profileId),
      )
    );

    if (logSnap.empty) {
      this.snackbar.open('No Scope Enhancement studio session found for this participant', 'Close', { duration: 4000 });
      return null;
    }

    // latest by logdate
    const logs = logSnap.docs.map(d => d.data());
    logs.sort((a, b) =>
      (b['logdate']?.toMillis?.() ?? 0) - (a['logdate']?.toMillis?.() ?? 0));

    const liveAssignmentId = logs[0]['liveassignmentid'];
    if (!liveAssignmentId) {
      this.snackbar.open('No live assignment id on the Scope Enhancement stage log', 'Close', { duration: 4000 });
      return null;
    }
    return liveAssignmentId as string;
  }

  // ── Walk each token backward via tokentransferredfrom to reconstruct journey ──
  async buildAllFlows(): Promise<void> {
    this.loadingFlows = true;
    try {
      let done = 0;
      await Promise.all(this.allRows.map(async row => {
        try {
          row.flow = await this.buildFlow(row._rawData, row.queueName);
        } catch {
          row.flow = [row.queueName];   // fall back to this row's queue only
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

  // ── Cross-reference existing Dropbox links from the Participant Videos screen ──
  // For participants WITHOUT a Zoom transcript, look up their most-recent
  // 'participant videos' doc (default DB) and surface its videourl for validation.
  // Mirrors the mapping screen's query shape (in + delete==false + recordeddate desc)
  // so no new composite index is required.
  async loadExistingVideoLinks(): Promise<void> {
    if (this.allRows.length === 0) return;

    this.videosLoading = true;
    this.allRows.forEach(r => { r.existingVideoLoading = true; });

    try {
      const ids = [...new Set(this.allRows.map(r => r.profile_id).filter(Boolean))];
      const latestUrl    = new Map<string, string>();  // profileid → most-recent videourl
      const latestMillis = new Map<string, number>();  // profileid → its recordeddate (ms)

      for (const chunk of this.chunkArray(ids, 30)) {
        // NOTE: no orderBy — Firestore's orderBy would DROP docs missing
        // 'recordeddate'. We fetch all non-deleted videos and pick the most
        // recent client-side so null-date docs still surface a link.
        const snap = await getDocs(
          query(
            collection(this.firestore, 'participant videos'),
            where('profileid', 'in', chunk),
            where('delete',    '==', false),
          )
        );
        snap.forEach(d => {
          const data = d.data();
          const pid = data['profileid'] as string | undefined;
          const url = data['videourl']  as string | undefined;
          if (!pid || !url) return;
          const rd = data['recordeddate']?.toMillis?.() ?? 0;
          if (rd >= (latestMillis.get(pid) ?? -1)) {
            latestMillis.set(pid, rd);
            latestUrl.set(pid, url);
          }
        });
      }

      // Mutate rows in place — never reassign this.allRows.
      this.allRows.forEach(r => {
        r.existingVideoUrl     = latestUrl.get(r.profile_id) ?? null;
        r.existingVideoLoading = false;
      });
      this.applyFilters();
    } catch (err) {
      console.error('Existing video-link lookup failed:', err);
      this.allRows.forEach(r => { r.existingVideoLoading = false; });
      this.applyFilters();
    } finally {
      this.videosLoading = false;
    }
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // ── "Link added" checkbox for "Not both" rows ────────────────────────────────
  // The team adds the Dropbox link in the mapping screen (participant videos);
  // ticking the box RE-CHECKS 'participant videos' for this participant and, if a
  // videourl is now present, fetches it → the row moves into "Links". Read-only.
  async recheckLink(row: ParticipantRow): Promise<void> {
    if (!row.linkConfirmed) return;   // only act when ticked
    row.linkSaving = true;
    try {
      const snap = await getDocs(
        query(
          collection(this.firestore, 'participant videos'),
          where('profileid', '==', row.profile_id),
          where('delete',    '==', false),
        )
      );
      let bestUrl: string | null = null, bestMs = -1;
      snap.forEach(d => {
        const x = d.data();
        const url = x['videourl'] as string | undefined;
        if (!url) return;
        const ms = x['recordeddate']?.toMillis?.() ?? 0;
        if (ms >= bestMs) { bestMs = ms; bestUrl = url; }
      });

      if (bestUrl) {
        row.existingVideoUrl = bestUrl;   // now has a link → leaves the "Not both" set
        this.applyFilters();
        this.snackbar.open('Link found in participant videos — moved to Links', 'Close', { duration: 2500 });
      } else {
        row.linkConfirmed = false;        // untick — nothing to fetch yet
        this.snackbar.open('No link found yet. Add it in the mapping screen first, then tick again.', 'Close', { duration: 4000 });
      }
    } catch (err) {
      console.error('Re-check link failed:', err);
      row.linkConfirmed = false;
      this.snackbar.open('Failed to check link', 'Close', { duration: 3000 });
    } finally {
      row.linkSaving = false;
    }
  }

  // ── Validation: does each participant have a Scope-Enhancement transcript ─────
  // in the 'live assignment' collection (default DB)?  Field names taken exactly
  // from the collection: participantid, stagename, transcript_raw, transcript_text.
  // Index-free: query by participantid 'in' (auto-indexed) then filter stagename
  // client-side (no composite index for participantid+stagename exists).
  async loadLiveAssignmentTranscripts(): Promise<void> {
    if (this.allRows.length === 0) return;

    this.laLoading = true;
    try {
      const ids = [...new Set(this.allRows.map(r => r.profile_id).filter(Boolean))];
      const withTranscript = new Set<string>();   // profileids with a real SE transcript

      for (const chunk of this.chunkArray(ids, 30)) {
        const snap = await getDocs(
          query(
            collection(this.firestore, 'live assignment'),
            where('participantid', 'in', chunk),
          )
        );
        snap.forEach(d => {
          const x = d.data();
          if (x['stagename'] === 'Scope Enhancement' &&
              !!x['transcript_raw'] && !!x['transcript_text']) {
            withTranscript.add(x['participantid'] as string);
          }
        });
      }

      // Mutate rows in place — never reassign this.allRows.
      this.allRows.forEach(r => { r.hasTranscriptLA = withTranscript.has(r.profile_id); });
      this.applyFilters();
    } catch (err) {
      console.error('Live-assignment transcript check failed:', err);
      this.allRows.forEach(r => { if (r.hasTranscriptLA === null) r.hasTranscriptLA = false; });
      this.applyFilters();
    } finally {
      this.laLoading = false;
    }
  }

  // ── Branch B: per-SE-session transcript ──────────────────────────────────────
  // For EACH participant: queue stage log (currentstage=='Scope Enhancement',
  // status=='instudio', profile_id==pid) → latest by logdate → its liveassignmentid
  // → live assignment/{id} → Yes iff transcript_text && transcript_raw are present.
  // Keyed on profile_id (NOT queueref): First-Cycle SE ran under the July queue, so a
  // queueref filter would wrongly mark them "no session". Index-free (equality + 'in').
  async loadSessionTranscripts(): Promise<void> {
    if (this.allRows.length === 0) return;

    this.seLoading = true;
    this.allRows.forEach(r => { r.seSessionLoading = true; });
    try {
      const ids = [...new Set(this.allRows.map(r => r.profile_id).filter(Boolean))];
      const latestLid = new Map<string, string>();   // pid → latest-by-logdate liveassignmentid
      const latestMs  = new Map<string, number>();

      for (const chunk of this.chunkArray(ids, 30)) {
        const snap = await getDocs(
          query(
            collection(this.firestore, 'queue stage log'),
            where('currentstage', '==', 'Scope Enhancement'),
            where('status',       '==', 'instudio'),
            where('profile_id',   'in', chunk),
          )
        );
        snap.forEach(d => {
          const x = d.data();
          const pid = x['profile_id']       as string | undefined;
          const lid = x['liveassignmentid'] as string | undefined;
          if (!pid || !lid) return;
          const ms = x['logdate']?.toMillis?.() ?? 0;
          if (ms >= (latestMs.get(pid) ?? -1)) { latestMs.set(pid, ms); latestLid.set(pid, lid); }
        });
      }

      // Batch-read the target live-assignment docs → transcript presence
      const hasT = new Map<string, boolean>();        // liveassignmentid → has transcript
      const lids = [...new Set([...latestLid.values()])];
      for (const chunk of this.chunkArray(lids, 30)) {
        const snap = await getDocs(
          query(
            collection(this.firestore, 'live assignment'),
            where(documentId(), 'in', chunk),
          )
        );
        snap.forEach(d => {
          const x = d.data();
          hasT.set(d.id, !!x['transcript_text'] && !!x['transcript_raw']);
        });
      }

      // Mutate rows in place — never reassign this.allRows.
      this.allRows.forEach(r => {
        const lid = latestLid.get(r.profile_id);
        r.seSessionTranscript = lid ? (hasT.get(lid) ?? false) : false;
        r.seSessionLoading    = false;
      });
    } catch (err) {
      console.error('Session transcript check failed:', err);
      this.allRows.forEach(r => {
        if (r.seSessionTranscript === null) r.seSessionTranscript = false;
        r.seSessionLoading = false;
      });
    } finally {
      this.seLoading = false;
    }
  }

  // ── Branches tab: Participant · Branch A (recent link) · Branch B (transcript) · flow
  branchAFilter:    string[] = [];   // subset of ['link','nolink']
  branchBFilter:    string[] = [];   // subset of ['yes','no']
  branchFlowFilter: string[] = [];   // queue names that must appear in the flow

  get allFlowQueues(): string[] {
    const s = new Set<string>();
    this.allRows.forEach(r => r.flow?.forEach(q => s.add(q)));
    return [...s].sort();
  }

  get branchRows(): ParticipantRow[] {
    const term = this.searchText.toLowerCase().trim();
    return this.allRows.filter(r => {
      if (term && !r.profile_name.toLowerCase().includes(term) &&
                  !r.profile_id.toLowerCase().includes(term)) return false;
      if (this.branchAFilter.length) {
        const hasL = !!r.existingVideoUrl;
        if (!((this.branchAFilter.includes('link') && hasL) ||
              (this.branchAFilter.includes('nolink') && !hasL))) return false;
      }
      if (this.branchBFilter.length) {
        if (!((this.branchBFilter.includes('yes') && r.seSessionTranscript === true) ||
              (this.branchBFilter.includes('no')  && r.seSessionTranscript === false))) return false;
      }
      if (this.branchFlowFilter.length) {
        if (!r.flow?.some(q => this.branchFlowFilter.includes(q))) return false;
      }
      return true;
    });
  }

  clearBranchFilters(): void {
    this.branchAFilter = []; this.branchBFilter = []; this.branchFlowFilter = [];
  }

  get branchLinkCount():   number { return this.allRows.filter(r => !!r.existingVideoUrl).length; }
  get branchNoLinkCount(): number { return this.allRows.filter(r => !r.existingVideoUrl).length; }
  get branchYesCount():    number { return this.allRows.filter(r => r.seSessionTranscript === true).length; }
  get branchNoCount():     number { return this.allRows.filter(r => r.seSessionTranscript === false).length; }

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

  // Reload only when the multi-select dropdown closes AND the selection changed,
  // so we don't re-query on every option toggle.
  onQueueDropdownToggle(open: boolean): void {
    if (open) return;
    const key = [...this.selectedQueues].sort().join(',');
    if (key !== this.lastLoadedQueues) this.onQueueChange();
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

  // ── Videos view: participants filtered by the multi-select (Transcripts/Links/Not both)
  private matchesVideoFilter(r: ParticipantRow): boolean {
    if (this.videoFilter.length === 0) return true;   // no filter → show all
    const hasT = r.hasTranscriptLA === true;
    const hasL = !!r.existingVideoUrl;
    // Exclusive categories: transcript-only, link-only, both, neither.
    return (
      (this.videoFilter.includes('transcripts') && hasT && !hasL) ||
      (this.videoFilter.includes('links')       && hasL && !hasT) ||
      (this.videoFilter.includes('both')        && hasT && hasL) ||
      (this.videoFilter.includes('notboth')     && !hasT && !hasL)
    );
  }

  get videoRows(): ParticipantRow[] {
    const term = this.searchText.toLowerCase().trim();
    return this.allRows.filter(r =>
      this.matchesVideoFilter(r) &&
      (!term ||
        r.profile_name.toLowerCase().includes(term) ||
        r.profile_id.toLowerCase().includes(term)));
  }

  get videoLinkCount():   number { return this.allRows.filter(r => r.existingVideoUrl).length; }
  get laTranscriptCount(): number { return this.allRows.filter(r => r.hasTranscriptLA === true).length; }
  get neitherCount(): number {
    return this.allRows.filter(r => r.hasTranscriptLA !== true && !r.existingVideoUrl).length;
  }
  // exclusive counts for the filter options
  get transcriptsOnlyCount(): number {
    return this.allRows.filter(r => r.hasTranscriptLA === true && !r.existingVideoUrl).length;
  }
  get linksOnlyCount(): number {
    return this.allRows.filter(r => r.hasTranscriptLA !== true && !!r.existingVideoUrl).length;
  }
  get bothCount(): number {
    return this.allRows.filter(r => r.hasTranscriptLA === true && !!r.existingVideoUrl).length;
  }
  // a "not both" row = no transcript AND no link (target for adding a Dropbox link)
  isNotBoth(r: ParticipantRow): boolean {
    return r.hasTranscriptLA === false && !r.existingVideoUrl;
  }
}

