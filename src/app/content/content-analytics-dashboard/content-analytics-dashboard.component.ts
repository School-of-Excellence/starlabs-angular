import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSortModule } from '@angular/material/sort';
import { Subject, takeUntil } from 'rxjs';
import { collectionData, limit, orderBy, query, where } from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { catchError, of, finalize } from 'rxjs';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
  ApexDataLabels,
  ApexPlotOptions,
  ApexGrid,
  ApexTooltip,
  NgApexchartsModule,
  ChartComponent
} from "ng-apexcharts";
import { MatDatepickerModule } from '@angular/material/datepicker';
import * as XLSX from 'xlsx';

interface ParticipantContentMapInterface {
  rank ?: number;
  profileid: string;
  totalWatchHours: number;
  activePlatforms: Set<string>;
  sessions: number;
  type: participantType;
  days: number;
  playlist: Set<string>;
  completedPlayList: Set<string>;
  completedContents: Set<string>
  watchedContentsMap: { [key: string]: { completion: number, watchHours: number } };
  contents: { [key: string]: Array<any> };
}

type participantType = 'superfan' | 'risingfan' | 'guest';

interface ContentMapInterface {
  rank ?: number;
  contentid: string;
  contentname: string;
  platform: string;
  from: string;
  playlistid: string;
  totalRunTime: number;
  type: string;
  profileid: Set<string>;
  totalWatchHours: number;
  completedProfiles: Set<string>;
  rewatchedProfiles: Set<string>
}

interface PlayList {
  started: Array<string>,
  ongoing: Array<string>,
  completed: Array<string>,
  notStarted: Array<string>,
  avgWatchTime: number
}

export interface ChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  grid: ApexGrid;
  tooltip: ApexTooltip;
  colors: string[];
}

export enum participantRankType {
  superfan = 0,
  risingfan = 1,
  fan = 2
}

export interface ContentType {
  content: string;
  profileid: Set<string>;
  completed: Set<string>;
  watchHours: number;
}

export interface participantTypeCheck {
  next: Date;
  count: number;
  maxDates: Array<string>;
  watchHours: number;
  preDate: Date

}

export interface PlayListMix {
  title: string;
  playlistid: string;
  profileid: Set<string>;
  contentTypes: Set<string>;
  completedProfiles: Set<string>;
  ongoingProfiles: Set<string>;
  notStartedProfiles: Set<string>;
  startedProfiles: Set<string>;
  avgWatchTime: number;
  profilesMap: {
    [key: string]: { [key: string]: any }
  }
}

