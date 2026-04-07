// DeepFilterWorklet.js
import * as wasm_bindgen from './df.js';

const WorkletMessageTypes = {
  SET_SUPPRESSION_LEVEL: 'SET_SUPPRESSION_LEVEL',
  SET_BYPASS: 'SET_BYPASS'
};

class DeepFilterAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.dfModel = null;
    this.bufferSize = 8192;
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.outputBuffer = new Float32Array(this.bufferSize);
    this.inputWritePos = 0;
    this.inputReadPos = 0;
    this.outputWritePos = 0;
    this.outputReadPos = 0;
    this.bypass = false;
    this.isInitialized = false;
    this.tempFrame = null;

    try {
      // Initialize WASM from the bytes passed from Angular
      wasm_bindgen.initSync(options.processorOptions.wasmModule);

      const modelBytes = new Uint8Array(options.processorOptions.modelBytes);
      const handle = wasm_bindgen.df_create(
        modelBytes,
        options.processorOptions.suppressionLevel ?? 80 // 80 is good for Zoom-level
      );

      const frameLength = wasm_bindgen.df_get_frame_length(handle);

      this.dfModel = { handle, frameLength };

      this.bufferSize = frameLength * 4;
      this.inputBuffer = new Float32Array(this.bufferSize);
      this.outputBuffer = new Float32Array(this.bufferSize);
      this.tempFrame = new Float32Array(frameLength);

      this.isInitialized = true;

      this.port.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      console.error('Failed to initialize DeepFilter:', error);
    }
  }

  handleMessage(data) {
    if (data.type === WorkletMessageTypes.SET_SUPPRESSION_LEVEL) {
      if (this.dfModel && typeof data.value === 'number') {
        const level = Math.max(0, Math.min(100, Math.floor(data.value)));
        wasm_bindgen.df_set_atten_lim(this.dfModel.handle, level);
      }
    } else if (data.type === WorkletMessageTypes.SET_BYPASS) {
      this.bypass = Boolean(data.value);
    }
  }

  getInputAvailable() {
    return (this.inputWritePos - this.inputReadPos + this.bufferSize) % this.bufferSize;
  }

  getOutputAvailable() {
    return (this.outputWritePos - this.outputReadPos + this.bufferSize) % this.bufferSize;
  }

  process(inputList, outputList) {
    const sourceLimit = Math.min(inputList.length, outputList.length);
    const input = inputList[0]?.[0];
    
    if (!input) return true;

    // Passthrough if broken or bypassed
    if (!this.isInitialized || !this.dfModel || this.bypass || !this.tempFrame) {
      for (let inputNum = 0; inputNum < sourceLimit; inputNum++) {
        const output = outputList[inputNum];
        for (let channelNum = 0; channelNum < output.length; channelNum++) {
          output[channelNum].set(input);
        }
      }
      return true;
    }

    // Write input to ring buffer
    for (let i = 0; i < input.length; i++) {
      this.inputBuffer[this.inputWritePos] = input[i];
      this.inputWritePos = (this.inputWritePos + 1) % this.bufferSize;
    }

    const frameLength = this.dfModel.frameLength;

    // Process frames
    while (this.getInputAvailable() >= frameLength) {
      for (let i = 0; i < frameLength; i++) {
        this.tempFrame[i] = this.inputBuffer[this.inputReadPos];
        this.inputReadPos = (this.inputReadPos + 1) % this.bufferSize;
      }

      const processed = wasm_bindgen.df_process_frame(this.dfModel.handle, this.tempFrame);

      for (let i = 0; i < processed.length; i++) {
        this.outputBuffer[this.outputWritePos] = processed[i];
        this.outputWritePos = (this.outputWritePos + 1) % this.bufferSize;
      }
    }

    // Output frames
    if (this.getOutputAvailable() >= 128) {
      for (let inputNum = 0; inputNum < sourceLimit; inputNum++) {
        const output = outputList[inputNum];
        for (let channelNum = 0; channelNum < output.length; channelNum++) {
          const outputChannel = output[channelNum];
          let readPos = this.outputReadPos;
          for (let i = 0; i < 128; i++) {
            outputChannel[i] = this.outputBuffer[readPos];
            readPos = (readPos + 1) % this.bufferSize;
          }
        }
      }
      this.outputReadPos = (this.outputReadPos + 128) % this.bufferSize;
    }
    return true;
  }
}

registerProcessor('deepfilter-audio-processor', DeepFilterAudioProcessor);