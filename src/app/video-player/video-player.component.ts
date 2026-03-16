import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-video-player',
  imports: [],
  template: `
  <div *ngIf="videoUrl" class="video-container">
    <ng-container [ngSwitch]="videoType">
      <video *ngSwitchCase="'direct'" controls>
        <source [src]="videoUrl" type="video/mp4">
      </video>
      <iframe *ngSwitchCase="'drive'"
         [src]="safeUrl"
         frameborder="0"
         allowfullscreen>
      </iframe>
    </ng-container>
  </div>
`,
  templateUrl: './video-player.component.html',
  styles: [`
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
  `],
  styleUrl: './video-player.component.css'
})
export class VideoPlayerComponent {
  @Input() videoUrl: string;
  videoType: 'direct' | 'drive' = 'direct';
  safeUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    if (this.videoUrl) {
      this.processVideoUrl();
    }
  }

  ngOnInit() {
  
  }

  private processVideoUrl() {
    if (this.isGoogleDriveUrl(this.videoUrl)) {
      this.videoType = 'drive';
      const fileId = this.extractGoogleDriveFileId(this.videoUrl);
      if (fileId) {
        const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
      }
    } else {
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
}
