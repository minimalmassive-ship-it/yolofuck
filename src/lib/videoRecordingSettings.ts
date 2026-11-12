/**
 * videoRecordingSettings.ts v2.0.0
 *
 * Centralized configuration for video & audio recording quality and device settings,
 * used independently by Journal Video Capture and Add Video Idea flows.
 *
 * NOT connected to player/playback audio quality settings (Ideanitor/Studio).
 * This module exclusively controls the capture & recording engine parameters.
 */

import { supabase } from './supabase';
import { safeJsonParse } from './jsonHelper';

// ── Types ──────────────────────────────────────────────────────────────────

export type VideoResolution = 1080 | 720;
export type AudioBitrateKbps = 128 | 192 | 320;

export interface RecordingScopeConfig {
    resolution: VideoResolution;
    videoBitrateMbps: number;
    audioBitrateKbps: AudioBitrateKbps;
    studioAudio: boolean;
}

export interface JournalRecordingConfig extends RecordingScopeConfig {
    localStorageOnly: boolean;
}

export interface MediaRecordingSettings {
    journal: JournalRecordingConfig;
    idea: RecordingScopeConfig;
}

// ── Default Values ─────────────────────────────────────────────────────────
// Default: 4.0 Mbps video, 192 kbps audio, 1080x1080 resolution, studio audio enabled.
export const DEFAULT_VIDEO_BITRATE_MBPS = 4.0;
export const DEFAULT_AUDIO_BITRATE_KBPS: AudioBitrateKbps = 192;
export const DEFAULT_RESOLUTION: VideoResolution = 1080;

export const DEFAULT_MEDIA_RECORDING_SETTINGS: MediaRecordingSettings = {
    journal: {
        resolution: DEFAULT_RESOLUTION,
        videoBitrateMbps: DEFAULT_VIDEO_BITRATE_MBPS,
        audioBitrateKbps: DEFAULT_AUDIO_BITRATE_KBPS,
        studioAudio: true,
        localStorageOnly: false,
    },
    idea: {
        resolution: DEFAULT_RESOLUTION,
        videoBitrateMbps: DEFAULT_VIDEO_BITRATE_MBPS,
        audioBitrateKbps: DEFAULT_AUDIO_BITRATE_KBPS,
        studioAudio: true,
    },
};

// ── Selection Options ──────────────────────────────────────────────────────

export const VIDEO_RESOLUTION_OPTIONS: { value: VideoResolution; label: string; description: string }[] = [
    { value: 1080, label: '1080 x 1920 (Full HD 9:16)', description: 'Crisp, high-definition vertical video shorts (1080p)' },
    { value: 720, label: '720 x 1280 (HD 9:16)', description: 'Compact vertical video canvas for lower bandwidth (720p)' },
];

export const AUDIO_BITRATE_OPTIONS: { value: AudioBitrateKbps; label: string; description: string }[] = [
    { value: 128, label: '128 kbps (Standard)', description: 'Clean vocal clarity with minimal file size' },
    { value: 192, label: '192 kbps (Mid / Recommended)', description: 'Near-CD studio audio recording fidelity' },
    { value: 320, label: '320 kbps (Ultra Studio)', description: 'Maximum lossless-like audio bitstream' },
];

export const VIDEO_BITRATE_PRESETS = [
    { value: 2.5, label: '2.5 Mbps (Low)' },
    { value: 4.0, label: '4.0 Mbps (Default)' },
    { value: 6.0, label: '6.0 Mbps (High / Broadcast)' },
    { value: 8.0, label: '8.0 Mbps (Ultra)' },
];

// ── Friendly Device Label Parser ───────────────────────────────────────────

export interface CameraLensOption {
    deviceId: string;
    label: string;
    facing: 'user' | 'environment';
    isMain?: boolean;
}

