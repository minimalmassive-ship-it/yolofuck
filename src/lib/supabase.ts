/**
 * supabase.ts — yolofuck
 * Dedicated Database & Unified Auth Architecture:
 * 1. Dedicated Yolofuck Database & Storage (ngzffnpyrqpjxuxkjvnl):
 *    - Stores user accounts, profiles, passwords, sessions, journal_clips, journal_entries,
 *      shared_stories, projects, and video/image storage buckets.
 * 2. Optional Central Auth Supabase:
 *    - Defaults to Yolofuck dedicated Supabase so existing accounts (yolofuck@gmail.com,
 *      minimalmassive@gmail.com) authenticate against their actual home database.
 */

import { createClient } from '@supabase/supabase-js';

// ── Dedicated Yolofuck Database & Media Supabase (ngzffnpyrqpjxuxkjvnl) ─────────
const DEFAULT_URL = 'https://ngzffnpyrqpjxuxkjvnl.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_OTOXvTGJejxfXyClIEPjmg_vmx6tjy_';

export const dataSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
export const dataSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

export const authSupabaseUrl = dataSupabaseUrl;
export const authSupabaseAnonKey = dataSupabaseAnonKey;

// Primary client for Yolofuck data tables, storage buckets & auth session
export const supabase = createClient(
    dataSupabaseUrl,
    dataSupabaseAnonKey,
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

export const supabaseData = supabase;

// Auth client: strictly reuses the primary client to avoid multiple GoTrueClient instances
// and ensure all auth tokens and session refreshes target the dedicated Yolofuck database.
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
            storageKey: 'yolofuck.public.auth.token',
        }
    }
);
