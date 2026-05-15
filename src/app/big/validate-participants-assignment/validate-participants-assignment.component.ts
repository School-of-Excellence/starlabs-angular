import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import {
  collection,
  collectionSnapshots,
  doc,
  Firestore,
  getDocs,
  getDoc,
  getFirestore,
  query,
  updateDoc,
  where,
  writeBatch,
  orderBy
} from '@angular/fire/firestore';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { FormTemplatePreviewComponent } from '../../Product Designer/delivery-set/form-template-preview/form-template-preview.component'

interface Marathon {
  id: string;
  title: string;
  color?: string;
  [key: string]: any;
}

interface Cohort {
  id: string;
  docid: string;
  name: string;
  color?: string;
  marathonref?: any;
  [key: string]: any;
}

interface Assignment {
  id: string;
  docid: string;
  title: string;
  status: string;
  assignmenttype: string;
  marathonref: any;
  cohortsref?: any;
  mandatorycohortsid?: string[];
  optionalcohortsid?: string[];
  [key: string]: any;
}

interface ParticipantAssignment {
  id: string;
  docid: string;
  status: string;
  profileid: string;
  cohortsref: any;
  [key: string]: any;
}

interface CohortQueue {
  id: string;
  name: string;
  color?: string;
  participantCount: number;
}

@Component({
  selector: 'app-validate-participants-assignment',
  imports: [
    MatProgressBarModule,
    MatSidenavModule,
    CommonModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    FormsModule
  ],
  templateUrl: './validate-participants-assignment.component.html',
  styleUrl: './validate-participants-assignment.component.css'
})
export class ValidateParticipantsAssignmentComponent implements OnInit, OnDestroy {
  objectkeys = Object.keys;
  loading = true;
  loadingAssignments = false;
  loadingParticipants = false;
  loadingCohorts = false;

  // Marathon Selection
  marathons: Marathon[] = [];
  selectedMarathonId: string | null = null;
  selectedMarathon: Marathon | null = null;

  // Cohorts Filter (dropdown)
  allCohorts: Cohort[] = [];
  filteredCohorts: Cohort[] = [];
  selectedFilterCohortId: string | null = null;

  // Rework-only filter (validation pending)
  onlyReworkFilter = false;
  cohortsWithRework: Set<string> = new Set();
  assignmentsWithRework: Set<string> = new Set();

  // Created-by-me filter
  onlyMyActivities = false;

  // Assignment Selection
  assignments: Assignment[] = [];
  cohortBaseAssignments: Assignment[] = [];
  filteredAssignments: Assignment[] = [];
  assignmentSearchText = '';
  selectedAssignmentId: string | null = null;
  selectedAssignment: Assignment | null = null;

  // Theme color from marathon
  themeColor = '#374151';

  // Cohort Queue (horizontal chips for participant filtering)
  cohortQueues: CohortQueue[] = [];
  selectedCohortQueueId: string | null = null;

  // Participant Data
  allParticipantAssignments: ParticipantAssignment[] = [];
  mapParticipantAssignmentsByStatus: { [key: string]: ParticipantAssignment[] } = {};
  filteredParticipantAssignmentsByStatus: { [key: string]: ParticipantAssignment[] } = {};
  originalParticipantAssignmentsByStatus: { [key: string]: ParticipantAssignment[] } = {};

  // Profile & Cohort Maps
  mapProfile: { [key: string]: any } = {};
  mapCohorts: { [key: string]: any } = {};

  // Status Management
  statusList: string[] = ['initiated', 'ongoing', 'review', 'rework', 'completed'];
  statusIcons: { [key: string]: string } = {
    'initiated': 'play_circle_outline',
    'ongoing': 'pending',
    'review': 'rate_review',
    'rework': 'refresh',
    'completed': 'check_circle'
  };

  selectedParticipantAssignments: { [key: string]: { [key: string]: boolean } } = {};

  // User & Access
  loggedInProfileId: string | null = null;
  bigAdminAccess = false;
  admins: string[] = [];

  // Other
  summary = '';
  currentDate = new Date();
  showDetailsPanel = true;

  private subscription = new Subject<void>();

  constructor(
    private firestore: Firestore,
    public route: ActivatedRoute,
    public authguard: AuthguardService,
    private router: Router,
    public dialog: MatDialog,
    public snackbar: MatSnackBar
  ) {}