/**
 * Resolves raw hardware camera devices into clean, user-friendly lens labels
 * (e.g. "Wide Lens (Main 1x)", "Ultra-Wide Lens (0.5x)", "Front Camera (Selfie)", "Telephoto Lens (Zoom)").
 * Specially tuned for Android Camera2 HAL numbering (camera 0, camera 1, camera 2...),
 * iOS Safari multi-camera devices, and desktop webcams.
 */
export function resolveCameraLensOptions(
    videoDevices: MediaDeviceInfo[],
    activeDeviceId?: string | null,
    activeFacing?: 'user' | 'environment',
): CameraLensOption[] {
    if (!videoDevices || videoDevices.length === 0) {
        return [];
    }

    interface ProcessedDevice {
        device: MediaDeviceInfo;
        index: number;
        rawLabel: string;
        cleanLabel: string;
        detectedFacing: 'user' | 'environment' | 'unknown';
        explicitType: 'wide' | 'ultra' | 'telephoto' | 'macro' | 'front' | 'unknown';
        cameraNumber: number | null;
    }

    const parsed: ProcessedDevice[] = videoDevices.map((d, i) => {
        const rawLabel = (d.label || '').trim();
        const lower = rawLabel.toLowerCase();

        // Extract camera number if present (e.g. "camera 0", "camera2 1", "camera 2", "1, facing back")
        const camNumMatch = lower.match(/camera\d*\s*(\d+)/i) || lower.match(/^(\d+)[,\s]/);
        const cameraNumber = camNumMatch ? parseInt(camNumMatch[1], 10) : null;

        // Facing detection from label keywords
        let detectedFacing: 'user' | 'environment' | 'unknown' = 'unknown';
        if (
            lower.includes('front') ||
            lower.includes('selfie') ||
            lower.includes('user') ||
            lower.includes('facing front')
        ) {
            detectedFacing = 'user';
        } else if (
            lower.includes('back') ||
            lower.includes('rear') ||
            lower.includes('environment') ||
            lower.includes('facing back')
        ) {
            detectedFacing = 'environment';
        } else if (cameraNumber !== null) {
            // Android Camera2 HAL conventions:
            // Camera 0 is almost universally Back (Main 1x)
            // Camera 1 is almost universally Front (Selfie)
            // Camera 2 is Back (Ultra-Wide 0.5x)
            // Camera 3 is Back (Telephoto Zoom)
            if (cameraNumber === 0) {
                detectedFacing = 'environment';
            } else if (cameraNumber === 1 && videoDevices.length > 1) {
                detectedFacing = 'user';
            } else if (cameraNumber >= 2) {
                detectedFacing = 'environment';
            }
        }

        // Active track verification: if this device matches the currently active stream
        if (activeDeviceId && d.deviceId === activeDeviceId && activeFacing) {
            detectedFacing = activeFacing;
        }

        // Explicit lens type detection from label
        let explicitType: 'wide' | 'ultra' | 'telephoto' | 'macro' | 'front' | 'unknown' = 'unknown';
        if (
            lower.includes('ultra') ||
            lower.includes('0.5x') ||
            lower.includes('0.6x') ||
            lower.includes('wide-angle') ||
            lower.includes('wide angle')
        ) {
            explicitType = 'ultra';
        } else if (
            lower.includes('telephoto') ||
            lower.includes('zoom') ||
            lower.includes('2x') ||
            lower.includes('3x') ||
            lower.includes('5x') ||
            lower.includes('10x')
        ) {
            explicitType = 'telephoto';
        } else if (lower.includes('macro')) {
            explicitType = 'macro';
        } else if (
            lower.includes('wide') ||
            lower.includes('main') ||
            lower.includes('primary') ||
            lower.includes('1x')
        ) {
            explicitType = 'wide';
        } else if (detectedFacing === 'user') {
            explicitType = 'front';
        }

        // Clean label: remove hex codes like (04f2:b6d9)
        const cleanLabel = rawLabel.replace(/\([0-9a-f:]+\)/gi, '').trim();

        return {
            device: d,
            index: i,
            rawLabel,
            cleanLabel,
            detectedFacing,
            explicitType,
            cameraNumber,
        };
    });

    // Resolve facing for any remaining 'unknown' devices
    if (parsed.length === 2) {
        if (parsed[0].detectedFacing === 'unknown' && parsed[1].detectedFacing === 'unknown') {
            parsed[0].detectedFacing = 'environment';
            parsed[1].detectedFacing = 'user';
        } else if (parsed[0].detectedFacing === 'user' && parsed[1].detectedFacing === 'unknown') {
            parsed[1].detectedFacing = 'environment';
        } else if (parsed[0].detectedFacing === 'environment' && parsed[1].detectedFacing === 'unknown') {
            parsed[1].detectedFacing = 'user';
        } else if (parsed[1].detectedFacing === 'user' && parsed[0].detectedFacing === 'unknown') {
            parsed[0].detectedFacing = 'environment';
        } else if (parsed[1].detectedFacing === 'environment' && parsed[0].detectedFacing === 'unknown') {
            parsed[0].detectedFacing = 'user';
        }
    } else {
        parsed.forEach((p, idx) => {
            if (p.detectedFacing === 'unknown') {
                p.detectedFacing = idx === 0 ? 'environment' : 'user';
            }
        });
    }

    const backCameras = parsed.filter(p => p.detectedFacing === 'environment');
    const frontCameras = parsed.filter(p => p.detectedFacing === 'user');

    // Assign user-friendly labels to Back Cameras
    const backLensOptions: CameraLensOption[] = backCameras.map((p, bIdx) => {
        let label = '';
        let isMain = false;

        const isGenericLabel =
            !p.cleanLabel ||
            /^(camera\d*|lens\d*|\d+)/i.test(p.cleanLabel) ||
            p.cleanLabel.toLowerCase().includes('facing');

        if (!isGenericLabel && p.cleanLabel.length > 0 && !p.cleanLabel.toLowerCase().includes('camera')) {
            // Keep brand webcam or external device name (e.g. Logitech C920, OBS Virtual)
            label = p.cleanLabel;
            isMain = bIdx === 0;
        } else if (p.explicitType === 'ultra') {
            label = 'Ultra-Wide Lens (0.5x)';
        } else if (p.explicitType === 'telephoto') {
            label = 'Telephoto Lens (Zoom)';
        } else if (p.explicitType === 'macro') {
            label = 'Macro Lens';
        } else if (p.explicitType === 'wide') {
            label = 'Wide Lens (Main 1x)';
            isMain = true;
        } else {
            // Positional mapping for multi-rear cameras
            if (backCameras.length === 1) {
                label = 'Wide Lens (Main 1x)';
                isMain = true;
            } else if (bIdx === 0) {
                label = 'Wide Lens (Main 1x)';
                isMain = true;
            } else if (bIdx === 1) {
                label = 'Ultra-Wide Lens (0.5x)';
            } else if (bIdx === 2) {
                label = 'Telephoto Lens (Zoom)';
            } else if (bIdx === 3) {
                label = 'Macro Lens';
            } else {
                label = `Rear Lens ${bIdx + 1}`;
            }
        }

        return {
            deviceId: p.device.deviceId,
            label,
            facing: 'environment',
            isMain,
        };
    });

    // Assign user-friendly labels to Front Cameras
    const frontLensOptions: CameraLensOption[] = frontCameras.map((p, fIdx) => {
        let label = '';
        const isGenericLabel =
            !p.cleanLabel ||
            /^(camera\d*|lens\d*|\d+)/i.test(p.cleanLabel) ||
            p.cleanLabel.toLowerCase().includes('facing');

        if (!isGenericLabel && p.cleanLabel.length > 0 && !p.cleanLabel.toLowerCase().includes('camera')) {
            label = p.cleanLabel;
        } else if (p.explicitType === 'ultra' || (frontCameras.length > 1 && fIdx > 0)) {
            label = 'Front Ultra-Wide';
        } else {
            label = 'Front Camera (Selfie)';
        }

        return {
            deviceId: p.device.deviceId,
            label,
            facing: 'user',
            isMain: fIdx === 0,
        };
    });

    // Preserve the original order of video devices
    const finalOptions: CameraLensOption[] = [];
    parsed.forEach(p => {
        const foundBack = backLensOptions.find(b => b.deviceId === p.device.deviceId);
        if (foundBack) {
            finalOptions.push(foundBack);
        } else {
            const foundFront = frontLensOptions.find(f => f.deviceId === p.device.deviceId);
            if (foundFront) {
                finalOptions.push(foundFront);
            }
        }
    });

    return finalOptions;
}

