/**
 * LandingPage.tsx — yolofuck
 * High-conversion Neumorphic Dark Landing Page with 1-Screen Authentication
 * Strictly NO purple/violet hues.
 */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Video, Mic, Calendar, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import './LandingPage.css';

export const LandingPage: React.FC = () => {
    const { signInWithEmail, signUpWithEmail } = useAuth();

    const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        if (!email.trim() || !password.trim()) {
            setErrorMsg('Please enter both email and password.');
            return;
        }

        if (authMode === 'signup' && password.length < 6) {
            setErrorMsg('Password must be at least 6 characters.');
            return;
        }

        setLoading(true);

        try {
            if (authMode === 'signin') {
                const { error } = await signInWithEmail(email.trim(), password);
                if (error) {
                    setErrorMsg(error.message || 'Failed to sign in. Please check your credentials.');
                }
            } else {
                const { error } = await signUpWithEmail(email.trim(), password, username.trim() || undefined);
                if (error) {
                    setErrorMsg(error.message || 'Failed to create account. Please try again.');
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
            {/* ── Top Bar ── */}
            <header className="yolofuck-landing-header">
                <div className="yolofuck-brand-group">
                    <span className="yolofuck-brand-dot" />
                    <span className="yolofuck-brand-logo-text">YOLOFUCK</span>
                    <span className="yolofuck-brand-tag">JOURNAL</span>
                </div>
            </header>

            {/* ── Main Hero Section ── */}
            <main className="yolofuck-landing-hero">
                {/* Left: Product Value Proposition */}
                <div className="yolofuck-hero-left">
                    <div className="yolofuck-hero-badge">
                        <Sparkles size={14} color="#ff9900" />
                        <span>Frictionless 9:16 Video Journal</span>
                    </div>

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
                            onClick={() => { setAuthMode('signin'); setErrorMsg(null); }}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            className={`yolofuck-auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
                            onClick={() => { setAuthMode('signup'); setErrorMsg(null); }}
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

                    <form onSubmit={handleSubmit} className="yolofuck-auth-form">
                        {authMode === 'signup' && (
                            <div className="yolofuck-form-field">
                                <label>Username (Optional)</label>
                                <input
                                    type="text"
                                    className="yolofuck-form-input"
                                    placeholder="Your username or handle"
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

                        <button
                            type="submit"
                            className="yolofuck-auth-submit-btn"
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 size={18} className="vizja-spin" />
                            ) : (
                                <>
                                    <span>{authMode === 'signin' ? 'Sign In to Journal' : 'Get Started Free'}</span>
                                    <ArrowRight size={16} />
                                </>
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
