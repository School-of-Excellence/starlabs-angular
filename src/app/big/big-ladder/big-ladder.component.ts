import { Component, OnInit } from '@angular/core';
import { Firestore, getDocs, collection, query, where, DocumentReference, orderBy } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';

interface CohortActivities {
  completed: Array<any>,
  review: Array<any>,
  rework: Array<any>,
  missed: Array<any>,
  initiated: Array<any>,
}

type sortHeader = 'extendedlifeimpact' | 'eventAttended' | 'bigActivity' | 'eiflixConsumption' | 'queueActivityLog';
type sidePanelTab = 'level' | 'studio' | 'activity' | 'content' | 'attended';
type customerStatus = 'all' | 'active' | 'non active';

@Component({
  selector: 'app-big-ladder',
  imports: [CommonModule, FormsModule, MatPaginatorModule , MatIconModule],
  templateUrl: './big-ladder.component.html',
  styleUrl: './big-ladder.component.css',
})
export class BigLadderComponent implements OnInit {
  private COHORT_GROUP_KEY = 'cohortsgroup'
  
  isLoading = true;

  // participant tabel filters
  participantSearch = '';
  selectedCustomerStatus : customerStatus = 'all';
  selectedCohorts = [];
  selectedCohortCategory = ['studio' , 'educational'];

  // participant table data points maps
  participantMetadataMap = {};
  eventsAttended: { [key: string]: Set<string> } = {};
  cohortActivities: { [key: string]: CohortActivities } = {};
  bigAssignmentMap: { [key: string]: any } = {};
  eiflixConsumptionMap: { [key: string]: Set<string> } = {};
  queueActivityLog: { [key: string]: Array<any> } = {};
  bigParticipantLevel: { [key: string]: Array<any> } = {};

  // Tabel data
  dashboardData = [];
  filteredDashbordData = [];
  activeParticipants = 0;
  nonactiveParticipants = 0;

  // overall data map
  bigJourney: string[] = [];
  bigEvents: string[] = [];
  eventMap = {};
  journeyMap = {};
  bigLevelMap = {};
  bigActivityMap = {};
  cohortMap = {};
  eiflixVideoMap = {};

  // cohort filters
  bigMarathon = [];
  eventsList = [];
  selectedMarathon : string | null = null;
  selectedEvent : string | null = null;
  filteredCohorts = [];
  cohortSearch = '';
  educationalCohort = true;
  studioCohort = true;

  // cohort grouping
  groupFormMode : 'add' | 'edit' | null = null;
  cohortGroupName = null;
  cohortGroupSelectedForSave = null;

  savedCohortGroups = {};
  cohortsInGroups = [];
  selectedCohortGroup = null;
  expandedCohortGroup = null;

  // cohort data points
  activeParticipantInCohort = 0;
  nonactiveParticipantInCohort = 0;

  // cohort filter ui helper
  loadAllCohort = false;

  // sorting
  sortHeader: { header: sortHeader; type: 'asce' | 'desc' } | null = null;

  // pagination
  paginatedData = [];
  pageSize: number = 15;
  pageIndex: number = 0;

  // side panel
  sidePanelParticipant = null;
  sidePanelCurrentTab: sidePanelTab = 'level';
  cohortActivityTab: | 'initiated' | 'completed' | 'missed' | 'review' | 'rework' = 'initiated';

