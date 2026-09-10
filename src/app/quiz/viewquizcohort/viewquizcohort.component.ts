import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  Firestore,
  collection,
  getDocs,
  query,
  where,
  getDoc,
  DocumentReference
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import * as XLSX from 'xlsx';

interface QuizOption {
  text: string;
  explanation: string;
  isCorrect: boolean;
  isSelected?: boolean;
  cohortref: DocumentReference;
}

interface Quiz {
  id: string;
  docId: string;
  question: string;
  type: string;
  active: boolean;
  options: QuizOption[];
  eventref: DocumentReference;
  productref: DocumentReference | null;
  createdAt: any;
}

interface QuizResponse {
  id: string;
  docid: string;
  profileid: string;
  question: string;
  type: string;
  submittedIn: string;
  date: any;
  eventref: DocumentReference;
  productref: DocumentReference | null;
  quizref: DocumentReference;
  selectedcohort: DocumentReference;
  quizData: QuizOption[];
  selectedOption?: string;
  selectedCohortName?: string;
  selectedEventName?: string;
  formattedDate?: string;
}

@Component({
  selector: 'app-viewquizcohort',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatChipsModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule
  ],
  templateUrl: './viewquizcohort.component.html',
  styleUrl: './viewquizcohort.component.css'
})
export class ViewquizcohortComponent implements OnInit, AfterViewInit {
  
  @ViewChild(MatPaginator, { static: false }) paginator!: MatPaginator;
  @ViewChild(MatSort, { static: false }) sort!: MatSort;

  quizzes: Quiz[] = [];
  responses: QuizResponse[] = [];
  selectedQuiz: Quiz | null = null;
  isLoading = true;
  showFilters = false;
  
  // Table data source
  dataSource = new MatTableDataSource<QuizResponse>([]);
  
  // Filters
  filterProfileId = '';
  filterOptionText = '';
  filterDateFrom: Date | null = null;
  filterDateTo: Date | null = null;

  // Table columns
  displayedColumns: string[] = ['profileid', 'selectedOption', 'cohort', 'event', 'date'];
  mapProfile: { [key: string]: string } = {};
  
