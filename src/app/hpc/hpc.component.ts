import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Firestore, deleteDoc, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { ActivatedRoute } from '@angular/router';
import { AuthguardService } from '../authguard.service';
import { FormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { collection, query, orderBy, limit, getDocs } from '@angular/fire/firestore';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { ReducePipe } from './filter.pipe';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FormControl } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProfilePictureComponent } from '../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-hpc',
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSortModule,
    MatTabsModule,
    DragDropModule,
    MatSelectModule,
    MatOptionModule,
    FormsModule,
    MatChipsModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatBadgeModule,
    ReducePipe,
    NgxMatSelectSearchModule,
    ReactiveFormsModule,
    MatTooltipModule,
    ProfilePictureComponent
  ],
  templateUrl: './hpc.component.html',
  styleUrl: './hpc.component.css'
})
export class HPCComponent implements OnInit {
  names: { id: string, name: string }[] = [];
  filteredNames: { id: string, name: string }[] = [];
  selectedProfilesGroup: string[] = [];
  selectedProfilesToAllow : string[] = [];
  adminsallowed : string[] = [];
  accelerators: string[] = [];
  newAccelerator: string = "";
  allHpcData: any[] = [];
  filteredHpcData: any[] = [];
  isLoadingHpc: boolean = false;
  selectedHpcView: string = 'all';
  loggedinProfile: string = null;
  expandedCards: { [key: string]: boolean } = {};
  // profileNameMap: { [id: string]: string } = {};
  isLoadingProfiles: boolean = true;
  profileFilterCtrl = new FormControl('');

  isPanelOpen: boolean = false;
  panelTitle: string = '';
  panelData: { name: string; count: number; profileId: string }[] = [];
  panelType: string = '';
  allExpanded: boolean = false;
  loggedinProfileData = {}
  allowtoview = false;
  notificationTitle: string = "";
  notificationDescription: string = "";
  notificationTitleGroup: string = "";
  notificationDescriptionGroup: string = "";
  contrastFramePrompt: string = '';
  loggedInProfileId:any
  hpcadmin =[];


