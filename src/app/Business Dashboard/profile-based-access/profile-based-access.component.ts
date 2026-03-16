import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, TemplateRef, ViewChild, signal } from '@angular/core';
import { FormControl, FormsModule, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import {
  Firestore,
  collection,
  collectionData,
  setDoc,
  updateDoc,
  getDocs,
  Timestamp,
  query,
  deleteDoc,
  docData
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { catchError, of, map, Subscriber, Subscribable, Subscription } from 'rxjs';
import { doc, where } from 'firebase/firestore';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatInputModule } from '@angular/material/input';
import { MatChipListbox, MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-profile-based-access',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    NgxMatSelectSearchModule,
    ReactiveFormsModule,
    MatInputModule,
    MatChipsModule,
    MatChipListbox,
    MatDialogModule
  ],
  templateUrl: './profile-based-access.component.html',
  styleUrl: './profile-based-access.component.css'
})
export class ProfileBasedAccessComponent implements OnInit, OnDestroy {

  @ViewChild('editDialog') editDialog!: TemplateRef<any>;
  @ViewChild('ahcrmEditDialog') ahcrmEditDialog!: TemplateRef<any>;

  // Form fields
  routePath = '';
  screenName = '';
  selectedProfileIds: string[] = [];
  participantList: any[] = [];

  addSearchProfile: string = '';
  editSearchProfile: string = '';
  searchProfile: string = '';

  // ahcrm dashboard acces form 
  ahcrmScreenName = '';
  ahcrmSelectedProfileIds: string[] = [];

  ahcrmAddSearchProfile: string = '';
  ahcrmEditSearchProfile: string = '';
  ahcrmSearchProfile: string = '';

  // Data
  profileMap: any = {};
  screenAccess: any[] = [];
  ahcrmScreenAccess: { [key: string]: any } = {};
  dashboardConfigsMap: { [key: string]: any } = {}

  // UI State
  isEditing = signal<string | null>(null);
  editForm = new FormGroup({
    routepath: new FormControl('', [Validators.required]),
    screen: new FormControl('', [Validators.required]),
    profile_id: new FormControl<any[]>([], [Validators.required])
  });

  editRoute = null;

  ahcrmEditForm = null;

  filters = {
    search: '',
    profileIds: [] as string[],
    accessType : '-- None --'
  };

  filteredAccess: any[] = [];

  existPath: any = null;
  showFullProfiles: number[] = [];
  showAhcrmFullProfiles: string[] = [];
  subscribe: {[key : string] : Subscription} = {};

  constructor(
    private firestore: Firestore,
    private authguard: AuthguardService,
    private dialog: MatDialog
  ) {
    this.authguard.getProfileMap().then((profiles) => {
      this.profileMap = profiles.docdata;
      this.participantList = profiles.list;
    });
  }

  ngOnInit(): void {
    this.loadScreenAccess();
    this.loadAHCRMaccess();
  }

  ngOnDestroy(): void {
    if (this.subscribe) {
      Object.values(this.subscribe).forEach((sub)=>sub?.unsubscribe())
    }
  }

  // -------- Firestore load --------
  loadScreenAccess(): void {
    const q = query(
      collection(this.firestore, 'dashboard'),
    );
    this.subscribe['dashboard'] = collectionData(q, { idField: 'docid' })
      .pipe(
        catchError((error) => {
          console.error('Error in Fetching dashboard : ', error);
          return of([]);
        }),
      )
      .subscribe((dashboardSnap) => {
        const dashboardConfigsMap = {};
        const routes = [];

        dashboardSnap.forEach((dashboard) => {
          const docid = dashboard['docid'];
          dashboardConfigsMap[docid] = dashboard;
          if ([null, undefined, ''].includes(dashboard['route'])) {
            const childrens = dashboard['children'] || [];
            for (let child of childrens) {
              if (Array.isArray(child['profileid']) && child['profileid'].length > 0) {
                routes.push({ ...child, docid })
              }
            }
          } else if (Array.isArray(dashboard['profileid']) && dashboard['profileid'].length > 0) {
            routes.push(dashboard);
          }
        })

        this.dashboardConfigsMap = dashboardConfigsMap;
        this.screenAccess = routes;
        console.log(this.screenAccess)
        this.accessFilter();
      });
  }

