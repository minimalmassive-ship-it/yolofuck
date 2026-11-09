/**
 * Audio Resampling & Pre-Processing Pipeline for Ideanite Local AI
 * Phase 5, Point 32: Strict Input Resampling (44.1k/48k/96k -> 16kHz Mono PCM)
 * 
 * Enforces strict conversion of arbitrary incoming audio streams (stereo/surround,
 * 44.1kHz, 48kHz, 96kHz) into high-fidelity 16,000 Hz 16-bit mono PCM required
 * by Whisper automatic speech recognition (ASR) acoustic feature extractors.
 */

export interface AudioResampleOptions {
  sourceSampleRate: number;
  targetSampleRate?: number; // Defaults to 16000
  numChannels?: number;      // Defaults to 1 (mono)
  applyLowPassFilter?: boolean; // Defaults to true when downsampling
}

export interface DecodedWavAudio {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  durationSeconds: number;
}

export class AudioResampler {
  public static readonly TARGET_SAMPLE_RATE = 16000;

  /**
   * Resamples a Float32Array buffer from sourceSampleRate to targetSampleRate (default 16000Hz).
   * Applies linear interpolation with anti-aliasing filter when downsampling.
   */
  public static resampleFloat32(
    input: Float32Array,
    sourceSampleRate: number,
    targetSampleRate: number = AudioResampler.TARGET_SAMPLE_RATE,
    applyLowPass: boolean = true
  ): Float32Array {
    if (!input || input.length === 0) {
      return new Float32Array(0);
    }

    if (sourceSampleRate === targetSampleRate) {
      return input;
    }

    if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
      throw new Error(`Invalid sample rates: source=${sourceSampleRate}, target=${targetSampleRate}`);
    }

    // If downsampling and low-pass filtering is requested, apply pre-filter to attenuate frequencies above target Nyquist
    let processedInput = input;
    if (applyLowPass && sourceSampleRate > targetSampleRate) {
      processedInput = AudioResampler.applySimpleLowPass(input, sourceSampleRate, targetSampleRate / 2);
    }

    const ratio = sourceSampleRate / targetSampleRate;
    const outputLength = Math.max(1, Math.round(input.length / ratio));
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * ratio;
      const indexFloor = Math.floor(sourceIndex);
      const fraction = sourceIndex - indexFloor;

