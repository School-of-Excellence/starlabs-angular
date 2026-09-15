import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { FormGroup, Validators, FormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, arrayUnion, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatListModule } from '@angular/material/list';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-plan-activity',
  imports: [
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDividerModule,
    ReactiveFormsModule,
    FormsModule,
    MatDatepickerModule,
    MatListModule,
    MatTimepickerModule,
    MatInputModule,
    MatSnackBarModule
  ],
  templateUrl: './plan-activity.component.html',
  styleUrl: './plan-activity.component.css',
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanActivityComponent {

  mapProfile = {};
  loggedInProfileData = {};
  mapProductidtoatcmodel : any = {};
  profilerole = {}
  mapBigParticipantsAssignments = {}
  mapAssignmentType = {
    'Zoom Call' : true,
    'Form' : true,
    'Triple ATC' : false,
    'ATC' : false,
    'Manual Assignment' : false,
    'Video' :false
  };

  forms = [];
  videos = [];
  colors = ['#4D779D', '#FF5733', '#33FF57'];
  productLists = [];
  productAvailable = [];
  filteredOptionalCohorts = [];
  removedParticipantslist = [];
  selectedParticipants = [];
  assignmentType = [
    {type : 'Zoom Call',linkrequired:true},
    {type : 'Form',linkrequired:true},
    {type : 'Triple ATC',linkrequired:false},
    {type : 'ATC',linkrequired:false},
    {type : 'Video',linkrequired:false},
    {type : 'Manual Assignment',linkrequired:false},
  ];
  bigAssignmentList = [];
  individualParticipants = []; 
  mentorProfiles = []
  selectedParticipantIds: any[] = [];

  formType = 'new'
  allowNotification = true

  assignmentForm!:FormGroup
  currentDate: Date = new Date();
  private subscription = new Subject<void>();
  mandatoryCohortsSubscription:Subscription;

  constructor(
    private firestore : Firestore,
    public dialogRef : MatDialogRef<PlanActivityComponent>,
    @Inject(MAT_DIALOG_DATA) public data : any,
    private fb : FormBuilder,
    private auth: AuthguardService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ){
    this.assignmentForm = this.fb.group({
      docid:[null,],
      title:[null,Validators.required],
      description:[null,Validators.required],
      startdate:[null,Validators.required],
      enddate:[null,Validators.required],
      createddate:[null,],
      assignmenttype:[null,Validators.required],
      actionlink:[null,],
      zoomhostemail:[null,],
      selectedform:[null,],
      selectedvideos:[null,],
      regeneratemeeting:[false,],
      directive:[null,],
      product:[null,],
      notification : this.fb.group({
        app:[false,],
        email:[false,],
        message:[null,]
      }),
      participantlist: [[],],
      participantidlist: [[],],
      watinotification:[false],
      selectedAdmin:[[],Validators.required],
      participantidbycohorts: this.fb.group({}),
      selectionMode: ['group'],
      mandatorycohortsid:[[],],
      optionalcohortsid:[[],],
      touchpoints:[false,],
      mentoringpivots:[false,],
      lastupdateddate:[null,],
      createdprofileref:[null,],
      // editedprofileref:[[],]
      cohortsref:[null,],
      marathonref:[null,],
      requireregistration:[null,],
      requirevalidation:[null,],
      status:['initiated',Validators.required]
    })
    this.auth.username().then((e) => {
      this.loggedInProfileData = e
    })

    getDocs(collection(this.firestore,"delivery forms")).then(snap => {
      this.forms = snap.docs.map(e => e.data())
    });

    collectionSnapshots(query(collection(this.firestore,"users_roles"),where('mentor','==',true))).pipe(takeUntil(this.subscription)).subscribe(roles=>{
      console.log(roles.length);
      let list = [];
      for (let i = 0; i < roles.length; i++) {
        const doc = roles[i];
        if (![null,undefined].includes(doc.data()['profile_ref'])) {
          list.push(doc.data()["profile_ref"].id)
        }
      }
      this.mentorProfiles = list;
      console.log(this.mentorProfiles,"mentor profiles");
    })
    if(this.data.type === 'edit'){
      let assignmentref = doc(this.firestore,"big assignment",this.data.assignmentdoc.docid)
      console.log(assignmentref,"consoling doc id");
      getDocs(query(collection(this.firestore,"big participants assignments"),where("assignmentref",'==',assignmentref))).then(bpa=>{
        bpa.docs.forEach((doc)=>{
          const element = doc.data()
          this.mapBigParticipantsAssignments[element['profileid']] = element['status'];
          // console.log(doc.data(),"snap.docs.map(e => e.data())");
        })
      })
    }
    this.mapProfile = this.data.mapProfile;
    // this.removeCommonElements(this.selectedParticipants, this.participantslist);    
    if(this.data.doc['docid']){    
      const currentCohortId = this.data.doc['docid'];
      const initialMandatoryCohorts = this.assignmentForm.controls['mandatorycohortsid'].value;
      if (!initialMandatoryCohorts.includes(currentCohortId)) {
        initialMandatoryCohorts.push(currentCohortId);
      }  
      let participants = []
      this.data.doc['participantidlist'].forEach((e)=>{
        participants.push({participantid: e,cohortname: this.data.doc['name'], cohortid: this.data.doc['docid']})
      })
      this.assignmentForm.controls['participantlist'].setValue(participants);
      // this.selectedParticipantIds = participants.map(p => p.participantid);
      this.selectedParticipantIds = participants.map(p => ({
        participantid: p.participantid,
        cohortid: p.cohortid,
        cohortname:p.cohortname
      }))
      this.individualParticipants = [];
      this.data.cohortslist.forEach(cohort =>{
        cohort.participantidlist?.forEach(participantid=>{
          this.individualParticipants.push({
            participantid: participantid,
            cohortid: cohort.docid, 
            cohortname: cohort.name
          })
        })
      })      
      // this.selectedParticipantIds = this.individualParticipants.filter(ip => 
      //   participants.some(p => p.participantid === ip.participantid)
      // );
      collectionSnapshots(query(collection(this.firestore,"big assignment"),where("cohortsref","==",doc(this.firestore,"big cohorts",this.data.doc['docid'])))).pipe(takeUntil(this.subscription)).subscribe(snap => {
        this.bigAssignmentList = snap
      });
      this.assignmentForm.controls['mandatorycohortsid'].setValue(initialMandatoryCohorts);

      getDocs(query(collection(this.firestore,"content_urls"))).then((content) => {
        this.videos = content.docs.map(e => ({docref: e.ref,...e.data()}));
      }).then(()=>{
        if(this.data.type === 'new'){
          this.formType = "new"
        }else if(this.data.type === 'edit'){
          console.log(this.data,"edit console");
          this.formType = "edit"
          let startDate = this.formatDateTimeLocal(this.data.assignmentdoc.startdate.toDate())
          let endDate = this.formatDateTimeLocal(this.data.assignmentdoc.enddate.toDate())
          console.log("startDate",startDate,"endDate",endDate);
          
          this.assignmentForm.patchValue({
            docid:this.data.assignmentdoc.docid,
            title:this.data.assignmentdoc.title,
            description:this.data.assignmentdoc.description,
            selectedAdmin:this.data.assignmentdoc.selectedAdmin,
            product:this.data.assignmentdoc.product ?? null,
            // startdate:this.data.assignmentdoc.startdate.toDate(),
            // enddate:this.data.assignmentdoc.enddate.toDate(),
            startdate:startDate ,
            enddate: endDate,
            createddate:this.data.assignmentdoc.createddate.toDate(),
            assignmenttype:this.data.assignmentdoc.assignmenttype,
            actionlink:this.data.assignmentdoc.actionlink ?? null,
            zoomhostemail:this.data.assignmentdoc.zoomhostemail ?? null,
            regeneratemeeting : this.data.assignmentdoc.regeneratemeeting ?? false,
            participants: ![null, undefined, ""].includes(this.data.participants) ? this.data.participants : [],
            directive:this.data.assignmentdoc.directive ?? null,
            notification : this.fb.group({
              app:this.data.assignmentdoc['notification']['app'],
              email:this.data.assignmentdoc['notification']['email'],
              message:this.data.assignmentdoc['notification']['message']
            }),
            //nanda
            participantlist: this.data.assignmentdoc.participantlist ?? null,
            participantidlist: this.data.assignmentdoc.participantidlist ?? null,
            watinotification:this.data.assignmentdoc.watinotification ?? null,
            participantidbycohorts: this.data.assignmentdoc.participantidbycohorts ?? null,
            selectionMode:this.data.assignmentdoc.selectionMode ?? null,
            //end
            mandatorycohortsid:this.data.assignmentdoc.mandatorycohortsid,
            optionalcohortsid:this.data.assignmentdoc.optionalcohortsid,
            touchpoints:this.data.assignmentdoc.touchpoints,
            mentoringpivots:this.data.assignmentdoc.mentoringpivots,
            cohortsref:this.data.assignmentdoc.cohortsref,
            marathonref:this.data.assignmentdoc.marathonref,
            requireregistration : this.data.assignmentdoc.requireregistration,
            requirevalidation : this.data.assignmentdoc.requirevalidation,
            status : this.data.assignmentdoc.status,
            selectedform : this.data.assignmentdoc.selectedform,
            selectedvideos : this.data.assignmentdoc.selectedvideos
          });
          this.filteredOptionalCohorts = this.data.cohortslist.filter((e:string) => !this.data.assignmentdoc.mandatorycohortsid.includes(e['docid']))
        }
      });
    }
  }

  combineDateAndTime(date: Date, time?: Date): Date {
    if (!date) return null;

    const combined = new Date(date);

    if (time) {
      combined.setHours(time.getHours());
      combined.setMinutes(time.getMinutes());
      combined.setSeconds(time.getSeconds());
    }

    return combined;
  }

  onSelectionChange() {
    const selectedParticipants = this.selectedParticipantIds.map(id => {
      return { participantid: id['participantid'], cohortname: id['cohortname'], cohortid: id['cohortid'] };
    });
    this.removedParticipantslist = this.removedParticipantslist.filter(
      removed => !selectedParticipants.some(p => p.participantid === removed.participantid)
    );
    this.assignmentForm.controls['participantlist'].setValue(selectedParticipants);
    this.updateParticipantsByCohorts();    
  }

  setSelectionMode(mode: 'group' | 'individual'): void {
    if (this.assignmentForm.controls['selectionMode'].value === mode) {
      return;
    }
    const hasParticipants = this.assignmentForm.controls['participantlist'].value.length > 0;
    if (hasParticipants) {
      if (confirm('Changing selection mode will clear current participant selection. Continue?')) {
        if (this.assignmentForm.controls['selectionMode'].value === 'group') {
          this.assignmentForm.controls['mandatorycohortsid'].setValue([]);
        } else {
          this.selectedParticipantIds = [];
        }
        this.assignmentForm.controls['participantlist'].setValue([]);
        this.updateParticipantsByCohorts();
        this.removedParticipantslist = [];
        this.assignmentForm.controls['selectionMode'].setValue(mode);
      }
    } else {
      this.assignmentForm.controls['selectionMode'].setValue(mode);
    }
  }

  setNotification(value: boolean): void {
    this.assignmentForm.controls['watinotification'].setValue(value);
  }
  ngOnInit(): void {

    this.mandatoryCohortsSubscription = this.assignmentForm.get("mandatorycohortsid").valueChanges.subscribe(value => {
      if(value){
        return this.filteredOptionalCohorts = this.data.cohortslist.filter((e:string) => !value.includes(e['docid']))
      };
    });

    // getDocs(collection(this.firestore,"delivery forms")).then(snap => {
    //   this.forms = snap.docs.map(e => e.data())
    // });

    collectionSnapshots(query(collection(this.firestore,"products"),orderBy("atcmodel"))).pipe(takeUntil(this.subscription)).subscribe(products=>{
      this.productAvailable = products
      this.productLists = Array.from(new Map(products.map(item => [item["atcmodel"], item])).values());
      for (let i = 0; i < this.productLists.length; i++) {
        this.mapProductidtoatcmodel[this.productLists[i]['id']] = this.productLists[i]['atcmodel']
      };
    });
  }

  ngOnDestroy(){
    this.subscription.next();
    this.subscription.complete();
    this.mandatoryCohortsSubscription.unsubscribe();
  }

  onPatchAssignmentToForm(doc:any){
    console.log(doc);
    
    this.formType = "edit"
    this.assignmentForm.patchValue({
      docid:doc.docid,
      title:doc.title,
      description:doc.description,
      selectedAdmin:doc.selectedAdmin,
      startdate: this.formatDateTimeLocal(doc.startdate.toDate()),
      enddate: this.formatDateTimeLocal(doc.enddate.toDate()),
      createddate:doc.createddate.toDate(),
      assignmenttype:doc.assignmenttype,
      actionlink:doc.actionlink ?? null,
      zoomhostemail:doc.zoomhostemail ?? null,
      regeneratemeeting : doc.regeneratemeeting ?? false,
      directive:doc.directive ?? null,
      notification : this.fb.group({
        app:doc['notification']['app'],
        email:doc['notification']['email'],
        message:doc['notification']['message']
      }),
      mandatorycohortsid:doc.mandatorycohortsid,
      optionalcohortsid:doc.optionalcohortsid,
      touchpoints:doc.touchpoints,
      mentoringpivots:doc.mentoringpivots,
      cohortsref:doc.cohortsref,
      marathonref:doc.marathonref,
      requireregistration : doc.requireregistration,
      requirevalidation : doc.requirevalidation,
      status : doc.status,
      selectedvideos : doc.selectedvideos
    })
    this.filteredOptionalCohorts = this.data.cohortslist.filter((e:string) => !doc.mandatorycohortsid.includes(e['docid']))
  }

  formatDateTimeLocal(date: Date): string {
    if (!date) return '';
    console.log(date);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  onSubmit(){
    this.updateParticipantsByCohorts();
    const startDate = new Date(this.assignmentForm.value.startdate);
    const endDate = new Date(this.assignmentForm.value.enddate);
    if(this.formType === 'new'){
      // this.assignmentForm.patchValue({
      //   docid:doc(collection(this.firestore,'big assignment')).id,
      //   createddate:new Date(),
      //   lastupdateddate:new Date(),
      //   createdprofileref:doc(this.firestore,"profile_data",this.loggedInProfileData['profileid']),
      //   cohortsref:doc(this.firestore,"big cohorts",this.data.doc.docid),
      //   marathonref:this.data.doc.marathonref
      // })
      this.assignmentForm.patchValue({
        docid: doc(collection(this.firestore, 'big assignment')).id,
        createddate: new Date(),
        lastupdateddate: new Date(),
        createdprofileref: doc(this.firestore, "profile_data", this.loggedInProfileData['profileid']),
        cohortsref: doc(this.firestore, "big cohorts", this.data.doc.docid),
        marathonref: this.data.doc.marathonref,
        startdate: startDate,
        enddate: endDate
      })
      setDoc(doc(this.firestore,"big assignment",this.assignmentForm.value['docid']),this.assignmentForm.value).then(() => {
        this.assignmentForm.reset()
        this.formType = "new"
        console.log('Activity Added Successfully');
        this.openSnackBar('Activity Added Successfully','OK');
        this.dialogRef.close();
      }).catch((error)=>{
        console.log('Oops Error while Adding Activity');
        this.openSnackBar('Oops Error while Adding Activity','OK');
      });
    }else if(this.formType === 'edit'){
      this.assignmentForm.patchValue({
        lastupdateddate:new Date(),
        startdate: startDate,
        enddate: endDate
      })
      const clonedValue = Object.assign({},this.assignmentForm.value)
      clonedValue['editedprofileref'] = arrayUnion({
        profileref:doc(this.firestore,"profile_data",this.loggedInProfileData['profileid']),
        date:new Date()
      });
      
      updateDoc(doc(this.firestore,"big assignment",this.assignmentForm.value['docid']),clonedValue).then(() => {
        // this.assignmentForm.reset()
        // this.formType = "new"
        this.dialogRef.close();
      })
    }
  }
  updateParticipantsByCohorts() {
    const participants = this.assignmentForm.get('participantlist').value;
    const participantsByCohorts = {};
    const participantIds = [];
    participants.forEach(participant => {
      if (participant.participantid && participant.cohortid) {

        const cohortRef = doc(this.firestore,"big cohorts",participant.cohortid)
        participantsByCohorts[participant.participantid] = cohortRef;
        participantIds.push(participant.participantid);
      }
    });
    const participantsByCohortsFG = this.fb.group({});
    Object.keys(participantsByCohorts).forEach(participantId => {
      participantsByCohortsFG.addControl(participantId, this.fb.control(participantsByCohorts[participantId]));
    });
    this.assignmentForm.setControl('participantidbycohorts', participantsByCohortsFG);
    this.assignmentForm.get('participantidlist').setValue(participantIds);
  }
  updateGroups() {
    let participantsMap = []; 
    let uniqueParticipants = new Set();
    let cohortsid = this.assignmentForm.controls['mandatorycohortsid'].value;  
    for (let i = 0; i < cohortsid.length; i++) {      
      const element = cohortsid[i];
      const cohortName = this.data.cohortslist.find(c => c['docid'] === element)?.name || '';
      this.data.cohortslist.filter((e) => e['docid'] == element).forEach((g) => {
        g['participantidlist'].forEach((participantid) => {
          if (!uniqueParticipants.has(participantid)) {
            uniqueParticipants.add(participantid);
            participantsMap.push({ 
              participantid: participantid, 
              cohortid: element,
              cohortname: cohortName 
            });
          }
        });
      });
    }
    this.assignmentForm.controls['participantlist'].setValue(participantsMap);
    this.updateParticipantsByCohorts();
  }
  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {duration: 3000});
  }
  removeParticipant(index: number): void {
    const participants = [...this.assignmentForm.controls['participantlist'].value];
    const removedParticipant = participants[index];
    const startdate = this.assignmentForm.controls['startdate'].value
    console.log(this.currentDate < startdate,"console start date");
    
    console.log(removedParticipant,"removedParticipant");
    console.log(this.mapBigParticipantsAssignments,"mapBigParticipantsAssignments");
    const participantId = removedParticipant.participantid;
    const status = this.mapBigParticipantsAssignments[participantId]
    if (this.currentDate < startdate || (status === "initiated" && this.currentDate >= startdate)) {
      this.removedParticipantslist.push(removedParticipant);
      participants.splice(index, 1);
      this.assignmentForm.controls['participantlist'].setValue(participants);
      this.updateParticipantsByCohorts();        
      if (this.assignmentForm.controls['selectionMode'].value === 'individual') {
        this.selectedParticipantIds = this.selectedParticipantIds.filter(
          p => p.participantid !== removedParticipant.participantid
        );
      }
    } else {
        this.openSnackBar(
          `Unable to remove the participant.`,
          "OK"
        );
    }  
  }
  
  restoreParticipant(index: number): void {
    const restoredParticipant = this.removedParticipantslist[index];
    const currentParticipants = [...this.assignmentForm.controls['participantlist'].value];
  
    if (!currentParticipants.some(p => p.participantid === restoredParticipant.participantid)) {
      currentParticipants.push(restoredParticipant);
      this.assignmentForm.controls['participantlist'].setValue(currentParticipants);
      this.updateParticipantsByCohorts();
      
      // Update selectedParticipantIds if in individual selection mode
      if (this.assignmentForm.controls['selectionMode'].value === 'individual') {
        this.selectedParticipantIds.push({
          participantid: restoredParticipant.participantid,
          cohortid: restoredParticipant.cohortid,
          cohortname: restoredParticipant.cohortname
        });
      }
    }
  
    this.removedParticipantslist.splice(index, 1);
  }
  
  restoreAll(): void {
    const currentParticipants = [...this.assignmentForm.controls['participantlist'].value];
    const uniqueRestored = this.removedParticipantslist.filter(
      removed => !currentParticipants.some(p => p.participantid === removed.participantid)
    );
    
    const updatedParticipants = [...currentParticipants, ...uniqueRestored];
    this.assignmentForm.controls['participantlist'].setValue(updatedParticipants);
    this.updateParticipantsByCohorts();
    
    // Update selectedParticipantIds if in individual selection mode
    if (this.assignmentForm.controls['selectionMode'].value === 'individual') {
      this.selectedParticipantIds = [
        ...this.selectedParticipantIds,
        ...uniqueRestored.map(p => ({
          participantid: p.participantid,
          cohortid: p.cohortid,
          cohortname: p.cohortname
        }))
      ];
    }
    
    this.removedParticipantslist = [];
  }

  closeDialog() {
    this.assignmentForm.reset();
    this.dialogRef.close();
  }

  compareRef(o1: any, o2: any): boolean {
    return o1 && o2 && o1.path === o2.path;
  }
}
