/**
 * JournalStoryView.tsx — yolofuck
 * 
 * Video Shorts Daily Grid:
 * - 100% focused on 9:16 video shorts
 * - Current day at the top, past days listed in rows below
 * - Within each day, videos are placed horizontally from oldest to newest (left to right)
 * - Search by spoken words in the background transcription
 * - Full-screen daily story player when clicking any take or "Play Story"
 * - Strictly NO purple/violet colors.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
    Search, 
    Play, 
    Pause, 
    X, 
    Trash2, 
    Volume2, 
    VolumeX, 
    RotateCcw, 
    Repeat, 
    Share2, 
    Video, 
    Calendar, 
    Clock, 
    Maximize2, 
    Minimize2,
    Film,
    Sparkles
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    getLocalDateISO,
    fetchAllUserClips,
    fetchClipsByDate,
    deleteClip,
    checkIsDailyStoryPublished,
    publishDailyStory,
    unpublishDailyStory,
    type JournalClip,
} from '../lib/journalStoryService';
import { getAllLocalJournalRecordings } from '../lib/journalLocalStorage';
import { JournalShareCommandCenter } from './JournalShareCommandCenter';
import './JournalStoryView.css';

interface JournalStoryViewProps {
    projectId: string | null;
}

function formatDateLabel(dateStr: string): string {
    const today = getLocalDateISO();
    if (dateStr === today) return 'Today';
    
    const d = new Date(dateStr + 'T00:00:00');
    const todayDate = new Date(today + 'T00:00:00');
    const diffDays = Math.round((todayDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    
    return d.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        year: d.getFullYear() !== todayDate.getFullYear() ? 'numeric' : undefined 
    });
}

function formatDuration(ms: number): string {
    const sec = Math.max(1, Math.round(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatClipTime(isoString: string): string {
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

export const JournalStoryView: React.FC<JournalStoryViewProps> = ({ projectId: _projectId }) => {
    const { user } = useAuth();

    // Data states
    const [allClips, setAllClips] = useState<JournalClip[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Active Player states
    const [showVideoPlayer, setShowVideoPlayer] = useState(false);
    const [activeStoryDate, setActiveStoryDate] = useState<string>(getLocalDateISO());
    const [currentClipIndex, setCurrentClipIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isLooping, setIsLooping] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [currentClipDuration, setCurrentClipDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Share Modal state
    const [showShareModal, setShowShareModal] = useState(false);
    const [lockedShareDate, setLockedShareDate] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);

    // ── Load Clips from Supabase & Local IndexedDB ──
    const loadAllClips = useCallback(async () => {
        if (!user?.id) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            // 1. Fetch cloud clips
            const cloudClips = await fetchAllUserClips(user.id);

            // 2. Fetch local storage clips
            const localEntries = await getAllLocalJournalRecordings();
            const localMapped: JournalClip[] = localEntries.map((loc, idx) => {
                const date = loc.createdAt ? loc.createdAt.slice(0, 10) : getLocalDateISO();
                return {
                    id: loc.id,
                    user_id: user.id,
                    project_id: null,
                    clip_url: URL.createObjectURL(loc.blob),
                    thumbnail_url: null,
                    transcription: loc.transcription || null,
                    duration_ms: loc.durationMs || 5000,
                    clip_order: idx,
                    clip_date: date,
                    is_merged: false,
                    created_at: loc.createdAt || new Date().toISOString()
                };
            });

            // Combine avoiding duplicates
            const combinedMap = new Map<string, JournalClip>();
            cloudClips.forEach(c => combinedMap.set(c.id, c));
            localMapped.forEach(l => {
                if (!combinedMap.has(l.id)) {
                    combinedMap.set(l.id, l);
                }
            });

            const combinedList = Array.from(combinedMap.values());
            setAllClips(combinedList);
        } catch (err) {
            console.error('[JournalStoryView] Load clips error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        loadAllClips();

        const handleSaved = (e: any) => {
            loadAllClips();
            if (e.detail?.date) {
                setActiveStoryDate(e.detail.date);
            }
        };

        const handleOpenDate = (e: any) => {
            if (e.detail?.date) {
                setActiveStoryDate(e.detail.date);
                setCurrentClipIndex(0);
                setShowVideoPlayer(true);
            }
        };

        window.addEventListener('journal_clip_saved', handleSaved);
        window.addEventListener('journal_open_story_date', handleOpenDate);

        return () => {
            window.removeEventListener('journal_clip_saved', handleSaved);
            window.removeEventListener('journal_open_story_date', handleOpenDate);
        };
    }, [loadAllClips]);

    // Notify parent when player state changes (to hide/show header)
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('journal_video_player_state', {
            detail: { isOpen: showVideoPlayer }
        }));
    }, [showVideoPlayer]);

    // ── Group Clips by Day (Today at the top, past days below) ──
    const groupedDays = useMemo(() => {
        const today = getLocalDateISO();
        const map = new Map<string, JournalClip[]>();

        // Ensure today is always present
        map.set(today, []);

        // Filter by spoken word search query if present
        const query = searchQuery.trim().toLowerCase();
        const filteredClips = query
            ? allClips.filter(c => c.transcription?.toLowerCase().includes(query))
            : allClips;

        for (const clip of filteredClips) {
            const date = clip.clip_date || clip.created_at.slice(0, 10);
            if (!map.has(date)) {
                map.set(date, []);
            }
            map.get(date)!.push(clip);
        }

        // Sort each day's clips chronologically (oldest to newest: left to right)
        map.forEach((clips) => {
            clips.sort((a, b) => {
                if (a.clip_order !== b.clip_order) return a.clip_order - b.clip_order;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
        });

        // Convert to array and sort dates DESCENDING (today first, then yesterday, etc.)
        const entries = Array.from(map.entries());
        entries.sort(([dateA], [dateB]) => dateB.localeCompare(dateA));

        return entries;
    }, [allClips, searchQuery]);

    // Active day clips for video player
    const activeDayClips = useMemo(() => {
        const found = groupedDays.find(([d]) => d === activeStoryDate);
        return found ? found[1] : [];
    }, [groupedDays, activeStoryDate]);

    const activeClip = activeDayClips[currentClipIndex] || null;

    // ── Playback Handlers ──
    const handleStartDayPlayer = (date: string, clipIdx = 0) => {
        setActiveStoryDate(date);
        setCurrentClipIndex(clipIdx);
        setShowVideoPlayer(true);
        setIsPlaying(true);
    };

    const handleClosePlayer = () => {
        setShowVideoPlayer(false);
        setIsPlaying(false);
        if (videoRef.current) {
            videoRef.current.pause();
        }
    };

    const handleNextClip = useCallback(() => {
        if (currentClipIndex < activeDayClips.length - 1) {
            setCurrentClipIndex(prev => prev + 1);
            setCurrentTime(0);
        } else if (isLooping) {
            setCurrentClipIndex(0);
            setCurrentTime(0);
        } else {
            setIsPlaying(false);
        }
    }, [currentClipIndex, activeDayClips.length, isLooping]);

    const handlePrevClip = useCallback(() => {
        if (currentClipIndex > 0) {
            setCurrentClipIndex(prev => prev - 1);
            setCurrentTime(0);
        }
    }, [currentClipIndex]);

    const handleDeleteTake = async (clipId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Delete this video take from your day?')) return;

        try {
            await deleteClip(clipId);
            setAllClips(prev => prev.filter(c => c.id !== clipId));
        } catch (err) {
            console.error('[JournalStoryView] Delete take error:', err);
        }
    };

    // Video playback effect
    useEffect(() => {
        if (!showVideoPlayer || !activeClip || !videoRef.current) return;

        videoRef.current.src = activeClip.clip_url;
        videoRef.current.currentTime = 0;

        if (isPlaying) {
            videoRef.current.play().catch(() => {});
        }
    }, [showVideoPlayer, activeClip]);

    return (
        <div className={`yolofuck-storyview-root ${showVideoPlayer ? 'player-active' : ''}`}>
            {/* ══════════════════════════════════════════════════════════
                1. FULL-SCREEN 9:16 VIDEO PLAYER VIEW
               ══════════════════════════════════════════════════════════ */}
            {showVideoPlayer && activeClip ? (
                <div className="yolofuck-player-container" ref={playerContainerRef}>
                    {/* 9:16 Vertical Video Canvas */}
                    <div className="yolofuck-player-canvas">
                        <video
                            ref={videoRef}
                            className="yolofuck-player-video"
                            playsInline
                            muted={isMuted}
                            onTimeUpdate={() => {
                                if (videoRef.current) {
                                    setCurrentTime(videoRef.current.currentTime);
                                    setCurrentClipDuration(videoRef.current.duration || 0);
                                }
                            }}
                            onEnded={handleNextClip}
                            onClick={() => setIsPlaying(prev => !prev)}
                        />

                        {/* Top Overlay Bars (Segmented progress for all takes in this day) */}
                        <div className="yolofuck-player-progress-row">
                            {activeDayClips.map((clip, idx) => {
                                const isPassed = idx < currentClipIndex;
                                const isCurrent = idx === currentClipIndex;
                                const pct = isPassed ? 100 : isCurrent && currentClipDuration > 0 ? (currentTime / currentClipDuration) * 100 : 0;
                                return (
                                    <div 
                                        key={clip.id} 
                                        className="yolofuck-progress-segment-bg"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentClipIndex(idx);
                                        }}
                                    >
                                        <div 
                                            className="yolofuck-progress-segment-fill" 
                                            style={{ width: `${pct}%` }} 
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Top Header inside Player */}
                        <div className="yolofuck-player-header">
                            <div className="yolofuck-player-meta">
                                <span className="yolofuck-player-date">
                                    {formatDateLabel(activeStoryDate)}
                                </span>
                                <span className="yolofuck-player-take-badge">
                                    Take {currentClipIndex + 1} of {activeDayClips.length}
                                </span>
                            </div>

                            <button 
                                className="yolofuck-player-close-btn"
                                onClick={handleClosePlayer}
                                title="Exit Player"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        {/* Center Play/Pause Indicator if paused */}
                        {!isPlaying && (
                            <div className="yolofuck-player-pause-splash" onClick={() => setIsPlaying(true)}>
                                <Play size={54} fill="#ffffff" color="#ffffff" />
                            </div>
                        )}

                        {/* Player Floating Bottom Controls */}
                        <div className="yolofuck-player-bottom-bar">
                            <button
                                className="yolofuck-player-icon-btn"
                                onClick={() => handlePrevClip()}
                                disabled={currentClipIndex === 0}
                                title="Previous Take"
                            >
                                ◄
                            </button>

                            <button
                                className="yolofuck-player-icon-btn"
                                onClick={() => setIsPlaying(prev => !prev)}
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? <Pause size={20} /> : <Play size={20} fill="#ffffff" />}
                            </button>

                            <button
                                className="yolofuck-player-icon-btn"
                                onClick={() => handleNextClip()}
                                disabled={currentClipIndex === activeDayClips.length - 1}
                                title="Next Take"
                            >
                                ►
                            </button>

                            <button
                                className="yolofuck-player-icon-btn"
                                onClick={() => setIsMuted(prev => !prev)}
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>

                            <button
                                className={`yolofuck-player-icon-btn ${isLooping ? 'active' : ''}`}
                                onClick={() => setIsLooping(prev => !prev)}
                                title="Loop Take"
                            >
                                <Repeat size={17} />
                            </button>

                            <button
                                className="yolofuck-player-icon-btn"
                                onClick={() => {
                                    setLockedShareDate(activeStoryDate);
                                    setShowShareModal(true);
                                }}
                                title="Share Day Story"
                            >
                                <Share2 size={17} />
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* ══════════════════════════════════════════════════════════
                    2. MAIN FEED: DAILY 9:16 VIDEO SHORTS GRID
                   ══════════════════════════════════════════════════════════ */
                <div className="yolofuck-grid-scrollview">
                    {/* Spoken Word Search Bar */}
                    <div className="yolofuck-search-header-container">
                        <div className="yolofuck-search-pill">
                            <Search size={18} color="#10b981" />
                            <input
                                type="text"
                                className="yolofuck-search-input"
                                placeholder="Search spoken words in videos (e.g. 'pizza', 'workout', 'meeting')..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button 
                                    className="yolofuck-search-clear"
                                    onClick={() => setSearchQuery('')}
                                    title="Clear search"
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        {searchQuery && (
                            <div className="yolofuck-search-feedback">
                                <Sparkles size={14} color="#10b981" />
                                <span>
                                    Filtered by spoken word: "{searchQuery}"
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="yolofuck-feed-loading">
                            <span>Loading daily video shorts...</span>
                        </div>
                    )}

                    {/* List of Days (Today first, then past days in rows) */}
                    {!loading && (
                        <div className="yolofuck-days-wrapper">
                            {groupedDays.map(([date, clips]) => {
                                const isToday = date === getLocalDateISO();
                                const totalMs = clips.reduce((acc, c) => acc + (c.duration_ms || 0), 0);

                                return (
                                    <div key={date} className="yolofuck-day-row-card">
                                        {/* Day Row Header */}
                                        <div className="yolofuck-day-header">
                                            <div className="yolofuck-day-header-left">
                                                <h3 className="yolofuck-day-title">
                                                    {formatDateLabel(date)}
                                                </h3>
                                                <span className="yolofuck-day-date-sub">
                                                    {date}
                                                </span>
                                                <span className="yolofuck-day-count-badge">
                                                    {clips.length} {clips.length === 1 ? 'take' : 'takes'}
                                                    {totalMs > 0 ? ` · ${formatDuration(totalMs)}` : ''}
                                                </span>
                                            </div>

                                            {clips.length > 0 && (
                                                <div className="yolofuck-day-actions">
                                                    <button
                                                        type="button"
                                                        className="yolofuck-day-btn play"
                                                        onClick={() => handleStartDayPlayer(date, 0)}
                                                        title="Play compiled daily story"
                                                    >
                                                        <Play size={14} fill="#ffffff" />
                                                        <span>Play Story</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="yolofuck-day-btn share"
                                                        onClick={() => {
                                                            setLockedShareDate(date);
                                                            setShowShareModal(true);
                                                        }}
                                                        title="Share Day"
                                                    >
                                                        <Share2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Horizontal Strip of 9:16 Video Shorts (Oldest to Newest: Left to Right) */}
                                        <div className="yolofuck-shorts-strip">
                                            {clips.length === 0 ? (
                                                <div className="yolofuck-empty-day-box">
                                                    <Video size={36} color="#64748b" />
                                                    <p>
                                                        {isToday 
                                                            ? 'No video takes recorded yet today. Click Record Clip above to start!' 
                                                            : 'No video clips recorded on this date.'}
                                                    </p>
                                                </div>
                                            ) : (
                                                clips.map((clip, idx) => (
                                                    <div 
                                                        key={clip.id}
                                                        className="yolofuck-short-card"
                                                        onClick={() => handleStartDayPlayer(date, idx)}
                                                        title={`Take ${idx + 1} — Click to play`}
                                                    >
                                                        {/* Video Thumbnail or preview */}
                                                        {clip.thumbnail_url ? (
                                                            <img 
                                                                src={clip.thumbnail_url} 
                                                                alt={`Take ${idx + 1}`} 
                                                                className="yolofuck-short-media" 
                                                            />
                                                        ) : (
                                                            <video
                                                                src={clip.clip_url}
                                                                className="yolofuck-short-media"
                                                                preload="metadata"
                                                                muted
                                                            />
                                                        )}

                                                        {/* Top Badges */}
                                                        <div className="yolofuck-short-top-bar">
                                                            <span className="yolofuck-take-index-pill">
                                                                Take {idx + 1}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="yolofuck-short-delete-btn"
                                                                onClick={(e) => handleDeleteTake(clip.id, e)}
                                                                title="Delete take"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>

                                                        {/* Hover Play Splash */}
                                                        <div className="yolofuck-short-hover-overlay">
                                                            <div className="yolofuck-hover-play-icon">
                                                                <Play size={24} fill="#ffffff" />
                                                            </div>
                                                        </div>

                                                        {/* Bottom Info Bar */}
                                                        <div className="yolofuck-short-bottom-bar">
                                                            <span className="yolofuck-short-time">
                                                                <Clock size={11} />
                                                                {formatClipTime(clip.created_at)}
                                                            </span>
                                                            <span className="yolofuck-short-duration">
                                                                {formatDuration(clip.duration_ms)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Share Command Center Modal */}
            {showShareModal && (
                <JournalShareCommandCenter
                    date={lockedShareDate || activeStoryDate}
                    clips={activeDayClips}
                    projectId={_projectId}
                    userId={user?.id || ''}
                    username={user?.user_metadata?.username || 'User'}
                    onClose={() => {
                        setShowShareModal(false);
                        setLockedShareDate(null);
                    }}
                />
            )}
        </div>
    );
};

export default JournalStoryView;
