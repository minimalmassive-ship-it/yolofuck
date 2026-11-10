/**
 * UserSettingsModal.tsx — yolofuck
 * User settings modal for updating username and password.
 */

import React, { useState } from 'react';
import { User, Lock, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import './UserSettingsModal.css';

interface UserSettingsModalProps {
    onClose: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({ onClose }) => {
    const { user, profile, refreshProfile } = useAuth();
    const currentUsername = profile?.username || user?.user_metadata?.username || '';

    const [username, setUsername] = useState(currentUsername);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSaveUsername = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = username.trim();
        if (!trimmed) {
            setStatusMsg({ type: 'error', text: 'Username cannot be empty.' });
            return;
        }

        if (!user?.id) {
            setStatusMsg({ type: 'error', text: 'You must be logged in.' });
            return;
        }

        setLoading(true);
        setStatusMsg(null);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ username: trimmed, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) throw error;
            await refreshProfile();
            setStatusMsg({ type: 'success', text: 'Username updated successfully!' });
        } catch (err: any) {
            setStatusMsg({ type: 'error', text: err?.message || 'Failed to update username.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSavePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) {
            setStatusMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setStatusMsg({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        setLoading(true);
        setStatusMsg(null);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setNewPassword('');
            setConfirmPassword('');
            setStatusMsg({ type: 'success', text: 'Password updated successfully!' });
        } catch (err: any) {
            setStatusMsg({ type: 'error', text: err?.message || 'Failed to update password.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="yolofuck-settings-modal-backdrop" onClick={onClose}>
            <div className="yolofuck-settings-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="yolofuck-settings-header">
                    <div className="yolofuck-settings-title-group">
                        <User size={20} color="#10b981" />
                        <h2>User Settings</h2>
                    </div>
                    <button
                        type="button"
                        className="yolofuck-settings-close-btn"
                        onClick={onClose}
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {statusMsg && (
                    <div className={`yolofuck-settings-alert ${statusMsg.type}`}>
                        {statusMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                        <span>{statusMsg.text}</span>
                    </div>
                )}

                {/* Section 1: Change Username */}
                <form className="yolofuck-settings-section" onSubmit={handleSaveUsername}>
                    <label className="yolofuck-settings-label">Username</label>
                    <div className="yolofuck-settings-input-row">
                        <input
                            type="text"
                            className="yolofuck-settings-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter new username"
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            className="yolofuck-settings-save-btn"
                            disabled={loading || username.trim() === currentUsername}
                        >
                            {loading ? <Loader2 size={14} className="vizja-spin" /> : 'Save'}
                        </button>
                    </div>
                </form>

                {/* Section 2: Change Password */}
                <form className="yolofuck-settings-section" onSubmit={handleSavePassword}>
                    <label className="yolofuck-settings-label">Change Password</label>
                    <input
                        type="password"
                        className="yolofuck-settings-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password (min. 6 characters)"
                        disabled={loading}
                    />
                    <input
                        type="password"
                        className="yolofuck-settings-input"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        className="yolofuck-settings-save-btn full"
                        disabled={loading || !newPassword}
                    >
                        {loading ? <Loader2 size={14} className="vizja-spin" /> : 'Update Password'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default UserSettingsModal;
