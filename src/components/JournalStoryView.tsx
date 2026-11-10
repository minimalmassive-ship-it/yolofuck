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
    Layers,
    ArrowRight,
    ArrowLeft,
    RotateCcw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    getLocalDateISO,
    fetchAllUserClips,
    deleteClip,
    reorderDailyClips,
    ensureDailyStoryIdea,
    getDayCustomOrder,
    setDayCustomOrder,
    resetDayCustomOrder,
    claimAllExistingClipsForUser,
    type JournalClip,
} from '../lib/journalStoryService';
import { getAllLocalJournalRecordings, deleteLocalJournalRecording } from '../lib/journalLocalStorage';
import { moveToTrash } from '../lib/journalTrashStorage';
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

/** Formats ISO string into HH:MM (e.g. 01:11) */
function formatTakeTime(isoStr?: string): string {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    } catch {
        return '';
    }
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
    const [volume, setVolume] = useState<number>(1);
    const [isLooping, setIsLooping] = useState(false);
    const [isSingleClipMode, setIsSingleClipMode] = useState(false);
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
    const [reorderVersion, setReorderVersion] = useState<number>(0);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Pointer gesture trackers for video cards: single click, drag, long-press (reorder)
    const pointerStartRef = useRef<{ x: number; y: number; time: number; clipId: string; date: string; index: number } | null>(null);
    const longPressTimerRef = useRef<any>(null);
    const isLongPressTriggeredRef = useRef(false);

    // Touch & Mouse Pointer gesture tracker for Full-Screen Player: Horizontal Swipe left/right
    const [playerDragOffset, setPlayerDragOffset] = useState<number>(0);
    const [isSwipeTransitioning, setIsSwipeTransitioning] = useState<boolean>(false);
    const playerPointerStartRef = useRef<{ 
        x: number; 
        y: number; 
        time: number; 
        isTracking: boolean;
        isLockedHorizontal: boolean;
        canvasWidth: number;
    } | null>(null);
    const playerLongPressTimerRef = useRef<any>(null);
    const isPlayerLongPressTriggeredRef = useRef(false);

    // Desktop Mouse Drag-to-Scroll on Horizontal Strip
    const stripMouseDragRef = useRef<{ date: string; startX: number; scrollLeftStart: number; isDragging: boolean } | null>(null);

    // Mobile Swipe-Right pull-to-play gesture state per row
    const [rowPullDistances, setRowPullDistances] = useState<{ [date: string]: number }>({});
    const rowTouchStartRef = useRef<{ date: string; startX: number; startY: number; scrollLeftStart: number; isTracking: boolean } | null>(null);

    // Desktop Strip Mouse drag-to-scroll handlers
    const handleStripMouseDown = (date: string, e: React.MouseEvent<HTMLDivElement>) => {
        // Only initiate on left click and not on a direct interactive button
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;

        stripMouseDragRef.current = {
            date,
            startX: e.pageX - e.currentTarget.offsetLeft,
            scrollLeftStart: e.currentTarget.scrollLeft,
            isDragging: true
        };
        e.currentTarget.style.cursor = 'grabbing';
    };

    const handleStripMouseMove = (date: string, e: React.MouseEvent<HTMLDivElement>) => {
        if (!stripMouseDragRef.current || !stripMouseDragRef.current.isDragging || stripMouseDragRef.current.date !== date) return;
        e.preventDefault();
        const x = e.pageX - e.currentTarget.offsetLeft;
        const walk = (x - stripMouseDragRef.current.startX) * 1.5;
        e.currentTarget.scrollLeft = stripMouseDragRef.current.scrollLeftStart - walk;
    };

    const handleStripMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (stripMouseDragRef.current) {
            stripMouseDragRef.current.isDragging = false;
            stripMouseDragRef.current = null;
        }
        e.currentTarget.style.cursor = 'grab';
    };

    const handleRowTouchStart = (date: string, e: React.TouchEvent<HTMLDivElement>) => {
        const touch = e.touches[0];
        if (!touch) return;
        const currentScrollLeft = e.currentTarget.scrollLeft;
        // We only initiate overscroll pull if we are right at the left wall (scrollLeft <= 2)
        rowTouchStartRef.current = {
            date,
            startX: touch.clientX,
            startY: touch.clientY,
            scrollLeftStart: currentScrollLeft,
            isTracking: currentScrollLeft <= 2
        };
    };

    const handleRowTouchMove = (date: string, e: React.TouchEvent<HTMLDivElement>) => {
        if (!rowTouchStartRef.current || rowTouchStartRef.current.date !== date) return;
        const touch = e.touches[0];
        if (!touch) return;

        const currentScrollLeft = e.currentTarget.scrollLeft;
        const deltaX = touch.clientX - rowTouchStartRef.current.startX;
        const deltaY = touch.clientY - rowTouchStartRef.current.startY;

        // If user is scrolling vertically or not at left edge, cancel overscroll tracking
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
            rowTouchStartRef.current.isTracking = false;
            setRowPullDistances(prev => prev[date] ? { ...prev, [date]: 0 } : prev);
            return;
        }

        // Only track swipe to the right (deltaX > 0) when at the left wall
        if (rowTouchStartRef.current.isTracking && currentScrollLeft <= 2 && deltaX > 0) {
            // Smooth resistance curve up to 80px
            const pullAmount = Math.min(80, deltaX * 0.55);
            setRowPullDistances(prev => ({ ...prev, [date]: pullAmount }));
        } else {
            setRowPullDistances(prev => prev[date] ? { ...prev, [date]: 0 } : prev);
        }
    };

    const handleRowTouchEnd = (date: string, clipsCount: number) => {
        const currentPull = rowPullDistances[date] || 0;
        rowTouchStartRef.current = null;
        setRowPullDistances(prev => ({ ...prev, [date]: 0 }));

        // Trigger sequence player if pulled past threshold (>= 48px) and row has clips
        if (currentPull >= 48 && clipsCount > 0) {
            if (navigator.vibrate) {
                try { navigator.vibrate(50); } catch {}
            }
            handleStartDayPlayer(date, 0);
        }
    };

    // ── Load Clips from Supabase & Local IndexedDB ──
    const loadAllClips = useCallback(async () => {
        if (!user?.id) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            // One-time safety claim for minimalmassive@gmail.com / Plasticin
            if (
                user.email === 'minimalmassive@gmail.com' ||
                user.id === '4fb34c08-a3b7-45b3-a7ad-fda625eae464' ||
                profile?.username?.toLowerCase() === 'plasticin'
            ) {
                await claimAllExistingClipsForUser(user.id);
            }

            // 1. Fetch cloud clips strictly for this user
            const cloudClips = await fetchAllUserClips(user.id);

            // 2. Fetch local storage clips strictly for this user
            const localEntries = await getAllLocalJournalRecordings(user.id);
            const localMapped: JournalClip[] = localEntries.map((loc) => {
                const date = loc.createdAt ? loc.createdAt.slice(0, 10) : getLocalDateISO();
                return {
                    id: loc.id,
                    user_id: user.id,
                    project_id: null,
                    clip_url: URL.createObjectURL(loc.blob),
                    thumbnail_url: null,
                    transcription: loc.transcription || null,
                    duration_ms: loc.durationMs || 5000,
                    clip_order: 0,
                    clip_date: date,
                    is_merged: false,
                    created_at: loc.createdAt || new Date().toISOString()
                };
            });

            // Combine avoiding duplicates between cloud and local
            const combinedMap = new Map<string, JournalClip>();
            cloudClips.forEach(c => combinedMap.set(c.id, c));

            // Add local clips only if not already present in cloudClips
            localMapped.forEach(l => {
                const alreadyInCloud = cloudClips.some(c => {
                    const sameDate = (c.clip_date === l.clip_date);
                    const timeDiff = Math.abs(new Date(c.created_at).getTime() - new Date(l.created_at).getTime());
                    const durDiff = Math.abs((c.duration_ms || 0) - (l.duration_ms || 0));
                    return sameDate && timeDiff < 20000 && durDiff < 2000;
                });

                if (!alreadyInCloud && !combinedMap.has(l.id)) {
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
    }, [user?.id, user?.email, profile?.username]);

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
            map.get(date)!.push({ ...clip });
        }

        // Process each day:
        // 1. Sort strictly chronologically by created_at ASC (oldest to newest: left to right)
        // 2. Assign permanent original take number (1, 2, 3... N)
        // 3. If the user saved a custom sequence (via drag & drop), arrange according to custom order
        map.forEach((clips, date) => {
            // Step 1: Chronological sort
            clips.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            // Step 2: Assign permanent original take number
            clips.forEach((c, idx) => {
                if (!c.original_take_number) {
                    c.original_take_number = idx + 1;
                }
            });

            // Step 3: Check if user has reordered this day's sequence
            const customOrder = getDayCustomOrder(user?.id || 'local_user', date);
            if (customOrder && Array.isArray(customOrder) && customOrder.length > 0) {
                const posMap = new Map<string, number>();
                customOrder.forEach((id, pos) => posMap.set(id, pos));
                clips.sort((a, b) => {
                    const posA = posMap.has(a.id) ? posMap.get(a.id)! : 99999;
                    const posB = posMap.has(b.id) ? posMap.get(b.id)! : 99999;
                    if (posA !== posB) return posA - posB;
                    return (a.original_take_number || 0) - (b.original_take_number || 0);
                });
            }
        });

        // Convert to array and sort dates DESCENDING (today first, then yesterday, etc.)
        const entries = Array.from(map.entries());
        entries.sort(([dateA], [dateB]) => dateB.localeCompare(dateA));

        return entries;
    }, [allClips, searchQuery, user?.id, reorderVersion]);

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
        video.muted = isMuted;
        video.volume = volume;
        video.load();

        if (isPlaying) {
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn('[JournalStoryView] Autoplay blocked or deferred:', err);
                });
            }
        }
    }, [showVideoPlayer, activeClip?.id, activeClip?.clip_url, volume, isMuted]);

    // ── Start Full-screen Story Player ──
    const handleStartDayPlayer = useCallback((date: string, clipIdx = 0, isSingle = false) => {
        setLoopingClipId(null);
        setActiveStoryDate(date);
        setCurrentClipIndex(clipIdx);
        setIsSingleClipMode(isSingle);
        setIsLooping(isSingle); // Default loop to true for single clip tap
        setShowVideoPlayer(true);
        setIsPlaying(true);
    }, []);

    const handleClosePlayer = useCallback(() => {
        setShowVideoPlayer(false);
        setIsPlaying(false);
        setIsSingleClipMode(false);
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
        } else if (isLooping && activeDayClips.length > 0) {
            setCurrentClipIndex(activeDayClips.length - 1);
            setCurrentTime(0);
        }
    }, [currentClipIndex, isLooping, activeDayClips.length]);

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

    const togglePlayerMute = useCallback(() => {
        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        if (videoRef.current) {
            videoRef.current.muted = nextMuted;
        }
    }, [isMuted]);

    const handlePlayerVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVol = parseFloat(e.target.value);
        setVolume(newVol);
        setIsMuted(newVol === 0);
        if (videoRef.current) {
            videoRef.current.volume = newVol;
            videoRef.current.muted = newVol === 0;
        }
    };

    const handleDeleteConfirmed = async () => {
        if (!clipToDelete) return;
        const { id: clipId } = clipToDelete;
        const targetClip = allClips.find(c => c.id === clipId);
        setClipToDelete(null);

        // Move to trash bin first
        if (targetClip) {
            moveToTrash(targetClip, 'journal', user?.id);
        }

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

        // Update clip_order numbers while preserving permanent original_take_number
        const updatedClips = reordered.map((c, idx) => ({ ...c, clip_order: idx }));

        // Persist day sequence order to localStorage
        const userId = user?.id || 'local_user';
        setDayCustomOrder(userId, date, reordered.map(c => c.id));
        setReorderVersion(v => v + 1);

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

    const handleResetDayOrder = async (date: string) => {
        const userId = user?.id || 'local_user';
        resetDayCustomOrder(userId, date);
        setReorderVersion(v => v + 1);

        // Reset order in allClips state back to chronological created_at order
        const dayClips = groupedDays.find(([d]) => d === date)?.[1] || [];
        const chronoSorted = [...dayClips].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ).map((c, idx) => ({ ...c, clip_order: idx }));

        setAllClips(prev => {
            const others = prev.filter(c => (c.clip_date || c.created_at.slice(0, 10)) !== date);
            return [...others, ...chronoSorted];
        });

        if (user?.id) {
            try {
                await reorderDailyClips(user.id, date, chronoSorted);
            } catch (err) {
                console.error('[JournalStoryView] Failed to reset reordering in DB:', err);
            }
        }
    };

    const isDayReordered = (clips: JournalClip[]) => {
        if (!clips || clips.length <= 1) return false;
        return clips.some((c, idx) => (c.original_take_number || (idx + 1)) !== (idx + 1));
    };

    // ── Full-Screen Player Pointer & Mouse Drag Swipe Handlers (Direct Follow Drag & Snap) ──
    const handlePlayerPointerDown = (e: React.PointerEvent) => {
        // Ignore if clicking interactive controls (dock, close button, pause button, volume slider)
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.closest('.yolofuck-player-dock-bar') || target.closest('.yolofuck-single-player-floating-controls')) {
            return;
        }

        if (isSwipeTransitioning) return;

        const canvasElem = e.currentTarget as HTMLElement;
        const width = canvasElem.getBoundingClientRect().width || window.innerWidth;

        isPlayerLongPressTriggeredRef.current = false;
        playerPointerStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            time: Date.now(),
            isTracking: true,
            isLockedHorizontal: false,
            canvasWidth: width
        };

        if (playerLongPressTimerRef.current) {
            clearTimeout(playerLongPressTimerRef.current);
        }

        // Long press in player (touch or mouse hold) to trigger delete prompt
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

    const handlePlayerPointerMove = (e: React.PointerEvent) => {
        const start = playerPointerStartRef.current;
        if (!start || !start.isTracking || isSwipeTransitioning) return;

        const rawDx = e.clientX - start.x;
        const rawDy = e.clientY - start.y;
        const absX = Math.abs(rawDx);
        const absY = Math.abs(rawDy);

        // Cancel long-press if pointer moves noticeably
        if (absX > 8 || absY > 8) {
            if (playerLongPressTimerRef.current) {
                clearTimeout(playerLongPressTimerRef.current);
                playerLongPressTimerRef.current = null;
            }
        }

        // Lock horizontal gesture if horizontal movement dominates vertical
        if (!start.isLockedHorizontal) {
            if (absX > 8 && absX > absY * 1.2) {
                start.isLockedHorizontal = true;
                // Capture pointer to ensure smooth drag tracking outside bounds
                try {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                } catch {}
            } else if (absY > 15) {
                // Dominant vertical scroll/drag - do not hijack
                start.isTracking = false;
                setPlayerDragOffset(0);
                return;
            }
        }

        if (start.isLockedHorizontal) {
            // Check boundary limits for elastic rubber-band resistance
            const isAtStartBoundary = currentClipIndex === 0 && rawDx > 0 && !isLooping;
            const isAtEndBoundary = currentClipIndex >= activeDayClips.length - 1 && rawDx < 0 && !isLooping;

            let computedOffset = rawDx;
            if (isAtStartBoundary || isAtEndBoundary) {
                // Apply elastic damping: 0.28x resistance
                computedOffset = rawDx * 0.28;
            }

            setPlayerDragOffset(computedOffset);
        }
    };

    const handlePlayerPointerUp = (e: React.PointerEvent) => {
        if (playerLongPressTimerRef.current) {
            clearTimeout(playerLongPressTimerRef.current);
            playerLongPressTimerRef.current = null;
        }

        try {
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
        } catch {}

        if (isPlayerLongPressTriggeredRef.current) {
            isPlayerLongPressTriggeredRef.current = false;
            playerPointerStartRef.current = null;
            setPlayerDragOffset(0);
            return;
        }

        const start = playerPointerStartRef.current;
        if (!start || !start.isTracking) {
            playerPointerStartRef.current = null;
            setPlayerDragOffset(0);
            return;
        }

        const deltaX = e.clientX - start.x;
        const deltaTime = Math.max(1, Date.now() - start.time);
        const velocity = Math.abs(deltaX) / deltaTime; // pixels per ms
        const width = start.canvasWidth || 360;
        const dragRatio = Math.abs(deltaX) / width;

        playerPointerStartRef.current = null;

        // Industry standard threshold:
        // Either distance >= 22% of player canvas width OR flick velocity >= 0.35 px/ms with >= 30px move
        const meetsThreshold = (dragRatio >= 0.22 && Math.abs(deltaX) >= 40) || (velocity >= 0.35 && Math.abs(deltaX) >= 30);

        if (start.isLockedHorizontal && meetsThreshold) {
            if (deltaX < 0) {
                // Swipe Left -> Next Take
                const hasNext = currentClipIndex < activeDayClips.length - 1 || isLooping;
                if (hasNext) {
                    setIsSwipeTransitioning(true);
                    setPlayerDragOffset(-width);
                    setTimeout(() => {
                        handleNextClip();
                        setPlayerDragOffset(0);
                        setIsSwipeTransitioning(false);
                    }, 240);
                    return;
                }
            } else if (deltaX > 0) {
                // Swipe Right -> Previous Take
                const hasPrev = currentClipIndex > 0 || isLooping;
                if (hasPrev) {
                    setIsSwipeTransitioning(true);
                    setPlayerDragOffset(width);
                    setTimeout(() => {
                        handlePrevClip();
                        setPlayerDragOffset(0);
                        setIsSwipeTransitioning(false);
                    }, 240);
                    return;
                }
            }
        }

        // If threshold not met or at boundary: spring/bounce smoothly back to 0
        if (Math.abs(playerDragOffset) > 0 || (start.isLockedHorizontal && deltaX !== 0)) {
            setIsSwipeTransitioning(true);
            setPlayerDragOffset(0);
            setTimeout(() => {
                setIsSwipeTransitioning(false);
            }, 260);
            return;
        }

        // Quick click on the background/video: toggle play/pause
        const target = e.target as HTMLElement;
        if (target.classList.contains('yolofuck-player-video') || target.classList.contains('yolofuck-player-slide-track')) {
            togglePlayerPlay();
        }
    };

    const handlePlayerPointerCancel = (e: React.PointerEvent) => {
        if (playerLongPressTimerRef.current) {
            clearTimeout(playerLongPressTimerRef.current);
            playerLongPressTimerRef.current = null;
        }
        try {
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
        } catch {}
        playerPointerStartRef.current = null;
        isPlayerLongPressTriggeredRef.current = false;
        setIsSwipeTransitioning(true);
        setPlayerDragOffset(0);
        setTimeout(() => setIsSwipeTransitioning(false), 240);
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

        // Single Click: Open full-screen player in single-clip loop mode with controls!
        handleStartDayPlayer(date, index, true);
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
                        onPointerDown={handlePlayerPointerDown}
                        onPointerMove={handlePlayerPointerMove}
                        onPointerUp={handlePlayerPointerUp}
                        onPointerCancel={handlePlayerPointerCancel}
                    >
                        {/* Video Slider Track with 1:1 Direct Manipulation Drag Follow & Physics */}
                        <div 
                            className="yolofuck-player-slide-track"
                            style={{
                                transform: `translate3d(${playerDragOffset}px, 0, 0)`,
                                transition: isSwipeTransitioning 
                                    ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' 
                                    : 'none'
                            }}
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
                            />
                        </div>

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
                                    Take {activeClip?.original_take_number || (currentClipIndex + 1)}
                                    {activeClip?.original_take_number && activeClip.original_take_number !== (currentClipIndex + 1) ? (
                                        <span className="yolofuck-player-pos-hint"> (pos {currentClipIndex + 1}/{activeDayClips.length})</span>
                                    ) : (
                                        ` of ${activeDayClips.length}`
                                    )}
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

                        {/* Player Bottom Dock: Dedicated video controls (Back, Play/Pause, Loop, Volume) */}
                        <nav className="yolofuck-player-dock-bar" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                className="yolofuck-player-dock-btn back"
                                onClick={handleClosePlayer}
                                title="Back to Journal"
                            >
                                <ArrowLeft size={20} />
                                <span>Back</span>
                            </button>

                            <button
                                type="button"
                                className="yolofuck-player-dock-btn play"
                                onClick={togglePlayerPlay}
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}
                                <span>{isPlaying ? 'Pause' : 'Play'}</span>
                            </button>

                            <button
                                type="button"
                                className={`yolofuck-player-dock-btn loop ${isLooping ? 'active' : ''}`}
                                onClick={() => setIsLooping(prev => !prev)}
                                title={isLooping ? 'Loop is On' : 'Loop is Off'}
                            >
                                <Repeat size={18} />
                                <span>Loop</span>
                            </button>

                            <div className="yolofuck-player-dock-volume-group">
                                <button
                                    type="button"
                                    className="yolofuck-player-dock-btn vol-btn"
                                    onClick={togglePlayerMute}
                                    title={isMuted ? 'Unmute' : 'Mute'}
                                >
                                    {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                </button>

                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={handlePlayerVolumeChange}
                                    className="yolofuck-single-volume-slider"
                                    title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                                />
                            </div>
                        </nav>
                    </div>
                </div>
            ) : (
                /* ══════════════════════════════════════════════════════════
                    2. MAIN FEED: TIGHT SQUARE VIDEO SHORTS MATRIX
                   ══════════════════════════════════════════════════════════ */
                <div className="yolofuck-matrix-container">
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
                                                    <Play size={18} fill="#000000" color="#000000" />
                                                </button>

                                                <button
                                                    type="button"
                                                    className="yolofuck-day-info-btn share"
                                                    onClick={async () => {
                                                        const targetUserId = user?.id || 'local_user';
                                                        if (clips.length > 0) {
                                                            try {
                                                                await ensureDailyStoryIdea(targetUserId, null, date, clips, effectiveUsername);
                                                            } catch (err) {
                                                                console.warn('[JournalStoryView] auto-ensure share story error:', err);
                                                            }
                                                        }
                                                        // Notify Shared tab to refresh immediately
                                                        window.dispatchEvent(new CustomEvent('journal_shared_updated', { detail: { date } }));
                                                        if (onNavigateToShared) {
                                                            onNavigateToShared();
                                                        } else {
                                                            window.dispatchEvent(new CustomEvent('journal_navigate_tab', { detail: { tab: 'shared' } }));
                                                        }
                                                    }}
                                                    disabled={clips.length === 0}
                                                    title="Forward sequence to Shared tab"
                                                >
                                                    <Share2 size={13} />
                                                    <ArrowRight size={12} className="share-arrow-icon" />
                                                </button>
                                            </div>

                                            <div className="yolofuck-day-info-bottom">
                                                <span className="yolofuck-day-info-date">{formattedDate}</span>
                                                <div className="yolofuck-day-info-meta-row">
                                                    <span className="yolofuck-day-info-count">{clips.length} {clips.length === 1 ? 'take' : 'takes'}</span>
                                                    {isDayReordered(clips) && (
                                                        <button
                                                            type="button"
                                                            className="yolofuck-reset-order-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleResetDayOrder(date);
                                                            }}
                                                            title="Reset sequence back to original chronological recording order"
                                                        >
                                                            <RotateCcw size={10} style={{ marginRight: 3 }} />
                                                            Reset
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile Vertical Sideways Date Strip (Hidden on Desktop) */}
                                        <div 
                                            className="yolofuck-vertical-date-strip"
                                            title={`Date: ${formattedDate}`}
                                        >
                                            <span className="yolofuck-vertical-date-text">
                                                {formattedDate}
                                            </span>
                                        </div>

                                        {/* Pull to Play Reveal Drawer (Emerges on swipe right when pushed past the left wall) */}
                                        {rowPullDistances[date] > 0 && (
                                            <div 
                                                className="yolofuck-swipe-play-drawer" 
                                                style={{ width: `${rowPullDistances[date]}px` }}
                                            >
                                                <div className={`yolofuck-swipe-play-circle ${rowPullDistances[date] >= 48 ? 'triggered' : ''}`}>
                                                    <Play size={18} fill="currentColor" />
                                                </div>
                                            </div>
                                        )}

                                        {/* Horizontal Strip of Square Films (2px gap, oldest to newest) with touch and desktop mouse drag */}
                                        <div 
                                            className="yolofuck-films-horizontal-strip"
                                            onTouchStart={(e) => handleRowTouchStart(date, e)}
                                            onTouchMove={(e) => handleRowTouchMove(date, e)}
                                            onTouchEnd={() => handleRowTouchEnd(date, clips.length)}
                                            onMouseDown={(e) => handleStripMouseDown(date, e)}
                                            onMouseMove={(e) => handleStripMouseMove(date, e)}
                                            onMouseUp={handleStripMouseUp}
                                            onMouseLeave={handleStripMouseUp}
                                        >
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
                                                            title={`Take ${clip.original_take_number || (idx + 1)}${
                                                                clip.original_take_number && clip.original_take_number !== idx + 1
                                                                    ? ` (moved to position ${idx + 1})`
                                                                    : ''
                                                            }`}
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
                                                                    alt={`Take ${clip.original_take_number || (idx + 1)}`} 
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

                                                            {/* Top Center Take Number: Small, standard font, centered, no shadow */}
                                                            <div className="yolofuck-film-top-badge">
                                                                <span className="yolofuck-film-take-num">
                                                                    {clip.original_take_number || (idx + 1)}
                                                                </span>
                                                            </div>

                                                            {/* Bottom Start Time: e.g. 01:11 */}
                                                            {clip.created_at && (
                                                                <div className="yolofuck-film-bottom-time">
                                                                    <span>{formatTakeTime(clip.created_at)}</span>
                                                                </div>
                                                            )}
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
