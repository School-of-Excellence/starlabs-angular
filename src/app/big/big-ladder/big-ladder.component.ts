import { Component, OnInit } from '@angular/core';
import { Firestore, getDocs , collection , query , where, DocumentReference} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';

interface CohortActivities{
  completed : Array<any>,
  review : Array<any>,
  rework : Array<any>,
  missed : Array<any>,
  initiated : Array<any>,
  noStatus : Array<any>,
}

@Component({
  selector: 'app-big-ladder',
  imports: [
    CommonModule
  ],
  templateUrl: './big-ladder.component.html',
  styleUrl: './big-ladder.component.css'
})
export class BigLadderComponent implements OnInit {

  isLoading = true;

  participantMetadataMap = {};
  eventsAttended : {[key : string] : Set<string>}= {};
  cohortActivities : {[key : string] : CohortActivities } = {};
  bigAssignmentMap : {[key : string] : any} = {};
  eiflixConsumptionMap : {[key : string] : Set<string>} = {};
  queueActivityLog : {[key : string] : Array<any>} = {};
  bigParticipantLevel : {[key : string] : Array<any>} = {};
  
  dashboardData = [];
  filteredDashbordData = [];

  bigJourney : string[] = [];
  eventMap = {};
  journeyMap = {};
  bigLevelMap = {};

  sortHeader = null;

  constructor(private firestore : Firestore , private authService : AuthguardService){
    getDocs(query(collection(this.firestore , 'biglevel'))).then((bigLevelSnap)=>{
      for (const docref of bigLevelSnap.docs) {
        const level = docref.data();
        this.bigLevelMap[docref.id] = level;
      }
      console.log(this.bigLevelMap)
    })
  }

