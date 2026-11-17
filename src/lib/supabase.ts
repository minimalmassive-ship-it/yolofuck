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

