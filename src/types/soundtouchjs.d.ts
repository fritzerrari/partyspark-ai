declare module "soundtouchjs" {
  export class SoundTouch {
    pitchSemitones: number;
    tempo: number;
    rate: number;
  }
  export class SimpleFilter {
    constructor(source: unknown, pipe: SoundTouch);
    extract(target: Float32Array, numFrames: number): number;
  }
  export class PitchShifter {
    constructor(ctx: AudioContext, buffer: AudioBuffer, bufferSize: number, onEnd?: () => void);
    pitchSemitones: number;
    tempo: number;
    connect(node: AudioNode): void;
    disconnect(): void;
  }
}