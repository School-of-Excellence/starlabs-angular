import { Component, OnInit } from '@angular/core';
import { collection, collectionData, collectionSnapshots, doc, Firestore, limit, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-arenastudioactivity',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatButtonModule,
    CommonModule,
    NgxMatSelectSearchModule,
    MatSelectModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatChipsModule
  ],
  templateUrl: './arenastudioactivity.component.html',
  styleUrl: './arenastudioactivity.component.css'
})
export class ArenastudioactivityComponent {
  selectedValue:any;
  filterText = ""
  queuelist=[];
  arenaparticipant = []
  mapProfile:any ={}
  developer:boolean
  mapZoomAccount = {}
  mapParticipantToToken = {}
  duplicateSpecialistPairing = []
  zoomNotInUseEmails = []

  private subscriptionHandle = new Subject<void>()

  get loading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:'Please wait processing ...'},disableClose:true})
  }

  constructor(public firestore: Firestore,private guard : AuthguardService,private dialog : MatDialog) { 
    guard.getRoles().then(async roles=>{
      this.developer = roles["developer"]
      // roles["admin"] || roles["ah"] || roles["integrator"] ||
      // if(this.developer){
        guard.getProfileMap().then(e => this.mapProfile = e.map)
        collectionData(query(collection(this.firestore,"queue generation"), orderBy('queueenddate','desc'),limit(5))).pipe(takeUntil(this.subscriptionHandle)).subscribe(snap =>{
          this.queuelist = snap;
        })
        collectionData(query(collection(this.firestore,"zoomaccount"),where("accounttype","==","licensed"))).pipe(takeUntil(this.subscriptionHandle)).subscribe(snap => {
          this.mapZoomAccount = Object.fromEntries(
            snap.map(({email,...rest}) => [email,{email, ...rest}])
          )
          this.zoomNotInUseEmails = snap.filter(e => e['inuse'] === false).map(e => e['email'])
          console.log(this.zoomNotInUseEmails);
          
        })
      // }
    })
  }


  ngOnInit():void{}

  ngOnDestroy(): void {
    this.subscriptionHandle.next()
    this.subscriptionHandle.complete()
  }

  filterQueue(){
    return this.queuelist.filter(e => e["queuename"].toLowerCase().includes(this.filterText.toLowerCase()))
  }

  onQueueSelect(value:any){
    collectionSnapshots(
      query(
        collection(this.firestore,"live assignment"),
        where('queueid','==',value),
        where('status','in',['live','recording'])
      )
    ).pipe(
      takeUntil(this.subscriptionHandle)
    ).subscribe(async snap =>{
      this.arenaparticipant = []
      this.duplicateSpecialistPairing = []
      let checkingArray = []
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i].data();
        this.arenaparticipant.push(element);

        let concate = element['pairing'].join(",");
        if(checkingArray.includes(concate)){
          this.duplicateSpecialistPairing.push(concate)
        }else{
          checkingArray.push(concate)
        }
      }
    })
    let queueRef = doc(this.firestore,"queue generation",value)
    collectionData(
      query(
        collection(this.firestore,"queue_token"),
        where("queueref","==",queueRef),
        where("stagestatus", "==", "Approved"),
        where("tokenstatus", "==", "Active")
      )
    ).pipe(
      takeUntil(this.subscriptionHandle)
    ).subscribe(snap => {
      this.mapParticipantToToken = Object.fromEntries(
        snap.map(({profile_id,...rest}) => [profile_id,{profile_id, ...rest}])
      )
      console.log(this.mapParticipantToToken);
      
    })
  }

  async closeStudio(studio:any){
    console.log(studio);
    if(confirm("are you sure want to close the studio")){
      updateDoc(doc(this.firestore,"live assignment",studio['docid']),{
        status:'completed'
      }).then(() => {console.log("live assignment status changed to completed");
      }).catch((err) => {console.log(err);})
      if(studio["studioid"] != null && studio["studioid"] != undefined){
        updateDoc(doc(this.firestore,"queue studio pairing",studio["studioid"]),{
          status: null
        })
      }
    }
  }
}