@Component({
  selector: 'app-content-analytics-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatTableModule,
    MatPaginatorModule,
    MatDialogModule,
    MatTabsModule,
    MatBadgeModule,
    MatProgressBarModule,
    MatMenuModule,
    MatDividerModule,
    NgApexchartsModule,
    MatFormFieldModule,
    MatDatepickerModule,
    ReactiveFormsModule,
    MatSortModule
  ],
  templateUrl: './content-analytics-dashboard.component.html',
  styleUrl: './content-analytics-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentAnalyticsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('participantsort') participantSort !: MatSort;
  @ViewChild('participantpagination') participantPagination !: MatPaginator
  @ViewChild('contentsort') contentSort !: MatSort;
  @ViewChild('contentpagination') contentPagination !: MatPaginator;
  @ViewChild('playlistsort') playlistSort !: MatSort;
  @ViewChild('playlistpagination') playlistPagination !: MatPaginator;
  @ViewChild('activeuserchart') activeUserChart !: ChartComponent;
  @ViewChild('watchhourschart') watchHoursChart !: ChartComponent;

  public activeUsersChartOptions!: ChartOptions;
  public watchHoursChartOptions!: ChartOptions;

  destroy$ = new Subject<void>();

  // objects
  participantContentMap: { [key: string]: ParticipantContentMapInterface } = {};
  contentMap: { [key: string]: ContentMapInterface } = {};
  participantMetaDataMap: { [key: string]: any } = {};
  recommendedMixPlaylistMap: { [key: string]: { [key: string]: { [key: string]: any } } } = {};
  playListMixMap: { [key: string]: Partial<PlayListMix> } = {};
  playListMap: { [key: string]: Partial<PlayList> } = {};
  contentTypeMap: { [key: string]: ContentType } = {};

  // number
  totalUniqueUsers = 0;
  totalUniueContents = 0;
  totalWatchHours = 0;
  totalSuperFans = 0;
  totalRisingFans = 0;
  pickerOpen = false;

  // tabel columns
  participantTableColumns = ['rank', 'participant', 'type', 'mode', 'source', 'hours', 'days', 'completion', 'sessions', 'playlists']
  contentTableColumns = ['rank', 'content', 'source', 'watchhours', 'viewers', 'hviewer', 'completion', 'rewatches']
  playListTableColumns = ['title', 'assigned', 'started', 'ongoing', 'completed', 'notstarted', 'avgwatchtime']

  // tables sources
  participantTableDataSource = new MatTableDataSource<ParticipantContentMapInterface>();
  contentTableDataSource = new MatTableDataSource<ContentMapInterface>();
  playListTableDateSource = new MatTableDataSource<Partial<PlayListMix>>();

  // side panel
  sidePanelOpen = false;
  sidePanelTitle = '';
  sidePanelProfiles = [];

  // loading status
  isLoading = true;
  loadingStatus = {
    contentanalytics: true,
    recommendedMixPlaylist: true,
    bufferMixArchive: false
  }

  // date range filter
  startDate = new FormControl<Date | null>(null);
  endDate = new FormControl<Date | null>(null);

  constructor(
    public cdr: ChangeDetectorRef,
    private firestore: Firestore) {
    this.setDateRange();
    this.initActiveUsersChart();
    this.initWatchHoursChartOptions();
  }

  ngOnInit(): void {
    this.fetchParticipantMetaData();
    this.fetchContentAnalytics();
    this.fetchRecommendedMixPlayList();

  }

  ngAfterViewInit(): void {
    this.participantTableDataSource.sort = this.participantSort;
    this.participantTableDataSource.sortingDataAccessor = this.participantCustomSorting;
    this.participantTableDataSource.paginator = this.participantPagination;
    this.participantTableDataSource.filterPredicate = this.filterParticipants

    this.contentTableDataSource.sort = this.contentSort;
    this.contentTableDataSource.paginator = this.contentPagination;
    this.contentTableDataSource.filterPredicate = this.filterPredicateContent;
    this.contentTableDataSource.sortingDataAccessor = this.contentCustomSorting;

    this.playListTableDateSource.sort = this.playlistSort;
    this.playListTableDateSource.paginator = this.playlistPagination;
    this.playListTableDateSource.filterPredicate = this.filterPredicatePlayList;
    this.playListTableDateSource.sortingDataAccessor = this.playListCustomSorting;

    console.log('sorting : ', this.participantSort)
    // this.participantSort.sortChange.subscribe((d)=>console.log('changes'))
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // function to patch date range flilter on screen load
  setDateRange() {
    const start = new Date();
    const end = new Date();

    start.setDate(start.getDate() - 9);

    this.startDate.setValue(start);
    this.endDate.setValue(end);

  }

  // function to check loading status of screen
  checkIsAllLoaded() {
    const isAllLoaded = !Object.values(this.loadingStatus).includes(true);
    if (isAllLoaded) {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // function to initalize active users tabel
  initActiveUsersChart() {
    this.activeUsersChartOptions = {
      series: [
        {
          name: "Users",
          data: []
        }
      ],

      chart: {
        type: "bar",
        height: 200,
        toolbar: { show: false },
        background: "transparent",
      },

      plotOptions: {
        bar: {
          borderRadius: 6,
          columnWidth: "60%",
          dataLabels: {
            position: "center"   // 🔥 label inside bar
          }
        }
      },


      dataLabels: {
        enabled: true,
        formatter: (val: number): string => val > 0 ? `${val}` : '', // hide 0
        style: {
          colors: ["#ffffff"],   // white text
          fontSize: "12px",
          fontWeight: "600"
        }
      },

      grid: {
        show: false
      },

      xaxis: {
        categories: [],
        labels: {
          style: {
            colors: "#9CA3AF"
          }
        }
      },

      yaxis: {
        labels: {
          style: {
            colors: "#9CA3AF"
          }
        }
      },
      tooltip: {
        y: {
          formatter: (val: number) => `${val} users`
        }
      },

      colors: this.getBarColors([])
    }
  }

  // function to update active user chart
  updateDaliyActiveUsersChart() {
    const start = new Date(this.startDate.value);
    const end = new Date(this.endDate.value)
    const datesMap = new Map();
    const profiles = Object.values(this.participantContentMap);
    while (start <= end) {
      datesMap.set(start.toDateString(), 0);
      start.setDate(start.getDate() + 1);
    }

    profiles.forEach((p: ParticipantContentMapInterface) => {
      const contentDates = Object.keys(p.contents);
      contentDates.forEach((d) => {
        if (datesMap.has(d)) {
          datesMap.set(d, datesMap.get(d) + 1);
        }
      })
    });


    const dates = Array.from(datesMap.keys()).map((d) => {
      const dateSplit = d.split(' ');
      return `${dateSplit[1]} ${dateSplit[2]}`;
    });
    console.log(dates)
    const uniqueProfiles = Array.from(datesMap.values());

    this.activeUserChart.updateOptions({
      xaxis: {
        categories: dates,
        labels: {
          style: {
            colors: "#9CA3AF"
          }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      chart: {
        type: "bar",
        height: 300,
        toolbar: { show: false },
        background: "transparent",
        width: uniqueProfiles.length > 20 ? uniqueProfiles.length * 100 : 750
      },
      colors: this.getBarColors(uniqueProfiles),
    }, true, true);

    this.activeUserChart.updateSeries([
      {
        name: "Users",
        data: uniqueProfiles
      }
    ])
  }

  // helper function for charts
  getBarColors(values: number[]): string[] {
    return values.map((val, i) => {
      if (i < 2) return "#6EE7B7";
      if (i < 5) return "#93C5FD";
      return "#FCA5A5";
    });
  }

  // function to initate watchhours chart
  initWatchHoursChartOptions() {
    this.watchHoursChartOptions = {
      series: [
        {
          name: "Hours",
          data: []
        }
      ],

      chart: {
        type: "bar",
        height: 200,
        toolbar: { show: false },
        background: "transparent"
      },

      plotOptions: {
        bar: {
          borderRadius: 6,
          columnWidth: "60%",
          dataLabels: {
            position: "center"   // 🔥 label inside bar
          }
        }
      },

      dataLabels: {
        enabled: true,
        formatter: (val: number): string => val > 0 ? `${val}` : '', // hide 0
        style: {
          colors: ["#ffffff"],   // white text
          fontSize: "12px",
          fontWeight: "600"
        }
      },

      grid: {
        show: false
      },

      xaxis: {
        categories: [],
        labels: {
          style: {
            colors: "#9CA3AF"
          }
        }
      },

      yaxis: {
        labels: {
          style: {
            colors: "#9CA3AF"
          }
        }
      },

      tooltip: {
        y: {
          formatter: (val: number) => `${val} hours`
        }
      },

      colors: this.getBarColors([])
    };
  }

  // function to update watch hours chart
  updateDailyWatchHoursChart() {
    const start = new Date(this.startDate.value);
    const end = new Date(this.endDate.value)
    const datesMap = new Map();
    const profiles = Object.values(this.participantContentMap);
    while (start <= end) {
      datesMap.set(start.toDateString(), 0);
      start.setDate(start.getDate() + 1);
    }

    profiles.forEach((p: ParticipantContentMapInterface) => {
      const contentDates = Object.keys(p.contents);
      contentDates.forEach((d) => {
        if (datesMap.has(d)) {
          const contents = (p.contents[d] || []).reduce((t, c) => t + c['totaltimespend'] || 0, 0);
          datesMap.set(d, datesMap.get(d) + contents);
        }
      })
    });

    const dates = Array.from(datesMap.keys()).map((d) => {
      const dateSplit = d.split(' ');
      return `${dateSplit[1]} ${dateSplit[2]}`;
    });
    const values = Array.from(datesMap.values()).map((v) => Number.parseFloat(this.convertToHours(v).toFixed(1)));
    console.log(values)
    this.watchHoursChart.updateOptions({
      xaxis: {
        categories: dates,
        labels: {
          style: {
            colors: "#9CA3AF"
          }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      chart: {
        type: "bar",
        height: 300,
        toolbar: { show: false },
        background: "transparent",
        width: values.length > 20 ? values.length * 100 : 750
      },
      colors: ['#C4B5FD']
    }, true, true)

    this.watchHoursChart.updateSeries([
      {
        name: "Hours",
        data: values
      }
    ])
  }

  formatDate(date: any): Date | null {
    if (date?.toDate) {
      return date.toDate();
    } else if (date?.toDateString) {
      return date;
    }
    return null;
  }

  async fetchContentAnalytics() {
    this.isLoading = true;
    this.loadingStatus.contentanalytics = true;

    const constrains: any = [orderBy('logdate', 'desc')];
    if (this.startDate.value && this.endDate.value) {
      const start = new Date(this.startDate.value);
      const end = new Date(this.endDate.value);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      constrains.push(where('logdate', '>=', Timestamp.fromDate(start)))
      constrains.push(where('logdate', '<=', Timestamp.fromDate(end)))
    }

    const q = query(collection(this.firestore, 'content analytics'), ...constrains);

    const contentSnap = await getDocs(q);
    const participantContentMap: { [key: string]: ParticipantContentMapInterface } = {};
    const contentMap: { [key: string]: ContentMapInterface } = {};
    const contentTypeMap: { [key: string]: ContentType } = {};
    const participantTypeMap: Map<string, participantTypeCheck> = new Map();

    let totalUniqueUsers = 0;
    let totalUniueContents = 0;
    let totalWatchHours = 0;
    let totalSuperFans = 0;
    let totalRisingFans = 0;

    contentSnap.forEach((contSnap) => {
      const content = contSnap.data();
      const profileId = content['profileid'] || 'UnKnown';
      const contentId = content['videoid'] || 'Unknown';
      const contentname = content['videoname'] || 'Unknown';
      const platform = content['platform_name'] || 'UnKnown';
      const totalRunTime = content['totalruntime'] || 0;
      const totalTimeSpend = content['totaltimespend'] || 0;
      const playlistId = content['playlistid'] || '';
      const logDate = this.formatDate(content['logdate']);
      const dateKey = logDate?.toDateString();
      const status = content['status']
      const contentType = content['type'] || 'Unknown';

      if (!logDate) {
        return
      }

      if (!Object.hasOwn(participantContentMap, profileId)) {
        participantContentMap[profileId] = {
          profileid: profileId,
          totalWatchHours: 0,
          activePlatforms: new Set(),
          watchedContentsMap: {},
          playlist: new Set(),
          completedPlayList: new Set(),
          sessions: 0,
          completedContents: new Set(),
          days: 1,
          type: 'guest',
          contents: {}
        }
        totalUniqueUsers++
      }

      if (!Object.hasOwn(contentMap, contentId)) {
        contentMap[contentId] = {
          contentid: contentId,
          contentname: contentname,
          platform: platform,
          from: content['from'] || '',
          playlistid: playlistId,
          totalRunTime: totalRunTime,
          type: content['type'] || '',
          profileid: new Set(),
          totalWatchHours: 0,
          completedProfiles: new Set(),
          rewatchedProfiles: new Set()

        }
        totalUniueContents++
      }

      if (!Object.hasOwn(participantContentMap[profileId]['watchedContentsMap'], contentId)) {
        participantContentMap[profileId]['watchedContentsMap'][contentId] = {
          completion: 0,
          watchHours: 0
        }
      }

      if (!Object.hasOwn(participantContentMap[profileId].contents, dateKey)) {
        participantContentMap[profileId].contents[dateKey] = [];
      }

      if (!Object.hasOwn(contentTypeMap, contentType)) {
        contentTypeMap[contentType] = {
          content: contentType,
          profileid: new Set(),
          completed: new Set(),
          watchHours: 0
        }
      }

      if (!participantTypeMap.has(profileId)) {
        const log = new Date(logDate);
        log.setDate(log.getDate() - 1)
        participantTypeMap.set(profileId, {
          next: log,
          count: 1,
          preDate: new Date(logDate),
          watchHours: totalTimeSpend,
          maxDates: [log.toDateString()],
        });
      } else {
        if (logDate.toDateString() === participantTypeMap.get(profileId)?.next.toDateString()) {
          const map = participantTypeMap.get(profileId);
          const type = participantContentMap[profileId].type;
          map.count++;
          map.watchHours += totalTimeSpend;
          map.next.setDate(logDate.getDate() - 1)
          map.maxDates.push(map.next.toDateString());

          participantTypeMap.set(profileId, map);

          if (type !== 'superfan' && map.count >= 5 && map.watchHours >= 18000) {
            participantContentMap[profileId].type = 'risingfan';
          } else if (map.count >= 10 && map.watchHours >= 36000) {
            participantContentMap[profileId].type = 'superfan';
          }

        } else if (logDate.toDateString() === participantTypeMap.get(profileId)?.preDate.toDateString()) {
          const map = participantTypeMap.get(profileId);
          map.watchHours += totalTimeSpend;
          participantTypeMap.set(profileId, map);
        } else {
          const map = participantTypeMap.get(profileId);
          participantContentMap[profileId].days = Math.max(participantContentMap[profileId]?.days, map.count)
          const log = new Date(logDate);
          log.setDate(log.getDate() - 1)
          participantTypeMap.set(profileId, {
            next: log,
            count: 1,
            preDate: new Date(logDate),
            watchHours: totalTimeSpend,
            maxDates: [log.toDateString()],
          })
        }
      }

      totalWatchHours += totalTimeSpend
      participantContentMap[profileId].totalWatchHours += totalTimeSpend;
      participantContentMap[profileId].contents[dateKey].push(content);
      // participantContentMap[profileId].activePlatforms.add(contentType);
      participantContentMap[profileId]['watchedContentsMap'][contentId].watchHours += totalTimeSpend;
      participantContentMap[profileId].sessions += 1

      if (contentType !== 'Unknown') {
        participantContentMap[profileId].activePlatforms.add(contentType);
      }

      if (status === "complete") {
        participantContentMap[profileId].completedContents.add(contentId)
        participantContentMap[profileId]['watchedContentsMap'][contentId].completion += 1;
        contentTypeMap[contentType].completed.add(profileId);

        if (contentMap[contentId].completedProfiles.has(profileId)) {
          contentMap[contentId].rewatchedProfiles.add(profileId);
        } else {
          contentMap[contentId].completedProfiles.add(profileId);
        }
      }

      contentMap[contentId].profileid.add(profileId);
      contentMap[contentId].totalWatchHours += totalTimeSpend;

      contentTypeMap[contentType].profileid.add(profileId);
      contentTypeMap[contentType].watchHours += totalTimeSpend;

    })

    this.totalUniqueUsers = totalUniqueUsers
    this.totalUniueContents = totalUniueContents;
    this.totalWatchHours = totalWatchHours;
    this.totalSuperFans = totalSuperFans;
    this.totalRisingFans = totalRisingFans;

    this.participantContentMap = participantContentMap;
    this.contentMap = contentMap;
    this.contentTypeMap = contentTypeMap;

    const superFans: ParticipantContentMapInterface[] = [];
    const raisingFans: ParticipantContentMapInterface[] = [];
    const fans: ParticipantContentMapInterface[] = [];

    Object.values(participantContentMap).forEach((p) => {
      const data = { ...p, type: this.getParicipantType(p) };
      if (data.type === 'superfan') {
        superFans.push(data);
      } else if (data.type === 'risingfan') {
        raisingFans.push(data)
      } else {
        fans.push(data);
      }
    }
    );
    superFans.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
    raisingFans.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
    fans.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
    const dataSource = [...superFans, ...raisingFans, ...fans];
    // dataSource.sort((a, b) => participantRankType[a.type] - participantRankType[b.type]);
    this.participantTableDataSource.data = dataSource.map(( p, index)=>({...p , rank : index + 1}));

    const contentDataSoruce = Object.values(contentMap)
    contentDataSoruce.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
    this.contentTableDataSource.data = contentDataSoruce.map((c , index )=>({...c , rank : index + 1}));

    this.ngAfterViewInit();
    this.updateDaliyActiveUsersChart();
    this.updateDailyWatchHoursChart();
    this.loadingStatus.contentanalytics = false;
    this.checkIsAllLoaded()

  }

  async fetchParticipantMetaData() {
    const participantMetaDataMap: { [key: string]: any } = {};
    const snap = await getDocs(collection(this.firestore, 'participant metadata'))
    snap.docs.forEach((p) => {
      const data = p.data();
      participantMetaDataMap[data['profileid']] = data;
    })
    this.participantMetaDataMap = participantMetaDataMap;
  }

  // async fetchRecommendedMixPlayList() {
  //   this.loadingStatus.recommendedMixPlaylist = true;
  //   const colRef = collection(this.firestore, 'recommended mix playlist');
  //   const constrains = [];
  //   if (this.startDate.value && this.endDate.value) {
  //     const start = new Date(this.startDate.value);
  //     const end = new Date(this.endDate.value);

  //     start.setHours(0, 0, 0, 0);
  //     end.setHours(23, 59, 59, 999);

  //     constrains.push(where('date', '>=', Timestamp.fromDate(start)))
  //     constrains.push(where('date', '<=', Timestamp.fromDate(end)))
  //   }

  //   const q = query(colRef, ...constrains);

  //   const pipe = []
  //   collectionData(q)
  //     .pipe(
  //       takeUntil(this.destroy$),
  //       catchError((err) => {
  //         console.log(err);
  //         return of([]);
  //       }),
  //       finalize(() => { this.loadingStatus.recommendedMixPlaylist = false }))
  //     .subscribe((snap) => {
  //       const recommendedMixPlaylistMap: { [key: string]: { [key: string]: { [key: string]: any } } } = {};
  //       snap.forEach((mix) => {
  //         const type = mix['type'] || 'Unknown';
  //         const profileId = mix['profileid'] || 'Unknown';
  //         const recommandedPlaylistId = mix['bufferdocref']?.id || 'Unknown';

  //         if (!Object.hasOwn(recommendedMixPlaylistMap, profileId)) {
  //           recommendedMixPlaylistMap[profileId] = {
  //             [recommandedPlaylistId]: {
  //               [type]: mix
  //             }
  //           }
  //         } else if (!Object.hasOwn(recommendedMixPlaylistMap[profileId], recommandedPlaylistId)) {
  //           recommendedMixPlaylistMap[profileId][recommandedPlaylistId] = {
  //             [type]: mix
  //           }
  //         } else {
  //           recommendedMixPlaylistMap[profileId][recommandedPlaylistId][type] = mix
  //         }

  //       })
  //       this.recommendedMixPlaylistMap = recommendedMixPlaylistMap;
  //       this.loadingStatus.recommendedMixPlaylist = false;
  //       this.checkIsAllLoaded();
  //     });
  // }


  async fetchRecommendedMixPlayList() {
    this.loadingStatus.recommendedMixPlaylist = true;
    const colRef = collection(this.firestore, 'recommended mix playlist');
    const constrains: any = [orderBy('date', 'desc')];
    if (this.startDate.value && this.endDate.value) {
      const start = new Date(this.startDate.value);
      const end = new Date(this.endDate.value);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      constrains.push(where('date', '>=', Timestamp.fromDate(start)))
      constrains.push(where('date', '<=', Timestamp.fromDate(end)))
    }

    const q = query(colRef, ...constrains);

    const pipe = []
    collectionData(q)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.log(err);
          return of([]);
        }),
        finalize(() => { this.loadingStatus.recommendedMixPlaylist = false }))
      .subscribe((snap) => {
        const recommendedMixPlaylistMap: { [key: string]: { [key: string]: { [key: string]: any } } } = {};
        const playListMixMap: { [key: string]: Partial<PlayListMix> } = {};
        snap.forEach((mix) => {
          const type = mix['type'] || 'Unknown';
          const profileId = mix['profileid'] || 'Unknown';
          const recommandedPlaylistId = mix['bufferdocref']?.id || 'Unknown';
          const title = mix['title'] || 'Unknown'
          const status = mix['status'];
          const completedContents = mix['completedcontent'] || [];

          if (!Object.hasOwn(recommendedMixPlaylistMap, profileId)) {
            recommendedMixPlaylistMap[profileId] = {
              [recommandedPlaylistId]: {
                [type]: mix
              }
            }
          } else if (!Object.hasOwn(recommendedMixPlaylistMap[profileId], recommandedPlaylistId)) {
            recommendedMixPlaylistMap[profileId][recommandedPlaylistId] = {
              [type]: mix
            }
          } else {
            recommendedMixPlaylistMap[profileId][recommandedPlaylistId][type] = mix
          }

          // new codes

          if (!Object.hasOwn(playListMixMap, recommandedPlaylistId)) {
            playListMixMap[recommandedPlaylistId] = {
              title,
              playlistid: recommandedPlaylistId,
              contentTypes: new Set(),
              profileid: new Set(),
              completedProfiles: new Set(),
              ongoingProfiles: new Set(),
              notStartedProfiles: new Set(),
              startedProfiles: new Set(),
              avgWatchTime: 0,
              profilesMap: {}
            }

          }

          if (!Object.hasOwn(playListMixMap[recommandedPlaylistId], profileId)) {
            playListMixMap[recommandedPlaylistId][profileId] = {}
          }

          playListMixMap[recommandedPlaylistId][profileId][type] = mix;

          if (!playListMixMap[recommandedPlaylistId].contentTypes.has(type)) {
            playListMixMap[recommandedPlaylistId].contentTypes.add(type);
            playListMixMap[recommandedPlaylistId][type] = mix['list'] || [];
          }

          if (!playListMixMap[recommandedPlaylistId].profileid.has(profileId)) {
            playListMixMap[recommandedPlaylistId].profileid.add(profileId);
            playListMixMap[recommandedPlaylistId].notStartedProfiles.add(profileId);
          }

          if ((!playListMixMap[recommandedPlaylistId].ongoingProfiles.has(profileId) && status === 'completed') && !playListMixMap[recommandedPlaylistId].completedProfiles.has(profileId)) {
            playListMixMap[recommandedPlaylistId].notStartedProfiles.delete(profileId);
            playListMixMap[recommandedPlaylistId].completedProfiles.add(profileId);

            this.participantContentMap[profileId]?.completedPlayList.add(recommandedPlaylistId)

          } else if ((playListMixMap[recommandedPlaylistId].completedProfiles.has(profileId) || completedContents.length > 0) && !playListMixMap[recommandedPlaylistId].ongoingProfiles.has(profileId)) {
            if (playListMixMap[recommandedPlaylistId].completedProfiles.has(profileId)) {
              playListMixMap[recommandedPlaylistId].completedProfiles.delete(profileId);
              this.participantContentMap[profileId]?.completedPlayList.delete(profileId)
            } else {
              playListMixMap[recommandedPlaylistId].notStartedProfiles.delete(profileId);
            }
            playListMixMap[recommandedPlaylistId].ongoingProfiles.add(profileId);
          }


          if (!this.participantContentMap[profileId]?.playlist.has(recommandedPlaylistId)) {
            this.participantContentMap[profileId]?.playlist.add(recommandedPlaylistId)
          }

        })

        this.playListMixMap = playListMixMap;
        this.playListTableDateSource.data = Object.values(playListMixMap)
        this.recommendedMixPlaylistMap = recommendedMixPlaylistMap;
        this.loadingStatus.recommendedMixPlaylist = false;
        this.ngAfterViewInit()
        this.checkIsAllLoaded();
      });
  }

  applyDateRangeFilter() {
    this.ngOnDestroy();
    this.fetchContentAnalytics();
    this.fetchRecommendedMixPlayList();
  }

  // fetchBufferMixArchive() {
  //   this.loadingStatus.bufferMixArchive = true;
  //   const colRef = collection(this.firestore, 'buffermix archive');

  //   const constrains: any = [orderBy('date', 'desc')];
  //   if (this.startDate.value && this.endDate.value) {
  //     const start = new Date(this.startDate.value);
  //     const end = new Date(this.endDate.value);

  //     start.setHours(0, 0, 0, 0);
  //     end.setHours(23, 59, 59, 999);

  //     constrains.push(where('date', '>=', Timestamp.fromDate(start)))
  //     constrains.push(where('date', '<=', Timestamp.fromDate(end)))
  //   }

  //   const q = query(colRef, ...constrains);


  //   collectionData(q).pipe(
  //     takeUntil(this.destroy$),
  //     catchError((err) => {
  //       console.log(err);
  //       return of([]);
  //     }),
  //     finalize(() => { this.loadingStatus.bufferMixArchive = false }))
  //     .subscribe((snap) => {
  //       const playListMap: { [key: string]: Partial<PlayList> } = {};

  //       snap.forEach((playList) => {
  //         const playListId = playList['docid'];
  //         const profiles = playList['profileid'] || [];
  //         const eiflix = playList['eiflix'] || [];
  //         const solarVoice = playList['solarvoice'] || [];
  //         const generalContent = playList['generalcontent'] || [];
  //         const date = playList['date']?.toDate ? playList['date']?.toDate() : playList['date']?.toDateString ? playList['date'] : null;

  //         const playListContents = [...eiflix, ...solarVoice, ...generalContent].map((doc) => doc.id);

  //         const started = [];
  //         const completed = [];
  //         const ongoing = [];
  //         const notStarted = [];

  //         profiles.forEach((p: string) => {
  //           const participant = this.participantContentMap[p];

  //           const generalContent = this.recommendedMixPlaylistMap[p][playListId]['generalcontent'] ?? {};
  //           const eiflixContent = this.recommendedMixPlaylistMap[p][playListId]['eiflix'] ?? {};
  //           const solarVoiceContent = this.recommendedMixPlaylistMap[p][playListId]['solarvoice'] ?? {};

  //           const completedList = [generalContent, eiflixContent, solarVoiceContent].map((content) => {
  //             return content['completedcontent'] || [];
  //           }).flat().map((doc) => doc.id);

  //           const completedPlaylistId = [generalContent, eiflixContent, solarVoiceContent].map((content) => {
  //             if (content['type'] === 'generalcontent') {
  //               return content['completedcontent'] || [];
  //             }
  //             return content['completedplaylist'] || []
  //           }).flat().map((doc) => doc.id);

  //           const completedSet = new Set([...playListContents, ...completedPlaylistId]);

  //           // console.log('completed list ',completedList , playListContents , completedSet)

  //           if (completedPlaylistId.length === playListContents.length && completedSet.size === playListContents.length) {
  //             completed.push(p);
  //             return
  //           } else if (completedList.length > 0) {
  //             ongoing.push(p);
  //             return
  //           } else if (this.isParticipantStartedPlayList(playListContents, p, date, playList)) {
  //             started.push(p);
  //             return
  //           } else {
  //             notStarted.push(p);
  //           }
  //         });

  //         const totalWatchHours = this.getTotalWatchTimeForPlayList(playListContents, profiles, date, playList)
  //         playListMap[playListId] = { ...playList, started, notStarted, ongoing, completed, avgWatchTime: totalWatchHours }
  //       });

  //       this.playListMap = playListMap;
  //       this.playListTableDateSource.data = Object.values(playListMap);
  //       this.loadingStatus.bufferMixArchive = false;
  //       this.checkIsAllLoaded();
  //     });
  // }

  isParticipantStartedPlayList(contentId: string[], profileId: string, date: Date, playList) {
    const participant = this.participantContentMap[profileId]?.contents;
    if (!date || !participant) {
      return false;
    }
    const seconds = new Date(date.toDateString()).getTime();

    return Object.keys(participant).some((dateString: string) => {
      const contentDate = new Date(dateString).getTime();
      if (seconds <= contentDate) {
        return participant[dateString].some((content) => {
          const cId = content['videoid'];
          const playListId = content['playlistid'];
          if (!cId && !playListId) {
            return false;
          }
          return contentId.includes(cId) || contentId.includes(playListId);
        });
      }
      return false
    });
  }

  getTotalWatchTimeForPlayList(playListContents: string[], profiles: string[], playListDate: Date, playList) {
    if (!playListDate) {
      return 0;
    }
    const seconds = new Date(playListDate.toDateString()).getTime();
    const totalWatchHours = profiles.reduce((wholeTotal, p) => {
      const participant = this.participantContentMap[p]?.contents ?? {};
      return wholeTotal + Object.keys(participant).reduce((total: number, dateString: string) => {

        const contentDate = new Date(dateString).getTime();
        if (seconds <= contentDate) {
          return total + participant[dateString].reduce((watchtime, content) => {
            const cId = content['videoid'];
            const playListId = content['playlistid'];
            if (!cId && !playListId) {
              return watchtime;
            }
            if (playListContents.includes(cId) || playListContents.includes(playListId)) {
              return watchtime + content['totaltimespend'] || 0;
            }
            return watchtime;
          }, 0);
        }
        return total
      }, 0)
    }, 0)
    return totalWatchHours;
  }

  // getParticipantStatusForPlayList(playListId : string , profileId : string ){
  //   const participant = this.participantContentMap[profileId];
  //   const participantDataForPlaylist = this.recommendedMixPlaylistMap[profileId][playListId];

  //   Object.values(participantDataForPlaylist).forEach((content)=>{
  //     const totalContent = content?.completedcontent;

  //   })
  // }

  getUniqueUsers(): string[] {
    return Object.keys(this.participantContentMap);
  }

  getUniqueContents(): string[] {
    return Object.keys(this.contentMap);
  }


  getTotalWatchHours(): number {
    return this.convertToHours(Object.values(this.participantContentMap).reduce((t, p) => t + p.totalWatchHours, 0))
  }

  getSuperFans(): string[] {
    return this.participantTableDataSource.data.filter((p) => p.type === 'superfan').map((d) => d.profileid);
  }

  getRaisingFans(): string[] {
    return this.participantTableDataSource.data.filter((p) => {
      return p.type === 'risingfan'
    }).map((d) => d.profileid);
  }

  getAtRiskParticipants(): string[] {
    return Object.keys(this.participantMetaDataMap).filter((pId) => !Object.hasOwn(this.participantContentMap, pId) && this.participantMetaDataMap[pId]?.customerstatus === 'active');
  }

  getProfilesOnlyWatchSolarVoice(): string[] {
    return Object.values(this.participantContentMap).filter((p) => p.activePlatforms.size === 1 && p.activePlatforms.has('solarvoice')).map((d) => d.profileid)
  }

  getProfilesOnlyWatchEifilx(): string[] {
    return Object.values(this.participantContentMap).filter((p) => p.activePlatforms.size === 1 && p.activePlatforms.has('eiflixcontent')).map((d) => d.profileid)
  }

  // function to get loading progress
  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStatus).filter(state => state === true).length;
    const total = Object.keys(this.loadingStatus).length;
    return (loaded / total) * 100;
  }
  getMaxConsistentWatchDays(p: ParticipantContentMapInterface): string[] {
    const contents = p.contents;
    // console.log(Object.keys(contents))
    const dates = Object.keys(contents).map((d) => new Date(d));
    dates.sort((a, b) => a.getTime() - b.getTime());
    let max = [dates[0].toDateString()];
    let tempMax = [dates[0].toDateString()];

    for (let i = 1; i < dates.length; i++) {
      const timeDelay = dates[i].getTime() - dates[i - 1].getTime();
      if (timeDelay / 86400000 === 1) {
        tempMax.push(dates[i].toDateString());
      } else {
        tempMax = [dates[i].toDateString()];
      }
      if (max.length < tempMax.length) {
        max = [...tempMax];
      }
    }

    return max;

  }


  // getWatchHours(profileId : string){
  //   const participant = this.participantContentMap[profileId];
  //   if (!participant) {
  //     return [];
  //   }
  //   const contents = Object.values(participant.contents);

  // }

  getWatchHoursForType(p: ParticipantContentMapInterface): number {
    const contents = p.contents;
    const dates = this.getMaxConsistentWatchDays(p);
    const watchHours = dates.reduce((wholeTotal, date) => wholeTotal + contents[date].reduce((total, content) => content.totaltimespend + total, 0), 0);
    return watchHours;
  }


  getParicipantType(p: ParticipantContentMapInterface): participantType {
    const dates = this.getMaxConsistentWatchDays(p);
    const watchHours = this.getWatchHoursForType(p);
    // console.log(dates , watchHours)
    if (dates.length >= 10 && watchHours >= 36000) {
      return 'superfan';
    } else if (dates.length >= 5 && watchHours >= 10800) {
      return 'risingfan';
    } else {
      return 'guest'
    }
  }

  getParticipantActivePlatforms(p: ParticipantContentMapInterface) {
    const platforms = p.activePlatforms;
    return [...platforms.values()]
  }

  // getCompletionRateForContent(c: ContentMapInterface): number {
  //   const profiles = Array.from(c.profileid.values());
  //   const completedProfiles = profiles.filter((p: string) => {
  //     const participant = this.participantContentMap[p]?.watchedContentsMap[c.contentid];
  //     if (participant.completion > 0) return true;
  //     return false
  //   });

  //   return Math.floor(completedProfiles.length / profiles.length)
  // }

  // getReWatchersCountForContent(c: ContentMapInterface): number {
  //   const profiles = Array.from(c.profileid.values());
  //   return profiles.filter((p: string) => {
  //     const participant = this.participantContentMap[p]?.watchedContentsMap[c.contentid];
  //     if (!participant) {
  //       return false;
  //     }
  //     if (participant.completion > 0 && participant.watchHours > c.totalRunTime) return true
  //     return false;
  //   }).length
  // }

  // getTotalPlayListForParticipant(p: ParticipantContentMapInterface): number {
  //   const playlist = this.recommendedMixPlaylistMap[p.profileid];
  //   if (!playlist) {
  //     return 0
  //   }
  //   return Object.keys(playlist).length;
  // }

  // getPlayListCompletedForParticipant(p: ParticipantContentMapInterface): number {
  //   const participantPlaylist = this.recommendedMixPlaylistMap[p.profileid];
  //   if (!participantPlaylist) {
  //     return 0
  //   }
  //   const playListId = Object.keys(participantPlaylist);
  //   return playListId.filter((pl: string) => {
  //     const playList = this.playListMap[pl];
  //     if (!playList) {
  //       return false;
  //     }
  //     return playList.completed.includes(p.profileid);
  //   }).length
  // }

  convertToHours(seconds: number): number {
    return seconds / 3600
  }

  // function to open side panel for cards
  openCards(type: string) {
    let data = [];
    let title = ''

    switch (type) {
      case 'uniqueusers':
        title = 'Total Unique users'
        data = this.getUniqueUsers();
        break;
      case 'superfans':
        title = 'Super Fans'
        data = this.getSuperFans();
        break
      case 'risingfans':
        title = 'Rising Fans'
        data = this.getRaisingFans();
        break
      case 'atrisk':
        title = 'At Risk Participants'
        data = this.getAtRiskParticipants();
        console.log(this.getAtRiskParticipants())
        break
      case 'onlysolarvoice':
        title = 'Participant only uses Solar voice'
        data = this.getProfilesOnlyWatchSolarVoice();
        break
      case 'onlyeiflix':
        title = 'Participant only uses Eiflix'
        data = this.getProfilesOnlyWatchEifilx();
        break
      default:
        break;
    }

    this.openSidePanel(title, data)
  }

  // function to open side panel for platform comaparision
  openPlatformComparView(platform: string, completed: boolean) {
    let data = [];
    let title = '';
    if (completed) {
      title = `${platform} Completed`
      data = Array.from(this.contentTypeMap[platform.toLocaleLowerCase()].completed.values())
    } else {
      data = Array.from(this.contentTypeMap[platform.toLocaleLowerCase()].profileid.values());
      title = platform;
    }

    this.openSidePanel(title, data)
  }

  // function to open side panel for playlist table
  openPlayListPanelView(playlist: PlayListMix, type: string) {
    let data: string[] = Array.from(playlist[type]?.values() || []);
    let title = `Playlist ${playlist.title}`;

    this.openSidePanel(title, data);
  }

  // function to open side panel for content table
  openContentPanelView(content: ContentMapInterface, type: string) {
    let data: string[] = Array.from(content[type]?.values() || []);
    let title = `Content ${content.contentname}`;

    this.openSidePanel(title, data);
  }

  // function to handle export in side panel
  exportPanelData() {
    const exportData = this.sidePanelProfiles.map((p) => ({
      'Name': p['name'] || 'N/A',
      'Email': p['email'] || 'N/A',
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');

    const fileName = `$Participants_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  }


  // function to open side panel
  openSidePanel(title: string, profileid: string[]) {
    this.sidePanelOpen = true;
    this.sidePanelTitle = title;
    this.sidePanelProfiles = profileid.map((p) => this.participantMetaDataMap[p]);
  }

  // function to close panel
  closeSidePanel() {
    this.sidePanelOpen = false;
  }

  // helper function to get initial for participant
  getInitials(profileId: string): string {
    const name = this.participantMetaDataMap[profileId]?.name || ' '
    return name
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  }

  filterParticipants = (p: ParticipantContentMapInterface, filter: string) => {
    console.log(this.participantMetaDataMap)
    const name = (this.participantMetaDataMap[p.profileid]?.name || '')?.toLocaleLowerCase()?.trim();
    if (!name) {
      return false
    }
    return name.includes(filter?.toLocaleLowerCase()?.trim())
  };

  filterParticipantTabel(search: string) {
    this.participantTableDataSource.filter = search;
  }

  filterPredicatePlayList = (p: PlayListMix, filter: string) => {
    const title = (p.title || '')?.toLocaleLowerCase();
    if (!title) {
      return false
    }
    return title.includes(filter?.toLocaleLowerCase()?.trim())
  };

  filterPlayListTabel(search: string) {
    this.playListTableDateSource.filter = search;
  }

  filterPredicateContent = (p: ContentMapInterface, filter: string) => {
    const title = (p.contentname || '')?.toLocaleLowerCase();
    if (!title) {
      return false
    }
    return title.includes(filter?.toLocaleLowerCase()?.trim())
  };

  filterContentTabel(search: string) {
    this.contentTableDataSource.filter = search;
  }

  participantCustomSorting = (item: ParticipantContentMapInterface, property: string): any => {
    switch (property) {
       case 'rank':
        return item?.rank
      case 'participant':
        return this.participantMetaDataMap[item.profileid]?.name || ''
      case 'type':
        return item.type
      case 'mode':
        return this.participantMetaDataMap[item.profileid]?.participantmode || ''
      case 'source':
        return item.activePlatforms.size
      case 'hours':
        return item.totalWatchHours
      case 'days':
        return item.days
      case 'completion':
        return item.completedContents.size
      case 'sessions':
        return item.sessions
      case 'playlists':
        return item.completedPlayList.size
      default:
        break;
    }
  };

  contentCustomSorting = (item: ContentMapInterface, property: string): any => {
    switch (property) {
      case 'rank':
        return item?.rank
      case 'content':
        return item.contentname || ''
      case 'source':
        return item.type || ''
      case 'watchhours':
        return item.totalWatchHours
      case 'viewers':
        return item.profileid.size
      case 'hviewer':
        return (item.completedProfiles.size / item.profileid.size || 1)
      case 'completion':
        return item.completedProfiles.size
      case 'rewatches':
        return item.rewatchedProfiles.size
      default:
        break;
    }
  };

  playListCustomSorting = (item: PlayListMix, property: string): any => {
    switch (property) {
      case 'title':
        return item.title || ''
      case 'assigned':
        return item.profileid.size
      case 'started':
        return 0
      case 'ongoing':
        return item.ongoingProfiles.size
      case 'completed':
        return item.completedProfiles.size
      case 'notstarted':
        return item.notStartedProfiles.size
      case 'avgwatchtime':
        return 0
      default:
        break;
    }
  };

  togglePicker() {
    this.pickerOpen = !this.pickerOpen;
  }

  clearDates(event: Event) {
    event.stopPropagation();
    this.startDate.reset();
    this.endDate.reset();
  }
}
