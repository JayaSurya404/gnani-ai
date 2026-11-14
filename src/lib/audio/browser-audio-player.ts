/**
 * VoiceNexus AI — Browser Audio Player
 * Streams and plays audio chunks incrementally with instant abort capability for barge-in.
 */

export class BrowserAudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private isAborted = false;

  constructor() {
    // Initialized lazily on first playback to respect browser autoplay policies
  }

  private initAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  public enqueueBase64Chunk(base64Data: string) {
    if (this.isAborted || !base64Data) return;

    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      this.audioQueue.push(bytes.buffer);

      if (!this.isPlaying) {
        this.playNextChunk();
      }
    } catch {
      // Ignore decoding errors
    }
  }

  private async playNextChunk() {
    if (this.isAborted || this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const chunk = this.audioQueue.shift();
    if (!chunk) {
      this.isPlaying = false;
      return;
    }

    try {
      const ctx = this.initAudioContext();
      
      // Check if it's a WAV container or raw PCM
      const view = new DataView(chunk);
      let isWav = false;
      if (chunk.byteLength >= 4) {
        const magic = String.fromCharCode(
          view.getUint8(0),
          view.getUint8(1),
          view.getUint8(2),
          view.getUint8(3)
        );
        isWav = magic === "RIFF";
      }

      let audioBuffer: AudioBuffer;

      if (isWav) {
        // Decode WAV container
        audioBuffer = await ctx.decodeAudioData(chunk.slice(0));
      } else {
        // Raw linear PCM 16-bit 16kHz mono
        const int16Array = new Int16Array(chunk);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        audioBuffer = ctx.createBuffer(1, float32Array.length, 16000);
        audioBuffer.getChannelData(0).set(float32Array);
      }

      if (this.isAborted) {
        this.isPlaying = false;
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      this.currentSourceNode = source;

      source.onended = () => {
        this.currentSourceNode = null;
        if (!this.isAborted) {
          this.playNextChunk();
        } else {
          this.isPlaying = false;
        }
      };

      source.start(0);
    } catch {
      // Continue to next chunk on decode failure
      if (!this.isAborted) {
        this.playNextChunk();
      } else {
        this.isPlaying = false;
      }
    }
  }

  /**
   * Immediately aborts active playback and clears queued audio frames.
   * Invoked upon caller barge-in / interruption.
   */
  public abort() {
    this.isAborted = true;
    this.audioQueue = [];

    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // Safe disconnect
      }
      this.currentSourceNode = null;
    }

    this.isPlaying = false;
    // Reset aborted flag after a tick so new speech can play
    setTimeout(() => {
      this.isAborted = false;
    }, 50);
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public close() {
    this.abort();
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

