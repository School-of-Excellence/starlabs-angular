// df3-processor.js — replace the entire class:
const FRAME_SIZE          = 480;
const MAX_BUFFERED_FRAMES = 8;
const MIN_OUTPUT_BUFFER   = FRAME_SIZE * 2; // wait until 2 frames ready before starting output

class DF3Processor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);

    this._inBuf    = new Float32Array(FRAME_SIZE * 32);
    this._outBuf   = new Float32Array(FRAME_SIZE * 32);
    this._inWrite  = 0;
    this._inRead   = 0;
    this._outWrite = 0;
    this._outRead  = 0;
    this._pending  = 0;
    this._frameCount  = 0;
    this._workerReady = false;
    this._outputStarted = false; // don't read output until buffer primed

    this.port.onmessage = (e) => {
      if (e.data.type === 'processed') {
        const frame = e.data.pcm;
        if (frame && frame.length) {
          for (let i = 0; i < frame.length; i++) {
            this._outBuf[this._outWrite % this._outBuf.length] = frame[i];
            this._outWrite++;
          }
        }
        this._pending = Math.max(0, this._pending - 1);

        // Start outputting only once we have MIN_OUTPUT_BUFFER samples ready
        if (!this._outputStarted &&
            (this._outWrite - this._outRead) >= MIN_OUTPUT_BUFFER) {
          this._outputStarted = true;
        }
      }

      if (e.data.type === 'worker_ready') {
        this._workerReady = true;
      }
    };
  }

  process(inputs, outputs) {
    const input  = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    this._frameCount++;

    // 1. Write input to ring buffer
    for (let i = 0; i < input.length; i++) {
      this._inBuf[this._inWrite % this._inBuf.length] = input[i];
      this._inWrite++;
    }

    // 2. Send frames to worker
    if (this._workerReady) {
      while (
        (this._inWrite - this._inRead) >= FRAME_SIZE &&
        this._pending < MAX_BUFFERED_FRAMES
      ) {
        const frame = new Float32Array(FRAME_SIZE);
        for (let i = 0; i < FRAME_SIZE; i++) {
          frame[i] = this._inBuf[(this._inRead + i) % this._inBuf.length];
        }
        this._inRead += FRAME_SIZE;
        this._pending++;
        const buf = frame.buffer;
        if (buf.byteLength > 0) {
          this.port.postMessage({ type: 'process', pcm: frame }, [buf]);
        } else {
          this.port.postMessage({ type: 'process', pcm: frame });
        }
      }
    }

    // 3. Fill output — only after jitter buffer is primed
    const available = this._outWrite - this._outRead;
    if (this._outputStarted && available >= output.length) {
      for (let i = 0; i < output.length; i++) {
        output[i] = this._outBuf[this._outRead % this._outBuf.length];
        this._outRead++;
      }
    } else {
      // Passthrough while buffering
      for (let i = 0; i < output.length; i++) {
        output[i] = input[i];
      }
    }

    // 4. Log after output written
    if (this._frameCount % 200 === 0) {
      const hasAudio    = input.some(s => Math.abs(s) > 0.0001);
      const outHasAudio = output.some(s => Math.abs(s) > 0.0001);
      console.log(
        `[Worklet] frame=${this._frameCount}` +
        ` in=${hasAudio} out=${outHasAudio}` +
        ` started=${this._outputStarted}` +
        ` avail=${this._outWrite - this._outRead}` +
        ` pending=${this._pending}`
      );
    }

    return true;
  }
}

registerProcessor('df3-processor', DF3Processor);
