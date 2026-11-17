/**
 * LandingPage.tsx — Memcut
 * High-conversion Neumorphic Dark Landing Page with Plasticin ID Authentication & PWA Install
 * Strictly NO purple/violet hues.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Video, Mic, Calendar, Download, Sparkles, ShieldCheck, Mail, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { supabaseAuth } from '../lib/supabase';
import { PlasticinUniversalAuthScreen, DEFAULT_MEMCUT_BRANDING } from '../components/PlasticinUniversalAuthScreen';
import { initiatePlasticinSso } from '../lib/plasticinSso';
import './LandingPage.css';

interface LandingPageProps {
    initialAuthMode?: 'signin' | 'signup';
}

export const LandingPage: React.FC<LandingPageProps> = ({ initialAuthMode }) => {
    const {
        authModalOpen,
        authModalMode,
        authModalPrefill,
        openAuthModal,
        closeAuthModal,
        signInWithGoogle,
    } = useAuth();

    // PWA Install Prompt State
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isPwaInstalled, setIsPwaInstalled] = useState(false);

    // Direct Homepage Email & Ecosystem Recognition State
    const [identifier, setIdentifier] = useState('');
    const [recognizedAccount, setRecognizedAccount] = useState<{
        username: string;
        email: string;
        displayName?: string;
        avatarUrl?: string;
    } | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [activeSession, setActiveSession] = useState<{
        username: string;
        email: string;
        displayName?: string;
        avatarUrl?: string;
    } | null>(null);
    const [dismissActiveSession, setDismissActiveSession] = useState(false);

    useEffect(() => {
        if (initialAuthMode) {
            initiatePlasticinSso({ mode: initialAuthMode });
        }
    }, [initialAuthMode]);

    useEffect(() => {
        const handleBeforeInstall = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        const handleAppInstalled = () => {
            setIsPwaInstalled(true);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', handleAppInstalled);

        // Check if already running in standalone PWA mode
        if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
            setIsPwaInstalled(true);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    // Detect existing ecosystem session from Plasticin Master Supabase or local storage
    useEffect(() => {
        supabaseAuth.auth.getSession().then(({ data }) => {
            if (data?.session?.user) {
                const u = data.session.user;
                const meta = u.user_metadata || {};
                const name = meta.user_name || meta.username || meta.full_name || (u.email ? `@${u.email.split('@')[0]}` : 'plasticin_user');
                setActiveSession({
                    username: name.startsWith('@') ? name : `@${name}`,
                    email: u.email || '',
                    displayName: meta.full_name || name.replace(/^@+/, ''),
                    avatarUrl: meta.avatar_url || 'https://plasticin.com/default-avatar.png',
                });
            } else {
                try {
                    const raw = localStorage.getItem('plasticin_last_account');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && parsed.email) {
                            setIdentifier(parsed.email);
                            setRecognizedAccount({
                                username: parsed.username || `@${parsed.email.split('@')[0]}`,
                                email: parsed.email,
                                displayName: parsed.displayName,
                                avatarUrl: parsed.avatarUrl
                            });
                        }
                    }
                } catch {}
            }
        }).catch(() => {});
    }, []);

    // Debounced lookup in Master plasticin_users
    useEffect(() => {
        const clean = identifier.trim().toLowerCase();
        if (!clean || clean.length < 3) {
            setRecognizedAccount(null);
            setIsChecking(false);
            return;
        }

        setIsChecking(true);
        const timer = setTimeout(async () => {
            try {
                if (clean === 'minimalmassive@gmail.com' || clean === 'minimalmassive' || clean === '@minimalmassive' || clean === 'acidplasticine' || clean === '@acidplasticine') {
                    setRecognizedAccount({
                        username: '@acidplasticine',
                        email: 'minimalmassive@gmail.com',
                        displayName: 'acidplasticine',
                        avatarUrl: 'https://plasticin.com/default-avatar.png'
                    });
                    setIsChecking(false);
                    return;
                }

                const isEmail = clean.includes('@') && clean.includes('.');
                const cleanUser = clean.replace(/^@+/, '');
                const query = supabaseAuth.from('plasticin_users').select('username, display_name, email, avatar_url');

                const { data } = isEmail
                    ? await query.eq('email', clean).maybeSingle()
                    : await query.or(`username.ilike.@${cleanUser},username.ilike.${cleanUser}`).maybeSingle();

                if (data) {
                    setRecognizedAccount({
                        username: data.username || `@${cleanUser}`,
                        email: data.email || clean,
                        displayName: data.display_name || cleanUser,
                        avatarUrl: data.avatar_url || 'https://plasticin.com/default-avatar.png'
                    });
                } else {
                    setRecognizedAccount(null);
                }
            } catch {
                setRecognizedAccount(null);
            } finally {
                setIsChecking(false);
            }
        }, 280);

        return () => clearTimeout(timer);
    }, [identifier]);

    const handleHeroSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const clean = identifier.trim();
        if (!clean) return;

        if (activeSession && activeSession.email.toLowerCase() === clean.toLowerCase()) {
            window.location.href = '/journal';
            return;
        }

        initiatePlasticinSso({
            email: clean,
            mode: 'signin',
        });
    };

    const handleInstallPwa = async () => {
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const choiceResult = await deferredPrompt.userChoice;
                if (choiceResult.outcome === 'accepted') {
                    setDeferredPrompt(null);
                }
            } catch (err) {
                console.warn('[PWA] Install prompt exception:', err);
            }
        } else {
            const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
            if (isIos) {
                alert('To install Memcut: tap the Share button in Safari, then select "Add to Home Screen".');
            } else {
                alert('To install Memcut: tap the browser menu (⋮) and choose "Install App" or "Add to Home screen".');
            }
        }
    };

    return (
        <div className="yolofuck-landing-root">
            {/* ── Top Bar ── */}
            <header className="yolofuck-landing-header">
                {/* Left Memcut Brand Logo & Wordmark */}
                <div className="memcut-landing-brand yolofuck-header-left-logo">
                    <img 
                        src="/memcut-glyph.png" 
                        alt="Memcut" 
                        className="memcut-landing-glyph memcut-landing-cube"
                    />
                    <img 
                        src="/memcut-wordmark.png" 
                        alt="Memcut" 
                        className="memcut-landing-wordmark"
                    />
                </div>

                <div className="yolofuck-header-spacer" />

                {/* Right Actions: Sign In, Join Memcut, and PWA Install */}
                <div className="yolofuck-header-right-action">
                    <button
                        type="button"
                        className="memcut-header-signin-btn"
                        onClick={() => initiatePlasticinSso({ mode: 'signin' })}
                    >
                        Sign In
                    </button>

                    <button
                        type="button"
                        className="memcut-header-join-btn"
                        onClick={() => initiatePlasticinSso({ mode: 'signup' })}
                    >
                        Join Memcut
                    </button>

                    <button
                        type="button"
                        className="yolofuck-pwa-install-btn"
                        onClick={handleInstallPwa}
                        title={isPwaInstalled ? 'Memcut is installed' : 'Install Memcut app'}
                    >
                        <Download size={16} />
                        <span className="yolofuck-pwa-btn-label">App</span>
                    </button>
                </div>
            </header>

            {/* ── Main Hero Section ── */}
            <main className="yolofuck-landing-hero">
                {/* Left: Product Value Proposition */}
                <div className="yolofuck-hero-left">
                    <h1 className="yolofuck-hero-title">
                        Capture your day.<br />
                        <span>Search what you spoke.</span>
                    </h1>

                    <p className="yolofuck-hero-description">
                        Record daily short-form takes in full-screen 9:16. Every word you speak is automatically transcribed in the background, making your life&apos;s thoughts, meetings, and ideas instantly searchable.
                    </p>

                    <div className="yolofuck-feature-cards">
                        <div className="yolofuck-feat-card">
                            <div className="yolofuck-feat-icon-wrap">
                                <Mic size={20} />
                            </div>
                            <div className="yolofuck-feat-body">
                                <h4>Spoken-Word Search Engine</h4>
                                <p>Search your entire video history by any word you spoke (e.g. &ldquo;pizza&rdquo;, &ldquo;meeting&rdquo;, &ldquo;idea&rdquo;).</p>
                            </div>
                        </div>

                        <div className="yolofuck-feat-card">
                            <div className="yolofuck-feat-icon-wrap">
                                <Video size={20} />
                            </div>
                            <div className="yolofuck-feat-body">
                                <h4>Zero-Clutter 9:16 Camera</h4>
                                <p>Tap and hold anywhere on the screen to record. Release to finish. Multiple takes per day, stitched seamlessly.</p>
                            </div>
                        </div>

                        <div className="yolofuck-feat-card">
                            <div className="yolofuck-feat-icon-wrap">
                                <Calendar size={20} />
                            </div>
                            <div className="yolofuck-feat-body">
                                <h4>Chronological Daily Stories</h4>
                                <p>Timeline matrix of each day&rsquo;s journey. Tap to loop, hold to play full daily story with live spoken captions.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Plasticin ID Unified Access Card */}
                <div className="yolofuck-auth-card">
                    {/* Header Strip with Dual Branding */}
                    <div className="memcut-hero-card-brand-header">
                        <div className="memcut-hero-card-parent-brand">
                            <img
                                src="/assets/plasticin_icon.png"
                                alt="Plasticin"
                                className="memcut-hero-card-parent-icon"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />
                            <span className="memcut-hero-card-parent-label">Plasticin</span>
                            <span className="memcut-hero-card-parent-pill">SSO</span>
                        </div>
                        <h2 className="memcut-hero-card-title">
                            One Unified Identity
                        </h2>
                        <p className="memcut-hero-card-subtitle">
                            Sign in or create your account to unlock Memcut and seamlessly connect with Ideanite, NanCat, Archimantis, and Woobsy.
                        </p>
                    </div>

                    <div className="memcut-hero-card-actions">
                        {/* 0. Active Session Fast Resume (Atlassian Standard SSO) */}
                        {activeSession && !dismissActiveSession && (
                            <div className="memcut-active-session-banner">
                                <div className="memcut-active-session-top">
                                    <span className="memcut-active-session-dot" />
                                    <span className="memcut-active-session-label">Active Plasticin Session</span>
                                </div>
                                <div className="memcut-active-session-content">
                                    <img
                                        src={activeSession.avatarUrl || '/assets/plasticin_icon.png'}
                                        alt=""
                                        className="memcut-active-session-avatar"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = '/assets/plasticin_icon.png';
                                        }}
                                    />
                                    <div className="memcut-active-session-text">
                                        <span className="memcut-active-session-name">{activeSession.username}</span>
                                        <span className="memcut-active-session-sub">{activeSession.email}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { window.location.href = '/journal'; }}
                                    className="memcut-active-session-enter-btn"
                                >
                                    <span>Enter Journal</span>
                                    <ArrowRight size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDismissActiveSession(true)}
                                    className="memcut-active-session-switch"
                                >
                                    Use a different account
                                </button>
                            </div>
                        )}

                        {/* 1. Direct Email & @handle Input Form at the VERY TOP */}
                        <form onSubmit={handleHeroSubmit} className="memcut-hero-identifier-form">
                            <div className="memcut-hero-input-field">
                                <label htmlFor="memcut-hero-identifier-input" className="memcut-hero-input-label">
                                    Email or Plasticin @handle
                                </label>
                                <div className="memcut-hero-input-wrap">
                                    <Mail className="memcut-hero-input-icon" size={16} />
                                    <input
                                        id="memcut-hero-identifier-input"
                                        name="username"
                                        type="text"
                                        inputMode="email"
                                        autoComplete="username"
                                        placeholder="e.g. minimalmassive@gmail.com or @handle"
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                        className="memcut-hero-input"
                                        required
                                    />
                                    {isChecking && (
                                        <Loader2 size={16} className="vizja-spin memcut-hero-input-loader" />
                                    )}
                                </div>
                            </div>

                            {/* Ecosystem Account Recognition Pill */}
                            {recognizedAccount && (
                                <div className="memcut-hero-recognized-pill">
                                    <img src="/assets/plasticin_icon.png" alt="" className="memcut-recognized-icon" />
                                    <span className="memcut-recognized-text">
                                        Plasticin: <strong>{recognizedAccount.username}</strong>
                                    </span>
                                    <CheckCircle2 size={13} className="memcut-recognized-check" />
                                </div>
                            )}

                            {/* Primary Button for Email form */}
                            <button
                                type="submit"
                                disabled={!identifier.trim() || isChecking}
                                className="memcut-hero-btn-continue"
                            >
                                <span>Continue</span>
                            </button>
                        </form>

                        {/* 2. Secondary Social Options */}
                        <div className="memcut-hero-card-divider">
                            <span />
                            <em>Or continue with</em>
                            <span />
                        </div>

                        {/* Button: Continue with Plasticin (RIGHT ABOVE GOOGLE) */}
                        <button
                            type="button"
                            onClick={() => {
                                const clean = identifier.trim();
                                initiatePlasticinSso({
                                    email: clean || undefined,
                                    mode: 'signin',
                                });
                            }}
                            className="memcut-hero-btn-sso memcut-hero-btn-plasticin"
                        >
                            <img
                                src="/assets/plasticin_icon.png"
                                alt=""
                                className="memcut-hero-btn-icon"
                            />
                            <span>Continue with Plasticin</span>
                        </button>

                        {/* Secondary Button: Continue with Google */}
                        <button
                            type="button"
                            onClick={() => signInWithGoogle()}
                            className="memcut-hero-btn-sso memcut-hero-btn-google"
                        >
                            <svg className="memcut-hero-btn-icon" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            <span>Continue with Google</span>
                        </button>

                        {/* Direct Create Account CTA */}
                        <div className="memcut-hero-card-signup-row">
                            <span>Don&apos;t have an account?</span>
                            <button
                                type="button"
                                onClick={() => initiatePlasticinSso({ email: identifier.trim() || undefined, mode: 'signup' })}
                                className="memcut-hero-create-link"
                            >
                                Join now
                            </button>
                        </div>
                    </div>

                    <div className="memcut-hero-card-badge-row">
                        <div className="memcut-hero-trust-badge">
                            <ShieldCheck size={13} className="text-[#c8f931]" />
                            <span>OWASP &amp; RFC 7636 PKCE Compliant</span>
                        </div>
                        <div className="memcut-hero-trust-badge">
                            <Sparkles size={13} className="text-[#60a5fa]" />
                            <span>Single Account for 5 Apps</span>
                        </div>
                    </div>
                </div>
            </main>

            {/* ── Global Full-Screen Universal Plasticin Auth Modal ── */}
            <PlasticinUniversalAuthScreen
                isOpen={authModalOpen}
                onClose={closeAuthModal}
                initialMode={authModalMode}
                initialIdentifier={authModalPrefill?.identifier || identifier}
                initialStep={authModalPrefill?.step}
                branding={DEFAULT_MEMCUT_BRANDING}
            />
        </div>
    );
};

export default LandingPage;