  constructor( private firestore: Firestore,) {
    
    // fetch big levels
    getDocs(query(collection(this.firestore, 'biglevel'))).then((bigLevelSnap) => {
        for (const docref of bigLevelSnap.docs) {
          const level = docref.data();
          this.bigLevelMap[docref.id] = level;
        }
      },
    );

    // fetch big activities
    getDocs(query(collection(this.firestore, 'bigactivity'))).then((bigActivitySnap) => {
        for (const docref of bigActivitySnap.docs) {
          const activity = docref.data();
          this.bigActivityMap[docref.id] = activity;
        }
      },
    );

    // fetch big marthons
    getDocs(query(collection(this.firestore, 'big marathon') , orderBy('enddate' , 'desc'))).then((bigMarathonSnap) => {
        this.selectedMarathon = !bigMarathonSnap.empty ? bigMarathonSnap.docs[0]?.id : null;
        for (const docref of bigMarathonSnap.docs) {
          const marathon = docref.data();
          this.bigMarathon.push(marathon);
        }
      },
    );

    // fetch videos / episodes in eiflix
    getDocs(query(collection(this.firestore, 'episodes'))).then((episodeSnap) => {
        for (const docref of episodeSnap.docs) {
          const episodes = docref.data();
          this.eiflixVideoMap[docref.id] = episodes;
        }
      },
    );

    // patch cohort groups from localstorage
    this.savedCohortGroups = JSON.parse(localStorage.getItem(this.COHORT_GROUP_KEY) ?? '{}');
    this.cohortsInGroups = Object.values(this.savedCohortGroups).flat(1);
  }

  async ngOnInit() {
    this.fetchDashbordData();

    // fetch active cohorts
    getDocs(query(collection(this.firestore, 'big cohorts') , where('status' , '==' , 'active'))).then((bigCohortSnap) => {
        for (const docref of bigCohortSnap.docs) {
          const cohort = docref.data();
          const participantList = [];

          // filter participants in cohort based on their journey ( only big participants )
          for (const pid of cohort['participantidlist'] ?? []) {
            const metadata = this.participantMetadataMap[pid] ?? null;
            const journey = metadata['activejourney'] || metadata['lastcompletedjourney'] || null;;
            if (this.bigJourney.includes(journey)){
              participantList.push(pid);
            };
          }

          if (participantList.length > 0) {
            cohort['participantidlist'] = participantList;
            this.cohortMap[docref.id] = cohort;
          }

        }
        this.filterCohortList();
      },
    );
  }

  // ================================== Participant Table =========================

