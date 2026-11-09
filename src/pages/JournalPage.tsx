/**
 * JournalPage.tsx — yolofuck
 * 
 * Standalone Video Journal application.
 * Frictionless instant access: no login barriers.
 * Daily video timeline compiler, TikTok-style playback, live audio transcription,
 * and community shared stories in a Neumorphic Dark interface.
 * Strictly NO purple/violet colors.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
    Video, 
    Share2, 
    Layers, 
    Loader2
} from 'lucide-react';

import JournalStoryView from '../components/JournalStoryView';
import { JournalSharedGrid } from '../components/JournalSharedGrid';
import JournalVideoCaptureModal from '../components/JournalVideoCaptureModal';
import { MobileJournalButton } from '../components/MobileJournalButton';
import type { Project } from '../types';

import './JournalPage.css';
import '../styles/vizja-ui-system.css';

export const JournalPage: React.FC = () => {
    const { user, loading: authLoading } = useAuth();

    const [activeTab, setActiveTab] = useState<'story' | 'shared'>('story');
    const [project, setProject] = useState<Project | null>(null);
    const [loadingProject, setLoadingProject] = useState(false);
    const [showCaptureModal, setShowCaptureModal] = useState(false);
    const [isPlayerActive, setIsPlayerActive] = useState(false);

    // 1. Listen for video player state to hide header in fullscreen story mode
    useEffect(() => {
        const handlePlayerState = (e: any) => {
            setIsPlayerActive(Boolean(e.detail?.isOpen));
        };
        window.addEventListener('journal_video_player_state', handlePlayerState);
        return () => window.removeEventListener('journal_video_player_state', handlePlayerState);
    }, []);

    // 2. Fetch or bind the user's Journal project
    useEffect(() => {
        let isMounted = true;

        async function fetchJournalProject() {
            if (!user) return;

            try {
                // Look for project with system_type = 'journal'
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
            {/* Top Navigation Bar */}
            <header className={`yolofuck-header ${isPlayerActive ? 'hidden-player-active' : ''}`}>
                <div className="yolofuck-brand" onClick={() => setActiveTab('story')}>
                    <div className="yolofuck-logo-badge">
                        <Video size={20} color="#10b981" />
                    </div>
                    <div className="yolofuck-title-group">
                        <span className="yolofuck-title">yolofuck</span>
                        <span className="yolofuck-subtitle">Daily Journal</span>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="yolofuck-nav-tabs">
                    <button 
                        className={`yolofuck-tab-button ${activeTab === 'story' ? 'active' : ''}`}
                        onClick={() => setActiveTab('story')}
                    >
                        <Layers size={16} />
                        <span>My Story</span>
                    </button>
                    <button 
                        className={`yolofuck-tab-button ${activeTab === 'shared' ? 'active' : ''}`}
                        onClick={() => setActiveTab('shared')}
                    >
                        <Share2 size={16} />
                        <span>Shared Stories</span>
                    </button>
                </div>

                {/* Right Action Buttons */}
                <div className="yolofuck-actions">
                    <div className="yolofuck-status-badge">
                        <span className="yolofuck-status-dot" />
                        <span>Online</span>
                    </div>

                    <button 
                        className="yolofuck-record-cta"
                        onClick={() => setShowCaptureModal(true)}
                        title="Record new video clip"
                    >
                        <span className="yolofuck-rec-pulse" />
                        <Video size={16} />
                        <span>Record Clip</span>
                    </button>
                </div>
            </header>

            {/* Main Content Area — Instant Access */}
            <main className="yolofuck-content">
                {authLoading || loadingProject ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', color: '#94a3b8' }}>
                        <Loader2 size={24} className="vizja-spin" color="#10b981" />
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>Loading yolofuck journal...</span>
                    </div>
                ) : activeTab === 'story' ? (
                    <JournalStoryView projectId={project?.id || null} />
                ) : (
                    <JournalSharedGrid projectId={project?.id || null} />
                )}
            </main>

            {/* Floating Mobile Record Button */}
            {!isPlayerActive && (
                <div className="yolofuck-mobile-fab">
                    <MobileJournalButton onClick={() => setShowCaptureModal(true)} />
                </div>
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
