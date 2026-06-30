import { Component, Inject, ViewChild, ElementRef } from '@angular/core';
import { collection, doc, DocumentReference, Firestore, getDoc, getDocs, or, orderBy, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { AutoCompleteWithChipComponent } from "../../form-element/auto-complete-with-chip/auto-complete-with-chip.component";
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-manage-coherts',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatOptionModule,
    MatSelectModule,
    MatButtonModule,
    MatRadioModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    FormsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  templateUrl: './manage-coherts.component.html',
  styleUrl: './manage-coherts.component.css'
})
export class ManageCohertsComponent {

  cohortsForm: FormGroup;
  filteredParticipants: any[] = [];
  
  // Tags from participant tags collection
  participantTagsList: any[] = [];
  filteredTagsList: any[] = [];
  selectedTags: string[] = [];
  tagSearchQuery: string = '';
  tagDropdownOpen: boolean = false;
  
  // Mentors selection
  mentorsList: any[] = [];
  filteredMentorsList: any[] = [];
  selectedMentors: string[] = [];
  mentorSearchQuery: string = '';
  mentorDropdownOpen: boolean = false;
  loadingMentors: boolean = false;

  // Team selection
  teamsList: any[] = [];
  filteredTeamList: any[] = [];
  selectedTeam: string[] = [];
  teamSearchQuery: string = '';
  teamDropdownOpen: boolean = false;
  loadingTeam: boolean = false;
  
  // Participants selection (dropdown style)
  selectedParticipants: string[] = [];
  participantSearchQuery: string = '';
  participantDropdownOpen: boolean = false;
  filteredParticipantsList: any[] = [];
  
  // Existing participants (selected but not in current filtered list)
  existingParticipantsNotInList: any[] = [];
  
  // Excel Import for Participants
  @ViewChild('participantExcelInput') participantExcelInput!: ElementRef<HTMLInputElement>;
  isImportingParticipants: boolean = false;
  participantImportResults: { matched: number; notFound: string[] } | null = null;
  
  // Event participation tracking
  bigInvitationParticipants: any[] = [];
  bigInvitationCount: number = 0;
  loadingInvitations: boolean = false;
  mapProfile = {};
  
  // Track original participants for edit mode comparison
  originalParticipantIds: string[] = [];
  
  // Track if group chat was originally enabled (for edit mode)
  originalGroupChatEnabled: boolean = false;
  
  // Support chat group profile URL
  readonly GROUP_PROFILE_URL = 'https://firebasestorage.googleapis.com/v0/b/fir-sample-aae4a.appspot.com/o/A%26H%20Team%2Fprofile%2F2024-09-24%2021%3A35%3A26.245047%20image_cropper_B9AB1FFC-6A3B-4E50-AA50-5078D8D35F2B-2253-0000015AF2A238A3.jpg?alt=media&token=69c8a4f5-1765-463f-8cd1-b7152ea314f7';
  
  // Level options
  levelOptions = [
    { value: 'level1', label: 'Level 1' },
    { value: 'level2', label: 'Level 2' },
    { value: 'level3', label: 'Level 3' },
    { value: 'level4', label: 'Level 4' },
    { value: 'level5', label: 'Level 5' }
  ];

  bigActivityList: any[] = [];

  supportchatref: DocumentReference | null

  queueList : any = []