  // -------- Profile helpers --------
  filterProfilesIds(searchText: string, profileId: string): boolean {
    const text = (searchText || '').toLowerCase();
    if (text === '') return true;
    return (
      this.getProfileFields(profileId, 'name').toLowerCase().includes(text) ||
      this.getProfileFields(profileId, 'email').toLowerCase().includes(text)
    );
  }

  getSelectedProfiles(selectedProfileIds: string[]) {
    if (!selectedProfileIds || selectedProfileIds.length === 0) return '';
    return selectedProfileIds
      .map((id) => this.getProfileFields(id, 'name'))
      .join(', ');
  }

  getProfileFields(profileId: string, key: string) {
    const profile = this.profileMap[profileId];
    if (profile && Object.prototype.hasOwnProperty.call(profile, key)) {
      return profile[key];
    }
    return '';
  }

  getProfileIds() {
    return Object.keys(this.profileMap);
  }

  getInitials(profileId: string): string {
    const name = this.profileMap[profileId]?.name;
    return name ? name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : '';
  }

  getMoreUsersTooltip(profileIds: string[]): string {
    return profileIds
      .slice(3)
      .map((id) => this.profileMap[id]?.name)
      .filter(Boolean)
      .join(', ');
  }

  getProfileNamesFromIds(ids: string[] | null | undefined): string {
    if (!ids || ids.length === 0) return '';
    return ids
      .map(id => this.getProfileFields(id, 'name'))
      .filter(name => !!name)
      .join(', ');
  }

  // -------- Add form / existing path --------
  editExistPath(access: any) {
    this.existPath = access;
    this.routePath = access?.routepath?.slice(1);
    this.screenName = access?.screen;
    this.selectedProfileIds = access?.profile_id;
  }

  clearForm(): void {
    this.routePath = '';
    this.screenName = '';
    this.selectedProfileIds = [];
    this.existPath = null;
  }

  clearAhcrmForm(): void {
    this.ahcrmScreenName = '';
    this.ahcrmSelectedProfileIds = [];
  }

  async addAccess(): Promise<void> {
    if (!this.routePath || !this.screenName || this.selectedProfileIds.length === 0) {
      alert('Please Fill all the fields');
      return;
    }

    try {
      const collRef = collection(this.firestore, 'dashboarduseraccess');
      const path = this.routePath.startsWith('/') ? this.routePath : `/${this.routePath}`;
      const q = query(collRef, where('routepath', '==', path));
      const snap = await getDocs(q);
      const exist = !snap.empty;

      if (exist) {
        const access: any = snap.docs[0].data();
        if (access['delete'] === true) {
          const edit = confirm(
            'Deleted Record found for this route path .Click OK to edit, or Cancel to delete permanently'
          );
          if (edit) {
            this.editExistPath(access);
            return;
          } else {
            this.permanentDelete(snap.docs[0].id);
          }
        }

        if (confirm('Path is already Exist Click Ok to Edit')) {
          this.filters.search = access['routepath'];
          this.accessFilter();
          this.startEdit(access);
        }
      } else {
        const docRef = doc(collRef);
        const docData = {
          docid: docRef.id,
          routepath: path,
          screen: this.screenName,
          profile_id: [...this.selectedProfileIds],
          delete: false,
          lastupdated: Timestamp.now()
        };
        await setDoc(docRef, docData, { merge: true });
      }
      this.clearForm();
    } catch (error: any) {
      console.error('Error in adding new Access : ', error.message);
      this.clearForm();
    }
  }

