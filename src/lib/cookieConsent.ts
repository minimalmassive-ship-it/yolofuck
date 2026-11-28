/**
 * Cookie and Browser Storage Consent helper for Memcut (memcut.com).
 * Aligned with Polish PKE Art. 399-401, EU ePrivacy Directive, and GDPR.
 */

export interface MemcutCookiePreferences {
  essential: true;
  analytics: boolean;
  timestamp: string;
  version: string;
}

const consentStorageKey = 'memcut_cookie_consent';
const policyVersion = '1.0';

export function isGlobalPrivacyControlActive(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
    navigator.doNotTrack === '1'
  );
}

function setConsentCookie(value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  document.cookie = `${consentStorageKey}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`;
}

export function getCookiePreferences(): MemcutCookiePreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(consentStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MemcutCookiePreferences;
    if (!parsed || parsed.version !== policyVersion) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCookiePreferences(analytics: boolean): void {
  if (typeof window === 'undefined') return;
  const gpcActive = isGlobalPrivacyControlActive();
  const payload: MemcutCookiePreferences = {
    essential: true,
    analytics: gpcActive ? false : Boolean(analytics),
    timestamp: new Date().toISOString(),
    version: policyVersion,
  };
  const serialized = JSON.stringify(payload);
  try {
    window.localStorage.setItem(consentStorageKey, serialized);
    setConsentCookie(serialized);
    window.dispatchEvent(new CustomEvent('memcut-cookies-updated', { detail: payload }));
  } catch {
    // Ignore storage quota errors
  }
}

export function revokeCookieConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(consentStorageKey);
    setConsentCookie('', -1);
    window.dispatchEvent(new CustomEvent('memcut-cookies-revoked'));
  } catch {
    // Ignore
  }
}