  private viewInitialized = false;

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private cdr: ChangeDetectorRef
  ) {
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
      // Re-apply filters after profile map is loaded
      if (this.viewInitialized && this.responses.length > 0) {
        this.applyFilters();
      }
    });
  }
  
  async ngOnInit() {
    this.isLoading = true;
    try {
      await Promise.all([
        this.loadQuizzes(),
        this.loadResponses()
      ]);
    } catch (error) {
      console.error('Error during initialization:', error);
    } finally {
      this.isLoading = false;
    }
  }

  ngAfterViewInit() {
    this.viewInitialized = true;
    this.initTableFeatures();
    
    // Apply filters after view is ready
    if (this.selectedQuiz && this.responses.length > 0) {
      this.applyFilters();
    }
    
    // Trigger change detection
    this.cdr.detectChanges();
  }

  initTableFeatures() {
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
    
    if (this.sort) {
      this.dataSource.sort = this.sort;
      
      // Custom sorting for nested/formatted fields
      this.dataSource.sortingDataAccessor = (item: QuizResponse, property: string) => {
        switch (property) {
          case 'profileid': 
            return this.mapProfile[item.profileid]?.toLowerCase() || '';
          case 'selectedOption': 
            return item.selectedOption?.toLowerCase() || '';
          case 'cohort': 
            return item.selectedCohortName?.toLowerCase() || '';
          case 'event': 
            return item.selectedEventName?.toLowerCase() || '';
          case 'date': 
            return item.date?.toDate ? item.date.toDate().getTime() : 0;
          default: 
            return '';
        }
      };
    }
  }

  async loadQuizzes() {
    try {
      const quizRef = collection(this.firestore, 'quiz');
      const q = query(quizRef, where('type', '==', 'withoutResponse'));
      const snapshot = await getDocs(q);
      
      const list: Quiz[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Quiz);
      });
      
      // Sort by createdAt descending (latest first)
      list.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dateB - dateA;
      });
      
      this.quizzes = list;
      
      // Auto-select latest active quiz
      const latestActive = list.find(quiz => quiz.active === true);
      this.selectedQuiz = latestActive || list[0] || null;
      
      console.log('Loaded quizzes:', this.quizzes.length);
      console.log('Selected quiz:', this.selectedQuiz?.question);
    } catch (error) {
      console.error('Error loading quizzes:', error);
    }
  }

  async loadResponses() {
    try {
      // Load all cohorts and events first (bulk load)
      const [cohortsMap, eventsMap] = await Promise.all([
        this.loadAllCohorts(),
        this.loadAllEvents()
      ]);
      
      const quizClientRef = collection(this.firestore, 'quizbyclients');
      const q = query(quizClientRef, where('type', '==', 'withoutResponse'));
      const snapshot = await getDocs(q);
      
      const list: QuizResponse[] = [];
      
      for (const doc of snapshot.docs) {
        const data = doc.data() as QuizResponse;
        data.id = doc.id;
        
        // Extract selected option
        const selectedOpt = data.quizData?.find(o => o.isSelected);
        data.selectedOption = selectedOpt?.text || 'No selection';
        
        // Get cohort name from preloaded map
        if (data.selectedcohort) {
          const cohortId = data.selectedcohort.id;
          data.selectedCohortName = cohortsMap.get(cohortId) || 'Unknown';
        } else {
          data.selectedCohortName = 'N/A';
        }
        
        // Get event name from preloaded map
        if (data.eventref) {
          const eventId = data.eventref.id;
          data.selectedEventName = eventsMap.get(eventId) || 'Unknown';
        } else {
          data.selectedEventName = 'N/A';
        }
        
        // Format date
        if (data.date?.toDate) {
          data.formattedDate = data.date.toDate().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        } else {
          data.formattedDate = 'N/A';
        }
        
        list.push(data);
      }
      
      this.responses = list;
      console.log('Loaded responses:', this.responses.length);
      
      // Only apply filters if view is initialized
      if (this.viewInitialized && this.selectedQuiz) {
        this.applyFilters();
      }
    } catch (error) {
      console.error('Error loading responses:', error);
    }
  }

  async loadAllCohorts(): Promise<Map<string, string>> {
    try {
      const cohortsRef = collection(this.firestore, 'big cohorts');
      const snapshot = await getDocs(cohortsRef);
      
      const cohortsMap = new Map<string, string>();
      snapshot.forEach(doc => {
        const data = doc.data();
        cohortsMap.set(doc.id, data['name'] || 'Unknown');
      });
      
      console.log('Loaded cohorts:', cohortsMap.size);
      return cohortsMap;
    } catch (error) {
      console.error('Error loading cohorts:', error);
      return new Map();
    }
  }

  async loadAllEvents(): Promise<Map<string, string>> {
    try {
      const eventsRef = collection(this.firestore, 'event collection');
      const snapshot = await getDocs(eventsRef);
      
      const eventsMap = new Map<string, string>();
      snapshot.forEach(doc => {
        const data = doc.data();
        eventsMap.set(doc.id, data['name'] || 'Unknown');
      });
      
      console.log('Loaded events:', eventsMap.size);
      return eventsMap;
    } catch (error) {
      console.error('Error loading events:', error);
      return new Map();
    }
  }

  onQuizChange(quizId: string) {
    const quiz = this.quizzes.find(q => q.id === quizId);
    if (quiz) {
      console.log('Quiz changed to:', quiz.question);
      this.selectedQuiz = quiz;
      this.clearFilters();
    }
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  clearFilters() {
    this.filterProfileId = '';
    this.filterOptionText = '';
    this.filterDateFrom = null;
    this.filterDateTo = null;
    this.applyFilters();
  }

  applyFilters() {
    if (!this.selectedQuiz) {
      this.dataSource.data = [];
      console.log('No quiz selected, clearing data');
      return;
    }

    // Filter by selected quiz question
    let filtered = this.responses.filter(r => r.question === this.selectedQuiz!.question);
    console.log('Responses for quiz:', filtered.length);

    // Filter by profile ID
    if (this.filterProfileId) {
      const search = this.filterProfileId.toLowerCase();
      filtered = filtered.filter(r => {
        const profileName = this.mapProfile[r.profileid] || '';
        return profileName.toLowerCase().includes(search);
      });
      console.log('After profile filter:', filtered.length);
    }

    // Filter by selected option
    if (this.filterOptionText) {
      filtered = filtered.filter(r => r.selectedOption === this.filterOptionText);
      console.log('After option filter:', filtered.length);
    }

    // Filter by date range
    if (this.filterDateFrom || this.filterDateTo) {
      filtered = filtered.filter(r => {
        const responseDate = r.date?.toDate ? r.date.toDate() : new Date(r.date);
        
        if (this.filterDateFrom && responseDate < this.filterDateFrom) {
          return false;
        }
        
        if (this.filterDateTo) {
          const toDate = new Date(this.filterDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (responseDate > toDate) {
            return false;
          }
        }
        
        return true;
      });
      console.log('After date filter:', filtered.length);
    }

    // Update data source
    this.dataSource.data = filtered;
    
    // Reset paginator to first page
    if (this.paginator) {
      this.paginator.firstPage();
    }
    
    console.log('Final filtered data:', this.dataSource.data.length);
  }

  get filteredResponses(): QuizResponse[] {
    return this.dataSource.data;
  }

  get optionBreakdown(): { option: string; count: number; percentage: number }[] {
    const responses = this.filteredResponses;
    const breakdown: { [key: string]: number } = {};
    
    responses.forEach(r => {
      const opt = r.selectedOption || 'Unknown';
      breakdown[opt] = (breakdown[opt] || 0) + 1;
    });
    
    return Object.entries(breakdown).map(([option, count]) => ({
      option,
      count,
      percentage: responses.length > 0 ? Math.round((count / responses.length) * 100) : 0
    }));
  }

  onDateFromChange(value: string) {
    this.filterDateFrom = value ? new Date(value) : null;
    this.applyFilters();
  }

  onDateToChange(value: string) {
    this.filterDateTo = value ? new Date(value) : null;
    this.applyFilters();
  }

  // ============ EXCEL EXPORT ============

  exportToExcel() {
    if (!this.selectedQuiz || this.filteredResponses.length === 0) {
      return;
    }

    // Sheet 1 — one row per participant response (respects active filters + sort)
    const rows = this.sortedResponses.map((r, i) => ({
      'S.No': i + 1,
      'Participant Name': this.mapProfile[r.profileid] || r.profileid || 'Unknown',
      'Selected Option': r.selectedOption || 'No selection',
      'Cohort': r.selectedCohortName || 'N/A',
      'Event': r.selectedEventName || 'N/A',
      'Date': r.date?.toDate ? r.date.toDate() : null
    }));

    // Row 1 carries the quiz question; the table header starts on row 2
    const responsesSheet = XLSX.utils.aoa_to_sheet([[this.selectedQuiz.question]]);
    XLSX.utils.sheet_add_json(responsesSheet, rows, {
      origin: 'A2',
      cellDates: true,
      dateNF: 'dd-mmm-yyyy hh:mm AM/PM'
    });

    responsesSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    responsesSheet['!cols'] = [
      { wch: 6 }, { wch: 28 }, { wch: 32 },
      { wch: 24 }, { wch: 24 }, { wch: 22 }
    ];

    // Sheet 2 — option breakdown summary for the same filtered set
    const summaryRows: any[][] = [
      ['Quiz Question', this.selectedQuiz.question],
      ['Status', this.selectedQuiz.active ? 'Active' : 'Inactive'],
      ['Total Responses', this.filteredResponses.length],
      ['Filters Applied', this.activeFilterSummary],
      [],
      ['Option', 'Responses', 'Percentage']
    ];

    this.optionBreakdown.forEach(b => {
      summaryRows.push([b.option, b.count, `${b.percentage}%`]);
    });

    // Options that nobody picked still belong in the breakdown
    const answered = new Set(this.optionBreakdown.map(b => b.option));
    this.selectedQuiz.options
      .filter(o => !answered.has(o.text))
      .forEach(o => summaryRows.push([o.text, 0, '0%']));

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, responsesSheet, 'Responses');
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    XLSX.writeFile(workbook, this.buildFileName());
  }

  /** Rows in the order the table currently shows them (sort applied, pagination ignored). */
  private get sortedResponses(): QuizResponse[] {
    const data = this.filteredResponses;
    if (!this.sort?.active || !this.sort.direction) {
      return data;
    }

    const accessor = this.dataSource.sortingDataAccessor;
    const factor = this.sort.direction === 'asc' ? 1 : -1;

    return [...data].sort((a, b) => {
      const valueA = accessor(a, this.sort.active);
      const valueB = accessor(b, this.sort.active);
      if (valueA < valueB) return -1 * factor;
      if (valueA > valueB) return 1 * factor;
      return 0;
    });
  }

  private get activeFilterSummary(): string {
    const parts: string[] = [];
    if (this.filterProfileId) parts.push(`Participant: ${this.filterProfileId}`);
    if (this.filterOptionText) parts.push(`Option: ${this.filterOptionText}`);
    if (this.filterDateFrom) parts.push(`From: ${this.filterDateFrom.toLocaleDateString('en-US')}`);
    if (this.filterDateTo) parts.push(`To: ${this.filterDateTo.toLocaleDateString('en-US')}`);
    return parts.length ? parts.join(' | ') : 'None';
  }

  private buildFileName(): string {
    const slug = (this.selectedQuiz?.question || 'quiz')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'quiz';

    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');

    return `quiz_responses_${slug}_${stamp}.xlsx`;
  }
}