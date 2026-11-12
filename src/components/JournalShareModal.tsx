import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, MessageCircle, Send, ExternalLink, Share2, ArrowLeft, Lock, Users, Globe, AlertTriangle, X } from 'lucide-react';
import { 
    JournalClip, updateDailyStoryVisibility,
    ensureDailyStoryIdea, generateUniqueStorySlug, getLocalDateISO 
} from '../lib/journalStoryService';
import { supabase } from '../lib/supabase';
import './JournalShareModal.css';

interface JournalShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: string;
    clips: JournalClip[];
    projectId: string | null;
    userId: string;
    username?: string;
    isInitiallyPublished?: boolean;
    onPublishedStatusChanged?: (published: boolean) => void;
}

export const JournalShareModal: React.FC<JournalShareModalProps> = ({
    isOpen,
    onClose,
    date,
    clips,
    projectId,
    userId,
    username,
    isInitiallyPublished = false,
    onPublishedStatusChanged
}) => {
    const safeClips = Array.isArray(clips) ? clips : [];
    const safeDate = typeof date === 'string' && date ? date : getLocalDateISO();
    const safeUserId = typeof userId === 'string' ? userId : '';
    const safeUsername = typeof username === 'string' ? username : (typeof username === 'number' ? String(username) : '');

    const [orderedClips, setOrderedClips] = useState<JournalClip[]>(() => safeClips);
    const [selectedClipIdx, setSelectedClipIdx] = useState<number>(0);
    const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
    const [visibility, setVisibility] = useState<'private' | 'network' | 'public'>('private');
    const [pendingVisibility, setPendingVisibility] = useState<'network' | 'public' | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
    const [isUpdatingVisibility, setIsUpdatingVisibility] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const toastTimerRef = useRef<any>(null);

    // Initialize clips and load current visibility from database
    useEffect(() => {
        if (!isOpen || safeClips.length === 0) return;

        setOrderedClips([...safeClips]);
        setSelectedClipIdx(0);

        if (safeUserId) {
            // 1. Ensure private story idea exists with unique author slug for link sharing
            ensureDailyStoryIdea(safeUserId, projectId, safeDate, safeClips, safeUsername).then(res => {
                if (res.slug) {
                    setPublishedSlug(res.slug);
                }
            }).catch(err => {
                console.error('[JournalShareModal] ensureDailyStoryIdea error:', err);
            });

            // 2. Fetch current visibility from ideas table
            supabase
                .from('journal_entries')
                .select('published_idea_id, is_public')
                .eq('user_id', safeUserId)
                .eq('entry_date', safeDate)
                .eq('entry_type', 'video')
                .maybeSingle()
                .then(async ({ data: entry }) => {
                    if (entry?.published_idea_id) {
                        let idea: any = null;
                        const { data: storyRow } = await supabase
                            .from('shared_stories')
                            .select('visibility, is_public, slug')
                            .eq('id', entry.published_idea_id)
                            .maybeSingle();

                        if (storyRow) {
                            idea = storyRow;
                        } else {
                            const { data: legacyIdea } = await supabase
                                .from('ideas')
                                .select('visibility, is_public, slug')
                                .eq('id', entry.published_idea_id)
                                .maybeSingle();
                            idea = legacyIdea;
                        }

                        if (idea) {
                            if (idea.slug) setPublishedSlug(idea.slug);
                            const vis = idea.visibility as 'private' | 'network' | 'public';
                            if (vis === 'public' || vis === 'network') {
                                setVisibility(vis);
                            } else {
                                setVisibility('private');
                            }
                        }
                    }
                });
        }
    }, [isOpen, safeUserId, safeDate, projectId, safeUsername, safeClips]);

    // Handle toast messages
    const showToast = (msg: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToastMessage(msg);
        toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
    };

    // ── Preview Player ──
    const currentPreviewClip = (orderedClips.length > 0 ? (orderedClips[selectedClipIdx] || orderedClips[0]) : null) || safeClips[0] || null;

    useEffect(() => {
        if (!isOpen) return;
        if (previewVideoRef.current && currentPreviewClip) {
            previewVideoRef.current.src = currentPreviewClip.clip_url;
            previewVideoRef.current.play().catch(() => {});
        }
    }, [isOpen, selectedClipIdx, currentPreviewClip]);

    // Format date label
    const formatDateLabel = (dStr: string) => {
        try {
            if (!dStr) return '';
            const d = new Date(dStr + 'T00:00:00');
            if (isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return String(dStr || '');
        }
    };

    const handlePreviewEnded = () => {
        setSelectedClipIdx(prev => {
            if (prev < orderedClips.length - 1) {
                return prev + 1;
            } else {
                return 0;
            }
        });
    };

    // ── Share URLs ──
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const expectedSlug = generateUniqueStorySlug(safeUsername, safeUserId, safeDate);
    const storySlug = publishedSlug || expectedSlug;
    const shareUrl = origin ? `${origin}/story/${storySlug}` : `/story/${storySlug}`;
    
    const shareTitle = `${safeUsername ? safeUsername + "'s " : ''}Daily Story • ${formatDateLabel(safeDate)}`;
    const shareText = `Watch my complete daily story:`;

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            showToast('Link copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);

            // Re-ensure link access exists without making it public
            if (safeUserId && orderedClips.length > 0) {
                ensureDailyStoryIdea(safeUserId, projectId, safeDate, orderedClips, safeUsername).then(res => {
                    if (res.slug && res.slug !== publishedSlug) setPublishedSlug(res.slug);
                }).catch(() => {});
            }
        } catch {
            showToast('Failed to copy link');
        }
    };

    // ── Visibility Selection & Confirmation ──
    const handleSelectVisibility = (targetVis: 'private' | 'network' | 'public') => {
        if (targetVis === visibility) return;

        if (targetVis === 'private') {
            // Switching back to private removes from Home Page without confirmation
            applyVisibilityChange('private');
        } else {
            // Prompt confirmation modal before publicizing to Home Page or Network
            setPendingVisibility(targetVis);
            setShowConfirmModal(true);
        }
    };

    const applyVisibilityChange = async (targetVis: 'private' | 'network' | 'public') => {
        if (!safeUserId) return;
        setIsUpdatingVisibility(true);
        try {
            // Ensure idea exists first
            await ensureDailyStoryIdea(safeUserId, projectId, safeDate, orderedClips, safeUsername);

            const res = await updateDailyStoryVisibility(safeUserId, safeDate, targetVis);
            if (res.success) {
                setVisibility(targetVis);
                if (onPublishedStatusChanged) {
                    onPublishedStatusChanged(targetVis === 'public' || targetVis === 'network');
                }

                if (targetVis === 'private') {
                    showToast('Set to Private (Link only)');
                } else if (targetVis === 'network') {
                    showToast('Shared with your Network on Home Page');
                } else {
                    showToast('Shared Publicly on Home Page');
                }
            } else {
                showToast('Failed to update visibility');
            }
        } catch (err) {
            console.error('[JournalShareModal] visibility update error:', err);
            showToast('Error updating visibility');
        } finally {
            setIsUpdatingVisibility(false);
            setShowConfirmModal(false);
            setPendingVisibility(null);
        }
    };

    // ── External App Sharing ──
    const handleShareWhatsApp = () => {
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareTitle}\n${shareText}\n${shareUrl}`)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleShareFacebook = () => {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
    };

    const handleShareTwitter = () => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
    };

    const handleShareNative = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl
                });
            } catch (err) {
                // User cancelled or aborted
            }
        } else {
            handleCopyLink();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="journal-share-modal-backdrop" onClick={onClose}>
            <div className="journal-share-modal-window" onClick={(e) => e.stopPropagation()}>
                {/* Toast Feedback */}
                {toastMessage && (
                    <div className="journal-share-toast">
                        {toastMessage}
                    </div>
                )}

                {/* Header */}
                <div className="journal-share-desktop-header">
                    <button 
                        type="button" 
                        className="journal-share-desktop-back-btn" 
                        onClick={onClose}
                        title="Back to story"
                    >
                        <ArrowLeft size={16} />
                        <span>Back</span>
                    </button>
                    <span className="journal-share-desktop-title">Share Daily Story</span>
                </div>

                <div className="journal-share-body">
                    {/* Share Link & Social Icons Row */}
                    <div className="journal-share-destinations-section">
                        <div className="journal-share-link-row">
                            <input 
                                type="text" 
                                readOnly 
                                value={shareUrl} 
                                className="journal-share-link-input"
                            />
                            <button 
                                type="button"
                                className={`journal-share-copy-btn ${copied ? 'copied' : ''}`}
                                onClick={handleCopyLink}
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                <span>{copied ? 'Copied' : 'Copy Link'}</span>
                            </button>
                        </div>

                        <div className="journal-share-apps-grid">
                            <button type="button" className="journal-share-app-btn whatsapp" onClick={handleShareWhatsApp}>
                                <MessageCircle size={16} />
                                <span>WhatsApp</span>
                            </button>
                            <button type="button" className="journal-share-app-btn facebook" onClick={handleShareFacebook}>
                                <Share2 size={16} />
                                <span>Facebook</span>
                            </button>
                            <button type="button" className="journal-share-app-btn twitter" onClick={handleShareTwitter}>
                                <Send size={16} />
                                <span>X / Twitter</span>
                            </button>
                            <button type="button" className="journal-share-app-btn native" onClick={handleShareNative}>
                                <ExternalLink size={16} />
                                <span>More Apps</span>
                            </button>
                        </div>
                    </div>

                    {/* Visibility Section (Modeled on Project Page) */}
                    <div className="journal-share-visibility-card">
                        <div className="journal-share-visibility-header">
                            <span className="journal-share-visibility-title">Visibility & Home Page Sharing</span>
                            <span className="journal-share-visibility-sub">
                                {visibility === 'private' 
                                    ? 'Private (only who has the link can watch).' 
                                    : visibility === 'network' 
                                        ? 'Shared on Home Page with your Ideanite Network.' 
                                        : 'Shared publicly on Home Page with all logged-in users.'}
                            </span>
                        </div>

                        <div className="journal-share-visibility-options">
                            {[
                                { 
                                    id: 'private', 
                                    label: 'Private', 
                                    icon: <Lock size={16} />, 
                                    desc: 'Only who has link can see the video.' 
                                },
                                { 
                                    id: 'network', 
                                    label: 'Network', 
                                    icon: <Users size={16} />, 
                                    desc: 'Shows on Home Page only to people in your Ideanite network.' 
                                },
                                { 
                                    id: 'public', 
                                    label: 'Public', 
                                    icon: <Globe size={16} />, 
                                    desc: 'Shows on Home Page to all logged-in Ideanite users.' 
                                }
                            ].map(opt => (
                                <div 
                                    key={opt.id}
                                    onClick={() => handleSelectVisibility(opt.id as any)}
                                    className={`journal-share-visibility-item ${visibility === opt.id ? 'active' : ''}`}
                                >
                                    <div className="journal-share-vis-icon">{opt.icon}</div>
                                    <div className="journal-share-vis-info">
                                        <span className="journal-share-vis-label">{opt.label}</span>
                                        <span className="journal-share-vis-desc">{opt.desc}</span>
                                    </div>
                                    {visibility === opt.id && (
                                        <Check size={16} color="#4ade80" className="journal-share-vis-check" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Compiled Video Preview Player at the bottom */}
                    <div className="journal-share-bottom-video-section">
                        <div className="journal-share-player-container">
                            <video
                                ref={previewVideoRef}
                                src={currentPreviewClip?.clip_url}
                                playsInline
                                autoPlay
                                muted
                                onEnded={handlePreviewEnded}
                                className="journal-share-preview-video"
                            />
                        </div>
                    </div>
                </div>

                {/* Confirmation Modal for Network / Public Sharing */}
                {showConfirmModal && pendingVisibility && (
                    <div className="journal-confirm-dialog-backdrop" onClick={() => setShowConfirmModal(false)}>
                        <div className="journal-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                            <div className="journal-confirm-dialog-header">
                                <div className="journal-confirm-icon-box">
                                    <AlertTriangle size={20} color="#f59e0b" />
                                </div>
                                <h3>Share on Home Page?</h3>
                                <button 
                                    className="journal-confirm-close-btn"
                                    onClick={() => setShowConfirmModal(false)}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <p className="journal-confirm-desc">
                                {pendingVisibility === 'network' ? (
                                    <>
                                        This daily story video and its takes will become visible in the <strong>Journal</strong> section on the Home Page to <strong>members of your Ideanite Network</strong>.
                                    </>
                                ) : (
                                    <>
                                        This daily story video and its takes will become visible in the <strong>Journal</strong> section on the Home Page to <strong>all logged-in Ideanite users</strong>.
                                    </>
                                )}
                            </p>

                            <div className="journal-confirm-actions">
                                <button 
                                    type="button" 
                                    className="journal-confirm-cancel-btn"
                                    onClick={() => setShowConfirmModal(false)}
                                    disabled={isUpdatingVisibility}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="button" 
                                    className="journal-confirm-accept-btn"
                                    onClick={() => applyVisibilityChange(pendingVisibility)}
                                    disabled={isUpdatingVisibility}
                                >
                                    {isUpdatingVisibility ? 'Updating...' : 'Confirm & Share'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JournalShareModal;
