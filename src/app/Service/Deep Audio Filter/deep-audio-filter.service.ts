import { Injectable } from '@angular/core';
import {
  VoiceFocusDeviceTransformer,
  VoiceFocusTransformDevice,
  VoiceFocusSpec
} from 'amazon-chime-sdk-js';


@Injectable({
  providedIn: 'root'
})
export class DeepAudioFilterService {
  private transformer: VoiceFocusDeviceTransformer | null = null;
  private transformDevice: VoiceFocusTransformDevice | null = null;
  private isSupported = false;


  constructor() { }

  async init(): Promise<boolean> {
    try {
      const spec: VoiceFocusSpec = { variant: 'auto' };

      this.transformer = await VoiceFocusDeviceTransformer.create(spec, {
        preload: false,  // don't load model until needed
        logger: undefined
      });

      this.isSupported = this.transformer.isSupported();
      console.log('✅ Voice Focus supported:', this.isSupported);
      return this.isSupported;

    } catch (err) {
      console.warn('⚠️ Voice Focus not supported on this device:', err);
      return false;
    }
  }

  async processStream(rawStream: MediaStream): Promise<MediaStream> {
    if (!this.transformer || !this.isSupported) {
      console.warn('Voice Focus not available, returning raw stream');
      return rawStream;
    }

    try {
      // Pass device label string or MediaStream — string is most reliable
      const deviceId = rawStream.getAudioTracks()[0]?.getSettings()?.deviceId;
      const device = deviceId ?? rawStream;

      this.transformDevice = await this.transformer
        .createTransformDevice(device as any);

      if (!this.transformDevice) {
        console.warn('Transform device creation failed');
        return rawStream;
      }

      // Get the processed audio stream
      const processedStream = await this.transformDevice
        .intrinsicDevice() as unknown as MediaStream;

      if (!processedStream || !processedStream.getAudioTracks) {
        return rawStream;
      }

      // Merge processed audio + original video (if any)
      const outputStream = new MediaStream();
      processedStream.getAudioTracks().forEach(t => outputStream.addTrack(t));
      rawStream.getVideoTracks().forEach(t => outputStream.addTrack(t));

      console.log('✅ Voice Focus applied successfully');
      return outputStream;

    } catch (err) {
      console.error('❌ Voice Focus processing failed:', err);
      return rawStream; // graceful fallback
    }
  }

  isActive(): boolean {
    return this.isSupported && this.transformDevice !== null;
  }

  destroy(): void {
    try {
      this.transformDevice?.stop();
    } catch (_) {}
    this.transformDevice = null;
    this.transformer = null;
    this.isSupported = false;
  }
}


