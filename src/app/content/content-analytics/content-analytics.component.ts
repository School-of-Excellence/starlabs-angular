import { Component, ViewChild, OnDestroy } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import {
  collection,
  Firestore,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where
} from '@angular/fire/firestore';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-content-analytics',
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
    MatProgressSpinnerModule
  ],
  templateUrl: './content-analytics.component.html',
  styleUrl: './content-analytics.component.css'
})
export class ContentAnalyticsComponent implements OnDestroy {

  contentAnalytics: any[] = [];
  mapProfile: { [key: string]: string } = {};
  mapProfileNew: { [key: string]: string } = {};

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  displayedColumns: string[] = [
    'logdate', 'profileid', 'from', 'videoname',
    'platform_name', 'totalruntime', 'lastwatchedtime',
    'totaltimespend', 'type', 'playlist', 'status'
  ];

  contentData = new MatTableDataSource<any>();

  startDate: Date;
  endDate: Date;
  mapPlaylist: { [key: string]: string } = {};

  filterValue = {
    name: null,
    startdate: null,
    enddate: null,
    from: null,
    videoname: [],
    totaltimespend: null,
    platform_name: null
  };

  videoNameList: string[] = [];
  fromScreenList: string[] = [];
  platformNameList: string[] = [];

  private subscription = new Subject<void>();
  private unsubscribeContentAnalytics: (() => void) | null = null;
  uniqueuser: number | null = null;
  uniqueUserContentConsumptionbyhours: string | null = null;
  uniqueUserContentConsumptionbydays: string | null = null;
  averageTimeSpendPerUser: string | null = null;
  querydays: number | null = null;

  isLoading = false;
  hasFetched = false;

  seriesDataList: any[] = [];
  tierData :any[] = [];
  tiermap: any = {};

