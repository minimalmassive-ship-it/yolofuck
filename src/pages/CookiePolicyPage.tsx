import React from 'react';
import { Cookie, Sliders } from 'lucide-react';
import { MemcutLegalLayout, MemcutLegalSectionLink } from '../components/legal/MemcutLegalLayout';
import { ObfuscatedEmail } from '../components/legal/ObfuscatedEmail';
import { revokeCookieConsent } from '../lib/cookieConsent';

const legalSections: readonly MemcutLegalSectionLink[] = [
  { id: 'overview', label: 'Overview & Local Storage First' },
  { id: 'section-1', label: '01. Statutory Framework (PKE 2024)' },
  { id: 'section-2', label: '02. Cookies, LocalStorage & IndexedDB Inventory' },
  { id: 'section-3', label: '03. Withdraw Consent & Browser Controls' },
];

export const CookiePolicyPage: React.FC = () => {
  return (
    <MemcutLegalLayout
      activeDoc="cookies"
      badgeText="Polish PKE Art. 399–401 · EU ePrivacy · GDPR · Offline PWA"
      badgeIcon={<Cookie size={14} />}
      title="Cookie, IndexedDB &amp; Local Storage Policy"
      effectiveDate="November 28, 2026"
      lastUpdated="November 28, 2026"
      version="Version 1.0 · PKE 2024 Compliant"
      statusPill="Zero Ad-Brokers"
      summaryTitle="How Memcut Stores Sessions, Friends Lists &amp; Offline Video Takes"
      summaryBody={
        <p>
          Memcut deploys zero third-party advertising cookies. Strictly necessary browser keys manage your <strong>Plasticin ID OAuth/SSO</strong> login, PWA UI state, Friends list cache, WebCrypto BYOK key storage, and consent proof (<code>memcut_cookie_consent</code>), while <strong>IndexedDB</strong> optionally stores local-only video takes right on your device.
        </p>
      }
      sections={legalSections}
      footerContactTitle="Preference Management & Storage Inquiries"
      footerContactDescription="Reset cookie consent below or direct device-storage questions to"
      nextDoc={{ id: 'dpa', label: 'Data Processing Addendum (DPA)' }}
    >
      <section id="section-1" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">01.</span> Polish PKE Art. 399–401 &amp; ePrivacy Compliance
        </h2>
        <p>
          In accordance with <strong>Articles 399–401 of the Polish Electronic Communications Law</strong> (<em>Prawo komunikacji elektronicznej</em> of 12 July 2024, Dz.U. 2024 poz. 1221), EU Directive 2002/58/EC Art. 5(3), and GDPR Art. 6(1)(a), storage outside strictly necessary functionality requires clear advance notice and affirmative opt-in consent.
        </p>
      </section>

      <section id="section-2" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">02.</span> Exhaustive Inventory of Memcut Storage Keys
        </h2>
        <div className="memcut-legal-table-wrap">
          <table className="memcut-legal-table">
            <thead>
              <tr>
                <th>Key / Database</th>
                <th>Mechanism &amp; Scope</th>
                <th>Category</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>sb-*-auth-token</code>, <code>memcut-auth-token</code>, <code>plasticin-auth-token</code>, <code>yolofuck-auth-token</code> &amp; <code>plasticin_oidc_access_token</code></td>
                <td><code>localStorage</code> / Cookie</td>
                <td>Strictly Necessary</td>
                <td>Maintains authenticated Plasticin ID / Supabase Auth session and federated OIDC tokens.</td>
              </tr>
              <tr>
                <td><code>plasticin_sso_verifier</code>, <code>plasticin_sso_state</code>, <code>plasticin_sso_user</code>, <code>plasticin_sso_redirect_uri</code></td>
                <td><code>localStorage</code> / Session</td>
                <td>Strictly Necessary (Transient)</td>
                <td>Enforces PKCE S256 code verifier, anti-CSRF state, and OAuth return handshake during SSO login.</td>
              </tr>
              <tr>
                <td><code>memcut_encrypted_byok_v1_*</code> &amp; IndexedDB <code>memcut_byok_aes_key_v1_*</code></td>
                <td><code>localStorage</code> + IndexedDB</td>
                <td>Strictly Necessary (Security Vault)</td>
                <td>Stores user-supplied BYOK AI/STT API keys locally encrypted with a device WebCrypto AES-256-GCM key instead of plain cloud database JSON.</td>
              </tr>
              <tr>
                <td><code>memcut_active_org_*</code>, <code>memcut_active_workspace_*</code>, <code>memcut_organizations</code>, <code>plasticin_active_org_*</code></td>
                <td><code>localStorage</code></td>
                <td>Strictly Necessary (Tenant State)</td>
                <td>Synchronizes active Organization workspace and Chat channels across Plasticin apps.</td>
              </tr>
              <tr>
                <td><code>memcut_local_owner_id</code></td>
                <td><code>localStorage</code></td>
                <td>Strictly Necessary (Local Ownership)</td>
                <td>Links locally recorded drafts to the device profile before sign-in sync.</td>
              </tr>
              <tr>
                <td><code>memcut_cookie_consent</code></td>
                <td><code>localStorage</code> &amp; Cookie (365d)</td>
                <td>Strictly Necessary</td>
                <td>Stores versioned consent choice under Polish PKE Art. 399.</td>
              </tr>
              <tr>
                <td><code>memcut_local_storage</code> (legacy <code>yolofuck_local_storage</code>)</td>
                <td>Browser IndexedDB (Persistent)</td>
                <td>Strictly Necessary (User Media)</td>
                <td>Holds client-side recorded 9:16 video blobs in Local Storage Only mode.</td>
              </tr>
              <tr>
                <td><code>memcut_friends_list</code></td>
                <td><code>localStorage</code></td>
                <td>Functional Feature State</td>
                <td>Caches added friend connections for Friends story sharing.</td>
              </tr>
              <tr>
                <td><code>plasticin_last_account</code></td>
                <td><code>localStorage</code></td>
                <td>Functional Convenience</td>
                <td>Optional fast-resume login hint on landing screen.</td>
              </tr>
              <tr>
                <td><code>memcut_legal_theme</code></td>
                <td><code>localStorage</code></td>
                <td>Functional Preference</td>
                <td>Stores Light / Dark theme preference for Memcut Legal pages.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="section-3" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">03.</span> Withdraw Consent Anytime &amp; Global Privacy Control
        </h2>
        <p>
          Memcut honors browser <strong>Global Privacy Control (GPC)</strong> signals (<code>navigator.globalPrivacyControl</code> / <code>Sec-GPC: 1</code>) by keeping optional diagnostics suppressed automatically. Resetting your preferences reopens the consent banner immediately (note: clearing site data will also remove unbacked IndexedDB local videos and device-encrypted BYOK keys). Questions? Write to <ObfuscatedEmail preset="plasticin-support" showCopy />.
        </p>
        <div className="memcut-legal-subcard" style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>Reopen Privacy Consent Preferences (GDPR Art. 7(3)):</span>
          <button
            type="button"
            onClick={() => revokeCookieConsent()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--ml-accent)',
              color: 'var(--ml-accent-fg)',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Sliders size={14} />
            <span>Update Cookie Preferences</span>
          </button>
        </div>
      </section>
    </MemcutLegalLayout>
  );
};
