import React, { useState, useEffect, useRef } from 'react';
import { 
    Copy, Check, Link, Unlink, Lock, Users, Globe, AlertTriangle, 
    X, Share2, ExternalLink
} from 'lucide-react';
import { 
    JournalClip, updateDailyStoryVisibility, stopDailyStorySharing,
    ensureDailyStoryIdea, generateUniqueStorySlug, getLocalDateISO,
    hydrateStoryProvenance
} from '../lib/journalStoryService';
import { supabase } from '../lib/supabase';
import './JournalShareCommandCenter.css';

interface JournalShareCommandCenterProps {
    date: string;
    clips: JournalClip[];
    projectId: string | null;
    userId: string;
    username?: string;
    onClose: () => void;
    onPublishedStatusChanged?: (published: boolean) => void;
}

export const JournalShareCommandCenter: React.FC<JournalShareCommandCenterProps> = ({
    date,
    clips,
    projectId,
    userId,
    username,
    onClose,
    onPublishedStatusChanged
}) => {
    const safeClips = Array.isArray(clips) ? clips : [];
    const safeDate = typeof date === 'string' && date ? date : getLocalDateISO();
    const safeUserId = typeof userId === 'string' ? userId : '';
    const safeUsername = typeof username === 'string' ? username : '';

    const [isLinkActive, setIsLinkActive] = useState<boolean>(false);
    const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
    const [publishedIdeaId, setPublishedIdeaId] = useState<string | null>(null);
    const [visibility, setVisibility] = useState<'private' | 'network' | 'public'>('private');
    const [pendingVisibility, setPendingVisibility] = useState<'network' | 'public' | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const toastTimerRef = useRef<any>(null);

    const showToast = (msg: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToastMessage(msg);
        toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
    };

    // Load current link and visibility status from DB
    useEffect(() => {
        if (!safeUserId) return;

        let isMounted = true;
        const checkStatus = async () => {
            try {
                const { data: entry } = await supabase
                    .from('journal_entries')
                    .select('published_idea_id, is_public')
                    .eq('user_id', safeUserId)
                    .eq('entry_date', safeDate)
                    .eq('entry_type', 'video')
                    .maybeSingle();

                if (!isMounted) return;

                if (entry?.published_idea_id) {
                    setPublishedIdeaId(entry.published_idea_id);

                    const { data: rawIdea } = await supabase
                        .from('ideas')
                        .select('id, slug, visibility, is_public, description')
                        .eq('id', entry.published_idea_id)
                        .maybeSingle();

                    if (!isMounted) return;

                    if (rawIdea) {
                        const idea = hydrateStoryProvenance(rawIdea);
                        if (idea.slug) setPublishedSlug(idea.slug);
                        const isStopped = idea.visibility === 'stopped' || idea.provenance_log?.is_stopped === true;
                        setIsLinkActive(!isStopped);

                        const vis = idea.visibility as 'private' | 'network' | 'public';
                        if (vis === 'public' && idea.is_public === true) {
                            setVisibility('public');
                        } else if (vis === 'network') {
                            setVisibility('network');
                        } else {
                            setVisibility('private');
                        }
                        return;
                    }
                }
                setIsLinkActive(false);
            } catch (err) {
                console.error('[JournalShareCommandCenter] checkStatus error:', err);
            }
        };

        checkStatus();
        return () => { isMounted = false; };
    }, [safeUserId, safeDate]);

    // Format date label
    const formatDateLabel = (dStr: string) => {
        try {
            if (!dStr) return '';
            const d = new Date(dStr + 'T00:00:00');
            if (isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return String(dStr || '');
        }
    };

    // URL calculation
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const fallbackSlug = generateUniqueStorySlug(safeUsername, safeUserId, safeDate);
    const storySlug = publishedSlug || fallbackSlug;
    const shareUrl = origin ? `${origin}/story/${storySlug}` : `/story/${storySlug}`;
    const shareTitle = `${safeUsername ? safeUsername + "'s " : ''}Daily Story • ${formatDateLabel(safeDate)}`;
    const shareText = `Watch my complete daily story:`;

    // ── Activate link ──
    const handleActivateLink = async () => {
        if (!safeUserId || safeClips.length === 0 || isProcessing) return;
        setIsProcessing(true);
        try {
            const res = await ensureDailyStoryIdea(safeUserId, projectId, safeDate, safeClips, safeUsername);
            if (res.success && res.slug) {
                setPublishedSlug(res.slug);
                setPublishedIdeaId(res.ideaId);
                setIsLinkActive(true);
                setVisibility('private');
                showToast('Link created & activated! Anyone with link can view.');
            } else {
                showToast('Failed to activate link');
            }
        } catch (err) {
            console.error('[JournalShareCommandCenter] activateLink error:', err);
            showToast('Error activating link');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Disable link ──
    const handleDisableLink = async () => {
        if (!safeUserId || isProcessing) return;
        setIsProcessing(true);
        try {
            const ok = await stopDailyStorySharing(safeUserId, safeDate, publishedIdeaId || undefined);
            if (ok) {
                setIsLinkActive(false);
                setVisibility('private');
                if (onPublishedStatusChanged) onPublishedStatusChanged(false);
                showToast('Link deactivated! Story is now inaccessible.');
            } else {
                showToast('Failed to disable link');
            }
        } catch (err) {
            console.error('[JournalShareCommandCenter] disableLink error:', err);
            showToast('Error disabling link');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Copy Link ──
    const handleCopyLink = async () => {
        if (!isLinkActive) {
            showToast('Activate link first to copy!');
            return;
        }
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            showToast('Link copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            showToast('Failed to copy link');
        }
    };

    // ── External Messengers & Apps ──
    const ensureActiveBeforeShare = async (): Promise<boolean> => {
        if (isLinkActive) return true;
        // Automatically activate link if user clicks a share button
        setIsProcessing(true);
        try {
            const res = await ensureDailyStoryIdea(safeUserId, projectId, safeDate, safeClips, safeUsername);
            if (res.success && res.slug) {
                setPublishedSlug(res.slug);
                setPublishedIdeaId(res.ideaId);
                setIsLinkActive(true);
                return true;
            }
        } catch {} finally {
            setIsProcessing(false);
        }
        return false;
    };

    const handleShareWhatsApp = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareTitle}\n${shareText}\n${shareUrl}`)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleShareMessenger = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        const url = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(shareUrl)}&app_id=291494419107518&redirect_uri=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
    };

    const handleShareTelegram = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleShareEmail = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        const url = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`;
        window.location.href = url;
    };

    const handleShareMore = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl
                });
            } catch {}
        } else {
            handleCopyLink();
        }
    };

    const handleShareFacebook = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
    };

    const handleShareTwitter = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
    };

    const handleShareYouTube = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        await navigator.clipboard.writeText(shareUrl);
        showToast('Story link copied! Opening YouTube...');
        window.open('https://studio.youtube.com/', '_blank', 'noopener,noreferrer');
    };

    const handleShareInstagram = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        await navigator.clipboard.writeText(shareUrl);
        showToast('Story link copied! Opening Instagram...');
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    };

    const handleShareLinkedIn = async () => {
        const ok = await ensureActiveBeforeShare();
        if (!ok) return;
        const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
    };

    // ── Visibility Selection & Confirmation ──
    const handleSelectVisibility = (targetVis: 'private' | 'network' | 'public') => {
        if (targetVis === visibility) return;

        if (targetVis === 'private') {
            applyVisibilityChange('private');
        } else {
            setPendingVisibility(targetVis);
            setShowConfirmModal(true);
        }
    };

    const applyVisibilityChange = async (targetVis: 'private' | 'network' | 'public') => {
        if (!safeUserId) return;
        setIsProcessing(true);
        try {
            await ensureDailyStoryIdea(safeUserId, projectId, safeDate, safeClips, safeUsername);
            const res = await updateDailyStoryVisibility(safeUserId, safeDate, targetVis);
            if (res.success) {
                setVisibility(targetVis);
                setIsLinkActive(true);
                if (onPublishedStatusChanged) {
                    onPublishedStatusChanged(targetVis === 'public' || targetVis === 'network');
                }
                if (targetVis === 'private') {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('journal_story_unshared', { detail: { ideaId: res.ideaId || publishedIdeaId, date: safeDate } }));
                    }
                    showToast('Set to Private (Link only • Removed from Home Page)');
                } else if (targetVis === 'network') {
                    showToast('Shared with your Network on Home Page');
                } else {
                    showToast('Shared Publicly on Home Page');
                }
            } else {
                showToast('Failed to update visibility');
            }
        } catch (err) {
            console.error('[JournalShareCommandCenter] visibility update error:', err);
            showToast('Error updating visibility');
        } finally {
            setIsProcessing(false);
            setShowConfirmModal(false);
            setPendingVisibility(null);
        }
    };

    return (
        <div className="journal-share-command-center">
            {/* Toast Feedback */}
            {toastMessage && (
                <div className="journal-share-toast">
                    {toastMessage}
                </div>
            )}

            {/* Row 1: Link Control Bar & Visibility Pills */}
            <div className="journal-share-row-link">
                {/* Link URL Display */}
                <div className={`journal-share-input-wrap ${!isLinkActive ? 'inactive' : ''}`}>
                    <input 
                        type="text" 
                        readOnly 
                        value={isLinkActive ? shareUrl : ''} 
                        placeholder={isLinkActive ? '' : 'Link inactive • Click "Create link" to activate'}
                        className="journal-share-url-input"
                    />
                    <div className="journal-share-link-status-chip" title="Access mode: All who have the link can see">
                        <Globe size={11} color="var(--yolo-lime, #c8f72c)" />
                        <span>All who have the link can see</span>
                    </div>
                </div>

                {/* Create Link / Disable Link Toggle Button (directly to the left of Copy Link) */}
                {!isLinkActive ? (
                    <button 
                        type="button" 
                        className="journal-share-act-btn activate" 
                        onClick={handleActivateLink}
                        disabled={isProcessing}
                        title="Create and activate story link"
                    >
                        <Link size={13} />
                        <span>Create link</span>
                    </button>
                ) : (
                    <button 
                        type="button" 
                        className="journal-share-act-btn disable" 
                        onClick={handleDisableLink}
                        disabled={isProcessing}
                        title="Deactivate link immediately"
                    >
                        <Unlink size={13} />
                        <span>Disable link</span>
                    </button>
                )}

                {/* Copy Link Button */}
                <button 
                    type="button" 
                    className={`journal-share-btn-copy ${copied ? 'copied' : ''} ${!isLinkActive ? 'disabled' : ''}`}
                    onClick={handleCopyLink}
                    disabled={!isLinkActive || isProcessing}
                    title={isLinkActive ? 'Copy link to clipboard' : 'Activate link first to copy'}
                >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? 'Copied' : 'Copy Link'}</span>
                </button>

                {/* Inline 3-Tier Visibility Segmented Control */}
                <div className="journal-share-vis-pills">
                    <button 
                        type="button"
                        className={`journal-share-vis-pill ${visibility === 'private' ? 'active' : ''}`}
                        onClick={() => handleSelectVisibility('private')}
                        title="Private: only people with the link can watch"
                    >
                        <Lock size={11} />
                        <span>Private</span>
                    </button>
                    <button 
                        type="button"
                        className={`journal-share-vis-pill network ${visibility === 'network' ? 'active' : ''}`}
                        onClick={() => handleSelectVisibility('network')}
                        title="Network: visible on Home Page only to people in your network"
                    >
                        <Users size={11} />
                        <span>Network</span>
                    </button>
                    <button 
                        type="button"
                        className={`journal-share-vis-pill public ${visibility === 'public' ? 'active' : ''}`}
                        onClick={() => handleSelectVisibility('public')}
                        title="Public: visible on Home Page to all logged-in members"
                    >
                        <Globe size={11} />
                        <span>Public</span>
                    </button>
                </div>
            </div>

            {/* Row 2: Communicators / Messengers */}
            <div className="journal-share-row-apps">
                <span className="journal-share-row-label">Chat & Messaging</span>
                <div className="journal-share-icons-flex">
                    <button type="button" className="journal-share-app-pill whatsapp" onClick={handleShareWhatsApp} title="Share via WhatsApp">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.41a8.21 8.21 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.41-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.23.89 2.42 1.02 2.59.13.17 1.76 2.69 4.26 3.77.6.26 1.06.41 1.42.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.3"/>
                        </svg>
                        <span>WhatsApp</span>
                    </button>

                    <button type="button" className="journal-share-app-pill messenger" onClick={handleShareMessenger} title="Share via Messenger">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.2 5.54 3.23 7.37.17.15.27.37.28.61l.05 2.07c.02.66.69 1.1 1.29.85l2.36-.97c.18-.08.38-.08.57-.03.7.19 1.45.3 2.22.3 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm1.06 13.06-2.58-2.75-5.04 2.75 5.54-5.88 2.65 2.75 4.97-2.75-5.54 5.88z"/>
                        </svg>
                        <span>Messenger</span>
                    </button>

                    <button type="button" className="journal-share-app-pill telegram" onClick={handleShareTelegram} title="Share via Telegram">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.671c.459 0 .661-.21.917-.46l2.203-2.14 4.58 3.385c.844.464 1.452.225 1.662-.785l3.003-14.155c.307-1.233-.472-1.793-1.278-1.483z"/>
                        </svg>
                        <span>Telegram</span>
                    </button>

                    <button type="button" className="journal-share-app-pill email" onClick={handleShareEmail} title="Share via Email">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect width="20" height="16" x="2" y="4" rx="2"/>
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                        </svg>
                        <span>Email</span>
                    </button>

                    <button type="button" className="journal-share-app-pill more" onClick={handleShareMore} title="More sharing options">
                        <ExternalLink size={13} />
                        <span>More Apps</span>
                    </button>
                </div>
            </div>

            {/* Row 3: Publishing & Social Apps */}
            <div className="journal-share-row-apps">
                <span className="journal-share-row-label">Publish & Social</span>
                <div className="journal-share-icons-flex">
                    <button type="button" className="journal-share-app-pill facebook" onClick={handleShareFacebook} title="Share to Facebook">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        <span>Facebook</span>
                    </button>

                    <button type="button" className="journal-share-app-pill twitter" onClick={handleShareTwitter} title="Share to X / Twitter">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        <span>X / Twitter</span>
                    </button>

                    <button type="button" className="journal-share-app-pill youtube" onClick={handleShareYouTube} title="Share to YouTube">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        <span>YouTube</span>
                    </button>

                    <button type="button" className="journal-share-app-pill instagram" onClick={handleShareInstagram} title="Copy link for Instagram">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                        </svg>
                        <span>Instagram</span>
                    </button>

                    <button type="button" className="journal-share-app-pill linkedin" onClick={handleShareLinkedIn} title="Share to LinkedIn">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                        </svg>
                        <span>LinkedIn</span>
                    </button>
                </div>
            </div>

            {/* Confirmation Dialog for Network / Public Sharing */}
            {showConfirmModal && pendingVisibility && (
                <div className="journal-confirm-dialog-overlay" onClick={() => setShowConfirmModal(false)}>
                    <div className="journal-confirm-dialog-card" onClick={(e) => e.stopPropagation()}>
                        <div className="journal-confirm-dialog-icon">
                            <AlertTriangle size={24} color="#f59e0b" />
                        </div>
                        <h4 className="journal-confirm-dialog-title">
                            {pendingVisibility === 'network' ? 'Share with Network on Home Page?' : 'Publish Story to Home Page?'}
                        </h4>
                        <p className="journal-confirm-dialog-body">
                            {pendingVisibility === 'network'
                                ? 'Your daily story video compilation and description will appear in the Journal section on the Ideanite Home Page for members in your network circle.'
                                : 'Your daily story video compilation and description will be published to the Journal section on the Ideanite Home Page for all logged-in members.'}
                        </p>
                        <div className="journal-confirm-dialog-actions">
                            <button
                                type="button"
                                className="journal-confirm-dialog-btn cancel"
                                onClick={() => setShowConfirmModal(false)}
                                disabled={isProcessing}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={`journal-confirm-dialog-btn confirm ${pendingVisibility}`}
                                onClick={() => applyVisibilityChange(pendingVisibility)}
                                disabled={isProcessing}
                            >
                                {isProcessing ? 'Updating...' : 'Confirm & Share'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JournalShareCommandCenter;
