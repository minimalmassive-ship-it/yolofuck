/**
 * AuthContext.tsx — yolofuck
 * 
 * Simplified auth context for the standalone Journal app.
 * Handles Supabase auth session, profile fetching, and sign out.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile {
    id: string;
    username: string;
    role: 'user' | 'admin';
    avatar_url?: string;
    bio?: string;
    website?: string;
    location?: string;
    full_name?: string;
    display_name?: string;
    settings?: Record<string, any>;
    created_at?: string;
    updated_at?: string;
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    isAdmin: boolean;
    emailConfirmed: boolean;
    needsUsername: boolean;
    loading: boolean;
    showWelcomeModal: boolean;
    dismissWelcome: () => void;
    showPasswordResetModal: boolean;
    closePasswordResetModal: () => void;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isEmailVerified(user: User | null): boolean {
    if (!user) return false;
    return !!user.email_confirmed_at || !!user.confirmed_at;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const mounted = useRef(true);
    const userRef = useRef<User | null>(null);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                console.error('[Auth] Profile fetch error:', error);
                return null;
            }
            return data as Profile | null;
        } catch (err) {
            console.error('[Auth] Profile fetch exception:', err);
            return null;
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        if (!user) return;
        const profileData = await fetchProfile(user.id);
        if (mounted.current && profileData) {
            setProfile(profileData);
        }
    }, [user, fetchProfile]);

    // Ensure the user has a Journal project
    const ensureJournalProject = useCallback(async (userId: string) => {
        try {
            const { data: existing } = await supabase
                .from('projects')
                .select('id')
                .eq('user_id', userId)
                .eq('system_type', 'journal')
                .maybeSingle();

            if (!existing) {
                await supabase.from('projects').insert({
                    name: 'Journal',
                    user_id: userId,
                    color: '#ec4899',
                    description: '',
                    is_public: false,
                    is_system: true,
                    system_type: 'journal'
                });
            }
        } catch (e) {
            console.error('[Auth] ensureJournalProject failed:', e);
        }
    }, []);

    useEffect(() => {
        let isActive = true;

        const handleAuthChange = async (_event: string, session: any) => {
            if (!isActive) return;

            const currentUser = session?.user ?? null;
            console.log(`[Auth] Event: ${_event} | User: ${currentUser?.id || 'none'}`);

            if (currentUser) {
                setUser(currentUser);

                let profileData = await fetchProfile(currentUser.id);
                if (!profileData && isActive) {
                    // Auto-create profile if missing
                    try {
                        const fallbackUsername = currentUser.user_metadata?.username ||
                            currentUser.user_metadata?.full_name ||
                            currentUser.email?.split('@')[0] ||
                            `user_${currentUser.id.slice(0, 8)}`;

                        const { data: newProfile } = await supabase
                            .from('profiles')
                            .insert({
                                id: currentUser.id,
                                username: fallbackUsername,
                                role: 'user',
                                created_at: new Date().toISOString()
                            })
                            .select()
                            .single();

                        if (newProfile) profileData = newProfile;
                    } catch (pErr) {
                        console.warn('[Auth] Auto profile catch:', pErr);
                    }
                }

                if (isActive && profileData) {
                    setProfile(profileData);
                }

                // Ensure Journal project exists
                await ensureJournalProject(currentUser.id);

                // Show welcome modal for first-time users
                if (!currentUser.user_metadata?.yolofuck_welcomed) {
                    setShowWelcomeModal(true);
                }
            } else {
                setUser(null);
                setProfile(null);
            }

            if (isActive) setLoading(false);
        };

        // Initial session check
        supabase.auth.getSession().then(({ data: { session } }) => {
            handleAuthChange('INITIAL_SESSION', session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile, ensureJournalProject]);

    const signOut = async () => {
        setUser(null);
        setProfile(null);

        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[Auth] Supabase signOut error:', err);
        } finally {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/';
        }
    };

    const isAdmin = useMemo(() =>
        profile?.role === 'admin',
        [profile?.role]);

    const emailConfirmed = useMemo(() => isEmailVerified(user), [user]);

    const needsUsername = useMemo(() =>
        !!user && !!profile && (
            profile.username?.startsWith('user_') && profile.username?.length === 13
        ),
        [user, profile]);

    const dismissWelcome = useCallback(async () => {
        setShowWelcomeModal(false);
        if (userRef.current) {
            await supabase.auth.updateUser({ data: { yolofuck_welcomed: true } });
        }
    }, []);

    const contextValue = useMemo(() => ({
        user,
        profile,
        isAdmin,
        emailConfirmed,
        needsUsername,
        loading,
        showWelcomeModal,
        dismissWelcome,
        showPasswordResetModal,
        closePasswordResetModal: () => setShowPasswordResetModal(false),
        signOut,
        refreshProfile
    }), [user, profile, isAdmin, emailConfirmed, needsUsername, loading, showWelcomeModal, showPasswordResetModal, signOut, refreshProfile, dismissWelcome]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
