import { CommonModule } from '@angular/common';
import { Component, Inject, ChangeDetectorRef } from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { collection, collectionSnapshots, arrayUnion, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch, getDoc } from '@angular/fire/firestore';

interface VideoProgress {
  videoId: string;
  currentTime: number;
  duration: number;
  completed: boolean;
  watchedDuration: number;
  lastUpdated: number;
  activityId: string;
  assignmentId: string;
}

interface ActiveVideoState {
  videoId: string;
  lastValidTime: number;
  element: HTMLVideoElement;
}

@Component({
  selector: 'app-watch-videos',
  standalone: true,
  imports: [
    CommonModule,
    MatSnackBarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatDialogModule
  ],
  templateUrl: './watch-videos.component.html',
  styleUrl: './watch-videos.component.css'
})
export class WatchVideosComponent {

  videos: any[] = [];
  playedVideos = new Set<string>();
  allCompleted = false;
  currentPlayingIndex = -1;
  isLoading = true;
  private activityId: string;
  private assignmentId: string;
  private activeVideoState: ActiveVideoState | null = null;
  private progressInterval: any;
  private minWatchPercentage = 95;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<WatchVideosComponent>,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {
    console.log(this.data);
    // console.log(localStorage.clear());

    this.activityId = this.data.activity.id;
    this.assignmentId = this.data.activity.participantAssignmentId;
  }

  async ngOnInit() {
    try {
      for (let ref of this.data.activity['selectedvideos']) {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          let id = snap.id;
          let data = snap.data();
          data['id'] = id;
          this.videos.push(data);
        }
      }
      this.loadAllProgress();
      this.isLoading = false;
    } catch (error) {
      console.error('Error loading videos:', error);
      this.snackBar.open('Error loading videos', 'Close', { duration: 3000 });
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    this.cleanupVideo();
  }

  // Generate unique storage key for each video
  private getVideoStorageKey(videoId: string): string {
    return `video_progress_${this.activityId}_${videoId}`;
  }

  // Load progress for all videos
  private loadAllProgress() {
    this.playedVideos.clear();

    for (const video of this.videos) {
      const progress = this.getVideoProgress(video.id);
      if (progress && progress.completed === true) {
        this.playedVideos.add(video.id);
      }
    }

    this.allCompleted = this.playedVideos.size === this.videos.length;

    console.log('Loaded all progress:', {
      playedVideos: Array.from(this.playedVideos),
      totalVideos: this.videos.length,
      allCompleted: this.allCompleted
    });
  }

