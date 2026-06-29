import { Component, inject, OnInit, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, orderBy, query, where, limit, onSnapshot, Timestamp, Unsubscribe } from '@angular/fire/firestore';
import { MatTableModule, MatTableDataSource } from "@angular/material/table";
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FormsModule, FormControl, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ZoomMigrationService, ZoomRecording } from './zoom-migration.service';

@Component({
  selector: 'app-zoom-recording-dashboard',
  imports: [MatTableModule, CommonModule, MatFormFieldModule,
    MatInput, FormsModule, MatDatepickerModule,
    MatSelectModule, MatPaginatorModule, MatButtonModule, ReactiveFormsModule,
    MatProgressSpinnerModule],
  templateUrl: './zoom-recording-dashboard.component.html',
  styleUrl: './zoom-recording-dashboard.component.css',
  providers: [provideNativeDateAdapter()],
})
export class ZoomRecordingDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatPaginator) paginator: MatPaginator;
  private firestore: Firestore = inject(Firestore)
  private migrationApi = inject(ZoomMigrationService)

  private collRef = collection(this.firestore, 'zoom recordings backup')
  public recordsBackup: MatTableDataSource<any> = new MatTableDataSource([])
  private unsubscribe: Unsubscribe | null = null
  public loading = true

  // ── Zoom "fetch a date + migrate on demand" panel state ──────────────────
  public showZoomPanel = false
  public zoomLoading = false
  public zoomError: string | null = null
  public zoomRecordings: ZoomRecording[] = []
  // Rows actually shown in the migrate panel: fetched recordings MINUS the ones
  // already fully migrated (status 'completed'). Recomputed on every snapshot.
  public visibleZoomRecordings: ZoomRecording[] = []
  // How many fetched recordings are hidden because they're already completed.
  public migratedCount = 0
  public readonly zoomTableHeaders = ['topic', 'hostEmail', 'startTime', 'files', 'totalSize', 'migration', 'action']
  // Live Firestore docs matched to fetched recordings by meetinguid.
  private migrationByUuid = new Map<string, any>()
  // uuids the user just clicked Migrate on, before a Firestore doc appears.
  private queuedUuids = new Set<string>()
  private zoomUnsubs: Unsubscribe[] = []

  readonly tableHeaders = ['meetingTopic', 'hostEmail', 'status', 'zoom', 'progress',
    'totalSize', 'totalFiles', 'startTime', 'processingTime', 'file']

  // ── "still in Zoom?" tracking ────────────────────────────────────────────
  // uuids + meetingIds currently present in Zoom for the loaded date range, so
  // we can flag whether each migrated recording still exists in Zoom (it may
  // have been deleted from Zoom after backup). Refreshed with the table query.
  private zoomPresentUuids = new Set<string>()
  private zoomPresentMeetingIds = new Set<string>()
  public zoomPresenceLoaded = false

  public files: Array<any> | null = null
  public activeRecord: any = null
  readonly filetableHeaders = ['fileName', 'fileSize', 'fileType', 'progress', 'status']

  form = new FormGroup({
    search: new FormControl<string>(''),
    startDate: new FormControl<Date | null>(new Date()),
    endDate: new FormControl<Date | null>(new Date()),
    status: new FormControl<string>('')
  })

  constructor() { }

  ngOnInit(): void {
    this.recordsBackup.filterPredicate = this.filterPredicate
    this.subscribe()
  }

  ngAfterViewInit(): void {
    this.recordsBackup.paginator = this.paginator;
  }

  ngOnDestroy(): void {
    this.stopSubscription()
    this.stopZoomMatching()
  }

  private stopSubscription() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null }
  }

  // LIVE subscription scoped to the selected date range (server-side) so we
  // never download the whole 12k-doc collection just to show one day. The range
  // is matched against the MEETING start time (`startTime`), not the processing
  // date (`timestamp`) — so a meeting shows up under the day it was held, even
  // if it was migrated/processed later.
  subscribe() {
    this.stopSubscription()
    this.loading = true
    this.loadZoomPresence()

    const start = this.form.value.startDate ? new Date(this.form.value.startDate) : new Date()
    const end = this.form.value.endDate ? new Date(this.form.value.endDate) : new Date()
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)

    const q = query(
      this.collRef,
      where('startTime', '>=', Timestamp.fromDate(start)),
      where('startTime', '<=', Timestamp.fromDate(end)),
      orderBy('startTime', 'desc'),
      // limit(500)
    )

    this.unsubscribe = onSnapshot(q, (snap) => {
      const openId = this.openRecordId
      this.recordsBackup.data = snap.docs.map((doc) => {
        const data = doc.data() as any
        return { id: doc.id, ...data, startTime: this.toDate(data['startTime']) }
      })
      this.applyFilter()
      if (openId) this.openFileModel(openId)
      this.loading = false
    }, () => { this.loading = false })
  }

  // date range changed -> re-query server-side
  onDateChange() {
    if (this.form.value.startDate && this.form.value.endDate) this.subscribe()
  }

  // Fetch the recordings currently in Zoom for the selected range and index them
  // by uuid + meetingId, so each migrated row can show whether it still exists in
  // Zoom. Best-effort: on failure we leave presence "unknown" rather than wrong.
  private async loadZoomPresence() {
    const start = this.form.value.startDate ? new Date(this.form.value.startDate) : new Date()
    const end = this.form.value.endDate ? new Date(this.form.value.endDate) : start
    this.zoomPresenceLoaded = false
    try {
      const recs = await this.migrationApi.listRecordings(this.ymd(start), this.ymd(end))
      this.zoomPresentUuids = new Set(recs.map(r => r.uuid).filter(Boolean))
      this.zoomPresentMeetingIds = new Set(recs.map(r => String(r.meetingId)).filter(Boolean))
      this.zoomPresenceLoaded = true
    } catch {
      this.zoomPresenceLoaded = false
    }
  }

  // 'yes' | 'no' | 'unknown' — whether this migrated recording still exists in
  // Zoom. Matches on uuid first (unique per recording), then meetingId.
  existsInZoom(record: any): 'yes' | 'no' | 'unknown' {
    if (!this.zoomPresenceLoaded) return 'unknown'
    if (record?.meetinguid && this.zoomPresentUuids.has(record.meetinguid)) return 'yes'
    if (record?.meetingId != null && this.zoomPresentMeetingIds.has(String(record.meetingId))) return 'yes'
    return 'no'
  }

  // search / status changed -> client-side refine on the already-scoped data
  applyFilter() {
    this.recordsBackup.filter = JSON.stringify({
      search: this.form.value.search, status: this.form.value.status
    })
  }

  // ── Zoom panel: fetch a date's recordings + migrate on demand ────────────

  toggleZoomPanel() {
    this.showZoomPanel = !this.showZoomPanel
    if (this.showZoomPanel && this.zoomRecordings.length === 0) this.loadZoomRecordings()
  }

  private ymd(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  // Pull the selected date range's recordings straight from Zoom (via the
  // migration server), then start matching them to Firestore by meetinguid.
  async loadZoomRecordings() {
    const start = this.form.value.startDate ? new Date(this.form.value.startDate) : new Date()
    const end = this.form.value.endDate ? new Date(this.form.value.endDate) : start
    this.zoomLoading = true
    this.zoomError = null
    try {
      this.zoomRecordings = await this.migrationApi.listRecordings(this.ymd(start), this.ymd(end))
      this.startZoomMatching(this.zoomRecordings.map(r => r.uuid))
      this.recomputeVisible()
    } catch (e: any) {
      this.zoomError = e?.error?.error || e?.message || 'Failed to load Zoom recordings'
      this.zoomRecordings = []
      this.recomputeVisible()
    } finally {
      this.zoomLoading = false
    }
  }

  private isToday(rec: ZoomRecording): boolean {
    const d = this.toDate(rec.startTime)
    if (!d) return false
    const now = new Date()
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }

  // Which recordings the migrate panel lists. Always hidden: already-completed
  // ones (they live in the backup table below). For TODAY's recordings we also
  // hide the ones that aren't actionable yet — size 0 (Zoom is still generating
  // the media) and ones actively migrating — since those are just noise while a
  // meeting is fresh. For PREVIOUS dates we show everything that isn't complete,
  // so a stuck/stalled or "no media" recording stays visible to act on.
  // Recomputed on every live meetinguid match so rows appear/vanish in step
  // with Firestore. Kept as a field (not a getter) to avoid churning mat-table.
  private recomputeVisible() {
    let completed = 0
    this.visibleZoomRecordings = this.zoomRecordings.filter(r => {
      const doc = this.migrationByUuid.get(r.uuid)
      if (doc && doc.status === 'completed') { completed++; return false }
      if (this.isToday(r)) {
        if (r.totalSize <= 0) return false                                   // Zoom not ready yet
        if (doc?.status === 'processing' || this.isQueued(r.uuid)) return false // actively migrating
      }
      return true
    })
    this.migratedCount = completed
  }

  // Click "Migrate" → POST the same payload Zoom sends. Live status then flows
  // back through the meetinguid match below.
  async migrate(rec: ZoomRecording) {
    this.queuedUuids.add(rec.uuid)
    this.zoomError = null
    try {
      await this.migrationApi.migrate(rec)
    } catch (e: any) {
      this.queuedUuids.delete(rec.uuid)
      this.zoomError = e?.error?.error || e?.message || `Failed to start migration for ${rec.topic}`
    }
  }

  // Live-subscribe to the backup docs whose meetinguid matches a fetched
  // recording. Firestore `in` filters cap at 10 values, so chunk the uuids.
  private startZoomMatching(uuids: string[]) {
    this.stopZoomMatching()
    this.migrationByUuid.clear()
    const chunks: string[][] = []
    for (let i = 0; i < uuids.length; i += 10) chunks.push(uuids.slice(i, i + 10))
    for (const chunk of chunks) {
      if (!chunk.length) continue
      const q = query(this.collRef, where('meetinguid', 'in', chunk))
      const unsub = onSnapshot(q, (snap) => {
        const present = new Set<string>()
        snap.docs.forEach((d) => {
          const data = d.data() as any
          if (!data?.meetinguid) return
          present.add(data.meetinguid)
          this.migrationByUuid.set(data.meetinguid, { id: d.id, ...data })
          this.queuedUuids.delete(data.meetinguid) // a real doc now exists
        })
        // Reconcile deletions: if a doc for one of this chunk's uuids no longer
        // exists (e.g. a retry deleted the stale doc), drop the stale entry so
        // the row reverts to its real state instead of showing the old status.
        for (const u of chunk) {
          if (!present.has(u)) this.migrationByUuid.delete(u)
        }
        this.recomputeVisible() // a row may have just completed → drop it
      })
      this.zoomUnsubs.push(unsub)
    }
  }

  private stopZoomMatching() {
    this.zoomUnsubs.forEach((u) => u())
    this.zoomUnsubs = []
  }

  // ---- per-recording migration view (matched by meetinguid) ----
  migrationFor(uuid: string): any | null { return this.migrationByUuid.get(uuid) || null }

  migrationLabel(rec: ZoomRecording): string {
    const doc = this.migrationByUuid.get(rec.uuid)
    if (doc) return this.isStaleProcessing(rec) ? 'stalled' : doc.status
    if (this.queuedUuids.has(rec.uuid)) return 'queued'
    return 'not migrated'
  }

  isQueued(uuid: string): boolean { return this.queuedUuids.has(uuid) && !this.migrationByUuid.has(uuid) }

  // CSS status-* suffix for the migration badge (stale 'processing' → warn).
  migrationBadgeClass(rec: ZoomRecording): string {
    if (this.isStaleProcessing(rec)) return 'partial_success'
    const doc = this.migrationByUuid.get(rec.uuid)
    if (doc) return doc.status
    return this.isQueued(rec.uuid) ? 'processing' : 'none'
  }

  // A doc stuck at 'processing' for longer than the server's max run window
  // (6h) is abandoned — the migration died and left the doc frozen. We treat it
  // as retryable rather than "in flight".
  private readonly STALE_PROCESSING_MS = 6 * 60 * 60 * 1000
  isStaleProcessing(rec: ZoomRecording): boolean {
    const doc = this.migrationByUuid.get(rec.uuid)
    if (!doc || doc.status !== 'processing') return false
    const started = this.toDate(doc.processingStartedAt) || this.toDate(doc.timestamp)
    if (!started) return true
    return Date.now() - started.getTime() > this.STALE_PROCESSING_MS
  }

  // True while a matched doc is genuinely being processed right now (so we show
  // "Migrating…" and hide the button). A stale/stuck 'processing' doc is NOT in
  // flight — it should offer Retry instead.
  isInFlight(rec: ZoomRecording): boolean {
    const doc = this.migrationByUuid.get(rec.uuid)
    return this.isQueued(rec.uuid) || (doc?.status === 'processing' && !this.isStaleProcessing(rec))
  }

  migrationPercent(rec: ZoomRecording): number {
    const doc = this.migrationByUuid.get(rec.uuid)
    return doc ? this.recordPercent(doc) : 0
  }

  // Show the Migrate button only when the recording actually CAN be migrated:
  // it has media (size > 0), it isn't already completed, and it isn't currently
  // in flight. Size 0 means Zoom has no downloadable media yet (still
  // processing on Zoom's side / nothing recorded).
  canMigrate(rec: ZoomRecording): boolean {
    if (rec.totalSize <= 0) return false
    if (this.isInFlight(rec)) return false
    const doc = this.migrationByUuid.get(rec.uuid)
    return doc?.status !== 'completed'
  }

  // ---- migration cost estimate ----
  // Internet egress (Cloud Run → Dropbox) is the dominant per-GB migration cost.
  // GCP us-central1 internet egress is $0.12/GB (first 1 TB/mo); compute is
  // negligible once the service scales to zero, so we estimate from GB egressed.
  readonly costPerGbUsd = 0.12
  // USD → INR. Adjust as the rate moves (≈ ₹94.5 / $1 as of Jun 2026).
  readonly usdToInr = 94.5

  // ---- summary stats (computed from the currently filtered rows) ----
  get stats() {
    const rows = this.recordsBackup.filteredData || []
    const count = (s: string) => rows.filter(r => r.status === s).length
    const uploadedBytes = rows.reduce((sum, r) => sum + this.uploadedBytesFor(r), 0)
    const uploadedGb = uploadedBytes / (1024 ** 3)
    const costUsd = uploadedGb * this.costPerGbUsd
    return {
      total: rows.length,
      completed: count('completed'),
      processing: count('processing'),
      partial: count('partial_success'),
      failed: count('failed'),
      uploadedGb,
      costUsd,
      costInr: costUsd * this.usdToInr,
    }
  }

  // Bytes actually pushed to Dropbox for one record: a file counts its full size
  // once 'success', otherwise its live uploaded byte count (so in-flight and
  // partial_success records contribute what they've already sent). Legacy docs
  // with no per-file map fall back to totalSize when completed.
  private uploadedBytesFor(record: any): number {
    const files = this.normalizeFiles(record?.files)
    if (!files.length) return record?.status === 'completed' ? (Number(record?.totalSize) || 0) : 0
    return files.reduce((sum, f) =>
      sum + (f.status === 'success' ? (Number(f.fileSize) || 0) : (Number(f.uploadedBytes) || 0)), 0)
  }

  // ---- file modal ----
  private openRecordId: string | null = null

  openFileModel(recordId: string) {
    this.openRecordId = recordId
    const record = this.recordsBackup.data.find((r) => r.id === recordId)
    this.activeRecord = record ?? null
    this.files = this.normalizeFiles(record?.files)
  }

  closeFileModel() {
    this.files = null
    this.activeRecord = null
    this.openRecordId = null
  }

  private normalizeFiles(files: any): Array<any> {
    if (!files) return []
    if (Array.isArray(files)) return files
    if (typeof files === 'object') return Object.values(files)
    return []
  }

  // Web link to the Dropbox folder this recording's files live in. The folder is
  // derived from any uploaded file's `dropboxPath` (drop the filename), then
  // resolved to a real shared link by the server (files live in the team space,
  // so a client-built /home/<path> URL 404s). Null until a file has landed in
  // Dropbox, or when the API base isn't configured.
  dropboxFolderUrl(record: any): string | null {
    const withPath = this.normalizeFiles(record?.files).find(f => f?.dropboxPath)
    const path: string | undefined = withPath?.dropboxPath
    if (!path) return null
    const folder = path.substring(0, path.lastIndexOf('/'))
    if (!folder) return null
    return this.migrationApi.folderOpenUrl(folder) || null
  }

  // ---- formatting helpers ----
  formatBytes(bytes: any): string {
    const n = Number(bytes)
    if (!n || n <= 0) return '0 MB'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
    return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
  }

  formatDuration(ms: any): string {
    const n = Number(ms)
    if (!n || n <= 0) return '—'
    const totalSec = Math.round(n / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  toDate(value: any): Date | null {
    if (!value) return null
    if (typeof value === 'string') return new Date(value)
    if (value instanceof Date) return value
    if (typeof value.toDate === 'function') return value.toDate()
    return null
  }

  // meeting end = start + duration (Zoom duration is in minutes)
  endTime(record: any): Date | null {
    const start = this.toDate(record?.startTime)
    if (!start) return null
    const mins = Number(record?.duration) || 0
    return new Date(start.getTime() + mins * 60000)
  }

  // when our pipeline started / finished processing this recording
  processingStart(record: any): Date | null {
    return this.toDate(record?.processingStartedAt)
  }
  processingEnd(record: any): Date | null {
    return this.toDate(record?.completedAt || record?.failedAt)
  }

  // overall % across a record's files (for the inline progress in the table)
  recordPercent(record: any): number {
    const files = this.normalizeFiles(record?.files)
    if (!files.length) return record?.status === 'completed' ? 100 : 0
    const sum = files.reduce((a, f) => a + (f.status === 'success' ? 100 : (f.percent || 0)), 0)
    return Math.round(sum / files.length)
  }

  formatDisplayData(object: any, property: string) {
    if (object && object.hasOwnProperty(property)) return object[property]
    return ''
  }

  private filterPredicate(data: any, filter: string) {
    const parsedFilter = JSON.parse(filter)
    let search = true
    let status = true

    if (parsedFilter.search) {
      const s = parsedFilter.search.toLowerCase().trim()
      const meetingTopic = (data.meetingTopic || '').toLowerCase().trim()
      const hostEmail = (data.hostEmail || '').toLowerCase()
      search = (String(data.meetingId).startsWith(s) || meetingTopic.includes(s) || hostEmail.includes(s))
    }
    if (parsedFilter.status) {
      status = data.status === parsedFilter.status
    }
    return search && status
  }
}
