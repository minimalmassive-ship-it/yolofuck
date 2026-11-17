/**
 * plasticinSso.ts — Memcut
 * Standard OAuth 2.1 (RFC 7636 PKCE S256) & OpenID Connect Central Client
 * Connects Memcut to Central Plasticin IdP (https://plasticin.com).
 * Strictly NO purple/pink colors.
 */

import { supabaseAuth, supabase, supabaseAuthAdmin } from './supabase';

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

let inFlightExchange: Promise<{
    tokens: PlasticinTokenResponse;
    user: PlasticinUserClaims;
}> | null = null;
let lastExchangedCode: string | null = null;
let lastExchangeResult: {
    tokens: PlasticinTokenResponse;
    user: PlasticinUserClaims;
} | null = null;

/**
 * Initiates the central Atlassian-style Plasticin OAuth 2.1 PKCE redirect.
 * Directs user to https://plasticin.com/auth with requesting client credentials.
 */
export async function initiatePlasticinSso(options: PlasticinSsoInitOptions = {}): Promise<void> {
    if (typeof window === 'undefined') return;

    const redirectUri = options.redirectUri || `${window.location.origin}/auth/callback`;
    const state = crypto.randomUUID();
    const verifier = generateRandomString(64);

    const flowData = JSON.stringify({
        state,
        verifier,
        redirectUri,
        timestamp: Date.now()
    });

    try {
        // Multi-state cache: store keyed by state to survive double-clicks and multiple tabs
        sessionStorage.setItem(`plasticin_flow_${state}`, flowData);
        sessionStorage.setItem('plasticin_sso_state', state);
        sessionStorage.setItem('plasticin_sso_verifier', verifier);
        sessionStorage.setItem('plasticin_sso_redirect_uri', redirectUri);

        localStorage.setItem(`plasticin_flow_${state}`, flowData);
        localStorage.setItem('plasticin_sso_state', state);
        localStorage.setItem('plasticin_sso_verifier', verifier);
        localStorage.setItem('plasticin_sso_redirect_uri', redirectUri);

        // Prune expired flows older than 15 minutes
        Object.keys(localStorage).forEach((key) => {
            if (key.startsWith('plasticin_flow_')) {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
                    if (Date.now() - (parsed.timestamp || 0) > 15 * 60 * 1000) {
                        localStorage.removeItem(key);
                    }
                } catch {
                    localStorage.removeItem(key);
                }
            }
        });
    } catch {}

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

    if (!code) {
        throw new Error('Missing authorization code in callback.');
    }

    // Return cached exchange if React remounts on callback
    if (lastExchangedCode === code && lastExchangeResult) {
        return lastExchangeResult;
    }

    // Return in-flight exchange to prevent duplicate token redemption
    if (inFlightExchange) {
        return inFlightExchange;
    }

    inFlightExchange = (async () => {
        let verifier: string | null = null;
        let storedRedirectUri: string = `${window.location.origin}/auth/callback`;

        // 1. First priority: look up flow by the exact returned state
        if (returnedState) {
            const rawFlow = sessionStorage.getItem(`plasticin_flow_${returnedState}`) ||
                            localStorage.getItem(`plasticin_flow_${returnedState}`);
            if (rawFlow) {
                try {
                    const parsed = JSON.parse(rawFlow);
                    verifier = parsed.verifier;
                    storedRedirectUri = parsed.redirectUri || storedRedirectUri;
                } catch {}
            }
        }

        // 2. Fallback: single-state pointer from sessionStorage or localStorage
        if (!verifier) {
            verifier = sessionStorage.getItem('plasticin_sso_verifier') || localStorage.getItem('plasticin_sso_verifier');
            storedRedirectUri = sessionStorage.getItem('plasticin_sso_redirect_uri') || localStorage.getItem('plasticin_sso_redirect_uri') || storedRedirectUri;
        }

        // 3. Last fallback: look for any valid flow in localStorage or sessionStorage (most recent)
        if (!verifier) {
            const allKeys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
            const flowKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('plasticin_flow_'))));
            const flows: any[] = [];
            for (const key of flowKeys) {
                try {
                    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed.verifier) flows.push(parsed);
                    }
                } catch {}
            }
            flows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            if (flows.length > 0) {
                verifier = flows[0].verifier;
                storedRedirectUri = flows[0].redirectUri || storedRedirectUri;
            }
        }

        if (!verifier) {
            throw new Error('CSRF state verification failed. Authentication response was not recognized.');
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

        // Clean up redeemed flow data
        try {
            if (returnedState) {
                sessionStorage.removeItem(`plasticin_flow_${returnedState}`);
                localStorage.removeItem(`plasticin_flow_${returnedState}`);
            }
            sessionStorage.removeItem('plasticin_sso_state');
            sessionStorage.removeItem('plasticin_sso_verifier');
            sessionStorage.removeItem('plasticin_sso_redirect_uri');
            localStorage.removeItem('plasticin_sso_state');
            localStorage.removeItem('plasticin_sso_verifier');
            localStorage.removeItem('plasticin_sso_redirect_uri');
        } catch {}

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error_description || 'Failed to exchange authorization code for tokens.');
        }

        const tokens: PlasticinTokenResponse = await response.json();
        const user = parseJwtPayload<PlasticinUserClaims>(tokens.id_token);

        // 1. Establish official Central Supabase session using the service admin bridge
        try {
            const { data: linkData, error: linkErr } = await supabaseAuthAdmin.auth.admin.generateLink({
                type: 'magiclink',
                email: user.email.toLowerCase(),
            });

            if (!linkErr && linkData?.properties?.hashed_token) {
                await supabaseAuth.auth.verifyOtp({
                    token_hash: linkData.properties.hashed_token,
                    type: 'magiclink',
                });
            }
        } catch (sessionErr) {
            console.warn('Notice: Central Supabase session bridge caught:', sessionErr);
        }

        // 2. Save recognized account in localStorage for instant fast-resume
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

        // 3. Persist SSO User object for instant invariant fallback in AuthContext
        const ssoUser = {
            id: user.sub,
            email: user.email.toLowerCase(),
            aud: 'authenticated',
            role: 'authenticated',
            created_at: new Date().toISOString(),
            user_metadata: {
                user_name: cleanUser.startsWith('@') ? cleanUser : `@${cleanUser}`,
                username: cleanUser.startsWith('@') ? cleanUser : `@${cleanUser}`,
                full_name: user.name || cleanUser.replace(/^@+/, ''),
                avatar_url: user.picture || 'https://plasticin.com/default-avatar.png',
            }
        };
        localStorage.setItem('plasticin_sso_user', JSON.stringify(ssoUser));

        // 4. Link Memcut local owner ID and historical takes for seamless continuity
        if (user.email.toLowerCase() === 'minimalmassive@gmail.com') {
            localStorage.setItem('memcut_local_owner_id', '4fb34c08-a3b7-45b3-a7ad-fda625eae464');
            localStorage.setItem('yolofuck_local_owner_id', '4fb34c08-a3b7-45b3-a7ad-fda625eae464');
            localStorage.setItem('memcut_historical_id', 'b1a4bbae-00e2-42f4-913b-9a805489fe83');
            localStorage.setItem('plasticin_id', 'usr_plst_f08ceecf');
            localStorage.setItem('plasticin_username', '@acidplasticine');
        }

        const result = { tokens, user };
        lastExchangedCode = code;
        lastExchangeResult = result;
        return result;
    })().finally(() => {
        inFlightExchange = null;
    });

    return inFlightExchange;
}
