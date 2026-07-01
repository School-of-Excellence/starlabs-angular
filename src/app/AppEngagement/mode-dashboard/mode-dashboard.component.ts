import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Firestore,getDocs, collectionData, collection, query, orderBy,doc, where,onSnapshot, getFirestore, writeBatch, Unsubscribe } from '@angular/fire/firestore';
import { inject } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthguardService } from '../../authguard.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { ProductModeConfigupdateComponent } from '../product-mode-config/product-mode-configupdate/product-mode-configupdate.component';
import { Router } from '@angular/router';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
@Component({
  selector: 'app-mode-dashboard',
  imports: [CommonModule,
    MatDatepickerModule,
     MatInputModule,
     MatNativeDateModule,
     MatDialogModule,
     MatIconModule, 
     MatSelectModule,
     MatButtonModule,
     MatProgressBarModule,
     MatFormFieldModule, 
     MatInputModule,
     MatCheckboxModule,
     FormsModule,
     ProfilePictureComponent,],
  templateUrl: './mode-dashboard.component.html',
  styleUrl: './mode-dashboard.component.css'
})
export class ModeDashboardComponent implements OnInit {
  startDay = 0
  endDay = 10
  // Debug
  loading = true;
  debugModeList = []
  // No Mode
  noNextModeList = []
  journeyPlanningModeList = []
  priorityModeList = []
  // Next Mode
  nextModeList = []
  hierarchyMode = true
  // Profile Data
  productmodeSubscription: Unsubscribe | null = null;
  profileSubscription: Unsubscribe | null = null;
  profileList = []
  modeProfile = {}
  // Map Data
  mapProduct = {}
  mapProfile = {}
  productmodeConfig = {}
  // Reference List
  mapReference = {}
  adsPlaylist = []
  solarVoicePlaylist = []
  eiflixPlaylist = []
  generalcontentPlaylist = []
  formtemplatelist = []
  modes = []
  showDebugModeParticipants = false;
  selectedCurrentMode: string | null = null; 
  selectedNextMode: string | null = null; 
  selectedNextModeDate = null
  showDropdownAndDatePicker: boolean = false;
  selectedModeType: string | null = null;
  selectedModeIndex: number | null = null;  // selectedPriorityModeIndex: number | null = null;
  // selectedJourneyPlanningModeIndex: number | null = null;
  // selectedNoNextModeIndex: number | null = null;
  productCompletedMode = ["Integration Mode", "Performance Mode", "Extended Performance Mode", "After Extended Performance Mode"]
  toggleDebugModeParticipants() {
    this.showDebugModeParticipants = !this.showDebugModeParticipants;
  }
  constructor(
    public firestore:Firestore,
    public dialog : MatDialog,
    public guard: AuthguardService,
    public router:Router
  ) {
    // guard.getRoles().then(async roles=>{
    //   // todo
    //   // var developerAccess = roles.developer ?? false
    //   var developerAccess = true
    //   console.log(developerAccess)
    //   if(developerAccess){
        guard.getProductMap().then(product=>{
          this.mapProduct = product
        })
        this.guard.getProfileMap().then(e => {
          this.mapProfile = e.map;
        });
        this.productMode()
        this.getModes()
    //   }
    //   else{
    //     console.log("no access for mode screen");
        
    //     router.navigateByUrl('/')
    //   }
    // })
  }

  ngOnInit(): void {
    this.referencePlaylist();
    this.fetchProfileList()
  }

  ngOnDestroy(){
    if (this.productmodeSubscription) {
    this.productmodeSubscription();
  }
    if (this.profileSubscription) {
    this.profileSubscription();
  }
  }

