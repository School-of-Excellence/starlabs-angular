import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { collection, collectionData, Firestore, query, doc, updateDoc, or, serverTimestamp, setDoc, writeBatch, getDocs } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { orderBy, where } from 'firebase/firestore';
import { Subject, take, takeUntil } from 'rxjs';
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { UpdateZoneDetailComponent } from '../update-zone-detail/update-zone-detail.component';
import { AuthguardService } from '../../authguard.service';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ResolveParticipantZoneComponent } from '../resolve-participant-zone/resolve-participant-zone.component';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import * as XLSX from 'xlsx';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import { CohortParticipantsDialogComponent } from '../cohort-participants-dialog/cohort-participants-dialog.component';

@Component({
  selector: 'app-event-zone-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    ProfilePictureComponent
  ],
  templateUrl: './event-zone-management.component.html',
  styleUrl: './event-zone-management.component.css'
})
export class EventZoneManagementComponent implements OnDestroy {
  
  // Event Collection
  eventList: any[] = []
  selectedEvent: any = null

  // Event Zones
  eventZoneList: any[] = []
  mapEventZoneData: { [key: string]: any } = {}

  // Event Cohorts — bucketed dynamically by cohortCategory value
  cohortListByCategory: { [key: string]: any[] } = {}
  mapCohortsData: { [key: string]: any } = {}

  get cohortCategories(): string[] {
    return Object.keys(this.cohortListByCategory).sort()
  }

  get allCohorts(): any[] {
    return Object.values(this.cohortListByCategory).flat()
  }
  
  // Manage Participants
  mapCohortParticipants: { [key: string]: string[] } = {}
  mapProfile = {}
  mapProfileData = {}
  mapProfileEmail: { [key: string]: string } = {}

  // Bulk Assign cohorts
  selectedCohortIds: Set<string> = new Set()

  /**
   * Search term for filtering available cohorts
   */
  searchTerm: string = ''

  // Current filter: 'all', 'operational', or 'educational'
  cohortFilter: string = 'all'

  //managing subscriptions
  private destroy$ = new Subject<void>()

  // Co-ordinator & Mentors
  teamMemberProfilelist = []

  loggedInProfileID = null

  // View Participant Zone Overlay
  showParticipantZoneOverlay: boolean = false
  participantZoneList: any[] = []
  participantZoneSearchTerm: string = ''
  isLoadingParticipantZones: boolean = false

  // Drift detection — reminds the user to click "Update Participant Zone" when
  // the current zone/cohort layout no longer matches the submitted participant
  // zone records. `storedParticipantZones` is the last-submitted { profileid ->
  // selectedZoneId } snapshot, loaded once per event and refreshed on submit.
  storedParticipantZones: { [profileId: string]: string } = {}
  storedZonesLoaded: boolean = false
  needsSubmission: boolean = false
  driftCount: number = 0