/**
 * Convenience single-device label parser.
 */
export function getFriendlyCameraLabel(device: MediaDeviceInfo, index = 0): string {
    const resolved = resolveCameraLensOptions([device]);
    if (resolved.length > 0 && resolved[0].label) {
        return resolved[0].label;
    }
    return `Camera ${index + 1}`;
}

// ── Constraint & Recorder Helpers ──────────────────────────────────────────

/**
 * Builds getUserMedia audio constraints.
 * If studioAudio is enabled (default), browser speech suppression filters
 * (echo cancellation, noise suppression, automatic gain control) are disabled
 * to preserve raw acoustic audio fidelity.
 */
export function buildAudioConstraints(studioAudio = true): MediaTrackConstraints | boolean {
    if (studioAudio) {
        return {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: 1 },
        };
    }
    // Processed mode: let the browser use standard phone-call filters
    return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    };
}

/**
 * Builds getUserMedia video constraints for a 1:1 square recording canvas.
 */
export function buildVideoConstraints(
    resolution: VideoResolution = DEFAULT_RESOLUTION,
    facingMode: 'user' | 'environment' = 'user',
    deviceId?: string,
): MediaTrackConstraints {
    // 9:16 vertical shorts ratio for Memcut
    const targetHeight = resolution >= 1080 ? 1920 : 1280;
    const targetWidth = resolution >= 1080 ? 1080 : 720;

    const constraints: MediaTrackConstraints = {
        width: { ideal: targetWidth },
        height: { ideal: targetHeight },
        aspectRatio: { ideal: 9 / 16 },
    };

    if (deviceId) {
        constraints.deviceId = { ideal: deviceId };
        constraints.facingMode = facingMode;
    } else {
        constraints.facingMode = facingMode;
    }

    return constraints;
}

