import { Injectable } from '@angular/core';
import { Model, Processor } from '@ai-coustics/aic-sdk';

@Injectable({
  providedIn: 'root'
})
export class AiCousticsService {

  constructor() { }

  private processor: any;
  private isInitialized = false;

  async init(key: string) {
    if (this.isInitialized) return;
    
    // 'quail-l-16khz' is the official recommendation for real-time meetings
    const model = await Model.download('quail-l-16khz', '/assets/aic/');
    this.processor = new Processor(model, key);
    this.isInitialized = true;
  }

  async setupProcessor(licenseKey: string) {
    // 1. Load the "Quail" model (optimized for meetings)
    // The path must match your angular.json output
    const model = await Model.download('quail-l-16khz', '/assets/aic/');
    
    // 2. Initialize the processor with your key
    this.processor = new Processor(model, licenseKey);
    
    // 3. Configure optimal settings for low latency
    const sampleRate = model.getOptimalSampleRate();
    this.processor.initialize(sampleRate, 1, 512, false);
  }

  async createEnhancedStream(rawStream: MediaStream): Promise<MediaStream> {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(rawStream);
    const destination = audioContext.createMediaStreamDestination();

    // The SDK provides a helper to create the Worklet Node
    const aicNode = await this.processor.createAudioWorkletNode(audioContext);
    
    source.connect(aicNode).connect(destination);
    
    return destination.stream;
  }

  async processStream(rawStream: MediaStream): Promise<MediaStream> {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(rawStream);
    const destination = audioContext.createMediaStreamDestination();

    const workletNode = await this.processor.createAudioWorkletNode(audioContext);
    
    source.connect(workletNode).connect(destination);
    return destination.stream;
  }
}
