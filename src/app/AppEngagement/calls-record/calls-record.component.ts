import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Firestore, collection, query, where, orderBy, onSnapshot, Unsubscribe, getDocs } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';

interface AudioState {
  isPlaying: boolean;
  isActive: boolean;
  isMuted: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
}

@Component({
  selector: 'app-calls-record',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCardModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatBadgeModule,
    MatTooltipModule,
    MatSliderModule,
    MatProgressBarModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './calls-record.component.html',
  styleUrl: './calls-record.component.css'
})
export class CallsRecordComponent implements OnInit, OnDestroy {
  displayedColumns: string[] = ['index', 'calledby', 'calledto', 'callstatus', 'duration', 'recording', 'status', 'time'];
  
  allCallsData = [];
  filteredData = [];
  paginatedData = [];
  newRecordIds: Set<string> = new Set();
  
  audioStates: { [key: number]: AudioState } = {};
  profiles = [];
  filteredProfiles = [];
  profileMap = {};
  profileNumberMap = {};
  
  filterForm: FormGroup;
  profileSearchCtrl
  isLoading = false;
  isRealTimeActive = false;
  
  // Pagination
  pageSize = 10;
  pageIndex = 0;
  
  // Sorting
  sortDirection: 'asc' | 'desc' = 'desc';
  sortColumn = 'time';