/**
 * Builds MediaRecorder options with user-configured bitrates in bps.
 */
export function buildMediaRecorderOptions(
    videoBitrateMbps: number,
    audioBitrateKbps: AudioBitrateKbps,
    mimeType?: string,
): MediaRecorderOptions {
    const options: MediaRecorderOptions = {
        videoBitsPerSecond: Math.round(videoBitrateMbps * 1_000_000),
        audioBitsPerSecond: Math.round(audioBitrateKbps * 1_000),
    };
    if (mimeType) {
        options.mimeType = mimeType;
    }
    return options;
}

// ── Profile Parsing & Loading ──────────────────────────────────────────────

/**
 * Extracts MediaRecordingSettings from a Supabase profile.settings object with full backward compatibility.
 */
export function getMediaSettingsFromProfile(profileSettings: Record<string, any> | null | undefined): MediaRecordingSettings {
    const s = profileSettings || {};

    // Determine legacy fallback quality if present
    let legacyVideoMbps = DEFAULT_VIDEO_BITRATE_MBPS;
    let legacyAudioKbps: AudioBitrateKbps = DEFAULT_AUDIO_BITRATE_KBPS;
    if (s.video_recording_quality === 'low') {
        legacyVideoMbps = 2.5;
        legacyAudioKbps = 128;
    } else if (s.video_recording_quality === 'high') {
        legacyVideoMbps = 8.0;
        legacyAudioKbps = 192;
    }

    const legacyResolution: VideoResolution = s.video_recording_resolution === 720 ? 720 : 1080;

    // Journal settings
    const journalRes: VideoResolution = s.journal_video_resolution === 720 ? 720 : (s.journal_video_resolution === 1080 ? 1080 : legacyResolution);
    const journalVideoMbps = typeof s.journal_video_bitrate_mbps === 'number' && s.journal_video_bitrate_mbps > 0
        ? s.journal_video_bitrate_mbps
        : legacyVideoMbps;
    const journalAudioKbps: AudioBitrateKbps = [128, 192, 320].includes(s.journal_audio_bitrate_kbps)
        ? s.journal_audio_bitrate_kbps
        : legacyAudioKbps;
    const journalStudio = typeof s.journal_studio_audio === 'boolean' ? s.journal_studio_audio : true;
    const journalLocalStorageOnly = Boolean(s.journal_local_storage_only);

    // Idea settings
    const ideaRes: VideoResolution = s.idea_video_resolution === 720 ? 720 : (s.idea_video_resolution === 1080 ? 1080 : legacyResolution);
    const ideaVideoMbps = typeof s.idea_video_bitrate_mbps === 'number' && s.idea_video_bitrate_mbps > 0
        ? s.idea_video_bitrate_mbps
        : legacyVideoMbps;
    const ideaAudioKbps: AudioBitrateKbps = [128, 192, 320].includes(s.idea_audio_bitrate_kbps)
        ? s.idea_audio_bitrate_kbps
        : legacyAudioKbps;
    const ideaStudio = typeof s.idea_studio_audio === 'boolean' ? s.idea_studio_audio : true;

    return {
        journal: {
            resolution: journalRes,
            videoBitrateMbps: journalVideoMbps,
            audioBitrateKbps: journalAudioKbps,
            studioAudio: journalStudio,
            localStorageOnly: journalLocalStorageOnly,
        },
        idea: {
            resolution: ideaRes,
            videoBitrateMbps: ideaVideoMbps,
            audioBitrateKbps: ideaAudioKbps,
            studioAudio: ideaStudio,
        },
    };
}

