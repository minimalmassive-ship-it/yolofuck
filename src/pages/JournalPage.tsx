/**
 * JournalPage.tsx — yolofuck
 * 
 * Standalone Video Journal application.
 * Daily video timeline compiler, TikTok-style playback, live audio transcription,
 * and community shared stories in a Neumorphic Dark interface.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
    Video, 
    Share2, 
    Layers, 
    Plus, 
    LogOut, 
    LogIn, 
    Loader2, 
    Sparkles, 
    ShieldAlert
} from 'lucide-react';

import JournalStoryView from '../components/JournalStoryView';
import { JournalSharedGrid } from '../components/JournalSharedGrid';
import JournalVideoCaptureModal from '../components/JournalVideoCaptureModal';
import { MobileJournalButton } from '../components/MobileJournalButton';
import type { Project } from '../types';

import './JournalPage.css';
import '../styles/vizja-ui-system.css';

export const JournalPage: React.FC = () => {
    const { user, profile, loading: authLoading, signOut } = useAuth();

    const [activeTab, setActiveTab] = useState<'story' | 'shared'>('story');
    const [project, setProject] = useState<Project | null>(null);
    const [loadingProject, setLoadingProject] = useState(true);
    const [showCaptureModal, setShowCaptureModal] = useState(false);
    const [isPlayerActive, setIsPlayerActive] = useState(false);

    // Auth modal state for non-logged-in users
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
    const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
    const [authError, setAuthError] = useState<string | null>(null);

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
            if (!user) {
                if (isMounted) {
                    setProject(null);
                    setLoadingProject(false);
                }
                return;
            }

            try {
                if (isMounted) setLoadingProject(true);

                // Look for project with system_type = 'journal'
                let { data: proj, error } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('system_type', 'journal')
                    .maybeSingle();

                if (!proj) {
                    // Fallback to name 'Journal'
                    const { data: byName } = await supabase
                        .from('projects')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('name', 'Journal')
                        .maybeSingle();
                    proj = byName;
                }

                if (!proj && !error) {
                    // Create Journal project if not found
                    const { data: newProj } = await supabase
                        .from('projects')
                        .insert({
                            name: 'Journal',
                            user_id: user.id,
                            color: '#ec4899',
                            description: 'Personal daily video journal',
                            is_public: false,
                            is_system: true,
                            system_type: 'journal'
                        })
                        .select()
                        .single();
                    proj = newProj;
                }

                if (isMounted) {
                    setProject(proj || null);
                }
            } catch (err) {
                console.error('[JournalPage] Failed to load Journal project:', err);
            } finally {
                if (isMounted) setLoadingProject(false);
            }
        }

        fetchJournalProject();

        return () => {
            isMounted = false;
        };
    }, [user]);

    // Handle authentication submission
    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setIsSubmittingAuth(true);

        try {
            if (authMode === 'signin') {
                const { error } = await supabase.auth.signInWithPassword({
                    email: authEmail.trim(),
                    password: authPassword
                });
                if (error) throw error;
                setShowAuthModal(false);
            } else {
                const { error } = await supabase.auth.signUp({
                    email: authEmail.trim(),
                    password: authPassword
                });
                if (error) throw error;
                setShowAuthModal(false);
            }
        } catch (err: any) {
            setAuthError(err?.message || 'Authentication failed. Please verify credentials.');
        } finally {
            setIsSubmittingAuth(false);
        }
    };

    return (
        <div className="yolofuck-root">
            {/* Top Navigation Bar */}
            <header className={`yolofuck-header ${isPlayerActive ? 'hidden-player-active' : ''}`}>
                <div className="yolofuck-brand" onClick={() => setActiveTab('story')}>
                    <div className="yolofuck-logo-badge">
                        <Video size={20} color="#a78bfa" />
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
                    {user && (
                        <button 
                            className="yolofuck-record-cta"
                            onClick={() => setShowCaptureModal(true)}
                            title="Record new video clip"
                        >
                            <span className="yolofuck-rec-pulse" />
                            <Video size={16} />
                            <span>Record Clip</span>
                        </button>
                    )}

                    {user ? (
                        <div className="yolofuck-user-pill" onClick={() => signOut()} title="Click to Sign Out">
                            <div className="yolofuck-user-avatar">
                                {profile?.username?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <span className="yolofuck-user-name">
                                {profile?.username || user.email?.split('@')[0]}
                            </span>
                            <LogOut size={14} color="#94a3b8" />
                        </div>
                    ) : (
                        <button 
                            className="yolofuck-icon-btn" 
                            style={{ width: 'auto', padding: '0 16px', gap: '8px', fontWeight: 600, fontSize: '13px' }}
                            onClick={() => setShowAuthModal(true)}
                        >
                            <LogIn size={15} />
                            <span>Sign In</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Main Content Area */}
            <main className="yolofuck-content">
                {authLoading || loadingProject ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', color: '#94a3b8' }}>
                        <Loader2 size={24} className="vizja-spin" color="#a78bfa" />
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>Loading yolofuck journal...</span>
                    </div>
                ) : !user && activeTab === 'story' ? (
                    /* Hero / Sign-in prompt for guest users visiting 'story' */
                    <div className="yolofuck-auth-hero">
                        <div className="yolofuck-auth-card">
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                                <div className="yolofuck-logo-badge" style={{ width: '56px', height: '56px', borderRadius: '16px' }}>
                                    <Video size={30} color="#a78bfa" />
                                </div>
                            </div>
                            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Welcome to yolofuck</h2>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>
                                Record video clips throughout your day. Every evening, your clips compile into a seamless daily story with live voice transcription.
                            </p>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button 
                                    className="yolofuck-auth-submit"
                                    style={{ flex: 1 }}
                                    onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                                >
                                    Sign In
                                </button>
                                <button 
                                    className="yolofuck-auth-submit"
                                    style={{ flex: 1, background: '#1c1c2b', border: '1px solid rgba(255,255,255,0.1)' }}
                                    onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                                >
                                    Create Account
                                </button>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'story' ? (
                    <JournalStoryView projectId={project?.id || null} />
                ) : (
                    <JournalSharedGrid projectId={project?.id || null} />
                )}
            </main>

            {/* Floating Mobile Record Button */}
            {user && !isPlayerActive && (
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

            {/* Auth Modal */}
            {showAuthModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 99999,
                    padding: '16px'
                }}>
                    <div className="yolofuck-auth-card" style={{ maxWidth: '380px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                                {authMode === 'signin' ? 'Sign In to yolofuck' : 'Join yolofuck'}
                            </h3>
                            <button 
                                onClick={() => setShowAuthModal(false)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}
                            >
                                ✕
                            </button>
                        </div>

                        {authError && (
                            <div style={{
                                padding: '10px 14px',
                                borderRadius: '10px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#fca5a5',
                                fontSize: '13px'
                            }}>
                                {authError}
                            </div>
                        )}

                        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                                    Email Address
                                </label>
                                <input 
                                    type="email"
                                    required
                                    value={authEmail}
                                    onChange={(e) => setAuthEmail(e.target.value)}
                                    placeholder="you@domain.com"
                                    className="yolofuck-auth-input"
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                                    Password
                                </label>
                                <input 
                                    type="password"
                                    required
                                    value={authPassword}
                                    onChange={(e) => setAuthPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="yolofuck-auth-input"
                                />
                            </div>

                            <button 
                                type="submit" 
                                className="yolofuck-auth-submit"
                                disabled={isSubmittingAuth}
                                style={{ marginTop: '8px' }}
                            >
                                {isSubmittingAuth ? 'Processing...' : (authMode === 'signin' ? 'Sign In' : 'Create Account')}
                            </button>

                            <div style={{ textAlign: 'center', marginTop: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(null); }}
                                    style={{ background: 'transparent', border: 'none', color: '#a78bfa', fontSize: '13px', cursor: 'pointer' }}
                                >
                                    {authMode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JournalPage;
