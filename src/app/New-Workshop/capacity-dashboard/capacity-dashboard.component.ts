import { Component, inject, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, Firestore, getDocs, orderBy, query, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSidenavModule, MatDrawer } from '@angular/material/sidenav';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

interface LevelCount { fasttrack: number; regular: number; total: number; }
interface ParticipantInfo { profileId: string; name: string; count: number; atcModels?: string[]; }

@Component({
  selector: 'app-capacity-dashboard',
  imports: [MatTableModule, MatPaginatorModule, MatSortModule, MatButtonModule, MatIconModule, CommonModule,
    ReactiveFormsModule, FormsModule, MatInputModule, MatSelectModule, NgxMatSelectSearchModule,
    MatSidenavModule, MatCardModule, MatListModule, MatDividerModule, MatMenuModule, ProfilePictureComponent],
  templateUrl: './capacity-dashboard.component.html',
  styleUrl: './capacity-dashboard.component.css'
})
export class CapacityDashboardComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  displayedColumns = ['participant', 'atcmodel', 'currentlevel', 'specialactivity', 'boosteractivity', 'fasttrack', 'regular', 'warmup'];
  dataSource = new MatTableDataSource();
  maplevels = {};
  mapLevelToCategory = {};
  mapparticipant = {};
  mapBigActivity = {};
  maplevel = {};
  journeydata = {};
  participantaggregateList: any[] = [];
  atcModelList: string[] = [];
  categoryList: string[] = [];
  levelList: any[] = [];
  profilelist: any[] = [];
  filteredProfilelist: any[] = [];
  bigjourney: string[] = [];
  beforeDiagnosticLevelList: string[] = [];
  afterDiagnosticLevelList: string[] = [];
  displayCategories: string[] = [];
  participantActiveData = {};
  participantNonActiveData = {};
  activeProfileIds = new Set<string>();
  nonActiveProfileIds = new Set<string>();
  notStartedParticipants = new Set<string>();
  categoryLevelCounts: Record<string, Record<string, LevelCount>> = {};
  allLevelsPerCategory: Record<string, { levelName: string; sequence: number }[]> = {};
  categoryTotals = {};
  categoryUniqueParticipants = {};
  categorySequenceMap = {};
  participantsByFilter = {};
  mapActivityPerParticipant = {};
  participantAtcModels: Record<string, Set<string>> = {};

  filteredAtcModelLevelup = {};
  filteredBeforeDiagnosticCounts = {};
  filteredAfterDiagnosticCounts = {};
  filteredAtcModelUniqueParticipants = {};
  filteredBeforeDiagnosticUniqueParticipants = {};
  filteredAfterDiagnosticUniqueParticipants = {};
  filteredTotalUniqueParticipants = new Set<string>();
  filteredBeforeDiagnosticTotalUnique = new Set<string>();
  filteredAfterDiagnosticTotalUnique = new Set<string>();
  filteredNotStartedParticipants = new Set<string>();
  filteredTotalRecords = 0;
  filteredBeforeDiagnosticTotal = 0;
  filteredAfterDiagnosticTotal = 0;
  
  journeySummary: Record<string, { active: number; nonactive: number; total: number }> = {};
  totalActivityCount = 0;
  filterText = '';
  drawerTitle = '';
  drawerParticipants: ParticipantInfo[] = [];
  
  filter = { participant: [] as string[], atcmodel: [] as string[], category: [] as string[], status: 'total' };
  
  private participantsLoaded = false;
  private aggregateDataLoaded = false;
  private firestore = inject(Firestore);
  private destroy$ = new Subject<void>();

  constructor(public formbuilder: FormBuilder, public guard: AuthguardService, public dialog: MatDialog, public router: Router) {
    this.initData();
  }

  async initData() {
    this.loadParticipants();
    collectionData(query(collection(this.firestore, "big aggregate level"), orderBy('atcmodel')))
      .pipe(takeUntil(this.destroy$)).subscribe(snap => {
        this.participantaggregateList = snap;
        this.aggregateDataLoaded = true;
        this.tryInitializeData();
      });

    collectionData(query(collection(this.firestore, "atcmodel level config"), orderBy('level')))
      .pipe(takeUntil(this.destroy$)).subscribe(doc => {
        this.atcModelList = [...new Set(doc.map(e => e['atcmodel']))];
        doc.forEach(item => this.maplevel[item['level'].id] = item);
      });

    const biglevels = await getDocs(query(collection(this.firestore, 'biglevel'), orderBy('sequence', 'desc')));
    let diagnosticFound = false;
    
    biglevels.docs.forEach(d => {
      const el = d.data();
      const [levelId, levelName, category, sequence] = [el['docid'], el['level'], el['category'], el['sequence'] || 0];
      this.maplevels[levelId] = levelName;
      this.mapLevelToCategory[levelId] = category;
      
      if (category && levelName) {
        this.allLevelsPerCategory[category] = this.allLevelsPerCategory[category] || [];
        if (!this.allLevelsPerCategory[category].some(l => l.levelName === levelName)) {
          this.allLevelsPerCategory[category].push({ levelName, sequence });
        }
      }
      
      if (category && (this.categorySequenceMap[category] === undefined || sequence < this.categorySequenceMap[category])) {
        this.categorySequenceMap[category] = sequence;
      }
      
      if (!diagnosticFound && levelName?.toLowerCase().includes('diagnostic')) diagnosticFound = true;
      const isDiagShadow = levelName?.toLowerCase() === 'diagnostics shadow';
      
      (!diagnosticFound || isDiagShadow ? this.beforeDiagnosticLevelList : this.afterDiagnosticLevelList).push(levelId);
    });
    
    Object.keys(this.allLevelsPerCategory).forEach(cat => 
      this.allLevelsPerCategory[cat].sort((a, b) => a.sequence - b.sequence));

    const bigactivities = await getDocs(collection(this.firestore, "bigactivity"));
    bigactivities.docs.forEach(d => { const el = d.data(); this.mapBigActivity[el['docid']] = el['activity']; });

    collectionData(query(collection(this.firestore, "biglevel"), orderBy("level")))
      .pipe(takeUntil(this.destroy$)).subscribe(list => {
        this.levelList = list;
        this.categoryList = [...new Set(list.map((e: any) => e['category']).filter(Boolean))];
      });
  }

  async loadParticipants() {
    const journeys = await getDocs(query(collection(this.firestore, 'journey'), where('atcmodel', '==', "B!G")));
    journeys.docs.forEach(el => { this.bigjourney.push(el.id); this.journeydata[el.id] = el.data(); });
    
    if (!this.bigjourney.length) { this.participantsLoaded = true; this.tryInitializeData(); return; }

    const [active, nonactive] = await Promise.all([
      getDocs(query(collection(this.firestore, 'participant metadata'), where('customerstatus', '==', 'active'), where('activejourney', 'in', this.bigjourney))),
      getDocs(query(collection(this.firestore, 'participant metadata'), where('customerstatus', '==', 'non active'), where('lastcompletedjourney', 'in', this.bigjourney)))
    ]);

    active.docs.forEach(el => { this.participantActiveData[el.id] = el.data(); this.activeProfileIds.add(el.id); });
    nonactive.docs.forEach(el => { this.participantNonActiveData[el.id] = el.data(); this.nonActiveProfileIds.add(el.id); });

    const combined = { ...this.participantActiveData, ...this.participantNonActiveData };
    Object.entries(combined).forEach(([id, item]) => {
      this.mapparticipant[id] = item['name'];
      this.profilelist.push(item);
    });
    this.filteredProfilelist = this.profilelist;
    this.participantsLoaded = true;
    this.tryInitializeData();
    this.buildJourneySummary();
  }

  buildJourneySummary() {
    this.journeySummary = {};
    const addToSummary = (journey: string, type: 'active' | 'nonactive') => {
      if (!journey) return;
      this.journeySummary[journey] = this.journeySummary[journey] || { active: 0, nonactive: 0, total: 0 };
      this.journeySummary[journey][type]++;
      this.journeySummary[journey].total++;
    };
    Object.values(this.participantActiveData).forEach((p: any) => addToSummary(p.activejourney, 'active'));
    Object.values(this.participantNonActiveData).forEach((p: any) => addToSummary(p.lastcompletedjourney, 'nonactive'));
  }

  tryInitializeData() {
    if (!this.participantsLoaded || !this.aggregateDataLoaded) return;
    const validIds = new Set(this.profilelist.map(p => p.profileid));
    this.participantaggregateList = this.participantaggregateList.filter((item: any) => validIds.has(item['profileid']));
    this.buildParticipantAtcModels();
    this.initTable();
  }

  buildParticipantAtcModels() {
    this.participantAtcModels = {};
    this.participantaggregateList.forEach((row: any) => {
      const pid = row['profileid'];
      const atcmodel = row['atcmodel'];
      if (pid && atcmodel) {
        if (!this.participantAtcModels[pid]) {
          this.participantAtcModels[pid] = new Set();
        }
        this.participantAtcModels[pid].add(atcmodel);
      }
    });
  }

  ngOnInit() {
    this.dataSource.filterPredicate = this.customfilter();
  }

  initTable() {
    this.dataSource.data = this.participantaggregateList;
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.calculateUnfilteredSummaryData();
    this.onFilter();
  }

  calculateUnfilteredSummaryData() {
    const participantsWithData = new Set<string>();
    this.participantaggregateList.forEach((row: any) => {
      if (row['profileid']) participantsWithData.add(row['profileid']);
    });
    
    [...Object.keys(this.participantActiveData), ...Object.keys(this.participantNonActiveData)]
      .forEach(id => { if (!participantsWithData.has(id)) this.notStartedParticipants.add(id); });
  }

  calculateStatusFilteredSummaryData() {
    [this.filteredAtcModelLevelup, this.filteredBeforeDiagnosticCounts, this.filteredAfterDiagnosticCounts] = [{}, {}, {}];
    [this.filteredAtcModelUniqueParticipants, this.filteredBeforeDiagnosticUniqueParticipants, this.filteredAfterDiagnosticUniqueParticipants] = [{}, {}, {}];
    [this.filteredTotalUniqueParticipants, this.filteredBeforeDiagnosticTotalUnique, this.filteredAfterDiagnosticTotalUnique] = [new Set(), new Set(), new Set()];
    [this.filteredTotalRecords, this.filteredBeforeDiagnosticTotal, this.filteredAfterDiagnosticTotal] = [0, 0, 0];

    const status = this.filter.status;
    
    this.participantaggregateList.forEach((row: any) => {
      const [atcmodel, profileId] = [row['atcmodel'], row['profileid']];
      if (!atcmodel || !profileId) return;
      if (status === 'active' && !this.activeProfileIds.has(profileId)) return;
      if (status === 'nonactive' && !this.nonActiveProfileIds.has(profileId)) return;

      ['filteredAtcModelUniqueParticipants', 'filteredBeforeDiagnosticUniqueParticipants', 'filteredAfterDiagnosticUniqueParticipants']
        .forEach(key => { if (!this[key][atcmodel]) this[key][atcmodel] = new Set(); });

      this.filteredAtcModelLevelup[atcmodel] = (this.filteredAtcModelLevelup[atcmodel] || 0) + 1;
      this.filteredTotalRecords++;
      this.filteredAtcModelUniqueParticipants[atcmodel].add(profileId);
      this.filteredTotalUniqueParticipants.add(profileId);

      (row['fasttrack'] || []).forEach(() => {
        this.filteredAtcModelLevelup[atcmodel] = (this.filteredAtcModelLevelup[atcmodel] || 0) + 1;
        this.filteredTotalRecords++;
      });

      const processLevel = (levelId: string) => {
        if (!levelId) return;
        if (this.beforeDiagnosticLevelList.includes(levelId)) {
          this.filteredBeforeDiagnosticCounts[atcmodel] = (this.filteredBeforeDiagnosticCounts[atcmodel] || 0) + 1;
          this.filteredBeforeDiagnosticTotal++;
          this.filteredBeforeDiagnosticUniqueParticipants[atcmodel].add(profileId);
          this.filteredBeforeDiagnosticTotalUnique.add(profileId);
        }
        if (this.afterDiagnosticLevelList.includes(levelId)) {
          this.filteredAfterDiagnosticCounts[atcmodel] = (this.filteredAfterDiagnosticCounts[atcmodel] || 0) + 1;
          this.filteredAfterDiagnosticTotal++;
          this.filteredAfterDiagnosticUniqueParticipants[atcmodel].add(profileId);
          this.filteredAfterDiagnosticTotalUnique.add(profileId);
        }
      };

      processLevel(row['level']?.id);
      (row['fasttrack'] || []).forEach((ft: any) => processLevel(ft['level']?.id));
    });
    this.calculateFilteredNotStarted();
  }
  calculateFilteredNotStarted() {
    this.filteredNotStartedParticipants = new Set<string>();
    const status = this.filter.status;
    
    // Get all participant IDs that have data in the aggregate list
    const participantsWithData = new Set<string>();
    this.participantaggregateList.forEach((row: any) => {
      if (row['profileid']) participantsWithData.add(row['profileid']);
    });
    
    // Filter not started based on status
    if (status === 'active' || status === 'total') {
      this.activeProfileIds.forEach(id => {
        if (!participantsWithData.has(id)) {
          this.filteredNotStartedParticipants.add(id);
        }
      });
    }
    
    if (status === 'nonactive' || status === 'total') {
      this.nonActiveProfileIds.forEach(id => {
        if (!participantsWithData.has(id)) {
          this.filteredNotStartedParticipants.add(id);
        }
      });
    }
  }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  onSearchText(type: string) {
    const val = this.filterText?.toLowerCase().trim() || '';
    return type === 'participant' ? this.filteredProfilelist = this.profilelist.filter(e => e.name.toLowerCase().startsWith(val)) : [];
  }

  onFilter() {
    this.dataSource.filter = JSON.stringify(this.filter);
    this.calculateCategoryLevelCounts();
    this.updateDisplayCategories();
    this.updateCategoryTotals();
    this.mapActivityByParticipant();
    this.calculateStatusFilteredSummaryData();
  }

  customfilter(): (data: any, filter: string) => boolean {
    return (data, filter) => {
      const v = JSON.parse(filter);
      const pid = data['profileid'];
      if (v.status === 'active' && !this.activeProfileIds.has(pid)) return false;
      if (v.status === 'nonactive' && !this.nonActiveProfileIds.has(pid)) return false;
      if (v.participant.length && !v.participant.includes(pid)) return false;
      if (v.atcmodel.length && !v.atcmodel.includes(data['atcmodel'])) return false;
      if (v.category.length) {
        const cats = [this.mapLevelToCategory[data['level']?.id], ...(data['fasttrack'] || []).map((ft: any) => this.mapLevelToCategory[ft['level']?.id])].filter(Boolean);
        if (!cats.some(c => v.category.includes(c))) return false;
      }
      return true;
    };
  }

  onClearFilter() {
    this.filter = { participant: [], atcmodel: [], category: [], status: 'total' };
    this.onFilter();
  }

  calculateCategoryLevelCounts() {
    this.categoryLevelCounts = {};
    this.participantsByFilter = {};
    
    Object.entries(this.allLevelsPerCategory).forEach(([cat, levels]) => {
      this.categoryLevelCounts[cat] = {};
      levels.forEach(l => this.categoryLevelCounts[cat][l.levelName] = { fasttrack: 0, regular: 0, total: 0 });
    });

    (this.dataSource.filteredData || this.dataSource.data).forEach((el: any) => {
      const pid = el['profileid'];
      const atcmodel = el['atcmodel'];
      
      const addCount = (cat: string, lvl: string, type: 'fasttrack' | 'regular') => {
        if (!this.categoryLevelCounts[cat]) this.categoryLevelCounts[cat] = {};
        if (!this.categoryLevelCounts[cat][lvl]) this.categoryLevelCounts[cat][lvl] = { fasttrack: 0, regular: 0, total: 0 };
        
        [`${cat}|${lvl}|${type}`, `${cat}|${lvl}|total`, `${cat}|null|${type}`, `${cat}|null|total`].forEach(key => {
          this.participantsByFilter[key] = this.participantsByFilter[key] || {};
          if (!this.participantsByFilter[key][pid]) {
            this.participantsByFilter[key][pid] = { count: 0, atcModels: new Set() };
          }
          this.participantsByFilter[key][pid].count++;
          if (atcmodel) {
            this.participantsByFilter[key][pid].atcModels.add(atcmodel);
          }
        });
        
        this.categoryLevelCounts[cat][lvl][type]++;
        this.categoryLevelCounts[cat][lvl].total++;
      };

      const lvlId = el['level']?.id;
      if (lvlId) addCount(this.mapLevelToCategory[lvlId] || 'Uncategorized', this.maplevels[lvlId] || 'Unknown', 'regular');
      
      (el['fasttrack'] || []).forEach((ft: any) => {
        const ftId = ft['level']?.id;
        if (ftId) addCount(this.mapLevelToCategory[ftId] || 'Uncategorized', this.maplevels[ftId] || 'Unknown', 'fasttrack');
      });
    });
  }

  updateDisplayCategories() {
    const cats = this.filter.category.length ? [...this.filter.category] : 
      [...new Set([...Object.keys(this.categoryLevelCounts), ...Object.keys(this.allLevelsPerCategory)])];
    this.displayCategories = cats.sort((a, b) => (this.categorySequenceMap[b] ?? -Infinity) - (this.categorySequenceMap[a] ?? -Infinity));
  }

  updateCategoryTotals() {
    this.categoryTotals = {};
    this.categoryUniqueParticipants = {};
    
    this.displayCategories.forEach(cat => {
      const levels = this.categoryLevelCounts[cat];
      this.categoryTotals[cat] = levels ? Object.values(levels).reduce((s, c) => 
        ({ fasttrack: s.fasttrack + c.fasttrack, regular: s.regular + c.regular, total: s.total + c.total }), 
        { fasttrack: 0, regular: 0, total: 0 }) : { fasttrack: 0, regular: 0, total: 0 };
      this.categoryUniqueParticipants[cat] = Object.keys(this.participantsByFilter[`${cat}|null|total`] || {}).length;
    });
  }

  mapActivityByParticipant() {
    this.mapActivityPerParticipant = {};
    this.totalActivityCount = 0;
    
    (this.dataSource.filteredData || this.dataSource.data).forEach((el: any) => {
      const [pid, atc] = [el['profileid'], el['atcmodel']];
      const addActivity = (completed: number) => {
        this.mapActivityPerParticipant[pid] = this.mapActivityPerParticipant[pid] || {};
        this.mapActivityPerParticipant[pid][atc] = (this.mapActivityPerParticipant[pid][atc] || 0) + completed;
        this.totalActivityCount += completed;
      };
      
      ['specialactivity', 'boosteractivity', 'regular', 'warmup'].forEach(key => 
        (el[key] || []).forEach((a: any) => addActivity(a['completed'] || 0)));
      
      (el['fasttrack'] || []).forEach((ft: any) => {
        [...(ft['stabilization'] || []), ...(ft['validation'] || [])].forEach((a: any) => addActivity(a['completed'] || 0));
      });
    });
  }

  openDrawer(drawer: MatDrawer, category: string, level: string | null, type: 'fasttrack' | 'regular' | 'total') {
    const map = this.participantsByFilter[`${category}|${level}|${type}`] || {};
    this.drawerParticipants = Object.keys(map).map(id => ({
      profileId: id,
      name: this.mapparticipant[id] || 'Unknown',
      count: map[id].count || 1,
      atcModels: map[id].atcModels ? [...map[id].atcModels] : [...(this.participantAtcModels[id] || [])]
    }));
    this.drawerTitle = `${category}${level ? ` - ${level}` : ''} (${type === 'fasttrack' ? 'Fast Track' : type === 'regular' ? 'Regular' : 'Total'}: ${this.drawerParticipants.length})`;
    drawer.open();
  }

  openParticipantDrawer(drawer: MatDrawer, type: 'total' | 'active' | 'nonactive') {
    const data = type === 'active' ? this.participantActiveData : type === 'nonactive' ? this.participantNonActiveData : { ...this.participantActiveData, ...this.participantNonActiveData };
    this.drawerParticipants = Object.entries(data).map(([id, p]: any) => ({
      profileId: id,
      name: p.name,
      count: 1,
      atcModels: [...(this.participantAtcModels[id] || [])]
    })).sort((a, b) => a.name.localeCompare(b.name));
    this.drawerTitle = `${type === 'active' ? 'Active' : type === 'nonactive' ? 'Non-Active' : 'All'} Participants (${this.drawerParticipants.length})`;
    drawer.open();
  }

  openJourneyDrawer(drawer: MatDrawer, journeyId: string, type: 'active' | 'nonactive' | 'total') {
    let list: ParticipantInfo[] = [];
    if (type !== 'nonactive') {
      list.push(...Object.entries(this.participantActiveData)
        .filter(([_, p]: any) => p.activejourney === journeyId)
        .map(([id, p]: any) => ({
          profileId: id,
          name: p.name,
          count: 1,
          atcModels: [...(this.participantAtcModels[id] || [])]
        })));
    }
    if (type !== 'active') {
      list.push(...Object.entries(this.participantNonActiveData)
        .filter(([_, p]: any) => p.lastcompletedjourney === journeyId)
        .map(([id, p]: any) => ({
          profileId: id,
          name: p.name,
          count: 1,
          atcModels: [...(this.participantAtcModels[id] || [])]
        })));
    }
    this.drawerTitle = `${this.journeydata[journeyId]?.['journey'] || 'Unknown'} - ${type === 'active' ? 'Active' : type === 'nonactive' ? 'Non-Active' : 'All'} (${list.length})`;
    this.drawerParticipants = list.sort((a, b) => a.name.localeCompare(b.name));
    drawer.open();
  }

  openAtcModelDrawer(drawer: MatDrawer, atcmodel: string | null) {
    const ids = atcmodel ? this.filteredAtcModelUniqueParticipants[atcmodel] || new Set() : this.filteredTotalUniqueParticipants;
    this.setupDrawer(drawer, ids, atcmodel ? `${atcmodel} - Unique Participants` : 'All ATC Models - Unique Participants', atcmodel);
  }
  openNotStartedDrawer(drawer: MatDrawer) { 
    this.setupDrawer(drawer, this.filteredNotStartedParticipants, 'Not Started Participants', null); 
  }
  // openNotStartedDrawer(drawer: MatDrawer) { this.setupDrawer(drawer, this.notStartedParticipants, 'Not Started Participants', null); }
  openBeforeDiagnosticDrawer(drawer: MatDrawer, atcmodel: string | null) { this.setupDrawer(drawer, atcmodel ? this.filteredBeforeDiagnosticUniqueParticipants[atcmodel] || new Set() : this.filteredBeforeDiagnosticTotalUnique, `Before Diagnostics${atcmodel ? ` - ${atcmodel}` : ' - All'}`, atcmodel); }
  openAfterDiagnosticDrawer(drawer: MatDrawer, atcmodel: string | null) { this.setupDrawer(drawer, atcmodel ? this.filteredAfterDiagnosticUniqueParticipants[atcmodel] || new Set() : this.filteredAfterDiagnosticTotalUnique, `After Diagnostics${atcmodel ? ` - ${atcmodel}` : ' - All'}`, atcmodel); }

  setupDrawer(drawer: MatDrawer, ids: Set<string>, title: string, specificAtcModel: string | null) {
    this.drawerParticipants = [...ids].map(id => ({
      profileId: id,
      name: this.mapparticipant[id] || 'Unknown',
      count: 1,
      atcModels: specificAtcModel ? [specificAtcModel] : [...(this.participantAtcModels[id] || [])]
    })).sort((a, b) => a.name.localeCompare(b.name));
    this.drawerTitle = `${title} (${ids.size})`;
    drawer.open();
  }

  openProfile(profileId: string, screen: string) {
    window.open(this.router.createUrlTree([`/${screen === 'userprofile' ? 'userprofile' : 'profilesummary'}`, profileId]).toString(), '_blank');
  }

  getActivity(pid: string, atc: string) { return this.mapActivityPerParticipant[pid]?.[atc] || 0; }
  get activeCount() { return Object.keys(this.participantActiveData).length; }
  get nonActiveCount() { return Object.keys(this.participantNonActiveData).length; }
}