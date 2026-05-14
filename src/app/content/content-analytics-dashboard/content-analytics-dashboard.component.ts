import { Component, OnInit, AfterViewInit, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, } from '@angular/core';
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
import { collectionData, onSnapshot, orderBy, query, where } from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';
import { collection, DocumentReference, getDocs, Timestamp, Unsubscribe } from 'firebase/firestore';
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
import { secondsInMinute } from 'date-fns/constants';
import { Router,RouterLink,RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

interface ParticipantContentMapInterface {
  rank?: number;
  profileid: string;
  live: boolean;
  totalWatchHours: number;
  activePlatforms: Set<string>;
  sessions: number;
  type: participantType;
  contentid: Set<string>;
  days: number;
  maxContWatchDates: Array<Date>,
  maxWatch: number,
  playlist: Set<string>;
  recommendedPlaylist: Set<string>;
  completedPlayList: Set<string>;
  completedContents: Set<string>
  watchedContentsMap: { [key: string]: { completion: number, watchHours: number } };
  contents: { [key: string]: Array<any> };
  lastSeen: Date;
}

type participantType = 'superfan' | 'risingfan' | 'guest';

interface ContentMapInterface {
  rank?: number;
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

export interface ContentType {
  content: string;
  profileid: Set<string>;
  completed: Set<string>;
  watchHours: number;
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
    MatSortModule,
    RouterModule,
    RouterLink 
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
  analyticsSubscribe: Unsubscribe;
  isInitialLoaded = false;

  // objects
  participantContentMap: { [key: string]: ParticipantContentMapInterface } = {};
  contentMap: { [key: string]: ContentMapInterface } = {};
  participantMetaDataMap: { [key: string]: any } = {};
  journeyMap: { [key: string]: any } = {};
  playListMixMap: { [key: string]: Partial<PlayListMix> } = {};
  contentTypeMap: { [key: string]: ContentType } = {};

  // number
  totalUniqueUsers = 0;
  totalUniueContents = 0;
  totalWatchHours = 0;
  totalSuperFans = 0;
  totalRisingFans = 0;
  pickerOpen = false;
  initialLoaded = false;
  
  // total content comsumption 
  uniqueUserContentConsumptionbyhours:any = 0;

  //period
  totalDays: number = 0;

  // tabel columns
  participantTableColumns = ['rank', 'participant', 'type', 'mode', 'source', 'hours', 'days', 'completion', 'sessions', 'playlists', 'lastseen']
  contentTableColumns = ['rank', 'content', 'source', 'watchhours', 'viewers', 'hviewer', 'completion', 'rewatches']
  playListTableColumns = ['title', 'assigned', 'started', 'ongoing', 'completed', 'notstarted', 'avgwatchtime']

  // tables sources
  participantTableDataSource = new MatTableDataSource<ParticipantContentMapInterface>();
  contentTableDataSource = new MatTableDataSource<ContentMapInterface>();
  playListTableDateSource = new MatTableDataSource<Partial<PlayListMix>>();

  // dialog box
  dialogOpen = false;
  dialogTitle = '';
  dialogProfiles = [];

  // loading status
  isLoading = true;
  loadingStatus = {
    contentanalytics: true,
    recommendedMixPlaylist: true,
  }

  // date range filter
  startDate = new FormControl<Date | null>(null);
  endDate = new FormControl<Date | null>(null);
  // pickerOpen = false;


  constructor(
    public cdr: ChangeDetectorRef,
     private router: Router,
    private firestore: Firestore) {
    this.setDateRange();
    this.initActiveUsersChart();
    this.initWatchHoursChartOptions();
  }

  ngOnInit(): void {
    this.fetchParticipantMetaData();
    this.fetchContentAnalytics();
    this.fetchjourney();
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

    this.totalDays = this.getTotalDays(start, end);
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
            position: "center"
          }
        }
      },


      dataLabels: {
        enabled: true,
        formatter: (val: number): string => val > 0 ? `${val}` : '',
        style: {
          colors: ["#ffffff"],
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
            position: "center"
          }
        }
      },

      dataLabels: {
        enabled: true,
        formatter: (val: number): string => val > 0 ? `${val}` : '',
        style: {
          colors: ["#ffffff"],
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

  // async fetchContentAnalytics() {
  //   this.isLoading = true;
  //   this.loadingStatus.contentanalytics = true;

  //   const constrains: any = [orderBy('logdate', 'desc')];
  //   if (this.startDate.value && this.endDate.value) {
  //     const start = new Date(this.startDate.value);
  //     const end = new Date(this.endDate.value);

  //     start.setHours(0, 0, 0, 0);
  //     end.setHours(23, 59, 59, 999);

  //     constrains.push(where('logdate', '>=', Timestamp.fromDate(start)))
  //     constrains.push(where('logdate', '<=', Timestamp.fromDate(end)))
  //   }

  //   const q = query(collection(this.firestore, 'content analytics'), ...constrains);

  //   // const contentSnap = await getDocs(q);
  //   collectionData(q).pipe(takeUntil(this.destroy$)).subscribe((contentSnap) => {
  //     const participantContentMap: { [key: string]: ParticipantContentMapInterface } = {};
  //     const contentMap: { [key: string]: ContentMapInterface } = {};
  //     const contentTypeMap: { [key: string]: ContentType } = {};
  //     const participantTypeMap: Map<string, participantTypeCheck> = new Map();

  //     let totalUniqueUsers = 0;
  //     let totalUniueContents = 0;
  //     let totalWatchHours = 0;
  //     let totalSuperFans = 0;
  //     let totalRisingFans = 0;

  //     contentSnap.forEach((content) => {
  //       // const content = contSnap.data();
  //       const profileId = content['profileid'] || 'UnKnown';
  //       const contentId = content['videoid'] || 'Unknown';
  //       const contentname = content['videoname'] || 'Unknown';
  //       const platform = content['platform_name'] || 'UnKnown';
  //       const totalRunTime = content['totalruntime'] || 0;
  //       const totalTimeSpend = content['totaltimespend'] || 0;
  //       const playlistId = content['playlistid'] || '';
  //       const logDate = this.formatDate(content['logdate']);
  //       const dateKey = logDate?.toDateString();
  //       const status = content['status']
  //       const contentType = content['type'] || 'Unknown';

  //       if (!logDate) {
  //         return
  //       }

  //       if (!Object.hasOwn(participantContentMap, profileId)) {
  //         participantContentMap[profileId] = {
  //           profileid: profileId,
  //           totalWatchHours: 0,
  //           activePlatforms: new Set(),
  //           watchedContentsMap: {},
  //           playlist: new Set(),
  //           recommendedPlaylist: new Set(),
  //           completedPlayList: new Set(),
  //           sessions: 0,
  //           completedContents: new Set(),
  //           days: 1,
  //           contentid: new Set(),
  //           live: false,
  //           type: 'guest',
  //           contents: {}
  //         }
  //         totalUniqueUsers++
  //       }

  //       if (!Object.hasOwn(contentMap, contentId)) {
  //         contentMap[contentId] = {
  //           contentid: contentId,
  //           contentname: contentname,
  //           platform: platform,
  //           from: content['from'] || '',
  //           playlistid: playlistId,
  //           totalRunTime: totalRunTime,
  //           type: content['type'] || '',
  //           profileid: new Set(),
  //           totalWatchHours: 0,
  //           completedProfiles: new Set(),
  //           rewatchedProfiles: new Set()

  //         }
  //         totalUniueContents++
  //       }

  //       if (!Object.hasOwn(participantContentMap[profileId]['watchedContentsMap'], contentId)) {
  //         participantContentMap[profileId]['watchedContentsMap'][contentId] = {
  //           completion: 0,
  //           watchHours: 0
  //         }
  //       }

  //       if (!Object.hasOwn(participantContentMap[profileId].contents, dateKey)) {
  //         participantContentMap[profileId].contents[dateKey] = [];
  //       }

  //       if (!Object.hasOwn(contentTypeMap, contentType)) {
  //         contentTypeMap[contentType] = {
  //           content: contentType,
  //           profileid: new Set(),
  //           completed: new Set(),
  //           watchHours: 0
  //         }
  //       }

  //       if (!participantTypeMap.has(profileId)) {
  //         const log = new Date(logDate);
  //         log.setHours(0, 0, 0, 0);
  //         participantTypeMap.set(profileId, {
  //           watchHours: totalTimeSpend,
  //           maxDates: [log],
  //         });
  //       } else {
  //         const map = participantTypeMap.get(profileId);
  //         const type = participantContentMap[profileId].type;
  //         const contDate = new Date(logDate);
  //         contDate.setHours(0, 0, 0, 0);
  //         const timeDelay = map.maxDates.at(-1).getTime() - contDate.getTime();
  //         if (timeDelay / 86400000 === 1) {
  //           map.maxDates.push(contDate);
  //           map.watchHours += totalTimeSpend;
  //         } else if (timeDelay !== 0) {
  //           map.maxDates = [contDate];
  //           map.watchHours = 0
  //         }
  //         map.watchHours += totalTimeSpend;
  //         if (map.maxDates.length >= 10 && map.watchHours >= 36000) {
  //           participantContentMap[profileId].type = 'superfan';
  //         } else if (type !== 'superfan' && map.maxDates.length >= 5 && map.watchHours >= 18000) {
  //           participantContentMap[profileId].type = 'risingfan';
  //         }
  //         participantContentMap[profileId].days = Math.max(participantContentMap[profileId].days, map.maxDates.length)
  //         participantTypeMap.set(profileId, map);
  //       }

  //       totalWatchHours += totalTimeSpend
  //       participantContentMap[profileId].totalWatchHours += totalTimeSpend;
  //       participantContentMap[profileId].contents[dateKey].push(content);
  //       participantContentMap[profileId]['watchedContentsMap'][contentId].watchHours += totalTimeSpend;
  //       participantContentMap[profileId].contentid.add(contentId)
  //       participantContentMap[profileId].sessions += 1

  //       if (![null, undefined, ''].includes(playlistId)) {
  //         participantContentMap[profileId].playlist.add(playlistId);
  //       }

  //       if (contentType !== 'Unknown') {
  //         participantContentMap[profileId].activePlatforms.add(contentType);
  //       }

  //       if (status === "complete") {
  //         participantContentMap[profileId].completedContents.add(contentId)
  //         participantContentMap[profileId]['watchedContentsMap'][contentId].completion += 1;
  //         contentTypeMap[contentType].completed.add(profileId);

  //         if (contentMap[contentId].completedProfiles.has(profileId)) {
  //           contentMap[contentId].rewatchedProfiles.add(profileId);
  //         } else {
  //           contentMap[contentId].completedProfiles.add(profileId);
  //         }
  //       }

  //       contentMap[contentId].profileid.add(profileId);
  //       contentMap[contentId].totalWatchHours += totalTimeSpend;

  //       contentTypeMap[contentType].profileid.add(profileId);
  //       contentTypeMap[contentType].watchHours += totalTimeSpend;

  //     })

  //     // Array.from(participantTypeMap.keys()).forEach((p) => {
  //     //   if (this.participantMetaDataMap[p]?.name === 'Sumit Malik') {
  //     //     console.log(participantTypeMap.get(p))
  //     //   }
  //     // })
  //     this.totalUniqueUsers = totalUniqueUsers
  //     this.totalUniueContents = totalUniueContents;
  //     this.totalWatchHours = totalWatchHours;
  //     this.totalSuperFans = totalSuperFans;
  //     this.totalRisingFans = totalRisingFans;

  //     this.participantContentMap = participantContentMap;
  //     this.contentMap = contentMap;
  //     this.contentTypeMap = contentTypeMap;

  //     const superFans: ParticipantContentMapInterface[] = [];
  //     const raisingFans: ParticipantContentMapInterface[] = [];
  //     const fans: ParticipantContentMapInterface[] = [];

  //     Object.values(participantContentMap).forEach((p) => {
  //       const data = { ...p };
  //       if (data.type === 'superfan') {
  //         superFans.push(data);
  //       } else if (data.type === 'risingfan') {
  //         raisingFans.push(data)
  //       } else {
  //         fans.push(data);
  //       }
  //     }
  //     );
  //     superFans.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
  //     raisingFans.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
  //     fans.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
  //     const dataSource = [...superFans, ...raisingFans, ...fans];
  //     // dataSource.sort((a, b) => participantRankType[a.type] - participantRankType[b.type]);
  //     this.participantTableDataSource.data = dataSource.map((p, index) => ({ ...p, rank: index + 1 }));

  //     const contentDataSoruce = Object.values(contentMap)
  //     contentDataSoruce.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
  //     this.contentTableDataSource.data = contentDataSoruce.map((c, index) => ({ ...c, rank: index + 1 }));

  //     this.ngAfterViewInit();
  //     this.updateDaliyActiveUsersChart();
  //     this.updateDailyWatchHoursChart();
  //     this.loadingStatus.contentanalytics = false;
  //     this.checkIsAllLoaded()
  //   })
  // }

  // async fetchParticipantMetaData() {
  //   const participantMetaDataMap: { [key: string]: any } = {};
  //   const snap = await getDocs(collection(this.firestore, 'participant metadata'))
  //   snap.docs.forEach((p) => {
  //     const data = p.data();
  //     participantMetaDataMap[data['profileid']] = data;
  //   })
  //   this.participantMetaDataMap = participantMetaDataMap;
  // }

  // function to fetch and process content analytics logs
  async fetchContentAnalytics() {
    this.isLoading = true;
    this.loadingStatus.contentanalytics = true;
    this.isInitialLoaded = false;
    if (this.analyticsSubscribe) {
      this.analyticsSubscribe();
    }

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

    this.participantContentMap = {};
    this.contentMap = {};
    this.contentTypeMap = {};

    this.analyticsSubscribe = onSnapshot(q, (contentSnap) => {

      if (contentSnap.metadata.fromCache) {
        return
      }
      const participantContentMap: { [key: string]: ParticipantContentMapInterface } = Object.assign({}, this.participantContentMap);
      const contentMap: { [key: string]: ContentMapInterface } = Object.assign({}, this.contentMap);
      const contentTypeMap: { [key: string]: ContentType } = Object.assign({}, this.contentTypeMap);

      let totalUniqueUsers = this.totalUniqueUsers;
      let totalUniueContents = this.totalUniueContents;
      let totalWatchHours = this.totalWatchHours;

      contentSnap.docChanges().forEach((contentDoc) => {
        const content = contentDoc.doc.data();
        if (['added', 'modified'].includes(contentDoc.type)) {
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
            const log = new Date(logDate);
            log.setHours(0, 0, 0, 0);
            participantContentMap[profileId] = {
              profileid: profileId,
              totalWatchHours: 0,
              activePlatforms: new Set(),
              watchedContentsMap: {},
              playlist: new Set(),
              recommendedPlaylist: new Set(),
              completedPlayList: new Set(),
              sessions: 0,
              completedContents: new Set(),
              days: 1,
              maxWatch: totalTimeSpend,
              maxContWatchDates: [log],
              contentid: new Set(),
              live: false,
              type: 'guest',
              contents: {},
              lastSeen: logDate
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


          const participant: ParticipantContentMapInterface = participantContentMap[profileId];
          const contentData: ContentMapInterface = contentMap[contentId];
          const contentTypeData: ContentType = contentTypeMap[contentType];

          // set participant type
          const contDate = new Date(logDate);
          contDate.setHours(0, 0, 0, 0);
          const timeDelay = participant.maxContWatchDates.at(-1).getTime() - contDate.getTime();
          if (timeDelay / 86400000 === 1) {
            participant.maxContWatchDates.push(contDate);
            participant.maxWatch += totalTimeSpend;
          } else if (timeDelay !== 0) {
            participant.maxContWatchDates = [contDate];
            participant.maxWatch = 0
          }
          participant.maxWatch += totalTimeSpend;
          if (participant.maxContWatchDates.length >= 10 && participant.maxWatch >= 36000) {
            participant.type = 'superfan';
          } else if (participant.type !== 'superfan' && participant.maxContWatchDates.length >= 5 && participant.maxWatch >= 18000) {
            participant.type = 'risingfan';
          }
          participant.days = Math.max(participant.days, participant.maxContWatchDates.length)

          // sets participant data
          totalWatchHours += totalTimeSpend
          participant.totalWatchHours += totalTimeSpend;
          participant.contents[dateKey].push(content);
          participant['watchedContentsMap'][contentId].watchHours += totalTimeSpend;
          participant.contentid.add(contentId);
          participant.sessions += 1;
          participant.live = this.isInitialLoaded;
          if (this.isInitialLoaded) {
            participant.lastSeen = logDate;
          }

          if (![null, undefined, ''].includes(playlistId)) {
            participant.playlist.add(playlistId);
          }

          if (contentType !== 'Unknown') {
            participant.activePlatforms.add(contentType);
          }

          if (status === "complete") {
            participant.completedContents.add(contentId)
            participant['watchedContentsMap'][contentId].completion += 1;
            contentTypeData.completed.add(profileId);

            if (contentData.completedProfiles.has(profileId)) {
              contentData.rewatchedProfiles.add(profileId);
            } else {
              contentData.completedProfiles.add(profileId);
            }
          }

          contentData.profileid.add(profileId);
          contentData.totalWatchHours += totalTimeSpend;

          contentTypeData.profileid.add(profileId);
          contentTypeData.watchHours += totalTimeSpend;

          participantContentMap[profileId] = participant;
          contentMap[contentId] = contentData;
          contentTypeMap[contentType] = contentTypeData;

        }
      })

      const superFans: ParticipantContentMapInterface[] = [];
      const raisingFans: ParticipantContentMapInterface[] = [];
      const guest: ParticipantContentMapInterface[] = [];
      
      const participantData = Object.values(participantContentMap);
      participantData.sort((a, b) => b.totalWatchHours - a.totalWatchHours);

      participantData.forEach((p) => {
        const data = { ...p };
        if (data.type === 'superfan') {
          superFans.push(data);
        } else if (data.type === 'risingfan') {
          raisingFans.push(data)
        } else {
          guest.push(data);
        }
      }
      );

      const liveParticipants: ParticipantContentMapInterface[] = [];
      const dataSource = [...superFans, ...raisingFans, ...guest].map((p, index) => ({ ...p, rank: index + 1 })).filter((p) => {
        if (p.live) {
          liveParticipants.push(p);
        }
        return !p.live;
      });

      liveParticipants.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
      this.participantTableDataSource.data = [...liveParticipants, ...dataSource];

      const contentDataSoruce = Object.values(contentMap)
      contentDataSoruce.sort((a, b) => b.totalWatchHours - a.totalWatchHours);
      this.contentTableDataSource.data = contentDataSoruce.map((c, index) => ({ ...c, rank: index + 1 }));

      this.totalUniqueUsers = totalUniqueUsers
      this.totalUniueContents = totalUniueContents;
      this.totalWatchHours = totalWatchHours;
      this.totalSuperFans = superFans.length;
      this.totalRisingFans = raisingFans.length;

      this.participantContentMap = participantContentMap;
      this.contentMap = contentMap;
      this.contentTypeMap = contentTypeMap;

      this.ngAfterViewInit();
      this.updateDaliyActiveUsersChart();
      this.updateDailyWatchHoursChart();
      this.loadingStatus.contentanalytics = false;
      this.isInitialLoaded = true;
      this.checkIsAllLoaded()
    })
  }

  // function to fetch participant data
  async fetchParticipantMetaData() {
    const participantMetaDataMap: { [key: string]: any } = {};
    const snap = await getDocs(collection(this.firestore, 'participant metadata'))
    snap.docs.forEach((p) => {
      const data = p.data();
      participantMetaDataMap[data['profileid']] = data;
    })
    this.participantMetaDataMap = participantMetaDataMap;
  }

  async fetchjourney() {
    const snap = await getDocs(collection(this.firestore, 'journey'));
    snap.docs.forEach((doc) => {
      this.journeyMap[doc.id] = doc.data(); 
    });
  }
 
  getJourneyDetails(profileId: string): { active: string; last: string; status: string; financeStatus:string } {
  const data = this.participantMetaDataMap[profileId];

    if (!data) {
      return {
        active: 'No Journey',
        last: 'No Journey',
        status: 'No Status',
        financeStatus :''
      };
    }

      const activeId = data.activejourney;
      const lastId = data.lastcompletedjourney;

      let active = '';
      let last = '';

      if (activeId && this.journeyMap[activeId]) {
        active = this.journeyMap[activeId].journey;
        last = '';
      } else if(lastId && this.journeyMap[lastId]) {
        active = '';
        last = this.journeyMap[lastId].journey;
      }

      const status = data.customerstatus || 'No Status';
      const financeStatus = data.financialstatus || '';

  return { active, last, status , financeStatus};
}
 
  
  // function to fetch participant data

  // function to fetch and process playlist data
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

    collectionData(q)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.log(err);
          return of([]);
        }),
        finalize(() => { this.loadingStatus.recommendedMixPlaylist = false }))
      .subscribe((snap) => {

        const playListMixMap: { [key: string]: Partial<PlayListMix> } = {};
        snap.forEach((mix) => {
          const type = mix['type'] || 'Unknown';
          const profileId = mix['profileid'] || 'Unknown';
          const recommandedPlaylistId = mix['bufferdocref']?.id || 'Unknown';
          const title = mix['title'] || 'Unknown'
          const status = mix['status'];
          const completedContents = mix['completedcontent'] || [];
          const mixPlayList = (mix['list'] || []).map((d: DocumentReference) => d.id)

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
            playListMixMap[recommandedPlaylistId][profileId] = {};
            if (status === 'completed') {
              playListMixMap[recommandedPlaylistId].completedProfiles.add(profileId);
            }
          }

          const playlist = playListMixMap[recommandedPlaylistId];
          const participant = playListMixMap[recommandedPlaylistId][profileId];

          participant[type] = mix;

          if (!playlist.contentTypes.has(type)) {
            playlist.contentTypes.add(type);
            playlist[type] = mix['list'] || [];
          }

          if (!playlist.profileid.has(profileId)) {
            playlist.profileid.add(profileId);
            playlist.notStartedProfiles.add(profileId);
          }

          if ((status === 'completed') && playlist.completedProfiles.has(profileId)) {

            playlist.notStartedProfiles.delete(profileId);
            playlist.completedProfiles.add(profileId);
            this.participantContentMap[profileId]?.completedPlayList.add(recommandedPlaylistId)

          } else if (playListMixMap[recommandedPlaylistId].completedProfiles.has(profileId) || completedContents.length > 0) {

            playlist?.completedProfiles.delete(profileId);
            this.participantContentMap[profileId]?.completedPlayList.delete(profileId);
            playlist?.notStartedProfiles.delete(profileId);
            playlist?.ongoingProfiles.add(profileId);

          } else if (playlist.notStartedProfiles.has(profileId)) {
            const matches = mixPlayList.some((cId: string) => (this.participantContentMap[profileId]?.playlist.has(cId) || this.participantContentMap[profileId]?.contentid.has(cId)));
            if (matches) {
              playlist.notStartedProfiles.delete(profileId);
              playlist.startedProfiles.add(profileId);
            }
          }

          if (!this.participantContentMap[profileId]?.recommendedPlaylist.has(recommandedPlaylistId)) {
            this.participantContentMap[profileId]?.recommendedPlaylist.add(recommandedPlaylistId)
          }

        })

        this.playListMixMap = playListMixMap;
        this.playListTableDateSource.data = Object.values(playListMixMap)
        this.loadingStatus.recommendedMixPlaylist = false;
        this.ngAfterViewInit()
        this.checkIsAllLoaded();
      });
  }

  // function to fetch dashboard data based on date range
  applyDateRangeFilter() {
    const start = this.startDate.value;
    const end = this.endDate.value;
    this.totalDays = this.getTotalDays(start,end);

    this.ngOnDestroy();
    this.fetchContentAnalytics();
    this.fetchRecommendedMixPlayList();
  }

  // function to get total watch time for playlist
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

  // function to get participant who not watching no content during date range
  getAtRiskParticipants(): string[] {
    return Object.keys(this.participantMetaDataMap).filter((pId) => !Object.hasOwn(this.participantContentMap, pId) && this.participantMetaDataMap[pId]?.customerstatus === 'active');
  }

  // function to get participant only wwatch solar voice
  getProfilesOnlyWatchSolarVoice(): string[] {
    return Object.values(this.participantContentMap).filter((p) => p.activePlatforms.size === 1 && p.activePlatforms.has('solarvoice')).map((d) => d.profileid)
  }

  // function to get participant only wwatch eiflix
  getProfilesOnlyWatchEifilx(): string[] {
    return Object.values(this.participantContentMap).filter((p) => p.activePlatforms.size === 1 && p.activePlatforms.has('eiflixcontent')).map((d) => d.profileid)
  }

  // function to get active platforms for participant
  getParticipantActivePlatforms(p: ParticipantContentMapInterface) {
    const platforms = p.activePlatforms;
    return [...platforms.values()]
  }

  // function to get loading progress
  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStatus).filter(state => state === true).length;
    const total = Object.keys(this.loadingStatus).length;
    return (loaded / total) * 100;
  }

  // function to convert seconds to hours
  convertToHours(seconds: number): number {
    return seconds / 3600
  }

  convertHoursMins(seconds: number){
    const hours = Math.floor(seconds / 3600);
    const remainingSecondsAfterHours = seconds % 3600;

    const minutes= Math.floor(remainingSecondsAfterHours / 60);
    const remainingSeconds = remainingSecondsAfterHours % 60;
    
    return `${hours} Hours ${minutes} Mins ${remainingSeconds} Secs`  
  }

  // function to open side panel for cards
  openDialog(type: string) {
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

    this.openDialogBox(title, data)
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

    this.openDialogBox(title, data)
  }

  // function to open side panel for playlist table
  openPlayListPanelView(playlist: PlayListMix, type: string) {
    let data: string[] = Array.from(playlist[type]?.values() || []);
    let title = `Playlist ${playlist.title}`;

    this.openDialogBox(title, data);
  }

  // function to open side panel for content table
  openContentPanelView(content: ContentMapInterface, type: string) {
    let data: string[] = Array.from(content[type]?.values() || []);
    let title = `Content ${content.contentname}`;

    this.openDialogBox(title, data);
  }

  // function to handle export in side panel
  exportdialogData() {
    if (this.dialogProfiles.length === 0) {
    alert('No data');
    return; 
  }
    const exportData = this.dialogProfiles.map((p) => ({
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
  openDialogBox(title: string, profileid: string[]) {
  this.dialogOpen = true;
  this.dialogTitle = title;
  this.dialogProfiles = profileid.map((p) => this.participantMetaDataMap[p]);
}

  // function to close panel
  closedialog() {
    this.dialogOpen = false;
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

  // filter predicate function for participant table
  filterParticipants = (p: ParticipantContentMapInterface, filter: string) => {
    const name = (this.participantMetaDataMap[p.profileid]?.name || '')?.toLocaleLowerCase()?.trim();
    const journey = (this.participantMetaDataMap[p.profileid]?.activejourney || '')?.toLocaleLowerCase()?.trim();

    if (!name) {
    return false;
  }
    return name.includes(filter?.toLocaleLowerCase()?.trim())
        
  };

  // filter function for participant table
  filterParticipantTable(search: string) {
    this.participantTableDataSource.filter = search;
  }

  // filter predicate function for playlist table
  filterPredicatePlayList = (p: PlayListMix, filter: string) => {
    const title = (p.title || '')?.toLocaleLowerCase();
    if (!title) {
      return false
    }
    return title.includes(filter?.toLocaleLowerCase()?.trim())
  };

  // filter function for playlist table
  filterPlayListTable(search: string) {
    this.playListTableDateSource.filter = search;
  }

  // filter predicate function for content table
  filterPredicateContent = (p: ContentMapInterface, filter: string) => {
    const title = (p.contentname || '')?.toLocaleLowerCase();
    if (!title) {
      return false
    }
    return title.includes(filter?.toLocaleLowerCase()?.trim())
  };

  // filter function for content table
  filterContentTable(search: string) {
    this.contentTableDataSource.filter = search;
  }

  // custom sorting function to paricipant table
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

  // custom sorting function for content table
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

  // custom sorting function for playlist table
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

  // function to toggle date picker
  togglePicker() {
    this.pickerOpen = !this.pickerOpen;
  }

  // function to clear date in date range picker
  clearDates(event: Event) {
    event.stopPropagation();
    this.startDate.reset();
    this.endDate.reset();
  }

  getTotalDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return diffDays;
  }

  profiledetails(profileid) {
    if (window.location.port.includes('4200')) {
      window.open(`http://localhost:4200/userprofile/${profileid}`, '_blank');
    } else if (environment.firebase.projectId == 'starlabs-test') {
      window.open(`https://starlabs-test-19.web.app/userprofile/${profileid}`, '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open(`https://breakthroughs.app/userprofile/${profileid}`, '_blank');
    }
  }

}


