/**
 * JournalVideoCaptureModal.tsx — yolofuck
 * 
 * Immersive Full-Screen 9:16 Video Shorts Recorder:
 * - 9:16 vertical recording format with full-screen camera viewfinder
 * - Top bar: Orange time pill (00:00 / 00:30) on left, Front/Back toggle in middle, 30s left on right
 * - Live floating captions: max 3 rows of newest transcription directly on video
 * - Bottom control bar pill: Exit button on left, Red Plus in very center, Hold-to-Record on right
 * - Speech transcription is ALWAYS ON and attached to video clips for spoken word search
 * - 30-second session limit per take with auto-save
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Plus, X, Video, FlipHorizontal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { saveClip, syncDailyVideoEntry, getLocalDateISO } from '../lib/journalStoryService';
import {
    getMediaSettingsFromProfile,
    buildMediaRecorderOptions,
    buildVideoConstraints,
    buildAudioConstraints,
    resolveCameraLensOptions,
    CameraLensOption,
} from '../lib/videoRecordingSettings';
import { saveLocalJournalRecording } from '../lib/journalLocalStorage';
import './JournalVideoCaptureModal.css';

interface JournalVideoCaptureModalProps {
    onClose: () => void;
    projectId: string | null;
    onClipSaved?: () => void;
}

const MAX_SESSION_MS = 30000; // 30-second session limit

function getPreferredMimeType(): string {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS || isSafari) {
        if (MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) return 'video/mp4; codecs=avc1';
    }
    if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9,opus')) return 'video/webm; codecs=vp9,opus';
    if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus')) return 'video/webm; codecs=vp8,opus';
    if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
    if (MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) return 'video/mp4; codecs=avc1';
    return 'video/mp4';
}

function safeJsonParse(val: any): any {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch {
        return {};
    }
}

function formatSessionTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

export const JournalVideoCaptureModal: React.FC<JournalVideoCaptureModalProps> = ({
    onClose,
    projectId,
    onClipSaved,
}) => {
    const { user, profile } = useAuth();

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<any>(null);
    const recordStartTimeRef = useRef<number>(0);
    const mimeTypeRef = useRef<string>('');
    const speechRecognitionRef = useRef<any>(null);

    // Load media settings from profile
    const mediaConfig = getMediaSettingsFromProfile(profile?.settings);
    const journalConfig = mediaConfig.journal;

    // Camera states
    const [cameraReady, setCameraReady] = useState(false);
    const [activeFacingMode, setActiveFacingMode] = useState<'user' | 'environment'>('user');
    const [availableLenses, setAvailableLenses] = useState<CameraLensOption[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [currentTakeMs, setCurrentTakeMs] = useState(0);
    const [recordedClips, setRecordedClips] = useState<{ blob: Blob; durationMs: number }[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Live transcription state (always active in background for searchability)
    const [transcription, setTranscription] = useState('');
    const [liveWord, setLiveWord] = useState('');

    const savedDurationMs = recordedClips.reduce((acc, c) => acc + c.durationMs, 0);
    const totalSessionDurationMs = savedDurationMs + currentTakeMs;
    const remainingMs = Math.max(0, MAX_SESSION_MS - totalSessionDurationMs);

    // ── Camera Initialization (9:16 Vertical Ratio) ──
    const initCamera = useCallback(async (facing: 'user' | 'environment' = activeFacingMode, devId: string | null = selectedDeviceId) => {
        setCameraReady(false);
        setError(null);

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        const candidateConstraints: MediaStreamConstraints[] = [
            {
                audio: buildAudioConstraints(journalConfig.studioAudio),
                video: buildVideoConstraints(journalConfig.resolution, facing, devId || undefined),
            },
            {
                audio: true,
                video: buildVideoConstraints(journalConfig.resolution, facing, devId || undefined),
            },
            {
                audio: true,
                video: {
                    facingMode: facing,
                    aspectRatio: { ideal: 9 / 16 },
                },
            },
            {
                audio: true,
                video: true,
            },
        ];

        let activeStream: MediaStream | null = null;
        for (const constraints of candidateConstraints) {
            try {
                activeStream = await navigator.mediaDevices.getUserMedia(constraints);
                if (activeStream) break;
            } catch (e) {
                console.warn('[JournalCapture] Constraint candidate fallback:', e);
            }
        }

        if (activeStream) {
            streamRef.current = activeStream;
            mimeTypeRef.current = getPreferredMimeType();
            setCameraReady(true);

            const videoTrack = activeStream.getVideoTracks()[0];
            let activeDevId: string | null = devId;
            let resolvedFacing: 'user' | 'environment' = facing;

            if (videoTrack && typeof videoTrack.getSettings === 'function') {
                try {
                    const settings = videoTrack.getSettings();
                    if (settings.deviceId) activeDevId = settings.deviceId;
                    if (settings.facingMode === 'user' || settings.facingMode === 'environment') {
                        resolvedFacing = settings.facingMode;
                        setActiveFacingMode(settings.facingMode);
                    }
                } catch {}
            }

            // Enumerate devices for camera lenses
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevs = devices.filter(d => d.kind === 'videoinput');
                const lenses = resolveCameraLensOptions(videoDevs, activeDevId, resolvedFacing);
                setAvailableLenses(lenses);
            } catch {}
        } else {
            setError('Could not access camera. Please check camera and microphone permissions.');
        }
    }, [activeFacingMode, selectedDeviceId, journalConfig.resolution]);

    // Initial mount
    useEffect(() => {
        initCamera();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, []);

    // Ensure video element plays viewfinder
    useEffect(() => {
        if (cameraReady && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
        }
    }, [cameraReady]);

    // Flip Camera handler
    const handleFlipCamera = useCallback(async () => {
        if (isRecording) return;
        const nextFacing = activeFacingMode === 'user' ? 'environment' : 'user';
        setActiveFacingMode(nextFacing);

        const targetLens = availableLenses.find(l => l.facing === nextFacing && l.isMain)
            || availableLenses.find(l => l.facing === nextFacing);
        const nextDevId = targetLens?.deviceId || null;
        setSelectedDeviceId(nextDevId);
        await initCamera(nextFacing, nextDevId);
    }, [activeFacingMode, isRecording, availableLenses, initCamera]);

    // ── Close / Exit Without Saving ──
    const handleClose = () => {
        if (speechRecognitionRef.current) {
            try { speechRecognitionRef.current.stop(); } catch {}
            speechRecognitionRef.current = null;
        }
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        onClose();
    };

    // ── Save Function ──
    const handleSave = useCallback(async () => {
        if (!user?.id || (recordedClips.length === 0 && !isRecording) || isSaving) return;
        setIsSaving(true);

        if (speechRecognitionRef.current) {
            try { speechRecognitionRef.current.stop(); } catch {}
            speechRecognitionRef.current = null;
        }

        try {
            if (recorderRef.current && recorderRef.current.state === 'recording') {
                recorderRef.current.stop();
                setIsRecording(false);
            }

            const fullTranscription = (transcription + ' ' + liveWord).trim();
            const nowBase = Date.now();

            // Save to IndexedDB local storage
            for (let i = 0; i < recordedClips.length; i++) {
                const clip = recordedClips[i];
                await saveLocalJournalRecording({
                    blob: clip.blob,
                    durationMs: clip.durationMs,
                    transcription: fullTranscription,
                    title: `Journal Take ${i + 1} (${new Date().toLocaleDateString()})`,
                    userId: user.id,
                    createdAt: new Date(nowBase + i * 500).toISOString(),
                });
            }

            // Also upload to Supabase cloud if online
            if (!journalConfig.localStorageOnly) {
                let firstThumbBlob: Blob | null = null;
                if (recordedClips.length > 0 && recordedClips[0].blob) {
                    try {
                        firstThumbBlob = await new Promise<Blob | null>((resolve) => {
                            const v = document.createElement('video');
                            v.preload = 'metadata';
                            v.muted = true;
                            v.playsInline = true;
                            const u = URL.createObjectURL(recordedClips[0].blob);
                            v.src = u;
                            const timer = setTimeout(() => {
                                URL.revokeObjectURL(u);
                                resolve(null);
                            }, 5000);
                            v.onloadeddata = () => {
                                v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
                            };
                            v.onseeked = () => {
                                clearTimeout(timer);
                                try {
                                    const c = document.createElement('canvas');
                                    c.width = v.videoWidth || 540;
                                    c.height = v.videoHeight || 960;
                                    const ctx = c.getContext('2d');
                                    if (ctx) {
                                        ctx.drawImage(v, 0, 0, c.width, c.height);
                                        c.toBlob((b) => {
                                            URL.revokeObjectURL(u);
                                            resolve(b);
                                        }, 'image/jpeg', 0.88);
                                        return;
                                    }
                                } catch {}
                                URL.revokeObjectURL(u);
                                resolve(null);
                            };
                            v.onerror = () => {
                                clearTimeout(timer);
                                URL.revokeObjectURL(u);
                                resolve(null);
                            };
                        });
                    } catch {}
                }

                for (let i = 0; i < recordedClips.length; i++) {
                    const clip = recordedClips[i];
                    await saveClip(
                        user.id,
                        projectId,
                        clip.blob,
                        fullTranscription || null, // attached transcription in background
                        i,
                        clip.durationMs,
                        i === 0 ? firstThumbBlob : null
                    );
                }

                await syncDailyVideoEntry(user.id, projectId, getLocalDateISO());
            }

            // Dispatch global event to refresh the journal grid
            window.dispatchEvent(new CustomEvent('journal_clip_saved', { detail: { date: getLocalDateISO() } }));

            onClipSaved?.();
            handleClose();
        } catch (err) {
            console.error('[JournalCapture] Save error:', err);
            setError('Failed to save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }, [user?.id, recordedClips, isRecording, isSaving, projectId, transcription, liveWord, onClipSaved, journalConfig.localStorageOnly]);

    // ── 30-Second Limit Watcher (Smooth 30ms interval for 0.00 timer precision) ──
    useEffect(() => {
        if (isRecording) {
            timerIntervalRef.current = setInterval(() => {
                const currentDuration = Date.now() - recordStartTimeRef.current;
                setCurrentTakeMs(currentDuration);

                // If total reaches 30s limit -> auto stop and save
                if (savedDurationMs + currentDuration >= MAX_SESSION_MS) {
                    if (recorderRef.current && recorderRef.current.state === 'recording') {
                        recorderRef.current.stop();
                    }
                    clearInterval(timerIntervalRef.current);
                    setIsRecording(false);
                    setTimeout(() => {
                        handleSave();
                    }, 200);
                }
            }, 30);
        } else {
            setCurrentTakeMs(0);
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isRecording, savedDurationMs, handleSave]);

    // ── Recording Controls ──
    const startRecording = useCallback(() => {
        if (!streamRef.current || isRecording || remainingMs <= 0) return;

        chunksRef.current = [];
        recordStartTimeRef.current = Date.now();
        setCurrentTakeMs(0);

        try {
            const recorderOptions = buildMediaRecorderOptions(
                journalConfig.videoBitrateMbps,
                journalConfig.audioBitrateKbps,
                mimeTypeRef.current || undefined
            );

            const recorder = new MediaRecorder(streamRef.current, recorderOptions);

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const durationMs = Date.now() - recordStartTimeRef.current;
                const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'video/webm' });
                if (blob.size > 0) {
                    setRecordedClips(prev => [...prev, { blob, durationMs }]);
                }
                chunksRef.current = [];
            };

            recorder.start(100);
            recorderRef.current = recorder;
            setIsRecording(true);

            // Launch background speech recognition for live captions & searchable transcription
            const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRec) {
                try {
                    if (speechRecognitionRef.current) {
                        try { speechRecognitionRef.current.stop(); } catch {}
                    }
                    const rec = new SpeechRec();
                    rec.continuous = true;
                    rec.interimResults = true;
                    rec.lang = navigator.language || 'en-US';

                    rec.onresult = (evt: any) => {
                        let interim = '';
                        let finalChunk = '';
                        for (let i = evt.resultIndex; i < evt.results.length; ++i) {
                            if (evt.results[i].isFinal) {
                                finalChunk += evt.results[i][0].transcript + ' ';
                            } else {
                                interim += evt.results[i][0].transcript;
                            }
                        }
                        if (finalChunk) {
                            setTranscription(prev => (prev + ' ' + finalChunk).trim());
                        }
                        setLiveWord(interim);
                    };

                    rec.onerror = (e: any) => {
                        if (e.error !== 'no-speech' && e.error !== 'network') {
                            console.warn('[JournalCapture] Speech recognition warning:', e.error);
                        }
                    };

                    rec.onend = () => {
                        if (recorderRef.current && recorderRef.current.state === 'recording') {
                            try { rec.start(); } catch {}
                        }
                    };

                    rec.start();
                    speechRecognitionRef.current = rec;
                } catch (recErr) {
                    console.warn('[JournalCapture] Speech recognition start error:', recErr);
                }
            }
        } catch (err) {
            console.error('[JournalCapture] MediaRecorder start error:', err);
        }
    }, [isRecording, remainingMs, journalConfig.videoBitrateMbps, journalConfig.audioBitrateKbps]);

    const stopRecording = useCallback(() => {
        if (speechRecognitionRef.current) {
            try { speechRecognitionRef.current.stop(); } catch {}
            speechRecognitionRef.current = null;
        }
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
            recorderRef.current = null;
            setIsRecording(false);
        }
    }, []);

    // Pointer events for hold-to-record
    const handleRecordPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        startRecording();
    };

    const handleRecordPointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        stopRecording();
    };

    const handleRecordPointerLeave = () => {
        if (isRecording) stopRecording();
    };

    // Calculate max 3 rows / current sentence of transcription to display live
    const displayedCaption = React.useMemo(() => {
        const text = (transcription + ' ' + liveWord).trim();
        if (!text) return '';
        // Extract the last 15-20 words to show current spoken sentence without cluttering
        const words = text.split(/\s+/);
        if (words.length <= 18) return text;
        return words.slice(-18).join(' ');
    }, [transcription, liveWord]);

    const portal = (
        <div className="yolofuck-recorder-fullscreen">
            {/* Viewport: 9:16 vertical shorts full screen container (Tap anywhere to record) */}
            <div
                className={`yolofuck-recorder-viewport ${isRecording ? 'is-recording-active' : ''}`}
                onPointerDown={handleRecordPointerDown}
                onPointerUp={handleRecordPointerUp}
                onPointerLeave={handleRecordPointerLeave}
                onPointerCancel={handleRecordPointerLeave}
            >
                {cameraReady ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="yolofuck-recorder-video"
                        style={{ transform: activeFacingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                        onLoadedMetadata={() => {
                            videoRef.current?.play().catch(() => {});
                        }}
                    />
                ) : (
                    <div className="yolofuck-camera-error" onPointerDown={(e) => e.stopPropagation()}>
                        <Video size={48} color="#64748b" />
                        <span style={{ textAlign: 'center', maxWidth: '280px', lineHeight: 1.5 }}>
                            {error || 'Initializing 9:16 camera...'}
                        </span>
                        {error && (
                            <button
                                type="button"
                                className="yolofuck-camera-retry-btn"
                                onClick={() => initCamera(activeFacingMode, selectedDeviceId)}
                                onPointerDown={(e) => e.stopPropagation()}
                                onPointerUp={(e) => e.stopPropagation()}
                            >
                                Retry Camera
                            </button>
                        )}
                    </div>
                )}

                {/* ── Active Recording Badge ── */}
                {isRecording && (
                    <div className="yolofuck-recording-live-tag">
                        <span className="yolofuck-recording-live-dot" />
                        Recording
                    </div>
                )}

                {/* ── Top Bar Controls ── */}
                <div className="yolofuck-recorder-topbar">
                    {/* Left: Stopwatch showing elapsed seconds from 0.00 without 's' */}
                    <div className="yolofuck-timer-pill" onPointerDown={(e) => e.stopPropagation()}>
                        {(totalSessionDurationMs / 1000).toFixed(2)}
                    </div>

                    {/* Middle: Front / Back Camera Flip Button */}
                    <button
                        type="button"
                        className="yolofuck-flip-btn"
                        onClick={handleFlipCamera}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        title={`Switch to ${activeFacingMode === 'user' ? 'Back' : 'Front'} Camera`}
                        disabled={isRecording}
                    >
                        <FlipHorizontal size={16} />
                        <span>{activeFacingMode === 'user' ? 'Front' : 'Back'}</span>
                    </button>

                    {/* Right: Number of takes recorded in this session */}
                    <div className="yolofuck-remaining-pill" onPointerDown={(e) => e.stopPropagation()}>
                        {recordedClips.length} {recordedClips.length === 1 ? 'take' : 'takes'}
                    </div>
                </div>

                {/* ── Live Floating Captions (Max 3 lines on top of video) ── */}
                {displayedCaption && (
                    <div className="yolofuck-live-caption-overlay">
                        <p className="yolofuck-live-caption-text">
                            {displayedCaption}
                        </p>
                    </div>
                )}

                {/* ── Bottom Controls (No pill background, clean floating icons) ── */}
                <div className="yolofuck-bottom-controls-wrap">
                    {/* Left: Minimalist exit X button without text */}
                    <button
                        type="button"
                        className="yolofuck-ctrl-exit"
                        onClick={handleClose}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        title="Exit"
                    >
                        <X size={26} strokeWidth={2.5} />
                    </button>

                    {/* Center: Red Plus button to save session into Daily Journal */}
                    <button
                        type="button"
                        className="yolofuck-ctrl-plus"
                        onClick={handleSave}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        disabled={isSaving || recordedClips.length === 0}
                        title="Save session to Daily Journal"
                    >
                        {isSaving ? (
                            <div className="yolofuck-saving-spinner" />
                        ) : (
                            <Plus size={34} strokeWidth={3} />
                        )}
                    </button>

                    {/* Right spacer to balance the flex container so Plus stays perfectly centered */}
                    <div className="yolofuck-ctrl-spacer" />
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(portal, document.body);
};

export default JournalVideoCaptureModal;
