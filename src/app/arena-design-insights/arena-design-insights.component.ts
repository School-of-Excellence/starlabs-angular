import { Component, ViewChild, AfterViewInit, OnDestroy, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { collection, collectionData, doc, docData, Firestore, getFirestore, query, Timestamp } from '@angular/fire/firestore';
import { Subject, takeUntil, combineLatest, interval, BehaviorSubject, filter, take } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MarkdownModule } from 'ngx-markdown';
import { Router } from '@angular/router';
import { AuthguardService } from '../authguard.service';
import { where } from 'firebase/firestore';
import { TopCompletedDoersPipe } from "../custompipe.pipe";
import { trigger, transition, style, animate, query as animQuery, stagger, group, state, AnimationEvent } from '@angular/animations';
import { ProfilePictureComponent } from '../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-arena-design-insights',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MarkdownModule,
    TopCompletedDoersPipe,
    ProfilePictureComponent
  ],
  templateUrl: './arena-design-insights.component.html',
  styleUrl: './arena-design-insights.component.css',
  animations: [
    trigger('leaderboardSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(100%)' }),
        animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 0, transform: 'translateX(-100%)' }))
      ])
    ]),
    trigger('highlightSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(100%)' }),
        animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 0, transform: 'translateX(-100%)' }))
      ])
    ]),
    trigger('valueUpdate', [
      transition('* => *', [
        animate('300ms ease-out', style({ transform: 'scale(1.5)' })),
        animate('400ms ease-in', style({ transform: 'scale(1)' }))
      ])
    ]),
    trigger('timerPulse', [
      state('tick', style({ transform: 'scale(1)' })),
      state('tock', style({ transform: 'scale(1)' })),
      transition('tick <=> tock', [
        animate('150ms ease-out', style({ transform: 'scale(1.02)' })),
        animate('150ms ease-in', style({ transform: 'scale(1)' }))
      ])
    ]),
    trigger('timerEndFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)' }),
        animate('500ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class ArenaDesignInsightsComponent implements OnInit, OnDestroy, AfterViewInit {
  eventData: any = null;
  previousEventData: any = null;
  eventCWData: any[] = [];
  doerCompletedCount: { doerid: string; count: number }[] = [];
  doerEIYCount: { doerid: string; eiy: number }[] = [];
  currentLeaderboard: 'changework' | 'eiy' = 'changework';
  private leaderboardInterval: any;
  eiyValueTrigger: number = 0;
  previousTotalSavedYears: number = 0;
  videoAskHighlight: any = null;
  videoAskHighlights: any[] = [];
  activeAnnouncement: any = null;
  activeTimer: any = null;
  timerDisplay: { minutes: string; seconds: string } = { minutes: '00', seconds: '00' };
  timerState: 'tick' | 'tock' = 'tick';
  timerEnded: boolean = false;
  timerEndImage: string = 'assets/eslogo.jpg';
  private timerInterval: any;
  private destroy$ = new Subject<void>();
  mapProfile: { [key: string]: string } = {};
  mapDob: { [key: string]: any } = {};
  totalSavedYears: number = 0;
  currentHighlightIndex: number = 0;
  displayedHighlightIndex: number = 0;
  isTransitioning: boolean = false;
  private highlightInterval: any;
  totalEvolutionYearSaved = 0;
  private profileMapReady$ = new BehaviorSubject<boolean>(false);
  private pendingCWData: any[] | null = null;
  
  constructor(
    private firestore: Firestore,
    private router: Router,
    public auth: AuthguardService,
  ) {
    this.auth.getProfileMap().then(e => {
      this.mapProfile = e.map;
      this.mapDob = e.dob;
      this.profileMapReady$.next(true);
      if (this.pendingCWData) {
        this.processDoerData(this.pendingCWData);
        this.pendingCWData = null;
      }
    });
  }

  ngOnInit(): void {
    this.subscribeToAllData();
    let keyPresses: number[] = [];
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 't') {
        const now = Date.now();
        keyPresses.push(now);
        keyPresses = keyPresses.filter(t => now - t < 1000);
        if (keyPresses.length >= 3) {
          this.showTestPanel = !this.showTestPanel;
          keyPresses = [];
        }
      }
    });
  }

  showTestPanel: boolean = false;

  ngAfterViewInit(): void {
    this.startHighlightSlideshow();
    this.startLeaderboardSlideshow();
  }

  private startLeaderboardSlideshow(): void {
    if (this.leaderboardInterval) {
      clearInterval(this.leaderboardInterval);
    }
    
    this.leaderboardInterval = setInterval(() => {
      this.currentLeaderboard = this.currentLeaderboard === 'changework' ? 'eiy' : 'changework';
    }, 10000);
  }

  private getHighlightDuration(highlight: any): number {
    if (highlight?.from === 'image') {
      return 8000;
    }
    const text = highlight?.transcribe;
    if (!text || !text.length) return 5000;

    const charsPerSecond = 25;
    return Math.max((text.length / charsPerSecond) * 1000, 5000);
  }

  private startHighlightSlideshow(): void {
    if (this.highlightInterval) {
      clearTimeout(this.highlightInterval);
    }

    const scheduleNext = () => {
      if (this.videoAskHighlights.length <= 1) return;

      const currentHighlight = this.videoAskHighlights[this.displayedHighlightIndex];
      const duration = this.getHighlightDuration(currentHighlight);

      this.highlightInterval = setTimeout(() => {
        this.transitionToNextHighlight();
      }, duration);
    };

    if (this.videoAskHighlights.length > 0) {
      this.displayedHighlightIndex = 0;
      scheduleNext();
    }
  }

  private transitionToNextHighlight(): void {
    if (this.isTransitioning || this.videoAskHighlights.length <= 1) return;
    this.isTransitioning = true;
    const nextIndex = (this.displayedHighlightIndex + 1) % this.videoAskHighlights.length;
    this.displayedHighlightIndex = nextIndex;
  }

  onHighlightAnimationDone(event: AnimationEvent): void {
    if (event.toState !== 'void' && this.isTransitioning) {
      this.isTransitioning = false;
      const currentHighlight = this.videoAskHighlights[this.displayedHighlightIndex];
      const duration = this.getHighlightDuration(currentHighlight);
      
      if (this.highlightInterval) {
        clearTimeout(this.highlightInterval);
      }
      
      this.highlightInterval = setTimeout(() => {
        this.transitionToNextHighlight();
      }, duration);
    }
  }

  private startTimer(targetTimestamp: Timestamp): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Reset timer ended state when starting a new timer
    this.timerEnded = false;
    const targetTime = targetTimestamp.toDate().getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const remainingMs = targetTime - now;

      if (remainingMs <= 0) {
        this.updateTimerDisplay(0);
        this.timerEnded = true; // Set flag when timer reaches zero
        clearInterval(this.timerInterval);
        console.log('Timer ended - showing end image');
        return;
      }

      const totalSeconds = Math.floor(remainingMs / 1000);
      this.updateTimerDisplay(totalSeconds);
      this.timerState = this.timerState === 'tick' ? 'tock' : 'tick';
    };
    updateCountdown();
    this.timerInterval = setInterval(updateCountdown, 1000);
  }

  private updateTimerDisplay(totalSeconds: number): void {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    this.timerDisplay = {
      minutes: mins.toString().padStart(2, '0'),
      seconds: secs.toString().padStart(2, '0')
    };
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerEnded = false; // Reset when stopping timer
  }

  isImageHighlight(highlight: any): boolean {
    return highlight?.from === 'image';
  }

  getCurrentHighlight(): any {
    return this.videoAskHighlights[this.displayedHighlightIndex] || null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.highlightInterval) {
      clearTimeout(this.highlightInterval);
    }
    if (this.leaderboardInterval) {
      clearInterval(this.leaderboardInterval);
    }
    this.stopTimer();
  }

  private subscribeToAllData(): void {
    this.loadEventData();
    this.loadPreviousEventData();
    this.loadCWData();
    this.loadHighlights();
  }

  getInitials(name: string | undefined): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  loadEventData(): void {
    const docRef = doc(this.firestore, 'event collection', 'PBTh96AJzjXNkBZ5Mw8q');
    docData(docRef, { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          if (data) {
            this.eventData = data;
            console.log('Event Data:', this.eventData);
          } else {
            console.warn('Document does not exist');
            this.eventData = null;
          }
        },
        error: (error) => {
          console.error('Error fetching event document:', error);
          this.eventData = null;
        }
      });
  }

  private loadPreviousEventData(): void {
    const previousEventRef = doc(this.firestore, 'event collection', 'McC7UQYbnlneUBxlL8bJ');
    docData(previousEventRef, { idField: 'id' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        if (data) {
          this.previousEventData = data;
          this.calculateEvolutionYearSaved();
        } else {
          console.warn('Previous event document does not exist');
          this.previousEventData = null;
          this.totalEvolutionYearSaved = 0;
        }
      },
      error: (error) => {
        console.error('Error fetching previous event:', error);
        this.previousEventData = null;
        this.totalEvolutionYearSaved = 0;
      }
    });
  }

  private calculateEvolutionYearSaved(): void {
    if (!this.previousEventData || !this.previousEventData.end_date) {
      this.totalEvolutionYearSaved = 0;
      return;
    }

    const endDateTs: Timestamp = this.previousEventData.end_date;
    const endDate = endDateTs.toDate();

    const threeMonthsBefore = new Date(endDate);
    threeMonthsBefore.setMonth(threeMonthsBefore.getMonth() - 3);

    const startOfMonth = new Date(
      threeMonthsBefore.getFullYear(),
      threeMonthsBefore.getMonth(),
      1,
      0, 0, 0, 0
    );

    const startTimestamp = Timestamp.fromDate(startOfMonth);
    const endTimestamp = Timestamp.fromDate(endDate);

    const firestoreATC = getFirestore("firestore-atc")
    const atcQuery = query(
      collection(firestoreATC, 'atc_alpha'),
      where('prescription_date', '>=', startTimestamp),
      where('prescription_date', '<=', endTimestamp)
    );

    collectionData(atcQuery, { idField: 'id' })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (atcData: any[]) => {
        this.totalEvolutionYearSaved = atcData.reduce(
          (sum, item) => sum + (Number(item['evolutionyearsaved']) || 0),
          0
        );
        console.log('ATC Alpha Results:', atcData);
        console.log('Total Evolution Year Saved:', this.totalEvolutionYearSaved);
      },
      error: (error) => {
        console.error('Error fetching ATC data:', error);
        this.totalEvolutionYearSaved = 0;
      }
    });
  }

  private loadCWData(): void {
    const eventRef = doc(this.firestore, 'event collection', 'PBTh96AJzjXNkBZ5Mw8q');
    const q = query(
      collection(this.firestore, 'livechangework'),
      where('eventref', '==', eventRef)
    );

    collectionData(q, { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (docs: any[]) => {
          this.eventCWData = docs;
          if (this.profileMapReady$.getValue()) {
            this.processDoerData(docs);
          } else {
            this.pendingCWData = docs;
            console.log('CW data received, waiting for profile map...');
          }
          
          console.log('Leaderboard Data:', this.doerCompletedCount);
          console.log('🌱 Total Saved Years:', this.totalSavedYears.toFixed(2));
        },
        error: (error) => {
          console.error('Error loading CW:', error);
          this.eventCWData = [];
          this.doerCompletedCount = [];
          this.totalSavedYears = 0;
        }
      });
  }

  private processDoerData(docs: any[]): void {
    const doerMap: { [key: string]: number } = {};
    const doerEIYMap: { [key: string]: number } = {};
    let totalSavedYears = 0;
    const dobKeys = Object.keys(this.mapDob);
    console.log('Processing doer data. mapDob has', dobKeys.length, 'entries');

    docs.forEach(data => {
      if (data.doerstatus === 'completed' && data.doerid) {
        doerMap[data.doerid] = (doerMap[data.doerid] || 0) + 1;
      }

      const hours = Number(data.hours);
      if (isNaN(hours) || hours <= 0) return;

      const dob = this.mapDob[data.doerid];
      if (!dob) {
        return;
      }

      const age = this.calculateAgeFromTimestamp(dob);
      if (age === null || age < 0 || age >= 80) return;

      let savedYears = 0;

      if (data.hourtype === 'Day') {
        savedYears = (hours * 365 * (80 - age)) / (24 * 365);
      } else if (data.hourtype === 'Week') {
        savedYears = (hours * 52 * (80 - age)) / (24 * 365);
      }

      if (savedYears > 0) {
        totalSavedYears += savedYears;
        if (data.doerid) {
          doerEIYMap[data.doerid] = (doerEIYMap[data.doerid] || 0) + savedYears;
        }
      }
    });

    this.doerCompletedCount = Object.keys(doerMap).map(doerid => ({
      doerid,
      count: doerMap[doerid]
    }));

    this.doerEIYCount = Object.keys(doerEIYMap)
      .map(doerid => ({
        doerid,
        eiy: doerEIYMap[doerid]
      }))
      .sort((a, b) => b.eiy - a.eiy)
      .slice(0, 10);

    if (Math.floor(totalSavedYears) !== Math.floor(this.previousTotalSavedYears)) {
      this.eiyValueTrigger++;
      this.previousTotalSavedYears = totalSavedYears;
    }

    this.totalSavedYears = totalSavedYears;
    console.log('Processed EIY Count:', this.doerEIYCount.length, 'entries');
    console.log('Total Saved Years calculated:', totalSavedYears);
  }
  
  private calculateAgeFromTimestamp(dob: any): number | null {
    if (!dob || !dob.seconds) return null;
    
    const dobDate = new Date(dob.seconds * 1000);
    const today = new Date();
    
    let age = today.getFullYear() - dobDate.getFullYear();
    const m = today.getMonth() - dobDate.getMonth();
    
    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
      age--;
    }
    
    return age;
  }

  trackByDoerId(index: number, item: any): string {
    return item.doerid;
  }

  trackByHighlightId(index: number, item: any): string {
    return item.id || index.toString();
  }

  testEIYAnimation(): void {
    this.eiyValueTrigger++;
    console.log('EIY Animation triggered:', this.eiyValueTrigger);
  }

  testLeaderboardAnimation(): void {
    if (this.doerCompletedCount.length > 1) {
      const shuffled = [...this.doerCompletedCount];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this.doerCompletedCount = shuffled;
      console.log('Changework Leaderboard shuffled');
    }

    if (this.doerEIYCount.length > 1) {
      const shuffled = [...this.doerEIYCount];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this.doerEIYCount = shuffled;
      console.log('EIY Leaderboard shuffled');
    }
  }

  testRankChange(): void {
    if (this.doerCompletedCount.length > 2) {
      const randomIndex = Math.floor(Math.random() * (this.doerCompletedCount.length - 1)) + 1;
      const boostedDoer = this.doerCompletedCount[randomIndex];
      boostedDoer.count += 10;
      this.doerCompletedCount = [...this.doerCompletedCount].sort((a, b) => b.count - a.count);
      console.log('Boosted doer:', boostedDoer, 'New position will animate');
    }
  }

  testTimer(): void {
    const futureTime = new Date(Date.now() + 2 * 60 * 1000);
    const testTimestamp = Timestamp.fromDate(futureTime);
    
    this.activeTimer = { heading: 'BREAK TIME', time: testTimestamp };
    this.activeAnnouncement = null;
    this.videoAskHighlights = [];
    this.timerEnded = false; // Reset timer ended state
    if (this.highlightInterval) {
      clearTimeout(this.highlightInterval);
      this.highlightInterval = null;
    }
    this.startTimer(testTimestamp);
    console.log('Timer test started: 2 minutes from now');
  }

  private loadHighlights(): void {
    const eventRef = doc(this.firestore, 'event collection', 'PBTh96AJzjXNkBZ5Mw8q');
    const q = query(
      collection(this.firestore, 'arena highlights'),
      where('eventref', '==', eventRef),
      where('available', '==', true)
    );

    collectionData(q, { idField: 'id' })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (docs: any[]) => {
        const sortedDocs = docs.sort((a, b) => {
          const timeA = a.updated?.seconds || 0;
          const timeB = b.updated?.seconds || 0;
          return timeB - timeA;
        });

        const timer = sortedDocs.find(d => d.from === 'timer');
        if (timer && timer.time) {
          this.activeTimer = timer;
          this.activeAnnouncement = null;
          this.videoAskHighlights = [];
          if (this.highlightInterval) {
            clearTimeout(this.highlightInterval);
            this.highlightInterval = null;
          }
          this.startTimer(timer.time);
          return;
        }

        const announcement = sortedDocs.find(d => d.from === 'announcement');
        if (announcement) {
          this.activeTimer = null;
          this.stopTimer();
          this.activeAnnouncement = announcement;
          this.videoAskHighlights = [];
          if (this.highlightInterval) {
            clearTimeout(this.highlightInterval);
            this.highlightInterval = null;
          }
          return;
        }
        this.activeTimer = null;
        this.stopTimer();
        this.activeAnnouncement = null;
        const newHighlights = sortedDocs.filter(d => d.from === 'videoask' || d.from === 'image');
        const highlightsChanged = this.videoAskHighlights.length !== newHighlights.length ||
          newHighlights.some((h, i) => h.id !== this.videoAskHighlights[i]?.id);
        
        if (highlightsChanged) {
          this.videoAskHighlights = newHighlights;
          this.displayedHighlightIndex = 0;
          this.isTransitioning = false;
          this.startHighlightSlideshow();
        }
      },
      error: (error) => {
        console.error('Error loading highlights:', error);
        this.videoAskHighlights = [];
        this.activeAnnouncement = null;
        this.activeTimer = null;
        this.stopTimer();
      }
    });
  }
}