  constructor(
    public firestore: Firestore,
    public dialog: MatDialog,
    public authguard: AuthguardService,
    public cdr: ChangeDetectorRef,
  ) {
    // this.authguard.getRoles().then(value =>{
    //   console.log("Loggedin Profile", value)
    //   this.loggedInProfileID = value["profileid"]
    // })
    this.loadInitialData()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  loadInitialData(): void {
    // Load Logged Profile
    this.authguard.getRoles().then(role =>{
      console.log("Logged In ", role)
      this.loggedInProfileID = role["profile_ref"].id
    })

    // Load Profile Map
    this.authguard.getProfileMap().then(list =>{
      this.mapProfile = list["map"]
      this.mapProfileData = list['docdata']
      this.mapProfileEmail = list["emailMap"] || {}
    })

    // Event Collection
    const eventCollection = collection(this.firestore, "event collection")
    const eventQuery = query(eventCollection, orderBy("end_date", "desc"))
    
    collectionData(eventQuery, { idField: "docid" }).pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {
      this.eventList = data
    })

    // User Roles
    const userCollection = collection(this.firestore, "users_roles")
    const userQuery = query(userCollection, or(where("admin", "==", true), where("mentor", "==", true), where("eis", "==", true), where("changeagent", "==", true), where("developer", "==", true)))
    
    collectionData(userQuery, { idField: "docid" }).pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {
      var userList = []
      data.forEach(element =>{
        userList.push({
          name: element["name"],
          profileid: element["profile_ref"].id
        })
      })
      this.teamMemberProfilelist = userList
      this.teamMemberProfilelist.sort((a, b) => a["name"].localeCompare(b["name"]))
    })
  }

  onEventSelect(): void {

    console.log("Selected Event", this.selectedEvent)

    // Reset previous data
    this.eventZoneList = []
    this.mapEventZoneData = {}
    this.cohortListByCategory = {}
    this.mapCohortsData = {}
    this.mapCohortParticipants = {}
    this.selectedCohortIds.clear()
    this.participantZoneList = []
    this.showParticipantZoneOverlay = false

    // Reset drift state and load the last-submitted participant zone snapshot
    this.storedParticipantZones = {}
    this.storedZonesLoaded = false
    this.needsSubmission = false
    this.driftCount = 0
    this.loadStoredParticipantZones()

    // Create reference to selected event document
    const eventRef = doc(this.firestore, "event collection", this.selectedEvent["docid"])

    // ===== LOAD ZONES =====
    const zoneCollection = collection(this.firestore, "event zones")
    const zoneQuery = query(zoneCollection, where("eventref", "==", eventRef))
    
    collectionData(zoneQuery, { idField: "docid" }).pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {

      var id = []
      data.forEach(d =>{
        if (Array.isArray(d["cohorts"])) {
          id = [...id, ...d["cohorts"]]
        }
      })
      console.log("******", id.sort((a, b) => a.localeCompare(b)))

      console.log("Event Zone", data.length)

      this.eventZoneList = data
      // Sort zones alphabetically by name
      this.eventZoneList.sort((a, b) => a["zonename"].localeCompare(b["zonename"]))
      
      // Build map for quick lookup
      data.forEach(zone => {
        this.mapEventZoneData[zone["docid"]] = zone
      })
      
      // Calculate statistics after zones are loaded
      this.calculateAllStats()
    })

    // ===== LOAD COHORTS =====
    const cohortCollection = collection(this.firestore, "big cohorts")
    const cohortQuery = query(cohortCollection, where("eventref", "==", eventRef))
    
    collectionData(cohortQuery, { idField: "docid" }).pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {

      console.log("****", data.map(e => e["docid"]).sort((a, b) => a.localeCompare(b)))

      // Sort cohorts alphabetically
      data.sort((a, b) => a["name"].localeCompare(b["name"]))
      
      // Reset cohort lists (categories are discovered dynamically from the data)
      const cohortListByCategory: { [key: string]: any[] } = {}

      // Process each cohort
      data.forEach(cohort => {
        // Store participant list for quick lookup
        this.mapCohortParticipants[cohort["docid"]] = cohort["participantidlist"] || []

        // Store cohort data
        this.mapCohortsData[cohort["docid"]] = cohort

        // Categorize cohorts dynamically by whatever cohortCategory value is present
        const category = cohort["cohortCategory"]
        if (!category) return;
        (cohortListByCategory[category] ||= []).push(cohort)
      })

      this.cohortListByCategory = cohortListByCategory
      
      // Recalculate statistics after cohorts are loaded
      this.calculateAllStats()
    })
  }

  /* PERFOMANCE OPTIMIZATION
   * Pre-calculates all statistics for zones and stores them as properties
   * This is called:
   * - After zones are loaded
   * - After cohorts are loaded
   * - After cohort assignment/removal
   * 
   * WHY PRE-CALCULATE?
   * - Avoids function calls in template (which run on every change detection)
   * - Calculates once, use many times
   * - Much better performance with multiple zones
   * 
   * WHAT IT CALCULATES FOR EACH ZONE:
   * - _assignedCohorts: Full cohort objects (not just IDs)
   */
  calculateAllStats(): void {
    this.eventZoneList.forEach(zone => {
      const cohortIds = zone['cohorts'] || []
      
      // Use Set to track unique participant IDs (prevents counting same person twice)
      const participantIds = new Set<string>()
      const cohortDetails: any[] = []
      
      // Loop through each cohort assigned to this zone
      cohortIds.forEach((cohortId: string) => {
        const cohort = this.mapCohortsData[cohortId]
        
        if (cohort) {
          // Store full cohort object
          cohortDetails.push(cohort)
          
          // Add all participants from this cohort to the set
          const participants = cohort['participantidlist'] || []
          participants.forEach((pid: string) => participantIds.add(pid))
        }
      })
      
      // Attach calculated properties to zone object
      // These can be accessed directly in template without function calls
      zone['_participantlist'] = participantIds
      zone['_assignedCohorts'] = cohortDetails
    })
    // Re-check whether the current layout drifted from the submitted state
    this.evaluateDriftStatus()
    this.cdr.detectChanges()
  }

  // ============================================================================
  // DRIFT DETECTION ("Update Participant Zone" reminder)
  // ============================================================================

  /**
   * Load the last-submitted participant zone snapshot for the selected event —
   * a silent read (no loading dialog) used as the "actual" side of drift
   * detection. Caches { profileid -> selectedZoneId } and re-evaluates drift.
   */
  private async loadStoredParticipantZones(): Promise<void> {
    try {
      const eventRef = doc(this.firestore, "event collection", this.selectedEvent["docid"])
      const participantZonesCollection = collection(this.firestore, "event participant zones")
      const participantZonesQuery = query(participantZonesCollection, where("eventref", "==", eventRef))

      const record = await getDocs(participantZonesQuery)
      const map: { [profileId: string]: string } = {}
      record.docs.forEach(d => {
        const data = d.data()
        map[data["profileid"]] = data["selectedzone"]
      })

      this.storedParticipantZones = map
      this.storedZonesLoaded = true
      this.evaluateDriftStatus()
    } catch (error) {
      console.error("Error loading stored participant zones:", error)
    }
  }

  /**
   * Compare the current zone/cohort layout against the last-submitted snapshot
   * and set `needsSubmission` / `driftCount`.
   *
   * Scope: only MAPPED participants' selectedzone correctness is considered.
   * Orphaned docs of now-unmapped participants are intentionally ignored — the
   * submit flow never deletes, so flagging them would make the reminder
   * impossible to clear. Eligibility metadata is not compared; only the zone.
   */
  private evaluateDriftStatus(): void {
    // Wait until the submitted snapshot has loaded to avoid a false reminder
    if (!this.storedZonesLoaded) return

    const stored = this.storedParticipantZones
    const analysis = this.analyzeParticipantAssignments(stored)
    let count = 0

    // Assigned to exactly one zone -> stored zone must match that zone
    analysis.assigned.forEach((p: any) => {
      if (stored[p.participantId] !== p.zoneId) count++ // undefined (new) or wrong zone
    })

    // Eligible for multiple zones -> in sync only if a stored choice still valid
    analysis.conflicts.forEach((p: any) => {
      const chosen = stored[p.participantId]
      if (!chosen || !(p.eligibleZones || []).includes(chosen)) count++
    })

    // Unassigned (eligible for no zone) is ignored — orphan scope-out

    this.driftCount = count
    this.needsSubmission = count > 0
  }

  // ============================================================================
  // *ngFor trackBy — reuse DOM by stable key so the cohort/zone lists don't
  // rebuild (and flicker) on every change-detection cycle
  // ============================================================================

  trackByZoneId(index: number, zone: any): string {
    return zone['docid']
  }

  trackByCohortId(index: number, cohort: any): string {
    return cohort['docid']
  }

  trackByCategory(index: number, group: any): string {
    return group.category
  }

  // ============================================================================
  // ZONE HEADER COUNT
  // ============================================================================

  get zonesCreated(): number {
    return this.eventZoneList.length
  }

  // Total number of unique cohorts that are assigned to at least one zone
  get cohortsAssigned(): number {
    const assignedCohortIds = new Set<string>()
    
    this.eventZoneList.forEach(zone => {
      const cohorts = zone['cohorts'] || []
      cohorts.forEach((cohortId: string) => assignedCohortIds.add(cohortId))
    })
    
    return assignedCohortIds.size
  }

  // Total number of cohorts that haven't been assigned to any zone yet
  get unassignedCohortsCount(): number {
    return this.allCohorts.length - this.cohortsAssigned
  }

  // Number of unique participants who are assigned to at least one zone
  get participantsMapped(): number {
    const mappedParticipantIds = new Set<string>()
    
    this.eventZoneList.forEach(zone => {
      const cohorts = zone['cohorts'] || []
      cohorts.forEach((cohortId: string) => {
        const participants = this.mapCohortParticipants[cohortId] || []
        participants.forEach(pid => mappedParticipantIds.add(pid))
      })
    })
    
    return mappedParticipantIds.size
  }

  // Open the read-only "Unassigned Participants" dialog listing everyone who is
  // in a cohort but NOT in any zone yet (i.e. the unmapped participants — the
  // difference behind the "Mapped" stat). Reuses the exact same analysis and
  // dialog as the submit flow; no extra Firestore read is needed since the
  // unassigned bucket is derived entirely from in-memory cohort/zone data.
  // True when every participant across all cohorts is mapped to a zone. Drives
  // the green "success" styling on the Mapped stat and makes it non-interactive.
  get isAllMapped(): boolean {
    return this.totalParticipants > 0 && this.participantsMapped >= this.totalParticipants
  }

  // Open the read-only "Unassigned Participants" dialog listing everyone who is
  // in a cohort but NOT in any zone yet (the unmapped participants behind the
  // "Mapped" stat). When all are mapped, the click is a no-op (no alert).
  openUnmappedParticipants(){
    // Log the mapped participant names grouped by zone (debugging aid)
    const mappedParticipantIds = {}
    this.eventZoneList.forEach(zone => {
      const cohorts = zone['cohorts'] || []
      cohorts.forEach((cohortId: string) => {
        const participants = this.mapCohortParticipants[cohortId] || []
        participants.forEach(pid => {
          mappedParticipantIds[zone["zonename"]] = mappedParticipantIds[zone["zonename"]] || []
          mappedParticipantIds[zone["zonename"]].push(this.mapProfile[pid])
        })
        mappedParticipantIds[zone["zonename"]] = Array.from(new Set(mappedParticipantIds[zone["zonename"]]))
      })
    })
    console.log(mappedParticipantIds)

    if (this.isAllMapped) {
      return
    }

    const analysis = this.analyzeParticipantAssignments()

    if (analysis.unassigned.length === 0) {
      return
    }

    this.showUnassignedDialog(analysis.unassigned)
  }

  // Total number of unique participants across all cohorts
  get totalParticipants(): number {
    const allParticipantIds = new Set<string>()

    this.allCohorts.forEach(cohort => {
      const participants = cohort['participantidlist'] || []
      participants.forEach(pid => allParticipantIds.add(pid))
    })

    return allParticipantIds.size
  }

  // ============================================================================
  // COHORT FILTERING AND SELECTION
  // ============================================================================

  // UnAssigned Cohorts List - Available List
  getUnassignedCohorts(): any[] {
    // Build set of all assigned cohort IDs
    const assignedCohortIds = new Set<string>()
    this.eventZoneList.forEach(zone => {
      const cohorts = zone['cohorts'] || []
      cohorts.forEach((cohortId: string) => assignedCohortIds.add(cohortId))
    })
    
    // Get all cohorts based on filter ('all' or any dynamic category key)
    const cohorts: any[] = this.cohortFilter === 'all'
      ? this.allCohorts
      : [...(this.cohortListByCategory[this.cohortFilter] || [])]
    
    // Filter out assigned cohorts
    let unassigned = cohorts.filter(cohort => !assignedCohortIds.has(cohort['docid']))
    
    // Apply search filter
    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase()
      unassigned = unassigned.filter(cohort => 
        cohort['name'].toLowerCase().includes(search)
      )
    }
    
    return unassigned
  }

  // Groups unassigned cohorts (already filtered + searched) by their cohortCategory.
  // Returns [{ category, cohorts }] so the template can render a section per category dynamically.
  getUnassignedCohortsGrouped(): { category: string, cohorts: any[] }[] {
    const grouped: { [key: string]: any[] } = {}
    this.getUnassignedCohorts().forEach(cohort => {
      const category = cohort['cohortCategory'] || 'uncategorized'
      ;(grouped[category] ||= []).push(cohort)
    })
    return Object.keys(grouped)
      .sort()
      .map(category => ({ category, cohorts: grouped[category] }))
  }

  // Toggle selection of a cohort (for multi-select)
  toggleCohortSelection(cohortId: string): void {
    if (this.selectedCohortIds.has(cohortId)) {
      this.selectedCohortIds.delete(cohortId)
    } else {
      this.selectedCohortIds.add(cohortId)
    }
  }

  // Check if a cohort is currently selected
  isCohortSelected(cohortId: string): boolean {
    return this.selectedCohortIds.has(cohortId)
  }

  // Check if any cohorts are selected
  get hasSelectedCohorts(): boolean {
    return this.selectedCohortIds.size > 0
  }

  // Get count of selected cohorts
  get selectedCount(): number {
    return this.selectedCohortIds.size
  }

  // Clear all selections
  clearSelection(): void {
    this.selectedCohortIds.clear()
  }

  // Set the cohort filter
  setCohortFilter(filter: string): void {
    this.cohortFilter = filter
    // Clear selections when changing filter
    this.clearSelection()
  }

  // ============================================================================
  // COHORT ASSIGNMENT AND REMOVAL
  // ============================================================================

  /**
   * Assign all selected cohorts to a specific zone
   * 
   * @param zoneId - ID of the zone to assign cohorts to
   * 
   * FLOW:
   * 1. Get the zone object
   * 2. Initialize cohorts array if it doesn't exist
   * 3. Add each selected cohort (if not already in zone)
   * 4. Update Firestore
   * 5. Recalculate statistics
   * 6. Clear selection
   */
  assignSelectedCohortsToZone(zoneId: string): void {
    const zone = this.mapEventZoneData[zoneId]
    
    if (!zone) {
      console.error('Zone not found:', zoneId)
      return
    }
    
    // Initialize cohorts array if needed
    if (!zone['cohorts']) {
      zone['cohorts'] = []
    }
    
    // Add each selected cohort
    this.selectedCohortIds.forEach(cohortId => {
      // Prevent duplicates
      if (!zone['cohorts'].includes(cohortId)) {
        zone['cohorts'].push(cohortId)
      }
    })
    
    // Clear selection
    this.selectedCohortIds.clear()
    
    // Recalculate statistics
    this.calculateAllStats()
    
    // Update in Firestore
    this.updateZoneInFirestore(zoneId, zone)
  }

  /**
   * Remove a cohort from a zone
   * 
   * @param cohortId - ID of the cohort to remove
   * @param zoneId - ID of the zone to remove from
   */
  removeCohortFromZone(cohortId: string, zoneId: string): void {
    const zone = this.mapEventZoneData[zoneId]
    
    if (!zone) {
      console.error('Zone not found:', zoneId)
      return
    }
    
    // Remove cohort from array
    zone['cohorts'] = (zone['cohorts'] || []).filter((id: string) => id !== cohortId)
    
    // Recalculate statistics
    this.calculateAllStats()
    
    // Update in Firestore
    this.updateZoneInFirestore(zoneId, zone)
  }

  /**
   * Update zone document in Firestore
   * 
   * @param zoneId - ID of the zone to update
   * @param zoneData - Updated zone data
   */
  private updateZoneInFirestore(zoneId: string, zoneData: any): void {
    const zoneRef = doc(this.firestore, 'event zones', zoneId)
    
    // Update only the cohorts field
    updateDoc(zoneRef, {
      cohorts: zoneData['cohorts'] || []
    }).then(() => {
      console.log('Zone updated successfully')
    }).catch(error => {
      console.error('Error updating zone:', error)
    })
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get cohort participant count
   */
  getCohortParticipantCount(cohort: any): number {
    return (cohort['participantidlist'] || []).length
  }

  /**
   * Open a dialog listing the participants of a cohort (picture, name, email).
   * Built from the in-memory participantidlist — no Firestore read.
   */
  openCohortParticipants(cohort: any): void {
    const ids: string[] = cohort['participantidlist'] || []
    const participants = ids.map(id => ({
      profileid: id,
      name: this.mapProfile[id] || id,
      email: this.mapProfileData[id]?.['email'] || 'N/A'
    })).sort((a, b) => a.name.localeCompare(b.name))

    this.dialog.open(CohortParticipantsDialogComponent, {
      width: '480px',
      data: {
        cohortName: cohort['name'],
        participants: participants
      }
    })
  }

  /**
   * Format time for display
   */
  formatTime(timestamp: any): string {
    if (!timestamp) return 'N/A'
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleString('en-US', { 
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit'
      })
    } catch (error) {
      return 'Invalid time'
    }
  }

  /**
   * Get cohort category badge color
   */
  getCategoryBadgeClass(category: string): string {
    // Derive class name from the category value so any new category gets its own class
    // e.g. "operational" -> "badge-operational", "technical-ops" -> "badge-technical-ops"
    const slug = (category || 'uncategorized').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return `badge-${slug}`
  }

  // Add / Edit Zone
  openCreateZoneDialog(zoneData): void {
    const dialogData = {
      zonedata: zoneData,
      teammemberlist: this.teamMemberProfilelist
    };

    const dialogRef = this.dialog.open(UpdateZoneDetailComponent, {
      width: '500px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result) => {
      console.log(result)
      if (result) {
        var updatedData = {
          zonename: result["zonename"],
          starttime: result["starttime"],
          coordinators: result["coordinators"],
          mentors: result["mentors"],
          docid: zoneData ? zoneData["docid"] : this.authguard.generateId(this.firestore, "event zones"),
          eventref: doc(this.firestore, "event collection", this.selectedEvent["docid"]),
          lastupdated: serverTimestamp(),
          status: "open"
        }

        if(zoneData == null){
          updatedData["created"] = serverTimestamp()
        }

        const eventZoneDoc = doc(this.firestore, "event zones", updatedData.docid)
        setDoc(eventZoneDoc, updatedData, {merge: true})
      }
    });
  }

  // Update Zone Status - Open | Close
  toggleZoneStatus(event, zoneData){
    console.log(event, event.checked)
    const eventZoneDoc = doc(this.firestore, "event zones", zoneData["docid"])
    updateDoc(eventZoneDoc, {
      status: event.checked ? "open" : "close"
    })
  }

  private async fetchExistingParticipantZones(): Promise<{ [participantId: string]: string }> {
    var loading = this.dialog.open(LoadingProgressComponent, {
      disableClose: true,
      data: {
        msg: "Validating...."
      }
    })

    const participantZoneMap = {};
    
    const eventRef = doc(this.firestore, "event collection", this.selectedEvent["docid"]);
    const participantZonesCollection = collection(this.firestore, "event participant zones");
    const participantZonesQuery = query(participantZonesCollection, where("eventref", "==", eventRef));

    await getDocs(participantZonesQuery).then(record =>{
      for (let i = 0; i < record.docs.length; i++) {
        const participantZoneDoc = record.docs[i];
        const zoneData = participantZoneDoc.data()
        participantZoneMap[zoneData["profileid"]] = zoneData["selectedzone"]
      }
    })

    loading.close()
    
    return participantZoneMap;
  }

  /*
  * Submit configuration after validating all participants
  * 
  * FLOW:
  * 1. Analyze all participants across all cohorts and zones
  * 2. Check for unassigned participants (not in any zone)
  * 3. Check for conflicts (in multiple zones)
  * 4. Handle each case appropriately
  */
  async submitConfiguration() {

    // Fetch existing assignments first
    const existingAssignments = await this.fetchExistingParticipantZones();

    // Analyze participant assignments
    const analysis = this.analyzeParticipantAssignments(existingAssignments);
    
    // Case 1: Unassigned participants - STOP
    if (analysis.unassigned.length > 0) {
      this.showUnassignedDialog(analysis.unassigned);
      return;
    }
    
    // Case 2: Conflicts - Manual resolution needed
    if (analysis.conflicts.length > 0) {
      this.showConflictDialog(analysis.conflicts);
      return;
    }
    
    // Case 3: All clean - Submit
    this.performSubmit(analysis.assigned, [], analysis.assigned);
  }

  // Analyze participant - Returns categorized participants
  private analyzeParticipantAssignments(existingAssignments: { [participantId: string]: string } = {}): {
    unassigned: any[],
    conflicts: any[],
    assigned: any[]
  } {
    // Track which zones each participant belongs to
    const participantZoneMap: { [participantId: string]: string[] } = {};
    
    // Get all unique participants from all cohorts
    const allParticipants = new Set<string>();
    this.allCohorts.forEach(cohort => {
      (cohort['participantidlist'] || []).forEach((pid: string) => {
        allParticipants.add(pid);
        participantZoneMap[pid] = [];
      });
    });
    
    // Map participants to zones
    this.eventZoneList.forEach(zone => {
      const participantIds = zone['_participantlist'] || new Set();
      participantIds.forEach((pid: string) => {
        if (participantZoneMap[pid]) {
          participantZoneMap[pid].push(zone['docid']);
        }
      });
    });
    
    // Categorize participants
    const unassigned: any[] = [];
    const conflicts: any[] = [];
    const assigned: any[] = [];
    
    allParticipants.forEach(participantId => {
      const zones = participantZoneMap[participantId] || [];
      const participantName = this.mapProfile[participantId] || participantId;
      const participantEmail = this.mapProfileData[participantId]?.['email']
      if (zones.length === 0) {
        // Not in any zone
        unassigned.push({
          participantId: participantId,
          participantName: participantName
        });
      } else if (zones.length === 1) {
        // Properly assigned to exactly one zone
        assigned.push({
          participantId: participantId,
          participantName: participantName,
          participantEmail: participantEmail,
          zoneId: zones[0],
          eligibleZones: zones, // All zones they could have been in
          selectedZone: zones[0], // Which one was chosen
          cohorts: this.getParticipantCohorts(participantId), // All cohorts they belong to
          hadConflict: false // Flag for differentiation
        });
      } else {
        // In multiple zones - conflict
        conflicts.push({
          participantId: participantId,
          participantName: participantName,
          participantEmail: participantEmail,
          zones: zones,
          selectedZone: existingAssignments[participantId],
          eligibleZones: zones, // Same as zones
          cohorts: this.getParticipantCohorts(participantId),
          hadConflict: true // Flag for differentiation
        });
      }
    });
    
    return { unassigned, conflicts, assigned };
  }

  // Add this helper method:
  private getParticipantCohorts(participantId: string): string[] {
    const cohortIds: string[] = [];
    this.allCohorts.forEach(cohort => {
      if ((cohort['participantidlist'] || []).includes(participantId)) {
        cohortIds.push(cohort['docid']);
      }
    });
    return cohortIds;
  }

  // Show dialog for unassigned participants
  private showUnassignedDialog(unassigned: any[]): void {
    this.dialog.open(ResolveParticipantZoneComponent, {
      width: '600px',
      disableClose: true,
      data: {
        type: 'unassigned',
        participants: unassigned,
        zoneMap: {},
        mapProfile: this.mapProfile
      }
    });
  }

  // Show dialog for conflict resolution
  private showConflictDialog(conflicts: any[]): void {
    // Build zone map for display
    const zoneMap: { [zoneId: string]: string } = {};
    this.eventZoneList.forEach(zone => {
      zoneMap[zone['docid']] = zone['zonename'];
    });

    // Sort: Participants with no selectedZone first
    conflicts.sort((a, b) => {
      // No selection comes first
      if (!a.selectedZone && b.selectedZone) return -1;
      if (a.selectedZone && !b.selectedZone) return 1;
      
      // Then sort alphabetically
      return a.participantName.localeCompare(b.participantName);
    });
    
    const dialogRef = this.dialog.open(ResolveParticipantZoneComponent, {
      width: '600px',
      disableClose: true,
      data: {
        type: 'conflict',
        participants: conflicts,
        zoneMap: zoneMap,
        mapProfile: this.mapProfile
      }
    });
    
    // After user resolves conflicts
    dialogRef.afterClosed().subscribe(result => {
    if (result) {
      // Resolved conflicts - mark them
      const resolvedConflicts = result.map((p: any) => ({
        participantId: p.participantId,
        participantName: p.participantName,
        participantEmail: p.participantEmail,
        zoneId: p.selectedZone,
        eligibleZones: p.eligibleZones,
        selectedZone: p.selectedZone,
        cohorts: p.cohorts,
        hadConflict: true // This was manually resolved
      }));
      
      // Get non-conflict participants
      const analysis = this.analyzeParticipantAssignments();
      const nonConflicts = analysis.assigned; // hadConflict: false
      
      // Combine both lists
      const allAssigned = [...nonConflicts, ...resolvedConflicts];
      
      // Submit with separated data
      this.performSubmit(allAssigned, resolvedConflicts, nonConflicts);
    }
  });
  }

  // Perform the actual submit - create documents for each participant
  private async performSubmit(
    allAssigned: any[],      // All participants
    conflicts: any[],        // Only those who had conflicts (hadConflict: true)
    nonConflicts: any[]      // Only clean assignments (hadConflict: false)
  ) {
    console.log('Total:', allAssigned);
    console.log('Had conflicts:', conflicts);
    console.log('Clean:', nonConflicts);

    var batch = writeBatch(this.firestore)

    var loading = this.dialog.open(LoadingProgressComponent, {
      disableClose: true,
      data: {
        msg: "Assigning...."
      }
    })

    try {
      for (let i = 0; i < allAssigned.length; i++) {
        const assigned = allAssigned[i];
        var participantData = {
          docid: assigned["participantId"] + " - " + this.selectedEvent["docid"],
          eventref: doc(this.firestore, "event collection", this.selectedEvent["docid"]),
          addedby: this.loggedInProfileID,
          addedflow: assigned["hadConflict"] ? "manual" : "automatic",
          eligiblezone: assigned["eligibleZones"],
          eligiliblecohorts: assigned["cohorts"],
          profileid: assigned["participantId"],
          selectedzone: assigned["zoneId"]
        }

        const participantDocument = doc(this.firestore, "event participant zones", participantData.docid)
        batch.set(participantDocument, participantData, {merge: true})

        var logID = this.authguard.generateId(this.firestore, "event participant zones logs")
        const participantLogDocument = doc(this.firestore, "event participant zones logs", logID)
        batch.set(participantLogDocument, {
          ...participantData,
          logid: logID,
          logdate: serverTimestamp()
        }, {merge: true})
      }

      await batch.commit().then(() =>{
        // Update the in-memory snapshot from what we just wrote so drift clears
        allAssigned.forEach((a: any) => {
          this.storedParticipantZones[a["participantId"]] = a["zoneId"]
        })
        this.storedZonesLoaded = true
        this.evaluateDriftStatus()
        alert("Success!")
      })
    } catch (error) {
      console.log(error)
      alert("Unable to submit")
    }

    loading.close()
  }

  // ============================================================================
  // VIEW PARTICIPANT ZONE OVERLAY
  // ============================================================================

  /**
   * Open the participant zone overlay and fetch data
   */
  async openParticipantZoneOverlay(): Promise<void> {
    if (!this.selectedEvent) {
      alert('Please select an event first')
      return
    }

    this.isLoadingParticipantZones = true
    this.showParticipantZoneOverlay = true
    this.participantZoneList = []
    this.participantZoneSearchTerm = ''

    try {
      const eventRef = doc(this.firestore, "event collection", this.selectedEvent["docid"])
      const participantZonesCollection = collection(this.firestore, "event participant zones")
      const participantZonesQuery = query(participantZonesCollection, where("eventref", "==", eventRef))

      const snapshot = await getDocs(participantZonesQuery)

      const participants: any[] = []

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data()
        const profileId = data["profileid"]
        
        // Get participant name from profile map
        const participantName = this.mapProfile[profileId] || profileId
        const participantEmail = this.mapProfileData[profileId]['email'] || 'N/A'
        
        // Get selected zone name
        const selectedZoneId = data["selectedzone"]
        const selectedZoneName = this.mapEventZoneData[selectedZoneId]?.["zonename"] || selectedZoneId || 'N/A'
        
        // Get eligible zone names
        const eligibleZoneIds = data["eligiblezone"] || []
        const eligibleZoneNames = eligibleZoneIds.map((zoneId: string) => 
          this.mapEventZoneData[zoneId]?.["zonename"] || zoneId
        )
        
        // Get eligible cohort names
        const eligibleCohortIds = data["eligiliblecohorts"] || data["eligiblecohorts"] || []
        const eligibleCohortNames = eligibleCohortIds.map((cohortId: string) => 
          this.mapCohortsData[cohortId]?.["name"] || cohortId
        )

        participants.push({
          docid: docSnap.id,
          profileid: profileId,
          participantName: participantName,
          participantEmail: participantEmail,
          selectedZoneId: selectedZoneId,
          selectedZoneName: selectedZoneName,
          eligibleZoneIds: eligibleZoneIds,
          eligibleZoneNames: eligibleZoneNames,
          eligibleCohortIds: eligibleCohortIds,
          eligibleCohortNames: eligibleCohortNames,
          addedflow: data["addedflow"] || 'N/A',
          zoneTrail: null, // Zone-change history — lazily fetched on first expand
          showTrail: false, // Expanded/collapsed state of the trail section
          trailLoading: false // True while this participant's logs are being fetched
        })
      })

      // Sort by participant name
      participants.sort((a, b) => a.participantName.localeCompare(b.participantName))
      
      this.participantZoneList = participants
      
    } catch (error) {
      console.error('Error fetching participant zones:', error)
      alert('Error loading participant zones')
    }

    this.isLoadingParticipantZones = false
  }

  /**
   * Close the participant zone overlay
   */
  closeParticipantZoneOverlay(): void {
    this.showParticipantZoneOverlay = false
    this.participantZoneList = []
    this.participantZoneSearchTerm = ''
  }

  /**
   * Get filtered participant zone list based on search term
   */
  getFilteredParticipantZones(): any[] {
    if (!this.participantZoneSearchTerm.trim()) {
      return this.participantZoneList
    }

    const search = this.participantZoneSearchTerm.toLowerCase()
    return this.participantZoneList.filter(p =>
      p.participantName.toLowerCase().includes(search) ||
      p.participantEmail.toLowerCase().includes(search) ||
      p.selectedZoneName.toLowerCase().includes(search)
    )
  }

  // ============================================================================
  // ZONE TRAIL (participant zone history)
  // ============================================================================

  /**
   * Toggle a participant's zone trail. The log data is fetched lazily — only on
   * the FIRST expand for that participant — then cached on the object so
   * re-opening it makes no further reads.
   */
  async toggleTrail(participant: any): Promise<void> {
    // Collapse if already open
    if (participant.showTrail) {
      participant.showTrail = false
      return
    }

    // Fetch once, then reuse the cached trail on subsequent opens
    if (participant.zoneTrail === null) {
      participant.trailLoading = true
      try {
        const eventRef = doc(this.firestore, "event collection", this.selectedEvent["docid"])
        const logsCollection = collection(this.firestore, "event participant zones logs")
        // Two equality filters (event + participant) — served by single-field
        // indexes, so no composite index is required.
        const logsQuery = query(
          logsCollection,
          where("eventref", "==", eventRef),
          where("profileid", "==", participant.profileid)
        )
        const logsSnapshot = await getDocs(logsQuery)
        participant.zoneTrail = this.buildParticipantTrail(logsSnapshot)
      } catch (error) {
        console.error('Error loading zone trail:', error)
        participant.zoneTrail = []
      }
      participant.trailLoading = false
    }

    participant.showTrail = true
  }

  /**
   * Build a single participant's "zone trail" from their assignment log rows.
   *
   * WHY: `event participant zones logs` records a snapshot on EVERY submit —
   * even when the participant's zone didn't change — so the raw rows repeat the
   * same zone many times. A trail should show only the points where they
   * actually MOVED zones, in chronological order.
   *
   * FLOW:
   * 1. Sort the rows oldest -> newest by logdate (drop rows with no logdate)
   * 2. Collapse consecutive rows that share the same selectedzone, keeping only
   *    the first row of each new zone (i.e. the moment the change happened)
   */
  private buildParticipantTrail(logsSnapshot: any): any[] {
    const rows = logsSnapshot.docs
      .map((d: any) => d.data())
      .filter((r: any) => r["logdate"])
      .sort((a: any, b: any) => this.toMillis(a["logdate"]) - this.toMillis(b["logdate"]))

    const trail: any[] = []
    let lastZoneId: string | null = null

    rows.forEach((r: any) => {
      const zoneId = r["selectedzone"]
      // Collapse consecutive identical zones -> only record actual changes
      if (zoneId === lastZoneId) return
      lastZoneId = zoneId
      trail.push({
        zoneId: zoneId,
        zoneName: this.mapEventZoneData[zoneId]?.["zonename"] || zoneId || 'N/A',
        date: r["logdate"].toDate ? r["logdate"].toDate() : new Date(r["logdate"]),
        addedflow: r["addedflow"] || 'N/A'
      })
    })

    return trail
  }

  /**
   * Normalize a Firestore Timestamp (or Date / millis) to milliseconds for sorting
   */
  private toMillis(ts: any): number {
    if (!ts) return 0
    if (ts.toMillis) return ts.toMillis()
    if (ts.toDate) return ts.toDate().getTime()
    return new Date(ts).getTime()
  }

  /**
   * Export participant zone data to Excel
   */
  exportParticipantZonesToExcel(): void {
    if (this.participantZoneList.length === 0) {
      alert('No data to export')
      return
    }

    // Prepare data for Excel
    const excelData = this.participantZoneList.map((p, index) => ({
      'S.No': index + 1,
      'Participant Name': p.participantName,
      'Email': p.participantEmail,
      'Selected Zone': p.selectedZoneName,
      'Eligible Zones': p.eligibleZoneNames.join(', '),
      'Eligible Cohorts': p.eligibleCohortNames.join(', '),
      'Assignment Type': p.addedflow
    }))

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participant Zones')

    // Set column widths
    const columnWidths = [
      { wch: 6 },   // S.No
      { wch: 30 },  // Participant Name
      { wch: 35 },  // Email
      { wch: 25 },  // Selected Zone
      { wch: 40 },  // Eligible Zones
      { wch: 50 },  // Eligible Cohorts
      { wch: 15 }   // Assignment Type
    ]
    worksheet['!cols'] = columnWidths

    // Generate filename with event name and date
    const eventName = this.selectedEvent["name"].replace(/[^a-zA-Z0-9]/g, '_')
    const date = new Date().toISOString().split('T')[0]
    const filename = `Participant_Zones_${eventName}_${date}.xlsx`

    // Download the file
    XLSX.writeFile(workbook, filename)
  }

}