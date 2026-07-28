import { Component, inject, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTable, MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../authguard.service';
import {
  arrayRemove, arrayUnion, collection, collectionData, doc, DocumentReference,
  Firestore, getDocs, limit, orderBy, query, setDoc, updateDoc, where
} from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** Collection a reference can point at -> the tag we show next to the title. */
const KIND_LABEL = {
  'event collection': 'Live Event',
  'queue generation': 'Queue Event',
  'workshopconfiguration': 'Workshop',
  'eiflix workshop': 'Workshop'
}

/** Newest-first page size used only when no filter is active. */
const DEFAULT_LIMIT = 200

/** Firestore caps an "in" clause at 30 values. */
const IN_CHUNK = 30

/** Options rendered per dropdown. Participants run to thousands — rendering
 *  them all locks the panel, so the list is capped and the search narrows it. */
const MAX_OPTIONS = 100

@Component({
  selector: 'app-participant-videoask',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    FormsModule,
    CommonModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatDatepickerModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './participant-videoask.component.html',
  styleUrl: './participant-videoask.component.css'
})
export class ParticipantVideoaskComponent {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort, { static: true }) sort: MatSort;
  @ViewChild('table', { static: true }) table: MatTable<any>;

  displayedColumns: string[] = ['profileid', 'videoaskid', 'event', 'fileurl', 'uploaded', 'addtohighlights', 'tag']
  dataSource = new MatTableDataSource()

  form: FormGroup

  // participants
  participantList = []
  participantMap = {}
  participantDoc = {}
  filteredParticipantList = []

  // videoask templates
  templateList = []
  templateMap = {}
  filteredTemplateList = []

  // events, one normalised list per dimension
  liveEventList = []
  queueEventList = []
  workshopList = []
  filteredLiveEventList = []
  filteredQueueEventList = []
  filteredWorkshopList = []

  /**
   * Every event-ish doc keyed by its Firestore reference PATH, so a row is
   * resolved by ref.path in one lookup no matter which field held the ref.
   */
  eventIndex = {}

  videoAskTags = []
  loggedInProfileid = null

  // in-panel search text, one per dropdown
  searchText = { profileid: '', template: '', live: '', queue: '', workshop: '' }

  // view state
  bootstrapping = true
  fetching = false
  isDefaultView = true
  rowCount = 0
  playing = new Set<string>()

  /** Filters were edited but Search has not been clicked yet. */
  filtersDirty = false

  /** Table-level filter over already-loaded rows. Never hits Firestore. */
  tagFilter: 'all' | 'tagged' | 'untagged' = 'all'
  taggedCount = 0
  untaggedCount = 0

  /** Second, independent table-level filter: show rows carrying ANY of these tag ids. */
  selectedTags: string[] = []

  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)

  constructor(
    public guard: AuthguardService,
    private formbuilder: FormBuilder
  ) {
    this.form = this.formbuilder.group({
      profileid: [[],],
      template: [[],],
      live: [[],],
      queue: [[],],
      workshop: [[],],
      range: new FormGroup({
        start: new FormControl(),
        end: new FormControl()
      })
    })

    this.guard.getRoles().then(roles => {
      this.loggedInProfileid = roles['profile_ref'].id
    })

    this.bootstrap()

    // Editing a filter never queries — it only marks the bar as unapplied.
    // The query runs on Search.
    this.form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.filtersDirty = true)
  }

  ngOnInit(): void {
    // Two independent table-level controls resolve in one pass. MatTableDataSource
    // types `filter` as a string, so both ride together as JSON and are decoded here.
    this.dataSource.filterPredicate = (row: any, encoded: string) => {
      const state = JSON.parse(encoded)

      if (state.mode === 'tagged' && !this.isTagged(row)) return false
      if (state.mode === 'untagged' && this.isTagged(row)) return false

      // ANY: the row needs at least one of the selected tags.
      if (state.tags.length) {
        const rowtags = Array.isArray(row['tags']) ? row['tags'] : []
        if (!state.tags.some((t: string) => rowtags.includes(t))) return false
      }
      return true
    }

    this.dataSource.sortingDataAccessor = (row: any, column: string) => {
      if (column === 'profileid') return (this.participantMap[row['profileid']] || '').toLowerCase()
      if (column === 'videoaskid') return (this.templateMap[row['videoaskid']] || '').toLowerCase()
      if (column === 'event') return (this.eventLabel(row) || '').toLowerCase()
      if (column === 'uploaded') return this.toMillis(row['uploaded'])
      if (column === 'addtohighlights') return row['addtohighlights'] ? 1 : 0
      return row[column]
    }
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  ngOnDestroy() {
    this.destroy$.next()
    this.destroy$.complete()
  }

  // ---------------------------------------------------------------- bootstrap

  /**
   * Loads every reference map the table needs before the first row renders.
   * All six run together — a counter based approach races and can leave a
   * filter list empty.
   */
  private async bootstrap() {
    this.bootstrapping = true

    const tagQuery = query(
      collection(this.firestore, 'participant tags'),
      where('tagsfor', 'array-contains', 'video ask'),
      where('isActive', '==', true)
    )
    collectionData(tagQuery, { idField: 'docid' })
      .pipe(takeUntil(this.destroy$))
      .subscribe((tags: any[]) => this.videoAskTags = tags)

    const [profiles, newProfiles, events, queues, workshops, templates] = await Promise.all([
      this.guard.getProfileMap(),
      this.guard.getProfileMapNewUser(),
      getDocs(collection(this.firestore, 'event collection')),
      getDocs(collection(this.firestore, 'queue generation')),
      getDocs(collection(this.firestore, 'workshopconfiguration')),
      getDocs(collection(this.firestore, 'arenavideoask'))
    ])

    this.participantList = [...profiles.list, ...newProfiles.list]
    this.participantMap = { ...profiles.map, ...newProfiles.map }
    this.participantDoc = { ...profiles.docdata, ...newProfiles.docdata }
    this.filteredParticipantList = this.participantList

    this.liveEventList = this.normalise(events, 'live', d => d['name'])
    this.queueEventList = this.normalise(queues, 'queue', d => d['queuename'])
    this.workshopList = this.normalise(workshops, 'workshop', d => d['detailpage']?.['title'])

    this.filteredLiveEventList = this.liveEventList
    this.filteredQueueEventList = this.queueEventList
    this.filteredWorkshopList = this.workshopList

    templates.docs.forEach(d => this.templateMap[d.id] = d.data()['title'])
    this.templateList = templates.docs
      .map(d => ({ docid: d.id, title: d.data()['title'] || d.id }))
      .sort((a, b) => a.title.localeCompare(b.title))
    this.filteredTemplateList = this.templateList

    this.bootstrapping = false
    this.loadDefault()
  }

  /** Flattens a snapshot into {docid,title,kind,path} and indexes it by path. */
  private normalise(snapshot: any, kind: string, titleOf: (data: any) => string) {
    const list = []
    snapshot.docs.forEach(d => {
      const data = d.data()
      const item = {
        docid: d.id,
        title: titleOf(data) || d.id,
        kind: kind,
        path: d.ref.path,
        raw: data
      }
      this.eventIndex[item.path] = item
      list.push(item)
    })
    return list.sort((a, b) => a.title.localeCompare(b.title))
  }

  // -------------------------------------------------------------- data loading

  /** No filter active: newest 200 only. Single-field sort, no composite index. */
  private async loadDefault() {
    this.fetching = true
    const snapshot = await getDocs(query(
      collection(this.firestore, 'participantvideoask'),
      orderBy('uploaded', 'desc'),
      limit(DEFAULT_LIMIT)
    ))
    this.isDefaultView = true
    this.setRows(snapshot.docs.map(d => this.toRow(d)))
    this.fetching = false
  }

  /**
   * Filtered load.
   *
   * Every query constrains exactly ONE field and carries no orderBy, so no
   * composite index is required. The event dimensions OR together by running
   * one query each and unioning the results; whatever is left over is applied
   * in memory, then the union is sorted by uploaded desc.
   */
  async onSearch() {
    if (this.bootstrapping || this.fetching) return
    this.filtersDirty = false

    const f = this.form.value
    const hasEvent = f.live.length || f.queue.length || f.workshop.length
    const hasAny = hasEvent || f.profileid.length || f.template.length || this.rangeSet(f.range)

    if (!hasAny) return this.loadDefault()

    this.fetching = true
    const col = collection(this.firestore, 'participantvideoask')
    const queries = []

    // which filter went to the server — the rest are applied in memory below
    let axis = 'event'

    if (hasEvent) {
      this.chunk(f.live).forEach(c =>
        queries.push(query(col, where('arenaevent', 'in', this.refs(c, 'event collection')))))
      this.chunk(f.queue).forEach(c =>
        queries.push(query(col, where('queueref', 'in', this.refs(c, 'queue generation')))))
      this.chunk(f.workshop).forEach(c =>
        queries.push(query(col, where('workshopref', 'in', this.refs(c, 'workshopconfiguration')))))
    } else if (f.profileid.length) {
      axis = 'profileid'
      this.chunk(f.profileid).forEach(c => queries.push(query(col, where('profileid', 'in', c))))
    } else if (f.template.length) {
      axis = 'template'
      this.chunk(f.template).forEach(c => queries.push(query(col, where('videoaskid', 'in', c))))
    } else {
      axis = 'range'
      queries.push(query(col,
        where('uploaded', '>=', this.startOfDay(f.range.start)),
        where('uploaded', '<=', this.endOfDay(f.range.end))))
    }

    const snapshots = await Promise.all(queries.map(q => getDocs(q)))

    // union + dedupe — a doc can match more than one chunk
    const merged = new Map<string, any>()
    snapshots.forEach(snapshot => snapshot.docs.forEach(d => merged.set(d.id, this.toRow(d))))

    const rows = [...merged.values()].filter(row => this.residual(row, f, axis))
    this.isDefaultView = false
    this.setRows(rows)
    this.fetching = false
  }

  /** Applies the filters that were NOT sent to the server. */
  private residual(row: any, f: any, axis: string): boolean {
    if (axis !== 'profileid' && f.profileid.length && !f.profileid.includes(row['profileid'])) return false
    if (axis !== 'template' && f.template.length && !f.template.includes(row['videoaskid'])) return false

    if (axis !== 'range' && this.rangeSet(f.range)) {
      const uploaded = this.toMillis(row['uploaded'])
      if (!uploaded) return false
      if (uploaded < this.startOfDay(f.range.start).getTime()) return false
      if (uploaded > this.endOfDay(f.range.end).getTime()) return false
    }
    return true
  }

  private setRows(rows: any[]) {
    rows.sort((a, b) => this.toMillis(b['uploaded']) - this.toMillis(a['uploaded']))
    this.playing.clear()
    this.rowCount = rows.length
    this.taggedCount = rows.filter(r => this.isTagged(r)).length
    this.untaggedCount = rows.length - this.taggedCount
    this.dataSource.data = rows
    this.applyTableFilter()
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
    if (this.paginator) this.paginator.firstPage()
  }

  isTagged(row: any): boolean {
    return Array.isArray(row['tags']) && row['tags'].length > 0
  }

  /** Pushes both table-level controls into the datasource as one filter value. */
  private applyTableFilter() {
    this.dataSource.filter = JSON.stringify({ mode: this.tagFilter, tags: this.selectedTags })
  }

  /** Re-filters the loaded rows. No Firestore read. */
  onTagFilterChange(mode: 'all' | 'tagged' | 'untagged') {
    this.tagFilter = mode
    this.applyTableFilter()
    if (this.paginator) this.paginator.firstPage()
  }

  /**
   * The tag dropdown is independent of the mode buttons, but a tag chosen while
   * Untagged is active could only ever match zero rows — so picking one moves the
   * mode to Tagged.
   */
  onSelectedTagsChange(tags: string[]) {
    this.selectedTags = tags || []
    if (this.selectedTags.length && this.tagFilter === 'untagged') this.tagFilter = 'tagged'
    this.applyTableFilter()
    if (this.paginator) this.paginator.firstPage()
  }

  clearSelectedTags() {
    this.onSelectedTagsChange([])
  }

  tagName(tagid: string): string {
    const tag = this.videoAskTags.find(t => t['id'] === tagid)
    return tag ? tag['name'] : tagid
  }

  /** Rows passing the table-level filter. */
  visibleCount(): number {
    return this.dataSource.filteredData ? this.dataSource.filteredData.length : 0
  }

  private toRow(d: any) {
    return Object.assign({}, d.data(), { docid: d.id })
  }

  // ------------------------------------------------------------------- helpers

  private chunk(values: string[]) {
    const out = []
    for (let i = 0; i < values.length; i += IN_CHUNK) out.push(values.slice(i, i + IN_CHUNK))
    return out
  }

  private refs(docids: string[], collectionName: string): DocumentReference[] {
    return docids.map(id => doc(this.firestore, collectionName, id))
  }

  private rangeSet(range: any): boolean {
    return ![null, undefined, ''].includes(range?.start) && ![null, undefined, ''].includes(range?.end)
  }

  private startOfDay(value: any): Date {
    return new Date(new Date(value).setHours(0, 0, 0, 0))
  }

  private endOfDay(value: any): Date {
    return new Date(new Date(value).setHours(23, 59, 59, 999))
  }

  private toMillis(uploaded: any): number {
    if (uploaded == null) return 0
    if (typeof uploaded.toMillis === 'function') return uploaded.toMillis()
    if (typeof uploaded.toDate === 'function') return uploaded.toDate().getTime()
    const parsed = new Date(uploaded).getTime()
    return isNaN(parsed) ? 0 : parsed
  }

  // --------------------------------------------------------------- row display

  /** The single reference a row carries, whichever field it lives in. */
  eventRef(row: any): DocumentReference {
    return row['arenaevent'] ?? row['queueref'] ?? row['workshopref'] ?? null
  }

  /** Indexed title, else the raw docid. */
  eventLabel(row: any): string {
    const ref = this.eventRef(row)
    if (!ref) return ''
    return this.eventIndex[ref.path] ? this.eventIndex[ref.path].title : ref.id
  }

  /**
   * Kind comes from the collection the reference points at, never from which
   * field held it — arenaevent does not always point at "event collection".
   * Unknown collection falls back to the full reference path.
   */
  eventKind(row: any): string {
    const ref = this.eventRef(row)
    if (!ref) return ''
    const collectionName = ref.parent?.id
    return KIND_LABEL[collectionName] ? KIND_LABEL[collectionName] : ref.path
  }

  isNewUser(profileid: string): boolean {
    return !!this.participantDoc[profileid]?.['workshoponly']
  }

  // ------------------------------------------------------------- video preview

  isPlaying(docid: string): boolean {
    return this.playing.has(docid)
  }

  /** Videos are placeholders until clicked, so a page never opens N streams. */
  playVideo(row: any) {
    this.playing.add(row['docid'])
  }

  // ------------------------------------------------------------ filter controls

  /** Narrows a dropdown's options as the user types in its panel search box. */
  onOptionSearch(formcontrol: string) {
    const text = (this.searchText[formcontrol] || '').trim().toLowerCase()

    if (formcontrol === 'profileid') {
      this.filteredParticipantList = this.participantList
        .filter(e => e.name != undefined)
        .filter(e => e.name.toLowerCase().includes(text))
    } else if (formcontrol === 'template') {
      this.filteredTemplateList = this.templateList.filter(e => e.title.toLowerCase().includes(text))
    } else if (formcontrol === 'live') {
      this.filteredLiveEventList = this.liveEventList.filter(e => e.title.toLowerCase().includes(text))
    } else if (formcontrol === 'queue') {
      this.filteredQueueEventList = this.queueEventList.filter(e => e.title.toLowerCase().includes(text))
    } else if (formcontrol === 'workshop') {
      this.filteredWorkshopList = this.workshopList.filter(e => e.title.toLowerCase().includes(text))
    }
  }

  /** Clears one dropdown's search box when its panel closes. */
  onPanelClosed(formcontrol: string) {
    this.searchText[formcontrol] = ''
    this.onOptionSearch(formcontrol)
  }

  /**
   * Options actually rendered — capped so a long list cannot lock the panel.
   *
   * Selected options are ALWAYS rendered, pulled from the full list rather than
   * the searched one. MatSelect rebuilds its selection from the options present
   * in the DOM, so a selected value whose option is not rendered gets written
   * back out of the form control — the selection silently disappears. Pinning
   * them keeps the value, the tick and the trigger label intact.
   */
  visibleOptions(filtered: any[], full: any[], formcontrol: string, idKey: string) {
    const selected: string[] = this.form.get(formcontrol).value || []
    if (selected.length === 0) return filtered.slice(0, MAX_OPTIONS)

    const chosen = full.filter(o => selected.includes(o[idKey]))
    const rest = filtered.filter(o => !selected.includes(o[idKey]))
    return [...chosen, ...rest.slice(0, MAX_OPTIONS)]
  }

  hiddenCount(filtered: any[], formcontrol: string, idKey: string): number {
    const selected: string[] = this.form.get(formcontrol).value || []
    const rest = selected.length === 0 ? filtered : filtered.filter(o => !selected.includes(o[idKey]))
    return Math.max(0, rest.length - MAX_OPTIONS)
  }

  /** "3 selected" summary shown on a closed dropdown. */
  selectedCount(formcontrol: string): number {
    return (this.form.get(formcontrol).value || []).length
  }

  /** Readable label for the closed dropdown, e.g. "Alpha Cohort +2". */
  selectedLabel(formcontrol: string, lookup: (id: string) => string): string {
    const values: string[] = this.form.get(formcontrol).value || []
    if (values.length === 0) return ''
    if (values.length === 1) return lookup(values[0])
    return `${lookup(values[0])}  +${values.length - 1}`
  }

  /** Title for a selected event docid, across all three dimensions. */
  eventTitle = (docid: string): string => {
    const match = [...this.liveEventList, ...this.queueEventList, ...this.workshopList]
      .find(e => e.docid === docid)
    return match ? match.title : docid
  }

  templateTitle = (docid: string): string => {
    return this.templateMap[docid] || docid
  }

  participantName = (profileid: string): string => {
    return this.participantMap[profileid] || profileid
  }

  /** Total filters currently applied to the form, for the "Clear" affordance. */
  activeFilterCount(): number {
    const f = this.form.value
    let count = f.profileid.length + f.template.length + f.live.length + f.queue.length + f.workshop.length
    if (this.rangeSet(f.range)) count = count + 1
    return count
  }

  /** Event dimensions, OR'd together, for the "Searching for" summary. */
  eventPills() {
    const pills = []
    if (this.selectedCount('live')) pills.push({ control: 'live', label: `Live Event: ${this.selectedLabel('live', this.eventTitle)}` })
    if (this.selectedCount('queue')) pills.push({ control: 'queue', label: `Queue Event: ${this.selectedLabel('queue', this.eventTitle)}` })
    if (this.selectedCount('workshop')) pills.push({ control: 'workshop', label: `Workshop: ${this.selectedLabel('workshop', this.eventTitle)}` })
    return pills
  }

  /** Narrowing filters, AND'd with each other and with the event group. */
  narrowPills() {
    const pills = []
    if (this.selectedCount('profileid')) pills.push({ control: 'profileid', label: `Participant: ${this.selectedLabel('profileid', this.participantName)}` })
    if (this.selectedCount('template')) pills.push({ control: 'template', label: `Template: ${this.selectedLabel('template', this.templateTitle)}` })
    if (this.rangeSet(this.form.get('range').value)) pills.push({ control: 'range', label: 'Date range' })
    return pills
  }

  clearPill(pill: any) {
    if (pill.control === 'range') return this.clearRange()
    return this.clearOne(pill.control)
  }

  clearOne(formcontrol: string) {
    this.form.get(formcontrol).setValue([])
  }

  clearRange() {
    this.form.get('range').setValue({ start: null, end: null })
  }

  onResetForm() {
    this.form.setValue({
      profileid: [],
      template: [],
      live: [],
      queue: [],
      workshop: [],
      range: { start: null, end: null }
    })
    this.searchText = { profileid: '', template: '', live: '', queue: '', workshop: '' }
    this.filteredParticipantList = this.participantList
    this.filteredTemplateList = this.templateList
    this.filteredLiveEventList = this.liveEventList
    this.filteredQueueEventList = this.queueEventList
    this.filteredWorkshopList = this.workshopList
    this.filtersDirty = false
    this.loadDefault()
  }

  // -------------------------------------------------------------------- tagging

  async updateVideoAsk(row: any, tagId: string) {
    const confirmMessage = row.tags?.includes(tagId) ? 'Are you sure want to remove this tag?' : 'Are you sure want to add this tag?'
    const check = confirm(confirmMessage)
    if (!check) return

    const isRemoving = row.tags?.includes(tagId)

    try {
      await updateDoc(doc(this.firestore, 'participantvideoask', row.docid), {
        tags: isRemoving ? arrayRemove(tagId) : arrayUnion(tagId)
      })

      await updateDoc(doc(this.firestore, 'participant metadata', row.profileid), {
        profiletags: isRemoving ? arrayRemove(tagId) : arrayUnion(tagId)
      })

      const logId = doc(collection(this.firestore, 'participant tag logs')).id
      await setDoc(doc(this.firestore, 'participant tag logs', logId), {
        logid: logId,
        profileid: row.profileid,
        type: isRemoving ? 'removed' : 'added',
        tags: [tagId],
        updated: new Date(),
        updatedby: this.loggedInProfileid,
        source: 'videoask'
      })

      // keep the in-memory row in step with what was written
      const current: string[] = row.tags || []
      row.tags = isRemoving ? current.filter(t => t !== tagId) : [...current, tagId]

      // tagging can move a row across the Tagged/Untagged filter
      const rows = this.dataSource.data as any[]
      this.taggedCount = rows.filter(r => this.isTagged(r)).length
      this.untaggedCount = rows.length - this.taggedCount
      this.applyTableFilter()
    } catch (error) {
      console.log(error)
    }
  }

}
