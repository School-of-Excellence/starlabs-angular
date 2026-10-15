
import { trigger, state, style, transition, animate } from '@angular/animations';
import { Component, OnInit, ViewChild, Injector, runInInjectionContext } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router, RouterModule } from '@angular/router';
import { from, Subject, Subscription, takeUntil } from 'rxjs';
import { AddPurchaseComponent } from '../add-purchase/add-purchase.component';
import { UpdateprofileComponent } from '../updateprofile/updateprofile.component';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionData, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-profilelist',
  imports: [
    MatSlideToggleModule,
    MatTooltipModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatIconModule,
    CommonModule,
    MatMenuModule,
    MatPaginatorModule,
    RouterModule,
    MatButtonModule,
    FormsModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    ProfilePictureComponent
  ],
  templateUrl: './profilelist.component.html',
  styleUrl: './profilelist.component.css',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', display: 'none' })),
      state('expanded', style({ height: '*', display: 'block' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ]
})
export class ProfilelistComponent {
  @ViewChild(MatSort) matsort:MatSort
  @ViewChild(MatPaginator) paginator:MatPaginator
  tableHeader = ["name", "email", "number", "more"];
  tableData:MatTableDataSource<any> = new MatTableDataSource();

  // ── Filters ───────────────────────────────────────────────────────────
  // Name search, two toggles and a role picker, combined into one predicate.
  // The filter value is JSON so they all travel together through MatTableDataSource.
  nameFilter = '';
  holdOnly = false;
  ahcrmOnly = false;
  roleFilter: string[] = [];
  roleSearch = '';
  profilerole = {}
  // Saved roles per profile, for the role filter. Kept apart from profilerole
  // because the expanded panel's checkboxes edit profilerole before "Update Role"
  // is pressed — filtering on it would move rows while they are being edited.
  savedRoles: { [profileid: string]: any } = {}
  roleList = []
  atcmodelList = []
  loading:boolean = false
  developerAccess:boolean = false
  listofprofiledata:any[] = []
  onScreenrefreshed = true
  myoperatoruid:string = "";
  myoperatornumber:string = "";
  subscription = new Subject<void>()
  expandedElement
  unsubscribeProfile: (() => void) | undefined;

  loggedinProfileRoles = {}

  firestoreDefault = getFirestore()

  // firestore collection reference
  // dataBufferSubscription: Subscription;
  // profileDataSubscription : Subscription
  constructor(public guard: AuthguardService, public router:Router, public dialog: MatDialog, public snackbar: MatSnackBar) {
    
    guard.getRoles().then(async roles=>{
      this.loggedinProfileRoles = roles
      this.developerAccess = roles.developer ?? false
      console.log(this.developerAccess, 'developerAccess');

      // if(roles.admin || roles.ah || roles.integrator){
        // presistent caching
        const profileCollection = collection(this.firestoreDefault,'profile_data')
        const profilequery = query(profileCollection, orderBy('name'))
        const unsubscribe = onSnapshot(
          profilequery,
          (snapshot) => {
            console.log("Snapshot received, changes:", snapshot.docChanges().length);
            snapshot.docChanges().forEach((change) => {
              // console.log("Change type:", change.type); // 'added', 'modified', 'removed'
              if (!this.onScreenrefreshed) {
                if (change.type === 'added') {
                  console.log("added");
                  this.listofprofiledata.push(change.doc.data());
                } else if (change.type === 'modified') {
                  console.log("modified");
                  let findIndex = this.listofprofiledata.findIndex(e => e['profileid'] === change.doc.data()['profileid']);
                  if (findIndex !== -1) {
                    this.listofprofiledata[findIndex] = change.doc.data();
                  }
                } else if (change.type === 'removed') {
                  console.log("removed");
                  let findIndex = this.listofprofiledata.findIndex(e => e['profileid'] === change.doc.data()['profileid']);
                  if (findIndex !== -1) {
                    this.listofprofiledata.splice(findIndex, 1);
                  }
                }
              } else {
                this.listofprofiledata.push(change.doc.data());
              }
            });
            this.onScreenrefreshed = false;
            this.tableData.data = this.listofprofiledata;
            this.tableData.sort = this.matsort;
            this.tableData.paginator = this.paginator;
          },
          (error) => {
            console.error("Snapshot error:", error);
          }
        );
        // Store unsubscribe function for cleanup
        this.unsubscribeProfile = unsubscribe;            
          

        const userrolesCollection = collection(this.firestoreDefault, 'users_roles')
        collectionData(userrolesCollection , {idField: 'id'}).pipe(takeUntil(this.subscription)).subscribe(roles => {
           for (let i = 0; i < roles.length; i++) {
            const doc = roles[i];
            this.profilerole[doc["profile_ref"].id] = doc
            this.savedRoles[doc["profile_ref"].id] = { ...doc }
          }
          // Roles arrive after the profiles; re-run the predicate so a picked role
          // filter reflects them, without jumping back to page one.
          if (this.roleFilter.length) this.tableData.filter = this.filterValue()
        })
        const atcmodelcollction = collection(this.firestoreDefault, 'atc model')
        collectionData(atcmodelcollction , {idField: 'id'}).pipe(takeUntil(this.subscription)).subscribe(atcmodel => {
          this.atcmodelList = atcmodel.map(item => item['atcmodel']);
       })
        const docref = doc(this.firestoreDefault, 'starlabs roles', 'roles')
        getDoc(docref).then(role => {
          if(role.exists()){
           let names = (role.data()["name"] ?? []).filter(e => this.developerAccess || !["rolemanager", "developer"].includes(e.toLowerCase())).sort((a, b) => a.localeCompare(b))
            this.roleList = [...names, { productowner: this.atcmodelList }];
            console.log(this.roleList);
          }
        })
      // }
      // else{
      //   router.navigateByUrl('/')
      // }
    })
  }

