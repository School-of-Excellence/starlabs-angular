import { trigger, state, style, transition, animate } from '@angular/animations';
import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { collectionData, Firestore, collection, docData, query, doc, getDoc, where, orderBy, limit, getDocs, updateDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { AddIssueComponent } from '../../Customer Support/add-issue/add-issue.component';
import { UpdateDialogComponent } from '../../DialogBox/update-dialog/update-dialog.component';
import { UpdateprofileComponent } from '../updateprofile/updateprofile.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { map, startWith, takeUntil } from 'rxjs/operators';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-profile-summary',
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    RouterModule,
    ReactiveFormsModule,
    MatIconModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,

  ],
  templateUrl: './profile-summary.component.html',
  styleUrl: './profile-summary.component.css',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class ProfileSummaryComponent {
  offsetFlag: boolean = true

  expandedElement: any | null = null;

  @HostListener('window:scroll', ['$event']) getScrollHeight(event) {
    if (window.pageYOffset > 0) this.offsetFlag = false;
    else this.offsetFlag = true;
  }

  @ViewChild(MatSort) sort: MatSort
  @ViewChild(MatPaginator) paginator: MatPaginator
  fullfillmentheader: string[] = ['issueno', 'clientname', 'reporteddate', 'reportedby', 'journey', 'product', 'status', 'notes', 'action'];
  fullfillSource: MatTableDataSource<any> = new MatTableDataSource();

  customersupportheader: string[] = ['issueno', 'clientname', 'reporteddate', 'reportedby', 'journey', 'product', 'assign', 'status', 'issue', 'notes', 'action'];
  customersupportSource: MatTableDataSource<any> = new MatTableDataSource();


  loading: boolean = false
  profileId: any
  profileData = {}
  clientList = [];
  mapProfile = {}
  mapProduct = {}
  mapAppointment = {}
  appoinmentList = []
  fillfillmentissues = []

  productlist = [];
  journeyList = [];
  mapJourney = {};
  ahMember = []

  clientIssues = [];


  generalNotes = []
  privateNotes = []

  journeySequenceList = []
  consumedProduct = []
  // client profile search
  myControl = new FormControl();
  filteredOptions: Observable<any>;
  clientProfileList: any = []
  //
  selectedProfileid = null
  panelOpenState = false;
  panelOpenState1 = false;
  panelOpenState2 = false;
  journey: any
  product: any
  profileName: any
  private subscription = new Subject<void>()
  // journey to purchase
  // listofjourney = []
  // journeyColumns = ['journeyref','subscriptionstart','subscriptionend','status']
  // journeySource = new MatTableDataSource()
  // showmodifyjourney:boolean = false
  // mapWatsonParticipantByEmail = {}
  // mapJourneySales: any = {};
  // profilePurchases: any[];
  // mapWatsonParticipantByName: any = {};
  // statuslist:Array<String> = ['initiated','ongoing','completed','cancelled','upgraded','shifted']
  // type = ['journey','product']
  // mapJourneyToProduct = {}
  // showreview:boolean = false
  // journeyreview = {}
  // mapPackage = {}

  constructor(public guard: AuthguardService, public router: Router, public route: ActivatedRoute, public firestore: Firestore, public dialog: MatDialog, public snackBar: MatSnackBar) {
    // this.loading = true
    guard.getRoles().then(async roles => {
      // if (roles["admin"] || roles["ah"] || roles["developer"]) {
      this.route.params.subscribe(async param => {
        await this.mapData()
        this.onScreenLoading(param['profileid'])
      });
      // } else {
      //   router.navigateByUrl('/')
      // }
    });

  }

  ngOnInit(): void {
    //client profile search
    if (this.clientProfileList.length != 0) {
      this.filteredOptions = this.myControl.valueChanges.pipe(
        startWith(''),
        map(value => (typeof value === 'string' ? value : value.name)),
        map(name => (name ? this._filter(name) : this.clientProfileList.slice())),
      );
    }
  }

  displayFn(user: any): string {
    return user && user.name ? user.name : '';
  }

  private _filter(name: string): any[] {
    const filterValue = name != '' && name != null ? name.toLowerCase() : '';
    return this.clientProfileList.filter(option => option.name.toLowerCase().includes(filterValue));
  }

  onProfileSelect(profile) {
    this.selectedProfileid = profile['profileid']
    this.route.params.subscribe(async param => {
      this.router.navigateByUrl(`/profilesummary/${profile['profileid']}`)
    })
    // this.onScreenLoading(profile['profileid'])
  }

  onNavigateATC() {
    // console.log(this.profileId,this.profileName);
    this.router.navigateByUrl(`participant report/${this.profileId}/${this.profileName}`)
  }

  // on screen loading
  showActiveProducts = false;
  showCompletedProducts: boolean = false;
  async onScreenLoading(id) {
    const loadingref = this.dialog.open(LoadingProgressComponent, { data: { msg: "Fetching Data please wait ..." } })
    this.profileId = id;
    this.selectedProfileid = id

    docData(doc(this.firestore, 'profile_data', this.profileId)).pipe(takeUntil(this.subscription)).subscribe(res => {
      this.profileData = res
      this.profileName = res['name']
      console.log(this.profileData);
      this.generalNotes = []
      this.privateNotes = []
      if (this.profileData["notes"] == null) {
        this.profileData["notes"] = {
          "generalnotes": [],
          "privatenotes": []
        }
      }
      else {
        if (this.profileData['notes']["generalnotes"]) {
          for (let i = 0; i < this.profileData['notes']['generalnotes'].length; i++) {
            const element = this.profileData['notes']["generalnotes"][i];
            // element["clientname"]=this.mapProfile[element["givenby"]]
            this.generalNotes.push(element)
          }
        } else { return }
        if (this.profileData['notes']["privatenotes"]) {
          for (let i = 0; i < this.profileData['notes']["privatenotes"].length; i++) {
            const element = this.profileData['notes']["privatenotes"][i];
            this.privateNotes.push(element)
          }
        }
      }
      this.ngOnInit()
    })
    getDoc(doc(this.firestore, 'participant metadata', this.profileId)).then(value => {
      if (value.exists()) {
        var res = value.data()
        this.journey = res['activejourney']
        this.product = res['activeproduct']
        this.consumedProduct = res['consumedproducts'];
      }
      console.log("consumed products", this.consumedProduct, this.product);
    })
    var profileref = doc(this.firestore, "profile_data", this.profileId)
    let appointmentData = [];

    getDocs(query(
      collection(this.firestore, 'appointments'),
      where("attended", "==", true),
      where("bookedby", "==", profileref),
      orderBy("starttime", "desc"),
      limit(3)
    )).then(res => {

      appointmentData = res.docs.map(e => ({
        appointmentId: e.data()["appointment"].id,
        endtime: e.data()["endtime"]
      }));

      const appointmentID = appointmentData.map(e => e.appointmentId);

      if (appointmentID.length != 0) {
        return getDocs(query(
          collection(this.firestore, "appointmenttype"),
          where("id", "in", appointmentID)
        ));
      }
      return null;

    }).then(value => {
      if (value) {
        this.appoinmentList = value.docs.map(e => ({
          appointmenttype: e.data()["appointmenttype"],
          endtime: appointmentData.find(
            a => a.appointmentId === e.data()["id"]
          )?.endtime
        }));
      }

    }).catch(error => {
      console.error("Error fetching appointments:", error);
    });

    collectionData(query(collection(this.firestore, 'fullfillmentchallenges'), where("clientid", "==", this.profileId), orderBy('reporteddate', 'desc'))).pipe(takeUntil(this.subscription)).subscribe(res => {
      this.fillfillmentissues = []
      for (let i = 0; i < res.length; i++) {
        const element = res[i];
        // element["clientname"] = this.mapProfile[element["clientid"]]
        // element["productname"] = this.mapProduct[element["product"].id]
        // element["reportedname"] = this.mapProfile[element["reportedBy"]]
        this.fillfillmentissues.push(element)
        this.profileName = element["clientname"]
      }
      this.fullfillSource.data = this.fillfillmentissues
      this.fullfillSource.paginator = this.paginator;
      this.fullfillSource.sort = this.sort;
    });
    collectionData(query(collection(this.firestore, 'clientissue'), where("clientid", "==", this.profileId), orderBy('reporteddate', 'desc'))).pipe(takeUntil(this.subscription)).subscribe(res => {
      this.clientIssues = []
      for (let i = 0; i < res.length; i++) {
        const element = res[i];
        // element["clientname"] = this.mapProfile[element["clientid"]]
        // element["journeyname"] = this.mapJourney[element["journey"]?.id]
        // element["productname"] = this.mapProduct[element["product"]?.id]
        // element["assignedname"] = element["assign"].map(e => this.mapProfile[e])
        // element["reportedname"] = this.mapProfile[element["reportedBy"]]
        this.clientIssues.push(element)
      }
      this.customersupportSource.data = this.clientIssues
      this.customersupportSource.paginator = this.paginator;
      this.customersupportSource.sort = this.sort;
    });
    loadingref.close()
  }

  async mapData() {
    collectionData(query(collection(this.firestore, 'products'), orderBy("product"))).pipe(takeUntil(this.subscription)).subscribe(snap => {
      var data = []
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        data.push({
          product: element["product"],
          path: doc(this.firestore, "products", element["id"]).path
        })
        this.mapProduct[element["id"]] = element["product"]
      }
      this.productlist = data
    });
    collectionData(query(collection(this.firestore, 'journey'), orderBy("journey"))).pipe(takeUntil(this.subscription)).subscribe(snap => {
      var data = []
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        data.push({
          journey: element["journey"],
          path: doc(this.firestore, "journey", element["id"]).path
        })
        this.mapJourney[element["id"]] = element["journey"]
      }
      this.journeyList = data
    });
    collectionData(query(collection(this.firestore, "profile_data"), orderBy("name"))).pipe(takeUntil(this.subscription)).subscribe(profile => {
      this.clientProfileList = profile
      var data = []
      for (let i = 0; i < profile.length; i++) {
        const element = profile[i];
        data.push({
          name: element["name"],
          id: element["profileid"],
          member: element["ahmember"] ?? false
        })
        this.mapProfile[element["profileid"]] = element["name"]
      }
      this.clientList = data
    });
    collectionData(query(collection(this.firestore, "users_roles"), where("ahmember", "==", true))).pipe(takeUntil(this.subscription)).subscribe(roles => {
      var memberList = []
      for (let i = 0; i < roles.length; i++) {
        const element = roles[i];
        if (element["ahmember"]) {
          memberList.push({
            name: element["name"],
            id: element["profileid"],
            member: element["ahmember"] ?? false
          })
        }
      }
      this.ahMember = memberList
    });
    getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", this.selectedProfileid))).then(participantProduct => {
    });
  }

  fullfillmentFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.fullfillSource.filter = filterValue.trim().toLowerCase();
  }

  customersupportFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.customersupportSource.filter = filterValue.trim().toLowerCase();
  }

  async addfullfillmentissue() {
    var issuenumber = 1
    await getDocs(query(collection(this.firestore, "fullfillmentchallenges"), orderBy("issueno", "desc"), limit(1))).then(value => {
      if (value.size == 0) {
        issuenumber = 1001
      }
      else {
        issuenumber = value.docs[0].data()["issueno"] + 1
      }
    })
    console.log(issuenumber);
    var data = {
      metadata: {
        issueno: issuenumber,
        profilesummary: true,
        profileid: this.profileId
      },
      journeys: this.journeyList,
      products: this.productlist,
      clients: this.clientList,
      members: this.ahMember
    }
    // if(this.productlist.length != 0 && this.clientList.length != 0 && this.ahMember.length != 0){
    //   this.dialog.open(DialogAddFullfillmentComponent,{
    //     data: data,
    //     autoFocus: false,
    //     maxHeight: "90vh"
    //   })
    // }
  }

  updatefullfillmentissue(value: any) {
    var data = {
      metadata: value,
      journeys: this.journeyList,
      products: this.productlist,
      clients: this.clientList,
      members: this.ahMember
    }

    // if(this.productlist.length != 0 && this.clientList.length != 0 && this.ahMember.length != 0){
    //   this.dialog.open(DialogEditFullfillmentComponent,{
    //     data: data,
    //     autoFocus: false,
    //     maxHeight: "90vh"
    //   })
    // }
  }

  async addcustomersupportissue() {
    var issuenumber = 1
    await getDocs(query(collection(this.firestore, "clientissue"), orderBy("issueno", "desc"), limit(1))).then(value => {
      if (value.size == 0) {
        issuenumber = 1001
      }
      else {
        issuenumber = value.docs[0].data()["issueno"] + 1
      }
    })
    console.log(issuenumber);
    var data = {
      metadata: {
        issueno: issuenumber,
        profileid: this.profileId,
        profilesummary: true
      },
      journeys: this.journeyList,
      products: this.productlist,
      clients: this.clientList,
      members: this.ahMember
    }
    if (this.productlist.length != 0 && this.clientList.length != 0 && this.ahMember.length != 0) {
      this.dialog.open(AddIssueComponent, {
        data: data,
        autoFocus: false,
        maxHeight: "90vh",
        disableClose: true
      })
    }
  }

  updatecustomersupportissue(value: any) {
    var data = {
      metadata: value,
      journeys: this.journeyList,
      products: this.productlist,
      clients: this.clientList,
      members: this.ahMember
    }
    console.log(data)
    if (this.productlist.length != 0 && this.clientList.length != 0 && this.ahMember.length != 0) {
      this.dialog.open(AddIssueComponent, {
        data: data,
        autoFocus: false,
        maxHeight: "90vh",
        disableClose: true
      })
    }
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 2000 })
  }

  addgeneralnotes() {
    console.log(this.profileData);

    var dialogRef = this.dialog.open(UpdateDialogComponent, {
      autoFocus: false,
      disableClose: true,
      maxHeight: "90vh",
    })
    dialogRef.afterClosed().subscribe(result => {

      if (result != null) {

        if (this.profileData["notes"]["generalnotes"] == null) {
          this.profileData["notes"]["generalnotes"] = []
        }

        var notes = {
          givenby: this.profileId,
          generalnotes: result,
          date: new Date()
        }
        this.profileData["notes"]["generalnotes"].push(notes)
        console.log(this.profileData);

        updateDoc(doc(this.firestore, '/profile_data/' + this.profileId), {
          notes: this.profileData["notes"]
        }).then(() => {
          console.log("successfully submitted");
          this.openSnackBar("Submitted successfully", null)
        }).catch(error => {
          this.openSnackBar("Document Writing Error:", null)
          console.error("Document Writing Error:", error);
        });
      }

    })
  }

  addprivatenotes() {
    console.log(this.profileData);

    var dialogRef = this.dialog.open(UpdateDialogComponent, {
      autoFocus: false,
      disableClose: true,
      maxHeight: "90vh",
    })
    dialogRef.afterClosed().subscribe(result => {

      if (result != null) {

        if (this.profileData["notes"]["privatenotes"] == null) {
          this.profileData["notes"]["privatenotes"] = []
        }

        var notes = {
          givenby: this.profileId,
          privatenotes: result,
          date: new Date()
        }
        this.profileData["notes"]["privatenotes"].push(notes)
        console.log(this.profileData);

        updateDoc(doc(this.firestore, '/profile_data/' + this.profileId), {
          notes: this.profileData["notes"]
        }).then(() => {
          console.log("successfully submitted");
          this.openSnackBar("Submitted successfully", null)
        }).catch(error => {
          this.openSnackBar("Document Writing Error:", null)
          console.error("Document Writing Error:", error);
        });


      }

    })
  }
}
