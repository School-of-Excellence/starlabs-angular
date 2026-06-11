// video-player.component.ts
import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-video-player',
  template: `
    <div *ngIf="videoUrl" class="video-wrapper">
      <p *ngIf="isLoading" class="loading-text">🎬 Getting your video ready! Large videos can take a few moments to load.</p>
      <div class="video-container">
        <ng-container [ngSwitch]="videoType">
        <video *ngSwitchCase="'direct'" controls preload="metadata" (loadeddata)="isLoading = false" (error)="isLoading = false">           
         <source [src]="videoUrl" type="video/mp4">
        </video>
          <iframe *ngSwitchCase="'drive'"
             [src]="safeUrl"
             frameborder="0"
             allowfullscreen
             (load)="isLoading = false">
          </iframe>
          <div *ngSwitchCase="'dropbox'" class="dropbox-fallback">
            <video
              [src]="getDropboxDirectUrl(videoUrl)"
              controls
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              preload="metadata"
              (contextmenu)="$event.preventDefault()"
              (loadeddata)="isLoading = false"
              (error)="isLoading = false"
              width="100%"
              height="500">
              Your browser does not support the video tag.
            </video>
          </div>
        </ng-container>
      </div>
    </div>
  `,
  imports: [CommonModule],
  styles: [`
    .video-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .video-container {
      width: 320px;
      height: 180px;
      border-radius: 15px;
    }
    video, iframe {
      width: 100%;
      height: 100%;
      border-radius: 15px;
    }
    .dropbox-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #1a1919ff;
      border-radius: 15px;
      padding: 20px;
    }
    .play-link {
      background-color: #0061ff;
      color: white;
      padding: 10px 20px;
      text-decoration: none;
      border-radius: 5px;
      cursor: pointer;          
      display: inline-block; 
      font-weight: bold;
    }
    .play-link:hover {
      background-color: #0051d5;
    }
    .loading-text {
      color: #111010;
      font-size: 14px;
      text-align: center;
      margin: 0 0 6px 0;
      padding: 0 8px;
    }
  `]
})
export class VideoPlayerComponent implements OnInit {
  @Input() videoUrl: string;
  videoType: 'direct' | 'drive' | 'dropbox' = 'direct';
  safeUrl: SafeResourceUrl;
  dropboxDirectUrl: string;
  isLoading: boolean = true;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    if (this.videoUrl) {
      this.processVideoUrl();
    }
  }     

  private processVideoUrl() {
    if (this.isGoogleDriveUrl(this.videoUrl)) {
      this.videoType = 'drive';
      const fileId = this.extractGoogleDriveFileId(this.videoUrl);
      if (fileId) {
        const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
      }
    }
    else if (this.isDropboxUrl(this.videoUrl)) {
      this.videoType = 'dropbox';
      const directUrl = this.convertDropboxUrlToDirect(this.videoUrl);
      this.dropboxDirectUrl = directUrl;
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(directUrl);
    }
    else {
      this.videoType = 'direct';
    }
  }

  private isGoogleDriveUrl(url: string): boolean {
    return url.includes('drive.google.com');
  }

  private extractGoogleDriveFileId(url: string): string | null {
    const matches = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return matches ? matches[1] : null;
  }

  private isDropboxUrl(url: string): boolean {
    return url.includes('dropbox.com');
  }

  getDropboxDirectUrl(url: string): string {    
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace('?dl=0', '?raw=1')
    .replace('?dl=1', '?raw=1'); 
  }

  private convertDropboxUrlToDirect(url: string): string {
    let directUrl = url;
    if (url.includes('/scl/')) {
      directUrl = directUrl.replace(/[?&]dl=[01]/, '');
      const separator = directUrl.includes('?') ? '&' : '?';
      directUrl += `${separator}raw=1`;
    }
    else {
      if (directUrl.includes('dl=0')) {
        directUrl = directUrl.replace('dl=0', 'dl=1');
      } else if (!directUrl.includes('dl=1')) {
        const separator = directUrl.includes('?') ? '&' : '?';
        directUrl += `${separator}dl=1`;
      }
    }
    return directUrl;
  }

  openDropboxInNewTab() {
    if (this.videoUrl) {
      console.log('Opening Dropbox URL:', this.videoUrl);
      window.open(this.videoUrl, '_blank');
    }
  }
}

// import { Component, Input, OnInit, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
// import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