      if (indexFloor + 1 < processedInput.length) {
        const s0 = processedInput[indexFloor];
        const s1 = processedInput[indexFloor + 1];
        // Linear interpolation
        const sample = s0 + fraction * (s1 - s0);
        output[i] = Math.max(-1.0, Math.min(1.0, sample));
      } else if (indexFloor < processedInput.length) {
        output[i] = Math.max(-1.0, Math.min(1.0, processedInput[indexFloor]));
      } else {
        output[i] = 0;
      }
    }

    return output;
  }

  /**
   * Downmixes multi-channel audio to mono by averaging channels.
   * Handles interleaved channel layout: [ch0_s0, ch1_s0, ch0_s1, ch1_s1, ...]
   */
  public static downmixToMono(interleavedSamples: Float32Array, numChannels: number): Float32Array {
    if (numChannels <= 1) {
      return interleavedSamples;
    }

    const totalMonoSamples = Math.floor(interleavedSamples.length / numChannels);
    const mono = new Float32Array(totalMonoSamples);

    for (let i = 0; i < totalMonoSamples; i++) {
      let sum = 0;
      const offset = i * numChannels;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += interleavedSamples[offset + ch];
      }
      mono[i] = Math.max(-1.0, Math.min(1.0, sum / numChannels));
    }

    return mono;
  }

  /**
   * Converts Float32 audio samples [-1.0, 1.0] to 16-bit signed PCM Int16Array [-32768, 32767].
   */
  public static float32ToInt16(samples: Float32Array): Int16Array {
    const pcm16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1.0, Math.min(1.0, samples[i]));
      pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
    }
    return pcm16;
  }

  /**
   * Converts 16-bit signed PCM Int16Array to normalized Float32Array [-1.0, 1.0].
   */
  public static int16ToFloat32(samples: Int16Array): Float32Array {
    const f32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      f32[i] = samples[i] / 32768.0;
    }
    return f32;
  }

  /**
   * Universal pipeline: converts arbitrary Float32Array or Int16Array audio
   * with any sample rate and channel count into 16,000 Hz mono Float32Array.
   */
  public static resampleTo16kMono(
    input: Float32Array | Int16Array,
    sourceSampleRate: number,
    numChannels: number = 1
  ): Float32Array {
    let f32 = input instanceof Float32Array ? input : AudioResampler.int16ToFloat32(input);

    // 1. Downmix to mono if multi-channel
    if (numChannels > 1) {
      f32 = AudioResampler.downmixToMono(f32, numChannels);
    }

    // 2. Resample to 16kHz
    if (sourceSampleRate !== AudioResampler.TARGET_SAMPLE_RATE) {
      f32 = AudioResampler.resampleFloat32(f32, sourceSampleRate, AudioResampler.TARGET_SAMPLE_RATE);
    }

    return f32;
  }

  /**
   * Decodes a binary WAV file buffer (ArrayBuffer or Uint8Array) into Float32 samples,
   * automatically downmixing and resampling to 16,000 Hz mono PCM.
   */
  public static decodeWavTo16kMono(buffer: ArrayBuffer | Uint8Array): Float32Array {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Validate RIFF header
    const riffStr = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (riffStr !== 'RIFF') {
      throw new Error('Invalid WAV: RIFF chunk identifier missing');
    }

    const waveStr = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (waveStr !== 'WAVE') {
      throw new Error('Invalid WAV: WAVE format identifier missing');
    }

    // Locate "fmt " chunk
    let offset = 12;
    let fmtOffset = -1;
    let dataOffset = -1;
    let dataLength = 0;

    while (offset < bytes.length - 8) {
      const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 'fmt ') {
        fmtOffset = offset + 8;
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataLength = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
    }

    if (fmtOffset === -1) throw new Error('Invalid WAV: fmt chunk not found');
    if (dataOffset === -1) throw new Error('Invalid WAV: data chunk not found');

    const audioFormat = view.getUint16(fmtOffset, true); // 1 = PCM, 3 = IEEE Float
    const numChannels = view.getUint16(fmtOffset + 2, true);
    const sampleRate = view.getUint32(fmtOffset + 4, true);
    const bitsPerSample = view.getUint16(fmtOffset + 14, true);

    const availableBytes = Math.min(dataLength, bytes.length - dataOffset);
    let rawSamples: Float32Array;

    if (bitsPerSample === 16) {
      const totalSamples = Math.floor(availableBytes / 2);
      rawSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        const s = view.getInt16(dataOffset + i * 2, true);
        rawSamples[i] = s / 32768.0;
      }
    } else if (bitsPerSample === 32 && audioFormat === 3) {
      const totalSamples = Math.floor(availableBytes / 4);
      rawSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        rawSamples[i] = view.getFloat32(dataOffset + i * 4, true);
      }
    } else if (bitsPerSample === 8) {
      const totalSamples = availableBytes;
      rawSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        // 8-bit unsigned PCM: 0-255 with 128 as silence
        rawSamples[i] = (bytes[dataOffset + i] - 128) / 128.0;
      }
    } else {
      throw new Error(`Unsupported WAV audio format: ${bitsPerSample}-bit, format=${audioFormat}`);
    }

    return AudioResampler.resampleTo16kMono(rawSamples, sampleRate, numChannels);
  }

  /**
   * Encodes 16kHz mono Float32Array or Int16Array audio samples into standard 16-bit PCM RIFF WAV format.
   * Returns a raw Uint8Array containing complete 44-byte WAV header and PCM samples.
   */
  public static encodeWav16kMono(samples: Float32Array | Int16Array): Uint8Array {
    const numSamples = samples.length;
    const byteLength = 44 + numSamples * 2;
    const buffer = new Uint8Array(byteLength);
    const view = new DataView(buffer.buffer);

    const writeString = (v: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        v.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true); // ChunkSize
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);              // AudioFormat (1 = Linear PCM)
    view.setUint16(22, 1, true);              // NumChannels (1 = Mono)
    view.setUint32(24, 16000, true);          // SampleRate (16000 Hz)
    view.setUint32(28, 16000 * 2, true);      // ByteRate (SampleRate * NumChannels * BitsPerSample / 8)
    view.setUint16(32, 2, true);              // BlockAlign (NumChannels * BitsPerSample / 8)
    view.setUint16(34, 16, true);             // BitsPerSample (16 bits)

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true); // Subchunk2Size

    // Write samples
    let offset = 44;
    if (samples instanceof Float32Array) {
      for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1.0, Math.min(1.0, samples[i]));
        const val = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
        view.setInt16(offset, val, true);
        offset += 2;
      }
    } else {
      for (let i = 0; i < numSamples; i++) {
        view.setInt16(offset, samples[i], true);
        offset += 2;
      }
    }

    return buffer;
  }

  /**
   * Encodes 16kHz mono audio into a standard audio/wav Blob for HTTP uploads or saving.
   */
  public static encodeWavBlob(samples: Float32Array | Int16Array): Blob {
    const bytes = AudioResampler.encodeWav16kMono(samples);
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Simple single-pole IIR anti-aliasing low-pass filter to attenuate frequencies above cutoff.
   */
  private static applySimpleLowPass(
    input: Float32Array,
    sampleRate: number,
    cutoffFreq: number
  ): Float32Array {
    if (cutoffFreq >= sampleRate / 2) {
      return input;
    }

    const output = new Float32Array(input.length);
    const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);

    let prev = input[0] || 0;
    output[0] = prev;

    for (let i = 1; i < input.length; i++) {
      prev = prev + alpha * (input[i] - prev);
      output[i] = prev;
    }

    return output;
  }
}