  constructor(
    public firestore: Firestore,
    private guard: AuthguardService
  ) {
    const today = new Date();
    this.startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    this.endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    });
    this.guard.getProfileMapNewUser().then(newuser => {
      this.mapProfileNew = newuser.map;
    });

  }

  ngOnInit(): void {
    this.contentData.filterPredicate = this.customfilter();
    this.filterData();
    this.seriesData();
  }
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
  filterData(): void {
    if (this.unsubscribeContentAnalytics) {
      this.unsubscribeContentAnalytics();
      this.unsubscribeContentAnalytics = null;
    }
    this.contentAnalytics = [];
    this.fromScreenList = [];
    this.videoNameList = [];
    this.platformNameList = [];
    this.resetMetrics();
    this.isLoading = true;
    this.hasFetched = false;

    this.startDate = new Date(this.startDate.setHours(0, 0, 0, 0));
    this.endDate = new Date(this.endDate.setHours(23, 59, 59, 999));

    this.querydays = Math.round(
      Math.abs(this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const contentanalyticsRef = collection(this.firestore, 'content analytics');
    const contentanalyticsQuery = query(
      contentanalyticsRef,
      where('logdate', '>', this.startDate),
      where('logdate', '<', this.endDate),
      orderBy('logdate', 'desc')
    );

    this.unsubscribeContentAnalytics = onSnapshot(
      contentanalyticsQuery,
      (snapshot) => {
        if (!this.hasFetched) {
          this.contentAnalytics = snapshot.docs.map(doc => {
            const data = doc.data();
            data['docid'] = doc.id;
            data['live'] = false;
            return data;
          });
          this.hasFetched = true;
          this.isLoading = false;
          this.contentData.data = [...this.contentAnalytics];
          this.contentData.sort = this.sort;
          this.contentData.paginator = this.paginator;
          this.getUniqueUser();
          // this.checkSeriesCompletion();
        } else {
          snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            data['docid'] = change.doc.id;
            data['live'] = (change.type === 'modified');

            if (change.type === 'added') {
              this.contentAnalytics.unshift(data);
            } else if (change.type === 'modified') {
              const idx = this.contentAnalytics.findIndex(e => e['docid'] === data['docid']);
              if (idx !== -1) this.contentAnalytics[idx] = data;
            } else if (change.type === 'removed') {
              this.contentAnalytics = this.contentAnalytics.filter(e => e['docid'] !== data['docid']);
            }
          });
        }
        this.contentAnalytics.forEach(element => {
          if (element['from'] && !this.fromScreenList.includes(element['from'])) {
            this.fromScreenList.push(element['from']);
          }
          if (element['videoname'] && !this.videoNameList.includes(element['videoname'])) {
            this.videoNameList.push(element['videoname']);
          }
          if (element['platform_name'] && !this.platformNameList.includes(element['platform_name'])) {
            this.platformNameList.push(element['platform_name']);
          }
        });
        this.contentData.data = [...this.contentAnalytics];
        this.contentData.sort = this.sort;
        this.contentData.paginator = this.paginator;
        this.getUniqueUser();
        // this.checkSeriesCompletion()
        
      },
      (error) => {
        console.error('Content analytics error:', error);
        this.isLoading = false;
      }
    );

    const solarvoiceplaylistRef = collection(this.firestore, 'solar voice playlist');
    getDocs(solarvoiceplaylistRef).then(playlist => {
      playlist.docs.forEach(doc => {
        const element = doc.data();
        this.mapPlaylist[element['id']] = element['name'];
      });
    });
  }
  ngAfterViewInit(): void {
    this.contentData.data = this.contentAnalytics;
    this.contentData.sort = this.sort;
    this.contentData.paginator = this.paginator;
  }
  tierCompletionMap: any = {};
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

    const tierCompletionMap: any = {};

    for (const [profileid, playlists] of userSeriesMap.entries()) {
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
          const tierName = this.tiermap[tierid]?.tier || tierid;
          const seriesName = series.seriesName || series.id;

          tierCompletionMap[tierName] ??= {};
          tierCompletionMap[tierName][seriesName] ??= [];

          tierCompletionMap[tierName][seriesName].push(profileName);
        }
      }
    }
    this.tierCompletionMap = tierCompletionMap;
    console.log(this.tierCompletionMap, 'tierCompletionMap');
  }
  // checkSeriesCompletion() {
  //   const completedLogs = this.contentAnalytics.filter(
  //     e => e.status === 'complete'
  //   );
  //   const userSeriesMap: any = {};
  //   completedLogs.forEach(log => {
  //     const { profileid, playlistid, videoid } = log;

  //     if (!profileid || !playlistid || !videoid) return;

  //     if (!userSeriesMap[profileid]) {
  //       userSeriesMap[profileid] = {};
  //     }

  //     if (!userSeriesMap[profileid][playlistid]) {
  //       userSeriesMap[profileid][playlistid] = new Set();
  //     }

  //     userSeriesMap[profileid][playlistid].add(videoid);
  //   });
  //   this.tierCompletionMap = {};
  //   Object.keys(userSeriesMap).forEach(profileid => {
  //     const playlists = userSeriesMap[profileid];
  //     Object.keys(playlists).forEach(playlistid => {
  //       const completedVideos = playlists[playlistid];
  //       const series = this.seriesDataList.find(s => s.id === playlistid);
  //       if (!series || !series.sequence) return;
  //       const sequenceIds = series.sequence.map((seq: any) =>seq.id);
  //       const isCompleted = sequenceIds.every(id =>completedVideos.has(id));
  //       if (isCompleted) {
  //         const profileName =
  //           this.mapProfile[profileid] ||
  //           this.mapProfileNew[profileid] ||
  //           profileid;
  //         const tiers = series.tier || [];
  //         tiers.forEach((tierRef: any) => {
  //           const tierid = tierRef.id || tierRef;
  //           const tierName = this.tiermap[tierid]?.tier || tierid;
  //           if (!this.tierCompletionMap[tierName]) {
  //             this.tierCompletionMap[tierName] = {};
  //           }
  //           if (!this.tierCompletionMap[tierName][series.seriesName || series.id]) {
  //             this.tierCompletionMap[tierName][series.seriesName || series.id] = [];
  //           }
  //           this.tierCompletionMap[tierName][series.seriesName || series.id].push(profileName);
  //         });
  //       }
  //     });
  //   });
  //   console.log(this.tierCompletionMap,'tierCompletionMaptierCompletionMap');
  // }
  onClearFilterValue(): void {
    this.filterValue = {
      name: null,
      startdate: null,
      enddate: null,
      from: null,
      videoname: [],
      totaltimespend: null,
      platform_name: null
    };
    this.onFilter(this.filterValue);
  }

  convertDecimal(value: number): string {
    const minutes = Math.floor(value / 60);
    const remainingSeconds = value % 60;
    return `${minutes} mins ${remainingSeconds} sec (${value})`;
  }

  convertDaysHoursMins(seconds: number): string {
    const days = Math.floor(seconds / (3600 * 24));
    const rem1 = seconds % (3600 * 24);
    const hours = Math.floor(rem1 / 3600);
    const rem2 = rem1 % 3600;
    const minutes = Math.floor(rem2 / 60);
    const remainingSeconds = rem2 % 60;
    return `${days} days ${hours} hours ${minutes} mins ${remainingSeconds} secs`;
  }

  convertHoursMins(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const rem = seconds % 3600;
    const minutes = Math.floor(rem / 60);
    const remainingSeconds = rem % 60;
    return `${hours} hours ${minutes} mins ${remainingSeconds} secs`;
  }

  private resetMetrics(): void {
    this.uniqueuser = null;
    this.uniqueUserContentConsumptionbyhours = null;
    this.uniqueUserContentConsumptionbydays = null;
    this.averageTimeSpendPerUser = null;
  }

  ngOnDestroy(): void {
    if (this.unsubscribeContentAnalytics) {
      this.unsubscribeContentAnalytics();
    }
    this.subscription.next();
    this.subscription.complete();
  }

  getUniqueUser(): void {
    const uniqueUser: { [key: string]: number } = {};
    const filtered = this.contentData.filteredData;

    for (const element of filtered) {
      uniqueUser[element['profileid']] = (uniqueUser[element['profileid']] || 0) + element['totaltimespend'];
    }

    this.uniqueuser = Object.keys(uniqueUser).length;

    const totalconsumption = Object.values(uniqueUser).reduce((c, a) => c + a, 0);
    this.uniqueUserContentConsumptionbydays = this.convertDaysHoursMins(totalconsumption);
    this.uniqueUserContentConsumptionbyhours = this.convertHoursMins(totalconsumption);
    this.averageTimeSpendPerUser = this.uniqueuser > 0
      ? this.convertHoursMins(Math.round(totalconsumption / this.uniqueuser))
      : '0 hours 0 mins 0 secs';
  }

  onFilter(value: any): void {
    this.contentData.filter = JSON.stringify(value);
    this.getUniqueUser();
  }

  public customfilter(): (data: any, filter: string) => boolean {
    return (data: any, filter: string): boolean => {
      const e = data;
      const value = JSON.parse(filter);
      return (
        (value['name'] != null
          ? (this.mapProfile[e['profileid']]?.toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0) ||
            (this.mapProfileNew[e['profileid']]?.toLowerCase().indexOf(value['name'].toLowerCase().trim()) === 0)
          : true) &&
        (value['startdate'] != null && value['enddate'] != null
          ? e['logdate'].toDate() > new Date(new Date(value['startdate']).setHours(0, 0, 0, 0)) &&
            e['logdate'].toDate() < new Date(new Date(value['enddate']).setHours(23, 59, 59, 59))
          : true) &&
        (value['from'] != null ? e['from'] === value['from'] : true) &&
        (value['videoname']?.length > 0 ? value['videoname'].includes(e['videoname']) : true) &&
        (value['totaltimespend'] != null ? Math.ceil(e['totaltimespend'] / 60) > value['totaltimespend'] : true) &&
        (value['platform_name'] != null
          ? e['platform_name'] != null ? e['platform_name'] === value['platform_name'] : false
          : true)
      );
    };
  }

  async exportCSV(): Promise<void> {
    const data: any[] = [];
    const cloned = this.contentData.filteredData.length > 0
      ? [...this.contentData.filteredData]
      : [...(this.contentData.data as any[])];

    for (const element of cloned) {
      if (element['videoname'] == null) {
        console.log('videoname missing:', element);
      }
      const istOffset = (5 * 60 + 30) * 60 * 1000;
      const d = new Date(element['logdate'].toDate().getTime() + istOffset);
      data.push({
        logdate: d.toISOString().substring(0, 10),
        logtime: d.toISOString().substring(11, 19),
        name: this.mapProfile[element['profileid']] ?? this.mapProfileNew[element['profileid']],
        from: element['from'],
        videoname: element['videoname'] != null ? element['videoname'].replace(/,/g, ' ') : null,
        'totalruntime(sec)': element['totalruntime'],
        lastwatchedtime: element['lastwatchedtime'],
        'totaltimespend(sec)': element['totaltimespend'],
        platform: element['platform_name'] ?? 'A&H App'
      });
    }
    this.downloadFile(data, new Date().toDateString() + ' content analytics');
  }

  downloadFile(data: any[], filename = 'data'): void {
    if (data.length === 0) {
      console.log('export data empty');
      return;
    }
    const csvData = this.ConvertToCSV(data, Object.keys(data[0]));
    const blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const isSafari = navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1;
    if (isSafari) link.setAttribute('target', '_blank');
    link.setAttribute('href', url);
    link.setAttribute('download', filename + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  ConvertToCSV(objArray: any[], headerList: string[]): string {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = 'Index,' + headerList.join(',') + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = (i + 1) + '';
      for (const head of headerList) {
        line += ',' + array[i][head];
      }
      str += line + '\r\n';
    }
    return str;
  }

  printLog(log: any): void {
    console.log(log);
  }
}