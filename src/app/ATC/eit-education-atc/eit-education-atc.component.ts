import { Component, OnInit } from '@angular/core';
import { collection, Firestore ,collectionData, where,query,doc,getDoc,updateDoc,orderBy,onSnapshot,getDocs} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { SelectValidatorComponent } from '../../DialogBox/select-validator/select-validator.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-eit-education-atc',
  standalone :true,
  imports: [
    FormsModule,
    CommonModule,
    MatSelectModule,
    MatInputModule,
    MatOptionModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
  ],
  templateUrl: './eit-education-atc.component.html',
  styleUrls: ['./eit-education-atc.component.css']
})

export class EitEducationAtcComponent implements OnInit {
  loggedinID:string
  participantList:any [] = []
  mapATCByProfile:any = {}
  mapATC:any = {}
  showatc:boolean = false
  selectedATCId:any = null
  selectedATCDoc:any = null
  mapProcedures:any = {}
  mapATCTrajectory:any = {}
  noActiveQueue:boolean = false
  messageForNoActiveQueue = "There is no active Diagnostics or Consultation Queue at the moment"
  isParticipant:boolean = false 
  filterText:string = null
  filteredSpecialist:any [] = []
  listOfSpecialist:any [] = []
  selectedParticipantid:string = null
  showFinalView:boolean = false
  mentoringView:boolean = false
  queueList:any = []
  get loading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:"Processing Please wait"},disableClose:true})
  }
  ongoingQueue:any = null
  mapProfile:any = []
  queueParticipants:any [] = []
  chosenParticipant:string = null
  onViewParticipantList:boolean = false
  onViewSelectedParticipantATC:boolean = false
  onViewSelectedParticipantConsolidatedATC:boolean = false
  filteredParticipants:any [] = []
  mentorProfile:any [] = []
  viewallatc:boolean = false
  selfMentoringEnabled:boolean = false
  mentor:boolean = false
  //filter
  participantFilterValue = ''
  statusFilterValue = ''

  constructor(public guard: AuthguardService, public firestore: Firestore, public router: Router,public dialog : MatDialog) {
    let loadingref = this.loading
    guard.getRoles().then(roles=>{
      guard.getProfileMap().then(e => this.mapProfile = e.map)
      this.loggedinID = roles.profile_ref.id
      const queueCollection = collection(this.firestore, "queue generation");
      collectionData(queueCollection, { idField: 'id' }).subscribe(async snap => {        
        this.queueList = snap
        if(this.queueList.length === 0){
          this.noActiveQueue = true
        }
      })
      if(roles.ah || roles.admin || roles.developer){
        this.viewallatc = true
      }else if(roles.mentor){
        this.mentor = true
      }else if(roles.selfmentoring){
        this.selfMentoringEnabled = true
      }
      // else{
      //   loadingref.close()
      //   alert("Unauthorized access")
      //   this.router.navigateByUrl("/")
      // }
      loadingref.close()
    })
  }

  ngOnInit(): void {
   const proceduresRef = collection(this.firestore, 'procedures');
   getDocs(proceduresRef).then(async snap => {     
     for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        const elementid = snap.docs[i].id
        this.mapProcedures[elementid] = element['name']
      }
    })

    const userRolesRef = query(collection(this.firestore, 'users_roles'), orderBy('name')  );
      onSnapshot(userRolesRef, async (userRolesSnap) => {
      this.mentorProfile = [];
      for (let j = 0; j < userRolesSnap.docs.length; j++) {
        const role = userRolesSnap.docs[j].data();
        if(role["mentor"] === true){
          this.mentorProfile.push(role["profile_ref"]["id"])
        }
      }
    })
  }

  async getOngoingQueue(){
    let loadingref = this.loading
    const qref = query( collection(this.firestore, 'queue generation'), orderBy('queueenddate', 'desc'));
    await getDocs(qref).then(async queuesnapshot => {      this.ongoingQueue = queuesnapshot.docs[0].data()
      if(this.ongoingQueue['queuestartdate'].toDate() < new Date() && this.ongoingQueue['queueenddate'].toDate() > new Date()){
        loadingref.close()
      }else{
        loadingref.close()
        this.noActiveQueue = true
      }
    })
  }

  filterSpecialist(){
    let filterValue = ![null,undefined,""].includes(this.filterText) ? this.filterText.replace(/\s+/g,"").trim().toLowerCase() : ''
    return this.filteredSpecialist = this.listOfSpecialist.filter(e => this.mapProfile[e].toLowerCase().indexOf(filterValue) === 0)
  }

  getSpecialist(){
    this.listOfSpecialist = []
    const snap = this.ongoingQueue
    let list = [...snap['changeworkperson'] ?? [],...snap['consultationperson'] ?? [],...snap['diagnosticsperson'] ?? [],...snap['reviewperson'] ?? [],...snap['ahperson'] ?? [],...snap['videologperson'] ?? []]
    for (let i = 0; i < list.length; i++) {
      const element = list[i];
      if(!this.listOfSpecialist.includes(element)){
        this.listOfSpecialist.push(element)
      }
    }
    this.filterSpecialist()
    this.isParticipant ? this.getTheirATC(this.loggedinID) : this.getParticipantList(this.loggedinID)
  }

  

  onSpecialistSelect(value:string){
    this.getParticipantList(value)
  }

 async getParticipantList(profileId:string){
    let loadingref = this.loading
    this.participantList = []
    let profileref = doc(this.firestore, "profile_data", profileId);
    let mapParticipantsToATC={}
    const atcAlphaQuery = query( collection(this.firestore, "atc_alpha"), where("queueid", "==", this.ongoingQueue['docid']), orderBy("prescription_date", "asc"));
    await getDocs(atcAlphaQuery).then(async alphasnap => {      
      for (let j = 0; j < alphasnap.docs.length; j++) {
        const alphaelement = alphasnap.docs[j].data();
        alphaelement['atcref'] = alphasnap.docs[j].ref
        //checking precribed atc profile
        // let checkauthor = false
        if(![null,undefined].includes(alphaelement['author'])){
          alphaelement['author'].forEach(e => {
            if(e.id === profileref.id){
              // checkauthor = true
              if(!this.participantList.includes(alphaelement['profileid'])){
                this.participantList.push(alphaelement['profileid'])
              }
            }
          });
        }
        if(![null,undefined].includes(alphaelement['validator'])){
          alphaelement['validator'].forEach(e => {
            if(e.id === profileref.id){
              if(!this.participantList.includes(alphaelement['profileid'])){
                this.participantList.push(alphaelement['profileid'])
              }
            }
          });
        }

        if(this.participantList.includes(alphaelement['profileid'])){
          mapParticipantsToATC[alphaelement['profileid']] = mapParticipantsToATC[alphaelement['profileid']] || []
          mapParticipantsToATC[alphaelement['profileid']].push(alphaelement)
        }

      }
    })
    this.mapATCByProfile = mapParticipantsToATC
    //
    // console.log(this.participantList);
    // console.log(this.mapATCByProfile);
    loadingref.close()
    // this.getATCByParticipantList()
  }

  checkdata(){
    return Object.keys(this.mapATCByProfile).length != 0
  }

  async onSelectFinalView(profileid){
    this.selectedParticipantid = profileid
    this.showatc = false
    this.showFinalView = true
    this.mentoringView = false
    for (let i = 0; i < this.mapATCByProfile[profileid].length; i++) {
      const element = this.mapATCByProfile[profileid][i];
      await this.getAdjustments(element)
    }
  }

  // version 2
  getParticipantListBySelectedQueue(){
    let loadingref = this.loading
    this.queueParticipants = []
    const atcAlphaRef = collection(this.firestore, "atc_alpha");
    const q = query( atcAlphaRef, where("queueid", "==", this.ongoingQueue['docid']), where("type", "==", "online"));
    onSnapshot(q, async alphasnap => {      
      for (let i = 0; i < alphasnap.docs.length; i++) {
        const element = alphasnap.docs[i].data();
        element['atcref'] = alphasnap.docs[i].ref
        element['status'] = element['status'] != null || element['status'] != undefined ? element['status'] : 'validated'
        if(element['isdelete'] != true ){
          if(element['status'] === 'validated'){
            this.queueParticipants.push(element)
          }
        }
      }
      if(this.viewallatc){
        this.filteredParticipants = this.queueParticipants.sort((a,b)=> a.prescription_date.toDate() - b.prescription_date.toDate())
      }else if(this.mentor || this.selfMentoringEnabled){
        this.filteredParticipants = this.queueParticipants.filter(e => {
          if(e.author != null ? e.author.some(ref => ref.id === this.loggedinID) : false) return e
          else if(e.validator != null ? e.validator.some(ref => ref.id === this.loggedinID) : false) return e 
        }).sort((a,b)=> a.prescription_date.toDate() - b.prescription_date.toDate())
      }
      // this.filteredParticipants = this.queueParticipants.sort((a,b)=> a.prescription_date.toDate() - b.prescription_date.toDate())
    })
    const atcToValidateRef = collection(this.firestore, "atc_to_validate");
    const p = query(atcToValidateRef,where("queueid", "==", this.ongoingQueue['docid']),where("type", "==", "online"),orderBy("prescription_date", "desc"));
    onSnapshot(p, async alphasnap => {
    for (let i = 0; i < alphasnap.docs.length; i++) {
      const element = alphasnap.docs[i].data();
      element['atcref'] = alphasnap.docs[i].ref;
      if (element['status'] === "atc given") {
        this.queueParticipants.push(element);
      }
    }
      if(this.viewallatc){
        this.filteredParticipants = this.queueParticipants.sort((a,b)=> a.prescription_date.toDate() - b.prescription_date.toDate())
      }else if(this.mentor || this.selfMentoringEnabled){
        this.filteredParticipants = this.queueParticipants.filter(e => {
          if(e.author != null ? e.author.some(item => item.id === this.loggedinID) : false) return e
          else if(e.validator != null ? e.validator.some(item => item.id === this.loggedinID) : false) return e 
        }).sort((a,b)=> a.prescription_date.toDate() - b.prescription_date.toDate())
      }
      // this.filteredParticipants = this.queueParticipants.sort((a,b)=> a.prescription_date.toDate() - b.prescription_date.toDate())
      loadingref.close()
      this.statusFilterValue = ''
      this.showParticipants()
    })
  }

  async getTheirATC(profileId:string){
    let loadingref = this.loading
    this.chosenParticipant = profileId
    const profileref = doc(this.firestore, "profile_data", profileId);
    this.mapATCByProfile[profileId] = []
    const q = query(
    collection(this.firestore, "atc_to_validate"), where("queueid", "==", this.ongoingQueue['docid']), where("profileid", "==", profileref.id),  where("type", "==", "online"),  orderBy("prescription_date", "asc"));
    const alphasnap = await getDocs(q);
        for (let j = 0; j < alphasnap.docs.length; j++) {
        const alphaelement = alphasnap.docs[j].data();
        alphaelement['atcref'] = alphasnap.docs[j].ref
        if(alphaelement['status'] === 'atc given'){
          if(this.viewallatc || this.mentor){
            this.mapATCByProfile[alphaelement['profileid']].push(alphaelement)
            this.getAdjustments(alphaelement)
          }else if(this.selfMentoringEnabled){
            alphaelement['author'] = alphaelement['author'] || [] 
            alphaelement['validator'] = alphaelement['validator'] || []
            if(alphaelement['author'].some((profileref:any) => profileref.id === this.loggedinID) || alphaelement['validator'].some((profileref:any) => profileref.id === this.loggedinID)){
              this.mapATCByProfile[alphaelement['profileid']].push(alphaelement)
              this.getAdjustments(alphaelement)
            }
          }
        }
      }
    
    const atcAlphaQuery = query(collection(this.firestore, "atc_alpha"), where("queueid", "==", this.ongoingQueue['docid']), where("profileid", "==", profileref.id), where("type", "==", "online"),orderBy("prescription_date", "asc"));
    getDocs(atcAlphaQuery).then(async alphasnap => {
      for (let j = 0; j < alphasnap.docs.length; j++) {
        const alphaelement = alphasnap.docs[j].data();
        alphaelement['atcref'] = alphasnap.docs[j].ref
        if(alphaelement['isdelete'] != true){
          if(this.viewallatc || this.mentor){
            this.mapATCByProfile[alphaelement['profileid']].push(alphaelement)
            this.getAdjustments(alphaelement)
          }else if(this.selfMentoringEnabled){
            alphaelement['author'] = alphaelement['author'] || [] 
            alphaelement['validator'] = alphaelement['validator'] || []
            if(alphaelement['author'].some((profileref:any) => profileref.id === this.loggedinID) || alphaelement['validator'].some((profileref:any) => profileref.id === this.loggedinID)){
              this.mapATCByProfile[alphaelement['profileid']].push(alphaelement)
              this.getAdjustments(alphaelement)
            }
          }
        }
      }
    })
    this.mapATCByProfile[profileId].sort((a,b) => a.prescription_date.toDate() - b.prescription_date.toDate())
    // console.log("map atc by profile",this.mapATCByProfile);
    this.showSelectedParticipantATC()
    loadingref.close()
  }

  async getAdjustments(atcdoc:any){
    let checklength = ![null,undefined].includes(this.mapATCTrajectory[atcdoc['atcid']]) ? this.mapATCTrajectory[atcdoc['atcid']].length : 0
    if(checklength === 0){
      let atcList = []
      atcList.push(atcdoc.atcref)
      for (let i = 0; i < atcList.length; i++) {
        const element = atcList[i];
        const atcDocRef = doc(this.firestore, element.path); 
        const atcsnap = await getDoc(atcDocRef);             
        const atcelement = atcsnap.exists() ? atcsnap.data() : null;
        if (atcelement != null) {
        atcelement['atcref'] = atcsnap.ref;
        if (![null, undefined].includes(atcelement['editedfrom'])) {
          atcList.push(atcelement['editedfrom']); 
            }
            atcelement['prescription'] = []
            const correctionsCol = collection(atcDocRef, "corrections");
            const correctionsnap = await getDocs(correctionsCol);
              for (let j = 0; j < correctionsnap.docs.length; j++) {
                const correctionelement = correctionsnap.docs[j].data();
                const correctionElementRef = correctionsnap.docs[j].ref
                correctionelement['procedures'] = []
                const proceduresCol = collection(correctionElementRef, "procedures");
                const proceduresnap = await getDocs(proceduresCol);
                  for (let k = 0; k < proceduresnap.docs.length; k++) {
                    const procedureelement = proceduresnap.docs[k].data();
                    correctionelement['procedures'].push(procedureelement)
                  }
                atcelement['prescription'].push(correctionelement)
              }
            this.mapATC[element['path']] = atcelement
          }
      }
      this.mapATCTrajectory[atcdoc['atcid']] = atcList
      // console.log(this.mapATCTrajectory);
    }
  }

  showParticipants(){
    this.onViewParticipantList = true
    this.onViewSelectedParticipantATC = false
    this.onViewSelectedParticipantConsolidatedATC = false
  }

  showSelectedParticipantATC(){
    this.onViewParticipantList = false
    this.onViewSelectedParticipantATC = true
    this.onViewSelectedParticipantConsolidatedATC = false
  }

  showConsolidateATCView(){
     this.onViewParticipantList = false
    this.onViewSelectedParticipantATC = false
    this.onViewSelectedParticipantConsolidatedATC = true
  }

  filterparticipantname(){
    // const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    let filterParticipant = ![null,undefined,].includes(this.participantFilterValue) ? this.participantFilterValue.trim().toLowerCase() : ''
    return this.filteredParticipants = this.queueParticipants.filter(e => this.mapProfile[e.profileid].toLowerCase().indexOf(filterParticipant) === 0 && e.status.indexOf(this.statusFilterValue) === 0 )
  }

  filterAlphaAtc(array){
    return array.filter(e => e.atcref.path.indexOf("atc_alpha") === 0)
  }

  onEditATC(atc:any){
    let collectionname  = atc.atcref.path.indexOf("atc_alpha") === 0 ? "atc_alpha" : "atc_to_validate"
    var url = this.router.serializeUrl(this.router.createUrlTree(['/editATC/' + atc.atcid + "/"+ collectionname]));
    console.log("ATC URL : ",url);
     window.open(url, '_blank')
  }

  onCancelATC(atc: any) {
    if (confirm("are you sure")) {
      const atcDocRef = doc(this.firestore, atc.atcref.path); 
      updateDoc(atcDocRef, {
        isdelete: true,
        status: 'cancelled'
      }).then(() => {
        this.getTheirATC(atc.profileid);
        console.log("atc deleted", atc.atcref.path);
      }).catch(err => {
        console.log(err);
      });
    }
  }

  onValidateATC(atc: any, status: string) {
    let loadingref = this.dialog.open(SelectValidatorComponent, { data: { type: "selectvalidator" }, disableClose: true });
    loadingref.afterClosed().toPromise().then((result) => {
      let validators = [];
      var resultList = result ?? [];
      resultList.forEach((e: any) => validators.push(e.profile_ref));
      if (atc['validator'] != null) {
        validators = [...validators, ...atc['validator']];
      }
      const atcDocRef = doc(this.firestore, atc.atcref.path); 
      updateDoc(atcDocRef, {
        status: 'validated',
        validator: validators
      }).then(() => {
        this.getTheirATC(atc.profileid);
        console.log("atc validated", atc.atcref.path);
      }).catch(err => {
        console.log(err);
      });
    });
  }

  onInvalidateATC(atc: any, status: string) {
    if (confirm("are you sure")) {
      const atcDocRef = doc(this.firestore, atc.atcref.path); 
      updateDoc(atcDocRef, {
        isdelete: true,
        status: 'unvalidated'
      }).then(() => {
        this.getTheirATC(atc.profileid);
        console.log("atc unvalidated", atc.atcref.path);
      }).catch(err => {
        console.log(err);
      });
    }
  }

  compareFn(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.id === c2.id : c1 === c2;
  }
}