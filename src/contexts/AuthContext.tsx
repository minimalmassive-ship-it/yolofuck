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
    authModalOpen: boolean;
    authModalMode: 'signin' | 'signup';
    openAuthModal: (mode?: 'signin' | 'signup') => void;
    closeAuthModal: () => void;
    showWelcomeModal: boolean;
    dismissWelcome: () => void;
    showPasswordResetModal: boolean;
    closePasswordResetModal: () => void;
    signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUpWithEmail: (email: string, password: string, username?: string) => Promise<{ data: any; error: Error | null }>;
    signInWithGoogle: () => Promise<{ error: Error | null }>;
    sendOtpEmail: (email: string) => Promise<{ error: Error | null }>;
    verifyOtp: (email: string, token: string) => Promise<{ session: any; error: Error | null }>;
    resetPasswordForEmail: (email: string) => Promise<{ data?: any; error: Error | null }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    // Check URL hash for modal opening on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const hash = window.location.hash.toLowerCase();
        if (hash === '#signup' || hash === '#register' || hash === '#join') {
            setAuthModalMode('signup');
            setAuthModalOpen(true);
        } else if (hash === '#signin' || hash === '#login') {
            setAuthModalMode('signin');
            setAuthModalOpen(true);
        }
    }, []);

    const openAuthModal = useCallback((mode: 'signin' | 'signup' = 'signin') => {
        setAuthModalMode(mode);
        setAuthModalOpen(true);
    }, []);

    const closeAuthModal = useCallback(() => {
        setAuthModalOpen(false);
        if (typeof window !== 'undefined' && window.location.hash) {
            const h = window.location.hash.toLowerCase();
            if (h === '#login' || h === '#signin' || h === '#signup' || h === '#register' || h === '#join') {
                try {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                } catch {}
            }
        }
    }, []);

    const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
        try {
            // 0. Primary override for minimalmassive@gmail.com to guarantee full continuity
            if (userId === '39192441-3caa-40fe-9102-f40924c03166' || userId === '4fb34c08-a3b7-45b3-a7ad-fda625eae464') {
                return {
                    id: userId,
                    username: '@minimalmassive',
                    display_name: 'minimalmassive',
                    full_name: 'minimalmassive',
                    role: 'admin',
                    avatar_url: 'https://plasticin.com/default-avatar.png',
                    created_at: '2026-11-13T09:00:14.725971+00:00',
                };
            }

            // 1. Primary check: Central plasticin_users table in Master DB
            const { data: plstData } = await supabaseAuth
                .from('plasticin_users')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (plstData) {
                const cleanUser = (plstData.username || '').replace(/^@+/, '') || 'user';
                return {
                    id: plstData.id,
                    username: plstData.username?.startsWith('@') ? plstData.username : `@${cleanUser}`,
                    display_name: plstData.display_name || cleanUser,
                    full_name: plstData.display_name || cleanUser,
                    avatar_url: plstData.avatar_url,
                    role: 'user',
                    created_at: plstData.created_at,
                    updated_at: plstData.updated_at,
                };
            }

            // 2. Secondary fallback: profiles table in Central Auth DB
            const { data: authProfile } = await supabaseAuth
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (authProfile) {
                return authProfile as Profile;
            }

            // 3. Fallback to local Memcut DB profiles table
            const { data: localProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (localProfile) {
                return localProfile as Profile;
            }

            return null;
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
                        const rawName = currentUser.user_metadata?.user_name ||
                            currentUser.user_metadata?.username ||
                            currentUser.user_metadata?.full_name ||
                            currentUser.email?.split('@')[0] ||
                            'plasticin';
                        const cleanUser = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 15) || 'user';
                        const cleanHandle = `@${cleanUser}`;
                        const displayName = currentUser.user_metadata?.full_name || cleanUser;
                        const avatarUrl = currentUser.user_metadata?.avatar_url || 'https://plasticin.com/default-avatar.png';

                        // Upsert into Central plasticin_users master table
                        try {
                            await supabaseAuth.from('plasticin_users').upsert({
                                id: currentUser.id,
                                username: cleanHandle,
                                display_name: displayName,
                                email: currentUser.email || '',
                                avatar_url: avatarUrl,
                                origin_app: 'memcut.com',
                            }, { onConflict: 'email' });
                        } catch (plstErr) {
                            console.warn('[Auth] plasticin_users upsert notice:', plstErr);
                        }

                        const profilePayload = {
                            id: currentUser.id,
                            username: cleanHandle,
                            role: 'user',
                            avatar_url: avatarUrl,
                            display_name: displayName,
                            full_name: displayName,
                            created_at: new Date().toISOString()
                        };

                        profileData = profilePayload as Profile;

                        // Mirror to Memcut data DB so foreign keys / relations work
                        try {
                            await supabase.from('profiles').upsert(profilePayload);
                        } catch {}
                    } catch (pErr) {
                        console.warn('[Auth] Auto profile catch:', pErr);
                    }
                } else if (profileData) {
                    // Mirror profile to Memcut DB for table relations
                    try {
                        await supabase
                            .from('profiles')
                            .upsert({
                                id: currentUser.id,
                                username: profileData.username,
                                role: profileData.role || 'user',
                                avatar_url: profileData.avatar_url,
                                updated_at: new Date().toISOString()
                            });
                    } catch {}
                }

                if (isActive && profileData) {
                    setProfile(profileData);
                }

                // Attribute local owner ID to current user so takes load seamlessly
                if (currentUser.email === 'minimalmassive@gmail.com' || currentUser.id === '39192441-3caa-40fe-9102-f40924c03166') {
                    localStorage.setItem('memcut_local_owner_id', '4fb34c08-a3b7-45b3-a7ad-fda625eae464');
                    localStorage.setItem('yolofuck_local_owner_id', '4fb34c08-a3b7-45b3-a7ad-fda625eae464');
                    localStorage.setItem('plasticin_id', 'usr_plst_f08ceecf');
                    localStorage.setItem('plasticin_username', '@minimalmassive');
                } else if (!localStorage.getItem('memcut_local_owner_id')) {
                    const existing = localStorage.getItem('yolofuck_local_owner_id') || currentUser.id;
                    localStorage.setItem('memcut_local_owner_id', existing);
                }
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
    }, [fetchProfile]);

    const signInWithEmail = useCallback(async (email: string, password: string) => {
        try {
            const cleanEmail = email.trim().toLowerCase();
            const res = await supabaseAuth.auth.signInWithPassword({ email: cleanEmail, password });
            
            // Dual authentication: also sign in to Memcut data DB so RLS accepts requests
            try {
                await supabase.auth.signInWithPassword({ email: cleanEmail, password });
            } catch {}

            if (res.error) return { error: res.error };
            return { error: null };
        } catch (err: any) {
            return { error: err };
        }
    }, []);

    const signUpWithEmail = useCallback(async (email: string, password: string, username?: string) => {
        try {
            const cleanEmail = email.trim().toLowerCase();
            const rawUser = username || cleanEmail.split('@')[0];
            const cleanUser = rawUser.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 15) || 'user';
            const cleanHandle = `@${cleanUser}`;

            const { data, error } = await supabaseAuth.auth.signUp({
                email: cleanEmail,
                password,
                options: {
                    emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
                    data: {
                        user_name: cleanHandle,
                        username: cleanHandle,
                        full_name: cleanUser,
                        profile_completed: true,
                    }
                }
            });

            if (error) return { data: null, error };

            if (data.user) {
                try {
                    await supabaseAuth.from('plasticin_users').upsert({
                        id: data.user.id,
                        username: cleanHandle,
                        display_name: cleanUser,
                        email: cleanEmail,
                        avatar_url: 'https://plasticin.com/default-avatar.png',
                        origin_app: 'memcut.com',
                    }, { onConflict: 'email' });
                } catch {}

                try {
                    await supabase.from('profiles').upsert({
                        id: data.user.id,
                        username: cleanHandle,
                        role: 'user',
                        created_at: new Date().toISOString(),
                    });
                } catch {}
            }

            return { data, error: null };
        } catch (err: any) {
            return { data: null, error: err };
        }
    }, []);

    const signInWithGoogle = useCallback(async () => {
        try {
            const { error } = await supabaseAuth.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/`,
                },
            });
            if (error) return { error };
            return { error: null };
        } catch (err: any) {
            return { error: err };
        }
    }, []);

    const sendOtpEmail = useCallback(async (targetEmail: string) => {
        try {
            const { error } = await supabaseAuth.auth.signInWithOtp({
                email: targetEmail.trim().toLowerCase(),
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: `${window.location.origin}/`,
                },
            });
            if (error) return { error };
            return { error: null };
        } catch (err: any) {
            return { error: err };
        }
    }, []);

    const verifyOtp = useCallback(async (targetEmail: string, token: string) => {
        const cleanEmail = targetEmail.trim().toLowerCase();
        const cleanCode = token.trim().toUpperCase();
        try {
            let { data, error } = await supabaseAuth.auth.verifyOtp({
                email: cleanEmail,
                token: cleanCode,
                type: 'email',
            });
            if (error) {
                const signupRes = await supabaseAuth.auth.verifyOtp({
                    email: cleanEmail,
                    token: cleanCode,
                    type: 'signup',
                });
                if (!signupRes.error) {
                    data = signupRes.data;
                    error = null;
                }
            }
            if (error) return { session: null, error };
            return { session: data?.session, error: null };
        } catch (err: any) {
            return { session: null, error: err };
        }
    }, []);

    const resetPasswordForEmail = useCallback(async (email: string) => {
        try {
            const res = await supabaseAuth.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
                redirectTo: `${window.location.origin}/`,
            });
            return res;
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
        try {
            localStorage.removeItem('memcut_local_owner_id');
            localStorage.removeItem('yolofuck_local_owner_id');
            sessionStorage.clear();
        } catch {}
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
        authModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
        showWelcomeModal,
        dismissWelcome,
        showPasswordResetModal,
        closePasswordResetModal,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        sendOtpEmail,
        verifyOtp,
        resetPasswordForEmail,
        signOut,
        refreshProfile,
    }), [user, profile, loading, authModalOpen, authModalMode, openAuthModal, closeAuthModal, showWelcomeModal, dismissWelcome, showPasswordResetModal, closePasswordResetModal, signInWithEmail, signUpWithEmail, signInWithGoogle, sendOtpEmail, verifyOtp, resetPasswordForEmail, signOut, refreshProfile]);

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

