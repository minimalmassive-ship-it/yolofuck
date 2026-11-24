/**
 * JournalPage.tsx — yolofuck
 *
 * Standalone Video Journal application.
 * Desktop top bar redesign:
 * - Brand logo + org/workspace breadcrumbs on the left.
 * - Icon-only action buttons (Journal, Share, Chat, Record) right-aligned.
 * - Collapsed search bar icon (circle) that animates-expands left.
 * - Avatar profile picture replaces username text; click opens dropdown.
 * - Search results overlay grid (transcript-based).
 * - Strictly NO purple/violet hues.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    Video,
    Share2,
    Layers,
    Search,
    X,
    Loader2,
    LogOut,
    User,
    ChevronDown,
    Settings,
    Trash2,
    Target,
    Users,
    MessageSquare,
    Building2,
    Check
} from 'lucide-react';

import JournalStoryView from '../components/JournalStoryView';
import { JournalSharedGrid } from '../components/JournalSharedGrid';
import JournalVideoCaptureModal from '../components/JournalVideoCaptureModal';
import TrashBinModal from '../components/TrashBinModal';
import UserSettingsModal from '../components/UserSettingsModal';
import QuestPageModal from '../components/QuestPageModal';
import FriendsPageModal from '../components/FriendsPageModal';
import PlasticinChatModal from '../components/PlasticinChatModal';
import OrganizationSettingsModal from '../components/OrganizationSettingsModal';
import {
    isSameOrgEntity,
    broadcastActiveOrgChange,
    subscribeToActiveOrgSync,
    fetchPlasticinTeams,
    PlatformPlasticinOrgId,
    sanitizeSafeUrl,
    type EcosystemWorkspaceItem,
} from '../lib/ecosystemOrgSync';

import './JournalPage.css';
import '../styles/vizja-ui-system.css';

export const JournalPage: React.FC = () => {
    const { user, profile, loading: authLoading, signOut, organizations, activeOrganization, setActiveOrganization } = useAuth();

    const [activeTab, setActiveTab] = useState<'story' | 'shared'>('story');
    const [showCaptureModal, setShowCaptureModal] = useState(false);
    const [isPlayerActive, setIsPlayerActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Desktop collapsed search bar state
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const desktopSearchInputRef = useRef<HTMLInputElement>(null);
    const desktopSearchWrapRef = useRef<HTMLDivElement>(null);

    // Dropdown and modal states
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showTrashModal, setShowTrashModal] = useState(false);
    const [showUserSettingsModal, setShowUserSettingsModal] = useState(false);
    const [showQuestModal, setShowQuestModal] = useState(false);
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [showChatModal, setShowChatModal] = useState(false);
    const [showOrgSettingsModal, setShowOrgSettingsModal] = useState(false);

    // Cross-Ecosystem Organization & Workspace State (Plasticin Parity)
    const [isOrgNavOpen, setIsOrgNavOpen] = useState(false);
    const [isWsNavOpen, setIsWsNavOpen] = useState(false);
    const [isMobileOrgNavOpen, setIsMobileOrgNavOpen] = useState(false);
    const [isMobileWsNavOpen, setIsMobileWsNavOpen] = useState(false);

    const effectiveOrgs = organizations || [];
    const currentActiveOrg = activeOrganization || effectiveOrgs[0] || null;

    const [currentWorkspaces, setCurrentWorkspaces] = useState<EcosystemWorkspaceItem[]>([]);
    const [activeWorkspace, setActiveWorkspace] = useState<EcosystemWorkspaceItem | null>(() => {
        if (typeof window !== 'undefined') {
            const savedId = localStorage.getItem('memcut_active_workspace_id');
            const savedName = localStorage.getItem('memcut_active_workspace_name');
            if (savedId && savedName) {
                return { id: savedId, name: savedName };
            }
        }
        return null;
    });

    // Load live workspaces from Plasticin Master Directory for the active organization
    useEffect(() => {
        if (!currentActiveOrg?.id) {
            setCurrentWorkspaces([]);
            return;
        }
        let cancelled = false;
        const ctrl = new AbortController();
        fetchPlasticinTeams(currentActiveOrg.id, ctrl.signal).then((teams) => {
            if (cancelled) return;
            setCurrentWorkspaces(teams);
            if (teams.length > 0) {
                const savedId = typeof window !== 'undefined' ? localStorage.getItem('memcut_active_workspace_id') : null;
                const savedName = typeof window !== 'undefined' ? localStorage.getItem('memcut_active_workspace_name') : null;
                const matched = teams.find((w) => w.id === savedId || w.name === savedName) || teams[0];
                setActiveWorkspace(matched);
                try {
                    localStorage.setItem('memcut_active_workspace_id', matched.id);
                    localStorage.setItem('memcut_active_workspace_name', matched.name);
                } catch {}
            } else {
                setActiveWorkspace(null);
            }
        });
        return () => {
            cancelled = true;
            ctrl.abort();
        };
    }, [currentActiveOrg?.id]);

    // Resolve avatar URL safely (prioritize live Plasticin OIDC picture)
    const avatarUrl: string | null =
        user?.user_metadata?.avatar_url ||
        user?.user_metadata?.picture ||
        profile?.avatar_url ||
        user?.user_metadata?.avatarUrl ||
        null;
    const displayName: string =
        profile?.display_name ||
        profile?.username ||
        user?.user_metadata?.username ||
        user?.user_metadata?.full_name ||
        'Account';
    const initials: string = displayName.replace(/^@+/, '').slice(0, 2).toUpperCase() || 'MC';

    const resolveOrgAvatarUrl = (org: typeof effectiveOrgs[0] | null | undefined): string | null => {
        if (!org) return null;
        const isPersonal = Boolean(org.isPersonal || org.is_personal || String(org.id).startsWith('org_user_'));
        const isPlatform = Boolean(org.isPlatformOwned || org.id === PlatformPlasticinOrgId);
        const raw = isPersonal
            ? (avatarUrl || org.avatarUrl || null)
            : isPlatform
                ? (org.avatarUrl || 'https://plasticin.com/assets/plasticin_icon.png')
                : (org.avatarUrl || null);
        return sanitizeSafeUrl(raw, true);
    };

    const resolveWorkspaceAvatarUrl = (ws: EcosystemWorkspaceItem): string | null => {
        const isMgmt = Boolean(
            ws.isManagement ||
            (currentActiveOrg?.name && ws.name.trim().toLowerCase() === currentActiveOrg.name.trim().toLowerCase())
        );
        if (isMgmt) return resolveOrgAvatarUrl(currentActiveOrg);
        return sanitizeSafeUrl(ws.avatarUrl || null, true) || resolveOrgAvatarUrl(currentActiveOrg);
    };

    // Cross-App Realtime Organization Synchronization
    useEffect(() => {
        const unsubscribe = subscribeToActiveOrgSync('memcut', (payload) => {
            const match = effectiveOrgs.find(
                (o) => isSameOrgEntity(o.id, payload.id) || o.name.toLowerCase() === payload.name.toLowerCase()
            );
            if (match) {
                setActiveOrganization(match);
            }
        });
        return unsubscribe;
    }, [effectiveOrgs, setActiveOrganization]);

    const handleSelectOrg = (org: typeof effectiveOrgs[0]) => {
        setActiveOrganization(org);
        setIsOrgNavOpen(false);
        setIsMobileOrgNavOpen(false);
        broadcastActiveOrgChange({
            id: org.id,
            name: org.name,
            is_personal: Boolean(org.isPersonal || org.is_personal || String(org.id).startsWith('org_user_')),
            sourceApp: 'memcut',
        });
    };

    const handleSelectWorkspace = (ws: EcosystemWorkspaceItem) => {
        setActiveWorkspace(ws);
        setIsWsNavOpen(false);
        setIsMobileWsNavOpen(false);
        if (typeof window !== 'undefined') {
            localStorage.setItem('memcut_active_workspace_id', ws.id);
            localStorage.setItem('memcut_active_workspace_name', ws.name);
        }
    };

    // Desktop search: expand on icon click, collapse on outside click or submit
    const handleDesktopSearchIconClick = useCallback(() => {
        if (!isSearchExpanded) {
            setIsSearchExpanded(true);
            setTimeout(() => desktopSearchInputRef.current?.focus(), 50);
        } else {
            // Collapse (search with current query or clear)
            setIsSearchExpanded(false);
        }
    }, [isSearchExpanded]);

    const handleDesktopSearchSubmit = useCallback(() => {
        // Keep query, collapse bar — results are shown in JournalStoryView
        setIsSearchExpanded(false);
    }, []);

    const handleDesktopSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleDesktopSearchSubmit();
        } else if (e.key === 'Escape') {
            setSearchQuery('');
            setIsSearchExpanded(false);
        }
    }, [handleDesktopSearchSubmit]);

    // Close menus and search on click outside
    useEffect(() => {
        const handleOutside = (e: PointerEvent) => {
            // Close org/workspace dropdowns
            setIsOrgNavOpen(false);
            setIsWsNavOpen(false);
            setIsMobileOrgNavOpen(false);
            setIsMobileWsNavOpen(false);

            // Close desktop search if click is outside search wrap
            if (desktopSearchWrapRef.current && !desktopSearchWrapRef.current.contains(e.target as Node)) {
                setIsSearchExpanded(false);
            }
        };
        document.addEventListener('pointerdown', handleOutside);
        return () => document.removeEventListener('pointerdown', handleOutside);
    }, []);

    // Listen for video player state to hide bars in fullscreen story mode
    useEffect(() => {
        const handlePlayerState = (e: any) => {
            setIsPlayerActive(Boolean(e.detail?.isOpen));
        };
        window.addEventListener('journal_video_player_state', handlePlayerState);
        return () => window.removeEventListener('journal_video_player_state', handlePlayerState);
    }, []);

    return (
        <div className="yolofuck-root">
            {/* Top Bar */}
            <header className={`yolofuck-top-bar ${isPlayerActive ? 'hidden-player-active' : ''}`}>

                {/* ── LEFT SECTION: Brand + Org/Workspace Crumbs ── */}
                <div className="yolofuck-top-left-section memcut-top-left-section">
                    <div className="memcut-top-brand yolofuck-top-brand-logo">
                        <img
                            src="/memcut-glyph.png"
                            alt="Memcut"
                            className="memcut-top-glyph-img memcut-top-cube-img"
                        />
                        <img
                            src="/memcut-wordmark.png"
                            alt="Memcut"
                            className="memcut-top-wordmark-img"
                        />
                    </div>

                    {/* Desktop Org / Workspace Breadcrumbs — inline after wordmark */}
                    <div
                        className="yolofuck-crumbs-wrap"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Organization Dropdown */}
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className="yolofuck-crumb-btn"
                                onClick={() => {
                                    setIsWsNavOpen(false);
                                    setIsOrgNavOpen(!isOrgNavOpen);
                                }}
                                title="Active Organization"
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {currentActiveOrg?.name || 'Personal'}
                                </span>
                                <ChevronDown size={12} className={`yolofuck-chevron ${isOrgNavOpen ? 'open' : ''}`} />
                            </button>

                            {isOrgNavOpen && (
                                <div className="yolofuck-crumb-dropdown">
                                    <div className="yolofuck-crumb-dropdown-header">Organizations</div>
                                    {effectiveOrgs.map((org) => {
                                        const isActive = isSameOrgEntity(currentActiveOrg?.id, org.id);
                                        const orgAvatar = resolveOrgAvatarUrl(org);
                                        return (
                                            <button
                                                key={org.id}
                                                type="button"
                                                className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                                onClick={() => handleSelectOrg(org)}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                    {orgAvatar ? (
                                                        <img src={orgAvatar} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                                    ) : (
                                                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#21201d', color: '#efede3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                                                            {(org.name || 'O').charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {org.name}
                                                    </span>
                                                </span>
                                                {isActive && <Check size={12} color="#c8f931" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <span style={{ opacity: 0.4, fontFamily: 'monospace' }}>/</span>

                        {/* Workspace Dropdown */}
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className="yolofuck-crumb-btn"
                                onClick={() => {
                                    setIsOrgNavOpen(false);
                                    setIsWsNavOpen(!isWsNavOpen);
                                }}
                                title="Active Workspace"
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {activeWorkspace?.name || currentActiveOrg?.name || 'Workspace'}
                                </span>
                                <ChevronDown size={12} className={`yolofuck-chevron ${isWsNavOpen ? 'open' : ''}`} />
                            </button>

                            {isWsNavOpen && (
                                <div className="yolofuck-crumb-dropdown">
                                    <div className="yolofuck-crumb-dropdown-header">
                                        {currentActiveOrg?.name || 'Workspaces'}
                                    </div>
                                    {currentWorkspaces.map((ws) => {
                                        const isActive = ws.id === activeWorkspace?.id;
                                        const wsAvatar = resolveWorkspaceAvatarUrl(ws);
                                        return (
                                            <button
                                                key={ws.id}
                                                type="button"
                                                className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                                onClick={() => handleSelectWorkspace(ws)}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                    {wsAvatar ? (
                                                        <img src={wsAvatar} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                                    ) : (
                                                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#21201d', color: '#efede3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                                                            {(ws.name || 'W').charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {ws.name}
                                                    </span>
                                                </span>
                                                {isActive && <Check size={12} color="#c8f931" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile search pill (visible only on mobile) */}
                    <div className="yolofuck-search-pill yolofuck-mobile-search-pill">
                        <Search size={15} color="var(--yolo-lime, #c8f72c)" />
                        <input
                            type="text"
                            className="yolofuck-search-input"
                            placeholder="Search spoken words..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                className="yolofuck-search-clear"
                                onClick={() => setSearchQuery('')}
                                title="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── RIGHT SECTION: Desktop icon actions + collapsed search + avatar ── */}
                <div className="yolofuck-top-right-section">

                    {/* Desktop Icon-Only Action Buttons */}
                    <div className={`yolofuck-desktop-icon-actions ${isSearchExpanded ? 'search-expanded' : ''}`}>
                        <button
                            type="button"
                            className={`yolofuck-icon-btn ${activeTab === 'story' && !showChatModal ? 'active' : ''}`}
                            onClick={() => { setShowChatModal(false); setActiveTab('story'); }}
                            title="Journal timeline"
                        >
                            <Layers size={17} />
                        </button>

                        <button
                            type="button"
                            className={`yolofuck-icon-btn ${activeTab === 'shared' && !showChatModal ? 'active' : ''}`}
                            onClick={() => { setShowChatModal(false); setActiveTab('shared'); }}
                            title="Shared sequences"
                        >
                            <Share2 size={17} />
                        </button>

                        <button
                            type="button"
                            className={`yolofuck-icon-btn ${showChatModal ? 'active' : ''}`}
                            onClick={() => setShowChatModal(prev => !prev)}
                            title="Plasticin ecosystem chat"
                        >
                            <MessageSquare size={17} />
                        </button>

                        <button
                            type="button"
                            className="yolofuck-icon-btn yolofuck-icon-btn--record"
                            onClick={() => setShowCaptureModal(true)}
                            title="Record new take"
                        >
                            <span className="yolofuck-rec-dot" />
                            <Video size={17} />
                        </button>
                    </div>

                    {/* Desktop Collapsed Search Bar */}
                    <div
                        ref={desktopSearchWrapRef}
                        className={`yolofuck-desktop-search-wrap ${isSearchExpanded ? 'expanded' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {isSearchExpanded && (
                            <input
                                ref={desktopSearchInputRef}
                                type="text"
                                className="yolofuck-desktop-search-input"
                                placeholder="Search spoken words..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleDesktopSearchKeyDown}
                            />
                        )}
                        <button
                            type="button"
                            className={`yolofuck-search-icon-btn ${isSearchExpanded ? 'active' : ''}`}
                            onClick={handleDesktopSearchIconClick}
                            title={isSearchExpanded ? 'Search / collapse' : 'Open search'}
                        >
                            {isSearchExpanded && searchQuery ? (
                                <Search size={15} />
                            ) : isSearchExpanded ? (
                                <X size={15} />
                            ) : (
                                <Search size={15} />
                            )}
                        </button>
                    </div>

                    {/* Avatar User Menu */}
                    {user && (
                        <div className="yolofuck-top-user-wrap">
                            <button
                                type="button"
                                className={`yolofuck-top-avatar-btn ${showUserMenu ? 'active' : ''}`}
                                onClick={() => setShowUserMenu(prev => !prev)}
                                title={displayName}
                            >
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt={displayName}
                                        className="yolofuck-avatar-img"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                            const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                                            if (next) {
                                                next.style.display = 'flex';
                                            }
                                        }}
                                    />
                                ) : null}
                                <span
                                    className="yolofuck-avatar-initials"
                                    style={avatarUrl ? { display: 'none' } : { display: 'flex' }}
                                >
                                    {initials}
                                </span>
                            </button>

                            {showUserMenu && (
                                <div className="yolofuck-user-dropdown-menu">
                                    <button
                                        type="button"
                                        className="yolofuck-user-menu-item"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            setShowOrgSettingsModal(true);
                                        }}
                                    >
                                        <Building2 size={14} color="#C8F931" />
                                        <span>Organization Settings</span>
                                    </button>

                                    {organizations.length > 0 && (
                                        <div style={{ padding: '6px 8px', borderTop: '1px solid #21262d', borderBottom: '1px solid #21262d', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#78716c', padding: '0 4px' }}>
                                                Organization
                                            </span>
                                            {organizations.map((org) => {
                                                const isActive = activeOrganization ? isSameOrgEntity(activeOrganization.id, org.id) : false;
                                                return (
                                                    <button
                                                        key={org.id}
                                                        type="button"
                                                        className="yolofuck-user-menu-item"
                                                        style={{
                                                            padding: '6px 8px',
                                                            background: isActive ? 'rgba(200, 249, 49, 0.12)' : 'transparent',
                                                            color: isActive ? '#C8F931' : '#cbd5e1',
                                                            justifyContent: 'space-between',
                                                        }}
                                                        onClick={() => {
                                                            handleSelectOrg(org);
                                                            setShowUserMenu(false);
                                                        }}
                                                    >
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                                                            {org.name}
                                                        </span>
                                                        {isActive && <Check size={12} style={{ flexShrink: 0 }} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        className="yolofuck-user-menu-item"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            setShowUserSettingsModal(true);
                                        }}
                                    >
                                        <Settings size={14} color="#cbd5e1" />
                                        <span>Settings</span>
                                    </button>

                                    <button
                                        type="button"
                                        className="yolofuck-user-menu-item"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            setShowTrashModal(true);
                                        }}
                                    >
                                        <Trash2 size={14} color="#f87171" />
                                        <span>Trash Bin</span>
                                    </button>

                                    <button
                                        type="button"
                                        className="yolofuck-user-menu-item"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            setShowQuestModal(true);
                                        }}
                                    >
                                        <Target size={14} color="var(--yolo-lime, #c8f72c)" />
                                        <span>Quests</span>
                                    </button>

                                    <button
                                        type="button"
                                        className="yolofuck-user-menu-item"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            setShowFriendsModal(true);
                                        }}
                                    >
                                        <Users size={14} color="#60a5fa" />
                                        <span>Friends</span>
                                    </button>

                                    <div className="yolofuck-user-menu-divider" />

                                    <button
                                        type="button"
                                        className="yolofuck-user-menu-item logout"
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            signOut();
                                        }}
                                    >
                                        <LogOut size={14} color="#f87171" />
                                        <span>Log out</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Mobile Row 2: Organization / Workspace 50/50 Split */}
            <div 
                className={`yolofuck-mobile-row2 ${isPlayerActive ? 'hidden-player-active' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left: Organization Dropdown */}
                <div className="yolofuck-mobile-col">
                    <button
                        type="button"
                        className="yolofuck-crumb-btn"
                        style={{ width: '100%', justifyContent: 'space-between', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '4px 8px', maxWidth: '100%' }}
                        onClick={() => {
                            setIsMobileWsNavOpen(false);
                            setIsMobileOrgNavOpen(!isMobileOrgNavOpen);
                        }}
                    >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {currentActiveOrg?.name || 'Personal'}
                        </span>
                        <ChevronDown size={12} className={`yolofuck-chevron ${isMobileOrgNavOpen ? 'open' : ''}`} />
                    </button>

                    {isMobileOrgNavOpen && (
                        <div className="yolofuck-crumb-dropdown" style={{ left: 0, right: 'auto' }}>
                            <div className="yolofuck-crumb-dropdown-header">Organizations</div>
                            {effectiveOrgs.map((org) => {
                                const isActive = isSameOrgEntity(currentActiveOrg?.id, org.id);
                                const orgAvatar = resolveOrgAvatarUrl(org);
                                return (
                                    <button
                                        key={org.id}
                                        type="button"
                                        className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                        onClick={() => handleSelectOrg(org)}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                            {orgAvatar ? (
                                                <img src={orgAvatar} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#21201d', color: '#efede3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                                                    {(org.name || 'O').charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {org.name}
                                            </span>
                                        </span>
                                        {isActive && <Check size={12} color="#c8f931" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right: Workspace Dropdown */}
                <div className="yolofuck-mobile-col">
                    <button
                        type="button"
                        className="yolofuck-crumb-btn"
                        style={{ width: '100%', justifyContent: 'space-between', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '4px 8px', maxWidth: '100%' }}
                        onClick={() => {
                            setIsMobileOrgNavOpen(false);
                            setIsMobileWsNavOpen(!isMobileWsNavOpen);
                        }}
                    >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {activeWorkspace?.name || currentActiveOrg?.name || 'Workspace'}
                        </span>
                        <ChevronDown size={12} className={`yolofuck-chevron ${isMobileWsNavOpen ? 'open' : ''}`} />
                    </button>

                    {isMobileWsNavOpen && (
                        <div className="yolofuck-crumb-dropdown" style={{ right: 0, left: 'auto' }}>
                            <div className="yolofuck-crumb-dropdown-header">{currentActiveOrg?.name || 'Workspaces'}</div>
                            {currentWorkspaces.map((ws) => {
                                const isActive = ws.id === activeWorkspace?.id;
                                const wsAvatar = resolveWorkspaceAvatarUrl(ws);
                                return (
                                    <button
                                        key={ws.id}
                                        type="button"
                                        className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                        onClick={() => handleSelectWorkspace(ws)}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                            {wsAvatar ? (
                                                <img src={wsAvatar} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#21201d', color: '#efede3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                                                    {(ws.name || 'W').charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {ws.name}
                                            </span>
                                        </span>
                                        {isActive && <Check size={12} color="#c8f931" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <main className="yolofuck-content">
                {authLoading ? (
                    <div className="yolofuck-loading-wrap">
                        <Loader2 size={24} className="vizja-spin" color="#10b981" />
                        <span>Loading Memcut journal...</span>
                    </div>
                ) : activeTab === 'story' ? (
                    <JournalStoryView 
                        projectId={null} 
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onOpenRecord={() => setShowCaptureModal(true)}
                        onNavigateToShared={() => setActiveTab('shared')}
                    />
                ) : (
                    <JournalSharedGrid />
                )}
            </main>

            {/* Bottom Dock Navigation Bar: Journal, Shared, Record */}
            {!isPlayerActive && (
                <nav className="yolofuck-bottom-nav">
                    <button 
                        type="button"
                        className={`yolofuck-bottom-nav-btn ${activeTab === 'story' && !showChatModal ? 'active' : ''}`}
                        onClick={() => {
                            setShowChatModal(false);
                            setActiveTab('story');
                        }}
                    >
                        <Layers size={19} />
                        <span>Journal</span>
                    </button>

                    <button 
                        type="button"
                        className={`yolofuck-bottom-nav-btn ${activeTab === 'shared' && !showChatModal ? 'active' : ''}`}
                        onClick={() => {
                            setShowChatModal(false);
                            setActiveTab('shared');
                        }}
                    >
                        <Share2 size={19} />
                        <span>Share</span>
                    </button>

                    <button 
                        type="button"
                        className={`yolofuck-bottom-nav-btn ${showChatModal ? 'active' : ''}`}
                        onClick={() => setShowChatModal(prev => !prev)}
                        title="Plasticin Ecosystem Chat"
                    >
                        <MessageSquare size={19} />
                        <span>Chat</span>
                    </button>

                    <button 
                        type="button"
                        className="yolofuck-bottom-record-btn"
                        onClick={() => setShowCaptureModal(true)}
                        title="Record Take"
                    >
                        <span className="yolofuck-rec-dot" />
                        <Video size={19} />
                        <span>Record</span>
                    </button>
                </nav>
            )}

            {/* Video Capture Modal */}
            {showCaptureModal && (
                <JournalVideoCaptureModal 
                    onClose={() => setShowCaptureModal(false)}
                    projectId={null}
                    onClipSaved={() => {
                        setShowCaptureModal(false);
                    }}
                />
            )}

            {/* Trash Bin Modal */}
            {showTrashModal && (
                <TrashBinModal onClose={() => setShowTrashModal(false)} />
            )}

            {/* User Settings Modal */}
            {showUserSettingsModal && (
                <UserSettingsModal onClose={() => setShowUserSettingsModal(false)} />
            )}

            {/* Quest Page Modal */}
            {showQuestModal && (
                <QuestPageModal onClose={() => setShowQuestModal(false)} />
            )}

            {/* Friends Page Modal */}
            {showFriendsModal && (
                <FriendsPageModal onClose={() => setShowFriendsModal(false)} />
            )}

            {/* Plasticin Ecosystem Chat Modal (Fullscreen) */}
            <PlasticinChatModal 
                isOpen={showChatModal} 
                onClose={() => setShowChatModal(false)} 
                onOpenOrgSettings={() => setShowOrgSettingsModal(true)}
            />

            {/* Organization Settings Modal */}
            <OrganizationSettingsModal
                isOpen={showOrgSettingsModal}
                onClose={() => setShowOrgSettingsModal(false)}
            />
        </div>
    );
};

export default JournalPage;
