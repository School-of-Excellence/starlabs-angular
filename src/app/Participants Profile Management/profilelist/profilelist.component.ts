
import { trigger, state, style, transition, animate } from '@angular/animations';
import { Component, OnInit, ViewChild } from '@angular/core';
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

@Component({
  selector: 'app-profilelist',
  imports: [
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
    MatNativeDateModule
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
  profilerole = {}
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
              console.log("Change type:", change.type); // 'added', 'modified', 'removed'
              
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
          }
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
    this.tableData.filter = value
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

  updateProfile(profile){
    this.dialog.open(UpdateprofileComponent, {
      data: {
        profile: profile,
        existingprofile: this.tableData.data
      },
      autoFocus: false,
      disableClose: true
    })
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
    const profiledataRef = doc(this.firestoreDefault, 'profile_data', profileid)
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
      if(confirm("Sure, Do you want to delete?")){
        const roleRef = doc(this.firestoreDefault, profile["role_ref"]["path"])
        const profilepathRef = doc(this.firestoreDefault,profilepath)
        await deleteDoc(roleRef)
        await deleteDoc(profilepathRef)
      }
    }
    loadingref.close()
  }
}
