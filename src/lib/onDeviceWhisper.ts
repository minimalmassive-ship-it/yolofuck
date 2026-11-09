/**
 * onDeviceWhisper.ts — yolofuck stub
 * For standalone journal, STT uses Groq, Deepgram, or native browser Web Speech API.
 */

export const onDeviceWhisper = {
    async getTranscriber(): Promise<any> {
        throw new Error('On-device Whisper is not enabled in web build. Please use Browser or Deepgram STT.');
    },
    getExecutionMode(): string {
        return 'cloud-fallback';
    },
    async transcribe(_samples: Float32Array, _options?: { language?: string }): Promise<string> {
        throw new Error('On-device Whisper not installed. Fall back to cloud/browser STT.');
    }
};
