/**
 * JournalVideoCaptureModal.tsx v8.0.0
 *
 * 100% Visual and Architectural Clone of the Mobile Tab Bar with Professional Studio Quality:
 * - Swapped layout: Video viewport on top, camera controls bar directly below video,
 *   transcription area below controls, and 5-column Journal Bar at the bottom.
 * - Hardware camera controls: front/back camera flip, user-friendly lens picker,
 *   hardware zoom slider with realtime readout, and flashlight/torch toggle.
 * - Configurable video & audio bitrates (industry standard 6.0 Mbps 1080p, 192 kbps studio audio).
 * - Full acoustic fidelity (disables browser voice compression filters).
 * - Local storage recording mode for PWA and future APK builds (via IndexedDB).
 * - Reliable live Web Speech / Unified Voice recognition with instant text rendering.
 * - 30-second session limit across takes.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Mic, Video, FlipHorizontal, Zap, ZapOff, Camera, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { saveClip, saveTranscriptionEntry, syncDailyVideoEntry, getLocalDateISO } from '../lib/journalStoryService';
import { unifiedVoiceEngine } from '../lib/unifiedVoiceEngine';
import {
    getMediaSettingsFromProfile,
    buildAudioConstraints,
    buildVideoConstraints,
    buildMediaRecorderOptions,
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

const JournalVideoCaptureModal: React.FC<JournalVideoCaptureModalProps> = ({
    onClose,
    projectId,
    onClipSaved,
}) => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const transcriptionRef = useRef<HTMLDivElement>(null);
    const timerIntervalRef = useRef<any>(null);
    const modalWindowRef = useRef<HTMLDivElement>(null);
    const recordStartTimeRef = useRef<number>(0);
    const mimeTypeRef = useRef<string>('');

    // Load media settings from profile
    const mediaConfig = getMediaSettingsFromProfile(profile?.settings);
    const journalConfig = mediaConfig.journal;

    // Draggable position state for desktop
    const [dragPos, setDragPos] = useState<{ x: number; y: number }>(() => {
        if (typeof window === 'undefined') return { x: 0, y: 0 };
        return {
            x: Math.max(10, Math.round(window.innerWidth / 2 - 215)),
            y: Math.max(10, Math.round(window.innerHeight / 2 - 370))
        };
    });
    const isDraggingRef = useRef(false);
    const currentPosRef = useRef(dragPos);

    useEffect(() => {
        currentPosRef.current = dragPos;
    }, [dragPos]);

    const handleHeaderPointerDown = (e: React.PointerEvent) => {
        if (window.innerWidth <= 860) return;
        // Do not drag if clicking close button, buttons, or inputs
        if ((e.target as HTMLElement).closest('button, input, select, a, .journal-close-btn')) return;

        isDraggingRef.current = true;
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const startPosX = currentPosRef.current.x;
        const startPosY = currentPosRef.current.y;

        const onPointerMove = (ev: PointerEvent) => {
            if (!isDraggingRef.current) return;
            const newX = startPosX + (ev.clientX - startClientX);
            const newY = startPosY + (ev.clientY - startClientY);
            currentPosRef.current = { x: newX, y: newY };
            if (modalWindowRef.current) {
                modalWindowRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0px)`;
            }
        };

        const onPointerUp = () => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            setDragPos(currentPosRef.current);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    };

    // Recording & Session State
    const [isRecording, setIsRecording] = useState(false);
    const [recordedClips, setRecordedClips] = useState<{ blob: Blob; durationMs: number }[]>([]);
    const [currentTakeMs, setCurrentTakeMs] = useState(0);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [transcription, setTranscription] = useState('');
    const [liveWord, setLiveWord] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Hardware Camera Controls State
    const [activeFacingMode, setActiveFacingMode] = useState<'user' | 'environment'>('user');
    const [availableLenses, setAvailableLenses] = useState<CameraLensOption[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [showLensDropdown, setShowLensDropdown] = useState(false);
    const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
    const [currentZoom, setCurrentZoom] = useState<number>(1);
    const [supportsTorch, setSupportsTorch] = useState(false);
    const [torchActive, setTorchActive] = useState(false);
    const lensSelectorRef = useRef<HTMLDivElement>(null);

    // Close lens dropdown on tap/click outside
    useEffect(() => {
        if (!showLensDropdown) return;
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (lensSelectorRef.current && !lensSelectorRef.current.contains(e.target as Node)) {
                setShowLensDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showLensDropdown]);

    // Total accumulated duration across all saved takes + currently running take
    const savedDurationMs = recordedClips.reduce((acc, c) => acc + c.durationMs, 0);
    const totalSessionDurationMs = Math.min(MAX_SESSION_MS, savedDurationMs + (isRecording ? currentTakeMs : 0));
    const remainingMs = Math.max(0, MAX_SESSION_MS - totalSessionDurationMs);

    // ── Robust Camera Initialization with Hardware Controls ──
    const initCamera = useCallback(async (facing: 'user' | 'environment' = activeFacingMode, devId: string | null = selectedDeviceId) => {
        setError(null);
        setCameraReady(false);

        // Clean up previous stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        const audioConstraints = buildAudioConstraints(journalConfig.studioAudio);
        const videoConstraints = buildVideoConstraints(journalConfig.resolution, facing, devId || undefined);

        const constraintCandidates: MediaStreamConstraints[] = [
            { video: videoConstraints, audio: audioConstraints },
            { video: { facingMode: facing, width: { ideal: journalConfig.resolution }, height: { ideal: journalConfig.resolution } }, audio: audioConstraints },
            { video: { facingMode: facing }, audio: audioConstraints },
            { video: true, audio: audioConstraints },
            { video: { facingMode: facing }, audio: true },
            { video: true, audio: true },
            { video: true, audio: false }
        ];

        let activeStream: MediaStream | null = null;
        for (const constraints of constraintCandidates) {
            try {
                activeStream = await navigator.mediaDevices.getUserMedia(constraints);
                if (activeStream) break;
            } catch (e) {
                console.warn('[JournalCapture] Constraint candidate failed, trying next...', constraints, e);
            }
        }

        if (activeStream) {
            streamRef.current = activeStream;
            mimeTypeRef.current = getPreferredMimeType();
            setCameraReady(true);

            // Read actual device settings from active video track
            const videoTrack = activeStream.getVideoTracks()[0];
            let activeDevId: string | null = devId;
            let resolvedFacing: 'user' | 'environment' = facing;

            if (videoTrack) {
                try {
                    const settings = videoTrack.getSettings?.();
                    if (settings?.deviceId) {
                        activeDevId = settings.deviceId;
                        setSelectedDeviceId(settings.deviceId);
                    }
                    if (settings?.facingMode === 'user' || settings?.facingMode === 'environment') {
                        resolvedFacing = settings.facingMode;
                        setActiveFacingMode(settings.facingMode);
                    }
                } catch (sErr) {
                    console.warn('[JournalCapture] Track settings read notice:', sErr);
                }
            }

            // Check hardware capabilities on the active video track
            if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
                try {
                    const caps = videoTrack.getCapabilities() as any;
                    if (caps.zoom) {
                        setZoomCapabilities({
                            min: caps.zoom.min || 1,
                            max: caps.zoom.max || 1,
                            step: caps.zoom.step || 0.1,
                        });
                        const currentSettings = videoTrack.getSettings?.() as any;
                        setCurrentZoom(currentSettings?.zoom || caps.zoom.min || 1);
                    } else {
                        setZoomCapabilities(null);
                    }
                    setSupportsTorch(Boolean(caps.torch));
                } catch (capErr) {
                    console.warn('[JournalCapture] Capabilities check notice:', capErr);
                }
            }

            // Enumerate all available camera lenses on device and resolve user-friendly names
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevs = devices.filter(d => d.kind === 'videoinput');
                const lenses = resolveCameraLensOptions(videoDevs, activeDevId, resolvedFacing);
                setAvailableLenses(lenses);
            } catch (devErr) {
                console.warn('[JournalCapture] Device enumeration notice:', devErr);
            }
        } else {
            setError('Could not access camera. Please check permissions.');
        }
    }, [activeFacingMode, selectedDeviceId, journalConfig.studioAudio, journalConfig.resolution]);

    // Initial mount
    useEffect(() => {
        let mounted = true;
        initCamera();

        return () => {
            mounted = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, []);

    // Ensure video element plays as soon as cameraReady becomes true
    useEffect(() => {
        if (cameraReady && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(err => {
                console.warn('[JournalCapture] Auto-play stream notice:', err);
            });
        }
    }, [cameraReady]);

    // ── Camera Control Handlers ──
    const handleFlipCamera = useCallback(async () => {
        if (isRecording) return;
        const nextFacing = activeFacingMode === 'user' ? 'environment' : 'user';
        setActiveFacingMode(nextFacing);
        setTorchActive(false);

        // Target main lens for target facing
        const targetLens = availableLenses.find(l => l.facing === nextFacing && l.isMain)
            || availableLenses.find(l => l.facing === nextFacing);
        const nextDevId = targetLens?.deviceId || null;
        setSelectedDeviceId(nextDevId);
        await initCamera(nextFacing, nextDevId);
    }, [activeFacingMode, isRecording, availableLenses, initCamera]);

    const handleSelectLens = useCallback(async (lens: CameraLensOption) => {
        if (isRecording) return;
        setSelectedDeviceId(lens.deviceId);
        setActiveFacingMode(lens.facing);
        setShowLensDropdown(false);
        setTorchActive(false);
        await initCamera(lens.facing, lens.deviceId);
    }, [isRecording, initCamera]);

    const handleZoomChange = useCallback(async (val: number) => {
        setCurrentZoom(val);
        const track = streamRef.current?.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === 'function') {
            try {
                await track.applyConstraints({ advanced: [{ zoom: val }] as any });
            } catch (e) {
                console.warn('[JournalCapture] Apply zoom notice:', e);
            }
        }
    }, []);

    const handleToggleTorch = useCallback(async () => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === 'function') {
            const next = !torchActive;
            try {
                await track.applyConstraints({ advanced: [{ torch: next }] as any });
                setTorchActive(next);
            } catch (e) {
                console.warn('[JournalCapture] Apply torch notice:', e);
            }
        }
    }, [torchActive]);

    // ── Unified Voice Engine Transcriptions ──
    useEffect(() => {
        let isCancelled = false;

        if (!voiceEnabled) {
            unifiedVoiceEngine.stopSession();
            setLiveWord('');
            return;
        }

        const startListening = async () => {
            try {
                const uSettings = safeJsonParse(profile?.settings);
                const cachedSettings = safeJsonParse(localStorage.getItem('ideanitor_settings_cache'));
                const rawEngine = (cachedSettings?.transcription_engine || uSettings?.transcription_engine || '') as string;
                let engine = (rawEngine === 'deepgram' ? 'deepgram' : rawEngine === 'browser' ? 'browser' : rawEngine === 'groq' ? 'groq' : (rawEngine === 'local' || rawEngine === 'local_pro') ? 'local' : 'default') as any;
                const chosenLanguage = uSettings?.default_language || 'en-US';
                const dgLanguage = chosenLanguage.includes('-') ? chosenLanguage.split('-')[0] : chosenLanguage;
                const dgKey = uSettings?.deepgram_api_key || cachedSettings?.deepgram_api_key || '';
                const customKey = uSettings?.transcription_api_key || uSettings?.custom_api_key || cachedSettings?.custom_api_key || '';

                if (engine === 'groq' && !customKey) {
                    console.log('[JournalCapture] No Groq key found, falling back to default voice engine');
                    engine = 'default';
                }
                if (engine === 'deepgram' && !dgKey) {
                    console.log('[JournalCapture] No Deepgram key found, falling back to default voice engine');
                    engine = 'default';
                }

                // Check if existing camera stream has a live audio track
                const hasLiveAudioTrack = Boolean(streamRef.current?.getAudioTracks().some(t => t.readyState === 'live'));
                const streamToUse = hasLiveAudioTrack ? streamRef.current! : undefined;

                const startWithFallback = async (chosenEng: any) => {
                    await unifiedVoiceEngine.startSession({
                        engine: chosenEng,
                        language: dgLanguage,
                        fullLanguage: chosenLanguage,
                        deepgramApiKey: dgKey,
                        customApiKey: customKey,
                        existingStream: streamToUse,
                        onResult: (res) => {
                            if (isCancelled) return;
                            if (res.isFinal) {
                                setTranscription(prev => (prev ? prev + ' ' : '') + res.text.trim());
                                setLiveWord('');
                            } else {
                                setLiveWord(res.text);
                            }
                        },
                        onError: (err) => {
                            console.warn(`[JournalCapture] Voice recognition error with engine ${chosenEng}:`, err);
                            // If non-browser engine encounters an error, seamlessly fall back to browser Web Speech API
                            if (chosenEng !== 'browser' && !isCancelled) {
                                console.log('[JournalCapture] Seamlessly falling back to browser Web Speech API...');
                                startWithFallback('browser').catch(e => console.error('[JournalCapture] Web Speech fallback failed:', e));
                            }
                        }
                    });
                };

                await startWithFallback(engine);
            } catch (err) {
                console.warn('[JournalCapture] Primary voice start error, attempting Web Speech API fallback:', err);
                if (!isCancelled) {
                    try {
                        await unifiedVoiceEngine.startSession({
                            engine: 'browser',
                            language: 'en',
                            fullLanguage: 'en-US',
                            onResult: (res) => {
                                if (isCancelled) return;
                                if (res.isFinal) {
                                    setTranscription(prev => (prev ? prev + ' ' : '') + res.text.trim());
                                    setLiveWord('');
                                } else {
                                    setLiveWord(res.text);
                                }
                            }
                        });
                    } catch (e) {
                        console.error('[JournalCapture] Browser voice fallback failed:', e);
                    }
                }
            }
        };

        startListening();

        return () => {
            isCancelled = true;
            unifiedVoiceEngine.stopSession();
            setLiveWord('');
        };
    }, [voiceEnabled, user, profile]);

    // Auto-scroll transcription
    useEffect(() => {
        if (transcriptionRef.current) {
            transcriptionRef.current.scrollTop = transcriptionRef.current.scrollHeight;
        }
    }, [transcription, liveWord]);

    // ── Close / Exit ──
    const handleClose = () => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        unifiedVoiceEngine.stopSession();
        onClose();
    };

    // ── Save Function (Cloud Upload vs Local Storage Mode) ──
    const handleSave = useCallback(async () => {
        if (!user?.id || (recordedClips.length === 0 && !isRecording) || isSaving) return;
        setIsSaving(true);

        try {
            if (recorderRef.current && recorderRef.current.state === 'recording') {
                recorderRef.current.stop();
                setIsRecording(false);
            }

            const fullTranscription = transcription.trim();

            if (journalConfig.localStorageOnly) {
                // Save locally to IndexedDB without cloud upload (PWA / offline / APK mode)
                for (let i = 0; i < recordedClips.length; i++) {
                    const clip = recordedClips[i];
                    await saveLocalJournalRecording({
                        blob: clip.blob,
                        durationMs: clip.durationMs,
                        transcription: fullTranscription,
                        title: `Journal Take ${i + 1} (${new Date().toLocaleDateString()})`,
                    });
                }
            } else {
                // 1. Upload each clip to Supabase cloud storage with high-quality thumbnail
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
                                    c.width = v.videoWidth || 640;
                                    c.height = v.videoHeight || 640;
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
                    } catch (e) {
                        console.warn('[JournalCapture] Thumbnail creation fallback:', e);
                    }
                }

                for (let i = 0; i < recordedClips.length; i++) {
                    const clip = recordedClips[i];
                    await saveClip(
                        user.id,
                        projectId,
                        clip.blob,
                        null,
                        i,
                        clip.durationMs,
                        i === 0 ? firstThumbBlob : null
                    );
                }

                // 2. Save transcription if any
                if (fullTranscription) {
                    await saveTranscriptionEntry(user.id, projectId, fullTranscription);
                }

                // 3. Sync daily video entry in chat feed
                await syncDailyVideoEntry(user.id, projectId, getLocalDateISO());
            }

            // 4. Dispatch global event, notify parent & close
            window.dispatchEvent(new CustomEvent('journal_clip_saved'));
            onClipSaved?.();
            handleClose();

            // 5. Navigate to story or journal
            if (projectId) {
                navigate(`/projects/${projectId}/story`);
            } else {
                navigate('/journal');
            }
        } catch (err) {
            console.error('[JournalCapture] Save error:', err);
            setError('Failed to save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }, [user?.id, recordedClips, isRecording, isSaving, projectId, transcription, onClipSaved, navigate, journalConfig.localStorageOnly]);

    // ── 30-Second Limit Watcher ──
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
            }, 100);
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
        } catch (err) {
            console.error('[JournalCapture] MediaRecorder start error:', err);
        }
    }, [isRecording, remainingMs, journalConfig.videoBitrateMbps, journalConfig.audioBitrateKbps]);

    const stopRecording = useCallback(() => {
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

    // ── Render ──
    const isDesktop = typeof window !== 'undefined' && window.innerWidth > 860;

    const activeLens = availableLenses.find(l => l.deviceId === selectedDeviceId)
        || (activeFacingMode === 'user'
            ? availableLenses.find(l => l.facing === 'user')
            : availableLenses.find(l => l.facing === 'environment'))
        || availableLenses[0];

    const portal = (
        <div className="journal-capture-overlay" onClick={handleClose}>
            <div
                className="journal-capture-modal-window"
                ref={modalWindowRef}
                style={isDesktop ? { transform: `translate3d(${dragPos.x}px, ${dragPos.y}px, 0px)` } : undefined}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header (Draggable Handle) */}
                <div
                    className="journal-capture-header"
                    onPointerDown={handleHeaderPointerDown}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="journal-header-timer">
                            {formatSessionTime(totalSessionDurationMs)} / 00:30
                        </span>
                        {journalConfig.localStorageOnly && (
                            <span style={{ fontSize: '10px', color: '#9eff00', background: 'rgba(158,255,0,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                Local Only
                            </span>
                        )}
                    </div>
                    <button 
                        type="button" 
                        className="journal-close-btn" 
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClose();
                        }}
                        onPointerDown={(e) => e.stopPropagation()} 
                        title="Close"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Vertical Body (Swapped: Video on Top, Controls Below Video, Transcription Middle) */}
                <div className="journal-capture-body">
                    {/* Top: 1:1 Square Video Viewport */}
                    <div className={`journal-capture-video-viewport ${isRecording ? 'recording' : ''}`}>
                        {cameraReady ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ transform: activeFacingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                                onLoadedMetadata={() => {
                                    videoRef.current?.play().catch(() => {});
                                }}
                            />
                        ) : (
                            <div className="journal-camera-error-msg">
                                <Video size={40} color="#666" />
                                <span>{error || 'Starting camera...'}</span>
                            </div>
                        )}

                        {/* Recording indicator */}
                        {isRecording && (
                            <div className="journal-recording-badge">
                                <div className="journal-rec-dot" />
                                REC
                            </div>
                        )}

                        {/* Remaining Time Badge */}
                        <div className="journal-remaining-badge">
                            {Math.ceil(remainingMs / 1000)}s left
                        </div>
                    </div>

                    {/* Camera Controls Bar (Placed directly below video viewport) */}
                    <div className="journal-camera-controls-bar">
                        {/* Flip Camera */}
                        <button
                            type="button"
                            className="journal-cam-btn"
                            onClick={handleFlipCamera}
                            title={`Switch to ${activeFacingMode === 'user' ? 'Back' : 'Front'} Camera`}
                            disabled={isRecording}
                        >
                            <FlipHorizontal size={15} />
                            <span className="journal-cam-btn-text">{activeFacingMode === 'user' ? 'Front' : 'Back'}</span>
                        </button>

                        {/* Lens Selector */}
                        {availableLenses.length > 1 && (
                            <div className="journal-lens-selector-wrap" ref={lensSelectorRef}>
                                <button
                                    type="button"
                                    className="journal-cam-btn"
                                    onClick={() => setShowLensDropdown(prev => !prev)}
                                    title="Select Camera Lens"
                                    disabled={isRecording}
                                >
                                    <Camera size={14} />
                                    <span className="journal-cam-btn-text">
                                        {activeLens?.label || (activeFacingMode === 'user' ? 'Front (Selfie)' : 'Wide Lens (Main)')}
                                    </span>
                                    <ChevronDown size={12} />
                                </button>
                                {showLensDropdown && (
                                    <div className="journal-lens-dropdown-menu">
                                        {availableLenses.map(lens => {
                                            const isCurrent = (selectedDeviceId && lens.deviceId === selectedDeviceId)
                                                || (!selectedDeviceId && lens.deviceId === activeLens?.deviceId);
                                            return (
                                                <button
                                                    key={lens.deviceId}
                                                    type="button"
                                                    className={`journal-lens-menu-item ${isCurrent ? 'active' : ''}`}
                                                    onClick={() => handleSelectLens(lens)}
                                                >
                                                    <span className="journal-lens-item-name">{lens.label}</span>
                                                    <span className="journal-lens-item-badge">
                                                        {lens.facing === 'user' ? 'Front' : 'Rear'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Hardware Zoom Slider */}
                        {zoomCapabilities && (
                            <div className="journal-cam-zoom-wrap">
                                <span className="journal-zoom-readout">{currentZoom.toFixed(1)}x</span>
                                <input
                                    type="range"
                                    min={zoomCapabilities.min}
                                    max={zoomCapabilities.max}
                                    step={zoomCapabilities.step || 0.1}
                                    value={currentZoom}
                                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                                    className="journal-zoom-slider"
                                    disabled={isRecording}
                                />
                            </div>
                        )}

                        {/* Torch / Flashlight Toggle */}
                        {supportsTorch && (
                            <button
                                type="button"
                                className={`journal-cam-btn ${torchActive ? 'torch-active' : ''}`}
                                onClick={handleToggleTorch}
                                title={torchActive ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                            >
                                {torchActive ? <Zap size={15} color="#FFF200" /> : <ZapOff size={15} />}
                            </button>
                        )}
                    </div>

                    {/* Middle: Transcription Area (Scrollable flex box) */}
                    <div className="journal-capture-transcription-box" ref={transcriptionRef}>
                        {voiceEnabled ? (
                            <div className="journal-transcription-content">
                                {transcription}
                                {liveWord && <span className="journal-transcription-live"> {liveWord}</span>}
                                {!transcription && !liveWord && (
                                    <span className="journal-transcription-placeholder">
                                        Speak to transcribe audio live...
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="journal-transcription-placeholder">
                                Click "Voice" in the bar below to enable live speech transcription
                            </div>
                        )}
                    </div>

                    {/* Bottom: Journal Bar (Exact 5-Column Grid: Exit, Voice, Center Red Plus at 50%, Record at 4-5) */}
                    <div className="journal-bar-container">
                        <div className="nav-icons-central">
                            {/* 1st Slot: Exit */}
                            <div style={{ display: 'flex', width: '52px', height: '52px', alignItems: 'center', justifyContent: 'center' }}>
                                <div
                                    className="nav-icon-link"
                                    onClick={handleClose}
                                    title="Exit"
                                >
                                    <X size={26} strokeWidth={1.5} color="#E1DED2" />
                                    <span className="nav-icon-label">Exit</span>
                                </div>
                            </div>

                            {/* 2nd Slot: Voice */}
                            <div style={{ display: 'flex', width: '52px', height: '52px', alignItems: 'center', justifyContent: 'center' }}>
                                <div
                                    className="nav-icon-link"
                                    style={{ color: voiceEnabled ? '#ef4444' : '#E1DED2' }}
                                    onClick={() => setVoiceEnabled(prev => !prev)}
                                    title={voiceEnabled ? 'Disable transcription' : 'Enable transcription'}
                                >
                                    <Mic size={26} strokeWidth={1.5} color={voiceEnabled ? '#ef4444' : '#E1DED2'} />
                                    <span className="nav-icon-label" style={{ color: voiceEnabled ? '#ef4444' : '#E1DED2' }}>
                                        Voice
                                    </span>
                                </div>
                            </div>

                            {/* 3rd Slot (Center): RED Plus (EXACT 50% Dead Center) */}
                            <div style={{ display: 'flex', width: '52px', height: '52px', alignItems: 'center', justifyContent: 'center' }}>
                                <div className="mobile-fab-container">
                                    <div className="fab-capsule-backdrop" style={{ height: '52px' }}></div>
                                    <div className="fab-capsule" style={{ height: '52px', marginBottom: '4px' }}>
                                        <div
                                            className="fab-capsule-icon fab-capsule-main"
                                            onClick={handleSave}
                                            style={{
                                                color: '#FF2E2E',
                                                cursor: 'pointer',
                                            }}
                                            title="Save clips to Journal"
                                        >
                                            {isSaving ? (
                                                <div style={{ width: 18, height: 18, border: '2px solid rgba(255,46,46,0.4)', borderTop: '2px solid #FF2E2E', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                            ) : (
                                                <Plus size={28} strokeWidth={2.5} color="#FF2E2E" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 4th & 5th Slots (Right): Wide Red Record Button */}
                            <div className="journal-wide-record-slot">
                                <button
                                    type="button"
                                    className={`journal-wide-record-button ${isRecording ? 'recording' : ''}`}
                                    onPointerDown={handleRecordPointerDown}
                                    onPointerUp={handleRecordPointerUp}
                                    onPointerLeave={handleRecordPointerLeave}
                                    onPointerCancel={handleRecordPointerLeave}
                                    disabled={remainingMs <= 0 || isSaving}
                                    title="Hold to record video take"
                                >
                                    <span className="journal-wide-record-label">
                                        {isRecording ? 'Recording' : 'Record'}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(portal, document.body);
};

export default JournalVideoCaptureModal;
