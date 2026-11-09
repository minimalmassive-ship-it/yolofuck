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
    LogOut
} from 'lucide-react';

import JournalStoryView from '../components/JournalStoryView';
import { JournalSharedGrid } from '../components/JournalSharedGrid';
import JournalVideoCaptureModal from '../components/JournalVideoCaptureModal';
import type { Project } from '../types';

import './JournalPage.css';
import '../styles/vizja-ui-system.css';

export const JournalPage: React.FC = () => {
    const { user, loading: authLoading, signOut } = useAuth();

    const [activeTab, setActiveTab] = useState<'story' | 'shared'>('story');
    const [project, setProject] = useState<Project | null>(null);
    const [loadingProject, setLoadingProject] = useState(false);
    const [showCaptureModal, setShowCaptureModal] = useState(false);
    const [isPlayerActive, setIsPlayerActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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
            {/* Top Bar: Search Bar Only */}
            <header className={`yolofuck-top-bar ${isPlayerActive ? 'hidden-player-active' : ''}`}>
                <div className="yolofuck-search-pill">
                    <Search size={16} color="#10b981" />
                    <input 
                        type="text" 
                        className="yolofuck-search-input"
                        placeholder="Search spoken words in videos..."
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

                {user && (
                    <button
                        type="button"
                        className="yolofuck-top-signout-btn"
                        onClick={() => signOut()}
                        title="Sign out of yolofuck"
                    >
                        <LogOut size={14} />
                        <span>Sign out</span>
                    </button>
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
                        <span>Shared</span>
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
        </div>
    );
};

export default JournalPage;
