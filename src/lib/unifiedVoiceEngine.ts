import { groqService } from './groq';
import { deepgramService } from './deepgram';
import { supabase } from './supabase';
import { audioDeviceManager } from './audioDeviceManager';
import { MicrophonePermissionManager, type MicrophoneDiagnosticResult } from './microphonePermissionManager';
import { isPublicWebHttpsEnvironment } from './localAiManager';
import { AudioResampler } from './audioResampler';

export type TranscriptionEngine = 'browser' | 'groq' | 'deepgram' | 'local' | 'local_pro' | 'default' | '';

export interface TranscriptionResult {
    text: string;
    isFinal: boolean;
    engine: TranscriptionEngine;
}

export interface VoiceSessionOptions {
    engine: TranscriptionEngine;
    model?: string;
    language: string;
    fullLanguage?: string; // Optional: Used for Web Speech API (e.g. 'en-US' instead of 'en')
    customApiKey?: string;
    deepgramApiKey?: string;
    onResult: (result: TranscriptionResult) => void;
    onVolume?: (volume: number) => void;
    onError?: (error: any) => void;
    existingStream?: MediaStream;
}

/**
 * Unified Voice Engine (v20.2)
 * Central hub for Browser, Groq, and Deepgram Nova-2 transcription.
 */

class UnifiedVoiceManager {
    private activeSession: any = null;
    private audioCtx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private isExternalStream: boolean = false;
    private source: MediaStreamAudioSourceNode | null = null;
    private isPulseActive: boolean = false;
    private cachedDeepgramToken: string | null = null;
    private tokenExpiry: number = 0;
    private detachDeviceGuard: (() => void) | null = null;

    private attachStreamGuard(options: VoiceSessionOptions, modeLabel: string = 'Session') {
        if (this.detachDeviceGuard) {
            this.detachDeviceGuard();
            this.detachDeviceGuard = null;
        }
        if (!this.stream) return;
        this.detachDeviceGuard = audioDeviceManager.attachTrackDisconnectGuard(this.stream, (event) => {
            if (event.recovered) {
                console.log(`[VoiceEngine] ${modeLabel} mic hot-swap recovered: ${event.deviceLabel || event.deviceId}`);
            } else {
                console.warn(`[VoiceEngine] ${modeLabel} microphone disconnected and unrecoverable.`);
                options.onError?.(new Error('Microphone disconnected. Please check audio device.'));
                this.stopSession();
            }
        }, { autoRecover: true });
    }

    private async acquireStream(options?: VoiceSessionOptions): Promise<MediaStream> {
        if (options?.existingStream) {
            this.stream = options.existingStream;
            this.isExternalStream = true;
            return this.stream;
        }
        if (this.stream) return this.stream;
        try {
            const devices = await audioDeviceManager.getAudioInputDevices().catch(() => []);
            const preferred = audioDeviceManager.resolvePreferredAudioDevice(devices);
            const constraints: MediaStreamConstraints = {
                audio: preferred && preferred.deviceId !== 'default'
                    ? { deviceId: { exact: preferred.deviceId } }
                    : (preferred ? { deviceId: { exact: 'default' } } : true)
            };
            try {
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch {
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            this.isExternalStream = false;
            return this.stream;
        } catch (micErr: any) {
            const diag = MicrophonePermissionManager.diagnose(micErr);
            console.warn(`[VoiceEngine] Microphone access failed: ${diag.title}`, diag.actionSteps);
            const enhancedError = new Error(`${diag.title}: ${diag.explanation}\n\nResolution Steps:\n${diag.actionSteps.join('\n')}`);
            (enhancedError as any).name = micErr?.name || 'MicrophoneAcquisitionError';
            (enhancedError as any).diagnostic = diag;
            throw enhancedError;
        }
    }

    // Helper to convert Float32 samples to 16-bit PCM for Deepgram
    private floatTo16BitPCM(samples: Float32Array): Int16Array {
        const buffer = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return buffer;
    }

    // High-quality linear interpolation downsampler to perfectly convert any hardware rate (e.g. 96000) to 16000Hz for Deepgram
    private downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
        if (inputSampleRate === outputSampleRate) return buffer;
        const sampleRateRatio = inputSampleRate / outputSampleRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const position = i * sampleRateRatio;
            const index = Math.floor(position);
            const fraction = position - index;
            if (index + 1 < buffer.length) {
                result[i] = buffer[index] * (1 - fraction) + buffer[index + 1] * fraction;
            } else {
                result[i] = buffer[index];
            }
        }
        return result;
    }

