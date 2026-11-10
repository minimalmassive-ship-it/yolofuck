/**
 * JournalStoryView.tsx — yolofuck
 * 
 * Video Shorts Daily Grid:
 * - Square videos (80px x 80px, border-radius: 0) arranged in a tight 2px grid.
 * - Current day at the top, past days listed below.
 * - Horizontal sequence from oldest to newest (left to right).
 * - Vertical sideways date strip on the left (e.g. 09-11-2026).
 * - Subheader between searchbar and Today's row: [Play Story], take count & duration, [Share].
 * - Single click on a film: toggles in-place loop playback.
 * - Long press (1.5s): opens full-screen sequential daily story player.
 * - Drag/scroll: smooth navigation in all directions without triggering story.
 * - Strictly NO purple/violet hues.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
    Play, 
    Pause, 
    X, 
    Trash2, 
    Volume2, 
    VolumeX, 
    Repeat, 
    Share2, 
    Video, 
    Sparkles,
    Layers
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    getLocalDateISO,
    fetchAllUserClips,
    deleteClip,
    reorderDailyClips,
    ensureDailyStoryIdea,
    type JournalClip,
} from '../lib/journalStoryService';
import { getAllLocalJournalRecordings, deleteLocalJournalRecording } from '../lib/journalLocalStorage';
import { JournalShareCommandCenter } from './JournalShareCommandCenter';
import './JournalStoryView.css';

interface JournalStoryViewProps {
    projectId?: string | null;
    searchQuery?: string;
    onSearchChange?: (q: string) => void;
    onOpenRecord?: () => void;
    onNavigateToShared?: () => void;
}

/** Formats YYYY-MM-DD into DD-MM-YYYY */
function formatVerticalDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