  async addAhcrmScreenAccess(): Promise<void> {
    if (!this.ahcrmScreenName || this.ahcrmSelectedProfileIds.length === 0) {
      alert('Please Fill all the fields');
      return;
    }

    if (Object.hasOwn(this.ahcrmScreenAccess, this.ahcrmScreenName)) {
      alert('dashboard name already exist try another name');
      return;
    }

    try {
      const docRef = doc(this.firestore, '/classify/AHCRM_dashboard_access')
      const ahcrmAccess = { ...this.ahcrmScreenAccess, [this.ahcrmScreenName]: this.ahcrmSelectedProfileIds };
      await setDoc(docRef, ahcrmAccess)

      this.clearAhcrmForm();
    } catch (error: any) {
      console.error('Error in adding new Access : ', error.message);
      this.clearAhcrmForm();
    }
  }

  async saveDeletedAccess() {
    if (!this.screenName || this.selectedProfileIds.length === 0) {
      alert('Please Fill all the fields');
      return;
    }
    try {
      const docRef = doc(
        this.firestore,
        `dashboarduseraccess/${this.existPath.docid}`
      );
      const docData = {
        screen: this.screenName,
        profile_id: [...this.selectedProfileIds],
        delete: false,
        lastupdated: Timestamp.now()
      };
      await setDoc(docRef, docData, { merge: true });
      this.clearForm();
    } catch (error: any) {
      console.error('Error in adding Access : ', error.message);
      this.clearForm();
    }
  }

  // -------- Inline edit state (still kept, if you still use it elsewhere) --------
  startEdit(access: any): void {
    this.isEditing.set(access.docid);
    this.editForm.get('screen')?.setValue(access.screen);
    this.editForm.get('profile_id')?.setValue(access.profile_id);
  }

  cancelEdit(): void {
    this.editForm.get('screen')?.setValue('');
    this.editForm.get('profile_id')?.setValue([]);
    this.isEditing.set(null);
  }

  async saveEdit(accessId: string): Promise<void> {
    if ([null, undefined, ''].includes(accessId)) return;
    if (this.editForm.invalid) {
      alert('Please Fill all the fields');
      return;
    }
    try {
      const docRef = doc(this.firestore, `dashboarduseraccess/${accessId}`);
      const docData = {
        screen: this.editForm.value.screen,
        profile_id: this.editForm.value.profile_id,
        lastupdated: Timestamp.now()
      };
      await updateDoc(docRef, docData as any);
      this.isEditing.set(null);
    } catch (error: any) {
      console.error(`Error in updateing access ${accessId} : `, error.message);
      this.isEditing.set(null);
    }
  }

  // -------- Delete / permanent delete --------
  async deleteAccess(accessId: string): Promise<void> {
    if (confirm('Delete this screen access?')) {
      try {
        const docRef = doc(this.firestore, `dashboarduseraccess/${accessId}`);
        const docData = {
          delete: true,
          lastupdated: Timestamp.now()
        };
        await updateDoc(docRef, docData);
      } catch (error: any) {
        console.error(`Error in deleting access ${accessId} : `, error.message);
      }
    }
  }

  async permanentDelete(accessId: string) {
    try {
      await deleteDoc(doc(this.firestore, `dashboarduseraccess/${accessId}`));
      this.clearForm();
    } catch (error: any) {
      console.error('Error in Deleting access : ', error.message);
      this.clearForm();
    }
  }

  // -------- Filter table --------
  accessFilter() {
    const screenaccess = this.screenAccess;
    const filteredAccess = screenaccess.filter((access: any) => {
      if (
        (![null, undefined, ''].includes(this.filters.search) &&
          !(
            access['label']?.includes(this.filters.search?.trim()) ||
            access['route']?.includes(this.filters.search?.trim())
          )) ||
        (this.filters.profileIds.length > 0 &&
          !this.filters.profileIds.some((id) => access['profileid']?.includes(id))) ||
          (this.filters.accessType !== '-- None --' && (this.filters.accessType === 'profile' && access['roles']?.length > 0) 
          ||(this.filters.accessType === 'role' && access['roles']?.length === 0) )
      ) {
        return false;
      }
      return true;
    });

    this.filteredAccess = filteredAccess;
  }

