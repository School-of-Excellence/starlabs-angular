import { Component, Inject } from '@angular/core';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';

@Component({
  selector: 'app-arena-space-dialog',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    CommonModule,
    NgxMatSelectSearchModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatDatepickerModule
  ],
  templateUrl: './arena-space-dialog.component.html',
  styleUrl: './arena-space-dialog.component.css'
})
export class ArenaSpaceDialogComponent {

  // Array declarations 
  participantsArray = [];
  spaceArray = [];
  typeArray = [];
  doerArray = [];
  eventsArray = [];
  cohortsNames = [];
  cohortsArray = [];

  arenaSpaceData = {};
  mapProfile = {};
  mapSpace = {};
  mapSpaceType = {};
  mapEventsName = {};
  mapEventsid= {};
  mapEventRefPath = {};
  mapCohortsName = {};

  eventref:null;
  marathonref:null;

  // String declarations
  filteredProfile: string = "";
  filteredMentor: string = "";

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef :MatDialogRef<ArenaSpaceDialogComponent>,
    private firestore: Firestore,
    public dialog: MatDialog,
    private authguard : AuthguardService
  ) {

    console.log(data);
    getDocs(collection(this.firestore,"event collection")).then((event)=> {
      if(event.docs.length != 0) {
        for(let i = 0; i < event.docs.length; i++) {
          let element = event.docs[i].data();
          element['docref'] = event.docs[i].ref
          this.eventsArray.push(element['name']);
          this.mapEventsName[element['name']] = event.docs[i].ref;
          this.mapEventRefPath[event.docs[i].ref.path] = element['name']
          this.mapEventsid[event.docs[i].id] = element['name']
        }
        console.log(this.mapEventRefPath);
        
      } else {
        console.log("No Event Found")
      }
    }).then(()=>{
      this.arenaSpaceData = {}
      this.arenaSpaceData = data.metaData;
      this.participantsArray = data.participantList;
      this.mapProfile = data.mapProfile;
      this.spaceArray = data.spaceList;
      this.doerArray = data.doerList;
      this.typeArray = data.typeList;
      this.cohortsArray = data.cohortsArray;
      if (this.arenaSpaceData['date'] && typeof this.arenaSpaceData['date'].toDate === 'function') {
        this.arenaSpaceData['date'] = this.arenaSpaceData['date'].toDate();
      }
      this.arenaSpaceData['eventref'] = this.mapEventRefPath[this.arenaSpaceData['eventref'].path]
      console.log(this.arenaSpaceData);

    });
    
    
   }

  async ngOnInit() {}

  // function to filter profile 
  returnFilterProflie() {
    return this.participantsArray.filter(e => this.mapProfile[e]['name']?.toLowerCase().includes(this.filteredProfile?.toLowerCase()))
  }

  // function to filter profile 
  returnMentor() {
    return this.participantsArray.filter(e => this.mapProfile[e]['name']?.toLowerCase().includes(this.filteredMentor?.toLowerCase()))
  }

  selectedEvent(event){

    let document = this.eventsArray.find((e)=> e['name'] == event);
    this.eventref = document['docref'];
    let marathon = this.eventsArray.find((e)=>e['name'] === event && ![null,undefined,''].includes(e['bigmarathonref']));

    if(marathon){
      this.marathonref = marathon['bigmarathonref']
      getDocs(query(collection(this.firestore,"big cohorts"),where("marathonref","==",marathon['bigmarathonref']))).then((cohorts)=> {
        if(cohorts.docs.length != 0) {
          for(let j = 0; j < cohorts.docs.length; j++) {
            const cohortsData = cohorts.docs[j].data();

            this.cohortsNames.push(cohortsData['name']);
            this.mapCohortsName[cohortsData['name']] = cohortsData;
            
          }
        } else {
          console.log("No Cohorts Found")
        }
      });
    }
  }

  // function to submit value 
  async submit() {

    let check = confirm("Are you sure do you want to Update an this Arena Space")

    if(check){

      const loadingref = this.dialog.open(LoadingProgressComponent, {
        data: {
          msg: "Updating Arena Space"
        },
        disableClose: true
      });

      this.arenaSpaceData['updateddate'] = new Date();
      this.arenaSpaceData['date'] = new Date(this.arenaSpaceData['date']);
      this.arenaSpaceData['eventref'] = this.mapEventsName[this.arenaSpaceData['eventref']];
      
      // let data = {
      //   docid: this.arenaSpaceData['docid'],
      //   date: this.arenaSpaceData['date'],
      //   participantslist: this.arenaSpaceData['participantslist'],
      //   spaceid: this.arenaSpaceData['spaceid'],
      //   mentor: this.arenaSpaceData['mentor'],
      //   pivottype: this.arenaSpaceData['pivottype'],
      //   summary: this.arenaSpaceData['summary'],
      //   eventref: ['eventref'],
      //   cohortsid: this.arenaSpaceData['cohortsref'],
      //   assignmentref: null,
      //   marathonref: this.marathonref,
      //   updateddate : new Date(),
      // }

      console.log(this.arenaSpaceData);
      await updateDoc(doc(this.firestore,"arenaspace",this.arenaSpaceData['docid']),this.arenaSpaceData).then(()=>{
        console.log("Arena Space Update Successfully");
        this.authguard.openSnackBar("Arena Space Update Successfully","OK");
        this.arenaSpaceData = {};
        loadingref.close();
        this.dialog.closeAll();
        this.dialogRef.close();
      }).catch((error)=>{
        console.log('Error', error);
        this.arenaSpaceData = {};
        this.authguard.openSnackBar("Error" + error,"OK");
        loadingref.close();
      });
      
    }
  }


}
