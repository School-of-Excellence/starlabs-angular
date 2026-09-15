import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, collectionData } from '@angular/fire/firestore';

// static lookup tables for the mocked layers
const MODES: any = {
  earlyprep:   { label: 'Early Preparation', color: '#8A8F98' },
  prep:        { label: 'Preparation',       color: '#0076C8' },
  event:       { label: 'Event',             color: '#6D029A' },
  integration: { label: 'Integration',       color: '#BE1484' },
  performance: { label: 'Performance',       color: '#16A34A' },
};
const MODE_ORDER = ['earlyprep', 'prep', 'event', 'integration', 'performance'];

const VIA: any = {
  widget:   { label: 'Mode Widget',   color: '#6D029A' },
  rec:      { label: 'Recommendation', color: '#BE1484' },
  workshop: { label: 'Workshop',      color: '#0076C8' },
  forms:    { label: 'Forms',         color: '#B45309' },
  bigact:   { label: 'B!G Activity',  color: '#16A34A' },
  own:      { label: 'Own discovery', color: '#6B7280' },
};
const VIA_ORDER = ['widget', 'rec', 'workshop', 'forms', 'bigact', 'own'];

@Component({
  selector: 'app-content-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './content-analytics-v2.component.html',
  styleUrl: './content-analytics-v2.component.css',
})
export class ContentAnalyticsv2Component implements OnInit {

  // Object declarations
  public contentData = {
    activityLog: [] as any[],
    filteredLog: [] as any[],
    pagedLog: [] as any[],
    contentList: [] as any[],
    participantList: [] as any[],
    uniqueViewers: 0,
    totalWatchTime: 0,
    totalWatchTimeText: '',
    avgPerViewer: 0,
    avgPerViewerText: '',
    completionRate: 0,
    totalCompleted: 0,
    totalBounced: 0,
    totalViews: 0,
    days: 7
  }

  // rollups for the mocked tabs
  modeRollup: any[] = [];
  viaRollup: any[] = [];
  tierRollup: any[] = [];

  names: any = {};
  tierOf: any = {}; // profileid -> tier number, assigned once per participant

  activeTab = 'log';
  loading = false;

  startDate = '';
  endDate = '';
  activeDays = 7;

  searchText = '';
  selectedSource = '';
  selectedPlatform = '';
  selectedOutcome = '';

  sortField = 'logdate';
  sortDir = 'desc';
  showCount = 25;

  constructor(
    private firestore: Firestore
  ) {}

  ngOnInit(): void {
    // default to last 7 days
    let end = new Date();
    let start = new Date();
    start.setDate(start.getDate() - 6);
    this.startDate = start.toISOString().slice(0, 10);
    this.endDate = end.toISOString().slice(0, 10);

    this.fetchnames();
  }

