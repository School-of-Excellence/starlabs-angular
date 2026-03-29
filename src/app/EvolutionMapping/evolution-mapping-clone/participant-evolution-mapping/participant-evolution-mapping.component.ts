import { Component ,OnInit} from '@angular/core';
import { Firestore, collection, collectionData,query, where,getDoc,setDoc, getDocs,doc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Storage, ref as afRef, uploadBytes as afUploadBytes, getDownloadURL as afGetDownloadURL } from '@angular/fire/storage';
import { v4 as uuidv4 } from 'uuid'; // for createId replacement
import { serverTimestamp } from 'firebase/firestore';
import { ActivatedRoute } from '@angular/router';

import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { VideoPlayerComponent } from '../../video-player.component';
import { AuthguardService } from '../../../authguard.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-participant-evolution-mapping',
  imports: [VideoPlayerComponent,CommonModule,MatProgressBarModule,MatCheckboxModule,FormsModule, ReactiveFormsModule],
  templateUrl: './participant-evolution-mapping.component.html',
  styleUrl: './participant-evolution-mapping.component.css'
})
export class ParticipantEvolutionMappingComponent {

  // currentProfile:any = {"profileid" : "RScbomijhShIH5qoMhp3"};
  currentProfile = null;
  mapVideoTitle = {};
  mapRecordedDate = {};
  profileJourneyProduct = {};

  liveEvolutionMapping = [];

  currentQueueStageIndex : number = 0;
  enabledVideos: Set<number> = new Set<number>();

  loading:boolean = true;  