  // Real-time subscription
  private unsubscribe$ = new Subject<void>();
  private realtimeUnsubscribe: Unsubscribe | null = null;

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore
  ) {
    this.profileSearchCtrl = this.fb.control('');
    this.filterForm = this.fb.group({
      startDate: [this.getDateDaysAgo(7)],
      endDate: [new Date()],
      profile: [''],
      callStatus: [''],
      searchText: ['']
    });

    // Watch for form changes
    this.filterForm.valueChanges.pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(() => {
      this.applyFilters();
    });

    // Watch for profile search changes
    this.profileSearchCtrl.valueChanges.pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(() => {
      this.filterProfiles();
    });
  }

  ngOnInit() {
    this.loadProfiles().then(() => {
      this.loadCallsData();
      this.startRealTimeUpdates();
    });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.stopRealTimeUpdates();
  }

  private getDateDaysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  async loadProfiles() {
    try {
      const profilesQuery = query(collection(this.firestore, 'profile_data'));
      const profileSnapshot = await getDocs(profilesQuery);
      
      this.profiles = [];
      this.profileMap = {};
      this.profileNumberMap = {};
      
      profileSnapshot.docs.forEach((doc: any) => {
        const profileData = doc.data();
        this.profiles.push(profileData);
        this.profileMap[profileData.myoperatorid] = profileData;
        if (profileData.number) {
          this.profileNumberMap[profileData.number] = profileData;
        }
      });
      
      this.filteredProfiles = [...this.profiles];
      console.log('Loaded profiles:', this.profiles.length);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }

  filterProfiles() {
    const searchValue = this.profileSearchCtrl.value?.toLowerCase() || '';
    if (!searchValue) {
      this.filteredProfiles = [...this.profiles];
      return;
    }

    this.filteredProfiles = this.profiles.filter(profile => 
      profile.name.toLowerCase().includes(searchValue) ||
      profile.number.includes(searchValue) ||
      profile.myoperatorid.toLowerCase().includes(searchValue)
    );
  }

  async loadCallsData() {
    const startDate = this.filterForm.get('startDate')?.value || this.getDateDaysAgo(7);
    const endDate = this.filterForm.get('endDate')?.value || new Date();
    
    // Set end date to end of day
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    this.isLoading = true;
    
    try {
      const q = query(
        collection(this.firestore, 'myoperator calls'),
        where("time", ">=", startDate),
        where("time", "<=", endOfDay),
        orderBy("time", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      
      this.allCallsData = [];
      this.audioStates = {};
      
      if (querySnapshot.docs.length > 0) {
        querySnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          this.allCallsData.push(data);
          
          // Initialize audio state for each call
          this.audioStates[index] = {
            isPlaying: false,
            isActive: false,
            isMuted: false,
            progress: 0,
            currentTime: 0,
            duration: 0,
            volume: 1
          };
        });
        
        this.applyFilters();
      } else {
        console.log("No Calls Data Found for the selected date range");
        this.filteredData = [];
        this.updatePaginatedData();
      }
    } catch (error) {
      console.error("Error loading calls:", error);
    } finally {
      this.isLoading = false;
    }
  }

  startRealTimeUpdates() {
    if (this.isRealTimeActive) return;
    
    const startDate = this.filterForm.get('startDate')?.value || this.getDateDaysAgo(7);
    const endDate = this.filterForm.get('endDate')?.value || new Date();
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(this.firestore, 'myoperator calls'),
      where("time", ">=", startDate),
      where("time", "<=", endOfDay),
      orderBy("time", "desc")
    );

    this.realtimeUnsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change:any) => {
        const data = change.doc.data();
        
        if (change.type === 'added') {
          // Check if this is a new record (not in initial load)
          const existingIndex = this.allCallsData.findIndex((call:any) => call.docid === data.docid);
          if (existingIndex === -1) {
            this.allCallsData.unshift(data);
            this.newRecordIds.add(data.docid);
            
            // Initialize audio state
            const newIndex = this.allCallsData.length - 1;
            this.audioStates[newIndex] = {
              isPlaying: false,
              isActive: false,
              isMuted: false,
              progress: 0,
              currentTime: 0,
              duration: 0,
              volume: 1
            };
            
            // Remove new record indicator after 5 seconds
            setTimeout(() => {
              this.newRecordIds.delete(data.docid);
            }, 5000);
          }
        } else if (change.type === 'modified') {
          const index = this.allCallsData.findIndex(call => call.docid === data.docid);
          if (index !== -1) {
            this.allCallsData[index] = data;
          }
        } else if (change.type === 'removed') {
          const index = this.allCallsData.findIndex(call => call.docid === data.docid);
          if (index !== -1) {
            this.allCallsData.splice(index, 1);
            delete this.audioStates[index];
          }
        }
      });

      this.applyFilters();
    });

    this.isRealTimeActive = true;
  }

  stopRealTimeUpdates() {
    if (this.realtimeUnsubscribe) {
      this.realtimeUnsubscribe();
      this.realtimeUnsubscribe = null;
    }
    this.isRealTimeActive = false;
  }

  toggleRealTime() {
    if (this.isRealTimeActive) {
      this.stopRealTimeUpdates();
    } else {
      this.startRealTimeUpdates();
    }
  }

  isNewRecord(row): boolean {
    return this.newRecordIds.has(row.docid);
  }

  setQuickDate(days: number) {
    const endDate = new Date();
    const startDate = this.getDateDaysAgo(days);
    
    this.filterForm.patchValue({
      startDate: startDate,
      endDate: endDate
    });
    
    this.loadCallsData();
    if (this.isRealTimeActive) {
      this.stopRealTimeUpdates();
      this.startRealTimeUpdates();
    }
  }

  isQuickDateActive(days: number): boolean {
    const startDate = this.filterForm.get('startDate')?.value;
    const expectedStart = this.getDateDaysAgo(days);
    
    if (!startDate) return false;
    
    return startDate.getTime() === expectedStart.getTime();
  }

  applyFilters() {
    const filters = this.filterForm.value;
    
    this.filteredData = this.allCallsData.filter(call => {
      let matches = true;
      
      // Profile filter
      if (filters.profile && call.calledby !== filters.profile && call.calledto !== filters.profile) {
        matches = false;
      }
      
      // Call status filter
      if (filters.callStatus && call.callstatus?.toLowerCase() !== filters.callStatus.toLowerCase()) {
        matches = false;
      }
      
      // Search text filter
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        const callerName = this.getProfileName(call.calledby).toLowerCase();
        const calleeName = (this.profileNumberMap[call.calledto]?.name || '').toLowerCase();
        
        matches = matches && (
          call.calledby.includes(searchLower) ||
          call.calledto.includes(searchLower) ||
          callerName.includes(searchLower) ||
          calleeName.includes(searchLower)
        );
      }
      
      return matches;
    });
    
    this.sortData({ active: this.sortColumn, direction: this.sortDirection });
    this.pageIndex = 0;
    this.updatePaginatedData();
  }

  clearFilters() {
    this.filterForm.patchValue({
      profile: '',
      callStatus: '',
      searchText: ''
    });
    this.profileSearchCtrl.setValue('');
  }

  refreshData() {
    this.loadCallsData();
    if (this.isRealTimeActive) {
      this.stopRealTimeUpdates();
      this.startRealTimeUpdates();
    }
  }

  sortData(sort: Sort) {
    if (!sort.active || sort.direction === '') {
      return;
    }

    this.sortColumn = sort.active;
    this.sortDirection = sort.direction as 'asc' | 'desc';

    this.filteredData.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      
      switch (sort.active) {
        case 'calledby':
          return this.compare(this.getProfileName(a.calledby), this.getProfileName(b.calledby), isAsc);
        case 'calledto':
          return this.compare(this.getProfileName(a.calledto), this.getProfileName(b.calledto), isAsc);
        case 'callstatus':
          return this.compare(a.callstatus, b.callstatus, isAsc);
        case 'duration':
          return this.compare(a.duration, b.duration, isAsc);
        case 'status':
          return this.compare(a.status, b.status, isAsc);
        case 'time':
          return this.compare(a.time?.toDate?.() || a.time, b.time?.toDate?.() || b.time, isAsc);
        default:
          return 0;
      }
    });
    
    this.updatePaginatedData();
  }

  private compare(a: any, b: any, isAsc: boolean) {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  onPageChange(event: PageEvent) {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.updatePaginatedData();
  }

  private updatePaginatedData() {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);
  }

  getProfileName(profileId: string): string {
    const profile = this.profileMap[profileId];
    return profile?.name || profileId;
  }

  getStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'received':
        return 'call_received';
      case 'missed':
        return 'call_missed';
      default:
        return 'call';
    }
  }

  getCallStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'answer':
        return 'call_received';
      case 'busy':
        return 'phone_busy';
      case 'cancel':
        return 'call_end';
      default:
        return 'call';
    }
  }

  // Enhanced Audio Control Methods
  toggleAudio(call, index: number) {
    if (!call.recordingurl) return;

    const state = this.audioStates[index];

    if (!state.isActive) {
      // Close any other active audio players
      Object.keys(this.audioStates).forEach(key => {
        const keyNum = +key;
        if (keyNum !== index) {
          this.audioStates[keyNum].isActive = false;
          this.audioStates[keyNum].isPlaying = false;
        }
      });
      
      state.isActive = true;
      
      // Wait for next tick to ensure audio element is rendered
      setTimeout(() => {
        const audioElement = document.querySelector(`#audio-player-${index} audio`) as HTMLAudioElement;
        if (audioElement) {
          audioElement.play();
        }
      }, 100);
    } else {
      this.togglePlayPause(document.querySelector(`#audio-player-${index} audio`) as HTMLAudioElement, index);
    }
  }

  togglePlayPause(audioElement: HTMLAudioElement, index: number) {
    if (!audioElement) return;
    
    const state = this.audioStates[index];
    if (state.isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play();
    }
  }

  skipBackward(audioElement: HTMLAudioElement, index: number) {
    if (audioElement) {
      audioElement.currentTime = Math.max(0, audioElement.currentTime - 10);
    }
  }

  skipForward(audioElement: HTMLAudioElement, index: number) {
    if (audioElement) {
      audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + 10);
    }
  }

  onAudioLoaded(event: any, index: number) {
    const audio = event.target;
    const state = this.audioStates[index];
    if (state && audio.duration) {
      state.duration = audio.duration;
    }
  }

  updateProgress(event: any, index: number) {
    const audio = event.target;
    const state = this.audioStates[index];
    
    if (state && audio.duration) {
      state.currentTime = audio.currentTime;
      state.duration = audio.duration;
      state.progress = (audio.currentTime / audio.duration) * 100;
    }
  }

  onSeekChange(event: any, audioElement: HTMLAudioElement, index: number) {
    if (audioElement && audioElement.duration) {
      const newTime = event.value;
      audioElement.currentTime = newTime;
    }
  }

  seekToPosition(event: MouseEvent, audioElement: HTMLAudioElement, index: number) {
    if (audioElement && audioElement.duration) {
      const progressBar = event.currentTarget as HTMLElement;
      const rect = progressBar.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * audioElement.duration;
      
      audioElement.currentTime = newTime;
    }
  }

  onVolumeChange(event: any, audioElement: HTMLAudioElement, index: number) {
    if (audioElement) {
      const volume = event.value;
      audioElement.volume = volume;
      this.audioStates[index].volume = volume;
      this.audioStates[index].isMuted = volume === 0;
    }
  }

  audioEnded(index: number) {
    const state = this.audioStates[index];
    if (state) {
      state.isPlaying = false;
      state.progress = 0;
      state.currentTime = 0;
    }
  }

  audioPaused(index: number) {
    const state = this.audioStates[index];
    if (state) {
      state.isPlaying = false;
    }
  }

  audioPlayed(index: number) {
    const state = this.audioStates[index];
    if (state) {
      state.isPlaying = true;
    }
  }

  toggleMute(audioElement: HTMLAudioElement, index: number) {
    const state = this.audioStates[index];
    if (audioElement && state) {
      audioElement.muted = !audioElement.muted;
      state.isMuted = audioElement.muted;
    }
  }

  changePlaybackSpeed(speed: string, audioElement: HTMLAudioElement, index: number) {
    if (audioElement) {
      audioElement.playbackRate = parseFloat(speed);
    }
  }

  downloadAudio(url: string, call) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `call-recording-${call.docid}-${this.formatDateTime(call.time, 'date')}.mp3`;
    link.click();
  }

  closeAudio(index: number) {
    const state = this.audioStates[index];
    if (state) {
      state.isActive = false;
      state.isPlaying = false;
      state.progress = 0;
      state.currentTime = 0;
    }
    
    const audioElement = document.querySelector(`#audio-player-${index} audio`) as HTMLAudioElement;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
  }

  formatTime(timeInSeconds: number): string {
    if (!timeInSeconds || isNaN(timeInSeconds)) return '0:00';
    
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatDateTime(timestamp: any, type: 'time' | 'date'): string {
    let date: Date;
    
    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    
    if (type === 'time') {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
  }
}