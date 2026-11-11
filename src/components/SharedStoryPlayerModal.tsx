import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Repeat, X } from 'lucide-react';
import { hydrateStoryProvenance } from '../lib/journalStoryService';
import './SharedStoryPlayerModal.css';

interface SharedStoryPlayerModalProps {
    story: any;
    initialClipIndex?: number;
    onClose: () => void;
}

export const SharedStoryPlayerModal: React.FC<SharedStoryPlayerModalProps> = ({ story, initialClipIndex = 0, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(1);
    const [isLooping, setIsLooping] = useState<boolean>(false);
    const [currentClipIndex, setCurrentClipIndex] = useState<number>(initialClipIndex || story?.startClipIndex || 0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [clipDuration, setClipDuration] = useState<number>(0);

    const safeStory = hydrateStoryProvenance(story);

    // Extract clip list from story provenance_log or single video_url
    const clips: Array<{ clip_url: string; duration_ms?: number }> = 
        (safeStory?.provenance_log as any)?.clips || 
        (safeStory?.video_url ? [{ clip_url: safeStory.video_url }] : []);

    const activeClip = clips[currentClipIndex] || null;

    // Load active clip whenever index changes
    useEffect(() => {
        if (!activeClip || !videoRef.current) return;
        const video = videoRef.current;
        video.src = activeClip.clip_url;
        video.currentTime = 0;
        video.volume = volume;
        video.muted = isMuted;
        video.load();

        if (isPlaying) {
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn('[SharedStoryPlayerModal] Autoplay deferred, retrying muted:', err);
                    video.muted = true;
                    setIsMuted(true);
                    video.play().catch(e => console.warn('[SharedStoryPlayerModal] Muted playback deferred:', e));
                });
            }
        }
    }, [currentClipIndex, activeClip?.clip_url]);

    const handleNextClip = useCallback(() => {
        if (currentClipIndex < clips.length - 1) {
            setCurrentClipIndex(prev => prev + 1);
        } else if (isLooping) {
            setCurrentClipIndex(0);
        } else {
            setIsPlaying(false);
        }
    }, [currentClipIndex, clips.length, isLooping]);

    const handlePrevClip = useCallback(() => {
        if (currentClipIndex > 0) {
            setCurrentClipIndex(prev => prev - 1);
        } else if (isLooping && clips.length > 0) {
            setCurrentClipIndex(clips.length - 1);
        }
    }, [currentClipIndex, isLooping, clips.length]);

    const handleClipEnded = () => {
        handleNextClip();
    };

    // Pointer swipe tracking for desktop mouse & mobile touch (Direct 1:1 Follow & Snap)
    const [dragOffset, setDragOffset] = useState<number>(0);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
    const pointerStartRef = useRef<{ 
        x: number; 
        y: number; 
        time: number;
        canvasWidth: number;
        isLockedHorizontal: boolean;
        isTracking: boolean;
    } | null>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.closest('.shared-player-controls-bar')) {
            return;
        }

        if (isTransitioning) return;

        const canvasElem = e.currentTarget as HTMLElement;
        const width = canvasElem.getBoundingClientRect().width || window.innerWidth;

        pointerStartRef.current = { 
            x: e.clientX, 
            y: e.clientY, 
            time: Date.now(),
            canvasWidth: width,
            isLockedHorizontal: false,
            isTracking: true
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const start = pointerStartRef.current;
        if (!start || !start.isTracking || isTransitioning) return;

        const rawDx = e.clientX - start.x;
        const rawDy = e.clientY - start.y;
        const absX = Math.abs(rawDx);
        const absY = Math.abs(rawDy);

        if (!start.isLockedHorizontal) {
            if (absX > 8 && absX > absY * 1.2) {
                start.isLockedHorizontal = true;
                try {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                } catch {}
            } else if (absY > 15) {
                start.isTracking = false;
                setDragOffset(0);
                return;
            }
        }

        if (start.isLockedHorizontal) {
            const isAtStart = currentClipIndex === 0 && rawDx > 0 && !isLooping;
            const isAtEnd = currentClipIndex >= clips.length - 1 && rawDx < 0 && !isLooping;

            let computed = rawDx;
            if (isAtStart || isAtEnd) {
                computed = rawDx * 0.28;
            }
            setDragOffset(computed);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        try {
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
        } catch {}

        const start = pointerStartRef.current;
        if (!start || !start.isTracking) {
            pointerStartRef.current = null;
            setDragOffset(0);
            return;
        }

        const deltaX = e.clientX - start.x;
        const deltaTime = Math.max(1, Date.now() - start.time);
        const velocity = Math.abs(deltaX) / deltaTime;
        const width = start.canvasWidth || 360;
        const dragRatio = Math.abs(deltaX) / width;

        pointerStartRef.current = null;

        const meetsThreshold = (dragRatio >= 0.22 && Math.abs(deltaX) >= 40) || (velocity >= 0.35 && Math.abs(deltaX) >= 30);

        if (start.isLockedHorizontal && meetsThreshold) {
            if (deltaX < 0) {
                const hasNext = currentClipIndex < clips.length - 1 || isLooping;
                if (hasNext) {
                    setIsTransitioning(true);
                    setDragOffset(-width);
                    setTimeout(() => {
                        handleNextClip();
                        setDragOffset(0);
                        setIsTransitioning(false);
                    }, 240);
                    return;
                }
            } else if (deltaX > 0) {
                const hasPrev = currentClipIndex > 0 || isLooping;
                if (hasPrev) {
                    setIsTransitioning(true);
                    setDragOffset(width);
                    setTimeout(() => {
                        handlePrevClip();
                        setDragOffset(0);
                        setIsTransitioning(false);
                    }, 240);
                    return;
                }
            }
        }

        if (Math.abs(dragOffset) > 0 || (start.isLockedHorizontal && deltaX !== 0)) {
            setIsTransitioning(true);
            setDragOffset(0);
            setTimeout(() => {
                setIsTransitioning(false);
            }, 260);
            return;
        }

        const target = e.target as HTMLElement;
        if (target.classList.contains('shared-player-video') || target.classList.contains('shared-player-slide-track')) {
            togglePlay();
        }
    };

    const handlePointerCancel = (e: React.PointerEvent) => {
        try {
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
        } catch {}
        pointerStartRef.current = null;
        setIsTransitioning(true);
        setDragOffset(0);
        setTimeout(() => setIsTransitioning(false), 240);
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play().catch(console.error);
            setIsPlaying(true);
        }
    };

    const toggleMute = () => {
        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        if (videoRef.current) {
            videoRef.current.muted = nextMuted;
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVol = parseFloat(e.target.value);
        setVolume(newVol);
        setIsMuted(newVol === 0);
        if (videoRef.current) {
            videoRef.current.volume = newVol;
            videoRef.current.muted = newVol === 0;
        }
    };

    // Calculate seamless single progress bar percentage
    const totalClips = Math.max(1, clips.length);
    const clipProgress = clipDuration > 0 ? (currentTime / clipDuration) : 0;
    const continuousProgressPct = Math.min(100, Math.max(0, ((currentClipIndex + clipProgress) / totalClips) * 100));

    return (
        <div className="shared-player-modal-backdrop">
            <div 
                className="shared-player-modal-canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
            >
                {/* Close Button X at Top Right */}
                <button 
                    type="button" 
                    className="shared-player-close-btn"
                    onClick={onClose}
                    title="Close Player"
                >
                    <X size={22} />
                </button>

                {/* Continuous Seamless Progress Bar (No segmented division marks) */}
                <div className="shared-player-continuous-progress-track">
                    <div 
                        className="shared-player-continuous-progress-fill"
                        style={{ width: `${continuousProgressPct}%` }}
                    />
                </div>

                {/* Video Viewport with 1:1 Direct Follow & Snap */}
                {activeClip ? (
                    <div 
                        className="shared-player-slide-track"
                        style={{
                            transform: `translate3d(${dragOffset}px, 0, 0)`,
                            transition: isTransitioning 
                                ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' 
                                : 'none'
                        }}
                    >
                        <video
                            ref={videoRef}
                            className="shared-player-video"
                            playsInline
                            muted={isMuted}
                            onTimeUpdate={() => {
                                if (videoRef.current) {
                                    setCurrentTime(videoRef.current.currentTime);
                                    setClipDuration(videoRef.current.duration || 0);
                                }
                            }}
                            onEnded={handleClipEnded}
                        />
                    </div>
                ) : (
                    <div className="shared-player-no-video">
                        <span>No video available</span>
                    </div>
                )}

                {/* Pause Splash Icon */}
                {!isPlaying && (
                    <div className="shared-player-pause-splash" onClick={togglePlay}>
                        <Play size={54} fill="#ffffff" color="#ffffff" />
                    </div>
                )}

                {/* Bottom Control Bar: Play/Pause, Loop On/Off, Sound with Volume Slider */}
                <div className="shared-player-controls-bar">
                    <button
                        type="button"
                        className="shared-player-ctrl-btn"
                        onClick={togglePlay}
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause size={20} /> : <Play size={20} fill="#ffffff" />}
                    </button>

                    <button
                        type="button"
                        className={`shared-player-ctrl-btn ${isLooping ? 'active' : ''}`}
                        onClick={() => setIsLooping(prev => !prev)}
                        title={isLooping ? 'Loop is On' : 'Loop is Off'}
                    >
                        <Repeat size={18} />
                    </button>

                    <div className="shared-player-volume-group">
                        <button
                            type="button"
                            className="shared-player-ctrl-btn"
                            onClick={toggleMute}
                            title={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
                        </button>

                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className="shared-player-volume-slider"
                            title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SharedStoryPlayerModal;
