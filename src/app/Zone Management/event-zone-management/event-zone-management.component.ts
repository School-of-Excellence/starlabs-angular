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
import { Clipboard } from '@angular/cdk/clipboard';
import * as XLSX from 'xlsx';

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
    MatSlideToggleModule
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

  // Event Cohorts
  operationalCohortList: any[] = []
  educationalCohortList: any[] = []
  mapCohortsData: { [key: string]: any } = {}
  
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

  constructor(
    public firestore: Firestore,
    public dialog: MatDialog,
    public authguard: AuthguardService,
    public cdr: ChangeDetectorRef,
    public clipboard: Clipboard
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
    this.operationalCohortList = []
    this.educationalCohortList = []
    this.mapCohortsData = {}
    this.mapCohortParticipants = {}
    this.selectedCohortIds.clear()
    this.participantZoneList = []
    this.showParticipantZoneOverlay = false

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
        id = [...id, ...d["cohorts"]]
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
    const cohortQuery = query(cohortCollection, where("eventref", "==", eventRef), where("cohortCategory", "in", ["operational", "educational"]))
    
    collectionData(cohortQuery, { idField: "docid" }).pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {

      console.log("****", data.map(e => e["docid"]).sort((a, b) => a.localeCompare(b)))

      // Sort cohorts alphabetically
      data.sort((a, b) => a["name"].localeCompare(b["name"]))
      
      // Reset cohort lists
      this.operationalCohortList = []
      this.educationalCohortList = []
      
      // Process each cohort
      data.forEach(cohort => {
        // Store participant list for quick lookup
        this.mapCohortParticipants[cohort["docid"]] = cohort["participantidlist"] || []
        
        // Store cohort data
        this.mapCohortsData[cohort["docid"]] = cohort
        
        // Categorize cohorts
        if (cohort["cohortCategory"] === "operational") {
          this.operationalCohortList.push(cohort)
        } else if (cohort["cohortCategory"] === "educational") {
          this.educationalCohortList.push(cohort)
        }
      })
      
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
    this.cdr.detectChanges()
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
    const totalCohorts = this.operationalCohortList.length + this.educationalCohortList.length
    return totalCohorts - this.cohortsAssigned
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

  returnMappedParticipants(){
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

    this.clipboard.copy(JSON.stringify(mappedParticipantIds))
  }

  // Total number of unique participants across all cohorts
  get totalParticipants(): number {
    const allParticipantIds = new Set<string>()
    
    // Combine all cohorts
    const allCohorts = [...this.operationalCohortList, ...this.educationalCohortList]
    
    allCohorts.forEach(cohort => {
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
    
    // Get all cohorts based on filter
    let cohorts: any[] = []
    if (this.cohortFilter === 'operational') {
      cohorts = [...this.operationalCohortList]
    } else if (this.cohortFilter === 'educational') {
      cohorts = [...this.educationalCohortList]
    } else {
      cohorts = [...this.operationalCohortList, ...this.educationalCohortList]
    }
    
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
    return category === 'operational' ? 'badge-operational' : 'badge-educational'
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
    [...this.operationalCohortList, ...this.educationalCohortList].forEach(cohort => {
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
      const participantEmail = this.mapProfileData[participantId]['email']
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
    [...this.operationalCohortList, ...this.educationalCohortList].forEach(cohort => {
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
          logid: logID
        }, {merge: true})
      }

      await batch.commit().then(() =>{
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
          addedflow: data["addedflow"] || 'N/A'
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