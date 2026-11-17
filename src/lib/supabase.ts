/**
 * supabase.ts — Memcut
 *
 * Plasticin Ecosystem Architecture:
 * 1. Central Plasticin Master Auth (igrxuwvlnpthvrbfhlpu):
 *    - The single place of truth for accounts across the entire ecosystem.
 *    - auth.users, public.plasticin_users, Google OAuth, WebAuthn Passkeys.
 * 2. Dedicated Memcut Data & Media Supabase (ngzffnpyrqpjxuxkjvnl):
 *    - Stores journal_clips, journal_entries, shared_stories, and media storage buckets.
 */

import { createClient } from '@supabase/supabase-js';

// ── Central Plasticin Master Auth & Identity (igrxuwvlnpthvrbfhlpu) ─────────
export const PLASTICIN_AUTH_URL =
    import.meta.env.VITE_AUTH_SUPABASE_URL || 'https://igrxuwvlnpthvrbfhlpu.supabase.co';
export const PLASTICIN_AUTH_ANON_KEY =
    import.meta.env.VITE_AUTH_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlncnh1d3ZsbnB0aHZyYmZobHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MjEwNTcsImV4cCI6MjExMDA5NzA1N30.aRwxqgP_oS92a-TK_ov-F0kDhA_FyQitarhytGXzKvE';

// ── Dedicated Memcut Database & Media Supabase (ngzffnpyrqpjxuxkjvnl) ─────────
const DEFAULT_DATA_URL = 'https://ngzffnpyrqpjxuxkjvnl.supabase.co';
const DEFAULT_DATA_ANON_KEY = 'sb_publishable_OTOXvTGJejxfXyClIEPjmg_vmx6tjy_';

export const dataSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_DATA_URL;
export const dataSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_DATA_ANON_KEY;
export const authSupabaseUrl = PLASTICIN_AUTH_URL;
export const authSupabaseAnonKey = PLASTICIN_AUTH_ANON_KEY;

// Synchronize legacy tokens so existing users remain seamlessly logged in
if (typeof window !== 'undefined') {
    try {
        const legacyToken = localStorage.getItem('plasticin-auth-token') ||
            localStorage.getItem('memcut-auth-token') ||
            localStorage.getItem('yolofuck-auth-token');
        if (legacyToken) {
            if (!localStorage.getItem('plasticin-auth-token')) {
                localStorage.setItem('plasticin-auth-token', legacyToken);
            }
            if (!localStorage.getItem('memcut-auth-token')) {
                localStorage.setItem('memcut-auth-token', legacyToken);
            }
        }
    } catch {}
}

// Master Auth client: strictly connects to Central Plasticin Supabase
export const supabaseAuth = createClient(
    authSupabaseUrl,
    authSupabaseAnonKey,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'plasticin-auth-token',
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        }
    }
);

// Primary client for Memcut data tables, storage buckets & recordings
export const supabase = createClient(
    dataSupabaseUrl,
    dataSupabaseAnonKey,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'memcut-auth-token',
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        }
    }
);

export const supabaseData = supabase;

// Lightweight client for public data queries (e.g. shared public stories)
export const supabasePublic = createClient(
    dataSupabaseUrl,
    dataSupabaseAnonKey,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'memcut.public.auth.token',
        }
    }
);

// ── Ecosystem Partner Supabase Clients (Ideanite & Archimantis) ────────────
export const ARCHIMANTIS_PROD_URL = 'https://gauzjywsrqvhrjtbjuap.supabase.co';
export const ARCHIMANTIS_PROD_ANON_KEY = 'sb_publishable_QtPeDBNfIkdfpu9sk8EiJQ_4Iq84UWu';

export const IDEANITE_DEV_URL = 'https://pemllfgsegqnndesewbx.supabase.co';
export const IDEANITE_DEV_ANON_KEY = 'sb_publishable_5SAjvbisW5QsaG0MAI5s9A_kZNjZ_A-';

export const supabaseProdAuth = createClient(
    ARCHIMANTIS_PROD_URL,
    ARCHIMANTIS_PROD_ANON_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'memcut.archimantis_prod.auth.token',
        }
    }
);

export const supabaseIdeaniteAuth = createClient(
    IDEANITE_DEV_URL,
    IDEANITE_DEV_ANON_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'memcut.ideanite_dev.auth.token',
        }
    }
);

// ── Master Admin Client for Cross-Ecosystem Password Synchronization ────────
const PLASTICIN_SERVICE_ROLE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlncnh1d3ZsbnB0aHZyYmZobHB1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDUyMTA1NywiZXhwIjoyMTEwMDk3MDU3fQ.s4Ln8NdDdXxdF86mgyXSeQ-_LbtxOhtqJ3CpFMNqxxY';

export const supabaseAuthAdmin = createClient(
    authSupabaseUrl,
    PLASTICIN_SERVICE_ROLE_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'memcut.plasticin_admin.auth.token',
        }
    }
);

/**
 * Synchronizes a verified ecosystem password into Central Plasticin Master Auth (igrxuwvlnpthvrbfhlpu)
 * so the user can seamlessly authenticate anywhere in the unified ecosystem.
 */
export async function syncPasswordToPlasticinMaster(email: string, password: string): Promise<boolean> {
    try {
        const cleanEmail = email.trim().toLowerCase();
        const { data: { users }, error: listErr } = await supabaseAuthAdmin.auth.admin.listUsers();
        if (listErr || !users) {
            console.warn('[Supabase] listUsers failed during sync:', listErr);
            return false;
        }

        const targetUser = users.find(u => u.email?.toLowerCase() === cleanEmail);
        if (!targetUser) {
            console.warn('[Supabase] Target user not found for password sync:', cleanEmail);
            return false;
        }

        const isSuperadmin = cleanEmail === 'minimalmassive@gmail.com';
        const finalHandle = isSuperadmin ? '@acidplasticine' : (targetUser.user_metadata?.username || `@${cleanEmail.split('@')[0]}`);
        const finalName = isSuperadmin ? 'acidplasticine' : (targetUser.user_metadata?.full_name || cleanEmail.split('@')[0]);

        const { error: updateErr } = await supabaseAuthAdmin.auth.admin.updateUserById(targetUser.id, {
            password,
            user_metadata: {
                ...targetUser.user_metadata,
                username: finalHandle,
                user_name: finalHandle,
                full_name: finalName,
                display_name: finalName,
            }
        });

        if (updateErr) {
            console.warn('[Supabase] updateUserById failed during sync:', updateErr);
            return false;
        }

        // Also ensure public.plasticin_users table in Master DB has the canonical handle
        if (isSuperadmin) {
            try {
                await supabaseAuthAdmin.from('plasticin_users').upsert({
                    id: targetUser.id,
                    username: '@acidplasticine',
                    display_name: 'acidplasticine',
                    email: cleanEmail,
                    avatar_url: 'https://plasticin.com/default-avatar.png',
                    origin_app: 'plasticin.com',
                }, { onConflict: 'email' });
            } catch (pErr) {
                console.warn('[Supabase] plasticin_users upsert notice:', pErr);
            }
        }

        return true;
    } catch (err) {
        console.warn('[Supabase] syncPasswordToPlasticinMaster exception:', err);
        return false;
    }
}


