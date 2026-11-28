import React from 'react';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { MemcutLegalLayout, MemcutLegalSectionLink } from '../components/legal/MemcutLegalLayout';
import { ObfuscatedEmail } from '../components/legal/ObfuscatedEmail';

const legalSections: readonly MemcutLegalSectionLink[] = [
  { id: 'overview', label: 'Overview & Local/Cloud Design' },
  { id: 'section-1', label: '01. Controller & Organization DPA' },
  { id: 'section-2', label: '02. Categories of Personal Data' },
  { id: 'section-3', label: '03. Local IndexedDB vs Cloud Sync' },
  { id: 'section-4', label: '04. Speech, BYOK AI & Ecosystem Bridges' },
  { id: 'section-5', label: '05. Subprocessors & Transfers' },
  { id: 'section-6', label: '06. Security & Retention Periods' },
  { id: 'section-7', label: '07. EU/PL, Swiss, Brazil & US Rights' },
];

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <MemcutLegalLayout
      activeDoc="privacy"
      badgeText="GDPR / RODO · Polish UODO · Swiss FADP · LGPD · CCPA / CPRA"
      badgeIcon={<Shield size={14} />}
      title="Privacy Policy"
      effectiveDate="November 28, 2026"
      lastUpdated="November 28, 2026"
      version="Version 1.0 · Multi-Jurisdictional Privacy Notice"
      statusPill="Zero-Sale & On-Device Option"
      summaryTitle="Privacy-By-Design Video Journaling"
      summaryBody={
        <p>
          <strong>Memcut</strong> stores recordings locally in browser IndexedDB whenever Local Storage Only mode is active, never sells personal data, never uses private video journals to train public generative AI models, and transmits voice/text to external STT/LLM engines strictly through user-configured Browser Web Speech API or personal BYOK keys.
        </p>
      }
      sections={legalSections}
      footerContactTitle="Data Protection & Erasure Requests"
      footerContactDescription="Exercise GDPR Art. 15–22 rights, request an account purge, or contact our privacy desk at"
      nextDoc={{ id: 'cookies', label: 'Cookie & Local Storage Policy' }}
    >
      <section id="section-1" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">01.</span> Data Controller &amp; Enterprise Processor Roles
        </h2>
        <p>
          The Data Controller for <strong>memcut.com</strong> under GDPR Art. 4(7) is <strong>Arian Fazel</strong>, seated in{' '}
          <strong>Bydgoszcz, Republic of Poland (EU)</strong>, federated with Plasticin IAM (<code>plasticin.com</code>). Contact our privacy team via <ObfuscatedEmail preset="plasticin-support" showCopy />. Where an Organization provisions managed team rooms or shared stories, the Organization acts as Controller and Memcut acts as Data Processor under our{' '}
          <Link to="/dpa" className="memcut-legal-inline-link">Data Processing Addendum (DPA)</Link>.
        </p>
      </section>

      <section id="section-2" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">02.</span> Categories of Data Processed &amp; Hardware Permissions
        </h2>
        <div className="memcut-legal-subgrid">
          <div className="memcut-legal-subcard">
            <strong style={{ display: 'block', marginBottom: '4px' }}>A. Account &amp; Social Identity</strong>
            Plasticin ID UUID, email, username, avatar URL, Friends list entries, Organization memberships, and Plasticin Chat room participation (GDPR Art. 6(1)(b)).
          </div>
          <div className="memcut-legal-subcard">
            <strong style={{ display: 'block', marginBottom: '4px' }}>B. Recorded Media &amp; Spoken Index</strong>
            9:16 video/audio takes, resolution/bitrate preferences, searchable spoken-word transcripts, Daily Story metadata, Quest tags, and Trash items.
          </div>
          <div className="memcut-legal-subcard">
            <strong style={{ display: 'block', marginBottom: '4px' }}>C. BYOK AI &amp; Transcription Credentials</strong>
            User-configured keys for Deepgram, OpenAI Whisper, Groq, Gladia, AssemblyAI, Google Gemini, DeepSeek, or OpenRouter stored inside user profile settings.
          </div>
          <div className="memcut-legal-subcard">
            <strong style={{ display: 'block', marginBottom: '4px' }}>D. Camera, Microphone &amp; Device Logs</strong>
            Device audio/camera device enumeration only during active capture workflows (`microphonePermissionManager` / `audioDeviceManager`), plus security &amp; CDN telemetry (GDPR Art. 6(1)(f)).
          </div>
        </div>
      </section>

      <section id="section-3" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">03.</span> Local Device IndexedDB vs. Cloud Sync &amp; Shared Stories
        </h2>
        <ul>
          <li><strong>Local Storage Only:</strong> Clips recorded offline/local remain in browser IndexedDB (`memcut_local_storage`) on your hardware until explicitly synced or published. Memcut does <strong>not</strong> run facial recognition or visual biometric identification on video streams.</li>
          <li><strong>Public Story Links (`/story/:slug`):</strong> Turning sharing to Public generates a publicly accessible Story URL viewable without sign-in until you switch visibility back to Stopped or Private.</li>
        </ul>
      </section>

      <section id="section-4" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">04.</span> Speech Transcription, BYOK AI, Chat, NanCat &amp; MCP
        </h2>
        <p>
          If you select <strong>Native Browser Web Speech API</strong>, audio transcription executes locally/through your OS browser speech service without Memcut server intervention. When you configure BYOK APIs (Deepgram, Groq, Google Gemini, OpenAI, DeepSeek, AssemblyAI, Gladia, OpenRouter), audio/transcript payloads transmit directly to those vendor endpoints under your credentials. Embedded Plasticin Chat rooms (`chat.plasticin.com`), Organization directory updates, NanCat clip bridges, and Central MCP Gateway queries (when authorized by you) exchange designated metadata over TLS.
        </p>
      </section>

      <section id="section-5" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">05.</span> Infrastructure Subprocessors &amp; Cross-Border Safeguards
        </h2>
        <div className="memcut-legal-table-wrap">
          <table className="memcut-legal-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Purpose</th>
                <th>Location &amp; Safeguards</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Supabase, Inc.</strong></td>
                <td>PostgreSQL database, RLS tenant isolation, Realtime sockets, storage buckets</td>
                <td>EU / US (DPA, EU SCCs, AES-256)</td>
              </tr>
              <tr>
                <td><strong>Vercel Inc.</strong></td>
                <td>Web &amp; PWA Edge distribution and static hosting</td>
                <td>Global / US (DPF, EU SCCs)</td>
              </tr>
              <tr>
                <td><strong>Cloudflare, Inc.</strong></td>
                <td>CDN, TLS termination, WAF &amp; DDoS protection</td>
                <td>Global / US (DPF, EU SCCs)</td>
              </tr>
              <tr>
                <td><strong>Plasticin Core (`plasticin.com`)</strong></td>
                <td>Plasticin ID OAuth 2.1 authentication, Org directory &amp; embedded Chat Hub</td>
                <td>Poland / EU &amp; EU Cloud (Zero-Trust IAM)</td>
              </tr>
              <tr>
                <td><strong>User-Selected BYOK Engines</strong></td>
                <td>Deepgram, Groq, Gemini, DeepSeek, OpenRouter, OpenAI, Gladia, AssemblyAI</td>
                <td>Direct user-controlled endpoints &amp; vendor terms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="section-6" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">06.</span> Security Controls &amp; Data Retention Schedule
        </h2>
        <ul>
          <li><strong>Security:</strong> PostgreSQL Row-Level Security hardening (`supabase_rls_hardening.sql`), TLS transport encryption, PKCE S256 OAuth, and strict DOM/URL sanitization across chat and story players.</li>
          <li><strong>Local Clips:</strong> Kept in IndexedDB until you delete them or clear browser storage.</li>
          <li><strong>Cloud Takes, Transcripts &amp; Account:</strong> Retained while your account is active until removed from Journal / Trash Bin or full account deletion (plus up to 30 days encrypted backup cycle).</li>
        </ul>
      </section>

      <section id="section-7" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">07.</span> Global Rights, Children under 16 &amp; PUODO Oversight
        </h2>
        <p>
          EU/EEA &amp; UK residents hold GDPR Art. 15–22 rights (access, rectification, erasure, restriction, portability, objection, consent withdrawal). Swiss (FADP), Brazilian (LGPD — 15-day disclosure), and US State residents (California CCPA/CPRA &amp; multi-state laws) enjoy full zero-sale guarantees and automatic honoring of Global Privacy Control (`GPC`) signals.
        </p>
        <p>
          Memcut is prohibited for children under <strong>16</strong>. Confirmed breaches are notified to PUODO within <strong>72 hours</strong>. Polish supervisory authority: <strong>Urząd Ochrony Danych Osobowych (PUODO)</strong>, ul. Stawki 2, 00-193 Warsaw, Poland (<a href="https://uodo.gov.pl/" target="_blank" rel="noopener noreferrer">uodo.gov.pl</a>).
        </p>
      </section>
    </MemcutLegalLayout>
  );
};