  ngOnInit(): void {
    this.tableData.filterPredicate = (row: any, filter: string) => {
      let f: any;
      try { f = JSON.parse(filter); } catch { return true; }

      if (f.hold && row['deliveryonhold'] !== true) return false;
      if (f.ahcrm && row['enableahcrm'] !== true) return false;

      if (f.roles?.length) {
        // Match if the profile holds ANY of the picked roles.
        const r = this.savedRoles[row['profileid']];
        if (!r || !f.roles.some((role: string) => r[role] === true)) return false;
      }

      if (f.name) {
        // Same haystack MatTableDataSource builds by default, so the name box
        // keeps matching every column exactly as it did before.
        const hay = Object.keys(row)
          .reduce((acc, k) => acc + row[k] + '◬', '')
          .toLowerCase();
        if (!hay.includes(f.name)) return false;
      }
      return true;
    };
    this.applyFilters();
  }

  applyFilters(): void {
    this.tableData.filter = this.filterValue();
    if (this.tableData.paginator) this.tableData.paginator.firstPage();
  }

  private filterValue(): string {
    return JSON.stringify({
      name: this.nameFilter.trim().toLowerCase(),
      hold: this.holdOnly,
      ahcrm: this.ahcrmOnly,
      roles: this.roleFilter,
    });
  }

  // Plain role names from roleList (the trailing { productowner } entry is skipped).
  get roleOptions(): string[] {
    const q = this.roleSearch.trim().toLowerCase();
    return this.roleList.filter((r: any) => typeof r === 'string' && (!q || r.toLowerCase().includes(q)));
  }

  roleCount(role: string): number {
    return Object.values(this.savedRoles).filter((r: any) => r?.[role] === true).length;
  }

  // ── Role dropdown sizing ─────────────────────────────────────────────
  // The field grows with what it shows (label, or "ROLE +N more"); the panel
  // grows to fit the longest role name. Both clamped so neither runs away.
  get roleFieldWidth(): number {
    const text = this.roleFilter.length
      ? this.roleFilter[0].toUpperCase() + (this.roleFilter.length > 1 ? ` +${this.roleFilter.length - 1} more` : '')
      : 'Filter by role';
    // 32 side padding + 24 arrow, + 40 for the clear button when it shows
    const chrome = 56 + (this.roleFilter.length ? 40 : 0);
    return Math.min(Math.max(this.textWidth(text) + chrome, 200), 420);
  }

  get rolePanelWidth(): number {
    const longest = Math.max(0, ...this.roleList
      .filter((r: any) => typeof r === 'string')
      .map((r: string) => this.textWidth(r.toUpperCase())));
    // 32 padding + 32 checkbox + ~48 count badge
    return Math.min(Math.max(longest + 112, this.roleFieldWidth), 480);
  }

  private textWidthCache = new Map<string, number>();
  private measureCtx: CanvasRenderingContext2D | null | undefined;

