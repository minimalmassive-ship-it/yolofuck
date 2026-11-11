/**
 * AuthContext.tsx — yolofuck
 * 
 * Supabase authentication and user profile management for yolofuck Journal.
 * Strictly NO purple/pink colors.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseAuth } from '../lib/supabase';

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
    signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUpWithEmail: (email: string, password: string, username?: string) => Promise<{ data: any; error: Error | null }>;
    resetPasswordForEmail: (email: string) => Promise<{ data?: any; error: Error | null }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const mounted = useRef(true);

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

            if (error || !data) {
                return null;
            }
            return data as Profile | null;
        } catch {
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
                    color: '#10b981',
                    description: 'Daily video journal',
                    is_public: false,
                    is_system: true,
                    system_type: 'journal'
                });
            }
        } catch (e) {
            console.warn('[Auth] ensureJournalProject note:', e);
        }
    }, []);

    useEffect(() => {
        let isActive = true;

        const handleAuthChange = async (_event: string, session: any) => {
            if (!isActive) return;

            const currentUser = session?.user ?? null;

            if (currentUser) {
                setUser(currentUser);

                let profileData = await fetchProfile(currentUser.id);

                if (!profileData && isActive) {
                    try {
                        const fallbackUsername = currentUser.user_metadata?.username ||
                            currentUser.user_metadata?.full_name ||
                            currentUser.email?.split('@')[0] ||
                            'Plasticin';

                        const profilePayload = {
                            id: currentUser.id,
                            username: fallbackUsername,
                            role: 'user',
                            created_at: new Date().toISOString()
                        };

                        // Create profile on Central Auth DB
                        const { data: newProfile } = await supabaseAuth
                            .from('profiles')
                            .insert(profilePayload)
                            .select()
                            .single();

                        if (newProfile) profileData = newProfile;

                        // Mirror to Yolofuck DB
                        try {
                            await supabase.from('profiles').upsert(profilePayload);
                        } catch {}
                    } catch (pErr) {
                        console.warn('[Auth] Auto profile catch:', pErr);
                    }
                } else if (profileData) {
                    // Mirror profile to Yolofuck DB so foreign keys / relations work
                    try {
                        await supabase
                            .from('profiles')
                            .upsert({
                                id: currentUser.id,
                                username: profileData.username,
                                role: profileData.role || 'user',
                                updated_at: new Date().toISOString()
                            });
                    } catch {}
                }

                if (isActive && profileData) {
                    setProfile(profileData);
                }

                // Attribute local legacy owner ID to current user so previous takes load seamlessly
                if (!localStorage.getItem('yolofuck_local_owner_id')) {
                    localStorage.setItem('yolofuck_local_owner_id', currentUser.id);
                }

                await ensureJournalProject(currentUser.id);
            } else {
                setUser(null);
                setProfile(null);
            }

            if (isActive) setLoading(false);
        };

        supabaseAuth.auth.getSession().then(({ data: { session } }) => {
            if (isActive) {
                handleAuthChange('INITIAL', session);
            }
        });

        const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(handleAuthChange);

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile, ensureJournalProject]);

    const signInWithEmail = useCallback(async (email: string, password: string) => {
        try {
            let res = await supabaseAuth.auth.signInWithPassword({ email: email.trim(), password });
            if (res.error && (supabaseAuth as any) !== (supabase as any)) {
                const fallback = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (!fallback.error) {
                    res = fallback;
                }
            }
            if (res.error) return { error: res.error };
            return { error: null };
        } catch (err: any) {
            return { error: err };
        }
    }, []);

    const resetPasswordForEmail = useCallback(async (email: string) => {
        try {
            let res = await supabaseAuth.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/`,
            });
            if (res.error && (supabaseAuth as any) !== (supabase as any)) {
                const fallback = await supabase.auth.resetPasswordForEmail(email.trim(), {
                    redirectTo: `${window.location.origin}/`,
                });
                if (!fallback.error) {
                    res = fallback;
                }
            }
            return res;
        } catch (err: any) {
            return { data: null, error: err };
        }
    }, []);

    const signUpWithEmail = useCallback(async (email: string, password: string, username?: string) => {
        try {
            const finalUsername = username || email.split('@')[0];
            const { data, error } = await supabaseAuth.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
                    data: {
                        username: finalUsername,
                        full_name: finalUsername,
                    }
                }
            });
            if (error) return { data: null, error };
            if (data.user) {
                const profilePayload = {
                    id: data.user.id,
                    username: finalUsername,
                    role: 'user',
                    created_at: new Date().toISOString(),
                };
                // Upsert to Central Auth DB
                try {
                    await supabaseAuth.from('profiles').upsert(profilePayload);
                } catch {}
                // Mirror to Yolofuck Data DB
                try {
                    await supabase.from('profiles').upsert(profilePayload);
                } catch {}
            }
            return { data, error: null };
        } catch (err: any) {
            return { data: null, error: err };
        }
    }, []);

    const signOut = useCallback(async () => {
        try {
            await supabaseAuth.auth.signOut();
        } catch (e) {
            console.error('[Auth] Error signing out:', e);
        }
        setUser(null);
        setProfile(null);
    }, []);

    const dismissWelcome = useCallback(() => setShowWelcomeModal(false), []);
    const closePasswordResetModal = useCallback(() => setShowPasswordResetModal(false), []);

    const value = useMemo(() => ({
        user,
        profile,
        isAdmin: profile?.role === 'admin',
        emailConfirmed: true,
        needsUsername: false,
        loading,
        showWelcomeModal,
        dismissWelcome,
        showPasswordResetModal,
        closePasswordResetModal,
        signInWithEmail,
        signUpWithEmail,
        resetPasswordForEmail,
        signOut,
        refreshProfile,
    }), [user, profile, loading, showWelcomeModal, dismissWelcome, showPasswordResetModal, closePasswordResetModal, signInWithEmail, signUpWithEmail, resetPasswordForEmail, signOut, refreshProfile]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
