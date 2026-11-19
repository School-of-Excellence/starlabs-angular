import { Component, ElementRef, input, output, viewChild } from '@angular/core';
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
  // The browser refused to start this sound without a tap (autoplay rule, mainly Safari /
  // iPhone). The call screen shows "Tap to enable sound" — 2026-11-14 plan item 2.2.
  playbackBlocked = output<void>();

  ngAfterViewInit() {
    if (this.audioElement()) {
      const element = this.audioElement()!.nativeElement;
      this.track().attach(element);
      
      // Ensure playback starts (handles autoplay restrictions)
      element.play().catch(err => {
        console.warn('Autoplay prevented — asking the user to tap to enable sound:', err);
        if (err?.name === 'NotAllowedError') this.playbackBlocked.emit();
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