  getModes(){
    this.loading = true
    const q = query(collection(this.firestore, 'modes'), orderBy('sequence', 'asc'));
    getDocs(q).then((modesCollection) => {
      modesCollection.forEach((doc)=>{
        var element = doc.data();
        this.modes.push(element['mode']);
      })
    this.loading = false
    })
    console.log("Modes",this.modes);
  }
  referencePlaylist(){
    // Ads Playlist
    const p = query(collection(this.firestore, 'adsplaylist'), orderBy('adstitle'));
    getDocs(p).then((playlist) => {
      playlist.forEach((doc)=>{
        var data = doc.data()
        data["title"] = data["adstitle"]
        data["value"] = doc.ref.path
        this.mapReference[data["value"]] = data["title"]
        this.adsPlaylist.push(data)
      })
    })
    // Solar Voice Playlist
    const q = query(collection(this.firestore, 'solar voice playlist'), orderBy('name'));
    getDocs(q).then((playlist) => {
      playlist.forEach((doc)=>{
        var data = doc.data()
        data["title"] = data["name"]
        data["value"] = doc.ref.path
        this.mapReference[data["value"]] = data["title"]
        this.solarVoicePlaylist.push(data)
      })
    })
    // EiFlix Playlist
    const r = query(collection(this.firestore, 'series'), orderBy('seriesName'));
    getDocs(r).then((playlist) => {
      playlist.forEach((doc)=>{
        var data = doc.data()
        data["title"] = data["seriesName"]
        data["value"] = doc.ref.path
        this.mapReference[data["value"]] = data["title"]
        this.eiflixPlaylist.push(data)
      })
    })
    // General Content Playlist
      const s = query(collection(this.firestore, 'conetent_urls'), orderBy('title'));
      getDocs(s).then((playlist) => {
        playlist.forEach((doc)=>{
        var data = doc.data()
        data["title"] = data["title"]
        data["value"] = doc.ref.path
        this.mapReference[data["value"]] = data["title"]
        this.generalcontentPlaylist.push(data)
      })
    })
    // Form List
    const t = query(collection(this.firestore, 'delivery forms'), orderBy('formaname'));
      getDocs(t).then((playlist) => {
      playlist.forEach((doc)=>{
        var data = doc.data()
        data["title"] = data["formname"]
        data["value"] = doc.ref.path
        this.mapReference[data["value"]] = data["title"]
        this.formtemplatelist.push(data)
      })
    })
  }
  productMode(){
    const colRef = collection(this.firestore, 'product mode config');
    this.productmodeSubscription = onSnapshot(colRef, (snapshot) => {
    snapshot.forEach((doc) => {
      const element = doc.data();
      const product = element['productref'].id;
      const mode = element['mode'];
      this.productmodeConfig[product + mode] = element;
      })
      // console.log(this.productmodeConfig)
    })
  }
  returnDate(number, start){
    var date = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + number, 0,0,0,0)
    date = new Date(start ? date.setHours(0, 0, 0, 0) : date.setHours(23, 59, 59, 59))
    return date
  }

  // fetchProfileList(){
  //   this.profileSubscription = this.firestore.collection("profile_data").valueChanges().subscribe(profile=>{
  //     if(this.profileList.length == 0){
  //       this.noModeChange()
  //       this.debugMode()
  //       this.nextModeChange()
  //     }
  //     this.profileList = profile
  //     this.modeProfile = this.profileList.reduce(function (r, a) {
  //       r[a['participantmode']] = r[a['participantmode']] || []
  //       r[a['participantmode']].push(a["profileid"])
  //       return r
  //     },{})
  //   })
  // }
  fetchProfileList(){
    const colRef = collection(this.firestore, "participantdashboard");
    const q = query(colRef,
    where('customerstatus', '==', 'active'),
    where('financialstatus', 'in', ['defaulted', 'regular'])
    );

  this.profileSubscription = onSnapshot(q, (snapshot) => {
    const profile = snapshot.docs.map(doc => doc.data());
      if(this.profileList.length == 0){
        this.noModeChange()
        this.debugMode()
        this.nextModeChange()
      }
      this.profileList = profile
      this.modeProfile = this.profileList.reduce(function (r, a) {
        r[a['participantmode']] = r[a['participantmode']] || []
        r[a['participantmode']].push(a["profileid"])
        return r
      },{})
    })
  }
  debugMode(){
    const q = query( collection(this.firestore, 'participantsproduct'),  where('nextmodedate', '<', new Date()) );
    getDocs(q).then(product => {
      this.debugModeList = product.docs.map(e => e.data())
    })
    // console.log(this.debugModeList.length);    
  }
  noModeChange(){
    this.loading = true
    const q = query( collection(this.firestore, 'participantsproduct'), where('mode', 'in', ["Journey Planning Mode", "Journey Priority Planning Mode", "Priority Mode"])
    );
    getDocs(q).then(list => {
      var productModeGroup = {}
      for (let i = 0; i < list.docs.length; i++) {
        const doc = list.docs[i];
        var data = doc.data()
        productModeGroup[data["productref"].id + "_" + data["mode"]] = productModeGroup[data["productref"].id + "_" + data["mode"]] ?? []
        productModeGroup[data["productref"].id + "_" + data["mode"]].push(data)
      }
      // console.log("Group No Next Mode Length", Object.keys(productModeGroup).length)
      for (const key in productModeGroup) {
        var splitKey = key.split("_")
        var productid = splitKey[0]
        var currentmode = splitKey[1]
        var firstProduct = productModeGroup[key][0]
        var groupData = {
          productid: productid,
          currentmode: currentmode,
          nextmode: firstProduct["nextmode"],
          hierarchyprofile: [],
          participantprofile: [],
          hierarchyproduct: productModeGroup[key].filter(e => (this.modeProfile[currentmode] ?? []).includes(e["profileid"])),
          participantproduct: productModeGroup[key]
        }
        groupData.hierarchyprofile = Array.from(new Set(groupData.hierarchyproduct.map(e => e["profileid"])))
        groupData.participantprofile = Array.from(new Set(groupData.participantproduct.map(e => e["profileid"])))
        this.noNextModeList.push(groupData)
        if(currentmode == "Priority Mode"){
          this.priorityModeList.push(groupData)
        }
        else{
          this.journeyPlanningModeList.push(groupData)
        }        
      }
      this.loading = false
    })
  }
  nextModeChange(){
    this.loading = true
    var startDate = this.returnDate(this.startDay, true)
    var endDate = this.returnDate(this.endDay, false)
    // console.log("Start - ", this.startDay, "---", startDate)
    // console.log("End - ", this.endDay, "---", endDate)
    var nextmodedata = []
    const q = query(
    collection(this.firestore, 'participantsproduct'),  where("nextmodedate", ">=", startDate),  where("nextmodedate", "<=", endDate));
    getDocs(q).then(list => {
      var productModeGroup = {}
      for (let i = 0; i < list.docs.length; i++) {
        const doc = list.docs[i];
        var data = doc.data()
        productModeGroup[data["productref"].id + "_" + data["mode"]] = productModeGroup[data["productref"].id + "_" + data["mode"]] ?? []
        productModeGroup[data["productref"].id + "_" + data["mode"]].push(data)
      }
      // console.log("Group Length", Object.keys(productModeGroup).length)
      for (const key in productModeGroup) {
        var splitKey = key.split("_")
        var productid = splitKey[0]
        var currentmode = splitKey[1]
        var firstProduct = productModeGroup[key][0]
        var groupData = {
          productid: productid,
          currentmode: currentmode,
          nextmode: firstProduct["nextmode"],
          hierarchyprofile: [],
          participantprofile: [],
          hierarchyproduct: productModeGroup[key].filter(e => (this.modeProfile[currentmode] ?? []).includes(e["profileid"])),
          participantproduct: productModeGroup[key]
        }
        groupData.hierarchyprofile = Array.from(new Set(groupData.hierarchyproduct.map(e => e["profileid"])))
        groupData.participantprofile = Array.from(new Set(groupData.participantproduct.map(e => e["profileid"])))
        nextmodedata.push(groupData)
      }
      this.nextModeList = nextmodedata
      console.log("nextmodelist",this.nextModeList);
      this.loading = false
    }) 
  }
  updateConfig(mode, product){
    window.scrollTo({
      top : 0,
      behavior: 'auto',
    })
    // console.log("updateconfig",product+mode);    
    setTimeout(() => {
      var data = this.productmodeConfig[product+mode] ?? {
        productref: doc(this.firestore, `products/${product}`),
        mode: mode
      }
      // console.log(mode, product, data)
      this.dialog.open(ProductModeConfigupdateComponent, {
        data : {
          config: data,
          product: product,
          reference: {
            adsplaylist: this.adsPlaylist,
            solarvoiceplaylist: this.solarVoicePlaylist,
            eiflixplaylist: this.eiflixPlaylist,
            generalcontentplaylist: this.generalcontentPlaylist,
            formlist: this.formtemplatelist
          }
        },
        maxHeight: "90vh",
        maxWidth: "90vw"
      })
    }, 0);
  }

  selectMode(type: string, index: number): void {
    this.selectedModeType = type;
    this.selectedModeIndex = index;
    this.showDebugModeParticipants = false;
  }
  // selectPriorityMode(index: number): void {
  //   this.selectedModeIndex = index;
  // }

  // selectJourneyPlanningMode(index: number): void {
  //   this.selectedModeIndex = index;
  // }

  // selectNoNextMode(index: number): void {
  //   this.selectedNoNextModeIndex = index;
  // }

  updateNextMode() {
    if (this.selectedModeIndex !== null) {    
      this.showDropdownAndDatePicker = !this.showDropdownAndDatePicker;
    } else {
      console.log('No mode selected.');
    }
  }

  async updateComplete(){
    if(this.selectedCurrentMode && this.selectedNextMode && this.selectedNextModeDate){
      const db = getFirestore(); 
      const batch = writeBatch(db);
      console.log(this.selectedCurrentMode, this.selectedNextMode, this.selectedNextModeDate)
      var participantProducts = []
      const selectedModeData = this.nextModeList[this.selectedModeIndex];
      if (this.hierarchyMode && selectedModeData['hierarchyproduct'].length) {
        participantProducts = selectedModeData['hierarchyproduct']
      }
      if (!this.hierarchyMode && selectedModeData['participantproduct'].length) {
        participantProducts = selectedModeData['participantproduct']
      }
      console.log(participantProducts)
      for (let i = 0; i < participantProducts.length; i++) {
        const element = participantProducts[i];
        const docRef = doc(this.firestore, "participantsproduct", element["docid"]);
        batch.update(docRef, {
          mode: this.selectedCurrentMode,
          nextmode: this.selectedNextMode,
          nextmodedate: this.selectedNextModeDate
        })
      }
      var loading = this.dialog.open(LoadingProgressComponent, {
        data: {
         msg: "Updating..."
       }
      })
      await batch.commit().then(() =>{
        this.selectMode(null, null)
        this.selectedCurrentMode = null
        this.selectedNextMode = null
        this.selectedNextModeDate = null
        this.nextModeChange()
      }).catch(err =>{
        console.log(err)
      })
     // loading.close()
    }    
  }

}


