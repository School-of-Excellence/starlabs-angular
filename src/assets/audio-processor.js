class AicProcessor extends AudioWorkletProcessor {

  constructor() {
    super();
    this.outputBuffers = [];

    this.port.onmessage = (event) => {
      if (event.data.type === 'enhanced') {
        this.outputBuffers.push(new Float32Array(event.data.buffer));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0] && input[0].length > 0) {
      // ✅ Use slice() to COPY — not transfer — the buffer
      const rawBuffer = input[0].slice(0);
      this.port.postMessage({ type: 'raw', buffer: rawBuffer.buffer });
      // ← NO transfer array — buffer stays valid in worklet too
    }

    if (output && output[0]) {
      if (this.outputBuffers.length > 0) {
        const enhanced = this.outputBuffers.shift();
        const len = Math.min(enhanced.length, output[0].length);
        for (let i = 0; i < len; i++) {
          output[0][i] = enhanced[i];
        }
      } else {
        output[0].fill(0);
      }
    }

    return true;
  }
}

registerProcessor('aic-processor', AicProcessor);