  queueid:string = null
  queueToken:any = {}
  queueGenerationDoc:any = {}
  incomingStageName:string = null
  queryCount:number = 0
  submitted:boolean = false
  enableCheck: boolean = false;
  showCongrats: boolean = false;
  alreadyCompleted: boolean = false;  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private authguard: AuthguardService,
    private route : ActivatedRoute,
    private snackBar: MatSnackBar,
    
  ) {


    // this.loading = true;
    //participant
    // this.authguard.username().then(async (profile) => {
    //   if(this.currentProfile === null){
    //     this.currentProfile = profile;
    //     this.enabledVideos.add(0);
    //     this.fetchOngoingLiveEvolutionMapping();
    //   }else{
    //     this.enabledVideos.add(0);
    //     this.fetchOngoingLiveEvolutionMapping();
    //   }
    //   console.log(this.currentProfile);
    // });

    //participantv2
    this.authguard.username().then(async (profile) => {
      this.currentProfile = profile;
      this.enabledVideos.add(0);
      this.fetchOngoingLiveEvolutionMapping();
      // console.log(this.currentProfile);
    });

    //developer
    // this.firestore.collection("profile_data").doc("2h4hjCmGT3x6tahzqu3F").get().toPromise().then(profile => {
    //   this.currentProfile = profile.data();
    //   this.enabledVideos.add(0);
    //   this.fetchOngoingLiveEvolutionMapping();
    //   console.log(this.currentProfile);
    // })

    
  }

  ngOnInit() {

  }

  async fetchOngoingLiveEvolutionMapping() {
  this.profileJourneyProduct['group'] = {};
  this.mapVideoTitle = {};
  this.mapRecordedDate = {};
  let today = new Date();

  // getqueueid
  this.route.queryParams.subscribe(async snapshot => {
    if (![null, undefined, ""].includes(snapshot['queueid'])) {
      this.queueid = snapshot['queueid'];
      this.incomingStageName = snapshot['stagename'];

  if (this.queueid) {
    const queueTokenQuery = query(
      collection(this.firestore, "queue_token"),
      where("profile_id", "==", this.currentProfile['profileid']),
      where("currentstage", "==", this.incomingStageName),
      where("stagestatus", "==", "Approved"),
      where("tokenstatus", "==", "Active")
    );
    const queueTokenSnap = await getDocs(queueTokenQuery);
    if (!queueTokenSnap.empty) {
      // Prefer token matching queueid from URL, else fallback to first
      const matchingToken = queueTokenSnap.docs.find(
        d => d.data()['queueref'].id === this.queueid
      );
      this.queueToken = matchingToken 
        ? matchingToken.data() 
        : queueTokenSnap.docs[0].data();

      // Get queueGenerationDoc from token's own queueref
      const queueRef = this.queueToken['queueref'];
      const queueSnap = await getDoc(queueRef);
      this.queueGenerationDoc = queueSnap.data();
    }
    else {
    this.alreadyCompleted = true;
  }
  }
    }
  });

  // evolutionmappingvideo
  const evoMappingQuery = query(
    collection(this.firestore, "evolutionmappingvideo"),
    where("profileid", "==", this.currentProfile['profileid'])
  );
  const evoSnap = await getDocs(evoMappingQuery);
  evoSnap.docs.forEach(element => {
    const data = element.data();
    this.mapVideoTitle[data['videourl']] = data['title'];
    this.mapRecordedDate[data['videourl']] = data['recordeddate'];
  });
  this.queryCount += 1;
  if (this.queryCount >= 2) {
    this.loading = false;
  }

  // liveevolutionmapping
  try {
    const liveDocRef = doc(this.firestore, "liveevolutionmapping", this.currentProfile['profileid']);
    const livedata = await getDoc(liveDocRef);

    this.liveEvolutionMapping = [];
    const element = livedata.data();
    if (element) {
      this.liveEvolutionMapping.push(element);
      console.log("live", this.liveEvolutionMapping);
    } else {
      console.log("No data");
    }
    this.queryCount += 1;
    if (this.queryCount >= 2) {
      this.loading = false;
    }
  } catch (error) {
    console.error("Error", error);
  }
}
  isVideoEnabled(index: number): boolean {
    return this.enabledVideos.has(index);
  }
  
  onVideoCompleted(videoId: number) {
    console.log(`Video ${videoId} completed`);
    
    this.enabledVideos.add(videoId);
    
    const nextVideoId = videoId + 1;
    
    if (nextVideoId < this.liveEvolutionMapping[0].videolist.length) {
      console.log(`Enabling video ${nextVideoId}`);
      this.enabledVideos.add(nextVideoId);
    }
  }

  // movetonextStage(currentstage){
  //   const nextStage = this.findNextElement(currentstage);
  //   if(this.profileJourneyProduct['queueData']['stageproperty'][nextStage]['calltoaction'] == 'form'){
  //     const formId = this.profileJourneyProduct['queueData']['stageproperty']['actionresource'].id ?? "";
  //     const queueId = this.profileJourneyProduct['queueData']['docid'];
  //     window.open(window.location.origin + '/formtemplate?id=' + formId + "&type=form&queueid=" + queueId,'_blank');
  //   }
  // }

  async movetonextStage() {
  if (
    ![null, undefined, ""].includes(this.queueToken['currentstage']) &&
    this.incomingStageName === this.queueToken['currentstage']
  ) {
    this.loading = true;
    let nextStage = null;

    if (![null, undefined].includes(this.queueToken['variationid'])) {
      // Get variation document
      const variationDocRef = doc(this.firestore, "queue variation", this.queueToken['variationid']);
      const variationsnap = await getDoc(variationDocRef);
      const variationElement = variationsnap.data();

      for (let i = 0; i < variationElement['stages'].length; i++) {
        const element = variationElement['stages'][i];
        if (element === this.queueToken['currentstage']) {
          nextStage = variationElement['stages'][i + 1];
          break;
        }
      }
    } else {
      nextStage = this.findNextElement(this.queueToken['currentstage']);
    }

    let token = {
      previousstage: this.queueToken['currentstage'],
      currentstage: nextStage,
      logdate: serverTimestamp(),
      stagestatus: "Approved",
      quicknotes: null,
      cwmentoring: null,
      cwshadowing: null,
      cwperson: null,
      diagnosticmentoring: null,
      diagnosticshadowing: null,
      diagnosticperson: null,
      people_involved: [],
      arenaid: null,
      liveassignmentid: null,
    };

    let data = { ...this.queueToken, ...token };

    // Update queue_token
    const queueTokenDocRef = doc(this.firestore, "queue_token", data['docid']);
    await updateDoc(queueTokenDocRef, data).catch(err => {
      console.error(err);
    });

    // Generate new ID (replacement for createId)
    const logdocid = uuidv4();
    data["logdocid"] = logdocid;
    data["movedby"] = this.currentProfile['profileid']
    data["movedthrough"] = 'evolution mapping'

    // Add to queue stage log
    const logDocRef = doc(this.firestore, "queue stage log", logdocid);
    await setDoc(logDocRef, data).catch(err => {
      console.error(err);
    });

    this.loading = false;
    this.submitted = true;
    this.showCongrats = true;
  }
}

  reload() {
    window.location.reload();
  }

  //dharshan
  //   async reload() {
  //   const liveEvoDocRef = doc(this.firestore, "liveevolutionmapping", this.currentProfile['profileid']);
  //   await updateDoc(liveEvoDocRef, { live: false });
  //   window.location.reload();
  // }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 5000
    });
  }

  // findNextElement(currentstage) {
  //   const index = this.profileJourneyProduct['queueData']['stages'].indexOf(currentstage);
  //   if (index !== -1 && index < this.profileJourneyProduct['queueData']['stages'].length - 1) {
  //     return this.profileJourneyProduct['queueData']['stages'][index + 1];
  //   }
  //   return null;
  // }

  findNextElement(currentstage:string) {
    const index = this.queueGenerationDoc['stages'].indexOf(currentstage);
    if (index !== -1 && index < this.queueGenerationDoc['stages'].length - 1) {
      return this.queueGenerationDoc['stages'][index + 1];
    }
    return null;
  }
}