    public getAudioContext(): AudioContext | null {
        return this.audioCtx;
    }

    public getStream(): MediaStream | null {
        return this.stream;
    }

    public getSourceNode(): MediaStreamAudioSourceNode | null {
        return this.source;
    }

    private encodeWAV(samples: Float32Array, sampleRate: number = 16000): Blob {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        const writeUTFBytes = (v: DataView, offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i));
        };
        writeUTFBytes(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeUTFBytes(view, 8, 'WAVE');
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Channels (1)
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
        return new Blob([view], { type: 'audio/wav' });
    }

    async startSession(options: VoiceSessionOptions) {
        this.stopSession();
        this.isPulseActive = true;

        try {
            if (options.existingStream) {
                this.stream = options.existingStream;
                this.isExternalStream = true;
                console.log('[VoiceEngine] Using external stream provided by caller.');
            } else {
                this.isExternalStream = false;
            }

            const engine = options.engine || 'default';

            if (engine === 'browser') {
                return this.startBrowserSession(options);
            } else if (engine === 'local' || engine === 'local_pro') {
                return this.startLocalSession(options);
            } else if (engine === 'groq') {
                if (!options.customApiKey || !options.customApiKey.trim()) {
                    const err = new Error('Groq API key is required when using the Groq transcription provider. Please paste your API key in Ideanitor settings or switch to Ideanite default.');
                    console.error('[VoiceEngine]', err.message);
                    this.isPulseActive = false;
                    if (options.onError) options.onError(err);
                    return;
                }
                return this.startGroqSession(options);
            } else if (engine === 'deepgram') {
                // BYOK Deepgram - strictly enforce private API key
                if (!options.deepgramApiKey || !options.deepgramApiKey.trim()) {
                    const err = new Error('Deepgram API key is required when using the Deepgram provider. Please paste your API key in Ideanitor settings or switch to Ideanite default.');
                    console.error('[VoiceEngine]', err.message);
                    this.isPulseActive = false;
                    if (options.onError) options.onError(err);
                    return;
                }
                return this.startDeepgramSession(options, false);
            } else {
                // Ideanite Default: cloud Deepgram via Ideanite temporary token
                return this.startDeepgramSession(options, true);
            }
        } catch (err) {
            console.error('[VoiceEngine] Session start failed:', err);
            this.isPulseActive = false;
            if (options.onError) options.onError(err);
        }
    }

    private async startLocalSession(options: VoiceSessionOptions) {
        try {
            // Fast 300ms probe for desktop Electron port 41731
            let isDesktop = false;
            try {
                const isDesktopEnvironment = typeof window !== 'undefined' && Boolean((window as any).ideaniteDesktop?.isDesktop || (window as any).electron);
                if (isDesktopEnvironment && !isPublicWebHttpsEnvironment()) {
                    const res = await fetch('http://127.0.0.1:41731/health', { signal: AbortSignal.timeout(300) });
                    isDesktop = res.ok;
                }
            } catch {
                isDesktop = false;
            }

            // Warm up in-app on-device Whisper Tiny ONNX pipeline in background
            import('./onDeviceWhisper').then(({ onDeviceWhisper }) => {
                onDeviceWhisper.getTranscriber().catch((err: any) => {
                    console.warn('[VoiceEngine] On-device Whisper warm-up notice:', err);
                });
            }).catch(() => {});

            // Acquire local audio stream (reuses options.existingStream if provided by modal)
            if (!this.stream) {
                this.stream = await this.acquireStream(options);
            }

            // Audio Input Device Disconnect/Drop Protection
            this.attachStreamGuard(options, 'Local');

            const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
            try {
                this.audioCtx = new AudioCtx({ sampleRate: 16000 });
            } catch {
                this.audioCtx = new AudioCtx();
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }

            if (!this.audioCtx || !this.stream) {
                console.error('[VoiceEngine] AudioContext or Stream not initialized.');
                return;
            }

            const source = this.audioCtx.createMediaStreamSource(this.stream);
            const processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
            const gainNode = this.audioCtx.createGain();
            gainNode.gain.value = 0;

            source.connect(processor);
            processor.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            let pcmBuffer: Float32Array[] = [];
            let silenceCount = 0;
            let lastSendTime = 0;
            let isProcessing = false;
            const currentSampleRate = this.audioCtx.sampleRate || 16000;

            processor.onaudioprocess = (e: any) => {
                if (!this.isPulseActive) return;

                const inputData = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length) * 100;

                options.onVolume?.(rms);

                if (rms > 1.2) {
                    pcmBuffer.push(new Float32Array(inputData));
                    silenceCount = 0;
                } else {
                    if (pcmBuffer.length > 0) {
                        silenceCount++;
                        pcmBuffer.push(new Float32Array(inputData));
                    }
                }

                // Finalize chunk on speech pause (~1.5s) or max length (~12s)
                const silenceLimit = Math.max(4, Math.round((currentSampleRate / 4096) * 1.5));
                const maxChunks = Math.max(20, Math.round((currentSampleRate / 4096) * 12));

                if (silenceCount >= silenceLimit || pcmBuffer.length > maxChunks) {
                    if (pcmBuffer.length > 4 && !isProcessing) {
                        const finalBuffer = [...pcmBuffer];
                        isProcessing = true;
                        this.processLocalBuffer(finalBuffer, true, options, isDesktop, currentSampleRate).finally(() => {
                            isProcessing = false;
                        });
                    }
                    pcmBuffer = [];
                    silenceCount = 0;
                } else if (pcmBuffer.length > Math.round((currentSampleRate / 4096) * 3)) {
                    const now = Date.now();
                    if (now - lastSendTime > 3000 && !isProcessing) {
                        lastSendTime = now;
                        isProcessing = true;
                        this.processLocalBuffer([...pcmBuffer], false, options, isDesktop, currentSampleRate).finally(() => {
                            isProcessing = false;
                        });
                    }
                }
            };

            this.activeSession = { processor, source, gainNode };
        } catch (e: any) {
            console.error('[VoiceEngine] Local STT error:', e);
            this.isPulseActive = false;
            if (options.onError) options.onError(e);
        }
    }

    private async processLocalBuffer(
        bufferArray: Float32Array[],
        isFinal: boolean,
        options: VoiceSessionOptions,
        isDesktop: boolean = false,
        sourceSampleRate: number = 16000
    ) {
        const totalSamples = bufferArray.reduce((acc, val) => acc + val.length, 0);
        const merged = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of bufferArray) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }

        // Strictly resample to 16,000 Hz mono PCM for Whisper
        const samples16k = sourceSampleRate !== 16000
            ? AudioResampler.resampleFloat32(merged, sourceSampleRate, 16000)
            : merged;

        // 1. Try desktop port 41731 ONLY if desktop was detected
        if (isDesktop) {
            try {
                const blob = this.encodeWAV(samples16k, 16000);
                const formData = new FormData();
                formData.append('file', blob, 'audio.wav');
                formData.append('language', options.language || 'en');
                if (options.model) formData.append('model', options.model);

                const res = await fetch('http://127.0.0.1:41731/v1/audio/transcriptions', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'x-model': options.model || 'whisper_tiny',
                        'x-language': options.language || 'en'
                    },
                    signal: AbortSignal.timeout(10000)
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.text && data.text.trim().length > 0) {
                        options.onResult({ text: data.text.trim(), isFinal, engine: 'local' });
                        return;
                    }
                }
            } catch {
                // Desktop port 41731 offline or timed out, proceed to in-app on-device neural Whisper
            }
        }

        // 2. Real In-App On-Device Whisper ONNX execution (Android APK, Browser, Desktop fallback)
        try {
            const { onDeviceWhisper } = await import('./onDeviceWhisper');
            console.log(`[VoiceEngine] Running on-device Whisper Tiny STT (mode: ${onDeviceWhisper.getExecutionMode()}) on ${samples16k.length} audio samples...`);
            const transcribedText = await onDeviceWhisper.transcribe(samples16k, {
                language: options.fullLanguage || options.language || 'english'
            });

            if (transcribedText && transcribedText.trim().length > 0) {
                options.onResult({ text: transcribedText.trim(), isFinal, engine: 'local' });
            }
        } catch (whisperErr) {
            console.error('[VoiceEngine] On-device Whisper transcription failed:', whisperErr);
        }
    }

    private async startDeepgramSession(options: VoiceSessionOptions, isIdeaniteDefault: boolean = false) {
        if (!this.stream) {
            this.stream = await this.acquireStream(options);
        }

        // Phase 5, Point 34: Audio Input Device Disconnect/Drop Protection
        this.attachStreamGuard(options, 'Deepgram');

        // Reuse AudioContext!
        if (!this.audioCtx) {
            const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
            this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx!.state === 'suspended') {
            await this.audioCtx!.resume();
        }

        const hardwareSampleRate = this.audioCtx!.sampleRate;
        console.log(`[VoiceEngine] AudioContext native sample rate: ${hardwareSampleRate}Hz`);

        this.source = this.audioCtx!.createMediaStreamSource(this.stream!);

        let audioBuffer: Int16Array[] = [];
        let pcmAccumulator: Int16Array[] = [];
        let pcmAccumulatedLength = 0;
        const MIN_CHUNK_SAMPLES = 1600; // ~100ms at 16,000 Hz
        let isWsReady = false;

        const handleAudioChunk = (inputData: Float32Array) => {
            if (!this.isPulseActive) return;

            // Calculate RMS strictly for UI Visualization
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
            const rms = Math.sqrt(sum / inputData.length) * 100;
            options.onVolume?.(rms);

            // Stream continuous 16-bit PCM resampled safely to 16000Hz
            const downsampled = this.downsampleBuffer(inputData, hardwareSampleRate, 16000);
            const pcm16 = this.floatTo16BitPCM(downsampled);

            if (isWsReady) {
                pcmAccumulator.push(pcm16);
                pcmAccumulatedLength += pcm16.length;

                if (pcmAccumulatedLength >= MIN_CHUNK_SAMPLES) {
                    const merged = new Int16Array(pcmAccumulatedLength);
                    let offset = 0;
                    for (const chunk of pcmAccumulator) {
                        merged.set(chunk, offset);
                        offset += chunk.length;
                    }
                    pcmAccumulator = [];
                    pcmAccumulatedLength = 0;
                    deepgramService.sendRaw(merged.buffer as ArrayBuffer);
                }
            } else {
                audioBuffer.push(pcm16); // Buffer while connecting!
            }
        };

        let processor: any = null;
        let gainNode: GainNode | null = null;

        if (this.audioCtx!.audioWorklet) {
            try {
                const isWorkletRegistered = (this.audioCtx as any).__pcmWorkletRegistered;
                if (!isWorkletRegistered) {
                    const workletBlob = new Blob([
                        `class PCMWorkletProcessor extends AudioWorkletProcessor {
                            process(inputs) {
                                const input = inputs[0];
                                if (input && input[0]) {
                                    this.port.postMessage(input[0]);
                                }
                                return true;
                            }
                        }
                        registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);`
                    ], { type: 'application/javascript' });
                    const workletUrl = URL.createObjectURL(workletBlob);
                    await this.audioCtx!.audioWorklet.addModule(workletUrl);
                    URL.revokeObjectURL(workletUrl);
                    (this.audioCtx as any).__pcmWorkletRegistered = true;
                }

                const workletNode = new AudioWorkletNode(this.audioCtx!, 'pcm-worklet-processor');
                workletNode.port.onmessage = (e) => handleAudioChunk(e.data);
                gainNode = this.audioCtx!.createGain();
                gainNode.gain.value = 0;
                this.source.connect(workletNode);
                workletNode.connect(gainNode);
                gainNode.connect(this.audioCtx!.destination);
                processor = workletNode;
            } catch (wErr) {
                console.warn('[VoiceEngine] AudioWorklet init failed, using ScriptProcessor fallback:', wErr);
            }
        }

        if (!processor) {
            const scriptNode = this.audioCtx!.createScriptProcessor(4096, 1, 1);
            gainNode = this.audioCtx!.createGain();
            gainNode.gain.value = 0; // Silent monitoring
            this.source.connect(scriptNode);
            scriptNode.connect(gainNode);
            gainNode.connect(this.audioCtx!.destination);
            scriptNode.onaudioprocess = (e: any) => handleAudioChunk(e.inputBuffer.getChannelData(0));
            processor = scriptNode;
        }

        this.activeSession = { 
            stop: () => {
                if (pcmAccumulatedLength > 0) {
                    const merged = new Int16Array(pcmAccumulatedLength);
                    let offset = 0;
                    for (const chunk of pcmAccumulator) {
                        merged.set(chunk, offset);
                        offset += chunk.length;
                    }
                    pcmAccumulator = [];
                    pcmAccumulatedLength = 0;
                    try { deepgramService.sendRaw(merged.buffer as ArrayBuffer); } catch {}
                }
                deepgramService.stopStreaming();
            },
            processor, source: this.source, gainNode 
        };

        let apiKey: string | null = null;
        if (isIdeaniteDefault) {
            // Ideanite Default: Fetch temporary token from Edge Function
            try {
                apiKey = await this.fetchDeepgramToken(false);
            } catch (err) {
                console.warn('[VoiceEngine] Failed to get Ideanite Deepgram token, falling back to Web Speech as last resort:', err);
                this.cachedDeepgramToken = null;
                this.tokenExpiry = 0;
                if (processor) processor.disconnect();
                if (this.source) this.source.disconnect();
                if (gainNode) gainNode.disconnect();
                return this.startBrowserSession(options);
            }
        } else {
            // BYOK Deepgram: strictly require user API key
            apiKey = options.deepgramApiKey?.trim() || null;
            if (!apiKey) {
                if (processor) processor.disconnect();
                if (this.source) this.source.disconnect();
                if (gainNode) gainNode.disconnect();
                const err = new Error('Deepgram API key is required when using the Deepgram provider. Please provide your key in settings or select Ideanite Default.');
                options.onError?.(err);
                return;
            }
        }

        const connectStream = async (key: string): Promise<void> => {
            await deepgramService.startStreaming(
                key,
                options.language,
                16000,
                (result) => {
                    options.onResult({
                        text: result.text,
                        isFinal: result.isFinal,
                        engine: isIdeaniteDefault ? 'default' : 'deepgram'
                    });
                },
                (err) => {
                    console.error('[VoiceEngine] Deepgram stream error:', err);
                    if (isIdeaniteDefault) {
                        this.cachedDeepgramToken = null;
                        this.tokenExpiry = 0;
                    }
                    options.onError?.(err);
                }
            );
        };

        try {
            await connectStream(apiKey as string);
            isWsReady = true;
            console.log(`[VoiceEngine] Deepgram connected. Flushing ${audioBuffer.length} buffered chunks...`);

            // Flush all buffered audio
            for (const chunk of audioBuffer) {
                deepgramService.sendRaw(chunk.buffer as ArrayBuffer);
            }
            audioBuffer = []; // Free memory
        } catch (err) {
            console.warn('[VoiceEngine] Deepgram handshake failed:', err);
            if (isIdeaniteDefault) {
                this.cachedDeepgramToken = null;
                this.tokenExpiry = 0;
                try {
                    const freshKey = await this.fetchDeepgramToken(true);
                    await connectStream(freshKey);
                    isWsReady = true;
                    console.log(`[VoiceEngine] Deepgram connected on retry. Flushing ${audioBuffer.length} buffered chunks...`);
                    for (const chunk of audioBuffer) {
                        deepgramService.sendRaw(chunk.buffer as ArrayBuffer);
                    }
                    audioBuffer = [];
                } catch (retryErr) {
                    console.warn('[VoiceEngine] Ideanite default retry failed, activating on-device Whisper session:', retryErr);
                    this.cachedDeepgramToken = null;
                    this.tokenExpiry = 0;
                    if (processor) processor.disconnect();
                    if (this.source) this.source.disconnect();
                    if (gainNode) gainNode.disconnect();
                    return this.startLocalSession(options);
                }
            } else {
                // BYOK: strictly fail with error, do NOT fallback to Web Speech!
                if (processor) processor.disconnect();
                if (this.source) this.source.disconnect();
                if (gainNode) gainNode.disconnect();
                options.onError?.(new Error('Deepgram connection failed. Please verify your Deepgram API key.'));
            }
        }
    }

    private async fetchDeepgramToken(forceRefresh: boolean = false): Promise<string> {
        if (!forceRefresh && this.cachedDeepgramToken && Date.now() < this.tokenExpiry) {
            return this.cachedDeepgramToken;
        }

        console.log('[VoiceEngine] Requesting fresh session token from Edge Function...');
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        if (!supabaseUrl || !anonKey) {
            throw new Error('Missing Supabase credentials for Deepgram token');
        }
        const prodEndpointRes = await fetch(`${supabaseUrl}/functions/v1/get-deepgram-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': anonKey,
                'Authorization': `Bearer ${anonKey}`
            }
        });

        if (!prodEndpointRes.ok) {
            throw new Error(`Token endpoint returned HTTP ${prodEndpointRes.status}`);
        }

        const pData = await prodEndpointRes.json();
        if (!pData?.token) {
            throw new Error('Could not retrieve Deepgram temporary token.');
        }

        this.cachedDeepgramToken = pData.token;
        // Single-session tokens expire quickly on Deepgram's server, so keep client cache at 8s
        this.tokenExpiry = Date.now() + 8 * 1000; 
        return pData.token;
    }

    private async startBrowserSession(options: VoiceSessionOptions) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('[VoiceEngine] Web Speech API not available, seamlessly routing to on-device neural Whisper engine.');
            return this.startLocalSession(options);
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = options.fullLanguage || options.language;

        recognition.onresult = (event: any) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            if (final) {
                options.onResult({ text: final, isFinal: true, engine: 'browser' });
            } else if (interim) {
                options.onResult({ text: interim, isFinal: false, engine: 'browser' });
            }
        };

        recognition.onerror = (e: any) => {
            console.warn('[VoiceEngine] WebSpeech error:', e.error);
            if (e.error === 'no-speech' || e.error === 'network') {
                return;
            }
            options.onError?.(e);
        };

        recognition.onend = () => {
            if (this.isPulseActive) {
                setTimeout(() => {
                    if (this.isPulseActive) {
                        try {
                            recognition.start();
                        } catch (err) {
                            console.warn('[VoiceEngine] WebSpeech restart handled:', err);
                        }
                    }
                }, 100);
            }
        };

        this.activeSession = recognition;
        recognition.start();

        // Optional volume metering even in browser mode
        if (options.onVolume) {
            this.startVolumeMetering(options.onVolume);
        }
    }

    private async startGroqSession(options: VoiceSessionOptions) {
        if (!this.stream) {
            this.stream = await this.acquireStream(options);
        }

        // Phase 5, Point 34: Audio Input Device Disconnect/Drop Protection
        this.attachStreamGuard(options, 'Groq');
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioCtx({ sampleRate: 16000 });
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        
        if (!this.audioCtx || !this.stream) {
            console.error('[VoiceEngine] AudioContext or Stream not initialized.');
            return;
        }

        const source = this.audioCtx.createMediaStreamSource(this.stream);
        const processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = 0;
        
        source.connect(processor);
        processor.connect(gainNode);
        gainNode.connect(this.audioCtx!.destination);

        let pcmBuffer: Float32Array[] = [];
        let silenceCount = 0;
        let lastInterimSendTime = 0;
        let isProcessing = false;

        processor.onaudioprocess = (e: any) => {
            if (!this.isPulseActive) return;

            const inputData = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
            const rms = Math.sqrt(sum / inputData.length) * 100;
            
            options.onVolume?.(rms);

            // Simple VAD Gate
            if (rms > 2.5) { 
                pcmBuffer.push(new Float32Array(inputData));
                silenceCount = 0;
            } else {
                if (pcmBuffer.length > 0) {
                    silenceCount++;
                    pcmBuffer.push(new Float32Array(inputData));
                }
            }

            // Finalize chunk (on silence or max length)
            if (silenceCount >= 8 || pcmBuffer.length > 50) {
                if (pcmBuffer.length > 5 && !isProcessing) {
                    const finalBuffer = [...pcmBuffer];
                    this.processGroqBuffer(finalBuffer, true, options);
                }
                pcmBuffer = [];
                silenceCount = 0;
            } 
            // Interim update
            else if (pcmBuffer.length > 10) {
                const now = Date.now();
                if (now - lastInterimSendTime > 2000 && !isProcessing) {
                    lastInterimSendTime = now;
                    this.processGroqBuffer([...pcmBuffer], false, options);
                }
            }
        };

        this.activeSession = { processor, source, gainNode };
    }

    private async processGroqBuffer(bufferArray: Float32Array[], isFinal: boolean, options: VoiceSessionOptions) {
        const totalSamples = bufferArray.reduce((acc, val) => acc + val.length, 0);
        const merged = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of bufferArray) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        const blob = this.encodeWAV(merged, 16000);

        try {
            const text = await groqService.transcribeAudio(blob, options.language, '.', options.customApiKey);
            if (text) {
                options.onResult({ text, isFinal, engine: 'groq' });
            }
        } catch (err) {
            console.error('[UnifiedVoice] Groq Error:', err);
        }
    }

    private async startVolumeMetering(onVolume: (v: number) => void) {
        if (!this.stream) {
            this.stream = await this.acquireStream();
        }
        if (!this.audioCtx) {
            const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
            this.audioCtx = new AudioCtx();
        }
        
        const source = this.audioCtx!.createMediaStreamSource(this.stream!);
        this.source = source;
        const analyzer = this.audioCtx!.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);

        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        const poll = () => {
            if (!this.isPulseActive) return;
            analyzer.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            onVolume(sum / dataArray.length);
            requestAnimationFrame(poll);
        };
        poll();
    }

    private currentAudio: HTMLAudioElement | null = null;

    private ttsAbortController: AbortController | null = null;
    private isStreamingVoiceActive: boolean = false;
    private streamingSentenceBuffer: string = '';
    private streamingSentenceQueue: string[] = [];
    private isProcessingStreamingQueue: boolean = false;
    private streamingVoiceName: string = 'alba';

    public stopSpeaking(keepQueue: boolean = false) {
        if (!keepQueue) {
            this.isStreamingVoiceActive = false;
            this.streamingSentenceBuffer = '';
            this.streamingSentenceQueue = [];
            this.isProcessingStreamingQueue = false;
        }
        if (this.ttsAbortController) {
            this.ttsAbortController.abort();
            this.ttsAbortController = null;
        }
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.src = '';
            this.currentAudio = null;
        }
        if ('speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch {}
        }
    }

    /**
     * Starts a real-time streaming conversational voice session.
     * Tokens fed into feedStreamingToken will be buffered and synthesized
     * sentence-by-sentence as soon as boundaries are reached (<500ms latency).
     */
    public startStreamingVoice(voice?: string) {
        this.stopSpeaking();
        this.isStreamingVoiceActive = true;
        this.streamingSentenceBuffer = '';
        this.streamingSentenceQueue = [];
        this.isProcessingStreamingQueue = false;
        this.streamingVoiceName = voice || 'alba';
        console.log(`[VoiceEngine] Started real-time streaming voice with voice: ${this.streamingVoiceName}`);
    }

    /**
     * Ingests a streaming token from LLM, detects sentence boundaries (. ? ! \n),
     * and dispatches ready sentences to TTS immediately.
     */
    public feedStreamingToken(token: string) {
        if (!this.isStreamingVoiceActive) return;
        this.streamingSentenceBuffer += token;

        // Clean internal XML tags
        const sanitized = this.streamingSentenceBuffer.replace(/<[^>]*>/g, '');

        // Match sentence terminator (. ? ! or newline)
        const match = sanitized.match(/^([\s\S]*?[.!?\n]+)\s*([\s\S]*)$/);
        if (match) {
            const sentence = match[1].trim();
            this.streamingSentenceBuffer = match[2];
            if (sentence.length > 0) {
                this.streamingSentenceQueue.push(sentence);
                this.processStreamingQueue();
            }
        }
    }

    /**
     * Flushes any remaining words in the stream buffer.
     */
    public finalizeStreamingVoice() {
        if (!this.isStreamingVoiceActive) return;
        const remainder = this.streamingSentenceBuffer.replace(/<[^>]*>/g, '').trim();
        if (remainder.length > 0) {
            this.streamingSentenceQueue.push(remainder);
            this.processStreamingQueue();
        }
        this.streamingSentenceBuffer = '';
        this.isStreamingVoiceActive = false;
    }

    private async processStreamingQueue() {
        if (this.isProcessingStreamingQueue || this.streamingSentenceQueue.length === 0) {
            return;
        }

        this.isProcessingStreamingQueue = true;

        while (this.streamingSentenceQueue.length > 0) {
            const sentence = this.streamingSentenceQueue.shift();
            if (!sentence) continue;

            await new Promise<void>((resolve) => {
                this.speak(sentence, {
                    voice: this.streamingVoiceName,
                    keepQueue: true,
                    onEnd: () => resolve(),
                    onError: () => resolve()
                }).catch(() => resolve());
            });
        }

        this.isProcessingStreamingQueue = false;
    }

    public async speak(
        text: string,
        options?: {
            voice?: string;
            keepQueue?: boolean;
            onStart?: () => void;
            onEnd?: () => void;
            onError?: (err: any) => void;
        }
    ) {
        this.stopSpeaking(options?.keepQueue);
        this.ttsAbortController = new AbortController();
        const signal = this.ttsAbortController.signal;

        try {
            console.log(`[VoiceEngine] Requesting TTS for: "${text.substring(0, 30)}..."`);
            
            // 1. Try real desktop local Pocket TTS engine first (port 41731)
            let response: Response | null = null;
            if (!isPublicWebHttpsEnvironment()) {
                response = await fetch('http://127.0.0.1:41731/v1/audio/speech', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ input: text, voice: options?.voice || 'alba' }),
                    signal
                }).catch(() => null);
            }

            // 2. Try proxy /tts-api if running in web dev
            if (!response || !response.ok) {
                response = await fetch('/tts-api/v1/audio/speech', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ input: text, voice: options?.voice || 'alba' }),
                    signal
                }).catch(() => null);
            }

            if (!response || !response.ok) throw new Error('Local server TTS not available');
            
            const audioBlob = await response.blob();
            if (signal.aborted) return; // double check after fetch

            const audioUrl = URL.createObjectURL(audioBlob);
            this.currentAudio = new Audio(audioUrl);
            
            this.currentAudio.onplay = () => options?.onStart?.();
            this.currentAudio.onended = () => {
                options?.onEnd?.();
                URL.revokeObjectURL(audioUrl);
            };
            this.currentAudio.onerror = (e) => {
                options?.onError?.(e);
                URL.revokeObjectURL(audioUrl);
            };

            await this.currentAudio.play();
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log('[VoiceEngine] TTS request aborted by subsequent call');
                return;
            }
            console.warn('[VoiceEngine] Server TTS failed or unavailable, attempting on-device Kokoro-82M neural TTS:', err);
            
            // 3. Real in-app On-Device Kokoro-82M neural TTS (Android APK & offline)
            try {
                console.log('[VoiceEngine] Synthesizing speech via on-device Kokoro-82M neural TTS...');
                const { onDeviceTTS } = await import('./onDeviceTTS');
                let kokoroVoice = options?.voice;
                if (!kokoroVoice || kokoroVoice === 'alba' || kokoroVoice === 'cloned-voice') {
                    kokoroVoice = 'af_heart';
                }
                const blob = await onDeviceTTS.synthesize(text, { voice: kokoroVoice });
                if (signal.aborted) return;

                const audioUrl = URL.createObjectURL(blob);
                this.currentAudio = new Audio(audioUrl);
                this.currentAudio.onplay = () => options?.onStart?.();
                this.currentAudio.onended = () => {
                    options?.onEnd?.();
                    URL.revokeObjectURL(audioUrl);
                };
                this.currentAudio.onerror = (e) => {
                    options?.onError?.(e);
                    URL.revokeObjectURL(audioUrl);
                };
                await this.currentAudio.play();
                return;
            } catch (onDeviceErr) {
                console.warn('[VoiceEngine] On-device Kokoro TTS synthesis failed, falling back to browser speech synthesis:', onDeviceErr);
            }

            if ('speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(text);
                    if (options?.voice === 'cloned-voice') {
                        utterance.pitch = 1.0;
                        utterance.rate = 1.05;
                    }
                    // Auto-detect language or use system language for natural pronunciation
                    const hasPolish = /[ąćęłńóśźż]/i.test(text);
                    const hasGerman = /[äöüß]/i.test(text);
                    const hasSpanish = /[áéíóúñ¿¡]/i.test(text);
                    if (hasPolish) {
                        utterance.lang = 'pl-PL';
                    } else if (hasGerman) {
                        utterance.lang = 'de-DE';
                    } else if (hasSpanish) {
                        utterance.lang = 'es-ES';
                    } else {
                        utterance.lang = 'en-US';
                    }
                    utterance.onstart = () => options?.onStart?.();
                    utterance.onend = () => options?.onEnd?.();
                    utterance.onerror = (e) => options?.onError?.(e);
                    window.speechSynthesis.speak(utterance);
                    return;
                } catch (speechErr) {
                    console.error('[VoiceEngine] SpeechSynthesis error:', speechErr);
                }
            }

            options?.onError?.(err);
        }
    }

    stopSession() {
        this.isPulseActive = false;
        if (this.detachDeviceGuard) {
            this.detachDeviceGuard();
            this.detachDeviceGuard = null;
        }
        if (this.activeSession) {
            if (typeof this.activeSession.stop === 'function') this.activeSession.stop();
            if (this.activeSession.processor) {
                if (this.activeSession.processor.port) {
                    this.activeSession.processor.port.onmessage = null;
                }
                this.activeSession.processor.onaudioprocess = null; // Explicit teardown memory leak patch
                if (typeof this.activeSession.processor.disconnect === 'function') {
                    this.activeSession.processor.disconnect();
                }
                if (this.activeSession.source) this.activeSession.source.disconnect();
                if (this.activeSession.gainNode) this.activeSession.gainNode.disconnect();
            }
            this.activeSession = null;
        }
        // DO NOT close AudioContext. Reusing it prevents Chrome audio thread allocation glitches
        // which completely destroy audio buffering and cause skipped words and slow down.
        if (this.stream) {
            if (!this.isExternalStream) {
                this.stream.getTracks().forEach(t => {
                    if (t.readyState === 'live') t.stop();
                });
            }
            this.stream = null;
        }
        this.source = null;
    }
}

export const unifiedVoiceEngine = new UnifiedVoiceManager();
