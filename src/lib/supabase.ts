/**
 * supabase.ts — yolofuck
 * Hybrid Multi-Database Architecture:
 * 1. Central Auth (Ideanite / future Plasticin.com SSO):
 *    - Manages user accounts, profiles, passwords, and global sessions.
 * 2. Dedicated Yolofuck Database & Storage (ngzffnpyrqpjxuxkjvnl):
 *    - Stores journal_clips, journal_entries, shared_stories, projects, and video/image storage buckets.
 */

import { createClient } from '@supabase/supabase-js';

// ── 1. Central Auth Supabase (Ideanite / future Plasticin.com SSO) ────────────
const DEFAULT_AUTH_URL = 'https://pemllfgsegqnndesewbx.supabase.co';
const DEFAULT_AUTH_ANON_KEY = 'sb_publishable_5SAjvbisW5QsaG0MAI5s9A_kZNjZ_A-';

export const authSupabaseUrl = import.meta.env.VITE_AUTH_SUPABASE_URL || DEFAULT_AUTH_URL;
export const authSupabaseAnonKey = import.meta.env.VITE_AUTH_SUPABASE_ANON_KEY || DEFAULT_AUTH_ANON_KEY;

export const supabaseAuth = createClient(
    authSupabaseUrl,
    authSupabaseAnonKey,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'yolofuck-auth-token',
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        }
    }
);

// ── 2. Dedicated Yolofuck Data & Media Supabase (ngzffnpyrqpjxuxkjvnl) ─────────
const DEFAULT_DATA_URL = 'https://ngzffnpyrqpjxuxkjvnl.supabase.co';
const DEFAULT_DATA_ANON_KEY = 'sb_publishable_OTOXvTGJejxfXyClIEPjmg_vmx6tjy_';

export const dataSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_DATA_URL;
export const dataSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_DATA_ANON_KEY;

// Primary client for Yolofuck data tables & storage buckets
export const supabase = createClient(
    dataSupabaseUrl,
    dataSupabaseAnonKey,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
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
            storageKey: 'yolofuck.public.auth.token',
        }
    }
);
