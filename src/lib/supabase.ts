/**
 * supabase.ts — Memcut
 * Dedicated Database & Unified Auth Architecture:
 * 1. Dedicated Memcut Database & Storage (ngzffnpyrqpjxuxkjvnl):
 *    - Stores user accounts, profiles, passwords, sessions, journal_clips, journal_entries,
 *      shared_stories, and video/image storage buckets.
 */

import { createClient } from '@supabase/supabase-js';

// ── Dedicated Memcut Database & Media Supabase (ngzffnpyrqpjxuxkjvnl) ─────────
const DEFAULT_URL = 'https://ngzffnpyrqpjxuxkjvnl.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_OTOXvTGJejxfXyClIEPjmg_vmx6tjy_';

export const dataSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
export const dataSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

export const authSupabaseUrl = dataSupabaseUrl;
export const authSupabaseAnonKey = dataSupabaseAnonKey;

// Migrate legacy auth token to memcut-auth-token so logged-in users are not signed out
if (typeof window !== 'undefined') {
    try {
        const legacyToken = localStorage.getItem('yolofuck-auth-token');
        if (legacyToken && !localStorage.getItem('memcut-auth-token')) {
            localStorage.setItem('memcut-auth-token', legacyToken);
        }
    } catch {}
}

// Primary client for Memcut data tables, storage buckets & auth session
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

// Auth client: strictly reuses the primary client to avoid multiple GoTrueClient instances
// and ensure all auth tokens and session refreshes target the dedicated Memcut database.
export const supabaseAuth = supabase;

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
