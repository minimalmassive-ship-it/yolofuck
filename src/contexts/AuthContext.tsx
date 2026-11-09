/**
 * AuthContext.tsx — yolofuck
 * 
 * Frictionless authentication and persistent identity for yolofuck Journal.
 * Automatically provides an instant, persistent device identity so users can
 * use the journal immediately without any login hurdles.
 * Strictly NO purple/pink colors.
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

const DEVICE_USER_KEY = 'yolofuck_device_user_id';
function getOrCreateDeviceUserId(): string {
    let id = localStorage.getItem(DEVICE_USER_KEY);
    if (!id) {
        id = `usr_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
        localStorage.setItem(DEVICE_USER_KEY, id);
    }
    return id;
}

function createLocalDeviceUser(): { user: User; profile: Profile } {
    const deviceId = getOrCreateDeviceUserId();
    const user = {
        id: deviceId,
        app_metadata: {},
        user_metadata: {
            username: 'Journal',
            full_name: 'Journal'
        },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: 'local@yolofuck.com'
    } as unknown as User;

    const profile: Profile = {
        id: deviceId,
        username: 'Journal',
        role: 'user',
        created_at: new Date().toISOString()
    };

    return { user, profile };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const localFallback = useMemo(() => createLocalDeviceUser(), []);
    const [user, setUser] = useState<User | null>(localFallback.user);
    const [profile, setProfile] = useState<Profile | null>(localFallback.profile);
    const [loading, setLoading] = useState(false);
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const mounted = useRef(true);
    const userRef = useRef<User | null>(localFallback.user);

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
                            'Journal';

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

                await ensureJournalProject(currentUser.id);
            } else {
                // Persistent instant device session
                const fallback = createLocalDeviceUser();
                setUser(fallback.user);
                setProfile(fallback.profile);
            }

            if (isActive) setLoading(false);
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (isActive) {
                handleAuthChange('INITIAL', session);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile, ensureJournalProject]);

    const signOut = useCallback(async () => {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error('[Auth] Error signing out:', e);
        }
        const fallback = createLocalDeviceUser();
        setUser(fallback.user);
        setProfile(fallback.profile);
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
        signOut,
        refreshProfile,
    }), [user, profile, loading, showWelcomeModal, dismissWelcome, showPasswordResetModal, closePasswordResetModal, signOut, refreshProfile]);

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
