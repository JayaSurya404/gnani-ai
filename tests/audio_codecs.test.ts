import test from "node:test";
import assert from "node:assert/strict";
import {
  MULAW_TO_PCM16,
  pcm16SampleToMuLaw,
  decodeMuLaw8kToPcm16k,
  encodePcm16kToMuLaw8k,
  chunkMuLawFrames,
} from "../services/voice-gateway/src/audio-codecs.js";

test("Audio Codecs: G.711 mu-law lookup table and sample encoder", async (t) => {
  await t.test("lookup table is populated with 256 signed 16-bit values", () => {
    assert.equal(MULAW_TO_PCM16.length, 256);
    // Mu-law 0xFF is silence / near zero in G.711
    const silenceVal = MULAW_TO_PCM16[0xff];
    assert.ok(Math.abs(silenceVal) <= 10, `0xFF should be near zero, got ${silenceVal}`);
  });

  await t.test("encodes zero PCM sample to mu-law silence byte (0xFF)", () => {
    const muLawByte = pcm16SampleToMuLaw(0);
    assert.equal(muLawByte, 0xff);
  });

  await t.test("encodes and decodes positive and negative samples with G.711 fidelity", () => {
    const testSamples = [0, 500, 2000, 15000, -500, -2000, -15000];
    for (const sample of testSamples) {
      const muLaw = pcm16SampleToMuLaw(sample);
      const decoded = MULAW_TO_PCM16[muLaw];
      // Mu-law is logarithmic compression: error is proportional to magnitude
      const allowedError = Math.max(100, Math.abs(sample) * 0.1);
      assert.ok(
        Math.abs(decoded - sample) <= allowedError,
        `Expected ${decoded} to approximate ${sample} within ${allowedError}`
      );
    }
  });
});

test("Audio Codecs: Stream Transcoder", async (t) => {
  await t.test("decodeMuLaw8kToPcm16k produces 4x buffer length (upsampling 8k -> 16k, 8-bit -> 16-bit)", () => {
    const input8k = Buffer.alloc(160, 0xff); // 160 bytes mu-law (20ms)
    const output16k = decodeMuLaw8kToPcm16k(input8k);

    assert.equal(output16k.length, 160 * 4); // 640 bytes = 320 16-bit samples = 20ms at 16kHz
  });

  await t.test("encodePcm16kToMuLaw8k produces 1/4 buffer length (downsampling 16k -> 8k, 16-bit -> 8-bit)", () => {
    const input16k = Buffer.alloc(640, 0); // 640 bytes = 320 16-bit samples
    const output8k = encodePcm16kToMuLaw8k(input16k);

    assert.equal(output8k.length, 160); // 160 bytes mu-law
  });

  await t.test("encodePcm16kToMuLaw8k strips RIFF WAV header when present", () => {
    const pcmData = Buffer.alloc(640, 0); // 320 zero samples
    const wavHeader = Buffer.alloc(44);
    wavHeader.write("RIFF", 0, "ascii");
    wavHeader.writeUInt32LE(36 + pcmData.length, 4);
    wavHeader.write("WAVE", 8, "ascii");
    wavHeader.write("fmt ", 12, "ascii");
    wavHeader.writeUInt32LE(16, 16); // subchunk 1 size
    wavHeader.writeUInt16LE(1, 20); // PCM format
    wavHeader.writeUInt16LE(1, 22); // mono
    wavHeader.writeUInt32LE(16000, 24); // sample rate
    wavHeader.writeUInt32LE(32000, 28); // byte rate
    wavHeader.writeUInt16LE(2, 32); // block align
    wavHeader.writeUInt16LE(16, 34); // bits per sample
    wavHeader.write("data", 36, "ascii");
    wavHeader.writeUInt32LE(pcmData.length, 40);

    const wavBuffer = Buffer.concat([wavHeader, pcmData]);
    const output8k = encodePcm16kToMuLaw8k(wavBuffer);

    assert.equal(output8k.length, 160); // Correctly stripped header and produced 160 bytes
  });

  await t.test("chunkMuLawFrames splits buffer into exact 160-byte 20ms frames", () => {
    const buffer = Buffer.alloc(480); // 480 bytes = 3 frames of 160
    const frames = chunkMuLawFrames(buffer, 160);

    assert.equal(frames.length, 3);
    assert.equal(frames[0].length, 160);
    assert.equal(frames[1].length, 160);
    assert.equal(frames[2].length, 160);
  });
});

