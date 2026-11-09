/**
 * onDeviceTTS.ts — yolofuck stub
 */

export interface OnDeviceTTSOptions {
    voice?: string;
    speed?: number;
    onProgress?: (percent: number) => void;
}

export const onDeviceTTS = {
    async synthesize(_text: string, _options?: OnDeviceTTSOptions): Promise<Blob> {
        throw new Error('On-device TTS not enabled in yolofuck.');
    },
    getStatus(): { isReady: boolean; isInitializing: boolean } {
        return { isReady: false, isInitializing: false };
    }
};
