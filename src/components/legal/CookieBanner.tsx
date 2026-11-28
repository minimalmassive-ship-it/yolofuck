import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Cookie, Sliders, X } from 'lucide-react';
import {
  getCookiePreferences,
  setCookiePreferences,
  isGlobalPrivacyControlActive,
} from '../../lib/cookieConsent';
import './MemcutLegalLayout.css';

export const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const gpcActive = isGlobalPrivacyControlActive();
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const syncTheme = () => {
      try {
        const legalTheme = window.localStorage.getItem('memcut_legal_theme');
        const prefersLight =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-color-scheme: light)').matches;
        const onLegalPage = Boolean(document.querySelector('.memcut-legal-page'));
        setIsLightMode(onLegalPage ? legalTheme === 'light' : legalTheme === 'light' || (!legalTheme && prefersLight));
      } catch {
        setIsLightMode(false);
      }
    };
    syncTheme();

    const timer = window.setTimeout(() => {
      const existing = getCookiePreferences();
      if (!existing) {
        setIsVisible(true);
      }
    }, 0);

    const handleRevoke = () => {
      setIsVisible(true);
      setShowCustomize(false);
    };

    window.addEventListener('memcut-cookies-revoked', handleRevoke);
    window.addEventListener('storage', syncTheme);
    window.addEventListener('memcut-theme-changed', syncTheme);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('memcut-cookies-revoked', handleRevoke);
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('memcut-theme-changed', syncTheme);
    };
  }, []);

  if (!isVisible) return null;

  const handleAcceptAll = () => {
    setCookiePreferences(true);
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    setCookiePreferences(false);
    setIsVisible(false);
  };

  const handleSaveCustom = () => {
    setCookiePreferences(analyticsEnabled);
    setIsVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Memcut Storage and Cookie Preferences"
      className={`memcut-cookie-banner ${isLightMode ? 'memcut-cookie-banner--light' : ''}`}
    >
      <div className="memcut-cookie-card">
        <div className="memcut-cookie-header">
          <div className="memcut-cookie-icon">
            <Cookie size={18} />
          </div>
          <div>
            <span className="memcut-cookie-pill">Privacy &amp; GDPR / PKE Art. 399</span>
            <h3>Your Privacy &amp; Storage Choices</h3>
          </div>
        </div>

        <p className="memcut-cookie-desc">
          Memcut uses strictly necessary local storage (IndexedDB journal cache, Plasticin ID SSO tokens)
          to run reliably on web and mobile PWA. Optional diagnostics run only with your consent. Read our{' '}
          <Link to="/cookies">Cookie Policy</Link> and <Link to="/privacy">Privacy Policy</Link>.
          {gpcActive && (
            <span style={{ display: 'block', marginTop: '4px', opacity: 0.85 }}>
              Global Privacy Control (GPC) / DNT detected &mdash; optional diagnostics stay disabled.
            </span>
          )}
        </p>

        {showCustomize && (
          <div className="memcut-cookie-prefs">
            <div className="memcut-cookie-pref-row">
              <div>
                <strong>Strictly Necessary</strong>
                <span>Plasticin ID authentication, IndexedDB recordings, CSRF/PKCE state.</span>
              </div>
              <span className="memcut-cookie-req-badge">Active</span>
            </div>
            <div className="memcut-cookie-pref-row">
              <div>
                <strong>Optional Diagnostics</strong>
                <span>Performance metrics and aggregate usage diagnostics.</span>
              </div>
              <label className="memcut-cookie-toggle">
                <input
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                />
                <span>{analyticsEnabled ? 'On' : 'Off'}</span>
              </label>
            </div>
          </div>
        )}

        <div className="memcut-cookie-actions">
          {showCustomize ? (
            <>
              <button type="button" onClick={handleSaveCustom} className="memcut-cookie-btn-primary">
                <Check size={14} />
                <span>Save Preferences</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCustomize(false)}
                className="memcut-cookie-btn-secondary"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={handleAcceptAll} className="memcut-cookie-btn-primary">
                <Check size={14} />
                <span>Accept All</span>
              </button>
              <button
                type="button"
                onClick={handleEssentialOnly}
                className="memcut-cookie-btn-secondary"
              >
                <X size={14} />
                <span>Essential Only</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                className="memcut-cookie-btn-ghost"
              >
                <Sliders size={14} />
                <span>Customize</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
