class VadGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // THE GATE CONTROLS
    this.threshold = 0.002; // Volume threshold to trigger the gate (Adjust if needed)
    this.holdTime = 40;     // How many frames to keep the mic open after you stop talking (prevents clipping the end of words)
    this.holdCounter = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0][0];
    const output = outputs[0][0];
    
    if (!input) return true;

    // 1. Calculate the Audio Energy (Root Mean Square)
    let sumSquares = 0;
    for (let i = 0; i < input.length; i++) {
      sumSquares += input[i] * input[i];
    }
    const rms = Math.sqrt(sumSquares / input.length);

    // 2. The Gate Logic
    if (rms > this.threshold) {
      // We hear speaking! Open the gate and reset the hold timer.
      this.holdCounter = this.holdTime; 
    }

    // 3. Apply the Gate
    if (this.holdCounter > 0) {
      // Gate is OPEN: Pass the clean DeepFilter audio through
      output.set(input);
      this.holdCounter--;
    } else {
      // Gate is CLOSED: Force absolute mathematical silence
      output.fill(0);
    }

    return true;
  }
}

registerProcessor('vad-gate-processor', VadGateProcessor);