// @Component({
//   selector: 'app-video-player',
//   template: `
//     <div *ngIf="videoUrl" class="video-container" [class.disabled]="isDisabled">
//       <ng-container [ngSwitch]="videoType">
//         <video #videoElement
//                *ngSwitchCase="'direct'" 
//                [controls]="true"
//                controlsList="nodownload noseek noremoteplayback novolume"
//                disablePictureInPicture
//                [disabled]="isDisabled"
//                (ended)="onVideoEnd()">
//           <source [src]="videoUrl" type="video/mp4">
//         </video>
//         <iframe #iframeElement
//           *ngSwitchCase="'drive'"
//           [src]="safeUrl"
//           frameborder="0"
//           allowfullscreen
//           controls="0"
//           [attr.aria-disabled]="isDisabled">
//         </iframe>
//       </ng-container>
//       <div *ngIf="isDisabled" class="overlay">
//         <span class="disabled-message">Please watch the previous video first</span>
//       </div>
      
//       <!-- For Google Drive videos, add a completion button -->
//       <button *ngIf="videoType === 'drive' && !isDisabled && !isWatched"
//               class="mark-watched-button"
//               (click)="manuallyMarkAsWatched()">
//         Mark as Watched
//       </button>
      
//       <!-- Custom play/pause for styling consistency (optional) -->
//       <div *ngIf="false && !isDisabled && videoType === 'direct'" class="video-controls">
//         <button class="video-control-button" (click)="playPauseVideo()">
//           {{isPlaying ? 'Pause' : 'Play'}}
//         </button>
//       </div>
//     </div>
//   `,
//   styles: [`
//     .video-container {
//       width: 320px;
//       height: 180px;
//       // max-width: 640px;
//       // aspect-ratio: 16 / 9;
//       border-radius: 15px;
//       position: relative;
//     }
//     video, iframe {
//       width: 100%;
//       height: 100%;
//       border-radius: 15px;
//     }
//     .disabled video, .disabled iframe {
//       opacity: 0.6;
//       pointer-events: none;
//     }
//     .overlay {
//       position: absolute;
//       top: 0;
//       left: 0;
//       width: 100%;
//       height: 100%;
//       display: flex;
//       align-items: center;
//       justify-content: center;
//       background-color: rgba(0, 0, 0, 0.5);
//       border-radius: 15px;
//       z-index: 10;
//     }
//     .disabled-message {
//       color: white;
//       font-weight: bold;
//       padding: 10px;
//       background-color: rgba(0, 0, 0, 0.6);
//       border-radius: 5px;
//       text-align: center;
//     }
//     .mark-watched-button {
//       position: absolute;
//       bottom: 10px;
//       right: 10px;
//       background-color: rgba(0, 0, 0, 0.7);
//       color: white;
//       border: none;
//       border-radius: 4px;
//       padding: 5px 8px;
//       font-size: 12px;
//       cursor: pointer;
//       z-index: 5;
//     }
//     .mark-watched-button:hover {
//       background-color: rgba(50, 50, 50, 0.9);
//     }
    
//     .video-controls {
//       position: absolute;
//       bottom: 0;
//       left: 0;
//       width: 100%;
//       background-color: rgba(0, 0, 0, 0.6);
//       padding: 5px;
//       border-bottom-left-radius: 15px;
//       border-bottom-right-radius: 15px;
//       z-index: 5;
//     }
    
//     .video-control-button {
//       background-color: #4285f4;
//       color: white;
//       border: none;
//       border-radius: 4px;
//       padding: 5px 10px;
//       font-size: 12px;
//       cursor: pointer;
//       margin-right: 10px;
//     }
    
//     .progress-container {
//       height: 5px;
//       background-color: #555;
//       border-radius: 3px;
//       margin-top: 5px;
//       overflow: hidden;
//     }
    
//     .progress-bar {
//       height: 100%;
//       background-color: #4285f4;
//       width: 0%;
//       transition: width 0.2s;
//     }
//   `]
// })
// export class VideoPlayerComponent implements OnInit, AfterViewInit, OnDestroy {
//   @Input() videoUrl: string;
//   @Input() isDisabled: boolean = false;
//   @Input() videoId: number;
//   @Output() videoCompleted = new EventEmitter<number>();
  
//   @ViewChild('videoElement') videoElement: ElementRef;
//   @ViewChild('iframeElement') iframeElement: ElementRef;
  
//   videoType: 'direct' | 'drive' = 'direct';
//   safeUrl: SafeResourceUrl;
//   isWatched: boolean = false;
//   isPlaying: boolean = false;
//   progressPercentage: number = 0;
//   watchThreshold: number = 0.95; // Consider video watched after 95% completion
//   private timeUpdateInterval: any;

//   constructor(private sanitizer: DomSanitizer) {}

//   ngOnInit() {
//     if (this.videoUrl) {
//       this.processVideoUrl();
//     }
//     console.log(`Video ${this.videoId} initialized with URL: ${this.videoUrl}`);
//   }

