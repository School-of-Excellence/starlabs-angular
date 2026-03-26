import { Component, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { async, Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, Firestore, getDocs, onSnapshot, orderBy, query, where } from '@angular/fire/firestore';
import { log } from 'console';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UserAnalyticsDialogComponent } from './user-analytics-dialog/user-analytics-dialog.component';

@Component({
  selector: 'app-analytics',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    MatDatepickerModule,
    MatButtonModule,
    MatOptionModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatSelectModule,
    MatTabsModule,
    MatDialogModule
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css'
})
export class AnalyticsComponent {

  contentAnalytics=[];
  mapProfile = {}
  mapProfileData = {}
  //newuser
  mapProfileNew = {}
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  // displayedColumns: string[] = ['profileid','from','lastwatchedtime','logdate','totalruntime','totaltimespend','type','videoname'];
  displayedColumns: string[] = ['logdate','profileid','from','videoname','platform_name','totalruntime','lastwatchedtime','totaltimespend','type','playlist','status'];
  contentData = new MatTableDataSource();
  startDate: Date;
  endDate: Date;
  mapPlaylist ={}

  filterValue = {
    name:null,
    startdate:null,
    enddate:null,
    from:null,
    videoname:[],
    totaltimespend:null,
    platform_name:null
  }

  videoNameList = []
  fromScreenList = []
  platformNameList = []
  private subscription = new Subject<void>();
  uniqueuser = 0
  uniqueUserContentConsumptionbyhours:any = 0
  uniqueUserContentConsumptionbydays:any = 0
  averageTimeSpendPerUser:any = 0
  querydays:any = null
  unsubscribeContentAnalytics: any;

  seriesDataList: any[] = [];
  journey: any[] = [];
  journeyMap: any = {};
  tierData :any[] = [];
  tiermap: any = {};
  isInitialLoadDone = false;
  tierLoading = false;
  viewMode = 'participant';
  tierCompletionMap: any = {};
  tierParticipantSummary: any = {};
  journeyWiseData: any = {};

