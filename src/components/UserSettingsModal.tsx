/**
 * UserSettingsModal.tsx — yolofuck
 *
 * Full-screen Settings modal with Neumorphic Dark styling:
 * - Top Navigation: Back / Close button, Title, and 3 top tabs: [User, Media, Transcription]
 * - Tab 1 (User): Username, change password, account info, sign out
 * - Tab 2 (Media): Frameless layout ("bez ramek")
 *     - Top: Audio settings (bitrate pills: 128/192/320 kbps, Raw Studio Audio toggle)
 *     - Bottom: Video settings (9:16 Full HD 1080x1920 & HD 720x1280, bitrate pills: 2.5/4.0/6.0/8.0 Mbps + custom input, Local Storage Only toggle)
 * - Tab 3 (Transcription):
 *     - Think Engine (AI Reasoning): Groq, Gemini, DeepSeek, OpenRouter BYOK
 *     - Listen Engine (Speech Transcription): Native Browser (Web Speech API), Deepgram, OpenAI Whisper, Groq Whisper, Gladia, AssemblyAI BYOK
 *     - Connects background speech transcription to video takes so users can search spoken words
 */

import React, { useState, useEffect } from 'react';
import { 
    User, Lock, X, Check, AlertCircle, Loader2, ArrowLeft,
    SlidersHorizontal, Mic, Volume2, Video, Key, Eye, EyeOff,
    ExternalLink, Sparkles, Brain, Ear, Save, LogOut, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { safeJsonParse } from '../lib/jsonHelper';
import {
    VIDEO_RESOLUTION_OPTIONS,
    AUDIO_BITRATE_OPTIONS,
    VIDEO_BITRATE_PRESETS,
    VideoResolution,
    AudioBitrateKbps,
    getMediaSettingsFromProfile,
    getTranscriptionSettingsFromProfile,
} from '../lib/videoRecordingSettings';
import {
    AI_PROVIDERS,
    SCRIBE_PROVIDERS,
    getAiProviderById,
    getScribeProviderById,
} from '../lib/aiProviders';
import './UserSettingsModal.css';

interface UserSettingsModalProps {
    onClose: () => void;
}

type SettingsTab = 'user' | 'media' | 'transcription';

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({ onClose }) => {
    const { user, profile, refreshProfile, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<SettingsTab>('user');

    // ── Tab 1: User State ───────────────────────────────────────────────────
    const currentUsername = profile?.username || user?.user_metadata?.username || '';
    const [username, setUsername] = useState(currentUsername);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [userLoading, setUserLoading] = useState(false);
    const [userStatusMsg, setUserStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ── Tab 2: Media State (Audio top, Video bottom) ────────────────────────
    const initialMedia = getMediaSettingsFromProfile(profile?.settings);
    const [journalAudioKbps, setJournalAudioKbps] = useState<AudioBitrateKbps>(initialMedia.journal.audioBitrateKbps);
    const [journalStudioAudio, setJournalStudioAudio] = useState<boolean>(initialMedia.journal.studioAudio);
    const [journalRes, setJournalRes] = useState<VideoResolution>(initialMedia.journal.resolution);
    const [journalVideoMbps, setJournalVideoMbps] = useState<number>(initialMedia.journal.videoBitrateMbps);
    const [journalLocalStorageOnly, setJournalLocalStorageOnly] = useState<boolean>(initialMedia.journal.localStorageOnly);
    const [isSavingMedia, setIsSavingMedia] = useState(false);
    const [mediaSaveSuccess, setMediaSaveSuccess] = useState(false);

    // ── Tab 3: Transcription State (Think & Listen BYOK) ────────────────────
    const initialTranscription = getTranscriptionSettingsFromProfile(profile?.settings);
    const [thinkProvider, setThinkProvider] = useState<string>(initialTranscription.ai_provider || '');
    const [thinkModel, setThinkModel] = useState<string>(initialTranscription.ai_model || '');
    const [thinkApiKey, setThinkApiKey] = useState<string>(initialTranscription.custom_api_key || '');
    const [showThinkKey, setShowThinkKey] = useState<boolean>(false);

    const [listenProvider, setListenProvider] = useState<string>(initialTranscription.transcription_engine || 'browser');
    const [listenModel, setListenModel] = useState<string>(initialTranscription.transcription_model || 'native');
    const [listenApiKey, setListenApiKey] = useState<string>(initialTranscription.deepgram_api_key || '');
    const [showListenKey, setShowListenKey] = useState<boolean>(false);

    const [isSavingTranscription, setIsSavingTranscription] = useState(false);
    const [transcriptionSaveSuccess, setTranscriptionSaveSuccess] = useState(false);
    const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

    // Keep fields updated if profile changes
    useEffect(() => {
        if (profile?.username) {
            setUsername(profile.username);
        }
        if (profile?.settings) {
            const m = getMediaSettingsFromProfile(profile.settings);
            setJournalAudioKbps(m.journal.audioBitrateKbps);
            setJournalStudioAudio(m.journal.studioAudio);
            setJournalRes(m.journal.resolution);
            setJournalVideoMbps(m.journal.videoBitrateMbps);
            setJournalLocalStorageOnly(m.journal.localStorageOnly);

            const t = getTranscriptionSettingsFromProfile(profile.settings);
            setThinkProvider(t.ai_provider || '');
            setThinkModel(t.ai_model || '');
            setThinkApiKey(t.custom_api_key || '');
            setListenProvider(t.transcription_engine || 'browser');
            setListenModel(t.transcription_model || 'native');
            setListenApiKey(t.deepgram_api_key || '');
        }
    }, [profile]);

    // Mask API keys for security
    const maskApiKey = (key: string) => {
        if (!key) return '';
        if (key.length <= 8) return '*'.repeat(key.length);
        return `${key.slice(0, 5)}${'*'.repeat(key.length - 8)}${key.slice(-3)}`;
    };

    // ── Tab 1 Handlers: Username & Password ─────────────────────────────────
    const handleSaveUsername = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = username.trim();
        if (!trimmed) {
            setUserStatusMsg({ type: 'error', text: 'Username cannot be empty.' });
            return;
        }
        if (!user?.id) {
            setUserStatusMsg({ type: 'error', text: 'You must be logged in.' });
            return;
        }

        setUserLoading(true);
        setUserStatusMsg(null);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ username: trimmed, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) throw error;
            await refreshProfile();
            setUserStatusMsg({ type: 'success', text: 'Username updated successfully.' });
        } catch (err: any) {
            setUserStatusMsg({ type: 'error', text: err?.message || 'Failed to update username.' });
        } finally {
            setUserLoading(false);
        }
    };

    const handleSavePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) {
            setUserStatusMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setUserStatusMsg({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        setUserLoading(true);
        setUserStatusMsg(null);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setNewPassword('');
            setConfirmPassword('');
            setUserStatusMsg({ type: 'success', text: 'Password updated successfully.' });
        } catch (err: any) {
            setUserStatusMsg({ type: 'error', text: err?.message || 'Failed to update password.' });
        } finally {
            setUserLoading(false);
        }
    };

    const handleSignOut = async () => {
        if (window.confirm('Are you sure you want to log out of your yolofuck account?')) {
            await signOut();
            onClose();
        }
    };

    // ── Tab 2 Handlers: Save Media Settings ─────────────────────────────────
    const handleSaveMediaSettings = async () => {
        if (!user?.id) return;
        setIsSavingMedia(true);
        try {
            const { data: currentProfile } = await supabase
                .from('profiles')
                .select('settings')
                .eq('id', user.id)
                .maybeSingle();

            const existing = safeJsonParse(currentProfile?.settings, {});
            const updated = {
                ...existing,
                journal_video_resolution: journalRes,
                journal_video_bitrate_mbps: journalVideoMbps,
                journal_audio_bitrate_kbps: journalAudioKbps,
                journal_studio_audio: journalStudioAudio,
                journal_local_storage_only: journalLocalStorageOnly,
            };

            const { error } = await supabase
                .from('profiles')
                .update({ settings: updated, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) throw error;

            await refreshProfile();
            setMediaSaveSuccess(true);
            setTimeout(() => setMediaSaveSuccess(false), 2500);
        } catch (err) {
            console.error('[Settings] Save media settings error:', err);
        } finally {
            setIsSavingMedia(false);
        }
    };

    // ── Tab 3 Handlers: Save Transcription Settings ─────────────────────────
    const handleSaveTranscriptionSettings = async () => {
        if (!user?.id) return;
        setTranscriptionError(null);

        // Validation for BYOK providers
        if (thinkProvider) {
            const provider = getAiProviderById(thinkProvider);
            if (!thinkApiKey.trim()) {
                setTranscriptionError(`Please provide an API key for ${provider?.name || thinkProvider}.`);
                return;
            }
        }

        if (listenProvider && listenProvider !== 'browser') {
            const scribe = getScribeProviderById(listenProvider);
            if (scribe?.requiresKey && !listenApiKey.trim()) {
                setTranscriptionError(`Please provide an API key for ${scribe?.name || listenProvider}.`);
                return;
            }
        }

        setIsSavingTranscription(true);
        try {
            const { data: currentProfile } = await supabase
                .from('profiles')
                .select('settings')
                .eq('id', user.id)
                .maybeSingle();

            const existing = safeJsonParse(currentProfile?.settings, {});
            const updated = {
                ...existing,
                ai_provider: thinkProvider,
                ai_model: thinkModel,
                custom_api_key: thinkApiKey.trim(),
                transcription_engine: listenProvider,
                transcription_model: listenModel,
                deepgram_api_key: listenApiKey.trim(),
            };

            const { error } = await supabase
                .from('profiles')
                .update({ settings: updated, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) throw error;

            await refreshProfile();
            setTranscriptionSaveSuccess(true);
            setTimeout(() => setTranscriptionSaveSuccess(false), 2500);
        } catch (err: any) {
            console.error('[Settings] Save transcription settings error:', err);
            setTranscriptionError(err?.message || 'Failed to save transcription settings.');
        } finally {
            setIsSavingTranscription(false);
        }
    };

    const activeThinkProvider = getAiProviderById(thinkProvider);
    const activeListenProvider = getScribeProviderById(listenProvider);

    return (
        <div className="yolofuck-settings-fullscreen">
            {/* Top Navigation Bar */}
            <header className="yolofuck-settings-topbar">
                <button
                    type="button"
                    className="yolofuck-settings-nav-btn back"
                    onClick={onClose}
                    title="Back to Journal"
                >
                    <ArrowLeft size={18} />
                    <span>Back</span>
                </button>

                {/* 3 Main Tabs: User, Media, Transcription */}
                <div className="yolofuck-settings-tabs-pill">
                    <button
                        type="button"
                        className={`yolofuck-settings-tab-btn ${activeTab === 'user' ? 'active' : ''}`}
                        onClick={() => setActiveTab('user')}
                    >
                        <User size={15} />
                        <span>User</span>
                    </button>

                    <button
                        type="button"
                        className={`yolofuck-settings-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
                        onClick={() => setActiveTab('media')}
                    >
                        <SlidersHorizontal size={15} />
                        <span>Media</span>
                    </button>

                    <button
                        type="button"
                        className={`yolofuck-settings-tab-btn ${activeTab === 'transcription' ? 'active' : ''}`}
                        onClick={() => setActiveTab('transcription')}
                    >
                        <Brain size={15} />
                        <span>Transcription</span>
                    </button>
                </div>

                <button
                    type="button"
                    className="yolofuck-settings-nav-btn close"
                    onClick={onClose}
                    title="Close Settings"
                >
                    <X size={18} />
                </button>
            </header>

            {/* Scrollable Viewport */}
            <main className="yolofuck-settings-viewport">
                <div className="yolofuck-settings-content-wrapper">

                    {/* ════════════════ TAB 1: USER ════════════════ */}
                    {activeTab === 'user' && (
                        <div className="yolofuck-settings-tab-content">
                            <div className="yolofuck-tab-header">
                                <h1>User Account</h1>
                                <p>Manage your account identity, security, and credentials.</p>
                            </div>

                            {userStatusMsg && (
                                <div className={`yolofuck-settings-alert ${userStatusMsg.type}`}>
                                    {userStatusMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                                    <span>{userStatusMsg.text}</span>
                                </div>
                            )}

                            {/* Username section */}
                            <form className="yolofuck-settings-clean-card" onSubmit={handleSaveUsername}>
                                <label className="yolofuck-settings-label">Display Username</label>
                                <div className="yolofuck-input-with-button">
                                    <input
                                        type="text"
                                        className="yolofuck-settings-text-input"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter your username"
                                        disabled={userLoading}
                                    />
                                    <button
                                        type="submit"
                                        className="yolofuck-neumorphic-btn primary"
                                        disabled={userLoading || username.trim() === currentUsername}
                                    >
                                        {userLoading ? <Loader2 size={15} className="spin" /> : 'Save'}
                                    </button>
                                </div>
                            </form>

                            {/* Password section */}
                            <form className="yolofuck-settings-clean-card" onSubmit={handleSavePassword}>
                                <label className="yolofuck-settings-label">Change Password</label>
                                <div className="yolofuck-inputs-stack">
                                    <input
                                        type="password"
                                        className="yolofuck-settings-text-input"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="New password (min. 6 characters)"
                                        disabled={userLoading}
                                    />
                                    <input
                                        type="password"
                                        className="yolofuck-settings-text-input"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm new password"
                                        disabled={userLoading}
                                    />
                                    <button
                                        type="submit"
                                        className="yolofuck-neumorphic-btn full primary"
                                        disabled={userLoading || !newPassword}
                                    >
                                        {userLoading ? <Loader2 size={15} className="spin" /> : 'Update Password'}
                                    </button>
                                </div>
                            </form>

                            {/* Account details */}
                            <div className="yolofuck-settings-clean-card details">
                                <label className="yolofuck-settings-label">Account Details</label>
                                <div className="yolofuck-meta-row">
                                    <span className="yolofuck-meta-label">Email</span>
                                    <span className="yolofuck-meta-value">{user?.email || 'N/A'}</span>
                                </div>
                                <div className="yolofuck-meta-row">
                                    <span className="yolofuck-meta-label">User ID</span>
                                    <span className="yolofuck-meta-value mono">{user?.id || 'N/A'}</span>
                                </div>
                            </div>

                            {/* Sign Out */}
                            <div className="yolofuck-settings-clean-card danger">
                                <label className="yolofuck-settings-label">Session</label>
                                <button
                                    type="button"
                                    className="yolofuck-neumorphic-btn danger full"
                                    onClick={handleSignOut}
                                >
                                    <LogOut size={16} />
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ════════════════ TAB 2: MEDIA (AUDIO TOP, VIDEO BOTTOM) ════════════════ */}
                    {activeTab === 'media' && (
                        <div className="yolofuck-settings-tab-content">
                            <div className="yolofuck-tab-header">
                                <h1>Media & Recording</h1>
                                <p>Studio recording parameters for high-definition 9:16 vertical shorts and acoustic sound.</p>
                            </div>

                            {/* TOP SECTION: AUDIO SETTINGS */}
                            <div className="yolofuck-settings-clean-section">
                                <div className="yolofuck-section-headline">
                                    <div className="yolofuck-section-icon audio">
                                        <Volume2 size={18} />
                                    </div>
                                    <div>
                                        <h2>Audio Recording Quality</h2>
                                        <p>Fidelity, acoustic compression, and microphone bitstream bitrate.</p>
                                    </div>
                                </div>

                                {/* Audio Bitrate Pills */}
                                <div className="yolofuck-field-group">
                                    <label className="yolofuck-field-label">Audio Bitrate</label>
                                    <div className="yolofuck-pills-row">
                                        {AUDIO_BITRATE_OPTIONS.map(opt => (
                                            <button
                                                key={`abps-${opt.value}`}
                                                type="button"
                                                className={`yolofuck-pill-btn ${journalAudioKbps === opt.value ? 'active' : ''}`}
                                                onClick={() => setJournalAudioKbps(opt.value)}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="yolofuck-field-hint">
                                        Near-CD studio fidelity at 192 kbps (default) up to 320 kbps ultra lossless-like bitstream.
                                    </span>
                                </div>

                                {/* Raw Studio Audio Toggle */}
                                <div className="yolofuck-toggle-card">
                                    <div className="yolofuck-toggle-info">
                                        <span className="yolofuck-toggle-title">Raw Studio Audio (No Compression / Filters)</span>
                                        <span className="yolofuck-toggle-desc">
                                            Disables browser voice-call filtering (echo cancellation, noise suppression, auto-gain) to preserve natural acoustic dynamics.
                                        </span>
                                    </div>
                                    <label className="yolofuck-switch">
                                        <input
                                            type="checkbox"
                                            checked={journalStudioAudio}
                                            onChange={(e) => setJournalStudioAudio(e.target.checked)}
                                        />
                                        <span className="yolofuck-slider" />
                                    </label>
                                </div>
                            </div>

                            <div className="yolofuck-section-divider" />

                            {/* BOTTOM SECTION: VIDEO SETTINGS */}
                            <div className="yolofuck-settings-clean-section">
                                <div className="yolofuck-section-headline">
                                    <div className="yolofuck-section-icon video">
                                        <Video size={18} />
                                    </div>
                                    <div>
                                        <h2>Video Recording Quality (9:16 Shorts)</h2>
                                        <p>Vertical video resolution up to Full HD and high-bitrate encoding.</p>
                                    </div>
                                </div>

                                {/* Resolution Dropdown */}
                                <div className="yolofuck-field-group">
                                    <label className="yolofuck-field-label">Recording Resolution (9:16 Vertical)</label>
                                    <select
                                        className="yolofuck-settings-select"
                                        value={journalRes}
                                        onChange={(e) => setJournalRes(Number(e.target.value) as VideoResolution)}
                                    >
                                        {VIDEO_RESOLUTION_OPTIONS.map(opt => (
                                            <option key={`res-${opt.value}`} value={opt.value}>
                                                {opt.label} — {opt.description}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="yolofuck-field-hint">
                                        Captured in genuine 9:16 portrait ratio for mobile shorts and immersive desktop playback.
                                    </span>
                                </div>

                                {/* Video Bitrate Presets */}
                                <div className="yolofuck-field-group">
                                    <label className="yolofuck-field-label">Video Bitrate (Mbps)</label>
                                    <div className="yolofuck-pills-row">
                                        {VIDEO_BITRATE_PRESETS.map(preset => (
                                            <button
                                                key={`bps-${preset.value}`}
                                                type="button"
                                                className={`yolofuck-pill-btn ${journalVideoMbps === preset.value ? 'active' : ''}`}
                                                onClick={() => setJournalVideoMbps(preset.value)}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="yolofuck-custom-input-row">
                                        <span>Custom Mbps:</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="8"
                                            step="0.5"
                                            className="yolofuck-number-input"
                                            value={journalVideoMbps}
                                            onChange={(e) => setJournalVideoMbps(Math.max(1, Math.min(8, parseFloat(e.target.value) || 1)))}
                                        />
                                        <span>Mbps</span>
                                    </div>
                                    <span className="yolofuck-field-hint">
                                        Tuned for high-framerate mobile and web streaming (Default: 4.0 Mbps, Ultra: 8.0 Mbps).
                                    </span>
                                </div>

                                {/* Local Storage Only Toggle */}
                                <div className="yolofuck-toggle-card">
                                    <div className="yolofuck-toggle-info">
                                        <span className="yolofuck-toggle-title">Record to Local Storage Only</span>
                                        <span className="yolofuck-toggle-desc">
                                            Stores video takes locally in device IndexedDB without uploading to Supabase cloud.
                                        </span>
                                    </div>
                                    <label className="yolofuck-switch">
                                        <input
                                            type="checkbox"
                                            checked={journalLocalStorageOnly}
                                            onChange={(e) => setJournalLocalStorageOnly(e.target.checked)}
                                        />
                                        <span className="yolofuck-slider" />
                                    </label>
                                </div>
                            </div>

                            {/* Save Button */}
                            <div className="yolofuck-save-action-bar">
                                <button
                                    type="button"
                                    className={`yolofuck-save-settings-btn ${mediaSaveSuccess ? 'success' : ''}`}
                                    onClick={handleSaveMediaSettings}
                                    disabled={isSavingMedia}
                                >
                                    {mediaSaveSuccess ? (
                                        <>
                                            <CheckCircle2 size={16} />
                                            <span>Media Settings Saved</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save size={16} />
                                            <span>{isSavingMedia ? 'Saving…' : 'Save Media Settings'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ════════════════ TAB 3: TRANSCRIPTION (THINK & LISTEN BYOK) ════════════════ */}
                    {activeTab === 'transcription' && (
                        <div className="yolofuck-settings-tab-content">
                            <div className="yolofuck-tab-header">
                                <h1>Transcription & AI Engines</h1>
                                <p>
                                    Connect private AI models for speech transcription and spoken word search. Bring Your Own Key (BYOK) with full data privacy.
                                </p>
                            </div>

                            {transcriptionError && (
                                <div className="yolofuck-settings-alert error">
                                    <AlertCircle size={16} />
                                    <span>{transcriptionError}</span>
                                </div>
                            )}

                            {/* THINK ENGINE SECTION (COGNITION / REASONING) */}
                            <div className="yolofuck-settings-clean-section">
                                <div className="yolofuck-section-headline">
                                    <div className="yolofuck-section-icon brain">
                                        <Brain size={18} />
                                    </div>
                                    <div>
                                        <h2>Think Engine (AI Reasoning)</h2>
                                        <p>Power intelligent summaries, title generation, and spoken context comprehension.</p>
                                    </div>
                                </div>

                                <div className="yolofuck-field-group">
                                    <label className="yolofuck-field-label">Think Provider</label>
                                    <select
                                        className="yolofuck-settings-select"
                                        value={thinkProvider}
                                        onChange={(e) => {
                                            const pId = e.target.value;
                                            setThinkProvider(pId);
                                            const p = getAiProviderById(pId);
                                            setThinkModel(p?.models[0]?.id || '');
                                        }}
                                    >
                                        <option value="">None / Disabled</option>
                                        {AI_PROVIDERS.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {thinkProvider && (
                                    <>
                                        <div className="yolofuck-field-group">
                                            <label className="yolofuck-field-label">Think Model</label>
                                            <select
                                                className="yolofuck-settings-select"
                                                value={thinkModel}
                                                onChange={(e) => setThinkModel(e.target.value)}
                                            >
                                                {activeThinkProvider?.models.map(m => (
                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="yolofuck-field-group">
                                            <label className="yolofuck-field-label">
                                                {activeThinkProvider?.name} API Key (BYOK)
                                            </label>
                                            <div className="yolofuck-key-input-wrapper">
                                                <input
                                                    type={showThinkKey ? 'text' : 'password'}
                                                    className="yolofuck-settings-text-input key"
                                                    value={showThinkKey ? thinkApiKey : (thinkApiKey ? maskApiKey(thinkApiKey) : '')}
                                                    onChange={(e) => setThinkApiKey(e.target.value)}
                                                    placeholder={`Paste your ${activeThinkProvider?.name} API key…`}
                                                    autoComplete="off"
                                                />
                                                <div className="yolofuck-key-input-actions">
                                                    <button
                                                        type="button"
                                                        className="yolofuck-icon-btn"
                                                        onClick={() => setShowThinkKey(!showThinkKey)}
                                                        title={showThinkKey ? 'Hide key' : 'Show key'}
                                                    >
                                                        {showThinkKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                                    </button>
                                                    {thinkApiKey && (
                                                        <button
                                                            type="button"
                                                            className="yolofuck-icon-btn"
                                                            onClick={() => setThinkApiKey('')}
                                                            title="Clear key"
                                                        >
                                                            <X size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="yolofuck-field-hint">
                                                Need a key? Get your private key from{' '}
                                                <a
                                                    href={activeThinkProvider?.apiKeyUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="yolofuck-inline-link"
                                                >
                                                    {activeThinkProvider?.name} Console <ExternalLink size={12} />
                                                </a>
                                                . Your key is stored securely with database-level isolation.
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="yolofuck-section-divider" />

                            {/* LISTEN ENGINE SECTION (SPEECH-TO-TEXT / SCRIBE) */}
                            <div className="yolofuck-settings-clean-section">
                                <div className="yolofuck-section-headline">
                                    <div className="yolofuck-section-icon ear">
                                        <Ear size={18} />
                                    </div>
                                    <div>
                                        <h2>Listen Engine (Speech Transcription)</h2>
                                        <p>Transcribes spoken audio in the background during recording so you can search videos by text.</p>
                                    </div>
                                </div>

                                <div className="yolofuck-field-group">
                                    <label className="yolofuck-field-label">Transcription Engine</label>
                                    <select
                                        className="yolofuck-settings-select"
                                        value={listenProvider}
                                        onChange={(e) => {
                                            const pId = e.target.value;
                                            setListenProvider(pId);
                                            const p = getScribeProviderById(pId);
                                            setListenModel(p?.models[0]?.id || '');
                                        }}
                                    >
                                        {SCRIBE_PROVIDERS.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    {listenProvider === 'browser' && (
                                        <div className="yolofuck-feature-badge success">
                                            <Sparkles size={14} />
                                            <span>Native Browser dictation is active — zero keys required and 100% private.</span>
                                        </div>
                                    )}
                                </div>

                                <div className="yolofuck-field-group">
                                    <label className="yolofuck-field-label">Transcription Model</label>
                                    <select
                                        className="yolofuck-settings-select"
                                        value={listenModel}
                                        onChange={(e) => setListenModel(e.target.value)}
                                    >
                                        {activeListenProvider?.models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {activeListenProvider?.requiresKey && (
                                    <div className="yolofuck-field-group">
                                        <label className="yolofuck-field-label">
                                            {activeListenProvider.name} API Key (BYOK)
                                        </label>
                                        <div className="yolofuck-key-input-wrapper">
                                            <input
                                                type={showListenKey ? 'text' : 'password'}
                                                className="yolofuck-settings-text-input key"
                                                value={showListenKey ? listenApiKey : (listenApiKey ? maskApiKey(listenApiKey) : '')}
                                                onChange={(e) => setListenApiKey(e.target.value)}
                                                placeholder={`Paste your ${activeListenProvider.name} API key…`}
                                                autoComplete="off"
                                            />
                                            <div className="yolofuck-key-input-actions">
                                                <button
                                                    type="button"
                                                    className="yolofuck-icon-btn"
                                                    onClick={() => setShowListenKey(!showListenKey)}
                                                    title={showListenKey ? 'Hide key' : 'Show key'}
                                                >
                                                    {showListenKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                                </button>
                                                {listenApiKey && (
                                                    <button
                                                        type="button"
                                                        className="yolofuck-icon-btn"
                                                        onClick={() => setListenApiKey('')}
                                                        title="Clear key"
                                                    >
                                                        <X size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <span className="yolofuck-field-hint">
                                            Need a key? Get your private key from{' '}
                                            <a
                                                href={activeListenProvider.apiKeyUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="yolofuck-inline-link"
                                            >
                                                {activeListenProvider.name} Console <ExternalLink size={12} />
                                            </a>
                                            . Your key is stored securely with database-level isolation.
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Save Button */}
                            <div className="yolofuck-save-action-bar">
                                <button
                                    type="button"
                                    className={`yolofuck-save-settings-btn ${transcriptionSaveSuccess ? 'success' : ''}`}
                                    onClick={handleSaveTranscriptionSettings}
                                    disabled={isSavingTranscription}
                                >
                                    {transcriptionSaveSuccess ? (
                                        <>
                                            <CheckCircle2 size={16} />
                                            <span>Transcription Settings Saved</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save size={16} />
                                            <span>{isSavingTranscription ? 'Saving…' : 'Save Transcription Settings'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default UserSettingsModal;
