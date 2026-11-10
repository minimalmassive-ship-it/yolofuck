import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Repeat, X } from 'lucide-react';
import './SharedStoryPlayerModal.css';

interface SharedStoryPlayerModalProps {
    story: any;
    onClose: () => void;
}

export const SharedStoryPlayerModal: React.FC<SharedStoryPlayerModalProps> = ({ story, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(1);
    const [isLooping, setIsLooping] = useState<boolean>(false);
    const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [clipDuration, setClipDuration] = useState<number>(0);

    // Extract clip list from story provenance_log or single video_url
    const clips: Array<{ clip_url: string; duration_ms?: number }> = 
        (story?.provenance_log as any)?.clips || 
        (story?.video_url ? [{ clip_url: story.video_url }] : []);

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
                    console.warn('[SharedStoryPlayerModal] Autoplay deferred:', err);
                });
            }
        }
    }, [currentClipIndex, activeClip?.clip_url]);

    const handleClipEnded = () => {
        if (currentClipIndex < clips.length - 1) {
            setCurrentClipIndex(prev => prev + 1);
        } else if (isLooping) {
            setCurrentClipIndex(0);
        } else {
            setIsPlaying(false);
        }
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
            <div className="shared-player-modal-canvas">
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

                {/* Video Viewport */}
                {activeClip ? (
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
                        onClick={togglePlay}
                    />
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