function formatDuration(ms: number): string {
    const sec = Math.max(1, Math.round(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const JournalStoryView: React.FC<JournalStoryViewProps> = ({ 
    projectId: _projectId, 
    searchQuery = '',
    onOpenRecord,
    onNavigateToShared
}) => {
    const { user, profile } = useAuth();
    const effectiveUsername = profile?.username || user?.user_metadata?.username || 'Journal';

    // Data states
    const [allClips, setAllClips] = useState<JournalClip[]>([]);
    const [loading, setLoading] = useState(true);

    // In-line single-clip looping state
    const [loopingClipId, setLoopingClipId] = useState<string | null>(null);

    // Full-screen daily story player states
    const [showVideoPlayer, setShowVideoPlayer] = useState(false);
    const [activeStoryDate, setActiveStoryDate] = useState<string>(getLocalDateISO());
    const [currentClipIndex, setCurrentClipIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isLooping, setIsLooping] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [currentClipDuration, setCurrentClipDuration] = useState(0);

    // Share Modal state
    const [showShareModal, setShowShareModal] = useState(false);
    const [lockedShareDate, setLockedShareDate] = useState<string | null>(null);

    // Mobile Long-Press Delete Confirmation Modal state
    const [clipToDelete, setClipToDelete] = useState<{ id: string; date: string } | null>(null);

    // Drag and Drop state for reordering films in feed
    const [draggingClip, setDraggingClip] = useState<{ clip: JournalClip; date: string } | null>(null);
    const [dragOverClipId, setDragOverClipId] = useState<string | null>(null);
    const [dragEnabledClipId, setDragEnabledClipId] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Pointer gesture trackers for video cards: single click, drag, long-press (reorder)
    const pointerStartRef = useRef<{ x: number; y: number; time: number; clipId: string; date: string; index: number } | null>(null);
    const longPressTimerRef = useRef<any>(null);
    const isLongPressTriggeredRef = useRef(false);

    // Touch gesture tracker for Full-Screen Player: Horizontal Swipe left/right
    const playerTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const playerLongPressTimerRef = useRef<any>(null);
    const isPlayerLongPressTriggeredRef = useRef(false);

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

        window.addEventListener('journal_clip_saved', handleSaved);
        return () => window.removeEventListener('journal_clip_saved', handleSaved);
    }, [loadAllClips]);

    // Notify parent when player state changes (to hide/show top and bottom bars)
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

    const todayDate = getLocalDateISO();
    const todayEntry = groupedDays.find(([d]) => d === todayDate);
    const todayClips = todayEntry ? todayEntry[1] : [];
    const todayTotalMs = todayClips.reduce((acc, c) => acc + (c.duration_ms || 0), 0);

    // Active day clips for full-screen video player
    const activeDayClips = useMemo(() => {
        const found = groupedDays.find(([d]) => d === activeStoryDate);
        return found ? found[1] : [];
    }, [groupedDays, activeStoryDate]);

    const activeClip = activeDayClips[currentClipIndex] || null;

    // Synchronize video element playback with active clip
    useEffect(() => {
        if (!showVideoPlayer || !activeClip || !videoRef.current) return;
        const video = videoRef.current;
        video.src = activeClip.clip_url;
        video.currentTime = 0;
        video.load();

        if (isPlaying) {
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn('[JournalStoryView] Autoplay blocked or deferred:', err);
                });
            }
        }
    }, [showVideoPlayer, activeClip?.id, activeClip?.clip_url]);

    // ── Start Full-screen Story Player ──
    const handleStartDayPlayer = useCallback((date: string, clipIdx = 0) => {
        setLoopingClipId(null);
        setActiveStoryDate(date);
        setCurrentClipIndex(clipIdx);
        setShowVideoPlayer(true);
        setIsPlaying(true);
    }, []);

    const handleClosePlayer = useCallback(() => {
        setShowVideoPlayer(false);
        setIsPlaying(false);
        if (videoRef.current) {
            videoRef.current.pause();
        }
    }, []);

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

    const togglePlayerPlay = useCallback(() => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play().catch(console.error);
            setIsPlaying(true);
        }
    }, [isPlaying]);

    const handleDeleteConfirmed = async () => {
        if (!clipToDelete) return;
        const { id: clipId } = clipToDelete;
        setClipToDelete(null);

        try {
            await deleteClip(clipId);
            await deleteLocalJournalRecording(clipId);
            setAllClips(prev => prev.filter(c => c.id !== clipId));
            if (activeClip?.id === clipId) {
                if (activeDayClips.length <= 1) {
                    handleClosePlayer();
                } else {
                    handleNextClip();
                }
            }
        } catch (err) {
            console.error('[JournalStoryView] Delete take error:', err);
        }
    };

    // ── Drag and Drop Reordering Handlers ──
    const handleReorderClips = async (date: string, draggedId: string, targetId: string) => {
        if (draggedId === targetId) return;

        const dayClips = groupedDays.find(([d]) => d === date)?.[1] || [];
        const oldIndex = dayClips.findIndex(c => c.id === draggedId);
        const newIndex = dayClips.findIndex(c => c.id === targetId);

        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = [...dayClips];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);

        // Update clip_order numbers
        const updatedClips = reordered.map((c, idx) => ({ ...c, clip_order: idx }));

        // Optimistically update allClips state
        setAllClips(prev => {
            const others = prev.filter(c => (c.clip_date || c.created_at.slice(0, 10)) !== date);
            return [...others, ...updatedClips];
        });

        // Persist to Supabase if online
        if (user?.id) {
            try {
                await reorderDailyClips(user.id, date, updatedClips);
            } catch (err) {
                console.error('[JournalStoryView] Failed to persist reordering:', err);
            }
        }
    };

    // ── Full-Screen Player Touch & Swipe Handlers ──
    const handlePlayerTouchStart = (e: React.TouchEvent) => {
        isPlayerLongPressTriggeredRef.current = false;
        const touch = e.touches[0];
        playerTouchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now()
        };

        if (playerLongPressTimerRef.current) {
            clearTimeout(playerLongPressTimerRef.current);
        }

        // Long press on mobile in player to trigger delete prompt
        playerLongPressTimerRef.current = setTimeout(() => {
            isPlayerLongPressTriggeredRef.current = true;
            if (navigator.vibrate) {
                try { navigator.vibrate(60); } catch {}
            }
            if (activeClip) {
                setClipToDelete({ id: activeClip.id, date: activeStoryDate });
            }
        }, 900);
    };

    const handlePlayerTouchMove = (e: React.TouchEvent) => {
        if (!playerTouchStartRef.current) return;
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - playerTouchStartRef.current.x);
        const dy = Math.abs(touch.clientY - playerTouchStartRef.current.y);

        // Cancel long-press if moving finger (e.g. initiating swipe)
        if (dx > 10 || dy > 10) {
            if (playerLongPressTimerRef.current) {
                clearTimeout(playerLongPressTimerRef.current);
                playerLongPressTimerRef.current = null;
            }
        }
    };

    const handlePlayerTouchEnd = (e: React.TouchEvent) => {
        if (playerLongPressTimerRef.current) {
            clearTimeout(playerLongPressTimerRef.current);
            playerLongPressTimerRef.current = null;
        }

        if (isPlayerLongPressTriggeredRef.current) {
            isPlayerLongPressTriggeredRef.current = false;
            playerTouchStartRef.current = null;
            return;
        }

        if (!playerTouchStartRef.current) return;
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - playerTouchStartRef.current.x;
        const deltaY = touch.clientY - playerTouchStartRef.current.y;
        playerTouchStartRef.current = null;

        // Horizontal Swipe threshold: at least 40px, mostly horizontal
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX < 0) {
                // Swipe Left -> Next Take in sequence
                handleNextClip();
            } else {
                // Swipe Right -> Previous Take in sequence
                handlePrevClip();
            }
            return;
        }

        // Tap on player background/video: close player if tapped on the active video
        // or toggle play if quick tap
    };

    // ── Gesture Handlers for Matrix Films (Single Tap opens full-screen loop, long-press enables drag-and-drop) ──
    const handleSquarePointerDown = (e: React.PointerEvent, clip: JournalClip, date: string, index: number) => {
        isLongPressTriggeredRef.current = false;
        pointerStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            time: Date.now(),
            clipId: clip.id,
            date,
            index
        };

        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }

        // 700ms Long-Press Timer activates drag-and-drop mode
        longPressTimerRef.current = setTimeout(() => {
            isLongPressTriggeredRef.current = true;
            if (navigator.vibrate) {
                try { navigator.vibrate(50); } catch {}
            }
            setDragEnabledClipId(clip.id);
        }, 700);
    };

    const handleSquarePointerMove = (e: React.PointerEvent) => {
        if (!pointerStartRef.current) return;
        const dx = Math.abs(e.clientX - pointerStartRef.current.x);
        const dy = Math.abs(e.clientY - pointerStartRef.current.y);

        if (dx > 8 || dy > 8) {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
        }
    };

    const handleSquarePointerUp = (e: React.PointerEvent, clip: JournalClip, date: string, index: number) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        if (isLongPressTriggeredRef.current) {
            isLongPressTriggeredRef.current = false;
            pointerStartRef.current = null;
            return;
        }

        if (!pointerStartRef.current) return;
        const dx = Math.abs(e.clientX - pointerStartRef.current.x);
        const dy = Math.abs(e.clientY - pointerStartRef.current.y);
        pointerStartRef.current = null;

        if (dx > 8 || dy > 8) return;

        // Single Click: Open full-screen player looping this short!
        setIsLooping(true);
        handleStartDayPlayer(date, index);
    };

    const handleSquarePointerCancel = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        isLongPressTriggeredRef.current = false;
        pointerStartRef.current = null;
    };

    return (
        <div className={`yolofuck-storyview-root ${showVideoPlayer ? 'player-active' : ''}`}>
            {/* ══════════════════════════════════════════════════════════
                1. FULL-SCREEN 9:16 VIDEO PLAYER VIEW
               ══════════════════════════════════════════════════════════ */}
            {showVideoPlayer && activeClip ? (
                <div className="yolofuck-player-container">
                    <div 
                        className="yolofuck-player-canvas"
                        onTouchStart={handlePlayerTouchStart}
                        onTouchMove={handlePlayerTouchMove}
                        onTouchEnd={handlePlayerTouchEnd}
                    >
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
                            onClick={handleClosePlayer}
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
                                    {formatVerticalDate(activeStoryDate)}
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

                        {/* Center Play Splash when paused */}
                        {!isPlaying && (
                            <div className="yolofuck-player-pause-splash" onClick={togglePlayerPlay}>
                                <Play size={54} fill="#ffffff" color="#ffffff" />
                            </div>
                        )}

                        {/* Player Bottom Dock: Matches Journal bottom nav (Journal, Share, Record) without < and > */}
                        <nav className="yolofuck-player-dock-bar">
                            <button
                                type="button"
                                className="yolofuck-bottom-nav-btn active"
                                onClick={handleClosePlayer}
                                title="Back to Journal"
                            >
                                <Layers size={19} />
                                <span>Journal</span>
                            </button>

                            <button
                                type="button"
                                className="yolofuck-bottom-nav-btn"
                                onClick={() => {
                                    setLockedShareDate(activeStoryDate);
                                    setShowShareModal(true);
                                }}
                                title="Share Story"
                            >
                                <Share2 size={19} />
                                <span>Share</span>
                            </button>

                            <button
                                type="button"
                                className="yolofuck-bottom-record-btn"
                                onClick={() => {
                                    handleClosePlayer();
                                    if (onOpenRecord) onOpenRecord();
                                }}
                                title="Record Take"
                            >
                                <span className="yolofuck-rec-dot" />
                                <Video size={19} />
                                <span>Record</span>
                            </button>
                        </nav>
                    </div>
                </div>
            ) : (
                /* ══════════════════════════════════════════════════════════
                    2. MAIN FEED: TIGHT SQUARE VIDEO SHORTS MATRIX
                   ══════════════════════════════════════════════════════════ */
                <div className="yolofuck-matrix-container">
                    {/* Sub-Header Strip (Placed under searchbar, above Today's row) */}
                    <div className="yolofuck-today-strip-bar">
                        <button
                            type="button"
                            className="yolofuck-today-play-btn"
                            onClick={() => handleStartDayPlayer(todayDate, 0)}
                            disabled={todayClips.length === 0}
                            title="Play today's story in sequence"
                        >
                            <Play size={13} fill="#ffffff" />
                            <span>Play Story</span>
                        </button>

                        <div className="yolofuck-today-summary-badge">
                            <span>{todayClips.length} {todayClips.length === 1 ? 'take' : 'takes'}</span>
                            {todayTotalMs > 0 && <span className="yolofuck-summary-dot">·</span>}
                            {todayTotalMs > 0 && <span>{formatDuration(todayTotalMs)}</span>}
                        </div>

                        <button
                            type="button"
                            className="yolofuck-today-share-btn"
                            onClick={() => {
                                setLockedShareDate(todayDate);
                                setShowShareModal(true);
                            }}
                            disabled={todayClips.length === 0}
                            title="Share today's story"
                        >
                            <Share2 size={13} />
                            <span>Share</span>
                        </button>
                    </div>

                    {/* Filter info feedback if search query is active */}
                    {searchQuery && (
                        <div className="yolofuck-search-feedback-strip">
                            <Sparkles size={13} color="#10b981" />
                            <span>Filtered by spoken words: "{searchQuery}"</span>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && (
                        <div className="yolofuck-feed-loading">
                            <span>Loading video shorts grid...</span>
                        </div>
                    )}

                    {/* Matrix Grid: Day rows stacked vertically with 2px gap */}
                    {!loading && (
                        <div className="yolofuck-grid-rows-list">
                            {groupedDays.map(([date, clips]) => {
                                const formattedDate = formatVerticalDate(date);

                                return (
                                    <div key={date} className="yolofuck-grid-day-row">
                                        {/* Desktop Info Box (1:1 square, 128px height): Play & Share buttons + Date */}
                                        <div 
                                            className="yolofuck-day-info-card"
                                            title={`Day: ${formattedDate}`}
                                        >
                                            <div className="yolofuck-day-info-top">
                                                <button
                                                    type="button"
                                                    className="yolofuck-day-info-btn play"
                                                    onClick={() => handleStartDayPlayer(date, 0)}
                                                    disabled={clips.length === 0}
                                                    title={`Play ${formattedDate} story in sequence`}
                                                >
                                                    <Play size={18} fill="#ffffff" color="#ffffff" />
                                                </button>

                                                <button
                                                    type="button"
                                                    className="yolofuck-day-info-btn share"
                                                    onClick={async () => {
                                                        if (clips.length > 0 && user?.id) {
                                                            try {
                                                                await ensureDailyStoryIdea(user.id, null, date, clips, effectiveUsername);
                                                            } catch (err) {
                                                                console.warn('[JournalStoryView] auto-ensure share story error:', err);
                                                            }
                                                        }
                                                        if (onNavigateToShared) {
                                                            onNavigateToShared();
                                                        } else {
                                                            window.dispatchEvent(new CustomEvent('journal_navigate_tab', { detail: { tab: 'shared' } }));
                                                        }
                                                    }}
                                                    disabled={clips.length === 0}
                                                    title="Open Shared stories timeline"
                                                >
                                                    <Share2 size={16} />
                                                </button>
                                            </div>

                                            <div className="yolofuck-day-info-bottom">
                                                <span className="yolofuck-day-info-date">{formattedDate}</span>
                                                <span className="yolofuck-day-info-count">{clips.length} {clips.length === 1 ? 'take' : 'takes'}</span>
                                            </div>
                                        </div>

                                        {/* Horizontal Strip of Square Films (2px gap, oldest to newest) */}
                                        <div className="yolofuck-films-horizontal-strip">
                                            {clips.length === 0 ? (
                                                <div className="yolofuck-empty-row-box">
                                                    <Video size={18} color="#475569" />
                                                    <span>No takes recorded</span>
                                                </div>
                                            ) : (
                                                clips.map((clip, idx) => {
                                                    const isLoopingThis = loopingClipId === clip.id;
                                                    const isDraggingThis = draggingClip?.clip.id === clip.id;
                                                    const isDragOverThis = dragOverClipId === clip.id;

                                                    return (
                                                        <div 
                                                            key={clip.id}
                                                            draggable={dragEnabledClipId === clip.id}
                                                            className={`yolofuck-film-square ${isLoopingThis ? 'is-looping' : ''} ${isDraggingThis ? 'is-dragging' : ''} ${isDragOverThis ? 'drag-over' : ''}`}
                                                            onPointerDown={(e) => handleSquarePointerDown(e, clip, date, idx)}
                                                            onPointerMove={handleSquarePointerMove}
                                                            onPointerUp={(e) => handleSquarePointerUp(e, clip, date, idx)}
                                                            onPointerCancel={handleSquarePointerCancel}
                                                            onDragStart={() => setDraggingClip({ clip, date })}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                if (dragOverClipId !== clip.id) setDragOverClipId(clip.id);
                                                            }}
                                                            onDragLeave={() => {
                                                                if (dragOverClipId === clip.id) setDragOverClipId(null);
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                if (draggingClip && draggingClip.date === date) {
                                                                    handleReorderClips(date, draggingClip.clip.id, clip.id);
                                                                }
                                                                setDraggingClip(null);
                                                                setDragOverClipId(null);
                                                                setDragEnabledClipId(null);
                                                            }}
                                                            onDragEnd={() => {
                                                                setDraggingClip(null);
                                                                setDragOverClipId(null);
                                                                setDragEnabledClipId(null);
                                                            }}
                                                            title={`Take ${idx + 1}`}
                                                        >
                                                            {isLoopingThis ? (
                                                                <video
                                                                    src={clip.clip_url}
                                                                    autoPlay
                                                                    loop
                                                                    playsInline
                                                                    muted={false}
                                                                    className="yolofuck-square-media"
                                                                />
                                                            ) : clip.thumbnail_url ? (
                                                                <img 
                                                                    src={clip.thumbnail_url} 
                                                                    alt={`Take ${idx + 1}`} 
                                                                    className="yolofuck-square-media" 
                                                                />
                                                            ) : (
                                                                <video
                                                                    src={clip.clip_url}
                                                                    className="yolofuck-square-media"
                                                                    preload="metadata"
                                                                    muted
                                                                />
                                                            )}

                                                            {/* Micro Take Badge: Sequence number only */}
                                                            <div className="yolofuck-square-overlay">
                                                                <span className="yolofuck-square-take-idx">
                                                                    {idx + 1}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Delete Confirmation Modal for Fullscreen Long-Press or Deletion */}
            {clipToDelete && (
                <div 
                    className="yolofuck-delete-confirm-overlay"
                    onClick={() => setClipToDelete(null)}
                >
                    <div 
                        className="yolofuck-delete-confirm-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="yolofuck-delete-confirm-title">Delete Take?</h3>
                        <p className="yolofuck-delete-confirm-desc">
                            This film will be permanently removed from your story sequence and journal.
                        </p>
                        <div className="yolofuck-delete-confirm-actions">
                            <button 
                                type="button"
                                className="yolofuck-delete-btn-cancel" 
                                onClick={() => setClipToDelete(null)}
                            >
                                Cancel
                            </button>
                            <button 
                                type="button"
                                className="yolofuck-delete-btn-confirm" 
                                onClick={handleDeleteConfirmed}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Command Center Modal */}
            {showShareModal && lockedShareDate && (
                <JournalShareCommandCenter
                    date={lockedShareDate}
                    clips={groupedDays.find(([d]) => d === lockedShareDate)?.[1] || []}
                    projectId={null}
                    userId={user?.id || 'local_user'}
                    username={effectiveUsername}
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
