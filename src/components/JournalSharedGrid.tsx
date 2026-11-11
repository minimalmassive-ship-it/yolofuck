import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Settings, Trash2, Copy, Check, Video,
    Share2, Loader2, ExternalLink, Play, RotateCw 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
    fetchUserSharedDailyStories, deleteDailyStoryShare, 
    refreshDailyStorySlug, hydrateStoryProvenance 
} from '../lib/journalStoryService';
import { SharedStoryPlayerModal } from './SharedStoryPlayerModal';
import './JournalSharedGrid.css';

interface JournalSharedGridProps {
    projectId?: string | null;
}

export const JournalSharedGrid: React.FC<JournalSharedGridProps> = () => {
    const { user } = useAuth();
    const [stories, setStories] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [openMenuStoryId, setOpenMenuStoryId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [copiedStoryId, setCopiedStoryId] = useState<string | null>(null);
    const [previewPlayerStory, setPreviewPlayerStory] = useState<any | null>(null);
    const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

    // Progressive 2-stage swipe reveal gesture state per shared story
    const [storyPullDistances, setStoryPullDistances] = useState<{ [storyId: string]: number }>({});
    const [storyDrawerStages, setStoryDrawerStages] = useState<{ [storyId: string]: number }>({});
    const storyTouchStartRef = useRef<{ 
        id: string; 
        startX: number; 
        startY: number; 
        scrollLeftStart: number;
        initialStage: number;
        isTracking: boolean;
    } | null>(null);

    // Desktop mouse drag-to-scroll on horizontal strip
    const stripMouseDragRef = useRef<{ id: string; startX: number; scrollLeftStart: number; isDragging: boolean } | null>(null);

    const toastTimerRef = useRef<any>(null);

    const showToast = (msg: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToastMessage(msg);
        toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
    };

    const loadStories = useCallback(async () => {
        if (!user?.id) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const data = await fetchUserSharedDailyStories(user.id);
            const list = Array.isArray(data) ? data.map(hydrateStoryProvenance) : [];
            // Strictly sort with newest shared sequence at the very top (index 0)
            list.sort((a: any, b: any) => {
                const dateA = (a.provenance_log as any)?.date || (a.created_at ? a.created_at.split('T')[0] : '');
                const dateB = (b.provenance_log as any)?.date || (b.created_at ? b.created_at.split('T')[0] : '');
                if (dateA && dateB && dateA !== dateB) {
                    return dateB.localeCompare(dateA);
                }
                const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
                const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
                return timeB - timeA;
            });
            setStories(list);
        } catch (err) {
            console.error('[JournalSharedGrid] loadStories error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        loadStories();

        const handleSharedUpdated = () => {
            loadStories();
        };

        window.addEventListener('journal_shared_updated', handleSharedUpdated);
        return () => window.removeEventListener('journal_shared_updated', handleSharedUpdated);
    }, [loadStories]);

    // Close gear dropdown menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.shared-drawer-menu-container')) {
                setOpenMenuStoryId(null);
            }
        };

        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getStoryDate = (story: any): string => {
        return (story.provenance_log as any)?.date || (story.created_at ? story.created_at.split('T')[0] : '');
    };

    // Format date vertically to DD-MM-YYYY (e.g. 11-11-2026) matching Journal page
    const formatDateVertical = (dateStr: string): string => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    };

    const getShareUrl = (story: any): string => {
        const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
        const slug = story.slug || story.id;
        return origin ? `${origin}/story/${slug}` : `/story/${slug}`;
    };

    const handleCopyLink = async (story: any, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        try {
            const url = getShareUrl(story);
            await navigator.clipboard.writeText(url);
            setCopiedStoryId(story.id);
            showToast('Link copied to clipboard!');
            setTimeout(() => setCopiedStoryId(null), 2000);
        } catch {
            showToast('Failed to copy link');
        }
    };

    const handleNativeShare = async (story: any, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const url = getShareUrl(story);
        const storyDate = getStoryDate(story);
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: `Yolofuck Daily Story • ${storyDate}`,
                    url
                });
                return;
            } catch (err: any) {
                if (err.name === 'AbortError') return;
            }
        }
        await handleCopyLink(story);
    };

    const handleRefreshLink = async (story: any) => {
        if (!user?.id || isActionLoading) return;
        setIsActionLoading(true);
        try {
            const storyDate = getStoryDate(story);
            const res = await refreshDailyStorySlug(
                user.id,
                story.id,
                user.user_metadata?.username,
                storyDate
            );
            if (res.success && res.newSlug) {
                setStories(prev => prev.map(s => s.id === story.id ? { ...s, slug: res.newSlug } : s));
                const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
                const newUrl = origin ? `${origin}/story/${res.newSlug}` : `/story/${res.newSlug}`;
                try {
                    await navigator.clipboard.writeText(newUrl);
                } catch {}
                showToast('Share link refreshed! Previous links are now disabled.');
            } else {
                showToast('Failed to refresh share link');
            }
        } catch (err) {
            console.error('[JournalSharedGrid] refresh link error:', err);
            showToast('Error refreshing link');
        } finally {
            setIsActionLoading(false);
            setOpenMenuStoryId(null);
        }
    };

    const handleDeleteStory = async (story: any) => {
        if (!user?.id || isActionLoading) return;
        setIsActionLoading(true);
        const storyDate = getStoryDate(story);
        try {
            const ok = await deleteDailyStoryShare(user.id, storyDate, story.id);
            if (ok) {
                setStories(prev => prev.filter(s => s.id !== story.id));
                showToast('Removed from Shared. Original journal takes preserved.');
            } else {
                showToast('Failed to remove from Shared');
            }
        } catch (err) {
            console.error('[JournalSharedGrid] delete error:', err);
            showToast('Error removing story');
        } finally {
            setIsActionLoading(false);
            setOpenMenuStoryId(null);
        }
    };

    // ── Progressive 2-Stage Touch Gesture Handlers ──
    const handleSharedTouchStart = (storyId: string, e: React.TouchEvent<HTMLDivElement>) => {
        const touch = e.touches[0];
        if (!touch) return;
        const currentScrollLeft = e.currentTarget.scrollLeft;
        const currentStage = storyDrawerStages[storyId] || 0;
        storyTouchStartRef.current = {
            id: storyId,
            startX: touch.clientX,
            startY: touch.clientY,
            scrollLeftStart: currentScrollLeft,
            initialStage: currentStage,
            isTracking: currentScrollLeft <= 2 || currentStage > 0
        };
    };

    const handleSharedTouchMove = (storyId: string, e: React.TouchEvent<HTMLDivElement>) => {
        if (!storyTouchStartRef.current || storyTouchStartRef.current.id !== storyId) return;
        const touch = e.touches[0];
        if (!touch) return;

        const currentScrollLeft = e.currentTarget.scrollLeft;
        const deltaX = touch.clientX - storyTouchStartRef.current.startX;
        const deltaY = touch.clientY - storyTouchStartRef.current.startY;
        const initStage = storyTouchStartRef.current.initialStage;

        // Cancel on vertical scrolling
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
            storyTouchStartRef.current.isTracking = false;
            setStoryPullDistances(prev => prev[storyId] ? { ...prev, [storyId]: 0 } : prev);
            return;
        }

        if (!storyTouchStartRef.current.isTracking) return;

        if (initStage === 0) {
            // First swipe: clamped to stage 1 (72px Play card)
            if (currentScrollLeft <= 2 && deltaX > 0) {
                const raw = deltaX * 0.7;
                const pullAmount = raw <= 72 ? raw : 72 + Math.min(4, (raw - 72) * 0.15);
                setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
            } else {
                setStoryPullDistances(prev => prev[storyId] ? { ...prev, [storyId]: 0 } : prev);
            }
        } else if (initStage === 1) {
            // Already at Stage 1 (Play card revealed). Second swipe right pulls further to reveal 4-button card next to it
            const base = 72;
            if (deltaX >= 0) {
                const raw = base + deltaX * 0.7;
                const pullAmount = raw <= 146 ? raw : 146 + Math.min(6, (raw - 146) * 0.15);
                setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
            } else {
                // Swiping left closes back towards stage 0
                const pullAmount = Math.max(0, base + deltaX * 0.7);
                setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
            }
        } else if (initStage === 2) {
            // Already at Stage 2 (4 buttons + Play revealed at 146px). Swiping left closes towards stage 3 (72px, hiding Play button)
            const base = 146;
            if (deltaX <= 0) {
                const pullAmount = Math.max(0, base + deltaX * 0.7);
                setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
            } else {
                const pullAmount = base + Math.min(6, deltaX * 0.15);
                setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
            }
        } else if (initStage === 3) {
            // Already at Stage 3 (4 buttons only revealed at 72px, Play button hidden).
            const base = 72;
            if (deltaX >= 0) {
                // Swiping right re-reveals Play button towards stage 2 (146px)
                const raw = base + deltaX * 0.7;
                const pullAmount = raw <= 146 ? raw : 146 + Math.min(6, (raw - 146) * 0.15);
                setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
            } else {
                // Swiping left closes 4 buttons towards stage 0 (0px)
                const pullAmount = Math.max(0, base + deltaX * 0.7);
                setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
            }
        }
    };

    const handleSharedTouchEnd = (storyId: string) => {
        if (!storyTouchStartRef.current || storyTouchStartRef.current.id !== storyId) {
            setStoryPullDistances(prev => ({ ...prev, [storyId]: 0 }));
            return;
        }
        const currentPull = storyPullDistances[storyId] || 0;
        const initStage = storyTouchStartRef.current.initialStage;
        storyTouchStartRef.current = null;
        setStoryPullDistances(prev => ({ ...prev, [storyId]: 0 }));

        let nextStage = 0;
        if (initStage === 0) {
            if (currentPull >= 28) {
                nextStage = 1; // First swipe reveals Play card (72px)
            } else {
                nextStage = 0;
            }
        } else if (initStage === 1) {
            if (currentPull >= 105) {
                nextStage = 2; // Second swipe reveals 4 buttons next to Play card (146px)
            } else if (currentPull < 35) {
                nextStage = 0; // Swiped left: close
            } else {
                nextStage = 1;
            }
        } else if (initStage === 2) {
            if (currentPull < 35) {
                nextStage = 0; // Swiped left far: close completely
            } else if (currentPull < 110) {
                nextStage = 3; // First swipe left: hide Play button, keep 4 buttons only (72px)
            } else {
                nextStage = 2; // Stay at stage 2
            }
        } else if (initStage === 3) {
            if (currentPull >= 105) {
                nextStage = 2; // Swiped right: re-reveal Play button alongside 4 buttons (146px)
            } else if (currentPull < 35) {
                nextStage = 0; // Second swipe left: hide 4 buttons as well (completely closed)
            } else {
                nextStage = 3; // Stay at stage 3
            }
        }

        if (nextStage !== initStage && navigator.vibrate) {
            try { navigator.vibrate(25); } catch {}
        }

        setStoryDrawerStages(prev => ({ ...prev, [storyId]: nextStage }));
    };

    // ── Desktop Strip Mouse Drag-to-Scroll ──
    const handleStripMouseDown = (storyId: string, e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;

        stripMouseDragRef.current = {
            id: storyId,
            startX: e.pageX - e.currentTarget.offsetLeft,
            scrollLeftStart: e.currentTarget.scrollLeft,
            isDragging: true
        };
        e.currentTarget.style.cursor = 'grabbing';
    };

    const handleStripMouseMove = (storyId: string, e: React.MouseEvent<HTMLDivElement>) => {
        if (!stripMouseDragRef.current || !stripMouseDragRef.current.isDragging || stripMouseDragRef.current.id !== storyId) return;
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

    return (
        <div className="shared-grid-root">
            {toastMessage && (
                <div className="shared-toast-notice">
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Main Shared Matrix: Exactly identical frameless rows as Journal feed */}
            {loading ? (
                <div className="shared-loading-wrap">
                    <Loader2 size={24} className="vizja-spin" color="var(--yolo-lime, #c8f72c)" />
                    <span>Loading shared stories...</span>
                </div>
            ) : stories.length === 0 ? (
                <div className="shared-grid-empty-state">
                    <div className="shared-empty-icon-box">
                        <Share2 size={32} color="#a1a1aa" />
                    </div>
                    <h3>No Shared Stories Yet</h3>
                    <p>Swipe a daily sequence to the right in your journal and click share to make it available here.</p>
                </div>
            ) : (
                <div className="shared-matrix-container">
                    {stories.map(story => {
                        const storyDate = getStoryDate(story);
                        const formattedDate = formatDateVertical(storyDate);
                        const clips: any[] = (story.provenance_log as any)?.clips || [];
                        const shareUrl = getShareUrl(story);

                        const isDragging = (storyPullDistances[story.id] || 0) > 0;
                        const stage = storyDrawerStages[story.id] || 0;
                        const currentWidth = isDragging 
                            ? storyPullDistances[story.id] 
                            : (stage === 2 ? 146 : (stage === 1 || stage === 3) ? 72 : 0);

                        let showPlay = false;
                        let showFourButtons = false;

                        if (isDragging) {
                            const initStage = storyTouchStartRef.current?.initialStage ?? stage;
                            if (initStage === 0) {
                                showPlay = true;
                                showFourButtons = false;
                            } else if (initStage === 1) {
                                showPlay = true;
                                showFourButtons = currentWidth >= 95;
                            } else if (initStage === 2) {
                                showFourButtons = true;
                                showPlay = currentWidth >= 110;
                            } else if (initStage === 3) {
                                showFourButtons = true;
                                showPlay = currentWidth >= 105;
                            }
                        } else {
                            showPlay = stage === 1 || stage === 2;
                            showFourButtons = stage === 2 || stage === 3;
                        }

                        return (
                            <div key={story.id} className="shared-story-row">
                                {/* Vertical Sideways Date Strip (Matching Journal page exactly) */}
                                <div 
                                    className="yolofuck-vertical-date-strip shared-date-strip"
                                    title={`Date: ${formattedDate}`}
                                >
                                    <span className="yolofuck-vertical-date-text">
                                        {formattedDate}
                                    </span>
                                </div>

                                {/* Progressive 2-Stage Reveal Drawer (Stage 1: 72px Play card, Stage 2: 146px 4-button card + Play card) */}
                                {currentWidth > 0 && (
                                    <div 
                                        className={`shared-swipe-drawer ${isDragging ? 'is-dragging' : 'snapped'}`}
                                        style={{ width: `${currentWidth}px` }}
                                    >
                                        {/* Stage 2 Card on the LEFT: 4 Buttons Grid filling 72px x 128px space */}
                                        {showFourButtons && (
                                            <div className="shared-drawer-card-grid">
                                                {/* Top-Left: Share */}
                                                <button
                                                    type="button"
                                                    className="shared-card-grid-tile share"
                                                    onClick={(e) => handleNativeShare(story, e)}
                                                    title="Share"
                                                >
                                                    <Share2 size={18} />
                                                </button>

                                                {/* Top-Right: Gear Options */}
                                                <div className="shared-card-grid-menu-wrap">
                                                    <button
                                                        type="button"
                                                        className={`shared-card-grid-tile gear ${openMenuStoryId === story.id ? 'active' : ''}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenMenuStoryId(openMenuStoryId === story.id ? null : story.id);
                                                        }}
                                                        title="Options"
                                                    >
                                                        <Settings size={18} />
                                                    </button>

                                                    {openMenuStoryId === story.id && (
                                                        <div className="shared-story-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                                                            <button 
                                                                type="button" 
                                                                className="shared-dropdown-item"
                                                                onClick={() => handleRefreshLink(story)}
                                                            >
                                                                <RotateCw size={15} color="var(--yolo-lime, #c8f72c)" />
                                                                <div className="shared-dropdown-item-labels">
                                                                    <span>Refresh Share Link</span>
                                                                    <small>Invalidates old link and generates new URL</small>
                                                                </div>
                                                            </button>

                                                            <div className="shared-dropdown-divider" />

                                                            <button 
                                                                type="button" 
                                                                className="shared-dropdown-item delete"
                                                                onClick={() => handleDeleteStory(story)}
                                                            >
                                                                <Trash2 size={15} color="#f87171" />
                                                                <div className="shared-dropdown-item-labels">
                                                                    <span style={{ color: '#f87171' }}>Delete from Shared</span>
                                                                    <small>Keeps original journal takes intact</small>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Bottom-Left: Copy Link */}
                                                <button
                                                    type="button"
                                                    className="shared-card-grid-tile copy"
                                                    onClick={(e) => handleCopyLink(story, e)}
                                                    title="Copy link"
                                                >
                                                    {copiedStoryId === story.id ? <Check size={18} color="#10b981" /> : <Copy size={18} />}
                                                </button>

                                                {/* Bottom-Right: External Link */}
                                                <button
                                                    type="button"
                                                    className="shared-card-grid-tile external"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(shareUrl, '_blank');
                                                    }}
                                                    title="Open in new tab"
                                                >
                                                    <ExternalLink size={18} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Play Card: Visible on Stage 1 and Stage 2; hidden on Stage 3 */}
                                        {showPlay && (
                                            <button
                                                type="button"
                                                className="shared-drawer-play-card"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setStoryDrawerStages(prev => ({ ...prev, [story.id]: 0 }));
                                                    setPreviewPlayerStory({ ...story, startClipIndex: 0 });
                                                }}
                                                title="Play story"
                                            >
                                                <div className="shared-drawer-play-circle">
                                                    <Play size={20} fill="currentColor" color="#000000" />
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Horizontal Strip of 9:16 Films (2px gap, identical to Journal page) */}
                                <div 
                                    className="shared-films-horizontal-strip"
                                    onTouchStart={(e) => handleSharedTouchStart(story.id, e)}
                                    onTouchMove={(e) => handleSharedTouchMove(story.id, e)}
                                    onTouchEnd={() => handleSharedTouchEnd(story.id)}
                                    onMouseDown={(e) => handleStripMouseDown(story.id, e)}
                                    onMouseMove={(e) => handleStripMouseMove(story.id, e)}
                                    onMouseUp={handleStripMouseUp}
                                    onMouseLeave={handleStripMouseUp}
                                >
                                    {clips && clips.length > 0 ? (
                                        clips.map((clip: any, idx: number) => {
                                            const clipThumb = clip.thumbnail_url || null;
                                            const clipVideo = clip.clip_url || null;
                                            const clipCreatedAt = clip.created_at || '';
                                            let startTimeStr = '';
                                            if (clipCreatedAt) {
                                                try {
                                                    const d = new Date(clipCreatedAt);
                                                    if (!isNaN(d.getTime())) {
                                                        const hh = String(d.getHours()).padStart(2, '0');
                                                        const mm = String(d.getMinutes()).padStart(2, '0');
                                                        startTimeStr = `${hh}:${mm}`;
                                                    }
                                                } catch {}
                                            }

                                            return (
                                                <div 
                                                    key={clip.id || idx} 
                                                    className="shared-film-square"
                                                    onClick={() => {
                                                        if (storyDrawerStages[story.id]) {
                                                            setStoryDrawerStages(prev => ({ ...prev, [story.id]: 0 }));
                                                            return;
                                                        }
                                                        setPreviewPlayerStory({ ...story, startClipIndex: idx });
                                                    }}
                                                    title={`Take ${idx + 1}`}
                                                >
                                                    {clipThumb ? (
                                                        <img src={clipThumb} alt="" className="shared-square-media" />
                                                    ) : clipVideo ? (
                                                        <video src={clipVideo} className="shared-square-media" preload="metadata" muted />
                                                    ) : (
                                                        <div className="shared-film-placeholder">
                                                            <Video size={16} color="#64748b" />
                                                        </div>
                                                    )}

                                                    {/* Top Center Take Number Badge (Identical to Journal) */}
                                                    <div className="shared-film-top-badge">
                                                        <span className="shared-film-take-num">
                                                            {clip.original_take_number || (idx + 1)}
                                                        </span>
                                                    </div>

                                                    {/* Bottom Timestamp Badge (Identical to Journal) */}
                                                    {startTimeStr && (
                                                        <div className="shared-film-bottom-time">
                                                            <span>{startTimeStr}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="shared-film-empty-box">
                                            <Video size={20} color="#475569" />
                                            <span>No takes in sequence</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Full-Screen Continuous Story Player Modal */}
            {previewPlayerStory && (
                <SharedStoryPlayerModal
                    story={previewPlayerStory}
                    initialClipIndex={previewPlayerStory.startClipIndex || 0}
                    onClose={() => setPreviewPlayerStory(null)}
                />
            )}
        </div>
    );
};

export default JournalSharedGrid;
