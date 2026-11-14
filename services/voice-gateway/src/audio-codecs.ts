/**
 * Audio Codec & Transcoding Utilities for Telephony (Twilio <-> Gnani Speech Gateway)
 * 
 * Twilio Media Streams:
 * - 8,000 Hz, 8-bit mono G.711 mu-law (audio/x-mulaw)
 * 
 * Gnani Prisma STT / Timbre TTS:
 * - 16,000 Hz, 16-bit linear PCM (signed little-endian)
 */

// Pre-computed 256-entry lookup table for G.711 mu-law decoding to 16-bit linear PCM
export const MULAW_TO_PCM16 = new Int16Array(256);

(function initMuLawDecodeTable() {
  for (let i = 0; i < 256; i++) {
    const complement = ~i & 0xff;
    const sign = complement & 0x80;
    const exponent = (complement >> 4) & 0x07;
    const mantissa = complement & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    MULAW_TO_PCM16[i] = sign !== 0 ? -sample : sample;
  }
})();

/**
 * Encodes a single 16-bit linear PCM sample into an 8-bit G.711 mu-law byte.
 */
export function pcm16SampleToMuLaw(sample: number): number {
  const BIAS = 0x84; // 132
  const CLIP = 32635;

  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }

  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  const muLawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
  return muLawByte;
}

/**
 * Decodes 8kHz 8-bit mu-law buffer and upsamples to 16kHz 16-bit linear PCM (Buffer).
 * Output size is 4x input size (2 bytes per sample * 2x sample rate).
 */
export function decodeMuLaw8kToPcm16k(muLawBuffer: Buffer): Buffer {
  const numInputSamples = muLawBuffer.length;
  if (numInputSamples === 0) return Buffer.alloc(0);

  // 2x upsampled samples, 2 bytes per sample
  const outBuf = Buffer.alloc(numInputSamples * 4);

  let prevSample = MULAW_TO_PCM16[muLawBuffer[0]];

  for (let i = 0; i < numInputSamples; i++) {
    const curSample = MULAW_TO_PCM16[muLawBuffer[i]];
    // Linear interpolation between prevSample and curSample
    const interpSample = Math.round((prevSample + curSample) / 2);

    const outOffset = i * 4;
    // First sample of interpolated pair
    outBuf.writeInt16LE(curSample, outOffset);
    // Second sample (interpolated)
    const nextSample = i + 1 < numInputSamples ? MULAW_TO_PCM16[muLawBuffer[i + 1]] : curSample;
    const nextInterp = Math.round((curSample + nextSample) / 2);
    outBuf.writeInt16LE(nextInterp, outOffset + 2);

    prevSample = curSample;
  }

  return outBuf;
}

/**
 * Downsamples 16kHz 16-bit linear PCM buffer to 8kHz and encodes to 8-bit mu-law (Buffer).
 * Handles RIFF WAV header stripping if present.
 */
export function encodePcm16kToMuLaw8k(pcmBuffer: Buffer): Buffer {
  let rawPcm = pcmBuffer;

  // Check for RIFF header
  if (rawPcm.length >= 44 && rawPcm.toString("ascii", 0, 4) === "RIFF") {
    // Find 'data' chunk
    let offset = 12;
    while (offset < rawPcm.length - 8) {
      const chunkId = rawPcm.toString("ascii", offset, offset + 4);
      const chunkSize = rawPcm.readUInt32LE(offset + 4);
      if (chunkId === "data") {
        rawPcm = rawPcm.subarray(offset + 8, offset + 8 + chunkSize);
        break;
      }
      offset += 8 + chunkSize;
    }
  }

  const numInputSamples = Math.floor(rawPcm.length / 2);
  const numOutputSamples = Math.floor(numInputSamples / 2);
  if (numOutputSamples <= 0) return Buffer.alloc(0);

  const outBuf = Buffer.alloc(numOutputSamples);

  for (let i = 0; i < numOutputSamples; i++) {
    const s1 = rawPcm.readInt16LE(i * 4);
    const s2 = rawPcm.readInt16LE(i * 4 + 2);
    // 2:1 decimation with simple box filter (average) to prevent aliasing
    const avg = Math.round((s1 + s2) / 2);
    outBuf[i] = pcm16SampleToMuLaw(avg);
  }

  return outBuf;
}

/**
 * Splits a mu-law buffer into 160-byte (20ms at 8kHz) frames for Twilio streaming.
 */
export function chunkMuLawFrames(buffer: Buffer, frameSize: number = 160): Buffer[] {
  const chunks: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += frameSize) {
    chunks.push(buffer.subarray(i, Math.min(i + frameSize, buffer.length)));
  }
  return chunks;
}