/**
 * Loads media recording settings from the database for a specific user.
 */
export async function loadMediaSettings(userId?: string): Promise<MediaRecordingSettings> {
    if (!userId) {
        return DEFAULT_MEDIA_RECORDING_SETTINGS;
    }
    try {
        const { data } = await supabase
            .from('profiles')
            .select('settings')
            .eq('id', userId)
            .maybeSingle();

        const parsed = safeJsonParse(data?.settings, {});
        return getMediaSettingsFromProfile(parsed);
    } catch (err) {
        console.warn('[VideoRecordingSettings] Failed to fetch settings, using defaults:', err);
        return DEFAULT_MEDIA_RECORDING_SETTINGS;
    }
}

// ── Transcription & AI Cockpit Settings ────────────────────────────────────

export interface TranscriptionSettings {
    ai_provider: string;
    ai_model: string;
    custom_api_key: string;
    transcription_engine: string;
    transcription_model: string;
    deepgram_api_key: string;
}

export const DEFAULT_TRANSCRIPTION_SETTINGS: TranscriptionSettings = {
    ai_provider: '',
    ai_model: '',
    custom_api_key: '',
    transcription_engine: 'browser',
    transcription_model: 'native',
    deepgram_api_key: '',
};

export function getTranscriptionSettingsFromProfile(profileSettings: Record<string, any> | null | undefined): TranscriptionSettings {
    const s = profileSettings || {};
    return {
        ai_provider: typeof s.ai_provider === 'string' ? s.ai_provider : '',
        ai_model: typeof s.ai_model === 'string' ? s.ai_model : '',
        custom_api_key: typeof s.custom_api_key === 'string' ? s.custom_api_key : '',
        transcription_engine: typeof s.transcription_engine === 'string' && s.transcription_engine ? s.transcription_engine : 'browser',
        transcription_model: typeof s.transcription_model === 'string' && s.transcription_model ? s.transcription_model : 'native',
        deepgram_api_key: typeof s.deepgram_api_key === 'string' ? s.deepgram_api_key : '',
    };
}

