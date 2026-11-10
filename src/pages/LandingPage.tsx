/**
 * LandingPage.tsx — yolofuck
 * High-conversion Neumorphic Dark Landing Page with 1-Screen Authentication & PWA Install
 * Strictly NO purple/violet hues.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Video, Mic, Calendar, Loader2, Download, CheckCircle2, Circle } from 'lucide-react';
import './LandingPage.css';

export const LandingPage: React.FC = () => {
    const { signInWithEmail, signUpWithEmail } = useAuth();

    const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // PWA Install Prompt State
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isPwaInstalled, setIsPwaInstalled] = useState(false);

    // Password requirements matching Supabase recommended rule
    const hasMinLength = password.length >= 8;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);

    const metCount = [hasMinLength, hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
    const strengthPercent = Math.round((metCount / 5) * 100);
    const isPasswordFullyValid = metCount === 5;

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
            // Inform user on iOS or mobile browsers where manual install action applies
            const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
            if (isIos) {
                alert('To install yolofuck: tap the Share button in Safari, then select "Add to Home Screen".');
            } else {
                alert('To install yolofuck: tap the browser menu (⋮) and choose "Install App" or "Add to Home screen".');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setSuccessMsg(null);

        const cleanEmail = email.trim();
        const cleanPassword = password.trim();
        const cleanUsername = username.trim();

        if (authMode === 'signup' && !cleanUsername) {
            setErrorMsg('Please enter a username. It will be your identity across the app.');
            return;
        }

        if (authMode === 'signup' && cleanUsername.length < 2) {
            setErrorMsg('Username must be at least 2 characters.');
            return;
        }

        if (!cleanEmail || !cleanPassword) {
            setErrorMsg('Please enter both email and password.');
            return;
        }

        if (authMode === 'signup' && !isPasswordFullyValid) {
            setErrorMsg('Password does not meet all security requirements. Please fulfill all 5 checks below.');
            return;
        }

        setLoading(true);

        try {
            if (authMode === 'signin') {
                const { error } = await signInWithEmail(cleanEmail, cleanPassword);
                if (error) {
                    const msg = error.message || 'Failed to sign in. Please check your credentials.';
                    if (msg.toLowerCase().includes('email not confirmed')) {
                        setErrorMsg('Email not confirmed yet. In Supabase Dashboard, disable "Confirm email" under Authentication -> Providers -> Email for instant access.');
                    } else if (msg.toLowerCase().includes('invalid login credentials')) {
                        setErrorMsg('Invalid email or password. If you do not have an account yet, switch to "Create Account".');
                    } else {
                        setErrorMsg(msg);
                    }
                }
            } else {
                const { error } = await signUpWithEmail(cleanEmail, cleanPassword, cleanUsername);
                if (error) {
                    setErrorMsg(error.message || 'Failed to create account. Please try again.');
                } else {
                    setSuccessMsg('Account created! Signing you in...');
                    // Automatically attempt sign in immediately
                    setTimeout(async () => {
                        const { error: autoSignInErr } = await signInWithEmail(cleanEmail, cleanPassword);
                        if (autoSignInErr) {
                            setSuccessMsg('Account created! If email confirmation is enabled in your Supabase project, check your inbox or disable "Confirm email" in Supabase -> Authentication -> Providers -> Email.');
                        }
                    }, 500);
                }
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="yolofuck-landing-root">
            {/* ── Top Bar (No underline separator, centered logo, PWA button on right) ── */}
            <header className="yolofuck-landing-header">
                <div className="yolofuck-header-spacer" />

                {/* Centered YOLOFUCK Image Logo */}
                <div className="yolofuck-header-center-logo">
                    <img 
                        src="/yolofuck-logo.png" 
                        alt="YOLOFUCK" 
                        className="yolofuck-brand-logo-img"
                    />
                </div>

                {/* Far Right: Direct PWA Install Icon */}
                <div className="yolofuck-header-right-action">
                    <button
                        type="button"
                        className="yolofuck-pwa-install-btn"
                        onClick={handleInstallPwa}
                        title={isPwaInstalled ? 'yolofuck is installed' : 'Install yolofuck app'}
                    >
                        <Download size={18} />
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
                        Record daily short-form takes in full-screen 9:16. Every word you speak is automatically transcribed in the background, making your life's thoughts, meetings, and ideas instantly searchable.
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

                {/* Right: 1-Screen Authentication Box */}
                <div className="yolofuck-auth-card">
                    <div className="yolofuck-auth-tabs">
                        <button
                            type="button"
                            className={`yolofuck-auth-tab-btn ${authMode === 'signin' ? 'active' : ''}`}
                            onClick={() => { setAuthMode('signin'); setErrorMsg(null); setSuccessMsg(null); }}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            className={`yolofuck-auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
                            onClick={() => { setAuthMode('signup'); setErrorMsg(null); setSuccessMsg(null); }}
                        >
                            Create Account
                        </button>
                    </div>

                    <div>
                        <h2 className="yolofuck-auth-title">
                            {authMode === 'signin' ? 'Welcome Back' : 'Create Your Journal'}
                        </h2>
                        <p className="yolofuck-auth-subtitle">
                            {authMode === 'signin'
                                ? 'Sign in to access your daily video records and search'
                                : 'Start your daily spoken-word video journal in seconds'}
                        </p>
                    </div>

                    {errorMsg && (
                        <div className="yolofuck-auth-error">
                            {errorMsg}
                        </div>
                    )}

                    {successMsg && (
                        <div className="yolofuck-auth-success">
                            {successMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="yolofuck-auth-form">
                        {authMode === 'signup' && (
                            <div className="yolofuck-form-field">
                                <label>Username (Mandatory)</label>
                                <input
                                    type="text"
                                    required
                                    minLength={2}
                                    className="yolofuck-form-input"
                                    placeholder="Unique username (shown to everyone)"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                />
                            </div>
                        )}

                        <div className="yolofuck-form-field">
                            <label>Email Address</label>
                            <input
                                type="email"
                                required
                                className="yolofuck-form-input"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                        </div>

                        <div className="yolofuck-form-field">
                            <label>Password</label>
                            <input
                                type="password"
                                required
                                className="yolofuck-form-input"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                            />
                        </div>

                        {authMode === 'signup' && (
                            <div className="yolofuck-pw-requirements-card">
                                <div className="yolofuck-pw-header-row">
                                    <span className="yolofuck-pw-req-label">Password Requirements</span>
                                    <span className="yolofuck-pw-req-counter">
                                        {metCount}/5 met ({strengthPercent}%)
                                    </span>
                                </div>

                                {/* Dynamic Progress Bar */}
                                <div className="yolofuck-pw-progress-track">
                                    <div 
                                        className="yolofuck-pw-progress-fill" 
                                        style={{ 
                                            width: `${strengthPercent}%`,
                                            backgroundColor: strengthPercent === 100 ? '#c8f72c' : strengthPercent >= 60 ? '#a3e635' : '#eab308'
                                        }} 
                                    />
                                </div>

                                {/* Checklist Items */}
                                <ul className="yolofuck-pw-checklist">
                                    <li className={`yolofuck-pw-item ${hasMinLength ? 'met' : ''}`}>
                                        {hasMinLength ? <CheckCircle2 size={14} className="yolofuck-check-met" /> : <Circle size={14} className="yolofuck-check-unmet" />}
                                        <span>At least 8 characters</span>
                                    </li>
                                    <li className={`yolofuck-pw-item ${hasLower ? 'met' : ''}`}>
                                        {hasLower ? <CheckCircle2 size={14} className="yolofuck-check-met" /> : <Circle size={14} className="yolofuck-check-unmet" />}
                                        <span>At least 1 lowercase letter (a-z)</span>
                                    </li>
                                    <li className={`yolofuck-pw-item ${hasUpper ? 'met' : ''}`}>
                                        {hasUpper ? <CheckCircle2 size={14} className="yolofuck-check-met" /> : <Circle size={14} className="yolofuck-check-unmet" />}
                                        <span>At least 1 uppercase letter (A-Z)</span>
                                    </li>
                                    <li className={`yolofuck-pw-item ${hasDigit ? 'met' : ''}`}>
                                        {hasDigit ? <CheckCircle2 size={14} className="yolofuck-check-met" /> : <Circle size={14} className="yolofuck-check-unmet" />}
                                        <span>At least 1 digit (0-9)</span>
                                    </li>
                                    <li className={`yolofuck-pw-item ${hasSymbol ? 'met' : ''}`}>
                                        {hasSymbol ? <CheckCircle2 size={14} className="yolofuck-check-met" /> : <Circle size={14} className="yolofuck-check-unmet" />}
                                        <span>At least 1 special symbol (!@#$%^&*...)</span>
                                    </li>
                                </ul>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="yolofuck-auth-submit-btn"
                            disabled={loading || (authMode === 'signup' && !isPasswordFullyValid)}
                        >
                            {loading ? (
                                <Loader2 size={18} className="vizja-spin" />
                            ) : (
                                <span>{authMode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                            )}
                        </button>
                    </form>

                    <p className="yolofuck-auth-footer-note">
                        Your private video takes are securely encrypted and stored in your dedicated storage bucket with local offline support.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default LandingPage;