  // -------- Chips helpers --------
  showProfiles(index: number) {
    if (this.showFullProfiles.includes(index)) {
      this.showFullProfiles = this.showFullProfiles.filter(
        (i) => i !== index
      );
    } else {
      this.showFullProfiles.push(index);
    }
  }

  showAhcrmProfiles(screen: string) {
    if (this.showAhcrmFullProfiles.includes(screen)) {
      this.showAhcrmFullProfiles = this.showAhcrmFullProfiles.filter(
        (i) => i !== screen
      );
    } else {
      this.showAhcrmFullProfiles.push(screen);
    }
  }

  removeProfileAddForm(profileId: string) {
    const filteredData = this.selectedProfileIds.filter((id) => id !== profileId);
    this.selectedProfileIds = filteredData;
  }

  removeProfileEditForm(profileId: string) {
    if (this.editRoute) {
      const filteredData = (this.editRoute.profileid || []).filter(
        (id: any) => id !== profileId
      );
      this.editRoute.profileid = filteredData;
    }
  }

  removeProfileAhcrmAddForm(profileId: string) {
    const filteredData = this.ahcrmSelectedProfileIds.filter((id) => id !== profileId);
    this.ahcrmSelectedProfileIds = filteredData;
  }

  removeProfileEditAhcrmForm(profileId: string) {
    if (this.ahcrmEditForm) {
      const filteredData = (this.ahcrmEditForm.profileid || []).filter(
        (id: any) => id !== profileId
      );
      this.ahcrmEditForm.profileid = filteredData;
    }
  }

  // -------- Dialog edit (new) --------
  openEditDialog(access: any): void {
    this.editRoute = { ...access };
    const dialogRef = this.dialog.open(this.editDialog, {
      width: '500px',
      autoFocus: true,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) return;
      const { profileid, docid, route } = result;
      const accessDoc = this.dashboardConfigsMap[docid];
      if (!accessDoc) return

      if ([null, undefined, ''].includes(accessDoc['route'])) {
        const children = (accessDoc['children'] || []).map((child) => {
          if (child['route'] === route) {
            return { ...child, profileid: profileid }
          }
          return child
        });

        accessDoc['children'] = children;

      } else if (accessDoc['route'] === route) {
        accessDoc.profileid = profileid;
      }
      try {
        const docRef = doc(this.firestore, `dashboard/${docid}`);
        await updateDoc(docRef, {
          ...accessDoc
        });
      } catch (error: any) {
        console.error(`Error in updating access ${access.docid} : `, error.message);
      } finally {
        this.editRoute = null;
      }
    });
  }

  openAhcmEditDialog(access: string): void {
    this.ahcrmEditForm = { dashboard: access, profileid: this.ahcrmScreenAccess[access] || [] };
    const dialogRef = this.dialog.open(this.ahcrmEditDialog, {
      width: '500px',
      autoFocus: true,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) return;
      const { profileid, dashboard } = result;
      if (!Object.hasOwn(this.ahcrmScreenAccess, dashboard)) {
        return;
      }
      try {
        const docRef = doc(this.firestore, '/classify/AHCRM_dashboard_access')
        const ahcrmAccess = { ...this.ahcrmScreenAccess, [dashboard]: profileid };
        await setDoc(docRef, ahcrmAccess)
      } catch (error: any) {
        console.error(`Error in updating access ${access} : `, error.message);
      } finally {
        this.ahcrmEditForm = null;
      }
    });
  }

  loadAHCRMaccess() {
    const docRef = doc(this.firestore, '/classify/AHCRM_dashboard_access');
    this.subscribe['classify'] = docData(docRef)
      .pipe(
        catchError((error) => {
          console.error('Error in Fetching dashboard : ', error);
          return of([]);
        }),
      )
      .subscribe(
        (access) => {
          this.ahcrmScreenAccess = access;
        }
      )
  }

  get getAhcrmAccess() {
    const access = Object.keys(this.ahcrmScreenAccess);
    access.sort((a, b) => a.localeCompare(b))
    return access;
  }
}
