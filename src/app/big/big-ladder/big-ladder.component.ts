import { Component, OnInit } from '@angular/core';
import { Firestore, getDocs, collection, query, where, DocumentReference } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

interface CohortActivities {
  completed: Array<any>,
  review: Array<any>,
  rework: Array<any>,
  missed: Array<any>,
  initiated: Array<any>,
}

type sortHeader = 'extendedlifeimpact' | 'eventAttended' | 'bigActivity' | 'eiflixConsumption' | 'queueActivityLog';
type sidePanelTab = 'level' | 'studio' | 'activity' | 'content' | 'attended';

@Component({
  selector: 'app-big-ladder',
  imports: [CommonModule, FormsModule, MatPaginatorModule],
  templateUrl: './big-ladder.component.html',
  styleUrl: './big-ladder.component.css',
})
export class BigLadderComponent implements OnInit {
  isLoading = true;

  // participant search in tabel
  participantSearch = '';

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

  // overall data map
  bigJourney: string[] = [];
  bigEvents: string[] = [];
  eventMap = {};
  journeyMap = {};
  bigLevelMap = {};
  bigActivityMap = {};
  cohortMap = {};
  eiflixVideoMap = {};

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

  constructor(
    private firestore: Firestore,
    private authService: AuthguardService,
  ) {
    getDocs(query(collection(this.firestore, 'biglevel'))).then((bigLevelSnap) => {
        for (const docref of bigLevelSnap.docs) {
          const level = docref.data();
          this.bigLevelMap[docref.id] = level;
        }
      },
    );

    getDocs(query(collection(this.firestore, 'bigactivity'))).then((bigActivitySnap) => {
        for (const docref of bigActivitySnap.docs) {
          const activity = docref.data();
          this.bigActivityMap[docref.id] = activity;
        }
      },
    );

    getDocs(query(collection(this.firestore, 'big cohorts'))).then((bigCohortSnap) => {
        for (const docref of bigCohortSnap.docs) {
          const cohort = docref.data();
          this.cohortMap[docref.id] = cohort;
        }
      },
    );

    getDocs(query(collection(this.firestore, 'episodes'))).then((episodeSnap) => {
        for (const docref of episodeSnap.docs) {
          const episodes = docref.data();
          this.eiflixVideoMap[docref.id] = episodes;
        }
      },
    );
  }

  async ngOnInit() {
    this.fetchDashbordData();
  }

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

    const bigEvents = [];
    eventCollectionSnap.docs.forEach((docref) => {
      const event = docref.data();
      this.eventMap[docref.id] = event;
      if (['B!G'].includes(event['atcmodel'])) {
        bigEvents.push(docref.id);
      }
    });

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

    bigAssignmentSnap.docs.forEach((docref) => {
      const assignment = docref.data();
      assignment['docid'] = docref.id;
      bigAssignmentMap[docref.id] = assignment;
    });

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

    queueActivityLogSnap.docs.forEach((docref) => {
      const studioLog = docref.data();
      const profileId = studioLog['profileid'] ?? null;
      if (profileId) {
        queueActivityLog[profileId] = queueActivityLog[profileId] ?? [];
        queueActivityLog[profileId].push(studioLog);
      }
    });

    bigParticipantLevelSnap.docs.forEach((docref) => {
      const participantLevel = docref.data();
      const profileId = participantLevel['profileid'] ?? null;
      participantLevel['level'] = participantLevel['level']?.id ?? null;
      if (profileId && participantLevel['level']) {
        bigParticipantLevel[profileId] = bigParticipantLevel[profileId] ?? [];
        bigParticipantLevel[profileId].push(participantLevel);
      }
    });

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

    journeySnap.docs.forEach((docref) => {
      const journey = docref.data();
      this.journeyMap[docref.id] = journey;
      if (['B!G'].includes(journey['atcmodel'])) {
        this.bigJourney.push(docref.id);
      }
    });

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

    this.isLoading = false;

    const end = new Date();

    const timegap = end.getTime() - now.getTime();
    alert(`the time gap : ${timegap / 1000}`);
  }

  // function to process data for tabel
  processDashboardData() {
    const allProfile = Object.values(this.participantMetadataMap);
    const dashboardData = [];

    for (const metadata of allProfile) {
      if (!this.bigJourney.includes(metadata['activejourney'])) continue;
      const profileId = metadata['profileid'];
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

      dashboardData.push(participantMetrics);
    }
    this.dashboardData = [...dashboardData];
    this.filteredDashbordData = [...dashboardData];
    this.sortTableHeader();
  }

  // function to filter tabel data
  filterTable() {
    const data = [...this.dashboardData];
    const filterData = data.filter((participant) => {
      const search = this.participantSearch?.toLocaleLowerCase()?.trim() ?? '';
      if (search.length > 0) {
        const participantName: string = participant?.name?.toLocaleLowerCase()?.trim() ?? '';
        if (!participantName.includes(search)) return false;
      }
      return true;
    });
    this.filteredDashbordData = filterData;
    this.sortTableHeader();
  }

  // applyFilter(participant : any){
  //   const search = this.participantSearch?.toLocaleLowerCase()?.trim() ?? '';
  //   console.log(search)
  //   if (search.length > 0) {
  //     const participantName : string = participant?.name?.toLocaleLowerCase()?.trim() ?? '';
  //     console.log(!participantName.includes(search))
  //     if (!participantName.includes(search)) {
  //       return false;
  //     }
  //   }

  //   return true
  // }

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
      console.log(this.sidePanelParticipant);
    }
  }

  // function to close side panel
  closeSidePanel() {
    this.sidePanelParticipant = null;
    this.sidePanelCurrentTab = 'level';
    this.cohortActivityTab = 'initiated';
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

  // =======================================================
}
