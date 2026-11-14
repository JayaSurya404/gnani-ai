/**
 * VoiceNexus AI — Browser Audio Recorder
 * Captures microphone audio using Web Audio API and resamples to linear PCM16 16kHz mono.
 */

export interface AudioRecorderOptions {
  sampleRate?: number; // Target sample rate: default 16000
  bufferSize?: number; // Default 2048 or 4096
  onAudioChunk?: (pcm16Data: ArrayBufferLike) => void;
  onError?: (err: Error) => void;
}

export class BrowserAudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRecording = false;
  private isMuted = false;
  private targetSampleRate: number;
  private onAudioChunk?: (pcm16Data: ArrayBufferLike) => void;
  private onError?: (err: Error) => void;

  constructor(options: AudioRecorderOptions = {}) {
    this.targetSampleRate = options.sampleRate || 16000;
    this.onAudioChunk = options.onAudioChunk;
    this.onError = options.onError;
  }

  public async start(): Promise<boolean> {
    if (this.isRecording) return true;

    try {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture is not supported in this environment.");
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      // Use buffer size 2048 or 4096
      this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.isRecording || this.isMuted) return;

        const inputChannel = event.inputBuffer.getChannelData(0);
        const sourceSampleRate = this.audioContext?.sampleRate || 48000;

        // Downsample inputChannel from sourceSampleRate to targetSampleRate (16kHz)
        const resampled = this.downsampleTo16kHz(inputChannel, sourceSampleRate, this.targetSampleRate);

        // Convert Float32Array [-1.0, 1.0] to signed 16-bit PCM Int16Array
        const pcm16 = this.floatTo16BitPCM(resampled);

        this.onAudioChunk?.(pcm16.buffer);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isRecording = true;
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onError?.(error);
      this.stop();
      return false;
    }
  }

  public stop() {
    this.isRecording = false;

    if (this.processorNode && this.sourceNode) {
      try {
        this.sourceNode.disconnect();
        this.processorNode.disconnect();
      } catch {
        // Safe cleanup
      }
      this.processorNode = null;
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
    }
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  private downsampleTo16kHz(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (inputRate === outputRate) return input;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetInput = 0;

    while (offsetResult < result.length) {
      const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
        accum += input[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetInput = nextOffsetInput;
    }

    return result;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }
}
