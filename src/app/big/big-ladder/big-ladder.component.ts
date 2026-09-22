import { Component, OnInit } from '@angular/core';
import { Firestore, getDocs , collection , query , where, DocumentReference} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-big-ladder',
  imports: [
    CommonModule
  ],
  templateUrl: './big-ladder.component.html',
  styleUrl: './big-ladder.component.css'
})
export class BigLadderComponent implements OnInit {
  participantMetadataMap = {};
  eventsAttended : {[key : string] : Set<string>}= {};
  
  dashboardData = [];
  filteredDashbordData = [];

  bigJourney : string[] = [];

  constructor(private firestore : Firestore , private authService : AuthguardService){
    
  }

  async ngOnInit() {
    const participantMetadataMap = {};
    const eventsAttended = {};

    const [ eventCollectionSnap , eventParticipantSnap , cohortActivitySnap , journeySnap , participantMetadataSnap ] = await Promise.all([
      getDocs(query(collection(this.firestore , 'event collection') , where('atcmodel' , '==' , 'B!G'))),
      getDocs(query(collection(this.firestore , 'event participation request') , where('status' , '==' , 'attended'))),
      getDocs(query(collection(this.firestore , 'big participants assignments'))),
      getDocs(query(collection(this.firestore , 'journey') , where('atcmodel' , '==' , 'B!G'))),
      getDocs(query(collection(this.firestore , 'participant metadata')))
    ]);

    const bigEvents = eventCollectionSnap.docs.map((d)=>d.id);
    eventParticipantSnap.docs.forEach((docref)=>{
      const eventRequest = docref.data();
      const profileId = eventRequest['profileid'] ?? null;
      const eventref = eventRequest['eventref'] as DocumentReference;

      if (eventref.parent.path === 'event collection' && ![null , undefined , ''].includes(profileId) && bigEvents.includes(eventref.id)) {
        eventsAttended[profileId] = eventsAttended[profileId] ?? new Set();
        eventsAttended[profileId]?.add(eventref.id)
      }
    });

    

    const bigJourneys = journeySnap.docs.map((d)=>d.id);
    participantMetadataSnap.docs.forEach((docref)=>{
      const metadata = docref.data();
      const profileId = metadata['profileid'] ?? null;
      const activeJourney = metadata['activejourney'] ?? null;
     
      if(profileId && bigJourneys.includes(activeJourney)){
        participantMetadataMap[profileId] = metadata;
      }
    });

    this.participantMetadataMap = participantMetadataMap;
    this.eventsAttended = eventsAttended;
    this.processDashboardData();
  }

  processDashboardData(){
    const allProfile = Object.values(this.participantMetadataMap);
    const dashboardData = [];

    for (const metadata of allProfile) {
      const profileId = metadata['profileid'];
      const eventsAttendedCount = this.eventsAttended[profileId]?.size ?? 0;

      const participantMetrics = {
        profileid : metadata['profileid'],
        name : metadata['name'] ?? null,
        extendedlifeimpact : metadata['extendedlifeimpact'] ?? 0,
        eventAttended : eventsAttendedCount,
      };

      dashboardData.push(participantMetrics);
    }

    this.dashboardData = [...dashboardData];
    this.filteredDashbordData = [...dashboardData];
  }

  getInital(name : string){
    if (name?.trim) {
      const nameSplit = name.trim().toLocaleUpperCase().split('');
      return nameSplit.length >= 2 ? nameSplit[0] + nameSplit[1] : name;
    } 
    return ''
  }
  
}