  private textWidth(text: string): number {
    const hit = this.textWidthCache.get(text);
    if (hit !== undefined) return hit;
    if (this.measureCtx === undefined) {
      // No canvas during SSR — fall back to an average glyph width.
      this.measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
      if (this.measureCtx) this.measureCtx.font = '400 16px Roboto, "Helvetica Neue", sans-serif';
    }
    const w = this.measureCtx ? Math.ceil(this.measureCtx.measureText(text).width) : text.length * 10;
    this.textWidthCache.set(text, w);
    return w;
  }

  clearRoleFilter(): void {
    this.roleFilter = [];
    this.applyFilters();
  }

  get holdCount(): number {
    return (this.tableData.data || []).filter((r: any) => r['deliveryonhold'] === true).length;
  }

  get ahcrmCount(): number {
    return (this.tableData.data || []).filter((r: any) => r['enableahcrm'] === true).length;
  }

  toggleRow(row: any): void {
    this.expandedElement = this.expandedElement === row ? null : row;
  }

  onProductOwnerChange(profileId: string, owner: string, checked: boolean): void {
    if (!this.profilerole[profileId]) {
      this.profilerole[profileId] = {};
    }
    if (!Array.isArray(this.profilerole[profileId].productowner)) {
      this.profilerole[profileId].productowner = [];
    }
    const arr = this.profilerole[profileId].productowner;
    if (checked && !arr.includes(owner)) {
      arr.push(owner);
    } else if (!checked) {
      const index = arr.indexOf(owner);
      if (index > -1) arr.splice(index, 1);
    }
  }
  ngAfterViewInit(){
  }

  ngOnDestroy(){
    this.subscription.complete()
    this.subscription.next()
    // this.dataBufferSubscription?.unsubscribe()
    // this.profileDataSubscription?.unsubscribe()
  }

  onmenuClose(menuTrigger: MatMenuTrigger) {
    menuTrigger.closeMenu();
  }

  filterData(value){
    this.nameFilter = value || ''
    this.applyFilters()
  }

  viewProfileSummary(pid){
    this.router.navigateByUrl("profilesummary/"+pid)
  }

  updateMyOperator(profile){
    const profiledataCollection = collection(this.firestoreDefault, 'profile_data')
    const Docref = doc(profiledataCollection, profile['profileid'])
    updateDoc(Docref, {
      myoperatoruid : this.myoperatoruid,
      myoperatornumber : this.myoperatornumber,
    }).then(()=>{
      console.log("Updated My Operator Data");
    }).catch((error)=>{
      console.log("Oops Error While Updating My Operator");
    });
  }

  // updateProfile(profile){
  //   this.dialog.open(UpdateprofileComponent, {
  //     data: {
  //       profile: profile,
  //       existingprofile: this.tableData.data
  //     },
  //     autoFocus: false,
  //     disableClose: true
  //   })
  // }

  async updateProfile(profile: any) {
    const profileRef = doc(this.firestoreDefault, 'profile_data', profile.profileid);
    const freshSnap = await getDoc(profileRef);
    const freshData = freshSnap.data();
    // console.log('user_ref_existing in fresh data:', freshData['user_ref_existing']);
    const freshProfile = {
      ...freshData,
      profileid: profile.profileid,
      user_ref: freshData['user_ref'] || null
    };
    // console.log('fresh user_ref:', freshProfile['user_ref']);
    // console.log('fresh user_ref id:', freshProfile['user_ref']?.id);

    this.dialog.open(UpdateprofileComponent, {
      data: {
        profile: freshProfile,
        existingprofile: this.tableData.data
      },
      maxHeight: "90vh",
      maxWidth: "90vw",
      autoFocus: false,
      disableClose: true
    });
  }

  updateRole(profileid, rolepath){
    console.log(profileid, rolepath, this.profilerole[profileid])
    const roleDocRef = rolepath;
    updateDoc(roleDocRef, this.profilerole[profileid]).then(() => {
      this.snackbar.open("Roles Updated", null, {
        duration: 2000
      })
    })
  }

  async addCustomer(value, profile){
    this.dialog.open(AddPurchaseComponent, {
      width: '70%',
      height: '50%',
      autoFocus: false,
      data: {
        "newcustomer": value,
        "profile": profile,
        "existingprofile": this.tableData.data
      },
      disableClose: true
    })
  }

