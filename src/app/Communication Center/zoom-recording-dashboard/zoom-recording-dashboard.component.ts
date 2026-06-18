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

@Component({
  selector: 'app-zoom-recording-dashboard',
  imports: [MatTableModule, CommonModule, MatFormFieldModule,
    MatInput, FormsModule, MatDatepickerModule,
    MatSelectModule, MatPaginatorModule, MatButtonModule, ReactiveFormsModule],
  templateUrl: './zoom-recording-dashboard.component.html',
  styleUrl: './zoom-recording-dashboard.component.css',
  providers: [provideNativeDateAdapter()],
})
export class ZoomRecordingDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatPaginator) paginator: MatPaginator;
  private firestore: Firestore = inject(Firestore)

  private collRef = collection(this.firestore, 'zoom recordings backup')
  public recordsBackup: MatTableDataSource<any> = new MatTableDataSource([])
  private unsubscribe: Unsubscribe | null = null
  public loading = true

  readonly tableHeaders = ['meetingTopic', 'hostEmail', 'status', 'progress',
    'totalSize', 'totalFiles', 'startTime', 'processingTime', 'file']

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
  }

  private stopSubscription() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null }
  }

  // LIVE subscription scoped to the selected date range (server-side) so we
  // never download the whole 12k-doc collection just to show one day.
  subscribe() {
    this.stopSubscription()
    this.loading = true

    const start = this.form.value.startDate ? new Date(this.form.value.startDate) : new Date()
    const end = this.form.value.endDate ? new Date(this.form.value.endDate) : new Date()
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)

    const q = query(
      this.collRef,
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end)),
      orderBy('timestamp', 'desc'),
      limit(500)
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

  // search / status changed -> client-side refine on the already-scoped data
  applyFilter() {
    this.recordsBackup.filter = JSON.stringify({
      search: this.form.value.search, status: this.form.value.status
    })
  }

  // ---- summary stats (computed from the currently filtered rows) ----
  get stats() {
    const rows = this.recordsBackup.filteredData || []
    const count = (s: string) => rows.filter(r => r.status === s).length
    return {
      total: rows.length,
      completed: count('completed'),
      processing: count('processing'),
      partial: count('partial_success'),
      failed: count('failed'),
    }
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
