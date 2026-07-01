import { TrackProcessor, Track, AudioProcessorOptions } from 'livekit-client';

interface AssetConfig {
    cdnUrl?: string;
    version?: string;
}
interface AssetUrls {
    wasm: string;
    model: string;
}

interface DeepFilterNet3ProcessorConfig {
    sampleRate?: number;
    noiseReductionLevel?: number;
    assetConfig?: AssetConfig;
}
interface DeepFilterNoiseFilterOptions {
    sampleRate?: number;
    frameSize?: number;
    enableNoiseReduction?: boolean;
    noiseReductionLevel?: number;
    assetConfig?: AssetConfig;
    enabled?: boolean;
    /** Post-DFN makeup gain (voice normalization). 1.0 = none; default 1.2 (~+1.6 dB). */
    makeupGain?: number;
    /** Enable the post-DFN level gate (removes background voices in the speaker's silences/gaps). */
    gateEnabled?: boolean;
    /** Gate open threshold in dBFS (default -45). Higher gates more aggressively. */
    gateThresholdDb?: number;
}

declare class DeepFilterNet3Core {
    private assetLoader;
    private assets;
    private workletNode;
    private isInitialized;
    private bypassEnabled;
    lastStats: {
        calls: number;
        underruns: number;
        framesOut: number;
    } | null;
    private config;
    constructor(config?: DeepFilterNet3ProcessorConfig);
    initialize(): Promise<void>;
    createAudioWorkletNode(audioContext: AudioContext): Promise<AudioWorkletNode>;
    setSuppressionLevel(level: number): void;
    setPostFilterBeta(beta: number): void;
    setGateEnabled(enabled: boolean): void;
    setGateThreshold(db: number): void;
    destroy(): void;
    isReady(): boolean;
    setNoiseSuppressionEnabled(enabled: boolean): void;
    isNoiseSuppressionEnabled(): boolean;
    private ensureInitialized;
}

declare class DeepFilterNoiseFilterProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
    name: string;
    processedTrack?: MediaStreamTrack;
    audioContext: AudioContext | null;
    private ownsContext;
    sourceNode: MediaStreamAudioSourceNode | null;
    workletNode: AudioWorkletNode | null;
    destination: MediaStreamAudioDestinationNode | null;
    makeupGain: GainNode | null;
    limiter: DynamicsCompressorNode | null;
    private makeupValue;
    private gateEnabled;
    private gateThresholdDb;
    processor: DeepFilterNet3Core;
    enabled: boolean;
    originalTrack?: MediaStreamTrack;
    constructor(options?: DeepFilterNoiseFilterOptions);
    static isSupported(): boolean;
    init: (opts: {
        track?: MediaStreamTrack;
        mediaStreamTrack?: MediaStreamTrack;
        audioContext?: AudioContext;
    }) => Promise<void>;
    restart: (opts: {
        track?: MediaStreamTrack;
        mediaStreamTrack?: MediaStreamTrack;
    }) => Promise<void>;
    setEnabled: (enable: boolean) => Promise<boolean>;
    setSuppressionLevel(level: number): void;
    /** Post-DFN makeup gain (voice normalization). 1.0 = none; ~1.9 ≈ +5.6 dB to undo DFN attenuation. */
    setMakeupGain(gain: number): void;
    setPostFilterBeta(beta: number): void;
    /** Enable/disable the post-DFN level gate (suppresses background voices in the speaker's gaps). */
    setGateEnabled(enabled: boolean): void;
    /** Gate open threshold in dBFS (e.g. -45). Higher = more aggressive (gates more). */
    setGateThreshold(db: number): void;
    isEnabled(): boolean;
    isNoiseSuppressionEnabled(): boolean;
    suspend: () => Promise<void>;
    resume: () => Promise<void>;
    destroy: () => Promise<void>;
    private ensureGraph;
    private teardownGraph;
}
declare function DeepFilterNoiseFilter(options?: DeepFilterNoiseFilterOptions): DeepFilterNoiseFilterProcessor;

declare class AssetLoader {
    private readonly cdnUrl;
    constructor(config?: AssetConfig);
    private getCdnUrl;
    getAssetUrls(): AssetUrls;
    fetchAsset(url: string): Promise<ArrayBuffer>;
}
declare function getAssetLoader(config?: AssetConfig): AssetLoader;

export { AssetLoader, DeepFilterNet3Core, DeepFilterNoiseFilter, DeepFilterNoiseFilterProcessor, getAssetLoader };
export type { AssetConfig, DeepFilterNet3ProcessorConfig, DeepFilterNoiseFilterOptions };