  // function to fetch  data for tabel
  async fetchDashbordData() {
    const now = new Date();

    const participantMetadataMap = {};
    const eventsAttended = {};
    const bigAssignmentMap = {};
    const cohortActivities: { [key: string]: CohortActivities } = {};
    const eiflixConsumptionMap: { [key: string]: Set<string> } = {};
    const queueActivityLog: { [key: string]: Array<any> } = {};
    const bigParticipantLevel: { [key: string]: Array<any> } = {};

    const [
      eventCollectionSnap,
      eventParticipantSnap,
      bigAssignmentSnap,
      cohortActivitySnap,
      queueActivityLogSnap,
      bigParticipantLevelSnap,
      contentAnalyticsSnap,
      journeySnap,
      participantMetadataSnap,
    ] = await Promise.all([
      getDocs(query(collection(this.firestore, 'event collection'))),
      getDocs(query(collection(this.firestore, 'event participation request'),where('status', '==', 'attended'),),),
      getDocs(query(collection(this.firestore, 'big assignment'),where('status', 'in', ['initiated', 'ongoing', 'completed']),),),
      getDocs(query(collection(this.firestore, 'big participants assignments')),),
      getDocs(query(collection(this.firestore, 'queue activity log'))),
      getDocs(query(collection(this.firestore, 'big aggregate level'))),
      getDocs(query(collection(this.firestore, 'content analytics'),where('status', '==', 'complete'),where('type', 'in', ['eiflix', 'eiflixcontent', 'eiflixhomecontent']),),),
      getDocs(query(collection(this.firestore, 'journey'))),
      getDocs(query(collection(this.firestore, 'participant metadata'))),
    ]);

    // code to get big events
    const bigEvents = [];
    eventCollectionSnap.docs.forEach((docref) => {
      const event = docref.data();
      event['docid'] = docref.id;
      this.eventMap[docref.id] = event;
      this.eventsList.push(event);
      if (['B!G'].includes(event['atcmodel'])) {
        bigEvents.push(docref.id);
      }
    });
  

    // code to process participants attendednce
    eventParticipantSnap.docs.forEach((docref) => {
      const eventRequest = docref.data();
      const profileId = eventRequest['profileid'] ?? null;
      const eventref = eventRequest['eventref'] as DocumentReference;

      if (
        eventref.parent.path === 'event collection' &&
        ![null, undefined, ''].includes(profileId) &&
        bigEvents.includes(eventref.id)
      ) {
        eventsAttended[profileId] = eventsAttended[profileId] ?? new Set();
        eventsAttended[profileId]?.add(eventref.id);
      }
    });

    // code to process cohort activity ( overall )
    bigAssignmentSnap.docs.forEach((docref) => {
      const assignment = docref.data();
      assignment['docid'] = docref.id;
      bigAssignmentMap[docref.id] = assignment;
    });

     // code to process cohort activity ( participant wise )
    cohortActivitySnap.docs.forEach((docref) => {
      const activity = docref.data();
      const profileId = activity['profileid'] ?? null;
      const assignment =
        bigAssignmentMap[activity['assignmentref']?.id ?? ''] ?? null;
      const activityStatus = activity['status'];

      if (profileId && assignment) {
        cohortActivities[profileId] = cohortActivities[profileId] ?? {
          completed: [],
          review: [],
          rework: [],
          missed: [],
          initiated: [],
        };

        const endDateTime = this.toDate(assignment.enddate);

        if (activityStatus === 'completed') {
          cohortActivities[profileId].completed.push(activity);
        } else if (activityStatus === 'rework') {
          cohortActivities[profileId].rework.push(activity);
        } else if (activityStatus === 'review') {
          cohortActivities[profileId].review.push(activity);
        } else if (endDateTime < now) {
          cohortActivities[profileId].missed.push(activity);
        } else {
          cohortActivities[profileId].initiated.push(activity);
        }
      }
    });

    // code to process studio activity for nig participants
    queueActivityLogSnap.docs.forEach((docref) => {
      const studioLog = docref.data();
      const profileId = studioLog['profileid'] ?? null;
      if (profileId) {
        queueActivityLog[profileId] = queueActivityLog[profileId] ?? [];
        queueActivityLog[profileId].push(studioLog);
      }
    });

    // code to process big levels for all big participants
    bigParticipantLevelSnap.docs.forEach((docref) => {
      const participantLevel = docref.data();
      const profileId = participantLevel['profileid'] ?? null;
      participantLevel['level'] = participantLevel['level']?.id ?? null;
      if (profileId && participantLevel['level']) {
        bigParticipantLevel[profileId] = bigParticipantLevel[profileId] ?? [];
        bigParticipantLevel[profileId].push(participantLevel);
      }
    });

    // code to process eiflix consumption for all big participants
    contentAnalyticsSnap.docs.forEach((docref) => {
      const log = docref.data();
      const profileId = log['profileid'] ?? null;
      const videoId = log['videoid'] ?? null;
      if (profileId && videoId) {
        eiflixConsumptionMap[profileId] =
          eiflixConsumptionMap[profileId] ?? new Set();
        eiflixConsumptionMap[profileId].add(videoId);
      }
    });

    // code to get only big journeys
    journeySnap.docs.forEach((docref) => {
      const journey = docref.data();
      this.journeyMap[docref.id] = journey;
      if (['B!G'].includes(journey['atcmodel'])) {
        this.bigJourney.push(docref.id);
      }
    });

    // code to process participants data
    participantMetadataSnap.docs.forEach((docref) => {
      const metadata = docref.data();
      const profileId = metadata['profileid'] ?? null;

      if (profileId) {
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
    this.filterEvents();

    this.isLoading = false;

    const end = new Date();

    const timegap = end.getTime() - now.getTime();
    alert(`the time gap : ${timegap / 1000}`);
  }

  // function to process data for tabel
  processDashboardData() {
    const allProfile = Object.values(this.participantMetadataMap);
    const dashboardData = [];
    let activeParticipants = 0;
    let nonactiveParticipants = 0;

    for (const metadata of allProfile) {
      const journey = metadata['activejourney'] || metadata['lastcompletedjourney'] || null;
      if (!this.bigJourney.includes(journey)) continue;

      const profileId = metadata['profileid'];
      const customerStatus = metadata['customerstatus'] ?? null;
      const eventsAttendedCount = this.eventsAttended[profileId]?.size ?? 0;
      const bigActivity = this.cohortActivities[profileId] ?? null;
      const overAllActivity = Object.values(bigActivity ?? {}).reduce((t, c) => t + c?.length,0,);
      const eiflixConsumption = this.eiflixConsumptionMap[profileId] ?? new Set();
      const queueActivityLog = this.queueActivityLog[profileId] ?? [];
      const bigParticipantLevel = this.bigParticipantLevel[profileId] ?? [];

      // sort uses same field values
      const participantMetrics = {
        profileid: metadata['profileid'],
        name: metadata['name'] ?? null,
        customerstatus : customerStatus,
        extendedlifeimpact: metadata['extendedlifeimpact'] ?? 0,
        eventAttended: eventsAttendedCount,
        bigActivity: {
          overAll: overAllActivity,
          completed: bigActivity?.completed?.length ?? 0,
        },
        eiflixConsumption: eiflixConsumption.size,
        queueActivityLog: queueActivityLog.length,
        bigParticipantLevel: bigParticipantLevel,
      };

      if (customerStatus === 'active') {
        activeParticipants++;
      } else if (customerStatus === 'non active') {
        nonactiveParticipants++;
      }

      dashboardData.push(participantMetrics);
    }
    this.dashboardData = [...dashboardData];
    this.filteredDashbordData = [...dashboardData];
    this.activeParticipants = activeParticipants;
    this.nonactiveParticipants = nonactiveParticipants;

    this.sortTableHeader();
  }

  // function to filter tabel data
  filterTable() {
    const data = [...this.dashboardData];
    const cohortParticipants = [];
    const selectedCohortGroup = this.savedCohortGroups[this.selectedCohortGroup] ?? [];
    const cohorts = [...this.selectedCohorts , ...selectedCohortGroup];

    for (const cohortId of cohorts) {
      const cohort = this.cohortMap[cohortId] ?? null;
      if (cohort) {
        for (const pid of cohort['participantidlist'] ?? []) {
          cohortParticipants.push(pid);
        }
      }
    }

    const filterData = data.filter((participant) => {
      const profileId = participant['profileid'];
      const search = this.participantSearch?.toLocaleLowerCase()?.trim() ?? '';
      const customerStatus = participant['customerstatus'] ?? null;
      
      // search
      if (search.length > 0) {
        const participantName: string = participant?.name?.toLocaleLowerCase()?.trim() ?? '';
        if (!participantName.includes(search)) return false;
      }

      // cohort filter
      if ((this.selectedCohorts.length > 0 || this.selectedCohortGroup) && !cohortParticipants.includes(profileId)) return false;

      // customer status
      if (this.selectedCustomerStatus !== 'all' && this.selectedCustomerStatus !== customerStatus) return false;

      return true;
    });

    this.filteredDashbordData = filterData;
    this.sortTableHeader();
  }

    // function to handel customer status change
  onCustomerStatusSelect(type : customerStatus){
    this.selectedCustomerStatus = type;
    this.filterTable();
  }

  // getParticipantFilterChips(){
  //   return []
  // }

  // ========================== Cohort Filter ======================

  // function to group cohorts
  groupCohortList(){
    const title = this.cohortGroupName;
    const selectedCohort = this.cohortGroupSelectedForSave;
    const groupedCohorts = JSON.parse(localStorage.getItem(this.COHORT_GROUP_KEY) ?? '{}') as Object;
    if ([null , undefined , ''].includes(title) || selectedCohort.length === 0) {
      alert('Fill all the fields');
      return
    }

    if (this.expandedCohortGroup !== title && Object.hasOwn(groupedCohorts , title)) {
      alert('this group title is already exist');
      return
    }
    if (this.expandedCohortGroup) {
      delete groupedCohorts[this.expandedCohortGroup]
    }
    groupedCohorts[title] = selectedCohort;
    localStorage.setItem(this.COHORT_GROUP_KEY , JSON.stringify(groupedCohorts));
    this.savedCohortGroups = groupedCohorts;
    this.cohortsInGroups = Object.values(this.savedCohortGroups).flat(1);
    this.selectedCohorts = [];
    this.selectedCohortGroup = title;
    this.filterTable();
    this.filterCohortList();
    this.cancelGroup();
  }

  // function to cancel group select
  cancelGroup(){
    this.groupFormMode = null;
    this.cohortGroupName = null;
    this.cohortGroupSelectedForSave = null;
    this.expandedCohortGroup = null;
  }

  // function to ungroup
  unGroup(groupTitle){
    const groupedCohorts = JSON.parse(localStorage.getItem(this.COHORT_GROUP_KEY) ?? '{}') as Object;
    if (Object.hasOwn(groupedCohorts , groupTitle)) {
      const prombt = confirm('Are sure to delete the group');
      if (!prombt) return
      delete groupedCohorts[groupTitle]
      localStorage.setItem(this.COHORT_GROUP_KEY , JSON.stringify(groupedCohorts));
      this.savedCohortGroups = groupedCohorts;
      this.cohortsInGroups = Object.values(this.savedCohortGroups).flat(1);
      this.selectedCohorts = [];
      this.cancelGroup();
      this.filterTable();
      this.filterCohortList();
    }
  }

  // function to open side panel
  openSidePanel(profileId: string, panelView: sidePanelTab = 'level') {
    if (profileId) {
      const metadata = this.participantMetadataMap[profileId] ?? null;
      const eventsAttended = this.eventsAttended[profileId] ?? new Set();
      const bigActivity = this.cohortActivities[profileId] ?? null;
      const eiflixConsumption = this.eiflixConsumptionMap[profileId] ?? new Set();
      const queueActivityLog = this.queueActivityLog[profileId] ?? [];
      const bigParticipantLevel = this.bigParticipantLevel[profileId] ?? [];

      const participantMetrics = {
        ...metadata,
        eventAttended: [...eventsAttended],
        bigActivity: bigActivity,
        eiflixConsumption: [...eiflixConsumption],
        queueActivityLog: queueActivityLog,
        bigParticipantLevel: bigParticipantLevel,
      };

      this.sidePanelParticipant = participantMetrics;
      this.sidePanelCurrentTab = panelView;
    }
  }

  // function to close side panel
  closeSidePanel() {
    this.sidePanelParticipant = null;
    this.sidePanelCurrentTab = 'level';
    this.cohortActivityTab = 'initiated';
  }

  // function to filter cohorts
  filterCohortList(){
    const cohorts = Object.values(this.cohortMap);
    const cohortSearch = this.cohortSearch?.trim().toLocaleLowerCase();
    const activeParticipants = new Set();
    const nonactiveParticipants = new Set();

    const filteredCohorts =  cohorts.filter((cohort)=>{
      const cohortId = cohort['docid'] ?? null;
      const cohortName = cohort['name']?.trim()?.toLocaleLowerCase() ?? '';
      const cohortCategory = cohort['cohortCategory'] ?? '';
      const marathon = cohort['marathonref']?.id ?? null;
      const eventId = cohort['eventref']?.id ?? null;
      const participantsList = cohort['participantidlist'] ?? [];
      
      // cohort category select
      if (this.selectedCohortCategory.length > 0 && !this.selectedCohortCategory.includes(cohortCategory)) return false;

      if (cohortCategory !== 'educational') {
        // event
        if (this.selectedEvent && this.selectedEvent !== eventId) return false;
        // marathon
        if (this.selectedMarathon && this.selectedMarathon !== marathon) return false;
      }

      // search
      if (cohortSearch.length > 0 && !cohortName?.includes(cohortSearch)) return false;

      // process active and non active participants in cohorts
      for (const pid of participantsList) {
        const metadata = this.participantMetadataMap[pid] ?? null;
        const customerstatus = metadata['customerstatus'] ?? null;
        if (customerstatus == 'active') activeParticipants.add(pid);
        else if(customerstatus === 'non active') nonactiveParticipants.add(pid);
        
      }
      
      // does in cohort group
      if (this.cohortsInGroups.includes(cohortId)) return false;

      return true;
    }).sort((a , b)=>{
      const dateA = this.toDate(a['createddate']);
      const dateB = this.toDate(b['createddate']);
      return dateB.getTime() - dateA.getTime();
    });

    this.activeParticipantInCohort = activeParticipants.size;
    this.nonactiveParticipantInCohort = nonactiveParticipants.size;
    this.filteredCohorts = filteredCohorts;
  }

  // function to select all cohorts
  selectAllCohorts(){
    for (const cohort of this.filteredCohorts) {
      this.selectedCohorts.push(cohort['docid']);
    }
    this.filterTable();
  }

  // function to deselect all cohorts
  deSelectAllCohorts(){
    this.selectedCohorts = [];
    this.filterTable();
  }

  // function to handel catgeory change for cohort filter
  onCohortCategoryChange(category : string){
    if (this.selectedCohortCategory.includes(category)) {
      this.selectedCohortCategory = this.selectedCohortCategory.filter((cat)=>cat !== category)
    } else {
      this.selectedCohortCategory.push(category);
    }
    this.filterCohortList();
  }

  // function to handle cohort click
  handleCohortClick(cohortId){
    if (this.selectedCohorts.includes(cohortId)) {
      this.selectedCohorts = this.selectedCohorts.filter((cId)=> cId !== cohortId);
    } else {
      this.selectedCohorts.push(cohortId);
    }

    if (this.groupFormMode == 'add') {
      if (this.cohortGroupSelectedForSave.length < 2) {
        this.cancelGroup();
      }
      this.onToggleCohortFromGroup(cohortId);
    }
    
    this.filterTable();
  }

  // function to filter events has per current marathon select
  filterEvents(){
    let filteredEvents = [...Object.values(this.eventMap)];
    if (this.selectedMarathon) {
      filteredEvents = filteredEvents.filter((event)=>{
        const marathon = event['bigmarathonref']?.id ?? null;
        if (this.selectedMarathon === marathon) {
          return true;
        }
        return false;
    });
    this.eventsList = filteredEvents;
    }
  }
  
  // function to handle marathon change
  onMarathonChange(){
    this.selectedEvent = null;
    this.filterEvents();
    this.filterCohortList();
  }

  // function to handel grouping 
  onGroup(mode : 'add' | 'edit' = 'add' ){
    this.cancelGroup();
    this.groupFormMode = mode;
    this.cohortGroupName = '';
    this.cohortGroupSelectedForSave = [...this.selectedCohorts];
  }

  // function to handle cohort group select
  onCohortGroupSelect(groupTitle){
    if (this.selectedCohortGroup === groupTitle) {
      this.selectedCohortGroup = null;
    } else {
      this.selectedCohortGroup = groupTitle;
    }
    this.filterTable();
  }

  // function to toggle expand in cohort filter
  toggleCohortGroup(groupTitle){
    if (this.selectedCohortGroup == groupTitle) {
      return
    }
    if (this.expandedCohortGroup === groupTitle) {
      this.expandedCohortGroup = null;
      this.cancelGroup();
    } else {
      const groupedCohorts = JSON.parse(localStorage.getItem(this.COHORT_GROUP_KEY) ?? '{}') as Object;
      const group = groupedCohorts[groupTitle] ?? [];
      
      this.groupFormMode = 'edit';
      this.cohortGroupName = groupTitle;
      this.cohortGroupSelectedForSave = group;
      this.expandedCohortGroup = groupTitle;
      
    }
  }

  // function to add and remove cohort from group
  onToggleCohortFromGroup(cohortId){
    if (this.cohortGroupSelectedForSave?.includes(cohortId)) {
      this.cohortGroupSelectedForSave = this.cohortGroupSelectedForSave.filter((cId) => cId !== cohortId);
    } else {
      this.cohortGroupSelectedForSave?.push(cohortId)
    }
  }
  
  // ===================== Tabel Sorting ======================

  // function to sort set header for sorting
  onTableHeaderClick(header: sortHeader) {
    const currentHeader = this.sortHeader;
    if (currentHeader) {
      if (currentHeader.header == header) {
        if (currentHeader.type == 'desc') {
          this.sortHeader = null;
        } else {
          this.sortHeader = { ...this.sortHeader, type: 'desc' };
        }
      } else {
        this.sortHeader = { header: header, type: 'asce' };
      }
    } else {
      this.sortHeader = { header: header, type: 'asce' };
    }
    this.sortTableHeader()
  }

  // function to sort tabel based on header click
  sortTableHeader() {
    const currentHeader = this.sortHeader;
    const tableData = [...this.filteredDashbordData];

    if (currentHeader) {
      tableData.sort((participantA: any, participantB: any) => {
        let fieldMetricA = participantA[currentHeader.header];
        let fieldMetricB = participantB[currentHeader.header];

        if (currentHeader.header === 'bigActivity') {
          fieldMetricA = fieldMetricA?.completed;
          fieldMetricB = fieldMetricB?.completed;
        }

        fieldMetricA = fieldMetricA ?? 0;
        fieldMetricB = fieldMetricB ?? 0;

        return currentHeader.type === 'asce'
          ? fieldMetricA - fieldMetricB
          : fieldMetricB - fieldMetricA;
      });
    }

    this.filteredDashbordData = [...tableData];
    this.pageIndex = 0;
    this.updatePaginatedData();
  }

  // ===================== Tabel Pagination ======================

  // function to handle pagination
  onPageChange(event: PageEvent) {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.updatePaginatedData();
  }

  // function to update data in tabel as per current page
  private updatePaginatedData() {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedData = this.filteredDashbordData.slice(startIndex, endIndex);
  }

  // ===================== UI Helpers ======================

  // function to get participant journey
  getParticipantJourney(participant: any): string {
    const journey = participant['activejourney'] ?? participant['lastcompletedjourney'] ?? null;
    if (journey) return this.journeyMap[journey]?.journey ?? '';
    return '';
  }

  // function to get participant initial
  getInital(name: string) {
    if (name?.trim) {
      const nameSplit = name.trim().toLocaleUpperCase().split('');
      return nameSplit.length >= 2 ? nameSplit[0] + nameSplit[1] : name;
    }
    return '';
  }

  // function to convert timestamp to JS Date
  toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  // function to get filtered cohorts for pagination
  getFilteredCohorts(){
    if (this.filteredCohorts.length > 16 && !this.loadAllCohort) {
      return this.filteredCohorts.slice(0 , 16);
    }
    return this.filteredCohorts
  }

  // function to toggle cohort pagination
  toggleCohortShowMore(){
    this.loadAllCohort = !this.loadAllCohort;
  }

  // function to get participants in cohorts
  getParticipantInCohortGroup(groupTitle : string){
    const group = this.savedCohortGroups[groupTitle] ?? null;
    const participantSet = new Set();
    if (group) {
      for (const cohortId of group) {
        const cohortParticipants = this.cohortMap[cohortId]?.['participantidlist'] ?? [];
        for (const pid of cohortParticipants) {
          participantSet.add(pid);
        }
      }
      return Array.from(participantSet.values());
    }
    return []
  }
}
