/**
 * JournalStoryView.tsx v2.0.0
 *
 * The Story tab content for the Journal page.
 * A video diary timeline + chat-like feed with:
 * - Search bar (text + date picker) at top
 * - Day timeline strip showing video clip sequence for the active date with delete/jump actions
 * - Playback controls (play/stop, prev, next, close player)
 * - Seamless sequence video player replacing the chat window during playback
 * - Scrollable chat feed grouped by day with date separators
 * - Video cards in chat that open and play that day's video sequence seamlessly
 * - Chat input bar (text + image upload) at bottom
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Calendar, Play, Pause, Square, SkipBack, SkipForward, ArrowUp, Image as ImageIcon, BookOpen, X, Trash2, MessageSquare, Check, Edit2, Volume2, VolumeX, Maximize2, Minimize2, ArrowLeft, RotateCcw, Repeat, Share2, ChevronUp, ChevronDown, ArrowDownUp, Shuffle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

import {
    getLocalDateISO,
    fetchEntriesPaginated,
    fetchClipsByDate,
    saveTextEntry,
    saveImageEntry,
    deleteClip,
    syncDailyVideoEntry,
    searchEntries,
    updateEntryContent,
    fetchAvailableVideoDates,
    checkIsDailyStoryPublished,
    publishDailyStory,
    unpublishDailyStory,
    reorderDailyClips,
    getPendingStoryDate,
    setPendingStoryDate,
    type JournalEntry,
    type JournalClip,
} from '../lib/journalStoryService';
import './JournalStoryView.css';
import { JournalShareCommandCenter } from './JournalShareCommandCenter';

interface JournalStoryViewProps {
    projectId: string | null;
}

// Group entries by date for rendering with day separators
function groupEntriesByDate(entries: JournalEntry[]): Map<string, JournalEntry[]> {
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of entries) {
        const date = entry.entry_date;
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(entry);
    }
    return groups;
}

function formatDateLabel(dateStr: string): string {
    const today = getLocalDateISO();
    if (dateStr === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === getLocalDateISO(yesterday)) return 'Yesterday';

    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStoryCenterDate(dateStr: string): string {
    try {
        const d = new Date(dateStr + 'T00:00:00');
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
        const day = String(d.getDate()).padStart(2, '0');
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const year2 = String(d.getFullYear()).slice(-2);
        return `${weekday}.${day}.${month}.${year2}`;
    } catch {
        return dateStr;
    }
}

function formatTime(isoStr: string): string {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDurationSec(sec: number): string {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const JournalStoryView: React.FC<JournalStoryViewProps> = ({ projectId }) => {
    const { user, profile } = useAuth();
    const feedRef = useRef<HTMLDivElement>(null);
    const timelineStripRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const playerWrapperRef = useRef<HTMLDivElement>(null);
    const scrubberRef = useRef<HTMLDivElement>(null);

    // Initial pending date if navigated from calendar
    const pendingDateOnMount = useRef<string | null>(getPendingStoryDate());

    // ── State ──
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [activeClips, setActiveClips] = useState<JournalClip[]>([]);
    const [activeTimelineDate, setActiveTimelineDate] = useState<string>(() => pendingDateOnMount.current || getLocalDateISO());
    const [loading, setLoading] = useState(true);
    const [textInput, setTextInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentClipIndex, setCurrentClipIndex] = useState(0);
    const [showVideoPlayer, setShowVideoPlayer] = useState(() => Boolean(pendingDateOnMount.current));
    const [isLooping, setIsLooping] = useState<boolean>(true); // Whole Story looping on by default

    // Scrubber & Multi-take Timing
    const [clipDurations, setClipDurations] = useState<number[]>([]);
    const [currentGlobalTime, setCurrentGlobalTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const hideControlsTimeoutRef = useRef<any>(null);

    // Available dates with video recordings (for TikTok vertical scrolling)
    const [availableVideoDates, setAvailableVideoDates] = useState<string[]>([]);
    const [isPublished, setIsPublished] = useState(false);
    const [publishLoading, setPublishLoading] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | null>(null);
    const lastWheelTimeRef = useRef<number>(0);
    const touchStartYRef = useRef<number | null>(null);
    const isSwitchingDateRef = useRef<boolean>(false);
    const toastTimerRef = useRef<any>(null);

    const showToastMessage = useCallback((msg: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToastMessage(msg);
        toastTimerRef.current = setTimeout(() => {
            setToastMessage(null);
        }, 2500);
    }, []);

    // Inline transcription edit state
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const longPressTimerRef = useRef<any>(null);

    // ── Data loading ──
    const loadData = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const today = getLocalDateISO();
            const targetDate = activeTimelineDate || today;
            const [entryData, clipData, videoDates, published] = await Promise.all([
                fetchEntriesPaginated(user.id, 0, 200),
                fetchClipsByDate(user.id, targetDate),
                fetchAvailableVideoDates(user.id),
                checkIsDailyStoryPublished(user.id, targetDate),
            ]);
            setEntries(entryData);
            setActiveClips(clipData);
            setAvailableVideoDates(videoDates);
            setIsPublished(published);
        } catch (err) {
            console.error('[JournalStory] loadData error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id, activeTimelineDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Live refresh when a new journal video/transcription is saved
    useEffect(() => {
        const handleClipSavedEvent = () => {
            loadData();
        };
        window.addEventListener('journal_clip_saved', handleClipSavedEvent);
        return () => {
            window.removeEventListener('journal_clip_saved', handleClipSavedEvent);
        };
    }, [loadData]);

    // Initialize & sync clip durations
    useEffect(() => {
        if (activeClips.length > 0) {
            setClipDurations(activeClips.map(c => (c.duration_ms ? c.duration_ms / 1000 : 3)));
            setCurrentGlobalTime(0);
        } else {
            setClipDurations([]);
            setCurrentGlobalTime(0);
        }
    }, [activeClips]);

    // Map each clip ID to its immutable original recording number (chronological created_at)
    const originalTakeMap = useMemo(() => {
        const chronological = [...activeClips].sort((a, b) => 
            (a.created_at || '').localeCompare(b.created_at || '')
        );
        const map = new Map<string, number>();
        chronological.forEach((clip, i) => {
            map.set(clip.id, i + 1);
        });
        return map;
    }, [activeClips]);

    // Take sequence sorting handlers
    const handleSortOldestToNewest = async () => {
        const sorted = [...activeClips].sort((a, b) => {
            const orderDiff = (a.clip_order || 0) - (b.clip_order || 0);
            if (orderDiff !== 0) return orderDiff;
            return (a.created_at || '').localeCompare(b.created_at || '');
        });
        setActiveClips(sorted);
        setCurrentClipIndex(0);
        if (user?.id) {
            await reorderDailyClips(user.id, activeTimelineDate, sorted);
        }
        showToastMessage('Sorted: Oldest to Newest');
    };

    const handleSortNewestToOldest = async () => {
        const sorted = [...activeClips].sort((a, b) => {
            const orderDiff = (b.clip_order || 0) - (a.clip_order || 0);
            if (orderDiff !== 0) return orderDiff;
            return (b.created_at || '').localeCompare(a.created_at || '');
        });
        setActiveClips(sorted);
        setCurrentClipIndex(0);
        if (user?.id) {
            await reorderDailyClips(user.id, activeTimelineDate, sorted);
        }
        showToastMessage('Sorted: Newest to Oldest');
    };

    const handleSortRandom = async () => {
        const shuffled = [...activeClips].sort(() => Math.random() - 0.5);
        setActiveClips(shuffled);
        setCurrentClipIndex(0);
        if (user?.id) {
            await reorderDailyClips(user.id, activeTimelineDate, shuffled);
        }
        showToastMessage('Randomized take order');
    };

    // Top timeline takes drag and drop state & handlers
    const [draggedTimelineIdx, setDraggedTimelineIdx] = useState<number | null>(null);
    const [dragOverTimelineIdx, setDragOverTimelineIdx] = useState<number | null>(null);

    const handleTimelineDragStart = (e: React.DragEvent, index: number) => {
        setDraggedTimelineIdx(index);
        e.dataTransfer.effectAllowed = 'move';
        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '0.5';
        }
    };

    const handleTimelineDragEnd = (e: React.DragEvent) => {
        setDraggedTimelineIdx(null);
        setDragOverTimelineIdx(null);
        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '1';
        }
    };

    const handleTimelineDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedTimelineIdx === null || draggedTimelineIdx === index) return;
        setDragOverTimelineIdx(index);
    };

    const handleTimelineDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedTimelineIdx === null || draggedTimelineIdx === targetIndex) return;

        const updated = [...activeClips];
        const [movedItem] = updated.splice(draggedTimelineIdx, 1);
        updated.splice(targetIndex, 0, movedItem);

        setActiveClips(updated);
        setCurrentClipIndex(targetIndex);
        setDraggedTimelineIdx(null);
        setDragOverTimelineIdx(null);

        if (user?.id) {
            await reorderDailyClips(user.id, activeTimelineDate, updated);
        }
        const originalNum = originalTakeMap.get(movedItem.id) || (draggedTimelineIdx + 1);
        showToastMessage(`Moved Take ${originalNum} to position ${targetIndex + 1}`);
    };

    // Notify parent JournalPage and TopBarVizja when video playback state changes
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('journal_video_player_state', {
            detail: {
                isOpen: showVideoPlayer,
                isPlaying,
                isMuted,
                isLooping,
                isFullscreen,
                isShareModalOpen: showShareModal,
            }
        }));
    }, [showVideoPlayer, isPlaying, isMuted, isLooping, isFullscreen, showShareModal]);

    // Close player when requested by JournalPage Back button
    useEffect(() => {
        const handleClose = () => {
            handleClosePlayer();
        };
        window.addEventListener('journal_close_video_player', handleClose);
        return () => window.removeEventListener('journal_close_video_player', handleClose);
    }, []);

    // Listen for requests to open a specific story date (e.g. from CylinderCalendar)
    useEffect(() => {
        const handleOpenDate = async (e: any) => {
            if (e.detail?.date && user?.id) {
                const targetDate = e.detail.date;
                setActiveTimelineDate(targetDate);
                setCurrentClipIndex(0);
                setCurrentGlobalTime(0);
                setShowVideoPlayer(true);
                setIsPlaying(true);

                const [clipData, published] = await Promise.all([
                    fetchClipsByDate(user.id, targetDate),
                    checkIsDailyStoryPublished(user.id, targetDate),
                ]);
                setActiveClips(clipData);
                setIsPublished(published);
                if (clipData.length > 0 && videoRef.current) {
                    videoRef.current.src = clipData[0].clip_url;
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {});
                }
            }
        };
        window.addEventListener('journal_open_story_date', handleOpenDate);
        return () => window.removeEventListener('journal_open_story_date', handleOpenDate);
    }, [user?.id]);

    // Handle initial pending date on mount (if opened from calendar tab switch)
    useEffect(() => {
        const pending = pendingDateOnMount.current;
        if (pending && user?.id) {
            Promise.all([
                fetchClipsByDate(user.id, pending),
                checkIsDailyStoryPublished(user.id, pending),
            ]).then(([clipData, published]) => {
                setActiveClips(clipData);
                setIsPublished(published);
                setCurrentClipIndex(0);
                setCurrentGlobalTime(0);
                setShowVideoPlayer(true);
                setIsPlaying(true);
                if (clipData.length > 0 && videoRef.current) {
                    videoRef.current.src = clipData[0].clip_url;
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {});
                }
            }).catch(err => {
                console.warn('[JournalStoryView] Load pending date error:', err);
            });
        }
    }, [user?.id]);

    const totalDuration = useMemo(() => {
        return clipDurations.reduce((sum, d) => sum + (d || 0), 0);
    }, [clipDurations]);

    const getOffsetBefore = useCallback((index: number) => {
        let offset = 0;
        for (let i = 0; i < index && i < clipDurations.length; i++) {
            offset += clipDurations[i] || 0;
        }
        return offset;
    }, [clipDurations]);

    // Direct, robust clip player with next-take preloading
    const playClipAtIndex = useCallback((index: number) => {
        if (index < 0 || index >= activeClips.length) return;
        setCurrentClipIndex(index);
        const targetClip = activeClips[index];
        const video = videoRef.current;
        if (video && targetClip) {
            if (video.src !== targetClip.clip_url) {
                video.src = targetClip.clip_url;
            }
            video.currentTime = 0;
            setIsPlaying(true);
            video.play().catch(err => {
                console.warn('[JournalStoryView] Play clip error:', err);
            });
        }

        // Preload next clip in sequence for seamless transition
        const nextIdx = index + 1 < activeClips.length ? index + 1 : (isLooping ? 0 : -1);
        if (nextIdx !== -1 && activeClips[nextIdx]) {
            const preloader = document.createElement('video');
            preloader.preload = 'auto';
            preloader.src = activeClips[nextIdx].clip_url;
        }
    }, [activeClips, isLooping]);

    // Continuous sequential playback transition & whole Story loop
    const handleClipEnded = useCallback(() => {
        if (currentClipIndex < activeClips.length - 1) {
            playClipAtIndex(currentClipIndex + 1);
        } else if (isLooping && activeClips.length > 0) {
            // Repeat the entire Story from the first take
            playClipAtIndex(0);
        } else {
            setIsPlaying(false);
            setCurrentGlobalTime(totalDuration);
        }
    }, [currentClipIndex, activeClips.length, isLooping, totalDuration, playClipAtIndex]);

    const handlePrevClip = useCallback(() => {
        if (currentClipIndex > 0) {
            playClipAtIndex(currentClipIndex - 1);
        } else if (isLooping && activeClips.length > 0) {
            playClipAtIndex(activeClips.length - 1);
        }
    }, [currentClipIndex, isLooping, activeClips.length, playClipAtIndex]);

    const handleNextClip = useCallback(() => {
        if (currentClipIndex < activeClips.length - 1) {
            playClipAtIndex(currentClipIndex + 1);
        } else if (isLooping && activeClips.length > 0) {
            playClipAtIndex(0);
        }
    }, [currentClipIndex, activeClips.length, isLooping, playClipAtIndex]);

    const handleTimeUpdate = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.currentTime > 0) {
            setClipDurations(prev => {
                const curKnown = prev[currentClipIndex] || 0;
                if (video.currentTime > curKnown) {
                    const next = [...prev];
                    next[currentClipIndex] = video.currentTime;
                    return next;
                }
                return prev;
            });
        }

        const offset = getOffsetBefore(currentClipIndex);
        const globalT = offset + video.currentTime;
        setCurrentGlobalTime(globalT);
    }, [currentClipIndex, getOffsetBefore]);

    const handleMetadata = useCallback(() => {
        const video = videoRef.current;
        const realSec = video?.duration;
        if (typeof realSec === 'number' && isFinite(realSec) && realSec > 0) {
            setClipDurations(prev => {
                const next = [...prev];
                next[currentClipIndex] = realSec;
                return next;
            });
        }
    }, [currentClipIndex]);

    // Sync video src when activeClips load or change
    useEffect(() => {
        if (!showVideoPlayer || activeClips.length === 0) return;
        const currentClip = activeClips[currentClipIndex];
        const video = videoRef.current;
        if (video && currentClip) {
            if (video.src !== currentClip.clip_url) {
                video.src = currentClip.clip_url;
                if (isPlaying) {
                    video.play().catch(() => {});
                }
            } else if (isPlaying && video.paused) {
                video.play().catch(() => {});
            }
        }
    }, [currentClipIndex, activeClips, showVideoPlayer, isPlaying]);

    // ── Global Day Scrubber Seek ──
    const handleScrubSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const targetTrack = (e.currentTarget as HTMLElement) || scrubberRef.current;
        if (!targetTrack || totalDuration <= 0 || activeClips.length === 0) return;
        const rect = targetTrack.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clickRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const targetGlobalTime = clickRatio * totalDuration;

        // Find which clip index and offset within that clip
        let accumulated = 0;
        let targetIdx = 0;
        let targetOffset = 0;

        for (let i = 0; i < activeClips.length; i++) {
            const dur = clipDurations[i] || 0;
            if (targetGlobalTime <= accumulated + dur || i === activeClips.length - 1) {
                targetIdx = i;
                targetOffset = Math.max(0, targetGlobalTime - accumulated);
                break;
            }
            accumulated += dur;
        }

        setCurrentGlobalTime(targetGlobalTime);
        setShowVideoPlayer(true);

        const video = videoRef.current;

        if (targetIdx !== currentClipIndex) {
            setCurrentClipIndex(targetIdx);
            if (video && activeClips[targetIdx]) {
                video.src = activeClips[targetIdx].clip_url;
                video.currentTime = targetOffset;
                if (isPlaying) {
                    video.play().catch(() => {});
                }
            }
        } else {
            if (video) {
                video.currentTime = targetOffset;
                if (isPlaying) {
                    video.play().catch(() => {});
                }
            }
        }
    }, [totalDuration, activeClips, clipDurations, currentClipIndex, isPlaying]);

    // ── Inline Edit Handlers ──
    const handleStartEdit = (entry: JournalEntry) => {
        setEditingEntryId(entry.id);
        setEditText(entry.content || entry.transcription || '');
    };

    const handleSaveEdit = async (entryId: string) => {
        if (!editText.trim() || isSavingEdit) return;
        setIsSavingEdit(true);
        try {
            const success = await updateEntryContent(entryId, editText.trim());
            if (success) {
                setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, content: editText.trim(), transcription: editText.trim() } : e)));
                setEditingEntryId(null);
            }
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingEntryId(null);
        setEditText('');
    };

    const handleTouchStart = (entry: JournalEntry) => {
        longPressTimerRef.current = setTimeout(() => {
            handleStartEdit(entry);
        }, 500); // 500ms long press activates edit mode on mobile
    };

    const handleTouchEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handleBubbleClick = (entry: JournalEntry) => {
        // On desktop, click directly opens inline edit mode
        if (typeof window !== 'undefined' && window.innerWidth > 860) {
            handleStartEdit(entry);
        }
    };

    // Auto-scroll to top when entries change (if not viewing video player or search)
    useEffect(() => {
        if (feedRef.current && !searchActive && !showVideoPlayer) {
            feedRef.current.scrollTop = 0;
        }
    }, [entries, searchActive, showVideoPlayer]);

    // Auto-scroll active clip in timeline horizontally into view (never scroll window or page)
    useEffect(() => {
        if (timelineStripRef.current && activeClips.length > 0) {
            const strip = timelineStripRef.current;
            const activeThumb = strip.children[currentClipIndex] as HTMLElement;
            if (activeThumb) {
                const thumbLeft = activeThumb.offsetLeft;
                const thumbWidth = activeThumb.offsetWidth;
                const stripWidth = strip.clientWidth;
                const targetScrollLeft = thumbLeft - (stripWidth / 2) + (thumbWidth / 2);
                strip.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
            }
        }
    }, [currentClipIndex, activeClips]);

    // Reset scroll to top when opening video player
    useEffect(() => {
        if (showVideoPlayer) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            if (playerWrapperRef.current) {
                playerWrapperRef.current.scrollTop = 0;
            }
        }
    }, [showVideoPlayer]);



    // ── Search ──
    const handleSearch = async () => {
        if (!user?.id || !searchQuery.trim()) {
            setSearchActive(false);
            loadData();
            return;
        }
        setSearchActive(true);
        const results = await searchEntries(user.id, searchQuery.trim());
        setEntries(results);
    };

    // ── Send text ──
    const handleSendText = async () => {
        if (!user?.id || !textInput.trim()) return;
        const text = textInput.trim();
        setTextInput('');
        const entry = await saveTextEntry(user.id, projectId, text);
        if (entry) {
            setEntries(prev => [entry, ...prev]);
        }
    };

    // ── Send image ──
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id) return;
        const entry = await saveImageEntry(user.id, projectId, file);
        if (entry) {
            setEntries(prev => [entry, ...prev]);
        }
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    // ── Open and play a day's video sequence from chat card ──
    const handlePlayDaySequence = async (date: string) => {
        if (!user?.id) return;
        const [clips, published] = await Promise.all([
            fetchClipsByDate(user.id, date),
            checkIsDailyStoryPublished(user.id, date),
        ]);
        if (clips.length > 0) {
            setActiveTimelineDate(date);
            setActiveClips(clips);
            setIsPublished(published);
            setCurrentClipIndex(0);
            setCurrentGlobalTime(0);
            setIsPlaying(true);
            setShowVideoPlayer(true);
        }
    };

    // ── Navigate to another day (TikTok feed transitions) ──
    const navigateToDate = useCallback(async (targetDate: string, direction?: 'next' | 'prev') => {
        if (showShareModal || !user?.id || targetDate === activeTimelineDate || isSwitchingDateRef.current) return;
        isSwitchingDateRef.current = true;
        if (direction) setSlideDirection(direction);

        try {
            const [clips, published] = await Promise.all([
                fetchClipsByDate(user.id, targetDate),
                checkIsDailyStoryPublished(user.id, targetDate),
            ]);

            setActiveTimelineDate(targetDate);
            setActiveClips(clips);
            setIsPublished(published);
            setCurrentClipIndex(0);
            setCurrentGlobalTime(0);

            // Display clear date feedback in normal letters
            showToastMessage(formatDateLabel(targetDate));

            if (clips.length > 0) {
                setShowVideoPlayer(true);
                setIsPlaying(true);
                const video = videoRef.current;
                if (video) {
                    video.src = clips[0].clip_url;
                    video.currentTime = 0;
                    video.play().catch(() => {});
                }
            }
        } catch (err) {
            console.error('[JournalStory] navigateToDate error:', err);
        } finally {
            setTimeout(() => {
                setSlideDirection(null);
                isSwitchingDateRef.current = false;
            }, 360);
        }
    }, [showShareModal, user?.id, activeTimelineDate, showToastMessage]);

    // ── Chronological Index Resolution ──
    const getCurrentDateIndex = useCallback(() => {
        const idx = availableVideoDates.indexOf(activeTimelineDate);
        if (idx !== -1) return idx;
        for (let i = 0; i < availableVideoDates.length; i++) {
            if (availableVideoDates[i] > activeTimelineDate) {
                return Math.max(0, i - 1);
            }
        }
        return Math.max(0, availableVideoDates.length - 1);
    }, [availableVideoDates, activeTimelineDate]);

    // ── Scroll Down (Heading towards NEWEST videos / bottom of calendar / today) ──
    const handleScrollTowardsNewer = useCallback(() => {
        if (availableVideoDates.length <= 1) return;
        const currentIndex = getCurrentDateIndex();
        if (currentIndex < availableVideoDates.length - 1) {
            navigateToDate(availableVideoDates[currentIndex + 1], 'next');
        } else {
            showToastMessage('You are viewing the newest journal story');
        }
    }, [availableVideoDates, getCurrentDateIndex, navigateToDate, showToastMessage]);

    // ── Scroll Up (Heading towards OLDER movies / top of calendar) ──
    const handleScrollTowardsOlder = useCallback(() => {
        if (availableVideoDates.length <= 1) return;
        const currentIndex = getCurrentDateIndex();
        if (currentIndex > 0) {
            navigateToDate(availableVideoDates[currentIndex - 1], 'prev');
        } else {
            showToastMessage('You are viewing the oldest journal story');
        }
    }, [availableVideoDates, getCurrentDateIndex, navigateToDate, showToastMessage]);

    const handlePlayerWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
        if (showShareModal) return;
        if (availableVideoDates.length <= 1) return;

        const now = Date.now();
        if (now - lastWheelTimeRef.current < 320) return;
        if (Math.abs(e.deltaY) < 10) return;

        lastWheelTimeRef.current = now;
        if (e.deltaY > 0) {
            // Scroll down: Head towards newest videos (like today's videos at bottom of calendar)
            handleScrollTowardsNewer();
        } else if (e.deltaY < 0) {
            // Scroll up: Head towards older movies (at top of calendar)
            handleScrollTowardsOlder();
        }
    }, [showShareModal, availableVideoDates.length, handleScrollTowardsNewer, handleScrollTowardsOlder]);

    // Native non-passive wheel listener for smooth TikTok vertical feed scrolling
    useEffect(() => {
        if (!showVideoPlayer) return;

        const handleNativeWheel = (e: WheelEvent) => {
            if (showShareModal) return;
            const wrapper = playerWrapperRef.current;
            if (!wrapper) return;
            if (wrapper.contains(e.target as Node)) {
                e.preventDefault();
                handlePlayerWheel(e);
            }
        };

        window.addEventListener('wheel', handleNativeWheel, { passive: false });
        return () => {
            window.removeEventListener('wheel', handleNativeWheel);
        };
    }, [showVideoPlayer, showShareModal, handlePlayerWheel]);

    // Keyboard navigation (ArrowDown: newer, ArrowUp: older, ArrowLeft/Right: takes, Space: Play/Pause)
    useEffect(() => {
        if (!showVideoPlayer || showShareModal) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (showShareModal) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                handleScrollTowardsNewer();
            } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                handleScrollTowardsOlder();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleNextClip();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrevClip();
            } else if (e.key === ' ' || e.key === 'k') {
                e.preventDefault();
                setIsPlaying(prev => {
                    const next = !prev;
                    const video = videoRef.current;
                    if (video) {
                        if (next) video.play().catch(() => {});
                        else video.pause();
                    }
                    return next;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [showVideoPlayer, showShareModal, handleScrollTowardsNewer, handleScrollTowardsOlder, handleNextClip, handlePrevClip]);

    const handlePlayerTouchStart = (e: React.TouchEvent) => {
        if (showShareModal) return;
        touchStartYRef.current = e.touches[0].clientY;
    };

    const handlePlayerTouchEnd = (e: React.TouchEvent) => {
        if (showShareModal) return;
        if (touchStartYRef.current === null) return;
        const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
        touchStartYRef.current = null;
        if (Math.abs(deltaY) < 35) return;

        const now = Date.now();
        if (now - lastWheelTimeRef.current < 320) return;
        lastWheelTimeRef.current = now;

        if (deltaY < 0) {
            // Swipe up: Head towards newest videos
            handleScrollTowardsNewer();
        } else {
            // Swipe down: Head towards older movies
            handleScrollTowardsOlder();
        }
    };

    // ── Open Journal Share Modal (Reorder, Preview & Multi-channel Share) ──
    const [lockedShareDate, setLockedShareDate] = useState<string | null>(null);

    const handleOpenShareModal = () => {
        if (activeClips.length === 0) {
            showToastMessage('No video clips to share today');
            return;
        }
        setLockedShareDate(activeTimelineDate);
        setShowVideoPlayer(true);
        setShowShareModal(true);
    };
    const handleTogglePublishDailyStory = handleOpenShareModal;

    // ── Delete a clip from the sequence ──
    const handleDeleteClip = async (e: React.MouseEvent, clipId: string) => {
        e.stopPropagation();
        if (!user?.id) return;
        const confirmed = window.confirm('Delete this video clip from the sequence?');
        if (!confirmed) return;

        await deleteClip(clipId);
        await syncDailyVideoEntry(user.id, projectId, activeTimelineDate);

        // Refresh clips for this day
        const updatedClips = await fetchClipsByDate(user.id, activeTimelineDate);
        setActiveClips(updatedClips);

        if (updatedClips.length === 0) {
            setShowVideoPlayer(false);
            setIsPlaying(false);
        } else if (currentClipIndex >= updatedClips.length) {
            setCurrentClipIndex(updatedClips.length - 1);
        }

        // Refresh entries feed
        const entryData = await fetchEntriesPaginated(user.id, 0, 200);
        setEntries(entryData);
    };

    // ── Playback Controls ──
    const handlePlay = useCallback(() => {
        if (activeClips.length === 0) return;
        setIsPlaying(true);
        setShowVideoPlayer(true);
        const video = videoRef.current;
        if (video) {
            const currentClip = activeClips[currentClipIndex];
            if (currentClip && video.src !== currentClip.clip_url) {
                video.src = currentClip.clip_url;
            }
            video.play().catch(() => {});
        }
    }, [activeClips, currentClipIndex]);

    const handlePause = useCallback(() => {
        setIsPlaying(false);
        if (videoRef.current) {
            videoRef.current.pause();
        }
    }, []);

    const handleClosePlayer = useCallback(() => {
        setIsPlaying(false);
        setShowVideoPlayer(false);
        setShowShareModal(false);
        setLockedShareDate(null);
        if (videoRef.current) {
            videoRef.current.pause();
        }
    }, []);

    // Smart close click: if in fullscreen, simply exits fullscreen and continues playback on-page
    const handleClosePlayerClick = useCallback(() => {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement || isFullscreen) {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            }
            setIsFullscreen(false);
            return;
        }
        handleClosePlayer();
    }, [isFullscreen, handleClosePlayer]);

    const handleToggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    const handleToggleFullscreen = useCallback(() => {
        if (!playerContainerRef.current) return;
        const isCurrentlyFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || isFullscreen);
        if (!isCurrentlyFs) {
            if (playerContainerRef.current.requestFullscreen) {
                playerContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
                    setIsFullscreen(true);
                });
            } else if ((playerContainerRef.current as any).webkitRequestFullscreen) {
                (playerContainerRef.current as any).webkitRequestFullscreen();
                setIsFullscreen(true);
            } else {
                setIsFullscreen(true);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {
                    setIsFullscreen(false);
                });
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
                setIsFullscreen(false);
            } else {
                setIsFullscreen(false);
            }
        }
    }, [isFullscreen]);

    // Sync fullscreen state with browser events (e.g. Esc key or system exit)
    useEffect(() => {
        const handleFsChange = () => {
            const isCurrentlyFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
            setIsFullscreen(isCurrentlyFs);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
        };
    }, []);

    // Sync muted state directly to video element DOM property
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    // Handle playback control actions dispatched from TopBarVizja or external triggers
    useEffect(() => {
        const handlePlayerAction = (e: any) => {
            const action = e.detail?.action;
            if (action === 'toggle_play') {
                if (isPlaying) {
                    handlePause();
                } else {
                    handlePlay();
                }
            } else if (action === 'toggle_loop') {
                setIsLooping(prev => !prev);
            } else if (action === 'toggle_mute') {
                handleToggleMute();
            } else if (action === 'toggle_fullscreen') {
                handleToggleFullscreen();
            } else if (action === 'exit_fullscreen') {
                if (isFullscreen) {
                    handleToggleFullscreen();
                } else {
                    handleClosePlayer();
                }
            } else if (action === 'close_share_modal') {
                setShowShareModal(false);
            } else if (action === 'close') {
                handleClosePlayer();
            }
        };
        window.addEventListener('journal_player_action', handlePlayerAction);
        return () => window.removeEventListener('journal_player_action', handlePlayerAction);
    }, [isPlaying, isFullscreen, handlePlay, handlePause, handleClosePlayer, handleToggleMute, handleToggleFullscreen, setShowShareModal]);

    const handlePlayerMouseMove = () => {
        setShowControls(true);
        if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false);
            }
        }, 2500);
    };

    // ── Date filter ──
    const handleDateSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSelectedDate(val || null);
        setShowDatePicker(false);
        if (val && user?.id) {
            setActiveTimelineDate(val);
            const [data, clips] = await Promise.all([
                fetchEntriesPaginated(user.id, 0, 200),
                fetchClipsByDate(user.id, val),
            ]);
            setEntries(data.filter(ent => ent.entry_date === val));
            setActiveClips(clips);
            setSearchActive(true);
        } else {
            setSearchActive(false);
            setActiveTimelineDate(getLocalDateISO());
            loadData();
        }
    };

    const handleSearchText = async (text: string) => {
        setSearchQuery(text);
        if (!user?.id) return;
        if (text.trim().length >= 2) {
            setSearchActive(true);
            const results = await searchEntries(user.id, text.trim());
            setEntries(results);
        } else if (text.trim().length === 0) {
            setSearchActive(false);
            loadData();
        }
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setSelectedDate(null);
        setSearchActive(false);
        setActiveTimelineDate(getLocalDateISO());
        loadData();
    };

    // Grouped entries for rendering (newest first)
    const sortedEntries = useMemo(() => {
        return [...entries].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }, [entries]);
    const groupedEntries = useMemo(() => groupEntriesByDate(sortedEntries), [sortedEntries]);

    // ── Render ──
    return (
        <div className={`journal-story-container ${showVideoPlayer ? 'player-active' : ''}`} style={{ position: 'relative' }}>
            <div className="journal-story-body">
                {/* Seamless Video Player (Replaces Chat Window during playback) */}
                {showVideoPlayer && activeClips.length > 0 ? (
                    <div className="journal-seamless-player-wrapper" ref={playerWrapperRef} onWheel={handlePlayerWheel}>
                        {/* Top Header Controls / Share Command Center */}
                        {showShareModal ? (
                            <JournalShareCommandCenter
                                date={lockedShareDate || activeTimelineDate}
                                clips={activeClips}
                                projectId={projectId}
                                userId={user?.id || ''}
                                username={user?.user_metadata?.username || (typeof user?.email === 'string' ? user.email.split('@')[0] : 'user')}
                                onClose={() => {
                                    setShowShareModal(false);
                                    setLockedShareDate(null);
                                }}
                                onPublishedStatusChanged={(pub) => setIsPublished(pub)}
                            />
                        ) : (
                            <div className="journal-player-top-header">
                                <div className="journal-timeline-sort-actions">
                                    <button 
                                        className="journal-story-date-btn" 
                                        onClick={handleSortNewestToOldest}
                                        title="Reverse chronological order (newest first)"
                                    >
                                        <ArrowDownUp size={12} />
                                        <span>Newest First</span>
                                    </button>
                                    <button 
                                        className="journal-story-date-btn" 
                                        onClick={handleSortRandom}
                                        title="Shuffle takes"
                                    >
                                        <Shuffle size={12} />
                                        <span>Random</span>
                                    </button>
                                </div>
                                <div className="journal-player-top-right">
                                    <button
                                        className="journal-story-date-btn" 
                                        onClick={handleOpenShareModal}
                                        title="Share daily story"
                                    >
                                        <Share2 size={12} />
                                        <span>Share Story</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Center: Maximized 1:1 Video Stage */}
                        <div className="journal-player-stage-wrapper">
                            <div
                                className={`journal-video-player-container ${isFullscreen ? 'is-fullscreen' : ''}`}
                                ref={playerContainerRef}
                                onMouseMove={handlePlayerMouseMove}
                                onWheel={handlePlayerWheel}
                                onTouchStart={(e) => {
                                    handlePlayerMouseMove();
                                    handlePlayerTouchStart(e);
                                }}
                                onTouchEnd={handlePlayerTouchEnd}
                            >
                                {/* 1:1 Square Stage Container */}
                                <div className="journal-player-square-stage">
                                    <video
                                        ref={videoRef}
                                        playsInline
                                        muted={isMuted}
                                        className={`journal-seamless-video-element visible ${slideDirection === 'next' ? 'journal-slide-from-bottom' : (slideDirection === 'prev' ? 'journal-slide-from-top' : '')}`}
                                        onTimeUpdate={handleTimeUpdate}
                                        onEnded={handleClipEnded}
                                        onLoadedMetadata={handleMetadata}
                                        onClick={() => (isPlaying ? handlePause() : handlePlay())}
                                    />
                                </div>

                                {/* Fullscreen Scrubber Bar (Pinned to fixed bottom in fullscreen) */}
                                {isFullscreen && (
                                    <div className="journal-fullscreen-scrubber-container">
                                        <div
                                            className="journal-global-scrubber-track"
                                            onClick={handleScrubSeek}
                                            onTouchStart={handleScrubSeek}
                                            title="Seek across the entire daily story"
                                        >
                                            <div
                                                className="journal-global-scrubber-fill"
                                                style={{ width: `${Math.min(100, Math.max(0, (currentGlobalTime / (totalDuration || 1)) * 100))}%` }}
                                            />
                                            {totalDuration > 0 && activeClips.map((_, idx) => {
                                                if (idx === 0) return null;
                                                const leftPct = (getOffsetBefore(idx) / totalDuration) * 100;
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="journal-scrubber-notch"
                                                        style={{ left: `${leftPct}%` }}
                                                        title={`Take ${idx + 1} start`}
                                                    />
                                                );
                                            })}
                                            <div
                                                className="journal-global-scrubber-thumb"
                                                style={{ left: `${Math.min(100, Math.max(0, (currentGlobalTime / (totalDuration || 1)) * 100))}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Fullscreen Control Bar (Pinned to fixed bottom in fullscreen) */}
                                {isFullscreen && (
                                    <div className="journal-story-control-bar fullscreen-bar">
                                        {/* 1. Mute */}
                                        <button
                                            type="button"
                                            className="journal-story-ctrl-slot"
                                            onClick={handleToggleMute}
                                            title={isMuted ? 'Unmute' : 'Mute'}
                                        >
                                            {isMuted ? <VolumeX size={26} strokeWidth={1.5} color="#ef4444" /> : <Volume2 size={26} strokeWidth={1.5} color="#E1DED2" />}
                                            <span className="journal-story-ctrl-label" style={{ color: isMuted ? '#ef4444' : '#E1DED2' }}>
                                                {isMuted ? 'Muted' : 'Mute'}
                                            </span>
                                        </button>

                                        {/* 2. Repeat */}
                                        <button
                                            type="button"
                                            className="journal-story-ctrl-slot"
                                            onClick={() => setIsLooping(prev => !prev)}
                                            title={isLooping ? 'Repeat Story: On' : 'Repeat Story: Off'}
                                        >
                                            <Repeat size={26} strokeWidth={1.5} color={isLooping ? '#10b981' : '#E1DED2'} />
                                            <span className="journal-story-ctrl-label" style={{ color: isLooping ? '#10b981' : '#E1DED2', fontWeight: isLooping ? 700 : 500 }}>
                                                Repeat
                                            </span>
                                        </button>

                                        {/* 3. Play / Pause */}
                                        <div className="journal-story-ctrl-slot center-slot">
                                            <div className="mobile-fab-container">
                                                <div className="fab-capsule-backdrop" />
                                                <div className="fab-capsule">
                                                    <button
                                                        type="button"
                                                        className="fab-capsule-icon fab-capsule-main"
                                                        onClick={isPlaying ? handlePause : handlePlay}
                                                        style={{ color: '#ffffff' }}
                                                        title={isPlaying ? 'Pause' : 'Play'}
                                                    >
                                                        {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '3px' }} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 4. Full Screen */}
                                        <button
                                            type="button"
                                            className="journal-story-ctrl-slot"
                                            onClick={handleToggleFullscreen}
                                            title="Exit Fullscreen"
                                        >
                                            <Minimize2 size={26} strokeWidth={1.5} color="#10b981" />
                                            <span className="journal-story-ctrl-label" style={{ color: '#10b981' }}>
                                                Full Screen
                                            </span>
                                        </button>

                                        {/* 5. Back Button */}
                                        <button
                                            type="button"
                                            className="journal-story-ctrl-slot"
                                            onClick={handleToggleFullscreen}
                                            title="Back"
                                        >
                                            <ArrowLeft size={26} strokeWidth={1.5} color="#E1DED2" />
                                            <span className="journal-story-ctrl-label" style={{ color: '#E1DED2' }}>
                                                Back
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Non-Fullscreen Bottom Dock for Player */}
                        {!isFullscreen && (
                            <div className="journal-player-bottom-dock">
                                {/* Inscriptions: Take X of Y, Date, Time */}
                                <div className="journal-global-scrubber-info">
                                    <span className="journal-scrubber-take-badge">
                                        Take {currentClipIndex + 1} of {activeClips.length}
                                    </span>
                                    <span className="journal-scrubber-date-center">
                                        {formatStoryCenterDate(activeTimelineDate)}
                                    </span>
                                    <span className="journal-scrubber-time-badge">
                                        {formatDurationSec(currentGlobalTime)} / {formatDurationSec(totalDuration)}
                                    </span>
                                </div>

                                {/* Takes thumbnails strip */}
                                <div className="journal-day-timeline-strip" ref={timelineStripRef}>
                                    {activeClips.map((clip, idx) => (
                                        <div
                                            key={clip.id}
                                            draggable
                                            onDragStart={(e) => handleTimelineDragStart(e, idx)}
                                            onDragEnd={handleTimelineDragEnd}
                                            onDragOver={(e) => handleTimelineDragOver(e, idx)}
                                            onDrop={(e) => handleTimelineDrop(e, idx)}
                                            className={`journal-clip-thumb ${currentClipIndex === idx ? 'active' : ''} ${dragOverTimelineIdx === idx ? 'drag-over' : ''}`}
                                            onClick={() => playClipAtIndex(idx)}
                                            title={`Play Take (Original #${originalTakeMap.get(clip.id) || (idx + 1)}) • Drag to reorder`}
                                        >
                                            <video src={clip.clip_url} muted preload="metadata" />
                                            <div className="journal-clip-thumb-overlay">
                                                <Play size={16} color="#fff" />
                                            </div>
                                            <span className="journal-clip-order">
                                                {originalTakeMap.get(clip.id) || (idx + 1)}
                                            </span>
                                            <button
                                                className="journal-clip-delete-btn"
                                                onClick={(e) => handleDeleteClip(e, clip.id)}
                                                title="Delete take from sequence"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Scrubber Progress Bar */}
                                <div className="journal-non-fullscreen-scrubber-container">
                                    <div
                                        className="journal-global-scrubber-track"
                                        onClick={handleScrubSeek}
                                        onTouchStart={handleScrubSeek}
                                        title="Seek across the entire daily story"
                                    >
                                        <div
                                            className="journal-global-scrubber-fill"
                                            style={{ width: `${Math.min(100, Math.max(0, (currentGlobalTime / (totalDuration || 1)) * 100))}%` }}
                                        />
                                        {totalDuration > 0 && activeClips.map((_, idx) => {
                                            if (idx === 0) return null;
                                            const leftPct = (getOffsetBefore(idx) / totalDuration) * 100;
                                            return (
                                                <div
                                                    key={idx}
                                                    className="journal-scrubber-notch"
                                                    style={{ left: `${leftPct}%` }}
                                                    title={`Take ${idx + 1} start`}
                                                />
                                            );
                                        })}
                                        <div
                                            className="journal-global-scrubber-thumb"
                                            style={{ left: `${Math.min(100, Math.max(0, (currentGlobalTime / (totalDuration || 1)) * 100))}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Control Bar (Desktop only: hidden on mobile <= 860px where TopBarVizja renders player controls in the fixed bottom tab bar) */}
                                <div className="journal-story-control-bar desktop-bar">
                                    {/* 1. Mute */}
                                    <button
                                        type="button"
                                        className="journal-story-ctrl-slot"
                                        onClick={handleToggleMute}
                                        title={isMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {isMuted ? <VolumeX size={26} strokeWidth={1.5} color="#ef4444" /> : <Volume2 size={26} strokeWidth={1.5} color="#E1DED2" />}
                                        <span className="journal-story-ctrl-label" style={{ color: isMuted ? '#ef4444' : '#E1DED2' }}>
                                            {isMuted ? 'Muted' : 'Mute'}
                                        </span>
                                    </button>

                                    {/* 2. Repeat */}
                                    <button
                                        type="button"
                                        className="journal-story-ctrl-slot"
                                        onClick={() => setIsLooping(prev => !prev)}
                                        title={isLooping ? 'Repeat Story: On' : 'Repeat Story: Off'}
                                    >
                                        <Repeat size={26} strokeWidth={1.5} color={isLooping ? '#10b981' : '#E1DED2'} />
                                        <span className="journal-story-ctrl-label" style={{ color: isLooping ? '#10b981' : '#E1DED2', fontWeight: isLooping ? 700 : 500 }}>
                                            Repeat
                                        </span>
                                    </button>

                                    {/* 3. Play / Pause */}
                                    <div className="journal-story-ctrl-slot center-slot">
                                        <div className="mobile-fab-container">
                                            <div className="fab-capsule-backdrop" />
                                            <div className="fab-capsule">
                                                <button
                                                    type="button"
                                                    className="fab-capsule-icon fab-capsule-main"
                                                    onClick={isPlaying ? handlePause : handlePlay}
                                                    style={{ color: '#ffffff' }}
                                                    title={isPlaying ? 'Pause' : 'Play'}
                                                >
                                                    {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '3px' }} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 4. Full Screen */}
                                    <button
                                        type="button"
                                        className="journal-story-ctrl-slot"
                                        onClick={handleToggleFullscreen}
                                        title="Full Screen"
                                    >
                                        <Maximize2 size={26} strokeWidth={1.5} color="#E1DED2" />
                                        <span className="journal-story-ctrl-label" style={{ color: '#E1DED2' }}>
                                            Full Screen
                                        </span>
                                    </button>

                                    {/* 5. Exit or Back Button */}
                                    <button
                                        type="button"
                                        className="journal-story-ctrl-slot"
                                        onClick={showShareModal ? () => { setShowShareModal(false); setLockedShareDate(null); } : handleClosePlayer}
                                        title={showShareModal ? "Back" : "Exit"}
                                    >
                                        {showShareModal ? (
                                            <ArrowLeft size={26} strokeWidth={1.5} color="#E1DED2" />
                                        ) : (
                                            <X size={26} strokeWidth={1.5} color="#E1DED2" />
                                        )}
                                        <span className="journal-story-ctrl-label" style={{ color: '#E1DED2' }}>
                                            {showShareModal ? 'Back' : 'Exit'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Feed View:
                       1. Top Input Bar (Above history)
                       2. Middle Feed (History with newest entries at top)
                       3. Bottom Feed Dock: Search row + Inscriptions + Takes strip + Today's Scrubber
                    */
                    <div className="journal-feed-layout-wrapper">
                        {/* Top Input Bar */}
                        <div className="journal-chat-input-bar top-input">
                            <button
                                className="journal-chat-img-btn"
                                title="Add image"
                                onClick={() => imageInputRef.current?.click()}
                            >
                                <ImageIcon size={18} />
                            </button>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleImageSelect}
                            />
                            <input
                                className="journal-chat-input"
                                type="text"
                                placeholder="Write in your journal..."
                                value={textInput}
                                onChange={e => setTextInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendText()}
                            />
                            <button
                                className="journal-chat-send-btn"
                                onClick={handleSendText}
                                disabled={!textInput.trim()}
                                title="Send"
                            >
                                <ArrowUp size={18} />
                            </button>
                        </div>

                        {/* Middle: Chat Feed */}
                        <div className="journal-chat-feed" ref={feedRef}>
                            {loading && (
                                <div className="journal-story-empty">
                                    <div style={{ color: '#efede3' }}>Loading...</div>
                                </div>
                            )}

                            {!loading && entries.length === 0 && (
                                <div className="journal-story-empty">
                                    <BookOpen size={48} className="journal-story-empty-icon" />
                                    <h3>Your Story begins here</h3>
                                    <p>Record video clips, write thoughts, or add photos. Your journal entries will appear here grouped by day.</p>
                                </div>
                            )}

                            {!loading && Array.from(groupedEntries.entries()).map(([date, dayEntries]) => (
                                <React.Fragment key={date}>
                                    {/* Day separator */}
                                    <div className="journal-day-separator">
                                        <div className="journal-day-separator-line" />
                                        <span className="journal-day-separator-label">{formatDateLabel(date)}</span>
                                        <div className="journal-day-separator-line" />
                                    </div>

                                    {/* Entries for this day */}
                                    {dayEntries.map(entry => (
                                        <div key={entry.id} className="journal-message left">
                                            {entry.entry_type === 'text' && (
                                                <>
                                                    {editingEntryId === entry.id ? (
                                                        <div className="journal-inline-edit-box">
                                                            <textarea
                                                                className="journal-inline-edit-textarea"
                                                                value={editText}
                                                                onChange={e => setEditText(e.target.value)}
                                                                autoFocus
                                                                rows={2}
                                                            />
                                                            <div className="journal-inline-edit-actions">
                                                                <button
                                                                    className="journal-inline-btn save"
                                                                    onClick={() => handleSaveEdit(entry.id)}
                                                                    disabled={isSavingEdit || !editText.trim()}
                                                                    title="Save changes"
                                                                >
                                                                    <Check size={14} />
                                                                    <span>Save</span>
                                                                </button>
                                                                <button
                                                                    className="journal-inline-btn cancel"
                                                                    onClick={handleCancelEdit}
                                                                    title="Cancel"
                                                                >
                                                                    <X size={14} />
                                                                    <span>Cancel</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            className="journal-message-bubble editable"
                                                            onClick={() => handleBubbleClick(entry)}
                                                            onTouchStart={() => handleTouchStart(entry)}
                                                            onTouchEnd={handleTouchEnd}
                                                            onTouchCancel={handleTouchEnd}
                                                            title="Click on desktop or hold on mobile to edit"
                                                        >
                                                            {entry.content}
                                                        </div>
                                                    )}
                                                    <span className="journal-message-time">{formatTime(entry.created_at)}</span>
                                                </>
                                            )}

                                            {entry.entry_type === 'image' && (
                                                <div className="journal-image-message">
                                                    <img src={entry.content || ''} alt="Journal" loading="lazy" />
                                                    <span className="journal-message-time">{formatTime(entry.created_at)}</span>
                                                </div>
                                            )}

                                            {entry.entry_type === 'video' && (
                                                <div className="journal-video-message">
                                                    <div
                                                        className="journal-video-thumb-wrap"
                                                        onClick={() => handlePlayDaySequence(entry.entry_date)}
                                                        title="Click to play daily video sequence"
                                                    >
                                                        {(() => {
                                                            try {
                                                                const urls = JSON.parse(entry.video_url || '[]');
                                                                if (urls.length > 0) {
                                                                    return <video src={urls[0]} muted preload="metadata" />;
                                                                }
                                                            } catch {}
                                                            return null;
                                                        })()}
                                                        <div className="journal-video-play-overlay">
                                                            <div className="journal-video-play-icon">
                                                                <Play size={22} style={{ marginLeft: '2px' }} />
                                                            </div>
                                                        </div>
                                                        <div className="journal-video-badge">
                                                            Daily Story
                                                        </div>
                                                    </div>
                                                    {entry.transcription && (
                                                        editingEntryId === entry.id ? (
                                                            <div className="journal-inline-edit-box">
                                                                <textarea
                                                                    className="journal-inline-edit-textarea"
                                                                    value={editText}
                                                                    onChange={e => setEditText(e.target.value)}
                                                                    autoFocus
                                                                    rows={2}
                                                                />
                                                                <div className="journal-inline-edit-actions">
                                                                    <button
                                                                        className="journal-inline-btn save"
                                                                        onClick={() => handleSaveEdit(entry.id)}
                                                                        disabled={isSavingEdit || !editText.trim()}
                                                                        title="Save changes"
                                                                    >
                                                                        <Check size={14} />
                                                                        <span>Save</span>
                                                                    </button>
                                                                    <button
                                                                        className="journal-inline-btn cancel"
                                                                        onClick={handleCancelEdit}
                                                                        title="Cancel"
                                                                    >
                                                                        <X size={14} />
                                                                        <span>Cancel</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                className="journal-message-bubble editable"
                                                                style={{ marginTop: '6px', fontSize: '12px', opacity: 0.85 }}
                                                                onClick={() => handleBubbleClick(entry)}
                                                                onTouchStart={() => handleTouchStart(entry)}
                                                                onTouchEnd={handleTouchEnd}
                                                                onTouchCancel={handleTouchEnd}
                                                                title="Click on desktop or hold on mobile to edit"
                                                            >
                                                                {entry.transcription}
                                                            </div>
                                                        )
                                                    )}
                                                    <span className="journal-message-time">{formatTime(entry.created_at)}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Bottom Feed Dock */}
                        <div className="journal-feed-bottom-dock">
                            {/* Search Row with Upward Date Picker */}
                            <div className="journal-feed-search-row">
                                <div className="journal-search-pill-container">
                                    <Search size={15} className="journal-search-icon" />
                                    <input
                                        type="text"
                                        className="journal-search-input"
                                        placeholder="Search journal entries..."
                                        value={searchQuery}
                                        onChange={(e) => handleSearchText(e.target.value)}
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            className="journal-search-clear-btn"
                                            onClick={handleClearSearch}
                                            title="Clear search"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>

                                <div className="journal-search-date-picker-wrap">
                                    <button
                                        type="button"
                                        className={`journal-story-date-btn ${selectedDate ? 'active' : ''}`}
                                        onClick={() => setShowDatePicker(prev => !prev)}
                                        title="Filter by date"
                                    >
                                        <Calendar size={13} />
                                        <span>{selectedDate ? selectedDate : 'Date'}</span>
                                    </button>
                                    {showDatePicker && (
                                        <div className="journal-upward-date-popover">
                                            <input
                                                type="date"
                                                className="journal-date-input-picker"
                                                value={selectedDate || ''}
                                                onChange={handleDateSelect}
                                                autoFocus
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* When takes exist today: Inscriptions, Takes Strip, Today's Progress Bar */}
                            {activeClips.length > 0 && (
                                <>
                                    {/* Inscriptions: Take X of Y, Date, Time */}
                                    <div className="journal-global-scrubber-info">
                                        <span className="journal-scrubber-take-badge">
                                            Take {currentClipIndex + 1} of {activeClips.length}
                                        </span>
                                        <span className="journal-scrubber-date-center">
                                            {formatStoryCenterDate(activeTimelineDate)}
                                        </span>
                                        <span className="journal-scrubber-time-badge">
                                            {formatDurationSec(currentGlobalTime)} / {formatDurationSec(totalDuration)}
                                        </span>
                                    </div>

                                    {/* Takes thumbnails strip */}
                                    <div className="journal-day-timeline-strip" ref={timelineStripRef}>
                                        {activeClips.map((clip, idx) => (
                                            <div
                                                key={clip.id}
                                                draggable
                                                onDragStart={(e) => handleTimelineDragStart(e, idx)}
                                                onDragEnd={handleTimelineDragEnd}
                                                onDragOver={(e) => handleTimelineDragOver(e, idx)}
                                                onDrop={(e) => handleTimelineDrop(e, idx)}
                                                className={`journal-clip-thumb ${currentClipIndex === idx ? 'active' : ''} ${dragOverTimelineIdx === idx ? 'drag-over' : ''}`}
                                                onClick={() => {
                                                    setShowVideoPlayer(true);
                                                    playClipAtIndex(idx);
                                                }}
                                                title={`Play Take (Original #${originalTakeMap.get(clip.id) || (idx + 1)}) • Drag to reorder`}
                                            >
                                                <video src={clip.clip_url} muted preload="metadata" />
                                                <div className="journal-clip-thumb-overlay">
                                                    <Play size={16} color="#fff" />
                                                </div>
                                                <span className="journal-clip-order">
                                                    {originalTakeMap.get(clip.id) || (idx + 1)}
                                                </span>
                                                <button
                                                    className="journal-clip-delete-btn"
                                                    onClick={(e) => handleDeleteClip(e, clip.id)}
                                                    title="Delete take from sequence"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Today's progress bar (directly above bottom tab bar) */}
                                    <div className="journal-feed-today-scrubber">
                                        <div
                                            className="journal-global-scrubber-track"
                                            onClick={(e) => {
                                                setShowVideoPlayer(true);
                                                handleScrubSeek(e);
                                            }}
                                            onTouchStart={(e) => {
                                                setShowVideoPlayer(true);
                                                handleScrubSeek(e);
                                            }}
                                            title="Today's progress • Click to open Daily Story"
                                        >
                                            <div
                                                className="journal-global-scrubber-fill"
                                                style={{ width: `${Math.min(100, Math.max(0, (currentGlobalTime / (totalDuration || 1)) * 100))}%` }}
                                            />
                                            {totalDuration > 0 && activeClips.map((_, idx) => {
                                                if (idx === 0) return null;
                                                const leftPct = (getOffsetBefore(idx) / totalDuration) * 100;
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="journal-scrubber-notch"
                                                        style={{ left: `${leftPct}%` }}
                                                        title={`Take ${idx + 1} start`}
                                                    />
                                                );
                                            })}
                                            <div
                                                className="journal-global-scrubber-thumb"
                                                style={{ left: `${Math.min(100, Math.max(0, (currentGlobalTime / (totalDuration || 1)) * 100))}%` }}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


export default JournalStoryView;

