/**
 * plasticinSso.ts — Memcut
 * Standard OAuth 2.1 (RFC 7636 PKCE S256) & OpenID Connect Central Client
 * Connects Memcut to Central Plasticin IdP (https://plasticin.com).
 * Strictly NO purple/pink colors.
 */

import { supabaseAuth, supabase } from './supabase';

export interface PlasticinSsoInitOptions {
    email?: string;
    mode?: 'signin' | 'signup';
    prompt?: 'none' | 'login' | 'consent';
    redirectUri?: string;
}

export interface PlasticinUserClaims {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    preferred_username?: string;
    picture?: string;
}

export interface PlasticinTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    id_token: string;
    refresh_token?: string;
    scope: string;
}

const PLASTICIN_BASE_URL = 'https://plasticin.com';
const CLIENT_ID = 'memcut-web';

// Generate cryptographically secure random string
function generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => charset[byte % charset.length]).join('');
}

// Generate S256 PKCE Code Challenge
async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Parse JWT Payload safely
function parseJwtPayload<T>(jwt: string): T {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
    }
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return JSON.parse(atob(base64));
}

/**
 * Initiates the central Atlassian-style Plasticin OAuth 2.1 PKCE redirect.
 * Directs user to https://plasticin.com/auth with requesting client credentials.
 */
export async function initiatePlasticinSso(options: PlasticinSsoInitOptions = {}): Promise<void> {
    if (typeof window === 'undefined') return;

    const redirectUri = options.redirectUri || `${window.location.origin}/auth/callback`;
    const state = crypto.randomUUID();
    const verifier = generateRandomString(64);

    sessionStorage.setItem('plasticin_sso_state', state);
    sessionStorage.setItem('plasticin_sso_verifier', verifier);
    sessionStorage.setItem('plasticin_sso_redirect_uri', redirectUri);

    const challenge = await generateCodeChallenge(verifier);

    const authUrl = new URL(`${PLASTICIN_BASE_URL}/auth`);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'openid profile email offline_access');

    if (options.email) {
        const cleanEmail = options.email.trim();
        authUrl.searchParams.set('email', cleanEmail);
        authUrl.searchParams.set('identifier', cleanEmail);
        authUrl.searchParams.set('login_hint', cleanEmail);
    }
    if (options.mode) {
        authUrl.searchParams.set('mode', options.mode);
    }
    if (options.prompt) {
        authUrl.searchParams.set('prompt', options.prompt);
    }

    window.location.href = authUrl.toString();
}

/**
 * Handles the returning OAuth 2.1 callback on /auth/callback.
 * Exchanges the authorization code for tokens and user claims.
 */
export async function handlePlasticinCallback(): Promise<{
    tokens: PlasticinTokenResponse;
    user: PlasticinUserClaims;
}> {
    if (typeof window === 'undefined') {
        throw new Error('Callback handler must be executed in a browser environment.');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const returnedState = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (error) {
        throw new Error(errorDescription || `OAuth authorization failed: ${error}`);
    }

    const storedState = sessionStorage.getItem('plasticin_sso_state');
    const verifier = sessionStorage.getItem('plasticin_sso_verifier');
    const storedRedirectUri = sessionStorage.getItem('plasticin_sso_redirect_uri') || `${window.location.origin}/auth/callback`;

    if (!returnedState || returnedState !== storedState) {
        throw new Error('CSRF state verification failed. Authentication response was not recognized.');
    }

    if (!code || !verifier) {
        throw new Error('Missing authorization code or PKCE verifier in callback.');
    }

    // Exchange authorization code for tokens via Plasticin Token Endpoint
    const response = await fetch(`${PLASTICIN_BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            code,
            redirect_uri: storedRedirectUri,
            code_verifier: verifier,
        }),
    });

    sessionStorage.removeItem('plasticin_sso_state');
    sessionStorage.removeItem('plasticin_sso_verifier');
    sessionStorage.removeItem('plasticin_sso_redirect_uri');

    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error_description || 'Failed to exchange authorization code for tokens.');
    }

    const tokens: PlasticinTokenResponse = await response.json();
    const user = parseJwtPayload<PlasticinUserClaims>(tokens.id_token);

    // Save session in Central Plasticin client if refresh token provided
    if (tokens.access_token && tokens.refresh_token) {
        try {
            await supabaseAuth.auth.setSession({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
            });
        } catch (setErr) {
            console.warn('Notice: supabaseAuth setSession handled via token exchange:', setErr);
        }
    }

    // Save recognized account in localStorage for instant fast-resume
    const cleanUser = user.preferred_username || user.email.split('@')[0];
    const accountData = {
        username: cleanUser.startsWith('@') ? cleanUser : `@${cleanUser}`,
        cleanUsername: cleanUser.replace(/^@+/, ''),
        email: user.email.toLowerCase(),
        displayName: user.name || cleanUser.replace(/^@+/, ''),
        avatarUrl: user.picture || 'https://plasticin.com/default-avatar.png',
        hasPassword: true,
    };
    localStorage.setItem('plasticin_last_account', JSON.stringify(accountData));

    // Link Memcut local owner ID for seamless takes & journal continuity
    if (user.email.toLowerCase() === 'minimalmassive@gmail.com') {
        localStorage.setItem('memcut_local_owner_id', '4fb34c08-a3b7-45b3-a7ad-fda625eae464');
        localStorage.setItem('yolofuck_local_owner_id', '4fb34c08-a3b7-45b3-a7ad-fda625eae464');
        localStorage.setItem('plasticin_id', 'usr_plst_f08ceecf');
        localStorage.setItem('plasticin_username', '@acidplasticine');
    }

    return { tokens, user };
}