  constructor(
    private fb: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogref: MatDialogRef<ManageCohertsComponent>,
    private firestore: Firestore,
    private snackBar: MatSnackBar
  ) {

    this.queueList = this.data?.queueList ?? []
    for (let i = 0; i < this.data.totalParticipants.length; i++) {
      const profile = this.data.totalParticipants[i];
      this.mapProfile[profile.profileid] = profile;
    }

    this.cohortsForm = this.fb.group({
      docid: [null, Validators.required],
      name: [null, Validators.required],
      cohortCategory: ['studio', Validators.required],
      cohortType: ['general', Validators.required],
      participantidlist: [[]],
      createddate: [null, Validators.required],
      udpateddate: [null, Validators.required],
      marathonref: [null, Validators.required],
      eventref: [null],
      status: ['active', Validators.required],
      isTemporary: [false],
      startDate: [null],
      endDate: [null],
      level: [],
      enableGroupChat: [false],
      tags: [[]],
      mentors: [[]],
      team: [[]],
      bigactivity: [null],
      description: [''],
      queueref : [null]

    });

    // Load participant tags from data or fetch from collection
    if (this.data?.participantTagsList && this.data.participantTagsList.length > 0) {
      this.participantTagsList = this.data.participantTagsList;
      this.filteredTagsList = [...this.participantTagsList];
    } else {
      this.loadParticipantTags();
    }

    // Load mentors from profiles with mentor role
    this.loadMentors();
    
    // Load all profiles for Team dropdown
    this.loadTeam();

    // load Big Activity
    this.loadActivity();

    if (this.data != null && this.data != undefined) {
      if (this.data.type == "new") {
        const newDocId = doc(collection(this.firestore, "big cohorts")).id;
        const initialParticipants = this.data.selectedParticipants?.map((e: any) => e['profileid']) || [];
        this.selectedParticipants = [...initialParticipants];
        
        this.cohortsForm.patchValue({
          participantidlist: initialParticipants,
          docid: newDocId,
          createddate: new Date(),
          udpateddate: new Date(),
          marathonref: doc(collection(this.firestore, "big marathon"), this.data.selectedMarathon?.docid),
          bigactivity : this.data?.bigactivity ?? null,
          name : this.data?.cohortname ?? '',
          cohortType : this.data?.cohortType || 'general',
          eventref : this.data?.selectedEvent || null,
          queueref : this.data?.selectedQueue ?? null
        });
      }
      if (this.data.type == "edit") {
        // Store original participants for comparison on save
        this.originalParticipantIds = [...(this.data.doc['participantidlist'] || [])];
        this.selectedParticipants = [...(this.data.doc['participantidlist'] || [])];
        
        // Store original group chat enabled state
        this.originalGroupChatEnabled = this.data.doc['enableGroupChat'] === true;
        
        this.cohortsForm.patchValue({
          name: this.data.doc['name'],
          cohortCategory: this.data.doc['cohortCategory'] || 'studio',
          cohortType: this.data.doc['cohortType'] || 'general',
          participantidlist: this.data.doc['participantidlist'] || [],
          docid: this.data.doc['docid'],
          createddate: this.data.doc['createddate']?.toDate ? this.data.doc['createddate'].toDate() : this.data.doc['createddate'],
          udpateddate: new Date(),
          marathonref: this.data.doc['marathonref'],
          eventref: this.data.doc['eventref'],
          status: this.data.doc['status'] || 'active',
          isTemporary: this.data.doc['isTemporary'] || false,
          startDate: this.data.doc['startDate']?.toDate ? this.data.doc['startDate'].toDate() : this.data.doc['startDate'],
          endDate: this.data.doc['endDate']?.toDate ? this.data.doc['endDate'].toDate() : this.data.doc['endDate'],
          level: this.data.doc['level'] || 'level1',
          enableGroupChat: this.data.doc['enableGroupChat'] !== false,
          tags: this.data.doc['tags'] || [],
          mentors: this.data.doc['mentors'] || [],
          team: this.data.doc['team'] || [],
          bigactivity: this.data.doc['bigactivity'] || null,
          description: this.data.doc['description'] || null,
          queueref : this.data.doc['queueref']?.id || null
        });
        
        this.selectedTags = this.data.doc['tags'] || [];
        this.selectedMentors = this.data.doc['mentors'] || [];
        this.selectedTeam = this.data.doc['team'] || [];
      }
      // Show all participants by default (when no event is selected)
      this.filteredParticipants = this.data.totalParticipants || [];
      this.filteredParticipantsList = [...this.filteredParticipants];

      // If editing a cohort that has an eventref, re-filter participants by event
      if (this.data.doc && this.data.doc['eventref']) {
        this.onChangeEvent();
      }

      // Update existing participants list after setting filtered participants
      this.updateExistingParticipantsNotInList();
    }

    this.cohortsForm.get('cohortType')?.valueChanges.subscribe(value => {
      if (value === 'general') {
        this.cohortsForm.get('eventref')?.setValue(null);
        this.bigInvitationCount = 0;
        this.bigInvitationParticipants = [];
        // Reset to show all participants when switching to general
        this.filteredParticipants = this.data.totalParticipants || [];
        this.filteredParticipantsList = [...this.filteredParticipants];
        
        // Update existing participants - some may now be in the list
        this.updateExistingParticipantsNotInList();
      }
    });

    this.cohortsForm.get('isTemporary')?.valueChanges.subscribe(value => {
      if (!value) {
        this.cohortsForm.get('startDate')?.setValue(null);
        this.cohortsForm.get('endDate')?.setValue(null);
      }
    });
  }

  ngOnInit() {}

  loadActivity(){
    getDocs(query(collection(this.firestore, 'bigactivity'),orderBy('activity','asc'))).then((activity)=>{
      this.bigActivityList = activity.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
    })
  }

  clearActivity(){
    this.cohortsForm.controls['bigactivity'].setValue(null)
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

  // Load mentors from profiles that have mentor role in users_roles collection
  async loadMentors() {
    this.loadingMentors = true;

    try {
      const rolesQuery = query(collection(this.firestore, "users_roles"),where("mentor", "==", true));
      const rolesSnap = await getDocs(rolesQuery);

      const mentorProfileIds: string[] = [];
      rolesSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data['profile_ref'] && data['mentor'] == true) {
          // Extract profile ID from DocumentReference
          const profileId = typeof data['profile_ref'] === 'string' 
            ? data['profile_ref'] 
            : data['profile_ref'].id;
          if (profileId) {
            mentorProfileIds.push(profileId);
          }
        }
      });

