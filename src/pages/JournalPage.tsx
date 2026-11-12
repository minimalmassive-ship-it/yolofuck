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
import { supabase } from '../lib/supabase';
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
    Users
} from 'lucide-react';

import JournalStoryView from '../components/JournalStoryView';
import { JournalSharedGrid } from '../components/JournalSharedGrid';
import JournalVideoCaptureModal from '../components/JournalVideoCaptureModal';
import TrashBinModal from '../components/TrashBinModal';
import UserSettingsModal from '../components/UserSettingsModal';
import QuestPageModal from '../components/QuestPageModal';
import FriendsPageModal from '../components/FriendsPageModal';
import type { Project } from '../types';

import './JournalPage.css';
import '../styles/vizja-ui-system.css';

export const JournalPage: React.FC = () => {
    const { user, profile, loading: authLoading, signOut } = useAuth();

    const [activeTab, setActiveTab] = useState<'story' | 'shared'>('story');
    const [project, setProject] = useState<Project | null>(null);
    const [loadingProject, setLoadingProject] = useState(false);
    const [showCaptureModal, setShowCaptureModal] = useState(false);
    const [isPlayerActive, setIsPlayerActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Dropdown and modal states
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showTrashModal, setShowTrashModal] = useState(false);
    const [showUserSettingsModal, setShowUserSettingsModal] = useState(false);
    const [showQuestModal, setShowQuestModal] = useState(false);
    const [showFriendsModal, setShowFriendsModal] = useState(false);

    // Listen for video player state to hide bars in fullscreen story mode
    useEffect(() => {
        const handlePlayerState = (e: any) => {
            setIsPlayerActive(Boolean(e.detail?.isOpen));
        };
        window.addEventListener('journal_video_player_state', handlePlayerState);
        return () => window.removeEventListener('journal_video_player_state', handlePlayerState);
    }, []);

    // Fetch or bind the user's Journal project
    useEffect(() => {
        let isMounted = true;

        async function fetchJournalProject() {
            if (!user) return;

            try {
                let { data: proj } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('system_type', 'journal')
                    .maybeSingle();

                if (!proj) {
                    const { data: byName } = await supabase
                        .from('projects')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('name', 'Journal')
                        .maybeSingle();
                    proj = byName;
                }

                if (!proj) {
                    try {
                        const { data: newProj } = await supabase
                            .from('projects')
                            .insert({
                                name: 'Journal',
                                user_id: user.id,
                                color: '#10b981',
                                description: 'Personal daily video journal',
                                is_public: false,
                                is_system: true,
                                system_type: 'journal'
                            })
                            .select()
                            .single();
                        proj = newProj;
                    } catch {
                        // Project creation optional if offline
                    }
                }

                if (isMounted && proj) {
                    setProject(proj);
                }
            } catch (err) {
                console.warn('[JournalPage] Offline or local mode active:', err);
            }
        }

        fetchJournalProject();

        return () => {
            isMounted = false;
        };
    }, [user]);

    return (
        <div className="yolofuck-root">
            {/* Top Bar: Brand Logo on Left, Search Bar, Desktop Center Nav, Account Menu on Right */}
            <header className={`yolofuck-top-bar ${isPlayerActive ? 'hidden-player-active' : ''}`}>
                <div className="yolofuck-top-left-section">
                    <div className="yolofuck-top-brand-logo">
                        <img 
                            src="/yolofuck-logo.png" 
                            alt="YOLOFUCK" 
                            className="yolofuck-top-logo-img"
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
                        className={`yolofuck-desktop-nav-btn ${activeTab === 'story' ? 'active' : ''}`}
                        onClick={() => setActiveTab('story')}
                        title="Journal timeline"
                    >
                        <Layers size={16} />
                        <span>Journal</span>
                    </button>

                    <button 
                        type="button"
                        className={`yolofuck-desktop-nav-btn ${activeTab === 'shared' ? 'active' : ''}`}
                        onClick={() => setActiveTab('shared')}
                        title="Shared sequences"
                    >
                        <Share2 size={16} />
                        <span>Share</span>
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

            {/* Main Content Area */}
            <main className="yolofuck-content">
                {authLoading || loadingProject ? (
                    <div className="yolofuck-loading-wrap">
                        <Loader2 size={24} className="vizja-spin" color="#10b981" />
                        <span>Loading yolofuck journal...</span>
                    </div>
                ) : activeTab === 'story' ? (
                    <JournalStoryView 
                        projectId={project?.id || null} 
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onOpenRecord={() => setShowCaptureModal(true)}
                        onNavigateToShared={() => setActiveTab('shared')}
                    />
                ) : (
                    <JournalSharedGrid projectId={project?.id || null} />
                )}
            </main>

            {/* Bottom Dock Navigation Bar: Journal, Shared, Record */}
            {!isPlayerActive && (
                <nav className="yolofuck-bottom-nav">
                    <button 
                        type="button"
                        className={`yolofuck-bottom-nav-btn ${activeTab === 'story' ? 'active' : ''}`}
                        onClick={() => setActiveTab('story')}
                    >
                        <Layers size={19} />
                        <span>Journal</span>
                    </button>

                    <button 
                        type="button"
                        className={`yolofuck-bottom-nav-btn ${activeTab === 'shared' ? 'active' : ''}`}
                        onClick={() => setActiveTab('shared')}
                    >
                        <Share2 size={19} />
                        <span>Share</span>
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
                    projectId={project?.id || null}
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
        </div>
    );
};

export default JournalPage;
