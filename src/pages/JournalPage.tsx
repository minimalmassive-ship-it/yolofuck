/**
 * JournalPage.tsx — yolofuck
 * 
 * Standalone Video Journal application:
 * - Top bar: Clean full-width search bar only (no brand logos, no status badges).
 * - Bottom bar: Fixed 3-button dock with [Journal] on left, [Shared] in center, [Record] on right.
 * - Neumorphic dark styling with neon emerald (#10b981).
 * - Strictly NO purple/violet hues.
 */

import React, { useState, useEffect } from 'react';
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
    CanonicalEcosystemOrgs,
    DefaultWorkspacesByOrg,
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

    const effectiveOrgs = organizations && organizations.length > 0 ? organizations : CanonicalEcosystemOrgs;
    const currentActiveOrg = activeOrganization || effectiveOrgs[0];

    const currentWorkspaces = (currentActiveOrg?.id && DefaultWorkspacesByOrg[currentActiveOrg.id]) || [
        { id: 'ws_default', name: 'Yolo' }
    ];
    const [activeWorkspace, setActiveWorkspace] = useState<EcosystemWorkspaceItem>(() => {
        if (typeof window !== 'undefined') {
            const savedWs = localStorage.getItem('memcut_active_workspace_name');
            const found = currentWorkspaces.find(w => w.name === savedWs);
            if (found) return found;
        }
        return currentWorkspaces[0];
    });

    // Cross-App Realtime Organization Synchronization
    useEffect(() => {
        const unsubscribe = subscribeToActiveOrgSync('memcut', (payload) => {
            const match = effectiveOrgs.find(
                (o) => isSameOrgEntity(o.id, payload.id) || o.name.toLowerCase() === payload.name.toLowerCase()
            );
            if (match) {
                setActiveOrganization(match);
                const wsList = DefaultWorkspacesByOrg[match.id] || [];
                if (wsList.length > 0) {
                    setActiveWorkspace(wsList[0]);
                }
            }
        });
        return unsubscribe;
    }, [effectiveOrgs, setActiveOrganization]);

    const handleSelectOrg = (org: typeof effectiveOrgs[0]) => {
        setActiveOrganization(org);
        setIsOrgNavOpen(false);
        setIsMobileOrgNavOpen(false);
        const wsList = DefaultWorkspacesByOrg[org.id] || [];
        if (wsList.length > 0) {
            setActiveWorkspace(wsList[0]);
            if (typeof window !== 'undefined') {
                localStorage.setItem('memcut_active_workspace_id', wsList[0].id);
                localStorage.setItem('memcut_active_workspace_name', wsList[0].name);
            }
        }
        broadcastActiveOrgChange({
            id: org.id,
            name: org.name,
            is_personal: (org as { is_personal?: boolean }).is_personal,
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

    // Close crumbs dropdown on click outside
    useEffect(() => {
        const handleOutside = () => {
            setIsOrgNavOpen(false);
            setIsWsNavOpen(false);
            setIsMobileOrgNavOpen(false);
            setIsMobileWsNavOpen(false);
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
            {/* Top Bar: Brand Logo on Left, Search Bar, Desktop Center Nav, Account Menu on Right */}
            <header className={`yolofuck-top-bar ${isPlayerActive ? 'hidden-player-active' : ''}`}>
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

                    <div className="yolofuck-search-pill">
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

                {/* Desktop Central Navigation: Journal, Share, Record */}
                <nav className="yolofuck-desktop-center-nav">
                    <button 
                        type="button"
                        className={`yolofuck-desktop-nav-btn ${activeTab === 'story' && !showChatModal ? 'active' : ''}`}
                        onClick={() => {
                            setShowChatModal(false);
                            setActiveTab('story');
                        }}
                        title="Journal timeline"
                    >
                        <Layers size={16} />
                        <span>Journal</span>
                    </button>

                    <button 
                        type="button"
                        className={`yolofuck-desktop-nav-btn ${activeTab === 'shared' && !showChatModal ? 'active' : ''}`}
                        onClick={() => {
                            setShowChatModal(false);
                            setActiveTab('shared');
                        }}
                        title="Shared sequences"
                    >
                        <Share2 size={16} />
                        <span>Share</span>
                    </button>

                    <button 
                        type="button"
                        className={`yolofuck-desktop-nav-btn ${showChatModal ? 'active' : ''}`}
                        onClick={() => setShowChatModal(prev => !prev)}
                        title="Plasticin ecosystem chat"
                    >
                        <MessageSquare size={16} />
                        <span>Chat</span>
                    </button>

                    <button 
                        type="button"
                        className="yolofuck-desktop-record-btn"
                        onClick={() => setShowCaptureModal(true)}
                        title="Record new take"
                    >
                        <span className="yolofuck-rec-dot" />
                        <Video size={16} />
                        <span>Record</span>
                    </button>
                </nav>

                {/* Desktop Organization / Workspace Breadcrumbs */}
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
                                <div className="yolofuck-crumb-dropdown-header">
                                    Organizations
                                </div>
                                {effectiveOrgs.map((org) => {
                                    const isActive = isSameOrgEntity(currentActiveOrg?.id, org.id);
                                    return (
                                        <button
                                            key={org.id}
                                            type="button"
                                            className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                            onClick={() => handleSelectOrg(org)}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {org.name}
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
                                {activeWorkspace?.name || 'Yolo'}
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
                                    return (
                                        <button
                                            key={ws.id}
                                            type="button"
                                            className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                            onClick={() => handleSelectWorkspace(ws)}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {ws.name}
                                            </span>
                                            {isActive && <Check size={12} color="#c8f931" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* User Dropdown Menu Button (Mobile & Desktop) */}
                {user && (
                    <div className="yolofuck-top-user-wrap">
                        <button
                            type="button"
                            className={`yolofuck-top-user-btn ${showUserMenu ? 'active' : ''}`}
                            onClick={() => setShowUserMenu(prev => !prev)}
                            title="Account Menu"
                        >
                            <span className="yolofuck-top-username">
                                {profile?.username || user?.user_metadata?.username || 'Account'}
                            </span>
                            <ChevronDown size={14} className={`yolofuck-chevron ${showUserMenu ? 'open' : ''}`} />
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
                                return (
                                    <button
                                        key={org.id}
                                        type="button"
                                        className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                        onClick={() => handleSelectOrg(org)}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {org.name}
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
                            {activeWorkspace?.name || 'Yolo'}
                        </span>
                        <ChevronDown size={12} className={`yolofuck-chevron ${isMobileWsNavOpen ? 'open' : ''}`} />
                    </button>

                    {isMobileWsNavOpen && (
                        <div className="yolofuck-crumb-dropdown" style={{ right: 0, left: 'auto' }}>
                            <div className="yolofuck-crumb-dropdown-header">{currentActiveOrg?.name || 'Workspaces'}</div>
                            {currentWorkspaces.map((ws) => {
                                const isActive = ws.id === activeWorkspace?.id;
                                return (
                                    <button
                                        key={ws.id}
                                        type="button"
                                        className={`yolofuck-crumb-item ${isActive ? 'active' : ''}`}
                                        onClick={() => handleSelectWorkspace(ws)}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {ws.name}
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