  async ngOnInit() {
    const roles = await this.authguard.getRoles();
    if (roles['mentor']) {
      this.bigAdminAccess = true;
    } else {
      this.bigAdminAccess = false;
      alert('You have no access to the screen');
      this.router.navigateByUrl('/');
      return;
    }
    this.loggedInProfileId = roles['profile_ref']?.id;

    await this.loadProfiles();
    await this.loadMarathons();
    await this.loadAllCohorts();

    this.loading = false;

    const params = this.route.snapshot.queryParams;
    const marathonIdParam = params['marathonid'];
    const cohortIdParam = params['cohortid'];
    const assignmentIdParam = params['assignmentid'];

    if (marathonIdParam) {
      await this.onMarathonChange(marathonIdParam);
      if (cohortIdParam) {
        await this.onCohortFilterChange(cohortIdParam);
      }
      if (assignmentIdParam) {
        await this.onAssignmentChange(assignmentIdParam);
      }
    }
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  async loadProfiles() {
    const snap = await getDocs(collection(this.firestore, 'profile_data'));
    snap.docs.forEach(doc => {
      const data = doc.data();
      this.mapProfile[data['profileid']] = data;
    });
  }

  async loadMarathons() {
    const marathonQuery = query(
      collection(this.firestore, 'big marathon'),
      orderBy('title', 'asc')
    );

    const snap = await getDocs(marathonQuery);
    this.marathons = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Marathon));
  }

  async loadAllCohorts() {
    const cohortsQuery = query(
      collection(this.firestore, 'big cohorts'),
      orderBy('name', 'asc')
    );

    const snap = await getDocs(cohortsQuery);
    this.allCohorts = snap.docs.map(doc => ({
      id: doc.id,
      docid: doc.id,
      ...doc.data()
    } as Cohort));

    // Also populate mapCohorts
    this.allCohorts.forEach(cohort => {
      this.mapCohorts[cohort.id] = cohort;
    });
  }

  async onMarathonChange(marathonId: string) {
    this.selectedMarathonId = marathonId;
    this.selectedMarathon = this.marathons.find(m => m.id === marathonId) || null;
    this.selectedFilterCohortId = null;
    this.selectedAssignmentId = null;
    this.selectedAssignment = null;
    this.assignments = [];
    this.filteredAssignments = [];
    this.assignmentSearchText = '';
    this.cohortQueues = [];
    this.selectedCohortQueueId = null;
    this.clearParticipantData();

    if (this.selectedMarathon?.color) {
      this.themeColor = this.selectedMarathon.color;
    } else {
      this.themeColor = '#374151';
    }

    if (!marathonId) {
      this.filteredCohorts = [];
      return;
    }

    // Filter cohorts based on marathon
    const marathonRef = doc(this.firestore, 'big marathon', marathonId);
    this.filteredCohorts = this.allCohorts.filter(cohort =>
      cohort.marathonref?.id === marathonId || cohort.marathonref?.path?.includes(marathonId)
    );

    this.loadingAssignments = true;

    const assignmentQuery = query(
      collection(this.firestore, 'big assignment'),
      where('marathonref', '==', marathonRef)
    );

    const snap = await getDocs(assignmentQuery);
    this.assignments = snap.docs.map(doc => ({
      id: doc.id,
      docid: doc.id,
      ...doc.data()
    } as Assignment));

    this.filteredAssignments = [...this.assignments];
    this.loadingAssignments = false;

    await this.loadReworkMap();
    this.applyReworkFilter();
  }

  async loadReworkMap() {
    this.cohortsWithRework = new Set();
    this.assignmentsWithRework = new Set();
    try {
      const cohortIds = this.selectedFilterCohortId
        ? [this.selectedFilterCohortId]
        : this.filteredCohorts.map(c => c.id);

      await Promise.all(cohortIds.map(async cohortId => {
        const cohortRef = doc(this.firestore, 'big cohorts', cohortId);
        const snap = await getDocs(query(
          collection(this.firestore, 'big participants assignments'),
          where('cohortsref', '==', cohortRef)
        ));
        snap.docs.forEach(d => {
          const data: any = d.data();
          if (data.status !== 'review') return;
          if (data.cohortsref?.id) this.cohortsWithRework.add(data.cohortsref.id);
          if (data.assignmentref?.id) this.assignmentsWithRework.add(data.assignmentref.id);
        });
      }));
    } catch (e) {
      console.error('Failed to load rework map', e);
    }
  }

  async onToggleReworkFilter(checked: boolean) {
    this.onlyReworkFilter = checked;
    if (checked) {
      await this.loadReworkMap();
    }
    this.applyReworkFilter();
  }

  applyReworkFilter() {
    this.filterAssignmentsBySearch();
  }

  get displayCohorts(): Cohort[] {
    if (!this.onlyReworkFilter) return this.filteredCohorts;
    return this.filteredCohorts.filter(c => this.cohortsWithRework.has(c.id));
  }

  async onCohortFilterChange(cohortId: string | null) {
    this.selectedFilterCohortId = cohortId;
    this.selectedAssignmentId = null;
    this.selectedAssignment = null;
    this.assignmentSearchText = '';
    this.clearParticipantData();

    if (!cohortId) {
      // Show all assignments for this marathon
      this.filterAssignmentsBySearch();
      return;
    }

    // Fetch assignments that have cohortref matching the selected cohort
    this.loadingAssignments = true;

    const cohortRef = doc(this.firestore, 'big cohorts', cohortId);
    const assignmentQuery = query(
      collection(this.firestore, 'big assignment'),
      where('cohortsref', '==', cohortRef)
    );

    const snap = await getDocs(assignmentQuery);
    const cohortAssignments = snap.docs.map(doc => ({
      id: doc.id,
      docid: doc.id,
      ...doc.data()
    } as Assignment));

    // Also filter by marathon if selected
    if (this.selectedMarathonId) {
      this.cohortBaseAssignments = cohortAssignments.filter(a =>
        a.marathonref?.id === this.selectedMarathonId
      );
    } else {
      this.cohortBaseAssignments = cohortAssignments;
    }

    if (this.onlyReworkFilter) {
      await this.loadReworkMap();
    }

    this.filterAssignmentsBySearch();
    this.loadingAssignments = false;
  }

  filterAssignmentsBySearch() {
    let source = this.selectedFilterCohortId ? [...this.cohortBaseAssignments] : [...this.assignments];

    if (this.assignmentSearchText) {
      const searchText = this.assignmentSearchText.toLowerCase();
      source = source.filter(a =>
        a.title?.toLowerCase().includes(searchText) ||
        a.assignmenttype?.toLowerCase().includes(searchText)
      );
    }

    if (this.onlyReworkFilter) {
      source = source.filter(a => this.assignmentsWithRework.has(a.id));
    }

    if (this.onlyMyActivities && this.loggedInProfileId) {
      source = source.filter(a => a['createdprofileref']?.id === this.loggedInProfileId);
    }

    this.filteredAssignments = source;
  }

  onToggleMyActivities(checked: boolean) {
    this.onlyMyActivities = checked;
    this.filterAssignmentsBySearch();
  }

  onAssignmentSearch(event: Event) {
    const searchText = (event.target as HTMLInputElement).value?.toLowerCase().trim() || '';
    this.assignmentSearchText = searchText;
    this.filterAssignmentsBySearch();
  }

  async onAssignmentChange(assignmentId: string) {
    this.selectedAssignmentId = assignmentId;
    this.selectedCohortQueueId = null;
    this.clearParticipantData();

    if (!assignmentId) {
      this.selectedAssignment = null;
      return;
    }

    this.loadingParticipants = true;
    this.selectedAssignment = this.assignments.find(a => a.id === assignmentId) || null;

    if (this.selectedAssignment) {
      this.admins = this.selectedAssignment['selectedAdmin'] || [];
      this.summary = this.selectedAssignment['summary'] || '';
    }

    const assignmentRef = doc(this.firestore, 'big assignment', assignmentId);

    collectionSnapshots(
      query(
        collection(this.firestore, 'big participants assignments'),
        where('assignmentref', '==', assignmentRef)
      )
    ).pipe(takeUntil(this.subscription)).subscribe(async snapData => {
      const snap = snapData.map(doc => ({ id: doc.id, docid: doc.id, ...doc.data() } as ParticipantAssignment));
      this.allParticipantAssignments = snap;

      const cohortMap: { [key: string]: { count: number; data?: any } } = {};
      const cohortsIdList: string[] = [];

      for (const element of snap) {
        if (element.cohortsref) {
          const cohortId = element.cohortsref.id;
          if (!cohortsIdList.includes(cohortId)) {
            cohortsIdList.push(cohortId);
          }
          cohortMap[cohortId] = cohortMap[cohortId] || { count: 0 };
          cohortMap[cohortId].count++;
        }
      }

      // Load any missing cohorts
      const filteredCohortsIdList = cohortsIdList.filter(e => !this.mapCohorts[e]);
      for (let i = 0; i < filteredCohortsIdList.length; i += 10) {
        const cohortsId = filteredCohortsIdList.slice(i, i + 10);
        if (cohortsId.length > 0) {
          const cohortsSnap = await getDocs(
            query(collection(this.firestore, 'big cohorts'), where('docid', 'in', cohortsId))
          );
          cohortsSnap.forEach(doc => {
            this.mapCohorts[doc.id] = doc.data();
          });
        }
      }

      this.cohortQueues = cohortsIdList.map(id => ({
        id,
        name: this.mapCohorts[id]?.name || 'Unknown',
        color: this.mapCohorts[id]?.color || null,
        participantCount: cohortMap[id]?.count || 0
      }));

      this.processParticipantsByStatus(snap);
      this.loadingParticipants = false;
    });
  }

  processParticipantsByStatus(participants: ParticipantAssignment[]) {
    this.mapParticipantAssignmentsByStatus = {};

    let filteredParticipants = participants;
    if (this.selectedCohortQueueId) {
      filteredParticipants = participants.filter(p => p.cohortsref?.id === this.selectedCohortQueueId);
    }

    for (const element of filteredParticipants) {
      const status = element.status || 'initiated';
      this.mapParticipantAssignmentsByStatus[status] = this.mapParticipantAssignmentsByStatus[status] || [];
      this.mapParticipantAssignmentsByStatus[status].push(element);
    }

    this.originalParticipantAssignmentsByStatus = JSON.parse(JSON.stringify(this.mapParticipantAssignmentsByStatus));
    this.filteredParticipantAssignmentsByStatus = this.mapParticipantAssignmentsByStatus;
  }

  onCohortQueueFilter(cohortId: string | null) {
    this.selectedCohortQueueId = cohortId;
    this.selectedParticipantAssignments = {};
    this.processParticipantsByStatus(this.allParticipantAssignments);
  }

  clearParticipantData() {
    this.allParticipantAssignments = [];
    this.mapParticipantAssignmentsByStatus = {};
    this.filteredParticipantAssignmentsByStatus = {};
    this.originalParticipantAssignmentsByStatus = {};
    this.selectedParticipantAssignments = {};
    this.cohortQueues = [];
  }

  getStatusCount(status: string): number {
    return this.filteredParticipantAssignmentsByStatus[status]?.length || 0;
  }

  getTotalParticipants(): number {
    return Object.values(this.filteredParticipantAssignmentsByStatus)
      .reduce((sum, arr) => sum + arr.length, 0);
  }

  filteredStatus(status: string): string[] {
    return this.statusList.filter(e => e !== status);
  }

  isAllSelected(status: string): boolean {
    const selected = this.selectedParticipantAssignments[status] || {};
    const filtered = this.filteredParticipantAssignmentsByStatus[status] || [];
    return Object.keys(selected).length > 0 && Object.keys(selected).length === filtered.length;
  }

  isAnySelected(status: string): boolean {
    const selected = this.selectedParticipantAssignments[status] || {};
    const filtered = this.filteredParticipantAssignmentsByStatus[status] || [];
    return Object.keys(selected).length > 0 && Object.keys(selected).length !== filtered.length;
  }

  getSelectedCount(status: string): number {
    return Object.keys(this.selectedParticipantAssignments[status] || {}).length;
  }

  getTotalSelectedCount(): number {
    let total = 0;
    for (const status of this.statusList) {
      total += this.getSelectedCount(status);
    }
    return total;
  }

  // Get all participants for communication (selected or all if none selected)
  getParticipantsForCommunication(): ParticipantAssignment[] {
    const totalSelected = this.getTotalSelectedCount();

    if (totalSelected > 0) {
      // Return only selected participants
      const selectedParticipants: ParticipantAssignment[] = [];
      for (const status of this.statusList) {
        const selected = this.selectedParticipantAssignments[status] || {};
        const participants = this.filteredParticipantAssignmentsByStatus[status] || [];
        participants.forEach(p => {
          if (selected[p.docid]) {
            selectedParticipants.push(p);
          }
        });
      }
      return selectedParticipants;
    } else {
      // Return all participants in filtered list
      const allParticipants: ParticipantAssignment[] = [];
      for (const status of this.statusList) {
        const participants = this.filteredParticipantAssignmentsByStatus[status] || [];
        allParticipants.push(...participants);
      }
      return allParticipants;
    }
  }

  getProfileIdsForCommunication(): string[] {
    const participants = this.getParticipantsForCommunication();
    return participants
      .map(p => p.profileid)
      .filter((id, index, self) => id && self.indexOf(id) === index); // Unique profile IDs
  }

  onSearchParticipant(event: Event, status: string) {
    const filterText = (event.target as HTMLInputElement).value?.toLowerCase().trim() || '';

    if (!filterText) {
      this.filteredParticipantAssignmentsByStatus[status] =
        JSON.parse(JSON.stringify(this.originalParticipantAssignmentsByStatus[status] || []));
    } else {
      this.filteredParticipantAssignmentsByStatus[status] =
        (this.originalParticipantAssignmentsByStatus[status] || []).filter((e: any) =>
          this.mapProfile[e.profileid]?.name?.toLowerCase().includes(filterText)
        );
    }
  }

  selectAll(assignmentstatus: string, event: MatCheckboxChange) {
    this.selectedParticipantAssignments[assignmentstatus] = {};
    if (event.checked) {
      this.selectedParticipantAssignments[assignmentstatus] =
        (this.filteredParticipantAssignmentsByStatus[assignmentstatus] || []).reduce((acc, cur) => {
          acc[cur.docid] = true;
          return acc;
        }, {} as { [key: string]: boolean });
    }
  }

  toggleSelectAll(status: string) {
    const allSelected = this.isAllSelected(status);
    this.selectedParticipantAssignments[status] = {};

    if (!allSelected) {
      this.selectedParticipantAssignments[status] =
        (this.filteredParticipantAssignmentsByStatus[status] || []).reduce((acc, cur) => {
          acc[cur.docid] = true;
          return acc;
        }, {} as { [key: string]: boolean });
    }
  }

  onSelectParticipantAssignment(assignmentstatus: string, participantAssignmentId: string, event: MatCheckboxChange) {
    this.selectedParticipantAssignments[assignmentstatus] = this.selectedParticipantAssignments[assignmentstatus] || {};

    if (event.checked) {
      this.selectedParticipantAssignments[assignmentstatus][participantAssignmentId] = true;
    } else {
      delete this.selectedParticipantAssignments[assignmentstatus][participantAssignmentId];
    }
  }

  async moveParticipant(fromStatus: string, toStatus: string) {
    const selected = this.selectedParticipantAssignments[fromStatus];
    if (!selected || Object.keys(selected).length === 0) {
      this.snackbar.open('No participants selected', 'OK', { duration: 3000 });
      return;
    }

    const batch = writeBatch(this.firestore);
    const filteredAssignments = Object.keys(selected).filter(e => selected[e]);

    for (const docid of filteredAssignments) {
      const ref = doc(this.firestore, 'big participants assignments', docid);
      batch.update(ref, { status: toStatus });
    }

    try {
      await batch.commit();
      this.snackbar.open(`Moved ${filteredAssignments.length} participant(s) to ${toStatus}`, 'OK', { duration: 3000 });
      this.selectedParticipantAssignments[fromStatus] = {};
    } catch (err) {
      console.error('Error moving participants:', err);
      this.snackbar.open('Error moving participants', 'OK', { duration: 3000 });
    }
  }

  async moveSingleParticipant(participantDocId: string, fromStatus: string, toStatus: string) {
    try {
      const ref = doc(this.firestore, 'big participants assignments', participantDocId);
      await updateDoc(ref, { status: toStatus });
      this.snackbar.open(`Moved to ${toStatus}`, 'OK', { duration: 2000 });
    } catch (err) {
      console.error('Error moving participant:', err);
      this.snackbar.open('Error moving participant', 'OK', { duration: 3000 });
    }
  }

  statusChat(status: string) {
    const selectedParticipants = (this.filteredParticipantAssignmentsByStatus[status] || []).filter(assignment =>
      this.selectedParticipantAssignments[status]?.[assignment.docid]
    );

    const profileIds: string[] = [];
    const participants = selectedParticipants.length > 0
      ? selectedParticipants
      : this.filteredParticipantAssignmentsByStatus[status] || [];

    participants.forEach(participant => {
      if (participant.profileid) {
        profileIds.push(participant.profileid);
      }
    });

    if (this.bigAdminAccess) {
      const url = this.router.createUrlTree(['bigchatscreen'], {
        queryParams: {
          assignemtnId: this.selectedAssignmentId,
          sender: 'admin',
          profileId: profileIds
        }
      });
      window.open(url.toString(), '_blank');
    } else {
      this.snackbar.open('You do not have admin access.', 'OK', { duration: 5000 });
    }
  }

  bigChat() {
    if (this.bigAdminAccess && this.selectedAssignment) {
      const url = this.router.createUrlTree(['bigchatscreen'], {
        queryParams: {
          assignemtnId: this.selectedAssignmentId,
          sender: 'admin',
          admins: this.selectedAssignment['selectedAdmin'] || []
        }
      });
      window.open(url.toString(), '_blank');
    } else {
      this.snackbar.open('You do not have admin access.', 'OK', { duration: 5000 });
    }
  }

  sendNotification() {
    const profileIds = this.getProfileIdsForCommunication();
    const totalSelected = this.getTotalSelectedCount();

    if (profileIds.length === 0) {
      this.snackbar.open('No participants to send notification', 'OK', { duration: 3000 });
      return;
    }

    const message = totalSelected > 0
      ? `Sending notification to ${profileIds.length} selected participant(s)...`
      : `Sending notification to all ${profileIds.length} participant(s)...`;

    this.snackbar.open(message, 'OK', { duration: 2000 });

    // TODO: Implement your notification logic here
    console.log('Sending notification to profile IDs:', profileIds);
    // Example: this.notificationService.send(profileIds, this.selectedAssignmentId);
  }

  sendEmail() {
    const profileIds = this.getProfileIdsForCommunication();
    const totalSelected = this.getTotalSelectedCount();

    if (profileIds.length === 0) {
      this.snackbar.open('No participants to send email', 'OK', { duration: 3000 });
      return;
    }

    const message = totalSelected > 0
      ? `Opening email for ${profileIds.length} selected participant(s)...`
      : `Opening email for all ${profileIds.length} participant(s)...`;

    this.snackbar.open(message, 'OK', { duration: 2000 });

    // TODO: Implement your email logic here
    console.log('Sending email to profile IDs:', profileIds);

    // Get emails from profiles
    const emails = profileIds
      .map(id => this.mapProfile[id]?.email)
      .filter(email => email);

    if (emails.length > 0) {
      // Open mailto link
      const mailtoLink = `mailto:${emails.join(',')}?subject=Assignment: ${this.selectedAssignment?.title || ''}`;
      window.open(mailtoLink, '_blank');
    }
  }

  sendWhatsApp() {
    const profileIds = this.getProfileIdsForCommunication();
    const totalSelected = this.getTotalSelectedCount();

    if (profileIds.length === 0) {
      this.snackbar.open('No participants to send WhatsApp', 'OK', { duration: 3000 });
      return;
    }

    const message = totalSelected > 0
      ? `Opening WhatsApp for ${profileIds.length} selected participant(s)...`
      : `Opening WhatsApp for all ${profileIds.length} participant(s)...`;

    this.snackbar.open(message, 'OK', { duration: 2000 });

    // TODO: Implement your WhatsApp logic here
    console.log('Sending WhatsApp to profile IDs:', profileIds);

    // Get phone numbers from profiles
    const phones = profileIds
      .map(id => this.mapProfile[id]?.phone || this.mapProfile[id]?.mobile)
      .filter(phone => phone);

    if (phones.length === 1) {
      // Single recipient - open WhatsApp directly
      const phone = phones[0].replace(/\D/g, '');
      const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(`Regarding Assignment: ${this.selectedAssignment?.title || ''}`)}`;
      window.open(whatsappLink, '_blank');
    } else if (phones.length > 1) {
      // Multiple recipients - you might want to open a bulk messaging service
      // For now, just show the count
      this.snackbar.open(`${phones.length} phone numbers ready for WhatsApp broadcast`, 'OK', { duration: 3000 });
    }
  }

  markAssignmentCompletion(event: MatCheckboxChange) {
    if (!this.selectedAssignment) return;

    updateDoc(doc(this.firestore, 'big assignment', this.selectedAssignment.docid), {
      status: event.checked ? 'completed' : 'ongoing'
    });
  }

  onUpdateSummary() {
    if (!this.selectedAssignment) return;

    updateDoc(doc(this.firestore, 'big assignment', this.selectedAssignment.docid), {
      summary: this.summary
    });
    this.snackbar.open('Summary updated', 'OK', { duration: 2000 });
  }
  extractFormValues(formData: any): any {
    const values: any = {};
    if (!formData?.formarray) return values;
    formData.formarray.forEach((field: any) => {
      if (field.formcontrol && !['label', 'video', 'audio'].includes(field.type)) {
        values[field.formcontrol] = field.value ?? null;
      }
    });
    return values;
  }

  review(assignment: ParticipantAssignment) {
    if (!this.selectedAssignment) return;
    const assignmentType = this.selectedAssignment.assignmenttype;

    if (assignmentType === 'Form') {
      const formTemplateId = assignment['formtemplate'];
      const activityrefId = assignment['activityref']?.id;
      if (!formTemplateId || !activityrefId) {
        this.snackbar.open('Form data not found', 'OK', { duration: 3000 });
        console.error('Missing formtemplate or activityref:', assignment);
        return;
      }

      // fetch the filled form data from formsByClient
      const firestoreForms = getFirestore('firestore-forms');
      getDoc(doc(firestoreForms, 'formsByClient', activityrefId)).then(snap => {
        if (!snap.exists()) {
          this.snackbar.open('Form submission not found', 'OK', { duration: 3000 });
          return;
        }
        const formData = snap.data();
        this.dialog.open(FormTemplatePreviewComponent, {
          width: '800px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          data: {
            formData: formData,
            formValues: this.extractFormValues(formData),
            reviewaccess: this.loggedInProfileId !== assignment.profileid,
            participantassignmentid: assignment.docid,
            validate: false,
            loginid: this.loggedInProfileId,
            profileid: assignment.profileid,
            viewOnly: true
          },
          disableClose: true
        }).afterClosed().subscribe(async (result) => {
          console.log('dialog result:', result);
  console.log('reviewnotes:', result?.reviewnotes);
          if (result && result.confirmed) {
            const updatePayload: any = { status: result.status };
            if (result.reviewnotes && result.reviewnotes.length > 0) {
              const newLogEntry = {
                notes: Array.isArray(result.reviewnotes)
                  ? result.reviewnotes.filter((n: string) => n?.trim())
                  : [result.reviewnotes],
                date: new Date(),
                reviewedby: this.loggedInProfileId,
                status: result.status
              };
              const existingLog = assignment['activitylog'] || [];
              updatePayload['activitylog'] = [...existingLog, newLogEntry];
            }
            await updateDoc(
              doc(this.firestore, 'big participants assignments', assignment.docid),
              updatePayload
            );
            this.snackbar.open('Status updated to ' + result.status, 'OK', { duration: 3000 });
          }
        });
      });
    } else if (assignmentType === 'ATC') {
      const url = this.router.createUrlTree(['/previewATC'], {
        queryParams: {
          type: 'validation',
          atcdocid: assignment['activityref']?.id,
          validation: true,
          profileid: assignment.profileid,
          marathonid: assignment['marathonref']?.id,
          assignmentid: this.selectedAssignmentId,
          participantassignmentid: assignment.docid
        }
      }).toString();
      window.open(url, '_blank');
    } else if (assignmentType === 'Triple ATC') {
      const url = this.router.createUrlTree(['/previewtripleATC'], {
        queryParams: {
          type: 'validation',
          atcdocid: assignment['activityref']?.id,
          validation: true,
          profileid: assignment.profileid,
          marathonid: assignment['marathonref']?.id,
          assignmentid: assignment.docid,
          participantassignmentid: assignment['participantAssignmentId']
        }
      }).toString();
      window.open(url, '_blank');
    } else if (assignmentType === 'Manual Assignment') {
      const url = this.router.createUrlTree(['manual_assignment'], {
        queryParams: {
          assignmentid: this.selectedAssignment.docid,
          profileid: this.selectedAssignment['profileId'],
          participantAssignmentId: assignment.docid,
          type: 'review'
        }
      });
      window.open(url.toString(), '_blank');
    }
  }

  toggleDetailsPanel() {
    this.showDetailsPanel = !this.showDetailsPanel;
  }
}
