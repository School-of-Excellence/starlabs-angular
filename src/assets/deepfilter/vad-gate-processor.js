class VadGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 1. RAISE THIS THRESHOLD. 
    // If it was 0.002, try jumping to 0.01, 0.02, or even 0.03.
    this.threshold = 0.02; 
    
    // 2. LOWER THE HOLD TIME.
    // Make the gate snap shut faster when you stop talking.
    this.holdTime = 15; // Changed from 40
    
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