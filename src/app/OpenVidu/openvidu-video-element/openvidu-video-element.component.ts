import { CommonModule } from '@angular/common';
import { Component, ElementRef, input, viewChild, OnChanges, SimpleChanges } from '@angular/core';
import { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

import { FaceMesh } from '@mediapipe/face_mesh';
import { Results } from '@mediapipe/face_mesh';
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: 'app-openvidu-video-element',
  imports: [CommonModule],
  templateUrl: './openvidu-video-element.component.html',
  styleUrl: './openvidu-video-element.component.css'
})
export class OpenviduVideoElementComponent implements OnChanges {
  videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');

  track = input.required<LocalVideoTrack | RemoteVideoTrack>();
  participantIdentity = input.required<string>();

  private faceMesh!: FaceMesh;
  private scanningStarted = false;

  ngAfterViewInit() {
    // Only run if track is already present
    if (this.track()) {
      this.attachAndStart();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // Skip first change to prevent double init
    if (changes['track'] && !changes['track'].firstChange) {
      this.attachAndStart();
    }
  }

  private attachAndStart() {
    const video = this.videoElement()?.nativeElement;
    if (!video) return;

    try {
      this.track().detach();
    } catch {}

    this.track().attach(video);

    // Mirror if local video
    if (this.track() instanceof LocalVideoTrack) {
      video.style.transform = 'scaleX(-1)'; // horizontal flip
    } else {
      video.style.transform = 'none'; // remote video stays normal
    }

    // if (!this.faceMesh) {
    //   this.initFaceMesh();
    // }

    // if (!this.scanningStarted) {
    //   this.scanningStarted = true;
    //   this.scanFrame();
    // }
  }

  ngOnDestroy() {
    try {
      this.track().detach();
    } catch {}
  }

  private initFaceMesh() {
    this.faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.faceMesh.onResults((res: Results) => this.onFaceDetected(res));
  }

  private scanFrame = async () => {
    const video = this.videoElement()?.nativeElement;
    if (!video) return;

    // 🔥 Prevent WASM abort — remote video not ready yet
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestAnimationFrame(this.scanFrame);
      return;
    }

    try {
      await this.faceMesh.send({ image: video });
    } catch (e) {
      // Prevent fatal crashes from WASM
      console.warn("FaceMesh error:", e);
    }

    requestAnimationFrame(this.scanFrame);
  };

  private onFaceDetected(results: Results) {
    const video = this.videoElement()?.nativeElement;
    if (!video) return;

    if (!results.multiFaceLandmarks?.length) {
      video.style.transform = 'scale(1)';
      return;
    }

    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = video.clientWidth / video.clientHeight;

    const isCutting = Math.abs(videoAspect - containerAspect) > 0.01;

    if (!isCutting) {
      video.style.transform = 'scale(1)';
      return;
    }

    const face = results.multiFaceLandmarks[0];

    const xs = face.map((p) => p.x);
    const ys = face.map((p) => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const faceWidth = maxX - minX;

    const zoom = Math.min(1.1, 0.6 / faceWidth);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    video.style.transformOrigin = `${cx * 100}% ${cy * 100}%`;
    video.style.transform = `scale(${zoom})`;
  }
}