  // get the participant names first so we can map them onto the log
  fetchnames() {
    const q = query(collection(this.firestore, 'participant metadata'));
    collectionData(q).subscribe((profiles) => {
      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        this.names[p['profileid']] = p['name'];
      }
      this.fetchdata();
    });
  }

  // quick string hash so the mocked mode/via/tier assignment is at least
  hashcode(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h = h & h;
    }
    return Math.abs(h);
  }

  // Function to fetch content analytics and compute the data by log, participant, content
  fetchdata() {
    this.loading = true;
    const q = query(collection(this.firestore, 'content analytics'));
    let logdata = collectionData(q);

    logdata.subscribe((content) => {
      this.contentData.activityLog = [];

      for (let i = 0; i < content.length; i++) {
        const element = content[i];

        // work out how far they got into the video
        let parts = element['lastwatchedtime'] ? element['lastwatchedtime'].split(':') : ['0', '0', '0'];
        let dropped = (+parts[0] * 3600) + (+parts[1] * 60) + parseFloat(parts[2]);
        let reach = Math.min(1, dropped / element['totalruntime']);

        let statusCode = 'progress';
        let statusLabel = Math.round(reach * 100) + '%';
        if (reach >= 0.9) {
          statusCode = 'completed';
          statusLabel = 'Completed';
        } else if (element['totaltimespend'] < 30 || reach < 0.05) {
          statusCode = 'bounced';
          statusLabel = 'Bounced';
        }

        // source label + color, just hardcoding these for now
        let sourceLabel = element['from'];
        let sourceColor = '#6B7280';
        if (element['from'] == 'eiflixcontent') { sourceLabel = 'EiFLIX Content'; sourceColor = '#0076C8'; }
        else if (element['from'] == 'eiflixworkshop') { sourceLabel = 'EiFLIX Workshop'; sourceColor = '#6D029A'; }
        else if (element['from'] == 'solarvoice') { sourceLabel = 'Solar Voice'; sourceColor = '#16A34A'; }
        else if (element['from'] == 'generalcontent') { sourceLabel = 'General Content'; sourceColor = '#6B7280'; }

        let profileid = element['profileid'];

        // mocked mode + via, hashed off real fields so it's at least stable per row
        let modeKey = MODE_ORDER[this.hashcode(profileid + element['videoname']) % MODE_ORDER.length];
        let viaKey = VIA_ORDER[this.hashcode(element['videoname'] + profileid + 'via') % VIA_ORDER.length];

        // mocked tier, stable per participant
        if (this.tierOf[profileid] === undefined) {
          this.tierOf[profileid] = (this.hashcode(profileid + 'tier') % 10) + 1;
        }

        this.contentData.activityLog.push({
          profileid: profileid,
          participantName: this.names[profileid] || 'Unknown',
          videoname: element['videoname'],
          platform_name: element['platform_name'],
          from: element['from'],
          totalruntime: element['totalruntime'],
          totaltimespend: element['totaltimespend'],
          dropped: dropped,
          logdate: element['logdate'].toDate ? element['logdate'].toDate() : element['logdate'],
          statusCode: statusCode,
          statusLabel: statusLabel,
          sourceLabel: sourceLabel,
          sourceColor: sourceColor,
          durationText: this.fmttime(element['totalruntime']),
          droppedText: this.fmttime(dropped),
          spentText: this.fmttime(element['totaltimespend']),
          modeKey: modeKey,
          viaKey: viaKey,
          tier: this.tierOf[profileid]
        });
      }

      this.contentData.totalViews = this.contentData.activityLog.length;
      this.filterdata();
      this.loading = false;
    })
  }

  // sec to readable text, long=true gives hours/mins instead of mins/secs
  fmttime(sec: number, long?: boolean) {
    if (long) {
      let h = Math.floor(sec / 3600);
      let m = Math.floor((sec % 3600) / 60);
      if (h > 0) return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
      return m + 'm';
    }
    let m = Math.floor(sec / 60);
    let s = Math.round(sec % 60);
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }

  // applies date range + search + dropdown filters, then recalculates all the summary numbers
  filterdata() {
    let from = new Date(this.startDate);
    let to = new Date(this.endDate);
    to.setHours(23, 59, 59);

    this.contentData.filteredLog = [];

    for (let i = 0; i < this.contentData.activityLog.length; i++) {
      let row = this.contentData.activityLog[i];
      let ok = true;

      if (row.logdate < from || row.logdate > to) ok = false;

      if (this.searchText) {
        let search = this.searchText.toLowerCase();
        if (row.participantName.toLowerCase().indexOf(search) == -1 && row.videoname.toLowerCase().indexOf(search) == -1) ok = false;
      }

      if (this.selectedSource && row.from != this.selectedSource) ok = false;
      if (this.selectedPlatform && row.platform_name != this.selectedPlatform) ok = false;
      if (this.selectedOutcome && row.statusCode != this.selectedOutcome) ok = false;

      if (ok) this.contentData.filteredLog.push(row);
    }

    // now go through filtered rows once and build the viewer set, content breakdown, participant breakdown
    let viewers = new Set();
    let watchTime = 0;
    let completed = 0;
    let bounced = 0;
    let contentMap: any = {};
    let personMap: any = {};
    let modeMap: any = {};
    let viaMap: any = {};

    for (let i = 0; i < this.contentData.filteredLog.length; i++) {
      let row = this.contentData.filteredLog[i];
      viewers.add(row.profileid);
      watchTime += row.totaltimespend;
      if (row.statusCode == 'completed') completed += 1;
      if (row.statusCode == 'bounced') bounced += 1;

      if (!contentMap[row.videoname]) {
        contentMap[row.videoname] = {
          videoname: row.videoname,
          totalruntime: row.totalruntime,
          views: 0,
          viewers: new Set(),
          completed: 0,
          bounced: 0,
          watch: 0
        };
      }
      contentMap[row.videoname].views += 1;
      contentMap[row.videoname].viewers.add(row.profileid);
      contentMap[row.videoname].watch += row.totaltimespend;
      if (row.statusCode == 'completed') contentMap[row.videoname].completed += 1;
      if (row.statusCode == 'bounced') contentMap[row.videoname].bounced += 1;

      if (!personMap[row.profileid]) {
        personMap[row.profileid] = {
          profileid: row.profileid,
          participantName: row.participantName,
          views: 0,
          videos: new Set(),
          watch: 0,
          last: row.logdate,
          tier: row.tier
        };
      }
      personMap[row.profileid].views += 1;
      personMap[row.profileid].videos.add(row.videoname);
      personMap[row.profileid].watch += row.totaltimespend;
      if (row.logdate > personMap[row.profileid].last) personMap[row.profileid].last = row.logdate;

      // mocked mode rollup
      if (!modeMap[row.modeKey]) modeMap[row.modeKey] = { views: 0, people: new Set(), watch: 0, completed: 0 };
      modeMap[row.modeKey].views += 1;
      modeMap[row.modeKey].people.add(row.profileid);
      modeMap[row.modeKey].watch += row.totaltimespend;
      if (row.statusCode == 'completed') modeMap[row.modeKey].completed += 1;

      // mocked via rollup
      if (!viaMap[row.viaKey]) viaMap[row.viaKey] = { views: 0, people: new Set(), watch: 0, completed: 0 };
      viaMap[row.viaKey].views += 1;
      viaMap[row.viaKey].people.add(row.profileid);
      viaMap[row.viaKey].watch += row.totaltimespend;
      if (row.statusCode == 'completed') viaMap[row.viaKey].completed += 1;
    }

    this.contentData.uniqueViewers = viewers.size;
    this.contentData.totalWatchTime = watchTime;
    this.contentData.totalWatchTimeText = this.fmttime(watchTime, true);
    this.contentData.avgPerViewer = viewers.size ? watchTime / viewers.size : 0;
    this.contentData.avgPerViewerText = this.fmttime(this.contentData.avgPerViewer);
    this.contentData.totalCompleted = completed;
    this.contentData.totalBounced = bounced;
    this.contentData.completionRate = this.contentData.filteredLog.length ? Math.round((completed / this.contentData.filteredLog.length) * 100) : 0;
    this.contentData.days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;

    // turn the maps into arrays for the template
    this.contentData.contentList = [];
    for (let key in contentMap) {
      let c = contentMap[key];
      this.contentData.contentList.push({
        videoname: c.videoname,
        totalruntime: c.totalruntime,
        durationText: this.fmttime(c.totalruntime),
        views: c.views,
        viewers: c.viewers.size,
        completed: c.completed,
        bounced: c.bounced,
        watch: c.watch,
        watchText: this.fmttime(c.watch, true)
      });
    }

    this.contentData.participantList = [];
    for (let key in personMap) {
      let p = personMap[key];
      this.contentData.participantList.push({
        profileid: p.profileid,
        participantName: p.participantName,
        unique: p.videos.size,
        views: p.views,
        watch: p.watch,
        watchText: this.fmttime(p.watch, true),
        last: p.last
      });
    }

    // modes to be worked on
    this.modeRollup = [];
    for (let i = 0; i < MODE_ORDER.length; i++) {
      let key = MODE_ORDER[i];
      let m = modeMap[key] || { views: 0, people: new Set(), watch: 0, completed: 0 };
      this.modeRollup.push({
        key: key,
        label: MODES[key].label,
        color: MODES[key].color,
        views: m.views,
        people: m.people.size,
        watchText: this.fmttime(m.watch, true),
        compPct: m.views ? Math.round((m.completed / m.views) * 100) : 0
      });
    }

    // via / recommendation table, sorted by views so the biggest route sits on top
    this.viaRollup = [];
    for (let i = 0; i < VIA_ORDER.length; i++) {
      let key = VIA_ORDER[i];
      let v = viaMap[key] || { views: 0, people: new Set(), watch: 0, completed: 0 };
      this.viaRollup.push({
        key: key,
        label: VIA[key].label,
        color: VIA[key].color,
        views: v.views,
        people: v.people.size,
        watchText: this.fmttime(v.watch, true),
        compPct: v.views ? Math.round((v.completed / v.views) * 100) : 0
      });
    }
    this.viaRollup.sort((a, b) => b.views - a.views);

    // tier table, one row per participant with their mocked tier attached
    this.tierRollup = [];
    for (let key in personMap) {
      let p = personMap[key];
      this.tierRollup.push({
        profileid: p.profileid,
        participantName: p.participantName,
        tier: p.tier,
        views: p.views,
        watch: p.watch,
        watchText: this.fmttime(p.watch, true)
      });
    }
    this.tierRollup.sort((a, b) => a.tier - b.tier);

    this.showCount = 25;
    this.sortdata(this.sortField);
  }

  resetfilters() {
    this.searchText = '';
    this.selectedSource = '';
    this.selectedPlatform = '';
    this.selectedOutcome = '';
    this.filterdata();
  }

  // sorts whichever list matches the active tab, click same field again to flip direction
  sortdata(field: string) {
    if (this.sortField == field) this.sortDir = this.sortDir == 'asc' ? 'desc' : 'asc';
    else { this.sortField = field; this.sortDir = 'desc'; }

    let dir = this.sortDir == 'asc' ? 1 : -1;
    let list = this.activeTab == 'log' ? this.contentData.filteredLog
             : this.activeTab == 'content' ? this.contentData.contentList
             : this.activeTab == 'participant' ? this.contentData.participantList
             : null;

    if (list) {
      list.sort((a: any, b: any) => {
        if (a[field] < b[field]) return -1 * dir;
        if (a[field] > b[field]) return 1 * dir;
        return 0;
      });
    }

    // reset paging whenever we sort so page 1 always matches the new order
    this.contentData.pagedLog = this.contentData.filteredLog.slice(0, this.showCount);
  }

  changeperiod(days: number) {
    this.activeDays = days;
    let end = new Date();
    let start = new Date();
    start.setDate(start.getDate() - (days - 1));
    this.startDate = start.toISOString().slice(0, 10);
    this.endDate = end.toISOString().slice(0, 10);
    this.filterdata();
  }

  daterangechange() {
    this.activeDays = 0;
    this.filterdata();
  }

  settab(tab: string) {
    this.activeTab = tab;
    this.sortField = tab == 'log' ? 'logdate' : tab == 'participant' ? 'watch' : 'views';
    this.sortDir = 'desc';
    this.sortdata(this.sortField);
  }

  loadmore() {
    this.showCount += 25;
    this.contentData.pagedLog = this.contentData.filteredLog.slice(0, this.showCount);
  }

  exportcsv() {
    let csv = 'When,Participant,Content,Source,Overall Duration,Dropped at,Spend time,Platform,Outcome\n';
    for (let i = 0; i < this.contentData.filteredLog.length; i++) {
      let row = this.contentData.filteredLog[i];
      csv += row.logdate + ',' + row.participantName + ',' + row.videoname + ',' + row.sourceLabel + ',' +
        row.totalruntime + ',' + row.dropped + ',' + row.totaltimespend + ',' + row.platform_name + ',' +
        row.statusLabel + '\n';
    }
    let blob = new Blob([csv], { type: 'text/csv' });
    let url = URL.createObjectURL(blob);
    let link = document.createElement('a');
    link.href = url;
    link.download = 'activity-log.csv';
    link.click();
  }

}
