/**
 * plasticinSso.ts — Memcut
 * Standard OAuth 2.1 (RFC 7636 PKCE S256) & OpenID Connect Central Client
 * Connects Memcut to Central Plasticin IdP (https://plasticin.com).
 * Strictly NO purple/pink colors.
 */

import { supabaseAuth } from './supabase';

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
    supabase_access_token?: string;
    supabase_refresh_token?: string;
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

    const authUrl = new URL(`${PLASTICIN_BASE_URL}/api/oauth/authorize`);
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

        // Strict CSRF state verification: returnedState MUST be present and match an initiated flow
        if (!returnedState) {
            throw new Error('Missing CSRF state parameter in callback response.');
        }

        const rawFlow = sessionStorage.getItem(`plasticin_flow_${returnedState}`) ||
                        localStorage.getItem(`plasticin_flow_${returnedState}`);
        if (rawFlow) {
            try {
                const parsed = JSON.parse(rawFlow);
                if (parsed?.state === returnedState && parsed?.verifier) {
                    verifier = parsed.verifier;
                    storedRedirectUri = parsed.redirectUri || storedRedirectUri;
                }
            } catch {}
        }

        if (!verifier) {
            const fallbackState = sessionStorage.getItem('plasticin_sso_state') || localStorage.getItem('plasticin_sso_state');
            if (fallbackState === returnedState) {
                verifier = sessionStorage.getItem('plasticin_sso_verifier') || localStorage.getItem('plasticin_sso_verifier');
                storedRedirectUri = sessionStorage.getItem('plasticin_sso_redirect_uri') || localStorage.getItem('plasticin_sso_redirect_uri') || storedRedirectUri;
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

        try {
            if (tokens.access_token) {
                sessionStorage.setItem('plasticin_oidc_access_token', tokens.access_token);
                localStorage.setItem('plasticin_oidc_access_token', tokens.access_token);
            }
            if (user) {
                localStorage.setItem('plasticin_sso_user', JSON.stringify(user));
            }
        } catch {}

        // 1. Establish official Central Supabase session via server-side OIDC session bridge
        try {
            const bridgeRes = await fetch(`${PLASTICIN_BASE_URL}/api/oauth/session-bridge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(tokens.access_token ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
                },
                body: JSON.stringify({
                    idToken: tokens.id_token,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.supabase_refresh_token || tokens.refresh_token,
                }),
            });

            if (bridgeRes.ok) {
                const bridgeData = await bridgeRes.json();
                if (bridgeData?.token_hash) {
                    await supabaseAuth.auth.verifyOtp({
                        token_hash: bridgeData.token_hash,
                        type: 'magiclink',
                    });
                } else if (bridgeData?.access_token || tokens.supabase_access_token) {
                    const sbAccess = bridgeData?.access_token || tokens.supabase_access_token || '';
                    const sbRefresh = bridgeData?.refresh_token || tokens.supabase_refresh_token || tokens.refresh_token || '';
                    if (sbAccess && !sbAccess.startsWith('eyJhbGciOiJFUzI1NiI')) {
                        try {
                            await supabaseAuth.auth.setSession({
                                access_token: sbAccess,
                                refresh_token: sbRefresh,
                            });
                        } catch (setErr) {
                            console.warn('[PlasticinSSO] Supabase local session hydration notice:', setErr);
                        }
                    }
                }
            }
        } catch (bridgeErr) {
            console.warn('[PlasticinSSO] Session bridge notice (continuing with verified OIDC claims):', bridgeErr);
        }

        // 2. Save non-sensitive recognized account hint for UI convenience
        const cleanUser = user.preferred_username || user.email.split('@')[0];
        const accountData = {
            username: cleanUser.startsWith('@') ? cleanUser : `@${cleanUser}`,
            cleanUsername: cleanUser.replace(/^@+/, ''),
            email: user.email.toLowerCase(),
            displayName: user.name || cleanUser.replace(/^@+/, ''),
            avatarUrl: user.picture || 'https://plasticin.com/default-avatar.png',
            hasPassword: true,
        };
        try {
            localStorage.setItem('plasticin_last_account', JSON.stringify(accountData));
            localStorage.setItem('memcut_local_owner_id', user.sub);
        } catch {}

        const result = { tokens, user };
        lastExchangedCode = code;
        lastExchangeResult = result;
        return result;
    })().finally(() => {
        inFlightExchange = null;
    });

    return inFlightExchange;
}