  mapProfile = {};
  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private guard: AuthguardService,
  ) {
    this.guard.getRoles().then(async roles=>{
      this.loggedInProfileId = roles['profile_ref'].id
    })
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
      this.names = Object.keys(this.mapProfile).map(key => ({
        id: key,
        name: this.mapProfile[key]
      }));
      this.names.sort((a, b) => a.name.localeCompare(b.name));
      this.filteredNames = this.names;
    })
    guard.getRoles().then(roles => {
      this.loggedinProfileData = roles;
      this.checkAllowToView(); 
    });    
  }
  checkAllowToView() {
    const profileId = this.loggedinProfileData["profile_ref"]?.id || '';
    this.allowtoview = this.adminsallowed.includes(profileId);
    console.log(this.adminsallowed,"adminsallowed");
    console.log(this.selectedProfilesGroup,"selectedgoruppppp");
    console.log(this.allowtoview,"printinh allowtoview",this.loggedinProfileData["profile_ref"]?.id);
  }

  async ngOnInit() {
    this.profileFilterCtrl.valueChanges.subscribe(() => {
      this.filterProfiles();
    });
    await this.loadData();
    await this.loadAllHpc();
  }
  filterProfiles(){
    const search = this.profileFilterCtrl.value?.toLowerCase() || '';
    this.filteredNames = this.names.filter(i => i.name.toLowerCase().includes(search));
  }
  async loadAllHpc() {
    this.isLoadingHpc = true;
    try {
      const colRef = collection(this.firestore, "3minuteshpc");
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);

      this.allHpcData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          formattedCreatedAt: this.formatTimestamp(data['createdAt']),
          formattedCompletedAt: data['completedAt'] ? this.formatTimestamp(data['completedAt']) : null,
          profileName: this.mapProfile[data['profileid']] || data['profileid'],
          personsKeys: data['persons'] ? Object.keys(data['persons']) : []
        };
      });

      this.updateFilteredHpcData();

      console.log(`Loaded ${this.allHpcData.length} HPC documents`);
    } catch (error) {
      console.error("Error fetching HPC data:", error);
      this.snackBar.open("Error loading HPC data!", "Close", { duration: 3000 });
    } finally {
      this.isLoadingHpc = false;
    }
  }

  onHpcViewChange() {
    this.updateFilteredHpcData();
  }

  formatTimestamp(timestamp: any): string {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleString('en-IN', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  }

  async loadData() {
    this.isLoadingProfiles = true;
    try {
      const promptRef = doc(this.firestore, 'classify', '3minuteshpc');
      const promptSnap = await getDoc(promptRef);

      if (promptSnap.exists()) {
        this.hpcadmin = promptSnap.data()['admins'] || [];
        this.contrastFramePrompt = promptSnap.data()['prompt'] || '';
      }

      const accRef = doc(this.firestore, "static meta data", "Accelerator");
      const accDoc = await getDoc(accRef);
      if (accDoc.exists()) {
        this.accelerators = accDoc.data()['accelerators'] || [];
      }
      const hpcRef = doc(this.firestore, "static meta data", "HPC Config");
      const hpcDoc = await getDoc(hpcRef);
      if (hpcDoc.exists()) {
        const data = hpcDoc.data();
        this.selectedProfilesGroup = data['multipleprofiles'] || [];
        this.selectedProfilesToAllow = data['accessfor'] || [];
        this.adminsallowed = data['admins'] || [];
        if (data['notificationindividual']) {
          this.notificationTitle = data['notificationindividual'].title || "";
          this.notificationDescription = data['notificationindividual'].description || "";
        }
        if (data['notificationgroup']) {
          this.notificationTitleGroup = data['notificationgroup'].title || "";
          this.notificationDescriptionGroup = data['notificationgroup'].description || "";
        }
      }

      this.checkAllowToView();
    } catch (err) {
      console.error("Error loading data:", err);
      this.snackBar.open("Error loading data!", "Close", { duration: 2000 });
    } finally {
      this.isLoadingProfiles = false;
    }
  }

  async saveContrastPrompt() {
    try {
      const ref = doc(this.firestore, 'classify', '3minuteshpc');

      await updateDoc(ref, {
        prompt: this.contrastFramePrompt
      });

      this.snackBar.open('Prompt saved!', 'Close', { duration: 2000 });
    } catch (err) {
      console.error(err);
      this.snackBar.open('Failed to save prompt!', 'Close', { duration: 2000 });
    }
  }

  removeProfile(profileId: string) {
    this.selectedProfilesGroup = this.selectedProfilesGroup.filter(id => id !== profileId);
    this.saveProfiles();
  }

  removeProfileToAllow(profileId: string) {
    this.selectedProfilesToAllow = this.selectedProfilesToAllow.filter(id => id !== profileId);
    this.saveProfiles();
  }

  async saveProfiles() {
    try {
      const ref = doc(this.firestore, "static meta data", "HPC Config");
      await updateDoc(ref, { 
        multipleprofiles: this.selectedProfilesGroup,
        accessfor: this.selectedProfilesToAllow,
        notificationindividual: {
          title: this.notificationTitle,
          description: this.notificationDescription
        },
        notificationgroup: {
          title: this.notificationTitleGroup,
          description: this.notificationDescriptionGroup
        }
      });
      this.snackBar.open("Users updated!", "Close", { duration: 2000 });
    } catch (err) {
      console.error("Error saving profiles:", err);
      this.snackBar.open("Error saving!", "Close", { duration: 2000 });
    }
  }

  async addAccelerator() {
    if (!this.newAccelerator.trim()) return;

    if (this.accelerators.includes(this.newAccelerator.trim())) {
      this.snackBar.open("Accelerator already exists!", "Close", { duration: 2000 });
      return;
    }

    this.accelerators.push(this.newAccelerator.trim());
    const ref = doc(this.firestore, "static meta data", "Accelerator");
    await updateDoc(ref, { accelerators: this.accelerators });
    this.snackBar.open("Accelerator added!", "Close", { duration: 2000 });
    this.newAccelerator = "";
  }

  confirmRemove(item: string) {
    if (confirm(`Are you sure you want to delete "${item}"?`)) {
      this.removeAccelerator(item);
    }
  }

  async removeAccelerator(item: string) {
    this.accelerators = this.accelerators.filter(a => a !== item);
    const ref = doc(this.firestore, "static meta data", "Accelerator");
    await updateDoc(ref, { accelerators: this.accelerators });
    this.snackBar.open("Accelerator removed!", "Close", { duration: 2000 });
  }

  toggleCard(cardId: string): void {
    this.expandedCards[cardId] = !this.expandedCards[cardId];
  }


  searchText: string = '';
  sortOrder: string = 'desc'; 
  typeFilter: string = 'all'; 
  get groupCount(): number {
    return this.allHpcData.filter(h => h.multiple === true).length;
  }

  get individualCount(): number {
    return this.allHpcData.filter(h => !h.multiple).length;
  }

  get totalPersonsInGroups(): number {
    let count = 0;
    this.allHpcData
      .filter(h => h.multiple === true)
      .forEach(h => {
        if (h.persons) {
          Object.keys(h.persons).forEach(key => {
            const personName = h.persons[key]?.personName;
            if (personName && !personName.toLowerCase().startsWith('person')) {
              count++;
            }
          });
        }
      });
    return count;
  }


  get overallParticipants(): number {
    return this.totalPersonsInGroups + this.individualCount;
  }

  get completedCount(): number {
    return this.allHpcData.filter(h => h.status === 'completed').length;
  }

  get inProgressCount(): number {
    return this.allHpcData.filter(h => h.status !== 'completed').length;
  }
  updateFilteredHpcData() {
    let data = [...this.allHpcData];
    if (this.selectedHpcView === 'completed') {
      data = data.filter(hpc => hpc.status === 'completed');
    } else if (this.selectedHpcView === 'in-progress') {
      data = data.filter(hpc => hpc.status !== 'completed');
    }
    if (this.typeFilter === 'group') {
      data = data.filter(hpc => hpc.multiple === true);
    } else if (this.typeFilter === 'individual') {
      data = data.filter(hpc => !hpc.multiple);
    }
    if (this.searchText.trim()) {
      const search = this.searchText.toLowerCase();
      data = data.filter(hpc => {
        if (hpc.id?.toLowerCase().includes(search)) return true;
        if (hpc.profileName?.toLowerCase().includes(search)) return true;
        if (hpc.achievementfrom?.toLowerCase().includes(search)) return true;
        if (hpc.multiple && hpc.persons) {
          for (const key of Object.keys(hpc.persons)) {
            const person = hpc.persons[key];
            if (person.personName?.toLowerCase().includes(search)) return true;
            if (this.mapProfile[key]?.toLowerCase().includes(search)) return true;
            if (person.chatgptgeneratedtitleedited?.toLowerCase().includes(search)) return true;
          }
        }

        return false;
      });
    }

    data.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return this.sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    this.filteredHpcData = data;
  }

  onFilterChange() {
    this.updateFilteredHpcData();
  }
  get totalPersonsInGroupsCompleted(): number {
    let count = 0;
    this.allHpcData
      .filter(h => h.multiple === true && h.status === 'completed')
      .forEach(h => {
        if (h.persons) {
          Object.keys(h.persons).forEach(key => {
            const personName = h.persons[key]?.personName;
            if (personName && !personName.toLowerCase().startsWith('person')) {
              count++;
            }
          });
        }
      });
    return count;
  }

  get totalPersonsInGroupsInProgress(): number {
    let count = 0;
    this.allHpcData
      .filter(h => h.multiple === true && h.status !== 'completed')
      .forEach(h => {
        if (h.persons) {
          Object.keys(h.persons).forEach(key => {
            const personName = h.persons[key]?.personName;
            if (personName && !personName.toLowerCase().startsWith('person')) {
              count++;
            }
          });
        }
      });
    return count;
  }

  get individualCompletedCount(): number {
    return this.allHpcData.filter(h => !h.multiple && h.status === 'completed').length;
  }

  get individualInProgressCount(): number {
    return this.allHpcData.filter(h => !h.multiple && h.status !== 'completed').length;
  }

  get overallParticipantsCompleted(): number {
    return this.totalPersonsInGroupsCompleted + this.individualCompletedCount;
  }

  get overallParticipantsInProgress(): number {
    return this.totalPersonsInGroupsInProgress + this.individualInProgressCount;
  }

  openStatPanel(type: string) {
    this.panelType = type;
    this.panelData = [];

    switch (type) {
      case 'total':
        this.panelTitle = 'All Sessions';
        this.panelData = this.getSessionProfiles(this.allHpcData);
        break;
      case 'completed':
        this.panelTitle = 'Completed Sessions';
        this.panelData = this.getSessionProfiles(this.allHpcData.filter(h => h.status === 'completed'));
        break;
      case 'in-progress':
        this.panelTitle = 'In Progress Sessions';
        this.panelData = this.getSessionProfiles(this.allHpcData.filter(h => h.status !== 'completed'));
        break;
      case 'group':
        this.panelTitle = 'Group Sessions - Profiles';
        this.panelData = this.getGroupProfiles(this.allHpcData.filter(h => h.multiple === true));
        break;
      case 'individual':
        this.panelTitle = 'Individual Sessions';
        this.panelData = this.getSessionProfiles(this.allHpcData.filter(h => !h.multiple));
        break;
      case 'group-persons':
        this.panelTitle = 'All Persons in Groups';
        this.panelData = this.getPersonsInGroups(this.allHpcData.filter(h => h.multiple === true));
        break;
      case 'group-persons-completed':
        this.panelTitle = 'Group Persons (Completed)';
        this.panelData = this.getPersonsInGroups(this.allHpcData.filter(h => h.multiple === true && h.status === 'completed'));
        break;
      case 'group-persons-inprogress':
        this.panelTitle = 'Group Persons (In Progress)';
        this.panelData = this.getPersonsInGroups(this.allHpcData.filter(h => h.multiple === true && h.status !== 'completed'));
        break;
      case 'total-participants':
        this.panelTitle = 'Total Participants';
        this.panelData = this.getAllParticipantsList(this.allHpcData);
        break;
      case 'participants-completed':
        this.panelTitle = 'Participants (Completed)';
        this.panelData = this.getAllParticipantsList(this.allHpcData.filter(h => h.status === 'completed'));
        break;
      case 'participants-inprogress':
        this.panelTitle = 'Participants (In Progress)';
        this.panelData = this.getAllParticipantsList(this.allHpcData.filter(h => h.status !== 'completed'));
        break;
    }

    this.panelData.sort((a, b) => b.count - a.count);
    this.isPanelOpen = true;
  }

  getSessionProfiles(data: any[]): { name: string; count: number; profileId: string }[] {
    const countMap: { [key: string]: number } = {};
    
    data.forEach(hpc => {
      const profileId = hpc.profileid;
      if (profileId) {
        countMap[profileId] = (countMap[profileId] || 0) + 1;
      }
    });

    return Object.keys(countMap).map(id => ({
      profileId: id,
      name: this.mapProfile[id] || id,
      count: countMap[id]
    }));
  }

  getGroupProfiles(data: any[]): { name: string; count: number; profileId: string }[] {
    const countMap: { [key: string]: number } = {};

    data.forEach(hpc => {
      const mainProfileId = hpc.profileid;
      if (mainProfileId) {
        countMap[mainProfileId] = (countMap[mainProfileId] || 0) + 1;
      }
    });

    return Object.keys(countMap).map(id => ({
      profileId: id,
      name: this.mapProfile[id] || id,
      count: countMap[id]
    }));
  }
  getPersonsInGroups(data: any[]): { name: string; count: number; profileId: string }[] {
    const personsList: { name: string; count: number; profileId: string }[] = [];

    data.forEach(hpc => {
      if (hpc.persons) {
        Object.keys(hpc.persons).forEach(personKey => {
          const personName = hpc.persons[personKey]?.personName;
          if (personName && !personName.toLowerCase().startsWith('person')) {
            personsList.push({
              profileId: personKey,
              name: personName,
              count: 1
            });
          }
        });
      }
    });


    personsList.sort((a, b) => a.name.localeCompare(b.name));
    return personsList;
  }
  filterByName(name: string) {
    this.searchText = name;
    this.onFilterChange();
    this.closePanel();
  }
  getAllParticipants(data: any[]): { name: string; count: number; profileId: string }[] {
    const countMap: { [key: string]: { count: number; name: string } } = {};

    data.forEach(hpc => {
      if (hpc.multiple && hpc.persons) {
        Object.keys(hpc.persons).forEach(personKey => {
          const personName = hpc.persons[personKey]?.personName;
          if (personName && !personName.toLowerCase().startsWith('person')) {
            if (countMap[personKey]) {
              countMap[personKey].count++;
            } else {
              countMap[personKey] = { count: 1, name: personName };
            }
          }
        });
      } else {
        const profileId = hpc.profileid;
        if (profileId) {
          if (countMap[profileId]) {
            countMap[profileId].count++;
          } else {
            countMap[profileId] = { count: 1, name: this.mapProfile[profileId] || profileId };
          }
        }
      }
    });

    return Object.keys(countMap).map(id => ({
      profileId: id,
      name: countMap[id].name,
      count: countMap[id].count
    }));
  }

  closePanel() {
    this.isPanelOpen = false;
  }

  filterByProfile(profileId: string) {
    this.searchText = this.mapProfile[profileId] || profileId;
    this.onFilterChange();
    this.closePanel();
  }

  toggleAllCards(): void {
    this.allExpanded = !this.allExpanded;
    this.filteredHpcData.forEach(hpc => {
      this.expandedCards[hpc.id] = this.allExpanded;
    });
  }

  clearAllFilters(): void {
    this.searchText = '';
    this.selectedHpcView = 'all';
    this.typeFilter = 'all';
    this.sortOrder = 'desc';
    this.updateFilteredHpcData();
  }

  expandAllCards(): void {
    this.allExpanded = true;
    this.filteredHpcData.forEach(hpc => {
      this.expandedCards[hpc.id] = true;
    });
  }

  collapseAllCards(): void {
    this.allExpanded = false;
    this.filteredHpcData.forEach(hpc => {
      this.expandedCards[hpc.id] = false;
    });
  }
  getAllParticipantsList(data: any[]): { name: string; count: number; profileId: string }[] {
    const personsList: { name: string; count: number; profileId: string }[] = [];

    data.forEach(hpc => {
      if (hpc.multiple && hpc.persons) {
        Object.keys(hpc.persons).forEach(personKey => {
          const personName = hpc.persons[personKey]?.personName;
          if (personName && !personName.toLowerCase().startsWith('person')) {
            personsList.push({
              profileId: personKey,
              name: personName,
              count: 1
            });
          }
        });
      } else {
        const profileId = hpc.profileid;
        if (profileId) {
          personsList.push({
            profileId: profileId,
            name: this.mapProfile[profileId] || profileId,
            count: 1
          });
        }
      }
    });

    personsList.sort((a, b) => a.name.localeCompare(b.name));
    return personsList;
  }
  async onDelete(hpc: any) {
    console.log("Delete clicked for:", hpc);
    const check = confirm('Are you sure want to delete?');
    if (!check) return;
    try {
      await deleteDoc(doc(this.firestore, '3minuteshpc', hpc.id));
      await this.loadAllHpc();

      this.snackBar.open("Deleted successfully!", "Close", { duration: 2000 });
    } catch (err) {
      console.error("Delete error:", err);
      this.snackBar.open("Delete failed!", "Close", { duration: 2000 });
    }
  }


}