  async ngOnInit() {
    const now = new Date();

    const participantMetadataMap = {};
    const eventsAttended = {};
    const bigAssignmentMap = {};
    const cohortActivities : {[key : string] : CohortActivities } = {};
    const eiflixConsumptionMap : {[key : string] : Set<string>} = {};
    const queueActivityLog : {[key : string] : Array<any>} = {};
    const bigParticipantLevel : {[key : string] : Array<any>} = {};

    const [ eventCollectionSnap , eventParticipantSnap , bigAssignmentSnap , cohortActivitySnap , queueActivityLogSnap , bigParticipantLevelSnap , contentAnalyticsSnap , journeySnap , participantMetadataSnap ] = await Promise.all([
      getDocs(query(collection(this.firestore , 'event collection'))),
      getDocs(query(collection(this.firestore , 'event participation request') , where('status' , '==' , 'attended'))),
      getDocs(query(collection(this.firestore , 'big assignment') , where("status", "in", ['initiated', 'ongoing', 'completed']))),
      getDocs(query(collection(this.firestore , 'big participants assignments'))),
      getDocs(query(collection(this.firestore , 'queue activity log'))),
      getDocs(query(collection(this.firestore , 'big aggregate level'))),
      getDocs(query(collection(this.firestore , 'content analytics') , where('status' , '==' , 'complete') ,  where('type' , 'in' , ['eiflix','eiflixcontent' , 'eiflixhomecontent']))),
      getDocs(query(collection(this.firestore , 'journey'))),
      getDocs(query(collection(this.firestore , 'participant metadata')))
    ]);

    const bigEvents = [];

    eventCollectionSnap.docs.forEach((docref)=>{
      const event = docref.data();
      this.eventMap[docref.id] = event;
      if (['B!G'].includes(event['atcmodel'])) {
        bigEvents.push(docref.id);
      }
    })

    eventParticipantSnap.docs.forEach((docref)=>{
      const eventRequest = docref.data();
      const profileId = eventRequest['profileid'] ?? null;
      const eventref = eventRequest['eventref'] as DocumentReference;

      if (eventref.parent.path === 'event collection' && ![null , undefined , ''].includes(profileId) && bigEvents.includes(eventref.id)) {
        eventsAttended[profileId] = eventsAttended[profileId] ?? new Set();
        eventsAttended[profileId]?.add(eventref.id)
      }
    });

    bigAssignmentSnap.docs.forEach((docref)=>{
      const assignment = docref.data();
      assignment['docid'] = docref.id;
      bigAssignmentMap[docref.id] = assignment;
    })

    cohortActivitySnap.docs.forEach((docref)=>{
      const activity = docref.data();
      const profileId = activity['profileid'] ?? null;
      const assignment = bigAssignmentMap[activity['assignmentref']?.id ?? ''] ?? null;
      const activityStatus = activity['status']
      
      if (profileId && assignment) {
        cohortActivities[profileId] = cohortActivities[profileId] ?? { completed : [] , review : [] , rework : [] , missed : [] , initiated : [] , noStatus : []};

        const endDateTime = this.toDate(assignment.enddate);

        if (activityStatus === 'completed') {
          cohortActivities[profileId].completed.push(activity);
        } else if (activityStatus === 'rework') {
          cohortActivities[profileId].rework.push(activity);
        } else if (activityStatus === 'review') {
          cohortActivities[profileId].review.push(activity);
        } else if (endDateTime < now) {
          cohortActivities[profileId].missed.push(activity);
        } else if(activityStatus === 'initiated'){
          cohortActivities[profileId].initiated.push(activity);
        } else {
          cohortActivities[profileId].noStatus.push(activity);
        }
      }
    })

    queueActivityLogSnap.docs.forEach((docref)=>{
      const studioLog = docref.data();
      const profileId = studioLog['profileid'] ?? null;
      if (profileId) {
        queueActivityLog[profileId] = queueActivityLog[profileId] ?? [];
        queueActivityLog[profileId].push(studioLog);
      }
    })

    bigParticipantLevelSnap.docs.forEach((docref)=>{
      const participantLevel = docref.data();
      const profileId = participantLevel['profileid'] ?? null;
      participantLevel['level'] = participantLevel['level']?.id ?? null;
      if (profileId && participantLevel['level']) {
        bigParticipantLevel[profileId] = bigParticipantLevel[profileId] ?? [];
        bigParticipantLevel[profileId].push(participantLevel);
      }
    })

    contentAnalyticsSnap.docs.forEach((docref)=>{
      const log = docref.data();
      const profileId = log['profileid'] ?? null;
      const videoId = log['videoid'] ?? null;
      if (profileId && videoId) {
        eiflixConsumptionMap[profileId] = eiflixConsumptionMap[profileId] ?? new Set();
        eiflixConsumptionMap[profileId].add(videoId);
      }
    })

    const bigJourneys = [];

    journeySnap.docs.forEach((docref)=>{
      const journey = docref.data();
      this.journeyMap[docref.id] = journey;
      if (['B!G'].includes(journey['atcmodel'])) {
        bigJourneys.push(docref.id);
      }
    })

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
    this.cohortActivities = cohortActivities;
    this.bigAssignmentMap = bigAssignmentMap;
    this.eiflixConsumptionMap = eiflixConsumptionMap;
    this.queueActivityLog = queueActivityLog;
    this.bigParticipantLevel = bigParticipantLevel;

    this.processDashboardData();

    this.isLoading = false;

    // const end = new Date();

    // const timegap = end.getTime() - now.getTime();
    // alert(`the time gap : ${timegap / 1000}`)
  }

  processDashboardData(){
    const allProfile = Object.values(this.participantMetadataMap);
    const dashboardData = [];

    for (const metadata of allProfile) {
      const profileId = metadata['profileid'];
      const eventsAttendedCount = this.eventsAttended[profileId]?.size ?? 0;
      const bigActivity = this.cohortActivities[profileId] ?? null;
      const overAllActivity = Object.values(bigActivity ?? {}).reduce((t,c)=> t + c?.length , 0);
      const eiflixConsumption = this.eiflixConsumptionMap[profileId] ?? new Set();
      const queueActivityLog = this.queueActivityLog[profileId] ?? [];
      const bigParticipantLevel = this.bigParticipantLevel[profileId] ?? [];

      const participantMetrics = {
        profileid : metadata['profileid'],
        name : metadata['name'] ?? null,
        extendedlifeimpact : metadata['extendedlifeimpact'] ?? 0,
        eventAttended : eventsAttendedCount,
        bigActivity : { overAll : overAllActivity , completed : bigActivity?.completed?.length ?? 0},
        eiflixConsumption : eiflixConsumption.size,
        queueActivityLog : queueActivityLog.length,
        bigParticipantLevel : bigParticipantLevel,
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

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
}