  async deleteProfile(profile){
    console.log(profile)
    var loadingref = this.dialog.open(LoadingProgressComponent,{
      data:{
        msg:"Validating profile condition"
      }
    })
    var profileid = profile.profileid
    var profilepath = "profile_data/"+profileid
    var profileref = doc(this.firestoreDefault, profilepath)
    var profileStatus = {
      registered: profile["user_ref"] != null,
      atcPrescribed: true,
      atcGiven: true,
      atcAssigned: true,
      appointmentGiven: true,
      ApptRole: true,
      majorRole: true,
      // journeyPurchase: true,
      eiszoomcontact: true,
      aggregateEIT: true,
      aggregateReview: true,
      availability: true,
      eventprofile: true,
      formbyclient: true,
      addpurchase: true,
      participantsproduct: true
    }
    const firestoreATC = getFirestore("firestore-atc")
    const atcCollection = collection(firestoreATC, 'atc_alpha')
    const appointments = collection(this.firestoreDefault, 'appointments')
    const rolesRef = collection(this.firestoreDefault, "Roles-To-EIS")
    const profiledataRef = doc(firestoreATC, 'profile_data', profileid)
    profileStatus.atcPrescribed = (await getDocs(query(atcCollection, where("author", "array-contains", profiledataRef)))).size != 0
    profileStatus.atcGiven = (await getDocs(query(atcCollection, where("profileid", "==", profileid)))).size != 0
    profileStatus.atcAssigned = (await getDocs(query(atcCollection, where('implementationagent', 'array-contains', profileid)))).size != 0
    profileStatus.appointmentGiven = (await getDocs(query(appointments, where("bookedby", "==", profileref)))).size != 0
    profileStatus.ApptRole = (await getDocs(query(rolesRef, where("assigned_eis", "array-contains", profileref)))).size != 0
    
    const profileRoleRef = doc(this.firestoreDefault, profile["role_ref"]["path"])
    await getDoc(profileRoleRef).then(role => {
      var roleDate = role.data()
      profileStatus.majorRole = (roleDate["changeagent"] || roleDate["eis"] || roleDate["admin"] || roleDate["ah"] || roleDate["superadmin"])
    })
    
    const journeyproductpurchase = collection(this.firestoreDefault, "journeyproductpurchase")
    const participantsproduct = collection(this.firestoreDefault, 'participantsproduct')
    const EISzoomcontact = doc(this.firestoreDefault, 'EISzoomcontact', profileid)
    const aggregate_EITParticipant = doc(this.firestoreDefault, 'aggregate_EITParticipant', profileid)
    const aggregate_ReviewParticipant = doc(this.firestoreDefault, 'aggregate_ReviewParticipant', profileid)
    const availability = collection(this.firestoreDefault, 'availability')
    const events_profiles = collection(this.firestoreDefault, 'events_profiles')
    const firestoreForms = getFirestore("firestore-forms")
    const formsByClient = collection(firestoreForms, 'formsByClient')

    profileStatus.addpurchase = (await getDocs(query(journeyproductpurchase, where("profileid", "==", profileid)))).docs.length != 0
    profileStatus.participantsproduct  = (await getDocs(query(participantsproduct, where("profileid", "==", profileid)))).docs.length != 0
    profileStatus.eiszoomcontact =  (await getDoc(EISzoomcontact)).exists()
    profileStatus.aggregateEIT =  (await getDoc(aggregate_EITParticipant)).exists()
    profileStatus.aggregateReview = (await getDoc(aggregate_ReviewParticipant)).exists()
    profileStatus.availability = (await getDocs(query(availability, where("profileref", "==", profileref)))).docs.length != 0
    profileStatus.eventprofile = (await getDocs(query(events_profiles, where("profile_ref", "==", profileref)))).docs.length != 0
    profileStatus.formbyclient = (await getDocs(query(formsByClient, where("profileid", "==", profileid)))).docs.length != 0
    var condition = Object.values(profileStatus).filter(e => e)
    if(condition.length != 0){
      alert(JSON.stringify(profileStatus))
    }
    else{
      if(confirm("Sure, Do you want to delete ?")){
        const roleRef = doc(this.firestoreDefault, profile["role_ref"]["path"])
        const profilepathRef = doc(this.firestoreDefault, profilepath)
        const profileMetaRef = doc(this.firestoreDefault, "participant metadata", profileid)
        await deleteDoc(roleRef)
        await deleteDoc(profilepathRef)
        await deleteDoc(profileMetaRef)
      }
    }
    loadingref.close()
  }
}