  constructor(
    public firestore: Firestore,
    private guard : AuthguardService,
    private dialog: MatDialog
  ){
    this.startDate = new Date(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate() -7));
    this.endDate = new Date(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()));
    this.guard.getParticipantMetaMap().then(e => {
      this.mapProfile = e.map
      this.mapProfileData = e.docdata
    })
    //newuser
    this.guard.getProfileMapNewUser().then(newuser => {
      this.mapProfileNew = newuser.map
    })
    this.filterData();
    this.seriesData();
    this.querydays = Math.round((Math.abs(new Date(this.endDate).getTime() - new Date(this.startDate).getTime()))/(1000*60*60*24))
  }

  ngOnInit(): void {
    this.contentData.filterPredicate = this.customfilter()
    this.getjourney();
    // this.filterData();
  }
  async getjourney(){
    const journeySnap = await getDocs(collection(this.firestore,'journey'));
    this.journey = [];
    journeySnap.docs.forEach(element => {
      this.journey.push({
        id: element.id,
        ...element.data()
      });
      this.journeyMap[element.id] = element.data();
    });

    console.log(this.journey,'journey dataaaa');

    await this.journeyBasedanalytics();
  }
  openUserAnalyticsDialog(profile: any) {
    this.dialog.open(UserAnalyticsDialogComponent, {
      data: {
        logs: profile.logs,
        profileData: profile.profileData,
        name: profile.name,
        journeyMap:this.journeyMap
      },
      panelClass: 'uad-dialog-panel',
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }
  
  async journeyBasedanalytics(){
    const journeyWiseMap: any = {}
    const profileLogsMap: any = {};
 
    for (let i = 0; i < this.contentAnalytics.length; i++) {
      const element = this.contentAnalytics[i];
      const pid = element?.profileid;
      if (!pid) continue;
      if (!profileLogsMap[pid]) profileLogsMap[pid] = [];
      profileLogsMap[pid].push(element);
    }
 
    const profileids = Object.keys(this.mapProfileData);
    for (let i = 0; i < profileids.length; i++) {
      const profileid = profileids[i];
      const profile = this.mapProfileData[profileid];
      if (!profile?.firebaseuserref) continue;
      const journeyid = profile?.activejourney;
      if (!journeyid) continue;
      const journeyData = this.journeyMap[journeyid];
      if (!journeyData) continue;
      const journeyName = journeyData['journey'] || journeyid;
      const profileName = this.mapProfile[profileid] || this.mapProfileNew[profileid] || profileid;
 
      if (!journeyWiseMap[journeyid]) {
        journeyWiseMap[journeyid] = {
          journeyName: journeyName,
          profile: [],
          total: 0,
          watching: 0,
          notYet: 0
        };
      }
 
      const userLogs = profileLogsMap[profileid] || [];
      journeyWiseMap[journeyid].profile.push({
        id: profileid,
        name: profileName,
        profileData: profile,
        logs: userLogs,
        watching: userLogs.length > 0
      });
      journeyWiseMap[journeyid].total++;
      if (userLogs.length > 0) {
        journeyWiseMap[journeyid].watching++;
      }
    }
 
    const keys = Object.keys(journeyWiseMap);
    for (let i = 0; i < keys.length; i++) {
      journeyWiseMap[keys[i]].notYet = journeyWiseMap[keys[i]].total - journeyWiseMap[keys[i]].watching;
    }
 
    this.journeyWiseData = journeyWiseMap;
 
    const firstKey = Object.keys(journeyWiseMap)[0];
    if (firstKey && !this.selectedJourneyId) this.selectJourney(firstKey);
 
    console.log(this.journeyWiseData, 'journeywiseconeoleee');
  }
 
  selectedJourneyId: string = '';
  journeyFilter: 'all' | 'watching' | 'notyet' = 'all';
  journeySearchQuery: string = '';
 
  selectJourney(id: string) {
    this.selectedJourneyId = id;
    this.journeyFilter = 'all';
    this.journeySearchQuery = '';
  }
 
  journeyProfileVisible(profile: any): boolean {
    const matchesFilter =
      this.journeyFilter === 'all' ||
      (this.journeyFilter === 'watching' && profile.watching) ||
      (this.journeyFilter === 'notyet' && !profile.watching);
    const matchesSearch = !this.journeySearchQuery ||
      profile.name?.toLowerCase().includes(this.journeySearchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  }
 
  getVisibleCount(profiles: any[]): number {
    return (profiles || []).filter(p => this.journeyProfileVisible(p)).length;
  }
 
  getWatchHrs(logs: any[]): number {
    if (!logs?.length) return 0;
    return logs.reduce((sum, l) => sum + (l.totaltimespend || 0), 0) / 3600;
  }
 
  getCompletion(logs: any[]): number {
    if (!logs?.length) return 0;
    const totalSpend   = logs.reduce((sum, l) => sum + (l.totaltimespend || 0), 0);
    const totalRuntime = logs.reduce((sum, l) => sum + (l.totalruntime || 0), 0);
    if (totalRuntime === 0) return 0;
    return (totalSpend / totalRuntime) * 100;
  }
 
  getAvgPerDay(logs: any[]): number {
    if (!logs?.length) return 0;
    const dateSet = new Set<string>();
    logs.forEach(l => {
      const d = l.logdate?.toDate ? l.logdate.toDate() : new Date(l.logdate);
      dateSet.add(d.toISOString().substring(0, 10));
    });
    return dateSet.size > 0 ? this.getWatchHrs(logs) / dateSet.size : 0;
  }
 
  getLastSeenDays(logs: any[]): number {
    if (!logs?.length) return 999;
    let latest = 0;
    logs.forEach(l => {
      const d = l.logdate?.toDate ? l.logdate.toDate() : new Date(l.logdate);
      if (d.getTime() > latest) latest = d.getTime();
    });
    return Math.floor((Date.now() - latest) / (1000 * 60 * 60 * 24));
  }

  // async journeyBasedanalytics(){
  //   const journeyWiseMap: any = {}
  //   const watchingMap: any = {}
  //   const profileLogsMap: any = {};

  //   for (let i = 0; i < this.contentAnalytics.length; i++) {
  //     const element = this.contentAnalytics[i];
  //     const pid = element?.profileid;
  //     if (!pid) continue;
  //     if (!profileLogsMap[pid]) {
  //       profileLogsMap[pid] = []
  //     }
  //     profileLogsMap[pid].push(element);
  //   }
    
  //   const profileids =  Object.keys(this.mapProfileData)
  //   for (let i = 0; i < profileids.length; i++) {
  //     const profileid = profileids[i];
  //     const profile = this.mapProfileData[profileid];
  //     if (!profile?.firebaseuserref) continue;
  //     const journeyid = profile?.activejourney;
  //     if (!journeyid) continue;
  //     const journeyData = this.journeyMap[journeyid];
  //     if(!journeyData) continue;
  //     const journeyName = journeyData['journey'] || journeyid;
  //     const profileName = this.mapProfile[profileid] || this.mapProfileNew[profileid] || profileid;
  //     if(!journeyWiseMap[journeyid]){
  //       journeyWiseMap[journeyid] = {
  //         journeyName:journeyName,
  //         profile:[],
  //         total:0,
  //         watching:0,
  //         notYet:0
  //       }
  //     }
  //     const userLogs = profileLogsMap[profileid] || [];
  //     journeyWiseMap[journeyid].profile.push({
  //       id:profileid,
  //       name:profileName,
  //       profileData:profile,
  //       logs:userLogs,
  //       watching:userLogs.length > 0
  //     })
  //     journeyWiseMap[journeyid].total++;
  //     if (userLogs.length > 0) {
  //       journeyWiseMap[journeyid].watching++;
  //     }
  //   }
  //   const keys = Object.keys(journeyWiseMap);
  //   for (let i = 0; i < keys.length; i++) {
  //     const element = journeyWiseMap[keys[i]];
  //     element.notYet = element.total - element.watching;
      
  //   }
  //   this.journeyWiseData = journeyWiseMap;
  //   console.log(this.journeyWiseData,'journeywiseconeoleee')
  // }
  async seriesData() {
    await getDocs(collection(this.firestore, 'series')).then((series) => {
      this.seriesDataList = []
      for (let i = 0; i < series.docs.length; i++) {
        const element = series.docs[i];
        this.seriesDataList.push({
          id: element.id,
          ...element.data()
        });
      }
      console.log(this.seriesDataList,'seriesss dataaaa');
    })
    .catch((error) => {
      console.error(error, 'series error');
    });
   await this.loadTierData()
  }
  async loadTierData() {
    await getDocs(collection(this.firestore, 'tier')).then((tier) => {
      this.tiermap = {}
      this.tierData = []
      for (let i = 0; i < tier.docs.length; i++) {
        const element = tier.docs[i];
        this.tierData.push({
          id: element.id,
          ...element.data()
        });
        this.tiermap[element.data()['id']] = element.data();
      }
      console.log(this.tierData,'dataaaa');
    })
    .catch((error) => {
      console.error(error, 'series error');
    });
    this.mapTierToSeries()
  }
  mapTierToSeries() {
    const result: any = {};
    this.seriesDataList.forEach(series => {
      const tiers = series.tier || [];
      tiers.forEach((tierRef: any) => {
        const tierid = tierRef.id || tierRef;
        if (!result[tierid]) {
          result[tierid] = [];
        }
        result[tierid].push(series);
      });
    });
  }
  getCompletedCount(seriesObj: any) {
    return Object.values(seriesObj).filter(v => v === 'completed').length;
  }

  getTotalCount(seriesObj: any) {
    return Object.keys(seriesObj).length;
  }

  checkSeriesCompletion() {
    if (!this.contentAnalytics?.length || !this.seriesDataList?.length) return;
    const seriesMap = new Map();
    this.seriesDataList.forEach(series => {
      if (!series.sequence) return;

      seriesMap.set(series.id, {
        ...series,
        sequenceSet: new Set(series.sequence.map((s: any) => s.id))
      });
    });
    const userSeriesMap = new Map();
    for (const log of this.contentAnalytics) {
      if (log.status !== 'complete') continue;

      const { profileid, playlistid, videoid } = log;
      if (!profileid || !playlistid || !videoid) continue;

      if (!userSeriesMap.has(profileid)) {
        userSeriesMap.set(profileid, new Map());
      }
      const playlistMap = userSeriesMap.get(profileid);
      if (!playlistMap.has(playlistid)) {
        playlistMap.set(playlistid, new Set());
      }
      playlistMap.get(playlistid).add(videoid);
    }
    const tierEligibleUsersMap: any = {};
    for (const profileid in this.mapProfileData) {
      const profileData = this.mapProfileData[profileid];
      if (!profileData?.firebaseuserref) continue;

      const tiers = profileData?.tier || [];

      const profileName =
        this.mapProfile[profileid] ||
        this.mapProfileNew[profileid] ||
        profileid;

      for (const t of tiers) {
        const tierid = t.id || t;

        tierEligibleUsersMap[tierid] ??= [];
        tierEligibleUsersMap[tierid].push(profileName);
      }
    }
    const tierCompletionMap: any = {};

    for (const [profileid, playlists] of userSeriesMap.entries()) {

      const profileData = this.mapProfileData[profileid];
      if (!profileData?.firebaseuserref) continue;

      const profileName =
        this.mapProfile[profileid] ||
        this.mapProfileNew[profileid] ||
        profileid;

      for (const [playlistid, completedVideos] of playlists.entries()) {

        const series = seriesMap.get(playlistid);
        if (!series) continue;

        let isCompleted = true;

        for (const vid of series.sequenceSet) {
          if (!completedVideos.has(vid)) {
            isCompleted = false;
            break;
          }
        }

        if (!isCompleted) continue;

        for (const tierRef of (series.tier || [])) {
          const tierid = tierRef.id || tierRef;

          const userTierList = (this.mapProfileData[profileid]?.tier || [])
            .map((t: any) => t.id || t);

          if (!userTierList.includes(tierid)) continue;

          const seriesName = series.seriesName || series.id;

          tierCompletionMap[tierid] ??= {};
          tierCompletionMap[tierid][seriesName] ??= {};

          tierCompletionMap[tierid][seriesName][profileName] = 'completed';
        }
      }
    }

    for (const tierId in tierCompletionMap) {
      const seriesMapObj = tierCompletionMap[tierId];
      const eligibleUsers = tierEligibleUsersMap[tierId] || [];

      for (const seriesName in seriesMapObj) {
        const usersObj = seriesMapObj[seriesName];

        for (const user of eligibleUsers) {
          if (!usersObj[user]) {
            usersObj[user] = 'pending';
          }
        }
      }
    }
    const tierParticipantSummary: any = {};

    for (const tierId in tierCompletionMap) {

      const seriesMapObj = tierCompletionMap[tierId];
      const eligibleUsers = tierEligibleUsersMap[tierId] || [];

      tierParticipantSummary[tierId] ??= {};

      for (const user of eligibleUsers) {

        let completedCount = 0;
        let totalSeries = Object.keys(seriesMapObj).length;

        for (const seriesName in seriesMapObj) {
          if (seriesMapObj[seriesName][user] === 'completed') {
            completedCount++;
          }
        }

        tierParticipantSummary[tierId][user] = {
          completed: completedCount,
          total: totalSeries
        };
      }
    }
    this.tierCompletionMap = tierCompletionMap;
    this.tierParticipantSummary = tierParticipantSummary;
    this.computeTierStats();
    console.log(this.tierCompletionMap, 'tierCompletionMap');
    console.log(this.tierParticipantSummary, 'tierParticipantSummary');
  }
  tierStats: { [tierId: string]: {
    series:      { done: number; completed: number; onTrack: number; notStarted: number; total: number };
    participant: { done: number; completed: number; onTrack: number; notStarted: number; total: number };
  }} = {};
  
  tierSearchQuery: string = '';
  computeTierStats() {
    this.tierStats = {}; 
    for (const tierId in this.tierCompletionMap) {
      const seriesMap = this.tierCompletionMap[tierId];
      let done = 0, completed = 0, onTrack = 0, notStarted = 0;
      for (const seriesName in seriesMap) {
        const users = seriesMap[seriesName];
        const total = Object.keys(users).length;
        const comp  = Object.values(users).filter((v: any) => v === 'completed').length;
  
        if (comp === total && total > 0) { completed++; done++; }
        else if (comp > 0)               { onTrack++;   done++; }
        else                              { notStarted++;        }
      }
  
      if (!this.tierStats[tierId]) this.tierStats[tierId] = {} as any;
      this.tierStats[tierId].series = {
        done, completed, onTrack, notStarted,
        total: Object.keys(seriesMap).length
      };
    }
  
    for (const tierId in this.tierParticipantSummary) {
      const users = this.tierParticipantSummary[tierId];
      let done = 0, completed = 0, onTrack = 0, notStarted = 0;
  
      for (const userName in users) {
        const u = users[userName];
        if (u.completed === u.total && u.total > 0) { completed++; done++; }
        else if (u.completed > 0)                    { onTrack++;   done++; }
        else                                           { notStarted++;       }
      }
  
      if (!this.tierStats[tierId]) this.tierStats[tierId] = {} as any;
      this.tierStats[tierId].participant = {
        done, completed, onTrack, notStarted,
        total: Object.keys(users).length
      };
    }
  }

  onClearFilterValue(){
    this.filterValue = {
      name:null,
      startdate:null,
      enddate:null,
      from:null,
      videoname:[],
      totaltimespend:null,
      platform_name:null
    }
    this.onFilter(this.filterValue)
  }

  ngAfterViewInit(){
    this.contentData.data = this.contentAnalytics
    this.contentData.sort = this.sort
    this.contentData.paginator = this.paginator
  }

  convertDecimal(value:number){
    const minutes = Math.floor(value / 60); // Get the whole minutes
    const remainingSeconds = value % 60; // Get the remaining seconds
    return `${minutes} mins ${remainingSeconds} sec (${value})`
  }

  convertDaysHoursMins(seconds:number){
    const days = Math.floor(seconds / (3600 * 24));
    const remainingSecondsAfterDays = seconds % (3600 * 24);

    const hours = Math.floor(remainingSecondsAfterDays / 3600);
    const remainingSecondsAfterHours = remainingSecondsAfterDays % 3600;

    const minutes = Math.floor(remainingSecondsAfterHours / 60);
    const remainingSeconds = remainingSecondsAfterHours % 60;

    return `${days} days ${hours} hours ${minutes} mins ${remainingSeconds} secs`
  }

  convertHoursMins(seconds:number){
    const hours = Math.floor(seconds / 3600);
    const remainingSecondsAfterHours = seconds % 3600;

    const minutes = Math.floor(remainingSecondsAfterHours / 60);
    const remainingSeconds = remainingSecondsAfterHours % 60;

    return `${hours} hours ${minutes} mins ${remainingSeconds} secs`
  }

  filterData(){
      if (!this.startDate || !this.endDate) return;

      if (this.unsubscribeContentAnalytics) {
        this.unsubscribeContentAnalytics();
        this.unsubscribeContentAnalytics = null;
      }

      this.isInitialLoadDone = false;
      this.tierLoading = true;
      this.contentAnalytics = [];
      this.tierCompletionMap = {};
      this.tierParticipantSummary = {};
      this.ngAfterViewInit();

      this.startDate = new Date(new Date(this.startDate).setHours(0,0,0,0));
      this.endDate   = new Date(new Date(this.endDate).setHours(23,59,59,999));

      console.log(this.startDate, this.endDate);
      const contentanalyticsRef = collection(this.firestore, "content analytics");
      const contentanalyticsQuery = query(
        contentanalyticsRef,
        where('logdate', '>', this.startDate),
        where('logdate', '<', this.endDate),
        orderBy('logdate', 'desc')
      );

      this.unsubscribeContentAnalytics = onSnapshot(
        contentanalyticsQuery,
        (snapshot) => {
          if (snapshot.metadata.fromCache) return;

          this.contentAnalytics = [];
          snapshot.docs.forEach(e => {
            let element = e.data();
            element["docid"] = e.id;
            element['live'] = false;
            this.contentAnalytics.push(element);
          });

          this.ngAfterViewInit();
          this.getUniqueUser();

          if (!this.isInitialLoadDone) {
            this.isInitialLoadDone = true;
            setTimeout(() => {
              this.checkSeriesCompletion();
              this.journeyBasedanalytics();
              this.tierLoading = false;
            }, 0);
          }

          snapshot.docChanges().forEach(e => {
            if (e.type === 'modified') {
              const idx = this.contentAnalytics.findIndex(c => c['docid'] === e.doc.id);
              if (idx > -1) this.contentAnalytics[idx]['live'] = true;
            }
          });

          for (let i = 0; i < this.contentAnalytics.length; i++) {
            const element = this.contentAnalytics[i];
            if (!this.fromScreenList.includes(element['from'])) {
              this.fromScreenList.push(element['from']);
            }
            if (!this.videoNameList.includes(element['videoname'])) {
              this.videoNameList.push(element['videoname']);
            }
            if (element['platform_name'] != undefined) {
              if (!this.platformNameList.includes(element['platform_name'])) {
                this.platformNameList.push(element['platform_name']);
              }
            }
          }

          this.querydays = Math.round(
            Math.abs(new Date(this.endDate).getTime() - new Date(this.startDate).getTime()) / (1000*60*60*24)
          );
        },
        (error) => {
          console.error("Content analytics error:", error);
          this.tierLoading = false;
        }
      );

      const solarvoiceplaylistRef = collection(this.firestore, "solar voice playlist");
      getDocs(solarvoiceplaylistRef).then(playlist => {
        for (let i = 0; i < playlist.docs.length; i++) {
          const element = playlist.docs[i].data();
          this.mapPlaylist[element['id']] = element['name'];
        }
      });
    }
  // filterData(){
  //   if (this.unsubscribeContentAnalytics) {
  //     this.unsubscribeContentAnalytics();
  //     this.unsubscribeContentAnalytics = null;
  //   }

  //   this.isInitialLoadDone = false;
  //   this.tierLoading = true;
  //   // ref =>ref.where('logdate','>', this.startDate).where('logdate','<', this.endDate)
  //   // console.log(this.subscription?.closed);
  //   // if(this.subscription?.closed === false) this.subscription.unsubscribe()
  //   this.contentAnalytics = []
  //   this.ngAfterViewInit()
  //   this.startDate = new Date(this.startDate.setHours(0,0,0,0))
  //   this.endDate = new Date(this.endDate.setHours(23,59,59,999))
  //   console.log(this.startDate,this.endDate);
  //   const contentanalyticsRef = collection(this.firestore,"content analytics")
  //   const contentanalyticsQuery = query(contentanalyticsRef,where('logdate','>', this.startDate),where('logdate','<', this.endDate),orderBy('logdate','desc'))
    
  //   this.unsubscribeContentAnalytics = onSnapshot(
  //     contentanalyticsQuery,
  //     (snapshot) => {
  //       if (!this.isInitialLoadDone) {
  //         this.contentAnalytics = [];
  //       }
  //       snapshot.docChanges().forEach(e => {
  //         let element = e.doc.data();
  //         element["docid"] = e.doc.id;
  //         element['live'] = (e.type === 'modified');
  //         this.contentAnalytics.push(element);
  //       });
        
  //       this.ngAfterViewInit();
  //       this.getUniqueUser();
  //       if (!this.isInitialLoadDone && snapshot.metadata.fromCache === false) {
  //         this.isInitialLoadDone = true;
  //         setTimeout(() => {
  //           this.checkSeriesCompletion();
  //           this.tierLoading = false;
  //         }, 0);
  //       }
  //       for (let i = 0; i < this.contentAnalytics.length; i++) {
  //         const element = this.contentAnalytics[i];
  //         if(!this.fromScreenList.includes(element['from'])){
  //           this.fromScreenList.push(element['from']);
  //         }
  //         if(!this.videoNameList.includes(element['videoname'])){
  //           this.videoNameList.push(element['videoname']);
  //         }
  //         if(element['platform_name'] != undefined){
  //           if(!this.platformNameList.includes(element['platform_name'])){
  //             this.platformNameList.push(element['platform_name']);
  //           }
  //         }
  //       }
        
  //       this.querydays = Math.round((Math.abs(new Date(this.endDate).getTime() - new Date(this.startDate).getTime()))/(1000*60*60*24));
  //     },
  //     (error) => {
  //       console.error("Content analytics error:", error);
  //     }
  //   );

  //   const solarvoiceplaylistRef = collection(this.firestore,"solar voice playlist")
  //   getDocs(solarvoiceplaylistRef).then(playlist=>{
  //     for(let i = 0; i<playlist.docs.length;i++){
  //       const element = playlist.docs[i].data();
  //       this.mapPlaylist[element['id']] = element['name']
  //     }
  //   });
  // }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }


  applyNameFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.contentData.filter = filterValue;
  }

  getUniqueUser(){
    // this.uniqueuser = Array.from(new Map(this.contentAnalytics.map(e => [e.profileid,e])).values()).length;
    let uniqueUser:{[key:string]:number} = {}
    for (let i = 0; i < this.contentData.filteredData.length; i++) {
      const element = this.contentData.filteredData[i];
      uniqueUser[element['profileid']] = (uniqueUser[element['profileid']] || 0) + element['totaltimespend']
    }
    this.uniqueuser = Object.keys(uniqueUser).length
    let totalconsumption = Object.values(uniqueUser).reduce((c,a) => {
      return c + a
    },0)
    this.uniqueUserContentConsumptionbydays = this.convertDaysHoursMins(totalconsumption)
    this.uniqueUserContentConsumptionbyhours = this.convertHoursMins(totalconsumption)
    this.averageTimeSpendPerUser = this.convertHoursMins(Math.round(totalconsumption/this.uniqueuser))
  }

  onFilter(value:any){
    this.contentData.filter = JSON.stringify(value)
  }
  cardViewMode: { [tierId: string]: 'series' | 'participant' } = {};
  drawerOpen       = false;
  drawerFilter: 'all' | 'completed' | 'pending' = 'all';
  drawerTierName   = '';
  drawerContextLabel = '';
  private _drawerItems: { name: string; status: string; seriesLabel?: string }[] = [];

  openDrawer(tierId: string, context: string, filterPreset: string, mode: 'series' | 'participant') {
    this._drawerItems = [];
    this.drawerTierName = this.tiermap[tierId]?.tier || tierId;
    if (mode === 'series') {
      const seriesData = this.tierCompletionMap[tierId] || {};
      if (context === 'series' || context === 'all') {
        const userStatusMap: { [name: string]: string } = {};
        for (const seriesName in seriesData) {
          for (const userName in seriesData[seriesName]) {
            if (seriesData[seriesName][userName] === 'completed') {
              userStatusMap[userName] = 'completed';
            } else if (!userStatusMap[userName]) {
              userStatusMap[userName] = seriesData[seriesName][userName];
            }
          }
        }
        this._drawerItems = Object.entries(userStatusMap).map(([name, status]) => ({ name, status }));
        this.drawerContextLabel = 'All Series';
      } else {
        const usersInSeries = seriesData[context] || {};
        this._drawerItems = Object.entries(usersInSeries).map(([name, status]) => ({
          name,
          status: status as string
        }));
        this.drawerContextLabel = context;
      }

    } else {
      const participantData = this.tierParticipantSummary[tierId] || {};
      const seriesData      = this.tierCompletionMap[tierId] || {};

      if (context === 'all') {
        this._drawerItems = Object.entries(participantData).map(([name, val]: [string, any]) => ({
          name,
          status: val.completed === val.total && val.total > 0 ? 'completed' : 'pending',
          seriesLabel: `${val.completed}/${val.total} series`
        }));
        this.drawerContextLabel = 'All Participants';
      } else {
        this._drawerItems = Object.entries(seriesData).map(([seriesName, users]: [string, any]) => ({
          name: context,
          status: users[context] || 'pending',
          seriesLabel: seriesName
        }));
        this.drawerContextLabel = context;
      }
    }
    if (filterPreset === 'completed')  this.drawerFilter = 'completed';
    else if (filterPreset === 'ontrack' || filterPreset === 'notstarted') this.drawerFilter = 'pending';
    else this.drawerFilter = 'all';

    this.drawerOpen = true;
  }

  closeDrawer() {
    this.drawerOpen = false;
  }

  getFilteredDrawerItems() {
    if (this.drawerFilter === 'all')       return this._drawerItems;
    if (this.drawerFilter === 'completed') return this._drawerItems.filter(i => i.status === 'completed');
    return this._drawerItems.filter(i => i.status !== 'completed');
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(p => p.length > 0);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase();
  }

  private avatarPalette = [
    '#4a6fa5', '#3d7a5e', '#7a4fa5', '#a5754a',
    '#5a7a3d', '#a54a6f', '#3d6a7a', '#7a6a3d'
  ];

  getAvatarColor(name: string): string {
    if (!name) return '#4a6fa5';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.avatarPalette[Math.abs(hash) % this.avatarPalette.length];
  }

  getFullyCompletedSeriesCount(tierValue: any): number {
    return Object.values(tierValue).filter((seriesObj: any) => {
      const total = Object.keys(seriesObj).length;
      return total > 0 && this.getCompletedCount(seriesObj) === total;
    }).length;
  }
  getOnTrackSeriesCount(tierValue: any): number {
    return Object.values(tierValue).filter((seriesObj: any) => {
      const completed = this.getCompletedCount(seriesObj);
      return completed > 0 && completed < Object.keys(seriesObj).length;
    }).length;
  }
  getNotStartedSeriesCount(tierValue: any): number {
    return Object.values(tierValue).filter((seriesObj: any) =>
      this.getCompletedCount(seriesObj) === 0).length;
  }
  getDoneTierCount(tierValue: any): number {
    return Object.values(tierValue).filter((seriesObj: any) =>
      this.getCompletedCount(seriesObj) > 0).length;
  }

  getFullyCompletedParticipantCount(tierValue: any): number {
    return Object.values(tierValue).filter((u: any) =>
      u['completed'] > 0 && u['completed'] === u['total']).length;
  }
  getOnTrackParticipantCount(tierValue: any): number {
    return Object.values(tierValue).filter((u: any) =>
      u['completed'] > 0 && u['completed'] < u['total']).length;
  }
  getNotStartedParticipantCount(tierValue: any): number {
    return Object.values(tierValue).filter((u: any) => u['completed'] === 0).length;
  }
  getDoneParticipantCount(tierValue: any): number {
    return Object.values(tierValue).filter((u: any) => u['completed'] > 0).length;
  }
  //newuser
  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (![null,undefined].includes(value['name']) ? (
      (this.mapProfile[e['profileid']]?.toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0) ||
      (this.mapProfileNew[e['profileid']]?.toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0)): true)&& 
      (value['startdate'] != null && value['enddate'] != null ? (e['logdate'].toDate() > new Date(new Date(value['startdate']).setHours(0,0,0,0)) && e['logdate'].toDate() < new Date(new Date(value['enddate']).setHours(23,59,59,59))) : true) &&
      (![null,undefined].includes(value['from']) ? (e['from'] === value['from']) : true) &&
      (value['videoname'].length != 0 ? value['videoname'].includes(e['videoname']) : true) &&
      (![null,undefined].includes(value['totaltimespend']) ? (Math.ceil(e['totaltimespend']/60) > value['totaltimespend']) : true) &&
      (![null,undefined].includes(value['platform_name']) ? (e['platform_name'] != undefined ? e['platform_name'] === value['platform_name'] : false) : true)
    }
    return filterFunction;
  }
  // public customfilter():(data:any,filter:string)=> boolean{
  //   let filterFunction = (data:any, filter:any):boolean => {
  //     let e = data
  //     let value = JSON.parse(filter);
  //     return (![null,undefined].includes(value['name']) ? (this.mapProfile[e['profileid']].toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0) : true) && 
  //           (value['startdate'] != null && value['enddate'] != null ? (e['logdate'].toDate() > new Date(new Date(value['startdate']).setHours(0,0,0,0)) && e['logdate'].toDate() < new Date(new Date(value['enddate']).setHours(23,59,59,59))) : true) &&
  //           (![null,undefined].includes(value['from']) ? (e['from'] === value['from']) : true) &&
  //           (value['videoname'].length != 0 ? value['videoname'].includes(e['videoname']) : true) &&
  //           (![null,undefined].includes(value['totaltimespend']) ? (Math.ceil(e['totaltimespend']/60) > value['totaltimespend']) : true) &&
  //           (![null,undefined].includes(value['platform_name']) ? (e['platform_name'] != undefined ? e['platform_name'] === value['platform_name'] : false) : true)
  //   }
  //   return filterFunction;
  // }

  async exportCSV(){
    // ['profileid','from','lastwatchedtime','logdate','totalruntime', 'totaltimespend' ,'type', 'videoname'];
    var data = []
    let clonedContentData = Object.assign([],this.contentData.filteredData.length != 0 ? this.contentData.filteredData : this.contentData.data)
    // console.log("clonedContentData",clonedContentData);
    
    for (let i = 0; i < clonedContentData.length; i++) {
      let element = clonedContentData[i]
      if([null,undefined].includes(element['videoname'])){
        console.log("videoname",element);
        
      }
      data.push({
        "logdate":new Date(new Date(element['logdate'].toDate()).getTime() + (5 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString().substring(0,10),
        "logtime":new Date(new Date(element['logdate'].toDate()).getTime() + (5 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString().substring(11,19),
        "name":this.mapProfile[element['profileid']] ?? this.mapProfileNew[element['profileid']],
        "from":element['from'],
        "videoname" :![null,undefined].includes(element['videoname']) ? element['videoname'].replace(/,/g," ") : null,
        "totalruntime(sec)":element['totalruntime'],
        "lastwatchedtime":element['lastwatchedtime'],
        // "lastwatchedtime(only mins)":element['lastwatchedtime'].slice(2,4),
        "totaltimespend(sec)":element['totaltimespend'],
        // "platform" : element['platform_name'] ?? null
        "platform": element['platform_name'] ?? "A&H App" 
        // type:element['type']
      })
        // element['name'] = this.mapProfile[element['profileid']]
        // delete element['profileid']
        // data.push(element)
    }
    // console.log(JSON.stringify(data))
    this.downloadFile(data, new Date().toDateString() + " " + "content analytics")
  }

  downloadFile(data,filename = 'data') {
    if(data.length != 0){
      let csvData = this.ConvertToCSV(data,Object.keys(data[0]));
      // console.log(csvData)
      let blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
      let dwldLink = document.createElement("a");
      let url = URL.createObjectURL(blob);
      let isSafariBrowser = navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1;
      if (isSafariBrowser) {  //if Safari open in new window to save file with random filename.
        dwldLink.setAttribute("target", "_blank");
      }
      dwldLink.setAttribute("href", url);
      dwldLink.setAttribute("download", filename + ".csv");
      dwldLink.style.visibility = "hidden";
      document.body.appendChild(dwldLink);
      dwldLink.click();
      document.body.removeChild(dwldLink);
    }else{
      console.log("export data empty");
    }
  }

  ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = 'Index,';

    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    // console.log(row);
    
    str += row + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = (i + 1) + '';
      for (let index in headerList) {
        let head = headerList[index];
        line += ',' + array[i][head];
      }
      str += line + '\r\n';
    }
    // console.log(str);
    
    return str;
  }

  printLog(log){
    console.log(log)
  }

}

