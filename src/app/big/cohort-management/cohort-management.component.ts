import { Component, ElementRef, HostListener, inject, Input, TemplateRef, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { collection, collectionSnapshots, doc, Firestore, getDocs, orderBy, query, where, updateDoc, arrayRemove, arrayUnion, setDoc, deleteDoc, collectionData  , WriteBatch , getDoc} from '@angular/fire/firestore';
import { PlanActivityComponent } from '../plan-activity/plan-activity.component';
import { ManageCohertsComponent } from '../manage-coherts/manage-coherts.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { UnassignedParticipantsDialogComponent } from '../unassigned-participants-dialog/unassigned-participants-dialog.component';
import { environment } from '../../../environments/environment.development';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { Storage,ref,uploadBytes,getDownloadURL } from '@angular/fire/storage';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { MapRecommendedplaylistToparticipantComponentComponent } from '../../Participants Profile Management/participants-analytics/map-recommendedplaylist-toparticipant.component/map-recommendedplaylist-toparticipant.component.component';
import { MatCheckboxChange , MatCheckboxModule } from '@angular/material/checkbox';
import { writeBatch } from 'firebase/firestore';


@Component({
  selector: 'app-cohort-management',
  standalone : true, 
  imports: [
    MatFormFieldModule,
    CommonModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    MatInputModule,
    MatMenuModule,
    MatCheckboxModule
  ],
  templateUrl: './cohort-management.component.html',
  styleUrl: './cohort-management.component.css',
}) 


export class CohortManagementComponent {

  @ViewChild('cohortsearch') cohortSearch !: ElementRef<HTMLInputElement>;
  @ViewChild('chatConfig') chatConfig !: TemplateRef<ElementRef>;
  // ==== Design B additions ====
  selectMode = false
  selectedCohortIds = new Set<string>()
  mobileSheetOpen = false
  private _sheetOpenedAt = 0
  unassignSearch = '';
  unassignCohortSearchQuery = ''
  filterUnassignParticipants = [];
  selectedUnassignParticipants : null | Set<any>= null;
  progressionSubscription : Subscription;
  activityLogFilters = {};
  chatConfigModelData = [];
  chatModelRef : any= null;

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (
      event.ctrlKey &&
      event.shiftKey &&
      event.key.toLowerCase() === 's'
    ) {
      event.preventDefault();
      this.cohortSearch.nativeElement.focus();
    }
  }
  
  openMobileSheet(ev: Event): void {
    ev.stopPropagation()
    this.mobileSheetOpen = true
    this._sheetOpenedAt = Date.now()
  }
  closeMobileSheet(ev: Event): void {
    // Guard against ghost/touch-through clicks within 350ms of opening
    if (Date.now() - this._sheetOpenedAt < 350) return
    const t = ev.target as HTMLElement
    if (!t.classList.contains('scrim')) return
    this.mobileSheetOpen = false
  }

  toggleSelectMode(): void {
    this.selectMode = !this.selectMode
    if (!this.selectMode) this.selectedCohortIds.clear()
  }
  isCohortSelected(id: string): boolean {
    return this.selectedCohortIds.has(id)
  }
  toggleCohortSelected(id: string): void {
    if (!id) return
    if (this.selectedCohortIds.has(id)) this.selectedCohortIds.delete(id)
    else this.selectedCohortIds.add(id)
  }
  selectAllCohorts(): void {
    const allIds = (this.filteredCohortsList || []).map((c: any) => c.docid).filter(Boolean)
    const anyUnchecked = allIds.some((id: string) => !this.selectedCohortIds.has(id))
    if (anyUnchecked) allIds.forEach((id: string) => this.selectedCohortIds.add(id))
    else this.selectedCohortIds.clear()
  }
  private mergedCohortForSelection(): any {
    const ids = Array.from(this.selectedCohortIds)
    const cohorts = (this.filteredCohortsList || []).filter((c: any) => ids.includes(c.docid))
    const participantidlist: string[] = []
    const mentors: string[] = []
    const seen = new Set<string>()
    cohorts.forEach((c: any) => {
      (c.participantidlist || []).forEach((p: string) => { if (!seen.has(p)) { seen.add(p); participantidlist.push(p) } })
      ;(c.mentors || []).forEach((m: string) => { if (!seen.has(m)) { seen.add(m); mentors.push(m) } })
    })
    return { name: `${cohorts.length} cohort(s)`, participantidlist, mentors }
  }
  sendSelectedCohortsNotification(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortNotification?.(this.mergedCohortForSelection())
  }
  sendSelectedCohortsEmail(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortEmail?.(this.mergedCohortForSelection())
  }
  sendSelectedCohortsWhatsapp(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortWhatsapp?.(this.mergedCohortForSelection())
  }

  sendSelectedCohortsPlaylist(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortRecommendedPlaylist?.(this.mergedCohortForSelection())
  }

  exportSelectedCohorts(): void {
    if (this.selectedCohortIds.size === 0) return
    // Temporarily narrow filteredCohortsList to the selected set, reuse existing export, then restore.
    const full = this.filteredCohortsList
    const subset = full.filter((c: any) => this.selectedCohortIds.has(c.docid))
    this.filteredCohortsList = subset
    try { (this as any).exportCohortsData?.() } finally { this.filteredCohortsList = full }
  }
  // ==== Participant multi-select (per cohort) ====
  participantSelectCohortId: string | null = null
  selectedParticipantIds = new Set<string>()

  toggleParticipantSelectMode(cohortId: string): void {
    if (this.participantSelectCohortId === cohortId) {
      this.participantSelectCohortId = null
      this.selectedParticipantIds.clear()
    } else {
      this.participantSelectCohortId = cohortId
      this.selectedParticipantIds.clear()
    }
  }
  isParticipantSelectActive(cohortId: string): boolean {
    return this.participantSelectCohortId === cohortId
  }
  isParticipantChecked(pid: string): boolean {
    return this.selectedParticipantIds.has(pid)
  }
  toggleParticipantChecked(pid: string, ev?: Event): void {
    if (ev) ev.stopPropagation()
    if (this.selectedParticipantIds.has(pid)) this.selectedParticipantIds.delete(pid)
    else this.selectedParticipantIds.add(pid)
  }
  private cohortForSelected(cohort: any): any {
    const ids = Array.from(this.selectedParticipantIds)
    return { ...cohort, participantidlist: ids, mentors: [] }
  }
  sendSelectedNotification(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortNotification?.(this.cohortForSelected(cohort))
  }
  sendSelectedEmail(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortEmail?.(this.cohortForSelected(cohort))
  }
  sendSelectedWhatsapp(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortWhatsapp?.(this.cohortForSelected(cohort))
  }

  async moveSelectedParticipantsTo(sourceCohort: any, targetCohort: any): Promise<void> {
    const ids = Array.from(this.selectedParticipantIds)
    if(ids.length === 0) return
      // Await each move so the isMovingParticipant guard releases between calls
    await this.moveParticipantToCohort(ids, sourceCohort, targetCohort)
    
    this.selectedParticipantIds.clear()
    this.participantSelectCohortId = null
  }

  hasActiveFilters(): boolean {
    return !!this.selectedMarathon
      || (this.selectedAcceleratorEvent?.length || 0) > 0
      || (this.selectedQueueEvent?.length || 0) > 0
      || (this.selectedZoneEvent?.length || 0) > 0
      || this.statusFilter !== 'all'
      || this.categoryFilter !== 'all'
      || this.typeFilter !== 'all'
      || (this.selectedTags?.length || 0) > 0
      || this.showTemporaryOnly
      || this.showExpiredCohorts
      || !!this.participantSearchQuery
  }

  clearAllFilters(): void {
    if (this.selectedMarathon) this.toggleMarathonSelection?.()
    this.clearEventSelection?.()
    this.clearQueueSelection?.()
    this.setStatusFilter?.('all')
    this.setCategoryFilter?.('all')
    this.setTypeFilter?.('all')
    this.clearZoneSelection?.();
    ;(this as any).clearTagSelection?.();
    this.participantSearchQuery = ''
    if (this.showTemporaryOnly) { this.showTemporaryOnly = false }
    if (this.showExpiredCohorts) { this.showExpiredCohorts = false }
    this.onFilter?.()
  }

  // ════════════════════════════════════════════════════════════════
  // Active filter chips
  // ════════════════════════════════════════════════════════════════
  getActiveFilterChips(): Array<{ key: string, value: string, type: string, id?: string }> {
    const chips: Array<{ key: string, value: string, type: string, id?: string }> = []
    if (this.typeFilter !== 'all') {
      const m: any = { general: 'General', event: 'Event' }
      chips.push({ key: 'TYPE', value: m[this.typeFilter] || this.typeFilter, type: 'type' })
    }
    if (this.categoryFilter !== 'all') {
      const m: any = { studio: 'Studio', readiness: 'Readiness', educational: 'Educational', operational: 'Operational' }
      chips.push({ key: 'CATEGORY', value: m[this.categoryFilter] || this.categoryFilter, type: 'category' })
    }
    if (this.statusFilter !== 'all') {
      const m: any = { active: 'Active', nonactive: 'Non Active' }
      chips.push({ key: 'STATUS', value: m[this.statusFilter] || this.statusFilter, type: 'status' })
    }
    if (this.selectedMarathon) {
      const title = this.mapMarathon?.[this.selectedMarathon]?.['title']
        || this.mapMarathon?.[this.selectedMarathon]?.['name']
        || this.selectedMarathon
      chips.push({ key: 'MARATHON', value: title, type: 'marathon' })
    }
    (this.selectedAcceleratorEvent || []).forEach((eid: string) => {
      const name = this.mapAcceleratorEvent?.[eid] || eid
      chips.push({ key: 'EVENT', value: name, type: 'event', id: eid })
    });
    (this.selectedQueueEvent || []).forEach((qid: string) => {
      const name = this.mapQueueName?.[qid] || qid
      chips.push({ key: 'QUEUE', value: name, type: 'queue', id: qid })
    });
    (this.selectedZoneEvent || []).forEach((zid: string) => {
      const name = this.mapZoneEvent?.[zid] || zid
      chips.push({ key: 'ZONE', value: name, type: 'zone', id: zid })
    });
    (this.selectedTags || []).forEach((tid: string) => {
      chips.push({ key: 'TAG', value: this.getTagName(tid), type: 'tag', id: tid })
    })
    if (this.showTemporaryOnly) chips.push({ key: 'TEMPORARY', value: 'Only', type: 'temporary' })
    if (this.showExpiredCohorts) chips.push({ key: 'EXPIRED', value: 'Shown', type: 'expired' })
    if (this.participantSearchQuery) chips.push({ key: 'SEARCH', value: this.participantSearchQuery, type: 'search' })
    return chips
  }

  removeFilterChip(chip: { type: string, id?: string }): void {
    switch (chip.type) {
      case 'type': this.setTypeFilter('all'); break
      case 'category': this.setCategoryFilter('all'); break
      case 'status': this.setStatusFilter('all'); break
      case 'marathon': if (this.selectedMarathon) { this.selectedMarathon = null; this.onFilter?.() } break
      case 'event':
        this.selectedAcceleratorEvent = (this.selectedAcceleratorEvent || []).filter(id => id !== chip.id)
        this.toggleEventSelection?.()
        break
      case 'queue':
        this.selectedQueueEvent = (this.selectedQueueEvent || []).filter((id: string) => id !== chip.id)
        this.toggleQueueSelection?.()
        break
      case 'zone':
        this.selectedZoneEvent = (this.selectedZoneEvent || []).filter(id => id !== chip.id)
        this.toggleZoneSelection?.()
        break
      case 'tag':
        this.selectedTags = (this.selectedTags || []).filter(id => id !== chip.id)
        this.toggleTagSelection?.()
        break
      case 'temporary': this.showTemporaryOnly = false; this.onFilter?.(); break
      case 'expired': this.showExpiredCohorts = false; this.onFilter?.(); break
      case 'search': this.participantSearchQuery = ''; this.onParticipantSearch?.(); break
    }
  }

  trackByChip = (_: number, chip: { key: string, value: string, type: string, id?: string }) => `${chip.type}:${chip.id ?? chip.value}`

  getActiveFilterCount(): number { return this.getActiveFilterChips().length }

  // ════════════════════════════════════════════════════════════════
  // DRAG & DROP (HTML5 native)
  // ════════════════════════════════════════════════════════════════
  private dragPayload: { kind: 'participant' | 'cohort', participantId?: string, sourceCohortId?: string | null, cohortId?: string } | null = null
  hoverDropTargetCohortId: string | null = null
  sidebarCollapsed: boolean = false
  participantExpandedCohorts: Set<string> = new Set<string>()
  modeView: 'plan' | 'floor' = 'plan'

  onParticipantDragStart(event: DragEvent, participantId: string, sourceCohortId: string | null) {
    if (!event.dataTransfer) return
    event.stopPropagation()
    this.dragPayload = { kind: 'participant', participantId, sourceCohortId }
    event.dataTransfer.effectAllowed = 'move'
    try { event.dataTransfer.setData('text/plain', JSON.stringify(this.dragPayload)) } catch {}
  }

  onCohortDragStart(event: DragEvent, cohort: any) {
    if (!event.dataTransfer) return
    // Only allow drag when starting from the card-handle (set via .card-handle)
    const tgt = event.target as HTMLElement
    if (!tgt || !tgt.closest('.card-handle')) {
      event.preventDefault()
      return
    }
    event.stopPropagation()
    this.dragPayload = { kind: 'cohort', cohortId: cohort?.['docid'] }
    event.dataTransfer.effectAllowed = 'move'
    try { event.dataTransfer.setData('text/plain', JSON.stringify(this.dragPayload)) } catch {}
  }

  onCohortDragOver(event: DragEvent, cohort: any) {
    if (!this.dragPayload) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    this.hoverDropTargetCohortId = cohort?.['docid']
  }

  onCohortDragLeave(_event: DragEvent, cohort: any) {
    if (this.hoverDropTargetCohortId === cohort?.['docid']) {
      this.hoverDropTargetCohortId = null
    }
  }

  async onCohortDrop(event: DragEvent, targetCohort: any) {
    event.preventDefault()
    event.stopPropagation()
    const payload = this.dragPayload
    this.dragPayload = null
    this.hoverDropTargetCohortId = null;
    if (!payload || !targetCohort) return

    if (payload.kind === 'participant' && payload.participantId) {
      if (!payload.sourceCohortId) {
        const request = this.unassignedParticipants.find(({participantId})=>payload.participantId);
        if(request?.['eventref']?.id === targetCohort['eventref']?.id){
          await this.assignUnassignedToCohort([payload.participantId], targetCohort)
        } else {
          alert(`This Request Belongs to ${this.mapAcceleratorEvent[request?.['eventref']?.id]}`)
        }
        return
      }
      if (payload.sourceCohortId === targetCohort['docid']) return
      const sourceCohort = this.cohortsList.find(c => c['docid'] === payload.sourceCohortId);
      if (sourceCohort) {
        if (sourceCohort['eventref']?.id === targetCohort['eventref']?.id) {
          await this.moveParticipantToCohort([payload.participantId], sourceCohort, targetCohort)
        } else{
          alert(`Can not move participants between ${this.mapAcceleratorEvent[sourceCohort?.['eventref']?.id]} to ${this.mapAcceleratorEvent[targetCohort?.['eventref']?.id]}`)
        }
      }
      return
    }

    if (payload.kind === 'cohort' && payload.cohortId && payload.cohortId !== targetCohort['docid']) {
      this.reorderCohortInList(payload.cohortId, targetCohort['docid'])
    }
  }

  async deleteParticipantFromCohort(cohort : any){
    const con = confirm('Do you want to delete the selected Participants');
    if (!con) return
    try {
      let cohortParticipants = cohort['participantidlist'] ?? [];

      if ([null, undefined, ''].includes(cohort['docid']) || cohortParticipants.length == 0) return
      cohortParticipants = cohortParticipants.filter((pid) => !this.selectedParticipantIds.has(pid));

      const checkForActiveStudio = [];
      const participants = [...this.selectedParticipantIds.values()]

      for (let pid of participants) {
        const check = await this.checkForActiveParticipantStuidosInCohort(cohort, pid);
        if (check) checkForActiveStudio.push(this.mapProfile[pid]);
      }

      console.log(checkForActiveStudio)
      if (checkForActiveStudio.length > 0) {
        alert(`Selected Participant (${checkForActiveStudio.join(', ')}) has Active Studios in cohort, Please Disable all before delete`);
        return
      }

      const batch = writeBatch(this.firestore);

      const sorucecohortmembers = (await getDoc(doc(this.firestore, cohort?.chatref.path))).data()['members'] ?? [];

      const data = [];

      for (let pid of participants) {
        const uid = (await this.getUidsFromProfileIds([pid]))[0];
        if(!sorucecohortmembers.includes(uid)) continue
        const d = {
          profileId: pid,
          uid : uid,
          cohorts: []
        }
        if (cohort?.enableGroupChat && cohort?.chatref) {
          d.cohorts.push({
            ...cohort,
            selected: sorucecohortmembers.includes(uid)
          })
        }

        data.push(d);
      }

      console.log()
      if(data.length > 0){
      this.chatConfigModelData = data

      this.chatModelRef = this.dialog.open(this.chatConfig);

      const result = await this.chatModelRef.afterClosed().toPromise();

      if (result) {
        for (let participant of result) {
          (participant.cohorts ?? []).forEach((cohort) => {
            batch.update(cohort['chatref'], {
              members: cohort.selected ? arrayUnion(participant.uid) : arrayRemove(participant.uid),
              group_name: cohort['name'],
              last_modification: new Date(),
              type: 'group'
            })
          })
        }
      }
      }

      const docRef = doc(collection(this.firestore, 'big cohorts'), cohort['docid']);

      batch.update(docRef, {
        participantidlist: cohortParticipants
      });

      await batch.commit();
      this.createLogsForParticipants(cohort , participants , 'removed');
      this.loadCohorts();
      this.selectedParticipantIds.clear()
      this.participantSelectCohortId = null

    } catch(error) {
      console.log(error);
    }
  }

  async checkForActiveParticipantStuidosInCohort(cohort : any , participantId : string){
    const queueId = cohort['queueref'];
    const activity = cohort['bigactivity'] ?? '';
    if(queueId){
      const q = query(collection(this.firestore , 'queue studio pairing') , where('queueref' ,'==',queueId), where('participants' , 'array-contains' , participantId));
      const studios = (await getDocs(q)).docs.map((doc)=>doc.data()).filter((st)=>Object.values(st['participantsactivity'] ?? {}).includes(activity));

      if(studios.length > 0){
        const enabledStudios = studios.filter((studio)=>studio['studioin']);

      if(enabledStudios.length > 0){
        console.log(enabledStudios)
        return true;
      }
      const studioIds = studios.map((studio)=>studio['docid']);
      const activeLiveAssignment = await getDocs(query(collection(this.firestore , 'live assignment') , where('status' , '==' , 'live') , where('studioid' , 'in' , studioIds)));

      if(activeLiveAssignment.docs.length > 0){
        return true;
      }
      }
    }
    return false
  }

  onGridDragOver(event: DragEvent) {
    if (!this.dragPayload || this.dragPayload.kind !== 'cohort') return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onGridDrop(event: DragEvent) {
    event.preventDefault()
    this.dragPayload = null
    this.hoverDropTargetCohortId = null
  }

  private reorderCohortInList(sourceId: string, targetId: string) {
    const fromIdx = this.filteredCohortsList.findIndex(c => c['docid'] === sourceId)
    const toIdx = this.filteredCohortsList.findIndex(c => c['docid'] === targetId)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
    const [moved] = this.filteredCohortsList.splice(fromIdx, 1)
    this.filteredCohortsList.splice(toIdx, 0, moved)
    this.applyGrouping?.()
  }

  // ════════════════════════════════════════════════════════════════
  // UI helpers
  // ════════════════════════════════════════════════════════════════
  toggleSidebarCollapse() { 
    this.sidebarCollapsed = !this.sidebarCollapsed 
  }

  toggleParticipantExpanded(cohortId: string, event?: Event) {
    if (event) event.stopPropagation()
    if (this.participantExpandedCohorts.has(cohortId)) this.participantExpandedCohorts.delete(cohortId)
    else this.participantExpandedCohorts.add(cohortId)
  }
  isParticipantExpanded(cohortId: string): boolean { return this.participantExpandedCohorts.has(cohortId) }

  getAvatarColorClass(key: string): string {
    const palette = ['purple', 'blue', 'green', 'amber', 'rose']
    if (!key) return palette[0]
    let h = 0
    // console.log(key)
    for (let i = 0; i < key.length; i++) { h = ((h << 5) - h + key.charCodeAt(i)) | 0 }
    return palette[Math.abs(h) % palette.length]
  }

  isParticipantLive(queueId : string , participantId: string): boolean {
    return !!(this.mapLiveParticipants && this.mapLiveParticipants[queueId] && this.mapLiveParticipants[queueId][participantId])
  }

  isCohortOverCapacity(cohort: any): boolean {
    if (!cohort) return false
    const participants = cohort['participantidlist']?.length || 0
    const studios = (this.getCohortTotalStudiosCount?.(cohort)) || 0
    return studios > 0 && participants > studios
  }

  setModeView(mode: 'plan' | 'floor') { this.modeView = mode }

  getGroupVariantClass(groupKey: string): string {
    const key = (groupKey || '').toLowerCase()
    if (key.includes('studio')) return 'studio'
    if (key.includes('readiness')) return 'readiness'
    if (key.includes('foundational')) return 'foundational'
    if (key.includes('scope')) return 'scope'
    if (key.includes('diagnostic')) return 'diagnostics'
    if (key.includes('consultation')) return 'consultation'
    if (key.includes('educational')) return 'educational'
    if (key.includes('operational')) return 'operational'
    return 'studio'
  }

  getGroupByLabel(): string {
    const m: any = {
      none: 'No Grouping', category: 'By Category', levels: 'Level Based',
      studio: 'Studio Based', zone: 'Zone Based', daterange: 'Date Range'
    }
    return m[this.groupBy] || 'By Category'
  }

  getMarathonLabel(): string {
    if (!this.selectedMarathon) return 'Marathon'
    return this.mapMarathon?.[this.selectedMarathon]?.['title'] || this.mapMarathon?.[this.selectedMarathon]?.['name'] || 'Marathon'
  }
  getEventLabel(): string {
    const n = (this.selectedAcceleratorEvent || []).length
    if (n === 0) return 'Event'
    if (n === 1) return this.mapAcceleratorEvent?.[this.selectedAcceleratorEvent[0]] || 'Event'
    return `Event · ${n}`
  }
  getQueueLabel(): string {
    const n = (this.selectedQueueEvent || []).length
    if (n === 0) return 'Queue'
    if (n === 1) return this.mapQueueName?.[this.selectedQueueEvent[0]] || 'Queue'
    return `Queue · ${n}`
  }
  getZoneLabel(): string {
    const n = (this.selectedZoneEvent || []).length
    if (n === 0) return 'Zone'
    if (n === 1) return this.mapZoneEvent?.[this.selectedZoneEvent[0]] || 'Zone'
    return `Zone · ${n}`
  }
  getTagsLabel(): string {
    const n = (this.selectedTags || []).length
    if (n === 0) return 'None'
    if (n === 1) return this.getTagName(this.selectedTags[0])
    return `${n} selected`
  }

  selectSingleMarathon(id: string) {
    this.selectedMarathon = id
    this.toggleMarathonSelection?.()
  }

  toggleEventInSelection(eventId: string) {
    const idx = (this.selectedAcceleratorEvent || []).indexOf(eventId)
    if (idx >= 0) this.selectedAcceleratorEvent.splice(idx, 1)
    else this.selectedAcceleratorEvent.push(eventId)
    this.toggleEventSelection?.()
  }
  toggleQueueInSelection(queueId: string) {
    const idx = (this.selectedQueueEvent || []).indexOf(queueId)
    if (idx >= 0) this.selectedQueueEvent.splice(idx, 1)
    else this.selectedQueueEvent.push(queueId)
    this.toggleQueueSelection?.()
  }
  toggleZoneInSelection(zoneId: string) {
    const idx = (this.selectedZoneEvent || []).indexOf(zoneId)
    if (idx >= 0) this.selectedZoneEvent.splice(idx, 1)
    else this.selectedZoneEvent.push(zoneId)
    this.toggleZoneSelection?.()
  }
  toggleTagInSelection(tagId: string) {
    const idx = (this.selectedTags || []).indexOf(tagId)
    if (idx >= 0) this.selectedTags.splice(idx, 1)
    else this.selectedTags.push(tagId)
    this.toggleTagSelection?.()
  }
  isEventSelected(eventId: string): boolean { return (this.selectedAcceleratorEvent || []).includes(eventId) }
  isQueueSelected(queueId: string): boolean { return (this.selectedQueueEvent || []).includes(queueId) }
  isZoneSelected(zoneId: string): boolean { return (this.selectedZoneEvent || []).includes(zoneId) }
  isTagSelected(tagId: string): boolean { return (this.selectedTags || []).includes(tagId) }

  // ════════════════════════════════════════════════════════════════
  // Activity sidenav
  // ════════════════════════════════════════════════════════════════
  activitySidenavCollapsed: boolean = true
  activityFilter: 'all' | 'you' | 'system' = 'all'
  statusUpdatedAgo: string = '2 min ago'

  toggleActivitySidenav() { 
    this.activitySidenavCollapsed = !this.activitySidenavCollapsed 
    if(!this.activitySidenavCollapsed){
      this.loadProgressionDataLog();
    } else {
      this.progressionData = [];
      this.progressionLoading = true;
      this.filteredProgressionProfiles = [];
      if (this.progressionSubscription) {
        this.progressionSubscription.unsubscribe();
        this.progressionSubscription = null;
      }
    }
  }

  getActivityCount(): number {
    return this.getActivityFeed('lastHour').length + this.getActivityFeed('earlier').length
  }

  getActivityFeed(bucket: 'lastHour' | 'earlier'): Array<any> {
    // Build from move logs / live assignments if available; placeholder otherwise.
    const list: any[] = []
    // Source: bigInvitationList + cohort logs would be wired in real backend.
    // Use any in-memory data we already have.
    const now = Date.now()
    const hourMs = 60 * 60 * 1000
    const allEntries: any[] = []

    // Live assignments → "checked in to"
    ;(this.liveAssignmentList || []).forEach((la: any) => {
      const t = la?.createddate?.toDate ? la.createddate.toDate().getTime() : (la?.createddate ? new Date(la.createddate).getTime() : now)
      allEntries.push({
        ts: t,
        actor: this.mapProfile?.[la?.participantid] || la?.participantid || 'Someone',
        action: 'checked in to',
        target: la?.studioid || la?.queueid || '',
        meta: la?.cohortname || '',
        badge: la?.eventcode || '',
        ago: this.timeAgo(t),
        type: 'system',
      })
    })

    // Cohort moves: scan cohortsList for recent updates
    ;(this.cohortsList || []).forEach((c: any) => {
      const t = c?.lastupdated?.toDate ? c.lastupdated.toDate().getTime() : (c?.lastupdated ? new Date(c.lastupdated).getTime() : 0)
      if (!t) return
      allEntries.push({
        ts: t,
        actor: c['name'] || 'Cohort',
        action: 'cohort created',
        target: '',
        meta: '',
        badge: '',
        ago: this.timeAgo(t),
        type: 'system',
      })
    })

    const filtered = allEntries
      .filter(e => this.activityFilter === 'all' || (this.activityFilter === 'system' && e.type === 'system') || (this.activityFilter === 'you' && e.type === 'you'))
      .sort((a, b) => b.ts - a.ts)

    return filtered.filter(e => bucket === 'lastHour' ? (now - e.ts) <= hourMs : (now - e.ts) > hourMs).slice(0, 10)
  }

  private timeAgo(ts: number): string {
    const diff = Math.max(0, Date.now() - ts)
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    return `${d}d ago`
  }

  // ════════════════════════════════════════════════════════════════
  // Status bar
  // ════════════════════════════════════════════════════════════════
  getStatusTotal(): number {
    return (this.cohortsList || []).reduce((sum: number, c: any) => sum + (c?.participantidlist?.length || 0), 0)
  }
  getStatusBucket(kind: 'se' | 'diagnostics' | 'consultation' | 'others'): number {
    let n = 0
    ;(this.cohortsList || []).forEach((c: any) => {
      const name = (c?.name || '').toLowerCase()
      const cat = (c?.cohortCategory || '').toLowerCase()
      const count = c?.participantidlist?.length || 0
      if (kind === 'se' && (name.includes('se ') || name.startsWith('se') || cat.includes('scope'))) n += count
      else if (kind === 'diagnostics' && (name.includes('diagnostic') || cat.includes('diagnostic'))) n += count
      else if (kind === 'consultation' && (name.includes('consultation') || cat.includes('consultation'))) n += count
      else if (kind === 'others') {
        const isSe = name.includes('se ') || name.startsWith('se') || cat.includes('scope')
        const isDiag = name.includes('diagnostic') || cat.includes('diagnostic')
        const isCons = name.includes('consultation') || cat.includes('consultation')
        if (!isSe && !isDiag && !isCons) n += count
      }
    })
    return n
  }
  refreshStatus() {
    this.statusUpdatedAgo = 'just now'
    this.onFilter?.()
    setTimeout(() => { this.statusUpdatedAgo = '1 min ago' }, 60000)
  }

  onCardClick(event: MouseEvent, cohort: any): void {
    if (!this.selectMode) return
    const target = event.target as HTMLElement
    if (target.closest('button, .card-menu, .row-action, .foot-btn, .seg button, mat-menu, .mat-menu-content')) return
    this.toggleCohortSelected(cohort.docid)
  }

  cohortsList: any[] = []
  filteredCohortsList: any[] = []
  groupedCohorts: { [key: string]: any[] } = {}
  groupedCohortsDateRange: { [key: string]: { cohorts: any[], startDate: Date, endDate: Date } } = {}
  marathonList: any[] = []
  filteredMarathonList: any[] = []
  participantlist: any = {};

  acceleratorEventList: any[] = []
  filteredAcceleratorEventList: any[] = []
  searchableEventList: any[] = []

  zoneEventEventList: any[] = []
  filteredZoneEventList: any[] = []
  searchableZoneEventList: any[] = []
  selectedZoneEvent: string[] = []
  zoneDropdownOpen: boolean = false
  zoneSearchQuery: string = ''
  mapZoneData: { [zoneId: string]: any } = {}
  zoneMappedCohortIds: Set<string> = new Set()

  mapProfile: any = {}
  mapParticipantMetaData = {};
  contentview = 'participants'
  selectedMarathon: string | null = null
  selectedAcceleratorEvent: string[] = []
  mapMarathon: any = {}
  mapAcceleratorEvent: any = {}
  mapBigCohortsToAssignment: any = {};
  mapZoneEvent: any = {};

  mapBigAssignment: any = {}
  private subscription = new Subject<void>();
  mapParticiantsAssignments: any = {}
  mapCompletedParticiantsAssignments: any = {}
  mapOngoingAssignments: any = {}
  mapCompletedAssignments: any = {}

  totalParticpantsEngagement = 0
  totalParticipantsInCohorts: any[] = []

  loading: boolean = true;

  loggedInProfile: any

  // UI State
  cohortSearchQuery: string = '';
  participantSearchQuery: string = '';
  marathonDropdownOpen: boolean = false
  eventDropdownOpen: boolean = false
  marathonSearchQuery: string = ''
  eventSearchQuery: string = ''

  // View Mode
  viewMode: 'horizontal' | 'vertical' = 'vertical'

  // Filter States
  statusFilter: 'all' | 'active' | 'nonactive' = 'all'
  categoryFilter: 'all' | 'studio' | 'readiness' | 'educational' | 'operational' = 'all'
  typeFilter: 'all' | 'general' | 'event' = 'all'

  // Filter Dropdown States
  statusDropdownOpen: boolean = false
  categoryDropdownOpen: boolean = false
  typeDropdownOpen: boolean = false
  taggingDropdownOpen: boolean = false

  // Grouping States
  groupBy: 'none' | 'levels' | 'daterange' | 'category' | 'studio' | 'zone' = 'none'
  showTemporaryOnly: boolean = false
  showExpiredCohorts: boolean = false

  // Tags from participant tags collection
  participantTagsList: any[] = []
  filteredTagsList: any[] = []
  selectedTags: string[] = []
  tagSearchQuery: string = ''

  // Big Invitation data for unassigned participants
  bigInvitationList: any[] = []
  unassignedParticipants: any[] = []

  // Live Assignment data for participant status
  liveAssignmentList: any[] = []
  mapLiveParticipants: { [key: string]: {[key: string]:boolean } } = {}

  // Queue
  queueSearchQuery: string = ''
  searchableQueueList: any[] = [];
  queueDropdownOpen: boolean = false
  selectedQueueEvent: any[] = [];
  filteredQueueList: any[] = [];
  mapQueueName: any = {};
  liveassignmentSubscription: Subscription | null = null;

  // Studio
  studioPairingList: any[] = [];
  queuestudioSubscription: Subscription | null = null;

  // Studio mapping for participant status
  mapStudioPairing: { [studioId: string]: any } = {};
  mapParticipantStudios: { [key : string] : {[participantId: string]: any[]} } = {};
  mapLiveAssignmentByStudio: { [studioId: string]: any } = {};

  showProgressionDialog: boolean = false
  progressionLoading: boolean = false
  progressionData: any[] = []
  groupedProgressionData: { [profileId: string]: any[] } = {}
  progressionSearchQuery: string = ''
  filteredProgressionProfiles: string[] = []
  selectedMarathonEvent = [];
  eventParticipationList: any[] = [];

  bigActivityMap = {};

  // LocalStorage keys
  private readonly STORAGE_KEY_QUEUE = 'big_cohort_selected_queue';
  private readonly STORAGE_KEY_EVENT = 'big_cohort_selected_event';
  private readonly STORAGE_KEY_ZONE = 'big_cohort_selected_zone';

  private destroy$ = new Subject<void>()
  private storage = inject(Storage)
  private _snackBar = inject(MatSnackBar)

  constructor(
    private firestore: Firestore,
    public authguard: AuthguardService,
    private dialog: MatDialog,
    private router: Router,
    private http : HttpClient
  ) {
    this.contentview = 'participants';
    this.authguard.getProfileMap().then(e => this.mapProfile = e.map)
    this.authguard.username().then((e) => this.loggedInProfile = e)

    this.loadParticipantTags();
    this.loadBigInvitations();
    this.loadActivity();

    // Load saved selections from localStorage
    this.loadSavedSelections();

    getDocs(collection(this.firestore, "big cohorts")).then(snap => {
      this.cohortsList = snap.docs.map(e => {
        let element: any = e.data()
        element['contentview'] = 'participants'
        return element
      })
      this.filteredCohortsList = this.cohortsList
      this.toRunFilterFunctions()
    })
    getDocs(query(collection(this.firestore, "big marathon"), orderBy("startdate", "asc"))).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element: any = snap.docs[i].data();
        element['ref'] = snap.docs[i].ref
        this.mapMarathon[element['docid']] = element
        this.marathonList.push(element)
      }
      this.filteredMarathonList = [...this.marathonList]

      this.selectedMarathon = this.marathonList[this.marathonList.length - 1]['docid']
      this.toRunFilterFunctions()
    })
    getDocs(collection(this.firestore, "event collection")).then(snap => {
      this.acceleratorEventList = snap.docs.map((e) => {
        let element: any = e.data()
        element['ref'] = e.ref
        this.mapAcceleratorEvent[element['ref'].id] = element['name']
        return element
      }).filter(e => e['bigmarathonref'] != undefined)

      // Sort events - ongoing first
      this.acceleratorEventList = this.sortEventsWithOngoingFirst(this.acceleratorEventList);

      this.filteredAcceleratorEventList = this.acceleratorEventList
      this.searchableEventList = [...this.acceleratorEventList]
      
      // Patch saved event selections
      this.patchSavedEventSelections();
      this.toRunFilterFunctions()
    });

    getDocs(collection(this.firestore, 'event zones')).then((zones) => {
      this.zoneEventEventList = zones.docs.map((e) => {
        let element: any = e.data();
        element['ref'] = e.ref;
        element['docid'] = element['docid'] || e.id;
        this.mapZoneEvent[e.ref.id] = element['name'];
        this.mapZoneData[e.ref.id] = element;
        return element;
      });
      this.filteredZoneEventList = [...this.zoneEventEventList];
      this.searchableZoneEventList = [...this.zoneEventEventList];

      // Patch saved zone selections
      this.patchSavedZoneSelections();
    });

    let collectionName = "participant metadata"

    getDocs(query(collection(this.firestore, "journey"), where("atcmodel", "==", "B!G"))).then((snap) => {
      if (!snap.empty) {
        let bigJourneyList = snap.docs.map(e => e.id)
      } else {
        console.log("No Participants list found");
      }
    });

    getDocs(query(collection(this.firestore, collectionName),orderBy('name','asc'))).then((participants) => {
      let participantsList = participants.docs.map(e => e.data())
      let list = participants.docs.forEach((e)=>this.mapParticipantMetaData[e.id] = e.data())
      this.participantlist = participantsList;
    })    

    getDocs(collection(this.firestore, "queue generation")).then(queue => {
      const queueData = queue.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          docid: doc.id,
          ...data
        };
      });
      
      // Sort queues - ongoing first
      const sortedQueueData = this.sortQueuesWithOngoingFirst(queueData);
      
      this.searchableQueueList = [...sortedQueueData];
      this.filteredQueueList = [...sortedQueueData];
      
      queue.docs.forEach((doc) => {
        this.mapQueueName[doc.id] = doc.data()['queuename'];
      });

      // Patch saved queue selections
      this.patchSavedQueueSelections();
    });

  }

  ngOnInit(): void {

  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  async loadCohorts(){
    this.loading = true;
    getDocs(collection(this.firestore, "big cohorts")).then(snap => {
      this.cohortsList = snap.docs.map(e => {
        let element: any = e.data()
        element['contentview'] = 'participants'
        return element
      })
      this.toRunFilterFunctions();
      this.loading = false;
    })
  }

  loadActivity(){
    getDocs(query(collection(this.firestore, 'bigactivity'),orderBy('activity','asc'))).then((activity)=>{
      this.bigActivityMap = {};
      activity.docs.map(e => {
        const data: any = e.data();
        return this.bigActivityMap[e.id] = data;
      });
    });
  }

  // Load saved selections from localStorage
  loadSavedSelections() {
    try {
      const savedQueue = localStorage.getItem(this.STORAGE_KEY_QUEUE);
      const savedEvent = localStorage.getItem(this.STORAGE_KEY_EVENT);
      const savedZone = localStorage.getItem(this.STORAGE_KEY_ZONE);

      if (savedQueue) {
        this.selectedQueueEvent = JSON.parse(savedQueue);
      }
      if (savedEvent) {
        this.selectedAcceleratorEvent = JSON.parse(savedEvent);
      }
      if (savedZone) {
        this.selectedZoneEvent = JSON.parse(savedZone);
      }
    } catch (e) {
      console.error('Error loading saved selections:', e);
    }
  }

  // Save queue selection to localStorage
  saveQueueSelection() {
    try {
      localStorage.setItem(this.STORAGE_KEY_QUEUE, JSON.stringify(this.selectedQueueEvent));
    } catch (e) {
      console.error('Error saving queue selection:', e);
    }
  }

  // Save event selection to localStorage
  saveEventSelection() {
    try {
      localStorage.setItem(this.STORAGE_KEY_EVENT, JSON.stringify(this.selectedAcceleratorEvent));
    } catch (e) {
      console.error('Error saving event selection:', e);
    }
  }

  // Patch saved queue selections after data loads
  patchSavedQueueSelections() {
    if (this.selectedQueueEvent.length > 0) {
      // Validate saved selections exist in the list
      this.selectedQueueEvent = this.selectedQueueEvent.filter(id => 
        this.filteredQueueList.some(q => q.id === id || q.docid === id)
      );
      if (this.selectedQueueEvent.length > 0) {
        this.loadLiveAssignments();
        this.calculateUnassignedParticipants();
      }
    }
  }

  // Patch saved event selections after data loads
  patchSavedEventSelections() {
    if (this.selectedAcceleratorEvent.length > 0) {
      // Validate saved selections exist in the list
      this.selectedAcceleratorEvent = this.selectedAcceleratorEvent.filter(id => 
        this.acceleratorEventList.some(e => e.ref?.id === id)
      );
      if (this.selectedAcceleratorEvent.length > 0) {
        this.loadEventParticipationRequests();
      }
    }
  }

  // Sort queues with ongoing first
  sortQueuesWithOngoingFirst(queueData: any[]): any[] {
    const now = new Date();
    
    return queueData.sort((a: any, b: any) => {
      const startA = a['queuestartdate']?.toDate ? a['queuestartdate'].toDate() : new Date(a['queuestartdate'] || 0);
      const endA = a['queueenddate']?.toDate ? a['queueenddate'].toDate() : new Date(a['queueenddate'] || 0);
      const startB = b['queuestartdate']?.toDate ? b['queuestartdate'].toDate() : new Date(b['queuestartdate'] || 0);
      const endB = b['queueenddate']?.toDate ? b['queueenddate'].toDate() : new Date(b['queueenddate'] || 0);
      
      const isOngoingA = now >= startA && now <= endA;
      const isOngoingB = now >= startB && now <= endB;
      
      // Ongoing queues first
      if (isOngoingA && !isOngoingB) return -1;
      if (!isOngoingA && isOngoingB) return 1;
      
      // Then sort by start date descending
      return endB.getTime() - endA.getTime();
    });
  }

  // Sort events with ongoing first
  sortEventsWithOngoingFirst(eventData: any[]): any[] {
    const now = new Date();
    
    return eventData.sort((a: any, b: any) => {
      const startA = a['startdate']?.toDate ? a['startdate'].toDate() : new Date(a['startdate'] || 0);
      const endA = a['enddate']?.toDate ? a['enddate'].toDate() : new Date(a['enddate'] || 0);
      const startB = b['startdate']?.toDate ? b['startdate'].toDate() : new Date(b['startdate'] || 0);
      const endB = b['enddate']?.toDate ? b['enddate'].toDate() : new Date(b['enddate'] || 0);
      
      const isOngoingA = now >= startA && now <= endA;
      const isOngoingB = now >= startB && now <= endB;
      
      // Ongoing events first
      if (isOngoingA && !isOngoingB) return -1;
      if (!isOngoingA && isOngoingB) return 1;
      
      // Then sort by end date descending
      return endB.getTime() - endA.getTime();
    });
  }

  // Check if queue is ongoing
  isQueueOngoing(queue: any): boolean {
    const now = new Date();
    const start = queue['queuestartdate']?.toDate ? queue['queuestartdate'].toDate() : new Date(queue['queuestartdate'] || 0);
    const end = queue['queueenddate']?.toDate ? queue['queueenddate'].toDate() : new Date(queue['queueenddate'] || 0);
    return now >= start && now <= end;
  }

  // Check if event is ongoing
  isEventOngoing(event: any): boolean {
    const now = new Date();
    const start = event['startdate']?.toDate ? event['startdate'].toDate() : new Date(event['startdate'] || 0);
    const end = event['enddate']?.toDate ? event['enddate'].toDate() : new Date(event['enddate'] || 0);
    return now >= start && now <= end;
  }

  loadParticipantTags() {
    getDocs(collection(this.firestore, "participant tags")).then(snap => {
      this.participantTagsList = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      this.filteredTagsList = [...this.participantTagsList];
    });
  }

  loadBigInvitations() {
    getDocs(query(collection(this.firestore, "biginvitation"), where("status", "==", "accepted"))).then(snap => {
      this.bigInvitationList = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      this.calculateUnassignedParticipants();
    });
  }

  loadEventParticipationRequests() {
    if (this.selectedAcceleratorEvent.length === 0) {
      this.eventParticipationList = [];
      this.calculateUnassignedParticipants();
      return;
    }

    const selectedEventRefs = this.selectedAcceleratorEvent.map(eventId => 
      doc(this.firestore, 'event collection', eventId)
    );

    getDocs(query(
      collection(this.firestore, "event participation request"),
      where("eventref", "in", selectedEventRefs),
      where("status", 'in', ["approved",'attended'])
    )).then(snap => {
      this.eventParticipationList = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      this.calculateUnassignedParticipants();
    }).catch(err => {
      console.error('Error fetching event participation requests:', err);
      this.eventParticipationList = [];
      this.calculateUnassignedParticipants();
    });
  }

  loadLiveAssignments() {
    if (this.liveassignmentSubscription) { this.liveassignmentSubscription.unsubscribe(); }
    if (this.queuestudioSubscription) { this.queuestudioSubscription.unsubscribe(); }

    if (this.selectedQueueEvent.length === 0) {
      this.liveAssignmentList = [];
      this.studioPairingList = [];
      this.mapLiveParticipants = {};
      this.mapStudioPairing = {};
      this.mapParticipantStudios = {};
      this.mapLiveAssignmentByStudio = {};
      return;
    }

    this.liveassignmentSubscription = collectionSnapshots(
      query(
        collection(this.firestore, "live assignment"),
        where("status", "==", "live"),
        where('queueid', 'in', this.selectedQueueEvent)
      )
    ).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      this.liveAssignmentList = snapData.map(doc => ({ id: doc.id, ...doc.data() }));

      this.mapLiveAssignmentByStudio = {};
      this.liveAssignmentList.forEach((assignment: any) => {
        if (assignment['studioid']) {
          this.mapLiveAssignmentByStudio[assignment['studioid']] = assignment;
        }
      });

      this.updateParticipantStudioMappings();
    });

    const selectedQueueRef = this.selectedQueueEvent.map(id => doc(this.firestore, 'queue generation', id));

    this.queuestudioSubscription = collectionSnapshots(
      query(
        collection(this.firestore, 'queue studio pairing'),
        where("queueref", "in", selectedQueueRef),
        orderBy("created", "desc")
      )
    ).pipe(takeUntil(this.subscription)).subscribe(snapData => {

      this.studioPairingList = snapData.map(doc => ({ id: doc.id, docid: doc.id, ...doc.data() }));

      this.mapStudioPairing = {};
      this.studioPairingList.forEach((studio: any) => {
        this.mapStudioPairing[studio.docid || studio.id] = studio;
      });

      this.updateParticipantStudioMappings();
    });
  }

  updateParticipantStudioMappings() {
    this.mapLiveParticipants = {};
    this.mapParticipantStudios = {};

    this.studioPairingList.forEach((studio: any) => {
      const studioId = studio.docid || studio.id;
      const participants = studio.participants || [];
      const liveAssignment = this.mapLiveAssignmentByStudio[studioId];
      const isLive = !!liveAssignment;
      const queueId = studio['queueref']?.id;

      if([null , undefined , ''].includes(queueId)) return
      this.mapLiveParticipants[queueId] = this.mapLiveParticipants[queueId] ?? {};
      this.mapParticipantStudios[queueId] = this.mapParticipantStudios[queueId] ?? {};
      participants.forEach((participantId: string) => {
        if (!this.mapParticipantStudios[queueId][participantId]) {
          this.mapParticipantStudios[queueId][participantId] = [];
        }

        this.mapParticipantStudios[queueId][participantId].push({
          studioId: studioId,
          isLive: isLive,
          checkin: studio.checkin || false,
          studioin: studio.studioin || false,
          liveAssignment: liveAssignment,
          studioData: studio
        });

        if (isLive) {
          this.mapLiveParticipants[queueId][participantId] = true;
          // this.mapLiveParticipants[participantId] = true;
        }
      });
    });

    this.liveAssignmentList.forEach((assignment: any) => {
      const allParticipants = [
        ...(assignment['pairing'] || []),
        ...(assignment['bonusactivityparticipant'] || [])
      ];
      const queueId = assignment['queueid'];
      allParticipants.forEach((pid: string) => {
        if(!this.mapLiveParticipants[queueId]) return
        this.mapLiveParticipants[queueId][pid] = true;
      });
    });
  }

  isParticipantInStudio(queueId : string , participantId: string): boolean {
    if(this.mapLiveParticipants[queueId]){
      return this.mapLiveParticipants[queueId][participantId] === true;
    }
    return false;
  }

  getParticipantStatus(queueId : string , participantId: string): string {
    return this.isParticipantInStudio(queueId, participantId) ? 'Live' : 'Idle';
  }

  // getParticipantLiveStudioCount(participantId: string): number {
  //   const studios = this.mapParticipantStudios[participantId] || [];
  //   return studios.filter(s => s.isLive).length;
  // }

  // getParticipantStudios(participantId: string): any[] {
  //   return this.mapParticipantStudios[participantId] || [];
  // }

  // getParticipantTotalStudioCount(participantId: string): number {
  //   return (this.mapParticipantStudios[participantId] || []).length;
  // }

  // hasParticipantCheckedIn(participantId: string): boolean {
  //   const studios = this.mapParticipantStudios[participantId] || [];
  //   return studios.some(s => s.checkin === true);
  // }

  // isParticipantInStudioRoom(participantId: string): boolean {
  //   const studios = this.mapParticipantStudios[participantId] || [];
  //   return studios.some(s => s.studioin === true);
  // }

  // getParticipantStudioSummary(participantId: string): {
  //   totalStudios: number;
  //   liveStudios: number;
  //   checkedIn: boolean;
  //   inStudioRoom: boolean;
  //   studios: any[];
  // } {
  //   const studios = this.mapParticipantStudios[participantId] || [];
  //   return {
  //     totalStudios: studios.length,
  //     liveStudios: studios.filter(s => s.isLive).length,
  //     checkedIn: studios.some(s => s.checkin === true),
  //     inStudioRoom: studios.some(s => s.studioin === true),
  //     studios: studios
  //   };
  // }

  getIdleCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    const queueId = cohort['queueref']?.id;
    return participants.filter((pid: string) => !this.isParticipantInStudio(queueId , pid)).length;
  }

  getInStudioCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    const queueId = cohort['queueref']?.id;
    return participants.filter((pid: string) => this.isParticipantInStudio(queueId , pid)).length;
  }

  // getCohortStudioStats(cohort: any): {
  //   totalLiveStudios: number;
  //   checkedInCount: number;
  //   inStudioRoomCount: number;
  // } {
  //   const participants = cohort['participantidlist'] || [];
  //   let totalLiveStudios = 0;
  //   let checkedInCount = 0;
  //   let inStudioRoomCount = 0;

  //   participants.forEach((pid: string) => {
  //     const summary = this.getParticipantStudioSummary(pid);
  //     totalLiveStudios += summary.liveStudios;
  //     if (summary.checkedIn) checkedInCount++;
  //     if (summary.inStudioRoom) inStudioRoomCount++;
  //   });

  //   return { totalLiveStudios, checkedInCount, inStudioRoomCount };
  // }

  getParticipantStudioInList(queueId : string , participantId: string): any[] {
    const studios = this.mapParticipantStudios[queueId]?.[participantId] || [];
    return studios.filter(s => s.studioin === true);
  }

  getParticipantLiveAssignmentStats(participantId: string): {
    total: number;
    live: number;
    completed: number;
    assignments: any[];
  } {
    const participantAssignments: any[] = [];
    let liveCount = 0;
    let completedCount = 0;

    this.liveAssignmentList.forEach((assignment: any) => {
      const pairing = assignment['pairing'] || [];
      const bonusParticipants = assignment['bonusactivityparticipant'] || [];
      const allParticipants = [...pairing, ...bonusParticipants];

      if (allParticipants.includes(participantId)) {
        const status = assignment['status'] || 'live';
        participantAssignments.push({
          ...assignment,
          participantStatus: status
        });

        if (status === 'live' || status === 'ongoing') {
          liveCount++;
        } else if (status === 'completed') {
          completedCount++;
        }
      }
    });

    return {
      total: participantAssignments.length,
      live: liveCount,
      completed: completedCount,
      assignments: participantAssignments
    };
  }

  getStudioDisplayName(studio: any): string {
    return studio.studioData?.studioname ||
      studio.studioData?.name ||
      studio.studioId?.substring(0, 8) ||
      'Studio';
  }

  getParticipantCheckedInCount(queueId : string , participantId: string): any[] {
    const studios = this.mapParticipantStudios[queueId]?.[participantId] || [];
    return studios.filter(s => s.checkin === true);
  }

  calculateUnassignedParticipants() {
    if (this.selectedAcceleratorEvent.length === 0 && this.selectedQueueEvent.length === 0) {
      this.unassignedParticipants = [];
      this.filterUnassignSearch();
      return;
    }

    const assignedParticipantIds = new Set<string>();
    this.cohortsList.forEach(cohort => {
      const eventRefId = cohort['eventref']?.id;
      const marathonRefId = cohort['marathonref']?.id;

      const matchesEvent = this.selectedAcceleratorEvent.length > 0 &&
        this.selectedAcceleratorEvent.includes(eventRefId);
      const matchesMarathon = this.selectedMarathon && marathonRefId === this.selectedMarathon;

      if (matchesEvent) {
        (cohort['participantidlist'] || []).forEach((id: string) => {
          assignedParticipantIds.add(id);
        });
      }
    });

    const useEventParticipation = this.selectedAcceleratorEvent.length > 0;
    const useBigInvitation = this.selectedQueueEvent.length > 0 || this.selectedAcceleratorEvent.length > 0;

    const participantMap = new Map<string, any>();

    if (useEventParticipation && this.eventParticipationList.length > 0) {
      this.eventParticipationList.forEach(request => {
        const eventRefId = request['eventref']?.id;
        const participantId = request['participantid'] || request['profileid'];

        if (!participantId || assignedParticipantIds.has(participantId)) return;
        if (!this.selectedAcceleratorEvent.includes(eventRefId)) return;
        const key = `${participantId}_${eventRefId}`;

        participantMap.set(key, {
          ...request,
          participantId: participantId,
          name: this.mapProfile[participantId] || this.mapParticipantMetaData[participantId]?.['name'] || participantId,
          eventName: this.mapAcceleratorEvent[eventRefId] || 'Unknown Event',
          sources: ['event_participation_request'],
          inEventRequest: true,
          inBigInvitation: false
        });
      });
    }

    if (useBigInvitation && this.bigInvitationList.length > 0) {
      this.bigInvitationList.forEach(invitation => {
        const eventRefId = invitation['eventref']?.id;
        const participantId = invitation['participantid'] || invitation['profileid'];

        if (!participantId || assignedParticipantIds.has(participantId)) return;

        if (this.selectedAcceleratorEvent.length > 0) {
          if (!this.selectedAcceleratorEvent.includes(eventRefId)) return;
        }

        const key = `${participantId}_${eventRefId}`;
        
        if (participantMap.has(key)) {
          const existing = participantMap.get(key);
          existing.sources.push('big_invitation');
          existing.inBigInvitation = true;
          existing.bigInvitationData = invitation;
          participantMap.set(key, existing);
        } else {
          participantMap.set(key, {
            ...invitation,
            participantId: participantId,
            name: this.mapProfile[participantId] || this.mapParticipantMetaData[participantId]?.['name'] || participantId,
            eventName: this.mapAcceleratorEvent[eventRefId] || 'Unknown Event',
            sources: ['big_invitation'],
            inEventRequest: false,
            inBigInvitation: true
          });
        }
      });
    }

    this.unassignedParticipants = Array.from(participantMap.values());
    this.filterUnassignSearch();
  }

  showUnassignedParticipants() {
    this.calculateUnassignedParticipants();
    const ref = this.dialog.open(UnassignedParticipantsDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '80vh',
      panelClass: 'unassigned-dialog-container',
      data: {
        participants: this.unassignedParticipants,
        mapProfile: this.mapProfile,
        mapParticipantMetaData: this.mapParticipantMetaData,
        mapAcceleratorEvent: this.mapAcceleratorEvent,
        selectedEvents: this.selectedAcceleratorEvent,
        selectedQueues: this.selectedQueueEvent,
        cohortsList: this.selectedAcceleratorEvent.length > 0
          ? this.filteredCohortsList.filter(c => c['eventref'] && this.selectedAcceleratorEvent.includes(c['eventref'].id))
          : (this.filteredCohortsList.length > 0 ? this.filteredCohortsList : this.cohortsList)
      }
    });
    ref.afterClosed().subscribe((result: any) => {
      if (!result || result.action !== 'assign' || !result.cohort) return;
      this.assignUnassignedToCohort(result.participantIds || [], result.cohort);
    });
  }

  async assignUnassignedToCohort(participantIds: string[], targetCohort: any): Promise<void> {
    try {
    if (!participantIds?.length || !targetCohort?.docid) return;
    const targetRef = doc(this.firestore, 'big cohorts', targetCohort.docid);
    const batch = writeBatch(this.firestore);

    if(targetCohort.enableGroupChat && targetCohort['chatref']){
      const data = participantIds.map((pid)=>{
        return {
          profileId : pid,
          cohorts : [targetCohort].map((cohort)=>({...cohort , selected : true}))
        }
      });

      this.chatConfigModelData = data
      
      this.chatModelRef = this.dialog.open(this.chatConfig);

      const result = await this.chatModelRef.afterClosed().toPromise();

      if(result){
        for(let participant of result){
          const uid = (await this.getUidsFromProfileIds([participant.profileId]))[0];

          (participant.cohorts ?? []).forEach((cohort)=>{
            batch.update(cohort['chatref'] , {
              members: cohort.selected ? arrayUnion(uid) : arrayRemove(uid),
              group_name: cohort['name'],
              last_modification: new Date(),
              type: 'group'
            })
          })
        }
      }

    }
    alert(`Assigned ${participantIds.length} participant(s) to ${targetCohort.name}`);
    batch.update(targetRef, { participantidlist: arrayUnion(...participantIds) });
    batch.commit();
    
    if (!targetCohort.participantidlist) targetCohort.participantidlist = [];
    participantIds.forEach(pid => {
      if (!targetCohort.participantidlist.includes(pid)) targetCohort.participantidlist.push(pid);
    });
    this.unassignedParticipants = (this.unassignedParticipants || []).filter(
      (p: any) => !participantIds.includes(p.participantId || p.id)
    );
    this.filterUnassignSearch();
    this.chatModelRef = null;
    } catch (err) {
      console.error('Error assigning participants:', err);
      alert('Error assigning participants. Please try again.');
    }

  }

  
  openCohortChat(cohort: any) {
    const chatDocId = cohort['docid'];
    window.open(window.location.origin + '/group-chat');
  }

  sendCohortNotification(cohorts){    
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e])
    let dialogRef = this.dialog.open(AhNotificationComponent,{
      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result,'send app notificationssss');
      if(result != null && result != undefined){
        var userID = [];
        var profileID = [];
        console.log(selectedParticipants,"selectedParticipants");
        for (let i = 0; i < selectedParticipants.length; i++) {
          const selected = selectedParticipants[i];
          if(selected["firebaseuserref"] != null){
            profileID.push(selected["profileid"])
          }
        }

        var notificationimage = null
        if(result["notificationimage"] != null){
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(this.storage,filepath)
            const uploadResult = await uploadBytes(storageRef,result["notificationimage"])
            notificationimage = await getDownloadURL(uploadResult.ref)
          } catch (error) {
            console.log("file upload error",error);
          }
        }
        console.log(profileID,"profileIDprofileIDprofileIDprofileID");
        this.authguard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true, 
          landingpage: result["landingpage"],
          profileid: profileID,
        }).then(()=>{
          console.log( notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  };

  sendCohortEmail(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e])
    console.log(selectedParticipants);
    
    let dialogRef = this.dialog.open(EmailInputComponent,{
      data : selectedParticipants,
      minWidth : "600px",
      disableClose:true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        console.log(result);
        
        const docRef = doc(collection(this.firestore,"email archive"),result['docid']);
        if(result['status'] == 'queued' || result['status'] == 'send'){
          await setDoc(docRef,result,{merge:true}).then(() => {
            this.authguard.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK",600);
          }).catch(err => {
            console.log(err);
            this.authguard.openSnackBar("Error Sending Email", "OK",600);
          });
        }else if (result['status'] == 'validated'){
          let url:string;
          if(environment.firebase.projectId == 'starlabs-test'){
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data),{
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log(err);
              console.log("Error: " + err);
            }
          });
        }

      }
    })
  };

  sendCohortWhatsapp(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e])
    
    let dialogRef = this.dialog.open(WatiInputComponent,{
      data : selectedParticipants,
      width : "70vw",
      height : "80vh",
      disableClose:true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        if(result == 'success') {
          this.authguard.openSnackBar("Wati Message Sent Successfully", "OK",600);
          if(result['status'] == 'sendtoparticipants'){
            let url:string;

            if(environment.firebase.projectId == 'starlabs-test'){
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
              url = ""
            } 

            const docRef = doc(collection(this.firestore , 'wati archive'), result['archiveid']);
            await updateDoc(docRef, {
              templatestatus: "created",
              templatevalidated: true,
            }).then(() => {
              console.log("Wati Archive Document Created");
            }).catch((error) => {
              console.log("Error Creating Wati Archive");
            });

            const response = await this.http.post(url, { archiveid: result['archiveid'] }).toPromise();
            console.log("Response : ",response)

          }
        } else if(result == 'failed') {
          this.authguard.openSnackBar("Sending Wati Message Failed", "OK",600);
        }
      }
    });
  };

  sendCohortRecommendedPlaylist(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e]);

    let dialogRef = this.dialog.open(MapRecommendedplaylistToparticipantComponentComponent, {
      data: {
        participantlist: selectedParticipants,
        // personalised : personalised
      },
      minWidth: "500px",
      disableClose: true
    })
    // dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
    //   if (result != null && result != undefined) {
    //     let docid = doc(collection(this.firestore, "buffermix archive")).id
    //     result['docid'] = docid
    //     setDoc(doc(this.firestore, "buffermix archive", docid), result).then(() => {
    //       console.log("buffer document created");
    //     }).catch(err => {
    //       console.log(err);
    //     })
    //   }
    // });
  }

  moveMenuSearchQuery: string = '';
  moveMenuFilteredCohorts: any[] = [];
  isMovingParticipant: boolean = false;

  filterMoveMenuCohorts(cohort: string) {
    const cohortId = cohort['docid'];
    const eventId = cohort['eventref']?.id;
    const query = this.moveMenuSearchQuery.toLowerCase().trim();
    let cohorts = this.filteredCohortsList.filter(c => c.docid !== cohortId && c['eventref']?.id === eventId);

    if (query) {
      cohorts = cohorts.filter(c => c.name?.toLowerCase().includes(query));
    }

    this.moveMenuFilteredCohorts = cohorts;
  }

  onMoveMenuOpen(cohort: any) {
    this.moveMenuSearchQuery = '';
    this.filterMoveMenuCohorts(cohort);
  }

  onMoveMenuSearch(event: Event, cohort: any) {
    event.stopPropagation();
    this.filterMoveMenuCohorts(cohort);
  }
  
  async moveParticipantToCohort(participantId: string[], sourceCohort: any, targetCohort: any) {
    try {
      const checkForActiveStudio = [];

      for (let pid of participantId) {
        const check = await this.checkForActiveParticipantStuidosInCohort(sourceCohort, pid);
        if (check) checkForActiveStudio.push(this.mapProfile[pid]);
      }

      if (checkForActiveStudio.length > 0) {
        alert('There are active stuido for the selected participant please disbale it before moving to another cohorts');
        return
      }
      if (this.isMovingParticipant) return;

      this.isMovingParticipant = true;
      const batch = writeBatch(this.firestore);

      if (sourceCohort?.enableGroupChat || targetCohort?.enableGroupChat) {
        let sorucecohortmembers = [];
        let targetcohortmembers = [];
        
        if(sourceCohort?.chatref?.path) { sorucecohortmembers = (await getDoc(doc(this.firestore, sourceCohort?.chatref.path))).data()['members'] ?? [] }
        if(targetCohort?.chatref?.path) targetcohortmembers = (await getDoc(doc(this.firestore, targetCohort?.chatref.path))).data()['members'] ?? [];

        const data = [];

        for (let pid of participantId) {
          const uid = (await this.getUidsFromProfileIds([pid]))[0];
          const d = {
            profileId: pid,
            uid : uid,
            cohorts: []
          }
          if (sourceCohort?.enableGroupChat && sourceCohort?.chatref) {

            d.cohorts.push({
              ...sourceCohort,
              selected: sorucecohortmembers.includes(uid)
            })

          }

          if (targetCohort?.enableGroupChat && targetCohort?.chatref) {
            d.cohorts.push({
              ...targetCohort,
              selected: targetcohortmembers.includes(uid)
            })
          }

          data.push(d);
        }


        this.chatConfigModelData = data
        this.chatModelRef = this.dialog.open(this.chatConfig);

        const result = await this.chatModelRef.afterClosed().toPromise();

        if (result) {
          for (let participant of result) {
            (participant.cohorts ?? []).forEach((cohort) => {
              batch.update(cohort['chatref'], {
                members: cohort.selected ? arrayUnion(participant.uid) : arrayRemove(participant.uid),
                group_name: cohort['name'],
                last_modification: new Date(),
                type: 'group'
              })
            })
          }
        }
      }


      const sourceCohortRef = doc(this.firestore, "big cohorts", sourceCohort.docid);
      batch.update(sourceCohortRef, {
        participantidlist: arrayRemove(...participantId)
      });

      const targetCohortRef = doc(this.firestore, "big cohorts", targetCohort.docid);
      batch.update(targetCohortRef, {
        participantidlist: arrayUnion(...participantId)
      });

      await batch.commit();

      for (let pid of participantId) {
        await this.createMoveLog(pid, sourceCohort, targetCohort);
      }

      this.loadCohorts()
      console.log(`Moved participant ${participantId} from ${sourceCohort.name} to ${targetCohort.name}`);

    } catch (error) {
      console.error('Error moving participant:', error);
      alert('Error moving participant. Please try again.');
    } finally {
      this.isMovingParticipant = false;
    }
  }

  async createMoveLog(participantId: string, sourceCohort: any, targetCohort: any) {
    const logDocId = doc(collection(this.firestore, "big cohorts log")).id;

    const logData = {
      docid: logDocId,
      createddate: new Date(),
      participantid: participantId,
      cohortid: targetCohort.docid,
      fromcohortid: sourceCohort.docid,
      fromcohortname: sourceCohort.name,
      tocohortname: targetCohort.name,
      eventref: targetCohort.eventref || null,
      addedby: this.loggedInProfile?.profileid || this.loggedInProfile?.uid || '',
      addeddate: new Date(),
      status: 'moved',
      level: targetCohort.level || 'level1',
      marathonref: targetCohort.marathonref || null,
      cohortType: targetCohort.cohortType || 'general',
      cohortCategory: targetCohort.cohortCategory || 'studio'
    };

    await setDoc(doc(this.firestore, "big cohorts log", logDocId), logData);
    console.log('Move log created:', logDocId);
  }

  // Create log entries for specific participants with given status
  async createLogsForParticipants(cohortData: any, participantIds: string[], status: 'added' | 'removed') {
    if (participantIds.length === 0) return;

    const loggedInProfileId = this.loggedInProfile?.profileid || this.loggedInProfile?.uid || '';

    const logPromises = participantIds.map(async (participantId: string) => {
      const logDocId = doc(collection(this.firestore, "big cohorts log")).id;

      const logData = {
        docid: logDocId,
        createddate: new Date(),
        profileid: participantId,
        cohortid: cohortData['docid'],
        cohortname: cohortData['name'],
        eventref: cohortData['eventref'] || null,
        addedby: loggedInProfileId,
        addeddate: status === 'added' ? new Date() : null,
        removedby: status === 'removed' ? loggedInProfileId : null,
        removeddate: status === 'removed' ? new Date() : null,
        status: status,
        level: cohortData['level'] || 'level1',
        marathonref: cohortData['marathonref'] || null,
        cohortType: cohortData['cohortType'] || 'general',
        cohortCategory: cohortData['cohortCategory'] || 'studio'
      };

      return setDoc(doc(this.firestore, "big cohorts log", logDocId), logData);
    });

    try {
      await Promise.all(logPromises);
      console.log(`Created ${participantIds.length} "${status}" log entries for cohort:`, cohortData['docid']);
    } catch (error) {
      console.error(`Error creating ${status} cohort logs:`, error);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    // Dialogs, the mobile sheet, and filter pills themselves are safe zones —
    // their own click handlers (scrim click / explicit close) control closing.
    if (target.closest('.dialog, .dialog-scrim, .sheet, .scrim, .fi, .fg, .mat-mdc-menu-panel')) return;
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'horizontal' ? 'vertical' : 'horizontal';
  }

  setViewMode(mode: 'horizontal' | 'vertical') {
    this.viewMode = mode;
  }

  onMarathonSearch() {
    const query = this.marathonSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredMarathonList = [...this.marathonList];
    } else {
      this.filteredMarathonList = this.marathonList.filter(m =>
        m['title']?.toLowerCase().includes(query)
      );
    }
  }

  selectMarathon() {
    this.marathonDropdownOpen = false;
    this.marathonSearchQuery = '';
    this.filteredMarathonList = [...this.marathonList];
    this.onFilterAcceleratorEvent();
    this.onFilter();
  }

  onEventSearch() {
    const query = this.eventSearchQuery.toLowerCase().trim();
    if (!query) {
      this.searchableEventList = [...this.filteredAcceleratorEventList];
    } else {
      this.searchableEventList = this.filteredAcceleratorEventList.filter(e =>
        e['name']?.toLowerCase().includes(query)
      );
    }
  }

  toggleEventSelection() {
    this.saveEventSelection();
    this.onFilter();
    this.loadEventParticipationRequests();
  }

  clearEventSelection() {
    this.selectedAcceleratorEvent = [];
    this.eventParticipationList = [];
    this.saveEventSelection();
    this.onFilter();
    this.calculateUnassignedParticipants();
  }

  onQueueSearch() {
    const searchTerm = this.queueSearchQuery.toLowerCase().trim();
    if (!searchTerm) {
      this.searchableQueueList = [...this.filteredQueueList];
    } else {
      this.searchableQueueList = this.filteredQueueList.filter((e: any) => {
        const queueName = (e['queuename'] || '').toLowerCase();
        const queueId = (e['id'] || e['docid'] || '').toLowerCase();
        return queueName.includes(searchTerm) || queueId.includes(searchTerm);
      });
    }
  }
    
  toggleQueueSelection() {
    this.saveQueueSelection();
    this.loadLiveAssignments();
    this.calculateUnassignedParticipants();
  }

  toggleMarathonSelection(){
    this.selectMarathon()
  }

  clearQueueSelection() {
    this.selectedQueueEvent = [];
    this.queueSearchQuery = '';
    this.searchableQueueList = [...this.filteredQueueList];
    this.saveQueueSelection();
    this.loadLiveAssignments();
    this.calculateUnassignedParticipants();
  }

  onQueueDropdownOpen() {
    this.queueSearchQuery = '';
    this.searchableQueueList = [...this.filteredQueueList];
  }

  onTagSearch() {
    const query = this.tagSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredTagsList = [...this.participantTagsList];
    } else {
      this.filteredTagsList = this.participantTagsList.filter(tag =>
        tag['name']?.toLowerCase().includes(query) ||
        tag['tagname']?.toLowerCase().includes(query)
      );
    }
  }

  toggleTagSelection() {
    this.onFilter();
  }

  clearTagSelection() {
    this.selectedTags = [];
    this.tagSearchQuery = '';
    this.filteredTagsList = [...this.participantTagsList];
    this.onFilter();
  }

  getTagName(tagId: string): string {
    const tag = this.participantTagsList.find(t => t.id === tagId);
    return tag?.name || tag?.tagname || tagId;
  }

  onFilter() {
    // const searchTerm = this.searchQuery?.toLowerCase().trim() || '';
    
    let filtered = this.cohortsList.filter(e => {
      const marathonMatch = this.selectedMarathon ? this.selectedMarathon == e['marathonref']?.id : true;

      let eventMatch = true;
      if (this.selectedAcceleratorEvent.length > 0) {
        eventMatch = this.selectedAcceleratorEvent.includes(e['eventref']?.id);
      }

      // Status filter - by default hide nonactive unless showExpiredCohorts is true
      let statusMatch = true;
      if (this.statusFilter === 'active') {
        statusMatch = e['status'] === 'active' || e['status'] === undefined;
      } else if (this.statusFilter === 'nonactive') {
        statusMatch = e['status'] === 'nonactive';
      } else {
        // 'all' filter - but still hide nonactive unless showExpiredCohorts is checked
        if (!this.showExpiredCohorts) {
          statusMatch = e['status'] !== 'nonactive';
        }
      }

      let categoryMatch = true;
      if (this.categoryFilter === 'studio') {
        categoryMatch = e['cohortCategory'] === 'studio' || e['cohortCategory'] === undefined;
      } else if (this.categoryFilter === 'readiness') {
        categoryMatch = e['cohortCategory'] === 'readiness';
      } else if (this.categoryFilter === 'educational') {
        categoryMatch = e['cohortCategory'] === 'educational';
      } else if (this.categoryFilter === 'operational') {
        categoryMatch = e['cohortCategory'] === 'operational';
      }

      let typeMatch = true;
      if (this.typeFilter === 'general') {
        typeMatch = e['cohortType'] === 'general' || e['cohortType'] === undefined || !e['eventref'];
      } else if (this.typeFilter === 'event') {
        typeMatch = e['cohortType'] === 'event' || e['eventref'] != null;
      }

      let temporaryMatch = true;
      if (this.showTemporaryOnly) {
        temporaryMatch = e['isTemporary'] === true;
      }

      let tagMatch = true;
      if (this.selectedTags.length > 0) {
        const cohortTags = e['tags'] || [];
        tagMatch = this.selectedTags.some(selectedTag =>
          cohortTags.includes(selectedTag) ||
          cohortTags.some((ct: any) => ct?.id === selectedTag || ct === selectedTag)
        );
      }

      let zoneMatch = true;
      if (this.selectedZoneEvent.length > 0) {
        zoneMatch = this.zoneMappedCohortIds.has(e['docid']);
      }

      let searchMatch = true;
      // const cohortSearchTerm = this.cohortSearchQuery?.toLowerCase().trim() || '';
      const participantSearchTerm = this.participantSearchQuery?.toLowerCase().trim() || '';

      // if (cohortSearchTerm) {
      //   const cohortName = (e['name'] || '').toLowerCase();
      //   const eventName = this.mapAcceleratorEvent[e['eventref']?.id]?.toLowerCase() || '';
      //   searchMatch = cohortName.includes(cohortSearchTerm) || eventName.includes(cohortSearchTerm);
      // }

      if (participantSearchTerm) {
        const cohortName = (e['name'] || '').toLowerCase();
        const eventName = this.mapAcceleratorEvent[e['eventref']?.id]?.toLowerCase() || '';
        const participants = e['participantidlist'] || [];
        const hasMatchingParticipant = participants.some((participantId: string) => {
          const participantName = (this.mapProfile[participantId] || participantId).toLowerCase();
          return participantName.includes(participantSearchTerm);
        });
        searchMatch = hasMatchingParticipant || cohortName.includes(participantSearchTerm) || eventName.includes(participantSearchTerm);
      }

      return marathonMatch && eventMatch && statusMatch && categoryMatch && typeMatch && temporaryMatch && tagMatch && zoneMatch && searchMatch;
    });

    this.filteredCohortsList = filtered;
    this.applySorting();

    let participantList = this.filteredCohortsList.map(e => e['participantidlist']);
    this.totalParticipantsInCohorts = [].concat(...participantList)
    this.totalParticipantsInCohorts = Array.from(new Set(this.totalParticipantsInCohorts))

    this.calculateUnassignedParticipants();
    this.filterActivityLog()

    return this.filteredCohortsList;
  }

  getCohortLiveAssignmentsCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    let totalLive = 0;
    
    participants.forEach((pid: string) => {
      const stats = this.getParticipantLiveAssignmentStats(pid);
      totalLive += stats.live;
    });
    
    return totalLive;
  }

  getCohortCompletedAssignmentsCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    let totalCompleted = 0;
    
    participants.forEach((pid: string) => {
      const stats = this.getParticipantLiveAssignmentStats(pid);
      totalCompleted += stats.completed;
    });
    
    return totalCompleted;
  }

  getCohortTotalStudiosCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    const queueId = cohort['queueref']?.id ?? null;
    const studioSet = new Set();
    
    if(queueId){
      participants.forEach((pid: string) => {
        this.getParticipantStudioInList(queueId, pid).forEach(({ studioId }) => {
          if (studioId) {
            studioSet.add(studioId);
          }
        })
    });
    }
    return studioSet.size;
  }

  getCohortTotalCheckedStudiosCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    const queueId = cohort['queueref']?.id ?? null;
    const studioSet = new Set();
    
    if(queueId){
      participants.forEach((pid: string) => {
        this.getParticipantCheckedInCount(queueId, pid).forEach(({ studioId }) => {
          if (studioId) {
            studioSet.add(studioId);
          }
        })
    });
    }
    
    return studioSet.size;
  }

  getDaysRemaining(endDate: any): number {
    if (!endDate) return 0;
    const end = endDate?.toDate ? endDate.toDate() : new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysRemaining);
  }

  isExpired(endDate: any): boolean {
    return this.getDaysRemaining(endDate) <= 0;
  }

  getCohortEventName(cohort: any): string {
    if (cohort['eventref']) {
      return this.mapAcceleratorEvent[cohort['eventref'].id] || '';
    }
    return '';
  }

  applyGrouping() {
    this.groupedCohorts = {};
    this.groupedCohortsDateRange = {};

    if (this.groupBy === 'none') {
      this.groupedCohorts['All Cohorts'] = this.filteredCohortsList;
      return;
    }

    if (this.groupBy === 'levels') {
      this.filteredCohortsList.forEach(cohort => {
        const level = cohort['level'] || 'level1';
        const levelLabel = this.getLevelLabel(level);
        if (!this.groupedCohorts[levelLabel]) {
          this.groupedCohorts[levelLabel] = [];
        }
        this.groupedCohorts[levelLabel].push(cohort);
      });

      const sortedGroups: { [key: string]: any[] } = {};
      const levelOrder = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Unassigned'];
      levelOrder.forEach(level => {
        if (this.groupedCohorts[level]) {
          sortedGroups[level] = this.groupedCohorts[level];
        }
      });
      this.groupedCohorts = sortedGroups;
    }

    if (this.groupBy === 'category') {
      const labelMap: any = {
        studio: 'STUDIO BASED',
        readiness: 'READINESS',
        educational: 'EDUCATIONAL',
        operational: 'OPERATIONAL',
      };
      this.filteredCohortsList.forEach(cohort => {
        const cat = cohort['cohortCategory'] || 'studio';
        const label = labelMap[cat] || (cat ? cat.toUpperCase() : 'UNCATEGORIZED');
        if (!this.groupedCohorts[label]) this.groupedCohorts[label] = [];
        this.groupedCohorts[label].push(cohort);
      });
      const order = ['STUDIO BASED', 'READINESS', 'EDUCATIONAL', 'OPERATIONAL'];
      const sortedGroups: { [key: string]: any[] } = {};
      order.forEach(k => { if (this.groupedCohorts[k]) sortedGroups[k] = this.groupedCohorts[k]; });
      Object.keys(this.groupedCohorts).forEach(k => { if (!sortedGroups[k]) sortedGroups[k] = this.groupedCohorts[k]; });
      this.groupedCohorts = sortedGroups;
    }

    if (this.groupBy === 'studio') {
      this.filteredCohortsList.forEach(cohort => {
        const activityId = cohort['bigactivity'];
        const isStudio = cohort['cohortCategory'] === 'studio' || cohort['cohortCategory'] === undefined;
        const label = isStudio
          ? ((this.bigActivityMap as any)?.[activityId]?.['activity'] || activityId || 'Not Configured')
          : 'Non-Studio';
        if (!this.groupedCohorts[label]) this.groupedCohorts[label] = [];
        this.groupedCohorts[label].push(cohort);
      });
      const keys = Object.keys(this.groupedCohorts).sort((a, b) => {
        if (a === 'Non-Studio') return 1;
        if (b === 'Non-Studio') return -1;
        return a.localeCompare(b);
      });
      const sortedGroups: { [key: string]: any[] } = {};
      keys.forEach(k => sortedGroups[k] = this.groupedCohorts[k]);
      this.groupedCohorts = sortedGroups;
    }

    if (this.groupBy === 'zone') {
      const cohortToZones: { [cohortId: string]: string[] } = {};
      Object.keys(this.mapZoneData || {}).forEach(zoneId => {
        const zone: any = this.mapZoneData[zoneId];
        const zoneName: string = zone?.name || zoneId;
        const cohortIds: string[] = zone?.cohorts || [];
        cohortIds.forEach(cid => {
          if (!cohortToZones[cid]) cohortToZones[cid] = [];
          cohortToZones[cid].push(zoneName);
        });
      });
      this.filteredCohortsList.forEach(cohort => {
        const zones = cohortToZones[cohort['docid']] || [];
        if (zones.length === 0) {
          const label = 'Unassigned Zone';
          if (!this.groupedCohorts[label]) this.groupedCohorts[label] = [];
          this.groupedCohorts[label].push(cohort);
        } else {
          zones.forEach(zoneName => {
            if (!this.groupedCohorts[zoneName]) this.groupedCohorts[zoneName] = [];
            this.groupedCohorts[zoneName].push(cohort);
          });
        }
      });
      const keys = Object.keys(this.groupedCohorts).sort((a, b) => {
        if (a === 'Unassigned Zone') return 1;
        if (b === 'Unassigned Zone') return -1;
        return a.localeCompare(b);
      });
      const sortedGroups: { [key: string]: any[] } = {};
      keys.forEach(k => sortedGroups[k] = this.groupedCohorts[k]);
      this.groupedCohorts = sortedGroups;
    }

    if (this.groupBy === 'daterange') {
      // Sort cohorts by created date based on sortOrder
      const sortedCohorts = [...this.filteredCohortsList].sort((a, b) => {
        const dateA = a['createddate']?.toDate ? a['createddate'].toDate() : new Date(a['createddate'] || 0);
        const dateB = b['createddate']?.toDate ? b['createddate'].toDate() : new Date(b['createddate'] || 0);
        const comparison = dateA.getTime() - dateB.getTime();
        return this.sortOrder === 'asc' ? comparison : -comparison;
      });

      // Group cohorts within 7 days of each other
      const groups: { cohorts: any[], startDate: Date, endDate: Date }[] = [];
      
      sortedCohorts.forEach(cohort => {
        const cohortDate = cohort['createddate']?.toDate ? cohort['createddate'].toDate() : new Date(cohort['createddate'] || 0);
        
        // Find existing group where this cohort fits (within 7 days of any cohort in the group)
        let foundGroup = false;
        for (let group of groups) {
          const daysDiffFromStart = Math.abs((cohortDate.getTime() - group.startDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysDiffFromEnd = Math.abs((cohortDate.getTime() - group.endDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiffFromStart <= 7 || daysDiffFromEnd <= 7) {
            group.cohorts.push(cohort);
            // Update start and end dates
            if (cohortDate < group.startDate) {
              group.startDate = cohortDate;
            }
            if (cohortDate > group.endDate) {
              group.endDate = cohortDate;
            }
            foundGroup = true;
            break;
          }
        }
        
        if (!foundGroup) {
          groups.push({
            cohorts: [cohort],
            startDate: cohortDate,
            endDate: cohortDate
          });
        }
      });

      // Sort groups by date based on sortOrder
      groups.sort((a, b) => {
        const comparison = a.startDate.getTime() - b.startDate.getTime();
        return this.sortOrder === 'asc' ? comparison : -comparison;
      });

      // Convert groups to the required format
      groups.forEach((group, index) => {
        const dateLabel = this.formatDateRangeLabel(group.startDate, group.endDate);
        this.groupedCohorts[dateLabel] = group.cohorts;
        this.groupedCohortsDateRange[dateLabel] = group;
      });
    }
  }

  formatDateRangeLabel(startDate: Date, endDate: Date): string {
    const formatOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const startStr = startDate.toLocaleDateString('en-US', formatOptions);
    const endStr = endDate.toLocaleDateString('en-US', formatOptions);
    
    if (startStr === endStr) {
      return startStr;
    }
    return `${startStr} - ${endStr}`;
  }

  getLevelLabel(level: string): string {
    const levelMap: { [key: string]: string } = {
      'level1': 'Level 1',
      'level2': 'Level 2',
      'level3': 'Level 3',
      'level4': 'Level 4',
      'level5': 'Level 5'
    };
    return levelMap[level] || 'Unassigned';
  }

  getDateRangeLabel(date: Date): string {
    if (!date || isNaN(date.getTime())) return 'Unknown Date';

    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) return 'This Week';
    if (diffDays <= 30) return 'This Month';
    if (diffDays <= 90) return 'Last 3 Months';
    if (diffDays <= 180) return 'Last 6 Months';
    return 'Older';
  }

  getGroupKeys(): string[] {
    return Object.keys(this.groupedCohorts);
  }

  getGroupDateRange(groupKey: string): { startDate: Date, endDate: Date } | null {
    return this.groupedCohortsDateRange[groupKey] || null;
  }

  setStatusFilter(status: 'all' | 'active' | 'nonactive') {
    this.statusFilter = status;
    this.statusDropdownOpen = false;
    this.onFilter();
  }

  setCategoryFilter(category: 'all' | 'studio' | 'readiness' | 'educational' | 'operational') {
    this.categoryFilter = category;
    this.categoryDropdownOpen = false;
    this.onFilter();
  }

  setTypeFilter(type: 'all' | 'general' | 'event') {
    this.typeFilter = type;
    this.typeDropdownOpen = false;
    this.onFilter();
  }

  setGroupBy(groupBy: 'none' | 'levels' | 'daterange' | 'category' | 'studio' | 'zone') {
    this.groupBy = groupBy;
    this.applyGrouping();
  }

  toggleTemporaryOnly() {
    this.showTemporaryOnly = !this.showTemporaryOnly;
    this.onFilter();
  }

  toggleExpiredCohorts() {
    this.showExpiredCohorts = !this.showExpiredCohorts;
    this.onFilter();
  }

  toggleCohortView(cohort: any) {
    cohort['contentview'] = cohort['contentview'] === 'activities' ? 'participants' : 'activities';
  }

  toRunFilterFunctions() {
    if (this.cohortsList && this.cohortsList.length != 0 && this.selectedMarathon) {
      this.onFilter();
    }
    if (this.selectedMarathon && this.acceleratorEventList && this.acceleratorEventList.length != 0) {
      this.onFilterAcceleratorEvent();
    }
  }

  onCreateAssignment(cohorts: any) {
    console.log(this.cohortsList.map((e)=> e.marathonref || null));
    console.log(this.cohortsList);
    console.log(this.selectedMarathon);
    let dialogref = this.dialog.open(PlanActivityComponent, {
      maxWidth: '100vw',
      width: '100vw',
      height: '100vh',
      panelClass: 'full-width-dialog',
      data: {
        type: 'new',
        doc: cohorts,
        cohortslist: this.cohortsList.filter(e => this.selectedMarathon === e['marathonref']?.id),
        mapProfile: this.mapProfile,
        participantList: this.participantlist ?? []
      },
      disableClose: true,
    })
    dialogref.afterClosed().subscribe((result) => {
      if (result) { }
    })
  }

  onEditAssignment(cohorts: any, assignment: any , event : Event) {
    event.stopPropagation();
    console.log('parameters : ',cohorts , assignment)
    console.log(this.cohortsList.map((e)=> e?.marathonref?.id || null));
    console.log(this.selectedMarathon);
    let dialogref = this.dialog.open(PlanActivityComponent, {
      data: {
        type: 'edit',
        doc: cohorts,
        cohortslist: this.cohortsList.filter(e => this.selectedMarathon === e['marathonref']?.id),
        assignmentdoc: assignment,
        mapProfile: this.mapProfile,
      },
      disableClose: true,
      maxWidth: '100vw',
      width: '100vw',
      height: '100vh',
      panelClass: 'full-width-dialog',
    })
    dialogref.afterClosed().subscribe((result) => {
      if (result) { }
    })
  }

  onFilterAcceleratorEvent() {
    this.getAssignmentData()
    this.filteredAcceleratorEventList = this.acceleratorEventList.filter(e => e['bigmarathonref'].id === this.selectedMarathon)
    // Sort with ongoing first
    this.filteredAcceleratorEventList = this.sortEventsWithOngoingFirst(this.filteredAcceleratorEventList);
    this.searchableEventList = [...this.filteredAcceleratorEventList]
    this.eventSearchQuery = ''
    return this.filteredAcceleratorEventList
  }

  getAssignmentData() {
    if (!this.selectedMarathon || !this.mapMarathon[this.selectedMarathon]) return;

    const bigassignmentQuery = query(collection(this.firestore, "big assignment"), where("marathonref", "==", this.mapMarathon[this.selectedMarathon]['ref']))
    collectionSnapshots(bigassignmentQuery).pipe(takeUntil(this.subscription)).subscribe((snapData) => {
      let snap = snapData.map(doc => ({ id: doc.id, ...doc.data() }))

      this.mapBigAssignment = {}
      for (let i = 0; i < snap.length; i++) {
        const element: any = snap[i];
        this.mapBigAssignment[element['docid']] = element
      }
    })

    const bigparticipantsassignmentsQuery = query(collection(this.firestore, "big participants assignments"), where("marathonref", "==", this.mapMarathon[this.selectedMarathon]['ref']))
    collectionSnapshots(bigparticipantsassignmentsQuery).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      let snap = snapData.map(doc => ({ id: doc.id, ...doc.data() }))
      this.mapParticiantsAssignments = {}
      this.mapOngoingAssignments = {}
      this.mapCompletedAssignments = {}
      for (let i = 0; i < snap.length; i++) {
        const element: any = snap[i];
        this.mapParticiantsAssignments[element['cohortsref'].id] = this.mapParticiantsAssignments[element['cohortsref'].id] || {}
        this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] = this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] || []
        this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id].push(element)
        if (['initiated', 'ongoing'].includes(element['status'])) {
          this.mapOngoingAssignments[element['assignmentref'].id] = this.mapOngoingAssignments[element['assignmentref'].id] || []
          this.mapOngoingAssignments[element['assignmentref'].id].push(element)
        } else {
          this.mapCompletedAssignments[element['assignmentref'].id] = this.mapCompletedAssignments[element['assignmentref'].id] || []
          this.mapCompletedAssignments[element['assignmentref'].id].push(element)
        }
      }
      let totalparticipantengagement: any[] = []
      for (const cohorts in this.mapParticiantsAssignments) {
        for (const assignment in this.mapParticiantsAssignments[cohorts]) {
          totalparticipantengagement.push(this.mapParticiantsAssignments[cohorts][assignment])
        }
      }
      const participantEngagementArray = [].concat(...(totalparticipantengagement || []));
      const totalParticipantsCount = this.totalParticipantsInCohorts ? this.totalParticipantsInCohorts.length : 0;
      let percentage = 0;
      if (totalParticipantsCount > 0) {
        percentage = Math.ceil((participantEngagementArray.length / totalParticipantsCount) * 100)
      }
      this.totalParticpantsEngagement = percentage
    })
    this.loading = false
  }

  onStartMetting(assignmentid: string) {
    let url = this.router.createUrlTree(['/zoommeeting_bigparticipants/'], {
      queryParams: {
        assignmentid: assignmentid,
        profileid: this.loggedInProfile['profileid'],
        participantAssignmentId: null,
        type: 1
      }
    })
    window.open(url.toString(), "_blank")
  }

  onValidateParticipantAssignment(assignmentDocId: string, cohortId?: string) {
    let url = this.router.createUrlTree(['/validateParticipantAssignments/'], {
      queryParams: {
        assignmentid: assignmentDocId,
        marathonid: this.selectedMarathon || null,
        cohortid: cohortId || null,
      }
    })
    window.open(url.toString(), "_blank")
  }

  onCohortSearch() {
    this.onFilter();
  }

  onParticipantSearch() {
    if (this.participantSearchQuery && this.participantSearchQuery.trim()) {
      this.cohortsList.forEach(cohort => {
        cohort['contentview'] = 'participants';
      });
    }
    this.onFilter();
  }

  changeOverAllView(view){
    if (view == 'participants') {
      this.contentview = 'participants';
      this.cohortsList.forEach(cohort => {
        cohort['contentview'] = 'participants';
      });
    } else {
      this.contentview = 'activities';
      this.cohortsList.forEach(cohort => {
        cohort['contentview'] = 'activities';
      });
    }
  }

  getFilteredParticipants(cohort : any): string[] {
    const participantList = cohort['participantidlist'] ?? [];
    const cohortName = (cohort['name'] || '').toLowerCase();
    const eventName = this.mapAcceleratorEvent[cohort['eventref']?.id]?.toLowerCase() || '';
    if (!participantList || participantList.length === 0) return [];
    if (!this.participantSearchQuery || !this.participantSearchQuery.trim()) {
      return participantList;
    }
    
    const query = this.participantSearchQuery.toLowerCase().trim();
    const filteredParticipants = participantList.filter(participantId => {
      const name = (this.mapProfile[participantId] || participantId).toLowerCase().trim();
      return name.includes(query);
    });
    if(filteredParticipants.length === 0 && (cohortName.includes(query) || eventName.includes(query))){
      return participantList;
    }
    return filteredParticipants;
  }

  clearCohortSearch() {
    this.cohortSearchQuery = '';
    this.onCohortSearch();
  }

  clearParticipantSearch() {
    this.participantSearchQuery = '';
    this.onParticipantSearch();
  }

  isCohortNameMatch(cohort: any): boolean {
    if (!this.cohortSearchQuery || !this.cohortSearchQuery.trim()) return true;
    
    const searchTerm = this.cohortSearchQuery.toLowerCase().trim();
    const cohortName = (cohort['name'] || '').toLowerCase();
    const eventName = this.mapAcceleratorEvent[cohort['eventref']?.id]?.toLowerCase() || '';
    
    return cohortName.includes(searchTerm) || eventName.includes(searchTerm);
  }

  getMatchingParticipantCount(cohort: any): number {
    if (!this.participantSearchQuery || !this.participantSearchQuery.trim()) {
      return cohort['participantidlist']?.length || 0;
    }
    return this.getFilteredParticipants(cohort['participantidlist'] || []).length;
  }

  getSelectedEventNames(): string {
    if (this.selectedAcceleratorEvent.length === 0) {
      return 'Select Event';
    }
    const names = this.selectedAcceleratorEvent.map(id => this.mapAcceleratorEvent[id]).filter(Boolean);
    if (names.length === 1) {
      return names[0];
    }
    if (names.length > 1) {
      return `${names[0]} +${names.length - 1}`;
    }
    return 'Select Event';
  }

  getSelectedQueueNames(): string {
    if (this.selectedQueueEvent.length === 0) {
      return 'Select Queue';
    }
    const names = this.selectedQueueEvent.map(id => this.mapQueueName[id]).filter(Boolean);
    if (names.length === 1) {
      return names[0];
    }
    if (names.length > 1) {
      return `${names[0]} +${names.length - 1}`;
    }
    return 'Select Queue';
  }

  getSelectedTagNames(): string {
    if (this.selectedTags.length === 0) {
      return 'Tagging';
    }
    if (this.selectedTags.length === 1) {
      return this.getTagName(this.selectedTags[0]);
    }
    return `${this.getTagName(this.selectedTags[0])} +${this.selectedTags.length - 1}`;
  }

  onEditCohort(cohorts: any) {
    this.openCohortDialog('edit', cohorts);
  }

  onCreateCohort() {
    this.openCohortDialog('new', null);
  }

  /**
   * Arrow on card → opens the Cohort Detail screen as a Material dialog.
   * Reuses all already-loaded maps (mapProfile, bigActivityMap, mapMarathon, etc.)
   * so auth and Firestore aren't re-fetched.
   */
  async openCohortStudio(cohorts: any, $event?: Event , viewType ?: string) {
    if ($event) { $event.preventDefault(); $event.stopPropagation(); }
    if (!cohorts) return;

    const queues = this.searchableQueueList.filter((queue)=>{
      const eventId = queue['eventid'];
      console.log(eventId , cohorts['docid'] )
      return eventId?.includes(cohorts['eventref']?.id);
    })
    const { CohortDetailComponent } = await import('../cohort-detail/cohort-detail.component');
    const dialogRef = this.dialog.open(CohortDetailComponent, {
      width: '100vw',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      panelClass: ['cohort-detail-dialog', 'cohort-detail-dialog-fullscreen'],
      hasBackdrop: false,
      autoFocus: false,
      data: {
        viewType : viewType,
        cohort: cohorts,
        cohortId: cohorts['docid'],
        cohortName: cohorts['name'] || '',
        marathonId: this.selectedMarathon || cohorts['marathonref']?.id || null,
        eventId: cohorts['eventref']?.id || null,
        // Pre-loaded maps — passed by reference (no re-fetch)
        mapProfile: this.mapProfile,
        mapParticipantMeta: this.mapParticipantMetaData,
        mapMarathon: this.mapMarathon,
        mapAcceleratorEvent: this.mapAcceleratorEvent,
        bigActivityMap: this.bigActivityMap,
        mapBigAssignment: this.mapBigAssignment,
        mapParticiantsAssignments: this.mapParticiantsAssignments,
        searchableQueueList: queues,
        mapQueueName: this.mapQueueName,

        mapParticipantStudios: this.mapParticipantStudios,
        mapStudioPairing: this.mapStudioPairing,
        mapLiveAssignmentByStudio: this.mapLiveAssignmentByStudio,
        studioPairingList: this.studioPairingList,
        liveAssignmentList: this.liveAssignmentList,
        mapLiveParticipants: this.mapLiveParticipants,
        eventParticipationList: this.eventParticipationList,
      },
    });

    dialogRef.afterClosed().subscribe((result)=>{
      if (result) {
        this.loading = true;
        getDocs(collection(this.firestore, "big cohorts")).then(snap => {
          this.cohortsList = snap.docs.map(e => {
            let element: any = e.data()
            element['contentview'] = 'participants'
            return element
          })
          this.toRunFilterFunctions();
          this.loading = false;
        })
      }
    })

  }

  openCohortDialog(type: string, cohortDoc: any) {
    const dialogRef = this.dialog.open(ManageCohertsComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'cohort-dialog-container',
      data: {
        type: type,
        doc: cohortDoc,
        selectedMarathon: this.mapMarathon[this.selectedMarathon!],
        selectedParticipants: [],
        totalParticipants: this.participantlist || [],
        eventCollectionList: this.filteredAcceleratorEventList,
        mapEventCollection: this.mapAcceleratorEvent,
        participantTagsList: this.participantTagsList,
        loggedInProfile: this.loggedInProfile,
        queueList : this.searchableQueueList,
      },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loading = true;
        getDocs(collection(this.firestore, "big cohorts")).then(snap => {
          this.cohortsList = snap.docs.map(e => {
            let element: any = e.data()
            element['contentview'] = 'activities'
            return element
          })
          this.toRunFilterFunctions();
          this.loading = false;
        })
      }
    });
  }

  getUnassignedCount(): number {
    if (this.unassignedParticipants.length > 0) return this.unassignedParticipants.length;
    // Live fallback: count big invitations whose participant isn't in any cohort.
    const assigned = new Set<string>();
    (this.cohortsList || []).forEach((c: any) => {
      (c.participantidlist || []).forEach((id: string) => assigned.add(id));
    });
    let count = 0;
    (this.bigInvitationList || []).forEach((inv: any) => {
      const pid = inv['participantid'] || inv['profileid'];
      if (pid && !assigned.has(pid)) count++;
    });
    return count;
  }

  getStatusFilterLabel(): string {
    switch (this.statusFilter) {
      case 'active': return 'Active/Non Active';
      case 'nonactive': return 'Non Active/Active';
      default: return 'All/Active/Non Active';
    }
  }

  getCategoryFilterLabel(): string {
    switch (this.categoryFilter) {
      case 'studio': return 'Studio Group/Readiness/Educational/Operational';
      case 'readiness': return 'Readiness/Studio Group/Educational/Operational';
      case 'educational': return 'Educational/Studio Group/Readiness/Operational';
      case 'operational': return 'Operational/Studio Group/Educational/Readiness';
      default: return 'All/Readiness/Studio Group';
    }
  }

  getTypeFilterLabel(): string {
    switch (this.typeFilter) {
      case 'general': return 'General/Event';
      case 'event': return 'Event/General';
      default: return 'All/General/Event';
    }
  }

  getActivitiesCount(cohortId: string): number {
    const assignments = this.mapParticiantsAssignments[cohortId];
    if (!assignments) return 0;
    return Object.keys(assignments).length;
  }

  // Temporary cohort date display methods
  getTemporaryCohortDateDisplay(cohort: any): string {
    if (!cohort['isTemporary']) return '';
    
    const startDate = cohort['startDate']?.toDate ? cohort['startDate'].toDate() : (cohort['startDate'] ? new Date(cohort['startDate']) : null);
    const endDate = cohort['endDate']?.toDate ? cohort['endDate'].toDate() : (cohort['endDate'] ? new Date(cohort['endDate']) : null);
    
    if (!startDate && !endDate) return '';
    
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    
    if (this.isEndsToday(endDate)) {
      return 'Ends Today';
    }
    
    if (startDate && endDate) {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } else if (endDate) {
      return `Ends ${formatDate(endDate)}`;
    } else if (startDate) {
      return `From ${formatDate(startDate)}`;
    }
    
    return '';
  }

  isEndsToday(endDate: any): boolean {
    if (!endDate) return false;
    const end = endDate instanceof Date ? endDate : (endDate?.toDate ? endDate.toDate() : new Date(endDate));
    const today = new Date();
    return end.getDate() === today.getDate() && 
           end.getMonth() === today.getMonth() && 
           end.getFullYear() === today.getFullYear();
  }

  isTemporaryCohortEndsToday(cohort: any): boolean {
    if (!cohort['isTemporary']) return false;
    const endDate = cohort['endDate']?.toDate ? cohort['endDate'].toDate() : (cohort['endDate'] ? new Date(cohort['endDate']) : null);
    return this.isEndsToday(endDate);
  }

  // Get cohort created date formatted
  getCohortCreatedDate(cohort: any): string {
    const createdDate = cohort['createddate']?.toDate ? cohort['createddate'].toDate() : (cohort['createddate'] ? new Date(cohort['createddate']) : null);
    if (!createdDate) return '';
    return createdDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Cohort sorting - simplified to date and name only
  sortBy: 'date' | 'name' = 'date';
  sortOrder: 'asc' | 'desc' = 'desc';

  setSorting(sortBy: 'date' | 'name') {
    if (this.sortBy === sortBy) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = sortBy;
      this.sortOrder = sortBy === 'name' ? 'asc' : 'desc';
    }
    this.applySorting();
  }

  toggleSortOrder() {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this.applySorting();
  }

  applySorting() {
    this.filteredCohortsList.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'name':
          comparison = (a['name'] || '').localeCompare(b['name'] || '');
          break;
        case 'date':
          const dateA = a['createddate']?.toDate ? a['createddate'].toDate() : new Date(a['createddate'] || 0);
          const dateB = b['createddate']?.toDate ? b['createddate'].toDate() : new Date(b['createddate'] || 0);
          comparison = dateA.getTime() - dateB.getTime();
          break;
      }
      
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });
    
    this.applyGrouping();
  }

  exportCohortsData() {
    const exportData: any[] = [];

    this.filteredCohortsList.forEach(cohort => {
      const participants = cohort['participantidlist'] || [];
      const queueId = cohort['queueref']?.id;

      if (participants.length === 0) {
        exportData.push({
          'Cohort Name': cohort['name'] || '',
          'Status': cohort['status'] || 'active',
          'Category': cohort['cohortCategory'] || 'studio',
          'Type': cohort['cohortType'] || 'general',
          'Level': this.getLevelLabel(cohort['level'] || 'level1'),
          'Event': this.getCohortEventName(cohort) || 'N/A',
          'Marathon': this.mapMarathon[cohort['marathonref']?.id]?.['title'] || '',
          'Total Participants': participants.length,
          'Participant Name': '',
          'Participant Status': '',
          'Studios In': '',
          'Checked In': '',
          'Live Assignments': '',
          'Completed Assignments': '',
          'Is Temporary': cohort['isTemporary'] ? 'Yes' : 'No',
          'Created Date': cohort['createddate']?.toDate ? cohort['createddate'].toDate().toLocaleDateString() : ''
        });
      } else {
        participants.forEach((participantId: string, index: number) => {
          const studioInList = this.getParticipantStudioInList(queueId,participantId);
          const checkedInCount = this.getParticipantCheckedInCount(queueId , participantId);
          const liveAssignmentStats = this.getParticipantLiveAssignmentStats(participantId);
          
          exportData.push({
            'Cohort Name': index === 0 ? cohort['name'] || '' : '',
            'Status': index === 0 ? cohort['status'] || 'active' : '',
            'Category': index === 0 ? cohort['cohortCategory'] || 'studio' : '',
            'Type': index === 0 ? cohort['cohortType'] || 'general' : '',
            'Level': index === 0 ? this.getLevelLabel(cohort['level'] || 'level1') : '',
            'Event': index === 0 ? this.getCohortEventName(cohort) || 'N/A' : '',
            'Marathon': index === 0 ? this.mapMarathon[cohort['marathonref']?.id]?.['title'] || '' : '',
            'Total Participants': index === 0 ? participants.length : '',
            'Participant Name': this.mapProfile[participantId] || participantId,
            'Participant Status': this.isParticipantInStudio(queueId , participantId) ? 'In Studio' : 'Idle',
            'Studios In': studioInList.length,
            'Checked In': checkedInCount.length,
            'Live Assignments': liveAssignmentStats.live,
            'Completed Assignments': liveAssignmentStats.completed,
            'Is Temporary': index === 0 ? (cohort['isTemporary'] ? 'Yes' : 'No') : '',
            'Created Date': index === 0 ? (cohort['createddate']?.toDate ? cohort['createddate'].toDate().toLocaleDateString() : '') : ''
          });
        });
      }
    });

    // ==== Activities sheet ====
    const activitiesData: any[] = [];
    this.filteredCohortsList.forEach(cohort => {
      const assignments = this.mapParticiantsAssignments[cohort['docid']] || {};
      const keys = Object.keys(assignments);
      if (keys.length === 0) {
        activitiesData.push({
          'Cohort Name': cohort['name'] || '',
          'Activity Title': '(no activities)',
          'Mode': '',
          'Created Date': '',
          'Total Assigned': 0,
          'Ongoing': 0,
          'Completed': 0,
          'Has Zoom': '',
          'Activity ID': ''
        });
      } else {
        keys.forEach((assignmentId, idx) => {
          const meta = this.mapBigAssignment[assignmentId];
          const total = (assignments[assignmentId] || []).length;
          const ongoing = this.mapOngoingAssignments[assignmentId]?.length || 0;
          const completed = this.mapCompletedAssignments[assignmentId]?.length || 0;
          activitiesData.push({
            'Cohort Name': idx === 0 ? (cohort['name'] || '') : '',
            'Activity Title': meta?.['title'] || '(deleted)',
            'Mode': meta?.['selectionMode'] ? String(meta['selectionMode']).toUpperCase() : '',
            'Created Date': meta?.['createddate']?.toDate ? meta['createddate'].toDate().toLocaleString() : '',
            'Total Assigned': total,
            'Ongoing': ongoing,
            'Completed': completed,
            'Has Zoom': meta?.['zoomdata']?.['start_url'] ? 'Yes' : 'No',
            'Activity ID': assignmentId
          });
        });
      }
    });

    const totalParticipantsWithStudio = Object.values(this.mapLiveParticipants).map(Object.keys);
    const nonDuplicates = new Set()
    totalParticipantsWithStudio.forEach((id)=>{
      nonDuplicates.add(id)
    })
    const summaryData = [
      { 'Metric': 'Total Cohorts', 'Value': this.filteredCohortsList.length },
      { 'Metric': 'Total Participants', 'Value': this.totalParticipantsInCohorts.length },
      { 'Metric': 'Total Activities', 'Value': activitiesData.filter(a => a['Activity Title'] !== '(no activities)').length },
      { 'Metric': 'Active Cohorts', 'Value': this.filteredCohortsList.filter(c => c['status'] !== 'nonactive').length },
      { 'Metric': 'Non-Active Cohorts', 'Value': this.filteredCohortsList.filter(c => c['status'] === 'nonactive').length },
      { 'Metric': 'Studio Groups', 'Value': this.filteredCohortsList.filter(c => c['cohortCategory'] !== 'readiness').length },
      { 'Metric': 'Readiness Groups', 'Value': this.filteredCohortsList.filter(c => c['cohortCategory'] === 'readiness').length },
      { 'Metric': 'Event Cohorts', 'Value': this.filteredCohortsList.filter(c => c['eventref']).length },
      { 'Metric': 'General Cohorts', 'Value': this.filteredCohortsList.filter(c => !c['eventref']).length },
      { 'Metric': 'Temporary Cohorts', 'Value': this.filteredCohortsList.filter(c => c['isTemporary']).length },
      { 'Metric': 'Participants In Studio', 'Value': nonDuplicates.size },
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
    ];

    this.downloadExcel(exportData, summaryData, activitiesData);
  }

  downloadExcel(cohortsData: any[], summaryData: any[], activitiesData: any[] = []) {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(cohortsData);

      ws1['!cols'] = [
        { wch: 25 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
        { wch: 25 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 16 },
        { wch: 20 },
        { wch: 12 },
        { wch: 15 }
      ];

      XLSX.utils.book_append_sheet(wb, ws1, 'Cohorts & Participants');

      if (activitiesData && activitiesData.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(activitiesData);
        ws3['!cols'] = [
          { wch: 25 },
          { wch: 30 },
          { wch: 12 },
          { wch: 22 },
          { wch: 14 },
          { wch: 10 },
          { wch: 12 },
          { wch: 10 },
          { wch: 28 }
        ];
        XLSX.utils.book_append_sheet(wb, ws3, 'Activities');
      }

      const ws2 = XLSX.utils.json_to_sheet(summaryData);
      ws2['!cols'] = [
        { wch: 25 },
        { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

      const date = new Date();
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const filename = `BIG_Cohorts_Export_${dateStr}.xlsx`;

      XLSX.writeFile(wb, filename);
    }).catch(err => {
      console.error('Error loading xlsx library:', err);
      this.downloadCSV(cohortsData);
    });
  }

  downloadCSV(data: any[]) {
    if (data.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header]?.toString() || '';
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    link.setAttribute('href', url);
    link.setAttribute('download', `BIG_Cohorts_Export_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  openProgressionReport() {
    this.showProgressionDialog = true;
    this.progressionLoading = true;
    this.progressionSearchQuery = '';
    this.loadProgressionData();
  }

  closeProgressionDialog() {
    this.showProgressionDialog = false;
    this.progressionData = [];
    this.groupedProgressionData = {};
    this.filteredProgressionProfiles = [];
    this.progressionSearchQuery = '';
  }

  loadProgressionData() {
    getDocs(query(collection(this.firestore, "big cohorts log"), orderBy("createddate", "desc"))).then(snap => {
      this.progressionData = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      
      this.groupedProgressionData = {};
      this.progressionData.forEach(log => {
        const profileId = log['participantid'] || log['profileid'];
        if (profileId) {
          if (!this.groupedProgressionData[profileId]) {
            this.groupedProgressionData[profileId] = [];
          }
          this.groupedProgressionData[profileId].push(log);
        }
      });
      
      Object.keys(this.groupedProgressionData).forEach(profileId => {
        this.groupedProgressionData[profileId].sort((a, b) => {
          const dateA = a['createddate']?.toDate ? a['createddate'].toDate() : new Date(a['createddate']);
          const dateB = b['createddate']?.toDate ? b['createddate'].toDate() : new Date(b['createddate']);
          return dateA.getTime() - dateB.getTime();
        });
      });
      
      this.filteredProgressionProfiles = Object.keys(this.groupedProgressionData);
      this.progressionLoading = false;
    }).catch(err => {
      console.error('Error loading progression data:', err);
      this.progressionLoading = false;
    });
  }

  onProgressionSearch() {
    const query = this.progressionSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredProgressionProfiles = Object.keys(this.groupedProgressionData);
    } else {
      this.filteredProgressionProfiles = Object.keys(this.groupedProgressionData).filter(profileId => {
        const name = (this.mapProfile[profileId] || profileId).toLowerCase();
        return name.includes(query);
      });
    }
  }

  getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'added':
      case 'created':
        return '#27ae60';
      case 'moved':
        return '#3498db';
      case 'removed':
      case 'deleted':
        return '#e74c3c';
      case 'updated':
        return '#f39c12';
      default:
        return '#95a5a6';
    }
  }

  getStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'added':
      case 'created':
        return 'add_circle';
      case 'moved':
        return 'swap_horiz';
      case 'removed':
      case 'deleted':
        return 'remove_circle';
      case 'updated':
        return 'edit';
      default:
        return 'info';
    }
  }

  formatTimelineDate(date: any): string {
    if (!date) return 'Unknown';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async deleteCohort(cohort){
    const check = confirm('Are you sure do you want to delet this cohort?');
    if(check){
     await deleteDoc(doc(this.firestore, 'big cohorts',cohort.docid)).then(()=>{
        console.log('Cohort Deleted Successfully');
        this.authguard.openSnackBar('Cohort Deleted Successfully','ok',600);
      }).catch((error)=>{
        console.log('Error while Deleting',error);
        this.authguard.openSnackBar('Error while Deleting','ok',600);
      });
    }else{
      console.log('Not Deleted');
    }
  }

  saveZoneSelection() {
    try {
      localStorage.setItem(this.STORAGE_KEY_ZONE, JSON.stringify(this.selectedZoneEvent));
    } catch (e) {
      console.error('Error saving zone selection:', e);
    }
  }

  patchSavedZoneSelections() {
    if (this.selectedZoneEvent.length > 0) {
      this.selectedZoneEvent = this.selectedZoneEvent.filter(id =>
        this.zoneEventEventList.some(z => z.ref?.id === id || z.docid === id)
      );
      if (this.selectedZoneEvent.length > 0) {
        this.updateZoneMappedCohortIds();
        this.onFilter();
      }
    }
  }

  updateZoneMappedCohortIds() {
    this.zoneMappedCohortIds = new Set<string>();
    this.selectedZoneEvent.forEach(zoneId => {
      const zone = this.mapZoneData[zoneId];
      if (zone && Array.isArray(zone['cohorts'])) {
        zone['cohorts'].forEach((cid: string) => {
          if (cid) this.zoneMappedCohortIds.add(cid);
        });
      }
    });
  }

  onZoneSearch() {
    const query = this.zoneSearchQuery.toLowerCase().trim();
    if (!query) {
      this.searchableZoneEventList = [...this.zoneEventEventList];
    } else {
      this.searchableZoneEventList = this.zoneEventEventList.filter(z =>
        (z['name'] || '').toLowerCase().includes(query)
      );
    }
  }

  toggleZoneSelection() {
    this.saveZoneSelection();
    this.updateZoneMappedCohortIds();
    this.onFilter();
  }

  clearZoneSelection() {
    this.selectedZoneEvent = [];
    this.zoneSearchQuery = '';
    this.searchableZoneEventList = [...this.zoneEventEventList];
    this.saveZoneSelection();
    this.updateZoneMappedCohortIds();
    this.onFilter();
  }

  onZoneDropdownOpen() {
    this.zoneSearchQuery = '';
    this.searchableZoneEventList = [...this.zoneEventEventList];
  }

  getSelectedZoneNames(): string {
    if (this.selectedZoneEvent.length === 0) {
      return 'Select Zone';
    }
    const names = this.selectedZoneEvent
      .map(id => this.mapZoneData[id]?.['name'] || this.mapZoneEvent[id])
      .filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length > 1) return `${names[0]} +${names.length - 1}`;
    return 'Select Zone';
  }

  getAvatar(name : string){
    if ([null , undefined , ''].includes(name)) {
      return ''
    }
    if(name.length < 2){
      return name
    } else {
      return name.slice(0,2)
    }
  }

  filterUnassignSearch(){
    const query = this.unassignSearch.toLowerCase().trim();
    if (!query) {
      this.filterUnassignParticipants = [...this.unassignedParticipants];
    } else {
      this.filterUnassignParticipants = this.unassignedParticipants.filter(p => {
        const name = (p.name || '').toLowerCase();
        const eventName = (p.eventName || '').toLowerCase();
        return name.includes(query) || eventName.includes(query);
      });
    }
  }

  loadProgressionDataLog(){
    try {
      this.progressionLoading = true;
      const q = query(collection(this.firestore, "big cohorts log"), orderBy("createddate", "desc"));
      if (this.progressionSubscription) {
        this.progressionSubscription.unsubscribe();
      }

      this.progressionSubscription = collectionData(q).subscribe((log)=>{
        this.progressionData = log;
        this.filterActivityLog()
        if (this.progressionLoading) {
          this.progressionLoading = false
        }
      })
    } catch (error) {
      console.log(error)
    }
  }

  filterProgressData(){
    let data = [...this.progressionData];

    if (this.selectedAcceleratorEvent.length > 0) {
      data = data.filter((log)=>{
        const eventId = log['eventref']?.id;
        return this.selectedAcceleratorEvent.includes(eventId);
      })
    }
    this.filteredProgressionProfiles = data;
  }

  toggleUnassignedSelectMode(){
    this.selectedUnassignParticipants = this.selectedUnassignParticipants? null : new Set();
  }  

  selectAllUnassignedParticipants(){
    for(let {participantId} of this.filterUnassignParticipants){
      this.selectedUnassignParticipants.add(participantId)
    }
  }

  getCohortsForUnassign(){
    return this.filteredCohortsList.filter((cohorts)=>cohorts?.name?.toLowerCase()?.trim()?.includes(this.unassignCohortSearchQuery.toLowerCase().trim()))
  }
  onUnassignCohortSearch(){
    
  }

  isUnassignedParticipantChecked(pid){
    return this.selectedUnassignParticipants?.has(pid);
  }

  toggleUnassignChecked(pid , event : Event){
    event.stopPropagation();
    if (this.selectedUnassignParticipants.has(pid)) {
      this.selectedUnassignParticipants.delete(pid)
    } else{
      this.selectedUnassignParticipants.add(pid)
    }
  }

  unassignToCohort(cohort : any){
    const eventId = cohort['eventref']?.id;
    const participants = Array.from(this.selectedUnassignParticipants.values())
    const check = this.unassignedParticipants.filter((unassign)=>this.selectedUnassignParticipants.has(unassign?.participantId)).every((unassign)=>unassign['eventref']?.id === eventId);

    if (!check) {
      alert('Selected Participants does not belong to same Event');
    } else {
      const confirmCheck = confirm(`Do you want to move participants to  ${cohort.name}`)
      if (confirmCheck) {
        this.assignUnassignedToCohort(participants , cohort);
      }
    }
    this.selectedUnassignParticipants.clear()
  }

  filterActivityLog(){
    const keys = Object.keys(this.activityLogFilters);
    const logs = [...this.progressionData];
    const filteredLogs = [];
  
      for (let log of logs) {
        let filterPassed = true;
        if (this.selectedAcceleratorEvent.length > 0) {
          const eventId = log['eventref']?.id;
          if (!this.selectedAcceleratorEvent.includes(eventId)) {
            filterPassed = false;
          }
        }

        keys.forEach((type) => {
          if (type === 'search') {
            const participant =
              (
                this.mapProfile[log['profileid']] ||
                this.mapProfile[log['participantid']]
              )
                ?.toLowerCase()
                ?.trim() ?? '';
            const search = this.activityLogFilters[type]?.toLowerCase()?.trim();
            if (
              ![null, undefined, ''].includes(search) &&
              !participant.includes(search)
            ) {
              filterPassed = false;
            }
          } else if(type === 'assigntome' && this.activityLogFilters[type]){
            const logedBy = log['addedby'] || log['removedby'] || '';
            if (logedBy !== (this.loggedInProfile?.profileid || this.loggedInProfile?.uid) ) {
              filterPassed = false;
            }
          }
        });

        if (filterPassed) {
          filteredLogs.push(log);
        }
      }

      this.filteredProgressionProfiles = filteredLogs; 
  }

  toggleLogedToMe(event: Event) {
    event.stopPropagation();
    this.activityLogFilters['assigntome'] = !this.activityLogFilters['assigntome'];
    this.filterActivityLog()
  }

  // Fetch UIDs from profile_data collection for given profile IDs
  async getUidsFromProfileIds(profileIds: string[]): Promise<string[]> {
    if (!profileIds || profileIds.length === 0) return [];

    const uids: string[] = [];

    // Process in batches of 10 (Firestore 'in' query limit)
    const batchSize = 10;
    for (let i = 0; i < profileIds.length; i += batchSize) {
      const batch = profileIds.slice(i, i + batchSize);

      try {
        const profileQuery = query(
          collection(this.firestore, "profile_data"),
          where("profileid", "in", batch)
        );

        const profileSnap = await getDocs(profileQuery);

        profileSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          // Get uid from user_ref (DocumentReference) or directly from uid field
          if (data['user_ref']) {
            // user_ref is a DocumentReference, extract the id (uid)
            const uid = data['user_ref'].id || data['user_ref'];
            if (uid) uids.push(uid);
          } else if (data['uid']) {
            uids.push(data['uid']);
          }
        });
      } catch (error) {
        console.error('Error fetching profile UIDs for batch:', batch, error);
      }
    }

    console.log('Converted', profileIds.length, 'profile IDs to', uids.length, 'UIDs');
    return uids;
  }

  // chat config

  onChatToggle(cohort: any, event: MatCheckboxChange): void {
      cohort.selected = event.checked;
  }

  chatModelClose(result){
    this.chatModelRef.close(result);
  }

}

