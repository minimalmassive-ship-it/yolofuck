import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Play, Pause, Volume2, VolumeX, Repeat, X, Loader2 } from 'lucide-react';
import '../components/SharedStoryPlayerModal.css';

export const PublicSharedStoryPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();

    const [story, setStory] = useState<any | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(1);
    const [isLooping, setIsLooping] = useState<boolean>(false);
    const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [clipDuration, setClipDuration] = useState<number>(0);

    // Fetch the shared story by slug or ID
    useEffect(() => {
        let isMounted = true;
        async function fetchStory() {
            if (!slug) {
                setLoading(false);
                setErrorMsg('No story specified');
                return;
            }

            try {
                setLoading(true);
                // Look up in ideas table by slug or id
                let { data, error } = await supabase
                    .from('ideas')
                    .select('*')
                    .eq('slug', slug)
                    .maybeSingle();

                if (!data && !error) {
                    const resById = await supabase
                        .from('ideas')
                        .select('*')
                        .eq('id', slug)
                        .maybeSingle();
                    data = resById.data;
                    error = resById.error;
                }

                if (error || !data) {
                    if (isMounted) {
                        setErrorMsg('This story link was not found or is no longer available.');
                    }
                    return;
                }

                const isStopped = data.visibility === 'stopped' || (data.provenance_log as any)?.is_stopped === true;
                if (isStopped) {
                    if (isMounted) {
                        setErrorMsg('Sharing for this story has been paused or stopped by the creator.');
                    }
                    return;
                }

                if (isMounted) {
                    setStory(data);
                }
            } catch (err: any) {
                if (isMounted) {
                    setErrorMsg('Unable to load story.');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchStory();
        return () => { isMounted = false; };
    }, [slug]);

    const clips: Array<{ clip_url: string }> = 
        (story?.provenance_log as any)?.clips || 
        (story?.video_url ? [{ clip_url: story.video_url }] : []);

    const activeClip = clips[currentClipIndex] || null;

    useEffect(() => {
        if (!activeClip || !videoRef.current) return;
        const video = videoRef.current;
        video.src = activeClip.clip_url;
        video.currentTime = 0;
        video.volume = volume;
        video.muted = isMuted;
        video.load();

        if (isPlaying) {
            const p = video.play();
            if (p !== undefined) {
                p.catch(console.warn);
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
        if (videoRef.current) videoRef.current.muted = nextMuted;
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

    const handleClose = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/shared');
        }
    };

    const totalClips = Math.max(1, clips.length);
    const clipProgress = clipDuration > 0 ? (currentTime / clipDuration) : 0;
    const continuousProgressPct = Math.min(100, Math.max(0, ((currentClipIndex + clipProgress) / totalClips) * 100));

    if (loading) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                background: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                gap: '10px'
            }}>
                <Loader2 size={24} className="vizja-spin" color="#10b981" />
                <span>Loading story...</span>
            </div>
        );
    }

    if (errorMsg || !story) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                background: '#000000',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#efede3',
                padding: '20px',
                textAlign: 'center'
            }}>
                <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Story Unavailable</h2>
                <p style={{ color: '#94a3b8', maxWidth: '400px', marginBottom: '20px' }}>{errorMsg || 'Not found'}</p>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        background: '#141522',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#ffffff',
                        cursor: 'pointer'
                    }}
                >
                    Go to Home
                </button>
            </div>
        );
    }

    return (
        <div className="shared-player-modal-backdrop">
            <div className="shared-player-modal-canvas">
                {/* Close Button X at Top Right */}
                <button 
                    type="button" 
                    className="shared-player-close-btn"
                    onClick={handleClose}
                    title="Close"
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

export default PublicSharedStoryPage;
