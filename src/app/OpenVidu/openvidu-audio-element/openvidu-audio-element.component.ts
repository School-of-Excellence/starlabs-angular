import { Component, ElementRef, input, viewChild } from '@angular/core';
import { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';

@Component({
  selector: 'app-openvidu-audio-element',
  imports: [],
  templateUrl: './openvidu-audio-element.component.html',
  styleUrl: './openvidu-audio-element.component.css'
})
export class OpenviduAudioElementComponent {
  audioElement = viewChild<ElementRef<HTMLAudioElement>>('audioElement');

  track = input.required<LocalAudioTrack | RemoteAudioTrack>();

  ngAfterViewInit() {
    if (this.audioElement()) {
      const element = this.audioElement()!.nativeElement;
      this.track().attach(element);
      
      // Ensure playback starts (handles autoplay restrictions)
      element.play().catch(err => {
        console.error('Autoplay prevented, will play on user interaction:', err);
      });
    }
  }

  ngOnDestroy() {
    // M10: guard before detach — input.required throws unhandled RuntimeError if read before binding
    try {
      if (this.track) this.track().detach();
    } catch {}
  }
}
