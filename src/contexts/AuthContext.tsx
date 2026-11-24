/**
 * AuthContext.tsx — yolofuck
 * 
 * Supabase authentication and user profile management for yolofuck Journal.
 * Strictly NO purple/pink colors.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseAuth } from '../lib/supabase';
import {
    PlatformPlasticinOrgId,
    PrimaryPlasticinOrgId,
    fetchPlasticinOrganizations,
  getPlasticinAuthHeaders,
    isAbortError,
    isSameOrgEntity,
    resolveCanonicalPlasticinOrgId,
    sanitizeOrgDescription,
    sanitizeOrgName,
    subscribeToEcosystemOrgSync,
    type PlasticinDirectoryOrg,
} from '../lib/ecosystemOrgSync';

export type OrganizationItem = PlasticinDirectoryOrg;

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

export interface AuthModalPrefill {
    identifier?: string;
    step?: 'email' | 'otp' | 'profile' | 'security_review' | 'password_fallback';
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
    authModalPrefill?: AuthModalPrefill | null;
    openAuthModal: (mode?: 'signin' | 'signup', prefill?: AuthModalPrefill) => void;
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
    organizations: OrganizationItem[];
    activeOrganization: OrganizationItem | null;
    setActiveOrganization: (org: OrganizationItem | null) => void;
    updateOrganizationInState: (orgId: string, name: string, description?: string) => void;
    refreshOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
    const [authModalPrefill, setAuthModalPrefill] = useState<AuthModalPrefill | null>(null);
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const [organizations, setOrganizations] = useState<OrganizationItem[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const cached = localStorage.getItem('memcut_organizations');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch {}
        return [];
    });
    const [activeOrganization, setActiveOrganizationState] = useState<OrganizationItem | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const cached = localStorage.getItem('memcut_organizations');
            const savedId = localStorage.getItem('memcut_active_org_id');
            if (savedId === 'personal') return null;
            if (cached) {
                const parsed = JSON.parse(cached) as OrganizationItem[];
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (savedId) {
                        const match = parsed.find((o) => isSameOrgEntity(o.id, savedId));
                        if (match) return match;
                    }
                    return parsed.find((o) => o.id === PrimaryPlasticinOrgId) || parsed[0];
                }
            }
        } catch {}
        return null;
    });
    const mounted = useRef(true);

    const setActiveOrganization = useCallback((org: OrganizationItem | null) => {
        const normalized = org ? { ...org, id: resolveCanonicalPlasticinOrgId(org.id) } : null;
        setActiveOrganizationState(normalized);
        try {
            if (normalized) {
                localStorage.setItem('memcut_active_org_id', normalized.id);
            } else {
                localStorage.setItem('memcut_active_org_id', 'personal');
            }
        } catch {}
    }, []);

    const updateOrganizationInState = useCallback((orgId: string, name: string, description?: string) => {
        const canonicalId = resolveCanonicalPlasticinOrgId(orgId);
        const cleanName = sanitizeOrgName(name, '');
        if (!cleanName) return;
        if (canonicalId !== PlatformPlasticinOrgId && cleanName === 'Plasticin') return;
        const cleanDesc = description !== undefined ? sanitizeOrgDescription(description) : undefined;

        setOrganizations((prev) => {
            const next = prev.map((org) =>
                isSameOrgEntity(org.id, canonicalId)
                    ? {
                        ...org,
                        id: canonicalId,
                        name: cleanName,
                        ...(cleanDesc !== undefined ? { description: cleanDesc } : {}),
                    }
                    : org
            );
            try {
                localStorage.setItem('memcut_organizations', JSON.stringify(next));
            } catch {}
            return next;
        });

        setActiveOrganizationState((prev) => {
            if (!prev || !isSameOrgEntity(prev.id, canonicalId)) return prev;
            return {
                ...prev,
                id: canonicalId,
                name: cleanName,
                ...(cleanDesc !== undefined ? { description: cleanDesc } : {}),
            };
        });
    }, []);

    const refreshOrgsInFlightRef = useRef<Promise<void> | null>(null);
    const refreshOrganizations = useCallback(async () => {
        if (refreshOrgsInFlightRef.current) return refreshOrgsInFlightRef.current;
        const run = (async () => {
            const headers = await getPlasticinAuthHeaders(false);
            if (!headers['Authorization']) return;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 3500);
            try {
                const list = await fetchPlasticinOrganizations(ctrl.signal);
            if (!mounted.current || list.length === 0) return;
            setOrganizations(list);
            try {
                localStorage.setItem('memcut_organizations', JSON.stringify(list));
            } catch {}
            setActiveOrganizationState((prev) => {
                const savedId = localStorage.getItem('memcut_active_org_id');
                if (savedId === 'personal') return null;
                if (prev) {
                    return list.find((o) => isSameOrgEntity(o.id, prev.id)) || prev;
                }
                if (savedId) {
                    const matched = list.find((o) => isSameOrgEntity(o.id, savedId));
                    if (matched) return matched;
                }
                return list.find((o) => o.id === PrimaryPlasticinOrgId) || list[0] || null;
            });
        } catch (err) {
            if (!isAbortError(err)) {
                console.warn('[Auth] Organization boot sync warning:', err);
            }
            } finally {
                clearTimeout(timer);
                refreshOrgsInFlightRef.current = null;
            }
        })();
        refreshOrgsInFlightRef.current = run;
        return run;
    }, []);

    // Ecosystem Realtime Channel (sync triggers only after auth session resolves)
    useEffect(() => {
        const unsubscribe = subscribeToEcosystemOrgSync({
            onOrganizationUpdated: ({ id, name, description }) => {
                updateOrganizationInState(id, name, description);
            },
            onTeamsUpdated: () => {
                refreshOrganizations();
            },
        });
        return () => {
            unsubscribe();
        };
    }, [refreshOrganizations, updateOrganizationInState]);

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

    const openAuthModal = useCallback((mode: 'signin' | 'signup' = 'signin', prefill?: AuthModalPrefill) => {
        setAuthModalMode(mode);
        setAuthModalPrefill(prefill || null);
        setAuthModalOpen(true);
    }, []);

    const closeAuthModal = useCallback(() => {
        setAuthModalOpen(false);
        setAuthModalPrefill(null);
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
            // 1. Query IAM system role deterministically by immutable userId
            let resolvedRole: 'user' | 'admin' = 'user';
            try {
                const { data: sysRole } = await supabaseAuth
                    .from('plasticin_system_roles')
                    .select('system_role')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (sysRole?.system_role) {
                    resolvedRole = 'admin';
                }
            } catch {}

            // 2. Central plasticin_users table in Master DB
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
                    role: resolvedRole,
                    created_at: plstData.created_at,
                    updated_at: plstData.updated_at,
                };
            }

            // Central Plasticin Auth DB uses plasticin_users (no profiles table); fall through to Memcut DB profiles

            // 4. Fallback to local Memcut DB profiles table
            const { data: localProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (localProfile) {
                return { ...(localProfile as Profile), role: resolvedRole === 'admin' ? 'admin' : (localProfile.role || 'user') };
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

            let currentUser = session?.user ?? null;
            if (!currentUser && typeof window !== 'undefined') {
                const ssoToken = sessionStorage.getItem('plasticin_oidc_access_token') || localStorage.getItem('plasticin_oidc_access_token');
                const rawUser = localStorage.getItem('plasticin_sso_user');
                if (ssoToken && rawUser) {
                    try {
                        const parsed = JSON.parse(rawUser);
                        if (parsed?.sub && parsed?.email) {
                            currentUser = {
                                id: parsed.sub,
                                email: parsed.email,
                                app_metadata: { provider: 'plasticin' },
                                user_metadata: {
                                    user_name: parsed.preferred_username || parsed.name || parsed.email.split('@')[0],
                                    full_name: parsed.name || parsed.preferred_username || parsed.email.split('@')[0],
                                    avatar_url: parsed.picture || parsed.avatar_url || parsed.avatarUrl || 'https://plasticin.com/default-avatar.png',
                                },
                                aud: 'authenticated',
                                created_at: new Date().toISOString(),
                            } as any;
                        }
                    } catch {}
                }
            }

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
                        const avatarUrl =
                            currentUser.user_metadata?.avatar_url ||
                            currentUser.user_metadata?.picture ||
                            currentUser.user_metadata?.avatarUrl ||
                            'https://plasticin.com/default-avatar.png';

                        // Sync to Central plasticin_users only when an authenticated Plasticin Auth session matches currentUser.id
                        try {
                            const { data: authSessionData } = await supabaseAuth.auth.getSession();
                            if (authSessionData?.session?.user?.id === currentUser.id) {
                                await supabaseAuth.from('plasticin_users').upsert({
                                    id: currentUser.id,
                                    username: cleanHandle,
                                    display_name: displayName,
                                    email: currentUser.email || '',
                                    avatar_url: avatarUrl,
                                    origin_app: 'memcut.com',
                                }, { onConflict: 'id' });
                            }
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

                        // Mirror to Memcut data DB only if an active session exists on this client
                        try {
                            const { data: memcutSession } = await supabase.auth.getSession();
                            if (memcutSession?.session?.user) {
                                await supabase.from('profiles').upsert(profilePayload);
                            }
                        } catch {}
                    } catch (pErr) {
                        console.warn('[Auth] Auto profile catch:', pErr);
                    }
                } else if (profileData) {
                    // Mirror profile to Memcut DB only if an active session exists
                    try {
                        const { data: memcutSession } = await supabase.auth.getSession();
                        if (memcutSession?.session?.user) {
                            await supabase
                                .from('profiles')
                                .upsert({
                                    id: currentUser.id,
                                    username: profileData.username,
                                    role: profileData.role || 'user',
                                    avatar_url: profileData.avatar_url,
                                    updated_at: new Date().toISOString()
                                });
                        }
                    } catch {}
                }

                if (isActive && profileData) {
                    setProfile(profileData);
                }

                // Live authoritative avatar refresh from id.plasticin.com OIDC userinfo
                if (typeof window !== 'undefined') {
                    const oidcToken =
                        sessionStorage.getItem('plasticin_oidc_access_token') ||
                        localStorage.getItem('plasticin_oidc_access_token');
                    if (oidcToken) {
                        fetch('https://plasticin.com/api/oauth/userinfo', {
                            headers: { Authorization: `Bearer ${oidcToken}` },
                            credentials: 'omit',
                            cache: 'no-store',
                        })
                            .then((res) => (res.ok ? res.json() : null))
                            .then((info) => {
                                if (!isActive || !info) return;
                                const freshPicture = typeof info.picture === 'string' && info.picture.trim() && !info.picture.startsWith('data:')
                                    ? info.picture.trim()
                                    : (typeof info.avatar_url === 'string' && info.avatar_url.trim() && !info.avatar_url.startsWith('data:')
                                        ? info.avatar_url.trim()
                                        : null);
                                if (freshPicture) {
                                    setProfile((prev) => (prev ? { ...prev, avatar_url: freshPicture } : prev));
                                    setUser((prev) =>
                                        prev
                                            ? ({
                                                  ...prev,
                                                  user_metadata: {
                                                      ...prev.user_metadata,
                                                      avatar_url: freshPicture,
                                                      picture: freshPicture,
                                                  },
                                              } as User)
                                            : prev
                                    );
                                    try {
                                        const cachedRaw = localStorage.getItem('plasticin_sso_user');
                                        if (cachedRaw) {
                                            const parsed = JSON.parse(cachedRaw);
                                            parsed.picture = freshPicture;
                                            parsed.avatar_url = freshPicture;
                                            localStorage.setItem('plasticin_sso_user', JSON.stringify(parsed));
                                        }
                                    } catch {}
                                }
                            })
                            .catch(() => {});
                    }
                }

                refreshOrganizations();

                // Bind local owner ID strictly to authenticated user.id
                try {
                    localStorage.setItem('memcut_local_owner_id', currentUser.id);
                } catch {}
            } else {
                setUser(null);
                setProfile(null);
            }

            if (isActive) setLoading(false);
        };

        supabaseAuth.auth.getSession().then(({ data: { session } }) => {
            if (isActive) {
                handleAuthChange('INITIAL', session ?? null);
            }
        });

        const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(handleAuthChange);

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    // Live avatar refresh when returning to tab (throttled to 30s)
    useEffect(() => {
        if (typeof document === 'undefined' || !user) return;
        let lastCheckedAt = Date.now();
        const onVisibility = async () => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastCheckedAt < 30_000) return;
            lastCheckedAt = now;
            const oidcToken =
                sessionStorage.getItem('plasticin_oidc_access_token') ||
                localStorage.getItem('plasticin_oidc_access_token');
            if (!oidcToken) return;
            try {
                const res = await fetch('https://plasticin.com/api/oauth/userinfo', {
                    headers: { Authorization: `Bearer ${oidcToken}` },
                    credentials: 'omit',
                    cache: 'no-store',
                });
                if (!res.ok) return;
                const info = await res.json();
                const freshPicture = typeof info?.picture === 'string' && info.picture.trim() && !info.picture.startsWith('data:')
                    ? info.picture.trim()
                    : (typeof info?.avatar_url === 'string' && info.avatar_url.trim() && !info.avatar_url.startsWith('data:')
                        ? info.avatar_url.trim()
                        : null);
                if (freshPicture && mounted.current) {
                    setProfile((prev) => (prev ? { ...prev, avatar_url: freshPicture } : prev));
                    setUser((prev) =>
                        prev
                            ? ({
                                  ...prev,
                                  user_metadata: {
                                      ...prev.user_metadata,
                                      avatar_url: freshPicture,
                                      picture: freshPicture,
                                  },
                              } as User)
                            : prev
                    );
                }
            } catch {
                // Non-blocking background refresh
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [user]);

    const signInWithEmail = useCallback(async (email: string, password: string) => {
        try {
            const cleanEmail = email.trim().toLowerCase();
            const res = await supabaseAuth.auth.signInWithPassword({ email: cleanEmail, password });

            // Dual authentication: also sign in to Memcut data DB if same credentials are registered
            if (!res.error) {
                try {
                    await supabase.auth.signInWithPassword({ email: cleanEmail, password });
                } catch {}
            }

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

            if (data.user && data.session) {
                try {
                    await supabaseAuth.from('plasticin_users').upsert({
                        id: data.user.id,
                        username: cleanHandle,
                        display_name: cleanUser,
                        email: cleanEmail,
                        avatar_url: 'https://plasticin.com/default-avatar.png',
                        origin_app: 'memcut.com',
                    }, { onConflict: 'id' });
                } catch {}

                try {
                    const { data: memcutSession } = await supabase.auth.getSession();
                    if (memcutSession?.session?.user) {
                        await supabase.from('profiles').upsert({
                            id: data.user.id,
                            username: cleanHandle,
                            role: 'user',
                            created_at: new Date().toISOString(),
                        });
                    }
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
            localStorage.removeItem('plasticin_sso_user');
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
        authModalPrefill,
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
        organizations,
        activeOrganization,
        setActiveOrganization,
        updateOrganizationInState,
        refreshOrganizations,
    }), [user, profile, loading, authModalOpen, authModalMode, authModalPrefill, openAuthModal, closeAuthModal, showWelcomeModal, dismissWelcome, showPasswordResetModal, closePasswordResetModal, signInWithEmail, signUpWithEmail, signInWithGoogle, sendOtpEmail, verifyOtp, resetPasswordForEmail, signOut, refreshProfile, organizations, activeOrganization, setActiveOrganization, updateOrganizationInState, refreshOrganizations]);

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