      // Fetch actual profile data for mentors
      if (mentorProfileIds.length > 0) {
        const mentorProfiles: any[] = [];
        
        // Process in batches of 10 (Firestore 'in' query limit)
        const batchSize = 10;
        for (let i = 0; i < mentorProfileIds.length; i += batchSize) {
          const batch = mentorProfileIds.slice(i, i + batchSize);
          
          try {
            const profileQuery = query(
              collection(this.firestore, "profile_data"),
              where("profileid", "in", batch)
            );
            
            const profileSnap = await getDocs(profileQuery);
            
            profileSnap.docs.forEach(docSnap => {
              const profileData = docSnap.data();
              mentorProfiles.push({
                profileid: profileData['profileid'],
                name: profileData['name'] || profileData['displayName'] || profileData['email'] || 'Unknown',
                email: profileData['email'] || '',
                displayName: profileData['displayName'] || '',
                ...profileData
              });
            });
          } catch (error) {
            console.error('Error fetching mentor profiles for batch:', batch, error);
          }
        }
        
        this.mentorsList = mentorProfiles;
        this.filteredMentorsList = [...mentorProfiles];
      } else {
        this.mentorsList = [];
        this.filteredMentorsList = [];
      }

      console.log('Mentors loaded:', this.mentorsList.length);

    } catch (error) {
      console.error('Error loading mentors:', error);
      this.mentorsList = [];
      this.filteredMentorsList = [];
    } finally {
      this.loadingMentors = false;
    }
  }

  // Load all profiles from profile_data collection for Team dropdown
  async loadTeam() {
    this.loadingTeam = true;

    try {
      // Fetch all documents from profile_data collection
      const profileQuery = query(
        collection(this.firestore, "profile_data"),
        orderBy('name', 'asc')
      );
      
      const profileSnap = await getDocs(profileQuery);
      
      const teamProfiles: any[] = [];
      profileSnap.docs.forEach(docSnap => {
        const profileData = docSnap.data();
        teamProfiles.push({
          profileid: profileData['profileid'] || docSnap.id,
          name: profileData['name'] || profileData['displayName'] || profileData['email'] || 'Unknown',
          email: profileData['email'] || '',
          displayName: profileData['displayName'] || '',
          ...profileData
        });
      });
      
      this.teamsList = teamProfiles;
      this.filteredTeamList = [...teamProfiles];

      console.log('Team loaded:', this.teamsList.length);

    } catch (error) {
      console.error('Error loading team profiles:', error);
      this.teamsList = [];
      this.filteredTeamList = [];
    } finally {
      this.loadingTeam = false;
    }
  }

  // Mentor search filter
  onMentorSearch() {
    const searchQuery = this.mentorSearchQuery.toLowerCase().trim();
    if (!searchQuery) {
      this.filteredMentorsList = [...this.mentorsList];
    } else {
      this.filteredMentorsList = this.mentorsList.filter(mentor =>
        mentor['name']?.toLowerCase().includes(searchQuery) ||
        mentor['email']?.toLowerCase().includes(searchQuery) ||
        mentor['displayName']?.toLowerCase().includes(searchQuery)
      );
    }
  }

  // Toggle mentor selection
  toggleMentorSelection(profileId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    const index = this.selectedMentors.indexOf(profileId);
    if (index === -1) {
      this.selectedMentors.push(profileId);
    } else {
      this.selectedMentors.splice(index, 1);
    }
    this.cohortsForm.get('mentors')?.setValue([...this.selectedMentors]);
  }

  // Get mentor name by profile ID
  getMentorName(profileId: string): string {
    const mentor = this.mentorsList.find(m => m.profileid === profileId);
    return mentor?.name || mentor?.displayName || mentor?.email || profileId;
  }

  // Clear all selected mentors
  clearMentors(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.selectedMentors = [];
    this.cohortsForm.get('mentors')?.setValue([]);
    this.mentorDropdownOpen = false;
  }

  // Get display text for selected mentors
  getSelectedMentorsDisplay(): string {
    if (this.selectedMentors.length === 0) {
      return 'Select Mentors';
    }
    if (this.selectedMentors.length === 1) {
      return this.getMentorName(this.selectedMentors[0]);
    }
    return `${this.selectedMentors.length} mentors selected`;
  }

  // Check if mentor is selected
  isMentorSelected(profileId: string): boolean {
    return this.selectedMentors.includes(profileId);
  }


  // Team search filter
  onTeamSearch() {
    const searchQuery = this.teamSearchQuery.toLowerCase().trim();
    if (!searchQuery) {
      this.filteredTeamList = [...this.teamsList];
    } else {
      this.filteredTeamList = this.teamsList.filter(team =>
        team['name']?.toLowerCase().includes(searchQuery) ||
        team['email']?.toLowerCase().includes(searchQuery) ||
        team['displayName']?.toLowerCase().includes(searchQuery)
      );
    }
  }

  // Toggle team selection
  toggleTeamSelection(profileId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    const index = this.selectedTeam.indexOf(profileId);
    if (index === -1) {
      this.selectedTeam.push(profileId);
    } else {
      this.selectedTeam.splice(index, 1);
    }
    this.cohortsForm.get('team')?.setValue([...this.selectedTeam]);
  }

  // Get team member name by profile ID
  getTeamName(profileId: string): string {
    const team = this.teamsList.find(m => m.profileid === profileId);
    return team?.name || team?.displayName || team?.email || profileId;
  }

  // Clear all selected team members
  clearTeam(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.selectedTeam = [];
    this.cohortsForm.get('team')?.setValue([]);
    this.teamDropdownOpen = false;
  }

  // Get display text for selected team members
  getSelectedTeamDisplay(): string {
    if (this.selectedTeam.length === 0) {
      return 'Select Team';
    }
    if (this.selectedTeam.length === 1) {
      return this.getTeamName(this.selectedTeam[0]);
    }
    return `${this.selectedTeam.length} team members selected`;
  }

  // Check if team member is selected
  isTeamSelected(profileId: string): boolean {
    return this.selectedTeam.includes(profileId);
  }

  // Select all team members
  selectAllTeam(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.selectedTeam = this.filteredTeamList.map(t => t.profileid);
    this.cohortsForm.get('team')?.setValue([...this.selectedTeam]);
  }


  // Participant search filter
  onParticipantSearch() {
    const searchQuery = this.participantSearchQuery.toLowerCase().trim();
    if (!searchQuery) {
      this.filteredParticipantsList = [...this.filteredParticipants];
    } else {
      this.filteredParticipantsList = this.filteredParticipants.filter(participant =>
        participant['name']?.toLowerCase().includes(searchQuery) ||
        participant['email']?.toLowerCase().includes(searchQuery) ||
        participant['displayName']?.toLowerCase().includes(searchQuery)
      );
    }
  }

  // Toggle participant selection
  toggleParticipantSelection(profileId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    const index = this.selectedParticipants.indexOf(profileId);
    if (index === -1) {
      this.selectedParticipants.push(profileId);
    } else {
      this.selectedParticipants.splice(index, 1);
    }
    this.cohortsForm.get('participantidlist')?.setValue([...this.selectedParticipants]);
    
    // Update existing participants list
    this.updateExistingParticipantsNotInList();
  }

  // Get participant name by profile ID
  getParticipantName(profileId: string): string {
    const participant = this.filteredParticipants.find(p => p.profileid === profileId);
    if (participant) {
      return participant.name || participant.displayName || participant.email || profileId;
    }
    // Also check in mapProfile
    const profile = this.mapProfile[profileId];
    return profile?.name || profile?.displayName || profile?.email || profileId;
  }

  // Clear all selected participants
  clearParticipants(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.selectedParticipants = [];
    this.cohortsForm.get('participantidlist')?.setValue([]);
    this.participantDropdownOpen = false;
    
    // Clear existing participants list as well
    this.existingParticipantsNotInList = [];
  }

  // Get display text for selected participants
  getSelectedParticipantsDisplay(): string {
    if (this.selectedParticipants.length === 0) {
      return 'Select Participants';
    }
    if (this.selectedParticipants.length === 1) {
      return this.getParticipantName(this.selectedParticipants[0]);
    }
    return `${this.selectedParticipants.length} participants selected`;
  }

  // Check if participant is selected
  isParticipantSelected(profileId: string): boolean {
    return this.selectedParticipants.includes(profileId);
  }

  // ============ EXISTING PARTICIPANTS MANAGEMENT ============
  
  // Update the list of existing participants that are not in the current filtered list
  updateExistingParticipantsNotInList() {
    const filteredProfileIds = this.filteredParticipants.map(p => p.profileid);
    
    // Find selected participants that are NOT in the current filtered list
    const existingIds = this.selectedParticipants.filter(id => !filteredProfileIds.includes(id));
    
    // Build the existing participants array with profile data
    this.existingParticipantsNotInList = existingIds.map(profileId => {
      const profile = this.mapProfile[profileId];
      return {
        profileid: profileId,
        name: profile?.name || profile?.displayName || profile?.email || 'Unknown',
        email: profile?.email || '',
        displayName: profile?.displayName || ''
      };
    });
    
    console.log('Existing participants not in current list:', this.existingParticipantsNotInList.length);
  }
  
  // Remove an existing participant from the selection
  removeExistingParticipant(profileId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    // Remove from selectedParticipants
    const index = this.selectedParticipants.indexOf(profileId);
    if (index !== -1) {
      this.selectedParticipants.splice(index, 1);
      this.cohortsForm.get('participantidlist')?.setValue([...this.selectedParticipants]);
    }
    
    // Remove from existingParticipantsNotInList
    const existingIndex = this.existingParticipantsNotInList.findIndex(p => p.profileid === profileId);
    if (existingIndex !== -1) {
      this.existingParticipantsNotInList.splice(existingIndex, 1);
    }
  }
  
  // Clear all existing participants that are not in the current list
  clearExistingParticipants(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    // Remove all existing participants from selectedParticipants
    const existingIds = this.existingParticipantsNotInList.map(p => p.profileid);
    this.selectedParticipants = this.selectedParticipants.filter(id => !existingIds.includes(id));
    this.cohortsForm.get('participantidlist')?.setValue([...this.selectedParticipants]);
    
    // Clear the existing list
    this.existingParticipantsNotInList = [];
  }
  
  // Get the count of participants in current list (not existing)
  getParticipantsInListCount(): number {
    const filteredProfileIds = this.filteredParticipants.map(p => p.profileid);
    return this.selectedParticipants.filter(id => filteredProfileIds.includes(id)).length;
  }

  // ============ END EXISTING PARTICIPANTS MANAGEMENT ============

  // ============ EXCEL IMPORT FOR PARTICIPANTS ============

  triggerParticipantExcelImport() {
    this.participantExcelInput?.nativeElement?.click();
  }

  async importParticipantsFromExcel(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isImportingParticipants = true;
    this.participantImportResults = null;

    try {
      const data = await this.readExcelFile(file);
      const emails = this.extractEmailsFromExcel(data);
      
      if (emails.length === 0) {
        this.snackBar.open('No emails found in the Excel file. Make sure there is an "email" column.', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.isImportingParticipants = false;
        input.value = '';
        return;
      }

      const { matchedIds, notFoundEmails } = this.matchEmailsToParticipants(emails);
      
      // Add matched participants to the selection
      const newParticipants = [...new Set([...this.selectedParticipants, ...matchedIds])];
      this.selectedParticipants = newParticipants;
      this.cohortsForm.get('participantidlist')?.setValue([...this.selectedParticipants]);
      
      // Update existing participants list
      this.updateExistingParticipantsNotInList();
      
      this.participantImportResults = {
        matched: matchedIds.length,
        notFound: notFoundEmails
      };

      const message = notFoundEmails.length > 0
        ? `Imported ${matchedIds.length} participants. ${notFoundEmails.length} emails not found.`
        : `Successfully imported ${matchedIds.length} participants!`;
      
      this.snackBar.open(message, 'Close', {
        duration: 5000,
        panelClass: notFoundEmails.length > 0 ? ['warning-snackbar'] : ['success-snackbar']
      });

    } catch (error) {
      console.error('Error importing Excel:', error);
      this.snackBar.open('Error reading Excel file. Please check the file format.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isImportingParticipants = false;
      input.value = '';
    }
  }

  readExcelFile(file: File): Promise<any[][]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          resolve(jsonData as any[][]);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  extractEmailsFromExcel(data: any[][]): string[] {
    if (data.length === 0) return [];

    const headers = data[0].map((h: any) => String(h).toLowerCase().trim());
    const emailColumnIndex = headers.findIndex((h: string) => 
      h === 'email' || h === 'e-mail' || h === 'mail' || h === 'emailid' || h === 'email id' || h === 'email_id'
    );

    if (emailColumnIndex === -1) {
      // Try to find column with @ symbol in first data row
      if (data.length > 1) {
        const firstDataRow = data[1];
        const possibleEmailCol = firstDataRow.findIndex((cell: any) => 
          String(cell).includes('@')
        );
        if (possibleEmailCol !== -1) {
          return data.slice(1)
            .map(row => String(row[possibleEmailCol] || '').toLowerCase().trim())
            .filter(email => email && email.includes('@'));
        }
      }
      return [];
    }

    return data.slice(1)
      .map(row => String(row[emailColumnIndex] || '').toLowerCase().trim())
      .filter(email => email && email.includes('@'));
  }

  matchEmailsToParticipants(emails: string[]): { matchedIds: string[]; notFoundEmails: string[] } {
    const matchedIds: string[] = [];
    const notFoundEmails: string[] = [];

    // Build email to profileid lookup from ALL profiles (mapProfile), not just filtered
    const emailToProfileId: Map<string, string> = new Map();
    
    // Use mapProfile which contains all participants
    for (const profileId of Object.keys(this.mapProfile)) {
      const profile = this.mapProfile[profileId];
      if (profile?.email) {
        emailToProfileId.set(profile.email.toLowerCase().trim(), profileId);
      }
    }

    for (const email of emails) {
      const normalizedEmail = email.toLowerCase().trim();
      
      if (emailToProfileId.has(normalizedEmail)) {
        const profileId = emailToProfileId.get(normalizedEmail)!;
        matchedIds.push(profileId);
      } else {
        notFoundEmails.push(email);
      }
    }

    return { 
      matchedIds: [...new Set(matchedIds)],
      notFoundEmails 
    };
  }

  downloadParticipantTemplate() {
    const templateData = [
      ['email'],
      ['participant@example.com'],
      ['user@domain.com']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    
    ws['!cols'] = [{ wch: 30 }];
    
    XLSX.writeFile(wb, 'cohort_participants_template.xlsx');
  }

  clearParticipantImportResults() {
    this.participantImportResults = null;
  }

  // ============ END EXCEL IMPORT ============

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

  toggleTagSelection(tagId: string) {
    const index = this.selectedTags.indexOf(tagId);
    if (index === -1) {
      this.selectedTags.push(tagId);
    } else {
      this.selectedTags.splice(index, 1);
    }
    this.cohortsForm.get('tags')?.setValue([...this.selectedTags]);
  }

  getTagName(tagId: string): string {
    const tag = this.participantTagsList.find(t => t.id === tagId);
    return tag?.name || tag?.tagname || tagId;
  }

  clearTags() {
    this.selectedTags = [];
    this.cohortsForm.get('tags')?.setValue([]);
    this.tagDropdownOpen = false;
  }

  getSelectedTagsDisplay(): string {
    if (this.selectedTags.length === 0) {
      return 'Select Tags';
    }
    if (this.selectedTags.length === 1) {
      return this.getTagName(this.selectedTags[0]);
    }
    return `${this.selectedTags.length} tags selected`;
  }

  onCancel() {
    this.dialogref.close();
  }

  compareFn(a: any, b: any) {
    return a?.id === b?.id;
  }

  // Fetch participants from 'event participation request' when event is selected
  async onChangeEvent() {
    const eventRef = this.cohortsForm.get("eventref")?.value;
    console.log('selected event : ' , eventRef.id)
    
    // DON'T reset participants when event changes - keep the selection
    // this.selectedParticipants = [];
    // this.cohortsForm.get('participantidlist')?.setValue([]);
    this.participantSearchQuery = '';
    this.participantImportResults = null;
    
    if (eventRef != null && eventRef != undefined) {
      this.loadingInvitations = true;
      
      try {
        const participationQuery = query(collection(this.firestore, "event participation request"),where("eventref", "==", eventRef),where("status", "in", ['attended','approved']));
        const cohortQuery = query(collection(this.firestore , "big cohorts"), where("eventref", "==", eventRef));
        const assignedParticipantIds = new Set<string>(); 
        const approvedParticipant = new Set();
        
        const [participationSnap , cohortsSnap] = await Promise.all([getDocs(participationQuery) , getDocs(cohortQuery)]);
        cohortsSnap.docs.forEach((cohortDoc)=>{
          const cohort = cohortDoc.data();
          // console.log(cohort['participantidlist'])
          (cohort['participantidlist'] || []).forEach((id: string) => {
          assignedParticipantIds.add(id);
        });
          
        })

        participationSnap.docs.forEach(docSnap => {
          const data: any = docSnap.data();
          if(data['profileid'] != null && !assignedParticipantIds.has(data['profileid']) && !approvedParticipant.has(data['profileid'])){
            approvedParticipant.add({
              id: docSnap.id,
              name: this.mapProfile[data['profileid']]?.['name'] || 'unknown',
              profileid: data['profileid'],
              ...data
            });
          }
        })
        
        this.bigInvitationParticipants = Array.from(approvedParticipant.values());
        // Extract participant IDs from event participation request
        const approvedParticipantIds = Array.from(approvedParticipant.values());
        
        this.bigInvitationCount = approvedParticipantIds.length;
        
        console.log(approvedParticipantIds);
        console.log(this.data.totalParticipants);
        
        this.filteredParticipants = approvedParticipantIds;
        console.log(this.filteredParticipants);
        
        this.filteredParticipantsList = [...this.filteredParticipants];
        console.log('Filtered participants with names:', this.filteredParticipants.length);
        
        // Update existing participants list - previously selected ones not in new event list
        this.updateExistingParticipantsNotInList();
        
        console.log('Approved participants from event participation request:', approvedParticipantIds);
        
      } catch (error) {
        console.error('Error fetching event participation request:', error);
        this.bigInvitationCount = 0;
        this.bigInvitationParticipants = [];
        this.filteredParticipants = this.data.totalParticipants || [];
        this.filteredParticipantsList = [...this.filteredParticipants];
        this.updateExistingParticipantsNotInList();
      } finally {
        this.loadingInvitations = false;
      }
      
    } else {
      // Reset when no event selected - show all participants
      this.bigInvitationCount = 0;
      this.bigInvitationParticipants = [];
      this.filteredParticipants = this.data.totalParticipants || [];
      this.filteredParticipantsList = [...this.filteredParticipants];
      this.updateExistingParticipantsNotInList();
    }
  }

  // Fetch participant profiles directly if totalParticipants not available
  async fetchParticipantProfiles(profileIds: string[]) {
    const profiles: any[] = [];
    
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
          profiles.push({
            profileid: data['profileid'],
            name: data['name'] || data['displayName'] || data['email'] || 'Unknown',
            email: data['email'] || '',
            ...data
          });
        });
      } catch (error) {
        console.error('Error fetching participant profiles for batch:', batch, error);
      }
    }
    
    this.filteredParticipants = profiles;
    this.filteredParticipantsList = [...profiles];

    console.log('Fetched participant profiles:', profiles.length);
  }

  // Get count of currently selected participants (total including existing)
  getSelectedParticipantCount(): number {
    return this.selectedParticipants.length;
  }

  // Check if group chat checkbox should be disabled (already enabled in edit mode)
  isGroupChatDisabled(): boolean {
    return this.isEditMode() && this.originalGroupChatEnabled;
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

  // Create support chat document using the same cohort docid
  async createSupportChat(cohortData: any) {
    // Use the same document ID as the cohort
    const supportChatDocId = cohortData['docid'];
    const supportChatRef = doc(this.firestore, "supportchat", supportChatDocId);
    const loggedInUid = await this.getUidsFromProfileIds([this.data?.loggedInProfile?.profileid]) || null;
    
    // Convert participant profile IDs to UIDs
    const participantProfileIds = cohortData['participantidlist'] || [];
    const participantUids = await this.getUidsFromProfileIds(participantProfileIds);
    
    // Convert mentor profile IDs to UIDs
    const mentorProfileIds = cohortData['mentors'] || [];
    const mentorUids = await this.getUidsFromProfileIds(mentorProfileIds);
    
    // Convert team profile IDs to UIDs
    const teamProfileIds = cohortData['team'] || [];
    const teamUids = await this.getUidsFromProfileIds(teamProfileIds);
    
    // Combine participant, mentor, and team UIDs (remove duplicates)
    const allMemberUids = Array.from(new Set([...participantUids, ...mentorUids, ...teamUids]));
    
    const supportChatData = {
      created_on: new Date(),
      creator_uid: loggedInUid[0],
      group_name: cohortData['name'],
      group_profile: this.GROUP_PROFILE_URL,
      isdelete: false,
      id: supportChatDocId,
      last_modification: new Date(),
      members: allMemberUids,
      type:'group'
    };

    try {
      await setDoc(supportChatRef, supportChatData);
      console.log('Support chat created with cohort ID:', supportChatDocId, 'Members (UIDs):', allMemberUids.length, '(Participants:', participantUids.length, ', Mentors:', mentorUids.length, ', Team:', teamUids.length, ')');
      // return supportChatDocId;
      return supportChatRef; 
    } catch (error) {
      console.error('Error creating support chat:', error);
      return null;
    }
  }

  // Update existing support chat members (replace with selected participants, mentors, and team as UIDs)
  async updateSupportChatMembers(cohortData: any) {
    const supportChatDocId = cohortData['docid'];
    const supportChatRef = doc(this.firestore, "supportchat", supportChatDocId);
    
    try {
      // Convert selected participant profile IDs to UIDs
      const selectedParticipantProfileIds: string[] = cohortData['participantidlist'] || [];
      const participantUids = await this.getUidsFromProfileIds(selectedParticipantProfileIds);
      
      // Convert selected mentor profile IDs to UIDs
      const selectedMentorProfileIds: string[] = cohortData['mentors'] || [];
      const mentorUids = await this.getUidsFromProfileIds(selectedMentorProfileIds);
      
      // Convert selected team profile IDs to UIDs
      const selectedTeamProfileIds: string[] = cohortData['team'] || [];
      const teamUids = await this.getUidsFromProfileIds(selectedTeamProfileIds);
      
      // Combine participant, mentor, and team UIDs (remove duplicates)
      const allMemberUids = Array.from(new Set([...participantUids, ...mentorUids, ...teamUids]));
      
      // Get existing support chat document
      const supportChatRef = doc(this.firestore, "supportchat", supportChatDocId);
      const supportChatSnap = await getDoc(supportChatRef);
      
      if (supportChatSnap.exists()) {
        // Update the support chat with new members list (replace, not merge)
        await updateDoc(supportChatRef, {
          members: allMemberUids,
          group_name: cohortData['name'],
          last_modification: new Date(),
          type:'group'
        });
        
        console.log('Support chat members replaced. Total members:', allMemberUids.length, '(Participants:', participantUids.length, ', Mentors:', mentorUids.length, ', Team:', teamUids.length, ')');
        // return supportChatDocId;
        return supportChatRef;
      } else {
        // Support chat doesn't exist, create it
        console.log('Support chat not found, creating new one');
        return await this.createSupportChat(cohortData);
      }
    } catch (error) {
      console.error('Error updating support chat members:', error);
      return null;
    }
  }

  // Create log entries for all participants when cohort is created
  async createCohortLogs(cohortData: any, status: string = 'added') {
    const participants = cohortData['participantidlist'] || [];
    const loggedInProfileId = this.data?.loggedInProfile?.profileid || this.data?.loggedInProfile?.uid || '';
    
    const logPromises = participants.map(async (participantId: string) => {
      const logDocId = doc(collection(this.firestore, "big cohorts log")).id;
      
      const logData = {
        docid: logDocId,
        createddate: new Date(),
        profileid: participantId,
        cohortid: cohortData['docid'],
        cohortname: cohortData['name'],
        bigactivity: cohortData['cohortCategory'] == 'studio' ? cohortData['bigactivity'] : null,
        eventref: cohortData['eventref'] || null,
        addedby: loggedInProfileId,
        addeddate: new Date(),
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
      console.log(`Created ${participants.length} log entries for cohort:`, cohortData['docid']);
    } catch (error) {
      console.error('Error creating cohort logs:', error);
    }
  }

  // Calculate participant changes between original and current selection
  getParticipantChanges(currentParticipants: string[]): { added: string[], removed: string[] } {
    const added = currentParticipants.filter(id => !this.originalParticipantIds.includes(id));
    const removed = this.originalParticipantIds.filter(id => !currentParticipants.includes(id));
    return { added, removed };
  }

  // Create log entries for specific participants with given status
  async createLogsForParticipants(cohortData: any, participantIds: string[], status: 'added' | 'removed') {
    if (participantIds.length === 0) return;
    
    const loggedInProfileId = this.data?.loggedInProfile?.profileid || this.data?.loggedInProfile?.uid || '';
    
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

  async onSubmit() {
    const formValue = this.cohortsForm.value;
    
    // Check if no event is selected (for both general and event cohort types)
    if (!formValue['eventref']) {
      const proceedWithoutEvent = confirm(
        "You are creating a cohort without an event.\n\nAre you sure you want to continue?"
      );
      
      if (!proceedWithoutEvent) {
        return; // User wants to go back and select an event
      }
    }
    
    try {

      const check = confirm('Are you sure want to update cohort');

      if(check){
        // participantidlist already contains all selected participants (including existing ones)
        // The selectedParticipants array includes both dropdown selections and existing participants
        formValue['queueref'] = ![null , undefined , ''].includes( formValue['queueref']) ? doc(this.firestore , 'queue generation'  , formValue['queueref']) : null;
        // Save cohort document
        await setDoc(doc(this.firestore, "big cohorts", formValue['docid']), formValue, { merge: true });
        
        if (this.data.type === 'new') {
          // Create logs for all participants when cohort is NEW
          await this.createCohortLogs(formValue, 'added');
        } else if (this.data.type === 'edit') {
          // For edit mode: only create logs for changed participants
          const currentParticipants = formValue['participantidlist'] || [];
          const { added, removed } = this.getParticipantChanges(currentParticipants);
          
          // Create logs for newly added participants
          if (added.length > 0) {
            await this.createLogsForParticipants(formValue, added, 'added');
            console.log('Added participants:', added);
          }
          
          // Create logs for removed participants
          if (removed.length > 0) {
            await this.createLogsForParticipants(formValue, removed, 'removed');
            console.log('Removed participants:', removed);
          }
        }
        
        // Handle group chat - create or update based on enableGroupChat
        if (formValue['enableGroupChat']) {
          const supportChatRef = await this.updateSupportChatMembers(formValue);

          if (supportChatRef) {
            await updateDoc(
              doc(this.firestore, "big cohorts", formValue['docid']),
              {
                chatref: supportChatRef
              }
            );
          }
          // updateSupportChatMembers will create if not exists, or update if exists
          // await this.updateSupportChatMembers(formValue);
        }
      }
      
      
      this.dialogref.close(formValue);
    } catch (error) {
      console.error('Error saving cohort:', error);
      alert('Error saving cohort. Please try again.');
    }
  }

  isEditMode(): boolean {
    return this.data?.type === 'edit';
  }

  getDialogTitle(): string {
    return this.isEditMode() ? 'Edit Cohort' : 'Create New Cohort';
  }

  getSubmitButtonText(): string {
    return this.isEditMode() ? 'Update Cohort' : 'Create Cohort';
  }

  isEventType(): boolean {
    return this.cohortsForm.get('cohortType')?.value === 'event';
  }

  // Add after toggleMentorSelection method
  selectAllMentors(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.selectedMentors = this.filteredMentorsList.map(m => m.profileid);
    this.cohortsForm.get('mentors')?.setValue([...this.selectedMentors]);
  }

  isAllMentorsSelected(): boolean {
    return this.filteredMentorsList.length > 0 &&
      this.filteredMentorsList.every(m => this.selectedMentors.includes(m.profileid));
  }

  // Add after toggleParticipantSelection method
  selectAllParticipants(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    // Select all from current filtered list
    const filteredIds = this.filteredParticipantsList.map(p => p.profileid);
    // Merge with existing selections (keep existing participants that are not in current list)
    const existingIds = this.existingParticipantsNotInList.map(p => p.profileid);
    this.selectedParticipants = [...new Set([...filteredIds, ...existingIds])];
    this.cohortsForm.get('participantidlist')?.setValue([...this.selectedParticipants]);
  }

  isAllParticipantsSelected(): boolean {
    return this.filteredParticipantsList.length > 0 &&
      this.filteredParticipantsList.every(p => this.selectedParticipants.includes(p.profileid));
  }

  isAllTeamSelected(): boolean {
    return this.filteredTeamList.length > 0 &&
      this.filteredTeamList.every(m => this.selectedTeam.includes(m.profileid));
  }

  check(participantId){
    return !this.existingParticipantsNotInList.some(p => p.profileid === participantId)
  }
  
}