  // Save progress for a specific video in its own localStorage entry
  private saveVideoProgress(videoId: string, currentTime: number, duration: number, completed: boolean = false) {
    try {
      const storageKey = this.getVideoStorageKey(videoId);
      const existingProgress = this.getVideoProgress(videoId);

      // Calculate watched duration - take the maximum of what was previously watched
      // and the current time to handle seeking backward
      const watchedDuration = completed
        ? duration
        : Math.max(existingProgress?.watchedDuration || 0, currentTime);

      const progress: VideoProgress = {
        videoId,
        currentTime,
        duration,
        completed,
        watchedDuration,
        lastUpdated: Date.now(),
        activityId: this.activityId,
        assignmentId: this.assignmentId
      };

      localStorage.setItem(storageKey, JSON.stringify(progress));

      console.log(`Saved progress for video ${videoId}:`, {
        currentTime: Math.round(currentTime),
        duration: Math.round(duration),
        watchedDuration: Math.round(watchedDuration),
        completed,
        percentage: Math.round((watchedDuration / duration) * 100)
      });
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  }

  // Get progress for a specific video from its own localStorage entry
  private getVideoProgress(videoId: string): VideoProgress | null {
    try {
      const storageKey = this.getVideoStorageKey(videoId);
      const stored = localStorage.getItem(storageKey);

      if (stored) {
        const progress = JSON.parse(stored) as VideoProgress;
        // Validate that the progress belongs to this activity
        if (progress.activityId === this.activityId && progress.videoId === videoId) {
          return progress;
        }
      }
    } catch (error) {
      console.error('Error getting progress:', error);
    }
    return null;
  }

  // Get progress percentage for a specific video
  getVideoProgressPercentage(videoId: string): number {
    const progress = this.getVideoProgress(videoId);

    if (!progress || !progress.duration || progress.duration === 0) {
      return 0;
    }

    if (progress.completed === true) {
      return 100;
    }

    const percentage = Math.min(100, (progress.watchedDuration / progress.duration) * 100);
    return Math.round(percentage);
  }

  isVideoWatched(index: number): boolean {
    if (index < 0 || index >= this.videos.length) return false;

    const videoId = this.videos[index]?.id;
    const progress = this.getVideoProgress(videoId);

    return this.playedVideos.has(videoId) && progress?.completed === true;
  }

  canPlayVideo(index: number): boolean {
    if (index === 0) return true;
    if (index < 0 || index >= this.videos.length) return false;
    return this.isVideoWatched(index - 1);
  }

  async playVideo(video: any, index: number) {
    if (!this.canPlayVideo(index)) {
      this.snackBar.open('Please watch the previous video first', 'Close', { duration: 3000, panelClass: ['custom-snackbar'] });
      return;
    }

    if (this.playedVideos.has(video.id)) {
      this.snackBar.open('You have already completed this video', 'Close', { duration: 2000, panelClass: ['custom-snackbar'] });
      return;
    }

    // Clean up any existing video
    this.cleanupVideo();
    let maxAllowedPx = 0;

    this.currentPlayingIndex = index;
    const savedProgress = this.getVideoProgress(video.id);

    const videoElement = document.createElement('video');
    videoElement.src = video.url;
    videoElement.controls = true;
    videoElement.disablePictureInPicture = true;
    videoElement.setAttribute('controlsList', 'nodownload');
    videoElement.style.position = 'fixed';
    videoElement.style.top = '0';
    videoElement.style.left = '0';
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.backgroundColor = '#000';
    videoElement.style.zIndex = '9999';
    videoElement.style.objectFit = 'contain';

    // Initialize active video state with this specific video
    this.activeVideoState = {
      videoId: video.id,
      lastValidTime: savedProgress?.currentTime || 0,
      element: videoElement,
    };

    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '90%';
    overlay.style.zIndex = '10000';
    overlay.style.pointerEvents = 'none';

    // Create control blocker
    const controlBlocker = document.createElement('div');
    controlBlocker.style.position = 'absolute';
    controlBlocker.style.bottom = '0';
    controlBlocker.style.right = '0';
    controlBlocker.style.width = '98%';
    controlBlocker.style.height = '50px';
    controlBlocker.style.zIndex = '10001';
    controlBlocker.style.cursor = 'not-allowed';
    controlBlocker.style.transition = 'width 0.1s linear';

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕ Close';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '20px';
    closeButton.style.right = '20px';
    closeButton.style.zIndex = '10002';
    closeButton.style.padding = '10px 20px';
    closeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '5px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '16px';
    closeButton.style.pointerEvents = 'auto';

    closeButton.addEventListener('click', () => {
      this.handleVideoClose(video.id, false);
    });

    overlay.appendChild(closeButton);
    document.body.appendChild(videoElement);
    document.body.appendChild(overlay);
    document.body.appendChild(controlBlocker);

    // Load saved progress
    videoElement.addEventListener('loadedmetadata', () => {
      if (savedProgress && savedProgress.currentTime && !savedProgress.completed) {
        videoElement.currentTime = savedProgress.currentTime;
        this.snackBar.open(`Resuming from ${this.formatTime(savedProgress.currentTime)}`, 'Close', { duration: 2000, panelClass: ['custom-snackbar'] });
      }

      // Update lastValidTime after metadata is loaded
      if (this.activeVideoState && this.activeVideoState.videoId === video.id) {
        this.activeVideoState.lastValidTime = savedProgress?.currentTime || 0;
      }
    });

    // Prevent seeking forward - specific to this video
    videoElement.addEventListener('timeupdate', () => {
      // Ensure we're still playing the same video
      if (!this.activeVideoState || this.activeVideoState.videoId !== video.id) {
        return;
      }

      const currentTime = videoElement.currentTime;
      const duration = videoElement.duration;

      const rect = videoElement.getBoundingClientRect();
      const width = rect.width;

      const progressPx = (videoElement.currentTime / videoElement.duration) * width;

      maxAllowedPx = Math.max(maxAllowedPx, progressPx);

      const remainingPx = width - maxAllowedPx;

      controlBlocker.style.width = `${remainingPx}px`;

      // Allow seeking backward, but not forward beyond watched point
      if (currentTime > this.activeVideoState.lastValidTime + 1) {
        videoElement.currentTime = this.activeVideoState.lastValidTime;
        this.snackBar.open('⚠️ You cannot skip ahead. Please watch the video completely.', 'Close', { duration: 2000, panelClass: ['custom-snackbar'] });
      } else {
        this.activeVideoState.lastValidTime = Math.max(this.activeVideoState.lastValidTime, currentTime);
      }
    });

    // Save progress periodically - only for this specific video
    this.progressInterval = setInterval(() => {
      if (this.activeVideoState &&
        this.activeVideoState.videoId === video.id &&
        this.currentPlayingIndex === index) {

        const currentTime = videoElement.currentTime;
        const duration = videoElement.duration;

        if (!isNaN(currentTime) && !isNaN(duration) && duration > 0) {
          this.saveVideoProgress(video.id, currentTime, duration, false);
          this.cdr.detectChanges();
        }
      }
    }, 2000);

    // Play video - handle the promise properly
    const playPromise = videoElement.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('Video started playing successfully');
        })
        .catch(err => {
          // Only show error if it's not an abort error from cleanup
          if (err.name !== 'AbortError') {
            console.error('Error playing video:', err);
            this.snackBar.open('Error playing video', 'Close', { duration: 3000 });
            this.cleanupVideo();
          } else {
            console.log('Play was aborted (expected during cleanup)');
          }
        });
    }

    // Handle video ended
    videoElement.addEventListener('ended', () => {
      this.handleVideoComplete(video.id);
    });

    // Prevent context menu
    videoElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Handle user leaving the page
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.activeVideoState && this.currentPlayingIndex !== -1) {
      const videoElement = this.activeVideoState.element;
      this.saveVideoProgress(
        this.activeVideoState.videoId,
        videoElement.currentTime,
        videoElement.duration,
        false
      );
    }
  }

  private handleVideoComplete(videoId: string) {
    if (!this.activeVideoState || this.activeVideoState.videoId !== videoId) {
      console.warn('Video completion called for wrong video');
      return;
    }

    const videoElement = this.activeVideoState.element;
    const duration = videoElement.duration;
    const currentTime = videoElement.currentTime;
    const existingProgress = this.getVideoProgress(videoId);
    const watchedDuration = existingProgress?.watchedDuration || currentTime;
    const watchedPercentage = (watchedDuration / duration) * 100;

    console.log('Video completion check:', {
      videoId: videoId,
      watchedPercentage: watchedPercentage.toFixed(2),
      minRequired: this.minWatchPercentage,
      duration: duration.toFixed(2),
      watchedDuration: watchedDuration.toFixed(2)
    });

    if (watchedPercentage >= this.minWatchPercentage) {
      // Mark as completed
      this.saveVideoProgress(videoId, duration, duration, true);
      this.playedVideos.add(videoId);
      this.allCompleted = this.playedVideos.size === this.videos.length;

      const video = this.videos.find(v => v.id === videoId);
      console.log('Video marked as complete:', {
        videoId: videoId,
        title: video?.title,
        playedVideos: Array.from(this.playedVideos),
        allCompleted: this.allCompleted
      });

      this.snackBar.open(`✓ "${video?.title || 'Video'}" completed`, 'Close', { duration: 2000 });

      if (this.allCompleted) {
        this.snackBar.open('🎉 All videos completed!', 'Close', { duration: 3000 });
      }
    } else {
      this.snackBar.open(`Please watch at least ${this.minWatchPercentage}% of the video`, 'Close', { duration: 3000 });
    }

    this.cleanupVideo();
    this.cdr.detectChanges();
  }

  private handleVideoClose(videoId: string, completed: boolean) {
    if (this.activeVideoState && this.activeVideoState.videoId === videoId) {
      const videoElement = this.activeVideoState.element;
      this.saveVideoProgress(videoId, videoElement.currentTime, videoElement.duration, completed);
    }
    this.cleanupVideo();
  }

  private cleanupVideo() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    if (this.activeVideoState) {
      const videoElement = this.activeVideoState.element;

      if (videoElement && document.body.contains(videoElement)) {
        videoElement.pause();
        document.body.removeChild(videoElement);
      }

      this.activeVideoState = null;
    }

    // Remove overlay and control blocker
    const overlays = document.querySelectorAll('div[style*="z-index: 10000"], div[style*="z-index: 10001"]');
    overlays.forEach(overlay => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    });

    this.currentPlayingIndex = -1;
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getProgress(): number {
    return (this.playedVideos.size / this.videos.length) * 100;
  }

  completeAssignment() {
    if (this.allCompleted) {
      this.dialogRef.close({ completed: true });
    }
  }

  // Optional: Clear all video progress for this activity
  private clearAllVideoProgress() {
    for (const video of this.videos) {
      const storageKey = this.getVideoStorageKey(video.id);
      localStorage.removeItem(storageKey);
    }
    console.log('Cleared all video progress for activity:', this.activityId);
  }

  closeDialog() {
    const completedCount = this.playedVideos.size;
    const totalVideos = this.videos.length;

    console.log('Close dialog check:', {
      completedCount,
      totalVideos,
      allCompleted: this.allCompleted,
      playedVideos: Array.from(this.playedVideos)
    });

    if (completedCount > 0 && completedCount < totalVideos) {
      const confirmClose = confirm(`You have completed ${completedCount} out of ${totalVideos} videos. Your progress will be saved. Are you sure you want to close?`);
      if (!confirmClose) return;
    }

    this.cleanupVideo()
    this.dialogRef.close({ completed: this.allCompleted });
  }

  async updateAssignmentStatus(status) {

    updateDoc(doc(this.firestore, "big participants assignments", this.assignmentId), {
      status: status,
    }).then(() => {
      console.log("Status :", status);
      this.dialogRef.close();
    }).catch(err => {
      console.log(err);
      this.dialogRef.close();
    });

  }

}