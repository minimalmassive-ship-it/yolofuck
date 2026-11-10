import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Settings, Lock, Users, Globe, Trash2, Copy, Check, EyeOff, RotateCcw, 
    Video, Calendar, AlertTriangle, X, Share2, Loader2, ExternalLink, Play, ArrowUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
    fetchUserSharedDailyStories, updateDailyStoryVisibility, 
    stopDailyStorySharing, resumeDailyStorySharing, deleteDailyStoryShare,
    getLocalDateISO
} from '../lib/journalStoryService';
import { SharedStoryPlayerModal } from './SharedStoryPlayerModal';
import { JournalShareCommandCenter } from './JournalShareCommandCenter';
import { moveToTrash } from '../lib/journalTrashStorage';
import './JournalSharedGrid.css';

interface JournalSharedGridProps {
    projectId?: string | null;
}

export const JournalSharedGrid: React.FC<JournalSharedGridProps> = ({ projectId }) => {
    const { user } = useAuth();
    const [stories, setStories] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [openMenuStoryId, setOpenMenuStoryId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [deleteConfirmStory, setDeleteConfirmStory] = useState<any | null>(null);
    const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
    const [copiedStoryId, setCopiedStoryId] = useState<string | null>(null);
    const [previewPlayerStory, setPreviewPlayerStory] = useState<any | null>(null);
    const [shareModalStory, setShareModalStory] = useState<any | null>(null);

    // Mobile Swipe-Right pull-to-play gesture state per shared story
    const [storyPullDistances, setStoryPullDistances] = useState<{ [storyId: string]: number }>({});
    const storyTouchStartRef = useRef<{ id: string; startX: number; startY: number; isTracking: boolean } | null>(null);

    const handleSharedTouchStart = (storyId: string, e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        storyTouchStartRef.current = {
            id: storyId,
            startX: touch.clientX,
            startY: touch.clientY,
            isTracking: true
        };
    };

    const handleSharedTouchMove = (storyId: string, e: React.TouchEvent) => {
        if (!storyTouchStartRef.current || storyTouchStartRef.current.id !== storyId) return;
        const touch = e.touches[0];
        if (!touch) return;

        const deltaX = touch.clientX - storyTouchStartRef.current.startX;
        const deltaY = touch.clientY - storyTouchStartRef.current.startY;

        // If vertical scrolling, cancel
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
            storyTouchStartRef.current.isTracking = false;
            setStoryPullDistances(prev => prev[storyId] ? { ...prev, [storyId]: 0 } : prev);
            return;
        }

        // Only track swipe to right
        if (storyTouchStartRef.current.isTracking && deltaX > 0) {
            const pullAmount = Math.min(80, deltaX * 0.55);
            setStoryPullDistances(prev => ({ ...prev, [storyId]: pullAmount }));
        } else {
            setStoryPullDistances(prev => prev[storyId] ? { ...prev, [storyId]: 0 } : prev);
        }
    };

    const handleSharedTouchEnd = (story: any) => {
        const pullAmount = storyPullDistances[story.id] || 0;
        storyTouchStartRef.current = null;
        setStoryPullDistances(prev => ({ ...prev, [story.id]: 0 }));

        if (pullAmount >= 48 && !story.is_sharing_stopped) {
            if (navigator.vibrate) {
                try { navigator.vibrate(50); } catch {}
            }
            setPreviewPlayerStory(story);
        }
    };

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
            setStories(data || []);
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

    // Close gear dropdown menu on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.shared-story-gear-wrapper')) {
                setOpenMenuStoryId(null);
            }
        };

        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Format date title
    const formatDate = (dateStr: string) => {
        try {
            if (!dateStr) return 'Daily Story';
            const d = new Date(dateStr + 'T00:00:00');
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const getStoryDate = (story: any): string => {
        return (story.provenance_log as any)?.date || (story.created_at ? story.created_at.split('T')[0] : '');
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

    const handleChangeVisibility = async (story: any, newVis: 'private' | 'network' | 'public') => {
        if (!user?.id) return;
        setIsActionLoading(true);
        try {
            const storyDate = getStoryDate(story);
            const res = await updateDailyStoryVisibility(user.id, storyDate, newVis);
            if (res.success) {
                setStories(prev => prev.map(s => s.id === story.id ? { 
                    ...s, 
                    visibility: newVis, 
                    is_public: newVis === 'public',
                    allow_link_access: true,
                    provenance_log: { ...(s.provenance_log || {}), is_stopped: false }
                } : s));

                if (newVis === 'private') {
                    showToast('Set to Private (Link only)');
                    await handleCopyLink(story);
                } else if (newVis === 'network') {
                    showToast('Visible to your Network on Home Page');
                } else {
                    showToast('Visible Publicly on Home Page');
                }
            } else {
                showToast('Failed to update visibility');
            }
        } catch (err) {
            console.error('[JournalSharedGrid] change visibility error:', err);
            showToast('Error updating visibility');
        } finally {
            setIsActionLoading(false);
            setOpenMenuStoryId(null);
        }
    };

    const handleToggleStopSharing = async (story: any) => {
        if (!user?.id) return;
        setIsActionLoading(true);
        const storyDate = getStoryDate(story);
        const isCurrentlyStopped = story.visibility === 'stopped' || (story.provenance_log as any)?.is_stopped === true;

        try {
            if (isCurrentlyStopped) {
                // Resume sharing as private
                const ok = await resumeDailyStorySharing(user.id, storyDate, story.id, 'private');
                if (ok) {
                    setStories(prev => prev.map(s => s.id === story.id ? {
                        ...s,
                        visibility: 'private',
                        is_public: false,
                        allow_link_access: true,
                        provenance_log: { ...(s.provenance_log || {}), is_stopped: false }
                    } : s));
                    showToast('Sharing resumed as Private (Link active)');
                } else {
                    showToast('Failed to resume sharing');
                }
            } else {
                // Stop sharing immediately
                const ok = await stopDailyStorySharing(user.id, storyDate, story.id);
                if (ok) {
                    setStories(prev => prev.map(s => s.id === story.id ? {
                        ...s,
                        visibility: 'stopped',
                        is_public: false,
                        allow_link_access: false,
                        provenance_log: { ...(s.provenance_log || {}), is_stopped: true }
                    } : s));
                    showToast('Sharing stopped. Link deactivated.');
                } else {
                    showToast('Failed to stop sharing');
                }
            }
        } catch (err) {
            console.error('[JournalSharedGrid] toggle stop error:', err);
            showToast('Error modifying sharing state');
        } finally {
            setIsActionLoading(false);
            setOpenMenuStoryId(null);
        }
    };

    const handleConfirmDelete = async () => {
        if (!user?.id || !deleteConfirmStory) return;
        setIsActionLoading(true);
        const storyDate = getStoryDate(deleteConfirmStory);
        const storyClips = (deleteConfirmStory.provenance_log as any)?.clips || [];

        // Move clips to trash bin
        if (Array.isArray(storyClips) && storyClips.length > 0) {
            storyClips.forEach(c => moveToTrash(c, 'share'));
        } else if (deleteConfirmStory.video_url) {
            moveToTrash({
                id: deleteConfirmStory.id,
                clip_url: deleteConfirmStory.video_url,
                thumbnail_url: deleteConfirmStory.thumbnail_url,
                clip_date: storyDate
            }, 'share');
        }

        try {
            const ok = await deleteDailyStoryShare(user.id, storyDate, deleteConfirmStory.id);
            if (ok) {
                setStories(prev => prev.filter(s => s.id !== deleteConfirmStory.id));
                showToast('Shared story moved to Trash Bin');
            } else {
                showToast('Failed to delete shared story');
            }
        } catch (err) {
            console.error('[JournalSharedGrid] delete error:', err);
            showToast('Error deleting story');
        } finally {
            setIsActionLoading(false);
            setDeleteConfirmStory(null);
            setOpenMenuStoryId(null);
        }
    };

    if (loading) {
        return (
            <div className="shared-grid-loading-container">
                <Loader2 className="animate-spin" size={28} color="#efede3" />
                <span>Loading shared daily stories...</span>
            </div>
        );
    }

    return (
        <div className="shared-stories-tab-container">
            {/* Toast Feedback */}
            {toastMessage && (
                <div className="shared-grid-toast">
                    {toastMessage}
                </div>
            )}

            {/* Header info */}
            <div className="shared-grid-header">
                <div className="shared-grid-header-info">
                    <h2>Shared Daily Stories</h2>
                    <p>Manage your shared stories, configure privacy, and control link access in real time.</p>
                </div>
                <div className="shared-grid-header-count">
                    <span>{stories.length} {stories.length === 1 ? 'Story' : 'Stories'}</span>
                </div>
            </div>

            {/* Empty State */}
            {stories.length === 0 ? (
                <div className="shared-grid-empty-state">
                    <div className="shared-empty-icon-box">
                        <Share2 size={32} color="#a1a1aa" />
                    </div>
                    <h3>No Shared Stories Yet</h3>
                    <p>When you click "Share Story" in your daily journal, your created links and shared stories will appear here.</p>
                </div>
            ) : (
                <div className="shared-stories-grid">
                    {stories.map(story => {
                        const storyDate = getStoryDate(story);
                        const isStopped = story.visibility === 'stopped' || (story.provenance_log as any)?.is_stopped === true;
                        const clips = (story.provenance_log as any)?.clips || [];
                        const takesCount = (story.provenance_log as any)?.takes_count || clips.length || 1;
                        const thumbnail = story.thumbnail_url || (clips[0]?.thumbnail_url) || null;
                        const previewVideoUrl = story.video_url || (clips[0]?.clip_url) || null;
                        const shareUrl = getShareUrl(story);

                        return (
                            <div 
                                key={story.id} 
                                className={`shared-story-card ${isStopped ? 'is-stopped' : ''}`}
                            >
                                {/* Card Header with Date and Gear Menu */}
                                <div className="shared-story-card-header">
                                    <div className="shared-story-date-badge">
                                        <Calendar size={13} />
                                        <span>{formatDate(storyDate)}</span>
                                    </div>

                                    {/* Gear Menu */}
                                    <div className="shared-story-gear-wrapper">
                                        <button 
                                            type="button" 
                                            className={`shared-story-gear-btn ${openMenuStoryId === story.id ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuStoryId(openMenuStoryId === story.id ? null : story.id);
                                            }}
                                            title="Sharing options"
                                        >
                                            <Settings size={15} />
                                        </button>

                                        {openMenuStoryId === story.id && (
                                            <div className="shared-story-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                                                <div className="shared-dropdown-section-title">Privacy Setting</div>
                                                
                                                <button 
                                                    type="button" 
                                                    className={`shared-dropdown-item ${story.visibility === 'private' && !isStopped ? 'selected' : ''}`}
                                                    onClick={() => handleChangeVisibility(story, 'private')}
                                                >
                                                    <Lock size={14} />
                                                    <div className="shared-dropdown-item-labels">
                                                        <span>Private (Copy Link)</span>
                                                        <small>Only people with link</small>
                                                    </div>
                                                    {story.visibility === 'private' && !isStopped && <Check size={14} color="#4ade80" className="check-icon" />}
                                                </button>

                                                <button 
                                                    type="button" 
                                                    className={`shared-dropdown-item ${story.visibility === 'network' && !isStopped ? 'selected' : ''}`}
                                                    onClick={() => handleChangeVisibility(story, 'network')}
                                                >
                                                    <Users size={14} />
                                                    <div className="shared-dropdown-item-labels">
                                                        <span>Network</span>
                                                        <small>Visible to your network on Home</small>
                                                    </div>
                                                    {story.visibility === 'network' && !isStopped && <Check size={14} color="#4ade80" className="check-icon" />}
                                                </button>

                                                <button 
                                                    type="button" 
                                                    className={`shared-dropdown-item ${story.visibility === 'public' && !isStopped ? 'selected' : ''}`}
                                                    onClick={() => handleChangeVisibility(story, 'public')}
                                                >
                                                    <Globe size={14} />
                                                    <div className="shared-dropdown-item-labels">
                                                        <span>Public</span>
                                                        <small>Visible to all users on Home</small>
                                                    </div>
                                                    {story.visibility === 'public' && !isStopped && <Check size={14} color="#4ade80" className="check-icon" />}
                                                </button>

                                                <div className="shared-dropdown-divider" />

                                                {/* Stop Sharing / Resume Sharing */}
                                                <button 
                                                    type="button" 
                                                    className={`shared-dropdown-item warning ${isStopped ? 'resume' : ''}`}
                                                    onClick={() => handleToggleStopSharing(story)}
                                                >
                                                    {isStopped ? (
                                                        <>
                                                            <RotateCcw size={14} />
                                                            <span>Resume Sharing</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <EyeOff size={14} />
                                                            <span>Stop Sharing</span>
                                                        </>
                                                    )}
                                                </button>

                                                {/* Delete */}
                                                <button 
                                                    type="button" 
                                                    className="shared-dropdown-item danger"
                                                    onClick={() => {
                                                        setDeleteConfirmStory(story);
                                                        setOpenMenuStoryId(null);
                                                    }}
                                                >
                                                    <Trash2 size={14} color="#f87171" />
                                                    <span>Delete</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                 <div 
                                    className="shared-story-row-wrapper"
                                    onTouchStart={(e) => handleSharedTouchStart(story.id, e)}
                                    onTouchMove={(e) => handleSharedTouchMove(story.id, e)}
                                    onTouchEnd={() => handleSharedTouchEnd(story)}
                                >
                                    {/* 1:1 Black Square on Left Side matching Journal day card with Play button (Desktop only) */}
                                    <div className="shared-story-left-info-square">
                                        <button
                                            type="button"
                                            className="shared-story-left-play-btn"
                                            onClick={() => setPreviewPlayerStory(story)}
                                            disabled={isStopped || clips.length === 0}
                                            title="Play shared story sequence"
                                        >
                                            <Play size={18} fill="#ffffff" color="#ffffff" />
                                        </button>

                                        <button
                                            type="button"
                                            className="shared-story-left-share-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShareModalStory(story);
                                            }}
                                            disabled={isStopped}
                                            title="Open Share Options"
                                        >
                                            <Share2 size={13} />
                                            <ArrowUp size={12} className="share-arrow-up-icon" />
                                        </button>

                                        <div className="shared-story-left-date-info">
                                            <span className="shared-story-left-date">{formatDate(storyDate)}</span>
                                            <span className="shared-story-left-takes">{takesCount} {takesCount === 1 ? 'take' : 'takes'}</span>
                                        </div>
                                    </div>

                                    {/* Vertical Sideways Date Strip (Mobile only: e.g. 09-11-2026) */}
                                    <div className="shared-story-vertical-date-strip" title={`Date: ${storyDate}`}>
                                        <span className="shared-story-vertical-date-text">
                                            {storyDate ? storyDate.split('-').reverse().join('-') : 'STORY'}
                                        </span>
                                    </div>

                                    {/* Pull to Play Reveal Drawer (Emerges on swipe right when pulled from left) */}
                                    {storyPullDistances[story.id] > 0 && (
                                        <div 
                                            className="shared-swipe-play-drawer"
                                            style={{ width: `${storyPullDistances[story.id]}px` }}
                                        >
                                            <div className={`shared-swipe-play-circle ${storyPullDistances[story.id] >= 48 ? 'triggered' : ''}`}>
                                                <Play size={18} fill="currentColor" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Media Preview & Details */}
                                    <div className="shared-story-media-preview" onClick={() => setPreviewPlayerStory(story)}>
                                    {thumbnail ? (
                                        <img src={thumbnail} alt={story.title} className="shared-story-thumb-img" />
                                    ) : previewVideoUrl ? (
                                        <video src={previewVideoUrl} className="shared-story-thumb-video" preload="metadata" />
                                    ) : (
                                        <div className="shared-story-placeholder">
                                            <Video size={28} color="#555" />
                                        </div>
                                    )}

                                    {/* Takes Pill */}
                                    <div className="shared-story-takes-pill">
                                        {takesCount} {takesCount === 1 ? 'Take' : 'Takes'}
                                    </div>

                                    {/* Stopped Overlay */}
                                    {isStopped && (
                                        <div className="shared-story-stopped-overlay">
                                            <EyeOff size={22} color="#f87171" />
                                            <span>Sharing Stopped</span>
                                            <small>Link Deactivated</small>
                                        </div>
                                    )}
                                </div>
                            </div>

                                {/* Card Footer & Status Badges */}
                                <div className="shared-story-card-footer">
                                    <div className="shared-story-status-row">
                                        {isStopped ? (
                                            <span className="shared-status-badge stopped">
                                                <EyeOff size={11} />
                                                <span>Stopped</span>
                                            </span>
                                        ) : story.visibility === 'network' ? (
                                            <span className="shared-status-badge network">
                                                <Users size={11} />
                                                <span>Network</span>
                                            </span>
                                        ) : story.visibility === 'public' ? (
                                            <span className="shared-status-badge public">
                                                <Globe size={11} />
                                                <span>Public</span>
                                            </span>
                                        ) : (
                                            <span className="shared-status-badge private">
                                                <Lock size={11} />
                                                <span>Private (Link)</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Action row with Copy Link & External Open */}
                                    <div className="shared-story-link-actions">
                                        <button 
                                            type="button" 
                                            className={`shared-card-copy-btn ${copiedStoryId === story.id ? 'copied' : ''}`}
                                            onClick={(e) => handleCopyLink(story, e)}
                                            disabled={isStopped}
                                            title={isStopped ? "Sharing is stopped" : "Copy shareable link"}
                                        >
                                            {copiedStoryId === story.id ? <Check size={12} /> : <Copy size={12} />}
                                            <span>{copiedStoryId === story.id ? 'Copied' : 'Copy Link'}</span>
                                        </button>

                                        <a 
                                            href={isStopped ? undefined : shareUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className={`shared-card-open-link ${isStopped ? 'disabled' : ''}`}
                                            title="Open story page"
                                            onClick={(e) => isStopped && e.preventDefault()}
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Permanent Delete Confirmation Dialog */}
            {deleteConfirmStory && (
                <div className="shared-delete-dialog-backdrop" onClick={() => setDeleteConfirmStory(null)}>
                    <div className="shared-delete-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="shared-delete-dialog-header">
                            <div className="shared-delete-icon-box">
                                <AlertTriangle size={20} color="#f87171" />
                            </div>
                            <h3>Delete Shared Story?</h3>
                            <button 
                                className="shared-delete-close-btn"
                                onClick={() => setDeleteConfirmStory(null)}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="shared-delete-desc">
                            Are you sure you want to delete this shared story? 
                            The link will be <strong>permanently deactivated</strong>, and it will be completely removed from your Shared list and the Home Page.
                        </p>

                        <div className="shared-delete-actions">
                            <button 
                                type="button" 
                                className="shared-delete-cancel-btn"
                                onClick={() => setDeleteConfirmStory(null)}
                                disabled={isActionLoading}
                            >
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                className="shared-delete-confirm-btn"
                                onClick={handleConfirmDelete}
                                disabled={isActionLoading}
                            >
                                {isActionLoading ? 'Deleting...' : 'Delete Permanently'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fullscreen Shared Story Player Modal */}
            {previewPlayerStory && (
                <SharedStoryPlayerModal
                    story={previewPlayerStory}
                    onClose={() => setPreviewPlayerStory(null)}
                />
            )}

            {/* Centered Share Options Modal */}
            {shareModalStory && (
                <div 
                    className="shared-options-modal-backdrop" 
                    onClick={() => setShareModalStory(null)}
                >
                    <div 
                        className="shared-options-modal-window" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="shared-options-modal-header">
                            <div className="shared-options-modal-title">
                                <Share2 size={16} color="#10b981" />
                                <span>Share Story Options</span>
                            </div>
                            <button 
                                type="button" 
                                className="shared-options-modal-close" 
                                onClick={() => setShareModalStory(null)}
                                title="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="shared-options-modal-content">
                            <JournalShareCommandCenter
                                date={getStoryDate(shareModalStory)}
                                clips={(shareModalStory.provenance_log as any)?.clips || (shareModalStory.video_url ? [{ clip_url: shareModalStory.video_url, id: shareModalStory.id, clip_date: getStoryDate(shareModalStory), is_merged: false, clip_order: 0, created_at: shareModalStory.created_at, duration_ms: 5000, project_id: null, thumbnail_url: shareModalStory.thumbnail_url, transcription: null, user_id: user?.id || '' }] : [])}
                                projectId={null}
                                userId={user?.id || 'local_user'}
                                username={user?.user_metadata?.username || ''}
                                onClose={() => setShareModalStory(null)}
                            />
                        </div>

                        <div className="shared-options-modal-footer">
                            <button 
                                type="button" 
                                className="shared-options-modal-cancel-btn" 
                                onClick={() => setShareModalStory(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JournalSharedGrid;