//   ngAfterViewInit() {
//     if (this.videoType === 'direct' && this.videoElement) {
//       // Set up the timeupdate listener for direct videos
//       const video = this.videoElement.nativeElement;
//       video.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
//       video.addEventListener('play', () => { this.isPlaying = true; });
//       video.addEventListener('pause', () => { this.isPlaying = false; });
//       video.addEventListener('seeking', this.preventSeeking.bind(this));
//       console.log(`Event listeners added to video ${this.videoId}`);
      
//       // Auto-play if not disabled and it's the first video
//       if (!this.isDisabled && this.videoId === 0) {
//         setTimeout(() => {
//           this.playVideo();
//         }, 1000);
//       }
//     }
//   }
  
//   playPauseVideo() {
//     if (this.videoType === 'direct' && this.videoElement) {
//       const video = this.videoElement.nativeElement;
//       if (video.paused) {
//         this.playVideo();
//       } else {
//         this.pauseVideo();
//       }
//     }
//   }
  
//   playVideo() {
//     if (this.videoType === 'direct' && this.videoElement) {
//       const video = this.videoElement.nativeElement;
//       video.play().catch(error => {
//         console.error(`Error playing video ${this.videoId}:`, error);
//       });
//     }
//   }
  
//   pauseVideo() {
//     if (this.videoType === 'direct' && this.videoElement) {
//       const video = this.videoElement.nativeElement;
//       video.pause();
//     }
//   }
  
//   preventSeeking(event: any) {
//     if (!this.isWatched && this.videoElement) {
//       const video = this.videoElement.nativeElement;
//       const lastTime = parseFloat(video.getAttribute('data-last-time') || '0');
      
//       // If they're trying to seek ahead, prevent it
//       if (video.currentTime > lastTime + 2) {
//         console.log('Seeking prevented');
//         video.currentTime = lastTime;
//       }
//     }
//   }

//   ngOnDestroy() {
//     // Clean up event listeners
//     if (this.videoType === 'direct' && this.videoElement) {
//       const video = this.videoElement.nativeElement;
//       video.removeEventListener('timeupdate', this.handleTimeUpdate.bind(this));
//     }
    
//     // Clear any intervals
//     if (this.timeUpdateInterval) {
//       clearInterval(this.timeUpdateInterval);
//     }
//   }

//   private processVideoUrl() {
//     if (this.isGoogleDriveUrl(this.videoUrl)) {
//       this.videoType = 'drive';
//       const fileId = this.extractGoogleDriveFileId(this.videoUrl);
//       if (fileId) {
//         const embedUrl = `https://drive.google.com/file/d/${fileId}/preview?usp=sharing&embedded=true&rm=minimal&chrome=false`;
//         this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
//       }
//     } else {
//       this.videoType = 'direct';
//     }
//   }

//   handleTimeUpdate(event: any) {
//     const video = event.target;
//     const percentWatched = video.currentTime / video.duration;
    
//     // Prevent seeking by forcing currentTime if someone tries to skip ahead
//     if (this.videoElement && !this.isWatched) {
//       const videoEl = this.videoElement.nativeElement;
//       const lastPlayedTime = videoEl.getAttribute('data-last-time') || 0;
      
//       // If they've skipped ahead too far (more than 2 seconds), reset
//       if (videoEl.currentTime > parseFloat(lastPlayedTime) + 2) {
//         videoEl.currentTime = parseFloat(lastPlayedTime);
//       } else {
//         // Otherwise, update the last played time
//         videoEl.setAttribute('data-last-time', videoEl.currentTime);
//       }
//     }
    
//     // Update progress tracking
//     this.progressPercentage = Math.round(percentWatched * 100);
    
//     // If video is watched beyond the threshold, mark as watched
//     if (!this.isWatched && percentWatched >= this.watchThreshold) {
//       this.markAsWatched();
//     }
//   }

//   onVideoEnd() {
//     console.log(`Video ${this.videoId} ended event fired`);
//     this.markAsWatched();
//   }
  
//   manuallyMarkAsWatched() {
//     console.log(`Video ${this.videoId} manually marked as watched`);
//     this.markAsWatched();
//   }
  
//   private markAsWatched() {
//     if (!this.isWatched) {
//       this.isWatched = true;
//       console.log(`Emitting videoCompleted event for video ${this.videoId}`);
//       this.videoCompleted.emit(this.videoId);
//     }
//   }

//   private isGoogleDriveUrl(url: string): boolean {
//     return url.includes('drive.google.com');
//   }

//   private extractGoogleDriveFileId(url: string): string | null {
//     const matches = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
//     return matches ? matches[1] : null;
//   }
// }